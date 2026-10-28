// The shorter pictures, each from the normal day of the README (the demo's numbers: 81k of 1M, 98% of the session and
// 18% of the week left, the cache warm for 4m12s, 42 prompts, $3, the last two hours of git), drawn by real renders in
// the sandbox: fable.gif (the four Fable options), git.gif (the git state, from real git operations), pr.gif (the pull
// request badge), center.gif (the window narrowing and widening), idle.gif (the bed and the phantoms), frame.gif (the
// hotbar's frame and the offhand's) and classic.png (the classic look).
import { T0 } from '../rig.mjs';

const lines = (n, tag) => Array.from({ length: n }, (_, i) => `export const ${tag}${i} = ${i};`);
const file = (ls) => ls.join('\n') + '\n';

/**
 * The normal day: a repo whose diff is +1208 -279 (or none with `clean`), 42 prompts with the last reply 48 s ago, the
 * README's terrain, and the usage file with ◆ 50 and Fable at 38% left (full again in 2d05h). `talk: false` leaves the
 * transcript empty, for a caller that writes its own.
 */
export function normalDay(rig, { clean = false, config = {}, talk = true } = {}) {
  rig.mustGit('init', '-q', '-b', 'main');
  rig.write('src/app.js', file(lines(600, 'item')));
  rig.write('src/parser.js', file(lines(120, 'rule')));
  rig.write('README.md', '# webapp\n');
  rig.mustGit('add', '-A');
  rig.mustGit('commit', '-q', '-m', 'Start the app');
  if (!clean) rig.write('src/app.js', file([...lines(600, 'item').slice(279), ...lines(1208, 'next')]));
  if (talk) {
    for (let i = 0; i < 42; i++) rig.prompt(T0 - 5400 + i * 120);
    rig.reply(T0 - 48);
  }
  rig.setConfig({ network: { usageApi: true, scopedWeekly: true }, hud: { pr: 'on' }, ...config });
  rig.setUsage(T0, { fable: { pct: 62, resets_at: T0 + 190800 } });
  rig.seedHistory(T0, 'main', [[6, 241, 101, 0], [5, 455, 160, 0], [4, 640, 220, 0], [3, 667, 231, 1], [2, 140, 40, 0], [1, 520, 120, 0], [0, 1208, 279, 0]]);
}

const day = (rig, extra = {}) => rig.payload({ now: T0, ...extra });

// ---------- fable.gif ----------
const FABLE = [
  ['tail', 'while you use Fable, the word Fable turns pink and ten hexagons count what is left', 'on another model, a grey note after the weekly food'],
  ['tooltip', "while you use Fable, line 1 shows Fable's wear, like a tool's", 'on another model, the same grey note'],
  ['boss', 'the default: while you use Fable, a boss bar on top, as wide as the hotbar', 'on another model, the same grey note; the boss bar goes'],
  ['beacon', 'a beacon at the end of the food line sends a beam into the line above; Fable in pink while in use', 'on another model, the same beacon, with Fable in grey'],
];
export async function fable(rig) {
  normalDay(rig);
  const frames = [];
  for (const [opt, onFable, onOpus] of FABLE) {
    rig.setConfig({ network: { usageApi: true, scopedWeekly: true }, hud: { pr: 'on', fable: opt } });
    frames.push({ status: rig.render(day(rig, { model: 'fable' }), { now: T0 }), caption: { at: `hud.fable ${opt}`, text: onFable }, hold: 2.1 });
    frames.push({ status: rig.render(day(rig), { now: T0 }), caption: { at: `hud.fable ${opt}`, text: onOpus }, hold: 1.3 });
  }
  return { frames, opts: { rows: 9 } };
}

// ---------- git.gif ----------
export async function git(rig) {
  normalDay(rig, { clean: true });
  // an upstream on GitHub that is never fetched: origin/main is set by hand
  rig.mustGit('config', 'remote.origin.url', 'https://github.com/steve/webapp.git');
  rig.mustGit('config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*');
  rig.mustGit('config', 'branch.main.remote', 'origin');
  rig.mustGit('config', 'branch.main.merge', 'refs/heads/main');
  rig.mustGit('update-ref', 'refs/remotes/origin/main', 'HEAD');
  const base = rig.mustGit('rev-parse', 'HEAD');
  const app = lines(600, 'item'), parser = lines(120, 'rule');
  // a branch whose first lines differ from main's: merging it, rebasing on it or picking from it stops on a conflict
  rig.mustGit('checkout', '-q', '-b', 'feature/cache');
  rig.write('src/app.js', file(['// cache', ...app.slice(1)]));
  rig.mustGit('commit', '-q', '-am', 'Cache the parser');
  rig.write('src/parser.js', file(['// cache', ...parser.slice(1)]));
  rig.mustGit('commit', '-q', '-am', 'Cache the rules');
  rig.mustGit('checkout', '-q', 'main');
  rig.write('src/app.js', file(['// main', ...app.slice(1)]));
  rig.write('src/parser.js', file(['// main', ...parser.slice(1)]));
  rig.mustGit('commit', '-q', '-am', 'Name the files');
  rig.mustGit('update-ref', 'refs/remotes/origin/main', 'HEAD');
  const named = rig.mustGit('rev-parse', 'HEAD');
  // five commits off the start, the second of which edits the line main renamed
  rig.mustGit('checkout', '-q', '-b', 'feature/parser', base);
  for (let i = 1; i <= 5; i++) {
    if (i === 2) rig.write('src/app.js', file(['// parser', ...app.slice(1)]));
    else rig.write(`src/step${i}.js`, file(lines(10, `s${i}_`)));
    rig.mustGit('add', '-A');
    rig.mustGit('commit', '-q', '-m', `Parser step ${i}`);
  }
  rig.mustGit('checkout', '-q', 'main');

  const frames = [];
  const shot = (text, hold = 1.45) => {
    rig.forgetGit();
    frames.push({ status: rig.render(day(rig), { now: T0 }), caption: { text }, hold });
  };
  shot('Clean and level with its upstream: a green ⎇ and the branch in white', 1.6);
  rig.write('src/app.js', file(['// main', ...app.slice(1, 593), ...lines(42, 'more')]));
  shot('Changed files: ⎇ turns yellow, then the diff, +42 -7');
  rig.mustGit('checkout', '-q', '--', '.');
  for (const n of ['retry', 'queue', 'limits']) rig.write(`src/${n}.js`, file(lines(5, n)));
  shot('Only new files that git does not track yet: an aqua ⎇ and ?3');
  rig.git('clean', '-fdq');
  // two commits to push, one to pull
  for (const n of ['retry', 'queue']) { rig.write(`src/${n}.js`, file(lines(5, n))); rig.mustGit('add', '-A'); rig.mustGit('commit', '-q', '-m', `Add ${n}`); }
  const tree = rig.mustGit('rev-parse', `${named}^{tree}`);
  const theirs = rig.mustGit('commit-tree', tree, '-p', named, '-m', 'Their change');
  rig.mustGit('update-ref', 'refs/remotes/origin/main', theirs);
  shot('Commits to push and to pull: the branch turns gold, ↑2↓1');
  rig.mustGit('update-ref', 'refs/remotes/origin/main', 'HEAD');
  rig.git('merge', 'feature/cache');
  shot('A merge stopped on two conflicts: a red ⎇, merge in purple, !2 in red');
  rig.mustGit('merge', '--abort');
  rig.mustGit('checkout', '-q', 'feature/parser');
  rig.git('rebase', 'main');
  shot('A rebase stopped at step 2 of 5: the branch it rebases, in purple');
  rig.mustGit('rebase', '--abort');
  rig.mustGit('checkout', '-q', 'main');
  rig.git('cherry-pick', 'feature/cache~1');
  shot('A cherry-pick waiting on a conflict');
  rig.mustGit('cherry-pick', '--abort');
  rig.mustGit('checkout', '-q', '--detach', 'HEAD~2');
  shot('A detached HEAD: @ and the commit, in grey');
  return { frames, opts: { rows: 8 } };
}

// ---------- pr.gif ----------
const PRS = [
  [{ state: 'open', ci: 'running', review: null, conflict: false }, 'Checks still running: a gold ●'],
  [{ state: 'open', ci: 'passed', review: null, conflict: false }, 'All checks passed: a green ✓'],
  [{ state: 'open', ci: 'passed', review: 'approved', conflict: false }, 'Approved as well: ✓✓, ready to merge'],
  [{ state: 'open', ci: 'passed', review: 'changes', conflict: false }, 'Changes requested: a yellow ±'],
  [{ state: 'open', ci: 'failed', review: null, conflict: false }, 'A check failed: a red ×'],
  [{ state: 'open', ci: 'passed', review: null, conflict: true }, 'A conflict with the base branch: a red ‼'],
  [{ state: 'draft', ci: 'running', review: null, conflict: false }, 'A draft: the number in grey and a grey ◌'],
  [{ state: 'merged', ci: 'passed', review: 'approved', conflict: false }, 'Merged: the number and merged, in purple'],
  [{ state: 'closed', ci: null, review: null, conflict: false }, 'Closed without merging: in dark grey'],
];
export async function pr(rig) {
  normalDay(rig, { clean: true });
  rig.mustGit('config', 'remote.origin.url', 'https://github.com/steve/webapp.git');
  rig.mustGit('checkout', '-q', '-b', 'feature/cache');
  rig.write('src/app.js', file([...lines(600, 'item').slice(7), ...lines(42, 'cache')]));
  const frames = [];
  for (const [p, text] of PRS) {
    rig.setPr(T0, 'feature/cache', { n: 128, ...p });
    frames.push({ status: rig.render(day(rig), { now: T0 }), caption: { at: '#128', text }, hold: 1.3 });
  }
  return { frames, opts: { rows: 8 } };
}

// ---------- center.gif ----------
export async function center(rig) {
  normalDay(rig);
  const widths = [];
  for (let w = 140; w >= 100; w -= 2) widths.push(w);
  const all = [...widths, ...widths.slice(1, -1).reverse()];
  const frames = all.map((w, i) => {
    const status = rig.render(day(rig), { now: T0, cols: w });
    const moved = [...status[0]].findIndex((ch) => ch !== '⠀');
    const end = i === 0 || i === widths.length - 1;
    const middle = Math.floor((w - 4) / 2) - 39;
    const text = moved === middle ? `the HUD moves ${moved} columns right, so the hotbar sits in the middle` : `the HUD moves only ${moved} column${moved === 1 ? '' : 's'} right, so its widest line still fits`;
    return { status, cols: w, caption: { at: `${w} columns`, text }, hold: end ? 1.6 : 0.14 };
  });
  return { frames, opts: { cols: 140, canvasCols: 140, rows: 8, canvas: '#2B2B2B' } };
}

// ---------- idle.gif ----------
const isoAt = (s) => new Date(s * 1000).toISOString();
/** An assistant message that starts a tool and a result that ends it: Claude at work, as the transcript records it. */
function toolStart(rig, at, id) {
  rig.row({
    type: 'assistant', timestamp: isoAt(at),
    message: { id: `msg_${id}`, model: 'claude-opus-5-5', role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: { command: 'npm test' } }], usage: { input_tokens: 6, cache_creation_input_tokens: 900, cache_read_input_tokens: 40000, output_tokens: 80 } },
  });
}
function toolEnd(rig, at, id) {
  rig.row({ type: 'user', timestamp: isoAt(at), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] } });
}

/**
 * The bed and the phantoms: the clock moves on from the normal day (the last reply 48 s before T0). The bed comes after
 * five minutes without a message and goes with the next one, but not while a tool runs; then the signs of a long
 * session come one by one (4 hours, the context at 70%, two compactions, a hundred prompts), each bringing a phantom.
 */
export async function idle(rig) {
  normalDay(rig);
  const frames = [];
  let last = T0 - 48, ctx = 81000, secs = 5400;
  const shot = (now, at, text, hold) => {
    const p = rig.payload({ now, ctx, secs: secs + (now - T0), cache: { left: last + 300 - now, hit: 0.981 } });
    frames.push({ status: rig.render(p, { now }), caption: { at, text }, hold });
  };
  shot(T0, 'hud.bed', 'Claude replied a moment ago: slot 4 of the hotbar is empty', 1.6);
  shot(T0 + 330, 'hud.bed', 'Five minutes without a message: a bed in slot 4', 2);
  rig.prompt(T0 + 340);
  rig.reply(T0 + 350);
  last = T0 + 350;
  shot(T0 + 360, 'hud.bed', 'Your next message, and the bed is gone', 1.6);
  toolStart(rig, T0 + 370, 'toolu_tests');
  last = T0 + 370;
  shot(T0 + 1000, 'hud.bed', 'Ten minutes of tests: no bed while a tool still runs', 2);
  toolEnd(rig, T0 + 1010, 'toolu_tests');
  rig.reply(T0 + 1020);
  last = T0 + 1020;
  secs = 14400 - 1030;
  shot(T0 + 1030, 'hud.phantoms', 'Four hours in: one small, dim phantom far away', 2);
  ctx = 720000;
  shot(T0 + 1040, 'hud.phantoms', 'The context at 70% as well: two big phantoms with green eyes', 2);
  rig.compact(T0 + 1050);
  rig.compact(T0 + 1060);
  rig.reply(T0 + 1070);
  last = T0 + 1070;
  shot(T0 + 1080, 'hud.phantoms', 'Two compactions too: three phantoms', 2);
  for (let i = 0; i < 58; i++) rig.prompt(T0 + 1090 + i);
  rig.reply(T0 + 1150);
  last = T0 + 1150;
  shot(T0 + 1160, 'hud.phantoms', 'A hundred prompts: four. A hint that /clear would help', 2.4);
  return { frames, opts: { rows: 8 } };
}

// ---------- frame.gif ----------
/** The hotbar's frame, and the offhand's frame turning green while a used-up limit makes the extra credits pay. */
export async function frame(rig) {
  normalDay(rig);
  const frames = [];
  frames.push({ status: rig.render(day(rig), { now: T0 }), caption: { at: 'frame', text: 'A thin edge under the hotbar: mint under the selected slot, grey under the rest' }, hold: 2.4 });
  frames.push({ status: rig.render(day(rig, { h5: { used: 100, reset: 2400 } }), { now: T0 }), caption: { at: 'frame', text: "The 5-hour limit is used up and the extra credits pay: the offhand's frame turns green" }, hold: 2.4 });
  return { frames, opts: { rows: 8 } };
}

// ---------- classic.png ----------
export async function classic(rig) {
  normalDay(rig, { config: { look: 'classic' } });
  return { frames: [{ status: rig.render(day(rig), { now: T0 }) }], opts: { rows: 6, caption: false }, png: true };
}
