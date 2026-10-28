// The player's layers (SPEC §0.9, 0.7.0): who runs the session (who.ts, line 3), the idle bed (bed.ts, hotbar slot 4)
// and the phantoms of a long session (phantoms.ts, line 1's sky), the picks from design round 8. Each is a layer
// after the engine that draws only in its own cells, so they apply in any order; the HUD path runs them after the git
// state and before the frame. This module also reads, from the payload and the transcript's summary, what they need:
// when the last message was written, whether a tool call is still running, and how long the session has run.
import { num, obj, str, type Payload } from '../payload.ts';
import type { TxSummary } from '../transcript.ts';
import { bedHud, idle } from './bed.ts';
import type { Hist } from './input.ts';
import { phantomHud } from './phantoms.ts';
import type { Span } from './spans.ts';
import { NO_WHO, whoHud, type WhoMarks } from './who.ts';

/** What the player's layers draw: the HUD path builds it from hud.user, hud.op, hud.bed, hud.phantoms and the sources. */
export interface PlayerMarks {
  who: WhoMarks;
  /** Away (hud.bed on): the last message is 5 minutes old or more and no tool call is running. */
  bed: boolean;
  /** The signs of a long session that hold, 0-4 (0 with hud.phantoms off). */
  phantoms: number;
}

/** Nothing to draw: the engine's lines as they are. */
export const NO_PLAYER: PlayerMarks = { who: NO_WHO, bed: false, phantoms: 0 };

/**
 * When the last message was written, in seconds, or null while unknown: the newest of the transcript's last main-chain
 * message (not while its summary is a stale one waiting on the worker) and the prompt cache's last write as stdin gives
 * it (expires_at less its TTL: 3600 s for 1h, else 300 s). The TTL itself never decides: a 1-hour cache that is still
 * warm says only when the last request was.
 */
export function lastMessage(p: Payload, tx: TxSummary | null): number | null {
  const fromTx = tx && !tx.needsWorker ? tx.lastAt : null;
  const pc = obj(p.prompt_cache), exp = num(pc?.expires_at);
  const fromCache = exp === null ? null : exp - (str(pc?.ttl) === '1h' ? 3600 : 300);
  return fromTx === null ? fromCache : fromCache === null ? fromTx : Math.max(fromTx, fromCache);
}

/**
 * Claude is still working, though no message has come: the transcript's summary (not a stale one waiting on the
 * worker) has a main-chain tool call with no result yet, one that does not wait on the person (TxSummary.running). A
 * long build or test run, or a subagent, writes no main-chain message for minutes.
 */
export const working = (tx: TxSummary | null): boolean => tx !== null && !tx.needsWorker && tx.running;

/**
 * Away, the bed's rule: the last message is known and 5 minutes old or more (idle), and Claude is not working. A turn
 * in progress is activity, so the bed lies down only while the session waits on the person.
 */
export const away = (now: number, p: Payload, tx: TxSummary | null): boolean => !working(tx) && idle(now, lastMessage(p, tx));

/**
 * How long the session has run, in whole seconds, or null while unknown: stdin's cost.total_duration_ms, else now less
 * the history file's sessionStart (its first render in this repo; never below 0).
 */
export function sessionSecs(p: Payload, now: number, hist: Hist | null | undefined): number | null {
  const ms = num(obj(p.cost)?.total_duration_ms);
  if (ms !== null && ms >= 0) return Math.floor(ms / 1000);
  const start = hist ? hist.sessionStart : null;
  return start === null ? null : Math.max(0, now - start);
}

/**
 * The HUD's lines (the engine's, with the git state) with the player's layers: the name and the operator's mark on line
 * 3's folder (`cwd` is the engine's own reading of it), the bed in slot 4, the phantoms in line 1's sky. The input is
 * not changed.
 */
export function playerHud(lines: readonly (readonly Span[])[], m: PlayerMarks, cwd: string): Span[][] {
  return phantomHud(bedHud(whoHud(lines, m.who, cwd), m.bed), m.phantoms);
}
