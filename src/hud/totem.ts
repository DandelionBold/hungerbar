// The totem (SPEC §0.13, 1.2.0): the limit resets you declared (hungerbar.json's `totems`, src/totems.ts), drawn as the
// Totem of Undying, a layer after the offhand and before the agents, the tiers and the frame. The picks of design round 10
// (test/reference/round10/): the shape 'totem-idol', the last day 'last-mark', the call at 0 'call-pop-gold', with the
// owner's two amendments: the idol is centred in its well when alone, and no count is ever drawn on it (a Totem of
// Undying does not stack, so one idol shows for any number held; the count is `hungerbar totem`'s, look's and doctor's).
// The hotbar line is the engine's last: the offhand at cols 9-14 (its sides at 9 and 14, its well 10-13), hotbar slot 5
// at cols 36-41 (its sides at 36 and 41, its well 37-40).
//   - The windows: the 5-hour window, the week, and Fable's weekly while Fable is the model in use (the engine's scInUse,
//     the entry the boss bar draws; known only with network.scopedWeekly). A window a held reset refills is dying at
//     1-10% left and dead at 0, by the values the HUD draws (live, or last-known with ~).
//   - Where the totem is, first that holds: the call (a window it refills is dead): in the offhand between gold sides
//     (▐ ▌ #FFC83D on the frame grey), so the frame's offhand edges are gold too; the suggestion (one is dying): in the
//     offhand between the grey sides; else waiting in slot 5. In the call and the suggestion the emerald moves to slot 5:
//     the four well cells the offhand layer drew for the credits (◆ 50, ◆250, the grey old count, the empty well under a
//     dollar), between green half blocks while the credits pay (the engine's paying() with more than $0 left), else the
//     frame grey. With no extra-usage limit the offhand appears for the totem: cols 0-15 become the engine's own gutter
//     for an empty offhand (f2Gutter with extra_left 0: the version cut to 8 cells, the sides, the well) and slot 5 stays
//     empty.
//   - The idol: alone, form A, centred over the well's 4 cells: a raised wing (U+1FB0C) gold on the well, the face's two
//     halves gold with a bold green • eye in each (#3BD16F), the other wing (U+1FB0D). Beside its mark, form B: the wing,
//     the face with ¨ eyes, the other wing, shifted left, and the mark in the well's last cell: the pop's white ✦ for 30 s
//     from a fall seen live (the shown-file's until.pop, src/shown.ts), else on the reset's last day (its soonest end less
//     than 24 h away) a bold yellow !.
// The layer reads only what the layers before it drew: slot 5 only where cols 36-41 are the plain empty well between the
// frame grey's sides, the offhand only where cols 9-14 are exactly what the offhand layer drew for these credits
// (drawnOffhand), or, with no extra-usage limit, where cols 0-15 are exactly the engine's gutter. Anything else is left
// as it is. With no totem held, or hud.totem off, nothing is drawn: every byte is 1.1.0's with hud.totem off.
import type { Config } from '../config.ts';
import type { ShownNow } from '../shown.ts';
import type { State } from '../state.ts';
import type { Refills } from '../totems.ts';
import { scInUse } from './fable.ts';
import type { Sit } from './input.ts';
import { DIV, f2Gutter, icons10, WELL, WHITE } from './mix.ts';
import { drawnOffhand, EMERALD, SIDE, STALE_SECS, YELLOW, type OffhandMarks } from './offhand.ts';
import { merge, S, splitAt, W, type Span } from './spans.ts';
import { none } from './text.ts';

/** The totem's gold (1.1.0's) and its eyes' green, apart from the emerald's. */
export const TOTEM = '#FFC83D', EYE = '#3BD16F';
/** The idol's raised wings (U+1FB0C, U+1FB0D: block sextants Windows Terminal draws itself), its eyes alone and beside the mark. */
export const WING_L = '\u{1FB0C}', WING_R = '\u{1FB0D}', EYES_A = '•', EYES_B = '¨';
/** The pop's spark and the last day's mark. */
export const SPARK = '✦', LAST = '!';
/** A window at this many % left or less (and above 0) is dying: the totem moves to the offhand. */
export const DYING = 10;
/** Columns of the hotbar line, [from, to): the offhand with its sides, slot 5 with its sides, the gutter before the hotbar. */
export const OFFHAND: readonly [number, number] = [9, 15], SLOT5: readonly [number, number] = [36, 42], GUTTER: readonly [number, number] = [0, 16];

/** Where the totem is: waiting in slot 5, in the offhand (the suggestion), in the offhand between gold sides (the call). */
export type TotemAt = 'slot5' | 'offhand' | 'call';
/** The mark beside the idol (form B): the pop's spark, the last day's !; null: the idol alone (form A). */
export type TotemMark = 'pop' | 'last';

/** What the layer draws: the HUD path builds it with totemMarks(). Never a count: one idol for any number held. */
export interface TotemMarks {
  /** Where the totem is; null: none drawn (no reset held, or hud.totem off). */
  at: TotemAt | null;
  mark: TotemMark | null;
}

/** Nothing to draw: the lines as the offhand layer left them. */
export const NO_TOTEM: TotemMarks = { at: null, mark: null };

/** What the layer needs of the held resets (src/totems.ts held): whether any is held, what they refill, the last day. */
export type HeldTotems = { count: number; refills: Refills; lastDay: boolean };

/** The windows' % left as the HUD draws them: the 5-hour window, the week, Fable's weekly while Fable is in use. */
export function windows(sit: Sit): { h5: number | null; week: number | null; fable: number | null } {
  const f = scInUse(sit, sit.scoped);
  return { h5: none(sit.s5_left) ? null : sit.s5_left, week: none(sit.wk_left) ? null : sit.wk_left, fable: f ? f.left : null };
}

/**
 * What the layer draws this render, from hud.totem, the resets held at now (src/totems.ts held), the port's own reading
 * (`sit`, fromState's) and the shown-file's until.pop (`pop`: 0 when there is none): nothing without a reset held or
 * with hud.totem off; the call while a window a held reset refills is used up, the suggestion while one is at 1-10%,
 * else waiting; the pop's spark in the call while now is before until.pop, else the last day's mark on the last day.
 */
export function totemMarks(now: number, hud: Pick<Config['hud'], 'totem'>, held: HeldTotems, sit: Sit, pop: number): TotemMarks {
  if (hud.totem !== 'on' || held.count < 1) return NO_TOTEM;
  const w = windows(sit), r = held.refills;
  const mine = [r.h5 ? w.h5 : null, r.week ? w.week : null, r.fable ? w.fable : null].filter((v): v is number => v !== null);
  const at: TotemAt = mine.some((v) => v <= 0) ? 'call' : mine.some((v) => v <= DYING) ? 'offhand' : 'slot5';
  const mark: TotemMark | null = at === 'call' && now < pop ? 'pop' : held.lastDay ? 'last' : null;
  return { at, mark };
}

/**
 * What the shown-file keeps of this render (src/shown.ts): the lit icons as the engine draws them (icons10) of the
 * 5-hour window and the week while live (not last-known: the views' dim flag), and of Fable's weekly while Fable is in
 * use and usage.json was fetched at most 900 s ago; and the windows the held resets refill (the pop is theirs only).
 */
export function shownNow(st: Pick<State, 'now' | 'h5' | 'week' | 'scopedAt'>, sit: Sit, refills: Refills): ShownNow {
  const w = windows(sit);
  const live = (v: State['h5'], left: number | null): number | null => (v && !v.dim && left !== null ? icons10(left) : null);
  const fresh = st.scopedAt !== null && st.now - st.scopedAt <= STALE_SECS;
  return { h5: live(st.h5, w.h5), week: live(st.week, w.week), fable: fresh && w.fable !== null ? icons10(w.fable) : null, refills: { ...refills } };
}

/** The idol's 4 well cells: alone (form A, centred), or beside its mark (form B, shifted left, the mark last). */
export function idol(mark: TotemMark | null): Span[] {
  if (mark === null) return [S(WING_L, TOTEM, WELL), S(EYES_A + EYES_A, EYE, TOTEM, true), S(WING_R, TOTEM, WELL)];
  const cell = mark === 'pop' ? S(SPARK, WHITE, WELL) : S(LAST, YELLOW, WELL, true);
  return [S(WING_L, TOTEM, WELL), S(EYES_B, EYE, TOTEM, true), S(WING_R, TOTEM, WELL), cell];
}

/** A side of a slot in this colour: the frame's half blocks on the frame grey. */
const side = (g: '▐' | '▌', fg: string): Span => S(g, fg, SIDE);
/** Slot 5 as the engine draws it: the plain empty well between the frame grey's sides. */
const EMPTY_SLOT: readonly Span[] = [DIV, S('    ', null, WELL), DIV];

/** The same spans: text and style alike, span by span. */
const same = (a: readonly Span[], b: readonly Span[]): boolean => JSON.stringify(merge(a)) === JSON.stringify(merge(b));

/** Cols [from, to) of a line and what is around them; null when a cluster crosses either edge. */
function cut(line: readonly Span[], [from, to]: readonly [number, number]): [Span[], Span[], Span[]] | null {
  const [head, rest] = splitAt(line, from), [mid, tail] = splitAt(rest, to - from);
  return W(head) === from && W(mid) === to - from ? [head, mid, tail] : null;
}

/**
 * The hotbar line with the totem in the offhand (the call or the suggestion), or null when the shapes are not the ones
 * expected: the emerald (the offhand's well as drawn, its sides green while the credits pay) goes to slot 5; with no
 * extra-usage limit the engine's gutter for an empty offhand is drawn first, and slot 5 stays as it is.
 */
function offhandLine(hot: readonly Span[], m: TotemMarks & { at: 'offhand' | 'call' }, em: OffhandMarks, sit: Sit): Span[] | null {
  const holder = m.at === 'call' ? [side('▐', TOTEM), ...idol(m.mark), side('▌', TOTEM)] : [DIV, ...idol(m.mark), DIV];
  if (em.cash === null) {
    const g = cut(hot, GUTTER);
    if (!g || !same(g[1], f2Gutter(sit))) return null;
    const [ver, rest] = splitAt(f2Gutter({ ...sit, extra_left: 0 }), OFFHAND[0]);
    return [...ver, ...holder, ...splitAt(rest, OFFHAND[1] - OFFHAND[0])[1], ...g[2]];
  }
  const off = cut(hot, OFFHAND), s5 = cut(hot, SLOT5);
  if (!off || !s5 || !same(off[1], drawnOffhand({ ...em, cash: em.cash })) || !same(s5[1], EMPTY_SLOT)) return null;
  const well = splitAt(splitAt(off[1], 1)[1], 4)[0];
  const pays = em.paying && !em.out;
  const emerald = [pays ? side('▐', EMERALD) : DIV, ...well, pays ? side('▌', EMERALD) : DIV];
  const [head, rest] = splitAt(hot, SLOT5[0]);
  const moved = [...head, ...emerald, ...splitAt(rest, SLOT5[1] - SLOT5[0])[1]];
  const [h2, r2] = splitAt(moved, OFFHAND[0]);
  return [...h2, ...holder, ...splitAt(r2, OFFHAND[1] - OFFHAND[0])[1]];
}

/**
 * The HUD's lines (the engine's, with the layers up to the offhand: the hotbar line is the last) with the totem the
 * marks ask for; `em` is what the offhand layer drew (offhandMarks), `sit` the port's reading of the state. The input
 * is not changed.
 */
export function totemHud(lines: readonly (readonly Span[])[], m: TotemMarks, em: OffhandMarks, sit: Sit): Span[][] {
  const out = lines.map((l) => [...l]);
  const n = out.length, hot = out[n - 1];
  if (!hot || m.at === null) return out;
  let line: Span[] | null = null;
  if (m.at === 'slot5') {
    const s5 = cut(hot, SLOT5);
    if (s5 && same(s5[1], EMPTY_SLOT)) line = [...s5[0], DIV, ...idol(m.mark), DIV, ...s5[2]];
  } else line = offhandLine(hot, { ...m, at: m.at }, em, sit);
  if (line) out[n - 1] = merge(line);
  return out;
}
