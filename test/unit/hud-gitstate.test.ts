// The HUD's git state (src/hud/gitstate.ts, SPEC §0.9, 0.7.0): the 'colour-marks' pick from design round 8, span for
// span against the design's own rows (test/reference/round8/gitstate.json), through the layer on the engine's render and
// through the real HUD path (renderPayload with sources that hand it each situation's git view); by hand on the colours,
// the marks, the rebase's branch, a detached HEAD, a long branch and what gives way when room runs out; then against the
// tests' own layer (test/hud/gitstate-oracle.ts, which finds the readout from the state, not from the drawn line) on the
// reference states, the time-lapse and seeded fuzz states x seeded git states, for the 5 fable ids. With nothing known
// the engine's lines come back as they are, so 0.6.0's bytes stand.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { HUD_GLYPHS } from '../../src/cli/glyphs.ts';
import { defaults, type Config } from '../../src/config.ts';
import { DEMOS, DEMO_NOW, demoSources } from '../../src/demo.ts';
import type { Repo } from '../../src/git/head.ts';
import type { GitOp, GitStatus } from '../../src/git/status.ts';
import { FABLE_IDS, renderHud } from '../../src/hud/fable.ts';
import { frameHud } from '../../src/hud/frame.ts';
import {
  AQUA, filesColour, gitHud, gitMarks, GOLD, GREEN, MARK, MIN_NAME, nameColour, NO_MARKS, PURPLE, readoutAt, RED, YELLOW, type GitMarks,
} from '../../src/hud/gitstate.ts';
import { fromState } from '../../src/hud/input.ts';
import { encode } from '../../src/hud/look.ts';
import { GREY, WHITE } from '../../src/hud/mix.ts';
import { S, W, type Span } from '../../src/hud/spans.ts';
import { cellWidth } from '../../src/hud/wt.ts';
import type { Payload } from '../../src/payload.ts';
import { renderPayload } from '../../src/render.ts';
import type { GitView, Sources } from '../../src/state.ts';
import { gitOracle, markCol, UNKNOWN, type OracleGit } from '../hud/gitstate-oracle.ts';
import { frameOracle } from '../hud/frame-oracle.ts';
import { chance, int, mulberry32, pick, state as fuzzState, TEXTS, type Rng } from '../hud/fuzz.ts';
import { picked, MIX, plain, REF, SESSION, SOURCES, SPEC, STATES, tuples, type RefLines, type RefState } from '../hud/ref.ts';

const text = (l: readonly Span[]): string => l.map((s) => s.t).join('');
const NORMAL: RefState = STATES.normal;
const branchOf = (st: unknown): string => (fromState(st).git as { branch: string }).branch;
const marks = (m: Partial<GitMarks>): GitMarks => ({ ...NO_MARKS, ...m });
const clean = { changed: 0, untracked: 0, conflicts: 0 };
/** The hotbar line's readout, from ⎇ on. */
const tailOf = (l: readonly Span[]): string => { const t = text(l); return t.slice(t.lastIndexOf('⎇')); };

// ---------------------------------------------------------------------------------------------------------------------
// The design's rows
// ---------------------------------------------------------------------------------------------------------------------

interface Situation {
  label: string;
  branch: string;
  add: number;
  del: number;
  g: { changed: number; untracked: number; conflicts: number; op: { kind: 'merge' | 'rebase' | 'pick'; step?: number; total?: number } | null; ahead: number; behind: number; detached: string | null };
}
interface Round8 { id: string; source: { sha256: string; option: string }; situations: Situation[]; rows: Array<{ label: string; lines: RefLines }> }
const R8 = JSON.parse(readFileSync(join(REF, 'round8', 'gitstate.json'), 'utf8')) as Round8;

/** A situation as the layer's input. */
const marksOf = (g: Situation['g']): GitMarks => ({
  files: { changed: g.changed, untracked: g.untracked, conflicts: g.conflicts }, ahead: g.ahead, behind: g.behind,
  op: g.op ? { kind: g.op.kind, step: g.op.step ?? null, total: g.op.total ?? null } : null, detached: g.detached, name: null,
});

test('round 8: the vendored rows are the colour-marks pick, 8 situations of the full HUD (5 lines, framed, left)', () => {
  assert.equal(R8.id, 'colour-marks');
  assert.equal(R8.source.option, 'colour-marks');
  // the file it was taken from is the one SOURCES.json names (hud.reference.test.ts pins this file's own sha256)
  const src = SOURCES.files['round8/gitstate.json']!;
  assert.equal((src.originSha256 as Record<string, string>)['round8/gitstate.json'], R8.source.sha256);
  assert.deepEqual(R8.situations.map((s) => s.label), R8.rows.map((r) => r.label));
  assert.deepEqual(R8.rows.map((r) => r.label), ['Clean', 'Changes', 'Untracked only', 'Conflict, merging', 'Rebasing 2/5', 'Ahead 2, behind 1', 'Detached', 'Long branch, conflict']);
  for (const r of R8.rows) {
    assert.equal(r.lines.length, 5, r.label);
    for (const l of r.lines) assert.ok(cellWidth(text(l as Span[])) <= 110 && !/^\s/u.test(text(l as Span[])), r.label);
  }
  assert.deepEqual(R8.rows.map((r) => tailOf(r.lines[3] as Span[])), [
    '⎇ main', '⎇ main', '⎇ main ?3', '⎇ main merge !2', '⎇ main rebase 2/5', '⎇ main ↑2↓1', '⎇ @4f4e2d8', '⎇ …/minecraft-hud-round-4 merge !2',
  ]);
});

test('round 8: the layer on the engine\'s render draws each row span for span; the tests\' own layer does too', () => {
  R8.situations.forEach((s, i) => {
    const st = { ...NORMAL, branch: s.branch, add: s.add, del: s.del };
    const got = frameHud(gitHud(renderHud(st, 'off'), marksOf(s.g), branchOf(st)));
    assert.deepEqual(plain(got), R8.rows[i]!.lines, s.label);
    const oracle = frameOracle(gitOracle(MIX.render(st, picked('fable-off')), st, marksOf(s.g)), st);
    assert.deepEqual(plain(tuples(oracle)), tuples(R8.rows[i]!.lines), `${s.label}: the tests' layer`);
  });
});

/** The demo's normal day with this situation's git view, and no history (the design draws none). */
function situationSources(s: Situation): (p: Payload, cfg: Config, now: number) => Sources {
  const g = s.g;
  // as on disk: a detached HEAD is the short sha; a rebase detaches HEAD and names its branch in head-name
  const sha = g.detached ?? (g.op?.kind === 'rebase' ? '0a1b2c3' : null);
  const repo: Repo = { root: 'D:/webapp', gitDir: 'D:/webapp/.git', commonDir: 'D:/webapp/.git', head: sha ? sha.padEnd(40, '0') : 'ref: refs/heads/' + s.branch, branch: sha ?? s.branch, detached: sha !== null };
  const status: GitStatus = { changed: g.changed, untracked: g.untracked, conflicts: g.conflicts, ahead: g.ahead || g.behind ? g.ahead : null, behind: g.ahead || g.behind ? g.behind : null };
  const op: GitOp | null = g.op ? { kind: g.op.kind, step: g.op.step ?? null, total: g.op.total ?? null, head: g.op.kind === 'rebase' ? s.branch : null } : null;
  const view: GitView = { isRepo: true, branch: repo.branch, added: s.add, removed: s.del, repo, status, op };
  return (p, cfg, now) => ({ ...demoSources(DEMOS.normal!)(p, cfg, now), git: () => ({ ...view }), history: () => null });
}

test('round 8: through the real HUD path (renderPayload, the adapter, the engine, the layer, the frame) each row span for span', () => {
  const cfg: Config = { ...defaults(), look: 'hud' };
  R8.situations.forEach((s, i) => {
    const r = renderPayload(JSON.stringify(DEMOS.normal!.payload), { env: { FORCE_COLOR: '3' }, config: cfg, sources: situationSources(s), now: DEMO_NOW });
    assert.ok(r.hud, s.label);
    const { hist, scoped, branch, add, del, ...rest } = plain(r.hud.input) as unknown as RefState;
    const { branch: _b, add: _a, del: _d, ...ref } = plain(NORMAL);
    assert.deepEqual([rest, hist, scoped, add, del], [ref, null, [], s.add, s.del], `${s.label}: the engine is handed the design's state`);
    assert.equal(branch, s.g.detached ?? (s.g.op?.kind === 'rebase' ? '0a1b2c3' : s.branch), `${s.label}: the engine's branch as on disk`);
    // a rebase names its branch (head-name), which the layer draws instead of the detached HEAD's sha
    assert.deepEqual(plain(r.hud.git), { ...marksOf(s.g), name: s.g.op?.kind === 'rebase' ? s.branch : null }, `${s.label}: the marks`);
    assert.deepEqual(plain(r.hud.framed), R8.rows[i]!.lines, s.label);
    assert.equal(r.hud.offset, 0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// By hand
// ---------------------------------------------------------------------------------------------------------------------

test('nothing known, or no readout: the lines as the engine drew them (a copy); classic\'s 0.6.0 bytes stand', () => {
  const eng = renderHud(NORMAL, 'off');
  for (const [what, m] of [['unknown', NO_MARKS], ['zeros', marks({ ahead: 0, behind: 0 })]] as const) {
    const got = gitHud(eng, m, 'main');
    assert.deepEqual(got, eng, what);
    assert.notEqual(got, eng);
    got.forEach((l, i) => assert.notEqual(l, eng[i], `${what}: line ${i} is a copy`));
  }
  const fresh = renderHud(STATES.fresh, 'off');
  assert.equal(readoutAt(fresh[3]!), -1, 'outside a repo nothing follows the hotbar');
  assert.deepEqual(gitHud(fresh, marks({ files: clean }), 'main'), fresh);
  assert.deepEqual(gitHud([], marks({ files: clean }), 'main'), []);
  // an unknown status keeps ⎇ grey, but what the git dir says still shows
  const merging = gitHud(eng, marks({ op: { kind: 'merge', step: null, total: null } }), 'main');
  assert.deepEqual(merging[3]!.slice(-4), [S(MARK, GREY), S('main', PURPLE), S(' '), S('merge', PURPLE)]);
});

test('readoutAt: the grey ⎇ and the white branch as the line\'s last two spans, plain', () => {
  const head = [S('v2.1.306'), S(' ')];
  assert.equal(readoutAt([...head, S(MARK, GREY), S('main', WHITE)]), 2);
  for (const [what, l] of [
    ['no branch after it', [...head, S(MARK, GREY)]],
    ['a one-span line', [S(MARK, GREY)]],
    ['an empty line', []],
    ['another mark', [...head, S('⎇', GREY), S('main', WHITE)]],
    ['a coloured mark', [...head, S(MARK, GREEN), S('main', WHITE)]],
    ['a bold mark', [...head, S(MARK, GREY, null, true), S('main', WHITE)]],
    ['a mark with a background', [...head, S(MARK, GREY, '#201E07'), S('main', WHITE)]],
    ['a grey branch', [...head, S(MARK, GREY), S('main', GREY)]],
    ['a bold branch', [...head, S(MARK, GREY), S('main', WHITE, null, true)]],
    ['a branch with a background', [...head, S(MARK, GREY), S('main', WHITE, '#201E07')]],
    ['something after the branch', [...head, S(MARK, GREY), S('main', WHITE), S(' ')]],
  ] as Array<[string, Span[]]>) assert.equal(readoutAt(l), -1, what);
});

test('the colours: ⎇ by the working tree, the branch by the commits', () => {
  const f = (changed: number, untracked: number, conflicts: number): GitMarks => marks({ files: { changed, untracked, conflicts } });
  assert.deepEqual([NO_MARKS, f(0, 0, 0), f(3, 0, 0), f(0, 2, 0), f(3, 2, 0), f(0, 0, 1), f(3, 2, 1)].map(filesColour), [GREY, GREEN, YELLOW, AQUA, YELLOW, RED, RED]);
  const op = { kind: 'merge', step: null, total: null } as const;
  assert.deepEqual([
    NO_MARKS, marks({ ahead: 1 }), marks({ behind: 1 }), marks({ op }), marks({ op, ahead: 2 }), marks({ detached: 'abc1234' }), marks({ detached: 'abc1234', op, ahead: 1 }),
  ].map(nameColour), [WHITE, GOLD, GOLD, PURPLE, PURPLE, GREY, GREY]);
});

test('the marks: each after a space, in order; counts as the engine\'s kilo (at most 5 characters)', () => {
  const eng = renderHud({ ...NORMAL, add: 0, del: 0 }, 'off');
  const draw = (m: Partial<GitMarks>, branch = 'main'): Span[] => gitHud(eng, marks(m), branch)[3]!.slice(-20).filter((s, i, a) => i >= a.findIndex((x) => x.t === MARK));
  assert.deepEqual(draw({ files: clean }), [S(MARK, GREEN), S('main', WHITE)], 'clean, no upstream: no marks');
  assert.deepEqual(draw({ files: { changed: 0, untracked: 100000, conflicts: 123456 }, ahead: 99999, behind: 1234567, op: { kind: 'rebase', step: 3, total: 100000 } }),
    [S(MARK, RED), S('main', PURPLE), S(' '), S('rebase 3/100k', PURPLE), S(' '), S('!123k', RED, null, true), S(' '), S('?100k', AQUA, null, true), S(' '), S('↑99999↓1234k', GOLD, null, true)]);
  assert.deepEqual(draw({ files: clean, behind: 4 }), [S(MARK, GREEN), S('main', GOLD), S(' '), S('↓4', GOLD, null, true)], 'behind only');
  assert.deepEqual(draw({ files: clean, ahead: 4 }), [S(MARK, GREEN), S('main', GOLD), S(' '), S('↑4', GOLD, null, true)], 'ahead only');
  assert.deepEqual(draw({ op: { kind: 'pick', step: null, total: null } }), [S(MARK, GREY), S('main', PURPLE), S(' '), S('pick', PURPLE)], 'a cherry-pick');
  assert.deepEqual(draw({ op: { kind: 'rebase', step: null, total: 5 } }), [S(MARK, GREY), S('main', PURPLE), S(' '), S('rebase', PURPLE)], 'a step it could not read');
  assert.deepEqual(draw({ op: { kind: 'merge', step: 1, total: 2 } }), [S(MARK, GREY), S('main', PURPLE), S(' '), S('merge', PURPLE)], 'only a rebase has a step');
  assert.deepEqual(draw({ files: clean, detached: '4f4e2d8' }, '4f4e2d8'), [S(MARK, GREEN), S('@4f4e2d8', GREY)], 'detached');
  // a rebase draws its own branch (cleaned as the engine cleans one), not the engine's
  assert.deepEqual(draw({ files: clean, op: { kind: 'rebase', step: 2, total: 5 }, name: ' feature/\x1b[31mx\u0007 ' }, '0a1b2c3'),
    [S(MARK, GREEN), S('feature/x', PURPLE), S(' '), S('rebase 2/5', PURPLE)]);
  assert.deepEqual(draw({ files: clean, name: '\u200d' }, 'main'), [S(MARK, GREEN), S('main', WHITE)], 'a name that cleans to nothing: the engine\'s branch');
});

test('fit: the branch is cut from the front to keep line 4 within 110 cells; marks give way, least important first, so it keeps 10', () => {
  assert.equal(MIN_NAME, 10);
  const all: Partial<GitMarks> = { files: { changed: 1, untracked: 99999, conflicts: 99999 }, ahead: 99999, behind: 99999, op: { kind: 'rebase', step: 99999, total: 99999 } };
  // the widest readout the engine draws: +99999 -99999 puts ⎇ at col 78
  const st = { ...NORMAL, add: 99999, del: 99999, branch: 'feature/' + 'b'.repeat(40) };
  assert.equal(markCol(st), 78);
  const line = (m: Partial<GitMarks>, s: RefState = st): string => text(gitHud(renderHud(s, 'off'), marks(m), branchOf(s))[3]!);
  const tails = [
    line(all),
    line({ ...all, files: { changed: 1, untracked: 0, conflicts: 99999 } }),
    line({ ...all, files: { changed: 1, untracked: 0, conflicts: 99999 }, ahead: 0, behind: 0 }),
  ].map((t) => t.slice(t.indexOf('⎇')));
  // 110 - 78 - 2 = 30 cells for the branch and the marks: ?N goes, then ↑↓, then the step: 'rebase !99999' leaves 16.
  // tailPath keeps a name's end ('…/b/b/c'), but a last name longer than the room keeps its own start
  assert.deepEqual(tails, ['⎇ bbbbbbbbbbbbbbb… rebase !99999', '⎇ bbbbbbbbbbbbbbb… rebase !99999', '⎇ bbbbbbbbbbbbbbb… rebase !99999']);
  assert.equal(cellWidth(line(all)), 110);
  const segs = { ...st, branch: 'feature/' + 'ab/'.repeat(20) + 'end' };
  assert.equal(tailOf(gitHud(renderHud(segs, 'off'), marks(all), branchOf(segs))[3]!), '⎇ …/ab/ab/ab/end rebase !99999');
  // with fewer marks they stay, and the branch takes what is left
  assert.equal(tailOf(gitHud(renderHud(segs, 'off'), marks({ files: clean, ahead: 2, behind: 1 }), branchOf(segs))[3]!), '⎇ …/ab/ab/ab/ab/ab/ab/end ↑2↓1');
  // a short branch keeps all of itself (less than 10 cells), so the marks give way to it
  const short = { ...st, branch: 'main' };
  assert.equal(tailOf(gitHud(renderHud(short, 'off'), marks(all), 'main')[3]!), '⎇ main rebase 99999/99999 !99999');
  // a crafted line with no room at all: every mark gives way and the branch gets what is left, nothing past 110
  const tight = [[S('x'.repeat(104)), S(MARK, GREY), S('feature/long', WHITE)]];
  const got = gitHud(tight, marks(all), 'feature/long')[0]!;
  assert.deepEqual(got, [S('x'.repeat(104)), S(MARK, RED), S('lo…', PURPLE)], '4 cells: the last name, cut, as tailPath does');
  const none = gitHud([[S('x'.repeat(109)), S(MARK, GREY), S('main', WHITE)]], marks(all), 'main')[0]!;
  assert.deepEqual(none, [S('x'.repeat(109)), S(MARK, RED)], 'no room for any of the branch: none of it');
});

test('gitMarks: from the render\'s git view; a rebase draws its branch; a detached HEAD unless Claude Code named the branch', () => {
  const repo = (detached: boolean): Repo => ({ root: 'r', gitDir: 'r/.git', commonDir: 'r/.git', head: detached ? 'a'.repeat(40) : 'ref: refs/heads/main', branch: detached ? 'aaaaaaa' : 'main', detached });
  const st: GitStatus = { changed: 1, untracked: 2, conflicts: 3, ahead: 4, behind: 5 };
  assert.deepEqual(gitMarks({ isRepo: false }, false), NO_MARKS);
  assert.deepEqual(gitMarks({ isRepo: true }, false), NO_MARKS, 'classic\'s view (no status, no op): nothing known');
  assert.deepEqual(gitMarks({ isRepo: true, repo: repo(false), status: null, op: null }, false), NO_MARKS);
  assert.deepEqual(gitMarks({ isRepo: true, repo: repo(false), status: st, op: null }, false),
    { files: { changed: 1, untracked: 2, conflicts: 3 }, ahead: 4, behind: 5, op: null, detached: null, name: null });
  assert.deepEqual(gitMarks({ isRepo: true, repo: repo(false), status: { ...st, ahead: null, behind: null }, op: null }, false),
    { files: { changed: 1, untracked: 2, conflicts: 3 }, ahead: 0, behind: 0, op: null, detached: null, name: null }, 'no upstream');
  assert.deepEqual(gitMarks({ isRepo: true, repo: repo(true), status: null, op: null }, false), marks({ detached: 'aaaaaaa' }));
  assert.deepEqual(gitMarks({ isRepo: true, repo: repo(true), status: null, op: null }, true), NO_MARKS, 'the worktree\'s branch from stdin');
  const rebase: GitOp = { kind: 'rebase', step: 2, total: 5, head: 'feature/x' };
  assert.deepEqual(gitMarks({ isRepo: true, repo: repo(true), status: null, op: rebase }, false), marks({ op: { kind: 'rebase', step: 2, total: 5 }, name: 'feature/x' }));
  assert.deepEqual(gitMarks({ isRepo: true, repo: repo(true), status: null, op: { ...rebase, head: null } }, false),
    marks({ op: { kind: 'rebase', step: 2, total: 5 }, detached: 'aaaaaaa' }), 'a rebase of a detached HEAD');
  assert.deepEqual(gitMarks({ isRepo: true, repo: repo(false), status: null, op: { kind: 'pick', step: null, total: null, head: null } }, false),
    marks({ op: { kind: 'pick', step: null, total: null } }));
  // the rebase's branch is stripped and capped like the HUD's branch (its last 256 code points)
  const long = gitMarks({ isRepo: true, repo: repo(true), status: null, op: { ...rebase, head: 'x/\x1b[2J' + 'y'.repeat(300) } }, false);
  assert.equal(long.name, '…' + 'y'.repeat(255));
});

test('the git state\'s glyphs: ⎇, ↑ and ↓ (and the engine\'s …), each 1 cell and listed by glyphs --hud; bytes as the writer makes them', () => {
  const eng = renderHud(NORMAL, 'off');
  const all = gitHud(eng, marks({ files: { changed: 1, untracked: 2, conflicts: 3 }, ahead: 4, behind: 5, op: { kind: 'rebase', step: 1, total: 2 } }), 'feature/' + 'z'.repeat(60));
  const drawn = new Set([...text(all[3]!)].filter((c) => c.codePointAt(0)! > 0x7e && !text(eng[3]!).includes(c)));
  assert.deepEqual([...drawn].sort(), ['↑', '↓', '…'].sort());
  for (const g of ['⎇', '↑', '↓', '…']) {
    assert.equal(cellWidth(g), 1, g);
    assert.ok(HUD_GLYPHS.some(([h]) => h === g), `${g} on glyphs --hud`);
  }
  const bytes = encode([gitHud(eng, marks({ files: { changed: 0, untracked: 3, conflicts: 0 } }), 'main')[3]!.slice(-4)], 'truecolor', { bold: true, nbsp: true });
  assert.equal(bytes, '\x1b[38;2;85;255;255m⎇\u00a0\x1b[0m\x1b[38;2;255;255;255mmain\x1b[0m\u00a0\x1b[1;38;2;85;255;255m?3\x1b[0m');
  const b256 = encode([gitHud(eng, marks({ files: clean, ahead: 1 }), 'main')[3]!.slice(-4)], '256', { bold: false, nbsp: false });
  assert.equal(b256, '\x1b[38;5;83m⎇ \x1b[0m\x1b[38;5;214mmain\x1b[0m \x1b[38;5;214m↑1\x1b[0m');
});

// ---------------------------------------------------------------------------------------------------------------------
// Against the tests' own layer
// ---------------------------------------------------------------------------------------------------------------------

const COUNTS = [0, 0, 0, 1, 2, 7, 99, 1234, 99999, 100000, 1234567];
/** A seeded git state; a third of them with nothing known. */
function gitState(r: Rng): OracleGit {
  if (chance(r, 0.15)) return UNKNOWN;
  const files = chance(r, 0.2) ? null : { changed: pick(r, COUNTS), untracked: pick(r, COUNTS), conflicts: chance(r, 0.6) ? 0 : pick(r, COUNTS) };
  const ab = chance(r, 0.5);
  const kind = pick(r, [null, null, 'merge', 'rebase', 'pick'] as const);
  const n = (): number | null => (chance(r, 0.15) ? null : pick(r, [1, 2, 5, 40, 99999, 100000]));
  return {
    files,
    ahead: ab ? pick(r, COUNTS) : 0,
    behind: ab ? pick(r, COUNTS) : 0,
    op: kind ? { kind, step: n(), total: n() } : null,
    detached: chance(r, 0.15) ? pick(r, ['4f4e2d8', 'abcdef0']) : null,
    name: chance(r, 0.2) ? pick(r, ['main', 'feature/' + 'n'.repeat(int(r, 0, 120)), ...TEXTS]) : null,
  };
}

function* inputs(): Generator<[string, unknown]> {
  for (const [k, s] of Object.entries(STATES)) yield [`states.${k}`, s];
  for (const [k, s] of Object.entries(SPEC.round7.situations)) yield [`round7.${k}`, s.state];
  for (let i = 0; i < SESSION.frames.length; i += 7) yield [`frame ${i}`, SESSION.frames[i]];
  const r = mulberry32(0x6175);
  const bases = [...Object.values(STATES), ...Object.values(SPEC.round7.situations).map((s) => s.state)];
  for (let k = 0; k < 300; k++) yield [`fuzz state #${k}`, fuzzState(r, bases)];
}

test('the port equals the tests\' layer on the reference states, the time-lapse and fuzz, x seeded git states x the 5 fable ids', () => {
  const r = mulberry32(0x917);
  let drawn = 0, gave = 0, cut = 0;
  for (const [what, st] of inputs()) {
    for (const id of FABLE_IDS) {
      const g = gitState(r);
      const eng = renderHud(st, id), sit = fromState(st) as { git: { branch: string } | null };
      const got = sit.git ? gitHud(eng, g, sit.git.branch) : eng;
      const want = gitOracle(MIX.render(st, picked(`fable-${id}`)), st, g);
      assert.deepEqual(tuples(got as RefLines), plain(tuples(want)), `${what} ${id} ${JSON.stringify(g)}`);
      // the engine's other lines untouched, line 4 within 110 cells and never opening with a blank
      for (let i = 0; i < eng.length - 1; i++) assert.deepEqual(got[i], eng[i]);
      const l4 = text(got[got.length - 1]!);
      assert.ok(cellWidth(l4) <= 110 && !/^\s/u.test(l4), `${what} ${id}: ${cellWidth(l4)} cells`);
      if (sit.git && JSON.stringify(got) !== JSON.stringify(eng)) drawn++;
      if (g.files?.untracked && sit.git && !l4.includes('?')) gave++;
      if (l4.includes('⎇ …') || l4.includes('⎇ @…')) cut++;
    }
  }
  assert.ok(drawn > 800 && gave > 20 && cut > 50, JSON.stringify({ drawn, gave, cut }));
});

test('the tests\' layer finds the readout where the port does, on every reference state with a repo', () => {
  for (const st of [...Object.values(STATES), ...SESSION.frames.filter((_, i) => i % 50 === 0)]) {
    const col = markCol(st), eng = renderHud(st, 'off');
    if (col === null) { assert.equal(readoutAt(eng[3]!), -1); continue; }
    assert.equal(W(eng[3]!.slice(0, readoutAt(eng[3]!))), col);
  }
});
