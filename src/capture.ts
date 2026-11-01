// HUNGERBAR_CAPTURE=<dir>: saves one scrubbed payload per Claude Code version as a future fixture (SPEC §16.12).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { writeAtomic } from './store.ts';

export function scrub(raw: string): string | null {
  let p: Record<string, unknown>;
  try {
    p = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const paths = new Set<string>();
  const ws = p.workspace as Record<string, unknown> | undefined;
  for (const v of [p.cwd, ws?.current_dir, ws?.project_dir]) if (typeof v === 'string' && v) paths.add(v);
  let text = JSON.stringify(p, null, 2);
  if (typeof p.session_id === 'string') text = text.split(JSON.stringify(p.session_id)).join('"00000000-0000-4000-8000-000000000001"');
  if (typeof p.transcript_path === 'string') text = text.split(JSON.stringify(p.transcript_path)).join('"{{TRANSCRIPT}}"');
  for (const v of [...paths].sort((a, b) => b.length - a.length)) text = text.split(JSON.stringify(v).slice(1, -1)).join('{{REPO}}');
  return text + '\n';
}

/**
 * HUNGERBAR_CAPTURE=<dir> for the usage API (1.1.0): after a fetch that worked, the parsed answer's extra_usage and
 * limits keys only (never the raw body, its headers or the token) as usage-<YYYYMMDD>.json (UTC), the day's latest
 * answer, so the units and an Ultra account's shape can be checked against real data.
 */
export function captureUsage(body: unknown, dir: string, now: number): void {
  try {
    const o = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
    const day = new Date(now * 1000).toISOString().slice(0, 10).replaceAll('-', '');
    writeAtomic(join(dir, `usage-${day}.json`), JSON.stringify({ extra_usage: o.extra_usage ?? null, limits: o.limits ?? null }, null, 2) + '\n');
  } catch {
    /* a capture never breaks a refresh */
  }
}

export function capture(raw: string, dir: string): void {
  try {
    const p = JSON.parse(raw) as { version?: unknown };
    const ver = typeof p.version === 'string' && /^[\w.-]{1,24}$/.test(p.version) ? p.version : 'unknown';
    const file = join(dir, `cc-${ver}.json`);
    if (existsSync(file)) return;
    const text = scrub(raw);
    if (text) writeAtomic(file, text);
  } catch {
    /* capture never breaks a render */
  }
}
