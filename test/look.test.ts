// `hungerbar look`, the hungerbar.json writer it shares with setup, preview --look/--fable/--align/--width, glyphs --hud
// and doctor's Look section (plan §8, §10.9), against temp Claude config dirs and caches: the real hungerbar.json and
// settings.json are never touched. setup's side (--look, --fable, --align, the prompt, the migration pair) is in
// setup.test.ts.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { HUD_GLYPHS } from '../src/cli/glyphs.ts';
import { parseArgs } from '../src/cli/args.ts';
import {
  alignFlag, alignNote, demoLines, diffLines, elevatedAs, handSteps, HUD_FLAG_KEYS, HUD_FLAGS, hudFlag, hudOptions, mergeLook, opSummary, ownSentence,
  parseAlign, parseFable, parseHudOption, parseLook, promptName, promptSentence, sentences, gateHere,
} from '../src/cli/look.ts';
import { isLeftover, LEFTOVER_PS, NO_SPAWN_WARNING, paddingWarning } from '../src/cli/doctor.ts';
import { gitArgs } from '../src/git/refresh.ts';
import { statusArgs } from '../src/git/status.ts';
import { PR_ARGS } from '../src/pr/gh.ts';
import { defaults, HUD_FABLES, HUD_OPS, HUD_PRS, HUD_SWITCHES, HUD_USERS, merge, type Config } from '../src/config.ts';
import { DEMOS, DEMO_NOW, demoSources } from '../src/demo.ts';
import { FABLE_OPTIONS } from '../src/hud/fable.ts';
import { frameHud } from '../src/hud/frame.ts';
import { gitHud, NO_MARKS, type GitMarks } from '../src/hud/gitstate.ts';
import { fromState } from '../src/hud/input.ts';
import { playerHud, type PlayerMarks } from '../src/hud/player.ts';
import { prBadge } from '../src/hud/prci.ts';
import type { PrInfo } from '../src/pr/gh.ts';
import { renderPayload } from '../src/render.ts';
import { acctDir } from '../src/store.ts';
import { whoAmI } from '../src/whoami.ts';
import { listFiles, NOW, ROOT, runDist } from './harness.ts';
import { cellWidth } from './hud/ref.ts';

const SCHEMA_URL = pathToFileURL(join(ROOT, 'schema.json')).href;
/** The names world() pins, as the previews in dist draw them (the default hud.user is user since SPEC §0.10). */
const WHO = whoAmI({ HUNGERBAR_USER: 'steve', HUNGERBAR_HOST: 'DESKTOP', HUNGERBAR_ELEVATED: '0' });
/** The line under each Fable option in setup's prompt (setup.test.ts checks the prompt shows ownSentence's). */
const FABLE_LINES = [
  'Nothing about Fable on the status line, as today.',
  'When you use Fable, the word Fable turns pink and ten small hexagons count what is left, like the drumsticks: 4 pink hexagons is about 40% left, ten dark ones means used up.',
  "When you use Fable, the first line, which names the model in your hand, also shows how worn it is, like a Minecraft tool: 'Fable 5.1 Eff III █▉ 38% ↻ 2d05h'.",
  'When you switch to Fable, a fifth line appears on top, like a boss bar in Minecraft: the word Fable and a long pink bar as wide as your hotbar that gets shorter as you use Fable, then the % left and when it is full again.',
  "At the end of the food line a beacon shows your Fable week: '◈ Fable 65% ↻ 4d00h', and while any Fable is left it sends a beam up into the line above: a full beam while more than half is left, a half beam below that, and the beam gets darker as Fable runs out.",
];
const CONSENT = /comes from the opt-in usage API, so this turns it on[\s\S]*\.credentials\.json[\s\S]*api\.anthropic\.com\/api\/oauth\/usage about every 3 minutes[\s\S]*never stored or sent anywhere else/;

/** A temp Claude config dir (with this hungerbar.json and settings.json, when given), a temp cache, and dist run in them. */
function world(config: string | Buffer | null = null, settings: string | null = '{\n  "theme": "dark"\n}\n') {
  const dir = mkdtempSync(join(tmpdir(), 'hb-look-'));
  const claude = join(dir, 'claude'), cache = join(dir, 'cache');
  mkdirSync(claude);
  const cfg = join(claude, 'hungerbar.json'), settingsFile = join(claude, 'settings.json');
  if (config !== null) writeFileSync(cfg, config);
  if (settings !== null) writeFileSync(settingsFile, settings);
  // the player's names and elevation are pinned (0.7.0): the previews and notes do not depend on who runs the tests
  const env = {
    PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? 'C:\\Windows', TEMP: tmpdir(), TMP: tmpdir(),
    CLAUDE_CONFIG_DIR: claude, HUNGERBAR_CACHE_DIR: cache, HUNGERBAR_WT_SETTINGS: join(dir, 'no-wt-settings.json'),
    HUNGERBAR_USER: 'steve', HUNGERBAR_HOST: 'DESKTOP', HUNGERBAR_ELEVATED: '0',
  };
  return {
    dir, claude, cache, cfg, settingsFile, env,
    run: (args: string[], extra: Record<string, string> = {}, stdin = '') => runDist(stdin, { ...env, ...extra }, args),
    /** Every file under the world, with its bytes: equal snapshots mean nothing was written. */
    snapshot: (): Record<string, string> => Object.fromEntries(listFiles(dir).map((f) => [f.slice(dir.length), readFileSync(f).toString('base64')])),
    backups: (): string[] => readdirSync(claude).filter((f) => f.startsWith('hungerbar.json.bak.')),
    text: (): string => readFileSync(cfg, 'utf8'),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// the merge, in process
// ---------------------------------------------------------------------------------------------------------------------

test('mergeLook: only look, hud.fable and (for a Fable option) the two network keys change; order and other keys kept', () => {
  const before = { $schema: 'x', icons: 'unicode', network: { ttlSeconds: 300, usageApi: false }, hud: { minWidth: 96, fable: 'tail' }, bold: false };
  const hudBoss = mergeLook(before, { look: 'hud', fable: 'boss' });
  assert.deepEqual(Object.keys(hudBoss), ['$schema', 'icons', 'network', 'hud', 'bold'], 'hud is the default (SPEC §0.10): an absent look stays absent');
  assert.deepEqual(hudBoss.network, { ttlSeconds: 300, usageApi: true, scopedWeekly: true });
  assert.deepEqual(hudBoss.hud, { minWidth: 96, fable: 'boss' }, 'boss, the default, over tail is written');
  assert.deepEqual(before.network, { ttlSeconds: 300, usageApi: false }, 'the input is not changed');

  const off = mergeLook(before, { look: 'hud', fable: 'off' });
  assert.deepEqual(off.network, before.network, 'off leaves the usage API as it is');
  assert.deepEqual(off.hud, { minWidth: 96, fable: 'off' });
  assert.deepEqual(mergeLook(before, { look: 'hud' }).hud, before.hud, 'no --fable: hud.fable stays');

  const back = mergeLook(hudBoss, { look: 'classic' });
  assert.deepEqual(back, { ...hudBoss, look: 'classic' }, 'look classic changes only look');
  assert.deepEqual(Object.keys(back), [...Object.keys(hudBoss), 'look']);
  assert.deepEqual(mergeLook(back, { look: 'hud' }), { ...hudBoss, look: 'hud' }, 'hud over classic is written');
  assert.deepEqual(mergeLook({ a: 1 }, { look: 'hud' }), { a: 1 }, 'hud is the default: an absent look stays absent');
  assert.deepEqual(mergeLook({ a: 1 }, { look: 'classic' }), { a: 1, look: 'classic' });
  assert.deepEqual(mergeLook({ look: 'fancy' }, { look: 'classic' }), { look: 'classic' });
  assert.deepEqual(mergeLook({ look: 'fancy' }, { look: 'hud' }), { look: 'hud' }, 'an unknown look is replaced');
  assert.deepEqual(mergeLook({ hud: 'boss', network: [1] }, { look: 'hud', fable: 'beacon' }),
    { hud: { fable: 'beacon' }, network: { usageApi: true, scopedWeekly: true } }, 'a non-object hud or network is replaced');
});

test('mergeLook and handSteps: hud.pr goes next to the other hud keys; off is the default, so an absent pr stays absent for off', () => {
  const before = { $schema: 'x', hud: { minWidth: 96, align: 'center' }, look: 'hud', network: { usageApi: false } };
  const on = mergeLook(before, { look: 'hud', pr: 'on' });
  assert.deepEqual(on, { $schema: 'x', hud: { minWidth: 96, align: 'center', pr: 'on' }, look: 'hud', network: { usageApi: false } }, 'no network key: gh is not the usage API');
  assert.deepEqual(mergeLook(before, { look: 'hud', pr: 'off' }), before, 'off on a file with no pr: nothing changes');
  assert.deepEqual(mergeLook(on, { look: 'hud', pr: 'off' }), { ...on, hud: { minWidth: 96, align: 'center', pr: 'off' } }, 'off over on is written');
  assert.deepEqual(mergeLook({ hud: { pr: true } }, { look: 'hud', pr: 'off' }), { hud: { pr: 'off' } }, 'an unknown pr is replaced');
  assert.deepEqual(mergeLook({}, { look: 'hud', fable: 'boss', align: 'center', pr: 'on' }).hud, { pr: 'on' }, 'boss and center are defaults (SPEC §0.10)');
  assert.deepEqual(mergeLook({}, { look: 'hud', fable: 'tail', align: 'left', pr: 'on' }).hud, { fable: 'tail', align: 'left', pr: 'on' });
  assert.deepEqual(handSteps({ look: 'hud', align: 'center', pr: 'on' }), ['"look": "hud"', '"hud": { "align": "center", "pr": "on" }   (next to any other keys in "hud")']);
  assert.deepEqual(handSteps({ look: 'hud', pr: 'off' }), ['"look": "hud"', '"hud": { "pr": "off" }   (next to any other keys in "hud")']);
});

test("mergeLook and handSteps: a no to setup's usage API question is written as false, next to the file's other network keys; it never turns anything on", () => {
  // a no to the usage API on a first setup: the key and the Fable option off, the network keys stay off
  assert.deepEqual(mergeLook({}, { look: 'hud', fable: 'off', network: { usageApi: false } }), { hud: { fable: 'off' }, network: { usageApi: false } });
  // a no to scopedWeekly with the usage API on: only scopedWeekly is written, the usage API and ttlSeconds are kept
  const on = { network: { usageApi: true, ttlSeconds: 300 } };
  assert.deepEqual(mergeLook(on, { look: 'hud', fable: 'off', network: { scopedWeekly: false } }), { network: { usageApi: true, ttlSeconds: 300, scopedWeekly: false }, hud: { fable: 'off' } });
  // over a file that already says no, nothing changes; a non-object network is replaced
  const no = { network: { usageApi: false }, hud: { fable: 'off' } };
  assert.deepEqual(mergeLook(no, { look: 'hud', fable: 'off', network: { usageApi: false } }), no);
  assert.deepEqual(mergeLook({ network: [1] }, { look: 'hud', network: { usageApi: false } }), { network: { usageApi: false } });
  assert.equal(merge(mergeLook({}, { look: 'hud', fable: 'off', network: { usageApi: false } })).network.usageApi, false);
  assert.deepEqual(handSteps({ look: 'hud', fable: 'off', network: { usageApi: false } }), [
    '"look": "hud"', '"hud": { "fable": "off" }   (next to any other keys in "hud")', '"network": { "usageApi": false }   (next to any other keys in "network")',
  ]);
});

test('look hud --pr on|off: only hud.pr is written; turning it on prints the consent (gh here or not, the traffic switch); look reports it', () => {
  const w = world('{\n  "look": "hud",\n  "hud": { "align": "center" }\n}\n');
  try {
    // PATH is an empty folder (dist runs under this node by its full path), so no gh is found unless HUNGERBAR_GH names one
    const noGh = { PATH: join(w.dir, 'no-bin') };
    const stub = join(w.dir, 'gh-stub.mjs');
    writeFileSync(stub, '');
    let r = w.run(['look', 'hud', '--pr', 'on', '--print'], noGh);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /- hud: \{"align":"center"\}\n\+ hud: \{"align":"center","pr":"on"\}\n/);
    assert.match(r.stdout, /uses the network, so it is opt-in \(hud\.pr on\)[\s\S]*runs your own GitHub CLI \(gh pr view\)[\s\S]*about once a minute, with your own gh login\. Hungerbar never sees or stores a token/);
    assert.match(r.stdout, /note: gh is not on PATH here, so nothing shows until it is installed and logged in/);
    assert.match(r.stdout, /Nothing was written \(--print\)\./);
    assert.deepEqual(w.backups(), []);
    r = w.run(['look', 'hud', '--pr', 'on'], { ...noGh, HUNGERBAR_GH: stub, HUNGERBAR_OFFLINE: '1' });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes(`gh here: ${stub}\n`), r.stdout);
    assert.match(r.stdout, /note: CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC or HUNGERBAR_OFFLINE is set here, which keeps the PR status off\.\n/);
    assert.match(r.stdout, /Back with: hungerbar look hud --pr off\n/);
    assert.equal(w.text(), '{\n  "look": "hud",\n  "hud": {\n    "align": "center",\n    "pr": "on"\n  }\n}\n');
    assert.equal(w.backups().length, 1);
    // already on: nothing to change; another change with it already on: no consent again
    r = w.run(['look', 'hud', '--pr', 'on'], noGh);
    assert.match(r.stdout, /already look hud with pr on: nothing to change\./);
    r = w.run(['look', 'hud', '--align', 'left', '--pr', 'on'], noGh);
    assert.doesNotMatch(r.stdout, /opt-in/);
    assert.match(r.stdout, /Back with: hungerbar look hud --align center\n/);
    // look with no argument says what it does here
    assert.match(w.run(['look'], { ...noGh, HUNGERBAR_GH: stub }).stdout, /\nhud\.pr on: the branch's pull request from .*gh-stub\.mjs \(found here\), about once a minute\n/);
    assert.match(w.run(['look'], noGh).stdout, /\nhud\.pr on, but gh is not on PATH here, so nothing shows\n/);
    assert.match(w.run(['look'], { ...noGh, HUNGERBAR_GH: stub, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }).stdout, /\nhud\.pr on, but off here: CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC or HUNGERBAR_OFFLINE is set\n/);
    r = w.run(['look', 'hud', '--pr', 'off', '--align', 'center'], noGh);
    assert.match(r.stdout, /Back with: hungerbar look hud --align left --pr on\n/);
    assert.deepEqual(JSON.parse(w.text()), { look: 'hud', hud: { align: 'center', pr: 'off' } });
    r = w.run(['look'], noGh);
    assert.match(r.stdout, /\nhud\.pr off: no pull request status\n/);
    assert.match(r.stdout, /hungerbar look hud \[--fable off\|tail\|tooltip\|boss\|beacon\] \[--align left\|center\] \[--pr on\|off\]\n/);
    // look classic keeps hud.pr; look hud brings it back
    r = w.run(['look', 'classic'], noGh);
    assert.deepEqual(JSON.parse(w.text()), { look: 'classic', hud: { align: 'center', pr: 'off' } });
  } finally {
    w.cleanup();
  }
});

test('mergeLook: hud.align goes next to the other hud keys; center is the default, so an absent align stays absent for center', () => {
  const before = { $schema: 'x', hud: { minWidth: 96, fable: 'tail' }, look: 'hud' };
  const left = mergeLook(before, { look: 'hud', align: 'left' });
  assert.deepEqual(left, { $schema: 'x', hud: { minWidth: 96, fable: 'tail', align: 'left' }, look: 'hud' });
  assert.deepEqual(Object.keys(left.hud as object), ['minWidth', 'fable', 'align']);
  assert.deepEqual(mergeLook(before, { look: 'hud', align: 'center' }), before, 'center on a file with no align: nothing changes');
  assert.deepEqual(mergeLook(left, { look: 'hud', align: 'center' }), { ...left, hud: { minWidth: 96, fable: 'tail', align: 'center' } }, 'center over left is written');
  assert.deepEqual(mergeLook({ hud: { align: 'sideways' } }, { look: 'hud', align: 'center' }), { hud: { align: 'center' } }, 'an unknown align is replaced');
  assert.deepEqual(mergeLook({ hud: { align: 'center' } }, { look: 'hud', align: 'center' }), { hud: { align: 'center' } });
  // boss is the default too: an absent hud.fable stays absent, as setup's Enter keeps it (fix after review 11); its
  // network keys are written, since a choice that names a Fable option is the user's yes (SPEC §0.10)
  const NET = { usageApi: true, scopedWeekly: true };
  assert.deepEqual(mergeLook(before, { look: 'hud', fable: 'boss' }), { ...before, hud: { minWidth: 96, fable: 'boss' }, network: NET }, 'boss over tail is written');
  assert.deepEqual(mergeLook({ look: 'hud' }, { look: 'hud', fable: 'boss', align: 'center' }), { look: 'hud', network: NET }, 'boss and center on a file with neither: only the network keys');
  assert.deepEqual(mergeLook({ look: 'hud', hud: { align: 'left' } }, { look: 'hud', fable: 'off', align: 'left' }), { look: 'hud', hud: { align: 'left', fable: 'off' } }, 'off is written');
  assert.deepEqual(mergeLook({ hud: { minWidth: 90 } }, { look: 'hud', fable: 'boss' }), { hud: { minWidth: 90 }, network: NET });
  assert.deepEqual(mergeLook({ hud: { fable: 'boss' } }, { look: 'hud', fable: 'boss' }), { hud: { fable: 'boss' }, network: NET });
  assert.deepEqual(mergeLook({ hud: { fable: 'sideways' } }, { look: 'hud', fable: 'boss' }), { hud: { fable: 'boss' }, network: NET }, 'an unknown fable is replaced');
  assert.deepEqual(mergeLook({ hud: { fable: 'fable-boss' } }, { look: 'hud', fable: 'off' }), { hud: { fable: 'off' } });
  assert.deepEqual(mergeLook({}, { look: 'hud', fable: 'off', align: 'left' }), { hud: { fable: 'off', align: 'left' } });
  // with a Fable option: one hud object with both keys, the network keys as before
  assert.deepEqual(mergeLook({}, { look: 'hud', fable: 'tail', align: 'left' }), { hud: { fable: 'tail', align: 'left' }, network: NET });
  assert.deepEqual(mergeLook({ hud: 'boss' }, { look: 'hud', align: 'left' }), { hud: { align: 'left' } }, 'a non-object hud is replaced');
  assert.deepEqual(mergeLook(left, { look: 'classic' }), { ...left, look: 'classic' }, 'look classic keeps hud.align');
  assert.deepEqual(before, { $schema: 'x', hud: { minWidth: 96, fable: 'tail' }, look: 'hud' }, 'the input is not changed');
  assert.deepEqual(handSteps({ look: 'hud', align: 'center' }), ['"look": "hud"', '"hud": { "align": "center" }   (next to any other keys in "hud")']);
  assert.deepEqual(handSteps({ look: 'hud', fable: 'boss', align: 'center' })[1], '"hud": { "fable": "boss", "align": "center" }   (next to any other keys in "hud")');
});

test('--align is strict: left or center (centre is the same); a bare one or any other value is an error', () => {
  assert.equal(parseAlign('left'), 'left');
  assert.equal(parseAlign('center'), 'center');
  assert.equal(parseAlign('centre'), 'center');
  for (const bad of ['', 'Center', 'CENTER', 'right', 'middle', 'constructor', undefined]) assert.equal(parseAlign(bad), null, String(bad));
  assert.deepEqual(alignFlag(parseArgs(['--align', 'centre'], ['align'])), { ok: true, value: 'center' });
  assert.deepEqual(alignFlag(parseArgs([], ['align'])), { ok: true, value: null });
  assert.deepEqual(alignFlag(parseArgs(['--align=middle'], ['align'])), { ok: false, error: '--align takes left or center (got "middle")' });
  assert.deepEqual(alignFlag(parseArgs(['--align'], ['align'])), { ok: false, error: '--align takes left or center' });
  assert.deepEqual(alignFlag(parseArgs(['--align', '--print'], ['align'])), { ok: false, error: '--align takes left or center' });
});

test('flags are strict (the file is lenient); diff lines; by-hand steps; the sentence that sets each Fable option apart', () => {
  for (const id of HUD_FABLES) {
    assert.equal(parseFable(id), id);
    assert.equal(parseFable(`fable-${id}`), id);
  }
  for (const bad of ['', 'Boss', 'fable-', 'fable-mount', 'mount', 'constructor', '__proto__', undefined]) assert.equal(parseFable(bad), null, String(bad));
  assert.equal(parseLook('hud'), 'hud');
  assert.equal(parseLook('classic'), 'classic');
  for (const bad of ['HUD', 'minecraft', '', undefined]) assert.equal(parseLook(bad), null, String(bad));

  assert.deepEqual(diffLines({ a: 1, n: { x: 1 }, gone: true }, { a: 1, n: { x: 2 }, look: 'hud' }),
    ['- n: {"x":1}', '+ n: {"x":2}', '+ look: "hud"', '- gone: true']);
  assert.deepEqual(handSteps({ look: 'classic' }), ['"look": "classic"']);
  assert.equal(handSteps({ look: 'hud', fable: 'off' }).length, 2);
  assert.equal(handSteps({ look: 'hud', fable: 'tail' }).length, 3);

  // tail, tooltip and boss open with the same sentence, so each shows the first sentence no other note has
  const OPUS = "While you use Opus, Fable is a small grey note after your weekly: 'Fable 65% ↻ 4d00h' means 65% of your Fable week is left and it is full again in 4 days.";
  for (const i of [1, 2, 3]) assert.equal(sentences(FABLE_OPTIONS[i]!.note)[0], OPUS);
  assert.deepEqual(FABLE_OPTIONS.map((_, i) => ownSentence(i)), FABLE_LINES);
  assert.equal(new Set(FABLE_LINES).size, FABLE_OPTIONS.length, 'five different lines');
  // the prompt counts the boss bar with the hotbar's frame (0.5.1): the sixth line, and the bar has no name (SPEC
  // §0.11); the off option drops the design chat's "as today", in its line and its name; the other three are shown as
  // they are
  const PROMPT_LINES = [...FABLE_LINES];
  PROMPT_LINES[0] = 'Nothing about Fable on the status line.';
  PROMPT_LINES[3] = 'When you switch to Fable, a sixth line appears on top, like a boss bar in Minecraft: a long pink bar as wide as your hotbar that gets shorter as you use Fable, then the % left and when it is full again.';
  assert.deepEqual(FABLE_OPTIONS.map((_, i) => promptSentence(i)), PROMPT_LINES);
  assert.notEqual(promptSentence(3), ownSentence(3));
  assert.deepEqual(FABLE_OPTIONS.map((_, i) => promptName(i)), ['No Fable', ...FABLE_OPTIONS.slice(1).map((o) => o.name)]);
  assert.equal(FABLE_OPTIONS[0]!.name, 'No Fable (as today)', 'FABLE_OPTIONS stays verbatim');
  // sentences end at a full stop and a space (not inside 5.1); a note with nothing of its own shows its first sentence
  assert.deepEqual(sentences('A 5.1 b. C d.'), ['A 5.1 b.', 'C d.']);
  assert.equal(ownSentence(1, ['Same. Own one.', 'Same.']), 'Same.');
  assert.equal(ownSentence(0, ['Same. Own one.', 'Same.']), 'Own one.');
});

// ---------------------------------------------------------------------------------------------------------------------
// hungerbar look, through dist
// ---------------------------------------------------------------------------------------------------------------------

test('look with no argument: the look, its options, the verdict here and the usage API', () => {
  const w = world();
  try {
    let r = w.run(['look'], { FORCE_COLOR: '3' });
    assert.equal(r.status, 0, r.stderr);
    // no file: the defaults (SPEC §0.10), the HUD with boss, centred, and the usage API off until the user says yes
    assert.match(r.stdout, /hungerbar\.json: .* \(not present, defaults\)/);
    assert.match(r.stdout, /look hud, hud\.fable boss, hud\.minWidth 80, hud\.align center\n/);
    assert.match(r.stdout, /the HUD draws here \(24-bit colour\)/);
    assert.match(r.stdout, /usage API off, scopedWeekly off\nnote: hud\.fable boss needs network\.usageApi and network\.scopedWeekly: without them the HUD draws no Fable \(hungerbar look hud --fable boss turns them on\)\n/);
    assert.match(r.stdout, /\nhud\.pr off: no pull request status\nhud\.user user: line 3 reads "⌂ steve: <folder>" here\nhud\.op gold: /);
    assert.equal(existsSync(w.cfg), false, 'nothing written');
    writeFileSync(w.cfg, JSON.stringify({ look: 'classic', hud: { fable: 'off' } }));
    r = w.run(['look'], { FORCE_COLOR: '3' });
    assert.match(r.stdout, /look classic, hud\.fable off, hud\.minWidth 80/);
    assert.match(r.stdout, /classic here \(look is classic\); the HUD would draw here \(24-bit colour\)/);

    writeFileSync(w.cfg, JSON.stringify({ look: 'hud', hud: { fable: 'boss', minWidth: 90, align: 'left' } }));
    r = w.run(['look'], { FORCE_COLOR: '2', COLUMNS: '80' });
    assert.match(r.stdout, /look hud, hud\.fable boss, hud\.minWidth 90/);
    assert.match(r.stdout, /classic here: budget 76 is below hud\.minWidth 90/);
    assert.match(r.stdout, /note: hud\.fable boss needs network\.usageApi and network\.scopedWeekly/);
    r = w.run(['look'], { FORCE_COLOR: '2', HUNGERBAR_LOOK: 'classic' });
    assert.match(r.stdout, /look classic \(HUNGERBAR_LOOK=classic wins over the file\)/);
    r = w.run(['look'], { FORCE_COLOR: '2' });
    assert.match(r.stdout, /the HUD draws here \(256 colours\)/);
    assert.match(r.stdout, /look hud, hud\.fable boss, hud\.minWidth 90, hud\.align left\n/);
    assert.match(r.stdout, /hud\.align left: the HUD starts at the left edge \(this terminal\)/);
    assert.match(r.stdout, /switch with: hungerbar look classic {3}or {3}hungerbar look hud \[--fable off\|tail\|tooltip\|boss\|beacon\] \[--align left\|center\]/);

    // centred: how far it moves here, or why not
    writeFileSync(w.cfg, JSON.stringify({ look: 'hud', hud: { align: 'center' } }));
    r = w.run(['look'], { FORCE_COLOR: '3', COLUMNS: '120' });
    assert.match(r.stdout, /hud\.align center\n/);
    assert.match(r.stdout, /hud\.align center: budget 116 here, so the HUD moves up to 19 columns right \(the hotbar's centre from col 39 to col 58\), less when its widest line would pass the edge \(this terminal\)/);
    r = w.run(['look'], { FORCE_COLOR: '3' });
    assert.match(r.stdout, /hud\.align center: the width is unknown here, so the HUD stays at the left edge; Claude Code passes COLUMNS on every render, so there it is centred and follows the window/);
    r = w.run(['look'], { FORCE_COLOR: '3', COLUMNS: '84' });
    assert.match(r.stdout, /hud\.align center: budget 80 here, so the HUD moves up to 1 column right \(the hotbar's centre from col 39 to col 40\)/, 'one column, not "1 columns"');
    // the note follows the gate: where classic draws, nothing moves (fix after review 11)
    r = w.run(['look'], { FORCE_COLOR: '3', COLUMNS: '82' });
    assert.match(r.stdout, /classic here: budget 78 is below hud\.minWidth 80 [\s\S]*\nhud\.align center: nothing moves here, because classic draws instead of the HUD: budget 78 is below hud\.minWidth 80 \(this terminal\)\n/);
    r = w.run(['look'], { NO_COLOR: '1', COLUMNS: '150' });
    assert.match(r.stdout, /hud\.align center: nothing moves here, because classic draws instead of the HUD: no colour \(NO_COLOR, FORCE_COLOR=0 or color "never"\) \(this terminal\)\n/);
    assert.doesNotMatch(r.stdout, /moves up to/);
    writeFileSync(w.cfg, JSON.stringify({ look: 'hud', hud: { align: 'center', minWidth: 100 } }));
    r = w.run(['look'], { FORCE_COLOR: '3', COLUMNS: '94' });
    assert.match(r.stdout, /classic here: budget 90 is below hud\.minWidth 100 /);
    assert.match(r.stdout, /hud\.align center: nothing moves here, because classic draws instead of the HUD: budget 90 is below hud\.minWidth 100 \(this terminal\)\n/);
    assert.doesNotMatch(r.stdout, /moves up to/);
    writeFileSync(w.cfg, JSON.stringify({ look: 'hud', hud: { align: 'center', minWidth: 70 } }));
    r = w.run(['look'], { FORCE_COLOR: '3', COLUMNS: '82' });
    assert.match(r.stdout, /the HUD draws here \(24-bit colour\)/);
    assert.match(r.stdout, /hud\.align center: budget 78 here is too narrow to move the HUD \(the hotbar's centre is col 39\), so it stays at the left edge \(this terminal\)/);
    // look classic: nothing moves; where the HUD would sit, or that it would not draw either
    writeFileSync(w.cfg, JSON.stringify({ look: 'classic', hud: { align: 'center' } }));
    r = w.run(['look'], { FORCE_COLOR: '3', COLUMNS: '120' });
    assert.match(r.stdout, /classic here \(look is classic\); the HUD would draw here/);
    assert.match(r.stdout, /hud\.align center: look is classic, so nothing moves; budget 116 here, so the HUD would move up to 19 columns right \(the hotbar's centre from col 39 to col 58\), less when its widest line would pass the edge \(this terminal\)\n/);
    r = w.run(['look'], { FORCE_COLOR: '3' });
    assert.match(r.stdout, /hud\.align center: look is classic, so nothing moves; the width is unknown here, so the HUD would stay at the left edge; Claude Code passes COLUMNS on every render, so there it would be centred and follow the window/);
    r = w.run(['look'], { NO_COLOR: '1', COLUMNS: '120' });
    assert.match(r.stdout, /hud\.align center: look is classic, so nothing moves; the HUD would not draw here either: no colour/);
    writeFileSync(w.cfg, JSON.stringify({ look: 'hud', hud: { align: 'center' } }));
    r = w.run(['look'], { FORCE_COLOR: '3', COLUMNS: '120', HUNGERBAR_HUD_ALIGN: 'left' });
    assert.match(r.stdout, /hud\.align left \(HUNGERBAR_HUD_ALIGN=left wins over the file\)/);
    assert.match(r.stdout, /hud\.align left: the HUD starts at the left edge/);
    writeFileSync(w.cfg, JSON.stringify({ look: 'classic', hud: { align: 'left' } }));
    assert.doesNotMatch(w.run(['look']).stdout, /hud\.align (left|center):/, 'classic and left: no align line');

    writeFileSync(w.cfg, '{ "look": "hud", }');
    r = w.run(['look']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /is invalid JSON .*: the status line draws classic with cfg! until it is fixed/);
    assert.match(r.stdout, /classic here: hungerbar\.json is invalid/);
  } finally {
    w.cleanup();
  }
});

test('alignNote follows the gate: what moves where the HUD draws, nothing where classic draws, "would" for look classic (fix after review 11)', () => {
  const cfg = (look: 'hud' | 'classic', align: 'left' | 'center', minWidth = 80): Config => ({ ...defaults(), look, hud: { ...defaults().hud, align, minWidth } });
  const note = (c: Config, env: Record<string, string>): string => alignNote(c, gateHere(c, null, env));
  const hud = cfg('hud', 'center'), classic = cfg('classic', 'center');
  const c3 = { FORCE_COLOR: '3' };
  assert.equal(note(cfg('hud', 'left'), { ...c3, COLUMNS: '120' }), 'hud.align left: the HUD starts at the left edge');
  assert.equal(note(cfg('hud', 'left'), { NO_COLOR: '1' }), 'hud.align left: the HUD starts at the left edge');
  // the HUD draws: how far it moves, 1 column (not "1 columns"), too narrow, unknown
  assert.equal(note(hud, { ...c3, COLUMNS: '120' }), "hud.align center: budget 116 here, so the HUD moves up to 19 columns right (the hotbar's centre from col 39 to col 58), less when its widest line would pass the edge");
  assert.equal(note(hud, { ...c3, COLUMNS: '84' }), "hud.align center: budget 80 here, so the HUD moves up to 1 column right (the hotbar's centre from col 39 to col 40), less when its widest line would pass the edge");
  assert.equal(note(hud, { ...c3, COLUMNS: '85' }), "hud.align center: budget 81 here, so the HUD moves up to 1 column right (the hotbar's centre from col 39 to col 40), less when its widest line would pass the edge");
  assert.equal(note(hud, { ...c3, COLUMNS: '86' }), "hud.align center: budget 82 here, so the HUD moves up to 2 columns right (the hotbar's centre from col 39 to col 41), less when its widest line would pass the edge");
  assert.equal(note(cfg('hud', 'center', 62), { ...c3, COLUMNS: '83' }), "hud.align center: budget 79 here is too narrow to move the HUD (the hotbar's centre is col 39), so it stays at the left edge");
  assert.equal(note(hud, c3), 'hud.align center: the width is unknown here, so the HUD stays at the left edge; Claude Code passes COLUMNS on every render, so there it is centred and follows the window');
  // classic draws: nothing moves, whichever gate reason holds (the budget is at least 80 in each, so "moves" would have shown)
  const cases: [Config, Record<string, string>, string][] = [
    [cfg('hud', 'center', 150), { ...c3, COLUMNS: '120' }, 'budget 116 is below hud.minWidth 150'],
    [cfg('hud', 'center', 100), { ...c3, COLUMNS: '94' }, 'budget 90 is below hud.minWidth 100'],
    [hud, { NO_COLOR: '1', COLUMNS: '150' }, 'no colour (NO_COLOR, FORCE_COLOR=0 or color "never")'],
    [hud, { FORCE_COLOR: '1', COLUMNS: '150' }, '16 colours (FORCE_COLOR=1 or colorDepth "16")'],
    [hud, { ...c3, COLUMNS: '150', HUNGERBAR_ASCII: '1' }, 'ASCII mode (icons "ascii", HUNGERBAR_ASCII or TERM=dumb)'],
  ];
  for (const [c, env, why] of cases) assert.equal(note(c, env), `hud.align center: nothing moves here, because classic draws instead of the HUD: ${why}`, why);
  assert.equal(alignNote(hud, gateHere(hud, 'Unexpected token', { ...c3, COLUMNS: '120' })), 'hud.align center: nothing moves here, because classic draws instead of the HUD: hungerbar.json is invalid');
  // look classic: nothing moves; where the HUD would sit here, or that it would not draw either
  assert.equal(note(classic, { ...c3, COLUMNS: '120' }), "hud.align center: look is classic, so nothing moves; budget 116 here, so the HUD would move up to 19 columns right (the hotbar's centre from col 39 to col 58), less when its widest line would pass the edge");
  assert.equal(note(classic, { ...c3, COLUMNS: '84' }), "hud.align center: look is classic, so nothing moves; budget 80 here, so the HUD would move up to 1 column right (the hotbar's centre from col 39 to col 40), less when its widest line would pass the edge");
  assert.equal(note(cfg('classic', 'center', 62), { ...c3, COLUMNS: '70' }), "hud.align center: look is classic, so nothing moves; budget 66 here is too narrow to move the HUD (the hotbar's centre is col 39), so it would stay at the left edge");
  assert.equal(note(classic, c3), 'hud.align center: look is classic, so nothing moves; the width is unknown here, so the HUD would stay at the left edge; Claude Code passes COLUMNS on every render, so there it would be centred and follow the window');
  assert.equal(note(classic, { ...c3, COLUMNS: '70' }), 'hud.align center: look is classic, so nothing moves; the HUD would not draw here either: budget 66 is below hud.minWidth 80');
  assert.equal(note(classic, { NO_COLOR: '1', COLUMNS: '120' }), 'hud.align center: look is classic, so nothing moves; the HUD would not draw here either: no colour (NO_COLOR, FORCE_COLOR=0 or color "never")');
  // HUNGERBAR_WIDTH is the budget's width, as the gate reads it
  assert.match(note(hud, { ...c3, HUNGERBAR_WIDTH: '200', COLUMNS: '60' }), /^hud\.align center: budget 196 here, so the HUD moves up to 59 columns right/);
});

test('paddingWarning: a statusLine.padding that widthReserve does not cover on both sides is counted as free (fix after reviews 11 and 14)', () => {
  const wr = (n: number): { widthReserve: number } => ({ widthReserve: n });
  assert.equal(paddingWarning(null, wr(0)), null);
  assert.equal(paddingWarning({ type: 'command' }, wr(0)), null, 'no padding');
  assert.equal(paddingWarning({ padding: 0 }, wr(0)), null);
  assert.equal(paddingWarning({ padding: 2 }, wr(4)), null, 'widthReserve covers both sides');
  assert.equal(paddingWarning({ padding: 2 }, wr(5)), null);
  assert.equal(paddingWarning({ padding: '2' as unknown as number }, wr(0)), null, 'not a number');
  assert.equal(paddingWarning({ padding: 2 }, wr(0)),
    'statusLine.padding 2 is not read by Hungerbar and Claude Code pads both sides, 4 columns, but widthReserve is 0: set "widthReserve": 4 in hungerbar.json, so the fit, the HUD\'s gate and a centred HUD leave those columns free');
  assert.match(paddingWarning({ padding: 3 }, wr(1))!, /^statusLine\.padding 3 is not read by Hungerbar and Claude Code pads both sides, 6 columns, but widthReserve is 1: set "widthReserve": 6 /);
  // review 14: Claude Code 2.1.312 draws COLUMNS - 4 - 2 x padding cells, so a reserve of one padding (review 11's
  // advice) still lost padding cells off the end of a line that filled the budget: padding 3 with widthReserve 3 warns
  assert.match(paddingWarning({ padding: 3 }, wr(3))!, /widthReserve is 3: set "widthReserve": 6 in hungerbar\.json/);
  assert.match(paddingWarning({ padding: 2 }, wr(3))!, /widthReserve is 3: set "widthReserve": 4 /, 'one short of both sides');
  assert.match(paddingWarning({ padding: 4 }, wr(0))!, /pads both sides, 8 columns, but widthReserve is 0: set "widthReserve": 8 /);
  assert.equal(paddingWarning({ padding: 3 }, wr(6)), null);
  assert.equal(paddingWarning({ padding: 1 }, wr(2)), null);
});

test('doctor warns while widthReserve is below twice statusLine.padding, and not once it covers both sides (fix after reviews 11 and 14)', () => {
  // no command in the statusLine, so doctor times nothing
  const w = world(JSON.stringify({ look: 'hud', hud: { align: 'center' } }), JSON.stringify({ statusLine: { type: 'command', padding: 2 } }));
  try {
    let r = w.run(['doctor'], { FORCE_COLOR: '3', COLUMNS: '120' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\n {2}warn {2}statusLine\.padding 2 is not read by Hungerbar and Claude Code pads both sides, 4 columns, but widthReserve is 0: set "widthReserve": 4 in hungerbar\.json/);
    assert.match(r.stdout, /hud\.align center: budget 116 here, so the HUD moves up to 19 columns right/);
    // review 11's advice, widthReserve = padding, covers one side of two: Claude Code still cuts a line that fills B
    writeFileSync(w.cfg, JSON.stringify({ look: 'hud', hud: { align: 'center' }, widthReserve: 2 }));
    r = w.run(['doctor'], { FORCE_COLOR: '3', COLUMNS: '120' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\n {2}warn {2}statusLine\.padding 2 is not read by Hungerbar and Claude Code pads both sides, 4 columns, but widthReserve is 2: set "widthReserve": 4 in hungerbar\.json/);
    assert.match(r.stdout, /hud\.align center: budget 114 here, so the HUD moves up to 18 columns right/, 'widthReserve narrows the budget the centring reads');
    writeFileSync(w.cfg, JSON.stringify({ look: 'hud', hud: { align: 'center' }, widthReserve: 4 }));
    r = w.run(['doctor'], { FORCE_COLOR: '3', COLUMNS: '120' });
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stdout, /statusLine\.padding \d/);
    // 120 - 4 - 4 = 112 = 120 - 4 - 2 x 2, the area Claude Code 2.1.312 draws at padding 2
    assert.match(r.stdout, /hud\.align center: budget 112 here, so the HUD moves up to 17 columns right/, 'the budget is the area Claude Code draws');
  } finally {
    w.cleanup();
  }
});

test('README, SPEC and schema.json give widthReserve as twice statusLine.padding (review 14)', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8').replace(/\r\n/g, '\n').split('\n');
  const spec = readFileSync(join(ROOT, 'SPEC.md'), 'utf8').replace(/\r\n/g, '\n').split('\n');
  type Prop = { description: string; properties?: Record<string, Prop> };
  const schema = JSON.parse(readFileSync(join(ROOT, 'schema.json'), 'utf8')) as { properties: Record<string, Prop> };
  const line = (lines: string[], start: string): string => {
    const l = lines.find((x) => x.startsWith(start));
    assert.ok(l, `a line starting ${start}`);
    return l;
  };
  const pad = line(readme, '- **Padding.** ');
  assert.match(pad, /puts the padding on both sides of the status line/);
  assert.match(pad, /set `widthReserve` to twice it \(padding 3 needs `"widthReserve": 6`/);
  const edge = line(spec, '- **Nothing past the edge.** ');
  assert.match(edge, /the area it draws is COLUMNS - 4 - 2p/);
  assert.match(edge, /the widest line can end up to 2p columns past the edge/);
  assert.match(edge, /The reserve that fixes both is 2p/);
  assert.match(line(spec, 'Budget B = (HUNGERBAR_WIDTH ?? COLUMNS) - 4 - widthReserve. '), /COLUMNS - 4 - 2 × padding[\s\S]*"widthReserve": 2 × padding/);
  assert.match(line(spec, '- **Padding** (hidden ConPTY runs of Claude Code 2.1.312'), /applies `padding` p on both sides/);
  assert.match(line(spec, '  - `doctor` has a Look section: '), /warns when `widthReserve` is below twice `statusLine\.padding`/);
  assert.match(schema.properties.widthReserve!.description, /on both sides of the status line, so with a non-zero padding set this to twice it/);
  assert.match(schema.properties.hud!.properties!.align!.description, /so set widthReserve to twice it/);
  // review 11's one-padding advice is gone everywhere
  for (const text of [readme.join('\n'), spec.join('\n'), JSON.stringify(schema)]) {
    assert.doesNotMatch(text, /to the same number|mirror it in widthReserve|set this to a non-zero padding too|up to p columns past the edge/);
  }
});

test('look hud: a backup, key order, other keys, CRLF and the final newline kept, the BOM dropped; settings.json untouched', () => {
  const original = '\uFEFF{\r\n  "$schema": "x",\r\n  "icons": "unicode",\r\n  "hud": {\r\n    "minWidth": 96\r\n  },\r\n  "network": {\r\n    "usageApi": false\r\n  }\r\n}\r\n';
  const w = world(original);
  try {
    const settingsBefore = readFileSync(w.settingsFile);
    const r = w.run(['look', 'hud', '--fable', 'fable-tooltip']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /- hud: \{"minWidth":96\}\n\+ hud: \{"minWidth":96,"fable":"tooltip"\}/);
    assert.match(r.stdout, CONSENT);
    // the HUD stays the HUD (no look key: the default), so the way back is the Fable option it had, boss, and the key
    // that turns the usage API off again, which --fable off would not
    assert.match(r.stdout, /Claude Code draws the new look on its next render; settings\.json is untouched\. Back with: hungerbar look hud --fable boss\n/);
    assert.match(r.stdout, /\nTo turn the usage API off again, set network\.usageApi to false in hungerbar\.json; --fable off leaves it on\.\n/);
    assert.match(r.stdout, /note: Claude Code's statusLine does not run Hungerbar yet: hungerbar setup/);
    const [bak] = w.backups();
    assert.ok(bak, 'backup written');
    assert.equal(readFileSync(join(w.claude, bak), 'utf8'), original, 'the backup is the file as it was');
    // no "look": hud is the default (SPEC §0.10)
    assert.equal(w.text(), '{\r\n  "$schema": "x",\r\n  "icons": "unicode",\r\n  "hud": {\r\n    "minWidth": 96,\r\n    "fable": "tooltip"\r\n  },\r\n'
      + '  "network": {\r\n    "usageApi": true,\r\n    "scopedWeekly": true\r\n  }\r\n}\r\n');
    assert.ok(readFileSync(w.settingsFile).equals(settingsBefore), 'settings.json untouched');

    // the same again: nothing to change, no second backup
    const again = w.run(['look', 'hud', '--fable', 'tooltip']);
    assert.match(again.stdout, /already look hud with fable tooltip: nothing to change\./);
    assert.equal(w.backups().length, 1);

    // look classic changes only look, and its way back is the HUD (hud.fable kept)
    const before = JSON.parse(w.text()) as Record<string, unknown>;
    const classic = w.run(['look', 'classic']);
    assert.equal(classic.status, 0);
    assert.match(classic.stdout, /Back with: hungerbar look hud\n/);
    assert.doesNotMatch(classic.stdout, /Back with: hungerbar look classic/);
    assert.deepEqual(JSON.parse(w.text()), { ...before, look: 'classic' });
    assert.deepEqual(Object.keys(JSON.parse(w.text())), [...Object.keys(before), 'look']);
    assert.match(w.run(['look', 'hud']).stdout, /Back with: hungerbar look classic\n/);
    assert.deepEqual(JSON.parse(w.text()), { ...before, look: 'hud' }, 'look hud brings back the HUD as it was, written over classic');
  } finally {
    w.cleanup();
  }
});

test('the way back after a Fable change on the default HUD: the option it had, and the key that turns the usage API off again', () => {
  const w = world();
  try {
    // boss is the default, so --fable boss writes only the network keys: no look command undoes them, the note does
    let r = w.run(['look', 'hud', '--fable', 'boss']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\+ network: \{"usageApi":true,"scopedWeekly":true\}\n/);
    assert.match(r.stdout, /Claude Code draws the new look on its next render; settings\.json is untouched\.\n/);
    assert.doesNotMatch(r.stdout, /Back with/, 'no look command is the way back');
    assert.match(r.stdout, /\nTo turn the usage API off again, set network\.usageApi to false in hungerbar\.json; --fable off leaves it on\.\n/);
    // --fable off over the default boss: the way back is boss; the network keys stay as they are, so no note
    r = w.run(['look', 'hud', '--fable', 'off']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Back with: hungerbar look hud --fable boss\n/);
    assert.doesNotMatch(r.stdout, /Back with: hungerbar look classic/);
    assert.doesNotMatch(r.stdout, /To turn/);
    assert.deepEqual(JSON.parse(w.text()).network, { usageApi: true, scopedWeekly: true }, '--fable off leaves the usage API on');
    // with --align too, each option that changed is named, in order
    r = w.run(['look', 'hud', '--fable', 'tail', '--align', 'left']);
    assert.match(r.stdout, /Back with: hungerbar look hud --fable off --align center\n/);
  } finally {
    w.cleanup();
  }
  // with the usage API on and scopedWeekly off, a Fable option turns on scopedWeekly alone, and the note names it
  const s = world('{\n  "network": {\n    "usageApi": true\n  }\n}\n');
  try {
    const r = s.run(['look', 'hud', '--fable', 'tail']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Back with: hungerbar look hud --fable boss\n/);
    assert.match(r.stdout, /\nTo turn Fable's weekly off again, set network\.scopedWeekly to false in hungerbar\.json; --fable off leaves it on\.\n/);
  } finally {
    s.cleanup();
  }
});

test('mergeLook: a key a consent question answered is written at its default into a file without it', () => {
  assert.deepEqual(mergeLook({}, { look: 'hud', pr: 'off' }), {}, 'a flag at its default writes nothing');
  assert.deepEqual(mergeLook({}, { look: 'hud', pr: 'off', answered: ['pr'] }), { hud: { pr: 'off' } }, "setup's no is written");
  assert.deepEqual(mergeLook({ hud: { pr: 'off' } }, { look: 'hud', pr: 'off', answered: ['pr'] }), { hud: { pr: 'off' } }, 'already there');
  assert.deepEqual(mergeLook({ hud: { pr: 'on' } }, { look: 'hud', pr: 'off', answered: ['pr'] }), { hud: { pr: 'off' } });
  assert.deepEqual(mergeLook({}, { look: 'hud', pr: 'on', answered: ['pr'] }), { hud: { pr: 'on' } });
  assert.deepEqual(mergeLook({}, { look: 'hud', user: 'user', answered: ['pr'] }), {}, 'only the answered keys');
});

test('a missing hungerbar.json is created with its $schema; look hud on no file writes nothing (the default, SPEC §0.10)', () => {
  const w = world();
  try {
    let r = w.run(['look', 'hud']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /already look hud: nothing to change\./);
    assert.doesNotMatch(r.stdout, CONSENT, 'no --fable: the usage API stays off');
    assert.equal(existsSync(w.cfg), false);
    r = w.run(['look', 'classic']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\(will be created\)/);
    assert.equal(w.text(), JSON.stringify({ $schema: SCHEMA_URL, look: 'classic' }, null, 2) + '\n');
    assert.deepEqual(w.backups(), []);
  } finally {
    w.cleanup();
  }
});

test('--print shows the change and writes nothing', () => {
  const w = world('{\n  "network": {\n    "usageApi": true\n  }\n}\n');
  try {
    const before = w.snapshot();
    const r = w.run(['look', 'hud', '--fable', 'beacon', '--print']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /- network: \{"usageApi":true\}\n\+ network: \{"usageApi":true,"scopedWeekly":true\}\n\+ hud: \{"fable":"beacon"\}\n/);
    assert.match(r.stdout, CONSENT);
    assert.match(r.stdout, /Nothing was written \(--print\)\./);
    assert.deepEqual(w.snapshot(), before);
  } finally {
    w.cleanup();
  }
});

test('the consent text is printed for every Fable option but off', () => {
  for (const fable of HUD_FABLES) {
    const w = world();
    try {
      const r = w.run(['look', 'hud', '--fable', fable]);
      assert.equal(r.status, 0, r.stderr);
      if (fable === 'off') assert.doesNotMatch(r.stdout, CONSENT, fable);
      else assert.match(r.stdout, CONSENT, fable);
      const cfg = JSON.parse(w.text()) as { hud?: { fable: string }; network?: unknown };
      // boss is the default (SPEC §0.10): a file with no hud.fable gets none, as center writes no hud.align (fix after
      // review 11), but its network keys; off is written
      assert.equal(cfg.hud?.fable, fable === 'boss' ? undefined : fable);
      assert.deepEqual(cfg.network, fable === 'off' ? undefined : { usageApi: true, scopedWeekly: true });
    } finally {
      w.cleanup();
    }
  }
  const w = world();
  try {
    const r = w.run(['look', 'hud', '--fable', 'tail'], { HUNGERBAR_OFFLINE: '1' });
    assert.match(r.stdout, /note: CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC or HUNGERBAR_OFFLINE is set here/);
  } finally {
    w.cleanup();
  }
});

test('look hud --align left|center: a backup, hud.align next to the other hud keys, the way back, --print; the note on where it sits here', () => {
  const w = world('{\n  "look": "hud",\n  "hud": {\n    "minWidth": 96\n  }\n}\n');
  try {
    // center is the default (SPEC §0.10): nothing to write on a file with no hud.align; left is written
    assert.match(w.run(['look', 'hud', '--align', 'center', '--print']).stdout, /already look hud with align center: nothing to change\./);
    let r = w.run(['look', 'hud', '--align', 'left', '--print']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /- hud: \{"minWidth":96\}\n\+ hud: \{"minWidth":96,"align":"left"\}\nNothing was written \(--print\)\./);
    assert.deepEqual(w.backups(), []);
    r = w.run(['look', 'hud', '--align', 'left'], { COLUMNS: '120', FORCE_COLOR: '3' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Back with: hungerbar look hud --align center\n/, 'the HUD only moved: the way back is the align it had');
    assert.match(r.stdout, /hud\.align left: the HUD starts at the left edge \(this terminal\)/);
    assert.equal(w.text(), '{\n  "look": "hud",\n  "hud": {\n    "minWidth": 96,\n    "align": "left"\n  }\n}\n');
    assert.equal(w.backups().length, 1);
    assert.match(w.run(['look', 'hud', '--align', 'left']).stdout, /already look hud with align left: nothing to change\./);
    assert.equal(w.backups().length, 1);
    r = w.run(['look', 'hud', '--align', 'centre'], { COLUMNS: '120', FORCE_COLOR: '3' });
    assert.match(r.stdout, /Back with: hungerbar look hud --align left\n/);
    assert.match(r.stdout, /hud\.align center: budget 116 here, so the HUD moves up to 19 columns right/);
    assert.equal(w.text(), '{\n  "look": "hud",\n  "hud": {\n    "minWidth": 96,\n    "align": "center"\n  }\n}\n', 'center over left is written');
    r = w.run(['look', 'hud', '--align', 'left'], { HUNGERBAR_HUD_ALIGN: 'center' });
    assert.match(r.stdout, /Back with: hungerbar look hud --align center\n/);
    assert.match(r.stdout, /note: HUNGERBAR_HUD_ALIGN=center is set here and wins over the file\./);
    assert.equal(JSON.parse(w.text()).hud.align, 'left');
    // from classic, the way back is classic; --fable and --align together
    r = w.run(['look', 'classic']);
    assert.match(r.stdout, /Back with: hungerbar look hud\n/);
    r = w.run(['look', 'hud', '--fable', 'off', '--align', 'center']);
    assert.match(r.stdout, /Back with: hungerbar look classic\n/);
    assert.deepEqual(JSON.parse(w.text()), { look: 'hud', hud: { minWidth: 96, align: 'center', fable: 'off' } }, 'off is written into a file with no hud.fable (boss)');
    assert.match(w.run(['look', 'hud', '--fable', 'off', '--align', 'center']).stdout, /already look hud with fable off, align center: nothing to change\./);
    // where classic draws here, the note says nothing moves (fix after review 11)
    r = w.run(['look', 'hud', '--align', 'center'], { COLUMNS: '94', FORCE_COLOR: '3' });
    assert.match(r.stdout, /classic here: budget 90 is below hud\.minWidth 96 \(this terminal\)\nhud\.align center: nothing moves here, because classic draws instead of the HUD: budget 90 is below hud\.minWidth 96 \(this terminal\)\n/);
  } finally {
    w.cleanup();
  }
});

test('refused before any write: a bad --fable, --fable without hud, an unknown look, invalid JSON, a non-object, non-UTF-8', () => {
  const cases: Array<[string | Buffer, string[], RegExp]> = [
    ['{"a": 1}', ['look', 'hud', '--align', 'middle'], /--align takes left or center \(got "middle"\)\nusage: hungerbar look \[classic\|hud\] \[--fable [^\]]*\] \[--align left\|center\] \[--pr on\|off\] \[--user off\|user\|user@host\] \[--op off\|tag\|gold\] \[--bed on\|off\] \[--phantoms on\|off\] \[--print\]/],
    ['{"a": 1}', ['look', 'hud', '--align'], /--align takes left or center\n/],
    ['{"a": 1}', ['look', 'classic', '--align', 'center'], /--align goes with the HUD: hungerbar look hud --align center/],
    ['{"a": 1}', ['look', '--align', 'left'], /--align goes with the HUD: hungerbar look hud --align left/],
    ['{"a": 1}', ['look', 'hud', '--alng', 'center'], /unknown option --alng/],
    ['{"a": 1}', ['look', 'hud', '--pr', 'maybe'], /--pr takes on or off \(got "maybe"\)\n/],
    ['{"a": 1}', ['look', 'hud', '--pr'], /--pr takes on or off\n/],
    ['{"a": 1}', ['look', 'classic', '--pr', 'on'], /--pr goes with the HUD: hungerbar look hud --pr on/],
    ['{"a": 1}', ['look', '--pr', 'off'], /--pr goes with the HUD: hungerbar look hud --pr off/],
    ['{ "look": "hud", }', ['look', 'hud', '--pr', 'on'], /cannot be read as a JSON object[\s\S]*"look": "hud"\n  "hud": \{ "pr": "on" \}/],
    ['{ "look": "hud", }', ['look', 'hud', '--align', 'center'], /cannot be read as a JSON object[\s\S]*"look": "hud"\n  "hud": \{ "align": "center" \}/],
    ['{"a": 1}', ['look', 'hud', '--fable', 'sparkle'], /--fable takes off, tail, tooltip, boss, beacon \(got "sparkle"\)/],
    ['{"a": 1}', ['look', 'hud', '--fable'], /--fable takes off, tail, tooltip, boss, beacon\n/],
    ['{"a": 1}', ['look', 'classic', '--fable', 'boss'], /--fable goes with the HUD: hungerbar look hud --fable boss/],
    ['{"a": 1}', ['look', '--fable', 'boss'], /--fable goes with the HUD/],
    ['{"a": 1}', ['look', 'minecraft'], /unknown look "minecraft"/],
    ['{"a": 1}', ['look', 'hud', 'classic'], /one look at a time/],
    ['{ "look": "classic", }', ['look', 'hud', '--fable', 'boss'], /cannot be read as a JSON object[\s\S]*Fix it by hand[\s\S]*"look": "hud"\n  "hud": \{ "fable": "boss" \}[\s\S]*"network": \{ "usageApi": true, "scopedWeekly": true \}/],
    ['[]', ['look', 'hud'], /is not a JSON object/],
    [Buffer.from('{"note": "caf\xe9"}', 'latin1'), ['look', 'hud'], /it is not UTF-8 text/],
    // an unknown option (a typo) or a value on --print, before anything is read
    ['{"a": 1}', ['look', 'hud', '--pritn'], /unknown option --pritn\nusage: hungerbar look/],
    ['{"a": 1}', ['look', 'hud', '--fabel=boss'], /unknown option --fabel/],
    ['{"a": 1}', ['look', 'hud', '--fabel', 'boss'], /unknown option --fabel/],
    ['{"a": 1}', ['look', '--pritn'], /unknown option --pritn/],
    ['{"a": 1}', ['look', 'hud', '--print=no'], /--print takes no value/],
  ];
  for (const [file, args, msg] of cases) {
    const w = world(file);
    try {
      const before = w.snapshot();
      const r = w.run(args);
      assert.equal(r.status, 1, args.join(' '));
      assert.match(r.stderr, msg, args.join(' '));
      assert.doesNotMatch(r.stderr, /at .*\.mjs/, 'no stack trace');
      assert.deepEqual(w.snapshot(), before, `${args.join(' ')} wrote nothing`);
    } finally {
      w.cleanup();
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// preview --look / --fable, the prompt's previews, glyphs --hud, doctor, help
// ---------------------------------------------------------------------------------------------------------------------

test('preview --look/--fable equals preview with that hungerbar.json (which hud.e2e (b) holds to the oracle), and writes nothing', () => {
  const plain = world();
  try {
    for (const fable of HUD_FABLES) {
      const file = world(JSON.stringify({ look: 'hud', hud: { fable }, network: { usageApi: true, scopedWeekly: true } }));
      try {
        for (const force of ['3', '2']) {
          const want = file.run(['preview'], { FORCE_COLOR: force });
          assert.equal(want.status, 0);
          const got = plain.run(['preview', '--look', 'hud', '--fable', fable], { FORCE_COLOR: force });
          assert.equal(got.stderr, '');
          assert.equal(got.stdout, want.stdout, `${fable} at FORCE_COLOR=${force}`);
          if (fable !== 'off') assert.equal(plain.run(['preview', '--fable', `fable-${fable}`], { FORCE_COLOR: force }).stdout, want.stdout, '--fable alone means the HUD');
        }
      } finally {
        file.cleanup();
      }
    }
    // the prompt's previews are the same renders, in memory
    for (const fable of HUD_FABLES) {
      const r = plain.run(['preview', '--look', 'hud', '--fable', fable, '--situation', 'fable'], { FORCE_COLOR: '3' });
      assert.equal(r.stdout, demoLines('fable', 'hud', fable, 'truecolor', defaults(), null, WHO).join('\n') + '\n', fable);
      const opus = plain.run(['preview', '--look', 'hud', '--fable', fable, '--situation', 'normal'], { FORCE_COLOR: '2' });
      assert.equal(opus.stdout, demoLines('normal', 'hud', fable, '256', defaults(), null, WHO).join('\n') + '\n', fable);
    }
    // no file and no --look: the HUD, the default (SPEC §0.10); --look classic draws the classic lines
    assert.match(plain.run(['preview', '--situation', 'tight'], { FORCE_COLOR: '3' }).stdout, /⛏/);
    const classic = plain.run(['preview', '--situation', 'tight', '--look', 'classic'], { FORCE_COLOR: '3' });
    assert.equal(classic.stdout, demoLines('tight', 'classic', 'off', 'truecolor', defaults()).join('\n') + '\n');
    assert.equal(existsSync(plain.cache), false, 'preview never writes the caches');
    assert.equal(existsSync(plain.cfg), false);
  } finally {
    plain.cleanup();
  }
});

test('preview --align center --width N: the same bytes as that hungerbar.json in an N-column window, and as the prompt\'s preview', () => {
  const plain = world(), file = world(JSON.stringify({ look: 'hud', hud: { align: 'center' } }));
  try {
    const CENTRE: Config = { ...defaults(), hud: { ...defaults().hud, align: 'center' } };
    for (const [cols, force, depth] of [['120', '3', 'truecolor'], ['141', '2', '256'], ['200', '3', 'truecolor']] as const) {
      const want = file.run(['preview', '--situation', 'normal'], { FORCE_COLOR: force, HUNGERBAR_WIDTH: cols });
      const got = plain.run(['preview', '--situation', 'normal', '--look', 'hud', '--align', 'center', '--width', cols], { FORCE_COLOR: force });
      assert.equal(got.stderr, '');
      assert.equal(got.stdout, want.stdout, `${cols} at FORCE_COLOR=${force}`);
      assert.equal(plain.run(['preview', '--situation', 'normal', '--align', 'center', '--cols', cols], { FORCE_COLOR: force }).stdout, want.stdout, '--align alone means the HUD; --cols is --width');
      assert.equal(got.stdout, demoLines('normal', 'hud', 'off', depth, CENTRE, Number(cols), WHO).join('\n') + '\n');
      const lead = /^\u2800*/u.exec(got.stdout)![0].length;
      assert.equal(lead, Math.max(0, Math.min(Math.floor((Number(cols) - 4) / 2) - 39, Number(cols) - 4 - 81)), `${cols}: the lead`);
    }
    // left, or no --width: the HUD at the left edge, as before
    const left = plain.run(['preview', '--situation', 'normal', '--look', 'hud'], { FORCE_COLOR: '3' });
    assert.equal(plain.run(['preview', '--situation', 'normal', '--look', 'hud', '--align', 'left', '--width', '200'], { FORCE_COLOR: '3' }).stdout, left.stdout);
    assert.equal(plain.run(['preview', '--situation', 'normal', '--look', 'hud', '--align', 'center'], { FORCE_COLOR: '3' }).stdout, left.stdout);
    assert.equal(left.stdout, demoLines('normal', 'hud', 'off', 'truecolor', CENTRE, null, WHO).join('\n') + '\n', 'no width: the left edge');
    // the fable situation: the boss line moves with the rest, its own 16 U+2800 before the bar (no name, SPEC §0.11)
    const boss = plain.run(['preview', '--situation', 'fable', '--fable', 'boss', '--align', 'center', '--width', '120'], { FORCE_COLOR: '3' }).stdout.trimEnd().split('\n');
    assert.equal(boss.length, 6);
    const leads = boss.map((l) => /^\u2800*/u.exec(l)![0].length);
    assert.ok(leads[1]! > 0 && leads.slice(1, 5).every((n) => n === leads[1]) && leads[0] === leads[1]! + 16 && leads[5] === leads[1]! + 9, JSON.stringify(leads));
    for (const [args, msg] of [
      [['--look', 'classic', '--align', 'center'], /--align goes with the HUD: --look hud --align center/],
      [['--align', 'middle'], /--align takes left or center \(got "middle"\)/],
      [['--align'], /--align takes left or center\n/],
      [['--width', 'abc'], /--width takes a number of columns \(got "abc"\)/],
      [['--width', '0'], /--width takes a number of columns \(got "0"\)/],
      [['--width'], /--width takes a number of columns\n/],
      [['--cols', '-5'], /--cols takes a number of columns \(got "-5"\)/],
      [['--width', '120', '--cols', '100'], /--width and --cols are the same option; give one/],
    ] as const) {
      const r = plain.run(['preview', ...args]);
      assert.equal(r.status, 1, args.join(' '));
      assert.match(r.stderr, msg, args.join(' '));
    }
    assert.equal(existsSync(plain.cache), false, 'preview never writes the caches');
  } finally {
    plain.cleanup();
    file.cleanup();
  }
});

test('preview: the boss bar on the fable situation; a HUD that cannot draw says why; bad flags are refused', () => {
  const w = world();
  try {
    const boss = w.run(['preview', '--situation', 'fable', '--look', 'hud', '--fable', 'boss'], { FORCE_COLOR: '3' });
    assert.equal(boss.stdout.trimEnd().split('\n').length, 6, 'the boss bar, 4 lines and the hotbar\'s bottom edge');
    const [top, line1] = boss.stdout.split('\n');
    assert.match(top!, /^\u2800{16}\x1b\[[^m]*m\u{1FB82}/u, 'the boss bar, its name left out (SPEC §0.11)');
    assert.doesNotMatch(top!, /Fable/);
    assert.match(line1!, /Fable\s5\.1/, 'the line below names the model in use');
    assert.match(boss.stdout.trimEnd().split('\n')[5]!, /^\u2800{9}\x1b\[38;2;93;93;93m\u{1FB82}{6}\x1b\[0m\u2800/u);
    const nocolor = w.run(['preview', '--situation', 'normal', '--look', 'hud', '--no-color']);
    assert.equal(nocolor.status, 0);
    assert.match(nocolor.stderr, /classic drawn: no colour/);
    assert.equal(nocolor.stdout, w.run(['preview', '--situation', 'normal', '--no-color']).stdout, 'classic, as without --look');
    for (const [args, msg] of [
      [['--look', 'classic', '--fable', 'boss'], /--fable goes with the HUD/],
      [['--look', 'minecraft'], /--look takes classic or hud \(got "minecraft"\)/],
      [['--fable', 'mount'], /--fable takes off, tail, tooltip, boss, beacon \(got "mount"\)/],
      [['--look', 'hud', '--fabel', 'boss'], /unknown option --fabel \(see hungerbar --help\)/],
      [['--situaton', 'fable'], /unknown option --situaton/],
      [['--no-color=1'], /--no-color takes no value/],
      [['fable'], /unexpected argument "fable"/],
    ] as const) {
      const r = w.run(['preview', ...args]);
      assert.equal(r.status, 1, args.join(' '));
      assert.match(r.stderr, msg);
    }
  } finally {
    w.cleanup();
  }
});

test('glyphs --hud: every glyph the plan lists (and the rest of the HUD probe set and the frame\'s blank), each at the reference engine width', () => {
  const r = runDist('', { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? 'C:\\Windows' }, ['glyphs', '--hud']);
  assert.equal(r.status, 0);
  const rows = r.stdout.split('\n').filter((l) => l.startsWith('|'));
  assert.equal(rows.length, HUD_GLYPHS.length);
  const shown = new Set<string>();
  for (const row of rows) {
    const m = /^\|(.+?)\|  \|(\.*)\|  (\d+)  U\+([0-9A-F]+)  /u.exec(row);
    assert.ok(m, row);
    const [, g, ruler, w, cp] = m;
    assert.equal(Number(w), cellWidth(g!), `${g} width`);
    assert.equal(ruler!.length, Number(w));
    assert.equal(g!.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0'), cp);
    shown.add(g!);
  }
  const PLAN = '⛏ Ⅰ Ⅱ Ⅲ Ⅳ Ⅴ 📖 ▀ ▒ ▁ ▂ ▃ ▄ ▅ ▆ ▇ █ ▐ ▌ 🮂 ⬢ ⬡ ◈ ┃ ╻ ☼ ☾ ☠ ◦ ○ ◉ ⌂ ◆ ♥ 🍗 ↻ ⎇'.split(' ');
  for (const g of PLAN) assert.ok(shown.has(g), `${g} on the ruler`);
  assert.deepEqual([...shown].filter((g) => !PLAN.includes(g)), ['▏', '▎', '▍', '▋', '▊', '▉', '\u2800', '↑', '↓', '●', '✓', '×', '±', '‼', '◌',
    '\u{1FB84}', '\u{1FB08}', '\u{1FB0B}', '\u{1FB05}', '\u{1FB22}', '\u{1FB2D}', '\u{1FB16}', '·', '…'],
    'and the wear bar eighths, the bottom edge row\'s blank (U+2800), the git state\'s arrows, the PR\'s marks, the bed and the phantoms (0.7.0), the separator and the ellipsis');
  // the hotbar's frame (0.5.1): its edges are two probed glyphs, its blank cells U+2800
  for (const [g, what] of [['\u{1FB82}', /bottom edge/], ['▂', /top edge of the offhand/], ['\u2800', /blank cells of the bottom edge row/]] as const) {
    assert.match(rows.find((r) => r.startsWith(`|${g}|`)) ?? '', what, `U+${g.codePointAt(0)!.toString(16).toUpperCase()}`);
  }
  assert.equal(shown.size, rows.length, 'no glyph twice');
  // the classic ruler is unchanged
  const classic = runDist('', { PATH: process.env.PATH ?? '' }, ['glyphs']);
  assert.match(classic.stdout, /^\|♥\|  \|\.\|  1  U\+2665  heart \(5-hour session\)$/m);
  assert.equal(classic.stdout.split('\n').filter((l) => l.startsWith('|')).length, 17);
});

test("doctor's Look section: the look, the verdict here and its inputs, the usage API, usage.json's scoped limits, the history files", () => {
  const w = world(JSON.stringify({ look: 'hud', hud: { fable: 'boss', align: 'left' }, network: { usageApi: true } }), null);
  try {
    const acct = acctDir(w.env);
    mkdirSync(acct, { recursive: true });
    writeFileSync(join(acct, 'usage.json'), JSON.stringify({ v: 1, at: NOW - 3700, extra: null, lockUntil: 0, error: 'http-429',
      scoped: [{ name: 'Fable', pct: 62, resets_at: NOW + 190800 }, { name: 'Opus', pct: 100, resets_at: NOW - 60 }] }));
    mkdirSync(join(w.cache, 'hud'));
    for (const f of ['a.1.json', 'b.2.json', 'c.3.json.123.tmp']) writeFileSync(join(w.cache, 'hud', f), '{}');
    const before = w.snapshot();
    const r = w.run(['doctor'], { HUNGERBAR_NOW: String(NOW), FORCE_COLOR: '3', COLUMNS: '70' });
    assert.equal(r.status, 0, r.stderr);
    const look = r.stdout.slice(r.stdout.indexOf('\nLook\n'));
    assert.match(look, /ok {4}look hud, hud\.fable boss, hud\.minWidth 80/);
    assert.match(look, /warn {2}classic here: budget 66 is below hud\.minWidth 80/);
    assert.match(look, /here: 24-bit colour, ASCII off, budget 66 against hud\.minWidth 80/);
    assert.match(look, / {2}· {5}hud\.align left: the HUD starts at the left edge\n/);
    assert.match(look, /usage API on, scopedWeekly off/);
    assert.match(look, /warn {2}hud\.fable boss needs network\.usageApi and network\.scopedWeekly/);
    assert.match(look, /usage\.json: Fable 38% left, full again in 2d 5h \(fetched 1h 1m ago, last error http-429\)/);
    assert.match(look, /usage\.json: Opus 0% left, reset passed/);
    assert.match(look, /2 HUD history file\(s\) in /);
    assert.deepEqual(w.snapshot(), before, 'doctor writes nothing');

    const ok = w.run(['doctor'], { HUNGERBAR_NOW: String(NOW), FORCE_COLOR: '3', HUNGERBAR_LOOK: 'classic' });
    assert.match(ok.stdout, /look classic \(HUNGERBAR_LOOK=classic wins over the file\)/);
    assert.match(ok.stdout, /classic here \(look is classic\); the HUD would draw here \(24-bit colour\)/);
    assert.match(ok.stdout, /width unknown \(the HUD always draws\)/);

    // centred: doctor says how far it moves here, and when HUNGERBAR_HUD_ALIGN wins over the file
    const centred = w.run(['doctor'], { HUNGERBAR_NOW: String(NOW), FORCE_COLOR: '3', COLUMNS: '200', HUNGERBAR_HUD_ALIGN: 'center' });
    assert.match(centred.stdout, /ok {4}look hud, hud\.fable boss, hud\.minWidth 80, hud\.align center \(HUNGERBAR_HUD_ALIGN=center wins over the file\)\n/);
    assert.match(centred.stdout, / {2}· {5}hud\.align center: budget 196 here, so the HUD moves up to 59 columns right \(the hotbar's centre from col 39 to col 98\), less when its widest line would pass the edge\n/);
    const unknown = w.run(['doctor'], { HUNGERBAR_NOW: String(NOW), FORCE_COLOR: '3', HUNGERBAR_HUD_ALIGN: 'center' });
    assert.match(unknown.stdout, /hud\.align center: the width is unknown here, so the HUD stays at the left edge/);
    // the note follows the verdict above it: where classic draws, nothing moves (fix after review 11)
    const narrow = w.run(['doctor'], { HUNGERBAR_NOW: String(NOW), FORCE_COLOR: '3', COLUMNS: '70', HUNGERBAR_HUD_ALIGN: 'center' });
    assert.match(narrow.stdout, /warn {2}classic here: budget 66 is below hud\.minWidth 80\n/);
    assert.match(narrow.stdout, / {2}· {5}hud\.align center: nothing moves here, because classic draws instead of the HUD: budget 66 is below hud\.minWidth 80\n/);
    const plain = w.run(['doctor'], { HUNGERBAR_NOW: String(NOW), NO_COLOR: '1', COLUMNS: '150', HUNGERBAR_HUD_ALIGN: 'center' });
    assert.match(plain.stdout, /warn {2}classic here: no colour/);
    assert.match(plain.stdout, / {2}· {5}hud\.align center: nothing moves here, because classic draws instead of the HUD: no colour \(NO_COLOR, FORCE_COLOR=0 or color "never"\)\n/);
    const classic = w.run(['doctor'], { HUNGERBAR_NOW: String(NOW), FORCE_COLOR: '3', COLUMNS: '120', HUNGERBAR_LOOK: 'classic', HUNGERBAR_HUD_ALIGN: 'center' });
    assert.match(classic.stdout, / {2}· {5}hud\.align center: look is classic, so nothing moves; budget 116 here, so the HUD would move up to 19 columns right/);
    for (const r of [narrow, plain, classic]) assert.doesNotMatch(r.stdout, /the HUD moves up to/);
    assert.doesNotMatch(centred.stdout, /statusLine\.padding/, 'no settings.json: no padding to warn about');
  } finally {
    w.cleanup();
  }
});

test('help names look, glyphs --hud and the new setup and preview flags', () => {
  const r = runDist('', { PATH: process.env.PATH ?? '' }, ['--help']);
  assert.equal(r.status, 0);
  for (const s of ['hungerbar look [classic|hud] [--fable off|tail|tooltip|boss|beacon] [--align left|center] [--print]', 'hungerbar glyphs [--hud]',
    '[--look classic|hud] [--fable off|tail|tooltip|boss|beacon] [--align left|center]', '--situation normal|tight|fresh|extra|fable|all',
    '[--width N]']) assert.ok(r.stdout.includes(s), s);
});

// ---------------------------------------------------------------------------------------------------------------------
// 0.7.0: --pr, --user, --op, --bed and --phantoms in look, preview and doctor; the 0.7.0 glyph census
// ---------------------------------------------------------------------------------------------------------------------

test('HUD_FLAGS: each 0.7.0 key takes exactly the values the config reads, strictly; mergeLook writes a default only over a different value', () => {
  const d = defaults().hud;
  for (const [k, list] of [['pr', HUD_PRS], ['user', HUD_USERS], ['op', HUD_OPS], ['bed', HUD_SWITCHES], ['phantoms', HUD_SWITCHES]] as const) {
    assert.deepEqual([...HUD_FLAGS[k]].sort(), [...list].sort(), k);
    for (const v of list) assert.equal(parseHudOption(k, v), v, `${k} ${v}`);
    for (const bad of ['', 'ON', 'yes', 'true', 'constructor', undefined]) assert.equal(parseHudOption(k, bad), null, `${k} ${String(bad)}`);
    assert.ok((list as readonly string[]).includes(d[k]), `${k}'s default is one of its values`);
  }
  assert.deepEqual(HUD_FLAG_KEYS, ['pr', 'user', 'op', 'bed', 'phantoms']);
  assert.deepEqual(hudFlag(parseArgs(['--user', 'user@host'], ['user']), 'user'), { ok: true, value: 'user@host' });
  assert.deepEqual(hudFlag(parseArgs(['--op=red'], ['op']), 'op'), { ok: false, error: '--op takes off, tag or gold (got "red")' });
  assert.deepEqual(hudFlag(parseArgs(['--bed', '--print'], ['bed']), 'bed'), { ok: false, error: '--bed takes on or off' });
  assert.deepEqual(hudFlag(parseArgs([], ['phantoms']), 'phantoms'), { ok: true, value: null });
  // hudOptions: flag by flag, a bad value before a flag in the wrong place; every option for the HUD
  const all = parseArgs(['--fable', 'boss', '--align', 'centre', '--pr', 'on', '--user', 'user', '--op', 'gold', '--bed', 'off', '--phantoms', 'off'], ['fable', 'align', ...HUD_FLAG_KEYS]);
  assert.deepEqual(hudOptions(all, false, 'x'), { ok: true, value: { fable: 'boss', align: 'center', pr: 'on', user: 'user', op: 'gold', bed: 'off', phantoms: 'off' } });
  assert.deepEqual(hudOptions(all, true, '--look hud'), { ok: false, error: '--fable goes with the HUD: --look hud --fable boss' });
  assert.deepEqual(hudOptions(parseArgs(['--op', 'gold', '--user', 'x'], ['op', 'user']), true, 'h'), { ok: false, error: '--user takes off, user or user@host (got "x")' });

  // the merge: the defaults (pr off, user user, op gold, bed and phantoms on; SPEC §0.10) are written only over a different value
  const before = { $schema: 'x', hud: { fable: 'boss', align: 'center' }, look: 'hud' };
  assert.deepEqual(mergeLook(before, { look: 'hud', pr: 'off', user: 'user', op: 'gold', bed: 'on', phantoms: 'on' }), before, 'the defaults on a file with none: nothing changes');
  const chosen = mergeLook(before, { look: 'hud', pr: 'on', user: 'user', op: 'gold', bed: 'on', phantoms: 'on' });
  assert.deepEqual(chosen, { $schema: 'x', hud: { fable: 'boss', align: 'center', pr: 'on' }, look: 'hud' }, 'the 0.7.0 picks: only the PR status is not a default');
  const quiet = mergeLook(chosen, { look: 'hud', user: 'off', op: 'tag' });
  assert.deepEqual(quiet.hud, { fable: 'boss', align: 'center', pr: 'on', user: 'off', op: 'tag' });
  assert.deepEqual(Object.keys(quiet.hud as object), ['fable', 'align', 'pr', 'user', 'op']);
  assert.deepEqual(mergeLook(quiet, { look: 'hud', user: 'user', op: 'gold' }).hud, { fable: 'boss', align: 'center', pr: 'on', user: 'user', op: 'gold' }, 'a default over a value is written');
  assert.deepEqual(mergeLook({ hud: { bed: 'nope', phantoms: false } }, { look: 'hud', bed: 'on', phantoms: 'on' }), { hud: { bed: 'on', phantoms: 'on' } }, 'an unknown value is replaced');
  assert.deepEqual(mergeLook({}, { look: 'hud', phantoms: 'off', bed: 'off', op: 'off', user: 'user@host' }).hud, { user: 'user@host', op: 'off', bed: 'off', phantoms: 'off' }, 'the writer\'s order, not the flags\'');
  assert.deepEqual(mergeLook(chosen, { look: 'classic' }), { ...chosen, look: 'classic' }, 'look classic keeps them');
  assert.deepEqual(handSteps({ look: 'hud', user: 'user', op: 'gold', bed: 'off' }), ['"look": "hud"', '"hud": { "user": "user", "op": "gold", "bed": "off" }   (next to any other keys in "hud")']);
});

test('look hud --user, --op, --bed and --phantoms: a backup, --print, what they show here, the way back; refused before any write', () => {
  const w = world('{\n  "look": "hud",\n  "hud": {\n    "fable": "boss"\n  }\n}\n');
  try {
    const noGh = { PATH: join(w.dir, 'no-bin') };
    let r = w.run(['look', 'hud', '--user', 'user@host', '--print'], noGh);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /- hud: \{"fable":"boss"\}\n\+ hud: \{"fable":"boss","user":"user@host"\}\nNothing was written \(--print\)\.\n$/);
    assert.deepEqual(w.backups(), []);
    r = w.run(['look', 'hud', '--user', 'user@host'], noGh);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Back with: hungerbar look hud --user user\n/);
    assert.match(r.stdout, /\nhud\.user user@host: line 3 reads "⌂ steve@DESKTOP: <folder>" here\n/);
    assert.match(r.stdout, /\nhud\.op gold: your name in bold gold while Claude Code runs as (Administrator|root); this terminal does not, so nothing shows here\n/, 'the name brings its mark\'s note');
    assert.equal(w.backups().length, 1);
    // the operator: elevated here or not
    r = w.run(['look', 'hud', '--op', 'tag'], { ...noGh, HUNGERBAR_ELEVATED: '1' });
    assert.match(r.stdout, /\nhud\.op tag: a bold red \[OP\] before your name while Claude Code runs as (Administrator|root); this terminal runs as (Administrator|root), so it shows here\n/);
    assert.match(r.stdout, /Back with: hungerbar look hud --op gold\n/);
    assert.doesNotMatch(r.stdout, /hud\.user /, 'only what changed is noted');
    // the bed and the phantoms
    r = w.run(['look', 'hud', '--bed', 'off', '--phantoms', 'off'], noGh);
    assert.match(r.stdout, /\nhud\.bed off: no bed; hud\.phantoms off: no phantoms\n/);
    assert.match(r.stdout, /Back with: hungerbar look hud --bed on --phantoms on\n/);
    assert.equal(w.text(), '{\n  "look": "hud",\n  "hud": {\n    "fable": "boss",\n    "user": "user@host",\n    "op": "tag",\n    "bed": "off",\n    "phantoms": "off"\n  }\n}\n');
    r = w.run(['look', 'hud', '--bed', 'off', '--op', 'tag'], noGh);
    assert.match(r.stdout, /already look hud with op tag, bed off: nothing to change\./);
    assert.equal(w.backups().length, 3);
    // look with no argument reports them
    r = w.run(['look'], noGh);
    assert.match(r.stdout, /\nhud\.pr off: no pull request status\nhud\.user user@host: line 3 reads "⌂ steve@DESKTOP: <folder>" here\nhud\.op tag: a bold red \[OP\] before your name while Claude Code runs as (Administrator|root); this terminal does not, so nothing shows here\nhud\.bed off: no bed; hud\.phantoms off: no phantoms\n/);
    assert.match(r.stdout, /\nthe player: hungerbar look hud \[--user off\|user\|user@host\] \[--op off\|tag\|gold\] \[--bed on\|off\] \[--phantoms on\|off\]\n$/);
    // no user name found here: said so
    assert.match(w.run(['look'], { ...noGh, HUNGERBAR_USER: '\x1b[31m' }).stdout, /\nhud\.user user@host, but no user name is found here, so none shows\n/);
    r = w.run(['look', 'hud', '--op', 'off', '--user', 'off'], noGh);
    assert.match(r.stdout, /\nhud\.user off: no name before the folder on line 3\nhud\.op off: no operator's mark; this terminal does not run as (Administrator|root)\n/);
  } finally {
    w.cleanup();
  }
  for (const [args, msg] of [
    [['look', 'hud', '--user', 'admin'], /--user takes off, user or user@host \(got "admin"\)\nusage: hungerbar look/],
    [['look', 'hud', '--op'], /--op takes off, tag or gold\n/],
    [['look', 'hud', '--bed', 'maybe'], /--bed takes on or off \(got "maybe"\)/],
    [['look', 'hud', '--phantoms', '3'], /--phantoms takes on or off \(got "3"\)/],
    [['look', 'classic', '--user', 'user'], /--user goes with the HUD: hungerbar look hud --user user/],
    [['look', '--op', 'gold'], /--op goes with the HUD: hungerbar look hud --op gold/],
    [['look', 'hud', '--phantom', 'off'], /unknown option --phantom/],
  ] as const) {
    const e = world('{"a": 1}');
    try {
      const before = e.snapshot();
      const r = e.run([...args]);
      assert.equal(r.status, 1, args.join(' '));
      assert.match(r.stderr, msg, args.join(' '));
      assert.deepEqual(e.snapshot(), before, `${args.join(' ')} wrote nothing`);
    } finally {
      e.cleanup();
    }
  }
  const bad = world('{ "look": "hud", }');
  try {
    const r = bad.run(['look', 'hud', '--user', 'user', '--op', 'gold']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /cannot be read as a JSON object[\s\S]*"look": "hud"\n {2}"hud": \{ "user": "user", "op": "gold" \}/);
  } finally {
    bad.cleanup();
  }
});

test('preview --pr, --user, --op, --bed and --phantoms equal preview with that hungerbar.json; --op draws the demo as if elevated; nothing is written', () => {
  const plain = world();
  const cases: Array<[Record<string, string>, string[], Record<string, string>]> = [
    [{ user: 'user' }, ['--user', 'user'], {}],
    [{ user: 'user@host', op: 'gold' }, ['--user', 'user@host', '--op', 'gold'], { HUNGERBAR_ELEVATED: '1' }],
    [{ op: 'tag' }, ['--op', 'tag'], { HUNGERBAR_ELEVATED: '1' }],
    [{ bed: 'off', phantoms: 'off' }, ['--bed', 'off', '--phantoms', 'off'], {}],
    [{ pr: 'on' }, ['--pr', 'on'], {}],
  ];
  try {
    for (const [hud, flags, fileEnv] of cases) {
      const file = world(JSON.stringify({ look: 'hud', hud }));
      try {
        const want = file.run(['preview'], { FORCE_COLOR: '3', ...fileEnv });
        assert.equal(want.status, 0);
        const got = plain.run(['preview', ...flags], { FORCE_COLOR: '3' });
        assert.equal(got.stderr, '');
        assert.equal(got.stdout, want.stdout, flags.join(' '));
      } finally {
        file.cleanup();
      }
    }
    const lines = (args: string[], extra: Record<string, string> = {}): string[] => plain.run(['preview', '--situation', 'tight', '--look', 'hud', ...args], { FORCE_COLOR: '3', ...extra }).stdout.split('\n');
    assert.match(lines(['--user', 'user'])[2]!, /⌂\u00a0steve:\u00a0D:\/webapp\x1b\[0m$/u, 'this machine\'s name');
    assert.ok(lines(['--op', 'tag'])[2]!.includes('\x1b[1;38;2;255;85;85m[OP]'), '--op tag: as if elevated');
    assert.ok(!lines(['--op', 'off'])[2]!.includes('[OP]'));
    assert.ok(!lines([])[2]!.includes('[OP]'), 'no --op: this terminal is not elevated (HUNGERBAR_ELEVATED=0), so no mark');
    assert.ok(lines([], { HUNGERBAR_ELEVATED: '1' })[2]!.includes('\x1b[1;38;2;255;170;0msteve\x1b[0m'), 'an elevated terminal: the default, the name in gold');
    assert.ok(!lines([], { HUNGERBAR_ELEVATED: '1' })[2]!.includes('[OP]'));
    // the tight day: the bed in slot 4 and two phantoms, until they are turned off; its PR with --pr on
    assert.ok(lines([])[3]!.includes('\u{1FB84}') && lines([])[0]!.includes('\u{1FB2D}'));
    assert.ok(!lines(['--bed', 'off', '--phantoms', 'off']).join('\n').match(/[\u{1FB84}\u{1FB2D}\u{1FB0B}]/u));
    assert.match(lines(['--pr', 'on'])[3]!, /#\x1b\[0m\x1b\[38;2;255;255;255m128\x1b\[0m\u00a0\x1b\[1;38;2;85;255;85m✓✓\x1b\[0m$/u);
    assert.doesNotMatch(lines([])[3]!, /128/, 'hud.pr off: no badge');
    for (const [args, msg] of [
      [['--look', 'classic', '--user', 'user'], /--user goes with the HUD: --look hud --user user/],
      [['--op', 'purple'], /--op takes off, tag or gold \(got "purple"\)/],
      [['--pr'], /--pr takes on or off\n/],
    ] as const) {
      const r = plain.run(['preview', ...args]);
      assert.equal(r.status, 1, args.join(' '));
      assert.match(r.stderr, msg, args.join(' '));
    }
    assert.equal(existsSync(plain.cache), false, 'preview never writes the caches');
    assert.equal(existsSync(plain.cfg), false);
  } finally {
    plain.cleanup();
  }
});

test("doctor's Look section (0.7.0): the git state's source, the PR status here, the name, the elevation, the bed and the phantoms", () => {
  const w = world(JSON.stringify({ look: 'hud', hud: { pr: 'on', user: 'user', op: 'gold', phantoms: 'off' } }), null);
  try {
    const noGh = { PATH: join(w.dir, 'no-bin') };
    mkdirSync(join(w.cache, 'pr'), { recursive: true });
    writeFileSync(join(w.cache, 'pr', 'a.json'), '{}');
    const before = w.snapshot();
    let r = w.run(['doctor'], { ...noGh, HUNGERBAR_NOW: String(NOW), FORCE_COLOR: '3' });
    assert.equal(r.status, 0, r.stderr);
    const look = r.stdout.slice(r.stdout.indexOf('\nLook\n'));
    assert.match(look, / {2}· {5}the git state \(⎇ and the branch's colours and marks\): git status beside the diff, in the background refresher\n/);
    assert.match(look, /warn {2}hud\.pr on, but gh is not on PATH here, so nothing shows\n/);
    assert.match(look, / {2}· {5}1 pull request answer\(s\) in .*pr\n/);
    assert.match(look, / {2}· {5}hud\.user user: line 3 reads "⌂ steve: <folder>" here\n/);
    assert.match(look, / {2}· {5}hud\.op gold: your name in bold gold while Claude Code runs as (Administrator|root); this terminal does not, so nothing shows here\n/);
    assert.match(look, / {2}· {5}hud\.bed on: a bed in slot 4 after 5 minutes without a message, not while a tool runs; hud\.phantoms off: no phantoms\n/);
    assert.deepEqual(w.snapshot(), before, 'doctor writes nothing');
    const stub = join(w.dir, 'gh-stub.mjs');
    writeFileSync(stub, '');
    r = w.run(['doctor'], { ...noGh, HUNGERBAR_GH: stub, HUNGERBAR_ELEVATED: '1', HUNGERBAR_NOW: String(NOW), FORCE_COLOR: '3' });
    assert.ok(r.stdout.includes(`  ·     hud.pr on: the branch's pull request from ${stub} (found here), about once a minute\n`), r.stdout);
    assert.match(r.stdout, /this terminal runs as (Administrator|root), so it shows here\n/);
    r = w.run(['doctor'], { ...noGh, HUNGERBAR_GH: stub, HUNGERBAR_OFFLINE: '1', HUNGERBAR_NOW: String(NOW), FORCE_COLOR: '3' });
    assert.match(r.stdout, /warn {2}hud\.pr on, but off here: CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC or HUNGERBAR_OFFLINE is set\n/);
    writeFileSync(w.cfg, JSON.stringify({ look: 'hud', git: { mode: 'off' } }));
    r = w.run(['doctor'], { ...noGh, HUNGERBAR_NOW: String(NOW), FORCE_COLOR: '3' });
    // the in-progress word and a detached HEAD still show with git.mode off (readOp reads .git in every mode): the note says so
    assert.match(r.stdout, / {2}· {5}git\.mode off: no git status, so ⎇ stays grey with no counts or arrows; a merge, rebase or cherry-pick in progress and a detached HEAD still show \(read from \.git\)\n {2}· {5}hud\.pr off: no pull request status\n {2}· {5}hud\.user user/);
    assert.doesNotMatch(r.stdout, /pull request answer/, 'hud.pr off: no count');
  } finally {
    w.cleanup();
  }
});

test('opSummary says whether this terminal runs elevated also while hud.op is off, in look and in doctor (fix after review 16)', () => {
  const off = { ...defaults(), look: 'hud' as const, hud: { ...defaults().hud, op: 'off' as const, user: 'user' as const } };
  const as = elevatedAs();
  assert.equal(opSummary(off, { HUNGERBAR_ELEVATED: '1' }), `hud.op off: no operator's mark; this terminal runs ${as}`);
  assert.equal(opSummary(off, { HUNGERBAR_ELEVATED: '0' }), `hud.op off: no operator's mark; this terminal does not run ${as}`);
  assert.equal(elevatedAs('win32'), 'as Administrator');
  assert.equal(elevatedAs('linux'), 'as root');
  // the review's own case: hud.op off with the name on, in an elevated terminal
  const w = world(JSON.stringify({ look: 'hud', hud: { op: 'off', user: 'user' } }), null);
  try {
    const noGh = { PATH: join(w.dir, 'no-bin') };
    for (const [elev, here] of [['1', `runs ${as}`], ['0', `does not run ${as}`]] as const) {
      const l = w.run(['look'], { ...noGh, HUNGERBAR_ELEVATED: elev });
      assert.equal(l.status, 0, l.stderr);
      assert.ok(l.stdout.includes(`\nhud.op off: no operator's mark; this terminal ${here}\n`), l.stdout);
      const d = w.run(['doctor'], { ...noGh, HUNGERBAR_ELEVATED: elev, HUNGERBAR_NOW: String(NOW), FORCE_COLOR: '3' });
      assert.equal(d.status, 0, d.stderr);
      assert.ok(d.stdout.includes(`  ·     hud.op off: no operator's mark; this terminal ${here}\n`), d.stdout);
    }
  } finally {
    w.cleanup();
  }
});

test("doctor's leftover check sees every child 0.7.0 starts: the git status, gh pr view (gh.exe in the list) and the workers; never the user's own git or gh (fix after review 16)", () => {
  // the command lines as Windows shows them for node's spawn: an argument with a space is quoted
  const line = (pid: number, exe: string, args: readonly string[]): string => `${pid} ${[exe, ...args].map((a) => (/[\s"]/.test(a) ? `"${a}"` : a)).join(' ')}`;
  const node = 'C:\\Program Files\\nodejs\\node.exe', git = 'C:\\Program Files\\Git\\cmd\\git.exe', mingw = 'C:\\Program Files\\Git\\mingw64\\bin\\git.exe';
  const gh = 'C:\\Program Files\\GitHub CLI\\gh.exe', dist = 'C:\\Users\\k\\AppData\\Roaming\\npm\\node_modules\\hungerbar\\dist\\hungerbar.mjs';
  const ours: Array<[string, readonly string[]]> = [
    [node, [dist, 'refresh', 'git', 'D:/my repo', '3', 'status']],
    [node, [dist, 'refresh', 'pr', 'D:/r', 'main']],
    [node, [dist, 'refresh', 'transcript', 'C:/t/s.jsonl', 'abc']],
    [node, [dist, 'refresh', 'usage']],
    [git, gitArgs('D:/my repo', false)],
    [mingw, gitArgs('D:/r', true)],
    [git, statusArgs('D:/my repo')],
    [mingw, statusArgs('D:/r')],
    [gh, PR_ARGS],
    [node, ['C:/t/gh-stub.mjs', ...PR_ARGS]],
  ];
  for (const [exe, args] of ours) assert.equal(isLeftover(line(4242, exe, args), 1), true, `${exe} ${args.join(' ')}`);
  const theirs: Array<[string, readonly string[]]> = [
    [gh, ['pr', 'view']],
    [gh, ['pr', 'view', '--json', 'number,state']],
    [gh, ['pr', 'view', '12', '--json', 'number,title']],
    [gh, ['pr', 'status']],
    [git, ['status']],
    [git, ['-C', 'D:/r', 'status', '--porcelain=v2', '--branch']],
    [git, ['--no-optional-locks', 'status', '--untracked-files=all', '--branch', '--porcelain=2', '-z']],
    [git, ['--no-optional-locks', 'fetch']],
    [git, ['diff', '--shortstat']],
    [node, [dist, 'doctor']],
    [node, [dist]],
  ];
  for (const [exe, args] of theirs) assert.equal(isLeftover(line(4242, exe, args), 1), false, `${exe} ${args.join(' ')}`);
  assert.equal(isLeftover(line(4242, node, [dist, 'refresh', 'pr', 'D:/r', 'main']), 4242), false, 'doctor\'s own pid');
  assert.equal(isLeftover(line(14242, git, statusArgs('D:/r/4242')), 4242), true, 'only the pid in front is doctor\'s own');
  assert.match(LEFTOVER_PS, /Name='node\.exe' or Name='git\.exe' or Name='gh\.exe'/);
  assert.equal(NO_SPAWN_WARNING, 'HUNGERBAR_NO_SPAWN is set: git, usage, the PR status and the transcript worker never refresh');

  const w = world(JSON.stringify({ look: 'hud' }), null);
  try {
    const r = w.run(['doctor'], { PATH: join(w.dir, 'no-bin'), HUNGERBAR_NO_SPAWN: '1', HUNGERBAR_NOW: String(NOW) });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes(`  warn  ${NO_SPAWN_WARNING}\n`), r.stdout);
  } finally {
    w.cleanup();
  }
});

test("doctor lists a stranded git status and gh pr view as still running, and not a gh of the user's (Windows, live)", { skip: process.platform !== 'win32' }, () => {
  const w = world(JSON.stringify({ look: 'hud' }), null);
  const kids: ChildProcess[] = [];
  try {
    // node.exe sleepers with the refreshers' command lines (a gh run by the tests' stub runs as node.exe too); each
    // ends by itself within a minute should the test die before its finally
    const sleeper = join(w.dir, 'sleeper.mjs');
    writeFileSync(sleeper, 'setTimeout(() => {}, 60_000);\n');
    const start = (args: readonly string[]): ChildProcess => {
      const c = spawn(process.execPath, [sleeper, ...args], { stdio: 'ignore', windowsHide: true });
      kids.push(c);
      return c;
    };
    const status = start(statusArgs('D:/r')), pr = start(PR_ARGS), mine = start(['pr', 'view', '--web']);
    // the real PATH: doctor finds powershell.exe through it (hud.pr is off, so no gh is looked for)
    const r = w.run(['doctor'], { HUNGERBAR_NOW: String(NOW) });
    assert.equal(r.status, 0, r.stderr);
    const procs = r.stdout.slice(r.stdout.indexOf('\nProcesses\n'));
    assert.ok(procs.includes(`  warn  still running: ${status.pid} `), procs);
    assert.ok(procs.includes(`  warn  still running: ${pr.pid} `), procs);
    assert.ok(!procs.includes(`still running: ${mine.pid} `), procs);
  } finally {
    for (const c of kids) c.kill();
    w.cleanup();
  }
});

test('the 0.7.0 glyph census: every glyph the git state, the PR badge and the player\'s layers add is listed by glyphs --hud at its width, and each is drawn', () => {
  const added = new Set<string>();
  const cps = (lines: readonly (readonly { t: string }[])[]): Set<string> => new Set(lines.flatMap((l) => l.flatMap((s) => [...s.t])).filter((c) => c.codePointAt(0)! > 0x7f));
  const files = [null, { changed: 0, untracked: 0, conflicts: 0 }, { changed: 3, untracked: 0, conflicts: 0 }, { changed: 0, untracked: 2, conflicts: 0 }, { changed: 1, untracked: 1, conflicts: 2 }];
  const ops = [null, { kind: 'merge', step: null, total: null }, { kind: 'rebase', step: 2, total: 5 }, { kind: 'pick', step: null, total: null }] as const;
  const prs: Array<PrInfo | null> = [null];
  for (const state of ['open', 'draft', 'merged', 'closed'] as const) {
    for (const ci of [null, 'running', 'passed', 'failed'] as const) {
      for (const review of [null, 'approved', 'changes'] as const) for (const conflict of [false, true]) prs.push({ n: 128, state, ci, review, conflict });
    }
  }
  for (const s of ['normal', 'tight', 'extra', 'fable']) {
    const d = DEMOS[s]!;
    const r = renderPayload(JSON.stringify(d.payload), { env: { FORCE_COLOR: '3' }, config: { ...defaults(), look: 'hud', hud: { ...defaults().hud, fable: 'beacon' }, network: { ...defaults().network, usageApi: true, scopedWeekly: true } }, sources: demoSources(d), now: DEMO_NOW });
    const lines = r.hud!.lines, sit = fromState(r.hud!.input), base = cps(frameHud(lines));
    for (const branch of ['main', 'feature/a-very-long-branch-name-for-the-census-that-has-to-be-cut-from-the-front']) {
      for (const f of files) {
        for (const op of ops) {
          for (const [ahead, behind] of [[0, 0], [2, 0], [0, 3], [12, 1500]]) {
            const marks: GitMarks = { files: f, ahead: ahead!, behind: behind!, op, detached: null, name: null };
            for (const pr of prs) for (const c of cps(frameHud(gitHud(lines, marks, branch, prBadge(pr))))) if (!base.has(c)) added.add(c);
          }
        }
      }
      for (const c of cps(frameHud(gitHud(lines, { ...NO_MARKS, detached: '4f4e2d8' }, branch)))) if (!base.has(c)) added.add(c);
    }
    for (const op of [null, 'tag', 'gold'] as const) {
      for (const phantoms of [0, 1, 2, 3, 4]) {
        for (const bed of [false, true]) {
          const player: PlayerMarks = { who: { user: 'steve', host: 'DESKTOP', op }, bed, phantoms };
          for (const c of cps(frameHud(playerHud(lines, player, sit.cwd)))) if (!base.has(c)) added.add(c);
        }
      }
    }
  }
  const listed = new Map(HUD_GLYPHS.map(([g, what]) => [g, what]));
  for (const g of added) {
    assert.ok(listed.has(g), `U+${g.codePointAt(0)!.toString(16).toUpperCase()} is listed by glyphs --hud`);
    assert.equal(cellWidth(g), 1, `${g} is 1 cell`);
  }
  const NEW = ['↑', '↓', '●', '✓', '×', '±', '‼', '◌', '\u{1FB84}', '\u{1FB08}', '\u{1FB0B}', '\u{1FB05}', '\u{1FB22}', '\u{1FB2D}', '\u{1FB16}'];
  assert.deepEqual([...added].filter((g) => g !== '…').sort(), [...NEW].sort(), 'the layers add exactly the 0.7.0 glyphs (and … where a branch is cut)');
  for (const g of NEW) assert.match(listed.get(g)!, /git|pull request|bed|phantom/, `${g}'s row says what draws it`);
});

test('help names the 0.7.0 flags of look, setup and preview', () => {
  const r = runDist('', { PATH: process.env.PATH ?? '' }, ['--help']);
  assert.equal(r.status, 0);
  assert.equal(r.stdout.split('\n').filter((l) => l.includes('[--pr on|off] [--user off|user|user@host] [--op off|tag|gold] [--bed on|off] [--phantoms on|off]')).length, 3);
});
