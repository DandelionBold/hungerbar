// hungerbar setup / --print / --restore against temp Claude config dirs (SPEC §16.8), and setup's look (plan §8, §10.9).
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { demoLines, promptName, promptSentence } from '../src/cli/look.ts';
import { defaults, merge } from '../src/config.ts';
import { FABLE_OPTIONS } from '../src/hud/fable.ts';
import { whoAmI } from '../src/whoami.ts';
import { DIST, listFiles, ROOT, runDist } from './harness.ts';

const ORIGINAL = '\uFEFF{\r\n  "model": "opus[1m]",\r\n  "statusLine": {\r\n    "type": "command",\r\n    "command": "ccstatusline",\r\n    "padding": 0,\r\n    "refreshInterval": 10\r\n  },\r\n  "effortLevel": "medium",\r\n  "theme": "dark"\r\n}\r\n';

function world(settings: string | null) {
  const dir = mkdtempSync(join(tmpdir(), 'hb-setup-'));
  const claude = join(dir, 'claude'), cache = join(dir, 'cache');
  mkdirSync(claude);
  const file = join(claude, 'settings.json');
  if (settings !== null) writeFileSync(file, settings);
  // the player's names and elevation are pinned (0.7.0), so the previews and notes do not depend on who runs the tests
  const env = {
    PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? 'C:\\Windows', CLAUDE_CONFIG_DIR: claude, HUNGERBAR_CACHE_DIR: cache, HUNGERBAR_WT_SETTINGS: join(dir, 'no-wt-settings.json'),
    HUNGERBAR_USER: 'steve', HUNGERBAR_HOST: 'DESKTOP', HUNGERBAR_ELEVATED: '0',
  };
  const run = (...args: string[]) => runDist('', env, ['setup', ...args]);
  const backups = (): string[] => readdirSync(claude).filter((f) => f.startsWith('settings.json.bak.'));
  return { dir, claude, cache, file, env, run, backups, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('--print shows the change and writes nothing', () => {
  const w = world(ORIGINAL);
  try {
    const r = w.run('--print');
    assert.equal(r.status, 0);
    assert.match(r.stdout, /- statusLine: \{"type":"command","command":"ccstatusline"/);
    assert.match(r.stdout, /\+ statusLine: .*hungerbar|statusline\.cmd/);
    assert.equal(readFileSync(w.file, 'utf8'), ORIGINAL);
    assert.deepEqual(w.backups(), []);
    assert.equal(existsSync(w.cache), false);
  } finally {
    w.cleanup();
  }
});

test('setup: backup, only statusLine changes, key order, CRLF kept, BOM dropped; restore is byte for byte', () => {
  const w = world(ORIGINAL);
  try {
    assert.equal(w.run('--launcher').status, 0);
    const [bak] = w.backups();
    assert.ok(bak, 'backup written');
    assert.equal(readFileSync(join(w.claude, bak), 'utf8'), ORIGINAL);
    const text = readFileSync(w.file, 'utf8');
    assert.ok(!text.startsWith('\uFEFF'), 'no BOM');
    assert.ok(text.includes('\r\n') && !/[^\r]\n/.test(text), 'CRLF throughout');
    const obj = JSON.parse(text) as Record<string, { command?: string; padding?: number; refreshInterval?: number }>;
    assert.deepEqual(Object.keys(obj), ['model', 'statusLine', 'effortLevel', 'theme']);
    assert.equal(obj.effortLevel as unknown, 'medium');
    const sl = obj.statusLine!;
    assert.equal(sl.padding, 0);
    assert.equal(sl.refreshInterval, 10);
    if (process.platform === 'win32') {
      assert.equal(sl.command, `exec "${join(w.cache, 'statusline.cmd').replace(/\\/g, '/')}"`);
      const cmd = readFileSync(join(w.cache, 'statusline.cmd'), 'utf8');
      assert.equal(cmd, `@echo off\r\n"${process.execPath}" "${DIST}"\r\n`);
    }
    const prev = JSON.parse(readFileSync(join(w.cache, 'previous-statusline.json'), 'utf8'));
    assert.equal(prev.statusLine.command, 'ccstatusline');

    assert.equal(w.run().status, 0, 'a second setup (direct this time)');
    const prev2 = JSON.parse(readFileSync(join(w.cache, 'previous-statusline.json'), 'utf8'));
    assert.equal(prev2.statusLine.command, 'ccstatusline', 'still remembers ccstatusline, not itself');

    assert.equal(w.run('--restore').status, 0);
    assert.equal(readFileSync(w.file, 'utf8'), ORIGINAL, 'restored byte for byte');
  } finally {
    w.cleanup();
  }
});

test('restore after other keys changed: only statusLine goes back', () => {
  const w = world(ORIGINAL);
  try {
    w.run();
    const obj = JSON.parse(readFileSync(w.file, 'utf8'));
    obj.theme = 'light';
    writeFileSync(w.file, JSON.stringify(obj, null, 2).replace(/\n/g, '\r\n') + '\r\n');
    assert.equal(w.run('--restore').status, 0);
    const back = JSON.parse(readFileSync(w.file, 'utf8'));
    assert.equal(back.theme, 'light');
    assert.equal(back.statusLine.command, 'ccstatusline');
    assert.deepEqual(Object.keys(back), ['model', 'statusLine', 'effortLevel', 'theme']);
  } finally {
    w.cleanup();
  }
});

test('the default (direct) writes the absolute node command and no launcher', () => {
  const w = world('{\n  "theme": "dark"\n}\n');
  try {
    w.run('--direct', '--node', 'C:\\Program Files\\nodejs\\node.exe');
    const obj = JSON.parse(readFileSync(w.file, 'utf8'));
    if (process.platform === 'win32') assert.equal(obj.statusLine.command, `"C:/Program Files/nodejs/node.exe" "${DIST.replace(/\\/g, '/')}"`);
    assert.equal(existsSync(join(w.cache, 'statusline.cmd')), false);
    assert.deepEqual(Object.keys(obj), ['theme', 'statusLine'], 'a new key goes last');
    assert.equal(readFileSync(w.file, 'utf8').includes('\r\n'), false, 'LF file stays LF');
    w.run('--restore');
    assert.equal(readFileSync(w.file, 'utf8'), '{\n  "theme": "dark"\n}\n');
  } finally {
    w.cleanup();
  }
});

test('a missing settings.json is created', () => {
  const w = world(null);
  try {
    assert.equal(w.run().status, 0);
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(w.file, 'utf8'))), ['statusLine']);
    assert.deepEqual(w.backups(), []);
  } finally {
    w.cleanup();
  }
});

test('a symlinked settings.json is followed, the link kept', (t) => {
  const w = world(null);
  try {
    const real = join(w.dir, 'real-settings.json');
    writeFileSync(real, '{\n  "theme": "dark"\n}\n');
    try {
      symlinkSync(real, w.file, 'file');
    } catch {
      t.skip('symlinks need Developer Mode or admin on Windows');
      return;
    }
    assert.equal(w.run().status, 0);
    assert.ok(JSON.parse(readFileSync(real, 'utf8')).statusLine, 'the target got the statusLine');
  } finally {
    w.cleanup();
  }
});

test('mirror copies source, tests, docs and build, never node_modules or .git, stores .gitignore without the dot, and keeps earlier tarballs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hb-mirror-'));
  try {
    const snap = join(dir, 'snap');
    // a copy made before: an earlier release's tarball and a stale item
    mkdirSync(join(snap, 'src'), { recursive: true });
    writeFileSync(join(snap, 'src', 'gone.ts'), '');
    writeFileSync(join(snap, 'hungerbar-0.0.1.tgz'), 'an earlier release');
    const r = runDist('', { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? 'C:\\Windows' }, ['mirror', snap]);
    assert.equal(r.status, 0, r.stderr);
    const top = readdirSync(snap);
    for (const f of ['src', 'test', 'bench', 'dist', 'docs', 'scripts', '.github', 'package.json', 'SPEC.md', 'README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'LICENSE', 'schema.json', 'gitignore', '.gitattributes']) {
      assert.ok(top.includes(f), `${f} mirrored`);
    }
    for (const f of ['node_modules', '.git', '.gitignore']) assert.ok(!top.includes(f), `${f} not mirrored`);
    assert.ok(existsSync(join(snap, 'dist', 'hungerbar.mjs')));
    assert.ok(existsSync(join(snap, 'src', 'main.ts')));
    assert.ok(existsSync(join(snap, 'scripts', 'media', 'make.mjs')));
    assert.ok(!existsSync(join(snap, 'src', 'gone.ts')), 'an item is replaced as a whole');
    assert.equal(readFileSync(join(snap, 'hungerbar-0.0.1.tgz'), 'utf8'), 'an earlier release', 'an earlier tarball is kept for a rollback');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('doctor times the live command without touching the real caches', { skip: process.platform !== 'win32' }, () => {
  const w = world(null);
  try {
    const fwd = (p: string): string => p.split('\\').join('/');
    writeFileSync(w.file, JSON.stringify({ statusLine: { type: 'command', command: `"${fwd(process.execPath)}" "${fwd(DIST)}"` } }));
    const r = runDist('', w.env, ['doctor']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /statusLine \d+ ms/);
    assert.equal(existsSync(w.cache), false, 'nothing written to the cache dir');
  } finally {
    w.cleanup();
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// the look (plan §8, §10.9): --look/--fable/--align, the prompt, the hint, the migration pair. look.test.ts has the writer.
// ---------------------------------------------------------------------------------------------------------------------

const SCHEMA_URL = pathToFileURL(join(ROOT, 'schema.json')).href;
/** The usage API's consent as look prints it, which turns it on. */
const CONSENT = /comes from the opt-in usage API, so this turns it on[\s\S]*never stored or sent anywhere else/;
/** The usage API's consent as setup's question shows it (SPEC §0.10), up to the question with yes pre-selected. */
const CONSENT_ASK = /Fable's weekly comes from the opt-in usage API \(network\.usageApi and network\.scopedWeekly\)\. With it on,\na background refresher reads your Claude login token from .*\.credentials\.json and calls\napi\.anthropic\.com\/api\/oauth\/usage about every 3 minutes while a terminal session renders\.\nThe token is never stored or sent anywhere else\.\n\nTurn on the usage API\? \[Y\/n\]: /;
/** Either wording. */
const ANY_CONSENT = /comes from the opt-in usage API/;
/** setup's hint without a terminal, for classic. */
const HINT = 'Minecraft HUD: hungerbar look hud [--fable boss] [--pr on]';
/** setup's hint without a terminal, for the HUD with the defaults: what uses the network and is still off (SPEC §0.10). */
const NET_HINT = "Fable's weekly limit and the pull request status use the network, so they stay off until you turn them on: hungerbar look hud --fable boss --pr on";
/** The names world() pins, as setup's previews draw them. */
const WHO = whoAmI({ HUNGERBAR_USER: 'steve', HUNGERBAR_HOST: 'DESKTOP', HUNGERBAR_ELEVATED: '0' });
const json = (o: unknown): string => JSON.stringify(o, null, 2) + '\n';
const NET = { usageApi: true, scopedWeekly: true };

/** Every file under a world, with its bytes: equal snapshots mean nothing was written. */
const snapshot = (dir: string): Record<string, string> => Object.fromEntries(listFiles(dir).map((f) => [f.slice(dir.length), readFileSync(f).toString('base64')]));

test("a 0.4.0 hungerbar.json with the usage API on, under the defaults of SPEC §0.10: look hud --fable boss adds only scopedWeekly, then look hud --align left|center; settings.json untouched", () => {
  const before = '{\n  "$schema": "file:///C:/Users/Steve/AppData/Roaming/npm/node_modules/hungerbar/schema.json",\n  "network": {\n    "usageApi": true\n  }\n}\n';
  // look hud and boss are defaults now, so only what the Fable option needs is written (0.5.0 wrote look and hud.fable too)
  const after = { $schema: 'file:///C:/Users/Steve/AppData/Roaming/npm/node_modules/hungerbar/schema.json', network: NET };
  const w = world(ORIGINAL);
  try {
    const cfg = join(w.claude, 'hungerbar.json');
    writeFileSync(cfg, before);
    const r = runDist('', w.env, ['look', 'hud', '--fable', 'boss']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, CONSENT);
    assert.equal(readFileSync(cfg, 'utf8'), json(after));
    const baks = readdirSync(w.claude).filter((f) => f.startsWith('hungerbar.json.bak.'));
    assert.equal(baks.length, 1);
    assert.equal(readFileSync(join(w.claude, baks[0]!), 'utf8'), before, 'backed up');
    assert.equal(readFileSync(w.file, 'utf8'), ORIGINAL, 'settings.json untouched');
    // what it draws: the defaults with the usage API on, which is the chosen setup but for the PR status
    assert.deepEqual(merge(after), { ...defaults(), network: { ...defaults().network, ...NET } });
    // the rollback and back again: classic is written, then hud over it
    assert.equal(runDist('', w.env, ['look', 'classic']).status, 0);
    assert.deepEqual(JSON.parse(readFileSync(cfg, 'utf8')), { ...after, look: 'classic' });
    assert.equal(runDist('', w.env, ['look', 'hud', '--fable', 'boss']).status, 0);
    assert.equal(readFileSync(cfg, 'utf8'), json({ ...after, look: 'hud' }));
    assert.equal(readFileSync(w.file, 'utf8'), ORIGINAL);

    // the centring is a default too: --align center changes nothing; left is written, with a backup, and its way back is center
    const before2 = readFileSync(cfg, 'utf8'), known = readdirSync(w.claude).filter((f) => f.startsWith('hungerbar.json.bak.'));
    assert.match(runDist('', w.env, ['look', 'hud', '--align', 'center']).stdout, /already look hud with align center: nothing to change\./);
    assert.equal(readFileSync(cfg, 'utf8'), before2);
    const c = runDist('', w.env, ['look', 'hud', '--align', 'left']);
    assert.equal(c.status, 0, c.stderr);
    assert.match(c.stdout, /\+ hud: \{"align":"left"\}\n/);
    assert.doesNotMatch(c.stdout, ANY_CONSENT, 'no Fable change, no consent text');
    assert.match(c.stdout, /Back with: hungerbar look hud --align center\n/);
    assert.equal(readFileSync(cfg, 'utf8'), json({ ...after, look: 'hud', hud: { align: 'left' } }));
    const baks2 = readdirSync(w.claude).filter((f) => f.startsWith('hungerbar.json.bak.') && !known.includes(f));
    assert.equal(baks2.length, 1);
    assert.equal(readFileSync(join(w.claude, baks2[0]!), 'utf8'), before2, 'backed up');
    assert.equal(runDist('', w.env, ['look', 'hud', '--align', 'center']).status, 0);
    assert.deepEqual(JSON.parse(readFileSync(cfg, 'utf8')), { ...after, look: 'hud', hud: { align: 'center' } }, 'center over left is written');
    assert.equal(readFileSync(w.file, 'utf8'), ORIGINAL);
  } finally {
    w.cleanup();
  }
});

test('setup --look hud --align left: written next to the Fable option; --print shows it; center, the default, is written only over left; centre is the same', () => {
  const w = world(ORIGINAL);
  try {
    const cfg = join(w.claude, 'hungerbar.json');
    const before = snapshot(w.dir);
    const p = w.run('--print', '--look', 'hud', '--align', 'left');
    assert.equal(p.status, 0, p.stderr);
    assert.match(p.stdout, /\+ \$schema: .*\n\+ hud: \{"align":"left"\}\n/);
    assert.deepEqual(snapshot(w.dir), before);
    const r = w.run('--look', 'hud', '--fable', 'off', '--align', 'left');
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(readFileSync(cfg, 'utf8')), { $schema: SCHEMA_URL, hud: { fable: 'off', align: 'left' } }, 'hud, the default, writes no look');
    assert.match(w.run('--look', 'hud', '--align', 'left').stdout, /look: hud, align left, unchanged/);
    assert.match(w.run('--look', 'hud', '--fable', 'off', '--align', 'left').stdout, /look: hud, fable off, align left, unchanged/);
    assert.equal(w.run('--look', 'hud', '--align', 'centre').status, 0);
    assert.deepEqual(JSON.parse(readFileSync(cfg, 'utf8')).hud, { fable: 'off', align: 'center' }, 'center over left is written');
  } finally {
    w.cleanup();
  }
});

test('setup --print --look hud --fable boss shows both diffs and writes nothing', () => {
  const w = world(ORIGINAL);
  try {
    const before = snapshot(w.dir);
    const r = w.run('--print', '--look', 'hud', '--fable', 'boss');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /- statusLine: \{"type":"command","command":"ccstatusline"/);
    assert.match(r.stdout, /\+ statusLine: /);
    // look hud and boss are defaults (SPEC §0.10): only the network keys that boss needs
    assert.match(r.stdout, /hungerbar\.json: .* \(will be created\)\n\+ \$schema: .*\n\+ network: \{"usageApi":true,"scopedWeekly":true\}\n/);
    assert.match(r.stdout, CONSENT);
    assert.match(r.stdout, /Nothing was written \(--print\)\./);
    assert.ok(!r.stdout.includes(HINT));
    assert.deepEqual(snapshot(w.dir), before);
    assert.equal(existsSync(w.cache), false);
  } finally {
    w.cleanup();
  }
});

test('setup --look hud --fable tail writes the statusLine, then the look (with a backup); --restore leaves the look and says so', () => {
  const w = world(ORIGINAL);
  try {
    const cfg = join(w.claude, 'hungerbar.json');
    writeFileSync(cfg, '{\n  "icons": "unicode"\n}\n');
    const r = w.run('--look', 'hud', '--fable', 'tail');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /statusLine → [\s\S]*hungerbar\.json: [\s\S]*\+ hud: \{"fable":"tail"\}/);
    assert.match(r.stdout, CONSENT);
    assert.ok(!r.stdout.includes(HINT) && !r.stdout.includes('use the network'));
    assert.deepEqual(JSON.parse(readFileSync(cfg, 'utf8')), { icons: 'unicode', hud: { fable: 'tail' }, network: NET });
    assert.equal(readdirSync(w.claude).filter((f) => f.startsWith('hungerbar.json.bak.')).length, 1);
    assert.match(JSON.parse(readFileSync(w.file, 'utf8')).statusLine.command, /hungerbar|statusline\.cmd/);

    const cfgAfter = readFileSync(cfg, 'utf8');
    const back = w.run('--restore');
    assert.equal(back.status, 0);
    assert.equal(readFileSync(w.file, 'utf8'), ORIGINAL, 'restored byte for byte');
    assert.match(back.stdout, /The look stays hud for a later setup \(the restore leaves hungerbar\.json alone\); the classic lines: hungerbar look classic/);
    assert.equal(readFileSync(cfg, 'utf8'), cfgAfter, 'the look is not part of the restore');

    // a second setup with the same look: nothing to change in hungerbar.json
    const again = w.run('--look', 'hud');
    assert.match(again.stdout, /look: hud, unchanged/);
    assert.equal(readFileSync(cfg, 'utf8'), cfgAfter);
  } finally {
    w.cleanup();
  }
});

test('setup: --look and --fable are checked, and hungerbar.json read, before any write', () => {
  const cases: Array<[string[], string | null, RegExp]> = [
    [['--fable', 'boss'], null, /--fable goes with the HUD: --look hud --fable boss/],
    [['--look', 'classic', '--fable', 'boss'], null, /--fable goes with the HUD/],
    [['--look', 'minecraft'], null, /--look takes classic or hud \(got "minecraft"\)/],
    [['--look', '--print'], null, /--look takes classic or hud\n/],
    [['--look', 'hud', '--fable', 'sparkle'], null, /--fable takes off, tail, tooltip, boss, beacon \(got "sparkle"\)/],
    [['--align', 'center'], null, /--align goes with the HUD: --look hud --align center/],
    [['--look', 'classic', '--align', 'left'], null, /--align goes with the HUD: --look hud --align left/],
    [['--look', 'hud', '--align', 'middle'], null, /--align takes left or center \(got "middle"\)/],
    [['--look', 'hud', '--align'], null, /--align takes left or center\n/],
    [['--look', 'hud', '--align', 'center'], '{ "look": "classic", }', /cannot be read as a JSON object[\s\S]*"hud": \{ "align": "center" \}/],
    [['--look', 'hud', '--fable', 'boss'], '{ "look": "classic", }', /cannot be read as a JSON object[\s\S]*Fix it by hand/],
    [['--look', 'classic'], '{ nope', /cannot be read as a JSON object/],
    // an unknown option (a typo), a value on a bare one, or a stray argument: refused before anything is read
    [['--look', 'hud', '--fabel', 'boss'], null, /unknown option --fabel \(see hungerbar --help\)/],
    [['--look=hud', '--fabel=boss'], null, /unknown option --fabel/],
    [['--pritn'], null, /unknown option --pritn/],
    [['--print=1'], null, /--print takes no value/],
    [['hud'], null, /unexpected argument "hud"/],
  ];
  for (const [args, config, msg] of cases) {
    const w = world(ORIGINAL);
    try {
      if (config !== null) writeFileSync(join(w.claude, 'hungerbar.json'), config);
      const before = snapshot(w.dir);
      const r = w.run(...args);
      assert.equal(r.status, 1, args.join(' '));
      assert.match(r.stderr, msg, args.join(' '));
      assert.deepEqual(snapshot(w.dir), before, `${args.join(' ')} wrote nothing`);
    } finally {
      w.cleanup();
    }
  }
});

test('setup with no terminal and no --look writes no look; it names what of the HUD uses the network and is still off, or the HUD for classic', () => {
  const w = world(ORIGINAL);
  try {
    const cfg = join(w.claude, 'hungerbar.json');
    // gh is a stub here (HUNGERBAR_GH), or missing (PATH an empty folder): the real gh never decides what is named
    const stub = join(w.dir, 'gh-stub.mjs');
    writeFileSync(stub, '');
    const noGh = { ...w.env, PATH: join(w.dir, 'no-bin') }, gh = { ...noGh, HUNGERBAR_GH: stub };
    const run = (env: Record<string, string>, ...args: string[]) => runDist('', env, ['setup', ...args]);
    const r = run(gh);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes(NET_HINT + '\n'), r.stdout);
    assert.ok(!r.stdout.includes(HINT));
    assert.doesNotMatch(r.stdout, /Look \[\d\]/, 'no question without a terminal');
    assert.equal(readFileSync(cfg, 'utf8'), json({ $schema: SCHEMA_URL }), 'the defaults: nothing on the network is turned on');
    assert.ok(run(gh, '--print').stdout.includes(NET_HINT));
    // only what is still off is named; with neither, nothing
    writeFileSync(cfg, '{"network": {"usageApi": true, "scopedWeekly": true}}');
    assert.ok(run(gh).stdout.includes('The pull request status uses the network, so it stays off until you turn it on: hungerbar look hud --pr on\n'));
    writeFileSync(cfg, '{"hud": {"pr": "on", "fable": "tail"}, "network": {"usageApi": true}}');
    assert.ok(run(gh).stdout.includes("Fable's weekly limit uses the network, so it stays off until you turn it on: hungerbar look hud --fable tail\n"));
    writeFileSync(cfg, '{"hud": {"pr": "on", "fable": "off"}}');
    const quiet = run(gh).stdout;
    assert.ok(!quiet.includes('the network, so') && !quiet.includes(HINT), quiet);
    // classic: the HUD hint
    writeFileSync(cfg, '{"look": "classic"}');
    assert.ok(run(gh).stdout.includes(HINT + '\n'));
    assert.ok(run(gh, '--print').stdout.includes(HINT));
    assert.ok(!run(gh).stdout.includes('the network, so'));
  } finally {
    w.cleanup();
  }
});

test('the network hint names only what still waits for a yes: not the PR status without gh or after a no, not Fable after a no to the usage API; flags get it too', () => {
  const w = world(ORIGINAL);
  try {
    const cfg = join(w.claude, 'hungerbar.json');
    const stub = join(w.dir, 'gh-stub.mjs');
    writeFileSync(stub, '');
    const noGh = { ...w.env, PATH: join(w.dir, 'no-bin') }, gh = { ...noGh, HUNGERBAR_GH: stub };
    const run = (env: Record<string, string>, ...args: string[]) => runDist('', env, ['setup', ...args]).stdout;
    const FABLE_ONLY = "Fable's weekly limit uses the network, so it stays off until you turn it on: hungerbar look hud --fable boss\n";
    const PR_ONLY = 'The pull request status uses the network, so it stays off until you turn it on: hungerbar look hud --pr on\n';
    // no gh: setup would not ask about the PR status, so the hint does not offer it
    let out = run(noGh);
    assert.ok(out.includes(FABLE_ONLY), out);
    assert.ok(!out.includes('--pr on'), out);
    // a no already saved is not waiting for a yes
    writeFileSync(cfg, '{"hud": {"pr": "off"}}');
    out = run(gh);
    assert.ok(out.includes(FABLE_ONLY) && !out.includes('--pr on'), out);
    writeFileSync(cfg, '{"network": {"usageApi": false}}');
    out = run(gh);
    assert.ok(out.includes(PR_ONLY) && !out.includes('--fable'), out);
    writeFileSync(cfg, '{"network": {"usageApi": true, "scopedWeekly": false}}');
    out = run(gh);
    assert.ok(out.includes(PR_ONLY) && !out.includes('--fable'), out);
    writeFileSync(cfg, '{"hud": {"pr": "off"}, "network": {"usageApi": false}}');
    out = run(gh);
    assert.ok(!out.includes('the network, so'), out);
    // flags ask nothing either, so the hint follows them, without the keys they named
    rmSync(cfg);
    out = run(gh, '--print', '--look', 'hud');
    assert.match(out, /already look hud: nothing to change\.\n/);
    assert.ok(out.includes(NET_HINT + '\n'), out);
    out = run(gh, '--look', 'hud', '--pr', 'off');
    assert.ok(out.includes(FABLE_ONLY) && !out.includes('--pr on'), out);
    out = run(gh, '--look', 'hud', '--fable', 'off');
    assert.ok(out.includes(PR_ONLY) && !out.includes('--fable'), out);
    out = run(gh, '--look', 'classic');
    assert.ok(!out.includes('the network, so') && !out.includes(HINT), 'classic named: no hint');
  } finally {
    w.cleanup();
  }
});

/**
 * setup's questions with piped answers (HUNGERBAR_SETUP_TTY=1). PATH is an empty folder, so no gh is found and the PR
 * question is not asked (askGh names a stub gh); the real gh and its login are never used.
 */
const ask = (w: ReturnType<typeof world>, answers: string, ...args: string[]) =>
  runDist(answers, { ...w.env, PATH: join(w.dir, 'no-bin'), HUNGERBAR_SETUP_TTY: '1', FORCE_COLOR: '3' }, ['setup', ...args]);
/** setup's questions with a stub gh found (HUNGERBAR_GH): the PR question is asked after the operator's. */
const askGh = (w: ReturnType<typeof world>, answers: string, extra: Record<string, string> = {}, ...args: string[]) => {
  const stub = join(w.dir, 'gh-stub.mjs');
  writeFileSync(stub, '');
  return runDist(answers, { ...w.env, PATH: join(w.dir, 'no-bin'), HUNGERBAR_GH: stub, HUNGERBAR_SETUP_TTY: '1', FORCE_COLOR: '3', ...extra }, ['setup', ...args]);
};

test('the setup prompt: both looks previewed, the five Fable options with previews, the usage API asked right after, then where it sits', () => {
  const w = world(ORIGINAL);
  try {
    const r = ask(w, 'x\n2\n9\n3\nmaybe\ny\nz\n1\n\n\n');
    assert.equal(r.status, 0, r.stderr);
    const out = r.stdout;
    assert.match(out, /1 {2}Classic Plus\n.*Model:\s.*Opus\s5\.5/);
    assert.match(out, /2 {2}Minecraft HUD \(default\)\n.*Opus\s5\.5.*Efficiency/);
    assert.match(out, /Look \[2\]: x\nAnswer 1 \(Classic Plus\) or 2 \(Minecraft HUD\)\.\nLook \[2\]: 2\n/);
    // each option: its name, then the sentence that sets it apart, the boss bar counted with the frame (look.test.ts pins them)
    for (const [i, o] of FABLE_OPTIONS.entries()) assert.ok(out.includes(`  ${i}  ${promptName(i)}${i === 3 ? ' (default)' : ''}\n     ${promptSentence(i)}\n`), o.name);
    assert.match(out, /When you switch to Fable, a sixth line appears on top/);
    assert.ok(!out.includes('as today'), 'no wording from the design chat');
    assert.equal(out.match(/on Opus, the weekly line:/g)?.length, 5);
    assert.match(out, /Fable \[3\]: 9\nAnswer a number from 0 to 4\.\nFable \[3\]: 3\n/);
    // the usage API boss needs: its consent text, then the question with yes pre-selected, right after the Fable answer (SPEC §0.10)
    assert.ok(out.includes('Fable [3]: 3\n\nFable\'s weekly comes from the opt-in usage API'), 'the consent right after the answer');
    assert.match(out, CONSENT_ASK);
    assert.match(out, /Turn on the usage API\? \[Y\/n\]: maybe\nAnswer y \(yes\) or n \(no\)\.\nTurn on the usage API\? \[Y\/n\]: y\n\nWhere should the HUD sit\? Claude Code passes its width on every render, so a centred HUD follows the window\.\n/);
    assert.equal(out.match(/never stored/g)?.length, 1, 'said once');
    assert.ok(out.indexOf('never stored') < out.indexOf('statusLine →'), 'the consent text comes before anything is written');
    // the align question: left or centred, the centred preview on the normal day in a 120-column window (no terminal here)
    assert.match(out, /\n {2}1 {2}Left\n {5}at the left edge of the status line\n\n {2}2 {2}Centre \(default\)\n {5}the hotbar in the middle of the status line, like Minecraft's; in a 120-column window:\n/);
    const centred = demoLines('normal', 'hud', 'boss', 'truecolor', defaults(), 120, WHO);
    assert.ok(out.includes(`in a 120-column window:\n${centred.join('\n')}\n\nAlign [2]: `), 'the centred preview');
    assert.deepEqual(centred.map((l) => /^\u2800*/u.exec(l)![0].length), [19, 19, 19, 19, 28], 'budget 116: 19 cells, the frame row\'s 9 more');
    assert.match(out, /Align \[2\]: z\nAnswer 1 \(left\) or 2 \(centre\)\.\nAlign \[2\]: 1\n/);
    assert.match(out, /Align \[2\]: 1\n[\s\S]*Name \[2\]: \n[\s\S]*Operator \[2\]: \n/, 'then the name and the operator (0.7.0)');
    assert.doesNotMatch(out, /pull request status\?/, 'no gh here: the PR status is not offered');
    // the boss preview: 6 lines, the boss bar on top (no name) and the hotbar's bottom edge under it, then the weekly line on Opus
    const boss = out.slice(out.indexOf(`  3  ${FABLE_OPTIONS[3]!.name}`)).split('\n').slice(2, 9);
    assert.match(boss[0]!, /^\u2800{16}\x1b\[[^m]*m\u{1FB82}/u, 'the boss bar, its name left out (SPEC §0.11): 16 U+2800, then the bar');
    assert.doesNotMatch(boss[0]!, /Fable/);
    assert.match(boss[1]!, /Fable\s5\.1/, 'the line below names the model in use');
    assert.match(boss[5]!, /^\u2800{9}\x1b\[/u, 'the bottom edge row');
    assert.equal(boss[6], '     on Opus, the weekly line:');
    // boss, centre, the name and gold are defaults: only the usage API's keys and left are written
    assert.deepEqual(JSON.parse(readFileSync(join(w.claude, 'hungerbar.json'), 'utf8')), { $schema: SCHEMA_URL, network: NET, hud: { align: 'left' } });
    assert.match(JSON.parse(readFileSync(w.file, 'utf8')).statusLine.command, /hungerbar|statusline\.cmd/);
  } finally {
    w.cleanup();
  }
});

test("the setup prompt: Enter takes the defaults and the usage API's yes; no keeps Fable off; Fable off asks nothing; EOF cancels with nothing written", () => {
  let w = world(ORIGINAL);
  try {
    const r = ask(w, '\n\n\n\n\n\n');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Look \[2\]: \n[\s\S]*Fable \[3\]: \n[\s\S]*Turn on the usage API\? \[Y\/n\]: \n[\s\S]*Align \[2\]: \n[\s\S]*Name \[2\]: \n[\s\S]*Operator \[2\]: \n/);
    // the HUD, boss, centre, the name and gold are defaults (SPEC §0.10): only the usage API's keys are written
    assert.deepEqual(JSON.parse(readFileSync(join(w.claude, 'hungerbar.json'), 'utf8')), { $schema: SCHEMA_URL, network: NET });
  } finally {
    w.cleanup();
  }
  // no to the usage API: no Fable option, said with the way to turn it on later; nothing on the network, and the no is
  // written (network.usageApi false), so a later Fable option's question pre-selects no and Enter keeps it off
  w = world(ORIGINAL);
  try {
    const r = ask(w, '\n\nn\n\n\n\n');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Turn on the usage API\? \[Y\/n\]: n\nThe usage API stays off \(network\.usageApi false\), so the HUD shows no Fable weekly \(hud\.fable off\)\. Later: hungerbar look hud --fable boss\n/);
    const cfg = join(w.claude, 'hungerbar.json');
    assert.deepEqual(JSON.parse(readFileSync(cfg, 'utf8')), { $schema: SCHEMA_URL, hud: { fable: 'off' }, network: { usageApi: false } });
    const before = readFileSync(cfg, 'utf8');
    const again = ask(w, '\n3\n\n\n\n\n');
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /Turn on the usage API\? \[y\/N\]: \nThe usage API stays off \(network\.usageApi false\)/);
    assert.equal(readFileSync(cfg, 'utf8'), before, 'Enter keeps the no');
  } finally {
    w.cleanup();
  }
  // Fable off: no consent and no question
  w = world(ORIGINAL);
  try {
    const r = ask(w, '\n0\n\n\n\n');
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stdout, ANY_CONSENT);
    assert.doesNotMatch(r.stdout, /usage API\?/);
    assert.deepEqual(JSON.parse(readFileSync(join(w.claude, 'hungerbar.json'), 'utf8')), { $schema: SCHEMA_URL, hud: { fable: 'off' } });
  } finally {
    w.cleanup();
  }
  // classic asks nothing more, and is written
  w = world(ORIGINAL);
  try {
    const r = ask(w, '1\n');
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stdout, /Fable \[\d\]/, 'classic asks no second question');
    assert.deepEqual(JSON.parse(readFileSync(join(w.claude, 'hungerbar.json'), 'utf8')), { $schema: SCHEMA_URL, look: 'classic' });
  } finally {
    w.cleanup();
  }
  // input that ends early, with or without a final newline (readline closes as it yields the last line)
  for (const answers of ['', '2\n', '2', 'x', '2\n9', '\n\n', '2\n3\n', '2\n3', '2\n3\nmaybe', '2\n3\ny\n', '2\n3\ny\nx\n', '2\n3\ny\n2\n', '2\n3\ny\n2\nx\n', '2\n3\ny\n2\n2\n', '2\n3\ny\n2\n2\nnope']) {
    w = world(ORIGINAL);
    try {
      const before = snapshot(w.dir);
      const r = ask(w, answers);
      assert.equal(r.status, 1, JSON.stringify(answers));
      assert.equal(r.stderr, 'hungerbar: setup cancelled; nothing was written.\n', JSON.stringify(answers));
      assert.deepEqual(snapshot(w.dir), before);
    } finally {
      w.cleanup();
    }
  }
  // a last answer without a newline still counts
  w = world(ORIGINAL);
  try {
    const r = ask(w, '2\n1\ny\ncentre\n\ntag');
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(readFileSync(join(w.claude, 'hungerbar.json'), 'utf8')).hud, { fable: 'tail', op: 'tag' });
  } finally {
    w.cleanup();
  }
});

test('the setup prompt: Enter keeps what hungerbar.json has, marked (current); a HUD config stays as it is', () => {
  // the options before SPEC §0.10 changed the defaults: left, no name and the tag, with the usage API on
  const HUD = json({ $schema: 'x', network: NET, look: 'hud', hud: { fable: 'boss', align: 'left', user: 'off', op: 'tag' } });
  for (const answers of ['\n\n\n\n\n', '2\n\n\n\n\n', 'hud\n\n1\n1\ntag\n']) {
    const w = world(ORIGINAL);
    try {
      const cfg = join(w.claude, 'hungerbar.json');
      writeFileSync(cfg, HUD);
      const r = ask(w, answers);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /\n {2}1 {2}Classic Plus\n/);
      assert.match(r.stdout, /\n {2}2 {2}Minecraft HUD \(current\)\n/);
      assert.match(r.stdout, /Look \[2\]: (?:2|hud)?\n/);
      assert.match(r.stdout, /\n {2}0 {2}No Fable\n {5}Nothing about Fable on the status line\.\n/);
      assert.match(r.stdout, /\n {2}3 {2}A boss bar while you use Fable \(current\)\n/);
      assert.match(r.stdout, /Fable \[3\]: \n/);
      assert.match(r.stdout, /\n {2}1 {2}Left \(current\)\n/);
      assert.match(r.stdout, /\n {2}2 {2}Centre\n/);
      assert.match(r.stdout, /Align \[1\]: 1?\n/);
      assert.doesNotMatch(r.stdout, /\(default\)/);
      assert.doesNotMatch(r.stdout, ANY_CONSENT, 'the usage API is already on: nothing to consent to');
      assert.match(r.stdout, /\n {2}1 {2}No name \(current\)\n[\s\S]*Name \[1\]: 1?\n/);
      assert.match(r.stdout, /\n {2}1 {2}A red \[OP\] after the ⌂ \(current\)\n[\s\S]*Operator \[1\]: (?:tag)?\n/);
      assert.match(r.stdout, /look: hud, fable boss, align left, user off, op tag, unchanged/);
      assert.equal(readFileSync(cfg, 'utf8'), HUD, JSON.stringify(answers));
      assert.deepEqual(readdirSync(w.claude).filter((f) => f.startsWith('hungerbar.json.bak.')), [], 'no backup: nothing changed');
    } finally {
      w.cleanup();
    }
  }
  // classic in the file with a Fable option kept from before: Enter keeps classic; the HUD's Enter keeps that option,
  // and asks for the usage API it needs (yes pre-selected)
  const w = world(ORIGINAL);
  try {
    const cfg = join(w.claude, 'hungerbar.json');
    writeFileSync(cfg, '{\n  "look": "classic",\n  "hud": {\n    "fable": "fable-tail"\n  }\n}\n');
    let r = ask(w, '\n');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /1 {2}Classic Plus \(current\)\n[\s\S]*Look \[1\]: \n/);
    assert.match(r.stdout, /look: classic, unchanged/);
    assert.deepEqual(readdirSync(w.claude).filter((f) => f.startsWith('hungerbar.json.bak.')), []);
    r = ask(w, '2\n\n\n\n\n\n');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /1 {2}Fable next to your weekly food \(current\)\n[\s\S]*Fable \[1\]: \n/);
    assert.match(r.stdout, CONSENT_ASK, 'tail needs the usage API');
    assert.deepEqual(JSON.parse(readFileSync(cfg, 'utf8')), { look: 'hud', hud: { fable: 'tail' }, network: NET });
  } finally {
    w.cleanup();
  }
  // a HUD at the left edge: Enter keeps left, marked (current), and 2 centres it
  const LEFT = json({ look: 'hud', hud: { fable: 'off', align: 'left' } });
  const c = world(ORIGINAL);
  try {
    const cfg = join(c.claude, 'hungerbar.json');
    writeFileSync(cfg, LEFT);
    let r = ask(c, '\n\n\n\n\n');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\n {2}1 {2}Left \(current\)\n[\s\S]*\n {2}2 {2}Centre\n[\s\S]*Align \[1\]: \n/);
    assert.match(r.stdout, /look: hud, fable off, align left, user user, op gold, unchanged/);
    assert.equal(readFileSync(cfg, 'utf8'), LEFT);
    r = ask(c, '\n\ncentre\n\n\n');
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(readFileSync(cfg, 'utf8')), { look: 'hud', hud: { fable: 'off', align: 'center' } });
  } finally {
    c.cleanup();
  }
});

test('the setup prompt: Enter on a config with every option at its default writes nothing and takes no backup (fix after review 11); without the usage API it asks for it', () => {
  // a default (boss, center, the name, gold; SPEC §0.10) is written only over a different value; any answer for it does the same
  const UNCHANGED = 'look: hud, fable boss, align center, user user, op gold, unchanged';
  for (const [file, answers] of [
    [json({ look: 'hud', hud: { align: 'center' }, network: NET }), '\n\n\n\n\n'],
    [json({ look: 'hud', hud: { align: 'center' }, network: NET }), '2\n3\n2\n2\n2\n'],
    [json({ look: 'hud', network: NET }), '\n\n\n\n\n'],
    [json({ hud: { minWidth: 90 }, network: NET }), '\nboss\ncenter\nuser\ngold\n'],
  ] as const) {
    const w = world(ORIGINAL);
    try {
      const cfg = join(w.claude, 'hungerbar.json');
      writeFileSync(cfg, file);
      const r = ask(w, answers);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /\n {2}3 {2}A boss bar while you use Fable \(current\)\n[\s\S]*Fable \[3\]: /);
      assert.doesNotMatch(r.stdout, /\+ hud: /, JSON.stringify(answers));
      assert.ok(r.stdout.includes(UNCHANGED), r.stdout);
      assert.equal(readFileSync(cfg, 'utf8'), file, JSON.stringify([file, answers]));
      assert.deepEqual(readdirSync(w.claude).filter((f) => f.startsWith('hungerbar.json.bak.')), [], 'no backup: nothing changed');
    } finally {
      w.cleanup();
    }
  }
  // a different fable, an unknown one included, is still replaced by boss
  for (const was of ['tail', 'sideways']) {
    const w = world(ORIGINAL);
    try {
      const cfg = join(w.claude, 'hungerbar.json');
      writeFileSync(cfg, JSON.stringify({ look: 'hud', hud: { fable: was }, network: NET }));
      const r = ask(w, '\n3\n\n\n\n');
      assert.equal(r.status, 0, r.stderr);
      assert.deepEqual(JSON.parse(readFileSync(cfg, 'utf8')), { look: 'hud', hud: { fable: 'boss' }, network: NET }, was);
    } finally {
      w.cleanup();
    }
  }
  // the default boss without the usage API: Enter asks for it, yes pre-selected, and writes its keys; still no hud.fable
  const w = world(ORIGINAL);
  try {
    const cfg = join(w.claude, 'hungerbar.json');
    writeFileSync(cfg, '{\n  "look": "hud"\n}\n');
    const r = ask(w, '\n\n\n\n\n\n');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, CONSENT_ASK);
    assert.equal(readFileSync(cfg, 'utf8'), json({ look: 'hud', network: NET }));
  } finally {
    w.cleanup();
  }
});

test('setup --restore is refused with any other option but --print, or an unknown one, before it restores anything', () => {
  const w = world(ORIGINAL);
  try {
    assert.equal(w.run().status, 0);
    for (const [args, msg] of [
      [['--restore', '--fable', 'nope'], /--restore takes only --print \(got --fable\)/],
      [['--restore', '--look', 'hud'], /--restore takes only --print \(got --look\)/],
      [['--restore', '--launcher'], /--restore takes only --print \(got --launcher\)/],
      [['--restore', '--fabel', 'boss'], /unknown option --fabel/],
      [['--restore=1'], /--restore takes no value/],
    ] as const) {
      const before = snapshot(w.dir);
      const r = w.run(...args);
      assert.equal(r.status, 1, args.join(' '));
      assert.match(r.stderr, msg, args.join(' '));
      assert.deepEqual(snapshot(w.dir), before, `${args.join(' ')} wrote nothing`);
    }
    assert.match(w.run('--restore', '--print').stdout, /would restore statusLine: \{"type":"command","command":"ccstatusline"/);
    assert.equal(w.run('--restore').status, 0);
    assert.equal(readFileSync(w.file, 'utf8'), ORIGINAL, 'restored byte for byte');
  } finally {
    w.cleanup();
  }
});

test('the setup prompt: --look skips it, --print never asks, and an unreadable hungerbar.json skips it with a note', () => {
  let w = world(ORIGINAL);
  try {
    const r = ask(w, '2\n3\n', '--look', 'classic');
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stdout, /Look \[\d\]/);
    const p = ask(w, '2\n3\n', '--print');
    assert.doesNotMatch(p.stdout, /Look \[\d\]/);
  } finally {
    w.cleanup();
  }
  // the skip note is its own: not the --look refusal (no "look": "classic" to set by hand, no "nothing was written" while
  // the statusLine is written), and the HUD hint is not repeated at the end (fix after review 10)
  const parseError = /hungerbar\.json cannot be read as a JSON object \(.+\); the look question/;
  for (const [config, why] of [
    ['{ nope', parseError],
    ['{ "look": "hud", // comment }', parseError],
    ['[]', /hungerbar\.json is not a JSON object; the look question/],
  ] as const) {
    w = world(ORIGINAL);
    try {
      const cfg = join(w.claude, 'hungerbar.json');
      writeFileSync(cfg, config);
      const r = ask(w, '2\n3\n');
      assert.equal(r.status, 0, r.stderr);
      const note = `; the look question is skipped and hungerbar.json is left alone. Once it is fixed: hungerbar look hud\n`;
      assert.ok(r.stderr.startsWith(`hungerbar: ${cfg}`), r.stderr);
      assert.ok(r.stderr.endsWith(note), r.stderr);
      assert.equal(r.stderr.split('\n').length, 2, 'one line');
      assert.match(r.stderr, why);
      assert.doesNotMatch(r.stderr, /Fix it by hand|"look": "classic"|nothing was written/);
      assert.doesNotMatch(r.stdout, /Look \[\d\]/);
      assert.doesNotMatch(r.stdout, /Minecraft HUD: hungerbar look hud|the network, so/, 'the hint is not repeated');
      assert.match(r.stdout, /statusLine → /);
      assert.equal(readFileSync(cfg, 'utf8'), config);
      assert.match(JSON.parse(readFileSync(w.file, 'utf8')).statusLine.command, /hungerbar|statusline\.cmd/, 'the status line is still set up');
    } finally {
      w.cleanup();
    }
  }
});

test('setup without a terminal, and --print, over an unreadable hungerbar.json: the same one-line note, not a hint whose command look would refuse (fix after the final publish review)', () => {
  const parseError = /hungerbar\.json cannot be read as a JSON object \(.+\); hungerbar\.json is left alone/;
  for (const [config, why] of [
    ['{ "look": "hud", }', parseError],
    ['{ nope', parseError],
    ['[]', /hungerbar\.json is not a JSON object; hungerbar\.json is left alone/],
  ] as const) {
    const w = world(ORIGINAL);
    try {
      const cfg = join(w.claude, 'hungerbar.json');
      writeFileSync(cfg, config);
      // a stub gh is found, so a hint would name the PR status too; HUNGERBAR_LOOK=classic would make it the HUD's hint
      const stub = join(w.dir, 'gh-stub.mjs');
      writeFileSync(stub, '');
      const gh = { ...w.env, PATH: join(w.dir, 'no-bin'), HUNGERBAR_GH: stub };
      const runs: Array<[string[], Record<string, string>]> = [[[], gh], [['--print'], gh], [[], { ...gh, HUNGERBAR_LOOK: 'classic' }]];
      for (const [args, env] of runs) {
        const what = `${config} ${args.join(' ')}${env.HUNGERBAR_LOOK ? ' HUNGERBAR_LOOK=classic' : ''}`;
        const r = runDist('', env, ['setup', ...args]);
        assert.equal(r.status, 0, `${what}: ${r.stderr}`);
        assert.ok(r.stderr.startsWith(`hungerbar: ${cfg}`), r.stderr);
        assert.ok(r.stderr.endsWith('; hungerbar.json is left alone. Once it is fixed: hungerbar look hud\n'), r.stderr);
        assert.equal(r.stderr.split('\n').length, 2, `one line: ${what}`);
        assert.match(r.stderr, why, what);
        assert.doesNotMatch(r.stderr, /look question|Fix it by hand|nothing was written/, what);
        assert.doesNotMatch(r.stdout, /Minecraft HUD: hungerbar look hud|the network, so|Look \[\d\]/, `no hint and no question: ${what}`);
        assert.equal(readFileSync(cfg, 'utf8'), config, `left alone: ${what}`);
        if (args.length) assert.match(r.stdout, /Nothing was written \(--print\)\.\n$/, what);
        else assert.match(JSON.parse(readFileSync(w.file, 'utf8')).statusLine.command, /hungerbar|statusline\.cmd/, `the status line is still set up: ${what}`);
      }
    } finally {
      w.cleanup();
    }
  }
});

test('setup with a settings.json that cannot be read: one clean line before any question or write (fix after review 10)', () => {
  const cases: Array<[string, string[], RegExp]> = [
    ['{"model": "x",}', [], /cannot be read as a JSON object \(.+\); nothing was written\.\n$/],
    ['{"model": "x",}', ['--look', 'hud', '--fable', 'boss'], /cannot be read as a JSON object \(.+\); nothing was written\.\n$/],
    ['{"model": "x",}', ['--print'], /cannot be read as a JSON object \(.+\); nothing was written\.\n$/],
    ['[1, 2]', [], /settings\.json is not a JSON object; nothing was written\.\n$/],
  ];
  for (const [settings, args, msg] of cases) {
    const w = world(settings);
    try {
      const before = snapshot(w.dir);
      const r = ask(w, '2\n3\n', ...args);
      const what = `${settings} ${args.join(' ')}`;
      assert.equal(r.status, 1, what);
      assert.ok(r.stderr.startsWith(`hungerbar: ${w.file}`), r.stderr);
      assert.match(r.stderr, msg, what);
      assert.equal(r.stderr.split('\n').length, 2, `one line, no stack trace: ${r.stderr}`);
      assert.doesNotMatch(r.stderr, /SyntaxError|\n\s+at /, what);
      assert.equal(r.stdout, '', `nothing asked, no consent text: ${what}`);
      assert.deepEqual(snapshot(w.dir), before, `${what} wrote nothing`);
    } finally {
      w.cleanup();
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// 0.7.0: the name, the operator's mark and the PR status in setup; the migration from a 0.6.0 hungerbar.json
// ---------------------------------------------------------------------------------------------------------------------

const PR_CONSENT = /uses the network, so it is opt-in \(hud\.pr on\)[\s\S]*runs your own GitHub CLI \(gh pr view\)[\s\S]*Hungerbar never sees or stores a token/;
const GOLD = '\x1b[1;38;2;255;170;0m', RED_BOLD = '\x1b[1;38;2;255;85;85m';

/** A hungerbar.json at 0.6.0: the plan's pair, then centred. */
const CFG_060 = {
  $schema: 'file:///C:/Users/Steve/AppData/Roaming/npm/node_modules/hungerbar/schema.json',
  network: { usageApi: true, scopedWeekly: true },
  look: 'hud',
  hud: { fable: 'boss', align: 'center' },
};
/**
 * What 0.7.0 made of it with the round-8 picks: the name, the gold operator and the PR status; the bed and
 * the phantoms on as defaults. Since SPEC §0.10 all of it is the default but the PR status and the usage API.
 */
const CFG_070 = { ...CFG_060, hud: { fable: 'boss', align: 'center', pr: 'on', user: 'user', op: 'gold' } };
/** What setup's questions make of that 0.6.0 file now: the PR status alone, since the name and gold are defaults. */
const CFG_SETUP = { ...CFG_060, hud: { fable: 'boss', align: 'center', pr: 'on' } };

test("setup over a 0.6.0 hungerbar.json: Enter for the HUD, boss, centre, the name and gold, y for the PR status; it draws what the 0.7.0 file draws", () => {
  const w = world(ORIGINAL);
  try {
    const cfg = join(w.claude, 'hungerbar.json');
    writeFileSync(cfg, json(CFG_060));
    // Enter keeps the HUD, boss and centre and takes the defaults for the name and the mark (SPEC §0.10); y: the PR status (gh found)
    const r = askGh(w, '\n\n\n\n\ny\n');
    assert.equal(r.status, 0, r.stderr);
    const out = r.stdout;
    assert.match(out, /\n {2}2 {2}Minecraft HUD \(current\)\n[\s\S]*\n {2}3 {2}A boss bar while you use Fable \(current\)\n[\s\S]*\n {2}2 {2}Centre \(current\)\n/);
    assert.match(out, /\n {2}2 {2}Your user name \(current\)\n[\s\S]*Name \[2\]: \n/);
    assert.match(out, /\n {2}1 {2}A red \[OP\] before your name\n[\s\S]*\n {2}2 {2}Your name turns gold \(current\)\n[\s\S]*Operator \[2\]: \n/);
    // the PR question: tight's line 4 with its badge, the consent before the answer, said once; the file has no hud.pr,
    // so yes is pre-selected
    const q = out.slice(out.indexOf("The HUD can show the branch's pull request"), out.indexOf('Show the pull request status? [Y/n]: y\n'));
    assert.match(q, /⎇.*feature\/cache.*#.*128.*✓.*✓/u);
    assert.match(q, PR_CONSENT);
    assert.match(q, /gh here: .*gh-stub\.mjs\n\n$/);
    assert.equal(out.match(/Hungerbar never sees or stores a token/g)?.length, 1, 'the PR consent is said once');
    assert.doesNotMatch(out, ANY_CONSENT, 'the usage API is already on: no Fable consent');
    // the file plus hud.pr, with a backup of the 0.6.0 file
    assert.equal(readFileSync(cfg, 'utf8'), json(CFG_SETUP));
    assert.match(out, /- hud: \{"fable":"boss","align":"center"\}\n\+ hud: \{"fable":"boss","align":"center","pr":"on"\}\n/);
    const baks = readdirSync(w.claude).filter((f) => f.startsWith('hungerbar.json.bak.'));
    assert.equal(baks.length, 1);
    assert.equal(readFileSync(join(w.claude, baks[0]!), 'utf8'), json(CFG_060), 'backed up');
    const c = merge(JSON.parse(readFileSync(cfg, 'utf8')));
    assert.deepEqual(c.hud, { fable: 'boss', minWidth: 80, align: 'center', pr: 'on', user: 'user', op: 'gold', bed: 'on', phantoms: 'on' }, 'the picks; bed and phantoms on, the defaults');
    assert.deepEqual(c, merge(CFG_070), 'what the 0.7.0 file draws');
    assert.match(JSON.parse(readFileSync(w.file, 'utf8')).statusLine.command, /hungerbar|statusline\.cmd/, 'setup still sets the statusLine');

    // re-running setup and pressing Enter keeps all of it, marked (current), and writes nothing
    const again = askGh(w, '\n\n\n\n\n\n');
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /\n {2}2 {2}Your user name \(current\)\n[\s\S]*Name \[2\]: \n/);
    assert.match(again.stdout, /\n {2}2 {2}Your name turns gold \(current\)\n[\s\S]*Operator \[2\]: \n/);
    assert.match(again.stdout, /\n\nShow the pull request status\? \[Y\/n\]: \n/);
    assert.match(again.stdout, /look: hud, fable boss, align center, pr on, user user, op gold, unchanged/);
    assert.equal(readFileSync(cfg, 'utf8'), json(CFG_SETUP));
    assert.equal(readdirSync(w.claude).filter((f) => f.startsWith('hungerbar.json.bak.')).length, 1, 'no second backup');

    // what it draws: the name in the folder's grey, gold while Claude Code runs elevated, nothing else on line 3
    const line3 = (elevated: string): string => runDist('', { ...w.env, PATH: join(w.dir, 'no-bin'), FORCE_COLOR: '3', HUNGERBAR_ELEVATED: elevated }, ['preview', '--situation', 'normal']).stdout.split('\n')[2]!;
    assert.match(line3('0'), /\x1b\[38;2;170;170;170m⌂\u00a0steve:\u00a0D:\/webapp\x1b\[0m$/u);
    assert.ok(line3('1').includes(`${GOLD}steve\x1b[0m`), 'gold while elevated');
    assert.ok(!line3('1').includes('[OP]'), 'gold, not the tag');
  } finally {
    w.cleanup();
  }
  // the 0.7.0 file: Enter keeps every answer and writes nothing
  const k = world(ORIGINAL);
  try {
    const cfg = join(k.claude, 'hungerbar.json');
    writeFileSync(cfg, json(CFG_070));
    const r = askGh(k, '\n\n\n\n\n\n');
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stdout, ANY_CONSENT);
    assert.match(r.stdout, /look: hud, fable boss, align center, pr on, user user, op gold, unchanged/);
    assert.equal(readFileSync(cfg, 'utf8'), json(CFG_070));
    assert.deepEqual(readdirSync(k.claude).filter((f) => f.startsWith('hungerbar.json.bak.')), []);
  } finally {
    k.cleanup();
  }
});

test("the defaults (SPEC §0.10): a first setup with Enter for every question draws what the 0.7.0 hungerbar.json draws", () => {
  const w = world(ORIGINAL);
  try {
    const cfg = join(w.claude, 'hungerbar.json');
    const r = askGh(w, '\n\n\n\n\n\n\n');
    assert.equal(r.status, 0, r.stderr);
    const out = r.stdout;
    // every question pre-selects the default, marked (default); the two network features say first what they send, yes pre-selected
    for (const marked of ['2  Minecraft HUD (default)', '3  A boss bar while you use Fable (default)', '2  Centre (default)', '2  Your user name (default)', '2  Your name turns gold (default)']) {
      assert.ok(out.includes(`\n  ${marked}\n`), marked);
    }
    assert.match(out, /Look \[2\]: \n[\s\S]*Fable \[3\]: \n/);
    assert.match(out, CONSENT_ASK);
    assert.match(out, /Turn on the usage API\? \[Y\/n\]: \n/);
    assert.match(out, /Align \[2\]: \n[\s\S]*Name \[2\]: \n[\s\S]*Operator \[2\]: \n/);
    assert.ok(out.indexOf('never sees or stores a token') < out.indexOf('Show the pull request status? [Y/n]: \n'), 'the PR consent before its question');
    assert.ok(out.indexOf('Show the pull request status?') < out.indexOf('statusLine →'), 'asked before anything is written');
    // only what is not a default is written: the usage API's keys and the PR status
    assert.equal(readFileSync(cfg, 'utf8'), json({ $schema: SCHEMA_URL, network: NET, hud: { pr: 'on' } }));
    assert.deepEqual(merge(JSON.parse(readFileSync(cfg, 'utf8'))), merge(CFG_070), 'the 0.7.0 setup');
    // and without a terminal nothing on the network is turned on: the defaults, the 0.7.0 setup but for those two
    const quiet = world(ORIGINAL);
    try {
      assert.equal(quiet.run().status, 0);
      assert.equal(readFileSync(join(quiet.claude, 'hungerbar.json'), 'utf8'), json({ $schema: SCHEMA_URL }));
      assert.deepEqual(merge({}), { ...merge(CFG_070), network: defaults().network, hud: { ...merge(CFG_070).hud, pr: 'off' } });
    } finally {
      quiet.cleanup();
    }
  } finally {
    w.cleanup();
  }
});

test("the same setup by hand: look hud --user user --op gold --pr on writes the same bytes as setup's questions, with the consent, and names the way back", () => {
  const w = world(ORIGINAL);
  try {
    const cfg = join(w.claude, 'hungerbar.json');
    writeFileSync(cfg, json(CFG_060));
    const r = runDist('', { ...w.env, PATH: join(w.dir, 'no-bin') }, ['look', 'hud', '--user', 'user', '--op', 'gold', '--pr', 'on']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(cfg, 'utf8'), json(CFG_SETUP));
    assert.match(r.stdout, PR_CONSENT);
    assert.match(r.stdout, /note: gh is not on PATH here, so nothing shows until it is installed and logged in/);
    assert.match(r.stdout, /Back with: hungerbar look hud --pr off\n/);
    assert.match(r.stdout, /\nhud\.user user: line 3 reads "⌂ steve: <folder>" here\n/);
    assert.match(r.stdout, /\nhud\.op gold: your name in bold gold while Claude Code runs as (Administrator|root); this terminal does not, so nothing shows here\n/);
    assert.equal(readFileSync(w.file, 'utf8'), ORIGINAL, 'settings.json untouched');
    // and the way back gives the 0.6.0 file's object again, with the default written over its value
    assert.equal(runDist('', { ...w.env, PATH: join(w.dir, 'no-bin') }, ['look', 'hud', '--pr', 'off']).status, 0);
    assert.deepEqual(JSON.parse(readFileSync(cfg, 'utf8')), { ...CFG_060, hud: { fable: 'boss', align: 'center', pr: 'off' } });
  } finally {
    w.cleanup();
  }
});

test('the setup prompt (0.7.0): the name and operator questions preview line 3 with this machine\'s names; the operator\'s as if elevated', () => {
  const w = world(ORIGINAL);
  try {
    const r = ask(w, '2\n0\n1\nmaybe\n3\n9\n1\n');
    assert.equal(r.status, 0, r.stderr);
    const out = r.stdout;
    const name = out.slice(out.indexOf('Your name can go before the folder'), out.indexOf('Name [2]: maybe'));
    const lines = name.split('\n');
    const after = (label: string): string => lines[lines.findIndex((l) => l.startsWith(`  ${label}`)) + 1]!;
    assert.match(after('1  No name'),/\x1b\[38;2;170;170;170m⌂\u00a0D:\/webapp\x1b\[0m$/u);
    assert.match(after('2  Your user name (default)'), /⌂\u00a0steve:\u00a0D:\/webapp\x1b\[0m$/u);
    assert.match(after('3  Your user name and this computer\'s name'), /⌂\u00a0steve@DESKTOP:\u00a0D:\/webapp\x1b\[0m$/u);
    for (const l of [1, 2, 3].map((i) => after(`${i}  `))) assert.ok(!l.includes('[OP]'), 'no mark in the name previews');
    assert.match(out, /Name \[2\]: maybe\nAnswer 1 \(no name\), 2 \(user\) or 3 \(user@host\)\.\nName \[2\]: 3\n/);
    // the operator: as if elevated, with the name chosen; this terminal is not (HUNGERBAR_ELEVATED=0)
    assert.match(out, /While Claude Code runs as (Administrator|root), the HUD can mark you as the server's operator\. This terminal does not, so you would not see it now; the previews show it as if it did\.\n/);
    const op = out.slice(out.indexOf("the HUD can mark you as the server's operator"), out.indexOf('Operator [2]: 9'));
    const ol = op.split('\n');
    const opAfter = (label: string): string => ol[ol.findIndex((l) => l.startsWith(`  ${label}`)) + 1]!;
    assert.ok(opAfter('1  A red [OP] before your name').includes(`${RED_BOLD}[OP]\x1b[0m`), 'the tag');
    assert.match(opAfter('1  A red [OP] before your name'), /steve@DESKTOP:\u00a0D:\/webapp\x1b\[0m$/u);
    assert.ok(opAfter('2  Your name turns gold (default)').includes(`${GOLD}steve\x1b[0m`), 'the name in gold');
    assert.match(opAfter('3  Nothing'), /\x1b\[38;2;170;170;170m⌂\u00a0steve@DESKTOP:\u00a0D:\/webapp\x1b\[0m$/u);
    assert.match(out, /Operator \[2\]: 9\nAnswer 1 \(tag\), 2 \(gold\) or 3 \(nothing\)\.\nOperator \[2\]: 1\n/);
    assert.doesNotMatch(out, /pull request status\?/, 'no gh: not offered');
    assert.deepEqual(JSON.parse(readFileSync(join(w.claude, 'hungerbar.json'), 'utf8')), { $schema: SCHEMA_URL, hud: { fable: 'off', align: 'left', user: 'user@host', op: 'tag' } }, 'the tag is not the default: written');
  } finally {
    w.cleanup();
  }
  // no name: the labels say the ⌂ carries the mark; an elevated terminal is told so
  const e = world(ORIGINAL);
  try {
    const r = ask(e, '2\n0\n1\n1\ngold\n', '--node', process.execPath);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\n {2}1 {2}A red \[OP\] after the ⌂\n.*⌂\u00a0\x1b\[0m\x1b\[1;38;2;255;85;85m\[OP\]/u);
    assert.match(r.stdout, /\n {2}2 {2}The ⌂ turns gold \(default\)\n.*\x1b\[38;2;255;170;0m⌂\u00a0\x1b\[0m/u);
    assert.deepEqual(JSON.parse(readFileSync(join(e.claude, 'hungerbar.json'), 'utf8')).hud, { fable: 'off', align: 'left', user: 'off' }, 'gold is the default: not written');
    const up = runDist('2\n0\n1\n1\n1\n', { ...e.env, PATH: join(e.dir, 'no-bin'), HUNGERBAR_SETUP_TTY: '1', FORCE_COLOR: '3', HUNGERBAR_ELEVATED: '1' }, ['setup', '--print']);
    assert.doesNotMatch(up.stdout, /Name \[/, '--print never asks');
    const el = runDist('2\n0\n1\n1\n1\n', { ...e.env, PATH: join(e.dir, 'no-bin'), HUNGERBAR_SETUP_TTY: '1', FORCE_COLOR: '3', HUNGERBAR_ELEVATED: '1' }, ['setup']);
    assert.equal(el.status, 0, el.stderr);
    assert.match(el.stdout, /This terminal runs as (Administrator|root), so you would see it now\.\n/);
    assert.match(el.stdout, /\n {2}2 {2}Minecraft HUD \(current\)\n.*\n.*\n.*\x1b\[38;2;255;170;0m⌂/u, 'an elevated terminal: the look\'s preview draws the file\'s gold ⌂, as the status line would');
  } finally {
    e.cleanup();
  }
});

test('the setup prompt (0.7.0): the PR status is offered only where gh is found; yes is pre-selected with no file, else what the file has; its consent comes before the answer', () => {
  const w = world(ORIGINAL);
  try {
    const cfg = join(w.claude, 'hungerbar.json');
    const r = askGh(w, '2\n0\n1\n1\n1\n\n', { HUNGERBAR_OFFLINE: '1' });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.indexOf('never sees or stores a token') < r.stdout.indexOf('Show the pull request status? [Y/n]: '), 'consent before the answer');
    assert.match(r.stdout, /note: CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC or HUNGERBAR_OFFLINE is set here, which keeps the PR status off\.\n\nShow the pull request status\? \[Y\/n\]: \n/);
    assert.deepEqual(JSON.parse(readFileSync(cfg, 'utf8')), { $schema: SCHEMA_URL, hud: { fable: 'off', align: 'left', pr: 'on', user: 'off', op: 'tag' } }, 'Enter: yes, the first time (SPEC §0.10)');
    const bad = askGh(w, '2\n0\n1\n1\n1\nmaybe\nn\n');
    assert.match(bad.stdout, /Show the pull request status\? \[Y\/n\]: maybe\nAnswer y \(yes\) or n \(no\)\.\nShow the pull request status\? \[Y\/n\]: n\n/, 'the file has it on: [Y/n]');
    assert.equal(JSON.parse(readFileSync(cfg, 'utf8')).hud.pr, 'off');
    const keep = askGh(w, '2\n0\n1\n1\n1\n\n');
    assert.match(keep.stdout, /Show the pull request status\? \[y\/N\]: \n/, 'the file has it off: Enter keeps it off');
    assert.equal(JSON.parse(readFileSync(cfg, 'utf8')).hud.pr, 'off');
    for (const [answer, want] of [['yes', 'on'], ['off', 'off'], ['on', 'on'], ['no', 'off']] as const) {
      askGh(w, `2\n0\n1\n1\n1\n${answer}\n`);
      assert.equal(JSON.parse(readFileSync(cfg, 'utf8')).hud.pr, want, answer);
    }
    // input that ends at the PR question cancels, with nothing written (askGh rewrites its stub gh with the same bytes)
    const before = snapshot(w.dir);
    const eof = askGh(w, '2\n0\n1\n1\n1\n');
    assert.equal(eof.status, 1);
    assert.equal(eof.stderr, 'hungerbar: setup cancelled; nothing was written.\n');
    assert.deepEqual(snapshot(w.dir), before);
  } finally {
    w.cleanup();
  }
});

test("the consent questions pre-select by their keys: after a setup without a terminal, Enter for every question gives the full setup; a no is kept", () => {
  const w = world(ORIGINAL);
  try {
    const cfg = join(w.claude, 'hungerbar.json');
    // what Claude Code gets when it runs the README's install line: no terminal, so a hungerbar.json with its $schema only
    assert.equal(w.run().status, 0);
    assert.equal(readFileSync(cfg, 'utf8'), json({ $schema: SCHEMA_URL }));
    // that file has neither key, so both questions pre-select yes, and Enter gives what a first install's Enter gives
    const r = askGh(w, '\n\n\n\n\n\n\n');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Turn on the usage API\? \[Y\/n\]: \n/);
    assert.match(r.stdout, /Show the pull request status\? \[Y\/n\]: \n/);
    assert.equal(readFileSync(cfg, 'utf8'), json({ $schema: SCHEMA_URL, network: NET, hud: { pr: 'on' } }));
  } finally {
    w.cleanup();
  }
  // a no to the PR status is written as hud.pr off, the default, so the next setup pre-selects no and Enter keeps it
  const n = world(ORIGINAL);
  try {
    const cfg = join(n.claude, 'hungerbar.json');
    writeFileSync(cfg, json({ $schema: SCHEMA_URL }));
    const r = askGh(n, '\n\n\n\n\n\nn\n');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Show the pull request status\? \[Y\/n\]: n\n/);
    assert.equal(readFileSync(cfg, 'utf8'), json({ $schema: SCHEMA_URL, network: NET, hud: { pr: 'off' } }));
    const again = askGh(n, '\n\n\n\n\n\n');
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /Show the pull request status\? \[y\/N\]: \n/);
    assert.match(again.stdout, /look: hud, fable boss, align center, pr off, user user, op gold, unchanged/);
    assert.equal(readFileSync(cfg, 'utf8'), json({ $schema: SCHEMA_URL, network: NET, hud: { pr: 'off' } }));
  } finally {
    n.cleanup();
  }
  // a file with the usage API off: Enter keeps it off, and so the Fable option off
  const off = world(ORIGINAL);
  try {
    const cfg = join(off.claude, 'hungerbar.json');
    writeFileSync(cfg, json({ network: { usageApi: false } }));
    const r = ask(off, '\n\n\n\n\n\n');
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.indexOf('never stored or sent anywhere else') < r.stdout.indexOf('Turn on the usage API? [y/N]: '), 'the consent before the question');
    assert.match(r.stdout, /Turn on the usage API\? \[y\/N\]: \nThe usage API stays off \(network\.usageApi false\), so the HUD shows no Fable weekly \(hud\.fable off\)\. Later: hungerbar look hud --fable boss\n/);
    assert.deepEqual(JSON.parse(readFileSync(cfg, 'utf8')), { network: { usageApi: false }, hud: { fable: 'off' } });
  } finally {
    off.cleanup();
  }
});

test('the usage API on and scopedWeekly off: setup asks about scopedWeekly alone, and a no says the usage API stays on', () => {
  const w = world(ORIGINAL);
  try {
    const cfg = join(w.claude, 'hungerbar.json');
    writeFileSync(cfg, json({ network: { usageApi: true } }));
    const r = ask(w, '\n\nn\n\n\n\n');
    assert.equal(r.status, 0, r.stderr);
    const out = r.stdout;
    assert.match(out, /Fable \[3\]: \n\nFable's weekly comes from the usage API, which hungerbar\.json has on, and it needs network\.scopedWeekly too\.\nWith that on, the background refresher calls api\.anthropic\.com\/api\/oauth\/usage about every 3 minutes\nwhile a terminal session renders, even when your account has no extra usage \(without it: once an hour\)\.\nIt reads your Claude login token from .*\.credentials\.json\. The token is never stored or sent anywhere else\.\n\n/);
    assert.doesNotMatch(out, /Turn on the usage API\?/);
    assert.match(out, /Turn on Fable's weekly \(network\.scopedWeekly\)\? \[Y\/n\]: n\nFable's weekly stays off \(network\.scopedWeekly false\), so the HUD shows no Fable weekly \(hud\.fable off\)\. The usage API stays on\. Later: hungerbar look hud --fable boss\n/);
    assert.doesNotMatch(out, /The usage API stays off/);
    assert.deepEqual(JSON.parse(readFileSync(cfg, 'utf8')), { network: { usageApi: true, scopedWeekly: false }, hud: { fable: 'off' } }, 'the usage API is still on');
    // the no is saved, so the next setup pre-selects no; yes turns scopedWeekly on next to it
    const y = ask(w, '\n3\ny\n\n\n\n');
    assert.equal(y.status, 0, y.stderr);
    assert.match(y.stdout, /Turn on Fable's weekly \(network\.scopedWeekly\)\? \[y\/N\]: y\n/);
    assert.deepEqual(JSON.parse(readFileSync(cfg, 'utf8')), { network: NET, hud: { fable: 'boss' } });
  } finally {
    w.cleanup();
  }
});

test('setup --look hud with --pr, --user, --op, --bed and --phantoms: written by the same writer; checked before any write', () => {
  const w = world(ORIGINAL);
  // no gh here: PATH is an empty folder
  const run = (...args: string[]) => runDist('', { ...w.env, PATH: join(w.dir, 'no-bin') }, ['setup', ...args]);
  try {
    const cfg = join(w.claude, 'hungerbar.json');
    const p = run('--print', '--look', 'hud', '--user', 'user@host', '--op', 'off', '--bed', 'off', '--phantoms', 'off', '--pr', 'on');
    assert.equal(p.status, 0, p.stderr);
    assert.match(p.stdout, /\+ hud: \{"pr":"on","user":"user@host","op":"off","bed":"off","phantoms":"off"\}\n/);
    assert.match(p.stdout, PR_CONSENT);
    assert.equal(existsSync(cfg), false, '--print wrote nothing');
    const r = run('--look', 'hud', '--user', 'user@host', '--bed', 'off');
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(readFileSync(cfg, 'utf8')), { $schema: SCHEMA_URL, hud: { user: 'user@host', bed: 'off' } }, 'hud, the default, writes no look');
    assert.match(run('--look', 'hud', '--user', 'user@host', '--bed', 'off', '--phantoms', 'on').stdout, /look: hud, user user@host, bed off, phantoms on, unchanged/);
  } finally {
    w.cleanup();
  }
  for (const [args, msg] of [
    [['--user', 'user'], /--user goes with the HUD: --look hud --user user/],
    [['--look', 'classic', '--op', 'gold'], /--op goes with the HUD: --look hud --op gold/],
    [['--look', 'hud', '--user', 'root'], /--user takes off, user or user@host \(got "root"\)/],
    [['--look', 'hud', '--op', 'red'], /--op takes off, tag or gold \(got "red"\)/],
    [['--look', 'hud', '--bed'], /--bed takes on or off\n/],
    [['--look', 'hud', '--phantoms', 'many'], /--phantoms takes on or off \(got "many"\)/],
    [['--look', 'hud', '--pr', 'yes'], /--pr takes on or off \(got "yes"\)/],
    [['--look', 'hud', '--usr', 'user'], /unknown option --usr/],
  ] as const) {
    const e = world(ORIGINAL);
    try {
      const before = snapshot(e.dir);
      const r = e.run(...args);
      assert.equal(r.status, 1, args.join(' '));
      assert.match(r.stderr, msg, args.join(' '));
      assert.deepEqual(snapshot(e.dir), before, `${args.join(' ')} wrote nothing`);
    } finally {
      e.cleanup();
    }
  }
});
