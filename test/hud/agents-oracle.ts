// The agents at work (SPEC §0.12, 1.1.0), written for the tests and independent of src/hud/agents.ts, from the picks of
// design round 9b (test/reference/round9/agents-bees.json and agents-allays.json: build-9b.cjs bees() and build.cjs
// allays() with their inSky(), restated), cluster by cluster on the vendored engine's render of a state with the layers
// before this one drawn. Line 1 is the fourth line from the bottom of the engine's lines (the second of 5 with the boss
// bar on top).
//   - bees: a hive ▤ (#F0B43C on #6E4B1F) at col 80; bee k (k = 0, 1, …) at col 82 + 4k: two cells ▐ in brown #3A2E16
//     on the yellow #F8C94A, then its wing in #E6F2FF, U+1FB02 (raised) for an even k, U+1FB0B (level) for an odd one.
//   - allays: allay k at col 82 + 4k: U+1FB0E in #D9F4FF, U+1FB39 in #7FD3FF, then U+1FB06 (raised) or U+1FB0B (level) in
//     #7FD3FF.
//   - Four at most, then at col 98 a bold '+' and the rest's count, in the bees' yellow or the allays' blue.
// Unlike the design's inSky, which drew each sprite where it fit, the shipped rule (SPEC §0.12) is all or nothing: the
// whole flock is drawn only where every column from the one before its first cell to its last cell is empty sky (past the
// line's end, or an unstyled space); the line is padded with unstyled spaces up to the flock's end. On every row of the
// design the two agree, as the whole sky after col 78 is empty there.
import { PORT, type RefLines, type RefSpan } from './ref.ts';

/** The agents' input, as the tests hand it (the look and the agents at work of src/hud/agents.ts AgentMarks, restated). */
export interface OracleAgents { look: 'bees' | 'allays' | null; live: number }
export const QUIET_AGENTS: OracleAgents = { look: null, live: 0 };

interface Cl { g: string; w: number; fg: string | undefined; bg: string | undefined; bold: boolean }
function clustersOf(line: readonly RefSpan[]): Cl[] {
  const out: Cl[] = [];
  for (const s of line) PORT.clusters(s.t, (g: string, w: number) => out.push({ g, w, fg: s.fg || undefined, bg: s.bg || undefined, bold: !!s.bold }));
  return out;
}
function runs(cs: readonly Cl[]): RefSpan[] {
  const out: RefSpan[] = [];
  let last: Cl | undefined;
  for (const c of cs) {
    if (last && last.fg === c.fg && last.bg === c.bg && last.bold === c.bold) out[out.length - 1]!.t += c.g;
    else {
      const s: RefSpan = { t: c.g };
      if (c.fg) s.fg = c.fg;
      if (c.bg) s.bg = c.bg;
      if (c.bold) s.bold = true;
      out.push(s);
    }
    last = c;
  }
  return out;
}
const widthOf = (cs: readonly Cl[]): number => cs.reduce((w, c) => w + c.w, 0);
/** The index of the cluster that starts at `col`, or -1 (inside a wide one, or past the end). */
function at(cs: readonly Cl[], col: number): number {
  let c = 0;
  for (let i = 0; i < cs.length; i++) {
    if (c === col) return i;
    c += cs[i]!.w;
  }
  return -1;
}
const cell = (g: string, fg: string, bg?: string, bold = false): Cl => ({ g, w: 1, fg, bg, bold });

/** build.cjs sext(): the block sextant with these bits (1 2 / 4 8 / 16 32, top to bottom). */
const sext = (bits: number): string => String.fromCodePoint(0x1FB00 + bits - 1 - (bits > 21 ? 1 : 0) - (bits > 42 ? 1 : 0));

/** The flock's cells for `live` agents, each as [first column, cells]. */
function flock(look: 'bees' | 'allays', live: number): Array<[number, Cl[]]> {
  const out: Array<[number, Cl[]]> = [];
  if (look === 'bees') {
    out.push([80, [cell('▤', '#F0B43C', '#6E4B1F')]]);
    for (let k = 0; k < Math.min(live, 4); k++) {
      out.push([82 + 4 * k, [cell('▐', '#3A2E16', '#F8C94A'), cell('▐', '#3A2E16', '#F8C94A'), cell(k % 2 ? sext(4 + 8) : sext(1 + 2), '#E6F2FF')]]);
    }
  } else {
    for (let k = 0; k < Math.min(live, 4); k++) {
      out.push([82 + 4 * k, [cell(sext(1 + 2 + 4 + 8), '#D9F4FF'), cell(sext(4 + 8 + 16 + 32), '#7FD3FF'), cell(k % 2 ? sext(4 + 8) : sext(1 + 2 + 4), '#7FD3FF')]]);
    }
  }
  if (live > 4) out.push([98, [...`+${live - 4}`].map((g) => cell(g, look === 'bees' ? '#F8C94A' : '#7FD3FF', undefined, true))]);
  return out;
}

/** The agents on the render (with the earlier layers drawn): the flock of `m` in line 1's sky, or the lines as they are. */
export function agentsOracle(lines: RefLines, m: OracleAgents): RefLines {
  const copy = lines.map((l) => l.map((s) => ({ ...s })));
  const n = copy.length;
  if (!m.look || m.live <= 0 || n < 4) return copy;
  const birds = flock(m.look, m.live), cs = clustersOf(copy[n - 4]!);
  const from = birds[0]![0] - 1, to = birds[birds.length - 1]![0] + birds[birds.length - 1]![1].length;
  for (let c = from; c < to; c++) {
    if (c >= widthOf(cs)) break;
    const k = at(cs, c), x = k < 0 ? undefined : cs[k];
    if (!x || x.g !== ' ' || x.fg || x.bg || x.bold) return copy;
  }
  while (widthOf(cs) < to) cs.push({ g: ' ', w: 1, fg: undefined, bg: undefined, bold: false });
  for (const [col, cells] of birds) cs.splice(at(cs, col), cells.length, ...cells);
  copy[n - 4] = runs(cs);
  return copy;
}
