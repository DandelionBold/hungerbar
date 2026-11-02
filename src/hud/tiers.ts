// The pickaxe's tiers (SPEC §0.12, 1.1.0): Kamal's pick from design round 9c, 'pick-tiers-full'
// (test/reference/round9/pickaxe.json), a layer after the agents and before the frame. Minecraft's tools come in tiers;
// with hud.pickaxe tiers the pickaxe in hotbar slot 1 (cols 17-18) and the effort numeral after it (cols 19-20) take the
// tier of the model's family, in Minecraft's words: Fable netherite (#857579), Opus diamond (#55FFFF), Sonnet iron
// (#C6C6C6), Haiku gold (#FFAA00) and any other model stone (#AAAAAA). The numeral gives up the enchant pink #FF55FF
// (the glint behind it, the engine's, still says the effort), so the tier shows with colour icons too, where ⛏ is an
// emoji that ignores the ink. 1.0's pickaxe already took a colour by family (mix.ts TIER): Opus's diamond and the stone
// of an unknown model are its own, so for them only the numeral changes. plain: 1.0's bytes.
// The layer reads only what the engine drew: it recolours slot 1 only where the hotbar line (the last) has the engine's
// selected slot there, the mint ▐ at col 16, the pickaxe '⛏ ' in 1.0's ink for this model on the effort's glint, then
// the bold pink numeral and a space on the same glint, or two blank cells (no effort), and the mint ▌ at col 21.
import type { Config } from '../config.ts';
import type { Sit } from './input.ts';
import { ENCH, F2SEL_L, F2SEL_R, GREY, TIER } from './mix.ts';
import { family, get } from './py.ts';
import { merge, S, splitAt, W, type Span } from './spans.ts';

/** The tiers by family, in Minecraft's words: their name and their ink. */
export const TIERS: Readonly<Record<string, readonly [Tier, string]>> = {
  Fable: ['netherite', '#857579'], Opus: ['diamond', '#55FFFF'], Sonnet: ['iron', '#C6C6C6'], Haiku: ['gold', '#FFAA00'],
};
/** Any other model's tier. */
export const STONE: readonly [Tier, string] = ['stone', GREY];
export type Tier = 'netherite' | 'diamond' | 'iron' | 'gold' | 'stone';
/** Columns of the hotbar line, [from, to): the selected slot with its mint sides. */
export const SLOT1: readonly [number, number] = [16, 22];
/** The effort numerals the engine draws (mix.ts pickNumeral). */
const NUMERALS = 'ⅠⅡⅢⅣⅤ';

/** What the layer draws: the model's tier and its ink, or null for hud.pickaxe plain. */
export type TierMarks = { tier: Tier; ink: string } | null;

/** The tier of a model (the engine's own family reading, as its pickaxe's colour). */
export function tierOf(model: string): { tier: Tier; ink: string } {
  const [tier, ink] = get(TIERS, family(model), STONE);
  return { tier, ink };
}

/** What the layer draws this render, from hud.pickaxe and the engine's own reading of the model (`sit`, fromState's). */
export const tierMarks = (hud: Pick<Config['hud'], 'pickaxe'>, sit: Pick<Sit, 'model'>): TierMarks => (hud.pickaxe === 'tiers' ? tierOf(sit.model) : null);

/** The same span: text and style alike. */
const same = (a: Span | undefined, b: Span): boolean => !!a && JSON.stringify(a) === JSON.stringify(b);

/**
 * The HUD's lines (the engine's with the layers before this one: the hotbar line is the last) with slot 1 in the tier's
 * ink. `model` is the engine's reading of it (fromState's), which 1.0's ink is checked against. The input is not changed.
 */
export function tiersHud(lines: readonly (readonly Span[])[], m: TierMarks, model: string): Span[][] {
  const out = lines.map((l) => [...l]);
  const n = out.length, hot = out[n - 1];
  if (!hot || !m) return out;
  const [head, rest] = splitAt(hot, SLOT1[0]), [slot, tail] = splitAt(rest, SLOT1[1] - SLOT1[0]);
  if (W(head) !== SLOT1[0] || slot.length !== 4) return out;
  const [l, pick, num, r] = slot as [Span, Span, Span, Span];
  const g = pick.bg;
  const engine = g !== undefined && same(pick, S('⛏ ', get(TIER, family(model), GREY), g));
  const numeral = num.t.length === 2 && NUMERALS.includes(num.t[0]!) && same(num, S(num.t[0] + ' ', ENCH, g, true));
  if (!same(l, F2SEL_L) || !same(r, F2SEL_R) || !engine || !(numeral || same(num, S('  ', null, g)))) return out;
  out[n - 1] = merge([...head, l, S(pick.t, m.ink, g), numeral ? S(num.t, m.ink, g, true) : num, r, ...tail]);
  return out;
}
