// The vitals (src/hud/vitals.ts, SPEC §0.12, 1.1.0): the picks from design round 9, span for span against the design's
// own rows (test/reference/round9/ultra.json: ultra-apple; stale.json: stale-tilde; paying.json: pay-poison, with its
// credits-out row as the offhand's 1.1.0 fix draws it and the sub-half-share row p-share, the poison floor), through
// the layer on the engine's render, through the tests' own layer (test/hud/vitals-oracle.ts, which finds every column
// from the state, not from the drawn line) and through the real HUD path (renderPayload with sources that hand each
// situation its limits, last-known flags, credits and Fable week); by hand on every look, the boss bar's line, poison
// with the stale shading, Ultra with the boss bar, the keys off, and every line the layer must leave as it is; the
// bytes at both depths; the glyph; and against the tests' layer on the reference states, the time-lapse and seeded fuzz
// states x seeded flags x the 5 fable ids. With nothing to draw the engine's lines come back as they are.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { HUD_GLYPHS } from '../../src/cli/glyphs.ts';
import { defaults, type Config } from '../../src/config.ts';
import { DEMOS, DEMO_NOW, demoSources } from '../../src/demo.ts';
import { shade, FABLE_IDS, renderHud } from '../../src/hud/fable.ts';
import { frameHud } from '../../src/hud/frame.ts';
import { offhandHud, offhandMarks } from '../../src/hud/offhand.ts';
import { fromState, type Sit } from '../../src/hud/input.ts';
import { encode } from '../../src/hud/look.ts';
import { DARK, DGREY, FOOD, GREY, HEART } from '../../src/hud/mix.ts';
import { S, W, type Span } from '../../src/hud/spans.ts';
import {
  HEARTS, heartsHud, NO_VITALS, POISON, poisonHearts, STALE, SUN, TILDE, ULTRA_GOLD, ULTRA_GUTTER, vitalMarks, WEEK_GAP, WEEK_RED, type VitalMarks,
} from '../../src/hud/vitals.ts';
import { cellWidth } from '../../src/hud/wt.ts';
import type { LimitView } from '../../src/limits.ts';
import type { Payload } from '../../src/payload.ts';
import { renderPayload } from '../../src/render.ts';
import type { Sources } from '../../src/state.ts';
import type { UsageFile } from '../../src/usage/file.ts';
import { frameOracle } from '../hud/frame-oracle.ts';
import { offhandOracle, offhandSideOracle, QUIET_OFFHAND } from '../hud/offhand-oracle.ts';
import { mulberry32, vitalFlags, vitalState, type VitalFlags } from '../hud/fuzz.ts';
import { sgrOracle } from '../hud/sgr-oracle.ts';
import { MIX, picked, plain, REF, SESSION, SOURCES, SPEC, STATES, tuples, type RefLines, type RefState } from '../hud/ref.ts';
import { QUIET_VITALS, vitalsOracle, type OracleVitals } from '../hud/vitals-oracle.ts';
import { plainDefaults } from '../plain-config.ts';

const text = (l: readonly Span[]): string => l.map((s) => s.t).join('');
const marks = (m: Partial<VitalMarks>): VitalMarks => ({ ...NO_VITALS, ...m });
const NORMAL: RefState = STATES.normal;

// ---------------------------------------------------------------------------------------------------------------------
// The design's rows
// ---------------------------------------------------------------------------------------------------------------------

interface R9Situation { id: string; label: string; note: string; state: RefState; ctx: { now?: number; stale?: { h5: boolean; week: boolean } } }
interface R9 {
  source: { file: string; sha256: string; option: string };
  id: string;
  situations: R9Situation[];
  rows: Array<{ label: string; situation: string; lines: RefLines }>;
}
const read = (f: string): R9 => JSON.parse(readFileSync(join(REF, 'round9', `${f}.json`), 'utf8')) as R9;
const FEATURES = { ultra: read('ultra'), stale: read('stale'), paying: read('paying') } as const;
type Feature = keyof typeof FEATURES;
const ALL = (Object.entries(FEATURES) as Array<[Feature, R9]>).flatMap(([f, d]) => d.situations.map((s, i) => ({ f, s, lines: d.rows[i]!.lines })));

test('round 9: the vendored rows are the picks (ultra-apple, stale-tilde, pay-poison), the full HUD (5 lines, 6 with the boss bar, framed, left)', () => {
  assert.deepEqual([FEATURES.ultra.id, FEATURES.stale.id, FEATURES.paying.id], ['ultra-apple', 'stale-tilde', 'pay-poison']);
  for (const [f, d] of Object.entries(FEATURES)) {
    assert.equal(d.source.option, d.id, f);
    assert.equal(d.source.file, `round9/${f}.json`);
    // the files they were taken from are the ones SOURCES.json names (hud.reference.test.ts pins these files' own sha256)
    assert.equal((SOURCES.files[`round9/${f}.json`]!.originSha256 as Record<string, string>)[`round9/${f}.json`], d.source.sha256, f);
    assert.deepEqual(d.rows.map((r) => r.situation), d.situations.map((s) => s.id), `${f}: a row per situation, in order`);
    assert.deepEqual(d.rows.map((r) => r.label), d.situations.map((s) => s.label));
  }
  assert.deepEqual(ALL.map(({ s }) => s.id), ['u-normal', 'u-week95', 'u-fable', 'u-paying', 's-file', 's-passed', 's-none', 's-zeros', 'p-h5', 'p-low', 'p-week', 'p-out',
    'p-share']);
  for (const { s, lines } of ALL) {
    assert.equal(lines.length, s.id === 'u-fable' ? 6 : 5, s.id);
    for (const l of lines) assert.ok(cellWidth(text(l as Span[])) <= 110 && !/^\s/u.test(text(l as Span[])), s.id);
  }
  const note = (JSON.parse(readFileSync(join(REF, 'round9', 'paying.json'), 'utf8')) as { note: string }).note;
  assert.match(note, /p-out \(credits out, 5-hour used up\) was drawn by the design with 1\.0's green offhand sides[^;]*; it is vendored with the 1\.1\.0 credits-out fix/,
    'the credits-out row is vendored with the fix, and says so');
  assert.match(note, /p-share \(\$2\.50 of \$50 left[^)]*\), is not in the design's file: its row was generated in 1\.1\.0 by the design's own build\.cjs/,
    'the p-share row: drawn by the design\'s builder, and says so');
  // what each design draws on the hearts line (the third engine line from the bottom, over the frame's row), as text
  const hearts = (id: string): string => { const l = ALL.find(({ s }) => s.id === id)!.lines; return text(l[l.length - 4] as Span[]); };
  assert.equal(hearts('u-normal').slice(0, 36), '☼             ∞ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ');
  assert.equal(hearts('u-fable').slice(0, 36), hearts('u-normal').slice(0, 36), 'the boss bar on top: the same hearts line');
  assert.equal(hearts('s-file').slice(0, 16), '☼ 4h49m    ~98% ');
  assert.equal(Array.from(hearts('s-file')).slice(58, 64).join(''), '🍗🍗~14%', 'the weekly ~ at col 62, after the drumsticks (2 cells each)');
  assert.equal(hearts('s-none'), '?               ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥', 'nothing known: today\'s ? and dark hearts');
  assert.equal(hearts('p-h5').slice(0, 16), '☼ 1h05m      0% ', 'the day\'s icon, not the skull');
  assert.equal(hearts('p-out').slice(0, 16), '☠  1h05m     0% ', 'credits out: the skull, as today');
  assert.equal(hearts('p-share').slice(0, 36), '☼ 1h05m      0% ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ', 'a share of 0.5: the day and the clock');
  const share = ALL.find(({ s }) => s.id === 'p-share')!.lines;
  assert.deepEqual((share[share.length - 4] as Span[]).slice(5, 7), [S('♥ ', POISON), S('♥ '.repeat(9), DARK)], 'one poison heart (the floor), nine dark');
});

/** The marks the HUD path would build for a situation: the account's missing 5-hour window for ultra, the stale flags, hud.ultra and hud.poison on. */
function marksOf(f: Feature, s: R9Situation, hud: Partial<Record<'ultra' | 'poison', 'on' | 'off'>> = {}): VitalMarks {
  const view = (l: unknown, dim: boolean): LimitView | null => (l ? { pct: 0, left: null, dim } : null);
  return vitalMarks({ h5None: f === 'ultra', h5: view(s.state.h5, !!s.ctx.stale?.h5), week: view(s.state.week, !!s.ctx.stale?.week) },
    { ultra: 'on', poison: 'on', ...hud }, fromState(s.state));
}
/** The tests' layer's input for a situation. */
const flagsOf = (f: Feature, s: R9Situation): OracleVitals => ({ ultra: f === 'ultra', poison: true, stale5: !!s.ctx.stale?.h5, staleWk: !!s.ctx.stale?.week });
/**
 * The offhand's marks for a situation (the rows predate the totem, test/unit/hud-totem.test.ts), fresh
 * credits; only the credits-out row has anything to draw (its grey sides).
 */
const offhandOf = (s: R9Situation): ReturnType<typeof offhandMarks> => offhandMarks({ now: DEMO_NOW, extra: null }, fromState(s.state));

test('round 9: the layer on the engine\'s render (the boss option) draws each row span for span; the tests\' own layer does too', () => {
  for (const { f, s, lines } of ALL) {
    assert.deepEqual(plain(frameHud(offhandHud(heartsHud(renderHud(s.state, 'boss'), marksOf(f, s)), offhandOf(s)))), lines, s.id);
    const oracle = frameOracle(offhandOracle(vitalsOracle(MIX.render(s.state, picked('fable-boss')), s.state, flagsOf(f, s)), s.state, QUIET_OFFHAND), s.state,
      offhandSideOracle(s.state, QUIET_OFFHAND));
    assert.deepEqual(plain(tuples(oracle)), tuples(lines), `${s.id}: the tests' layer`);
  }
  // the marks: Ultra for the ultra rows, poison for the 5-hour used up with credits left, stale from the flags
  assert.deepEqual(ALL.map(({ f, s }) => { const m = marksOf(f, s); return [m.ultra, m.poison?.lit ?? 0, m.stale5, m.staleWk]; }), [
    [true, 0, false, false], [true, 0, false, false], [true, 0, false, false], [true, 0, false, false],
    [false, 0, true, true], [false, 0, true, true], [false, 0, false, false], [false, 0, true, true],
    [false, 9, false, false], [false, 1, false, false], [false, 0, false, false], [false, 0, false, false], [false, 1, false, false],
  ]);
  // the offhand draws only on the credits-out row: its grey sides
  assert.deepEqual(ALL.filter(({ s }) => offhandOf(s).out).map(({ s }) => s.id), ['p-out']);
});

/** A UsageFile with these credits and Fable weeks, fetched 30 s before now. */
const usageOf = (extra: { used: number; limit: number } | null, scoped: UsageFile['scoped'] = []): UsageFile =>
  ({ v: 1, at: DEMO_NOW - 30, extra: extra && { enabled: true, usedCents: Math.round(extra.used * 100), limitCents: Math.round(extra.limit * 100), currency: 'USD' }, scoped, lockUntil: 0 });
/** A limit as limits.ts views it, from the engine's {used, left} and whether it is last-known. */
const viewOf = (l: unknown, dim: boolean): LimitView | null => {
  if (!l) return null;
  const v = l as { used: number; left?: number };
  return { pct: v.used, left: v.left ?? null, dim };
};
/**
 * The demo's normal day with a situation's limits (live or last-known, and h5None for ultra), credits and Fable week,
 * its git view without the demo's git state (the design's rows draw ⎇ grey, as nothing known) and no history (the
 * design draws none).
 */
function sources(f: Feature, s: R9Situation): (p: Payload, cfg: Config, now: number) => Sources {
  const { status: _status, op: _op, ...git } = DEMOS.normal!.git;
  const st = s.state as { h5: unknown; week: unknown; extra: { used: number; limit: number } | null; scoped?: Array<{ name: string; used: number; left: number }> };
  const scoped = (st.scoped ?? []).map((e) => ({ name: e.name, pct: e.used, resets_at: DEMO_NOW + e.left }));
  return (p, cfg, now) => ({
    ...demoSources(DEMOS.normal!)(p, cfg, now),
    git: () => ({ ...git }),
    limits: () => ({ h5: viewOf(st.h5, !!s.ctx.stale?.h5), week: viewOf(st.week, !!s.ctx.stale?.week), h5None: f === 'ultra' }),
    usage: () => usageOf(st.extra, scoped),
    history: () => null,
  });
}
/**
 * The HUD with the boss bar, at the left edge, no name and the [OP] tag, the usage API on, no totem and 1.0's pickaxe
 * (the rows predate both, test/unit/hud-offhand.test.ts and hud-tiers.test.ts), and these keys.
 */
const hudCfg = (hud: Partial<Config['hud']> = {}): Config =>
  ({ ...plainDefaults(), look: 'hud', hud: { ...plainDefaults().hud, fable: 'boss', totem: 'off', pickaxe: 'plain', ...hud }, network: { ...plainDefaults().network, usageApi: true, scopedWeekly: true } });
const NORMAL_P = DEMOS.normal!.payload;
const payloadOf = (s: R9Situation): Payload => (s.state.model === 'Fable 5.1' ? { ...NORMAL_P, model: { id: 'claude-fable-5-1', display_name: 'Fable 5.1' } } : NORMAL_P);

test('the README\'s hearts sample is the hearts line of each pick\'s first row (Ultra, a limit not live, poison)', () => {
  const readme = readFileSync(join(REF, '..', '..', 'README.md'), 'utf8').replace(/\r\n/g, '\n');
  const block = /\n### Hearts that tell more\n[\s\S]*?```\n([\s\S]*?)\n```/.exec(readme);
  assert.ok(block, 'README has the hearts sample');
  const first = (d: R9): string => { const l = d.rows[0]!.lines; return text(l[l.length - 4] as Span[]); };
  assert.deepEqual(block[1]!.split('\n'), [first(FEATURES.ultra), first(FEATURES.stale), first(FEATURES.paying)]);
});

test('round 9: through the real HUD path (renderPayload, the adapter, the engine, the layers, the frame) each row span for span', () => {
  for (const { f, s, lines } of ALL) {
    const r = renderPayload(JSON.stringify(payloadOf(s)), { env: { FORCE_COLOR: '3' }, config: hudCfg(), sources: sources(f, s), now: DEMO_NOW });
    assert.ok(r.hud, s.id);
    const { hist, ...rest } = plain(r.hud.input) as unknown as RefState;
    assert.deepEqual([rest, hist], [plain({ ...s.state, scoped: s.state.scoped ?? [] }), null], `${s.id}: the engine is handed the design's state`);
    assert.deepEqual(plain(r.hud.vitals), plain(marksOf(f, s)), `${s.id}: the marks`);
    assert.deepEqual(plain(r.hud.framed), lines, s.id);
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// By hand: the looks
// ---------------------------------------------------------------------------------------------------------------------

/** The hearts line of a render, from the bottom. */
const heartsOf = (lines: readonly (readonly Span[])[]): Span[] => [...lines[lines.length - 3]!];
const st = (over: Partial<RefState>): RefState => ({ ...NORMAL, ...over });
const USED5: Partial<RefState> = { h5: { used: 100, left: 3900, window: 18000 }, extra: { used: 4.2, limit: 50 } };

test('the constants: the golden apple, the stale shading, poison; Ultra\'s gutter is 16 cells and starts with the sun', () => {
  assert.deepEqual([ULTRA_GOLD, SUN, POISON, STALE, TILDE, WEEK_RED, HEARTS, WEEK_GAP], ['#FFD43B', '#FFFF55', '#8DB33A', 0.6, '~', '#FF5555', [16, 36], 62]);
  assert.deepEqual(ULTRA_GUTTER, [S('☼', SUN), S(' '.repeat(13)), S('∞', ULTRA_GOLD, null, true), S(' ')]);
  assert.equal(W([...ULTRA_GUTTER]), 16);
  assert.deepEqual([shade(HEART, STALE), shade(FOOD, STALE), shade(POISON, STALE), shade(WEEK_RED, STALE)], ['#993333', '#866235', '#556B23', '#993333']);
  assert.deepEqual(NO_VITALS, { ultra: false, poison: null, stale5: false, staleWk: false });
});

test('poisonHearts: max(1, the engine\'s rounding of 10 x left / limit), ties to even', () => {
  assert.deepEqual([poisonHearts(45.8, 50), poisonHearts(4, 50), poisonHearts(0.01, 50), poisonHearts(50, 50), poisonHearts(2.5, 50), poisonHearts(7.5, 50),
    poisonHearts(47.5, 50), poisonHearts(42.5, 50), poisonHearts(0.4, 1)], [9, 1, 1, 10, 1, 2, 10, 8, 4]);
});

test('vitalMarks: Ultra with hud.ultra on and no 5-hour window; poison with hud.poison on, the 5-hour at 0% and credits above $0; stale from the views', () => {
  const view = (dim: boolean): LimitView => ({ pct: 50, left: 100, dim });
  const on = { ultra: 'on', poison: 'on' } as const, sitOf = (over: Partial<RefState>): Sit => fromState(st(over));
  const quiet = { h5None: false, h5: view(false), week: view(false) };
  assert.deepEqual(vitalMarks(quiet, on, sitOf({})), NO_VITALS);
  assert.deepEqual(vitalMarks({ ...quiet, h5None: true, h5: null }, on, sitOf({ h5: null })), marks({ ultra: true }));
  assert.deepEqual(vitalMarks({ ...quiet, h5None: true, h5: null }, { ...on, ultra: 'off' }, sitOf({ h5: null })), NO_VITALS, 'hud.ultra off');
  assert.deepEqual(vitalMarks({ h5None: false, h5: null, week: null }, on, sitOf({ h5: null, week: null })), NO_VITALS, 'nothing known: no Ultra, no stale');
  assert.deepEqual(vitalMarks({ h5None: false, h5: view(true), week: view(true) }, on, sitOf({})), marks({ stale5: true, staleWk: true }));
  // poison: the day's icon is the engine's day() without the skull: 65 minutes left of 300 is 78% of the day gone, orange
  assert.deepEqual(vitalMarks(quiet, on, sitOf(USED5)), marks({ poison: { lit: 9, day: S('☼ ', '#FFAA00') } }));
  assert.deepEqual(vitalMarks(quiet, on, sitOf({ ...USED5, h5: { used: 100, left: 600 } })).poison, { lit: 9, day: S('☾ ', GREY) });
  assert.deepEqual(vitalMarks(quiet, on, sitOf({ ...USED5, h5: { used: 100, left: 17000 } })).poison, { lit: 9, day: S('☼ ', SUN) });
  assert.deepEqual(vitalMarks(quiet, on, sitOf({ ...USED5, extra: { used: 49.99, limit: 50 } })).poison?.lit, 1, 'a cent left: one heart');
  for (const [what, over, hud] of [
    ['hud.poison off', USED5, { ...on, poison: 'off' }], ['credits out', { ...USED5, extra: { used: 50, limit: 50 } }, on],
    ['past the limit', { ...USED5, extra: { used: 75, limit: 50 } }, on], ['no credits', { ...USED5, extra: null }, on],
    ['no limit on the credits', { ...USED5, extra: { used: 4.2, limit: 0 } }, on], ['the 5-hour at 1%', { ...USED5, h5: { used: 99, left: 3900 } }, on],
    ['no 5-hour', { ...USED5, h5: null }, on], ['only the week used up', { ...USED5, h5: { used: 40 }, week: { used: 100 } }, on],
  ] as const) assert.equal(vitalMarks(quiet, hud, sitOf(over)).poison, null, what);
});

test('Ultra: the gutter ☼ … ∞ and ten gold hearts, the rest of the line and every other line as the engine drew them; the boss bar\'s line too', () => {
  for (const id of ['off', 'boss'] as const) {
    const fable = SPEC.round7.situations['fable-in-use']!.state;
    for (const state of [st({ h5: null }), { ...fable, h5: null }]) {
      const eng = renderHud(state, id), got = heartsHud(eng, marks({ ultra: true }));
      const at = eng.length - 3;
      assert.deepEqual(got[at]!.slice(0, 5), [...ULTRA_GUTTER, S('♥ '.repeat(10), ULTRA_GOLD)], `${id}: line ${at}`);
      assert.equal(text(got[at]!).slice(36), text(eng[at]!).slice(36), 'from col 36 on: the engine\'s');
      got.forEach((l, i) => { if (i !== at) assert.deepEqual(l, eng[i], `${id}: line ${i}`); });
    }
  }
  assert.equal(renderHud({ ...SPEC.round7.situations['fable-in-use']!.state, h5: null }, 'boss').length, 5, 'the boss bar on top: the hearts line is line 2 of 5');
  // a known 5-hour (no Ultra account would have one): the line stays
  const eng = renderHud(NORMAL, 'off');
  assert.deepEqual(heartsHud(eng, marks({ ultra: true })), eng);
  // no weekly and no compactions: the engine trims the line after the last heart, and so does Ultra
  const bare = renderHud(st({ h5: null, week: null }), 'off');
  assert.equal(W(bare[1]!), 35);
  assert.deepEqual(heartsHud(bare, marks({ ultra: true }))[1], [...ULTRA_GUTTER, S('♥ '.repeat(9) + '♥', ULTRA_GOLD)]);
  // and a fable option's padding after it (no weekly: padded to col 62) keeps its plain cell at col 35
  const tail = renderHud(st({ h5: null, week: null, scoped: [{ name: 'Fable', used: 35, left: 3600 }] }), 'tail');
  const ut = heartsHud(tail, marks({ ultra: true }))[1]!;
  assert.deepEqual(ut.slice(0, 5), [...ULTRA_GUTTER, S('♥ '.repeat(9) + '♥', ULTRA_GOLD)]);
  assert.equal(ut[5]!.t.slice(0, 27), ' '.repeat(27));
  assert.equal(ut[5]!.fg, undefined);
});

test('stale: ~ before the 5-hour % and its lit hearts at 60%; ~ at col 62, the drumsticks and the weekly % at 60%; dark hearts and the clocks as drawn', () => {
  const eng = renderHud(st({ h5: { used: 63, left: 2700, window: 18000 }, week: { used: 86, left: 84539 } }), 'off');
  const got = heartsHud(eng, marks({ stale5: true, staleWk: true }))[1]!;
  assert.deepEqual(got, [S('☾ 45m', GREY), S(' '.repeat(6)), S(TILDE, GREY), S('37%', '#993333', null, true), S(' '), S('♥ ♥ ♥ ♥ ', '#993333'),
    S('♥ ♥ ♥ ♥ ♥ ♥ ', DARK), S(' '.repeat(22)), S('🍗🍗', '#866235'), S(TILDE, GREY), S('14%', '#866235', null, true), S(' ↻ 23h28m', GREY)]);
  // each alone
  assert.deepEqual(heartsHud(eng, marks({ stale5: true }))[1]!.slice(-4), eng[1]!.slice(-4), 'the 5-hour alone: the weekly as drawn');
  assert.deepEqual(heartsHud(eng, marks({ staleWk: true }))[1]!.slice(0, 6), eng[1]!.slice(0, 6), 'the weekly alone: the 5-hour as drawn');
  // a red weekly % (10% left or less), and no drumsticks left
  const red = heartsHud(renderHud(st({ week: { used: 95, left: 345540 } }), 'off'), marks({ staleWk: true }))[1]!;
  assert.deepEqual(red.slice(-4), [S('🍗', '#866235'), S(TILDE, GREY), S('5%', '#993333', null, true), S(' ↻ 3d23h', GREY)]);
  const gone = heartsHud(renderHud(st({ week: { used: 100, left: 187200 } }), 'off'), marks({ staleWk: true }))[1]!;
  assert.deepEqual(gone.slice(-4), [S(' '.repeat(26)), S(TILDE, GREY), S('0%', '#993333', null, true), S(' ↻ 2d04h', GREY)]);
  // nothing known: the engine's ? and dark hearts; a 5-hour with no hearts lit: only the ~ and the %
  const none = renderHud(st({ h5: null, week: null }), 'off');
  assert.deepEqual(heartsHud(none, marks({ stale5: true, staleWk: true })), none);
  const zero = heartsHud(renderHud(st({ h5: { used: 100, left: 3900 }, extra: null }), 'off'), marks({ stale5: true }))[1]!;
  assert.deepEqual(zero.slice(0, 6), [S('☠  ', HEART), S('1h05m', GREY), S(' '.repeat(4)), S(TILDE, GREY), S('0%', '#993333', null, true), S(' ')]);
  assert.equal(zero[6]!.fg, DARK);
});

test('poison: the day\'s icon and the clock, the % as drawn, the credits\' share in poison green; with the stale shading, both at 60%', () => {
  const eng = renderHud(st(USED5), 'off'), m = marks({ poison: { lit: 9, day: S('☼ ', '#FFAA00') } });
  assert.deepEqual(heartsOf(eng).slice(0, 6), [S('☠  ', HEART), S('1h05m', GREY), S(' '.repeat(5)), S('0%', HEART, null, true), S(' '), S('♥ '.repeat(10), DARK)]);
  const got = heartsHud(eng, m);
  assert.deepEqual(got[1]!.slice(0, 7), [S('☼ ', '#FFAA00'), S('1h05m', GREY), S(' '.repeat(6)), S('0%', HEART, null, true), S(' '), S('♥ '.repeat(9), POISON), S('♥ ', DARK)]);
  assert.deepEqual(got[1]!.slice(7), eng[1]!.slice(6), 'from col 36 on: the engine\'s');
  for (const i of [0, 2, 3]) assert.deepEqual(got[i], eng[i]);
  // poison with the 5-hour last-known: the ~, the % and the poison hearts at 60%
  const both = heartsHud(eng, { ...m, stale5: true })[1]!;
  assert.deepEqual(both.slice(0, 8), [S('☼ ', '#FFAA00'), S('1h05m', GREY), S(' '.repeat(5)), S(TILDE, GREY), S('0%', '#993333', null, true), S(' '), S('♥ '.repeat(9), '#556B23'), S('♥ ', DARK)]);
  // night: '☾ ' merges with the clock, as the engine draws it
  const night = heartsHud(renderHud(st({ ...USED5, h5: { used: 100, left: 600 } }), 'off'), marks({ poison: { lit: 10, day: S('☾ ', GREY) } }))[1]!;
  assert.deepEqual(night.slice(0, 5), [S('☾ 10m', GREY), S(' '.repeat(8)), S('0%', HEART, null, true), S(' '), S('♥ '.repeat(10), POISON)]);
  // the boss bar on top: line 2 of 5
  const boss = renderHud({ ...SPEC.round7.situations['fable-in-use']!.state, ...USED5 }, 'boss');
  assert.equal(boss.length, 5);
  assert.deepEqual(heartsHud(boss, m)[2]!.slice(0, 6), got[1]!.slice(0, 6));
  // a 5-hour that is not used up (no skull): poison draws nothing
  assert.deepEqual(heartsHud(renderHud(NORMAL, 'off'), m), renderHud(NORMAL, 'off'));
});

test('the keys off draw 1.0\'s bytes: no Ultra (the ? and dark hearts), no poison (the skull and dark hearts); the HUD path with each', () => {
  const run = (f: Feature, id: string, hud: Partial<Config['hud']>): { framed: Span[][]; vitals: VitalMarks; engine: Span[][] } => {
    const s = FEATURES[f].situations.find((x) => x.id === id)!;
    const r = renderPayload(JSON.stringify(payloadOf(s)), { env: { FORCE_COLOR: '3' }, config: hudCfg(hud), sources: sources(f, s), now: DEMO_NOW });
    return { framed: r.hud!.framed, vitals: plain(r.hud!.vitals), engine: frameHud(r.hud!.lines) };
  };
  const u = run('ultra', 'u-normal', { ultra: 'off' });
  assert.deepEqual(u.vitals, NO_VITALS);
  assert.deepEqual(u.framed, u.engine, 'hud.ultra off: the engine\'s lines');
  assert.equal(text(u.framed[1]!).slice(0, 16), '?' + ' '.repeat(15));
  const p = run('paying', 'p-h5', { poison: 'off' });
  assert.deepEqual(p.vitals, NO_VITALS);
  assert.deepEqual(p.framed, p.engine, 'hud.poison off: the engine\'s lines');
  assert.equal(text(p.framed[1]!).slice(0, 3), '☠  ');
  // the stale marks have no key: they draw with both off
  const s = run('stale', 's-file', { ultra: 'off', poison: 'off' });
  assert.deepEqual(s.vitals, marks({ stale5: true, staleWk: true }));
  assert.deepEqual(s.framed, FEATURES.stale.rows[0]!.lines);
  // the defaults: both on
  assert.deepEqual([defaults().hud.ultra, defaults().hud.poison], ['on', 'on']);
});

test('heartsHud: nothing to draw, or a hearts line not of the engine\'s shape: the lines as they are (a copy)', () => {
  const eng = renderHud(st({ h5: null }), 'off');
  const all = marks({ ultra: true, poison: { lit: 5, day: S('☼ ', SUN) }, stale5: true, staleWk: true });
  const same = (lines: Span[][], m: VitalMarks, what: string): void => {
    const got = heartsHud(lines, m);
    assert.deepEqual(got, lines, what);
    got.forEach((l, i) => assert.notEqual(l, lines[i], `${what}: line ${i} is a copy`));
  };
  same(eng, NO_VITALS, 'no marks');
  assert.deepEqual(heartsHud([], all), []);
  assert.deepEqual(heartsHud([[S('a')], [S('b')]], all), [[S('a')], [S('b')]], 'two lines: no hearts line');
  // the hearts line built by hand: a gutter, the hearts, the rest
  const Q = [S('?', DGREY), S(' '.repeat(15))];
  const H = (lit = 0): Span[] => [S('♥ '.repeat(lit), HEART), S('♥ '.repeat(10 - lit), DARK)].filter((s) => s.t);
  const L = (gut: Span[], hearts: Span[] = H(), tail: Span[] = [S(' '.repeat(26)), S(' '), S('18%', FOOD, null, true), S(' ↻ 3d23h', GREY)]): Span[][] => [[S('x')], [...gut, ...hearts, ...tail], [S('y')], [S('z')]];
  const K = (pct = '98%', head: Span[] = [S('☼ ', SUN), S('4h49m', GREY)]): Span[] => [...head, S(' '.repeat(16 - W(head) - pct.length - 1)), S(pct, HEART, null, true), S(' ')];
  assert.deepEqual(heartsHud(L(Q), all)[1]!.slice(0, 5), [...ULTRA_GUTTER, S('♥ '.repeat(10), ULTRA_GOLD)], 'the hand-built line is the engine\'s shape');
  assert.deepEqual(heartsHud(L(K('98%'), H(10)), marks({ stale5: true }))[1]!.slice(0, 7),
    [S('☼ ', SUN), S('4h49m', GREY), S('    '), S(TILDE, GREY), S('98%', '#993333', null, true), S(' '), S('♥ '.repeat(10), '#993333')]);
  for (const [what, lines] of [
    ['a short line', [[S('x')], [S('☼ 4h')], [S('y')], [S('z')]]],
    ['a gutter of 15 cells', L([S('?', DGREY), S(' '.repeat(14))])],
    ['a wide glyph across col 16', L([S('?', DGREY), S(' '.repeat(14))], [S('日'), ...H().slice(0, 1)])],
    ['nine hearts', L(Q, [S('♥ '.repeat(9), DARK)], [])],
    ['a heart in another colour', L(Q, [S('♥ ', '#FFAA00'), S('♥ '.repeat(9), DARK)])],
    ['a red heart after a dark one', L(Q, [S('♥ ', DARK), S('♥ ', HEART), S('♥ '.repeat(8), DARK)])],
    ['a bold heart', L(Q, [S('♥ ', DARK, null, true), S('♥ '.repeat(9), DARK)])],
    ['a heart on a background', L(Q, [S('♥ ', DARK, '#000000'), S('♥ '.repeat(9), DARK)])],
    ['another glyph in the hearts', L(Q, [S('♡ ', DARK), S('♥ '.repeat(9), DARK)])],
    ['no space after a heart', L(Q, [S('♥♥', DARK), S('♥ '.repeat(9), DARK)])],
    ['a joined cluster in the hearts', L(Q, [S('♥́ ', DARK), S('♥ '.repeat(9), DARK)])],
  ] as Array<[string, Span[][]]>) same(lines, all, what);
  // a gutter that is neither: nothing but the weekly's mark (here none) is drawn
  for (const [what, gut] of [
    ['? in grey', [S('?', GREY), S(' '.repeat(15))]], ['a bold ?', [S('?', DGREY, null, true), S(' '.repeat(15))]], ['a ? on a background', [S('?', DGREY, '#000000'), S(' '.repeat(15))]],
    ['! for ?', [S('!', DGREY), S(' '.repeat(15))]], ['styled padding', [S('?', DGREY), S(' '.repeat(15), GREY)]], ['three spans', [S('?', DGREY), S(' '), S(' '.repeat(14), GREY)]],
    ['no space after the %', [S('☼ ', SUN), S('4h49m', GREY), S('     '), S('98% ', HEART, null, true)]],
    ['a styled last space', [...K().slice(0, -1), S(' ', GREY)]], ['no padding', [S('☼ ', SUN), S('4h49m     ', GREY), S('98%', HEART, null, true), S(' ')]],
    ['styled padding before the %', [S('☼ ', SUN), S('4h49m', GREY), S('     ', GREY), S('98%', HEART, null, true), S(' ')]],
    ['a % that is no number', K('9x%')], ['a % in grey', [...K().slice(0, 3), S('98%', GREY, null, true), S(' ')]],
    ['a % on a background', [...K().slice(0, 3), S('98%', HEART, '#000000', true), S(' ')]], ['a % not bold', [...K().slice(0, 3), S('98%', HEART), S(' ')]],
    ['two spans', [S('☼ 4h49m     98%', GREY), S(' ')]],
  ] as Array<[string, Span[]]>) same(L(gut), { ...all, staleWk: false }, what);
  // poison needs the skull: the day's icon (a 5-hour left), a skull in grey, bold or on a background are left as they are
  const P = marks({ poison: { lit: 9, day: S('☼ ', '#FFAA00') } });
  for (const [what, head] of [
    ['the day', [S('☼ ', SUN), S('1h05m', GREY)]], ['a grey skull', [S('☠  ', GREY), S('1h05m', GREY)]], ['a bold skull', [S('☠  ', HEART, null, true), S('1h05m', GREY)]],
    ['a skull on a background', [S('☠  ', HEART, '#000000'), S('1h05m', GREY)]], ['a skull and one space', [S('☠ ', HEART), S('1h05m', GREY)]],
  ] as Array<[string, Span[]]>) same(L(K('0%', head)), P, what);
  // a day's icon wider than the engine's leaves no room: the gutter stays
  same(L(K('0%', [S('☠  ', HEART), S('1h05m', GREY)])), marks({ poison: { lit: 9, day: S('☼'.repeat(9), SUN) } }), 'a day of 9 cells');
  // poison drawn, Ultra asked: only the gutter that is there counts
  assert.equal(text(heartsHud(L(K('0%', [S('☠  ', HEART), S('1h05m', GREY)])), { ...P, ultra: true })[1]!).slice(0, 3), '☼ 1');
});

test('the weekly\'s stale mark: only on a weekly as the engine draws it at col 62 (a plain space, the bold %, the grey ↻)', () => {
  const gut = [S('?', DGREY), S(' '.repeat(15))], H = [S('♥ '.repeat(10), DARK)];
  const L = (tail: Span[]): Span[][] => [[S('x')], [...gut, ...H, ...tail], [S('y')], [S('z')]];
  const wk = marks({ staleWk: true });
  const ok = L([S(' '.repeat(22)), S('🍗🍗', FOOD), S(' '), S('18%', FOOD, null, true), S(' ↻ 3d23h', GREY)]);
  assert.deepEqual(heartsHud(ok, wk)[1]!.slice(-4), [S('🍗🍗', '#866235'), S(TILDE, GREY), S('18%', '#866235', null, true), S(' ↻ 3d23h', GREY)]);
  // drumsticks in another colour (not the engine's) are left, the mark still drawn
  assert.deepEqual(heartsHud(L([S(' '.repeat(22)), S('🍗🍗', '#FFFFFF'), S(' '), S('18%', FOOD, null, true), S(' ↻ 3d23h', GREY)]), wk)[1]!.slice(-4),
    [S('🍗🍗', '#FFFFFF'), S(TILDE, GREY), S('18%', '#866235', null, true), S(' ↻ 3d23h', GREY)]);
  for (const [what, tail] of [
    ['no weekly (the line ends at col 35)', []],
    ['a line that ends at col 62', [S(' '.repeat(26))]],
    ['col 62 not a space', [S(' '.repeat(26)), S('x'), S('18%', FOOD, null, true), S(' ↻ 3d23h', GREY)]],
    ['a styled space at col 62', [S(' '.repeat(26)), S(' ', GREY), S('18%', FOOD, null, true), S(' ↻ 3d23h', GREY)]],
    ['two spaces at col 62', [S(' '.repeat(26)), S('  '), S('18%', FOOD, null, true), S(' ↻ 3d23h', GREY)]],
    ['nothing after col 62', [S(' '.repeat(27))]],
    ['no % after it', [S(' '.repeat(27)), S('Fable', '#FF55FF', null, true), S(' ↻ 3d23h', GREY)]],
    ['a % in another colour (a scoped name "12%")', [S(' '.repeat(27)), S('12%', '#FFFFFF', null, true), S(' ↻ 3d23h', GREY)]],
    ['a % on a background', [S(' '.repeat(27)), S('18%', FOOD, '#000000', true), S(' ↻ 3d23h', GREY)]],
    ['a % not bold', [S(' '.repeat(27)), S('18%', FOOD), S(' ↻ 3d23h', GREY)]],
    ['no reset after it', [S(' '.repeat(27)), S('18%', FOOD, null, true)]],
    ['no ↻', [S(' '.repeat(27)), S('18%', FOOD, null, true), S(' · ', GREY)]],
    ['a ↻ in white', [S(' '.repeat(27)), S('18%', FOOD, null, true), S(' ↻ 3d23h', '#FFFFFF')]],
  ] as Array<[string, Span[]]>) assert.deepEqual(heartsHud(L(tail), wk), L(tail), what);
  // with the 5-hour's marks drawn and the weekly not there, the 5-hour's still are
  const ultraOnly = heartsHud(L([]), { ...wk, ultra: true })[1]!;
  assert.deepEqual(ultraOnly, [...ULTRA_GUTTER, S('♥ '.repeat(10), ULTRA_GOLD)]);
});

// ---------------------------------------------------------------------------------------------------------------------
// Bytes and glyphs
// ---------------------------------------------------------------------------------------------------------------------

test('bytes: every round-9 row at 24-bit and 256 colours is the independent encoder\'s', () => {
  for (const { s, lines } of ALL) {
    for (const depth of ['truecolor', '256'] as const) {
      assert.equal(encode(lines as Span[][], depth, { bold: true, nbsp: true }), sgrOracle(lines, { depth }), `${s.id} ${depth}`);
    }
  }
  const u = ALL[0]!.lines as Span[][], p = ALL[8]!.lines as Span[][], stale = ALL[4]!.lines as Span[][];
  assert.ok(encode(u, 'truecolor', { bold: true, nbsp: false }).includes('\x1b[1;38;2;255;212;59m∞\x1b[0m'), 'the bold gold ∞');
  assert.ok(encode(u, '256', { bold: true, nbsp: false }).includes('\x1b[38;5;221m♥ ♥ '), 'the gold hearts at 256 colours');
  assert.ok(encode(p, 'truecolor', { bold: true, nbsp: false }).includes('\x1b[38;2;141;179;58m♥ ♥ '), 'poison green');
  assert.ok(encode(stale, 'truecolor', { bold: true, nbsp: false }).includes('\x1b[38;2;170;170;170m~\x1b[0m\x1b[1;38;2;153;51;51m98%\x1b[0m'), 'the ~ and the dimmed %');
});

test('glyphs: ∞ is 1 cell and on glyphs --hud; the ~ is ASCII', () => {
  assert.equal(cellWidth('∞'), 1);
  assert.match(HUD_GLYPHS.find(([g]) => g === '∞')?.[1] ?? '', /Ultra.*hud\.ultra/);
  assert.match(TILDE, /^[\x20-\x7e]$/);
  // every other glyph on the rows' hearts lines is the engine's own, and listed: ☼ ☾ ☠ ♥ 🍗 ↻
  const drawn = new Set(ALL.flatMap(({ lines }) => [...text(lines[lines.length - 4] as Span[])].filter((g) => g.codePointAt(0)! > 0x7f)));
  assert.deepEqual([...drawn].sort(), ['∞', '☼', '☾', '☠', '♥', '🍗', '↻'].sort());
  for (const g of drawn) assert.ok(HUD_GLYPHS.some(([h]) => h === g), g);
});

// ---------------------------------------------------------------------------------------------------------------------
// Against the tests' own layer
// ---------------------------------------------------------------------------------------------------------------------

/** The src marks and the tests' layer's input for one set of flags on a state. */
function both(state: unknown, f: VitalFlags): [VitalMarks, OracleVitals] {
  const view = (dim: boolean): LimitView => ({ pct: 0, left: null, dim });
  const m = vitalMarks({ h5None: f.h5None, h5: view(f.stale5), week: view(f.staleWk) }, { ultra: f.ultra ? 'on' : 'off', poison: f.poison ? 'on' : 'off' }, fromState(state));
  return [m, { ultra: f.h5None && f.ultra, poison: f.poison, stale5: f.stale5, staleWk: f.staleWk }];
}

function* inputs(): Generator<[string, unknown]> {
  for (const [k, s] of Object.entries(STATES)) yield [`states.${k}`, s];
  for (const [k, s] of Object.entries(SPEC.round7.situations)) yield [`round7.${k}`, s.state];
  for (const { s } of ALL) yield [`round9.${s.id}`, s.state];
  for (let i = 0; i < SESSION.frames.length; i += 7) yield [`frame ${i}`, SESSION.frames[i]];
  const r = mulberry32(0x91);
  const bases = [...Object.values(STATES), ...Object.values(SPEC.round7.situations).map((s) => s.state), ...ALL.map(({ s }) => s.state)];
  for (let k = 0; k < 300; k++) yield [`fuzz state #${k}`, vitalState(r, bases)];
}

test('the layer equals the tests\' layer on the reference states, the time-lapse and fuzz, x seeded flags x the 5 fable ids', () => {
  const r = mulberry32(0x5eed9);
  let ultra = 0, poison = 0, stale5 = 0, staleWk = 0, kept = 0;
  for (const [what, state] of inputs()) {
    for (const id of FABLE_IDS) {
      const f = vitalFlags(r), [m, o] = both(state, f);
      const eng = renderHud(state, id);
      const got = frameHud(heartsHud(eng, m));
      const want = frameOracle(vitalsOracle(MIX.render(state, picked(`fable-${id}`)), state, o), state);
      assert.deepEqual(tuples(got as RefLines), plain(tuples(want)), `${what} ${id} ${JSON.stringify(f)}`);
      for (const l of got) assert.ok(cellWidth(text(l)) <= 110 && !/^\s/u.test(text(l)), `${what} ${id}: ${cellWidth(text(l))} cells`);
      const l = text(heartsOf(heartsHud(eng, m))), e = text(heartsOf(eng));
      if (l.includes('∞')) ultra++;
      if (m.poison && l !== e) poison++;
      if (f.stale5 && l.slice(0, 16).includes(TILDE) && !e.slice(0, 16).includes(TILDE)) stale5++;
      if (f.staleWk && Array.from(l).slice(16).includes(TILDE) && !Array.from(e).slice(16).includes(TILDE)) staleWk++;
      if ((f.ultra || f.poison || f.stale5 || f.staleWk) && l === e) kept++;
    }
  }
  assert.ok(ultra > 50 && poison > 50 && stale5 > 150 && staleWk > 150 && kept > 100, JSON.stringify({ ultra, poison, stale5, staleWk, kept }));
});

test('QUIET_VITALS: the tests\' layer with nothing to draw is the engine\'s render', () => {
  const lines = MIX.render(NORMAL, picked('fable-off'));
  assert.deepEqual(plain(vitalsOracle(lines, NORMAL, QUIET_VITALS)), plain(lines));
  assert.deepEqual(vitalsOracle([], NORMAL, { ...QUIET_VITALS, ultra: true }), []);
});
