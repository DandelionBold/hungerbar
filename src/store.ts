// Cache directories, atomic writes, wx locks and FNV-1a keys (SPEC §10).
import { closeSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { claudeDir, slash, type Env } from './env.ts';

export function cacheDir(env: Env): string {
  if (env.HUNGERBAR_CACHE_DIR) return env.HUNGERBAR_CACHE_DIR;
  if (process.platform === 'win32') return join(env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'hungerbar');
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Caches', 'hungerbar');
  return join(env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'hungerbar');
}

/** Per-account folder, keyed by the Claude config dir, so two accounts never share limits. */
export function acctDir(env: Env): string {
  return join(cacheDir(env), 'acct-' + fnv1a(slash(claudeDir(env)).toLowerCase()));
}

/** 32-bit FNV-1a over UTF-8, as 8 hex digits. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (const b of Buffer.from(s, 'utf8')) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function readJson<T>(path: string): T | null {
  try {
    const v: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return v && typeof v === 'object' ? (v as T) : null;
  } catch {
    return null;
  }
}

function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Temp file then rename; the rename is retried because Windows briefly locks files that are being read. */
export function writeAtomic(path: string, data: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  writeFileSync(tmp, data);
  for (let i = 0; ; i++) {
    try {
      renameSync(tmp, path);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (i < 3 && (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES')) {
        sleepMs(15 * (i + 1));
        continue;
      }
      try { unlinkSync(tmp); } catch { /* already gone */ }
      throw e;
    }
  }
}

export function writeJson(path: string, obj: unknown): void {
  writeAtomic(path, JSON.stringify(obj));
}

/** True while another process holds the lock and it is younger than staleMs. */
export function lockLive(path: string, staleMs: number, nowMs: number): boolean {
  const st = statSync(path, { throwIfNoEntry: false });
  return st !== undefined && nowMs - st.mtimeMs < staleMs;
}

/** Creates the lock with O_EXCL; a stale lock is removed and the create retried once. */
export function tryLock(path: string, staleMs: number): boolean {
  mkdirSync(dirname(path), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      closeSync(openSync(path, 'wx'));
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') return false;
      if (lockLive(path, staleMs, Date.now())) return false;
      try { unlinkSync(path); } catch { /* raced with its owner */ }
    }
  }
  return false;
}

export function unlock(path: string): void {
  try { unlinkSync(path); } catch { /* already gone */ }
}

const HOUR = 3_600_000, DAY = 24 * HOUR;

/**
 * Housekeeping for the background workers (SPEC §10), at most once a day per cache dir (the `.pruned` stamp's mtime is
 * the time of the last run): hud/, transcript/ and pr/ files untouched for 7 days, and the `.tmp` files a killed atomic
 * write leaves, once they are an hour old, in the cache dir and its git/, hud/, transcript/, pr/ and acct- folders. At
 * most `max` files go per run; the rest wait for the next day. Returns how many were removed.
 */
export function pruneOld(dir: string, nowMs: number, max = 200): number {
  const stamp = join(dir, '.pruned');
  const last = statSync(stamp, { throwIfNoEntry: false })?.mtimeMs;
  if (last !== undefined && nowMs >= last && nowMs - last < DAY) return 0;
  try {
    writeFileSync(stamp, '');
    utimesSync(stamp, nowMs / 1000, nowMs / 1000);
  } catch {
    return 0;
  }
  const names = (d: string): string[] => {
    try { return readdirSync(d); } catch { return []; }
  };
  let removed = 0;
  const sweep = (d: string, oldAll: boolean): void => {
    for (const f of names(d)) {
      if (removed >= max) return;
      const p = join(d, f);
      const st = statSync(p, { throwIfNoEntry: false });
      if (!st?.isFile()) continue;
      const age = nowMs - st.mtimeMs;
      if ((f.endsWith('.tmp') && age > HOUR) || (oldAll && age > 7 * DAY)) {
        try { unlinkSync(p); removed++; } catch { /* in use or already gone */ }
      }
    }
  };
  sweep(join(dir, 'hud'), true);
  sweep(join(dir, 'transcript'), true);
  sweep(join(dir, 'pr'), true);
  sweep(dir, false);
  sweep(join(dir, 'git'), false);
  for (const f of names(dir)) if (f.startsWith('acct-')) sweep(join(dir, f), false);
  return removed;
}
