// `hungerbar preview`: the demo situations (the picker's four, and Fable in use), or any payload file, rendered without
// touching the caches, in the configured look; --look, --fable, --align and the 0.7.0 keys (--pr, --user, --op, --bed,
// --phantoms) try another look in memory (nothing is written), and --width (or --cols) sets the window's columns, as
// HUNGERBAR_WIDTH, to show the fit and the centring. The demos draw this machine's names (whoAmI) as hud.user asks, and
// the operator's mark only while this terminal runs elevated, unless --op tag|gold asks to see it: then as if it did.
import { readFileSync } from 'node:fs';
import { detectDepth } from '../color.ts';
import { loadConfig, type Config } from '../config.ts';
import type { Env } from '../env.ts';
import { DEMOS, DEMO_NOW, demoSources } from '../demo.ts';
import { hudGate } from '../hud/look.ts';
import { diskSources, renderPayload } from '../render.ts';
import { whoAmI, type WhoSource } from '../whoami.ts';
import { optionError, parseArgs, say } from './args.ts';
import { HUD_OPTION_NAMES, hudOptions, lookFlag } from './look.ts';

const PREVIEW_VALUED = ['payload', 'cols', 'width', 'icons', 'now', 'situation', 'look', ...HUD_OPTION_NAMES];

export function preview(argv: string[], env: Env): number {
  const a = parseArgs(argv, PREVIEW_VALUED);
  const opt = optionError(a, PREVIEW_VALUED, ['no-color']) ?? (a.rest.length ? `unexpected argument "${a.rest[0]}"` : null);
  if (opt) {
    process.stderr.write(`hungerbar: ${opt} (see hungerbar --help)\n`);
    return 1;
  }
  const e: Env = { ...env, HUNGERBAR_NO_SPAWN: '1' };
  // --width N (or the older --cols N): the window's columns, as HUNGERBAR_WIDTH; a bare one or no whole number is refused
  for (const k of ['width', 'cols']) {
    const v = a.values.get(k);
    if (a.flags.has(k) || (v !== undefined && !/^[1-9]\d{0,4}$/.test(v))) {
      process.stderr.write(`hungerbar: --${k} takes a number of columns${v !== undefined ? ` (got "${v}")` : ''}\n`);
      return 1;
    }
  }
  if (a.values.has('width') && a.values.has('cols')) {
    process.stderr.write('hungerbar: --width and --cols are the same option; give one\n');
    return 1;
  }
  const cols = a.values.get('width') ?? a.values.get('cols');
  if (cols) e.HUNGERBAR_WIDTH = cols;
  const icons = a.values.get('icons');
  if (icons) e.HUNGERBAR_ICONS = icons;
  if (a.flags.has('no-color')) e.NO_COLOR = '1';
  const nowArg = a.values.get('now');
  const now = nowArg && /^\d+$/.test(nowArg) ? Number(nowArg) : undefined;

  // --look, --fable, --align and the 0.7.0 keys: an in-memory config (any HUD option implies the HUD; a --fable option
  // shows as it does once it is on; without --fable the usage API stays as hungerbar.json has it, so the default boss
  // shows nothing until it is on, as on the status line, SPEC §0.10)
  const lk = lookFlag(a);
  if (!lk.ok) {
    process.stderr.write(`hungerbar: ${lk.error}\n`);
    return 1;
  }
  const o = hudOptions(a, lk.value === 'classic', '--look hud');
  if (!o.ok) {
    process.stderr.write(`hungerbar: ${o.error}\n`);
    return 1;
  }
  let config: Config | undefined;
  if (lk.value !== null || Object.keys(o.value).length) {
    const loaded = loadConfig(e), c = loaded.cfg;
    if (loaded.error) process.stderr.write(`hungerbar: ${loaded.path} is invalid JSON (${loaded.error}); previewing with the defaults\n`);
    const fable = o.value.fable;
    config = {
      ...c, look: lk.value ?? 'hud', hud: { ...c.hud, ...o.value },
      ...(fable !== undefined && fable !== 'off' ? { network: { ...c.network, usageApi: true, scopedWeekly: true } } : {}),
    };
    const gate = hudGate(config, null, detectDepth(config.color, config.colorDepth, e), e);
    if (config.look === 'hud' && !gate.ok) process.stderr.write(`hungerbar: classic drawn: ${gate.reason}\n`);
  }
  const opts = { env: e, ...(config ? { config } : {}) };

  const file = a.values.get('payload');
  if (file) {
    const raw = readFileSync(file, 'utf8');
    say(renderPayload(raw, { ...opts, ...(now !== undefined ? { now } : {}), sources: (p, cfg, n) => diskSources(p, e, cfg, n, [], [], false) }).text);
    return 0;
  }
  // who runs the demo's session: this machine's names; --op tag|gold shows its mark as if this terminal ran elevated
  const me = whoAmI(e);
  const who: WhoSource = o.value.op !== undefined && o.value.op !== 'off' ? { ...me, elevated: () => true } : me;
  const which = a.values.get('situation') ?? 'all';
  const names = which === 'all' ? Object.keys(DEMOS) : [which];
  for (const [i, name] of names.entries()) {
    const d = DEMOS[name];
    if (!d) {
      process.stderr.write(`hungerbar: unknown situation "${name}" (${Object.keys(DEMOS).join(', ')})\n`);
      return 1;
    }
    if (names.length > 1) say(`${i ? '\n' : ''}── ${d.label}`);
    say(renderPayload(JSON.stringify(d.payload), { ...opts, sources: demoSources(d, who), now: now ?? DEMO_NOW }).text);
  }
  return 0;
}
