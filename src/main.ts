// argv dispatch, the 2 s deadline, the error fallback and the single write (SPEC §4, §13).
import { writeSync } from 'node:fs';
import { isatty } from 'node:tty';
import { fileURLToPath } from 'node:url';
import { runCli } from './cli/index.ts';
import { flag, nowSec, type Env } from './env.ts';
import { refreshGit } from './git/refresh.ts';
import { capture } from './capture.ts';
import { DEMOS, DEMO_NOW, demoSources } from './demo.ts';
import { spawnDetached } from './proc.ts';
import { refreshPr } from './pr/refresh.ts';
import { NO_DATA, renderPayload } from './render.ts';
import { readStdin } from './stdin.ts';
import { cacheDir, pruneOld } from './store.ts';
import { refreshTranscript } from './transcript.ts';
import { refreshUsage } from './usage/refresh.ts';
import { whoAmI } from './whoami.ts';

const T0 = performance.now();
const SELF = fileURLToPath(import.meta.url);

/** One write, retried on EAGAIN; a closed pipe is not an error. */
export function writeOut(text: string): void {
  const buf = Buffer.from(text, 'utf8');
  let off = 0;
  for (let tries = 0; off < buf.length && tries < 1000; ) {
    try {
      off += writeSync(1, buf, off);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'EAGAIN') { tries++; continue; }
      return;
    }
  }
}

async function renderMain(env: Env): Promise<void> {
  const nb = (s: string): string => s.replace(/ /g, ' ');
  let fallback = nb(NO_DATA);
  const deadline = setTimeout(() => {
    writeOut(fallback);
    process.exit(0);
  }, 2000);
  deadline.unref();

  let text: string, spawns: string[][] = [], after: Array<() => void> = [];
  const t1 = performance.now();
  // isatty(0) instead of process.stdin.isTTY: touching process.stdin builds a pipe stream we never use. The demo is
  // drawn in the configured look (renderPayload's gate), from fixed data that never touches the caches, with this
  // machine's names and elevation for the HUD's line 3 (0.7.0).
  if (isatty(0)) {
    const d = DEMOS.normal!;
    text = renderPayload(JSON.stringify(d.payload), { env, sources: demoSources(d, whoAmI(env)), now: DEMO_NOW }).text;
  } else {
    const raw = await readStdin();
    const t2 = performance.now();
    try {
      const r = renderPayload(raw, { env });
      text = r.text;
      spawns = r.spawns;
      after = r.after;
      if (raw && env.HUNGERBAR_CAPTURE) capture(raw, env.HUNGERBAR_CAPTURE);
    } catch (e) {
      let model = 'Claude';
      try { model = (JSON.parse(raw ?? '{}') as { model?: { display_name?: string } }).model?.display_name ?? model; } catch { /* keep */ }
      fallback = text = nb(`${model} · hungerbar error (run hungerbar doctor)`);
      process.stderr.write(`hungerbar: ${(e as Error).stack ?? String(e)}\n`);
    }
    if (flag(env, 'HUNGERBAR_DEBUG')) {
      const t3 = performance.now();
      process.stderr.write(`hungerbar: boot ${T0.toFixed(1)} ms, stdin ${(t2 - t1).toFixed(1)} ms, render ${(t3 - t2).toFixed(1)} ms, in-process ${(t3 - T0).toFixed(1)} ms\n`);
    }
  }
  writeOut(text);
  clearTimeout(deadline);
  // the line is out: now the writes that waited for it (the HUD's history file), then the refreshers
  for (const f of after) {
    try { f(); } catch { /* the next render tries again */ }
  }
  if (!flag(env, 'HUNGERBAR_NO_SPAWN')) {
    const cwd = cacheDir(env);
    for (const s of spawns) spawnDetached(SELF, s, cwd, s[1] === 'usage' && (env.HTTPS_PROXY || env.https_proxy) ? { ...env, NODE_USE_ENV_PROXY: '1' } : env);
  }
}

/** The git and transcript workers also prune the cache dir, at most once a day. */
function prune(cd: string, env: Env): void {
  try { pruneOld(cd, nowSec(env) * 1000); } catch { /* the next worker tries again */ }
}

async function refreshMain(args: string[], env: Env): Promise<void> {
  const [what, a, b, c] = args;
  const cd = cacheDir(env);
  if (what === 'git' && a) {
    const { loadConfig } = await import('./config.ts');
    await refreshGit(a, b ?? '/', env, cd, loadConfig(env).cfg.git.timeoutMs, () => nowSec(env), c === 'status');
    prune(cd, env);
  } else if (what === 'transcript' && a && b) {
    refreshTranscript(a, b, cd);
    prune(cd, env);
  } else if (what === 'pr' && a && b) {
    await refreshPr(a, b, env, cd, () => nowSec(env));
    prune(cd, env);
  } else if (what === 'usage') await refreshUsage(env);
}

async function main(): Promise<void> {
  const env = process.env as Env;
  const args = process.argv.slice(2);
  if (args.length === 0) return renderMain(env);
  if (args[0] === 'refresh') return refreshMain(args.slice(1), env);
  process.exitCode = await runCli(args, env, SELF);
}

main().catch((e: unknown) => {
  process.stderr.write(`hungerbar: ${(e as Error).stack ?? String(e)}\n`);
  process.exitCode = process.argv.length > 2 ? 1 : 0;
});
