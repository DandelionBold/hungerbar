// Seeded generators for the HUD oracle tests (plan §4, §10.2): the mulberry32 PRNG, and the text and number domains of
// the design rounds' adversarial sweep (hud4sweep/sweep.mjs, not published), ported as data. The domains are
// the sweep's own values; the generators compose them with hostile atoms (escape sequences, controls, marks, joiners,
// blank fillers, Prepend, regional indicators, Hangul jamo, lone surrogates), so every run with the same seed sees the
// same inputs. On top of them: the sweep's state domains and fields (one factor at a time, random combinations), its
// history and scoped domains, seeded state, hist and scoped generators, and a greedy state shrinker.

export type Rng = () => number;

/** mulberry32: a small, fast, seeded PRNG with a uniform output in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** An integer in [lo, hi]. */
export const int = (r: Rng, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));
export const pick = <T>(r: Rng, a: readonly T[]): T => a[Math.floor(r() * a.length)]!;
export const chance = (r: Rng, p: number): boolean => r() < p;

// ---------------- the sweep's spelled-out characters ----------------
const BS = String.fromCharCode(92);                                       // a backslash
const ESC = String.fromCharCode(27), BEL = String.fromCharCode(7);
const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
const FAM = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';                    // one WT cluster of 5 code points
const LINK = (url: string, t: string): string => `${ESC}]8;;${url}${ESC}${BS}${t}${ESC}]8;;${ESC}${BS}`;   // an OSC 8 hyperlink
const L = 32767;

// ---------------- text domains (sweep.mjs BRANCH, CWD, MODEL, EFFORT, VER, SC_NAMES; the key deletes are undefined) -----
export const BRANCH: readonly unknown[] = [null, 'main', 'feature/very-long-branch-name', 'fix/ünïcödé', 'feature/日本語', '日本語ブランチ', 'emoji-🚀', 'ветка',
  'cafe\u0301', 'fam-👨‍👩‍👧', 'flag-🇺🇸', 'love-❤️', 'feat/中文分支名称', 'ok\u2764\uFE0F', '\u2764\uFE0F',
  'dependabot/npm_and_yarn/typescript-eslint/parser-8.12.2', 'dependabot/npm_and_yarn/typescript-8.6.3', 'feature/hotbar', '\u0301lead',
  'trail\u0600', 'x\u200D❤', 'feat/\u0301seg', 'a\u200D', '🇺🇸🇬🇧🇫🇷', '한국어브랜치', 'feature/日本語日本語日本語日本語日本語日本語', 'tab\there', '',
  ' ', '\u200D', '//////////', '/'.repeat(60), 'x\u0600/y', { name: 'main' }, 42, false, undefined,
  LINK('https://x.y', 'main'), 'main' + ESC + '[K', 'fix' + LS + 'x', 'fix' + PS + 'x', 'feature/ x', 'feat\tx/y',
  'dependabot/npm_and_yarn/' + 'packages/'.repeat(28) + 'typescript-8.6.3', 'x'.repeat(255) + FAM, '/x/' + 'y'.repeat(300), 'y'.repeat(300) + '/' + '/'.repeat(5),
  'feature/improve-status-line-rendering', 'users/steve/JIRA-1234-fix-the-thing', 'renovate/typescript-5.x', 'feat/status-line-v2',
  'fix/issue-512-nil-cost', 'aaaaaaaaaaaaaaaaaaaa', 'renovate/typescript-eslint-monorepo', 'feature/\u65E5\u672C\u8A9E\u306E\u30D6\u30E9\u30F3\u30C1\u540D\u524D\u3067\u3059'];
export const CWD: readonly unknown[] = ['C:/', 'D:/webapp', 'C:/Users/Steve', 'D:/a/very/long/path/to/some/project', 'C:/Users/Steve/Документы',
  'D:/项目/代码库', 'D:/项目/我的项目文件', 'C:/Users/Steve/🎮games', 'D:/proj/', 'C:/Users/Steve/Мой проект', 'D:/x/\u2764\uFE0Fweb',
  'C:/Users/Steve/source/repos/company/very-long-project-name', 'D:' + BS + 'code' + BS + 'tools' + BS + 'hungerbar', '', '/', BS, ' ', null, undefined,
  ['C:', 'Users', 'Steve', 'source', 'repos', 'company', 'very-long-project-name'].join(BS), 'D:/a/\u0301x',
  'D:/projects/a-really-really-long-folder-name-that-goes-on-and-on-and-on', 'D:/a/' + 'b'.repeat(40), 'D:/x/' + 'é'.repeat(30),
  'D:/x/' + 'e\u0301'.repeat(30), 'C:/aaaaaaaaaa\u0600/' + 'b'.repeat(39), 'C:/Users/Steve/source/repos/hungerbar-lab',
  'C:/Users/Steve/Documents/Claude Projects/scratch', '/'.repeat(300) + 'x', 'C:/' + 'ab/'.repeat(1000) + 'proj', '\u3164/x', { path: 'D:/x' }, 7,
  'D:/webapp' + ESC + '[K', ESC + ']0;title' + BEL + 'D:/x', 'D:/a\tb/c', 'D:/x' + LS + 'y', 'D:/' + FAM.repeat(110), 'D:/' + 'projectname'.repeat(50),
  '/' + 'p'.repeat(600), 'D:/' + 'p'.repeat(600) + '/'.repeat(10), 'D:/x/' + 'p'.repeat(509) + FAM, '/ /', '/home/steve/ /', 'D:/x/\u3164',
  'D:/projects/hungerbar-status-line', ['C:', 'Users', 'Steve', 'OneDrive - Contoso Ltd', 'Documents', 'Projects', 'Very Long Project Name'].join(BS),
  'bbbbbbbbbbbbbbbbbbbb', 'D:/code/tools/hungerbar', 'D:/项目/非常长的项目文件夹名称'];
export const MODEL: readonly unknown[] = ['Opus 5.5', 'Sonnet 4.5', 'Haiku 4.5', 'Fable 1', 'Claude', 'Opus 4.1 (1M context)', 'Sonnet 4.5 (1M context)', 'Claude Opus 5.5',
  'Claude Opus 5.5 (1M context)', '', '  ', null, undefined, ' Opus 5.5', '\u0301Opus', 'Claude Opus 5.5 (1M context) with an extremely long display name',
  '(1M context)', 'Opus 4.1 (beta)', 'Opus\u0600 (beta)', { id: 'claude-opus-5-5', display_name: 'Opus 5.5' }, { id: 'claude-sonnet-4-5' },
  { display_name: '', id: 'claude-haiku-4-5' }, { display_name: {} }, [], '\u3164', '\u2800Opus', '\u0600\u00ad', 'Opus\u3164', '\u115F\u1160Opus',
  '\u200b\ufe0fOpus', 'a' + ' '.repeat(300) + 'b', 'Opus ' + '(x'.repeat(200), 'Opus (a (b))', 'X (a(b context)', 'Opus 5.5 (1m CONTEXT)', 5.5,
  ESC + '[35mOpus 5.5' + ESC + '[0m', LINK('https://claude.ai', 'Sonnet 4.5'), 'Opus\t5.5', 'Opus\n5.5 (1M\ncontext)', 'Opus' + LS + '5.5', 'Haiku\r\n4.5',
  'Claude Opus 4.5', { id: 'claude-opus-4-5' }, 'opus 5.5', 'claude-3-5-sonnet-20241022', 'HAIKU 4.5', 'Opusculum 1', 'Magnum fable', 'Opus' + '\u0301'.repeat(300),
  'x'.repeat(250) + FAM + 'y'.repeat(10)];
export const EFFORT: readonly unknown[] = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'extreme-effort-level', null, undefined, '', ' ', 'HIGH', ' high', 'Max', {}, 3, '\u3164',
  'None', 'null', 'undefined', 'NaN', 'nan', ' NONE ', 'high\t', ESC + '[1mhigh' + ESC + '[0m', 'nonesuch'];
export const VER: readonly unknown[] = ['2.1.306', '2.0.0', '2.1.1000', '', null, undefined, '2.1.10000-beta.1', ' 2.1.306', 'v'.repeat(30), 2.1, {}, '\u2800',
  '2.1.306' + ESC + '[0m', '2.1.306\n', '2.1\t306'];
export const SC_NAMES: readonly unknown[] = ['Fable', 'fable', 'FABLE', 'Fable 5.1', 'claude-fable-5-1', 'Fabled', 'Opus', 'Sonnet', 'Haiku', 'Claude Fable', 'GPT', 'x', 'A'.repeat(80),
  ' Fable ', '\tFable\n', 5.1, 42, 0, '🍗🍗🍗', 'Ünïcödé-名前', ESC + '[31mFable' + ESC + '[0m', 'Fa\nble', 'é', 'e\u0301', '\u0301Fable', 'Fable\u0600',
  'ZWJ' + FAM, 'מילה', 'ＦＡＢＬＥ', '\u200bFable', 'Fable\u00ad', '\u{1F1FA}\u{1F1F8}\u{1F1FA}', LINK('https://claude.ai', 'Fable'), 'ᄀᄀᄀ', '日本語'.repeat(40),
  'x'.repeat(5000), 'Fable' + LS + 'x', '…', 'Fable…', '\u3164Fable', 'Fable 5.1 (1M context)', 'Fable❤️', 'Sonnet 4.5', 'Opus 5.5', 'Haiku (beta)',
  'my-model', 'Fable/Opus', 'Fable' + BS + 'x', 'a'.repeat(63) + FAM, 'b'.repeat(64) + 'é', ' '.repeat(100) + 'Fable'];
/** sweep.mjs HUGE: the 32,767-character inputs (Windows' longest path), as text values. */
export const HUGE: readonly string[] = ['C:/' + 'ab/'.repeat(1000) + 'proj', 'a/'.repeat(10000) + 'x', '/'.repeat(3000) + 'x', '/'.repeat(L), BS.repeat(L - 1) + 'x',
  'D:/' + 'e\u0301'.repeat(16000), '\u0600/'.repeat(16000), 'a' + ' '.repeat(L) + 'b', 'Opus ' + '(x'.repeat(10000), '\u0301'.repeat(L) + 'Opus',
  'x' + '('.repeat(L) + ')', 'Opus' + ' '.repeat(L) + '(1M context)' + ' '.repeat(L), '\u3164'.repeat(L) + 'Opus' + '\u3164'.repeat(L),
  '\u200b\ufe0f'.repeat(16000) + 'Opus', 'a/'.repeat(16000), ' '.repeat(L) + 'x' + ' '.repeat(L), '9.'.repeat(L), '\u200b\u2800'.repeat(16000),
  '\u3164/'.repeat(16000), '\u2800'.repeat(L), 'D:/e' + '\u0301'.repeat(L), LINK('https://x.y', 'a/').repeat(3000) + 'main', (ESC + '[1m').repeat(16000) + 'Opus',
  'D:/a\n'.repeat(16000) + 'b', 'D:/' + 'p'.repeat(L), FAM.repeat(6553), ESC + ']8;;' + 'x'.repeat(L)];
/** Every string of the text domains. */
export const TEXTS: readonly string[] = [...BRANCH, ...CWD, ...MODEL, ...EFFORT, ...VER, ...SC_NAMES].filter((v): v is string => typeof v === 'string');
/** Every value of the text domains that is not a string (objects, numbers, booleans, null, undefined). */
export const NON_TEXTS: readonly unknown[] = [...BRANCH, ...CWD, ...MODEL, ...EFFORT, ...VER, ...SC_NAMES].filter((v) => typeof v !== 'string');

// ---------------- hostile atoms the generator composes ----------------
export const ATOMS: readonly string[] = [
  // plain text, separators and the words the engine looks for
  'a', 'x', 'Z', '0', '9', '-', '_', '.', ' ', '  ', '/', BS, '//', '(', ')', '(1M context)', ' context', '1M', '…', '%', 'Opus', 'opus', 'FABLE',
  'Sonnet', 'haiku', 'Claude', 'main', 'feature/', 'D:/', 'C:' + BS, 'low', 'HIGH', 'None', 'nil', 'inf',
  // escape sequences: CSI, OSC 8, OSC with BEL, DCS, a lone ESC, an ESC pair, C1 CSI/OSC/ST, unterminated ones
  ESC + '[31m', ESC + '[0m', ESC + '[K', LINK('https://x.y', 'link'), ESC + ']0;title' + BEL, ESC + 'P1$r' + ESC + BS, ESC, ESC + 'M', ESC + '(B',
  '\x9b1m', '\x9d8;;u\x9c', '\x9c', ESC + ']8;;', ESC + '[', '\x90q',
  // controls and line breaks
  '\t', '\n', '\r', '\r\n', '\v', '\f', '\x85', LS, PS, '\x00', '\x07', '\x7f', '\x9f', '\x1c',
  // marks, joiners, selectors, blank fillers, default ignorables
  '\u0301', '\u0300\u0301', '\u200D', '\uFE0F', '\uFE0E', '\u200B', '\u00AD', '\u034F', '\u061C', '\u115F', '\u1160', '\u3164', '\uFFA0', '\u2800',
  '\u180B', '\u202E', '\u2060', '\u2066', '\uFEFF', '\uFFF0', '\u{1BCA0}', '\u{1D173}', '\u{E0061}', '\u{E007F}', '\u{E0100}',
  // Python whitespace that JS \s does not match, and some it does
  '\x1d', '\x1f', '\u00A0', '\u1680', '\u2000', '\u2007', '\u202F', '\u205F', '\u3000',
  // Prepend, SpacingMark, InCB linker and consonants (Indic conjuncts)
  '\u0600', '\u0D4E', '\u0903', '\u094D', '\u0915', '\u0937', '\u0915\u094D\u0937',
  // regional indicators, emoji, ZWJ sequences, keycaps, skin tones, tags
  '\u{1F1FA}', '\u{1F1F8}', '\u{1F1FA}\u{1F1F8}', '🍗', '🔥', '📖', '🏠', '🔨', '❤', '❤\uFE0F', FAM, '\u{1F44D}\u{1F3FD}', '1\uFE0F\u20E3',
  '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}', '\u{1FB02}', '⛏', 'Ⅲ', '⬢', '▌', '☼',
  // wide text, Hangul jamo L/V/T and syllables LV/LVT, full width
  '漢', '日本語', '한', '\u1100', '\u1161', '\u11A8', '\uAC00', '\uAC01', 'ａ', 'ｶ',
  // lone surrogates (WT decodes them as U+FFFD), and a reversed pair
  '\uD800', '\uDC00', '\uDFFF\uD83D', '\uFFFD',
];

/** A hostile string: 0-8 atoms or domain strings, sometimes an atom repeated into a long run (at most 300 times). */
export function text(r: Rng): string {
  if (chance(r, 0.08)) return pick(r, TEXTS);
  let s = '';
  for (let n = int(r, 0, 8); n > 0; n--) {
    if (chance(r, 0.15)) s += pick(r, TEXTS);
    else { const a = pick(r, ATOMS); s += chance(r, 0.05) ? a.repeat(int(r, 2, 300)) : a; }
  }
  return s;
}

// ---------------- number domains (sweep.mjs USED, RESET, WINDOW, PIE, HIT, COMP, TURNS, COST, ADD, SC_USED, SC_LEFT, ttl) --
export const NUMBERS: readonly number[] = [
  -5, 0, 0.4, 9.9, 10, 50, 89.9, 90, 99.9, 100, 105, 59, 60, 3599, 18000, 604800, 1e7, 360000, 36000, 3.6e7, 3.6e8, 1e12, 3600, 600, 17340,
  1, 37, 38, 112, 113, 187, 188, 262, 263, 299, 300, 449, 450, 451, 1349, 1350, 1351, 2249, 2250, 2251, 3149, 3150, 3151, 91, 99.75,
  2, 9, 42, 99, 101, 200, 201, 999, 1000, 1500, 9900, 9901, 100000, 74, 75, 199, 301, 123456, 12, 13,
  0.001, 0.004, 0.005, 0.5, 0.999, 3.12, 18.4, 49.996, 99.99, 99.995, 99.999, 100.5, 123.45, 1234.5, 99999.5, -2, 7, 1208, 99999, 1234567,
  9.99, 10.01, 34.6, 35, 49.5, 50.5, 62, 89.5, 90.3, 91.3, 95, 99.5, 100.0001, 250, 1e21, 1e300, Number.MAX_VALUE, -0, -1e300, 5e-324, 1e-323,
  30, 61, 86399, 86400, 604740, 604799, 604801, -1e12, NaN, Infinity, -Infinity, 1e-9, 59.9, 1.5, 262.5, 100.25, -20, 500, 1e15, 2e15,
  // round(), repr() and fixed-point edges
  0.5, -0.5, 2.5, -2.5, 3.5, 0.125, 0.375, 1.005, 2.675, 0.1 + 0.2, 1e-7, 1e-5, 1e-4, 1e16, 1e17, 1e20, 1e22, 2 ** 53, 2 ** 53 + 2, -(2 ** 53),
  1.7976931348623157e308, 4.35, 1e21 - 65536, 123456789012345680000, 0.05, 0.15, 0.25, 0.35, -0.05, 9.995, 99.5, 999.5, 1e6, 1e9 + 0.5,
];
/** A number: a domain value, a tie, a power of ten, a random double over every exponent, or a small integer. */
export function number(r: Rng): number {
  switch (int(r, 0, 5)) {
    case 0: return pick(r, NUMBERS);
    case 1: return (int(r, -2000, 2000) + 0.5) / pick(r, [1, 10, 100, 1000]);              // ties at several scales
    case 2: return (chance(r, 0.5) ? -1 : 1) * 10 ** int(r, -12, 25);
    case 3: return (chance(r, 0.5) ? -1 : 1) * r() * 10 ** int(r, -10, 24);
    case 4: return int(r, -100000, 100000);
    default: return int(r, -64, 64) / 8;
  }
}
/** Strings the number readers must read (or refuse) like the oracle: sweep.mjs's numeric strings and Python's bools. */
export const NUMERIC_STRINGS: readonly string[] = ['93', ' 50 ', '98%', '0', 'abc', '', '17340', 'x', '18000', '98', '3', ' 12 ', '42', '7.9',
  '3.12', ' 18.4 ', '1e2', '12', ' 1208 ', '35', ' 35% ', '0x10', ' 62.5 ', '3600', ' 60 ', '86400%', '%', ' % ', '-0', '+5', '.5', '5.',
  'Infinity', '-Infinity', 'NaN', '1e400', '0b11', '0o7', '1_000', '\u00a05\u00a0', '\u30005', '\t7\n', '5%%', '%5', '50 %',
  'true', 'false', 'True', 'FALSE', ' TRUE ', ' true', 'False', ' FALSE ', 'yes', 'none', '1', 'null', 'undefined'];
/** Any value the engine may be handed: numbers, numeric strings, hostile text, booleans, null, undefined, objects. */
export function value(r: Rng): unknown {
  switch (int(r, 0, 5)) {
    case 0: return number(r);
    case 1: return pick(r, NUMERIC_STRINGS);
    case 2: return text(r);
    case 3: return pick(r, NON_TEXTS);
    case 4: return pick<unknown>(r, [true, false, null, undefined, 0, 1, -0, NaN, {}, [], [5], ['5'], { valueOf: 7 }, new Date(0)]);
    default: return String(number(r));
  }
}

// ---------------- shrinking ----------------
/** The shortest string (by code points, greedily) for which `bad` still holds: drops halves, then quarters, ... */
export function shrinkText(s: string, bad: (t: string) => boolean): string {
  let cps = Array.from(s);
  for (let size = cps.length >> 1; size >= 1; size = size >> 1) {
    for (let at = 0; at + size <= cps.length;) {
      const t = [...cps.slice(0, at), ...cps.slice(at + size)];
      if (bad(t.join(''))) cps = t;
      else at += size;
    }
  }
  return cps.join('');
}

// ---------------- state domains (sweep.mjs USED, RESET, WINDOW, PIE, HIT, EXTRA, COMP, TURNS, COST, ADD, CTX, CTXRAW, H5,
// WEEK, cacheVariants and FIELDS) ----------------
/** A field value that removes the key (sweep.mjs DEL). */
export const DEL = Symbol('delete');
export type State = Record<string, unknown>;
export const USED: readonly unknown[] = [-5, 0, 0.4, 9.9, 10, 50, 89.9, 90, 99.9, 100, 105, '93', ' 50 ', '98%', '0', 'abc', '', null, DEL, true, {}];
export const RESET: readonly unknown[] = [0, 59, 60, 3599, 18000, 604800, 1e7, '17340', 'x', null, DEL];
export const WINDOW: readonly unknown[] = [[360000, 360000], [36000, 36000], [3.6e7, 3.6e7], [3.6e8, 3.6e8], [1e12, 1e12], [0, 18000], [3600, 18000],
  [3600, 600], [null, 17340], ['18000', '17340'], [DEL, 17340], [-5, 100]];
const PIE: Readonly<Record<300 | 3600, readonly number[]>> = {
  300: [0, 1, 37, 38, 112, 113, 187, 188, 262, 263, 299, 300], 3600: [0, 1, 449, 450, 451, 1349, 1350, 1351, 2249, 2250, 2251, 3149, 3150, 3151, 3599, 3600],
};
export const HIT: readonly unknown[] = [0, 50, 91, 99.75, 100, '98', '98%', 'abc'];
export const EXTRA: readonly unknown[] = [null, { used: 0, limit: 0 }, { used: 0, limit: 50 }, { used: 4.2, limit: 50 }, { used: 49.99, limit: 50 },
  { used: 50, limit: 50 }, { used: 75, limit: 50 }, { used: 0.004, limit: 50 }, { used: 0, limit: 100 }, { used: 4.2, limit: 1000 }, { used: 1, limit: 5 },
  { used: 0, limit: 123456.78 }, { used: 0.4, limit: 1 }, { used: 0, limit: 1e7 }, { used: -3, limit: 50 }, { used: 49.996, limit: 50 },
  { used: 0.006, limit: 50 }, { used: '4.2', limit: '50' }, { used: 0, limit: '50%' }, { used: 'x', limit: 50 }, 'x', DEL];
export const COMP: readonly unknown[] = [...Array(13).keys(), 99, 100, 1000, 123456, '3', ' 12 ', 'x'];
export const TURNS: readonly unknown[] = [0, 1, 2, 9, 10, 42, 99, 100, 101, 200, 201, 999, 1000, 1500, 9900, 9901, 100000, 1e7, '42', '7.9', 'x',
  74, 75, 199, 299, 300, 301];
export const COST: readonly unknown[] = [0, 0.001, 0.004, 0.005, 0.5, 0.999, 1, 3.12, 18.4, 49.996, 99.99, 99.995, 99.999, 100, 100.5, 123.45, 1234.5,
  99999.5, 123456, 1e7, 1e12, -2, '3.12', ' 18.4 ', '1e2', 'abc', ''];
export const ADD: readonly unknown[] = [0, 1, 7, 1208, 99999, 100000, 1234567, 1e12, '12', ' 1208 '];
export const CTX: readonly unknown[] = [...[...Array(101).keys()].flatMap((p) => [[p, 200000], [p, 1000000]]), [37, 1e7], [100, 1e9], ['71', '1000000'],
  ['8%', 1000000], ['x', 1000000]];
/** [ctxTok, ctxMax, ctxPct] as given: a full 1M context, a window that is missing, 0 or under 1k */
export const CTXRAW: readonly unknown[] = [[999500, 1000000, 100], [1000000, 1000000, 100], [1e9, 1e9, 100], [81000, 0, 8], [81000, 500, 8],
  [81000, 999, 8], [0, 0, 0], [81000, '', 8], [81000, DEL, 8], [81000, 1000, 8], [9999000, 10000000, 100]];
export const H5: readonly unknown[] = [DEL, null, {}, { used: 2 }, { used: 2, left: null }, { left: 100 }, { used: '2', left: '17340', window: '18000' }, 'x', 5];
export const WEEK: readonly unknown[] = [DEL, null, {}, { used: 82 }, { left: 1000 }, { used: '82', left: '345540' }, 'x'];
function cacheVariants(): unknown[] {
  const out: unknown[] = [{ hit: null, warm: null, left: 0, ttl: 300 }];
  for (const ttl of [300, 3600] as const) for (const left of PIE[ttl]) for (const warm of [true, false]) out.push({ hit: 98, warm, left, ttl });
  for (const hit of HIT) out.push({ hit, warm: true, left: 100, ttl: 300 }, { hit, warm: false, left: 0, ttl: 300 });
  out.push({ hit: 98, warm: true, left: 262.5, ttl: 300 }, { hit: 98, warm: true, left: 100.25, ttl: 300 });
  out.push({ hit: null, warm: true, left: 100, ttl: 300 }, { hit: null, warm: false, left: 0, ttl: 300 }, { hit: 50, warm: null, left: 0, ttl: 300 });
  out.push({ hit: 98, warm: true, left: 100, ttl: 0 }, { hit: 98, warm: true, left: 500, ttl: 300 }, { hit: 98, warm: true, left: -20, ttl: 300 });
  for (const ttl of [5e-324, 1e-323, 0.5, 1, 1.5, '300', 'x']) out.push({ hit: 96, warm: true, left: 175, ttl });
  for (const warm of ['false', 'true', 1, 0, 'yes', 'FALSE', 'True', 'TRUE', ' true', 'False', ' FALSE ', 'none']) out.push({ hit: 98, warm, left: 252, ttl: 300 });
  out.push({ hit: '98', warm: 'true', left: '252', ttl: '300' }, { hit: null, warm: 'false', left: 0, ttl: 300 }, null, DEL, 'x', {});
  // not in the sweep: a fractional TTL whose bubbles come out a hair above a whole number (17 / (170/7 / 10) is
  // 7.000000000000001), which the engine's 1e-9 guard counts as whole
  out.push({ hit: 98, warm: true, left: 17, ttl: 170 / 7 }, { hit: 98, warm: true, left: 27, ttl: 270 / 7 });
  return out;
}
export const CACHE: readonly unknown[] = cacheVariants();

/** A copy of an object value (no JSON round trip: NaN, Infinity and -0 stay themselves), so no domain value is shared. */
const sclone = (v: unknown): unknown => (v !== null && typeof v === 'object' ? structuredClone(v) : v);
function put(o: State, k: string, v: unknown): void {
  if (v === DEL) delete o[k];
  else o[k] = sclone(v);
}
/** Sets 'cache.warm' etc., creating objects on the way (an array or a non-object on the way becomes {}). */
export function setPath(s: State, path: string, v: unknown): void {
  const ks = path.split('.');
  let o = s;
  while (ks.length > 1) {
    const k = ks.shift()!;
    if (o[k] === null || typeof o[k] !== 'object' || Array.isArray(o[k])) o[k] = {};
    o = o[k] as State;
  }
  put(o, ks[0]!, v);
}
type Setter = (s: State, v: unknown) => void;
const triple = (v: unknown): [unknown, unknown, unknown] => v as [unknown, unknown, unknown];
/** sweep.mjs FIELDS: name -> [values, apply(state, value)]. */
export const FIELDS: Readonly<Record<string, readonly [readonly unknown[], Setter]>> = {
  'h5.used': [USED, (s, v) => setPath(s, 'h5.used', v)],
  'week.used': [USED, (s, v) => setPath(s, 'week.used', v)],
  'h5.left': [RESET, (s, v) => setPath(s, 'h5.left', v)],
  'week.left': [RESET, (s, v) => setPath(s, 'week.left', v)],
  'h5.window+left': [WINDOW, (s, v) => { const [w, l] = triple(v); setPath(s, 'h5.window', w); setPath(s, 'h5.left', l); }],
  h5: [H5, (s, v) => put(s, 'h5', v)],
  week: [WEEK, (s, v) => put(s, 'week', v)],
  ctx: [CTX, (s, v) => {
    const [p, m] = triple(v);
    s.ctxPct = p; s.ctxMax = m;
    s.ctxTok = typeof p === 'number' ? Math.round(p * Number(m) / 100) : String(Math.round(parseFloat(String(p)) * 10000) || 'x');
  }],
  ctxRaw: [CTXRAW, (s, v) => { const [t, m, p] = triple(v); s.ctxTok = t; put(s, 'ctxMax', m); s.ctxPct = p; }],
  cache: [CACHE, (s, v) => put(s, 'cache', v)],
  extra: [EXTRA, (s, v) => put(s, 'extra', v)],
  compactions: [COMP, (s, v) => { s.compactions = v; }],
  turns: [TURNS, (s, v) => { s.turns = v; }],
  cost: [COST, (s, v) => { s.cost = v; }],
  branch: [BRANCH, (s, v) => put(s, 'branch', v)],
  add: [ADD, (s, v) => { s.add = v; }],
  del: [ADD, (s, v) => { s.del = v; }],
  cwd: [CWD, (s, v) => put(s, 'cwd', v)],
  model: [MODEL, (s, v) => put(s, 'model', v)],
  effort: [EFFORT, (s, v) => put(s, 'effort', v)],
  ver: [VER, (s, v) => put(s, 'ver', v)],
  // not in the sweep: ties, where Python's round() (to even) and Math.round differ
  ctxPct: [[0.5, 1.5, 2.5, 4.5, 49.5, 50.5, 79.5, 80.5, 99.5, 100.5, -0.5, '2.5', ' 49.5 ', '50.5%'], (s, v) => { s.ctxPct = v; }],
  'cache.hit': [[0.5, 2.5, 49.5, 50.5, 97.5, 98.5, 99.5, 100.5, -0.5, '98.5', ' 2.5% '], (s, v) => setPath(s, 'cache.hit', v)],
};
/** Every state field and the objects inside them, for a value of any type. */
export const PATHS: readonly string[] = ['model', 'model.display_name', 'model.id', 'effort', 'ctxPct', 'ctxTok', 'ctxMax', 'branch', 'add', 'del', 'cwd',
  'ver', 'h5', 'h5.used', 'h5.left', 'h5.window', 'week', 'week.used', 'week.left', 'cache', 'cache.hit', 'cache.warm', 'cache.left', 'cache.ttl',
  'extra', 'extra.used', 'extra.limit', 'cost', 'turns', 'compactions', 'hist', 'scoped'];
/** States that are not objects, or whose groups are not (sweep.mjs case 4). */
export const NON_STATES: readonly unknown[] = [null, undefined, 'x', 5, [], {}, { h5: null, week: 'x', cache: 5, extra: [] }, true];
/** Every value of every field, one at a time, on a copy of `base` (sweep.mjs case 1), as [field, state]. */
export function oneFactor(base: object): Array<[string, State]> {
  const out: Array<[string, State]> = [];
  for (const [f, [vals, apply]] of Object.entries(FIELDS)) {
    for (const v of vals) { const s = structuredClone(base) as State; apply(s, v); out.push([f, s]); }
  }
  return out;
}

// ---------------- history domains and generator (sweep.mjs case 4d: HTIME, HCOUNT, HBRANCH, HOBJ, random histories) ----
export const HTIME: readonly unknown[] = [0, 1, 29, 30, 59, 60, 299, 300, 599, 600, 7199, 7200, 1e9, 1.7e9, 1e13, 1e13 + 10, 1e15, 1e20, 1e300,
  Number.MAX_VALUE, -1, -0, -1e9, NaN, Infinity, -Infinity, '600', ' 5700 ', '5700%', '1e3', '', 'x', null, undefined, true, false, [], {}, [5700], DEL];
export const HCOUNT: readonly unknown[] = [0, 1, 2, 9, 99, 100, 101, 1e15, 2e15, 1e300, -1, -5, -0, 0.5, 1.9, NaN, Infinity, -Infinity, '3', ' 12 ', '7%',
  'x', '', null, undefined, true, [], {}, DEL];
export const HBRANCH: readonly unknown[] = ['main', 'feature/cache', 'feature/hotbar', 'other', '', ' ', '‍', 7, 0, NaN, null, true, {}, [],
  'a/'.repeat(300) + 'main', LINK('https://x.y', 'main'), 'main' + ESC + '[K', 'x'.repeat(4097), DEL];
export const HOBJ: readonly unknown[] = [DEL, null, undefined, 'x', '', 5, 0, true, [], {}, [1, 2]];
/** Every hist field's values for a reference hist at `now` on `branch` (sweep.mjs case 4d), as [path, value]. */
export function histFields(now: number, branch: string): Array<[string, unknown]> {
  const I = Math.floor(now / 900);
  const fields: Record<string, readonly unknown[]> = {
    hist: HOBJ,
    'hist.now': HTIME,
    'hist.sessionStart': [...HTIME, now - 7199, now - 7200, now + 60],
    'hist.dirtySince': [...HTIME, now - 599, now - 600, now - 4199, now - 4200, now + 60],
    'hist.commits': HCOUNT,
    'hist.lastCommit': [...HOBJ, { at: 'x' }, { add: 5, del: 1 }, { at: now - 10, add: 3019, del: 992 }, { at: now - 10, add: 3019, del: 992, branch },
      { at: now - 45, add: 0, del: 0, branch }, { at: now - 120, add: 1e15, del: 1e15, branch }, { at: now + 500, add: 5, del: 1, branch }],
    'hist.lastCommit.at': [...HTIME, now, now - 29, now - 30, now - 59, now - 60, now - 299, now - 300, now + 50],
    'hist.lastCommit.add': HCOUNT,
    'hist.lastCommit.del': HCOUNT,
    'hist.lastCommit.branch': HBRANCH,
    'hist.buckets': [...HOBJ, [null, 'x', 5, {}, true], [[]], [['x', 1]], [[I + 0.5, 9, 9, 0, 1]], [[I + 1, 9, 9, 0, 1]], [[I - 8, 9, 9, 0, 1]],
      [[I - 7, 9, 9, 0, 1]], [[I, -5, -5, -5, 1]], [[I, 1e300, 1e300, 1e300, 1]], [[I, NaN, Infinity, 'x', 'x']], [[I, 9, 9, 0, 2]], [[I, 9, 9, 0, true]],
      [[I, 9, 9, 0, '1']], [[String(I), 9, 9, 0, 1]], [[I, 5, 5, 0, 0], [I, 0, 0, 0, 1]], [[I, 0, 0, 0, 0]], [[I, 0, 0, 0, 1]], [[I - 3, 0, 0, 0, 1]],
      [[I - 1, 1e15, 1e15, 0, 0], [I, 1, 1, 0, 0]], Array.from({ length: 8 }, (_, k) => [I - 7 + k, 1e15, 0, 1e15, k % 2]),
      Array.from({ length: 8 }, (_, k) => [I - 7 + k, 7 ** k, k, 7 ** k - k, 0]), Array.from({ length: 70 }, (_, k) => [I - 7 + (k % 8), k, k, 0, 0]),
      [[-1, 9, 9, 0, 1], [-7, 9, 9, 0, 1]], [[-0, 9, 9, 0, 1]], Array.from({ length: 1000 }, (_, k) => [I - (k % 8), k, k, 0, k % 2]),
      // not in the sweep: only the last 64 entries are read, so the first of 64 counts and the first of 65 does not
      [[I, 9, 9, 0, 1], ...Array.from({ length: 63 }, () => null)], [[I, 9, 9, 0, 1], ...Array.from({ length: 64 }, () => null)],
      [[I - 2, 9, 9, 0, 1], ...Array.from({ length: 64 }, (_, k) => [I, k, k, 0, 0])]],
  };
  return Object.entries(fields).flatMap(([f, vals]) => vals.map((v): [string, unknown] => [f, v]));
}
/**
 * Histories saved in milliseconds (sweep.mjs case 4d, round 7): the reference hist `H` moved to Unix time in ms, its bucket
 * indices anywhere in their 1000, its last commit at several ages; and the clocks around the ms rule's edge (1e11).
 */
export function msHists(H: State): State[] {
  const T0 = 900 * 1957111, now = H.now as number, lc0 = H.lastCommit as State | null, out: State[] = [];
  const ms = (v: unknown): unknown => (v === null ? null : 1000 * (T0 + (v as number)));
  for (const j of [0, 999]) for (const age of [null, 10, 45, 120]) {
    out.push({ now: 1000 * (T0 + now) + 7, sessionStart: ms(H.sessionStart), dirtySince: ms(H.dirtySince), commits: H.commits,
      lastCommit: lc0 && { ...lc0, at: 1000 * (T0 + (age === null ? lc0.at as number : now - age)) },
      buckets: (H.buckets as number[][]).map((x) => [1000 * (T0 / 900 + x[0]!) + j, ...x.slice(1)]) });
  }
  for (const n of [1e11 - 1, 1e11, 1e11 + 1, 1.7e12, 1e13, 1e13 + 1, 1e16]) {
    out.push({ now: n, sessionStart: n - 7200000, dirtySince: n - 4200000, commits: 1, lastCommit: { at: n - 100000, add: 5, del: 1, branch: 'main' },
      buckets: [[Math.floor(n / 900), 50, 40, 10, 1], [Math.floor(n / 900000), 60, 50, 10, 0]] });
  }
  return out;
}
/** A copy of `s` with one path set (DEL removes it), like setPath; the value itself is not copied. */
export function withField(s: State, path: string, v: unknown): State {
  const out = structuredClone(s);
  const ks = path.split('.');
  let o = out;
  while (ks.length > 1) {
    const k = ks.shift()!;
    if (o[k] === null || typeof o[k] !== 'object' || Array.isArray(o[k])) o[k] = {};
    o = o[k] as State;
  }
  if (v === DEL) delete o[ks[0]!];
  else o[ks[0]!] = v;
  return out;
}
const HNUM: readonly unknown[] = [0, 1, 2, 7, 49, 50, 63, 64, 65, 99, 100, 101, 199, 200, 239, 240, 256, 257, 999, 1000, 2999, 3000, 9999, 10000, 1e15,
  -5, 0.5, NaN, '12', 'x', null];
/** A history at `now` (else at one of the sweep's times), sometimes saved in milliseconds, sometimes with one field of any type. */
export function hist(r: Rng, now0?: number): unknown {
  if (chance(r, 0.04)) return pick(r, HOBJ.filter((v) => v !== DEL));
  const now = now0 !== undefined && chance(r, 0.75) ? now0 : pick(r, [0, 30, 600, 5700, 12000, 15000, 1.7e9, 1792859460, 1e13]);
  const t = (): unknown => pick(r, [0, now, now - 1, now - 29, now - 30, now - 59, now - 60, now - 299, now - 300, now - 600, now - 4200, now - 7200, now + 100,
    -1, 'x', null]);
  const I = Math.floor(now / 900);
  const odd = (): unknown => pick(r, [null, 'x', 5, {}, [], [I + 0.5, 9, 9, 0, 1], [String(I), '40', '30', '10', true], [I], [I, ' 7 ', 7, 0, 'x'],
    [I, 1e300, 1e300, 1e300, 1], [I, NaN, Infinity, -Infinity, 1]]);
  const bucket = (): unknown => (chance(r, 0.06) ? odd() : [I - int(r, -1, 9), pick(r, HNUM), pick(r, HNUM), pick(r, HNUM), pick(r, [0, 1, 1, true, 'x', 2, '1'])]);
  const h: State = {
    now: chance(r, 0.04) ? pick(r, HTIME) : now, sessionStart: t(), dirtySince: t(), commits: pick(r, HNUM),
    lastCommit: chance(r, 0.3) ? null : { at: t(), add: pick(r, HNUM), del: pick(r, HNUM), branch: pick(r, HBRANCH) },
    buckets: Array.from({ length: pick(r, [0, 1, 3, 8, 8, 9, 12]) }, bucket),
  };
  if (h.now === DEL) delete h.now;                             // HTIME and HBRANCH hold the 'remove the key' marker
  const lc = h.lastCommit as State | null;
  if (lc && lc.branch === DEL) delete lc.branch;
  if (chance(r, 0.1) && typeof h.now === 'number') {          // saved in milliseconds: times x 1000, index -> 1000 x index + j
    const j = pick(r, [0, 1, 500, 999]), ms = (v: unknown): unknown => (typeof v === 'number' ? 1000 * v : v);
    h.now = 1000 * h.now + int(r, 0, 999);
    h.sessionStart = ms(h.sessionStart);
    h.dirtySince = ms(h.dirtySince);
    if (h.lastCommit) (h.lastCommit as State).at = ms((h.lastCommit as State).at);
    h.buckets = (h.buckets as unknown[]).map((b) => (Array.isArray(b) && typeof b[0] === 'number' ? [1000 * b[0] + j, ...b.slice(1)] : b));
  }
  if (chance(r, 0.1)) h[pick(r, Object.keys(h))] = value(r);   // one field of any type
  return h;
}

// ---------------- scoped domains and generator (sweep.mjs case 4f: SC_USED, SC_LEFT, SC_DOMAIN, random entries) ----------------
export const SC_USED: readonly unknown[] = [0, 0.4, 0.5, 9.9, 9.99, 10, 10.01, 34.6, 35, 49.5, 50, 50.5, 62, 89.5, 90, 90.3, 91.3, 95, 99, 99.5, 99.99, 100,
  100.0001, 105, 250, 1e21, 1e300, Number.MAX_VALUE, -0, -5, -1e300, 5e-324, '35', ' 35% ', '98%', '1e2', '0x10', ' 62.5 '];
export const SC_LEFT: readonly unknown[] = [null, DEL, undefined, 0, 1, 30, 59, 60, 61, 3599, 3600, 86399, 86400, 604740, 604799, 604800, 604801, 1e12,
  1e300, -5, -1e12, NaN, Infinity, -Infinity, 'x', '', '3600', ' 60 ', '86400%', 1e-9, 59.9, true, {}, []];
const FE = (name: unknown, used: unknown, left: unknown): State => ({ name, used, left });
/** sweep.mjs SC_DOMAIN: no data, every used % and reset, odd names, many models, repeats and order. */
export const SC_DOMAIN: readonly unknown[] = [
  DEL, null, undefined, [], {}, 'x', '', 0, 5, true, [null], [5], ['Fable'], [[]], [{}], [[FE('Fable', 35, 3600)]], [{ name: 'Fable' }], [FE('Fable', null, 1)],
  [FE('Fable', 'abc', 1)], [FE('Fable', NaN, 1)], [FE('Fable', Infinity, 1)], [FE('Fable', -Infinity, 1)], [FE('Fable', '', 1)], [FE('Fable', '%', 1)],
  [FE('Fable', true, 1)], [FE('Fable', {}, 1)], [FE('Fable', [35], 1)], [{ used: 35 }], [FE('', 35, 1)], [FE('   ', 35, 1)], [FE('None', 35, 1)],
  [FE('null', 1, 1)], [FE('NaN', 1, 1)], [FE(' Infinity ', 1, 1)], [FE('-inf', 1, 1)], [FE('+INF', 1, 1)], [FE('undefined', 1, 1)], [FE('nan', 1, 1)],
  [FE('​⠀', 1, 1)], [FE({}, 1, 1)], [FE(['Fable'], 1, 1)], [FE(null, 1, 1)], [FE(true, 1, 1)], [FE(NaN, 1, 1)], [FE(ESC + '[0m', 1, 1)],
  [FE(Infinity, 1, 1)],
  ...SC_USED.map((u) => [FE('Fable', u, 345600)]), ...SC_LEFT.map((l) => [l === DEL ? { name: 'Fable', used: 62 } : FE('Fable', 62, l)]),
  ...SC_NAMES.map((n) => [FE(n, 64.6, 191100)]),
  [FE('Fable', 40, 345600), FE('Sonnet', 90, 108000)], [FE('Sonnet', 90, 108000), FE('Fable', 40, 345600)],
  [FE('Fable', 40, 345600), FE('Sonnet', 95, 108000), FE('Haiku', 10, 3600)], [FE('Opus', 99, 60), FE('Sonnet', 1, null), FE('Fable', 100, 68400)],
  [FE('Fable', 35, 1), FE('FABLE', 99, 2), FE('fable', 0, 3)], [FE('Fable', 35, 1), FE('Fable 5.1', 99, 2)], [FE('Fable 5.1', 99, 2), FE('Fable', 35, 1)],
  Array.from({ length: 5 }, (_, k) => FE(['Fable', 'Sonnet', 'Haiku', 'Opus', 'Mythic'][k], 20 * k + 5, 3600 * (k + 1))),
  Array.from({ length: 16 }, (_, k) => FE(k === 15 ? 'Fable' : 'Model ' + k, 6 * k, k % 3 ? 86400 * k : null)),
  Array.from({ length: 17 }, (_, k) => FE(k === 16 ? 'Fable' : 'Model ' + k, 6 * k, 3600)),   // the 17th entry is not read
  Array.from({ length: 40 }, (_, k) => FE('M' + 'x'.repeat(k % 9) + k, (k * 37) % 120, k % 4 ? 3600 * k : null)),
  Array.from({ length: 1000 }, (_, k) => FE(k % 5 ? 'Model' + k : 'Fable', k % 101, k * 97)),
  Array.from({ length: 16 }, (_, k) => FE('Fable', k, k)), Array.from({ length: 16 }, () => null), [null, 5, 'x', FE('Fable', 50, 60)],
  Array.from({ length: 8 }, (_, k) => FE('A'.repeat(64) + k, 95, 604800)), Array.from({ length: 8 }, (_, k) => FE('日本'.repeat(20) + k, 5, null)),
];
/** The models the scoped cases are drawn under: Fable's in-use spellings and others (sweep.mjs SC_MODELS and its random models). */
export const SC_MODELS: readonly unknown[] = ['Fable 5.1', 'claude-fable-5-1', 'Sonnet 4.5', { display_name: 'Fable 5.1' }, { id: 'claude-fable-5-1' },
  'FABLE 9', 'Fable ' + 'X'.repeat(60), 'Claude Fable 5.1 (1M context) with a very long display name', 'Fabled 2'];
/** One entry of state.scoped: usually {name, used, left} from the domains, sometimes not an object or missing a key. */
function scEntry(r: Rng): unknown {
  if (chance(r, 0.04)) return pick(r, [null, 'x', 5, [], true]);
  const e: State = {};
  if (chance(r, 0.95)) e.name = chance(r, 0.08) ? pick(r, ['', '   ', 'None', 'null', 'NaN', 'Infinity', 'undefined', '-inf', null, {}, [], true]) : pick(r, SC_NAMES);
  if (chance(r, 0.95)) e.used = pick(r, SC_USED);
  if (chance(r, 0.9)) { const l = pick(r, SC_LEFT); if (l !== DEL) e.left = sclone(l); }
  return e;
}
/** state.scoped: a domain value, or 1 to 40 random entries. */
export function scoped(r: Rng): unknown {
  if (chance(r, 0.15)) { const v = pick(r, SC_DOMAIN); return v === DEL ? undefined : sclone(v); }
  const x = r(), n = x < 0.5 ? 1 : x < 0.8 ? 2 : x < 0.95 ? int(r, 3, 6) : int(r, 8, 40);
  return Array.from({ length: n }, () => scEntry(r));
}

// ---------------- states ----------------
const RANDOM_FIELDS = Object.keys(FIELDS).filter((f) => f !== 'h5' && f !== 'week');   // whole-group deletes stay one-factor
/**
 * A state in the engine's format: a copy of one of `bases` (reference states, spec inputs, session frames) with, in turn,
 * every field from the domains (sweep.mjs case 2), one to three fields from the domains (case 3), one to three fields of
 * any type anywhere, or hostile text in a text field; then usually a history around the clock of the base's own, often a
 * scoped list, sometimes a Fable model; and now and then no object at all.
 */
export function state(r: Rng, bases: readonly object[]): unknown {
  if (chance(r, 0.02)) return pick(r, NON_STATES);
  const base = pick(r, bases), s = structuredClone(base) as State;
  const fields = Object.keys(FIELDS);
  const set = (f: string): void => { const [vals, apply] = FIELDS[f]!; apply(s, pick(r, vals)); };
  switch (int(r, 0, 3)) {
    case 0: for (const f of RANDOM_FIELDS) set(f); break;
    case 1: for (let k = int(r, 1, 3); k > 0; k--) set(pick(r, fields)); break;
    case 2: for (let k = int(r, 1, 3); k > 0; k--) setPath(s, pick(r, PATHS), value(r)); break;
    default: setPath(s, pick(r, ['model', 'branch', 'cwd', 'ver', 'effort']), text(r)); break;
  }
  const h = (base as State).hist, now = h !== null && typeof h === 'object' && typeof (h as State).now === 'number' ? (h as State).now as number : undefined;
  const x = r();
  if (x < 0.6) s.hist = hist(r, now);
  else if (x < 0.7) delete s.hist;
  const y = r();
  if (y < 0.4) s.scoped = scoped(r);
  else if (y < 0.5) delete s.scoped;
  if (chance(r, 0.25)) s.model = sclone(pick(r, SC_MODELS));
  return s;
}

/**
 * The smallest state (greedily) for which `bad` still holds: drops top-level keys, then keys of the objects inside,
 * then entries of the arrays inside, then shortens strings. A state that is not an object is returned as it is.
 */
export function shrinkState(s0: unknown, bad: (s: unknown) => boolean): unknown {
  if (s0 === null || typeof s0 !== 'object' || Array.isArray(s0)) return s0;
  let s = { ...(s0 as State) };
  for (const k of Object.keys(s)) { const t = { ...s }; delete t[k]; if (bad(t)) s = t; }
  for (const k of Object.keys(s)) {
    const v = s[k];
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      let o = { ...(v as State) };
      for (const kk of Object.keys(o)) { const t = { ...o }; delete t[kk]; if (bad({ ...s, [k]: t })) o = t; }
      s = { ...s, [k]: o };
    }
    const a = s[k];
    if (Array.isArray(a)) {
      let arr = [...(a as unknown[])];
      for (let i = arr.length - 1; i >= 0; i--) { const t = arr.toSpliced(i, 1); if (bad({ ...s, [k]: t })) arr = t; }
      s = { ...s, [k]: arr };
    }
    const str = s[k];
    if (typeof str === 'string') s = { ...s, [k]: shrinkText(str, (t) => bad({ ...s, [k]: t })) };
  }
  return s;
}
