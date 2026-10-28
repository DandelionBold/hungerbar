import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { defaults } from '../src/config.ts';
import { diskSources } from '../src/render.ts';
import { pruneOld } from '../src/store.ts';
import {
  fold, freshTx, readTranscript, refreshTranscript, summarize, TX_BUDGET, txId, txLockPath, txStatePath, WAITS_ON_USER, type TxState, type TxSummary,
} from '../src/transcript.ts';
import type { Payload } from '../src/payload.ts';
import { DIST, ROOT } from './harness.ts';

const fresh = (): TxState => freshTx('x');
const row = (id: string, ts: string, u: Record<string, unknown>, more: Record<string, unknown> = {}): string =>
  JSON.stringify({ type: 'assistant', timestamp: ts, message: { id, model: 'claude-opus-5-5', usage: u }, ...more });

const SYNTH = [
  JSON.stringify({ type: 'user', message: { content: 'hi "assistant"' } }),
  row('a', '2026-10-24T10:00:00Z', { input_tokens: 100, cache_creation_input_tokens: 1000, cache_read_input_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 1000 } }, { effort: 'high' }),
  row('a', '2026-10-24T10:00:00Z', { input_tokens: 100, cache_creation_input_tokens: 1000, cache_read_input_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 1000 } }, { effort: 'high' }),
  row('side', '2026-10-24T10:01:00Z', { input_tokens: 5, cache_read_input_tokens: 99999 }, { isSidechain: true, effort: 'low' }),
  row('err', '2026-10-24T10:02:00Z', { input_tokens: 5, cache_read_input_tokens: 99999 }, { isApiErrorMessage: true }),
  JSON.stringify({ type: 'attachment', attachment: { type: 'assistant' } }),
  row('b', '2026-10-24T10:03:00Z', { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 8890 }, { perTurnEffort: 'xhigh' }),
  'not json at all "assistant"',
];

const tmp = (): string => mkdtempSync(join(tmpdir(), 'hb-tx-'));

test('synthetic rows: duplicates, sidechains, API errors and attachments are skipped', () => {
  const st = fresh();
  for (const l of SYNTH) fold(st, l);
  assert.deepEqual([st.sumInput, st.sumCreate, st.sumRead], [110, 1000, 8890]);
  const s = summarize(st);
  assert.equal(s.hitRatio, 8890 / 10000);
  assert.deepEqual(s.lastCached, { ts: Date.parse('2026-10-24T10:03:00Z') / 1000, ttl: '5m' }, 'a read-only row keeps the previous TTL');
  assert.deepEqual(s.lastEffort, { level: 'xhigh', model: 'claude-opus-5-5' });
  assert.deepEqual(s.lastUsage, { input: 10, create: 0, read: 8890 });
});

test('a truncated last line is left for the next read', () => {
  const dir = tmp();
  try {
    const file = join(dir, 't.jsonl');
    const full = SYNTH.join('\n') + '\n';
    const cut = full.length - 30;
    writeFileSync(file, full.slice(0, cut));
    const partial = readTranscript(file, 'sess', dir, true);
    assert.deepEqual(partial?.lastUsage, { input: 100, create: 1000, read: 0 }, 'the half-written row b is not folded yet');
    assert.equal(partial?.hitRatio, 0);
    appendFileSync(file, full.slice(cut));
    const done = readTranscript(file, 'sess', dir, true);
    assert.equal(done?.hitRatio, 8890 / 10000);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the compact boundary clears the context usage until the next reply', () => {
  const st = fresh();
  fold(st, row('a', '2026-10-24T10:00:00Z', { input_tokens: 1, cache_read_input_tokens: 900000 }));
  fold(st, JSON.stringify({ type: 'system', subtype: 'compact_boundary', timestamp: '2026-10-24T10:05:00Z', compactMetadata: { trigger: 'auto' } }));
  assert.equal(summarize(st).lastUsage, null);
  assert.equal(summarize(st).hitRatio, 900000 / 900001, 'the session hit ratio is kept');
  fold(st, row('b', '2026-10-24T10:06:00Z', { input_tokens: 2, cache_creation_input_tokens: 40000, cache_read_input_tokens: 0 }));
  assert.deepEqual(summarize(st).lastUsage, { input: 2, create: 40000, read: 0 });
});

const REAL = join(ROOT, 'test', 'fixtures', 'transcripts', 'real-scrubbed.jsonl');

test('scrubbed real session: pinned sums, and the 64-id window dedupes like a full set', () => {
  const lines = readFileSync(REAL, 'utf8').split('\n');
  const st = fresh();
  for (const l of lines) fold(st, l);
  assert.deepEqual([st.sumRead, st.sumCreate, st.sumInput], [237891688, 12121299, 890]);
  assert.equal(Math.floor(summarize(st).hitRatio! * 100 + 0.5), 95);
  const seen = new Set<string>();
  let read = 0;
  for (const l of lines) {
    if (!l) continue;
    const r = JSON.parse(l) as { type: string; isSidechain?: boolean; message?: { id: string; usage: { cache_read_input_tokens: number } } };
    if (r.type !== 'assistant' || r.isSidechain || !r.message || seen.has(r.message.id)) continue;
    seen.add(r.message.id);
    read += r.message.usage.cache_read_input_tokens;
  }
  assert.equal(read, st.sumRead);
});

test('scrubbed real session: pinned counts (the scrubber keeps bare {type:"user"} rows, all legacy prompts)', () => {
  const lines = readFileSync(REAL, 'utf8').split('\n');
  const st = fresh();
  for (const l of lines) fold(st, l);
  assert.equal(lines.filter((l) => l === '{"type":"user"}').length, 480);
  assert.deepEqual([st.turns, st.compactions, st.sawOrigin], [480, 2, false]);
});

test('incremental reads equal one full scan, whatever the chunk boundaries', () => {
  const dir = tmp();
  try {
    const all = readFileSync(REAL);
    const file = join(dir, 't.jsonl');
    writeFileSync(file, '');
    let pos = 0, i = 0;
    while (pos < all.length) {
      const step = [1, 777, 40000, 3, 123457][i++ % 5]!;
      appendFileSync(file, all.subarray(pos, pos + step));
      pos += step;
      readTranscript(file, 'inc', dir, true);
    }
    const inc = readTranscript(file, 'inc', dir, true);
    const full = readTranscript(file, 'full', dir, false);
    assert.deepEqual(inc, full);
    const state = JSON.parse(readFileSync(join(dir, 'transcript', 'inc.json'), 'utf8')) as TxState;
    assert.equal(state.offset, all.length);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a shorter file (new session in the same path) starts over', () => {
  const dir = tmp();
  try {
    const file = join(dir, 't.jsonl');
    writeFileSync(file, SYNTH.join('\n') + '\n');
    readTranscript(file, 's', dir, true);
    writeFileSync(file, row('z', '2026-10-24T11:00:00Z', { input_tokens: 1, cache_read_input_tokens: 3 }) + '\n');
    assert.equal(readTranscript(file, 's', dir, true)?.hitRatio, 3 / 4);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- Transcript v2: prompts (turns) and compactions, plan §7 ----

type Extra = Record<string, unknown>;
const human = { kind: 'human' };
const user = (content: unknown, more: Extra = {}): string => JSON.stringify({ type: 'user', message: { role: 'user', content }, ...more });
const prompt = (text: string, more: Extra = {}): string => user(text, { origin: human, ...more });
const toolResult = (more: Extra = {}): string =>
  user([{ type: 'tool_result', tool_use_id: 'toolu_01', content: 'ok' }], { toolUseResult: { stdout: 'ok' }, ...more });
const boundary = (more: Extra = {}): string => JSON.stringify({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'auto' }, ...more });
const IMG = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } };
/** A prompt typed while Claude worked, in the shape Claude Code 2.1.187-2.1.308 writes (no user row follows it). */
const queued = (text: unknown, more: Extra = {}, attachment: Extra = {}): string => JSON.stringify({
  parentUuid: 'p1', isSidechain: false,
  attachment: {
    type: 'queued_command', prompt: text, source_uuid: 's1', delivery_id: 'd1', commandMode: 'prompt', origin: human,
    timestamp: '2026-10-24T23:01:39.309Z', humanTurn: true, ...attachment,
  },
  type: 'attachment', uuid: 'q1', timestamp: '2026-10-24T23:01:39.309Z',
  rendered: [{ content: '<system-reminder>\nThe user sent a new message while you were working:\n…\n</system-reminder>' }], renderedRole: 'system',
  ...more,
});

/** Each row with whether it is a prompt, in a transcript that has already shown an origin. */
const CASES: Array<[string, string, boolean]> = [
  ['a typed prompt', prompt('fix the build'), true],
  ['text blocks', user([{ type: 'text', text: 'look at this' }], { origin: human }), true],
  ['text and an image', user([{ type: 'text', text: 'what is this?' }, IMG], { origin: human }), true],
  ['an image first, then text', user([IMG, { type: 'text', text: 'and this' }], { origin: human }), true],
  ['image only', user([IMG, IMG], { origin: human }), true],
  ['<pasted_content> first', prompt('<pasted_content id="1">log</pasted_content>\nwhy?'), true],
  ['<system-reminder> first', prompt('<system-reminder>x</system-reminder>\nproceed'), true],
  ['typed text that quotes the filter keys', prompt('why is "tool_use_id" in "type":"user" rows?'), true],
  ['leading whitespace before typed text', prompt('  \n go'), true],
  ['an interrupt marker', prompt('[Request interrupted by user]'), false],
  ['an interrupt marker for tool use, as a block', user([{ type: 'text', text: '[Request interrupted by user for tool use]' }], { origin: human }), false],
  ['a tool result', toolResult(), false],
  ['a tool result row with a human origin', toolResult({ origin: human }), false],
  ['a tool_result block without the key text', user([{ type: 'tool_result', content: 'ok' }], { origin: human }), false],
  ['toolUseResult alone', prompt('x', { toolUseResult: 'y' }), false],
  ['isMeta', prompt('Caveat: the messages below…', { isMeta: true }), false],
  ['isCompactSummary', prompt('This session is being continued…', { isCompactSummary: true }), false],
  ['a sidechain prompt', prompt('subagent task', { isSidechain: true }), false],
  ['a task notification', user('<task-notification>\n<task-id>1</task-id>', { origin: { kind: 'task-notification' } }), false],
  ['a task notification with a human origin', prompt('<task-notification>done</task-notification>'), false],
  ['a cross-session message', prompt('<cross-session-message from="a">hi</cross-session-message>'), false],
  ['a scheduled task', prompt('<scheduled-task name="x">run</scheduled-task>'), false],
  ['a slash command', prompt('<command-name>/model</command-name>'), false],
  ['a slash command after whitespace', prompt('\n\t <command-message>model</command-message>'), false],
  ['local command output', prompt('<local-command-stdout>Set model</local-command-stdout>'), false],
  ['a ! command', prompt('<bash-input>ls</bash-input>'), false],
  ['! command output', user([{ type: 'text', text: '<bash-stdout>a</bash-stdout>' }], { origin: human }), false],
  ['another origin kind', user('hello', { origin: { kind: 'agent' } }), false],
  ['an origin that is not an object', user('hello', { origin: 'human' }), false],
  ['no origin after an origin was seen', user('hello'), false],
  ['an assistant row', row('m1', '2026-10-24T10:00:00Z', { input_tokens: 1 }), false],
  ['a prompt queued while Claude worked', queued('show me the ideas'), true],
  ['a queued image-only prompt', queued([IMG]), true],
  ['a queued prompt: an image, then text', queued([IMG, { type: 'text', text: 'and this' }]), true],
  ['a queued <system-reminder>-led prompt', queued('<system-reminder>x</system-reminder>\nproceed'), true],
  ['a queued prompt with no humanTurn key', queued('go on', {}, { humanTurn: undefined }), true],
  ['a queued prompt in a sidechain', queued('subagent task', { isSidechain: true }), false],
  ['a queued prompt from a peer session', queued('hello from a peer', {}, { origin: { kind: 'peer' } }), false],
  ['a queued task notification', queued('<task-notification>\n<task-id>b1</task-id>', {}, { commandMode: 'task-notification', origin: { kind: 'task-notification', producer: 'session-task' } }), false],
  ['a queued task notification with no origin', queued('<task-notification>x', {}, { commandMode: 'task-notification', origin: undefined }), false],
  ['a queued task notification marked as a prompt', queued('<task-notification>x</task-notification>'), false],
  ['a queued prompt with no origin', queued('who typed this?', {}, { origin: undefined }), false],
  ['a queued prompt whose origin is not an object', queued('x', {}, { origin: 'human' }), false],
  ['a queued prompt whose origin is null', queued('x', {}, { origin: null }), false],
  ['a queued ! command', queued('ls', {}, { commandMode: 'bash' }), false],
  ['a queued slash command', queued('<command-name>/model</command-name>'), false],
  ['a queued interrupt marker', queued('[Request interrupted by user]'), false],
  ['the queue-operation rows around it', JSON.stringify({ type: 'queue-operation', operation: 'remove', content: 'show me the ideas', reason: 'absorbed_mid_turn', commandUuid: 's1' }), false],
  ['another attachment type', JSON.stringify({ type: 'attachment', attachment: { type: 'total_tokens_reminder' } }), false],
  ['an attachment row with a null payload', JSON.stringify({ type: 'attachment', attachment: null, note: 'queued_command' }), false],
  ['an attachment row whose payload is a string', JSON.stringify({ type: 'attachment', attachment: 'queued_command' }), false],
  ['a queued_command payload on another row type', queued('x', { type: 'progress' }), false],
];

test('the turn rule, row by row (after an origin has been seen)', () => {
  for (const [what, line, counts] of CASES) {
    const st = fresh();
    fold(st, user('opening', { origin: human }));
    assert.equal(st.sawOrigin, true);
    fold(st, line);
    assert.equal(st.turns, counts ? 2 : 1, what);
  }
});

test('legacy transcripts: a row with no origin counts until any row shows one', () => {
  const st = fresh();
  for (const l of [user('first'), user([IMG]), user([{ type: 'text', text: 'second' }]), user('again', { turnOrigin: 'human' })]) fold(st, l);
  assert.deepEqual([st.turns, st.sawOrigin], [4, false]);
  for (const l of [user('[Request interrupted by user]'), user('<command-name>/clear</command-name>'), user('<local-command-stdout></local-command-stdout>'), toolResult(), user('<bash-input>ls</bash-input>')]) fold(st, l);
  assert.equal(st.turns, 4, 'markers and tool results never count, not even in a legacy transcript');
  fold(st, user('<task-notification>x', { origin: { kind: 'task-notification' } }));
  assert.deepEqual([st.turns, st.sawOrigin], [4, true], 'any origin, even one that is not a prompt, ends the legacy rule');
  fold(st, user('an origin-less row now'));
  fold(st, prompt('typed'));
  assert.equal(st.turns, 5);
});

test('legacy rule: the opening prompt another session wrote (turnOrigin "sdk") is not typed', () => {
  const st = fresh();
  fold(st, user('Background (from the session that started this one): …', { promptSource: 'sdk', turnOrigin: 'sdk' }));
  assert.deepEqual([st.turns, st.sawOrigin], [0, false]);
  fold(st, user('typed in an old client'));
  assert.equal(st.turns, 1);
});

test('a queued prompt counts in a legacy transcript too, and does not end the legacy rule', () => {
  const st = fresh();
  fold(st, user('typed in an old client'));
  fold(st, queued('typed while Claude worked'));
  assert.deepEqual([st.turns, st.sawOrigin], [2, false]);
  fold(st, user('still no origin on user rows'));
  assert.equal(st.turns, 3);
});

const QUEUED = join(ROOT, 'test', 'fixtures', 'transcripts', 'queued-scrubbed.jsonl');

test('scrubbed real slice: two prompts sent mid-turn count, their queue-operation rows do not, nothing else moves but the last message', () => {
  const lines = readFileSync(QUEUED, 'utf8').split('\n');
  const rows = lines.filter(Boolean).map((l) => JSON.parse(l) as { type: string; attachment?: { type: string }; message?: { content: unknown } });
  assert.equal(rows.filter((r) => r.type === 'queue-operation').length, 6, 'enqueue/dequeue for the typed prompt, enqueue/remove for each queued one');
  assert.equal(rows.filter((r) => r.type === 'user' && typeof r.message?.content === 'string').length, 1, 'one prompt row');
  assert.equal(rows.filter((r) => r.attachment?.type === 'queued_command').length, 2);
  const st = fresh();
  for (const l of lines) fold(st, l);
  assert.deepEqual([st.turns, st.compactions, st.sawOrigin], [3, 0, true]);
  const without = fresh();
  for (const l of lines) if (!l.includes('"queued_command"')) fold(without, l);
  assert.equal(without.turns, 1, 'no user row is written for a queued prompt');
  // a prompt sent mid-turn is a message too (the idle bed, 0.7.0); the last one (23:03:10.989) falls in the same second as
  // the Workflow call's result (23:03:10.935), and a tool result is a message as well
  assert.equal(st.lastAt, Math.floor(Date.parse('2026-10-24T23:03:10.989Z') / 1000));
  assert.equal(without.lastAt, Math.floor(Date.parse('2026-10-24T23:03:10.935Z') / 1000));
  assert.deepEqual({ ...st, turns: 0, lastAt: 0 }, { ...without, turns: 0, lastAt: 0 }, 'the queued rows touch only the turn count and the last message');
  // the real rows' tool calls: each is open from its tool_use row to its result (read off the line), and none is left
  assert.deepEqual([st.open, st.openMsg, summarize(st).running], [[], 'msg_q003', false]);
  const upTo = fresh();
  for (const l of lines.slice(0, lines.findIndex((l) => l.includes('"id":"toolu_q004"')) + 1)) fold(upTo, l);
  assert.deepEqual([upTo.open, upTo.openMsg, summarize(upTo).running], [['toolu_q004'], 'msg_q003', true], 'the Workflow call, before its result');
  assert.equal(upTo.lastAt, Math.floor(Date.parse('2026-10-24T23:03:09.990Z') / 1000));
  assert.deepEqual([st.sumRead, st.sumCreate, st.sumInput, st.recentIds.length], [2747513, 6586, 6, 3]);

  const dir = tmp();
  try {
    const all = readFileSync(QUEUED);
    const file = join(dir, 't.jsonl');
    writeFileSync(file, '');
    let pos = 0, i = 0;
    while (pos < all.length) {
      const step = [1, 333, 7, 2048][i++ % 4]!;
      appendFileSync(file, all.subarray(pos, pos + step));
      pos += step;
      readTranscript(file, 'q', dir, true);
    }
    const inc = readTranscript(file, 'q', dir, true);
    assert.deepEqual(inc, summarize(st));
    assert.equal(inc?.turns, 3);
    assert.deepEqual(refreshTranscript(file, 'w', dir), inc, 'the worker folds them the same way');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('compactions: main-chain boundaries count; a sidechain one only clears the usage', () => {
  const st = fresh();
  fold(st, row('a', '2026-10-24T10:00:00Z', { input_tokens: 1, cache_read_input_tokens: 9 }));
  fold(st, boundary({ isSidechain: true }));
  assert.deepEqual([st.compactions, st.lastUsage], [0, null]);
  fold(st, boundary());
  fold(st, boundary({ isSidechain: false }));
  fold(st, JSON.stringify({ type: 'system', subtype: 'stop_hook_summary' }));
  assert.equal(st.compactions, 2);
});

test('rows that are not objects are ignored', () => {
  const st = fresh();
  for (const l of ['null', '"compact_boundary"', '["assistant"]', '{"type":"user"', '42']) fold(st, l);
  assert.deepEqual(summarize(st), summarize(fresh()));
});

/** A mixed session: prompts of every kind, tool results, replies and compactions. */
function session(n: number, pad = 0): string[] {
  const out: string[] = [user('legacy opening, before any origin')];
  for (let i = 0; i < n; i++) {
    out.push(prompt(`prompt ${i} ${'x'.repeat(pad)}`));
    out.push(row(`m${i}`, '2026-10-24T10:00:00Z', { input_tokens: 1, cache_creation_input_tokens: 10, cache_read_input_tokens: 100 + i }, { effort: 'high' }));
    out.push(toolResult());
    if (i % 7 === 3) out.push(user('[Request interrupted by user]'));
    if (i % 11 === 5) out.push(user('<task-notification>t', { origin: { kind: 'task-notification' } }));
    if (i % 13 === 6) out.push(user([IMG], { origin: human }));
    if (i % 17 === 8) out.push(boundary());
  }
  return out;
}

const scan = (lines: string[]): TxSummary => {
  const st = freshTx('x');
  for (const l of lines) fold(st, l);
  return summarize(st);
};

test('incremental reads equal one full scan, counts included', () => {
  const dir = tmp();
  try {
    const lines = session(300);
    const all = Buffer.from(lines.join('\n') + '\n');
    const file = join(dir, 't.jsonl');
    writeFileSync(file, '');
    let pos = 0, i = 0;
    while (pos < all.length) {
      const step = [1, 77, 4000, 3, 12345][i++ % 5]!;
      appendFileSync(file, all.subarray(pos, pos + step));
      pos += step;
      readTranscript(file, 'inc', dir, true);
    }
    const inc = readTranscript(file, 'inc', dir, true);
    assert.deepEqual(inc, scan(lines));
    assert.deepEqual(inc, readTranscript(file, 'full', dir, false));
    assert.deepEqual([inc?.turns, inc?.compactions, inc?.needsWorker], [1 + 300 + 23, 18, false], 'the opening, the prompts, the images');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a half-written prompt is counted once it is complete', () => {
  const dir = tmp();
  try {
    const file = join(dir, 't.jsonl');
    const p = prompt('one') + '\n';
    writeFileSync(file, prompt('zero') + '\n' + p.slice(0, 10));
    assert.equal(readTranscript(file, 's', dir, true)?.turns, 1);
    appendFileSync(file, p.slice(10));
    assert.equal(readTranscript(file, 's', dir, true)?.turns, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lastAt (the idle bed, 0.7.0): the newest main-chain user row (a tool result too), assistant reply or prompt sent mid-turn, in seconds', () => {
  const at = (iso: string): number => Math.floor(Date.parse(iso) / 1000);
  const st = fresh();
  assert.equal(summarize(st).lastAt, null, 'nothing yet');
  fold(st, prompt('hi', { timestamp: '2026-10-24T10:00:00.900Z' }));
  assert.equal(st.lastAt, at('2026-10-24T10:00:00Z'), 'a typed prompt; whole seconds');
  fold(st, row('a1', '2026-10-24T10:01:00Z', { input_tokens: 1 }));
  assert.equal(st.lastAt, at('2026-10-24T10:01:00Z'), 'a reply');
  fold(st, user('<command-name>/clear</command-name>', { timestamp: '2026-10-24T10:02:00Z' }));
  assert.equal(st.lastAt, at('2026-10-24T10:02:00Z'), 'any user row the person caused, a slash command too (not a prompt)');
  assert.equal(st.turns, 1);
  fold(st, queued('more', { timestamp: '2026-10-24T10:03:00Z' }));
  assert.equal(st.lastAt, at('2026-10-24T10:03:00Z'), 'a prompt sent mid-turn');
  fold(st, toolResult({ timestamp: '2026-10-24T10:04:00Z' }));
  assert.equal(st.lastAt, at('2026-10-24T10:04:00Z'), 'a tool result: Claude is at work');
  for (const l of [
    toolResult({ timestamp: '2026-10-24T11:00:00Z', isSidechain: true }),
    prompt('side', { timestamp: '2026-10-24T11:00:00Z', isSidechain: true }),
    row('s1', '2026-10-24T11:00:00Z', { input_tokens: 1 }, { isSidechain: true }),
    row('e1', '2026-10-24T11:00:00Z', { input_tokens: 1 }, { isApiErrorMessage: true }),
    boundary({ timestamp: '2026-10-24T11:00:00Z' }),
    queued('peer', { timestamp: '2026-10-24T11:00:00Z' }, { commandMode: 'task-notification' }),
    prompt('no time'),
    prompt('bad time', { timestamp: 'yesterday' }),
  ]) fold(st, l);
  assert.equal(st.lastAt, at('2026-10-24T10:04:00Z'), 'sidechains (their tool results too), API errors, boundaries, other queued rows and rows without a time do not move it');
  fold(st, row('a0', '2026-10-24T09:00:00Z', { input_tokens: 1 }));
  assert.equal(st.lastAt, at('2026-10-24T10:04:00Z'), 'an older row keeps the newest');
  assert.equal(summarize(st).lastAt, st.lastAt);
  // a state written before 0.7.0 has none: unknown until the next message, without a rescan
  const old: TxState = { ...fresh(), turns: 7 };
  delete old.lastAt;
  assert.equal(summarize(old).lastAt, null);
  fold(old, prompt('next', { timestamp: '2026-10-24T12:00:00Z' }));
  assert.deepEqual([old.lastAt, old.turns], [at('2026-10-24T12:00:00Z'), 8]);
});

// ---- Open tool calls: a turn in progress is not idle (the idle bed, 0.7.0) ----

/** An assistant row of message `msg` with these blocks, in Claude Code's key order. */
const said = (msg: string, ts: string, content: unknown[], more: Extra = {}): string => JSON.stringify({
  parentUuid: 'p', isSidechain: false, type: 'assistant', uuid: 'u', timestamp: ts,
  message: { model: 'claude-opus-5-5', id: msg, type: 'message', role: 'assistant', content, stop_reason: 'tool_use', usage: { input_tokens: 1 } }, ...more,
});
const call = (id: string, name = 'Bash'): Extra => ({ type: 'tool_use', id, name, input: { command: 'npm test' } });
/** A tool result in Claude Code's key order: the row's own isSidechain, type and timestamp before the result's fields. */
const answer = (ids: string[], ts: string, more: Extra = {}, result: unknown = { stdout: 'ok', interrupted: false }): string => JSON.stringify({
  parentUuid: 'p', isSidechain: false, promptId: 'q', type: 'user',
  message: { role: 'user', content: ids.map((id) => ({ tool_use_id: id, type: 'tool_result', content: 'ok', is_error: false })) },
  uuid: 'u', timestamp: ts, toolUseResult: result, sourceToolAssistantUUID: 'a', ...more,
});
const turnOver = (more: Extra = {}): string => JSON.stringify({ parentUuid: 'p', isSidechain: false, type: 'system', subtype: 'turn_duration', durationMs: 400000, messageCount: 9, timestamp: '2026-10-24T12:00:00Z', isMeta: true, ...more });

test('open tool calls: a main-chain call without its result is running, whatever the time; its result ends it and is a message', () => {
  const at = (hms: string): number => Math.floor(Date.parse(`2026-10-24T${hms}Z`) / 1000);
  const st = fresh();
  const running = (): boolean => summarize(st).running;
  assert.equal(running(), false, 'nothing yet');
  fold(st, prompt('run the tests', { timestamp: '2026-10-24T10:00:00Z' }));
  fold(st, said('m1', '2026-10-24T10:00:04Z', [{ type: 'thinking', thinking: '', signature: 'x' }]));
  assert.equal(running(), false, 'thinking: no call yet');
  fold(st, said('m1', '2026-10-24T10:00:05Z', [call('t1')]));
  assert.deepEqual([st.open, st.openMsg, running(), st.lastAt], [['t1'], 'm1', true, at('10:00:05')], 'a long npm test: running, the last message is its tool_use');
  // nothing more for 6 minutes: the state does not change with time, the call stays open until its result
  fold(st, answer(['t1'], '2026-10-24T10:06:30Z'));
  assert.deepEqual([st.open, running(), st.lastAt], [[], false, at('10:06:30')], 'its result: done, and a message (the 5 minutes start again)');

  // parallel calls are rows of one message; a duplicated row adds nothing
  fold(st, said('m2', '2026-10-24T10:07:00Z', [{ type: 'text', text: 'two at once' }]));
  fold(st, said('m2', '2026-10-24T10:07:00Z', [call('t2')]));
  fold(st, said('m2', '2026-10-24T10:07:01Z', [call('t3', 'Agent')]));
  fold(st, said('m2', '2026-10-24T10:07:01Z', [call('t3', 'Agent')]));
  assert.deepEqual([st.open, st.openMsg], [['t2', 't3'], 'm2']);
  fold(st, answer(['t2'], '2026-10-24T10:07:10Z'));
  assert.deepEqual([st.open, running()], [['t3'], true], 'the subagent still works');
  // the subagent's own rows (a sidechain, as older Claude Code writes them in the main transcript), a progress row that
  // quotes a result, and a hook's system row: not the main chain's, so they neither close the call nor move lastAt
  for (const l of [
    said('s1', '2026-10-24T10:12:00Z', [call('t3')], { isSidechain: true }),
    answer(['t3'], '2026-10-24T10:12:30Z', { isSidechain: true }),
    JSON.stringify({ type: 'progress', data: { type: 'agent_progress', message: { type: 'user', message: { content: [{ tool_use_id: 't3', type: 'tool_result' }] } } }, timestamp: '2026-10-24T10:12:55Z' }),
    JSON.stringify({ type: 'system', subtype: 'stop_hook_summary', toolUseID: 't3', timestamp: '2026-10-24T10:12:58Z' }),
  ]) fold(st, l);
  assert.deepEqual([st.open, running(), st.lastAt], [['t3'], true, at('10:07:10')], 'still running 5 minutes on');
  fold(st, answer(['t3'], '2026-10-24T10:20:00Z', {}, { status: 'completed', content: [{ type: 'text', text: 'done' }], timestamp: '2026-10-24T09:00:00Z' }));
  assert.deepEqual([st.open, running(), st.lastAt], [[], false, at('10:20:00')], 'the row\'s own time, not one inside the result');

  // one result row answering two calls; a result for a call that is not open changes nothing but the time
  fold(st, said('m3', '2026-10-24T10:21:00Z', [call('t4'), call('t5', 'PowerShell')]));
  assert.deepEqual(st.open, ['t4', 't5']);
  fold(st, answer(['t9'], '2026-10-24T10:21:01Z'));
  assert.deepEqual(st.open, ['t4', 't5']);
  fold(st, answer(['t4', 't5'], '2026-10-24T10:30:00Z'));
  assert.deepEqual([st.open, st.lastAt], [[], at('10:30:00')]);
  // a result that names "assistant" somewhere is parsed instead: the same answer
  fold(st, said('m4', '2026-10-24T10:31:00Z', [call('t6', 'Read')]));
  fold(st, answer(['t6'], '2026-10-24T10:40:00Z', {}, { type: 'text', file: { content: '{"role":"assistant"}' }, role: 'assistant' }));
  assert.deepEqual([st.open, running(), st.lastAt], [[], false, at('10:40:00')]);
  fold(st, said('m5', '2026-10-24T10:41:00Z', [call('t7')]));
  fold(st, answer(['t7'], '2026-10-24T10:42:00Z', { isSidechain: true }, { role: 'assistant' }));
  assert.deepEqual([st.open, st.lastAt], [['t7'], at('10:41:00')], 'parsed, a sidechain result is not the main chain\'s either');
  fold(st, answer(['t7'], '2026-10-24T10:42:00Z'));
  assert.equal(running(), false);
});

test('open tool calls: the tools that wait on the person never count; a new message, a typed prompt and turn_duration close what is left', () => {
  const st = fresh();
  const running = (): boolean => summarize(st).running;
  fold(st, prompt('plan it', { timestamp: '2026-10-24T10:00:00Z' }));
  // AskUserQuestion and ExitPlanMode wait on the person: the session is waiting, as at the end of a turn
  for (const name of WAITS_ON_USER) {
    fold(st, said(`ask-${name}`, '2026-10-24T10:01:00Z', [call(`q-${name}`, name)]));
    assert.deepEqual([st.open, running()], [[], false], name);
  }
  assert.deepEqual([...WAITS_ON_USER], ['AskUserQuestion', 'ExitPlanMode']);
  fold(st, said('both', '2026-10-24T10:02:00Z', [call('b1', 'AskUserQuestion'), call('b2', 'Bash')]));
  assert.deepEqual(st.open, ['b2'], 'with a running call beside it, that call counts');
  // a new message closes the last one's calls (the API takes it only once each has its result, even one not written)
  fold(st, said('next', '2026-10-24T10:03:00Z', [{ type: 'text', text: 'done' }]));
  assert.deepEqual([st.open, st.openMsg, running()], [[], 'next', false]);
  // a message without an id is a message of its own each row
  fold(st, said('', '2026-10-24T10:04:00Z', [call('n1')], { message: { content: [call('n1')] } }));
  assert.deepEqual([st.open, st.openMsg], [['n1'], null]);
  fold(st, said('', '2026-10-24T10:04:01Z', [], { message: { content: [call('n2')] } }));
  assert.deepEqual(st.open, ['n2']);
  fold(st, said('', '2026-10-24T10:04:02Z', [], { message: { content: 'text, not blocks' } }));
  assert.deepEqual(st.open, []);
  // an interrupted call left without its result: the next typed prompt ends the turn
  fold(st, said('m6', '2026-10-24T10:05:00Z', [call('i1')]));
  fold(st, prompt('never mind', { timestamp: '2026-10-24T10:09:00Z' }));
  assert.deepEqual([st.open, st.openMsg, running(), st.turns], [[], null, false, 2]);
  // a prompt sent mid-turn does not: the call it came during still runs
  fold(st, said('m7', '2026-10-24T10:10:00Z', [call('i2')]));
  fold(st, queued('and then', { timestamp: '2026-10-24T10:10:30Z' }));
  assert.deepEqual([st.open, running(), st.turns], [['i2'], true, 3]);
  // slash commands and interrupts are user rows but not prompts: they close nothing
  fold(st, user('[Request interrupted by user]', { timestamp: '2026-10-24T10:11:00Z' }));
  assert.deepEqual(st.open, ['i2']);
  // turn_duration, which Claude Code writes when a turn ends, closes the rest; a sidechain's does not
  fold(st, turnOver({ isSidechain: true }));
  assert.deepEqual(st.open, ['i2']);
  fold(st, turnOver());
  assert.deepEqual([st.open, st.openMsg, running()], [[], null, false]);
  // malformed blocks are skipped
  fold(st, said('m8', '2026-10-24T10:12:00Z', [null, 'x', { type: 'tool_use', name: 'Bash' }, { type: 'tool_use', id: 7 }, { type: 'tool_use', id: 'ok1' }]));
  assert.deepEqual(st.open, ['ok1'], 'a call without a name still runs');
  // at most 64, the newest
  fold(st, said('many', '2026-10-24T10:13:00Z', Array.from({ length: 70 }, (_, i) => call(`c${i}`))));
  assert.equal(st.open!.length, 64);
  assert.deepEqual([st.open![0], st.open![63]], ['c6', 'c69']);
  // a state written before has neither field: nothing open, then it folds as any other
  const old: TxState = { ...fresh(), turns: 3 };
  delete old.open;
  delete old.openMsg;
  assert.equal(summarize(old).running, false);
  fold(old, answer(['zz'], '2026-10-24T10:14:00Z'));
  assert.equal(old.open, undefined, 'a result with nothing open leaves the field as it was');
  fold(old, said('m9', '2026-10-24T10:15:00Z', [call('o1')]));
  assert.deepEqual([old.open, summarize(old).running], [['o1'], true]);
});

test('open tool calls through the disk: the saved state keeps them across renders; the worker folds them as the render does', () => {
  const dir = tmp();
  try {
    const file = join(dir, 't.jsonl');
    writeFileSync(file, [prompt('build', { timestamp: '2026-10-24T10:00:00Z' }), said('m1', '2026-10-24T10:00:05Z', [call('t1')])].join('\n') + '\n');
    const a = readTranscript(file, 'sess', dir, true);
    assert.deepEqual([a?.running, a?.lastAt], [true, Math.floor(Date.parse('2026-10-24T10:00:05Z') / 1000)]);
    const saved = JSON.parse(readFileSync(txStatePath(dir, 'sess'), 'utf8')) as TxState;
    assert.deepEqual([saved.open, saved.openMsg], [['t1'], 'm1']);
    assert.deepEqual(readTranscript(file, 'sess', dir, true), a, 'nothing new: the saved summary, still running');
    appendFileSync(file, answer(['t1'], '2026-10-24T10:09:00Z') + '\n');
    const b = readTranscript(file, 'sess', dir, true);
    assert.deepEqual([b?.running, b?.lastAt], [false, Math.floor(Date.parse('2026-10-24T10:09:00Z') / 1000)]);
    rmSync(txStatePath(dir, 'sess'));
    assert.deepEqual(refreshTranscript(file, 'sess', dir), b, 'the worker\'s fold equals the render\'s');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a v1 state file is rescanned once, then kept as v2', () => {
  const dir = tmp();
  try {
    const file = join(dir, 't.jsonl');
    const lines = session(20);
    writeFileSync(file, lines.join('\n') + '\n');
    const size = statSync(file).size;
    const v1 = { ...freshTx(file), v: 1, offset: size, size, sumRead: 1, turns: undefined, compactions: undefined, sawOrigin: undefined };
    const statePath = txStatePath(dir, 's');
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(statePath, JSON.stringify(v1));
    const r = readTranscript(file, 's', dir, true);
    assert.deepEqual(r, scan(lines));
    const saved = JSON.parse(readFileSync(statePath, 'utf8')) as TxState;
    assert.deepEqual([saved.v, saved.offset, saved.turns], [2, size, 1 + 20 + 2]);
    assert.deepEqual(readTranscript(file, 's', dir, true), r, 'the v2 file is used as it is');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- The 4 MiB budget and the worker ----

/** Rows of about 6.6 MiB: prompts, replies, tool results and compactions. */
const BIG = session(3000, 1900);
const bigBytes = (): Buffer => Buffer.from(BIG.join('\n') + '\n');

test('a delta over the budget keeps the saved summary; the worker folds the rest', () => {
  const dir = tmp();
  try {
    const file = join(dir, 't.jsonl');
    const head = session(5);
    writeFileSync(file, head.join('\n') + '\n');
    const before = readTranscript(file, 's', dir, true)!;
    assert.deepEqual([before.turns, before.needsWorker], [6, false]);
    const statePath = txStatePath(dir, 's');
    const savedText = readFileSync(statePath, 'utf8');
    const big = bigBytes();
    assert.ok(big.length > 6 * 1024 * 1024 && big.length > TX_BUDGET);
    appendFileSync(file, big);

    const over = readTranscript(file, 's', dir, true)!;
    assert.deepEqual(over, { ...before, needsWorker: true }, 'the saved summary, unchanged');
    assert.equal(readFileSync(statePath, 'utf8'), savedText, 'the render writes nothing over the budget');

    const caught = refreshTranscript(file, 's', dir)!;
    const expected = scan([...head, ...BIG]);
    assert.deepEqual(caught, expected);
    assert.ok(!existsSync(txLockPath(dir, 's')), 'the worker removes its lock');
    const saved = JSON.parse(readFileSync(statePath, 'utf8')) as TxState;
    assert.equal(saved.offset, statSync(file).size);
    assert.deepEqual(readTranscript(file, 's', dir, true), expected, 'the next render shows the full counts');
    assert.deepEqual([expected.turns, expected.compactions], [6 + 3000 + 231, 176], 'BIG opens with a no-origin row, too late to count');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a fresh state over the budget gives zero counts; exactly the budget is read in the render', () => {
  const dir = tmp();
  try {
    const file = join(dir, 't.jsonl');
    writeFileSync(file, bigBytes());
    assert.deepEqual(readTranscript(file, 's', dir, true), { ...summarize(freshTx(file)), needsWorker: true });
    assert.ok(!existsSync(txStatePath(dir, 's')));
    const line = prompt('p'.repeat(1000)) + '\n';
    const exact = Buffer.alloc(TX_BUDGET);
    for (let o = 0; o + line.length <= exact.length; o += line.length) exact.write(line, o);
    const rest = TX_BUDGET % line.length;
    if (rest > 0) exact.fill(' ', TX_BUDGET - rest, TX_BUDGET - 1);
    exact.write('\n', TX_BUDGET - 1);
    const file2 = join(dir, 'u.jsonl');
    writeFileSync(file2, exact);
    const r = readTranscript(file2, 'u', dir, true);
    assert.deepEqual([r?.needsWorker, r?.turns], [false, Math.floor(TX_BUDGET / line.length)]);
    appendFileSync(file2, prompt('one more') + '\n');
    assert.equal(readTranscript(file2, 'u', dir, true)?.turns, Math.floor(TX_BUDGET / line.length) + 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the worker: a line longer than its chunk, a partial last line, a held lock and an unsafe id', () => {
  const dir = tmp();
  try {
    const file = join(dir, 't.jsonl');
    const huge = prompt('h'.repeat(9 * 1024 * 1024));
    const lines = [prompt('a'), huge, boundary(), prompt('b')];
    writeFileSync(file, lines.join('\n') + '\n' + prompt('half').slice(0, 20));
    assert.deepEqual(refreshTranscript(file, 'w', dir), scan(lines));
    const saved = JSON.parse(readFileSync(txStatePath(dir, 'w'), 'utf8')) as TxState;
    assert.equal(saved.offset, statSync(file).size - 20, 'the partial line waits');
    assert.deepEqual(refreshTranscript(file, 'w', dir), scan(lines), 'nothing new: the same summary');

    closeSync(openSync(txLockPath(dir, 'w'), 'w'));
    assert.equal(refreshTranscript(file, 'w', dir), null, 'a live lock: another worker is on it');
    const old = new Date(Date.now() - 60_000);
    utimesSync(txLockPath(dir, 'w'), old, old);
    assert.notEqual(refreshTranscript(file, 'w', dir), null, 'a stale lock is taken over');

    assert.equal(refreshTranscript(file, '../escape', dir), null);
    assert.equal(refreshTranscript(join(dir, 'missing.jsonl'), 'm', dir), null);
    assert.ok(!existsSync(txLockPath(dir, 'm')));
    assert.deepEqual(readdirSync(join(dir, 'transcript')).sort(), ['w.json']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('diskSources: counts() and transcript() share one read; over the budget the worker is queued unless its lock is live', () => {
  const dir = tmp();
  try {
    const file = join(dir, 't.jsonl');
    const env = { HUNGERBAR_CACHE_DIR: dir };
    const cfg = defaults();
    const payload = { session_id: 'abc', transcript_path: file };
    assert.deepEqual(diskSources({}, env, cfg, 0, []).counts(), { turns: 0, compactions: 0 }, 'no transcript: zeros');

    writeFileSync(file, session(5).join('\n') + '\n');
    let spawns: string[][] = [];
    const small = diskSources(payload, env, cfg, 0, spawns);
    assert.deepEqual(small.counts(), { turns: 6, compactions: 0 });
    assert.equal(small.transcript(), small.transcript());
    assert.deepEqual(spawns, []);

    appendFileSync(file, bigBytes());
    spawns = [];
    const big = diskSources(payload, env, cfg, 0, spawns);
    assert.deepEqual(big.counts(), { turns: 6, compactions: 0 }, 'the saved counts');
    assert.equal(big.transcript()?.needsWorker, true);
    big.counts();
    assert.deepEqual(spawns, [['refresh', 'transcript', file, 'abc']], 'queued once');

    closeSync(openSync(txLockPath(dir, 'abc'), 'w'));
    spawns = [];
    diskSources(payload, env, cfg, 0, spawns).counts();
    assert.deepEqual(spawns, [], 'the worker already runs');

    spawns = [];
    const odd = { session_id: 'not a safe id', transcript_path: file };
    diskSources(odd, env, cfg, 0, spawns).transcript();
    assert.deepEqual(spawns, [['refresh', 'transcript', file, txId(file, null)]], 'the id is fnv1a of the path');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** The detached worker runs with the cache dir as its cwd, which Windows will not delete until it exits. */
async function removeWhenFree(dir: string): Promise<void> {
  for (let i = 0; ; i++) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch (e) {
      if (i >= 300) throw e;
      await sleep(100);
    }
  }
}

test('dist: an over-budget render spawns the detached worker, which catches up; the next render has it all', async () => {
  const dir = tmp();
  const cache = join(dir, 'cache'), claude = join(dir, 'claude');
  mkdirSync(claude, { recursive: true });
  const file = join(dir, 't.jsonl');
  const id = 'worker-e2e';
  try {
    writeFileSync(file, bigBytes());
    const size = statSync(file).size;
    // No model and no context window on stdin, so classic falls back on the transcript (the HUD is not wired yet).
    const stdin = JSON.stringify({ session_id: id, transcript_path: file, cwd: dir, workspace: { current_dir: dir } });
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? 'C:\\Windows', TEMP: tmpdir(), TMP: tmpdir(),
      HUNGERBAR_CACHE_DIR: cache, CLAUDE_CONFIG_DIR: claude, GIT_CEILING_DIRECTORIES: dirname(dir), NO_COLOR: '1',
    };
    const t0 = performance.now();
    const first = spawnSync(process.execPath, [DIST], { input: stdin, env, encoding: 'utf8', windowsHide: true, timeout: 15000 });
    assert.equal(first.status, 0, first.stderr);
    const plain = (t: string): string => t.replace(/ /g, ' ');
    assert.match(plain(first.stdout), /^Model: Claude │/, 'over the budget: nothing from the transcript yet');

    const statePath = txStatePath(cache, id);
    const deadline = Date.now() + 120_000;
    const done = (): boolean => {
      try {
        return (JSON.parse(readFileSync(statePath, 'utf8')) as TxState).offset === size && !existsSync(txLockPath(cache, id)) && existsSync(join(cache, '.pruned'));
      } catch {
        return false;
      }
    };
    while (!done() && Date.now() < deadline) await sleep(50);
    const waited = performance.now() - t0;
    assert.ok(done(), 'the worker wrote the full state, removed its lock and pruned');
    process.stdout.write(`# worker caught up on ${(size / 1048576).toFixed(1)} MiB after ${waited.toFixed(0)} ms (noise on this machine)\n`);

    const saved = JSON.parse(readFileSync(statePath, 'utf8')) as TxState;
    const expected = scan(BIG);
    assert.deepEqual([saved.turns, saved.compactions], [expected.turns, expected.compactions]);
    const next = spawnSync(process.execPath, [DIST], { input: stdin, env: { ...env, HUNGERBAR_NO_SPAWN: '1' }, encoding: 'utf8', windowsHide: true, timeout: 15000 });
    assert.equal(next.status, 0, next.stderr);
    assert.match(plain(next.stdout), /^Model: opus-5-5 │/, 'the next render has the transcript model');
    const src = diskSources(JSON.parse(stdin) as Payload, { HUNGERBAR_CACHE_DIR: cache }, defaults(), 0, []);
    assert.deepEqual(src.counts(), { turns: expected.turns, compactions: expected.compactions });
    assert.deepEqual(src.transcript(), expected);
  } finally {
    await removeWhenFree(dir);
  }
});

// ---- Prune (SPEC §10) ----

const H = 3_600_000, D = 24 * H;
const NOW_MS = Date.parse('2026-10-24T12:00:00Z');

/** Writes a file under dir whose mtime is ageMs before NOW_MS. */
function aged(dir: string, rel: string, ageMs: number): string {
  const p = join(dir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, '{}');
  const t = (NOW_MS - ageMs) / 1000;
  utimesSync(p, t, t);
  return rel;
}

test('pruneOld: hud/ and transcript/ files untouched for 7 days, and .tmp files an hour old', () => {
  const dir = tmp();
  try {
    const gone = [
      aged(dir, 'hud/s1.aaaa1111.json', 8 * D), aged(dir, 'transcript/old.json', 8 * D), aged(dir, 'transcript/old.lock', 30 * D),
      aged(dir, 'transcript/new.json.12.ab.tmp', 2 * H), aged(dir, 'git/k.json.3.cd.tmp', 2 * H),
      aged(dir, 'acct-0011aabb/usage.json.4.ef.tmp', 2 * H), aged(dir, 'gitbin.json.5.gh.tmp', 2 * H),
    ];
    const kept = [
      aged(dir, 'hud/s2.bbbb2222.json', 6 * D), aged(dir, 'transcript/live.json', H), aged(dir, 'git/k.json', 30 * D),
      aged(dir, 'git/fresh.tmp', 10 * 60_000), aged(dir, 'acct-0011aabb/limits.json', 30 * D),
      aged(dir, 'capture/old.json.6.ij.tmp', 30 * D), aged(dir, 'previous-statusline.json', 30 * D),
    ];
    assert.equal(pruneOld(dir, NOW_MS), gone.length);
    for (const f of gone) assert.ok(!existsSync(join(dir, f)), `${f} is pruned`);
    for (const f of kept) assert.ok(existsSync(join(dir, f)), `${f} is kept`);
    assert.equal(statSync(join(dir, '.pruned')).mtimeMs, NOW_MS, 'the stamp holds the time of the run');
    assert.equal(pruneOld(join(dir, 'missing'), NOW_MS), 0, 'no cache dir: nothing to do, nothing created');
    assert.ok(!existsSync(join(dir, 'missing')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pruneOld: at most once a day, a stamp from the future does not block, at most 200 files a run', () => {
  const dir = tmp();
  try {
    assert.equal(pruneOld(dir, NOW_MS), 0);
    aged(dir, 'hud/a.json', 8 * D);
    assert.equal(pruneOld(dir, NOW_MS + 23 * H), 0, 'within a day of the last run');
    assert.ok(existsSync(join(dir, 'hud/a.json')));
    assert.equal(pruneOld(dir, NOW_MS + 25 * H), 1);
    aged(dir, 'hud/b.json', 30 * D);
    assert.equal(pruneOld(dir, NOW_MS - D), 1, 'the clock went back: the stamp is in the future, so it runs');

    for (let i = 0; i < 250; i++) aged(dir, `transcript/t${i}.json`, 9 * D);
    assert.equal(pruneOld(dir, NOW_MS), 200);
    assert.equal(readdirSync(join(dir, 'transcript')).length, 50);
    assert.equal(pruneOld(dir, NOW_MS + D), 50, 'the rest go the next day');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('dist: the git and the transcript workers both prune', () => {
  const dir = tmp();
  try {
    for (const what of ['git', 'transcript']) {
      const cache = join(dir, what);
      const old = join(cache, 'hud', 'old.json');
      mkdirSync(dirname(old), { recursive: true });
      writeFileSync(old, '{}');
      const t = (Date.now() - 8 * D) / 1000;
      utimesSync(old, t, t);
      // Nothing to refresh (no repo, no transcript): the worker returns at once, then prunes; no git process starts.
      const args = what === 'git' ? ['refresh', 'git', join(dir, 'no-repo'), '/'] : ['refresh', 'transcript', join(dir, 'none.jsonl'), 'abc'];
      const env = { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? 'C:\\Windows', HUNGERBAR_CACHE_DIR: cache, GIT_CEILING_DIRECTORIES: dir };
      const r = spawnSync(process.execPath, [DIST, ...args], { env, encoding: 'utf8', windowsHide: true, timeout: 15000 });
      assert.equal(r.status, 0, r.stderr);
      assert.ok(existsSync(join(cache, '.pruned')), `${what}: stamped`);
      assert.ok(!existsSync(old), `${what}: the week-old hud file is gone`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
