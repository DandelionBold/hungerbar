// Design round 10 (the totem redesign, v12-totem.md section 3): builds picker.html, one local self-contained page with
// the three questions (the shape, the last day, the call at 0), every option drawn in every situation, in both icon
// styles, at true size (1x) and at 2x of cols 0-44.
//
//   node build-10.mjs [--work <dir>] [--keep] [--rows-only]   (from PowerShell: headless Edge dies under Git Bash)
//
// Amended 2026-11-03 after the picks (v12-totem.md 3.0, the owner's two amendments): the idol is drawn in two forms,
// form A alone (centred: the wings on the well's two sides around a two-cell face, one • eye in each half) and form B
// beside its mark (the picked cells, U+1FB0C · ¨ · U+1FB0D, shifted left, with the mark cell last: the last day's
// yellow ! or the pop's white ✦); no count is ever drawn on the totem (a Totem of Undying does not stack), so the
// count cells became one mark cell for every shape and the count's cap situation (r-cap) is gone. --rows-only writes
// the three feature files and stops before the pictures and the page (no headless Edge).
//
// The rows are real renders: dist/hungerbar.mjs reading a statusLine payload in the media rig's sandbox
// (scripts/media/rig.mjs: a throwaway git repo shown as D:/webapp, a transcript, the usage file in the cache's own
// format, user steve, host DESKTOP, nothing of this machine), with hud.totem off, so every row starts as 1.1.0's
// totem-off HUD. The candidates are then painted onto the hotbar's cells the way v12-totem-proto/proto.mjs does, by the
// moves of design 2.2, and each painted row is checked to differ from its render only inside the feature's cells
// (hot 9-14 and 36-41, the offhand's edges on the xp and edge lines, and hot 0-8 only where the offhand appears for a
// totem). The pictures are drawn by scripts/media/term.mjs (Windows Terminal's grid) in headless Edge
// (scripts/media/edge.mjs), as the README's pictures are. Nothing in src/ or dist/ is changed.
// Non-ASCII glyphs of the candidates are written as \u escapes so no shell or editor re-encoding can mangle them.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, hostname, tmpdir, userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = 'D:/hungerbar';
const DIR = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(join(REPO, p)).href);
const { Rig, T0 } = await imp('scripts/media/rig.mjs');
const { normalDay } = await imp('scripts/media/scenes/looks.mjs');
const { parseLine, lineHTML, TERM_CSS, FALLBACK, width } = await imp('scripts/media/term.mjs');
const { openEdge } = await imp('scripts/media/edge.mjs');
const { usagePath } = await imp('src/usage/file.ts');
const { acctDir } = await imp('src/store.ts');

const args = process.argv.slice(2);
const argOf = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const keep = args.includes('--keep'), rowsOnly = args.includes('--rows-only');
const workParent = resolve(argOf('--work') ?? tmpdir());
mkdirSync(workParent, { recursive: true });
const WORK = mkdtempSync(join(workParent, 'hungerbar-r10-'));
const sha = (b) => createHash('sha256').update(b).digest('hex');

// ---------- colours and glyphs (design 3.1; 1.1.0's src/hud/offhand.ts and mix.ts) ----------
const GOLD = '#FFC83D', WELL = '#201E07', EYE = '#3BD16F', DARK = '#3A2E16', SIDE = '#5D5D5D', WHITE = '#FFFFFF', YELLOW = '#FFFF55';
const ANKH = '\u2625', SPARK = '\u2726', DIAER = '\u00A8', BULLET = '\u2022', MOAI = '\u{1F5FF}';
const SP = '\u00A0'; // Hungerbar prints no-break spaces in its cells
const RH = '\u2590', LH = '\u258C', EDGE = '\u{1FB82}', LOWQ = '\u2582';
const sext = (...n) => { let m = 0; for (const k of n) m |= 1 << (k - 1); let v = m - 1; if (m > 21) v--; if (m > 42) v--; return String.fromCodePoint(0x1FB00 + v); };
const C = (g, fg = null, bg = WELL, bold = false, w = 1) => ({ g, w, fg, bg, bold, dim: false });

// ---------- cells by column (a wide cell is followed by nulls), as proto.mjs ----------
const cols = (cells) => cells.flatMap((c) => [c, ...Array(c.w - 1).fill(null)]);
const uncols = (cs) => cs.filter((c) => c !== null);
function paint(line, col, cells) {
  const cs = cols(line);
  let at = col;
  for (const c of cells) {
    if (cs[at] === null || (c.w > 1 && cs.slice(at + 1, at + c.w).some((x) => x && x.w > 1))) throw new Error(`paint: col ${at} is inside a wide cell`);
    cs.splice(at, c.w, { ...c }, ...Array(c.w - 1).fill(null));
    at += c.w;
  }
  if (cs[at] === null) throw new Error(`paint: col ${at} would split a wide cell`);
  return uncols(cs);
}
const cutCols = (line, a, b) => {
  const cs = cols(line).slice(a, b);
  if (cs.some((c) => c === null) || cs.some((c) => c.w !== 1)) throw new Error(`cut ${a}-${b}: not one-cell cells`);
  return cs.map((c) => ({ ...c }));
};
const same = (a, b) => (a === null && b === null) || (!!a && !!b && a.g === b.g && a.w === b.w && a.fg === b.fg && a.bg === b.bg && !!a.bold === !!b.bold && !!a.dim === !!b.dim);
const textOf = (line) => line.map((c) => c.g).join('');
function toSpans(line) {
  const out = [];
  for (const c of line) {
    const last = out[out.length - 1];
    const k = { fg: c.fg || null, bg: c.bg || null, bold: !!c.bold };
    if (last && last.fg === k.fg && last.bg === k.bg && last.bold === k.bold && !c.dim) last.t += c.g;
    else out.push({ t: c.g, ...k, ...(c.dim ? { dim: true } : {}) });
  }
  return out;
}

// ---------- the five shapes (design 3.3, amended in 3.0) ----------
// Each shape fills the well's 4 cells: its sprite, then its free cells, the last of which is the mark cell. The picked
// idol has two forms: alone (form A, centred over the 4 cells) and beside its mark (form B, the picked cells shifted left).
const SHAPES = {
  'totem-idol': { free: 1, sprite: () => [C(sext(1, 3, 4), GOLD), C(DIAER, EYE, GOLD, true), C(sext(2, 3, 4), GOLD)],
    alone: () => [C(sext(1, 3, 4), GOLD), C(BULLET, EYE, GOLD, true), C(BULLET, EYE, GOLD, true), C(sext(2, 3, 4), GOLD)] },
  'totem-mask': { free: 2, sprite: () => [C(BULLET, EYE, GOLD, true), C(BULLET, EYE, GOLD, true)] },
  'totem-plaque': { free: 1, sprite: () => [C(RH, GOLD), C(ANKH, DARK, GOLD), C(LH, GOLD)] },
  'totem-moai': { free: 2, sprite: () => [C(MOAI, GOLD, WELL, false, 2)] },
  'totem-ankh': { free: 2, sprite: () => [C(ANKH, GOLD), C(SP, GOLD)] },
};
/**
 * The free cells after a sprite (3.0, amendment 2: no count, ever): blank but the last, the mark cell: the pop's white
 * spark (3.5), which wins over the last day's bold yellow ! (3.4), or nothing.
 */
function markCells(k, mark, spark) {
  const out = Array.from({ length: k }, () => C(SP));
  if (spark) out[k - 1] = C(SPARK, WHITE);
  else if (mark) out[k - 1] = C('!', YELLOW, WELL, true);
  return out;
}
/** A shape's 4 well cells: the idol alone is form A; with a mark (or for the other shapes) the sprite and its free cells. */
const itemOf = (sh, mark, spark) => (sh.alone && !mark && !spark ? sh.alone() : [...sh.sprite(), ...markCells(sh.free, mark, spark)]);

// ---------- the sandbox and its renders ----------
const rig = new Rig(join(WORK, 'rig'));
normalDay(rig, { config: { hud: { pr: 'on', align: 'left', user: 'off', totem: 'off' } } });
const USED = { '50': 0, '4580': 420, '0': 5000 };
function setCredits(c) {
  const file = usagePath(acctDir(rig.env()));
  mkdirSync(dirname(file), { recursive: true });
  const extra = c === 'none' ? { enabled: false, usedCents: 0, limitCents: 0, currency: 'USD' } : { enabled: true, usedCents: USED[c], limitCents: 5000, currency: 'USD' };
  writeFileSync(file, JSON.stringify({ v: 1, at: T0 - 30, extra, scoped: [{ name: 'Fable', pct: 62, resets_at: T0 + 190800 }], lockUntil: 0 }));
}
const renders = new Map();
/** The HUD as 1.1.0 draws it with hud.totem off: the 5-hour window `h5` % used, the week 60% left, the credits. */
function base(h5, credits) {
  const key = `${h5}/${credits}`;
  if (!renders.has(key)) {
    setCredits(credits);
    const raw = rig.render(rig.payload({ now: T0, h5: { used: h5, reset: 17340 }, week: { used: 40, reset: 345540 } }), { now: T0 }).filter((l) => l.length);
    if (raw.length !== 5) throw new Error(`render ${key}: ${raw.length} lines, expected 5`);
    renders.set(key, { key, raw, cells: raw.map(parseLine) });
  }
  return renders.get(key);
}
const ROLES = ['top', 'hearts', 'xp', 'hot', 'edge'];
const isBlank = (g) => g === ' ' || g === SP;
const isDiv = (c) => c && isBlank(c.g) && !c.fg && c.bg === SIDE;
const isWellBlank = (c) => c && isBlank(c.g) && !c.fg && c.bg === WELL;

/**
 * One row: the render for the situation, then the moves of design 2.2 for the behaviour {shape, last, call}.
 * Returns the lines and what was drawn (where the totem is, its sides, the pop, the mark).
 */
function draw(sit, beh) {
  const b = base(sit.h5, sit.credits);
  const L = b.cells.map((l) => l.map((c) => ({ ...c })));
  const left = 100 - sit.h5, lastDay = sit.until < 24;
  const where = left === 0 ? 'call' : left <= 10 ? 'suggestion' : lastDay && beh.last === 'last-hand' ? 'suggestion' : 'waiting';
  const mark = lastDay && beh.last !== 'last-quiet';
  const popOn = where === 'call' && sit.pop !== null && sit.pop < 30 && beh.call !== 'call-gold';
  const sides = where === 'call' && !(beh.call === 'call-pop-grey' && !popOn) ? 'gold' : 'grey';
  const sh = SHAPES[beh.shape];
  const item = itemOf(sh, mark, popOn);   // never sit.n: the totem does not stack (3.0)
  if (width(item) !== 4) throw new Error(`${beh.shape}: ${width(item)} cells, a well has 4`);
  // the layer draws only on the shapes it expects: slot 5 the plain empty well between the frame grey's sides
  const s5 = cols(L[3]).slice(36, 42);
  if (!(isDiv(s5[0]) && s5.slice(1, 5).every(isWellBlank) && isDiv(s5[5]))) throw new Error(`${sit.id}: slot 5 is not the plain empty well: ${JSON.stringify(s5)}`);
  let appear = false, gutter = null;
  if (where === 'waiting') L[3] = paint(L[3], 37, item);
  else {
    if (sit.credits === 'none') {
      // no extra usage: the offhand appears for the totem; cols 0-15 become the engine's own gutter for an empty
      // offhand, which the same HUD with $0 of credits draws (f2Gutter with extra_left 0); slot 5 stays empty
      appear = true;
      gutter = base(sit.h5, '0');
      for (const i of [2, 3, 4]) {
        if (cols(L[i])[16] === null) throw new Error(`${sit.id}: col 16 of ${ROLES[i]} is inside a wide cell`);
        L[i] = paint(L[i], 0, cutCols(gutter.cells[i], 0, 16));
      }
    } else {
      // the emerald goes to slot 5 as the offhand layer drew it: its well, and its sides (green while the credits pay)
      L[3] = paint(L[3], 36, cutCols(L[3], 9, 15));
    }
    const side = sides === 'gold' ? [C(RH, GOLD, SIDE), C(LH, GOLD, SIDE)] : [C(SP, null, SIDE), C(SP, null, SIDE)];
    L[3] = paint(L[3], 9, [side[0], ...item, side[1]]);
    // the frame's offhand edges follow its sides
    const ink = sides === 'gold' ? GOLD : SIDE;
    for (const [i, g] of [[2, LOWQ], [4, EDGE]]) {
      const cs = cols(L[i]);
      for (let c = 9; c < 15; c++) {
        if (!cs[c] || cs[c].g !== g) throw new Error(`${sit.id}: ${ROLES[i]} col ${c} is not the offhand's edge`);
        cs[c] = { ...cs[c], fg: ink };
      }
      L[i] = uncols(cs);
    }
  }
  checkCells(sit, b, L, appear, gutter);
  return { lines: L, where, sides: where === 'waiting' ? null : sides, popOn, mark, appear, render: b.key };
}

/** Every row differs from its render only inside the feature's cells (design 3.7, build-10's check). */
const ALLOWED = [['hot', 0, 15], ['hot', 36, 42], ['xp', 9, 15], ['edge', 9, 15]];
const CHECKED = { rows: 0, cells: 0 };
function checkCells(sit, b, L, appear, gutter) {
  for (let i = 0; i < 5; i++) {
    const A = cols(L[i]), B = cols(b.cells[i]);
    const n = Math.max(A.length, B.length);
    for (let c = 0; c < n; c++) {
      CHECKED.cells++;
      if (same(A[c] ?? null, B[c] ?? null)) continue;
      const ok = ALLOWED.some(([r, a, z]) => r === ROLES[i] && c >= a && c < z && (r !== 'hot' || c >= 9 || appear));
      if (!ok) throw new Error(`${sit.id}: ${ROLES[i]} col ${c} changed outside the feature's cells`);
      if (ROLES[i] === 'hot' && c < 9 && !same(A[c], cols(gutter.cells[3])[c])) throw new Error(`${sit.id}: hot col ${c} is not the engine's gutter`);
    }
  }
  CHECKED.rows++;
}

// ---------- the situations (design 3.7) ----------
const S = (id, label, note, o) => ({ id, label, note, h5: 2, credits: '50', n: 1, until: 20 * 24, pop: null, ...o });
const SIT_SHAPE = [
  S('r-safe', 'Waiting: one reset held, every limit fine', '$50 of credits, 5-hour 98% left, week 60% left. The totem waits in hotbar slot 5; the emerald stays in the offhand.', {}),
  S('r-two', 'Two resets held', 'The same day holding 2: one idol, no count (a totem does not stack); the cells of r-safe.', { n: 2 }),
  S('r-swap', 'Suggestion: the 5-hour window at 7%', 'The totem moves to the offhand (grey sides); the emerald, ◆ 50, moves to slot 5.', { h5: 93 }),
  S('r-swap-none', 'Suggestion with no extra usage', 'No credits at all: the offhand appears for the totem (the version cut to 8 cells, grey sides); slot 5 stays empty.', { h5: 93, credits: 'none' }),
  S('r-call', 'The call: the 5-hour window hits 0, seen live', '$45.80 left, the first second of the pop: the ✦ and gold sides, the frame\'s offhand edges gold; slot 5 ▐◆ 45▌ with green sides while the credits pay; poison hearts.', { h5: 100, credits: '4580', pop: 0 }),
  S('r-call-later', 'The call later: 5 minutes after the fall', 'Drawn with the recommended call at 0 (call-pop-gold): the ✦ is gone, the gold stays while the window is at 0.', { h5: 100, credits: '4580', pop: 300 }),
];
const SIT_LAST = [
  S('l-safe-23h', 'Safe, the reset ends in 23 h', 'Every limit fine; its last 24 hours have begun.', { until: 23 }),
  S('l-two-23h', 'Two held, ending in 23 h', 'The same ! for 2 held: there is no count to turn yellow; the cells of l-safe-23h.', { n: 2, until: 23 }),
  S('l-swap-23h', 'Dying (5-hour 7%), ends in 23 h', 'The suggestion would move it anyway; only the mark differs.', { h5: 93, until: 23 }),
  S('l-safe-3d', 'Safe, ends in 3 days', 'Not the last day: all three options draw the same.', { until: 72 }),
  S('l-call-23h', 'The call, ends in 23 h (5 minutes after the fall)', 'The 5-hour window at 0, $45.80 left, the pop over: the call keeps the mark.', { h5: 100, credits: '4580', pop: 300, until: 23 }),
];
const SIT_CALL = [
  S('c-0', 'The moment it falls (pop age 0 s)', 'The 5-hour window hits 0, seen live; $45.80 of credits.', { h5: 100, credits: '4580', pop: 0 }),
  S('c-29', '29 s later', 'The pop\'s last second.', { h5: 100, credits: '4580', pop: 29 }),
  S('c-30', '30 s later', 'The pop is over.', { h5: 100, credits: '4580', pop: 30 }),
  S('c-300', '5 minutes later', 'Still at 0; the credits pay.', { h5: 100, credits: '4580', pop: 300 }),
  S('c-out', 'Credits out: $0 left, 5 minutes after the fall', 'The skull and dark hearts; slot 5 holds the empty well with grey sides (nothing pays).', { h5: 100, credits: '0', pop: 300 }),
  S('c-none', 'No extra usage, 5 minutes after the fall', 'The offhand appears for the totem; slot 5 stays empty.', { h5: 100, credits: 'none', pop: 300 }),
];
const REC = { shape: 'totem-idol', last: 'last-hand', call: 'call-pop-gold' };

// ---------- the options (design 3.3, 3.4, 3.5) ----------
const SHAPE_OPTS = [
  { id: 'totem-idol', name: 'The golden idol', recommended: true,
    minecraft: 'The Totem of Undying as the game draws it: a small gold figure with raised wings and green eyes.',
    cells: 'Alone (form A, centred): U+1FB0C (sextant-134) gold on the well · U+2022 • bold #3BD16F on gold, twice · U+1FB0D (sextant-234) gold on the well. Beside its mark (form B): U+1FB0C · U+00A8 ¨ bold #3BD16F on gold · U+1FB0D · the mark cell',
    styles: 'The same in both: the wings are sextants Windows Terminal draws itself; ¨ is in Cascadia Mono.',
    risks: 'The eyes are about 2 px at 16 px. ¨ is a Cascadia Mono glyph (present on this PC).',
    count: 'No count: one idol for any number held (a totem does not stack).' },
  { id: 'totem-mask', name: 'The golden face',
    minecraft: 'The totem\'s face alone: a gold square with two green eyes.',
    cells: 'U+2022 • bold #3BD16F on gold, twice · 2 free cells, the last the mark cell',
    styles: 'The same in both: • is in Cascadia Mono.',
    risks: 'Can read as a domino or a gold block. The cost\'s ingot is yellow ▄▄, half height, so the two stay apart.',
    count: 'No count: one totem for any number held (a totem does not stack).' },
  { id: 'totem-plaque', name: 'The ankh on a gold tile',
    minecraft: '1.1.0\'s ankh made a plaque: a gold tile with the ankh set into it.',
    cells: '▐ gold on the well · ☥ #3A2E16 on gold · ▌ gold on the well · the mark cell',
    styles: 'The same in both: ☥ comes from Segoe UI Symbol in both styles (probed in round 9).',
    risks: 'The ankh inside is still the small glyph that reads like ♀.',
    count: 'No count: one totem for any number held (a totem does not stack).' },
  { id: 'totem-moai', name: 'The idol emoji',
    minecraft: 'A ready-made idol glyph, 🗿, standing in for the totem.',
    cells: '🗿 U+1F5FF (2 cells) · 2 free cells, the last the mark cell',
    styles: 'Differs: a grey stone head with colour icons (Segoe UI Emoji ignores the gold), a gold one with plain icons (Segoe UI Symbol).',
    risks: 'Small inside its cells; a meme; it draws differently in the film\'s colour footage.',
    count: 'No count: one totem for any number held (a totem does not stack).' },
  { id: 'totem-ankh', name: 'The ankh, as 1.1.0', today: true,
    minecraft: 'What 1.1.0 draws for the totem today: the ankh ☥, now moved by the resets instead of the credits.',
    cells: '☥ and a space, gold on the well · 2 free cells, the last the mark cell',
    styles: 'The same in both: ☥ from Segoe UI Symbol.',
    risks: 'The reason for this round: at true size the ☥ is a speck inside one cell and reads like ♀.',
    count: 'No count: one totem for any number held (a totem does not stack).' },
];
const LAST_OPTS = [
  { id: 'last-quiet', name: 'Nothing on the HUD',
    note: 'The totem disappears when it expires. hungerbar totem, look and doctor say the date.' },
  { id: 'last-mark', name: 'A yellow mark',
    note: 'In its last 24 h a bold yellow ! stands in the well\'s last cell and the idol shifts left to make room (form B); the same ! for any number held. The totem stays where it is.' },
  { id: 'last-hand', name: 'To your hand, with the mark', recommended: true,
    note: 'As the yellow mark, and the totem moves to the offhand (the emerald to slot 5) even while every limit is fine: use it or lose it. Claude\'s own panel offers an early use ("You haven\'t reached a limit yet — use your {kind} anyway?").' },
];
const CALL_OPTS = [
  { id: 'call-pop-gold', name: 'Pop, then stay gold', recommended: true,
    note: 'For 30 s from a fall seen live, the ✦ (white) in the well\'s last cell, the idol shifted left (form B), and gold sides; then the gold sides stay while the window is at 0 and a totem is held, and the idol re-centres (form A). The gold says "use it now".',
    memory: 'Keeps the memory file: the shown-file, version 2 (one small file per session in the cache, the last lit icons of each window), so the pop can tell a live fall. It is asked only while you hold a totem with hud.totem on.' },
  { id: 'call-pop-grey', name: 'Pop, then back to grey',
    note: 'For 30 s, the ✦ and gold sides; then the suggestion\'s grey sides. Quieter after the moment.',
    memory: 'Keeps the memory file: the same shown-file, version 2, asked only while you hold a totem with hud.totem on.' },
  { id: 'call-gold', name: 'Gold, no pop',
    note: 'Gold sides from the first render at 0, no ✦. Stateless.',
    memory: 'Deletes the memory file: src/shown.ts is removed, doctor stops counting the files, and the sweep still removes old ones for a week. Nothing remembers a fall.' },
];

const FEATURES = [
  { key: 'shape', file: 'totem-shape.json', title: 'The shape', design: '3.3',
    intro: 'The totem is a limit reset Anthropic gave you (Settings → Usage → Resets), which you declare once with hungerbar totem 1 --until 2026-12-01, because Claude Code does not pass resets to status lines. It waits in hotbar slot 5. When a limit it can refill drops to 10% left or less, it moves to your offhand, which holds one thing, and the emerald (your credits, in dollars) moves to slot 5: a reminder to use the reset instead of paying. At 0 its sides turn gold. The HUD never uses a reset for you. Pick the shape the totem is drawn as.',
    situations: SIT_SHAPE, extra: [], options: SHAPE_OPTS, beh: (o) => ({ shape: o.id, last: REC.last, call: REC.call }) },
  { key: 'lastday', file: 'totem-lastday.json', title: 'The last day', design: '3.4',
    intro: 'A reset can expire, and an expired reset is gone. These options decide what the HUD does in a reset\'s last 24 hours. Drawn with the recommended shape, the golden idol; whatever shape you pick takes its place.',
    situations: SIT_LAST, extra: [], options: LAST_OPTS, beh: (o) => ({ shape: REC.shape, last: o.id, call: REC.call }) },
  { key: 'call', file: 'totem-call.json', title: 'The call at 0', design: '3.5',
    intro: 'When a limit the totem can refill hits 0, the totem is in your offhand and the call begins. These options decide what it looks like at that moment and after. The pop\'s ✦ takes the well\'s last cell for its 30 s, the idol shifted left; after it the idol re-centres, or the last-day mark comes back. Drawn with the recommended shape, the golden idol.',
    situations: SIT_CALL, extra: [], options: CALL_OPTS, beh: (o) => ({ shape: REC.shape, last: REC.last, call: o.id }) },
];

// ---------- draw every row ----------
const ROWS = [];
for (const f of FEATURES) {
  f.doc = { feature: `totem-${f.key}`, note: `Design round 10 (v12-totem.md ${f.design}), ${f.title.toLowerCase()}. Each row is the full HUD (5 lines, roles top, hearts, xp, hot, edge): dist/hungerbar.mjs rendering the situation's payload in the media rig's sandbox with hud.totem off (1.1.0's totem-off HUD), then the option painted onto the feature's cells by the moves of design 2.2 (build-10.mjs). Redrawn after the picks with round 10's two amendments (v12-totem.md 3.0): the idol centred alone (form A) and shifted left beside its mark (form B), and no count on the totem for any number held, so r-two and l-two-23h carry exactly the totem cells of r-safe and l-safe-23h.`,
    source: 'build-10.mjs', title: f.title, intro: f.intro, focus: ['xp', 'hot', 'edge'], allowed: ALLOWED,
    situations: [...f.situations, ...f.extra].map((s) => ({ id: s.id, label: s.label, note: s.note, extra: f.extra.includes(s),
      inputs: { fiveHourUsedPct: s.h5, weekLeftPct: 60, credits: { '50': '$50.00 of $50', '4580': '$45.80 of $50', '0': '$0.00 of $50', none: 'no extra usage' }[s.credits], totems: { n: s.n, kind: 'full', endsInHours: s.until } },
      ctx: { pop: s.pop, until: T0 + s.until * 3600 } })),
    options: [] };
  for (const o of f.options) {
    const opt = { id: o.id, name: o.name, recommended: !!o.recommended, today: !!o.today, optionNote: o.note ?? o.minecraft, rows: [] };
    for (const s of [...f.situations, ...f.extra]) {
      const d = draw(s, f.beh(o));
      const row = { feature: f.key, option: o.id, sit: s.id, extra: f.extra.includes(s), ...d, images: {} };
      ROWS.push(row);
      opt.rows.push({ situation: s.id, label: s.label, roles: ROLES, drawn: { where: d.where, sides: d.sides, pop: d.popOn, mark: d.mark }, lines: d.lines.map(toSpans) });
    }
    f.doc.options.push(opt);
  }
  writeFileSync(join(DIR, f.file), JSON.stringify(f.doc, null, 1) + '\n', 'utf8');
}
console.log(`rows: ${ROWS.length} drawn from ${renders.size} renders; cell check: ${CHECKED.rows} rows, ${CHECKED.cells} cells, all inside the feature's cells`);
// round 10's amendment 2, checked: the number held never changes a cell
for (const [two, one] of [['r-two', 'r-safe'], ['l-two-23h', 'l-safe-23h']]) {
  for (const r of ROWS.filter((x) => x.sit === two)) {
    const o = ROWS.find((x) => x.feature === r.feature && x.option === r.option && x.sit === one);
    if (JSON.stringify(r.lines) !== JSON.stringify(o.lines)) throw new Error(`${r.feature}/${r.option}: ${two} differs from ${one}`);
  }
}

// ---------- privacy: what the rows show ----------
const PRIVATE = [userInfo().username, hostname(), homedir(), REPO, WORK, workParent]
  .filter((s) => s && s.length >= 3).map((s) => s.toLowerCase().replace(/\\/g, '/'));
const ALLOW = ['steve', 'desktop', 'd:/webapp', 'dandelionbold'];
function privacyHits(text, where) {
  const t = text.toLowerCase().replace(/\\/g, '/');
  const hits = PRIVATE.filter((p) => t.includes(p)).map((p) => `${where}: "${p}"`);
  // any drive path or user folder on screen that is not D:/webapp
  for (const m of t.matchAll(/[a-z]:\/[^\s"'<>)]*/g)) if (!m[0].startsWith('d:/webapp')) hits.push(`${where}: path "${m[0]}"`);
  if (/c:\/users\//.test(t)) hits.push(`${where}: a user folder`);
  return hits;
}
const rowHits = ROWS.flatMap((r) => r.lines.flatMap((l, i) => privacyHits(textOf(l), `${r.feature}/${r.option}/${r.sit} ${ROLES[i]}`)));
if (rowHits.length) throw new Error(`privacy: ${rowHits.join('; ')}`);

if (rowsOnly) { console.log('--rows-only: the three feature files are written; no pictures, no page'); process.exit(0); }

// ---------- the pictures: term.mjs in headless Edge ----------
const ORIG = { ...FALLBACK };
const style = (plain) => {
  for (const k of Object.keys(ORIG)) FALLBACK[k] = plain && ORIG[k] === 'E' ? 'S' : ORIG[k];
  FALLBACK[MOAI] = plain ? 'S' : 'E';
};
const shotPage = (frames, font) => `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#0C0C0C}${TERM_CSS}
#shot{display:inline-block;font-family:"Cascadia Mono";font-size:${font}px;background:#0C0C0C;padding:10px 14px}
</style></head><body><div id="shot"></div><script>
const FRAMES=${JSON.stringify(frames).replace(/</g, '\\u003c')};
async function show(i){const s=document.getElementById('shot');s.innerHTML=FRAMES[i];await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const b=s.getBoundingClientRect();return{x:b.x,y:b.y,width:Math.ceil(b.width),height:Math.ceil(b.height)};}
</script></body></html>`;
const CROP = 45; // cols 0-44
const termOf = (lines, n) => `<div class="term" style="width:${n}ch">${lines.map((l) => lineHTML(l)).join('')}</div>`;
const fullHTML = (lines) => termOf(lines, Math.max(...lines.map(width)));
const cropHTML = (lines) => termOf(lines.map((l) => uncols(cols(l).slice(0, CROP))), CROP);

const PREV = join(DIR, 'previews');
rmSync(PREV, { recursive: true, force: true });
mkdirSync(PREV, { recursive: true });
const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });
const PROBE = [
  [sext(1, 3, 4), 'U+1FB0C', 'the idol\'s left wing (sextant-134)', 'Drawn by Windows Terminal itself as rectangles: the same in both styles and at every zoom.', C(sext(1, 3, 4), GOLD)],
  [sext(2, 3, 4), 'U+1FB0D', 'the idol\'s right wing (sextant-234)', 'Drawn by Windows Terminal itself, as the bees and the phantoms are.', C(sext(2, 3, 4), GOLD)],
  [DIAER, 'U+00A8', 'the idol\'s eyes', 'In Cascadia Mono (checked on this PC\'s copy with cmap.py), 1 cell, bold green on gold.', C(DIAER, EYE, GOLD, true)],
  [BULLET, 'U+2022', 'the face\'s eyes', 'In Cascadia Mono, 1 cell, bold green on gold.', C(BULLET, EYE, GOLD, true)],
  [ANKH, 'U+2625', 'the ankh (plaque and today)', 'Segoe UI Symbol in both styles (round 9\'s probe); takes the HUD\'s ink.', C(ANKH, GOLD)],
  [MOAI, 'U+1F5FF', 'the idol emoji', 'An emoji-presentation character: a colour emoji with colour icons (ignores the gold), Segoe UI Symbol with plain icons. 2 cells.', C(MOAI, GOLD, WELL, false, 2)],
  [SPARK, 'U+2726', 'the pop', 'Segoe UI Symbol in both styles (round 9\'s probe); white on the well.', C(SPARK, WHITE)],
];
const probeLine = (cell) => [C('0', '#767676', null), C('0', '#767676', null), C(SP), cell, C(SP), C('0', '#767676', null), C('0', '#767676', null)];
const PROBE_IMG = {};

const edge = await openEdge(join(WORK, 'edge'));
try {
  for (const plain of [false, true]) {
    style(plain);
    const st = plain ? 'plain' : 'colour';
    const full = ROWS.map((r) => fullHTML(r.lines)), crop = ROWS.map((r) => cropHTML(r.lines));
    for (const [zoom, frames, opts] of [['1x', full, { width: 1400, height: 300, scale: 1 }], ['2x', crop, { width: 800, height: 300, scale: 2 }]]) {
      const tmp = join(WORK, `shots-${st}-${zoom}`);
      const files = await edge.capture(shotPage(frames, 16), frames.length, tmp, opts);
      files.forEach((file, i) => {
        const r = ROWS[i];
        const out = join(PREV, r.feature, r.option, `${r.sit}-${st}-${zoom}.png`);
        mkdirSync(dirname(out), { recursive: true });
        copyFileSync(file, out);
        const buf = readFileSync(out);
        r.images[`${st}-${zoom}`] = { file: out, b64: buf.toString('base64'), ...pngSize(buf), sha: sha(buf) };
      });
    }
    const pf = await edge.capture(shotPage(PROBE.map((p) => termOf([probeLine(p[4])], 7)), 16), PROBE.length, join(WORK, `probe-${st}`), { width: 400, height: 200, scale: 4 });
    pf.forEach((file, i) => {
      const out = join(PREV, 'probe', `${PROBE[i][1]}-${st}.png`);
      mkdirSync(dirname(out), { recursive: true });
      copyFileSync(file, out);
      const buf = readFileSync(out);
      PROBE_IMG[`${PROBE[i][1]}-${st}`] = { b64: buf.toString('base64'), ...pngSize(buf) };
    });
    console.log(`${st}: ${ROWS.length * 2} row pictures, ${PROBE.length} probe pictures`);
  }
} finally {
  await edge.close();
}

// ---------- the page ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STYLES = [['colour', 'Colour emoji'], ['plain', 'Plain icons']];
const ZOOMS = [['1x', 'True size (1x, 16 px)'], ['2x', '2x, cols 0-44']];
const img = (im, alt, scaleDown = 1) => `<img src="data:image/png;base64,${im.b64}" width="${Math.round(im.w / scaleDown)}" height="${Math.round(im.h / scaleDown)}" alt="${esc(alt)}" decoding="async">`;
function chip(r) {
  if (r.where === 'waiting') return `<span class="chip">Slot 5${r.mark ? ' · !' : ''}</span>`;
  const bits = ['Offhand', r.sides === 'gold' ? 'gold' : 'grey'];
  if (r.popOn) bits.push('✦');
  if (r.mark) bits.push('!');
  if (r.appear) bits.push('appears');
  return `<span class="chip ${r.sides === 'gold' ? 'gold' : ''}">${bits.join(' · ')}</span>`;
}
function sitHTML(f, o, s, i) {
  const r = ROWS.find((x) => x.feature === f.key && x.option === o.id && x.sit === s.id);
  const views = STYLES.map(([st, stName]) => `<div class="style" data-style="${st}"><span class="vlab">${stName}</span><div class="zooms">${ZOOMS.map(([z, zName]) =>
    `<figure class="view" data-zoom="${z}"><figcaption>${zName}</figcaption><div class="shot">${img(r.images[`${st}-${z}`], `${o.name}, ${s.label}, ${stName}, ${z}`)}</div></figure>`).join('')}</div></div>`).join('');
  return `<div class="sit${r.extra ? ' extra' : ''}" data-cell="${f.key}|${o.id}|${s.id}"><div class="sit-l"><span class="n">${r.extra ? '+' : i + 1}</span><span>${esc(s.label)}</span>${chip(r)}</div>${views}</div>`;
}
function facts(f, o) {
  if (f.key === 'shape') return `<p class="note"><b>In Minecraft terms.</b> ${esc(o.minecraft)}</p>
    <dl class="facts"><div><dt>Cells</dt><dd>${esc(o.cells)}</dd></div><div><dt>Both styles</dt><dd>${esc(o.styles)}</dd></div><div><dt>Count</dt><dd>${esc(o.count)}</dd></div><div class="risk"><dt>Risks</dt><dd>${esc(o.risks)}</dd></div></dl>`;
  if (f.key === 'call') return `<p class="note">${esc(o.note)}</p><dl class="facts"><div class="${o.id === 'call-gold' ? 'risk' : ''}"><dt>Memory file</dt><dd>${esc(o.memory)}</dd></div></dl>`;
  return `<p class="note">${esc(o.note)}</p>`;
}
const cardHTML = (f, o) => `<article class="card" data-f="${f.key}" data-o="${o.id}" aria-labelledby="t-${o.id}">
  <div class="card-h"><div class="card-t"><h3 id="t-${o.id}">${esc(o.name)}</h3><code>${o.id}</code>${o.recommended ? '<span class="tag rec">Recommended</span>' : ''}${o.today ? '<span class="tag today">Today (1.1.0)</span>' : ''}</div>
  <button class="btn pick" type="button" data-act="pick" data-f="${f.key}" data-o="${o.id}" aria-pressed="false">Pick this</button></div>
  ${facts(f, o)}
  ${[...f.situations, ...f.extra].map((s, i) => sitHTML(f, o, s, i)).join('')}
</article>`;
const featureHTML = (f, fi) => `<section class="feature" id="f-${f.key}" aria-labelledby="h-${f.key}">
  <div class="f-head"><p class="label">Question ${fi + 1} of 3 · design ${f.design} · ${f.file} · ${f.options.length} options × ${f.situations.length} situations${f.extra.length ? ` (+ ${f.extra.length} extra)` : ''}</p>
    <h2 id="h-${f.key}">${esc(f.title)}</h2><p class="intro">${esc(f.intro)}</p></div>
  <div class="pills" role="group" aria-label="Your pick for ${esc(f.title)}">${f.options.map((o) => `<button class="opill" type="button" data-act="pick" data-f="${f.key}" data-o="${o.id}" aria-pressed="false">${esc(o.name)}${o.recommended ? ' <small>recommended</small>' : ''}${o.today ? ' <small>today</small>' : ''}</button>`).join('')}</div>
  <ol class="sits">${[...f.situations, ...f.extra].map((s) => `<li${f.extra.includes(s) ? ' class="extra"' : ''}><b>${esc(s.label)}.</b> <span>${esc(s.note)}</span></li>`).join('')}</ol>
  <div class="cards">${f.options.map((o) => cardHTML(f, o)).join('')}</div>
  <label class="fnote" for="note-${f.key}">Your note on ${esc(f.title.toLowerCase())} (optional, goes into your answers)
    <textarea id="note-${f.key}" data-note="${f.key}" rows="2"></textarea></label>
</section>`;
const probeHTML = `<section id="probe" aria-labelledby="h-probe">
  <h2 id="h-probe">The new glyphs</h2>
  <p class="sub">Each glyph the options use, drawn by Windows Terminal's rules in headless Edge on this PC at 4x, between reference cells of Cascadia Mono, in both icon styles. Block shapes and sextants are rectangles Windows Terminal draws itself; the rest come from the font Windows Terminal falls back to.</p>
  <div class="probe-grid">${PROBE.map(([g, cp, use, why]) => `<div class="pt"><div class="pt-name"><b>${esc(g)} ${cp}</b><span>${esc(use)}</span></div>
    <div class="pt-shots">${STYLES.map(([st, stName]) => `<figure class="view" data-style="${st}"><figcaption>${stName}</figcaption><div class="shot">${img(PROBE_IMG[`${cp}-${st}`], `${cp}, ${stName}`, 2)}</div></figure>`).join('')}</div>
    <p class="pt-prior">${esc(why)}</p></div>`).join('')}</div>
</section>`;
const answersHTML = `<section class="answers" id="answers" aria-labelledby="h-out">
  <h2 id="h-out">Your answers</h2>
  <p class="sub">Three picks to give. The recommendation is marked; a question you have not answered says so.</p>
  <ol class="ans">${FEATURES.map((f) => {
    const rec = f.options.find((o) => o.recommended);
    return `<li><span class="ans-q">${esc(f.title)}</span><span class="ans-a" id="ans-${f.key}">not picked</span><span class="ans-r">Recommended: <b>${esc(rec.name)}</b> <code>${rec.id}</code></span></li>`;
  }).join('')}</ol>
  <textarea id="outText" rows="10" readonly aria-label="Your answers, ready to paste"></textarea>
  <div class="row">
    <button class="btn primary" type="button" data-act="copy">Copy my answers</button>
    <button class="btn" type="button" data-act="rec">Use the recommended picks</button>
    <button class="btn" type="button" data-act="clear">Clear my picks</button>
    <span id="copied" class="ok" role="status"></span>
  </div>
  <p class="remind">Your three picks become the vendored states in <code>test/reference/round10/</code> (totem-shape.json, totem-lastday.json and totem-call.json, each trimmed to the option you pick).</p>
</section>`;

const PAGE_DATA = { round: 10, storageKey: 'hungerbar-picker-r10', features: FEATURES.map((f) => ({ key: f.key, title: f.title, options: f.options.map((o) => ({ id: o.id, name: o.name, recommended: !!o.recommended })) })) };
const CELLS = ROWS.length;
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Hungerbar Round 10</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* Layout: one column. A sticky bar holds the three picks and the view switches; the glyph strip; one section per
   question (its situations, its pick pills, one card per option that draws every situation as real renders); your
   answers last. Terminal pictures stay dark in both themes; the page around them follows the OS. Offline on purpose:
   Windows' own faces only (Bahnschrift for display, Segoe UI for text, Cascadia Mono for code). Round 9's palette. */
:root{
  --bg:#13161b; --panel:#1a1e25; --raise:#242933; --line:#313845;
  --fg:#ebe7dd; --muted:#a2a9b6; --accent:#e2a65a; --accent-ink:#231503;
  --gold:#ffc83d; --gold-ink:#2a1f00; --risk:#ffb547;
  --term:#0c0c0c;
  --f-display:"Bahnschrift","Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;
  --f-body:"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;
  --f-term:"Cascadia Mono","Cascadia Code",Consolas,monospace;
  color-scheme:dark;
  padding-top:env(safe-area-inset-top,0px); padding-bottom:env(safe-area-inset-bottom,0px);
}
@media (prefers-color-scheme: light){ :root:not([data-theme="dark"]){
  --bg:#eceef1; --panel:#fbfbfc; --raise:#e2e5ea; --line:#cbd0d8; --fg:#1b1d21; --muted:#545a64; --accent:#93530c; --accent-ink:#fffaf2;
  --gold:#8a5a00; --gold-ink:#fff8e6; --risk:#9a5300; color-scheme:light } }
:root[data-theme="light"]{
  --bg:#eceef1; --panel:#fbfbfc; --raise:#e2e5ea; --line:#cbd0d8; --fg:#1b1d21; --muted:#545a64; --accent:#93530c; --accent-ink:#fffaf2;
  --gold:#8a5a00; --gold-ink:#fff8e6; --risk:#9a5300; color-scheme:light }
*{box-sizing:border-box}
html,body{background:var(--bg)}
body{margin:0;color:var(--fg);font:15px/1.55 var(--f-body)}
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:10;background:var(--bg)}
[hidden]{display:none!important}
.wrap{max-width:2000px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
header.top{padding-block:26px 8px;display:flex;flex-direction:column;gap:8px}
.brand{font:700 clamp(28px,3.6vw,40px)/1.1 var(--f-display);margin:0;letter-spacing:.01em;text-wrap:balance}
.lede{margin:0;color:var(--muted);max-width:80ch}
.lede b{color:var(--fg)}
h2{margin:0;font:700 24px/1.2 var(--f-display);text-wrap:balance;letter-spacing:.01em}
h3{margin:0;font:700 17px/1.3 var(--f-body)}
.sub{margin:0;color:var(--muted);max-width:86ch}
code{font:12.5px var(--f-term);color:var(--fg);background:var(--raise);border-radius:4px;padding:1px 5px}
.label{font:700 11px/1.3 var(--f-body);text-transform:uppercase;letter-spacing:.09em;color:var(--muted);margin:0}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.bar{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;background:var(--bg);border-bottom:1px solid var(--line)}
@media (max-width:720px){ .bar{position:static} }
.bar-in{padding-block:8px;display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;justify-content:space-between}
.picked{display:flex;flex-wrap:wrap;gap:6px;align-items:center;min-width:0}
.pill{font:13px/1 var(--f-body);background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:6px 10px;white-space:nowrap;color:var(--fg);text-decoration:none}
.pill b{color:var(--accent)}
.pill.none{color:var(--muted)}
.switches{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;font-size:13px;color:var(--muted)}
.switches label{display:flex;gap:6px;align-items:center}
select,textarea{font:inherit;color:var(--fg);background:var(--panel);border:1px solid var(--line);border-radius:6px}
select{padding:4px 6px}
.btn{font:700 14px/1 var(--f-body);border-radius:8px;padding:9px 13px;cursor:pointer;border:1px solid var(--line);background:var(--raise);color:var(--fg)}
.btn:hover{border-color:var(--muted)}
.btn.primary,.btn.pick[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
main{padding-block:18px 64px;display:flex;flex-direction:column;gap:44px}
#probe{display:flex;flex-direction:column;gap:12px}
.probe-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:10px}
.pt{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;min-width:0}
.pt-name{display:flex;flex-direction:column;gap:2px}
.pt-name b{font:700 15px/1.2 var(--f-body)}
.pt-name span,.pt-prior{color:var(--muted);font-size:13px;margin:0}
.pt-shots{display:flex;gap:10px;flex-wrap:wrap}
.jump{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.feature{display:flex;flex-direction:column;gap:14px;min-width:0;padding-top:10px;border-top:1px solid var(--line)}
.f-head{display:flex;flex-direction:column;gap:6px}
.intro{margin:0;max-width:96ch}
.pills{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.opill{font:600 13.5px/1 var(--f-body);border-radius:999px;padding:8px 12px;cursor:pointer;border:1px solid var(--line);background:var(--panel);color:var(--fg);display:inline-flex;gap:6px;align-items:center}
.opill:hover{border-color:var(--muted)}
.opill[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.opill small{font:700 10.5px/1 var(--f-body);letter-spacing:.06em;text-transform:uppercase;opacity:.8}
.sits{margin:0;padding:10px 14px 10px 34px;background:var(--panel);border:1px solid var(--line);border-radius:10px;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,440px),1fr));gap:4px 24px;font-size:14px}
.sits li{min-width:0}
.sits li span{color:var(--muted)}
.sits li.extra{list-style:"+  "}
.cards{display:flex;flex-direction:column;gap:14px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:10px;min-width:0}
.card.picked-card{border:2px solid var(--accent);padding:13px}
.card-h{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}
.card-t{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;min-width:0;flex:1}
.tag{font:700 11px/1 var(--f-body);letter-spacing:.06em;text-transform:uppercase;border-radius:5px;padding:4px 6px;white-space:nowrap}
.tag.rec{background:var(--accent);color:var(--accent-ink)}
.tag.today{border:1px solid var(--line);color:var(--muted)}
.note{margin:0;color:var(--muted);font-size:14px;max-width:110ch}
.note b{color:var(--fg)}
.facts{margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:6px 18px;font-size:13.5px}
.facts div{min-width:0;border-left:2px solid var(--line);padding-left:10px}
.facts div.risk{border-left-color:var(--risk)}
.facts dt{font:700 11px/1.4 var(--f-body);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.facts div.risk dt{color:var(--risk)}
.facts dd{margin:0}
.sit{display:flex;flex-direction:column;gap:6px;min-width:0;padding-top:10px;border-top:1px dashed var(--line)}
.sit-l{font:600 14px/1.35 var(--f-body);display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.sit-l .n{display:inline-block;min-width:1.4em;color:var(--accent);font-variant-numeric:tabular-nums}
.chip{font:700 11px/1 var(--f-body);letter-spacing:.05em;border-radius:999px;padding:4px 8px;border:1px solid var(--line);color:var(--muted)}
.chip.gold{background:var(--gold);border-color:var(--gold);color:var(--gold-ink)}
.style{display:flex;flex-direction:column;gap:3px;min-width:0}
.zooms{display:flex;flex-wrap:wrap;gap:6px 16px;align-items:flex-start;min-width:0}
.vlab,figcaption{font:700 10.5px/1 var(--f-body);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
figure.view{margin:0;display:flex;flex-direction:column;gap:4px;min-width:0;max-width:100%}
.shot{overflow-x:auto;max-width:100%;background:var(--term);border-radius:6px;line-height:0}
.shot img{max-width:none;display:block}
body.st-colour [data-style="plain"],body.st-plain [data-style="colour"]{display:none}
body.zm-1x [data-zoom="2x"],body.zm-2x [data-zoom="1x"]{display:none}
.fnote{display:flex;flex-direction:column;gap:6px;max-width:900px;font-size:14px;color:var(--muted)}
.fnote textarea{width:100%;min-height:2.6em;padding:8px;resize:vertical}
.answers{display:flex;flex-direction:column;gap:12px;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px}
.ans{margin:0;padding-left:22px;display:flex;flex-direction:column;gap:8px}
.ans li{display:flex;flex-wrap:wrap;gap:4px 14px;align-items:baseline}
.ans-q{font:700 15px/1.3 var(--f-body);min-width:9em}
.ans-a{font-weight:700;color:var(--accent)}
.ans-a.none{color:var(--muted);font-weight:400}
.ans-r{color:var(--muted);font-size:13.5px}
.answers textarea{width:100%;resize:vertical;background:var(--term);color:#cccccc;border:1px solid var(--line);border-radius:6px;font:12.5px/1.45 var(--f-term);padding:10px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.ok{color:var(--accent);font-weight:700}
.remind{margin:0;font-size:14px}
@media (prefers-reduced-motion: reduce){ *{scroll-behavior:auto!important} }
</style>
</head>
<body>
<header class="wrap top">
  <h1 class="brand">Hungerbar · round 10: the totem</h1>
  <p class="lede">Three questions about the <b>Totem of Undying</b>, which in 1.2.0 stands for a <b>limit reset</b> Anthropic gave you, not for your extra credits. Every picture is a real render: Hungerbar's build drawing a session's HUD, the option painted onto its hotbar, drawn on Windows Terminal's grid in Edge with this PC's fonts, in both icon styles, at true size and at 2x. Pick one card in each section, then copy your answers at the end.</p>
</header>
<div class="bar"><div class="wrap bar-in">
  <div class="picked" id="picked"></div>
  <div class="switches">
    <label for="sw-style">Icons <select id="sw-style"><option value="both">Both styles</option><option value="colour">Colour emoji</option><option value="plain">Plain icons</option></select></label>
    <label for="sw-zoom">Size <select id="sw-zoom"><option value="both">True size and 2x</option><option value="1x">True size only</option><option value="2x">2x only</option></select></label>
  </div>
</div></div>
<main class="wrap" id="main">
  ${probeHTML}
  <nav class="jump" aria-label="Questions"><span class="label">Jump to</span>${FEATURES.map((f) => `<a class="pill" href="#f-${f.key}">${esc(f.title)}</a>`).join('')}<a class="pill" href="#answers">Your answers</a></nav>
  ${FEATURES.map(featureHTML).join('\n')}
  ${answersHTML}
</main>
<script>
const DATA = ${JSON.stringify(PAGE_DATA)};
const KEY = DATA.storageKey, F = DATA.features;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const state = { picks: {}, notes: {}, style: 'both', zoom: 'both' };
try {
  const v = JSON.parse(localStorage.getItem(KEY));
  if (v && typeof v === 'object') {
    for (const f of F) {
      if (v.picks && f.options.some((o) => o.id === v.picks[f.key])) state.picks[f.key] = v.picks[f.key];
      if (v.notes && typeof v.notes[f.key] === 'string') state.notes[f.key] = v.notes[f.key];
    }
    if (['both', 'colour', 'plain'].includes(v.style)) state.style = v.style;
    if (['both', '1x', '2x'].includes(v.zoom)) state.zoom = v.zoom;
  }
} catch (e) { /* no storage: the page still works, it just forgets */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } };
const optOf = (f, id) => f.options.find((o) => o.id === id);
function views() {
  document.body.classList.toggle('st-colour', state.style === 'colour');
  document.body.classList.toggle('st-plain', state.style === 'plain');
  document.body.classList.toggle('zm-1x', state.zoom === '1x');
  document.body.classList.toggle('zm-2x', state.zoom === '2x');
}
function sync() {
  for (const el of document.querySelectorAll('[data-act="pick"]')) {
    const on = state.picks[el.dataset.f] === el.dataset.o;
    el.setAttribute('aria-pressed', String(on));
    if (el.classList.contains('btn')) el.textContent = on ? 'Picked' : 'Pick this';
  }
  for (const c of document.querySelectorAll('.card')) c.classList.toggle('picked-card', state.picks[c.dataset.f] === c.dataset.o);
  document.getElementById('picked').innerHTML = '<span class="label">Your picks</span>' + F.map((f) => {
    const o = optOf(f, state.picks[f.key]);
    return '<a class="pill' + (o ? '' : ' none') + '" href="#f-' + f.key + '">' + esc(f.title) + ': ' + (o ? '<b>' + esc(o.name) + '</b>' : 'not picked') + '</a>';
  }).join('');
  for (const f of F) {
    const o = optOf(f, state.picks[f.key]), el = document.getElementById('ans-' + f.key);
    el.className = 'ans-a' + (o ? '' : ' none');
    el.textContent = o ? o.name + ' (' + o.id + ')' + (o.recommended ? ', the recommendation' : '') : 'not picked';
  }
  summary();
}
function summary() {
  const lines = ['Hungerbar round 10: my answers'];
  for (const f of F) {
    const o = optOf(f, state.picks[f.key]);
    lines.push(f.title + ': ' + (o ? o.id + ' (' + o.name + ')' + (o.recommended ? ' [recommended]' : '') : '(not picked)'));
  }
  const notes = F.filter((f) => (state.notes[f.key] || '').trim());
  if (notes.length) { lines.push('', 'Notes'); for (const f of notes) lines.push(f.title + ': ' + state.notes[f.key].trim().replace(/\\s+/g, ' ')); }
  const paste = { round: 10, picks: Object.fromEntries(F.map((f) => [f.key, state.picks[f.key] || null])) };
  if (notes.length) paste.notes = Object.fromEntries(notes.map((f) => [f.key, state.notes[f.key].trim()]));
  lines.push('', 'Paste-ready:', JSON.stringify(paste));
  const ta = document.getElementById('outText');
  ta.value = lines.join('\\n');
  ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight + 4) + 'px';
  document.getElementById('copied').textContent = '';
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'pick') { state.picks[b.dataset.f] = b.dataset.o; save(); sync(); }
  else if (a === 'rec') { for (const f of F) if (!state.picks[f.key]) state.picks[f.key] = (f.options.find((o) => o.recommended) || f.options[0]).id; save(); sync(); }
  else if (a === 'clear') { state.picks = {}; save(); sync(); }
  else if (a === 'copy') {
    const ta = document.getElementById('outText'), ok = document.getElementById('copied');
    const fallback = () => { ta.focus(); ta.select(); let r = false; try { r = document.execCommand('copy'); } catch (err) { /* ignore */ } ok.textContent = r ? 'Copied. Paste it in the chat.' : 'Copy was blocked: the text is selected, press Ctrl+C.'; };
    try { navigator.clipboard.writeText(ta.value).then(() => { ok.textContent = 'Copied. Paste it in the chat.'; }, fallback); } catch (err) { fallback(); }
  }
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.note) { state.notes[t.dataset.note] = t.value; save(); summary(); }
});
for (const f of F) { const t = document.getElementById('note-' + f.key); if (t) t.value = state.notes[f.key] || ''; }
for (const [id, key] of [['sw-style', 'style'], ['sw-zoom', 'zoom']]) {
  const el = document.getElementById(id); el.value = state[key];
  el.addEventListener('change', () => { state[key] = el.value; save(); views(); });
}
views(); sync();
const bar = document.querySelector('.bar');
const padTop = () => { document.documentElement.style.scrollPaddingTop = getComputedStyle(bar).position === 'sticky' ? (bar.offsetHeight + 8) + 'px' : '0px'; };
try { new ResizeObserver(padTop).observe(bar); } catch (e) { padTop(); }
window.__pickerReady = true;
</script>
</body>
</html>
`;
const PAGE = join(DIR, 'picker.html');
writeFileSync(PAGE, page, 'utf8');

// ---------- verify ----------
const html = readFileSync(PAGE, 'utf8');
const checks = {};
const imgSrcs = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]*)"/g)].map((m) => m[1]);
checks.images = imgSrcs.length;
checks.imagesDataUri = imgSrcs.every((s) => s.startsWith('data:image/png;base64,'));
const stripped = html.replace(/data:image\/png;base64,[A-Za-z0-9+/=]+/g, 'data:');
checks.externalLoads = [...stripped.matchAll(/\b(?:src|href)\s*=\s*"(?!#|data:)([^"]*)"/g)].map((m) => m[1])
  .concat([...stripped.matchAll(/url\(\s*['"]?(?!data:)([^)'"]+)/g)].map((m) => m[1]))
  .concat([...stripped.matchAll(/@import|<link\b|<iframe\b|<object\b|<embed\b|https?:\/\//g)].map((m) => m[0]));
if (!checks.imagesDataUri || checks.externalLoads.length) throw new Error(`self-contained check failed: ${JSON.stringify(checks)}`);
const pageHits = privacyHits(stripped.replace(/<[^>]+>/g, ' '), 'page text').concat(privacyHits(stripped, 'page source'))
  .filter((h) => !/path "[a-z]:\/\/"/.test(h));
// the image bytes: none may carry text (PNG tEXt chunks) or a path
const pngText = ROWS.flatMap((r) => Object.values(r.images)).filter((im) => /tEXt|iTXt|zTXt/.test(Buffer.from(im.b64, 'base64').toString('latin1'))).length;
checks.privacy = { rows: ROWS.length, rowHits: rowHits.length, pageHits, pngTextChunks: pngText, allowlist: ALLOW };
if (pageHits.length || pngText) throw new Error(`privacy: ${pageHits.join('; ')} ${pngText} PNGs with text chunks`);

// the matrix: every option x situation cell, with its four pictures
const matrix = {};
for (const f of FEATURES) {
  const sits = [...f.situations, ...f.extra];
  matrix[f.key] = { options: f.options.length, situations: f.situations.length, extra: f.extra.length, cells: 0, required: f.options.length * f.situations.length, pictures: 0, grid: {} };
  for (const o of f.options) {
    matrix[f.key].grid[o.id] = {};
    for (const s of sits) {
      const tag = `data-cell="${f.key}|${o.id}|${s.id}"`;
      const n = html.split(tag).length - 1;
      const at = html.indexOf(tag), end = html.indexOf('data-cell="', at + tag.length);
      const pics = (html.slice(at, end < 0 ? undefined : end).match(/<img\b/g) || []).length;
      if (n !== 1 || pics !== 4) throw new Error(`cell ${f.key}|${o.id}|${s.id}: ${n} blocks, ${pics} pictures`);
      matrix[f.key].grid[o.id][s.id] = pics;
      matrix[f.key].cells++;
      matrix[f.key].pictures += pics;
    }
  }
}
// the page in Edge: it parses, its script runs, every picture decodes, every cell is there
const verifyPage = html.replace('</body>', `<script>async function show(){
  if (!window.__pickerReady) throw new Error('the page script did not finish');
  const imgs = [...document.images];
  await Promise.all(imgs.map((i) => i.decode().catch(() => null)));
  const bad = imgs.filter((i) => !i.complete || !i.naturalWidth).length;
  const cells = document.querySelectorAll('[data-cell]').length, cards = document.querySelectorAll('.card').length;
  if (bad || imgs.length !== ${imgSrcs.length} || cells !== ${CELLS} || cards !== ${FEATURES.reduce((n, f) => n + f.options.length, 0)}) throw new Error('verify: ' + JSON.stringify({ bad, imgs: imgs.length, cells, cards }));
  if (document.documentElement.scrollWidth > window.innerWidth + 1) throw new Error('verify: the page scrolls sideways at ' + window.innerWidth + ' px');
  return { x: 0, y: 0, width: 200, height: 60 };
}</script></body>`);
const edge2 = await openEdge(join(WORK, 'edge-verify'));
try {
  await edge2.capture(verifyPage, 1, join(WORK, 'verify-wide'), { width: 1600, height: 900, scale: 1 });
  await edge2.capture(verifyPage, 1, join(WORK, 'verify-phone'), { width: 400, height: 800, scale: 1 });
  checks.edge = 'parsed, script ran, every picture decoded, every cell present; no sideways scroll at 1600 px and 400 px';
} finally {
  await edge2.close();
}

// ---------- the build state ----------
const dist = join(REPO, 'dist', 'hungerbar.mjs');
const newer = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? newer(join(d, e.name)) : statSync(join(d, e.name)).mtimeMs > statSync(dist).mtimeMs ? [join(d, e.name)] : []));
const total = Object.values(matrix).reduce((n, m) => n + m.pictures, 0);
const state = {
  built: new Date().toISOString(), round: 10, design: 'share/design/v12-totem.md section 3', page: 'picker.html',
  pageBytes: Buffer.byteLength(html), pageSha256: sha(html),
  dist: { file: 'dist/hungerbar.mjs', sha256: sha(readFileSync(dist)), bytes: statSync(dist).size, srcNewerThanDist: newer(join(REPO, 'src')).map((p) => p.slice(REPO.length + 1).replace(/\\/g, '/')) },
  renders: [...renders.keys()].map((k) => { const [h5, credits] = k.split('/'); return { fiveHourUsedPct: Number(h5), weekLeftPct: 60, credits, config: 'hud.totem off, align left, user off, pr on, usageApi + scopedWeekly on' }; }),
  method: 'Rows: dist/hungerbar.mjs rendering a statusLine payload in scripts/media/rig.mjs\'s sandbox (the demos of hungerbar preview have no state without extra usage, no credits-out state and the week at 18%, so the rig drives the same build with each situation\'s payload and usage file); candidates painted onto the hotbar cells as v12-totem-proto/proto.mjs does; pictures by scripts/media/term.mjs in headless Edge (scripts/media/edge.mjs), run from PowerShell.',
  cellCheck: { rows: CHECKED.rows, cells: CHECKED.cells, allowed: ALLOWED, note: 'hot 0-8 only where the offhand appears for a totem, and then equal to the engine\'s gutter' },
  matrix: Object.fromEntries(Object.entries(matrix).map(([k, m]) => [k, { options: m.options, situations: m.situations, extra: m.extra, cells: m.cells, required: m.required, pictures: m.pictures, grid: m.grid }])),
  pictures: { rows: total, probe: Object.keys(PROBE_IMG).length, perCell: '2 icon styles x 2 sizes (1x full HUD at 16 px; 2x of cols 0-44)' },
  checks, recommended: REC,
  files: Object.fromEntries(['build-10.mjs', 'picker.html', ...FEATURES.map((f) => f.file)].map((f) => [f, sha(readFileSync(join(DIR, f)))])),
  previews: 'previews/<feature>/<option>/<situation>-<style>-<1x|2x>.png, previews/probe/',
};
writeFileSync(join(DIR, 'picker.build.json'), JSON.stringify(state, null, 1) + '\n', 'utf8');

console.log(`picker.html: ${(state.pageBytes / 1048576).toFixed(2)} MB, ${checks.images} pictures, all data URIs, no external loads, privacy clean`);
for (const [k, m] of Object.entries(matrix)) {
  const sits = Object.keys(Object.values(m.grid)[0]);
  console.log(`\n${k}: ${m.options} options x ${m.situations} situations${m.extra ? ` (+${m.extra} extra)` : ''} = ${m.cells} cells (${m.required} required), ${m.pictures} pictures`);
  console.log('  ' + 'option'.padEnd(15) + sits.map((s) => s.padStart(13)).join(''));
  for (const [o, row] of Object.entries(m.grid)) console.log('  ' + o.padEnd(15) + sits.map((s) => String(row[s]).padStart(13)).join(''));
}
console.log(`\n${checks.edge}`);
if (!keep) rmSync(WORK, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
