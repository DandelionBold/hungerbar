// The picker's four situations, plus Fable in use, as payloads plus fixed git/usage/counts/history data, for `preview`
// and a TTY render. Each look draws them from the same data: classic uses what it always did, the HUD also the cost, the
// book's counts, the git-terrain history and the scoped Fable week (test/reference/hud4-states.json and hud-spec.json),
// and (0.7.0) the git state's status and, with hud.pr on, the tight day's pull request. Who runs the session (hud.user,
// hud.op) is not made up: a caller hands demoSources this machine's (whoAmI), or none.
import { liveLimits, view } from './limits.ts';
import { QUARTER, type Bucket, type Hist } from './hud/input.ts';
import type { Config } from './config.ts';
import type { Payload } from './payload.ts';
import type { PrInfo } from './pr/gh.ts';
import type { Counts, GitView, Sources } from './state.ts';
import type { UsageFile, UsageScoped } from './usage/file.ts';
import type { WhoSource } from './whoami.ts';

export const DEMO_NOW = 1792859460;

export interface Demo {
  label: string;
  payload: Payload;
  git: GitView;
  usage: UsageFile | null;
  /** The HUD book's prompts and compactions (test/reference/hud4-states.json). */
  counts: Counts;
  /** The HUD's git-terrain history; none outside a repo, as on disk. */
  hist?: Hist;
  /** The branch's pull request, drawn with hud.pr on (0.7.0); none: no PR. */
  pr?: PrInfo;
}

const T = (s: number): number => DEMO_NOW + s;

/**
 * A hand-filled round-6 history (test/reference/hud-spec.json round6.inputs, whose clock starts at 0) moved to DEMO_NOW
 * by whole quarters, so each bucket stays as many quarters before now as it was; in the form the history step hands
 * the engine (git-terrain reads only now and the buckets).
 */
function shifted(now: number, buckets: Bucket[]): Hist {
  const k = Math.floor(DEMO_NOW / QUARTER) - Math.floor(now / QUARTER);
  return { now: DEMO_NOW, sessionStart: null, dirtySince: null, commits: 0, lastCommit: null, buckets: buckets.map(([i, ...b]) => [i + k, ...b]) };
}

const base = (effort: string, used: number, pct: number | null, cwd: string, cost: number): Payload => ({
  session_id: '00000000-0000-4000-8000-000000000001',
  version: '2.1.306',
  model: { id: 'claude-opus-5-5[1m]', display_name: 'Opus 5.5 (1M context)' },
  effort: { level: effort },
  workspace: { current_dir: cwd, project_dir: cwd },
  cwd,
  cost: { total_cost_usd: cost },
  context_window: {
    context_window_size: 1_000_000,
    used_percentage: pct,
    current_usage: used > 0 ? { input_tokens: 6, cache_creation_input_tokens: 1494, cache_read_input_tokens: used - 1500, output_tokens: 812 } : null,
  },
});

/** The scoped weekly limit the situations share (round 7's normal day): Fable 35% used, full again in 4 days. */
const FABLE: UsageScoped = { name: 'Fable', pct: 35, resets_at: T(4 * 86400) };

const usage = (usedCents: number, scoped: UsageScoped = FABLE): UsageFile => ({
  v: 1, at: DEMO_NOW - 30, extra: { enabled: true, usedCents, limitCents: 5000, currency: 'USD' }, scoped: [scoped], lockUntil: 0,
});

const NORMAL_HIST = shifted(5700, [[0, 342, 241, 101, 0], [1, 615, 455, 160, 0], [2, 860, 640, 220, 0], [3, 898, 667, 231, 1], [4, 180, 140, 40, 0],
  [5, 640, 520, 120, 0], [6, 1487, 1208, 279, 0]]);

const normal: Demo = {
  label: 'Normal day',
  payload: {
    ...base('high', 81_000, 8, 'D:\\webapp', 3.12),
    rate_limits: { five_hour: { used_percentage: 2.0, resets_at: T(17340) }, seven_day: { used_percentage: 82.0, resets_at: T(345540) } },
    prompt_cache: { warm: true, caching_observed: true, ttl: '5m', expires_at: T(252), hit_ratio: 0.981 },
  },
  // the git state (0.7.0): the diff's files changed, level with the upstream, so no marks
  git: { isRepo: true, branch: 'main', added: 1208, removed: 279, status: { changed: 9, untracked: 0, conflicts: 0, ahead: 0, behind: 0 }, op: null },
  usage: usage(0),
  counts: { turns: 42, compactions: 0 },
  hist: NORMAL_HIST,
};

export const DEMOS: Record<string, Demo> = {
  normal,
  tight: {
    label: 'Close to limits',
    payload: {
      ...base('xhigh', 712_400, 71, 'D:\\webapp', 18.4),
      rate_limits: { five_hour: { used_percentage: 93.4, resets_at: T(2280) }, seven_day: { used_percentage: 97.1, resets_at: T(33120) } },
      prompt_cache: { warm: false, caching_observed: true, ttl: '5m', expires_at: T(-60), hit_ratio: 0.914 },
    },
    // a new file and two commits to push; its pull request's checks passed and it is approved
    git: { isRepo: true, branch: 'feature/cache', added: 42, removed: 7, status: { changed: 2, untracked: 1, conflicts: 0, ahead: 2, behind: 0 }, op: null },
    pr: { n: 128, state: 'open', ci: 'passed', review: 'approved', conflict: false },
    usage: usage(0),
    counts: { turns: 42, compactions: 2 },
    hist: shifted(12000, [[6, 210, 160, 50, 0], [7, 540, 400, 140, 0], [8, 120, 90, 30, 1], [9, 460, 300, 160, 0], [10, 72, 30, 42, 0],
      [11, 480, 350, 130, 0], [12, 528, 388, 140, 1], [13, 49, 42, 7, 0]]),
  },
  fresh: {
    label: 'Fresh start, no git',
    payload: {
      ...base('medium', 0, null, 'C:\\Users\\Steve', 0),
      rate_limits: { five_hour: { used_percentage: 0, resets_at: T(18000) }, seven_day: { used_percentage: 12.0, resets_at: T(512340) } },
    },
    git: { isRepo: false, branch: null, added: null, removed: null },
    usage: usage(0),
    counts: { turns: 0, compactions: 0 },
  },
  extra: {
    label: 'Using extra credits',
    payload: {
      ...base('high', 236_900, 24, 'D:\\webapp', 41.9),
      rate_limits: { five_hour: { used_percentage: 100, resets_at: T(3900) }, seven_day: { used_percentage: 100, resets_at: T(187200) } },
      prompt_cache: { warm: true, caching_observed: true, ttl: '5m', expires_at: T(175), hit_ratio: 0.96 },
    },
    // one commit to pull
    git: { isRepo: true, branch: 'main', added: 12, removed: 3, status: { changed: 1, untracked: 0, conflicts: 0, ahead: 0, behind: 1 }, op: null },
    usage: usage(420),
    counts: { turns: 42, compactions: 1 },
    hist: shifted(15000, [[9, 96, 70, 26, 0], [10, 310, 240, 70, 1], [11, 140, 100, 40, 0], [12, 520, 400, 120, 0], [13, 1180, 900, 280, 0],
      [14, 1540, 1200, 340, 0], [15, 2210, 1730, 480, 0], [16, 2390, 1880, 510, 1]]),
  },
  // round 7's fable-in-use: the normal day, but Fable is the model in use, 62% used, full again in 2d05h
  fable: {
    ...normal,
    label: 'Fable in use',
    payload: { ...normal.payload, model: { id: 'claude-fable-5-1', display_name: 'Fable 5.1' } },
    usage: usage(0, { name: 'Fable', pct: 62, resets_at: T(190800) }),
  },
};

/**
 * Fixed sources: nothing is read from or written to disk. The PR is the demo's own while cfg.hud.pr is on (no gh, no
 * network); `who` is who runs the session (none: no name and no operator's mark).
 */
export function demoSources(d: Demo, who?: WhoSource): (p: Payload, cfg: Config, now: number) => Sources {
  return (p, cfg, now) => ({
    git: () => structuredClone(d.git),
    limits: () => {
      const l = liveLimits(p);
      return { h5: view(l.h5, true, now), week: view(l.week, true, now) };
    },
    usage: () => d.usage,
    transcript: () => null,
    counts: () => ({ ...d.counts }),
    // as on disk: no history outside a repo
    history: (_repo, branch) => (branch !== null && d.hist ? structuredClone(d.hist) : null),
    pr: () => (cfg.hud.pr === 'on' && d.pr ? { ...d.pr } : null),
    ...(who ? { who } : {}),
  });
}
