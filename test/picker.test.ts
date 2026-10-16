// The picker is the oracle: round 3's own engine (the DOM-free block of the page the look was picked in), run with that pick,
// must equal Hungerbar's output for the four fixture situations, byte for byte, in colour and ANSI-stripped.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { loadCase, render, ROOT, stripAnsi } from './harness.ts';

/** The round 3 pick (2026-10-25) with its follow-ups: hearts for the session and food for the week, ten drumsticks like the game, and icons and % both counting what is left. */
export const PICK = { count: 'left', bars: 'swap', hunger: 'tenGoneMirror', hearts: 'grey', clock: 'pie', icons: 'mono', cold: 'snow' } as const;

interface PSpan { t: string; c?: string; lab?: boolean }
interface Engine {
  SCEN: Record<string, unknown>;
  PAL: Record<string, string>;
  OPTIONS: Record<string, { items: Array<{ id: string }> }>;
  lines: (s: unknown, pick: unknown) => PSpan[][][];
}

function loadEngine(): Engine {
  const html = readFileSync(join(ROOT, 'test', 'reference', 'hungerbar-picker-3.html'), 'utf8');
  const start = html.indexOf('/*ENGINE*/'), end = html.indexOf('/*END ENGINE*/');
  assert.ok(start > 0 && end > start, 'engine markers');
  return vm.runInNewContext(html.slice(start, end) + '\n;({ SCEN, PAL, OPTIONS, lines })', {}) as Engine;
}

/** The engine's spans as SGR: bold for every non-label span, 24-bit colour, a reset after each span, NBSP for spaces. */
function oracle(e: Engine, scen: string): string {
  const sgr = (sp: PSpan): string => {
    const t = sp.t.replace(/ /g, ' ');
    if (!t) return '';
    const params: string[] = [];
    if (!sp.lab) params.push('1');
    if (sp.c) {
      const n = parseInt(sp.c.slice(1), 16);
      params.push(`38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}`);
    }
    return `\x1b[${params.join(';')}m${t}\x1b[0m`;
  };
  return e.lines(e.SCEN[scen], PICK)
    .filter((l) => l.length)
    .map((l) => l.map((piece) => piece.map(sgr).join('')).join(sgr({ t: ' │ ', c: e.PAL.sep! })))
    .join('\n');
}

const engine = loadEngine();

test('the pick names real options of the round 3 picker', () => {
  for (const [group, id] of Object.entries(PICK)) assert.ok(engine.OPTIONS[group]?.items.some((o) => o.id === id), `${group}=${id}`);
});

for (const scen of ['normal', 'tight', 'fresh', 'extra']) {
  test(`picker oracle: ${scen}`, () => {
    const want = oracle(engine, scen);
    const r = render(loadCase(scen), 'ansi');
    r.prepared.cleanup();
    assert.equal(r.status, 0);
    assert.equal(stripAnsi(r.stdout), stripAnsi(want), 'ANSI-stripped text');
    assert.equal(r.stdout, want, 'colour bytes');
  });
}

test('the README sample is the oracle\'s normal day', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const sample = /```\n(Model: [\s\S]*?)\n```/.exec(readme)?.[1];
  assert.ok(sample, 'README has a sample block');
  assert.equal(stripAnsi(oracle(engine, 'normal')).replace(/ /g, ' '), sample);
});
