// The offhand (SPEC §0.12, 1.1.0): the emerald's keyless fixes, the pick 'em-digits' from design round 9
// (test/reference/round9/emerald.json), the stale count and the credits-out fix, a layer after the vitals and before the
// totem (src/hud/totem.ts, 1.2.0). The hotbar line is the engine's last: the offhand at cols 9-14 when the engine draws it
// (its sides at 9 and 14, its well 10-13: a 2-cell icon and a 2-cell count).
//   - The count (no key): from $100 the icon gives up its spare cell and the count has three: 100-999 in white, then
//     thousands as ' 1k'-'99k', and a yellow 99k from $100,000 (the engine's yellow cap). Below $100 it is the
//     engine's own two cells.
//   - The stale count (no key): credits read from usage.json more than 900 s ago draw the count in grey (#AAAAAA); the
//     icon keeps its colour, and the yellow cap stays yellow.
//   - Credits out (no key): a window used up with $0 of credits left: the engine still lights the sides green, as if
//     the credits paid; they are the frame grey instead, so the frame's edges are too.
// In 1.1.0 the totem lived here and followed the credits; since 1.2.0 it is the limit resets you declare, its own layer
// (src/hud/totem.ts), which moves the emerald this layer drew into slot 5 when the totem takes the offhand.
// The layer reads only what the engine drew: it draws the offhand only where cols 9-14 are exactly the engine's offhand
// for these credits (the frame's offhandSide finds it first). Anything else is left as it is.
import type { State } from '../state.ts';
import { offhandSide } from './frame.ts';
import type { Sit } from './input.ts';
import { DIV, f2Well, GREY, paying, WELL, WHITE } from './mix.ts';
import { rjust } from './py.ts';
import { merge, S, splitAt, W, type Span } from './spans.ts';
import { none } from './text.ts';

/** The emerald's green, the frame grey of the sides, the engine's yellow cap. */
export const EMERALD = '#17DD62', SIDE = '#5D5D5D', YELLOW = '#FFFF55';
/** Credits read from usage.json longer ago than this, in seconds, are drawn in grey. */
export const STALE_SECS = 900;
/** Columns of the hotbar line, [from, to): the offhand with its sides. */
export const OFFHAND: readonly [number, number] = [9, 15];

/** What the layer draws: the HUD path builds it with offhandMarks(). */
export interface OffhandMarks {
  /** The credits' whole dollars as the engine counts them (trunc of what is left); null: no offhand (no extra-usage limit). */
  cash: number | null;
  /** A window is used up (the engine's paying()): it lights the sides green. */
  paying: boolean;
  /** Credits out: a window used up and $0 left; the sides are the frame grey. */
  out: boolean;
  /** The count is old: the credits come from usage.json, fetched more than 900 s ago. */
  stale: boolean;
}

/** Nothing to draw: the engine's lines as they are. */
export const NO_OFFHAND: OffhandMarks = { cash: null, paying: false, out: false, stale: false };

/** The credits come from usage.json and were fetched more than 900 s ago (stdin's own have no `at`). */
export const staleCredits = (st: Pick<State, 'now' | 'extra'>): boolean => !!st.extra && st.extra.at !== null && st.now - st.extra.at > STALE_SECS;

/**
 * What the layer draws this render, from the port's own reading (`sit`, fromState's) and the credits' age
 * (State.extra.at): no offhand without an extra-usage limit; the whole dollars, whether a window is used up (the
 * engine's paying()) and whether the credits are out then.
 */
export function offhandMarks(st: Pick<State, 'now' | 'extra'>, sit: Sit): OffhandMarks {
  const left = sit.extra_left;
  if (none(left)) return NO_OFFHAND;
  const used = paying(sit);
  return { cash: Math.trunc(left), paying: used, out: used && !(left > 0), stale: staleCredits(st) };
}

/** A count of 2 cells after a 2-cell icon (the engine's f2Well): nothing for 0 or 1, the dollars right-aligned. */
const two = (cash: number, ink: string): Span => (cash <= 1 ? S('  ', null, WELL) : S(rjust(String(cash), 2), ink, WELL, true));
/** A count of 3 cells after a 1-cell icon, from $100: 100-999, ' 1k'-'99k', and the yellow cap. */
const three = (cash: number, ink: string): Span =>
  cash >= 1e5 ? S('99k', YELLOW, WELL, true) : S(cash >= 1000 ? rjust(`${Math.floor(cash / 1000)}k`, 3) : String(cash), ink, WELL, true);
/** An item and its count in the 4 well cells: the icon and a space, then 2 cells, or from $100 the icon and 3 cells. */
const stack = (glyph: string, fg: string, cash: number, ink: string): Span[] =>
  cash >= 100 ? [S(glyph, fg, WELL), three(cash, ink)] : [S(glyph + ' ', fg, WELL), two(cash, ink)];

/** A side of the offhand in this colour: the frame's half blocks on the frame grey. */
const side = (g: '▐' | '▌', fg: string): Span => S(g, fg, SIDE);

/** The offhand as the engine draws it for these marks (mix.ts f2Gutter, cols 9-14). */
export function engineOffhand(m: OffhandMarks & { cash: number }): Span[] {
  const well = m.cash >= 1 ? f2Well([S('◆ ', EMERALD)], m.cash) : f2Well(null, null);
  return m.paying ? [side('▐', EMERALD), ...well, side('▌', EMERALD)] : [DIV, ...well, DIV];
}

/** The offhand as the marks draw it, cols 9-14 (the totem layer moves its well to slot 5 when the totem takes the offhand). */
export function drawnOffhand(m: OffhandMarks & { cash: number }): Span[] {
  const ink = m.stale ? GREY : WHITE, c = m.cash;
  const well = c >= 1 ? stack('◆', EMERALD, c, ink) : f2Well(null, null);
  return m.paying && !m.out ? [side('▐', EMERALD), ...well, side('▌', EMERALD)] : [DIV, ...well, DIV];
}

/** The same spans: text and style alike, span by span. */
const same = (a: readonly Span[], b: readonly Span[]): boolean => JSON.stringify(merge(a)) === JSON.stringify(merge(b));

/** Cols [from, to) of a line and what is around them; null when a cluster crosses either edge. */
function cut(line: readonly Span[], [from, to]: readonly [number, number]): [Span[], Span[], Span[]] | null {
  const [head, rest] = splitAt(line, from), [mid, tail] = splitAt(rest, to - from);
  return W(head) === from && W(mid) === to - from ? [head, mid, tail] : null;
}

/**
 * The HUD's lines (the engine's, with the git state, the player's layers and the vitals: the hotbar line is the last)
 * with the offhand the marks ask for. The input is not changed.
 */
export function offhandHud(lines: readonly (readonly Span[])[], m: OffhandMarks): Span[][] {
  const out = lines.map((l) => [...l]);
  const n = out.length, hot = out[n - 1];
  if (!hot || m.cash === null || offhandSide(hot) === null) return out;
  const marks = { ...m, cash: m.cash };
  const off = cut(hot, OFFHAND);
  if (off && same(off[1], engineOffhand(marks)) && !same(off[1], drawnOffhand(marks))) out[n - 1] = merge([...off[0], ...drawnOffhand(marks), ...off[2]]);
  return out;
}
