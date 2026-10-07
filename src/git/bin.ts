// The git binary: HUNGERBAR_GIT_BIN, else the first git in an absolute PATH entry (SPEC §9).
import { statSync } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import type { Env } from '../env.ts';
import { fnv1a, readJson, writeJson } from '../store.ts';

function isFile(p: string): boolean {
  return statSync(p, { throwIfNoEntry: false })?.isFile() ?? false;
}

/**
 * The first `<name>.exe` (Windows) or `<name>` in an absolute PATH entry. Relative, empty and "." entries are skipped,
 * so a binary planted in the repo can never run.
 */
export function findOnPath(pathVar: string, name: string): string | null {
  const file = process.platform === 'win32' ? name + '.exe' : name;
  for (const dir of pathVar.split(delimiter)) {
    const d = dir.trim().replace(/^"(.*)"$/, '$1');
    if (!d || d === '.' || !isAbsolute(d)) continue;
    const p = join(d, file);
    if (isFile(p)) return p;
  }
  return null;
}

export function findGit(pathVar: string): string | null {
  return findOnPath(pathVar, 'git');
}

export function resolveGit(env: Env, cacheDir: string): string | null {
  if (env.HUNGERBAR_GIT_BIN) return env.HUNGERBAR_GIT_BIN;
  const pathVar = env.PATH ?? env.Path ?? '';
  const key = fnv1a(pathVar);
  const file = join(cacheDir, 'gitbin.json');
  const cached = readJson<{ key: string; bin: string }>(file);
  if (cached && cached.key === key && isFile(cached.bin)) return cached.bin;
  const bin = findGit(pathVar);
  if (bin) {
    try { writeJson(file, { key, bin }); } catch { /* resolved again next time */ }
  }
  return bin;
}
