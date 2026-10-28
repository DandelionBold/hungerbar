import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { defaults } from '../../src/config.ts';
import { liveLimits, resolveLimits, view } from '../../src/limits.ts';
import type { Payload } from '../../src/payload.ts';
import { collect, type Sources } from '../../src/state.ts';
import type { TxSummary } from '../../src/transcript.ts';
import { diskSources } from '../../src/render.ts';
import { CAP } from '../../src/sanitize.ts';
import { parseBody } from '../../src/usage/refresh.ts';

const NOW = 1792859460;

test('glitch rule: every present window at 0 with no reset means absent', () => {
  assert.deepEqual(liveLimits({ rate_limits: { five_hour: { used_percentage: 0 }, seven_day: { used_percentage: 0, resets_at: null } } }), { h5: null, week: null });
  assert.deepEqual(liveLimits({ rate_limits: { five_hour: { used_percentage: 0 } } }), { h5: null, week: null });
  const real = liveLimits({ rate_limits: { five_hour: { used_percentage: 0, resets_at: NOW + 60 }, seven_day: { used_percentage: 0 } } });
  assert.equal(real.h5?.pct, 0);
  assert.equal(real.week?.pct, 0);
  assert.equal(liveLimits({ rate_limits: { five_hour: { used_percentage: '12.5', resets_at: String(NOW) } } }).h5?.pct, 12.5);
});

test('last-known view: dimmed while it lasts, ~0% after the reset', () => {
  assert.deepEqual(view({ pct: 86.1, resets_at: NOW + 100 }, false, NOW), { pct: 86, left: 100, dim: true });
  assert.deepEqual(view({ pct: 86.1, resets_at: NOW - 1 }, false, NOW), { pct: 0, left: null, dim: true });
  assert.deepEqual(view({ pct: 2.4, resets_at: NOW + 17340 }, true, NOW), { pct: 2, left: 17340, dim: false });
  assert.equal(view(null, true, NOW), null);
});

test('limits.json is written only when a value changes', () => {
  const acct = mkdtempSync(join(tmpdir(), 'hb-lim-'));
  try {
    const p: Payload = { rate_limits: { five_hour: { used_percentage: 2.4, resets_at: NOW + 60 }, seven_day: { used_percentage: 86.1, resets_at: NOW + 600 } } };
    resolveLimits(p, acct, NOW, true);
    const file = join(acct, 'limits.json');
    const first = statSync(file).mtimeMs;
    const firstText = readFileSync(file, 'utf8');
    resolveLimits(p, acct, NOW + 10, true);
    assert.equal(readFileSync(file, 'utf8'), firstText, 'same values: not rewritten');
    assert.equal(statSync(file).mtimeMs, first);
    resolveLimits({ rate_limits: { five_hour: { used_percentage: 3, resets_at: NOW + 60 } } }, acct, NOW + 20, true);
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepEqual(saved.five_hour, { pct: 3, resets_at: NOW + 60 });
    assert.deepEqual(saved.seven_day, { pct: 86.1, resets_at: NOW + 600 }, 'the missing window keeps its last-known value');
    const fallback = resolveLimits({}, acct, NOW + 30, true);
    assert.equal(fallback.week?.dim, true);
    assert.equal(fallback.week?.pct, 86);
  } finally {
    rmSync(acct, { recursive: true, force: true });
  }
});

function sources(tx: TxSummary | null): Sources & { txReads: number } {
  const s = {
    txReads: 0,
    git: () => ({ isRepo: false, branch: null, added: null, removed: null }),
    limits: () => ({ h5: null, week: null }),
    usage: () => null,
    transcript: () => {
      s.txReads++;
      return tx;
    },
    counts: () => ({ turns: 0, compactions: 0 }),
    history: () => null,
  };
  return s;
}

const tx = (level: string, model: string): TxSummary => ({ hitRatio: null, lastCached: null, lastUsage: null, lastModel: model, lastEffort: { level, model }, turns: 0, compactions: 0, lastAt: null, running: false, needsWorker: false });

test('effort chain: stdin, then the transcript for the same model, then the env; settings.json is never read', () => {
  const cfg = defaults();
  const p: Payload = { model: { id: 'claude-opus-5-5[1m]', display_name: 'Opus 5.5 (1M context)' }, prompt_cache: { caching_observed: false }, context_window: { used_percentage: 1, current_usage: { input_tokens: 1 } } };
  assert.equal(collect({ ...p, effort: { level: 'high' } }, NOW, cfg, {}, sources(tx('low', 'claude-opus-5-5')), false).effort, 'high');
  assert.equal(collect(p, NOW, cfg, {}, sources(tx('xhigh', 'claude-opus-5-5')), false).effort, 'xhigh');
  assert.equal(collect(p, NOW, cfg, { CLAUDE_CODE_EFFORT_LEVEL: 'max' }, sources(tx('low', 'claude-sonnet-5-5')), false).effort, 'max');
  assert.equal(collect(p, NOW, cfg, {}, sources(null), false).effort, null);
});

test('the transcript is not opened when stdin has everything', () => {
  const s = sources(tx('low', 'x'));
  collect({
    model: { id: 'claude-opus-5-5', display_name: 'Opus 5.5' }, effort: { level: 'high' },
    context_window: { used_percentage: 8, current_usage: { input_tokens: 10 } },
    prompt_cache: { caching_observed: true, warm: true, expires_at: NOW + 10, hit_ratio: 0.5 },
  }, NOW, defaults(), {}, s, false);
  assert.equal(s.txReads, 0);
});

test('model fallbacks: id, then the transcript, then "Claude"', () => {
  const cfg = defaults();
  assert.equal(collect({ model: { id: 'claude-opus-5-5[1m]' } }, NOW, cfg, {}, sources(null), false).model, 'opus-5-5');
  assert.equal(collect({}, NOW, cfg, {}, sources(tx('low', 'claude-sonnet-5-5')), false).model, 'sonnet-5-5');
  assert.equal(collect({}, NOW, cfg, {}, sources(null), false).model, 'Claude');
  assert.equal(collect({ model: 'Opus 5.5 (1M context)' }, NOW, cfg, {}, sources(null), false).model, 'Opus 5.5');
});

test('usage API: weekly_scoped entries and the placeholder rule', () => {
  const r = parseBody({
    extra_usage: { is_enabled: true, used_credits: 420, monthly_limit: 5000, currency: 'USD' },
    limits: [
      { kind: 'weekly_scoped', percent: 100, resets_at: '2026-10-27T03:00:00Z', scope: { model: { display_name: 'Fable' } } },
      { kind: 'weekly_scoped', percent: 0, resets_at: null, scope: { model: { display_name: 'Sonnet' } } },
      { kind: 'weekly_scoped', percent: 50, resets_at: null, scope: null },
      { kind: 'five_hour', percent: 5 },
    ],
  });
  assert.deepEqual(r.extra, { enabled: true, usedCents: 420, limitCents: 5000, currency: 'USD' });
  assert.deepEqual(r.scoped.map((s) => [s.name, s.pct]), [['Fable', 100], ['Sonnet', 0]]);
  assert.equal(r.scoped[0]!.resets_at, Date.parse('2026-10-27T03:00:00Z') / 1000);
  assert.equal(r.scoped[1]!.resets_at, null);
  assert.deepEqual(parseBody({}).extra, null);
  assert.equal(parseBody({ extra_usage: { is_enabled: false } }).extra?.enabled, false);
});

test('the HUD fields: branchFull and cwdFull keep their ends, classic branch and cwd are unchanged', () => {
  const cfg = defaults();
  const repo = (branch: string | null): Sources => ({ ...sources(null), git: () => ({ isRepo: true, branch, added: 1, removed: 2 }) });
  const at = (p: Payload, src: Sources = sources(null)) => collect(p, NOW, cfg, {}, src, false);

  const out = at({ workspace: { current_dir: 'D:\\webapp\\notes' }, cwd: 'C:\\elsewhere', worktree: { branch: 'wt' } });
  assert.equal(out.branchFull, null, 'outside a repo, even with a worktree branch on stdin');
  assert.equal(out.cwdFull, 'D:/webapp/notes', 'workspace.current_dir first, in slash form');
  assert.equal(at({ cwd: 'C:\\a\\b' }).cwdFull, 'C:/a/b');

  assert.equal(at({}, repo('main')).branchFull, 'main');
  assert.equal(at({ worktree: { branch: 'feature/wt' } }, repo('main')).branchFull, 'feature/wt', 'the stdin worktree branch wins');
  assert.equal(at({ worktree: { branch: '  ' } }, repo('a1b2c3d')).branchFull, 'a1b2c3d', 'a blank one does not; a detached sha7 stays');
  assert.equal(at({}, repo('null')).branchFull, 'null', 'no placeholder guard on a branch: git allows the name');
  assert.equal(at({}, repo(null)).branchFull, null);
  assert.equal(at({}, repo('\x1b[31mfe\u202eat\x07\x1b]8;;http://x\x07ure\x1b]8;;\x07')).branchFull, 'feature', 'escapes, links, controls and bidi marks go');

  const long = Array.from({ length: 300 }, (_, i) => String.fromCodePoint(0x4e00 + i)).join('');
  const s = at({ worktree: { branch: long } }, repo('main'));
  assert.equal(Array.from(s.branchFull!).length, CAP.branchFull);
  assert.ok(s.branchFull!.startsWith('…') && long.endsWith(s.branchFull!.slice(1)), 'the end is kept');
  assert.equal(s.git.branch, Array.from(long).slice(0, CAP.branch).join(''), 'classic still shows the start, cut at 64');

  const deep = 'D:/' + Array.from({ length: 120 }, (_, i) => `dir${i}`).join('/');
  const d = at({ cwd: deep });
  assert.equal(Array.from(d.cwdFull).length, CAP.cwdFull);
  assert.ok(d.cwdFull.startsWith('…') && deep.endsWith(d.cwdFull.slice(1)));
  assert.equal(Array.from(d.cwd).length, CAP.path, 'classic cwd keeps its own cap');
  assert.equal(at({ cwd: deep.slice(0, 512) }).cwdFull, deep.slice(0, 512), 'exactly 512 code points: not cut');
});

test('diskSources: GitView.repo carries the repo read from disk, in every git mode; outside a repo there is none', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hb-repo-'));
  try {
    mkdirSync(join(dir, 'r', '.git'), { recursive: true });
    writeFileSync(join(dir, 'r', '.git', 'HEAD'), 'ref: refs/heads/hotbar\n');
    mkdirSync(join(dir, 'plain'));
    const env = { HUNGERBAR_CACHE_DIR: join(dir, 'cache'), GIT_CEILING_DIRECTORIES: dir };
    for (const mode of ['swr', 'off'] as const) {
      const cfg = defaults();
      cfg.git.mode = mode;
      const g = diskSources({}, env, cfg, NOW, []).git(join(dir, 'r'));
      assert.equal(g.branch, 'hotbar');
      assert.equal(g.repo?.gitDir, join(dir, 'r', '.git'), mode);
      assert.equal(g.repo?.root, join(dir, 'r'));
    }
    assert.equal(diskSources({}, env, defaults(), NOW, []).git(join(dir, 'plain')).repo, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
