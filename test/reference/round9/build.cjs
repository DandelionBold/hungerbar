'use strict';
// Design round 9 (the v1.1 looks): builds the six feature files ultra.json, stale.json, totem.json, paying.json,
// emerald.json and pickup.json, then hungerbar-picker-9.html from picker-template.html with all six embedded.
//   node build.cjs            (checks every rule below and throws on a break)
//   node build.cjs --show     (also prints the changed line of every row as text)
//
// Every row is the HUD as Hungerbar 1.0 draws it for that situation, then the option's layer on top:
//   1. the vendored engine, test/reference/hud4.js MIX.render(state, {git-terrain, pick-numeral, book on, fable-boss}),
//      the shipped defaults (src/hud/mix.ts is that path; config.ts hud.fable 'boss');
//   2. the option's layer, on the engine's lines (like src/hud/bed.ts: it reads what the engine drew, checks the cells it
//      replaces are what it expects, and writes only its own cells);
//   3. the hotbar's frame, src/hud/frame.ts ported below (offhand top edge, bottom edge row, the boss line's blank gutter),
//      so a layer that recolours the offhand's sides moves the frame's edges with it, as the shipped frame would.
// Left out on purpose: the git state marks, the PR badge and the player's layers (name, operator mark, bed, phantoms) and
// the centring; none of round 9 touches their cells.
// Rules checked for every row: <= 110 cells a line, no line starts with a space (Claude Code trims it), every glyph is one
// whose font Windows Terminal is known to take (FONTS / CASCADIA / WT built-in shapes), the today option is exactly
// engine + frame, and every other option differs from today ONLY inside the cells its feature declares (ALLOWED).
// Spans are the engine's own shape {t, fg?, bg?, bold?}.
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');

const REF = 'D:/webapp/test/reference/';
const DIR = __dirname;
const ENGINE_FILE = REF + 'hud4.js';
const ENGINE_SRC = fs.readFileSync(ENGINE_FILE, 'utf8');
const H = vm.runInNewContext(ENGINE_SRC + ';HUD4', {});
const STATES = JSON.parse(fs.readFileSync(REF + 'hud4-states.json', 'utf8'));
const MIX = H.concepts.find((c) => c.key === 'mix');
const ENGINE_OPTS = { style: 'colour', git: 'git-terrain', pick: 'pick-numeral', book: 'on', fable: 'fable-boss' };
const CW = H.cellWidth;
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const clone = (x) => JSON.parse(JSON.stringify(x));
const SHOW = process.argv.includes('--show');

// ---------- the engine's colours and helpers (hud4.js L172-249) ----------
const HEART = '#FF5555', DARK = '#3F3F3F', GOLD = '#FFAA00', FOOD = '#E0A458', GREY = '#AAAAAA', WHITE = '#FFFFFF';
const YELLOW = '#FFFF55', WELL = '#201E07', DIVBG = '#5D5D5D', EMERALD = '#17DD62';
const G2 = 16, MAXW = 110;
const S = (t, fg, bg, bold) => { const d = { t }; if (fg) d.fg = fg; if (bg) d.bg = bg; if (bold) d.bold = true; return d; };
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function sameAttrs(a, b) {
  const ka = Object.keys(a).filter((k) => k !== 't'), kb = Object.keys(b).filter((k) => k !== 't');
  return ka.length === kb.length && ka.every((k) => own(b, k) && a[k] === b[k]);
}
function merge(spans) {
  const out = [];
  for (const s of spans) {
    if (!s.t) continue;
    const last = out[out.length - 1];
    if (last && sameAttrs(last, s)) last.t += s.t;
    else out.push({ ...s });
  }
  return out;
}
const W = (spans) => spans.reduce((w, s) => w + CW(s.t), 0);
const textOf = (spans) => spans.map((s) => s.t).join('');
function pyRound(x) { if (Math.abs(x % 1) === 0.5) return 2 * Math.round(x / 2) + 0; return Math.round(x) + 0; }
const pad02 = (n) => String(n).padStart(2, '0');
function t5(mins) { const h = Math.floor(mins / 60), m = mins - h * 60; return h ? `${h}h${pad02(m)}m` : `${m}m`; }
const rjust = (s, n) => ' '.repeat(Math.max(0, n - [...s].length)) + s;
// the engine's shade (hud4.js L1109) is pyRound; these use Math.round (half up), which gives the brief's hexes
// (#993333, #866235, #FFAAAA, #F0D2AC, #8BEEB1); for every colour here the two agree but #17DD62 lightened (176.5)
const hex2 = (v) => v.toString(16).toUpperCase().padStart(2, '0');
const mapRGB = (c, f) => '#' + [1, 3, 5].map((i) => hex2(Math.round(f(parseInt(c.slice(i, i + 2), 16))))).join('');
const dim = (c) => mapRGB(c, (v) => v * 0.6);
const lighten = (c) => mapRGB(c, (v) => v + (255 - v) * 0.5);

// ---------- cells: one entry per WT cell, null for the second cell of a wide glyph ----------
function cells(line) {
  const out = [];
  for (const s of line) {
    let w = 0;
    for (const ch of s.t) {
      const cw = CW(ch);
      if (cw < 1) throw new Error(`zero-width ${JSON.stringify(ch)}`);
      w += cw;
      out.push({ ...s, t: ch });
      for (let i = 1; i < cw; i++) out.push(null);
    }
    if (w !== CW(s.t)) throw new Error(`span ${JSON.stringify(s.t)} is not one cluster per code point`);
  }
  return out;
}
const join = (cs) => merge(cs.filter(Boolean));
// Writes spans over cells [col, col + width), never splitting a wide glyph.
function write(cs, col, spans) {
  const add = cells(spans);
  if (cs[col] === null) throw new Error(`write at col ${col} splits a wide glyph`);
  if (cs[col] === undefined) throw new Error(`write at col ${col} is past the line's end (${cs.length})`);
  if (col + add.length < cs.length && cs[col + add.length] === null) throw new Error(`write at ${col}+${add.length} splits a wide glyph`);
  for (let i = 0; i < add.length; i++) cs[col + i] = add[i];
}
const isBlankCell = (c) => c && c.t === ' ' && !c.fg && !c.bold;
const isSpace = (c) => c && c.t === ' ' && !c.bg;          // a space with no background (the hearts' spaces carry their ink)
// [from, to) of the first run of cells matching re (on their glyphs), searching cols [lo, hi)
function findRun(cs, re, lo, hi) {
  let s = '', map = [];
  for (let c = lo; c < Math.min(hi, cs.length); c++) if (cs[c]) { s += cs[c].t; map.push(c); }
  const m = re.exec(s);
  if (!m) return null;
  return [map[m.index], map[m.index + [...m[0]].length - 1] + 1];
}

// ---------- the hotbar's frame: src/hud/frame.ts (1.0.0), ported span for span ----------
const EDGE = '\u{1FB82}', TOP = '▂', BLANK = '\u2800', MINT = '#D5E8D0', FRAME = '#5D5D5D', BOSS = '\u{1FB82}';
const OFFHAND = [9, 15], HOTBAR = [16, 62], SELECTED = [16, 22];
function splitAt(line, col) {
  const a = [], b = [];
  let c = 0;
  for (const s of line) {
    const w = CW(s.t);
    if (c + w <= col) a.push(s);
    else if (c >= col) b.push(s);
    else {
      let x = '', y = '', at = c;
      for (const g of s.t) { const gw = CW(g); if (!y && at + gw <= col) { x += g; at += gw; } else y += g; }
      if (x) a.push({ ...s, t: x });
      if (y) b.push({ ...s, t: y });
    }
    c += w;
  }
  return [a, b];
}
function spanAt(line, col) { let c = 0; for (const s of line) { c += CW(s.t); if (col < c) return s; } return null; }
function offhandSide(hot) { const s = spanAt(hot, OFFHAND[0]); return s && s.bg ? s.fg || s.bg : null; }
function offhandTop(line, side) {
  const [head, rest] = splitAt(line, OFFHAND[0]);
  const [mid, tail] = splitAt(rest, OFFHAND[1] - OFFHAND[0]);
  const blank = W(head) === OFFHAND[0] && W(mid) === OFFHAND[1] - OFFHAND[0] && mid.every((s) => /^ +$/.test(s.t) && !s.fg && !s.bg && !s.bold);
  return blank ? merge([...head, S(TOP.repeat(OFFHAND[1] - OFFHAND[0]), side), ...tail]) : [...line];
}
function edgeRow(side) {
  const off = OFFHAND[1] - OFFHAND[0];
  return merge([S(BLANK.repeat(OFFHAND[0])), side ? S(EDGE.repeat(off), side) : S(BLANK.repeat(off)), S(BLANK.repeat(HOTBAR[0] - OFFHAND[1])),
    S(EDGE.repeat(SELECTED[1] - SELECTED[0]), MINT), S(EDGE.repeat(HOTBAR[1] - SELECTED[1]), FRAME)]);
}
function bossGutter(line) {
  const [gutter, rest] = splitAt(line, HOTBAR[0]);
  const pad = gutter[gutter.length - 1], bar = rest[0];
  const drawn = W(gutter) === HOTBAR[0] && pad.t.endsWith(' ') && !pad.fg && !pad.bg && !pad.bold && bar !== undefined && bar.t.startsWith(BOSS);
  return drawn ? merge([S(BLANK.repeat(HOTBAR[0])), ...rest]) : [...line];
}
function frameHud(lines) {
  const out = lines.map((l) => [...l]);
  const n = out.length, side = offhandSide(out[n - 1]);
  if (n === 5) out[0] = bossGutter(out[0]);
  if (side) out[n - 2] = offhandTop(out[n - 2], side);
  out.push(edgeRow(side));
  return out;
}

// ---------- fonts: which font Windows Terminal 1.25 takes each glyph from (scripts/media/term.mjs FALLBACK, the round-4
// glyph probe, and a cmap check of this PC's fonts for ☥ ✦) ----------
// E Segoe UI Emoji (colour, ignores our colour), S Segoe UI Symbol (plain, our colour), Y Yu Gothic UI. Plain icons is the
// font face 'Cascadia Mono, Segoe UI Symbol' (src/cli/icons.ts), so every E glyph that Segoe UI Symbol has turns S.
const FONTS = {
  colour: { '🍗': 'E', '📖': 'E', '🔥': 'E', '⛏': 'E', '☠': 'E', '❄': 'E', '♡': 'E', '↻': 'S', '⎇': 'S', '☾': 'S', '⏵': 'S', '✦': 'S', '☥': 'S',
    'Ⅰ': 'Y', 'Ⅱ': 'Y', 'Ⅲ': 'Y', 'Ⅳ': 'Y', 'Ⅴ': 'Y' },
};
FONTS.plain = Object.fromEntries(Object.entries(FONTS.colour).map(([g, f]) => [g, f === 'E' ? 'S' : f]));
const CASCADIA = new Set([...'◦○◉·⌂…∞■◆♥☼▣▦']);
const builtin = (cp) => (cp >= 0x2580 && cp <= 0x259F) || (cp >= 0x1FB00 && cp <= 0x1FB3B) || (cp >= 0x1FB82 && cp <= 0x1FB86);
function checkGlyphs(lines, where) {
  for (const l of lines) for (const s of l) for (const ch of s.t) {
    const cp = ch.codePointAt(0);
    if (cp < 128 || cp === 0x2800 || builtin(cp) || CASCADIA.has(ch) || own(FONTS.colour, ch)) continue;
    throw new Error(`${where}: glyph ${ch} U+${cp.toString(16).toUpperCase()} has no known WT font`);
  }
}

// ---------- the situations ----------
const BASE = STATES.normal;    // Opus 5.5 high, 8% context, main +1208 -279, 5-hour 2% used, week 82% used, $0 of $50 used
const state = (patch) => ({ ...clone(BASE), ...clone(patch) });
const engine = (st) => MIX.render(st, ENGINE_OPTS);
// The line roles: the engine draws 4 lines, or 5 with the boss bar on top; the frame adds the bottom edge.
const rolesOf = (n) => (n === 5 ? ['boss', 'top', 'hearts', 'xp', 'hot'] : ['top', 'hearts', 'xp', 'hot']);
// edit(lines, role, fn): fn gets that line's cells and changes them in place
function editor(lines) {
  const roles = rolesOf(lines.length);
  return (role, fn) => {
    const i = roles.indexOf(role);
    if (i < 0) throw new Error(`no ${role} line`);
    const cs = cells(lines[i]);
    fn(cs);
    lines[i] = join(cs);
  };
}
// the engine's 5-hour gutter (f2Line2, cols 0-15) for a known 5-hour, with day()'s absorb (no ☠ while the credits pay)
function day(sit, absorb) {
  if (sit.s5_left !== null && sit.s5_left <= 0 && !absorb) return S('☠  ', '#FF5555');
  const elapsed = 1 - sit.s5_reset / 300;
  if (elapsed < 0.6) return S('☼ ', '#FFFF55');
  if (elapsed < 0.8) return S('☼ ', '#FFAA00');
  return S('☾ ', '#AAAAAA');
}
function gutter5(sit, absorb) {
  const p = String(sit.s5_left) + '%';
  const gut = [day(sit, absorb), S(t5(sit.s5_reset), GREY)];
  return merge([...gut, S(' '.repeat(G2 - W(gut) - p.length - 1)), S(p, HEART, null, true), S(' ')]);
}
// the 5-hour %'s cells in the gutter (bold, cols 0-15) and the weekly %'s (after the space at col 62)
const pct5 = (cs) => { const r = findRun(cs, /\d+%/, 0, G2); if (!r) throw new Error('no 5-hour %'); return r; };
const pctWk = (cs) => { const r = findRun(cs, /^ \d+%/, 62, 70); if (!r) throw new Error('no weekly % at col 62'); return [r[0] + 1, r[1]]; };
function heartsCells(cs) {                        // cols 16-35: ten '♥ ' as the engine draws them
  for (let k = 0; k < 10; k++) {
    const h = cs[16 + 2 * k], sp = cs[17 + 2 * k];
    if (!h || h.t !== '♥' || !sp || sp.t !== ' ') throw new Error(`hearts row: cell ${16 + 2 * k} is not '♥ '`);
  }
}
const hearts = (lit, fg) => merge([S('♥ '.repeat(lit), fg), S('♥ '.repeat(10 - lit), DARK)]);

// ---------- feature 1: ultra ----------
const GOLD_U = '#FFD43B', ROSY = '#FF9999';
const ultraK = (ctx) => Math.floor(ctx.now / 10) % 10;
function ultraGutter(inf) { return [S('☼', '#FFFF55'), S(' '.repeat(13)), S('∞', inf, null, true), S(' ')]; }
function ultraGuard(cs, sit) {
  if (sit.s5_left !== null) throw new Error('ultra: the situation has a 5-hour limit');
  if (cs[0].t !== '?' || !cs.slice(1, 16).every(isBlankCell)) throw new Error('ultra: the gutter is not 1.0\'s ?');
  heartsCells(cs);
}
const ULTRA = {
  key: 'ultra',
  title: 'No 5-hour limit (the Ultra plan)',
  intro: 'On the Ultra plan Claude Code sends no five_hour limit at all, only the week. Hungerbar 1.0 then draws a grey ? and ten dark hearts, ' +
    'which reads as "no health left" or "something broke", when it really means "no 5-hour limit to run out of". ' +
    'These options say "unlimited" instead. Hardcore hearts were ruled out: in Minecraft they mean one life only (permadeath), the opposite of an unlimited plan.',
  focus: ['boss', 'hearts'],
  allowed: [['hearts', 0, 36]],
  situations: [
    { id: 'u-normal', label: 'A normal day without a 5-hour limit', note: 'Weekly 82% used (18% left), $50 of extra credits, nothing paying.',
      state: state({ h5: null }), ctx: { now: 1793520020 } },
    { id: 'u-week95', label: 'The same, with the week at 95% used', note: '5% of the week left: one drumstick and a red 5%.',
      state: state({ h5: null, week: { used: 95, left: 345540 } }), ctx: { now: 1793520050 } },
    { id: 'u-fable', label: 'Fable in use, no 5-hour limit (5 lines with the boss bar)', note: 'Fable 5.1 with 65% of its own week left: the boss bar on top.',
      state: state({ h5: null, model: 'Fable 5.1', scoped: [{ name: 'Fable', used: 35, left: 345600 }] }), ctx: { now: 1793520070 } },
    { id: 'u-paying', label: 'Week used up, extra credits paying ($45.80 of $50 left)', note: 'The offhand emerald is lit green: the extra credits pay.',
      state: state({ h5: null, week: { used: 100, left: 187200 }, extra: { used: 4.2, limit: 50 } }), ctx: { now: 1793520090 } },
  ],
  options: [
    { id: 'ultra-apple', name: 'Golden apple', recommended: true,
      optionNote: 'A golden apple gives Minecraft\'s absorption hearts: extra hearts in gold that sit on top of your health. ' +
        'Here all ten hearts are gold (#FFD43B) and the 5-hour % becomes a bold gold ∞. The sun ☼ stays in the gutter so the line still starts with the day, but there is no clock: nothing resets. ' +
        'Gold is used nowhere else on the hearts row, so it can only mean "no 5-hour limit".',
      layer(ed, sit) { ed('hearts', (cs) => { ultraGuard(cs, sit); write(cs, 0, ultraGutter(GOLD_U)); write(cs, 16, hearts(10, GOLD_U)); }); } },
    { id: 'ultra-notch', name: 'Enchanted golden apple (glint)',
      optionNote: 'The golden apple, plus a white ✦ glint that moves along the hearts like the shimmer on an enchanted item: it sits in the space after heart k, k = (seconds ÷ 10) mod 10, so it steps one heart to the right every 10 seconds and starts over. ' +
        'Each row below is a different moment (glint after heart 3, 6, 8 and 10). ✦ comes from Segoe UI Symbol and its ink runs about 0.3 cell into the next heart\'s cell.',
      layer(ed, sit, ctx) {
        ed('hearts', (cs) => { ultraGuard(cs, sit); write(cs, 0, ultraGutter(GOLD_U)); write(cs, 16, hearts(10, GOLD_U)); write(cs, 17 + 2 * ultraK(ctx), [S('✦', WHITE)]); });
      } },
    { id: 'ultra-creative', name: 'Creative mode',
      optionNote: 'In Creative mode Minecraft has no hearts at all. The hearts row is left empty and the gutter says Creative in grey. ' +
        'The word is padded to the gutter\'s 16 cells, so the line still starts with text: Claude Code trims spaces at the start of a line, and a blank gutter would shift the whole row left.',
      layer(ed, sit) { ed('hearts', (cs) => { ultraGuard(cs, sit); write(cs, 0, [S('Creative', GREY), S(' '.repeat(8))]); write(cs, 16, [S(' '.repeat(20))]); }); } },
    { id: 'ultra-regen', name: 'Regeneration',
      optionNote: 'Minecraft\'s regeneration effect: ten full red hearts, and one of them brighter (#FF9999) that moves along the row, heart k = (seconds ÷ 10) mod 10, one step every 10 seconds. ' +
        'The gutter is the golden apple\'s ☼ and ∞, with ∞ in heart red so the row stays one colour. Each row below is a different moment (bright heart 3, 6, 8 and 10). ' +
        'Red hearts look like a healthy 5-hour window, so a glance does not tell Ultra from a fresh 5 hours on another plan.',
      layer(ed, sit, ctx) {
        ed('hearts', (cs) => {
          ultraGuard(cs, sit); write(cs, 0, ultraGutter(HEART)); write(cs, 16, hearts(10, HEART));
          write(cs, 16 + 2 * ultraK(ctx), [S('♥', ROSY)]);
        });
      } },
    { id: 'ultra-today', name: 'Today (1.0)', today: true,
      optionNote: 'What Hungerbar 1.0 draws without a 5-hour limit: a grey ? where the clock and % go, and ten dark hearts, the same as a used-up window minus the skull.',
      layer() {} },
  ],
};

// ---------- feature 2: stale ----------
function staleLayer(tilde) {
  return (ed, sit, ctx) => ed('hearts', (cs) => {
    if (ctx.stale.h5 && sit.s5_left !== null) {
      const [a, b] = pct5(cs);
      if (tilde) { if (!isBlankCell(cs[a - 1])) throw new Error('stale: no space before the 5-hour %'); write(cs, a - 1, [S('~', GREY)]); }
      for (let c = a; c < b; c++) cs[c] = { ...cs[c], fg: dim(cs[c].fg) };
      heartsCells(cs);
      for (let c = 16; c < 36; c += 2) if (cs[c].fg === HEART) for (const d of [c, c + 1]) cs[d] = { ...cs[d], fg: dim(HEART) };   // the heart and its space, one span
    }
    if (ctx.stale.week && sit.wk_left !== null) {
      const [a, b] = pctWk(cs);
      if (tilde) write(cs, a - 1, [S('~', GREY)]);
      for (let c = a; c < b; c++) cs[c] = { ...cs[c], fg: dim(cs[c].fg) };
      for (let c = 42; c < 62; c++) if (cs[c] && cs[c].t === '🍗') cs[c] = { ...cs[c], fg: dim(cs[c].fg) };
    }
  });
}
const STALE = {
  key: 'stale',
  title: 'Limits that are not live',
  intro: 'When Claude Code sends no limits (the first seconds of a session, or its glitch of all zeros), Hungerbar shows the last ones it saved in limits.json. ' +
    'The classic look marks those with ~ and dims them; the HUD 1.0 draws them exactly like live ones, so an hours-old 98% looks current. ' +
    'In the colour icon style 🍗 is a colour emoji that ignores Hungerbar\'s colours, so dimming cannot reach the drumsticks there: only the % (and the ~) show that the week is old. The plain style dims them too.',
  focus: ['hearts'],
  allowed: [['hearts', 0, 36], ['hearts', 42, 70]],
  situations: [
    { id: 's-file', label: 'Last-known limits from limits.json', note: '5-hour 2.4% used, resets in 17340 s (4h49m); week 86.1% used, resets in 84539 s (23h28m). Both from the file.',
      state: state({ h5: { used: 2, left: 17340, window: 18000 }, week: { used: 86, left: 84539 } }), ctx: { stale: { h5: true, week: true } } },
    { id: 's-passed', label: 'The saved 5-hour window is past its reset', note: 'limits.json\'s 5-hour reset has passed, so it counts as a fresh window: 0% used and no clock known (the engine shows 5h00m). The week is still the saved 86%.',
      state: state({ h5: { used: 0, window: 18000 }, week: { used: 86, left: 70140 } }), ctx: { stale: { h5: true, week: true } } },
    { id: 's-none', label: 'Nothing known at all', note: 'No limits from Claude Code and no limits.json: the ? already says "unknown", so no option changes anything here.',
      state: state({ h5: null, week: null }), ctx: { stale: { h5: false, week: false } } },
    { id: 's-zeros', label: 'Claude Code sends zeros, an older limits.json behind it', note: 'Both windows at 0 with no reset is Claude Code\'s glitch, so Hungerbar ignores them (the glitch rule) and shows the file: 5-hour 63% used (45m left), week 86% used.',
      state: state({ h5: { used: 63, left: 2700, window: 18000 }, week: { used: 86, left: 84539 } }), ctx: { stale: { h5: true, week: true } } },
  ],
  options: [
    { id: 'stale-tilde', name: '~ and dimmed', recommended: true,
      optionNote: 'The space before each % becomes a grey ~ (the classic look\'s "about" mark), and the red hearts, the drumsticks and both % are drawn at 60% brightness: hearts #993333, drumsticks and the weekly % #866235. ' +
        'The clocks and the empty hearts stay as they are. As soon as Claude Code sends live limits again, the ~ goes and the colours come back.',
      layer: staleLayer(true) },
    { id: 'stale-dim', name: 'Dimmed only',
      optionNote: 'The same 60% dimming without the ~. Quieter, but a dim row is easy to read as "low" rather than "old", and in the colour icon style the week only changes its %.',
      layer: staleLayer(false) },
    { id: 'stale-today', name: 'Today (1.0)', today: true,
      optionNote: 'What 1.0 draws: last-known limits look exactly like live ones. This is the bug the feature fixes.',
      layer() {} },
  ],
};

// ---------- feature 3: totem ----------
const TOTEM = '#FFC83D';
const dying = (sit) => [sit.s5_left, sit.wk_left].some((v) => v !== null && v > 0 && v <= 10);
const payingSit = (sit) => [sit.s5_left, sit.wk_left].some((v) => v !== null && v <= 0);
const holds = (sit) => sit.extra_left !== null && sit.extra_left > 0;
const count2 = (cash) => (cash <= 1 ? [S('  ', null, WELL)] : [S(rjust(cash < 100 ? String(cash) : '99', 2), cash < 100 ? WHITE : YELLOW, WELL, true)]);
function offhandGuard(cs) {
  if (!(cs[9] && cs[9].bg === DIVBG && cs[14] && cs[14].bg === DIVBG)) throw new Error('no offhand at cols 9-14');
  for (let c = 10; c < 14; c++) if (!cs[c] || cs[c].bg !== WELL) throw new Error(`offhand well col ${c} is not the well`);
}
function slot5Guard(cs) {
  for (let c = 37; c < 41; c++) if (!cs[c] || cs[c].t !== ' ' || cs[c].bg !== WELL || cs[c].fg) throw new Error(`slot 5 col ${c} is not empty`);
  if (!(cs[36] && cs[36].bg === DIVBG && cs[41] && cs[41].bg === DIVBG)) throw new Error('slot 5 sides are not the frame');
}
const TOTEM_OPT = {
  key: 'totem',
  title: 'The Totem of Undying',
  intro: 'In Minecraft a Totem of Undying held in the offhand saves you from a death blow once: it pops, and you live. Your extra credits do the same for Claude Code: when a limit runs out they keep you working. ' +
    'These options show the totem while a limit is nearly gone (10% left or less) and you have credits, and let it pop for 30 seconds when a window hits 0. ' +
    'Hungerbar sees the pop because its shown file last saw the window above 0 (here the 5-hour went 1% → 0%). With no credits there is no totem: a totem only saves the one who holds it.',
  focus: ['hearts', 'xp', 'hot', 'edge'],
  allowed: [['hot', 9, 15], ['hot', 36, 42], ['xp', 9, 15], ['edge', 9, 15]],
  situations: [
    { id: 't-healthy', label: 'Healthy, $50 of credits', note: '5-hour 98% left, week 18% left: nothing is dying, so nothing changes.',
      state: state({}), ctx: { pop: null } },
    { id: 't-h5-7', label: '5-hour at 7% left, $50 of credits', note: 'One heart left: the 5-hour window is dying.',
      state: state({ h5: { used: 93, left: 2280, window: 18000 } }), ctx: { pop: null } },
    { id: 't-wk-3', label: 'Weekly at 3% left, $50 of credits', note: 'One drumstick and a red 3%: the week is dying.',
      state: state({ week: { used: 97, left: 33120 } }), ctx: { pop: null } },
    { id: 't-pop', label: 'THE POP: the 5-hour just hit 0, $45.80 left', note: 'The shown file saw the 5-hour go 1% → 0%, so the credits just took over. The pop lasts 30 seconds.',
      state: state({ h5: { used: 100, left: 3900, window: 18000 }, extra: { used: 4.2, limit: 50 } }), ctx: { pop: 0 } },
    { id: 't-after', label: '30 s after the pop', note: 'Back to 1.0\'s paying look: the green-framed emerald with the dollars left.',
      state: state({ h5: { used: 100, left: 3900, window: 18000 }, extra: { used: 4.2, limit: 50 } }), ctx: { pop: 30 } },
    { id: 't-broke', label: 'Credits at $0 and the 5-hour at 0', note: 'Nothing left to pay with: only the skull and the respawn countdown. (1.0 still lights the frame green around the empty well.)',
      state: state({ h5: { used: 100, left: 3900, window: 18000 }, extra: { used: 50, limit: 50 } }), ctx: { pop: null } },
    { id: 't-nocredits', label: '5-hour at 7% left, no extra credits', note: 'An account without extra usage has no offhand at all: no totem to hold.',
      state: state({ h5: { used: 93, left: 2280, window: 18000 }, extra: null }), ctx: { pop: null } },
  ],
  options: [
    { id: 'totem-offhand', name: 'Totem in the offhand', recommended: true,
      optionNote: 'While a limit is dying the emerald in the offhand turns into a gold totem ☥ (#FFC83D) with your dollars as its count: "v2.1.306  ☥ 50  ▐⛏ Ⅳ ▌…". ' +
        'When a window hits 0 it pops for 30 seconds: ☥✦ with the dollars left, between gold sides (#FFC83D on the frame grey), and the frame\'s top and bottom edges turn gold with them: "v2.1.306 ▐☥✦45▌ ▐⛏ Ⅲ ▌…". ' +
        'Then it is the green paying emerald again. ✦ (Segoe UI Symbol) runs about 0.3 cell into the first digit.',
      layer(ed, sit, ctx) {
        if (!holds(sit)) return;
        const cash = Math.trunc(sit.extra_left);
        if (payingSit(sit)) {
          if (ctx.pop === null || ctx.pop >= 30) return;
          ed('hot', (cs) => { offhandGuard(cs); write(cs, 9, [S('▐', TOTEM, DIVBG), S('☥', TOTEM, WELL), S('✦', WHITE, WELL), ...count2(cash), S('▌', TOTEM, DIVBG)]); });
        } else if (dying(sit)) ed('hot', (cs) => { offhandGuard(cs); write(cs, 10, [S('☥ ', TOTEM, WELL), ...count2(cash)]); });
      } },
    { id: 'totem-slot5', name: 'Totem in hotbar slot 5',
      optionNote: 'The emerald stays in the offhand as today, and the totem appears in the empty hotbar slot 5 (cols 37-40), without a count, while a limit is dying. ' +
        'The pop puts ☥✦ in that slot between gold half-block sides for 30 seconds, then the slot is empty again (the totem is used up). ' +
        'Keeps the dollars readable, but slot 5 is in the middle of the hotbar, far from the emerald that pays.',
      layer(ed, sit, ctx) {
        if (!holds(sit)) return;
        if (payingSit(sit)) {
          if (ctx.pop === null || ctx.pop >= 30) return;
          ed('hot', (cs) => { slot5Guard(cs); write(cs, 36, [S('▐', TOTEM, DIVBG), S('☥', TOTEM, WELL), S('✦', WHITE, WELL), S('  ', null, WELL), S('▌', TOTEM, DIVBG)]); });
        } else if (dying(sit)) ed('hot', (cs) => { slot5Guard(cs); write(cs, 37, [S('☥ ', TOTEM, WELL), S('  ', null, WELL)]); });
      } },
    { id: 'totem-off', name: 'No totem (today)', today: true,
      optionNote: 'What 1.0 draws: nothing warns that the credits are about to take over, and nothing marks the moment they do, until the green paying frame.',
      layer() {} },
  ],
};

// ---------- feature 4: paying ----------
const POISON = '#8DB33A';
function payLayer(kind) {
  return (ed, sit) => {
    if (!(sit.s5_left !== null && sit.s5_left <= 0 && holds(sit))) return;   // only while the credits pay for a used-up 5-hour
    const share = sit.extra_left / sit.extra_limit * 10;
    const lit = kind === 'poison' ? Math.max(1, pyRound(share)) : pyRound(share);
    ed('hearts', (cs) => {
      const g = gutter5(sit, false);
      if (JSON.stringify(cs.slice(0, G2)) !== JSON.stringify(cells(g))) throw new Error('paying: the gutter is not the engine\'s');
      heartsCells(cs);
      write(cs, 0, gutter5(sit, true));
      write(cs, 16, hearts(lit, kind === 'poison' ? POISON : GOLD));
    });
  };
}
const PAYING = {
  key: 'paying',
  title: 'While the extra credits pay',
  intro: 'When the 5-hour window is used up and the extra credits pay, 1.0 draws a skull ☠ with the respawn countdown and ten dark hearts: it looks like you are dead and waiting, though you are working fine on credits. ' +
    'Only the green-framed emerald says that the credits pay. These options give the hearts row the credits\' story while they pay. ' +
    'When it is the week that is used up, the hearts keep showing the 5-hour window; only the frame and the emerald say "paying", in every option.',
  focus: ['hearts', 'xp', 'hot', 'edge'],
  allowed: [['hearts', 0, 36]],
  situations: [
    { id: 'p-h5', label: '5-hour used up, $45.80 of $50 left', note: 'The credits pay for the 5-hour window; it resets in 1h05m.',
      state: state({ h5: { used: 100, left: 3900, window: 18000 }, extra: { used: 4.2, limit: 50 } }) },
    { id: 'p-low', label: '5-hour used up, $4 left', note: '8% of the credits left.',
      state: state({ h5: { used: 100, left: 3900, window: 18000 }, extra: { used: 46, limit: 50 } }) },
    { id: 'p-week', label: 'The week used up, the 5-hour at 60%', note: 'The credits pay for the week. The hearts still show the 5-hour (60% left) in every option; only the frame and the emerald say "paying".',
      state: state({ h5: { used: 40, left: 9000, window: 18000 }, week: { used: 100, left: 187200 }, extra: { used: 4.2, limit: 50 } }) },
    { id: 'p-out', label: 'Credits out, 5-hour used up', note: 'Nothing pays any more: the skull and the countdown in every option. (1.0 still lights the frame green around the empty well.)',
      state: state({ h5: { used: 100, left: 3900, window: 18000 }, extra: { used: 50, limit: 50 } }) },
  ].map((s) => ({ ...s, ctx: {} })),
  options: [
    { id: 'pay-poison', name: 'Poisoned hearts: the credits drain', recommended: true,
      optionNote: 'The idea from the design chat. While the credits pay for the 5-hour window, the hearts show the share of credits left in poison green (#8DB33A), the colour Minecraft gives hearts that are being drained: max(1, round(10 × left ÷ limit)) of them, the rest dark, so $45.80 of $50 is 9 and $4 is 1 (never 0 while anything is left). ' +
        'The skull goes while paying (the engine\'s own unshipped idea, day()\'s absorb rule): the gutter shows the day symbol and the time to the reset instead. When the credits run out, the skull is back.',
      layer: payLayer('poison') },
    { id: 'pay-absorb', name: 'Absorption hearts (the engine\'s concept)',
      optionNote: 'The engine\'s own gold-hearts concept from the Survival design (hud4.js f1Line1): round(10 × left ÷ limit) hearts in gold #FFAA00, no skull while paying. ' +
        'Gold clashes with the Ultra feature, where gold hearts mean "no 5-hour limit", and the count can reach 0 with money still left ($0.40 of $50 is 0 hearts).',
      layer: payLayer('absorb') },
    { id: 'pay-today', name: 'Today (1.0)', today: true,
      optionNote: 'What 1.0 draws while paying: the skull ☠, the respawn countdown and ten dark hearts.',
      layer() {} },
  ],
};

// ---------- feature 5: emerald ----------
const EMBLOCK_BG = '#0D7A36';
function emLayer(kind) {
  return (ed, sit, ctx) => {
    if (sit.extra_left === null) return;
    const cash = Math.trunc(sit.extra_left);
    const ink = ctx.stale ? GREY : WHITE;
    let well = null;
    if (kind === 'digits') {
      if (cash >= 100000) well = [S('◆', EMERALD, WELL), S('99k', YELLOW, WELL, true)];
      else if (cash >= 1000) well = [S('◆', EMERALD, WELL), S(rjust(Math.floor(cash / 1000) + 'k', 3), ink, WELL, true)];
      else if (cash >= 100) well = [S('◆', EMERALD, WELL), S(String(cash), ink, WELL, true)];
      else if (ctx.stale && cash > 1) well = [S('◆ ', EMERALD, WELL), S(rjust(String(cash), 2), GREY, WELL, true)];
    } else if (kind === '99plus') {
      if (cash >= 100) well = [S('◆', EMERALD, WELL), S('99+', YELLOW, WELL, true)];
    } else if (kind === 'block') {
      const blocks = Math.floor(cash / 100);
      if (blocks >= 1) well = [S('■', EMERALD, EMBLOCK_BG), blocks <= 1 ? S('   ', null, WELL) : S(rjust(blocks < 1000 ? String(blocks) : '999', 3), blocks < 1000 ? WHITE : YELLOW, WELL, true)];
    }
    if (well) ed('hot', (cs) => { offhandGuard(cs); write(cs, 10, well); });
  };
}
const em = (left, extra = {}) => state({ extra: { used: 0, limit: left, ...extra } });
const EMERALD_OPT = {
  key: 'emerald',
  title: 'Extra credits from $100 up',
  intro: 'The offhand emerald counts your extra credits in dollars, but its well has two cells for the number, like a Minecraft stack count. ' +
    'From $100 up 1.0 shows a yellow 99, so $500 of credits looks like $99. These options make bigger amounts readable in the same four cells.',
  focus: ['xp', 'hot', 'edge'],
  allowed: [['hot', 10, 14]],
  situations: [
    { id: 'e-50', label: '$50', note: '', state: em(50) },
    { id: 'e-99', label: '$99', note: '', state: em(99) },
    { id: 'e-100', label: '$100', note: '', state: em(100) },
    { id: 'e-250', label: '$250', note: '', state: em(250) },
    { id: 'e-1234', label: '$1,234', note: '', state: em(1234) },
    { id: 'e-12345', label: '$12,345', note: '', state: em(12345) },
    { id: 'e-040', label: '$0.40', note: 'Less than a dollar: 1.0 leaves the well empty (a bare ◆ would read as one emerald).', state: em(50, { used: 49.6 }) },
    { id: 'e-stale', label: 'usage.json 2 hours old ($250)', note: 'The credits were last read 2 hours ago, so the amount may be out of date.', state: em(250), ctx: { stale: true } },
  ].map((s) => ({ ...s, ctx: s.ctx || { stale: false } })),
  options: [
    { id: 'em-digits', name: 'Three digits, then k', recommended: true,
      optionNote: 'From $100 the ◆ gives up its spare cell so the count has three: ◆100 to ◆999, then thousands as ◆ 1k to ◆99k, and a yellow ◆99k from $100,000 (the engine\'s yellow-cap rule). ' +
        'Below $100 nothing changes. When usage.json is old, the count turns grey (#AAAAAA) instead of white.',
      layer: emLayer('digits') },
    { id: 'em-99plus', name: '99+',
      optionNote: 'From $100 the well shows ◆99+ in yellow: clearly "a lot", never mistaken for $99, but $100 and $5,000 look the same.',
      layer: emLayer('99plus') },
    { id: 'em-block', name: 'Emerald blocks',
      optionNote: 'Nine emeralds craft an emerald block in Minecraft. Here an emerald block ■ (#17DD62 on #0D7A36) stands for each $100 and the count is the number of blocks: $250 is ■ 2, $1,234 is ■12, $12,345 is ■123 (one block shows no count, as Minecraft hides a count of 1). ' +
        'Below $100 it stays the emerald and its dollars. Reading it takes knowing that a block is $100.',
      layer: emLayer('block') },
    { id: 'em-today', name: 'Today (1.0)', today: true,
      optionNote: 'What 1.0 draws: two digits, and a yellow 99 from $100 up, so $500 looks like 99.',
      layer() {} },
  ],
};

// ---------- feature 6: pickup ----------
const SPARK = GOLD;
function flashLayer(kind) {
  return (ed, sit, ctx) => {
    if (ctx.age >= 30) return;
    if (ctx.rose === 'h5') ed('hearts', (cs) => {
      heartsCells(cs);
      if (kind === 'blink') {
        for (let c = 16; c < 36; c += 2) if (cs[c].fg === HEART) for (const d of [c, c + 1]) cs[d] = { ...cs[d], fg: lighten(HEART) };
        const [a, b] = pct5(cs);
        for (let c = a; c < b; c++) cs[c] = { ...cs[c], fg: lighten(cs[c].fg) };
      } else { if (!isSpace(cs[35])) throw new Error('pickup: col 35 is not free'); write(cs, 35, [S('✦', SPARK)]); }
    });
    if (ctx.rose === 'week') ed('hearts', (cs) => {
      if (kind === 'blink') {
        for (let c = 42; c < 62; c++) if (cs[c] && cs[c].t === '🍗') cs[c] = { ...cs[c], fg: lighten(FOOD) };
        const [a, b] = pctWk(cs);
        for (let c = a; c < b; c++) cs[c] = { ...cs[c], fg: lighten(cs[c].fg) };
      } else { if (!isSpace(cs[41])) throw new Error('pickup: col 41 is not free'); write(cs, 41, [S('✦', SPARK)]); }
    });
    if (ctx.rose === 'extra') ed('hot', (cs) => {
      offhandGuard(cs);
      if (kind === 'blink') {
        if (cs[10].t !== '◆') throw new Error('pickup: no emerald');
        for (const d of [10, 11]) cs[d] = { ...cs[d], fg: lighten(EMERALD) };   // the icon box: ◆ and its space
        write(cs, 9, [S('▐', WHITE, DIVBG)]); write(cs, 14, [S('▌', WHITE, DIVBG)]);
      } else { if (!isSpace(cs[15])) throw new Error('pickup: col 15 is not free'); write(cs, 15, [S('✦', SPARK)]); }
    });
  };
}
const PICKUP = {
  key: 'pickup',
  title: 'Good news blinks',
  intro: 'When something goes up (the 5-hour window refills at its reset, you add extra credits, the week resets), 1.0 just redraws it, and a glance cannot tell it just changed. ' +
    'These options mark the item that rose for 30 seconds, then it looks as it always does. ' +
    'In the colour icon style 🍗 is a colour emoji that ignores Hungerbar\'s colours, so a colour change on the drumsticks only shows in the plain style; the weekly % changes in both.',
  focus: ['hearts', 'xp', 'hot', 'edge'],
  allowed: [['hearts', 0, 36], ['hearts', 41, 70], ['hot', 9, 16], ['xp', 9, 15], ['edge', 9, 15]],
  situations: [
    { id: 'k-h5', label: 'The 5-hour window refills at its reset', note: 'Hearts 0 → 10: a new 5-hour window, 5h00m to go.',
      state: state({ h5: { used: 0, left: 18000, window: 18000 } }), ctx: { rose: 'h5', age: 0 } },
    { id: 'k-credits', label: 'Extra credits rise from $5 to $55', note: 'You added $50: the emerald count goes 5 → 55.',
      state: state({ extra: { used: 45, limit: 100 } }), ctx: { rose: 'extra', age: 0 } },
    { id: 'k-week', label: 'The weekly resets', note: 'Drumsticks 0 → 10: a fresh week, 100% left.',
      state: state({ week: { used: 0, left: 604800 } }), ctx: { rose: 'week', age: 0 } },
    { id: 'k-after', label: '30 s after the 5-hour refilled', note: 'The marker is over: the row looks as it always does.',
      state: state({ h5: { used: 0, left: 17970, window: 18000 } }), ctx: { rose: 'h5', age: 30 } },
  ],
  options: [
    { id: 'flash-blink', name: 'Heal blink', recommended: true,
      optionNote: 'Minecraft blinks your hearts white when you heal. For 30 seconds the item that rose is drawn 50% closer to white: hearts and the 5-hour % #FFAAAA, drumsticks and the weekly % #F0D2AC, the emerald #8BEEB1 with white sides (the frame\'s edges under and over the offhand turn white with them). ' +
        'Then the colours go back.',
      layer: flashLayer('blink') },
    { id: 'flash-sparkle', name: 'Sparkle',
      optionNote: 'A gold ✦ (#FFAA00) appears for 30 seconds in the free cell next to the item that rose: after the tenth heart, before the first drumstick, or between the offhand and the hotbar. ' +
        'It shows in both icon styles. ✦ (Segoe UI Symbol) runs about 0.3 cell into the next cell, which touches the first 🍗 in a full week.',
      layer: flashLayer('sparkle') },
    { id: 'flash-off', name: 'No marker (today)', today: true,
      optionNote: 'What 1.0 draws: the new value, with nothing to say it just changed.',
      layer() {} },
  ],
};

// ---------- feature 7: agents (added to the round on 2026-11-01) ----------
// The phantoms of a long session: src/hud/phantoms.ts (0.7.0), ported span for span, so the shared-sky situation is the
// shipped HUD with its phantoms before any agents option draws.
const PH_DIM = '#3B4673', PH_WING = '#5468B0', PH_EYES = '#7DFF5A';
const PH_FAR = ['\u{1FB08}', '\u{1FB05}'], PH_HIGH = ['\u{1FB08}', '\u{1FB0B}', '\u{1FB05}'], PH_LOW = ['\u{1FB22}', '\u{1FB2D}', '\u{1FB16}'];
const PH_SPOTS = { 2: [[30, PH_HIGH], [35, PH_LOW]], 3: [[26, PH_HIGH], [31, PH_LOW], [36, PH_HIGH]], 4: [[24, PH_HIGH], [28, PH_LOW], [32, PH_HIGH], [36, PH_LOW]] };
function flock(n) {
  if (n <= 0) return [];
  if (n === 1) return [[33, PH_FAR.map((t) => S(t, PH_DIM))]];
  return PH_SPOTS[Math.min(n, 4)].map(([col, shape]) => [col, shape.map((t, i) => S(t, i === 1 ? PH_EYES : PH_WING))]);
}
function skyFree(line, from, to) { const [, rest] = splitAt(line, from); const [mid] = splitAt(rest, to - from); return mid.every((s) => /^ +$/.test(s.t) && !s.fg && !s.bg && !s.bold); }
// draws [col, spans] sprites on line `at` where their cells and the cell before them are empty sky (phantomHud's rule)
function inSky(lines, at, sprites) {
  let line = lines[at], drawn = false;
  for (const [col, sp] of sprites) {
    const w = W(sp);
    if (!skyFree(line, col - 1, col + w)) continue;
    const width = W(line);
    const [head, rest] = splitAt(width < col ? [...line, S(' '.repeat(col - width))] : line, col);
    line = [...head, ...sp, ...splitAt(rest, w)[1]];
    drawn = true;
  }
  if (drawn) lines[at] = merge(line);
  return drawn;
}
const phantomHud = (lines, n) => { const out = lines.map((l) => [...l]); if (out.length >= 4) inSky(out, out.length - 4, flock(n)); return out; };

// The allay: Minecraft's friendly blue spirit that fetches items for you, 3 sextant cells facing left (towards the HUD,
// bringing results back): its head a light 2x2 block at the top (UL+UR+ML+MR), its body below and behind it (the lower
// two rows), its wing raised behind (UL+UR+ML), or level (ML+MR) on every other allay so the swarm flutters:
//   XX..XX      XX....
//   XXXXX.  /   XXXXXX
//   ..XX..      ..XX..
// All WT built-in shapes, the same in both icon styles.
const sext = (bits) => String.fromCodePoint(0x1FB00 + bits - 1 - (bits > 21 ? 1 : 0) - (bits > 42 ? 1 : 0));
const ALLAY_HEAD = '#D9F4FF', ALLAY = '#7FD3FF';
const allay = (i) => [S(sext(1 + 2 + 4 + 8), ALLAY_HEAD), S(sext(4 + 8 + 16 + 32), ALLAY), S(i % 2 ? sext(4 + 8) : sext(1 + 2 + 4), ALLAY)];
const ALLAY_COL0 = 82, ALLAY_PITCH = 4, ALLAY_CAP = 4;
function allays(lines, live) {
  if (live <= 0) return;
  const at = lines.length - 4;
  const sprites = [];
  for (let i = 0; i < Math.min(live, ALLAY_CAP); i++) sprites.push([ALLAY_COL0 + ALLAY_PITCH * i, allay(i)]);
  if (live > ALLAY_CAP) sprites.push([ALLAY_COL0 + ALLAY_PITCH * ALLAY_CAP, [S('+' + (live - ALLAY_CAP), ALLAY, null, true)]]);
  const before = W(lines[at]);
  if (before > ALLAY_COL0 - 2) throw new Error(`allays: line 1 is ${before} cells, into the allays' sky`);
  if (!inSky(lines, at, sprites)) throw new Error('allays: no sky');
}
// The command block (Ultracode's mode) and the spawner, as hotbar items in the empty slot 5 (cols 37-40, sides 36 and 41).
const CMD = { bg: '#C77E35', ink: '#E8A14E' }, CMD_LIT = { bg: '#E8A14E', ink: '#FFF2D9' }, STONE = { bg: '#6B6B6B', ink: '#C6C6C6' };
const CAGE = '#3B4A5A', CAGE_IDLE = '#7A8A9C', FLAME = '#E8641E';   // #3B4A5A vanishes on the dark well: the idle cage is a lighter slate
function slot5(ed, icon, count) {
  ed('hot', (cs) => { slot5Guard(cs); write(cs, 37, [icon, S(' ', null, WELL), ...count2(count)]); });
}
function agentsLayer(kind) {
  return (ed, sit, ctx, lines) => {
    const { mode, live } = ctx;
    if (kind === 'allays' || kind === 'both') allays(lines, live);
    if (kind === 'block') {
      if (live > 0) slot5(ed, mode ? S('▣', CMD_LIT.ink, CMD_LIT.bg) : S('▣', STONE.ink, STONE.bg), live);
      else if (mode) slot5(ed, S('▣', CMD.ink, CMD.bg), 0);
    }
    if (kind === 'both' && mode) slot5(ed, live > 0 ? S('▣', CMD_LIT.ink, CMD_LIT.bg) : S('▣', CMD.ink, CMD.bg), 0);
    if (kind === 'spawner' && (mode || live > 0)) slot5(ed, live > 0 ? S('▦', CAGE, FLAME) : S('▦', CAGE_IDLE, WELL), live);
  };
}
const AGENTS = {
  key: 'agents',
  title: 'Your agents at work (Ultracode)',
  intro: 'Claude Code can run helper agents: plain subagents, and with Ultracode on, whole workflows of them. Its status line payload says nothing about either. ' +
    'Hungerbar can still know both, offline: the session transcript\'s own notes say when Ultracode turns on or off (the transcript worker already reads it), and each live agent keeps writing its agent-*.jsonl file in the session\'s subagents folder (workflow agents in subagents\\workflows\\wf_*\\), so recently written files count the agents working right now. ' +
    'These options show the mode, the live agents, or both.',
  focus: ['top', 'hot', 'edge'],
  allowed: [['top', ALLAY_COL0 - 2, MAXW], ['hot', 36, 42]],
  situations: [
    { id: 'a-idle', label: 'Ultracode on, no agents running', note: 'The mode is on, nothing is working yet.', state: state({}), ctx: { mode: true, live: 0, phantoms: 0 } },
    { id: 'a-3', label: 'A workflow running: 3 live agents', note: 'Three agent files written in the last few seconds.', state: state({}), ctx: { mode: true, live: 3, phantoms: 0 } },
    { id: 'a-6', label: '6 live agents', note: 'More than four: four are drawn and the rest are a count, +2.', state: state({}), ctx: { mode: true, live: 6, phantoms: 0 } },
    { id: 'a-plain', label: 'Ultracode off, 2 plain subagents running', note: 'The agents are shown whatever the mode; Ultracode only adds its own mark.', state: state({}), ctx: { mode: false, live: 2, phantoms: 0 } },
    { id: 'a-sky', label: 'A long session (2 phantoms) and 3 live agents', note: '128 messages and 2 compactions: two big phantoms in the sky (shipped since 0.7.0), and three agents working at the same time.',
      state: state({ turns: 128, compactions: 2, ctxPct: 31, ctxTok: 310000 }), ctx: { mode: true, live: 3, phantoms: 2 } },
    { id: 'a-none', label: 'Ultracode off, no agents', note: 'Nothing to show, so no option draws anything.', state: state({}), ctx: { mode: false, live: 0, phantoms: 0 } },
  ].map((s) => ({ ...s, base: (lines) => phantomHud(lines, s.ctx.phantoms) })),
  options: [
    { id: 'agents-allays', name: 'Allays in the sky', recommended: true,
      optionNote: 'An allay is Minecraft\'s friendly blue spirit that fetches items for you. One flies in the sky line for each live agent, facing the HUD as if bringing results back: a light head (#D9F4FF), a body and a raised wing in #7FD3FF, three cells each, drawn with the same block sextants as the phantoms (every other allay holds its wing level, so the swarm flutters).' +
        'Up to four are drawn, then a count (+2 for six). With no live agent the sky stays clear: the mode alone shows nothing. ' +
        'Shared sky: phantoms (hostile, the session is too long) keep the sky between the item name and the air bubbles (cols 23-41); allays (friendly, your workers) fly on the other side, after the cache readout, from col 82, so the two never meet. The sky line gets up to 100 cells wide while agents work (79 at most today).',
      layer: agentsLayer('allays') },
    { id: 'agents-block', name: 'Command block in slot 5',
      optionNote: 'The command block is how Minecraft runs things automatically. While Ultracode is on, an orange command block ▣ (#C77E35, ink #E8A14E) sits in the empty hotbar slot 5; while agents are live it lights up (#E8A14E, ink #FFF2D9) and shows how many as its count. ' +
        'Plain subagents with Ultracode off light a grey stone block with the count instead, so orange always means Ultracode. One agent shows no count, as Minecraft hides a count of 1. Slot 5 is the slot totem-slot5 would use.',
      layer: agentsLayer('block') },
    { id: 'agents-both', name: 'Command block and allays',
      optionNote: 'The command block in slot 5 says Ultracode is on (dim while idle, lit while agents work, no count), and the allays in the sky show the live agents and how many. ' +
        'Plain subagents with Ultracode off bring the allays without the block. Two marks for one thing while a workflow runs, but each answers its own question.',
      layer: agentsLayer('both') },
    { id: 'agents-spawner', name: 'Spawner cage',
      optionNote: 'A monster spawner in slot 5: an empty slate cage ▦ (#7A8A9C) while Ultracode is on and idle; while agents work the cage turns dark (#3B4A5A) with flame orange (#E8641E) glowing through its bars, and shows the live count. ' +
        'The weaker picture: a spawner makes monsters, and your agents are helpers, not enemies.',
      layer: agentsLayer('spawner') },
    { id: 'agents-off', name: 'Nothing (today)', today: true,
      optionNote: 'What 1.0 draws: no sign of Ultracode or of agents working.',
      layer() {} },
  ],
};

const FEATURES = [ULTRA, STALE, TOTEM_OPT, PAYING, EMERALD_OPT, PICKUP, AGENTS];

// ---------- build (shared with build-9b.cjs, which requires this file) ----------
function framedRoles(n) { return [...rolesOf(n), 'edge']; }
// The row of one option in one situation: the engine, the situation's shipped layer (the phantoms), the option's layer,
// the frame, then the option's post-frame layer if it has one (one that draws over the frame's pinned bottom edge, as an
// overlay would). plainFramed is the same without the option: what every check compares against.
function render(feature, sitDef, opt) {
  const st = clone(sitDef.state);
  const eng = engine(st);
  for (const l of eng) if (JSON.stringify(join(cells(l))) !== JSON.stringify(l)) throw new Error('cells() is not lossless');
  const sit = H.fromState(st);
  if (sit.s5_left !== null) {
    const g = cells(gutter5(sit, false)), e = cells(eng[eng.length - 3]).slice(0, G2);
    if (JSON.stringify(g) !== JSON.stringify(e)) throw new Error(`${sitDef.id}: gutter5 is not the engine's gutter`);
  }
  const base = sitDef.base ? sitDef.base(clone(eng)) : clone(eng);   // a shipped layer the situation has (the phantoms)
  const lines = clone(base);
  opt.layer(editor(lines), sit, sitDef.ctx || {}, lines);
  const framed = frameHud(lines);
  if (opt.post) opt.post(framed, sit, sitDef.ctx || {});
  return { framed, plainFramed: frameHud(clone(base)), roles: framedRoles(eng.length) };
}
// The rules for every row. An option may differ from the HUD without it (engine + shipped layers + frame) only inside
// its feature's own cells.
function check(feature, sitDef, opt, r) {
  const where = `${feature.key}/${opt.id}/${sitDef.id}`;
  checkGlyphs(r.framed, where);
  r.framed.forEach((l, i) => {
    const t = textOf(l);
    if (!t) throw new Error(`${where}: line ${i + 1} is empty`);
    if (CW(t) > MAXW) throw new Error(`${where}: line ${i + 1} is ${CW(t)} cells`);
    if (t[0] === ' ') throw new Error(`${where}: line ${i + 1} starts with a space`);
  });
  if (opt.today && JSON.stringify(r.framed) !== JSON.stringify(r.plainFramed)) throw new Error(`${where}: today is not engine + frame`);
  const today = r.plainFramed;
  if (today.length !== r.framed.length) throw new Error(`${where}: ${r.framed.length} lines, today ${today.length}`);
  r.framed.forEach((l, i) => {
    const role = r.roles[i], a = cells(l), b = cells(today[i]);
    const n = Math.max(a.length, b.length);
    for (let c = 0; c < n; c++) {
      if (JSON.stringify(a[c]) === JSON.stringify(b[c])) continue;
      const pad = (x, y) => x === undefined && y && y.t === ' ' && Object.keys(y).length === 1;   // a sprite's padding past the line's end
      if (pad(a[c], b[c]) || pad(b[c], a[c])) continue;
      if (!feature.allowed.some(([ro, lo, hi]) => ro === role && c >= lo && c < hi)) throw new Error(`${where}: ${role} col ${c} changed outside the feature's cells`);
    }
  });
}

const engineSha = sha(Buffer.from(ENGINE_SRC, 'utf8'));
// Builds a feature's file, <f.file or f.key>.json, from its situations and options; `builder` names the script whose
// sha256 the file records, `round` the design round.
function buildFeature(f, { builder = 'build.cjs', round = '9' } = {}) {
  const builderSha = sha(fs.readFileSync(path.join(DIR, builder)));
  const file = (f.file || f.key) + '.json';
  const options = f.options.map((o) => ({
    id: o.id, name: o.name, recommended: !!o.recommended, today: !!o.today, ...(o.baseline ? { baseline: true } : {}), optionNote: o.optionNote,
    situations: f.situations.map((s) => s.id),
    rows: f.situations.map((s) => {
      const r = render(f, s, o);
      check(f, s, o, r);
      return { label: s.label, situation: s.id, roles: r.roles, lines: r.framed };
    }),
  }));
  const doc = {
    feature: f.key,
    ...(f.file ? { file } : {}),
    note: `Design round ${round}, feature ${f.key} (${f.title}): every option's rows, each the HUD as Hungerbar 1.0 draws it for the situation (the vendored engine and the 1.0 frame) with the option's layer on top. ` +
      'Not vendored yet: the picked option is to be extracted like round 8 (test/reference/round8).',
    source: { file: `round9/${file}`, option: null, builder: `round9/${builder}`, builderSha256: builderSha,
      base: 'test/reference/hud4.js', baseSha256: engineSha, engine: { concept: 'mix', opts: ENGINE_OPTS },
      frame: 'src/hud/frame.ts (1.0.0), ported in build.cjs', fileSha256: `see ${round === '9' ? 'MANIFEST.json' : 'MANIFEST-' + round + '.json'}` },
    title: f.title, intro: f.intro, focus: f.focus, allowed: f.allowed,
    situations: f.situations.map((s) => ({ id: s.id, label: s.label, note: s.note, state: s.state, ctx: s.ctx || {} })),
    options,
  };
  fs.writeFileSync(path.join(DIR, file), JSON.stringify(doc, null, 1) + '\n', 'utf8');
  if (SHOW) {
    console.log(`\n=== ${f.key}`);
    for (const o of options) for (const r of o.rows) {
      const idx = r.roles.map((ro, i) => [ro, i]).filter(([ro]) => f.focus.includes(ro));
      for (const [ro, i] of idx) console.log(`${o.id.padEnd(15)} ${r.situation.padEnd(12)} ${ro.padEnd(6)} ${textOf(r.lines[i])}`);
    }
  }
  console.log(`${file}: ${options.length} options x ${f.situations.length} situations = ${options.length * f.situations.length} rows`);
  return doc;
}

// ---------- the probe strip's glyphs ----------
const SEXT_ALLAY = [sext(1 + 2 + 4), sext(1 + 2 + 4 + 8), sext(4 + 8 + 16 + 32)];   // the allay's cells the phantoms do not already use
const SEXT_NOTE = 'A block sextant: Windows Terminal draws it itself (no font), exactly one cell, in both styles, like the phantoms\' sextants.';
const PROBE_INFO = {
  '☥': ['totem (offhand, slot 5)', 'Not in the round-4 probe. Fonts on the build PC: missing from Cascadia Mono and Segoe UI Emoji, in Segoe UI Symbol (advance 0.51 em, 0.87 cell).'],
  '∞': ["Ultra's % slot", 'Round-4 probe: Cascadia Mono in both styles, 1 cell, ink 0.06-0.94.'],
  '✦': ['glint, pop, sparkle', 'Round-4 probe: Segoe UI Symbol in both styles, 1 cell, ink 0.10-1.29: runs 0.29 cell into the next cell.'],
  '♡': ['not used: the outline heart, for comparison', 'Round-4 probe: Segoe UI Emoji in colour (ignores our colour, ink to 2.13 cells); Segoe UI Symbol in plain (ink to 1.09).'],
  '■': ['emerald block', 'Round-4 probe: Cascadia Mono in both styles, 1 cell, ink 0.06-0.94.'],
  '◆': ['emerald', 'Round-4 probe: Cascadia Mono in both styles, 1 cell, ink 0.00-1.00.'],
  '♥': ['every heart', 'Round-4 probe: Cascadia Mono in both styles, 1 cell, ink 0.06-0.94.'],
  '🍗': ['every drumstick', 'Round-4 probe: Segoe UI Emoji in colour (2 cells, ink 0.21-2.13); Segoe UI Symbol in plain (ink 0.01-1.69).'],
  '▣': ['command block', 'Round-4 probe: Cascadia Mono in both styles, 1 cell, ink 0.06-0.94.'],
  '▦': ['spawner cage', 'Not in the round-4 probe. Fonts on the build PC: in Cascadia Mono (advance 0.586 em, exactly 1 cell), so no fallback.'],
  [SEXT_ALLAY[0]]: ["allay's wing (up)", SEXT_NOTE],
  [SEXT_ALLAY[1]]: ["allay's head", SEXT_NOTE],
  [SEXT_ALLAY[2]]: ["allay's body", SEXT_NOTE],
};
function probeOf(list, info = {}) {
  const all = { ...PROBE_INFO, ...info };
  return list.map((g) => ({
    g, cp: 'U+' + g.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'), wt: CW(g), used: g !== '♡',
    font: builtin(g.codePointAt(0)) ? { colour: 'B', plain: 'B' } : { colour: FONTS.colour[g] || 'C', plain: FONTS.plain[g] || 'C' },
    use: all[g][0], prior: all[g][1],
  }));
}

// ---------- the picker: picker-template.html with the docs embedded ----------
const escHTML = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function writePicker(docs, { probe, html, round, storageKey, title, h1, lede, summaryTitle, manifest, files }) {
  const widths = {};
  for (const d of docs) for (const o of d.options) for (const r of o.rows) for (const l of r.lines) for (const s of l) for (const ch of s.t) {
    if (ch.codePointAt(0) >= 128) widths[ch] = CW(ch);
  }
  for (const p of probe) widths[p.g] = p.wt;
  const DATA = { built: new Date().toISOString(), round, storageKey, summaryTitle, engineSha256: engineSha, fonts: FONTS, widths, probe, features: docs };
  const tpl = fs.readFileSync(path.join(DIR, 'picker-template.html'), 'utf8');
  for (const slot of ['/*DATA*/null', '{{TITLE}}', '{{H1}}', '{{LEDE}}']) if (!tpl.includes(slot)) throw new Error(`picker-template.html has no ${slot} slot`);
  const json = JSON.stringify(DATA).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const out = tpl.replace('{{TITLE}}', () => escHTML(title)).replace('{{H1}}', () => escHTML(h1)).replace('{{LEDE}}', () => lede).replace('/*DATA*/null', () => json);
  fs.writeFileSync(path.join(DIR, html), out, 'utf8');
  const m = { built: DATA.built, files: {} };
  for (const f of [...files, 'picker-template.html', html]) m.files[f] = sha(fs.readFileSync(path.join(DIR, f)));
  m.files['test/reference/hud4.js'] = engineSha;
  fs.writeFileSync(path.join(DIR, manifest), JSON.stringify(m, null, 1) + '\n', 'utf8');
  console.log(`${html}: ${(out.length / 1024).toFixed(0)} KB, ${Object.keys(widths).length} non-ASCII glyphs`);
}

module.exports = { H, S, merge, cells, join, write, W, CW, textOf, sext, clone, state, engine, editor, frameHud, phantomHud, inSky, splitAt,
  isSpace, isBlankCell, offhandGuard, slot5Guard, count2, holds, dying, payingSit, allays, buildFeature, probeOf, writePicker, FONTS, CASCADIA,
  SEXT_ALLAY, TOTEM_OPT, AGENTS, MAXW, WELL, DIVBG, TOTEM, WHITE, YELLOW, GREY, GOLD, ALLAY_COL0, DIR };

if (require.main === module) {
  const docs = FEATURES.map((f) => buildFeature(f));
  writePicker(docs, {
    probe: probeOf(['☥', '∞', '✦', '♡', '■', '◆', '♥', '🍗', '▣', '▦', ...SEXT_ALLAY]),
    html: 'hungerbar-picker-9.html', round: 9, storageKey: 'hungerbar-picker-r9', summaryTitle: 'Hungerbar round 9: my picks',
    title: 'Hungerbar Round 9', h1: 'Hungerbar · round 9',
    lede: 'The looks for <b>v1.1</b>: seven features, each in the situations that matter. Every preview is the HUD as Hungerbar 1.0 draws it, with the option drawn on top, laid out the way <b>Windows Terminal</b> draws it: Cascadia Mono, one cell per character, colour emoji and Segoe UI Symbol where the terminal takes them. Pick one card in each section, then copy your picks at the bottom and paste them in the chat.',
    manifest: 'MANIFEST.json', files: [...FEATURES.map((x) => x.key + '.json'), 'build.cjs'],
  });
}
