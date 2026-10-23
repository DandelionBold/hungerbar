// The HUD's pull request and CI badge (src/hud/prci.ts, drawn by src/hud/gitstate.ts, SPEC §0.9, 0.7.0): the
// 'prci-compact' pick from design round 8, span for span against the design's own rows
// (test/reference/round8/prci.json), through the layer on the engine's render, through the tests' own badge and layer
// (test/hud/prci-oracle.ts with gitstate-oracle.ts) and through the real HUD path (renderPayload with sources that hand
// it each situation's PR); by hand on every form of the badge, its place after the git state's marks, the fit next to
// the widest readout, and its glyphs and bytes; then against the tests' layer on the reference states, the time-lapse
// and seeded fuzz states x seeded git states x seeded PRs, for the 5 fable ids. No PR: the git state's lines, as 0.7.0's.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { HUD_GLYPHS } from '../../src/cli/glyphs.ts';
import { defaults, type Config } from '../../src/config.ts';
import { DEMOS, DEMO_NOW, demoSources } from '../../src/demo.ts';
import { FABLE_IDS, renderHud } from '../../src/hud/fable.ts';
import { frameHud } from '../../src/hud/frame.ts';
import { gitHud, GOLD, GREEN, MARK, NO_MARKS, PURPLE, RED, YELLOW, type GitMarks } from '../../src/hud/gitstate.ts';
import { fromState } from '../../src/hud/input.ts';
import { encode } from '../../src/hud/look.ts';
import { DGREY, GREY, WHITE } from '../../src/hud/mix.ts';
import { prBadge } from '../../src/hud/prci.ts';
import { S, W, type Span } from '../../src/hud/spans.ts';
import { cellWidth } from '../../src/hud/wt.ts';
import type { Payload } from '../../src/payload.ts';
import type { PrInfo } from '../../src/pr/gh.ts';
import { renderPayload } from '../../src/render.ts';
import type { Sources } from '../../src/state.ts';
import { frameOracle } from '../hud/frame-oracle.ts';
import { chance, int, mulberry32, pick, state as fuzzState, TEXTS, type Rng } from '../hud/fuzz.ts';
import { gitOracle, markCol, UNKNOWN, type OracleGit } from '../hud/gitstate-oracle.ts';
import { badgeOracle, type OraclePr } from '../hud/prci-oracle.ts';
import { picked, MIX, plain, REF, SESSION, SOURCES, SPEC, STATES, tuples, type RefLines, type RefState } from '../hud/ref.ts';

const text = (l: readonly Span[]): string => l.map((s) => s.t).join('');
const NORMAL: RefState = STATES.normal;
const branchOf = (st: unknown): string => (fromState(st).git as { branch: string }).branch;
const marks = (m: Partial<GitMarks>): GitMarks => ({ ...NO_MARKS, ...m });
const pr = (p: Partial<PrInfo>): PrInfo => ({ n: 123, state: 'open', ci: null, review: null, conflict: false, ...p });
/** The hotbar line from ⎇ on. */
const tailOf = (l: readonly Span[]): string => { const t = text(l); return t.slice(t.lastIndexOf('⎇')); };

// ---------------------------------------------------------------------------------------------------------------------
// The design's rows
// ---------------------------------------------------------------------------------------------------------------------

interface DesignPr { n: number; state: PrInfo['state']; ci: 'running' | 'passed' | 'failed'; review?: 'approved' | 'changes'; conflict?: boolean; checks: string }
interface Situation { label: string; branch: string; add: number; del: number; pr: DesignPr | null }
interface Round8 { id: string; source: { sha256: string; option: string }; situations: Situation[]; rows: Array<{ label: string; lines: RefLines }> }
const R8 = JSON.parse(readFileSync(join(REF, 'round8', 'prci.json'), 'utf8')) as Round8;

/** A situation's PR as gh's answer reads it. */
const prOf = (p: DesignPr | null): PrInfo | null => (p ? { n: p.n, state: p.state, ci: p.ci, review: p.review ?? null, conflict: p.conflict ?? false } : null);
const stateOf = (s: Situation): RefState => ({ ...NORMAL, branch: s.branch, add: s.add, del: s.del });

test('round 8: the vendored rows are the prci-compact pick, 11 situations of the full HUD (5 lines, framed, left)', () => {
  assert.equal(R8.id, 'prci-compact');
  assert.equal(R8.source.option, 'prci-compact');
  const src = SOURCES.files['round8/prci.json']!;
  assert.equal((src.originSha256 as Record<string, string>)['round8/prci.json'], R8.source.sha256);
  assert.deepEqual(R8.situations.map((s) => s.label), R8.rows.map((r) => r.label));
  assert.equal(R8.rows.length, 11);
  for (const r of R8.rows) {
    assert.equal(r.lines.length, 5, r.label);
    for (const l of r.lines) assert.ok(cellWidth(text(l as Span[])) <= 110 && !/^\s/u.test(text(l as Span[])), r.label);
  }
  assert.deepEqual(R8.rows.map((r) => tailOf(r.lines[3] as Span[])), [
    '⎇ main', '⎇ main  #123 ●', '⎇ main  #123 ✓✓', '⎇ main  #123 ×', '⎇ main  #123 ✓±', '⎇ main  #123 ✓◌', '⎇ main  #123 ✓‼',
    '⎇ main  #123 merged', '⎇ main  #123 closed', '⎇ …/parser-8.6.3  #10482 ✓±', '⎇ …/parser-8.6.3  #10482 ●',
  ]);
});

test('round 8: the layer on the engine\'s render draws each row span for span; the tests\' own badge and layer do too', () => {
  R8.situations.forEach((s, i) => {
    const st = stateOf(s);
    const got = frameHud(gitHud(renderHud(st, 'off'), NO_MARKS, branchOf(st), prBadge(prOf(s.pr))));
    assert.deepEqual(plain(got), R8.rows[i]!.lines, s.label);
    const oracle = frameOracle(gitOracle(MIX.render(st, picked('fable-off')), st, UNKNOWN, badgeOracle(prOf(s.pr))), st);
    assert.deepEqual(plain(tuples(oracle)), tuples(R8.rows[i]!.lines), `${s.label}: the tests' layer`);
  });
});

/** The demo's normal day with this situation's branch and diff, no git status, no history (the design draws none) and its PR. */
function situationSources(s: Situation): (p: Payload, cfg: Config, now: number) => Sources {
  return (p, cfg, now) => ({
    ...demoSources(DEMOS.normal!)(p, cfg, now),
    git: () => ({ isRepo: true, branch: s.branch, added: s.add, removed: s.del, status: null, op: null }),
    history: () => null,
    pr: () => prOf(s.pr),
  });
}

test('round 8: through the real HUD path (renderPayload, the adapter, the engine, the layer, the frame) each row span for span', () => {
  const cfg: Config = { ...defaults(), look: 'hud', hud: { ...defaults().hud, pr: 'on' } };
  R8.situations.forEach((s, i) => {
    const r = renderPayload(JSON.stringify(DEMOS.normal!.payload), { env: { FORCE_COLOR: '3' }, config: cfg, sources: situationSources(s), now: DEMO_NOW });
    assert.ok(r.hud, s.label);
    const { hist, scoped, branch, add, del, ...rest } = plain(r.hud.input) as unknown as RefState;
    const { branch: _b, add: _a, del: _d, ...ref } = plain(NORMAL);
    assert.deepEqual([rest, hist, scoped, branch, add, del], [ref, null, [], s.branch, s.add, s.del], `${s.label}: the engine is handed the design's state`);
    assert.deepEqual(plain(r.hud.git), NO_MARKS, `${s.label}: the design knew no git state`);
    assert.deepEqual(plain(r.hud.pr), prOf(s.pr), `${s.label}: the PR`);
    assert.deepEqual(plain(r.hud.framed), R8.rows[i]!.lines, s.label);
    assert.deepEqual(r.spawns, [], 'the sources queue nothing');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// By hand
// ---------------------------------------------------------------------------------------------------------------------

test('every form of the badge: the number, one CI mark, at most one more; merged and closed in words; no PR, nothing', () => {
  const N = [S('  '), S('#', GREY), S('123', WHITE)];
  const ok = S('✓', GREEN, null, true), run = S('●', GOLD), fail = S('×', RED, null, true);
  assert.deepEqual(prBadge(null), []);
  for (const [what, p, want] of [
    ['no checks, no review', pr({}), N],
    ['running', pr({ ci: 'running' }), [...N, S(' '), run]],
    ['passed', pr({ ci: 'passed' }), [...N, S(' '), ok]],
    ['failed', pr({ ci: 'failed' }), [...N, S(' '), fail]],
    ['passed and approved: two ticks', pr({ ci: 'passed', review: 'approved' }), [...N, S(' '), ok, ok]],
    ['running, changes requested', pr({ ci: 'running', review: 'changes' }), [...N, S(' '), run, S('±', YELLOW, null, true)]],
    ['failed, a conflict', pr({ ci: 'failed', conflict: true }), [...N, S(' '), fail, S('‼', RED, null, true)]],
    ['a conflict wins over the review', pr({ ci: 'passed', conflict: true, review: 'approved' }), [...N, S(' '), ok, S('‼', RED, null, true)]],
    ['changes win over nothing; approved without checks', pr({ review: 'approved' }), [...N, S(' '), ok]],
    ['a draft: grey number and ◌, which wins over the rest', pr({ state: 'draft', ci: 'running', conflict: true, review: 'changes' }),
      [S('  '), S('#', DGREY), S('123', GREY), S(' '), run, S('◌', GREY)]],
    ['a draft with no checks', pr({ state: 'draft' }), [S('  '), S('#', DGREY), S('123', GREY), S(' '), S('◌', GREY)]],
    ['merged: its number and the word in purple, nothing else', pr({ state: 'merged', ci: 'failed', conflict: true, review: 'changes' }),
      [S('  '), S('#123', PURPLE, null, true), S(' merged', PURPLE)]],
    ['closed: dark grey, nothing else', pr({ state: 'closed', ci: 'passed', review: 'approved' }), [S('  '), S('#123 closed', DGREY)]],
    ['the largest number, whole', pr({ n: 999_999_999, state: 'merged' }), [S('  '), S('#999999999', PURPLE, null, true), S(' merged', PURPLE)]],
  ] as Array<[string, PrInfo, Span[]]>) {
    assert.deepEqual(prBadge(p), want, what);
    assert.deepEqual(plain(prBadge(p)), plain(badgeOracle(p as OraclePr)), `${what}: the tests' badge`);
  }
  assert.equal(W(prBadge(pr({ n: 999_999_999, state: 'merged' }))), 19, 'the widest badge');
  assert.equal(W(prBadge(pr({ n: 999_999_999, state: 'closed' }))), 19);
  assert.equal(W(prBadge(pr({ n: 999_999_999, ci: 'passed', review: 'approved' }))), 15);
});

test('after the git state: ⎇ and the branch in their colours, the marks, two spaces, the badge; outside a repo nothing', () => {
  const eng = renderHud(NORMAL, 'off');
  const all = marks({ files: { changed: 7, untracked: 1, conflicts: 2 }, ahead: 2, behind: 1, op: { kind: 'merge', step: null, total: null } });
  const got = gitHud(eng, all, 'main', prBadge(pr({ ci: 'running', review: 'approved' })));
  assert.equal(tailOf(got[3]!), '⎇ main merge !2 ?1 ↑2↓1  #123 ●✓');
  assert.deepEqual(got[3]!.slice(-7), [S('↑2↓1', GOLD, null, true), S('  '), S('#', GREY), S('123', WHITE), S(' '), S('●', GOLD), S('✓', GREEN, null, true)]);
  for (let i = 0; i < 3; i++) assert.deepEqual(got[i], eng[i], `line ${i + 1} as the engine drew it`);
  // nothing known of git: the engine's grey ⎇ and white branch, then the badge
  assert.deepEqual(gitHud(eng, NO_MARKS, 'main', prBadge(pr({ ci: 'failed' })))[3]!.slice(-7),
    [S(MARK, GREY), S('main', WHITE), S('  '), S('#', GREY), S('123', WHITE), S(' '), S('×', RED, null, true)]);
  // no badge: the git state's lines exactly
  assert.deepEqual(gitHud(eng, all, 'main', prBadge(null)), gitHud(eng, all, 'main'));
  assert.deepEqual(gitHud(eng, NO_MARKS, 'main', []), eng);
  // outside a repo the hotbar has no readout, so no badge either
  const fresh = renderHud(STATES.fresh, 'off');
  assert.deepEqual(gitHud(fresh, NO_MARKS, 'main', prBadge(pr({ ci: 'passed' }))), fresh);
  // a detached HEAD has no PR (the source says none), but the layer would draw one after @sha
  assert.equal(tailOf(gitHud(eng, marks({ detached: '4f4e2d8' }), '4f4e2d8', prBadge(pr({})))[3]!), '⎇ @4f4e2d8  #123');
});

test('fit: the badge is drawn whole; the git marks give way first, then the branch is cut, and it keeps 10 cells next to the widest badge', () => {
  const all: Partial<GitMarks> = { files: { changed: 1, untracked: 99999, conflicts: 99999 }, ahead: 99999, behind: 99999, op: { kind: 'rebase', step: 99999, total: 99999 } };
  // the widest readout the engine draws: +99999 -99999 puts ⎇ at col 78, leaving 30 cells after `⎇ `
  const st = { ...NORMAL, add: 99999, del: 99999, branch: 'feature/' + 'b'.repeat(40) };
  assert.equal(markCol(st), 78);
  const widest = prBadge(pr({ n: 999_999_999, state: 'merged' }));
  const line = (m: Partial<GitMarks>, badge: Span[], s: RefState = st): Span[] => gitHud(renderHud(s, 'off'), marks(m), branchOf(s), badge)[3]!;
  // 30 - 19 = 11: every mark gives way, the branch keeps 11 cells
  assert.equal(tailOf(line(all, widest)), '⎇ bbbbbbbbbb…  #999999999 merged');
  assert.equal(cellWidth(text(line(all, widest))), 110);
  // a smaller badge leaves room for the word in progress and the conflicts (the step gave way, so the branch keeps 10)
  assert.equal(tailOf(line(all, prBadge(pr({ n: 7, ci: 'passed' })))), '⎇ bbbbbbbbb… rebase !99999  #7 ✓');
  // without git marks the branch takes what the badge leaves, cut from the front as the design does
  const segs = { ...st, branch: 'dependabot/npm_and_yarn/packages/web-client/typescript-eslint/parser-8.6.3' };
  assert.equal(tailOf(line({}, prBadge(pr({ n: 10482, ci: 'running' })), segs)), '⎇ …/parser-8.6.3  #10482 ●');
  // a short branch keeps all of itself; the badge is never cut
  assert.equal(tailOf(line(all, widest, { ...st, branch: 'main' })), '⎇ main rebase  #999999999 merged');
  // a crafted line with no room left (the engine never draws ⎇ past col 78): the badge whole, none of the branch
  const tight = gitHud([[S('x'.repeat(104)), S(MARK, GREY), S('main', WHITE)]], marks(all), 'main', prBadge(pr({ n: 5 })))[0]!;
  assert.deepEqual(tight, [S('x'.repeat(104)), S(MARK, RED), S('  '), S('#', GREY), S('5', WHITE)]);
});

test('the badge\'s glyphs: ● ✓ × ± ‼ ◌, each 1 cell and listed by glyphs --hud; bytes as the writer makes them', () => {
  for (const g of ['●', '✓', '×', '±', '‼', '◌']) {
    assert.equal(cellWidth(g), 1, g);
    assert.ok(HUD_GLYPHS.some(([h]) => h === g), `${g} on glyphs --hud`);
  }
  const eng = renderHud({ ...NORMAL, add: 0, del: 0 }, 'off');
  const tail = (p: PrInfo): Span[] => { const l = gitHud(eng, NO_MARKS, 'main', prBadge(p))[3]!; return l.slice(l.findIndex((s) => s.t === MARK)); };
  assert.equal(encode([tail(pr({ ci: 'passed', review: 'approved' }))], 'truecolor', { bold: true, nbsp: true }),
    '\x1b[38;2;170;170;170m⎇ \x1b[0m\x1b[38;2;255;255;255mmain\x1b[0m  \x1b[38;2;170;170;170m#\x1b[0m\x1b[38;2;255;255;255m123\x1b[0m \x1b[1;38;2;85;255;85m✓✓\x1b[0m');
  assert.equal(encode([tail(pr({ state: 'merged' }))], '256', { bold: false, nbsp: false }),
    '\x1b[38;5;248m⎇ \x1b[0m\x1b[38;5;231mmain\x1b[0m  \x1b[38;5;207m#123\x1b[0m\x1b[38;5;207m merged\x1b[0m');
});

// ---------------------------------------------------------------------------------------------------------------------
// Against the tests' own layer
// ---------------------------------------------------------------------------------------------------------------------

const COUNTS = [0, 0, 0, 1, 2, 7, 99, 1234, 99999, 100000, 1234567];
function gitState(r: Rng): OracleGit {
  if (chance(r, 0.3)) return UNKNOWN;
  const files = chance(r, 0.2) ? null : { changed: pick(r, COUNTS), untracked: pick(r, COUNTS), conflicts: chance(r, 0.6) ? 0 : pick(r, COUNTS) };
  const ab = chance(r, 0.5);
  const kind = pick(r, [null, null, 'merge', 'rebase', 'pick'] as const);
  const n = (): number | null => (chance(r, 0.15) ? null : pick(r, [1, 2, 5, 40, 99999, 100000]));
  return {
    files, ahead: ab ? pick(r, COUNTS) : 0, behind: ab ? pick(r, COUNTS) : 0, op: kind ? { kind, step: n(), total: n() } : null,
    detached: chance(r, 0.1) ? '4f4e2d8' : null, name: chance(r, 0.15) ? pick(r, ['main', 'feature/' + 'n'.repeat(int(r, 0, 120)), ...TEXTS]) : null,
  };
}
function prState(r: Rng): OraclePr | null {
  if (chance(r, 0.2)) return null;
  return {
    n: pick(r, [1, 7, 123, 10482, 999999, 999_999_999]),
    state: pick(r, ['open', 'open', 'open', 'draft', 'merged', 'closed'] as const),
    ci: pick(r, [null, 'running', 'passed', 'failed'] as const),
    review: pick(r, [null, null, 'approved', 'changes'] as const),
    conflict: chance(r, 0.2),
  };
}

function* inputs(): Generator<[string, unknown]> {
  for (const [k, s] of Object.entries(STATES)) yield [`states.${k}`, s];
  for (const [k, s] of Object.entries(SPEC.round7.situations)) yield [`round7.${k}`, s.state];
  for (let i = 0; i < SESSION.frames.length; i += 11) yield [`frame ${i}`, SESSION.frames[i]];
  const r = mulberry32(0x9c1);
  const bases = [...Object.values(STATES), ...Object.values(SPEC.round7.situations).map((s) => s.state)];
  for (let k = 0; k < 200; k++) yield [`fuzz state #${k}`, fuzzState(r, bases)];
}

test('the port equals the tests\' layer on the reference states, the time-lapse and fuzz, x seeded git states x seeded PRs x the 5 fable ids', () => {
  const r = mulberry32(0x5c1);
  let badges = 0, cut = 0, gave = 0;
  for (const [what, st] of inputs()) {
    for (const id of FABLE_IDS) {
      const g = gitState(r), p = prState(r);
      const eng = renderHud(st, id), sit = fromState(st) as { git: { branch: string } | null };
      const got = sit.git ? gitHud(eng, g, sit.git.branch, prBadge(p as PrInfo | null)) : eng;
      const want = gitOracle(MIX.render(st, picked(`fable-${id}`)), st, g, badgeOracle(p));
      assert.deepEqual(tuples(got as RefLines), plain(tuples(want)), `${what} ${id} ${JSON.stringify(g)} ${JSON.stringify(p)}`);
      for (let i = 0; i < eng.length - 1; i++) assert.deepEqual(got[i], eng[i]);
      const l4 = text(got[got.length - 1]!);
      assert.ok(cellWidth(l4) <= 110 && !/^\s/u.test(l4), `${what} ${id}: ${cellWidth(l4)} cells`);
      if (sit.git && p) {
        badges++;
        assert.ok(l4.endsWith(text(prBadge(p as PrInfo))), `${what} ${id}: the badge whole at the end`);
        // the branch keeps min(its width, 10) cells
        const name = l4.slice(l4.lastIndexOf('⎇') + 2).split(' ')[0]!;
        if (name.endsWith('…') || name.startsWith('…')) cut++;
        if (g.files?.untracked && !l4.includes('?')) gave++;
      }
    }
  }
  assert.ok(badges > 600 && cut > 50 && gave > 5, JSON.stringify({ badges, cut, gave }));
});
