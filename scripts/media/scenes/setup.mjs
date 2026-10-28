// setup.gif: `hungerbar setup` on a first install, every question answered with Enter (its default), as the terminal
// shows it. The text is what the real command printed in the sandbox, with answers piped in (HUNGERBAR_SETUP_TTY, as
// the tests do), split at its questions and shown a question at a time, scrolling as a terminal does.
// Paths are shown as a user named steve would see them after `npm i -g`: the sandbox's home is C:\Users\steve, and
// this repo stands where npm puts the package. gh is named, never run (setup only asks whether it is there).
import { rmSync } from 'node:fs';
import { REPO_ROOT } from '../rig.mjs';
import { lineHTML, parseLine, plain, wrap } from '../term.mjs';

const COLS = 120, ROWS = 27;
const QUESTION = /^(Look|Fable|Align|Name|Operator) \[\d\]: $|\[(Y\/n|y\/N)\]: $/;
const NPM = 'C:/Users/steve/AppData/Roaming/npm/node_modules/hungerbar';
const SHELL = 'PS C:\\Users\\steve> ';

/** What each step is, in the caption; the hold is how long its last frame stays. */
const STEPS = [
  ['The look, each answer with a preview; Enter takes the default: the Minecraft HUD', 1.5],
  ["Fable's weekly limit: five options, each with a preview; the default is a boss bar", 1.5],
  ['What uses the network is asked for, after what it reads and sends; Enter says yes', 1.6],
  ["Where the HUD sits: centred by default, like Minecraft's hotbar", 1.4],
  ['Your user name before the folder', 1.2],
  ['Your name in gold while Claude Code runs as Administrator', 1.3],
  ['The pull request status, through your own gh; Enter says yes', 1.6],
  ['Done: settings.json runs Hungerbar, and hungerbar setup --restore puts the old status line back', 2.2],
];

export async function setup(rig) {
  rmSync(rig.config, { force: true });                     // a first install: no hungerbar.json yet
  const home = rig.home;
  const res = rig.run(['setup'], {
    input: '\n'.repeat(12),
    env: {
      HUNGERBAR_SETUP_TTY: '1', HUNGERBAR_GH: 'C:/Program Files/GitHub CLI/gh.exe', HUNGERBAR_WIDTH: String(COLS),
      CLAUDE_CONFIG_DIR: undefined, HUNGERBAR_CONFIG: undefined,
    },
  });
  if (res.code !== 0) throw new Error(`setup failed: ${res.err}`);
  const swap = (s, from, to) => s.split(from).join(to).split(from.replace(/\\/g, '/')).join(to.replace(/\\/g, '/'));
  let out = swap(res.out, home, 'C:\\Users\\steve');
  out = swap(out, REPO_ROOT, NPM.replace(/\//g, '\\'));
  const lines = out.replace(/\n$/, '').split('\n');

  // split at the questions: each step ends with its question (the last step is the summary)
  const steps = [[]];
  for (const l of lines) {
    steps[steps.length - 1].push(l);
    if (QUESTION.test(l.replace(/\x1b\[[0-9;]*m/g, ''))) steps.push([]);
  }
  if (steps.length !== STEPS.length) throw new Error(`setup asked ${steps.length - 1} questions, expected ${STEPS.length - 1}`);

  const screen = [];                                       // every row so far, as cells
  const frames = [];
  const show = (caption, hold, cursor) => {
    const rows = screen.slice(-ROWS).map((r, i, a) => lineHTML(i === a.length - 1 && cursor ? [...r, { g: ' ', w: 1, fg: null, bg: '#CCCCCC', bold: false, dim: false }] : r));
    frames.push({ rowsHTML: rows, text: screen.slice(-ROWS).map((r) => r.map((c) => c.g).join('')), caption: { text: caption }, hold });
  };
  screen.push(plain(SHELL + 'hungerbar setup'));
  show('hungerbar setup on a first install', 0.8, true);
  for (const [k, step] of steps.entries()) {
    const [caption, hold] = STEPS[k];
    const rows = step.flatMap((l) => wrap(parseLine(l), COLS));
    // a long step scrolls by in pieces, so each option shows for a moment
    const piece = ROWS - 3;
    for (let at = 0; at < rows.length; at += piece) {
      screen.push(...rows.slice(at, at + piece));
      const last = at + piece >= rows.length;
      if (last && k === steps.length - 1) screen.push(plain(SHELL));      // the shell's prompt is back
      show(caption, last ? hold : 0.9, last);
    }
  }
  return { frames, opts: { cols: COLS, rows: ROWS, anchor: 'top' } };
}
