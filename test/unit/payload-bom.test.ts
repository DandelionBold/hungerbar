import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { merge } from '../../src/config.ts';
import { consentLines } from '../../src/cli/look.ts';
import { renderPayload } from '../../src/render.ts';

const classic = (): ReturnType<typeof merge> => merge({ look: 'classic' });
const opts = { env: { NO_COLOR: '1' }, config: classic(), sources: () => ({ git: () => ({ isRepo: false, branch: null, added: null, removed: null }), limits: () => ({ h5: null, week: null }), usage: () => null, transcript: () => null }), now: 1 } as never;

test('a payload piped with a UTF-8 BOM (PowerShell 5.1) renders like one without', () => {
  const json = '{"model":{"display_name":"Opus 5.5"}}';
  const plain = renderPayload(json, opts).text;
  assert.equal(renderPayload('\ufeff' + json, opts).text, plain);
  assert.match(plain, /Opus.5\.5/); // the render's spaces are U+00A0
  assert.match(renderPayload('\ufeff', opts).text, /no.data/);
});

test('the consent text names CLAUDE_CODE_OAUTH_TOKEN when it is set, as the refresher reads it first', () => {
  assert.doesNotMatch(consentLines({ CLAUDE_CONFIG_DIR: 'C:/x/.claude' }).join('\n'), /CLAUDE_CODE_OAUTH_TOKEN/);
  const set = consentLines({ CLAUDE_CONFIG_DIR: 'C:/x/.claude', CLAUDE_CODE_OAUTH_TOKEN: 'abc' }).join('\n');
  assert.match(set, /the CLAUDE_CODE_OAUTH_TOKEN variable, else .*\.credentials\.json/);
  assert.doesNotMatch(set, /abc/);
});

test('the consent text names the macOS Keychain after .credentials.json on macOS only, in each of its wordings', () => {
  const env = { CLAUDE_CONFIG_DIR: '/home/steve/.claude' }, file = join('/home/steve/.claude', '.credentials.json');
  const KEYCHAIN = ' (or the macOS Keychain)';
  for (const asking of [false, true, 'scoped'] as const) {
    const mac = consentLines(env, asking, 'darwin').join('\n');
    assert.ok(mac.includes(`${file}${KEYCHAIN}`), `${asking}: ${mac}`);
    for (const platform of ['win32', 'linux'] as const) {
      const t = consentLines(env, asking, platform).join('\n');
      assert.doesNotMatch(t, /Keychain/, `${asking} ${platform}`);
      assert.equal(mac.replace(KEYCHAIN, ''), t, `${asking} ${platform}: the Keychain is the only difference`);
    }
  }
  const both = consentLines({ ...env, CLAUDE_CODE_OAUTH_TOKEN: 'abc' }, true, 'darwin').join('\n');
  assert.ok(both.includes(`the CLAUDE_CODE_OAUTH_TOKEN variable, else ${file}${KEYCHAIN} and calls`), both);
});

test('the consent text states the cadence the refresher keeps (1.1.0): with scopedWeekly every 3 minutes; without it hourly, or every 3 minutes while hungry', () => {
  const env = { CLAUDE_CONFIG_DIR: '/home/steve/.claude' };
  for (const platform of ['win32', 'linux', 'darwin'] as const) {
    // look and setup turn both keys on, so every ttlSeconds (usage/file.ts usageTtl): no hourly case to name
    for (const asking of [false, true] as const) {
      const t = consentLines(env, asking, platform).join('\n');
      assert.match(t, /api\.anthropic\.com\/api\/oauth\/usage about every 3 minutes while a terminal session renders\./, `${asking} ${platform}`);
      assert.doesNotMatch(t, /once an hour/);
    }
    // the usage API already on, scopedWeekly asked: what it changes, and what it is without it
    const scoped = consentLines(env, 'scoped', platform).join('\n');
    assert.ok(scoped.includes('about every 3 minutes\nwhile a terminal session renders, even when your account has no extra usage (without it: once an hour,\n'
      + 'or every 3 minutes while a limit is at 10% left or less).\nIt reads your Claude login token from '), `${platform}: ${scoped}`);
  }
});
