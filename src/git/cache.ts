// The diff cache entry written by the background refresher (SPEC §9), with the HUD's git status (SPEC §0.9, 0.7.0).
import { join } from 'node:path';
import { fnv1a, readJson } from '../store.ts';
import { readStatus, type GitStatus } from './status.ts';

export interface GitEntry {
  v: 1;
  at: number;
  head: string;
  indexMtimeMs: number | null;
  edits: string;
  added: number;
  removed: number;
  files: number;
  /**
   * The HUD's `git status --porcelain=v2 --branch` counts, written only when the HUD asked (the refresher's `status`
   * argument): null when that git failed, absent when nobody asked. Classic never asks, and an entry without it (one
   * classic or 0.6.0 wrote) is stale for the HUD.
   */
  st?: GitStatus | null;
}

/** The form of a repo root that gitKey hashes (and the HUD's history file records): slashes, no trailing one, lower case. */
export function normRoot(root: string): string {
  return root.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

export function gitKey(root: string): string {
  return fnv1a(normRoot(root));
}

export function entryPath(cacheDir: string, root: string): string {
  return join(cacheDir, 'git', gitKey(root) + '.json');
}

export function lockPath(cacheDir: string, root: string): string {
  return join(cacheDir, 'git', gitKey(root) + '.lock');
}

/** The entry, or null when it is missing or not one; an `st` that is there but not sound reads as null (git failed). */
export function readEntry(cacheDir: string, root: string): GitEntry | null {
  const e = readJson<GitEntry>(entryPath(cacheDir, root));
  if (!e || e.v !== 1 || typeof e.added !== 'number' || typeof e.removed !== 'number') return null;
  if ('st' in e) e.st = readStatus(e.st);
  return e;
}

/** A commit, a stage or a Claude edit makes the entry stale at once; so does age. */
export function isFresh(e: GitEntry, head: string, indexMtimeMs: number | null, edits: string, now: number, ttl: number): boolean {
  return e.head === head && e.indexMtimeMs === indexMtimeMs && e.edits === edits && now - e.at < ttl && now >= e.at;
}

/** "3 files changed, 1208 insertions(+), 279 deletions(-)"; empty output means clean. */
export function parseShortstat(out: string): { files: number; added: number; removed: number } {
  const n = (re: RegExp): number => Number(re.exec(out)?.[1] ?? 0);
  return { files: n(/(\d+) files? changed/), added: n(/(\d+) insertions?\(\+\)/), removed: n(/(\d+) deletions?\(-\)/) };
}
