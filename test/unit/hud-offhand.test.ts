// The offhand (src/hud/offhand.ts, SPEC §0.12, 1.1.0): the emerald's keyless fixes, span for span against the design's
// own rows (test/reference/round9/emerald.json: em-digits; paying.json's credits-out row), through the layer on the
// engine's render, through the tests' own layer (test/hud/offhand-oracle.ts, which finds every cell from the state, not
// from the drawn line) and through the real HUD path (renderPayload with sources that hand each situation its limits,
// credits and the credits' age, and no limit reset); by hand on the marks' rules, the count's edges, the stale grey, no
// offhand, the boss bar's line and every shape the layer must leave as it is; the bytes at both depths; the glyphs; and
// against the tests' layer on the reference states, the time-lapse and seeded fuzz states x seeded flags x the 5 fable
// ids. The totem left this layer in 1.2.0 (test/unit/hud-totem.test.ts); round 9's totem-mix rows stay vendored for the
// record (SPEC §0.13 superseded them).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { HUD_GLYPHS } from '../../src/cli/glyphs.ts';
import { defaults, type Config } from '../../src/config.ts';
import { DEMOS, DEMO_NOW, demoSources } from '../../src/demo.ts';
import { FABLE_IDS, renderHud } from '../../src/hud/fable.ts';
import { frameHud } from '../../src/hud/frame.ts';
import { fromState, type Sit } from '../../src/hud/input.ts';
import { encode } from '../../src/hud/look.ts';
import { DIV, GREY, WELL, WHITE } from '../../src/hud/mix.ts';
import {
  drawnOffhand, EMERALD, engineOffhand, NO_OFFHAND, OFFHAND, offhandHud, offhandMarks, SIDE, STALE_SECS, staleCredits, YELLOW, type OffhandMarks,
} from '../../src/hud/offhand.ts';
import { S, splitAt, type Span } from '../../src/hud/spans.ts';
import { cellWidth } from '../../src/hud/wt.ts';
import type { ExtraView, State } from '../../src/state.ts';
import type { LimitView } from '../../src/limits.ts';
import type { Payload } from '../../src/payload.ts';
import { renderPayload } from '../../src/render.ts';
import type { ShownNow } from '../../src/shown.ts';
import type { Sources } from '../../src/state.ts';
import type { UsageFile } from '../../src/usage/file.ts';
import { frameOracle } from '../hud/frame-oracle.ts';
import { mulberry32, offhandFlags, offhandState, type OffFlags } from '../hud/fuzz.ts';
import { offhandOracle, offhandSideOracle, QUIET_OFFHAND, type OracleOffhand } from '../hud/offhand-oracle.ts';
import { MIX, picked, plain, REF, SESSION, SOURCES, SPEC, STATES, tuples, type RefLines, type RefState } from '../hud/ref.ts';
import { sgrOracle } from '../hud/sgr-oracle.ts';
import { plainDefaults } from '../plain-config.ts';

const text = (l: readonly Span[]): string => l.map((s) => s.t).join('');
const marks = (m: Partial<OffhandMarks>): OffhandMarks => ({ ...NO_OFFHAND, cash: 50, ...m });
const NORMAL: RefState = STATES.normal;
const st = (over: Partial<RefState>): RefState => ({ ...NORMAL, ...over });
/** The hotbar line of a render (the last engine line). */
const hot = (lines: readonly (readonly Span[])[]): Span[] => [...lines[lines.length - 1]!];
/** Cols [from, to) of a line, as spans. */
const cols = (line: readonly Span[], from: number, to: number): Span[] => splitAt(splitAt(line, from)[1], to - from)[0];

// ---------------------------------------------------------------------------------------------------------------------
// The design's rows
// ---------------------------------------------------------------------------------------------------------------------

interface R9Situation { id: string; label: string; note: string; state: RefState; ctx: { pop?: number | null; stale?: boolean } }
interface R9 {
  note: string;
  intro: string;
  optionNote: string;
  source: { file: string; sha256: string; option: string };
  id: string;
  situations: R9Situation[];
  rows: Array<{ label: string; situation: string; lines: RefLines }>;
}
const read = (f: string): R9 => JSON.parse(readFileSync(join(REF, 'round9', `${f}.json`), 'utf8')) as R9;
const EMERALD_R = read('emerald'), PAYING = read('paying');
const ALL = EMERALD_R.situations.map((s, i) => ({ s, lines: EMERALD_R.rows[i]!.lines }));

/** When the situation's credits were fetched: 2 hours ago for the stale one, 30 s ago otherwise. */
const fetchedOf = (s: R9Situation): number => DEMO_NOW - (s.ctx.stale ? 7200 : 30);

test('round 9: the vendored rows are the pick em-digits, the full HUD (5 lines, framed, left)', () => {
  const d = EMERALD_R;
  assert.equal(d.id, 'em-digits');
  assert.equal(d.source.option, d.id);
  assert.equal(d.source.file, 'round9/emerald.json');
  assert.equal((SOURCES.files['round9/emerald.json']!.originSha256 as Record<string, string>)['round9/emerald.json'], d.source.sha256);
  assert.deepEqual(d.rows.map((r) => r.situation), d.situations.map((s) => s.id), 'a row per situation, in order');
  assert.deepEqual(d.rows.map((r) => r.label), d.situations.map((s) => s.label));
  assert.deepEqual(ALL.map(({ s }) => s.id), ['e-50', 'e-99', 'e-100', 'e-250', 'e-1234', 'e-12345', 'e-040', 'e-stale']);
  for (const { s, lines } of ALL) {
    assert.equal(lines.length, 5, s.id);
    for (const l of lines) assert.ok(cellWidth(text(l as Span[])) <= 110 && !/^\s/u.test(text(l as Span[])), s.id);
  }
  assert.match(PAYING.note, /p-out \(credits out, 5-hour used up\) was drawn by the design with 1\.0's green offhand sides[^;]*; it is vendored with the 1\.1\.0 credits-out fix/);
  // totem-mix stays vendored for the record: SPEC §0.13 superseded it (the totem is the limit resets you declare)
  assert.match(SOURCES.files['round9/totem-mix.json']!.note as string, /Superseded by SPEC §0\.13 \(1\.2\.0\)/);
  const bar = (id: string): string => { const l = ALL.find(({ s }) => s.id === id)!.lines; return text(l[l.length - 2] as Span[]); };
  assert.deepEqual(['e-100', 'e-1234', 'e-12345', 'e-040'].map((id) => bar(id).slice(9, 16)), [' ◆100  ', ' ◆ 1k  ', ' ◆12k  ', '       ']);
});

/** The marks the HUD path would build for a situation: its credits' age. */
const marksOf = (s: R9Situation): OffhandMarks => offhandMarks({ now: DEMO_NOW, extra: s.state.extra ? xv(fetchedOf(s)) : null }, fromState(s.state));
/** An ExtraView fetched at `at` (null: stdin's). */
const xv = (at: number | null): ExtraView => ({ used: 0, limit: 50, currency: 'USD', pct: 0, at });
/** The tests' whole drawing of a row: the engine, the offhand and the frame with the offhand's sides. */
const oracleRow = (state: RefState, o: OracleOffhand, id: Parameters<typeof picked>[0] = 'fable-boss'): RefLines =>
  frameOracle(offhandOracle(MIX.render(state, picked(id)), state, o), state, offhandSideOracle(state, o));

test('round 9: the layer on the engine\'s render (the boss option) draws each row span for span; the tests\' own layer does too', () => {
  for (const { s, lines } of ALL) {
    assert.deepEqual(plain(frameHud(offhandHud(renderHud(s.state, 'boss'), marksOf(s)))), lines, s.id);
    assert.deepEqual(plain(tuples(oracleRow(s.state, { stale: !!s.ctx.stale }))), tuples(lines), `${s.id}: the tests' layer`);
  }
  assert.deepEqual(ALL.map(({ s }) => { const m = marksOf(s); return [m.cash, m.paying, m.out, m.stale]; }), [
    [50, false, false, false], [99, false, false, false], [100, false, false, false], [250, false, false, false],
    [1234, false, false, false], [12345, false, false, false], [0, false, false, false], [250, false, false, true],
  ]);
});

test('round 9: paying.json\'s credits-out row is the offhand\'s; its other rows keep the engine\'s green sides', () => {
  PAYING.situations.forEach((s, i) => {
    const m = offhandMarks({ now: DEMO_NOW, extra: xv(DEMO_NOW - 30) }, fromState(s.state));
    assert.equal(m.out, s.id === 'p-out', s.id);
    const side = text(cols(PAYING.rows[i]!.lines[3] as Span[], 9, 15));
    assert.equal(side.slice(0, 1) + side.slice(5), s.id === 'p-out' ? '  ' : '▐▌', s.id);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The real HUD path
// ---------------------------------------------------------------------------------------------------------------------

/** A UsageFile with these credits, fetched at `at`. */
const usageOf = (extra: { used: number; limit: number } | null, at: number): UsageFile =>
  ({ v: 1, at, extra: extra && { enabled: true, usedCents: Math.round(extra.used * 100), limitCents: Math.round(extra.limit * 100), currency: 'USD' }, scoped: [], lockUntil: 0 });
const viewOf = (l: unknown): LimitView | null => (l ? { pct: (l as { used: number }).used, left: (l as { left?: number }).left ?? null, dim: false } : null);
/**
 * The demo's normal day with a situation's limits (live) and credits (fetched 30 s or 2 hours ago), no limit reset held
 * (so no totem and no shown-file), no history and no git state.
 */
function sources(s: R9Situation, asked: ShownNow[]): (p: Payload, cfg: Config, now: number) => Sources {
  const { status: _status, op: _op, ...git } = DEMOS.normal!.git;
  const state = s.state as { h5: unknown; week: unknown; extra: { used: number; limit: number } | null };
  return (p, cfg, now) => ({
    ...demoSources(DEMOS.normal!)(p, cfg, now),
    git: () => ({ ...git }),
    limits: () => ({ h5: viewOf(state.h5), week: viewOf(state.week) }),
    usage: () => usageOf(state.extra, fetchedOf(s)),
    history: () => null,
    totems: () => [],
    shown: (c) => { asked.push(c); return 0; },
  });
}
/** The HUD with the boss bar, at the left edge, no name, the usage API on and 1.0's pickaxe (the rows predate the tiers, test/unit/hud-tiers.test.ts). */
const hudCfg = (hud: Partial<Config['hud']> = {}): Config =>
  ({ ...plainDefaults(), look: 'hud', hud: { ...plainDefaults().hud, fable: 'boss', pickaxe: 'plain', ...hud }, network: { ...plainDefaults().network, usageApi: true, scopedWeekly: true } });
const NORMAL_P = DEMOS.normal!.payload;

test('round 9: through the real HUD path (renderPayload, the adapter, the engine, the layers, the frame) each row span for span, with hud.totem on or off', () => {
  for (const { s, lines } of ALL) {
    for (const totem of ['on', 'off'] as const) {
      const asked: ShownNow[] = [];
      // the rows were drawn on 1.0's hearts line: poison off
      const r = renderPayload(JSON.stringify(NORMAL_P), { env: { FORCE_COLOR: '3' }, config: hudCfg({ totem, poison: 'off' }), sources: sources(s, asked), now: DEMO_NOW });
      assert.ok(r.hud, s.id);
      const { hist, ...rest } = plain(r.hud.input) as unknown as RefState;
      assert.deepEqual([rest, hist], [plain({ ...s.state, scoped: [] }), null], `${s.id}: the engine is handed the design's state`);
      assert.deepEqual(plain(r.hud.offhand), plain(marksOf(s)), `${s.id}: the marks`);
      assert.deepEqual(r.hud.totem, { at: null, mark: null }, `${s.id}: no reset held, no totem`);
      assert.deepEqual(plain(r.hud.framed), lines, `${s.id} ${totem}`);
      assert.deepEqual(asked, [], `${s.id}: no reset held, the shown-file is not asked`);
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// By hand: the marks
// ---------------------------------------------------------------------------------------------------------------------

test('the constants: the emerald\'s green, the sides, the cap, the 900 s, the columns', () => {
  assert.deepEqual([EMERALD, SIDE, YELLOW, STALE_SECS, OFFHAND], ['#17DD62', '#5D5D5D', '#FFFF55', 900, [9, 15]]);
  assert.deepEqual(NO_OFFHAND, { cash: null, paying: false, out: false, stale: false });
  assert.deepEqual(defaults().hud.totem, 'on');
});

const STATE_LIST = Object.entries(STATES).map(([id, state]) => ({ id: `states.${id}`, state }));
const sitOf = (over: Partial<RefState>): Sit => fromState(st(over));
const H = (used: number): Partial<RefState> => ({ h5: { used, left: 3900, window: 18000 } });
const WK = (used: number): Partial<RefState> => ({ week: { used, left: 345540 } });
const X = (used: number, limit = 50): Partial<RefState> => ({ extra: { used, limit } });
const fresh = { now: DEMO_NOW, extra: xv(null) };

test('offhandMarks: the dollars, paying while a window is used up, the credits out at $0; none without an extra-usage limit', () => {
  assert.deepEqual(offhandMarks(fresh, sitOf({})), { cash: 50, paying: false, out: false, stale: false });
  assert.deepEqual(offhandMarks(fresh, sitOf({ ...H(100), ...X(4.2) })), { cash: 45, paying: true, out: false, stale: false });
  assert.deepEqual(offhandMarks(fresh, sitOf({ ...H(100), ...X(50) })), { cash: 0, paying: true, out: true, stale: false }, 'credits out');
  assert.deepEqual(offhandMarks(fresh, sitOf({ ...WK(100), ...X(80) })), { cash: 0, paying: true, out: true, stale: false }, 'past the limit is $0');
  assert.deepEqual(offhandMarks(fresh, sitOf({ ...H(100), ...X(49.6) })), { cash: 0, paying: true, out: false, stale: false }, '$0.40 left still pays');
  assert.deepEqual(offhandMarks(fresh, sitOf(X(50))), { cash: 0, paying: false, out: false, stale: false }, '$0 and nothing used up');
  assert.deepEqual(offhandMarks(fresh, sitOf({ extra: null })), NO_OFFHAND);
  assert.deepEqual(offhandMarks(fresh, sitOf({ extra: { used: 4, limit: null } })), NO_OFFHAND, 'no limit: no offhand');
});

test('staleCredits: usage.json\'s credits more than 900 s old; stdin\'s are never old', () => {
  const at = (a: number | null): Pick<State, 'now' | 'extra'> => ({ now: DEMO_NOW, extra: xv(a) });
  assert.deepEqual([staleCredits(at(DEMO_NOW - 900)), staleCredits(at(DEMO_NOW - 901)), staleCredits(at(DEMO_NOW - 7200)), staleCredits(at(null)),
    staleCredits({ now: DEMO_NOW, extra: null }), staleCredits(at(DEMO_NOW + 60))], [false, true, true, false, false, false]);
  assert.equal(offhandMarks(at(DEMO_NOW - 901), sitOf({})).stale, true);
});

// ---------------------------------------------------------------------------------------------------------------------
// By hand: the drawing
// ---------------------------------------------------------------------------------------------------------------------

/** The offhand's 6 cells as the layer draws them on the normal day's engine render with these credits. */
function drawn(m: Partial<OffhandMarks>, over: Partial<RefState> = {}, id: 'off' | 'boss' = 'off'): { off: Span[]; line: Span[] } {
  const line = hot(offhandHud(renderHud(st(over), id), marks(m)));
  return { off: cols(line, 9, 15), line };
}
const G = (g: string, fg: string): Span => S(g, fg, WELL);
const B = (t: string, fg: string = WHITE): Span => S(t, fg, WELL, true);
const side = (g: string, fg: string): Span => S(g, fg, SIDE);
const GREEN = '#17DD62';

test('the count: the engine\'s two cells below $100, then ◆ and three: 100-999, \' 1k\'-\'99k\', the yellow 99k; stale in grey but for the cap', () => {
  const well = (cash: number, stale = false): Span[] => drawnOffhand({ ...NO_OFFHAND, cash, stale }).slice(1, -1);
  assert.deepEqual(well(0), [S('    ', null, WELL)], 'under a dollar: the empty well');
  assert.deepEqual(well(1), [G('◆ ', GREEN), S('  ', null, WELL)], 'one emerald: no count');
  assert.deepEqual(well(2), [G('◆ ', GREEN), B(' 2')]);
  assert.deepEqual(well(99), [G('◆ ', GREEN), B('99')]);
  assert.deepEqual(well(100), [G('◆', GREEN), B('100')]);
  assert.deepEqual(well(999), [G('◆', GREEN), B('999')]);
  assert.deepEqual(well(1000), [G('◆', GREEN), B(' 1k')]);
  assert.deepEqual(well(9999), [G('◆', GREEN), B(' 9k')]);
  assert.deepEqual(well(10000), [G('◆', GREEN), B('10k')]);
  assert.deepEqual(well(99999), [G('◆', GREEN), B('99k')]);
  assert.deepEqual(well(100000), [G('◆', GREEN), B('99k', YELLOW)]);
  assert.deepEqual(well(1e15), [G('◆', GREEN), B('99k', YELLOW)]);
  // stale: grey, the icon as it is; nothing to grey for 0 or 1; the cap stays yellow
  assert.deepEqual([well(50, true), well(250, true), well(1234, true), well(1, true), well(0, true), well(100000, true)], [
    [G('◆ ', GREEN), B('50', GREY)], [G('◆', GREEN), B('250', GREY)], [G('◆', GREEN), B(' 1k', GREY)], [G('◆ ', GREEN), S('  ', null, WELL)], [S('    ', null, WELL)],
    [G('◆', GREEN), B('99k', YELLOW)],
  ]);
  // below $100 and fresh: the engine's own spans, every count
  for (let c = 0; c < 100; c++) for (const paying of [false, true]) assert.deepEqual(drawnOffhand({ ...NO_OFFHAND, cash: c, paying }), engineOffhand({ ...NO_OFFHAND, cash: c, paying }), `$${c}`);
});

test('the sides: grey while nothing is used up, green while the credits pay, grey again with the credits out; the frame\'s edges follow', () => {
  assert.deepEqual(drawn({}).off, [DIV, G('◆ ', GREEN), B('50'), DIV]);
  assert.deepEqual(drawn({ paying: true, cash: 45 }, { ...H(100), ...X(4.2) }).off, [side('▐', GREEN), G('◆ ', GREEN), B('45'), side('▌', GREEN)], 'the engine\'s paying emerald');
  assert.deepEqual(drawn({ paying: true, out: true, cash: 0 }, { ...H(100), ...X(50) }).off, [DIV, S('    ', null, WELL), DIV], 'the credits out');
  const edge = (m: Partial<OffhandMarks>, over: Partial<RefState>): string => {
    const f = frameHud(offhandHud(renderHud(st(over), 'off'), marks(m)));
    return [cols(f[f.length - 3]!, 9, 15)[0]!.fg, cols(f[f.length - 1]!, 9, 15)[0]!.fg].join(' ');
  };
  assert.equal(edge({ paying: true, cash: 45 }, { ...H(100), ...X(4.2) }), `${GREEN} ${GREEN}`);
  assert.equal(edge({ paying: true, out: true, cash: 0 }, { ...H(100), ...X(50) }), `${SIDE} ${SIDE}`);
  assert.equal(edge({}, {}), `${SIDE} ${SIDE}`);
  // every other cell of the line is the engine's
  for (const [m, over] of [[{ cash: 250 }, X(0, 250)], [{ paying: true, out: true, cash: 0 }, { ...H(100), ...X(50) }], [{ stale: true }, {}]] as const) {
    const eng = text(hot(renderHud(st(over), 'off'))), got = text(drawn(m, over).line);
    assert.equal(got.slice(0, 9) + got.slice(15), eng.slice(0, 9) + eng.slice(15));
  }
});

test('the keyless fixes have nothing to do below $100 with fresh credits: the engine\'s bytes, slot 5 as the engine drew it', () => {
  for (const s of [...EMERALD_R.situations, ...STATE_LIST]) {
    const sit = fromState(s.state);
    const m = offhandMarks({ now: DEMO_NOW, extra: xv(DEMO_NOW - 30) }, sit);
    const eng = renderHud(s.state, 'off');
    if ((sit.extra_left ?? 0) < 100 && !m.out) assert.deepEqual(offhandHud(eng, m), eng, s.id);
  }
});

test('offhandHud: no offhand, nothing to draw, or cells not of the engine\'s shape: the lines as they are (a copy)', () => {
  const same = (lines: Span[][], m: OffhandMarks, what: string): void => {
    const got = offhandHud(lines, m);
    assert.deepEqual(got, lines, what);
    got.forEach((l, i) => assert.notEqual(l, lines[i], `${what}: line ${i} is a copy`));
  };
  const eng = renderHud(NORMAL, 'off');
  same(eng, NO_OFFHAND, 'no marks');
  same(eng, marks({}), 'nothing to draw: the emerald at $50');
  same(renderHud(st({ extra: null }), 'off'), marks({ cash: 250 }), 'no offhand drawn (no credits)');
  same(eng, { ...marks({ cash: 250 }), cash: null }, 'no offhand in the marks');
  assert.deepEqual(offhandHud([], marks({ cash: 250 })), []);
  // the boss bar on top: the hotbar is still the last line
  const fable = SPEC.round7.situations['fable-in-use']!.state;
  const boss = renderHud({ ...fable, extra: { used: 0, limit: 250 } }, 'boss');
  assert.equal(boss.length, 5);
  const b = offhandHud(boss, marks({ cash: 250 }));
  assert.deepEqual(cols(b[4]!, 9, 15), [DIV, G('◆', GREEN), B('250'), DIV]);
  b.slice(0, 4).forEach((l, i) => assert.deepEqual(l, boss[i], `boss: line ${i}`));
  // a hand-built hotbar line: the engine's gutter with the offhand and the rest
  const G2 = (off: Span[]): Span[] => [S('v2.1.306', '#555555'), S(' '), ...off, S(' ')];
  const L = (off: Span[]): Span[][] => [[S('x')], [S('y')], [S('z')], [...G2(off), S(' '.repeat(20), null, WELL)]];
  const OFF = [DIV, G('◆ ', GREEN), B('99', YELLOW), DIV];
  assert.deepEqual(cols(offhandHud(L(OFF), marks({ cash: 250 }))[3]!, 9, 15), [DIV, G('◆', GREEN), B('250'), DIV], 'the hand-built line is the engine\'s shape');
  for (const [what, off] of [
    ['another count', [DIV, G('◆ ', GREEN), B('49'), DIV]],
    ['the emerald in another colour', [DIV, G('◆ ', WHITE), B('99', YELLOW), DIV]],
    ['green sides while not paying', [side('▐', GREEN), G('◆ ', GREEN), B('99', YELLOW), side('▌', GREEN)]],
    ['a count not bold', [DIV, G('◆ ', GREEN), S('99', YELLOW, WELL), DIV]],
    ['a wide glyph across col 9', [S('日'), G('◆ ', GREEN), B('99', YELLOW), DIV]],
  ] as Array<[string, Span[]]>) {
    const lines = L(off);
    assert.deepEqual(offhandHud(lines, marks({ cash: 250 })), lines, what);
  }
  const across9: Span[][] = [[S('x')], [S('y')], [S('z')], [S('v2.1.30', '#555555'), S(' '), S('日', null, SIDE), ...OFF.slice(1), S(' ')]];
  assert.deepEqual(offhandHud(across9, marks({ cash: 250 })), across9);
});

// ---------------------------------------------------------------------------------------------------------------------
// Bytes and glyphs
// ---------------------------------------------------------------------------------------------------------------------

test('bytes: every round-9 emerald and paying row at 24-bit and 256 colours is the independent encoder\'s', () => {
  for (const { s, lines } of [...ALL, ...PAYING.situations.map((s, i) => ({ s, lines: PAYING.rows[i]!.lines }))]) {
    for (const depth of ['truecolor', '256'] as const) assert.equal(encode(lines as Span[][], depth, { bold: true, nbsp: true }), sgrOracle(lines, { depth }), `${s.id} ${depth}`);
  }
  const row = (id: string): Span[][] => ALL.find(({ s }) => s.id === id)!.lines as Span[][];
  assert.ok(encode(row('e-1234'), '256', { bold: true, nbsp: false }).includes('\x1b[1;38;5;231;48;5;234m 1k\x1b[0m'), 'the thousands at 256 colours');
  assert.ok(encode(row('e-stale'), 'truecolor', { bold: true, nbsp: false }).includes('\x1b[1;38;2;170;170;170;48;2;32;30;7m250\x1b[0m'), 'the stale count');
});

test('glyphs: every glyph on the rows\' offhand is listed by glyphs --hud', () => {
  const names = HUD_GLYPHS.map(([g]) => g);
  const drawnGlyphs = new Set(ALL.flatMap(({ lines }) => [...text(cols(lines[lines.length - 2] as Span[], 9, 15))].filter((g) => g.codePointAt(0)! > 0x7f)));
  assert.deepEqual([...drawnGlyphs].sort(), ['◆']);
  for (const g of drawnGlyphs) assert.ok(names.includes(g), g);
});

// ---------------------------------------------------------------------------------------------------------------------
// Against the tests' own layer
// ---------------------------------------------------------------------------------------------------------------------

/** The src marks and the tests' layer's input for one set of flags on a state. */
function both(state: unknown, f: OffFlags): [OffhandMarks, OracleOffhand] {
  const m = offhandMarks({ now: DEMO_NOW, extra: xv(f.stale ? DEMO_NOW - 901 : DEMO_NOW - 30) }, fromState(state));
  return [m, { stale: f.stale }];
}

function* inputs(): Generator<[string, unknown]> {
  for (const [k, s] of Object.entries(STATES)) yield [`states.${k}`, s];
  for (const [k, s] of Object.entries(SPEC.round7.situations)) yield [`round7.${k}`, s.state];
  for (const { s } of ALL) yield [`round9.${s.id}`, s.state];
  for (const s of PAYING.situations) yield [`round9.${s.id}`, s.state];
  for (let i = 0; i < SESSION.frames.length; i += 7) yield [`frame ${i}`, SESSION.frames[i]];
  const r = mulberry32(0x0ff4a);
  const bases = [...Object.values(STATES), ...Object.values(SPEC.round7.situations).map((s) => s.state), ...ALL.map(({ s }) => s.state)];
  for (let k = 0; k < 300; k++) yield [`fuzz state #${k}`, offhandState(r, bases)];
}

test('the layer equals the tests\' layer on the reference states, the time-lapse and fuzz, x seeded flags x the 5 fable ids', () => {
  const r = mulberry32(0x7073e);
  const n = { out: 0, three: 0, stale: 0, kept: 0 };
  for (const [what, state] of inputs()) {
    for (const id of FABLE_IDS) {
      const f = offhandFlags(r), [m, o] = both(state, f);
      const eng = renderHud(state, id);
      const got = frameHud(offhandHud(eng, m));
      const want = frameOracle(offhandOracle(MIX.render(state, picked(`fable-${id}`)), state, o), state, offhandSideOracle(state, o));
      assert.deepEqual(tuples(got as RefLines), plain(tuples(want)), `${what} ${id} ${JSON.stringify(f)}`);
      for (const l of got) assert.ok(cellWidth(text(l)) <= 110 && !/^\s/u.test(text(l)), `${what} ${id}: ${cellWidth(text(l))} cells`);
      if (m.out) n.out++;
      if (m.cash !== null && m.cash >= 100) n.three++;
      if (m.stale && m.cash !== null && m.cash >= 2) n.stale++;
      if (m.cash !== null && !m.out && !(m.cash >= 100) && !(m.stale && m.cash >= 2)) { assert.deepEqual(got, frameHud(eng), `${what}: nothing to draw`); n.kept++; }
    }
  }
  assert.ok(n.out >= 20 && n.three > 100 && n.stale > 100 && n.kept > 50, JSON.stringify(n));
});

test('QUIET_OFFHAND: the tests\' layer with nothing to draw is the engine\'s render; no offhand, no change', () => {
  const lines = MIX.render(NORMAL, picked('fable-off'));
  assert.deepEqual(plain(offhandOracle(lines, NORMAL, QUIET_OFFHAND)), plain(lines));
  assert.deepEqual(plain(offhandOracle(lines, st({ extra: null }), { stale: true })), plain(lines));
  assert.deepEqual(offhandOracle([], NORMAL, QUIET_OFFHAND), []);
  assert.equal(offhandSideOracle(st({ extra: null }), QUIET_OFFHAND), null);
});
