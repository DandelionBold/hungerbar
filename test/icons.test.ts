// The two icon styles: the Windows Terminal font-face switch (SPEC §0.7). Never touches the real settings.json.
import assert from 'node:assert/strict';
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { faceFor, readFontState, setDefaultFace } from '../src/cli/icons.ts';
import { scan } from '../src/cli/jsonc.ts';
import { runDist } from './harness.ts';

/** A real layout (WT 1.25) with comments and a trailing comma added, as hand-edited files have. */
const WT = `{
    "$help": "https://aka.ms/terminal-documentation",
    "$schema": "https://aka.ms/terminal-profiles-schema",
    // the default profile is Command Prompt
    "defaultProfile": "{0caa0dad-35be-5f56-a8ff-afceeeaa6101}",
    "profiles":
    {
        "defaults":
        {
            "font":
            {
                "face": "Cascadia Mono, Segoe UI Symbol"
            }
        },
        "list":
        [
            {
                "commandline": "%SystemRoot%\\\\System32\\\\cmd.exe",
                "guid": "{0caa0dad-35be-5f56-a8ff-afceeeaa6101}",
                "name": "Command Prompt", /* a comment with a "quote" and // inside */
            },
            {
                "name": "Azure Cloud Shell",
                "source": "Windows.Terminal.Azure"
            }
        ]
    },
    "schemes": [],
}
`;

test('jsonc: comments, trailing commas, escapes and a BOM', () => {
  const m = scan('\uFEFF' + WT);
  assert.equal(m.get('profiles.defaults.font.face')?.value, 'Cascadia Mono, Segoe UI Symbol');
  assert.equal(m.get('profiles.list[0].commandline')?.value, '%SystemRoot%\\System32\\cmd.exe');
  assert.equal(m.get('profiles.list[1].name')?.value, 'Azure Cloud Shell');
  assert.equal(m.get('schemes')?.kind, 'array');
  assert.throws(() => scan('{ "a": 1 '), /expected/);
  assert.throws(() => scan('{ "a": /* open'), /unclosed comment/);
});

test('font state: style, source and per-profile overrides', () => {
  assert.deepEqual({ ...readFontState(WT), overrides: [] }, { face: 'Cascadia Mono, Segoe UI Symbol', faces: ['Cascadia Mono', 'Segoe UI Symbol'], style: 'plain', source: 'font.face', overrides: [] });
  assert.equal(readFontState('{ "profiles": { "defaults": {} } }').source, 'default');
  assert.equal(readFontState('{ "profiles": { "defaults": {} } }').style, 'colour');
  assert.equal(readFontState('{ "profiles": { "defaults": { "fontFace": "Consolas" } } }').source, 'fontFace');
  const withOverride = WT.replace('"name": "Azure Cloud Shell",', '"name": "Azure Cloud Shell", "font": { "face": "Consolas" },');
  assert.deepEqual(readFontState(withOverride).overrides, [{ name: 'Azure Cloud Shell', face: 'Consolas' }]);
});

test('font lists for each style keep the main font first', () => {
  assert.equal(faceFor(['Cascadia Mono'], 'plain'), 'Cascadia Mono, Segoe UI Symbol');
  assert.equal(faceFor(['Cascadia Mono', 'Segoe UI Symbol'], 'colour'), 'Cascadia Mono');
  assert.equal(faceFor(['Fira Code', 'Symbols NF'], 'plain'), 'Fira Code, Segoe UI Symbol, Symbols NF');
  assert.equal(faceFor(['segoe ui symbol'], 'colour'), 'Cascadia Mono');
  assert.equal(faceFor([], 'plain'), 'Cascadia Mono, Segoe UI Symbol');
});

test('only the face value changes, and plain → colour → plain gives back the same bytes', () => {
  for (const eol of ['\n', '\r\n']) {
    const plain = WT.replace(/\n/g, eol);
    const colour = setDefaultFace(plain, 'Cascadia Mono');
    assert.equal(colour, plain.replace('"Cascadia Mono, Segoe UI Symbol"', '"Cascadia Mono"'));
    assert.equal(setDefaultFace(colour, 'Cascadia Mono, Segoe UI Symbol'), plain);
  }
});

test('a missing face is inserted where Windows Terminal reads it', () => {
  const cases = [
    '{\n    "profiles": {\n        "defaults": {\n            "font": {}\n        }\n    }\n}\n',
    '{\n    "profiles": {\n        "defaults": {\n            "opacity": 90\n        }\n    }\n}\n',
    '{\n    "profiles": {\n        "defaults": {}\n    }\n}\n',
    '{\n    "profiles": {\n        "list": []\n    }\n}\n',
    '{ "profiles": { "defaults": { "font": { "size": 12 } } } }',
  ];
  for (const c of cases) {
    const out = setDefaultFace(c, 'Cascadia Mono, Segoe UI Symbol');
    assert.equal(readFontState(out).face, 'Cascadia Mono, Segoe UI Symbol', out);
    assert.doesNotThrow(() => JSON.parse(out), out);
  }
  assert.throws(() => setDefaultFace('{ "profiles": [ { "name": "cmd" } ] }', 'x'), /older layout/);
  assert.equal(setDefaultFace('{ "profiles": { "defaults": { "fontFace": "Consolas" } } }', 'Consolas, Segoe UI Symbol'), '{ "profiles": { "defaults": { "fontFace": "Consolas, Segoe UI Symbol" } } }');
});

function world(settings: string | null) {
  const dir = mkdtempSync(join(tmpdir(), 'hb-icons-'));
  const file = join(dir, 'settings.json');
  if (settings !== null) writeFileSync(file, settings);
  const env = { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? 'C:\\Windows', HUNGERBAR_WT_SETTINGS: file, CLAUDE_CONFIG_DIR: join(dir, 'claude'), HUNGERBAR_CACHE_DIR: join(dir, 'cache') };
  const backups = (): string[] => readdirSync(dir).filter((f) => f.includes('.bak.hungerbar-icons-'));
  return { dir, file, env, backups, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('hungerbar icons: shows, switches with a backup, --print writes nothing, a repeat is a no-op', () => {
  const w = world(WT);
  try {
    const show = runDist('', w.env, ['icons']);
    assert.equal(show.status, 0);
    assert.match(show.stdout, /icons: plain \(font face "Cascadia Mono, Segoe UI Symbol"\)/);
    assert.equal(runDist('', w.env, ['icons', 'colour', '--print']).status, 0);
    assert.equal(readFileSync(w.file, 'utf8'), WT);
    assert.deepEqual(w.backups(), []);
    const sw = runDist('', w.env, ['icons', 'color']);
    assert.equal(sw.status, 0);
    assert.equal(readFileSync(w.file, 'utf8'), WT.replace('"Cascadia Mono, Segoe UI Symbol"', '"Cascadia Mono"'));
    assert.equal(w.backups().length, 1);
    assert.equal(readFileSync(join(w.dir, w.backups()[0]!), 'utf8'), WT);
    assert.match(runDist('', w.env, ['icons', 'colour']).stdout, /already colour; nothing changed/);
    assert.equal(w.backups().length, 1);
    assert.equal(runDist('', w.env, ['icons', 'plain']).status, 0);
    assert.equal(readFileSync(w.file, 'utf8'), WT, 'back to the original bytes');
    assert.equal(runDist('', w.env, ['icons', 'sparkly']).status, 1);
  } finally {
    w.cleanup();
  }
});

test('hungerbar icons: no Windows Terminal settings, and an unreadable file', () => {
  const w = world(null);
  try {
    const r = runDist('', w.env, ['icons']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Windows Terminal settings not found/);
    assert.equal(runDist('', w.env, ['icons', 'plain']).status, 1);
    writeFileSync(w.file, '{ "profiles": ');
    const bad = runDist('', w.env, ['icons', 'plain']);
    assert.equal(bad.status, 1);
    assert.equal(readFileSync(w.file, 'utf8'), '{ "profiles": ', 'left alone');
    assert.equal(existsSync(w.file + '.tmp'), false);
  } finally {
    w.cleanup();
  }
});

test('setup --icons colour switches the style after wiring the status line', () => {
  const w = world(WT);
  try {
    mkdirSync(w.env.CLAUDE_CONFIG_DIR, { recursive: true });
    writeFileSync(join(w.env.CLAUDE_CONFIG_DIR, 'settings.json'), '{\n  "theme": "dark"\n}\n');
    const r = runDist('', w.env, ['setup', '--icons', 'colour']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /statusLine →/);
    assert.equal(readFontState(readFileSync(w.file, 'utf8')).style, 'colour');
    const again = runDist('', w.env, ['setup']);
    assert.match(again.stdout, /icons: colour\. Two styles/);
  } finally {
    w.cleanup();
  }
});

// ---- Fixes from the adversarial review (2026-10-25) ----

test('a "font" object hides the legacy fontFace, as in Windows Terminal, for defaults and for profiles', () => {
  const mixed = '{\n    "profiles": {\n        "defaults": {\n            "fontFace": "Consolas",\n            "font": { "size": 12 }\n        },\n        "list": [ { "name": "cmd", "fontFace": "Lucida Console", "font": { "size": 10 } } ]\n    }\n}\n';
  const st = readFontState(mixed);
  assert.equal(st.face, 'Cascadia Mono');
  assert.equal(st.source, 'default');
  assert.deepEqual(st.overrides, [], 'a profile fontFace beside a font object is ignored');
  const out = setDefaultFace(mixed, 'Cascadia Mono, Segoe UI Symbol');
  assert.match(out, /"font": \{\s*"face": "Cascadia Mono, Segoe UI Symbol",\s*"size": 12 \}/);
  assert.match(out, /"fontFace": "Consolas"/, 'the ignored key is left alone');
  assert.equal(readFontState(out).style, 'plain');
});

test('duplicate keys: the last one wins, and non-object defaults or font are refused', () => {
  const dup = '{ "profiles": { "defaults": { "font": { "face": "Cascadia Mono, Segoe UI Symbol" }, "opacity": 90, "font": { "size": 12 } } } }';
  assert.equal(readFontState(dup).style, 'colour', 'the second "font" has no face');
  const out = setDefaultFace(dup, 'Cascadia Mono, Segoe UI Symbol');
  assert.ok(out.endsWith('"font": {\n    "face": "Cascadia Mono, Segoe UI Symbol", "size": 12 } } } }'), out);
  assert.equal(readFontState(out).style, 'plain');
  assert.throws(() => setDefaultFace('{ "profiles": { "defaults": null } }', 'x'), /not an object/);
  assert.throws(() => setDefaultFace('{ "profiles": { "defaults": { "font": null } } }', 'x'), /not an object/);
  assert.throws(() => setDefaultFace('{ "profiles": { "defaults": { "font": { "face": 3 } } } }', 'x'), /not a string/);
});

test('an inserted line matches tab indentation', () => {
  const tabs = '{\n\t"profiles": {\n\t\t"defaults": {\n\t\t\t"opacity": 90\n\t\t}\n\t}\n}\n';
  assert.match(setDefaultFace(tabs, 'Cascadia Mono, Segoe UI Symbol'), /\n\t\t\t"font": \{ "face": "Cascadia Mono, Segoe UI Symbol" \},\n\t\t\t"opacity": 90/);
});

test('setup: --icons is checked before any write, and --print also previews the font change', () => {
  const w = world(WT);
  try {
    mkdirSync(w.env.CLAUDE_CONFIG_DIR, { recursive: true });
    const claudeSettings = join(w.env.CLAUDE_CONFIG_DIR, 'settings.json');
    writeFileSync(claudeSettings, '{\n  "theme": "dark"\n}\n');
    for (const args of [['setup', '--icons', '--print'], ['setup', '--icons', 'sparkly'], ['setup', '--icons']]) {
      assert.equal(runDist('', w.env, args).status, 1, args.join(' '));
      assert.equal(readFileSync(claudeSettings, 'utf8'), '{\n  "theme": "dark"\n}\n', `${args.join(' ')} wrote nothing`);
    }
    const dry = runDist('', w.env, ['setup', '--print', '--icons', 'colour']);
    assert.equal(dry.status, 0);
    assert.match(dry.stdout, /would set the default font face to "Cascadia Mono"/);
    assert.equal(readFileSync(claudeSettings, 'utf8'), '{\n  "theme": "dark"\n}\n');
    assert.equal(readFileSync(w.file, 'utf8'), WT);
  } finally {
    w.cleanup();
  }
});

test('a read-only settings.json: a plain message, nothing changed, no backup left behind', () => {
  const w = world(WT);
  try {
    chmodSync(w.file, 0o444);
    const r = runDist('', w.env, ['icons', 'colour']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /read-only or another program has it open\. Nothing changed\./);
    assert.doesNotMatch(r.stderr, /at .*\.mjs/, 'no stack trace');
    assert.equal(readFileSync(w.file, 'utf8'), WT);
    assert.deepEqual(w.backups(), []);
  } finally {
    chmodSync(w.file, 0o666);
    w.cleanup();
  }
});

test('a settings.json that is not UTF-8 is refused and left alone', () => {
  const w = world(null);
  try {
    const latin1 = Buffer.from('{ "profiles": { "defaults": { "font": { "face": "Cascadia Mono" } }, "list": [ { "name": "Caf\xe9" } ] } }', 'latin1');
    writeFileSync(w.file, latin1);
    const r = runDist('', w.env, ['icons', 'plain']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /not UTF-8/);
    assert.ok(readFileSync(w.file).equals(latin1));
  } finally {
    w.cleanup();
  }
});

test('a hard-linked settings.json is written in place, so every link changes', () => {
  const w = world(WT);
  try {
    const other = join(w.dir, 'dotfiles-wt.json');
    linkSync(w.file, other);
    assert.equal(runDist('', w.env, ['icons', 'colour']).status, 0);
    assert.equal(readFontState(readFileSync(other, 'utf8')).style, 'colour');
  } finally {
    w.cleanup();
  }
});

test('stable and Preview installed: both are switched, each with its own backup', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hb-icons-multi-'));
  try {
    const stable = join(dir, 'Packages', 'Microsoft.WindowsTerminal_8wekyb3d8bbwe', 'LocalState');
    const preview = join(dir, 'Packages', 'Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe', 'LocalState');
    for (const d of [stable, preview]) {
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, 'settings.json'), WT);
    }
    const env = { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? 'C:\\Windows', LOCALAPPDATA: dir };
    const r = runDist('', env, ['icons', 'colour']);
    assert.equal(r.status, 0, r.stderr);
    for (const d of [stable, preview]) {
      assert.equal(readFontState(readFileSync(join(d, 'settings.json'), 'utf8')).style, 'colour', d);
      assert.equal(readdirSync(d).filter((f) => f.includes('.bak.hungerbar-icons-')).length, 1);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
