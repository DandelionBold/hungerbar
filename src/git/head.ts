// .git discovery and HEAD, read straight from disk with no process (SPEC §9).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export interface Repo {
  root: string;
  gitDir: string;
  commonDir: string;
  /** The trimmed HEAD text, used to tell when the diff cache is out of date. */
  head: string;
  /** What to show: the branch, another ref without "refs/", or a 7-character sha. */
  branch: string;
  detached: boolean;
}

const norm = (p: string): string => resolve(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

function readText(p: string): string | null {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function gitDirOf(dir: string): string | null {
  const dotgit = join(dir, '.git');
  const st = statSync(dotgit, { throwIfNoEntry: false });
  if (!st) return null;
  if (st.isDirectory()) return dotgit;
  const m = /^gitdir:\s*(.+?)\s*$/m.exec(readText(dotgit) ?? '');
  if (!m || !m[1]) return null;
  return isAbsolute(m[1]) ? m[1] : resolve(dir, m[1]);
}

/**
 * Walks up from start, at most 40 levels. GIT_CEILING_DIRECTORIES entries are never entered;
 * stopAfter entries (the test FS map) are searched but nothing above them is.
 */
export function findRepo(start: string, ceilings: string[] = [], stopAfter: string[] = []): Repo | null {
  const ceil = new Set(ceilings.filter(Boolean).map(norm));
  const stop = new Set(stopAfter.filter(Boolean).map(norm));
  let dir = resolve(start);
  for (let i = 0; i < 40; i++) {
    if (i > 0 && ceil.has(norm(dir))) return null;
    const gitDir = gitDirOf(dir);
    if (gitDir) return readHead(dir, gitDir);
    const up = dirname(dir);
    if (up === dir || stop.has(norm(dir))) return null;
    dir = up;
  }
  return null;
}

function readHead(root: string, gitDir: string): Repo | null {
  const raw = readText(join(gitDir, 'HEAD'));
  if (raw === null) return null;
  const head = raw.trim();
  const common = readText(join(gitDir, 'commondir'));
  const commonDir = common ? resolve(gitDir, common.trim()) : gitDir;
  let branch: string, detached = false;
  const ref = /^ref:\s*(\S+)$/.exec(head);
  if (ref && ref[1]) branch = ref[1].startsWith('refs/heads/') ? ref[1].slice(11) : ref[1].replace(/^refs\//, '');
  else if (/^[0-9a-f]{40}([0-9a-f]{24})?$/i.test(head)) {
    branch = head.slice(0, 7);
    detached = true;
  } else return null;
  return { root, gitDir, commonDir, head, branch, detached };
}

/** A branch with no commits yet: its ref is in neither refs/heads nor packed-refs. */
export function isUnborn(repo: Repo): boolean {
  const ref = /^ref:\s*(\S+)$/.exec(repo.head)?.[1];
  if (!ref) return false;
  if (existsSync(join(repo.commonDir, ...ref.split('/')))) return false;
  const packed = readText(join(repo.commonDir, 'packed-refs')) ?? '';
  return !packed.split(/\r?\n/).some((l) => l.endsWith(' ' + ref));
}

export function indexMtime(repo: Repo): number | null {
  return statSync(join(repo.gitDir, 'index'), { throwIfNoEntry: false })?.mtimeMs ?? null;
}
