// `hungerbar glyphs`: a width ruler, to check by eye that the terminal font draws each glyph as wide as Hungerbar counts it.
// `--hud`: the Minecraft HUD's glyphs, with the widths the HUD's own measure gives them (Windows Terminal 1.25's tables).
import { cellWidth } from '../hud/wt.ts';
import { cpWidth } from '../width.ts';
import { parseArgs, say } from './args.ts';

const GLYPHS: Array<[string, string]> = [
  ['♥', 'heart (5-hour session)'],
  ['🍗', 'food (week); eaten ones vanish'],
  ['█', 'context used'],
  ['░', 'context free'],
  ['↻', 'resets in'],
  ['●', 'cache timer, fresh'],
  ['◕', 'cache timer, three quarters left'],
  ['◑', 'cache timer, half left'],
  ['◔', 'cache timer, a quarter left'],
  ['○', 'cache timer, nearly cold or cold'],
  ['🔥', 'cache warm'],
  ['❄', 'cache cold'],
  ['💾', 'cache hit'],
  ['💳', 'extra credits'],
  ['⎇', 'git branch'],
  ['│', 'separator'],
  ['·', 'spent heart without colour'],
];

/**
 * Every glyph the HUD draws outside your own text: the glyphs probed for it in design rounds 4-7, the hotbar's frame
 * (0.5.1), whose edges are two of them and whose blank cells are U+2800, as is the lead a centred HUD (0.6.0) starts with,
 * and the git state's arrows and the pull request's marks (0.7.0, probed in design round 8: Cascadia Mono, 1 cell, in the
 * HUD's colour; ✗ U+2717 was left out because Windows Terminal takes it from Segoe UI Emoji, so × marks a failure).
 */
export const HUD_GLYPHS: Array<[string, string]> = [
  ['⛏', 'the pickaxe: the model in your hand'],
  ['Ⅰ', 'effort low'],
  ['Ⅱ', 'effort medium'],
  ['Ⅲ', 'effort high'],
  ['Ⅳ', 'effort xhigh'],
  ['Ⅴ', 'effort max'],
  ['📖', 'the book: prompts sent'],
  ['▀', 'grass block: lines added'],
  ['▒', 'cobblestone: lines removed'],
  ['▁', 'terrain: bare ground, or a slab'],
  ['▂', 'context bar; terrain; top edge of the offhand'],
  ['▃', 'terrain'],
  ['▄', 'gold ingots: the session cost; terrain'],
  ['▅', 'terrain'],
  ['▆', 'terrain'],
  ['▇', 'terrain'],
  ['█', 'terrain at its highest; Fable wear bar'],
  ['▏', 'Fable wear bar, 1/8'],
  ['▎', 'Fable wear bar, 2/8'],
  ['▍', 'Fable wear bar, 3/8'],
  ['▌', 'hotbar selection, right edge; Fable wear bar, 4/8'],
  ['▋', 'Fable wear bar, 5/8'],
  ['▊', 'Fable wear bar, 6/8'],
  ['▉', 'Fable wear bar, 7/8'],
  ['▐', 'hotbar selection, left edge'],
  ['🮂', 'bottom edge of the hotbar and the offhand; the boss bar (Fable in use)'],
  ['\u2800', 'blank cells of the bottom edge row, and the lead of a centred HUD (a blank that Claude Code does not trim)'],
  ['⬢', 'Fable left'],
  ['⬡', 'Fable used'],
  ['◈', 'the beacon (Fable week)'],
  ['┃', 'beacon beam, more than half left'],
  ['╻', 'beacon beam, half or less'],
  ['☼', 'day: the 5-hour window'],
  ['☾', 'night: its last fifth'],
  ['☠', '5-hour limit used up'],
  ['◦', 'cache bubble, spent'],
  ['○', 'cache bubble, draining'],
  ['◉', 'cache bubble, full'],
  ['⌂', 'working folder'],
  ['◆', 'emeralds: extra credits left'],
  ['♥', 'heart (5-hour session)'],
  ['🍗', 'food (week)'],
  ['↻', 'resets in'],
  ['⎇', 'git branch; its colour is the working tree (0.7.0)'],
  ['↑', 'git: commits ahead of the upstream, to push'],
  ['↓', 'git: commits behind the upstream, to pull'],
  ['●', 'pull request: checks running (hud.pr on)'],
  ['✓', 'pull request: checks passed; a second one, approved'],
  ['×', 'pull request: a check failed'],
  ['±', 'pull request: changes requested'],
  ['‼', 'pull request: a conflict with its base branch'],
  ['◌', 'pull request: a draft'],
  ['\u{1FB84}', 'the bed in slot 4: away for 5 minutes (hud.bed)'],
  ['\u{1FB08}', 'a phantom: left wing (hud.phantoms)'],
  ['\u{1FB0B}', 'a phantom: body, flying high'],
  ['\u{1FB05}', 'a phantom: right wing'],
  ['\u{1FB22}', 'a phantom swooping: left wing'],
  ['\u{1FB2D}', 'a phantom swooping: body'],
  ['\u{1FB16}', 'a phantom swooping: right wing'],
  ['·', 'separator'],
  ['…', 'shortened text'],
];

export function glyphs(argv: string[] = []): number {
  const hud = parseArgs(argv, []).flags.has('hud');
  say(`Each row: the glyph between bars, then a ruler of the width ${hud ? 'the HUD' : 'Hungerbar'} assumes.`);
  say('The right bars of the two columns should line up.\n');
  for (const [g, what] of hud ? HUD_GLYPHS : GLYPHS) {
    const cp = g.codePointAt(0) ?? 0;
    const w = hud ? cellWidth(g) : cpWidth(cp);
    say(`|${g}|  |${'.'.repeat(w)}|  ${w}  U+${cp.toString(16).toUpperCase().padStart(4, '0')}  ${what}`);
  }
  return 0;
}
