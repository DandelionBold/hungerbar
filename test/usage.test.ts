// The opt-in usage refresher against a local mock server (SPEC §16.7).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { VERSION } from '../src/env.ts';
import { hungry } from '../src/limits.ts';
import { renderPayload } from '../src/render.ts';
import { acctDir } from '../src/store.ts';
import { getToken, keychainService, type KeychainReader } from '../src/usage/creds.ts';
import { readUsage, usageLockPath, usagePath, usageTtl, type UsageFile } from '../src/usage/file.ts';
import { refreshUsage, refreshUsageNow, USAGE_OFF, usageSummary, usageUrl } from '../src/usage/refresh.ts';
import { DIST, listFiles, NOW, runDist, tempDir } from './harness.ts';

const TOKEN = 'sk-ant-oat01-TEST-ONLY-never-shown-7f3a';
/** No Keychain item: every refresh here gets this stub, so the real /usr/bin/security never runs, on any OS. */
const NO_KEYCHAIN: KeychainReader = () => null;
const refresh = (env: Record<string, string>): Promise<unknown> => refreshUsage(env, NO_KEYCHAIN);
let handler: (req: IncomingMessage, res: ServerResponse) => void = (_q, s) => s.end();
const seen: IncomingMessage[] = [];
const server = createServer((req, res) => {
  seen.push(req);
  handler(req, res);
});
let url = '';

before(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/oauth/usage`;
});
after(() => {
  server.closeAllConnections();
  server.close();
});

const BODY = {
  five_hour: { utilization: 5, resets_at: '2026-10-24T21:19:59Z' },
  extra_usage: { is_enabled: true, used_credits: 420, monthly_limit: 5000, utilization: 8.4, currency: 'USD' },
  limits: [{ kind: 'weekly_scoped', percent: 100, resets_at: '2026-10-25T15:59:59Z', scope: { model: { display_name: 'Fable' } } }],
};

function world() {
  const dir = tempDir('hb-usage-');
  const env: Record<string, string> = {
    HUNGERBAR_CACHE_DIR: join(dir, 'cache'), CLAUDE_CONFIG_DIR: join(dir, 'claude'), HUNGERBAR_NOW: String(NOW),
    HUNGERBAR_USAGE_URL: url, HUNGERBAR_USAGE_TIMEOUT_MS: '300', CLAUDE_CODE_OAUTH_TOKEN: TOKEN,
  };
  return { dir, env, acct: acctDir(env), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function reply(status: number, body: string, headers: Record<string, string> = {}): void {
  handler = (_req, res) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(body);
  };
}

test('only a local override URL is honoured', () => {
  assert.equal(usageUrl({ HUNGERBAR_USAGE_URL: 'https://evil.example/x' }), 'https://api.anthropic.com/api/oauth/usage');
  assert.equal(usageUrl({ HUNGERBAR_USAGE_URL: 'http://localhost:9/x' }), 'http://localhost:9/x');
});

test('200: extra and scoped are stored, with honest headers', async () => {
  const w = world();
  try {
    reply(200, JSON.stringify(BODY));
    seen.length = 0;
    await refresh(w.env);
    const u = readUsage(w.acct)!;
    assert.deepEqual(u.extra, { enabled: true, usedCents: 420, limitCents: 5000, currency: 'USD' });
    assert.deepEqual(u.scoped, [{ name: 'Fable', pct: 100, resets_at: Date.parse('2026-10-25T15:59:59Z') / 1000 }]);
    assert.equal(u.lockUntil, 0);
    assert.equal(u.at, NOW);
    const h = seen[0]!.headers;
    assert.equal(h.authorization, `Bearer ${TOKEN}`);
    assert.equal(h['anthropic-beta'], 'oauth-2025-04-20');
    assert.equal(h['user-agent'], `hungerbar/${VERSION}`);
  } finally {
    w.cleanup();
  }
});

test('errors lock the refresher and keep the last digest', async () => {
  const cases: Array<[() => void, number, string]> = [
    [() => reply(401, '{}'), 600, 'auth'],
    [() => reply(403, '{}'), 600, 'auth'],
    [() => reply(429, '{}', { 'retry-after': '120' }), 120, 'rate-limited'],
    [() => reply(429, '{}'), 300, 'rate-limited'],
    [() => reply(503, '{}'), 30, 'http-503'],
    [() => reply(200, '{not json'), 30, 'parse'],
    [() => { handler = () => { /* never answers */ }; }, 30, 'network'],
  ];
  for (const [setup, lock, error] of cases) {
    const w = world();
    try {
      reply(200, JSON.stringify(BODY));
      await refresh(w.env);
      setup();
      await refresh({ ...w.env, HUNGERBAR_NOW: String(NOW + 1000) });
      const u = readUsage(w.acct)!;
      assert.equal(u.lockUntil, NOW + 1000 + lock, `${error}: lock`);
      assert.equal(u.error, error);
      assert.equal(u.extra?.usedCents, 420, `${error}: last digest kept`);
      assert.equal(u.at, NOW, `${error}: at is the last success`);
    } finally {
      w.cleanup();
    }
  }
});

test('no token: a 600 s lock and no request', async () => {
  const w = world();
  try {
    seen.length = 0;
    const env: Record<string, string> = { ...w.env, CLAUDE_CODE_OAUTH_TOKEN: '' };
    mkdirSync(env.CLAUDE_CONFIG_DIR!, { recursive: true });
    writeFileSync(join(env.CLAUDE_CONFIG_DIR!, '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'expired', expiresAt: 1000 } }));
    await refresh(env);
    assert.equal(seen.length, 0);
    assert.equal(readUsage(w.acct)?.error, 'no-credentials');
    assert.equal(readUsage(w.acct)?.lockUntil, NOW + 600);
  } finally {
    w.cleanup();
  }
});

test('the credentials file is used when not expired', async () => {
  const w = world();
  try {
    seen.length = 0;
    reply(200, JSON.stringify(BODY));
    const env: Record<string, string> = { ...w.env, CLAUDE_CODE_OAUTH_TOKEN: '' };
    mkdirSync(env.CLAUDE_CONFIG_DIR!, { recursive: true });
    writeFileSync(join(env.CLAUDE_CONFIG_DIR!, '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: TOKEN, expiresAt: Date.now() + 3_600_000 } }));
    await refresh(env);
    assert.equal(seen[0]?.headers.authorization, `Bearer ${TOKEN}`);
  } finally {
    w.cleanup();
  }
});

test('refreshUsage hands its Keychain reader and platform to getToken: the macOS path runs anywhere, with a stub', async () => {
  const w = world();
  try {
    const env: Record<string, string> = { ...w.env, CLAUDE_CODE_OAUTH_TOKEN: '' };
    const asked: string[] = [];
    const item: KeychainReader = (service) => {
      asked.push(service);
      return JSON.stringify({ claudeAiOauth: { accessToken: TOKEN, expiresAt: Date.now() + 3_600_000 } });
    };
    seen.length = 0;
    reply(200, JSON.stringify(BODY));
    await refreshUsage(env, item, 'darwin');
    assert.deepEqual(asked, [keychainService(env)]);
    assert.equal(seen[0]?.headers.authorization, `Bearer ${TOKEN}`, 'the stub\'s token was sent');
    for (const platform of ['linux', 'win32'] as const) {
      seen.length = 0;
      await refreshUsage({ ...env, HUNGERBAR_NOW: String(NOW + 1000) }, item, platform);
      assert.deepEqual([asked.length, seen.length, readUsage(w.acct)?.error], [1, 0, 'no-credentials'], `${platform}: no Keychain`);
      rmSync(usagePath(w.acct));
    }
  } finally {
    w.cleanup();
  }
});

test("getToken: the variable, then an unexpired .credentials.json, then on macOS only Claude Code's Keychain item (a stub: the real security never runs)", () => {
  const w = world();
  try {
    const dir = w.env.CLAUDE_CONFIG_DIR!, env = { CLAUDE_CONFIG_DIR: dir }, now = Date.now();
    const asked: string[] = [];
    const item = (text: string | null): KeychainReader => (service) => {
      asked.push(service);
      return text;
    };
    const good = JSON.stringify({ claudeAiOauth: { accessToken: TOKEN, expiresAt: now + 3_600_000 } });
    // the variable first: nothing else is asked
    assert.equal(getToken({ ...env, CLAUDE_CODE_OAUTH_TOKEN: ' x ' }, now, 'darwin', item(good)), 'x');
    assert.deepEqual(asked, []);
    // no file: macOS asks for the service name Claude Code uses with this CLAUDE_CONFIG_DIR; elsewhere nothing is asked
    assert.equal(getToken(env, now, 'darwin', item(good)), TOKEN);
    assert.deepEqual(asked, [keychainService(env)]);
    assert.match(asked[0]!, /^Claude Code-credentials-[0-9a-f]{8}$/);
    assert.equal(keychainService({}), 'Claude Code-credentials', 'no CLAUDE_CONFIG_DIR: the plain name');
    for (const platform of ['linux', 'win32'] as const) assert.equal(getToken(env, now, platform, item(good)), null, platform);
    assert.equal(asked.length, 1);
    // an expired item, one that is not JSON, or none: no token
    assert.equal(getToken(env, now, 'darwin', item(JSON.stringify({ claudeAiOauth: { accessToken: TOKEN, expiresAt: now - 1 } }))), null);
    assert.equal(getToken(env, now, 'darwin', item('not json')), null);
    assert.equal(getToken(env, now, 'darwin', item(null)), null);
    // an unexpired file comes before the Keychain
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'from-file', expiresAt: now + 60_000 } }));
    asked.length = 0;
    assert.equal(getToken(env, now, 'darwin', item(good)), 'from-file');
    assert.deepEqual(asked, []);
  } finally {
    w.cleanup();
  }
});

test('offline switches stop the refresher before any request', async () => {
  for (const off of [{ HUNGERBAR_OFFLINE: '1' }, { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }]) {
    const w = world();
    try {
      seen.length = 0;
      await refresh({ ...w.env, ...off });
      assert.equal(seen.length, 0);
      assert.equal(readUsage(w.acct), null);
    } finally {
      w.cleanup();
    }
  }
});

test('render side: refresh only when stale, unlocked and enabled; is_enabled=false hides Extra', async () => {
  const w = world();
  try {
    const payload = JSON.stringify({ model: { display_name: 'Opus 5.5' }, workspace: { current_dir: w.dir } });
    const on = { ...w.env, HUNGERBAR_USAGE_API: '1', NO_COLOR: '1' };
    const spawnsOf = (env: Record<string, string>): string[][] => renderPayload(payload, { env }).spawns.filter((s) => s[1] === 'usage');
    assert.deepEqual(spawnsOf(w.env), [], 'usage API off: nothing');
    assert.deepEqual(spawnsOf(on), [['refresh', 'usage']], 'no usage.json yet');
    reply(200, JSON.stringify(BODY));
    await refresh(w.env);
    assert.deepEqual(spawnsOf(on), [], 'fresh');
    assert.match(renderPayload(payload, { env: on }).text, /Extra: \$4\.20\/\$50/);
    assert.deepEqual(spawnsOf({ ...on, HUNGERBAR_NOW: String(NOW + 181) }), [['refresh', 'usage']], 'stale after 180 s');
    writeFileSync(usageLockPath(w.acct), '');
    assert.deepEqual(spawnsOf({ ...on, HUNGERBAR_NOW: String(NOW + 181) }), [], 'a live lock');
    rmSync(usageLockPath(w.acct));
    reply(200, JSON.stringify({ ...BODY, extra_usage: { is_enabled: false } }));
    await refresh(w.env);
    assert.doesNotMatch(renderPayload(payload, { env: on }).text, /Extra/);
    assert.deepEqual(spawnsOf({ ...on, HUNGERBAR_NOW: String(NOW + 181) }), [], 'extra off: an hour between refreshes');
    assert.deepEqual(spawnsOf({ ...on, HUNGERBAR_NOW: String(NOW + 3601) }), [['refresh', 'usage']]);
    reply(429, '{}', { 'retry-after': '900' });
    await refresh({ ...w.env, HUNGERBAR_NOW: String(NOW + 3601) });
    assert.deepEqual(spawnsOf({ ...on, HUNGERBAR_NOW: String(NOW + 4000) }), [], 'locked by the 429');
  } finally {
    w.cleanup();
  }
});

test('hungry TTL (1.1.0): a limit at 10% left or less asks every ttlSeconds even with extra usage off; idle, an hour', () => {
  const file = (enabled: boolean | null): UsageFile => ({ v: 1, at: NOW, extra: enabled === null ? null : { enabled, usedCents: 0, limitCents: null, currency: 'USD' }, scoped: [], lockUntil: 0 });
  assert.equal(usageTtl(file(false), 180, false, true), 180, 'disabled + hungry');
  assert.equal(usageTtl(file(false), 180, false, false), 3600, 'disabled + idle');
  assert.equal(usageTtl(file(null), 180, false), 3600, 'no extra_usage at all, idle (hungry left out)');
  assert.equal(usageTtl(file(null), 180, false, true), 180, 'no extra_usage at all, hungry');
  for (const h of [true, false]) {
    assert.equal(usageTtl(file(true), 180, false, h), 180, `enabled, hungry ${h}`);
    assert.equal(usageTtl(file(false), 180, true, h), 180, `scopedWeekly, hungry ${h}`);
    assert.equal(usageTtl(null, 180, false, h), 180, `no usage.json yet, hungry ${h}`);
  }
  assert.equal(usageTtl(file(false), 600, false, true), 600, 'hungry is plain ttlSeconds, not 180');
  // hungry: a drawn limit at 90% used or more (10% left or less), live or last known; a refilled or missing one is not
  const v = (pct: number, dim = false) => ({ pct, left: 60, dim });
  assert.equal(hungry({ h5: v(90), week: null }), true);
  assert.equal(hungry({ h5: v(10), week: v(100, true) }), true, 'used up, last known');
  assert.equal(hungry({ h5: v(89), week: v(89) }), false, '11% left');
  assert.equal(hungry({ h5: null, week: null }), false);
  assert.equal(hungry({ h5: { pct: 0, left: null, dim: false }, week: v(50) }), false, 'refilled');
});

test('render side, hungry: with extra usage off, a limit at 10% left or less queues the refresher after ttlSeconds, not an hour', async () => {
  const w = world();
  try {
    const on = { ...w.env, HUNGERBAR_USAGE_API: '1', NO_COLOR: '1' };
    const payload = (used: number): string => JSON.stringify({ model: { display_name: 'Opus 5.5' }, workspace: { current_dir: w.dir },
      rate_limits: { five_hour: { used_percentage: used, resets_at: NOW + 9000 }, seven_day: { used_percentage: 40, resets_at: NOW + 300000 } } });
    const spawnsOf = (used: number, at: number): string[][] =>
      renderPayload(payload(used), { env: { ...on, HUNGERBAR_NOW: String(at) } }).spawns.filter((s) => s[1] === 'usage');
    reply(200, JSON.stringify({ ...BODY, extra_usage: { is_enabled: false } }));
    await refresh(w.env);
    assert.deepEqual(spawnsOf(85, NOW + 181), [], '15% left: an hour between refreshes');
    assert.deepEqual(spawnsOf(90, NOW + 181), [['refresh', 'usage']], '10% left: after 180 s');
    assert.deepEqual(spawnsOf(100, NOW + 181), [['refresh', 'usage']], 'used up');
    assert.deepEqual(spawnsOf(95, NOW + 120), [], 'still fresh');
    assert.deepEqual(renderPayload(payload(95), { env: { ...w.env, NO_COLOR: '1', HUNGERBAR_NOW: String(NOW + 181) } }).spawns.filter((s) => s[1] === 'usage'), [], 'usage API off: hungry asks nothing');
  } finally {
    w.cleanup();
  }
});

test('the token never lands in a file, an argv or the output', async () => {
  const w = world();
  try {
    reply(401, '{}');
    await refresh(w.env);
    reply(200, JSON.stringify(BODY));
    await refresh({ ...w.env, HUNGERBAR_NOW: String(NOW + 700) });
    const r = renderPayload(JSON.stringify({ model: { display_name: 'Opus 5.5' } }), { env: { ...w.env, HUNGERBAR_USAGE_API: '1', HUNGERBAR_NOW: String(NOW + 2000) } });
    assert.ok(!r.text.includes(TOKEN));
    assert.ok(!JSON.stringify(r.spawns).includes(TOKEN));
    for (const f of listFiles(w.dir)) assert.ok(!readFileSync(f, 'utf8').includes(TOKEN), `token found in ${f}`);
  } finally {
    w.cleanup();
  }
});

test('HUNGERBAR_CAPTURE (1.1.0): a fetch that worked saves the answer\'s extra_usage and limits only, as the day\'s usage-YYYYMMDD.json', async () => {
  const w = world();
  try {
    const dir = join(w.dir, 'capture'), env = { ...w.env, HUNGERBAR_CAPTURE: dir };
    reply(200, JSON.stringify({ ...BODY, account: { email: 'steve@example.com' } }));
    await refresh(env);
    const file = join(dir, 'usage-20261024.json');
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { extra_usage: BODY.extra_usage, limits: BODY.limits }, 'only the two keys');
    assert.deepEqual(listFiles(dir), [file]);
    // a later answer that day replaces it; one without the keys saves nulls; a failed fetch saves nothing
    reply(200, JSON.stringify({ five_hour: BODY.five_hour }));
    await refresh({ ...env, HUNGERBAR_NOW: String(NOW + 600) });
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { extra_usage: null, limits: null });
    reply(503, JSON.stringify(BODY));
    await refresh({ ...env, HUNGERBAR_NOW: String(NOW + 86400) });
    assert.deepEqual(listFiles(dir), [file], 'no usage-20261025.json');
    for (const f of listFiles(w.dir)) {
      const t = readFileSync(f, 'utf8');
      assert.ok(!t.includes(TOKEN) && !t.includes('steve@example.com') && !t.includes('five_hour'), `nothing else in ${f}`);
    }
    // without HUNGERBAR_CAPTURE nothing is captured
    const v = world();
    try {
      reply(200, JSON.stringify(BODY));
      await refresh(v.env);
      assert.deepEqual(listFiles(v.dir).filter((f) => /usage-\d{8}\.json$/.test(f)), []);
    } finally {
      v.cleanup();
    }
  } finally {
    w.cleanup();
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// 1.1.0: `hungerbar refresh usage` for people
// ---------------------------------------------------------------------------------------------------------------------

/** dist with these args, without blocking this process (the mock server answers from it). */
function runAsync(args: string[], env: Record<string, string>): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, [DIST, ...args], { env, windowsHide: true });
    let stdout = '', stderr = '';
    c.stdout.on('data', (d: Buffer) => { stdout += d.toString('utf8'); });
    c.stderr.on('data', (d: Buffer) => { stderr += d.toString('utf8'); });
    c.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

test('refresh usage: one line, the extra credits left and, with scopedWeekly on, each per-model weekly; fetched whatever the TTL', async () => {
  const w = world();
  try {
    reply(200, JSON.stringify(BODY));
    seen.length = 0;
    const on = { ...w.env, HUNGERBAR_USAGE_API: '1' };
    assert.equal(await refreshUsageNow(on, NO_KEYCHAIN), 'extra credits $45.80 left of $50 (fetched now)');
    assert.equal(await refreshUsageNow(on, NO_KEYCHAIN), 'extra credits $45.80 left of $50 (fetched now)', 'usage.json is fresh: fetched again');
    assert.equal(seen.length, 2);
    mkdirSync(w.env.CLAUDE_CONFIG_DIR!, { recursive: true });
    writeFileSync(join(w.env.CLAUDE_CONFIG_DIR!, 'hungerbar.json'), JSON.stringify({ network: { usageApi: true, scopedWeekly: true } }));
    assert.equal(await refreshUsageNow(w.env, NO_KEYCHAIN), "extra credits $45.80 left of $50; Fable's weekly 0% left (fetched now)");
    // dist: the command prints the line, and help names it
    const d = await runAsync(['refresh', 'usage'], { ...w.env, PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? 'C:\\Windows' });
    assert.deepEqual([d.status, d.stdout, d.stderr], [0, "extra credits $45.80 left of $50; Fable's weekly 0% left (fetched now)\n", '']);
    assert.equal(seen.length, 4);
    assert.ok(runDist('', { PATH: process.env.PATH ?? '' }, ['--help']).stdout.includes('  hungerbar refresh usage        asks the usage API now'), 'help names it');
  } finally {
    w.cleanup();
  }
});

test('refresh usage: the summary line for each answer, every string from the answer sanitized', () => {
  const u = (o: Partial<UsageFile>): UsageFile => ({ v: 1, at: NOW, extra: null, scoped: [], lockUntil: 0, ...o });
  const x = (enabled: boolean, usedCents: number, limitCents: number | null, currency = 'USD') => ({ enabled, usedCents, limitCents, currency });
  for (const [file, scoped, line] of [
    [u({ extra: x(true, 420, 5000) }), false, 'extra credits $45.80 left of $50 (fetched now)'],
    [u({ extra: x(true, 6000, 5000) }), false, 'extra credits $0.00 left of $50 (fetched now)'],
    [u({ extra: x(true, 1250, 5050, 'EUR') }), false, 'extra credits €38.00 left of €50.50 (fetched now)'],
    [u({ extra: x(true, 420, null) }), false, 'extra credits $4.20 used, no monthly limit (fetched now)'],
    [u({ extra: x(false, 0, null) }), false, 'extra usage is off for this account (fetched now)'],
    [u({}), false, 'no extra usage in the answer (fetched now)'],
    [u({ extra: x(false, 0, null) }), true, 'extra usage is off for this account; no per-model weekly limit (fetched now)'],
    [u({ extra: x(false, 0, null), scoped: [{ name: 'Fable', pct: 62.5, resets_at: NOW + 60 }, { name: 'Sonnet', pct: 100, resets_at: NOW - 1 }] }), true,
      "extra usage is off for this account; Fable's weekly 38% left, Sonnet's weekly 100% left (fetched now)"],
    [u({ extra: x(true, 0, 5000, '\x1b[31mXX'), scoped: [{ name: 'Fa\x07ble\u202e', pct: 0, resets_at: null }] }), true, "extra credits XX 50.00 left of XX 50; Fable's weekly 100% left (fetched now)"],
    [u({ error: 'http-503', lockUntil: NOW + 30 }), false, 'usage API: HTTP 503; the next try is in <1m'],
    [u({ error: 'auth', lockUntil: NOW + 600 }), false, 'usage API: the login token was refused; the next try is in 10m'],
    [u({ error: 'no-credentials', lockUntil: NOW + 600 }), false, 'usage API: no Claude login token was found; the next try is in 10m'],
    [u({ error: 'network', lockUntil: NOW + 30 }), false, 'usage API: no answer (network or timeout); the next try is in <1m'],
    [u({ error: 'parse', lockUntil: NOW }), false, 'usage API: the answer was not JSON; the next try is in under a minute'],
    [u({ error: 'rate-limited', lockUntil: NOW + 7200 }), false, 'usage API: rate-limited; the next try is in 2h 0m'],
    [u({ error: '\x1b]8;;x\x07odd', lockUntil: NOW + 30 }), false, 'usage API: odd; the next try is in <1m'],
    [null, true, 'a usage refresh is already running; nothing fetched'],
  ] as const) assert.equal(usageSummary(file, NOW, scoped), line);
});

test('refresh usage respects a 429 lock, fetches past any other lock, and fetches nothing while the usage API or the network is off', async () => {
  const w = world();
  try {
    const on = { ...w.env, HUNGERBAR_USAGE_API: '1' }, at = (dt: number) => ({ ...on, HUNGERBAR_NOW: String(NOW + dt) });
    seen.length = 0;
    reply(429, '{}', { 'retry-after': '600' });
    assert.equal(await refreshUsageNow(on, NO_KEYCHAIN), 'usage API: rate-limited; the next try is in 10m');
    reply(200, JSON.stringify(BODY));
    assert.equal(await refreshUsageNow(at(300), NO_KEYCHAIN), 'usage API: rate-limited; the next try is in 5m (nothing fetched now)');
    assert.equal(seen.length, 1, 'no request while the 429 lasts');
    assert.equal(await refreshUsageNow(at(600), NO_KEYCHAIN), 'extra credits $45.80 left of $50 (fetched now)', 'the lock is over');
    reply(401, '{}');
    assert.equal(await refreshUsageNow(at(700), NO_KEYCHAIN), 'usage API: the login token was refused; the next try is in 10m');
    reply(200, JSON.stringify(BODY));
    assert.equal(await refreshUsageNow(at(701), NO_KEYCHAIN), 'extra credits $45.80 left of $50 (fetched now)', 'a person asks past the auth lock');
    assert.equal(seen.length, 4);
    // another refresh holds the lock
    writeFileSync(usageLockPath(w.acct), '');
    assert.equal(await refreshUsageNow(at(800), NO_KEYCHAIN), 'a usage refresh is already running; nothing fetched');
    rmSync(usageLockPath(w.acct));
    // off: no request, no token read (a Keychain reader that would see it)
    const asked: string[] = [];
    const spy: KeychainReader = (s) => { asked.push(s); return null; };
    assert.equal(await refreshUsageNow({ ...w.env, CLAUDE_CODE_OAUTH_TOKEN: '' }, spy, 'darwin'), USAGE_OFF);
    for (const off of [{ HUNGERBAR_OFFLINE: '1' }, { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }]) {
      assert.match(await refreshUsageNow({ ...on, ...off, CLAUDE_CODE_OAUTH_TOKEN: '' }, spy, 'darwin'), /^non-essential traffic is off here .*; nothing fetched$/);
    }
    assert.deepEqual([seen.length, asked], [4, []]);
  } finally {
    w.cleanup();
  }
});
