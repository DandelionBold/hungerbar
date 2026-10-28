// Test only, never bundled: the round-6 judge's history cache (Hungerbar's per-session cache of git history, the spec's
// CACHE UPDATE), the oracle for src/hud/history.ts. Everything below the loader is copied verbatim from the judge's
// r6lib.mjs (see SOURCES.json): branchOf, cleanHist, isCommitSubject, reflogEntry, cacheStep, commitsOf and
// framesWithHist with the constants they use. Left out: oldestOnDisk (it runs git; cacheStep reads a missing
// git.oldest as now) and the git and book options (hud4.js has them itself now).
// The loader is r6lib's own: the vendored hud4.js through vm, with one extra key `_r6` in its returned object that
// hands out the engine's helpers these functions call.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
const CODE = readFileSync(path.join(HERE, 'hud4.js'), 'utf8');
const MARK = '  return {\n    concepts: [';
if (CODE.split(MARK).length !== 2) throw new Error('hud4.js: return block not found exactly once');
const NAMES = ['num', 'whole', 'tidy', 'fromState'];
const ctx = {};
const X = vm.runInNewContext(CODE.replace(MARK, `  return {\n    _r6: { ${NAMES.join(', ')} },\n    concepts: [`) + ';HUD4', ctx);
if (Object.keys(ctx).length) throw new Error('globals leaked: ' + Object.keys(ctx));
const { num, whole, tidy, fromState } = X._r6;
export const SESSION = vm.runInNewContext(readFileSync(path.join(HERE, 'hud4-session.js'), 'utf8') + ';SESSION', {});

// ---------- verbatim from r6lib.mjs lines 65-128 ----------
// =====================================================================================
// HISTORY: state.hist, filled by Hungerbar from its per-session cache (see round6-spec.json history)
// =====================================================================================
export const BUCKET = 900, NB = 8;                                        // 15-minute buckets, 8 of them (2 hours)
const time = (v, lo, hi) => { const n = num(v); return n === undefined ? null : Math.min(hi, Math.max(lo, n)); };
// A saved branch (lastCommit.branch, the cache's branch) is only compared with fromState's branch, never printed, and
// Hungerbar saves fromState's branch as it is, so a string is read as saved: tidying it again could cut it again (tidy is
// not idempotent on a cut it made, '…' + a 256-code-point last name). A string longer than 4096 UTF-16 code units matches
// no branch (a saved one is about 260 code points at most, so only a damaged cache holds a longer one); a number (a
// hand-made cache) is tidied like fromState's branch; anything else matches no branch.
export const BRANCH_MAX = 4096;
export const branchOf = (v) => (typeof v === 'string' ? (v.length > BRANCH_MAX ? null : v)
  : typeof v === 'number' && Number.isFinite(v) ? tidy(v, true, -256) || 'HEAD' : null);
export const MS_ABOVE = 1e11;                                             // a now above it is in milliseconds (year 5138 in s)
export function cleanHist(h0) {
  if (h0 === null || typeof h0 !== 'object' || Array.isArray(h0)) return null;
  const raw = num(h0.now);
  if (raw === undefined || raw < 0) return null;                            // no clock: no history at all
  const div = raw > MS_ABOVE ? 1000 : 1;                                    // milliseconds: every time / 1000
  const sec = (v) => { const n = num(v); return n === undefined ? undefined : n / div; };
  const now = Math.min(1e13, raw / div);
  const lc = h0.lastCommit !== null && typeof h0.lastCommit === 'object' && !Array.isArray(h0.lastCommit) ? h0.lastCommit : null;
  const at0 = lc ? sec(lc.at) : undefined;                                  // a commit 'in the future' (the clock went back
  const at = at0 === undefined || at0 > now ? null : Math.max(0, at0);       // further than the cache update saw) is no commit
  const I0 = Math.floor(now / BUCKET), buckets = new Map();
  if (Array.isArray(h0.buckets)) for (const b of h0.buckets.slice(-64)) {  // a huge array costs nothing: its last 64 only
    if (!Array.isArray(b)) continue;
    const k0 = num(b[0]);
    if (k0 === undefined || Math.floor(k0) !== k0) continue;
    const k = div === 1 ? k0 : Math.floor(k0 / div);                        // milliseconds: the quarter hour of floor(k0 / 1000)
    if (k > I0 || k <= I0 - NB) continue;
    buckets.set(k, [k, whole(b[1]), whole(b[2]), whole(b[3]), b[4] === 1 || b[4] === true ? 1 : 0]);
  }
  return {
    now,
    sessionStart: time(sec(h0.sessionStart), 0, now),
    dirtySince: time(sec(h0.dirtySince), 0, now),
    commits: whole(h0.commits),
    lastCommit: at === null ? null : { at, add: whole(lc.add), del: whole(lc.del), branch: branchOf(lc.branch) },
    buckets: [...buckets.values()].sort((a, b) => a[0] - b[0]),
  };
}
// Hungerbar's cache update, once per render before drawing (also how session4.js frames get their hist).
// git = { head, reflog, stat, oldest }; any of them throwing is git failing:
//   head        the sha of HEAD (git rev-parse HEAD; null outside a repo, before the first commit or when git fails)
//   reflog(from, to)  the HEAD reflog lines newer than the newest one that set HEAD to `from` (git reflog --format=%H%x09%gs
//               HEAD, newest first: the sha HEAD moved to, a tab, the subject), asked only when HEAD moved on the same
//               branch; null when git fails. A line with no tab is a subject alone: the sha it moved to is unknown (H for
//               the newest line).
//   stat(from, to)  [insertions, deletions] of git diff --shortstat <from> <to>, asked once for every commit line: from =
//               the sha of the next older line (the HEAD that commit moved from; the cached head for the oldest line read),
//               to = the commit line's own sha; a pull, rebase or merge line is never asked. [0, 0] when git fails or a
//               sha is unknown.
//   oldest()    the oldest modification time of the paths of the diff Hungerbar counts its + and - from (git diff HEAD
//               --name-only -z, --cached on an unborn branch: oldestOnDisk below; never an untracked file or folder; a
//               rename's new path; deleted and unreadable paths skipped), asked only to start a dirtySince; not a finite
//               number when git or stat fails or no path can be read.
export const isCommitSubject = (s) => typeof s === 'string' && s.startsWith('commit');   // commit:, commit (amend): ...
// one line of git reflog --format=%H%x09%gs: { sha (null when unknown), subject (null for a line that is not a string) }
export function reflogEntry(line) {
  if (typeof line !== 'string') return { sha: null, subject: null };
  const t = line.indexOf('\t');
  return t < 0 ? { sha: null, subject: line } : { sha: line.slice(0, t) || null, subject: line.slice(t + 1) };
}

// ---------- verbatim from r6lib.mjs lines 145-218 ----------
export function cacheStep(cache, state, now, git = {}) {
  const sit = fromState(state), g = sit.git;
  const B = g ? g.branch : null, add = g ? g.add : 0, del = g ? g.rem : 0, T = add + del;
  const H = g && typeof git.head === 'string' && git.head ? git.head : null;
  const old = cleanHist(cache);                                             // a corrupt cache is read like a corrupt hist
  const started = !old;                                                     // (1) this render starts the cache
  const c = old
    ? { ...old, branch: typeof cache.branch === 'string' ? branchOf(cache.branch) : cache.branch === null ? null : undefined,
      head: typeof cache.head === 'string' && cache.head ? cache.head : null, add: whole(cache.add), del: whole(cache.del) }
    : { now, sessionStart: now, branch: undefined, head: null, add: 0, del: 0, dirtySince: null, commits: 0, lastCommit: null, buckets: [] };
  if (old && now < old.now) {                                               // (1b) the clock went back: every age stays continuous
    const d = now - old.now, back = (t) => (t === null ? null : Math.max(0, t + d));
    c.sessionStart = back(c.sessionStart);
    c.dirtySince = back(c.dirtySince);
    if (c.lastCommit) c.lastCommit = { ...c.lastCommit, at: back(c.lastCommit.at) };
  }
  const out = { ...c, lastCommit: c.lastCommit && { ...c.lastCommit }, buckets: c.buckets.map((b) => b.slice()) };
  const same = B !== null && B === c.branch, prevT = c.add + c.del;
  // (2) commits: HEAD moved on the same branch and the reflog in between has 'commit...' entries (a pull, reset, rebase,
  // merge or checkout moves HEAD without one; a stash, a discard, a branch switch or a first render never is one). Each is
  // one commit, and it saved the diff from the HEAD it moved from (the next older line, or the cached head) to its own sha,
  // so a pull --rebase or a second commit inside the same refresh never lands in another commit's counts.
  const moved = same && H !== null && c.head !== null && H !== c.head;
  const ask = (fn, ...args) => { try { return typeof fn === 'function' ? fn(...args) : undefined; } catch { return undefined; } };   // git failing
  const log = moved ? ask(git.reflog, c.head, H) : null;
  const lines = moved && Array.isArray(log) ? log.map(reflogEntry) : [];
  const commitLines = lines.map((e, i) => (isCommitSubject(e.subject) ? i : -1)).filter((i) => i >= 0);
  const commit = commitLines.length > 0;
  if (commit) {
    const shaOf = (i) => (i >= lines.length ? c.head : lines[i].sha || (i === 0 ? H : null));   // the HEAD line i moved to
    let sa = 0, sd = 0;
    for (const i of commitLines) {
      const from = shaOf(i + 1), to = shaOf(i);
      const st = from !== null && to !== null ? ask(git.stat, from, to) : undefined, [a, d] = Array.isArray(st) ? st : [0, 0];
      sa += whole(a); sd += whole(d);
    }
    out.commits = whole(c.commits + commitLines.length);
    out.lastCommit = { at: now, add: whole(sa), del: whole(sd), branch: B };
  }
  // (3) the oldest change on disk starts the clock when the cache starts with changes, or when the clock was lost
  const disk = () => { const t = num(ask(git.oldest)); return t === undefined ? now : Math.min(now, Math.max(0, t)); };   // any error: now
  out.dirtySince = T === 0 ? null : same && prevT > 0 && !commit ? (c.dirtySince !== null ? c.dirtySince : disk()) : started ? disk() : now;
  if (g) {
    const idx = Math.floor(now / BUCKET), last = out.buckets[out.buckets.length - 1];
    if (last && last[0] === idx) {
      if (T > last[1]) { last[1] = T; last[2] = add; last[3] = del; }
      if (commit) last[4] = 1;
    } else out.buckets.push([idx, T, add, del, commit ? 1 : 0]);
    out.buckets = out.buckets.filter((b) => b[0] > idx - NB && b[0] <= idx);   // the last two hours (a clock that went back drops the rest)
  }
  Object.assign(out, { now, branch: B, head: H, add, del });
  const hist = { now, sessionStart: out.sessionStart, dirtySince: out.dirtySince, commits: out.commits,
    lastCommit: out.lastCommit && { ...out.lastCommit }, buckets: out.buckets.map((b) => b.slice()) };
  return [out, hist];
}
// The time-lapse's commits, from its chat: every 'Commit before the break: +a -d saved' moves HEAD (the switch to
// feature/hotbar keeps it). HEAD at time t is 'c' + the number of commits made by then; commit k (1-based) is the reflog
// line 'ck<TAB>commit: Commit before the break', and git diff --shortstat c(k-1) ck is its own counts.
export function commitsOf(events = SESSION.events) {
  return events.map((e) => [e.t, /^Commit before the break: \+(\d+) -(\d+) saved/.exec(e.text)]).filter(([, m]) => m)
    .map(([t, m]) => ({ t, add: +m[1], del: +m[2] }));
}
export function framesWithHist(frames = SESSION.frames, step = SESSION.STEP, events = SESSION.events) {
  const commits = commitsOf(events);
  const stat = (from, to) => commits.slice(+from.slice(1), +to.slice(1)).reduce(([a, d], c) => [a + c.add, d + c.del], [0, 0]);
  const reflog = (from, to) => commits.slice(+from.slice(1), +to.slice(1)).map((_, k) => `c${+from.slice(1) + k + 1}\tcommit: Commit before the break`).reverse();
  let cache = null;
  return frames.map((f, i) => {
    const now = i * step, head = 'c' + commits.filter((c) => c.t <= now).length;
    const [c, hist] = cacheStep(cache, f, now, { head, stat, reflog });
    cache = c;
    return { ...f, hist };
  });
}
