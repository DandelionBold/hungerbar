// The shown-file (SPEC §0.13, 1.2.0; version 2): the totem's memory, `<cacheDir>/hud/<sid>.shown.json` (about 100 bytes),
// one per session. It keeps what the HUD drew at its last render: the lit icons (0-10, the engine's icons10) of the
// 5-hour window and the week while live, and of Fable's weekly while Fable is in use and usage.json is at most 900 s old,
// and until when the totem pops. The pop is the one thing the HUD cannot see in a single render: a window a held limit
// reset refills that was above 0 at the last render and is at 0 now is the call seen live, and the totem pops for 30 s
// (round 10's call-pop-gold; the gold sides stay after it while the window is at 0).
//   stepShown  the step itself, pure: the saved file (anything) and this render's values in, the next file out
//   diskShown  reads the saved file, steps it and pushes the write (only when something changed) onto the render's
//              `after` list, which runs after stdout, as the HUD's history file does (src/hud/history.ts)
// The HUD path steps it only with hud.totem on, a limit reset held and a session key (src/hud/history.ts histSid);
// preview, the demos and any render with persist false never read or write it. A saved file whose clock is ahead of now
// (the clock went back) is no file, and so is 1.1.0's version 1 (it kept the credits, which nothing reads since 1.2.0).
// pruneOld's 7-day sweep of hud/ removes old ones with the history files.
import { join } from 'node:path';
import { readJson, writeJson } from './store.ts';
import type { Refills } from './totems.ts';

/** How long the totem pops, in seconds. */
export const POP_SECS = 30;

/** What this render drew, as the shown-file keeps it (src/hud/totem.ts shownNow builds it). */
export interface ShownNow {
  /** The 5-hour's lit hearts, 0-10, when the limit is live; null when it is unknown or last-known. */
  h5: number | null;
  /** The week's drumsticks, 0-10, when the limit is live; null when it is unknown or last-known. */
  week: number | null;
  /** Fable's weekly, 0-10, while Fable is in use and usage.json is at most 900 s old; null otherwise. */
  fable: number | null;
  /** The windows the held limit resets refill (src/totems.ts held): the pop is theirs only. */
  refills: Refills;
}

/** The saved file (version 2: every field is required; absent is not null). */
export interface ShownFile {
  v: 2;
  /** The now of the step that wrote it. */
  at: number;
  h5: number | null;
  week: number | null;
  fable: number | null;
  /** pop: the second the pop ends (0: none yet); it shows while now is before it. */
  until: { pop: number };
}

export const shownPath = (cacheDir: string, sid: string): string => join(cacheDir, 'hud', `${sid}.shown.json`);

/** A lit-icon count as the file keeps it: null, or a whole number from 0 to 10. */
const icons = (v: unknown): v is number | null => v === null || (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 10);
/** A time as the file keeps it: a finite number from 0. */
const time = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/**
 * The saved file as the step may use it, or null for anything else: a v other than 2 (1.1.0's v1 is no file), a field
 * missing or of the wrong kind, a clock ahead of now (prev.at > now: the clock went back), a pop that ends more than 30 s
 * after its own write.
 */
export function savedShown(v: unknown, now: number): ShownFile | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const s = v as Record<string, unknown>, u = s.until as Record<string, unknown> | null | undefined;
  if (s.v !== 2 || !time(s.at) || s.at > now || !icons(s.h5) || !icons(s.week) || !icons(s.fable)) return null;
  if (u === null || typeof u !== 'object' || Array.isArray(u) || !time(u.pop) || u.pop > s.at + POP_SECS) return null;
  return { v: 2, at: s.at, h5: s.h5, week: s.week, fable: s.fable, until: { pop: u.pop } };
}

export interface ShownStep {
  /** The file as it stands after this step. */
  next: ShownFile;
  /** h5, week, fable or until.pop differ from the saved file (its `at` is ignored), so it is worth writing. */
  changed: boolean;
  /** The pop fired at this step. */
  popped: boolean;
}

/**
 * One step. The pop fires when the saved file had a window a held reset refills at 1 or more lit icons and this render
 * draws it at 0: until.pop becomes now + 30. Otherwise the saved until.pop stays (0 without a saved file). With no saved
 * file, the step is worth writing only when it knows something (a window).
 */
export function stepShown(saved: unknown, now: number, cur: ShownNow): ShownStep {
  const prev = savedShown(saved, now);
  const fell = (was: number | null, is: number | null): boolean => was !== null && was >= 1 && is === 0;
  const r = cur.refills;
  const popped = prev !== null && ((r.h5 && fell(prev.h5, cur.h5)) || (r.week && fell(prev.week, cur.week)) || (r.fable && fell(prev.fable, cur.fable)));
  const pop = popped ? now + POP_SECS : prev ? prev.until.pop : 0;
  const next: ShownFile = { v: 2, at: now, h5: cur.h5, week: cur.week, fable: cur.fable, until: { pop } };
  const key = (f: ShownFile): string => JSON.stringify([f.h5, f.week, f.fable, f.until.pop]);
  const changed = prev ? key(next) !== key(prev) : next.h5 !== null || next.week !== null || next.fable !== null;
  return { next, changed, popped };
}

export interface DiskShown {
  cacheDir: string;
  /** The session key (histSid); null: no file. */
  sid: string | null;
  now: number;
  cur: ShownNow;
  /** The render's hooks that run after stdout: the write goes here. */
  after: Array<() => void>;
  /** false (preview, --payload, doctor): neither read nor written. */
  persist: boolean;
}

/**
 * This render's step: until.pop of the file as it stands after it (0 with no session key or persist false, which read
 * nothing). The changed file is written by a hook on `after`, so the write never delays the line; a render killed
 * before it loses only that write.
 */
export function diskShown(o: DiskShown): number {
  if (!o.persist || !o.sid) return 0;
  const path = shownPath(o.cacheDir, o.sid);
  const r = stepShown(readJson<unknown>(path), o.now, o.cur);
  if (r.changed) {
    const next = r.next;
    o.after.push(() => {
      try { writeJson(path, next); } catch { /* the next render tries again */ }
    });
  }
  return r.next.until.pop;
}
