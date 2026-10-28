// Layer 1 of the HUD port's proof (plan §4): the oracle is pinned. The vendored files have the sha256 SOURCES.json
// records (byte copies of their origin, or renamed copies), and the vendored engine reproduces the 120 frozen renders of design rounds 6 and 7 (hud-spec.json,
// each checked against the spec files by extract-spec.mjs before it was hashed). The port is compared with this engine,
// so nothing here depends on src/.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  FABLE_IDS, HUD4_CODE, HUD_PICK, MARK, MIX, PORT, PORT_NAMES, REF, SESSION, SOURCES, SPEC, STATES,
  isolate, picked, loadCache, loadHud4, mixOf, plain, renderHash, sha256, withPort, type RefState,
} from './hud/ref.ts';

const r6 = Object.entries(SPEC.round6.inputs);
const r7 = Object.entries(SPEC.round7.situations);
/** Every state the spec holds: the 25 round-6 inputs and the 19 round-7 situations. */
const ALL: Array<[string, RefState]> = [...r6.map(([k, v]) => [`r6 ${k}`, v.state] as [string, RefState]),
  ...r7.map(([k, v]) => [`r7 ${k}`, v.state] as [string, RefState])];
const json = (v: unknown): string => JSON.stringify(v);

test('every vendored file has the sha256 SOURCES.json pins, and copies equal their origin', () => {
  // the engine's files, and the rows of each round-8 design picked (test/reference/round8/, 0.7.0)
  const vendored = [...readdirSync(REF).filter((f) => /^(hud|extract-spec)/.test(f)), ...readdirSync(join(REF, 'round8')).map((f) => `round8/${f}`)].sort();
  assert.deepEqual(Object.keys(SOURCES.files).sort(), vendored, 'SOURCES.json lists every vendored file');
  for (const [file, e] of Object.entries(SOURCES.files)) {
    assert.equal(sha256(readFileSync(join(REF, file))), e.sha256, `${file} sha256`);
    if (e.kind === 'copy') assert.equal(e.sha256, e.originSha256, `${file} is a byte copy of ${String(e.origin)}`);
    // a renamed copy is its origin with the personal sample names replaced (SOURCES.json renamed), so it differs from it
    if (e.kind === 'renamed') assert.notEqual(e.sha256, e.originSha256, `${file} is not a byte copy of ${String(e.origin)}`);
  }
  assert.match(SOURCES.renamed, /same length/);
  const spec = SOURCES.files['hud-spec.json'];
  assert.deepEqual(spec?.originSha256, { [SPEC.sources.round6.file]: SPEC.sources.round6.sha256, [SPEC.sources.round7.file]: SPEC.sources.round7.sha256 });
});

test('hud4.js loads in an empty context: one return block, _port hands out every internal, no globals leak', () => {
  assert.equal(HUD4_CODE.split(MARK).length, 2, 'the return block occurs once');
  assert.throws(() => withPort(HUD4_CODE + MARK), /occurs 2 times/);
  assert.throws(() => withPort('const HUD4 = 1;'), /occurs 0 times/);
  assert.deepEqual(Object.keys(PORT), [...PORT_NAMES]);
  for (const name of PORT_NAMES) assert.notEqual(PORT[name], undefined, name);
  assert.throws(() => isolate('globalThis.leak = 1; 0', 'probe'), /probe leaked globals: leak/);
  assert.throws(() => isolate('var leak = 1; 0', 'probe'), /probe leaked globals: leak/);
  const untouched = loadHud4();
  assert.equal('_port' in untouched, false);
  assert.deepEqual(plain(untouched.concepts.map((c) => c.key)), ['survival', 'daynight', 'pocket', 'mix']);
  assert.equal(typeof untouched.cellWidth, 'function');
  assert.equal(typeof untouched.fromState, 'function');
});

test('_port changes nothing: both loads render every spec state alike for the 5 shipped fable ids', () => {
  const untouched = mixOf(loadHud4());
  for (const [what, state] of ALL) {
    for (const id of FABLE_IDS) assert.equal(json(MIX.render(state, picked(id))), json(untouched.render(state, picked(id))), `${what} ${id}`);
  }
});

test('the pick and the 5 shipped fable ids are options of the mix', () => {
  assert.deepEqual(SPEC.hudPick, HUD_PICK);
  assert.deepEqual(SPEC.round7.ids, [...FABLE_IDS]);
  const o = MIX.options;
  assert.ok(o, 'the mix has options');
  const has = (group: 'git' | 'pick' | 'book' | 'fable', id: string): void => assert.ok(o[group].some((x) => x.id === id), `${group} ${id}`);
  has('git', HUD_PICK.git);
  has('pick', HUD_PICK.pick);
  has('book', HUD_PICK.book);
  for (const id of FABLE_IDS) has('fable', id);
  for (const x of o.fable) assert.ok(typeof x.name === 'string' && x.name && typeof x.note === 'string' && x.note, x.id);
});

test('the vendored engine reproduces the 25 round-6 git-terrain renders (line 4)', () => {
  assert.equal(r6.length, 25);
  for (const [key, inp] of r6) {
    const lines = MIX.render(inp.state, picked('fable-off'));
    assert.equal(lines.length, 4, key);
    assert.equal(renderHash([lines[3]!]), inp.sha256, key);
  }
});

test('the vendored engine reproduces the 95 round-7 renders (19 situations x 5 fable ids)', () => {
  assert.equal(r7.length, 19);
  let n = 0;
  for (const [key, sit] of r7) {
    for (const id of FABLE_IDS) {
      const lines = MIX.render(sit.state, picked(id));
      assert.equal(renderHash(lines), sit.sha256[id], `${key} ${id}`);
      n++;
    }
  }
  assert.equal(n, 95);
  const boss = (key: string): number => MIX.render(SPEC.round7.situations[key]!.state, picked('fable-boss')).length;
  assert.equal(boss('fable-in-use'), 5, 'the boss line while Fable is in use');
  assert.equal(boss('fable-empty'), 4, 'no boss line on Opus');
});

test('the spec states are the vendored inputs: states.json with hists, session4 frames', () => {
  for (const [key, inp] of r6) {
    const m = /^hud4-states\.json (\w+)$/.exec(inp.from);
    const f = /^hud4-session\.js frames\[(\d+)\] without scoped$/.exec(inp.from);
    assert.ok(m || f, `${key}: ${inp.from}`);
    const { hist, ...rest } = inp.state;
    if (m) assert.deepEqual(rest, STATES[m[1] as keyof typeof STATES], key);
    if (f) {
      const { hist: own, scoped: _s, ...frame } = plain(SESSION.frames[+f[1]!]!);
      assert.deepEqual(rest, frame, key);
      assert.deepEqual(hist, own, `${key}: the frame's own hist (the cache walk's)`);
    }
  }
  for (const [key, sit] of r7) {
    const f = /^hud4-session\.js frames\[(\d+)\]$/.exec(sit.from);
    if (f) assert.deepEqual(sit.state, plain(SESSION.frames[+f[1]!]), key);
    else assert.equal(sit.from, 'round7-spec.json', key);
  }
});

test('the plain icon style gives the same spans as the colour style', () => {
  for (const [what, state] of ALL) {
    for (const id of FABLE_IDS) assert.equal(json(MIX.render(state, picked(id, 'plain'))), json(MIX.render(state, picked(id))), `${what} ${id}`);
  }
});

test('the vendored history cache walks session4: its own hists, and gold at frames 86, 259, 519 and 576', async () => {
  const C = await loadCache();
  const frames = C.framesWithHist();
  assert.equal(frames.length, 661);
  assert.equal(C.SESSION.STEP, 30);
  frames.forEach((f, i) => assert.deepEqual(plain(f.hist), plain(C.SESSION.frames[i]!.hist), `frame ${i}`));
  // the first frame whose current quarter hour turned gold, for each commit
  const gold: number[] = [];
  frames.forEach((f, i) => {
    const last = f.hist.buckets.at(-1), prev = frames[i - 1]?.hist.buckets.at(-1);
    if (last?.[4] && !(prev?.[4] && prev[0] === last[0])) gold.push(i);
  });
  assert.deepEqual(gold, [86, 259, 519, 576]);
  assert.deepEqual(plain(C.commitsOf().map((c) => Math.ceil(c.t / C.SESSION.STEP))), gold, 'one gold quarter per chat commit');
  assert.equal(C.isCommitSubject('commit (merge): x'), true, 'r6lib counts a merge commit (the port excludes it, plan §6)');
});
