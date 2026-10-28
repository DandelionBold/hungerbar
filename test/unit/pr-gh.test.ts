// The PR status's data (src/pr/gh.ts, src/pr/cache.ts, SPEC §0.9, 0.7.0) by hand: gh's JSON read down to the HUD's
// facts (the checks summed as gh pr status sums them), what one gh run means, the cache entry read back and its TTLs, and
// how the render tells a GitHub remote from the repo's git config. No process, no network.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { defaults, merge, prEnabled } from '../../src/config.ts';
import { offline } from '../../src/env.ts';
import { githubRemote, onBranch, PR_SHOW_MAX, PR_TTL, PR_TTL_LONG, prFresh, prPath, prShown, prTtl, readPr, readPrEntry, urlHost, type PrEntry } from '../../src/pr/cache.ts';
import { classify, ghCommand, ghEnv, MAX_PR, parsePr, PR_ARGS, resolveGh, rollup, type PrInfo } from '../../src/pr/gh.ts';

const run = (checks: Array<Record<string, unknown>>): unknown => ({ number: 7, state: 'OPEN', isDraft: false, mergeable: 'MERGEABLE', reviewDecision: '', statusCheckRollup: checks });
const cr = (status: string, conclusion = ''): Record<string, unknown> => ({ __typename: 'CheckRun', name: 'build', workflowName: 'CI', status, conclusion });
const sc = (state: string): Record<string, unknown> => ({ __typename: 'StatusContext', context: 'ci/x', state });

test('the command gh runs, its env and its binary (HUNGERBAR_GH, else an absolute PATH entry; a .mjs stub runs under node)', () => {
  assert.deepEqual(PR_ARGS, ['pr', 'view', '--json', 'number,state,isDraft,mergeable,reviewDecision,statusCheckRollup']);
  assert.deepEqual(ghCommand('C:/gh/gh.exe', PR_ARGS), ['C:/gh/gh.exe', [...PR_ARGS]]);
  assert.deepEqual(ghCommand('C:/t/stub.mjs', PR_ARGS), [process.execPath, ['C:/t/stub.mjs', ...PR_ARGS]]);
  const e = ghEnv({ PATH: 'x', GH_TOKEN: 'kept, gh reads it' });
  assert.deepEqual([e.PATH, e.GH_TOKEN, e.GH_PROMPT_DISABLED, e.GH_NO_UPDATE_NOTIFIER, e.GH_NO_EXTENSION_UPDATE_NOTIFIER, e.GH_SPINNER_DISABLED, e.NO_COLOR, e.GIT_TERMINAL_PROMPT],
    ['x', 'kept, gh reads it', '1', '1', '1', '1', '1', '0']);
  assert.equal(resolveGh({ HUNGERBAR_GH: 'C:/t/stub.mjs', PATH: '' }), 'C:/t/stub.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'hb-gh-'));
  try {
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    assert.equal(resolveGh({ PATH: bin }), null, 'none on PATH');
    const file = join(bin, process.platform === 'win32' ? 'gh.exe' : 'gh');
    writeFileSync(file, '');
    assert.equal(resolveGh({ PATH: ['.', 'relative', '', bin].join(process.platform === 'win32' ? ';' : ':') }), file, 'relative and empty entries skipped');
    assert.equal(resolveGh({ Path: bin }), file, 'Windows spells it Path');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the checks summed as gh pr status sums them: a failure wins, then one still running, else passed; none, no mark', () => {
  assert.equal(rollup(undefined), null);
  assert.equal(rollup([]), null);
  assert.equal(rollup([null, 3, 'x']), null, 'nothing that is a check');
  assert.equal(rollup([cr('COMPLETED', 'SUCCESS'), sc('SUCCESS'), cr('COMPLETED', 'SKIPPED'), cr('COMPLETED', 'NEUTRAL')]), 'passed');
  for (const c of ['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE']) assert.equal(rollup([cr('COMPLETED', 'SUCCESS'), cr('COMPLETED', c)]), 'failed', c);
  for (const s of ['FAILURE', 'ERROR']) assert.equal(rollup([sc(s), cr('IN_PROGRESS')]), 'failed', `status ${s} wins over a running check`);
  for (const s of ['QUEUED', 'IN_PROGRESS', 'WAITING', 'PENDING', 'REQUESTED']) assert.equal(rollup([cr('COMPLETED', 'SUCCESS'), cr(s)]), 'running', s);
  for (const s of ['PENDING', 'EXPECTED']) assert.equal(rollup([sc('SUCCESS'), sc(s)]), 'running', `status ${s}`);
  assert.equal(rollup([cr('COMPLETED', 'STALE')]), 'running', 'stale: as gh, still to come');
  assert.equal(rollup([cr('COMPLETED', '')]), 'running', 'completed with no conclusion yet');
  // a status's state wins over status/conclusion fields; a check run reads its conclusion only once completed
  assert.equal(rollup([{ state: 'SUCCESS', status: 'IN_PROGRESS' }]), 'passed');
  assert.equal(rollup([{ status: 'IN_PROGRESS', conclusion: 'FAILURE' }]), 'running');
});

test('gh\'s JSON read down to the HUD\'s facts; anything that is not a PR it describes is none', () => {
  assert.deepEqual(parsePr(run([cr('COMPLETED', 'SUCCESS')])), { n: 7, state: 'open', ci: 'passed', review: null, conflict: false });
  const base = { number: 123, state: 'OPEN', isDraft: false, mergeable: 'MERGEABLE', reviewDecision: '', statusCheckRollup: [] };
  const read = (o: Record<string, unknown>): PrInfo | null => parsePr({ ...base, ...o });
  assert.deepEqual(read({}), { n: 123, state: 'open', ci: null, review: null, conflict: false });
  assert.equal(read({ isDraft: true })!.state, 'draft');
  assert.equal(read({ state: 'MERGED', isDraft: true })!.state, 'merged');
  assert.equal(read({ state: 'CLOSED' })!.state, 'closed');
  assert.equal(read({ reviewDecision: 'APPROVED' })!.review, 'approved');
  assert.equal(read({ reviewDecision: 'CHANGES_REQUESTED' })!.review, 'changes');
  assert.equal(read({ reviewDecision: 'REVIEW_REQUIRED' })!.review, null);
  assert.equal(read({ mergeable: 'CONFLICTING' })!.conflict, true);
  assert.equal(read({ mergeable: 'UNKNOWN' })!.conflict, false);
  assert.equal(read({ statusCheckRollup: null })!.ci, null);
  assert.equal(read({ number: MAX_PR })!.n, MAX_PR);
  for (const bad of [{ number: 0 }, { number: -1 }, { number: 1.5 }, { number: MAX_PR + 1 }, { number: '123' }, { state: 'open' }, { state: 'DRAFT' }, { state: undefined }]) {
    assert.equal(read(bad), null, JSON.stringify(bad));
  }
  for (const v of [null, [], 'x', 7]) assert.equal(parsePr(v), null);
});

test('what one gh run means: ok, none, auth, no-github, and the passing troubles', () => {
  const r = (code: number | null, stdout = '', stderr = '', timedOut = false) => classify({ code, stdout, stderr, timedOut });
  assert.deepEqual(r(0, JSON.stringify(run([]))), { why: 'ok', pr: { n: 7, state: 'open', ci: null, review: null, conflict: false } });
  assert.deepEqual(r(0, '{"number": 7, "state": "WAT"}'), { why: 'parse', pr: null });
  assert.deepEqual(r(0, '{"number": 7, '), { why: 'parse', pr: null });
  assert.deepEqual(r(0, ''), { why: 'parse', pr: null });
  assert.deepEqual(r(1, '', 'no pull requests found for branch "feature/x"\n'), { why: 'none', pr: null });
  assert.deepEqual(r(1, '', 'no open pull requests found for branch "main"\n'), { why: 'none', pr: null });
  assert.deepEqual(r(4, '', 'To get started with GitHub CLI, please run:  gh auth login\n'), { why: 'auth', pr: null });
  assert.deepEqual(r(4, ''), { why: 'auth', pr: null }, 'gh exits 4 when it needs a login');
  assert.deepEqual(r(1, '', 'HTTP 401: Bad credentials (https://api.github.com/graphql)\n'), { why: 'auth', pr: null });
  assert.deepEqual(r(1, '', 'none of the git remotes configured for this repository point to a known GitHub host.\n'), { why: 'no-github', pr: null });
  assert.deepEqual(r(1, '', 'error connecting to api.github.com\n'), { why: 'error', pr: null });
  assert.deepEqual(r(null), { why: 'error', pr: null }, 'it did not start');
  assert.deepEqual(r(null, '', '', true), { why: 'timeout', pr: null });
});

test('the entry read back: sound fields only, this repo and branch only; fresh for 60 s (10 min when gh cannot help); a PR shown for an hour', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hb-prc-'));
  try {
    const root = 'D:\\Work\\Repo\\';
    const pr: PrInfo = { n: 5, state: 'draft', ci: 'running', review: 'changes', conflict: true };
    const e: PrEntry = { v: 1, root: 'd:/work/repo', branch: 'feature/x', at: 1000, prAt: 990, pr, why: 'error' };
    const put = (v: unknown, branch = 'feature/x'): void => {
      mkdirSync(join(dir, 'pr'), { recursive: true });
      writeFileSync(prPath(dir, root, branch), JSON.stringify(v));
    };
    assert.equal(readPrEntry(dir, root, 'feature/x'), null, 'none yet');
    put(e);
    assert.deepEqual(readPrEntry(dir, root, 'feature/x'), e);
    assert.equal(prPath(dir, 'd:/work/repo', 'feature/x'), prPath(dir, root, 'feature/x'), 'the key is the root as gitKey reads it');
    assert.notEqual(prPath(dir, root, 'feature/y'), prPath(dir, root, 'feature/x'));
    put({ ...e, pr: null, why: 'none' });
    assert.deepEqual(readPrEntry(dir, root, 'feature/x'), { ...e, pr: null, why: 'none' });
    for (const bad of [{ v: 2 }, { root: 'd:/other' }, { branch: 'main' }, { at: -1 }, { at: '1000' }, { prAt: 1.5 }, { why: 'maybe' }, { pr: { ...pr, n: 0 } }, { pr: 'x' }]) {
      put({ ...e, ...bad });
      assert.equal(readPrEntry(dir, root, 'feature/x'), null, JSON.stringify(bad));
    }
    put('not an object');
    assert.equal(readPrEntry(dir, root, 'feature/x'), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const pr: PrInfo = { n: 1, state: 'open', ci: null, review: null, conflict: false };
  assert.deepEqual(readPr(pr), pr);
  for (const bad of [{ state: 'draft?' }, { ci: 'done' }, { review: 'ok' }, { conflict: 0 }, { n: MAX_PR + 1 }]) assert.equal(readPr({ ...pr, ...bad }), null, JSON.stringify(bad));
  for (const v of [null, [], 3]) assert.equal(readPr(v), null);

  assert.deepEqual([PR_TTL, PR_TTL_LONG, PR_SHOW_MAX], [60, 600, 3600]);
  for (const why of ['ok', 'none', 'error', 'timeout', 'parse'] as const) assert.equal(prTtl(why), 60, why);
  for (const why of ['no-gh', 'auth', 'no-github'] as const) assert.equal(prTtl(why), 600, why);
  const e: PrEntry = { v: 1, root: 'r', branch: 'b', at: 1000, prAt: 1000, pr, why: 'ok' };
  assert.deepEqual([999, 1000, 1059, 1060].map((n) => prFresh(e, n)), [false, true, true, false], 'a clock that went back is stale too');
  assert.deepEqual([1599, 1600].map((n) => prFresh({ ...e, pr: null, why: 'auth' }, n)), [true, false]);
  assert.deepEqual([999, 1000, 4599, 4600].map((n) => prShown(e, n)), [null, pr, pr, null]);
  assert.equal(prShown(null, 1000), null);
  assert.equal(prShown({ ...e, pr: null }, 1000), null);
});

test('a GitHub remote, from the repo\'s git config: github.com, an ssh alias, GitHub Enterprise, *.ghe.com or GH_HOST', () => {
  assert.equal(urlHost('https://github.com/steve/hungerbar.git'), 'github.com');
  assert.equal(urlHost('ssh://git@GitHub.com:22/steve/x'), 'github.com');
  assert.equal(urlHost('https://user:pw@ghe.example.com/x'), 'ghe.example.com');
  assert.equal(urlHost('git@github-work:steve/x.git'), 'github-work');
  assert.equal(urlHost('github.com:steve/x'), 'github.com');
  for (const path of ['/srv/x.git', '../bare', 'C:\\repos\\bare', 'C:/repos/bare', 'file:///c/x', '  ']) assert.equal(urlHost(path), null, path);
  const dir = mkdtempSync(join(tmpdir(), 'hb-remote-'));
  try {
    const has = (config: string | null, env: Record<string, string> = {}): boolean => {
      if (config === null) rmSync(join(dir, 'config'), { force: true });
      else writeFileSync(join(dir, 'config'), config);
      return githubRemote(dir, env);
    };
    assert.equal(has(null), false, 'no config');
    assert.equal(has('[core]\n\tbare = false\n'), false, 'no remote');
    assert.equal(has('[remote "origin"]\n\turl = https://github.com/steve/x.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n'), true);
    assert.equal(has('[remote "origin"]\r\n\turl = git@github-work:steve/x.git\r\n'), true, 'an ssh alias, CRLF');
    assert.equal(has('[remote "origin"]\n\turl = https://gitlab.com/steve/x.git\n'), false);
    assert.equal(has('[remote "origin"]\n\turl = https://gitlab.com/steve/x.git\n\tpushurl = git@github.com:steve/x.git\n'), true, 'a pushurl');
    assert.equal(has('[remote "a"]\n\turl = /srv/a.git\n[remote "b"]\n\tURL = "https://GITHUB.COM/k/x"\n'), true, 'the second remote, any case, quoted');
    assert.equal(has('[remote "origin"]\n\turl = https://acme.ghe.com/k/x\n'), true);
    assert.equal(has('[remote "origin"]\n\turl = https://code.acme.io/k/x\n'), false);
    assert.equal(has('[remote "origin"]\n\turl = https://code.acme.io/k/x\n', { GH_HOST: 'Code.Acme.io' }), true, 'GH_HOST');
    assert.equal(has('[url "https://github.com/"]\n\tinsteadOf = gh:\n[remote "origin"]\n\turl = /srv/x\n'), false, 'a url outside a remote section is not a remote');
    assert.equal(has('[remote "origin"]\n\turl = https://github.com/k/x\n' + '#'.repeat(70000)), false, 'a config over 64 KiB is not read');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a PR is looked for only while HEAD is on a local branch: not detached, not another ref', () => {
  assert.equal(onBranch({ head: 'ref: refs/heads/feature/x', detached: false }), true);
  assert.equal(onBranch({ head: 'ref:  refs/heads/main', detached: false }), true);
  assert.equal(onBranch({ head: 'a'.repeat(40), detached: true }), false);
  assert.equal(onBranch({ head: 'ref: refs/remotes/origin/main', detached: false }), false, 'HEAD on a remote-tracking ref');
  assert.equal(onBranch({ head: 'ref: refs/heads/', detached: false }), false);
});

test('hud.pr: off unless exactly "on"; the PR status is off with non-essential traffic off, whatever the file says', () => {
  assert.equal(defaults().hud.pr, 'off');
  for (const [v, want] of [['on', 'on'], ['off', 'off'], [true, 'off'], ['ON', 'off'], [1, 'off'], [undefined, 'off']] as const) assert.equal(merge({ hud: { pr: v } }).hud.pr, want, String(v));
  const on = merge({ hud: { pr: 'on' } });
  assert.equal(prEnabled(on, {}), true);
  assert.equal(prEnabled(defaults(), {}), false);
  for (const env of [{ CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }, { HUNGERBAR_OFFLINE: '1' }, { HUNGERBAR_OFFLINE: 'true' }]) {
    assert.equal(offline(env), true);
    assert.equal(prEnabled(on, env), false, JSON.stringify(env));
  }
  assert.equal(offline({ HUNGERBAR_OFFLINE: '0', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '' }), false);
});
