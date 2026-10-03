// 5h and weekly limits: stdin first, then the last-known values for this account (SPEC §5, §10).
import { join } from 'node:path';
import { limitPct } from './format.ts';
import { num, type Payload, type RateWindow } from './payload.ts';
import { readJson, writeJson } from './store.ts';

export interface Known {
  pct: number;
  resets_at: number | null;
}

export interface LimitsFile {
  v: 1;
  five_hour: Known | null;
  seven_day: Known | null;
  at: number;
}

export interface LimitView {
  pct: number;
  /** Seconds until the reset, or null when unknown or passed. */
  left: number | null;
  /** True for a last-known value, shown dimmed with "~". */
  dim: boolean;
}

function live(w: RateWindow | null | undefined): Known | null {
  if (!w || typeof w !== 'object') return null;
  const pct = num(w.used_percentage);
  if (pct === null) return null;
  return { pct, resets_at: num(w.resets_at) };
}

/** Glitch rule (from v1.4.4): every present window at 0 with no reset means the data is not real. */
export function liveLimits(p: Payload): { h5: Known | null; week: Known | null } {
  const rl = p.rate_limits;
  const h5 = live(rl?.five_hour), week = live(rl?.seven_day);
  const present = [h5, week].filter((k): k is Known => k !== null);
  if (present.length > 0 && present.every((k) => k.pct === 0 && k.resets_at === null)) return { h5: null, week: null };
  return { h5, week };
}

export function view(k: Known | null, isLive: boolean, now: number): LimitView | null {
  if (!k) return null;
  if (isLive) return { pct: limitPct(k.pct), left: k.resets_at !== null ? k.resets_at - now : null, dim: false };
  if (k.resets_at !== null && k.resets_at <= now) return { pct: 0, left: null, dim: true };
  return { pct: limitPct(k.pct), left: k.resets_at !== null ? k.resets_at - now : null, dim: true };
}

const same = (a: Known | null, b: Known | null): boolean => a === b || (!!a && !!b && a.pct === b.pct && a.resets_at === b.resets_at);

/** Resolves both windows and persists the last-known file only when a value changed. */
export function resolveLimits(p: Payload, acct: string, now: number, persist: boolean): { h5: LimitView | null; week: LimitView | null } {
  const { h5, week } = liveLimits(p);
  const path = join(acct, 'limits.json');
  const old = readJson<LimitsFile>(path);
  const prev = old && old.v === 1 ? old : null;
  const next: LimitsFile = { v: 1, five_hour: h5 ?? prev?.five_hour ?? null, seven_day: week ?? prev?.seven_day ?? null, at: now };
  if (persist && (h5 || week) && (!prev || !same(prev.five_hour, next.five_hour) || !same(prev.seven_day, next.seven_day))) {
    try { writeJson(path, next); } catch { /* a read-only cache dir only costs the fallback */ }
  }
  return {
    h5: h5 ? view(h5, true, now) : view(prev?.five_hour ?? null, false, now),
    week: week ? view(week, true, now) : view(prev?.seven_day ?? null, false, now),
  };
}
