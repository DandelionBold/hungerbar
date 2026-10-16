// Windows Terminal 1.25 cell widths and grapheme clusters, ported line for line from the HUD oracle
// (test/reference/hud4.js L16-93; plan §3-§4). The two tables are the oracle's strings byte for byte, and
// hud.oracle.test.ts compares every code point. They are decoded on first use instead of at load, so a render
// that never measures text past printable ASCII (every classic render) never pays for them.

// hud4.js L17-20: every code point whose width is not 1, as "<width><gap>.<len>" in base 36 (gap from the previous
// range's end, len = end - start), generated from WT's tables.
export const WT = '0lc.33,07n.6,07b.18,01.0,01.1,01.1,01.0,01k.5,0a.a,01.0,01a.k,0g.0,02t.7,01.5,02.1,01.3,0x.0,01.0,0u.q,02j.a,01m.8,09.0,0o.3,01.8,01.2,01.4,017.2,01g.1,05.8,016.1k,01j.0,01.0,04.7,04.0,03.6,0a.1,0t.0,01m.0,04.3,08.0,0k.1,0q.0,02.1,01l.0,04.1,04.1,02.2,03.0,0u.1,03.0,0b.1,01l.0,04.4,01.1,04.0,0k.1,0m.5,01.0,01m.0,02.0,01.3,08.0,07.1,0b.1,0u.0,01p.0,0c.0,01e.0,03.0,01j.0,01.2,05.2,01.3,07.1,0b.1,0t.0,01m.0,02.0,06.0,05.1,0k.1,0s.1,01l.1,04.3,08.0,0k.1,0t.0,020.0,07.2,01.0,02i.0,02.6,0c.7,02q.0,02.8,0b.6,021.1,0r.0,01.0,01.0,01j.d,01.4,01.1,05.a,01.z,09.0,02u.3,01.5,01.1,02.1,0p.1,04.2,0g.3,0d.0,02.1,06.0,0f.0,22q.2n,0e5.2,0qa.2,0t.1,0u.1,0u.1,01s.1,01.6,08.0,02.a,09.0,019.4,039.1,0y.0,03a.2,04.1,09.0,06.2,063.1,02.0,01m.0,01.6,01.0,01.0,02.7,06.9,02.0,01c.u,01d.3,01c.0,01.4,01.0,05.0,014.8,0c.1,0w.3,02.1,01.2,01k.0,01.1,03.0,01.2,01m.7,02.1,048.2,01.c,01.6,04.0,06.0,03.1,05i.1r,0ej.4,0q.4,01d.4,01.9,02o.w,2fd.1,2d.1,25a.3,23.0,22.0,2eh.1,2l.1,2q.7,2g.b,217.0,2a.5,23.0,2d.0,28.1,2h.1,25.1,28.0,25.0,2l.0,27.1,21.0,24.0,22.0,27.0,24.1,2s.0,2z.0,21.0,24.2,21.0,21p.2,2o.0,2e.0,2nv.1,21f.0,24.0,0bd.2,03x.0,02o.v,23k.p,21.2g,2c.5x,2q.1l,00.3,20.g,22.2d,02.1,20.2s,25.16,21.2l,21.2d,29.1b,21.13,28.mkc,23.1i,0bs.3,01.9,0w.1,028.1,07k.0,03.0,04.0,0p.1,05.0,047.1,0q.h,0d.0,012.7,0p.a,2e.s,03.2,01c.0,02.3,02.1,013.0,01v.5,02.1,02.1,0c.0,08.0,01b.0,01f.0,01.2,02.1,05.1,01.0,016.1,08.0,06m.0,02.0,04.0,2i.8mb,26l8.e7,0u.0,0kh.f,20.9,06.f,20.y,21.i,21.3,043.0,21.2n,23j.6,0i.2,0e9.0,06a.0,045.4,01ae.2,01.1,05.3,014.2,04.0,04l.1,0fx.3,01t.4,08t.1,027.3,01y.a,01d.3,03f.0,01i.e,015.0,02.1,0a.2,01d.3,02.1,02.0,04.0,0a.0,01e.2,010.4,01.7,01q.0,0c.1,01g.8,0a.3,02.0,02n.2,02.0,01.1,06.0,02.0,04d.0,03.7,0l.1,01l.1,03.0,011.6,03.4,01y.5,0d.0,01.0,01.0,0e.1,02d.7,02.2,01.0,0n.0,02c.5,01.0,04.1,01.1,06m.3,06.1,01.1,0r.1,02d.7,02.0,01.1,02y.0,01.0,02.5,01.0,02t.0,01.0,02.3,01.4,077.8,01.1,074.1,01.0,04.0,040.3,02.1,04.0,0w.9,014.5,02.3,08.0,09.5,02.2,01a.c,01.1,0ba.6,01.5,01.0,02a.l,02.6,01.1,01.1,03e.5,03.0,01.1,01.6,01.0,020.1,03.0,01.0,09n.1,0b.1,01g.4,05.0,01.0,0n.0,0445.g,06.e,08ug.b,03.2,01xc.4,01n.6,0t4.0,01r.3,225.3,00.0,2b.1,2e.4qf,28.yd,215.9,26w7.3,21.6,21.1,21.82,2f.0,2t.2,22.0,2e.3,28.az,01wh.1,01.3,03mk.19,02.m,0f4.2,09.f,02.6,0u.3,044.2,257.2e,29.m,01ah.1i,04.1d,08.0,0e.0,0m.4,01.e,011s.6,01.g,02.6,01.1,01.4,02s.0,04g.6,0af.0,01p.3,0e4.3,072.1,0kg.6,031.6,21bt.0,25m.0,25a.0,22.9,22t.2,2d.17,24.8,27.1,2e.5,24a.w,2c.8,21.1x,21.l,2c.16,24.4,2c.g,23.0,23.1y,21.0,21.56,22.1q,2d.3,21.n,2i.0,2q.1,2d.0,22e.2c,21c.1x,26.0,23.2,22.2,24.3,2b.1,27.8,26b.b,24.0,27v.1a,21.9,21.54,234.c,23.9,25.1j,27.e,22.a,26.8,2zr.1ekd,22.1ekd,0e1oj.0,0u.2n,03k.6n';
const R0: number[] = [], R1: number[] = [], RW: number[] = [];
// hud4.js L22-29, run on first use
function loadWT(): void {
  let pos = -1;
  for (const tok of WT.split(',')) {
    const dot = tok.indexOf('.');
    const a = pos + 1 + parseInt(tok.slice(1, dot), 36), b = a + parseInt(tok.slice(dot + 1), 36);
    R0.push(a); R1.push(b); RW.push(+tok[0]!); pos = b;
  }
}
// hud4.js L30
export function cw(cp: number): number {
  if (cp < 0x300) return 1;
  if (!R0.length) loadWT();
  let lo = 0, hi = R0.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < R0[mid]!) hi = mid - 1;
    else if (cp > R1[mid]!) lo = mid + 1;
    else return RW[mid]!;
  }
  return 1;
}

// hud4.js L41-48: WT 1.25 graphemes mode (CodepointWidthDetector::_graphemeNext). A cluster is as wide as its code
// points together (U+FE0F counts 2), clamped to 2. CB holds the cluster-break class of every code point that is not
// Other (0), as "<class><gap>.<len>" in base 36 like WT; the Hangul syllables U+AC00-D7A3 are computed instead.
// Classes: 1 Control, 2 Extend (with SpacingMark and U+FE0F), 3 Regional Indicator, 4 Prepend,
// 5-9 Hangul L V T LV LVT, 10 InCB Linker, 11 InCB Consonant, 12 Extended_Pictographic, 13 ZWJ.
export const CB = '10.v,12n.w,c9.0,13.0,c0.0,2gh.33,27n.6,27b.18,21.0,21.1,21.1,21.0,41k.5,2a.a,21.0,21a.k,2g.0,22t.6,40.0,21.5,22.1,21.3,4x.0,21.0,2u.q,22j.a,21m.8,29.0,2o.3,21.8,21.2,21.4,217.2,41g.1,25.8,216.n,40.0,20.w,bh.10,20.2,21.e,a0.0,20.1,21.6,b0.7,22.1,bk.7,21.2,bh.j,b1.6,b1.0,b3.3,22.0,21.6,22.1,22.1,a0.0,29.0,b4.1,b1.0,22.1,bc.1,2c.0,22.2,21k.0,21.4,24.1,22.2,23.0,2u.1,23.0,2b.2,bh.j,b1.6,b1.1,b1.4,22.0,21.7,21.2,21.1,a0.0,2k.1,bl.0,20.5,21.2,bh.j,b1.6,b1.1,b1.4,22.0,21.6,22.1,22.1,a0.0,27.2,b4.1,b1.0,22.1,bd.0,2g.0,21n.4,23.2,21.3,29.0,214.4,bg.j,b1.f,22.0,21.6,21.2,21.2,a0.0,27.1,b1.2,27.1,2t.2,21k.0,21.6,21.2,21.3,27.1,2b.1,2f.0,2c.3,bh.11,20.1,21.6,21.2,21.2,a0.0,40.0,28.0,2a.1,2t.2,21y.0,24.5,21.0,21.7,2i.1,21p.0,21.7,2c.7,22q.0,21.9,2b.6,221.1,2r.0,21.0,21.0,24.1,21d.j,21.1,25.a,21.z,29.0,22u.a,21.5,2n.3,24.2,2g.3,2d.0,21.2,26.0,2f.0,52q.2n,60.1z,70.2f,29p.2,2qa.3,2s.2,2t.1,2u.1,21s.v,29.0,219.4,239.1,2y.0,23a.b,24.b,263.4,21l.9,21.0,21.0,22.n,22.0,21c.u,21d.4,21b.g,212.8,2c.2,2u.c,21k.d,21c.j,248.2,21.k,24.0,26.0,22.2,25i.1r,2ej.1,d0.0,20.1,1o.1,20.4,cd.0,cc.0,2m.4,10.0,20.9,22o.w,c1d.0,cm.0,c2i.5,cf.1,ca7.1,cc.0,c2n.0,c1y.0,cp.a,c4.2,c5j.0,c6f.1,ca.0,c9.0,c1m.3,c1.5,c1.b,c1.35,ca.39,c2.a,c1.0,c1.0,c6.0,c3.0,c6.0,ca.1,cf.0,c2.0,c4.0,c1.0,c4.2,c1.0,cb.4,c19.2,c9.0,ce.0,ce.0,cac.1,ccv.2,cj.1,c1f.0,c4.0,2bd.2,23x.0,22o.v,2fe.5,c0.0,cc.0,22j.1,ce4.0,c1.0,2mvp.3,21.9,2w.1,228.1,27k.0,23.0,24.0,2n.4,24.0,22b.1,21e.h,2q.h,2d.0,212.7,2p.c,5c.s,23.3,21b.d,210.0,21v.d,2c.0,28.1,21a.0,21f.0,21.2,22.1,25.1,21.0,215.4,25.1,26k.7,21.1,68n6.m,74.1c,26xu.0,2kh.f,2g.f,25r.0,24e.1,128.8,20.2,2e9.0,26a.0,245.4,21ae.2,21.1,25.3,214.2,24.0,24l.1,2fx.3,21t.4,28t.1,227.3,21y.a,21d.3,23e.2,21h.e,215.0,22.1,2a.3,219.a,42.0,24.0,4a.0,21e.2,210.d,2g.1,218.0,2c.2,21c.d,41.1,25.3,21.1,22k.b,26.0,22.0,24d.b,2l.3,21j.1,21.6,22.1,22.2,29.0,2a.1,22.6,23.4,21v.8,21.0,22.0,21.3,21.4,40.0,20.0,2e.1,22a.h,2n.0,229.j,26j.6,22.8,2r.1,22a.g,22y.c,22t.2,22.9,274.e,26t.5,21.1,22.3,40.0,20.0,40.0,20.1,23x.6,22.6,23.0,2s.9,214.6,40.0,20.3,28.0,29.a,414.5,20.f,2b9.7,21.7,22a.l,21.d,23e.5,23.0,21.1,21.6,40.0,20.0,21u.4,21.1,21.4,29n.3,29.1,40.0,20.0,21c.6,23.4,2n.0,2445.g,26.e,28ug.h,21xc.4,21n.6,6fg.0,63.3,2dg.0,21.1i,27.3,229.0,2b.1,2f57.1,21.3,23mk.19,22.m,2f2.4,23.l,22.6,2u.3,244.2,21iz.1i,24.1d,28.0,2e.0,2m.4,21.e,211s.6,21.g,22.6,21.1,21.4,22s.0,24g.6,2af.0,21p.3,2e4.3,272.1,2kg.6,231.6,c1bp.73,cd.2,cv.0,c1o.5,cc.1,ce.0,c2.9,ci.1k,30.p,c1.e,ca.0,ck.0,c2.8,c1.3,c9.c1,20.4,c0.8t,c8.7d,c1c.3j,c38.b,c2d.16,cc.3,c1k.7,ca.5,c14.7,cu.29,cc.1a,c1.9,c1.c8,c74.sd,1gute.0,20.0,10.t,20.2n,10.3j,20.6n,10.2rz';
const B0: number[] = [], B1: number[] = [], BC: number[] = [];
// hud4.js L50-57, run on first use
function loadCB(): void {
  let pos = -1;
  for (const tok of CB.split(',')) {
    const dot = tok.indexOf('.');
    const a = pos + 1 + parseInt(tok.slice(1, dot), 36), b = a + parseInt(tok.slice(dot + 1), 36);
    B0.push(a); B1.push(b); BC.push(parseInt(tok[0]!, 36)); pos = b;
  }
}
// hud4.js L58
export function cls(cp: number): number {
  if (cp >= 0xac00 && cp <= 0xd7a3) return (cp - 0xac00) % 28 ? 9 : 8;
  if (!B0.length) loadCB();
  let lo = 0, hi = B0.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < B0[mid]!) hi = mid - 1;
    else if (cp > B1[mid]!) lo = mid + 1;
    else return BC[mid]!;
  }
  return 0;
}
// hud4.js L69-74: WT's s_joinRules[state][lead] >> (2 * trail) & 3: 3 = break, 0 = join, 1 = join and go to state 1.
// State 1 (after a regional indicator joined another) only differs in that a third RI breaks.
export const JOIN: readonly (readonly number[])[] = [
  [0x3cfffcf, 0xfffffff, 0x3cfffcf, 0x3cfff4f, 0xc, 0x3c0c3cf, 0x3cf0fcf, 0x3cf3fcf, 0x3cf0fcf, 0x3cf3fcf, 0x30fffcf, 0x3cfffcf, 0x3cfffcf, 0xcfffcf],
  [0x3cfffcf, 0xfffffff, 0x3cfffcf, 0x3cfffcf, 0xc, 0x3c0c3cf, 0x3cf0fcf, 0x3cf3fcf, 0x3cf0fcf, 0x3cf3fcf, 0x30fffcf, 0x3cfffcf, 0x3cfffcf, 0xcfffcf],
];
// hud4.js L75
export const joins = (state: number, lead: number, trail: number): number => (JOIN[state]![lead]! >> (2 * trail)) & 3;
// hud4.js L76: a lone surrogate, as WT decodes it
export const cpOf = (ch: string): number => { const cp = ch.codePointAt(0)!; return cp >= 0xd800 && cp <= 0xdfff ? 0xfffd : cp; };
// hud4.js L77: each(cluster, width), in order
export function clusters(text: string, each: (cluster: string, width: number) => void): void {
  let cur = '', w = 0, state = 0, lead = -1;
  for (const ch of String(text)) {
    const cp = cpOf(ch);
    const c = cls(cp);
    if (lead >= 0 && (state = joins(state, lead, c)) === 3) { each(cur, Math.min(2, w)); cur = ''; w = 0; state = 0; }
    cur += ch; w += cp === 0xfe0f ? 2 : cw(cp); lead = c;
  }
  if (cur) each(cur, Math.min(2, w));
}
// hud4.js L87
export function cellWidth(text: string): number {
  const s = String(text);
  if (/^[\x20-\x7e]*$/.test(s)) return s.length;                         // printable ASCII: one cell each
  let w = 0;
  clusters(s, (g, n) => { w += n; });
  return w;
}

/** For the oracle test: whether each table has been decoded yet. */
export const decoded = (): { wt: boolean; cb: boolean } => ({ wt: R0.length > 0, cb: B0.length > 0 });
/** For the oracle test: the decoded tables (a lookup in each decodes it first if needed), to compare with the oracle's. */
export function tables(): Record<'R0' | 'R1' | 'RW' | 'B0' | 'B1' | 'BC', readonly number[]> {
  cw(0x300);
  cls(0);
  return { R0, R1, RW, B0, B1, BC };
}
