// CC-style timing: the shell Claude Code uses runs `-c <command>` with the payload piped in (SPEC §16.10, §17).
// All commands run interleaved, round after round, so a load spike hits every row alike; medians are reported
// in absolute ms against the budgets and as overhead above a bare `node empty.mjs` measured in the same rounds.
// The HUD rows (plan §10.10): `look: "hud"` with `hud.fable: "boss"`, a seeded git-terrain history, the scrubbed real
// transcript (the book's prompts) and this repo as cwd, in a cache dir of their own; the classic row beside it renders the
// same input from the same caches with HUNGERBAR_LOOK=classic, so the difference is the look. Both report their
// in-process ms (HUNGERBAR_DEBUG). They have no budget: timings follow the machine's load, so they are reported, never pass/fail.
// usage: node bench/bench.mjs [--runs N] [--no-ccs]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist', 'hungerbar.mjs');
const args = process.argv.slice(2);
const RUNS = Number(args[args.indexOf('--runs') + 1]) || 15;
const fwd = (p) => p.replace(/\\/g, '/');
const shell = process.platform === 'win32'
  ? [process.env.CLAUDE_CODE_GIT_BASH_PATH, 'C:/Program Files/Git/bin/bash.exe', 'C:/Program Files (x86)/Git/bin/bash.exe'].find((p) => p && existsSync(p))
  : '/bin/sh';
if (!shell) throw new Error('no Git Bash found');

const dir = mkdtempSync(join(tmpdir(), 'hb-bench-'));
const env = { ...process.env, HUNGERBAR_CACHE_DIR: join(dir, 'cache'), CLAUDE_CONFIG_DIR: join(dir, 'claude'), HUNGERBAR_CONFIG: join(dir, 'none.json') };
delete env.NO_COLOR;
const now = Math.floor(Date.now() / 1000);
const payload = JSON.stringify({
  session_id: '00000000-0000-4000-8000-00000000beef', transcript_path: join(dir, 'none.jsonl'), cwd: ROOT, version: '2.1.306',
  model: { id: 'claude-opus-5-5[1m]', display_name: 'Opus 5.5 (1M context)' }, effort: { level: 'high' },
  workspace: { current_dir: ROOT, project_dir: ROOT }, cost: { total_lines_added: 1, total_lines_removed: 0 },
  context_window: { context_window_size: 1000000, used_percentage: 8, current_usage: { input_tokens: 6, cache_creation_input_tokens: 1494, cache_read_input_tokens: 79500 } },
  rate_limits: { five_hour: { used_percentage: 2, resets_at: now + 17340 }, seven_day: { used_percentage: 82, resets_at: now + 345540 } },
  prompt_cache: { warm: true, caching_observed: true, ttl: '5m', expires_at: now + 252, hit_ratio: 0.981 },
});

const empty = join(dir, 'empty.mjs');
writeFileSync(empty, '');
const direct = `"${fwd(process.execPath)}" "${fwd(DIST)}"`;
const launcher = join(dir, 'statusline.cmd');
writeFileSync(launcher, `@echo off\r\n"${process.execPath}" "${DIST}"\r\n`);

// The HUD rows' world: a config, a cache dir with a fresh usage.json (Fable 62% used, full again in 2d05h; locked for a
// day, so no usage refresher ever runs and nothing reaches the network) and the scrubbed real transcript.
const hudCache = join(dir, 'hudcache');
const hudCfg = join(dir, 'hud.json');
writeFileSync(hudCfg, JSON.stringify({ look: 'hud', hud: { fable: 'boss' }, network: { usageApi: true, scopedWeekly: true } }));
const hudEnv = (look) => {
  // the env Claude Code hands a status line in Windows Terminal, without COLUMNS (an unknown width always draws the HUD)
  const e = { ...env, HUNGERBAR_CONFIG: hudCfg, HUNGERBAR_CACHE_DIR: hudCache, HUNGERBAR_LOOK: look, HUNGERBAR_DEBUG: '1', FORCE_COLOR: '3', TERM: 'xterm-256color' };
  for (const k of ['COLUMNS', 'HUNGERBAR_WIDTH', 'HUNGERBAR_ASCII', 'HUNGERBAR_ICONS']) delete e[k];
  return e;
};
const fnv1a = (s) => {
  let h = 0x811c9dc5;
  for (const b of Buffer.from(s, 'utf8')) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
};
const acct = join(hudCache, 'acct-' + fnv1a(fwd(env.CLAUDE_CONFIG_DIR).toLowerCase()));
mkdirSync(acct, { recursive: true });
writeFileSync(join(acct, 'usage.json'), JSON.stringify({ v: 1, at: now, extra: null, scoped: [{ name: 'Fable', pct: 62, resets_at: now + 190800 }], lockUntil: now + 86400 }));
const hudPayload = JSON.stringify({ ...JSON.parse(payload), transcript_path: join(ROOT, 'test', 'fixtures', 'transcripts', 'real-scrubbed.jsonl') });

function once(command, e, input = payload) {
  const t = performance.now();
  const r = spawnSync(shell, ['-c', command], { input, env: e, windowsHide: true, encoding: 'utf8', timeout: 15000 });
  return { ms: performance.now() - t, out: r.stdout, err: r.stderr };
}
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : NaN; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Prime the git cache so the cache-hit rows really are cache hits (git.ttlSeconds is 15, a round is well under that).
// The HUD's first render also reads the transcript (its state is cached from then on) and anchors its history file.
once(direct, env);
once(direct, hudEnv('hud'), hudPayload);
for (let i = 0; i < 100 && !(existsSync(join(dir, 'cache', 'git')) && existsSync(join(hudCache, 'git'))); i++) await sleep(50);
await sleep(1500);

// Seed the history the first HUD render anchored with two hours of edits and two commits, so line 4 draws its terrain
// and gold columns. Root, branch and the logs/HEAD anchor stay as the render wrote them, so the next renders step it
// without rewriting it (one write when the quarter changes or the diff grows).
const histDir = join(hudCache, 'hud');
const histFile = existsSync(histDir) ? readdirSync(histDir).find((f) => f.endsWith('.json')) : undefined;
if (histFile) {
  const h = JSON.parse(readFileSync(join(histDir, histFile), 'utf8'));
  const I = Math.floor(now / 900);
  h.buckets = [[I - 7, 40, 30, 10, 0], [I - 6, 120, 100, 20, 0], [I - 5, 300, 250, 50, 1], [I - 3, 800, 600, 200, 0], [I - 2, 1200, 900, 300, 0], [I - 1, 1487, 1208, 279, 1], [I, 1487, 1208, 279, 0]];
  h.at = now;
  writeFileSync(join(histDir, histFile), JSON.stringify(h));
} else console.log('note: the first HUD render left no history file (is the bench run from a git work tree?)');

const ccs = !args.includes('--no-ccs') && spawnSync(shell, ['-c', 'command -v ccstatusline'], { encoding: 'utf8', windowsHide: true }).stdout.trim();
const ROWS = [
  { name: 'Git Bash floor (true)', cmd: 'true', budget: null },
  { name: 'bare node (empty.mjs)', cmd: `"${fwd(process.execPath)}" "${fwd(empty)}"`, budget: null, floor: true },
  { name: 'hungerbar --direct, cache hit', cmd: direct, budget: 160, env: () => ({ ...env, HUNGERBAR_DEBUG: '1' }) },
  { name: 'hungerbar via the .cmd launcher', cmd: `exec "${fwd(launcher)}"`, budget: 200 },
  { name: 'stale render that spawns the refresher', cmd: direct, budget: 215, env: (i) => ({ ...env, HUNGERBAR_CACHE_DIR: join(dir, `stale${i}`) }) },
  { name: "hungerbar classic, the HUD row's input", cmd: direct, budget: null, env: () => hudEnv('classic'), input: hudPayload, pair: true },
  { name: 'hungerbar hud (fable boss, history)', cmd: direct, budget: null, env: () => hudEnv('hud'), input: hudPayload, hud: true },
  ...(ccs ? [{ name: 'ccstatusline (npm shim, today)', cmd: 'ccstatusline', budget: null, env: () => process.env }] : []),
];
for (const r of ROWS) r.runs = [];
for (let round = -2; round < RUNS; round++) {
  for (const r of ROWS) {
    const res = once(r.cmd, r.env ? r.env(round) : env, r.input);
    if (round >= 0) r.runs.push(res);
  }
}

const floor = median(ROWS.find((r) => r.floor).runs.map((x) => x.ms));
const pick = (re, row = ROWS[2]) => row.runs.map((r) => Number(re.exec(r.err)?.[1] ?? NaN)).filter(Number.isFinite);
const inProcess = median(pick(/in-process ([\d.]+) ms/)), boot = median(pick(/boot ([\d.]+) ms/));
const hudRow = ROWS.find((r) => r.hud), pairRow = ROWS.find((r) => r.pair);
const hudOut = hudRow.runs.at(-1)?.out ?? '';
const hud = {
  inProcess: median(pick(/in-process ([\d.]+) ms/, hudRow)),
  classicInProcess: median(pick(/in-process ([\d.]+) ms/, pairRow)),
  // the HUD really drew (the pickaxe in its hotbar) and read the scoped Fable week (the quiet tail on Opus)
  drewHud: hudOut.includes('⛏'), sawFable: hudOut.includes('Fable'), lines: hudOut.split('\n').length,
};
const lines = [`shell ${shell}, node ${process.version}, ${cpus().length} cores, ${RUNS} interleaved rounds, medians`, ''];
lines.push(`${''.padEnd(40)} ${'ms'.padStart(7)} ${'over node'.padStart(10)}  budget`);
const results = ROWS.map((r) => ({ name: r.name, ms: median(r.runs.map((x) => x.ms)), budget: r.budget }));
for (const r of results) {
  const over = r.ms - floor;
  lines.push(`${r.name.padEnd(40)} ${r.ms.toFixed(1).padStart(7)} ${(r.name.startsWith('hunger') ? '+' + over.toFixed(1) : '').padStart(10)}  ${r.budget ? `${r.budget} ${r.ms <= r.budget ? 'ok' : 'OVER'}` : ''}`);
}
lines.push(`${'in-process work (after node boot)'.padEnd(40)} ${inProcess.toFixed(1).padStart(7)} ${''.padStart(10)}  15 ${inProcess <= 15 ? 'ok' : 'OVER'}`);
lines.push(`${'node boot to hungerbar first line'.padEnd(40)} ${boot.toFixed(1).padStart(7)}`);
lines.push(`${'in-process, classic on the HUD row input'.padEnd(40)} ${hud.classicInProcess.toFixed(1).padStart(7)}`);
lines.push(`${'in-process, hud (fable boss, history)'.padEnd(40)} ${hud.inProcess.toFixed(1).padStart(7)} ${('+' + (hud.inProcess - hud.classicInProcess).toFixed(1)).padStart(10)}  over classic, reported only`);
if (!hud.drewHud || !hud.sawFable) lines.push(`note: the HUD row ${hud.drewHud ? 'drew no Fable tail (usage.json not read?)' : 'drew classic (a colour, ASCII or width fallback)'}`);
console.log(lines.join('\n'));
mkdirSync(join(ROOT, 'bench', 'results'), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
writeFileSync(join(ROOT, 'bench', 'results', `bench-${stamp}.json`), JSON.stringify({ shell, node: process.version, runs: RUNS, floor, results, inProcess, boot, hud }, null, 2));
await sleep(2500);
rmSync(dir, { recursive: true, force: true, maxRetries: 40, retryDelay: 200 });
