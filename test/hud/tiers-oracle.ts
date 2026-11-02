// The pickaxe's tiers (SPEC §0.12, 1.1.0), written for the tests and independent of src/hud/tiers.ts, from the pick of
// design round 9c (test/reference/round9/pickaxe.json: build-9c.cjs tiers(true) and its TIER table, restated), cluster
// by cluster on the vendored engine's render of a state. Where src/ checks the drawn slot against 1.0's ink, this finds
// everything from the state, through the engine's own fromState(), family() and level(): the hotbar line is the last of
// the engine's lines, its selected slot at cols 16-21; cols 17 and 18 (the pickaxe and the cell after it) take the
// tier's ink, and cols 19 and 20 (the effort numeral and the cell after it) too when the engine draws a numeral (an
// effort it knows). Fable netherite #857579, Opus diamond #55FFFF, Sonnet iron #C6C6C6, Haiku gold #FFAA00, any
// other model stone #AAAAAA (the design's family(): the first of opus, fable, sonnet, haiku named in the model as a word).
import { PORT, type RefLines, type RefSpan } from './ref.ts';

const TIER: Readonly<Record<string, [string, string]>> = {
  Fable: ['netherite', '#857579'], Opus: ['diamond', '#55FFFF'], Sonnet: ['iron', '#C6C6C6'], Haiku: ['gold', '#FFAA00'],
};
const STONE: [string, string] = ['stone', '#AAAAAA'];

/** The tier of the state's model, its name and its ink, or null for hud.pickaxe plain. */
export function tierOracle(state: unknown, tiers: boolean): { tier: string; ink: string } | null {
  if (!tiers) return null;
  const fam = PORT.family((PORT.fromState(state) as { model: unknown }).model) as string | undefined;
  const [tier, ink] = fam !== undefined && Object.hasOwn(TIER, fam) ? TIER[fam]! : STONE;
  return { tier, ink };
}
/** The tier's ink for the state's model, or null for hud.pickaxe plain. */
export const tierInkOracle = (state: unknown, tiers: boolean): string | null => tierOracle(state, tiers)?.ink ?? null;

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
/** The index of the cluster that starts at `col`, or -1. */
function at(cs: readonly Cl[], col: number): number {
  let c = 0;
  for (let i = 0; i < cs.length; i++) {
    if (c === col) return i;
    c += cs[i]!.w;
  }
  return -1;
}

/** Slot 1 in the tier's ink on the engine's render of `state` (the layers before it drawn: none of them touches cols 16-21). */
export function tiersOracle(lines: RefLines, state: unknown, tiers: boolean): RefLines {
  const copy = lines.map((l) => l.map((s) => ({ ...s })));
  const ink = tierInkOracle(state, tiers);
  if (!ink || copy.length === 0) return copy;
  const n = copy.length - 1, cs = clustersOf(copy[n]!), k = at(cs, 16);
  if (k < 0 || cs[k]!.g !== '▐' || cs[k + 1]?.g !== '⛏' || cs[k + 5]?.g !== '▌') throw new Error('no selected slot at cols 16-21');
  const numeral = (PORT.level((PORT.fromState(state) as { effort: unknown }).effort) as number) > 0;
  for (const i of numeral ? [1, 2, 3, 4] : [1, 2]) cs[k + i] = { ...cs[k + i]!, fg: ink };
  copy[n] = runs(cs);
  return copy;
}
