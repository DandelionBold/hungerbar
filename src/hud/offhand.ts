// The offhand (SPEC §0.12, 1.1.0): the picks from design round 9, 'totem-mix' (test/reference/round9/totem-mix.json)
// and 'em-digits' (emerald.json), the stale count and the credits-out fix, a layer after the vitals and before the
// frame. The hotbar line is the engine's last: the offhand at cols 9-14 when the engine draws it (its sides at 9 and 14,
// its well 10-13: a 2-cell icon and a 2-cell count), hotbar slot 5 at cols 37-40 (its sides at 36 and 41).
//   - The totem (hud.totem on, more than $0 of credits left): while no window is used up and none is at 1-10% left, it
//     waits in slot 5: a gold ☥ (#FFC83D) on the well, no count. When a window drops to 1-10% left (and none is used
//     up) it swaps into the offhand: slot 5 stays empty and the offhand shows ☥ with the dollars where the emerald was,
//     between the grey sides. When a window then hits 0 it pops for 30 s (the shown-file's until.pop, src/shown.ts):
//     ☥✦ and the dollars between gold sides (▐ ▌ #FFC83D on the frame grey), so the frame's edges above and below turn
//     gold with them. After the pop the totem is used: while a window stays used up, slot 5 is empty and the offhand is
//     the engine's paying emerald, its sides green. No credits, no totem.
//   - The count (no key): from $100 the icon gives up its spare cell and the count has three: 100-999 in white, then
//     thousands as ' 1k'-'99k', and a yellow 99k from $100,000 (the engine's yellow cap). Below $100 it is the
//     engine's own two cells. The totem's count is the same; the pop's ✦ takes a cell, so from $100 the pop shows ☥
//     and the three cells without it.
//   - The stale count (no key): credits read from usage.json more than 900 s ago draw the count in grey (#AAAAAA); the
//     icon keeps its colour, and the yellow cap stays yellow.
//   - Credits out (no key): a window used up with $0 of credits left: the engine still lights the sides green, as if
//     the credits paid; they are the frame grey instead, so the frame's edges are too.
// The layer reads only what the engine drew: it draws the offhand only where cols 9-14 are exactly the engine's offhand
// for these credits (the frame's offhandSide finds it first), and the totem in slot 5 only where cols 36-41 are the
// plain empty well between the frame grey's sides. Anything else is left as it is.
import type { Config } from '../config.ts';
import type { ShownNow } from '../shown.ts';
import type { State } from '../state.ts';
import { offhandSide } from './frame.ts';
import type { Sit } from './input.ts';
import { DIV, f2Well, GREY, icons10, paying, WELL, WHITE } from './mix.ts';
import { rjust } from './py.ts';
import { merge, S, splitAt, W, type Span } from './spans.ts';
import { none } from './text.ts';

/** The totem's gold, the emerald's green, the frame grey of the sides, the engine's yellow cap. */
export const TOTEM = '#FFC83D', EMERALD = '#17DD62', SIDE = '#5D5D5D', YELLOW = '#FFFF55';
/** The Totem of Undying and the pop's spark. */
export const ANKH = '☥', SPARK = '✦';
/** Credits read from usage.json longer ago than this, in seconds, are drawn in grey. */
export const STALE_SECS = 900;
/** A window at this many % left or less (and above 0) is dying: the totem swaps into the offhand. */
export const DYING = 10;
/** Columns of the hotbar line, [from, to): the offhand with its sides, and slot 5 with its sides. */
export const OFFHAND: readonly [number, number] = [9, 15], SLOT5: readonly [number, number] = [36, 42];
/** Slot 5's totem: ☥ on the well, no count. */
export const SLOT5_TOTEM: readonly Span[] = [S(ANKH + ' ', TOTEM, WELL), S('  ', null, WELL)];

/** Where the totem is: waiting in slot 5, swapped into the offhand, popping there; null for none. */
export type TotemAt = 'slot5' | 'offhand' | 'pop' | null;

/** What the layer draws: the HUD path builds it with offhandMarks(). */
export interface OffhandMarks {
  /** The credits' whole dollars as the engine counts them (trunc of what is left); null: no offhand (no extra-usage limit). */
  cash: number | null;
  /** A window is used up (the engine's paying()): it lights the sides green. */
  paying: boolean;
  /** Credits out: a window used up and $0 left; the sides are the frame grey. */
  out: boolean;
  /** The totem (hud.totem on, more than $0 left). */
  totem: TotemAt;
  /** The count is old: the credits come from usage.json, fetched more than 900 s ago. */
  stale: boolean;
}

/** Nothing to draw: the engine's lines as they are. */
export const NO_OFFHAND: OffhandMarks = { cash: null, paying: false, out: false, totem: null, stale: false };

/** The credits come from usage.json and were fetched more than 900 s ago (stdin's own have no `at`). */
export const staleCredits = (st: Pick<State, 'now' | 'extra'>): boolean => !!st.extra && st.extra.at !== null && st.now - st.extra.at > STALE_SECS;

/** A window at 1-10% left. */
const dying = (sit: Sit): boolean => [sit.s5_left, sit.wk_left].some((v) => !none(v) && v > 0 && v <= DYING);

/**
 * What the layer draws this render, from the port's own reading (`sit`, fromState's), hud.totem, the credits' age
 * (State.extra.at) and the shown-file's until.pop (`pop`: 0 when there is none): no offhand without an extra-usage
 * limit; the totem only with more than $0 left: popping while a window is used up and now is before until.pop, none
 * while one is used up otherwise, in the offhand while one is at 1-10%, else in slot 5.
 */
export function offhandMarks(st: Pick<State, 'now' | 'extra'>, hud: Pick<Config['hud'], 'totem'>, sit: Sit, pop: number): OffhandMarks {
  const left = sit.extra_left;
  if (none(left)) return NO_OFFHAND;
  const used = paying(sit), holds = left > 0;
  const totem: TotemAt = hud.totem !== 'on' || !holds ? null : used ? (st.now < pop ? 'pop' : null) : dying(sit) ? 'offhand' : 'slot5';
  return { cash: Math.trunc(left), paying: used, out: used && !holds, totem, stale: staleCredits(st) };
}

/**
 * What the shown-file keeps of this render (src/shown.ts): the 5-hour's and the week's lit icons as the engine draws
 * them (icons10) for a live limit (not last-known: the views' dim flag), the whole dollars of fresh credits, and whether
 * more than $0 is left.
 */
export function shownNow(st: Pick<State, 'now' | 'h5' | 'week' | 'extra'>, sit: Sit): ShownNow {
  const live = (v: State['h5'], left: number | null): number | null => (v && !v.dim && !none(left) ? icons10(left) : null);
  const left = sit.extra_left;
  return { h5: live(st.h5, sit.s5_left), week: live(st.week, sit.wk_left), credits: !none(left) && !staleCredits(st) ? Math.trunc(left) : null, holds: !none(left) && left > 0 };
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

/** The offhand as the marks draw it, cols 9-14. */
export function drawnOffhand(m: OffhandMarks & { cash: number }): Span[] {
  const ink = m.stale ? GREY : WHITE, c = m.cash;
  if (m.totem === 'pop') {
    const well = c >= 100 ? stack(ANKH, TOTEM, c, ink) : [S(ANKH, TOTEM, WELL), S(SPARK, WHITE, WELL), two(c, ink)];
    return [side('▐', TOTEM), ...well, side('▌', TOTEM)];
  }
  const well = m.totem === 'offhand' ? stack(ANKH, TOTEM, c, ink) : c >= 1 ? stack('◆', EMERALD, c, ink) : f2Well(null, null);
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
  let line: Span[] = hot, drawn = false;
  const off = cut(line, OFFHAND);
  if (off && same(off[1], engineOffhand(marks)) && !same(off[1], drawnOffhand(marks))) {
    line = [...off[0], ...drawnOffhand(marks), ...off[2]];
    drawn = true;
  }
  const s5 = m.totem === 'slot5' ? cut(line, SLOT5) : null;
  if (s5 && same(s5[1], [DIV, S('    ', null, WELL), DIV])) {
    line = [...s5[0], DIV, ...SLOT5_TOTEM, DIV, ...s5[2]];
    drawn = true;
  }
  if (drawn) out[n - 1] = merge(line);
  return out;
}
