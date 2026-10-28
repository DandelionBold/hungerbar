// The opt-in usage refresher against a local mock server (SPEC §16.7).
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { VERSION } from '../src/env.ts';
import { renderPayload } from '../src/render.ts';
import { acctDir } from '../src/store.ts';
import { readUsage, usageLockPath } from '../src/usage/file.ts';
import { refreshUsage, usageUrl } from '../src/usage/refresh.ts';
import { listFiles, NOW } from './harness.ts';

const TOKEN = 'sk-ant-oat01-TEST-ONLY-never-shown-7f3a';
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
  const dir = mkdtempSync(join(tmpdir(), 'hb-usage-'));
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
    await refreshUsage(w.env);
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
      await refreshUsage(w.env);
      setup();
      await refreshUsage({ ...w.env, HUNGERBAR_NOW: String(NOW + 1000) });
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
    await refreshUsage(env);
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
    await refreshUsage(env);
    assert.equal(seen[0]?.headers.authorization, `Bearer ${TOKEN}`);
  } finally {
    w.cleanup();
  }
});

test('offline switches stop the refresher before any request', async () => {
  for (const off of [{ HUNGERBAR_OFFLINE: '1' }, { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }]) {
    const w = world();
    try {
      seen.length = 0;
      await refreshUsage({ ...w.env, ...off });
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
    await refreshUsage(w.env);
    assert.deepEqual(spawnsOf(on), [], 'fresh');
    assert.match(renderPayload(payload, { env: on }).text, /Extra: \$4\.20\/\$50/);
    assert.deepEqual(spawnsOf({ ...on, HUNGERBAR_NOW: String(NOW + 181) }), [['refresh', 'usage']], 'stale after 180 s');
    writeFileSync(usageLockPath(w.acct), '');
    assert.deepEqual(spawnsOf({ ...on, HUNGERBAR_NOW: String(NOW + 181) }), [], 'a live lock');
    rmSync(usageLockPath(w.acct));
    reply(200, JSON.stringify({ ...BODY, extra_usage: { is_enabled: false } }));
    await refreshUsage(w.env);
    assert.doesNotMatch(renderPayload(payload, { env: on }).text, /Extra/);
    assert.deepEqual(spawnsOf({ ...on, HUNGERBAR_NOW: String(NOW + 181) }), [], 'extra off: an hour between refreshes');
    assert.deepEqual(spawnsOf({ ...on, HUNGERBAR_NOW: String(NOW + 3601) }), [['refresh', 'usage']]);
    reply(429, '{}', { 'retry-after': '900' });
    await refreshUsage({ ...w.env, HUNGERBAR_NOW: String(NOW + 3601) });
    assert.deepEqual(spawnsOf({ ...on, HUNGERBAR_NOW: String(NOW + 4000) }), [], 'locked by the 429');
  } finally {
    w.cleanup();
  }
});

test('the token never lands in a file, an argv or the output', async () => {
  const w = world();
  try {
    reply(401, '{}');
    await refreshUsage(w.env);
    reply(200, JSON.stringify(BODY));
    await refreshUsage({ ...w.env, HUNGERBAR_NOW: String(NOW + 700) });
    const r = renderPayload(JSON.stringify({ model: { display_name: 'Opus 5.5' } }), { env: { ...w.env, HUNGERBAR_USAGE_API: '1', HUNGERBAR_NOW: String(NOW + 2000) } });
    assert.ok(!r.text.includes(TOKEN));
    assert.ok(!JSON.stringify(r.spawns).includes(TOKEN));
    for (const f of listFiles(w.dir)) assert.ok(!readFileSync(f, 'utf8').includes(TOKEN), `token found in ${f}`);
  } finally {
    w.cleanup();
  }
});
