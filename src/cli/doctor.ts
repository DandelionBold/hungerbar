// `hungerbar doctor`: what Claude Code will run, where the data lives, and how long a render takes (SPEC §13).
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { loadConfig, usageEnabled, type Config } from '../config.ts';
import { flag, nowSec, VERSION, type Env } from '../env.ts';
import { timeLeft } from '../format.ts';
import { findGit } from '../git/bin.ts';
import { statusArgs } from '../git/status.ts';
import { PR_ARGS } from '../pr/gh.ts';
import { childProcess } from '../proc.ts';
import { acctDir, cacheDir } from '../store.ts';
import { DEMOS } from '../demo.ts';
import { readUsage } from '../usage/file.ts';
import { parseArgs, say } from './args.ts';
import { iconSummary } from './icons.ts';
import {
  alignNote, fableWarning, gateHere, gateInputs, gitStateNote, histFiles, idleSummary, lookSummary, opSummary, prBlocked, prFiles, prSummary, userSummary,
  verdict,
} from './look.ts';
import { readSettings, settingsPath, type StatusLine } from './setup.ts';

const ok = (s: string): void => say(`  ok    ${s}`);
const warn = (s: string): void => say(`  warn  ${s}`);
const info = (s: string): void => say(`  ·     ${s}`);

/** Claude Code's own order for finding Git Bash on Windows; PowerShell when there is none. */
export function ccShell(env: Env): string | null {
  if (process.platform !== 'win32') return env.SHELL ?? '/bin/sh';
  const cands = [env.CLAUDE_CODE_GIT_BASH_PATH, 'C:/Program Files/Git/bin/bash.exe', 'C:/Program Files (x86)/Git/bin/bash.exe'];
  const git = findGit(env.PATH ?? env.Path ?? '');
  if (git) cands.push(join(dirname(git), '..', '..', 'bin', 'bash.exe'));
  return cands.find((c): c is string => !!c && existsSync(c)) ?? null;
}

/**
 * Every node.exe, git.exe and gh.exe here, one `<pid> <command line>` a line (Windows). The WMI query goes through
 * [wmisearcher], which needs no module: Get-CimInstance first loads CimCmdlets, and without PSModulePath, as in the
 * tests' trimmed environment, that took 22 to 37 s on GitHub's Windows runner against 0.23 s for this.
 */
export const LEFTOVER_PS = "([wmisearcher]\"SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name='node.exe' or Name='git.exe' or Name='gh.exe'\").Get() | ForEach-Object { \"$($_.ProcessId) $($_.CommandLine)\" }";

const STATUS = statusArgs('.');
/** The git refresher's status command after its root: `status --porcelain=v2 --branch`. */
const STATUS_TAIL = STATUS.slice(STATUS.indexOf('status')).join(' ');
/** The PR refresher's gh command: `pr view --json number,state,isDraft,…` with its exact fields. */
const GH_TAIL = PR_ARGS.join(' ');

/**
 * Whether a `<pid> <command line>` is a process Hungerbar started: a refresher (`hungerbar.mjs refresh …`), the git
 * refresher's diff (`--no-optional-locks … --shortstat`) or status (`--no-optional-locks … status --porcelain=v2
 * --branch`, 0.7.0), or the PR refresher's `gh pr view --json` with its exact fields (gh.exe, or node with the tests'
 * stub, 0.7.0). The user's own git and gh runs do not match; nor does this process's own line (its pid first).
 */
export function isLeftover(line: string, pid: number): boolean {
  if (line.trimStart().split(' ', 1)[0] === String(pid)) return false;
  if (/hungerbar\.mjs\b.*\brefresh\b/.test(line)) return true;
  if (/--no-optional-locks\b/.test(line) && (/--shortstat\b/.test(line) || line.includes(STATUS_TAIL))) return true;
  return line.includes(GH_TAIL);
}

/** The leftovers, or why the process list could not be read: then nothing was checked, so doctor must not say ok. */
function leftovers(): { lines: string[]; problem: string | null } {
  if (process.platform !== 'win32') return { lines: [], problem: null };
  const r = childProcess().spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', LEFTOVER_PS], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  const code = (r.error as NodeJS.ErrnoException | undefined)?.code;
  if (r.error) return { lines: [], problem: code === 'ETIMEDOUT' ? 'took over 15 s' : code === 'ENOENT' ? 'was not found' : r.error.message };
  if (r.status !== 0) return { lines: [], problem: `exited with ${r.status}${r.stderr ? ': ' + String(r.stderr).trim().split(/\r?\n/)[0] : ''}` };
  return {
    lines: String(r.stdout ?? '')
      .split(/\r?\n/)
      .filter((l) => isLeftover(l, process.pid)),
    problem: null,
  };
}

/** Said while HUNGERBAR_NO_SPAWN is set: no render queues a background worker. */
export const NO_SPAWN_WARNING = 'HUNGERBAR_NO_SPAWN is set: git, usage, the PR status and the transcript worker never refresh';

/** Times `command` the way Claude Code runs it: through the shell, payload piped in. Median of n runs, in ms. */
export function timeCommand(shell: string, command: string, payload: string, n: number, env: Env): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    childProcess().spawnSync(shell, ['-c', command], { input: payload, windowsHide: true, env: env as NodeJS.ProcessEnv, timeout: 10000 });
    out.push(performance.now() - t);
  }
  return out;
}

/**
 * Claude Code's statusLine.padding narrows the status line on both sides (2.1.312 draws COLUMNS - 4 - 2 x padding cells
 * and cuts the rest with an ellipsis, SPEC §0.9 *What Claude Code passes*), but COLUMNS is its full width and the budget
 * (layout.ts: COLUMNS - 4 - widthReserve) does not read settings.json, so a widthReserve below 2 x padding counts
 * columns as free that Claude Code does not draw: the fit, the HUD's gate and a centred HUD would use them. null when
 * widthReserve covers both sides.
 */
export function paddingWarning(sl: StatusLine | null, cfg: Pick<Config, 'widthReserve'>): string | null {
  const p = sl?.padding;
  if (typeof p !== 'number' || !(p > 0) || cfg.widthReserve >= 2 * p) return null;
  return `statusLine.padding ${p} is not read by Hungerbar and Claude Code pads both sides, ${2 * p} columns, but widthReserve is ${cfg.widthReserve}: set "widthReserve": ${2 * p} in hungerbar.json, so the fit, the HUD's gate and a centred HUD leave those columns free`;
}

export const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s[(s.length - 1) >> 1]! + s[s.length >> 1]!) / 2 : NaN;
};

/**
 * The look (plan §8): its options, whether this terminal would draw the HUD and why, where it sits here (hud.align), the
 * usage API the Fable options need, usage.json's scoped weekly limits, how many history files the HUD keeps, and (0.7.0)
 * where the git state comes from, the PR status here (a warning while it is on but cannot show) with how many answers
 * the PR cache keeps, the name line 3 shows here, whether this terminal runs elevated, the bed and the phantoms.
 */
function lookSection(cfg: Config, error: string | null, env: Env): void {
  say('\nLook');
  (cfg.look === 'hud' ? ok : info)(lookSummary(cfg, env));
  const g = gateHere(cfg, error, env);
  (g.gate.ok ? ok : cfg.look === 'hud' ? warn : info)(verdict(g));
  info(`here: ${gateInputs(g, cfg)} (Claude Code runs the status line in its own environment)`);
  info(alignNote(cfg, g));
  const api = usageEnabled(cfg, env);
  info(`usage API ${api ? 'on' : 'off'}, scopedWeekly ${cfg.network.scopedWeekly ? 'on' : 'off'}`);
  const w = fableWarning(cfg, env);
  if (w) warn(w);
  const u = readUsage(acctDir(env)), now = nowSec(env);
  if (u) {
    const age = `fetched ${timeLeft(now - u.at) ?? 'just now'}${now - u.at >= 60 ? ' ago' : ''}${u.error ? `, last error ${u.error}` : ''}`;
    if (!u.scoped.length) info(`usage.json: no scoped weekly limits (${age})`);
    for (const s of u.scoped) {
      const reset = s.resets_at === null ? 'no reset time' : s.resets_at > now ? `full again in ${timeLeft(s.resets_at - now)}` : 'reset passed (a full week until the next fetch)';
      info(`usage.json: ${s.name} ${Math.max(0, Math.round(100 - s.pct))}% left, ${reset} (${age})`);
    }
  } else if (api) info('usage.json: no data yet');
  info(`${histFiles(env)} HUD history file(s) in ${join(cacheDir(env), 'hud')}`);
  info(gitStateNote(cfg));
  (prBlocked(cfg, env) ? warn : info)(prSummary(cfg, env));
  if (cfg.hud.pr === 'on') info(`${prFiles(env)} pull request answer(s) in ${join(cacheDir(env), 'pr')}`);
  info(userSummary(cfg, env));
  info(opSummary(cfg, env));
  info(idleSummary(cfg));
}

export function doctor(argv: string[], env: Env, self: string): number {
  const a = parseArgs(argv, []);
  say(`hungerbar ${VERSION}`);
  say('\nRuntime');
  ok(`node ${process.version} at ${process.execPath}`);
  info(`bundle ${self}`);
  const shell = ccShell(env);
  if (process.platform === 'win32') shell ? ok(`Claude Code runs status lines through ${shell}`) : warn('no Git Bash found: Claude Code will use PowerShell');

  say('\nClaude Code settings');
  let sl: StatusLine | null = null;
  try {
    const f = readSettings(settingsPath(env));
    sl = (f.obj.statusLine ?? null) as StatusLine | null;
    info(f.path);
    if (!sl?.command) warn('no statusLine command set (run hungerbar setup)');
    else {
      const cmd = sl.command;
      (/hungerbar/i.test(cmd) ? ok : warn)(`statusLine.command = ${cmd}`);
      if (/\b(npx|bunx|pnpm dlx)\b/.test(cmd)) warn('npx/bunx in the command adds about 180 ms to every render');
      if (/\\/.test(cmd)) warn('backslashes in the command: Git Bash treats them as escapes, use forward slashes');
      if (/hungerbar/i.test(cmd) && !/node(\.exe)?["']?\s|statusline\.cmd/i.test(cmd)) warn('the command looks like an npm shim; use hungerbar setup for an absolute node path');
      info(`padding ${sl.padding ?? 'unset'}, refreshInterval ${sl.refreshInterval ?? 'unset'}`);
    }
    if (f.obj.disableAllHooks === true) warn('disableAllHooks is true: Claude Code also turns the status line off');
    if (f.obj.allowManagedHooksOnly === true) warn('allowManagedHooksOnly is true: a user status line may be ignored');
    info('the status line only runs in folders you have trusted in Claude Code');
  } catch (e) {
    warn(`settings.json unreadable: ${(e as Error).message}`);
  }

  say('\nHungerbar');
  const cfg = loadConfig(env);
  (cfg.error ? warn : ok)(`config ${cfg.path}${cfg.error ? ` is invalid JSON (${cfg.error}); defaults in use` : existsSync(cfg.path) ? '' : ' (not present, defaults)'}`);
  info(`cache dir ${cacheDir(env)}`);
  info(`COLUMNS=${env.COLUMNS ?? 'unset'}${env.HUNGERBAR_WIDTH ? `, HUNGERBAR_WIDTH=${env.HUNGERBAR_WIDTH}` : ''}`);
  const pad = paddingWarning(sl, cfg.cfg);
  if (pad) warn(pad);
  if (usageEnabled(cfg.cfg, env)) {
    const u = readUsage(acctDir(env));
    ok(`usage API on${u ? `, last refresh ${new Date(u.at * 1000).toISOString()}${u.error ? ` (${u.error})` : ''}, extra ${u.extra?.enabled ? 'enabled' : 'disabled'}` : ', no data yet'}`);
    if (env.HTTPS_PROXY) info(`HTTPS_PROXY set: the refresher runs with NODE_USE_ENV_PROXY=1 (${Number(process.versions.node.split('.')[0]) >= 24 ? 'supported' : 'needs Node 24'})`);
  } else info('usage API off (extra credits come only from stdin spend_limit)');
  if (flag(env, 'HUNGERBAR_NO_SPAWN')) warn(NO_SPAWN_WARNING);
  for (const { path, state, error } of iconSummary(env)) {
    if (!state) {
      warn(`Windows Terminal settings unreadable (${error}): ${path}`);
      continue;
    }
    ok(`icons: ${state.style} (Windows Terminal font face "${state.face}"); switch with hungerbar icons ${state.style === 'plain' ? 'colour' : 'plain'}`);
    for (const o of state.overrides) warn(`profile "${o.name}" sets its own font face "${o.face}"; the icon switch does not reach it`);
  }

  lookSection(cfg.cfg, cfg.error, env);

  if (process.platform === 'win32') {
    say('\nProcesses');
    const left = leftovers();
    if (left.problem) warn(`could not list the running processes (powershell.exe ${left.problem}), so leftovers were not checked`);
    else if (left.lines.length) left.lines.forEach((l) => warn(`still running: ${l.slice(0, 160)}`));
    else ok('no leftover hungerbar node.exe, git.exe or gh.exe');
  }

  if (shell && sl?.command) {
    say('\nTimed render (CC-style: shell -c command, demo payload piped)');
    const n = a.flags.has('bench') ? 15 : 5;
    const payload = JSON.stringify(DEMOS.normal!.payload);
    // A throwaway cache dir: the demo values must never become this account's last-known limits.
    const tmp = mkdtempSync(join(tmpdir(), 'hungerbar-doctor-'));
    const e: Env = { ...env, HUNGERBAR_CACHE_DIR: tmp, HUNGERBAR_NO_SPAWN: '1' };
    const floor = median(timeCommand(shell, 'true', payload, n, e));
    const ms = median(timeCommand(shell, sl.command, payload, n, e));
    rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    info(`shell floor ${floor.toFixed(0)} ms, statusLine ${ms.toFixed(0)} ms (median of ${n})`);
  }
  return 0;
}
