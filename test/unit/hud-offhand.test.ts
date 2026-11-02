// The offhand (src/hud/offhand.ts, SPEC §0.12, 1.1.0): the picks from design rounds 9 and 9b, span for span against the
// design's own rows (test/reference/round9/totem-mix.json: totem-mix, with hud.totem on; emerald.json: em-digits, with
// hud.totem off, as the rows predate the totem, and with it on the same rows and the totem in slot 5; paying.json's
// credits-out row), through the layer on the engine's render, through the tests' own layer (test/hud/offhand-oracle.ts,
// which finds every cell from the state, not from the drawn line) and through the real HUD path (renderPayload with
// sources that hand each situation its limits, credits, the credits' age and a seeded shown-file); by hand on the marks'
// rules, the pop's 30 s, the totem's moves, the count's edges, the stale grey, hud.totem off, no offhand, the boss bar's
// line and every shape the layer must leave as it is; the bytes at both depths; the glyphs; and against the tests' layer
// on the reference states, the time-lapse and seeded fuzz states x seeded flags x the 5 fable ids.
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
  ANKH, drawnOffhand, DYING, EMERALD, engineOffhand, NO_OFFHAND, OFFHAND, offhandHud, offhandMarks, shownNow, SIDE, SLOT5, SLOT5_TOTEM, SPARK, STALE_SECS,
  staleCredits, TOTEM, YELLOW, type OffhandMarks, type TotemAt,
} from '../../src/hud/offhand.ts';
import { merge, S, splitAt, type Span } from '../../src/hud/spans.ts';
import { cellWidth } from '../../src/hud/wt.ts';
import type { ExtraView, State } from '../../src/state.ts';
import type { LimitView } from '../../src/limits.ts';
import type { Payload } from '../../src/payload.ts';
import { renderPayload } from '../../src/render.ts';
import { stepShown, type ShownFile, type ShownNow } from '../../src/shown.ts';
import type { Sources } from '../../src/state.ts';
import type { UsageFile } from '../../src/usage/file.ts';
import { frameOracle } from '../hud/frame-oracle.ts';
import { mulberry32, offhandFlags, offhandState, type OffFlags } from '../hud/fuzz.ts';
import { offhandOracle, offhandSideOracle, QUIET_OFFHAND, totemOracle, type OracleOffhand } from '../hud/offhand-oracle.ts';
import { MIX, picked, plain, REF, SESSION, SOURCES, SPEC, STATES, tuples, type RefLines, type RefState } from '../hud/ref.ts';
import { sgrOracle } from '../hud/sgr-oracle.ts';
import { plainDefaults } from '../plain-config.ts';

const text = (l: readonly Span[]): string => l.map((s) => s.t).join('');
const marks = (m: Partial<OffhandMarks>): OffhandMarks => ({ ...NO_OFFHAND, cash: 50, ...m });
const NORMAL: RefState = STATES.normal;
const st = (over: Partial<RefState>): RefState => ({ ...NORMAL, ...over });
/** The hotbar line of a render (the last engine line), and of a framed one (above the edge row). */
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
const TOTEM_MIX = read('totem-mix'), EMERALD_R = read('emerald'), PAYING = read('paying');
const FEATURES = { 'totem-mix': TOTEM_MIX, emerald: EMERALD_R } as const;
type Feature = keyof typeof FEATURES;
const ALL = (Object.entries(FEATURES) as Array<[Feature, R9]>).flatMap(([f, d]) => d.situations.map((s, i) => ({ f, s, lines: d.rows[i]!.lines })));

/** The second the design's pop ends for a situation: ctx.pop is its age (0: now, 30: over), null none. */
const popOf = (s: R9Situation): number => (s.ctx.pop === null || s.ctx.pop === undefined ? 0 : DEMO_NOW - s.ctx.pop + 30);
/** When the situation's credits were fetched: 2 hours ago for the stale one, 30 s ago otherwise. */
const fetchedOf = (s: R9Situation): number => DEMO_NOW - (s.ctx.stale ? 7200 : 30);
/** hud.totem for a feature's rows: on for totem-mix, off for the emerald's (drawn before the totem). */
const totemOf = (f: Feature): 'on' | 'off' => (f === 'totem-mix' ? 'on' : 'off');

test('round 9: the vendored rows are the picks (totem-mix, em-digits), the full HUD (5 lines, framed, left)', () => {
  assert.deepEqual([TOTEM_MIX.id, EMERALD_R.id], ['totem-mix', 'em-digits']);
  for (const [f, d] of Object.entries(FEATURES)) {
    assert.equal(d.source.option, d.id, f);
    assert.equal(d.source.file, `round9/${f}.json`);
    assert.equal((SOURCES.files[`round9/${f}.json`]!.originSha256 as Record<string, string>)[`round9/${f}.json`], d.source.sha256, f);
    assert.deepEqual(d.rows.map((r) => r.situation), d.situations.map((s) => s.id), `${f}: a row per situation, in order`);
    assert.deepEqual(d.rows.map((r) => r.label), d.situations.map((s) => s.label));
  }
  assert.deepEqual(ALL.map(({ s }) => s.id), ['t-safe', 't-low', 't-h5-7', 't-pop', 't-after', 't-out', 't-none', 'e-50', 'e-99', 'e-100', 'e-250', 'e-1234',
    'e-12345', 'e-040', 'e-stale']);
  for (const { s, lines } of ALL) {
    assert.equal(lines.length, 5, s.id);
    for (const l of lines) assert.ok(cellWidth(text(l as Span[])) <= 110 && !/^\s/u.test(text(l as Span[])), s.id);
  }
  // the credits-out rows are vendored with the 1.1.0 fix, and say so; the rows' notes reword the design chat's "Your"
  assert.match(TOTEM_MIX.note, /t-out[^.]*\) is vendored with the 1\.1\.0 credits-out fix/);
  assert.match(PAYING.note, /p-out \(credits out, 5-hour used up\) was drawn by the design with 1\.0's green offhand sides[^;]*; it is vendored with the 1\.1\.0 credits-out fix/);
  assert.doesNotMatch(JSON.stringify([TOTEM_MIX.optionNote, TOTEM_MIX.intro]), /\bYour\b/);
  // what each design draws on the hotbar line, cols 0-41, as text
  const bar = (id: string): string => { const l = ALL.find(({ s }) => s.id === id)!.lines; return text(l[l.length - 2] as Span[]).slice(0, 42); };
  // (📖 is 2 cells and 2 UTF-16 units, so the slice is by cells here)
  assert.equal(bar('t-safe'), 'v2.1.306  ◆ 50  ▐⛏ Ⅲ ▌📖42 ▄▄ 3      ☥'.padEnd(42));
  assert.equal(bar('t-h5-7'), 'v2.1.306  ☥ 50  ▐⛏ Ⅲ ▌📖42 ▄▄ 3'.padEnd(42));
  assert.equal(bar('t-pop'), 'v2.1.306 ▐☥✦45▌ ▐⛏ Ⅲ ▌📖42 ▄▄ 3'.padEnd(42));
  assert.equal(bar('t-after'), 'v2.1.306 ▐◆ 45▌ ▐⛏ Ⅲ ▌📖42 ▄▄ 3'.padEnd(42));
  assert.equal(bar('t-out'), 'v2.1.306        ▐⛏ Ⅲ ▌📖42 ▄▄ 3'.padEnd(42));
  assert.deepEqual(['e-100', 'e-1234', 'e-12345', 'e-040'].map((id) => bar(id).slice(9, 16)), [' ◆100  ', ' ◆ 1k  ', ' ◆12k  ', '       ']);
});

/** The marks the HUD path would build for a situation: hud.totem as the feature's rows were drawn, its pop and its credits' age. */
const marksOf = (f: Feature, s: R9Situation, totem = totemOf(f)): OffhandMarks =>
  offhandMarks({ now: DEMO_NOW, extra: s.state.extra ? xv(fetchedOf(s)) : null }, { totem }, fromState(s.state), popOf(s));
/** An ExtraView fetched at `at` (null: stdin's). */
const xv = (at: number | null): ExtraView => ({ used: 0, limit: 50, currency: 'USD', pct: 0, at });
/** The tests' layer's input for a situation. */
const flagsOf = (f: Feature, s: R9Situation, totem = totemOf(f) === 'on'): OracleOffhand => ({ totem, pop: popOf(s) > DEMO_NOW, stale: !!s.ctx.stale });
/** The tests' whole drawing of a row: the engine, the offhand and the frame with the offhand's sides. */
const oracleRow = (state: RefState, o: OracleOffhand, id: Parameters<typeof picked>[0] = 'fable-boss'): RefLines =>
  frameOracle(offhandOracle(MIX.render(state, picked(id)), state, o), state, offhandSideOracle(state, o));

test('round 9: the layer on the engine\'s render (the boss option) draws each row span for span; the tests\' own layer does too', () => {
  for (const { f, s, lines } of ALL) {
    assert.deepEqual(plain(frameHud(offhandHud(renderHud(s.state, 'boss'), marksOf(f, s)))), lines, s.id);
    assert.deepEqual(plain(tuples(oracleRow(s.state, flagsOf(f, s)))), tuples(lines), `${s.id}: the tests' layer`);
  }
  // the marks: the totem as the rows show it, the stale count of e-stale, the credits out of t-out
  assert.deepEqual(ALL.map(({ f, s }) => { const m = marksOf(f, s); return [m.cash, m.totem, m.paying, m.out, m.stale]; }), [
    [50, 'slot5', false, false, false], [50, 'slot5', false, false, false], [50, 'offhand', false, false, false], [45, 'pop', true, false, false],
    [45, null, true, false, false], [0, null, true, true, false], [null, null, false, false, false],
    [50, null, false, false, false], [99, null, false, false, false], [100, null, false, false, false], [250, null, false, false, false],
    [1234, null, false, false, false], [12345, null, false, false, false], [0, null, false, false, false], [250, null, false, false, true],
  ]);
});

test('round 9: the emerald\'s rows with hud.totem on are the same rows with the totem in slot 5 (the credits are held and nothing is low)', () => {
  for (const { s, lines } of ALL.filter(({ f }) => f === 'emerald')) {
    const got = plain(frameHud(offhandHud(renderHud(s.state, 'boss'), marksOf('emerald', s, 'on'))));
    const want = plain(lines) as Span[][];
    const h = want.length - 2;
    want[h] = merge([...splitAt(want[h]!, 37)[0], ...SLOT5_TOTEM, ...splitAt(want[h]!, 41)[1]]);
    assert.deepEqual(got, want, s.id);
    assert.deepEqual(plain(tuples(oracleRow(s.state, flagsOf('emerald', s, true)))), tuples(want as RefLines), `${s.id}: the tests' layer`);
  }
});

test('round 9: paying.json\'s credits-out row is the offhand\'s; its other rows keep the engine\'s green sides', () => {
  PAYING.situations.forEach((s, i) => {
    const m = offhandMarks({ now: DEMO_NOW, extra: xv(DEMO_NOW - 30) }, { totem: 'on' }, fromState(s.state), 0);
    assert.equal(m.out, s.id === 'p-out', s.id);
    assert.equal(m.totem, null, `${s.id}: a window used up and no pop: no totem`);
    const side = text(cols(PAYING.rows[i]!.lines[3] as Span[], 9, 15));
    assert.equal(side.slice(0, 1) + side.slice(5), s.id === 'p-out' ? '  ' : '▐▌', s.id);
  });
});

test('the README\'s totem sample is the hotbar line of the totem-mix rows t-safe, t-h5-7 and t-pop', () => {
  const readme = readFileSync(join(REF, '..', '..', 'README.md'), 'utf8').replace(/\r\n/g, '\n');
  const block = /\n### The totem and the emerald\n[\s\S]*?```\n([\s\S]*?)\n```/.exec(readme);
  assert.ok(block, 'README has the totem sample');
  const bar = (id: string): string => { const l = ALL.find(({ s }) => s.id === id)!.lines; return text(l[l.length - 2] as Span[]); };
  assert.deepEqual(block[1]!.split('\n'), [bar('t-safe'), bar('t-h5-7'), bar('t-pop')]);
});

// ---------------------------------------------------------------------------------------------------------------------
// The real HUD path
// ---------------------------------------------------------------------------------------------------------------------

/** A UsageFile with these credits, fetched at `at`. */
const usageOf = (extra: { used: number; limit: number } | null, at: number): UsageFile =>
  ({ v: 1, at, extra: extra && { enabled: true, usedCents: Math.round(extra.used * 100), limitCents: Math.round(extra.limit * 100), currency: 'USD' }, scoped: [], lockUntil: 0 });
const viewOf = (l: unknown): LimitView | null => (l ? { pct: (l as { used: number }).used, left: (l as { left?: number }).left ?? null, dim: false } : null);
/**
 * The seeded shown-file a situation stepped from: for the pop the 5-hour at 1 lit heart 30 s ago; 30 s after it, the
 * pop that fired then; else none.
 */
function seeded(s: R9Situation): ShownFile | null {
  if (s.ctx.pop === 0) return { v: 1, at: DEMO_NOW - 30, h5: 1, week: 6, credits: 45, until: { pop: 0 } };
  if (s.ctx.pop === 30) return { v: 1, at: DEMO_NOW - 30, h5: 0, week: 6, credits: 45, until: { pop: DEMO_NOW } };
  return null;
}
/**
 * The demo's normal day with a situation's limits (live), credits (fetched 30 s or 2 hours ago) and a shown source that
 * steps the seeded file in memory (stepShown), recording what it was handed; no history and no git state.
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
    shown: (c) => { asked.push(c); return stepShown(seeded(s), now, c).next.until.pop; },
  });
}
/** The HUD with the boss bar, at the left edge, no name, the usage API on and 1.0's pickaxe (the rows predate the tiers, test/unit/hud-tiers.test.ts). */
const hudCfg = (hud: Partial<Config['hud']> = {}): Config =>
  ({ ...plainDefaults(), look: 'hud', hud: { ...plainDefaults().hud, fable: 'boss', pickaxe: 'plain', ...hud }, network: { ...plainDefaults().network, usageApi: true, scopedWeekly: true } });
const NORMAL_P = DEMOS.normal!.payload;

test('round 9: through the real HUD path (renderPayload, the adapter, the engine, the layers, the shown-file\'s step, the frame) each row span for span', () => {
  for (const { f, s, lines } of ALL) {
    const asked: ShownNow[] = [];
    // the rows were drawn on 1.0's hearts line: poison off
    const r = renderPayload(JSON.stringify(NORMAL_P), { env: { FORCE_COLOR: '3' }, config: hudCfg({ totem: totemOf(f), poison: 'off' }), sources: sources(s, asked), now: DEMO_NOW });
    assert.ok(r.hud, s.id);
    const { hist, ...rest } = plain(r.hud.input) as unknown as RefState;
    assert.deepEqual([rest, hist], [plain({ ...s.state, scoped: [] }), null], `${s.id}: the engine is handed the design's state`);
    assert.deepEqual(plain(r.hud.offhand), plain(marksOf(f, s)), `${s.id}: the marks`);
    assert.deepEqual(plain(r.hud.framed), lines, s.id);
    // the shown-file is asked only with hud.totem on, and handed what is drawn: the lit icons and the fresh dollars
    if (f === 'emerald') assert.deepEqual(asked, [], `${s.id}: hud.totem off asks nothing`);
    else assert.deepEqual(asked, [shownNow({ now: DEMO_NOW, h5: viewOf(s.state.h5), week: viewOf(s.state.week), extra: s.state.extra ? xv(fetchedOf(s)) : null }, fromState(s.state))], s.id);
  }
  // t-pop's step: the 5-hour went 1 → 0 with $45.80 held
  const asked: ShownNow[] = [], pop = TOTEM_MIX.situations.find((s) => s.id === 't-pop')!;
  renderPayload(JSON.stringify(NORMAL_P), { env: { FORCE_COLOR: '3' }, config: hudCfg(), sources: sources(pop, asked), now: DEMO_NOW });
  assert.deepEqual(asked, [{ h5: 0, week: 6, credits: 45, holds: true }]);
});

// ---------------------------------------------------------------------------------------------------------------------
// By hand: the marks
// ---------------------------------------------------------------------------------------------------------------------

test('the constants: the totem\'s gold, the ankh and the spark, the 900 s, the 1-10% band, the columns', () => {
  assert.deepEqual([TOTEM, EMERALD, SIDE, YELLOW, ANKH, SPARK, STALE_SECS, DYING, OFFHAND, SLOT5], ['#FFC83D', '#17DD62', '#5D5D5D', '#FFFF55', '☥', '✦', 900, 10, [9, 15], [36, 42]]);
  assert.deepEqual(SLOT5_TOTEM, [S('☥ ', TOTEM, WELL), S('  ', null, WELL)]);
  assert.deepEqual(NO_OFFHAND, { cash: null, paying: false, out: false, totem: null, stale: false });
  assert.deepEqual(defaults().hud.totem, 'on');
});

const STATE_LIST = Object.entries(STATES).map(([id, state]) => ({ id: `states.${id}`, state }));
const sitOf = (over: Partial<RefState>): Sit => fromState(st(over));
const on = { totem: 'on' } as const, off = { totem: 'off' } as const;
const H = (used: number): Partial<RefState> => ({ h5: { used, left: 3900, window: 18000 } });
const WK = (used: number): Partial<RefState> => ({ week: { used, left: 345540 } });
const X = (used: number, limit = 50): Partial<RefState> => ({ extra: { used, limit } });
const fresh = { now: DEMO_NOW, extra: xv(null) };

test('offhandMarks: the totem in slot 5 while safe, in the offhand at 1-10%, popping while a window is used up and now is before until.pop; none without credits', () => {
  const where = (over: Partial<RefState>, pop = 0, hud: Pick<Config['hud'], 'totem'> = on): TotemAt => offhandMarks(fresh, hud, sitOf(over), pop).totem;
  assert.equal(where({}), 'slot5', 'the normal day: 98% and 18%');
  assert.equal(where({ ...H(89), ...WK(40) }), 'slot5', '11% left: not dying');
  assert.equal(where({ ...H(90), ...WK(40) }), 'offhand', '10% left');
  assert.equal(where({ ...H(99.9), ...WK(40) }), 'offhand', '1% left (99.9 used reads 1)');
  assert.equal(where({ ...H(2), ...WK(97) }), 'offhand', 'the week at 3%');
  assert.equal(where({ ...H(2), ...WK(91) }), 'offhand', 'the week at 9%');
  // a window used up: the pop until its end, then nothing (the totem is used); used up and dying: paying wins
  assert.equal(where(H(100), DEMO_NOW + 1), 'pop');
  assert.equal(where(H(100), DEMO_NOW), null, 'the pop is over at until.pop');
  assert.equal(where(H(100), 0), null);
  assert.equal(where({ ...H(100), ...WK(95) }, 0), null, 'used up and the week dying: no swap');
  assert.equal(where({ ...H(40), ...WK(100) }, DEMO_NOW + 5), 'pop', 'the week used up pops too');
  assert.equal(where({}, DEMO_NOW + 5), 'slot5', 'a pop with nothing used up shows nothing (the window reset)');
  // the credits: more than $0, from a cent; none, $0, past the limit, no limit: no totem
  assert.equal(where(X(49.99)), 'slot5');
  assert.equal(where({ ...X(49.99), ...H(93) }), 'offhand');
  for (const [what, over] of [['$0 left', X(50)], ['past the limit', X(75)], ['no credits', { extra: null }], ['no limit', { extra: { used: 4, limit: 0 } }]] as const) {
    assert.equal(where(over), null, what);
    assert.equal(where({ ...over, ...H(93) }), null, `${what}, dying`);
    assert.equal(where({ ...over, ...H(100) }, DEMO_NOW + 5), null, `${what}, a pop`);
  }
  // hud.totem off: never
  for (const [over, pop] of [[{}, 0], [H(93), 0], [H(100), DEMO_NOW + 5]] as const) assert.equal(where(over, pop, off), null);
  // the rest of the marks: the dollars, paying, the credits out
  assert.deepEqual(offhandMarks(fresh, on, sitOf({ ...H(100), ...X(4.2) }), 0), { cash: 45, paying: true, out: false, totem: null, stale: false });
  assert.deepEqual(offhandMarks(fresh, off, sitOf({ ...H(100), ...X(50) }), 0), { cash: 0, paying: true, out: true, totem: null, stale: false }, 'credits out: no key');
  assert.deepEqual(offhandMarks(fresh, on, sitOf({ ...WK(100), ...X(80) }), 0), { cash: 0, paying: true, out: true, totem: null, stale: false }, 'past the limit is $0');
  assert.deepEqual(offhandMarks(fresh, on, sitOf(X(49.6)), 0), { cash: 0, paying: false, out: false, totem: 'slot5', stale: false }, '$0.40 is held, 0 whole dollars');
  assert.deepEqual(offhandMarks(fresh, on, sitOf({ extra: null }), DEMO_NOW + 5), NO_OFFHAND);
  assert.deepEqual(offhandMarks(fresh, on, sitOf({ extra: { used: 4, limit: null } }), 0), NO_OFFHAND, 'no limit: no offhand');
});

test('staleCredits: usage.json\'s credits more than 900 s old; stdin\'s are never old', () => {
  const at = (a: number | null): Pick<State, 'now' | 'extra'> => ({ now: DEMO_NOW, extra: xv(a) });
  assert.deepEqual([staleCredits(at(DEMO_NOW - 900)), staleCredits(at(DEMO_NOW - 901)), staleCredits(at(DEMO_NOW - 7200)), staleCredits(at(null)),
    staleCredits({ now: DEMO_NOW, extra: null }), staleCredits(at(DEMO_NOW + 60))], [false, true, true, false, false, false]);
  assert.equal(offhandMarks(at(DEMO_NOW - 901), on, sitOf({}), 0).stale, true);
});

test('shownNow: the live limits\' lit icons, the fresh credits\' whole dollars, and whether any are held', () => {
  const v = (dim: boolean): LimitView => ({ pct: 0, left: null, dim });
  const live = { now: DEMO_NOW, h5: v(false), week: v(false), extra: xv(null) };
  assert.deepEqual(shownNow(live, sitOf({})), { h5: 10, week: 2, credits: 50, holds: true });
  assert.deepEqual(shownNow(live, sitOf({ ...H(99.5), ...WK(100), ...X(49.6) })), { h5: 1, week: 0, credits: 0, holds: true });
  assert.deepEqual(shownNow(live, sitOf({ ...H(100), ...X(50) })), { h5: 0, week: 2, credits: 0, holds: false });
  assert.deepEqual(shownNow({ ...live, h5: v(true), week: v(true) }, sitOf({})), { h5: null, week: null, credits: 50, holds: true }, 'last-known: not kept');
  assert.deepEqual(shownNow({ ...live, h5: null, week: null }, sitOf({ h5: null, week: null })), { h5: null, week: null, credits: 50, holds: true });
  assert.deepEqual(shownNow(live, sitOf({ h5: null, week: null })), { h5: null, week: null, credits: 50, holds: true }, 'a view the engine reads as none');
  assert.deepEqual(shownNow({ ...live, extra: xv(DEMO_NOW - 901) }, sitOf({})).credits, null, 'old credits: not kept');
  assert.deepEqual(shownNow({ ...live, extra: null }, sitOf({ extra: null })), { h5: 10, week: 2, credits: null, holds: false });
});

// ---------------------------------------------------------------------------------------------------------------------
// By hand: the drawing
// ---------------------------------------------------------------------------------------------------------------------

/** The offhand's 6 cells and slot 5 with its sides as the layer draws them on the normal day's engine render with these credits. */
function drawn(m: Partial<OffhandMarks>, over: Partial<RefState> = {}, id: 'off' | 'boss' = 'off'): { off: Span[]; slot5: Span[]; line: Span[] } {
  const line = hot(offhandHud(renderHud(st(over), id), marks(m)));
  return { off: cols(line, 9, 15), slot5: cols(line, 36, 42), line };
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

test('the totem\'s moves: slot 5 (☥, no count) while safe; the offhand (☥ and the dollars, grey sides) at 1-10%; the pop (☥✦, gold sides); then the paying emerald', () => {
  const safe = drawn({ totem: 'slot5' });
  assert.deepEqual(safe.slot5, [DIV, ...SLOT5_TOTEM, DIV]);
  assert.deepEqual(safe.off, [DIV, G('◆ ', GREEN), B('50'), DIV], 'the emerald keeps the offhand');
  const dying = drawn({ totem: 'offhand' }, H(93));
  assert.deepEqual(dying.off, [DIV, G('☥ ', TOTEM), B('50'), DIV]);
  assert.deepEqual(dying.slot5, [DIV, S('    ', null, WELL), DIV], 'slot 5 empties');
  const pop = drawn({ totem: 'pop', paying: true, cash: 45 }, { ...H(100), ...X(4.2) });
  assert.deepEqual(pop.off, [side('▐', TOTEM), G(ANKH, TOTEM), G(SPARK, WHITE), B('45'), side('▌', TOTEM)]);
  assert.deepEqual(pop.slot5, [DIV, S('    ', null, WELL), DIV]);
  const after = drawn({ totem: null, paying: true, cash: 45 }, { ...H(100), ...X(4.2) });
  assert.deepEqual(after.off, [side('▐', GREEN), G('◆ ', GREEN), B('45'), side('▌', GREEN)], 'the engine\'s paying emerald');
  // the frame's edges follow the sides: gold for the pop, green after it, grey with the credits out
  const edge = (m: Partial<OffhandMarks>, over: Partial<RefState>): string | undefined => {
    const f = frameHud(offhandHud(renderHud(st(over), 'off'), marks(m)));
    return [cols(f[f.length - 3]!, 9, 15)[0]!.fg, cols(f[f.length - 1]!, 9, 15)[0]!.fg].join(' ');
  };
  assert.equal(edge({ totem: 'pop', paying: true, cash: 45 }, { ...H(100), ...X(4.2) }), `${TOTEM} ${TOTEM}`);
  assert.equal(edge({ paying: true, cash: 45 }, { ...H(100), ...X(4.2) }), `${GREEN} ${GREEN}`);
  assert.equal(edge({ paying: true, out: true, cash: 0 }, { ...H(100), ...X(50) }), `${SIDE} ${SIDE}`);
  assert.equal(edge({ totem: 'offhand' }, H(93)), `${SIDE} ${SIDE}`);
  // from $100: the totem's count is the emerald's three cells; the pop's ✦ gives way to them
  assert.deepEqual(drawn({ totem: 'offhand', cash: 150 }, { ...H(93), ...X(0, 150) }).off, [DIV, G(ANKH, TOTEM), B('150'), DIV]);
  assert.deepEqual(drawn({ totem: 'pop', paying: true, cash: 1234 }, { ...H(100), ...X(0, 1234) }).off, [side('▐', TOTEM), G(ANKH, TOTEM), B(' 1k'), side('▌', TOTEM)]);
  assert.deepEqual(drawn({ totem: 'pop', paying: true, cash: 99 }, { ...H(100), ...X(0, 99) }).off, [side('▐', TOTEM), G(ANKH, TOTEM), G(SPARK, WHITE), B('99'), side('▌', TOTEM)]);
  // under $1 ($0.999): the totem with no count, wherever it is; the emerald's well stays empty
  const cent = { ...X(49.001) };
  assert.deepEqual(drawn({ totem: 'slot5', cash: 0 }, cent).off, [DIV, S('    ', null, WELL), DIV]);
  assert.deepEqual(drawn({ totem: 'slot5', cash: 0 }, cent).slot5, [DIV, ...SLOT5_TOTEM, DIV]);
  assert.deepEqual(drawn({ totem: 'offhand', cash: 0 }, { ...cent, ...H(93) }).off, [DIV, G('☥ ', TOTEM), S('  ', null, WELL), DIV]);
  assert.deepEqual(drawn({ totem: 'pop', paying: true, cash: 0 }, { ...cent, ...H(100) }).off, [side('▐', TOTEM), G(ANKH, TOTEM), G(SPARK, WHITE), S('  ', null, WELL), side('▌', TOTEM)]);
  // stale: the totem's count is grey too
  assert.deepEqual(drawn({ totem: 'offhand', stale: true }, H(93)).off, [DIV, G('☥ ', TOTEM), B('50', GREY), DIV]);
  assert.deepEqual(drawn({ totem: 'pop', paying: true, cash: 45, stale: true }, { ...H(100), ...X(4.2) }).off[3], B('45', GREY));
  // the credits out: the sides grey around the empty well
  assert.deepEqual(drawn({ paying: true, out: true, cash: 0 }, { ...H(100), ...X(50) }).off, [DIV, S('    ', null, WELL), DIV]);
  // every other cell of the line is the engine's
  for (const [m, over] of [[{ totem: 'slot5' }, {}], [{ totem: 'offhand' }, H(93)], [{ totem: 'pop', paying: true, cash: 45 }, { ...H(100), ...X(4.2) }]] as const) {
    const eng = text(hot(renderHud(st(over), 'off'))), got = text(drawn(m, over).line);
    assert.equal(got.slice(0, 9) + got.slice(15, 36) + got.slice(42), eng.slice(0, 9) + eng.slice(15, 36) + eng.slice(42));
  }
});

test('the pop\'s 30 s through the HUD path: until.pop - 1 draws it, until.pop does not; the shown-file\'s step fires it on the 5-hour\'s 1 → 0', () => {
  const pop = TOTEM_MIX.situations.find((s) => s.id === 't-pop')!;
  const at = (now: number, seed: ShownFile | null): string => {
    const r = renderPayload(JSON.stringify(NORMAL_P), {
      env: { FORCE_COLOR: '3' }, config: hudCfg({ poison: 'off' }), now,
      sources: (p, cfg, n) => ({ ...sources(pop, [])(p, cfg, n), shown: (c) => stepShown(seed, n, c).next.until.pop }),
    });
    return text(cols(hot(r.hud!.framed.slice(0, -1)), 9, 15));
  };
  const fired: ShownFile = { v: 1, at: DEMO_NOW, h5: 0, week: 6, credits: 45, until: { pop: DEMO_NOW + 30 } };
  assert.equal(at(DEMO_NOW + 29, fired), '▐☥✦45▌');
  assert.equal(at(DEMO_NOW + 30, fired), '▐◆ 45▌');
  assert.equal(at(DEMO_NOW + 10, { ...fired, h5: 1, until: { pop: 0 } }), '▐☥✦45▌', 'fired by this render');
  assert.equal(at(DEMO_NOW + 10, { ...fired, h5: 0, until: { pop: 0 } }), '▐◆ 45▌', 'already at 0: no pop');
  assert.equal(at(DEMO_NOW + 10, null), '▐◆ 45▌', 'no shown-file: no pop');
});

test('hud.totem off draws 1.0\'s bytes wherever the keyless fixes have nothing to do: slot 5 and the offhand as the engine drew them', () => {
  for (const s of [...TOTEM_MIX.situations.filter((x) => x.id !== 't-out'), ...STATE_LIST]) {
    const sit = fromState(s.state);
    const m = offhandMarks({ now: DEMO_NOW, extra: xv(DEMO_NOW - 30) }, off, sit, DEMO_NOW + 10);
    const eng = renderHud(s.state, 'off');
    if ((sit.extra_left ?? 0) < 100) assert.deepEqual(offhandHud(eng, m), eng, s.id);
  }
  // and through renderPayload: the safe day with the totem off is the engine's lines and the frame, and the shown-file is
  // not asked; with it on, only slot 5 differs
  const safe = TOTEM_MIX.situations.find((s) => s.id === 't-safe')!, asked: ShownNow[] = [];
  const run = (totem: 'on' | 'off'): Span[][] =>
    renderPayload(JSON.stringify(NORMAL_P), { env: { FORCE_COLOR: '3' }, config: hudCfg({ totem }), sources: sources(safe, asked), now: DEMO_NOW }).hud!.framed;
  const r = renderPayload(JSON.stringify(NORMAL_P), { env: { FORCE_COLOR: '3' }, config: hudCfg({ totem: 'off' }), sources: sources(safe, asked), now: DEMO_NOW });
  assert.deepEqual(r.hud!.offhand, { cash: 50, paying: false, out: false, totem: null, stale: false });
  assert.deepEqual(r.hud!.framed, frameHud(r.hud!.lines));
  assert.deepEqual(asked, []);
  const [a, b] = [run('off'), run('on')];
  assert.deepEqual(a.map((l, i) => (i === a.length - 2 ? text(l).slice(0, 37) + text(l).slice(39) : text(l))), b.map((l, i) => (i === b.length - 2 ? text(l).slice(0, 37) + text(l).slice(39) : text(l))));
  assert.equal(asked.length, 1);
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
  same(renderHud(st({ extra: null }), 'off'), marks({ totem: 'slot5' }), 'no offhand drawn (no credits)');
  same(eng, { ...marks({ totem: 'slot5' }), cash: null }, 'no offhand in the marks');
  assert.deepEqual(offhandHud([], marks({ totem: 'slot5' })), []);
  // the boss bar on top: the hotbar is still the last line
  const fable = SPEC.round7.situations['fable-in-use']!.state;
  const boss = renderHud(fable, 'boss');
  assert.equal(boss.length, 5);
  const b = offhandHud(boss, marks({ totem: 'slot5' }));
  assert.deepEqual(cols(b[4]!, 36, 42), [DIV, ...SLOT5_TOTEM, DIV]);
  b.slice(0, 4).forEach((l, i) => assert.deepEqual(l, boss[i], `boss: line ${i}`));
  // a hand-built hotbar line: the engine's gutter with the offhand, slot 4, slot 5 and the rest
  const G2 = (off: Span[]): Span[] => [S('v2.1.306', '#555555'), S(' '), ...off, S(' ')];
  const OFF = [DIV, G('◆ ', GREEN), B('50'), DIV];
  const L = (off: Span[], s5: Span[] = [DIV, S('    ', null, WELL), DIV]): Span[][] => [[S('x')], [S('y')], [S('z')], [...G2(off), S(' '.repeat(20), null, WELL), ...s5, S(' ')]];
  const lineOf = (l: Span[][]): Span[] => l[3]!;
  assert.equal(cols(lineOf(L(OFF)), 36, 42).length, 3, 'slot 5 is at cols 36-41 of the hand-built line');
  assert.deepEqual(cols(offhandHud(L(OFF), marks({ totem: 'offhand' }))[3]!, 9, 15), [DIV, G('☥ ', TOTEM), B('50'), DIV], 'the hand-built line is the engine\'s shape');
  for (const [what, off] of [
    ['another count', [DIV, G('◆ ', GREEN), B('49'), DIV]],
    ['a yellow 99 where $50 is held', [DIV, G('◆ ', GREEN), B('99', YELLOW), DIV]],
    ['the emerald in another colour', [DIV, G('◆ ', TOTEM), B('50'), DIV]],
    ['green sides while not paying', [side('▐', GREEN), G('◆ ', GREEN), B('50'), side('▌', GREEN)]],
    ['a count not bold', [DIV, G('◆ ', GREEN), S('50', WHITE, WELL), DIV]],
    ['a wide glyph across col 9', [S('日'), G('◆ ', GREEN), B('50'), DIV]],
  ] as Array<[string, Span[]]>) {
    const lines = L(off), got = offhandHud(lines, marks({ totem: 'offhand' }));
    assert.deepEqual(got, lines, what);
  }
  // slot 5: only the plain empty well between the frame grey's sides takes the totem
  for (const [what, s5] of [
    ['an item in it', [DIV, G('⛏ ', GREEN), S('  ', null, WELL), DIV]],
    ['another well colour', [DIV, S('    ', null, '#000000'), DIV]],
    ['ink on the well', [DIV, S('    ', WHITE, WELL), DIV]],
    ['a gold side', [side('▐', TOTEM), S('    ', null, WELL), DIV]],
    ['a wide glyph in it', [DIV, S('日'), S('  ', null, WELL), DIV]],
  ] as Array<[string, Span[]]>) {
    const lines = L(OFF, s5);
    assert.deepEqual(offhandHud(lines, marks({ totem: 'slot5' })), lines, what);
  }
  // the offhand drawn though slot 5 is not the plain well, and slot 5 drawn though the offhand is not the engine's
  assert.deepEqual(cols(offhandHud(L(OFF, [DIV, S('    ', WHITE, WELL), DIV]), marks({ totem: 'offhand' }))[3]!, 9, 15)[1], G('☥ ', TOTEM));
  assert.deepEqual(cols(offhandHud(L([DIV, G('◆ ', GREEN), B('49'), DIV]), marks({ totem: 'slot5' }))[3]!, 36, 42), [DIV, ...SLOT5_TOTEM, DIV]);
  // a wide glyph across col 36, or across col 9 on the offhand's side: that part is left as it is
  const across36: Span[][] = [[S('x')], [S('y')], [S('z')], [...G2(OFF), S(' '.repeat(19), null, WELL), S('日', null, WELL), S('   ', null, WELL), DIV, S(' ')]];
  assert.deepEqual(offhandHud(across36, marks({ totem: 'slot5' })), across36);
  const across9: Span[][] = [[S('x')], [S('y')], [S('z')], [S('v2.1.30', '#555555'), S(' '), S('日', null, SIDE), ...OFF.slice(1), S(' ')]];
  assert.deepEqual(offhandHud(across9, marks({ totem: 'offhand' })), across9);
  // a short hotbar line (nothing at col 36): the offhand only
  const short = [[S('x')], [...G2(OFF)]];
  assert.deepEqual(offhandHud(short, marks({ totem: 'slot5' })), short);
});

// ---------------------------------------------------------------------------------------------------------------------
// Bytes and glyphs
// ---------------------------------------------------------------------------------------------------------------------

test('bytes: every round-9 row at 24-bit and 256 colours is the independent encoder\'s', () => {
  for (const { s, lines } of [...ALL, ...PAYING.situations.map((s, i) => ({ s, lines: PAYING.rows[i]!.lines }))]) {
    for (const depth of ['truecolor', '256'] as const) assert.equal(encode(lines as Span[][], depth, { bold: true, nbsp: true }), sgrOracle(lines, { depth }), `${s.id} ${depth}`);
  }
  const row = (id: string): Span[][] => ALL.find(({ s }) => s.id === id)!.lines as Span[][];
  assert.ok(encode(row('t-safe'), 'truecolor', { bold: true, nbsp: false }).includes('\x1b[38;2;255;200;61;48;2;32;30;7m☥ \x1b[0m'), 'the totem in slot 5');
  assert.ok(encode(row('t-pop'), 'truecolor', { bold: true, nbsp: false }).includes('\x1b[38;2;255;200;61;48;2;93;93;93m▐\x1b[0m\x1b[38;2;255;200;61;48;2;32;30;7m☥\x1b[0m\x1b[38;2;255;255;255;48;2;32;30;7m✦\x1b[0m'), 'the pop');
  assert.ok(encode(row('e-1234'), '256', { bold: true, nbsp: false }).includes('\x1b[1;38;5;231;48;5;234m 1k\x1b[0m'), 'the thousands at 256 colours');
  assert.ok(encode(row('e-stale'), 'truecolor', { bold: true, nbsp: false }).includes('\x1b[1;38;2;170;170;170;48;2;32;30;7m250\x1b[0m'), 'the stale count');
});

test('glyphs: ☥ and ✦ are 1 cell and on glyphs --hud, after ∞; every glyph on the rows\' offhand and slot 5 is listed', () => {
  for (const g of [ANKH, SPARK]) assert.equal(cellWidth(g), 1, g);
  const names = HUD_GLYPHS.map(([g]) => g);
  assert.deepEqual(names.slice(names.indexOf('∞'), names.indexOf('∞') + 4), ['∞', '☥', '✦', '▤'], 'then the agents\' glyphs (test/unit/hud-agents.test.ts), before ·');
  assert.match(HUD_GLYPHS.find(([g]) => g === ANKH)![1], /totem.*hud\.totem/i);
  assert.match(HUD_GLYPHS.find(([g]) => g === SPARK)![1], /pop/);
  const drawnGlyphs = new Set(ALL.flatMap(({ lines }) => {
    const l = lines[lines.length - 2] as Span[];
    return [...text(cols(l, 9, 15)) + text(cols(l, 36, 42))].filter((g) => g.codePointAt(0)! > 0x7f);
  }));
  assert.deepEqual([...drawnGlyphs].sort(), ['◆', '▌', '▐', '☥', '✦'].sort());
  for (const g of drawnGlyphs) assert.ok(names.includes(g), g);
});

// ---------------------------------------------------------------------------------------------------------------------
// Against the tests' own layer
// ---------------------------------------------------------------------------------------------------------------------

/** The src marks and the tests' layer's input for one set of flags on a state. */
function both(state: unknown, f: OffFlags): [OffhandMarks, OracleOffhand] {
  const m = offhandMarks({ now: DEMO_NOW, extra: xv(f.stale ? DEMO_NOW - 901 : DEMO_NOW - 30) }, { totem: f.totem ? 'on' : 'off' }, fromState(state), f.pop ? DEMO_NOW + 5 : 0);
  return [m, { totem: f.totem, pop: f.pop, stale: f.stale }];
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
  const n = { slot5: 0, offhand: 0, pop: 0, out: 0, three: 0, stale: 0, kept: 0 };
  for (const [what, state] of inputs()) {
    for (const id of FABLE_IDS) {
      const f = offhandFlags(r), [m, o] = both(state, f);
      const eng = renderHud(state, id);
      const got = frameHud(offhandHud(eng, m));
      const want = frameOracle(offhandOracle(MIX.render(state, picked(`fable-${id}`)), state, o), state, offhandSideOracle(state, o));
      assert.deepEqual(tuples(got as RefLines), plain(tuples(want)), `${what} ${id} ${JSON.stringify(f)}`);
      assert.equal(m.totem, totemOracle(state, o), `${what}: the totem`);
      for (const l of got) assert.ok(cellWidth(text(l)) <= 110 && !/^\s/u.test(text(l)), `${what} ${id}: ${cellWidth(text(l))} cells`);
      if (m.totem) n[m.totem]++;
      if (m.out) n.out++;
      if (m.cash !== null && m.cash >= 100) n.three++;
      if (m.stale && m.cash !== null && m.cash >= 2) n.stale++;
      if (m.cash !== null && !m.totem && !m.out && !(m.cash >= 100) && !(m.stale && m.cash >= 2)) { assert.deepEqual(got, frameHud(eng), `${what}: nothing to draw`); n.kept++; }
    }
  }
  assert.ok(n.slot5 > 100 && n.offhand > 50 && n.pop > 20 && n.out > 20 && n.three > 100 && n.stale > 100 && n.kept > 50, JSON.stringify(n));
});

test('QUIET_OFFHAND: the tests\' layer with nothing to draw is the engine\'s render; no offhand, no change', () => {
  const lines = MIX.render(NORMAL, picked('fable-off'));
  assert.deepEqual(plain(offhandOracle(lines, NORMAL, QUIET_OFFHAND)), plain(lines));
  assert.deepEqual(plain(offhandOracle(lines, st({ extra: null }), { totem: true, pop: true, stale: true })), plain(lines));
  assert.deepEqual(offhandOracle([], NORMAL, { ...QUIET_OFFHAND, totem: true }), []);
  assert.equal(offhandSideOracle(st({ extra: null }), QUIET_OFFHAND), null);
});
