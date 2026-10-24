// The idle bed (SPEC §0.9, 0.7.0): the 'bed-blocks' pick from design round 8 (test/reference/round8/identity.json),
// a layer after the engine. After 5 minutes without a message (hud.bed on), a bed fills the empty hotbar slot 4 (cols
// 32-35 of the hotbar line, the engine's last), seen from the side as Minecraft draws one: the mattress in the top
// five eighths (U+1FB84, which Windows Terminal draws itself, the same in both icon styles), a white pillow at the head
// and a red blanket, on oak legs at both ends with the well's dark between them. It goes with the next message, and
// waits while Claude works: a tool call without its result is a turn in progress (player.ts's away).
// The layer reads only what the engine drew: the slot must be four cells of the plain well (spaces on #201E07, no ink);
// anything else there is left as it is.
import { WELL } from './mix.ts';
import { merge, S, splitAt, W, type Span } from './spans.ts';

/** Minecraft's white wool, red wool and oak planks. */
export const PILLOW = '#E9ECEC', BLANKET = '#B02E26', OAK = '#9C7F4E';
/** U+1FB84, the upper five eighths block: the mattress. */
export const MATTRESS = '\u{1FB84}';
/** Columns of hotbar slot 4 on the hotbar line, [from, to). */
export const SLOT4: readonly [number, number] = [32, 36];
/** The minutes without a message after which the bed shows, in seconds. */
export const IDLE_SECS = 300;

/** The bed's four cells: the head on its leg, two cells of blanket over the well, the foot on its leg. */
export const BED: readonly Span[] = [S(MATTRESS, PILLOW, OAK), S(MATTRESS, BLANKET, WELL), S(MATTRESS, BLANKET, WELL), S(MATTRESS, BLANKET, OAK)];

/** Idle: the last message is known and at least IDLE_SECS before now. */
export const idle = (now: number, lastMessage: number | null): boolean => lastMessage !== null && now - lastMessage >= IDLE_SECS;

/**
 * The HUD's lines (the engine's: the last is the hotbar line) with the bed in slot 4 when `on`, and only while the slot
 * is the plain empty well. The input is not changed.
 */
export function bedHud(lines: readonly (readonly Span[])[], on: boolean): Span[][] {
  const out = lines.map((l) => [...l]);
  const n = out.length, hot = out[n - 1];
  if (!on || !hot) return out;
  const [head, rest] = splitAt(hot, SLOT4[0]);
  const [slot, tail] = splitAt(rest, SLOT4[1] - SLOT4[0]);
  const empty = W(head) === SLOT4[0] && W(slot) === SLOT4[1] - SLOT4[0] && slot.every((s) => /^ +$/.test(s.t) && !s.fg && s.bg === WELL && !s.bold);
  if (empty) out[n - 1] = merge([...head, ...BED, ...tail]);
  return out;
}
