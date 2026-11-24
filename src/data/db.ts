import Dexie, { type Table } from 'dexie';
import type { CardRecord } from '../analytics/types';

export interface MetaRow {
  key: string;
  value: unknown;
}

export class DashboardDb extends Dexie {
  cards!: Table<CardRecord, string>;
  meta!: Table<MetaRow, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
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

export function dbName(userId: string, pipeId: string): string {
  return `pipefy-dashboard:${userId}:${pipeId}`;
}

export function openDb(userId: string, pipeId: string): DashboardDb {
  return new DashboardDb(dbName(userId, pipeId));
}
