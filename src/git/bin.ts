// The git binary: HUNGERBAR_GIT_BIN, else the first git in an absolute PATH entry (SPEC §9).
import { accessSync, constants } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import type { Env } from '../env.ts';
import { fnv1a, readJson, statSafe, writeJson } from '../store.ts';

/** A file this process may run: on Windows any file (the name ends in .exe), elsewhere one with its execute bit for us. */
function isExe(p: string): boolean {
  if (!statSafe(p)?.isFile()) return false;
  if (process.platform === 'win32') return true;
  try {
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * A PATH entry that names one folder wherever the process runs: on Windows a drive (`C:\`) or a UNC share (`\\host\`);
 * `\Users\x` has no drive and means the current drive, which path.win32.isAbsolute still calls absolute. Elsewhere `/…`.
 */
const fixed = (d: string): boolean => (process.platform === 'win32' ? /^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/])/.test(d) : isAbsolute(d));

/**
 * The first `<name>.exe` (Windows) or executable `<name>` (elsewhere) in an absolute PATH entry. Relative, empty, "."
 * and (on Windows) drive-less entries are skipped, so a binary planted in the repo can never run.
 */
export function findOnPath(pathVar: string, name: string): string | null {
  const file = process.platform === 'win32' ? name + '.exe' : name;
  for (const dir of pathVar.split(delimiter)) {
    const d = dir.trim().replace(/^"(.*)"$/, '$1');
    if (!d || !fixed(d)) continue;
    const p = join(d, file);
    if (isExe(p)) return p;
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
  if (cached && cached.key === key && isExe(cached.bin)) return cached.bin;
  const bin = findGit(pathVar);
  if (bin) {
    try { writeJson(file, { key, bin }); } catch { /* resolved again next time */ }
  }
  return bin;
}
