// The agents at work (SPEC §0.12, 1.1.0): Kamal's pick from design round 9b, 'agents-bees'
// (test/reference/round9/agents-bees.json), and round 9's 'agents-allays' (agents-allays.json) as the calm option, a
// layer after the offhand and before the frame. Claude Code's subagents and workflow agents each keep writing their own
// agent-<id>.jsonl in the session's subagents folder; one whose file was written in the last 60 s is at work. With
// hud.agents bees or allays, line 1's sky after the cache readout shows one for each, from col 82, 4 cells apart, up to
// four, then a bold count of the rest (+2); with none at work nothing is drawn, whether Ultracode is on or not.
//   - bees: a hive ▤ (#F0B43C on #6E4B1F) at col 80, and each bee two cells of yellow (#F8C94A, the background) with a
//     brown (#3A2E16) right half block ▐ in each, so the body is yellow, stripe, yellow, stripe, then a light wing
//     (#E6F2FF) raised behind it, or level on every other bee: flying left, home to the hive. The count is the bees' yellow.
//   - allays: Minecraft's friendly blue allay, three sextant cells facing left: a light head (#D9F4FF), the body and a
//     raised wing (#7FD3FF), level on every other allay. The count is the allays' blue.
// The phantoms keep the sky between the held item's name and the air bubbles (cols 23-41): the two never meet.
// The data is the transcript worker's (src/transcript.ts): its last look at the subagents folder, the newest agent
// files' mtimes, read here against now (agentMarks), and Ultracode's last signal, which neither look draws. The render
// reads no folder; a look that is due queues the worker (Sources.agents).
// The layer reads only what the engine drew: line 1 is the fourth line from the bottom (the boss bar, when drawn, sits
// above it), and the flock is drawn only where all its cells and the cell before them are empty sky (unstyled spaces, or
// past the line's end, which it pads with spaces); anything else there and the sky is left as it is.
import type { Config } from '../config.ts';
import { merge, S, splitAt, W, type Span } from './spans.ts';

/** The bees' yellow and brown stripes, their wing, the hive's ink and wood. */
export const BEE = '#F8C94A', STRIPE = '#3A2E16', BEE_WING = '#E6F2FF', HIVE_INK = '#F0B43C', HIVE_WOOD = '#6E4B1F';
/** The allay's light head and its blue. */
export const ALLAY_HEAD = '#D9F4FF', ALLAY = '#7FD3FF';
/** The hive, at HIVE_COL. */
export const HIVE: Span = S('▤', HIVE_INK, HIVE_WOOD);
/** The bee's stripe (a right half block on the yellow cell), its wing raised and level (block sextants). */
export const BEE_BODY = '▐', WING_UP = '\u{1FB02}', WING_LEVEL = '\u{1FB0B}';
/** The allay's head, body and raised wing (its level wing is WING_LEVEL). */
export const ALLAY_CELLS = ['\u{1FB0E}', '\u{1FB39}', '\u{1FB06}'] as const;
/** Where the hive is, where the first one flies, how far apart they fly, how many are drawn before the count. */
export const HIVE_COL = 80, SKY0 = 82, PITCH = 4, CAP = 4;
/** An agent file written this many seconds before (or after) now or less is an agent at work. */
export const LIVE_SECS = 60;

/** What the HUD path reads for the agents (Sources.agents): Ultracode's last signal and the newest agent files' mtimes, in seconds. */
export interface AgentsSeen { ultra: boolean; mtimes: readonly number[] }

/** What the layer draws: the HUD path builds it with agentMarks(). */
export interface AgentMarks {
  /** hud.agents: the look, null with off. */
  look: 'bees' | 'allays' | null;
  /** The agents at work: agent files written at most LIVE_SECS seconds from now. */
  live: number;
  /** Ultracode is on (its last signal in the transcript); neither look draws it. */
  ultra: boolean;
}

/** Nothing to draw: the engine's lines as they are. */
export const NO_AGENTS: AgentMarks = { look: null, live: 0, ultra: false };

/** The agents at work at `now`: the mtimes at most LIVE_SECS seconds from it, either way. */
export const liveAgents = (mtimes: readonly number[], now: number): number => mtimes.filter((m) => Math.abs(now - m) <= LIVE_SECS).length;

/**
 * What the layer draws this render, from hud.agents and what the HUD path read (`seen`: null without a transcript or a
 * look): with off nothing (and nothing was read), else the look, the agents at work at `now` and Ultracode's signal.
 */
export function agentMarks(now: number, hud: Pick<Config['hud'], 'agents'>, seen: AgentsSeen | null): AgentMarks {
  if (hud.agents === 'off') return NO_AGENTS;
  return { look: hud.agents, live: seen ? liveAgents(seen.mtimes, now) : 0, ultra: seen?.ultra ?? false };
}

/** The i-th bee (0 first): its stripes and its wing, raised on the even ones, level on the odd. */
const bee = (i: number): Span[] => [S(BEE_BODY + BEE_BODY, STRIPE, BEE), S(i % 2 ? WING_LEVEL : WING_UP, BEE_WING)];
/** The i-th allay: its head, its body, its wing raised or level. */
const allay = (i: number): Span[] => [S(ALLAY_CELLS[0], ALLAY_HEAD), S(ALLAY_CELLS[1], ALLAY), S(i % 2 ? WING_LEVEL : ALLAY_CELLS[2], ALLAY)];

/** The flock for `live` agents in a look, each as [first column, its spans]: the bees' hive first, then up to CAP, then the count. */
export function flock(look: 'bees' | 'allays', live: number): Array<[number, Span[]]> {
  if (live <= 0) return [];
  const one = look === 'bees' ? bee : allay;
  const out: Array<[number, Span[]]> = look === 'bees' ? [[HIVE_COL, [HIVE]]] : [];
  for (let i = 0; i < Math.min(live, CAP); i++) out.push([SKY0 + PITCH * i, one(i)]);
  if (live > CAP) out.push([SKY0 + PITCH * CAP, [S(`+${live - CAP}`, look === 'bees' ? BEE : ALLAY, null, true)]]);
  return out;
}

/** Cells [from, to) of a line are empty sky: unstyled spaces, or past its end. */
function sky(line: readonly Span[], from: number, to: number): boolean {
  const [, rest] = splitAt(line, from);
  const [mid] = splitAt(rest, to - from);
  return mid.every((s) => /^ +$/.test(s.t) && !s.fg && !s.bg && !s.bold);
}

/**
 * The HUD's lines (the engine's with the layers before this one: line 1 is the fourth from the bottom) with the agents
 * the marks ask for in line 1's sky. The input is not changed.
 */
export function agentsHud(lines: readonly (readonly Span[])[], m: AgentMarks): Span[][] {
  const out = lines.map((l) => [...l]);
  const at = out.length - 4, birds = m.look ? flock(m.look, m.live) : [];
  if (at < 0 || !birds.length) return out;
  const line = out[at]!, from = birds[0]![0], [lastCol, lastSpans] = birds[birds.length - 1]!, to = lastCol + W(lastSpans);
  if (!sky(line, from - 1, to)) return out;
  let drawn: Span[] = W(line) < to ? [...line, S(' '.repeat(to - W(line)))] : line;
  for (const [col, spans] of birds) {
    const [head, rest] = splitAt(drawn, col);
    drawn = [...head, ...spans, ...splitAt(rest, W(spans))[1]];
  }
  out[at] = merge(drawn);
  return out;
}
