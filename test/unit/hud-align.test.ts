// The HUD's centring (src/hud/align.ts, SPEC §0.9, 0.6.0): the offset by hand (B even and odd, unknown, smaller than the
// widest line, a long branch that widens line 4, the boss line on top), the lead as spans and as bytes at 24-bit and 256
// colours, renderPayload with a known and an unknown width for both aligns, and the offset against the tests' own
// (test/hud/align-oracle.ts, found by search) on the reference states, the time-lapse and fuzz states x the 5 fable ids x
// every budget from 0 to 220. With left nothing moves: the bytes are those of 0.5.1.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaults, type Config, type HudAlign } from '../../src/config.ts';
import { DEMOS, DEMO_NOW, demoSources } from '../../src/demo.ts';
import { centreOffset, HOTBAR_CENTRE, hudOffset, shiftHud } from '../../src/hud/align.ts';
import { FABLE_IDS, renderHud } from '../../src/hud/fable.ts';
import { BLANK, EDGE, frameHud, HOTBAR, MINT, spanAt } from '../../src/hud/frame.ts';
import { encode } from '../../src/hud/look.ts';
import { S, W, type Span } from '../../src/hud/spans.ts';
import { renderPayload } from '../../src/render.ts';
import { centredText, centreOracle, widestOf } from '../hud/align-oracle.ts';
import { frameOracle } from '../hud/frame-oracle.ts';
import { mulberry32, state as fuzzState } from '../hud/fuzz.ts';
import { cellWidth, picked, MIX, SESSION, SPEC, STATES, type RefState } from '../hud/ref.ts';
import { sgrOracle } from '../hud/sgr-oracle.ts';

const text = (l: readonly Span[]): string => l.map((s) => s.t).join('');
const ON = { bold: true, nbsp: true };
const NORMAL: RefState = STATES.normal;
const FABLE: RefState = SPEC.round7.situations['fable-in-use']!.state;
/** A branch long enough that line 4 reaches the engine's 110 cells (it shortens the branch from the front to fit). */
const LONG: RefState = { ...STATES.normal, branch: 'feature/' + 'x'.repeat(120) };

test('centreOffset: floor(B / 2) - 39, kept between 0 and B - W; 0 for an unknown budget', () => {
  assert.equal(HOTBAR_CENTRE, Math.ceil((HOTBAR[0] + HOTBAR[1] - 1) / 2), 'the middle of cols 16-61, rounded right');
  const cases: Array<[number | null, number, number, string]> = [
    [null, 0, 0, 'unknown width'], [null, 81, 0, 'unknown width'],
    [116, 81, 19, 'B even: 58 - 39'], [117, 81, 19, 'B odd: floor(58.5) - 39'], [118, 81, 20, 'B even'], [96, 81, 9, 'B even'], [97, 81, 9, 'B odd'],
    [80, 81, 0, 'B smaller than W'], [80, 62, 1, 'room for 1'], [79, 62, 0, 'floor(39.5) - 39 = 0'], [77, 62, 0, 'floor(38.5) - 39 < 0'],
    [116, 110, 6, 'the widest line limits it to B - W'], [117, 110, 7, 'B odd, limited'], [200, 110, 61, 'room'], [201, 110, 61, 'B odd, room'],
    [100, 110, 0, 'W past B'], [62, 62, 0, 'the smallest minWidth'], [0, 0, 0, 'no budget'], [-3, 0, 0, 'a negative budget (COLUMNS=1)'],
  ];
  for (const [b, w, want, what] of cases) assert.equal(centreOffset(b, w), want, `B ${b}, W ${w}: ${what}`);
  // with room and B even the hotbar is exactly in the middle: as many cells left of it as right of it; B odd: one more on the right
  for (let b = 78; b <= 221; b++) {
    const o = centreOffset(b, 62), left = HOTBAR[0] + o, right = b - (HOTBAR[1] + o);
    assert.equal(right - left, b % 2, `B ${b}`);
  }
});

test('hudOffset: left never moves; center measures the widest line of this render (a long branch, the boss line)', () => {
  const normal = frameHud(renderHud(NORMAL, 'off')), w = Math.max(...normal.map(W));
  assert.equal(w, W(normal[3]!), 'the normal day: the hotbar line is the widest');
  for (const b of [null, -3, 0, 62, 80, 96, 116, 117, 200]) {
    assert.equal(hudOffset('left', b, normal), 0, `left at ${b}`);
    assert.equal(hudOffset('center', b, normal), centreOffset(b, w), `center at ${b}`);
  }
  assert.deepEqual([null, 80, 96, 116, 117, 140, 200].map((b) => hudOffset('center', b, normal)), [0, 0, 9, 19, 19, 31, 61]);
  // a long branch: line 4 reaches 110 cells, so the room limits the offset
  const long = frameHud(renderHud(LONG, 'off'));
  assert.deepEqual(long.map(W).slice(3), [110, 62]);
  assert.deepEqual([96, 116, 117, 140, 200].map((b) => hudOffset('center', b, long)), [0, 6, 7, 30, 61]);
  // the boss line on top is measured with the rest
  const boss = frameHud(renderHud(FABLE, 'boss'));
  assert.equal(boss.length, 6);
  for (const b of [96, 116, 150]) assert.equal(hudOffset('center', b, boss), centreOffset(b, Math.max(...boss.map(W))), `boss at ${b}`);
  const wide = [...boss.slice(0, 1).map(() => [S('x'.repeat(100))]), ...boss.slice(1)];
  assert.equal(hudOffset('center', 116, wide), 16, 'a wider first line limits it too');
  assert.equal(hudOffset('center', 116, []), 19, 'no lines: nothing limits it');
});

test('shiftHud by hand: an unstyled lead before each first cell; an unstyled first span takes it in; an empty line stays empty', () => {
  const lines: Span[][] = [
    [S('Opus', '#FFAA00', null, true), S(' x')],
    [S(BLANK.repeat(9)), S(EDGE.repeat(6), '#5D5D5D')],
    [],
    [S(' a')],
    [S('b', null, '#201E07')],
    [S('c', null, null, true)],
    [S('d', '#FFFFFF')],
  ];
  const before = JSON.stringify(lines), lead = BLANK.repeat(3);
  assert.deepEqual(shiftHud(lines, 3), [
    [S(lead), S('Opus', '#FFAA00', null, true), S(' x')],
    [S(BLANK.repeat(12)), S(EDGE.repeat(6), '#5D5D5D')],
    [],
    [S(lead + ' a')],
    [S(lead), S('b', null, '#201E07')],
    [S(lead), S('c', null, null, true)],
    [S(lead), S('d', '#FFFFFF')],
  ]);
  assert.equal(JSON.stringify(lines), before, 'the input is not changed');
  for (const o of [0, -1]) {
    const same = shiftHud(lines, o);
    assert.deepEqual(same, lines, `offset ${o}`);
    assert.notEqual(same[0], lines[0], 'a copy');
  }
});

test('the boss line and the frame: every line moves by the same offset, so the grid stays aligned', () => {
  const f = frameHud(renderHud(FABLE, 'boss'));
  const col = (l: readonly Span[], ch: string): number => cellWidth(text(l).slice(0, text(l).indexOf(ch)));
  assert.deepEqual([col(f[0]!, EDGE), col(f[4]!, '⛏'), col(f[5]!, EDGE)], [HOTBAR[0], HOTBAR[0] + 1, 9]);
  for (const o of [1, 9, 19, 61]) {
    const s = shiftHud(f, o);
    assert.equal(s.length, 6);
    s.forEach((l, i) => {
      assert.equal(text(l), BLANK.repeat(o) + text(f[i]!), `line ${i + 1}: the lead, then the line as it was`);
      assert.equal(W(l), W(f[i]!) + o, `line ${i + 1}`);
    });
    // the boss bar over the hotbar, the pickaxe in slot 1, the offhand's edge and the mint under the selected slot
    assert.deepEqual([col(s[0]!, EDGE), col(s[4]!, '⛏'), col(s[5]!, EDGE)], [HOTBAR[0] + o, HOTBAR[0] + 1 + o, 9 + o]);
    assert.equal(spanAt(s[5]!, HOTBAR[0] + o)?.fg, MINT);
    assert.ok(spanAt(s[5]!, HOTBAR[0] + o - 1)!.t.startsWith(BLANK), 'col 15 + o is the gap');
    assert.deepEqual(s[5]![0], S(BLANK.repeat(9 + o)), "the frame row's own lead grows");
  }
});

test('bytes at 24-bit and 256 colours: the lead is bare U+2800 before each line, with bold and nbsp on or off, and trim keeps it', () => {
  for (const [s, id] of [[NORMAL, 'off'], [FABLE, 'boss'], [STATES.extra, 'beacon'], [LONG, 'tail'], [STATES.fresh, 'tooltip']] as const) {
    const f = frameHud(renderHud(s, id)), ref = frameOracle(MIX.render(s, picked(`fable-${id}`)), s);
    for (const depth of ['truecolor', '256'] as const) for (const opts of [ON, { bold: false, nbsp: true }, { bold: true, nbsp: false }, { bold: false, nbsp: false }]) {
      const left = encode(f, depth, opts);
      assert.equal(left, sgrOracle(ref, { depth, ...opts }), `${id} ${depth}: the bytes of 0.5.1`);
      for (const o of [1, 19, 61]) {
        const got = encode(shiftHud(f, o), depth, opts);
        assert.equal(got, left.split('\n').map((l) => BLANK.repeat(o) + l).join('\n'), `${id} ${depth} ${o}`);
        for (const l of got.split('\n')) assert.equal(l.trim(), l, 'U+2800 is not whitespace: the lead survives the trim');
      }
      for (const b of [null, 80, 96, 116, 117, 160]) {
        assert.equal(encode(shiftHud(f, hudOffset('center', b, f)), depth, opts), centredText(sgrOracle(ref, { depth, ...opts }), ref, b), `${id} ${depth} at ${b}`);
      }
    }
  }
});

const DEMO = DEMOS.normal!;
function run(align: HudAlign, env: Record<string, string>, more: Partial<Config> = {}): ReturnType<typeof renderPayload> {
  const config: Config = { ...defaults(), look: 'hud', ...more, hud: { ...defaults().hud, align } };
  return renderPayload(JSON.stringify(DEMO.payload), { env, config, sources: demoSources(DEMO), now: DEMO_NOW });
}

test('renderPayload: center with a known width moves the HUD; left, an unknown width or no room draw the bytes of before', () => {
  const left = run('left', { FORCE_COLOR: '3' });
  assert.ok(left.hud);
  assert.equal(left.hud.offset, 0);
  assert.equal(left.text, encode(left.hud.framed, 'truecolor', defaults()), 'the framed lines, as 0.5.1 drew them');
  for (const env of [{ COLUMNS: '120' }, { COLUMNS: '200' }, { HUNGERBAR_WIDTH: '150' }, { COLUMNS: '84' }]) {
    const r = run('left', { FORCE_COLOR: '3', ...env });
    assert.deepEqual([r.text, r.hud?.offset], [left.text, 0], `left at ${JSON.stringify(env)}`);
  }
  assert.equal(run('center', { FORCE_COLOR: '3' }).text, left.text, 'center with an unknown width');
  const w = Math.max(...left.hud.framed.map(W));
  assert.equal(w, 81, 'the normal day demo: 📖42 makes the hotbar line 81 cells');
  assert.equal(run('center', { FORCE_COLOR: '3', COLUMNS: '84' }).text, left.text, 'center with no room: budget 80, the widest line 81');
  for (const [env, depth, b, o] of [
    [{ FORCE_COLOR: '3', COLUMNS: '100' }, 'truecolor', 96, 9],
    [{ FORCE_COLOR: '3', COLUMNS: '120' }, 'truecolor', 116, 19],
    [{ FORCE_COLOR: '2', COLUMNS: '121' }, '256', 117, 19],
    [{ FORCE_COLOR: '2', COLUMNS: '122' }, '256', 118, 20],
    [{ FORCE_COLOR: '3', HUNGERBAR_WIDTH: '200', COLUMNS: '90' }, 'truecolor', 196, 59],
  ] as const) {
    const r = run('center', env);
    assert.ok(r.hud, JSON.stringify(env));
    assert.equal(r.hud.offset, o, JSON.stringify(env));
    assert.equal(r.hud.offset, centreOffset(b, w));
    assert.equal(r.text, encode(shiftHud(r.hud.framed, o), depth, defaults()));
    assert.equal(r.text, centredText(encode(r.hud.framed, depth, defaults()), r.hud.framed, b), "the tests' centring");
    assert.deepEqual(r.hud.framed, run('left', env).hud!.framed, 'the framed lines are the same; only the bytes move');
  }
  // widthReserve is part of the budget, as for the gate: 200 - 4 - 40 = 156
  assert.equal(run('center', { FORCE_COLOR: '3', COLUMNS: '200' }, { widthReserve: 40 }).hud!.offset, 39);
  // the boss line moves with the rest
  const fable = DEMOS.fable!;
  const config: Config = { ...defaults(), look: 'hud', hud: { ...defaults().hud, fable: 'boss', align: 'center' }, network: { ...defaults().network, usageApi: true, scopedWeekly: true } };
  const boss = renderPayload(JSON.stringify(fable.payload), { env: { FORCE_COLOR: '3', COLUMNS: '120' }, config, sources: demoSources(fable), now: DEMO_NOW });
  const o = boss.hud!.offset, lead = (l: string): number => /^⠀*/u.exec(l)![0].length;
  assert.equal(o, centreOffset(116, Math.max(...boss.hud!.framed.map(W))));
  assert.ok(o > 0);
  assert.deepEqual(boss.text.split('\n').map(lead), boss.hud!.framed.map((l) => lead(text(l)) + o), "all 6 lines, the frame row's lead grown");
  assert.equal(boss.text.split('\n').length, 6);
});

test("the offset equals the tests' (found by search) on the reference states, the time-lapse and fuzz x 5 fable ids x budgets 0-220", () => {
  const r = mulberry32(0xa119);
  const bases = [...Object.values(STATES), ...Object.values(SPEC.round7.situations).map((v) => v.state)];
  const states: unknown[] = [...bases, LONG, ...SESSION.frames.filter((_, i) => i % 23 === 0), ...Array.from({ length: 40 }, () => fuzzState(r, bases))];
  const budgets = [null, ...Array.from({ length: 221 }, (_, b) => b)];
  let n = 0, moved = 0, limited = 0, none = 0;
  for (const s of states) for (const id of FABLE_IDS) {
    const f = frameHud(renderHud(s, id)), widest = widestOf(f);
    assert.equal(widest, Math.max(...f.map(W)), 'the port measures as the engine does');
    for (const b of budgets) {
      const o = hudOffset('center', b, f);
      assert.equal(o, centreOracle(b, widest), `B ${b}, W ${widest}`);
      if (b !== null && widest <= b) assert.ok(widest + o <= b, 'nothing is pushed past the edge');
      if (o === 0) none++;
      else if (o < Math.floor(b! / 2) - HOTBAR_CENTRE) limited++;
      else moved++;
      n++;
    }
  }
  assert.ok(n > 50000 && moved > 10000 && limited > 1000 && none > 10000, JSON.stringify({ n, moved, limited, none }));
});
