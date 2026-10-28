// `hungerbar look [classic|hud] [--fable off|tail|tooltip|boss|beacon] [--align left|center] [--pr on|off]
// [--user off|user|user@host] [--op off|tag|gold] [--bed on|off] [--phantoms on|off] [--print]` and what `setup` shares
// with it (plan §8): the hungerbar.json writer, the consent texts a Fable option and the PR status print, the gate verdict
// for this terminal, what the player's options show here, and the TTY prompt with in-memory previews of the demo situations.
// The writer reads hungerbar.json as strict JSON (a BOM is accepted) and refuses anything else, with the by-hand steps,
// before a byte is written. It merges only `look`, `hud.fable`, `hud.align`, the 0.7.0 keys (`hud.pr`, `hud.user`,
// `hud.op`, `hud.bed`, `hud.phantoms`) and, for a Fable option, `network.usageApi` and `network.scopedWeekly`; every other
// key keeps its value and its place (setup.ts withKey). It backs the file up to hungerbar.json.bak.<stamp>, writes 2-space
// indented UTF-8 without a BOM (CRLF kept), and creates a missing file with its $schema. settings.json is never touched:
// Claude Code reads the look on its next render.
import { existsSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { isatty } from 'node:tty';
import { pathToFileURL } from 'node:url';
import { detectDepth, type Depth } from '../color.ts';
import {
  configPath, defaults, fableId, HUD_ALIGNS, HUD_FABLES, loadConfig, merge, usageEnabled, type Config,
  type HudAlign, type HudFable, type HudOp, type HudPr, type HudSwitch, type HudUser, type Look,
} from '../config.ts';
import { DEMOS, DEMO_NOW, demoSources } from '../demo.ts';
import { claudeDir, flag, intEnv, offline, type Env } from '../env.ts';
import { resolveGh } from '../pr/gh.ts';
import { centreOffset, HOTBAR_CENTRE, hudOffset, shiftHud } from '../hud/align.ts';
import { FABLE_OPTIONS } from '../hud/fable.ts';
import { encode, hudGate, type Gate } from '../hud/look.ts';
import { budget } from '../layout.ts';
import { renderPayload } from '../render.ts';
import { cacheDir, writeAtomic } from '../store.ts';
import { USAGE_URL } from '../usage/refresh.ts';
import { elevated, hostName, userName, whoAmI, type WhoSource } from '../whoami.ts';
import { optionError, parseArgs, say, type Args } from './args.ts';
import { backup, formatSettings, isHungerbar, readSettings, settingsPath, withKey, type SettingsFile, type StatusLine } from './setup.ts';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * What setup or look asks for: a look and, for the HUD, maybe a Fable option, a place in the status line, the PR status
 * and the player's options (0.7.0); an absent one stays as hungerbar.json has it.
 */
export interface LookChoice {
  look: Look;
  fable?: HudFable;
  align?: HudAlign;
  pr?: HudPr;
  user?: HudUser;
  op?: HudOp;
  bed?: HudSwitch;
  phantoms?: HudSwitch;
  /**
   * The keys setup's consent questions answered (SPEC §0.10): each is written even at its default into a file that does
   * not have it, so a no to the PR status stays a no at the next setup's Enter.
   */
  answered?: readonly HudKey[];
  /**
   * A no to setup's usage API question (SPEC §0.10): the key it asked about, network.usageApi or network.scopedWeekly,
   * written as false, so the next setup's question pre-selects no. Only ever false: a yes is a Fable option's to write.
   */
  network?: Partial<Record<'usageApi' | 'scopedWeekly', false>>;
}

/**
 * The HUD's 0.7.0 keys that look, setup and preview take as flags of the same name (--pr on, --user user@host …): the
 * values the command line accepts, in the order help names them. Each key's default is defaults().hud's: off for pr,
 * user for user, gold for op, on for bed and phantoms.
 */
export const HUD_FLAGS = {
  pr: ['on', 'off'],
  user: ['off', 'user', 'user@host'],
  op: ['off', 'tag', 'gold'],
  bed: ['on', 'off'],
  phantoms: ['on', 'off'],
} as const satisfies { [K in HudKey]: readonly Config['hud'][K][] };
type HudKey = 'pr' | 'user' | 'op' | 'bed' | 'phantoms';
export const HUD_FLAG_KEYS = Object.keys(HUD_FLAGS) as HudKey[];
/** Every hud key a LookChoice can carry, in the order the writer adds them to a file that has none. */
const CHOICE_KEYS = ['fable', 'align', ...HUD_FLAG_KEYS] as const;

/** "a or b", "a, b or c". */
const either = (vs: readonly string[]): string => (vs.length > 1 ? `${vs.slice(0, -1).join(', ')} or ${vs[vs.length - 1]}` : vs.join(''));

export function parseLook(v: string | undefined): Look | null {
  return v === 'classic' || v === 'hud' ? v : null;
}

/** A Fable option on the command line: off|tail|tooltip|boss|beacon or the engine's fable-<id>. Strict, unlike the file. */
export function parseFable(v: string | undefined): HudFable | null {
  if (v === undefined) return null;
  const id = v.startsWith('fable-') ? v.slice(6) : v;
  return (HUD_FABLES as readonly string[]).includes(id) ? fableId(id) : null;
}

export const FABLE_HELP = HUD_FABLES.join('|');

/** An align on the command line: left or center (centre is the same). Strict, like parseFable. */
export function parseAlign(v: string | undefined): HudAlign | null {
  const a = v === 'centre' ? 'center' : v;
  return (HUD_ALIGNS as readonly (string | undefined)[]).includes(a) ? (a as HudAlign) : null;
}

export const ALIGN_HELP = HUD_ALIGNS.join('|');

/** A 0.7.0 HUD key on the command line (--pr on, --user user@host …): one of HUD_FLAGS' values. Strict, like parseFable. */
export function parseHudOption<K extends HudKey>(k: K, v: string | undefined): Config['hud'][K] | null {
  return (HUD_FLAGS[k] as readonly (string | undefined)[]).includes(v) ? (v as Config['hud'][K]) : null;
}

/** `[--pr on|off] [--user off|user|user@host] …`: the 0.7.0 keys as help and the usage lines show them. */
export const hudHelp = (k: HudKey): string => HUD_FLAGS[k].join('|');
export const PR_HELP = hudHelp('pr');
export const HUD_FLAGS_HELP = HUD_FLAG_KEYS.map((k) => `[--${k} ${hudHelp(k)}]`).join(' ');

/** A checked flag: its value (null when it is not given), or what is wrong with it. */
export type Flag<T> = { ok: true; value: T | null } | { ok: false; error: string };

/** --look (setup, preview): classic or hud; a bare --look or any other value is an error. */
export function lookFlag(a: Args): Flag<Look> {
  const v = a.values.get('look');
  if (a.flags.has('look') || (v !== undefined && !parseLook(v))) return { ok: false, error: `--look takes classic or hud${v ? ` (got "${v}")` : ''}` };
  return { ok: true, value: parseLook(v) };
}

/** --fable (setup, preview, look): one of the five options; a bare --fable or any other value is an error. */
export function fableFlag(a: Args): Flag<HudFable> {
  const v = a.values.get('fable');
  if (a.flags.has('fable') || (v !== undefined && !parseFable(v))) return { ok: false, error: `--fable takes ${HUD_FABLES.join(', ')}${v ? ` (got "${v}")` : ''}` };
  return { ok: true, value: parseFable(v) };
}

/** --align (setup, preview, look): left or center; a bare --align or any other value is an error. */
export function alignFlag(a: Args): Flag<HudAlign> {
  const v = a.values.get('align');
  if (a.flags.has('align') || (v !== undefined && !parseAlign(v))) return { ok: false, error: `--align takes ${HUD_ALIGNS.join(' or ')}${v ? ` (got "${v}")` : ''}` };
  return { ok: true, value: parseAlign(v) };
}

/** --pr, --user, --op, --bed or --phantoms (look, setup, preview): one of its values; a bare one or any other value is an error. */
export function hudFlag<K extends HudKey>(a: Args, k: K): Flag<Config['hud'][K]> {
  const v = a.values.get(k);
  if (a.flags.has(k) || (v !== undefined && !parseHudOption(k, v))) return { ok: false, error: `--${k} takes ${either(HUD_FLAGS[k])}${v ? ` (got "${v}")` : ''}` };
  return { ok: true, value: parseHudOption(k, v) };
}

/** The options look, setup and preview take besides the look itself: --fable, --align and the 0.7.0 keys. */
export const HUD_OPTION_NAMES: readonly string[] = CHOICE_KEYS;

/**
 * The HUD's options from the flags (--fable, --align, --pr, --user, --op, --bed, --phantoms): the part of a LookChoice
 * they give, or the first error, flag by flag in that order: a value it does not take, then the flag given where the
 * look is not the HUD (`notHud`), whose fix names `how` (`hungerbar look hud` for look, `--look hud` for setup and
 * preview).
 */
export function hudOptions(a: Args, notHud: boolean, how: string): { ok: true; value: Omit<LookChoice, 'look'> } | { ok: false; error: string } {
  const out: Omit<LookChoice, 'look'> = {};
  const take = <T extends string>(k: string, f: Flag<T>): string | null => {
    if (!f.ok) return f.error;
    if (f.value === null) return null;
    if (notHud) return `--${k} goes with the HUD: ${how} --${k} ${f.value}`;
    (out as Record<string, string>)[k] = f.value;
    return null;
  };
  const err = take('fable', fableFlag(a)) ?? take('align', alignFlag(a)) ?? HUD_FLAG_KEYS.reduce<string | null>((e, k) => e ?? take(k, hudFlag(a, k)), null);
  return err === null ? { ok: true, value: out } : { ok: false, error: err };
}

/** The hud keys a choice gives, as `fable boss, align center, pr on`. */
export const choiceOptions = (c: LookChoice): string[] => CHOICE_KEYS.flatMap((k) => (c[k] !== undefined ? [`${k} ${c[k]}`] : []));

/**
 * hungerbar.json with the choice merged in: key order and every other key kept. A default (defaults(), SPEC §0.10) is
 * written only over a different value: an absent look stays absent for hud, an absent hud.fable for boss, hud.align for
 * center, hud.pr for off, hud.user for user, hud.op for gold, hud.bed and hud.phantoms for on (setup's Enter on a config
 * with none of them changes nothing); a value that is not the default, an unknown one included, is replaced. A Fable
 * option but off also turns on network.usageApi and network.scopedWeekly, which it needs: the default boss included,
 * because a choice that names it is the user's yes. A key setup's consent question answered (`answered`) is written into
 * a file that does not have it, the default included, and so is a no to the usage API (`network`, as false). New hud
 * keys go last, in the order fable, align, pr, user, op, bed, phantoms.
 */
export function mergeLook(obj: Obj, c: LookChoice): Obj {
  const d = defaults();
  let next = obj;
  const hud = (): Obj => (isObj(next.hud) ? next.hud : {});
  /** A choice is written unless it is the default and the file has no other value for it (none, or the default). */
  const writes = (v: string | undefined, dflt: string, had: unknown): v is string => v !== undefined && (v !== dflt || (had !== undefined && had !== dflt));
  const was = (k: string): unknown => (isObj(obj.hud) ? obj.hud[k] : undefined);
  if (writes(c.look, d.look, obj.look)) next = withKey(next, 'look', c.look);
  if (writes(c.fable, d.hud.fable, was('fable'))) next = withKey(next, 'hud', withKey(hud(), 'fable', c.fable));
  if (c.fable !== undefined && c.fable !== 'off') next = withKey(next, 'network', withKey(withKey(isObj(obj.network) ? obj.network : {}, 'usageApi', true), 'scopedWeekly', true));
  for (const k of ['usageApi', 'scopedWeekly'] as const) {
    if (c.network?.[k] === false) next = withKey(next, 'network', withKey(isObj(next.network) ? next.network : {}, k, false));
  }
  if (writes(c.align, d.hud.align, was('align'))) next = withKey(next, 'hud', withKey(hud(), 'align', c.align));
  for (const k of HUD_FLAG_KEYS) {
    const v = c[k];
    if (writes(v, d.hud[k], was(k)) || (v !== undefined && was(k) === undefined && c.answered?.includes(k) === true)) next = withKey(next, 'hud', withKey(hud(), k, v));
  }
  return next;
}

/** The writer's plan: the file as it is, and what it becomes. */
export interface ConfigPlan {
  file: SettingsFile;
  choice: LookChoice;
  before: Obj;
  next: Obj;
  changed: boolean;
  text: string;
}

/** hungerbar.json's path with a symlink resolved, so the link is kept and its target written. */
export function configFile(env: Env): string {
  const p = configPath(env);
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

/** The schema next to the bundle (dist/../schema.json), as setup links it; null when it is not there. */
export function schemaFor(self: string): string | null {
  const s = join(dirname(self), '..', 'schema.json');
  return existsSync(s) ? s : null;
}

/** hungerbar.json cannot be read: the message is the refusal with the by-hand steps, `why` the reason alone. */
export class ConfigRefused extends Error {
  readonly why: string;
  constructor(message: string, why: string) {
    super(message);
    this.why = why;
  }
}

/** Reads hungerbar.json strictly and plans the merge; ConfigRefused (with the by-hand steps) when it cannot be read. */
export function planConfig(path: string, c: LookChoice, schema: string | null): ConfigPlan {
  let file: SettingsFile;
  try {
    file = readSettings(path);
    if (file.bytes && !Buffer.from(file.bytes.toString('utf8'), 'utf8').equals(file.bytes)) throw new Error('it is not UTF-8 text');
  } catch (e) {
    const why = (e as Error).message;
    throw new ConfigRefused(refusal(path, why, c), why);
  }
  const before = file.exists ? file.obj : {};
  let next = mergeLook(before, c);
  const changed = JSON.stringify(next) !== JSON.stringify(before);
  if (!file.exists && changed && schema) next = { $schema: pathToFileURL(schema).href, ...next };
  return { file, choice: c, before, next, changed, text: formatSettings(next, file.crlf, file.finalNewline) };
}

/** What to set by hand, for a file the writer refuses. */
export function handSteps(c: LookChoice): string[] {
  const out = [`"look": "${c.look}"`];
  const hud = CHOICE_KEYS.flatMap((k) => (c[k] !== undefined ? [`"${k}": "${c[k]}"`] : []));
  if (hud.length) out.push(`"hud": { ${hud.join(', ')} }   (next to any other keys in "hud")`);
  if (c.fable !== undefined && c.fable !== 'off') out.push('"network": { "usageApi": true, "scopedWeekly": true }   (next to any other keys in "network")');
  const no = Object.entries(c.network ?? {}).map(([k, v]) => `"${k}": ${String(v)}`);
  if (no.length) out.push(`"network": { ${no.join(', ')} }   (next to any other keys in "network")`);
  return out;
}

function refusal(path: string, why: string, c: LookChoice): string {
  return [
    `${path} cannot be read as a JSON object (${why}), so it was left alone and nothing was written.`,
    'Fix it by hand: make it one valid JSON object, then set',
    ...handSteps(c).map((s) => `  ${s}`),
    'or move the file away to start again from the defaults. Until it is fixed the status line draws classic with cfg!.',
  ].join('\n');
}

/** The top-level keys that change, as - and + lines. */
export function diffLines(before: Obj, next: Obj): string[] {
  const out: string[] = [];
  for (const k of new Set([...Object.keys(next), ...Object.keys(before)])) {
    const a = JSON.stringify(before[k]), b = JSON.stringify(next[k]);
    if (a === b) continue;
    if (a !== undefined) out.push(`- ${k}: ${a}`);
    if (b !== undefined) out.push(`+ ${k}: ${b}`);
  }
  return out;
}

/** Writes the plan (a backup first when the file exists); the backup's path, or null. */
export function applyConfig(p: ConfigPlan): string | null {
  const bak = backup(p.file);
  writeAtomic(p.file.path, p.text);
  return bak;
}

/**
 * Said for every Fable option but off: what turning the usage API on means (plan §8). `asking`: setup's wording, before
 * its question (SPEC §0.10), `'scoped'` when hungerbar.json has the usage API on already and only scopedWeekly is
 * asked; else look's, which turns it on.
 */
export function consentLines(env: Env, asking: boolean | 'scoped' = false): string[] {
  // The refresher takes CLAUDE_CODE_OAUTH_TOKEN first when it is set (src/usage/creds.ts), so the text names it then.
  const creds = (env.CLAUDE_CODE_OAUTH_TOKEN?.trim() ? 'the CLAUDE_CODE_OAUTH_TOKEN variable, else ' : '')
    + join(claudeDir(env), '.credentials.json') + (process.platform === 'darwin' ? ' (or the macOS Keychain)' : '');
  const lines = asking === 'scoped'
    ? [
      "Fable's weekly comes from the usage API, which hungerbar.json has on, and it needs network.scopedWeekly too.",
      `With that on, the background refresher calls ${USAGE_URL.replace(/^https:\/\//, '')} about every 3 minutes`,
      'while a terminal session renders, even when your account has no extra usage (without it: once an hour).',
      `It reads your Claude login token from ${creds}. The token is never stored or sent anywhere else.`,
    ]
    : [
      asking
        ? "Fable's weekly comes from the opt-in usage API (network.usageApi and network.scopedWeekly). With it on,"
        : "Fable's weekly comes from the opt-in usage API, so this turns it on (network.usageApi and network.scopedWeekly):",
      `a background refresher reads your Claude login token from ${creds} and calls`,
      `${USAGE_URL.replace(/^https:\/\//, '')} about every 3 minutes while a terminal session renders.`,
      'The token is never stored or sent anywhere else.',
    ];
  if (!usageEnabled({ ...defaults(), network: { ...defaults().network, usageApi: true } }, env)) {
    lines.push('note: CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC or HUNGERBAR_OFFLINE is set here, which keeps the usage API off.');
  }
  return lines;
}

/**
 * Said when the PR status is turned on (SPEC §0.9, 0.7.0): it uses the network, through the user's own gh and its
 * login; then whether gh is found here and whether non-essential traffic is off.
 */
export function prConsentLines(env: Env): string[] {
  const lines = [
    'The pull request and CI status uses the network, so it is opt-in (hud.pr on): while a session renders in a repo',
    'with a GitHub remote, a background refresher runs your own GitHub CLI (gh pr view) for the branch HEAD is on,',
    'about once a minute, with your own gh login. Hungerbar never sees or stores a token. Its cache keeps only what',
    "the badge needs: the PR's number, its state, its checks' result, its review decision and whether it conflicts,",
    "saved under the repo's path and the branch, with when and how gh last answered.",
  ];
  const gh = resolveGh(env);
  lines.push(gh ? `gh here: ${gh}` : 'note: gh is not on PATH here, so nothing shows until it is installed and logged in (https://cli.github.com, then gh auth login).');
  if (offline(env)) lines.push('note: CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC or HUNGERBAR_OFFLINE is set here, which keeps the PR status off.');
  return lines;
}

/** The PR status as hungerbar.json, the environment and this machine set it. */
export function prSummary(cfg: Config, env: Env): string {
  if (cfg.hud.pr === 'off') return 'hud.pr off: no pull request status';
  if (offline(env)) return 'hud.pr on, but off here: CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC or HUNGERBAR_OFFLINE is set';
  const gh = resolveGh(env);
  return gh ? `hud.pr on: the branch's pull request from ${gh} (found here), about once a minute` : 'hud.pr on, but gh is not on PATH here, so nothing shows';
}

/** The PR status cannot show here although hud.pr is on: no gh, or the network switch. */
export const prBlocked = (cfg: Config, env: Env): boolean => cfg.hud.pr === 'on' && (offline(env) || !resolveGh(env));

/** How many PR answers the HUD keeps (cacheDir/pr). */
export function prFiles(env: Env): number {
  try {
    return readdirSync(join(cacheDir(env), 'pr')).filter((f) => f.endsWith('.json')).length;
  } catch {
    return 0;
  }
}

/** How the operator runs here: as Administrator on Windows, as root elsewhere. */
export const elevatedAs = (platform: NodeJS.Platform = process.platform): string => (platform === 'win32' ? 'as Administrator' : 'as root');

/** hud.user as hungerbar.json sets it, and what line 3 shows here before the folder, with this machine's names. */
export function userSummary(cfg: Config, env: Env): string {
  const u = cfg.hud.user;
  if (u === 'off') return 'hud.user off: no name before the folder on line 3';
  const user = userName(env);
  if (!user) return `hud.user ${u}, but no user name is found here, so none shows`;
  const host = u === 'user@host' ? hostName(env) : '';
  return `hud.user ${u}: line 3 reads "⌂ ${user}${host ? `@${host}` : ''}: <folder>" here`;
}

/**
 * hud.op as hungerbar.json sets it, and whether this terminal runs elevated (Claude Code started from it would too),
 * also while the mark is off.
 */
export function opSummary(cfg: Config, env: Env): string {
  const as = elevatedAs(), op = cfg.hud.op;
  if (op === 'off') return `hud.op off: no operator's mark; this terminal ${elevated(env) ? `runs ${as}` : `does not run ${as}`}`;
  const named = cfg.hud.user !== 'off';
  const what = op === 'tag' ? `a bold red [OP] ${named ? 'before your name' : 'after the ⌂'}` : named ? 'your name in bold gold' : 'the ⌂ in gold';
  const here = elevated(env) ? `this terminal runs ${as}, so it shows here` : `this terminal does not, so nothing shows here`;
  return `hud.op ${op}: ${what} while Claude Code runs ${as}; ${here}`;
}

/** hud.bed and hud.phantoms as hungerbar.json sets them. */
export function idleSummary(cfg: Config): string {
  const bed = cfg.hud.bed === 'on' ? 'a bed in slot 4 after 5 minutes without a message, not while a tool runs' : 'no bed';
  const ph = cfg.hud.phantoms === 'on' ? "phantoms in line 1's sky when the session runs long" : 'no phantoms';
  return `hud.bed ${cfg.hud.bed}: ${bed}; hud.phantoms ${cfg.hud.phantoms}: ${ph}`;
}

/** Where the HUD's git state comes from (always on with the HUD, 0.7.0). */
export function gitStateNote(cfg: Config): string {
  if (cfg.git.mode === 'off') return 'git.mode off: no git status, so ⎇ stays grey with no counts or arrows; a merge, rebase or cherry-pick in progress and a detached HEAD still show (read from .git)';
  return `the git state (⎇ and the branch's colours and marks): git status beside the diff, ${cfg.git.mode === 'sync' ? 'in the render (git.mode sync)' : 'in the background refresher'}`;
}

const DEPTH_LABEL: Record<Depth, string> = { truecolor: '24-bit colour', '256': '256 colours', '16': '16 colours', none: 'no colour' };

/** The gate for this terminal: the look's verdict, and the HUD's as if look were hud. */
export interface GateHere { gate: Gate; hud: Gate; depth: Depth; budget: number | null; ascii: boolean }
export function gateHere(cfg: Config, error: string | null, env: Env): GateHere {
  const depth = detectDepth(cfg.color, cfg.colorDepth, env);
  return {
    gate: hudGate(cfg, error, depth, env),
    hud: hudGate({ ...cfg, look: 'hud' }, error, depth, env),
    depth,
    budget: budget(env, cfg),
    ascii: cfg.icons === 'ascii' || flag(env, 'HUNGERBAR_ASCII') || env.TERM === 'dumb',
  };
}

/** One line: what this terminal draws, and why. */
export function verdict(g: GateHere): string {
  if (g.gate.ok) return `the HUD draws here (${DEPTH_LABEL[g.gate.depth]})`;
  if (g.gate.reason !== 'look is classic') return `classic here: ${g.gate.reason}`;
  return g.hud.ok ? `classic here (look is classic); the HUD would draw here (${DEPTH_LABEL[g.hud.depth]})` : `classic here (look is classic); the HUD would not draw here either: ${g.hud.reason}`;
}

/** The inputs of the verdict, for doctor. */
export function gateInputs(g: GateHere, cfg: Config): string {
  const b = g.budget === null ? 'width unknown (the HUD always draws)' : `budget ${g.budget} against hud.minWidth ${cfg.hud.minWidth}`;
  return `${DEPTH_LABEL[g.depth]}, ASCII ${g.ascii ? 'on' : 'off'}, ${b}`;
}

/** The look and its options as hungerbar.json and the environment set them. */
export function lookSummary(cfg: Config, env: Env): string {
  const forced = env.HUNGERBAR_LOOK === 'classic' || env.HUNGERBAR_LOOK === 'hud' ? ` (HUNGERBAR_LOOK=${env.HUNGERBAR_LOOK} wins over the file)` : '';
  const aligned = env.HUNGERBAR_HUD_ALIGN === 'left' || env.HUNGERBAR_HUD_ALIGN === 'center' ? ` (HUNGERBAR_HUD_ALIGN=${env.HUNGERBAR_HUD_ALIGN} wins over the file)` : '';
  return `look ${cfg.look}${forced}, hud.fable ${cfg.hud.fable}, hud.minWidth ${cfg.hud.minWidth}, hud.align ${cfg.hud.align}${aligned}`;
}

/** n columns, or 1 column. */
const columns = (n: number): string => `${n} column${n === 1 ? '' : 's'}`;

/**
 * Where the HUD sits in this terminal: at the left edge, or for center how far it moves here (at most: less when its
 * widest line would pass the budget's edge), or why it does not move here. It follows the gate: where classic draws
 * nothing moves, and with look classic it says where the HUD would sit (the verdict as if look were hud).
 */
export function alignNote(cfg: Config, g: GateHere): string {
  if (cfg.hud.align === 'left') return 'hud.align left: the HUD starts at the left edge';
  const classic = !g.gate.ok && g.gate.reason === 'look is classic';
  const gate = classic ? g.hud : g.gate;
  const head = classic ? 'hud.align center: look is classic, so nothing moves; ' : 'hud.align center: ';
  if (!gate.ok) return classic ? `${head}the HUD would not draw here either: ${gate.reason}` : `${head}nothing moves here, because classic draws instead of the HUD: ${gate.reason}`;
  const [moves, stays] = classic ? ['would move', 'would stay'] : ['moves', 'stays'];
  const b = g.budget;
  if (b === null) {
    return classic
      ? `${head}the width is unknown here, so the HUD would stay at the left edge; Claude Code passes COLUMNS on every render, so there it would be centred and follow the window`
      : `${head}the width is unknown here, so the HUD stays at the left edge; Claude Code passes COLUMNS on every render, so there it is centred and follows the window`;
  }
  const o = centreOffset(b, 0);
  return o > 0
    ? `${head}budget ${b} here, so the HUD ${moves} up to ${columns(o)} right (the hotbar's centre from col ${HOTBAR_CENTRE} to col ${HOTBAR_CENTRE + o}), less when its widest line would pass the edge`
    : `${head}budget ${b} here is too narrow to move the HUD (the hotbar's centre is col ${HOTBAR_CENTRE}), so it ${stays} at the left edge`;
}

/** A Fable option that cannot show, because the usage API or scopedWeekly is off; null when it can (or is off). */
export function fableWarning(cfg: Config, env: Env): string | null {
  if (cfg.hud.fable === 'off' || (usageEnabled(cfg, env) && cfg.network.scopedWeekly)) return null;
  return `hud.fable ${cfg.hud.fable} needs network.usageApi and network.scopedWeekly: without them the HUD draws no Fable (hungerbar look hud --fable ${cfg.hud.fable} turns them on)`;
}

/**
 * For a setup that asked no questions (no terminal, or flags; SPEC §0.10): what of the HUD uses the network and still
 * waits for the user's yes, since nothing turns it on by itself, and the command that does (it says first what it reads
 * and sends); null when nothing does. A no the user already gave is not waiting: Fable is left out when hungerbar.json
 * (`file`, as it is after setup) sets network.usageApi or network.scopedWeekly to false, and the PR status when it sets
 * hud.pr. The PR status is named only where gh is found, as setup asks about it only there. A key the flags named
 * (`choice`) was answered too.
 */
export function networkHint(cfg: Config, env: Env, file: Obj | null, choice: LookChoice | null = null): string | null {
  const said = (group: string, k: string): unknown => (file && isObj(file[group]) ? (file[group] as Obj)[k] : undefined);
  const fable = cfg.hud.fable !== 'off' && !(cfg.network.usageApi && cfg.network.scopedWeekly) && choice?.fable === undefined
    && said('network', 'usageApi') !== false && said('network', 'scopedWeekly') !== false;
  const pr = cfg.hud.pr === 'off' && choice?.pr === undefined && said('hud', 'pr') === undefined && resolveGh(env) !== null;
  if (!fable && !pr) return null;
  const what = fable && pr ? "Fable's weekly limit and the pull request status use" : fable ? "Fable's weekly limit uses" : 'The pull request status uses';
  const flags = [...(fable ? [`--fable ${cfg.hud.fable}`] : []), ...(pr ? ['--pr on'] : [])].join(' ');
  return `${what} the network, so ${fable && pr ? 'they stay' : 'it stays'} off until you turn ${fable && pr ? 'them' : 'it'} on: hungerbar look hud ${flags}`;
}

/** How many history files the HUD keeps (cacheDir/hud). */
export function histFiles(env: Env): number {
  try {
    return readdirSync(join(cacheDir(env), 'hud')).filter((f) => f.endsWith('.json')).length;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// previews and the prompt
// ---------------------------------------------------------------------------------------------------------------------

/**
 * A demo situation drawn in memory, as the status line would draw it at this depth (the classic lines at an unknown
 * width; the HUD's spans with its frame, encoded at 256 or 24-bit colour, else their bare text). Nothing is read from or written to
 * disk. A Fable option is drawn as it shows once on: with the usage API and scopedWeekly. With a `width` (a terminal's
 * columns, as HUNGERBAR_WIDTH) the HUD sits where base.hud.align puts it in that window; without one it is at the left edge.
 * `who` (0.7.0) is who the HUD draws on line 3 as base.hud.user and hud.op ask: without one, no name and no mark.
 */
export function demoLines(situation: string, look: Look, fable: HudFable, depth: Depth, base: Config, width: number | null = null, who?: WhoSource): string[] {
  const d = DEMOS[situation]!;
  const run = (cfg: Config): ReturnType<typeof renderPayload> =>
    renderPayload(JSON.stringify(d.payload), { env: {}, config: cfg, sources: demoSources(d, who), now: DEMO_NOW });
  if (look === 'classic') {
    const cfg: Config = { ...base, look, color: depth === 'none' ? 'never' : 'always', colorDepth: depth === 'none' ? 'auto' : depth };
    return run(cfg).text.split('\n');
  }
  const cfg: Config = {
    ...base, look, icons: 'minecraft', color: 'always', colorDepth: 'truecolor', hud: { ...base.hud, fable },
    network: { ...base.network, usageApi: true, scopedWeekly: true },
  };
  const framed = run(cfg).hud!.framed;
  const lines = width === null ? framed : shiftHud(framed, hudOffset(base.hud.align, budget({ HUNGERBAR_WIDTH: String(width) }, base), framed));
  return depth === 'truecolor' || depth === '256' ? encode(lines, depth, base).split('\n') : lines.map((l) => l.map((s) => s.t).join(''));
}

/** The window the align question's preview is drawn in: HUNGERBAR_WIDTH, else this terminal's columns, else COLUMNS, else 120. */
export function previewWidth(env: Env): number {
  const tty = isatty(1) && process.stdout.columns > 0 ? process.stdout.columns : null;
  return intEnv(env, 'HUNGERBAR_WIDTH') ?? tty ?? intEnv(env, 'COLUMNS') ?? 120;
}

/** A note's sentences: each ends at a full stop followed by a space or the end. */
export const sentences = (note: string): string[] => note.split(/(?<=\.)\s+/);

/**
 * What tells a Fable option apart in the prompt: the first sentence of its note that no other option's note has. tail,
 * tooltip and boss open with the same sentence (Fable's grey note on Opus), so their first sentences would all read
 * alike; the line shown is what each does while Fable is in use. The notes stay the reference's, verbatim.
 */
export function ownSentence(i: number, notes: readonly string[] = FABLE_OPTIONS.map((o) => o.note)): string {
  const others = new Set(notes.flatMap((n, j) => (j === i ? [] : sentences(n))));
  const own = sentences(notes[i]!);
  return own.find((s) => !others.has(s)) ?? own[0]!;
}

/**
 * The prompt's wording over the reference's, which FABLE_OPTIONS keeps verbatim. The notes count the engine's lines; the
 * hotbar's frame (0.5.1) adds one under the hotbar, so the boss bar is the sixth line, not the fifth. The boss bar has no
 * name since SPEC §0.11 (the line below names the model), so it no longer shows "the word Fable". And "as today"
 * compared the off option with the status line of the design chat, which means nothing to a new user.
 */
const PROMPT_WORDING: readonly (readonly [string, string])[] = [
  ['a fifth line appears on top', 'a sixth line appears on top'],
  ['in Minecraft: the word Fable and a long pink bar', 'in Minecraft: a long pink bar'],
  ['No Fable (as today)', 'No Fable'],
  ['Nothing about Fable on the status line, as today.', 'Nothing about Fable on the status line.'],
];
const reworded = (s: string): string => PROMPT_WORDING.reduce((t, [was, is]) => t.replace(was, is), s);
/** The line under a Fable option in setup's prompt: ownSentence in the prompt's wording. */
export const promptSentence = (i: number): string => reworded(ownSentence(i));
/** A Fable option's name in setup's prompt, in the prompt's wording. */
export const promptName = (i: number): string => reworded(FABLE_OPTIONS[i]!.name);

/** Questions on the terminal, or on piped stdin under HUNGERBAR_SETUP_TTY=1 (the tests). null: input ended (EOF, Ctrl+C). */
export interface Prompter { ask(question: string): Promise<string | null>; close(): void }

export function stdinPrompter(): Prompter {
  const terminal = isatty(0) && isatty(1);
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal });
  // the iterator buffers lines, so piped answers that arrive together are not lost between two questions
  const lines = rl[Symbol.asyncIterator]();
  // Input that ends without a newline closes readline as it yields that last line; prompting after that throws
  // ERR_USE_AFTER_CLOSE. Once closed the question is just written, and the iterator gives any line still buffered, else done.
  let closed = false;
  rl.on('close', () => { closed = true; });
  rl.on('SIGINT', () => rl.close());
  return {
    async ask(q) {
      if (closed) process.stdout.write(q);
      else {
        rl.setPrompt(q);
        rl.prompt();
      }
      const r = await lines.next();
      if (r.done) {
        process.stdout.write('\n');
        return null;
      }
      if (!terminal) process.stdout.write(r.value + '\n');   // piped answers are not echoed
      return r.value;
    },
    close: () => rl.close(),
  };
}

async function choose<T>(p: Prompter, q: string, answers: ReadonlyMap<string, T>, again: string): Promise<T | null> {
  for (;;) {
    const a = await p.ask(q);
    if (a === null) return null;
    const v = answers.get(a.trim().toLowerCase());
    if (v !== undefined) return v;
    say(again);
  }
}

/** A yes-or-no question, `[Y/n]` or `[y/N]` by what Enter takes (`dflt`); null when the input ended. */
function yesNo(p: Prompter, q: string, dflt: boolean): Promise<boolean | null> {
  const answers = new Map<string, boolean>([['', dflt], ['y', true], ['yes', true], ['on', true], ['n', false], ['no', false], ['off', false]]);
  return choose(p, `${q} [${dflt ? 'Y/n' : 'y/N'}]: `, answers, 'Answer y (yes) or n (no).');
}

/**
 * setup's questions (plan §8): the look, each with its demo preview, then for the HUD the Fable option, each with its
 * name, the sentence of its note that sets it apart, a preview with Fable 5.1 in use and the weekly line on Opus, then
 * where the HUD sits (0.6.0): left, or centred, with a preview of the normal day centred in this window (previewWidth).
 * Then (0.7.0) your name before the folder (hud.user) and the operator's mark (hud.op), each with line 3 of the normal day
 * as this machine's names draw it (the operator's previews as if Claude Code ran elevated, and the question says whether
 * this terminal does), and, only when gh is found here, the pull request status (hud.pr) with the tight day's line 4. Every
 * preview draws with `who` (whoAmI: this machine's names and elevation) as base asks. Enter keeps what `file`
 * (hungerbar.json as strict JSON, null when there is none) already has, marked (current); with no file it takes the
 * defaults (SPEC §0.10): the HUD, boss, centre, the user name and gold, marked (default).
 * What uses the network is a yes-or-no question after its consent text (SPEC §0.10). The usage API comes right after the
 * Fable answer when that option is not off and hungerbar.json does not have network.usageApi and network.scopedWeekly
 * on (with the usage API on already, the question is about scopedWeekly alone); no makes the option off and writes the
 * key it asked about as false (`network`). Each of the two questions pre-selects yes unless the file has its key
 * (network.usageApi or network.scopedWeekly, hud.pr), and then what the file has. A PR answer is written even when it is
 * the default (`answered`). So a no to either stays a no at the next setup's Enter. null when the input ended before an
 * answer.
 */
export async function promptLook(p: Prompter, env: Env, base: Config, file: Obj | null): Promise<LookChoice | null> {
  const depth = detectDepth(base.color, base.colorDepth, env);
  const cur = merge(file ?? {}), mark = file ? ' (current)' : ' (default)';
  const who = whoAmI(env);
  say('Which look should the status line have? (The previews use made-up numbers.)');
  say(`\n  1  Classic Plus${cur.look === 'classic' ? mark : ''}`);
  for (const l of demoLines('normal', 'classic', 'off', depth, base, null, who)) say(l);
  say(`\n  2  Minecraft HUD${cur.look === 'hud' ? mark : ''}`);
  for (const l of demoLines('normal', 'hud', 'off', depth, base, null, who)) say(l);
  say('');
  const looks = new Map<string, Look>([['', cur.look], ['1', 'classic'], ['classic', 'classic'], ['2', 'hud'], ['hud', 'hud']]);
  const look = await choose(p, `Look [${cur.look === 'hud' ? 2 : 1}]: `, looks, 'Answer 1 (Classic Plus) or 2 (Minecraft HUD).');
  if (look === null) return null;
  if (look === 'classic') return { look };

  say("\nThe HUD can also show Fable's weekly limit. Each preview: Fable 5.1 in use, then the weekly line on Opus.");
  const fables = new Map<string, HudFable>([['', cur.hud.fable]]);
  let enter = 0;
  for (const [i, o] of FABLE_OPTIONS.entries()) {
    const id = fableId(o.id);
    fables.set(String(i), id).set(id, id).set(o.id, id);
    if (id === cur.hud.fable) enter = i;
    say(`\n  ${i}  ${promptName(i)}${id === cur.hud.fable ? mark : ''}`);
    say(`     ${promptSentence(i)}`);
    for (const l of demoLines('fable', 'hud', id, depth, base, null, who)) say(l);
    say('     on Opus, the weekly line:');
    say(demoLines('normal', 'hud', id, depth, base, null, who)[1]!);
  }
  say('');
  let fable = await choose(p, `Fable [${enter}]: `, fables, `Answer a number from 0 to ${FABLE_OPTIONS.length - 1}.`);
  if (fable === null) return null;
  // The consent questions pre-select yes, unless hungerbar.json has the key they ask about, set to off: Enter keeps that.
  const has = (group: unknown, k: string): boolean => isObj(group) && group[k] !== undefined;
  // the usage API the Fable options need: asked now, after what it reads and sends, unless the file has it on already;
  // with the usage API on and only scopedWeekly off, the question is about scopedWeekly. A no is written as false.
  let network: LookChoice['network'];
  if (fable !== 'off' && !(cur.network.usageApi && cur.network.scopedWeekly)) {
    const scoped = cur.network.usageApi, key = scoped ? 'scopedWeekly' : 'usageApi';
    say('');
    for (const l of consentLines(env, scoped ? 'scoped' : true)) say(l);
    say('');
    const yes = await yesNo(p, scoped ? "Turn on Fable's weekly (network.scopedWeekly)?" : 'Turn on the usage API?', !has(file?.network, key));
    if (yes === null) return null;
    if (!yes) {
      say(scoped
        ? `Fable's weekly stays off (network.scopedWeekly false), so the HUD shows no Fable weekly (hud.fable off). The usage API stays on. Later: hungerbar look hud --fable ${fable}`
        : `The usage API stays off (network.usageApi false), so the HUD shows no Fable weekly (hud.fable off). Later: hungerbar look hud --fable ${fable}`);
      fable = 'off';
      network = scoped ? { scopedWeekly: false } : { usageApi: false };
    }
  }

  const cols = previewWidth(env);
  say('\nWhere should the HUD sit? Claude Code passes its width on every render, so a centred HUD follows the window.');
  say(`\n  1  Left${cur.hud.align === 'left' ? mark : ''}`);
  say('     at the left edge of the status line');
  say(`\n  2  Centre${cur.hud.align === 'center' ? mark : ''}`);
  say(`     the hotbar in the middle of the status line, like Minecraft's; in a ${cols}-column window:`);
  for (const l of demoLines('normal', 'hud', fable, depth, { ...base, hud: { ...base.hud, align: 'center' } }, cols, who)) say(l);
  say('');
  const aligns = new Map<string, HudAlign>([['', cur.hud.align], ['1', 'left'], ['left', 'left'], ['2', 'center'], ['center', 'center'], ['centre', 'center']]);
  const align = await choose(p, `Align [${cur.hud.align === 'center' ? 2 : 1}]: `, aligns, 'Answer 1 (left) or 2 (centre).');
  if (align === null) return null;

  // 0.7.0, the player: one line of a situation at the left edge, `from` lines from the bottom (the frame's row is 1, the
  // hotbar line 2, the XP line 3), drawn with the chosen Fable option and these hud keys
  const line = (from: number, situation: string, hud: Partial<Config['hud']>, w: WhoSource): string => {
    const ls = demoLines(situation, 'hud', fable, depth, { ...base, hud: { ...base.hud, align: 'left', ...hud } }, null, w);
    return ls[ls.length - from]!;
  };
  const plainWho: WhoSource = { ...who, elevated: () => false }, opWho: WhoSource = { ...who, elevated: () => true };
  say("\nYour name can go before the folder on line 3, in the folder's grey, like a line of Minecraft's chat.");
  const USERS: ReadonlyArray<readonly [HudUser, string]> = [
    ['off', 'No name'], ['user', 'Your user name'], ['user@host', "Your user name and this computer's name, for when you work on more than one"],
  ];
  for (const [i, [u, label]] of USERS.entries()) {
    say(`\n  ${i + 1}  ${label}${u === cur.hud.user ? mark : ''}`);
    say(line(3, 'normal', { user: u, op: 'off' }, plainWho));
  }
  say('');
  const users = new Map<string, HudUser>([['', cur.hud.user], ['1', 'off'], ['off', 'off'], ['2', 'user'], ['user', 'user'], ['3', 'user@host'], ['user@host', 'user@host']]);
  const user = await choose(p, `Name [${USERS.findIndex(([u]) => u === cur.hud.user) + 1}]: `, users, 'Answer 1 (no name), 2 (user) or 3 (user@host).');
  if (user === null) return null;

  const as = elevatedAs();
  say(`\nWhile Claude Code runs ${as}, the HUD can mark you as the server's operator. ${elevated(env) ? `This terminal runs ${as}, so you would see it now.` : 'This terminal does not, so you would not see it now; the previews show it as if it did.'}`);
  const named = user !== 'off';
  const OPS: ReadonlyArray<readonly [HudOp, string]> = [
    ['tag', named ? 'A red [OP] before your name' : 'A red [OP] after the ⌂'], ['gold', named ? 'Your name turns gold' : 'The ⌂ turns gold'], ['off', 'Nothing'],
  ];
  for (const [i, [o, label]] of OPS.entries()) {
    say(`\n  ${i + 1}  ${label}${o === cur.hud.op ? mark : ''}`);
    say(line(3, 'normal', { user, op: o }, opWho));
  }
  say('');
  const ops = new Map<string, HudOp>([['', cur.hud.op], ['1', 'tag'], ['tag', 'tag'], ['2', 'gold'], ['gold', 'gold'], ['3', 'off'], ['off', 'off']]);
  const op = await choose(p, `Operator [${OPS.findIndex(([o]) => o === cur.hud.op) + 1}]: `, ops, 'Answer 1 (tag), 2 (gold) or 3 (nothing).');
  if (op === null) return null;

  // the pull request status uses the network through the user's own gh: offered only where gh is found
  let pr: HudPr | null = null;
  if (resolveGh(env)) {
    say("\nThe HUD can show the branch's pull request and its checks after the branch. On a feature branch:");
    say(line(2, 'tight', { user, op, pr: 'on' }, who));
    say('     #128, then gold ● checks running, green ✓ passed or red × failed, then at most one more: ✓ approved,');
    say('     yellow ± changes requested, red ‼ a conflict with the base branch or grey ◌ a draft.');
    say('');
    for (const l of prConsentLines(env)) say(l);
    say('');
    const on = await yesNo(p, 'Show the pull request status?', has(file?.hud, 'pr') ? cur.hud.pr === 'on' : true);
    if (on === null) return null;
    pr = on ? 'on' : 'off';
  }
  return { look, fable, align, ...(pr !== null ? { pr, answered: ['pr'] as const } : {}), user, op, ...(network ? { network } : {}) };
}

// ---------------------------------------------------------------------------------------------------------------------
// the command
// ---------------------------------------------------------------------------------------------------------------------

const USAGE = `usage: hungerbar look [classic|hud] [--fable ${FABLE_HELP}] [--align ${ALIGN_HELP}] ${HUD_FLAGS_HELP} [--print]`;

function fail(msg: string): number {
  process.stderr.write(`hungerbar: ${msg}\n${USAGE}\n`);
  return 1;
}

/**
 * The look, its options, this terminal's verdict, the usage API, the PR status and the player's options here, as
 * `hungerbar look` prints them with no argument.
 */
function status(env: Env): number {
  const loaded = loadConfig(env), cfg = loaded.cfg;
  say(`hungerbar.json: ${loaded.path}${loaded.error ? ` is invalid JSON (${loaded.error}): the status line draws classic with cfg! until it is fixed` : existsSync(loaded.path) ? '' : ' (not present, defaults)'}`);
  say(lookSummary(cfg, env));
  const g = gateHere(cfg, loaded.error, env);
  say(`${verdict(g)} (this terminal; Claude Code runs the status line in its own environment)`);
  say(`usage API ${usageEnabled(cfg, env) ? 'on' : 'off'}, scopedWeekly ${cfg.network.scopedWeekly ? 'on' : 'off'}`);
  const w = fableWarning(cfg, env);
  if (w) say(`note: ${w}`);
  if (cfg.look === 'hud' || cfg.hud.align === 'center') say(`${alignNote(cfg, g)} (this terminal)`);
  say(prSummary(cfg, env));
  say(userSummary(cfg, env));
  say(opSummary(cfg, env));
  say(idleSummary(cfg));
  say(`switch with: hungerbar look classic   or   hungerbar look hud [--fable ${FABLE_HELP}] [--align ${ALIGN_HELP}] [--pr ${PR_HELP}]`);
  say(`the player: hungerbar look hud ${HUD_FLAG_KEYS.filter((k) => k !== 'pr').map((k) => `[--${k} ${hudHelp(k)}]`).join(' ')}`);
  return 0;
}

/**
 * Prints a plan's change (the diff, the consent text for a Fable option or for turning the PR status on); writes it
 * unless print. 0, or 1 on a failed write.
 */
export function reportPlan(p: ConfigPlan, env: Env, print: boolean, consent: boolean): number {
  say(`hungerbar.json: ${p.file.path}${p.file.exists ? '' : p.changed ? ' (will be created)' : ' (not present)'}`);
  if (!p.changed) {
    const opts = choiceOptions(p.choice);
    say(`already look ${p.choice.look}${opts.length ? ` with ${opts.join(', ')}` : ''}: nothing to change.`);
    return 0;
  }
  for (const l of diffLines(p.before, p.next)) say(l);
  if (consent && p.choice.fable !== undefined && p.choice.fable !== 'off') for (const l of consentLines(env)) say(l);
  if (consent && p.choice.pr === 'on' && merge(p.before).hud.pr !== 'on') for (const l of prConsentLines(env)) say(l);
  if (print) return 0;
  try {
    const bak = applyConfig(p);
    if (bak) say(`backup: ${bak}`);
  } catch (e) {
    process.stderr.write(`hungerbar: could not write ${p.file.path} (${(e as NodeJS.ErrnoException).code ?? (e as Error).message}); nothing changed.\n`);
    return 1;
  }
  return 0;
}

/** The notes after a choice is written: what the player's options it set show here (0.7.0). */
export function playerNotes(c: LookChoice, cfg: Config, env: Env): string[] {
  return [
    ...(c.user !== undefined ? [userSummary(cfg, env)] : []),
    ...(c.op !== undefined || (c.user !== undefined && cfg.hud.op !== 'off') ? [opSummary(cfg, env)] : []),
    ...(c.bed !== undefined || c.phantoms !== undefined ? [idleSummary(cfg)] : []),
  ];
}

export function look(argv: string[], env: Env, self: string): number {
  const valued = ['fable', 'align', ...HUD_FLAG_KEYS];
  const a = parseArgs(argv, valued);
  const opt = optionError(a, valued, ['print']);
  if (opt) return fail(opt);
  if (a.rest.length > 1) return fail(`one look at a time (got ${a.rest.join(' ')})`);
  const lk = a.rest[0] === undefined ? null : parseLook(a.rest[0]);
  if (a.rest[0] !== undefined && !lk) return fail(`unknown look "${a.rest[0]}"`);
  const o = hudOptions(a, lk !== 'hud', 'hungerbar look hud');
  if (!o.ok) return fail(o.error);
  if (!lk) return status(env);

  const choice: LookChoice = { look: lk, ...o.value };
  let plan: ConfigPlan;
  try {
    plan = planConfig(configFile(env), choice, schemaFor(self));
  } catch (e) {
    process.stderr.write(`hungerbar: ${(e as Error).message}\n`);
    return 1;
  }
  const print = a.flags.has('print');
  const r = reportPlan(plan, env, print, true);
  if (r !== 0) return r;
  if (print) {
    say('Nothing was written (--print).');
    return 0;
  }
  // the way back: look classic keeps every hud key, so `look hud` brings the HUD back as it was; from classic it is
  // `look classic`; on a HUD that stays the HUD, the values its options had. No look command turns the network keys a
  // Fable option turned on off again (--fable off leaves them), so a note names the key that does.
  const was = merge(plan.before), now = merge(plan.next);
  const undo = (['fable', 'align', ...HUD_FLAG_KEYS] as const).flatMap((k) => (choice[k] !== undefined && choice[k] !== was.hud[k] ? [`--${k} ${was.hud[k]}`] : []));
  const back = lk === 'classic' ? 'hud' : was.look === 'classic' ? 'classic' : undo.length ? `hud ${undo.join(' ')}` : null;
  if (plan.changed) say(`Claude Code draws the new look on its next render; settings.json is untouched.${back ? ` Back with: hungerbar look ${back}` : ''}`);
  if (!was.network.usageApi && now.network.usageApi) say('To turn the usage API off again, set network.usageApi to false in hungerbar.json; --fable off leaves it on.');
  else if (!was.network.scopedWeekly && now.network.scopedWeekly) say("To turn Fable's weekly off again, set network.scopedWeekly to false in hungerbar.json; --fable off leaves it on.");
  const after = loadConfig(env);
  if (env.HUNGERBAR_LOOK && env.HUNGERBAR_LOOK !== lk && (env.HUNGERBAR_LOOK === 'classic' || env.HUNGERBAR_LOOK === 'hud')) {
    say(`note: HUNGERBAR_LOOK=${env.HUNGERBAR_LOOK} is set here and wins over the file.`);
  }
  if (choice.align !== undefined && (env.HUNGERBAR_HUD_ALIGN === 'left' || env.HUNGERBAR_HUD_ALIGN === 'center') && env.HUNGERBAR_HUD_ALIGN !== choice.align) {
    say(`note: HUNGERBAR_HUD_ALIGN=${env.HUNGERBAR_HUD_ALIGN} is set here and wins over the file.`);
  }
  const here = gateHere(after.cfg, after.error, env);
  if (lk === 'hud') say(`${verdict(here)} (this terminal)`);
  if (choice.align !== undefined) say(`${alignNote(after.cfg, here)} (this terminal)`);
  for (const l of playerNotes(choice, after.cfg, env)) say(l);
  try {
    const sl = (readSettings(settingsPath(env)).obj.statusLine ?? null) as StatusLine | null;
    if (!isHungerbar(sl, env, self)) say("note: Claude Code's statusLine does not run Hungerbar yet: hungerbar setup");
  } catch { /* doctor reports an unreadable settings.json */ }
  return 0;
}
