import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaults, merge } from '../../src/config.ts';
import { ASCII, UNICODE } from '../../src/glyphs.ts';
import { foodLeft, heartsLeft, pie } from '../../src/items.ts';
import { renderPayload } from '../../src/render.ts';
import type { Sources } from '../../src/state.ts';

test('hearts: ten, rounded to the nearest tenth left', () => {
  const cases: Array<[number, number]> = [[0, 10], [2, 10], [5, 10], [6, 9], [18, 8], [50, 5], [82, 2], [93, 1], [95, 1], [96, 0], [100, 0]];
  for (const [p, want] of cases) assert.equal(heartsLeft(p), want, `heartsLeft(${p})`);
});

test('food: ten drumsticks; one stays while any of its tenth is left, none only at 100%', () => {
  const cases: Array<[number, number]> = [[0, 10], [2, 10], [10, 9], [12, 9], [50, 5], [51, 5], [82, 2], [90, 1], [97, 1], [99.9, 1], [100, 0]];
  for (const [p, want] of cases) assert.equal(foodLeft(p), want, `foodLeft(${p})`);
});

test('pie: fresh to cold by the share of the TTL left', () => {
  const cases: Array<[number, string | null, string]> = [
    [300, '5m', '●'], [270, '5m', '●'], [252, '5m', '◕'], [175, '5m', '◑'], [50, '5m', '◔'], [30, '5m', '○'],
    [3500, '1h', '●'], [2832, '1h', '◕'], [1800, '1h', '◑'], [600, '1h', '◔'], [100, '1h', '○'], [200, null, '◕'],
  ];
  for (const [left, ttl, want] of cases) assert.equal(pie(UNICODE, 'warm', left, ttl), want, `pie(${left}, ${ttl})`);
  assert.equal(pie(UNICODE, 'cold', 250, '5m'), '○');
  assert.equal(pie(UNICODE, 'warm', 0, '5m'), '○');
  assert.equal(pie(ASCII, 'warm', 250, '5m'), '');
});

test('config: minecraft.session and minecraft.weekly pick the bar, default hearts and food', () => {
  assert.deepEqual(defaults().minecraft, { session: 'hearts', weekly: 'food' });
  assert.deepEqual(merge({ minecraft: { session: 'food', weekly: 'hearts' } }).minecraft, { session: 'food', weekly: 'hearts' });
  assert.deepEqual(merge({ minecraft: { session: 'pips' } }).minecraft, { session: 'hearts', weekly: 'food' });
});

const fixed: Sources = {
  git: () => ({ isRepo: false, branch: null, added: null, removed: null }),
  limits: () => ({ h5: { pct: 82, left: 600, dim: false }, week: { pct: 2, left: 6000, dim: false } }),
  usage: () => null,
  transcript: () => null,
  counts: () => ({ turns: 0, compactions: 0 }),
  history: () => null,
};
const line2 = (cfg: unknown, env: Record<string, string> = {}): string => {
  const c = merge(cfg);
  c.lines = [['limit5h', 'limitWeek']];
  return renderPayload('{"model":{"display_name":"Opus 5.5"}}', { env: { NO_COLOR: '1', ...env }, config: c, sources: () => fixed, now: 1 }).text.replace(/ /g, ' ');
};

test('swapping the bars back puts food on the session and hearts on the week', () => {
  assert.equal(line2({}), 'Session: ♥♥········ 18% (↻ 10m) │ Weekly: 🍗🍗🍗🍗🍗🍗🍗🍗🍗🍗 98% (↻ 1h 40m)');
  assert.equal(line2({ minecraft: { session: 'food', weekly: 'hearts' } }), 'Session:                 🍗🍗 18% (↻ 10m) │ Weekly: ♥♥♥♥♥♥♥♥♥♥ 98% (↻ 1h 40m)');
});

test('ASCII and narrow fallbacks', () => {
  assert.equal(line2({ icons: 'ascii' }), 'Session: [##--------] 18% (10m) | Weekly: [==========] 98% (1h 40m)');
  assert.equal(line2({ icons: 'unicode' }), 'Session: 18% (↻ 10m) │ Weekly: 98% (↻ 1h 40m)');
  assert.equal(line2({}, { COLUMNS: '40' }), '5h ♥ 18% (↻ 10m) │ Wk 🍗 98%');
  // An empty food bar still names its window, and no line starts with blank cells.
  const swapped = merge({ minecraft: { session: 'food', weekly: 'hearts' } });
  swapped.lines = [['limit5h', 'limitWeek']];
  const full: Sources = { ...fixed, limits: () => ({ h5: { pct: 100, left: 600, dim: false }, week: { pct: 2, left: 6000, dim: false } }) };
  const narrow = renderPayload('{}', { env: { NO_COLOR: '1', COLUMNS: '60' }, config: swapped, sources: () => full, now: 1 }).text.replace(/ /g, ' ');
  assert.match(narrow, /^5h /);
});

test('limits: "left" (default) and "used" flip the icons and the % together', () => {
  assert.equal(defaults().limits, 'left');
  assert.equal(merge({ limits: 'used' }).limits, 'used');
  assert.equal(merge({ limits: 'half' }).limits, 'left');
  // Session 82% used, week 2% used. With "used", a heart turns red per tenth used and a drumstick shows per tenth eaten.
  assert.equal(line2({ limits: 'used' }), 'Session: ♥♥♥♥♥♥♥♥·· 82% (↻ 10m) │ Weekly:                      2% (↻ 1h 40m)');
  assert.equal(line2({ limits: 'used', minecraft: { session: 'food', weekly: 'hearts' } }), 'Session:     🍗🍗🍗🍗🍗🍗🍗🍗 82% (↻ 10m) │ Weekly: ·········· 2% (↻ 1h 40m)');
});

test('limits: the two numbers add up to 100, and 0% left only at exactly 100% used', () => {
  const at = (used: number, limits: string): string => {
    const c = merge({ limits });
    c.lines = [['limit5h']];
    const src: Sources = { ...fixed, limits: () => ({ h5: { pct: used, left: 60, dim: false }, week: null }) };
    return renderPayload('{}', { env: { NO_COLOR: '1' }, config: c, sources: () => src, now: 1 }).text.replace(/ /g, ' ');
  };
  for (const used of [0, 2, 50, 82, 99, 100]) {
    const l = Number(/(\d+)%/.exec(at(used, 'left'))![1]), u = Number(/(\d+)%/.exec(at(used, 'used'))![1]);
    assert.equal(l + u, 100, `at ${used}% used`);
  }
  assert.match(at(99, 'left'), / 1% /);
  assert.match(at(100, 'left'), / 0% /);
});
