// Phantoms over a long session (SPEC §0.9, 0.7.0): the 'phantoms' pick from design round 8
// (test/reference/round8/toolong.json), a layer after the engine. Four signs say a session has run long and a /clear
// would help: 100 or more prompts, 4 hours or more, 2 or more compactions, context at 70% or more. With hud.phantoms on,
// phantoms circle in line 1's empty sky, between the held item's name and the cache bubbles (cols 23-41):
//   - one sign (getting long): one small, dim phantom far away, at cols 33-34;
//   - two or more (too long): that many big phantoms with glowing green eyes, three cells each, high or swooping low,
//     at fixed places (2: cols 30 and 35; 3: 26, 31, 36; 4: 24, 28, 32, 36);
//   - no sign: a clear sky.
// The glyphs are block sextants (U+1FB05 U+1FB08 U+1FB0B U+1FB16 U+1FB22 U+1FB2D), which Windows Terminal draws itself.
// The layer reads only what the engine drew: line 1 is the fourth line from the bottom (the boss bar, when drawn, sits
// above it). A phantom is drawn only where its cells and the cell before it are empty sky (unstyled spaces, or past the
// line's end, which it pads with spaces), so a long item name keeps its room and the phantoms in its way stay away.
import { merge, S, splitAt, W, type Span } from './spans.ts';

/** The far phantom's dim blue, the big ones' wings and their eyes. */
export const PH_DIM = '#3B4673', PH_WING = '#5468B0', PH_EYES = '#7DFF5A';
/** A small phantom far away (wings up, no body); a big one high (its body in the middle row) and swooping low. */
export const FAR = ['\u{1FB08}', '\u{1FB05}'], HIGH = ['\u{1FB08}', '\u{1FB0B}', '\u{1FB05}'], LOW = ['\u{1FB22}', '\u{1FB2D}', '\u{1FB16}'];
/** Where the big phantoms fly, by how many there are: [first column, shape]. */
export const SPOTS: Readonly<Record<number, ReadonlyArray<readonly [number, readonly string[]]>>> = {
  2: [[30, HIGH], [35, LOW]],
  3: [[26, HIGH], [31, LOW], [36, HIGH]],
  4: [[24, HIGH], [28, LOW], [32, HIGH], [36, LOW]],
};
/** The far phantom's column. */
export const FAR_COL = 33;

/** The thresholds of the four signs. */
export const LONG = { turns: 100, secs: 4 * 3600, compactions: 2, ctxPct: 70 } as const;

/** What the signs are read from: the engine's counts and context %, and how long the session has run (null: unknown). */
export interface Session { turns: number; compactions: number; ctxPct: number; secs: number | null }

/** How many of the four signs of a long session hold, 0-4. */
export function signs(s: Session): number {
  return [s.turns >= LONG.turns, s.secs !== null && s.secs >= LONG.secs, s.compactions >= LONG.compactions, s.ctxPct >= LONG.ctxPct].filter(Boolean).length;
}

/** The phantoms for `n` signs, each as [first column, its cells]. */
export function flock(n: number): Array<[number, Span[]]> {
  if (n <= 0) return [];
  if (n === 1) return [[FAR_COL, FAR.map((t) => S(t, PH_DIM))]];
  return SPOTS[Math.min(n, 4)]!.map(([col, shape]) => [col, shape.map((t, i) => S(t, i === 1 ? PH_EYES : PH_WING))]);
}

/** Cells [from, to) of a line are empty sky: unstyled spaces, or past its end. */
function sky(line: readonly Span[], from: number, to: number): boolean {
  const [, rest] = splitAt(line, from);
  const [mid] = splitAt(rest, to - from);
  return mid.every((s) => /^ +$/.test(s.t) && !s.fg && !s.bg && !s.bold);
}

/**
 * The HUD's lines (the engine's: line 1 is the fourth from the bottom) with the phantoms of `n` signs in line 1's sky.
 * The input is not changed.
 */
export function phantomHud(lines: readonly (readonly Span[])[], n: number): Span[][] {
  const out = lines.map((l) => [...l]);
  const at = out.length - 4;
  if (at < 0) return out;
  let line = out[at]!, drawn = false;
  for (const [col, cells] of flock(n)) {
    const w = W(cells);
    if (!sky(line, col - 1, col + w)) continue;
    const width = W(line);
    const [head, rest] = splitAt(width < col ? [...line, S(' '.repeat(col - width))] : line, col);
    line = [...head, ...cells, ...splitAt(rest, w)[1]];
    drawn = true;
  }
  if (drawn) out[at] = merge(line);
  return out;
}
