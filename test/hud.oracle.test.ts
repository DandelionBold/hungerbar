// Layers 2 and 3 of the HUD port's proof (plan §4). Function level: src/hud/{wt,py,text,spans,input,mix,fable}.ts against
// the vendored engine (test/reference/hud4.js, with its internals handed out by test/hud/ref.ts), function by function:
// every code point, the cluster set, every sequence of cluster-class representatives, the design sweep's domains and
// seeded hostile fuzz (test/hud/fuzz.ts). Results are compared as values (Object.is for numbers, so -0 and NaN count; key
// order and key presence for objects), thrown errors included. A difference fails with the first string argument shrunk.
// Render level: renderHud(state, id) against MIX.render(state, the pick with fable-<id>) for each of the 5 shipped
// ids, span for span and as SGR bytes (the port's through the shipped writer, src/hud/look.ts encode; the oracle's through
// test/hud/sgr-oracle.ts), over the reference states x the round-6 hists, the round-6 and round-7 spec inputs, states
// that are no object, every session4 frame as it is and with Fable 5.1 in use, every domain value one at a time, every
// hist field one at a time, every scoped value under Fable's and other models, and seeded fuzz states; a difference
// fails with the state shrunk to the fields that cause it. Every non-ASCII code point a port render holds that
// its state does not (the engine's own glyphs, not user text) must be one of the glyphs probed for the HUD (the glyph
// census, which protects the plain icon style).
// HUD_ORACLE_N raises the number of generated inputs: per function 4000 at least (span lists get half as many), fuzz
// states for the renders 600 at least.
//
// Coverage exceptions (/* node:coverage ignore next */ in src/hud):
//   input.ts histBranch: `|| 'HEAD'` after tidy(v, true, -256) of a finite number, whose text is never blank.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { inspect } from 'node:util';
import * as fb from '../src/hud/fable.ts';
import * as inp from '../src/hud/input.ts';
import { encode } from '../src/hud/look.ts';
import * as mx from '../src/hud/mix.ts';
import * as py from '../src/hud/py.ts';
import * as sp from '../src/hud/spans.ts';
import * as tx from '../src/hud/text.ts';
import * as wt from '../src/hud/wt.ts';
import {
  BRANCH, CWD, DEL, EFFORT, HUGE, MODEL, NON_STATES, NON_TEXTS, NUMBERS, NUMERIC_STRINGS, SC_DOMAIN, SC_MODELS, TEXTS, chance, hist, histFields,
  int, msHists, mulberry32, number, oneFactor, pick, scoped, shrinkState, shrinkText, state, text, value, withField, type Rng, type State,
} from './hud/fuzz.ts';
import { HUD4_CODE, MIX, PORT, SESSION, SPEC, STATES, picked, plain, renderHash, tuples, type FableId as RefFableId, type MixOpts, type RefLines } from './hud/ref.ts';
import { sgrOracle } from './hud/sgr-oracle.ts';

/** The tables' state once every port module has loaded, before any test ran. */
const AT_LOAD = wt.decoded();
const N = Math.max(4000, Number(process.env.HUD_ORACLE_N) || 0);
const SRC = new URL('../src/hud/', import.meta.url);

// ---------------- comparing port and oracle ----------------
/** Deep equality across realms: Object.is for primitives, the same keys in the same order for objects and arrays. */
function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]));   // arrays: by index
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
  return ka.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
type Outcome = { v: unknown } | { err: string };
function run(f: () => unknown): Outcome {
  try { return { v: f() }; } catch (e) { return { err: `${(e as Error).name}: ${(e as Error).message}` }; }
}
const show = (v: unknown): string => inspect(v, { depth: 6, maxStringLength: 400, maxArrayLength: 40, breakLength: Infinity });
// The port functions are typed; parity is checked on any input, so they are called untyped here.
type Fn = (...args: any[]) => unknown;
/** Calls the port and the oracle with each argument list and fails on the first difference. Returns the count. */
function agree(name: string, port: Fn, ref: Fn, inputs: Iterable<readonly unknown[]>): number {
  const differs = (args: readonly unknown[]): boolean => !same(run(() => port(...args)), run(() => ref(...args)));
  let n = 0;
  for (const args of inputs) {
    n++;
    if (!differs(args)) continue;
    let small = args;
    const i = args.findIndex((a) => typeof a === 'string');
    if (i >= 0) small = args.with(i, shrinkText(args[i] as string, (t) => differs(args.with(i, t))));
    assert.fail(`${name}(${small.map(show).join(', ')}): port ${show(run(() => port(...small)))}, oracle ${show(run(() => ref(...small)))}`);
  }
  return n;
}
/** clusters() as a list of [cluster, width]. */
const listed = (clusters: (s: string, each: (g: string, w: number) => void) => void) => (s: string): Array<[string, number]> => {
  const out: Array<[string, number]> = [];
  clusters(s, (g, w) => out.push([g, w]));
  return out;
};
const portClusters = listed(wt.clusters), refClusters = listed(PORT.clusters);

/** Every regex literal in a function's source (strings, comments and division skipped). */
function regexLiterals(src: string): string[] {
  const out: string[] = [];
  let prev = '';
  for (let i = 0; i < src.length;) {
    const c = src[i]!;
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 2; continue; }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      i = j + 1; prev = 'string'; continue;
    }
    if (c === '/' && (prev === '' || /^[(,=:[!&|?{};+\-*%<>~^]$/.test(prev) || /^(?:return|typeof|of|in)$/.test(prev))) {
      let j = i + 1, inClass = false;
      for (; j < src.length; j++) {
        const d = src[j];
        if (d === '\\') j++;
        else if (inClass) inClass = d !== ']';
        else if (d === '[') inClass = true;
        else if (d === '/') break;
      }
      let k = j + 1;
      while (/[a-z]/.test(src[k] ?? '')) k++;
      out.push(src.slice(i, k)); i = k; prev = 'regex'; continue;
    }
    if (/\s/.test(c)) { i++; continue; }
    if (/[\w$]/.test(c)) { let j = i; while (j < src.length && /[\w$]/.test(src[j]!)) j++; prev = src.slice(i, j); i = j; continue; }
    prev = c; i++;
  }
  return out;
}

/** Every function the port modules port, by its oracle name. */
const PORTED: Readonly<Record<string, Fn>> = {
  cw: wt.cw, cls: wt.cls, joins: wt.joins, cpOf: wt.cpOf, clusters: wt.clusters, cellWidth: wt.cellWidth,
  own: py.own, get: py.get, rep: py.rep, pyLen: py.pyLen, rjust: py.rjust, pyRound: py.pyRound, divmod: py.divmod, pad02: py.pad02,
  floatRepr: py.floatRepr, pyStr: py.pyStr, pyFixed: py.pyFixed, family: py.family,
  num: py.num, clamp: py.clamp, fin: py.fin, whole: py.whole, flag: py.flag, obj: py.obj,
  tidy: tx.tidy, isSep: tx.isSep, parts: tx.parts, join: tx.join, lastSeg: tx.lastSeg, cut: tx.cut, tailPath: tx.tailPath, lite: tx.lite,
  none: tx.none, S: sp.S, withBg: sp.withBg, W: sp.W, sameAttrs: sp.sameAttrs, merge: sp.merge, pad: sp.pad, rtrim: sp.rtrim, splitAt: sp.splitAt,
  histTime: inp.histTime, histBranch: inp.histBranch, readHist: inp.readHist, readScoped: inp.readScoped, fromState: inp.fromState,
  roman: mx.roman, glint: mx.glint, icons10: mx.icons10, t5: mx.t5, twk: mx.twk, kilo: mx.kilo, day: mx.day, pctColour: mx.pctColour,
  modelSpan: mx.modelSpan, itemName: mx.itemName, ctxLabel: mx.ctxLabel, paying: mx.paying, f2Line1: mx.f2Line1, f2Line2: mx.f2Line2,
  f2Line3: mx.f2Line3, f2Well: mx.f2Well, f2Gutter: mx.f2Gutter, f2Book: mx.f2Book, f2Gold: mx.f2Gold, level: mx.level, pickaxe: mx.pickaxe,
  pickNumeral: mx.pickNumeral, changed: mx.changed, gitPile: mx.gitPile, spillReadout: mx.spillReadout, terrainLevel: mx.terrainLevel,
  terrain: mx.terrain, mixLine4: mx.mixLine4, mix: mx.mix,
  hex2: fb.hex2, scRarity: fb.scRarity, scPct: fb.scPct, scClock: fb.scClock, scInUse: fb.scInUse, scQuiet: fb.scQuiet, scFit: fb.scFit,
  scLine2: fb.scLine2, scLoud: fb.scLoud, fableTail: fb.fableTail, scWear: fb.scWear, scEighths: fb.scEighths, scDurability: fb.scDurability,
  scTooltip: fb.scTooltip, fableTooltip: fb.fableTooltip, bossFill: fb.bossFill, shade: fb.shade, bossLine: fb.bossLine, fableBoss: fb.fableBoss,
  lerp: fb.lerp, beamColour: fb.beamColour, beaconCol: fb.beaconCol, chip: fb.chip, chips: fb.chips, fableBeacon: fb.fableBeacon,
  mixFable: fb.mixFable, renderHud: fb.renderHud,
};
/** The oracle function a port function is compared with: its namesake, except where the port names a specialisation. */
const REF_FN: Readonly<Record<string, Fn>> = { pickNumeral: PORT.MIX_PICK['pick-numeral'], renderHud: MIX.render };
const refFn = (name: string): Fn => REF_FN[name] ?? (PORT[name as keyof typeof PORT] as Fn);
/** The constants input.ts, mix.ts and fable.ts export, each equal to the oracle's namesake. */
const CONSTANTS = ['QUARTER', 'QUARTERS', 'ROMAN', 'RARITY', 'TIER', 'GLINT', 'WELL', 'HEART', 'DARK', 'FOOD', 'GREY', 'DGREY', 'WHITE', 'XPG',
  'MAXW', 'G2', 'B2', 'DIV', 'F2SEL_L', 'F2SEL_R', 'ENCH', 'PLUS', 'MINUS', 'LEVEL', 'GRASS', 'COBBLE', 'BARE', 'LOWER8', 'LOW9',
  'LEFT8', 'SC_RED', 'SC_SEP', 'HEX_FULL', 'HEX_EMPTY', 'BOSS', 'BEACON_ON', 'BEACON_OFF', 'ACCENT'] as const;
/** fable.ts's exports that are not the oracle's namesakes: checked by their own test below. */
const FABLE_TABLES = new Set(['MIX_FABLE', 'FABLE_OPTIONS', 'FABLE_IDS']);
/** Test hooks of wt.ts, not ported functions. */
const HOOKS = new Set(['decoded', 'tables']);
/** The pick as the oracle's mixLine4 and mix take it (mixOpts of the picker's options). */
const PICK_OPTS = PORT.mixOpts(picked('fable-off')) as Record<string, string>;

// ---------------- inputs ----------------
const BS = String.fromCharCode(92);
const FAM = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
/** The cluster set (plan §4): ZWJ families, flags, tags, Hangul L/V/T, Prepend + '/', VS16, lone surrogates, and more. */
const CLUSTER_SET: readonly string[] = [
  FAM, FAM + '\u200D\u{1F466}', '\u{1F469}\u{1F3FD}\u200D\u{1F4BB}', '\u{1F3F3}\uFE0F\u200D\u{1F308}', '\u2764\uFE0F\u200D\u{1F525}', 'x\u200D\u2764',
  '\u{1F1FA}\u{1F1F8}', '\u{1F1FA}\u{1F1F8}\u{1F1EC}\u{1F1E7}', '\u{1F1FA}\u{1F1F8}\u{1F1EC}', '\u{1F1FA}', 'a\u{1F1FA}\u{1F1F8}b', '\u{1F1FA}\u{1F1F8}\u{1F1FA}\u{1F1F8}\u{1F1FA}',
  '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}', 'a\u{E0061}', '\u{E007F}', '\u{E0061}\u{E0062}',
  '\u1100\u1161\u11A8', '\u1100\u1100\u1161', '\uAC00\u11A8', '\uAC01\u11A8', '\uAC00\u1161', '\u1161\u11A8', '\u11A8\u11A8', '\u1100\uAC00',
  '\u1100\uAC01', '\uAC01\u1161', '\u1161\u1100', '\uD7A3\u11A8', '\uD7A4',
  '\u0600/', '\u0600/x', 'a\u0600/', '\u0600\u0600/', '\u0600 ', '/\u0600', '\u0600' + BS, 'x\u0600/y', 'C:/aaaaaaaaaa\u0600/bbb', '\u0D4E\u0D15',
  '\u2764\uFE0F', 'A\uFE0F', '1\uFE0F\u20E3', '\uFE0F', 'a\uFE0F\uFE0F', '\u263C\uFE0F', '\u26CF\uFE0F', '\u{1F357}\uFE0F', '\uFE0F\uFE0F',
  '\uD800', '\uDC00', '\uDC00\uD800', 'a\uD800b', '\uD83D', '\uD83D\uDE00', '\uDBFF\uDFFF', '\uD800\uFE0F', '\uFE0F\uDC00',
  'e\u0301', '\u0301', '\u0301\u0301a', '\u0915\u094D\u0937', '\u0915\u094D\u200D\u0937', '\u0915\u094D\u094D\u0937', '\u0915\u0301\u094D\u0937',
  '\r\n', '\n\r', '\r', 'a\u200D', '\u200Da', '\u{1F44D}\u{1F3FD}', 'x\u0903', '\u0903x', '\u00AD', 'a\u00ADb', '\u3164', '\u115F\u1160',
  '\u{1FB02}', '\u26CF ', '\u2162', '\u2B22\u2B21', '\u{1F4D6}', '\u2581\u2588', '\u2590\u258C',
];
const KEEPS: readonly (number | undefined)[] = [undefined, 0, 1, 2, 3, 5, 8, 40, 64, 256, -1, -2, -3, -5, -8, -40, -256, -512];
const TRIMS: readonly (boolean | undefined)[] = [undefined, false, true];
/** Hostile texts: the cluster set, the domains and N generated ones (the same every run). */
function hostile(seed: number): string[] {
  const r = mulberry32(seed);
  return [...CLUSTER_SET, ...TEXTS, ...Array.from({ length: N }, () => text(r))];
}
/** n around a width: just below, at and just above it, and a random one from -1 to past it. */
const around = (r: Rng, w: number): number[] => [w - 1, w, w + 1, int(r, -1, w + 2)];

// ---------------- the tests ----------------
// This test must stay the first: it watches the tables decode in this process.
test('the WT tables decode lazily: loading the port and measuring printable ASCII decodes nothing', () => {
  assert.deepEqual(AT_LOAD, { wt: false, cb: false }, 'loading src/hud/{wt,py,text,spans,input,mix,fable}.ts decodes no table');
  assert.deepEqual(wt.decoded(), { wt: false, cb: false }, 'no test ran before this one');
  const ascii = 'Opus 5.5 ~ D:/code/tools/hungerbar (hotbar) v2.1.311 \\ $ {}';
  assert.equal(wt.cellWidth(ascii), ascii.length);
  assert.equal(wt.cellWidth(''), 0);
  assert.equal(wt.cw(0x41) + wt.cw(0x2ff), 2);
  assert.deepEqual(wt.decoded(), { wt: false, cb: false }, 'printable ASCII and code points below U+0300 need no table');
  assert.equal(wt.cellWidth('é'), 1);
  assert.deepEqual(wt.decoded(), { wt: false, cb: true }, 'a Latin-1 letter needs only the cluster table');
  assert.equal(wt.cellWidth('漢'), 2);
  assert.deepEqual(wt.decoded(), { wt: true, cb: true });
});

test("the tables, JOIN, PY_WS and every regex are the oracle's text, byte for byte", () => {
  const lit = (name: string): string => {
    const m = [...HUD4_CODE.matchAll(new RegExp(`^  const ${name} = (.*);$`, 'gm'))];
    assert.equal(m.length, 1, `hud4.js declares ${name} once`);
    return m[0]![1]!;
  };
  assert.equal(`'${wt.WT}'`, lit('WT'));
  assert.equal(`'${wt.CB}'`, lit('CB'));
  assert.equal(wt.WT, PORT.WT);
  assert.equal(wt.CB, PORT.CB);
  const joinRows = (src: string): string[] => {
    const m = /const JOIN(?:: [^=]+)? = \[\n([\s\S]*?)\n\s*\];/.exec(src);
    assert.ok(m, 'a JOIN table');
    return m[1]!.split('\n').map((l) => l.trim());
  };
  assert.deepEqual(joinRows(readFileSync(new URL('wt.ts', SRC), 'utf8')), joinRows(HUD4_CODE));
  assert.ok(same(wt.JOIN, PORT.JOIN));
  const t = wt.tables();
  for (const k of ['R0', 'R1', 'RW', 'B0', 'B1', 'BC'] as const) assert.ok(same(t[k], PORT[k]), `${k} decodes as the oracle's`);
  assert.deepEqual([...py.PY_WS], [...(PORT.PY_WS as Set<number>)]);
  for (const [k, re] of [['BLANK', tx.BLANK], ['ESC_STR', tx.ESC_STR], ['ESC_CSI', tx.ESC_CSI], ['ESC_ANY', tx.ESC_ANY], ['SC_MISSING', inp.SC_MISSING]] as const) {
    assert.equal(String(re), lit(k), k);
    assert.equal(re.source, PORT[k].source, k);
    assert.equal(re.flags, PORT[k].flags, k);
  }
  // every exported function is a ported one (or a test hook), and its inline regexes are the oracle function's own
  for (const m of [wt, py, tx, sp, inp, mx, fb]) {
    for (const [k, v] of Object.entries(m)) if (typeof v === 'function' && !HOOKS.has(k)) assert.ok(k in PORTED, `${k} is checked here`);
  }
  let regexes = 0;
  for (const [name, f] of Object.entries(PORTED)) {
    const mine = regexLiterals(f.toString());
    assert.deepEqual(mine, regexLiterals(refFn(name).toString()), `${name}: the same regex literals`);
    regexes += mine.length;
  }
  assert.equal(regexes, 8, 'cellWidth 1, pyFixed 1, family 1, tidy 3, lite 1, fromState 1 (pinned, so a regex cannot hide from this check)');
  // every other export of input.ts, mix.ts and fable.ts is a constant equal to the oracle's (palette, tables, the shared
  // spans), or one of fable.ts's option tables
  const consts = new Set<string>(CONSTANTS);
  for (const m of [inp, mx, fb]) {
    for (const [k, v] of Object.entries(m)) {
      if (typeof v !== 'function' && k !== 'SC_MISSING' && !FABLE_TABLES.has(k)) assert.ok(consts.has(k), `${k} is checked here`);
    }
  }
  const ported = { ...inp, ...mx, ...fb } as unknown as Record<string, unknown>;
  for (const k of CONSTANTS) assert.ok(same(ported[k], PORT[k]), `${k} equals the oracle's`);
  assert.deepEqual(regexLiterals("a = b / c; x = /[/]\\//gu.test(s) // /no/\n/* /no/ */ return /y/i; '/no/'"), ['/[/]\\//gu', '/y/i']);
});

test('cw, cls, cpOf and cellWidth agree on every code point from 0 to 0x10FFFF, and clusters on every block of them', () => {
  let bad = 0;
  const first: string[] = [];
  for (let cp = 0; cp <= 0x10ffff; cp++) {
    const s = String.fromCodePoint(cp);
    if (wt.cw(cp) !== PORT.cw(cp) || wt.cls(cp) !== PORT.cls(cp) || wt.cpOf(s) !== PORT.cpOf(s) || wt.cellWidth(s) !== PORT.cellWidth(s)) {
      bad++;
      if (first.length < 8) first.push(`U+${cp.toString(16).toUpperCase()}`);
    }
  }
  assert.equal(bad, 0, `differences at ${first.join(' ')}`);
  // each run of 256 code points as one string: every neighbour pair joins or breaks as in the oracle
  for (let b = 0; b <= 0x10ffff; b += 256) {
    let s = '';
    for (let cp = b; cp < b + 256; cp++) s += String.fromCodePoint(cp);
    if (!same(portClusters(s), refClusters(s))) assert.fail(`clusters differ in the block U+${b.toString(16).toUpperCase()}`);
  }
});

test('clusters, cellWidth and joins agree on the cluster set and on every sequence of cluster-class representatives', () => {
  const contexts = (s: string): string[] => [s, 'a' + s + 'b', s + s, '/' + s + '/', ' ' + s, s + '\uFE0F', '\u200D' + s + '\u200D'];
  const set = CLUSTER_SET.flatMap(contexts);
  agree('clusters', portClusters, refClusters, set.map((s) => [s]));
  agree('cellWidth', wt.cellWidth, PORT.cellWidth, set.map((s) => [s]));
  for (let st = 0; st < 2; st++) for (let lead = 0; lead < 14; lead++) for (let trail = 0; trail < 14; trail++) {
    assert.equal(wt.joins(st, lead, trail), PORT.joins(st, lead, trail), `joins(${st}, ${lead}, ${trail})`);
  }
  // one code point per (class, width) found in the tables, plus U+FE0F (counted 2) and lone surrogates
  const byKey = new Map<string, number>(), byClass = new Map<number, number>();
  for (let cp = 0; cp <= 0x10ffff; cp++) {
    const c = PORT.cls(cp) as number, key = `${c}:${PORT.cw(cp) as number}`;
    if (!byKey.has(key)) byKey.set(key, cp);
    if (!byClass.has(c)) byClass.set(c, cp);
  }
  assert.equal(byClass.size, 14, 'every cluster class occurs');
  const reps = [...byKey.values(), 0xfe0f, 0xd800, 0xdc00].map((cp) => String.fromCodePoint(cp));
  const seqs: string[] = [];
  for (const a of reps) { seqs.push(a); for (const b of reps) { seqs.push(a + b); for (const c of reps) seqs.push(a + b + c); } }
  const one = [...byClass.values()].map((cp) => String.fromCodePoint(cp));
  for (const a of one) for (const b of one) for (const c of one) for (const d of one) seqs.push(a + b + c + d);
  const n = agree('clusters', portClusters, refClusters, seqs.map((s) => [s]));
  assert.ok(n > 40000, `${n} sequences`);
});

test('tidy, clusters, parts, join, isSep, lastSeg, lite, cut and tailPath agree on the domains, the huge inputs and hostile fuzz', () => {
  const r = mulberry32(0x7e57);
  const texts = hostile(0x51ed);
  const tidyArgs: unknown[][] = [];
  for (const v of [...TEXTS, ...NON_TEXTS, ...CLUSTER_SET, ...NUMBERS]) for (const trim of TRIMS) for (const keep of KEEPS) tidyArgs.push([v, trim, keep]);
  for (const v of texts) for (let k = 0; k < 4; k++) tidyArgs.push([v, pick(r, TRIMS), pick(r, KEEPS)]);
  for (const v of HUGE) for (const keep of [256, -256, -512]) tidyArgs.push([v, true, keep]);   // the bounds fromState uses
  for (let k = 0; k < N; k++) tidyArgs.push([value(r), pick(r, TRIMS), chance(r, 0.8) ? pick(r, KEEPS) : int(r, -600, 600)]);
  agree('tidy', tx.tidy, PORT.tidy, tidyArgs);

  // the 32,767-character inputs as they are for clusters; the path and name helpers get them the way the engine hands
  // them over, tidied to its bounds (fromState keeps 256 code points of a name, the last 256 of a branch, 512 of a cwd)
  agree('clusters', portClusters, refClusters, HUGE.map((s) => [s]));
  const all = [...texts, ...HUGE.flatMap((v) => [256, -256, -512].map((keep) => PORT.tidy(v, true, keep) as string))];
  agree('clusters', portClusters, refClusters, all.map((s) => [s]));
  agree('parts', tx.parts, PORT.parts, all.map((s) => [s]));
  agree('join', (s: string) => tx.join(tx.parts(s)), (s: string) => PORT.join(PORT.parts(s)), all.map((s) => [s]));
  agree('isSep', tx.isSep, PORT.isSep, [...new Set(portClusters(texts.join('')).map(([g]) => g))].map((g) => [g]));
  agree('lastSeg', tx.lastSeg, PORT.lastSeg, all.map((s) => [s]));
  agree('lite', tx.lite, PORT.lite, all.map((s) => [s]));
  const cuts: Array<[string, number]> = [];
  // a text longer than any the engine cuts (fromState keeps at most 512 code points of a cwd) is cut as fromState leaves it
  for (const t of all) { const s = t.length > 1200 ? (PORT.tidy(t, true, -512) as string) : t; for (const n of around(r, wt.cellWidth(s))) cuts.push([s, n]); }
  for (const s of TEXTS) if (s.length <= 120) for (let n = -2; n <= 60; n++) cuts.push([s, n]);   // every room a slot or line leaves
  agree('cut', tx.cut, PORT.cut, cuts);
  agree('tailPath', tx.tailPath, PORT.tailPath, cuts);
  agree('none', tx.none, PORT.none, [...NON_TEXTS, ...NUMBERS, '', 0, false].map((v) => [v]));
});

test('pyRound, pyFixed, floatRepr, pyStr, divmod, pad02, rjust, rep, pyLen, family, own and get agree on the domains and fuzz', () => {
  const r = mulberry32(0x9e3779b9);
  const nums = [...NUMBERS, ...Array.from({ length: N }, () => number(r))];
  agree('pyRound', py.pyRound, PORT.pyRound, nums.map((x) => [x]));
  agree('floatRepr', py.floatRepr, PORT.floatRepr, nums.map((x) => [x]));
  agree('pad02', py.pad02, PORT.pad02, [...nums, ...Array.from({ length: 300 }, (_, k) => k - 150)].map((x) => [x]));
  const fixed: Array<[number, number]> = [];
  for (const x of NUMBERS) for (const f of [0, 1, 2, 3, 6, 17, 100, 101]) fixed.push([x, f]);
  for (const x of nums) fixed.push([x, int(r, 0, 3)], [x, int(r, 0, 20)]);
  agree('pyFixed', py.pyFixed, PORT.pyFixed, fixed);
  const divs: Array<[number, number]> = [];
  for (const x of nums) divs.push([x, pick(r, [60, 1440, 1, 7, -3, 0.5, 0, -0, NaN, Infinity])], [x, number(r)]);
  agree('divmod', py.divmod, PORT.divmod, divs);
  const vals = [...nums, ...NUMERIC_STRINGS, ...NON_TEXTS, ...Array.from({ length: N }, () => value(r))];
  agree('pyStr', py.pyStr, PORT.pyStr, vals.map((v) => [v]));
  agree('family', py.family, PORT.family, [...vals, ...MODEL, ...TEXTS, ...hostile(0xfa31e)].map((v) => [v]));
  const strs = hostile(0x5eed);
  const counts = [-1, 0, 0.5, 1, 1.5, 2, 2.9, 3, 10, 40, 300, NaN, Infinity, -Infinity, -0];
  agree('rep', py.rep, PORT.rep, strs.flatMap((s) => [[s.slice(0, 40), pick(r, counts)], [s.slice(0, 40), int(r, -2, 12)]]));
  agree('rjust', py.rjust, PORT.rjust, strs.flatMap((s) => [[s, int(r, -2, 12)], [s, pick(r, counts)]]));
  agree('pyLen', py.pyLen, PORT.pyLen, strs.map((s) => [s]));
  const dicts: object[] = [
    { low: 'I', medium: 'II', high: 'III', xhigh: 'IV', max: 'V' }, {}, JSON.parse('{"__proto__": "P", "constructor": "C", "low": "I"}') as object,
    Object.assign(Object.create(null) as object, { toString: 'T' }), { '': 'E', 5: 'five', null: 'N' },
  ];
  const keys = ['low', 'LOW', 'max', 'constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', '', '5', 5, null, undefined, true, {}, 'null'];
  const pairs: Array<[object, unknown]> = dicts.flatMap((o) => keys.map((k): [object, unknown] => [o, k]));
  agree('own', py.own, PORT.own, pairs);
  agree('get', py.get, PORT.get, pairs.map(([o, k]) => [o, k, 'default']));
});

test('num, clamp, fin, whole, flag and obj agree on the domains and fuzz', () => {
  const r = mulberry32(0xb00b5);
  const vals = [...NUMBERS, ...NUMERIC_STRINGS, ...NON_TEXTS, ...CWD, ...Array.from({ length: N }, () => value(r))];
  agree('num', py.num, PORT.num, vals.map((v) => [v]));
  agree('whole', py.whole, PORT.whole, vals.map((v) => [v]));
  agree('flag', py.flag, PORT.flag, vals.map((v) => [v]));
  const bounds: Array<[number, number]> = [[0, 100], [0, 1e15], [0, 18000], [-5, 5], [1, 0], [0, 604800]];
  agree('fin', py.fin, PORT.fin, vals.map((v) => [v, ...pick(r, bounds)]));
  agree('clamp', py.clamp, PORT.clamp, NUMBERS.map((x) => [x, ...pick(r, bounds)]));
  agree('obj', py.obj, PORT.obj, vals.map((v) => [v]));
  for (const v of vals) if (v !== null && typeof v === 'object') assert.equal(py.obj(v), v, 'an object is handed back as itself');
});

test('S, withBg, W, sameAttrs, merge, pad, rtrim and splitAt agree on fuzzed span lists, and leave their input alone', () => {
  const r = mulberry32(0x5a5a);
  const T = ['', ' ', '  ', '   ', 'a ', ' a', 'x  ', '\u26CF ', '\u{1F4D6}', '\u2584\u2584', ' \u2387 ', 'e\u0301', '\u0301', '\u200D', '\u{1F1FA}', '\u{1F1F8}',
    '\uFE0F', '\u0600', '/', 'Opus 5.5', '\u00A0', '\u3164'];
  const FG = [undefined, null, '', '#FF5555', '#AAAAAA'], BG = [undefined, null, '', '#201E07', '#3F3F3F'];
  const BOLD = [undefined, null, false, true, 0, 1, 'yes'];
  const args = (): unknown[] => [chance(r, 0.85) ? pick(r, T) : text(r), pick(r, FG), pick(r, BG), pick(r, BOLD)];
  const S = sp.S as Fn;
  // spans as the engine makes them, and some it never makes (keys present with odd values), for sameAttrs' key presence
  const odd = (): sp.Span => pick(r, [{ t: 'x', bg: undefined }, { t: ' ', fg: '#FF5555', bold: false }, { t: ' ', bg: '' }, { t: 'x', fg: undefined },
    { t: '  ', bold: undefined }, { fg: '#FF5555', t: 'y' }]) as unknown as sp.Span;
  const span = (): sp.Span => (chance(r, 0.1) ? odd() : S(...args()) as sp.Span);
  const list = (): sp.Span[] => Array.from({ length: int(r, 0, 8) }, span);

  const sArgs = Array.from({ length: N }, args);
  for (const t of T) for (const fg of FG) for (const bg of BG) for (const bold of BOLD) sArgs.push([t, fg, bg, bold]);
  agree('S', S, PORT.S, sArgs);
  const lists = Array.from({ length: N >> 1 }, list);
  const spans = lists.flat();
  agree('withBg', sp.withBg, PORT.withBg, spans.map((s) => [s, pick(r, ['#201E07', '', null, undefined])]));
  agree('sameAttrs', sp.sameAttrs, PORT.sameAttrs, spans.map((s) => [s, pick(r, spans)]));
  const before = JSON.stringify(lists, (_k, v: unknown) => (v === undefined ? '<undefined>' : v));
  agree('W', sp.W, PORT.W, lists.map((l) => [l]));
  agree('merge', sp.merge, PORT.merge, lists.map((l) => [l]));
  agree('rtrim', sp.rtrim, PORT.rtrim, lists.map((l) => [l]));
  const pads: unknown[][] = [], splits: unknown[][] = [];
  for (const l of lists) {
    const w = sp.W(l);
    for (const n of around(r, w)) pads.push([l, n, pick(r, BG)]);
    for (const c of w <= 12 ? Array.from({ length: w + 3 }, (_, k) => k - 1) : around(r, w)) splits.push([l, c]);
  }
  agree('pad', sp.pad, PORT.pad, pads);
  agree('splitAt', sp.splitAt, PORT.splitAt, splits);
  agree('merge(rtrim(pad))', (l: sp.Span[], n: number) => sp.merge(sp.rtrim(sp.pad(l, n))), (l: unknown, n: number) => PORT.merge(PORT.rtrim(PORT.pad(l, n))),
    lists.map((l) => [l, sp.W(l) + int(r, 0, 3)]));
  assert.equal(JSON.stringify(lists, (_k, v: unknown) => (v === undefined ? '<undefined>' : v)), before, 'no input list or span changed');
});

// ---------------- input.ts and mix.ts ----------------
const R6 = Object.values(SPEC.round6.inputs), R7 = Object.values(SPEC.round7.situations);
/** The four reference states with the spec's hand-filled round-6 hists. */
const HREF: readonly State[] = (['normal', 'tight', 'fresh', 'extra'] as const).map((k) => SPEC.round6.inputs[k]!.state);
/** What the fuzz builds on: the reference states, every spec input and every session4 frame (copies in this realm). */
const BASES: readonly State[] = plain([...Object.values(STATES), ...R6.map((x) => x.state), ...R7.map((x) => x.state), ...SESSION.frames]);
const range = (a: number, b: number, step = 1): number[] => Array.from({ length: Math.floor((b - a) / step) + 1 }, (_, k) => a + k * step);
/** Each huge text (32,767 characters) in each text field of the normal state. */
const HUGE_STATES: readonly State[] = HUGE.flatMap((v) => ['model', 'branch', 'cwd', 'ver', 'effort'].map((f) => ({ ...HREF[0]!, [f]: v })));
const histOf = (s: unknown): unknown => (s !== null && typeof s === 'object' ? (s as State).hist : undefined);

test('fromState, readScoped, readHist, histTime and histBranch agree on the domains, the spec, session4, huge input and fuzz', () => {
  const r = mulberry32(0x1f0e);
  const states: unknown[] = [...NON_STATES, ...NON_TEXTS, ...BASES, ...HUGE_STATES, ...HREF.flatMap((b) => oneFactor(b).map(([, s]) => s))];
  for (let k = 0; k < N; k++) states.push(state(r, BASES));
  for (const m of SC_MODELS) states.push({ ...HREF[0]!, model: m });
  const n = agree('fromState', inp.fromState, PORT.fromState, states.map((s) => [s]));

  const LL = 32767, FE = (name: unknown, used: unknown, left: unknown): State => ({ name, used, left });
  const scopeds: unknown[] = [...SC_DOMAIN.map((v) => (v === DEL ? undefined : v)), ...states.map((s) => (s !== null && typeof s === 'object' ? (s as State).scoped : s)),
    Array.from({ length: 100000 }, (_, k) => FE(k % 7 ? 'Model' + k : 'Fable', k % 101, k * 997)),
    Array.from({ length: 16 }, (_, k) => FE((k % 2 ? 'Fable' : 'Sonnet') + 'x'.repeat(40000), 6 * k, 3600 * k)), [FE('F'.repeat(LL), 35, 3600)],
    [FE('F' + '́'.repeat(LL), 35, 3600)], [FE('Fable' + ' '.repeat(LL) + 'x', 62, 60)], [FE('\x1b[1m'.repeat(LL) + 'Fable', 62, 60)],
    [FE('Fable', ' '.repeat(LL) + '35' + ' '.repeat(LL), ' '.repeat(LL) + '3600')], Object.assign(new Array(1e6), { 999999: FE('Fable', 1, 1) })];
  for (let k = 0; k < N; k++) scopeds.push(scoped(r));
  agree('readScoped', inp.readScoped, PORT.readScoped, scopeds.map((v) => [v]));

  const hists: unknown[] = [...NON_STATES, ...states.map(histOf)];
  for (const b of HREF) {
    const H = b.hist as State, br = typeof b.branch === 'string' ? b.branch : 'main', I = Math.floor((H.now as number) / 900);
    for (const [f, v] of histFields(H.now as number, br)) hists.push(withField(b, f, v).hist);
    hists.push(...msHists(H));
    for (const [f, v] of [['hist.buckets', Array.from({ length: 1e5 }, (_, k) => [I - (k % 8), k, k, 0, k % 2])], ['hist.buckets', new Array(1e6).fill(null)],
      ['hist.lastCommit.branch', 'x'.repeat(LL)], ['hist.now', '0'.repeat(32760) + String(H.now)], ['hist.dirtySince', ' '.repeat(LL)]] as const) {
      hists.push(withField(b, f, v).hist);
    }
  }
  for (let k = 0; k < N; k++) hists.push(hist(r, pick(r, [undefined, 0, 5700, 12000, 1792859460])));
  const nh = agree('readHist', inp.readHist, PORT.readHist, hists.map((h) => [h]));

  const times = [...NUMBERS, ...NUMERIC_STRINGS, ...NON_TEXTS, undefined];
  agree('histTime', inp.histTime, PORT.histTime, times.flatMap((v) => [[v, 0, 5700], [v, 0, 0], [v, 0, 1e13]]));
  agree('histBranch', inp.histBranch, PORT.histBranch, [...BRANCH, ...NUMBERS, ...NON_TEXTS, ...TEXTS, 'x'.repeat(4096), 'x'.repeat(4097)].map((v) => [v]));
  assert.ok(n > 5000 && nh > 1000, `${n} states, ${nh} hists`);
});

/** Situations to call the mix's functions with: the oracle's own fromState and readHist of each state, in pairs. */
function situations(r: Rng, fuzz: number): Array<[unknown, unknown]> {
  const states: unknown[] = [...NON_STATES, ...BASES.filter((_, i) => i % 4 === 0), ...HUGE_STATES, ...oneFactor(HREF[0]!).map(([, s]) => s),
    ...oneFactor(HREF[1]!).filter((_, i) => i % 3 === 0).map(([, s]) => s)];
  for (let k = 0; k < fuzz; k++) states.push(state(r, BASES));
  return states.map((s) => [PORT.fromState(s), PORT.readHist(PORT.obj(s).hist)]);
}

test('the mix helpers agree on the domains and fuzz: roman, glint, level, icons10, t5, twk, kilo, pctColour, terrainLevel, changed, gitPile, spillReadout', () => {
  const r = mulberry32(0x3a7);
  const words = [...EFFORT, ...TEXTS, 'constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'HIGH', 'Max', 'xHigh', 'turbo', ''];
  const efforts = [...new Set(words.filter((e): e is string => typeof e === 'string').flatMap((e) => [e, tx.tidy(e, true, 256)]))];
  for (let k = 0; k < N; k++) efforts.push(tx.tidy(text(r), true, 256));
  for (const [name, f] of [['roman', mx.roman], ['glint', mx.glint], ['level', mx.level]] as const) agree(name, f, refFn(name), efforts.map((e) => [e]));
  const nums = [...NUMBERS, ...range(-20, 120), ...Array.from({ length: N }, () => number(r))];
  agree('icons10', mx.icons10, PORT.icons10, nums.map((x) => [x]));
  agree('pctColour', mx.pctColour, PORT.pctColour, nums.map((x) => [x]));
  const mins = [...range(0, 10080), ...NUMBERS];                        // every 5-hour and weekly reset fromState can give
  agree('t5', mx.t5, PORT.t5, mins.map((x) => [x]));
  agree('twk', mx.twk, PORT.twk, mins.map((x) => [x]));
  const counts = [...NUMBERS, ...range(0, 300), ...range(0, 20).flatMap((e) => [10 ** e - 1, 10 ** e, 10 ** e + 1, 2 * 10 ** e]),
    ...Array.from({ length: N }, () => Math.floor(10 ** (r() * 16)))];
  agree('kilo', mx.kilo, PORT.kilo, counts.map((x) => [x]));
  agree('terrainLevel', mx.terrainLevel, PORT.terrainLevel, counts.map((x) => [x]));
  // git counts at every digit boundary and ratio, every slab height (sweep.mjs case 4b), then the fuzz's repos
  const gits: unknown[] = [];
  for (const v of [1, 9, 10, 99, 100, 999, 1000, 9999, 99999, 100000, 1e12, 1e15]) for (const [a, d] of [[v, v], [v, 0], [0, v], [v, 1], [1, v]]) gits.push({ branch: 'main', add: a, rem: d });
  for (let d = 1; d <= 32; d++) for (const a of [16, 32, 33]) gits.push({ branch: 'feature/cache', add: a, rem: d }, { branch: 'feature/cache', add: d, rem: a });
  for (const [sit] of situations(r, N >> 2)) { const g = (sit as State).git; if (g) gits.push(g); }
  agree('changed', mx.changed, PORT.changed, [null, ...gits].map((g) => [g]));
  agree('gitPile', mx.gitPile, PORT.gitPile, gits.map((g) => [g]));
  agree('spillReadout', mx.spillReadout, PORT.spillReadout, gits.flatMap((g) => [[g, 62], [g, int(r, 0, 120)]]));
});

test('the Day & Night lines, the wells, the pick, terrain, mixLine4 and mix agree on the situations of the domains, the spec and fuzz', () => {
  const r = mulberry32(0xd4e);
  const sits = situations(r, N >> 2);
  for (const name of ['day', 'ctxLabel', 'paying', 'f2Line1', 'f2Line2', 'f2Line3', 'f2Gutter', 'f2Book', 'f2Gold', 'pickNumeral', 'modelSpan'] as const) {
    agree(name, PORTED[name]!, refFn(name), sits.map(([sit]) => [sit]));
  }
  const n = agree('terrain', mx.terrain, PORT.terrain, sits.flatMap(([sit, h]) => [[sit, h], [sit, null]]));
  agree('mixLine4', mx.mixLine4, (sit: unknown, h: unknown) => PORT.mixLine4(sit, PICK_OPTS, h), sits.map(([sit, h]) => [sit, h]));
  agree('mix', mx.mix, (sit: unknown, h: unknown) => PORT.mix(sit, PICK_OPTS, h), sits.map(([sit, h]) => [sit, h]));
  agree('modelSpan', mx.modelSpan, PORT.modelSpan, sits.map(([sit]) => [sit, pick(r, ['', 'Opus', 'x'.repeat(50), text(r)])]));
  agree('pickaxe', mx.pickaxe, PORT.pickaxe, sits.map(([sit]) => [sit, pick(r, [mx.WELL, '#48205C', '#26192A'])]));
  const lores = (sit: unknown): unknown[] => {
    const e = PORT.roman((sit as State).effort) as string;
    return e ? [[PORT.S(' Efficiency ' + e, mx.GREY)], [PORT.S(' Eff ' + e, mx.GREY)]] : [[]];
  };
  agree('itemName', mx.itemName, PORT.itemName, sits.flatMap(([sit]) => [[sit, 41, lores(sit)], [sit, int(r, -2, 60), lores(sit)]]));
  const icons = [null, [PORT.S('📖', '#C8A27C')], [PORT.S('▄▄', '#FCEE4B')], [PORT.S('◆ ', '#17DD62')]];
  const wells: unknown[][] = [];
  for (const icon of icons) for (const c of [null, undefined, ...range(-2, 120), 1e15, 0.5, 1.5]) wells.push([icon, c]);
  agree('f2Well', mx.f2Well, PORT.f2Well, wells);
  assert.ok(n > 2000, `${n} terrains`);
});

// ---------------- fable.ts ----------------
const R7S = SPEC.round7.situations;
/** A situation with scoped limits, the oracle's own mix lines for it, and its scoped list (never empty). */
interface FableCase { sit: State; lines: RefLines; sc: State[] }
/**
 * Situations for the fable functions, as the oracle hands them over: the round-7 situations, every third session4 frame
 * as it is and on Fable 5.1, every scoped domain value on each reference state under one of the scoped models (Fable's
 * spellings, others, 'GPT 5' of no known family, as an entry 'GPT' is), and fuzz states that mostly carry a scoped
 * list. Only those with a scoped entry are kept: mixFable calls an option for no other.
 */
function fableCases(r: Rng, fuzz: number): FableCase[] {
  const models = [...SC_MODELS, 'Claude', 'GPT 5', 'Opus 5.5', 'Haiku 4.5'];
  const states: unknown[] = [...R7.map((x) => x.state), ...SESSION.frames.filter((_, i) => i % 3 === 0).flatMap((f) => [f, { ...plain(f), model: 'Fable 5.1' }])];
  for (const b of [...HREF, R7S['two-scoped']!.state]) {
    for (const v of SC_DOMAIN) states.push({ ...b, scoped: v === DEL ? undefined : v, ...(chance(r, 0.7) ? { model: pick(r, models) } : {}) });
  }
  for (let k = 0; k < fuzz; k++) {
    // a copy: state() hands out NON_STATES' own values ([], {}, ...), which no test may change
    const s = state(r, BASES), isObj = s !== null && typeof s === 'object' && !Array.isArray(s);
    states.push(isObj && chance(r, 0.8) ? { ...(s as State), scoped: scoped(r) } : s);
  }
  const out: FableCase[] = [];
  for (const s of states) {
    const sit = PORT.fromState(s) as State, sc = sit.scoped as State[];
    if (sc.length) out.push({ sit, lines: PORT.mix(sit, PICK_OPTS, PORT.readHist(PORT.obj(s).hist)) as RefLines, sc });
  }
  return out;
}
/** A digest of JSON snapshots that keep undefined values visible, one per item (no huge string), to see that no input changed. */
function snap(items: readonly unknown[]): string {
  const h = createHash('sha256');
  for (const v of items) h.update(JSON.stringify(v, (_k, x: unknown) => (x === undefined ? '<undefined>' : x)) + '\n');
  return h.digest('hex');
}

test('the fable helpers agree on the domains and fuzz: hex2, scWear, scEighths, scDurability, bossFill, shade, lerp, beamColour', () => {
  const r = mulberry32(0xfab1e);
  const pcts = [...NUMBERS, ...range(-20, 120), ...range(-1, 101, 0.25), 9.99, 10.01, 49.99, 50.01, ...Array.from({ length: N }, () => number(r))];
  for (const name of ['scWear', 'scEighths', 'scDurability', 'bossFill', 'beamColour'] as const) agree(name, PORTED[name]!, refFn(name), pcts.map((x) => [x]));
  agree('hex2', fb.hex2, PORT.hex2, [...range(0, 300), ...NUMBERS, -1, -255, 0.5, 15.5, 2 ** 40].map((x) => [x]));
  const colours = [fb.SC_RED, ...Object.values(mx.RARITY), mx.WHITE, mx.GREY, mx.DARK, '#000000', '#FFFFFF', '#0a0B0c', '#123', '', 'red', '#GGGGGG'];
  for (let k = 0; k < 200; k++) colours.push('#' + Array.from({ length: 3 }, () => int(r, 0, 255).toString(16).padStart(2, '0')).join(''));
  const ks = [0.6, 0.25, 0.12, 0, 1, 0.5, -1, 2, NaN];
  agree('shade', fb.shade, PORT.shade, colours.flatMap((c) => [...ks.map((k) => [c, k]), [c, r()]]));
  agree('lerp', fb.lerp, PORT.lerp, colours.flatMap((c) => [[c, pick(r, colours), r()], ['#2E6B73', '#E9FFFF', pick(r, pcts) / 100], [c, c, pick(r, ks)]]));
});

test('the fable options agree on situations with scoped limits: every entry, every option, mixFable, scFit and chips', () => {
  const r = mulberry32(0xb055);
  const cases = fableCases(r, N >> 2);
  const before = snap(cases);
  const SEPS = [fb.SC_SEP, PORT.S(' ')];
  const entries = cases.flatMap((c) => c.sc.map((e) => [c, e] as const));
  agree('scInUse', fb.scInUse, PORT.scInUse, cases.map((c) => [c.sit, c.sc]));
  for (const name of ['scRarity', 'scPct', 'scClock', 'bossLine'] as const) agree(name, PORTED[name]!, refFn(name), entries.map(([, e]) => [e]));
  agree('scQuiet', fb.scQuiet, PORT.scQuiet, entries.map(([, e]) => [e, pick(r, SEPS), chance(r, 0.5)]));
  agree('scLoud', fb.scLoud, PORT.scLoud, entries.map(([, e]) => [e, pick(r, SEPS)]));
  agree('chip', fb.chip, PORT.chip, entries.map(([, e]) => [e, chance(r, 0.5)]));
  agree('scTooltip', fb.scTooltip, PORT.scTooltip, entries.map(([c, e]) => [c.sit, e]));
  agree('scLine2', fb.scLine2, PORT.scLine2, cases.map((c) => [c.sit, c.lines[1]]));
  agree('beaconCol', fb.beaconCol, PORT.beaconCol, cases.map((c) => [c.sit, c.lines]));
  let n = 0;
  for (const name of ['fableTail', 'fableTooltip', 'fableBoss', 'fableBeacon'] as const) n += agree(name, PORTED[name]!, refFn(name), cases.map((c) => [c.lines, c.sit, c.sc]));
  // mixFable: every id that draws nothing on every situation (with no scoped entry too), the 4 that draw on every fourth
  // (each option itself was compared on all of them just above)
  const draw = ['fable-tail', 'fable-tooltip', 'fable-boss', 'fable-beacon'];
  const idle = ['fable-off', 'fable-mount-x', 'fable-x', 'tail', '', 'constructor', '__proto__', 'toString', 'hasOwnProperty', undefined, null, 5];
  const empty = situations(r, 50).map(([sit, h]) => ({ sit, lines: PORT.mix(sit, PICK_OPTS, h) as RefLines }));
  agree('mixFable', fb.mixFable, PORT.mixFable, [...cases, ...empty].flatMap((c, i) => [...idle, ...(i % 4 ? [] : draw)].map((id) => [c.lines, c.sit, id])));
  // scFit after line 2 with and without the loud entry, and after heads of every width up to and past 110 cells (each
  // step of its fitting, and ' +N' that cannot fit); chips from every column a beacon can leave, and past the line's end
  const fits: unknown[][] = [], chipArgs: unknown[][] = [];
  for (const c of cases) {
    const sc = c.sc.slice(0, int(r, 1, c.sc.length)), w = int(r, 0, 116);
    fits.push([c.lines[1], sc, pick(r, SEPS)], [[...c.lines[1]!, ...PORT.scLoud(c.sc[0], fb.SC_SEP)], sc, fb.SC_SEP], [[PORT.S('x'.repeat(w))], sc, pick(r, SEPS)]);
    const C = PORT.beaconCol(c.sit, c.lines) as number;
    chipArgs.push([sc, C + 1, C + 3], [sc, int(r, 0, 112), int(r, 0, 112)], [sc, 108, 108], [[], C, C + 3]);
  }
  agree('scFit', fb.scFit, PORT.scFit, fits);
  agree('chips', fb.chips, PORT.chips, chipArgs);
  assert.equal(snap(cases), before, 'no situation, line or entry changed');
  assert.ok(cases.length > 1500 && n > 6000, `${cases.length} situations, ${n} option calls`);
});

// ---------------- render level ----------------
/** The 5 shipped ids, as hungerbar.json names them, and the pick with each as the oracle takes it. */
const IDS = fb.FABLE_IDS;
const OPTS = Object.fromEntries(IDS.map((id) => [id, picked(`fable-${id}` as RefFableId)])) as Readonly<Record<fb.FableId, MixOpts>>;
/** A port span holds t and only the keys the engine sets (fg, bg, bold), none of them undefined. */
function spanProblem(lines: readonly (readonly sp.Span[])[]): string | null {
  for (const l of lines) for (const s of l) {
    for (const [k, v] of Object.entries(s)) if (v === undefined || !['t', 'fg', 'bg', 'bold'].includes(k)) return `${show(s)}: key ${k}`;
  }
  return null;
}
const sgr = (lines: readonly (readonly sp.Span[])[] | RefLines, depth: 'truecolor' | '256'): string => sgrOracle(lines, { depth });
const SGR_ON = { bold: true, nbsp: true };

/**
 * The glyphs probed for the HUD in design rounds 4-7 (the design's hudprobe and round5-7 judges: the DirectWrite font fallback
 * of each icon style in Windows Terminal 1.25, and the width WT and Claude Code give it), each with where it was probed:
 *   r4  round 4's Day & Night table (hudprobe/glyph_table_short.json): its lines 1-4 and the wells
 *   r5  round 5's pick-numeral: U+2160-2164 from Yu Gothic UI in both styles (mix-spec.json pick)
 *   r6  round 6's git items: WT builtin block elements U+2580-259F (round6-spec.json git), and the book
 *   r7  round 7's glyphs.rows (round7-spec.json) and its judge's probe (round7/judge/probe/probe7_out.json)
 */
const PROBED: ReadonlyMap<string, string> = new Map([
  ['☠', 'r4'], ['☼', 'r4'], ['☾', 'r4'], ['◦', 'r4'], ['○', 'r4'], ['◉', 'r4'], ['⌂', 'r4'], ['▐', 'r4'], ['◆', 'r4'], ['▄', 'r4'], ['⎇', 'r4'],
  ['Ⅰ', 'r5 r6'], ['Ⅱ', 'r5'], ['Ⅲ', 'r5'], ['Ⅳ', 'r5 r6'], ['Ⅴ', 'r5 r6'], ['📖', 'r4 r6'], ['⛏', 'r4 r6 r7'],
  ['▀', 'r4 r6'], ['▁', 'r4 r6'], ['▃', 'r6'], ['▅', 'r6'], ['▆', 'r6'], ['▇', 'r6'], ['▂', 'r4 r6 r7'], ['▒', 'r6 r7'],
  ['♥', 'r4 r7'], ['🍗', 'r4 r7'], ['·', 'r4 r7'], ['↻', 'r4 r7'], ['…', 'r7'], ['█', 'r4 r7'], ['⬢', 'r4 r7'], ['⬡', 'r4 r7'],
  ['▉', 'r7'], ['▊', 'r7'], ['▋', 'r7'], ['▌', 'r4 r7'], ['▍', 'r7'], ['▎', 'r7'], ['▏', 'r4 r7'], ['🮂', 'r4 r7'], ['◈', 'r4 r7'],
  ['┃', 'r4 r7'], ['╻', 'r7'],
]);
/** What the census has seen: each probed glyph's count, over how many renders. */
const census = { renders: 0, seen: new Map<string, number>() };
/** Every code point in a state's strings (keys too): user text, which the census leaves out. */
function userText(v: unknown, out = new Set<number>(), seen = new Set<object>()): Set<number> {
  if (typeof v === 'string') for (const ch of v) out.add(ch.codePointAt(0)!);
  else if (v !== null && typeof v === 'object' && !seen.has(v)) {
    seen.add(v);
    for (const [k, x] of Object.entries(v)) { userText(k, out, seen); userText(x, out, seen); }
  }
  return out;
}
/**
 * Fails unless every non-ASCII code point of a port render that its state does not hold is a probed glyph. A pair that
 * tidy() joins from two lone surrogates of the state (once it drops an escape between them) is user text too.
 */
function takeCensus(what: string, s: unknown, lines: readonly (readonly sp.Span[])[]): void {
  let user: Set<number> | undefined;
  for (const l of lines) for (const span of l) for (const ch of span.t) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80 || (user ??= userText(s)).has(cp) || (cp > 0xffff && user.has(ch.charCodeAt(0)) && user.has(ch.charCodeAt(1)))) continue;
    if (!PROBED.has(ch)) assert.fail(`${what}: the port draws U+${cp.toString(16).toUpperCase()} ${JSON.stringify(ch)}, never probed for the HUD`);
    census.seen.set(ch, (census.seen.get(ch) ?? 0) + 1);
  }
  census.renders++;
}

/**
 * Renders `s` with the port and the oracle for each id (all 5 by default); fails, with the state shrunk, unless they
 * agree as spans, tuples and SGR at 24-bit and 256 colours. Each port render also passes the glyph census, and every id
 * draws exactly fable-off's lines when the state has no scoped entry.
 */
function renders(what: string, s: unknown, ids: readonly fb.FableId[] = IDS): void {
  let off: sp.Span[][] | undefined, scopedN: number | undefined;
  for (const id of ids) {
    const port = run(() => fb.renderHud(s, id)), ref = run(() => MIX.render(s, OPTS[id]));
    if (!same(port, ref) || 'err' in port) {
      const differs = (st: unknown): boolean => !same(run(() => fb.renderHud(st, id)), run(() => MIX.render(st, OPTS[id])));
      const small = shrinkState(s, differs);
      assert.fail(`${what}, fable-${id}: the port and the oracle differ. Shrunk state ${show(small)}:\nport   ${show(run(() => fb.renderHud(small, id)))}\noracle ${show(run(() => MIX.render(small, OPTS[id])))}`);
    }
    const mine = (port as { v: sp.Span[][] }).v, theirs = (ref as { v: RefLines }).v;
    assert.equal(JSON.stringify(tuples(mine)), JSON.stringify(tuples(theirs)), `${what}, fable-${id}: tuples`);
    // the port's bytes through the shipped writer (src/hud/look.ts), the oracle's through the tests' own encoder
    for (const depth of ['truecolor', '256'] as const) assert.equal(encode(mine, depth, SGR_ON), sgr(theirs, depth), `${what}, fable-${id}: SGR at ${depth}`);
    const bad = spanProblem(mine);
    assert.equal(bad, null, `${what}, fable-${id}: ${bad}`);
    takeCensus(`${what}, fable-${id}`, s, mine);
    if (id === 'off') off = mine;
    else if (off && !same(mine, off)) {
      scopedN ??= (PORT.fromState(s).scoped as unknown[]).length;
      assert.ok(scopedN > 0, `${what}: fable-${id} with no scoped entry draws fable-off's lines`);
    }
  }
}

test('the 25 round-6 renders and the 95 round-7 renders (19 situations x 5 ids) match their spec hashes through the port', () => {
  for (const [key, inp6] of Object.entries(SPEC.round6.inputs)) {
    const lines = fb.renderHud(inp6.state, 'off');
    assert.equal(lines.length, 4, key);
    assert.equal(renderHash([lines[3]!]), inp6.sha256, `round 6 ${key}`);
  }
  let n = 0;
  for (const [key, sit] of Object.entries(R7S)) {
    for (const id of IDS) { assert.equal(renderHash(fb.renderHud(sit.state, id)), sit.sha256[`fable-${id}`], `round 7 ${key} fable-${id}`); n++; }
  }
  assert.equal(n, 95);
  assert.equal(fb.renderHud(R7S['fable-in-use']!.state, 'boss').length, 5, 'the boss line while Fable is in use');
  assert.equal(fb.renderHud(R7S['fable-empty']!.state, 'boss').length, 4, 'no boss line on Opus');
});

test("FABLE_OPTIONS are the oracle's fable options, verbatim, without fable-mount; MIX_FABLE and FABLE_IDS name the same 5", () => {
  const ref = plain(MIX.options!.fable);
  assert.deepEqual(plain(fb.FABLE_OPTIONS), ref.filter((o) => o.id !== 'fable-mount'));
  assert.deepEqual(fb.FABLE_OPTIONS.map((o) => o.id), IDS.map((id) => `fable-${id}`));
  assert.deepEqual(Object.keys(fb.MIX_FABLE), Object.keys(PORT.MIX_FABLE).filter((k) => k !== 'fable-mount'));
  assert.deepEqual(['fable-off', ...Object.keys(fb.MIX_FABLE)], fb.FABLE_OPTIONS.map((o) => o.id));
  const named: Record<string, Fn> = { 'fable-tail': fb.fableTail, 'fable-tooltip': fb.fableTooltip, 'fable-boss': fb.fableBoss, 'fable-beacon': fb.fableBeacon };
  for (const [k, f] of Object.entries(fb.MIX_FABLE)) assert.equal(f, named[k], k);
});

test('renderHud equals the oracle for the 5 ids span for span and as SGR: states x hists, the spec, no objects, session4 x 2 models', () => {
  let n = 0;
  const hists = [undefined, ...R6.map((x) => x.state.hist)];
  for (const [k, base] of Object.entries(STATES)) hists.forEach((h, i) => { renders(`states.json ${k} with hist ${i}`, h === undefined ? base : { ...base, hist: h }); n++; });
  for (const [k, x] of Object.entries(SPEC.round6.inputs)) { renders(`round 6 ${k}`, x.state); n++; }
  for (const [k, x] of Object.entries(R7S)) {
    renders(`round 7 ${k}`, x.state); n++;
    for (const id of IDS) assert.equal(JSON.stringify(MIX.render(x.state, { ...OPTS[id], style: 'plain' })), JSON.stringify(MIX.render(x.state, OPTS[id])), `round 7 ${k} plain`);
  }
  NON_STATES.forEach((s, i) => { renders(`not an object #${i}`, s); n++; });
  SESSION.frames.forEach((f, i) => {
    renders(`session4 frame ${i}`, f);
    renders(`session4 frame ${i} on Fable 5.1`, { ...plain(f), model: 'Fable 5.1' });
    n += 2;
  });
  assert.equal(n, 4 * 26 + 25 + 19 + NON_STATES.length + 2 * 661);
});

test('renderHud equals the oracle on every domain value and every hist field one at a time, and on huge input', () => {
  // every domain value on the normal state with fable-off (the function-level tests take every reference state), and on
  // Fable in use beside Sonnet for the 5 ids; every hist field on each reference state (the options never read line 4);
  // each huge text on both
  let n = 0;
  const inUse = R7S['two-scoped-in-use']!.state;
  oneFactor(HREF[0]!).forEach(([f, s], i) => { renders(`normal, ${f} value #${i}`, s, ['off']); n++; });
  oneFactor(inUse).forEach(([f, s], i) => { renders(`two scoped in use, ${f} value #${i}`, s); n += IDS.length; });
  for (const base of HREF) {
    const H = base.hist as State, br = typeof base.branch === 'string' ? base.branch : 'main';
    histFields(H.now as number, br).forEach(([f, v], i) => { renders(`${String(base.branch)} ${f} value #${i}`, withField(base, f, v), ['off']); n++; });
    msHists(H).forEach((h, i) => { renders(`${String(base.branch)} hist in ms #${i}`, { ...base, hist: h }, ['off']); n++; });
  }
  HUGE_STATES.forEach((s, i) => { renders(`huge #${i}`, s, ['off']); renders(`huge #${i} in use`, { ...s, scoped: inUse.scoped, model: s.model === HREF[0]!.model ? inUse.model : s.model }); n += 1 + IDS.length; });
  // lone surrogates that tidy() joins into one pair once it drops the escape between them (fuzz state #58768 of the long
  // run: U+10000 in the tooltip's lore); the census counts the pair as user text
  const OSC = '\x1b]0;title\x07';
  for (const [f, v] of [['effort', `\uD800${OSC}\uDC00Sonnet 4.5`], ['model', `Fable \uD83D${OSC}\uDE00 5.1`], ['branch', `main\uD800${OSC}\uDC00`],
    ['cwd', `D:/\uDBFF${OSC}\uDFFF/x`], ['ver', `2.1\uD800${OSC}\uDC00`]] as const) {
    renders(`${f}: lone surrogates joined`, { ...inUse, [f]: v }); n += IDS.length;
  }
  assert.ok(n > 6000, `${n} renders`);
});

test('renderHud equals the oracle for the 5 ids on every scoped value under Fable, Opus and a model of no known family', () => {
  // the scoped domain (no data, every used % and reset, odd names, repeats, order, 16+ entries) on the round-7 normal
  // situation (a weekly, a warm cache) as Opus, Fable 5.1 and 'GPT 5' (in use for an entry named 'GPT'), and on tight,
  // fresh and extra as Fable 5.1
  let n = 0;
  const bases: Array<[string, State, unknown]> = [['normal', R7S.normal!.state, undefined], ['normal', R7S.normal!.state, 'Fable 5.1'],
    ['normal', R7S.normal!.state, 'GPT 5'], ['tight', R7S.tight!.state, 'Fable 5.1'], ['fresh', R7S.fresh!.state, 'Fable 5.1'], ['extra', R7S.extra!.state, 'Fable 5.1']];
  for (const [k, base, model] of bases) {
    SC_DOMAIN.forEach((v, i) => {
      const s: State = { ...base, ...(model === undefined ? {} : { model }) };
      if (v === DEL) delete s.scoped; else s.scoped = v;
      renders(`${k} as ${String(model ?? base.model)}, scoped value #${i}`, s); n++;
    });
  }
  assert.equal(n, 6 * SC_DOMAIN.length);
});

/**
 * A deep copy that keeps what structuredClone drops: own properties set on a Date (the fuzz can draw new Date(0) for a
 * group and then set 'week.left' on it) or on an array, holes, and each object's prototype. Keys are defined, so
 * '__proto__' stays a key.
 */
function deepCopy(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  const out: object = Array.isArray(v) ? new Array<unknown>(v.length) : v instanceof Date ? new Date(v.getTime())
    : Object.create(Object.getPrototypeOf(v) as object | null) as object;
  for (const [k, x] of Object.entries(v)) Object.defineProperty(out, k, { value: deepCopy(x), enumerable: true, writable: true, configurable: true });
  return out;
}

test('renderHud equals the oracle for the 5 ids on seeded fuzz states, and leaves each state as it was', () => {
  const r = mulberry32(0xf0ab1e), RN = Math.max(600, Number(process.env.HUD_ORACLE_N) || 0);
  const odd = { week: Object.assign(new Date(0), { left: 3599 }), h5: JSON.parse('{"__proto__": {"used": 5}}') as unknown, x: Object.create(null) as unknown,
    a: Object.assign([1, , 3], { scoped: [] }) };
  assert.deepStrictEqual(deepCopy(odd), odd, 'deepCopy keeps own keys on a Date and an array, holes, a "__proto__" key and a null prototype');
  assert.notDeepStrictEqual(structuredClone(odd.week), odd.week, 'structuredClone drops them (fuzz state #48037 of the long run)');
  assert.deepStrictEqual(NON_STATES, [null, undefined, 'x', 5, [], {}, { h5: null, week: 'x', cache: 5, extra: [] }, true], 'no test changed NON_STATES');
  for (let k = 0; k < RN; k++) {
    const s = state(r, BASES), before = deepCopy(s);
    renders(`fuzz state #${k}`, s);
    assert.deepStrictEqual(s, before, `fuzz state #${k} is unchanged`);
  }
});

// This test must stay the last: it reads what every render above found.
test('the glyph census: every glyph the port draws outside user text was probed, and every probed glyph is drawn', () => {
  assert.ok(census.renders > 20000, `${census.renders} renders`);
  const missing = [...PROBED.keys()].filter((g) => !census.seen.has(g));
  assert.deepEqual(missing, [], 'each probed glyph occurs in some render (an unused one would be a stale entry)');
});
