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
  /**
   * The account has no 5-hour window (noFiveHour, 1.1.0): set with five_hour null, so a payload without rate_limits
   * keeps that; a live five_hour clears it. Readers before 1.1.0 ignore it and find five_hour null.
   */
  fiveHourNone?: true;
}

export interface LimitView {
  pct: number;
  /** Seconds until the reset, or null when unknown or passed. */
  left: number | null;
  /** True for a last-known value, shown dimmed with "~". */
  dim: boolean;
}

/** Both windows as drawn, and whether the account has no 5-hour window at all (1.1.0; h5 is then null). */
export interface Limits {
  h5: LimitView | null;
  week: LimitView | null;
  h5None: boolean;
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

/**
 * A window as drawn. Once its reset has passed it is refilled (0% used, no clock), live or last-known alike (1.1.0):
 * Claude Code runs the status line again at `resets_at`, so a live value past it is the old window's.
 */
export function view(k: Known | null, isLive: boolean, now: number): LimitView | null {
  if (!k) return null;
  if (k.resets_at !== null && k.resets_at <= now) return { pct: 0, left: null, dim: !isLive };
  return { pct: limitPct(k.pct), left: k.resets_at !== null ? k.resets_at - now : null, dim: !isLive };
}

/**
 * The account has no 5-hour window (an Ultra plan, 1.1.0): rate_limits is an object, its five_hour is missing, null or
 * an object with neither used_percentage nor resets_at, and its weekly is real (it passes the glitch rule). Only the
 * 5-hour window has this rule: a payload with a five_hour and no seven_day still falls back to the weekly last known.
 */
export function noFiveHour(p: Payload): boolean {
  const rl = p.rate_limits;
  if (!rl || typeof rl !== 'object') return false;
  const f = rl.five_hour;
  const none = f === undefined || f === null || (typeof f === 'object' && num(f.used_percentage) === null && num(f.resets_at) === null);
  return none && liveLimits(p).week !== null;
}

/**
 * The newer of a window's saved value and this payload's, for limits.json (1.1.0), so sessions on older payloads never
 * move it back: the later reset wins; with the same reset the higher use wins, as use only grows within a window.
 * Without both resets nothing orders them, and this payload's wins, as before 1.1.0.
 */
export function newer(saved: Known | null, live: Known | null): Known | null {
  if (!live) return saved;
  if (!saved || saved.resets_at === null || live.resets_at === null) return live;
  if (saved.resets_at !== live.resets_at) return live.resets_at > saved.resets_at ? live : saved;
  return live.pct >= saved.pct ? live : saved;
}

const same = (a: Known | null, b: Known | null): boolean => a === b || (!!a && !!b && a.pct === b.pct && a.resets_at === b.resets_at);

/**
 * Resolves both windows: each from stdin, else last known. The last-known file keeps the newer value of each window and
 * is written only when it changes. With no 5-hour window (noFiveHour, or its saved flag while no live five_hour comes)
 * h5 is null and never last known.
 */
export function resolveLimits(p: Payload, acct: string, now: number, persist: boolean): Limits {
  const { h5, week } = liveLimits(p);
  const path = join(acct, 'limits.json');
  const old = readJson<LimitsFile>(path);
  const prev = old && old.v === 1 ? old : null;
  const none = noFiveHour(p), h5None = none || (!h5 && prev?.fiveHourNone === true);
  const next: LimitsFile = {
    v: 1,
    five_hour: none ? null : newer(prev?.five_hour ?? null, h5),
    seven_day: newer(prev?.seven_day ?? null, week),
    at: now,
    ...(h5None ? { fiveHourNone: true as const } : {}),
  };
  const changed = !prev || !same(prev.five_hour, next.five_hour) || !same(prev.seven_day, next.seven_day) || (prev.fiveHourNone === true) !== h5None;
  if (persist && (h5 || week) && changed) {
    try { writeJson(path, next); } catch { /* a read-only cache dir only costs the fallback */ }
  }
  return {
    h5: h5 ? view(h5, true, now) : h5None ? null : view(prev?.five_hour ?? null, false, now),
    week: week ? view(week, true, now) : view(prev?.seven_day ?? null, false, now),
    h5None,
  };
}
