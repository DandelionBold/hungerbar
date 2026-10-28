// anatomy.png: one real render with every part of the HUD on screen at once, drawn large, with a numbered marker and a
// thin arrow for each part (the README's Anatomy table says what each number is). The state: four and a half hours into
// a session and two compactions (two signs of a long session: two phantoms; the compactions are the level), Fable in use
// (the boss bar), away for almost 7 minutes (the bed: the cache is a 1-hour one, so the bubbles stay warm), on a feature
// branch with changes and an approved pull request, in a terminal that runs as Administrator (the name in gold).
// Left-aligned: the parts, not the centring.
// The arrows run in the gaps of the grid wherever they cross other lines (blank cells, the spaces between bubbles).
import { T0 } from '../rig.mjs';
import { lineHTML, parseLine, TERM_CSS } from '../term.mjs';
import { normalDay } from './looks.mjs';

const lines = (n, tag) => Array.from({ length: n }, (_, i) => `export const ${tag}${i} = ${i};`);
const file = (ls) => ls.join('\n') + '\n';

/**
 * The parts in reading order: [line, side, where]. `where` is the column the arrow points at (a fraction is inside a
 * cell; for left and right, the first or last column of the part). Top and bottom arrows end on the line's top or bottom
 * edge; `tip` moves that end into the cell (the frame's edge is the top quarter of its row).
 */
export const PARTS = [
  [0, 'top', 17.5],                     // 1 boss bar
  [1, 'left', 0],                       // 2 the item in your hand: the model
  [1, 'top', 22.5],                     // 3 its enchantment: the effort
  [1, 'top', 31.5],                     // 4 phantoms
  [1, 'top', 52.5],                     // 5 air bubbles: the prompt cache
  [2, 'left', 0],                       // 6 the day: sun, moon, skull
  [2, 'top', 26.5],                     // 7 hearts
  [2, 'top', 38.5],                     // 8 the level: compactions
  [2, 'top', 59.5],                     // 9 drumsticks
  [3, 'left', 0],                       // 10 the context's tokens
  [3, 'top', 45.5, 0.72],               // 11 the XP bar (the lower quarter of its row)
  [3, 'bottom', 68.5],                  // 12 the spawn point: the folder
  [3, 'bottom', 73.5],                  // 13 the operator: your name in gold
  [4, 'left', 0],                       // 14 the version
  [4, 'bottom', 11.5],                  // 15 the offhand: extra credits
  [4, 'bottom', 17.5],                  // 16 the pickaxe in the selected slot
  [4, 'bottom', 23],                    // 17 book and quill: prompts
  [4, 'bottom', 28],                    // 18 gold: cost
  [4, 'bottom', 34],                    // 19 the bed
  [4, 'bottom', 49],                    // 20 terrain: the last two hours of git
  [4, 'bottom', 58.5],                  // 21 grass block and cobblestone: the diff now
  [4, 'bottom', 65.5],                  // 22 the exact counts
  [4, 'bottom', 82],                    // 23 ⎇ and the branch: the git state
  [4, 'right', null],                   // 24 the pull request (the line's end)
  [5, 'bottom', 43.5, 0.3],             // 25 the hotbar's frame
];

export async function anatomy(rig) {
  normalDay(rig, { clean: true, talk: false, config: { hud: { pr: 'on', align: 'left' } } });
  rig.mustGit('checkout', '-q', '-b', 'feature/cache');
  rig.write('src/cache.js', file(lines(40, 'cache')));
  rig.mustGit('add', '-A');
  rig.mustGit('commit', '-q', '-m', 'Cache the parser');
  rig.write('src/app.js', file([...lines(600, 'item').slice(279), ...lines(1208, 'next')]));
  const start = T0 - 4 * 3600 - 1500;
  for (let i = 0; i < 87; i++) rig.prompt(start + 60 + i * 170);
  rig.compact(start + 7000);
  rig.compact(start + 13000);
  rig.reply(T0 - 400);
  rig.setPr(T0, 'feature/cache', { n: 128, state: 'open', ci: 'passed', review: 'approved', conflict: false });
  rig.seedHistory(T0, 'feature/cache', [[7, 300, 80, 0], [6, 241, 101, 0], [5, 455, 160, 0], [4, 640, 220, 0], [3, 667, 231, 1], [2, 140, 40, 0], [1, 520, 120, 0], [0, 1208, 279, 0]]);
  const p = rig.payload({
    now: T0, model: 'fable', ctx: 96000, cost: 23.4, secs: T0 - start,
    h5: { used: 41, reset: 10140 }, week: { used: 82, reset: 345540 }, cache: { left: 3200, ttl: '1h', hit: 0.97 },
  });
  const status = rig.render(p, { now: T0, elevated: true });
  if (status.length !== 6) throw new Error(`the anatomy needs six lines, got ${status.length}`);
  return { frames: [{ status }], png: true, page: () => page(status) };
}

function page(status) {
  const rows = status.map((l) => lineHTML(parseLine(l))).join('');
  const ends = status.map((l) => parseLine(l).reduce((n, c) => n + c.w, 0));
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#0C0C0C}
${TERM_CSS}
#shot{position:relative;display:block;width:max-content;background:#0C0C0C;padding:104px 110px 112px 84px}
.term{font-size:26px;position:relative}
svg{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}
.n{font:700 17px "Segoe UI",sans-serif}
</style></head><body><div id="shot"><div class="term" id="hud">${rows}</div><svg id="ink"></svg></div><script>
const PARTS = ${JSON.stringify(PARTS)};
const ENDS = ${JSON.stringify(ends)};
async function show() {
  await document.fonts.ready;
  const shot = document.getElementById('shot'), hud = document.getElementById('hud'), svg = document.getElementById('ink');
  const probe = document.createElement('span');
  probe.textContent = '0'.repeat(100);
  hud.appendChild(probe);
  const ch = probe.getBoundingClientRect().width / 100;
  probe.remove();
  const lh = hud.querySelector('.ln').getBoundingClientRect().height;
  const s = shot.getBoundingClientRect(), h = hud.getBoundingClientRect();
  const X = h.left - s.left, Y = h.top - s.top, R = 15, GAP = 2 * R + 14;
  svg.setAttribute('width', s.width); svg.setAttribute('height', s.height);
  const maxEnd = Math.max(...ENDS);
  // where each arrow ends, and where its marker would like to sit
  const items = PARTS.map(([line, side, where, tip], i) => {
    const y0 = Y + line * lh, y1 = y0 + lh, ym = y0 + lh / 2;
    if (side === 'left') return { i, side, tx: X + where * ch - 3, ty: ym, mx: X - 40, my: ym };
    if (side === 'right') return { i, side, tx: X + ENDS[line] * ch + 3, ty: ym, mx: X + maxEnd * ch + 52, my: ym };
    const tx = X + where * ch;
    if (side === 'top') return { i, side, tx, ty: y0 + (tip ?? 0) * lh, mx: tx, my: Y - 62 };
    return { i, side, tx, ty: tip !== undefined ? y0 + tip * lh : y1, mx: tx, my: Y + 6 * lh + 62 };
  });
  // a row of markers keeps them GAP apart, as near their arrows as it can
  for (const side of ['top', 'bottom']) {
    const row = items.filter((m) => m.side === side).sort((a, b) => a.mx - b.mx);
    for (let k = 1; k < row.length; k++) row[k].mx = Math.max(row[k].mx, row[k - 1].mx + GAP);
  }
  const NS = 'http://www.w3.org/2000/svg';
  const el = (name, attrs, parent = svg) => { const e = document.createElementNS(NS, name); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); parent.appendChild(e); return e; };
  const defs = el('defs', {});
  const head = el('marker', { id: 'head', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' }, defs);
  el('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#F2F2F2' }, head);
  for (const m of items) {
    // from the marker's edge to the part
    const dx = m.tx - m.mx, dy = m.ty - m.my, d = Math.hypot(dx, dy);
    const sx = m.mx + (dx / d) * (R + 3), sy = m.my + (dy / d) * (R + 3);
    el('line', { x1: sx, y1: sy, x2: m.tx, y2: m.ty, stroke: '#0C0C0C', 'stroke-width': 5, 'stroke-linecap': 'round', opacity: 0.85 });
    el('line', { x1: sx, y1: sy, x2: m.tx, y2: m.ty, stroke: '#F2F2F2', 'stroke-width': 1.6, 'marker-end': 'url(#head)' });
  }
  for (const m of items) {
    el('circle', { cx: m.mx, cy: m.my, r: R, fill: '#F2F2F2', stroke: '#0C0C0C', 'stroke-width': 2 });
    const t = el('text', { x: m.mx, y: m.my + 6, 'text-anchor': 'middle', fill: '#111111', class: 'n' });
    t.textContent = String(m.i + 1);
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return { x: s.left, y: s.top, width: Math.ceil(s.width), height: Math.ceil(s.height) };
}
</script></body></html>`;
}
