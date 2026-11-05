// The totem (src/hud/totem.ts, SPEC §0.13, 1.2.0): the limit resets you declare, drawn as the Totem of Undying. Span for
// span against the design's own rows (test/reference/round10/: the picks totem-idol, last-mark and call-pop-gold, drawn
// again with the owner's two amendments: centred alone, shifted beside its mark, never a count) through the real HUD path
// in the media rig's sandbox (renderPayload with the sandbox's files, the situation's totems declared and a seeded
// shown-file); every row of the design's behaviour matrix (v12-totem.md 2.8) through renderPayload with in-memory
// sources; by hand on the marks' rules, the shown-file's input, the idol's two forms and every shape the layer must leave
// as it is; the bytes at both depths; the glyphs; and against the tests' own layer (test/hud/totem-oracle.ts, written
// from the rules, cluster by cluster) on the reference states, the time-lapse and seeded fuzz states x seeded grants x
// hud.totem x the 5 fable ids, with the invariants that with no totem held nothing differs from hud.totem off and that
// nothing depends on how many resets are held beyond one.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { HUD_GLYPHS } from '../../src/cli/glyphs.ts';
import type { Config } from '../../src/config.ts';
import { DEMOS, DEMO_NOW, DEMO_TOTEMS, demoSources } from '../../src/demo.ts';
import { FABLE_IDS, renderHud } from '../../src/hud/fable.ts';
import { frameHud } from '../../src/hud/frame.ts';
import { histSid } from '../../src/hud/history.ts';
import { fromState, type Sit } from '../../src/hud/input.ts';
import { encode } from '../../src/hud/look.ts';
import { DIV, f2Gutter, WELL, WHITE } from '../../src/hud/mix.ts';
import { NO_OFFHAND, offhandHud, offhandMarks, SIDE, YELLOW, type OffhandMarks } from '../../src/hud/offhand.ts';
import { merge, S, splitAt, type Span } from '../../src/hud/spans.ts';
import {
  DYING, EYE, EYES_A, EYES_B, GUTTER, idol, LAST, NO_TOTEM, OFFHAND, shownNow, SLOT5, SPARK, TOTEM, totemHud, totemMarks, windows, WING_L, WING_R,
  type HeldTotems, type TotemMarks,
} from '../../src/hud/totem.ts';
import { cellWidth } from '../../src/hud/wt.ts';
import type { LimitView } from '../../src/limits.ts';
import type { Payload } from '../../src/payload.ts';
import { renderPayload } from '../../src/render.ts';
import { shownPath, stepShown, type ShownFile, type ShownNow } from '../../src/shown.ts';
import type { ExtraView, Sources } from '../../src/state.ts';
import { held, type Refills, type TotemGrant } from '../../src/totems.ts';
import type { UsageFile } from '../../src/usage/file.ts';
import { frameOracle } from '../hud/frame-oracle.ts';
import { mulberry32, offhandFlags, totemGrants, totemState } from '../hud/fuzz.ts';
import { offhandOracle } from '../hud/offhand-oracle.ts';
import { MIX, picked, plain, REF, SESSION, SOURCES, SPEC, STATES, tuples, type RefLines, type RefState } from '../hud/ref.ts';
import { sgrOracle } from '../hud/sgr-oracle.ts';
import { NO_TOTEM_ORACLE, totemMarkOracle, totemOracle, totemPlaceOracle, totemSideOracle, type OracleTotem } from '../hud/totem-oracle.ts';
import { plainDefaults } from '../plain-config.ts';
// the media rig: the sandbox the design's rows were drawn in (scripts/media/rig.mjs, plain JS)
// @ts-expect-error: an .mjs module without types
import { Rig, T0 } from '../../scripts/media/rig.mjs';
// @ts-expect-error: an .mjs module without types
import { normalDay } from '../../scripts/media/scenes/looks.mjs';
import { usagePath } from '../../src/usage/file.ts';
import { acctDir } from '../../src/store.ts';

const text = (l: readonly Span[]): string => l.map((s) => s.t).join('');
/** Cols [from, to) of a line, as spans. */
const cols = (line: readonly Span[], from: number, to: number): Span[] => splitAt(splitAt(line, from)[1], to - from)[0];
const A = WING_L + EYES_A + EYES_A + WING_R, B_LAST = WING_L + EYES_B + WING_R + LAST, B_POP = WING_L + EYES_B + WING_R + SPARK;
const ALL3: Refills = { h5: true, week: true, fable: true }, NONE3: Refills = { h5: false, week: false, fable: false };
const H1 = (refills: Refills = ALL3, lastDay = false): HeldTotems => ({ count: 1, refills, lastDay });

// ---------------------------------------------------------------------------------------------------------------------
// The design's rows (round 10)
// ---------------------------------------------------------------------------------------------------------------------

interface R10Situation {
  id: string; label: string; note: string; extra: boolean;
  inputs: { fiveHourUsedPct: number; weekLeftPct: number; credits: string; totems: { n: number; kind: string; endsInHours: number } };
  ctx: { pop: number | null; until: number };
}
interface R10 {
  note: string; feature: string; id: string; name: string; optionNote: string; title: string; intro: string;
  source: { file: string; sha256: string; option: string; builder: string };
  allowed: Array<[string, number, number]>;
  situations: R10Situation[];
  rows: Array<{ label: string; situation: string; roles: string[]; drawn: { where: string; sides: string | null; pop: boolean; mark: boolean }; lines: RefLines }>;
}
const read = (f: string): R10 => JSON.parse(readFileSync(join(REF, 'round10', `${f}.json`), 'utf8')) as R10;
const SHAPE = read('totem-shape'), LASTDAY = read('totem-lastday'), CALL = read('totem-call');
const R10_ALL = [SHAPE, LASTDAY, CALL].flatMap((d) => d.situations.map((s, i) => ({ d, s, row: d.rows[i]! })));
/** A row's line as spans: U+00A0 back to spaces (Hungerbar prints no-break spaces), no empty attributes, merged. */
const canon = (line: readonly { t: string; fg?: string | null; bg?: string | null; bold?: boolean | null }[]): Span[] =>
  merge(line.map((s) => S(s.t.replace(/ /g, ' '), s.fg ?? null, s.bg ?? null, s.bold ?? null)));
const rowText = (id: string): string => { const r = R10_ALL.find(({ s }) => s.id === id)!.row; return text(canon(r.lines[3]!)); };

test('round 10: the vendored rows are the picks (totem-idol, last-mark, call-pop-gold), the full HUD, drawn with the amendments', () => {
  assert.deepEqual([SHAPE.id, LASTDAY.id, CALL.id], ['totem-idol', 'last-mark', 'call-pop-gold']);
  for (const [f, d] of [['totem-shape', SHAPE], ['totem-lastday', LASTDAY], ['totem-call', CALL]] as const) {
    assert.equal(d.source.option, d.id, f);
    assert.equal(d.source.file, `round10/${f}.json`);
    assert.equal(d.source.builder, 'round10/build-10.mjs');
    assert.equal((SOURCES.files[`round10/${f}.json`]!.originSha256 as Record<string, string>)[`round10/${f}.json`], d.source.sha256, f);
    assert.deepEqual(d.rows.map((r) => r.situation), d.situations.map((s) => s.id), `${f}: a row per situation, in order`);
    assert.match(d.note, /centred in its well \(form A/);
    assert.match(d.note, /no count is ever drawn on the totem/);
  }
  assert.deepEqual(R10_ALL.map(({ s }) => s.id), ['r-safe', 'r-two', 'r-swap', 'r-swap-none', 'r-call', 'r-call-later',
    'l-safe-23h', 'l-two-23h', 'l-swap-23h', 'l-safe-3d', 'l-call-23h', 'c-0', 'c-29', 'c-30', 'c-300', 'c-out', 'c-none']);
  for (const { s, row } of R10_ALL) {
    assert.equal(row.lines.length, 5, s.id);
    for (const l of row.lines) assert.ok(cellWidth(text(canon(l))) <= 110 && !/^\s/u.test(text(canon(l))), s.id);
  }
  // amendment 2: two held draw the cells of one held
  assert.deepEqual(R10_ALL.find(({ s }) => s.id === 'r-two')!.row.lines, R10_ALL.find(({ s }) => s.id === 'r-safe')!.row.lines);
  assert.deepEqual(R10_ALL.find(({ s }) => s.id === 'l-two-23h')!.row.lines, R10_ALL.find(({ s }) => s.id === 'l-safe-23h')!.row.lines);
  // what each row draws on the hotbar line, cols 0-41 (📖 is 2 cells and 2 UTF-16 units, so the slice is by code points)
  const bar = (id: string): string => [...rowText(id)].slice(0, 41).join('');   // cols 0-41
  assert.equal(bar('r-safe'), `v2.1.306  ◆ 50  ▐⛏ Ⅲ ▌📖42 ▄▄ 3      ${A} `);
  assert.equal(bar('r-swap'), `v2.1.306  ${A}  ▐⛏ Ⅲ ▌📖42 ▄▄ 3      ◆ 50 `);
  assert.equal(bar('r-swap-none'), `v2.1.306  ${A}  ▐⛏ Ⅲ ▌📖42 ▄▄ 3           `);
  assert.equal(bar('r-call'), `v2.1.306 ▐${B_POP}▌ ▐⛏ Ⅲ ▌📖42 ▄▄ 3     ▐◆ 45▌`);
  assert.equal(bar('c-30'), `v2.1.306 ▐${A}▌ ▐⛏ Ⅲ ▌📖42 ▄▄ 3     ▐◆ 45▌`);
  assert.equal(bar('l-safe-23h'), `v2.1.306  ◆ 50  ▐⛏ Ⅲ ▌📖42 ▄▄ 3      ${B_LAST} `);
  assert.equal(bar('l-call-23h'), `v2.1.306 ▐${B_LAST}▌ ▐⛏ Ⅲ ▌📖42 ▄▄ 3     ▐◆ 45▌`);
});

/** One sandbox for every row, as build-10.mjs set it up: the normal day, hud.pr on, align left, no name. */
let rig: { env(x?: Record<string, string>): Record<string, string>; setConfig(o: unknown): void; payload(o: unknown): Payload; cache: string; sid: string; transcript: string; dir: string } | null = null;
function sandbox(): NonNullable<typeof rig> {
  if (!rig) {
    rig = new Rig(join(tmpdir(), `hungerbar-totem-${process.pid}`));
    normalDay(rig, { config: { hud: { pr: 'on', align: 'left', user: 'off' } } });
  }
  return rig!;
}
after(() => { if (rig) rmSync(rig.dir, { recursive: true, force: true }); });
const USED: Record<string, number> = { '$50.00 of $50': 0, '$45.80 of $50': 420, '$0.00 of $50': 5000 };

/** A round-10 situation through the real HUD path in the sandbox, hud.totem on or off, with its totems declared and its pop seeded. */
function rigRender(s: R10Situation, totem: 'on' | 'off' = 'on'): NonNullable<ReturnType<typeof renderPayload>['hud']> {
  const x = sandbox(), inp = s.inputs;
  x.setConfig({ network: { usageApi: true, scopedWeekly: true }, hud: { pr: 'on', align: 'left', user: 'off', totem },
    totems: [{ n: inp.totems.n, kind: inp.totems.kind, until: new Date(s.ctx.until * 1000).toISOString() }] });
  const file = usagePath(acctDir(x.env()));
  mkdirSync(dirname(file), { recursive: true });
  const extra = inp.credits === 'no extra usage' ? { enabled: false, usedCents: 0, limitCents: 0, currency: 'USD' } : { enabled: true, usedCents: USED[inp.credits], limitCents: 5000, currency: 'USD' };
  writeFileSync(file, JSON.stringify({ v: 1, at: T0 - 30, extra, scoped: [{ name: 'Fable', pct: 62, resets_at: T0 + 190800 }], lockUntil: 0 }));
  const sp = shownPath(x.cache, histSid(x.sid, x.transcript)!);
  mkdirSync(dirname(sp), { recursive: true });
  const age = s.ctx.pop;
  // a fall seen now: the last render drew one heart; an older one: the pop it fired then
  const seed: ShownFile | null = age === null ? null : age === 0 ? { v: 2, at: T0 - 30, h5: 1, week: 6, fable: null, until: { pop: 0 } }
    : { v: 2, at: T0 - age, h5: 0, week: 6, fable: null, until: { pop: T0 - age + 30 } };
  writeFileSync(sp, seed ? JSON.stringify(seed) : '{}');
  const p = x.payload({ now: T0, h5: { used: inp.fiveHourUsedPct, reset: 17340 }, week: { used: 100 - inp.weekLeftPct, reset: 345540 } });
  const r = renderPayload(JSON.stringify(p), { env: x.env({ HUNGERBAR_NOW: String(T0), COLUMNS: '120' }), now: T0 });
  assert.ok(r.hud, s.id);
  return r.hud;
}

test('round 10: through the real HUD path in the design\'s sandbox (the files, the adapter, the engine, every layer, the shown-file\'s step, the frame) each row span for span', () => {
  for (const { s, row } of R10_ALL) {
    const h = rigRender(s);
    assert.deepEqual(h.framed.map(canon), row.lines.map(canon), s.id);
    const want: TotemMarks = { at: row.drawn.where === 'waiting' ? 'slot5' : row.drawn.where === 'suggestion' ? 'offhand' : 'call', mark: row.drawn.pop ? 'pop' : row.drawn.mark ? 'last' : null };
    assert.deepEqual(h.totem, want, `${s.id}: the marks`);
  }
});

test('round 10: with hud.totem off every row is 1.1.0\'s totem-off HUD, and the rows differ from it only inside the feature\'s cells', () => {
  const ROLE = ['top', 'hearts', 'xp', 'hot', 'edge'];
  for (const { d, s, row } of R10_ALL) {
    const off = rigRender(s, 'off');
    assert.deepEqual(off.totem, NO_TOTEM, s.id);
    const cellsOf = (l: Span[]): string[] => l.flatMap((sp) => [...sp.t].flatMap((g) => [JSON.stringify([g, sp.fg ?? null, sp.bg ?? null, !!sp.bold]), ...Array<string>(cellWidth(g) - 1).fill('')]));
    row.lines.forEach((l, i) => {
      const a = cellsOf(canon(l)), b = cellsOf(off.framed[i]!);
      for (let c = 0; c < Math.max(a.length, b.length); c++) {
        if (a[c] === b[c]) continue;
        assert.ok(d.allowed.some(([r, x, y]) => r === ROLE[i] && c >= x && c < y), `${s.id}: ${ROLE[i]} cell ${c} changed`);
      }
    });
  }
});

test('the README\'s totem sample is the hotbar line of the round-10 rows r-safe, r-swap and r-call', () => {
  const readme = readFileSync(join(REF, '..', '..', 'README.md'), 'utf8').replace(/\r\n/g, '\n');
  const block = /\n### The totem: your limit resets\n[\s\S]*?```\n([\s\S]*?)\n```/.exec(readme);
  assert.ok(block, 'README has the totem sample');
  assert.deepEqual(block[1]!.split('\n'), ['r-safe', 'r-swap', 'r-call'].map(rowText));
});

// ---------------------------------------------------------------------------------------------------------------------
// The behaviour matrix (v12-totem.md 2.8), through renderPayload with in-memory sources
// ---------------------------------------------------------------------------------------------------------------------

interface M {
  id: string;
  /** The grants: n and kind (full), ending in `ends` seconds (20 days by default; null none). */
  totems?: Array<{ n?: number; kind?: TotemGrant['kind']; ends?: number | null }>;
  /** Credits: dollars left of $50 (or of `limit`), null no extra usage; stale: fetched 2 hours ago. */
  credits?: number | null; limit?: number; stale?: boolean;
  /** % left; null: none (Ultra's 5-hour window). */
  h5?: number | null; week?: number;
  /** last-known (~) limits. */
  dim?: boolean;
  /** The pop: the window fell at this render ('now'), this many seconds ago, or not seen live (none). */
  pop?: 'now' | number;
  /** Fable in use (its weekly % left), or Opus in use with Fable's weekly at this % left. */
  fable?: number; opusFable?: number;
  hud?: Partial<Config['hud']>; scopedWeekly?: boolean; bed?: boolean; env?: Record<string, string>;
  /** Slot 5 and the offhand, cols 36-41 and 9-14, as text; the offhand null when there is none. */
  slot5: string; off: string | null;
  /** The sides' colours: slot 5's (grey or green) and the offhand's (grey, green or gold). */
  s5Side?: 'grey' | 'green'; offSide?: 'grey' | 'green' | 'gold';
}
const COL = { grey: SIDE, green: '#17DD62', gold: TOTEM } as const;
const E50 = ' ◆ 50 ', E45 = '▐◆ 45▌', EMPTY = '      ', T_ = ` ${A} `, T_LAST = ` ${B_LAST} `, T_POP = ` ${B_POP} `;
const G = (t: string): string => `▐${t.slice(1, -1)}▌`;
const ONE: NonNullable<M["totems"]> = [{}], DAY = 86400;
const MATRIX: M[] = [
  { id: '1', totems: [], credits: null, h5: 98, slot5: EMPTY, off: null },
  { id: '2', totems: [], credits: 50, h5: 98, slot5: EMPTY, off: E50, offSide: 'grey' },
  { id: '3', totems: [], credits: 50, h5: 7, slot5: EMPTY, off: E50, offSide: 'grey' },
  { id: '4', totems: [], credits: 45.8, h5: 0, pop: 'now', slot5: EMPTY, off: E45, offSide: 'green' },
  { id: '5', totems: [], credits: 0, h5: 0, slot5: EMPTY, off: EMPTY, offSide: 'grey' },
  { id: '6', credits: null, h5: 98, slot5: T_, off: null },
  { id: '7', credits: 50, h5: 98, slot5: T_, off: E50, offSide: 'grey' },
  { id: '8', totems: [{ n: 2 }], credits: 50, h5: 98, slot5: T_, off: E50, offSide: 'grey' },
  { id: '9', credits: 50, h5: 11, slot5: T_, off: E50, offSide: 'grey' },
  { id: '10', credits: 50, h5: 10, slot5: E50, off: T_, s5Side: 'grey', offSide: 'grey' },
  { id: '11', credits: 50, h5: 1, slot5: E50, off: T_, offSide: 'grey' },
  { id: '12', credits: 50, h5: 98, week: 7, slot5: E50, off: T_, offSide: 'grey' },
  { id: '13', credits: null, h5: 7, slot5: EMPTY, off: T_, offSide: 'grey' },
  { id: '14', credits: 250, limit: 250, h5: 7, slot5: ' ◆250 ', off: T_, offSide: 'grey' },
  { id: '15', credits: 50, stale: true, h5: 7, slot5: E50, off: T_, offSide: 'grey' },
  { id: '16', credits: 0.4, h5: 7, slot5: EMPTY, off: T_, offSide: 'grey' },
  { id: '17', credits: 45.8, h5: 0, pop: 'now', slot5: E45, off: G(T_POP), s5Side: 'green', offSide: 'gold' },
  { id: '18', credits: 45.8, h5: 0, pop: 29, slot5: E45, off: G(T_POP), s5Side: 'green', offSide: 'gold' },
  { id: '19', credits: 45.8, h5: 0, pop: 30, slot5: E45, off: G(T_), s5Side: 'green', offSide: 'gold' },
  { id: '20', credits: 45.8, h5: 0, slot5: E45, off: G(T_), s5Side: 'green', offSide: 'gold' },
  { id: '21', credits: 0, h5: 0, pop: 'now', slot5: EMPTY, off: G(T_POP), s5Side: 'grey', offSide: 'gold' },
  { id: '22', credits: null, h5: 0, pop: 'now', slot5: EMPTY, off: G(T_POP), offSide: 'gold' },
  { id: '23', totems: [{ n: 2 }], credits: 45.8, h5: 0, pop: 30, slot5: E45, off: G(T_), s5Side: 'green', offSide: 'gold' },
  { id: '24', totems: [{ kind: '5h' }], credits: 50, h5: 98, week: 7, slot5: T_, off: E50, offSide: 'grey' },
  { id: '25', totems: [{ kind: '5h' }], credits: 50, h5: 7, slot5: E50, off: T_, offSide: 'grey' },
  { id: '26', totems: [{ kind: 'week' }], credits: 50, h5: 7, slot5: T_, off: E50, offSide: 'grey' },
  { id: '27', totems: [{ kind: 'week' }], credits: 50, h5: 98, week: 0, pop: 'now', slot5: G(E50), off: G(T_POP), s5Side: 'green', offSide: 'gold' },
  { id: '28', totems: [{ kind: '5h' }], credits: 45, h5: 98, week: 0, slot5: T_, off: G(' ◆ 45 '), offSide: 'green' },
  { id: '29', totems: [{ kind: '5h' }, { kind: 'week' }], credits: 50, h5: 7, slot5: E50, off: T_, offSide: 'grey' },
  { id: '30', totems: [{ ends: -1 }], credits: 50, h5: 7, slot5: EMPTY, off: E50, offSide: 'grey' },
  { id: '31', totems: [{ ends: 23 * 3600 }], credits: 50, h5: 98, slot5: T_LAST, off: E50, offSide: 'grey' },
  { id: '32', totems: [{ ends: 25 * 3600 }], credits: 50, h5: 98, slot5: T_, off: E50, offSide: 'grey' },
  { id: '33', totems: [{ ends: 23 * 3600 }], credits: 45.8, h5: 0, pop: 30, slot5: E45, off: G(T_LAST), s5Side: 'green', offSide: 'gold' },
  { id: '33a', totems: [{ ends: 23 * 3600 }], credits: 45.8, h5: 0, pop: 'now', slot5: E45, off: G(T_POP), s5Side: 'green', offSide: 'gold' },
  { id: '34', credits: 50, h5: 7, dim: true, slot5: E50, off: T_, offSide: 'grey' },
  { id: '35', credits: 50, h5: 0, dim: true, pop: 'now', slot5: G(E50), off: G(T_), s5Side: 'green', offSide: 'gold' },
  { id: '36', credits: 50, h5: null, week: 7, slot5: E50, off: T_, offSide: 'grey' },
  { id: '37', totems: [{ kind: '5h' }], credits: 50, h5: null, week: 60, slot5: T_, off: E50, offSide: 'grey' },
  { id: '38', credits: 50, h5: 7, hud: { totem: 'off' }, slot5: EMPTY, off: E50, offSide: 'grey' },
  { id: '39', credits: 50, h5: 7, fable: 60, slot5: E50, off: T_, offSide: 'grey' },
  { id: '39a', credits: 50, h5: 98, fable: 7, slot5: E50, off: T_, offSide: 'grey' },
  { id: '39b', totems: [{ kind: 'fable' }], credits: 50, h5: 98, fable: 0, pop: 'now', slot5: E50, off: G(T_POP), s5Side: 'grey', offSide: 'gold' },
  { id: '39c', credits: 50, h5: 98, opusFable: 5, slot5: T_, off: E50, offSide: 'grey' },
  { id: '39d', totems: [{ kind: 'week' }], credits: 50, h5: 98, fable: 5, slot5: T_, off: E50, offSide: 'grey' },
  { id: '39e', totems: [{ kind: 'fable' }], credits: 50, h5: 98, fable: 5, scopedWeekly: false, slot5: T_, off: E50, offSide: 'grey' },
  { id: '40', credits: 50, h5: 7, bed: true, slot5: E50, off: T_, offSide: 'grey' },
  { id: '41', credits: 50, h5: 7, hud: { align: 'center' }, env: { COLUMNS: '120' }, slot5: E50, off: T_, offSide: 'grey' },
  { id: '43', credits: 50, h5: 7, hud: {}, env: { FORCE_COLOR: '2' }, slot5: E50, off: T_, offSide: 'grey' },
  { id: '44', totems: [{ n: 99 }, { n: 21, kind: 'week' }], credits: 50, h5: 98, slot5: T_, off: E50, offSide: 'grey' },
];

const viewOf = (left: number | null, dim: boolean): LimitView | null => (left === null ? null : { pct: 100 - left, left: 3900, dim });
/** The grants a matrix row declares, at DEMO_NOW. */
const grantsOf = (m: M): TotemGrant[] => (m.totems ?? ONE).map((g) => ({ n: g.n ?? 1, kind: g.kind ?? 'full', until: g.ends === null ? null : DEMO_NOW + (g.ends ?? 20 * DAY), at: null, label: null }));
/** The shown-file a row's pop stepped from: one lit icon in every window at the last render, or the pop that fired `pop` s ago. */
function seedOf(m: M): ShownFile | null {
  if (m.pop === undefined) return null;
  if (m.pop === 'now') return { v: 2, at: DEMO_NOW - 30, h5: 1, week: 1, fable: 1, until: { pop: 0 } };
  return { v: 2, at: DEMO_NOW - m.pop, h5: 0, week: 0, fable: 0, until: { pop: DEMO_NOW - m.pop + 30 } };
}
/** The sources a row renders from: the demo's normal day with its limits, credits, Fable, totems, shown-file and transcript. */
function matrixSources(m: M, asked: ShownNow[]): (p: Payload, cfg: Config, now: number) => Sources {
  const { status: _s, op: _o, ...git } = DEMOS.normal!.git;
  const fable = m.fable ?? m.opusFable;
  const usage: UsageFile = {
    v: 1, at: DEMO_NOW - (m.stale ? 7200 : 30), lockUntil: 0,
    extra: { enabled: true, usedCents: Math.round(((m.limit ?? 50) - (m.credits ?? 50)) * 100), limitCents: (m.limit ?? 50) * 100, currency: 'USD' },
    scoped: fable === undefined ? [] : [{ name: 'Fable', pct: 100 - fable, resets_at: DEMO_NOW + 190800 }],
  };
  return (p, cfg, now) => ({
    ...demoSources(DEMOS.normal!)(p, cfg, now),
    git: () => ({ ...git }),
    limits: () => ({ h5: viewOf(m.h5 === undefined ? 98 : m.h5, !!m.dim), week: viewOf(m.week ?? 60, false), h5None: m.h5 === null }),
    usage: () => (m.credits === null ? { ...usage, extra: null } : usage),
    history: () => null,
    transcript: () => (m.bed ? { hitRatio: null, lastCached: null, lastUsage: null, lastModel: null, lastEffort: null, turns: 42, compactions: 0, lastAt: now - 600, running: false,
      needsWorker: false, ultra: false, agentAt: null, agents: null } : null),
    totems: () => grantsOf(m),
    shown: (c) => { asked.push(c); return stepShown(seedOf(m), now, c).next.until.pop; },
  });
}
const matrixCfg = (m: M): Config => {
  const d = plainDefaults();
  return { ...d, look: 'hud', hud: { ...d.hud, fable: 'boss', bed: m.bed ? 'on' : 'off', ...m.hud }, network: { ...d.network, usageApi: true, scopedWeekly: m.scopedWeekly ?? true } };
};
function runMatrix(m: M, grants?: TotemGrant[]): { r: ReturnType<typeof renderPayload>; asked: ShownNow[] } {
  const asked: ShownNow[] = [];
  const { prompt_cache: pc, ...rest } = DEMOS.normal!.payload;
  // the bed: no prompt cache, whose expiry would say the last request was a moment ago
  const day: Payload = m.bed ? rest : { ...rest, prompt_cache: pc ?? null };
  const payload = m.fable !== undefined ? { ...day, model: { id: 'claude-fable-5-1', display_name: 'Fable 5.1' } } : day;
  const src = matrixSources(m, asked);
  const r = renderPayload(JSON.stringify(payload), {
    env: { FORCE_COLOR: '3', ...m.env }, config: matrixCfg(m), now: DEMO_NOW,
    sources: grants ? (p, cfg, now) => ({ ...src(p, cfg, now), totems: () => grants }) : src,
  });
  return { r, asked };
}
const sideOf = (line: readonly Span[], col: number): string | undefined => { const c = cols(line, col, col + 1)[0]!; return c.fg ?? c.bg; };

test('the behaviour matrix (v12-totem.md 2.8): every row\'s slot 5, offhand and sides through the HUD path', () => {
  assert.equal(MATRIX.length, 49, '51 rows but 42 (by hand below) and 45 (the classic resets item, a later slice)');
  for (const m of MATRIX) {
    const { r, asked } = runMatrix(m);
    const h = r.hud!, hot = h.framed[h.framed.length - 2]!;
    assert.equal(text(cols(hot, 36, 42)), m.slot5, `${m.id}: slot 5 ${JSON.stringify(h.totem)}`);
    const off = cols(hot, 9, 15);
    if (m.off === null) assert.ok(!off.some((s) => s.bg), `${m.id}: no offhand`);
    else assert.equal(text(off), m.off, `${m.id}: the offhand`);
    if (m.offSide) assert.equal(sideOf(hot, 9), COL[m.offSide], `${m.id}: the offhand's sides`);
    assert.equal(sideOf(hot, 36), COL[m.s5Side ?? 'grey'], `${m.id}: slot 5's sides`);
    // the frame's offhand edges follow its sides
    if (m.offSide) assert.equal(cols(h.framed[h.framed.length - 1]!, 9, 10)[0]!.fg, COL[m.offSide], `${m.id}: the bottom edge`);
    // the shown-file is asked only while a reset is held with hud.totem on
    const holds = held(grantsOf(m), DEMO_NOW).count > 0 && (m.hud?.totem ?? 'on') === 'on';
    assert.equal(asked.length, holds ? 1 : 0, `${m.id}: the shown-file asked`);
    // never a count: every grant's n at 1 or at 99 draws the same bytes
    if (holds) for (const n of [1, 99]) assert.equal(runMatrix(m, grantsOf(m).map((g) => ({ ...g, n }))).r.text, r.text, `${m.id}: n = ${n}`);
  }
  // 39: six lines (the boss bar), the hotbar still the engine's last; 41: centred; 43: the 256-colour bytes
  assert.equal(runMatrix(MATRIX.find((m) => m.id === '39')!).r.hud!.framed.length, 6);
  const c = runMatrix(MATRIX.find((m) => m.id === '41')!).r;
  assert.ok(c.hud!.offset > 0 && c.text.split('\n')[0]!.startsWith('⠀'.repeat(c.hud!.offset)), 'centred');
  const b = runMatrix(MATRIX.find((m) => m.id === '43')!).r;
  assert.equal(b.text, sgrOracle(b.hud!.framed as RefLines, { depth: '256' }).replace(/ /g, ' '));
  // 40: the bed in slot 4 beside the emerald in slot 5
  const bed = runMatrix(MATRIX.find((m) => m.id === '40')!).r.hud!;
  assert.equal(bed.player.bed, true);
  assert.equal(text(cols(bed.framed[bed.framed.length - 2]!, 32, 36)), '\u{1FB84}'.repeat(4));
});

// ---------------------------------------------------------------------------------------------------------------------
// By hand: the marks
// ---------------------------------------------------------------------------------------------------------------------

const NORMAL: RefState = STATES.normal;
const st = (over: Partial<RefState>): RefState => ({ ...NORMAL, ...over });
const sitOf = (over: Partial<RefState>): Sit => fromState(st(over));
const H = (used: number): Partial<RefState> => ({ h5: { used, left: 3900, window: 18000 } });
const WK = (used: number): Partial<RefState> => ({ week: { used, left: 345540 } });
const FABLE_IN_USE = (used: number): Partial<RefState> => ({ model: 'Fable 5.1', scoped: [{ name: 'Fable', used, left: 9000 }] });
const on = { totem: 'on' } as const;

test('the constants: the gold and the eyes, the idol\'s glyphs, the 10% band, the columns', () => {
  assert.deepEqual([TOTEM, EYE, WING_L, WING_R, EYES_A, EYES_B, SPARK, LAST, DYING, OFFHAND, SLOT5, GUTTER],
    ['#FFC83D', '#3BD16F', '\u{1FB0C}', '\u{1FB0D}', '•', '¨', '✦', '!', 10, [9, 15], [36, 42], [0, 16]]);
  assert.deepEqual(NO_TOTEM, { at: null, mark: null });
});

test('idol: form A alone, centred over the 4 cells; form B beside the last day\'s ! or the pop\'s ✦, shifted left', () => {
  assert.deepEqual(idol(null), [S(WING_L, TOTEM, WELL), S('••', EYE, TOTEM, true), S(WING_R, TOTEM, WELL)]);
  assert.deepEqual(idol('last'), [S(WING_L, TOTEM, WELL), S('¨', EYE, TOTEM, true), S(WING_R, TOTEM, WELL), S('!', YELLOW, WELL, true)]);
  assert.deepEqual(idol('pop'), [S(WING_L, TOTEM, WELL), S('¨', EYE, TOTEM, true), S(WING_R, TOTEM, WELL), S('✦', WHITE, WELL)]);
  for (const m of [null, 'last', 'pop'] as const) assert.equal(idol(m).reduce((w, s) => w + cellWidth(s.t), 0), 4);
  // form A is mirror-symmetric: the wings on the well's two sides, an eye on each side of its centre line
  const a = idol(null);
  assert.equal(a[0]!.t.codePointAt(0)! + 1, a[2]!.t.codePointAt(0)!, 'sextant-134 and sextant-234: the same wing, mirrored');
  // from A to B: the left wing stays, the face keeps its gold with the eyes redrawn, the right wing moves left
  assert.deepEqual([idol(null)[0], idol(null)[2]], [idol('last')[0], idol('last')[2]]);
});

test('windows: the 5-hour window, the week, and Fable\'s weekly only while Fable is in use', () => {
  assert.deepEqual(windows(sitOf({})), { h5: 98, week: 18, fable: null });
  assert.deepEqual(windows(sitOf({ h5: null, week: null })), { h5: null, week: null, fable: null });
  assert.deepEqual(windows(sitOf(FABLE_IN_USE(93))), { h5: 98, week: 18, fable: 7 });
  assert.deepEqual(windows(sitOf({ scoped: [{ name: 'Fable', used: 93, left: 9000 }] })), { h5: 98, week: 18, fable: null }, 'Opus in use');
});

test('totemMarks: none without a reset or with hud.totem off; the call, the suggestion, waiting; the pop in the call only; the last day\'s mark', () => {
  const at = (over: Partial<RefState>, h: HeldTotems = H1(), pop = 0): TotemMarks => totemMarks(DEMO_NOW, on, h, sitOf(over), pop);
  assert.deepEqual(totemMarks(DEMO_NOW, { totem: 'off' }, H1(), sitOf(H(93)), 0), NO_TOTEM);
  assert.deepEqual(at(H(93), { ...H1(), count: 0 }), NO_TOTEM, 'none held');
  assert.deepEqual(at({ ...H(2), ...WK(40) }), { at: 'slot5', mark: null });
  assert.deepEqual(at({ ...H(89), ...WK(40) }), { at: 'slot5', mark: null }, '11% is not dying');
  assert.deepEqual(at({ ...H(90), ...WK(40) }), { at: 'offhand', mark: null }, '10%');
  assert.deepEqual(at({ ...H(99.9), ...WK(40) }), { at: 'offhand', mark: null }, '1% (99.9 used reads 0.1)');
  assert.deepEqual(at({ ...H(100), ...WK(95) }), { at: 'call', mark: null }, 'the call wins over the suggestion');
  assert.deepEqual(at({ ...H(105), ...WK(40) }), { at: 'call', mark: null }, 'past the limit');
  assert.deepEqual(at(H(100), H1(), DEMO_NOW + 1), { at: 'call', mark: 'pop' });
  assert.deepEqual(at(H(100), H1(), DEMO_NOW), { at: 'call', mark: null }, 'the pop is over at until.pop');
  assert.deepEqual(at(H(100), H1(ALL3, true), DEMO_NOW + 1), { at: 'call', mark: 'pop' }, 'the pop takes the mark\'s cell');
  assert.deepEqual(at(H(100), H1(ALL3, true), 0), { at: 'call', mark: 'last' });
  assert.deepEqual(at({ ...H(2), ...WK(40) }, H1(ALL3, true), DEMO_NOW + 5), { at: 'slot5', mark: 'last' }, 'a pop shows only in the call');
  assert.deepEqual(at(H(93), H1(ALL3, true)), { at: 'offhand', mark: 'last' });
  // kinds: only the windows a held reset refills move it
  const five = H1({ h5: true, week: false, fable: false }), week = H1({ h5: false, week: true, fable: false }), fab = H1({ h5: false, week: false, fable: true });
  assert.deepEqual([at({ ...H(2), ...WK(95) }, five).at, at(H(93), five).at, at(H(93), week).at, at({ ...H(2), ...WK(100) }, five).at], ['slot5', 'offhand', 'slot5', 'slot5']);
  assert.deepEqual([at(FABLE_IN_USE(93), fab).at, at(FABLE_IN_USE(100), fab).at, at(FABLE_IN_USE(93), week).at, at({ scoped: [{ name: 'Fable', used: 100, left: 9 }] }, fab).at],
    ['offhand', 'call', 'slot5', 'slot5']);
  assert.deepEqual(at(H(93), H1(NONE3)), { at: 'slot5', mark: null }, 'refilling nothing it can see');
  assert.deepEqual(at({ h5: null, week: null }, H1()), { at: 'slot5', mark: null }, 'no window known');
  // held from the grants: the count, not n, matters
  assert.deepEqual(at(H(93), held([{ n: 99, kind: 'full', until: null, at: null, label: null }], DEMO_NOW)), at(H(93), held([{ n: 1, kind: 'full', until: null, at: null, label: null }], DEMO_NOW)));
});

test('shownNow: the live windows\' lit icons, Fable\'s while in use from a fresh usage.json, and the windows the resets refill', () => {
  const v = (dim: boolean): LimitView => ({ pct: 0, left: null, dim });
  const live = { now: DEMO_NOW, h5: v(false), week: v(false), scopedAt: DEMO_NOW - 30 };
  assert.deepEqual(shownNow(live, sitOf({}), ALL3), { h5: 10, week: 2, fable: null, refills: ALL3 });
  assert.deepEqual(shownNow(live, sitOf({ ...H(99.5), ...WK(100), ...FABLE_IN_USE(95) }), NONE3), { h5: 1, week: 0, fable: 1, refills: NONE3 });
  assert.deepEqual(shownNow({ ...live, scopedAt: DEMO_NOW - 900 }, sitOf(FABLE_IN_USE(100)), ALL3).fable, 0, '900 s is fresh');
  assert.deepEqual(shownNow({ ...live, scopedAt: DEMO_NOW - 901 }, sitOf(FABLE_IN_USE(100)), ALL3).fable, null, 'older: not kept');
  assert.deepEqual(shownNow({ ...live, scopedAt: null }, sitOf(FABLE_IN_USE(100)), ALL3).fable, null, 'no usage.json');
  assert.deepEqual(shownNow({ ...live, h5: v(true), week: v(true) }, sitOf({}), ALL3), { h5: null, week: null, fable: null, refills: ALL3 }, 'last-known: not kept');
  assert.deepEqual(shownNow({ ...live, h5: null, week: null }, sitOf({ h5: null, week: null }), ALL3), { h5: null, week: null, fable: null, refills: ALL3 });
  assert.deepEqual(shownNow(live, sitOf({ h5: null, week: null }), ALL3), { h5: null, week: null, fable: null, refills: ALL3 }, 'a view the engine reads as none');
  const r = { ...ALL3 }, got = shownNow(live, sitOf({}), r);
  assert.notEqual(got.refills, r, 'a copy');
});

test('the pop through the HUD path: fired by a refilled window\'s 1 → 0, shown until until.pop - 1, never for a window no reset refills', () => {
  const base: M = { id: 'pop', credits: 45.8, h5: 0, slot5: E45, off: null };
  const at = (now: number, seed: ShownFile | null, kind: TotemGrant['kind'] = 'full'): string => {
    const r = renderPayload(JSON.stringify(DEMOS.normal!.payload), {
      env: { FORCE_COLOR: '3' }, config: matrixCfg(base), now,
      sources: (p, cfg, n) => ({ ...matrixSources({ ...base, totems: [{ kind }] }, [])(p, cfg, n), shown: (c) => stepShown(seed, n, c).next.until.pop }),
    });
    const f = r.hud!.framed;
    return text(cols(f[f.length - 2]!, 9, 15));
  };
  const fired: ShownFile = { v: 2, at: DEMO_NOW, h5: 0, week: 6, fable: null, until: { pop: DEMO_NOW + 30 } };
  assert.equal(at(DEMO_NOW + 29, fired), G(T_POP));
  assert.equal(at(DEMO_NOW + 30, fired), G(T_), 'call-pop-gold: the gold stays and the idol re-centres');
  assert.equal(at(DEMO_NOW + 10, { ...fired, h5: 1, until: { pop: 0 } }), G(T_POP), 'fired by this render');
  assert.equal(at(DEMO_NOW + 10, { ...fired, h5: 0, until: { pop: 0 } }), G(T_), 'already at 0: no pop');
  assert.equal(at(DEMO_NOW + 10, null), G(T_), 'no shown-file: no pop');
  assert.equal(at(DEMO_NOW + 10, { ...fired, h5: 1, until: { pop: 0 } }, 'week'), E45, 'a weekly reset: no call, no pop for the 5-hour window');
});

// ---------------------------------------------------------------------------------------------------------------------
// By hand: the shapes the layer leaves as they are
// ---------------------------------------------------------------------------------------------------------------------

test('totemHud: nothing held, no lines, or cells not of the shapes it expects: the lines as they are (a copy)', () => {
  const em = (over: Partial<RefState>): OffhandMarks => offhandMarks({ now: DEMO_NOW, extra: null }, sitOf(over));
  const draw = (lines: Span[][], m: TotemMarks, over: Partial<RefState> = {}): Span[][] => totemHud(lines, m, em(over), sitOf(over));
  const same = (lines: Span[][], m: TotemMarks, over: Partial<RefState>, what: string): void => {
    const got = draw(lines, m, over);
    assert.deepEqual(got, lines, what);
    got.forEach((l, i) => assert.notEqual(l, lines[i], `${what}: line ${i} is a copy`));
  };
  const eng = offhandHud(renderHud(NORMAL, 'off'), em({}));
  same(eng, NO_TOTEM, {}, 'nothing held');
  assert.deepEqual(draw([], { at: 'slot5', mark: null }), []);
  // a hand-built hotbar line: the engine's gutter (with or without the offhand), slots 1-4 and slot 5
  const OFF = [DIV, S('◆ ', '#17DD62', WELL), S('50', WHITE, WELL, true), DIV];
  const PLAIN5 = [DIV, S('    ', null, WELL), DIV];
  const L = (gut: Span[], s5: Span[] = PLAIN5): Span[][] => [[S('x')], [...gut, S(' '.repeat(20), null, WELL), ...s5, S(' ')]];
  const withOff = (off: Span[] = OFF): Span[] => [S('v2.1.306', '#555555'), S(' '), ...off, S(' ')];
  assert.equal(text(cols(draw(L(withOff()), { at: 'slot5', mark: null })[1]!, 36, 42)), T_, 'the hand-built line is the engine\'s shape');
  assert.equal(text(cols(draw(L(withOff()), { at: 'offhand', mark: null }, H(93))[1]!, 9, 15)), T_);
  // slot 5: only the plain empty well between the frame grey's sides takes the totem or the emerald
  for (const [what, s5] of [
    ['an item in it', [DIV, S('⛏ ', '#17DD62', WELL), S('  ', null, WELL), DIV]],
    ['another well colour', [DIV, S('    ', null, '#000000'), DIV]],
    ['a gold side', [S('▐', TOTEM, SIDE), S('    ', null, WELL), DIV]],
    ['a wide glyph in it', [DIV, S('日'), S('  ', null, WELL), DIV]],
  ] as Array<[string, Span[]]>) {
    same(L(withOff(), s5), { at: 'slot5', mark: null }, {}, `waiting: ${what}`);
    same(L(withOff(), s5), { at: 'offhand', mark: null }, H(93), `the suggestion: ${what}`);
  }
  // a wide glyph across col 36 or col 42: slot 5 is left as it is
  const across36: Span[][] = [[S('x')], [...withOff(), S(' '.repeat(19), null, WELL), S('日', null, WELL), S('   ', null, WELL), DIV, S(' ')]];
  same(across36, { at: 'slot5', mark: null }, {}, 'across col 36');
  same(across36, { at: 'call', mark: null }, H(100), 'across col 36, the call');
  // the offhand: only exactly what the offhand layer drew for these credits
  for (const [what, off] of [
    ['another count', [DIV, S('◆ ', '#17DD62', WELL), S('49', WHITE, WELL, true), DIV]],
    ['green sides while not paying', [S('▐', '#17DD62', SIDE), ...OFF.slice(1, 3), S('▌', '#17DD62', SIDE)]],
  ] as Array<[string, Span[]]>) same(L(withOff(off)), { at: 'offhand', mark: null }, H(93), what);
  same([[S('x')], [S('v2.1.30', '#555555'), S(' '), S('日', null, SIDE), ...OFF.slice(1), S(' ')]], { at: 'offhand', mark: null }, H(93), 'a wide glyph across col 9');
  // no extra-usage limit: only the engine's own gutter (cols 0-15) gives way to the offhand
  const noX = { ...H(93), extra: null }, gut = f2Gutter(sitOf(noX));
  assert.equal(text(cols(draw(L(gut), { at: 'offhand', mark: null }, noX)[1]!, 0, 16)), `v2.1.306 ${T_} `);
  same(L([S('v2.1.307', '#555555'), S(' '.repeat(8))]), { at: 'offhand', mark: null }, noX, 'another version');
  same(L([S('v2.1.306', '#555555'), S(' '.repeat(7)), S('日')]), { at: 'offhand', mark: null }, noX, 'a wide glyph across col 16');
});

// ---------------------------------------------------------------------------------------------------------------------
// Bytes and glyphs
// ---------------------------------------------------------------------------------------------------------------------

test('bytes: every round-10 row at 24-bit and 256 colours is the independent encoder\'s', () => {
  for (const { s, row } of R10_ALL) {
    const lines = row.lines.map(canon);
    for (const depth of ['truecolor', '256'] as const) assert.equal(encode(lines, depth, { bold: true, nbsp: true }), sgrOracle(lines as RefLines, { depth }), `${s.id} ${depth}`);
  }
  const bytes = (id: string): string => encode(R10_ALL.find(({ s }) => s.id === id)!.row.lines.map(canon), 'truecolor', { bold: true, nbsp: false });
  assert.ok(bytes('r-safe').includes(`\x1b[38;2;255;200;61;48;2;32;30;7m${WING_L}\x1b[0m\x1b[1;38;2;59;209;111;48;2;255;200;61m••\x1b[0m\x1b[38;2;255;200;61;48;2;32;30;7m${WING_R}\x1b[0m`), 'form A');
  assert.ok(bytes('l-safe-23h').includes(`\x1b[1;38;2;59;209;111;48;2;255;200;61m¨\x1b[0m\x1b[38;2;255;200;61;48;2;32;30;7m${WING_R}\x1b[0m\x1b[1;38;2;255;255;85;48;2;32;30;7m!\x1b[0m`), 'form B, the mark');
  assert.ok(bytes('r-call').includes(`\x1b[38;2;255;200;61;48;2;93;93;93m▐\x1b[0m`), 'the gold side');
});

test('glyphs: the idol\'s four code points, ! and ✦ are 1 cell and on glyphs --hud; ☥ is gone from the HUD; every glyph the rows add is listed', () => {
  const list = new Map(HUD_GLYPHS);
  for (const g of [WING_L, WING_R, EYES_A, EYES_B, LAST, SPARK]) {
    assert.equal(cellWidth(g), 1, g);
    assert.match(list.get(g) ?? '', /totem/, g);
  }
  assert.ok(!list.has('☥'), 'the ankh is not drawn by the HUD since 1.2.0');
  const added = new Set(R10_ALL.flatMap(({ row }) => { const l = canon(row.lines[3]!); return [...text(cols(l, 9, 15)) + text(cols(l, 36, 42))]; }).filter((g) => g !== ' ' && !/[0-9]/.test(g)));
  assert.deepEqual([...added].sort(), ['!', '¨', '•', '▌', '▐', '◆', '✦', WING_L, WING_R].sort());
  for (const g of added) assert.ok(list.has(g), g);
});

// ---------------------------------------------------------------------------------------------------------------------
// Against the tests' own layer
// ---------------------------------------------------------------------------------------------------------------------

function* inputs(): Generator<[string, unknown]> {
  for (const [k, s] of Object.entries(STATES)) yield [`states.${k}`, s];
  for (const [k, s] of Object.entries(SPEC.round7.situations)) yield [`round7.${k}`, s.state];
  for (let i = 0; i < SESSION.frames.length; i += 11) yield [`frame ${i}`, SESSION.frames[i]];
  const r = mulberry32(0x7073);
  const bases = [...Object.values(STATES), ...Object.values(SPEC.round7.situations).map((s) => s.state)];
  for (let k = 0; k < 400; k++) yield [`fuzz state #${k}`, totemState(r, bases)];
}
const xv = (at: number): ExtraView => ({ used: 0, limit: 50, currency: 'USD', pct: 0, at });
/** Credits with only the share used (1.2.2): the emerald's count is the % left, and moves to slot 5 as it is. */
const SHARE: ExtraView = { used: null, limit: null, currency: 'USD', pct: 63, at: null };

test('the layer equals the tests\' layer on the reference states, the time-lapse and fuzz, x seeded grants x hud.totem x the 5 fable ids; no totem is hud.totem off; n never matters', () => {
  const r = mulberry32(0x1d01);
  const n = { slot5: 0, offhand: 0, call: 0, pop: 0, last: 0, appears: 0, none: 0 };
  for (const [what, state] of inputs()) {
    for (const id of FABLE_IDS) {
      const grants = totemGrants(r, DEMO_NOW), totem = r() < 0.85 ? 'on' : 'off', pop = r() < 0.4 ? DEMO_NOW + 5 : 0, f = offhandFlags(r);
      const stale = f.stale && !f.pct, pct = f.pct;
      const sit = fromState(state), h = held(grants as TotemGrant[], DEMO_NOW);
      const em = offhandMarks({ now: DEMO_NOW, extra: pct ? SHARE : xv(stale ? DEMO_NOW - 901 : DEMO_NOW - 30) }, sit);
      const tm = totemMarks(DEMO_NOW, { totem }, h, sit, pop);
      const eng = renderHud(state, id), layered = offhandHud(eng, em);
      const got = frameHud(totemHud(layered, tm, em, sit));
      const o: OracleTotem = totem === 'on' && h.count > 0 ? { held: true, refills: h.refills, lastDay: h.lastDay, pop: pop > DEMO_NOW } : NO_TOTEM_ORACLE;
      const base = offhandOracle(MIX.render(state, picked(`fable-${id}`)), state, { stale, pct });
      const want = frameOracle(totemOracle(base, state, o), state, totemSideOracle(state, o));
      assert.deepEqual(tuples(got as RefLines), plain(tuples(want)), `${what} ${id} ${JSON.stringify({ grants, totem, pop, stale, pct })}`);
      assert.equal(tm.at, totemPlaceOracle(state, o), `${what}: where`);
      assert.equal(tm.mark, totemMarkOracle(state, o), `${what}: the mark`);
      for (const l of got) assert.ok(cellWidth(text(l)) <= 110 && !/^\s/u.test(text(l)), `${what} ${id}: ${cellWidth(text(l))} cells`);
      // no totem held (or hud.totem off): hud.totem off's bytes; and n never changes a cell
      if (tm.at === null) { assert.deepEqual(got, frameHud(layered), `${what}: nothing drawn`); n.none++; }
      else {
        n[tm.at]++;
        if (tm.mark) n[tm.mark]++;
        if (tm.at !== 'slot5' && em.cash === null) n.appears++;
        for (const k of [1, 99]) {
          const hk = held((grants as TotemGrant[]).map((g) => ({ ...g, n: k })), DEMO_NOW);
          assert.deepEqual(totemHud(layered, totemMarks(DEMO_NOW, { totem }, hk, sit, pop), em, sit), totemHud(layered, tm, em, sit), `${what}: n = ${k}`);
        }
      }
    }
  }
  assert.ok(n.slot5 > 300 && n.offhand > 100 && n.call > 100 && n.pop > 30 && n.last > 100 && n.appears > 20 && n.none > 300, JSON.stringify(n));
});

test('the golden cases: hud-totem-two (2 held) is byte for byte hud-totem-safe (1 held) in every mode', () => {
  const G = join(REF, '..', 'golden');
  for (const ext of ['ansi', 'txt', 'nocolor.txt', 'ascii.txt', 'w60.txt', 'w60c.ansi', 'w100c.ansi']) {
    assert.equal(readFileSync(join(G, `hud-totem-two.${ext}`), 'utf8'), readFileSync(join(G, `hud-totem-safe.${ext}`), 'utf8'), ext);
  }
  assert.ok(readFileSync(join(G, 'hud-totem-safe.txt'), 'utf8').includes(A), 'the idol, centred, alone');
});

test('NO_TOTEM_ORACLE: the tests\' layer with nothing held is its input; the demo\'s grant is one full reset 20 days on', () => {
  const lines = MIX.render(NORMAL, picked('fable-off'));
  assert.deepEqual(plain(totemOracle(lines, NORMAL, NO_TOTEM_ORACLE)), plain(lines));
  assert.deepEqual(totemOracle([], NORMAL, { ...NO_TOTEM_ORACLE, held: true, refills: ALL3 }), []);
  assert.equal(totemSideOracle(st({ extra: null }), NO_TOTEM_ORACLE), null);
  assert.deepEqual(DEMO_TOTEMS, [{ n: 1, kind: 'full', until: DEMO_NOW + 20 * DAY, at: null, label: null }]);
  assert.deepEqual(NO_OFFHAND.cash, null);
  void T0;
});
