// Lines: build the pieces, fit them to the width budget, join with separators, encode (SPEC §0.3, §4.7).
import { paint, type Depth } from './color.ts';
import type { Config, ItemId } from './config.ts';
import { intEnv, type Env } from './env.ts';
import type { Glyphs } from './glyphs.ts';
import { build, defaultOpts, type Opts, type Piece } from './items.ts';
import type { State } from './state.ts';
import { strWidth } from './width.ts';

type Step = { ids: ItemId[] | null; apply: (o: Opts) => boolean };

const set = <K extends keyof Opts>(k: K, v: Opts[K]) => (o: Opts): boolean => {
  if (o[k] === v) return false;
  o[k] = v;
  return true;
};
const drop = (id: ItemId): Step => ({ ids: [id], apply: (o) => (o.drop.has(id) ? false : (o.drop.add(id), true)) });

/** Applied in this order, to a line only when one of the step's items is on it, until the line fits. */
export const STEPS: Step[] = [
  drop('version'),
  drop('extra'),
  drop('scopedWeek'),
  { ids: ['git'], apply: set('gitChanges', false) },
  { ids: ['context'], apply: set('ctxTokens', false) },
  { ids: null, apply: set('short', true) },
  { ids: ['context'], apply: (o) => (o.barWidth > 8 ? ((o.barWidth = 8), true) : false) },
  { ids: ['cwd'], apply: set('cwdBase', true) },
  { ids: ['limit5h', 'limitWeek'], apply: set('collapse', true) },
  drop('cwd'),
  { ids: ['cache'], apply: set('cacheTimer', false) },
  { ids: ['git'], apply: set('branchMax', 16) },
  drop('cache'),
  { ids: ['limitWeek', 'scopedWeek'], apply: set('timeWeek', false) },
  { ids: ['limit5h'], apply: set('time5h', false) },
  { ids: ['context'], apply: set('ctxBar', false) },
  drop('git'),
];

/** Columns available to a line, or null when the width is unknown (then nothing is fitted). */
export function budget(env: Env, cfg: Config): number | null {
  const w = intEnv(env, 'HUNGERBAR_WIDTH') ?? intEnv(env, 'COLUMNS');
  return w === null ? null : w - 4 - cfg.widthReserve;
}

function buildLine(ids: ItemId[], st: State, cfg: Config, g: Glyphs, o: Opts): Piece[] {
  return ids.flatMap((id) => build(id, st, cfg, g, o));
}

export function lineWidth(pieces: Piece[], g: Glyphs): number {
  const text = pieces.reduce((w, p) => w + p.spans.reduce((a, s) => a + strWidth(s.t), 0), 0);
  return text + Math.max(0, pieces.length - 1) * strWidth(g.sep);
}

export function fitLine(ids: ItemId[], st: State, cfg: Config, g: Glyphs, width: number | null): Piece[] {
  const o = defaultOpts(cfg);
  let pieces = buildLine(ids, st, cfg, g, o);
  if (width === null) return pieces;
  for (const step of STEPS) {
    if (lineWidth(pieces, g) <= width) break;
    if (step.ids && !step.ids.some((id) => ids.includes(id))) continue;
    if (step.apply(o)) pieces = buildLine(ids, st, cfg, g, o);
  }
  return pieces;
}

export function encode(pieces: Piece[], cfg: Config, g: Glyphs, depth: Depth): string {
  const nb = (t: string): string => (cfg.nbsp && !g.ascii ? t.replace(/ /g, ' ') : t);
  const sep = paint(nb(g.sep), { role: 'sep', bold: cfg.bold }, depth);
  return pieces
    .map((p) => p.spans.map((s) => paint(nb(s.t), { role: s.role, bold: cfg.bold && !s.lab && !s.dim, dim: s.dim }, depth)).join(''))
    .join(sep);
}

export function renderLines(st: State, cfg: Config, g: Glyphs, depth: Depth, width: number | null): string {
  const lines = cfg.lines.map((ids) => fitLine(ids, st, cfg, g, width)).filter((l) => l.length > 0);
  if (st.cfgError) {
    const tag: Piece = { id: 'version', spans: [{ t: 'cfg!', role: 'ver', dim: true }] };
    if (lines.length) lines[lines.length - 1]!.push(tag);
    else lines.push([tag]);
  }
  return lines.map((l) => encode(l, cfg, g, depth)).join('\n');
}
