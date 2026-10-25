// Windows kill-storm (SPEC §16.9): N CC-style spawns through Git Bash, each killed after a random 0-60 ms,
// with stale git caches so refreshers spawn too. The spec says 0-60 ms, but Git Bash alone takes longer than that
// to start here, so --max-ms (default 1000) spreads the kills over bash boot, node boot, the render and the spawn. Afterwards no hungerbar node.exe, launcher cmd.exe or
// git.exe may be left. Runs once with the .cmd launcher and once with the direct command.
// --hud adds a third run with the HUD (plan §10.10): `look: "hud"`, `hud.fable: "boss"` (the usage API on, from a fresh
// usage.json locked for a day, so no usage refresher runs), this repo as cwd so every render steps a history file, Opus
// and Fable 5.1 by turns, and a 6.5 MiB transcript under a new session id every 10 spawns, so renders queue
// `refresh transcript` workers. Those workers legitimately fold the transcript for a while, so the HUD run waits up to 30 s
// for its processes to end before it counts leftovers. Then every hud/*.json and transcript state file must parse, and
// the .tmp and .lock files left in its cache dir are counted and reported.
// usage: node bench/killstorm.mjs [--n 500] [--conc 8] [--max-ms 1000] [--hud]
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist', 'hungerbar.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? Number(args[args.indexOf(k) + 1]) : d);
const N = opt('--n', 500), CONC = opt('--conc', 8), MAX = opt('--max-ms', 1000);
const fwd = (p) => p.replace(/\\/g, '/');
const shell = [process.env.CLAUDE_CODE_GIT_BASH_PATH, 'C:/Program Files/Git/bin/bash.exe'].find((p) => p && existsSync(p));
if (process.platform !== 'win32' || !shell) {
  console.log('kill-storm is a Windows + Git Bash test; skipped');
  process.exit(0);
}
const dir = mkdtempSync(join(tmpdir(), 'hb-killstorm-'));
const launcher = join(dir, 'statusline.cmd');
writeFileSync(launcher, `@echo off\r\n"${process.execPath}" "${DIST}"\r\n`);
const env = { ...process.env, HUNGERBAR_CACHE_DIR: join(dir, 'cache'), CLAUDE_CONFIG_DIR: join(dir, 'claude'), HUNGERBAR_CONFIG: join(dir, 'none.json') };
const payload = (i) => JSON.stringify({ model: { display_name: 'Opus 5.5' }, workspace: { current_dir: ROOT }, cost: { total_lines_added: i, total_lines_removed: 0 } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ours() {
  const ps = "Get-CimInstance Win32_Process -Filter \"Name='node.exe' or Name='git.exe' or Name='cmd.exe' or Name='bash.exe'\" | ForEach-Object { \"$($_.ProcessId)`t$($_.Name)`t$($_.CommandLine)\" }";
  const out = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true }).stdout ?? '';
  const needles = [fwd(DIST).toLowerCase(), DIST.toLowerCase(), fwd(launcher).toLowerCase(), launcher.toLowerCase(), '--no-optional-locks'];
  return out.split(/\r?\n/).filter((l) => needles.some((n) => l.toLowerCase().includes(n)) && !l.includes('Get-CimInstance'));
}

async function storm(name, command, e = env, input = payload, settleMs = 0) {
  let started = 0, done = 0, killedEarly = 0;
  const t0 = Date.now();
  await new Promise((resolveAll) => {
    const next = () => {
      if (started >= N) return done === N && resolveAll();
      const i = started++;
      const child = spawn(shell, ['-c', command], { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true, env: e });
      child.stdin.on('error', () => {});
      child.stdin.end(input(i));
      const timer = setTimeout(() => { if (child.exitCode === null) { killedEarly++; child.kill(); } }, Math.random() * MAX);
      child.on('exit', () => {
        clearTimeout(timer);
        done++;
        if (done === N) resolveAll();
        else next();
      });
    };
    for (let k = 0; k < CONC; k++) next();
  });
  const right = ours().length;
  await sleep(3000);
  let left = ours();
  const at3 = left.length;
  // a worker still folding its transcript is busy, not left over: it gets up to settleMs more to finish
  const t1 = Date.now();
  while (left.length && Date.now() - t1 < settleMs) {
    await sleep(1000);
    left = ours();
  }
  console.log(`${name.padEnd(9)} ${N} spawns in ${((t1 - t0) / 1000).toFixed(1)} s, ${killedEarly} killed mid-run (0-${MAX} ms), ${N - killedEarly} finished; ` +
    `ours running right after: ${right}, after 3 s: ${at3}` + (settleMs && at3 ? `, after ${(3 + (Date.now() - t1) / 1000).toFixed(0)} s: ${left.length}` : ''));
  for (const l of left) console.log('   leftover:', l.slice(0, 200));
  return left.length;
}

const fnv1a = (s) => {
  let h = 0x811c9dc5;
  for (const b of Buffer.from(s, 'utf8')) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
};

/** The HUD run (--hud); returns its leftover processes plus its unparsable state files. */
async function hudStorm(command) {
  const cache = join(dir, 'hudcache');
  const cfg = join(dir, 'hud.json');
  writeFileSync(cfg, JSON.stringify({ look: 'hud', hud: { fable: 'boss' }, network: { usageApi: true, scopedWeekly: true } }));
  const now = Math.floor(Date.now() / 1000);
  const acct = join(cache, 'acct-' + fnv1a(fwd(env.CLAUDE_CONFIG_DIR).toLowerCase()));
  mkdirSync(acct, { recursive: true });
  writeFileSync(join(acct, 'usage.json'), JSON.stringify({ v: 1, at: now, extra: null, scoped: [{ name: 'Fable', pct: 62, resets_at: now + 190800 }], lockUntil: now + 86400 }));
  const real = readFileSync(join(ROOT, 'test', 'fixtures', 'transcripts', 'real-scrubbed.jsonl'));
  const big = join(dir, 'big.jsonl');
  writeFileSync(big, Buffer.concat(Array(Math.ceil((6.5 * 1024 * 1024) / real.length)).fill(real)));
  const e = { ...env, HUNGERBAR_CONFIG: cfg, HUNGERBAR_CACHE_DIR: cache, HUNGERBAR_LOOK: 'hud', FORCE_COLOR: '3', TERM: 'xterm-256color' };
  for (const k of ['NO_COLOR', 'COLUMNS', 'HUNGERBAR_WIDTH', 'HUNGERBAR_ASCII', 'HUNGERBAR_ICONS']) delete e[k];
  const input = (i) => JSON.stringify({
    session_id: `killstorm-${Math.floor(i / 10)}`, transcript_path: big, model: { display_name: i % 2 ? 'Fable 5.1' : 'Opus 5.5' },
    workspace: { current_dir: ROOT }, cost: { total_lines_added: i, total_lines_removed: 0, total_cost_usd: i / 100 },
  });
  const left = await storm('hud', command, e, input, 30000);
  // what the kills left in the cache dir: every state file must parse; .tmp and .lock files are counted
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d, { withFileTypes: true })) (f.isDirectory() ? walk : (p) => files.push(p))(join(d, f.name)); };
  walk(cache);
  const read = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
  const hist = files.filter((p) => /[\\/]hud[\\/][^\\/]+\.json$/.test(p)), tx = files.filter((p) => /[\\/]transcript[\\/][^\\/]+\.json$/.test(p));
  const bad = [...hist.filter((p) => read(p)?.v !== 1), ...tx.filter((p) => read(p)?.v !== 2)];
  const caughtUp = tx.filter((p) => read(p)?.offset === statSync(big).size).length;
  console.log(`hud cache: ${hist.length} history files and ${tx.length} transcript states (${caughtUp} caught up with the ${(statSync(big).size / 1048576).toFixed(1)} MiB transcript), ` +
    `${bad.length} unparsable; left behind: ${files.filter((p) => p.endsWith('.tmp')).length} .tmp, ${files.filter((p) => p.endsWith('.lock')).length} .lock`);
  for (const p of bad) console.log('   unparsable:', p);
  return left + bad.length;
}

const direct = `"${fwd(process.execPath)}" "${fwd(DIST)}"`;
const a = await storm('launcher', `exec "${fwd(launcher)}"`);
const b = await storm('direct', direct);
const c = args.includes('--hud') ? await hudStorm(direct) : 0;
await sleep(1000);
rmSync(dir, { recursive: true, force: true, maxRetries: 40, retryDelay: 200 });
console.log(a + b + c === 0 ? 'PASS: no leftovers' : 'FAIL: leftovers above');
process.exitCode = a + b + c === 0 ? 0 : 1;
