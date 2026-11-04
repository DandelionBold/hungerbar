// 1.2.1: Claude Code drops a rate-limit window from the status line once its resets_at passes, until Claude's next reply
// (the status line docs, "Fields that may be absent"). A Pro or Max payload right after a 5-hour reset is therefore the
// week alone, the same shape as an Ultra account's. These tests pin how Hungerbar tells the two apart.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { scrub } from '../../src/capture.ts';
import { resolveLimits, savedNoFiveHour } from '../../src/limits.ts';
import type { Payload } from '../../src/payload.ts';
import { renderPayload } from '../../src/render.ts';
import { acctDir } from '../../src/store.ts';
import { fold, freshTx, summarize } from '../../src/transcript.ts';
import { fiveHourWord } from '../../src/usage/refresh.ts';

const NOW = 1792859460;
const WEEK = { used_percentage: 82, resets_at: NOW + 345540 };
/** The shape Claude Code 2.1.317 sent right after a 5-hour reset (a live capture, 4 Nov 2026): the week, no five_hour. */
const DROPPED: Payload = { rate_limits: { seven_day: WEEK } };

function acctWith(file?: unknown): { acct: string; saved(): Record<string, unknown>; cleanup(): void } {
  const acct = mkdtempSync(join(tmpdir(), 'hb-drop-'));
  if (file !== undefined) writeFileSync(join(acct, 'limits.json'), JSON.stringify(file));
  return {
    acct,
    saved: () => JSON.parse(readFileSync(join(acct, 'limits.json'), 'utf8')) as Record<string, unknown>,
    cleanup: () => rmSync(acct, { recursive: true, force: true }),
  };
}

test('the real dropped-window shape: a 5-hour window gone after its saved reset is refilled, not Ultra, and nothing saves Ultra', () => {
  const w = acctWith({ v: 1, five_hour: { pct: 64, resets_at: NOW - 30 }, seven_day: { pct: 80, resets_at: NOW + 345540 }, at: NOW - 600 });
  try {
    const r = resolveLimits(DROPPED, w.acct, NOW, true);
    assert.equal(r.h5None, false, 'not the Ultra plan');
    assert.deepEqual(r.h5, { pct: 0, left: null, dim: false }, 'refilled: full, no clock until Claude replies, not marked ~');
    assert.deepEqual(r.week, { pct: 82, left: 345540, dim: false });
    const saved = w.saved();
    assert.equal(saved.fiveHourNone, undefined, 'limits.json does not save Ultra');
    assert.deepEqual(saved.five_hour, { pct: 64, resets_at: NOW - 30 }, 'the saved window is kept: its reset is what a reply must come after');
  } finally {
    w.cleanup();
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// the other paths: a true Ultra after a reply, the usage API's word, a fresh install, another session's window
// ---------------------------------------------------------------------------------------------------------------------

/** An upgraded account's cache: a 5-hour window saved ten days ago, from before the plan went to Ultra. */
const OCT24 = { v: 1, five_hour: { pct: 2, resets_at: NOW - 10 * 86400 }, seven_day: { pct: 80, resets_at: NOW + 345540 }, at: NOW - 10 * 86400 - 3600 };

test('the dropped shape stays refilled while no reply came after the saved reset: none, or one before it', () => {
  for (const replyAt of [null, NOW - 31, NOW - 30]) {
    const w = acctWith({ ...OCT24, five_hour: { pct: 64, resets_at: NOW - 30 } });
    try {
      const r = resolveLimits(DROPPED, w.acct, NOW, true, { replyAt: () => replyAt, usageNone: () => null });
      assert.deepEqual([r.h5None, r.h5], [false, { pct: 0, left: null, dim: false }], String(replyAt));
      assert.equal(w.saved().fiveHourNone, undefined);
    } finally {
      w.cleanup();
    }
  }
});

test('a true Ultra (Max 20x upgraded, a 24 Oct window still saved): refilled before its first reply, gold after it, and gold from the start of the next session', () => {
  const w = acctWith(OCT24);
  try {
    // a new session, no reply yet: the old window has long reset, so it is drawn refilled, never as Ultra
    const before = resolveLimits(DROPPED, w.acct, NOW, true, { replyAt: () => null });
    assert.deepEqual([before.h5None, before.h5], [false, { pct: 0, left: null, dim: false }]);
    // the first reply, after that reset, brought the limits, and still no five_hour: no 5-hour window
    const after = resolveLimits(DROPPED, w.acct, NOW + 60, true, { replyAt: () => NOW + 55 });
    assert.deepEqual(after, { h5: null, week: { pct: 82, left: 345480, dim: false }, h5None: true });
    assert.deepEqual(w.saved(), { v: 1, five_hour: null, seven_day: { pct: 82, resets_at: NOW + 345540 }, at: NOW + 60, fiveHourNone: true, fiveHourNoneAt: NOW + 60 });
    // the next session, before its first reply: the flag 1.2.1 saved settles it, the transcript is not even asked
    let asked = 0;
    const next = resolveLimits(DROPPED, w.acct, NOW + 3600, true, { replyAt: () => (asked++, null) });
    assert.deepEqual([next.h5None, next.h5, asked], [true, null, 0]);
    assert.equal(w.saved().fiveHourNoneAt, NOW + 60, 'the time it was found is kept');
    // and a payload with no limits at all keeps it, as in 1.1.0
    assert.equal(resolveLimits({}, w.acct, NOW + 3700, false).h5None, true);
    // a live five_hour (a plan change back) clears it
    const live = resolveLimits({ rate_limits: { five_hour: { used_percentage: 3, resets_at: NOW + 20000 }, seven_day: WEEK } }, w.acct, NOW + 3800, true);
    assert.deepEqual([live.h5None, live.h5?.pct], [false, 3]);
    assert.equal(w.saved().fiveHourNone, undefined);
    assert.equal(w.saved().fiveHourNoneAt, undefined);
  } finally {
    w.cleanup();
  }
});

test('a flag 1.1.0 or 1.2.0 saved (fiveHourNone with no fiveHourNoneAt) is not trusted: it may be a dropped window', () => {
  const w = acctWith({ v: 1, five_hour: null, seven_day: { pct: 80, resets_at: NOW + 345540 }, at: NOW - 600, fiveHourNone: true });
  try {
    assert.equal(resolveLimits({}, w.acct, NOW, false).h5None, false, 'no limits: not Ultra either');
    const r = resolveLimits(DROPPED, w.acct, NOW, true, { replyAt: () => NOW - 300 });
    assert.deepEqual([r.h5None, r.h5], [false, null], 'no window saved: the 5-hour is unknown, not Ultra; a reply before Hungerbar watched proves nothing');
    assert.deepEqual(w.saved(), { v: 1, five_hour: null, seven_day: { pct: 82, resets_at: NOW + 345540 }, at: NOW, noFiveHourSince: NOW }, 'the old flag is gone; watching starts');
    assert.equal(resolveLimits(DROPPED, w.acct, NOW + 90, true, { replyAt: () => NOW + 80 }).h5None, true, 'a reply after it, still no five_hour: Ultra');
  } finally {
    w.cleanup();
  }
});

test('the usage API: five_hour null says Ultra at once; a five_hour window says not, whatever the transcript says', () => {
  const w = acctWith({ ...OCT24, five_hour: { pct: 64, resets_at: NOW - 30 } });
  try {
    let asked = 0;
    const gold = resolveLimits(DROPPED, w.acct, NOW, true, { usageNone: () => true, replyAt: () => (asked++, null) });
    assert.deepEqual([gold.h5None, gold.h5, asked], [true, null, 0]);
    assert.equal(w.saved().fiveHourNoneAt, NOW);
  } finally {
    w.cleanup();
  }
  const v = acctWith({ ...OCT24, five_hour: { pct: 64, resets_at: NOW - 30 } });
  try {
    const r = resolveLimits(DROPPED, v.acct, NOW, true, { usageNone: () => false, replyAt: () => NOW - 5 });
    assert.deepEqual([r.h5None, r.h5], [false, { pct: 0, left: null, dim: false }], 'a window the API knows: refilled, even after a reply');
    assert.equal(v.saved().fiveHourNone, undefined);
  } finally {
    v.cleanup();
  }
  // the API's window wins over a trusted flag too (a plan change back), before the reply brings the new five_hour
  const t = acctWith({ v: 1, five_hour: null, seven_day: null, at: NOW - 60, fiveHourNone: true, fiveHourNoneAt: NOW - 60 });
  try {
    assert.deepEqual(resolveLimits(DROPPED, t.acct, NOW, true, { usageNone: () => false }), { h5: null, week: { pct: 82, left: 345540, dim: false }, h5None: false });
    assert.equal(t.saved().fiveHourNone, undefined);
  } finally {
    t.cleanup();
  }
});

test('a fresh install (nothing saved): the 5-hour is unknown until a reply after Hungerbar first saw no 5-hour window', () => {
  const w = acctWith();
  try {
    const first = resolveLimits(DROPPED, w.acct, NOW, true, { replyAt: () => NOW - 120 });
    assert.deepEqual(first, { h5: null, week: { pct: 82, left: 345540, dim: false }, h5None: false }, 'unknown: neither Ultra nor a made-up window');
    assert.deepEqual(w.saved(), { v: 1, five_hour: null, seven_day: { pct: 82, resets_at: NOW + 345540 }, at: NOW, noFiveHourSince: NOW });
    const again = resolveLimits(DROPPED, w.acct, NOW + 10, true, { replyAt: () => NOW });
    assert.equal(again.h5None, false, 'a reply at the moment watching began is not after it');
    assert.equal(w.saved().noFiveHourSince, NOW, 'kept, not moved on');
    const ultra = resolveLimits(DROPPED, w.acct, NOW + 70, true, { replyAt: () => NOW + 60 });
    assert.equal(ultra.h5None, true);
    assert.deepEqual(w.saved(), { v: 1, five_hour: null, seven_day: { pct: 82, resets_at: NOW + 345540 }, at: NOW + 70, fiveHourNone: true, fiveHourNoneAt: NOW + 70 });
  } finally {
    w.cleanup();
  }
  // a Pro or Max fresh install: the first reply brings five_hour, which ends the watch
  const p = acctWith();
  try {
    resolveLimits(DROPPED, p.acct, NOW, true);
    const live = resolveLimits({ rate_limits: { five_hour: { used_percentage: 1, resets_at: NOW + 18000 }, seven_day: WEEK } }, p.acct, NOW + 60, true, { replyAt: () => NOW + 55 });
    assert.deepEqual([live.h5None, live.h5], [false, { pct: 1, left: 17940, dim: false }]);
    assert.deepEqual(p.saved(), { v: 1, five_hour: { pct: 1, resets_at: NOW + 18000 }, seven_day: { pct: 82, resets_at: NOW + 345540 }, at: NOW + 60 });
  } finally {
    p.cleanup();
  }
  // preview (persist false) on a fresh install writes nothing, so it never finds Ultra from the transcript
  const q = acctWith();
  try {
    assert.equal(resolveLimits(DROPPED, q.acct, NOW, false, { replyAt: () => NOW - 1 }).h5None, false);
    assert.equal(resolveLimits(DROPPED, q.acct, NOW, false, { replyAt: () => NOW + 1 }).h5None, false);
  } finally {
    q.cleanup();
  }
});

test('a saved window that has not reset yet (another session started it): drawn last known, never Ultra, even after a reply', () => {
  const w = acctWith({ ...OCT24, five_hour: { pct: 55, resets_at: NOW + 9000 } });
  try {
    const r = resolveLimits(DROPPED, w.acct, NOW, true, { replyAt: () => NOW - 1 });
    assert.deepEqual([r.h5None, r.h5], [false, { pct: 55, left: 9000, dim: true }]);
    assert.deepEqual(w.saved().five_hour, { pct: 55, resets_at: NOW + 9000 });
    assert.equal(w.saved().fiveHourNone, undefined);
  } finally {
    w.cleanup();
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// the evidence: the transcript's replyAt, the usage API's five_hour, and the render that asks them
// ---------------------------------------------------------------------------------------------------------------------

const iso = (t: number): string => new Date(t * 1000).toISOString();
const reply = (t: number, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ type: 'assistant', timestamp: iso(t), message: { id: `msg_${t}`, model: 'claude-opus-5-5', role: 'assistant', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 3, cache_read_input_tokens: 100 } }, ...extra });

test('replyAt: the newest main-chain assistant row with usage; not a prompt, a tool result, a sidechain, an API error or a <synthetic> row', () => {
  const st = freshTx('t.jsonl');
  fold(st, reply(NOW - 100));
  assert.equal(summarize(st).replyAt, NOW - 100);
  fold(st, JSON.stringify({ type: 'user', timestamp: iso(NOW - 50), message: { role: 'user', content: 'go on' }, origin: { kind: 'human' } }));
  fold(st, JSON.stringify({ type: 'user', timestamp: iso(NOW - 45), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' }] } }));
  fold(st, reply(NOW - 40, { isSidechain: true }));
  fold(st, reply(NOW - 30, { isApiErrorMessage: true }));
  fold(st, JSON.stringify({ type: 'assistant', timestamp: iso(NOW - 20), message: { id: 'm2', model: '<synthetic>', role: 'assistant', content: [{ type: 'text', text: 'No response requested.' }], usage: { input_tokens: 0 } } }));
  fold(st, JSON.stringify({ type: 'assistant', timestamp: iso(NOW - 10), message: { id: 'm3', model: 'claude-opus-5-5', role: 'assistant', content: [] } }));
  const s = summarize(st);
  assert.equal(s.replyAt, NOW - 100, 'none of those is a reply from the API');
  assert.equal(s.lastAt, NOW - 10, 'though they are messages (lastAt)');
  fold(st, reply(NOW - 5));
  fold(st, reply(NOW - 200));
  assert.equal(summarize(st).replyAt, NOW - 5, 'the newest is kept');
  assert.equal(summarize(freshTx('u.jsonl')).replyAt, null);
});

test('fiveHourWord: null is no 5-hour window, an object is one, anything else no word; savedNoFiveHour needs fiveHourNoneAt', () => {
  assert.equal(fiveHourWord({ five_hour: null } as never), true);
  assert.equal(fiveHourWord({ five_hour: { utilization: 5, resets_at: null } } as never), false);
  for (const b of [{}, { five_hour: 5 }, { five_hour: [] }, { five_hour: 'x' }, null]) assert.equal(fiveHourWord(b as never), undefined, JSON.stringify(b));
  assert.equal(savedNoFiveHour({ fiveHourNone: true, fiveHourNoneAt: NOW }), true);
  for (const f of [{ fiveHourNone: true }, { fiveHourNone: true, fiveHourNoneAt: Number.NaN }, { fiveHourNoneAt: NOW }, null, undefined]) {
    assert.equal(savedNoFiveHour(f as never), false, JSON.stringify(f));
  }
});

/** A temp world for renderPayload: the cache, the Claude folder, a transcript, and this config. */
function world(config: unknown = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hb-drop-r-'));
  const env: Record<string, string> = {
    HUNGERBAR_CACHE_DIR: join(dir, 'cache'), CLAUDE_CONFIG_DIR: join(dir, 'claude'), HUNGERBAR_NOW: String(NOW), HUNGERBAR_LOOK: 'hud', FORCE_COLOR: '3',
  };
  mkdirSync(env.CLAUDE_CONFIG_DIR!, { recursive: true });
  writeFileSync(join(env.CLAUDE_CONFIG_DIR!, 'hungerbar.json'), JSON.stringify(config));
  const acct = acctDir(env), tx = join(dir, 'transcript.jsonl');
  mkdirSync(acct, { recursive: true });
  writeFileSync(tx, '');
  const payload = JSON.stringify({ session_id: '00000000-0000-4000-8000-000000000009', transcript_path: tx, model: { display_name: 'Opus 5.5' }, rate_limits: { seven_day: WEEK } });
  return {
    env, acct, tx, payload,
    limits: (f: unknown) => writeFileSync(join(acct, 'limits.json'), JSON.stringify(f)),
    usage: (word: boolean) => writeFileSync(join(acct, 'usage.json'), JSON.stringify({ v: 1, at: NOW - 30, extra: null, scoped: [], lockUntil: 0, fiveHourNone: word })),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test("through renderPayload: the dropped window draws refilled red hearts and classic's Session; a reply after the reset turns them gold", () => {
  const w = world();
  try {
    w.limits({ v: 1, five_hour: { pct: 64, resets_at: NOW - 30 }, seven_day: { pct: 80, resets_at: NOW + 345540 }, at: NOW - 600 });
    writeFileSync(w.tx, reply(NOW - 600) + '\n');
    const r = renderPayload(w.payload, { env: w.env });
    assert.deepEqual([r.state?.h5None, r.state?.h5], [false, { pct: 0, left: null, dim: false }]);
    assert.ok(r.hud, 'the HUD drew');
    assert.equal(r.hud.vitals.ultra, false, 'no golden apple');
    assert.deepEqual(r.hud.input.h5, { used: 0, window: 18000 }, 'the engine is handed a full window, as live-reset-passed drew it');
    const c = renderPayload(w.payload, { env: { ...w.env, HUNGERBAR_LOOK: 'classic', NO_COLOR: '1' } });
    assert.match(c.text, /Session:[^│]*100%/, 'classic keeps its Session item, full');
    // Claude replies after the reset, and the payload still has no five_hour: the account has no 5-hour window
    writeFileSync(w.tx, reply(NOW - 600) + '\n' + reply(NOW - 5) + '\n');
    const g = renderPayload(w.payload, { env: w.env });
    assert.deepEqual([g.state?.h5None, g.hud?.vitals.ultra], [true, true]);
    assert.equal(savedNoFiveHour(JSON.parse(readFileSync(join(w.acct, 'limits.json'), 'utf8'))), true);
  } finally {
    w.cleanup();
  }
});

test("through renderPayload: the usage API's five_hour null turns them gold before any reply, only while the usage API is on", () => {
  const on = world({ network: { usageApi: true } });
  try {
    on.limits({ v: 1, five_hour: { pct: 64, resets_at: NOW - 30 }, seven_day: null, at: NOW - 600 });
    on.usage(true);
    const off = renderPayload(on.payload, { env: { ...on.env, HUNGERBAR_OFFLINE: '1' } });
    assert.equal(off.state?.h5None, false, 'offline: the usage API is off, so its old word is not read');
    const r = renderPayload(on.payload, { env: on.env });
    assert.deepEqual([r.state?.h5None, r.hud?.vitals.ultra], [true, true]);
  } finally {
    on.cleanup();
  }
  const cfgOff = world();
  try {
    cfgOff.limits({ v: 1, five_hour: { pct: 64, resets_at: NOW - 30 }, seven_day: null, at: NOW - 600 });
    cfgOff.usage(true);
    assert.equal(renderPayload(cfgOff.payload, { env: cfgOff.env }).state?.h5None, false, 'network.usageApi off');
  } finally {
    cfgOff.cleanup();
  }
});

test("scrub (1.2.1): Claude Code 2.1.317's top-level scratchpad_dir is replaced, as the other paths are", () => {
  const pad = 'C:\\Users\\steve\\AppData\\Local\\Temp\\claude\\0a1b2c3d\\9f8e7d6c-0000-4000-8000-00000000abcd\\scratchpad';
  const raw = JSON.stringify({
    session_id: '9f8e7d6c-0000-4000-8000-00000000abcd', transcript_path: 'C:\\Users\\steve\\.claude\\projects\\x\\s.jsonl', cwd: 'D:\\webapp',
    scratchpad_dir: pad, workspace: { current_dir: 'D:\\webapp', project_dir: 'D:\\webapp' }, version: '2.1.317',
  });
  const out = scrub(raw)!;
  const p = JSON.parse(out) as Record<string, unknown>;
  assert.equal(p.scratchpad_dir, '{{SCRATCHPAD}}');
  assert.equal(p.transcript_path, '{{TRANSCRIPT}}');
  assert.equal(p.cwd, '{{REPO}}');
  assert.ok(!out.includes('steve') && !out.includes('Temp'), out);
  assert.equal(JSON.parse(scrub(JSON.stringify({ scratchpad_dir: '' }))!).scratchpad_dir, '', 'an empty one is left');
  assert.equal(JSON.parse(scrub(JSON.stringify({ scratchpad_dir: 7 }))!).scratchpad_dir, 7, 'not a string: left');
});
