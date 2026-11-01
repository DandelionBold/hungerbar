// The vitals: the hearts line's three looks (SPEC §0.12, 1.1.0), the picks from design round 9: 'ultra-apple'
// (test/reference/round9/ultra.json), 'stale-tilde' (stale.json) and 'pay-poison' (paying.json), a layer after the engine
// like the player's (player.ts). The hearts line is the third from the bottom (the second of 4 lines, the third with the
// boss bar on top): its 16-cell gutter (the 5-hour's day, clock and %, or a grey ? while unknown), ten '♥ ' at cols
// 16-35, the compaction box, the drumsticks at 42-61 and, from col 62, a space, the weekly % and its reset.
//   - Ultra (hud.ultra on, an account with no 5-hour window): the golden apple. The gutter is a yellow ☼, then a bold
//     gold ∞ at col 14 (no clock: nothing resets), and all ten hearts are gold, Minecraft's absorption hearts. Gold is
//     drawn nowhere else on the line, so it can only mean "no 5-hour limit".
//   - Stale (no key): a limit Claude Code did not send this render, drawn from limits.json, is marked as the classic look
//     marks it. For the 5-hour window the space before its % becomes a grey ~ and the lit hearts and the % are drawn at
//     60% (#993333); for the weekly, col 62 becomes the ~ and the drumsticks and the % are dimmed alike (#866235, or
//     #993333 for a red %). Dark hearts, the clocks and the day's icon stay as they are. Nothing known at all stays the
//     engine's ? and dark hearts.
//   - Poison (hud.poison on): only while the 5-hour window is used up and the extra credits pay (more than $0 left), the
//     hearts show the credits' share left in poison green, max(1, the engine's rounding of 10 x left / limit), the rest
//     dark, and the gutter shows the day's icon without the skull (the engine's own unshipped rule, hud4.js day()'s
//     absorb) and the clock; the % stays the engine's. A used-up week changes nothing here; the 5-hour's stale shading is
//     drawn over the poison too.
// The layer reads only what the engine drew, and draws only on a hearts line of the engine's shape: 16 cells of gutter,
// then ten '♥ ' (red ones, then dark ones; the last space may be trimmed off the line's end). Each look also needs its
// own cells: Ultra the unknown gutter (? and 15 spaces); poison and the 5-hour's stale mark the known one ([day and
// clock], spaces, the bold red %, a space), poison with the skull; the weekly's stale mark a plain space at col 62
// before the bold weekly % and its grey ' ↻ '. Where they are not there, and with nothing to draw, the lines come back
// as they are. It rebuilds cols 0-35 and keeps everything from col 36 on, but for the weekly's mark: col 62, and the
// colour of the drumsticks before it and of the % after it.
import type { Config } from '../config.ts';
import type { State } from '../state.ts';
import { shade } from './fable.ts';
import type { Sit } from './input.ts';
import { DARK, day, DGREY, FOOD, G2, GREY, HEART } from './mix.ts';
import { pyRound } from './py.ts';
import { merge, S, splitAt, W, type Span } from './spans.ts';
import { none } from './text.ts';

/** The golden apple's gold (Minecraft's absorption hearts), the sun as the engine draws the day's first three fifths, poison green. */
export const ULTRA_GOLD = '#FFD43B', SUN = '#FFFF55', POISON = '#8DB33A';
/** The stale shading: a last-known limit is drawn at 60% of its colour (the engine's shade(), as its boss bar's notches). */
export const STALE = 0.6;
/** The mark of a last-known limit, as the classic look draws it ("about"). */
export const TILDE = '~';
/** The weekly %'s red at 10% left or less (mix.ts f2Line2). */
export const WEEK_RED = '#FF5555';
/** Columns of the hearts on the hearts line, [from, to). */
export const HEARTS: readonly [number, number] = [16, 36];
/** The column of the space before the weekly % (f2Line2: the food ends at col 61). */
export const WEEK_GAP = 62;
/** Ultra's gutter: the day's sun, padding, a bold gold ∞ where the 5-hour % ends, a space. It starts with the ☼, so Claude Code trims nothing. */
export const ULTRA_GUTTER: readonly Span[] = [S('☼', SUN), S(' '.repeat(13)), S('∞', ULTRA_GOLD, null, true), S(' ')];

/** What the layer draws: the HUD path builds it with vitalMarks(). */
export interface VitalMarks {
  /** Ultra (hud.ultra on, State.h5None): the golden apple. */
  ultra: boolean;
  /**
   * Poison (hud.poison on, the 5-hour window used up, more than $0 of credits left): the lit hearts, 1-10, and the day's
   * icon without the skull; null when it does not draw.
   */
  poison: { lit: number; day: Span } | null;
  /** The 5-hour window is last-known (State.h5.dim). */
  stale5: boolean;
  /** The weekly is last-known (State.week.dim). */
  staleWk: boolean;
}

/** Nothing to draw: the engine's lines as they are. */
export const NO_VITALS: VitalMarks = { ultra: false, poison: null, stale5: false, staleWk: false };

/** The poison's lit hearts for credits `left` of `limit`: never 0 while anything is left (hud4.js f1Line1's absorb share, at least 1). */
export const poisonHearts = (left: number, limit: number): number => Math.max(1, pyRound(left / limit * 10));

/**
 * What the layer draws this render: Ultra from hud.ultra and the account's missing 5-hour window, the stale marks from
 * the views' dim flags, and poison from hud.poison and the engine's own reading (`sit`, fromState's): the 5-hour % left
 * at 0 and the credits left above 0, with the day's icon as the engine's day() draws it without the skull's test.
 */
export function vitalMarks(st: Pick<State, 'h5None' | 'h5' | 'week'>, hud: Pick<Config['hud'], 'ultra' | 'poison'>, sit: Sit): VitalMarks {
  const used = !none(sit.s5_left) && sit.s5_left <= 0, left = sit.extra_left ?? 0;
  return {
    ultra: hud.ultra === 'on' && st.h5None,
    poison: hud.poison === 'on' && used && left > 0 ? { lit: poisonHearts(left, sit.extra_limit), day: day({ ...sit, s5_left: null }) } : null,
    stale5: st.h5?.dim === true,
    staleWk: st.week?.dim === true,
  };
}

/** A span with no style at all. */
const plain = (s: Span | undefined): boolean => !!s && !s.fg && !s.bg && !s.bold;
/** A span at the stale shading. */
const dim = (s: Span): Span => ({ ...s, fg: shade(s.fg!, STALE) });
/** Ten '♥ ', `lit` of them in `fg`, the rest dark. */
const row = (lit: number, fg: string): Span[] => [S('♥ '.repeat(lit), fg), S('♥ '.repeat(10 - lit), DARK)];

/**
 * How many of the engine's ten hearts (cols 16-35) are red, or -1 when the cells are not ten '♥ ': each heart red or
 * dark, the red ones first, each followed by a space (the last may be trimmed off the line), nothing with a background or bold.
 */
function litHearts(hearts: readonly Span[]): number {
  let t = '';
  for (const s of hearts) for (const g of s.t) t += s.bg || s.bold ? '!' : g === ' ' ? '_' : g !== '♥' ? '!' : s.fg === HEART ? 'R' : s.fg === DARK ? 'D' : '!';
  return W(hearts) === t.length && t.length >= 19 && /^(?:R_)*(?:D_)*$/.test(t + (t.length === 19 ? '_' : '')) ? t.split('R').length - 1 : -1;
}

/** The known 5-hour's gutter split in its parts: [day and clock], and the bold red %; null when it is not that. */
function known(gut: readonly Span[]): { head: Span[]; pct: Span } | null {
  const n = gut.length, pct = gut[n - 2];
  const ok = n >= 4 && gut[n - 1]!.t === ' ' && plain(gut[n - 1]) && /^ +$/.test(gut[n - 3]!.t) && plain(gut[n - 3])
    && /^\d+%$/.test(pct!.t) && pct!.fg === HEART && !pct!.bg && pct!.bold === true;
  return ok ? { head: gut.slice(0, n - 3), pct: pct! } : null;
}

/** The unknown 5-hour's gutter, as the engine draws it: a dark grey ? and 15 spaces. */
const unknown = (gut: readonly Span[]): boolean =>
  gut.length === 2 && gut[0]!.t === '?' && gut[0]!.fg === DGREY && !gut[0]!.bg && !gut[0]!.bold && gut[1]!.t === ' '.repeat(G2 - 1) && plain(gut[1]);

/** The engine's skull (day() for a used-up 5-hour), which poison replaces with the day's icon. */
const skull = (s: Span): boolean => s.t === '☠  ' && s.fg === HEART && !s.bg && !s.bold;

/** The gutter and the ten hearts the marks draw over the engine's (`lit` of its hearts red), or null when none applies there. */
function front(gut: readonly Span[], lit: number, m: VitalMarks): [Span[], Span[]] | null {
  if (unknown(gut)) return m.ultra ? [[...ULTRA_GUTTER], row(10, ULTRA_GOLD)] : null;
  const k = known(gut);
  const poison = k && skull(k.head[0]!) ? m.poison : null;
  if (!k || (!poison && !m.stale5)) return null;
  const head = poison ? [poison.day, ...k.head.slice(1)] : k.head;
  const right = m.stale5 ? [S(TILDE, GREY), dim(k.pct), S(' ')] : [k.pct, S(' ')];
  const g = [...head, S(' '.repeat(Math.max(0, G2 - W(head) - W(right)))), ...right];
  const [n, fg]: [number, string] = poison ? [poison.lit, POISON] : [lit, HEART];
  return W(g) === G2 ? [g, row(n, m.stale5 ? shade(fg, STALE) : fg)] : null;
}

/** The weekly's stale mark on a line: col 62 a grey ~, the drumsticks before it and the % after it dimmed; null when there is no weekly there. */
function staleWeek(line: readonly Span[]): Span[] | null {
  const [pre, post] = splitAt(line, WEEK_GAP);
  const [gap, pct, clock] = post, food = pre[pre.length - 1]!;
  const ok = W(pre) === WEEK_GAP && plain(gap) && gap!.t === ' ' && !!pct && /^\d+%$/.test(pct.t) && (pct.fg === FOOD || pct.fg === WEEK_RED)
    && !pct.bg && pct.bold === true && !!clock && clock.t.startsWith(' ↻ ') && clock.fg === GREY;
  if (!ok) return null;
  const ate = /^(?:🍗)+$/u.test(food.t) && food.fg === FOOD;
  return [...pre.slice(0, -1), ate ? dim(food) : food, S(TILDE, GREY), dim(pct!), ...post.slice(2)];
}

/**
 * The HUD's lines (the engine's, with the git state and the player's layers: the hearts line is the third from the
 * bottom) with the vitals the marks ask for. The input is not changed.
 */
export function heartsHud(lines: readonly (readonly Span[])[], m: VitalMarks): Span[][] {
  const out = lines.map((l) => [...l]);
  const at = out.length - 3;
  if (at < 0 || (!m.ultra && !m.poison && !m.stale5 && !m.staleWk)) return out;
  const line = out[at]!;
  const [gut, rest] = splitAt(line, G2), [hearts, tail] = splitAt(rest, HEARTS[1] - HEARTS[0]);
  const lit = W(gut) === G2 ? litHearts(hearts) : -1;
  if (lit < 0) return out;
  const f = front(gut, lit, m);
  // col 35 is the last heart's own space, or what the engine left there (nothing, or a fable option's plain padding)
  const [, c35] = splitAt(hearts, HEARTS[1] - HEARTS[0] - 1);
  const drawn = f ? [...f[0], ...(c35[0]?.fg ? f[1] : [...splitAt(f[1], 19)[0], ...c35]), ...tail] : line;
  const week = m.staleWk ? staleWeek(drawn) : null;
  if (!f && !week) return out;
  out[at] = merge(week ?? drawn);
  return out;
}
