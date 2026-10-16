// The HUD look end to end (plan §10.3):
//   (a) each demo situation, through the real render path (renderPayload with the demo's sources), hands the engine
//       hud4-states.json's state plus the demo's history plus the scoped Fable week, field by field; `fable` is round 7's
//       fable-in-use. The shifted histories draw what the frozen spec renders draw (their hashes).
//   (b) dist/hungerbar.mjs's bytes (`preview`, a config file with look hud) equal the independent encoder applied to the
//       vendored engine's render with the tests' git state (each demo's status, 0.7.0), player's layers and own hotbar
//       frame (test/hud/frame-oracle.ts), for every situation x the 5 fable ids, at FORCE_COLOR=3 and 2; with hud.pr on
//       the tight day also draws its pull request's badge.
//   (c) every golden case test/fixtures/cases/hud-*.json, on disk: the in-process render (adapter plus history step)
//       hands the engine the case's pinned hudState, the git state its pinned hudGit (none known when absent) and the
//       badge its pinned hudPr (no PR when absent), and dist's bytes equal the independent encoder applied to the vendored
//       engine's render of it with the tests' git state and PR badge (test/hud/gitstate-oracle.ts and prci-oracle.ts,
//       0.7.0), the player's layers as its pinned hudPlayer asks (test/hud/player-oracle.ts, 0.7.0; nothing when absent)
//       and frame; each fallback mode is classic byte for byte, and w100c keeps the HUD. With hud.user, hud.op, hud.bed
//       and hud.phantoms all off, every case draws the engine's lines with only the git state, the badge and the frame.
//   (d) the README's HUD samples are the engine's normal day and Fable in use with the boss bar (its name left out,
//       SPEC §0.11), framed, ANSI-stripped, and the normal day centred in a 120-column window.
//   (e) SPEC §0.9 says what ships: its *Output* list is whole, the frame, centring, git state and PR status sections hold
//       only their own bullets (the PR's with the gh command and TTLs that ship), its sentence on the gutter's backgrounds matches the goldens, its bundle size is this version's dist,
//       and the earlier sizes it gives are the builds of the commits it names (the last and the first of the previous
//       version, 0.4.0 before the HUD).
//   (f) the centring (0.6.0) through dist: every hud-* case in a colour mode with a known width draws, with hud.align
//       left, its bytes at an unknown width, and with center those bytes moved by the tests' own offset
//       (test/hud/align-oracle.ts), measured with the git state drawn; HUNGERBAR_HUD_ALIGN wins over the file both ways.
// Also: the history file is written after stdout (dist, the order of the writes recorded by test/order-stub.mjs); a full
// HUD render in a repo starts no process; and every fallback through dist is classic byte for byte.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { defaults, type Config } from '../src/config.ts';
import { DEMOS, DEMO_NOW, demoSources } from '../src/demo.ts';
import { PR_TTL, PR_TTL_LONG } from '../src/pr/cache.ts';
import { PR_ARGS } from '../src/pr/gh.ts';
import { renderPayload } from '../src/render.ts';
import { caseNames, DIST, fill, GOLDEN, loadCase, MODES, prepare, ROOT, runDist, stripAnsi, type Case } from './harness.ts';
import { budgetOf, centredText, centreOracle, widestOf } from './hud/align-oracle.ts';
import { frameOracle } from './hud/frame-oracle.ts';
import { gitOracle, UNKNOWN, type OracleGit } from './hud/gitstate-oracle.ts';
import { playerOracle, QUIET, type OraclePlayer } from './hud/player-oracle.ts';
import { badgeOracle, type OraclePr } from './hud/prci-oracle.ts';
import { sgrOracle } from './hud/sgr-oracle.ts';
import {
  cellWidth, FABLE_IDS, picked, MIX, plain, renderHash, SPEC, STATES, tuples, type FableId, type RefHist, type RefLines, type RefState,
} from './hud/ref.ts';

const SITUATIONS = ['normal', 'tight', 'fresh', 'extra', 'fable'] as const;
type Situation = (typeof SITUATIONS)[number];
const short = (id: string): Config['hud']['fable'] => id.slice('fable-'.length) as Config['hud']['fable'];

/** A round-6 history moved to DEMO_NOW by whole quarters, in the history step's form (written here independently of demo.ts). */
function shift(h: RefHist): RefHist {
  const k = Math.floor(DEMO_NOW / 900) - Math.floor(h.now / 900);
  return { now: DEMO_NOW, sessionStart: null, dirtySince: null, commits: 0, lastCommit: null, buckets: h.buckets.map(([i, ...b]) => [i + k, ...b] as RefHist['buckets'][number]) };
}

/** What the engine must be handed for each demo situation. */
function expected(s: Situation): RefState {
  if (s === 'fable') {
    const st = plain(SPEC.round7.situations['fable-in-use']!.state) as RefState & { hist: RefHist };
    return { ...st, hist: shift(st.hist) };
  }
  const r6 = SPEC.round6.inputs[s]!.state as RefState & { hist: RefHist };
  // fresh is not a repo: no history, as on disk (its round-6 hist is the empty first render, which draws the same)
  return { ...plain(STATES[s]), hist: s === 'fresh' ? null : shift(r6.hist), scoped: [{ name: 'Fable', used: 35, left: 4 * 86400 }] };
}

/**
 * The HUD's options the oracles here draw: the left edge, no name and the [OP] tag, the defaults before SPEC §0.10. The
 * defaults themselves (centre, the user name, gold) are hud-defaults' (c) below.
 */
const PLAIN_HUD = { align: 'left', user: 'off', op: 'tag' } as const;
const hudConfig = (fable: Config['hud']['fable']): Config =>
  ({ ...defaults(), look: 'hud', hud: { ...defaults().hud, ...PLAIN_HUD, fable }, network: { ...defaults().network, usageApi: true, scopedWeekly: true } });
const text = (lines: RefLines | { t: string }[][]): string => lines.map((l) => l.map((s) => s.t).join('')).join('\n');

/**
 * What the player's layers draw on each demo (0.7.0): only the tight day shows them, its context at 71% and its 2
 * compactions bringing two phantoms, and its cache cold 6 minutes after its last write (expires_at 60 s ago, a 5m TTL)
 * the bed. The demo's sources have no WhoSource, so no name and no operator's mark.
 */
const DEMO_PLAYER: Record<Situation, OraclePlayer> = {
  normal: QUIET, tight: { ...QUIET, bed: true, phantoms: 2 }, fresh: QUIET, extra: QUIET, fable: QUIET,
};
/**
 * The git state of each demo (0.7.0, restated here from what the demos say rather than read from demo.ts): every repo
 * day has changed files (its diff), the tight day also a new file and two commits to push, the extra day one to pull;
 * fresh is no repo. With hud.pr on, the tight day's branch has PR #128, its checks passed and approved.
 */
const files = (changed: number, untracked = 0) => ({ changed, untracked, conflicts: 0 });
const DEMO_GIT: Record<Situation, OracleGit> = {
  normal: { ...UNKNOWN, files: files(9) },
  tight: { ...UNKNOWN, files: files(2, 1), ahead: 2 },
  fresh: UNKNOWN,
  extra: { ...UNKNOWN, files: files(1), behind: 1 },
  fable: { ...UNKNOWN, files: files(9) },
};
const DEMO_PR: Partial<Record<Situation, OraclePr>> = { tight: { n: 128, state: 'open', ci: 'passed', review: 'approved', conflict: false } };

/** A demo situation as the tests draw it: the engine's render with the git state, the badge, the player and the frame. */
const demoOracle = (s: Situation, id: FableId, pr = false): RefLines =>
  frameOracle(playerOracle(gitOracle(MIX.render(expected(s), picked(id)), expected(s), DEMO_GIT[s], badgeOracle(pr ? DEMO_PR[s] ?? null : null)), expected(s), DEMO_PLAYER[s]), expected(s));

/** A case's pinned hudPlayer over QUIET. */
const playerOf = (c: Case): OraclePlayer => ({ ...QUIET, ...(c.hudPlayer as Partial<OraclePlayer> | undefined) });

// ---------------------------------------------------------------------------------------------------------------------
// (a) adapt(DEMOS[s])
// ---------------------------------------------------------------------------------------------------------------------

test('(a) each demo situation hands the engine its reference state + history + scoped, field by field, and the port draws the oracle', () => {
  assert.deepEqual(Object.keys(DEMOS), [...SITUATIONS]);
  for (const s of SITUATIONS) {
    const want = expected(s);
    for (const id of FABLE_IDS) {
      const d = DEMOS[s]!;
      const r = renderPayload(JSON.stringify(d.payload), { env: { FORCE_COLOR: '3' }, config: hudConfig(short(id)), sources: demoSources(d), now: DEMO_NOW });
      assert.ok(r.hud, `${s} ${id}: the HUD drew`);
      const got = plain(r.hud.input) as unknown as RefState;
      for (const k of new Set([...Object.keys(want), ...Object.keys(got)])) assert.deepEqual(got[k], want[k], `${s}.${k}`);
      assert.deepEqual(got, want, s);
      assert.deepEqual(tuples(r.hud.lines as RefLines), plain(tuples(MIX.render(want, picked(id)))), `${s} ${id}: port = oracle`);
    }
  }
});

test('(a) the shifted histories draw exactly the frozen spec renders: round 7 normal and fable-in-use, round 6 line 4', () => {
  assert.deepEqual(expected('normal'), { ...plain(SPEC.round7.situations.normal!.state), hist: expected('normal').hist }, 'normal is round 7 normal');
  for (const id of FABLE_IDS) {
    assert.equal(renderHash(MIX.render(expected('normal'), picked(id))), SPEC.round7.situations.normal!.sha256[id], `normal ${id}`);
    assert.equal(renderHash(MIX.render(expected('fable'), picked(id))), SPEC.round7.situations['fable-in-use']!.sha256[id], `fable ${id}`);
  }
  for (const s of ['normal', 'tight', 'fresh', 'extra'] as const) {
    assert.equal(renderHash([MIX.render(expected(s), picked('fable-off'))[3]!]), SPEC.round6.inputs[s]!.sha256, `${s} line 4`);
  }
  const fable = MIX.render(expected('fable'), picked('fable-boss'));
  assert.equal(fable.length, 5, 'Fable in use with boss: the boss line on top');
  assert.ok(MIX.render(expected('normal'), picked('fable-off'))[3]!.some((sp) => sp.fg === '#FCEE4B'), 'the normal day shows its gold column');
});

// ---------------------------------------------------------------------------------------------------------------------
// (b) dist bytes
// ---------------------------------------------------------------------------------------------------------------------

/** A temp Claude config dir with this hungerbar.json, and the env dist runs in. */
function world(config: unknown): { env: Record<string, string>; cache: string; cleanup(): void } {
  const dir = mkdtempSync(join(tmpdir(), 'hb-e2e-'));
  mkdirSync(join(dir, 'claude'));
  writeFileSync(join(dir, 'claude', 'hungerbar.json'), JSON.stringify(config));
  const cache = join(dir, 'cache');
  return {
    env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? 'C:\\Windows', TEMP: tmpdir(), TMP: tmpdir(), CLAUDE_CONFIG_DIR: join(dir, 'claude'), HUNGERBAR_CACHE_DIR: cache, HUNGERBAR_ELEVATED: '0' },
    cache,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test('(b) dist bytes equal the independent encoder on the framed oracle render: every situation x 5 fable ids x 24-bit and 256 colours', () => {
  for (const id of FABLE_IDS) {
    const w = world({ look: 'hud', hud: { fable: short(id), ...PLAIN_HUD }, network: { usageApi: true, scopedWeekly: true } });
    try {
      for (const [force, depth] of [['3', 'truecolor'], ['2', '256']] as const) {
        const r = runDist('', { ...w.env, FORCE_COLOR: force }, ['preview']);
        assert.equal(r.status, 0);
        assert.equal(r.stderr, '');
        const want = SITUATIONS.map((s, i) => `${i ? '\n' : ''}── ${DEMOS[s]!.label}\n${sgrOracle(demoOracle(s, id), { depth })}\n`).join('');
        assert.equal(r.stdout, want, `${id} at FORCE_COLOR=${force}`);
      }
      // hud.pr on (0.7.0): the tight day's pull request after its marks; the other days have none
      const pr = runDist('', { ...w.env, FORCE_COLOR: '3' }, ['preview', '--pr', 'on']);
      assert.equal(pr.stderr, '');
      assert.equal(pr.stdout, SITUATIONS.map((s, i) => `${i ? '\n' : ''}── ${DEMOS[s]!.label}\n${sgrOracle(demoOracle(s, id, true), { depth: 'truecolor' })}\n`).join(''), `${id} with hud.pr on`);
      assert.equal(existsSync(w.cache), false, 'preview never writes the caches');
    } finally {
      w.cleanup();
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// (c) the golden cases
// ---------------------------------------------------------------------------------------------------------------------

const HUD_CASES = caseNames().filter((n) => n.startsWith('hud-'));
/** The modes in which a HUD config must draw classic, byte for byte. */
const FALLBACKS = new Set(['nocolor', 'ascii', 'w60', 'w60c']);

/**
 * The engine id a case's hud.fable asks for, re-derived here: off|tail|tooltip|boss|beacon or fable-<that>; none is boss
 * (the default, SPEC §0.10); anything else is off.
 */
function fableOf(c: Case): FableId {
  const f = (c.config as { hud?: { fable?: unknown } } | undefined)?.hud?.fable;
  const id = f === undefined ? 'fable-boss' : typeof f === 'string' ? (f.startsWith('fable-') ? f : `fable-${f}`) : 'fable-off';
  return (FABLE_IDS as readonly string[]).includes(id) ? (id as FableId) : 'fable-off';
}

/** The case's hud.align, re-derived here: left, else center (the default, SPEC §0.10). */
const alignOf = (c: Case): 'left' | 'center' => ((c.config as { hud?: { align?: unknown } } | undefined)?.hud?.align === 'left' ? 'left' : 'center');

/** A case's hudRef: that reference state without hist, turns and compactions (the case sets those); scoped [] when it has none. */
function refState(name: string): RefState {
  const [src, key] = name.split(':') as [string, string];
  const s = src === 'states' ? (STATES as Record<string, RefState>)[key] : src === 'round7' ? SPEC.round7.situations[key]?.state : undefined;
  assert.ok(s, `hudRef ${name}`);
  const { hist: _h, turns: _t, compactions: _c, ...rest } = plain(s);
  return { ...rest, scoped: rest.scoped ?? [] };
}

test('(c) the hud-* golden cases cover the plan list', () => {
  for (const n of ['normal', 'tight', 'fresh', 'extra', 'boss-opus', 'boss-fable', 'boss-low', 'boss-used-up', 'tail-fable', 'tooltip-fable', 'beacon-opus',
    'beacon-fable', 'two-scoped', 'scoped-reset', 'first-render', 'commit-gold', 'not-a-repo', 'unborn', 'detached', 'worktree', '256', 'placeholders',
    'injection', 'huge', 'fable-unknown', 'cfg-invalid', 'no-offhand', 'wide-label', 'center', 'center-boss', 'center-branch',
    'git-merge', 'git-ahead', 'git-rebase', 'pr', 'pr-branch', 'who', 'who-gold', 'idle', 'phantoms', 'defaults']) assert.ok(HUD_CASES.includes(`hud-${n}`), `hud-${n}`);
});

for (const name of HUD_CASES) {
  test(`(c) ${name}: the pinned engine state, dist = the oracle's encoding, classic in every fallback mode`, () => {
    const c = loadCase(name);
    assert.ok(c.hudState !== undefined, 'a pinned hudState');
    const want = c.hudState === null ? null : (fill(c.hudState, '') as RefState);
    const modes = c.modes ?? [];
    const mode = modes.includes('ansi') ? 'ansi' : 'config';   // config: the case's own env (hud-256)
    const env = MODES[mode] ?? {};
    const force = env.FORCE_COLOR ?? c.env?.FORCE_COLOR;
    const id = fableOf(c);
    const lines = want && MIX.render(want, picked(id));
    const git = (c.hudGit ?? UNKNOWN) as OracleGit, pr = (c.hudPr ?? null) as OraclePr | null, player = playerOf(c);
    // the engine's lines with the tests' git state and PR badge (0.7.0), player's layers (0.7.0) and frame
    const framed = want && frameOracle(playerOracle(gitOracle(lines!, want, git, badgeOracle(pr)), want, player), want);

    // in process: the adapter plus the history step hand the engine exactly the pinned state
    const p = prepare(c);
    try {
      const r = renderPayload(p.stdin, { env: { ...p.env, ...env } });
      if (!want) assert.equal(r.hud, undefined, 'classic');
      else {
        assert.ok(r.hud, 'the HUD drew');
        const got = plain(r.hud.input) as unknown as RefState;
        for (const k of new Set([...Object.keys(want), ...Object.keys(got)])) assert.deepEqual(got[k], want[k], `${name}.${k}`);
        assert.deepEqual(tuples(r.hud.lines as RefLines), plain(tuples(lines!)), 'port = oracle');
        assert.deepEqual(plain(r.hud.git), git, 'the git state is handed what the case pins');
        assert.deepEqual(plain(r.hud.pr), pr, 'the PR badge is handed what the case pins');
        assert.deepEqual(plain(r.hud.player), player, 'the player\'s layers are handed what the case pins');
        assert.deepEqual(tuples(r.hud.framed as RefLines), plain(tuples(framed!)), 'the git state, the PR badge, the player\'s layers and the frame = the tests\'');
        // every new option off (0.7.0): the git state, the badge and the frame alone, whatever the case says
        const offCfg = { ...(c.config as object | undefined), hud: { ...(c.config as { hud?: object } | undefined)?.hud, user: 'off', op: 'off', bed: 'off', phantoms: 'off' } };
        const q = prepare({ ...c, config: offCfg });
        try {
          const off = renderPayload(q.stdin, { env: { ...q.env, ...env } });
          assert.deepEqual(plain(off.hud!.player), QUIET, 'all off: nothing for the player\'s layers');
          assert.deepEqual(tuples(off.hud!.framed as RefLines), plain(tuples(frameOracle(gitOracle(lines!, want, git, badgeOracle(pr)), want))), 'all off: no player\'s layer');
        } finally {
          q.cleanup();
        }
        if (c.hudRef) {
          const { hist: _h, turns: _t, compactions: _c, ...rest } = want;
          assert.deepEqual(rest, refState(c.hudRef), `the case reproduces ${c.hudRef}`);
        }
      }
      for (const m of modes.filter((x) => FALLBACKS.has(x))) {
        const x = renderPayload(p.stdin, { env: { ...p.env, ...MODES[m] } });
        const y = renderPayload(p.stdin, { env: { ...p.env, ...MODES[m], HUNGERBAR_LOOK: 'classic' } });
        assert.equal(x.hud, undefined, `${m}: no HUD`);
        assert.equal(x.text, y.text, `${m}: classic byte for byte`);
      }
    } finally {
      p.cleanup();
    }

    // dist: the bytes are the independent encoder applied to the vendored engine's render of the pinned state, with the
    // tests' git state and frame
    const q = prepare(c);
    try {
      const d = runDist(q.stdin, { ...q.env, ...env });
      assert.deepEqual([d.status, d.stderr], [0, ''], name);
      if (!lines) {
        assert.doesNotMatch(d.stdout, /⛏/);
        return;
      }
      assert.equal(d.stdout, sgrOracle(framed!, { depth: force === '2' ? '256' : 'truecolor' }));
      // the engine's promises (plan §9) with the frame: 5 lines, 6 only with the boss bar; at most 110 cells, the bottom
      // edge row 62, starting with U+2800 (Claude Code does not trim it); output bounded (round-4 issue 6)
      const shown = stripAnsi(d.stdout).split('\n');
      assert.ok(shown.length === 5 || (shown.length === 6 && id === 'fable-boss'), `${shown.length} lines`);
      for (const l of shown) assert.ok(cellWidth(l) <= 110, `${cellWidth(l)} cells: ${l.slice(0, 40)}`);
      assert.equal(cellWidth(shown[shown.length - 1]!), 62, 'the bottom edge row');
      assert.match(shown[shown.length - 1]!, /^\u2800{9}/u);
      assert.ok(Buffer.byteLength(d.stdout) < 16384, `${Buffer.byteLength(d.stdout)} bytes`);
    } finally {
      q.cleanup();
    }
    // a 100-column terminal keeps the HUD (minWidth 80): golden.test.ts checks both files against dist; left does not
    // read the width, and (f) holds the centred cases
    if (modes.includes('w100c') && alignOf(c) === 'left') assert.equal(readFileSync(join(GOLDEN, `${name}.w100c.ansi`), 'utf8'), readFileSync(join(GOLDEN, `${name}.ansi`), 'utf8'), 'w100c = ansi');
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// (d) the README sample
// ---------------------------------------------------------------------------------------------------------------------

test("(d) the README's HUD samples are the engine's normal day (fable off) and Fable in use (boss), framed, ANSI-stripped", () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  // and the normal day centred in a 120-column window: the budget is 116, the widest line 81 cells, so 19 U+2800 lead each line
  const centred = [...readme.matchAll(/```\n(\u2800+Opus 5\.5 Efficiency [\s\S]*?)\n```/gu)].map((m) => m[1]!);
  assert.equal(centred.length, 1, 'README has one centred HUD sample block');
  const normal = frameOracle(MIX.render(expected('normal'), picked('fable-off')), expected('normal'));
  assert.equal(centreOracle(116, widestOf(normal)), 19);
  assert.equal(centred[0], centredText(text(normal), normal, 116), 'the oracle, framed, centred in a budget of 116');
  assert.match(readme, /centred in a 120-column window/);
  const samples = [['normal', 'fable-off', /```\n(Opus 5\.5 Efficiency [\s\S]*?)\n```/g], ['fable', 'fable-boss', /```\n(\u2800{16}🮂[\s\S]*?)\n```/gu]] as const;
  for (const [s, id, block] of samples) {
    const found = [...readme.matchAll(block)].map((m) => m[1]!);
    assert.equal(found.length, 1, `README has one ${s} HUD sample block`);
    assert.equal(found[0], text(frameOracle(MIX.render(expected(s), picked(id)), expected(s))), `${s} ${id}: the oracle, framed`);
    const d = DEMOS[s]!;
    assert.equal(found[0], text(renderPayload(JSON.stringify(d.payload), { env: { FORCE_COLOR: '3' }, config: hudConfig(short(id)), sources: demoSources(d), now: DEMO_NOW }).hud!.framed), `${s} ${id}: the port`);
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// (f) the centring through dist
// ---------------------------------------------------------------------------------------------------------------------

/** The golden modes in colour with a known width. */
const WIDE = Object.entries(MODES).filter(([, e]) => e.FORCE_COLOR && e.COLUMNS).map(([m]) => m);

test("(f) every hud-* case in colour at a known width: left draws its bytes of an unknown width, center those moved by the tests' offset", () => {
  assert.deepEqual(WIDE, ['w100c', 'w60c', 'w84c', 'w120c', 'w121c', 'w200c']);
  let left = 0, centred = 0, moved = 0, limited = 0;
  for (const name of HUD_CASES) {
    const c = loadCase(name);
    const modes = (c.modes ?? []).filter((m) => WIDE.includes(m));
    if (!modes.length || c.hudState === null || c.hudState === undefined) continue;
    const want = fill(c.hudState, '') as RefState;
    const git = (c.hudGit ?? UNKNOWN) as OracleGit, pr = (c.hudPr ?? null) as OraclePr | null;
    const framed = frameOracle(playerOracle(gitOracle(MIX.render(want, picked(fableOf(c))), want, git, badgeOracle(pr)), want, playerOf(c)), want), ansi = sgrOracle(framed, { depth: 'truecolor' });
    const reserve = (c.config as { widthReserve?: number } | undefined)?.widthReserve ?? 0;
    for (const m of modes) {
      const b = budgetOf(MODES[m]!, reserve)!;
      if (b < 80) continue;                                     // the gate's fallback to classic: (c) holds it
      const q = prepare(c);
      try {
        const d = runDist(q.stdin, { ...q.env, ...MODES[m] });
        assert.deepEqual([d.status, d.stderr], [0, ''], `${name} ${m}`);
        if (alignOf(c) === 'left') {
          assert.equal(d.stdout, ansi, `${name} ${m}: left reads no width`);
          left++;
          continue;
        }
        assert.equal(d.stdout, centredText(ansi, framed, b), `${name} ${m}: centred in ${b}`);
        const o = centreOracle(b, widestOf(framed));
        const shown = stripAnsi(d.stdout).split('\n');
        assert.deepEqual(shown.map((l) => /^\u2800*/u.exec(l)![0].length), framed.map((l) => /^\u2800*/u.exec(l.map((x) => x.t).join(''))![0].length + o), 'every line, the same lead');
        if (widestOf(framed) <= b) for (const l of shown) assert.ok(cellWidth(l) <= b, `${name} ${m}: ${cellWidth(l)} cells in a budget of ${b}`);
        if (o > 0) moved++;
        if (o > 0 && o < Math.floor(b / 2) - 39) limited++;
        centred++;
      } finally {
        q.cleanup();
      }
    }
  }
  assert.ok(left >= 3 && centred >= 10 && moved >= 8 && limited >= 2, JSON.stringify({ left, centred, moved, limited }));
});

test('(f) HUNGERBAR_HUD_ALIGN wins over the file both ways, through dist', () => {
  for (const [name, env, golden] of [
    ['hud-normal', { HUNGERBAR_HUD_ALIGN: 'center', COLUMNS: '120' }, 'hud-center.w120c.ansi'],
    ['hud-center', { HUNGERBAR_HUD_ALIGN: 'left', COLUMNS: '120' }, 'hud-normal.ansi'],
    ['hud-center', { HUNGERBAR_HUD_ALIGN: 'centre', COLUMNS: '120' }, 'hud-center.w120c.ansi'],
    ['hud-normal', { HUNGERBAR_HUD_ALIGN: 'CENTER', COLUMNS: '120' }, 'hud-normal.ansi'],
  ] as const) {
    const q = prepare(loadCase(name));
    try {
      const d = runDist(q.stdin, { ...q.env, FORCE_COLOR: '3', ...env });
      assert.equal(d.stdout.replace(/\x1b/g, '␛'), readFileSync(join(GOLDEN, golden), 'utf8'), `${name} ${JSON.stringify(env)}`);
    } finally {
      q.cleanup();
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// (e) SPEC §0.9 says what ships
// ---------------------------------------------------------------------------------------------------------------------

const specMd = (): string[] => readFileSync(join(ROOT, 'SPEC.md'), 'utf8').replace(/\r\n/g, '\n').split('\n');
/** The lines of SPEC that follow its line `head`, up to (not including) the first blank line. */
function specBlock(head: string): string[] {
  const md = specMd(), i = md.indexOf(head);
  assert.ok(i >= 0, `SPEC has the line ${head}`);
  const end = md.indexOf('', i);
  return md.slice(i + 1, end < 0 ? undefined : end);
}
const JOINED = '- Lines are joined with `\\n`, with no trailing newline, in one `writeSync`, as classic.';

test('(e) SPEC: the *Output* (encode) list is whole, and the frame, centring, git state and PR status sections after it hold only their own bold-led bullets', () => {
  assert.deepEqual(specBlock('*Output* (`encode`).').map((l) => l.slice(0, 24)), [
    '- Each span\'s params are',
    '- A styled span is `ESC[',
    '- With `nbsp` on, every ',
    JOINED.slice(0, 24),
  ]);
  assert.equal(specBlock('*Output* (`encode`).').at(-1), JOINED);
  assert.equal(specMd().filter((l) => l === JOINED).length, 1, 'the bullet is in SPEC once, under *Output*');
  // the frame section: from its heading to the centring's; every top-level bullet opens with a bold lead, the last is the
  // prompt's; the centring section (0.6.0) follows it, then the git state and the PR status (0.7.0) up to *CLI*, their
  // bullets bold-led too
  const md = specMd(), from = md.findIndex((l) => l.startsWith("*The hotbar's frame (")), mid = md.findIndex((l) => l.startsWith('*Centring (')),
    git = md.findIndex((l) => l.startsWith('*The git state (')), pr = md.findIndex((l) => l.startsWith('*The pull request and CI status (')),
    to = md.indexOf('*CLI* (amends §13).');
  assert.ok(from > md.indexOf('*Output* (`encode`).') && mid > from && git > mid && pr > git && to > pr,
    'the frame section follows *Output*, then the centring, the git state, the PR status, then *CLI*');
  const bullets = md.slice(from + 1, mid).filter((l) => l.startsWith('- '));
  assert.ok(bullets.length >= 8);
  for (const b of bullets) assert.match(b, /^- \*\*[^*]+\*\* /, `a frame bullet with a bold lead: ${b.slice(0, 60)}`);
  assert.match(bullets.at(-1)!, /^- \*\*The setup prompt\.\*\* /);
  const centring = md.slice(mid + 1, git).filter((l) => l.startsWith('- '));
  assert.ok(centring.length >= 5);
  for (const b of centring) assert.match(b, /^- \*\*[^*]+\*\* /, `a centring bullet with a bold lead: ${b.slice(0, 60)}`);
  assert.ok(centring.some((b) => b.includes('`clamp(floor(B / 2) - 39, 0, max(0, B - W))`')), 'the rule');
  const gitState = md.slice(git + 1, pr).filter((l) => l.startsWith('- '));
  assert.ok(gitState.length >= 6);
  for (const b of gitState) assert.match(b, /^- \*\*[^*]+\*\* /, `a git state bullet with a bold lead: ${b.slice(0, 60)}`);
  assert.ok(gitState.some((b) => b.includes(' status --porcelain=v2 --branch`')), 'the status command');
  // the player's layers (0.7.0) between the PR status and *CLI*
  const player = md.findIndex((l) => l.startsWith('*The player: who, away and too long ('));
  assert.ok(player > pr && to > player, 'the player\'s section follows the PR status, then *CLI*');
  const prStatus = md.slice(pr + 1, player).filter((l) => l.startsWith('- '));
  assert.ok(prStatus.length >= 8);
  for (const b of prStatus) assert.match(b, /^- \*\*[^*]+\*\* /, `a PR status bullet with a bold lead: ${b.slice(0, 60)}`);
  assert.ok(prStatus.some((b) => b.includes(`\`gh ${PR_ARGS.join(' ')}\``)), 'the gh command, as the refresher runs it');
  assert.ok(prStatus.some((b) => b.includes('fresh for 60 s after `at`, or 10 minutes for `no-gh`, `auth` and `no-github`')), 'the TTLs');
  assert.equal(PR_TTL, 60);
  assert.equal(PR_TTL_LONG, 600);
  const players = md.slice(player + 1, to).filter((l) => l.startsWith('- '));
  assert.ok(players.length >= 9);
  for (const b of players) assert.match(b, /^- \*\*[^*]+\*\* /, `a player bullet with a bold lead: ${b.slice(0, 60)}`);
  // what ships: the thresholds, the slot, the sky's places and the elevation check
  assert.ok(players.some((b) => b.includes('100 or more prompts (the book\'s count), a session of 4 hours or more, 2 or more compactions, context at 70% or more')), 'the signs');
  assert.ok(players.some((b) => b.includes('2 at cols 30 (high) and 35 (low), 3 at 26, 31, 36 (high, low, high), 4 at 24, 28, 32, 36')), 'the phantoms\' places');
  assert.ok(players.some((b) => b.includes('When the last message is 300 s old or more, hotbar slot 4 (cols 32-35')), 'the bed');
  assert.ok(players.some((b) => b.includes('`%SystemRoot%\\System32\\config\\systemprofile`')), 'the elevation check');
});

test('(e) SPEC: how the frame finds the offhand says what the gutter draws (col 9 is not the only cell with a background)', () => {
  const md = specMd().join('\n');
  assert.ok(!md.includes('the only gutter cell with a background'));
  assert.ok(md.includes('- **Is the offhand drawn?** The engine draws it only for an account with an extra-usage limit. The frame reads it from col 9: '
    + 'without an offhand no gutter cell (cols 0-15) has a background; with one, cols 9-14 do (its sides `#5D5D5D`, its well `#201E07`), and col 9 is its left side:'));
  // and the goldens (c) holds dist to draw just that: the hotbar line's gutter (the line above the edge row), with and
  // without the offhand. An SGR sets a background when it has 48 as a parameter, not as a colour component (38;2;48;…).
  const setsBg = (params: string): boolean => {
    const p = params.split(';');
    for (let k = 0; k < p.length; k++) {
      if (p[k] === '48') return true;
      if (p[k] === '38') k += p[k + 1] === '2' ? 4 : 2;
    }
    return false;
  };
  const bgCols = (ansiLine: string): number[] => {
    const cols: number[] = [];
    let col = 0, bg = false;
    for (const m of ansiLine.matchAll(/\x1b\[([\d;]*)m|([\s\S])/gu)) {
      if (m[1] !== undefined) bg = setsBg(m[1]);
      else { if (bg) cols.push(col); col += cellWidth(m[2]!); }
    }
    return cols.filter((c) => c < 16);
  };
  assert.deepEqual([setsBg('1;38;2;48;48;48'), setsBg('38;5;48'), setsBg('38;2;1;2;3;48;5;59'), setsBg('0')], [false, false, true, false]);
  for (const [name, want] of [['hud-normal', [9, 10, 11, 12, 13, 14]], ['hud-no-offhand', []]] as const) {
    const lines = readFileSync(join(GOLDEN, `${name}.ansi`), 'utf8').replaceAll('␛', '\x1b').split('\n');
    assert.deepEqual(bgCols(lines.at(-2)!), want, `${name}: the gutter's background cells`);
  }
});

const commas = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const bundleLine = (): string => {
  const line = specMd().find((l) => l.startsWith('- **Bundle.** '));
  assert.ok(line, 'SPEC has a bundle line');
  return line;
};

test('(e) SPEC: the bundle size it gives is this version\'s, dist/hungerbar.mjs as built', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string };
  const line = bundleLine();
  const m = /^- \*\*Bundle\.\*\* `dist\/hungerbar\.mjs` is ([\d,]+) bytes at (\d+\.\d+\.\d+)[,.]/.exec(line);
  assert.ok(m, `SPEC's bundle line names its size and its version: ${line}`);
  assert.equal(m[2], pkg.version, 'the size is this version\'s');
  assert.equal(m[1], commas(statSync(DIST).size), 'dist/hungerbar.mjs as built');
});

/** git in this repo; its stdout, and a failed assertion when it fails. */
function git(args: string[], input?: string): Buffer {
  const r = spawnSync('git', ['-C', ROOT, ...args], { input, windowsHide: true, timeout: 30000, maxBuffer: 64 << 20 });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr?.toString()}`);
  return r.stdout;
}
const versionAt = (rev: string): string => (JSON.parse(git(['show', `${rev}:package.json`]).toString('utf8')) as { version: string }).version;

/**
 * The commits of `revs` that this checkout cannot check: not in its objects at all, or (with `ancestors`) not on the way
 * to HEAD. SPEC's bundle line names commits of the full history, which a clone of the published repository does not
 * have (it starts from one commit), nor does a download without .git; there the tests that read them skip.
 */
function notHere(revs: readonly string[], ancestors: boolean): string[] {
  return [...new Set(revs)].filter((rev) => {
    const args = ancestors ? ['merge-base', '--is-ancestor', rev, 'HEAD'] : ['cat-file', '-e', `${rev}^{commit}`];
    return spawnSync('git', ['-C', ROOT, ...args], { windowsHide: true, timeout: 30000 }).status !== 0;
  });
}
const notHereNote = (gone: string[]): string => `the commits SPEC's bundle line names (${gone.join(', ')}) are not in this clone's history`;

type Build = { version: string; rev: string; size: number };
/** The earlier builds SPEC's bundle line gives (each one's version, commit and size), the growth it gives and where it
 *  says the timings were taken. */
function bundleClaims(): { shipped: Build; cut: Build; beforeHud: Build; added: number; timed: string } {
  const line = bundleLine(), n = (s: string): number => Number(s.replaceAll(',', ''));
  const shipped = /\. The (\d+\.\d+\.\d+) that shipped \(([0-9a-f]{7,40}), the last \1 commit\) was ([\d,]+), so [^;]*? added ([\d,]+) bytes; /.exec(line);
  const cut = /; (\d+\.\d+\.\d+) was ([\d,]+) when it was cut \(([0-9a-f]{7,40})\), /.exec(line);
  const before = / and (\d+\.\d+\.\d+) was ([\d,]+) \(([0-9a-f]{7,40})\), before the HUD\. /.exec(line);
  const timed = / The timings below were taken at ([0-9a-f]{7,40})\.$/.exec(line);
  assert.ok(shipped && cut && before && timed, `SPEC's bundle line gives the shipped, cut and pre-HUD builds, and where the timings were taken: ${line}`);
  return {
    shipped: { version: shipped[1]!, rev: shipped[2]!, size: n(shipped[3]!) },
    cut: { version: cut[1]!, rev: cut[3]!, size: n(cut[2]!) },
    beforeHud: { version: before[1]!, rev: before[3]!, size: n(before[2]!) },
    added: n(shipped[4]!),
    timed: timed[1]!,
  };
}

test('(e) SPEC: the bundle line\'s earlier builds are the commits it names, and its growth is from the one that shipped', (t) => {
  const c = bundleClaims();
  // the growth is today's dist less the version that shipped, not less the commit that cut it
  assert.equal(commas(c.added), commas(statSync(DIST).size - c.shipped.size), 'what this version added');
  const gone = notHere([c.shipped.rev, c.cut.rev, c.beforeHud.rev, c.timed], true);
  if (gone.length) {
    t.skip(notHereNote(gone));
    return;
  }
  // shipped: the last commit at its version on the way to HEAD
  assert.equal(versionAt(c.shipped.rev), c.shipped.version, `${c.shipped.rev} is ${c.shipped.version}`);
  const next = git(['rev-list', '--reverse', '--ancestry-path', `${c.shipped.rev}..HEAD`]).toString('utf8').split('\n')[0]!;
  assert.ok(next, `${c.shipped.rev} is behind HEAD`);
  assert.notEqual(versionAt(next), c.shipped.version, `the commit after ${c.shipped.rev} is past ${c.shipped.version}`);
  // cut: the commit that set the same version, at or before the shipped one
  assert.equal(c.cut.version, c.shipped.version);
  assert.equal(versionAt(c.cut.rev), c.cut.version, `${c.cut.rev} is ${c.cut.version}`);
  assert.notEqual(versionAt(`${c.cut.rev}^`), c.cut.version, `${c.cut.rev} set ${c.cut.version}`);
  git(['merge-base', '--is-ancestor', c.cut.rev, c.shipped.rev]);
  // before the HUD: its version's commit (the tagged one, when it is tagged), with no src/hud
  assert.equal(versionAt(c.beforeHud.rev), c.beforeHud.version, `${c.beforeHud.rev} is ${c.beforeHud.version}`);
  assert.equal(git(['ls-tree', '--name-only', c.beforeHud.rev, '--', 'src/hud']).toString('utf8'), '', `${c.beforeHud.rev} has no HUD`);
  if (git(['tag', '--list', `v${c.beforeHud.version}`]).toString('utf8').trim()) {
    assert.equal(git(['rev-parse', `v${c.beforeHud.version}^{commit}`]).toString('utf8').trim(),
      git(['rev-parse', `${c.beforeHud.rev}^{commit}`]).toString('utf8').trim(), `v${c.beforeHud.version} is ${c.beforeHud.rev}`);
  }
  // the timings: every median line under *Bench.* first appeared in SPEC at the commit it names
  const md = specMd(), at = md.findIndex((l) => l.startsWith('- **Bench.** '));
  assert.ok(at >= 0, 'SPEC has its bench');
  const rest = md.slice(at + 1), stop = rest.findIndex((l) => !l.startsWith('  - '));
  const medians = rest.slice(0, stop < 0 ? undefined : stop);
  assert.ok(medians.length >= 3, 'SPEC has the bench medians');
  const timed = git(['rev-parse', `${c.timed}^{commit}`]).toString('utf8').trim();
  for (const l of medians) {
    const first = git(['log', '--reverse', '--format=%H', `-S${l}`, '--', 'SPEC.md']).toString('utf8').split('\n')[0];
    assert.equal(first, timed, `${l.trim()} was written at ${c.timed}`);
  }
});

/** Writes what a build reads at `rev` (build.mjs, package.json, tsconfig.json, src) into `dir`, from git's objects. */
function checkout(rev: string, dir: string): void {
  const paths = git(['ls-tree', '-r', '-z', '--name-only', rev, '--', 'build.mjs', 'package.json', 'tsconfig.json', 'src']).toString('utf8').split('\0').filter(Boolean);
  const out = git(['cat-file', '--batch'], paths.map((p) => `${rev}:${p}\n`).join(''));
  let off = 0;
  for (const p of paths) {
    const nl = out.indexOf(10, off), [, type, size] = out.subarray(off, nl).toString('latin1').split(' ');
    assert.equal(type, 'blob', `${rev}:${p}`);
    const end = nl + 1 + Number(size);
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), out.subarray(nl + 1, end));
    off = end + 1;
  }
  assert.equal(off, out.length, 'every object read');
  assert.ok(paths.includes('build.mjs') && paths.includes('src/main.ts'), `${rev} has a build`);
}

test('(e) SPEC: each earlier bundle size it gives is its commit\'s own build.mjs run with the pinned esbuild', (t) => {
  const c = bundleClaims(), builds = [c.shipped, c.cut, c.beforeHud];
  const gone = notHere(builds.map((b) => b.rev), false);
  if (gone.length) {
    t.skip(notHereNote(gone));
    return;
  }
  const installed = (JSON.parse(readFileSync(join(ROOT, 'node_modules', 'esbuild', 'package.json'), 'utf8')) as { version: string }).version;
  const pins = builds.map((b) => (JSON.parse(git(['show', `${b.rev}:package.json`]).toString('utf8')) as { devDependencies: Record<string, string> }).devDependencies.esbuild);
  if (pins.some((p) => p !== installed)) {
    t.skip(`those builds pin esbuild ${pins.join(', ')}; ${installed} is installed`);
    return;
  }
  const esbuild = pathToFileURL(createRequire(join(ROOT, 'package.json')).resolve('esbuild')).href;
  const tmp = mkdtempSync(join(tmpdir(), 'hungerbar-bundles-'));
  try {
    for (const b of builds) {
      const dir = join(tmp, b.rev);
      checkout(b.rev, dir);
      const script = readFileSync(join(dir, 'build.mjs'), 'utf8');
      assert.equal(script.split("from 'esbuild'").length, 2, `${b.rev}'s build.mjs imports esbuild once`);
      writeFileSync(join(dir, 'build.mjs'), script.replace("from 'esbuild'", `from '${esbuild}'`));
      const r = spawnSync(process.execPath, [join(dir, 'build.mjs')], { cwd: dir, encoding: 'utf8', windowsHide: true, timeout: 60000 });
      assert.equal(r.status, 0, `${b.rev}'s build: ${r.stderr}`);
      assert.equal(commas(statSync(join(dir, 'dist', 'hungerbar.mjs')).size), commas(b.size), `${b.version} at ${b.rev}`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// The history write after stdout; no process; the fallbacks
// ---------------------------------------------------------------------------------------------------------------------

const ZERO = '0'.repeat(40);
const LOG = `${ZERO} ${'a'.repeat(40)} K <k@x> 1792859000 +0000\tcommit (initial): base\n`;
const REPO_CASE: Case = {
  payload: { session_id: 'e2e-order', cwd: 'D:\\webapp', workspace: { current_dir: 'D:\\webapp' }, model: { display_name: 'Opus 5.5' }, cost: { total_cost_usd: 2 } },
  fs: { 'D:/webapp': { '.git/HEAD': 'ref: refs/heads/main\n', '.git/logs/HEAD': LOG } },
  config: { look: 'hud' },
};

test('dist: the history file is written after the line is out, before the process ends; a second render writes nothing', () => {
  const p = prepare(REPO_CASE);
  try {
    const stub = pathToFileURL(join(ROOT, 'test', 'order-stub.mjs')).href;
    const run = (): { stdout: string; order: string[] } => {
      const r = spawnSync(process.execPath, ['--import', stub, DIST], { input: p.stdin, env: { ...p.env, FORCE_COLOR: '3' }, encoding: 'utf8', windowsHide: true, timeout: 15000 });
      assert.equal(r.status, 0, r.stderr);
      const m = /^ORDER (.*)$/m.exec(r.stderr);
      assert.ok(m, r.stderr);
      assert.equal(r.stderr.replace(/^ORDER .*\n/m, ''), '', 'nothing else on stderr');
      return { stdout: r.stdout, order: JSON.parse(m[1]!) as string[] };
    };
    const first = run();
    assert.match(first.stdout, /\x1b\[/);
    assert.match(first.stdout, /⛏/, 'the HUD drew');
    const hud = first.order.findIndex((e) => /^rename .*\/hud\/e2e-order\.[0-9a-f]+\.json$/.test(e));
    assert.ok(hud >= 0, `the history file was written: ${JSON.stringify(first.order)}`);
    assert.equal(first.order.indexOf('stdout'), first.order.lastIndexOf('stdout'), 'one write to stdout');
    assert.ok(first.order.indexOf('stdout') >= 0 && first.order.indexOf('stdout') < hud, `stdout first: ${JSON.stringify(first.order)}`);
    const files = readdirSync(join(p.env.HUNGERBAR_CACHE_DIR!, 'hud'));
    assert.equal(files.length, 1);
    const saved = JSON.parse(readFileSync(join(p.env.HUNGERBAR_CACHE_DIR!, 'hud', files[0]!), 'utf8')) as { branch: string; log: { size: number; head: string } };
    assert.deepEqual([saved.branch, saved.log], ['main', { size: Buffer.byteLength(LOG), head: 'a'.repeat(40) }]);
    const second = run();
    assert.equal(second.stdout, first.stdout);
    assert.ok(!second.order.some((e) => e.includes('/hud/')), 'nothing changed: no write');
  } finally {
    p.cleanup();
  }
});

test('no process: a full HUD render in a repo, with child_process trapped, starts nothing (refreshers are only queued)', () => {
  const cp = createRequire(import.meta.url)('node:child_process') as Record<string, unknown>;
  const names = ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'];
  const real = names.map((n) => cp[n]);
  let started = 0;
  const p = prepare(REPO_CASE);
  try {
    for (const n of names) cp[n] = () => { started++; throw new Error(`process started: ${n}`); };
    const env = { ...p.env, FORCE_COLOR: '3' };
    const r = renderPayload(p.stdin, { env });
    for (const f of r.after) f();
    const again = renderPayload(p.stdin, { env, now: Number(p.env.HUNGERBAR_NOW) + 900 });
    for (const f of again.after) f();
    assert.equal(started, 0);
    assert.ok(r.hud?.input.hist && again.hud?.input.hist);
    assert.deepEqual(r.spawns.map((s) => s[1]), ['git'], 'the git refresher is queued, not started');
  } finally {
    names.forEach((n, i) => { cp[n] = real[i]; });
    p.cleanup();
  }
});

test('dist: every gate fallback is classic byte for byte (no colour, ASCII, 16 colours, narrow), and an invalid file is classic with cfg!', () => {
  const base = loadCase('normal');
  const hud: Case = { ...base, config: { ...(base.config as object), look: 'hud' } };
  for (const env of [{ NO_COLOR: '1' }, { NO_COLOR: '1', HUNGERBAR_ASCII: '1' }, { FORCE_COLOR: '1' }, { FORCE_COLOR: '3', HUNGERBAR_ASCII: '1' },
    { FORCE_COLOR: '3', COLUMNS: '60' }, { FORCE_COLOR: '2', COLUMNS: '83' }]) {
    const a = prepare(hud), b = prepare(base);
    try {
      const x = runDist(a.stdin, { ...a.env, ...env }), y = runDist(b.stdin, { ...b.env, ...env });
      assert.deepEqual([x.status, x.stderr], [0, '']);
      assert.equal(x.stdout, y.stdout, JSON.stringify(env));
      assert.doesNotMatch(x.stdout, /⛏/);
    } finally {
      a.cleanup();
      b.cleanup();
    }
  }
  const wide = prepare(hud);
  try {
    assert.match(runDist(wide.stdin, { ...wide.env, FORCE_COLOR: '2', COLUMNS: '84' }).stdout, /⛏/, 'a budget of exactly minWidth draws the HUD');
  } finally {
    wide.cleanup();
  }
  const bad: Case = { ...base, config: undefined, configText: '{ "look": "hud", ' };
  const a = prepare(bad), b = prepare(bad);
  try {
    const x = runDist(a.stdin, { ...a.env, FORCE_COLOR: '3', HUNGERBAR_LOOK: 'hud' }), y = runDist(b.stdin, { ...b.env, FORCE_COLOR: '3' });
    assert.equal(x.stdout, y.stdout);
    assert.match(x.stdout, /cfg!/);
  } finally {
    a.cleanup();
    b.cleanup();
  }
});
