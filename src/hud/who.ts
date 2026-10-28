// Who runs the session, on line 3's folder field (SPEC §0.9, 0.7.0): the 'user-grey' pick from design round 8 for
// the name and both operator looks, 'op-tag' and 'op-name' (test/reference/round8/identity.json), a layer after
// the engine like the git state (gitstate.ts). It reads only what the engine drew: line 3 (the one above the hotbar line)
// ends in the folder, one grey span '⌂ ' + the path, and the layer redraws that span; every other cell and line stays.
//   - The name (hud.user): 'steve: ' (user) or 'steve@DESKTOP: ' (user@host) between ⌂ and the path, all in the folder's
//     grey, like a Minecraft chat line: '⌂ steve: D:/webapp'.
//   - The operator, only while Claude Code runs elevated (hud.op): 'tag' puts a bold red '[OP]' and a space before the
//     name (after ⌂ with the name off: '⌂ [OP] D:/webapp'); 'gold' draws the name in bold gold (the ⌂ in gold with the
//     name off), as Minecraft servers often colour operators.
//   - Fit: line 3 stays within 110 cells. The path is cut from the front with the engine's tailPath, as the engine cuts
//     it, but keeps at least MIN_PATH cells (all of a shorter one); until it does, the rest gives way, least important
//     first: '@host', then the name, then the [OP] tag. With all three gone the span is the engine's own.
//   - Nothing to draw (no name, not elevated), or no folder on line 3 (the engine draws none without a cwd): the lines
//     come back as the engine drew them.
import { GREY, MAXW } from './mix.ts';
import { merge, S, W, type Span } from './spans.ts';
import { tailPath } from './text.ts';
import { cellWidth } from './wt.ts';

/** The operator's red (§c) and gold (§6), and the folder's mark as the engine draws it (mix.ts f2Line3). */
export const OP_RED = '#FF5555', OP_GOLD = '#FFAA00', HOME = '⌂ ';
/** The fewest cells a cut path keeps before the name and the tag give way (a shorter path keeps all of its own). */
export const MIN_PATH = 10;

/** What the layer draws: the HUD path builds it from hud.user, hud.op and the WhoSource. */
export interface WhoMarks {
  /** The user name (hud.user user or user@host), else null. */
  user: string | null;
  /** The host name (hud.user user@host), else null. */
  host: string | null;
  /** The operator's look while Claude Code runs elevated (hud.op tag or gold), else null. */
  op: 'tag' | 'gold' | null;
}

export const NO_WHO: WhoMarks = { user: null, host: null, op: null };

/** The index of line 3's folder span (its last: '⌂ ' + the path, grey and plain), or -1 when it has none. */
export function folderAt(line: readonly Span[]): number {
  const k = line.length - 1, s = line[k];
  return s && s.t.startsWith(HOME) && s.fg === GREY && !s.bg && !s.bold ? k : -1;
}

/** The parts after ⌂ that `keep` still shows: the tag, the name, the host. */
interface Keep { tag: boolean; name: boolean; host: boolean }

/** The spans between ⌂ and the path. */
function parts(m: WhoMarks, k: Keep): Span[] {
  const out: Span[] = [];
  if (m.op === 'tag' && k.tag) out.push(S('[OP]', OP_RED, null, true), S(' '));
  if (m.user && k.name) {
    out.push(m.op === 'gold' ? S(m.user, OP_GOLD, null, true) : S(m.user, GREY));
    if (m.host && k.host) out.push(S('@' + m.host, GREY));
    out.push(S(': ', GREY));
  }
  return out;
}

/** The order in which the parts give way, least important first. */
const GIVE: ReadonlyArray<keyof Keep> = ['host', 'name', 'tag'];

/**
 * The HUD's lines (the engine's: the last is the hotbar line, line 3 the one above it) with the name and the operator's
 * mark drawn in line 3's folder. `cwd` is the engine's own reading of the folder (fromState's), whole. The input is not
 * changed.
 */
export function whoHud(lines: readonly (readonly Span[])[], m: WhoMarks, cwd: string): Span[][] {
  const out = lines.map((l) => [...l]);
  const n = out.length, l3 = out[n - 2];
  const k = l3 ? folderAt(l3) : -1;
  if ((!m.user && !m.op) || k < 0) return out;
  const head = l3!.slice(0, k), room = MAXW - W(head) - cellWidth(HOME);
  const keep: Keep = { tag: true, name: true, host: true };
  let mid = parts(m, keep);
  for (const g of GIVE) {
    if (room - W(mid) >= Math.min(cellWidth(cwd), MIN_PATH)) break;
    keep[g] = false;
    mid = parts(m, keep);
  }
  // the gold look with no name shown turns the ⌂ itself gold
  const home = m.op === 'gold' && !(m.user && keep.name) ? S(HOME, OP_GOLD) : S(HOME, GREY);
  out[n - 2] = merge([...head, home, ...mid, S(tailPath(cwd, room - W(mid)), GREY)]);
  return out;
}
