// The HUD's pull request and CI status (SPEC §0.9, 0.7.0): what one background `gh pr view` says about the current
// branch's pull request, read down to the few facts the HUD draws. gh is the user's own GitHub CLI with the user's own
// login: Hungerbar runs it and reads its JSON, and never sees or stores a token. Nothing here runs in the render.
//   - The binary: HUNGERBAR_GH (the tests' stub; one ending in .mjs runs under this node), else the first gh in an
//     absolute PATH entry, as git's is found.
//   - The command: `gh pr view --json number,state,isDraft,mergeable,reviewDecision,statusCheckRollup` in the repo's root,
//     with no branch argument, so gh finds the PR as it does for its own `gh pr view` (a fork's branch included).
//   - The checks are summed as `gh pr status` sums them: a failure wins, then a check still waiting or running, else
//     they passed; STARTUP_FAILURE also counts as failed. No checks at all: no CI mark.
import { findOnPath } from '../git/bin.ts';
import type { Env } from '../env.ts';
import type { RunResult } from '../proc.ts';

/** What the HUD draws of a pull request. */
export interface PrInfo {
  /** Its number, 1 to MAX_PR. */
  n: number;
  state: 'open' | 'draft' | 'merged' | 'closed';
  /** The checks on its head commit: failed, running (one still waits or runs) or passed; null when it has none. */
  ci: 'running' | 'passed' | 'failed' | null;
  /** The review decision: approved, changes requested, or null (none needed yet, or none given). */
  review: 'approved' | 'changes' | null;
  /** GitHub says it conflicts with its base branch (mergeable CONFLICTING). */
  conflict: boolean;
}

/** Why an entry says what it says: ok (a PR), none (no PR for the branch) or why gh could not tell. */
export type PrWhy = 'ok' | 'none' | 'auth' | 'no-gh' | 'no-github' | 'error' | 'timeout' | 'parse';
export const PR_WHYS: readonly PrWhy[] = ['ok', 'none', 'auth', 'no-gh', 'no-github', 'error', 'timeout', 'parse'];

/** The largest PR number drawn: 9 digits keep the badge at most 19 cells, so a cut branch always keeps 10 (gitstate.ts). */
export const MAX_PR = 999_999_999;
/** gh's JSON is read up to this size (a PR with hundreds of checks is well under it); more is a parse error. */
export const MAX_OUT = 4 << 20;

export const PR_FIELDS = 'number,state,isDraft,mergeable,reviewDecision,statusCheckRollup';
export const PR_ARGS: readonly string[] = ['pr', 'view', '--json', PR_FIELDS];

/** HUNGERBAR_GH, else the first gh (gh.exe on Windows) in an absolute PATH entry; null when there is none. */
export function resolveGh(env: Env): string | null {
  if (env.HUNGERBAR_GH) return env.HUNGERBAR_GH;
  return findOnPath(env.PATH ?? env.Path ?? '', 'gh');
}

/** A HUNGERBAR_GH ending in .mjs (the tests' stub) runs under this node. */
export function ghCommand(bin: string, args: readonly string[]): [string, string[]] {
  return bin.endsWith('.mjs') ? [process.execPath, [bin, ...args]] : [bin, [...args]];
}

/** gh with no prompts, no update checks (each one a request to GitHub), no colour and no spinner; git never prompts. */
export function ghEnv(env: Env): Env {
  return {
    ...env, GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', GH_NO_EXTENSION_UPDATE_NOTIFIER: '1', GH_SPINNER_DISABLED: '1',
    NO_COLOR: '1', CLICOLOR: '0', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never',
  };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

const PASS = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);
const FAIL = new Set(['ERROR', 'FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE']);

/**
 * The checks' sum, from statusCheckRollup: a status (StatusContext) by its state, a check run by its conclusion once
 * COMPLETED, else by its status. Any failure: failed; else any other state (queued, waiting, in progress, expected,
 * pending, stale): running; else passed. null with no checks.
 */
export function rollup(v: unknown): PrInfo['ci'] {
  if (!Array.isArray(v)) return null;
  let n = 0, failing = 0, pending = 0;
  for (const c of v) {
    if (!isObj(c)) continue;
    const state = str(c.state) || (c.status === 'COMPLETED' ? str(c.conclusion) : str(c.status));
    n++;
    if (FAIL.has(state)) failing++;
    else if (!PASS.has(state)) pending++;
  }
  return !n ? null : failing ? 'failed' : pending ? 'running' : 'passed';
}

/** gh's JSON as the HUD's facts, or null when it is not a pull request gh describes. */
export function parsePr(v: unknown): PrInfo | null {
  if (!isObj(v)) return null;
  const n = v.number;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > MAX_PR) return null;
  const s = v.state;
  const state: PrInfo['state'] | null = s === 'MERGED' ? 'merged' : s === 'CLOSED' ? 'closed' : s === 'OPEN' ? (v.isDraft === true ? 'draft' : 'open') : null;
  if (!state) return null;
  const review = v.reviewDecision === 'APPROVED' ? 'approved' : v.reviewDecision === 'CHANGES_REQUESTED' ? 'changes' : null;
  return { n, state, ci: rollup(v.statusCheckRollup), review, conflict: v.mergeable === 'CONFLICTING' };
}

/**
 * What one gh run says. Exit 0 with a PR in its JSON: ok. gh's own words decide the rest: no PR for the branch (none),
 * a login that is missing or refused (auth; gh exits 4 without one) and no GitHub remote it knows (no-github); a
 * timeout, unreadable JSON and anything else are passing troubles.
 */
export function classify(r: Pick<RunResult, 'code' | 'stdout' | 'stderr' | 'timedOut'>): { why: PrWhy; pr: PrInfo | null } {
  if (r.timedOut) return { why: 'timeout', pr: null };
  if (r.code === 0) {
    let pr: PrInfo | null = null;
    try { pr = parsePr(JSON.parse(r.stdout)); } catch { /* parse */ }
    return pr ? { why: 'ok', pr } : { why: 'parse', pr: null };
  }
  const err = r.stderr;
  if (r.code === 4 || /gh auth login|HTTP 401|Bad credentials/i.test(err)) return { why: 'auth', pr: null };
  if (/no (open )?pull requests? found/i.test(err)) return { why: 'none', pr: null };
  if (/none of the git remotes configured for this repository|not a git repository/i.test(err)) return { why: 'no-github', pr: null };
  return { why: 'error', pr: null };
}
