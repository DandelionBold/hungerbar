// No-network guard: with fetch, sockets and DNS trapped, the default render passes and asks for no usage refresh (SPEC §16.6).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { renderPayload } from '../src/render.ts';
import { DIST, loadCase, prepare, ROOT } from './harness.ts';

const STUB = pathToFileURL(join(ROOT, 'test', 'nonet-stub.mjs')).href;

test('dist render with the network trapped: normal output, no usage refresh, nothing on stderr', () => {
  const c = loadCase('normal');
  delete c.config;
  const p = prepare(c);
  try {
    const r = spawnSync(process.execPath, ['--import', STUB, DIST], { input: p.stdin, env: { ...p.env, NO_COLOR: '1' }, encoding: 'utf8', windowsHide: true });
    assert.equal(r.status, 0);
    assert.equal(r.stderr, '');
    assert.match(r.stdout, /Model: Opus 5\.5/);
    const spawns = renderPayload(p.stdin, { env: p.env }).spawns;
    assert.ok(!spawns.some((s) => s[1] === 'usage'), 'default config: no usage refresher');
    const offline = renderPayload(p.stdin, { env: { ...p.env, HUNGERBAR_USAGE_API: '1', HUNGERBAR_OFFLINE: '1' } }).spawns;
    assert.ok(!offline.some((s) => s[1] === 'usage'), 'HUNGERBAR_OFFLINE wins over the opt-in');
  } finally {
    p.cleanup();
  }
});

test('the usage refresher itself is a no-op when offline, even with the network trapped', () => {
  const p = prepare({ payload: {} });
  try {
    const r = spawnSync(process.execPath, ['--import', STUB, DIST, 'refresh', 'usage'], { env: { ...p.env, HUNGERBAR_OFFLINE: '1', CLAUDE_CODE_OAUTH_TOKEN: 'x' }, encoding: 'utf8', windowsHide: true });
    assert.equal(r.status, 0);
    assert.equal(r.stderr, '');
  } finally {
    p.cleanup();
  }
});

// the defaults (SPEC §0.10): the HUD with hud.fable boss, but the usage API and the PR status off until the user says yes
for (const [what, config] of [['no hungerbar.json (the defaults: the HUD, boss)', undefined], ['look hud, fable off', { look: 'hud', hud: { fable: 'off' } }]] as const) {
  test(`${what}, in colour, with the network trapped: the HUD draws, no usage or PR refresh is queued, no fetch`, () => {
    const c = loadCase('normal');
    if (config === undefined) delete c.config;
    else c.config = config;
    const p = prepare(c);
    try {
      const env = { ...p.env, FORCE_COLOR: '3' };
      const r = spawnSync(process.execPath, ['--import', STUB, DIST], { input: p.stdin, env, encoding: 'utf8', windowsHide: true });
      assert.equal(r.status, 0);
      assert.equal(r.stderr, '');
      assert.match(r.stdout, /⛏/);
      const inproc = renderPayload(p.stdin, { env });
      assert.ok(inproc.hud, 'the HUD drew in-process too');
      assert.deepEqual(inproc.hud.input.scoped, [], 'no scoped data without the usage API');
      assert.ok(!inproc.spawns.some((s) => s[1] === 'usage'), 'no usage refresher');
      assert.ok(!inproc.spawns.some((s) => s[1] === 'pr'), 'no PR refresher');
      assert.equal(inproc.hud.pr, null, 'no PR');
    } finally {
      p.cleanup();
    }
  });
}

test('the PR status (hud.pr on) with the network trapped: the render queues no refresher offline, and the refresher itself starts no gh offline', () => {
  const c = loadCase('hud-pr');
  const p = prepare(c);
  try {
    const env = { ...p.env, FORCE_COLOR: '3' };
    const r = spawnSync(process.execPath, ['--import', STUB, DIST], { input: p.stdin, env, encoding: 'utf8', windowsHide: true });
    assert.deepEqual([r.status, r.stderr], [0, '']);
    assert.match(r.stdout, /#\x1b\[0m\x1b\[38;2;255;255;255m123/, 'the cached PR is drawn: the render only reads it');
    for (const off of [{ HUNGERBAR_OFFLINE: '1' }, { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }]) {
      const stale = renderPayload(p.stdin, { env: { ...env, ...off }, now: Number(p.env.HUNGERBAR_NOW) + 120 });
      assert.ok(!stale.spawns.some((s) => s[1] === 'pr'), `${Object.keys(off)[0]}: no PR refresher`);
      assert.equal(stale.hud!.pr, null, 'and nothing drawn, though the entry is under an hour old');
      assert.ok(renderPayload(p.stdin, { env, now: Number(p.env.HUNGERBAR_NOW) + 120 }).spawns.some((s) => s[1] === 'pr'), 'online, the same stale entry is asked again');
    }
    // a gh that would leave a mark if it ran
    const mark = join(p.dir, 'gh-ran'), gh = join(p.dir, 'gh.mjs');
    writeFileSync(gh, `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(mark)}, '');\n`);
    const repo = join(p.dir, 'fs', 'm0');
    const w = spawnSync(process.execPath, ['--import', STUB, DIST, 'refresh', 'pr', repo, 'main'], { env: { ...p.env, HUNGERBAR_GH: gh, HUNGERBAR_OFFLINE: '1' }, encoding: 'utf8', windowsHide: true });
    assert.deepEqual([w.status, w.stderr, existsSync(mark)], [0, '', false]);
  } finally {
    p.cleanup();
  }
});
