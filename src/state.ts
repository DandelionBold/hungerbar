// normalize(): stdin first, then each item's fallback chain (SPEC §5, §0.2).
import type { Config } from './config.ts';
import { slash, type Env } from './env.ts';
import { ctxPct, hitPct, limitPct } from './format.ts';
import type { Repo } from './git/head.ts';
import type { GitOp, GitStatus } from './git/status.ts';
import type { Hist } from './hud/input.ts';
import type { LimitView } from './limits.ts';
import type { PrInfo } from './pr/gh.ts';
import { baseModelId, cleanModelName, num, obj, str, type Payload, type Usage } from './payload.ts';
import { CAP, sanitize, sanitizeTail } from './sanitize.ts';
import type { TxSummary } from './transcript.ts';
import type { UsageFile } from './usage/file.ts';
import type { WhoSource } from './whoami.ts';

export interface GitView {
  isRepo: boolean;
  branch: string | null;
  /** Null until the background refresher has written a diff for this repo. */
  added: number | null;
  removed: number | null;
  /** The repo as read from disk, for the HUD's history (its gitDir); internal, classic never reads it. */
  repo?: Repo;
  /**
   * The HUD's git state (SPEC §0.9, 0.7.0), read only when the look is hud: the cached `git status` counts (null until
   * the refresher has written them, or when its git failed) and what is in progress, from the git dir's files.
   */
  status?: GitStatus | null;
  op?: GitOp | null;
}

export interface CtxView {
  pct: number;
  tokens: number;
  size: number;
  /** True when the numbers come from the transcript. */
  dim: boolean;
}

export interface CacheView {
  hit: number | null;
  state: 'warm' | 'cold' | null;
  left: number;
  ttl: string | null;
  dim: boolean;
}

export interface ExtraView {
  used: number;
  limit: number | null;
  currency: string;
  pct: number | null;
}

export interface ScopedView {
  name: string;
  pct: number;
  left: number | null;
}

export interface State {
  now: number;
  model: string;
  effort: string | null;
  ctx: CtxView;
  git: GitView;
  /**
   * The HUD's branch: null outside a repo, else the stdin worktree branch or the HEAD branch (a 7-character sha when
   * detached), stripped of escapes and controls and cut to its last CAP.branchFull code points ('…' first).
   */
  branchFull: string | null;
  cwd: string;
  /** The HUD's folder: the same chain as cwd, in slash form, stripped, its last CAP.cwdFull code points ('…' first). */
  cwdFull: string;
  h5: LimitView | null;
  week: LimitView | null;
  cache: CacheView | null;
  extra: ExtraView | null;
  scoped: ScopedView[];
  version: string | null;
  cfgError: boolean;
}

/** The HUD book's numbers, from the transcript. */
export interface Counts {
  turns: number;
  compactions: number;
}

/** Where the non-stdin data comes from: disk for a real render, fixed values for the demo. */
export interface Sources {
  git(dir: string): GitView;
  limits(): { h5: LimitView | null; week: LimitView | null };
  /** Null when the usage API is off. */
  usage(): UsageFile | null;
  transcript(): TxSummary | null;
  /** Prompts sent and compactions; zeros without a transcript. Only the HUD asks, so classic never reads for it. */
  counts(): Counts;
  /**
   * The HUD's git-terrain history (plan §6): this render's step of the per-session, per-repo history file, from the
   * bytes appended to logs/HEAD, with no process. `branch`, `add` and `del` are the port's own fromState reading (B,
   * git.add, git.rem). Null outside a repo (no repo, or a null branch) or with no session key. A changed file is written
   * by a hook on the render's `after` list, after stdout. Only the HUD asks.
   */
  history(repo: Repo | undefined, branch: string | null, add: number, del: number): Hist | null;
  /**
   * The HUD's pull request for the branch HEAD is on (SPEC §0.9, 0.7.0), from the PR cache: null with hud.pr off, with
   * non-essential traffic off, outside a repo, on a detached HEAD, or with no answer from gh yet. A stale answer queues
   * the refresher (`refresh pr <root> <branch>`) when a remote is on GitHub, and is drawn meanwhile. No process. Only
   * the HUD asks; a source without it (the demo) has no PR.
   */
  pr?(repo: Repo | undefined): PrInfo | null;
  /**
   * Who runs Claude Code (SPEC §0.9, 0.7.0): the user and host names (hud.user) and whether it runs elevated (hud.op),
   * each asked only when the HUD draws it. No process. Only the HUD asks; a source without it (the demo) shows none.
   */
  who?: WhoSource;
}

const sumUsage = (u: Usage): number =>
  [u.input_tokens, u.cache_creation_input_tokens, u.cache_read_input_tokens].reduce<number>((a, v) => a + (num(v) ?? 0), 0);

export function collect(p: Payload, now: number, cfg: Config, env: Env, src: Sources, cfgError: boolean): State {
  const m = p.model;
  const display = typeof m === 'string' ? m : str(m?.display_name);
  const modelId = typeof m === 'object' && m ? str(m.id) : null;
  let model = display ? cleanModelName(display) : modelId ? modelId.replace(/^claude-/, '').replace(/\[[^\]]*\]$/, '') : null;
  if (!model) model = src.transcript()?.lastModel?.replace(/^claude-/, '') ?? null;
  model = sanitize(model ?? '', CAP.model) || 'Claude';

  let effort = str(p.effort?.level);
  if (!effort) {
    const e = src.transcript()?.lastEffort;
    if (e && (!modelId || !e.model || baseModelId(modelId) === baseModelId(e.model))) effort = e.level;
  }
  if (!effort) effort = str(env.CLAUDE_CODE_EFFORT_LEVEL);
  effort = effort ? sanitize(effort, CAP.effort) || null : null;

  const cw = obj(p.context_window);
  let size = num(cw?.context_window_size);
  if (size === null || size <= 0) size = modelId?.endsWith('[1m]') || /\b1M\b/i.test(display ?? '') ? 1_000_000 : 200_000;
  const cu = cw?.current_usage;
  let tokens: number | null = typeof cu === 'number' ? (Number.isFinite(cu) ? cu : null) : cu && typeof cu === 'object' ? sumUsage(cu) : null;
  const pctRaw = num(cw?.used_percentage);
  let dim = false;
  if (tokens === null) {
    const last = src.transcript()?.lastUsage;
    if (last) {
      tokens = last.input + last.create + last.read;
      dim = pctRaw === null;
    }
  }
  const pct = pctRaw !== null ? ctxPct(pctRaw) : tokens !== null ? ctxPct((tokens * 100) / size) : 0;
  if (tokens === null) tokens = pctRaw !== null ? Math.round((pctRaw / 100) * size) : 0;

  const dirRaw = str(p.workspace?.current_dir) ?? str(p.cwd) ?? process.cwd();
  const git = src.git(dirRaw);
  const wtBranch = str(p.worktree?.branch);
  if (git.isRepo && wtBranch) git.branch = wtBranch;
  const branchFull = git.isRepo && git.branch ? sanitizeTail(git.branch, CAP.branchFull, '…') : null;
  if (git.branch) git.branch = sanitize(git.branch, CAP.branch);

  const { h5, week } = src.limits();

  let cache: CacheView | null;
  const pc = obj(p.prompt_cache);
  if (pc) {
    if (pc.caching_observed === false) cache = null;
    else {
      const hit = num(pc.hit_ratio), exp = num(pc.expires_at), ttl = str(pc.ttl);
      const state = pc.warm === true ? (exp !== null && exp - now > 0 ? 'warm' : 'cold') : pc.warm === false ? 'cold' : null;
      cache = { hit: hit === null ? null : hitPct(hit), state, left: exp !== null ? Math.floor(exp - now) : 0, ttl, dim: false };
    }
  } else {
    const tx = src.transcript();
    if (tx && tx.hitRatio !== null) {
      const lc = tx.lastCached;
      const exp = lc ? lc.ts + (lc.ttl === '1h' ? 3600 : 300) : null;
      cache = { hit: hitPct(tx.hitRatio), state: exp === null ? null : exp > now ? 'warm' : 'cold', left: exp === null ? 0 : exp - now, ttl: lc?.ttl ?? null, dim: true };
    } else cache = { hit: null, state: null, left: 0, ttl: null, dim: false };
  }

  let extra: ExtraView | null = null;
  const sl = obj(p.rate_limits?.spend_limit);
  const slUsed = num(sl?.used_usd), slLimit = num(sl?.limit_usd);
  const usage = slUsed !== null || slLimit !== null ? null : src.usage();
  if (sl && (slUsed !== null || slLimit !== null)) {
    const used = slUsed ?? 0;
    extra = { used, limit: slLimit, currency: 'USD', pct: num(sl.used_percentage) ?? (slLimit ? (used / slLimit) * 100 : null) };
  } else if (usage?.extra?.enabled) {
    const x = usage.extra;
    const used = x.usedCents / 100, limit = x.limitCents === null ? null : x.limitCents / 100;
    extra = { used, limit, currency: sanitize(x.currency || 'USD', CAP.currency) || 'USD', pct: limit ? (used / limit) * 100 : null };
  }

  const scoped: ScopedView[] = cfg.network.scopedWeekly
    ? (src.usage()?.scoped ?? []).map((s) => ({
        name: sanitize(s.name, CAP.scoped),
        pct: limitPct(s.pct),
        left: s.resets_at !== null ? s.resets_at - now : null,
      }))
    : [];

  const ver = str(p.version);
  return {
    now,
    model,
    effort,
    ctx: { pct, tokens, size, dim },
    git,
    branchFull,
    cwd: sanitizeTail(slash(dirRaw), CAP.path, '…'),
    cwdFull: sanitizeTail(slash(dirRaw), CAP.cwdFull, '…'),
    h5,
    week,
    cache,
    extra,
    scoped,
    version: ver ? sanitize(ver, CAP.version) : null,
    cfgError,
  };
}
