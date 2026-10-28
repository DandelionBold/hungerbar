// The HUD engine's input, ported line for line from the oracle (test/reference/hud4.js L672-710 and L1450-1513; plan
// §3-§5): fromState() reads the state Hungerbar hands the HUD (the design pickers' format) into the engine's situation,
// readScoped() reads state.scoped (the weekly limits of one model, round 7), readHist() reads state.hist (what the
// per-session history cache remembers, round 6). hud.oracle.test.ts compares each one.
// Traps kept on purpose: readHist() takes a now above 1e11 as milliseconds and reads only the last 64 buckets, a later
// bucket with the same index wins, a commit flag is only 1 or true; readScoped() reads only the first 16 entries and a
// repeated name (any case) only once; String(family(x)) can be 'undefined'.
import { clamp, family, fin, flag, num, obj, pyRound, whole } from './py.ts';
import { none, tidy } from './text.ts';

/** The repo, as fromState() reads it: null outside a repo. */
export interface GitSit { branch: string; add: number; rem: number }
/** The prompt cache: null when Claude Code says nothing about it. */
export interface CacheSit { hit: number | null; warm: boolean; ttl_left: number; ttl: number; cold: boolean }
/** One weekly limit of one model: left = % left, reset = minutes or null. */
export interface ScopedSit { name: string; fam: string; left: number; reset: number | null }
/** gen.py's situation: what every line is drawn from (hud4.js L1467). */
export interface Sit {
  model: string;
  effort: string;
  ctx_tokens: number;
  ctx_window: number;
  ctx_pct: number;
  git: GitSit | null;
  s5_left: number | null;
  s5_reset: number;
  wk_left: number | null;
  wk_reset: number;
  cache: CacheSit | null;
  extra_used: number;
  extra_limit: number;
  extra_left: number | null;
  cwd: string;
  ver: string;
  cost: number;
  compactions: number;
  turns: number;
  scoped: ScopedSit[];
}
/** [quarter-hour index, biggest added + removed, added, removed, commit seen 0|1] */
export type Bucket = [number, number, number, number, 0 | 1];
export interface LastCommit { at: number; add: number; del: number; branch: string | null }
/** state.hist as readHist() leaves it: seconds, counts whole, buckets of the last two hours by index. */
export interface Hist {
  now: number;
  sessionStart: number | null;
  dirtySince: number | null;
  commits: number;
  lastCommit: LastCommit | null;
  buckets: Bucket[];
}

// hud4.js L672: 15-minute buckets, 8 of them (the last two hours)
export const QUARTER = 900, QUARTERS = 8;
// hud4.js L673
export const histTime = (v: unknown, lo: number, hi: number): number | null => { const n = num(v); return n === undefined ? null : clamp(n, lo, hi); };
// hud4.js L679: a saved branch is read as saved (never tidied again); a number is tidied like fromState's branch
export const histBranch = (v: unknown): string | null => (typeof v === 'string' ? (v.length > 4096 ? null : v)
  : typeof v === 'number' && Number.isFinite(v) ? tidy(v, true, -256)
    // the text of a finite number is never blank once tidied, so the engine's 'HEAD' here is never used
    /* node:coverage ignore next */
    || 'HEAD' : null);
// hud4.js L681
export function readHist(h0: unknown): Hist | null {
  if (h0 === null || typeof h0 !== 'object' || Array.isArray(h0)) return null;
  const h = h0 as Record<string, unknown>;
  const n0 = num(h.now);
  if (n0 === undefined || n0 < 0) return null;               // no clock: a first render, or a lost or corrupt cache
  // a now above 1e11 is milliseconds: every time / 1000, every bucket index floor(index / 1000)
  const unit = n0 > 1e11 ? 1000 : 1;
  const now = Math.min(1e13, n0 / unit);
  const secs = (v: unknown): number | undefined => { const n = num(v); return n === undefined ? undefined : n / unit; };
  const lc = h.lastCommit !== null && typeof h.lastCommit === 'object' && !Array.isArray(h.lastCommit) ? h.lastCommit as Record<string, unknown> : null;
  // a commit 'in the future' (the clock went back further than the cache update saw) is no commit
  const at0 = lc ? secs(lc.at) : undefined, at = at0 === undefined || at0 > now ? null : Math.max(0, at0);
  const I0 = Math.floor(now / QUARTER), buckets = new Map<number, Bucket>();
  if (Array.isArray(h.buckets)) for (const b of (h.buckets as unknown[]).slice(-64)) {   // a huge list costs nothing: its last 64 only
    if (!Array.isArray(b)) continue;
    const k0 = num(b[0]);
    if (k0 === undefined || Math.floor(k0) !== k0) continue;
    const k = unit === 1 ? k0 : Math.floor(k0 / unit);
    if (k > I0 || k <= I0 - QUARTERS) continue;
    buckets.set(k, [k, whole(b[1]), whole(b[2]), whole(b[3]), b[4] === 1 || b[4] === true ? 1 : 0]);   // a later one wins
  }
  return {
    now,
    sessionStart: histTime(secs(h.sessionStart), 0, now),
    dirtySince: histTime(secs(h.dirtySince), 0, now),
    commits: whole(h.commits),
    // lc is set whenever at is: at comes from lc.at
    lastCommit: at === null ? null : { at, add: whole(lc!.add), del: whole(lc!.del), branch: histBranch(lc!.branch) },
    buckets: [...buckets.values()].sort((a, b) => a[0] - b[0]),
  };
}

// hud4.js L1450
export const SC_MISSING = /^(?:none|null|undefined|nan|[+-]?inf(?:inity)?)$/i;
// hud4.js L1451
export function readScoped(a: unknown): ScopedSit[] {
  if (!Array.isArray(a)) return [];
  const out: ScopedSit[] = [], seen = new Set<string>();
  for (const e of (a as unknown[]).slice(0, 16)) {
    if (e === null || typeof e !== 'object' || Array.isArray(e)) continue;
    const x = e as Record<string, unknown>;
    const used = num(x.used), name = tidy(x.name, true, 64);
    if (used === undefined || !name || SC_MISSING.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;                              // a repeated name (any case): the first one only
    seen.add(key);
    const l = num(x.left);
    out.push({ name, fam: String(family(name)).toLowerCase(), left: 100 - Math.floor(clamp(used, 0, 100)),
      reset: l === undefined ? null : Math.floor(clamp(l, 0, 604800) / 60) });
  }
  return out;
}
// hud4.js L1467
export function fromState(st0: unknown): Sit {
  const st = obj(st0);                              // render(null) draws an empty world instead of throwing
  const c = obj(st.cache), h5 = obj(st.h5), week = obj(st.week), x = obj(st.extra);
  const hit = num(c.hit), warm = flag(c.warm);
  const hasCache = hit !== undefined || warm !== null;
  const t = fin(c.ttl, 0, 86400), ttl = hasCache && t >= 1 ? t : 300;   // ttl / 10 never underflows to 0
  const extraUsed = fin(x.used, 0, 1e15), extraLimit = fin(x.limit, 0, 1e15);
  // Claude Code's own model object ({id, display_name}) as well as its name
  const sm = st.model as Record<string, unknown> | null;
  const m = sm !== null && typeof sm === 'object'
    ? tidy(sm.display_name, true, 256) || tidy(sm.id, true, 256) : tidy(sm, true, 256);
  const used5 = num(h5.used), left5 = num(h5.left), usedWk = num(week.used), leftWk = num(week.left);
  // the reset is never further away than the 5-hour window; a limit with no reset given resets after its whole window
  const win5 = Math.min(fin(h5.window, 0, 1e9) || 18000, 18000);
  // effort is one of a few levels, so 'None', 'null', 'undefined' or 'NaN' can only mean that there is none
  const eff = tidy(st.effort, true, 256);
  return {
    model: m || 'Claude',                          // lines start with it: never empty, never a space
    effort: /^(?:none|null|undefined|nan)$/i.test(eff) ? '' : eff,   // '' when not set (Haiku has none)
    // gen.py's situations hold whole thousands (237000 for the 236900 in states.json): nearest k.
    ctx_tokens: Math.round(fin(st.ctxTok, 0, 1e9) / 1000) * 1000,
    ctx_window: fin(st.ctxMax, 0, 1e9),
    ctx_pct: pyRound(fin(st.ctxPct, 0, 100)),
    // a branch that is empty once tidied (' ', a lone ZWJ) is still a repo: 'HEAD'; a huge one keeps its end
    git: none(st.branch) || st.branch === false ? null
      : { branch: tidy(st.branch, true, -256) || 'HEAD', add: whole(st.add), rem: whole(st.del) },
    s5_left: used5 === undefined ? null : 100 - Math.floor(clamp(used5, 0, 100)),
    s5_reset: Math.floor((left5 === undefined ? win5 : clamp(left5, 0, win5)) / 60),
    wk_left: usedWk === undefined ? null : 100 - Math.floor(clamp(usedWk, 0, 100)),
    wk_reset: Math.floor((leftWk === undefined ? 604800 : clamp(leftWk, 0, 604800)) / 60),
    // whole seconds, within the TTL; an unknown hit % (null) is left out of the readouts. warm is false for an unknown
    // flag too; cold is true only when Claude Code said so.
    cache: hasCache ? { hit: hit === undefined ? null : pyRound(clamp(hit, 0, 100)), warm: warm === true,
      ttl_left: Math.floor(fin(c.left, 0, ttl)), ttl, cold: warm === false } : null,
    extra_used: extraUsed,
    extra_limit: extraLimit,
    extra_left: extraLimit ? Math.max(0, extraLimit - extraUsed) : null,   // used past the limit: $0, not $-25
    cwd: tidy(st.cwd, true, -512),                 // '' (none given): no ⌂
    ver: tidy(st.ver, true, 256),                  // '' (none given): Day & Night shows v?
    cost: fin(st.cost, 0, 1e15),
    compactions: whole(st.compactions),
    turns: whole(st.turns),
    scoped: readScoped(st.scoped),                 // [] when there is no data: no fable option draws anything
  };
}
