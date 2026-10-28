// Where the HUD sits in the status line (SPEC §0.9, 0.6.0): with hud.align "center" the whole HUD moves right as one
// block, so the hotbar sits in the middle of the status-line area like Minecraft's. A layer after the hotbar's frame
// (frame.ts) and before the writer (look.ts encode): the engine's lines and the frame are not changed, and "left" changes
// nothing at all ("center" is the default since SPEC §0.10).
//   - The budget is the gate's (layout.ts budget: HUNGERBAR_WIDTH or COLUMNS, minus 4 and widthReserve). Claude Code
//     passes COLUMNS on every run, so a resized window re-centres on the next render.
//   - offset = clamp(floor(B / 2) - 39, 0, max(0, B - W)): 39 is the hotbar's centre column (it sits at cols 16-61) and W
//     the widest line of this render in WT cells, so no line is pushed past the budget. An unknown width, or no room: 0.
//   - Every line (the boss line, the engine's four and the frame row) gets the same lead of U+2800 cells, unstyled, before
//     its first cell, so the grid stays aligned; the own U+2800 lead of the frame row (and of the boss line, SPEC §0.11)
//     simply grows. Claude Code trims every line, and U+2800 (braille pattern blank) is not whitespace: the lead
//     survives the trim, 1 cell wide, drawing nothing.
import type { HudAlign } from '../config.ts';
import { BLANK } from './frame.ts';
import { S, W, type Span } from './spans.ts';

/** The hotbar's centre column: it sits at cols 16-61. */
export const HOTBAR_CENTRE = 39;

/** clamp(floor(B / 2) - 39, 0, max(0, B - W)) for a budget B and the widest line W; 0 when the budget is unknown. */
export function centreOffset(budget: number | null, widest: number): number {
  if (budget === null) return 0;
  return Math.max(0, Math.min(Math.floor(budget / 2) - HOTBAR_CENTRE, budget - widest));
}

/** How far this render moves right: centreOffset of its widest line for "center", 0 for "left". */
export function hudOffset(align: HudAlign, budget: number | null, lines: readonly (readonly Span[])[]): number {
  return align === 'center' ? centreOffset(budget, lines.reduce((w, l) => Math.max(w, W(l)), 0)) : 0;
}

/**
 * The lines with `offset` U+2800 cells before each one's first cell, unstyled. A first span with no style (the U+2800
 * lead of the frame row or of the boss line) takes them into its own text; a line with no cells stays empty. The input
 * is not changed.
 */
export function shiftHud(lines: readonly (readonly Span[])[], offset: number): Span[][] {
  if (offset <= 0) return lines.map((l) => [...l]);
  const lead = BLANK.repeat(offset);
  return lines.map(([first, ...rest]) => {
    if (!first) return [];
    return !first.fg && !first.bg && !first.bold ? [{ ...first, t: lead + first.t }, ...rest] : [S(lead), first, ...rest];
  });
}
