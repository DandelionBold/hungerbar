// Real git repos in temp folders (SPEC §16.4, §16.5).
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';
import { findGit } from '../src/git/bin.ts';
import { entryPath, lockPath, readEntry } from '../src/git/cache.ts';
import { findRepo, isUnborn } from '../src/git/head.ts';
import { renderPayload } from '../src/render.ts';
import { tryLock, unlock } from '../src/store.ts';
import { DIST, ROOT, runDist } from './harness.ts';

const GIT = findGit(process.env.PATH ?? '');
const FAKE = join(ROOT, 'bench', 'fake-git.mjs');

function git(cwd: string, ...args: string[]): string {
  return execFileSync(GIT!, ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd, encoding: 'utf8', windowsHide: true });
}

function world(): { dir: string; repo: string; cache: string; env: Record<string, string>; cleanup(): void } {
  const dir = mkdtempSync(join(tmpdir(), 'hb-git-'));
  const repo = join(dir, 'repo'), cache = join(dir, 'cache');
  mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  // the classic lines, which these tests read (the HUD is the default since SPEC §0.10)
  mkdirSync(join(dir, 'claude'));
  writeFileSync(join(dir, 'claude', 'hungerbar.json'), JSON.stringify({ look: 'classic' }));
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? 'C:\\Windows', TEMP: tmpdir(), TMP: tmpdir(),
    HUNGERBAR_CACHE_DIR: cache, CLAUDE_CONFIG_DIR: join(dir, 'claude'), NO_COLOR: '1',
  };
  return { dir, repo, cache, env, cleanup: () => rmRetry(dir) };
}

/** Removes `dir`, retrying while a detached refresher (or its git) still holds it. rmSync's own maxRetries does not
 * cover this on Windows in Node 24: a folder that is still some process's cwd fails with EPERM at once. */
function rmRetry(dir: string, ms = 20000): void {
  const end = Date.now() + ms;
  for (;;) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code ?? '';
      if (!['EPERM', 'EBUSY', 'ENOTEMPTY', 'EACCES'].includes(code) || Date.now() > end) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
    }
  }
}

const payload = (cwd: string, added = 1, removed = 0): string =>
  JSON.stringify({ model: { display_name: 'Opus 5.5' }, workspace: { current_dir: cwd }, cost: { total_lines_added: added, total_lines_removed: removed } });

async function waitFor(cond: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return cond();
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test('git binary: only absolute PATH entries; a git.exe planted in the repo never resolves', { skip: !GIT }, () => {
  const w = world();
  try {
    const planted = join(w.repo, process.platform === 'win32' ? 'git.exe' : 'git');
    writeFileSync(planted, 'planted');
    const path = ['.', '', 'relative/bin', w.repo.replace(/^[A-Za-z]:/, ''), process.env.PATH ?? ''].join(delimiter);
    const prev = process.cwd();
    process.chdir(w.repo);
    try {
      const found = findGit(path);
      assert.ok(found && found !== planted && !found.startsWith(w.repo), `resolved ${found}`);
    } finally {
      process.chdir(prev);
    }
  } finally {
    w.cleanup();
  }
});

test('refresher writes the diff; the next render shows it; a commit makes it stale', { skip: !GIT }, () => {
  const w = world();
  try {
    writeFileSync(join(w.repo, 'a.txt'), 'one\ntwo\nthree\n');
    git(w.repo, 'add', '.');
    git(w.repo, 'commit', '-q', '-m', 'first');
    writeFileSync(join(w.repo, 'a.txt'), 'one\nTWO\nthree\nfour\nfive\n');
    const r = spawnSync(process.execPath, [DIST, 'refresh', 'git', w.repo, '1/0'], { env: w.env, windowsHide: true, timeout: 15000 });
    assert.equal(r.status, 0);
    const e = readEntry(w.cache, w.repo);
    assert.ok(e, 'entry written');
    assert.deepEqual([e.added, e.removed, e.files, e.edits], [3, 1, 1, '1/0']);
    assert.equal(e.head, 'ref: refs/heads/main');
    const out = runDist(payload(w.repo), { ...w.env, HUNGERBAR_NO_SPAWN: '1' }).stdout.replace(/\u00a0/g, ' ');
    assert.match(out, /⎇ main │ \(\+3,-1\)/);
    git(w.repo, 'commit', '-q', '-am', 'second');
    const after = renderPayload(payload(w.repo), { env: w.env });
    assert.deepEqual(after.spawns, [['refresh', 'git', w.repo, '1/0']], 'HEAD moved: stale, refresh requested');
    assert.match(after.text.replace(/\u00a0/g, ' '), /\(\+3,-1\)/, 'the old numbers show until the refresh lands');
  } finally {
    w.cleanup();
  }
});

test('an unborn branch diffs the index (--cached)', { skip: !GIT }, () => {
  const w = world();
  try {
    writeFileSync(join(w.repo, 'new.txt'), 'a\nb\n');
    git(w.repo, 'add', '.');
    const repo = findRepo(w.repo)!;
    assert.equal(isUnborn(repo), true);
    spawnSync(process.execPath, [DIST, 'refresh', 'git', w.repo, '/'], { env: w.env, windowsHide: true, timeout: 15000 });
    assert.deepEqual([readEntry(w.cache, w.repo)?.added, readEntry(w.cache, w.repo)?.removed], [2, 0]);
    git(w.repo, 'commit', '-q', '-m', 'x');
    assert.equal(isUnborn(findRepo(w.repo)!), false);
    git(w.repo, 'pack-refs', '--all');
    assert.ok(!existsSync(join(w.repo, '.git', 'refs', 'heads', 'main')), 'ref now only in packed-refs');
    assert.equal(isUnborn(findRepo(w.repo)!), false);
  } finally {
    w.cleanup();
  }
});

test('stale-while-revalidate: the render spawns the refresher, the file lands, the next render is correct', { skip: !GIT }, async () => {
  const w = world();
  try {
    writeFileSync(join(w.repo, 'a.txt'), 'x\n');
    git(w.repo, 'add', '.');
    git(w.repo, 'commit', '-q', '-m', 'first');
    writeFileSync(join(w.repo, 'a.txt'), 'x\ny\n');
    const first = runDist(payload(w.repo), w.env);
    assert.doesNotMatch(first.stdout, /\(\+/, 'no numbers before the first refresh');
    assert.ok(await waitFor(() => existsSync(entryPath(w.cache, w.repo)), 8000), 'refresher wrote the entry');
    assert.ok(await waitFor(() => !existsSync(lockPath(w.cache, w.repo)), 5000), 'lock released');
    const second = runDist(payload(w.repo), w.env).stdout.replace(/\u00a0/g, ' ');
    assert.match(second, /\(\+1,-0\)/);
  } finally {
    w.cleanup();
  }
});

test('lock contention: a live lock blocks a second refresher; a stale one is taken over', { skip: !GIT }, () => {
  const w = world();
  try {
    const lock = lockPath(w.cache, w.repo);
    assert.equal(tryLock(lock, 10_000), true);
    assert.equal(tryLock(lock, 10_000), false, 'second taker refused');
    assert.deepEqual(renderPayload(payload(w.repo), { env: w.env }).spawns, [], 'no spawn while the lock is live');
    const old = (Date.now() - 60_000) / 1000;
    utimesSync(lock, old, old);
    assert.equal(tryLock(lock, 10_000), true, 'stale lock recovered');
    unlock(lock);
    assert.equal(existsSync(lock), false);
  } finally {
    w.cleanup();
  }
});

test('a slow git is killed with its whole tree at git.timeoutMs, and nothing is written', { skip: !GIT }, async () => {
  const w = world();
  try {
    mkdirSync(join(w.dir, 'claude'), { recursive: true });
    writeFileSync(join(w.dir, 'claude', 'hungerbar.json'), JSON.stringify({ look: 'classic', git: { timeoutMs: 500 } }));
    const pidfile = join(w.dir, 'pids.json');
    const t = Date.now();
    const r = spawnSync(process.execPath, [DIST, 'refresh', 'git', w.repo, '/'], {
      env: { ...w.env, HUNGERBAR_GIT_BIN: FAKE, FAKE_GIT_SLEEP_MS: '3000', FAKE_GIT_PIDFILE: pidfile }, windowsHide: true, timeout: 15000,
    });
    const took = Date.now() - t;
    assert.equal(r.status, 0);
    assert.ok(took < 2500, `refresher returned after ${took} ms`);
    assert.equal(existsSync(entryPath(w.cache, w.repo)), false);
    const pids = JSON.parse(readFileSync(pidfile, 'utf8')) as { self: number; child: number };
    assert.ok(await waitFor(() => !alive(pids.self) && !alive(pids.child), 3000), 'fake git and its child are gone');
  } finally {
    w.cleanup();
  }
});

test('non-blocking: a render that spawns a refresher stuck on a 3 s git costs no more than the spawn', { skip: !GIT }, async () => {
  const w = world();
  try {
    const env = { ...w.env, HUNGERBAR_GIT_BIN: FAKE, FAKE_GIT_SLEEP_MS: '3000' };
    const time = (e: Record<string, string>): number => {
      const t = performance.now();
      runDist(payload(w.repo), e);
      return performance.now() - t;
    };
    const median = (xs: number[]): number => xs.sort((a, b) => a - b)[xs.length >> 1]!;
    time({ ...env, HUNGERBAR_NO_SPAWN: '1' });
    const base = median([0, 1, 2, 3, 4].map(() => time({ ...env, HUNGERBAR_NO_SPAWN: '1' })));
    const spawning = median([0, 1, 2].map(() => {
      rmSync(lockPath(w.cache, w.repo), { force: true });
      return time(env);
    }));
    assert.ok(spawning < base + 100, `spawning render ${spawning.toFixed(0)} ms vs ${base.toFixed(0)} ms`);
    // Let the detached refreshers (killed at git.timeoutMs) leave the temp folder before it is removed.
    await new Promise((r) => setTimeout(r, 2500));
    await waitFor(() => !existsSync(lockPath(w.cache, w.repo)), 6000);
  } finally {
    w.cleanup();
  }
});

test('a German locale still parses (LC_ALL=C wins)', { skip: !GIT }, () => {
  const w = world();
  try {
    writeFileSync(join(w.repo, 'a.txt'), 'x\n');
    git(w.repo, 'add', '.');
    git(w.repo, 'commit', '-q', '-m', 'first');
    writeFileSync(join(w.repo, 'a.txt'), 'y\n');
    spawnSync(process.execPath, [DIST, 'refresh', 'git', w.repo, '/'], {
      env: { ...w.env, LANG: 'de_DE.UTF-8', LC_ALL: 'de_DE.UTF-8', LANGUAGE: 'de' }, windowsHide: true, timeout: 15000,
    });
    const e = readEntry(w.cache, w.repo);
    assert.deepEqual([e?.added, e?.removed], [1, 1]);
  } finally {
    w.cleanup();
  }
});

test('a worktree made by git itself: branch from its HEAD, refs from the common dir', { skip: !GIT }, () => {
  const w = world();
  try {
    writeFileSync(join(w.repo, 'a.txt'), 'x\n');
    git(w.repo, 'add', '.');
    git(w.repo, 'commit', '-q', '-m', 'first');
    const wt = join(w.dir, 'wt');
    git(w.repo, 'worktree', 'add', '-q', '-b', 'feature/wt', wt);
    const r = findRepo(join(wt))!;
    assert.equal(r.branch, 'feature/wt');
    assert.equal(isUnborn(r), false);
    copyFileSync(join(w.repo, 'a.txt'), join(wt, 'b.txt'));
  } finally {
    w.cleanup();
  }
});
