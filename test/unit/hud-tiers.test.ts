// The pickaxe's tiers (src/hud/tiers.ts, SPEC §0.12, 1.1.0): the pick from design round 9c, span for span against the
// design's own rows (test/reference/round9/pickaxe.json: pick-tiers-full, hud.pickaxe tiers, the default), with
// no limit reset held as the rows predate the totem, and with one held the same rows and the totem waiting in slot 5; the five engine
// rows through the layer on the engine's render, through the tests' own layer (test/hud/tiers-oracle.ts, which finds
// the ink and the numeral from the state) and through the real HUD path (renderPayload with each situation's model and
// effort), and the lineup row, which the design's builder composed from the five models' own slot 1 and is no engine
// state, rebuilt the same way from Hungerbar's renders; by hand on the inks, the families, Opus's unchanged pickaxe,
// no numeral, an unknown model, hud.pickaxe plain (1.0's bytes) and every slot the layer must leave as it is; the
// bytes at both depths; and against the tests' layer on the reference states, the time-lapse and seeded fuzz states x
// both values x the 5 fable ids.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { defaults, type Config } from '../../src/config.ts';
import { DEMOS, DEMO_NOW, demoSources } from '../../src/demo.ts';
import { FABLE_IDS, renderHud } from '../../src/hud/fable.ts';
import { frameHud } from '../../src/hud/frame.ts';
import { fromState } from '../../src/hud/input.ts';
import { encode } from '../../src/hud/look.ts';
import { ENCH, F2SEL_L, F2SEL_R, GLINT, GREY, TIER } from '../../src/hud/mix.ts';
import { offhandHud, offhandMarks } from '../../src/hud/offhand.ts';
import { idol, totemHud } from '../../src/hud/totem.ts';
import { merge, S, splitAt, type Span } from '../../src/hud/spans.ts';
import { SLOT1, STONE, tierMarks, tierOf, TIERS, tiersHud, type TierMarks } from '../../src/hud/tiers.ts';
import { cellWidth } from '../../src/hud/wt.ts';
import type { Payload } from '../../src/payload.ts';
import { renderPayload } from '../../src/render.ts';
import type { Sources } from '../../src/state.ts';
import { frameOracle } from '../hud/frame-oracle.ts';
import { chance, mulberry32, state as fuzzState } from '../hud/fuzz.ts';
import { MIX, picked, plain, REF, SESSION, SOURCES, SPEC, STATES, tuples, type RefLines, type RefState } from '../hud/ref.ts';
import { sgrOracle } from '../hud/sgr-oracle.ts';
import { tierInkOracle, tiersOracle } from '../hud/tiers-oracle.ts';
import { plainDefaults } from '../plain-config.ts';

const text = (l: readonly Span[]): string => l.map((s) => s.t).join('');
const NORMAL: RefState = STATES.normal;
const st = (over: Partial<RefState>): RefState => ({ ...NORMAL, ...over });
/** Cols [from, to) of a line, as spans. */
const cols = (line: readonly Span[], from: number, to: number): Span[] => splitAt(splitAt(line, from)[1], to - from)[0];
/** The hotbar line of an unframed render (the last line). */
const hot = (lines: readonly (readonly Span[])[]): Span[] => [...lines[lines.length - 1]!];
const modelOf = (state: unknown): string => fromState(state).model;
const marksFor = (state: unknown): TierMarks => tierMarks({ pickaxe: 'tiers' }, fromState(state));

// ---------------------------------------------------------------------------------------------------------------------
// The design's rows
// ---------------------------------------------------------------------------------------------------------------------

interface R9cSituation { id: string; label: string; note: string; state: RefState | null; ctx: { lineup?: string[] } }
interface R9c {
  note: string;
  intro: string;
  optionNote: string;
  source: { file: string; sha256: string; option: string };
  id: string;
  situations: R9cSituation[];
  rows: Array<{ label: string; situation: string; roles: string[]; lines: RefLines }>;
}
const PICK = JSON.parse(readFileSync(join(REF, 'round9', 'pickaxe.json'), 'utf8')) as R9c;
/** The five engine situations and their rows; the lineup is apart. */
const ENGINE = PICK.situations.flatMap((s, i) => (s.state ? [{ s: s as R9cSituation & { state: RefState }, lines: PICK.rows[i]!.lines }] : []));
const LINEUP = PICK.rows.find((r) => r.situation === 'p-lineup')!;
const INKS = { netherite: '#857579', diamond: '#55FFFF', iron: '#C6C6C6', gold: '#FFAA00', stone: '#AAAAAA' } as const;

test('round 9c: the vendored rows are the pick (pick-tiers-full): five engine states and the lineup, which is none', () => {
  assert.equal(PICK.id, 'pick-tiers-full');
  assert.equal(PICK.source.option, PICK.id);
  assert.equal(PICK.source.file, 'round9/pickaxe.json');
  assert.equal((SOURCES.files['round9/pickaxe.json']!.originSha256 as Record<string, string>)['round9/pickaxe.json'], PICK.source.sha256);
  assert.deepEqual(PICK.situations.map((s) => s.id), ['p-fable', 'p-opus', 'p-sonnet', 'p-haiku', 'p-codex', 'p-lineup']);
  assert.deepEqual(PICK.rows.map((r) => r.situation), PICK.situations.map((s) => s.id));
  assert.deepEqual(PICK.rows.map((r) => r.label), PICK.situations.map((s) => s.label));
  // the lineup has no state: it names the five models; its row is one line and its role is the lineup
  const lineup = PICK.situations[5]!;
  assert.deepEqual([lineup.state, lineup.ctx.lineup], [null, ['Fable 5.1', 'Opus 5.5', 'Sonnet 4.5', 'Haiku 4.5', 'Codex']]);
  assert.deepEqual([LINEUP.roles, LINEUP.lines.length], [['lineup'], 1]);
  assert.match(PICK.note, /p-lineup, is no engine state/);
  assert.match(PICK.note, /hud\.totem off/);
  // the engine rows: 6 lines with the boss bar (Fable in use), else 5; slot 1 in the tier's ink, the numeral too
  assert.deepEqual(ENGINE.map(({ lines }) => lines.length), [6, 5, 5, 5, 5]);
  for (const { s, lines } of ENGINE) for (const l of lines) assert.ok(cellWidth(text(l as Span[])) <= 110 && !/^\s/u.test(text(l as Span[])), s.id);
  const slot = (lines: RefLines): string => JSON.stringify(cols(lines[lines.length - 2] as Span[], 17, 21));
  const want = (ink: string, glint: string, n: string): string => JSON.stringify([S('⛏ ', ink, glint), S(`${n} `, ink, glint, true)]);
  assert.deepEqual(ENGINE.map(({ lines }) => slot(lines)), [
    want(INKS.netherite, GLINT.max!, 'Ⅴ'), want(INKS.diamond, GLINT.high!, 'Ⅲ'), want(INKS.iron, GLINT.high!, 'Ⅲ'), want(INKS.gold, GLINT.high!, 'Ⅲ'), want(INKS.stone, GLINT.high!, 'Ⅲ'),
  ]);
  assert.equal(text(LINEUP.lines[0] as Span[]), '▐⛏ Ⅲ ▌ Fable   ▐⛏ Ⅲ ▌ Opus   ▐⛏ Ⅲ ▌ Sonnet   ▐⛏ Ⅲ ▌ Haiku   ▐⛏ Ⅲ ▌ Codex');
});

test('round 9c: the layer on the engine\'s render (the boss option) draws each engine row span for span; the tests\' own layer does too', () => {
  for (const { s, lines } of ENGINE) {
    assert.deepEqual(plain(frameHud(tiersHud(renderHud(s.state, 'boss'), marksFor(s.state), modelOf(s.state)))), lines, s.id);
    assert.deepEqual(plain(tuples(frameOracle(tiersOracle(MIX.render(s.state, picked('fable-boss')), s.state, true), s.state))), tuples(lines), `${s.id}: the tests' layer`);
  }
  assert.deepEqual(ENGINE.map(({ s }) => marksFor(s.state)), [
    { tier: 'netherite', ink: INKS.netherite }, { tier: 'diamond', ink: INKS.diamond }, { tier: 'iron', ink: INKS.iron }, { tier: 'gold', ink: INKS.gold }, { tier: 'stone', ink: INKS.stone },
  ]);
});

test('round 9c: the lineup row, composed as its builder did: slot 1 of each model\'s own render at effort high, side by side with its name', () => {
  // build-9c.cjs: each model at effort high (Fable with its scoped week, as p-fable), cols 16-21 of its hotbar line, then
  // ' <family>' in grey and three spaces between; this is a check of the builder's composition, not an engine state
  const opus = ENGINE.find(({ s }) => s.id === 'p-opus')!.s.state;
  const parts: Span[] = [];
  ['Fable 5.1', 'Opus 5.5', 'Sonnet 4.5', 'Haiku 4.5', 'Codex'].forEach((model, i, all) => {
    const state = { ...opus, model, ...(model.startsWith('Fable') ? { scoped: [{ name: 'Fable', used: 35, left: 345600 }] } : {}) };
    const line = hot(tiersHud(renderHud(state, 'boss'), marksFor(state), modelOf(state)));
    parts.push(...cols(line, SLOT1[0], SLOT1[1]), S(` ${model.split(' ')[0]}${i < all.length - 1 ? '   ' : ''}`, GREY));
  });
  assert.deepEqual(plain(merge(parts)), LINEUP.lines[0]);
});

test('round 9c: the rows with a limit reset held (hud.totem on) are the same rows with the totem waiting in slot 5', () => {
  for (const { s, lines } of ENGINE) {
    const em = offhandMarks({ now: DEMO_NOW, extra: { used: 0, limit: 50, currency: 'USD', pct: 0, at: null } }, fromState(s.state));
    const held = (l: Span[][]): Span[][] => totemHud(offhandHud(l, em), { at: 'slot5', mark: null }, em, fromState(s.state));
    const got = plain(frameHud(tiersHud(held(renderHud(s.state, 'boss')), marksFor(s.state), modelOf(s.state))));
    const want = plain(lines) as Span[][];
    const h = want.length - 2;
    want[h] = merge([...splitAt(want[h]!, 37)[0], ...idol(null), ...splitAt(want[h]!, 41)[1]]);
    assert.deepEqual(got, want, s.id);
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// The real HUD path
// ---------------------------------------------------------------------------------------------------------------------

/** The demo's normal day with no history and no git state (the design draws ⎇ grey and no terrain). */
function sources(): (p: Payload, cfg: Config, now: number) => Sources {
  const { status: _status, op: _op, ...git } = DEMOS.normal!.git;
  return (p, cfg, now) => ({ ...demoSources(DEMOS.normal!)(p, cfg, now), git: () => ({ ...git }), history: () => null });
}
/** The payload of a situation: the normal day with its model and effort. */
const payloadOf = (s: R9cSituation & { state: RefState }): Payload => ({ ...DEMOS.normal!.payload, model: { display_name: s.state.model as string }, effort: { level: s.state.effort as string } });
/** The HUD with Fable's boss bar, at the left edge, no name, no totem (the rows predate it); scopedWeekly only for Fable's week. */
const hudCfg = (hud: Partial<Config['hud']>, scoped: boolean): Config =>
  ({ ...plainDefaults(), look: 'hud', hud: { ...plainDefaults().hud, fable: 'boss', totem: 'off', ...hud }, network: { ...plainDefaults().network, usageApi: true, scopedWeekly: scoped } });

test('round 9c: through the real HUD path (renderPayload, the adapter, the engine, the tiers, the frame) each engine row span for span; plain draws 1.0\'s', () => {
  for (const { s, lines } of ENGINE) {
    const fable = s.id === 'p-fable';
    const r = renderPayload(JSON.stringify(payloadOf(s)), { env: { FORCE_COLOR: '3' }, config: hudCfg({ pickaxe: 'tiers' }, fable), sources: sources(), now: DEMO_NOW });
    assert.ok(r.hud, s.id);
    const { hist, ...rest } = plain(r.hud.input) as unknown as RefState;
    assert.deepEqual([rest, hist], [plain({ ...s.state, scoped: s.state.scoped ?? [] }), null], `${s.id}: the engine is handed the design's state`);
    assert.deepEqual(r.hud.tiers, marksFor(s.state), `${s.id}: the marks`);
    assert.deepEqual(plain(r.hud.framed), lines, s.id);
    // hud.pickaxe plain: 1.0's bytes, the engine's lines framed
    const p = renderPayload(JSON.stringify(payloadOf(s)), { env: { FORCE_COLOR: '3' }, config: hudCfg({ pickaxe: 'plain' }, fable), sources: sources(), now: DEMO_NOW });
    assert.equal(p.hud!.tiers, null);
    assert.deepEqual(p.hud!.framed, frameHud(p.hud!.lines), `${s.id}: plain is 1.0's`);
  }
  assert.equal(defaults().hud.pickaxe, 'tiers', 'Kamal\'s pick is the default');
});

// ---------------------------------------------------------------------------------------------------------------------
// By hand
// ---------------------------------------------------------------------------------------------------------------------

test('the tiers: Minecraft\'s words and inks by family, stone for any other model; plain is no marks', () => {
  assert.deepEqual(TIERS, { Fable: ['netherite', INKS.netherite], Opus: ['diamond', INKS.diamond], Sonnet: ['iron', INKS.iron], Haiku: ['gold', INKS.gold] });
  assert.deepEqual(STONE, ['stone', INKS.stone]);
  assert.equal(TIER.Opus, INKS.diamond, 'Opus\'s 1.0 pickaxe is already diamond');
  assert.equal(GREY, INKS.stone, 'and an unknown model\'s already stone');
  assert.deepEqual(SLOT1, [16, 22]);
  for (const [model, tier] of [
    ['Fable 5.1', 'netherite'], ['claude-fable-5-1', 'netherite'], ['Opus 5.5', 'diamond'], ['Claude Opus 4.1 (1M context)', 'diamond'], ['claude-opus-5-5[1m]', 'diamond'],
    ['Sonnet 4.5', 'iron'], ['SONNET', 'iron'], ['Haiku 4.5', 'gold'], ['claude-haiku-4-5', 'gold'], ['Codex', 'stone'], ['Claude', 'stone'], ['Fabled 2', 'stone'],
    ['opusx', 'stone'], ['', 'stone'], ['constructor', 'stone'], ['__proto__', 'stone'],
  ] as const) assert.deepEqual(tierOf(model), { tier, ink: INKS[tier] }, model);
  assert.equal(tierMarks({ pickaxe: 'plain' }, fromState(NORMAL)), null);
  assert.deepEqual(tierMarks({ pickaxe: 'tiers' }, fromState(NORMAL)), { tier: 'diamond', ink: INKS.diamond });
});

test('tiersHud: the pickaxe and the numeral take the ink; Opus and an unknown model keep their pickaxe; no effort, no numeral; plain changes nothing', () => {
  const slot = (state: RefState, m: TierMarks = marksFor(state)): Span[] => cols(hot(tiersHud(renderHud(state, 'off'), m, modelOf(state))), 16, 22);
  const g = GLINT.high!;
  assert.deepEqual(slot(st({ model: 'Haiku 4.5' })), [F2SEL_L, S('⛏ ', INKS.gold, g), S('Ⅲ ', INKS.gold, g, true), F2SEL_R]);
  assert.deepEqual(slot(st({ model: 'Sonnet 4.5', effort: 'low' })), [F2SEL_L, S('⛏ ', INKS.iron, GLINT.low), S('Ⅰ ', INKS.iron, GLINT.low, true), F2SEL_R]);
  const engine = (state: RefState): Span[] => cols(hot(renderHud(state, 'off')), 16, 22);
  assert.deepEqual(slot(NORMAL)[1], engine(NORMAL)[1], 'Opus: the pickaxe\'s bytes as 1.0\'s');
  assert.deepEqual(slot(NORMAL)[2], S('Ⅲ ', INKS.diamond, g, true), 'only the numeral leaves the pink');
  assert.deepEqual(engine(NORMAL)[2], S('Ⅲ ', ENCH, g, true));
  assert.deepEqual(slot(st({ model: 'Codex' }))[1], engine(st({ model: 'Codex' }))[1], 'stone: as 1.0');
  assert.deepEqual(slot(st({ model: 'Codex' }))[2], S('Ⅲ ', INKS.stone, g, true), 'its numeral stone too');
  // no effort, or one the engine does not know: no numeral, only the pickaxe
  for (const effort of [null, 'turbo', '']) {
    const s = st({ model: 'Fable 5.1', effort });
    assert.deepEqual(slot(s).slice(1, 3), [S('⛏ ', INKS.netherite, engine(s)[1]!.bg), engine(s)[2]], String(effort));
  }
  // plain: the lines as they are, a copy, on every reference state
  for (const [what, state] of Object.entries(STATES)) {
    const eng = renderHud(state, 'off'), got = tiersHud(eng, null, modelOf(state));
    assert.deepEqual(got, eng, what);
    got.forEach((l, i) => assert.notEqual(l, eng[i]));
  }
  // the boss bar on top: the hotbar line is still the last
  const fable = SPEC.round7.situations['fable-in-use']!.state;
  const boss = renderHud(fable, 'boss');
  const b = tiersHud(boss, marksFor(fable), modelOf(fable));
  assert.equal(b.length, 5);
  assert.deepEqual(cols(b[4]!, 17, 19), [S('⛏ ', INKS.netherite, GLINT.high)]);
  b.slice(0, 4).forEach((l, i) => assert.deepEqual(l, boss[i]));
});

test('tiersHud: a slot 1 not of the engine\'s shape for this model is left as it is', () => {
  const g = GLINT.high!;
  const L = (slot: Span[]): Span[][] => [[S('x')], [S('y')], [S('z')], [S('v2.1.306', '#555555'), S(' '.repeat(8)), ...slot, S(' ', null, '#5D5D5D')]];
  const OK = [F2SEL_L, S('⛏ ', TIER.Haiku!, g), S('Ⅲ ', ENCH, g, true), F2SEL_R];
  const m: TierMarks = { tier: 'gold', ink: INKS.gold };
  assert.deepEqual(cols(tiersHud(L(OK), m, 'Haiku 4.5')[3]!, 16, 22), [F2SEL_L, S('⛏ ', INKS.gold, g), S('Ⅲ ', INKS.gold, g, true), F2SEL_R], 'the hand-built slot is the engine\'s shape');
  for (const [what, slot, model] of [
    ['another model\'s ink', OK, 'Opus 5.5'],
    ['the pickaxe in another ink', [F2SEL_L, S('⛏ ', '#FFFFFF', g), S('Ⅲ ', ENCH, g, true), F2SEL_R], 'Haiku 4.5'],
    ['a numeral not bold', [F2SEL_L, S('⛏ ', TIER.Haiku!, g), S('Ⅲ ', ENCH, g), F2SEL_R], 'Haiku 4.5'],
    ['a numeral in another ink', [F2SEL_L, S('⛏ ', TIER.Haiku!, g), S('Ⅲ ', '#FFFFFF', g, true), F2SEL_R], 'Haiku 4.5'],
    ['another glint under the numeral', [F2SEL_L, S('⛏ ', TIER.Haiku!, g), S('Ⅲ ', ENCH, GLINT.max, true), F2SEL_R], 'Haiku 4.5'],
    ['no glint', [F2SEL_L, S('⛏ ', TIER.Haiku!), S('Ⅲ ', ENCH, null, true), F2SEL_R], 'Haiku 4.5'],
    ['not a numeral', [F2SEL_L, S('⛏ ', TIER.Haiku!, g), S('X ', ENCH, g, true), F2SEL_R], 'Haiku 4.5'],
    ['inked blanks', [F2SEL_L, S('⛏ ', TIER.Haiku!, g), S('  ', ENCH, g), F2SEL_R], 'Haiku 4.5'],
    ['no mint side', [S('▐', '#FFFFFF', '#5D5D5D'), S('⛏ ', TIER.Haiku!, g), S('Ⅲ ', ENCH, g, true), F2SEL_R], 'Haiku 4.5'],
    ['no right side', [F2SEL_L, S('⛏ ', TIER.Haiku!, g), S('Ⅲ ', ENCH, g, true), S('▌', '#FFFFFF', '#5D5D5D')], 'Haiku 4.5'],
    ['another tool', [F2SEL_L, S('⚒ ', TIER.Haiku!, g), S('Ⅲ ', ENCH, g, true), F2SEL_R], 'Haiku 4.5'],
    ['five spans', [F2SEL_L, S('⛏', TIER.Haiku!, g), S(' ', TIER.Haiku!, null), S('Ⅲ', ENCH, g, true), S('▌', '#D5E8D0', '#5D5D5D')], 'Haiku 4.5'],
  ] as Array<[string, Span[], string]>) {
    const lines = L(slot);
    assert.deepEqual(tiersHud(lines, m, model), lines, what);
  }
  const short = [[S('x')], [S('v2.1.306')]];
  assert.deepEqual(tiersHud(short, m, 'Haiku 4.5'), short, 'no slot 1');
  assert.deepEqual(tiersHud([[S('日'.repeat(8)), S('⛏ ', TIER.Haiku!, g)]], m, 'Haiku 4.5'), [[S('日'.repeat(8)), S('⛏ ', TIER.Haiku!, g)]], 'the slot not at col 16');
  assert.deepEqual(tiersHud([], m, 'Haiku 4.5'), []);
});

// ---------------------------------------------------------------------------------------------------------------------
// Bytes
// ---------------------------------------------------------------------------------------------------------------------

test('bytes: every round-9c row at 24-bit and 256 colours is the independent encoder\'s; the netherite numeral\'s own SGR', () => {
  for (const r of PICK.rows) {
    for (const depth of ['truecolor', '256'] as const) assert.equal(encode(r.lines as Span[][], depth, { bold: true, nbsp: true }), sgrOracle(r.lines, { depth }), `${r.situation} ${depth}`);
  }
  const fable = ENGINE[0]!.lines as Span[][];
  assert.ok(encode(fable, 'truecolor', { bold: true, nbsp: false }).includes('\x1b[38;2;133;117;121;48;2;72;32;92m⛏ \x1b[0m\x1b[1;38;2;133;117;121;48;2;72;32;92mⅤ \x1b[0m'), 'netherite on the deepest glint');
});

// ---------------------------------------------------------------------------------------------------------------------
// Against the tests' own layer
// ---------------------------------------------------------------------------------------------------------------------

function* inputs(): Generator<[string, unknown]> {
  for (const [k, s] of Object.entries(STATES)) yield [`states.${k}`, s];
  for (const [k, s] of Object.entries(SPEC.round7.situations)) yield [`round7.${k}`, s.state];
  for (const { s } of ENGINE) yield [`round9c.${s.id}`, s.state];
  for (let i = 0; i < SESSION.frames.length; i += 7) yield [`frame ${i}`, SESSION.frames[i]];
  const r = mulberry32(0x71e75);
  const bases = [...Object.values(STATES), ...Object.values(SPEC.round7.situations).map((s) => s.state), ...ENGINE.map(({ s }) => s.state)];
  for (let k = 0; k < 400; k++) yield [`fuzz state #${k}`, fuzzState(r, bases)];
}

test('the layer equals the tests\' layer on the reference states, the time-lapse and fuzz, x tiers or plain x the 5 fable ids', () => {
  const r = mulberry32(0x7135);
  const n: Record<string, number> = { netherite: 0, diamond: 0, iron: 0, gold: 0, stone: 0, plain: 0, numeral: 0, bare: 0 };
  for (const [what, state] of inputs()) {
    for (const id of FABLE_IDS) {
      const tiers = chance(r, 0.8);
      const m = tierMarks({ pickaxe: tiers ? 'tiers' : 'plain' }, fromState(state));
      const eng = renderHud(state, id);
      const got = frameHud(tiersHud(eng, m, modelOf(state)));
      const want = frameOracle(tiersOracle(MIX.render(state, picked(`fable-${id}`)), state, tiers), state);
      assert.deepEqual(tuples(got as RefLines), plain(tuples(want)), `${what} ${id} ${tiers}`);
      assert.equal(m?.ink ?? null, tierInkOracle(state, tiers), `${what}: the ink`);
      if (!m) { n.plain!++; assert.deepEqual(got, frameHud(eng)); continue; }
      n[m.tier]!++;
      if (/[ⅠⅡⅢⅣⅤ]/u.test(text(cols(hot(eng), 19, 20)))) n.numeral!++;
      else n.bare!++;
      // nothing but cols 17-20 of the hotbar line changes
      const a = hot(got.slice(0, -1)), b = hot(eng);
      assert.equal(text(a), text(b));
      assert.deepEqual([...cols(a, 0, 17), ...cols(a, 21, 200)], [...cols(b, 0, 17), ...cols(b, 21, 200)], `${what}: only slot 1's ink`);
    }
  }
  assert.ok(n.netherite! > 50 && n.diamond! > 100 && n.iron! > 50 && n.gold! > 30 && n.stone! > 100 && n.plain! > 300 && n.numeral! > 500 && n.bare! > 100, JSON.stringify(n));
});
