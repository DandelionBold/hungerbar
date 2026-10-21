// The HUD's git state (SPEC §0.9, 0.7.0) on real git repos in temp folders: the refresher's `git status
// --porcelain=v2 --branch` (asked for only by the HUD) and the git dir's files that say what is in progress, read in the
// render with no process, drawn on the hotbar line. Each repo is made by git itself: untracked files, a merge and a
// cherry-pick stopped on a conflict, a rebase stopped at its first step (rebase-merge and rebase-apply), a branch ahead
// of and behind a local bare remote, and a detached HEAD. git runs with an empty global config, so the machine's own
// settings change nothing here.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Config } from '../src/config.ts';
import { findGit } from '../src/git/bin.ts';
import { gitStateNote } from '../src/cli/look.ts';
import { readEntry } from '../src/git/cache.ts';
import { findRepo } from '../src/git/head.ts';
import { readOp } from '../src/git/status.ts';
import { NO_MARKS, type GitMarks } from '../src/hud/gitstate.ts';
import { renderPayload, type RenderResult } from '../src/render.ts';
import { DIST, stripAnsi } from './harness.ts';
import { plainDefaults } from './plain-config.ts';

const GIT = findGit(process.env.PATH ?? '');
const HUD: Config = { ...plainDefaults(), look: 'hud' };

interface World { dir: string; repo: string; cache: string; env: Record<string, string>; git(cwd: string, ...args: string[]): string; cleanup(): void }

function world(): World {
  const dir = mkdtempSync(join(tmpdir(), 'hb-gitstate-'));
  const repo = join(dir, 'repo'), cache = join(dir, 'cache'), cfg = join(dir, 'gitconfig');
  writeFileSync(cfg, '');
  mkdirSync(repo);
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? 'C:\\Windows', TEMP: tmpdir(), TMP: tmpdir(),
    HUNGERBAR_CACHE_DIR: cache, CLAUDE_CONFIG_DIR: join(dir, 'claude'), HUNGERBAR_NO_SPAWN: '1',
    GIT_CONFIG_GLOBAL: cfg, GIT_CONFIG_NOSYSTEM: '1',
  };
  const git = (cwd: string, ...args: string[]): string => execFileSync(GIT!, [
    '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', '-c', 'init.defaultBranch=main', ...args,
  ], { cwd, encoding: 'utf8', windowsHide: true, env: { ...env, GIT_EDITOR: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] });
  git(repo, 'init', '-q', '-b', 'main');
  return { dir, repo, cache, env, git, cleanup: () => rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }) };
}

/** git that is expected to stop (a conflict exits 1): its failure is the point. */
function stops(w: World, cwd: string, ...args: string[]): void {
  assert.throws(() => w.git(cwd, ...args), `git ${args.join(' ')} stops`);
}

const write = (w: World, name: string, text: string): void => {
  mkdirSync(join(w.repo, name, '..'), { recursive: true });
  writeFileSync(join(w.repo, name), text);
};

/** The refresher as the HUD's render queues it: `refresh git <root> <edits> status`. */
function refresh(w: World, cwd = w.repo): void {
  const r = spawnSync(process.execPath, [DIST, 'refresh', 'git', cwd, '/', 'status'], { env: w.env, windowsHide: true, timeout: 20000 });
  assert.equal(r.status, 0, String(r.stderr));
}

const payload = (cwd: string): string => JSON.stringify({ model: { display_name: 'Opus 5.5' }, workspace: { current_dir: cwd }, cost: { total_lines_added: 0, total_lines_removed: 0 } });

/** A HUD render in-process, in colour: its marks and the hotbar line's readout from ⎇ on (ANSI-stripped). */
function hud(w: World, cwd = w.repo): { r: RenderResult; git: GitMarks; tail: string } {
  const r = renderPayload(payload(cwd), { env: { ...w.env, FORCE_COLOR: '3' }, config: HUD });
  assert.ok(r.hud, 'the HUD drew');
  const lines = stripAnsi(r.text).replace(/\u00a0/g, ' ').split('\n'), l4 = lines[lines.length - 2]!;
  return { r, git: r.hud.git, tail: l4.slice(l4.lastIndexOf('⎇')) };
}
/** The SGR before the readout's ⎇, and before the text that follows `⎇ `: their colours. */
function colours(r: RenderResult): { mark: string; name: string } {
  const l4 = r.text.split('\n').at(-2)!;
  const m = /\x1b\[([\d;]+)m⎇\u00a0\x1b\[0m\x1b\[([\d;]+)m/.exec(l4);
  assert.ok(m, l4);
  return { mark: m[1]!, name: m[2]! };
}
const GREEN = '38;2;85;255;85', YELLOW = '38;2;255;255;85', AQUA = '38;2;85;255;255', RED = '38;2;255;85;85', PURPLE = '38;2;255;85;255',
  GOLD = '38;2;255;170;0', GREY = '38;2;170;170;170', WHITE = '38;2;255;255;255';

/** main with a.txt in three commits, and side (from the first) changing a.txt the other way: a conflict either way. */
function forked(w: World): void {
  write(w, 'a.txt', 'a\n');
  w.git(w.repo, 'add', '.');
  w.git(w.repo, 'commit', '-qm', 'one');
  write(w, 'a.txt', 'a\nb\n');
  w.git(w.repo, 'commit', '-qam', 'two');
  w.git(w.repo, 'checkout', '-q', '-b', 'side', 'HEAD~1');
  write(w, 'a.txt', 'side\n');
  write(w, 'b.txt', 's\n');
  w.git(w.repo, 'add', '.');
  w.git(w.repo, 'commit', '-qm', 'side one');
  write(w, 'b.txt', 's\nt\n');
  w.git(w.repo, 'commit', '-qam', 'side two');
  w.git(w.repo, 'checkout', '-q', 'main');
}

test('the HUD asks the refresher for the status; classic does not, and an entry without it is stale for the HUD', { skip: !GIT }, () => {
  const w = world();
  try {
    write(w, 'a.txt', 'x\n');
    w.git(w.repo, 'add', '.');
    w.git(w.repo, 'commit', '-qm', 'one');
    const classic = renderPayload(payload(w.repo), { env: { ...w.env, FORCE_COLOR: '3' }, config: plainDefaults() });
    assert.deepEqual(classic.spawns, [['refresh', 'git', w.repo, '0/0']], 'classic: the diff only, as in 0.6.0');
    assert.deepEqual(hud(w).r.spawns, [['refresh', 'git', w.repo, '0/0', 'status']], 'the HUD: the diff and the status');
    // classic's refresher writes no st; the HUD then still asks, and shows what it knows meanwhile (⎇ grey)
    const r = spawnSync(process.execPath, [DIST, 'refresh', 'git', w.repo, '0/0'], { env: w.env, windowsHide: true, timeout: 20000 });
    assert.equal(r.status, 0);
    assert.equal('st' in readEntry(w.cache, w.repo)!, false);
    assert.deepEqual(renderPayload(payload(w.repo), { env: { ...w.env, FORCE_COLOR: '3' }, config: plainDefaults() }).spawns, [], 'fresh for classic');
    const before = hud(w);
    assert.deepEqual(before.r.spawns, [['refresh', 'git', w.repo, '0/0', 'status']]);
    assert.deepEqual(before.git, NO_MARKS);
    assert.equal(colours(before.r).mark, GREY);
    spawnSync(process.execPath, [DIST, 'refresh', 'git', w.repo, '0/0', 'status'], { env: w.env, windowsHide: true, timeout: 20000 });
    assert.deepEqual(readEntry(w.cache, w.repo)!.st, { changed: 0, untracked: 0, conflicts: 0, ahead: null, behind: null });
    const after = hud(w);
    assert.deepEqual(after.r.spawns, [], 'fresh for the HUD too');
    assert.equal(after.tail, '⎇ main');
    assert.deepEqual(colours(after.r), { mark: GREEN, name: WHITE });
  } finally {
    w.cleanup();
  }
});

test('untracked files only: ⎇ aqua and ?N, a new folder counting once as git status lists it', { skip: !GIT }, () => {
  const w = world();
  try {
    write(w, 'a.txt', 'x\n');
    w.git(w.repo, 'add', '.');
    w.git(w.repo, 'commit', '-qm', 'one');
    write(w, 'n1.txt', '1\n');
    write(w, 'n2.txt', '2\n');
    write(w, 'dir/x.txt', 'x\n');
    write(w, 'dir/y.txt', 'y\n');
    refresh(w);
    assert.deepEqual(readEntry(w.cache, w.repo)!.st, { changed: 0, untracked: 3, conflicts: 0, ahead: null, behind: null });
    const h = hud(w);
    assert.equal(h.tail, '⎇ main ?3');
    assert.deepEqual(colours(h.r), { mark: AQUA, name: WHITE });
    // a change to a tracked file and a staged new one: yellow
    write(w, 'a.txt', 'y\n');
    w.git(w.repo, 'add', 'n1.txt');
    refresh(w);
    assert.deepEqual(readEntry(w.cache, w.repo)!.st, { changed: 2, untracked: 2, conflicts: 0, ahead: null, behind: null });
    assert.equal(colours(hud(w).r).mark, YELLOW);
  } finally {
    w.cleanup();
  }
});

test('a merge stopped on a conflict: ⎇ red, the branch purple, merge !1 (MERGE_HEAD, read in the render)', { skip: !GIT }, () => {
  const w = world();
  try {
    forked(w);
    stops(w, w.repo, 'merge', 'side');
    assert.deepEqual(readOp(join(w.repo, '.git')), { kind: 'merge', step: null, total: null, head: null });
    refresh(w);
    assert.deepEqual(readEntry(w.cache, w.repo)!.st, { changed: 1, untracked: 0, conflicts: 1, ahead: null, behind: null });
    const h = hud(w);
    assert.equal(h.tail, '⎇ main merge !1');
    assert.deepEqual(colours(h.r), { mark: RED, name: PURPLE });
    // the merge is gone the moment it is aborted: the render reads the git dir, the status waits for the refresher
    w.git(w.repo, 'merge', '--abort');
    const gone = hud(w);
    assert.equal(gone.git.op, null);
    assert.ok(gone.r.spawns.length === 1, 'HEAD and the index moved: a refresh is queued');
    refresh(w);
    assert.equal(hud(w).tail, '⎇ main');
  } finally {
    w.cleanup();
  }
});

test('a cherry-pick stopped on a conflict: pick !1 (CHERRY_PICK_HEAD)', { skip: !GIT }, () => {
  const w = world();
  try {
    forked(w);
    stops(w, w.repo, 'cherry-pick', 'side~1');
    refresh(w);
    const h = hud(w);
    assert.deepEqual(h.git.op, { kind: 'pick', step: null, total: null });
    assert.equal(h.tail, '⎇ main pick !1');
    assert.deepEqual(colours(h.r), { mark: RED, name: PURPLE });
  } finally {
    w.cleanup();
  }
});

test('a rebase stopped at step 1 of 2: HEAD is detached, the branch being rebased is drawn, rebase 1/2 (merge and apply backends)', { skip: !GIT }, () => {
  for (const backend of ['--merge', '--apply']) {
    const w = world();
    try {
      forked(w);
      w.git(w.repo, 'checkout', '-q', 'side');
      stops(w, w.repo, 'rebase', backend, 'main');
      const repo = findRepo(w.repo)!;
      assert.equal(repo.detached, true, `${backend}: git detaches HEAD while it rebases`);
      assert.deepEqual(readOp(repo.gitDir), { kind: 'rebase', step: 1, total: 2, head: 'side' }, backend);
      refresh(w);
      const h = hud(w);
      assert.equal(h.r.hud!.input.branch, repo.branch, `${backend}: the engine is handed the sha, as classic shows it`);
      assert.deepEqual({ ...h.git, files: null }, { files: null, ahead: 0, behind: 0, op: { kind: 'rebase', step: 1, total: 2 }, detached: null, name: 'side' }, backend);
      assert.equal(h.git.files?.conflicts, 1, backend);
      assert.equal(h.tail, '⎇ side rebase 1/2 !1', backend);
      assert.deepEqual(colours(h.r), { mark: RED, name: PURPLE });
      w.git(w.repo, 'rebase', '--abort');
      assert.equal(readOp(repo.gitDir), null);
    } finally {
      w.cleanup();
    }
  }
});

test('ahead of and behind a local bare remote: the branch gold, ↑2↓1; no upstream, no arrows', { skip: !GIT }, () => {
  const w = world();
  try {
    const bare = join(w.dir, 'remote.git'), other = join(w.dir, 'other');
    w.git(w.dir, 'init', '-q', '--bare', '-b', 'main', bare);
    write(w, 'a.txt', 'a\n');
    w.git(w.repo, 'add', '.');
    w.git(w.repo, 'commit', '-qm', 'one');
    refresh(w);
    assert.deepEqual(readEntry(w.cache, w.repo)!.st, { changed: 0, untracked: 0, conflicts: 0, ahead: null, behind: null }, 'no upstream yet');
    w.git(w.repo, 'remote', 'add', 'origin', bare);
    w.git(w.repo, 'push', '-q', '-u', 'origin', 'main');
    w.git(w.dir, 'clone', '-q', bare, other);
    writeFileSync(join(other, 'o.txt'), 'o\n');
    w.git(other, 'add', '.');
    w.git(other, 'commit', '-qm', 'theirs');
    w.git(other, 'push', '-q', 'origin', 'main');
    for (const n of ['two', 'three']) {
      write(w, n + '.txt', n);
      w.git(w.repo, 'add', '.');
      w.git(w.repo, 'commit', '-qm', n);
    }
    w.git(w.repo, 'fetch', '-q', 'origin');
    refresh(w);
    assert.deepEqual(readEntry(w.cache, w.repo)!.st, { changed: 0, untracked: 0, conflicts: 0, ahead: 2, behind: 1 });
    const h = hud(w);
    assert.equal(h.tail, '⎇ main ↑2↓1');
    assert.deepEqual(colours(h.r), { mark: GREEN, name: GOLD });
    // level with the upstream: no arrows, white again
    w.git(w.repo, 'pull', '-q', '--rebase', 'origin', 'main');
    w.git(w.repo, 'push', '-q', 'origin', 'main');
    refresh(w);
    assert.equal(hud(w).tail, '⎇ main');
    assert.equal(colours(hud(w).r).name, WHITE);
  } finally {
    w.cleanup();
  }
});

test('a detached HEAD: @ and the short sha in grey; ⎇ still the working tree', { skip: !GIT }, () => {
  const w = world();
  try {
    write(w, 'a.txt', 'a\n');
    w.git(w.repo, 'add', '.');
    w.git(w.repo, 'commit', '-qm', 'one');
    write(w, 'a.txt', 'b\n');
    w.git(w.repo, 'commit', '-qam', 'two');
    w.git(w.repo, 'checkout', '-q', '--detach', 'HEAD~1');
    const sha = w.git(w.repo, 'rev-parse', '--short=7', 'HEAD').trim();
    refresh(w);
    const h = hud(w);
    assert.equal(h.git.detached, sha);
    assert.equal(h.tail, `⎇ @${sha}`);
    assert.deepEqual(colours(h.r), { mark: GREEN, name: GREY });
    // Claude Code naming the worktree's branch wins, as in classic
    const named = renderPayload(JSON.stringify({ ...JSON.parse(payload(w.repo)), worktree: { name: 'x', branch: 'feature/wt' } }), { env: { ...w.env, FORCE_COLOR: '3' }, config: HUD });
    assert.equal(named.hud!.git.detached, null);
    assert.match(stripAnsi(named.text).replace(/\u00a0/g, ' '), /⎇ feature\/wt$/m);
  } finally {
    w.cleanup();
  }
});

test('a slow status is killed at git.timeoutMs and written as st: null; the diff still lands', { skip: !GIT }, () => {
  const w = world();
  try {
    write(w, 'a.txt', 'a\n');
    w.git(w.repo, 'add', '.');
    w.git(w.repo, 'commit', '-qm', 'one');
    // a fake git that answers the diff at once and sleeps on the status
    const fake = join(w.dir, 'fake-git.mjs');
    writeFileSync(fake, `if (process.argv.includes('status')) setTimeout(() => process.stdout.write('1 .M x\\n'), 5000);\nelse process.stdout.write(' 1 file changed, 2 insertions(+)\\n');\n`);
    mkdirSync(join(w.dir, 'claude'), { recursive: true });
    writeFileSync(join(w.dir, 'claude', 'hungerbar.json'), JSON.stringify({ git: { timeoutMs: 500 } }));
    const t = Date.now();
    const r = spawnSync(process.execPath, [DIST, 'refresh', 'git', w.repo, '/', 'status'], { env: { ...w.env, HUNGERBAR_GIT_BIN: fake }, windowsHide: true, timeout: 20000 });
    assert.equal(r.status, 0);
    assert.ok(Date.now() - t < 4500, `returned after ${Date.now() - t} ms`);
    const e = readEntry(w.cache, w.repo)!;
    assert.deepEqual([e.added, e.st], [2, null]);
    assert.deepEqual(hud(w).git, NO_MARKS, 'nothing known: ⎇ grey');
  } finally {
    w.cleanup();
  }
});

test('git.mode sync runs the status inline for the HUD; off reads only the git dir', { skip: !GIT }, () => {
  const w = world();
  try {
    forked(w);
    stops(w, w.repo, 'merge', 'side');
    const sync = renderPayload(payload(w.repo), { env: { ...w.env, FORCE_COLOR: '3' }, config: { ...HUD, git: { ...HUD.git, mode: 'sync' } } });
    assert.deepEqual(sync.spawns, []);
    assert.deepEqual(sync.hud!.git.files, { changed: 1, untracked: 0, conflicts: 1 });
    assert.deepEqual(readEntry(w.cache, w.repo)!.st, { changed: 1, untracked: 0, conflicts: 1, ahead: null, behind: null });
    rmSync(join(w.cache, 'git'), { recursive: true, force: true });
    const off = renderPayload(payload(w.repo), { env: { ...w.env, FORCE_COLOR: '3' }, config: { ...HUD, git: { ...HUD.git, mode: 'off' } } });
    assert.deepEqual(off.spawns, []);
    assert.deepEqual(off.hud!.git, { ...NO_MARKS, op: { kind: 'merge', step: null, total: null } });
    // what doctor and look say about git.mode off matches what the HUD draws: no counts, but the in-progress word and @sha
    const note = gitStateNote({ ...HUD, git: { ...HUD.git, mode: 'off' } });
    assert.match(note, /^git\.mode off: no git status, so ⎇ stays grey with no counts or arrows; /);
    assert.match(note, /a merge, rebase or cherry-pick in progress and a detached HEAD still show/);
    assert.doesNotMatch(note, /no git state/);
    assert.match(stripAnsi(off.text).replace(/\u00a0/g, ' '), /⎇ main merge$/m);
    // a detached HEAD shows with git.mode off too (head.ts reads it from .git): grey @sha after a grey ⎇, no counts
    w.git(w.repo, 'merge', '--abort');
    w.git(w.repo, 'checkout', '-q', '--detach', 'HEAD~1');
    const sha = w.git(w.repo, 'rev-parse', '--short=7', 'HEAD').trim();
    const det = renderPayload(payload(w.repo), { env: { ...w.env, FORCE_COLOR: '3' }, config: { ...HUD, git: { ...HUD.git, mode: 'off' } } });
    assert.deepEqual(det.spawns, []);
    assert.deepEqual(det.hud!.git, { ...NO_MARKS, detached: sha });
    const detLines = stripAnsi(det.text).replace(/ /g, ' ').split('\n');
    assert.ok(detLines.some((l) => l.trimEnd().endsWith(`⎇ @${sha}`)), det.text);
  } finally {
    w.cleanup();
  }
});
