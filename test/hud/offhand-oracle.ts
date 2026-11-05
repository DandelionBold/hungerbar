// The offhand (SPEC §0.12, 1.1.0), written for the tests and independent of src/hud/offhand.ts, from the pick in design
// round 9 (test/reference/round9/: em-digits, build.cjs emLayer('digits'), restated) and the credits-out fix, cell by cell
// on the vendored engine's render of a state. Where src/ checks the drawn hotbar line, this finds everything from the
// state, through the engine's own fromState() and paying(): the offhand is drawn when the account has an extra-usage
// limit (extra_left is given), cols 9-14 of the hotbar line (the last). The totem left this layer in 1.2.0 (the limit
// resets you declare: test/hud/totem-oracle.ts).
//   - The count: dollars = trunc(left). Below $100: 2 cells after the icon's 2, nothing for $0 and $1, else the dollars
//     right-aligned in bold white. From $100: the icon is 1 cell and the count 3, bold: the dollars to $999, then
//     trunc(dollars / 1000) and 'k' right-aligned to $99,999, then a yellow 99k. marks.stale draws white as grey (the
//     yellow stays).
//   - Credits out (a window used up, $0 left): cols 9 and 14 are a space on the frame grey.
//   - The share (1.2.2, marks.pct: credits with only the share used, which the engine is handed as that % of a limit of
//     100): left = the % left. Nothing under 1%; else the icon is 1 cell and the count 3, bold: the % left and a '%',
//     right-aligned, to 99%; from 100 a yellow 99%.
// The frame's side colour (for frameOracle): grey with the credits out, else as the engine's paying() lights it.
import { PORT, type RefLines, type RefSpan } from './ref.ts';

const GREEN = '#17DD62', SIDE = '#5D5D5D', WELL = '#201E07', WHITE = '#FFFFFF', GREY = '#AAAAAA', YELLOW = '#FFFF55';
const FRAME_GREY = '#5D5D5D';

/** The offhand's input, as the tests hand it: the credits older than 900 s; the count a % left (1.2.2, absent: dollars). */
export interface OracleOffhand { stale: boolean; pct?: boolean }
export const QUIET_OFFHAND: OracleOffhand = { stale: false };

export interface Cl { g: string; w: number; fg: string | undefined; bg: string | undefined; bold: boolean }
export function clustersOf(line: readonly RefSpan[]): Cl[] {
  const out: Cl[] = [];
  for (const s of line) PORT.clusters(s.t, (g: string, w: number) => out.push({ g, w, fg: s.fg || undefined, bg: s.bg || undefined, bold: !!s.bold }));
  return out;
}
export function runs(cs: readonly Cl[]): RefSpan[] {
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
export function at(cs: readonly Cl[], col: number): number {
  let c = 0;
  for (let i = 0; i < cs.length; i++) {
    if (c === col) return i;
    c += cs[i]!.w;
  }
  throw new Error(`no cluster starts at col ${col}`);
}
export const cell = (g: string, fg: string | undefined, bg: string | undefined, bold = false): Cl => ({ g, w: 1, fg, bg, bold });

interface Read { left: number; dollars: number; used: boolean }
/** The engine's own reading of the credits and the windows; null without an offhand. */
function readOf(state: unknown): Read | null {
  const sit = PORT.fromState(state) as { extra_left: number | null; s5_left: number | null; wk_left: number | null };
  if (PORT.none(sit.extra_left)) return null;
  const left = sit.extra_left!;
  return { left, dollars: Math.trunc(left), used: PORT.paying(sit) as boolean };
}

/** The frame's side colour for this state, or null without an offhand. */
export function offhandSideOracle(state: unknown, _m: OracleOffhand = QUIET_OFFHAND): string | null {
  const r = readOf(state);
  if (!r) return null;
  return r.used && r.left > 0 ? GREEN : FRAME_GREY;
}

/** The count's cells for `dollars` in `room` cells (2 after a 2-cell icon, 3 after a 1-cell one). */
function countCells(dollars: number, room: 2 | 3, ink: string): Cl[] {
  let t: string, fg = ink;
  if (room === 2) {
    if (dollars <= 1) return [cell(' ', undefined, WELL), cell(' ', undefined, WELL)];
    t = String(dollars).padStart(2, ' ');
  } else if (dollars >= 100000) {
    t = '99k';
    fg = YELLOW;
  } else t = dollars >= 1000 ? `${Math.trunc(dollars / 1000)}k`.padStart(3, ' ') : String(dollars);
  return [...t].map((g) => cell(g, fg, WELL, true));
}

/** The share's 3 cells after a 1-cell icon (1.2.2): the % left with its '%', right-aligned; from 100 the yellow 99%. */
function shareCells(left: number, ink: string): Cl[] {
  const t = left >= 100 ? '99%' : `${left}%`.padStart(3, ' ');
  return [...t].map((g) => cell(g, left >= 100 ? YELLOW : ink, WELL, true));
}

/** The offhand on the engine's render of `state` (with the layers before it already drawn). */
export function offhandOracle(lines: RefLines, state: unknown, m: OracleOffhand): RefLines {
  const copy = lines.map((l) => l.map((s) => ({ ...s })));
  const r = readOf(state);
  if (!r || copy.length === 0) return copy;
  const row = copy.length - 1, cs = clustersOf(copy[row]!);
  const ink = m.stale ? GREY : WHITE;
  const put = (col: number, cls: Cl[]): void => cls.forEach((c, k) => { cs[at(cs, col + k)] = c; });
  const item = (glyph: string, fg: string): void => {
    if (r.dollars >= 100) put(10, [cell(glyph, fg, WELL), ...countCells(r.dollars, 3, ink)]);
    else put(10, [cell(glyph, fg, WELL), cell(' ', fg, WELL), ...countCells(r.dollars, 2, ink)]);
  };
  if (r.dollars >= 1 && m.pct) put(10, [cell('◆', GREEN, WELL), ...shareCells(r.dollars, ink)]);   // the share left
  else if (r.dollars >= 1) item('◆', GREEN);               // the engine's emerald, or from $100 its 3-cell count
  if (r.used && !(r.left > 0)) {
    put(9, [cell(' ', undefined, SIDE)]);
    put(14, [cell(' ', undefined, SIDE)]);
  }
  copy[row] = runs(cs);
  return copy;
}
