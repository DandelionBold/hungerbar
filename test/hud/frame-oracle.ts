// The hotbar's frame (SPEC §0.9, 0.5.1), written for the tests and independent of src/hud/frame.ts, as approved
// it (the design's frame lab: frames4.png, mock4-gen.cjs): cell by cell, on the vendored engine's render of a state.
// Where src/ reads the offhand from the drawn hotbar line (col 9's background and ink), this reads it from the state,
// through the engine's own fromState() and paying(): the offhand is drawn when the account has an extra-usage limit
// (sit.extra_left is given), its sides green (#17DD62) while paying, else the frame grey (#5D5D5D).
//   - The XP-bar line (the second last): when the offhand is drawn and its cells 9-14 are each an unstyled space, they
//     become U+2582 in the side colour. Its gutter is the context label (ASCII) and its padding, so it is read code point
//     by code point; the changed line is regrouped into runs of equal style, which is what merge() makes of a line.
//   - A new last line, cols 0-61 and nothing after: U+1FB82 under cols 16-21 in mint (#D5E8D0) and 22-61 in the frame
//     grey, under 9-14 in the side colour when the offhand is drawn; U+2800 in every other cell; no backgrounds.
//   - The boss line without its name (SPEC §0.11, 1.0.0): the engine draws 5 lines only with the boss bar on top, and the
//     bar starts at col 16 after the scoped limit's name, padded. Its first 16 cells become U+2800, unstyled, WT cluster
//     by cluster (a name may hold wide or joined clusters); every cell from col 16 on stays as the engine drew it.
import { PORT, cellWidth, type RefLines, type RefSpan } from './ref.ts';

const EDGE = '\u{1FB82}', TOP = '▂', BLANK = '\u2800';
const MINT = '#D5E8D0', GREY = '#5D5D5D', GREEN = '#17DD62';

/** One code point with its span's style (falsy fg, bg and bold are no style, as the writer reads them). */
interface Cell { ch: string; fg: string | undefined; bg: string | undefined; bold: boolean }

const cellsOf = (line: readonly RefSpan[]): Cell[] =>
  line.flatMap((s) => Array.from(s.t, (ch) => ({ ch, fg: s.fg || undefined, bg: s.bg || undefined, bold: !!s.bold })));

/** Cells back into spans: one per run of equal style, each key present only when set (as the engine's S() makes them). */
function runs(cells: readonly Cell[]): RefSpan[] {
  const out: RefSpan[] = [];
  let last: Cell | undefined;
  for (const c of cells) {
    if (last && last.fg === c.fg && last.bg === c.bg && last.bold === c.bold) out[out.length - 1]!.t += c.ch;
    else {
      const s: RefSpan = { t: c.ch };
      if (c.fg) s.fg = c.fg;
      if (c.bg) s.bg = c.bg;
      if (c.bold) s.bold = true;
      out.push(s);
    }
    last = c;
  }
  return out;
}

/** The offhand's side colour for this state, by the engine's own reading of it, or null when there is no offhand. */
export function sideOf(state: unknown): string | null {
  const sit = PORT.fromState(state) as { extra_left: unknown };
  if (PORT.none(sit.extra_left)) return null;
  return PORT.paying(sit) ? GREEN : GREY;
}

/** The XP-bar line with the offhand's top edge, or null when cells 9-14 are not six unstyled spaces. */
export function topEdge(line: readonly RefSpan[], side: string): RefSpan[] | null {
  const cells = cellsOf(line);
  let col = 0;
  const at = new Map<number, number>();                    // column -> index of the code point that starts there
  for (const [i, c] of cells.entries()) {
    if (col > 15) break;
    at.set(col, i);
    col += cellWidth(c.ch);
  }
  for (let k = 9; k <= 14; k++) {
    const i = at.get(k), c = i === undefined ? undefined : cells[i];
    if (!c || c.ch !== ' ' || c.fg || c.bg || c.bold) return null;
  }
  for (let k = 9; k <= 14; k++) cells[at.get(k)!] = { ch: TOP, fg: side, bg: undefined, bold: false };
  return runs(cells);
}

/** The bottom edge row, cell by cell. */
export function bottomEdge(side: string | null): RefSpan[] {
  const cells: Cell[] = [];
  for (let col = 0; col < 62; col++) {
    const fg = col >= 16 && col < 22 ? MINT : col >= 22 ? GREY : col >= 9 && col < 15 ? side ?? undefined : undefined;
    cells.push({ ch: fg ? EDGE : BLANK, fg, bg: undefined, bold: false });
  }
  return runs(cells);
}

/** The boss line with its first 16 cells as U+2800, unstyled; throws when no cluster starts at col 16. */
export function namelessBoss(line: readonly RefSpan[]): RefSpan[] {
  const cells: Cell[] = [];
  let col = 0;
  for (const s of line) {
    PORT.clusters(s.t, (g: string, w: number) => {
      if (col >= 16) cells.push({ ch: g, fg: s.fg || undefined, bg: s.bg || undefined, bold: !!s.bold });
      else if (col + w > 16) throw new Error(`the boss line has a cluster across col 16: ${JSON.stringify(g)}`);
      else for (let k = 0; k < w; k++) cells.push({ ch: BLANK, fg: undefined, bg: undefined, bold: false });
      col += w;
    });
  }
  return runs(cells);
}

/** The engine's render of `state` with the hotbar's frame (and, on 5 lines, the boss line without its name). */
export function frameOracle(lines: RefLines, state: unknown): RefLines {
  const side = sideOf(state), xp = lines[lines.length - 2]!;
  const top = side ? topEdge(xp, side) : null;
  const head = lines.slice(0, -2).map((l, i) => (i === 0 && lines.length === 5 ? namelessBoss(l) : l));
  return [...head, top ?? xp, lines[lines.length - 1]!, bottomEdge(side)];
}
