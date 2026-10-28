// Child processes: loaded lazily, never on a cache-hit render (SPEC §2).
import type * as CP from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { Env } from './env.ts';

export function childProcess(): typeof CP {
  const get = (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
  return (get ? get('node:child_process') : createRequire(import.meta.url)('node:child_process')) as typeof CP;
}

/** Starts `node <self> ...args` detached, hidden and unref'd; the render never waits for it. */
export function spawnDetached(self: string, args: string[], cwd: string, env: Env): void {
  const cp = childProcess();
  try { mkdirSync(cwd, { recursive: true }); } catch { /* spawn reports it */ }
  const child = cp.spawn(process.execPath, [self, ...args], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    cwd,
    env: env as NodeJS.ProcessEnv,
  });
  child.on('error', () => { /* the next render retries */ });
  child.unref();
}

/** Kills a process and its children: taskkill /T on Windows, SIGKILL elsewhere. */
export function treeKill(pid: number, env: Env): void {
  try {
    if (process.platform === 'win32') {
      const taskkill = join(env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows', 'System32', 'taskkill.exe');
      childProcess().spawnSync(taskkill, ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 5000 });
    } else process.kill(pid, 'SIGKILL');
  } catch {
    /* already gone */
  }
}

export interface RunResult {
  code: number | null;
  stdout: string;
  timedOut: boolean;
  /** The start of stderr (up to 4 KiB), only when the caller asked for it; else ''. */
  stderr: string;
}

/**
 * Runs a program with a hard timeout that kills the whole tree. Its stdout is kept up to 64 KiB, or, with `onData`,
 * handed over as it comes and not kept. stderr is ignored unless `keepStderr` asks for its first 4 KiB.
 */
export function run(bin: string, args: string[], env: Env, cwd: string, timeoutMs: number, onData?: (chunk: string) => void, keepStderr = false): Promise<RunResult> {
  return new Promise((resolve) => {
    let child: CP.ChildProcess;
    try {
      child = childProcess().spawn(bin, args, { cwd, env: env as NodeJS.ProcessEnv, windowsHide: true, stdio: ['ignore', 'pipe', keepStderr ? 'pipe' : 'ignore'] });
    } catch {
      resolve({ code: null, stdout: '', timedOut: false, stderr: '' });
      return;
    }
    let out = '', err = '', timedOut = false, done = false;
    const finish = (code: number | null): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ code, stdout: out, timedOut, stderr: err });
    };
    child.stderr?.setEncoding('utf8').on('data', (d: string) => {
      if (err.length < 4096) err += d.slice(0, 4096 - err.length);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid !== undefined) treeKill(child.pid, env);
      finish(null);
    }, timeoutMs);
    child.stdout?.setEncoding('utf8').on('data', (d: string) => {
      if (onData) onData(d);
      else if (out.length < 65536) out += d;
    });
    child.on('error', () => finish(null));
    child.on('close', (code) => finish(code));
  });
}
