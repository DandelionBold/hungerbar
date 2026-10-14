import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countdown, ctxPct, hitPct, limitPct, moneyLimit, moneyUsed, timeLeft, tokens, tokensMax } from '../../src/format.ts';

test('timeLeft boundaries, floored to whole minutes', () => {
  const cases: Array<[number, string | null]> = [
    [0, null], [-5, null], [1, '<1m'], [59, '<1m'], [60, '1m'], [119, '1m'], [120, '2m'], [3599, '59m'],
    [3600, '1h 0m'], [3660, '1h 1m'], [17340, '4h 49m'], [33120, '9h 12m'], [86399, '23h 59m'],
    [86400, '1d 0h'], [345540, '3d 23h'], [530000, '6d 3h'],
  ];
  for (const [s, want] of cases) assert.equal(timeLeft(s), want, `timeLeft(${s})`);
});

test('countdown: seconds, m:ss for a 5m TTL or under 2 min, whole minutes otherwise', () => {
  assert.equal(countdown(0, '5m'), '0s');
  assert.equal(countdown(42, '1h'), '42s');
  assert.equal(countdown(59, '5m'), '59s');
  assert.equal(countdown(60, '1h'), '1m00s');
  assert.equal(countdown(119, '1h'), '1m59s');
  assert.equal(countdown(120, '1h'), '2m');
  assert.equal(countdown(175, '5m'), '2m55s');
  assert.equal(countdown(252, '5m'), '4m12s');
  assert.equal(countdown(2832, '1h'), '47m');
  assert.equal(countdown(2832, null), '47m');
});

test('limit % is floored and clamped', () => {
  assert.equal(limitPct(99.9), 99);
  assert.equal(limitPct(100), 100);
  assert.equal(limitPct(0.4), 0);
  assert.equal(limitPct(2.4), 2);
  assert.equal(limitPct(86.1), 86);
  assert.equal(limitPct(57.99999999999), 58);
  assert.equal(limitPct(-3), 0);
  assert.equal(limitPct(130), 100);
});

test('context % rounds; cache hit rounds half up', () => {
  assert.equal(ctxPct(8.1), 8);
  assert.equal(ctxPct(23.7), 24);
  assert.equal(hitPct(0.9744), 97);
  assert.equal(hitPct(0.985), 99);
  assert.equal(hitPct(0.981), 98);
  assert.equal(hitPct(0.914), 91);
  assert.equal(hitPct(0), 0);
  assert.equal(hitPct(1.2), 100);
});

test('tokens', () => {
  const cases: Array<[number, string]> = [
    [0, '0'], [812, '812'], [999, '999'], [1000, '1k'], [81000, '81k'], [279967, '280k'], [999499, '999k'],
    [999500, '1M'], [1000000, '1M'], [1250000, '1.3M'], [2000000, '2M'],
  ];
  for (const [n, want] of cases) assert.equal(tokens(n), want, `tokens(${n})`);
  assert.equal(tokensMax(1_000_000), '1.0M');
  assert.equal(tokensMax(200_000), '200k');
  assert.equal(tokensMax(2_000_000), '2.0M');
});

test('money and currencies', () => {
  assert.equal(moneyUsed(0, 'USD'), '$0.00');
  assert.equal(moneyUsed(4.2, 'USD'), '$4.20');
  assert.equal(moneyLimit(50, 'USD'), '$50');
  assert.equal(moneyLimit(12.5, 'USD'), '$12.50');
  assert.equal(moneyUsed(12.4, 'eur'), '€12.40');
  assert.equal(moneyLimit(50, 'GBP'), '£50');
  assert.equal(moneyUsed(3, 'EGP'), 'EGP 3.00');
});
