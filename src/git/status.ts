// The HUD's git state (SPEC §0.9, 0.7.0): what one background `git status --porcelain=v2 --branch` says, counted, and
// what the git dir's own files say is in progress, read in the render with no process.
//   - The status runs in the git refresher (refresh.ts), next to the diff, only for the HUD, and lands in the same cache
//     entry as `st`. Its output is counted as it streams in, so a huge tree costs no memory: `1` and `2` entries are
//     changed files (staged or not, renames included), `u` entries are conflicts, `?` entries are untracked (as git
//     status lists them: a new folder counts once, and status.showUntrackedFiles=no shows none), and `# branch.ab +A -B`
//     is the upstream's ahead and behind (absent with no upstream).
//   - In progress (readOp): a rebase (rebase-merge/, or rebase-apply/ unless it is `git am`), with its step from
//     msgnum/end or next/last and the branch it rebases from head-name; else a merge (MERGE_HEAD); else a cherry-pick
//     (CHERRY_PICK_HEAD). The order is git-prompt.sh's. They live in the per-worktree git dir.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** What `git status --porcelain=v2 --branch` counted; ahead and behind are null with no upstream. */
export interface GitStatus {
  changed: number;
  untracked: number;
  conflicts: number;
  ahead: number | null;
  behind: number | null;
}

/** The refresher's status command (after `--no-optional-locks -C <root>`, like the diff's). */
export function statusArgs(root: string): string[] {
  return ['--no-optional-locks', '-C', root, 'status', '--porcelain=v2', '--branch'];
}

/** A line is classified by its first characters only; the rest of a long line is never kept. */
const HEAD = 64;

/** A streaming counter: feed it stdout as it comes, then read the counts with done(). */
export function statusCounter(): { feed(chunk: string): void; done(): GitStatus } {
  const st: GitStatus = { changed: 0, untracked: 0, conflicts: 0, ahead: null, behind: null };
  let line = '';
  const end = (): void => {
    const ab = /^# branch\.ab \+(\d+) -(\d+)\r?$/.exec(line);
    if (ab) {
      st.ahead = Number(ab[1]);
      st.behind = Number(ab[2]);
    } else if (line.startsWith('1 ') || line.startsWith('2 ')) st.changed++;
    else if (line.startsWith('u ')) st.conflicts++;
    else if (line.startsWith('? ')) st.untracked++;
    line = '';
  };
  return {
    feed(chunk: string): void {
      for (let i = 0; i < chunk.length; ) {
        const nl = chunk.indexOf('\n', i), stop = nl < 0 ? chunk.length : nl;
        if (line.length < HEAD) line += chunk.slice(i, Math.min(stop, i + HEAD - line.length));
        if (nl < 0) return;
        end();
        i = nl + 1;
      }
    },
    done(): GitStatus {
      if (line) end();
      return { ...st };
    },
  };
}

/** The counts of a whole status output (the tests and the inline `sync` mode). */
export function parseStatus(out: string): GitStatus {
  const c = statusCounter();
  c.feed(out);
  return c.done();
}

const count = (v: unknown): boolean => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/** A cache entry's `st` as read back: the counts when every field is sound, else null. */
export function readStatus(v: unknown): GitStatus | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const ab = (x: unknown): boolean => x === null || count(x);
  if (!count(o.changed) || !count(o.untracked) || !count(o.conflicts) || !ab(o.ahead) || !ab(o.behind)) return null;
  return { changed: o.changed as number, untracked: o.untracked as number, conflicts: o.conflicts as number, ahead: o.ahead as number | null, behind: o.behind as number | null };
}

/** What git is in the middle of: a rebase (step of total, when its files say), a merge or a cherry-pick. */
export interface GitOp {
  kind: 'rebase' | 'merge' | 'pick';
  step: number | null;
  total: number | null;
  /** The branch a rebase works on (rebase's head-name, without refs/heads/), null when it is a detached HEAD or unknown. */
  head: string | null;
}

function text(p: string): string | null {
  try {
    const st = statSync(p, { throwIfNoEntry: false });
    return st && st.isFile() && st.size <= 4096 ? readFileSync(p, 'utf8') : null;
  } catch {
    return null;
  }
}
const isDir = (p: string): boolean => statSync(p, { throwIfNoEntry: false })?.isDirectory() ?? false;
const isFile = (p: string): boolean => statSync(p, { throwIfNoEntry: false })?.isFile() ?? false;
/** A whole number written by git (`2\n`), else null. */
function int(p: string): number | null {
  const m = /^\s*(\d{1,9})\s*$/.exec(text(p) ?? '');
  return m ? Number(m[1]) : null;
}
/** rebase's head-name: `refs/heads/main` is main; `detached HEAD` (a rebase of a detached HEAD) and anything else, null. */
function headName(p: string): string | null {
  const m = /^refs\/heads\/(\S.*?)\s*$/.exec(text(p) ?? '');
  return m ? m[1]! : null;
}

/**
 * What is in progress in this worktree, from its git dir's files, or null: 4 stats when nothing is, a few more and at most
 * 3 small reads (4 KiB each) during a rebase, no process. A step and total are kept only when both read as whole numbers.
 */
export function readOp(gitDir: string): GitOp | null {
  const step = (a: string, b: string, dir: string): Pick<GitOp, 'step' | 'total'> => {
    const s = int(join(dir, a)), t = int(join(dir, b));
    return s !== null && t !== null ? { step: s, total: t } : { step: null, total: null };
  };
  const rm = join(gitDir, 'rebase-merge');
  if (isDir(rm)) return { kind: 'rebase', ...step('msgnum', 'end', rm), head: headName(join(rm, 'head-name')) };
  const ra = join(gitDir, 'rebase-apply');
  if (isDir(ra)) {
    if (isFile(join(ra, 'applying'))) return null;                    // git am: not a rebase
    return { kind: 'rebase', ...step('next', 'last', ra), head: headName(join(ra, 'head-name')) };
  }
  if (isFile(join(gitDir, 'MERGE_HEAD'))) return { kind: 'merge', step: null, total: null, head: null };
  if (isFile(join(gitDir, 'CHERRY_PICK_HEAD'))) return { kind: 'pick', step: null, total: null, head: null };
  return null;
}
