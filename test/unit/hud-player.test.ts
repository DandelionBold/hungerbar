// The player's layers (src/hud/{who,bed,phantoms,player}.ts, SPEC §0.9, 0.7.0): the picks from design round 8, span
// for span against the design's own rows (test/reference/round8/identity.json: user-grey, op-tag, op-name, bed-blocks;
// toolong.json: phantoms), through the layers on the engine's render, through the tests' own layers
// (test/hud/player-oracle.ts, which finds line 3's folder from the state, not from the drawn line) and through the real
// HUD path (renderPayload with sources that hand each situation its names, elevation, counts, prompt cache and session
// age); by hand on every look, the fit, what gives way, the sky and the slot; the times the bed and the phantoms read;
// what the HUD path asks of the sources for each option; and against the tests' layers on the reference states, the
// time-lapse and seeded fuzz states x seeded marks x the 5 fable ids. With nothing to draw the engine's lines come back
// as they are.
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { HUD_GLYPHS } from '../../src/cli/glyphs.ts';
import { defaults, type Config } from '../../src/config.ts';
import { DEMOS, DEMO_NOW, demoSources } from '../../src/demo.ts';
import { BED, bedHud, BLANKET, idle, IDLE_SECS, MATTRESS, OAK, PILLOW, SLOT4 } from '../../src/hud/bed.ts';
import { FABLE_IDS, renderHud } from '../../src/hud/fable.ts';
import { frameHud } from '../../src/hud/frame.ts';
import { fromState, type Hist } from '../../src/hud/input.ts';
import { encode } from '../../src/hud/look.ts';
import { GREY, WELL, WHITE } from '../../src/hud/mix.ts';
import { FAR, FAR_COL, flock, HIGH, LONG, LOW, PH_DIM, PH_EYES, PH_WING, phantomHud, signs, SPOTS } from '../../src/hud/phantoms.ts';
import { away, lastMessage, NO_PLAYER, playerHud, sessionSecs, working, type PlayerMarks } from '../../src/hud/player.ts';
import { S, W, type Span } from '../../src/hud/spans.ts';
import { folderAt, HOME, MIN_PATH, NO_WHO, OP_GOLD, OP_RED, whoHud, type WhoMarks } from '../../src/hud/who.ts';
import { cellWidth } from '../../src/hud/wt.ts';
import type { Payload } from '../../src/payload.ts';
import { renderPayload } from '../../src/render.ts';
import type { Sources } from '../../src/state.ts';
import type { TxSummary } from '../../src/transcript.ts';
import type { WhoSource } from '../../src/whoami.ts';
import { frameOracle } from '../hud/frame-oracle.ts';
import { chance, int, mulberry32, pick, state as fuzzState, TEXTS, type Rng } from '../hud/fuzz.ts';
import { playerOracle, QUIET, type OraclePlayer } from '../hud/player-oracle.ts';
import { sgrOracle } from '../hud/sgr-oracle.ts';
import { picked, MIX, plain, REF, SESSION, SOURCES, SPEC, STATES, tuples, type RefLines, type RefState } from '../hud/ref.ts';
import { plainDefaults } from '../plain-config.ts';

const text = (l: readonly Span[]): string => l.map((s) => s.t).join('');
const NORMAL: RefState = STATES.normal;
const cwdOf = (st: unknown): string => (fromState(st) as { cwd: string }).cwd;
const who = (m: Partial<WhoMarks>): WhoMarks => ({ ...NO_WHO, ...m });
const marks = (m: Partial<PlayerMarks>): PlayerMarks => ({ ...NO_PLAYER, ...m });
const T = (s: number): number => DEMO_NOW + s;

// ---------------------------------------------------------------------------------------------------------------------
// The design's rows
// ---------------------------------------------------------------------------------------------------------------------

interface IdSituation { label: string; state: Partial<RefState>; who: WhoMarks; idle: boolean }
interface IdOption { id: string; name: string; optionNote: string; situations: IdSituation[]; rows: Array<{ label: string; lines: RefLines }> }
interface Identity { source: { sha256: string; options: string[] }; options: IdOption[] }
interface TlSituation { label: string; state: Partial<RefState>; mins: number; signs: number }
interface TooLong { id: string; source: { sha256: string; option: string }; situations: TlSituation[]; rows: Array<{ label: string; lines: RefLines }> }
const ID = JSON.parse(readFileSync(join(REF, 'round8', 'identity.json'), 'utf8')) as Identity;
const TL = JSON.parse(readFileSync(join(REF, 'round8', 'toolong.json'), 'utf8')) as TooLong;
const opt = (id: string): IdOption => ID.options.find((o) => o.id === id)!;

test('round 8: the vendored rows are the picks (user-grey, op-tag, op-name, bed-blocks; phantoms), the full HUD (5 lines, framed, left)', () => {
  assert.deepEqual(ID.options.map((o) => o.id), ['user-grey', 'op-tag', 'op-name', 'bed-blocks']);
  assert.deepEqual(ID.source.options, ['user-grey', 'op-tag', 'op-name', 'bed-blocks']);
  assert.equal(TL.id, 'phantoms');
  assert.equal(TL.source.option, 'phantoms');
  // the files they were taken from are the ones SOURCES.json names (hud.reference.test.ts pins these files' own sha256)
  assert.equal((SOURCES.files['round8/identity.json']!.originSha256 as Record<string, string>)['round8/identity.json'], ID.source.sha256);
  assert.equal((SOURCES.files['round8/toolong.json']!.originSha256 as Record<string, string>)['round8/toolong.json'], TL.source.sha256);
  assert.deepEqual(ID.options.map((o) => o.rows.map((r) => r.label)), [['Off', 'User', 'User@host'], ['Normal', 'Elevated'], ['Normal', 'Elevated'], ['Active', 'Idle']]);
  assert.deepEqual(TL.rows.map((r) => r.label), ['Fresh session', 'Getting long', 'Too long']);
  for (const o of ID.options) assert.deepEqual(o.situations.map((s) => s.label), o.rows.map((r) => r.label), o.id);
  assert.deepEqual(TL.situations.map((s) => s.label), TL.rows.map((r) => r.label));
  for (const r of [...ID.options.flatMap((o) => o.rows), ...TL.rows]) {
    assert.equal(r.lines.length, 5, r.label);
    for (const l of r.lines) assert.ok(cellWidth(text(l as Span[])) <= 110 && !/^\s/u.test(text(l as Span[])), r.label);
  }
  // what each design draws, as text
  const l3 = (o: string, i: number): string => { const t = text(opt(o).rows[i]!.lines[2] as Span[]); return t.slice(t.indexOf('⌂')); };
  assert.deepEqual([l3('user-grey', 0), l3('user-grey', 1), l3('user-grey', 2)], ['⌂ D:/webapp', '⌂ steve: D:/webapp', '⌂ steve@DESKTOP: D:/webapp']);
  assert.deepEqual([l3('op-tag', 1), l3('op-name', 1)], ['⌂ [OP] steve: D:/webapp', '⌂ steve: D:/webapp']);
  assert.equal(Array.from(text(opt('bed-blocks').rows[1]!.lines[3] as Span[])).slice(31, 35).join(''), MATTRESS.repeat(4), 'cols 32-35 (📖 is 2 cells, 1 code point)');
  assert.deepEqual(TL.situations.map((s) => s.signs), [0, 1, 3]);
  assert.deepEqual(TL.situations.map((s) => signs({ turns: 42, compactions: 0, ctxPct: 8, ...s.state, secs: s.mins * 60 } as never)), [0, 1, 3]);
});

/** A situation's engine state: states.normal with its fields replaced. */
const stateOf = (s: { state: Partial<RefState> }): RefState => ({ ...NORMAL, ...s.state });
const idMarks = (s: IdSituation): PlayerMarks => ({ who: s.who, bed: s.idle, phantoms: 0 });
const tlMarks = (s: TlSituation): PlayerMarks => ({ ...NO_PLAYER, phantoms: s.signs });

test('round 8: the layers on the engine\'s render draw each row span for span; the tests\' own layers do too', () => {
  const all: Array<[string, RefState, PlayerMarks, RefLines]> = [
    ...ID.options.flatMap((o) => o.situations.map((s, i) => [`${o.id} ${s.label}`, stateOf(s), idMarks(s), o.rows[i]!.lines] as [string, RefState, PlayerMarks, RefLines])),
    ...TL.situations.map((s, i) => [`phantoms ${s.label}`, stateOf(s), tlMarks(s), TL.rows[i]!.lines] as [string, RefState, PlayerMarks, RefLines]),
  ];
  for (const [what, st, m, rows] of all) {
    assert.deepEqual(plain(frameHud(playerHud(renderHud(st, 'off'), m, cwdOf(st)))), rows, what);
    const oracle = frameOracle(playerOracle(MIX.render(st, picked('fable-off')), st, m as OraclePlayer), st);
    assert.deepEqual(plain(tuples(oracle)), tuples(rows), `${what}: the tests' layers`);
  }
});

/** A WhoSource that hands fixed names and counts what it is asked. */
function whoSource(user: string, host: string, elevated: boolean): WhoSource & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    user: () => { asked.push('user'); return user; },
    host: () => { asked.push('host'); return host; },
    elevated: () => { asked.push('elevated'); return elevated; },
  };
}

/**
 * The demo's normal day with these counts, a WhoSource and no history (the design draws none), and its git view without
 * the demo's git state (0.7.0): the design's rows draw ⎇ grey, as nothing known.
 */
function sources(w: WhoSource | undefined, counts = { turns: 42, compactions: 0 }, tx: TxSummary | null = null, hist: Hist | null = null): (p: Payload, cfg: Config, now: number) => Sources {
  const { status: _status, op: _op, ...git } = DEMOS.normal!.git;
  return (p, cfg, now) => ({ ...demoSources(DEMOS.normal!)(p, cfg, now), git: () => ({ ...git }), counts: () => ({ ...counts }), history: () => hist, transcript: () => tx, ...(w ? { who: w } : {}) });
}
/** The HUD with no Fable option, at the left edge, no name and the [OP] tag (the defaults before SPEC §0.10), and these keys. */
const hudCfg = (hud: Partial<Config['hud']> = {}): Config => ({ ...plainDefaults(), look: 'hud', hud: { ...plainDefaults().hud, ...hud } });
const NORMAL_P = DEMOS.normal!.payload;
/** The demo's normal-day payload with a cache that went cold 6 minutes after its last write, as the idle row draws it. */
const IDLE_P: Payload = { ...NORMAL_P, prompt_cache: { warm: false, caching_observed: true, ttl: '5m', expires_at: T(-60), hit_ratio: 0.981 } };

test('round 8: through the real HUD path (renderPayload, the adapter, the engine, the layers, the frame) each row span for span', () => {
  for (const o of ID.options) {
    o.situations.forEach((s, i) => {
      const w = whoSource('steve', 'DESKTOP', s.who.op !== null);
      const cfg = hudCfg({ user: !s.who.user ? 'off' : s.who.host ? 'user@host' : 'user', op: o.id === 'op-name' ? 'gold' : 'tag' });
      const r = renderPayload(JSON.stringify(s.idle ? IDLE_P : NORMAL_P), { env: { FORCE_COLOR: '3' }, config: cfg, sources: sources(w), now: DEMO_NOW });
      assert.ok(r.hud, `${o.id} ${s.label}`);
      const { hist, scoped, ...rest } = plain(r.hud.input) as unknown as RefState;
      assert.deepEqual([rest, hist, scoped], [plain(stateOf(s)), null, []], `${o.id} ${s.label}: the engine is handed the design's state`);
      assert.deepEqual(plain(r.hud.player), idMarks(s), `${o.id} ${s.label}: the marks`);
      assert.deepEqual(plain(r.hud.framed), o.rows[i]!.lines, `${o.id} ${s.label}`);
    });
  }
  TL.situations.forEach((s, i) => {
    const st = stateOf(s);
    const p: Payload = {
      ...NORMAL_P,
      cost: { total_cost_usd: 3.12, total_duration_ms: s.mins * 60_000 },
      context_window: { context_window_size: 1_000_000, used_percentage: st.ctxPct as number, current_usage: { input_tokens: 6, cache_creation_input_tokens: 1494, cache_read_input_tokens: (st.ctxTok as number) - 1500, output_tokens: 812 } },
    };
    const r = renderPayload(JSON.stringify(p), { env: { FORCE_COLOR: '3' }, config: hudCfg(), sources: sources(undefined, { turns: st.turns as number, compactions: st.compactions as number }), now: DEMO_NOW });
    const { hist, scoped, ...rest } = plain(r.hud!.input) as unknown as RefState;
    assert.deepEqual([rest, hist, scoped], [plain(st), null, []], `${s.label}: the engine is handed the design's state`);
    assert.deepEqual(plain(r.hud!.player), tlMarks(s), `${s.label}: the marks`);
    assert.deepEqual(plain(r.hud!.framed), TL.rows[i]!.lines, s.label);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// By hand: the name and the operator (who.ts)
// ---------------------------------------------------------------------------------------------------------------------

/** Line 3 of the normal day with these marks, from ⌂ on. */
const folderSpans = (m: Partial<WhoMarks>, st: RefState = NORMAL): Span[] => {
  const l3 = whoHud(renderHud(st, 'off'), who(m), cwdOf(st))[2]!;
  return l3.slice(l3.findIndex((s) => s.t.startsWith('⌂')));
};

test('who: nothing to draw, or no folder: the lines as the engine drew them (a copy)', () => {
  const eng = renderHud(NORMAL, 'off');
  for (const [what, m] of [['nothing', NO_WHO], ['a host alone', who({ host: 'DESKTOP' })]] as const) {
    const got = whoHud(eng, m, 'D:/webapp');
    assert.deepEqual(got, eng, what);
    got.forEach((l, i) => assert.notEqual(l, eng[i], `${what}: line ${i} is a copy`));
  }
  const nocwd = { ...NORMAL, cwd: '' }, bare = renderHud(nocwd, 'off');
  assert.equal(folderAt(bare[2]!), -1, 'no cwd: no ⌂ (the engine draws none)');
  assert.deepEqual(whoHud(bare, who({ user: 'steve', op: 'tag' }), ''), bare);
  assert.deepEqual(whoHud([], who({ user: 'steve' }), 'D:/webapp'), []);
  assert.deepEqual(whoHud([[S('x')]], who({ user: 'steve' }), 'D:/webapp'), [[S('x')]], 'one line: no line 3');
});

test('folderAt: line 3\'s last span, grey and plain, starting with ⌂ and a space', () => {
  assert.equal(folderAt([S('8%', '#80FF20'), S('  '), S('⌂ D:/webapp', GREY)]), 2);
  for (const [what, l] of [
    ['empty', []], ['no ⌂', [S('  '), S('D:/webapp', GREY)]], ['⌂ not last', [S('⌂ D:/webapp', GREY), S(' ')]], ['⌂ with no space', [S('⌂D:/webapp', GREY)]],
    ['white', [S('⌂ D:/webapp', WHITE)]], ['bold', [S('⌂ D:/webapp', GREY, null, true)]], ['a background', [S('⌂ D:/webapp', GREY, WELL)]],
  ] as Array<[string, Span[]]>) assert.equal(folderAt(l), -1, what);
});

test('who: the name in the folder\'s grey, the [OP] tag in bold red, gold in bold gold; with the name off the tag follows ⌂ and gold colours ⌂', () => {
  assert.deepEqual(HOME, '⌂ ');
  assert.deepEqual(folderSpans({ user: 'steve' }), [S('⌂ steve: D:/webapp', GREY)]);
  assert.deepEqual(folderSpans({ user: 'steve', host: 'DESKTOP' }), [S('⌂ steve@DESKTOP: D:/webapp', GREY)]);
  assert.deepEqual(folderSpans({ op: 'tag' }), [S('⌂ ', GREY), S('[OP]', OP_RED, null, true), S(' '), S('D:/webapp', GREY)], 'the design: ⌂ [OP] D:/webapp');
  assert.deepEqual(folderSpans({ op: 'gold' }), [S('⌂ ', OP_GOLD), S('D:/webapp', GREY)], 'the design: the ⌂ turns gold');
  assert.deepEqual(folderSpans({ user: 'steve', host: 'DESKTOP', op: 'tag' }), [S('⌂ ', GREY), S('[OP]', OP_RED, null, true), S(' '), S('steve@DESKTOP: D:/webapp', GREY)]);
  assert.deepEqual(folderSpans({ user: 'steve', host: 'DESKTOP', op: 'gold' }), [S('⌂ ', GREY), S('steve', OP_GOLD, null, true), S('@DESKTOP: D:/webapp', GREY)]);
  assert.deepEqual([OP_RED, OP_GOLD], ['#FF5555', '#FFAA00']);
  // the rest of line 3 stays as the engine drew it
  const eng = renderHud(NORMAL, 'off'), got = whoHud(eng, who({ user: 'steve', op: 'tag' }), 'D:/webapp');
  assert.deepEqual(got[2]!.slice(0, folderAt(eng[2]!)), eng[2]!.slice(0, folderAt(eng[2]!)));
  for (const i of [0, 1, 3]) assert.deepEqual(got[i], eng[i]);
});

test('who: line 3 stays within 110 cells; the path keeps 10 cells, the host, then the name, then the tag give way', () => {
  assert.equal(MIN_PATH, 10);
  const long = { ...NORMAL, cwd: 'D:/code/tools/hungerbar/src/hud/some/deeper/folder' };
  const at = (m: Partial<WhoMarks>, st: RefState = long): string => { const t = text(whoHud(renderHud(st, 'off'), who(m), cwdOf(st))[2]!); return t.slice(t.indexOf('⌂')); };
  // the normal day's line 3 has 67 cells before ⌂: 41 for '⌂ ', the name and the path
  assert.equal(W(renderHud(NORMAL, 'off')[2]!.slice(0, folderAt(renderHud(NORMAL, 'off')[2]!))), 67);
  assert.equal(at({}), '⌂ …/hungerbar/src/hud/some/deeper/folder', 'the engine\'s own cut: 38 of its 41 cells');
  assert.equal(at({ user: 'steve', host: 'DESKTOP-ABC1234', op: 'tag' }), '⌂ [OP] steve@DESKTOP-ABC1234: …/folder', 'all of it fits, the path cut to 13 cells');
  assert.equal(at({ user: 'steve', host: 'A-VERY-LONG-HOSTNAME-XXXXXXXX', op: 'tag' }), '⌂ [OP] steve: …/src/hud/some/deeper/folder', 'the host gives way first');
  assert.equal(at({ user: 'u'.repeat(30), host: 'H', op: 'tag' }), '⌂ [OP] …/src/hud/some/deeper/folder', 'then the name');
  assert.equal(at({ user: 'u'.repeat(30), op: 'gold' }), '⌂ …/hungerbar/src/hud/some/deeper/folder', 'gold costs no room: the engine\'s cut');
  assert.deepEqual(whoHud(renderHud(long, 'off'), who({ user: 'u'.repeat(30), op: 'gold' }), cwdOf(long))[2]!.slice(-2),
    [S('⌂ ', OP_GOLD), S('…/hungerbar/src/hud/some/deeper/folder', GREY)], 'gold without a shown name: the ⌂ turns gold');
  // a short path keeps all of its own: 'C:/' (3 cells) leaves a 30-cell name in, which a long path would not
  assert.equal(at({ user: 'u'.repeat(30), op: 'tag' }, { ...NORMAL, cwd: 'C:/' }), `⌂ [OP] ${'u'.repeat(30)}: C:/`);
  assert.equal(at({ user: 'u'.repeat(30), host: 'hhh', op: 'tag' }, { ...NORMAL, cwd: 'C:/' }), `⌂ [OP] ${'u'.repeat(30)}: C:/`, 'its host does not fit');
  for (const m of [{ user: 'u'.repeat(32) + '…', host: 'h'.repeat(63) + '…', op: 'tag' as const }, { user: '日本語'.repeat(10), op: 'gold' as const }]) {
    for (const st of [NORMAL, long, { ...NORMAL, ctxPct: 100, ctxTok: 1e6 }, { ...NORMAL, cwd: 'x'.repeat(200) }]) {
      const l3 = text(whoHud(renderHud(st, 'off'), who(m), cwdOf(st))[2]!);
      assert.ok(cellWidth(l3) <= 110, `${cellWidth(l3)} cells`);
    }
  }
  // with no room even for the tag, every part gives way and the span is the engine's own
  const tight: Span[][] = [[S('a')], [S('b')], [S('x'.repeat(100)), S('  '), S('⌂ D:/webapp', GREY)], [S('d')]];
  assert.deepEqual(whoHud(tight, who({ user: 'steve', host: 'H', op: 'tag' }), 'D:/webapp')[2], [S('x'.repeat(100) + '  '), S('⌂ weba…', GREY)], 'tailPath in 6 cells');
  assert.deepEqual(whoHud(tight, who({ user: 'steve', op: 'gold' }), 'D:/webapp')[2], [S('x'.repeat(100) + '  '), S('⌂ ', OP_GOLD), S('weba…', GREY)]);
});

// ---------------------------------------------------------------------------------------------------------------------
// By hand: the bed (bed.ts)
// ---------------------------------------------------------------------------------------------------------------------

test('the bed: four cells in slot 4 (cols 32-35), a white pillow and a red blanket on oak legs, only on the plain empty well', () => {
  assert.deepEqual(SLOT4, [32, 36]);
  assert.deepEqual([PILLOW, BLANKET, OAK, MATTRESS], ['#E9ECEC', '#B02E26', '#9C7F4E', '\u{1FB84}']);
  assert.deepEqual(BED, [S(MATTRESS, PILLOW, OAK), S(MATTRESS, BLANKET, WELL), S(MATTRESS, BLANKET, WELL), S(MATTRESS, BLANKET, OAK)]);
  const eng = renderHud(NORMAL, 'off'), got = bedHud(eng, true);
  const at32 = got[3]!.findIndex((s) => s.t.startsWith(MATTRESS));
  assert.equal(W(got[3]!.slice(0, at32)), 32);
  assert.deepEqual(got[3]!.slice(at32, at32 + 3), [S(MATTRESS, PILLOW, OAK), S(MATTRESS + MATTRESS, BLANKET, WELL), S(MATTRESS, BLANKET, OAK)]);
  assert.equal(W(got[3]!), W(eng[3]!), 'the width stays');
  for (let i = 0; i < 3; i++) assert.deepEqual(got[i], eng[i]);
  const off = bedHud(eng, false);
  assert.deepEqual(off, eng);
  off.forEach((l, i) => assert.notEqual(l, eng[i]));
  // the boss bar on top: the hotbar line is still the last
  const boss = renderHud(SPEC.round7.situations['fable-in-use']!.state, 'boss');
  assert.equal(boss.length, 5);
  assert.ok(text(bedHud(boss, true)[4]!).includes(MATTRESS.repeat(4)));
  // anything else in the slot is left as it is
  const hot = (slot: Span[]): Span[][] => [[S('a')], [S('b')], [S('c')], [S(' '.repeat(32)), ...slot, S(' ', null, '#5D5D5D')]];
  for (const [what, slot] of [
    ['ink', [S('▄▄  ', '#FCEE4B', WELL)]], ['another background', [S('    ', null, '#5D5D5D')]], ['bold', [S('    ', null, WELL, true)]], ['three cells', [S('   ', null, WELL)]],
  ] as Array<[string, Span[]]>) assert.deepEqual(bedHud(hot(slot), true), hot(slot), what);
  assert.deepEqual(bedHud(hot([S('  ', null, WELL), S('  ', null, WELL)]), true)[3], [S(' '.repeat(32)), ...BED.slice(0, 1), S(MATTRESS + MATTRESS, BLANKET, WELL), BED[3]!, S(' ', null, '#5D5D5D')], 'split well cells');
  assert.deepEqual(bedHud([[S('short')]], true), [[S('short')]], 'a line that ends before the slot');
  assert.deepEqual(bedHud([], true), []);
});

test('idle: the last message known and 5 minutes (300 s) or more before now', () => {
  assert.equal(IDLE_SECS, 300);
  assert.deepEqual([idle(1000, null), idle(1000, 701), idle(1000, 700), idle(1000, 0), idle(1000, 2000)], [false, false, true, true, false]);
});

// ---------------------------------------------------------------------------------------------------------------------
// By hand: the phantoms (phantoms.ts)
// ---------------------------------------------------------------------------------------------------------------------

test('signs: 100 prompts, 4 hours, 2 compactions, 70% context; an unknown age is no sign', () => {
  assert.deepEqual(LONG, { turns: 100, secs: 14400, compactions: 2, ctxPct: 70 });
  const s = (turns: number, secs: number | null, compactions: number, ctxPct: number): number => signs({ turns, secs, compactions, ctxPct });
  assert.deepEqual([s(0, 0, 0, 0), s(99, 14399, 1, 69), s(100, 0, 0, 0), s(0, 14400, 0, 0), s(0, null, 2, 0), s(0, 0, 0, 70), s(100, 14400, 2, 70), s(1e6, 1e9, 99, 100)],
    [0, 0, 1, 1, 1, 1, 4, 4]);
});

test('the flock: none, one dim far phantom, else that many big ones (wings, green eyes) at the design\'s places', () => {
  assert.deepEqual([PH_DIM, PH_WING, PH_EYES], ['#3B4673', '#5468B0', '#7DFF5A']);
  assert.deepEqual([FAR, HIGH, LOW], [['🬈', '🬅'], ['🬈', '🬋', '🬅'], ['🬢', '🬭', '🬖']]);
  assert.deepEqual([flock(0), flock(-1)], [[], []]);
  assert.deepEqual(flock(1), [[FAR_COL, [S('🬈', PH_DIM), S('🬅', PH_DIM)]]]);
  assert.equal(FAR_COL, 33);
  const big = (shape: readonly string[]): Span[] => [S(shape[0]!, PH_WING), S(shape[1]!, PH_EYES), S(shape[2]!, PH_WING)];
  for (const n of [2, 3, 4]) assert.deepEqual(flock(n), SPOTS[n]!.map(([c, sh]) => [c, big(sh)]));
  assert.deepEqual(flock(5), flock(4));
  assert.deepEqual(SPOTS[4]!.map(([c]) => c), [24, 28, 32, 36]);
});

test('phantomHud: in line 1\'s sky only, the rest of the HUD as it was; 2 and 4 phantoms where the design puts them', () => {
  const eng = renderHud(NORMAL, 'off');
  assert.deepEqual(phantomHud(eng, 0), eng);
  for (const n of [1, 2, 3, 4]) {
    const got = phantomHud(eng, n);
    for (let i = 1; i < 4; i++) assert.deepEqual(got[i], eng[i]);
    const t = text(got[0]!);
    assert.equal(cellWidth(t), cellWidth(text(eng[0]!)), `${n}: the width stays`);
    assert.equal(t.slice(0, 23), 'Opus 5.5 Efficiency III');
    assert.equal(Array.from(t).slice(42).join(''), Array.from(text(eng[0]!)).slice(42).join(''), `${n}: the bubbles stay`);
  }
  const sky = (n: number): string => Array.from(text(phantomHud(eng, n)[0]!)).slice(23, 42).join('');
  assert.deepEqual([sky(1), sky(2), sky(3), sky(4)], [
    '          🬈🬅       ', '       🬈🬋🬅  🬢🬭🬖    ', '   🬈🬋🬅  🬢🬭🬖  🬈🬋🬅   ', ' 🬈🬋🬅 🬢🬭🬖 🬈🬋🬅 🬢🬭🬖   ',
  ]);
  // the boss bar on top: line 1 is the second line
  const fable = SPEC.round7.situations['fable-in-use']!.state, boss = renderHud(fable, 'boss');
  assert.deepEqual(phantomHud(boss, 2)[0], boss[0]);
  assert.ok(text(phantomHud(boss, 2)[1]!).includes('🬈🬋🬅'));
  assert.deepEqual(phantomHud([[S('a')], [S('b')], [S('c')]], 3), [[S('a')], [S('b')], [S('c')]], 'fewer than 4 lines: no line 1');
});

test('phantomHud: a phantom flies only where it and the cell before it are empty sky; past the line\'s end it pads with spaces', () => {
  const rest: Span[][] = [[S('b')], [S('c')], [S('d')]];
  // a long name in the way: the phantoms at 24 and 28 stay away, 32 and 36 fly
  const named = [S('X'.repeat(30), WHITE), S(' '.repeat(12)), S('◦', '#406580')];
  assert.equal(Array.from(text(phantomHud([named, ...rest], 4)[0]!)).slice(30).join(''), '  🬈🬋🬅 🬢🬭🬖   ◦');
  assert.equal(Array.from(text(phantomHud([[S('X'.repeat(32), WHITE), S(' '.repeat(10)), S('◦')], ...rest], 1)[0]!)).slice(32).join(''), ' 🬈🬅       ◦', 'col 32 is empty: the far one flies');
  assert.deepEqual(phantomHud([[S('X'.repeat(33), WHITE), S(' '.repeat(9)), S('◦')], ...rest], 1)[0], [S('X'.repeat(33), WHITE), S(' '.repeat(9)), S('◦')], 'col 32 taken: it stays away');
  // styled spaces, a background, a wide glyph across the cell before it: not sky
  for (const sky of [[S(' '.repeat(42), '#406580')], [S(' '.repeat(42), null, WELL)], [S(' '.repeat(42), null, null, true)], [S(' '.repeat(31)), S('日'), S(' '.repeat(9))]]) {
    assert.deepEqual(phantomHud([sky, ...rest], 1)[0], sky, JSON.stringify(sky));
  }
  // no cache (no bubbles): the name alone, so the phantoms pad their way out
  const bare = [S('Opus 5.5', '#FF55FF', null, true)];
  assert.deepEqual(phantomHud([bare, ...rest], 2)[0], [bare[0]!, S(' '.repeat(22)), S('🬈', PH_WING), S('🬋', PH_EYES), S('🬅', PH_WING), S('  '), S('🬢', PH_WING), S('🬭', PH_EYES), S('🬖', PH_WING)]);
  assert.deepEqual(phantomHud([[S('Opus')], ...rest], 1)[0], [S('Opus' + ' '.repeat(29)), S('🬈🬅', PH_DIM)]);
});

// ---------------------------------------------------------------------------------------------------------------------
// The times: the last message and the session's age (player.ts)
// ---------------------------------------------------------------------------------------------------------------------

const tx = (lastAt: number | null, needsWorker = false, running = false): TxSummary =>
  ({ hitRatio: null, lastCached: null, lastUsage: null, lastModel: null, lastEffort: null, turns: 0, compactions: 0, lastAt, running, needsWorker });

test('lastMessage: the newest of the transcript\'s last message and the prompt cache\'s last write; the TTL never decides', () => {
  const pc = (expires_at: unknown, ttl: unknown = '5m'): Payload => ({ prompt_cache: { warm: true, ttl, expires_at } } as Payload);
  assert.equal(lastMessage({}, null), null);
  assert.equal(lastMessage({}, tx(null)), null);
  assert.equal(lastMessage({}, tx(1000)), 1000);
  assert.equal(lastMessage({}, tx(1000, true)), null, 'a stale summary waiting on the worker says nothing');
  assert.equal(lastMessage(pc(1300), null), 1000, 'a 5m cache: written 300 s before it expires');
  assert.equal(lastMessage(pc(4600, '1h'), null), 1000, 'a 1h cache: written an hour before it expires');
  assert.equal(lastMessage(pc('4600', '1h'), null), 1000, 'numeric strings, as stdin may send');
  assert.equal(lastMessage(pc(1300, 'odd'), null), 1000, 'an unknown TTL is 5 minutes');
  assert.equal(lastMessage(pc(null), tx(900)), 900);
  assert.equal(lastMessage(pc(1300), tx(900)), 1000);
  assert.equal(lastMessage(pc(1300), tx(1200)), 1200);
  assert.equal(lastMessage({ prompt_cache: 'x' } as unknown as Payload, tx(5)), 5);
  // the 1-hour cache does not delay the bed: 10 minutes after the last request it is still warm, and the bed shows
  assert.equal(idle(1000 + 600, lastMessage(pc(1000 + 3600, '1h'), null)), true);
});

test('working and away: a tool call without its result is a turn in progress, never idle, however old the last message', () => {
  const pc = (expires_at: number): Payload => ({ prompt_cache: { warm: false, ttl: '5m', expires_at } } as Payload);
  assert.equal(working(null), false, 'no transcript: nothing known to run');
  assert.equal(working(tx(1000)), false);
  assert.equal(working(tx(1000, false, true)), true);
  assert.equal(working(tx(1000, true, true)), false, 'not from a stale summary waiting on the worker');
  // a long npm test: its tool_use 390 s ago, no result yet; the cache was written then too
  assert.equal(away(1390, pc(1300), tx(1000, false, true)), false, 'running: no bed');
  assert.equal(away(1390, pc(1300), tx(1000)), true, 'its result in, nothing since for 6 minutes: the bed');
  assert.equal(away(1390, {}, tx(1000, false, true)), false);
  assert.equal(away(1390, {}, tx(1000)), true);
  assert.equal(away(1299, {}, tx(1000)), false, 'less than 5 minutes');
  assert.equal(away(1390, {}, null), false, 'nothing known');
  assert.equal(away(1390, pc(1100), null), true, 'the prompt cache alone (no transcript): as before');
  assert.equal(away(1390, pc(1100), tx(1300, true, true)), true, 'a stale summary says nothing either way');
});

test('sessionSecs: stdin\'s cost.total_duration_ms, else now less the history\'s sessionStart, else unknown', () => {
  const h = (sessionStart: number | null): Hist => ({ now: 0, sessionStart, dirtySince: null, commits: 0, lastCommit: null, buckets: [] });
  assert.equal(sessionSecs({ cost: { total_duration_ms: 14_400_999 } }, 10, h(0)), 14400);
  assert.equal(sessionSecs({ cost: { total_duration_ms: '60000' } }, 10, null), 60);
  assert.equal(sessionSecs({ cost: { total_duration_ms: 0 } }, 10, h(0)), 0);
  for (const bad of [-1, 'x', null, {}]) assert.equal(sessionSecs({ cost: { total_duration_ms: bad } } as unknown as Payload, 10_000, h(4000)), 6000, String(bad));
  assert.equal(sessionSecs({ cost: 'x' } as unknown as Payload, 10_000, h(4000)), 6000);
  assert.equal(sessionSecs({}, 100, h(400)), 0, 'a clock that went back is never below 0');
  assert.equal(sessionSecs({}, 100, h(null)), null);
  assert.equal(sessionSecs({}, 100, null), null);
  assert.equal(sessionSecs({}, 100, undefined), null);
});

test('playerHud: the three layers, each in its own cells; nothing to draw is the engine\'s lines', () => {
  const eng = renderHud(NORMAL, 'off');
  assert.deepEqual(playerHud(eng, NO_PLAYER, 'D:/webapp'), eng);
  const all = playerHud(eng, { who: who({ user: 'steve', op: 'tag' }), bed: true, phantoms: 4 }, 'D:/webapp');
  assert.deepEqual(all, phantomHud(bedHud(whoHud(eng, who({ user: 'steve', op: 'tag' }), 'D:/webapp'), true), 4));
  assert.deepEqual(all, whoHud(bedHud(phantomHud(eng, 4), true), who({ user: 'steve', op: 'tag' }), 'D:/webapp'), 'in any order');
});

// ---------------------------------------------------------------------------------------------------------------------
// The HUD path: what it asks, the options, the bytes
// ---------------------------------------------------------------------------------------------------------------------

test('the HUD path asks the WhoSource only for what an option draws: user, host for user@host, the elevation check for hud.op', () => {
  const run = (hud: Partial<Config['hud']>, elevated = false, user = 'steve'): { asked: string[]; player: PlayerMarks; l3: string } => {
    const w = whoSource(user, 'DESKTOP', elevated);
    const r = renderPayload(JSON.stringify(NORMAL_P), { env: { FORCE_COLOR: '3' }, config: hudCfg(hud), sources: sources(w), now: DEMO_NOW });
    const l3 = text(r.hud!.framed[2]!);
    return { asked: w.asked, player: plain(r.hud!.player), l3: l3.slice(l3.indexOf('⌂')) };
  };
  assert.deepEqual(run({ op: 'off' }), { asked: [], player: NO_PLAYER, l3: '⌂ D:/webapp' }, 'everything off: nothing asked');
  assert.deepEqual(run({}), { asked: ['elevated'], player: NO_PLAYER, l3: '⌂ D:/webapp' }, 'no name and the tag: the operator check only');
  assert.deepEqual(run({}, true), { asked: ['elevated'], player: marks({ who: who({ op: 'tag' }) }), l3: '⌂ [OP] D:/webapp' });
  assert.deepEqual(run({ op: 'gold' }, true).player, marks({ who: who({ op: 'gold' }) }));
  assert.deepEqual(run({ user: 'user', op: 'off' }), { asked: ['user'], player: marks({ who: who({ user: 'steve' }) }), l3: '⌂ steve: D:/webapp' });
  assert.deepEqual(run({ user: 'user@host', op: 'off' }), { asked: ['user', 'host'], player: marks({ who: who({ user: 'steve', host: 'DESKTOP' }) }), l3: '⌂ steve@DESKTOP: D:/webapp' });
  assert.deepEqual(run({ user: 'user@host', op: 'off' }, false, '').asked, ['user'], 'no name: no host asked, nothing drawn');
  assert.equal(run({ user: 'user@host', op: 'off' }, false, '').l3, '⌂ D:/webapp');
  // the defaults (SPEC §0.10): the user name, and the operator check for gold
  const d = { user: defaults().hud.user, op: defaults().hud.op };
  assert.deepEqual(run(d), { asked: ['user', 'elevated'], player: marks({ who: who({ user: 'steve' }) }), l3: '⌂ steve: D:/webapp' }, 'the defaults');
  assert.deepEqual(run(d, true), { asked: ['user', 'elevated'], player: marks({ who: who({ user: 'steve', op: 'gold' }) }), l3: '⌂ steve: D:/webapp' }, 'the defaults, elevated');
  // a source without a WhoSource (the demo): nothing
  const r = renderPayload(JSON.stringify(NORMAL_P), { env: { FORCE_COLOR: '3' }, config: hudCfg({ user: 'user@host' }), sources: sources(undefined), now: DEMO_NOW });
  assert.deepEqual(plain(r.hud!.player), NO_PLAYER);
});

test('the HUD path: the bed from the last message (not the TTL), gone with the next; phantoms from the counts, the context and the age', () => {
  const run = (p: Payload, hud: Partial<Config['hud']> = {}, t: TxSummary | null = null, counts = { turns: 42, compactions: 0 }, hist: Hist | null = null): PlayerMarks =>
    plain(renderPayload(JSON.stringify(p), { env: { FORCE_COLOR: '3' }, config: hudCfg({ op: 'off', ...hud }), sources: sources(undefined, counts, t, hist), now: DEMO_NOW }).hud!.player);
  assert.equal(run(IDLE_P).bed, true, 'a 5m cache written 6 minutes ago');
  assert.equal(run(IDLE_P, { bed: 'off' }).bed, false, 'hud.bed off');
  assert.equal(run(NORMAL_P).bed, false, 'the normal day: written 48 s ago');
  const warm1h: Payload = { ...NORMAL_P, prompt_cache: { warm: true, caching_observed: true, ttl: '1h', expires_at: T(3000), hit_ratio: 0.98 } };
  assert.equal(run(warm1h).bed, true, 'a 1h cache still warm, written 10 minutes ago: the bed');
  assert.equal(run(IDLE_P, {}, tx(T(-10))).bed, false, 'the next message (the transcript\'s last row 10 s ago): gone');
  assert.equal(run({ ...NORMAL_P, prompt_cache: null }, {}, tx(T(-301))).bed, true, 'the transcript alone');
  assert.equal(run({ ...NORMAL_P, prompt_cache: null }, {}, tx(T(-301), true)).bed, false, 'not from a stale summary');
  assert.equal(run({ ...NORMAL_P, prompt_cache: null }).bed, false, 'nothing known: no bed');
  assert.equal(run(IDLE_P, {}, tx(T(-360), false, true)).bed, false, 'a tool call 6 minutes on, its result not in: Claude works, no bed');
  assert.equal(run({ ...NORMAL_P, prompt_cache: null }, {}, tx(T(-301), false, true)).bed, false, 'the transcript alone, running');
  assert.equal(run(IDLE_P, {}, tx(T(-360))).bed, true, 'once the call has its result and nothing comes for 5 minutes: the bed');
  assert.equal(run(NORMAL_P, {}, null, { turns: 100, compactions: 2 }).phantoms, 2);
  assert.equal(run(NORMAL_P, { phantoms: 'off' }, null, { turns: 100, compactions: 2 }).phantoms, 0, 'hud.phantoms off');
  assert.equal(run({ ...NORMAL_P, cost: { total_cost_usd: 3.12, total_duration_ms: 4 * 3600_000 } }).phantoms, 1, 'four hours on stdin');
  const h = (start: number): Hist => ({ now: DEMO_NOW, sessionStart: start, dirtySince: null, commits: 0, lastCommit: null, buckets: [] });
  assert.equal(run(NORMAL_P, {}, null, undefined, h(T(-14400))).phantoms, 1, 'four hours since the history\'s first render');
  assert.equal(run({ ...NORMAL_P, cost: { total_cost_usd: 3.12, total_duration_ms: 60_000 } }, {}, null, undefined, h(T(-14400))).phantoms, 0, 'stdin wins');
});

test('the HUD path from disk: the bed waits while a long tool call or a subagent runs, and lies down once the session waits on you', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hb-bed-'));
  try {
    const iso = (s: number): string => new Date(T(s) * 1000).toISOString();
    const prompt = (s: number, text: string): object => ({ parentUuid: null, isSidechain: false, type: 'user', message: { role: 'user', content: text }, uuid: `u${s}`, timestamp: iso(s), origin: { kind: 'human' } });
    const said = (s: number, msg: string, content: object[], stop = 'tool_use', more: object = {}): object => ({
      parentUuid: 'p', isSidechain: false, type: 'assistant', uuid: `a${s}`, timestamp: iso(s),
      message: { model: 'claude-opus-5-5', id: msg, type: 'message', role: 'assistant', content, stop_reason: stop, usage: { input_tokens: 5, cache_read_input_tokens: 90000, cache_creation_input_tokens: 10 } }, ...more,
    });
    const call = (id: string, name: string): object => ({ type: 'tool_use', id, name, input: {} });
    const result = (s: number, id: string): object => ({
      parentUuid: 'p', isSidechain: false, promptId: 'q', type: 'user', message: { role: 'user', content: [{ tool_use_id: id, type: 'tool_result', content: 'ok' }] },
      uuid: `r${s}`, timestamp: iso(s), toolUseResult: { stdout: 'ok' },
    });
    /** One render from disk (the default sources) of this session's transcript as it stands, with stdin's prompt cache. */
    const render = (sid: string, rows: object[], cacheAt: number): { bed: boolean; drawn: boolean } => {
      const file = join(dir, `${sid}.jsonl`);
      appendFileSync(file, rows.map((r) => JSON.stringify(r) + '\n').join(''));
      const p = { ...NORMAL_P, cwd: dir, workspace: { current_dir: dir, project_dir: dir }, transcript_path: file, session_id: sid, prompt_cache: { warm: false, caching_observed: true, ttl: '5m', expires_at: T(cacheAt + 300), hit_ratio: 0.98 } };
      const env = { HUNGERBAR_CACHE_DIR: join(dir, 'cache'), CLAUDE_CONFIG_DIR: join(dir, 'claude'), HUNGERBAR_NO_SPAWN: '1', HUNGERBAR_ELEVATED: '0', FORCE_COLOR: '3', PATH: '' };
      const r = renderPayload(JSON.stringify(p), { env, config: hudCfg(), now: DEMO_NOW });
      assert.ok(r.hud, sid);
      return { bed: r.hud.player.bed, drawn: r.hud.framed.some((l) => text(l).includes(MATTRESS.repeat(4))) };
    };
    // a long npm test: typed 400 s ago, its Bash call 390 s ago, no result yet; the cache was written with the call
    assert.deepEqual(render('bash', [prompt(-400, 'run the tests'), said(-390, 'm1', [call('t1', 'Bash')])], -390), { bed: false, drawn: false }, 'Claude works: no bed');
    // its result 310 s ago and the closing reply 305 s ago, then nothing: the session waits on you
    assert.deepEqual(render('bash', [result(-310, 't1'), said(-305, 'm2', [{ type: 'text', text: 'all green' }], 'end_turn')], -310), { bed: true, drawn: true });
    // the next message: gone
    assert.deepEqual(render('bash', [prompt(-2, 'thanks')], -310), { bed: false, drawn: false });
    // a subagent: its Agent call 360 s ago; only its own sidechain rows and a progress row since
    assert.deepEqual(render('agent', [
      prompt(-900, 'run the long workflow'), said(-360, 'm1', [call('t1', 'Agent')]),
      said(-30, 's1', [{ type: 'text', text: 'working' }], 'end_turn', { isSidechain: true }),
      { type: 'progress', uuid: 'p1', timestamp: iso(-5), data: { type: 'agent_progress' } },
    ], -360), { bed: false, drawn: false }, 'the subagent works: no bed');
    // a question for you 600 s ago (AskUserQuestion waits on the person): the bed
    assert.deepEqual(render('ask', [prompt(-700, 'plan it'), said(-600, 'm1', [call('t1', 'AskUserQuestion')])], -600), { bed: true, drawn: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('bytes: the bed and the phantoms at 24-bit and 256 colours are the independent encoder\'s', () => {
  for (const rows of [opt('bed-blocks').rows, opt('op-tag').rows, opt('op-name').rows, TL.rows]) {
    for (const r of rows) {
      for (const depth of ['truecolor', '256'] as const) {
        assert.equal(encode(r.lines as Span[][], depth, { bold: true, nbsp: true }), sgrOracle(r.lines, { depth }), `${r.label} ${depth}`);
      }
    }
  }
  const idleRow = opt('bed-blocks').rows[1]!.lines as Span[][];
  assert.ok(encode(idleRow, 'truecolor', { bold: true, nbsp: false }).includes('\x1b[38;2;233;236;236;48;2;156;127;78m\u{1FB84}\x1b[0m'));
});

test('glyphs: the bed and the phantoms are 1 cell each and on glyphs --hud; the name and the tag are ASCII', () => {
  for (const g of [MATTRESS, ...FAR, ...HIGH, ...LOW]) {
    assert.equal(cellWidth(g), 1, `U+${g.codePointAt(0)!.toString(16).toUpperCase()}`);
    assert.ok(HUD_GLYPHS.some(([h]) => h === g), `U+${g.codePointAt(0)!.toString(16).toUpperCase()} on glyphs --hud`);
  }
  assert.match('[OP]@: ', /^[\x20-\x7e]+$/);
});

// ---------------------------------------------------------------------------------------------------------------------
// Against the tests' own layers
// ---------------------------------------------------------------------------------------------------------------------

/** Seeded player marks; a quarter of them draw nothing. */
function playerState(r: Rng): PlayerMarks {
  if (chance(r, 0.25)) return NO_PLAYER;
  const name = (): string => pick(r, ['steve', 'Steve', 'u'.repeat(int(r, 1, 40)), '日本語', ...TEXTS.filter((t) => t.length && !/^\s|\s$/u.test(t) && t.length < 60)]);
  const user = chance(r, 0.6) ? name() : null;
  return {
    who: { user, host: user && chance(r, 0.5) ? name() : null, op: pick(r, [null, null, 'tag', 'gold'] as const) },
    bed: chance(r, 0.4),
    phantoms: int(r, 0, 4),
  };
}

function* inputs(): Generator<[string, unknown]> {
  for (const [k, s] of Object.entries(STATES)) yield [`states.${k}`, s];
  for (const [k, s] of Object.entries(SPEC.round7.situations)) yield [`round7.${k}`, s.state];
  for (let i = 0; i < SESSION.frames.length; i += 7) yield [`frame ${i}`, SESSION.frames[i]];
  const r = mulberry32(0x50a7);
  const bases = [...Object.values(STATES), ...Object.values(SPEC.round7.situations).map((s) => s.state)];
  for (let k = 0; k < 300; k++) yield [`fuzz state #${k}`, fuzzState(r, bases)];
}

test('the layers equal the tests\' layers on the reference states, the time-lapse and fuzz, x seeded marks x the 5 fable ids', () => {
  const r = mulberry32(0xbed);
  let named = 0, beds = 0, flew = 0, kept = 0;
  for (const [what, st] of inputs()) {
    for (const id of FABLE_IDS) {
      const m = playerState(r);
      const eng = renderHud(st, id);
      const got = frameHud(playerHud(eng, m, cwdOf(st)));
      const want = frameOracle(playerOracle(MIX.render(st, picked(`fable-${id}`)), st, m as OraclePlayer), st);
      assert.deepEqual(tuples(got as RefLines), plain(tuples(want)), `${what} ${id} ${JSON.stringify(m)}`);
      for (const l of got) assert.ok(cellWidth(text(l)) <= 110 && !/^\s/u.test(text(l)), `${what} ${id}: ${cellWidth(text(l))} cells`);
      const n = eng.length;
      if (m.who.user && text(got[n - 2]!).includes(m.who.user)) named++;
      if (m.bed && text(got[n - 1]!).includes(MATTRESS)) beds++;
      if (m.phantoms && /[\u{1FB05}\u{1FB08}\u{1FB22}]/u.test(text(got[n - 4]!))) flew++;
      if (m.phantoms && !/[\u{1FB05}\u{1FB08}\u{1FB22}]/u.test(text(got[n - 4]!))) kept++;
    }
  }
  assert.ok(named > 300 && beds > 400 && flew > 800 && kept > 5, JSON.stringify({ named, beds, flew, kept }));
});
