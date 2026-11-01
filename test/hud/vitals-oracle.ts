// The vitals (SPEC §0.12, 1.1.0), written for the tests and independent of src/hud/vitals.ts, from the picks in design
// round 9 (test/reference/round9/: ultra-apple, stale-tilde and pay-poison; the design's build.cjs ultraGutter, hearts,
// staleLayer and payLayer, restated), cluster by cluster on the vendored engine's render of a state. Where src/ reads
// the gutter, the hearts and the weekly from the drawn hearts line, this finds every column from the state, through the
// engine's own fromState(), icons10(), t5() and pyRound(): the hearts line is the third from the bottom, its 5-hour %
// ends at col 14 (so the space before it is at 14 - its length), heart k sits at col 16 + 2k, the drumsticks end at
// col 61 and the weekly % starts at col 63.
//   - Ultra (marks.ultra, the 5-hour unknown): cols 0-15 a yellow ☼, 13 spaces, a bold gold ∞ and a space; the ten
//     hearts gold.
//   - Poison (marks.poison, the 5-hour % left at 0 or less, credits above 0 left): cols 0-15 the day's icon by the share
//     of the window gone (☼ yellow below 0.6, ☼ orange below 0.8, else ☾ grey), the clock in grey, spaces, the % in bold
//     heart red and a space; max(1, round(10 x left / limit)) hearts in poison green, the rest dark.
//   - Stale (marks.stale5 with the 5-hour known, marks.staleWk with the weekly known): the space before the % a grey ~,
//     the % and the lit hearts (red, or poison's green) at 60%; the space at col 62 a grey ~, the weekly % and the
//     drumsticks at 60%. Each colour is shaded channel by channel, rounded half up, as the design's dim().
// A heart's space takes its heart's colour where the engine coloured it: the last one, trimmed off a line that ends with
// the hearts or left plain by a fable option's padding, stays as drawn. Nothing that applies: the lines as they are.
import { PORT, type RefLines, type RefSpan } from './ref.ts';

const HEART = '#FF5555', DARK = '#3F3F3F', GREY = '#AAAAAA', FOOD = '#E0A458';
const SUN = '#FFFF55', DUSK = '#FFAA00', GOLD = '#FFD43B', POISON = '#8DB33A';

/** The vitals' input, as the tests hand it: Ultra drawn (hud.ultra on, no 5-hour window), poison on, which limits are last-known. */
export interface OracleVitals { ultra: boolean; poison: boolean; stale5: boolean; staleWk: boolean }
export const QUIET_VITALS: OracleVitals = { ultra: false, poison: false, stale5: false, staleWk: false };

/** One WT cluster with its width and its span's style (falsy fg, bg and bold are no style). */
interface Cl { g: string; w: number; fg: string | undefined; bg: string | undefined; bold: boolean }
function clustersOf(line: readonly RefSpan[]): Cl[] {
  const out: Cl[] = [];
  for (const s of line) PORT.clusters(s.t, (g: string, w: number) => out.push({ g, w, fg: s.fg || undefined, bg: s.bg || undefined, bold: !!s.bold }));
  return out;
}
const cl = (t: string, fg?: string, bold = false): Cl[] => {
  const out: Cl[] = [];
  PORT.clusters(t, (g: string, w: number) => out.push({ g, w, fg, bg: undefined, bold }));
  return out;
};
/** Clusters back into spans, one per run of equal style (what merge() makes of a line). */
function runs(cs: readonly Cl[]): RefSpan[] {
  const out: RefSpan[] = [];
  let last: Cl | undefined;
  for (const c of cs) {
    if (last && last.fg === c.fg && last.bg === c.bg && last.bold === c.bold) out[out.length - 1]!.t += c.g;
    else {
      const s: RefSpan = { t: c.g };
      if (c.fg) s.fg = c.fg;
      if (c.bg) s.bg = c.bg;
      if (c.bold) s.bold = true;
      out.push(s);
    }
    last = c;
  }
  return out;
}
/** The index of the cluster that starts at `col`, or -1. */
function at(cs: readonly Cl[], col: number): number {
  let c = 0;
  for (let i = 0; i < cs.length; i++) {
    if (c === col) return i;
    c += cs[i]!.w;
  }
  return -1;
}
/** The design's dim(): each channel x 0.6, rounded half up. */
const dim = (hex: string): string => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.6).toString(16).toUpperCase().padStart(2, '0')).join('');

/** The vitals on the engine's render of `state` (with the git state and the player's layers already drawn). */
export function vitalsOracle(lines: RefLines, state: unknown, m: OracleVitals): RefLines {
  const copy = lines.map((l) => l.map((s) => ({ ...s })));
  const row = copy.length - 3;
  if (row < 0) return copy;
  const sit = PORT.fromState(state) as { s5_left: number | null; s5_reset: number; wk_left: number | null; extra_left: number | null; extra_limit: number };
  const s5 = sit.s5_left, wk = sit.wk_left;
  const ultra = m.ultra && s5 === null;
  const poison = m.poison && s5 !== null && s5 <= 0 && sit.extra_left !== null && sit.extra_left > 0;
  const stale5 = m.stale5 && s5 !== null, staleWk = m.staleWk && wk !== null;
  if (!ultra && !poison && !stale5 && !staleWk) return copy;
  let cs = clustersOf(copy[row]!);
  // the hearts: `lit` of them in `fg`, the rest dark; a space keeps no colour where the engine gave it none
  const hearts = (lit: number, fg: string): void => {
    for (let k = 0; k < 10; k++) {
      const colour = k < lit ? fg : DARK, h = at(cs, 16 + 2 * k), sp = at(cs, 17 + 2 * k);
      cs[h] = { ...cs[h]!, fg: colour };
      if (sp >= 0 && cs[sp]!.fg) cs[sp] = { ...cs[sp]!, fg: colour };
    }
  };
  const tail = (): Cl[] => cs.slice(at(cs, 16));
  if (ultra) {
    cs = [...cl('☼', SUN), ...cl(' '.repeat(13)), ...cl('∞', GOLD, true), ...cl(' '), ...tail()];
    hearts(10, GOLD);
  }
  if (poison || stale5) {
    const p = PORT.pyStr(s5) + '%', pc = 15 - p.length;              // the %'s first column
    const lit = poison ? Math.max(1, PORT.pyRound(sit.extra_left! / sit.extra_limit * 10)) : PORT.icons10(s5) as number;
    const fg = poison ? POISON : HEART;
    if (poison) {
      const gone = 1 - sit.s5_reset / 300;
      const dayCl = gone < 0.6 ? cl('☼ ', SUN) : gone < 0.8 ? cl('☼ ', DUSK) : cl('☾ ', GREY);
      const head = [...dayCl, ...cl(PORT.t5(sit.s5_reset), GREY)];
      const width = head.reduce((w, c) => w + c.w, 0);
      cs = [...head, ...cl(' '.repeat(pc - width)), ...cl(p, HEART, true), ...cl(' '), ...tail()];
    }
    if (stale5) {
      cs[at(cs, pc - 1)] = { ...cl('~', GREY)[0]! };
      for (let c = pc; c < 15; c++) cs[at(cs, c)] = { ...cs[at(cs, c)]!, fg: dim(HEART) };
    }
    hearts(lit, stale5 ? dim(fg) : fg);
  }
  if (staleWk) {
    const f = PORT.icons10(wk) as number, pw = PORT.pyStr(wk) + '%';
    for (let k = 0; k < f; k++) cs[at(cs, 62 - 2 * (f - k))] = { ...cs[at(cs, 62 - 2 * (f - k))]!, fg: dim(FOOD) };
    cs[at(cs, 62)] = { ...cl('~', GREY)[0]! };
    for (let c = 63; c < 63 + pw.length; c++) cs[at(cs, c)] = { ...cs[at(cs, c)]!, fg: dim(wk! <= 10 ? HEART : FOOD) };
  }
  copy[row] = runs(cs);
  return copy;
}
