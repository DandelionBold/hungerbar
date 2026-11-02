// The agents at work (src/hud/agents.ts, SPEC §0.12, 1.1.0): the picks from design round 9b, span for span against the
// design's own rows (test/reference/round9/agents-bees.json, hud.agents bees, the default; agents-allays.json, the calm
// option), with hud.totem off as the rows predate the totem, and with it on the same rows and the totem in slot 5;
// through the layer on the engine's render with the shipped phantoms, through the tests' own layer
// (test/hud/agents-oracle.ts, which draws the flock cluster by cluster and has its own sky rule) and through the real HUD
// path (renderPayload with sources that hand each situation its counts and the agent files' mtimes); by hand on the
// marks (the 60 s window both ways, 0, 1, 4 and 6 agents, Ultracode on with none at work, each hud.agents value), the
// flock's places, the sky the phantoms share, the boss bar's line and every sky the layer must leave as it is; what the
// HUD path asks of the sources, and the disk sources' look that rides on the transcript worker; the bytes at both
// depths; the glyphs; and against the tests' layer on the reference states, the time-lapse and seeded fuzz states x
// seeded flags x the 5 fable ids.
import assert from 'node:assert/strict';
import { closeSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { HUD_GLYPHS } from '../../src/cli/glyphs.ts';
import { defaults, type Config } from '../../src/config.ts';
import { DEMOS, DEMO_NOW, demoSources } from '../../src/demo.ts';
import {
  agentMarks, agentsHud, ALLAY, ALLAY_CELLS, ALLAY_HEAD, BEE, BEE_BODY, BEE_WING, CAP, flock, HIVE, HIVE_COL, HIVE_INK, HIVE_WOOD, LIVE_SECS, liveAgents, NO_AGENTS, PITCH,
  SKY0, STRIPE, WING_LEVEL, WING_UP, type AgentMarks, type AgentsSeen,
} from '../../src/hud/agents.ts';
import { FABLE_IDS, renderHud } from '../../src/hud/fable.ts';
import { frameHud } from '../../src/hud/frame.ts';
import { fromState } from '../../src/hud/input.ts';
import { encode } from '../../src/hud/look.ts';
import { offhandHud, offhandMarks, SLOT5_TOTEM } from '../../src/hud/offhand.ts';
import { phantomHud } from '../../src/hud/phantoms.ts';
import { merge, S, splitAt, W, type Span } from '../../src/hud/spans.ts';
import { cellWidth } from '../../src/hud/wt.ts';
import type { Payload } from '../../src/payload.ts';
import { diskSources, renderPayload } from '../../src/render.ts';
import type { Sources } from '../../src/state.ts';
import { txLockPath, txStatePath, type TxState } from '../../src/transcript.ts';
import { agentsOracle, QUIET_AGENTS, type OracleAgents } from '../hud/agents-oracle.ts';
import { frameOracle } from '../hud/frame-oracle.ts';
import { agentFlags, mulberry32, state as fuzzState } from '../hud/fuzz.ts';
import { playerOracle, QUIET } from '../hud/player-oracle.ts';
import { MIX, picked, plain, REF, SESSION, SOURCES, SPEC, STATES, tuples, type RefLines, type RefState } from '../hud/ref.ts';
import { sgrOracle } from '../hud/sgr-oracle.ts';
import { tempDir } from '../harness.ts';
import { plainDefaults } from '../plain-config.ts';

const text = (l: readonly Span[]): string => l.map((s) => s.t).join('');
const NORMAL: RefState = STATES.normal;
const marks = (m: Partial<AgentMarks>): AgentMarks => ({ look: 'bees', live: 0, ultra: false, ...m });
/** Cols [from, to) of a line, as text. */
const cols = (line: readonly Span[], from: number, to: number): string => text(splitAt(splitAt(line, from)[1], to - from)[0]);

// ---------------------------------------------------------------------------------------------------------------------
// The design's rows
// ---------------------------------------------------------------------------------------------------------------------

interface R9Situation { id: string; label: string; note: string; state: RefState; ctx: { mode: boolean; live: number; phantoms: number } }
interface R9 {
  note: string;
  title: string;
  intro: string;
  name: string;
  optionNote: string;
  source: { file: string; sha256: string; option: string };
  id: string;
  situations: R9Situation[];
  rows: Array<{ label: string; situation: string; lines: RefLines }>;
}
const read = (f: string): R9 => JSON.parse(readFileSync(join(REF, 'round9', `${f}.json`), 'utf8')) as R9;
const BEES = read('agents-bees'), ALLAYS = read('agents-allays');
const LOOKS = { bees: BEES, allays: ALLAYS } as const;
type Look = keyof typeof LOOKS;
const ALL = (Object.entries(LOOKS) as Array<[Look, R9]>).flatMap(([look, d]) => d.situations.map((s, i) => ({ look, s, lines: d.rows[i]!.lines })));
/** The marks the HUD path would build for a situation: its look, its agents at work and Ultracode's signal. */
const marksOf = (look: Look, s: R9Situation): AgentMarks => ({ look, live: s.ctx.live, ultra: s.ctx.mode });

test('round 9b: the vendored rows are the picks (agents-bees, agents-allays), the full HUD (5 lines, framed, left)', () => {
  assert.deepEqual([BEES.id, ALLAYS.id], ['agents-bees', 'agents-allays']);
  for (const [look, d] of Object.entries(LOOKS)) {
    assert.equal(d.source.option, d.id, look);
    assert.equal(d.source.file, 'round9/agents-b.json');
    assert.equal((SOURCES.files[`round9/agents-${look}.json`]!.originSha256 as Record<string, string>)['round9/agents-b.json'], d.source.sha256, look);
    assert.deepEqual(d.situations.map((s) => s.id), ['a-idle', 'a-3', 'a-6', 'a-plain', 'a-sky', 'a-none'], look);
    assert.deepEqual(d.rows.map((r) => r.situation), d.situations.map((s) => s.id), `${look}: a row per situation, in order`);
    assert.deepEqual(d.rows.map((r) => r.label), d.situations.map((s) => s.label));
    // the notes name the design chat, not "Your" (the title is the feature's: "Your agents at work")
    assert.match(d.intro, /^The note on the agents from the design chat: /);
    assert.doesNotMatch(JSON.stringify([d.intro, d.optionNote]), /\bYour\b/);
    assert.match(d.note, /hud\.totem off and hud\.pickaxe plain/);
  }
  assert.match(ALLAYS.optionNote, /^The round-9 pick, the baseline: /);
  assert.deepEqual(BEES.situations, ALLAYS.situations, 'the same six situations');
  assert.deepEqual(BEES.situations.map((s) => [s.ctx.mode, s.ctx.live, s.ctx.phantoms]), [[true, 0, 0], [true, 3, 0], [true, 6, 0], [false, 2, 0], [true, 3, 2], [false, 0, 0]]);
  for (const { s, lines } of ALL) {
    assert.equal(lines.length, 5, s.id);
    for (const l of lines) assert.ok(cellWidth(text(l as Span[])) <= 110 && !/^\s/u.test(text(l as Span[])), s.id);
  }
  // what each look draws in line 1's sky, from col 77 (the cache readout ends there), as text
  const sky = (look: Look, id: string): string => cols(ALL.find((x) => x.look === look && x.s.id === id)!.lines[0] as Span[], 77, 110);
  assert.deepEqual(['a-idle', 'a-3', 'a-6', 'a-plain', 'a-sky', 'a-none'].map((id) => sky('bees', id)), [
    '', '   ▤ ▐▐\u{1FB02} ▐▐\u{1FB0B} ▐▐\u{1FB02}', '   ▤ ▐▐\u{1FB02} ▐▐\u{1FB0B} ▐▐\u{1FB02} ▐▐\u{1FB0B} +2', '   ▤ ▐▐\u{1FB02} ▐▐\u{1FB0B}', '   ▤ ▐▐\u{1FB02} ▐▐\u{1FB0B} ▐▐\u{1FB02}', '']);
  const A = ALLAY_CELLS.join(''), L = ALLAY_CELLS[0] + ALLAY_CELLS[1] + WING_LEVEL;
  assert.deepEqual(['a-idle', 'a-3', 'a-6', 'a-plain', 'a-sky', 'a-none'].map((id) => sky('allays', id)), ['', `     ${A} ${L} ${A}`, `     ${A} ${L} ${A} ${L} +2`, `     ${A} ${L}`, `     ${A} ${L} ${A}`, '']);
  // the phantoms of a-sky are where 0.7.0 puts two (cols 30 and 35)
  assert.equal(cols(ALL.find((x) => x.look === 'bees' && x.s.id === 'a-sky')!.lines[0] as Span[], 29, 39), ' \u{1FB08}\u{1FB0B}\u{1FB05}  \u{1FB22}\u{1FB2D}\u{1FB16} ');
});

/** The tests' whole drawing of a row: the engine, the phantoms, the agents and the frame. */
const oracleRow = (s: R9Situation, m: OracleAgents, id: Parameters<typeof picked>[0] = 'fable-boss'): RefLines =>
  frameOracle(agentsOracle(playerOracle(MIX.render(s.state, picked(id)), s.state, { ...QUIET, phantoms: s.ctx.phantoms }), m), s.state);

test('round 9b: the layer on the engine\'s render (the boss option, the shipped phantoms) draws each row span for span; the tests\' own layer does too', () => {
  for (const { look, s, lines } of ALL) {
    assert.deepEqual(plain(frameHud(agentsHud(phantomHud(renderHud(s.state, 'boss'), s.ctx.phantoms), marksOf(look, s)))), lines, `${look} ${s.id}`);
    assert.deepEqual(plain(tuples(oracleRow(s, { look, live: s.ctx.live }))), tuples(lines), `${look} ${s.id}: the tests' layer`);
  }
});

test('round 9b: the rows with hud.totem on are the same rows with the totem in slot 5 (the credits are held and nothing is low)', () => {
  for (const { look, s, lines } of ALL) {
    const totem = offhandMarks({ now: DEMO_NOW, extra: { used: 0, limit: 50, currency: 'USD', pct: 0, at: null } }, { totem: 'on' }, fromState(s.state), 0);
    assert.equal(totem.totem, 'slot5', s.id);
    const got = plain(frameHud(agentsHud(offhandHud(phantomHud(renderHud(s.state, 'boss'), s.ctx.phantoms), totem), marksOf(look, s))));
    const want = plain(lines) as Span[][];
    const h = want.length - 2;
    want[h] = merge([...splitAt(want[h]!, 37)[0], ...SLOT5_TOTEM, ...splitAt(want[h]!, 41)[1]]);
    assert.deepEqual(got, want, `${look} ${s.id}`);
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// The real HUD path
// ---------------------------------------------------------------------------------------------------------------------

/** `live` agent files written 2, 9, 16 … seconds before now, as the transcript worker would have read them. */
const filesAt = (now: number, live: number): number[] => Array.from({ length: live }, (_, i) => now - 2 - 7 * i);
/**
 * The demo's normal day with a situation's counts, no history and no git state (the design draws ⎇ grey), and an agents
 * source that hands the situation's Ultracode signal and agent files, counting how often it is asked.
 */
function sources(s: R9Situation, asked: { n: number }): (p: Payload, cfg: Config, now: number) => Sources {
  const { status: _status, op: _op, ...git } = DEMOS.normal!.git;
  const counts = { turns: s.state.turns as number, compactions: s.state.compactions as number };
  return (p, cfg, now) => ({
    ...demoSources(DEMOS.normal!)(p, cfg, now), git: () => ({ ...git }), counts: () => ({ ...counts }), history: () => null,
    agents: (): AgentsSeen => { asked.n++; return { ultra: s.ctx.mode, mtimes: filesAt(now, s.ctx.live) }; },
  });
}
/** The demo's normal-day payload with a situation's context. */
const payloadOf = (s: R9Situation): Payload => ({
  ...DEMOS.normal!.payload,
  context_window: { context_window_size: 1_000_000, used_percentage: s.state.ctxPct as number, current_usage: { input_tokens: 6, cache_creation_input_tokens: 1494, cache_read_input_tokens: (s.state.ctxTok as number) - 1500, output_tokens: 812 } },
});
/** The HUD with Fable's boss bar (none on Opus), at the left edge, no name and the [OP] tag, no totem (the rows predate it), and these keys. */
const hudCfg = (hud: Partial<Config['hud']> = {}): Config => ({ ...plainDefaults(), look: 'hud', hud: { ...plainDefaults().hud, fable: 'boss', totem: 'off', ...hud } });

test('round 9b: through the real HUD path (renderPayload, the adapter, the engine, the phantoms, the agents\' source, the frame) each row span for span', () => {
  for (const { look, s, lines } of ALL) {
    const asked = { n: 0 };
    const r = renderPayload(JSON.stringify(payloadOf(s)), { env: { FORCE_COLOR: '3' }, config: hudCfg({ agents: look }), sources: sources(s, asked), now: DEMO_NOW });
    assert.ok(r.hud, `${look} ${s.id}`);
    const { hist, scoped, ...rest } = plain(r.hud.input) as unknown as RefState;
    assert.deepEqual([rest, hist, scoped], [plain(s.state), null, []], `${look} ${s.id}: the engine is handed the design's state`);
    assert.equal(r.hud.player.phantoms, s.ctx.phantoms, `${s.id}: the phantoms from the counts`);
    assert.deepEqual(r.hud.agents, marksOf(look, s), `${look} ${s.id}: the marks`);
    assert.deepEqual(plain(r.hud.framed), lines, `${look} ${s.id}`);
    assert.equal(asked.n, 1, 'the agents\' source is asked once');
  }
  // hud.agents off: nothing drawn, and the source is never asked
  for (const { s, lines } of ALL.filter(({ look }) => look === 'bees')) {
    const asked = { n: 0 };
    const r = renderPayload(JSON.stringify(payloadOf(s)), { env: { FORCE_COLOR: '3' }, config: hudCfg({ agents: 'off' }), sources: sources(s, asked), now: DEMO_NOW });
    assert.deepEqual(r.hud!.agents, NO_AGENTS);
    assert.equal(asked.n, 0, `${s.id}: off reads nothing`);
    assert.deepEqual(plain(r.hud!.framed), plain(frameHud(phantomHud(renderHud(s.state, 'boss'), s.ctx.phantoms))), `${s.id}: the engine's lines with the phantoms`);
    assert.ok(!text(r.hud!.framed[0]!).includes('▤') && text(lines[0] as Span[]).includes('▤') === s.ctx.live > 0);
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// By hand: the marks and the flock
// ---------------------------------------------------------------------------------------------------------------------

test('the constants: the bees\' and the allays\' colours and cells, the hive at col 80, the flock from 82, 4 apart, 4 then a count, 60 s', () => {
  assert.deepEqual([BEE, STRIPE, BEE_WING, HIVE_INK, HIVE_WOOD, ALLAY_HEAD, ALLAY], ['#F8C94A', '#3A2E16', '#E6F2FF', '#F0B43C', '#6E4B1F', '#D9F4FF', '#7FD3FF']);
  assert.deepEqual([BEE_BODY, WING_UP, WING_LEVEL, ...ALLAY_CELLS].map((g) => g.codePointAt(0)!.toString(16).toUpperCase()), ['2590', '1FB02', '1FB0B', '1FB0E', '1FB39', '1FB06']);
  assert.deepEqual(HIVE, S('▤', '#F0B43C', '#6E4B1F'));
  assert.deepEqual([HIVE_COL, SKY0, PITCH, CAP, LIVE_SECS], [80, 82, 4, 4, 60]);
  assert.deepEqual(NO_AGENTS, { look: null, live: 0, ultra: false });
  assert.equal(defaults().hud.agents, 'bees', 'Kamal\'s pick is the default');
});

test('agentMarks: the agent files written at most 60 s from now, either way; Ultracode\'s signal; hud.agents off reads nothing', () => {
  const now = DEMO_NOW;
  const seen = (mtimes: number[], ultra = false): AgentsSeen => ({ ultra, mtimes });
  for (const look of ['bees', 'allays'] as const) {
    assert.deepEqual(agentMarks(now, { agents: look }, null), { look, live: 0, ultra: false }, 'no transcript, or no look yet');
    for (const n of [0, 1, 4, 6]) assert.equal(agentMarks(now, { agents: look }, seen(filesAt(now, n))).live, n, `${n} agents`);
  }
  // the 60 s window, at its edges and from a clock ahead
  assert.equal(liveAgents([now - 60, now - 61, now + 60, now + 61, now, now - 3600], now), 3);
  assert.equal(agentMarks(now, { agents: 'bees' }, seen([now - 60])).live, 1);
  assert.equal(agentMarks(now, { agents: 'bees' }, seen([now - 61])).live, 0, '61 s old: done');
  assert.equal(agentMarks(now + 1, { agents: 'bees' }, seen([now - 60])).live, 0, 'one second later');
  // Ultracode is carried, whatever is at work; off hands nothing at all
  assert.deepEqual(agentMarks(now, { agents: 'bees' }, seen([], true)), { look: 'bees', live: 0, ultra: true });
  assert.deepEqual(agentMarks(now, { agents: 'allays' }, seen([now - 1, now - 2], true)), { look: 'allays', live: 2, ultra: true });
  assert.deepEqual(agentMarks(now, { agents: 'off' }, seen([now - 1, now - 2], true)), NO_AGENTS);
});

test('the flock: the bees\' hive first, then one each from col 82, 4 apart, the wings alternating, four at most and then the count', () => {
  assert.deepEqual(flock('bees', 0), []);
  assert.deepEqual(flock('allays', -1), []);
  assert.deepEqual(flock('bees', 1), [[80, [HIVE]], [82, [S('▐▐', STRIPE, BEE), S(WING_UP, BEE_WING)]]]);
  assert.deepEqual(flock('bees', 2)[2], [86, [S('▐▐', STRIPE, BEE), S(WING_LEVEL, BEE_WING)]]);
  assert.deepEqual(flock('allays', 2), [[82, [S(ALLAY_CELLS[0], ALLAY_HEAD), S(ALLAY_CELLS[1], ALLAY), S(ALLAY_CELLS[2], ALLAY)]], [86, [S(ALLAY_CELLS[0], ALLAY_HEAD), S(ALLAY_CELLS[1], ALLAY), S(WING_LEVEL, ALLAY)]]]);
  assert.deepEqual(flock('bees', 4).map(([c]) => c), [80, 82, 86, 90, 94], 'four bees, no count');
  assert.deepEqual(flock('bees', 6).at(-1), [98, [S('+2', BEE, null, true)]]);
  assert.deepEqual(flock('allays', 16).at(-1), [98, [S('+12', ALLAY, null, true)]], 'the most a look keeps');
  assert.deepEqual(flock('allays', 5).map(([c]) => c), [82, 86, 90, 94, 98]);
});

test('agentsHud: line 1 of the normal day gets 1, 4 or 6 agents after the cache readout; nothing at work, or off, draws nothing', () => {
  const eng = renderHud(NORMAL, 'off');
  const sky = (m: AgentMarks): string => text(agentsHud(eng, m)[0]!).slice(text(eng[0]!).length);
  assert.equal(sky(marks({ live: 1 })), '   ▤ ▐▐\u{1FB02}');
  assert.equal(sky(marks({ live: 4 })), '   ▤ ▐▐\u{1FB02} ▐▐\u{1FB0B} ▐▐\u{1FB02} ▐▐\u{1FB0B}');
  assert.equal(sky(marks({ live: 6 })), '   ▤ ▐▐\u{1FB02} ▐▐\u{1FB0B} ▐▐\u{1FB02} ▐▐\u{1FB0B} +2');
  assert.equal(sky(marks({ look: 'allays', live: 1 })), `     ${ALLAY_CELLS.join('')}`);
  assert.equal(cellWidth(text(agentsHud(eng, marks({ live: 16 }))[0]!)), 101, '4 bees and +12: 101 cells, inside 110');
  const same = (m: AgentMarks, what: string, lines: Span[][] = eng): void => {
    const got = agentsHud(lines, m);
    assert.deepEqual(got, lines, what);
    got.forEach((l, i) => assert.notEqual(l, lines[i], `${what}: line ${i} is a copy`));
  };
  same(marks({ live: 0, ultra: true }), 'Ultracode on and no agent at work: nothing');
  same(marks({ live: 0 }), 'none at work');
  same({ ...NO_AGENTS, live: 3 }, 'off (no look)');
  same(marks({ live: 3 }), 'fewer than 4 lines: no line 1', eng.slice(1));
  assert.deepEqual(agentsHud([], marks({ live: 3 })), []);
  // every other line, and line 1 up to the readout, stay as the engine drew them
  const got = agentsHud(eng, marks({ live: 6 }));
  got.slice(1).forEach((l, i) => assert.deepEqual(l, eng[i + 1], `line ${i + 2}`));
  assert.deepEqual(splitAt(got[0]!, W(eng[0]!))[0], eng[0], 'line 1\'s own cells');
});

test('agentsHud: the boss bar\'s line is the first, so line 1 is the second of 5; the phantoms and the agents share the sky', () => {
  const fable = SPEC.round7.situations['fable-in-use']!.state;
  const boss = renderHud(fable, 'boss');
  assert.equal(boss.length, 5);
  const got = agentsHud(boss, marks({ live: 3 }));
  assert.deepEqual(got[0], boss[0], 'the boss bar as it was');
  assert.match(text(got[1]!), /^Fable 5\.1 Efficiency III .* {3}▤ ▐▐/u);
  got.slice(2).forEach((l, i) => assert.deepEqual(l, boss[i + 2]));
  // four phantoms (cols 24-38) and six agents (cols 80-99): neither moves the other
  const eng = renderHud(NORMAL, 'off'), ph = phantomHud(eng, 4);
  const both = agentsHud(ph, marks({ look: 'allays', live: 6 }));
  assert.equal(cols(both[0]!, 0, W(ph[0]!)), text(ph[0]!), 'the phantoms\' sky as it was');
  assert.equal(cols(both[0]!, 80, 110), cols(agentsHud(eng, marks({ look: 'allays', live: 6 }))[0]!, 80, 110), 'the agents\' sky as without phantoms');
});

test('agentsHud: the flock flies only where its sky is empty, from the cell before it on; anything there and the line is left as it is', () => {
  const L = (line: Span[]): Span[][] => [line, [S('y')], [S('z')], [S('w')]];
  const wide = (n: number): Span[] => [S('x'.repeat(n), '#AAAAAA')];
  const drawn = (lines: Span[][], m: AgentMarks): boolean => text(agentsHud(lines, m)[0]!) !== text(lines[0]!);
  // bees need cols 79 on (the hive at 80), allays 81 on
  assert.equal(drawn(L(wide(79)), marks({ live: 1 })), true, 'bees: 79 cells');
  assert.equal(drawn(L(wide(80)), marks({ live: 1 })), false, 'bees: col 79 taken');
  assert.equal(drawn(L(wide(81)), marks({ look: 'allays', live: 1 })), true, 'allays: 81 cells');
  assert.equal(drawn(L(wide(82)), marks({ look: 'allays', live: 1 })), false, 'allays: col 81 taken');
  assert.deepEqual(agentsHud(L(wide(79)), marks({ live: 1 }))[0], [S('x'.repeat(79), '#AAAAAA'), S(' '), HIVE, S(' '), S('▐▐', STRIPE, BEE), S(WING_UP, BEE_WING)], 'padded: col 79, then the hive');
  // spaces are sky; a styled one, a wide glyph, a glyph past the flock's end
  const at = (col: number, s: Span): Span[] => [S('x', '#AAAAAA'), S(' '.repeat(col - 1)), s];
  assert.equal(drawn(L(at(90, S(' '))), marks({ live: 3 })), true, 'a plain space in the way is sky');
  assert.equal(drawn(L(at(90, S(' ', null, '#201E07'))), marks({ live: 3 })), false, 'a space with a background');
  assert.equal(drawn(L(at(90, S(' ', '#AAAAAA'))), marks({ live: 3 })), false, 'a space with ink');
  assert.equal(drawn(L(at(90, S(' ', null, null, true))), marks({ live: 3 })), false, 'a bold space');
  assert.equal(drawn(L(at(92, S('·'))), marks({ live: 3 })), false, 'a glyph under the last bee\'s wing (col 92)');
  assert.equal(drawn(L(at(93, S('·'))), marks({ live: 3 })), true, 'one past the flock: kept after it');
  assert.equal(text(agentsHud(L(at(93, S('·'))), marks({ live: 3 }))[0]!).slice(-1), '·');
  assert.equal(drawn(L(at(78, S('日'))), marks({ live: 1 })), false, 'a wide glyph across col 79');
  assert.equal(drawn(L(at(77, S('日'))), marks({ live: 1 })), true, 'a wide glyph that ends at col 78');
  assert.equal(drawn(L(at(98, S('·'))), marks({ live: 6 })), false, 'the count\'s cells are the flock\'s too');
});

// ---------------------------------------------------------------------------------------------------------------------
// The disk sources: the look that rides on the transcript worker
// ---------------------------------------------------------------------------------------------------------------------

test('diskSources.agents: the worker\'s last look, read from the transcript\'s summary; a look that is due queues the worker with agents, once', () => {
  const dir = tempDir('hb-agents-');
  try {
    const file = join(dir, 'sess.jsonl'), env = { HUNGERBAR_CACHE_DIR: dir };
    const p = { session_id: 'sess', transcript_path: file } as Payload;
    const call = (ts: number): string => JSON.stringify({ type: 'assistant', timestamp: new Date(ts * 1000).toISOString(), message: { id: `m${ts}`, content: [{ type: 'tool_use', id: `t${ts}`, name: 'Agent', input: {} }] } });
    const run = (now: number, payload: Payload = p): { seen: AgentsSeen | null; spawns: string[][] } => {
      const spawns: string[][] = [];
      return { seen: diskSources(payload, env, defaults(), now, spawns).agents!(), spawns };
    };
    assert.deepEqual(run(DEMO_NOW, { session_id: 'x' } as Payload), { seen: null, spawns: [] }, 'no transcript');
    writeFileSync(file, JSON.stringify({ type: 'user', message: { content: 'hi' }, origin: { kind: 'human' } }) + '\n');
    assert.deepEqual(run(DEMO_NOW), { seen: { ultra: false, mtimes: [] }, spawns: [] }, 'a session that called no agent: no look, none asked');
    writeFileSync(file, call(DEMO_NOW - 30) + '\n' + JSON.stringify({ type: 'attachment', isSidechain: false, attachment: { type: 'ultra_effort_enter' } }) + '\n', { flag: 'a' });
    const first = run(DEMO_NOW);
    assert.deepEqual(first.seen, { ultra: true, mtimes: [] });
    assert.deepEqual(first.spawns, [['refresh', 'transcript', file, 'sess', 'agents']], 'an agent call: a look is due');
    // the worker's look, saved: fresh for 10 s
    const st = JSON.parse(readFileSync(txStatePath(dir, 'sess'), 'utf8')) as TxState;
    writeFileSync(txStatePath(dir, 'sess'), JSON.stringify({ ...st, agents: { at: DEMO_NOW, mtimes: [DEMO_NOW - 2, DEMO_NOW - 70] } }));
    assert.deepEqual(run(DEMO_NOW + 9), { seen: { ultra: true, mtimes: [DEMO_NOW - 2, DEMO_NOW - 70] }, spawns: [] }, 'a look 9 s old');
    assert.deepEqual(run(DEMO_NOW + 10).spawns, [['refresh', 'transcript', file, 'sess', 'agents']], '10 s old');
    // the worker already runs: nothing more
    closeSync(openSync(txLockPath(dir, 'sess'), 'w'));
    assert.deepEqual(run(DEMO_NOW + 10).spawns, []);
    rmSync(txLockPath(dir, 'sess'));
    // a delta over the budget queues the worker anyway: the look rides on it
    writeFileSync(file, 'x'.repeat(5 * 1024 * 1024) + '\n', { flag: 'a' });
    const spawns: string[][] = [];
    const src = diskSources(p, env, defaults(), DEMO_NOW + 10, spawns);
    assert.equal(src.transcript()?.needsWorker, true);
    src.agents!();
    src.agents!();
    assert.deepEqual(spawns, [['refresh', 'transcript', file, 'sess', 'agents']], 'one worker, with agents');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// Bytes and glyphs
// ---------------------------------------------------------------------------------------------------------------------

test('bytes: every round-9b row at 24-bit and 256 colours is the independent encoder\'s', () => {
  for (const { look, s, lines } of ALL) {
    for (const depth of ['truecolor', '256'] as const) assert.equal(encode(lines as Span[][], depth, { bold: true, nbsp: true }), sgrOracle(lines, { depth }), `${look} ${s.id} ${depth}`);
  }
  const row = (look: Look, id: string): Span[][] => ALL.find((x) => x.look === look && x.s.id === id)!.lines as Span[][];
  assert.ok(encode(row('bees', 'a-3'), 'truecolor', { bold: true, nbsp: false }).includes('\x1b[38;2;240;180;60;48;2;110;75;31m▤\x1b[0m \x1b[38;2;58;46;22;48;2;248;201;74m▐▐\x1b[0m'), 'the hive and a bee');
  assert.ok(encode(row('allays', 'a-6'), '256', { bold: true, nbsp: false }).includes(`\x1b[1;38;5;117m+2\x1b[0m`), 'the allays\' count at 256 colours');
});

test('glyphs: the hive and the sextants are 1 cell and on glyphs --hud after the totem\'s, before ·; every glyph the rows\' sky adds is listed', () => {
  const names = HUD_GLYPHS.map(([g]) => g);
  const i = names.indexOf('✦');
  assert.deepEqual(names.slice(i, i + 7), ['✦', '▤', WING_UP, ...ALLAY_CELLS, '·']);
  for (const g of ['▤', BEE_BODY, WING_UP, WING_LEVEL, ...ALLAY_CELLS]) {
    assert.equal(cellWidth(g), 1, g);
    assert.ok(names.includes(g), g);
  }
  assert.match(HUD_GLYPHS.find(([g]) => g === '▤')![1], /hive.*hud\.agents bees/);
  assert.match(HUD_GLYPHS.find(([g]) => g === ALLAY_CELLS[0])![1], /allay.*hud\.agents allays/);
  assert.match(HUD_GLYPHS.find(([g]) => g === BEE_BODY)![1], /bee's stripes/);
  assert.match(HUD_GLYPHS.find(([g]) => g === WING_LEVEL)![1], /phantom.*wing, level/);
  const added = new Set(ALL.flatMap(({ s, lines }) => {
    const base = new Set(text(frameHud(phantomHud(renderHud(s.state, 'boss'), s.ctx.phantoms))[0]!));
    return [...text(lines[0] as Span[])].filter((g) => g.codePointAt(0)! > 0x7f && !base.has(g));
  }));
  assert.deepEqual([...added].sort(), ['▤', BEE_BODY, WING_UP, WING_LEVEL, ...ALLAY_CELLS].sort());
});

// ---------------------------------------------------------------------------------------------------------------------
// Against the tests' own layer
// ---------------------------------------------------------------------------------------------------------------------

function* inputs(): Generator<[string, unknown]> {
  for (const [k, s] of Object.entries(STATES)) yield [`states.${k}`, s];
  for (const [k, s] of Object.entries(SPEC.round7.situations)) yield [`round7.${k}`, s.state];
  for (const { s } of ALL.filter(({ look }) => look === 'bees')) yield [`round9b.${s.id}`, s.state];
  for (let i = 0; i < SESSION.frames.length; i += 7) yield [`frame ${i}`, SESSION.frames[i]];
  const r = mulberry32(0xa9e47);
  const bases = [...Object.values(STATES), ...Object.values(SPEC.round7.situations).map((s) => s.state)];
  for (let k = 0; k < 300; k++) yield [`fuzz state #${k}`, fuzzState(r, bases)];
}

test('the layer equals the tests\' layer on the reference states, the time-lapse and fuzz, x seeded flags x the 5 fable ids', () => {
  const r = mulberry32(0xb335);
  const n = { bees: 0, allays: 0, count: 0, kept: 0, quiet: 0 };
  for (const [what, state] of inputs()) {
    for (const id of FABLE_IDS) {
      const f = agentFlags(r);
      const m: AgentMarks = { look: f.look, live: f.look ? f.live : 0, ultra: f.live % 2 === 1 };
      const eng = phantomHud(renderHud(state, id), f.phantoms);
      const got = frameHud(agentsHud(eng, m));
      const want = frameOracle(agentsOracle(playerOracle(MIX.render(state, picked(`fable-${id}`)), state, { ...QUIET, phantoms: f.phantoms }), { look: m.look, live: m.live }), state);
      assert.deepEqual(tuples(got as RefLines), plain(tuples(want)), `${what} ${id} ${JSON.stringify(f)}`);
      for (const l of got) assert.ok(cellWidth(text(l)) <= 110 && !/^\s/u.test(text(l)), `${what} ${id}: ${cellWidth(text(l))} cells`);
      const changed = JSON.stringify(got) !== JSON.stringify(frameHud(eng));
      if (!m.look || m.live === 0) { assert.equal(changed, false, `${what}: nothing to draw`); n.quiet++; } else if (changed) { n[m.look]++; if (m.live > CAP) n.count++; } else n.kept++;
    }
  }
  assert.ok(n.bees > 200 && n.allays > 200 && n.count > 100 && n.quiet > 300, JSON.stringify(n));
});

test('QUIET_AGENTS: the tests\' layer with nothing to draw is the engine\'s render', () => {
  const lines = MIX.render(NORMAL, picked('fable-off'));
  assert.deepEqual(plain(agentsOracle(lines, QUIET_AGENTS)), plain(lines));
  assert.deepEqual(plain(agentsOracle(lines, { look: 'bees', live: 0 })), plain(lines));
  assert.deepEqual(plain(agentsOracle(lines.slice(1), { look: 'bees', live: 3 })), plain(lines.slice(1)));
  assert.deepEqual(agentsOracle([], { look: 'bees', live: 3 }), []);
});
