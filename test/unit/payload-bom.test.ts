import assert from 'node:assert/strict';
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
