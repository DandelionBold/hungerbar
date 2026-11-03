// `hungerbar totem [<n> [--until <when>] [--kind full|5h|week|fable] [--label <text>] | add [<n>] … | use [--kind …] |
// clear] [--print]` (SPEC §0.13, 1.2.0): the limit resets Anthropic gave you, which Hungerbar cannot see itself (Claude
// Code does not pass them to status lines), declared in hungerbar.json's `totems`. With no form it says what is held.
// It writes through look's writer discipline (src/cli/look.ts): strict JSON with a BOM accepted, refused when invalid
// or not UTF-8 with the by-hand steps, a backup hungerbar.json.bak.<stamp>, only `totems` changed and every other key
// kept in its place, 2-space UTF-8 without a BOM, CRLF kept, `$schema` on a new file, a symlink followed, a read-only
// file refused, nothing written when the result is the same. Every write drops the grants that expired or reached 0;
// an empty list removes the key. It writes no network key, so it asks no consent. `use` also forgets the last-known
// windows the reset refilled in limits.json (src/totems.ts forgetWindows).
import { pathToFileURL } from 'node:url';
import { loadConfig, type Config } from '../config.ts';
import { nowSec, type Env } from '../env.ts';
import { sanitize } from '../sanitize.ts';
import { acctDir } from '../store.ts';
import {
  addTotem, expiry, forgetWindows, forgettable, grantLine, held, kindName, kindWords, LABEL_CAP, labelled, MAX_N, parseTotems, parseWhen, resets, serialize, setTotems,
  TOTEM_KINDS, useTotem, whenArg, windowWords, type Held, type Spec, type TotemGrant, type TotemKind,
} from '../totems.ts';
import { optionError, parseArgs, say } from './args.ts';
import { applyConfig, configFile, diffLines, readConfigStrict, schemaFor, writeFailed } from './look.ts';
import { formatSettings, withKey } from './setup.ts';

const KINDS_HELP = TOTEM_KINDS.join('|');
export const TOTEM_USAGE = `usage: hungerbar totem [<n> [--until <date>] [--kind ${KINDS_HELP}] [--label <text>] | add [<n>] [--until <date>] [--kind ${KINDS_HELP}] [--label <text>] | use [--kind ${KINDS_HELP}] | clear] [--print]`;

/** How to use a reset: Anthropic's button, or Claude Code's command where it has it; then tell Hungerbar. */
export const HOW_TO_USE = 'Settings → Usage → Reset for free (claude.ai or Claude Desktop), or /limit-reset where your Claude Code has it; then: hungerbar totem use';
/** Said by every form while hud.totem is off. */
export const TOTEM_OFF = 'hud.totem is off, so the HUD does not draw them: hungerbar look hud --totem on';
/** Fable's weekly is in usage.json, which only the refresher rewrites (SPEC §0.13). */
export const FABLE_NOTE = "Fable's weekly refreshes from the usage API within 3 minutes.";

function fail(msg: string): number {
  process.stderr.write(`hungerbar: ${msg}\n${TOTEM_USAGE}\n`);
  return 1;
}

/** The YYYY-MM-DD `days` from now, local time: the example --until the command prints. */
const exampleDate = (now: number, days = 30): string => whenArg(new Date((now + days * 86400) * 1000).setHours(23, 59, 59, 0) / 1000);

/** The flags that give a grant back exactly, or null when its label cannot be quoted plainly for a shell. */
function grantArgs(g: TotemGrant): string | null {
  if (g.label !== null && /["\\$`]/.test(g.label)) return null;
  return [
    ...(g.until !== null ? [`--until ${whenArg(g.until)}`] : []),
    ...(g.kind !== 'full' ? [`--kind ${g.kind}`] : []),
    ...(g.label !== null ? [`--label "${g.label}"`] : []),
  ].join(' ');
}

/**
 * The command that brings `before` (the grants held before a write) back: clear for none, `totem <n> …` for one grant,
 * else (or for a label a shell would read) the backup.
 */
export function backCommand(before: readonly TotemGrant[], bak: string | null): string {
  if (!before.length) return 'hungerbar totem clear';
  const args = before.length === 1 ? grantArgs(before[0]!) : null;
  if (args !== null) return `hungerbar totem ${before[0]!.n}${args ? ` ${args}` : ''}`;
  return bak ? `copy ${bak} over hungerbar.json` : 'hungerbar totem clear, then add each grant again';
}

/** What is held, as the command says it: the count and each grant, the last day, where the HUD puts it, how to use one. */
export function heldLines(h: Held, cfg: Pick<Config, 'hud'>, now: number): string[] {
  if (!h.count) return ['No limit resets held.', ...(cfg.hud.totem === 'off' ? [TOTEM_OFF] : [])];
  const one = h.grants.length === 1 ? h.grants[0]! : null;
  const out = one
    ? [`${resets(h.count)} held: ${one.n > 1 ? `${one.n} × ` : ''}${kindWords(one.kind)}, ${expiry(one, now)}${labelled(one)}.`]
    : [`${resets(h.count)} held:`, ...h.grants.map((g) => `  ${grantLine(g, now)}`)];
  if (h.lastDay) out.push(`${one ? 'It expires' : 'The first expires'} within 24 hours.`);
  out.push(h.count === 1
    ? 'The HUD: the totem waits in hotbar slot 5; at 10% left or less it moves to your offhand.'
    : 'The HUD: one totem for all of them, as a totem does not stack; it waits in hotbar slot 5, and at 10% left or less of a limit one of them refills it moves to your offhand.');
  out.push(`To use ${h.count === 1 ? 'it' : 'one'}: ${HOW_TO_USE}`);
  if (cfg.hud.totem === 'off') out.push(TOTEM_OFF);
  return out;
}

/** `hungerbar totem` with no form: what is held, or how to declare one; the ignored and expired entries. */
function status(env: Env): number {
  const now = nowSec(env), loaded = loadConfig(env);
  if (loaded.error) {
    say(`hungerbar.json: ${loaded.path} is invalid JSON (${loaded.error}), so no limit resets are read; fix it before hungerbar totem can write it.`);
    return 0;
  }
  const h = held(loaded.cfg.totems, now);
  if (h.count) for (const l of heldLines(h, loaded.cfg, now)) say(l);
  else {
    say('No limit resets declared. When Anthropic gives you one (Settings → Usage → Resets), tell Hungerbar and the HUD');
    say(`carries it as the Totem of Undying:  hungerbar totem 1 --until ${exampleDate(now)}`);
    say('Hungerbar cannot see your resets itself: Claude Code does not pass them to status lines.');
    if (loaded.cfg.hud.totem === 'off') say(TOTEM_OFF);
  }
  if (h.expired) say(`${h.expired} expired grant${h.expired === 1 ? ' is' : 's are'} ignored; the next hungerbar totem write removes ${h.expired === 1 ? 'it' : 'them'}.`);
  return 0;
}

/** What a form asks for: the new grants from the held ones, or why it cannot. */
type Form =
  | { op: 'set'; n: number; spec: Spec }
  | { op: 'add'; n: number; spec: Spec }
  | { op: 'use'; kind: TotemKind | null };

/** The by-hand steps for a hungerbar.json the writer refuses. */
function handTotems(f: Form, now: number): string[] {
  const grant = (n: number, s: Spec): string => JSON.stringify(serialize([{ n, kind: s.kind, until: s.until, at: now, label: s.label }])[0]);
  if (f.op === 'set') return [f.n === 0 ? 'no "totems" key (remove it)' : `"totems": [${grant(f.n, f.spec)}]`];
  if (f.op === 'add') return [`"totems": [... the grants you hold, ${grant(f.n, f.spec)}]`];
  return ['"totems": the grant you used with its "n" one less (remove it at 0)'];
}

export function totem(argv: string[], env: Env, self: string): number {
  const valued = ['until', 'kind', 'label'];
  const a = parseArgs(argv, valued);
  const opt = optionError(a, valued, ['print']);
  if (opt) return fail(opt);
  for (const k of valued) if (a.flags.has(k)) return fail(`--${k} needs a value`);
  const now = nowSec(env);
  const [form, arg, ...more] = a.rest;
  const has = (k: string): boolean => a.values.has(k);
  if (form === undefined) {
    const extra = valued.find(has);
    return extra ? fail(`--${extra} goes with a count or add: hungerbar totem 1 --${extra} …`) : status(env);
  }

  // --kind, --until and --label, checked before anything is read
  const kv = a.values.get('kind');
  if (kv !== undefined && !(TOTEM_KINDS as readonly string[]).includes(kv)) return fail(`--kind takes full, 5h, week or fable (got "${kv}")`);
  const kind = (kv ?? null) as TotemKind | null;
  let until: number | null = null;
  const uv = a.values.get('until');
  if (uv !== undefined) {
    const w = parseWhen(uv, now);
    if (!w.ok) return fail(`--until: ${w.error}`);
    until = w.at;
  }
  let label: string | null = null;
  const lv = a.values.get('label');
  if (lv !== undefined) {
    if (Array.from(lv).length > LABEL_CAP) return fail(`--label takes at most ${LABEL_CAP} characters`);
    label = sanitize(lv, LABEL_CAP).trim() || null;
  }
  const spec: Spec = { kind: kind ?? 'full', until, label };
  const count = (v: string | undefined, lo: number, what: string): number | string => {
    if (v === undefined) return 1;
    return /^\d{1,2}$/.test(v) && Number(v) >= lo && Number(v) <= MAX_N ? Number(v) : `${what} takes a whole number from ${lo} to ${MAX_N} (got "${v}")`;
  };

  let f: Form;
  if (form === 'add') {
    if (more.length) return fail(`add takes one count (got ${a.rest.slice(1).join(' ')})`);
    const n = count(arg, 1, 'add');
    if (typeof n === 'string') return fail(n);
    f = { op: 'add', n, spec };
  } else if (form === 'use' || form === 'clear') {
    if (arg !== undefined) return fail(form === 'use' ? `use takes no count: run it once for each reset you used (got ${a.rest.slice(1).join(' ')})` : `clear takes nothing more (got ${a.rest.slice(1).join(' ')})`);
    const extra = valued.filter((k) => has(k) && !(form === 'use' && k === 'kind'))[0];
    if (extra) return fail(`--${extra} does not go with ${form}`);
    f = form === 'use' ? { op: 'use', kind } : { op: 'set', n: 0, spec };
  } else if (/^\d+$/.test(form)) {
    if (arg !== undefined) return fail(`one count at a time (got ${a.rest.join(' ')})`);
    const n = count(form, 0, 'the count');
    if (typeof n === 'string') return fail(n);
    if (n === 0) {
      const extra = valued.find(has);
      if (extra) return fail(`--${extra} does not go with 0, which clears every reset`);
    }
    f = { op: 'set', n, spec };
  } else return fail(`unknown form "${form}": a count, add, use or clear`);

  // read hungerbar.json as the writer must, and plan
  const path = configFile(env);
  let file;
  try {
    file = readConfigStrict(path, () => handTotems(f, now));
  } catch (e) {
    process.stderr.write(`hungerbar: ${(e as Error).message}\n`);
    return 1;
  }
  const before = file.exists ? file.obj : {};
  const was = parseTotems(before.totems).grants;
  const beforeHeld = held(was, now).grants;
  let grants: TotemGrant[];
  let used: TotemGrant | null = null;
  if (f.op === 'use') {
    const u = useTotem(was, f.kind, now);
    if (!u) {
      const h = held(was, now);
      return fail(h.count
        ? `no ${kindName(f.kind!)} held to use (held: ${h.grants.map((g) => `${g.n} ${kindName(g.kind)}`).join(', ')})`
        : 'no limit reset held to use: hungerbar totem shows what is declared');
    }
    grants = u.next;
    used = u.used;
  } else grants = f.op === 'add' ? addTotem(was, f.n, f.spec, now) : setTotems(was, f.n, f.spec, now);

  let next = withKey(before, 'totems', grants.length ? serialize(grants) : undefined);
  const changed = JSON.stringify(next) !== JSON.stringify(before);
  const schema = schemaFor(self);
  if (!file.exists && changed && schema) next = { $schema: pathToFileURL(schema).href, ...next };
  const text = formatSettings(next, file.crlf, file.finalNewline);
  const cfg = loadConfig(env).cfg;
  const after = held(grants, now);
  const print = a.flags.has('print');

  say(`hungerbar.json: ${file.path}${file.exists ? '' : changed ? ' (will be created)' : ' (not present)'}`);
  if (!changed) {
    say('Nothing to change.');
    for (const l of heldLines(after, cfg, now)) say(l);
    return 0;
  }
  for (const l of diffLines(before, next)) say(l);
  const acct = acctDir(env);
  if (print) {
    const would = used ? forgettable(acct, used.kind) : [];
    if (would.length) say(`It would also forget the last-known use of ${windowWords(would)} in limits.json.`);
    say('Nothing was written (--print).');
    return 0;
  }
  let bak: string | null;
  try {
    bak = applyConfig({ file, text });
  } catch (e) {
    process.stderr.write(writeFailed(file.path, e));
    return 1;
  }
  if (bak) say(`backup: ${bak}`);

  if (used) {
    const left = after.count;
    say(`1 limit reset used (a ${kindName(used.kind)}); ${left ? `${left} left` : 'none left'}.`);
    let gone: ReturnType<typeof forgetWindows> = [];
    try {
      gone = forgetWindows(acct, used.kind);
    } catch { /* a read-only cache folder: the old use shows with ~ until a live render */ }
    if (gone.length) say(`The last-known use of ${windowWords(gone)} is forgotten, so the refill shows on the next render.`);
    if (used.kind === 'full' || used.kind === 'fable') say(FABLE_NOTE);
    if (left) for (const l of heldLines(after, cfg, now)) say(l);
    else if (cfg.hud.totem === 'off') say(TOTEM_OFF);
    const back = grantArgs({ ...used, n: 1 });
    say(`Back with: ${back === null ? `copy ${bak} over hungerbar.json` : `hungerbar totem ${left ? 'add 1' : '1'}${back ? ` ${back}` : ''}`}`);
    return 0;
  }
  for (const l of heldLines(after, cfg, now)) say(l);
  say(`Back with: ${backCommand(beforeHeld, bak)}`);
  return 0;
}
