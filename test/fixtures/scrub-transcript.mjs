// Makes a transcript fixture from a real Claude Code session, keeping only the row shapes and usage numbers
// the reader looks at. No message content, paths, session ids or tool data survive.
// usage: node test/fixtures/scrub-transcript.mjs <session.jsonl> <out.jsonl>
import { readFileSync, writeFileSync } from 'node:fs';

const [src, out] = process.argv.slice(2);
if (!src || !out) throw new Error('usage: scrub-transcript.mjs <session.jsonl> <out.jsonl>');
const ids = new Map();
const rows = [];
for (const line of readFileSync(src, 'utf8').split('\n')) {
  let r;
  try { r = JSON.parse(line); } catch { continue; }
  if (r.type === 'system' && r.subtype === 'compact_boundary') rows.push({ type: 'system', subtype: 'compact_boundary', timestamp: r.timestamp });
  else if (r.type === 'assistant' && r.message) {
    const m = r.message, u = m.usage ?? {};
    if (!ids.has(m.id)) ids.set(m.id, `msg_${String(ids.size + 1).padStart(4, '0')}`);
    const row = { type: 'assistant', isSidechain: r.isSidechain === true, timestamp: r.timestamp, message: { id: ids.get(m.id), model: m.model, usage: {
      input_tokens: u.input_tokens ?? 0, cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0, cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
      ...(u.cache_creation ? { cache_creation: { ephemeral_5m_input_tokens: u.cache_creation.ephemeral_5m_input_tokens ?? 0, ephemeral_1h_input_tokens: u.cache_creation.ephemeral_1h_input_tokens ?? 0 } } : {}),
    } } };
    if (r.isApiErrorMessage) row.isApiErrorMessage = true;
    if (typeof r.effort === 'string') row.effort = r.effort;
    rows.push(row);
  } else if (r.type === 'user') rows.push({ type: 'user' });
}
writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log(`${rows.length} rows, ${ids.size} messages → ${out}`);
