// The HUD's git-terrain history (plan §6, §10.4): src/hud/history.ts against the vendored history cache
// (test/reference/hud4-cache.mjs cacheStep), against the session4 time-lapse, against real git, and its write policy.
// Every deliberate deviation from cacheStep is its own case and asserts both answers.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { defaults } from '../src/config.ts';
import { findGit } from '../src/git/bin.ts';
import { gitKey, normRoot } from '../src/git/cache.ts';
import { findRepo, type Repo } from '../src/git/head.ts';
import {
  commitSeen, diskHistory, fileLog, histPath, histSid, parseLine, parseLines, stepHistory, TAIL_MAX, validWindow, WINDOW_MAX,
  type HistFile, type LogSource, type StepOut,
} from '../src/hud/history.ts';
import { fromState, readHist, type Bucket, type Hist } from '../src/hud/input.ts';
import { diskSources } from '../src/render.ts';
import { fnv1a, pruneOld } from '../src/store.ts';
import { ROOT } from './harness.ts';
import { loadCache, plain, SESSION, type CacheEntry, type CacheGit } from './hud/ref.ts';

const ZERO = '0'.repeat(40);
const sha = (s: string): string => createHash('sha1').update(s).digest('hex');
const h = (k: number | string): string => sha('h' + k);
/** One logs/HEAD line as git writes it (no tab when there is no subject). */
const line = (old: string, nu: string, subject: string | null, time = 1792859400): string =>
  `${old} ${nu} t <t@t> ${time} +0300${subject === null ? '' : '\t' + subject}\n`;
const L0 = line(ZERO, h(0), 'commit (initial): base');

/** An in-memory logs/HEAD that counts what is read. */
function memLog(text: string | Buffer): LogSource & { bytes: number; reads: number } {
  const buf = Buffer.isBuffer(text) ? text : Buffer.from(text, 'utf8');
  const src = {
    size: buf.length, bytes: 0, reads: 0,
    read(from: number, to: number): Buffer {
      src.reads++;
      const b = Buffer.from(buf.subarray(from, Math.min(to, buf.length)));
      src.bytes += b.length;
      return b;
    },
  };
  return src;
}

const R = 'd:/code/repo';
const Q = 1792859400;                        // a quarter-hour boundary (1992066 × 900)
const step = (saved: unknown, now: number, log: string | LogSource, branch = 'main', add = 10, del = 2): StepOut =>
  stepHistory(saved, { now, root: R, branch, add, del }, typeof log === 'string' ? memLog(log) : log);
/** A file as it would be read back from disk. */
const disk = (r: StepOut): HistFile => JSON.parse(JSON.stringify(r.next)) as HistFile;
const goldOf = (hist: Hist | { buckets: unknown[][] } | null): boolean => hist?.buckets.at(-1)?.[4] === 1;

/** Commit lines whose bytes add up to exactly `bytes` (at least 200), moving HEAD from `from`. */
function filler(from: string, bytes: number, tag: string): { text: string; head: string } {
  const base = Buffer.byteLength(line(ZERO, ZERO, 'commit: '));
  let text = '', cur = from, i = 0, left = bytes;
  while (left > 0) {
    const n = left <= base + 400 ? left - base : 200;
    assert.ok(n >= 1);
    const nu = h(`${tag}${i++}`), l = line(cur, nu, 'commit: ' + 'x'.repeat(n));
    text += l;
    left -= Buffer.byteLength(l);
    cur = nu;
  }
  assert.equal(Buffer.byteLength(text), bytes);
  return { text, head: cur };
}

// ---------------------------------------------------------------------------------------------------------------------
// The reader's pieces
// ---------------------------------------------------------------------------------------------------------------------

test('parseLine reads git reflog lines: with and without a subject, SHA-1 and SHA-256, spaces in the ident', () => {
  assert.deepEqual(parseLine(line(h(1), h(2), 'commit: hello\tworld ✓').slice(0, -1)), { old: h(1), new: h(2), subject: 'commit: hello\tworld ✓' });
  assert.deepEqual(parseLine(line(h(1), h(2), null).slice(0, -1)), { old: h(1), new: h(2), subject: '' });
  assert.deepEqual(parseLine(line(h(1), h(2), '').slice(0, -1)), { old: h(1), new: h(2), subject: '' });
  const s256 = createHash('sha256').update('x').digest('hex');
  assert.deepEqual(parseLine(`${ZERO}${ZERO.slice(0, 24)} ${s256} Steve Hill <s@h.com> 1792859400 -0500\tcommit (initial): a`),
    { old: '0'.repeat(64), new: s256, subject: 'commit (initial): a' });
  assert.equal(parseLine(`${h(1)} ${h(2)} A B C <a b@c> 1 +0000\tx\u2028y`)?.subject, 'x\u2028y', 'U+2028 in a subject');
  for (const bad of ['', 'x', `${h(1)} ${h(2)}`, `${h(1).toUpperCase()} ${h(2)} t <t@t> 1 +0000\tx`, `${h(1).slice(1)} ${h(2)} t <t@t> 1 +0000`,
    `${h(1)} ${h(2)} t <t@t> 1\tx`, `${h(1)} ${h(2)} t <t@t> x +0000\tx`, `${h(1)}  ${h(2)} t <t@t> 1 +0000`]) assert.equal(parseLine(bad), null, bad);
  assert.equal(parseLines([line(h(1), h(2), 'a'), line(h(2), h(3), 'b')].join('').slice(0, -1))?.length, 2);
  assert.equal(parseLines(line(h(1), h(2), 'a') + 'junk'), null, 'one bad line spoils the window');
});

test('histSid and histPath: the session key, and one file per session and repo root', () => {
  assert.equal(histSid('abc-DEF_1', '/t.jsonl'), 'abc-DEF_1');
  assert.equal(histSid('not safe', '/t.jsonl'), fnv1a('/t.jsonl'));
  assert.equal(histSid('x'.repeat(81), '/t.jsonl'), fnv1a('/t.jsonl'));
  assert.equal(histSid(null, '/t.jsonl'), fnv1a('/t.jsonl'));
  assert.equal(histSid('../x', null), null);
  assert.equal(histSid(null, null), null);
  assert.equal(histPath('C:/c', 's', 'D:\\Code\\Repo\\'), join('C:/c', 'hud', `s.${gitKey('d:/code/repo')}.json`));
  assert.equal(normRoot('D:\\Code\\Repo\\'), 'd:/code/repo');
});

test('validWindow and commitSeen: the window rule and the commit rule', () => {
  const at = (head: string, size = 100) => ({ size, head });
  const l = (old: string, nu: string, subject: string) => ({ old, new: nu, subject });
  assert.equal(validWindow(at(h(0)), []), false, 'no line');
  assert.equal(validWindow(at(h(0)), [l(h(0), h(1), 'commit: a')]), true);
  assert.equal(validWindow(at(h(0)), [l(h(9), h(1), 'commit: a')]), false, 'does not continue from the saved head');
  assert.equal(validWindow(at('', 0), [l(ZERO, h(1), 'commit (initial): a')]), true, 'unborn: the empty log');
  assert.equal(validWindow(at('', 0), [l(h(9), h(1), 'commit: a')]), false);
  assert.equal(validWindow(at('', 120), [l(ZERO, h(1), 'commit (initial): a')]), false, 'an unknown head is not the empty log');
  assert.equal(validWindow(at(h(0), 0), [l(h(0), h(1), 'commit: a')]), true, 'an emptied log continues from the head it kept');
  assert.equal(validWindow(at(h(0), 0), [l(ZERO, h(1), 'commit (initial): a')]), true, 'and the all-zero sha still starts an empty log');
  assert.equal(validWindow(at(h(0), 0), [l(h(9), h(1), 'commit: a')]), false);

  assert.equal(commitSeen(h(0), [l(h(0), h(1), 'commit: a')]), true);
  assert.equal(commitSeen(h(0), [l(h(0), h(1), 'commit (amend): a')]), true);
  assert.equal(commitSeen(h(0), [l(h(0), h(1), 'commit (merge): Merge branch x')]), false);
  assert.equal(commitSeen(h(0), [l(h(0), h(1), 'merge x: Merge made by the \'ort\' strategy.')]), false);
  assert.equal(commitSeen(h(0), [l(h(0), h(1), 'commit: a'), l(h(1), h(0), 'reset: moving to HEAD~1')]), false, 'back at the saved head');
  assert.equal(commitSeen(h(0), [l(h(0), h(1), 'commit: a'), l(h(1), h(0), 'reset: moving to HEAD~1'), l(h(0), h(2), 'commit: b')]), true,
    'a commit after the last return to the saved head');
  assert.equal(commitSeen(h(0), [l(h(0), h(1), 'commit: a'), l(h(1), h(0), 'reset: moving to HEAD~1'), l(h(0), h(3), 'reset: moving to x')]), false,
    'only lines after the last return count');
  assert.equal(commitSeen(h(0), [l(h(0), h(1), 'commit: a'), l(h(1), h(0), 'reset: moving to HEAD~1'), l(h(0), h(2), 'commit: b'),
    l(h(2), h(0), 'reset: moving to HEAD~1'), l(h(0), h(3), 'reset: moving to x')]), false, 'the last return, not the first');
  assert.equal(commitSeen(h(0), []), false);
});

// ---------------------------------------------------------------------------------------------------------------------
// session4: the time-lapse's own hists, and the vendored cacheStep
// ---------------------------------------------------------------------------------------------------------------------

/** session4's logs/HEAD: a commit before the session, then a line per chat commit and the checkout to feature/hotbar. */
async function session4Log(): Promise<(now: number) => Array<{ t: number; text: string }>> {
  const C = await loadCache();
  const switchAt = SESSION.events.find((e) => e.text.startsWith('Switched to a new branch'))!.t;
  const timeline = [...C.commitsOf().map((c) => ({ t: c.t, commit: true })), { t: switchAt, commit: false }].sort((a, b) => a.t - b.t);
  const entries: Array<{ t: number; text: string }> = [{ t: -1, text: L0 }];
  let k = 0;
  for (const e of timeline) {
    if (e.commit) { entries.push({ t: e.t, text: line(h(k), h(k + 1), 'commit: Commit before the break') }); k++; }
    else entries.push({ t: e.t, text: line(h(k), h(k), 'checkout: moving from main to feature/hotbar') });
  }
  assert.equal(k, 4);
  return (now) => entries.filter((e) => e.t <= now);
}

test('session4 replay: every frame equals its own hist (readHist) and the vendored cacheStep; gold at 86, 259, 519, 576', async () => {
  const C = await loadCache();
  const ref = C.framesWithHist();
  const logAt = await session4Log();
  let saved: unknown = null, writes = 0;
  const gold: number[] = [];
  SESSION.frames.forEach((f, i) => {
    const now = i * SESSION.STEP, g = fromState(f).git!;
    const r = stepHistory(saved, { now, root: R, branch: g.branch, add: g.add, del: g.rem }, memLog(logAt(now).map((e) => e.text).join('')));
    assert.deepEqual(r.hist.buckets, readHist(f.hist)!.buckets, `frame ${i}: the frame's own hist`);
    assert.deepEqual(r.hist.buckets, plain(ref[i]!.hist.buckets), `frame ${i}: cacheStep`);
    // the session began at the first render (frame 0), as the design's cache keeps it: each frame's own sessionStart
    assert.deepEqual(r.hist, { now, sessionStart: 0, dirtySince: null, commits: 0, lastCommit: null, buckets: r.hist.buckets });
    assert.equal(r.hist.sessionStart, readHist(f.hist)!.sessionStart, `frame ${i}: the frame's own sessionStart`);
    if (r.commit) gold.push(i);
    if (r.changed) { saved = disk(r); writes++; }
  });
  assert.deepEqual(gold, [86, 259, 519, 576]);
  assert.ok(writes < SESSION.frames.length, `${writes} writes for ${SESSION.frames.length} renders`);
});

test('session4 replay through the disk: logs/HEAD appended as git would, the file written only by the after hooks', async (t) => {
  const logAt = await session4Log();
  const dir = mkdtempSync(join(tmpdir(), 'hb-hist-'));
  try {
    const gitDir = join(dir, 'repo', '.git');
    mkdirSync(join(gitDir, 'logs'), { recursive: true });
    const repo: Repo = { root: join(dir, 'repo'), gitDir, commonDir: gitDir, head: 'ref: refs/heads/main', branch: 'main', detached: false };
    const cache = join(dir, 'cache'), file = histPath(cache, 's4', repo.root);
    let appended = 0, writes = 0, pure: unknown = null;
    SESSION.frames.forEach((f, i) => {
      const now = i * SESSION.STEP, g = fromState(f).git!;
      const due = logAt(now);
      for (; appended < due.length; appended++) appendFileSync(join(gitDir, 'logs', 'HEAD'), due[appended]!.text);
      const after: Array<() => void> = [];
      const before = existsSync(file) ? readFileSync(file, 'utf8') : null;
      const hist = diskHistory({ cacheDir: cache, sid: 's4', repo, branch: g.branch, add: g.add, del: g.rem, now, after, persist: true });
      assert.equal(existsSync(file) ? readFileSync(file, 'utf8') : null, before, `frame ${i}: nothing written before the hooks run`);
      const r = stepHistory(pure, { now, root: normRoot(repo.root), branch: g.branch, add: g.add, del: g.rem }, memLog(due.map((e) => e.text).join('')));
      assert.deepEqual(hist, r.hist, `frame ${i}`);
      assert.equal(after.length, r.changed ? 1 : 0, `frame ${i}: a write exactly when something changed`);
      for (const fn of after) fn();
      writes += after.length;
      if (r.changed) pure = disk(r);
    });
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), pure);
    // at least one write per quarter hour (the session spans 23), and far fewer than one per render
    assert.ok(writes >= 23 && writes < SESSION.frames.length / 2, `${writes} writes`);
    t.diagnostic(`${writes} history writes for ${SESSION.frames.length} renders`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// The deliberate deviations: each asserts both answers, the port's and cacheStep's
// ---------------------------------------------------------------------------------------------------------------------

const st = (branch = 'main', add = 10, del = 2): Record<string, unknown> => ({ branch, add, del });
/** cacheStep after a first render at `now` with HEAD at `head`, then one at `now2` with HEAD at `head2` and that reflog. */
async function cacheTwice(head: string | null, head2: string | null, reflog: string[], now = Q + 10, now2 = Q + 70, b2 = 'main', first?: CacheEntry): Promise<[CacheEntry, { buckets: unknown[][] }]> {
  const C = await loadCache();
  const c0 = first ?? C.cacheStep(null, st(), now, { head })[0];
  const git: CacheGit = { head: head2, reflog: () => reflog, stat: () => [1, 1] };
  return C.cacheStep(c0, st(b2), now2, git);
}

test('deviation: a `commit (merge):` line (a conflicted merge concluded by git commit) is no commit; cacheStep counts it', async () => {
  const s0 = step(null, Q + 10, L0);
  const text = L0 + line(h(0), h(1), "commit (merge): Merge branch 'x'");
  const merge = step(disk(s0), Q + 70, text);
  assert.equal(merge.commit, false);
  assert.deepEqual(merge.next.log, { size: Buffer.byteLength(text), head: h(1) }, 'the window was read and moves the anchor');
  assert.equal(step(disk(s0), Q + 70, L0 + line(h(0), h(1), 'commit: x')).commit, true, 'a plain commit is one');
  const [, hist] = await cacheTwice(h(0), h(1), [`${h(1)}\tcommit (merge): Merge branch 'x'`]);
  assert.equal(goldOf(hist), true, 'cacheStep: gold');
});

test('deviation: a window whose first old sha is not the saved head re-anchors and sees no commit; cacheStep sees one', async () => {
  const s0 = step(null, Q + 10, L0);
  const text = L0 + line(h(9), h(1), 'commit: x');
  const log = memLog(text);
  const r = step(disk(s0), Q + 70, log);
  assert.equal(r.commit, false);
  assert.deepEqual(r.next.log, { size: Buffer.byteLength(text), head: h(1) });
  assert.ok(log.bytes <= Buffer.byteLength(text) - Buffer.byteLength(L0) + 1 + TAIL_MAX);
  const [, hist] = await cacheTwice(h(0), h(1), [`${h(1)}\tcommit: x`]);
  assert.equal(goldOf(hist), true);
});

test('deviation: a repo switch starts that repo\'s own history (no commit, no earlier buckets); cacheStep carries one cache over', async () => {
  const s0 = step(null, Q - 900 + 10, L0);                                  // repo A, the quarter before
  const b = L0.replace(h(0), h('b0')) + line(h('b0'), h('b1'), 'commit: in B') + line(h('b1'), h('b2'), 'commit: in B');
  const r = stepHistory(disk(s0), { now: Q + 70, root: 'd:/code/other', branch: 'main', add: 10, del: 2 }, memLog(b));
  assert.equal(r.commit, false);
  assert.equal(r.changed, true);
  assert.deepEqual(r.next.buckets, [[1992066, 12, 10, 2, 0]], 'another root is no file: only this quarter');
  assert.deepEqual(r.next.log, { size: Buffer.byteLength(b), head: h('b2') });
  const C = await loadCache();
  const cA = C.cacheStep(null, st(), Q - 900 + 10, { head: h(0) })[0];
  const [, hist] = await cacheTwice(null, h('b2'), [`${h('b2')}\tcommit: in B`, `${h('b1')}\tcommit: in B`], 0, Q + 70, 'main', cA);
  assert.equal(goldOf(hist), true, 'cacheStep: gold from the other repo');
  assert.equal(hist.buckets.length, 2, 'cacheStep: repo A\'s bucket carried over');
});

test('deviation: an unborn repo\'s first commit is seen through the empty-log anchor; cacheStep never sees it', async () => {
  const s0 = step(null, Q + 10, '');
  assert.deepEqual(s0.next.log, { size: 0, head: '' });
  const r = step(disk(s0), Q + 70, line(ZERO, h(1), 'commit (initial): first'));
  assert.equal(r.commit, true);
  assert.equal(goldOf(r.hist), true);
  const [, hist] = await cacheTwice(null, h(1), [`${h(1)}\tcommit (initial): first`]);
  assert.equal(goldOf(hist), false, 'cacheStep: no head before, so HEAD never "moved"');
});

test('a commit on another branch and back (HEAD ends at the saved head): no commit in either', async () => {
  const s0 = step(null, Q + 10, L0);
  const r = step(disk(s0), Q + 70, L0 + line(h(0), h(0), 'checkout: moving from main to x') + line(h(0), h(1), 'commit: on x')
    + line(h(1), h(0), 'checkout: moving from x to main'));
  assert.equal(r.commit, false);
  assert.equal(r.next.log.head, h(0));
  const [, hist] = await cacheTwice(h(0), h(0), []);
  assert.equal(goldOf(hist), false);
});

test('a branch switch re-anchors with no commit, in both; the next commit on the new branch is gold in both', async () => {
  const s0 = step(null, Q + 10, L0);
  const t1 = L0 + line(h(0), h(0), 'checkout: moving from main to x') + line(h(0), h(1), 'commit: on x');
  const r = step(disk(s0), Q + 70, t1, 'x');
  assert.equal(r.commit, false);
  assert.deepEqual([r.next.branch, r.next.log], ['x', { size: Buffer.byteLength(t1), head: h(1) }]);
  const r2 = step(disk(r), Q + 130, t1 + line(h(1), h(2), 'commit: again'), 'x');
  assert.equal(r2.commit, true);
  const C = await loadCache();
  const [c1, hist1] = await cacheTwice(h(0), h(1), [`${h(1)}\tcommit: on x`], Q + 10, Q + 70, 'x');
  assert.equal(goldOf(hist1), false);
  const [, hist2] = C.cacheStep(c1, st('x'), Q + 130, { head: h(2), reflog: () => [`${h(2)}\tcommit: again`], stat: () => [1, 1] });
  assert.equal(goldOf(hist2), true);
});

test('deviation: a shrunk log (reflog expire) re-anchors with no commit; cacheStep sees one', async () => {
  const big = L0 + line(h(0), h(1), 'commit: a') + line(h(1), h(2), 'commit: b') + line(h(2), h(3), 'commit: c');
  const s0 = step(null, Q + 10, big);
  const small = line(h(3), h(4), 'commit: after the expire');
  const r = step(disk(s0), Q + 70, small);
  assert.equal(r.commit, false);
  assert.deepEqual(r.next.log, { size: Buffer.byteLength(small), head: h(4) });
  const [, hist] = await cacheTwice(h(3), h(4), [`${h(4)}\tcommit: after the expire`]);
  assert.equal(goldOf(hist), true);
});

test('an emptied log (reflog expire --expire=now, a gc expiring every entry) keeps the saved head: the first commit after it is gold, as in cacheStep', async () => {
  const before = L0 + line(h(0), h(1), 'commit: a');
  const s0 = step(null, Q + 10, before);
  const e = step(disk(s0), Q + 70, '');
  assert.equal(e.commit, false);
  assert.deepEqual(e.next.log, { size: 0, head: h(1) }, 'size 0, the head it had');
  assert.equal(e.changed, true);
  assert.equal(step(disk(e), Q + 100, '').changed, false, 'and it stays put while the log stays empty');
  const after = line(h(1), h(2), 'commit: after the expire');
  const r = step(disk(e), Q + 130, after);
  assert.equal(r.commit, true, 'the first commit after the expire');
  assert.equal(goldOf(r.hist), true);
  assert.deepEqual(r.next.log, { size: Buffer.byteLength(after), head: h(2) });
  const half = step(disk(e), Q + 130, after.slice(0, 50));
  assert.deepEqual(half.next.log, { size: 0, head: h(1) }, 'a partial first line keeps the kept head too');
  assert.equal(step(disk(half), Q + 190, after).commit, true);
  assert.equal(step(disk(e), Q + 130, line(ZERO, h(7), 'commit (initial): again')).commit, true, 'a new log (re-init) after it still counts');
  assert.equal(step(disk(e), Q + 130, line(h(9), h(2), 'commit: x')).commit, false, 'a line that does not continue from it re-anchors');
  const other = step(disk(s0), Q + 70, '', 'x');
  assert.deepEqual(other.next.log, { size: 0, head: '' }, 'another branch keeps nothing');
  assert.equal(step(disk(other), Q + 130, after, 'x').commit, false);
  const [, hist] = await cacheTwice(h(1), h(2), [`${h(2)}\tcommit: after the expire`]);
  assert.equal(goldOf(hist), true, 'cacheStep: gold');
});

test('deviation: an append over 64 KiB re-anchors from 4 KiB with no commit; exactly 64 KiB is still a window; cacheStep reads it all', async () => {
  const s0 = step(null, Q + 10, L0);
  const over = filler(h(0), WINDOW_MAX + 1, 'o');
  const log = memLog(L0 + over.text);
  const r = step(disk(s0), Q + 70, log);
  assert.equal(r.commit, false);
  assert.equal(r.next.log.head, over.head);
  assert.ok(log.bytes <= TAIL_MAX, `${log.bytes} bytes read`);
  const exact = filler(h(0), WINDOW_MAX, 'e');
  const log2 = memLog(L0 + exact.text);
  const r2 = step(disk(s0), Q + 70, log2);
  assert.equal(r2.commit, true);
  assert.deepEqual(r2.next.log, { size: Buffer.byteLength(L0) + WINDOW_MAX, head: exact.head });
  assert.equal(log2.bytes, WINDOW_MAX + 1, 'the window and the byte before it, no re-anchor');
  const [, hist] = await cacheTwice(h(0), over.head, [`${over.head}\tcommit: x`]);
  assert.equal(goldOf(hist), true);
});

test('a partial last line: the complete lines count, the partial one waits for the next render (no re-read, no double count)', async () => {
  const s0 = step(null, Q + 10, L0);
  const full = line(h(0), h(1), 'commit: a');
  const half = step(disk(s0), Q + 70, L0 + full.slice(0, 50));
  assert.equal(half.commit, false);
  assert.deepEqual(half.next.log, s0.next.log, 'the anchor stays where it was');
  assert.equal(half.changed, false);
  const done = step(disk(half), Q + 130, L0 + full);
  assert.equal(done.commit, true);
  const two = step(disk(s0), Q + 70, L0 + full + line(h(1), h(2), 'commit: b').slice(0, 30));
  assert.equal(two.commit, true);
  assert.deepEqual(two.next.log, { size: Buffer.byteLength(L0 + full), head: h(1) }, 'the offset stops at the last \\n');
  const again = step(disk(two), Q + 190, L0 + full + line(h(1), h(1), 'reset: moving to HEAD'));
  assert.equal(again.commit, false, 'the commit is not counted twice');
  // cacheStep: git only shows the commit once HEAD has moved, so it is gold at the same render
  const [, hist] = await cacheTwice(h(0), h(1), [`${h(1)}\tcommit: a`]);
  assert.equal(goldOf(hist), true);
});

test('deviation: a saved size that is not at a line boundary (no \\n before it) re-anchors with no commit; cacheStep sees one', async () => {
  const s0 = step(null, Q + 10, L0);
  const off = { ...disk(s0), log: { size: Buffer.byteLength(L0) - 5, head: h(0) } };
  const text = L0 + line(h(0), h(1), 'commit: a');
  const r = step(off, Q + 70, text);
  assert.equal(r.commit, false);
  assert.deepEqual(r.next.log, { size: Buffer.byteLength(text), head: h(1) });
  const [, hist] = await cacheTwice(h(0), h(1), [`${h(1)}\tcommit: a`]);
  assert.equal(goldOf(hist), true);
  // git squashes a reflog message's whitespace, so a subject can end like a whole line: from inside it, a fragment parses
  const fake = `${h(0)} ${h(9)} t <t@t> 1 +0300`, text2 = L0 + line(h(0), h(1), 'commit: ' + fake);
  const inside = { ...disk(s0), log: { size: Buffer.byteLength(text2) - Buffer.byteLength(fake) - 1, head: h(0) } };
  assert.equal(parseLine(fake)?.new, h(9));
  assert.deepEqual(step(inside, Q + 70, text2).next.log, { size: Buffer.byteLength(text2), head: h(1) }, 'the byte before must be \\n');
});

test('the clock going back: the buckets equal cacheStep\'s, duplicate quarter and all; readHist keeps the later one', async () => {
  const C = await loadCache();
  const times = [1, 2, 3, 4, 5].map((q) => Q + q * 900 + 10), T = [5, 9, 7, 30, 12];
  let saved: unknown = null, cache: CacheEntry | null = null, text = L0;
  times.forEach((now, i) => {
    const r = step(saved, now, text, 'main', T[i]!, 0);
    saved = disk(r);
    cache = C.cacheStep(cache, st('main', T[i]!, 0), now, { head: h(0) })[0];
  });
  text += line(h(0), h(1), 'commit: back in time');
  const back = Q + 2 * 900 + 400;
  const r = step(saved, back, text, 'main', 3, 1);
  const [, hist] = C.cacheStep(cache, st('main', 3, 1), back, { head: h(1), reflog: () => [`${h(1)}\tcommit: back in time`], stat: () => [1, 1] });
  assert.deepEqual(r.hist.buckets, plain(hist.buckets));
  assert.deepEqual(r.hist.buckets.map((b) => b[0]), [1992067, 1992068, 1992068]);
  assert.equal(r.commit, true);
  assert.deepEqual(readHist(r.hist)!.buckets, [[1992067, 5, 5, 0, 0], [1992068, 4, 3, 1, 1]]);
  const next = step(disk(r), back + 60, text, 'main', 3, 1);
  assert.deepEqual(next.hist.buckets, [[1992067, 5, 5, 0, 0], [1992068, 4, 3, 1, 1]], 'the saved file is read as readHist reads it');
  assert.equal(next.changed, true, 'and written back without the duplicate, once');
  assert.equal(step(disk(next), back + 120, text, 'main', 3, 1).changed, false);
});

// ---------------------------------------------------------------------------------------------------------------------
// The anchor, the saved file, bounded reads
// ---------------------------------------------------------------------------------------------------------------------

test('re-anchoring: missing, empty and partial logs, a last line over 4 KiB, an unparsable last line', () => {
  assert.deepEqual(step(null, Q, '').next.log, { size: 0, head: '' });
  const partial = line(ZERO, h(1), 'commit (initial): a');
  const p = step(null, Q, partial.slice(0, 40));
  assert.deepEqual(p.next.log, { size: 0, head: '' }, 'no complete line yet: the empty log');
  assert.equal(step(disk(p), Q + 60, partial).commit, true, 'and the first commit is seen once its line is complete');

  const long = L0 + line(h(0), h(1), 'commit: ' + 'y'.repeat(5000));
  const lg = step(null, Q, long);
  assert.deepEqual(lg.next.log, { size: Buffer.byteLength(long), head: '' }, 'its start is not in the last 4 KiB');
  const after = long + line(h(1), h(2), 'commit: b');
  const a1 = step(disk(lg), Q + 60, after);
  assert.equal(a1.commit, false, 'nothing continues from an unknown head');
  assert.deepEqual(a1.next.log, { size: Buffer.byteLength(after), head: h(2) });
  assert.equal(step(disk(a1), Q + 120, after + line(h(2), h(3), 'commit: c')).commit, true, 'and the next commit counts again');

  const cut = L0 + 'z'.repeat(5000);
  assert.deepEqual(step(null, Q, cut).next.log, { size: Buffer.byteLength(cut), head: '' }, 'no \\n in the last 4 KiB');
  const junk = L0 + 'not a reflog line\n';
  const j = step(null, Q, junk);
  assert.deepEqual(j.next.log, { size: Buffer.byteLength(junk), head: '' });
  assert.equal(step(disk(j), Q + 60, junk + line(ZERO, h(5), 'commit (initial): x')).commit, false, 'an unknown head is not the empty log');
  const lead = '\n' + 'q'.repeat(TAIL_MAX - 1);
  assert.deepEqual(step(null, Q, lead).next.log, { size: 1, head: '' }, 'the only \\n opens the tail');
  // a last line over 4 KiB whose end parses as a line of its own: the tail starts inside it, so its sha is unknown
  const pre = line(h(0), h(1), 'commit: '), tailText = `${h(0)} ${h(9)} ${'n'.repeat(TAIL_MAX - 1 - 96)} <t@t> 1 +0300`;
  assert.equal(Buffer.byteLength(tailText), TAIL_MAX - 1);
  assert.equal(parseLine(tailText)?.new, h(9));
  const trick = L0 + pre.slice(0, -1) + tailText + '\n';
  assert.deepEqual(step(null, Q, trick).next.log, { size: Buffer.byteLength(trick), head: '' });
});

test('a saved file with a wrong v, another root or any corrupt field is no file; a good one is used and not rewritten', () => {
  const s0 = step(null, Q + 10, L0);
  const good = disk(s0);
  const same = step(good, Q + 70, L0);
  assert.equal(same.changed, false, 'only now changed');
  assert.deepEqual(same.next.log, good.log);
  const variants: unknown[] = [
    null, 'x', 7, [], {}, { ...good, v: 2 }, { ...good, root: 'd:/code/other' }, { ...good, root: 'D:/code/repo' },
    { ...good, branch: 5 }, { ...good, log: null }, { ...good, log: [] }, { ...good, log: { size: -1, head: h(0) } },
    { ...good, log: { size: 1.5, head: h(0) } }, { ...good, log: { size: '57', head: h(0) } }, { ...good, log: { size: 57, head: h(0).toUpperCase() } },
    { ...good, log: { size: 57, head: 'abc' } }, { ...good, log: { size: 57 } }, { ...good, buckets: null }, { ...good, buckets: {} },
    { ...good, at: undefined }, { ...good, at: -1 }, { ...good, at: 'soon' },
  ];
  for (const v of variants) {
    const r = step(v, Q + 70, L0 + line(h(0), h(1), 'commit: a'));
    assert.equal(r.changed, true, JSON.stringify(v));
    assert.equal(r.commit, false, JSON.stringify(v));
    assert.deepEqual(r.next.buckets, [[1992066, 12, 10, 2, 0]], JSON.stringify(v));
  }
  const odd = { ...good, buckets: [[1992066, '12', 10.7, 2, true], 'x', [1992050, 1, 1, 0, 0]] };
  const r = step(odd, Q + 70, L0);
  assert.deepEqual(r.next.buckets, [[1992066, 12, 10, 2, 1]], 'the buckets are read as readHist reads them');
  assert.equal(r.changed, true, 'and a cleaned list is written back once');
});

test('bounded reads: nothing new reads nothing; a window reads itself and one byte; a bad window adds at most 4 KiB', () => {
  const s0 = step(null, Q + 10, L0);
  const idle = memLog(L0);
  step(disk(s0), Q + 70, idle);
  assert.deepEqual([idle.reads, idle.bytes], [0, 0]);
  const add = line(h(0), h(1), 'commit: a'), w = memLog(L0 + add);
  step(disk(s0), Q + 70, w);
  assert.deepEqual([w.reads, w.bytes], [1, Buffer.byteLength(add) + 1]);
  const bad = filler(h(7), 60_000, 'b'), wb = memLog(L0 + bad.text);
  step(disk(s0), Q + 70, wb);
  assert.equal(wb.reads, 2);
  assert.ok(wb.bytes <= 60_001 + TAIL_MAX, `${wb.bytes}`);
  const huge = memLog(L0 + filler(h(0), 1 << 20, 'h').text);
  step(null, Q + 70, huge);
  assert.ok(huge.bytes <= TAIL_MAX, 'a first render reads 4 KiB at most');
});

// ---------------------------------------------------------------------------------------------------------------------
// Real git
// ---------------------------------------------------------------------------------------------------------------------

const GIT = findGit(process.env.PATH ?? '');
const NOGIT = { skip: !GIT ? 'git not found' : false } as const;

interface World { dir: string; cache: string; env: NodeJS.ProcessEnv; cleanup(): void }
function world(): World {
  const dir = mkdtempSync(join(tmpdir(), 'hb-hist-git-'));
  const cfg = join(dir, 'gitconfig');
  writeFileSync(cfg, '');
  // the user's own git config never applies here, nor an inherited GIT_DIR or GIT_INDEX_FILE (a run from a git hook)
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.toUpperCase().startsWith('GIT_')));
  const env = { ...inherited, GIT_CONFIG_GLOBAL: cfg, GIT_CONFIG_NOSYSTEM: '1', GIT_MERGE_AUTOEDIT: 'no', GIT_TERMINAL_PROMPT: '0' };
  return { dir, cache: join(dir, 'cache'), env, cleanup: () => rmRetry(dir) };
}
function rmRetry(dir: string): void {
  for (let i = 0; ; i++) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch (e) {
      if (i > 50) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
}
const FLAGS = ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false'];
function git(w: World, cwd: string, ...args: string[]): string {
  return execFileSync(GIT!, [...FLAGS, ...args], { cwd, env: w.env, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
}
/** A git command that may fail (a conflicted merge). */
function gitTry(w: World, cwd: string, ...args: string[]): number | null {
  return spawnSync(GIT!, [...FLAGS, ...args], { cwd, env: w.env, encoding: 'utf8', windowsHide: true }).status;
}
function repoIn(w: World, name: string, commit = true): string {
  const d = join(w.dir, name);
  mkdirSync(d, { recursive: true });
  git(w, d, 'init', '-q', '-b', 'main');
  if (commit) {
    writeFileSync(join(d, 'f.txt'), 'base\n');
    git(w, d, 'add', '.');
    git(w, d, 'commit', '-q', '-m', 'base');
  }
  return d;
}
const commit = (w: World, d: string, msg: string, file = 'f.txt'): void => {
  appendFileSync(join(d, file), msg + '\n');
  git(w, d, 'add', '.');
  git(w, d, 'commit', '-q', '-m', msg);
};
/** n commits on HEAD's branch, each with its own `commit:` line in logs/HEAD, written by git in three processes. */
function bulkCommits(w: World, d: string, n: number, tag: string): void {
  const base = git(w, d, 'rev-parse', 'HEAD').trim();
  const marks = join(w.dir, `marks-${tag}.txt`);
  let fi = '';
  for (let i = 1; i <= n; i++) fi += `commit refs/hidden/${tag}\nmark :${i}\ncommitter t <t@t> 1792859400 +0000\ndata <<EOF\n${tag} ${i}\nEOF\n${i === 1 ? `from ${base}\n` : ''}\n`;
  execFileSync(GIT!, [...FLAGS, 'fast-import', '--quiet', `--export-marks=${marks}`], { cwd: d, env: w.env, input: fi, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const shas = readFileSync(marks, 'utf8').trim().split('\n').map((l) => l.split(' ')[1]!);
  let ur = '', prev = base;
  for (const s of shas) { ur += `start\nupdate HEAD ${s} ${prev}\ncommit\n`; prev = s; }
  execFileSync(GIT!, [...FLAGS, 'update-ref', '-m', 'commit: Commit before the break', '--stdin'], { cwd: d, env: w.env, input: ur, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
}

interface Seen { hist: Hist; gold: boolean; bytes: number; branch: string }
/** One Claude Code session rendering the HUD in several repos: the history step as a render runs it, then its hooks. */
function session(w: World, sid = 'sess', start = Q) {
  let now = start;
  return {
    render(dir: string, advance = 60): Seen {
      now += advance;
      const repo = findRepo(dir)!;
      const after: Array<() => void> = [];
      let bytes = 0;
      const open = (p: string): LogSource & { close(): void } => {
        const l = fileLog(p);
        return { size: l.size, read: (a, b) => { const r = l.read(a, b); bytes += r?.length ?? 0; return r; }, close: () => l.close() };
      };
      const hist = diskHistory({ cacheDir: w.cache, sid, repo, branch: repo.branch, add: 0, del: 0, now, after, persist: true, open });
      for (const f of after) f();
      assert.ok(hist, dir);
      return { hist, gold: goldOf(hist), bytes, branch: repo.branch };
    },
  };
}

/** Reader parity: the reader's parse of logs/HEAD equals git reflog -n 64, oldest first. */
function parity(w: World, dir: string): void {
  const repo = findRepo(dir)!;
  const p = join(repo.gitDir, 'logs', 'HEAD');
  const text = existsSync(p) ? readFileSync(p, 'utf8') : '';
  const mine = text === '' ? [] : parseLines(text.slice(0, -1))!.map((l) => `${l.new}\t${l.subject}`).slice(-64);
  const theirs = git(w, dir, 'reflog', '-n', '64', '--format=%H%x09%gs', 'HEAD').split('\n').filter((l) => l !== '').reverse();
  assert.deepEqual(mine, theirs, `reader parity in ${dir}`);
}

/** Runs a real-git scenario in its own temp world; `then` returns the repo dirs whose reflogs the reader must match. */
async function scenario(fn: (w: World) => string[]): Promise<void> {
  const w = world();
  try {
    for (const d of fn(w)) parity(w, d);
  } finally {
    w.cleanup();
  }
}

test('real git, gold: a commit; two commits in one quarter; --amend; --allow-empty; init then the first commit', NOGIT, async () => {
  await scenario((w) => {
    const d = repoIn(w, 'one'), s = session(w);
    assert.equal(s.render(d).gold, false, 'first render');
    commit(w, d, 'a');
    assert.equal(s.render(d).gold, true, 'a commit');
    return [d];
  });
  await scenario((w) => {
    const d = repoIn(w, 'two'), s = session(w);
    s.render(d);
    commit(w, d, 'a');
    commit(w, d, 'b');
    const r = s.render(d);
    assert.equal(r.gold, true, 'two commits');
    commit(w, d, 'c');
    const r2 = s.render(d);
    assert.equal(r2.gold, true);
    assert.equal(r2.hist.buckets.length, 1, 'one quarter, one bucket');
    return [d];
  });
  await scenario((w) => {
    const d = repoIn(w, 'amend'), s = session(w);
    s.render(d);
    git(w, d, 'commit', '-q', '--amend', '-m', 'amended');
    assert.equal(s.render(d).gold, true, '--amend');
    return [d];
  });
  await scenario((w) => {
    const d = repoIn(w, 'empty'), s = session(w);
    s.render(d);
    git(w, d, 'commit', '-q', '--allow-empty', '-m', 'empty');
    assert.equal(s.render(d).gold, true, '--allow-empty');
    return [d];
  });
  await scenario((w) => {
    const d = repoIn(w, 'unborn', false), s = session(w);
    assert.equal(existsSync(join(d, '.git', 'logs', 'HEAD')), false);
    assert.equal(s.render(d).gold, false, 'unborn: first render');
    writeFileSync(join(d, 'f.txt'), 'first\n');
    git(w, d, 'add', '.');
    git(w, d, 'commit', '-q', '-m', 'first');
    assert.equal(s.render(d).gold, true, 'init then the first commit');
    return [d];
  });
});

test('real git, no gold: merge, pull, reset --hard, rebase, checkout -b, away and back, stash, restore, a conflicted merge, detached, no reflog', NOGIT, async () => {
  await scenario((w) => {
    const d = repoIn(w, 'merge'), s = session(w);
    git(w, d, 'checkout', '-q', '-b', 'feat');
    commit(w, d, 'on feat', 'g.txt');
    git(w, d, 'checkout', '-q', 'main');
    commit(w, d, 'on main');
    s.render(d);
    git(w, d, 'merge', '-q', '--no-edit', 'feat');
    assert.match(readFileSync(join(d, '.git', 'logs', 'HEAD'), 'utf8'), /\tmerge feat: Merge made by/);
    assert.equal(s.render(d).gold, false, 'a clean merge');
    return [d];
  });
  await scenario((w) => {
    const o = repoIn(w, 'origin'), s = session(w);
    git(w, w.dir, 'clone', '-q', o, 'work');
    const d = join(w.dir, 'work');
    s.render(d);
    commit(w, o, 'upstream');
    git(w, d, 'pull', '-q', '--ff-only');
    assert.match(readFileSync(join(d, '.git', 'logs', 'HEAD'), 'utf8'), /\tpull[^\n]*: Fast-forward\n$/);
    assert.equal(s.render(d).gold, false, 'a fast-forward pull');
    return [d, o];
  });
  await scenario((w) => {
    const d = repoIn(w, 'reset'), s = session(w);
    commit(w, d, 'second');
    s.render(d);
    git(w, d, 'reset', '-q', '--hard', 'HEAD~1');
    assert.equal(s.render(d).gold, false, 'reset --hard');
    return [d];
  });
  await scenario((w) => {
    const d = repoIn(w, 'rebase'), s = session(w);
    git(w, d, 'checkout', '-q', '-b', 'feat');
    commit(w, d, 'on feat', 'g.txt');
    git(w, d, 'checkout', '-q', 'main');
    commit(w, d, 'on main');
    git(w, d, 'checkout', '-q', 'feat');
    s.render(d);
    git(w, d, 'rebase', '-q', 'main');
    assert.match(readFileSync(join(d, '.git', 'logs', 'HEAD'), 'utf8'), /\trebase \(finish\)/);
    const r = s.render(d);
    assert.deepEqual([r.gold, r.branch], [false, 'feat'], 'rebase');
    return [d];
  });
  await scenario((w) => {
    const d = repoIn(w, 'checkout-b'), s = session(w);
    s.render(d);
    git(w, d, 'checkout', '-q', '-b', 'topic');
    assert.equal(s.render(d).gold, false, 'checkout -b');
    commit(w, d, 'on topic');
    assert.equal(s.render(d).gold, true, 'and a commit on the new branch is gold');
    return [d];
  });
  await scenario((w) => {
    const d = repoIn(w, 'away'), s = session(w);
    git(w, d, 'checkout', '-q', '-b', 'other');
    commit(w, d, 'on other');
    git(w, d, 'checkout', '-q', 'main');
    s.render(d);
    git(w, d, 'checkout', '-q', 'other');
    git(w, d, 'checkout', '-q', 'main');
    assert.equal(s.render(d).gold, false, 'a checkout away and back');
    return [d];
  });
  await scenario((w) => {
    const d = repoIn(w, 'stash'), s = session(w);
    appendFileSync(join(d, 'f.txt'), 'dirty\n');
    s.render(d);
    git(w, d, 'stash', '-q');
    assert.equal(s.render(d).gold, false, 'stash');
    appendFileSync(join(d, 'f.txt'), 'dirty again\n');
    git(w, d, 'restore', '.');
    assert.equal(s.render(d).gold, false, 'restore .');
    return [d];
  });
  await scenario((w) => {
    const d = repoIn(w, 'conflict'), s = session(w);
    git(w, d, 'checkout', '-q', '-b', 'x');
    writeFileSync(join(d, 'f.txt'), 'x\n');
    git(w, d, 'commit', '-q', '-am', 'x');
    git(w, d, 'checkout', '-q', 'main');
    writeFileSync(join(d, 'f.txt'), 'm\n');
    git(w, d, 'commit', '-q', '-am', 'm');
    s.render(d);
    assert.notEqual(gitTry(w, d, 'merge', '-q', 'x'), 0, 'the merge stops on the conflict');
    writeFileSync(join(d, 'f.txt'), 'resolved\n');
    git(w, d, 'add', 'f.txt');
    git(w, d, 'commit', '-q', '--no-edit');
    assert.match(readFileSync(join(d, '.git', 'logs', 'HEAD'), 'utf8'), /\tcommit \(merge\): Merge branch 'x'\n$/);
    assert.equal(s.render(d).gold, false, 'a conflicted merge concluded by git commit');
    return [d];
  });
  await scenario((w) => {
    const d = repoIn(w, 'detached'), s = session(w);
    s.render(d);
    git(w, d, 'checkout', '-q', '--detach');
    const r1 = s.render(d);
    assert.equal(r1.branch.length, 7);
    commit(w, d, 'detached work');
    const r2 = s.render(d);
    assert.notEqual(r2.branch, r1.branch);
    assert.equal(r2.gold, false, 'a detached HEAD (B changes on every commit)');
    return [d];
  });
  await scenario((w) => {
    const d = repoIn(w, 'nolog', false), s = session(w);
    git(w, d, 'config', 'core.logAllRefUpdates', 'false');
    commit(w, d, 'base');
    s.render(d);
    commit(w, d, 'second');
    assert.equal(existsSync(join(d, '.git', 'logs', 'HEAD')), false);
    assert.equal(s.render(d).gold, false, 'core.logAllRefUpdates=false');
    return [d];
  });
});

test('real git, layouts: a linked worktree has its own logs/HEAD; pack-refs --all changes nothing', NOGIT, async () => {
  await scenario((w) => {
    const d = repoIn(w, 'main'), s = session(w);
    git(w, d, 'worktree', 'add', '-q', '-b', 'wtb', join(w.dir, 'wt'));
    const wt = join(w.dir, 'wt');
    assert.match(findRepo(wt)!.gitDir.replace(/\\/g, '/'), /\/\.git\/worktrees\/wt$/);
    s.render(wt);
    s.render(d);
    commit(w, d, 'in main');
    assert.equal(s.render(wt).gold, false, 'a commit in the main worktree is not this worktree\'s');
    assert.equal(s.render(d).gold, true, 'it is the main worktree\'s');
    commit(w, wt, 'in wt', 'w.txt');
    assert.equal(s.render(wt).gold, true, 'a commit in the linked worktree');
    return [d, wt];
  });
  await scenario((w) => {
    const d = repoIn(w, 'packed'), s = session(w);
    commit(w, d, 'second');
    s.render(d);
    git(w, d, 'pack-refs', '--all');
    assert.equal(existsSync(join(d, '.git', 'refs', 'heads', 'main')), false);
    assert.equal(s.render(d).gold, false, 'pack-refs');
    commit(w, d, 'third');
    assert.equal(s.render(d).gold, true, 'a commit after pack-refs');
    return [d];
  });
});

test('real git, an emptied reflog: after reflog expire --expire=now --all, or a gc expiring every entry, the first commit is gold', NOGIT, async () => {
  const emptied = (w: World, d: string, how: () => void, label: string): void => {
    const s = session(w), p = join(d, '.git', 'logs', 'HEAD');
    commit(w, d, 'one');
    assert.equal(s.render(d).gold, false, `${label}: first render`);
    how();
    assert.equal(statSync(p, { throwIfNoEntry: false })?.size ?? 0, 0, `${label}: logs/HEAD is empty`);
    assert.equal(s.render(d).gold, false, `${label}: the render that sees the empty log`);
    commit(w, d, 'two');
    assert.equal(s.render(d).gold, true, `${label}: the first commit after it`);
    commit(w, d, 'three');
    assert.equal(s.render(d, 900).gold, true, `${label}: and the next one, in a new quarter`);
  };
  await scenario((w) => {
    const d = repoIn(w, 'expire');
    emptied(w, d, () => git(w, d, 'reflog', 'expire', '--expire=now', '--all'), 'reflog expire');
    return [d];
  });
  await scenario((w) => {
    const d = repoIn(w, 'gc');
    emptied(w, d, () => git(w, d, '-c', 'gc.reflogExpire=now', '-c', 'gc.reflogExpireUnreachable=now', 'gc', '-q'), 'gc');
    return [d];
  });
});

test('real git, repo switch: A to B (both on main, B with 400 commits): no gold, bounded reads; back in A after a real commit: gold', NOGIT, async () => {
  await scenario((w) => {
    const a = repoIn(w, 'A'), b = repoIn(w, 'B'), s = session(w);
    bulkCommits(w, b, 400, 'b');
    const bLog = statSync(join(b, '.git', 'logs', 'HEAD')).size;
    assert.ok(bLog > 50_000 && bLog < WINDOW_MAX, `B's logs/HEAD is ${bLog} bytes`);
    assert.equal(s.render(a).gold, false);
    const rb = s.render(b);
    assert.equal(rb.gold, false, 'B: no gold');
    assert.ok(rb.bytes <= WINDOW_MAX + 1 + TAIL_MAX, `B read ${rb.bytes} bytes`);
    assert.ok(rb.bytes <= TAIL_MAX, `a first render in B reads only its anchor (${rb.bytes} bytes)`);
    commit(w, a, 'real work in A');
    const ra = s.render(a);
    assert.equal(ra.gold, true, 'back in A after a real commit there');
    assert.ok(ra.bytes < 1000, `A read ${ra.bytes} bytes`);
    // B again, in a new quarter: 400 more commits fit one window (gold, its own commits); 500 more do not (no gold, 4 KiB)
    bulkCommits(w, b, 400, 'c');
    const rb2 = s.render(b, 900);
    assert.equal(rb2.gold, true);
    assert.ok(rb2.bytes > 50_000 && rb2.bytes <= WINDOW_MAX + 1, `the window: ${rb2.bytes} bytes`);
    bulkCommits(w, b, 500, 'd');
    const rb3 = s.render(b, 900);
    assert.equal(rb3.gold, false, 'an append over 64 KiB');
    assert.ok(rb3.bytes <= TAIL_MAX, `re-anchored from ${rb3.bytes} bytes`);
    assert.equal(readdirSync(join(w.cache, 'hud')).length, 2, 'one file per repo');
    return [a, b];
  });
});

test('no process: the history step in a real repo, with child_process trapped, starts nothing', NOGIT, async () => {
  const cp = createRequire(import.meta.url)('node:child_process') as Record<string, unknown>;
  const names = ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'];
  const real = names.map((n) => cp[n]);
  let started = 0;
  const trapped = <T>(fn: () => T): T => {
    for (const n of names) cp[n] = () => { started++; throw new Error(`process started: ${n}`); };
    try { return fn(); } finally { names.forEach((n, i) => { cp[n] = real[i]; }); }
  };
  await scenario((w) => {
    const d = repoIn(w, 'np');
    const payload = { session_id: 'np', workspace: { current_dir: d } };
    const env = { HUNGERBAR_CACHE_DIR: w.cache };
    const render = (now: number): { hist: Hist | null; spawns: string[][] } => trapped(() => {
      const spawns: string[][] = [], after: Array<() => void> = [];
      const src = diskSources(payload, env, defaults(), now, spawns, after);
      const g = src.git(d);
      const hist = src.history(g.repo, g.branch, 3, 1);
      for (const f of after) f();
      return { hist, spawns };
    });
    const r1 = render(Q + 10);
    commit(w, d, 'between renders');
    const r2 = render(Q + 70);
    assert.equal(started, 0);
    assert.equal(goldOf(r1.hist), false);
    assert.equal(goldOf(r2.hist), true);
    assert.ok(r2.spawns.every((s) => s[1] === 'git'), 'only the git refresher is queued (not started)');
    return [d];
  });
  const src = readFileSync(join(ROOT, 'src', 'hud', 'history.ts'), 'utf8');
  assert.doesNotMatch(src, /child_process|proc\.ts|spawn|execFile|execSync/, 'history.ts never reaches for a process');
});

// ---------------------------------------------------------------------------------------------------------------------
// The write policy
// ---------------------------------------------------------------------------------------------------------------------

test('write policy: none when only now changed, one per new quarter or raised bucket, none with persist=false, after stdout only', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hb-hist-w-'));
  try {
    const d = join(dir, 'repo'), logs = join(d, '.git', 'logs');
    mkdirSync(logs, { recursive: true });
    writeFileSync(join(d, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    writeFileSync(join(logs, 'HEAD'), L0);
    const env = { HUNGERBAR_CACHE_DIR: join(dir, 'cache'), GIT_CEILING_DIRECTORIES: dir };
    const payload = { session_id: 'wp', workspace: { current_dir: d } };
    const file = histPath(env.HUNGERBAR_CACHE_DIR, 'wp', d);
    const render = (now: number, add: number, del: number, o: { persist?: boolean; run?: boolean; p?: object } = {}) => {
      const after: Array<() => void> = [];
      const src = diskSources(o.p ?? payload, env, defaults(), now, [], after, o.persist ?? true);
      const g = src.git(d);
      const before = existsSync(file) ? readFileSync(file, 'utf8') : null;
      const hist = src.history(g.repo, g.branch, add, del);
      assert.equal(existsSync(file) ? readFileSync(file, 'utf8') : null, before, 'the step itself writes nothing');
      if (o.run ?? true) for (const f of after) f();
      return { hist, writes: after.length };
    };
    assert.equal(render(Q + 10, 5, 1).writes, 1, 'first render');
    assert.ok(existsSync(file));
    assert.equal(render(Q + 70, 5, 1).writes, 0, 'only now changed');
    assert.equal(render(Q + 130, 9, 1).writes, 1, 'a raised bucket');
    assert.equal(render(Q + 190, 2, 0).writes, 0, 'a lower T keeps the bucket');
    assert.equal(render(Q + 200, 5, 5).writes, 0, 'the same T keeps the bucket\'s first add and del');
    assert.equal(render(Q + 900, 2, 0).writes, 1, 'a new quarter');
    appendFileSync(join(logs, 'HEAD'), line(h(0), h(1), 'commit: a'));
    const killed = render(Q + 960, 2, 0, { run: false });
    assert.deepEqual([killed.writes, goldOf(killed.hist)], [1, true], 'a commit');
    const again = render(Q + 1020, 2, 0);
    assert.deepEqual([again.writes, goldOf(again.hist)], [1, true], 'a render killed before its hooks loses only the write');
    assert.equal(render(Q + 1080, 2, 0).writes, 0);
    const reset = line(h(1), h(1), 'reset: moving to HEAD');
    appendFileSync(join(logs, 'HEAD'), reset);
    assert.equal(render(Q + 1140, 2, 0).writes, 1, 'only the anchor moved: still worth a write, or the window is read again');
    assert.equal(render(Q + 1200, 2, 0).writes, 0);
    const saved = readFileSync(file, 'utf8');
    const off = render(Q + 1800, 50, 0, { persist: false });
    assert.equal(off.writes, 0, 'persist=false');
    assert.deepEqual(off.hist!.buckets.at(-1), [1992068, 50, 50, 0, 0], 'but the step is drawn');
    assert.equal(readFileSync(file, 'utf8'), saved);
    assert.deepEqual(JSON.parse(saved), {
      v: 1, root: normRoot(d), branch: 'main', log: { size: Buffer.byteLength(L0 + line(h(0), h(1), 'commit: a') + reset), head: h(1) },
      buckets: [[1992066, 10, 9, 1, 0], [1992067, 2, 2, 0, 1]], at: Q + 1140, sessionStart: Q + 10,
    }, 'the session began at the first render, and every write keeps it');
    assert.equal(render(Q + 10, 1, 1, { p: { workspace: { current_dir: d } } }).hist, null, 'no session key: no history');
    const viaPath = render(Q + 10, 1, 1, { p: { transcript_path: join(dir, 't.jsonl'), workspace: { current_dir: d } } });
    assert.notEqual(viaPath.hist, null);
    assert.ok(existsSync(histPath(env.HUNGERBAR_CACHE_DIR, fnv1a(join(dir, 't.jsonl')), d)), 'keyed by fnv1a(transcript_path)');
    const src = diskSources(payload, env, defaults(), Q, [], []);
    assert.equal(src.history(undefined, 'main', 1, 1), null, 'not a repo');
    assert.equal(src.history(findRepo(d)!, null, 1, 1), null, 'no branch');
    assert.equal(statSync(join(env.HUNGERBAR_CACHE_DIR, 'hud')).isDirectory(), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('prune: history files untouched for 7 days and .tmp files older than an hour go; fresh ones stay', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hb-hist-p-'));
  try {
    const hud = join(dir, 'hud');
    mkdirSync(hud, { recursive: true });
    const nowMs = Q * 1000, ago = (ms: number) => new Date(nowMs - ms);
    const old = histPath(dir, 'old', 'd:/a'), fresh = histPath(dir, 'new', 'd:/a'), tmp = old + '.123.abc.tmp', young = fresh + '.9.x.tmp';
    for (const f of [old, fresh, tmp, young]) writeFileSync(f, '{}');
    utimesSync(old, ago(8 * 86_400_000), ago(8 * 86_400_000));
    utimesSync(fresh, ago(6 * 86_400_000), ago(6 * 86_400_000));
    utimesSync(tmp, ago(2 * 3_600_000), ago(2 * 3_600_000));
    utimesSync(young, ago(10 * 60_000), ago(10 * 60_000));
    assert.equal(pruneOld(dir, nowMs), 2);
    assert.deepEqual(readdirSync(hud).sort(), [fresh, young].map((f) => f.slice(hud.length + 1)).sort());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an unreadable logs/HEAD: an anchor nothing continues from; a failing stat: no history this render and no write', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hb-hist-u-'));
  try {
    const p = join(dir, 'HEAD');
    writeFileSync(p, L0);
    const gone = fileLog(p);
    rmSync(p);
    assert.equal(gone.read(0, 10), null);
    assert.deepEqual(step(null, Q, gone).next.log, { size: Buffer.byteLength(L0), head: '' });
    gone.close();
    const gitDir = join(dir, '.git');
    const repo: Repo = { root: dir, gitDir, commonDir: gitDir, head: 'ref: refs/heads/main', branch: 'main', detached: false };
    const after: Array<() => void> = [];
    const hist = diskHistory({ cacheDir: join(dir, 'cache'), sid: 's', repo, branch: 'main', add: 1, del: 1, now: Q, after, persist: true,
      open: () => { throw new Error('EACCES'); } });
    assert.deepEqual([hist, after.length], [null, 0]);
    assert.notEqual(diskHistory({ cacheDir: join(dir, 'cache'), sid: 's', repo, branch: 'main', add: 1, del: 1, now: Q, after, persist: true }), null,
      'a missing logs/HEAD is an empty log, not an error');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sessionStart (0.7.0, the phantoms\' fallback age): the first render\'s now, kept through every step; an old file has none and keeps none', () => {
  const s0 = step(null, Q + 10, L0);
  assert.deepEqual([s0.next.sessionStart, s0.hist.sessionStart], [Q + 10, Q + 10], 'a new file: the session began now');
  let saved: unknown = disk(s0);
  for (const [now, log, branch] of [[Q + 70, L0, 'main'], [Q + 950, L0 + line(h(0), h(1), 'commit: a'), 'main'], [Q + 1000, L0, 'other'], [Q + 3700, '', 'other']] as const) {
    const r = step(saved, now, log, branch);
    assert.deepEqual([r.next.sessionStart, r.hist.sessionStart], [Q + 10, Q + 10], `${now - Q}: kept (a commit, a branch switch, an emptied log)`);
    saved = disk(r);
  }
  // a file written before 0.7.0: no sessionStart, none added, and nothing to write for it
  const old = disk(step(null, Q + 10, L0));
  delete old.sessionStart;
  const r = step(old, Q + 70, L0);
  assert.deepEqual([r.next.sessionStart, r.hist.sessionStart, r.changed, 'sessionStart' in r.next], [undefined, null, false, false]);
  // one that is no whole number from 0 to its `at` is unknown, and the file stays usable (its buckets are kept)
  for (const bad of [-1, Q + 11, 1.5, '1792859410', null, Number.NaN]) {
    const f = { ...disk(step(null, Q + 10, L0, 'main', 7, 1)), sessionStart: bad };
    const x = step(f, Q + 70, L0, 'main', 1, 0);
    assert.deepEqual([x.hist.sessionStart, x.hist.buckets], [null, [[1992066, 8, 7, 1, 0]]], String(bad));
  }
  assert.equal(step({ ...disk(s0), sessionStart: Q + 10 }, Q + 70, L0).hist.sessionStart, Q + 10, 'equal to its at is fine');
  // another root, or a corrupt file, is no file: the session starts again at this render
  assert.equal(stepHistory(disk(s0), { now: Q + 70, root: 'd:/code/other', branch: 'main', add: 0, del: 0 }, memLog(L0)).hist.sessionStart, Q + 70);
  assert.equal(step({ v: 9 }, Q + 70, L0).hist.sessionStart, Q + 70);
});

test('the history file is about 300 bytes and keeps the plan\'s shape', () => {
  const r = step(null, Q + 10, L0 + line(h(0), h(1), 'commit: a'));
  const f: HistFile = r.next;
  assert.deepEqual(Object.keys(f), ['v', 'root', 'branch', 'log', 'buckets', 'at', 'sessionStart']);
  assert.equal(f.sessionStart, Q + 10, 'a new file: the session began at this render (0.7.0)');
  assert.ok(JSON.stringify(f).length < 400);
  const b: Bucket[] = f.buckets;
  assert.deepEqual(b, [[1992066, 12, 10, 2, 0]]);
});
