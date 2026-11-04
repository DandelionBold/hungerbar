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
   * The account has no 5-hour window (an Ultra plan, 1.1.0): set with five_hour null. Since 1.2.1 it is trusted only with
   * fiveHourNoneAt, as 1.1.0 and 1.2.0 also set it for a window Claude Code had dropped at its reset (resolveLimits).
   * Readers before 1.1.0 ignore it and find five_hour null.
   */
  fiveHourNone?: true;
  /** When Hungerbar found the account had no 5-hour window (1.2.1, resolveLimits): the flag counts only with it. */
  fiveHourNoneAt?: number;
  /**
   * Since when Hungerbar has seen the week and no 5-hour window with none saved (1.2.1, a fresh install or a file 1.2.0
   * emptied): a reply from Claude asked for after it, with the 5-hour window still missing, means the account has none.
   */
  noFiveHourSince?: number;
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
 * The payload has the shape of an account with no 5-hour window (1.1.0): rate_limits is an object, its five_hour is
 * missing, null or an object with neither used_percentage nor resets_at, and its weekly is real (it passes the glitch
 * rule). Only the 5-hour window has this rule: a payload with a five_hour and no seven_day still falls back to the
 * weekly last known. Since 1.2.1 the shape alone is not the Ultra plan: Claude Code drops a window once its resets_at
 * passes, until Claude's next reply, so a Pro or Max payload right after a 5-hour reset has it too (resolveLimits).
 */
export function noFiveHour(p: Payload): boolean {
  const rl = p.rate_limits;
  if (!rl || typeof rl !== 'object') return false;
  const f = rl.five_hour;
  const none = f === undefined || f === null || (typeof f === 'object' && num(f.used_percentage) === null && num(f.resets_at) === null);
  return none && liveLimits(p).week !== null;
}

/** limits.json says the account has no 5-hour window, and 1.2.1 or later found it (fiveHourNoneAt). */
export const savedNoFiveHour = (f: Pick<LimitsFile, 'fiveHourNone' | 'fiveHourNoneAt'> | null | undefined): boolean =>
  f?.fiveHourNone === true && typeof f.fiveHourNoneAt === 'number' && Number.isFinite(f.fiveHourNoneAt);

/**
 * What else a render knows about the 5-hour window (1.2.1), asked only while the payload has the no-5-hour shape and
 * nothing saved settles it. Each is a function, so a render that never needs it never reads it.
 */
export interface Evidence {
  /**
   * When the newest main-chain reply from the API was asked for, in seconds (the transcript's askedAt), or null. Not the
   * reply row's own time, which comes after it streamed: a request sent before a reset carries the old window's headers.
   */
  askedAt?: () => number | null;
  /** The usage API's five_hour: true when it is null (no 5-hour window), false when it is a window, null for no word. */
  usageNone?: () => boolean | null;
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
 * is written only when it changes. With no 5-hour window h5 is null and never last known.
 *
 * No 5-hour window (1.2.1). A payload with the week and no five_hour (noFiveHour) is the Ultra plan only once something
 * says so; until then it is a window Claude Code dropped at its reset:
 *   1. the usage API's five_hour: null says Ultra, a window says not (evidence.usageNone);
 *   2. else limits.json's flag, when 1.2.1 or later set it (savedNoFiveHour);
 *   3. else a reply from Claude asked for after the saved window's reset, or, with no window saved, after
 *      noFiveHourSince, with five_hour still missing, says Ultra: that request went out in the new window, its answer
 *      brought the limits, and it had no 5-hour window. A reply asked for before the reset that ends after it (a reply
 *      still streaming at the reset) says nothing: its headers were the old window's.
 * Otherwise the 5-hour is drawn from what is saved: a window past its reset is refilled (0% used, no clock, not ~, as
 * Claude Code itself says it ended by dropping it), one before its reset is last known (~), and with none saved it is
 * unknown, and noFiveHourSince starts. A payload without that shape keeps the 1.1.0 rules, with the trusted flag only.
 */
export function resolveLimits(p: Payload, acct: string, now: number, persist: boolean, evidence: Evidence = {}): Limits {
  const { h5, week } = liveLimits(p);
  const path = join(acct, 'limits.json');
  const old = readJson<LimitsFile>(path);
  const prev = old && old.v === 1 ? old : null;
  const saved5 = prev?.five_hour ?? null;
  const trusted = savedNoFiveHour(prev);
  const sinceSaved = typeof prev?.noFiveHourSince === 'number' && Number.isFinite(prev.noFiveHourSince) ? prev.noFiveHourSince : null;
  let h5None = false, refilled = false, since: number | null = null;
  if (h5) {
    // a live five_hour: the 1.1.0 rules, and it clears the flag
  } else if (noFiveHour(p)) {
    const word = evidence.usageNone?.() ?? null;
    const reset = saved5?.resets_at ?? null;
    if (word !== null) {
      h5None = word;
      refilled = !word && reset !== null && reset <= now;
    } else if (trusted) {
      h5None = true;
    } else if (reset !== null && reset > now) {
      // the saved window has not reset: another session's, or this one's before a plan change; drawn last known
    } else {
      const after = reset ?? sinceSaved;
      const asked = after !== null ? (evidence.askedAt?.() ?? null) : null;
      h5None = after !== null && asked !== null && asked > after;
      refilled = !h5None && reset !== null;
      if (!h5None && reset === null) since = after ?? now;
    }
  } else {
    h5None = trusted;
    if (!trusted && !saved5) since = sinceSaved;
  }
  const noneAt = h5None ? (trusted ? prev!.fiveHourNoneAt! : now) : null;
  const next: LimitsFile = {
    v: 1,
    five_hour: h5None ? null : newer(saved5, h5),
    seven_day: newer(prev?.seven_day ?? null, week),
    at: now,
    ...(noneAt !== null ? { fiveHourNone: true as const, fiveHourNoneAt: noneAt } : {}),
    ...(since !== null && !h5 ? { noFiveHourSince: since } : {}),
  };
  const marks = (f: LimitsFile | null): string => JSON.stringify([f?.fiveHourNone === true, f?.fiveHourNoneAt ?? null, f?.noFiveHourSince ?? null]);
  const changed = !prev || !same(prev.five_hour, next.five_hour) || !same(prev.seven_day, next.seven_day) || marks(prev) !== marks(next);
  if (persist && (h5 || week) && changed) {
    try { writeJson(path, next); } catch { /* a read-only cache dir only costs the fallback */ }
  }
  return {
    h5: h5 ? view(h5, true, now) : h5None ? null : refilled ? { pct: 0, left: null, dim: false } : view(saved5, false, now),
    week: week ? view(week, true, now) : view(prev?.seven_day ?? null, false, now),
    h5None,
  };
}

/**
 * Hungry (1.1.0): a drawn limit has 10% left or less, or none. The usage refresher then asks every ttlSeconds even
 * while extra usage is off (usage/file.ts usageTtl).
 */
export const hungry = (l: Pick<Limits, 'h5' | 'week'>): boolean => [l.h5, l.week].some((v) => v !== null && v.pct >= 90);
