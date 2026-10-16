// Test only: builds hud-spec.json, the frozen renders the vendored hud4.js must reproduce (test/hud.reference.test.ts).
//   node test/reference/extract-spec.mjs <round6-spec.json> <round7-spec.json> [out.json]
// The two spec files (about 800 KB each) stay in the design rounds' working folder, which is not published. Kept from them:
//   round6  the 25 inputs resolved to full states with their hists, and the hash of each git-terrain line 4 (renders
//           with book 'on' and pick-numeral, round6-spec renderFormat)
//   round7  the 19 situations resolved to full states, and the hash of each whole render for the 5 shipped fable ids
//           (fable-off, -tail, -tooltip, -boss, -beacon; fable-mount is not shipped)
//   hudPick
// Every render is checked against the spec first, span for span (JSON text, so key order and key presence too), and in
// both icon styles; only then is the spec's own render hashed. The hash is sha256 of JSON.stringify of the lines as
// [t, fg ?? null, bg ?? null, bold ?? null] tuples, the form the port is compared in. Any difference stops the run.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [r6Path, r7Path, outPath = path.join(HERE, 'hud-spec.json')] = process.argv.slice(2);
if (!r6Path || !r7Path) {
  console.error('usage: node test/reference/extract-spec.mjs <round6-spec.json> <round7-spec.json> [out.json]');
  process.exit(2);
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const ctx = {};
const HUD4 = vm.runInNewContext(readFileSync(path.join(HERE, 'hud4.js'), 'utf8') + ';HUD4', ctx);
if (Object.keys(ctx).length) throw new Error('hud4.js leaked globals: ' + Object.keys(ctx));
const MIX = HUD4.concepts.find((c) => c.key === 'mix');
const STATES = JSON.parse(readFileSync(path.join(HERE, 'hud4-states.json'), 'utf8'));
const SESSION = vm.runInNewContext(readFileSync(path.join(HERE, 'hud4-session.js'), 'utf8') + ';SESSION', {});
const r6Bytes = readFileSync(r6Path), r7Bytes = readFileSync(r7Path);
const r6 = JSON.parse(r6Bytes.toString('utf8')), r7 = JSON.parse(r7Bytes.toString('utf8'));

const SHIPPED = ['fable-off', 'fable-tail', 'fable-tooltip', 'fable-boss', 'fable-beacon'];
const HUD_PICK = { git: 'git-terrain', pick: 'pick-numeral', book: 'on', style: 'colour' };
const tuples = (lines) => lines.map((l) => l.map((s) => [s.t, s.fg ?? null, s.bg ?? null, s.bold ?? null]));
const hash = (lines) => sha(JSON.stringify(tuples(lines)));
const clone = (v) => JSON.parse(JSON.stringify(v));
let checked = 0;
function same(got, want, what) {
  if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`${what}: the vendored hud4.js differs from the spec`);
  checked++;
}
const render = (state, fable, style = 'colour') => MIX.render(clone(state), { ...HUD_PICK, style, fable });

if (JSON.stringify(r7.hudPick) !== JSON.stringify(HUD_PICK)) throw new Error('round7 hudPick changed: ' + JSON.stringify(r7.hudPick));

// ---------- round 6: git-terrain, line 4 ----------
const terrain = r6.git.find((g) => g.id === 'git-terrain');
if (!terrain) throw new Error('round6: no git-terrain');
const inputs = {};
for (const [key, inp] of Object.entries(r6.inputs)) {
  let from, base;
  if (typeof inp.situation === 'string') {
    from = `hud4-states.json ${inp.situation}`;
    base = STATES[inp.situation];
  } else if (Number.isInteger(inp.frame)) {
    // the frame as round 6 saw it: scoped was added to session4.js in round 7 (and draws only with a fable option)
    from = `hud4-session.js frames[${inp.frame}] without scoped`;
    const { scoped: _scoped, hist: _hist, ...rest } = SESSION.frames[inp.frame];
    base = rest;
  }
  if (!base || typeof base !== 'object') throw new Error(`round6 ${key}: input not found`);
  const state = { ...clone(base), hist: clone(inp.hist) };
  const want = terrain.renders[key];
  if (!want) throw new Error(`round6 ${key}: no render`);
  const lines = render(state, 'fable-off');
  if (lines.length !== 4) throw new Error(`round6 ${key}: ${lines.length} lines`);
  same(lines[3], want, `round6 ${key} line 4`);
  same(render(state, 'fable-off', 'plain')[3], want, `round6 ${key} line 4, plain`);
  inputs[key] = { from, about: inp.about, state, sha256: hash([want]) };
}
if (Object.keys(inputs).length !== 25) throw new Error('round6: expected 25 inputs, got ' + Object.keys(inputs).length);

// ---------- round 7: the 19 situations x the 5 shipped fable ids, whole renders ----------
const situations = {};
for (const [key, sit] of Object.entries(r7.situations)) {
  let from, state;
  if (sit.state && typeof sit.state === 'object') {
    from = 'round7-spec.json';
    state = clone(sit.state);
  } else {
    const m = /^round4\/session4\.js frames\[(\d+)\] \(with its hist and scoped\)$/.exec(String(sit.state));
    if (!m) throw new Error(`round7 ${key}: unknown state ${JSON.stringify(sit.state)}`);
    from = `hud4-session.js frames[${m[1]}]`;
    state = clone(SESSION.frames[+m[1]]);
  }
  const sha256 = {};
  for (const id of SHIPPED) {
    const opt = r7.fable.find((f) => f.id === id);
    const want = opt && opt.renders[key];
    if (!want) throw new Error(`round7 ${id} ${key}: no render`);
    same(render(state, id), want, `round7 ${id} ${key}`);
    same(render(state, id, 'plain'), want, `round7 ${id} ${key}, plain`);
    sha256[id] = hash(want);
  }
  situations[key] = { from, about: sit.about, state, sha256 };
}
if (Object.keys(situations).length !== 19) throw new Error('round7: expected 19 situations, got ' + Object.keys(situations).length);

const spec = {
  about: 'Frozen renders of the HUD design rounds 6 and 7 for the vendored hud4.js (test/hud.reference.test.ts). Built by '
    + 'extract-spec.mjs, which checked every render against the spec files (span for span, both icon styles) before hashing it.',
  hash: 'sha256 of JSON.stringify(lines.map((l) => l.map((s) => [s.t, s.fg ?? null, s.bg ?? null, s.bold ?? null])))',
  sources: {
    round6: { file: 'round6/round6-spec.json', sha256: sha(r6Bytes) },
    round7: { file: 'round7/round7-spec.json', sha256: sha(r7Bytes) },
  },
  hudPick: HUD_PICK,
  round6: {
    option: 'git-terrain',
    renders: 'line 4 only: MIX.render(state, { ...hudPick, fable: "fable-off" })[3] (lines 1-3 are Day & Night\'s own)',
    inputs,
  },
  round7: {
    ids: SHIPPED,
    renders: 'every line: MIX.render(state, { ...hudPick, fable: id }) (5 lines for fable-boss while the model in use has a scoped limit)',
    situations,
  },
};

// Compact JSON: one key per line down to each input, every state on one line.
function pretty(v, ind = '', depth = 0) {
  if (v === null || typeof v !== 'object' || depth >= 4 || (Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object'))) return JSON.stringify(v);
  const pad = ind + '  ';
  if (Array.isArray(v)) return '[\n' + v.map((x) => pad + pretty(x, pad, depth + 1)).join(',\n') + '\n' + ind + ']';
  return '{\n' + Object.entries(v).map(([k, x]) => pad + JSON.stringify(k) + ': ' + (k === 'state' ? JSON.stringify(x) : pretty(x, pad, depth + 1))).join(',\n') + '\n' + ind + '}';
}
const text = pretty(spec) + '\n';
if (JSON.stringify(JSON.parse(text)) !== JSON.stringify(spec)) throw new Error('pretty printer lost something');
writeFileSync(outPath, text);
console.log(`${checked} renders checked against the spec, 0 differences; ${Object.keys(inputs).length} round-6 hashes, `
  + `${Object.keys(situations).length * SHIPPED.length} round-7 hashes -> ${outPath} (${Buffer.byteLength(text)} bytes, sha256 ${sha(text)})`);
