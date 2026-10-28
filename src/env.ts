// Process-wide flags and the clock. Everything that reads the environment goes through here.
import { homedir } from 'node:os';
import { join } from 'node:path';

declare const __HUNGERBAR_VERSION__: string;

export type Env = Record<string, string | undefined>;

export const VERSION: string = typeof __HUNGERBAR_VERSION__ !== 'undefined' ? __HUNGERBAR_VERSION__ : '0.0.0-dev';

/** Epoch seconds; HUNGERBAR_NOW pins it for tests. */
export function nowSec(env: Env): number {
  const v = env.HUNGERBAR_NOW;
  if (v && /^\d+(\.\d+)?$/.test(v)) return Math.floor(Number(v));
  return Math.floor(Date.now() / 1000);
}

export function flag(env: Env, name: string): boolean {
  const v = env[name];
  return v === '1' || v === 'true' || v === 'yes';
}

/** Non-essential traffic is off (Claude Code's own switch, or HUNGERBAR_OFFLINE): nothing Hungerbar runs then uses the network. */
export function offline(env: Env): boolean {
  return !!env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC || flag(env, 'HUNGERBAR_OFFLINE');
}

/** ${CLAUDE_CONFIG_DIR:-~/.claude} */
export function claudeDir(env: Env): string {
  const d = env.CLAUDE_CONFIG_DIR;
  return d && d.trim() ? d.trim() : join(homedir(), '.claude');
}

/** Positive integer from an env var, else null. */
export function intEnv(env: Env, name: string): number | null {
  const v = env[name];
  if (!v || !/^\d+$/.test(v.trim())) return null;
  const n = Number(v.trim());
  return n > 0 ? n : null;
}

/** Test-only: maps displayed path prefixes onto real folders (see SPEC §0.4). */
export function fsMap(env: Env): Array<[string, string]> {
  const v = env.HUNGERBAR_FS_MAP;
  if (!v) return [];
  try {
    const o: unknown = JSON.parse(v);
    if (!o || typeof o !== 'object') return [];
    return Object.entries(o as Record<string, unknown>)
      .filter((e): e is [string, string] => typeof e[1] === 'string')
      .map(([from, to]) => [slash(from).replace(/\/+$/, ''), to]);
  } catch {
    return [];
  }
}

export function slash(p: string): string {
  return p.replace(/\\/g, '/');
}

/** Applies HUNGERBAR_FS_MAP to a path; returns the path unchanged when nothing matches. */
export function mapPath(p: string, map: Array<[string, string]>): string {
  if (map.length === 0) return p;
  const s = slash(p);
  for (const [from, to] of map) {
    const low = s.toLowerCase(), f = from.toLowerCase();
    if (low === f || low.startsWith(f + '/')) return to + s.slice(from.length);
  }
  return p;
}
