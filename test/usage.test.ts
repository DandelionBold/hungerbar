// The opt-in usage refresher against a local mock server (SPEC §16.7).
import assert from 'node:assert/strict';
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
import { refreshUsage, usageUrl } from '../src/usage/refresh.ts';
import { listFiles, NOW, tempDir } from './harness.ts';

const TOKEN = 'sk-ant-oat01-TEST-ONLY-never-shown-7f3a';
/** No Keychain item: every refresh here gets this stub, so the real /usr/bin/security never runs, on any OS. */
const NO_KEYCHAIN: KeychainReader = () => null;
const refresh = (env: Record<string, string>): Promise<void> => refreshUsage(env, NO_KEYCHAIN);
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
