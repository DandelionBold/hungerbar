// Windows Terminal's grid in HTML, for the pictures: the bytes a render printed, parsed into cells, drawn the way
// Windows Terminal 1.25 (AtlasEngine) draws them.
//   - Two layers per line: every cell's background first, then the text on top, so a colour emoji wider than its cells
//     runs over the next cell's background instead of being cut by it.
//   - Cell widths and grapheme clusters are Hungerbar's own copy of WT's tables (src/hud/wt.ts).
//   - Block elements, quadrants, sextants and the upper eighths (U+2580-259F, U+1FB00-1FB3B, U+1FB82-1FB86) are WT's
//     built-in shapes, drawn as rectangles of the cell, not glyphs of a font.
//   - Glyphs Cascadia Mono lacks come from the font DirectWrite's system fallback picks for Cascadia Mono, as WT asks it
//     (IDWriteFontFallback::MapCharacters, Windows 10): FALLBACK below. Everything else is Cascadia Mono.
import { clusters } from '../../src/hud/wt.ts';

/** E: Segoe UI Emoji (colour), S: Segoe UI Symbol, Y: Yu Gothic UI. Every other glyph Hungerbar prints is in Cascadia Mono. */
export const FALLBACK = {
  '🍗': 'E', '📖': 'E', '💾': 'E', '💳': 'E', '🔥': 'E', '⛏': 'E', '☠': 'E', '❄': 'E', '✗': 'E',
  '↻': 'S', '⎇': 'S', '☾': 'S', '⏵': 'S',
  'Ⅰ': 'Y', 'Ⅱ': 'Y', 'Ⅲ': 'Y', 'Ⅳ': 'Y', 'Ⅴ': 'Y',
};
// single quotes: these go inside a style="…" attribute, where a double quote would end it (and drop the colour after it)
const FONT = { E: "'Segoe UI Emoji'", S: "'Segoe UI Symbol'", Y: "'Yu Gothic UI'" };
const VS = { E: '️', S: '︎', Y: '' };
export const TERM_BG = '#0C0C0C', TERM_FG = '#CCCCCC';

// ---------- ANSI to cells ----------
const hex = (r, g, b) => '#' + [r, g, b].map((v) => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase();
/** xterm's 256 colours, for a 38;5 / 48;5 a 256-colour render would print. */
function x256(n) {
  const base = ['000000', '800000', '008000', '808000', '000080', '800080', '008080', 'c0c0c0', '808080', 'ff0000', '00ff00', 'ffff00', '0000ff', 'ff00ff', '00ffff', 'ffffff'];
  if (n < 16) return '#' + base[n].toUpperCase();
  if (n >= 232) { const v = 8 + (n - 232) * 10; return hex(v, v, v); }
  const c = n - 16, lv = [0, 95, 135, 175, 215, 255];
  return hex(lv[Math.floor(c / 36)], lv[Math.floor(c / 6) % 6], lv[c % 6]);
}
/** WT's Campbell scheme, for the 16 colours (classic at 16 colours, setup's own text). */
const CAMPBELL = ['#0C0C0C', '#C50F1F', '#13A10E', '#C19C00', '#0037DA', '#881798', '#3A96DD', '#CCCCCC', '#767676', '#E74856', '#16C60C', '#F9F1A5', '#3B78FF', '#B4009E', '#61D6D6', '#F2F2F2'];

/**
 * One line of output as cells: {g, w, fg, bg, bold, dim}, one per grapheme cluster; a cluster `w` cells wide fills that
 * many cells. Only SGR is understood (Hungerbar prints nothing else).
 */
export function parseLine(line) {
  const cells = [];
  let fg = null, bg = null, bold = false, dim = false;
  const text = (s) => clusters(s, (g, w) => { if (w > 0) cells.push({ g, w, fg, bg, bold, dim }); });
  const sgr = (params) => {
    const p = params === '' ? [0] : params.split(';').map(Number);
    for (let i = 0; i < p.length; i++) {
      const k = p[i];
      if (k === 0) { fg = null; bg = null; bold = false; dim = false; }
      else if (k === 1) bold = true;
      else if (k === 2) dim = true;
      else if (k === 22) { bold = false; dim = false; }
      else if (k === 39) fg = null;
      else if (k === 49) bg = null;
      else if (k >= 30 && k <= 37) fg = CAMPBELL[k - 30];
      else if (k >= 90 && k <= 97) fg = CAMPBELL[k - 82];
      else if (k >= 40 && k <= 47) bg = CAMPBELL[k - 40];
      else if (k >= 100 && k <= 107) bg = CAMPBELL[k - 92];
      else if ((k === 38 || k === 48) && p[i + 1] === 2) { const c = hex(p[i + 2], p[i + 3], p[i + 4]); if (k === 38) fg = c; else bg = c; i += 4; }
      else if ((k === 38 || k === 48) && p[i + 1] === 5) { const c = x256(p[i + 2]); if (k === 38) fg = c; else bg = c; i += 2; }
    }
  };
  const re = /\x1b\[([0-9;]*)m/g;
  let last = 0, m;
  while ((m = re.exec(line))) { text(line.slice(last, m.index)); sgr(m[1]); last = re.lastIndex; }
  text(line.slice(last));
  return cells;
}

export const width = (cells) => cells.reduce((n, c) => n + c.w, 0);

/** Claude Code's cut: a status line wider than its area ends in '…' at the area's last cell (SPEC §0.9). */
export function cutTo(cells, max) {
  if (width(cells) <= max) return cells;
  const out = [];
  let n = 0;
  for (const c of cells) {
    if (n + c.w > max - 1) break;
    out.push(c);
    n += c.w;
  }
  const last = out[out.length - 1];
  out.push({ g: '…', w: 1, fg: last ? last.fg : null, bg: null, bold: false, dim: false });
  return out;
}

/** A line as the terminal wraps it at `cols`: a wide glyph that would straddle the edge starts the next row. */
export function wrap(cells, cols) {
  const rows = [[]];
  let n = 0;
  for (const c of cells) {
    if (n + c.w > cols) { rows.push([]); n = 0; }
    rows[rows.length - 1].push(c);
    n += c.w;
  }
  return rows;
}

/** Plain text cells (Claude Code's own chrome: the prompt box). */
export const plain = (s, fg = null, bold = false) => parseLine(s).map((c) => ({ ...c, fg, bold }));

// ---------- cells to HTML ----------
/** WT's built-in shapes as rectangles [x, y, w, h, alpha?] in fractions of the cell; null: a font glyph. */
export function shapeOf(cp) {
  if (cp === 0x2580) return [[0, 0, 1, 0.5]];
  if (cp >= 0x2581 && cp <= 0x2588) { const k = cp - 0x2580; return [[0, 1 - k / 8, 1, k / 8]]; }
  if (cp >= 0x2589 && cp <= 0x258F) return [[0, 0, (8 - (cp - 0x2588)) / 8, 1]];
  if (cp === 0x2590) return [[0.5, 0, 0.5, 1]];
  if (cp >= 0x2591 && cp <= 0x2593) return [[0, 0, 1, 1, (cp - 0x2590) / 4]];
  if (cp === 0x2594) return [[0, 0, 1, 1 / 8]];
  if (cp === 0x2595) return [[7 / 8, 0, 1 / 8, 1]];
  if (cp >= 0x2596 && cp <= 0x259F) {
    const bits = [4, 8, 1, 13, 9, 7, 11, 2, 6, 14][cp - 0x2596], q = [[0, 0], [0.5, 0], [0, 0.5], [0.5, 0.5]];
    return q.filter((_, i) => bits & (1 << i)).map(([x, y]) => [x, y, 0.5, 0.5]);
  }
  if (cp >= 0x1FB00 && cp <= 0x1FB3B) {
    let v = cp - 0x1FB00 + 1;
    if (v >= 21) v++;
    if (v >= 42) v++;
    const r = [];
    for (let i = 0; i < 6; i++) if (v & (1 << i)) r.push([(i % 2) / 2, Math.floor(i / 2) / 3, 0.5, 1 / 3]);
    return r;
  }
  if (cp >= 0x1FB82 && cp <= 0x1FB86) return [[0, 0, 1, [2, 3, 5, 6, 7][cp - 0x1FB82] / 8]];
  return null;
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (x) => +(x * 100).toFixed(3) + '%';
/** Faint text: WT draws it at half its colour over the background. */
function ink(c) {
  const fg = c.fg || TERM_FG;
  if (!c.dim) return fg;
  const a = parseInt(fg.slice(1), 16), b = parseInt(TERM_BG.slice(1), 16);
  const mix = (s) => Math.round((((a >> s) & 255) + ((b >> s) & 255)) / 2);
  return hex(mix(16), mix(8), mix(0));
}

/** Glyphs that are never drawn: the blanks Hungerbar uses (U+2800, nbsp) and spaces draw nothing. */
const BLANKS = new Set([' ', ' ', '⠀']);

/** One line: the background layer, then the text layer. Each cell is `1ch` wide in Cascadia Mono. */
export function lineHTML(cells, { cls = 'ln' } = {}) {
  let bg = '', fg = '', run = null, runBg = undefined, runN = 0;
  const flushBg = () => { if (runN) bg += `<b style="width:${runN}ch${runBg ? ';background:' + runBg : ''}"></b>`; runN = 0; };
  for (const c of cells) {
    if (c.bg !== runBg) { flushBg(); runBg = c.bg; }
    runN += c.w;
  }
  flushBg();
  // text: runs of Cascadia Mono glyphs in one style go into one span (its advance is exactly one cell per glyph)
  const flush = () => { if (run) fg += `<span style="color:${run.color}${run.bold ? ';font-weight:700' : ''}">${esc(run.t)}</span>`; run = null; };
  for (const c of cells) {
    const cp = c.g.codePointAt(0), color = ink(c);
    if (BLANKS.has(c.g)) {
      if (run) run.t += ' '; else fg += ' '.repeat(c.w);
      continue;
    }
    const sh = c.g.length <= 2 ? shapeOf(cp) : null;
    const fb = FALLBACK[c.g.replace(/️|︎/g, '')];
    if (!sh && !fb && c.w === 1) {
      if (run && run.color === color && run.bold === !!c.bold) run.t += c.g;
      else { flush(); run = { color, bold: !!c.bold, t: c.g }; }
      continue;
    }
    flush();
    if (sh) fg += `<i class="c" style="width:${c.w}ch">${sh.map(([x, y, w, h, a]) => `<i style="left:${pct(x)};top:${pct(y)};width:${pct(w)};height:${pct(h)};background:${color}${a ? ';opacity:' + a : ''}"></i>`).join('')}</i>`;
    else if (fb) fg += `<i class="c" style="width:${c.w}ch"><span style="font-family:${FONT[fb]};color:${color}${c.bold ? ';font-weight:700' : ''}">${c.g.replace(/️|︎/g, '')}${VS[fb]}</span></i>`;
    else fg += `<i class="c" style="width:${c.w}ch"><span style="color:${color}${c.bold ? ';font-weight:700' : ''}">${esc(c.g)}</span></i>`;
  }
  flush();
  return `<div class="${cls}"><div class="bgl">${bg}</div><div class="fgl">${fg}</div></div>`;
}

/** The terminal's CSS: Cascadia Mono, WT's cell height (1.17 em), the Campbell background. */
export const TERM_CSS = `
.term{background:${TERM_BG};color:${TERM_FG};font-family:"Cascadia Mono";font-variant-ligatures:none;font-feature-settings:"calt" 0,"liga" 0;overflow:hidden;box-sizing:content-box}
.ln{position:relative;height:1.17em;line-height:1.17em;white-space:pre}
.bgl{position:absolute;left:0;top:0;display:flex;height:1.17em}
.bgl>b{display:block;height:1.17em;flex:none}
.fgl{position:relative;height:1.17em}
.c{display:inline-block;height:1.17em;vertical-align:top;position:relative;white-space:pre;overflow:visible;font-style:normal}
.c>i{position:absolute;display:block}
.c>span{line-height:1.17em}
`;
