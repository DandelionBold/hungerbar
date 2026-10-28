// One render: config, payload, sources, then the look: the HUD when its gate passes (plan §2, §9), else classic's layout.
// Pure apart from the disk sources (SPEC §4). The HUD path never makes classic differ: classic is drawn from the same
// State, so a gate that fails, or a HUD path that throws (its stack goes to stderr), gives classic byte for byte.
import { mkdirSync } from 'node:fs';
import { delimiter } from 'node:path';
import { detectDepth, paint } from './color.ts';
import { loadConfig, prEnabled, usageEnabled, type Config } from './config.ts';
import { fsMap, mapPath, nowSec, type Env } from './env.ts';
import { entryPath, isFresh, lockPath, parseShortstat, readEntry, type GitEntry } from './git/cache.ts';
import { findRepo, indexMtime, isUnborn, type Repo } from './git/head.ts';
import { resolveGit } from './git/bin.ts';
import { gitArgs, gitCommand, gitEnv } from './git/refresh.ts';
import { parseStatus, readOp, statusArgs, type GitStatus } from './git/status.ts';
import { ASCII, forDepth, UNICODE } from './glyphs.ts';
import type { HudState } from './hud/adapter.ts';
import type { GitMarks } from './hud/gitstate.ts';
import type { PlayerMarks } from './hud/player.ts';
import { diskHistory, histSid } from './hud/history.ts';
import { hudGate, renderHudLook } from './hud/look.ts';
import type { Span } from './hud/spans.ts';
import { renderLines, budget } from './layout.ts';
import { resolveLimits } from './limits.ts';
import { num, str, type Payload } from './payload.ts';
import { githubRemote, onBranch, PR_LOCK_STALE_MS, prFresh, prLockPath, prShown, readPrEntry } from './pr/cache.ts';
import type { PrInfo } from './pr/gh.ts';
import { childProcess } from './proc.ts';
import { collect, type Counts, type GitView, type Sources } from './state.ts';
import { acctDir, cacheDir, lockLive, writeJson } from './store.ts';
import { readTranscript, TX_LOCK_STALE_MS, txId, txLockPath, type TxSummary } from './transcript.ts';
import { readUsage, usageNeedsRefresh, type UsageFile } from './usage/file.ts';
import { whoAmI } from './whoami.ts';

export interface RenderResult {
  text: string;
  /**
   * Refreshers to start after the line is written: ['refresh', 'git', root, edits], ['refresh', 'usage'],
   * ['refresh', 'transcript', path, id] or ['refresh', 'pr', root, branch].
   */
  spawns: string[][];
  model: string | null;
  /**
   * Writes that wait until the line is out (the HUD's history file): whoever prints `text` runs them after it, then
   * starts the spawns. Dropped, they cost only that write; the next render redoes it.
   */
  after: Array<() => void>;
  /**
   * When the HUD drew this render, for the tests: the engine's input (with its hist), the git state's (marks), the pull
   * request (null: no badge), the player's layers' input, the engine's lines, the lines with the git state, the badge,
   * the player's layers and the hotbar's frame, and the centring's offset (hud.align center; `text` is the framed lines
   * moved right by it).
   */
  hud?: { input: HudState; git: GitMarks; pr: PrInfo | null; player: PlayerMarks; lines: Span[][]; framed: Span[][]; offset: number };
}

export interface RenderOptions {
  env: Env;
  /** Replaces the disk sources (the demo and preview use fixed data); `after` is the render's list of deferred writes. */
  sources?: (p: Payload, cfg: Config, now: number, after: Array<() => void>) => Sources;
  now?: number;
  config?: Config;
}

export const NO_DATA = 'Hungerbar · no data';

function editsKey(p: Payload): string {
  return `${num(p.cost?.total_lines_added) ?? ''}/${num(p.cost?.total_lines_removed) ?? ''}`;
}

/** `sync` git mode: the diff (and, for the HUD, the status) runs inline, about +160 ms each; opt-in only. */
function refreshInline(repo: Repo, edits: string, env: Env, cd: string, cfg: Config, now: number, withStatus: boolean): GitEntry | null {
  const bin = resolveGit(env, cd);
  if (!bin) return null;
  mkdirSync(cd, { recursive: true });
  const git = (gitArgv: string[]): string | null => {
    const [cmd, args] = gitCommand(bin, gitArgv);
    const r = childProcess().spawnSync(cmd, args, {
      env: gitEnv(env) as NodeJS.ProcessEnv, cwd: cd, windowsHide: true, timeout: cfg.git.timeoutMs, encoding: 'utf8', maxBuffer: 64 << 20,
    });
    return r.status === 0 && typeof r.stdout === 'string' ? r.stdout : null;
  };
  const head = repo.head, idx = indexMtime(repo);
  const out = git(gitArgs(repo.root, isUnborn(repo)));
  if (out === null) return null;
  const s = parseShortstat(out);
  const e: GitEntry = { v: 1, at: now, head, indexMtimeMs: idx, edits, added: s.added, removed: s.removed, files: s.files };
  if (withStatus) {
    const st = git(statusArgs(repo.root));
    e.st = st === null ? null : parseStatus(st);
  }
  try { writeJson(entryPath(cd, repo.root), e); } catch { /* shown anyway */ }
  return e;
}

/**
 * persist=false (preview) reads the caches but never writes them. `after` collects the writes that wait until the line
 * is out (the HUD's history file); whoever renders runs them after stdout.
 */
export function diskSources(p: Payload, env: Env, cfg: Config, now: number, spawns: string[][], after: Array<() => void> = [], persist = true): Sources {
  const cd = cacheDir(env), acct = acctDir(env);
  let tx: TxSummary | null | undefined;
  let usage: UsageFile | null | undefined;
  /** Read once per render, by whichever asks first; a delta over the budget queues the worker unless it already runs. */
  const transcript = (): TxSummary | null => {
    if (tx !== undefined) return tx;
    const path = str(p.transcript_path);
    if (!path) return (tx = null);
    const sid = str(p.session_id);
    tx = readTranscript(path, sid, cd, persist);
    const id = txId(path, sid);
    if (tx?.needsWorker && !lockLive(txLockPath(cd, id), TX_LOCK_STALE_MS, Date.now())) spawns.push(['refresh', 'transcript', path, id]);
    return tx;
  };
  return {
    git(dir: string): GitView {
      const map = fsMap(env);
      const ceilings = (env.GIT_CEILING_DIRECTORIES ?? '').split(delimiter).filter(Boolean);
      const repo = findRepo(mapPath(dir, map), ceilings, map.map((m) => m[1]));
      if (!repo) return { isRepo: false, branch: null, added: null, removed: null };
      // the HUD's git state (0.7.0): the status rides on the diff's refresher, what is in progress is read here; classic
      // asks for neither, so its refresher, its entry and its reads are 0.6.0's
      const hud = cfg.look === 'hud';
      const state = (st: GitStatus | null | undefined): Pick<GitView, 'status' | 'op'> => (hud ? { status: st ?? null, op: readOp(repo.gitDir) } : {});
      if (cfg.git.mode === 'off') return { isRepo: true, branch: repo.branch, added: null, removed: null, repo, ...state(null) };
      const edits = editsKey(p);
      let e = readEntry(cd, repo.root);
      if (!e || !isFresh(e, repo.head, indexMtime(repo), edits, now, cfg.git.ttlSeconds) || (hud && !('st' in e))) {
        if (cfg.git.mode === 'sync') e = refreshInline(repo, edits, env, cd, cfg, now, hud) ?? e;
        else if (!lockLive(lockPath(cd, repo.root), 10_000, Date.now())) spawns.push(['refresh', 'git', repo.root, edits, ...(hud ? ['status'] : [])]);
      }
      return { isRepo: true, branch: repo.branch, added: e?.added ?? null, removed: e?.removed ?? null, repo, ...state(e?.st) };
    },
    limits: () => resolveLimits(p, acct, now, persist),
    usage(): UsageFile | null {
      if (usage !== undefined) return usage;
      if (!usageEnabled(cfg, env)) return (usage = null);
      usage = readUsage(acct);
      if (usageNeedsRefresh(acct, usage, now, cfg.network.ttlSeconds, cfg.network.scopedWeekly)) spawns.push(['refresh', 'usage']);
      return usage;
    },
    transcript,
    counts(): Counts {
      const t = transcript();
      return { turns: t?.turns ?? 0, compactions: t?.compactions ?? 0 };
    },
    history: (repo, branch, add, del) =>
      diskHistory({ cacheDir: cd, sid: histSid(str(p.session_id), str(p.transcript_path)), repo, branch, add, del, now, after, persist }),
    pr(repo): PrInfo | null {
      if (!prEnabled(cfg, env) || !repo || !onBranch(repo)) return null;
      const e = readPrEntry(cd, repo.root, repo.branch);
      if (e && prFresh(e, now)) return prShown(e, now);
      // stale or missing: ask again, only for a repo with a remote on GitHub (its git config, a file read)
      if (!githubRemote(repo.commonDir, env)) return null;
      if (!lockLive(prLockPath(cd, repo.root, repo.branch), PR_LOCK_STALE_MS, Date.now())) spawns.push(['refresh', 'pr', repo.root, repo.branch]);
      return prShown(e, now);
    },
    who: whoAmI(env),
  };
}

export function renderPayload(raw: string | null, opts: RenderOptions): RenderResult {
  const env = opts.env;
  const loaded = opts.config ? { cfg: opts.config, error: null } : loadConfig(env);
  const cfg = loaded.cfg;
  const depth = detectDepth(cfg.color, cfg.colorDepth, env);
  const g = forDepth(cfg.icons === 'ascii' ? ASCII : UNICODE, depth !== 'none');
  const noData = (): RenderResult => ({ text: paint(cfg.nbsp && !g.ascii ? NO_DATA.replace(/ /g, ' ') : NO_DATA, { role: 'label' }, depth), spawns: [], model: null, after: [] });
  // A UTF-8 BOM (PowerShell 5.1 pipes one when $OutputEncoding is UTF-8; Claude Code sends none) is not part of the JSON.
  if (raw !== null && raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  if (raw === null || raw.trim() === '') return noData();
  let p: Payload;
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return noData();
    p = v as Payload;
  } catch {
    return noData();
  }
  const now = opts.now ?? nowSec(env);
  const spawns: string[][] = [], after: Array<() => void> = [];
  const src = opts.sources ? opts.sources(p, cfg, now, after) : diskSources(p, env, cfg, now, spawns, after);
  const st = collect(p, now, cfg, env, src, loaded.error !== null);
  const gate = hudGate(cfg, loaded.error, depth, env);
  if (gate.ok) {
    try {
      const h = renderHudLook(st, p, src, cfg, gate.depth, budget(env, cfg));
      return { text: h.text, spawns, model: st.model, after, hud: { input: h.input, git: h.git, pr: h.pr, player: h.player, lines: h.lines, framed: h.framed, offset: h.offset } };
    } catch (e) {
      after.length = 0;                                       // a HUD render that failed writes no history
      process.stderr.write(`hungerbar: the HUD failed, classic drawn: ${(e as Error | undefined)?.stack ?? String(e)}\n`);
    }
  }
  return { text: renderLines(st, cfg, g, depth, budget(env, cfg)), spawns, model: st.model, after };
}
