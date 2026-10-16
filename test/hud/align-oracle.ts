// The HUD's centring (SPEC §0.9, 0.6.0), written for the tests and independent of src/hud/align.ts, on what the status
// line prints. The offset is found by search, not by the formula: the largest shift that keeps the hotbar's centre
// column (the middle of cols 16-61, rounded right: 39) at or before the budget's middle column floor(B / 2) and the widest
// line inside the budget; 0 when the width is unknown or no shift fits. A centred line is that many U+2800 before the
// line's bytes (an unstyled lead adds no SGR), so the shift is applied to the encoded text, line by line.
import { cellWidth, type RefLines } from './ref.ts';

const BLANK = '⠀';
/** The hotbar's columns, from the plan (§9): 16-61. */
const FIRST = 16, LAST = 61;
const CENTRE = Math.ceil((FIRST + LAST) / 2);

/** The shift a centred HUD takes in `budget` (null: unknown), with its widest line `widest` cells wide. */
export function centreOracle(budget: number | null, widest: number): number {
  if (budget === null) return 0;
  let o = 0;
  while (CENTRE + o + 1 <= Math.floor(budget / 2) && widest + o + 1 <= budget) o++;
  return o;
}

/** The widest of the lines, in WT cells as the engine measures them. */
export const widestOf = (lines: RefLines): number => lines.reduce((w, l) => Math.max(w, cellWidth(l.map((s) => s.t).join(''))), 0);

/** The status line's bytes for `lines` (encoded as `text`, at the left edge) as a centred HUD prints them in `budget`. */
export function centredText(text: string, lines: RefLines, budget: number | null): string {
  const o = centreOracle(budget, widestOf(lines));
  return text.split('\n').map((l) => (l ? BLANK.repeat(o) + l : l)).join('\n');
}

/** The budget the gate and the centring read: HUNGERBAR_WIDTH, else COLUMNS, minus 4 and widthReserve; null when unknown. */
export function budgetOf(env: Record<string, string | undefined>, widthReserve = 0): number | null {
  const w = [env.HUNGERBAR_WIDTH, env.COLUMNS].map((v) => (v && /^\d+$/.test(v.trim()) && Number(v) > 0 ? Number(v) : null)).find((v) => v !== null);
  return w === undefined || w === null ? null : w - 4 - widthReserve;
}
