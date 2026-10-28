// Item builders. Each item becomes pieces of styled spans, the same shape the picker used.
import type { Role } from './color.ts';
import type { Config, ItemId } from './config.ts';
import { clamp, countdown, limitPct, moneyLimit, moneyUsed, timeLeft, tokens, tokensMax } from './format.ts';
import type { Glyphs } from './glyphs.ts';
import type { LimitView } from './limits.ts';
import type { State } from './state.ts';
import { truncateWidth } from './width.ts';

export interface Span {
  t: string;
  role?: Role;
  /** Labels are never bold. */
  lab?: boolean;
  dim?: boolean;
}

export interface Piece {
  id: ItemId;
  spans: Span[];
}

/** What the fit-to-width steps can turn off or shrink. */
export interface Opts {
  drop: Set<ItemId>;
  short: boolean;
  ctxTokens: boolean;
  ctxBar: boolean;
  barWidth: number;
  gitChanges: boolean;
  branchMax: number | null;
  cwdBase: boolean;
  collapse: boolean;
  cacheTimer: boolean;
  time5h: boolean;
  timeWeek: boolean;
}

export function defaultOpts(cfg: Config): Opts {
  return {
    drop: new Set(), short: false, ctxTokens: true, ctxBar: true, barWidth: cfg.bar.width, gitChanges: true,
    branchMax: null, cwdBase: false, collapse: false, cacheTimer: true, time5h: true, timeWeek: true,
  };
}

const FULL: Partial<Record<ItemId, string>> = {
  model: 'Model: ', effort: 'Thinking: ', context: 'Context: ', limit5h: 'Session: ', limitWeek: 'Weekly: ', cwd: 'cwd: ',
};

function label(id: ItemId, cfg: Config, g: Glyphs, o: Opts): string {
  if (id === 'cache') return o.short ? g.disk || 'Cache ' : g.disk + 'Cache Hit: ';
  if (id === 'extra') return o.short ? g.card || 'Extra ' : g.card + 'Extra: ';
  if (!o.short) return FULL[id] ?? '';
  // Short labels keep naming the window: an empty food bar has no icon, and both windows may use the same bar.
  if (id === 'limit5h') return '5h ';
  if (id === 'limitWeek') return 'Wk ';
  return '';
}

const lab = (t: string): Span[] => (t ? [{ t, role: 'label', lab: true }] : []);

function lvl(p: number, base: Role, cfg: Config): Role {
  return p >= cfg.thresholds.crit ? 'crit' : p >= cfg.thresholds.warn ? 'warn' : base;
}

function dimmed(spans: Span[], dim: boolean): Span[] {
  return dim ? spans.map((s) => ({ ...s, dim: true })) : spans;
}

function context(st: State, cfg: Config, g: Glyphs, o: Opts): Span[] {
  const c = st.ctx, col = lvl(c.pct, 'ctx', cfg);
  const spans = lab(label('context', cfg, g, o));
  if (o.ctxBar) {
    const w = o.barWidth, f = clamp(Math.floor((c.pct * w + 50) / 100), 0, w);
    spans.push(
      { t: g.barOpen, role: 'ctx' },
      { t: g.barFull.repeat(f), role: c.pct >= cfg.thresholds.warn ? col : 'bar' },
      { t: g.barEmpty.repeat(w - f), role: 'empty' },
      { t: g.barClose, role: 'ctx' },
    );
  }
  const pct = `${c.dim ? '~' : ''}${c.pct}%`;
  const text = o.ctxTokens ? `${tokens(c.tokens)}/${tokensMax(c.size)} (${pct})` : pct;
  spans.push({ t: (o.ctxBar ? ' ' : '') + text, role: col });
  return dimmed(spans, c.dim);
}

/** Hearts: ten, lost ones turn dark from the right (Minecraft health), rounded to the nearest tenth. */
export function heartsLeft(p: number): number {
  return clamp(Math.floor(((100 - p) * 10 + 50) / 100), 0, 10);
}

/** Food: ten drumsticks, as in the game; one stays while any of its tenth is left, so only 100% empties the bar. */
export function foodLeft(p: number): number {
  return p >= 100 ? 0 : clamp(Math.ceil(((100 - p) * 10) / 100), 1, 10);
}

/** The pie timer: full while the cache is fresh, empty once it has gone cold. */
export function pie(g: Glyphs, state: 'warm' | 'cold', left: number, ttl: string | null): string {
  if (!g.pie) return '';
  if (state !== 'warm' || left <= 0) return g.pie[4];
  const f = left / (ttl === '1h' ? 3600 : 300);
  return g.pie[f > 0.875 ? 0 : f > 0.625 ? 1 : f > 0.375 ? 2 : f > 0.125 ? 3 : 4];
}

function limit(id: 'limit5h' | 'limitWeek', v: LimitView | null, st: State, cfg: Config, g: Glyphs, o: Opts): Span[] {
  if (!v) return [];
  // p is what is used (floored); the icons and the % both count what is left, or both what is used (SPEC §0.8).
  const p = v.pct, five = id === 'limit5h', countLeft = cfg.limits === 'left';
  const kind = five ? cfg.minecraft.session : cfg.minecraft.weekly;
  const spans = lab(label(id, cfg, g, o));
  const icons: Span[] = [];
  if (cfg.icons !== 'unicode') {
    if (o.collapse) {
      const icon = kind === 'hearts' ? g.heartIcon : g.food;
      if (icon) icons.push({ t: icon, role: kind === 'hearts' ? 'heart' : 'food' });
    } else if (kind === 'hearts') {
      // Red hearts are what is left (a lost one turns dark, from the right), or with "used" one turns red per tenth used.
      const red = countLeft ? heartsLeft(p) : 10 - heartsLeft(p);
      icons.push({ t: g.pipOpen, role: 'label' }, { t: g.heart.repeat(red), role: 'heart' }, { t: g.heartSpent.repeat(10 - red), role: 'empty' }, { t: g.pipClose, role: 'label' });
    } else {
      // Drumsticks sit by the number and blank slots fill in from the left: the ones left to eat, or with "used" the ones eaten.
      const keep = countLeft ? foodLeft(p) : 10 - foodLeft(p);
      const slots = Array.from({ length: 10 }, (_, i) => (i < 10 - keep ? g.foodGone : g.foodFull));
      icons.push({ t: g.pipOpen, role: 'label' }, { t: slots.join(g.foodGap), role: 'food' }, { t: g.pipClose, role: 'label' });
    }
  }
  const shown = icons.some((s) => s.t !== '');
  // The warn and crit colours keep firing on what is used, whichever way the number counts.
  spans.push(...icons, { t: `${shown ? ' ' : ''}${v.dim ? '~' : ''}${countLeft ? 100 - p : p}%`, role: lvl(p, kind === 'hearts' ? 'heart' : 'food', cfg) });
  const t = v.left !== null && (five ? o.time5h : o.timeWeek) ? timeLeft(v.left) : null;
  if (t) spans.push({ t: ` (${g.reset}${t})`, role: 'time' });
  return dimmed(spans, v.dim);
}

function cache(st: State, cfg: Config, g: Glyphs, o: Opts): Span[] {
  const c = st.cache;
  if (!c) return [];
  const spans = lab(label('cache', cfg, g, o));
  spans.push({ t: c.hit === null ? 'n/a' : `${c.dim ? '~' : ''}${c.hit}%`, role: 'cache' });
  if (o.cacheTimer && c.state) {
    const t = pie(g, c.state, c.left, c.ttl);
    const pre = ` (${t ? t + ' ' : ''}`;
    if (c.state === 'warm') spans.push({ t: `${pre}${g.warm}${countdown(c.left, c.ttl)})`, role: 'warm' });
    else spans.push({ t: `${pre}${g.cold}COLD)`, role: 'cold' });
  }
  return dimmed(spans, c.dim);
}

export function build(id: ItemId, st: State, cfg: Config, g: Glyphs, o: Opts): Piece[] {
  if (o.drop.has(id)) return [];
  const one = (spans: Span[]): Piece[] => (spans.length ? [{ id, spans }] : []);
  switch (id) {
    case 'model':
      return one([...lab(label(id, cfg, g, o)), { t: st.model, role: 'model' }]);
    case 'effort':
      return st.effort ? one([...lab(label(id, cfg, g, o)), { t: st.effort, role: 'effort' }]) : [];
    case 'context':
      return one(context(st, cfg, g, o));
    case 'git': {
      const gv = st.git;
      if (!gv.isRepo) {
        const out: Piece[] = [{ id, spans: [{ t: g.branch + 'no git', role: 'git' }] }];
        if (o.gitChanges) out.push({ id, spans: [{ t: '(no git)', role: 'chg' }] });
        return out;
      }
      const b = gv.branch ?? '';
      const out: Piece[] = [{ id, spans: [{ t: g.branch + (o.branchMax ? truncateWidth(b, o.branchMax, g.ellipsis) : b), role: 'git' }] }];
      if (o.gitChanges && gv.added !== null && gv.removed !== null && gv.added + gv.removed > 0)
        out.push({ id, spans: [{ t: `(+${gv.added},-${gv.removed})`, role: 'chg' }] });
      return out;
    }
    case 'limit5h':
      return one(limit(id, st.h5, st, cfg, g, o));
    case 'limitWeek':
      return one(limit(id, st.week, st, cfg, g, o));
    case 'scopedWeek':
      return st.scoped.map((s) => {
        const spans: Span[] = [...lab(o.short ? s.name + ' ' : s.name + ': '), { t: `${cfg.limits === 'left' ? 100 - s.pct : s.pct}%`, role: lvl(s.pct, cfg.minecraft.weekly === 'hearts' ? 'heart' : 'food', cfg) }];
        const t = s.left !== null && o.timeWeek ? timeLeft(s.left) : null;
        if (t) spans.push({ t: ` (${g.reset}${t})`, role: 'time' });
        return { id, spans };
      });
    case 'cache':
      return one(cache(st, cfg, g, o));
    case 'extra': {
      const x = st.extra;
      if (!x) return [];
      const text = x.limit !== null ? `${moneyUsed(x.used, x.currency)}/${moneyLimit(x.limit, x.currency)}` : moneyUsed(x.used, x.currency);
      return one([...lab(label(id, cfg, g, o)), { t: text, role: x.pct !== null ? lvl(limitPct(x.pct), 'extra', cfg) : 'extra' }]);
    }
    case 'cwd': {
      const path = o.cwdBase ? st.cwd.split('/').filter(Boolean).pop() ?? st.cwd : st.cwd;
      return one([...lab(label(id, cfg, g, o)), { t: path, role: 'cwd' }]);
    }
    case 'version':
      return st.version ? one([{ t: 'v' + st.version, role: 'ver' }]) : [];
  }
}
