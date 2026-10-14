// Runs one fixture case through dist/hungerbar.mjs with seeded temp state (SPEC §16.1).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { entryPath, normRoot } from '../src/git/cache.ts';
import { findRepo, indexMtime } from '../src/git/head.ts';
import { histPath, histSid, parseLine } from '../src/hud/history.ts';
import { str } from '../src/payload.ts';
import { prPath } from '../src/pr/cache.ts';
import { acctDir } from '../src/store.ts';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DIST = join(ROOT, 'dist', 'hungerbar.mjs');
export const CASES = join(ROOT, 'test', 'fixtures', 'cases');
export const GOLDEN = join(ROOT, 'test', 'golden');
export const NOW = 1792859460;
/** The quarter-hour NOW falls in: the history's bucket index ("{{Q}}", "{{Q-3}}"). */
export const Q = Math.floor(NOW / 900);

export interface Case {
  note?: string;
  /**
   * The stdin JSON. Strings "{{NOW+N}}" and "{{Q-N}}" become numbers, "{{TRANSCRIPT}}" the temp transcript path, and
   * "{{U+HHHH*N}}" inside any string N copies of that code point (for the huge inputs). Use `raw` for non-JSON stdin.
   */
  payload?: unknown;
  raw?: string;
  /** Displayed path → files to create under a temp folder that the path is mapped onto. */
  fs?: Record<string, Record<string, string>>;
  transcript?: unknown[] | string;
  state?: {
    /** The git refresher's entry; `st` (the HUD's git status counts, 0.7.0) is written only when given, as the refresher does. */
    git?: { for: string; added: number; removed: number; files?: number; age?: number; st?: unknown };
    limits?: unknown;
    usage?: Record<string, unknown>;
    /**
     * The HUD's history file (plan §6) as an earlier render left it, written under the sid and gitKey this render
     * computes: `lines` complete lines of the repo's logs/HEAD were read (the anchor is their end and the last one's new
     * sha; `head` replaces that sha), on `branch` (fromState's reading), with these buckets, at `at` (default NOW).
     */
    history?: { for: string; branch: string; lines: number; head?: string; buckets: unknown[]; at?: number | string };
    /**
     * The PR refresher's entry (src/pr/cache.ts, 0.7.0) for the repo's root and the branch HEAD is on: gh answered `age`
     * seconds ago (default 1) and confirmed `pr` `prAge` seconds ago (default `age`), with `why` (default ok, or none
     * without a PR).
     */
    pr?: { for: string; pr: unknown; why?: string; age?: number; prAge?: number };
  };
  config?: unknown;
  /** Written verbatim as hungerbar.json (for the invalid-config case). */
  configText?: string;
  /** Written as settings.json in the temp Claude config dir. */
  settings?: unknown;
  env?: Record<string, string>;
  modes?: string[];
  /** hud-* cases (hud.e2e.test.ts part c): the engine's input with its hist, as the HUD must be handed it; null when the HUD must not draw. */
  hudState?: unknown;
  /**
   * hud-* cases: the git state's input (src/hud/gitstate.ts GitMarks, 0.7.0) the HUD must be handed; absent when nothing
   * is known (no status in the entry, nothing in progress, not detached), which draws the engine's lines as they are.
   */
  hudGit?: unknown;
  /** hud-* cases: the pull request the HUD must be handed (src/pr/gh.ts PrInfo, 0.7.0); absent when there is none (no badge). */
  hudPr?: unknown;
  /**
   * hud-* cases: what the player's layers must be handed (src/hud/player.ts PlayerMarks, 0.7.0), over none (no name, no
   * operator's mark, no bed, no phantom); absent when they draw nothing.
   */
  hudPlayer?: unknown;
  /**
   * hud-* cases: the reference state this case reproduces apart from hist, turns and compactions ("states:normal" from
   * hud4-states.json, "round7:fable-in-use" from hud-spec.json); its scoped is [] when it has none.
   */
  hudRef?: string;
}

export const MODES: Record<string, Record<string, string>> = {
  ansi: { FORCE_COLOR: '3' },
  nocolor: { NO_COLOR: '1' },
  ascii: { NO_COLOR: '1', HUNGERBAR_ASCII: '1' },
  w100: { NO_COLOR: '1', COLUMNS: '100' },
  w80: { NO_COLOR: '1', COLUMNS: '80' },
  w60: { NO_COLOR: '1', COLUMNS: '60' },
  w40: { NO_COLOR: '1', COLUMNS: '40' },
  // the HUD's width gate in colour: a budget of 96 keeps the HUD (minWidth 80), one of 56 falls back to classic
  w100c: { FORCE_COLOR: '3', COLUMNS: '100' },
  w60c: { FORCE_COLOR: '3', COLUMNS: '60' },
  // hud.align center (0.6.0): budgets of 80 (minWidth, no room), 116 and 117 (even and odd) and 196
  w84c: { FORCE_COLOR: '3', COLUMNS: '84' },
  w120c: { FORCE_COLOR: '3', COLUMNS: '120' },
  w121c: { FORCE_COLOR: '3', COLUMNS: '121' },
  w200c: { FORCE_COLOR: '3', COLUMNS: '200' },
};

export function loadCase(name: string): Case {
  return JSON.parse(readFileSync(join(CASES, name + '.json'), 'utf8')) as Case;
}

export function caseNames(): string[] {
  return readdirSync(CASES).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
}

/** A case value with its tokens filled in (see Case.payload). */
export const fill = (v: unknown, transcript: string): unknown => {
  if (typeof v === 'string') {
    const m = /^\{\{(NOW|Q)([+-]\d+)?\}\}$/.exec(v);
    if (m) return (m[1] === 'Q' ? Q : NOW) + Number(m[2] ?? 0);
    if (v === '{{TRANSCRIPT}}') return transcript;
    return v.replace(/\{\{U\+([0-9A-F]{4,6})\*(\d+)\}\}/g, (_, cp: string, n: string) => String.fromCodePoint(parseInt(cp, 16)).repeat(Number(n)));
  }
  if (Array.isArray(v)) return v.map((x) => fill(x, transcript));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x, transcript)]));
  return v;
};

export interface Prepared {
  dir: string;
  env: Record<string, string>;
  stdin: string;
  cleanup(): void;
}

/** Builds the temp world for a case: mapped folders, caches, config and the stdin text. */
export function prepare(c: Case): Prepared {
  const dir = mkdtempSync(join(tmpdir(), 'hb-'));
  const claude = join(dir, 'claude'), cache = join(dir, 'cache');
  mkdirSync(claude, { recursive: true });
  const map: Record<string, string> = {};
  let i = 0;
  for (const [shown, files] of Object.entries(c.fs ?? {})) {
    const real = join(dir, 'fs', `m${i++}`);
    mkdirSync(real, { recursive: true });
    for (const [rel, text] of Object.entries(files)) {
      const p = join(real, rel);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, text);
    }
    map[shown] = real;
  }
  const transcript = join(dir, 'transcript.jsonl');
  if (Array.isArray(c.transcript)) writeFileSync(transcript, c.transcript.map((r) => JSON.stringify(fill(r, transcript)) + '\n').join(''));
  else if (typeof c.transcript === 'string') writeFileSync(transcript, readFileSync(join(ROOT, 'test', 'fixtures', 'transcripts', c.transcript)));
  const payload = c.payload === undefined ? undefined : fill(c.payload, transcript);
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
    TEMP: tmpdir(),
    TMP: tmpdir(),
    HUNGERBAR_NOW: String(NOW),
    HUNGERBAR_NO_SPAWN: '1',
    HUNGERBAR_CACHE_DIR: cache,
    CLAUDE_CONFIG_DIR: claude,
    HUNGERBAR_FS_MAP: JSON.stringify(map),
    // the HUD's operator mark (0.7.0) follows the case, not whether the tests themselves run elevated
    HUNGERBAR_ELEVATED: '0',
    ...(c.env ?? {}),
  };
  if (c.config !== undefined) writeFileSync(join(claude, 'hungerbar.json'), JSON.stringify(c.config, null, 2));
  if (c.configText !== undefined) writeFileSync(join(claude, 'hungerbar.json'), c.configText);
  if (c.settings !== undefined) writeFileSync(join(claude, 'settings.json'), JSON.stringify(c.settings, null, 2));
  const acct = acctDir(env);
  if (c.state?.limits) {
    mkdirSync(acct, { recursive: true });
    writeFileSync(join(acct, 'limits.json'), JSON.stringify(fill(c.state.limits, transcript)));
  }
  if (c.state?.usage) {
    mkdirSync(acct, { recursive: true });
    writeFileSync(join(acct, 'usage.json'), JSON.stringify(fill({ v: 1, at: NOW - 30, scoped: [], lockUntil: 0, ...c.state.usage }, transcript)));
  }
  const g = c.state?.git;
  if (g) {
    const real = map[g.for];
    const repo = real ? findRepo(real) : null;
    if (!repo) throw new Error(`state.git.for ${g.for}: no repo`);
    const cost = (payload as { cost?: { total_lines_added?: number; total_lines_removed?: number } } | undefined)?.cost;
    const entry = {
      v: 1, at: NOW - (g.age ?? 1), head: repo.head, indexMtimeMs: indexMtime(repo),
      edits: `${cost?.total_lines_added ?? ''}/${cost?.total_lines_removed ?? ''}`,
      added: g.added, removed: g.removed, files: g.files ?? 1, ...(g.st !== undefined ? { st: g.st } : {}),
    };
    const p = entryPath(cache, repo.root);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(entry));
  }
  const h = c.state?.history;
  if (h) {
    const real = map[h.for];
    const repo = real ? findRepo(real) : null;
    if (!repo) throw new Error(`state.history.for ${h.for}: no repo`);
    const pl = payload as { session_id?: unknown; transcript_path?: unknown } | undefined;
    const sid = histSid(str(pl?.session_id), str(pl?.transcript_path));
    if (!sid) throw new Error('state.history: the payload has no session key');
    const logPath = join(repo.gitDir, 'logs', 'HEAD');
    const lines = (existsSync(logPath) ? readFileSync(logPath, 'utf8') : '').split('\n').slice(0, -1).slice(0, h.lines);   // complete lines only
    if (lines.length !== h.lines || lines.some((l) => !parseLine(l))) throw new Error(`state.history: logs/HEAD has no ${h.lines} complete lines`);
    const file = {
      v: 1, root: normRoot(repo.root), branch: h.branch,
      log: { size: h.lines ? Buffer.byteLength(lines.join('\n') + '\n') : 0, head: h.head ?? (h.lines ? parseLine(lines[h.lines - 1]!)!.new : '') },
      buckets: fill(h.buckets, transcript), at: fill(h.at ?? '{{NOW}}', transcript),
    };
    const p = histPath(cache, sid, repo.root);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(file));
  }
  const pr = c.state?.pr;
  if (pr) {
    const real = map[pr.for];
    const repo = real ? findRepo(real) : null;
    if (!repo || repo.detached) throw new Error(`state.pr.for ${pr.for}: no repo on a branch`);
    const age = pr.age ?? 1;
    const entry = { v: 1, root: normRoot(repo.root), branch: repo.branch, at: NOW - age, prAt: NOW - (pr.prAge ?? age), pr: pr.pr, why: pr.why ?? (pr.pr ? 'ok' : 'none') };
    const p = prPath(cache, repo.root, repo.branch);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(entry));
  }
  const stdin = c.raw ?? (payload === undefined ? '' : JSON.stringify(payload));
  return { dir, env, stdin, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export interface RunOut {
  stdout: string;
  stderr: string;
  status: number | null;
}

export function runDist(stdin: string, env: Record<string, string>, args: string[] = []): RunOut {
  const r = spawnSync(process.execPath, [DIST, ...args], { input: stdin, env, encoding: 'utf8', windowsHide: true, timeout: 15000 });
  return { stdout: r.stdout, stderr: r.stderr, status: r.status };
}

/** Renders a case in one mode. */
export function render(c: Case, mode: string): RunOut & { prepared: Prepared } {
  const prepared = prepare(c);
  const out = runDist(prepared.stdin, { ...prepared.env, ...(MODES[mode] ?? {}) });
  return { ...out, prepared };
}

export function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** The text stored in a golden file for a mode. */
export function goldenText(mode: string, stdout: string): string {
  return mode === 'ansi' ? stdout.replace(/\x1b/g, '␛') : stdout;
}

export const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');
