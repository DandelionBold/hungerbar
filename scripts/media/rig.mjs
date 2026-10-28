// A sandbox that drives the real build (dist/hungerbar.mjs) the way Claude Code does: a payload on stdin, COLUMNS, and
// everything else in throwaway folders. Nothing here touches your own hungerbar.json, settings.json, caches or git
// config, and nothing uses the network: the refreshers never start (HUNGERBAR_NO_SPAWN), and the files they would
// write (the usage file, the PR status) are written here instead, in the cache's own formats.
//   - a git repo with real commits (Steve Hill <steve@example.com>, fixed dates), shown as D:/webapp (HUNGERBAR_FS_MAP);
//   - a transcript (prompts, replies, compactions) the render reads for the book, the level and the bed;
//   - the names: user steve, host DESKTOP; the elevation is HUNGERBAR_ELEVATED.
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { entryPath, normRoot } from '../../src/git/cache.ts';
import { histPath } from '../../src/hud/history.ts';
import { prPath } from '../../src/pr/cache.ts';
import { acctDir } from '../../src/store.ts';
import { usagePath } from '../../src/usage/file.ts';

export const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../..');
export const BIN = join(REPO_ROOT, 'dist', 'hungerbar.mjs');
/** The clock every scene starts from (the demo's): renders read it from HUNGERBAR_NOW. */
export const T0 = 1792859460;
/** What the HUD shows as the folder; the repo behind it is a temp folder. */
export const SHOWN = 'D:\\webapp';

const iso = (s) => new Date(s * 1000).toISOString();

export class Rig {
  /** @param {string} dir an empty work folder for this sandbox */
  constructor(dir) {
    rmSync(dir, { recursive: true, force: true });
    this.dir = dir;
    this.repo = join(dir, 'webapp');
    this.claude = join(dir, 'claude');
    this.cache = join(dir, 'cache');
    this.home = join(dir, 'home');
    this.config = join(dir, 'hungerbar.json');
    this.transcript = join(dir, 'transcript.jsonl');
    this.sid = '5e551017-0000-4000-8000-00000000c0de';
    for (const d of [this.repo, this.claude, this.cache, this.home, join(dir, 'tmp')]) mkdirSync(d, { recursive: true });
    writeFileSync(join(dir, 'gitconfig'), '[user]\n\tname = Steve Hill\n\temail = steve@example.com\n[init]\n\tdefaultBranch = main\n[core]\n\tautocrlf = false\n');
    writeFileSync(this.transcript, '');
    this.gitClock = T0 - 86400;
    this.msg = 0;
    this.setConfig({});
  }

  /** The environment of every run: built from nothing, so none of this machine's own settings leak in. */
  env(extra = {}) {
    const keep = ['PATH', 'Path', 'SystemRoot', 'windir', 'SystemDrive', 'ComSpec', 'PATHEXT', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE'];
    const base = Object.fromEntries(keep.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]));
    return {
      ...base,
      HOME: this.home, USERPROFILE: this.home, APPDATA: join(this.home, 'AppData', 'Roaming'), LOCALAPPDATA: join(this.home, 'AppData', 'Local'),
      TEMP: join(this.dir, 'tmp'), TMP: join(this.dir, 'tmp'),
      CLAUDE_CONFIG_DIR: this.claude, HUNGERBAR_CONFIG: this.config, HUNGERBAR_CACHE_DIR: this.cache,
      HUNGERBAR_NO_SPAWN: '1', HUNGERBAR_USER: 'steve', HUNGERBAR_HOST: 'DESKTOP', HUNGERBAR_ELEVATED: '0',
      HUNGERBAR_FS_MAP: JSON.stringify({ 'D:/webapp': this.repo.replace(/\\/g, '/') }),
      COLORTERM: 'truecolor', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(this.dir, 'gitconfig'),
      ...extra,
    };
  }

  /** hungerbar.json; git.mode sync makes the render run the diff and the status itself, as the refresher would. */
  setConfig(obj) {
    writeFileSync(this.config, JSON.stringify({ git: { mode: 'sync' }, ...obj }, null, 2));
  }

  /** Runs git in the repo; commits get the next fixed date, so the shas are the same on every run. */
  git(...args) {
    this.gitClock += 60;
    const date = `${this.gitClock} +0000`;
    const r = spawnSync('git', args, {
      cwd: this.repo, encoding: 'utf8', windowsHide: true,
      env: { ...this.env(), GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date, GIT_EDITOR: 'true', GIT_SEQUENCE_EDITOR: 'true' },
    });
    return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') };
  }

  mustGit(...args) {
    const r = this.git(...args);
    if (!r.ok) throw new Error(`git ${args.join(' ')} failed:\n${r.out}`);
    return r.out.trim();
  }

  write(rel, text) {
    const p = join(this.repo, rel);
    mkdirSync(resolve(p, '..'), { recursive: true });
    writeFileSync(p, text);
  }

  /** The real root as findRepo resolves it (the cache keys hash it). */
  get root() {
    return resolve(this.repo);
  }

  // ---------- the transcript: what the book, the level and the bed read ----------
  row(o) {
    appendFileSync(this.transcript, JSON.stringify({ sessionId: this.sid, isSidechain: false, ...o }) + '\n');
  }
  prompt(at, text = 'next step') {
    this.row({ type: 'user', origin: { kind: 'human' }, message: { role: 'user', content: text }, timestamp: iso(at) });
  }
  reply(at, model = 'claude-opus-5-5') {
    this.row({
      type: 'assistant', timestamp: iso(at),
      message: { id: `msg_${++this.msg}`, model, role: 'assistant', content: [{ type: 'text', text: 'Done.' }], usage: { input_tokens: 6, cache_creation_input_tokens: 900, cache_read_input_tokens: 40000, output_tokens: 300 } },
    });
  }
  compact(at) {
    this.row({ type: 'system', subtype: 'compact_boundary', timestamp: iso(at) });
  }

  // ---------- the files the refreshers would write ----------
  /** usage.json as the usage refresher writes it: extra credits and the scoped weekly limits (Fable). */
  setUsage(now, { fable = null, extraUsedCents = 0 } = {}) {
    const file = usagePath(acctDir(this.env()));
    mkdirSync(resolve(file, '..'), { recursive: true });
    const scoped = fable ? [{ name: 'Fable', pct: fable.pct, resets_at: fable.resets_at }] : [];
    writeFileSync(file, JSON.stringify({ v: 1, at: now - 30, extra: { enabled: true, usedCents: extraUsedCents, limitCents: 5000, currency: 'USD' }, scoped, lockUntil: 0 }));
  }
  /** The PR status entry as the PR refresher writes it, for this branch; null: no PR. */
  setPr(now, branch, pr) {
    const file = prPath(this.cache, this.root, branch);
    mkdirSync(resolve(file, '..'), { recursive: true });
    writeFileSync(file, JSON.stringify({ v: 1, root: normRoot(this.root), branch, at: now, prAt: now, pr, why: pr ? 'ok' : 'none' }));
  }
  /** Seeds the terrain's history with quarter-hour buckets before `now`: [quarters ago, added, removed, commit 0|1]. */
  seedHistory(now, branch, rows) {
    const I = Math.floor(now / 900);
    const buckets = rows.map(([ago, add, del, gold]) => [I - ago, add + del, add, del, gold]);
    const file = histPath(this.cache, this.sid, this.root);
    mkdirSync(resolve(file, '..'), { recursive: true });
    writeFileSync(file, JSON.stringify({ v: 1, root: normRoot(this.root), branch, log: { size: 0, head: '' }, buckets, at: now - 60, sessionStart: now - 5400 }));
  }
  /** Drops the git cache entry, so the next render asks git again. */
  forgetGit() {
    rmSync(entryPath(this.cache, this.root), { force: true });
  }

  // ---------- a render ----------
  /**
   * One status line, as Claude Code would get it. `cols` is the window's width (COLUMNS); the status line starts at
   * cell 2 of the window and Claude Code cuts it at cols - 4 (SPEC §0.9, What Claude Code passes).
   */
  render(payload, { now, cols = 120, elevated = false, env = {} }) {
    const r = spawnSync(process.execPath, [BIN], {
      input: JSON.stringify(payload), encoding: 'utf8', windowsHide: true, cwd: this.dir,
      env: this.env({ HUNGERBAR_NOW: String(now), COLUMNS: String(cols), HUNGERBAR_ELEVATED: elevated ? '1' : '0', ...env }),
    });
    if (r.status !== 0 || r.stderr) throw new Error(`render failed (${r.status}): ${r.stderr}`);
    return r.stdout.split('\n');
  }

  /** Runs a hungerbar command (setup, preview, ...) in the sandbox; returns stdout and stderr. */
  run(args, { input = '', env = {} } = {}) {
    const r = spawnSync(process.execPath, [BIN, ...args], {
      input, encoding: 'utf8', windowsHide: true, cwd: this.dir, env: this.env(env),
    });
    return { code: r.status, out: r.stdout, err: r.stderr };
  }

  /** A statusLine payload in Claude Code's shape. */
  payload({ now, model = 'opus', effort = 'high', ctx = 81000, cost = 3.12, secs = null, h5 = { used: 2, reset: 17340 }, week = { used: 82, reset: 345540 }, cache = { left: 252, hit: 0.981 }, cwd = SHOWN }) {
    const m = model === 'fable' ? { id: 'claude-fable-5-1', display_name: 'Fable 5.1' } : { id: 'claude-opus-5-5[1m]', display_name: 'Opus 5.5 (1M context)' };
    const p = {
      session_id: this.sid, transcript_path: this.transcript, version: '2.1.306', model: m, effort: { level: effort },
      workspace: { current_dir: cwd, project_dir: cwd }, cwd,
      cost: { total_cost_usd: cost, ...(secs !== null ? { total_duration_ms: secs * 1000 } : {}) },
      context_window: {
        context_window_size: 1_000_000, used_percentage: Math.round(ctx / 10000),
        current_usage: ctx > 0 ? { input_tokens: 6, cache_creation_input_tokens: 1494, cache_read_input_tokens: ctx - 1500, output_tokens: 812 } : null,
      },
      rate_limits: {
        five_hour: { used_percentage: h5.used, resets_at: now + h5.reset },
        seven_day: { used_percentage: week.used, resets_at: now + week.reset },
      },
    };
    if (cache) p.prompt_cache = { warm: cache.left > 0, caching_observed: true, ttl: cache.ttl ?? '5m', expires_at: now + cache.left, hit_ratio: cache.hit };
    return p;
  }
}
