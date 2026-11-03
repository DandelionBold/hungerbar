// The classic `resets` item (SPEC §0.13, 1.2.0): the limit resets you declared, opt-in in `lines`, never in a default
// line. Its words, its colours by the windows a held reset refills, expiry, the demo's source, and fit to width.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { defaults, ITEM_IDS, merge, type Config, type ItemId } from '../../src/config.ts';
import { ASCII, UNICODE, type Glyphs } from '../../src/glyphs.ts';
import { build, defaultOpts } from '../../src/items.ts';
import { STEPS } from '../../src/layout.ts';
import { renderPayload } from '../../src/render.ts';
import { collect, type Sources } from '../../src/state.ts';
import { localStamp, type TotemGrant, type TotemKind } from '../../src/totems.ts';

const NOW = 1792859460, DAY = 86400;
const grant = (n: number, kind: TotemKind, until: number | null): TotemGrant => ({ n, kind, until, at: null, label: null });
const ONE = [grant(1, 'full', NOW + 20 * DAY)];
const date = (sec: number): string => localStamp(sec).slice(0, 10);

interface World { h5?: number | null; week?: number | null; scoped?: Array<{ name: string; pct: number }>; model?: string }
const sources = (w: World, totems?: TotemGrant[]): Sources => ({
  git: () => ({ isRepo: false, branch: null, added: null, removed: null }),
  limits: () => ({
    h5: w.h5 === null ? null : { pct: w.h5 ?? 20, left: 600, dim: false },
    week: w.week === null ? null : { pct: w.week ?? 40, left: 6000, dim: false },
  }),
  usage: () => ({ v: 1, at: NOW - 30, extra: null, scoped: (w.scoped ?? []).map((s) => ({ ...s, resets_at: null })), lockUntil: 0 }),
  transcript: () => null,
  counts: () => ({ turns: 0, compactions: 0 }),
  history: () => null,
  ...(totems ? { totems: () => totems } : {}),
});
const config = (totems: TotemGrant[], lines: ItemId[][] = [['resets']]): Config =>
  ({ ...defaults(), look: 'classic', lines, totems, network: { ...defaults().network, usageApi: true, scopedWeekly: true } });
const payload = (model = 'Opus 5.5'): string => JSON.stringify({ model: { display_name: model } });
const plain = (cfg: Config, w: World = {}, env: Record<string, string> = {}, src?: Sources): string =>
  renderPayload(payload(w.model), { env: { NO_COLOR: '1', ...env }, config: cfg, sources: () => src ?? sources(w), now: NOW }).text.replace(/ /g, ' ');
/** The count's colour at 24 bits: the SGR of the span that holds the count. */
const countColour = (totems: TotemGrant[], w: World): string => {
  const t = renderPayload(payload(w.model), { env: { FORCE_COLOR: '3' }, config: config(totems), sources: () => sources(w), now: NOW }).text;
  return /\x1b\[1;38;2;(\d+;\d+;\d+)m\d+\x1b\[0m/.exec(t)?.[1] ?? 'none';
};
const GOLD = '255;170;0', WARN = '255;255;85', CRIT = '255;85;85';

test('resets is a classic item id, opt-in: in no default line, kept by merge, in schema.json', () => {
  assert.ok((ITEM_IDS as readonly string[]).includes('resets'));
  assert.ok(!defaults().lines.flat().includes('resets'), 'not in the default lines');
  assert.deepEqual(merge({ lines: [['extra', 'resets', 'version']] }).lines, [['extra', 'resets', 'version']]);
  const schema = JSON.parse(readFileSync(new URL('../../schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(schema.properties.lines.items.items.enum, [...ITEM_IDS]);
});

test('the words: the count, the soonest expiry as a local date, ASCII without the glyph', () => {
  assert.equal(plain(config(ONE)), `☥ Limit resets: 1 (use by ${date(NOW + 20 * DAY)})`);
  // the count is the sum over the grants held, whatever their kinds; the date is the soonest end
  const three = [grant(2, 'full', NOW + 20 * DAY), grant(3, 'week', NOW + 5 * DAY), grant(4, '5h', null)];
  assert.equal(plain(config(three)), `☥ Limit resets: 9 (use by ${date(NOW + 5 * DAY)})`);
  assert.equal(plain(config([grant(99, 'full', null), grant(21, 'week', null)])), '☥ Limit resets: 120', 'no cap');
  // no expiry known: no date
  assert.equal(plain(config([grant(1, 'full', null)])), '☥ Limit resets: 1');
  assert.equal(plain({ ...config(ONE), icons: 'ascii' }), `Limit resets: 1 (use by ${date(NOW + 20 * DAY)})`);
  assert.equal(plain({ ...config(ONE), icons: 'unicode' }), `☥ Limit resets: 1 (use by ${date(NOW + 20 * DAY)})`);
});

test('nothing while none is held: no grant, or all expired (at the second)', () => {
  const base = config([], [['limit5h', 'resets']]);
  const without = plain({ ...base, lines: [['limit5h']] });
  assert.equal(plain(base), without);
  assert.equal(plain({ ...base, totems: [grant(1, 'full', NOW)] }), without, 'an until at now is expired');
  assert.equal(plain({ ...base, totems: [grant(1, 'full', NOW + 1)] }), `${without} │ ☥ Limit resets: 1 (use by ${date(NOW + 1)})`);
  // alone on a line with none held, the line is not drawn
  assert.equal(plain(config([], [['model'], ['resets']])), 'Model: Opus 5.5');
});

test("the count's colour: gold, the warn colour while a window a held reset refills is at 1-10% left, crit at 0", () => {
  assert.equal(countColour(ONE, { h5: 20 }), GOLD);
  assert.equal(countColour(ONE, { h5: 89 }), GOLD, '11% left');
  assert.equal(countColour(ONE, { h5: 90 }), WARN, '10% left');
  assert.equal(countColour(ONE, { h5: 99 }), WARN, '1% left');
  assert.equal(countColour(ONE, { h5: 100 }), CRIT, '0% left');
  assert.equal(countColour(ONE, { week: 95 }), WARN, 'the week');
  assert.equal(countColour(ONE, { week: 100 }), CRIT, 'the week used up');
  assert.equal(countColour(ONE, { h5: 95, week: 100 }), CRIT, 'a dead window wins over a dying one');
  assert.equal(countColour(ONE, { h5: 100, week: 95 }), CRIT, 'in either order');
  // kinds: only the windows a held reset refills count
  assert.equal(countColour([grant(1, 'week', null)], { h5: 100 }), GOLD, 'a weekly reset cannot refill the 5-hour window');
  assert.equal(countColour([grant(1, '5h', null)], { week: 100 }), GOLD, 'a 5-hour reset cannot refill the week');
  assert.equal(countColour([grant(1, '5h', null)], { h5: 100 }), CRIT);
  assert.equal(countColour([grant(1, '5h', null), grant(1, 'week', null)], { week: 92 }), WARN, 'either kind held');
  // an expired grant refills nothing
  assert.equal(countColour([grant(1, 'week', NOW - 1), grant(1, '5h', null)], { week: 100 }), GOLD);
  // no 5-hour window (Ultra) and no week: nothing to read
  assert.equal(countColour(ONE, { h5: null, week: null }), GOLD);
  // Fable's weekly counts only while Fable is the model in use, for a full or a fable reset
  const fable: World = { scoped: [{ name: 'Fable', pct: 95 }], model: 'Fable 5.1' };
  assert.equal(countColour(ONE, fable), WARN);
  assert.equal(countColour([grant(1, 'fable', null)], { ...fable, scoped: [{ name: 'Fable', pct: 100 }] }), CRIT);
  assert.equal(countColour([grant(1, 'week', null)], fable), GOLD, "a weekly reset does not refill Fable's");
  assert.equal(countColour(ONE, { ...fable, model: 'Opus 5.5' }), GOLD, "on Opus, Fable's weekly blocks nothing");
});

test("the source: Sources.totems (the demo's) wins over the config's, as in the HUD", () => {
  const cfg = config(ONE);
  assert.equal(plain(cfg, {}, {}, sources({}, [grant(7, 'full', null)])), '☥ Limit resets: 7');
  assert.equal(plain(cfg, {}, {}, sources({}, [])), '');
  assert.deepEqual(collect({}, NOW, cfg, {}, sources({}), false).totems, ONE, "without the source, the config's");
});

test('the short form is the glyph and the count (the words in ASCII), with no date', () => {
  const cfg = config(ONE);
  const st = collect({}, NOW, cfg, {}, sources({}), false);
  const text = (g: Glyphs): string => build('resets', st, cfg, g, { ...defaultOpts(cfg), short: true }).flatMap((p) => p.spans.map((s) => s.t)).join('');
  assert.equal(text(UNICODE), '☥ 1');
  assert.equal(text(ASCII), 'Limit resets 1');
  assert.deepEqual(build('resets', st, cfg, UNICODE, { ...defaultOpts(cfg), drop: new Set(['resets']) }), []);
});

test('fit to width: resets is the first item dropped, before the version', () => {
  assert.deepEqual(STEPS[0]!.ids, ['resets']);
  assert.deepEqual(STEPS[1]!.ids, ['version']);
  const cfg = config(ONE, [['resets', 'version']]);
  const withVersion = JSON.stringify({ model: { display_name: 'Opus 5.5' }, version: '2.1.306' });
  const at = (cols: number): string =>
    renderPayload(withVersion, { env: { NO_COLOR: '1', COLUMNS: String(cols) }, config: cfg, sources: () => sources({}), now: NOW }).text.replace(/ /g, ' ');
  const wide = at(200);
  assert.equal(wide, `☥ Limit resets: 1 (use by ${date(NOW + 20 * DAY)}) │ v2.1.306`);
  assert.equal(at(wide.length + 4), wide, 'fits: nothing dropped');
  assert.equal(at(wide.length + 3), 'v2.1.306', 'one column short: resets goes, the version stays');
});
