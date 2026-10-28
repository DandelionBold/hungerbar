// The picked mix (design rounds 4-7): Day & Night's lines 1-3 and the mix's line 4 with the pick (pick-numeral, the book
// on, git-terrain), ported line for line from the oracle (test/reference/hud4.js L200-339, L445-539, L565-604, L619-625,
// L649, L757-784, L872-886 and L965; plan §3-§4). hud.oracle.test.ts compares each function and every render.
// Only what MIX.render(state, {git: 'git-terrain', pick: 'pick-numeral', book: 'on', fable}) reaches is ported, so a few
// functions are specialised to that path (each says so in its header): mixLine4 to the three picked options, itemName
// without Survival's liteFirst, day() without Survival's absorb, f2Well on the plain well colour (only pick-daynight's
// pickaxe passes another).
// Traps kept on purpose: roman() evaluates cut(e, 6) every time; get() sees own properties only, so an effort of
// 'constructor' is no level; family() can be undefined, which get() misses (a white name, a grey pickaxe).
import { QUARTER, QUARTERS, type GitSit, type Hist, type Sit } from './input.ts';
import { clamp, divmod, family, get, pad02, pyFixed, pyLen, pyRound, pyStr, rep, rjust } from './py.ts';
import { merge, pad, rtrim, S, W, withBg, type Span } from './spans.ts';
import { cut, lite, none, tailPath } from './text.ts';
import { cellWidth } from './wt.ts';

// ---------- shared data rules (hud4.js L200-339) ----------
// hud4.js L202-211
export const ROMAN: Readonly<Record<string, string>> = { low: 'I', medium: 'II', high: 'III', xhigh: 'IV', max: 'V' };
export const RARITY: Readonly<Record<string, string>> = { Opus: '#FF55FF', Fable: '#FF55FF', Sonnet: '#55FFFF', Haiku: '#FFFF55' };
export const TIER: Readonly<Record<string, string>> = { Opus: '#55FFFF', Fable: '#9D8F8F', Sonnet: '#D8D8D8', Haiku: '#8F8F8F' };
export const GLINT: Readonly<Record<string, string>> = { low: '#201E07', medium: '#26192A', high: '#2E1A3A', xhigh: '#3A1D4A', max: '#48205C' };
export const WELL = '#201E07';
export const HEART = '#FF5555', DARK = '#3F3F3F';
export const FOOD = '#E0A458';
export const GREY = '#AAAAAA', DGREY = '#555555', WHITE = '#FFFFFF';
export const XPG = '#80FF20';
export const MAXW = 110;                                                  // Day & Night's line limit
// hud4.js L215: the effort is matched without case ('HIGH' is III); an unknown one shows as its own text (6 cells)
export const roman = (e: string): string => get(ROMAN, e.toLowerCase(), cut(e, 6));
// hud4.js L216
export const glint = (e: string): string => get(GLINT, e.toLowerCase(), WELL);
// hud4.js L218
export const icons10 = (left: number): number => (left <= 0 ? 0 : Math.min(10, Math.ceil(left / 10 - 1e-9)));
// hud4.js L219
export function t5(mins: number): string {
  const [h, m] = divmod(mins, 60);
  return h ? `${pyStr(h)}h${pad02(m)}m` : `${pyStr(m)}m`;
}
// hud4.js L223
export function twk(mins: number): string {
  const [d, r] = divmod(mins, 1440), [h, m] = divmod(r, 60);
  return d ? `${pyStr(d)}d${pad02(h)}h` : h ? `${pyStr(h)}h${pad02(m)}m` : `${pyStr(m)}m`;
}
// hud4.js L227: a count in at most 5 characters: 99999, then 100k, 9999k, 10M, ...
export function kilo(n: number): string {
  let unit = '';
  for (const u of ['k', 'M', 'G', 'T']) {
    if (n < (unit ? 1e4 : 1e5)) break;
    n = Math.floor(n / 1000); unit = u;
  }
  return pyStr(n) + unit;
}
// hud4.js L241, specialised: the 5-hour window is one Minecraft day. Survival's `absorb` (its gold hearts) is never set
// on the mix's situation, so its test is left out.
export function day(sit: Sit): Span {
  if (!none(sit.s5_left) && sit.s5_left <= 0) return S('☠  ', '#FF5555');
  const elapsed = 1 - sit.s5_reset / 300;
  if (elapsed < 0.6) return S('☼ ', '#FFFF55');
  if (elapsed < 0.8) return S('☼ ', '#FFAA00');
  return S('☾ ', '#AAAAAA');
}
// hud4.js L249
export const pctColour = (p: number): string => (p < 50 ? XPG : p < 80 ? '#FFFF55' : '#FF5555');
// hud4.js L251: the model keeps the rarity colour of its full name when the text is shortened
export const modelSpan = (sit: Sit, text: string = sit.model): Span => S(text, get(RARITY, family(sit.model), WHITE), null, true);
// hud4.js L309, specialised: the held-item name in at most `room` cells: the model with each lore in turn, then the lite
// model with the last lore, then that model cut with '…'. Survival's liteFirst is not shipped.
export function itemName(sit: Sit, room: number, lores: readonly (readonly Span[])[]): Span[] {
  const last = lores[lores.length - 1]!;
  const full = (l: readonly Span[]): Span[] => [modelSpan(sit), ...l], short1 = (l: readonly Span[]): Span[] => [modelSpan(sit, lite(sit.model)), ...l];
  const forms = [...lores.map(full), short1(last)];
  for (const f of forms) if (W(f) <= room) return f;
  return [modelSpan(sit, cut(lite(sit.model), room - W(last))), ...last];
}
// hud4.js L319
export function ctxLabel(sit: Sit): Span[] {
  const k = sit.ctx_tokens;
  const tok = k === 0 ? '0' : `${pyStr(Math.floor(k / 1000))}k`;
  const win = sit.ctx_window;
  const ws = win >= 1000000 ? `${pyFixed(win / 1e6, 1)}M` : `${pyStr(Math.floor(win / 1000))}k`;
  if (win < 1000) return [S(tok, pctColour(sit.ctx_pct))];   // no window given (or under 1k): never '/0k'
  return [S(tok, pctColour(sit.ctx_pct)), S('/' + ws, GREY)];
}
// hud4.js L329: a limit that is not given (null: an API key has none) is never used up
export const paying = (sit: Sit): boolean => (!none(sit.s5_left) && sit.s5_left <= 0) || (!none(sit.wk_left) && sit.wk_left <= 0);

// ---------- Day & Night (hud4.js L445-539): 16-cell gutter + 46-cell HUD block + text column ----------
// hud4.js L448-449
export const G2 = 16, B2 = 46;
export const DIV = S(' ', null, '#5D5D5D');
// hud4.js L451
export function f2Line1(sit: Sit): Span[] {
  // at least one space before the bubbles at col 42: 'Efficiency' becomes 'Eff', then '(1M context)' shrinks, then the
  // name is cut. No effort level: the model alone, an unenchanted item.
  const r = roman(sit.effort);
  let out = itemName(sit, G2 + 25, r ? [[S(' Efficiency ' + r, GREY)], [S(' Eff ' + r, GREY)]] : [[]]);
  const c = sit.cache;
  if (none(c)) return merge(out);
  out = pad(out, G2 + 26);                        // bubbles sit over the drumstick columns
  const hit = none(c.hit) ? [] : [S(' · ', DGREY), S(`hit ${pyStr(c.hit)}%`, GREY)];  // unknown: left out
  if (c.warm) {
    const left = c.ttl_left / (c.ttl / 10);
    const full = Math.trunc(left), drain = left - full > 1e-9 ? 1 : 0, spent = 10 - full - drain;
    out.push(S(rep('◦ ', spent), '#406580'), S(rep('○ ', drain), '#0094FF'), S(rep('◉ ', full), '#56B8FF'));
    const [mm, ss] = divmod(c.ttl_left, 60);
    out.push(S(`${pyStr(mm)}m${pad02(ss)}s`, '#56B8FF'), ...hit);
  } else {
    out.push(S(rep('◦ ', 10), '#406580'), S('cold', '#FF5555', null, true), ...hit);
  }
  return merge(out);
}
// hud4.js L472
export function f2Line2(sit: Sit): Span[] {
  let gut: Span[];
  if (none(sit.s5_left)) gut = pad([S('?', DGREY)], G2);   // no 5-hour limit given: dark hearts, no % or clock
  else {
    const p = pyStr(sit.s5_left) + '%';
    gut = [day(sit), S(t5(sit.s5_reset), GREY)];
    gut = [...gut, S(rep(' ', G2 - W(gut) - pyLen(p) - 1)), S(p, HEART, null, true), S(' ')];
  }
  const n = none(sit.s5_left) ? 0 : icons10(sit.s5_left);
  const hearts = [S(rep('♥ ', n), HEART), S(rep('♥ ', 10 - n), DARK)];
  const lv = sit.compactions;
  const lt = lv < 100 ? pyStr(lv) : '99';         // 100 or more shows 99 in yellow, like the counts
  // 6 cells: a space, the box (' 2 ' or ' 12 '), then what is left of the gap
  let gap = lv ? [S(' '), S(' ', null, '#000000'), S(lt, lv < 100 ? XPG : '#FFFF55', '#000000', true), S(' ', null, '#000000'),
    S(rep(' ', 3 - lt.length))] : [S('      ')];
  gap = pad(gap, 6);
  if (none(sit.wk_left)) return merge(rtrim([...gut, ...hearts, ...gap]));   // no weekly limit given: no food
  const f = icons10(sit.wk_left);
  const food = [S(rep('  ', 10 - f)), S(rep('🍗', f), FOOD)];
  const tail = [S(' '), S(pyStr(sit.wk_left) + '%', sit.wk_left <= 10 ? '#FF5555' : FOOD, null, true),
    S(' ↻ ' + twk(sit.wk_reset), GREY)];
  return merge([...gut, ...hearts, ...gap, ...food, ...tail]);
}
// hud4.js L496
export function f2Line3(sit: Sit): Span[] {
  const lab3 = ctxLabel(sit), gut = pad(W(lab3) > G2 - 1 ? lab3.slice(0, 1) : lab3, G2);   // a gap before the bar
  const fill = pyRound(sit.ctx_pct * B2 / 100);
  const cells: Span[] = [];
  for (let b = 0; b < B2; b++) {
    const notch = b % 5 === 0;                    // right above every hotbar divider
    cells.push(S('▂', b < fill ? (notch ? '#436924' : '#8BCA59') : (notch ? '#141F19' : '#36433C')));
  }
  const tail = [S(' '), S(pyStr(sit.ctx_pct) + '%', pctColour(sit.ctx_pct))];
  // the full path when it fits in 110 cells, else its last segments after '…'; no cwd, no spawn point
  if (sit.cwd) tail.push(S('  '), S('⌂ ' + tailPath(sit.cwd, MAXW - W(gut) - B2 - W(tail) - 4), GREY));
  return merge([...gut, ...cells, ...tail]);
}
// hud4.js L511, specialised: 4 cells, the icon box (2) + the count (2, right-aligned, bold white digits like Minecraft),
// always on the plain well colour (the bg argument is pick-daynight's glint, not shipped)
export function f2Well(icon: readonly Span[] | null, count: number | null): Span[] {
  if (icon === null) return [S('    ', null, WELL)];
  const out = icon.map((s) => withBg(s, WELL));
  if (none(count) || count <= 1) out.push(S('  ', null, WELL));
  else out.push(S(rjust(count < 100 ? pyStr(count) : '99', 2), count < 100 ? WHITE : '#FFFF55', WELL, true));
  return out;
}
// hud4.js L520
export function f2Gutter(sit: Sit): Span[] {
  // the version and a space must leave the offhand at col 9 and the hotbar at col 16: else the 'v' goes, then the
  // version is cut. The line starts with it, so an unknown version is 'v?'.
  const vroom = (none(sit.extra_left) ? G2 : G2 - 7) - 1, v = sit.ver || '?';
  const ver = cellWidth('v' + v) <= vroom ? 'v' + v : cut(v, vroom);
  let gut = [S(ver, DGREY), S(' ')];
  if (!none(sit.extra_left)) {
    const lit = paying(sit), cash = Math.trunc(sit.extra_left);
    const fl = lit ? S('▐', '#17DD62', '#5D5D5D') : DIV;
    const fr = lit ? S('▌', '#17DD62', '#5D5D5D') : DIV;
    // no whole dollar left: an empty offhand well (a bare ◆ would read as one emerald)
    gut = [...pad(gut, G2 - 7), fl, ...(cash >= 1 ? f2Well([S('◆ ', '#17DD62')], cash) : f2Well(null, null)), fr, S(' ')];
  }
  return pad(gut, G2);
}
// hud4.js L536-539: the hotbar's mint selection frame and the wells Day & Night fills
export const F2SEL_L = S('▐', '#D5E8D0', '#5D5D5D'), F2SEL_R = S('▌', '#D5E8D0', '#5D5D5D');
export const f2Book = (sit: Sit): Span[] => (sit.turns ? f2Well([S('📖', '#C8A27C')], sit.turns) : f2Well(null, null));
export const f2Gold = (sit: Sit): Span[] => (sit.cost > 0 ? f2Well([S('▄▄', '#FCEE4B')], Math.max(1, Math.trunc(sit.cost))) : f2Well(null, null));

// ---------- Your mix (hud4.js L565-886): line 4 with the pick ----------
// hud4.js L571-574
export const ENCH = '#FF55FF', PLUS = '#55FF55', MINUS = '#FF5555';
export const LEVEL: Readonly<Record<string, number>> = { low: 1, medium: 2, high: 3, xhigh: 4, max: 5 };
export const level = (e: string): number => get(LEVEL, e.toLowerCase(), 0);   // 0: no effort, or one we do not know ('turbo')
export const pickaxe = (sit: Sit, g: string): Span => S('⛏ ', get(TIER, family(sit.model), GREY), g);
// hud4.js L580: MIX_PICK['pick-numeral'], Survival's slot 1 in 4 cells: the level as ONE character, Ⅰ-Ⅴ (Yu Gothic UI in
// WT, 1 cell, both icon styles). The pad cell stays in the numeral's span (WT colours ink that crosses into a cell
// with that cell's fg).
export function pickNumeral(sit: Sit): Span[] {
  const n = level(sit.effort), g = glint(sit.effort);
  return [pickaxe(sit, g), n ? S('ⅠⅡⅢⅣⅤ'[n - 1]! + ' ', ENCH, g, true) : S('  ', null, g)];
}
// hud4.js L593-597: git items for slot 9, WT builtin glyphs (exact cell shapes, the same in both icon styles)
export const GRASS = S('▀▀', '#79C05A', '#866043');                 // Survival's grass block: green top over dirt
export const COBBLE = S('▒▒', '#5A5A5A', '#9A9A9A');                // Survival's cobblestone
export const BARE = S('  ', null, WELL);
export const LOWER8: readonly string[] = ['', '▁', '▂', '▃', '▄', '▅', '▆', '▇'];
export const changed = (g: GitSit | null): boolean => !!g && (g.add > 0 || g.rem > 0);
// hud4.js L599: git-pile's slot 9, the smaller count a slab of its share, 2/8 to 7/8 high
export function gitPile(g: GitSit): Span[] {
  const big = Math.max(g.add, g.rem);
  const one = (n: number, full: Span, colour: string): Span => (n <= 0 ? BARE : n >= big ? full
    : S(rep(LOWER8[Math.min(7, Math.max(2, pyRound((8 * n) / big)))]!, 2), colour, WELL));
  return [one(g.add, GRASS, '#79C05A'), one(g.rem, COBBLE, '#9A9A9A')];
}
// hud4.js L619: from col 62, the exact counts first, like a stack count, then the branch (whole while line 4 stays
// within 110 cells, else shortened from the front)
export function spillReadout(g: GitSit, used: number): Span[] {
  const lead: Span[] = [];
  if (g.add) lead.push(S(' '), S('+' + kilo(g.add), PLUS, null, true));
  if (g.rem) lead.push(S(' '), S('-' + kilo(g.rem), MINUS, null, true));
  lead.push(S(changed(g) ? '  ' : ' '), S('⎇ ', GREY));
  return [...lead, S(tailPath(g.branch, MAXW - used - W(lead)), WHITE)];
}
// hud4.js L649: lower eighths, index = height in eighths
export const LOW9: readonly string[] = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
// hud4.js L763: one step per digit like the heaps: 2 x log10(1 + v) eighths, at least 2/8
export const terrainLevel = (v: number): number => clamp(pyRound(2 * Math.log10(1 + v)), 2, 8);
/** git-terrain's wells: slots 7 and 8, or none. */
export interface TerrainWells { 7?: Span[]; 8?: Span[] }
// hud4.js L764: git-terrain (slots 7-8), the last two hours, one column per quarter hour (col 55 = now), drawn the same
// while it is current and after it has passed; gold when a commit was seen in it
export function terrain(sit: Sit, h: Hist | null): TerrainWells {
  const g = sit.git;
  if (!g) return {};
  const T = g.add + g.rem, shown: (readonly number[] | null)[] = [];
  if (h) {
    const I0 = Math.floor(h.now / QUARTER), at = (k: number): readonly number[] | null => h.buckets.find((b) => b[0] === I0 - (QUARTERS - 1) + k) || null;
    for (let k = 0; k < QUARTERS - 1; k++) shown.push(at(k));
    const cur = at(QUARTERS - 1);
    shown.push(cur && cur[1]! >= T ? cur : [I0, T, g.add, g.rem, cur ? cur[4]! : 0]);
  } else {                                                   // no history: now only
    for (let k = 0; k < QUARTERS - 1; k++) shown.push(null);
    shown.push(T > 0 ? [0, T, g.add, g.rem, 0] : null);
  }
  if (!shown.some((b) => b && (b[1]! > 0 || b[4]))) return {};    // nothing changed or saved in two hours
  const col = (b: readonly number[] | null): Span => {
    if (!b) return S(' ', null, WELL);                       // Hungerbar did not render then
    if (b[1] === 0) return S('▁', b[4] ? '#FCEE4B' : '#866043', WELL);   // bare ground (clean), gold if a commit
    return S(LOW9[terrainLevel(b[1]!)]!, b[4] ? '#FCEE4B' : b[2]! >= b[3]! ? '#79C05A' : '#9A9A9A', WELL);
  };
  return { 7: shown.slice(0, 4).map(col), 8: shown.slice(4).map(col) };
}
// hud4.js L872, specialised to the pick: the book 'on' (no MIX_BOOK6 entry: f2Book in slot 2, slots 4-6 empty),
// git-terrain (slots 7-8; slot 9 and the readout are round 5's pile and spillReadout), pick-numeral in slot 1.
export function mixLine4(sit: Sit, h: Hist | null): Span[] {
  const gut = f2Gutter(sit);
  const gw = terrain(sit, h);
  const wells = [f2Book(sit), f2Gold(sit), null, null, null, gw[7], gw[8], changed(sit.git) ? gitPile(sit.git!) : null];
  const hb = [F2SEL_L, ...pickNumeral(sit), F2SEL_R];
  for (const w of wells) hb.push(...(w || f2Well(null, null)), DIV);
  const tail = sit.git ? spillReadout(sit.git, W(gut) + W(hb)) : [];   // outside a repo nothing follows the hotbar
  return merge([...gut, ...hb, ...tail]);
}
// hud4.js L965, with the pick
export const mix = (sit: Sit, h: Hist | null): Span[][] => [f2Line1(sit), f2Line2(sit), f2Line3(sit), mixLine4(sit, h)];
// The fable option and renderHud(), the whole HUD, are in fable.ts.
