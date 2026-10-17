// The hotbar's frame (src/hud/frame.ts, SPEC §0.9, 0.5.1): by hand on the cases the mock-ups show (the offhand drawn,
// absent and paying; a context label that blocks the offhand's top edge; the boss line on top, without its name since
// SPEC §0.11), as bytes at 24-bit and 256 colours, in both icon styles; then against the tests' own frame
// (test/hud/frame-oracle.ts, which reads the offhand from the state, not from the drawn line, and finds the boss line by
// the engine's count of lines) on every reference state, the time-lapse, every field one at a time and seeded fuzz
// states, for the 5 fable ids. The engine's lines are never changed.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HUD_GLYPHS } from '../../src/cli/glyphs.ts';
import { FABLE_IDS, renderHud } from '../../src/hud/fable.ts';
import { BOSS } from '../../src/hud/fable.ts';
import { BLANK, bossGutter, EDGE, edgeRow, FRAME, frameHud, MINT, offhandSide, offhandTop, spanAt, TOP } from '../../src/hud/frame.ts';
import { encode } from '../../src/hud/look.ts';
import { S, W, type Span } from '../../src/hud/spans.ts';
import { cellWidth } from '../../src/hud/wt.ts';
import { frameOracle, sideOf } from '../hud/frame-oracle.ts';
import { mulberry32, NON_STATES, oneFactor, state as fuzzState } from '../hud/fuzz.ts';
import { picked, MIX, plain, SESSION, SPEC, STATES, tuples, type RefLines, type RefState } from '../hud/ref.ts';
import { sgrOracle } from '../hud/sgr-oracle.ts';

const GREEN = '#17DD62';
const text = (l: readonly Span[]): string => l.map((s) => s.t).join('');
const ON = { bold: true, nbsp: true };
const NB = '\u00a0';

const NORMAL: RefState = STATES.normal;
const NO_OFFHAND: RefState = { ...STATES.normal, extra: null };
const PAYING: RefState = STATES.extra;
const FABLE: RefState = SPEC.round7.situations['fable-in-use']!.state;
/** A context label of 10 cells, '1234k/2.0M': it reaches col 9. */
const WIDE: RefState = { ...STATES.normal, ctxTok: 1234000, ctxMax: 2000000, ctxPct: 62 };

const EDGE_GREY = [S(BLANK.repeat(9)), S(EDGE.repeat(6), FRAME), S(BLANK), S(EDGE.repeat(6), MINT), S(EDGE.repeat(40), FRAME)];
const EDGE_GREEN = [S(BLANK.repeat(9)), S(EDGE.repeat(6), GREEN), S(BLANK), S(EDGE.repeat(6), MINT), S(EDGE.repeat(40), FRAME)];
const EDGE_NONE = [S(BLANK.repeat(16)), S(EDGE.repeat(6), MINT), S(EDGE.repeat(40), FRAME)];

test('the offhand drawn: a grey top edge on the XP-bar line at cols 9-14, the bottom edge row under the offhand and the hotbar', () => {
  const eng = renderHud(NORMAL, 'off'), f = frameHud(eng);
  assert.equal(eng.length, 4);
  assert.equal(f.length, 5, 'one more line');
  assert.deepEqual(f.slice(0, 2), eng.slice(0, 2), 'lines 1-2 as the engine draws them');
  assert.deepEqual(f[3], eng[3], 'the hotbar line as the engine draws it');
  assert.equal(offhandSide(eng[3]!), FRAME);
  // XP-bar line: '81k/1.0M' then a space, the six top-edge cells, the gap at col 15, then the bar as before
  assert.deepEqual(eng[2]!.slice(0, 3), [S('81k', '#80FF20'), S('/1.0M', '#AAAAAA'), S(' '.repeat(8))]);
  assert.deepEqual(f[2]!.slice(0, 5), [S('81k', '#80FF20'), S('/1.0M', '#AAAAAA'), S(' '), S(TOP.repeat(6), FRAME), S(' ')]);
  assert.deepEqual(f[2]!.slice(5), eng[2]!.slice(3));
  assert.equal(W(f[2]!), W(eng[2]!));
  assert.deepEqual(f[4], EDGE_GREY);
  assert.equal(W(f[4]!), 62);
  assert.equal(text(f[4]!), BLANK.repeat(9) + EDGE.repeat(6) + BLANK + EDGE.repeat(46));
});

test('no offhand (no extra-usage limit): the XP-bar line is untouched, the edge row is U+2800 up to the hotbar', () => {
  const eng = renderHud(NO_OFFHAND, 'off'), f = frameHud(eng);
  assert.equal(offhandSide(eng[3]!), null);
  assert.ok(!eng[3]!.some((s) => s.fg === GREEN || s.t.includes('◆')), 'the engine drew no offhand');
  assert.deepEqual(f.slice(0, 4), eng);
  assert.deepEqual(f[4], EDGE_NONE);
  assert.equal(W(f[4]!), 62);
});

test('the offhand paying: its sides are green ▐ ▌, and so are its top and bottom edges', () => {
  const eng = renderHud(PAYING, 'off'), f = frameHud(eng);
  assert.deepEqual(spanAt(eng[3]!, 9), S('▐', GREEN, FRAME));
  assert.deepEqual(spanAt(eng[3]!, 14), S('▌', GREEN, FRAME));
  assert.equal(offhandSide(eng[3]!), GREEN);
  // '237k/1.0M' is 9 cells: the edge starts right after it
  assert.deepEqual(f[2]!.slice(0, 4), [S('237k', '#80FF20'), S('/1.0M', '#AAAAAA'), S(TOP.repeat(6), GREEN), S(' ')]);
  assert.deepEqual(f[2]!.slice(4), eng[2]!.slice(3));
  assert.deepEqual(f[4], EDGE_GREEN);
  assert.deepEqual([f[0], f[1], f[3]], [eng[0], eng[1], eng[3]]);
});

test('a context label that reaches into cols 9-14 leaves the XP-bar line as it is; the bottom edge is still drawn', () => {
  const eng = renderHud(WIDE, 'off'), f = frameHud(eng);
  assert.match(text(eng[2]!), /^1234k\/2\.0M {6}▂/);
  assert.deepEqual(f[2], eng[2]);
  assert.deepEqual(f[4], EDGE_GREY);
  // the borders: a 9-cell label is drawn against; a full 1M context (10 cells) and the widest label the engine keeps
  // (15 cells) block it; over 15 cells the engine keeps only the tokens, at most 8 cells (it caps both at 1e9)
  const nine = frameHud(renderHud({ ...NORMAL, ctxTok: 999000, ctxPct: 99 }, 'off'));
  assert.ok(text(nine[2]!).startsWith('999k/1.0M' + TOP.repeat(6) + ' ▂'), text(nine[2]!));
  for (const [tok, max, label] of [[1000000, 1e6, '1000k/1.0M      '], [999999000, 1e9, '999999k/1000.0M ']] as const) {
    const eng2 = renderHud({ ...NORMAL, ctxTok: tok, ctxMax: max, ctxPct: 100 }, 'off');
    assert.ok(text(eng2[2]!).startsWith(label + '▂'), text(eng2[2]!));
    assert.deepEqual(frameHud(eng2)[2], eng2[2], label);
  }
  const tok = frameHud(renderHud({ ...NORMAL, ctxTok: 5e9, ctxMax: 5e9, ctxPct: 50 }, 'off'));
  assert.ok(text(tok[2]!).startsWith('1000000k ' + TOP.repeat(6) + ' ▂'), text(tok[2]!));
});

test('offhandTop by hand: only six unstyled spaces on cell borders take the edge', () => {
  const sp = (n: number): string => ' '.repeat(n);
  const drawn = (l: Span[]): boolean => text(offhandTop(l, FRAME)).slice(9, 15) === TOP.repeat(6);
  assert.ok(drawn([S('abc'), S(sp(13)), S('x', '#FFFFFF')]));
  assert.ok(drawn([S(sp(10)), S(sp(3)), S(sp(2))]), 'spaces spread over spans');
  assert.deepEqual(offhandTop([S(sp(9)), S(sp(6))], GREEN), [S(sp(9)), S(TOP.repeat(6), GREEN)], 'exactly 15 cells');
  for (const [what, l] of [
    ['a styled space', [S(sp(12)), S(' ', '#FFFFFF'), S(sp(5))]],
    ['a space with a background', [S(sp(9)), S(' ', null, '#5D5D5D'), S(sp(8))]],
    ['a bold space', [S(sp(14)), S(' ', null, null, true), S(sp(3))]],
    ['ink at col 9', [S(sp(9) + 'k' + sp(8))]],
    ['ink at col 14', [S(sp(14) + 'k' + sp(3))]],
    ['a wide cluster over cols 8-9', [S(sp(8) + '漢' + sp(8))]],
    ['a wide cluster over cols 14-15', [S(sp(14) + '漢' + sp(3))]],
    ['a line of 14 cells', [S(sp(14))]],
    ['a line of 5 cells', [S(sp(5))]],
  ] as Array<[string, Span[]]>) {
    assert.deepEqual(offhandTop(l, FRAME), l, what);
    assert.notEqual(offhandTop(l, FRAME), l, `${what}: a copy`);
  }
});

test('spanAt and offhandSide by hand', () => {
  const l = [S('ab'), S('漢', '#FFFFFF'), S(' ', null, FRAME)];
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((c) => spanAt(l, c)), [l[0], l[0], l[1], l[1], l[2], null]);
  assert.equal(spanAt([], 0), null);
  assert.equal(offhandSide([S('v2.1.306')]), null, 'a line that ends before col 9');
  assert.equal(offhandSide([S('v2.1.306 x', '#555555')]), null, 'ink without a background');
  assert.equal(offhandSide([S('v2.1.306 '), S(' ', null, FRAME)]), FRAME);
  assert.equal(offhandSide([S('v2.1.306 '), S('▐', GREEN, FRAME)]), GREEN);
  assert.deepEqual(edgeRow(null), EDGE_NONE);
  assert.deepEqual(edgeRow(GREEN), EDGE_GREEN);
});

test('the boss line: Fable in use with boss draws 6 lines, the boss bar on top without its name, the frame under the hotbar', () => {
  const eng = renderHud(FABLE, 'boss'), f = frameHud(eng);
  assert.equal(eng.length, 5);
  assert.equal(f.length, 6);
  // the engine writes the name, padded to col 16; the line below names the model in use
  assert.match(text(eng[0]!), /^Fable {11}🮂{46} 38% ↻ 2d05h$/u);
  assert.deepEqual(eng[0]!.slice(0, 2), [S('Fable', '#FF55FF', null, true), S(' '.repeat(11))]);
  assert.match(text(eng[1]!), /^Fable 5\.1 /);
  // the frame blanks those 16 cells: U+2800, unstyled; the bar, the % and the reset are the engine's spans
  assert.match(text(f[0]!), /^\u2800{16}🮂{46} 38% ↻ 2d05h$/u);
  assert.deepEqual(f[0], [S(BLANK.repeat(16)), ...eng[0]!.slice(2)]);
  assert.equal(W(f[0]!), W(eng[0]!));
  assert.equal(cellWidth(text(f[0]!).slice(0, text(f[0]!).indexOf(BOSS))), 16, 'the bar still starts at col 16, over the hotbar');
  assert.deepEqual(f.slice(1, 3), eng.slice(1, 3), 'lines 1-2 as the engine draws them');
  assert.deepEqual(f[4], eng[4]);
  assert.ok(text(f[3]!).startsWith('81k/1.0M ' + TOP.repeat(6) + ' ▂'));
  assert.deepEqual(f[5], EDGE_GREY);
  for (const id of FABLE_IDS.filter((x) => x !== 'boss')) {
    const g = frameHud(renderHud(FABLE, id));
    assert.equal(g.length, 5, id);
    assert.deepEqual(g[0], renderHud(FABLE, id)[0], `${id}: line 1 as the engine draws it`);
  }
  assert.equal(frameHud(renderHud(NORMAL, 'boss')).length, 5, 'no boss line on Opus');
  // the bytes: the line opens with U+2800, which Claude Code's trim keeps, in every mode
  for (const depth of ['truecolor', '256'] as const) for (const o of [ON, { bold: false, nbsp: false }]) {
    const first = encode(f, depth, o).split('\n')[0]!;
    assert.ok(first.startsWith(BLANK.repeat(16) + '\x1b['), `${depth} ${JSON.stringify(o)}`);
    assert.equal(first.trim(), first);
  }
});

test('bossGutter by hand: only the 16 cells of a padded name before a U+1FB82 at col 16 turn blank; the rest keeps its spans', () => {
  const bar = [S(BOSS.repeat(3), '#FF55FF'), S(BOSS.repeat(2), '#662266'), S(' '), S('7%', '#FF5555', null, true)];
  const blank16 = S(BLANK.repeat(16)), name = S('Fable', '#FF55FF', null, true);
  assert.deepEqual(bossGutter([name, S(' '.repeat(11)), ...bar]), [blank16, ...bar]);
  assert.deepEqual(bossGutter([S('漢字漢字漢字漢', '#FF55FF', null, true), S(' '.repeat(2)), ...bar]), [blank16, ...bar], 'wide clusters in the name');
  assert.deepEqual(bossGutter([S('x'.repeat(15), '#FF55FF', null, true), S(' '), ...bar]), [blank16, ...bar], 'a name of 15 cells, the most the engine keeps');
  assert.deepEqual(bossGutter([S(' '.repeat(16)), ...bar]), [blank16, ...bar], 'no name: an unstyled run of 16');
  assert.deepEqual(bossGutter([S(' '.repeat(16) + BOSS)]), [S(BLANK.repeat(16) + BOSS)], 'one unstyled span across col 16');
  for (const [what, l] of [
    ['a line of 16 cells', [name, S(' '.repeat(11))]],
    ['a line of 5 cells', [name]],
    ['no cells', []],
    ['no bar at col 16', [name, S(' '.repeat(11)), S('Fable 5.1')]],
    ['the bar at col 15', [name, S(' '.repeat(10)), ...bar]],
    ['the bar at col 17', [name, S(' '.repeat(12)), ...bar]],
    ['a name of 16 cells', [S('x'.repeat(16), '#FF55FF', null, true), ...bar]],
    ['a styled space at col 15', [name, S(' '.repeat(10)), S(' ', '#FFFFFF'), ...bar]],
    ['a space with a background at col 15', [name, S(' '.repeat(10)), S(' ', null, '#5D5D5D'), ...bar]],
    ['a bold space at col 15', [name, S(' '.repeat(10)), S(' ', null, null, true), ...bar]],
    ['a wide cluster across cols 15-16', [S(' '.repeat(15) + '漢'), ...bar]],
  ] as Array<[string, Span[]]>) {
    assert.deepEqual(bossGutter(l), l, what);
    assert.notEqual(bossGutter(l), l, `${what}: a copy`);
  }
  // frameHud blanks the first line only on 5 engine lines (the boss bar on top)
  const hot = renderHud(NORMAL, 'off');
  const boss = [name, S(' '.repeat(11)), ...bar];
  assert.deepEqual(frameHud([boss, ...hot])[0], [blank16, ...bar]);
  assert.deepEqual(frameHud([boss, ...hot.slice(1)])[0], boss, 'on 4 lines the first is line 1');
  assert.deepEqual(frameHud([boss, boss, ...hot])[0], boss, 'on 6 lines too');
});

test('bytes at 24-bit and 256 colours: the edge rows and the top edge; bold and nbsp change nothing in them', () => {
  const t24 = (hex: string): string => `38;2;${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(';')}`;
  const row = (side: string | null, p: (h: string) => string): string =>
    (side ? `${BLANK.repeat(9)}\x1b[${p(side)}m${EDGE.repeat(6)}\x1b[0m${BLANK}` : BLANK.repeat(16))
    + `\x1b[${p(MINT)}m${EDGE.repeat(6)}\x1b[0m\x1b[${p(FRAME)}m${EDGE.repeat(40)}\x1b[0m`;
  const x256: Record<string, string> = { [FRAME]: '38;5;59', [MINT]: '38;5;253', [GREEN]: '38;5;41' };
  for (const [s, side] of [[NORMAL, FRAME], [NO_OFFHAND, null], [PAYING, GREEN]] as const) {
    const f = frameHud(renderHud(s, 'off'));
    for (const o of [ON, { bold: false, nbsp: true }, { bold: true, nbsp: false }, { bold: false, nbsp: false }]) {
      assert.equal(encode(f, 'truecolor', o).split('\n')[4], row(side, t24), `24-bit ${side}`);
      assert.equal(encode(f, '256', o).split('\n')[4], row(side, (h) => x256[h]!), `256 ${side}`);
    }
    const last = encode(f, 'truecolor', ON).split('\n')[4]!;
    assert.equal(last.trim(), last, 'U+2800 is not whitespace: trimming keeps the row whole');
    assert.ok(!last.includes(' ') && !last.includes(NB) && !last.includes('\x1b[48'), 'no spaces and no backgrounds on the row');
  }
  const xp = (o: typeof ON, depth: 'truecolor' | '256'): string => encode(frameHud(renderHud(NORMAL, 'off')), depth, o).split('\n')[2]!;
  assert.ok(xp(ON, 'truecolor').startsWith(`\x1b[38;2;128;255;32m81k\x1b[0m\x1b[38;2;170;170;170m/1.0M\x1b[0m${NB}\x1b[38;2;93;93;93m${TOP.repeat(6)}\x1b[0m${NB}\x1b[38;2;67;105;36m▂\x1b[0m`));
  assert.ok(xp(ON, '256').startsWith(`\x1b[38;5;118m81k\x1b[0m\x1b[38;5;248m/1.0M\x1b[0m${NB}\x1b[38;5;59m${TOP.repeat(6)}\x1b[0m${NB}`));
  assert.ok(xp({ bold: true, nbsp: false }, '256').includes(`/1.0M\x1b[0m \x1b[38;5;59m${TOP.repeat(6)}\x1b[0m \x1b[`));
  const paying = encode(frameHud(renderHud(PAYING, 'off')), '256', ON).split('\n')[2]!;
  assert.ok(paying.includes(`/1.0M\x1b[0m\x1b[38;5;41m${TOP.repeat(6)}\x1b[0m${NB}`));
});

test('plain and colour icon style: the same frame; its three glyphs are 1 cell, on the glyphs --hud ruler, and all it adds', () => {
  for (const g of [EDGE, TOP, BLANK]) {
    assert.equal(cellWidth(g), 1, `U+${g.codePointAt(0)!.toString(16)}`);
    assert.ok(HUD_GLYPHS.some(([h]) => h === g), `U+${g.codePointAt(0)!.toString(16).toUpperCase()} on glyphs --hud`);
  }
  for (const s of [NORMAL, NO_OFFHAND, PAYING, WIDE, FABLE]) for (const id of FABLE_IDS) {
    const ref = `fable-${id}` as const;
    const colour = frameOracle(MIX.render(s, picked(ref)), s), plainStyle = frameOracle(MIX.render(s, picked(ref, 'plain')), s);
    assert.deepEqual(tuples(plainStyle), tuples(colour), `${id}: plain = colour`);
    const eng = renderHud(s, id), f = frameHud(eng);
    assert.deepEqual(tuples(f as RefLines), plain(tuples(colour)), `${id}: port = oracle`);
    // the frame census: the code points the frame adds are U+2582 (six, replacing six spaces), U+1FB82 and U+2800
    const added = [...text(f[f.length - 1]!)].filter((c) => c !== EDGE && c !== BLANK);
    assert.deepEqual(added, []);
    const xpE = [...text(eng[eng.length - 2]!)], xpF = [...text(f[f.length - 3]!)];
    assert.equal(xpF.length, xpE.length);
    const changed = xpF.flatMap((c, i) => (c === xpE[i] ? [] : [`${xpE[i]}>${c}`]));
    assert.deepEqual(changed, s === WIDE || s === NO_OFFHAND ? [] : Array(6).fill(` >${TOP}`), `${id}: the XP-bar line`);
  }
});

/** Every state the port and the tests' frame are compared on. */
function* states(): Generator<[string, unknown]> {
  for (const [k, s] of Object.entries(STATES)) yield [`states ${k}`, s];
  for (const [k, v] of Object.entries(SPEC.round6.inputs)) yield [`round 6 ${k}`, v.state];
  for (const [k, v] of Object.entries(SPEC.round7.situations)) yield [`round 7 ${k}`, v.state];
  for (const [i, s] of NON_STATES.entries()) yield [`non-state ${i}`, s];
  for (const [i, f] of SESSION.frames.entries()) if (i % 3 === 0) {
    yield [`frame ${i}`, f];
    yield [`frame ${i} on Fable 5.1`, { ...plain(f), model: 'Fable 5.1' }];
  }
  for (const [what, s] of oneFactor(STATES.normal)) yield [`normal, ${what}`, s];
  for (const [what, s] of oneFactor(STATES.extra)) yield [`extra, ${what}`, s];
  const r = mulberry32(0xf2a3e);
  const bases = [...Object.values(STATES), ...Object.values(SPEC.round7.situations).map((v) => v.state)];
  for (let k = 0; k < 400; k++) yield [`fuzz state #${k}`, fuzzState(r, bases)];
}

test('the gutter, as SPEC says the frame reads it: no background in cols 0-15 without an offhand; with one, exactly cols 9-14', () => {
  // SPEC §0.9 once said col 9 was "the only gutter cell with a background"; the offhand's well (10-13) and its right side
  // (14) have one too. What holds, on every state the frame is compared on: col 9 alone tells whether it is drawn.
  const WELL = '#201E07', NONE = Array<string | null>(16).fill(null);
  const gutterBgs = (line: readonly Span[]): Array<string | null> =>
    line.flatMap((s) => Array<string | null>(cellWidth(s.t)).fill(s.bg || null)).slice(0, 16);
  let n = 0, drawn = 0;
  for (const [what, s] of states()) for (const id of FABLE_IDS) {
    const eng = renderHud(s, id), hot = eng[eng.length - 1]!, side = sideOf(s);
    const want = side === null ? NONE : [...NONE.slice(0, 9), FRAME, WELL, WELL, WELL, WELL, FRAME, null];
    assert.deepEqual(gutterBgs(hot), want, `${what} ${id}: the gutter's backgrounds`);
    assert.equal(offhandSide(hot), side, `${what} ${id}: col 9 tells`);
    if (side !== null) drawn++;
    n++;
  }
  assert.ok(n > 10000 && drawn > 4000 && n - drawn > 200, JSON.stringify({ n, drawn }));
});

test('the port equals the tests\' frame (offhand read from the state) on every reference state, the time-lapse, each field and fuzz', () => {
  let n = 0, top = 0, blocked = 0, none = 0, green = 0, six = 0;
  for (const [what, s] of states()) for (const id of FABLE_IDS) {
    const eng = renderHud(s, id), before = JSON.stringify(eng);
    const f = frameHud(eng), want = frameOracle(MIX.render(s, picked(`fable-${id}` as const)), s);
    assert.equal(JSON.stringify(eng), before, `${what} ${id}: the engine's lines are not changed`);
    assert.equal(JSON.stringify(tuples(f as RefLines)), JSON.stringify(tuples(want)), `${what} ${id}: port = oracle`);
    for (const depth of ['truecolor', '256'] as const) assert.equal(encode(f, depth, ON), sgrOracle(want, { depth }), `${what} ${id}: SGR at ${depth}`);
    // the frame changes no width and adds one 62-cell line
    assert.equal(f.length, eng.length + 1);
    f.slice(0, -1).forEach((l, i) => assert.equal(W(l), W(eng[i]!), `${what} ${id}: line ${i + 1} keeps its width`));
    assert.equal(W(f[f.length - 1]!), 62);
    const side = sideOf(s);
    if (side === null) none++;
    else if (side === GREEN) green++;
    if (JSON.stringify(f[f.length - 3]) !== JSON.stringify(eng[eng.length - 2])) top++;
    else if (side !== null) blocked++;
    if (f.length === 6) six++;
    n++;
  }
  assert.ok(n > 10000, `${n} renders`);
  assert.ok(top > 10000 && blocked > 100 && none > 200 && green > 4000 && six > 200, JSON.stringify({ n, top, blocked, none, green, six }));
});
