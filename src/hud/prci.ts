// The HUD's pull request and CI badge (SPEC §0.9, 0.7.0): the 'prci-compact' pick from design round 8
// (test/reference/round8/prci.json), drawn after the branch on the hotbar line by the git state's layer (gitstate.ts),
// which makes room for it. Two spaces, then:
//   - open: `#` grey and the number white, a space, the CI mark (gold ● running, green bold ✓ passed, red bold × failed;
//     none when the PR has no checks), then at most one more mark: grey ◌ draft (its `#` dark grey and its number grey),
//     red bold ‼ a conflict with the base branch, yellow bold ± changes requested, green bold ✓ approved (✓✓ with passed
//     checks: ready to merge);
//   - merged: `#123` bold and ` merged` in purple; closed: `#123 closed` in dark grey;
//   - no PR (or the option off, or no answer yet): nothing, so the line is the git state's alone.
import type { PrInfo } from '../pr/gh.ts';
import { GOLD, GREEN, PURPLE, RED, YELLOW } from './gitstate.ts';
import { DGREY, GREY, WHITE } from './mix.ts';
import { S, type Span } from './spans.ts';

/** The CI mark. */
function ciMark(ci: PrInfo['ci']): Span[] {
  if (ci === 'running') return [S('●', GOLD)];
  if (ci === 'passed') return [S('✓', GREEN, null, true)];
  if (ci === 'failed') return [S('×', RED, null, true)];
  return [];
}

/** The one mark after it: draft, else a conflict, else the review. */
function flag(pr: PrInfo): Span[] {
  if (pr.state === 'draft') return [S('◌', GREY)];
  if (pr.conflict) return [S('‼', RED, null, true)];
  if (pr.review === 'changes') return [S('±', YELLOW, null, true)];
  if (pr.review === 'approved') return [S('✓', GREEN, null, true)];
  return [];
}

/** The badge's spans, led by its two spaces; none without a PR. */
export function prBadge(pr: PrInfo | null): Span[] {
  if (!pr) return [];
  const n = String(pr.n);
  if (pr.state === 'merged') return [S('  '), S('#' + n, PURPLE, null, true), S(' merged', PURPLE)];
  if (pr.state === 'closed') return [S('  '), S(`#${n} closed`, DGREY)];
  const draft = pr.state === 'draft';
  const marks = [...ciMark(pr.ci), ...flag(pr)];
  return [S('  '), S('#', draft ? DGREY : GREY), S(n, draft ? GREY : WHITE), ...(marks.length ? [S(' '), ...marks] : [])];
}
