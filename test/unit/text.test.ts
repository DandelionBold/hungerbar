import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baseModelId, cleanModelName, num } from '../../src/payload.ts';
import { sanitize, sanitizeTail } from '../../src/sanitize.ts';
import { strWidth, truncateWidth } from '../../src/width.ts';

test('display width: CJK, emoji, combining marks, the box and icon glyphs', () => {
  assert.equal(strWidth('漢字'), 4);
  assert.equal(strWidth('한글'), 4);
  assert.equal(strWidth('🍗🦴💾💳🔥'), 10);
  assert.equal(strWidth('e\u0301'), 1);
  assert.equal(strWidth('a\u200db'), 2);
  assert.equal(strWidth('│·█░▰▱♥❄↻⏲⎇'), 11);
  assert.equal(strWidth('ｆｕｌｌ'), 8);
});

test('truncateWidth keeps whole characters', () => {
  assert.equal(truncateWidth('feature/very-long-branch-name', 16, '…'), 'feature/very-lo…');
  assert.equal(truncateWidth('main', 16, '…'), 'main');
  assert.equal(truncateWidth('漢字漢字漢字', 5, '…'), '漢字…');
});

test('sanitize strips CSI, OSC 8, other escapes, C0, C1 and bidi controls', () => {
  assert.equal(sanitize('a\x1b[31mb\x1b[0mc', 99), 'abc');
  assert.equal(sanitize('x\x1b]8;;https://e.example\x07link\x1b]8;;\x07y', 99), 'xlinky');
  assert.equal(sanitize('x\x1b]0;title\x1b\\y', 99), 'xy');
  assert.equal(sanitize('a\x1bMb', 99), 'ab');
  assert.equal(sanitize('a\x00b\x07c\x7fd\x85e\x9bf', 99), 'abcdef');
  assert.equal(sanitize('a\u202eb\u2066c\u2069d\u200ee\u061cf', 99), 'abcdef');
  assert.equal(sanitize('🍗🍗🍗', 2), '🍗🍗');
  assert.equal(sanitize('unterminated \x1b]8;;http://x', 99), 'unterminated 8;;http://x');
});

test('sanitizeTail keeps the end of long paths', () => {
  assert.equal(sanitizeTail('D:/a/very/long/path/to/project', 12, '…'), '…/to/project');
  assert.equal(sanitizeTail('D:/webapp', 64, '…'), 'D:/webapp');
});

test('model names', () => {
  assert.equal(cleanModelName('Opus 5.5 (1M context)'), 'Opus 5.5');
  assert.equal(cleanModelName('Sonnet 5.5 (200k context)'), 'Sonnet 5.5');
  assert.equal(cleanModelName('Opus 5.5'), 'Opus 5.5');
  assert.equal(baseModelId('claude-opus-5-5[1m]'), 'claude-opus-5-5');
  assert.equal(baseModelId('claude-opus-5-5'), 'claude-opus-5-5');
});

test('num accepts finite numbers and numeric strings only', () => {
  assert.equal(num(2.4), 2.4);
  assert.equal(num(' 86.1 '), 86.1);
  assert.equal(num(''), null);
  assert.equal(num('x'), null);
  assert.equal(num(NaN), null);
  assert.equal(num(null), null);
  assert.equal(num(undefined), null);
});
