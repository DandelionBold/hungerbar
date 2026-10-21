// The HUD's git state (SPEC §0.9, 0.7.0): the 'colour-marks' pick from design round 8 (test/reference/round8/), a
// layer after the engine like the frame (frame.ts) and the centring (align.ts). It reads only what the engine drew: the
// hotbar line (the engine's last) ends in its readout `⎇ ` (grey) and the branch (white), from col 62 on, and the layer
// redraws from that ⎇ to the end of the line. Everything before it, and every other line, stays as the engine drew it.
//   - ⎇ is coloured by the working tree: green clean, yellow changes, aqua untracked files only, red a conflict; grey
//     (the engine's) while the status is unknown.
//   - The branch by the commits: white, purple while a merge, rebase or cherry-pick is in progress, gold when ahead of or
//     behind its upstream; a detached HEAD is `@` and its short sha in grey. During a rebase the branch is the one being
//     rebased (rebase's head-name), as git's own prompt shows it.
//   - Marks after it, each after a space: purple `merge`, `rebase 2/5` or `pick`, red bold `!N` conflicts, aqua bold
//     `?N` untracked, gold bold `↑N↓M` ahead and behind. Counts are the engine's kilo() (at most 5 characters).
//   - Then the pull request's badge (prci.ts, hud.pr on), when the branch has one: it is always drawn whole, at most
//     19 cells, so the room it takes comes out of the marks and the branch.
//   - Fit: the line stays within 110 cells. The branch is cut from the front with the engine's tailPath, but keeps at
//     least MIN_NAME cells (all of a shorter one); until it does, marks give way, least important first: the untracked
//     count, ahead/behind, the rebase's step, the conflicts, the word in progress. ⎇ sits at col 78 at most, so with the
//     marks gone the branch has 30 cells, 11 next to the widest badge.
//   - With nothing known (no status yet, nothing in progress, not detached) and no badge the lines come back as the
//     engine drew them.
import { CAP, sanitizeTail } from '../sanitize.ts';
import type { GitView } from '../state.ts';
import { GREY, kilo, MAXW, WHITE } from './mix.ts';
import { merge, S, W, type Span } from './spans.ts';
import { tailPath, tidy } from './text.ts';
import { cellWidth } from './wt.ts';

/** Minecraft's chat colours, as the design draws them (§a green, §e yellow, §b aqua, §c red, §d purple, §6 gold). */
export const GREEN = '#55FF55', YELLOW = '#FFFF55', AQUA = '#55FFFF', RED = '#FF5555', PURPLE = '#FF55FF', GOLD = '#FFAA00';
/** The fewest cells a cut branch keeps before marks give way (a shorter branch keeps all of its own). */
export const MIN_NAME = 10;
/** The readout's mark, as the engine draws it (mix.ts spillReadout). */
export const MARK = '⎇ ';

/** What the layer draws from; the HUD path builds it with gitMarks(). */
export interface GitMarks {
  /** The status counts, null while unknown (no entry with them yet, git.mode off, or its git failed). */
  files: { changed: number; untracked: number; conflicts: number } | null;
  /** Commits ahead of and behind the upstream; 0 with none, or while unknown. */
  ahead: number;
  behind: number;
  op: { kind: 'merge' | 'rebase' | 'pick'; step: number | null; total: number | null } | null;
  /** A detached HEAD's short sha, else null. */
  detached: string | null;
  /** The branch to draw instead of the engine's (a rebase's own), else null. */
  name: string | null;
}

/** Nothing known: the engine's lines as they are. */
export const NO_MARKS: GitMarks = { files: null, ahead: 0, behind: 0, op: null, detached: null, name: null };

/**
 * The marks for this render's git view. A rebase that names its branch draws that branch, not detached; otherwise a
 * detached HEAD is detached unless Claude Code named the worktree's branch (it then draws that, as classic does).
 */
export function gitMarks(view: Pick<GitView, 'isRepo' | 'repo' | 'status' | 'op'>, worktreeBranch: boolean): GitMarks {
  if (!view.isRepo) return NO_MARKS;
  const st = view.status ?? null, op = view.op ?? null;
  const name = op && op.kind === 'rebase' && op.head ? sanitizeTail(op.head, CAP.branchFull, '…') : null;
  return {
    files: st ? { changed: st.changed, untracked: st.untracked, conflicts: st.conflicts } : null,
    ahead: st?.ahead ?? 0,
    behind: st?.behind ?? 0,
    op: op ? { kind: op.kind, step: op.step, total: op.total } : null,
    detached: !name && view.repo?.detached && !worktreeBranch ? view.repo.branch : null,
    name,
  };
}

const quiet = (m: GitMarks): boolean => !m.files && !m.ahead && !m.behind && !m.op && !m.detached && !m.name;

/** ⎇'s colour: the working tree. */
export function filesColour(m: GitMarks): string {
  const f = m.files;
  return !f ? GREY : f.conflicts ? RED : f.changed ? YELLOW : f.untracked ? AQUA : GREEN;
}

/** The branch's colour: the commits. */
export function nameColour(m: GitMarks): string {
  return m.detached ? GREY : m.op ? PURPLE : m.ahead || m.behind ? GOLD : WHITE;
}

/** The marks after the branch, in the order they are drawn, each led by a space; `keep` says which still show. */
interface Keep { op: boolean; step: boolean; conflicts: boolean; untracked: boolean; ab: boolean }
function after(m: GitMarks, k: Keep): Span[] {
  const out: Span[] = [];
  const op = m.op;
  if (op && k.op) {
    const step = k.step && op.kind === 'rebase' && op.step !== null && op.total !== null ? ` ${kilo(op.step)}/${kilo(op.total)}` : '';
    out.push(S(' '), S(op.kind + step, PURPLE));
  }
  if (m.files?.conflicts && k.conflicts) out.push(S(' '), S('!' + kilo(m.files.conflicts), RED, null, true));
  if (m.files?.untracked && k.untracked) out.push(S(' '), S('?' + kilo(m.files.untracked), AQUA, null, true));
  if ((m.ahead || m.behind) && k.ab) {
    out.push(S(' '));
    if (m.ahead) out.push(S('↑' + kilo(m.ahead), GOLD, null, true));
    if (m.behind) out.push(S('↓' + kilo(m.behind), GOLD, null, true));
  }
  return out;
}

/** The marks' order of giving way, least important first. */
const GIVE: ReadonlyArray<keyof Keep> = ['untracked', 'ab', 'step', 'conflicts', 'op'];

/**
 * Where the engine's readout starts on the hotbar line: the index of its `⎇ ` span (grey, followed by the white branch
 * as the line's last span), or -1 when the line has none (outside a repo nothing follows the hotbar).
 */
export function readoutAt(line: readonly Span[]): number {
  const k = line.length - 2;
  const mark = line[k], name = line[k + 1];
  if (!mark || !name) return -1;
  const plain = (s: Span, fg: string): boolean => s.fg === fg && !s.bg && !s.bold;
  return mark.t === MARK && plain(mark, GREY) && plain(name, WHITE) ? k : -1;
}

/**
 * The HUD's lines (the engine's: the last is the hotbar line) with the git state drawn from the readout's ⎇ on, and the
 * pull request's `badge` (prci.ts prBadge, led by its own spaces; none by default) after the marks. `branch` is the
 * engine's own reading of the branch (fromState's), whole. The input is not changed.
 */
export function gitHud(lines: readonly (readonly Span[])[], m: GitMarks, branch: string, badge: readonly Span[] = []): Span[][] {
  const out = lines.map((l) => [...l]);
  const n = out.length, hot = out[n - 1];
  const k = hot ? readoutAt(hot) : -1;
  if ((quiet(m) && !badge.length) || k < 0) return out;
  const head = hot!.slice(0, k), col = W(head);
  const text = m.detached ? '@' + m.detached : (m.name !== null && tidy(m.name, true, -256)) || branch;
  const keep: Keep = { op: true, step: true, conflicts: true, untracked: true, ab: true };
  let tail = after(m, keep);
  const room = (): number => MAXW - col - cellWidth(MARK) - W(tail) - W(badge);
  for (const g of GIVE) {
    if (room() >= Math.min(cellWidth(text), MIN_NAME)) break;
    keep[g] = false;
    tail = after(m, keep);
  }
  out[n - 1] = merge([...head, S(MARK, filesColour(m)), S(tailPath(text, room()), nameColour(m)), ...tail, ...badge]);
  return out;
}
