// The shown-file (src/shown.ts, SPEC §0.12, 1.1.0): the totem's memory. The step's rules (the pop fires on a window
// that falls from 1 or more lit icons to 0 while credits are held; it lasts 30 s; what is worth a write), what a saved
// file must be to count (a clock that went back is no file), the disk step (no session key, persist false: nothing read
// or written; the write waits on `after` and happens only on a change), and through the real paths: renderPayload's
// disk sources (only with hud.totem on, the pop drawn from the file), dist (the write after stdout, a second render
// writes nothing), preview (never), and the 7-day sweep.
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
const cur = (over: Partial<ShownNow> = {}): ShownNow => ({ h5: 9, week: 2, credits: 50, holds: true, ...over });
const file = (over: Partial<ShownFile> = {}): ShownFile => ({ v: 1, at: NOW - 30, h5: 9, week: 2, credits: 50, until: { pop: 0 }, ...over });

// ---------------------------------------------------------------------------------------------------------------------
// The step
// ---------------------------------------------------------------------------------------------------------------------

test('stepShown: the pop fires when a window falls from 1 or more lit icons to 0 while credits are held, for 30 s', () => {
  assert.equal(POP_SECS, 30);
  // the 5-hour 1 → 0, the design's t-pop
  const a = stepShown(file({ h5: 1 }), NOW, cur({ h5: 0 }));
  assert.deepEqual(a, { next: { v: 1, at: NOW, h5: 0, week: 2, credits: 50, until: { pop: NOW + 30 } }, changed: true, popped: true });
  // from any number of icons (a window used up between two renders), and the week alike
  assert.equal(stepShown(file({ h5: 10 }), NOW, cur({ h5: 0 })).popped, true);
  assert.equal(stepShown(file({ week: 1 }), NOW, cur({ week: 0 })).popped, true);
  assert.deepEqual(stepShown(file({ week: 3, h5: 1 }), NOW, cur({ h5: 0, week: 0 })).next.until, { pop: NOW + 30 }, 'both at once: one pop');
  // a pop that is still showing and another window that falls: a new 30 s
  assert.equal(stepShown(file({ h5: 0, week: 1, until: { pop: NOW - 10 } }), NOW, cur({ h5: 0, week: 0 })).next.until.pop, NOW + 30);
  // no pop: no credits held, no fall, a window not live now or before, no saved file
  for (const [what, saved, now] of [
    ['no credits held', file({ h5: 1 }), cur({ h5: 0, holds: false })],
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
  for (const [what, now] of [['the hearts', cur({ h5: 8 })], ['the week', cur({ week: 1 })], ['the credits', cur({ credits: 49 })], ['credits no longer fresh', cur({ credits: null })]] as const) {
    assert.equal(stepShown(file(), NOW, now).changed, true, what);
  }
  assert.equal(stepShown(file(), NOW, cur({ holds: false })).changed, false, 'holds is not kept');
  // no saved file: worth a write when anything is known
  assert.deepEqual(stepShown(null, NOW, cur()), { next: { v: 1, at: NOW, h5: 9, week: 2, credits: 50, until: { pop: 0 } }, changed: true, popped: false });
  assert.equal(stepShown(null, NOW, cur({ h5: null, week: null, credits: null })).changed, false, 'nothing known: nothing to remember');
  assert.equal(stepShown(null, NOW, cur({ h5: null, week: 0, credits: null })).changed, true);
  assert.equal(stepShown(null, NOW, cur({ h5: null, week: null, credits: 0 })).changed, true);
});

test('savedShown: a saved file counts only as the step wrote it; a clock that went back is no file', () => {
  assert.deepEqual(savedShown(file(), NOW), file());
  assert.deepEqual(savedShown({ ...file(), extra: 1, h5: null, week: null, credits: null }, NOW), { ...file(), h5: null, week: null, credits: null }, 'unknown keys are dropped');
  assert.deepEqual(savedShown(file({ at: NOW }), NOW)?.at, NOW, 'written this second');
  assert.deepEqual(savedShown(file({ at: 0, until: { pop: 30 } }), NOW)?.until, { pop: 30 }, 'a pop up to 30 s after its write');
  assert.equal(savedShown(file({ at: 12.5, until: { pop: 42.5 } }), NOW)?.at, 12.5, 'times need not be whole');
  for (const [what, v] of [
    ['null', null], ['a string', 'x'], ['an array', [file()]], ['v 2', { ...file(), v: 2 }], ['no v', { ...file(), v: undefined }],
    ['a clock that went back', file({ at: NOW + 1 })], ['at not a number', { ...file(), at: '1' }], ['at negative', file({ at: -1 })], ['at Infinity', file({ at: Infinity })],
    ['at NaN', file({ at: NaN })],
    ['h5 11', file({ h5: 11 })], ['h5 -1', file({ h5: -1 })], ['h5 1.5', file({ h5: 1.5 })], ['h5 a string', { ...file(), h5: '1' }], ['h5 missing', { ...file(), h5: undefined }],
    ['week 11', file({ week: 11 })], ['week missing', { ...file(), week: undefined }],
    ['credits negative', file({ credits: -1 })], ['credits not whole', file({ credits: 1.5 })], ['credits a string', { ...file(), credits: '50' }], ['credits missing', { ...file(), credits: undefined }],
    ['credits past the safe integers', file({ credits: 2 ** 53 })],
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
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), { v: 1, at: NOW, h5: 1, week: 2, credits: 50, until: { pop: 0 } });
    // the same values: no write
    assert.equal(run(NOW + 5, cur({ h5: 1 })), 0);
    assert.equal(after.length, 0);
    // the 5-hour hits 0: the pop, until 30 s on
    assert.equal(run(NOW + 10, cur({ h5: 0 })), NOW + 40);
    after.shift()!();
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), { v: 1, at: NOW + 10, h5: 0, week: 2, credits: 50, until: { pop: NOW + 40 } });
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

test('the HUD path: the shown-file is stepped only with hud.totem on and a session key; its pop draws ☥✦ between gold sides for 30 s', () => {
  const w = world({ look: 'hud', hud: { align: 'left', user: 'off', poison: 'off' } });
  try {
    const path = shownPath(w.cache, 'sess-2');
    const render = (raw: string, now: number, env: Record<string, string> = {}): { text: string; after: Array<() => void> } => {
      const r = renderPayload(raw, { env: { ...w.env, HUNGERBAR_NOW: String(now), ...env } });
      return { text: r.text, after: r.after };
    };
    // 99% used: one heart; the totem waits in the offhand (the window is at 1%)
    let r = render(w.payload(99, 4.2), NOW);
    assert.match(hotbar(r.text), /^v2\.1\.306\u00a0\u00a0☥\u00a045\u00a0\u00a0▐/u);
    for (const f of r.after) f();
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), { v: 1, at: NOW, h5: 1, week: 6, credits: 45, until: { pop: 0 } });
    // used up: the pop, with the credits paying
    r = render(w.payload(100, 4.2), NOW + 60);
    assert.match(hotbar(r.text), /^v2\.1\.306\u00a0▐☥✦45▌\u00a0▐/u);
    assert.ok(r.text.includes('\x1b[38;2;255;200;61;48;2;93;93;93m▐\x1b[0m'), 'a gold side on the frame grey');
    for (const f of r.after) f();
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).until.pop, NOW + 90);
    // 29 s later still; at 30 s the paying emerald
    assert.match(hotbar(render(w.payload(100, 4.2), NOW + 89).text), /▐☥✦45▌/u);
    assert.match(hotbar(render(w.payload(100, 4.2), NOW + 90).text), /^v2\.1\.306\u00a0▐◆\u00a045▌/u);
    // hud.totem off: the file is not read (no pop), and not written
    assert.match(hotbar(render(w.payload(100, 4.2), NOW + 70).text), /▐☥✦45▌/u, 'on (the default): the pop from the file');
    const w2 = world({ look: 'hud', hud: { align: 'left', user: 'off', totem: 'off' } });
    try {
      mkdirSync(join(w2.cache, 'hud'), { recursive: true });
      const p2 = shownPath(w2.cache, 'sess-2'), saved = JSON.stringify({ v: 1, at: NOW + 60, h5: 0, week: 6, credits: 45, until: { pop: NOW + 90 } });
      writeFileSync(p2, saved);
      const t = renderPayload(w2.payload(100, 4.2), { env: { ...w2.env, HUNGERBAR_NOW: String(NOW + 70) } });
      // the world is no repo on any OS, so no history step defers a write either: what could be deferred is the shown-file's
      assert.equal(t.state?.git.isRepo, false, 'the payload runs in no repo (a cwd that resolves into a checkout brings the history\'s write)');
      assert.match(hotbar(t.text), /^v2\.1\.306\u00a0▐◆\u00a045▌/u, 'off: no pop, so the file was not read');
      assert.equal(t.after.length, 0, 'off: no write');
      for (const f of t.after) f();
      assert.equal(readFileSync(p2, 'utf8'), saved);
      assert.deepEqual(readdirSync(join(w2.cache, 'hud')), ['sess-2.shown.json'], 'off: nothing else is written there');
    } finally {
      w2.cleanup();
    }
    // no session key: nothing read or written
    const before = readdirSync(join(w.cache, 'hud'));
    const n = render(w.payload(100, 4.2, null), NOW + 70);
    assert.match(hotbar(n.text), /^v2\.1\.306\u00a0▐◆\u00a045▌/u, 'no key: no pop');
    for (const f of n.after) f();
    assert.deepEqual(readdirSync(join(w.cache, 'hud')), before);
  } finally {
    w.cleanup();
  }
});

test('dist: the shown-file is written after the line is out; a second render writes nothing; preview never reads or writes it', () => {
  const w = world({ look: 'hud', hud: { align: 'left', user: 'off' } });
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
    writeFileSync(path, JSON.stringify({ v: 1, at: NOW, h5: 0, week: 6, credits: 45, until: { pop: NOW + 30 } }));
    const pf = join(w.dir, 'p.json');
    writeFileSync(pf, w.payload(100, 4.2, 'dist-order'));
    const before = readFileSync(path, 'utf8');
    const p = runDist('', w.env, ['preview', '--payload', pf]);
    assert.equal(p.status, 0, p.stderr);
    assert.match(hotbar(p.stdout.trimEnd()), /^v2\.1\.306\u00a0▐◆\u00a045▌/u, 'preview: no pop');
    assert.equal(readFileSync(path, 'utf8'), before);
    // and the status line itself pops from it
    assert.match(hotbar(run(w.payload(100, 4.2, 'dist-order')).stdout), /▐☥✦45▌/u);
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
