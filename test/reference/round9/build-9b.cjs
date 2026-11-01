'use strict';
// Design round 9B: two refinements of the round-9 picks (picks-r9.json), with build.cjs's machinery (required, so every
// rule it checks holds here too). Writes totem-mix.json (feature "totem": where the totem lives), agents-b.json (feature
// "agents": what shows the agents at work), hungerbar-picker-9b.html and MANIFEST-9b.json.
//   node build-9b.cjs [--show]
// In each section the round-9 pick is the baseline ("the current pick"): every other card shows the lines that differ
// from it. Every row still differs from the HUD without the option (engine + shipped layers + frame) only inside the
// feature's own cells.
const B = require('./build.cjs');
const { S, sext, state, write, cells, join, W, inSky, BLANK_CELL, offhandGuard, slot5Guard, holds, dying, payingSit,
  WELL, DIVBG, TOTEM, MAXW, TOTEM_OPT, AGENTS, CASCADIA, SEXT_ALLAY } = { ...B, BLANK_CELL: '⠀' };

// ---------- section 1: the totem's shape ----------
const offhand = TOTEM_OPT.options.find((o) => o.id === 'totem-offhand');
// the week at 60% left in every situation, so only the 5-hour window moves the totem
const tstate = (patch) => state({ week: { used: 40, left: 345540 }, ...patch });
const low = (sit) => [sit.s5_left, sit.wk_left].some((v) => v !== null && v > 10 && v <= 25);
// The mix: the totem waits in hotbar slot 5 (no count; the emerald keeps the offhand and its dollars); a window at
// 1-10% left swaps it into the offhand (☥ + the dollars, totem-offhand's look) and empties slot 5; a window at 0 pops it
// there for 30 s (totem-offhand's pop), then the paying emerald; with the credits out or no extra usage, no totem.
// `ready` adds a step: at 11-25% left slot 5 gets gold half-block sides (the totem is readied) before the swap.
function mix(ready) {
  return (ed, sit, ctx) => {
    if (!holds(sit)) return;
    if (payingSit(sit) || dying(sit)) { offhand.layer(ed, sit, ctx); return; }
    ed('hot', (cs) => {
      slot5Guard(cs);
      if (ready && low(sit)) write(cs, 36, [S('▐', TOTEM, DIVBG), S('☥ ', TOTEM, WELL), S('  ', null, WELL), S('▌', TOTEM, DIVBG)]);
      else write(cs, 37, [S('☥ ', TOTEM, WELL), S('  ', null, WELL)]);
    });
  };
}
const TOTEM_9B = {
  key: 'totem', file: 'totem-mix',
  title: 'Where the totem lives',
  intro: 'The note on the totem from the design chat: "mixing both Totem in the offhand and Totem in hotbar slot 5 so it in hotbar and when needed to use it switch and goes to the offhand". ' +
    'That is how Minecraft players carry a Totem of Undying: one in the hotbar, swapped into the offhand when a fight turns bad. Slot 5 is free now (the allays took the agents\' job), so the totem can wait there. ' +
    'The week is at 60% in every situation below, so only the 5-hour window moves the totem.',
  focus: ['hearts', 'xp', 'hot', 'edge'],
  allowed: [['hot', 9, 15], ['hot', 36, 42], ['xp', 9, 15], ['edge', 9, 15]],
  situations: [
    { id: 't-safe', label: 'Safe: $50 of credits, nothing low', note: '5-hour 98% left, week 60% left.', state: tstate({}), ctx: { pop: null } },
    { id: 't-low', label: '5-hour at 20% left, $50', note: 'Getting low, not dying yet. Only "Swap with a ready step" changes here.',
      state: tstate({ h5: { used: 80, left: 3600, window: 18000 } }), ctx: { pop: null } },
    { id: 't-h5-7', label: '5-hour at 7% left, $50', note: 'One heart left: the window is dying, so the totem goes to the offhand.',
      state: tstate({ h5: { used: 93, left: 2280, window: 18000 } }), ctx: { pop: null } },
    { id: 't-pop', label: 'THE POP: the 5-hour just hit 0, $45.80 left', note: 'The shown file saw the 5-hour go 1% → 0%. The pop lasts 30 seconds.',
      state: tstate({ h5: { used: 100, left: 3900, window: 18000 }, extra: { used: 4.2, limit: 50 } }), ctx: { pop: 0 } },
    { id: 't-after', label: '30 s after the pop', note: 'The credits pay: the green-framed emerald with the dollars left. The totem is used up until the window resets.',
      state: tstate({ h5: { used: 100, left: 3900, window: 18000 }, extra: { used: 4.2, limit: 50 } }), ctx: { pop: 30 } },
    { id: 't-out', label: 'Credits out ($0), the 5-hour at 0', note: 'Nothing left to pay with: no totem anywhere. (1.0 still lights the frame green around the empty well.)',
      state: tstate({ h5: { used: 100, left: 3900, window: 18000 }, extra: { used: 50, limit: 50 } }), ctx: { pop: null } },
    { id: 't-none', label: 'No extra usage, the 5-hour at 7%', note: 'No credits at all: no offhand, no totem.',
      state: tstate({ h5: { used: 93, left: 2280, window: 18000 }, extra: null }), ctx: { pop: null } },
  ],
  options: [
    { id: 'totem-mix', name: 'In the hotbar, swapped to the offhand when needed', recommended: true,
      optionNote: 'The idea from the design chat. While nothing is low the totem waits in hotbar slot 5 (gold ☥, no count), and the emerald keeps the offhand and its dollars. ' +
        'When a window drops to 10% left or less, the totem swaps into the offhand: slot 5 empties and the offhand shows ☥ with your dollars, exactly as "Totem in the offhand" draws it. ' +
        'At 0 it pops there for 30 seconds (☥✦ between gold sides), then the green paying emerald. With the credits out, or no extra usage, there is no totem anywhere. ' +
        'So the totem is always visible while you hold one, and its move to the offhand is the warning.',
      layer: mix(false) },
    { id: 'totem-ready', name: 'Swap, with a ready step',
      optionNote: 'The mix with one more step. At 11-25% left the totem in slot 5 gets gold half-block sides, as if you had picked it up ready to swap; at 10% it moves to the offhand as in the mix. ' +
        'That gives a warning one or two hearts earlier, without any extra symbol: the gold frame is the pop\'s own frame, so it reads as "this is about to be used".',
      layer: mix(true) },
    { id: 'totem-offhand', name: 'Totem in the offhand', baseline: true,
      optionNote: 'The round-9 pick, the baseline: the emerald stays in the offhand until a window is dying, then becomes ☥ with your dollars; the pop happens there. Nothing shows the totem while you are safe.',
      layer: offhand.layer },
  ],
};

// ---------- section 2: the agents' challengers ----------
const allaysOpt = AGENTS.options.find((o) => o.id === 'agents-allays');
// Bees: a Minecraft bee is a striped cube. Here it is two cells of yellow (#F8C94A, the cells' background) with a brown
// (#3A2E16) right half block ▐ in each (WT draws it itself), so the body is a square of yellow, stripe, yellow, stripe,
// with a light wing (a top-row sextant, or level on every other bee) behind it. They fly left, home to a hive ▤ at col
// 80, in the allays' sky (from col 82, 4 cells apart, the 4 + count cap), so the phantoms' sky stays theirs.
// (A first try drew the stripes as sextants over a yellow cell, which left a brown band over each bee: it read as Π.)
const BEE = '#F8C94A', STRIPE = '#3A2E16', BEE_WING = '#E6F2FF', HIVE = S('▤', '#F0B43C', '#6E4B1F');
const BEE_BODY = '▐', BEE_WING_UP = sext(1 + 2), WING_LEVEL = sext(4 + 8);
const bee = (i) => [S(BEE_BODY, STRIPE, BEE), S(BEE_BODY, STRIPE, BEE), S(i % 2 ? WING_LEVEL : BEE_WING_UP, BEE_WING)];
const SKY0 = 82, PITCH = 4, CAP = 4;
function bees(ed, sit, ctx, lines) {
  if (ctx.live <= 0) return;
  const at = lines.length - 4;
  if (W(lines[at]) > SKY0 - 3) throw new Error(`bees: line 1 is ${W(lines[at])} cells, into the hive's sky`);
  const sprites = [[SKY0 - 2, [HIVE]]];
  for (let i = 0; i < Math.min(ctx.live, CAP); i++) sprites.push([SKY0 + PITCH * i, bee(i)]);
  if (ctx.live > CAP) sprites.push([SKY0 + PITCH * CAP, [S('+' + (ctx.live - CAP), BEE, null, true)]]);
  if (!inSky(lines, at, sprites)) throw new Error('bees: no sky');
}
// Minecarts on the rail: the hotbar's bottom edge (frame.ts's U+1FB82 row) is the track. A cart is two sextant cells in
// iron grey (#9AA1A8): its walls in the top row, where the rail runs, its body in the middle row and two wheels in the
// bottom row (X..X / XXXX / .XX.), so it sits in the track line. One per live agent at cols 44, 48, 52 and 56, then
// +N after the track. The edge row is pinned by test/unit/hud-frame.test.ts, so this is a post-frame overlay (the way the
// bed fills slot 4 over what the engine drew): it replaces those rail cells only.
const CART = '#9AA1A8', CART_L = sext(1 + 4 + 8 + 32), CART_R = sext(2 + 4 + 8 + 16), CART_COLS = [44, 48, 52, 56];
const EDGE = '\u{1FB82}';
function carts(framed, sit, ctx) {
  if (ctx.live <= 0) return;
  const i = framed.length - 1, cs = cells(framed[i]);
  for (let k = 0; k < Math.min(ctx.live, CAP); k++) {
    const c = CART_COLS[k];
    if (!cs[c] || cs[c].t !== EDGE || !cs[c + 1] || cs[c + 1].t !== EDGE) throw new Error(`carts: col ${c} is not the rail`);
    write(cs, c, [S(CART_L, CART), S(CART_R, CART)]);
  }
  if (ctx.live > CAP) cs.push(...cells([S(BLANK_CELL), S('+' + (ctx.live - CAP), CART, null, true)]));
  framed[i] = join(cs);
}
// XP orbs: Minecraft's green orbs (#7FFF3F •) drift after the XP line's last text (its % and your folder), from 2 cells
// past it, at uneven spacing (0, 3, 5, 8), one per live agent, then +N; whatever would pass 110 cells is left out.
const ORB = '#7FFF3F', ORB_AT = [0, 3, 5, 8];
function orbs(ed, sit, ctx, lines) {
  if (ctx.live <= 0) return;
  const at = lines.length - 2, start = W(lines[at]) + 2;
  const sprites = [];
  for (let k = 0; k < Math.min(ctx.live, CAP); k++) sprites.push([start + ORB_AT[k], [S('•', ORB)]]);
  if (ctx.live > CAP) sprites.push([start + 10, [S('+' + (ctx.live - CAP), ORB, null, true)]]);
  inSky(lines, at, sprites.filter(([c, sp]) => c + W(sp) <= MAXW));
}
const AGENTS_9B = {
  key: 'agents', file: 'agents-b',
  title: 'Your agents at work: allays or better?',
  intro: 'The note on the agents from the design chat: "i liked the Allays in the sky but if there better i want to see". Three challengers, each drawn in the same six situations, against the allays as the baseline. ' +
    'The shared-sky rule still holds: the phantoms keep the sky between the item name and the air bubbles; anything else in the sky flies after the cache readout.',
  focus: ['top', 'xp', 'hot', 'edge'],
  allowed: [['top', SKY0 - 3, MAXW], ['xp', 60, MAXW], ['edge', 40, 70]],
  situations: AGENTS.situations,
  options: [
    { id: 'agents-bees', name: 'Bees flying home', recommended: true,
      optionNote: 'Minecraft bees are striped cubes: each bee is a small square of yellow (#F8C94A) and brown (#3A2E16) stripes with a light wing, one per live agent, flying left to a beehive ▤ (#F0B43C on #6E4B1F) that appears at col 80 while any agent works. ' +
        'Up to four, then a count (+2). They use the allays\' sky after the cache readout, so they never meet the phantoms. ' +
        'Yellow and brown stripes read as "bee" at a glance and stand out more than the allays; the squares are solid blocks, so the sky looks busier.',
      layer: bees },
    { id: 'agents-carts', name: 'Minecarts on the rail',
      optionNote: 'The hotbar\'s bottom edge is already a rail. One iron minecart (#9AA1A8) per live agent rolls on it, under slots 6 to 9 (cols 44-59), then +2 after the track. ' +
        'Nothing in the sky, so it never meets the phantoms. ' +
        'The edge row is pinned by the frame\'s tests, so in Hungerbar this would be an overlay drawn after the frame (as the bed fills its slot). A cart is only two cells on a thin line: easy to miss.',
      post: carts, layer() {} },
    { id: 'agents-orbs', name: 'XP orbs',
      optionNote: 'Minecraft\'s green experience orbs (#7FFF3F •) drift after the XP line\'s last text, your folder, one per live agent, then +2. ' +
        'Nothing in the sky. The orbs move whenever the folder name gets longer, and in a deep folder they run out of room (the line stops at 110 cells), so this one is the least steady.',
      layer: orbs },
    { id: 'agents-allays', name: 'Allays in the sky', baseline: true,
      optionNote: 'The round-9 pick, the baseline: one friendly blue allay per live agent in the sky after the cache readout (from col 82), up to four, then +2.',
      layer: allaysOpt.layer },
  ],
};

// ---------- build ----------
for (const g of ['▤', '•']) CASCADIA.add(g);
const docs = [TOTEM_9B, AGENTS_9B].map((f) => B.buildFeature(f, { builder: 'build-9b.cjs', round: '9b' }));
const SNOTE = 'A block sextant: Windows Terminal draws it itself (no font), exactly one cell, in both styles.';
B.writePicker(docs, {
  probe: B.probeOf(['☥', '✦', '◆', '🍗', '▤', '•', ...SEXT_ALLAY, BEE_BODY, BEE_WING_UP, CART_L, CART_R], {
    '▤': ['beehive (bees)', 'Not in the round-4 probe. Fonts on the build PC: in Cascadia Mono (advance 0.586 em, exactly 1 cell), so no fallback.'],
    '•': ['XP orb (orbs)', 'Not in the round-4 probe. Fonts on the build PC: in Cascadia Mono (advance 0.586 em, exactly 1 cell); Windows Terminal gives this ambiguous-width bullet 1 cell.'],
    [BEE_BODY]: ["bee's stripe (brown, on a yellow cell)", 'A half block: Windows Terminal draws it itself (no font), exactly one cell, in both styles; the hotbar frame already uses it.'],
    [BEE_WING_UP]: ["bee's wing", SNOTE],
    [CART_L]: ["minecart's left half", SNOTE],
    [CART_R]: ["minecart's right half", SNOTE],
  }),
  html: 'hungerbar-picker-9b.html', round: '9b', storageKey: 'hungerbar-picker-r9b', summaryTitle: 'Hungerbar round 9B: my picks',
  title: 'Hungerbar Round 9B', h1: 'Hungerbar · round 9B',
  lede: 'Two follow-ups to the round-9 picks: <b>where the totem lives</b>, and <b>what shows your agents at work</b>. In each section the current pick is the baseline, and every other card shows the lines that differ from it. Same drawing as round 9: the HUD as Hungerbar 1.0 draws it, on <b>Windows Terminal</b>\'s grid, in both icon styles.',
  manifest: 'MANIFEST-9b.json', files: ['totem-mix.json', 'agents-b.json', 'build-9b.cjs', 'build.cjs'],
});
// the baselines are the round-9 picks: their rows here must be round 9's own, wherever the situation is the same
const fs = require('fs'), path = require('path');
const r9 = JSON.parse(fs.readFileSync(path.join(B.DIR, 'agents.json'), 'utf8')).options.find((o) => o.id === 'agents-allays').rows;
const b9 = docs[1].options.find((o) => o.id === 'agents-allays').rows;
if (JSON.stringify(r9) !== JSON.stringify(b9)) throw new Error('agents-allays rows differ from round 9');
console.log('agents-allays rows are round 9\'s, span for span');
