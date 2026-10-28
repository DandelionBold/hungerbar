// The HUD's PR status (SPEC §0.9, 0.7.0) end to end with a stub gh, never the real one and never the network: every
// world's PATH is an empty folder, so only HUNGERBAR_GH (a .mjs stub that does what its JSON file says and logs each
// run) can answer. The refresher (`hungerbar refresh pr <root> <branch>`, through dist and in process) writes the
// branch's entry; the render (in process) draws it from the cache, queues the refresher only when the entry is stale and
// a remote is on GitHub, and runs no process itself.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Config } from '../src/config.ts';
import { normRoot } from '../src/git/cache.ts';
import { prLockPath, prPath, readPrEntry } from '../src/pr/cache.ts';
import { PR_ARGS, type PrInfo } from '../src/pr/gh.ts';
import { refreshPr } from '../src/pr/refresh.ts';
import { renderPayload, type RenderResult } from '../src/render.ts';
import { DIST, stripAnsi } from './harness.ts';
import { plainDefaults } from './plain-config.ts';

const NOW = 1792859460;
const HUD: Config = { ...plainDefaults(), look: 'hud' };
const HUD_PR: Config = { ...HUD, hud: { ...HUD.hud, pr: 'on' } };
const BRANCH = 'feature/x';
const GITHUB = '[core]\n\tbare = false\n[remote "origin"]\n\turl = git@github.com:steve/hungerbar.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n';

/** What the stub does: its stdout and stderr, its exit code, a sleep first, a checkout while it runs. */
interface Stub { stdout?: string; stderr?: string; code?: number; sleepMs?: number; big?: number; checkout?: string }

const STUB = `import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
const cfg = JSON.parse(readFileSync(process.env.STUB_GH, 'utf8'));
const e = process.env;
appendFileSync(cfg.log, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), pid: process.pid,
  env: [e.GH_PROMPT_DISABLED, e.GH_NO_UPDATE_NOTIFIER, e.GH_NO_EXTENSION_UPDATE_NOTIFIER, e.GH_SPINNER_DISABLED, e.NO_COLOR, e.GIT_TERMINAL_PROMPT] }) + '\\n');
if (cfg.checkout) writeFileSync(cfg.head, cfg.checkout);
const finish = () => {
  if (cfg.stderr) process.stderr.write(cfg.stderr);
  if (cfg.stdout) process.stdout.write(cfg.stdout);
  if (cfg.big) process.stdout.write('x'.repeat(cfg.big));
  process.exitCode = cfg.code ?? 0;
};
if (cfg.sleepMs) setTimeout(finish, cfg.sleepMs); else finish();
`;

interface World {
  dir: string; repo: string; cache: string; env: Record<string, string>; log: string;
  stub(s: Stub): void; runs(): Array<{ argv: string[]; cwd: string; pid: number; env: string[] }>; head(text: string): void; cleanup(): void;
}

function world(config = GITHUB): World {
  const dir = mkdtempSync(join(tmpdir(), 'hb-pr-'));
  const repo = join(dir, 'repo'), cache = join(dir, 'cache'), bin = join(dir, 'bin'), log = join(dir, 'gh.log'), cfg = join(dir, 'stub.json'), stub = join(dir, 'stub-gh.mjs');
  mkdirSync(join(repo, '.git'), { recursive: true });
  mkdirSync(bin);
  writeFileSync(join(repo, '.git', 'HEAD'), `ref: refs/heads/${BRANCH}\n`);
  writeFileSync(join(repo, '.git', 'config'), config);
  writeFileSync(stub, STUB);
  writeFileSync(log, '');
  const env: Record<string, string> = {
    PATH: bin, SystemRoot: process.env.SystemRoot ?? 'C:\\Windows', TEMP: tmpdir(), TMP: tmpdir(),
    HUNGERBAR_CACHE_DIR: cache, CLAUDE_CONFIG_DIR: join(dir, 'claude'), HUNGERBAR_NO_SPAWN: '1', HUNGERBAR_NOW: String(NOW),
    HUNGERBAR_GH: stub, STUB_GH: cfg,
  };
  const w: World = {
    dir, repo, cache, env, log,
    stub: (s) => writeFileSync(cfg, JSON.stringify({ ...s, log, head: join(repo, '.git', 'HEAD') })),
    runs: () => readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { argv: string[]; cwd: string; pid: number; env: string[] }),
    head: (text) => writeFileSync(join(repo, '.git', 'HEAD'), text),
    cleanup: () => rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }),
  };
  w.stub({});
  return w;
}

/** gh's JSON for PR #123: open, checks running (one passed, one in progress), approved. */
const OPEN = JSON.stringify({
  number: 123, state: 'OPEN', isDraft: false, mergeable: 'MERGEABLE', reviewDecision: 'APPROVED',
  statusCheckRollup: [
    { __typename: 'CheckRun', name: 'build', workflowName: 'CI', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-28T00:00:00Z' },
    { __typename: 'CheckRun', name: 'test', workflowName: 'CI', status: 'IN_PROGRESS', conclusion: '', startedAt: '2026-10-28T00:00:01Z' },
  ],
});
const OPEN_PR: PrInfo = { n: 123, state: 'open', ci: 'running', review: 'approved', conflict: false };

const payload = (cwd: string): string => JSON.stringify({ model: { display_name: 'Opus 5.5' }, workspace: { current_dir: cwd }, cost: { total_lines_added: 0, total_lines_removed: 0 } });

/** A HUD render in process, in colour, at `now`: the hotbar line's readout from ⎇ on (ANSI-stripped) and the PR spawns it queued. */
function draw(w: World, now = NOW, cfg: Config = HUD_PR, env: Record<string, string> = {}): { r: RenderResult; tail: string; queued: string[][] } {
  const r = renderPayload(payload(w.repo), { env: { ...w.env, FORCE_COLOR: '3', ...env }, config: cfg, now });
  const lines = stripAnsi(r.text).replace(/\u00a0/g, ' ').split('\n'), l4 = r.hud ? lines[lines.length - 2]! : lines[0]!;
  return { r, tail: l4.includes('⎇') ? l4.slice(l4.lastIndexOf('⎇')) : l4, queued: r.spawns.filter((s) => s[1] === 'pr') };
}

const refresh = (w: World, now = NOW, timeoutMs?: number, env: Record<string, string> = {}): ReturnType<typeof refreshPr> =>
  refreshPr(w.repo, BRANCH, { ...w.env, ...env }, w.cache, () => now, timeoutMs);

test('through dist: `refresh pr <root> <branch>` runs gh once in the repo\'s root, with no prompts and no update checks, and writes the branch\'s entry', () => {
  const w = world();
  try {
    w.stub({ stdout: OPEN });
    const r = spawnSync(process.execPath, [DIST, 'refresh', 'pr', w.repo, BRANCH], { env: w.env, windowsHide: true, timeout: 30000, encoding: 'utf8' });
    assert.deepEqual([r.status, r.stderr], [0, '']);
    const runs = w.runs();
    assert.equal(runs.length, 1);
    assert.deepEqual(runs[0]!.argv, [...PR_ARGS]);
    assert.equal(normRoot(runs[0]!.cwd), normRoot(w.repo), 'gh runs in the root, so it finds the branch\'s PR as gh pr view does');
    assert.deepEqual(runs[0]!.env, ['1', '1', '1', '1', '1', '0']);
    assert.deepEqual(readPrEntry(w.cache, w.repo, BRANCH), { v: 1, root: normRoot(w.repo), branch: BRANCH, at: NOW, prAt: NOW, pr: OPEN_PR, why: 'ok' });
    assert.equal(existsSync(prLockPath(w.cache, w.repo, BRANCH)), false, 'the lock is gone');
    // a refresh with a missing argument does nothing
    const bare = spawnSync(process.execPath, [DIST, 'refresh', 'pr', w.repo], { env: w.env, windowsHide: true, timeout: 30000, encoding: 'utf8' });
    assert.deepEqual([bare.status, bare.stderr, w.runs().length], [0, '', 1]);
  } finally {
    w.cleanup();
  }
});

test('the render draws the cached PR after the branch; fresh, nothing is queued; stale, it is queued and still drawn; an hour on, it is not drawn', async () => {
  const w = world();
  try {
    let d = draw(w);
    assert.deepEqual([d.tail, d.queued, d.r.hud!.pr], ['⎇ feature/x', [['refresh', 'pr', w.repo, BRANCH]], null], 'no answer yet: asked');
    w.stub({ stdout: OPEN });
    await refresh(w);
    for (const [at, queued] of [[NOW, false], [NOW + 59, false], [NOW + 60, true], [NOW + 3599, true]] as const) {
      d = draw(w, at);
      assert.equal(d.tail, '⎇ feature/x  #123 ●✓', `at +${at - NOW}`);
      assert.deepEqual(d.r.hud!.pr, OPEN_PR);
      assert.deepEqual(d.queued, queued ? [['refresh', 'pr', w.repo, BRANCH]] : [], `at +${at - NOW}`);
    }
    d = draw(w, NOW + 3600);
    assert.deepEqual([d.tail, d.r.hud!.pr, d.queued.length], ['⎇ feature/x', null, 1], 'confirmed an hour ago: too old to draw');
    // a refresher already at work (its lock is live): nothing more is queued
    mkdirSync(join(w.cache, 'pr'), { recursive: true });
    writeFileSync(prLockPath(w.cache, w.repo, BRANCH), '');
    assert.deepEqual(draw(w, NOW + 60).queued, []);
    // the render itself starts no process: one refresh, one gh run
    assert.equal(w.runs().length, 1);
  } finally {
    w.cleanup();
  }
});

test('no PR, not logged in, no gh, no GitHub remote seen by gh: nothing drawn; gh missing or not logged in is asked again after 10 minutes, not 60 s', async () => {
  const w = world();
  try {
    w.stub({ stderr: 'no pull requests found for branch "feature/x"\n', code: 1 });
    assert.deepEqual((await refresh(w))!.why, 'none');
    let d = draw(w, NOW + 30);
    assert.deepEqual([d.tail, d.queued], ['⎇ feature/x', []]);
    assert.equal(draw(w, NOW + 60).queued.length, 1, 'no PR: asked again after 60 s');
    w.stub({ stderr: 'To get started with GitHub CLI, please run:  gh auth login\n', code: 4 });
    assert.deepEqual((await refresh(w))!.why, 'auth');
    d = draw(w, NOW + 599);
    assert.deepEqual([d.tail, d.queued], ['⎇ feature/x', []]);
    assert.equal(draw(w, NOW + 600).queued.length, 1);
    w.stub({ stderr: 'none of the git remotes configured for this repository point to a known GitHub host.\n', code: 1 });
    assert.deepEqual((await refresh(w))!.why, 'no-github');
    assert.deepEqual(draw(w, NOW + 599).queued, []);
    // no gh: HUNGERBAR_GH unset and none on PATH (an empty folder); the stub never runs
    const runs = w.runs().length;
    const e = await refresh(w, NOW, undefined, { HUNGERBAR_GH: '' });
    assert.deepEqual([e!.why, e!.pr, w.runs().length], ['no-gh', null, runs]);
    assert.deepEqual(draw(w, NOW + 599).queued, []);
  } finally {
    w.cleanup();
  }
});

test('a passing trouble (an error, a timeout, JSON over 4 MiB) keeps the last PR and when it was confirmed; a definite answer replaces it', async () => {
  const w = world();
  try {
    w.stub({ stdout: OPEN });
    await refresh(w, NOW);
    w.stub({ stderr: 'error connecting to api.github.com\n', code: 1 });
    assert.deepEqual(await refresh(w, NOW + 100), { v: 1, root: normRoot(w.repo), branch: BRANCH, at: NOW + 100, prAt: NOW, pr: OPEN_PR, why: 'error' });
    assert.equal(draw(w, NOW + 120).tail, '⎇ feature/x  #123 ●✓', 'still drawn while the network is down');
    w.stub({ big: 5 << 20 });
    assert.deepEqual(await refresh(w, NOW + 200), { v: 1, root: normRoot(w.repo), branch: BRANCH, at: NOW + 200, prAt: NOW, pr: OPEN_PR, why: 'parse' });
    w.stub({ stdout: '{"number": 123, "state": "OPEN", ' });
    assert.equal((await refresh(w, NOW + 250))!.why, 'parse');
    w.stub({ stderr: 'no pull requests found for branch "feature/x"\n', code: 1 });
    assert.deepEqual(await refresh(w, NOW + 300), { v: 1, root: normRoot(w.repo), branch: BRANCH, at: NOW + 300, prAt: NOW + 300, pr: null, why: 'none' });
    // a trouble with no PR before it: none to keep
    w.stub({ code: 1 });
    assert.deepEqual(await refresh(w, NOW + 400), { v: 1, root: normRoot(w.repo), branch: BRANCH, at: NOW + 400, prAt: NOW + 300, pr: null, why: 'error' });
  } finally {
    w.cleanup();
  }
});

test('a gh that hangs is killed at the timeout and written as a timeout', async () => {
  const w = world();
  try {
    w.stub({ stdout: OPEN });
    await refresh(w, NOW);
    w.stub({ stdout: OPEN, sleepMs: 60000 });
    const t = Date.now();
    const e = await refresh(w, NOW + 100, 500);
    assert.ok(Date.now() - t < 30000, `returned after ${Date.now() - t} ms`);
    assert.deepEqual([e!.why, e!.pr, e!.prAt], ['timeout', OPEN_PR, NOW]);
    const pid = w.runs().at(-1)!.pid;
    const alive = (): boolean => { try { process.kill(pid, 0); return true; } catch { return false; } };
    for (const until = Date.now() + 5000; alive() && Date.now() < until;) { /* taskkill /T /F has returned; the exit is on its way */ }
    assert.equal(alive(), false, 'the stub was killed');
  } finally {
    w.cleanup();
  }
});

test('nothing is asked or written: non-essential traffic off, HEAD on another branch, a checkout while gh runs, no GitHub remote, a detached HEAD', async () => {
  const w = world();
  try {
    w.stub({ stdout: OPEN });
    for (const env of [{ CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }, { HUNGERBAR_OFFLINE: '1' }]) {
      assert.equal(await refresh(w, NOW, undefined, env), null);
      assert.equal(existsSync(prPath(w.cache, w.repo, BRANCH)), false);
      const d = draw(w, NOW, HUD_PR, env);
      assert.deepEqual([d.tail, d.queued], ['⎇ feature/x', []]);
    }
    assert.equal(w.runs().length, 0);
    // a cached PR is not drawn with the traffic off either
    await refresh(w);
    assert.deepEqual([draw(w).tail, draw(w, NOW, HUD_PR, { HUNGERBAR_OFFLINE: '1' }).tail], ['⎇ feature/x  #123 ●✓', '⎇ feature/x']);
    rmSync(join(w.cache, 'pr'), { recursive: true, force: true });
    // asked for feature/x, but HEAD is on main now: the render will ask for main
    w.head('ref: refs/heads/main\n');
    assert.equal(await refresh(w), null);
    assert.deepEqual(draw(w).queued, [['refresh', 'pr', w.repo, 'main']]);
    // a checkout while gh runs: its answer may be for either branch, so it is dropped
    w.head(`ref: refs/heads/${BRANCH}\n`);
    w.stub({ stdout: OPEN, checkout: 'ref: refs/heads/main\n' });
    const runs = w.runs().length;
    assert.equal(await refresh(w), null);
    assert.equal(w.runs().length, runs + 1);
    assert.equal(existsSync(prPath(w.cache, w.repo, BRANCH)) || existsSync(prPath(w.cache, w.repo, 'main')), false);
    // a detached HEAD: no PR, nothing queued
    w.head('a'.repeat(40) + '\n');
    let d = draw(w);
    assert.deepEqual([d.r.hud!.pr, d.queued], [null, []]);
    // HEAD on a ref that is not a local branch: gh could not find its PR, so nothing is asked
    w.head('ref: refs/remotes/origin/main\n');
    d = draw(w);
    assert.deepEqual([d.r.hud!.pr, d.queued], [null, []]);
    assert.equal(await refreshPr(w.repo, 'remotes/origin/main', w.env, w.cache, () => NOW), null);
    w.head(`ref: refs/heads/${BRANCH}\n`);
  } finally {
    w.cleanup();
  }
  // a repo whose remotes are not on GitHub: the render never queues, the refresher never runs gh
  const g = world('[remote "origin"]\n\turl = https://gitlab.com/steve/x.git\n');
  try {
    g.stub({ stdout: OPEN });
    assert.deepEqual(draw(g).queued, []);
    assert.equal(await refresh(g), null);
    assert.equal(g.runs().length, 0);
  } finally {
    g.cleanup();
  }
});

test('hud.pr off (the default) and classic read no PR and queue nothing; the HUD with no PR is the git state\'s line', async () => {
  const w = world();
  try {
    w.stub({ stdout: OPEN });
    await refresh(w);
    const off = draw(w, NOW, HUD);
    assert.deepEqual([off.tail, off.r.hud!.pr, off.queued], ['⎇ feature/x', null, []]);
    const classic = draw(w, NOW, { ...HUD_PR, look: 'classic' });
    assert.equal(classic.r.hud, undefined);
    assert.deepEqual(classic.queued, []);
    assert.doesNotMatch(stripAnsi(classic.r.text), /#123/);
    // the same render with hud.pr on draws the badge, and with no entry the bytes are hud.pr off's
    assert.equal(draw(w, NOW, HUD_PR).tail, '⎇ feature/x  #123 ●✓');
    rmSync(join(w.cache, 'pr'), { recursive: true, force: true });
    assert.equal(draw(w, NOW, HUD_PR).r.text, draw(w, NOW, HUD).r.text);
  } finally {
    w.cleanup();
  }
});
