/* A made-up 5½-hour session, the same every time, for the time-lapse: frames every 30 s of session time, each one a
   state in the picker's format, plus the events worth a line in the chat. DOM-free, so the lab can play it too. */
const SESSION = (() => {
  const STEP = 30, END = 19800, WINDOW = 18000, TTL = 300;
  // Work blocks: [from, to, seconds per turn, effort]. The gaps between them are breaks, long enough to go cold.
  const PLAN = [[0, 2700, 150, 'high'], [3300, 7800, 120, 'high'], [8700, 15600, 90, 'xhigh'], [15900, 17400, 150, 'xhigh'], [18300, 19800, 180, 'high']];
  let seed = 0x5eed4;
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const turnsAt = [];
  PLAN.forEach(([from, to, every, effort], b) => { for (let t = from + 20; t < to; t += every) turnsAt.push([t, effort, t + every >= to && b < PLAN.length - 1]); });

  const st = { model: 'Opus 5.5', effort: 'high', ctxPct: 0, ctxTok: 0, ctxMax: 1000000, branch: 'main', add: 0, del: 0, cwd: 'D:/webapp', ver: '2.1.306',
    h5: { used: 0, left: WINDOW, window: WINDOW }, week: { used: 58, left: 280800 }, cache: { hit: null, warm: null, left: 0, ttl: TTL },
    extra: { used: 0, limit: 50 }, cost: 0, turns: 0, compactions: 0 };
  const frames = [], events = [], saved = [];   // saved: [time, added, removed] of each commit (it moves HEAD)
  const say = (t, text) => events.push({ t, text });
  let next = 0, lastTurn = null, hit = null, reset = false, onExtra = false;
  say(0, 'A new world: a fresh session in D:/webapp, on branch main.');
  for (let t = 0; t <= END; t += STEP) {
    if (!reset && t >= WINDOW) { reset = true; st.h5.used = 0; onExtra = false; say(WINDOW, 'Sunrise: a new 5-hour window, all ten hearts are back.'); }
    while (next < turnsAt.length && turnsAt[next][0] <= t) {
      const [at, effort, lastOfBlock] = turnsAt[next++];
      if (effort !== st.effort) { st.effort = effort; say(at, `Enchanted: effort ${effort}, Efficiency ${effort === 'xhigh' ? 'IV' : 'III'}.`); }
      if (lastTurn === null) say(at, 'First message: the furnace is lit (the prompt cache is warm).');
      const heavy = effort === 'xhigh';
      st.turns++;
      st.ctxTok += heavy ? between(15000, 25000) : between(10000, 19000);
      if (st.ctxTok >= 920000) { st.ctxTok = between(110000, 140000); st.compactions++; say(at, `Level up! /compact squeezed the context: level ${st.compactions}.`); }
      const cost = 0.18 + (st.ctxTok / 1e6) * 0.35 + (heavy ? 0.08 : 0);
      st.cost = Math.round((st.cost + cost) * 100) / 100;
      if (onExtra) st.extra.used = Math.round((st.extra.used + cost) * 100) / 100;
      else {
        st.h5.used = Math.min(100, Math.round((st.h5.used + (heavy ? 1.0 : 0.7)) * 10) / 10);
        st.week.used = Math.min(100, Math.round((st.week.used + (heavy ? 0.22 : 0.15)) * 100) / 100);
        if (st.h5.used >= 100) { onExtra = true; say(at, 'Out of hearts: the 5-hour limit is used up.'); say(at, 'Golden apple: from now on you pay with extra credits.'); }
      }
      st.add += between(4, 70); st.del += between(0, 28);
      if (st.turns === 31) { st.branch = 'feature/hotbar'; st.add = between(2, 9); st.del = 0; say(at, 'Switched to a new branch: feature/hotbar.'); }
      else if (lastOfBlock) { say(at, `Commit before the break: +${st.add} -${st.del} saved, the line counts start again.`); saved.push([at, st.add, st.del]); st.add = 0; st.del = 0; }
      hit = between(88, 99);
      lastTurn = at;
    }
    if (lastTurn !== null) {
      const idle = t - lastTurn, warm = idle < TTL;
      if (st.cache.warm && !warm) say(lastTurn + TTL, 'The furnace went out: 5 minutes idle, the prompt cache is cold.');
      st.cache = { hit, warm, left: warm ? TTL - idle : 0, ttl: TTL };
    }
    st.ctxPct = Math.round((st.ctxTok / st.ctxMax) * 100);
    st.h5.left = (reset ? 2 * WINDOW : WINDOW) - t;
    st.week.left = 280800 - t;
    frames.push(JSON.parse(JSON.stringify(st)));
  }
  // Round 6: Hungerbar's per-session cache, walked over the frames in order (steps 1-5 of the cache update in
  // round6/round6-spec.json "history", documented at hud4.js fromState), so every frame also carries the hist that
  // Hungerbar would hand to that render: {now, sessionStart, dirtySince, commits, lastCommit, buckets}, now = 30 x i.
  // It reads each frame's branch, add and del, and HEAD: the number of commits made so far (each 'Commit before the
  // break' moves it; the switch to feature/hotbar keeps it). The HEAD reflog between two HEADs is one entry per commit
  // made in between, newest first: [the HEAD it moved to, 'commit: Commit before the break']. Step 2 counts one commit for
  // every entry whose subject starts with 'commit' and adds what it saved, git diff --shortstat from the HEAD it moved
  // from (the next older entry, or the cached HEAD) to its own: that commit's own counts (this session has no pull, reset
  // or rebase, and no two commits fall in one frame, so each commit is seen alone, as before). The clock never goes back
  // here (step 1's shift never applies). Step 3's oldest change on disk would be now (the time-lapse has no files), and
  // the cache starts on a clean tree anyway. No other field of a frame changes.
  {
    const Q = 900, NQ = 8;
    let c = null;
    frames.forEach((f, i) => {
      const now = i * STEP, B = f.branch === null || f.branch === undefined ? null : f.branch;
      const add = B === null ? 0 : f.add, del = B === null ? 0 : f.del, T = add + del;
      const H = B === null ? null : saved.filter(([t]) => t <= now).length;
      if (!c) c = { sessionStart: now, branch: undefined, head: null, add: 0, del: 0, dirtySince: null, commits: 0, lastCommit: null, buckets: [] };
      const same = B !== null && B === c.branch, prevT = c.add + c.del;
      const reflog = same && H !== null && c.head !== null && H !== c.head
        ? saved.slice(c.head, H).map((x, k) => [c.head + k + 1, 'commit: Commit before the break']).reverse() : [];
      let seen = 0, sa = 0, sd = 0;
      reflog.forEach(([to, subject], k) => {
        if (!subject.startsWith('commit')) return;
        const from = k + 1 < reflog.length ? reflog[k + 1][0] : c.head, done = saved.slice(from, to);   // git diff --shortstat <from> <to>
        seen++;
        sa += done.reduce((a, x) => a + x[1], 0);
        sd += done.reduce((a, x) => a + x[2], 0);
      });
      const commit = seen > 0;
      if (commit) {
        c.commits += seen;
        c.lastCommit = { at: now, add: sa, del: sd, branch: B };
      }
      c.dirtySince = T === 0 ? null : same && prevT > 0 && c.dirtySince !== null && !commit ? c.dirtySince : now;
      if (B !== null) {
        const I = Math.floor(now / Q), last = c.buckets[c.buckets.length - 1];
        if (last && last[0] === I) {
          if (T > last[1]) { last[1] = T; last[2] = add; last[3] = del; }
          if (commit) last[4] = 1;
        } else c.buckets.push([I, T, add, del, commit ? 1 : 0]);
        c.buckets = c.buckets.filter((b) => b[0] > I - NQ && b[0] <= I);
      }
      c.branch = B; c.head = H; c.add = add; c.del = del;
      f.hist = JSON.parse(JSON.stringify({ now, sessionStart: c.sessionStart, dirtySince: c.dirtySince, commits: c.commits,
        lastCommit: c.lastCommit, buckets: c.buckets }));
    });
  }
  // Round 7 (round7/round7-spec.json "sessionScoped"): the account's Fable week, as Hungerbar's usage.json scoped[] hands
  // it to the render (state.scoped = [{ name, used: % used, left: seconds to its reset }]). This session stays on Opus 5.5;
  // other sessions on the account keep using Fable: 0.9% more every 5 minutes until it is used up (100% from 1h30m, frame
  // 180), it resets at 2h30m (frame 300: 0% used, a new week of 7 days), then they use it again, 0.5% every 5 minutes (18%
  // used at the end). used has one decimal, like the API's percent. A new field only: no other field of a frame changes.
  {
    const RESET = 9000, WEEK = 604800, d1 = (x) => Math.round(x * 10) / 10;
    frames.forEach((f, i) => {
      const t = i * STEP;
      f.scoped = t < RESET
        ? [{ name: 'Fable', used: Math.min(100, d1(84 + 0.9 * Math.floor(t / 300))), left: RESET - t }]
        : [{ name: 'Fable', used: d1(0.5 * Math.floor((t - RESET) / 300)), left: RESET + WEEK - t }];
    });
  }
  events.sort((a, b) => a.t - b.t);
  return { STEP, END, frames, events, at: (t) => frames[Math.max(0, Math.min(frames.length - 1, Math.round(t / STEP)))] };
})();
