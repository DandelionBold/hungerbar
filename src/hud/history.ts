// The HUD's git-terrain history (plan §6): the per-session, per-repo file that remembers the last two hours in
// quarter-hour buckets, and the gold column a commit leaves. The render steps it once per HUD render, in-process, from
// the bytes git appended to `<gitDir>/logs/HEAD` since the last render: no git process, no refs or packed-refs read.
//   stepHistory   the step itself, pure apart from the LogSource it is handed (an in-memory one in the tests)
//   fileLog       the LogSource over the real logs/HEAD: one stat, then positioned reads of at most 64 KiB + 1 or 4 KiB
//   diskHistory   reads the saved file, steps it and pushes the write (only when something changed) onto the render's
//                 `after` list, which runs after stdout
// Bounds per render: 1 stat, 1 read of the ~300-byte file, at most 64 KiB + 1 bytes of reflog (only when it grew on the
// same branch) and then at most 4 KiB to re-anchor, at most one small write after stdout, 0 processes.
// Deliberate deviations from the spec's CACHE UPDATE (test/reference/hud4-cache.mjs cacheStep), each pinned by
// hud.history.test.ts: a `commit (merge):` line is no commit (round-6 issue 3); only the appended window is read, so a
// shrunk log, an append over 64 KiB, a window that does not continue from the saved line and a repo switch see no
// commit (issues 1, 2 and the unbounded read); an unborn repo's first commit is seen through the empty-log anchor
// (issue 5). A log emptied by reflog expire or gc keeps its saved head, so the first commit after it is seen, as in
// cacheStep. The buckets themselves follow cacheStep exactly.
import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gitKey, normRoot } from '../git/cache.ts';
import type { Repo } from '../git/head.ts';
import { fnv1a, readJson, writeJson } from '../store.ts';
import { QUARTER, QUARTERS, readHist, type Bucket, type Hist } from './input.ts';

/** The most appended reflog bytes a render reads as a window; a bigger append re-anchors instead. */
export const WINDOW_MAX = 64 * 1024;
/** The most a re-anchor reads: the end of logs/HEAD. */
export const TAIL_MAX = 4 * 1024;

/** Where the history stands in logs/HEAD: the end of the last complete line read, and that line's new sha ('' when none). */
export interface LogAnchor { size: number; head: string }
/** The saved file, `<cacheDir>/hud/<sid>.<gitKey(root)>.json` (about 300 bytes). */
export interface HistFile {
  v: 1;
  /** normRoot(repo.root): the form gitKey hashes. */
  root: string;
  /** fromState's branch at the last step. */
  branch: string;
  log: LogAnchor;
  buckets: Bucket[];
  /** The now of the last write (the saved buckets are read as readHist reads them at this now). */
  at: number;
  /**
   * When the session began, as the design's cache keeps it (hud4.js: "else the cache's first render"): the now of the
   * step that created the file, then kept. A file written before 0.7.0 has none, and keeps none.
   */
  sessionStart?: number;
}
/** One reflog line: `<old> <new> <name> <<email>> <time> <tz>\t<subject>` (git leaves the tab out with no subject). */
export interface LogLine { old: string; new: string; subject: string }
/** logs/HEAD as stepHistory sees it. */
export interface LogSource {
  /** Its size in bytes; 0 when it is missing. */
  readonly size: number;
  /** Bytes [from, to), fewer when the file shrank meanwhile; null when it cannot be read. */
  read(from: number, to: number): Buffer | null;
}
export interface StepIn {
  now: number;
  /** normRoot(repo.root). */
  root: string;
  /** B, add and del: the port's own fromState reading of this render's state (git.branch, git.add, git.rem). */
  branch: string;
  add: number;
  del: number;
}
export interface StepOut {
  /** The file as it stands after this step. */
  next: HistFile;
  /** state.hist for the engine. */
  hist: Hist;
  /** Root, branch, log or buckets differ from the saved file (its `at` is ignored), so it is worth writing. */
  changed: boolean;
  /** A commit was seen in the appended window: the current quarter turns gold. */
  commit: boolean;
}

const SID = /^[\w-]{1,80}$/;
/** The session key: session_id when it is safe in a file name, else fnv1a(transcript_path); null with neither (no history). */
export function histSid(sessionId: string | null, transcriptPath: string | null): string | null {
  return sessionId && SID.test(sessionId) ? sessionId : transcriptPath ? fnv1a(transcriptPath) : null;
}

export const histPath = (cacheDir: string, sid: string, root: string): string => join(cacheDir, 'hud', `${sid}.${gitKey(root)}.json`);

const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const LINE = /^([0-9a-f]{40}(?:[0-9a-f]{24})?) ([0-9a-f]{40}(?:[0-9a-f]{24})?) [^\t]* \d+ [+-]\d{4}(?:\t([^\n]*))?$/;

/** One reflog line (without its \n); null when it is not one. */
export function parseLine(s: string): LogLine | null {
  const m = LINE.exec(s);
  return m ? { old: m[1]!, new: m[2]!, subject: m[3] ?? '' } : null;
}

/** Complete reflog lines joined by \n (the last one's \n left out); null when any of them is not a reflog line. */
export function parseLines(text: string): LogLine[] | null {
  const out: LogLine[] = [];
  for (const s of text.split('\n')) {
    const l = parseLine(s);
    if (!l) return null;
    out.push(l);
  }
  return out;
}

/** The saved file as stepHistory may use it, its buckets cleaned by readHist at its own `at`; null for anything else. */
function savedOf(v: unknown, root: string): (HistFile & { clean: Bucket[] }) | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const s = v as Record<string, unknown>, log = s.log as Record<string, unknown> | null | undefined;
  if (s.v !== 1 || s.root !== root || typeof s.branch !== 'string' || !Array.isArray(s.buckets)) return null;
  if (log === null || typeof log !== 'object' || Array.isArray(log)) return null;
  const { size, head } = log;
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0) return null;
  if (typeof head !== 'string' || (head !== '' && !SHA.test(head))) return null;
  const h = readHist({ now: s.at, buckets: s.buckets });   // a missing or negative `at` is a corrupt file
  if (!h) return null;
  // a session start that is no whole number from 0 to `at` is unknown: the file stays usable without it
  const start = typeof s.sessionStart === 'number' && Number.isSafeInteger(s.sessionStart) && s.sessionStart >= 0 && s.sessionStart <= h.now ? s.sessionStart : undefined;
  return { v: 1, root, branch: s.branch, log: { size, head }, buckets: s.buckets as Bucket[], at: h.now, ...(start !== undefined ? { sessionStart: start } : {}), clean: h.buckets };
}

/** The complete lines appended after `size`; null when they cannot be used (re-anchor). */
function readWindow(log: LogSource, size: number, end: number): { lines: LogLine[]; end: number } | null {
  // one byte before the saved end: the \n that ended the saved line, a cheap check that the file was not rewritten
  const buf = log.read(size > 0 ? size - 1 : 0, end);
  if (!buf) return null;
  if (size > 0 && buf[0] !== 0x0a) return null;
  const body = size > 0 ? buf.subarray(1) : buf;
  const e = body.lastIndexOf(0x0a);
  if (e < 0) return null;                                  // no complete line yet
  const lines = parseLines(body.subarray(0, e).toString('utf8'));
  return lines ? { lines, end: size + e + 1 } : null;
}

/**
 * The end of logs/HEAD, from at most its last 4 KiB: the end of the last complete line and that line's new sha. With no
 * complete line in the file, {0, ''}. When the sha cannot be known (an unreadable file, no \n in the last 4 KiB, a last
 * line that starts before them or does not parse), the head is '': no window continues from it, since a window's first
 * line must start with the saved head (the empty-log rule needs size 0, which only a file with no complete line gives).
 */
function readAnchor(log: LogSource): LogAnchor {
  const S = log.size;
  if (S <= 0) return { size: 0, head: '' };
  const from = Math.max(0, S - TAIL_MAX), buf = log.read(from, S);
  if (!buf) return { size: S, head: '' };
  const e = buf.lastIndexOf(0x0a);
  if (e < 0) return { size: from === 0 ? 0 : S, head: '' };
  const p = e > 0 ? buf.lastIndexOf(0x0a, e - 1) : -1;
  if (p < 0 && from > 0) return { size: from + e + 1, head: '' };
  return { size: from + e + 1, head: parseLine(buf.subarray(p + 1, e).toString('utf8'))?.new ?? '' };
}

/**
 * A window continues from the saved anchor when its first line moved HEAD from the saved head, or, for a log that held
 * no complete line, from the all-zero sha (an unborn repo: logs/HEAD did not exist before its first commit). A log that
 * was emptied (reflog expire, gc) keeps the head it had, so the first commit after it continues from that head.
 */
export function validWindow(saved: LogAnchor, lines: readonly LogLine[]): boolean {
  const first = lines[0];
  return first !== undefined && (first.old === saved.head || (saved.size === 0 && /^0+$/.test(first.old)));
}

/**
 * The spec's commit rule inside the window: HEAD ended somewhere else than the saved head, and after the last line that
 * set HEAD to the saved head some subject starts with `commit` but not `commit (merge)` (a conflicted merge concluded by
 * git commit draws like a clean merge: no gold). Amend and empty commits count.
 */
export function commitSeen(head: string, lines: readonly LogLine[]): boolean {
  const last = lines[lines.length - 1];
  if (!last || last.new === head) return false;
  let from = 0;
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i]!.new === head) { from = i + 1; break; }
  return lines.slice(from).some((l) => l.subject.startsWith('commit') && !l.subject.startsWith('commit (merge)'));
}

/**
 * One history step (plan §6 step 5). `saved` is the file as read (anything: a wrong v, another root or a corrupt file is
 * no file). The window is read only when the saved file is on this branch and 0 < size - saved size <= 64 KiB; every
 * other case (first render, branch switch, shrunk log, a bigger append, an unusable window) re-anchors and sees no
 * commit, and a log that did not grow keeps its anchor; an emptied log on the same branch keeps the saved head with size
 * 0, so the next commit continues from it. Buckets (cacheStep's step 4, verbatim semantics): T = add + del;
 * the current quarter's bucket keeps its biggest T with that T's add and del, and turns gold on a commit; a new quarter
 * appends one; only the last 8 quarters (I - 8 < index <= I) stay.
 */
export function stepHistory(saved: unknown, x: StepIn, log: LogSource): StepOut {
  const prev = savedOf(saved, x.root);
  let anchor: LogAnchor | null = null, commit = false;
  if (prev && prev.branch === x.branch) {
    const grew = log.size - prev.log.size;
    if (grew === 0) anchor = prev.log;
    else if (grew > 0 && grew <= WINDOW_MAX) {
      const w = readWindow(log, prev.log.size, log.size);
      if (w && validWindow(prev.log, w.lines)) {
        commit = commitSeen(prev.log.head, w.lines);
        anchor = { size: w.end, head: w.lines[w.lines.length - 1]!.new };
      }
    }
  }
  anchor ??= readAnchor(log);
  // an emptied log (reflog expire --expire=now, a gc expiring every entry) leaves HEAD where it was: the first commit
  // after it is `<saved head> <new>`, so the empty anchor keeps the saved head on the same branch to continue from
  if (anchor.size === 0 && prev && prev.branch === x.branch) anchor = { size: 0, head: prev.log.head };

  const T = x.add + x.del, I = Math.floor(x.now / QUARTER);
  let buckets: Bucket[] = prev ? prev.clean.map((b) => [...b] as Bucket) : [];
  const last = buckets[buckets.length - 1];
  if (last && last[0] === I) {
    if (T > last[1]) { last[1] = T; last[2] = x.add; last[3] = x.del; }
    if (commit) last[4] = 1;
  } else buckets.push([I, T, x.add, x.del, commit ? 1 : 0]);
  buckets = buckets.filter((b) => b[0] > I - QUARTERS && b[0] <= I);

  // the session began at the step that created the file (a first render, or one after a corrupt file or a repo switch);
  // a saved file keeps its own (none when it was written before 0.7.0), however the clock moves
  const start = prev ? prev.sessionStart : x.now;
  const next: HistFile = {
    v: 1, root: x.root, branch: x.branch, log: { size: anchor.size, head: anchor.head }, buckets, at: x.now, ...(start !== undefined ? { sessionStart: start } : {}),
  };
  const key = (f: { root: unknown; branch: unknown; log: { size: unknown; head: unknown }; buckets: unknown }): string =>
    JSON.stringify([f.root, f.branch, f.log.size, f.log.head, f.buckets]);
  const raw = saved as HistFile;
  const changed = !prev || key(next) !== key({ root: raw.root, branch: raw.branch, log: raw.log, buckets: raw.buckets });
  const hist: Hist = { now: x.now, sessionStart: start ?? null, dirtySince: null, commits: 0, lastCommit: null, buckets: buckets.map((b) => [...b] as Bucket) };
  return { next, hist, changed, commit };
}

/** logs/HEAD on disk: stat now, open on the first read, close() when done. A failed stat throws (diskHistory: no history). */
export function fileLog(path: string): LogSource & { close(): void } {
  const size = statSync(path, { throwIfNoEntry: false })?.size ?? 0;
  let fd: number | undefined;
  return {
    size,
    read(from: number, to: number): Buffer | null {
      try {
        fd ??= openSync(path, 'r');
        const buf = Buffer.allocUnsafe(Math.max(0, to - from));
        let n = 0;
        while (n < buf.length) {
          const k = readSync(fd, buf, n, buf.length - n, from + n);
          if (k === 0) break;
          n += k;
        }
        return buf.subarray(0, n);
      } catch {
        return null;
      }
    },
    close(): void {
      if (fd !== undefined) try { closeSync(fd); } catch { /* already closed */ }
    },
  };
}

export interface DiskHistory {
  cacheDir: string;
  sid: string | null;
  repo: Repo | undefined;
  branch: string | null;
  add: number;
  del: number;
  now: number;
  /** The render's hooks that run after stdout: the write goes here. */
  after: Array<() => void>;
  /** false (preview, --payload, doctor): read, never write. */
  persist: boolean;
  /** Test hook: how logs/HEAD is opened (the bounded-read tests count the bytes). */
  open?: (path: string) => LogSource & { close(): void };
}

/**
 * This render's history (plan §6): null outside a repo or with no session key. The changed file is written by a hook on
 * `after`, so the write never delays the line; a render killed before it loses only that write, and the next render
 * reads the same appended window again.
 */
export function diskHistory(o: DiskHistory): Hist | null {
  if (!o.repo || o.branch === null || !o.sid) return null;
  const root = normRoot(o.repo.root), path = histPath(o.cacheDir, o.sid, o.repo.root);
  let r: StepOut;
  try {
    const log = (o.open ?? fileLog)(join(o.repo.gitDir, 'logs', 'HEAD'));
    try {
      r = stepHistory(readJson<unknown>(path), { now: o.now, root, branch: o.branch, add: o.add, del: o.del }, log);
    } finally {
      log.close();
    }
  } catch {
    return null;
  }
  if (r.changed && o.persist) {
    const next = r.next;
    o.after.push(() => {
      try { writeJson(path, next); } catch { /* the next render tries again */ }
    });
  }
  return r.hist;
}
