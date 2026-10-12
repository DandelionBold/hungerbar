// usage.json, written by the opt-in background refresher and read by the render (SPEC §10, §11).
import { join } from 'node:path';
import { lockLive, readJson } from '../store.ts';

export interface UsageExtra {
  enabled: boolean;
  usedCents: number;
  limitCents: number | null;
  currency: string;
}

export interface UsageScoped {
  name: string;
  pct: number;
  resets_at: number | null;
}

export interface UsageFile {
  v: 1;
  at: number;
  extra: UsageExtra | null;
  scoped: UsageScoped[];
  /** No refresh before this time (401/403, 429 or a transient error). */
  lockUntil: number;
  error?: string;
}

export const usagePath = (acct: string): string => join(acct, 'usage.json');
export const usageLockPath = (acct: string): string => join(acct, 'usage.lock');

export function readUsage(acct: string): UsageFile | null {
  const u = readJson<UsageFile>(usagePath(acct));
  return u && u.v === 1 && typeof u.at === 'number' ? u : null;
}

/** 180 s normally; an hour while there is nothing on the line that changes often. */
export function usageTtl(u: UsageFile | null, ttlSeconds: number, scopedWeekly: boolean): number {
  return u && !u.extra?.enabled && !scopedWeekly ? Math.max(ttlSeconds, 3600) : ttlSeconds;
}

export function usageNeedsRefresh(acct: string, u: UsageFile | null, now: number, ttlSeconds: number, scopedWeekly: boolean): boolean {
  if (u && u.lockUntil > now) return false;
  if (u && now - u.at < usageTtl(u, ttlSeconds, scopedWeekly) && now >= u.at) return false;
  return !lockLive(usageLockPath(acct), 30_000, Date.now());
}
