// The HUD look's writer and gate (src/hud/look.ts, plan §9): encode() by hand-written bytes and against the independent
// encoder of the tests (test/hud/sgr-oracle.ts) on every reference state x the 5 fable ids x both depths x bold and nbsp
// on and off; its 256-colour index against the oracle's; the gate's truth table (look x invalid config x depth x ASCII x
// budget), also through loadConfig and detectDepth.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { bgParams, detectDepth, to256 } from '../../src/color.ts';
import { loadConfig, type Config } from '../../src/config.ts';
import type { Env } from '../../src/env.ts';
import type { Payload } from '../../src/payload.ts';
import type { Sources, State } from '../../src/state.ts';
import { FABLE_IDS, renderHud } from '../../src/hud/fable.ts';
import { frameHud } from '../../src/hud/frame.ts';
import { hudOffset, shiftHud } from '../../src/hud/align.ts';
import { encode, hudGate, renderHudLook } from '../../src/hud/look.ts';
import { S, type Span } from '../../src/hud/spans.ts';
import { sgrOracle, xterm256 } from '../hud/sgr-oracle.ts';
import { plainDefaults } from '../plain-config.ts';

const ON = { bold: true, nbsp: true };
const NB = '\u00a0';

test('encode: params in the order bold, fg, bg; a styled span ends in a reset, a bare one is its text', () => {
  const line: Span[] = [S('Opus', '#FF55FF', null, true), S(' ', null, '#5D5D5D'), S('x'), S('▐', '#D5E8D0', '#5D5D5D'), S('!', null, null, true)];
  assert.equal(encode([line], 'truecolor', ON),
    `\x1b[1;38;2;255;85;255mOpus\x1b[0m\x1b[48;2;93;93;93m${NB}\x1b[0mx\x1b[38;2;213;232;208;48;2;93;93;93m▐\x1b[0m\x1b[1m!\x1b[0m`);
  assert.equal(encode([line], '256', ON), `\x1b[1;38;5;207mOpus\x1b[0m\x1b[48;5;59m${NB}\x1b[0mx\x1b[38;5;253;48;5;59m▐\x1b[0m\x1b[1m!\x1b[0m`);
});

test('encode: lines joined with \\n and no trailing newline; nothing in, nothing out', () => {
  assert.equal(encode([[S('a', '#AAAAAA')], [], [S('b')]], 'truecolor', ON), '\x1b[38;2;170;170;170ma\x1b[0m\n\nb');
  assert.equal(encode([], 'truecolor', ON), '');
  assert.equal(encode([[]], '256', ON), '');
});

test('encode: nbsp turns every space into U+00A0, background cells included; nbsp:false keeps them', () => {
  const line: Span[] = [S('⛏ ', '#55FFFF', '#2E1A3A'), S('  ', null, '#201E07'), S('a b  c')];
  assert.equal(encode([line], 'truecolor', ON),
    `\x1b[38;2;85;255;255;48;2;46;26;58m⛏${NB}\x1b[0m\x1b[48;2;32;30;7m${NB}${NB}\x1b[0ma${NB}b${NB}${NB}c`);
  assert.equal(encode([line], 'truecolor', { bold: true, nbsp: false }),
    '\x1b[38;2;85;255;255;48;2;46;26;58m⛏ \x1b[0m\x1b[48;2;32;30;7m  \x1b[0ma b  c');
  assert.equal(encode([[S('\t\u2003x')]], '256', ON), '\t\u2003x', 'only U+0020 is replaced');
});

test('encode: bold:false drops the bold, and a span that was only bold becomes bare text', () => {
  const line: Span[] = [S('Opus', '#FF55FF', null, true), S('III', null, null, true)];
  assert.equal(encode([line], 'truecolor', { bold: false, nbsp: true }), '\x1b[38;2;255;85;255mOpus\x1b[0mIII');
  assert.equal(encode([line], '256', { bold: false, nbsp: false }), '\x1b[38;5;207mOpus\x1b[0mIII');
});

test('bgParams: 48;2;R;G;B at 24-bit, 48;5;n through to256 at 256', () => {
  assert.equal(bgParams('#FFAA00', 'truecolor'), '48;2;255;170;0');
  assert.equal(bgParams('#201E07', 'truecolor'), '48;2;32;30;7');
  assert.equal(bgParams('#FFAA00', '256'), '48;5;214');
  assert.equal(bgParams('#201E07', '256'), '48;5;234');
  assert.equal(bgParams('#5d5d5d', '256'), '48;5;59');
});

test("to256 (the writer's 256-colour index) equals the test oracle's on every grey, every mix of cube levels and ties, and 60,000 colours", () => {
  const hex = (r: number, g: number, b: number): string => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  let n = 0;
  const check = (r: number, g: number, b: number): void => {
    const h = hex(r, g, b);
    if (to256(h) !== xterm256(h)) assert.fail(`${h}: to256 ${to256(h)}, oracle ${xterm256(h)}`);
    n++;
  };
  for (let v = 0; v < 256; v++) check(v, v, v);
  // every mix of the cube levels and the midpoints between them (the ties), ±1
  const edges = new Set<number>();
  for (const v of [0, 47, 48, 95, 115, 135, 155, 175, 195, 215, 235, 255]) for (const d of [-1, 0, 1]) if (v + d >= 0 && v + d <= 255) edges.add(v + d);
  const E = [...edges];
  for (const r of E) for (const g of E) for (const b of E) check(r, g, b);
  let seed = 0x5eed;
  const rnd = (): number => ((seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) | 0) >>> 0) % 256;
  for (let i = 0; i < 60000; i++) check(rnd(), rnd(), rnd());
  assert.ok(n > 80000, `${n} colours`);
});

// The reference states: round 4's four situations, the 25 round-6 inputs and the 19 round-7 situations (scoped limits:
// the boss line, the tooltip, the beacon).
const REF = new URL('../reference/', import.meta.url);
const readRef = (f: string): any => JSON.parse(readFileSync(new URL(f, REF), 'utf8'));
const spec = readRef('hud-spec.json');
const STATES: Array<[string, unknown]> = [
  ...Object.entries(readRef('hud4-states.json') as Record<string, unknown>).map(([k, v]): [string, unknown] => [`states ${k}`, v]),
  ...Object.entries(spec.round6.inputs as Record<string, { state: unknown }>).map(([k, v]): [string, unknown] => [`round 6 ${k}`, v.state]),
  ...Object.entries(spec.round7.situations as Record<string, { state: unknown }>).map(([k, v]): [string, unknown] => [`round 7 ${k}`, v.state]),
];

test('encode equals the independent encoder on every reference state x 5 fable ids x both depths x bold and nbsp on and off', () => {
  assert.equal(STATES.length, 48);
  let n = 0, five = 0, bg = 0;
  for (const [what, s] of STATES) for (const id of FABLE_IDS) {
    const lines = renderHud(s, id);
    if (lines.length === 5) five++;
    for (const depth of ['truecolor', '256'] as const) for (const bold of [true, false]) for (const nbsp of [true, false]) {
      const mine = encode(lines, depth, { bold, nbsp });
      assert.equal(mine, sgrOracle(lines, { depth, bold, nbsp }), `${what}, fable-${id}, ${depth}, bold ${bold}, nbsp ${nbsp}`);
      for (const l of mine.split('\n')) {
        // no line ends with a bare space, and a line that ends in a styled span ends in a reset (CC trims lines)
        assert.ok(!/[ \u00a0]$/.test(l), `${what}, fable-${id}: a line ends with an unstyled space`);
        if (l.endsWith('\x1b[0m')) n++;
      }
      if (/\x1b\[[0-9;]*48;/.test(mine)) bg++;
    }
  }
  assert.ok(five >= 1, 'the boss line was drawn');
  assert.ok(n > 0 && bg > 0);
});

// ---------------- the gate ----------------
const cfgOf = (look: Config['look'], icons: Config['icons'] = 'minecraft', minWidth = 80, widthReserve = 0): Config =>
  ({ ...plainDefaults(), look, icons, widthReserve, hud: { ...plainDefaults().hud, fable: 'boss', minWidth } });

test('gate truth table: look x invalid config x depth x ASCII x budget, the first failing reason wins', () => {
  type Ascii = 'no' | 'icons' | 'HUNGERBAR_ASCII' | 'TERM';
  // [env, minWidth, widthReserve, budget (null: unknown), allowed]
  const widths: Array<[Env, number, number, number | null, boolean]> = [
    [{}, 80, 0, null, true],
    [{ COLUMNS: 'abc' }, 80, 0, null, true],
    [{ COLUMNS: '0' }, 200, 0, null, true],
    [{ COLUMNS: '84' }, 80, 0, 80, true],
    [{ COLUMNS: '83' }, 80, 0, 79, false],
    [{ COLUMNS: '60', HUNGERBAR_WIDTH: '204' }, 200, 0, 200, true],
    [{ COLUMNS: '300', HUNGERBAR_WIDTH: '84' }, 80, 1, 79, false],
    [{ COLUMNS: '120' }, 80, 40, 76, false],
    [{ COLUMNS: '66' }, 62, 0, 62, true],
    [{ COLUMNS: '1' }, 62, 0, -3, false],
  ];
  let n = 0, oks = 0;
  for (const look of ['classic', 'hud'] as const) for (const error of [null, 'Unexpected token } in JSON']) {
    for (const depth of ['none', '16', '256', 'truecolor'] as const) for (const ascii of ['no', 'icons', 'HUNGERBAR_ASCII', 'TERM'] as Ascii[]) {
      for (const [wenv, minWidth, reserve, b, wide] of widths) {
        const env: Env = { ...wenv, ...(ascii === 'HUNGERBAR_ASCII' ? { HUNGERBAR_ASCII: '1' } : ascii === 'TERM' ? { TERM: 'dumb' } : {}) };
        const g = hudGate(cfgOf(look, ascii === 'icons' ? 'ascii' : 'minecraft', minWidth, reserve), error, depth, env);
        const what = `${look}, error ${error !== null}, ${depth}, ascii ${ascii}, ${JSON.stringify(wenv)} minWidth ${minWidth} reserve ${reserve}`;
        const want = error !== null ? /^hungerbar\.json is invalid$/
          : look !== 'hud' ? /^look is classic$/
          : depth === 'none' ? /^no colour/
          : depth === '16' ? /^16 colours/
          : ascii !== 'no' ? /^ASCII mode/
          : !wide ? new RegExp(`^budget ${b} is below hud\\.minWidth ${minWidth}$`)
          : null;
        if (want === null) {
          assert.deepEqual(g, { ok: true, depth }, what);
          oks++;
        } else {
          assert.equal(g.ok, false, what);
          assert.match((g as { reason: string }).reason, want, what);
        }
        n++;
      }
    }
  }
  assert.equal(n, 2 * 2 * 4 * 4 * widths.length);
  assert.equal(oks, 2 * widths.filter((w) => w[4]).length);
});

test('gate through loadConfig and detectDepth: HUNGERBAR_LOOK, an invalid file, FORCE_COLOR, NO_COLOR, TERM=dumb', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hb-gate-'));
  try {
    const path = join(dir, 'hungerbar.json');
    const gate = (env: Env) => {
      const l = loadConfig({ HUNGERBAR_CONFIG: path, ...env });
      return hudGate(l.cfg, l.error, detectDepth(l.cfg.color, l.cfg.colorDepth, env), env);
    };
    // no file: the HUD (the default, SPEC §0.10), unless HUNGERBAR_LOOK says classic
    assert.deepEqual(gate({ FORCE_COLOR: '3' }), { ok: true, depth: 'truecolor' });
    assert.deepEqual(gate({ FORCE_COLOR: '3', HUNGERBAR_LOOK: 'classic' }), { ok: false, reason: 'look is classic' });
    writeFileSync(path, JSON.stringify({ look: 'classic' }));
    assert.deepEqual(gate({ FORCE_COLOR: '3' }), { ok: false, reason: 'look is classic' });
    assert.deepEqual(gate({ FORCE_COLOR: '3', HUNGERBAR_LOOK: 'hud' }), { ok: true, depth: 'truecolor' });
    writeFileSync(path, JSON.stringify({ look: 'hud', hud: { fable: 'fable-boss', minWidth: 100 } }));
    assert.deepEqual(gate({ WT_SESSION: 'x' }), { ok: true, depth: 'truecolor' });
    assert.deepEqual(gate({ FORCE_COLOR: '2' }), { ok: true, depth: '256' });
    assert.deepEqual(gate({ FORCE_COLOR: '3', HUNGERBAR_LOOK: 'classic' }), { ok: false, reason: 'look is classic' });
    assert.deepEqual(gate({ FORCE_COLOR: '3', HUNGERBAR_LOOK: 'HUD' }), { ok: true, depth: 'truecolor' }, 'an unknown HUNGERBAR_LOOK is ignored');
    assert.match((gate({ FORCE_COLOR: '1' }) as { reason: string }).reason, /^16 colours/);
    assert.match((gate({ NO_COLOR: '1', FORCE_COLOR: '3' }) as { reason: string }).reason, /^no colour/);
    assert.match((gate({ FORCE_COLOR: '3', TERM: 'dumb' }) as { reason: string }).reason, /^ASCII mode/);
    assert.match((gate({ FORCE_COLOR: '3', HUNGERBAR_ASCII: '1' }) as { reason: string }).reason, /^ASCII mode/);
    assert.deepEqual(gate({ FORCE_COLOR: '3', COLUMNS: '103' }), { ok: false, reason: 'budget 99 is below hud.minWidth 100' });
    assert.deepEqual(gate({ FORCE_COLOR: '3', COLUMNS: '104' }), { ok: true, depth: 'truecolor' });
    // an invalid file is classic with cfg!, even when HUNGERBAR_LOOK says hud
    writeFileSync(path, '{ "look": "hud", }');
    const bad = loadConfig({ HUNGERBAR_CONFIG: path, HUNGERBAR_LOOK: 'hud' });
    assert.ok(bad.error);
    assert.equal(bad.cfg.look, 'hud');
    assert.deepEqual(gate({ FORCE_COLOR: '3', HUNGERBAR_LOOK: 'hud' }), { ok: false, reason: 'hungerbar.json is invalid' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('renderHudLook encodes what the engine drew from its input, framed (and centred): the bytes are encode(frameHud(lines)), the lines renderHud(input)', () => {
  const st = { model: 'Opus 5.5', effort: 'high', ctx: { pct: 8, tokens: 81000, size: 1e6, dim: false }, git: { isRepo: false, branch: null, added: null, removed: null },
    branchFull: null, cwdFull: 'D:/webapp', h5: null, week: null, cache: null, extra: null, scoped: [], version: '2.1.306' } as unknown as State;
  const src = { counts: () => ({ turns: 3, compactions: 1 }), history: () => null, transcript: () => null } as unknown as Sources;
  for (const depth of ['truecolor', '256'] as const) {
    const h = renderHudLook(st, {} as Payload, src, cfgOf('hud'), depth, null);
    assert.deepEqual(h.lines, renderHud(h.input, 'boss'));
    assert.deepEqual(h.framed, frameHud(h.lines));
    assert.equal(h.framed.length, h.lines.length + 1, 'the bottom edge row');
    assert.equal(h.text, encode(h.framed, depth, ON));
    assert.deepEqual([h.input.turns, h.input.compactions, h.input.hist], [3, 1, null]);
    // left never moves, whatever the budget; center moves the framed lines by hudOffset (0.6.0)
    assert.equal(h.offset, 0);
    assert.deepEqual(renderHudLook(st, {} as Payload, src, cfgOf('hud'), depth, 196), h);
    const centred = { ...cfgOf('hud'), hud: { ...cfgOf('hud').hud, align: 'center' as const } };
    assert.deepEqual(renderHudLook(st, {} as Payload, src, centred, depth, null), h, 'center with an unknown width');
    const c = renderHudLook(st, {} as Payload, src, centred, depth, 196);
    assert.deepEqual([c.lines, c.framed], [h.lines, h.framed]);
    assert.equal(c.offset, hudOffset('center', 196, h.framed));
    assert.ok(c.offset > 0);
    assert.equal(c.text, encode(shiftHud(h.framed, c.offset), depth, ON));
  }
});
