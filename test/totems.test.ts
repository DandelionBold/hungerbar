// The totems (SPEC §0.13, 1.2.0): the limit resets you declare in hungerbar.json's `totems`. The strict reading (every
// rejection), what is held at a moment (expiry to the second, the kinds, the last day), --until (its forms in local
// time, the refusals), the command's list operations, limits.json's forget for `totem use`, and the command end to end
// through dist against temp Claude config dirs (TZ pinned to UTC): the writer's discipline (the backup, the key order,
// CRLF, a BOM, $schema on a new file, read-only, invalid JSON, not UTF-8, --print writes nothing, nothing written for
// the same result), every form's words and refusals, `use` forgetting limits.json's windows. Last, the proof that with
// no totem held every render is 1.1.0's: every golden case drawn again with a `totems` key that holds nothing.
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { backCommand, FABLE_NOTE, heldLines, HOW_TO_USE, totem, TOTEM_OFF, TOTEM_USAGE } from '../src/cli/totem.ts';
import { defaults, merge, type Config } from '../src/config.ts';
import { DEMOS, DEMO_NOW, demoSources } from '../src/demo.ts';
import { renderPayload } from '../src/render.ts';
import { acctDir } from '../src/store.ts';
import {
  addTotem, expiry, forgetWindows, forgettable, grantLine, held, heldBrief, inWords, isoUtc, kindName, kindWords, LABEL_CAP, labelled, localStamp, MAX_GRANTS, MAX_N,
  parseGrant, parseTotems, parseWhen, prune, refillsOf, resets, serialize, setTotems, TOTEM_KINDS, useTotem, whenArg, windowWords, type TotemGrant,
} from '../src/totems.ts';
import { caseNames, DIST, GOLDEN, goldenText, listFiles, loadCase, NOW, render, ROOT, runDist, tempDir, type Case } from './harness.ts';

const DAY = 86400;
const g = (over: Partial<TotemGrant> = {}): TotemGrant => ({ n: 1, kind: 'full', until: NOW + 10 * DAY, at: NOW - 60, label: null, ...over });
const cfgWith = (totems: TotemGrant[], totem: 'on' | 'off' = 'on'): Config => ({ ...defaults(), hud: { ...defaults().hud, totem }, totems });

/** Runs `f` with the process's time zone set to `tz` (Node reads TZ again when it is assigned). */
function inZone<T>(tz: string, f: () => T): T {
  const was = process.env.TZ;
  process.env.TZ = tz;
  try {
    return f();
  } finally {
    if (was === undefined) delete process.env.TZ;
    else process.env.TZ = was;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// the reading
// ---------------------------------------------------------------------------------------------------------------------

test('parseGrant: an object with a whole n from 1 to 99, a known kind (absent: full) and an until Date.parse reads (or none); else ignored', () => {
  assert.deepEqual(parseGrant({ n: 1, until: '2026-12-01T21:59:59Z', at: '2026-11-03T10:12:00Z', label: 'Opus 5.5 launch' }),
    { n: 1, kind: 'full', until: Date.UTC(2026, 11, 1, 21, 59, 59) / 1000, at: Date.UTC(2026, 10, 3, 10, 12) / 1000, label: 'Opus 5.5 launch' });
  assert.deepEqual(parseGrant({ n: 99, kind: 'fable' }), { n: 99, kind: 'fable', until: null, at: null, label: null }, 'no until: no expiry known');
  for (const k of TOTEM_KINDS) assert.equal(parseGrant({ n: 2, kind: k })?.kind, k);
  for (const bad of [
    null, 1, 'x', [], [{ n: 1 }], {}, { n: 0 }, { n: 100 }, { n: 1.5 }, { n: '1' }, { n: -1 }, { n: NaN }, { n: Infinity },
    { n: 1, kind: 'FULL' }, { n: 1, kind: 'session' }, { n: 1, kind: null }, { n: 1, kind: 5 },
    { n: 1, until: 'soon' }, { n: 1, until: null }, { n: 1, until: 1792859460 }, { n: 1, until: '' },
  ]) assert.equal(parseGrant(bad), null, JSON.stringify(bad));
  // `at` and `label` never reject an entry: an unreadable at is none, a label is sanitized, capped and trimmed
  assert.equal(parseGrant({ n: 1, at: 'yesterday' })?.at, null);
  assert.equal(parseGrant({ n: 1, label: 7 })?.label, null);
  assert.equal(parseGrant({ n: 1, label: '   ' })?.label, null);
  assert.equal(parseGrant({ n: 1, label: ' \x1b[31mred\x1b[0m \u202Eend ' })?.label, 'red end');
  assert.equal([...parseGrant({ n: 1, label: '🗿'.repeat(100) })!.label!].length, LABEL_CAP);
});

test('parseTotems and merge(): anything but an array is none, at most 16 entries are read, `ignored` counts the rest', () => {
  for (const raw of [undefined, null, 1, 'x', {}, { n: 1 }]) assert.deepEqual(parseTotems(raw), { grants: [], ignored: 0 }, JSON.stringify(raw));
  assert.deepEqual(parseTotems([]), { grants: [], ignored: 0 });
  const r = parseTotems([{ n: 1 }, { n: 0 }, 'x', { n: 2, kind: 'week' }]);
  assert.deepEqual([r.grants.map((x) => x.n), r.ignored], [[1, 2], 2]);
  const many = Array.from({ length: 20 }, (_, i) => ({ n: i + 1 }));
  const m = parseTotems(many);
  assert.deepEqual([m.grants.length, m.grants.at(-1)!.n, m.ignored], [MAX_GRANTS, 16, 4], 'the first 16 only');
  assert.deepEqual(defaults().totems, []);
  assert.deepEqual(merge({}).totems, []);
  assert.deepEqual(merge({ totems: [{ n: 3, kind: '5h' }, { n: 'x' }] }).totems, [{ n: 3, kind: '5h', until: null, at: null, label: null }]);
  assert.deepEqual(merge({ totems: { n: 1 } }).totems, [], 'an object is not a list');
  // every other key reads as before
  const { totems: _a, ...rest } = merge({ totems: [{ n: 1 }], look: 'classic' });
  const { totems: _b, ...plain } = merge({ look: 'classic' });
  assert.deepEqual(rest, plain);
});

test('held: the grants left at now (an until at or before now is none), the sum of n, the windows they refill, the soonest end, the last day', () => {
  assert.deepEqual(held([], NOW), { grants: [], count: 0, refills: { h5: false, week: false, fable: false }, soonest: null, lastDay: false, expired: 0 });
  const full = g({ n: 2 }), week = g({ kind: 'week', until: NOW + DAY - 1 }), gone = g({ until: NOW }), open = g({ kind: '5h', until: null });
  const h = held([full, gone, week, open], NOW);
  assert.deepEqual(h.grants, [full, week, open], 'the file\'s order, the expired one out');
  assert.deepEqual([h.count, h.soonest, h.lastDay, h.expired], [4, NOW + DAY - 1, true, 1]);
  assert.deepEqual(h.refills, { h5: true, week: true, fable: true });
  // expiry to the second
  assert.equal(held([g({ until: NOW + 1 })], NOW).count, 1);
  assert.equal(held([g({ until: NOW + 1 })], NOW + 1).count, 0);
  // the last day: less than 24 h away
  assert.equal(held([g({ until: NOW + DAY })], NOW).lastDay, false);
  assert.equal(held([g({ until: NOW + DAY - 1 })], NOW).lastDay, true);
  assert.equal(held([g({ until: null })], NOW).lastDay, false, 'no expiry known: never the last day');
  // the kinds' windows
  for (const [k, want] of [['full', [true, true, true]], ['5h', [true, false, false]], ['week', [false, true, false]], ['fable', [false, false, true]]] as const) {
    const r = held([g({ kind: k })], NOW).refills;
    assert.deepEqual([r.h5, r.week, r.fable], want, k);
    assert.deepEqual(refillsOf(k), r, k);
  }
  assert.deepEqual(held([g({ kind: '5h' }), g({ kind: 'week' })], NOW).refills, { h5: true, week: true, fable: false });
  // 120 held: no cap (the HUD draws one totem; the count is the command's)
  assert.equal(held([g({ n: 99 }), g({ n: 21, kind: 'week' })], NOW).count, 120);
});

// ---------------------------------------------------------------------------------------------------------------------
// time
// ---------------------------------------------------------------------------------------------------------------------

test('parseWhen: a date is the end of that day in local time; a local date-time; Z or ±HH:MM is that instant; +<n>d and +<n>h from now', () => {
  const local = (y: number, m: number, d: number, h: number, mi: number, s = 0): number => new Date(y, m - 1, d, h, mi, s).getTime() / 1000;
  assert.deepEqual(parseWhen('2026-12-01', NOW), { ok: true, at: local(2026, 12, 1, 23, 59, 59) });
  assert.deepEqual(parseWhen('2026-12-01T09:30', NOW), { ok: true, at: local(2026, 12, 1, 9, 30) });
  assert.deepEqual(parseWhen('2026-12-01T09:30:15', NOW), { ok: true, at: local(2026, 12, 1, 9, 30, 15) });
  assert.deepEqual(parseWhen('2026-12-01T21:59:59Z', NOW), { ok: true, at: Date.UTC(2026, 11, 1, 21, 59, 59) / 1000 });
  assert.deepEqual(parseWhen('2026-12-01T10:00+02:00', NOW), { ok: true, at: Date.UTC(2026, 11, 1, 8) / 1000 });
  assert.deepEqual(parseWhen('2026-12-01T10:00-05:30', NOW), { ok: true, at: Date.UTC(2026, 11, 1, 15, 30) / 1000 });
  assert.deepEqual(parseWhen('+3d', NOW), { ok: true, at: NOW + 3 * DAY });
  assert.deepEqual(parseWhen('+5h', NOW), { ok: true, at: NOW + 5 * 3600 });
  assert.deepEqual(parseWhen('+400d', NOW), { ok: true, at: NOW + 400 * DAY }, '400 days is the edge');
  // the same instant in any zone; the date's end follows the zone
  for (const tz of ['UTC', 'Asia/Kolkata', 'America/Los_Angeles']) {
    inZone(tz, () => {
      assert.deepEqual(parseWhen('2026-12-01T21:59:59Z', NOW), { ok: true, at: Date.UTC(2026, 11, 1, 21, 59, 59) / 1000 }, tz);
      const w = parseWhen('2026-12-01', NOW);
      assert.ok(w.ok);
      assert.equal(localStamp(w.at), '2026-12-01 23:59', tz);
      assert.equal(whenArg(w.at), '2026-12-01', `${tz}: the date gives itself back`);
    });
  }
  inZone('UTC', () => assert.deepEqual(parseWhen('2026-12-01', NOW), { ok: true, at: Date.UTC(2026, 11, 1, 23, 59, 59) / 1000 }));
});

test('parseWhen refuses: an unknown form, a date or time that does not exist, a local time a clock change skips, the past, more than 400 days ahead', () => {
  const err = (s: string, now = NOW): string => {
    const w = parseWhen(s, now);
    assert.equal(w.ok, false, s);
    return (w as { error: string }).error;
  };
  for (const s of ['tomorrow', '2026-12-1', '2026/12/01', '01-12-2026', '2026-12-01 10:00', '2026-12-01T10', '+3', '+3w', '3d', '+-3d', '', '2026-12-01T10:00+0200', '2026-12-01T10:00z']) {
    assert.match(err(s), /is not a date: use YYYY-MM-DD, YYYY-MM-DDTHH:MM \(local\), with Z or ±HH:MM, or \+<n>d \/ \+<n>h$/, s);
  }
  assert.equal(err('2026-02-30'), '2026-02-30 is not a date');
  assert.equal(err('2026-13-01'), '2026-13-01 is not a date');
  assert.equal(err('2026-02-30T10:00Z'), '2026-02-30T10:00Z is not a date');
  assert.equal(err('2026-12-01T24:00'), '2026-12-01T24:00 is not a time');
  assert.equal(err('2026-12-01T10:60Z'), '2026-12-01T10:60Z is not a time');
  assert.equal(err('2026-12-01T10:00:60'), '2026-12-01T10:00:60 is not a time');
  assert.equal(err('2026-12-01T10:00+24:00'), '2026-12-01T10:00+24:00 has no such offset');
  assert.equal(err('2026-12-01T10:00+02:60'), '2026-12-01T10:00+02:60 has no such offset');
  inZone('America/New_York', () => assert.equal(err('2027-03-14T02:30', NOW), '2027-03-14T02:30 does not exist in local time (a clock change skips it)'));
  inZone('UTC', () => {
    assert.equal(err('2026-10-24T16:31Z'), '2026-10-24T16:31Z is past (2026-10-24 16:31)', 'now itself is past');
    assert.equal(err('2026-10-23'), '2026-10-23 is past (2026-10-23 23:59)');
  });
  assert.equal(err('+0d'), '+0d is past (' + localStamp(NOW) + ')');
  assert.equal(err('+401d'), '+401d is more than 400 days ahead');
  assert.equal(err('2028-01-01'), '2028-01-01 is more than 400 days ahead');
});

test('localStamp, isoUtc, inWords and whenArg', () => {
  inZone('UTC', () => {
    assert.equal(localStamp(NOW), '2026-10-24 16:31');
    assert.equal(whenArg(Date.UTC(2026, 11, 1, 23, 59, 59) / 1000), '2026-12-01', 'the end of a local day: the date alone');
    assert.equal(whenArg(Date.UTC(2026, 11, 1, 9, 30) / 1000), '2026-12-01T09:30:00Z', 'else the instant');
  });
  inZone('Asia/Kolkata', () => assert.equal(localStamp(NOW), '2026-10-24 22:01'));
  assert.equal(isoUtc(NOW), '2026-10-24T16:31:00Z');
  for (const [s, w] of [[28 * DAY + 5, 'in 28 days'], [2 * DAY, 'in 2 days'], [2 * DAY - 1, 'in 47 hours'], [2 * 3600, 'in 2 hours'], [2 * 3600 - 1, 'in 119 minutes'], [60, 'in 1 minute'], [5, 'in 1 minute'], [61 * 60, 'in 61 minutes']] as const) {
    assert.equal(inWords(s), w, String(s));
  }
  // whenArg gives back what parseWhen reads, to the second
  for (const at of [NOW + 3 * DAY, NOW + 17, Date.UTC(2026, 11, 1, 22, 59, 59) / 1000]) {
    assert.deepEqual(parseWhen(whenArg(at), NOW), { ok: true, at });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// the operations
// ---------------------------------------------------------------------------------------------------------------------

test('the list operations: set replaces (0 clears, the same grant is kept as it is), add appends, every one drops what expired or reached 0', () => {
  const spec = { kind: 'full' as const, until: NOW + 30 * DAY, label: null };
  const old = g({ n: 3, kind: 'week' }), dead = g({ until: NOW - 1 }), zero = g({ n: 0 });
  assert.deepEqual(prune([old, dead, zero], NOW), [old]);
  assert.deepEqual(setTotems([old], 0, spec, NOW), []);
  assert.deepEqual(setTotems([old, dead], 1, spec, NOW), [{ n: 1, kind: 'full', until: NOW + 30 * DAY, at: NOW, label: null }]);
  const same = g({ n: 2, until: spec.until, at: NOW - 999 });
  assert.equal(setTotems([same, dead], 2, spec, NOW)[0], same, 'the same single grant: kept, its at too');
  assert.notEqual(setTotems([same, old], 2, spec, NOW)[0], same, 'two grants: replaced');
  assert.deepEqual(setTotems([same], 2, { ...spec, label: 'x' }, NOW)[0]!.at, NOW, 'another label: replaced');
  assert.deepEqual(addTotem([old, dead], 2, { kind: 'fable', until: null, label: 'L' }, NOW), [old, { n: 2, kind: 'fable', until: null, at: NOW, label: 'L' }]);
});

test('useTotem: the held grant (of that kind) that expires first loses one; one with no expiry comes last; the file\'s order breaks a tie; null when none', () => {
  const a = g({ n: 2, until: NOW + 9 * DAY }), b = g({ kind: 'week', until: NOW + 3 * DAY }), c = g({ until: null }), d = g({ until: NOW + 3 * DAY, label: 'd' }), dead = g({ until: NOW - 5 });
  let u = useTotem([a, b, c, dead], null, NOW)!;
  assert.deepEqual([u.used, u.next], [b, [a, c]], 'the soonest, gone at 0; the expired one dropped');
  u = useTotem([a, c], null, NOW)!;
  assert.deepEqual([u.used, u.next], [a, [{ ...a, n: 1 }, c]], 'one less');
  assert.deepEqual(useTotem([c, a], null, NOW)!.used, a, 'no expiry comes after every dated one');
  assert.deepEqual(useTotem([b, d], null, NOW)!.used, b, 'a tie: the file\'s order');
  assert.deepEqual(useTotem([d, b], null, NOW)!.used, d);
  assert.deepEqual(useTotem([a, b], 'full', NOW)!.used, a, 'of that kind');
  assert.deepEqual(useTotem([c], 'full', NOW)!.next, [], 'no expiry, alone');
  assert.equal(useTotem([a, b], 'fable', NOW), null);
  assert.equal(useTotem([], null, NOW), null);
  assert.equal(useTotem([dead], null, NOW), null, 'an expired grant is not held');
});

test('serialize: n, kind, until and at in UTC to the second, the label; what is absent is left out; it reads back the same', () => {
  const grants = [g({ label: 'Opus 5.5 launch' }), g({ n: 4, kind: '5h', until: null, at: null })];
  assert.deepEqual(serialize(grants), [
    { n: 1, kind: 'full', until: isoUtc(NOW + 10 * DAY), at: isoUtc(NOW - 60), label: 'Opus 5.5 launch' },
    { n: 4, kind: '5h' },
  ]);
  assert.deepEqual(parseTotems(JSON.parse(JSON.stringify(serialize(grants)))).grants, grants);
});

test('the words: the kinds by Claude Code\'s names, what they refill, the brief for look and doctor, a grant\'s line', () => {
  assert.deepEqual(TOTEM_KINDS.map(kindName), ['full reset', '5-hour reset', 'weekly reset', 'Fable reset']);
  assert.equal(kindWords('full'), "a full reset (the 5-hour window, the week and Fable's weekly)");
  assert.equal(kindWords('5h'), 'a 5-hour reset (the 5-hour window)');
  assert.equal(kindWords('fable'), "a Fable reset (Fable's weekly)");
  assert.deepEqual([resets(1), resets(0), resets(120)], ['1 limit reset', '0 limit resets', '120 limit resets']);
  inZone('UTC', () => {
    const one = g({ until: Date.UTC(2026, 11, 1, 23, 59, 59) / 1000 });
    assert.equal(expiry(one, NOW), 'use by 2026-12-01 23:59 (in 38 days)');
    assert.equal(expiry(g({ until: null }), NOW), 'no expiry known');
    assert.equal(heldBrief(held([one], NOW)), 'a full reset, use by 2026-12-01 23:59');
    assert.equal(heldBrief(held([g({ until: null })], NOW)), 'a full reset, no expiry known');
    assert.equal(heldBrief(held([g({ n: 2, until: null })], NOW)), '2 full; no expiry known', 'one grant of 2');
    assert.equal(heldBrief(held([one, g({ n: 2, kind: 'week', until: NOW + DAY }), g({ kind: 'week', until: null }), g({ kind: 'fable', until: null })], NOW)),
      '1 full, 3 weekly, 1 Fable; the first use by 2026-10-25 16:31');
    assert.equal(grantLine(g({ n: 2, label: 'launch' }), NOW), '2 × a full reset (the 5-hour window, the week and Fable\'s weekly), use by 2026-11-03 16:31 (in 10 days), labelled "launch"');
    assert.equal(labelled(g()), '');
  });
  assert.equal(windowWords(['five_hour', 'seven_day']), 'the 5-hour window and the week');
  assert.equal(windowWords(['seven_day']), 'the week');
});

test('heldLines and backCommand: the state, the last day, where the HUD puts it, how to use one, hud.totem off; the way back', () => {
  inZone('UTC', () => {
    const on = cfgWith([]), off = cfgWith([], 'off');
    assert.deepEqual(heldLines(held([], NOW), on, NOW), ['No limit resets held.']);
    assert.deepEqual(heldLines(held([], NOW), off, NOW), ['No limit resets held.', TOTEM_OFF]);
    const one = g({ until: Date.UTC(2026, 11, 1, 23, 59, 59) / 1000 });
    assert.deepEqual(heldLines(held([one], NOW), on, NOW), [
      "1 limit reset held: a full reset (the 5-hour window, the week and Fable's weekly), use by 2026-12-01 23:59 (in 38 days).",
      'The HUD: the totem waits in hotbar slot 5; at 10% left or less it moves to your offhand.',
      `To use it: ${HOW_TO_USE}`,
    ]);
    assert.equal(heldLines(held([g({ n: 3, label: 'x', until: NOW + 3600 })], NOW), off, NOW).join('\n'),
      `3 limit resets held: 3 × a full reset (the 5-hour window, the week and Fable's weekly), use by 2026-10-24 17:31 (in 60 minutes), labelled "x".\nIt expires within 24 hours.\n`
      + 'The HUD: one totem for all of them, as a totem does not stack; it waits in hotbar slot 5, and at 10% left or less of a limit one of them refills it moves to your offhand.\n'
      + `To use one: ${HOW_TO_USE}\n${TOTEM_OFF}`);
    const two = heldLines(held([g({ until: NOW + 3600 }), g({ kind: 'week', until: null })], NOW), on, NOW);
    assert.deepEqual(two.slice(0, 4), [
      '2 limit resets held:',
      "  1 × a full reset (the 5-hour window, the week and Fable's weekly), use by 2026-10-24 17:31 (in 60 minutes)",
      '  1 × a weekly reset (the week), no expiry known',
      'The first expires within 24 hours.',
    ]);
    assert.equal(backCommand([], null), 'hungerbar totem clear');
    assert.equal(backCommand([one], '/x.bak'), 'hungerbar totem 1 --until 2026-12-01');
    assert.equal(backCommand([g({ n: 2, kind: 'week', until: null, label: 'Opus 5.5' })], '/x.bak'), 'hungerbar totem 2 --kind week --label "Opus 5.5"');
    assert.equal(backCommand([g({ label: 'say "hi"' })], '/x.bak'), 'copy /x.bak over hungerbar.json', 'a label a shell would read');
    assert.equal(backCommand([one, one], '/x.bak'), 'copy /x.bak over hungerbar.json');
    assert.equal(backCommand([one, one], null), 'hungerbar totem clear, then add each grant again');
    assert.equal(backCommand([g({ until: null })], null), 'hungerbar totem 1', 'a full reset with no expiry: the count alone');
  });
});

test('forgettable and forgetWindows: the windows a kind refilled become null in limits.json, fiveHourNone and at kept; nothing without the file', () => {
  const dir = tempDir('hb-forget-');
  try {
    const path = join(dir, 'limits.json');
    const w5 = { pct: 92, resets_at: NOW + 3600 }, w7 = { pct: 97, resets_at: NOW + 3 * DAY };
    for (const k of TOTEM_KINDS) assert.deepEqual(forgetWindows(dir, k), [], `${k}: no file`);
    writeFileSync(path, JSON.stringify({ v: 2, five_hour: w5, seven_day: w7, at: NOW }));
    assert.deepEqual(forgettable(dir, 'full'), [], 'another version: not ours');
    writeFileSync(path, '{not json');
    assert.deepEqual(forgetWindows(dir, 'full'), []);
    const seed = (o: object): void => writeFileSync(path, JSON.stringify({ v: 1, five_hour: w5, seven_day: w7, at: NOW - 9, ...o }));
    seed({});
    assert.deepEqual(forgettable(dir, 'fable'), [], "Fable's weekly is usage.json's");
    assert.deepEqual(forgetWindows(dir, 'fable'), []);
    assert.deepEqual(forgettable(dir, '5h'), ['five_hour']);
    assert.deepEqual(forgetWindows(dir, '5h'), ['five_hour']);
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), { v: 1, five_hour: null, seven_day: w7, at: NOW - 9 });
    assert.deepEqual(forgetWindows(dir, '5h'), [], 'already null: no rewrite');
    assert.deepEqual(forgetWindows(dir, 'full'), ['seven_day']);
    seed({ five_hour: null, fiveHourNone: true });
    assert.deepEqual(forgetWindows(dir, 'week'), ['seven_day']);
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), { v: 1, five_hour: null, seven_day: null, at: NOW - 9, fiveHourNone: true });
    seed({});
    assert.deepEqual(forgetWindows(dir, 'full'), ['five_hour', 'seven_day']);
    assert.deepEqual(readdirSync(dir), ['limits.json'], 'an atomic rewrite leaves no temp file');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// the command, through dist
// ---------------------------------------------------------------------------------------------------------------------

const SCHEMA_URL = pathToFileURL(join(ROOT, 'schema.json')).href;
const UNTIL = '2026-12-01T23:59:59Z';   // --until 2026-12-01 in UTC

/**
 * `hungerbar totem` run in this process, as dist's index runs it: its exit status and what it wrote to stdout and
 * stderr, with the process's time zone as `env.TZ` says.
 */
function runHere(args: string[], env: Record<string, string>): { status: number; stdout: string; stderr: string } {
  const out: string[] = [], err: string[] = [];
  const write = { out: process.stdout.write, err: process.stderr.write };
  process.stdout.write = ((s: string) => { out.push(String(s)); return true; }) as typeof process.stdout.write;
  process.stderr.write = ((s: string) => { err.push(String(s)); return true; }) as typeof process.stderr.write;
  try {
    const status = inZone(env.TZ ?? 'UTC', () => totem(args, env, DIST));
    return { status, stdout: out.join(''), stderr: err.join('') };
  } finally {
    process.stdout.write = write.out;
    process.stderr.write = write.err;
  }
}

/** A temp Claude config dir (with this hungerbar.json, when given), a temp cache, and the command run in them at NOW, in UTC. */
function world(config: string | Buffer | null = null) {
  const dir = tempDir('hb-totem-');
  const claude = join(dir, 'claude'), cache = join(dir, 'cache');
  mkdirSync(claude);
  const cfg = join(claude, 'hungerbar.json');
  if (config !== null) writeFileSync(cfg, config);
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? 'C:\\Windows', TEMP: tmpdir(), TMP: tmpdir(),
    CLAUDE_CONFIG_DIR: claude, HUNGERBAR_CACHE_DIR: cache, HUNGERBAR_NOW: String(NOW), TZ: 'UTC',
  };
  return {
    dir, claude, cache, cfg, env,
    /** The command in this process (src/cli/totem.ts, as dist's index dispatches it), in UTC; `dist` runs the bundle. */
    run: (args: string[], extra: Record<string, string> = {}) => runHere(args, { ...env, ...extra }),
    dist: (args: string[], extra: Record<string, string> = {}) => runDist('', { ...env, ...extra }, ['totem', ...args]),
    snapshot: (): Record<string, string> => Object.fromEntries(listFiles(dir).map((f) => [f.slice(dir.length), readFileSync(f).toString('base64')])),
    backups: (): string[] => readdirSync(claude).filter((f) => f.startsWith('hungerbar.json.bak.')),
    text: (): string => readFileSync(cfg, 'utf8'),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test('totem with no form: how to declare one, or what is held; hud.totem off; the expired grants; an invalid hungerbar.json', () => {
  let w = world();
  try {
    const r = w.dist([]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, 'No limit resets declared. When Anthropic gives you one (Settings → Usage → Resets), tell Hungerbar and the HUD\n'
      + 'carries it as the Totem of Undying:  hungerbar totem 1 --until 2026-11-23\n'
      + 'Hungerbar cannot see your resets itself: Claude Code does not pass them to status lines.\n');
    assert.equal(existsSync(w.cfg), false, 'nothing written');
  } finally {
    w.cleanup();
  }
  w = world(JSON.stringify({ hud: { totem: 'off' }, totems: [{ n: 2, until: UTC(2026, 11, 1) }, { n: 1, until: '2026-10-01T00:00:00Z' }, { n: 0 }] }));
  try {
    const before = w.snapshot();
    const r = w.run([]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "2 limit resets held: 2 × a full reset (the 5-hour window, the week and Fable's weekly), use by 2026-12-01 23:59 (in 38 days).\n"
      + 'The HUD: one totem for all of them, as a totem does not stack; it waits in hotbar slot 5, and at 10% left or less of a limit one of them refills it moves to your offhand.\n'
      + `To use one: ${HOW_TO_USE}\n${TOTEM_OFF}\n`
      + '1 expired grant is ignored; the next hungerbar totem write removes it.\n');
    assert.deepEqual(w.snapshot(), before, 'nothing written');
  } finally {
    w.cleanup();
  }
  w = world(JSON.stringify({ hud: { totem: 'off' } }));
  try {
    assert.match(w.run([]).stdout, /status lines\.\nhud\.totem is off, so the HUD does not draw them: hungerbar look hud --totem on\n$/);
  } finally {
    w.cleanup();
  }
  w = world('{"totems": [');
  try {
    const r = w.run([]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /^hungerbar\.json: .*hungerbar\.json is invalid JSON \(.*\), so no limit resets are read; fix it before hungerbar totem can write it\.\n$/);
  } finally {
    w.cleanup();
  }
});

/** 2026-12-01 23:59:59Z style: the end of a UTC day, month 0-based as Date.UTC takes it. */
function UTC(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m, d, 23, 59, 59)).toISOString().replace('.000Z', 'Z');
}

test('totem <n> on no file: created with its $schema, the diff, the state, how to use it, the way back; --print first writes nothing', () => {
  const w = world();
  try {
    const p = w.run(['1', '--until', '2026-12-01', '--print']);
    assert.equal(p.status, 0, p.stderr);
    assert.equal(p.stdout, `hungerbar.json: ${w.cfg} (will be created)\n+ $schema: ${JSON.stringify(SCHEMA_URL)}\n`
      + `+ totems: [{"n":1,"kind":"full","until":"${UNTIL}","at":"2026-10-24T16:31:00Z"}]\nNothing was written (--print).\n`);
    assert.equal(existsSync(w.cfg), false);
    const r = w.dist(['1', '--until', '2026-12-01']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, `hungerbar.json: ${w.cfg} (will be created)\n+ $schema: ${JSON.stringify(SCHEMA_URL)}\n`
      + `+ totems: [{"n":1,"kind":"full","until":"${UNTIL}","at":"2026-10-24T16:31:00Z"}]\n`
      + "1 limit reset held: a full reset (the 5-hour window, the week and Fable's weekly), use by 2026-12-01 23:59 (in 38 days).\n"
      + 'The HUD: the totem waits in hotbar slot 5; at 10% left or less it moves to your offhand.\n'
      + `To use it: ${HOW_TO_USE}\nBack with: hungerbar totem clear\n`);
    assert.equal(w.text(), JSON.stringify({ $schema: SCHEMA_URL, totems: [{ n: 1, kind: 'full', until: UNTIL, at: '2026-10-24T16:31:00Z' }] }, null, 2) + '\n');
    assert.deepEqual(w.backups(), [], 'no file before: no backup');
    // the same again: nothing to change, nothing written (the grant keeps its at)
    const before = w.snapshot();
    const again = w.run(['1', '--until', '2026-12-01'], { HUNGERBAR_NOW: String(NOW + 60) });
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /^hungerbar\.json: [^\n]*\nNothing to change\.\n1 limit reset held: /);
    assert.deepEqual(w.snapshot(), before);
    // no network key, ever: the command asks no consent
    assert.doesNotMatch(w.text(), /network|usageApi/);
  } finally {
    w.cleanup();
  }
});

test('the writer\'s discipline: a backup, only totems changed, every other key in its place, CRLF and the final newline kept, the BOM dropped', () => {
  const original = '\uFEFF{\r\n  "$schema": "x",\r\n  "totems": [\r\n    { "n": 1, "kind": "week", "until": "2026-10-01T00:00:00Z" },\r\n    { "n": "bad" }\r\n  ],\r\n  "hud": {\r\n    "totem": "on"\r\n  },\r\n  "network": {\r\n    "usageApi": false\r\n  }\r\n}\r\n';
  const w = world(original);
  try {
    const r = w.run(['add', '2', '--kind', 'week', '--until', '+3d', '--label', 'Opus 5.5 launch']);
    assert.equal(r.status, 0, r.stderr);
    const [bak] = w.backups();
    assert.ok(bak, 'a backup');
    assert.equal(readFileSync(join(w.claude, bak), 'utf8'), original, 'the backup is the file as it was');
    assert.match(r.stdout, new RegExp(`\nbackup: ${join(w.claude, bak).replace(/[\\.]/g, '\\$&')}\n`));
    const until = isoUtc(NOW + 3 * DAY);
    assert.equal(w.text(), '{\r\n  "$schema": "x",\r\n  "totems": [\r\n    {\r\n      "n": 2,\r\n      "kind": "week",\r\n'
      + `      "until": "${until}",\r\n      "at": "2026-10-24T16:31:00Z",\r\n      "label": "Opus 5.5 launch"\r\n    }\r\n  ],\r\n`
      + '  "hud": {\r\n    "totem": "on"\r\n  },\r\n  "network": {\r\n    "usageApi": false\r\n  }\r\n}\r\n', 'the expired and the unreadable entries dropped');
    assert.match(r.stdout, /\n2 limit resets held: 2 × a weekly reset \(the week\), use by 2026-10-27 16:31 \(in 3 days\), labelled "Opus 5\.5 launch"\.\n/);
    assert.match(r.stdout, /\nBack with: hungerbar totem clear\n$/, 'nothing was held before');
    // clear: the key goes, the others stay
    const c = w.run(['clear']);
    assert.equal(c.status, 0, c.stderr);
    assert.equal(w.text(), '{\r\n  "$schema": "x",\r\n  "hud": {\r\n    "totem": "on"\r\n  },\r\n  "network": {\r\n    "usageApi": false\r\n  }\r\n}\r\n');
    assert.match(c.stdout, /\nNo limit resets held\.\nBack with: hungerbar totem 2 --until 2026-10-27T16:31:00Z --kind week --label "Opus 5\.5 launch"\n$/);
    assert.equal(w.backups().length, 2);
    assert.match(w.run(['0']).stdout, /\nNothing to change\.\nNo limit resets held\.\n$/, '0 is clear');
    assert.equal(w.backups().length, 2, 'nothing written, no backup');
  } finally {
    w.cleanup();
  }
});

test('totem <n> replaces every grant, add keeps them; the way back names the one grant before, or the backup', () => {
  const w = world(JSON.stringify({ totems: [{ n: 1, until: UNTIL }] }));
  try {
    let r = w.run(['add']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\n2 limit resets held:\n {2}1 × a full reset [^\n]*, use by 2026-12-01 23:59 \(in 38 days\)\n {2}1 × a full reset [^\n]*, no expiry known\n/);
    assert.match(r.stdout, /\nBack with: hungerbar totem 1 --until 2026-12-01\n$/);
    r = w.run(['3', '--kind', 'fable']);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(w.text()).totems, [{ n: 3, kind: 'fable', at: '2026-10-24T16:31:00Z' }]);
    const bak = w.backups().sort().at(-1)!;
    assert.match(r.stdout, new RegExp(`\nBack with: copy ${join(w.claude, bak).replace(/[\\.]/g, '\\$&')} over hungerbar\\.json\n$`));
  } finally {
    w.cleanup();
  }
});

test('totem use: the grant that expires first loses one; limits.json forgets the windows it refilled; Fable\'s note; the way back', () => {
  const w = world(JSON.stringify({ totems: [{ n: 1, until: UNTIL, label: 'launch' }, { n: 2, kind: '5h', until: UTC(2026, 10, 20) }] }));
  try {
    const acct = acctDir(w.env);
    mkdirSync(acct, { recursive: true });
    const limits = join(acct, 'limits.json');
    const lim = { v: 1, five_hour: { pct: 95, resets_at: NOW + 3600 }, seven_day: { pct: 92, resets_at: NOW + 3 * DAY }, at: NOW - 30 };
    writeFileSync(limits, JSON.stringify(lim));
    // --print: the diff and what it would forget; nothing written
    const before = w.snapshot();
    let r = w.run(['use', '--print']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\n\+ totems: \[\{"n":1,"kind":"full",[^\n]*\},\{"n":1,"kind":"5h",[^\n]*\}\]\nIt would also forget the last-known use of the 5-hour window in limits\.json\.\nNothing was written \(--print\)\.\n$/);
    assert.deepEqual(w.snapshot(), before);
    r = w.run(['use']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\nbackup: [^\n]*\n1 limit reset used \(a 5-hour reset\); 2 left\.\nThe last-known use of the 5-hour window is forgotten, so the refill shows on the next render\.\n2 limit resets held:\n/);
    assert.match(r.stdout, /\nBack with: hungerbar totem add 1 --until 2026-11-20 --kind 5h\n$/);
    assert.doesNotMatch(r.stdout, /Fable's weekly refreshes/);
    assert.deepEqual(JSON.parse(readFileSync(limits, 'utf8')), { ...lim, five_hour: null });
    // --kind full: the week forgotten too, then Fable's note; none left
    r = w.run(['use', '--kind', 'full']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\n1 limit reset used \(a full reset\); 1 left\.\nThe last-known use of the week is forgotten, so the refill shows on the next render\.\nFable's weekly refreshes from the usage API within 3 minutes\.\n1 limit reset held: /);
    assert.match(r.stdout, /\nBack with: hungerbar totem add 1 --until 2026-12-01 --label "launch"\n$/);
    assert.deepEqual(JSON.parse(readFileSync(limits, 'utf8')), { ...lim, five_hour: null, seven_day: null });
    // the last one: none left; nothing more to forget
    r = w.run(['use']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\n1 limit reset used \(a 5-hour reset\); none left\.\nBack with: hungerbar totem 1 --until 2026-11-20 --kind 5h\n$/);
    assert.equal(JSON.parse(w.text()).totems, undefined, 'an empty list removes the key');
    // nothing held: refused, nothing written
    const after = w.snapshot();
    r = w.run(['use']);
    assert.equal(r.status, 1);
    assert.equal(r.stderr, `hungerbar: no limit reset held to use: hungerbar totem shows what is declared\n${TOTEM_USAGE}\n`);
    assert.deepEqual(w.snapshot(), after);
  } finally {
    w.cleanup();
  }
});

test('totem use --kind fable: nothing in limits.json, the note in its place; a kind not held is refused; hud.totem off adds its line', () => {
  const w = world(JSON.stringify({ hud: { totem: 'off' }, totems: [{ n: 1, kind: 'fable' }, { n: 1, kind: 'week' }] }));
  try {
    const acct = acctDir(w.env);
    mkdirSync(acct, { recursive: true });
    const lim = JSON.stringify({ v: 1, five_hour: { pct: 1, resets_at: NOW + 60 }, seven_day: { pct: 2, resets_at: NOW + DAY }, at: NOW });
    writeFileSync(join(acct, 'limits.json'), lim);
    let r = w.run(['use', '--kind', '5h']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /^hungerbar: no 5-hour reset held to use \(held: 1 Fable reset, 1 weekly reset\)\n/);
    r = w.run(['use', '--kind', 'fable']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, new RegExp(`\n1 limit reset used \\(a Fable reset\\); 1 left\\.\n${FABLE_NOTE.replace(/[.']/g, '\\$&')}\n1 limit reset held: a weekly reset`));
    assert.match(r.stdout, /\nhud\.totem is off, so the HUD does not draw them: hungerbar look hud --totem on\nBack with: hungerbar totem add 1 --kind fable\n$/);
    assert.equal(readFileSync(join(acct, 'limits.json'), 'utf8'), lim, 'limits.json untouched');
    r = w.run(['use']);
    assert.match(r.stdout, /; none left\.\nThe last-known use of the week is forgotten[^\n]*\nhud\.totem is off, so the HUD does not draw them: [^\n]*\nBack with: hungerbar totem 1 --kind week\n$/);
  } finally {
    w.cleanup();
  }
});

test('refused before anything is read or written: the forms, the counts, --kind, --until, --label, the flags', () => {
  for (const [args, msg] of [
    [['100'], 'the count takes a whole number from 0 to 99 (got "100")'],
    [['007'], 'the count takes a whole number from 0 to 99 (got "007")'],
    [['1.5'], 'unknown form "1.5": a count, add, use or clear'],
    [['-1'], 'unknown form "-1": a count, add, use or clear'],
    [['two'], 'unknown form "two": a count, add, use or clear'],
    [['1', '2'], 'one count at a time (got 1 2)'],
    [['add', '0'], 'add takes a whole number from 1 to 99 (got "0")'],
    [['add', '1', '2'], 'add takes one count (got 1 2)'],
    [['use', '1'], 'use takes no count: run it once for each reset you used (got 1)'],
    [['clear', 'all'], 'clear takes nothing more (got all)'],
    [['use', '--until', '+1d'], '--until does not go with use'],
    [['use', '--label', 'x'], '--label does not go with use'],
    [['clear', '--kind', 'week'], '--kind does not go with clear'],
    [['0', '--until', '+1d'], '--until does not go with 0, which clears every reset'],
    [['--until', '+1d'], '--until goes with a count or add: hungerbar totem 1 --until …'],
    [['1', '--kind', 'session'], '--kind takes full, 5h, week or fable (got "session")'],
    [['1', '--kind'], '--kind needs a value'],
    [['1', '--until', '2026-02-30'], '--until: 2026-02-30 is not a date'],
    [['1', '--until', '2026-10-01'], '--until: 2026-10-01 is past (2026-10-01 23:59)'],
    [['1', '--until', '+401d'], '--until: +401d is more than 400 days ahead'],
    [['1', '--label', 'x'.repeat(LABEL_CAP + 1)], `--label takes at most ${LABEL_CAP} characters`],
    [['1', '--print=yes'], '--print takes no value'],
    [['1', '--untill', '+1d'], 'unknown option --untill'],
  ] as const) {
    const w = world('{"a": 1}');
    try {
      const before = w.snapshot();
      const r = w.run([...args]);
      assert.equal(r.status, 1, args.join(' '));
      assert.equal(r.stderr, `hungerbar: ${msg}\n${TOTEM_USAGE}\n`, args.join(' '));
      assert.equal(r.stdout, '', args.join(' '));
      assert.deepEqual(w.snapshot(), before, `${args.join(' ')} wrote nothing`);
    } finally {
      w.cleanup();
    }
  }
  assert.ok(MAX_N === 99 && TOTEM_USAGE.includes('[--kind full|5h|week|fable]'));
  // the same through dist
  const w = world('{"a": 1}');
  try {
    const r = w.dist(['use', '--until', '+1d']);
    assert.deepEqual([r.status, r.stdout, r.stderr], [1, '', `hungerbar: --until does not go with use
${TOTEM_USAGE}
`]);
  } finally {
    w.cleanup();
  }
});

test('a hungerbar.json the writer refuses: invalid JSON, not an object, not UTF-8, read-only; each with the by-hand steps or one line, nothing written', () => {
  for (const [text, why, args, step] of [
    ['{"totems": [', /cannot be read as a JSON object/, ['1', '--until', '2026-12-01'], `  "totems": [{"n":1,"kind":"full","until":"${UNTIL}","at":"2026-10-24T16:31:00Z"}]\n`],
    ['[1]', /is not a JSON object/, ['clear'], '  no "totems" key (remove it)\n'],
    [Buffer.from([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]), /\(it is not UTF-8 text\)/, ['add', '2'], '  "totems": [... the grants you hold, {"n":2,"kind":"full","at":"2026-10-24T16:31:00Z"}]\n'],
    ['{}', /cannot be read/, ['use'], '  "totems": the grant you used with its "n" one less (remove it at 0)\n'],
  ] as const) {
    const w = world(text === '{}' ? '{"totems": 1' : text);
    try {
      const before = w.snapshot();
      const r = w.run([...args]);
      assert.equal(r.status, 1, String(args));
      assert.match(r.stderr, why);
      assert.ok(r.stderr.includes('Fix it by hand: make it one valid JSON object, then set\n' + step), r.stderr);
      assert.deepEqual(w.snapshot(), before);
    } finally {
      w.cleanup();
    }
  }
  const w = world('{\n  "totems": [{"n": 1}]\n}\n');
  try {
    chmodSync(w.cfg, 0o444);
    const before = w.snapshot();
    const r = w.run(['clear']);
    assert.equal(r.status, 1, r.stdout);
    assert.ok(r.stderr.endsWith(`hungerbar: could not write ${w.cfg} (${process.platform === 'win32' ? 'EPERM' : 'EACCES'}); nothing changed.\n`), r.stderr);
    assert.deepEqual(w.snapshot(), before);
    assert.deepEqual(w.backups(), []);
  } finally {
    chmodSync(w.cfg, 0o666);
    w.cleanup();
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// the proof: with no totem held, every render is 1.1.0's
// ---------------------------------------------------------------------------------------------------------------------

/** `totems` values that hold nothing at NOW: none, an empty list, only expired grants, only entries that are not grants, a non-list. */
const HOLD_NOTHING: unknown[] = [
  [],
  [{ n: 5, kind: 'full', until: '2026-10-24T16:31:00Z' }, { n: 1, kind: 'week', until: '2026-01-01T00:00:00Z' }],
  [{ n: 0 }, { n: 100 }, { n: 1, kind: 'session' }, { n: 1, until: 'soon' }, 'x', null],
  { n: 1 },
];

test('no totem held: every demo, in both looks and every Fable option, draws the same bytes as with no totems key', () => {
  for (const [name, d] of Object.entries(DEMOS)) {
    for (const look of ['hud', 'classic'] as const) {
      for (const fable of ['off', 'tail', 'tooltip', 'boss', 'beacon']) {
        const base = { look, hud: { fable, align: 'left' }, network: { usageApi: true, scopedWeekly: true } };
        const draw = (raw: object) => renderPayload(JSON.stringify(d.payload), { env: { FORCE_COLOR: '3' }, config: merge(raw), sources: demoSources(d), now: DEMO_NOW }).text;
        const plain = draw(base);
        for (const totems of HOLD_NOTHING) assert.equal(draw({ ...base, totems }), plain, `${name} ${look} ${fable} ${JSON.stringify(totems)}`);
      }
    }
  }
});

test('no totem held: every golden case, drawn again through dist with a totems key that holds nothing, is its golden file byte for byte', () => {
  let n = 0;
  for (const name of caseNames()) {
    const c = loadCase(name);
    if (c.configText !== undefined) continue;                 // an invalid hungerbar.json has no key to add
    const mode = (c.modes ?? ['ansi'])[0]!;
    if (mode === 'config') continue;
    const totems = HOLD_NOTHING[n++ % HOLD_NOTHING.length];
    const withKey: Case = { ...c, config: { ...((c.config as object | undefined) ?? {}), totems } };
    const r = render(withKey, mode);
    r.prepared.cleanup();
    assert.equal(r.status, 0, `${name}/${mode}`);
    const file = mode === 'ansi' ? `${name}.ansi` : MODE_FILE(name, mode);
    const want = readFileSync(join(GOLDEN, file), 'utf8');
    assert.equal(mode === 'ansi' || file.endsWith('.ansi') ? goldenText('ansi', r.stdout) : r.stdout, want, `${file} with totems ${JSON.stringify(totems)}`);
  }
  assert.ok(n > 60, `${n} cases`);
});

/** The golden file a case's mode is kept in (as golden.test.ts names it). */
function MODE_FILE(name: string, mode: string): string {
  return /c$/.test(mode) ? `${name}.${mode}.ansi` : `${name}.${mode}.txt`;
}

test('the command\'s edges: two expired grants, a blank label, clear on no file, a used grant with no expiry or with a label a shell would read, a cache it cannot write', () => {
  let w = world(JSON.stringify({ totems: [{ n: 1, until: '2026-01-01T00:00:00Z' }, { n: 2, until: '2026-02-01T00:00:00Z' }] }));
  try {
    assert.match(w.run([]).stdout, /\n2 expired grants are ignored; the next hungerbar totem write removes them\.\n$/);
    const r = w.run(['1', '--label', '   ']);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(w.text()).totems, [{ n: 1, kind: 'full', at: '2026-10-24T16:31:00Z' }], 'a blank label is none; the expired grants dropped');
    assert.match(r.stdout, /\nBack with: hungerbar totem clear\n$/, 'nothing was held: the expired grants do not count');
    assert.match(w.run(['use']).stdout, /\nBack with: hungerbar totem 1\n$/, 'a full reset with no expiry: the count alone');
  } finally {
    w.cleanup();
  }
  w = world();
  try {
    assert.equal(w.run(['clear']).stdout, `hungerbar.json: ${w.cfg} (not present)\nNothing to change.\nNo limit resets held.\n`);
    assert.equal(existsSync(w.cfg), false);
  } finally {
    w.cleanup();
  }
  w = world(JSON.stringify({ totems: [{ n: 2, kind: 'week', label: 'say "hi"' }] }));
  const acct = acctDir(w.env), limits = join(acct, 'limits.json');
  try {
    mkdirSync(acct, { recursive: true });
    const lim = JSON.stringify({ v: 1, five_hour: null, seven_day: { pct: 99, resets_at: NOW + DAY }, at: NOW });
    writeFileSync(limits, lim);
    // the cache cannot be written: a read-only file on Windows (the rename over it fails), a read-only folder elsewhere
    chmodSync(limits, 0o444);
    chmodSync(acct, 0o555);
    const r = w.run(['use']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\n1 limit reset used \(a weekly reset\); 1 left\.\n1 limit reset held: /, 'nothing said of limits.json');
    assert.equal(readFileSync(limits, 'utf8'), lim);
    const bak = w.backups()[0]!;
    assert.ok(r.stdout.endsWith(`\nBack with: copy ${join(w.claude, bak)} over hungerbar.json\n`), r.stdout);
  } finally {
    chmodSync(acct, 0o755);
    chmodSync(limits, 0o644);
    w.cleanup();
  }
});
