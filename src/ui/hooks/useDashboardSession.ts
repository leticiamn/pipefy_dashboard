import { useCallback, useEffect, useMemo, useState } from 'react';
import { AggregationClient } from '../../analytics/workerClient';
import { type DashboardDb, dbName, openDb } from '../../data/db';
import { SyncEngine, type SyncProgress } from '../../data/sync';
import { CARD_FORMAT, pipeFields } from '../../pipefy/mapCard';
import {
  type FieldMeta,
  PIPE_COUNTS,
  PIPE_META,
  type PipeCountsResponse,
  type PipeMetaResponse,
  USER_TIME_ZONE,
  type UserTimeZoneResponse,
} from '../../pipefy/queries';
import { resolveTimeZone } from '../../lib/dates';
import type { PipefyClient } from '../../pipefy/sdk';

const POLL_MS = 60_000;
const CARD_CHANGE_DEBOUNCE_MS = 3000;

export interface Session {
  userName: string;
  timeZone: string;
  pipeName: string;
  phases: Array<{ id: string; name: string }>;
  fields: FieldMeta[];
  db: DashboardDb;
  sync: SyncEngine;
  expected?: number;
}

function changesUrl(): string | undefined {
  const fromEnv = import.meta.env.VITE_CHANGES_URL as string | undefined;
  if (fromEnv) return fromEnv;
  return import.meta.env.PROD ? new URL('/api/changes', window.location.origin).toString() : undefined;
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useDashboardSession(client: PipefyClient) {
  const agg = useMemo(() => new AggregationClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SyncProgress>({ phase: 'idle', loaded: 0, pages: 0 });
  const [dataVersion, setDataVersion] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const refreshCharts = useCallback(() => {
    agg.invalidate();
    setDataVersion((v) => v + 1);
  }, [agg]);

  useEffect(() => () => agg.terminate(), [agg]);

  useEffect(() => {
    let cancelled = false;
    let poll: number | undefined;
    let debounce: number | undefined;
    let unsubscribe = () => {};

    const run = (task: Promise<void>) =>
      task.then(
        () => !cancelled && setSyncError(null),
        (e) => !cancelled && setSyncError(errorMessage(e)),
      );

    (async () => {
      const [meta, profile] = await Promise.all([
        client.query<PipeMetaResponse>(PIPE_META, { pipeId: client.pipeId }),
        client.query<UserTimeZoneResponse>(USER_TIME_ZONE).catch(() => null),
      ]);
      const timeZone = resolveTimeZone(profile?.me.timeZone);
      const userId = String(meta.me.id);
      const db = openDb(userId, client.pipeId);
      const sync = new SyncEngine(client, db, {
        changesUrl: changesUrl(),
        onProgress: (p) => !cancelled && setProgress(p),
        onData: async () => {
          if (cancelled) return;
          refreshCharts();
          setLastSync(await sync.lastSync());
        },
      });
      await sync.ensureFormat(CARD_FORMAT);
      agg.open(dbName(userId, client.pipeId), timeZone);

      const [counts, cached, last] = await Promise.all([
        client.query<PipeCountsResponse>(PIPE_COUNTS, { pipeId: client.pipeId }).catch(() => null),
        db.cards.count(),
        sync.lastSync(),
      ]);
      if (cancelled) return;

      const expected = counts?.pipe.cards_count;
      setLastSync(last);
      setSession({
        userName: meta.me.name,
        timeZone,
        pipeName: meta.pipe.name,
        phases: meta.pipe.phases.map(({ id, name }) => ({ id, name })),
        fields: pipeFields(meta.pipe),
        db,
        sync,
        expected,
      });
      if (cached > 0) refreshCharts();

      run(sync.start(expected));
      unsubscribe = client.onCardChange(() => {
        window.clearTimeout(debounce);
        debounce = window.setTimeout(() => run(sync.incremental()), CARD_CHANGE_DEBOUNCE_MS);
      });
      poll = window.setInterval(() => {
        if (document.visibilityState === 'visible') run(sync.incremental());
      }, POLL_MS);
    })().catch((e) => !cancelled && setFatal(errorMessage(e)));

    return () => {
      cancelled = true;
      unsubscribe();
      window.clearTimeout(debounce);
      window.clearInterval(poll);
    };
  }, [agg, client, refreshCharts]);

  const reloadAll = useCallback(() => {
    if (!session) return;
    session.sync.reloadAll(session.expected).catch((e) => setSyncError(errorMessage(e)));
  }, [session]);

  return { agg, session, fatal, syncError, progress, dataVersion, lastSync, reloadAll };
}
