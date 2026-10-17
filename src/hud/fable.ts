// The mix's 'fable' option group (design round 7): Fable's own weekly limit (state.scoped) drawn on the mix's lines,
// ported line for line from the oracle (test/reference/hud4.js L596, L716, L937-949 and L982-1172; plan §3-§4), with
// renderHud(), the whole HUD: MIX.render(state, {git: 'git-terrain', pick: 'pick-numeral', book: 'on', fable}).
// hud.oracle.test.ts compares each function and every render, for each of the 5 shipped ids.
// Shipped: fable-off, -tail, -tooltip, -boss and -beacon. fable-mount is not, so MIX_FABLE has 4 entries and an id of
// 'fable-mount' draws as fable-off.
// Each option takes the mix's finished lines and sit.scoped ([{name, fam, left, reset}], left = % left, reset = minutes
// or null) and draws only in its own cells: fable-tail after line 2's last cell; fable-tooltip, in use, line 1's held
// item and line 2's end; fable-boss, in use, a new line on top and line 2's end; fable-beacon line 2 and line 1 from
// col C (C >= 80). With no scoped entry, or fable-off, the mix's lines come back untouched.
// Traps kept on purpose: scInUse() compares families without case, and a name of no known family is its first word, so
// a model 'GPT 5' is in use for an entry named 'GPT'; scFit() puts the Fable entries first; lerp() rounds with
// Math.round, shade() with Python's round; ' '.repeat() (not rep) where the oracle has it.
// renderHud() lives here rather than in mix.ts: fable.ts builds on mix.ts, and the reverse import would be a cycle.
import { fromState, readHist, type ScopedSit, type Sit } from './input.ts';
import { B2, DARK, DGREY, G2, GREY, MAXW, RARITY, WHITE, icons10, mix, modelSpan, roman, twk } from './mix.ts';
import { clamp, family, get, obj, own, pyRound, pyStr } from './py.ts';
import { merge, pad, S, splitAt, W, type Span } from './spans.ts';
import { cut, lite, none } from './text.ts';

/** One fable option: rewrites the mix's lines for the scoped limits (never empty). */
export type FableFn = (lines: Span[][], sit: Sit, sc: readonly ScopedSit[]) => Span[][];

// hud4.js L596: left eighths, index = width in eighths
export const LEFT8: readonly string[] = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];
// hud4.js L716
export const hex2 = (v: number): string => v.toString(16).toUpperCase().padStart(2, '0');

// ---------- shared (hud4.js L982-1039) ----------
// hud4.js L982: 10% left or less, the weekly's own rule
export const SC_RED = '#FF5555';
// hud4.js L983
export const SC_SEP = S(' · ', DGREY);
// hud4.js L984
export const scRarity = (e: ScopedSit): string => get(RARITY, family(e.name), WHITE);
// hud4.js L985
export const scPct = (e: ScopedSit): string => pyStr(e.left) + '%';
// hud4.js L986
export const scClock = (e: ScopedSit): Span[] => (e.reset === null ? [] : [S(' ↻ ' + twk(e.reset), GREY)]);
// hud4.js L988: the scoped limit of the model in use, the first entry of the same family ('Fable 5.1', 'claude-fable-5-1')
export const scInUse = (sit: Sit, sc: readonly ScopedSit[]): ScopedSit | null => {
  const f = String(family(sit.model)).toLowerCase(); return sc.find((e) => e.fam === f) || null;
};
// hud4.js L990: the quiet form (an entry not in use): sep, name (6 cells), ' ', pct, then ' ↻ reset', all grey (a red %
// at 10% or less)
export const scQuiet = (e: ScopedSit, sep: Span, withClock: boolean): Span[] => [sep, S(cut(e.name, 6), GREY), S(' '),
  S(scPct(e), e.left <= 10 ? SC_RED : GREY), ...(withClock ? scClock(e) : [])];
// hud4.js L997: the entries not in use after `head`, in what is left of 110 cells. Order: the Fable entries first, then
// the others in the API's order. Until it fits, give way in this order, each from the end: the resets of entries that
// are not used up, then those entries, then the resets of used-up entries, then any entry. ' · +N' (N not shown) takes
// the place of the entries that went and needs its room too; it is left out only when even that cannot fit.
export function scFit(head: readonly Span[], entries0: readonly ScopedSit[], firstSep: Span): Span[] {
  const entries = [...entries0.filter((e) => e.fam === 'fable'), ...entries0.filter((e) => e.fam !== 'fable')];
  const room = MAXW - W(head), n = entries.length;
  const clock = entries.map(() => true), shown = entries.map(() => true);
  const build = (): Span[] => {                                // the separators follow what is shown
    const out: Span[] = [];
    let k = 0;
    entries.forEach((e, i) => { if (shown[i]) out.push(...scQuiet(e, k++ ? SC_SEP : firstSep, clock[i]!)); });
    if (k < n) out.push(S((k ? ' · ' : firstSep.t) + '+' + pyStr(n - k), DGREY));
    return out;
  };
  const last = (ok: (e: ScopedSit, i: number) => boolean): number => {
    for (let i = n - 1; i >= 0; i--) if (shown[i] && ok(entries[i]!, i)) return i;
    return -1;
  };
  const steps: Array<[(e: ScopedSit, i: number) => boolean, boolean[]]> = [[(e, i) => clock[i]! && e.left > 0, clock],
    [(e) => e.left > 0, shown], [(e, i) => clock[i]!, clock], [() => true, shown]];
  let out = build();
  while (W(out) > room) {
    const s = steps.find(([ok]) => last(ok) >= 0);
    if (!s) return [...head];                                  // not even ' +N' fits
    s[1][last(s[0])] = false;
    out = build();
  }
  return [...head, ...out];
}
// hud4.js L1021: line 2 and the separator of its first added entry: after the weekly ' · '; with no weekly (none given)
// padded to col 62, where the weekly's numbers would start, and ' '
export const scLine2 = (sit: Sit, l2: readonly Span[]): { head: Span[]; first: Span } =>
  (none(sit.wk_left) ? { head: pad(l2, 62), first: S(' ') } : { head: [...l2], first: SC_SEP });

// ---------- fable-tail (hud4.js L1040-1052): beside the weekly; in use, ten hexagons count what is left ----------
// hud4.js L1041: U+2B22 / U+2B21, Cascadia Mono, 1 cell
export const HEX_FULL = '⬢', HEX_EMPTY = '⬡';
// hud4.js L1042
export function scLoud(e: ScopedSit, sep: Span): Span[] {
  const n = icons10(e.left), col = e.left <= 10 ? SC_RED : scRarity(e);
  return [sep, S(cut(e.name, 6), scRarity(e), null, true), S(' '), S(HEX_FULL.repeat(n), col), S(HEX_EMPTY.repeat(10 - n), DARK),
    S(' '), S(scPct(e), col, null, true), ...scClock(e)];
}
// hud4.js L1047
export function fableTail(lines: Span[][], sit: Sit, sc: readonly ScopedSit[]): Span[][] {
  const u = scInUse(sit, sc), rest = sc.filter((e) => e !== u);
  const { head, first } = scLine2(sit, lines[1]!);
  const lead = u ? scLoud(u, first) : [];
  return [lines[0]!, merge(scFit([...head, ...lead], rest, u ? SC_SEP : first)), lines[2]!, lines[3]!];
}

// ---------- fable-tooltip (hud4.js L1068-1104): in use, the held item's name carries its durability bar ----------
// hud4.js L1071: Minecraft's durability colour, Mth.hsvToRgb(left / 3, 1, 1) with its channels truncated: (255,
// floor(5.1 x pct), 0) below 50%, (floor(510 - 5.1 x pct), 255, 0) from 50%; red #FF5555 at 10% or less
export function scWear(pct: number): string {
  if (pct <= 10) return SC_RED;
  const r = pct < 50 ? 255 : Math.floor((5100 - 51 * pct) / 10), g = pct < 50 ? Math.floor((51 * pct) / 10) : 255;
  return `#${hex2(r)}${hex2(g)}00`;
}
// hud4.js L1076
export const scEighths = (pct: number): number => (pct <= 0 ? 0 : pct >= 100 ? 40 : clamp(pyRound((40 * pct) / 100), 1, 39));
// hud4.js L1077: 5 cells = 40 eighths on the dark track, all WT builtin
export function scDurability(pct: number): Span[] {
  const e = scEighths(pct), col = scWear(pct), out: Span[] = [];
  for (let i = 0; i < 5; i++) {
    const f = e - 8 * i;
    out.push(f >= 8 ? S('█', col, DARK) : f <= 0 ? S(' ', null, DARK) : S(LEFT8[f]!, col, DARK));
  }
  return out;
}
// hud4.js L1085: the first form that fits Day & Night's 41 cells with room for the widest numbers it could ever hold
// (' 100% ↻ 23h59m', 14 cells; ' 100%' with no reset time): only the model and the effort choose the form
export function scTooltip(sit: Sit, u: ScopedSit): Span[] {
  const room = G2 + 25, r = roman(sit.effort);
  const nums = [S(' '), S(scPct(u), scWear(u.left), null, true), ...scClock(u)];
  const most = u.reset === null ? 5 : 14;
  const bar = [S(' '), ...scDurability(u.left)];
  const L = r ? [S(' Efficiency ' + r, GREY)] : [], Ls = r ? [S(' Eff ' + r, GREY)] : [];
  const full = (lore: Span[], b: Span[]): Span[] => [modelSpan(sit), ...lore, ...b];
  const short1 = (lore: Span[], b: Span[]): Span[] => [modelSpan(sit, lite(sit.model)), ...lore, ...b];
  for (const f of [full(L, bar), full(Ls, bar), short1(Ls, bar), full(Ls, []), short1(Ls, [])]) if (W(f) + most <= room) return [...f, ...nums];
  return [modelSpan(sit, cut(lite(sit.model), room - W(Ls) - most)), ...Ls, ...nums];
}
// hud4.js L1097
export function fableTooltip(lines: Span[][], sit: Sit, sc: readonly ScopedSit[]): Span[][] {
  const u = scInUse(sit, sc), rest = sc.filter((e) => e !== u);
  if (!u) return fableTail(lines, sit, sc);
  const tip = scTooltip(sit, u);
  const l1 = none(sit.cache) ? tip : [...pad(tip, G2 + 26), ...splitAt(lines[0]!, G2 + 26)[1]];   // the bubbles stay at col 42
  const { head, first } = scLine2(sit, lines[1]!);
  return [merge(l1), rest.length ? merge(scFit(head, rest, first)) : lines[1]!, lines[2]!, lines[3]!];
}

// ---------- fable-boss (hud4.js L1106-1121): in use, a boss bar on a new line on top ----------
// hud4.js L1107: upper one quarter block, WT builtin: hangs from the top of its row
export const BOSS = '\u{1FB82}';
// hud4.js L1108
export const bossFill = (pct: number): number => (pct <= 0 ? 0 : pct >= 100 ? B2 : clamp(pyRound((pct * B2) / 100), 1, B2 - 1));
// hud4.js L1109
export const shade = (c: string, k: number): string => '#' + [1, 3, 5].map((i) => hex2(pyRound(parseInt(c.slice(i, i + 2), 16) * k))).join('');
// hud4.js L1110: the name, a 46-cell bar over the hotbar's width (a notch over each divider), % and reset
export function bossLine(u: ScopedSit): Span[] {
  const col = u.left <= 10 ? SC_RED : scRarity(u), fill = bossFill(u.left), bar: Span[] = [];
  const on = [col, shade(col, 0.6)], off = [shade(col, 0.25), shade(col, 0.12)];   // [cell, notch]
  for (let b = 0; b < B2; b++) bar.push(S(BOSS, (b < fill ? on : off)[b % 5 === 0 ? 1 : 0]));
  return merge([...pad([S(cut(u.name, G2 - 1), scRarity(u), null, true)], G2), ...bar, S(' '), S(scPct(u), col, null, true), ...scClock(u)]);
}
// hud4.js L1116
export function fableBoss(lines: Span[][], sit: Sit, sc: readonly ScopedSit[]): Span[][] {
  const u = scInUse(sit, sc), rest = sc.filter((e) => e !== u);
  if (!u) return fableTail(lines, sit, sc);
  const { head, first } = scLine2(sit, lines[1]!);
  return [bossLine(u), lines[0]!, rest.length ? merge(scFit(head, rest, first)) : lines[1]!, lines[2]!, lines[3]!];
}

// ---------- fable-beacon (hud4.js L1123-1167): a beacon at the end of line 2, its beam rising into line 1 ----------
// hud4.js L1124: [fg, bg] of the beacon
export const BEACON_ON: readonly [string, string] = ['#7DF9F2', '#163235'], BEACON_OFF: readonly [string, string] = ['#5E6B6B', '#1C2222'];
export const ACCENT = '#7DF9F2';
// hud4.js L1125
export const lerp = (a: string, b: string, t: number): string => '#' + [1, 3, 5].map((i) => {
  const x = parseInt(a.slice(i, i + 2), 16), y = parseInt(b.slice(i, i + 2), 16);
  return hex2(Math.round(x + (y - x) * t));
}).join('');
// hud4.js L1129
export const beamColour = (pct: number): string => lerp('#2E6B73', '#E9FFFF', pct / 100);
// hud4.js L1133: line 1 ends by col 77 with Claude Code's 5-minute cache; the column is fixed for a cache TTL (the widest
// timer of that TTL + ' · hit 100%' + 2), at least 80, and never left of a line's end + 2
export function beaconCol(sit: Sit, lines: readonly (readonly Span[])[]): number {
  const c = sit.cache, most = c ? G2 + 26 + 20 + Math.max(4, pyStr(Math.floor(c.ttl / 60)).length + 4) + 11 : 0;
  return Math.max(80, most + 2, W(lines[0]!) + 2, W(lines[1]!) + 2);
}
// hud4.js L1137
export const chip = (e: ScopedSit, withClock: boolean): Span[] => [S(cut(e.name, 8), GREY), S(' '), S(scPct(e), e.left <= 10 ? SC_RED : GREY),
  ...(withClock ? scClock(e) : [])];
// hud4.js L1138: the other models on line 1: as many as fit, then '+N'
export function chips(rest: readonly ScopedSit[], used: number, from: number): Span[] {
  if (!rest.length) return [];
  const out = [S(' '.repeat(Math.max(0, from - used)))];
  let w = Math.max(used, from), k = 0;
  for (; k < rest.length; k++) {
    const gap = k ? [S('  ')] : [], tail = k + 1 < rest.length ? W([S('  +' + pyStr(rest.length - k - 1))]) : 0;
    const c = [chip(rest[k]!, true), chip(rest[k]!, false)].map((x) => [...gap, ...x]).find((x) => w + W(x) + tail <= MAXW);
    if (!c) break;
    out.push(...c); w += W(c);
  }
  if (k < rest.length) {
    const plus = S((k ? '  ' : '') + '+' + pyStr(rest.length - k), GREY);
    if (w + W([plus]) <= MAXW) out.push(plus); else if (!k) return [];
  }
  return out;
}
// hud4.js L1154: the beacon is the entry in use, else the first Fable, else the API's first; the others follow in the
// API's order
export function fableBeacon(lines: Span[][], sit: Sit, sc: readonly ScopedSit[]): Span[][] {
  const u = scInUse(sit, sc), lead = u || sc.find((e) => e.fam === 'fable') || sc[0]!;
  const order = [lead, ...sc.filter((e) => e !== lead)], m = order[0]!, rest = order.slice(1);
  const C = beaconCol(sit, lines), lit = m.left > 0, use = m === u;
  const [fg, bg] = lit ? BEACON_ON : BEACON_OFF;
  const pct = S(scPct(m), m.left <= 10 ? SC_RED : ACCENT, null, use), tailW = 2 + 1 + W([pct]) + W(scClock(m));
  const name = S(cut(m.name, Math.min(10, MAXW - C - tailW)), use ? (lit ? scRarity(m) : SC_RED) : GREY, null, use);
  const l2 = [...lines[1]!, S(' '.repeat(C - W(lines[1]!))), S('◈', fg, bg), S(' '), name, S(' '), pct, ...scClock(m)];
  let l1 = [...lines[0]!];
  if (lit) l1 = [...l1, S(' '.repeat(C - W(l1))), S(m.left > 50 ? '┃' : '╻', beamColour(m.left))];
  l1 = [...l1, ...chips(rest, W(l1), C + 3)];
  return [merge(l1), merge(l2), lines[2]!, lines[3]!];
}

// ---------- the group (hud4.js L937-949 and L1169-1172) ----------
// hud4.js L1169, without fable-mount (not shipped)
export const MIX_FABLE: Readonly<Record<string, FableFn>> = { 'fable-tail': fableTail, 'fable-tooltip': fableTooltip, 'fable-boss': fableBoss,
  'fable-beacon': fableBeacon };
// hud4.js L1172: the mix's lines with the fable option applied: fable-off, or no scoped entry, leaves them as they are
export const mixFable = (lines: Span[][], sit: Sit, id: string): Span[][] =>
  (sit.scoped.length && own(MIX_FABLE, id) ? MIX_FABLE[id]!(lines, sit, sit.scoped) : lines);

/** An option of the group as the design picker shows it. */
export interface FableOption { id: string; name: string; note: string }
// hud4.js L937-949 (MIX_OPTIONS.fable), verbatim, without fable-mount: what `hungerbar setup` and `look` show
export const FABLE_OPTIONS: readonly FableOption[] = [
  { id: 'fable-off', name: 'No Fable (as today)',
    note: 'Nothing about Fable on the status line, as today. Every line stays exactly as it is now.' },
  { id: 'fable-tail', name: 'Fable next to your weekly food',
    note: "While you use Opus, Fable is a small grey note after your weekly: 'Fable 65% ↻ 4d00h' means 65% of your Fable week is left and it is full again in 4 days. The % turns red at 10% or less, and when Fable is used up, as today, it says 'Fable 0% ↻ 19h00m': back in 19 hours. When you use Fable, the word Fable turns pink and ten small hexagons count what is left, like the drumsticks: 4 pink hexagons is about 40% left, ten dark ones means used up." },
  { id: 'fable-tooltip', name: "Fable's wear on the item in your hand",
    note: "While you use Opus, Fable is a small grey note after your weekly: 'Fable 65% ↻ 4d00h' means 65% of your Fable week is left and it is full again in 4 days. The % turns red at 10% or less, and when Fable is used up, as today, it says 'Fable 0% ↻ 19h00m': back in 19 hours. When you use Fable, the first line, which names the model in your hand, also shows how worn it is, like a Minecraft tool: 'Fable 5.1 Eff III █▉ 38% ↻ 2d05h'. The short bar is green when Fable is full, yellow at half and red when it is almost used up; next to it are the % left and when it is full again." },
  { id: 'fable-boss', name: 'A boss bar while you use Fable',
    note: "While you use Opus, Fable is a small grey note after your weekly: 'Fable 65% ↻ 4d00h' means 65% of your Fable week is left and it is full again in 4 days. The % turns red at 10% or less, and when Fable is used up, as today, it says 'Fable 0% ↻ 19h00m': back in 19 hours. When you switch to Fable, a fifth line appears on top, like a boss bar in Minecraft: the word Fable and a long pink bar as wide as your hotbar that gets shorter as you use Fable, then the % left and when it is full again. The bar turns red at 10% or less, and the line goes away when you switch back to Opus." },
  { id: 'fable-beacon', name: 'A beacon with a beam',
    note: "At the end of the food line a beacon shows your Fable week: '◈ Fable 65% ↻ 4d00h', and while any Fable is left it sends a beam up into the line above: a full beam while more than half is left, a half beam below that, and the beam gets darker as Fable runs out. Used up, as today, the beacon is grey, the beam is gone, the 0% is red and '↻ 19h00m' says when it is powered again. The word Fable is grey while you use Opus and pink when Fable is the model you use (red once it is used up)." },
];

/** The fable option, as hungerbar.json names it (the engine's id without 'fable-'). */
export type FableId = 'off' | 'tail' | 'tooltip' | 'boss' | 'beacon';
export const FABLE_IDS: readonly FableId[] = ['off', 'tail', 'tooltip', 'boss', 'beacon'];
// hud4.js L1541 (the mix's render): MIX.render(state, {git: 'git-terrain', pick: 'pick-numeral', book: 'on', fable})
/** The HUD for a state in the engine's format: 4 lines of spans, 5 with fable-boss while the model in use has a scoped limit. */
export function renderHud(state: unknown, fable: FableId): Span[][] {
  const sit = fromState(state);
  return mixFable(mix(sit, readHist(obj(state).hist)), sit, 'fable-' + fable);
}
