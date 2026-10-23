// The PR status cache (SPEC §0.9, 0.7.0): one small entry per repo and branch, written by the background refresher
// (refresh.ts) and read by the render, stale-while-revalidate. The render reads files only: the entry, and, when it is
// stale, the repo's git config to see that a remote is on GitHub before it asks the refresher for a new answer.
//   - `<cacheDir>/pr/<fnv1a(root + "\n" + branch)>.json`: {v:1, root, branch, at, prAt, pr, why}. `at` is when gh last
//     answered (or failed), `prAt` when `pr` was last confirmed. A passing trouble (a timeout, a network error) keeps
//     the last PR and its prAt, so the badge does not blink out while the network does.
//   - Fresh for PR_TTL (60 s) after `at`, or PR_TTL_LONG (10 min) when gh is missing, not logged in or sees no GitHub
//     remote. A PR is drawn while prAt is under PR_SHOW_MAX (an hour) old, stale or not; after that, nothing.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Env } from '../env.ts';
import { normRoot } from '../git/cache.ts';
import type { Repo } from '../git/head.ts';
import { fnv1a, readJson } from '../store.ts';
import { MAX_PR, PR_WHYS, type PrInfo, type PrWhy } from './gh.ts';

export interface PrEntry {
  v: 1;
  /** normRoot of the repo's root, and the branch: a hash that collides reads as no entry. */
  root: string;
  branch: string;
  at: number;
  prAt: number;
  pr: PrInfo | null;
  why: PrWhy;
}

export const PR_TTL = 60;
export const PR_TTL_LONG = 600;
export const PR_SHOW_MAX = 3600;
export const PR_LOCK_STALE_MS = 30_000;
export const PR_TIMEOUT_MS = 10_000;

const key = (root: string, branch: string): string => fnv1a(normRoot(root) + '\n' + branch);
export const prPath = (cacheDir: string, root: string, branch: string): string => join(cacheDir, 'pr', key(root, branch) + '.json');
export const prLockPath = (cacheDir: string, root: string, branch: string): string => join(cacheDir, 'pr', key(root, branch) + '.lock');

const time = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/** HEAD is on a local branch (refs/heads/…): not detached, and not some other ref, which gh could not find a PR for. */
export function onBranch(repo: Pick<Repo, 'head' | 'detached'>): boolean {
  return !repo.detached && /^ref:\s*refs\/heads\/\S/.test(repo.head);
}

/** A stored PR as read back: the facts when every field is sound, else null. */
export function readPr(v: unknown): PrInfo | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const n = o.n;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > MAX_PR) return null;
  if (o.state !== 'open' && o.state !== 'draft' && o.state !== 'merged' && o.state !== 'closed') return null;
  if (o.ci !== null && o.ci !== 'running' && o.ci !== 'passed' && o.ci !== 'failed') return null;
  if (o.review !== null && o.review !== 'approved' && o.review !== 'changes') return null;
  if (typeof o.conflict !== 'boolean') return null;
  return { n, state: o.state, ci: o.ci, review: o.review, conflict: o.conflict };
}

/** The entry for this repo and branch, or null when it is missing, not one, or another repo's or branch's. */
export function readPrEntry(cacheDir: string, root: string, branch: string): PrEntry | null {
  const e = readJson<Record<string, unknown>>(prPath(cacheDir, root, branch));
  if (!e || e.v !== 1 || e.root !== normRoot(root) || e.branch !== branch || !time(e.at) || !time(e.prAt)) return null;
  if (!PR_WHYS.includes(e.why as PrWhy)) return null;
  const pr = e.pr === null ? null : readPr(e.pr);
  if (e.pr !== null && !pr) return null;
  return { v: 1, root: e.root, branch, at: e.at, prAt: e.prAt, pr, why: e.why as PrWhy };
}

/** How long an answer stands: 10 minutes when gh is missing, not logged in or sees no GitHub remote, else 60 s. */
export function prTtl(why: PrWhy): number {
  return why === 'no-gh' || why === 'auth' || why === 'no-github' ? PR_TTL_LONG : PR_TTL;
}

export function prFresh(e: PrEntry, now: number): boolean {
  return now >= e.at && now - e.at < prTtl(e.why);
}

/** The PR to draw: the entry's, while it was confirmed under an hour ago. */
export function prShown(e: PrEntry | null, now: number): PrInfo | null {
  return e && e.pr && now >= e.prAt && now - e.prAt < PR_SHOW_MAX ? e.pr : null;
}

/** The host of a remote URL (`https://host/…`, `ssh://user@host:22/…`, `user@host:path`), lower case; null for a path. */
export function urlHost(url: string): string | null {
  const u = url.trim();
  const scheme = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]*@)?(\[[^\]]*\]|[^/:?#]*)/i.exec(u);
  if (scheme) return scheme[1]!.toLowerCase() || null;
  const scp = /^(?:[^@/:]+@)?([^/:]+):(?!\/\/)/.exec(u);
  // a Windows drive (C:\repo, C:/repo) is a path, not a host
  return scp && !/^[a-z]$/i.test(scp[1]!) ? scp[1]!.toLowerCase() : null;
}

/**
 * Whether a remote of the repo is on GitHub, from `<commonDir>/config` (read up to 64 KiB, no process): a remote's url
 * or pushurl whose host names GitHub (github.com, an ssh alias such as github-work, a GitHub Enterprise host such as
 * github.example.com), is a *.ghe.com host, or is GH_HOST.
 */
export function githubRemote(commonDir: string, env: Env): boolean {
  let text: string;
  try {
    const p = join(commonDir, 'config');
    const st = statSync(p, { throwIfNoEntry: false });
    if (!st || !st.isFile() || st.size > 65536) return false;
    text = readFileSync(p, 'utf8');
  } catch {
    return false;
  }
  const ghHost = (env.GH_HOST ?? '').trim().toLowerCase();
  let inRemote = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const section = /^\[\s*([^\s\]"]+)/.exec(line);
    if (section) {
      inRemote = section[1]!.toLowerCase() === 'remote';
      continue;
    }
    if (!inRemote) continue;
    const kv = /^(url|pushurl)\s*=\s*(.*)$/i.exec(line);
    if (!kv) continue;
    const host = urlHost(kv[2]!.replace(/^"(.*)"$/, '$1'));
    if (host && (host.includes('github') || host.endsWith('.ghe.com') || host === ghHost)) return true;
  }
  return false;
}
