// SGR encoding for the Minecraft palette of the Classic Plus look.
import type { Env } from './env.ts';

export const PALETTE = {
  model: '#FFAA00', effort: '#FF55FF', ctx: '#80FF20', bar: '#80FF20', empty: '#3f3f3f',
  git: '#55FF55', chg: '#FFFF55', cwd: '#AAAAAA', h5: '#E0A458', week: '#FF5555', time: '#AAAAAA',
  cache: '#55FFFF', warm: '#FFAA00', cold: '#55FFFF', extra: '#17DD62', ver: '#555555', sep: '#555555',
  warn: '#FFFF55', crit: '#FF5555', food: '#E0A458', heart: '#FF5555', label: '#AAAAAA',
} as const;

export type Role = keyof typeof PALETTE;
export type Depth = 'none' | '16' | '256' | 'truecolor';

export interface Style {
  role?: Role | undefined;
  bold?: boolean | undefined;
  dim?: boolean | undefined;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const CUBE = [0, 95, 135, 175, 215, 255];

/** Nearest xterm-256 index: the 6×6×6 cube or the 24-step grey ramp. */
export function to256(hex: string): number {
  const [r, g, b] = rgb(hex);
  const near = (v: number): number => {
    let best = 0;
    for (let i = 1; i < 6; i++) if (Math.abs((CUBE[i] ?? 0) - v) < Math.abs((CUBE[best] ?? 0) - v)) best = i;
    return best;
  };
  const ci = [near(r), near(g), near(b)] as const;
  const cc = ci.map((i) => CUBE[i] ?? 0);
  const cubeDist = (cc[0]! - r) ** 2 + (cc[1]! - g) ** 2 + (cc[2]! - b) ** 2;
  const avg = (r + g + b) / 3;
  const gi = Math.max(0, Math.min(23, Math.round((avg - 8) / 10)));
  const gv = 8 + gi * 10;
  const greyDist = (gv - r) ** 2 + (gv - g) ** 2 + (gv - b) ** 2;
  return greyDist < cubeDist ? 232 + gi : 16 + 36 * ci[0] + 6 * ci[1] + ci[2];
}

// The Minecraft chat colours are the CGA palette, so each role has an exact 16-colour home.
const SIXTEEN: Record<string, number> = {
  '#FFAA00': 33, '#FF55FF': 95, '#80FF20': 92, '#3F3F3F': 90, '#55FF55': 92, '#FFFF55': 93,
  '#AAAAAA': 37, '#E0A458': 33, '#FF5555': 91, '#55FFFF': 96, '#17DD62': 32, '#555555': 90,
};

export function fgParams(hex: string, depth: Depth): string {
  if (depth === 'truecolor') return '38;2;' + rgb(hex).join(';');
  if (depth === '256') return '38;5;' + to256(hex);
  return String(SIXTEEN[hex.toUpperCase()] ?? 37);
}

/** A background colour, for the HUD look only (plan §9): it draws at 24-bit or 256 colours, never at 16 or none. */
export function bgParams(hex: string, depth: 'truecolor' | '256'): string {
  return depth === 'truecolor' ? '48;2;' + rgb(hex).join(';') : '48;5;' + to256(hex);
}

/** One styled span; every styled span ends with a full reset. */
export function paint(text: string, style: Style, depth: Depth): string {
  if (depth === 'none' || text === '') return text;
  const p: string[] = [];
  if (style.bold) p.push('1');
  if (style.dim) p.push('2');
  if (style.role) p.push(fgParams(PALETTE[style.role], depth));
  return p.length ? `\x1b[${p.join(';')}m${text}\x1b[0m` : text;
}

export function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

/** NO_COLOR and FORCE_COLOR first, then the config, then what the terminal says it can do. */
export function detectDepth(color: 'auto' | 'always' | 'never', depth: 'auto' | Depth, env: Env): Depth {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return 'none';
  const force = env.FORCE_COLOR;
  if (force !== undefined) {
    if (force === '0' || force === 'false') return 'none';
    if (force === '1' || force === 'true' || force === '') return depth === 'auto' || depth === 'none' ? '16' : depth;
    if (force === '2') return '256';
    if (force === '3') return 'truecolor';
  }
  if (color === 'never') return 'none';
  if (depth !== 'auto') return depth;
  const ct = (env.COLORTERM ?? '').toLowerCase();
  if (ct === 'truecolor' || ct === '24bit') return 'truecolor';
  if (env.WT_SESSION) return 'truecolor';
  const tp = env.TERM_PROGRAM ?? '';
  if (['vscode', 'iTerm.app', 'WezTerm', 'ghostty', 'Hyper', 'Tabby'].includes(tp)) return 'truecolor';
  if (/256/.test(env.TERM ?? '')) return '256';
  return '256';
}
