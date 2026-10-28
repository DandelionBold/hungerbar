// The HUD's adapter (src/hud/adapter.ts, plan §5) and the look switch in renderPayload (plan §2, §9): every mapping from
// Hungerbar's State to the engine's state, the placeholder guard (model, effort, version, folder; never the branch), the
// engine-sized caps on branch and folder (the end kept), the scoped reset rule; then the render: the gate picks the HUD
// or classic byte for byte, a HUD path that throws gives classic plus its stack on stderr (and drops its history
// write), classic never asks for the HUD's counts or history, and the history write waits on `after`.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Config } from '../../src/config.ts';
import type { Env } from '../../src/env.ts';
import { adapt, guard, PLACEHOLDER, type HudState } from '../../src/hud/adapter.ts';
import { renderHud } from '../../src/hud/fable.ts';
import { frameHud } from '../../src/hud/frame.ts';
import { fromState } from '../../src/hud/input.ts';
import { encode } from '../../src/hud/look.ts';
import type { Payload } from '../../src/payload.ts';
import { diskSources, renderPayload } from '../../src/render.ts';
import { collect, type Sources, type State } from '../../src/state.ts';
import { plain, STATES } from '../hud/ref.ts';
import { plainDefaults } from '../plain-config.ts';

const ST = (o: Partial<State> = {}): State => ({
  now: 1000, model: 'Opus 5.5', effort: 'high', ctx: { pct: 8, tokens: 81000, size: 1_000_000, dim: false },
  git: { isRepo: true, branch: 'main', added: 1208, removed: 279 }, branchFull: 'main', cwd: 'D:/webapp', cwdFull: 'D:/webapp',
  h5: { pct: 2, left: 17340, dim: false }, week: { pct: 82, left: 345540, dim: false },
  cache: { hit: 98, state: 'warm', left: 252, ttl: '5m', dim: false }, extra: { used: 0, limit: 50, currency: 'USD', pct: 0 },
  scoped: [], version: '2.1.306', cfgError: false, ...o,
});
const P: Payload = { cost: { total_cost_usd: 3.12 } };
const C42 = { turns: 42, compactions: 0 };
const text = (lines: { t: string }[][]): string => lines.map((l) => l.map((s) => s.t).join('')).join('\n');

const srcOf = (o: Partial<Sources> = {}): Sources => ({
  git: () => ({ isRepo: false, branch: null, added: null, removed: null }),
  limits: () => ({ h5: null, week: null }),
  usage: () => null,
  transcript: () => null,
  counts: () => ({ turns: 0, compactions: 0 }),
  history: () => null,
  ...o,
});
const hudCfg = (o: Partial<Config> = {}): Config => ({ ...plainDefaults(), look: 'hud', ...o });

// ---------------------------------------------------------------------------------------------------------------------
// The mapping
// ---------------------------------------------------------------------------------------------------------------------

test("adapt: the reference normal day's State gives hud4-states.json normal, key for key (no hist: the history step adds it)", () => {
  const got = adapt(ST(), P, C42);
  assert.deepEqual(got, { ...plain(STATES.normal), scoped: [] });
  assert.deepEqual(Object.keys(got), [...Object.keys(STATES.normal), 'scoped']);
  assert.equal('hist' in got, false);
});

test('adapt: the 5-hour and weekly windows: used, left (left out when unknown), the 5-hour window; null when absent', () => {
  const a = adapt(ST({ h5: { pct: 93, left: null, dim: true }, week: { pct: 0, left: null, dim: true } }), P, C42);
  assert.deepEqual(a.h5, { used: 93, window: 18000 });
  assert.deepEqual(a.week, { used: 0 });
  assert.equal('left' in a.h5!, false);
  const b = adapt(ST({ h5: null, week: { pct: 50, left: -30, dim: false } }), P, C42);
  assert.equal(b.h5, null);
  assert.deepEqual(b.week, { used: 50, left: -30 }, 'a passed live reset is the engine\'s to clamp');
  assert.deepEqual(fromState(b), { ...fromState({ ...b, week: { used: 50, left: 0 } }) });
});

test('adapt: the prompt cache: null when caching is off; warm/cold/unknown; whole seconds, never below 0; the TTL in seconds', () => {
  const c = (cache: State['cache']): HudState['cache'] => adapt(ST({ cache }), P, C42).cache;
  assert.equal(c(null), null);
  assert.deepEqual(c({ hit: 91, state: 'cold', left: -60, ttl: '5m', dim: false }), { hit: 91, warm: false, left: 0, ttl: 300 });
  assert.deepEqual(c({ hit: null, state: null, left: 0, ttl: null, dim: false }), { hit: null, warm: null, left: 0, ttl: 300 });
  assert.deepEqual(c({ hit: 50, state: 'warm', left: 1799.9, ttl: '1h', dim: false }), { hit: 50, warm: true, left: 1799, ttl: 3600 });
  assert.deepEqual(c({ hit: 0, state: 'warm', left: 12, ttl: '15m', dim: true }), { hit: 0, warm: true, left: 12, ttl: 300 }, 'the transcript fallback: no ~');
});

test('adapt: extra credits, cost, counts and the diff', () => {
  assert.equal(adapt(ST({ extra: null }), P, C42).extra, null);
  assert.deepEqual(adapt(ST({ extra: { used: 4.2, limit: null, currency: 'EUR', pct: null } }), P, C42).extra, { used: 4.2, limit: null });
  const cost = (p: unknown): number => adapt(ST(), p as Payload, C42).cost;
  assert.equal(cost({ cost: { total_cost_usd: 41.9 } }), 41.9);
  assert.equal(cost({ cost: { total_cost_usd: ' 18.4 ' } }), 18.4, 'a numeric string, as payload.num reads it');
  for (const p of [{}, { cost: null }, { cost: 'x' }, { cost: 7 }, { cost: {} }, { cost: { total_cost_usd: null } }, { cost: { total_cost_usd: 'abc' } }, { cost: { total_cost_usd: [] } }]) {
    assert.equal(cost(p), 0, JSON.stringify(p));
  }
  assert.deepEqual([adapt(ST(), P, { turns: 7, compactions: 3 }).turns, adapt(ST(), P, { turns: 7, compactions: 3 }).compactions], [7, 3]);
  const none = adapt(ST({ git: { isRepo: true, branch: 'main', added: null, removed: null } }), P, C42);
  assert.deepEqual([none.add, none.del], [0, 0], 'no diff yet (or git.mode off): 0');
});

test('adapt: the branch is null outside a repo and never guarded; the engine reads an empty one as HEAD', () => {
  assert.equal(adapt(ST({ git: { isRepo: false, branch: null, added: null, removed: null }, branchFull: 'stale' }), P, C42).branch, null);
  for (const b of ['None', 'null', 'NaN', 'nil', 'Infinity']) {
    const a = adapt(ST({ branchFull: b }), P, C42);
    assert.equal(a.branch, b);
    assert.equal(fromState(a).git?.branch, b, `git allows ${b} as a branch name`);
  }
  assert.equal(fromState(adapt(ST({ branchFull: '' }), P, C42)).git?.branch, 'HEAD');
});

test('placeholder guard: None, null, undefined, NaN, ±inf, Infinity and nil (any case, blank ends) are empty; nothing else is', () => {
  const hit = ['None', 'none', 'NULL', 'undefined', 'NaN', 'nan', 'inf', '+inf', '-INF', 'Infinity', '-Infinity', '+infinity', 'nil', 'Nil',
    '  None  ', '\u200bnil', '\tnull\n', '\x1b[31mNone\x1b[0m'];
  const miss = ['Nonesuch', 'nil 2', 'Infinite', 'nan0', 'none.', 'n/a', '0', '', 'Opus 5.5', 'infinityx', 'Null Pointer'];
  for (const v of hit) assert.equal(guard(v), '', JSON.stringify(v));
  for (const v of miss) assert.equal(guard(v), v, JSON.stringify(v));
  assert.equal(PLACEHOLDER.source, '^(?:none|null|undefined|nan|[+-]?inf(?:inity)?|nil)$');
  const a = adapt(ST({ model: 'None', effort: 'Infinity', cwdFull: 'None', version: 'nil' }), P, C42);
  assert.deepEqual([a.model, a.effort, a.cwd, a.ver], ['', '', '', '']);
  assert.equal(adapt(ST({ effort: null, version: null }), P, C42).effort, '');
  assert.equal(adapt(ST({ effort: null, version: null }), P, C42).ver, '');
});

test('placeholder guard through the engine: round 4 issues 1-3 and 7 (None Efficiency, Efficiency Infin…, ⌂ None, vNone) are gone', () => {
  const before = text(renderHud({ ...STATES.normal, model: 'None', cwd: 'None', ver: 'None' }, 'off'));
  assert.match(before, /^None Efficiency III/);
  assert.match(text(renderHud({ ...STATES.normal, effort: 'Infinity' }, 'off')), /Efficiency Infin…/);
  assert.match(before, /⌂ None/);
  assert.match(before, /vNone/);
  const after = text(renderHud(adapt(ST({ model: 'None', effort: 'nil', cwdFull: 'None', version: 'None' }), P, C42), 'off'));
  assert.match(after, /^Claude\s/);
  assert.doesNotMatch(after, /Efficiency|⌂|None|nil/);
  assert.match(after, /v\?/);
});

test('branch and folder: escapes and controls stripped, capped at the engine\'s own bounds with the end kept, so the engine never cuts again', () => {
  const branch = '\x1b[31m' + 'b'.repeat(300) + '\u202e/tail';
  const dir = 'C:\\' + 'a'.repeat(600) + '\\end';
  const p: Payload = { workspace: { current_dir: dir }, worktree: { branch }, model: { display_name: 'Opus 5.5' } };
  const st = collect(p, 1000, plainDefaults(), {}, srcOf({ git: () => ({ isRepo: true, branch: 'x', added: 1, removed: 2 }) }), false);
  const a = adapt(st, p, C42);
  const cps = (s: string | null): string[] => Array.from(s ?? '');
  assert.equal(cps(a.branch).length, 256);
  assert.match(a.branch!, /^…b+\/tail$/);
  assert.equal(cps(a.cwd).length, 512);
  assert.match(a.cwd, /^…a+\/end$/);
  const sit = fromState(a);
  assert.equal(sit.git?.branch, a.branch, 'the engine keeps the branch whole');
  assert.equal(sit.cwd, a.cwd, 'the engine keeps the folder whole');
  assert.equal(st.git.branch, 'b'.repeat(64), 'classic keeps its own 64-character branch');
});

test('scoped: a limit past its reset is a full week with no clock until the next fetch; an unknown reset stays unknown', () => {
  const a = adapt(ST({ scoped: [{ name: 'Fable', pct: 35, left: 345600 }, { name: 'Sonnet', pct: 90, left: 0 }, { name: 'Haiku', pct: 50, left: -5 },
    { name: 'X', pct: 20, left: null }] }), P, C42);
  assert.deepEqual(a.scoped, [{ name: 'Fable', used: 35, left: 345600 }, { name: 'Sonnet', used: 0, left: null }, { name: 'Haiku', used: 0, left: null },
    { name: 'X', used: 20, left: null }]);
  assert.deepEqual(fromState(a).scoped.map((s) => [s.name, s.left, s.reset]), [['Fable', 65, 5760], ['Sonnet', 100, null], ['Haiku', 100, null], ['X', 80, null]]);
  // through collect: usage.json's resets_at has passed (and scopedWeekly on)
  const usage = { v: 1 as const, at: 900, extra: null, scoped: [{ name: 'Fable', pct: 100, resets_at: 999 }], lockUntil: 0 };
  const cfg = { ...plainDefaults(), network: { ...plainDefaults().network, scopedWeekly: true } };
  const st = collect({}, 1000, cfg, {}, srcOf({ usage: () => usage }), false);
  assert.deepEqual(adapt(st, {}, C42).scoped, [{ name: 'Fable', used: 0, left: null }]);
  assert.deepEqual(adapt(collect({}, 1000, plainDefaults(), {}, srcOf({ usage: () => usage }), false), {}, C42).scoped, [], 'scopedWeekly off: none');
});

// ---------------------------------------------------------------------------------------------------------------------
// The look switch in renderPayload
// ---------------------------------------------------------------------------------------------------------------------

const PAYLOAD = JSON.stringify({ model: { display_name: 'Opus 5.5' }, effort: { level: 'high' }, cwd: 'D:\\webapp', version: '2.1.306', cost: { total_cost_usd: 1.5 },
  context_window: { context_window_size: 1_000_000, used_percentage: 8 }, rate_limits: { five_hour: { used_percentage: 20, resets_at: 4600 } } });
const fixed = (): Sources => srcOf({
  git: () => ({ isRepo: true, branch: 'main', added: 3, removed: 1 }),
  counts: () => ({ turns: 5, compactions: 1 }),
});

test('look hud with the gate passed: the HUD, its input, lines and framed lines on RenderResult.hud; the same State as classic', () => {
  for (const [env, depth] of [[{ FORCE_COLOR: '3' }, 'truecolor'], [{ FORCE_COLOR: '2' }, '256'], [{ COLUMNS: '84' }, '256']] as const) {
    const r = renderPayload(PAYLOAD, { env, config: hudCfg(), sources: fixed, now: 1000 });
    assert.ok(r.hud, JSON.stringify(env));
    assert.equal(r.text, encode(r.hud.framed, depth, plainDefaults()));
    assert.deepEqual(r.hud.lines, renderHud(r.hud.input, 'off'));
    assert.deepEqual(r.hud.framed, frameHud(r.hud.lines));
    assert.deepEqual([r.hud.input.turns, r.hud.input.cost, r.hud.input.branch, r.hud.input.hist], [5, 1.5, 'main', null]);
    assert.equal(r.model, 'Opus 5.5');
    assert.deepEqual(r.after, []);
  }
});

test('look hud with the gate failing gives classic byte for byte: no colour, 16 colours, ASCII, a narrow known width', () => {
  for (const env of [{ NO_COLOR: '1' }, { FORCE_COLOR: '1' }, { FORCE_COLOR: '3', HUNGERBAR_ASCII: '1' }, { FORCE_COLOR: '3', TERM: 'dumb' },
    { FORCE_COLOR: '3', COLUMNS: '83' }, { FORCE_COLOR: '3', HUNGERBAR_WIDTH: '60' }] as Env[]) {
    const hud = renderPayload(PAYLOAD, { env, config: hudCfg(), sources: fixed, now: 1000 });
    const classic = renderPayload(PAYLOAD, { env, config: plainDefaults(), sources: fixed, now: 1000 });
    assert.equal(hud.hud, undefined, JSON.stringify(env));
    assert.equal(hud.text, classic.text, JSON.stringify(env));
  }
  const classic = renderPayload(PAYLOAD, { env: { FORCE_COLOR: '3' }, config: plainDefaults(), sources: fixed, now: 1000 });
  assert.equal(classic.hud, undefined);
  assert.match(classic.text, /Model:/);
});

/** Runs fn with process.stderr.write captured. */
function stderrOf<T>(fn: () => T): [T, string] {
  const real = process.stderr.write.bind(process.stderr);
  let out = '';
  process.stderr.write = ((s: string | Uint8Array): boolean => { out += String(s); return true; }) as typeof process.stderr.write;
  try { return [fn(), out]; } finally { process.stderr.write = real; }
}

test('a HUD path that throws gives classic byte for byte and its stack on stderr; classic never asks for counts or history', () => {
  const boom = (): never => { throw new Error('boom in counts'); };
  const env = { FORCE_COLOR: '3' };
  const classic = renderPayload(PAYLOAD, { env, config: plainDefaults(), sources: () => ({ ...fixed(), counts: boom, history: boom }), now: 1000 });
  const [r, err] = stderrOf(() => renderPayload(PAYLOAD, { env, config: hudCfg(), sources: () => ({ ...fixed(), counts: boom }), now: 1000 }));
  assert.equal(r.text, classic.text);
  assert.equal(r.hud, undefined);
  assert.match(err, /^hungerbar: the HUD failed, classic drawn: Error: boom in counts\n\s+at /);
  assert.ok(err.endsWith('\n'));
  const [, quiet] = stderrOf(() => renderPayload(PAYLOAD, { env, config: plainDefaults(), sources: () => ({ ...fixed(), counts: boom, history: boom }), now: 1000 }));
  assert.equal(quiet, '', 'classic did not touch the HUD sources');
});

/** A fake repo (files only, no git) under a temp dir, with one reflog line. */
function fakeRepo(): { dir: string; repo: string; env: Env; cleanup(): void } {
  const dir = mkdtempSync(join(tmpdir(), 'hb-adapt-'));
  const repo = join(dir, 'repo');
  mkdirSync(join(repo, '.git', 'logs'), { recursive: true });
  writeFileSync(join(repo, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  writeFileSync(join(repo, '.git', 'logs', 'HEAD'), `${'0'.repeat(40)} ${'a'.repeat(40)} K <k@x> 1792859400 +0000\tcommit (initial): base\n`);
  return { dir, repo, env: { HUNGERBAR_CACHE_DIR: join(dir, 'cache'), GIT_CEILING_DIRECTORIES: dir, FORCE_COLOR: '3' }, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('the history write waits on `after`: nothing is written by the render itself; classic never writes a history file', () => {
  const w = fakeRepo();
  try {
    const raw = JSON.stringify({ session_id: 'adapt-1', workspace: { current_dir: w.repo }, model: { display_name: 'Opus 5.5' } });
    const hudDir = join(w.dir, 'cache', 'hud');
    const classic = renderPayload(raw, { env: w.env, config: plainDefaults(), now: 1792859460 });
    assert.deepEqual([classic.after.length, existsSync(hudDir)], [0, false]);
    const r = renderPayload(raw, { env: w.env, config: hudCfg(), now: 1792859460 });
    assert.ok(r.hud?.input.hist, 'a hist in a repo with a session key');
    assert.equal(r.after.length, 1);
    assert.equal(existsSync(hudDir), false, 'not before the hooks run');
    for (const f of r.after) f();
    const files = readdirSync(hudDir);
    assert.equal(files.length, 1);
    assert.equal((JSON.parse(readFileSync(join(hudDir, files[0]!), 'utf8')) as { branch: string }).branch, 'main');
    assert.equal(renderPayload(raw, { env: w.env, config: hudCfg(), now: 1792859470 }).after.length, 0, 'nothing changed: no write');
    assert.ok(r.spawns.some((s) => s[1] === 'git'), 'the git refresher is queued as in classic');
  } finally {
    w.cleanup();
  }
});

test('a HUD path that throws after the history step drops its write', () => {
  const w = fakeRepo();
  try {
    const raw = JSON.stringify({ session_id: 'adapt-2', workspace: { current_dir: w.repo } });
    let queued = -1;
    const sources = (p: Payload, cfg: Config, now: number, after: Array<() => void>): Sources => {
      const real = diskSources(p, w.env, cfg, now, [], after);
      return {
        ...real,
        history: (...a) => {
          const h = real.history(...a);
          queued = after.length;
          return new Proxy(h!, { get: () => { throw new Error('poisoned hist'); } });
        },
      };
    };
    const [r, err] = stderrOf(() => renderPayload(raw, { env: w.env, config: hudCfg(), sources, now: 1792859460 }));
    assert.equal(queued, 1, 'the step had queued its write');
    assert.deepEqual(r.after, [], 'and the failed render dropped it');
    assert.match(err, /poisoned hist/);
    assert.match(r.text, /Model:/);
  } finally {
    w.cleanup();
  }
});
