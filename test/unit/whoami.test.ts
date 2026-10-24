// Who runs Claude Code (src/whoami.ts, SPEC §0.9, 0.7.0): the names the HUD's folder shows (hud.user) and the elevation
// check behind the operator's mark (hud.op). The check is the open of a folder only SYSTEM and Administrators may list,
// so these tests point SystemRoot at a temp folder to see both answers; on this machine's real folder the answer is
// whatever this process's token says, which the tests do not assume.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { hostname, tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { elevated, HOST_CAP, hostName, USER_CAP, userName, whoAmI } from '../../src/whoami.ts';

test('userName: the account\'s name, cleaned and capped at 32 code points; HUNGERBAR_USER replaces it', () => {
  assert.equal(userName({}), userInfo().username.trim());
  assert.equal(userName({ HUNGERBAR_USER: 'steve' }), 'steve');
  assert.equal(userName({ HUNGERBAR_USER: ' st\x1b[31meve\u0007 ' }), 'steve', 'escapes and controls go, the ends are trimmed');
  assert.equal(USER_CAP, 32);
  assert.equal(userName({ HUNGERBAR_USER: 'u'.repeat(40) }), 'u'.repeat(32) + '…');
  assert.equal(userName({ HUNGERBAR_USER: '' }), '');
});

test('hostName: the computer\'s name up to its first dot, cleaned and capped at 63; HUNGERBAR_HOST replaces it', () => {
  assert.equal(hostName({}), hostname().split('.')[0]!.trim());
  assert.ok(hostName({}).length > 0);
  assert.equal(hostName({ HUNGERBAR_HOST: 'build-01.corp.example' }), 'build-01');
  assert.equal(hostName({ HUNGERBAR_HOST: 'DESKTOP-ABC1234' }), 'DESKTOP-ABC1234');
  assert.equal(HOST_CAP, 63);
  assert.equal(hostName({ HUNGERBAR_HOST: 'h'.repeat(70) + '.x' }), 'h'.repeat(63) + '…');
  assert.equal(hostName({ HUNGERBAR_HOST: '.local' }), '');
});

test('elevated: Windows opens System32\\config\\systemprofile under SystemRoot (only an elevated token may); root elsewhere', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hb-elev-'));
  try {
    assert.equal(elevated({ SystemRoot: dir }, 'win32'), false, 'no such folder: not elevated');
    mkdirSync(join(dir, 'System32', 'config', 'systemprofile'), { recursive: true });
    assert.equal(elevated({ SystemRoot: dir }, 'win32'), true, 'a folder this process may open: elevated');
    assert.equal(elevated({ windir: dir }, 'win32'), true, 'windir when SystemRoot is not set');
    assert.equal(elevated({ HUNGERBAR_ELEVATED: '0', SystemRoot: dir }, 'win32'), false, 'the test hook wins');
    assert.equal(elevated({ HUNGERBAR_ELEVATED: '1' }, 'win32'), true);
    assert.equal(elevated({ HUNGERBAR_ELEVATED: 'yes', SystemRoot: dir }, 'win32'), true, 'only 1 and 0 are the hook');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const root = typeof process.geteuid === 'function' && process.geteuid() === 0;
  assert.equal(elevated({}, 'linux'), root, 'POSIX: euid 0');
  assert.equal(elevated({ HUNGERBAR_ELEVATED: '1' }, 'darwin'), true);
});

test('whoAmI: each part read on first ask, then kept for the render', () => {
  const w = whoAmI({ HUNGERBAR_USER: 'steve', HUNGERBAR_HOST: 'DESKTOP.lan', HUNGERBAR_ELEVATED: '1' });
  assert.deepEqual([w.user(), w.host(), w.elevated()], ['steve', 'DESKTOP', true]);
  assert.deepEqual([w.user(), w.host(), w.elevated()], ['steve', 'DESKTOP', true]);
  assert.equal(whoAmI({ HUNGERBAR_ELEVATED: '0' }).elevated(), false);
});
