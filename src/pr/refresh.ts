// `hungerbar refresh pr <root> <branch>`: the background worker behind the HUD's PR status (SPEC §0.9, 0.7.0). It runs
// one `gh pr view --json …` in the repo's root with a hard timeout and writes the answer to the branch's entry. It never
// runs in the render, never with non-essential traffic off, and only on the branch HEAD is on when it starts and when gh
// ends (a checkout meanwhile drops the answer: it may be for either branch).
import { offline, type Env } from '../env.ts';
import { normRoot } from '../git/cache.ts';
import { findRepo } from '../git/head.ts';
import { run } from '../proc.ts';
import { tryLock, unlock, writeJson } from '../store.ts';
import { githubRemote, onBranch, PR_LOCK_STALE_MS, PR_TIMEOUT_MS, prLockPath, prPath, readPrEntry, type PrEntry } from './cache.ts';
import { classify, ghCommand, ghEnv, MAX_OUT, PR_ARGS, resolveGh, type PrInfo, type PrWhy } from './gh.ts';

/** Passing troubles keep the last PR (and when it was confirmed); every other answer replaces it. */
const PASSING: ReadonlySet<PrWhy> = new Set(['error', 'timeout', 'parse']);

/** Asks gh and writes the entry; returns it, or null when nothing was written (offline, locked, or not on `branch`). */
export async function refreshPr(root: string, branch: string, env: Env, cacheDir: string, now: () => number, timeoutMs = PR_TIMEOUT_MS): Promise<PrEntry | null> {
  if (offline(env)) return null;
  const on = (): boolean => {
    const r = findRepo(root);
    return !!r && onBranch(r) && r.branch === branch && normRoot(r.root) === normRoot(root);
  };
  if (!on()) return null;
  const repo = findRepo(root)!;
  if (!githubRemote(repo.commonDir, env)) return null;
  const lock = prLockPath(cacheDir, repo.root, branch);
  if (!tryLock(lock, PR_LOCK_STALE_MS)) return null;
  try {
    const write = (why: PrWhy, pr: PrInfo | null): PrEntry => {
      const t = now(), prev = PASSING.has(why) ? readPrEntry(cacheDir, repo.root, branch) : null;
      const e: PrEntry = { v: 1, root: normRoot(repo.root), branch, at: t, prAt: prev ? prev.prAt : t, pr: prev ? prev.pr : pr, why };
      writeJson(prPath(cacheDir, repo.root, branch), e);
      return e;
    };
    const bin = resolveGh(env);
    if (!bin) return write('no-gh', null);
    let out = '', over = false;
    const [cmd, args] = ghCommand(bin, PR_ARGS);
    const r = await run(cmd, args, ghEnv(env), repo.root, timeoutMs, (d) => {
      if (over || out.length + d.length > MAX_OUT) over = true;
      else out += d;
    }, true);
    if (!on()) return null;
    const c = classify({ ...r, stdout: over ? '' : out });
    return write(c.why, c.pr);
  } finally {
    unlock(lock);
  }
}
