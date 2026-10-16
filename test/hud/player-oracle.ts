// The player's layers (SPEC §0.9, 0.7.0), written for the tests and independent of src/hud/{who,bed,phantoms,player}.ts,
// from the picks in design round 8 (test/reference/round8/identity.json: user-grey, op-tag, op-name and bed-blocks;
// toolong.json: phantoms; the design's identity/build.cjs folder() and withBed(), toolong/build.cjs phantoms(), restated),
// cluster by cluster on the vendored engine's render of a state. Where src/ finds line 3's folder by its last span, this
// finds its column from the state: the engine's own f2Line3 of the same situation without a cwd, and two spaces.
//   - Line 3 (the second last engine line): '⌂ ', the bold red '[OP] ' (tag), the name in grey or in bold gold (gold) with
//     '@host' and ': ' in grey, then the path in grey, cut by the engine's tailPath to the room left of 110 cells. The
//     path keeps min(its width, 10) cells; until it can, '@host', the name and the tag give way, in that order. Gold
//     with no name shown turns the ⌂ gold.
//   - The bed: cols 32-35 of the hotbar line (the last), when they are the plain empty well.
//   - The phantoms: line 1 (the fourth from the bottom), one dim far phantom at cols 33-34 for one sign, else that many
//     big ones at the design's places; each only where it and the cell before it are empty sky (an unstyled space, or
//     past the line's end, padded with spaces).
import { PORT, cellWidth, type RefLines, type RefSpan } from './ref.ts';

const GREY = '#AAAAAA', RED = '#FF5555', GOLD = '#FFAA00', WELL = '#201E07';
const PILLOW = '#E9ECEC', BLANKET = '#B02E26', OAK = '#9C7F4E', TOP58 = '\u{1FB84}';
const PH_DIM = '#3B4673', PH_WING = '#5468B0', PH_EYES = '#7DFF5A';

/** The player's input, as the tests hand it (the shape of src/hud/player.ts PlayerMarks, restated here). */
export interface OraclePlayer {
  who: { user: string | null; host: string | null; op: 'tag' | 'gold' | null };
  bed: boolean;
  phantoms: number;
}
export const QUIET: OraclePlayer = { who: { user: null, host: null, op: null }, bed: false, phantoms: 0 };

/** One WT cluster with its width and its span's style (falsy fg, bg and bold are no style). */
interface Cl { g: string; w: number; fg: string | undefined; bg: string | undefined; bold: boolean }
function clustersOf(line: readonly RefSpan[]): Cl[] {
  const out: Cl[] = [];
  for (const s of line) PORT.clusters(s.t, (g: string, w: number) => out.push({ g, w, fg: s.fg || undefined, bg: s.bg || undefined, bold: !!s.bold }));
  return out;
}
const cl = (t: string, fg?: string, bg?: string, bold = false): Cl[] => {
  const out: Cl[] = [];
  PORT.clusters(t, (g: string, w: number) => out.push({ g, w, fg, bg, bold }));
  return out;
};
const widthOf = (cs: readonly Cl[]): number => cs.reduce((w, c) => w + c.w, 0);
/** Clusters back into spans, one per run of equal style (what merge() makes of a line). */
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
/** The index of the cluster that starts at `col`, or -1 (inside a wide one, or past the end). */
function at(cs: readonly Cl[], col: number): number {
  let c = 0;
  for (let i = 0; i < cs.length; i++) {
    if (c === col) return i;
    c += cs[i]!.w;
  }
  return -1;
}

/** identity/build.cjs folder(), with the room rule: the clusters from ⌂ on. */
function folder(cwd: string, room: number, w: OraclePlayer['who']): Cl[] {
  const tries: Array<{ tag: boolean; name: boolean; host: boolean }> = [
    { tag: true, name: true, host: true }, { tag: true, name: true, host: false }, { tag: true, name: false, host: false }, { tag: false, name: false, host: false },
  ];
  for (const k of tries) {
    const mid: Cl[] = [];
    if (w.op === 'tag' && k.tag) mid.push(...cl('[OP]', RED, undefined, true), ...cl(' '));
    const named = !!w.user && k.name;
    if (named) {
      mid.push(...cl(w.user!, w.op === 'gold' ? GOLD : GREY, undefined, w.op === 'gold'));
      if (w.host && k.host) mid.push(...cl('@' + w.host, GREY));
      mid.push(...cl(': ', GREY));
    }
    const left = room - 2 - widthOf(mid);
    if (left >= Math.min(cellWidth(cwd), 10) || !k.tag) {
      return [...cl('⌂ ', w.op === 'gold' && !named ? GOLD : GREY), ...mid, ...cl(PORT.tailPath(cwd, left), GREY)];
    }
  }
  /* node:coverage ignore next */
  throw new Error('unreachable');
}

/** The player's layers on the engine's render of `state` (with the git state and the PR's badge already drawn). */
export function playerOracle(lines: RefLines, state: unknown, m: OraclePlayer): RefLines {
  const copy = lines.map((l) => l.map((s) => ({ ...s })));
  const n = copy.length;
  // line 3: the name and the operator's mark
  const sit = PORT.fromState(state) as Record<string, unknown> & { cwd: string };
  if ((m.who.user || m.who.op) && sit.cwd) {
    const head = cellWidth((PORT.f2Line3({ ...sit, cwd: '' }) as RefSpan[]).map((s) => s.t).join('')) + 2;
    const cs = clustersOf(copy[n - 2]!), k = at(cs, head);
    if (k < 0 || !cs[k]!.g.startsWith('⌂')) throw new Error(`no ⌂ at col ${head}`);
    copy[n - 2] = runs([...cs.slice(0, k), ...folder(sit.cwd, 110 - head, m.who)]);
  }
  // the bed in slot 4
  if (m.bed) {
    const cs = clustersOf(copy[n - 1]!), k = at(cs, 32);
    const slot = k < 0 ? [] : cs.slice(k, k + 4);
    if (slot.length === 4 && slot.every((c) => c.g === ' ' && !c.fg && c.bg === WELL && !c.bold)) {
      cs.splice(k, 4, { g: TOP58, w: 1, fg: PILLOW, bg: OAK, bold: false }, { g: TOP58, w: 1, fg: BLANKET, bg: WELL, bold: false },
        { g: TOP58, w: 1, fg: BLANKET, bg: WELL, bold: false }, { g: TOP58, w: 1, fg: BLANKET, bg: OAK, bold: false });
      copy[n - 1] = runs(cs);
    }
  }
  // the phantoms in line 1's sky (toolong/build.cjs: sext, FAR, HIGH, LOW, SPOTS)
  if (m.phantoms > 0 && n >= 4) {
    const sext = (bits: number): string => String.fromCodePoint(0x1FB00 + bits - 1 - (bits > 21 ? 1 : 0) - (bits > 42 ? 1 : 0));
    const FAR = [sext(1 + 8), sext(2 + 4)], HIGH = [sext(1 + 8), sext(4 + 8), sext(2 + 4)], LOW = [sext(4 + 32), sext(16 + 32), sext(8 + 16)];
    const SPOTS: Record<number, Array<[number, string[]]>> = { 2: [[30, HIGH], [35, LOW]], 3: [[26, HIGH], [31, LOW], [36, HIGH]], 4: [[24, HIGH], [28, LOW], [32, HIGH], [36, LOW]] };
    const flock: Array<[number, Cl[]]> = m.phantoms === 1 ? [[33, FAR.map((g) => ({ g, w: 1, fg: PH_DIM, bg: undefined, bold: false }))]]
      : SPOTS[Math.min(4, m.phantoms)]!.map(([c, shape]) => [c, shape.map((g, i) => ({ g, w: 1, fg: i === 1 ? PH_EYES : PH_WING, bg: undefined, bold: false }))]);
    const cs = clustersOf(copy[n - 4]!);
    let drawn = false;
    const space = (c: Cl | undefined): boolean => !!c && c.g === ' ' && !c.fg && !c.bg && !c.bold;
    // a column is sky past the line's end, or where an unstyled space starts
    const sky = (c: number): boolean => c >= widthOf(cs) || space(cs[at(cs, c)]);
    for (const [col, ph] of flock) {
      let ok = true;
      for (let c = col - 1; c < col + ph.length; c++) ok = ok && sky(c);
      if (!ok) continue;
      while (widthOf(cs) < col + ph.length) cs.push({ g: ' ', w: 1, fg: undefined, bg: undefined, bold: false });
      cs.splice(at(cs, col), ph.length, ...ph);
      drawn = true;
    }
    if (drawn) copy[n - 4] = runs(cs);
  }
  return copy;
}
