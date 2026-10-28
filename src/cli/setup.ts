// `hungerbar setup`: merges ONLY the statusLine key into settings.json, with a backup and a way back (SPEC §13, §14).
// The look goes to hungerbar.json through look.ts's writer: --look classic|hud [--fable …] [--align …] and the 0.7.0 keys
// (--pr, --user, --op, --bed, --phantoms), or questions on a terminal (plan §8). When it asks no questions (no terminal,
// or flags) setup prints how to turn on the HUD when no look is named and the look is classic, or, with the HUD, what of
// it uses the network and still waits for a yes (SPEC §0.10); with no look named and a hungerbar.json it cannot read,
// the note that the file is left alone instead.
import { copyFileSync, existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isatty } from 'node:tty';
import { pathToFileURL } from 'node:url';
import { applyEnv, loadConfig, merge } from '../config.ts';
import { claudeDir, flag, slash, type Env } from '../env.ts';
import { cacheDir, readJson, writeAtomic, writeJson } from '../store.ts';
import { optionError, parseArgs, say } from './args.ts';
import { iconSummary, icons, parseStyle } from './icons.ts';
import {
  choiceOptions, configFile, ConfigRefused, HUD_OPTION_NAMES, hudOptions, lookFlag, networkHint, planConfig, promptLook, reportPlan, schemaFor, stdinPrompter,
  type ConfigPlan, type LookChoice,
} from './look.ts';

export interface StatusLine {
  type?: string;
  command?: string;
  padding?: number;
  refreshInterval?: number;
  [k: string]: unknown;
}

interface Previous {
  v: 1;
  settingsPath: string;
  backup: string | null;
  statusLine: StatusLine | null;
  at: string;
}

export interface SettingsFile {
  path: string;
  exists: boolean;
  bytes: Buffer | null;
  obj: Record<string, unknown>;
  crlf: boolean;
  finalNewline: boolean;
}

export function settingsPath(env: Env): string {
  const p = join(claudeDir(env), 'settings.json');
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

export function readSettings(path: string): SettingsFile {
  if (!existsSync(path)) return { path, exists: false, bytes: null, obj: {}, crlf: false, finalNewline: true };
  const bytes = readFileSync(path);
  const text = bytes.toString('utf8').replace(/^\uFEFF/, '');
  const obj: unknown = text.trim() ? JSON.parse(text) : {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error(`${path} is not a JSON object`);
  return { path, exists: true, bytes, obj: obj as Record<string, unknown>, crlf: text.includes('\r\n'), finalNewline: /\n$/.test(text) };
}

/** UTF-8 without a BOM, 2-space indent, CRLF kept if the file used it. */
export function formatSettings(obj: Record<string, unknown>, crlf: boolean, finalNewline: boolean): string {
  const s = JSON.stringify(obj, null, 2) + (finalNewline ? '\n' : '');
  return crlf ? s.replace(/\n/g, '\r\n') : s;
}

/** Replaces the key where it is, so the order of the other keys is kept; a new key goes last. */
export function withKey(obj: Record<string, unknown>, key: string, value: unknown): Record<string, unknown> {
  if (value === undefined) {
    const { [key]: _gone, ...rest } = obj;
    return rest;
  }
  return key in obj ? Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, k === key ? value : v])) : { ...obj, [key]: value };
}

export function stamp(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** True for a command that setup wrote: it names hungerbar, our launcher or this bundle. */
export function isHungerbar(sl: unknown, env: Env, self: string): boolean {
  const cmd = (sl as StatusLine | null)?.command;
  if (typeof cmd !== 'string') return false;
  const c = slash(cmd).toLowerCase();
  return /hungerbar/.test(c) || c.includes(slash(launcherPath(env)).toLowerCase()) || c.includes(slash(self).toLowerCase());
}

export function launcherPath(env: Env): string {
  return join(cacheDir(env), 'statusline.cmd');
}

export function commandFor(node: string, self: string, direct: boolean, env: Env): string {
  if (process.platform !== 'win32') return `'${node}' '${self}'`;
  return direct ? `"${slash(node)}" "${slash(self)}"` : `exec "${slash(launcherPath(env))}"`;
}

export function launcherText(node: string, self: string): string {
  return `@echo off\r\n"${node.replace(/\//g, '\\')}" "${self.replace(/\//g, '\\')}"\r\n`;
}

const previousPath = (env: Env): string => join(cacheDir(env), 'previous-statusline.json');

/** Copies the file to <path>.bak.<stamp> (-2, -3 … when taken); null when there is no file. */
export function backup(f: SettingsFile): string | null {
  if (!f.exists) return null;
  const base = `${f.path}.bak.${stamp()}`;
  let to = base;
  for (let i = 2; existsSync(to); i++) to = `${base}-${i}`;
  copyFileSync(f.path, to);
  return to;
}

/** Claude Code's terminal, or piped answers under HUNGERBAR_SETUP_TTY=1 (the tests): setup may ask its questions. */
const canAsk = (env: Env): boolean => (isatty(0) && isatty(1)) || flag(env, 'HUNGERBAR_SETUP_TTY');

export const HUD_HINT = 'Minecraft HUD: hungerbar look hud [--fable boss] [--pr on]';

// look.ts imports this module, so its option names are read when setup runs, not when this module loads
const setupValued = (): string[] => ['node', 'icons', 'look', ...HUD_OPTION_NAMES];
const SETUP_BARE = ['print', 'restore', 'launcher', 'direct'];

/** `<path> cannot be read as a JSON object (<why>)`; a reason that names the file already (`<path> is not a JSON object`) stands alone. */
const unreadable = (path: string, why: string): string => (why.includes(path) ? why : `${path} cannot be read as a JSON object (${why})`);

/** The one-line note for a hungerbar.json that setup leaves alone while it still sets up the statusLine: why, and the way on. */
const leftAlone = (path: string, why: string, skipped: string): string =>
  `hungerbar: ${unreadable(path, why)}; ${skipped}hungerbar.json is left alone. Once it is fixed: hungerbar look hud\n`;

export async function setup(argv: string[], env: Env, self: string): Promise<number> {
  const valued = setupValued();
  const a = parseArgs(argv, valued);
  // An unknown option or argument (a typo such as --fabel) is refused before anything is read for writing, --restore included.
  const opt = optionError(a, valued, SETUP_BARE) ?? (a.rest.length ? `unexpected argument "${a.rest[0]}"` : null);
  if (opt) {
    process.stderr.write(`hungerbar: ${opt} (see hungerbar --help)\n`);
    return 1;
  }
  if (a.flags.has('restore')) {
    const other = [...a.flags, ...a.values.keys()].find((k) => k !== 'restore' && k !== 'print');
    if (other !== undefined) {
      process.stderr.write(`hungerbar: --restore takes only --print (got --${other})\n`);
      return 1;
    }
    return restore(env, a.flags.has('print'));
  }
  const print = a.flags.has('print');
  // Checked before anything is written, so a typo never leaves a half-done setup.
  const style = a.values.get('icons');
  if (a.flags.has('icons') || (style !== undefined && !parseStyle(style))) {
    process.stderr.write(`hungerbar: --icons takes plain or colour${style ? ` (got "${style}")` : ''}
`);
    return 1;
  }
  const lk = lookFlag(a);
  if (!lk.ok) {
    process.stderr.write(`hungerbar: ${lk.error}\n`);
    return 1;
  }
  const opts = hudOptions(a, lk.value !== 'hud', '--look hud');
  if (!opts.ok) {
    process.stderr.write(`hungerbar: ${opts.error}\n`);
    return 1;
  }
  // settings.json is read before the look and its questions: one that cannot be read refuses setup before anything is asked or written.
  const sPath = settingsPath(env);
  let f: SettingsFile;
  try {
    f = readSettings(sPath);
  } catch (e) {
    process.stderr.write(`hungerbar: ${unreadable(sPath, (e as Error).message)}; nothing was written.\n`);
    return 1;
  }
  // The look: from the flags, else asked on a terminal (never under --print). An unreadable hungerbar.json is refused
  // before any write when a flag asks for a look; before the questions it only skips them (the statusLine is still set up).
  const cfgPath = configFile(env), schema = schemaFor(self);
  /** The config plan, or why hungerbar.json was refused. */
  const tryPlan = (c: LookChoice): ConfigPlan | ConfigRefused => {
    try {
      return planConfig(cfgPath, c, schema);
    } catch (e) {
      if (e instanceof ConfigRefused) return e;
      throw e;
    }
  };
  let plan: ConfigPlan | ConfigRefused | null = null, asked = false, skipped = false;
  if (lk.value !== null) plan = tryPlan({ look: lk.value, ...opts.value });
  else if (!print && canAsk(env)) {
    const readable = tryPlan({ look: 'classic' });
    if (readable instanceof ConfigRefused) {
      // not the refusal: that one is for a look the user named, and says nothing was written, but the statusLine still is
      process.stderr.write(leftAlone(cfgPath, readable.why, 'the look question is skipped and '));
      skipped = true;
    } else {
      const p = stdinPrompter();
      let choice: LookChoice | null;
      try {
        choice = await promptLook(p, env, loadConfig(env).cfg, readable.file.exists ? readable.before : null);
      } finally {
        p.close();
      }
      if (!choice) {
        process.stderr.write('hungerbar: setup cancelled; nothing was written.\n');
        return 1;
      }
      asked = true;
      say('');
      plan = tryPlan(choice);
    }
  }
  if (plan instanceof ConfigRefused) {
    process.stderr.write(`hungerbar: ${plan.message}\n`);
    return 1;
  }
  const node = a.values.get('node') ?? process.execPath;
  // Direct is the default: the kill-storm left no orphans without the launcher, and it is ~55 ms faster (SPEC §0.5).
  const direct = !a.flags.has('launcher') || process.platform !== 'win32';
  const old = (f.obj.statusLine ?? null) as StatusLine | null;
  const next: StatusLine = {
    type: 'command',
    command: commandFor(node, self, direct, env),
    padding: typeof old?.padding === 'number' ? old.padding : 0,
    refreshInterval: typeof old?.refreshInterval === 'number' ? old.refreshInterval : 10,
  };
  const text = formatSettings(withKey(f.obj, 'statusLine', next), f.crlf, f.finalNewline);
  // for setups that asked no questions (unless the skip note gave the way): with no look named, the HUD when it is off;
  // with the HUD, what of it uses the network and still waits for a yes, since nothing turns that on by itself. With no
  // look named, an unreadable hungerbar.json gets the skip note's line instead, as look would refuse either command.
  const hint = (): void => {
    if (asked || skipped) return;
    let file: Record<string, unknown> | null = plan ? plan.next : null;
    if (!plan) {
      const now = tryPlan({ look: 'classic' });
      if (now instanceof ConfigRefused) {
        process.stderr.write(leftAlone(cfgPath, now.why, ''));
        return;
      }
      file = now.file.exists ? now.before : null;
    }
    const cfg = plan ? applyEnv(merge(plan.next), env) : loadConfig(env).cfg;
    if (cfg.look !== 'hud') {
      if (!plan) say(HUD_HINT);
      return;
    }
    const h = networkHint(cfg, env, file, plan?.choice ?? null);
    if (h) say(h);
  };
  if (print) {
    say(`settings: ${f.path}${f.exists ? '' : ' (will be created)'}`);
    say(`- statusLine: ${JSON.stringify(old)}`);
    say(`+ statusLine: ${JSON.stringify(next)}`);
    if (!direct) say(`launcher ${launcherPath(env)}:\n${launcherText(node, self).trimEnd()}`);
    if (plan) reportPlan(plan, env, true, !asked);
    hint();
    say('Nothing was written (--print).');
    return style ? icons([style, '--print'], env) : 0;
  }
  const bak = backup(f);
  if (!direct) writeAtomic(launcherPath(env), launcherText(node, self));
  if (!isHungerbar(old, env, self)) writeJson(previousPath(env), { v: 1, settingsPath: f.path, backup: bak, statusLine: old, at: new Date().toISOString() } satisfies Previous);
  writeAtomic(f.path, text);
  say(`statusLine → ${next.command}`);
  if (bak) say(`backup: ${bak}`);
  // then the look (plan §8): the writer's merge; with no look to write, a missing hungerbar.json is created as before
  let cfgFailed = false;
  if (plan?.changed) cfgFailed = reportPlan(plan, env, false, !asked) !== 0;
  else if (!existsSync(cfgPath) && schema) {
    writeAtomic(cfgPath, JSON.stringify({ $schema: pathToFileURL(schema).href }, null, 2) + '\n');
    say(`config: ${cfgPath} (defaults; see the $schema for every key)`);
  }
  if (plan && !plan.changed) say(`look: ${[plan.choice.look, ...choiceOptions(plan.choice)].join(', ')}, unchanged`);
  say('Claude Code picks the new command up on its next render. Undo with: hungerbar setup --restore');
  hint();
  if (cfgFailed) {
    say('The status line is set up; only the look could not be written (see above).');
    return 1;
  }
  if (style) {
    const r = icons([style], env);
    if (r !== 0) say('The status line is set up; only the icon style could not be changed (see above).');
    return r;
  }
  for (const { state } of iconSummary(env)) {
    if (state) say(`icons: ${state.style}. Two styles: plain (glyphs in Hungerbar's colours) or colour (emoji). Switch with: hungerbar icons ${state.style === 'plain' ? 'colour' : 'plain'}`);
  }
  return 0;
}

function sameExceptStatusLine(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return JSON.stringify(withKey(a, 'statusLine', undefined)) === JSON.stringify(withKey(b, 'statusLine', undefined));
}

/** Puts back what setup replaced: the backup bytes when nothing else changed since, else just the old statusLine. */
export function restore(env: Env, print: boolean): number {
  const prev = readJson<Previous>(previousPath(env));
  if (!prev || prev.v !== 1) {
    process.stderr.write('hungerbar: nothing to restore (no previous-statusline.json)\n');
    return 1;
  }
  const f = readSettings(settingsPath(env));
  let bytes: Buffer | string | null = null;
  if (prev.backup && existsSync(prev.backup)) {
    const b = readSettings(prev.backup);
    if (sameExceptStatusLine(b.obj, f.obj)) bytes = b.bytes;
  }
  if (bytes === null) bytes = formatSettings(withKey(f.obj, 'statusLine', prev.statusLine ?? undefined), f.crlf, f.finalNewline);
  if (print) {
    say(`would restore statusLine: ${JSON.stringify(prev.statusLine)} in ${f.path}`);
    return 0;
  }
  const bak = backup(f);
  writeFileSync(f.path, bytes);
  say(`statusLine restored: ${JSON.stringify(prev.statusLine)}`);
  if (bak) say(`backup of the Hungerbar settings: ${bak}`);
  // hungerbar.json is not part of the restore: the HUD look stays for the next setup
  if (loadConfig(env).cfg.look === 'hud') say('The look stays hud for a later setup (the restore leaves hungerbar.json alone); the classic lines: hungerbar look classic');
  return 0;
}
