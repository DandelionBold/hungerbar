// hero.gif: one long session as a time-lapse, every frame a real render of the session's state at that minute.
// Five hours of work in three-minute steps: prompts and replies in the transcript, edits and commits in the repo, the
// limits, the context and the prompt cache in the payload. Along the way: hearts and drumsticks drain, the bubbles pop
// between prompts, the XP bar fills and /compact levels up, the terrain grows and commits turn gold, a bed during a
// break, the moon and phantoms late in the session, and the boss bar after switching to Fable.
import { T0 } from '../rig.mjs';

const MIN = 60;
const S = T0;                                        // the session starts here
const END = 297;                                     // minutes
const BREAK = [158, 184];                            // away: no prompts
const COMPACTS = [118, 250];
const FABLE_AT = 280;
/** The diff each stretch of work reaches before its commit: [commit minute, added, removed]. */
const BLOCKS = [[48, 820, 140], [100, 460, 610], [152, 1300, 220], [214, 240, 60], [262, 900, 300], [999, 380, 90]];

/** Prompt minutes: about one every 2.4 minutes, none during the break; the 100th comes before the switch to Fable. */
function promptTimes() {
  const out = [];
  for (let t = 0.3, i = 0; t < END; i++) {
    if (t >= BREAK[0] && t < BREAK[1]) { t = BREAK[1] + 0.4; continue; }
    out.push(t);
    t += 1.95 + ((i * 7) % 5) * 0.22;
  }
  return out;
}

const clock = (m) => `${Math.floor(m / 60)}:${String(Math.floor(m % 60)).padStart(2, '0')}`;

export async function hero(rig) {
  // the repo: one file, long enough for every stretch's deletions
  rig.mustGit('init', '-q', '-b', 'main');
  let base = Array.from({ length: 2400 }, (_, i) => `export const item${i} = ${i};`);
  const save = (lines) => rig.write('src/app.js', lines.join('\n') + '\n');
  save(base);
  rig.mustGit('add', '-A');
  rig.mustGit('commit', '-q', '-m', 'Start the app');
  rig.setConfig({ network: { usageApi: true, scopedWeekly: true }, hud: { pr: 'on' } });

  const prompts = promptTimes();
  const events = [];
  for (const [i, t] of prompts.entries()) {
    events.push({ t, kind: 'prompt', i });
    events.push({ t: t + 0.7, kind: 'reply' });
  }
  for (const t of COMPACTS) events.push({ t, kind: 'compact' });
  for (const [t] of BLOCKS) if (t < END) events.push({ t, kind: 'commit' });
  events.sort((a, b) => a.t - b.t);

  let turns = 0, ctx = 24000, lastReply = null, block = 0, inBlock = 0;
  let edit = { add: 0, del: 0 };
  const blockPrompts = BLOCKS.map(([end], k) => prompts.filter((t) => t >= (k ? BLOCKS[k - 1][0] : 0) && t < end).length);
  const apply = (e) => {
    const at = S + Math.round(e.t * MIN);
    if (e.kind === 'prompt') {
      rig.prompt(at);
      turns++;
      ctx += 9000 + ((turns * 37) % 7) * 1100;
      // the stretch's diff grows with its prompts
      inBlock++;
      const [, add, del] = BLOCKS[block], f = Math.min(1, inBlock / Math.max(1, blockPrompts[block] - 1));
      edit = { add: Math.round(add * f), del: Math.round(del * f) };
      const tag = `b${block}`;
      save([...base.slice(edit.del), ...Array.from({ length: edit.add }, (_, i) => `export const ${tag}_${i} = '${tag}';`)]);
    } else if (e.kind === 'reply') {
      rig.reply(at, e.t >= FABLE_AT ? 'claude-fable-5-1' : 'claude-opus-5-5');
      lastReply = at;
    } else if (e.kind === 'compact') {
      rig.compact(at);
      ctx = 31000;
    } else if (e.kind === 'commit') {
      rig.mustGit('add', '-A');
      rig.mustGit('commit', '-q', '-m', `Stretch ${block + 1}`);
      base = [...base.slice(edit.del), ...Array.from({ length: edit.add }, (_, i) => `export const b${block}_${i} = 'b${block}';`)];
      edit = { add: 0, del: 0 };
      block++;
      inBlock = 0;
    }
  };

  // what the caption says, from the minute it happens; key frames are held longer
  const notes = [
    [0, 'A new session: ten hearts, the sun is up, the bubbles fill with each reply', 1.2],
    [48, 'A commit: its quarter of the terrain turns gold', 0.9],
    [COMPACTS[0], '/compact: the XP bar empties and the level goes up', 1],
    [BREAK[0] + 6, 'Five minutes without a message: a bed in the hotbar', 1],
    [BREAK[1] + 1, 'The next message, and the bed is gone', 0.3],
    [180, 'Three hours in, the sun turns orange', 0],
    [240, 'The last hour of the 5-hour window: the moon, and a phantom far away', 0.9],
    [COMPACTS[1], 'Two compactions and four hours: the phantoms come closer', 0.9],
    [FABLE_AT, "/model fable: Fable's weekly limit as a boss bar", 1],
  ];
  // a note stays for 24 minutes of the session, then the caption says what goes on all along
  const ALONG = 'Hearts and food drain with the limits, the XP bar fills with the context, the terrain grows with the diff';
  const frames = [];
  let next = 0, note = notes[0], fableTurns = null;
  const hundred = prompts[99];
  if (!(hundred > COMPACTS[1] && hundred < FABLE_AT)) throw new Error(`the 100th prompt comes at minute ${hundred}`);
  notes.push([hundred, 'A hundred prompts: a third phantom', 0.8]);
  notes.sort((a, b) => a[0] - b[0]);
  for (let m = 1; m <= END; m += 3) {
    const now = S + m * MIN;
    while (next < events.length && S + Math.round(events[next].t * MIN) <= now) apply(events[next++]);
    let hold = 0.05, typed = '';
    for (const n of notes) if (n[0] <= m && n[0] > m - 3) { note = n; hold = Math.max(hold, n[2]); }
    // the command is typed in the box on the frame before it runs
    if (COMPACTS.some((t) => t > m && t <= m + 3)) { typed = '/compact'; hold = 0.35; }
    if (FABLE_AT > m && FABLE_AT <= m + 3) { typed = '/model fable'; hold = 0.35; }
    if (m === 1) hold = note[2];
    const fable = m >= FABLE_AT;
    const p = rig.payload({
      now, model: fable ? 'fable' : 'opus', effort: 'high', ctx, cost: 0.12 + turns * 0.41, secs: m * MIN,
      h5: { used: turns * 0.8, reset: S + 300 * MIN - now },
      week: { used: 55 + turns * 0.24, reset: 3 * 86400 + 7200 - m * MIN },
      cache: lastReply === null ? null : { left: lastReply + 300 - now, hit: 0.95 + ((turns * 3) % 5) / 100 },
    });
    if (fable && fableTurns === null) fableTurns = turns;
    rig.setUsage(now, { fable: { pct: 58 + (fable ? (turns - fableTurns) * 0.8 : 0), resets_at: S + 2 * 86400 + 36000 } });
    const status = rig.render(p, { now, cols: 120 });
    frames.push({ status, typed, caption: { at: clock(m), text: m - note[0] < 24 || m >= FABLE_AT ? note[1] : ALONG }, hold: m >= END - 2 ? 1.4 : hold });
  }
  return { frames, opts: { cols: 120, rows: 9 } };
}
