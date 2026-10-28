// The config the tests of anything but the defaults start from. Since SPEC §0.10 the defaults are the chosen setup (the HUD,
// Fable's boss bar, centred, the user name and the gold operator's mark); these tests were written against the defaults
// before it, which they keep explicitly: classic, and for the HUD no Fable option, the left edge, no name and the [OP]
// tag. test/unit/config-color.test.ts pins the defaults themselves, and the hud-defaults golden case draws them.
import { defaults, type Config } from '../src/config.ts';

/** The HUD's options as they were by default before SPEC §0.10. */
export const PLAIN_HUD = { fable: 'off', align: 'left', user: 'off', op: 'tag' } as const satisfies Partial<Config['hud']>;

/** defaults() with the look classic and PLAIN_HUD. */
export function plainDefaults(): Config {
  const d = defaults();
  return { ...d, look: 'classic', hud: { ...d.hud, ...PLAIN_HUD } };
}
