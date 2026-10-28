// The HUD's git state data (src/git/status.ts, SPEC §0.9, 0.7.0): the porcelain v2 counter on git's own output, fed in
// every split, the cache entry's `st` as it is read back, and what is in progress, read from a git dir's files.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { entryPath, readEntry } from '../../src/git/cache.ts';
import { parseStatus, readOp, readStatus, statusArgs, statusCounter } from '../../src/git/status.ts';

// git 2.52's output for a merge stopped on a conflict, with a rename, an untracked file and folder, and an upstream
const OUT = [
  '# branch.oid 58891d3c30280614dfeb099a402e9ad3f5cb09a4',
  '# branch.head main',
  '# branch.upstream origin/main',
  '# branch.ab +12 -3',
  '1 .M N... 100644 100644 100644 de980441c3ab03a8c07dda1ad27b8a11f39deb1e de980441c3ab03a8c07dda1ad27b8a11f39deb1e a.txt',
  '1 A. N... 000000 100644 100644 0000000000000000000000000000000000000000 fc1fe7ae6dfa511ea44359ad56c011631503a686 b.txt',
  '2 R. N... 100644 100644 100644 de980441c3ab03a8c07dda1ad27b8a11f39deb1e de980441c3ab03a8c07dda1ad27b8a11f39deb1e R100 new name.txt\told.txt',
  'u UU N... 100644 100644 100644 100644 78981922613b2afb6025042ff6bd878ac1994e85 de980441c3ab03a8c07dda1ad27b8a11f39deb1e 2299c37978265a95cbe835a4b0f0bbf15aad5549 c.txt',
  '? "new\\nline.txt"',
  '? ud/',
  '! ignored.log',
  '',
].join('\n');
const WANT = { changed: 3, untracked: 2, conflicts: 1, ahead: 12, behind: 3 };

test('statusArgs: the diff\'s guards, then status --porcelain=v2 --branch', () => {
  assert.deepEqual(statusArgs('D:/r'), ['--no-optional-locks', '-C', 'D:/r', 'status', '--porcelain=v2', '--branch']);
});

test('the counter: 1 and 2 are changed, u conflicts, ? untracked, ! ignored, # branch.ab ahead and behind', () => {
  assert.deepEqual(parseStatus(OUT), WANT);
  assert.deepEqual(parseStatus(OUT.replace(/\n$/, '')), WANT, 'no final newline');
  assert.deepEqual(parseStatus(OUT.replace(/\n/g, '\r\n')), WANT, 'CRLF');
  assert.deepEqual(parseStatus(''), { changed: 0, untracked: 0, conflicts: 0, ahead: null, behind: null });
  assert.deepEqual(parseStatus('# branch.oid (initial)\n# branch.head main\n'), { changed: 0, untracked: 0, conflicts: 0, ahead: null, behind: null }, 'unborn, no upstream');
  assert.deepEqual(parseStatus('# branch.upstream origin/gone\n'), { changed: 0, untracked: 0, conflicts: 0, ahead: null, behind: null }, 'an upstream that is gone has no ab');
  assert.deepEqual(parseStatus('# branch.ab +0 -0\n'), { changed: 0, untracked: 0, conflicts: 0, ahead: 0, behind: 0 });
  // what is not porcelain v2 counts nothing (the tests' fake git prints a shortstat)
  assert.deepEqual(parseStatus(' 3 files changed, 10 insertions(+)\n1x\n?\nu\n#branch.ab +1 -1\n'), { changed: 0, untracked: 0, conflicts: 0, ahead: null, behind: null });
});

test('the counter is fed as the output streams: every split of the output, one character at a time, and huge lines', () => {
  for (let i = 0; i <= OUT.length; i++) {
    const c = statusCounter();
    c.feed(OUT.slice(0, i));
    c.feed(OUT.slice(i));
    assert.deepEqual(c.done(), WANT, `split at ${i}`);
  }
  const c = statusCounter();
  for (const ch of OUT) c.feed(ch);
  assert.deepEqual(c.done(), WANT, 'a character at a time');
  // a path of a megabyte keeps only the line's start; 100,000 entries are counted, not kept
  const big = statusCounter();
  big.feed('1 .M N... ' + 'x'.repeat(1 << 20) + '\n');
  for (let k = 0; k < 1000; k++) big.feed('? f\n'.repeat(100));
  assert.deepEqual(big.done(), { changed: 1, untracked: 100000, conflicts: 0, ahead: null, behind: null });
  // done() twice gives the same counts; the counter's state is not shared
  const twice = statusCounter();
  twice.feed('u x');
  assert.deepEqual(twice.done(), twice.done());
  assert.equal(twice.done().conflicts, 1);
});

test('readStatus: the entry\'s st only when every field is a whole, safe count (ahead and behind may be null)', () => {
  assert.deepEqual(readStatus(WANT), WANT);
  assert.deepEqual(readStatus({ ...WANT, ahead: null, behind: null, extra: 1 }), { ...WANT, ahead: null, behind: null });
  for (const bad of [null, undefined, 0, 'x', [], {}, { ...WANT, changed: -1 }, { ...WANT, untracked: 1.5 }, { ...WANT, conflicts: '2' },
    { ...WANT, ahead: undefined }, { ...WANT, behind: -3 }, { ...WANT, changed: 2 ** 53 }, { ...WANT, changed: NaN }]) {
    assert.equal(readStatus(bad), null, JSON.stringify(bad));
  }
});

test('readEntry: an st that is there but unsound reads as null; an entry without st keeps none (stale for the HUD)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hb-st-'));
  try {
    const base = { v: 1, at: 1, head: 'ref: refs/heads/main', indexMtimeMs: null, edits: '/', added: 1, removed: 2, files: 1 };
    const put = (e: unknown): void => { mkdirSync(join(dir, 'git'), { recursive: true }); writeFileSync(entryPath(dir, 'D:/r'), JSON.stringify(e)); };
    put(base);
    assert.equal('st' in readEntry(dir, 'D:/r')!, false);
    put({ ...base, st: WANT });
    assert.deepEqual(readEntry(dir, 'D:/r')!.st, WANT);
    put({ ...base, st: null });
    assert.equal(readEntry(dir, 'D:/r')!.st, null);
    put({ ...base, st: { changed: 'x' } });
    assert.equal(readEntry(dir, 'D:/r')!.st, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readOp: rebase (merge and apply backends, not git am), merge, cherry-pick, in git-prompt.sh\'s order; nothing else', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hb-op-'));
  try {
    const g = (name: string): string => join(dir, name);
    const put = (rel: string, text: string): void => { mkdirSync(join(g(rel), '..'), { recursive: true }); writeFileSync(g(rel), text); };
    const fresh = (name: string): string => { mkdirSync(g(name)); return g(name); };
    assert.equal(readOp(fresh('none')), null);
    assert.equal(readOp(g('missing')), null, 'a git dir that is not there');
    put('m/MERGE_HEAD', 'e'.repeat(40) + '\n');
    assert.deepEqual(readOp(g('m')), { kind: 'merge', step: null, total: null, head: null });
    put('p/CHERRY_PICK_HEAD', 'e'.repeat(40) + '\n');
    assert.deepEqual(readOp(g('p')), { kind: 'pick', step: null, total: null, head: null });
    put('mp/MERGE_HEAD', 'x');
    put('mp/CHERRY_PICK_HEAD', 'x');
    assert.equal(readOp(g('mp'))!.kind, 'merge', 'a merge before a cherry-pick');
    put('rm/rebase-merge/msgnum', '2\n');
    put('rm/rebase-merge/end', '5\n');
    put('rm/rebase-merge/head-name', 'refs/heads/feature/x\n');
    put('rm/MERGE_HEAD', 'x');
    assert.deepEqual(readOp(g('rm')), { kind: 'rebase', step: 2, total: 5, head: 'feature/x' }, 'a rebase first (it can stop on a merge)');
    put('ra/rebase-apply/next', ' 3 \r\n');
    put('ra/rebase-apply/last', '4');
    put('ra/rebase-apply/head-name', 'detached HEAD\n');
    put('ra/rebase-apply/rebasing', '');
    assert.deepEqual(readOp(g('ra')), { kind: 'rebase', step: 3, total: 4, head: null }, 'apply backend; a rebase of a detached HEAD');
    put('am/rebase-apply/next', '1');
    put('am/rebase-apply/last', '1');
    put('am/rebase-apply/applying', '');
    assert.equal(readOp(g('am')), null, 'git am is not a rebase');
    // steps that do not read as whole numbers, a head-name that is not a branch, files that are folders or too big
    put('bad/rebase-merge/msgnum', 'two\n');
    put('bad/rebase-merge/end', '5\n');
    put('bad/rebase-merge/head-name', 'refs/tags/v1\n');
    assert.deepEqual(readOp(g('bad')), { kind: 'rebase', step: null, total: null, head: null });
    put('half/rebase-merge/msgnum', '2\n');
    assert.deepEqual(readOp(g('half')), { kind: 'rebase', step: null, total: null, head: null }, 'no end: no step');
    put('huge/rebase-merge/msgnum', '2'.repeat(5000));
    put('huge/rebase-merge/end', '5');
    assert.deepEqual(readOp(g('huge')), { kind: 'rebase', step: null, total: null, head: null });
    mkdirSync(g('dirs/MERGE_HEAD'), { recursive: true });
    mkdirSync(g('dirs/rebase-merge/msgnum'), { recursive: true });
    assert.deepEqual(readOp(g('dirs')), { kind: 'rebase', step: null, total: null, head: null });
    mkdirSync(g('mdir/MERGE_HEAD'), { recursive: true });
    assert.equal(readOp(g('mdir')), null, 'a MERGE_HEAD folder is no merge');
    put('file/rebase-merge', 'not a folder');
    assert.equal(readOp(g('file')), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
