// Every glyph is one code point with no VS16, so its width is predictable (SPEC §8, §0.6).

export interface Glyphs {
  ascii: boolean;
  sep: string;
  barOpen: string; barClose: string; barFull: string; barEmpty: string;
  /** Wraps the hearts and the food in ASCII mode, where there is no icon. */
  pipOpen: string; pipClose: string;
  /** Food: ten slots, like the game; a full one, an eaten one (same width, blank) and the gap between slots. */
  foodFull: string; foodGone: string; foodGap: string;
  /** The food icon alone, when a narrow line collapses the bar. */
  food: string;
  heart: string; heartSpent: string; heartIcon: string;
  /** The cache timer, fullest first: fresh, three quarters, half, a quarter, cold. Null in ASCII. */
  pie: readonly [string, string, string, string, string] | null;
  /** Prefixes carry their own trailing space, or are empty. */
  branch: string; reset: string; warm: string; cold: string; disk: string; card: string;
  ellipsis: string;
}

export const UNICODE: Glyphs = {
  ascii: false,
  sep: ' │ ',
  barOpen: '[', barClose: ']', barFull: '█', barEmpty: '░',
  pipOpen: '', pipClose: '',
  foodFull: '🍗', foodGone: '  ', foodGap: '',
  food: '🍗',
  heart: '♥', heartSpent: '♥', heartIcon: '♥',
  pie: ['●', '◕', '◑', '◔', '○'],
  branch: '⎇ ', reset: '↻ ', warm: '🔥 ', cold: '❄ ', disk: '💾 ', card: '💳 ',
  ellipsis: '…',
};

export const ASCII: Glyphs = {
  ascii: true,
  sep: ' | ',
  barOpen: '[', barClose: ']', barFull: '#', barEmpty: '-',
  pipOpen: '[', pipClose: ']',
  foodFull: '=', foodGone: ' ', foodGap: '',
  food: '',
  heart: '#', heartSpent: '-', heartIcon: '',
  pie: null,
  branch: '', reset: '', warm: '', cold: '', disk: '', card: '',
  ellipsis: '...',
};

/** Without colour the grey spent hearts would read as full ones, so they become dots. */
export function forDepth(g: Glyphs, colour: boolean): Glyphs {
  return colour || g.ascii ? g : { ...g, heartSpent: '·' };
}
