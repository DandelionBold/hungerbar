// The hotbar's frame (SPEC §0.9, 0.5.1): the bottom edge chosen for the HUD, a layer after the engine. It reads
// only what the engine drew, so the ported engine (wt, py, text, spans, input, mix, fable) stays the vendored
// reference's, span for span, and the fable options are as the engine draws them. Columns are WT cells of the hotbar
// line (the last engine line): the offhand at 9-14 when it is drawn (9 and 14 are its sides), a gap at 15, the hotbar at
// 16-61 (16-21 the selected slot inside the mint frame).
//   - The bottom edge row, a new last line: U+1FB82 (upper one quarter block, which Windows Terminal draws itself in both
//     icon styles) under every hotbar cell, mint under the selected slot and the frame grey under the rest, and under the
//     offhand, when it is drawn, in its side colour. Every other cell up to col 61 is U+2800 (braille pattern blank):
//     Claude Code trims every line and U+2800 is not whitespace, so the edge keeps its columns. Nothing after col 61 and
//     no backgrounds.
//   - The offhand's top edge: when the offhand is drawn, cols 9-14 of the XP-bar line (the line above the hotbar) become
//     U+2582 (lower one quarter block) in its side colour, but only when all six are unstyled spaces there; a context
//     label that reaches into them leaves the line as it is. The hotbar's own top is the XP bar, as the engine draws it.
//   - The boss line without its name (SPEC §0.11, 1.0.0): with the boss bar on top (the first of the engine's 5 lines),
//     the gutter before the bar, cols 0-15, where the engine writes the scoped limit's name ('Fable'), becomes U+2800,
//     unstyled. The line just below names the model in use, and the bar only ever shows that model's limit, so the name
//     said nothing new. The bar, the % and the reset keep their columns, over the hotbar; U+2800 keeps the line from
//     starting with whitespace that Claude Code would trim.
import { BOSS } from './fable.ts';
import { merge, S, splitAt, W, type Span } from './spans.ts';
import { cellWidth } from './wt.ts';

/** U+1FB82, the bottom edge's cell (the boss bar's glyph, fable.ts BOSS). */
export const EDGE = '\u{1FB82}';
/** U+2582, the offhand's top edge (the XP bar's glyph). */
export const TOP = '▂';
/** U+2800, a blank cell that Claude Code does not trim. */
export const BLANK = '\u2800';
/** The selection frame's mint and the hotbar's frame grey, as the engine draws them (mix.ts F2SEL_L, DIV). */
export const MINT = '#D5E8D0', FRAME = '#5D5D5D';
/** Columns of the hotbar line, [from, to): the offhand, the hotbar and its selected slot. */
export const OFFHAND: readonly [number, number] = [9, 15], HOTBAR: readonly [number, number] = [16, 62], SELECTED: readonly [number, number] = [16, 22];

/** The span that covers column `col` of a line, or null past its end. */
export function spanAt(line: readonly Span[], col: number): Span | null {
  let c = 0;
  for (const s of line) {
    c += cellWidth(s.t);
    if (col < c) return s;
  }
  return null;
}

/**
 * The offhand's side colour, read from the hotbar line, or null when no offhand is drawn. The engine draws the offhand
 * only for an account with an extra-usage limit, its left side at col 9: a frame-grey cell (background #5D5D5D, no ink),
 * or, while the extra credits pay, '▐' in green (#17DD62) on it. Without an offhand no gutter cell (cols 0-15) has a
 * background; with one, cols 9-14 do (its sides, and its well between them). The side colour is that cell's ink when it
 * has one, else its background.
 */
export function offhandSide(hotbar: readonly Span[]): string | null {
  const s = spanAt(hotbar, OFFHAND[0]);
  return s && s.bg ? s.fg || s.bg : null;
}

/** The XP-bar line with the offhand's top edge in `side`, or the line as it is when cols 9-14 are not six unstyled spaces. */
export function offhandTop(line: readonly Span[], side: string): Span[] {
  const [head, rest] = splitAt(line, OFFHAND[0]);
  const [mid, tail] = splitAt(rest, OFFHAND[1] - OFFHAND[0]);
  const blank = W(head) === OFFHAND[0] && W(mid) === OFFHAND[1] - OFFHAND[0] && mid.every((s) => /^ +$/.test(s.t) && !s.fg && !s.bg && !s.bold);
  return blank ? merge([...head, S(TOP.repeat(OFFHAND[1] - OFFHAND[0]), side), ...tail]) : [...line];
}

/** The bottom edge row: 62 cells, U+1FB82 under the hotbar (and the offhand, when `side` is its colour), U+2800 elsewhere. */
export function edgeRow(side: string | null): Span[] {
  const off = OFFHAND[1] - OFFHAND[0];
  return merge([
    S(BLANK.repeat(OFFHAND[0])),
    side ? S(EDGE.repeat(off), side) : S(BLANK.repeat(off)),
    S(BLANK.repeat(HOTBAR[0] - OFFHAND[1])),
    S(EDGE.repeat(SELECTED[1] - SELECTED[0]), MINT),
    S(EDGE.repeat(HOTBAR[1] - SELECTED[1]), FRAME),
  ]);
}

/**
 * The boss line without its name: when the bar starts at col 16 as the engine draws it (the cells before it are exactly
 * 16, the last an unstyled space of the name's padding, and the cell at col 16 is the boss bar's U+1FB82), those 16
 * cells become U+2800, unstyled; the bar, the % and the reset stay where they are. Any other line comes back as it is
 * (a copy).
 */
export function bossGutter(line: readonly Span[]): Span[] {
  const [gutter, rest] = splitAt(line, HOTBAR[0]);
  const pad = gutter[gutter.length - 1], bar = rest[0];
  const drawn = W(gutter) === HOTBAR[0] && pad!.t.endsWith(' ') && !pad!.fg && !pad!.bg && !pad!.bold && bar !== undefined && bar.t.startsWith(BOSS);
  return drawn ? merge([S(BLANK.repeat(HOTBAR[0])), ...rest]) : [...line];
}

/**
 * The HUD as it is drawn: the engine's lines (4, or 5 with the boss bar on top; the last is the hotbar line, the one
 * above it the XP bar) with the boss line's gutter blank (bossGutter), the offhand's top edge on the XP-bar line and the
 * bottom edge row added under the hotbar, so 5 lines, or 6. The engine's lines and spans are not changed.
 */
export function frameHud(lines: readonly (readonly Span[])[]): Span[][] {
  const out = lines.map((l) => [...l]);
  const n = out.length, side = offhandSide(out[n - 1]!);
  if (n === 5) out[0] = bossGutter(out[0]!);
  if (side) out[n - 2] = offhandTop(out[n - 2]!, side);
  out.push(edgeRow(side));
  return out;
}
