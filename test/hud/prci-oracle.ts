// The HUD's pull request badge (SPEC §0.9, 0.7.0), written for the tests and independent of src/hud/prci.ts, from
// the pick in design round 8 (test/reference/round8/prci.json, the 'prci-compact' option of the design's build.cjs:
// compact(), flag(), CIMARK and numSpans, restated). gitOracle (gitstate-oracle.ts) puts it after the git state's marks.
// One rule the design has no situation for: a PR with no checks has no CI mark, and a lone number has no space after it.
import type { RefSpan } from './ref.ts';

/** A pull request, as the tests hand it (the shape of src/pr/gh.ts PrInfo, restated here). */
export interface OraclePr {
  n: number;
  state: 'open' | 'draft' | 'merged' | 'closed';
  ci: 'running' | 'passed' | 'failed' | null;
  review: 'approved' | 'changes' | null;
  conflict: boolean;
}

const WHITE = '#FFFFFF', GREY = '#AAAAAA', DGREY = '#555555', GREEN = '#55FF55', RED = '#FF5555', GOLD = '#FFAA00', YELLOW = '#FFFF55', ENCH = '#FF55FF';
const S = (t: string, fg?: string, bold?: boolean): RefSpan => {
  const s: RefSpan = { t };
  if (fg) s.fg = fg;
  if (bold) s.bold = true;
  return s;
};

/** build.cjs flag(): the one extra mark after the CI state. */
function flag(pr: OraclePr): RefSpan | null {
  if (pr.state === 'draft') return S('◌', GREY);
  if (pr.conflict) return S('‼', RED, true);
  if (pr.review === 'changes') return S('±', YELLOW, true);
  if (pr.review === 'approved') return S('✓', GREEN, true);
  return null;
}
const CIMARK = { running: S('●', GOLD), passed: S('✓', GREEN, true), failed: S('×', RED, true) };

/** build.cjs compact(): the badge's spans, led by two spaces; none without a PR. */
export function badgeOracle(pr: OraclePr | null): RefSpan[] {
  if (!pr) return [];
  if (pr.state === 'merged') return [S('  '), S('#' + pr.n, ENCH, true), S(' merged', ENCH)];
  if (pr.state === 'closed') return [S('  '), S('#' + pr.n + ' closed', DGREY)];
  const f = flag(pr);
  const marks = [...(pr.ci ? [CIMARK[pr.ci]] : []), ...(f ? [f] : [])];
  const num = [S('#', pr.state === 'draft' ? DGREY : GREY), S(String(pr.n), pr.state === 'draft' ? GREY : WHITE)];
  return [S('  '), ...num, ...(marks.length ? [S(' '), ...marks] : [])];
}
