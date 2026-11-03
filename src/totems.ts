// The totems (SPEC §0.13, 1.2.0): the limit resets Anthropic gave you, which you declare in hungerbar.json's `totems`
// key (`hungerbar totem` writes it, src/cli/totem.ts). Claude Code does not pass them to status lines, and the usage
// endpoint refuses Hungerbar's surface, so the declaration is the only source. Everything here is pure but the forget:
//   parseTotems   the strict reading of a `totems` value: what is kept, and how many entries were ignored
//   held          what is held at `now`: the sum of n over the grants not expired, the windows they refill, the
//                 soonest end and whether it is the last day; an expired grant is none, and nothing is written
//   parseWhen     the command's --until: a date (its end, local time), a local date-time, an instant, or +<n>d / +<n>h
//   setTotems, addTotem, useTotem, prune: the command's list operations; serialize: the grants as the file keeps them
//   forgetWindows totem use: limits.json's last-known windows a used reset refilled become null (src/limits.ts' file)
// The render reads `totems` only through merge() (src/config.ts) and never writes it; with no totem held nothing about
// it changes a byte of any render.
import { join } from 'node:path';
import { readJson, writeJson } from './store.ts';
import type { LimitsFile } from './limits.ts';
import { sanitize } from './sanitize.ts';

/** What a reset refills: full (the 5-hour window, the week and Fable's weekly), 5h, week or fable (Fable's weekly). */
export const TOTEM_KINDS = ['full', '5h', 'week', 'fable'] as const;
export type TotemKind = (typeof TOTEM_KINDS)[number];

/** At most this many entries of `totems` are read; n is 1 to 99; a label is at most 80 characters. */
export const MAX_GRANTS = 16, MAX_N = 99, LABEL_CAP = 80;
/** --until is refused this far ahead and more. */
export const MAX_AHEAD_DAYS = 400;
const DAY = 86400;

/** One grant: n resets of one kind, with its expiry (epoch seconds, or null: none known). */
export interface TotemGrant {
  n: number;
  kind: TotemKind;
  until: number | null;
  /** When it was declared (epoch seconds), or null when the file does not say. */
  at: number | null;
  label: string | null;
}

/** The windows a reset can refill. */
export interface Refills { h5: boolean; week: boolean; fable: boolean }

const REFILLS: Record<TotemKind, Refills> = {
  full: { h5: true, week: true, fable: true },
  '5h': { h5: true, week: false, fable: false },
  week: { h5: false, week: true, fable: false },
  fable: { h5: false, week: false, fable: true },
};
export const refillsOf = (k: TotemKind): Refills => ({ ...REFILLS[k] });

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
/** A date-time Date.parse reads, as epoch seconds; null for anything else. */
const time = (v: unknown): number | null => {
  if (typeof v !== 'string') return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
};

/** One entry, or null when it is not one: an object, a whole n from 1 to 99, a known kind (absent: full), a readable until (or none). */
export function parseGrant(v: unknown): TotemGrant | null {
  if (!isObj(v)) return null;
  const n = v.n;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > MAX_N) return null;
  const kind = v.kind === undefined ? 'full' : v.kind;
  if (typeof kind !== 'string' || !(TOTEM_KINDS as readonly string[]).includes(kind)) return null;
  let until: number | null = null;
  if (v.until !== undefined) {
    until = time(v.until);
    if (until === null) return null;
  }
  const label = typeof v.label === 'string' ? sanitize(v.label, LABEL_CAP).trim() : '';
  return { n, kind: kind as TotemKind, until, at: time(v.at), label: label || null };
}

/**
 * The `totems` value as merge() reads it: anything but an array is no totems; at most the first 16 entries are read,
 * each kept only when it is one (parseGrant). `ignored` counts the entries read and not kept and those past the 16th.
 */
export function parseTotems(raw: unknown): { grants: TotemGrant[]; ignored: number } {
  if (!Array.isArray(raw)) return { grants: [], ignored: 0 };
  const grants = raw.slice(0, MAX_GRANTS).map(parseGrant).filter((g): g is TotemGrant => g !== null);
  return { grants, ignored: raw.length - grants.length };
}

/** A grant is held until its until; at or after it, it counts as none. */
export const live = (g: TotemGrant, now: number): boolean => g.until === null || g.until > now;

/** What is held at `now`. */
export interface Held {
  /** The grants not expired, in the file's order. */
  grants: TotemGrant[];
  /** The sum of their n: how many resets are held (the HUD draws one totem for any count of 1 or more). */
  count: number;
  /** The windows some held grant refills. */
  refills: Refills;
  /** The soonest until among them, or null when none has one. */
  soonest: number | null;
  /** The soonest until is less than 24 h away. */
  lastDay: boolean;
  /** Grants in the list whose until has passed (ignored; the next write removes them). */
  expired: number;
}

export function held(grants: readonly TotemGrant[], now: number): Held {
  const kept = grants.filter((g) => live(g, now));
  const refills: Refills = { h5: false, week: false, fable: false };
  for (const g of kept) for (const w of ['h5', 'week', 'fable'] as const) refills[w] ||= REFILLS[g.kind][w];
  const ends = kept.flatMap((g) => (g.until === null ? [] : [g.until]));
  const soonest = ends.length ? Math.min(...ends) : null;
  return {
    grants: kept, count: kept.reduce((s, g) => s + g.n, 0), refills, soonest,
    lastDay: soonest !== null && soonest - now < DAY, expired: grants.length - kept.length,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// time: --until and how the command prints a moment
// ---------------------------------------------------------------------------------------------------------------------

const p2 = (n: number): string => String(n).padStart(2, '0');

/** A moment in local time, `YYYY-MM-DD HH:MM` (never a locale's month names). */
export function localStamp(sec: number): string {
  const d = new Date(sec * 1000);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** A moment as the file keeps it: ISO 8601 in UTC, to the second (`2026-12-01T21:59:59Z`). */
export const isoUtc = (sec: number): string => new Date(sec * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** How far ahead: `in 28 days`, `in 5 hours`, `in 12 minutes`, `in 1 minute`. */
export function inWords(sec: number): string {
  const unit = (n: number, w: string): string => `in ${n} ${w}${n === 1 ? '' : 's'}`;
  if (sec >= 2 * DAY) return unit(Math.floor(sec / DAY), 'day');
  if (sec >= 2 * 3600) return unit(Math.floor(sec / 3600), 'hour');
  return unit(Math.max(1, Math.floor(sec / 60)), 'minute');
}

/**
 * The shortest --until that gives `sec` back: the date alone when it is the end of a local day (23:59:59), else the
 * instant in UTC.
 */
export function whenArg(sec: number): string {
  const d = new Date(sec * 1000);
  return d.getHours() === 23 && d.getMinutes() === 59 && d.getSeconds() === 59
    ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
    : isoUtc(sec);
}

export type When = { ok: true; at: number } | { ok: false; error: string };

const WHEN = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * --until: `YYYY-MM-DD` (the end of that day, 23:59:59 local time), `YYYY-MM-DDTHH:MM[:SS]` (local), the same with `Z`
 * or `±HH:MM` (that instant), or `+<n>d` / `+<n>h` (from now). Refused: a form it does not know, a date or time that
 * does not exist (2026-02-30, 24:00, a local time a clock change skips), a time at or before now, more than 400 days
 * ahead.
 */
export function parseWhen(s: string, now: number): When {
  let at: number;
  const rel = /^\+(\d{1,5})([dh])$/.exec(s);
  const m = WHEN.exec(s);
  if (rel) at = now + Number(rel[1]) * (rel[2] === 'd' ? DAY : 3600);
  else if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dateOnly = m[4] === undefined;
    const [h, mi, se] = dateOnly ? [23, 59, 59] : [Number(m[4]), Number(m[5]), Number(m[6] ?? 0)];
    const zone = m[7];
    if (h > 23 || mi > 59 || se > 59) return { ok: false, error: `${s} is not a time` };
    if (zone !== undefined) {
      const off = zone === 'Z' ? 0 : (zone[0] === '-' ? -1 : 1) * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6)));
      if (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4, 6)) > 59)) return { ok: false, error: `${s} has no such offset` };
      const ms = Date.UTC(y, mo - 1, d, h, mi, se);
      const u = new Date(ms);
      if (u.getUTCFullYear() !== y || u.getUTCMonth() !== mo - 1 || u.getUTCDate() !== d) return { ok: false, error: `${s} is not a date` };
      at = ms / 1000 - off * 60;
    } else {
      const l = new Date(y, mo - 1, d, h, mi, se);
      if (l.getFullYear() !== y || l.getMonth() !== mo - 1 || l.getDate() !== d) return { ok: false, error: `${s} is not a date` };
      if (l.getHours() !== h || l.getMinutes() !== mi) return { ok: false, error: `${s} does not exist in local time (a clock change skips it)` };
      at = Math.floor(l.getTime() / 1000);
    }
  } else return { ok: false, error: `${JSON.stringify(s)} is not a date: use YYYY-MM-DD, YYYY-MM-DDTHH:MM (local), with Z or ±HH:MM, or +<n>d / +<n>h` };
  if (at <= now) return { ok: false, error: `${s} is past (${localStamp(at)})` };
  if (at - now > MAX_AHEAD_DAYS * DAY) return { ok: false, error: `${s} is more than ${MAX_AHEAD_DAYS} days ahead` };
  return { ok: true, at };
}

// ---------------------------------------------------------------------------------------------------------------------
// the list operations
// ---------------------------------------------------------------------------------------------------------------------

/** What a new grant is: its kind, its expiry and its label. */
export interface Spec { kind: TotemKind; until: number | null; label: string | null }

/** Every write drops the grants that expired or reached 0. */
export const prune = (grants: readonly TotemGrant[], now: number): TotemGrant[] => grants.filter((g) => g.n > 0 && live(g, now));

const sameGrant = (g: TotemGrant, n: number, s: Spec): boolean => g.n === n && g.kind === s.kind && g.until === s.until && g.label === s.label;

/**
 * `hungerbar totem <n>`: you hold exactly n of this spec, which replaces every grant; 0 clears. The same single grant
 * already held is kept as it is (its `at` too), so the command changes nothing.
 */
export function setTotems(grants: readonly TotemGrant[], n: number, s: Spec, now: number): TotemGrant[] {
  if (n === 0) return [];
  const kept = prune(grants, now);
  if (kept.length === 1 && sameGrant(kept[0]!, n, s)) return kept;
  return [{ n, kind: s.kind, until: s.until, at: now, label: s.label }];
}

/** `hungerbar totem add [<n>]`: one more grant of n, with its own expiry. */
export const addTotem = (grants: readonly TotemGrant[], n: number, s: Spec, now: number): TotemGrant[] =>
  [...prune(grants, now), { n, kind: s.kind, until: s.until, at: now, label: s.label }];

/**
 * `hungerbar totem use [--kind k]`: the held grant (of that kind) that expires first loses one; one with no expiry
 * comes after every dated one, and the file's order breaks a tie. null when none (of that kind) is held.
 */
export function useTotem(grants: readonly TotemGrant[], kind: TotemKind | null, now: number): { next: TotemGrant[]; used: TotemGrant } | null {
  const kept = prune(grants, now);
  let pick = -1;
  kept.forEach((g, i) => {
    if (kind !== null && g.kind !== kind) return;
    const end = g.until ?? Infinity, best = pick < 0 ? Infinity : kept[pick]!.until ?? Infinity;
    if (pick < 0 || end < best) pick = i;
  });
  if (pick < 0) return null;
  const used = kept[pick]!;
  return { next: prune(kept.map((g, i) => (i === pick ? { ...g, n: g.n - 1 } : g)), now), used };
}

/** The grants as the file keeps them: n, kind, until and at as ISO 8601 in UTC, label; an absent value is left out. */
export function serialize(grants: readonly TotemGrant[]): Obj[] {
  return grants.map((g) => ({
    n: g.n, kind: g.kind,
    ...(g.until !== null ? { until: isoUtc(g.until) } : {}),
    ...(g.at !== null ? { at: isoUtc(g.at) } : {}),
    ...(g.label !== null ? { label: g.label } : {}),
  }));
}

// ---------------------------------------------------------------------------------------------------------------------
// words
// ---------------------------------------------------------------------------------------------------------------------

const KIND_NAME: Record<TotemKind, string> = { full: 'full reset', '5h': '5-hour reset', week: 'weekly reset', fable: 'Fable reset' };
const KIND_WINDOWS: Record<TotemKind, string> = {
  full: "the 5-hour window, the week and Fable's weekly", '5h': 'the 5-hour window', week: 'the week', fable: "Fable's weekly",
};

/** Claude Code's name for a kind: `full reset`, `5-hour reset`, `weekly reset`, `Fable reset`. */
export const kindName = (k: TotemKind): string => KIND_NAME[k];
/** `a full reset (the 5-hour window, the week and Fable's weekly)`. */
export const kindWords = (k: TotemKind): string => `a ${KIND_NAME[k]} (${KIND_WINDOWS[k]})`;

/** `1 limit reset`, `3 limit resets`. */
export const resets = (n: number): string => `${n} limit reset${n === 1 ? '' : 's'}`;

/** A grant's expiry: `use by 2026-12-01 23:59 (in 28 days)`, or `no expiry known`. */
export const expiry = (g: TotemGrant, now: number): string => (g.until === null ? 'no expiry known' : `use by ${localStamp(g.until)} (${inWords(g.until - now)})`);

/** A grant's label, as the command prints it: `, labelled "Opus 5.5 launch"`, or nothing. */
export const labelled = (g: TotemGrant): string => (g.label ? `, labelled "${g.label}"` : '');

/** One grant in a line: `2 × a full reset (…), use by … (in 28 days), labelled "Opus 5.5 launch"`. */
export const grantLine = (g: TotemGrant, now: number): string => `${g.n} × ${kindWords(g.kind)}, ${expiry(g, now)}${labelled(g)}`;

/**
 * What is held, in brief, for look's and doctor's line: `a full reset, use by 2026-12-01 23:59` for one grant of 1, else
 * the kinds' counts and the soonest end: `2 full, 1 weekly; the first use by 2026-12-01 23:59`.
 */
export function heldBrief(h: Held): string {
  const by = h.soonest === null ? 'no expiry known' : `use by ${localStamp(h.soonest)}`;
  if (h.grants.length === 1 && h.count === 1) return `a ${KIND_NAME[h.grants[0]!.kind]}, ${by}`;
  const counts = TOTEM_KINDS.flatMap((k) => {
    const n = h.grants.filter((g) => g.kind === k).reduce((s, g) => s + g.n, 0);
    return n ? [`${n} ${KIND_NAME[k].replace(' reset', '')}`] : [];
  });
  return `${counts.join(', ')}; ${h.soonest === null ? 'no expiry known' : `the first ${by}`}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// totem use: limits.json forgets the windows it refilled
// ---------------------------------------------------------------------------------------------------------------------

/**
 * The windows a used reset of this kind refilled that `<acct>/limits.json` still keeps a last-known use for: five_hour,
 * seven_day or both, in the file's names; none when the file is not there or they are null already. Fable's weekly
 * lives in usage.json and is left to the refresher.
 */
export function forgettable(acct: string, kind: TotemKind): Array<'five_hour' | 'seven_day'> {
  const r = REFILLS[kind];
  const f = readJson<LimitsFile>(join(acct, 'limits.json'));
  if (!f || f.v !== 1) return [];
  return ([['five_hour', r.h5], ['seven_day', r.week]] as const).flatMap(([k, on]) => (on && f[k] !== null && f[k] !== undefined ? [k] : []));
}

/**
 * `totem use`: sets the forgettable windows to null in `<acct>/limits.json`, an atomic rewrite only when there is one;
 * the fiveHourNone flag and `at` are kept. The next live render writes the fresh value, and until then a render without
 * live limits draws `?`, not the old use. The windows forgotten.
 */
export function forgetWindows(acct: string, kind: TotemKind): Array<'five_hour' | 'seven_day'> {
  const gone = forgettable(acct, kind);
  if (!gone.length) return [];
  const path = join(acct, 'limits.json');
  writeJson(path, { ...readJson<LimitsFile>(path), ...Object.fromEntries(gone.map((k) => [k, null])) });
  return gone;
}

/** The windows, in words: `the 5-hour window and the week`. */
export const windowWords = (ws: ReadonlyArray<'five_hour' | 'seven_day'>): string => ws.map((k) => (k === 'five_hour' ? 'the 5-hour window' : 'the week')).join(' and ');
