import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { bgParams, detectDepth, fgParams, paint, to256 } from '../../src/color.ts';
import { applyEnv, defaults, fableId, HUD_ALIGNS, HUD_FABLES, HUD_OPS, HUD_PRS, HUD_SWITCHES, HUD_USERS, loadConfig, merge, prEnabled, usageEnabled } from '../../src/config.ts';
import { FABLE_IDS } from '../../src/hud/fable.ts';

test('merge keeps defaults for wrong types and drops unknown items', () => {
  const c = merge({ icons: 'emoji', bold: 'yes', bar: { width: 3 }, thresholds: { warn: 60, crit: 50 }, lines: [['model', 'nope', 'cwd'], 'x', ['version']], extra: 1 });
  assert.equal(c.icons, 'minecraft');
  assert.equal(c.bold, true);
  assert.equal(c.bar.width, 16);
  assert.deepEqual(c.thresholds, { warn: 60, crit: 60 });
  assert.deepEqual(c.lines, [['model', 'cwd'], ['version']]);
});

test('env wins over the file', () => {
  const c = applyEnv(defaults(), { HUNGERBAR_ICONS: 'unicode' });
  assert.equal(c.icons, 'unicode');
  assert.equal(applyEnv(defaults(), { TERM: 'dumb' }).icons, 'ascii');
  assert.equal(applyEnv(defaults(), { HUNGERBAR_ASCII: '1', HUNGERBAR_ICONS: 'unicode' }).icons, 'ascii');
  const u = applyEnv(defaults(), { HUNGERBAR_USAGE_API: '1' });
  assert.equal(usageEnabled(u, {}), true);
  assert.equal(usageEnabled(u, { HUNGERBAR_OFFLINE: '1' }), false);
  assert.equal(usageEnabled(u, { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }), false);
  assert.equal(usageEnabled(defaults(), {}), false);
});

test('loadConfig: missing file is defaults, invalid JSON is defaults plus an error, a BOM is fine', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hb-cfg-'));
  try {
    const path = join(dir, 'hungerbar.json');
    assert.equal(loadConfig({ HUNGERBAR_CONFIG: path }).error, null);
    writeFileSync(path, '{ "icons": "ascii", }');
    const bad = loadConfig({ HUNGERBAR_CONFIG: path });
    assert.ok(bad.error);
    assert.equal(bad.cfg.icons, 'minecraft');
    writeFileSync(path, '﻿{ "icons": "unicode", "network": { "usageApi": true } }');
    const good = loadConfig({ HUNGERBAR_CONFIG: path });
    assert.equal(good.error, null);
    assert.equal(good.cfg.icons, 'unicode');
    assert.equal(good.cfg.network.usageApi, true);
    assert.equal(loadConfig({ CLAUDE_CONFIG_DIR: dir }).cfg.icons, 'unicode');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('colour depth: NO_COLOR, FORCE_COLOR, config, then the terminal', () => {
  assert.equal(detectDepth('auto', 'auto', { NO_COLOR: '1', FORCE_COLOR: '3' }), 'none');
  assert.equal(detectDepth('always', 'auto', { NO_COLOR: '' }), '256');
  assert.equal(detectDepth('auto', 'auto', { FORCE_COLOR: '0' }), 'none');
  assert.equal(detectDepth('auto', 'auto', { FORCE_COLOR: '1' }), '16');
  assert.equal(detectDepth('auto', '256', { FORCE_COLOR: '' }), '256');
  assert.equal(detectDepth('auto', 'auto', { FORCE_COLOR: '2' }), '256');
  assert.equal(detectDepth('auto', '16', { FORCE_COLOR: '3' }), 'truecolor');
  assert.equal(detectDepth('never', 'auto', {}), 'none');
  assert.equal(detectDepth('auto', '16', { WT_SESSION: 'x' }), '16');
  assert.equal(detectDepth('auto', 'auto', { WT_SESSION: 'x' }), 'truecolor');
  assert.equal(detectDepth('auto', 'auto', { COLORTERM: 'truecolor' }), 'truecolor');
  assert.equal(detectDepth('auto', 'auto', { TERM_PROGRAM: 'vscode' }), 'truecolor');
  assert.equal(detectDepth('auto', 'auto', { TERM: 'xterm' }), '256');
});

test('SGR encoding', () => {
  assert.equal(fgParams('#FFAA00', 'truecolor'), '38;2;255;170;0');
  assert.equal(fgParams('#FFAA00', '16'), '33');
  assert.equal(fgParams('#3f3f3f', '16'), '90');
  assert.equal(to256('#000000'), 16);
  assert.equal(to256('#FFFFFF'), 231);
  assert.equal(to256('#555555'), 240);
  assert.equal(to256('#FF5555'), 203);
  assert.equal(paint('x', { role: 'model', bold: true }, 'truecolor'), '\x1b[1;38;2;255;170;0mx\x1b[0m');
  assert.equal(paint('x', { role: 'label' }, '16'), '\x1b[37mx\x1b[0m');
  assert.equal(paint('x', { role: 'model', dim: true }, '256'), '\x1b[2;38;5;214mx\x1b[0m');
  assert.equal(paint('x', { role: 'model', bold: true }, 'none'), 'x');
  assert.equal(paint('', { role: 'model' }, 'truecolor'), '');
});

test('the defaults are the chosen setup, with what uses the network off (SPEC §0.10)', () => {
  // the chosen hungerbar.json: look hud, boss, centre, the name, gold, the PR status, bed and phantoms on, the usage API with scopedWeekly
  const chosen = merge({ look: 'hud', hud: { fable: 'boss', align: 'center', pr: 'on', user: 'user', op: 'gold', bed: 'on', phantoms: 'on' }, network: { usageApi: true, scopedWeekly: true } });
  const d = defaults();
  assert.deepEqual({ ...d, hud: { ...d.hud, pr: 'on' }, network: { ...d.network, usageApi: true, scopedWeekly: true } }, chosen, 'the chosen setup, but for the network');
  assert.equal(d.look, 'hud');
  assert.deepEqual(d.hud, { fable: 'boss', minWidth: 80, align: 'center', pr: 'off', user: 'user', op: 'gold', bed: 'on', phantoms: 'on' });
  // never on by themselves: the usage API (with the user's Claude login), scopedWeekly and the PR status (through gh)
  assert.deepEqual([d.network.usageApi, d.network.scopedWeekly, d.hud.pr], [false, false, 'off']);
  assert.deepEqual(merge({}), d, 'no hungerbar.json, or an empty one: the defaults');
  assert.equal(usageEnabled(d, {}), false);
  assert.equal(prEnabled(d, {}), false);
});

test('look and hud: defaults, merge, the fable- prefix, minWidth 62..200', () => {
  assert.deepEqual(HUD_FABLES, FABLE_IDS, "config's fable ids are the port's");
  assert.equal(merge({ look: 'classic' }).look, 'classic');
  for (const look of ['HUD', 'minecraft', 'Classic', 1, null, ['classic']]) assert.equal(merge({ look }).look, 'hud', String(look));
  for (const id of HUD_FABLES) {
    assert.equal(merge({ hud: { fable: id } }).hud.fable, id);
    assert.equal(merge({ hud: { fable: `fable-${id}` } }).hud.fable, id, 'the engine id works too');
  }
  // an absent hud.fable is the default, boss; one that is there but no option is off
  assert.equal(merge({ hud: {} }).hud.fable, 'boss');
  for (const v of ['mount', 'fable-mount', 'Boss', 'fable-fable-boss', 'fable-', '', ' boss', 3, true, null, {}]) {
    assert.equal(fableId(v), 'off', String(v));
    assert.equal(merge({ hud: { fable: v } }).hud.fable, 'off', String(v));
  }
  for (const [v, want] of [[62, 62], [200, 200], [120, 120], [61, 80], [201, 80], [100.5, 80], ['100', 80], [-1, 80]] as const)
    assert.equal(merge({ hud: { minWidth: v } }).hud.minWidth, want, String(v));
  assert.deepEqual(merge({ look: 'hud', hud: { fable: 'fable-tail', minWidth: 96, extra: 1 } }).hud, { fable: 'tail', minWidth: 96, align: 'center', pr: 'off', user: 'user', op: 'gold', bed: 'on', phantoms: 'on' });
  assert.deepEqual(merge({ hud: { fable: 'off', align: 'left', user: 'off', op: 'tag' } }).hud, { fable: 'off', minWidth: 80, align: 'left', pr: 'off', user: 'off', op: 'tag', bed: 'on', phantoms: 'on' }, 'the defaults before §0.10, set');
  for (const hud of ['boss', ['boss'], null, 7]) assert.deepEqual(merge({ look: 'hud', hud }).hud, defaults().hud, JSON.stringify(hud));
});

test('HUNGERBAR_LOOK wins over the file; other values are ignored', () => {
  assert.equal(applyEnv(merge({ look: 'classic' }), { HUNGERBAR_LOOK: 'hud' }).look, 'hud');
  assert.equal(applyEnv(merge({}), { HUNGERBAR_LOOK: 'classic' }).look, 'classic');
  assert.equal(applyEnv(merge({ look: 'hud' }), { HUNGERBAR_LOOK: 'classic' }).look, 'classic');
  for (const v of ['HUD', '1', '', 'yes', undefined]) assert.equal(applyEnv(merge({ look: 'classic' }), { HUNGERBAR_LOOK: v }).look, 'classic', String(v));
  const dir = mkdtempSync(join(tmpdir(), 'hb-cfg-'));
  try {
    const path = join(dir, 'hungerbar.json');
    writeFileSync(path, JSON.stringify({ $schema: 'x', network: { usageApi: true }, look: 'hud', hud: { fable: 'tail', minWidth: 90 } }));
    const c = loadConfig({ HUNGERBAR_CONFIG: path }).cfg;
    assert.equal(c.look, 'hud');
    assert.deepEqual(c.hud, { fable: 'tail', minWidth: 90, align: 'center', pr: 'off', user: 'user', op: 'gold', bed: 'on', phantoms: 'on' });
    assert.equal(loadConfig({ HUNGERBAR_CONFIG: path, HUNGERBAR_LOOK: 'classic' }).cfg.look, 'classic');
    writeFileSync(path, '{ "look": "hud" ');
    const bad = loadConfig({ HUNGERBAR_CONFIG: path, HUNGERBAR_LOOK: 'hud' });
    assert.ok(bad.error, 'an invalid file stays an error (the gate then draws classic with cfg!)');
    assert.equal(bad.cfg.look, 'hud');
    assert.deepEqual(bad.cfg.hud, defaults().hud);
    // an invalid file never turns on what uses the network (SPEC §0.10)
    assert.deepEqual([bad.cfg.network.usageApi, bad.cfg.network.scopedWeekly, bad.cfg.hud.pr], [false, false, 'off']);
    assert.equal(usageEnabled(bad.cfg, {}), false);
    assert.equal(prEnabled(bad.cfg, {}), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('hud.align: left or center (the default); anything else is center; HUNGERBAR_HUD_ALIGN wins over the file', () => {
  assert.deepEqual(HUD_ALIGNS, ['left', 'center']);
  assert.equal(merge({ hud: { align: 'center' } }).hud.align, 'center');
  assert.equal(merge({ hud: { align: 'left', fable: 'boss' } }).hud.align, 'left');
  for (const align of ['centre', 'Left', 'right', '', 1, null, true, ['left'], {}]) assert.equal(merge({ hud: { align } }).hud.align, 'center', JSON.stringify(align));
  assert.equal(applyEnv(merge({ hud: { align: 'left' } }), { HUNGERBAR_HUD_ALIGN: 'center' }).hud.align, 'center');
  assert.equal(applyEnv(merge({}), { HUNGERBAR_HUD_ALIGN: 'left' }).hud.align, 'left');
  assert.equal(applyEnv(merge({ hud: { align: 'center' } }), { HUNGERBAR_HUD_ALIGN: 'left' }).hud.align, 'left');
  for (const v of ['LEFT', 'centre', 'right', '', '1', undefined]) assert.equal(applyEnv(merge({ hud: { align: 'left' } }), { HUNGERBAR_HUD_ALIGN: v }).hud.align, 'left', String(v));
  const dir = mkdtempSync(join(tmpdir(), 'hb-cfg-'));
  try {
    const path = join(dir, 'hungerbar.json');
    writeFileSync(path, JSON.stringify({ look: 'hud', hud: { fable: 'boss', align: 'center' } }));
    assert.deepEqual(loadConfig({ HUNGERBAR_CONFIG: path }).cfg.hud, { fable: 'boss', minWidth: 80, align: 'center', pr: 'off', user: 'user', op: 'gold', bed: 'on', phantoms: 'on' });
    assert.equal(loadConfig({ HUNGERBAR_CONFIG: path, HUNGERBAR_HUD_ALIGN: 'left' }).cfg.hud.align, 'left');
    assert.equal(loadConfig({ HUNGERBAR_CONFIG: join(dir, 'none.json') }).cfg.hud.align, 'center', 'no file: the default');
    assert.equal(loadConfig({ HUNGERBAR_CONFIG: join(dir, 'none.json'), HUNGERBAR_HUD_ALIGN: 'left' }).cfg.hud.align, 'left', 'no file');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('schema.json has every config key, and look and hud as config.ts reads them', () => {
  const schema = JSON.parse(readFileSync(new URL('../../schema.json', import.meta.url), 'utf8'));
  for (const k of Object.keys(defaults())) assert.ok(k in schema.properties, `schema.json has ${k}`);
  assert.deepEqual(schema.properties.look.enum, ['classic', 'hud']);
  assert.equal(schema.properties.look.default, defaults().look);
  const hud = schema.properties.hud.properties;
  assert.deepEqual(hud.fable.enum, [...HUD_FABLES, ...HUD_FABLES.map((id) => `fable-${id}`)]);
  assert.equal(hud.fable.default, defaults().hud.fable);
  assert.deepEqual([hud.minWidth.type, hud.minWidth.minimum, hud.minWidth.maximum, hud.minWidth.default], ['integer', 62, 200, defaults().hud.minWidth]);
  assert.deepEqual([hud.align.enum, hud.align.default], [[...HUD_ALIGNS], defaults().hud.align]);
  assert.deepEqual([hud.pr.enum, hud.pr.default], [[...HUD_PRS], defaults().hud.pr]);
  assert.deepEqual([hud.user.enum, hud.user.default], [[...HUD_USERS], defaults().hud.user]);
  assert.deepEqual([hud.op.enum, hud.op.default], [[...HUD_OPS], defaults().hud.op]);
  assert.deepEqual([hud.bed.enum, hud.bed.default], [[...HUD_SWITCHES], defaults().hud.bed]);
  assert.deepEqual([hud.phantoms.enum, hud.phantoms.default], [[...HUD_SWITCHES], defaults().hud.phantoms]);
  assert.deepEqual(Object.keys(hud).sort(), Object.keys(defaults().hud).sort(), 'every hud key');
});

test('bgParams: the HUD background at 24-bit and 256 colours', () => {
  assert.equal(bgParams('#FFAA00', 'truecolor'), '48;2;255;170;0');
  assert.equal(bgParams('#FFAA00', '256'), '48;5;' + to256('#FFAA00'));
  assert.equal(bgParams('#3f3f3f', '256'), '48;5;238');
});
