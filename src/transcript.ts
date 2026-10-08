// Lazy, incremental transcript reader, used when a stdin field is missing (SPEC §5) and for the HUD's prompt and
// compaction counts (plan §7). A render reads at most TX_BUDGET new bytes; a bigger delta keeps the saved summary and
// asks for the detached `hungerbar refresh transcript` worker, which folds the rest under a lock.
import { closeSync, fstatSync, openSync, readSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { fnv1a, readJson, tryLock, unlock, writeJson } from './store.ts';

type Ttl = '5m' | '1h';

export interface TxUsage {
  input: number;
  create: number;
  read: number;
}

export interface TxState {
  v: 2;
  path: string;
  size: number;
  offset: number;
  sumRead: number;
  sumCreate: number;
  sumInput: number;
  recentIds: string[];
  lastTtl: Ttl | null;
  lastCached: { ts: number; ttl: Ttl } | null;
  /** Null after a compact boundary until the next main-chain reply. */
  lastUsage: TxUsage | null;
  lastModel: string | null;
  lastEffort: { level: string; model: string | null } | null;
  /** Prompts the person sent (the turn rule in countsAsTurn, plus queuedPrompt for those sent mid-turn). */
  turns: number;
  /** Main-chain compact boundaries. */
  compactions: number;
  /** A row with an `origin` has been seen: from then on a row without one is never a prompt. */
  sawOrigin: boolean;
  /**
   * The newest main-chain message's time, in seconds: a user row (a tool result too), an assistant reply or a prompt
   * sent mid-turn (the HUD's idle bed, 0.7.0). Absent in a state written before 0.7.0: unknown until the next message.
   */
  lastAt?: number | null;
  /**
   * The tool calls of the newest main-chain assistant message that have no result yet (their tool_use ids, at most
   * OPEN_MAX): while one is open, a tool is running and the turn goes on (the idle bed waits). A call to a tool that
   * waits on the person (WAITS_ON_USER) is never kept. Absent in a state written before: none open.
   */
  open?: string[];
  /** That message's id (null without one): a row of the same message adds its calls, any other starts over. */
  openMsg?: string | null;
}

export interface TxSummary {
  hitRatio: number | null;
  lastCached: { ts: number; ttl: Ttl } | null;
  lastUsage: TxUsage | null;
  lastModel: string | null;
  lastEffort: { level: string; model: string | null } | null;
  turns: number;
  compactions: number;
  /** The newest main-chain message's time in seconds (TxState.lastAt), null while unknown. */
  lastAt: number | null;
  /** A main-chain tool call has no result yet (TxState.open): Claude is still working, though no message comes. */
  running: boolean;
  /** The new bytes were over the render's budget: this is the saved summary, and the worker should fold the rest. */
  needsWorker: boolean;
}

/** The most new bytes one render folds (SPEC §17's +25 ms envelope); more is left to the worker. */
export const TX_BUDGET = 4 * 1024 * 1024;
/** The worker's lock counts as stale after this long; a live worker touches it after every chunk. */
export const TX_LOCK_STALE_MS = 30_000;
const CHUNK = 4 * 1024 * 1024;
const ID = /^[\w-]{1,80}$/;
/** The most open tool calls kept (the newest). */
const OPEN_MAX = 64;
/**
 * Tools that wait on the person, not on Claude: a call to one is the session waiting for an answer, as at the end of a
 * turn, so it never counts as running. A permission prompt cannot be told apart: Claude Code writes nothing while one
 * waits, so a call waiting on one reads as running.
 */
export const WAITS_ON_USER: ReadonlySet<string> = new Set(['AskUserQuestion', 'ExitPlanMode']);

export const freshTx = (path: string): TxState => ({
  v: 2, path, size: 0, offset: 0, sumRead: 0, sumCreate: 0, sumInput: 0, recentIds: [],
  lastTtl: null, lastCached: null, lastUsage: null, lastModel: null, lastEffort: null,
  turns: 0, compactions: 0, sawOrigin: false, lastAt: null, open: [], openMsg: null,
});

/** The state file's key: the session id when it is a safe file name, else fnv1a of the transcript path. */
export function txId(path: string, sessionId: string | null): string {
  return sessionId && ID.test(sessionId) ? sessionId : fnv1a(path);
}

export const txStatePath = (cacheDir: string, id: string): string => join(cacheDir, 'transcript', id + '.json');
export const txLockPath = (cacheDir: string, id: string): string => join(cacheDir, 'transcript', id + '.lock');

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

interface Block {
  type?: unknown;
  text?: unknown;
  /** A tool_use block's id and name; a tool_result block's tool_use_id. */
  id?: unknown;
  name?: unknown;
  tool_use_id?: unknown;
}

interface Row {
  type?: string;
  subtype?: string;
  isSidechain?: boolean;
  isApiErrorMessage?: boolean;
  isMeta?: boolean;
  isCompactSummary?: boolean;
  toolUseResult?: unknown;
  origin?: { kind?: unknown } | null;
  turnOrigin?: unknown;
  /** A `type:"attachment"` row's payload; a queued_command one carries a prompt delivered mid-turn. */
  attachment?: { type?: unknown; commandMode?: unknown; origin?: { kind?: unknown } | null; prompt?: unknown } | null;
  timestamp?: string;
  effort?: string;
  perTurnEffort?: string;
  message?: {
    id?: string;
    model?: string;
    content?: unknown;
    usage?: {
      input_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
    };
  };
}

/** Rows Claude Code writes itself into the user role: interrupts, slash commands and their output, ! commands, notices. */
const NOT_TYPED = ['[Request interrupted', '<command-', '<local-command-', '<bash-', '<task-notification', '<cross-session-message', '<scheduled-task'];

/**
 * Content that reads as typed: no tool_result block, and the first text (string content, or the first text block;
 * image-only content counts), with its start trimmed, does not open with one of Claude Code's own markers.
 */
function looksTyped(c: unknown): boolean {
  let text = '';
  if (typeof c === 'string') text = c;
  else if (Array.isArray(c)) {
    const blocks = c as Block[];
    if (blocks.some((b) => b !== null && typeof b === 'object' && b.type === 'tool_result')) return false;
    const t = blocks.find((b) => b !== null && typeof b === 'object' && b.type === 'text' && typeof b.text === 'string');
    if (t) text = t.text as string;
  }
  const head = text.trimStart();
  return !NOT_TYPED.some((m) => head.startsWith(m));
}

/**
 * A prompt the person sent (plan §7): a user row that is not a sidechain, meta or compact-summary row, carries no tool
 * result, reads as typed (looksTyped), and is either origin.kind "human", or has no origin in a transcript that has
 * shown none yet (legacy). A row with no origin whose turnOrigin names someone else (the "sdk" opening prompt of a
 * session another session started) was not typed either, as a cross-session message is not.
 */
function countsAsTurn(r: Row, legacy: boolean): boolean {
  if (r.isSidechain === true || r.isMeta === true || r.isCompactSummary === true || r.toolUseResult !== undefined) return false;
  if (!looksTyped(r.message?.content)) return false;
  const o = r.origin;
  if (o !== undefined && o !== null) return typeof o === 'object' && o.kind === 'human';
  return legacy && (r.turnOrigin === undefined || r.turnOrigin === 'human');
}

/**
 * A prompt the person typed while Claude was still working (plan §7). Claude Code delivers it mid-turn as a main-chain
 * `type:"attachment"` row whose attachment is a queued_command with commandMode "prompt" and origin.kind "human", and
 * never writes a user row for it. "peer" prompts and task notifications (their own commandMode) are not typed; the
 * prompt is a string or content blocks, read as looksTyped reads a user row's content. It never sets sawOrigin.
 */
function queuedPrompt(r: Row): boolean {
  const a = r.attachment;
  if (r.isSidechain === true || a === undefined || a === null || typeof a !== 'object') return false;
  if (a.type !== 'queued_command' || a.commandMode !== 'prompt') return false;
  const o = a.origin;
  return o !== undefined && o !== null && typeof o === 'object' && o.kind === 'human' && looksTyped(a.prompt);
}

/** A main-chain message was written at this time (a row's timestamp): lastAt keeps the newest. */
function seen(st: TxState, timestamp: unknown): void {
  const ts = typeof timestamp === 'string' ? Date.parse(timestamp) : NaN;
  if (Number.isFinite(ts)) st.lastAt = Math.max(st.lastAt ?? 0, Math.floor(ts / 1000));
}

/** The blocks of a message's content, objects only. */
const blocks = (c: unknown): Block[] => (Array.isArray(c) ? (c as unknown[]).filter((b): b is Block => b !== null && typeof b === 'object') : []);

/** These tool calls have their results: they are no longer open. */
function answered(st: TxState, ids: readonly string[]): void {
  const open = st.open ?? [];
  if (open.length && ids.length) st.open = open.filter((id) => !ids.includes(id));
}

/** The turn is over (a typed prompt, the turn_duration row): nothing is running, whatever results went missing. */
function settle(st: TxState): void {
  st.open = [];
  st.openMsg = null;
}

/**
 * A main-chain assistant row: a row of the open message adds its tool calls, any other message starts over with its
 * own (the API takes a new message only once every earlier call has its result). Calls to WAITS_ON_USER are not kept.
 */
function calls(st: TxState, id: unknown, content: unknown): void {
  const msg = typeof id === 'string' ? id : null;
  const open = msg !== null && msg === st.openMsg ? [...(st.open ?? [])] : [];
  for (const b of blocks(content)) {
    if (b.type !== 'tool_use' || typeof b.id !== 'string' || open.includes(b.id)) continue;
    if (typeof b.name === 'string' && WAITS_ON_USER.has(b.name)) continue;
    open.push(b.id);
  }
  st.open = open.slice(-OPEN_MAX);
  st.openMsg = msg;
}

const RESULT_ID = /"tool_use_id":"([^"\\]{1,200})"/g;
const FIRST_TS = /"timestamp":"([^"\\]{1,64})"/;
const FIRST_TYPE = /"type":"([^"\\]{1,40})"/;
const SIDECHAIN = /"isSidechain":(true|false)/;

/**
 * A tool result, read off the line without parsing it (a result can be megabytes): outside a JSON string these keys
 * occur only as keys, the first "type", "isSidechain" and "timestamp" are the row's own (Claude Code writes them before
 * the result's own fields: so in all 58,363 tool results of 300 local main and 300 subagent transcripts), and each
 * "tool_use_id" names a call it answers. A main-chain result is a message (lastAt) and closes its calls; a sidechain's
 * is neither.
 */
function result(st: TxState, line: string): void {
  if (SIDECHAIN.exec(line)?.[1] === 'true') return;
  if ((st.open ?? []).length) answered(st, Array.from(line.matchAll(RESULT_ID), (m) => m[1] as string));
  seen(st, FIRST_TS.exec(line)?.[1]);
}

/** Folds one JSONL line into the running state. Exported for the transcript tests. */
export function fold(st: TxState, line: string): void {
  // `"type":"user"` only occurs as a key outside a JSON string (inside one its quotes are escaped), and tool-result
  // rows always carry a "tool_use_id" key, so the user rows that remain are parsed and nothing typed is skipped. A
  // tool result (its first "type" is user) is read off the line instead (result), unless it names "assistant"
  // somewhere, when it is parsed below; another row with those keys (a progress row quoting a subagent's message) is
  // skipped, as before.
  // `"queued_command"` and `"turn_duration"` likewise only occur unescaped as values: the attachment rows of prompts
  // sent mid-turn, and the system row Claude Code writes when a turn ends.
  const tool = line.includes('"tool_use_id"');
  const user = line.includes('"type":"user"');
  if (user && tool && FIRST_TYPE.exec(line)?.[1] === 'user' && !line.includes('"assistant"')) return result(st, line);
  if (!(user && !tool) && !line.includes('"assistant"') && !line.includes('compact_boundary') && !line.includes('"queued_command"') && !line.includes('"turn_duration"')) return;
  let r: Row;
  try {
    r = JSON.parse(line) as Row;
  } catch {
    return;
  }
  if (r === null || typeof r !== 'object') return;
  const legacy = !st.sawOrigin;
  if (r.origin !== undefined && r.origin !== null) st.sawOrigin = true;
  if (r.type === 'system' && r.subtype === 'compact_boundary') {
    st.lastUsage = null;
    if (r.isSidechain !== true) st.compactions++;
    return;
  }
  if (r.type === 'system' && r.subtype === 'turn_duration') {
    if (r.isSidechain !== true) settle(st);
    return;
  }
  if (r.type === 'user') {
    if (r.isSidechain === true) return;
    if (countsAsTurn(r, legacy)) {
      st.turns++;
      settle(st);
    } else {
      answered(st, blocks(r.message?.content).flatMap((b) => (b.type === 'tool_result' && typeof b.tool_use_id === 'string' ? [b.tool_use_id] : [])));
    }
    seen(st, r.timestamp);
    return;
  }
  if (r.type === 'attachment') {
    if (queuedPrompt(r)) {
      st.turns++;
      seen(st, r.timestamp);
    }
    return;
  }
  if (r.type !== 'assistant' || r.isSidechain === true || r.isApiErrorMessage === true || !r.message) return;
  seen(st, r.timestamp);
  const m = r.message;
  calls(st, m.id, m.content);
  if (typeof m.model === 'string' && m.model !== '<synthetic>') st.lastModel = m.model;
  const effort = typeof r.effort === 'string' ? r.effort : typeof r.perTurnEffort === 'string' ? r.perTurnEffort : null;
  if (effort) st.lastEffort = { level: effort, model: typeof m.model === 'string' ? m.model : null };
  const u = m.usage;
  if (!u) return;
  const usage = { input: n(u.input_tokens), create: n(u.cache_creation_input_tokens), read: n(u.cache_read_input_tokens) };
  st.lastUsage = usage;
  if (typeof m.id === 'string') {
    if (st.recentIds.includes(m.id)) return;
    st.recentIds.push(m.id);
    if (st.recentIds.length > 64) st.recentIds.shift();
  }
  st.sumRead += usage.read;
  st.sumCreate += usage.create;
  st.sumInput += usage.input;
  const cc = u.cache_creation;
  if (n(cc?.ephemeral_5m_input_tokens) > 0) st.lastTtl = '5m';
  else if (n(cc?.ephemeral_1h_input_tokens) > 0) st.lastTtl = '1h';
  const ts = typeof r.timestamp === 'string' ? Date.parse(r.timestamp) : NaN;
  if (usage.read + usage.create > 0 && Number.isFinite(ts)) st.lastCached = { ts: Math.floor(ts / 1000), ttl: st.lastTtl ?? '5m' };
}

export function summarize(st: TxState): TxSummary {
  const total = st.sumRead + st.sumCreate + st.sumInput;
  return {
    hitRatio: total > 0 ? st.sumRead / total : null,
    lastCached: st.lastCached,
    lastUsage: st.lastUsage,
    lastModel: st.lastModel,
    lastEffort: st.lastEffort,
    turns: st.turns,
    compactions: st.compactions,
    lastAt: st.lastAt ?? null,
    running: (st.open ?? []).length > 0,
    needsWorker: false,
  };
}

/** The saved state when it is this transcript's v2 state and the file has not shrunk; else a fresh one (a v1 file is rescanned). */
function load(statePath: string, path: string, size: number): { st: TxState; saved: TxState | null } {
  const saved = readJson<TxState>(statePath);
  const ok = saved && saved.v === 2 && saved.path === path && saved.offset <= size;
  return ok ? { st: saved, saved } : { st: freshTx(path), saved: null };
}

/**
 * Folds the complete lines in [st.offset, size), reading at most `max` bytes, or more only while one line is longer
 * than that. Returns the bytes consumed: 0 when no complete line has been written yet (it is left for the next read).
 */
function advance(fd: number, st: TxState, size: number, max: number): number {
  let want = Math.min(max, size - st.offset);
  for (;;) {
    const buf = Buffer.alloc(want);
    let got = 0;
    while (got < want) {
      const k = readSync(fd, buf, got, want - got, st.offset + got);
      if (k <= 0) break;
      got += k;
    }
    const end = buf.lastIndexOf(10, got - 1);
    if (end >= 0) {
      for (const line of buf.toString('utf8', 0, end).split('\n')) fold(st, line);
      st.offset += end + 1;
      return end + 1;
    }
    if (got < want || st.offset + want >= size) return 0;
    want = Math.min(want * 2, size - st.offset);
  }
}

/**
 * Reads only the bytes added since the last render, cut at the last complete line. When more than TX_BUDGET bytes are
 * new, nothing is read: the saved summary comes back with needsWorker set (zero counts on a fresh state).
 */
export function readTranscript(path: string, sessionId: string | null, cacheDir: string, persist: boolean): TxSummary | null {
  const statePath = txStatePath(cacheDir, txId(path, sessionId));
  let fd: number;
  try {
    fd = openSync(path, 'r');
  } catch {
    return null;
  }
  try {
    const size = fstatSync(fd).size;
    const loaded = load(statePath, path, size);
    let st = loaded.st;
    if (size === st.offset) return summarize(st);
    if (size - st.offset > TX_BUDGET) return { ...summarize(st), needsWorker: true };
    if (st === loaded.saved) st = { ...st, recentIds: [...st.recentIds] };
    if (advance(fd, st, size, size - st.offset) === 0) return summarize(st);
    st.size = size;
    if (persist) {
      try { writeJson(statePath, st); } catch { /* the next render rescans */ }
    }
    return summarize(st);
  } finally {
    closeSync(fd);
  }
}

/**
 * `hungerbar refresh transcript <path> <id>`: folds everything the render left, in chunks, under transcript/<id>.lock,
 * and writes the state atomically. A render racing it writes a state that is just as consistent (its offset matches its
 * sums), so the worst case is work done twice. Returns null when the lock is held or the transcript cannot be read.
 */
export function refreshTranscript(path: string, id: string, cacheDir: string): TxSummary | null {
  if (!ID.test(id)) return null;
  const lock = txLockPath(cacheDir, id);
  if (!tryLock(lock, TX_LOCK_STALE_MS)) return null;
  try {
    let fd: number;
    try {
      fd = openSync(path, 'r');
    } catch {
      return null;
    }
    try {
      const statePath = txStatePath(cacheDir, id);
      const size = fstatSync(fd).size;
      const { st } = load(statePath, path, size);
      const start = st.offset;
      while (st.offset < size && advance(fd, st, size, CHUNK) > 0) {
        try { const t = new Date(); utimesSync(lock, t, t); } catch { /* the lock just ages */ }
      }
      if (st.offset !== start) {
        st.size = size;
        writeJson(statePath, st);
      }
      return summarize(st);
    } finally {
      closeSync(fd);
    }
  } finally {
    unlock(lock);
  }
}
