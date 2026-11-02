'use strict';
// Design round 9C: the pickaxe's material follows the model's tier, in Minecraft's tool-tier words (a fixed mapping:
// Fable netherite, Opus diamond, Sonnet iron, Haiku gold, any other model stone). With build.cjs's machinery (required,
// so every rule it checks holds here too). Writes pickaxe.json (feature "pickaxe"), hungerbar-picker-9c.html and
// MANIFEST-9c.json.   node build-9c.cjs [--show]
// What 1.0 draws today (src/hud/mix.ts L20 and L185, hud4.js's TIER): the pickaxe '⛏ ' in hotbar slot 1 (cols 17-18) takes
// TIER[family] (Opus #55FFFF, Fable #9D8F8F, Sonnet #D8D8D8, Haiku #8F8F8F, anything else GREY #AAAAAA) on the effort's
// glint; the numeral (cols 19-20) is the enchant pink #FF55FF, bold. In the colour icon style ⛏ is a Segoe UI Emoji
// glyph, which ignores the ink: there every model's pickaxe looks the same, and only Plain icons show the tier.
const B = require('./build.cjs');
const { S, state, cells, join, CW, textOf, MAXW, GREY } = B;

// ---------- the tier inks and their contrast ----------
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (h) => { const n = parseInt(h.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const GLINT = { high: '#2E1A3A', max: '#48205C' }, MINT = '#D5E8D0', ENCH = '#FF55FF';
const TODAY = { Fable: '#9D8F8F', Opus: '#55FFFF', Sonnet: '#D8D8D8', Haiku: '#8F8F8F', other: GREY };
// Netherite is dark brownish grey in the game (#4C4148), which has 1.6:1 on the Ⅲ glint and 1.3:1 on the Ⅴ glint: it
// vanishes. #857579 is the darkest of that hue with about 3:1 on the Ⅴ glint (3.6:1 on Ⅲ), still well darker than 1.0's #9D8F8F.
const TIER = { Fable: ['netherite', '#857579'], Opus: ['diamond', '#55FFFF'], Sonnet: ['iron', '#C6C6C6'], Haiku: ['gold', '#FFAA00'], other: ['stone', GREY] };
const family = (model) => { const k = /(?:^|[^a-z])(opus|fable|sonnet|haiku)(?![a-z])/i.exec(String(model)); return k ? k[1][0].toUpperCase() + k[1].slice(1).toLowerCase() : 'other'; };
const inkOf = (model) => TIER[family(model)][1];
const NUMERALS = 'ⅠⅡⅢⅣⅤ';

// ---------- the layer: hotbar slot 1's pickaxe (cols 17-18), and with `full` its numeral (cols 19-20) ----------
function tiers(full) {
  return (ed, sit) => {
    const ink = inkOf(sit.model);
    ed('hot', (cs) => {
      if (!cs[17] || cs[17].t !== '⛏' || !cs[18] || cs[18].t !== ' ') throw new Error('no pickaxe at col 17');
      for (const c of [17, 18]) cs[c] = { ...cs[c], fg: ink };
      if (full) {
        if (!cs[19] || !NUMERALS.includes(cs[19].t)) throw new Error('no numeral at col 19');
        for (const c of [19, 20]) cs[c] = { ...cs[c], fg: ink };
      }
    });
  };
}
const fmt = (x) => x.toFixed(1) + ':1';
const pState = (model, effort, patch = {}) => state({ model, effort, ...patch });
const MODELS = [['Fable 5.1', 'Fable'], ['Opus 5.5', 'Opus'], ['Sonnet 4.5', 'Sonnet'], ['Haiku 4.5', 'Haiku'], ['Codex', 'other']];
const PICKAXE = {
  key: 'pickaxe',
  title: 'The pickaxe\'s material follows the model',
  intro: 'Minecraft tools come in tiers: stone, iron, gold, diamond, netherite. Here the pickaxe in hotbar slot 1 takes the tier of the model in use: Fable netherite, Opus diamond, Sonnet iron, Haiku gold (the fastest tool and the quickest to wear out), and any other model stone. ' +
    'What 1.0 draws today (src/hud/mix.ts, TIER): Opus #55FFFF, Fable #9D8F8F, Sonnet #D8D8D8, Haiku #8F8F8F and any other model #AAAAAA, with the effort numeral in the enchant pink #FF55FF. ' +
    'So Opus is already diamond and an unknown model already stone; the visible changes are Haiku (grey to gold), Fable (a darker netherite #857579) and Sonnet (#D8D8D8 to iron #C6C6C6, barely). ' +
    'Important: with colour icons ⛏ is a colour emoji that ignores Hungerbar\'s colours, so the pickaxe looks the same for every model there, today and in these options. Only Plain icons show its tier; the numeral (Yu Gothic UI) takes the colour in both styles.',
  focus: ['boss', 'hot', 'edge', 'lineup'], diffStyle: 'plain',
  allowed: [['hot', 17, 21]],
  situations: [
    { id: 'p-fable', label: 'Fable in use, effort max (Ⅴ): the boss bar, 6 lines', note: 'Netherite on the deepest glint (#48205C): the hardest case to read.',
      state: pState('Fable 5.1', 'max', { scoped: [{ name: 'Fable', used: 35, left: 345600 }] }) },
    { id: 'p-opus', label: 'Opus 5.5, effort high (Ⅲ)', note: 'Diamond: the same aqua as today.', state: pState('Opus 5.5', 'high') },
    { id: 'p-sonnet', label: 'Sonnet 4.5, effort high (Ⅲ)', note: 'Iron.', state: pState('Sonnet 4.5', 'high') },
    { id: 'p-haiku', label: 'Haiku 4.5, effort high (Ⅲ)', note: 'Gold.', state: pState('Haiku 4.5', 'high') },
    { id: 'p-codex', label: 'An unknown model, "Codex", effort high (Ⅲ)', note: 'Stone: the grey every unknown model gets today.', state: pState('Codex', 'high') },
    { id: 'p-lineup', label: 'All five side by side (look at the Plain icons view)', note: 'Hotbar slot 1 of each model at effort Ⅲ, cut from its own HUD: Fable, Opus, Sonnet, Haiku, Codex. With colour icons they all look alike; that is the point of this row.',
      lineup: MODELS },
  ],
  options: [
    { id: 'pick-tiers', name: 'The pickaxe takes its tier', recommended: true,
      optionNote: 'Only the ⛏ changes colour; the effort numeral keeps its enchant pink, so slot 1 reads "netherite pickaxe, Efficiency Ⅴ". ' +
        `Contrast on the glint behind it: netherite ${fmt(contrast(TIER.Fable[1], GLINT.high))} at Ⅲ and ${fmt(contrast(TIER.Fable[1], GLINT.max))} at Ⅴ (the weakest, readable but dim); gold ${fmt(contrast(TIER.Haiku[1], GLINT.high))}; iron ${fmt(contrast(TIER.Sonnet[1], GLINT.high))}. ` +
        `Nearby: iron, like today's Sonnet and Opus inks, is as pale as the mint selection frame right beside it (${fmt(contrast(TIER.Sonnet[1], MINT))}), so the pickaxe and the frame's edge run together a little; gold against the pink numeral is two strong colours side by side but never confusable. ` +
        'Visible only with Plain icons.',
      layer: tiers(false) },
    { id: 'pick-tiers-full', name: 'Pickaxe and numeral take the tier',
      optionNote: 'The ⛏ and the effort numeral both take the tier ink, so the change shows with colour icons too (through the numeral). ' +
        `The cost: the numeral loses the enchant pink that says "enchantment level", and a netherite Ⅴ is the dimmest text on the line (${fmt(contrast(TIER.Fable[1], GLINT.max))} on its glint). ` +
        'Diamond and stone numerals look like ordinary text, and the purple glint behind them is then the only sign of the effort.',
      layer: tiers(true) },
    { id: 'pick-today', name: 'Today (1.0)', today: true,
      optionNote: 'What 1.0 draws: Opus #55FFFF, Fable #9D8F8F, Sonnet #D8D8D8, Haiku #8F8F8F, anything else #AAAAAA, visible only with Plain icons; the numeral always pink.',
      layer() {} },
  ],
};

// ---------- build: the five engine situations through build.cjs, then the lineup row from their own cells ----------
const rendered = { ...PICKAXE, situations: PICKAXE.situations.filter((s) => !s.lineup) };
const doc = B.buildFeature(rendered, { builder: 'build-9c.cjs', round: '9c' });
const lineupSit = PICKAXE.situations.find((s) => s.lineup);
// the lineup's slots are cut from renders at effort high (Ⅲ) for every model, so the five compare evenly
const lineupDoc = B.buildFeature({ ...PICKAXE, key: 'pickaxe-lineup', file: '_lineup', situations: MODELS.map(([m]) => ({ id: m, label: m, note: '', state: pState(m, 'high', m.startsWith('Fable') ? { scoped: [{ name: 'Fable', used: 35, left: 345600 }] } : {}) })) },
  { builder: 'build-9c.cjs', round: '9c' });
require('fs').unlinkSync(require('path').join(B.DIR, '_lineup.json'));
for (const o of doc.options) {
  const src = lineupDoc.options.find((x) => x.id === o.id).rows;
  const parts = [];
  src.forEach((r, i) => {
    const hot = r.lines[r.roles.indexOf('hot')];
    const slot = cells(hot).slice(16, 22);
    if (slot[0].t !== '▐' || slot[5].t !== '▌') throw new Error('lineup: slot 1 is not at cols 16-21');
    parts.push(...slot, ...cells([S(' ' + (MODELS[i][1] === 'other' ? 'Codex' : MODELS[i][1]) + (i < MODELS.length - 1 ? '   ' : ''), GREY)]));
  });
  const line = join(parts);
  const t = textOf(line);
  if (t[0] === ' ' || CW(t) > MAXW) throw new Error('lineup line breaks a rule');
  o.situations.push(lineupSit.id);
  o.rows.push({ label: lineupSit.label, situation: lineupSit.id, roles: ['lineup'], lines: [line] });
}
doc.situations.push({ id: lineupSit.id, label: lineupSit.label, note: lineupSit.note, state: null, ctx: { lineup: MODELS.map(([m]) => m) } });
const fs = require('fs'), path = require('path');
fs.writeFileSync(path.join(B.DIR, 'pickaxe.json'), JSON.stringify(doc, null, 1) + '\n', 'utf8');
console.log(`pickaxe.json: ${doc.options.length} options x ${doc.situations.length} situations = ${doc.options.length * doc.situations.length} rows (with the lineup)`);
console.log('inks:', Object.entries(TIER).map(([f, [n, c]]) => `${f} ${n} ${c} (today ${TODAY[f]}) Ⅲ ${fmt(contrast(c, GLINT.high))} Ⅴ ${fmt(contrast(c, GLINT.max))} mint ${fmt(contrast(c, MINT))}`).join(' | '));

const ROUND4 = 'Round-4 probe: Segoe UI Emoji in colour (a colour glyph: it ignores our colour; 1 cell, ink 0.21-2.13); Segoe UI Symbol in plain (our colour, 1 cell, ink 0.13-1.58). Already probed: nothing new here.';
const YU = 'hud4.js / src/hud/mix.ts: Yu Gothic UI in both styles, monochrome (takes our colour), 1 cell; its ink runs into the next cell (Ⅳ by 0.57), which 1.0 keeps blank. Already probed: nothing new here.';
B.writePicker([doc], {
  probe: B.probeOf(['⛏', 'Ⅲ', 'Ⅴ'], {
    '⛏': ['the pickaxe (hotbar slot 1)', ROUND4, { colour: 'a colour emoji about 2.3 cells wide in a 1-cell slot, in the terminal too; 1.0 draws it as "⛏ " so the cell after it stays blank for the overhang.', plain: 'Segoe UI Symbol\'s ⛏ is about 1.7 cells wide (ink to 1.58 in the terminal too); the same blank cell after it takes the overhang.' }],
    'Ⅲ': ['the effort numeral (high)', YU, { colour: 'Yu Gothic UI\'s numeral is wider than one cell; 1.0 draws it as "Ⅲ " so its ink has the blank cell after it.', plain: 'the same in both styles: 1.0 keeps the cell after it blank.' }],
    'Ⅴ': ['the effort numeral (max)', YU, { colour: 'as Ⅲ: 1.0 keeps the cell after it blank.', plain: 'as Ⅲ: 1.0 keeps the cell after it blank.' }],
  }),
  html: 'hungerbar-picker-9c.html', round: '9c', storageKey: 'hungerbar-picker-r9c', summaryTitle: 'Hungerbar round 9C: my pick',
  title: 'Hungerbar Round 9C', h1: 'Hungerbar · round 9C',
  lede: 'One quick question: should the <b>pickaxe\'s material follow the model</b>, in Minecraft\'s tool tiers? The mapping is fixed; the options are how much of hotbar slot 1 takes the tier colour. Look at the <b>Plain icons</b> views: with colour icons the pickaxe is an emoji and never changes colour.',
  manifest: 'MANIFEST-9c.json', files: ['pickaxe.json', 'build-9c.cjs', 'build.cjs'],
});
