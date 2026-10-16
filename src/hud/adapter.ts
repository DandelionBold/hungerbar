// Hungerbar's State, the payload and the transcript counts → the HUD engine's state (plan §5): the format of
// test/reference/hud4-states.json, which fromState() reads. Every field but cost, turns, compactions, hist and the two
// *Full fields is today's collect() output, unchanged; the round-4 fixes live here, never in the port:
//   - a placeholder (None, null, undefined, NaN, ±Inf, Infinity, nil) as model, effort, cwd or version is '' (the
//     engine then shows Claude, no level, no ⌂, v?); never for the branch, since git allows `null` as a name;
//   - branch and cwd come capped at the engine's own bounds (State.branchFull 256, State.cwdFull 512, the end kept),
//     so the engine never cuts a second time (round-4 issue 6);
//   - a scoped weekly limit past its reset (left ≤ 0) is a full week with no clock (used 0, left null) until the next
//     fetch, as limits.ts view() reads a passed reset.
// Last-known limits and the transcript's cache values are drawn without classic's ~: the HUD has no cell for it.
// `hist` is not set here: the history step needs fromState's reading of this state first (look.ts).
import { num, type Payload } from '../payload.ts';
import type { CacheView, Counts, State } from '../state.ts';
import type { Hist } from './input.ts';
import { tidy } from './text.ts';

/** A rate-limit window as the engine reads it: % used, seconds left (left out when unknown), the 5-hour window. */
export interface HudLimit { used: number; left?: number; window?: number }
/** The engine's state (hud4-states.json): what renderHud() is handed. */
export interface HudState {
  model: string;
  effort: string;
  ctxPct: number;
  ctxTok: number;
  ctxMax: number;
  /** null outside a repo. */
  branch: string | null;
  add: number;
  del: number;
  cwd: string;
  ver: string;
  h5: HudLimit | null;
  week: HudLimit | null;
  /** null when caching is off; hit and warm null when nothing is known (no bubbles). */
  cache: { hit: number | null; warm: boolean | null; left: number; ttl: number } | null;
  extra: { used: number; limit: number | null } | null;
  cost: number;
  turns: number;
  compactions: number;
  /** used = % used, left = seconds to the reset or null. */
  scoped: Array<{ name: string; used: number; left: number | null }>;
  /** The history step's answer (plan §6); null outside a repo or with no session key. Set by look.ts. */
  hist?: Hist | null;
}

/** What only ever means "no value": a value that reads as one of these is ''. */
export const PLACEHOLDER = /^(?:none|null|undefined|nan|[+-]?inf(?:inity)?|nil)$/i;
/** The placeholder guard: v, or '' when the engine would read it (tidied, trimmed) as a placeholder. */
export const guard = (v: string): string => (PLACEHOLDER.test(tidy(v, true, 256)) ? '' : v);

const WINDOW_5H = 18000;

const limit = (l: State['h5'], window?: number): HudLimit | null =>
  l ? { used: l.pct, ...(l.left !== null ? { left: l.left } : {}), ...(window !== undefined ? { window } : {}) } : null;

const cacheOf = (c: CacheView | null): HudState['cache'] =>
  c ? { hit: c.hit, warm: c.state === 'warm' ? true : c.state === 'cold' ? false : null, left: Math.max(0, Math.floor(c.left)), ttl: c.ttl === '1h' ? 3600 : 300 } : null;

/** The engine's state for this render, without its history. */
export function adapt(st: State, p: Payload, counts: Counts): HudState {
  return {
    model: guard(st.model),
    effort: guard(st.effort ?? ''),
    ctxPct: st.ctx.pct,
    ctxTok: st.ctx.tokens,
    ctxMax: st.ctx.size,
    branch: st.git.isRepo ? st.branchFull : null,
    add: st.git.added ?? 0,
    del: st.git.removed ?? 0,
    cwd: guard(st.cwdFull),
    ver: guard(st.version ?? ''),
    h5: limit(st.h5, WINDOW_5H),
    week: limit(st.week),
    cache: cacheOf(st.cache),
    extra: st.extra ? { used: st.extra.used, limit: st.extra.limit } : null,
    cost: num(p.cost?.total_cost_usd) ?? 0,
    turns: counts.turns,
    compactions: counts.compactions,
    scoped: st.scoped.map((s) => (s.left !== null && s.left <= 0 ? { name: s.name, used: 0, left: null } : { name: s.name, used: s.pct, left: s.left })),
  };
}
