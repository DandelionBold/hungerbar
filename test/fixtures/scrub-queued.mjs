// Makes the queued-prompt transcript fixture: rows [from, to] (1-based) of a real session, keeping only the shapes the
// reader looks at (queued_command attachments, queue-operation rows, prompts, tool results, replies). Prompt text, ids, paths and tool data are replaced; noise rows (api-request*, titles, snapshots) are dropped.
// usage: node test/fixtures/scrub-queued.mjs <session.jsonl> <from> <to> <out.jsonl> <text1> <text2> ...
// queued-scrubbed.jsonl is rows 2858-2896 of a real 2.1.308 session (one typed prompt, then two sent mid-turn), with
// the texts "make a Minecraft hotbar" "show me the ideas" "and keep my current icon style".
import { readFileSync, writeFileSync } from 'node:fs';

const [src, from, to, out, ...texts] = process.argv.slice(2);
const lines = readFileSync(src, 'utf8').split('\n').slice(Number(from) - 1, Number(to));
const ids = new Map();
const uid = (u) => {
  if (typeof u !== 'string') return u;
  if (!ids.has(u)) ids.set(u, `00000000-0000-4000-8000-${String(ids.size + 1).padStart(12, '0')}`);
  return ids.get(u);
};
const msgIds = new Map(), toolIds = new Map();
const msgId = (m) => { if (!msgIds.has(m)) msgIds.set(m, `msg_q${String(msgIds.size + 1).padStart(3, '0')}`); return msgIds.get(m); };
const toolId = (t) => { if (!toolIds.has(t)) toolIds.set(t, `toolu_q${String(toolIds.size + 1).padStart(3, '0')}`); return toolIds.get(t); };
const SESSION = '00000000-0000-4000-8000-0000000000ff';
const prompts = new Map(); // real text -> scrubbed text, in order of first appearance
const scrubText = (t) => {
  if (!prompts.has(t)) {
    const s = texts[prompts.size];
    if (s === undefined) throw new Error('not enough replacement texts');
    prompts.set(t, s);
  }
  return prompts.get(t);
};
const common = (r) => ({ userType: r.userType, entrypoint: r.entrypoint, cwd: 'D:\x5cwork\x5capp', sessionId: SESSION, version: r.version, gitBranch: 'main' });
const NOISE = new Set(['api-request', 'api-request-blob', 'last-prompt', 'custom-title', 'agent-name', 'atis-latch', 'file-history-snapshot']);
const rows = [];
for (const line of lines) {
  const r = JSON.parse(line);
  if (NOISE.has(r.type)) continue;
  if (r.type === 'queue-operation') {
    const o = { type: r.type, operation: r.operation, timestamp: r.timestamp, sessionId: SESSION };
    if (r.content !== undefined) o.content = scrubText(r.content);
    if (r.reason !== undefined) o.reason = r.reason;
    if (r.commandUuid !== undefined) o.commandUuid = uid(r.commandUuid);
    if (r.deliveryId !== undefined) o.deliveryId = uid(r.deliveryId);
    rows.push(o);
  } else if (r.type === 'attachment' && r.attachment?.type === 'queued_command') {
    const a = r.attachment;
    const real = a.prompt;
    const p = scrubText(real);
    rows.push({
      parentUuid: uid(r.parentUuid), isSidechain: r.isSidechain,
      attachment: { type: a.type, prompt: p, source_uuid: uid(a.source_uuid), delivery_id: uid(a.delivery_id), commandMode: a.commandMode, origin: a.origin, timestamp: a.timestamp, humanTurn: a.humanTurn },
      type: r.type, uuid: uid(r.uuid), timestamp: r.timestamp,
      rendered: r.rendered.map((x) => ({ content: x.content.split(real).join(p) })), renderedRole: r.renderedRole, ...common(r),
    });
  } else if (r.type === 'attachment') {
    rows.push({ parentUuid: uid(r.parentUuid), isSidechain: r.isSidechain, attachment: { type: r.attachment.type }, type: r.type, uuid: uid(r.uuid), timestamp: r.timestamp, ...common(r) });
  } else if (r.type === 'assistant') {
    const m = r.message, u = m.usage ?? {};
    const content = m.content.map((b) => b.type === 'tool_use' ? { type: 'tool_use', id: toolId(b.id), name: b.name, input: {} } : b.type === 'thinking' ? { type: 'thinking', thinking: '', signature: '' } : { type: b.type, text: 'reply' });
    rows.push({
      parentUuid: uid(r.parentUuid), isSidechain: r.isSidechain,
      message: { id: msgId(m.id), type: 'message', role: 'assistant', model: m.model, content, usage: {
        input_tokens: u.input_tokens ?? 0, cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0, cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
        ...(u.cache_creation ? { cache_creation: { ephemeral_5m_input_tokens: u.cache_creation.ephemeral_5m_input_tokens ?? 0, ephemeral_1h_input_tokens: u.cache_creation.ephemeral_1h_input_tokens ?? 0 } } : {}),
        output_tokens: u.output_tokens ?? 0 } },
      type: r.type, uuid: uid(r.uuid), timestamp: r.timestamp, effort: r.effort, perTurnEffort: r.perTurnEffort, ...common(r),
    });
  } else if (r.type === 'user') {
    const c = r.message.content;
    const base = { parentUuid: uid(r.parentUuid), isSidechain: r.isSidechain, promptId: uid(r.promptId), type: r.type };
    if (Array.isArray(c) && c.some((b) => b.type === 'tool_result')) {
      rows.push({ ...base, message: { role: 'user', content: c.map((b) => ({ tool_use_id: toolId(b.tool_use_id), type: 'tool_result', content: 'ok' })) },
        uuid: uid(r.uuid), timestamp: r.timestamp, toolUseResult: { stdout: 'ok', stderr: '', interrupted: false }, sourceToolAssistantUUID: uid(r.sourceToolAssistantUUID), ...common(r) });
    } else {
      if (typeof c !== 'string') throw new Error('a prompt row with blocks: extend the scrubber');
      rows.push({ ...base, message: { role: 'user', content: scrubText(c) }, uuid: uid(r.uuid), timestamp: r.timestamp, permissionMode: r.permissionMode,
        origin: r.origin, promptSource: r.promptSource, turnOrigin: r.turnOrigin, turnPosition: r.turnPosition, ...common(r) });
    }
  } else if (r.type === 'system') {
    rows.push({ parentUuid: uid(r.parentUuid), isSidechain: r.isSidechain, type: r.type, subtype: r.subtype, level: r.level, timestamp: r.timestamp, uuid: uid(r.uuid), ...common(r) });
  } else throw new Error('unhandled row type ' + r.type);
}
writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log(`${rows.length} rows from ${lines.length}, ${prompts.size} prompts, ${ids.size} uuids → ${out}`);
