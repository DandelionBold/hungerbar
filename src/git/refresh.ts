// `hungerbar refresh git <root> <edits> [status]`: the background worker behind the +/- item (SPEC §9) and, with
// `status` (only the HUD asks), the HUD's git state (SPEC §0.9, 0.7.0): the diff and `git status --porcelain=v2
// --branch` run side by side, each with its own git.timeoutMs, and land in one entry.
import type { Env } from '../env.ts';
import { run } from '../proc.ts';
import { tryLock, unlock, writeJson } from '../store.ts';
import { resolveGit } from './bin.ts';
import { entryPath, lockPath, parseShortstat, type GitEntry } from './cache.ts';
import { findRepo, indexMtime, isUnborn } from './head.ts';
import { statusArgs, statusCounter, type GitStatus } from './status.ts';

export function gitArgs(root: string, unborn: boolean): string[] {
  return ['--no-optional-locks', '-C', root, 'diff', ...(unborn ? ['--cached'] : ['HEAD']), '--shortstat', '--no-ext-diff', '--no-textconv'];
}

/** A HUNGERBAR_GIT_BIN ending in .mjs (the tests' fake git) runs under this node. */
export function gitCommand(bin: string, args: string[]): [string, string[]] {
  return bin.endsWith('.mjs') ? [process.execPath, [bin, ...args]] : [bin, args];
}

export function gitEnv(env: Env): Env {
  return { ...env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never', LC_ALL: 'C', LANG: 'C' };
}

/** The status counts, or null when git failed or ran out of time. */
async function status(bin: string, root: string, env: Env, cacheDir: string, timeoutMs: number): Promise<GitStatus | null> {
  const c = statusCounter();
  const [cmd, args] = gitCommand(bin, statusArgs(root));
  const res = await run(cmd, args, gitEnv(env), cacheDir, timeoutMs, (d) => c.feed(d));
  return res.timedOut || res.code !== 0 ? null : c.done();
}

/**
 * Computes the diff for one repo (and, with `withStatus`, its status) and writes its cache entry; returns the entry, or
 * null when the diff failed (nothing is written). A status that failed is written as `st: null`, so the HUD shows what
 * it knows without asking again before the entry goes stale.
 */
export async function refreshGit(root: string, edits: string, env: Env, cacheDir: string, timeoutMs: number, now: () => number, withStatus = false): Promise<GitEntry | null> {
  const lock = lockPath(cacheDir, root);
  if (!tryLock(lock, 10_000)) return null;
  try {
    const repo = findRepo(root);
    if (!repo) return null;
    // Read before running git, so a change that lands meanwhile still invalidates the entry.
    const head = repo.head, idx = indexMtime(repo), unborn = isUnborn(repo);
    const bin = resolveGit(env, cacheDir);
    if (!bin) return null;
    const [cmd, args] = gitCommand(bin, gitArgs(repo.root, unborn));
    const [res, st] = await Promise.all([run(cmd, args, gitEnv(env), cacheDir, timeoutMs), withStatus ? status(bin, repo.root, env, cacheDir, timeoutMs) : undefined]);
    if (res.timedOut || res.code !== 0) return null;
    const s = parseShortstat(res.stdout);
    const entry: GitEntry = { v: 1, at: now(), head, indexMtimeMs: idx, edits, added: s.added, removed: s.removed, files: s.files };
    if (st !== undefined) entry.st = st;
    writeJson(entryPath(cacheDir, repo.root), entry);
    return entry;
  } finally {
    unlock(lock);
  }
}
