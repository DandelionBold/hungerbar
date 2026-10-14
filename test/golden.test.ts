// Golden outputs, byte for byte: every case in test/fixtures/cases, in each of its modes (SPEC §16.1).
// `node test/golden.test.ts --update` rewrites the files; review the diff before committing it.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { caseNames, GOLDEN, goldenText, loadCase, MODES, render, stripAnsi } from './harness.ts';

const update = process.argv.includes('--update');
const DEFAULT_MODES = ['ansi', 'nocolor', 'ascii'];

function files(name: string, mode: string, stdout: string): Array<[string, string]> {
  if (mode === 'ansi') return [[`${name}.ansi`, goldenText('ansi', stdout)], [`${name}.txt`, stripAnsi(stdout)]];
  if (mode === 'config') return [[`${name}.ansi`, goldenText('ansi', stdout)]];
  // the other colour modes (w100c, w60c): ESC shown as ␛, as in .ansi
  if (MODES[mode]?.FORCE_COLOR) return [[`${name}.${mode}.ansi`, goldenText('ansi', stdout)]];
  return [[`${name}.${mode}.txt`, stdout]];
}

for (const name of caseNames()) {
  const c = loadCase(name);
  test(`golden ${name}`, () => {
    for (const mode of c.modes ?? DEFAULT_MODES) {
      const r = render(c, mode === 'config' ? '' : mode);
      r.prepared.cleanup();
      assert.equal(r.status, 0, `${name}/${mode} exit status`);
      assert.equal(r.stderr, '', `${name}/${mode} stderr`);
      for (const [file, text] of files(name, mode, r.stdout)) {
        const path = join(GOLDEN, file);
        if (update) writeFileSync(path, text);
        else assert.equal(text, readFileSync(path, 'utf8'), `${file} differs`);
      }
      if (mode !== 'ascii') assert.ok(!stripAnsi(r.stdout).includes(' '), `${name}/${mode}: interior spaces must be NBSP`);
      assert.ok(!/^\s|\s$/m.test(stripAnsi(r.stdout).replace(/ /g, 'x')), `${name}/${mode}: no leading or trailing spaces`);
    }
  });
}
