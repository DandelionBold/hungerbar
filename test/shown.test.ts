// The shown-file (src/shown.ts, SPEC §0.13, 1.2.0; version 2): the totem's memory. The step's rules (the pop fires on a
// window a held limit reset refills that falls from 1 or more lit icons to 0; it lasts 30 s; what is worth a write),
// what a saved file must be to count (a clock that went back is no file, and so is 1.1.0's version 1), the disk step (no
// session key, persist false: nothing read or written; the write waits on `after` and happens only on a change), and
// through the real paths: renderPayload's disk sources (only with hud.totem on and a reset held, the pop drawn from the
// file), dist (the write after stdout, a second render writes nothing), preview (never), and the 7-day sweep.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { renderPayload } from '../src/render.ts';
import { diskShown, POP_SECS, savedShown, shownPath, stepShown, type ShownFile, type ShownNow } from '../src/shown.ts';
import { pruneOld } from '../src/store.ts';
import { DIST, ROOT, runDist, tempDir } from './harness.ts';

const NOW = 1792859460;
const ALL3 = { h5: true, week: true, fable: true };
const cur = (over: Partial<ShownNow> = {}): ShownNow => ({ h5: 9, week: 2, fable: 4, refills: ALL3, ...over });
const file = (over: Partial<ShownFile> = {}): ShownFile => ({ v: 2, at: NOW - 30, h5: 9, week: 2, fable: 4, until: { pop: 0 }, ...over });
/** The idol between the call's gold sides, with the pop's spark, and without it (form A). */
const POP = '▐\u{1FB0C}¨\u{1FB0D}✦▌', CALL = '▐\u{1FB0C}••\u{1FB0D}▌';

// ---------------------------------------------------------------------------------------------------------------------
// The step
// ---------------------------------------------------------------------------------------------------------------------

test('stepShown: the pop fires when a window a held reset refills falls from 1 or more lit icons to 0, for 30 s', () => {
  assert.equal(POP_SECS, 30);
  // the 5-hour 1 → 0, the design's c-0
  const a = stepShown(file({ h5: 1 }), NOW, cur({ h5: 0 }));
  assert.deepEqual(a, { next: { v: 2, at: NOW, h5: 0, week: 2, fable: 4, until: { pop: NOW + 30 } }, changed: true, popped: true });
  // from any number of icons (a window used up between two renders), and the week and Fable's weekly alike
  assert.equal(stepShown(file({ h5: 10 }), NOW, cur({ h5: 0 })).popped, true);
  assert.equal(stepShown(file({ week: 1 }), NOW, cur({ week: 0 })).popped, true);
  assert.equal(stepShown(file({ fable: 1 }), NOW, cur({ fable: 0 })).popped, true);
  assert.deepEqual(stepShown(file({ week: 3, h5: 1 }), NOW, cur({ h5: 0, week: 0 })).next.until, { pop: NOW + 30 }, 'both at once: one pop');
  // only for a window a held reset refills
  const only = (w: 'h5' | 'week' | 'fable'): ShownNow['refills'] => ({ h5: w === 'h5', week: w === 'week', fable: w === 'fable' });
  for (const w of ['h5', 'week', 'fable'] as const) {
    for (const r of ['h5', 'week', 'fable'] as const) assert.equal(stepShown(file({ [w]: 1 }), NOW, cur({ [w]: 0, refills: only(r) })).popped, w === r, `${w} falls, ${r} refilled`);
  }
  // a pop that is still showing and another window that falls: a new 30 s
  assert.equal(stepShown(file({ h5: 0, week: 1, until: { pop: NOW - 10 } }), NOW, cur({ h5: 0, week: 0 })).next.until.pop, NOW + 30);
  // no pop: no window refilled, no fall, a window not live now or before, no saved file
  for (const [what, saved, now] of [
    ['no window refilled', file({ h5: 1 }), cur({ h5: 0, refills: { h5: false, week: false, fable: false } })],
    ['1 → 1', file({ h5: 1 }), cur({ h5: 1 })],
    ['2 → 1', file({ h5: 2 }), cur({ h5: 1 })],
    ['0 → 0', file({ h5: 0 }), cur({ h5: 0 })],
    ['a window not live before (null → 0)', file({ h5: null }), cur({ h5: 0 })],
    ['a window not live now (1 → null)', file({ h5: 1 }), cur({ h5: null })],
    ['the week 1 → 1, the 5-hour 0 → 0', file({ h5: 0, week: 1 }), cur({ h5: 0, week: 1 })],
    ['no saved file', null, cur({ h5: 0 })],
  ] as Array<[string, unknown, ShownNow]>) {
    const r = stepShown(saved, NOW, now);
    assert.equal(r.popped, false, what);
    assert.equal(r.next.until.pop, (saved as ShownFile | null)?.until.pop ?? 0, `${what}: the saved until.pop stays`);
  }
});

test('stepShown: the saved until.pop stays (the pop shows until it), and only a change is worth a write', () => {
  const popping = file({ at: NOW - 18, h5: 0, until: { pop: NOW + 12 } });
  assert.deepEqual(stepShown(popping, NOW, cur({ h5: 0 })), { next: { ...popping, at: NOW }, changed: false, popped: false }, 'the same values: no write, `at` aside');
  assert.equal(stepShown(popping, NOW + 100, cur({ h5: 0 })).next.until.pop, NOW + 12, 'an ended pop is kept: it shows no more');
  for (const [what, now] of [['the hearts', cur({ h5: 8 })], ['the week', cur({ week: 1 })], ['Fable\'s weekly', cur({ fable: 3 })], ['Fable\'s no longer fresh', cur({ fable: null })]] as const) {
    assert.equal(stepShown(file(), NOW, now).changed, true, what);
  }
  assert.equal(stepShown(file(), NOW, cur({ refills: { h5: true, week: false, fable: false } })).changed, false, 'refills is not kept');
  // no saved file: worth a write when anything is known
  assert.deepEqual(stepShown(null, NOW, cur()), { next: { v: 2, at: NOW, h5: 9, week: 2, fable: 4, until: { pop: 0 } }, changed: true, popped: false });
  assert.equal(stepShown(null, NOW, cur({ h5: null, week: null, fable: null })).changed, false, 'nothing known: nothing to remember');
  assert.equal(stepShown(null, NOW, cur({ h5: null, week: 0, fable: null })).changed, true);
  assert.equal(stepShown(null, NOW, cur({ h5: null, week: null, fable: 0 })).changed, true);
});

test('savedShown: a saved file counts only as the step wrote it; a clock that went back is no file, and so is 1.1.0\'s v 1', () => {
  assert.deepEqual(savedShown(file(), NOW), file());
  assert.deepEqual(savedShown({ ...file(), extra: 1, credits: 50, h5: null, week: null, fable: null }, NOW), { ...file(), h5: null, week: null, fable: null }, 'unknown keys are dropped');
  assert.deepEqual(savedShown(file({ at: NOW }), NOW)?.at, NOW, 'written this second');
  assert.deepEqual(savedShown(file({ at: 0, until: { pop: 30 } }), NOW)?.until, { pop: 30 }, 'a pop up to 30 s after its write');
  assert.equal(savedShown(file({ at: 12.5, until: { pop: 42.5 } }), NOW)?.at, 12.5, 'times need not be whole');
  for (const [what, v] of [
    ['null', null], ['a string', 'x'], ['an array', [file()]], ['no v', { ...file(), v: undefined }], ['v 3', { ...file(), v: 3 }],
    ['1.1.0\'s v 1', { v: 1, at: NOW - 30, h5: 9, week: 2, credits: 50, until: { pop: 0 } }], ['v 1 with fable', { ...file(), v: 1 }],
    ['a clock that went back', file({ at: NOW + 1 })], ['at not a number', { ...file(), at: '1' }], ['at negative', file({ at: -1 })], ['at Infinity', file({ at: Infinity })],
    ['at NaN', file({ at: NaN })],
    ['h5 11', file({ h5: 11 })], ['h5 -1', file({ h5: -1 })], ['h5 1.5', file({ h5: 1.5 })], ['h5 a string', { ...file(), h5: '1' }], ['h5 missing', { ...file(), h5: undefined }],
    ['week 11', file({ week: 11 })], ['week missing', { ...file(), week: undefined }],
    ['fable 11', file({ fable: 11 })], ['fable -1', file({ fable: -1 })], ['fable a string', { ...file(), fable: '1' }],
    ['fable missing (absent is not null)', { ...file(), fable: undefined }],
    ['no until', { ...file(), until: undefined }], ['until null', { ...file(), until: null }], ['until an array', { ...file(), until: [0] }],
    ['until.pop missing', { ...file(), until: {} }], ['until.pop negative', file({ until: { pop: -1 } })], ['until.pop a string', { ...file(), until: { pop: '0' } }],
    ['a pop that ends more than 30 s after the write', file({ until: { pop: NOW - 30 + 31 } })],
  ] as Array<[string, unknown]>) {
    assert.equal(savedShown(v, NOW), null, what);
    // a file that does not count is no file: no pop from it, and its until.pop is not kept
    assert.deepEqual(stepShown(v, NOW, cur({ h5: 0 })).next.until, { pop: 0 }, what);
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// On disk
// ---------------------------------------------------------------------------------------------------------------------

test('diskShown: the step on disk; the write waits on `after` and is made only on a change; no session key or persist false: nothing read or written', () => {
  const dir = tempDir('hb-shown-');
  try {
    const path = shownPath(dir, 'sess-1');
    assert.equal(path, join(dir, 'hud', 'sess-1.shown.json'));
    const after: Array<() => void> = [];
    const run = (now: number, c: ShownNow, o: { sid?: string | null; persist?: boolean } = {}): number =>
      diskShown({ cacheDir: dir, sid: o.sid === undefined ? 'sess-1' : o.sid, now, cur: c, after, persist: o.persist ?? true });
    // the first render: nothing saved, so a write once the line is out
    assert.equal(run(NOW, cur({ h5: 1 })), 0);
    assert.equal(after.length, 1);
    assert.equal(existsSync(path), false, 'nothing written before the hook runs');
    after.shift()!();
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), { v: 2, at: NOW, h5: 1, week: 2, fable: 4, until: { pop: 0 } });
    // the same values: no write
    assert.equal(run(NOW + 5, cur({ h5: 1 })), 0);
    assert.equal(after.length, 0);
    // the 5-hour hits 0: the pop, until 30 s on
    assert.equal(run(NOW + 10, cur({ h5: 0 })), NOW + 40);
    after.shift()!();
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), { v: 2, at: NOW + 10, h5: 0, week: 2, fable: 4, until: { pop: NOW + 40 } });
    assert.equal(run(NOW + 20, cur({ h5: 0 })), NOW + 40, 'the next render reads it back');
    assert.equal(after.length, 0);
    // no session key, persist false: 0, and nothing read (the saved pop is not answered) or written
    assert.equal(run(NOW + 20, cur({ h5: 5 }), { sid: null }), 0);
    assert.equal(run(NOW + 20, cur({ h5: 5 }), { persist: false }), 0);
    assert.equal(after.length, 0);
    // a clock that went back: no file, so no pop; the next write replaces it
    assert.equal(run(NOW, cur({ h5: 0 })), 0);
    after.shift()!();
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).at, NOW);
    // 1.1.0's v1 file is no file: replaced by the first write
    writeFileSync(path, JSON.stringify({ v: 1, at: NOW, h5: 1, week: 2, credits: 50, until: { pop: 0 } }));
    assert.equal(run(NOW + 30, cur({ h5: 0 })), 0, 'a v1 1 → v2 0 is no fall seen');
    after.shift()!();
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).v, 2);
    // a write that fails (hud/ is a file) is dropped: the next render tries again
    const other = tempDir('hb-shown-x-');
    try {
      writeFileSync(join(other, 'hud'), 'not a folder');
      const later: Array<() => void> = [];
      assert.equal(diskShown({ cacheDir: other, sid: 's', now: NOW, cur: cur(), after: later, persist: true }), 0);
      assert.doesNotThrow(() => later[0]!());
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * A temp world for renderPayload and dist: the cache and Claude config folders, a hungerbar.json, and the folder the
 * payloads run in, `work`, which is no repo on any OS: git's ceiling is the world, so the walk up from it stops there.
 * (A Windows path such as C:\ is relative on macOS and Linux: it resolved under the test's own checkout, found its .git,
 * and the history step's write joined the render's `after` list there and nowhere else.)
 */
function world(config: unknown): {
  dir: string; cache: string; env: Record<string, string>; cleanup(): void;
  /** A payload: the 5-hour at `used` %, the week at 40%, $50 of credits with `spent` spent (stdin's spend_limit). */
  payload(used: number, spent: number, sid?: string | null): string;
} {
  const dir = tempDir('hb-shown-w-'), work = join(dir, 'work');
  mkdirSync(join(dir, 'claude'));
  mkdirSync(work);
  writeFileSync(join(dir, 'claude', 'hungerbar.json'), JSON.stringify(config));
  const cache = join(dir, 'cache');
  return {
    dir, cache,
    env: {
      PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? 'C:\\Windows', TEMP: dir, TMP: dir, CLAUDE_CONFIG_DIR: join(dir, 'claude'),
      HUNGERBAR_CACHE_DIR: cache, HUNGERBAR_NOW: String(NOW), HUNGERBAR_NO_SPAWN: '1', HUNGERBAR_ELEVATED: '0', FORCE_COLOR: '3', GIT_CEILING_DIRECTORIES: dir,
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
    payload: (used, spent, sid = 'sess-2') => JSON.stringify({
      ...(sid ? { session_id: sid } : {}), cwd: work, model: { display_name: 'Opus 5.5' }, version: '2.1.306',
      rate_limits: { five_hour: { used_percentage: used, resets_at: NOW + 3900 }, seven_day: { used_percentage: 40, resets_at: NOW + 345540 }, spend_limit: { used_usd: spent, limit_usd: 50 } },
    }),
  };
}
const hotbar = (text: string): string => text.split('\n').at(-2)!.replace(/\x1b\[[\d;]*m/g, '');
/** One full limit reset, ending 20 days after NOW. */
const TOTEMS = [{ n: 1, kind: 'full', until: new Date((NOW + 20 * 86400) * 1000).toISOString() }];

test('the HUD path: the shown-file is stepped only with hud.totem on, a reset held and a session key; its pop draws the idol with ✦ between gold sides for 30 s', () => {
  const w = world({ look: 'hud', hud: { align: 'left', user: 'off', poison: 'off' }, totems: TOTEMS });
  try {
    const path = shownPath(w.cache, 'sess-2');
    const render = (raw: string, now: number, env: Record<string, string> = {}): { text: string; after: Array<() => void> } => {
      const r = renderPayload(raw, { env: { ...w.env, HUNGERBAR_NOW: String(now), ...env } });
      return { text: r.text, after: r.after };
    };
    // 99% used: one heart; the totem is in the offhand (the window is at 1%), the emerald in slot 5
    let r = render(w.payload(99, 4.2), NOW);
    assert.match(hotbar(r.text), /^v2\.1\.306\u00a0\u00a0\u{1FB0C}••\u{1FB0D}\u00a0\u00a0▐/u);
    for (const f of r.after) f();
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), { v: 2, at: NOW, h5: 1, week: 6, fable: null, until: { pop: 0 } });
    // used up: the pop, with the credits paying in slot 5
    r = render(w.payload(100, 4.2), NOW + 60);
    assert.ok(hotbar(r.text).startsWith(`v2.1.306\u00a0${POP}\u00a0▐`), hotbar(r.text));
    assert.ok(hotbar(r.text).includes('▐◆\u00a045▌'), 'the emerald in slot 5, green');
    assert.ok(r.text.includes('\x1b[38;2;255;200;61;48;2;93;93;93m▐\x1b[0m'), 'a gold side on the frame grey');
    for (const f of r.after) f();
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).until.pop, NOW + 90);
    // 29 s later still; at 30 s the gold stays and the idol re-centres (call-pop-gold)
    assert.ok(hotbar(render(w.payload(100, 4.2), NOW + 89).text).includes(POP));
    assert.ok(hotbar(render(w.payload(100, 4.2), NOW + 90).text).startsWith(`v2.1.306\u00a0${CALL}`));
    // hud.totem off, or no reset held: the file is not read (no pop), and not written
    assert.ok(hotbar(render(w.payload(100, 4.2), NOW + 70).text).includes(POP), 'on (the default): the pop from the file');
    for (const cfg of [{ totem: 'off', totems: TOTEMS }, { totem: 'on', totems: [] }, { totem: 'on', totems: [{ ...TOTEMS[0], until: new Date((NOW + 60) * 1000).toISOString() }] }]) {
      const w2 = world({ look: 'hud', hud: { align: 'left', user: 'off', totem: cfg.totem }, totems: cfg.totems });
      try {
        mkdirSync(join(w2.cache, 'hud'), { recursive: true });
        const p2 = shownPath(w2.cache, 'sess-2'), saved = JSON.stringify({ v: 2, at: NOW + 60, h5: 0, week: 6, fable: null, until: { pop: NOW + 90 } });
        writeFileSync(p2, saved);
        const t = renderPayload(w2.payload(100, 4.2), { env: { ...w2.env, HUNGERBAR_NOW: String(NOW + 70) } });
        // the world is no repo on any OS, so no history step defers a write either: what could be deferred is the shown-file's
        assert.equal(t.state?.git.isRepo, false, 'the payload runs in no repo (a cwd that resolves into a checkout brings the history\'s write)');
        assert.match(hotbar(t.text), /^v2\.1\.306\u00a0▐◆\u00a045▌/u, `${JSON.stringify(cfg)}: no totem, the paying emerald in the offhand`);
        assert.equal(t.after.length, 0, 'no write');
        assert.equal(readFileSync(p2, 'utf8'), saved);
        assert.deepEqual(readdirSync(join(w2.cache, 'hud')), ['sess-2.shown.json'], 'nothing else is written there');
      } finally {
        w2.cleanup();
      }
    }
    // no session key: nothing read or written
    const before = readdirSync(join(w.cache, 'hud'));
    const n = render(w.payload(100, 4.2, null), NOW + 70);
    assert.ok(hotbar(n.text).startsWith(`v2.1.306\u00a0${CALL}`), 'no key: no pop');
    for (const f of n.after) f();
    assert.deepEqual(readdirSync(join(w.cache, 'hud')), before);
  } finally {
    w.cleanup();
  }
});

test('dist: the shown-file is written after the line is out; a second render writes nothing; preview never reads or writes it', () => {
  const w = world({ look: 'hud', hud: { align: 'left', user: 'off' }, totems: TOTEMS });
  try {
    const stub = pathToFileURL(join(ROOT, 'test', 'order-stub.mjs')).href;
    const run = (raw: string): { stdout: string; order: string[] } => {
      const r = spawnSync(process.execPath, ['--import', stub, DIST], { input: raw, env: w.env, encoding: 'utf8', windowsHide: true, timeout: 15000 });
      assert.equal(r.status, 0, r.stderr);
      const m = /^ORDER (.*)$/m.exec(r.stderr);
      assert.ok(m, r.stderr);
      return { stdout: r.stdout, order: JSON.parse(m[1]!) as string[] };
    };
    const first = run(w.payload(99, 4.2, 'dist-order'));
    const shown = first.order.findIndex((e) => /\/hud\/dist-order\.shown\.json$/.test(e.replace(/^rename /, '')));
    assert.ok(shown >= 0, JSON.stringify(first.order));
    assert.ok(first.order.indexOf('stdout') >= 0 && first.order.indexOf('stdout') < shown, `stdout first: ${JSON.stringify(first.order)}`);
    const second = run(w.payload(99, 4.2, 'dist-order'));
    assert.equal(second.stdout, first.stdout);
    assert.ok(!second.order.some((e) => e.includes('.shown.json')), 'nothing changed: no write');
    // preview --payload (persist false): a saved pop is not drawn, and nothing is written
    const path = shownPath(w.cache, 'dist-order');
    writeFileSync(path, JSON.stringify({ v: 2, at: NOW, h5: 0, week: 6, fable: null, until: { pop: NOW + 30 } }));
    const pf = join(w.dir, 'p.json');
    writeFileSync(pf, w.payload(100, 4.2, 'dist-order'));
    const before = readFileSync(path, 'utf8');
    const p = runDist('', w.env, ['preview', '--payload', pf]);
    assert.equal(p.status, 0, p.stderr);
    assert.ok(!hotbar(p.stdout.trimEnd()).includes('✦'), 'preview: no pop');
    assert.equal(readFileSync(path, 'utf8'), before);
    // and the status line itself pops from it
    assert.ok(hotbar(run(w.payload(100, 4.2, 'dist-order')).stdout).includes(POP));
  } finally {
    w.cleanup();
  }
});

test('pruneOld: a shown-file untouched for 7 days goes with the history files', () => {
  const dir = tempDir('hb-shown-p-');
  try {
    const hud = join(dir, 'hud');
    mkdirSync(hud);
    const nowMs = NOW * 1000, day = 86400e3;
    for (const [f, age] of [['old.shown.json', 8 * day], ['new.shown.json', day]] as const) {
      writeFileSync(join(hud, f), '{}');
      utimesSync(join(hud, f), (nowMs - age) / 1000, (nowMs - age) / 1000);
    }
    assert.equal(pruneOld(dir, nowMs), 1);
    assert.deepEqual(readdirSync(hud), ['new.shown.json']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
