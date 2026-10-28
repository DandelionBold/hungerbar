// The HUD's git state (SPEC §0.9, 0.7.0), written for the tests and independent of src/hud/gitstate.ts, from the
// pick in design round 8 (test/reference/round8/gitstate.json, the 'colour-marks' option of the design's build.cjs),
// cell by cell on the vendored engine's render of a state. Where src/ finds the readout by the hotbar line's last two
// spans, this finds its column from the state, through the engine's own fromState() and kilo(): the hotbar ends at col
// 62, then ' +A' and ' -R' for the non-zero counts, two spaces after counts (one without), then ⎇. The engine's tailPath
// and tidy() cut and clean the name, as the design did.
//   - ⎇: green clean, yellow changes, aqua untracked only, red conflicts; grey while the status is unknown.
//   - The name: '@' + the short sha in grey when detached; else the rebase's own branch, else the engine's, in purple
//     while something is in progress, gold when ahead or behind, else white.
//   - The marks, each after a space: purple 'merge' | 'rebase S/T' | 'pick', red bold '!N', aqua bold '?N', gold bold
//     '↑A↓B' (kilo'd counts). The name keeps min(its width, 10) cells; until it can, the marks give way, least important
//     first: '?N', '↑↓', the rebase's step, '!N', the word.
//   - Then the pull request's badge (0.7.0, test/hud/prci-oracle.ts), whole: its cells come out of the room the name
//     and the marks share.
//   - Nothing known (no status, nothing in progress, not detached, no name) and no badge: the lines as the engine drew
//     them.
import { PORT, cellWidth, type RefLines, type RefSpan } from './ref.ts';

const GREY = '#AAAAAA', WHITE = '#FFFFFF';
const C = { green: '#55FF55', yellow: '#FFFF55', aqua: '#55FFFF', red: '#FF5555', purple: '#FF55FF', gold: '#FFAA00' };

/** The git state's input, as the tests hand it (the shape of src/hud/gitstate.ts GitMarks, restated here). */
export interface OracleGit {
  files: { changed: number; untracked: number; conflicts: number } | null;
  ahead: number;
  behind: number;
  op: { kind: 'merge' | 'rebase' | 'pick'; step: number | null; total: number | null } | null;
  detached: string | null;
  name: string | null;
}
export const UNKNOWN: OracleGit = { files: null, ahead: 0, behind: 0, op: null, detached: null, name: null };

interface Cell { ch: string; fg: string | undefined; bg: string | undefined; bold: boolean }
const cellsOf = (spans: readonly RefSpan[]): Cell[] =>
  spans.flatMap((s) => Array.from(s.t, (ch) => ({ ch, fg: s.fg || undefined, bg: s.bg || undefined, bold: !!s.bold })));
const styled = (t: string, fg?: string, bold = false): Cell[] => Array.from(t, (ch) => ({ ch, fg, bg: undefined, bold }));
function runs(cells: readonly Cell[]): RefSpan[] {
  const out: RefSpan[] = [];
  let last: Cell | undefined;
  for (const c of cells) {
    if (last && last.fg === c.fg && last.bg === c.bg && last.bold === c.bold) out[out.length - 1]!.t += c.ch;
    else {
      const s: RefSpan = { t: c.ch };
      if (c.fg) s.fg = c.fg;
      if (c.bg) s.bg = c.bg;
      if (c.bold) s.bold = true;
      out.push(s);
    }
    last = c;
  }
  return out;
}
const width = (cells: readonly Cell[]): number => cellWidth(cells.map((c) => c.ch).join(''));

/** The column of the readout's ⎇ on the hotbar line, from the state; null outside a repo. */
export function markCol(state: unknown): number | null {
  const git = (PORT.fromState(state) as { git: { add: number; rem: number } | null }).git;
  if (!git) return null;
  const k = (n: number): number => String(PORT.kilo(n)).length;
  return 62 + (git.add ? 2 + k(git.add) : 0) + (git.rem ? 2 + k(git.rem) : 0) + (git.add || git.rem ? 2 : 1);
}

/**
 * The engine's render of `state` (its last line the hotbar line) with the git state `g`, and the pull request's `badge`
 * (as test/hud/prci-oracle.ts draws it; none by default) after the marks.
 */
export function gitOracle(lines: RefLines, state: unknown, g: OracleGit, badge: readonly RefSpan[] = []): RefLines {
  const copy = lines.map((l) => l.map((s) => ({ ...s })));
  const col = markCol(state);
  const known = g.files || g.ahead || g.behind || g.op || g.detached || g.name;
  if (col === null || (!known && !badge.length)) return copy;
  const pr = cellsOf(badge);
  // the hotbar line before `col`, cut by the engine's own WT clusters (the gutter holds the version, which is user text)
  const [before, from] = PORT.splitAt(copy[copy.length - 1]!, col) as [RefSpan[], RefSpan[]];
  if (cellWidth(before.map((s) => s.t).join('')) !== col || !from[0]?.t.startsWith('⎇') || from[0].fg !== GREY) throw new Error(`no grey ⎇ at col ${col}`);
  const branch = (PORT.fromState(state) as { git: { branch: string } }).git.branch;
  const f = g.files;
  const mark = !f ? GREY : f.conflicts ? C.red : f.changed ? C.yellow : f.untracked ? C.aqua : C.green;
  const nameFg = g.detached ? GREY : g.op ? C.purple : g.ahead || g.behind ? C.gold : WHITE;
  const text: string = g.detached ? '@' + g.detached : (g.name ? PORT.tidy(g.name, true, -256) : '') || branch;
  // the marks in the order they are drawn, each with the rank at which it gives way (0 first)
  const k = (n: number): string => String(PORT.kilo(n));
  const marks: Array<{ rank: number; cells: (shown: Set<number>) => Cell[] }> = [];
  if (g.op) {
    const op = g.op;
    marks.push({ rank: 4, cells: (shown) => [...styled(' '), ...styled(op.kind + (shown.has(2) && op.kind === 'rebase' && op.step !== null && op.total !== null ? ` ${k(op.step)}/${k(op.total)}` : ''), C.purple)] });
  }
  if (f && f.conflicts) marks.push({ rank: 3, cells: () => [...styled(' '), ...styled('!' + k(f.conflicts), C.red, true)] });
  if (f && f.untracked) marks.push({ rank: 0, cells: () => [...styled(' '), ...styled('?' + k(f.untracked), C.aqua, true)] });
  if (g.ahead || g.behind) {
    marks.push({ rank: 1, cells: () => [...styled(' '), ...(g.ahead ? styled('↑' + k(g.ahead), C.gold, true) : []), ...(g.behind ? styled('↓' + k(g.behind), C.gold, true) : [])] });
  }
  let tail: Cell[] = [];
  for (let gone = 0; gone <= 5; gone++) {
    const shown = new Set([0, 1, 2, 3, 4].filter((r) => r >= gone));
    tail = marks.filter((m) => shown.has(m.rank)).flatMap((m) => m.cells(shown));
    if (110 - col - 2 - width(tail) - width(pr) >= Math.min(cellWidth(text), 10)) break;
  }
  const name: string = PORT.tailPath(text, 110 - col - 2 - width(tail) - width(pr));
  copy[copy.length - 1] = runs([...cellsOf(before), ...styled('⎇ ', mark), ...styled(name, nameFg), ...tail, ...pr]);
  return copy;
}
