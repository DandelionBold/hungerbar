// The plan's §9 output encoding, written for the tests and independent of src/ (as picker.test.ts encodes its oracle):
// the engine's spans as SGR. Each span gets its params in the order 1 (bold, when the span is bold and bold is on), fg
// (38;2;R;G;B, or 38;5;n at 256 colours), bg (48;2;R;G;B or 48;5;n); a styled span is ESC[…m + text + ESC[0m, a span with
// no params is its text; with nbsp on (the default) every space is U+00A0; lines are joined with \n, no trailing newline.
// The 256-colour index is the nearer of xterm's 6x6x6 cube and its 24-step grey ramp (the cube on a tie, the lower level
// on a tie inside the cube), re-derived here rather than imported from src/color.ts.

/** A span as the engine and the port make it. */
export interface SgrSpan { t: string; fg?: string | undefined; bg?: string | null | undefined; bold?: boolean | undefined }
export interface SgrOptions { depth: 'truecolor' | '256'; bold?: boolean; nbsp?: boolean }

const LEVELS = [0, 95, 135, 175, 215, 255];
function rgb(hex: string): [number, number, number] {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) throw new Error(`sgrOracle: not a #RRGGBB colour: ${JSON.stringify(hex)}`);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}
/** xterm-256 index of a 24-bit colour. */
export function xterm256(hex: string): number {
  const [r, g, b] = rgb(hex);
  const near = (v: number): number => LEVELS.reduce((best, x, i) => (Math.abs(x - v) < Math.abs(LEVELS[best]! - v) ? i : best), 0);
  const [cr, cg, cb] = [near(r), near(g), near(b)];
  const cube = (LEVELS[cr]! - r) ** 2 + (LEVELS[cg]! - g) ** 2 + (LEVELS[cb]! - b) ** 2;
  const gi = Math.max(0, Math.min(23, Math.round(((r + g + b) / 3 - 8) / 10)));
  const gv = 8 + 10 * gi;
  const grey = (gv - r) ** 2 + (gv - g) ** 2 + (gv - b) ** 2;
  return grey < cube ? 232 + gi : 16 + 36 * cr + 6 * cg + cb;
}
const memo = new Map<string, string>();
function colour(base: 38 | 48, hex: string, depth: SgrOptions['depth']): string {
  const key = `${base}${depth}${hex}`;
  let p = memo.get(key);
  if (p === undefined) memo.set(key, p = depth === 'truecolor' ? `${base};2;${rgb(hex).join(';')}` : `${base};5;${xterm256(hex)}`);
  return p;
}

/** The lines as the §9 writer must print them. */
export function sgrOracle(lines: readonly (readonly SgrSpan[])[], o: SgrOptions): string {
  const bold = o.bold ?? true, nbsp = o.nbsp ?? true;
  return lines.map((line) => line.map((s) => {
    const p: string[] = [];
    if (s.bold && bold) p.push('1');
    if (s.fg) p.push(colour(38, s.fg, o.depth));
    if (s.bg) p.push(colour(48, s.bg, o.depth));
    const t = nbsp ? s.t.replaceAll(' ', ' ') : s.t;
    return p.length ? `\x1b[${p.join(';')}m${t}\x1b[0m` : t;
  }).join('')).join('\n');
}
