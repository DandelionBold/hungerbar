// The totem (SPEC §0.13, 1.2.0), written for the tests and independent of src/hud/totem.ts, from the rules of the design
// (v12-totem.md 2.2 and 3.0, the round-10 picks totem-idol, last-mark and call-pop-gold with the owner's amendments),
// cluster by cluster on the vendored engine's render of a state after the tests' offhand (test/hud/offhand-oracle.ts).
// Where src/ checks the drawn hotbar line, this finds everything from the state, through the engine's own fromState(),
// paying(), scInUse() and f2Gutter(): the hotbar line is the last; slot 5's well is cols 37-40 (sides 36 and 41), the
// offhand's cols 10-13 (sides 9 and 14).
//   - The windows a held reset refills: the 5-hour window and the week (s5_left, wk_left), and Fable's weekly, the scoped
//     entry of the model in use (its left). Any of them at 0 or below: the call; else any at 10 or below: the suggestion;
//     else the totem waits in slot 5.
//   - The idol: alone, cols +0..+3 are U+1FB0C gold on the well, two • in bold #3BD16F on gold, U+1FB0D gold on the well.
//     With a mark: U+1FB0C, ¨ bold green on gold, U+1FB0D, then the mark: ✦ white on the well while the pop shows (only
//     in the call), else ! bold #FFFF55 on the well on the last day. No count, whatever is held.
//   - In the suggestion and the call the idol goes to the offhand's well, its sides a grey space each (the suggestion)
//     or ▐ ▌ gold on the frame grey (the call); slot 5 gets the offhand's four well cells as the offhand drew them, its
//     sides green ▐ ▌ while a window is used up and more than $0 is left, else a grey space each. With no extra-usage
//     limit, cols 0-8 and 15 are the engine's gutter for $0 of credits and slot 5 is left alone.
// The frame's side colour (for frameOracle): gold in the call, grey in the suggestion, else the offhand's.
import { at, cell, clustersOf, offhandSideOracle, runs, type Cl } from './offhand-oracle.ts';
import { PORT, type RefLines, type RefSpan } from './ref.ts';

const GOLD = '#FFC83D', EYE = '#3BD16F', GREEN = '#17DD62', SIDE = '#5D5D5D', WELL = '#201E07', WHITE = '#FFFFFF', YELLOW = '#FFFF55';

/**
 * The totem's input, as the tests hand it: whether a reset is held with hud.totem on (`held`), which windows the held
 * resets refill, whether it is the last day of the soonest, and whether the shown-file's pop shows (now before until.pop).
 */
export interface OracleTotem { held: boolean; refills: { h5: boolean; week: boolean; fable: boolean }; lastDay: boolean; pop: boolean }
export const NO_TOTEM_ORACLE: OracleTotem = { held: false, refills: { h5: false, week: false, fable: false }, lastDay: false, pop: false };

interface Sit { s5_left: number | null; wk_left: number | null; extra_left: number | null; scoped: Array<{ left: number }> }

/** Where the totem is for this state: 'slot5', 'offhand', 'call', or null when none is held. */
export function totemPlaceOracle(state: unknown, o: OracleTotem): 'slot5' | 'offhand' | 'call' | null {
  if (!o.held) return null;
  const sit = PORT.fromState(state) as Sit;
  const inUse = PORT.scInUse(sit, sit.scoped) as { left: number } | null;
  const lefts: number[] = [];
  if (o.refills.h5 && sit.s5_left !== null && sit.s5_left !== undefined) lefts.push(sit.s5_left);
  if (o.refills.week && sit.wk_left !== null && sit.wk_left !== undefined) lefts.push(sit.wk_left);
  if (o.refills.fable && inUse) lefts.push(inUse.left);
  if (lefts.some((l) => l <= 0)) return 'call';
  if (lefts.some((l) => l <= 10)) return 'offhand';
  return 'slot5';
}

/** The mark beside the idol: 'pop', 'last' or null (alone). */
export function totemMarkOracle(state: unknown, o: OracleTotem): 'pop' | 'last' | null {
  const place = totemPlaceOracle(state, o);
  if (place === null) return null;
  if (place === 'call' && o.pop) return 'pop';
  return o.lastDay ? 'last' : null;
}

/** The idol's 4 cells for a mark. */
function idolCells(mark: 'pop' | 'last' | null): Cl[] {
  const wingL = cell('\u{1FB0C}', GOLD, WELL), wingR = cell('\u{1FB0D}', GOLD, WELL);
  if (mark === null) return [wingL, cell('•', EYE, GOLD, true), cell('•', EYE, GOLD, true), wingR];
  return [wingL, cell('¨', EYE, GOLD, true), wingR, mark === 'pop' ? cell('✦', WHITE, WELL) : cell('!', YELLOW, WELL, true)];
}

/** The frame's side colour for this state. */
export function totemSideOracle(state: unknown, o: OracleTotem): string | null {
  const place = totemPlaceOracle(state, o);
  if (place === 'call') return GOLD;
  if (place === 'offhand') return SIDE;
  return offhandSideOracle(state);
}

/** The totem on the engine's render of `state`, with the offhand already drawn by the tests' offhand. */
export function totemOracle(lines: RefLines, state: unknown, o: OracleTotem): RefLines {
  const copy = lines.map((l) => l.map((s) => ({ ...s })));
  const place = totemPlaceOracle(state, o);
  if (place === null || copy.length === 0) return copy;
  const row = copy.length - 1;
  let cs = clustersOf(copy[row]!);
  const put = (col: number, cls: Cl[]): void => cls.forEach((c, k) => { cs[at(cs, col + k)] = c; });
  const item = idolCells(totemMarkOracle(state, o));
  if (place === 'slot5') put(37, item);
  else {
    const sit = PORT.fromState(state) as Sit;
    const holder = place === 'call' ? [cell('▐', GOLD, SIDE), ...item, cell('▌', GOLD, SIDE)] : [cell(' ', undefined, SIDE), ...item, cell(' ', undefined, SIDE)];
    if (sit.extra_left === null || sit.extra_left === undefined) {
      const gut = clustersOf(PORT.f2Gutter({ ...sit, extra_left: 0 }) as RefSpan[]);
      cs = [...gut.slice(0, at(gut, 9)), ...holder, ...gut.slice(at(gut, 15)), ...cs.slice(at(cs, 16))];
    } else {
      const pays = (PORT.paying(sit) as boolean) && sit.extra_left > 0;
      const well = [10, 11, 12, 13].map((c) => ({ ...cs[at(cs, c)]! }));
      put(36, [pays ? cell('▐', GREEN, SIDE) : cell(' ', undefined, SIDE), ...well, pays ? cell('▌', GREEN, SIDE) : cell(' ', undefined, SIDE)]);
      put(9, holder);
    }
  }
  copy[row] = runs(cs);
  return copy;
}
