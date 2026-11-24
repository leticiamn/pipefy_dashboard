import Dexie, { type Table } from 'dexie';
import type { CardRecord } from '../analytics/types';

export interface MetaRow {
  key: string;
  value: unknown;
}

/** Versão do formato do cache. Mudou o formato do card? Suba o número e o cache é recriado. */
export const SCHEMA_VERSION = 1;

export class DashboardDb extends Dexie {
  cards!: Table<CardRecord, string>;
  meta!: Table<MetaRow, string>;

  constructor(name: string) {
    super(name);
    this.version(SCHEMA_VERSION).stores({
      cards: '&id, phaseId',
      meta: '&key',
    });
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.meta.get(key))?.value as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.meta.put({ key, value });
  }
}

/** Uma base por usuário e por pipe: dois usuários no mesmo navegador nunca compartilham dados. */
export function dbName(userId: string, pipeId: string): string {
  return `pipefy-dashboard:${userId}:${pipeId}`;
}

export function openDb(userId: string, pipeId: string): DashboardDb {
  return new DashboardDb(dbName(userId, pipeId));
}
