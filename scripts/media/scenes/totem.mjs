// totem.gif (1.2.0, SPEC §0.13): the totem's day, from the normal day of the README with one limit reset declared
// (ONE_RESET, hungerbar totem 1) and $50 of extra credits. Every frame is a real render in the sandbox, each one after
// the last in the same session, so the shown-file sees the 5-hour window fall to 0 and the totem pops:
//   1. every limit above 10%: the totem waits in slot 5, the emerald in the offhand;
//   2. the 5-hour window at 7% left: the totem in the offhand, the emerald in slot 5;
//   3. the window hits 0: the pop, a ✦ for 30 s, between gold sides;
//   4. still at 0, 40 s on: the totem stays gold, and the credits pay in slot 5 (green sides, poisoned hearts);
//   5. the reset used: `hungerbar totem use` and the 5-hour window full again, so the totem is gone.
import { T0 } from '../rig.mjs';
import { normalDay } from './looks.mjs';

const RESET_AT = T0 + 17340;                               // the 5-hour window's reset, as the normal day has it

export async function totem(rig) {
  normalDay(rig);
  const frames = [];
  const shot = (now, h5, at, text, hold = 2.4) => {
    const p = rig.payload({ now, h5 });
    frames.push({ status: rig.render(p, { now }), caption: { at, text }, hold });
  };
  shot(T0, { used: 2, reset: RESET_AT - T0 }, 'waiting', 'You hold a limit reset: the totem waits in hotbar slot 5, and the emerald counts your credits');
  shot(T0 + 60, { used: 93, reset: RESET_AT - T0 - 60 }, '7% left', '10% left or less: the totem moves to your offhand and the emerald to slot 5. Use the reset before you pay');
  shot(T0 + 120, { used: 100, reset: RESET_AT - T0 - 120 }, '0% left', 'The 5-hour window hits 0: the totem pops for 30 seconds, and its frame turns gold');
  shot(T0 + 160, { used: 100, reset: RESET_AT - T0 - 160 }, '0% left', 'Still at 0: the totem stays gold, and the credits pay in slot 5, with green sides and poisoned hearts');
  const used = rig.run(['totem', 'use'], { env: { HUNGERBAR_NOW: String(T0 + 200) } });
  if (used.code !== 0) throw new Error(`hungerbar totem use failed: ${used.err}`);
  shot(T0 + 220, { used: 0, reset: 18000 }, 'totem use', 'You used the reset, and hungerbar totem use: the window is full again, and the totem is gone', 2.8);
  return { frames, opts: { rows: 8 } };
}
