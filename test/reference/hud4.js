const HUD4 = (() => {
  'use strict';
  // Port of round4/gen.py (Survival Hotbar, Day & Night, Pocket Edition). Self-contained, no DOM, no deps.
  // render(state, opts) returns gen.py's merged span lists for a picker state; fromState() is the
  // state -> gen.py situation conversion. For the four reference situations the spans are gen.py's own.
  // Where gen.py would stop on an `assert` (a value too wide for its slot or its line), this port gives
  // way instead: the least important text goes first (the version, the path, a branch prefix), then text
  // is cut by whole grapheme clusters with '…', so every grid holds for any input: Survival lines are
  // exactly 100 cells, Day & Night and Pocket lines at most 110, and no line starts with a space.
  // Round 5 adds a fourth concept, 'mix' (Your mix): Day & Night with option groups (git, pick, book) for its line 4,
  // as round5/mix-spec.json lays them out. The first three concepts render exactly as before.
  // Round 7 adds a fourth option group to the mix, 'fable' (round7/round7-spec.json): Fable's own weekly limit from
  // state.scoped, drawn only on lines 1-3 (and, for fable-boss, a line on top), so it composes with git, pick and book.
  // Its default, fable-off, and every render without scoped data are the mix exactly as before, span for span.

  // ---------- cell widths: gen.py cw() = WT 1.25 CodepointWidthDetector, ambiguous = 1 ----------
  // Every code point whose width is not 1, as "<width><gap>.<len>" in base 36 (gap from the previous
  // range's end, len = end - start), generated from WT's tables. All glyphs the concepts draw themselves
  // are 1 cell except the Emoji_Presentation pictographs 🍗 🔥 📖 🏠 🔨 (2 cells); 🬋 and ▌▐▀▄▒▂▬ are 1.
  const WT = '0lc.33,07n.6,07b.18,01.0,01.1,01.1,01.0,01k.5,0a.a,01.0,01a.k,0g.0,02t.7,01.5,02.1,01.3,0x.0,01.0,0u.q,02j.a,01m.8,09.0,0o.3,01.8,01.2,01.4,017.2,01g.1,05.8,016.1k,01j.0,01.0,04.7,04.0,03.6,0a.1,0t.0,01m.0,04.3,08.0,0k.1,0q.0,02.1,01l.0,04.1,04.1,02.2,03.0,0u.1,03.0,0b.1,01l.0,04.4,01.1,04.0,0k.1,0m.5,01.0,01m.0,02.0,01.3,08.0,07.1,0b.1,0u.0,01p.0,0c.0,01e.0,03.0,01j.0,01.2,05.2,01.3,07.1,0b.1,0t.0,01m.0,02.0,06.0,05.1,0k.1,0s.1,01l.1,04.3,08.0,0k.1,0t.0,020.0,07.2,01.0,02i.0,02.6,0c.7,02q.0,02.8,0b.6,021.1,0r.0,01.0,01.0,01j.d,01.4,01.1,05.a,01.z,09.0,02u.3,01.5,01.1,02.1,0p.1,04.2,0g.3,0d.0,02.1,06.0,0f.0,22q.2n,0e5.2,0qa.2,0t.1,0u.1,0u.1,01s.1,01.6,08.0,02.a,09.0,019.4,039.1,0y.0,03a.2,04.1,09.0,06.2,063.1,02.0,01m.0,01.6,01.0,01.0,02.7,06.9,02.0,01c.u,01d.3,01c.0,01.4,01.0,05.0,014.8,0c.1,0w.3,02.1,01.2,01k.0,01.1,03.0,01.2,01m.7,02.1,048.2,01.c,01.6,04.0,06.0,03.1,05i.1r,0ej.4,0q.4,01d.4,01.9,02o.w,2fd.1,2d.1,25a.3,23.0,22.0,2eh.1,2l.1,2q.7,2g.b,217.0,2a.5,23.0,2d.0,28.1,2h.1,25.1,28.0,25.0,2l.0,27.1,21.0,24.0,22.0,27.0,24.1,2s.0,2z.0,21.0,24.2,21.0,21p.2,2o.0,2e.0,2nv.1,21f.0,24.0,0bd.2,03x.0,02o.v,23k.p,21.2g,2c.5x,2q.1l,00.3,20.g,22.2d,02.1,20.2s,25.16,21.2l,21.2d,29.1b,21.13,28.mkc,23.1i,0bs.3,01.9,0w.1,028.1,07k.0,03.0,04.0,0p.1,05.0,047.1,0q.h,0d.0,012.7,0p.a,2e.s,03.2,01c.0,02.3,02.1,013.0,01v.5,02.1,02.1,0c.0,08.0,01b.0,01f.0,01.2,02.1,05.1,01.0,016.1,08.0,06m.0,02.0,04.0,2i.8mb,26l8.e7,0u.0,0kh.f,20.9,06.f,20.y,21.i,21.3,043.0,21.2n,23j.6,0i.2,0e9.0,06a.0,045.4,01ae.2,01.1,05.3,014.2,04.0,04l.1,0fx.3,01t.4,08t.1,027.3,01y.a,01d.3,03f.0,01i.e,015.0,02.1,0a.2,01d.3,02.1,02.0,04.0,0a.0,01e.2,010.4,01.7,01q.0,0c.1,01g.8,0a.3,02.0,02n.2,02.0,01.1,06.0,02.0,04d.0,03.7,0l.1,01l.1,03.0,011.6,03.4,01y.5,0d.0,01.0,01.0,0e.1,02d.7,02.2,01.0,0n.0,02c.5,01.0,04.1,01.1,06m.3,06.1,01.1,0r.1,02d.7,02.0,01.1,02y.0,01.0,02.5,01.0,02t.0,01.0,02.3,01.4,077.8,01.1,074.1,01.0,04.0,040.3,02.1,04.0,0w.9,014.5,02.3,08.0,09.5,02.2,01a.c,01.1,0ba.6,01.5,01.0,02a.l,02.6,01.1,01.1,03e.5,03.0,01.1,01.6,01.0,020.1,03.0,01.0,09n.1,0b.1,01g.4,05.0,01.0,0n.0,0445.g,06.e,08ug.b,03.2,01xc.4,01n.6,0t4.0,01r.3,225.3,00.0,2b.1,2e.4qf,28.yd,215.9,26w7.3,21.6,21.1,21.82,2f.0,2t.2,22.0,2e.3,28.az,01wh.1,01.3,03mk.19,02.m,0f4.2,09.f,02.6,0u.3,044.2,257.2e,29.m,01ah.1i,04.1d,08.0,0e.0,0m.4,01.e,011s.6,01.g,02.6,01.1,01.4,02s.0,04g.6,0af.0,01p.3,0e4.3,072.1,0kg.6,031.6,21bt.0,25m.0,25a.0,22.9,22t.2,2d.17,24.8,27.1,2e.5,24a.w,2c.8,21.1x,21.l,2c.16,24.4,2c.g,23.0,23.1y,21.0,21.56,22.1q,2d.3,21.n,2i.0,2q.1,2d.0,22e.2c,21c.1x,26.0,23.2,22.2,24.3,2b.1,27.8,26b.b,24.0,27v.1a,21.9,21.54,234.c,23.9,25.1j,27.e,22.a,26.8,2zr.1ekd,22.1ekd,0e1oj.0,0u.2n,03k.6n';
  const R0 = [], R1 = [], RW = [];
  (() => {
    let pos = -1;
    for (const tok of WT.split(',')) {
      const dot = tok.indexOf('.');
      const a = pos + 1 + parseInt(tok.slice(1, dot), 36), b = a + parseInt(tok.slice(dot + 1), 36);
      R0.push(a); R1.push(b); RW.push(+tok[0]); pos = b;
    }
  })();
  function cw(cp) {
    if (cp < 0x300) return 1;
    let lo = 0, hi = R0.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cp < R0[mid]) hi = mid - 1;
      else if (cp > R1[mid]) lo = mid + 1;
      else return RW[mid];
    }
    return 1;
  }
  // ---------- grapheme clusters: WT 1.25 graphemes mode (CodepointWidthDetector::_graphemeNext) ----------
  // WT measures a line cluster by cluster: a cluster is as wide as its code points together (U+FE0F counts
  // 2), clamped to 2. Clusters come from WT's own pairwise join table, a simplified UAX #29. CB holds the
  // cluster-break class of every code point that is not Other (0), as "<class><gap>.<len>" in base 36 like
  // WT above; the Hangul syllables U+AC00-D7A3 are computed instead (LV every 28th, LVT in between).
  // Classes: 1 Control, 2 Extend (with SpacingMark and U+FE0F), 3 Regional Indicator, 4 Prepend,
  // 5-9 Hangul L V T LV LVT, 10 InCB Linker, 11 InCB Consonant, 12 Extended_Pictographic, 13 ZWJ.
  const CB = '10.v,12n.w,c9.0,13.0,c0.0,2gh.33,27n.6,27b.18,21.0,21.1,21.1,21.0,41k.5,2a.a,21.0,21a.k,2g.0,22t.6,40.0,21.5,22.1,21.3,4x.0,21.0,2u.q,22j.a,21m.8,29.0,2o.3,21.8,21.2,21.4,217.2,41g.1,25.8,216.n,40.0,20.w,bh.10,20.2,21.e,a0.0,20.1,21.6,b0.7,22.1,bk.7,21.2,bh.j,b1.6,b1.0,b3.3,22.0,21.6,22.1,22.1,a0.0,29.0,b4.1,b1.0,22.1,bc.1,2c.0,22.2,21k.0,21.4,24.1,22.2,23.0,2u.1,23.0,2b.2,bh.j,b1.6,b1.1,b1.4,22.0,21.7,21.2,21.1,a0.0,2k.1,bl.0,20.5,21.2,bh.j,b1.6,b1.1,b1.4,22.0,21.6,22.1,22.1,a0.0,27.2,b4.1,b1.0,22.1,bd.0,2g.0,21n.4,23.2,21.3,29.0,214.4,bg.j,b1.f,22.0,21.6,21.2,21.2,a0.0,27.1,b1.2,27.1,2t.2,21k.0,21.6,21.2,21.3,27.1,2b.1,2f.0,2c.3,bh.11,20.1,21.6,21.2,21.2,a0.0,40.0,28.0,2a.1,2t.2,21y.0,24.5,21.0,21.7,2i.1,21p.0,21.7,2c.7,22q.0,21.9,2b.6,221.1,2r.0,21.0,21.0,24.1,21d.j,21.1,25.a,21.z,29.0,22u.a,21.5,2n.3,24.2,2g.3,2d.0,21.2,26.0,2f.0,52q.2n,60.1z,70.2f,29p.2,2qa.3,2s.2,2t.1,2u.1,21s.v,29.0,219.4,239.1,2y.0,23a.b,24.b,263.4,21l.9,21.0,21.0,22.n,22.0,21c.u,21d.4,21b.g,212.8,2c.2,2u.c,21k.d,21c.j,248.2,21.k,24.0,26.0,22.2,25i.1r,2ej.1,d0.0,20.1,1o.1,20.4,cd.0,cc.0,2m.4,10.0,20.9,22o.w,c1d.0,cm.0,c2i.5,cf.1,ca7.1,cc.0,c2n.0,c1y.0,cp.a,c4.2,c5j.0,c6f.1,ca.0,c9.0,c1m.3,c1.5,c1.b,c1.35,ca.39,c2.a,c1.0,c1.0,c6.0,c3.0,c6.0,ca.1,cf.0,c2.0,c4.0,c1.0,c4.2,c1.0,cb.4,c19.2,c9.0,ce.0,ce.0,cac.1,ccv.2,cj.1,c1f.0,c4.0,2bd.2,23x.0,22o.v,2fe.5,c0.0,cc.0,22j.1,ce4.0,c1.0,2mvp.3,21.9,2w.1,228.1,27k.0,23.0,24.0,2n.4,24.0,22b.1,21e.h,2q.h,2d.0,212.7,2p.c,5c.s,23.3,21b.d,210.0,21v.d,2c.0,28.1,21a.0,21f.0,21.2,22.1,25.1,21.0,215.4,25.1,26k.7,21.1,68n6.m,74.1c,26xu.0,2kh.f,2g.f,25r.0,24e.1,128.8,20.2,2e9.0,26a.0,245.4,21ae.2,21.1,25.3,214.2,24.0,24l.1,2fx.3,21t.4,28t.1,227.3,21y.a,21d.3,23e.2,21h.e,215.0,22.1,2a.3,219.a,42.0,24.0,4a.0,21e.2,210.d,2g.1,218.0,2c.2,21c.d,41.1,25.3,21.1,22k.b,26.0,22.0,24d.b,2l.3,21j.1,21.6,22.1,22.2,29.0,2a.1,22.6,23.4,21v.8,21.0,22.0,21.3,21.4,40.0,20.0,2e.1,22a.h,2n.0,229.j,26j.6,22.8,2r.1,22a.g,22y.c,22t.2,22.9,274.e,26t.5,21.1,22.3,40.0,20.0,40.0,20.1,23x.6,22.6,23.0,2s.9,214.6,40.0,20.3,28.0,29.a,414.5,20.f,2b9.7,21.7,22a.l,21.d,23e.5,23.0,21.1,21.6,40.0,20.0,21u.4,21.1,21.4,29n.3,29.1,40.0,20.0,21c.6,23.4,2n.0,2445.g,26.e,28ug.h,21xc.4,21n.6,6fg.0,63.3,2dg.0,21.1i,27.3,229.0,2b.1,2f57.1,21.3,23mk.19,22.m,2f2.4,23.l,22.6,2u.3,244.2,21iz.1i,24.1d,28.0,2e.0,2m.4,21.e,211s.6,21.g,22.6,21.1,21.4,22s.0,24g.6,2af.0,21p.3,2e4.3,272.1,2kg.6,231.6,c1bp.73,cd.2,cv.0,c1o.5,cc.1,ce.0,c2.9,ci.1k,30.p,c1.e,ca.0,ck.0,c2.8,c1.3,c9.c1,20.4,c0.8t,c8.7d,c1c.3j,c38.b,c2d.16,cc.3,c1k.7,ca.5,c14.7,cu.29,cc.1a,c1.9,c1.c8,c74.sd,1gute.0,20.0,10.t,20.2n,10.3j,20.6n,10.2rz';
  const B0 = [], B1 = [], BC = [];
  (() => {
    let pos = -1;
    for (const tok of CB.split(',')) {
      const dot = tok.indexOf('.');
      const a = pos + 1 + parseInt(tok.slice(1, dot), 36), b = a + parseInt(tok.slice(dot + 1), 36);
      B0.push(a); B1.push(b); BC.push(parseInt(tok[0], 36)); pos = b;
    }
  })();
  function cls(cp) {
    if (cp >= 0xac00 && cp <= 0xd7a3) return (cp - 0xac00) % 28 ? 9 : 8;
    let lo = 0, hi = B0.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cp < B0[mid]) hi = mid - 1;
      else if (cp > B1[mid]) lo = mid + 1;
      else return BC[mid];
    }
    return 0;
  }
  // WT's s_joinRules[state][lead] >> (2 * trail) & 3: 3 = break, 0 = join, 1 = join and go to state 1.
  // State 1 (after a regional indicator joined another) only differs in that a third RI breaks.
  const JOIN = [
    [0x3cfffcf, 0xfffffff, 0x3cfffcf, 0x3cfff4f, 0xc, 0x3c0c3cf, 0x3cf0fcf, 0x3cf3fcf, 0x3cf0fcf, 0x3cf3fcf, 0x30fffcf, 0x3cfffcf, 0x3cfffcf, 0xcfffcf],
    [0x3cfffcf, 0xfffffff, 0x3cfffcf, 0x3cfffcf, 0xc, 0x3c0c3cf, 0x3cf0fcf, 0x3cf3fcf, 0x3cf0fcf, 0x3cf3fcf, 0x30fffcf, 0x3cfffcf, 0x3cfffcf, 0xcfffcf],
  ];
  const joins = (state, lead, trail) => (JOIN[state][lead] >> (2 * trail)) & 3;
  const cpOf = (ch) => { const cp = ch.codePointAt(0); return cp >= 0xd800 && cp <= 0xdfff ? 0xfffd : cp; }; // a lone surrogate, as WT decodes it
  function clusters(text, each) {                                           // each(cluster, width), in order
    let cur = '', w = 0, state = 0, lead = -1;
    for (const ch of String(text)) {
      const cp = cpOf(ch);
      const c = cls(cp);
      if (lead >= 0 && (state = joins(state, lead, c)) === 3) { each(cur, Math.min(2, w)); cur = ''; w = 0; state = 0; }
      cur += ch; w += cp === 0xfe0f ? 2 : cw(cp); lead = c;
    }
    if (cur) each(cur, Math.min(2, w));
  }
  function cellWidth(text) {
    const s = String(text);
    if (/^[\x20-\x7e]*$/.test(s)) return s.length;                         // printable ASCII: one cell each
    let w = 0;
    clusters(s, (g, n) => { w += n; });
    return w;
  }

  // ---------- Python semantics gen.py relies on ----------
  const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
  const get = (o, k, d) => (own(o, k) ? o[k] : d);                       // dict.get
  const rep = (s, n) => (n > 0 && Number.isFinite(n) ? s.repeat(Math.floor(n)) : ''); // str * int
  const pyLen = (s) => Array.from(s).length;                                // len() in code points
  const rjust = (s, n) => ' '.repeat(Math.max(0, n - pyLen(s))) + s;
  function pyRound(x) {                                                     // round(): ties to even
    if (Math.abs(x % 1) === 0.5) return 2 * Math.round(x / 2) + 0;
    return Math.round(x) + 0;
  }
  function divmod(a, b) { const q = Math.floor(a / b); return [q, a - q * b]; }
  function pad02(n) {                                                       // f"{n:02d}"
    const s = pyStr(Math.abs(n)), sign = n < 0 ? '-' : '';
    return sign + s.padStart(2 - sign.length, '0');
  }
  function floatRepr(x) {                                                   // repr(float)
    if (Number.isNaN(x)) return 'nan';
    if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf';
    let [mant, exp] = x.toExponential().split('e');
    exp = +exp;
    const neg = mant[0] === '-';
    if (neg) mant = mant.slice(1);
    const dg = mant.replace('.', '');
    let out;
    if (exp >= -4 && exp < 16) {
      if (exp >= 0) out = dg.slice(0, exp + 1).padEnd(exp + 1, '0') + '.' + (dg.slice(exp + 1) || '0');
      else out = '0.' + '0'.repeat(-exp - 1) + dg;
    } else {
      out = dg[0] + (dg.length > 1 ? '.' + dg.slice(1) : '') + 'e' + (exp < 0 ? '-' : '+') + String(Math.abs(exp)).padStart(2, '0');
    }
    return (neg ? '-' : '') + out;
  }
  function pyStr(v) {                                                       // str() / f"{v}"
    if (v === null || v === undefined) return 'None';
    if (v === true) return 'True';
    if (v === false) return 'False';
    if (typeof v === 'number') {
      if (Number.isInteger(v)) return Math.abs(v) < 1e21 ? String(v + 0) : BigInt(v).toString();
      return floatRepr(v);
    }
    return String(v);
  }
  function pyFixed(x, f) {                                                  // f"{x:.{f}f}" (exact, ties to even)
    if (Number.isNaN(x)) return 'nan';
    if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf';
    const neg = x < 0 || Object.is(x, -0), ax = Math.abs(x);
    let ip, fp;
    if (ax >= 1e21) { ip = BigInt(ax).toString(); fp = ''; }
    else { const s = ax.toFixed(100), dot = s.indexOf('.'); ip = s.slice(0, dot); fp = s.slice(dot + 1); }
    let keep = BigInt(ip + fp.slice(0, f).padEnd(f, '0'));
    const rest = fp.slice(f), tail = /[1-9]/.test(rest.slice(1));
    if (rest[0] > '5' || (rest[0] === '5' && (tail || keep % 2n === 1n))) keep += 1n;
    const dg = keep.toString().padStart(f + 1, '0');
    return (neg ? '-' : '') + (f ? dg.slice(0, -f) + '.' + dg.slice(-f) : dg);
  }
  // str.split() whitespace (Python's isspace set, which differs from JS \s), by code point
  const PY_WS = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0, 0x1680,
    0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
    0x2028, 0x2029, 0x202f, 0x205f, 0x3000]);
  function family(model) {
    // the family named anywhere in the name, in any case ('Claude Opus 4.5', 'claude-opus-4-5', 'opus 5.5'),
    // else gen.py's model.split()[0]
    const k = /(?:^|[^a-z])(opus|fable|sonnet|haiku)(?![a-z])/i.exec(String(model));
    if (k) return k[1][0].toUpperCase() + k[1].slice(1).toLowerCase();
    let out = '', started = false;
    for (const ch of String(model)) {
      if (PY_WS.has(ch.codePointAt(0))) { if (started) break; } else { out += ch; started = true; }
    }
    return started ? out : undefined;
  }
  function sliceAssign(list, a, b, items) {                                 // list[a:b] = items
    const n = list.length, norm = (i) => Math.min(n, Math.max(0, i < 0 ? i + n : i));
    const lo = norm(a), hi = Math.max(lo, norm(b));
    list.splice(lo, hi - lo, ...items);
  }

  // ---------- spans ----------
  function S(t, fg, bg, bold) {
    const d = { t };
    if (fg) d.fg = fg;
    if (bg) d.bg = bg;
    if (bold) d.bold = true;
    return d;
  }
  const withBg = (s, bg) => ({ ...s, bg });                                 // {**s, "bg": bg}
  const keepBg = (s, bg) => ({ ...s, bg: own(s, 'bg') ? s.bg : bg });      // {**s, "bg": s.get("bg", bg)}
  const W = (spans) => spans.reduce((w, s) => w + cellWidth(s.t), 0);
  function sameAttrs(a, b) {
    const ka = Object.keys(a).filter((k) => k !== 't'), kb = Object.keys(b).filter((k) => k !== 't');
    return ka.length === kb.length && ka.every((k) => own(b, k) && a[k] === b[k]);
  }
  function merge(spans) {
    const out = [];
    for (const s of spans) {
      if (!s.t) continue;
      const last = out[out.length - 1];
      if (last && sameAttrs(last, s)) last.t += s.t;
      else out.push({ ...s });
    }
    return out;
  }
  function pad(spans, n, bg) {
    const w = W(spans);                                                     // gen.py: assert w <= n
    return n > w ? [...spans, S(rep(' ', n - w), null, bg)] : [...spans];
  }

  // ---------- shared data rules ----------
  const ROMAN = { low: 'I', medium: 'II', high: 'III', xhigh: 'IV', max: 'V' };
  const RARITY = { Opus: '#FF55FF', Fable: '#FF55FF', Sonnet: '#55FFFF', Haiku: '#FFFF55' };
  const TIER = { Opus: '#55FFFF', Fable: '#9D8F8F', Sonnet: '#D8D8D8', Haiku: '#8F8F8F' };
  const GLINT = { low: '#201E07', medium: '#26192A', high: '#2E1A3A', xhigh: '#3A1D4A', max: '#48205C' };
  const WELL = '#201E07';
  const HEART = '#FF5555', DARK = '#3F3F3F', GOLD = '#FFAA00';
  const FOOD = '#E0A458';
  const GREY = '#AAAAAA', DGREY = '#555555', WHITE = '#FFFFFF';
  const XPG = '#80FF20';
  const MAXW = 110;                                                         // Day & Night and Pocket line limit
  // gen.py indexes ROMAN/GLINT directly (KeyError on anything else). Here the effort (tidied by fromState) is
  // matched without case ('HIGH' is III), an unknown one shows as its own text (at most 6 cells, Survival's
  // slot value) on the plain well colour, and no effort ('') has no level at all.
  const roman = (e) => get(ROMAN, e.toLowerCase(), cut(e, 6));
  const glint = (e) => get(GLINT, e.toLowerCase(), WELL);

  const icons10 = (left) => (left <= 0 ? 0 : Math.min(10, Math.ceil(left / 10 - 1e-9)));
  function t5(mins) {
    const [h, m] = divmod(mins, 60);
    return h ? `${pyStr(h)}h${pad02(m)}m` : `${pyStr(m)}m`;
  }
  function twk(mins) {
    const [d, r] = divmod(mins, 1440), [h, m] = divmod(r, 60);
    return d ? `${pyStr(d)}d${pad02(h)}h` : h ? `${pyStr(h)}h${pad02(m)}m` : `${pyStr(m)}m`;
  }
  function kilo(n) {                                                        // a count in at most 5 characters:
    let unit = '';                                                          // 99999, then 100k, 9999k, 10M, ...
    for (const u of ['k', 'M', 'G', 'T']) {
      if (n < (unit ? 1e4 : 1e5)) break;
      n = Math.floor(n / 1000); unit = u;
    }
    return pyStr(n) + unit;
  }
  function money(v) {                                                       // at most 6 characters (a slot value)
    const c = pyFixed(v, 2);                                                // cents first: 49.996 is $50, 0.999 is $1
    if (!c.endsWith('.00') && c.length <= 5) return '$' + c;                // cents below $100: $3.12, $45.80
    return '$' + kilo(pyRound(+c));                                         // whole dollars: $50, $123, $1234, $123k
  }
  const pie = (frac) => (frac > 0.875 ? '●' : frac > 0.625 ? '◕' : frac > 0.375 ? '◑' : frac > 0.125 ? '◔' : '○');
  function day(sit) {
    // The 5-hour window is one Minecraft day: gen.py measures it against 300 minutes.
    if (!none(sit.s5_left) && sit.s5_left <= 0 && !sit.absorb) return S('☠  ', '#FF5555');
    const elapsed = 1 - sit.s5_reset / 300;
    if (elapsed < 0.6) return S('☼ ', '#FFFF55');
    if (elapsed < 0.8) return S('☼ ', '#FFAA00');
    return S('☾ ', '#AAAAAA');
  }
  const pctColour = (p) => (p < 50 ? XPG : p < 80 ? '#FFFF55' : '#FF5555');
  // the model keeps the rarity colour of its full name when the text is shortened
  const modelSpan = (sit, text = sit.model) => S(text, get(RARITY, family(sit.model), WHITE), null, true);
  // A path or branch splits at '/' (and at '\', for a native Windows cwd), but only between WT's clusters: a
  // separator that a Prepend before it joins (U+0600 + '/') belongs to that name. All of it is one pass.
  const isSep = (g) => g[0] === '/' || g[0] === '\\';
  function parts(p) {                                                       // [cluster, width]s, no trailing separator
    const cl = [];
    clusters(p, (g, w) => cl.push([g, w]));
    while (cl.length && isSep(cl[cl.length - 1][0])) cl.pop();
    return cl;
  }
  const join = (cl) => cl.map((c) => c[0]).join('');
  function lastSeg(p) {                                                     // the last name that is not blank ('/a/ /': a)
    const cl = parts(p);
    for (let e = cl.length; e;) {
      let k = e;
      while (k && !isSep(cl[k - 1][0])) k--;
      const name = tidy(join(cl.slice(k, e)), true);
      if (name) return name;
      for (e = k; e && isSep(cl[e - 1][0]);) e--;
    }
    return '';
  }
  function cut(text, n) {                                                   // whole clusters up to n cells, '…' if cut
    if (cellWidth(text) <= n) return text;
    if (n < 1) return '';
    let out = '', w = 0, full = false;
    clusters(text, (g, gw) => { if (!full && w + gw <= n - 1) { out += g; w += gw; } else full = true; });
    return out + '…';
  }
  function short(name, n) {                                                 // gen.py short(), in cells
    if (cellWidth(name) <= n) return name;
    return cut(lastSeg(name) || name, n);                                   // '//////' has no segment: the name itself
  }
  const basename = (p) => lastSeg(p) || p;                                  // '/' and '\' name themselves
  function tailPath(p, n) {                                                 // at most n cells: '…/company/project'
    if (cellWidth(p) <= n) return p;
    // the longest tail that starts at a separator and fits after '…', walking the clusters from the right
    const cl = parts(p);
    let w = 1, from = -1;
    for (let k = cl.length - 1; k >= 0 && (w += cl[k][1]) <= n; k--) if (isSep(cl[k][0])) from = k;
    if (from >= 0) return '…' + join(cl.slice(from));
    const name = lastSeg(p);                                                // '' when it is all separators ('//////')
    if (name && cellWidth(join(cl)) <= n) return join(cl);                  // only a trailing separator went
    // no separator tail fits: the last name, never without a mark that its front was dropped
    const last = name || p, lw = cellWidth(last);
    return lw + 1 <= n ? '…' + last : cut(last, lw > n ? n : n - 1);
  }
  // '(1M context)' at the end of a model name shrinks to '1M' (any other last parenthetical goes) before the
  // name is cut. String steps, not a regex that would backtrack over long runs of spaces or '('.
  function lite(m) {
    let s = m.trimEnd();
    const o = s.lastIndexOf('(');
    if (o >= 0 && s.indexOf(')', o) === s.length - 1) {
      const k = /^(\S+) context$/i.exec(s.slice(o + 1, -1));
      s = s.slice(0, o).trimEnd() + (k ? ' ' + k[1] : '');
    }
    return tidy(s, true) || m;
  }
  function itemName(sit, room, lores, liteFirst) {
    // The held-item name in at most `room` cells: the model with each lore in turn (the most complete first),
    // then the lite model with the last lore, then that model cut with '…'. `liteFirst` (Survival, whose lore
    // is the version shown nowhere else) tries the lite model with each lore before that lore goes.
    const last = lores[lores.length - 1];
    const full = (l) => [modelSpan(sit), ...l], short1 = (l) => [modelSpan(sit, lite(sit.model)), ...l];
    const forms = liteFirst ? lores.flatMap((l) => [full(l), short1(l)]) : [...lores.map(full), short1(last)];
    for (const f of forms) if (W(f) <= room) return f;
    return [modelSpan(sit, cut(lite(sit.model), room - W(last))), ...last];
  }
  function ctxLabel(sit) {
    const k = sit.ctx_tokens;
    const tok = k === 0 ? '0' : `${pyStr(Math.floor(k / 1000))}k`;
    const win = sit.ctx_window;
    const ws = win >= 1000000 ? `${pyFixed(win / 1e6, 1)}M` : `${pyStr(Math.floor(win / 1000))}k`;
    if (win < 1000) return [S(tok, pctColour(sit.ctx_pct))];   // no window given (or under 1k): never '/0k'
    return [S(tok, pctColour(sit.ctx_pct)), S('/' + ws, GREY)];
  }
  const none = (v) => v === null || v === undefined;
  // a limit that is not given (null: an API key has none) is never used up
  const paying = (sit) => (!none(sit.s5_left) && sit.s5_left <= 0) || (!none(sit.wk_left) && sit.wk_left <= 0);
  function rtrim(spans) {                                                   // no blank cells at the end of a line
    const out = [...spans];
    while (out.length && !out[out.length - 1].bg) {
      let t = out[out.length - 1].t;
      while (t.endsWith(' ')) t = t.slice(0, -1);
      if (t) { out[out.length - 1] = { ...out[out.length - 1], t }; break; }
      out.pop();
    }
    return out;
  }

  // =====================================================================================
  // FINALIST 1: SURVIVAL HOTBAR (3 lines, every line 100 cells, starts at column 0)
  // =====================================================================================
  const F1W = 100, PITCH = 11;
  const SEL = S('▌', '#D5E8D0', '#A1B29D');
  const RIDGE = S('▌', '#7E7E7E', '#5D5D5D');
  const EDGE_R = S('▌', '#7E7E7E', '#474747');

  function f1Line1(sit0) {
    const known = !none(sit0.s5_left);
    const absorb = known && sit0.s5_left <= 0 && (sit0.extra_left || 0) > 0;
    const sit = { ...sit0, absorb };
    let L;
    if (absorb) {
      const g = pyRound(sit.extra_left / sit.extra_limit * 10);
      L = [S(rep('♥ ', g), GOLD), S(rep('♥ ', 10 - g), DARK)];
    } else {
      const n = known ? icons10(sit.s5_left) : 0;   // no 5-hour limit given: dark hearts, no % and no clock
      L = [S(rep('♥ ', n), HEART), S(rep('♥ ', 10 - n), DARK)];
    }
    if (known) L.push(S(pyStr(sit.s5_left) + '%', HEART, null, true), S(' '), day(sit), S(t5(sit.s5_reset), GREY));
    else L.push(S('?', DGREY));                     // unknown, not used up: a grey '?' where the % goes (col 20)
    const f = none(sit.wk_left) ? 0 : icons10(sit.wk_left);
    // the week group from '↻' on (gen.py also counts the blank cells of the eaten drumsticks before it);
    // no weekly limit given: no group at all
    const R = none(sit.wk_left) ? [] : [S('↻ ' + twk(sit.wk_reset) + ' ', GREY), S(rep('🍗', f), FOOD), S(f ? ' ' : ''),
      S(pyStr(sit.wk_left) + '%', sit.wk_left <= 10 ? '#FF5555' : FOOD, null, true)];
    const lw = W(L), rw = W(R);
    // gen.py: assert lw < start and start + tw < F1W - rw. Here the name gives way to keep two spaces on each
    // side, so the groups never read as one sentence ('(1M context)' shrinks to '1M' first, then the version
    // goes, then the name is cut), and it moves off col 50 only as far as it must. No version: no ' · v'.
    const tip = itemName(sit, F1W - lw - rw - 4, sit.ver ? [[S(' · v' + sit.ver, DGREY)], []] : [[]], true);
    const tw = W(tip);
    const start = Math.max(lw + 2, Math.min(F1W - rw - 2 - tw, 50 - Math.floor((tw + 1) / 2)));
    return merge([...L, S(rep(' ', start - lw)), ...tip, S(rep(' ', F1W - rw - start - tw)), ...R]);
  }

  function f1Line2(sit) {
    let lab = ctxLabel(sit);
    if (W(lab) > 9) lab = lab.slice(0, 1);          // '1000k/1.0M' would touch the bar: the tokens alone keep a gap
    lab = pad(lab, 10);
    const BAR0 = 10, BAR1 = 95;                     // bar = columns 10..94 (85 cells)
    const n = BAR1 - BAR0;
    const fill = pyRound(sit.ctx_pct * n / 100);
    const cells = [];
    for (let c = BAR0; c < BAR1; c++) {
      const notch = c % PITCH === 0 || c % PITCH === 6;
      cells.push(S('🬋', c - BAR0 < fill ? (notch ? '#2C4915' : '#7CAB56') : (notch ? '#141F19' : '#36433C')));
    }
    const lv = sit.compactions;
    if (lv > 0) {                                   // Minecraft hides level 0
      const box = [S(' ', null, '#000000'), S(pyStr(lv), XPG, '#000000', true), S(' ', null, '#000000')];
      const bw = W(box);                            // centred on col 49: cols 48-50 for 1-9, 47-50 for 10-99
      const st = 49 - Math.floor(bw / 2) - BAR0;
      sliceAssign(cells, st, st + bw, box);         // the box replaces as many bar cells as it is wide
    }
    const p = pyStr(sit.ctx_pct) + '%';
    const right = [S(rep(' ', 5 - pyLen(p))), S(p, pctColour(sit.ctx_pct))];
    return merge([...lab, ...cells, ...right]);
  }

  function f1Slot(icon, value, bg) {
    // 10 interior cells: pad, icon box (2), gap, value (<= 6, left-aligned)
    if (icon === null) return [S(rep(' ', 10), null, bg)];
    const out = [S(' ', null, bg), ...icon.map((s) => keepBg(s, bg)), S(' ', null, bg)];
    let vw = 0;
    for (const s of value) { out.push(withBg(s, bg)); vw += W([s]); }
    out.push(S(rep(' ', 6 - vw), null, bg));       // gen.py: assert vw <= 6
    return out;
  }

  function f1Line3(sit) {
    const fam = family(sit.model);
    const EMPTY = [null, null, WELL];
    const slots = [[[S('⛏ ', get(TIER, fam, '#AAAAAA'))], [S(roman(sit.effort), '#FF55FF', null, true)], glint(sit.effort)]];
    const c = sit.cache;
    const hit = (colour, bold) => (none(c.hit) ? [] : [S(pyStr(c.hit) + '%', colour, null, bold)]);  // unknown: no %
    if (none(c)) slots.push(EMPTY);
    else if (c.warm) slots.push([[S('🔥', '#FFAA00')], [S(pie(c.ttl_left / c.ttl), '#55FFFF'), ...hit(WHITE, true)], WELL]);
    else slots.push([[S('❄ ', '#55FFFF')], [S('○', DGREY), ...hit(GREY, false)], WELL]);
    const t = sit.turns;
    slots.push(t === 0 ? EMPTY : [[S('📖', '#C8A27C')], [S(pyStr(Math.min(t, 99999)), WHITE, null, true)], WELL]);
    const g = sit.git;
    if (none(g)) slots.push(EMPTY, EMPTY, EMPTY);
    else {
      slots.push([[S('⚑ ', '#FFFF55')], [S(short(g.branch, 6), WHITE, null, true)], WELL]);
      slots.push(!g.add ? EMPTY : [[S('▀▀', '#79C05A', '#866043')], [S('+' + kilo(g.add), '#55FF55', null, true)], WELL]);
      slots.push(!g.rem ? EMPTY : [[S('▒▒', '#5A5A5A', '#9A9A9A')], [S('-' + kilo(g.rem), '#FF5555', null, true)], WELL]);
    }
    // under half a cent still shows $0.01: a filled gold slot never says $0
    slots.push(sit.cost <= 0 ? EMPTY : [[S('▄▄', '#FCEE4B')], [S(money(Math.max(0.01, sit.cost)), WHITE, null, true)], WELL]);
    if (none(sit.extra_left)) slots.push(EMPTY);
    else slots.push([[S('◆ ', '#17DD62')], [S(money(sit.extra_left), '#17DD62', null, true)], paying(sit) ? '#10301C' : WELL]);
    slots.push(!sit.cwd ? EMPTY : [[S('🏠', GREY)], [S(short(basename(sit.cwd), 6), WHITE, null, true)], WELL]);
    const out = [SEL];
    slots.forEach(([ic, val, bg], i) => {
      out.push(...f1Slot(ic, val, bg));
      out.push(i === 0 ? SEL : i === 8 ? EDGE_R : RIDGE);
    });
    return merge(out);
  }

  const f1 = (sit) => [f1Line1(sit), f1Line2(sit), f1Line3(sit)];

  // =====================================================================================
  // FINALIST 2: DAY & NIGHT (4 lines; 16-cell gutter + 46-cell HUD block + text column)
  // =====================================================================================
  const G2 = 16, B2 = 46;
  const DIV = S(' ', null, '#5D5D5D');

  function f2Line1(sit) {
    // at least one space before the bubbles at col 42: 'Efficiency' becomes 'Eff' (as in Pocket), then
    // '(1M context)' shrinks, then the name is cut. No effort level: the model alone, an unenchanted item.
    const r = roman(sit.effort);
    let out = itemName(sit, G2 + 25, r ? [[S(' Efficiency ' + r, GREY)], [S(' Eff ' + r, GREY)]] : [[]]);
    const c = sit.cache;
    if (none(c)) return merge(out);
    out = pad(out, G2 + 26);                        // bubbles sit over the drumstick columns
    const hit = none(c.hit) ? [] : [S(' · ', DGREY), S(`hit ${pyStr(c.hit)}%`, GREY)];  // unknown: left out
    if (c.warm) {
      const left = c.ttl_left / (c.ttl / 10);
      const full = Math.trunc(left), drain = left - full > 1e-9 ? 1 : 0, spent = 10 - full - drain;
      out.push(S(rep('◦ ', spent), '#406580'), S(rep('○ ', drain), '#0094FF'), S(rep('◉ ', full), '#56B8FF'));
      const [mm, ss] = divmod(c.ttl_left, 60);
      out.push(S(`${pyStr(mm)}m${pad02(ss)}s`, '#56B8FF'), ...hit);
    } else {
      out.push(S(rep('◦ ', 10), '#406580'), S('cold', '#FF5555', null, true), ...hit);
    }
    return merge(out);
  }

  function f2Line2(sit) {
    let gut;
    if (none(sit.s5_left)) gut = pad([S('?', DGREY)], G2);   // no 5-hour limit given: dark hearts, no % or clock
    else {
      const p = pyStr(sit.s5_left) + '%';
      gut = [day(sit), S(t5(sit.s5_reset), GREY)];
      gut = [...gut, S(rep(' ', G2 - W(gut) - pyLen(p) - 1)), S(p, HEART, null, true), S(' ')];
    }
    const n = none(sit.s5_left) ? 0 : icons10(sit.s5_left);
    const hearts = [S(rep('♥ ', n), HEART), S(rep('♥ ', 10 - n), DARK)];
    const lv = sit.compactions;
    const lt = lv < 100 ? pyStr(lv) : '99';         // 100 or more shows 99 in yellow, like the counts
    // 6 cells: a space, the box (' 2 ' or ' 12 '), then what is left of the gap
    let gap = lv ? [S(' '), S(' ', null, '#000000'), S(lt, lv < 100 ? XPG : '#FFFF55', '#000000', true), S(' ', null, '#000000'),
      S(rep(' ', 3 - lt.length))] : [S('      ')];
    gap = pad(gap, 6);
    if (none(sit.wk_left)) return merge(rtrim([...gut, ...hearts, ...gap]));   // no weekly limit given: no food
    const f = icons10(sit.wk_left);
    const food = [S(rep('  ', 10 - f)), S(rep('🍗', f), FOOD)];
    const tail = [S(' '), S(pyStr(sit.wk_left) + '%', sit.wk_left <= 10 ? '#FF5555' : FOOD, null, true),
      S(' ↻ ' + twk(sit.wk_reset), GREY)];
    return merge([...gut, ...hearts, ...gap, ...food, ...tail]);
  }

  function f2Line3(sit) {
    const lab3 = ctxLabel(sit), gut = pad(W(lab3) > G2 - 1 ? lab3.slice(0, 1) : lab3, G2);   // a gap before the bar
    const fill = pyRound(sit.ctx_pct * B2 / 100);
    const cells = [];
    for (let b = 0; b < B2; b++) {
      const notch = b % 5 === 0;                    // right above every hotbar divider
      cells.push(S('▂', b < fill ? (notch ? '#436924' : '#8BCA59') : (notch ? '#141F19' : '#36433C')));
    }
    const tail = [S(' '), S(pyStr(sit.ctx_pct) + '%', pctColour(sit.ctx_pct))];
    // the full path when it fits in 110 cells, else its last segments after '…' ('…/company/project'); no cwd,
    // no spawn point
    if (sit.cwd) tail.push(S('  '), S('⌂ ' + tailPath(sit.cwd, MAXW - W(gut) - B2 - W(tail) - 4), GREY));
    return merge([...gut, ...cells, ...tail]);
  }

  function f2Well(icon, count, bg = WELL) {
    // 4 cells: icon box (2) + count (2, right-aligned, plain bold white digits like Minecraft)
    if (icon === null) return [S('    ', null, bg)];
    const out = icon.map((s) => withBg(s, bg));
    if (none(count) || count <= 1) out.push(S('  ', null, bg));
    else out.push(S(rjust(count < 100 ? pyStr(count) : '99', 2), count < 100 ? WHITE : '#FFFF55', bg, true));
    return out;
  }

  function f2Gutter(sit) {
    // the version and a space must leave the offhand at col 9 and the hotbar at col 16: else the 'v' goes,
    // then the version is cut. The line starts with it, so an unknown version is 'v?'.
    const vroom = (none(sit.extra_left) ? G2 : G2 - 7) - 1, v = sit.ver || '?';
    const ver = cellWidth('v' + v) <= vroom ? 'v' + v : cut(v, vroom);
    let gut = [S(ver, DGREY), S(' ')];
    if (!none(sit.extra_left)) {
      const lit = paying(sit), cash = Math.trunc(sit.extra_left);
      const fl = lit ? S('▐', '#17DD62', '#5D5D5D') : DIV;
      const fr = lit ? S('▌', '#17DD62', '#5D5D5D') : DIV;
      // no whole dollar left: an empty offhand well (a bare ◆ would read as one emerald)
      gut = [...pad(gut, G2 - 7), fl, ...(cash >= 1 ? f2Well([S('◆ ', '#17DD62')], cash) : f2Well(null, null)), fr, S(' ')];
    }
    return pad(gut, G2);
  }
  // the hotbar's mint selection frame and the wells Day & Night fills (the Your-mix concept below shares them)
  const F2SEL_L = S('▐', '#D5E8D0', '#5D5D5D'), F2SEL_R = S('▌', '#D5E8D0', '#5D5D5D');
  const f2Pick = (sit) => f2Well([S('⛏ ', get(TIER, family(sit.model), GREY))], null, glint(sit.effort));
  const f2Book = (sit) => (sit.turns ? f2Well([S('📖', '#C8A27C')], sit.turns) : f2Well(null, null));
  const f2Gold = (sit) => (sit.cost > 0 ? f2Well([S('▄▄', '#FCEE4B')], Math.max(1, Math.trunc(sit.cost))) : f2Well(null, null));

  function f2Line4(sit) {
    const gut = f2Gutter(sit);
    const hb = [F2SEL_L, ...f2Pick(sit), F2SEL_R];
    const items = [];
    items.push(f2Book(sit));
    items.push(f2Gold(sit));
    while (items.length < 8) items.push(f2Well(null, null));
    for (const it of items) hb.push(...it, DIV);
    let tail = [];
    const g = sit.git;
    if (g) {
      const counts = [S(' '), S('+' + kilo(g.add), '#55FF55'), S(' '), S('-' + kilo(g.rem), '#FF5555')];
      // the branch in full when the line stays within 110 cells, else shortened from the front like the path on
      // line 3 ('…/npm_and_yarn/typescript-8.6.3'): its end is what tells branches apart
      const branch = tailPath(g.branch, MAXW - W(gut) - W(hb) - W([S(' ⎇ ')]) - W(counts));
      tail = [S(' '), S('⎇ ', GREY), S(branch, WHITE), ...counts];
    }
    return merge([...gut, ...hb, ...tail]);
  }

  const f2 = (sit) => [f2Line1(sit), f2Line2(sit), f2Line3(sit), f2Line4(sit)];

  // =====================================================================================
  // YOUR MIX (round 5): Day & Night with the three changes picked, each a choice (round5/mix-spec.json)
  // =====================================================================================
  // Lines 1-3 are Day & Night's own (the same functions). Line 4 keeps Day & Night's gutter and 46-cell hotbar with
  // ONE slot order for every option: slot 1 (cols 17-20) the pickaxe, drawn by the pick option; slot 2 (cols 22-25)
  // the book, only with book 'on' (default off: an empty well); slot 3 (cols 27-30) the gold ingot for the cost;
  // slots 4-8 empty; slot 9 (cols 57-60) the git item, drawn by the git option; from col 62 the git readout, also
  // the git option's. Each option writes only its own cells, so every combination keeps the grid.
  const ENCH = '#FF55FF', PLUS = '#55FF55', MINUS = '#FF5555';
  const LEVEL = { low: 1, medium: 2, high: 3, xhigh: 4, max: 5 };
  const level = (e) => get(LEVEL, e.toLowerCase(), 0);          // 0: no effort, or one we do not know ('turbo')
  const pickaxe = (sit, g) => S('⛏ ', get(TIER, family(sit.model), GREY), g);
  const MIX_PICK = {
    // Survival's slot 1 in 4 cells: the level as ONE character, Ⅰ-Ⅴ (U+2160-2164). Cascadia has none of them: WT takes
    // them from Yu Gothic UI, monochrome (so the pink applies) and 1 cell, in both icon styles. The pad cell (col 20)
    // stays in the numeral's span, because WT colours ink that crosses into a cell with that cell's fg (Ⅳ's reaches
    // 0.57 into col 20). Ink clears the colour pickaxe (ends 0.13 into col 19) by 0.14 cell or more.
    'pick-numeral': (sit) => {
      const n = level(sit.effort), g = glint(sit.effort);
      return [pickaxe(sit, g), n ? S('ⅠⅡⅢⅣⅤ'[n - 1] + ' ', ENCH, g, true) : S('  ', null, g)];
    },
    // round 4's Day & Night: the pickaxe alone on the glint, the level only in line 1's tooltip
    'pick-daynight': f2Pick,
    // the level as a Cascadia digit 1-5 in col 20: no fallback font, the same on every machine
    'pick-levelDigit': (sit) => {
      const n = level(sit.effort), g = glint(sit.effort);
      return n ? [pickaxe(sit, g), S(' ', null, g), S(pyStr(n), ENCH, g, true)] : [pickaxe(sit, g), S('  ', null, g)];
    },
  };
  // Git items for slot 9, all WT builtin glyphs (U+2580-259F: exact cell shapes, the same in both icon styles).
  const GRASS = S('▀▀', '#79C05A', '#866043');                 // Survival's grass block: green top over dirt
  const COBBLE = S('▒▒', '#5A5A5A', '#9A9A9A');                // Survival's cobblestone
  const BARE = S('  ', null, WELL);
  const LOWER8 = ['', '▁', '▂', '▃', '▄', '▅', '▆', '▇'], LEFT8 = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];
  const changed = (g) => !!g && (g.add > 0 || g.rem > 0);
  const gitBlocks = (g) => [g.add ? GRASS : BARE, g.rem ? COBBLE : BARE];   // grass always left, cobblestone right
  function gitPile(g) {                                        // the smaller count is a slab of its share, 2/8 to 7/8 high
    const big = Math.max(g.add, g.rem);
    const one = (n, full, colour) => (n <= 0 ? BARE : n >= big ? full
      : S(rep(LOWER8[Math.min(7, Math.max(2, pyRound((8 * n) / big)))], 2), colour, WELL));
    return [one(g.add, GRASS, '#79C05A'), one(g.rem, COBBLE, '#9A9A9A')];
  }
  function gitBar(g) {                                         // a durability bar: green share at 1/8 cell, 1 cell per digit
    const t = g.add + g.rem, L = Math.min(4, pyStr(t).length), E = 8 * L;
    let ge = pyRound((E * g.add) / t);
    if (g.add > 0 && g.rem > 0) ge = Math.min(E - 1, Math.max(1, ge));   // both kinds of change always show
    const out = [];
    for (let i = 0; i < 4; i++) {
      const f = ge - 8 * i;
      out.push(i >= L ? S(' ', null, WELL) : f >= 8 ? S('█', '#5DA130', '#B0302A') : f <= 0 ? S(' ', null, '#B0302A')
        : S(LEFT8[f], '#5DA130', '#B0302A'));
    }
    return out;
  }
  // The readouts start at col 62. The branch is whole while line 4 stays within 110 cells, else shortened from the
  // front ('…/npm_and_yarn/typescript-8.6.3'); kilo() keeps each count to 5 characters, so it always has 30 cells.
  function spillReadout(g, used) {                             // the exact counts first, like a stack count, then the branch
    const lead = [];
    if (g.add) lead.push(S(' '), S('+' + kilo(g.add), PLUS, null, true));
    if (g.rem) lead.push(S(' '), S('-' + kilo(g.rem), MINUS, null, true));
    lead.push(S(changed(g) ? '  ' : ' '), S('⎇ ', GREY));
    return [...lead, S(tailPath(g.branch, MAXW - used - W(lead)), WHITE)];
  }
  function sideReadout(g, used) {                              // a framed slot of its own holding both counts, then the branch
    const cnt = (sign, n, colour) => S(sign + kilo(n), n ? colour : DGREY, WELL, n > 0);   // a 0 stays, in grey
    const head = changed(g)
      ? [S(' '), DIV, S(' ', null, WELL), cnt('+', g.add, PLUS), S(' ', null, WELL), cnt('-', g.rem, MINUS), S(' ', null, WELL), DIV, S(' '), S('⎇ ', GREY)]
      : [S(' '), S('⎇ ', GREY)];                               // nothing changed: no slot
    return [...head, S(tailPath(g.branch, MAXW - used - W(head)), WHITE)];
  }
  const MIX_GIT = {                                            // [slot 9 item or null, readout]
    'git-spill': [gitBlocks, spillReadout],
    'git-sideSlot': [null, sideReadout],
    'git-pile': [gitPile, spillReadout],
    'git-bar': [gitBar, spillReadout],
  };
  // ---------- round 6 (round6/round6-spec.json): more git and book options; four of them read the session's history ----------
  // Cell ownership is fixed, so every git option works with every book option and every pick option, and no cell is
  // shared: pick = slot 1 (cols 17-20); book = slot 2 (cols 22-25) and slots 4-6 (cols 32-35, 37-40, 42-45); gold = slot 3
  // (cols 27-30, nobody's option); git = slots 7-9 (cols 47-50, 52-55, 57-60) and the readout from col 62. A round-6 option
  // returns wells only for the slots it draws ({2, 4, 5, 6} or {7, 8, 9}, plus `readout` for a git option); a slot it leaves
  // out is the round-5 pick: the book ('on') in slot 2, the grass & stone pile (git-pile) and its readout for slot 9,
  // empty wells in slots 4-8. The round-5 options (book off/on, git-spill/sideSlot/pile/bar) draw exactly as before.
  // Every glyph is WT builtin (U+2580-259F, U+1FB00-1FB3B: exact cell shapes in our fg on our bg, both icon styles) except
  // the probed 📖 📘 🛏 (colour emoji, at the start of their slot) and the pickaxe's Yu Gothic UI numerals Ⅰ-Ⅴ.
  const YELLOW = '#FFFF55', BOOK_FG = '#C8A27C';
  const LOW9 = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];    // lower eighths: index = height in eighths
  const bare = (n) => S(' '.repeat(n), null, WELL);
  function count2(n, max = 99, bg = WELL) {                    // a stack count in a slot's last 2 cells: hidden at 0 and 1,
    if (!(n > 1)) return S('  ', null, bg);                    // bold white right-aligned up to `max`, above it `max` in yellow
    return n > max ? S(rjust(pyStr(max), 2), YELLOW, bg, true) : S(rjust(pyStr(Math.floor(n)), 2), WHITE, bg, true);
  }
  function sext(m) {                                           // the sextant of a 6-bit dot mask (WT builtin): bits 1 top-left,
    if (m === 0) return ' ';                                   // 2 top-right, 4 middle-left, 8 middle-right, 16 bottom-left,
    if (m === 63) return '█';                                  // 32 bottom-right
    if (m === 21) return '▌';
    if (m === 42) return '▐';
    return String.fromCodePoint(0x1fb00 + m - 1 - (m > 21 ? 1 : 0) - (m > 42 ? 1 : 0));
  }
  function pixels(rows, fg, bg) {                              // 3 rows of 'X' / '.' (2 dots per cell) -> one span per cell
    const out = [];
    for (let c = 0; c < rows[0].length / 2; c++) {
      let m = 0;
      rows.forEach((r, y) => { if (r[2 * c] === 'X') m |= 1 << (2 * y); if (r[2 * c + 1] === 'X') m |= 2 << (2 * y); });
      out.push(S(sext(m), fg, bg));
    }
    return out;
  }
  // state.hist, read (see fromState): null = no history at all, and every option draws its no-history form
  const QUARTER = 900, QUARTERS = 8;                           // 15-minute buckets, 8 of them (the last two hours)
  const histTime = (v, lo, hi) => { const n = num(v); return n === undefined ? null : clamp(n, lo, hi); };
  // lastCommit.branch is only compared with fromState's branch, never printed, and Hungerbar saves that branch as it is
  // (B = fromState(state).git.branch), so a string is read as saved, not tidied again (tidy is not idempotent on a cut it
  // made: '…' + a 256-code-point last name would be cut again). A string over 4096 UTF-16 code units matches no branch:
  // a saved one is at most about 260 code points, so only a damaged cache holds a longer one. A number (a hand-made cache)
  // is tidied like fromState's branch.
  const histBranch = (v) => (typeof v === 'string' ? (v.length > 4096 ? null : v)
    : typeof v === 'number' && Number.isFinite(v) ? tidy(v, true, -256) || 'HEAD' : null);
  function readHist(h0) {
    if (h0 === null || typeof h0 !== 'object' || Array.isArray(h0)) return null;
    const n0 = num(h0.now);
    if (n0 === undefined || n0 < 0) return null;               // no clock: a first render, or a lost or corrupt cache
    // a now above 1e11 is milliseconds (1e11 s is the year 5138, Date.now() about 1.7e12): every time / 1000, every bucket
    // index floor(index / 1000) (= floor(seconds / 900) of the quarter hour it began in)
    const unit = n0 > 1e11 ? 1000 : 1;
    const now = Math.min(1e13, n0 / unit);
    const secs = (v) => { const n = num(v); return n === undefined ? undefined : n / unit; };
    const lc = h0.lastCommit !== null && typeof h0.lastCommit === 'object' && !Array.isArray(h0.lastCommit) ? h0.lastCommit : null;
    // a commit 'in the future' (the clock went back further than the cache update saw) is no commit: no boom
    const at0 = lc ? secs(lc.at) : undefined, at = at0 === undefined || at0 > now ? null : Math.max(0, at0);
    const I0 = Math.floor(now / QUARTER), buckets = new Map();
    if (Array.isArray(h0.buckets)) for (const b of h0.buckets.slice(-64)) {   // a huge list costs nothing: its last 64 only
      if (!Array.isArray(b)) continue;
      const k0 = num(b[0]);
      if (k0 === undefined || Math.floor(k0) !== k0) continue;
      const k = unit === 1 ? k0 : Math.floor(k0 / unit);
      if (k > I0 || k <= I0 - QUARTERS) continue;
      buckets.set(k, [k, whole(b[1]), whole(b[2]), whole(b[3]), b[4] === 1 || b[4] === true ? 1 : 0]);   // a later one wins
    }
    return {
      now,
      sessionStart: histTime(secs(h0.sessionStart), 0, now),
      dirtySince: histTime(secs(h0.dirtySince), 0, now),
      commits: whole(h0.commits),
      lastCommit: at === null ? null : { at, add: whole(lc.add), del: whole(lc.del), branch: histBranch(lc.branch) },
      buckets: [...buckets.values()].sort((a, b) => a[0] - b[0]),
    };
  }
  // git: heaps one step taller per digit of added + removed (5 or more digits fill the slot)
  const heap = (t) => {
    const d = t >= 1 ? pyStr(Math.floor(t)).length : 0;
    return d >= 5 ? [8, 8, 8, 8] : [Math.max(1, 2 * d - 2), 2 * d, 2 * d, Math.max(1, 2 * d - 2)];
  };
  const hex2 = (v) => v.toString(16).toUpperCase().padStart(2, '0');
  function balanceColour(add, rem) {                           // 9 steps from the + colour through yellow to the - colour
    let s = pyRound((8 * add) / (add + rem));
    if (add > 0 && rem > 0) s = clamp(s, 1, 7);                // pure green only when nothing was removed, pure red the reverse
    const R = s >= 4 ? 0x55 + pyRound((0xaa * (8 - s)) / 4) : 0xff, G = s >= 4 ? 0xff : 0x55 + pyRound((0xaa * s) / 4);
    return `#${hex2(R)}${hex2(G)}55`;
  }
  // git-mossy: 8 x 3 dots, the first `moss` of a Bayer spread (2 x the 4 x 4 matrix's top 3 rows, + 1 in the right half) are moss
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9]], MOSS_ORDER = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 8; x++) MOSS_ORDER.push({ x, y, key: 2 * BAYER[y][x % 4] + (x >= 4 ? 1 : 0) });
  MOSS_ORDER.sort((a, b) => a.key - b.key);
  function mossWell(g) {
    let m = pyRound((24 * g.add) / (g.add + g.rem));
    if (g.add > 0 && g.rem > 0) m = clamp(m, 1, 23);           // both kinds always show
    if (m === 0) return [S('▒▒▒▒', '#5A5A5A', '#9A9A9A')];  // only removed: git-pile's cobblestone over the whole slot
    if (m === 24) return [S('▒▒▒▒', '#4E7F2E', '#79C05A')];    // only added: a moss block
    const mask = [0, 0, 0, 0];
    for (const p of MOSS_ORDER.slice(0, m)) mask[p.x >> 1] |= 1 << (2 * p.y + (p.x & 1));
    return mask.map((k) => S(sext(k), '#6DB04E', '#7A7A7A'));
  }
  // a commit on the current branch `secs` or less ago (hist.lastCommit: only a real commit, see fromState), else null.
  // A repo may always keep old uncommitted edits, so a commit counts even when some changes stay uncommitted.
  const justCommitted = (g, h, secs) => {
    const lc = h && h.lastCommit;
    return lc && lc.branch === g.branch && h.now - lc.at < secs ? lc : null;
  };
  // git-wheat (slot 8): one growth stage per 10 minutes the changes have waited (hist.dirtySince), ripe (gold) from 70 minutes;
  // a hay bale with the session's commits on it when the tree is clean, and for a minute after any commit
  const SOIL = '#3D2814';
  const wheatFg = (s) => (s <= 3 ? '#4DB83A' : s <= 5 ? '#8DBE3C' : s === 6 ? '#C5B843' : '#E3BE4E');
  function wheat(sit, h) {
    const g = sit.git;
    if (!g) return {};
    const n = h ? h.commits : 0, bale = { 8: [S('▒▒', '#9C7A1E', '#DDB840'), count2(n)] };   // harvested
    if (justCommitted(g, h, 60)) return bale;                  // even when some changes stay uncommitted
    if (changed(g)) {
      const s = !h || h.dirtySince === null ? 0 : Math.min(7, Math.floor((h.now - h.dirtySince) / 600)), fg = wheatFg(s);
      return { 8: [s + 1, s, s + 1, s].map((k) => S(LOW9[k], fg, SOIL)) };
    }
    return n >= 1 ? bale : {};
  }
  // git-terrain (slots 7-8): the last two hours, one column per quarter hour (col 55 = now). Heights are absolute, one step per
  // digit like the heaps: 2 x log10(1 + v) eighths, at least 2/8 (above the 1/8 ground line of a clean quarter hour), so 1-10
  // lines are 2/8, 100 4/8, 1000 6/8 and 10,000 or more full, and a column keeps its height as it moves left. A quarter hour
  // is drawn the same while it is current and after it has passed: col 55 is the current bucket as this render's cache
  // update leaves it (its maxT, add and del raised to the live counts when those are bigger), so it never drops while its
  // quarter lasts, and it turns gold the moment a commit is seen in it, like any past quarter with a commit.
  const terrainLevel = (v) => clamp(pyRound(2 * Math.log10(1 + v)), 2, 8);
  function terrain(sit, h) {
    const g = sit.git;
    if (!g) return {};
    const T = g.add + g.rem, shown = [];
    if (h) {
      const I0 = Math.floor(h.now / QUARTER), at = (k) => h.buckets.find((b) => b[0] === I0 - (QUARTERS - 1) + k) || null;
      for (let k = 0; k < QUARTERS - 1; k++) shown.push(at(k));
      const cur = at(QUARTERS - 1);
      shown.push(cur && cur[1] >= T ? cur : [I0, T, g.add, g.rem, cur ? cur[4] : 0]);
    } else {                                                   // no history: now only
      for (let k = 0; k < QUARTERS - 1; k++) shown.push(null);
      shown.push(T > 0 ? [0, T, g.add, g.rem, 0] : null);
    }
    if (!shown.some((b) => b && (b[1] > 0 || b[4]))) return {};    // nothing changed or saved in two hours
    const col = (b) => {
      if (!b) return S(' ', null, WELL);                       // Hungerbar did not render then
      if (b[1] === 0) return S('▁', b[4] ? '#FCEE4B' : '#866043', WELL);   // bare ground (clean), gold if a commit
      return S(LOW9[terrainLevel(b[1])], b[4] ? '#FCEE4B' : b[2] >= b[3] ? '#79C05A' : '#9A9A9A', WELL);
    };
    return { 7: shown.slice(0, 4).map(col), 8: shown.slice(4).map(col) };
  }
  // git-creeper (slot 9 and, after a commit, the readout)
  const FACE = '#0E1A0A', SKIN = '#5DB547', SWELL = '#A6E08F';
  const CREEPER = ['.XX..XX.', '..XXXX..', '..X..X..'];
  const BOOM = [['X..XX..X', '.XXXXXX.', 'X..XX..X'], '#FFF4C2', '#E8601C'];
  const SMOKE = [['.XX...X.', 'XXXX.XXX', '.XX.XXX.'], '#BDBDBD', WELL];
  const CRATER = [['X......X', 'XX....XX', 'XXXXXXXX'], '#866043', WELL];
  function committedReadout(g, lc, used) {                     // ' committed +3019 -992  ⎇ feature/hotbar'
    const lead = [S(' '), S('committed', GREY)];
    if (lc.add) lead.push(S(' '), S('+' + kilo(lc.add), PLUS));
    if (lc.del) lead.push(S(' '), S('-' + kilo(lc.del), MINUS));
    lead.push(S('  '), S('⎇ ', GREY));
    return [...lead, S(tailPath(g.branch, MAXW - used - W(lead)), WHITE)];
  }
  function creeper(sit, h) {
    const g = sit.git;
    if (!g) return {};
    const T = g.add + g.rem;
    // the commit first: it explodes (under 30 s) and smokes (30-59 s) even when some changes stay uncommitted; from 60 s the
    // creeper of what is still uncommitted, or the crater (to 299 s) when nothing is
    const lc = justCommitted(g, h, T === 0 ? 300 : 60);
    if (lc) {
      const age = h.now - lc.at, [rows, fg, bg] = age < 30 ? BOOM : age < 60 ? SMOKE : CRATER;
      return { 9: pixels(rows, fg, bg), readout: (g1, used) => committedReadout(g1, lc, used) };
    }
    if (T === 0) return {};
    if (T < 100) return { 9: [bare(1), S('▚▞', FACE, SKIN), bare(1)] };   // a baby
    const odd = !!h && Math.floor(h.now / 10) % 2 === 1;       // the hiss flashes every other 10-second tick
    const skin = T < 1000 ? SKIN : T < 3000 ? SWELL : odd ? '#F4F4F4' : T < 10000 ? SWELL : '#7CCBFF';
    return { 9: pixels(CREEPER, FACE, skin) };
  }
  const MIX_GIT6 = {                                           // (sit, hist) -> { 7, 8, 9: wells, readout(g, used) }
    'git-balanceMound': (sit) => (changed(sit.git) ? { 9: [S(heap(sit.git.add + sit.git.rem).map((k) => LOW9[k]).join(''),
      balanceColour(sit.git.add, sit.git.rem), WELL)] } : {}),
    'git-mixedHeap': (sit) => {
      const g = sit.git;
      if (!changed(g)) return {};
      const t = g.add + g.rem, gc = g.rem === 0 ? 4 : g.add === 0 ? 0 : clamp(pyRound((4 * g.add) / t), 1, 3);
      return { 9: heap(t).map((k, i) => S(LOW9[k], i < gc ? PLUS : MINUS, WELL)) };
    },
    'git-mossy': (sit) => (changed(sit.git) ? { 9: mossWell(sit.git) } : {}),
    'git-wheat': wheat,
    'git-terrain': terrain,
    'git-creeper': creeper,
  };
  // book options: (sit, hist) -> { 2, 4, 5, 6: wells }
  const SPINES = ['#B03A2E', '#2E5FA8', '#3E8E3E', '#C8A040', '#7A3E9C'], WOOD = '#5A3B1E';
  // book-enchant's glow: deeper with the messages and never lighter again (round 4's GLINT ladder, then one more step at 300)
  const glow = (n) => (n < 25 ? '#201E07' : n < 50 ? '#26192A' : n < 75 ? '#2E1A3A' : n < 200 ? '#3A1D4A' : n < 300 ? '#48205C' : '#561F6E');
  const MIX_BOOK6 = {
    'book-volumes': (sit) => {                                 // a book holds 100 messages: 📘 books in slot 4, 📖 the rest
      const n = sit.turns;
      if (n < 100) return {};
      const p = n % 100;                                       // 0: the book just filled up, so slot 2 is empty (📖 alone is 1)
      return { 2: p === 0 ? f2Well(null, null) : [S('📖', BOOK_FG, WELL), count2(p)], 4: [S('📘', '#6F9BD8', WELL), count2(Math.floor(n / 100))] };
    },
    'book-stacks': (sit) => {                                  // stacks of 64 in slots 2, 4, 5, 6
      const n = sit.turns, out = {};
      [2, 4, 5, 6].forEach((slot, i) => {
        const c = clamp(n - 64 * i, 0, 64);
        out[slot] = c > 0 ? [S('📖', BOOK_FG, WELL), i === 3 && n > 256 ? S('64', YELLOW, WELL, true) : count2(c, 64)] : f2Well(null, null);
      });
      return out;
    },
    'book-shelf': (sit) => {                                   // a half-cell spine per 10 messages, 8 per shelf in slots 4-6
      const books = Math.min(24, Math.floor(sit.turns / 10)), out = {};
      [4, 5, 6].forEach((slot, j) => {
        if (books <= 8 * j) return;
        out[slot] = [0, 1, 2, 3].map((c) => {
          const s = 8 * j + 2 * c;
          return s < books ? S('▌', SPINES[s % 5], s + 1 < books ? SPINES[(s + 1) % 5] : WOOD) : S(' ', null, WOOD);
        });
      });
      return out;
    },
    'book-bed': (sit, h) => {                                  // a break in a long, big session: the cheapest moment for /clear
      const cold = !none(sit.cache) && sit.cache.cold === true && sit.turns >= 1;   // Claude Code said cold, not just unknown
      const mins = h && h.sessionStart !== null ? Math.floor((h.now - h.sessionStart) / 60) : null;
      const long = sit.turns >= 50 || sit.compactions >= 2 || (mins !== null && mins >= 120), big = sit.ctx_pct >= 50 || sit.compactions >= 2;
      return cold && long && big ? { 4: [S('🛏   ', '#FF5555', WELL)] } : {};   // ONE span: the colour bed's ink stays in its pad
    },
    'book-enchant': (sit) => {                                 // today's count (a yellow 99 from 100 messages) on the glow, which
      const n = sit.turns;                                     // takes the hundreds: nothing on the slot ever counts down, and
      if (n <= 0) return {};                                   // the pickaxe's Ⅰ-Ⅴ stay the only Roman numerals on the line
      const bg = glow(n);
      return { 2: [S('📖', BOOK_FG, bg), count2(n, 99, bg)] };
    },
  };
  function mixLine4(sit, o, h) {
    const gut = f2Gutter(sit);
    // round 5's options as they were; a round-6 option draws its own slots and leaves the rest to the round-5 pick
    const bw = o.book === 'off' ? { 2: f2Well(null, null) } : own(MIX_BOOK6, o.book) ? MIX_BOOK6[o.book](sit, h) : {};
    let gw;
    if (own(MIX_GIT, o.git)) {
      const [item, readout] = MIX_GIT[o.git];
      gw = { 9: item && changed(sit.git) ? item(sit.git) : f2Well(null, null), readout };   // no repo, or nothing changed: empty
    } else gw = MIX_GIT6[o.git](sit, h);
    const wells = [bw[2] || f2Book(sit), f2Gold(sit), bw[4], bw[5], bw[6], gw[7], gw[8], gw[9] || (changed(sit.git) ? gitPile(sit.git) : null)];
    const hb = [F2SEL_L, ...MIX_PICK[o.pick](sit), F2SEL_R];
    for (const w of wells) hb.push(...(w || f2Well(null, null)), DIV);
    const tail = sit.git ? (gw.readout || spillReadout)(sit.git, W(gut) + W(hb)) : [];   // outside a repo nothing follows the hotbar
    return merge([...gut, ...hb, ...tail]);
  }
  const MIX_OPTIONS = {
    git: [
      { id: 'git-spill', name: 'Grass & cobblestone in slot 9',
        note: 'The last hotbar slot holds your git changes as two Minecraft blocks: a grass block when you added lines, a cobblestone block when you removed lines. The exact numbers come right after the slot, green +1208 added and red -279 removed, like a stack count spilling out of it, and then your branch.' },
      { id: 'git-sideSlot', name: 'Both numbers in a slot of their own',
        note: 'A slot right after the hotbar holds both numbers exactly: green +1208 is lines added, red -279 is lines removed. It looks like the emerald slot on the left, mirrored. After it comes only your branch. The slot appears with your first change and goes away after a commit.' },
      { id: 'git-pile', name: 'Grass & stone pile',
        note: 'Like the grass and cobblestone slot, but the blocks also show which is bigger: the bigger count is a full block and the smaller one shrinks to a low slab. 1208 added and 279 removed is a full grass block with a thin stone slab beside it. The exact numbers come right after the slot.' },
      { id: 'git-bar', name: 'Durability bar',
        note: 'Slot 9 shows a small green and red bar, like the bar under a worn Minecraft tool: green is the share of lines added, red the share removed. The bar gets one cell longer for every extra digit: under 10 changed lines 1 cell, under 100 2 cells, under 1000 3 cells, from 1000 the whole slot. The exact numbers come right after the slot.' },
      // round 6 (round6/round6-spec.json)
      { id: 'git-balanceMound', name: 'One heap, coloured by the balance',
        note: 'The idea of "more added, more green; more removed, more red": one heap fills the last slot, and its colour is the balance. Green when you only added, yellow when added and removed are about equal, red when you mostly removed, and the steps in between. Its size is all your changed lines together (added + removed), one step taller for every digit: 15 lines is a low heap, 1487 a hill, 10,000 or more fills the slot.' },
      { id: 'git-mixedHeap', name: 'One heap, part green, part red',
        note: 'The idea of "green and red": the same heap, built from green cells for lines added (on the left) and red cells for lines removed (on the right). Count the cells: 3 green and 1 red means about three quarters of your changes are added lines, 2 and 2 half and half. Like the coloured heap, it gets one step taller for every digit of all the lines changed together.' },
      { id: 'git-mossy', name: 'Mossy cobblestone',
        note: 'The idea of "a mix of them", as a real Minecraft block: grey cobblestone for the lines you removed, with green moss growing on it for the lines you added. The more you added, the more moss: all moss means you only added, plain cobblestone means you only removed, half and half is a checkerboard. The exact numbers stay right after the slot.' },
      { id: 'git-wheat', name: 'Wheat field: ripens until you commit',
        note: "Your pile stays in the last slot. Next to it, slot 8 is a small wheat field that shows how long your uncommitted changes have been waiting: it counts from the first time the status line saw them after a clean tree, a commit or a branch switch, and when a session starts with changes already there, from the time the oldest changed file was last saved. It grows one step every 10 minutes and turns golden after 70 minutes. Ripe wheat means: time to commit. Committing is the harvest: the field becomes a hay bale with the number of commits in this session on it (no number after the first, as Minecraft hides a count of 1). When you commit only part of your changes, the hay bale shows for a minute, then the rest grows again from a sprout." },
      { id: 'git-terrain', name: 'The last two hours as a landscape',
        note: "Your pile stays in the last slot. Slots 7 and 8 draw a side view of the last two hours, one column for every 15 minutes, with now on the right next to the pile. Each column is the biggest change that waited in its 15 minutes, one step taller for every digit like the heaps: 1 to 10 lines is a low bump, 100 about half the cell, 1000 high, 10,000 or more fills it. So a small change looks small, and a column keeps its height as it moves left: you see the hills grow while you work. Green when you mostly added, grey when you mostly removed, a brown ground line when there was nothing to commit. Gold means you committed in those 15 minutes: the column for now turns gold the moment you commit and keeps its height." },
      { id: 'git-creeper', name: 'Creeper: it swells, hisses and explodes when you commit',
        note: "The wild one. Your uncommitted change is a creeper, and its size is all your changed lines together (added + removed): a baby under 100 lines, grown up under 1000, then it swells, and from 3000 it hisses (flashes white every other 10 seconds) to tell you to commit; from 10,000 lines it is a charged creeper, light blue between the white flashes. When you commit it explodes, even if some changes stay uncommitted: half a minute of explosion, then half a minute of smoke, while the text says what the commit saved: committed +3081 -1007. Then the creeper of what is still uncommitted is back; if nothing is left, a crater stays with that text, and after 5 minutes the slot is empty. Stashing or throwing away your changes is not a commit, so the creeper just goes away, and a pull, reset or rebase never explodes either." },
    ],
    pick: [
      { id: 'pick-numeral', name: 'Ⅲ beside the pickaxe',
        note: "Like Survival's first slot: the pickaxe with its effort level as a pink Roman number on the purple glow (Ⅰ low, Ⅱ medium, Ⅲ high, Ⅳ xhigh, Ⅴ max). It is one special character, so it fits in Day & Night's small slot. The first line still says Efficiency III." },
      { id: 'pick-daynight', name: 'Day & Night',
        note: 'The pickaxe alone on its purple glow, as in round 4. The glow gets deeper as the effort goes up, and the level is written only on the first line (Efficiency III).' },
      { id: 'pick-levelDigit', name: 'Level number beside the pickaxe',
        note: "The pickaxe with the effort level as a pink number from 1 to 5 (3 = high) in the slot's corner. It uses the terminal's own font, so it looks the same on every computer. The first line still says Efficiency III." },
    ],
    book: [
      { id: 'off', name: 'No book',
        note: 'Slot 2 stays an empty slot. Nothing else on the line moves.' },
      { id: 'on', name: 'Book: messages you sent',
        note: 'Slot 2 shows a book with the number of messages you have sent Claude in this session: 42 means you have asked Claude 42 times since the session started. One message shows no number (Minecraft hides a count of 1), 100 or more shows 99 in yellow, and before your first message the slot is empty. Nothing else on the line moves.' },
      // round 6 (round6/round6-spec.json)
      { id: 'book-volumes', name: 'A book holds 100 messages',
        note: "Like Minecraft's book and quill, which holds 100 pages, each book holds 100 of your messages, so nothing is stuck at 99 any more. Below 100 the slot is the same as today. At 100 the book is full: it becomes a closed blue book in slot 4 (with 2, 3 ... when there are more), and the book slot stays empty until your next message opens a new book. So 100 messages is one blue book alone, 101 is a blue book and 📖, and 152 is a blue book and 📖52." },
      { id: 'book-stacks', name: 'Stacks of 64 fill the hotbar',
        note: 'The idea of "more messages, more books to fill the slots", the Minecraft way: a stack holds 64 books. Your messages fill the book slot up to 64, then the 65th starts a new stack in slot 4, then slot 5 and slot 6. 152 messages are 64 + 64 + 24, so the hotbar shows how long the session has been. Past 256 the last stack shows a yellow 64.' },
      { id: 'book-shelf', name: 'A bookshelf fills up',
        note: 'The book keeps its number in slot 2, as today. Every 10 messages put one more coloured book on a bookshelf in the empty slots 4, 5 and 6, 8 books per shelf. 42 messages are 4 books, 152 are one full shelf and 7 books on the next, so past 99 you still see the session grow. A full library is 240 messages.' },
      { id: 'book-bed', name: 'A bed when starting fresh would help',
        note: 'An answer to "is a long session bad?": not by itself, so the book stays as it is. A bed appears in slot 4 only when starting fresh would really help: you took a break (5 minutes without a message, so the prompt cache went cold), the session is long (50+ messages, 2+ hours, or compacted twice) and the conversation is big (context 50% or more, or compacted twice). Your next message would have to re-read everything anyway, so that is the cheapest moment for /clear or a new session. The bed goes away with your next message.' },
      { id: 'book-enchant', name: 'Enchanted book for a long session',
        note: "The other answer: a long session is an achievement. The book keeps today's number and the slot glows purple as the session grows, like your enchanted pickaxe: a little at 25 messages, more at 50 and 75, deeper at 200 and deepest from 300. From 100 messages the number stays at a yellow 99, as today, while the glow counts on, so nothing on the slot ever counts down. The pickaxe keeps the only Roman number on the line, so Ⅳ always means the effort." },
    ],
    // round 7 (round7/round7-spec.json): Fable's own weekly limit (state.scoped), drawn by MIX_FABLE below
    fable: [
      { id: 'fable-off', name: 'No Fable (as today)',
        note: 'Nothing about Fable on the status line, as today. Every line stays exactly as it is now.' },
      { id: 'fable-tail', name: 'Fable next to your weekly food',
        note: "While you use Opus, Fable is a small grey note after your weekly: 'Fable 65% ↻ 4d00h' means 65% of your Fable week is left and it is full again in 4 days. The % turns red at 10% or less, and when Fable is used up, as today, it says 'Fable 0% ↻ 19h00m': back in 19 hours. When you use Fable, the word Fable turns pink and ten small hexagons count what is left, like the drumsticks: 4 pink hexagons is about 40% left, ten dark ones means used up." },
      { id: 'fable-mount', name: 'Riding Fable: horse hearts take the food row',
        note: "While you use Opus, Fable is a small grey note after your weekly: 'Fable 65% ↻ 4d00h' means 65% of your Fable week is left and it is full again in 4 days. The % turns red at 10% or less, and when Fable is used up, as today, it says 'Fable 0% ↻ 19h00m': back in 19 hours. When you switch to Fable you are riding it: as on a horse in Minecraft, orange horse hearts take the place of the drumsticks, one heart for every 10% of Fable left, with its % and reset time after them. Your weekly is still there, as words with a drumstick: '🍗 18% ↻ 3d23h'." },
      { id: 'fable-tooltip', name: "Fable's wear on the item in your hand",
        note: "While you use Opus, Fable is a small grey note after your weekly: 'Fable 65% ↻ 4d00h' means 65% of your Fable week is left and it is full again in 4 days. The % turns red at 10% or less, and when Fable is used up, as today, it says 'Fable 0% ↻ 19h00m': back in 19 hours. When you use Fable, the first line, which names the model in your hand, also shows how worn it is, like a Minecraft tool: 'Fable 5.1 Eff III █▉ 38% ↻ 2d05h'. The short bar is green when Fable is full, yellow at half and red when it is almost used up; next to it are the % left and when it is full again." },
      { id: 'fable-boss', name: 'A boss bar while you use Fable',
        note: "While you use Opus, Fable is a small grey note after your weekly: 'Fable 65% ↻ 4d00h' means 65% of your Fable week is left and it is full again in 4 days. The % turns red at 10% or less, and when Fable is used up, as today, it says 'Fable 0% ↻ 19h00m': back in 19 hours. When you switch to Fable, a fifth line appears on top, like a boss bar in Minecraft: the word Fable and a long pink bar as wide as your hotbar that gets shorter as you use Fable, then the % left and when it is full again. The bar turns red at 10% or less, and the line goes away when you switch back to Opus." },
      { id: 'fable-beacon', name: 'A beacon with a beam',
        note: "At the end of the food line a beacon shows your Fable week: '◈ Fable 65% ↻ 4d00h', and while any Fable is left it sends a beam up into the line above: a full beam while more than half is left, a half beam below that, and the beam gets darker as Fable runs out. Used up, as today, the beacon is grey, the beam is gone, the 0% is red and '↻ 19h00m' says when it is powered again. The word Fable is grey while you use Opus and pink when Fable is the model you use (red once it is used up)." },
    ],
  };
  // the first option of each group
  const MIX_DEFAULTS = { git: 'git-spill', pick: 'pick-numeral', book: 'off', fable: 'fable-off' };
  function mixOpts(opts) {
    // an id of each group; anything else (missing, misspelt, another type) is that group's default, so a render
    // never throws. The book also takes a flag (true / 'true' / 1 is on).
    const o = obj(opts), out = {};
    for (const g of ['git', 'pick', 'book', 'fable']) {
      let v = get(o, g, undefined);
      if (g === 'book' && !MIX_OPTIONS.book.some((x) => x.id === v)) { const f = flag(v); if (f !== null) v = f ? 'on' : 'off'; }
      out[g] = MIX_OPTIONS[g].some((x) => x.id === v) ? v : MIX_DEFAULTS[g];
    }
    return out;
  }
  const mix = (sit, o, h) => [f2Line1(sit), f2Line2(sit), f2Line3(sit), mixLine4(sit, o, h)];

  // =====================================================================================
  // YOUR MIX, round 7: the 'fable' group (round7/round7-spec.json), Fable's own weekly limit
  // =====================================================================================
  // Each option takes the mix's finished lines and sit.scoped (fromState: [{ name, fam, left, reset }], left = % left,
  // reset = minutes or null) and draws only in its own cells. git, pick and book write only line 4 (the hotbar line);
  // every fable option writes only on lines 1-3, and fable-boss also on one new line above line 1:
  //   fable-tail     line 2 after its own last cell (after the weekly '18% ↻ 3d23h')
  //   fable-mount    riding (the model in use has a scoped limit): line 2 from col 42 (the drumsticks' zone and what
  //                  follows); not riding: as fable-tail
  //   fable-tooltip  in use: line 1 cols 0-41 (the held item's name) and, for the other entries, line 2 after its end;
  //                  else as fable-tail
  //   fable-boss     in use: a new line on top (5 lines) and, for the other entries, line 2 after its end; else as fable-tail
  //   fable-beacon   line 2 from col C and line 1 from col C (C >= 80, right of both lines' own text)
  // So every git x pick x book x fable combination is the composition of its four options. fable-off (the default) and
  // a render with no scoped entry return the mix's lines untouched.
  const SC_RED = '#FF5555';                                    // 10% left or less: the weekly's own rule
  const SC_SEP = S(' · ', DGREY);
  const scRarity = (e) => get(RARITY, family(e.name), WHITE);
  const scPct = (e) => pyStr(e.left) + '%';
  const scClock = (e) => (e.reset === null ? [] : [S(' ↻ ' + twk(e.reset), GREY)]);
  // the scoped limit of the model in use: the first entry of the same family ('Fable 5.1', 'claude-fable-5-1': fable)
  const scInUse = (sit, sc) => { const f = String(family(sit.model)).toLowerCase(); return sc.find((e) => e.fam === f) || null; };
  // QUIET FORM (an entry not in use): ' · ' name (6 cells) ' ' pct, then ' ↻ reset', all grey (a red % at 10% or less)
  const scQuiet = (e, sep, withClock) => [sep, S(cut(e.name, 6), GREY), S(' '), S(scPct(e), e.left <= 10 ? SC_RED : GREY),
    ...(withClock ? scClock(e) : [])];
  // The entries not in use after `head`, in what is left of 110 cells. ORDER: the Fable entries first, then the others in
  // the API's order. FITTING: until it fits, give way in this order, each from the end: the resets of entries that are not
  // used up, then those entries themselves, then the resets of used-up entries, then any entry. ' · +N' (N = how many are
  // not shown) takes the place of the entries that went and needs its room too; it is left out only when even that cannot
  // fit. So a used-up Fable keeps 'Fable 0% ↻ 19h00m' (when it is back) the longest.
  function scFit(head, entries0, firstSep) {
    const entries = [...entries0.filter((e) => e.fam === 'fable'), ...entries0.filter((e) => e.fam !== 'fable')];
    const room = MAXW - W(head), n = entries.length;
    const clock = entries.map(() => true), shown = entries.map(() => true);
    const build = () => {                                      // the separators follow what is shown
      const out = [];
      let k = 0;
      entries.forEach((e, i) => { if (shown[i]) out.push(...scQuiet(e, k++ ? SC_SEP : firstSep, clock[i])); });
      if (k < n) out.push(S((k ? ' · ' : firstSep.t) + '+' + pyStr(n - k), DGREY));
      return out;
    };
    const last = (ok) => { for (let i = n - 1; i >= 0; i--) if (shown[i] && ok(entries[i], i)) return i; return -1; };
    const steps = [[(e, i) => clock[i] && e.left > 0, clock], [(e) => e.left > 0, shown], [(e, i) => clock[i], clock], [() => true, shown]];
    let out = build();
    while (W(out) > room) {
      const s = steps.find(([ok]) => last(ok) >= 0);
      if (!s) return [...head];                                // not even ' +N' fits
      s[1][last(s[0])] = false;
      out = build();
    }
    return [...head, ...out];
  }
  // line 2 and the separator of its first added entry: after the weekly ' · '; with no weekly (none given) padded to
  // col 62, where the weekly's numbers would start, and ' '
  const scLine2 = (sit, l2) => (none(sit.wk_left) ? { head: pad(l2, 62), first: S(' ') } : { head: [...l2], first: SC_SEP });
  function splitAt(line, col) {                                // [spans before col, spans from col], by WT clusters; where
    const a = [], b = [];                                      // the options cut (col 42 of lines 1 and 2) it is always a
    let c = 0;                                                 // span border or a run of plain spaces
    for (const s of line) {
      const w = cellWidth(s.t);
      if (c + w <= col) a.push(s);
      else if (c >= col) b.push(s);
      else {
        let x = '', y = '', at = c;
        clusters(s.t, (g, gw) => { if (!y && at + gw <= col) { x += g; at += gw; } else y += g; });
        if (x) a.push({ ...s, t: x });
        if (y) b.push({ ...s, t: y });
      }
      c += w;
    }
    return [a, b];
  }

  // ---- fable-tail: beside the weekly; in use, ten hexagons count what is left ----
  const HEX_FULL = '⬢', HEX_EMPTY = '⬡';                      // U+2B22 / U+2B21: Cascadia Mono, 1 cell, ink 0.07-0.93
  function scLoud(e, sep) {
    const n = icons10(e.left), col = e.left <= 10 ? SC_RED : scRarity(e);
    return [sep, S(cut(e.name, 6), scRarity(e), null, true), S(' '), S(HEX_FULL.repeat(n), col), S(HEX_EMPTY.repeat(10 - n), DARK),
      S(' '), S(scPct(e), col, null, true), ...scClock(e)];
  }
  function fableTail(lines, sit, sc) {
    const u = scInUse(sit, sc), rest = sc.filter((e) => e !== u);
    const { head, first } = scLine2(sit, lines[1]);
    const lead = u ? scLoud(u, first) : [];
    return [lines[0], merge(scFit([...head, ...lead], rest, u ? SC_SEP : first)), lines[2], lines[3]];
  }

  // ---- fable-mount: riding Fable, the mount's hearts replace the drumsticks (Minecraft draws no food bar while you ride) ----
  const MOUNT = '#EF7E4A';                                     // the horse heart (vehicle_full.png's light orange)
  function fableMount(lines, sit, sc) {
    const u = scInUse(sit, sc), rest = sc.filter((e) => e !== u);
    if (!u) return fableTail(lines, sit, sc);                  // not riding: the quiet words
    const [left] = splitAt(pad(lines[1], 62), 42);             // cols 0-41: gutter, hearts, level box, untouched
    const n = icons10(u.left), col = u.left <= 10 ? SC_RED : MOUNT;
    // full hearts on the outer (right) edge, as Hud.extractVehicleHealth draws them
    const head = [...left, S('♥ '.repeat(10 - n), DARK), S('♥ '.repeat(n), MOUNT), S(scPct(u), col, null, true), ...scClock(u)];
    if (!none(sit.wk_left)) head.push(SC_SEP, S('🍗', FOOD), S(' '), S(pyStr(sit.wk_left) + '%', sit.wk_left <= 10 ? SC_RED : FOOD, null, true),
      S(' ↻ ' + twk(sit.wk_reset), GREY));
    return [lines[0], merge(scFit(head, rest, SC_SEP)), lines[2], lines[3]];
  }

  // ---- fable-tooltip: in use, the held item's name carries its durability bar ----
  // Minecraft's durability colour, Mth.hsvToRgb(left / 3, 1, 1) with its channels truncated: (255, floor(5.1 x pct), 0)
  // below 50%, (floor(510 - 5.1 x pct), 255, 0) from 50%; red #FF5555 at 10% or less (the weekly's own rule)
  function scWear(pct) {
    if (pct <= 10) return SC_RED;
    const r = pct < 50 ? 255 : Math.floor((5100 - 51 * pct) / 10), g = pct < 50 ? Math.floor((51 * pct) / 10) : 255;
    return `#${hex2(r)}${hex2(g)}00`;
  }
  const scEighths = (pct) => (pct <= 0 ? 0 : pct >= 100 ? 40 : clamp(pyRound((40 * pct) / 100), 1, 39));
  function scDurability(pct) {                                 // 5 cells = 40 eighths on the dark track, all WT builtin
    const e = scEighths(pct), col = scWear(pct), out = [];
    for (let i = 0; i < 5; i++) {
      const f = e - 8 * i;
      out.push(f >= 8 ? S('█', col, DARK) : f <= 0 ? S(' ', null, DARK) : S(LEFT8[f], col, DARK));
    }
    return out;
  }
  function scTooltip(sit, u) {
    // the first form that fits Day & Night's 41 cells with room for the widest numbers it could ever hold (' 100% ↻ 23h59m',
    // 14 cells; ' 100%' with no reset time): only the model and the effort choose the form, never the numbers
    const room = G2 + 25, r = roman(sit.effort);
    const nums = [S(' '), S(scPct(u), scWear(u.left), null, true), ...scClock(u)];
    const most = u.reset === null ? 5 : 14;
    const bar = [S(' '), ...scDurability(u.left)];
    const L = r ? [S(' Efficiency ' + r, GREY)] : [], Ls = r ? [S(' Eff ' + r, GREY)] : [];
    const full = (lore, b) => [modelSpan(sit), ...lore, ...b], short1 = (lore, b) => [modelSpan(sit, lite(sit.model)), ...lore, ...b];
    for (const f of [full(L, bar), full(Ls, bar), short1(Ls, bar), full(Ls, []), short1(Ls, [])]) if (W(f) + most <= room) return [...f, ...nums];
    return [modelSpan(sit, cut(lite(sit.model), room - W(Ls) - most)), ...Ls, ...nums];
  }
  function fableTooltip(lines, sit, sc) {
    const u = scInUse(sit, sc), rest = sc.filter((e) => e !== u);
    if (!u) return fableTail(lines, sit, sc);
    const tip = scTooltip(sit, u);
    const l1 = none(sit.cache) ? tip : [...pad(tip, G2 + 26), ...splitAt(lines[0], G2 + 26)[1]];   // the bubbles stay at col 42
    const { head, first } = scLine2(sit, lines[1]);
    return [merge(l1), rest.length ? merge(scFit(head, rest, first)) : lines[1], lines[2], lines[3]];
  }

  // ---- fable-boss: in use, a boss bar on a new line on top: the name, a 46-cell bar over the hotbar's width, % and reset ----
  const BOSS = '\u{1FB82}';                                    // upper one quarter block, WT builtin: hangs from the top of its row
  const bossFill = (pct) => (pct <= 0 ? 0 : pct >= 100 ? B2 : clamp(pyRound((pct * B2) / 100), 1, B2 - 1));
  const shade = (c, k) => '#' + [1, 3, 5].map((i) => hex2(pyRound(parseInt(c.slice(i, i + 2), 16) * k))).join('');
  function bossLine(u) {
    const col = u.left <= 10 ? SC_RED : scRarity(u), fill = bossFill(u.left), bar = [];
    const on = [col, shade(col, 0.6)], off = [shade(col, 0.25), shade(col, 0.12)];   // [cell, notch]
    for (let b = 0; b < B2; b++) bar.push(S(BOSS, (b < fill ? on : off)[b % 5 === 0 ? 1 : 0]));   // notch: over the XP bar's
    return merge([...pad([S(cut(u.name, G2 - 1), scRarity(u), null, true)], G2), ...bar, S(' '), S(scPct(u), col, null, true), ...scClock(u)]);
  }
  function fableBoss(lines, sit, sc) {
    const u = scInUse(sit, sc), rest = sc.filter((e) => e !== u);
    if (!u) return fableTail(lines, sit, sc);
    const { head, first } = scLine2(sit, lines[1]);
    return [bossLine(u), lines[0], rest.length ? merge(scFit(head, rest, first)) : lines[1], lines[2], lines[3]];
  }

  // ---- fable-beacon: a beacon at the end of line 2 whose beam rises into line 1 in the same column ----
  const BEACON_ON = ['#7DF9F2', '#163235'], BEACON_OFF = ['#5E6B6B', '#1C2222'], ACCENT = '#7DF9F2';
  const lerp = (a, b, t) => '#' + [1, 3, 5].map((i) => {
    const x = parseInt(a.slice(i, i + 2), 16), y = parseInt(b.slice(i, i + 2), 16);
    return hex2(Math.round(x + (y - x) * t));
  }).join('');
  const beamColour = (pct) => lerp('#2E6B73', '#E9FFFF', pct / 100);
  // Line 1 ends by col 77 with Claude Code's 5-minute cache ('4m12s', ' · hit 98%'); the column is fixed for a cache TTL, so
  // it never moves while the timer counts down, the cache goes cold or the hit % changes: the widest timer of that TTL
  // ('5m00s' 5 cells, '60m00s' 6, '1440m00s' 8) + ' · hit 100%' (11) + 2, at least 80, and never left of a line's end + 2.
  function beaconCol(sit, lines) {
    const c = sit.cache, most = c ? G2 + 26 + 20 + Math.max(4, pyStr(Math.floor(c.ttl / 60)).length + 4) + 11 : 0;
    return Math.max(80, most + 2, W(lines[0]) + 2, W(lines[1]) + 2);
  }
  const chip = (e, withClock) => [S(cut(e.name, 8), GREY), S(' '), S(scPct(e), e.left <= 10 ? SC_RED : GREY), ...(withClock ? scClock(e) : [])];
  function chips(rest, used, from) {                           // the other models on line 1: as many as fit, then '+N'
    if (!rest.length) return [];
    const out = [S(' '.repeat(Math.max(0, from - used)))];
    let w = Math.max(used, from), k = 0;
    for (; k < rest.length; k++) {
      const gap = k ? [S('  ')] : [], tail = k + 1 < rest.length ? W([S('  +' + pyStr(rest.length - k - 1))]) : 0;
      const c = [chip(rest[k], true), chip(rest[k], false)].map((x) => [...gap, ...x]).find((x) => w + W(x) + tail <= MAXW);
      if (!c) break;
      out.push(...c); w += W(c);
    }
    if (k < rest.length) {
      const plus = S((k ? '  ' : '') + '+' + pyStr(rest.length - k), GREY);
      if (w + W([plus]) <= MAXW) out.push(plus); else if (!k) return [];
    }
    return out;
  }
  function fableBeacon(lines, sit, sc) {
    // the beacon: the entry in use, else the first Fable, else the API's first; the others follow in the API's order
    const u = scInUse(sit, sc), lead = u || sc.find((e) => e.fam === 'fable') || sc[0];
    const order = [lead, ...sc.filter((e) => e !== lead)], m = order[0], rest = order.slice(1);
    const C = beaconCol(sit, lines), lit = m.left > 0, use = m === u;
    const [fg, bg] = lit ? BEACON_ON : BEACON_OFF;
    const pct = S(scPct(m), m.left <= 10 ? SC_RED : ACCENT, null, use), tailW = 2 + 1 + W([pct]) + W(scClock(m));
    const name = S(cut(m.name, Math.min(10, MAXW - C - tailW)), use ? (lit ? scRarity(m) : SC_RED) : GREY, null, use);
    const l2 = [...lines[1], S(' '.repeat(C - W(lines[1]))), S('◈', fg, bg), S(' '), name, S(' '), pct, ...scClock(m)];
    let l1 = [...lines[0]];
    if (lit) l1 = [...l1, S(' '.repeat(C - W(l1))), S(m.left > 50 ? '┃' : '╻', beamColour(m.left))];
    l1 = [...l1, ...chips(rest, W(l1), C + 3)];
    return [merge(l1), merge(l2), lines[2], lines[3]];
  }

  const MIX_FABLE = { 'fable-tail': fableTail, 'fable-mount': fableMount, 'fable-tooltip': fableTooltip, 'fable-boss': fableBoss,
    'fable-beacon': fableBeacon };
  // the mix's lines with the fable option applied: fable-off, or no scoped entry, leaves them as they are
  const mixFable = (lines, sit, id) => (sit.scoped.length && own(MIX_FABLE, id) ? MIX_FABLE[id](lines, sit, sit.scoped) : lines);

  // =====================================================================================
  // FINALIST 3: POCKET EDITION (2 lines; 24-cell side + 46-cell bar/hotbar + side)
  // =====================================================================================
  const G3 = 24, B3 = 46;

  function f3Line1(sit) {
    const known = !none(sit.s5_left), n = known ? icons10(sit.s5_left) : 0;   // not given: dark hearts only
    let left = [S(rep('♥', n), HEART), S(rep('♥', 10 - n), DARK)];
    if (known) left.push(S(' '), S(pyStr(sit.s5_left) + '%', HEART, null, true), S(' '), day(sit), S(t5(sit.s5_reset), GREY));
    else left.push(S(' '), S('?', DGREY));          // unknown, not used up: a grey '?' where the % goes (col 11)
    left = pad(left, G3);
    const fill = pyRound(sit.ctx_pct * B3 / 100);
    let cells = [];
    for (let b = 0; b < B3; b++) {
      const notch = b % 5 === 0;
      cells.push(S('▬', b < fill ? (notch ? '#436924' : '#7CAB56') : (notch ? '#141F19' : '#36433C')));
    }
    if (sit.ctx_pct > 0) {                          // level number = context % (hidden at 0, like level 0)
      const txt = pyStr(sit.ctx_pct) + '%';
      const box = [S(' ', null, '#000000'), S(txt, XPG, '#000000', true), S(' ', null, '#000000')];
      const bw = pyLen(txt) + 2;
      const st = pyRound(22.5 - bw / 2 + 0.01);
      sliceAssign(cells, st, st + bw, [...box, ...new Array(Math.max(0, bw - 3)).fill(null)]);
      cells = cells.filter((c) => c !== null);
    }
    if (none(sit.wk_left)) return merge([...left, ...cells]);   // no weekly limit given: no food
    const f = icons10(sit.wk_left);
    const right = [S(' '), S(rep('  ', 10 - f)), S(rep('🍗', f), FOOD), S(' '),
      S(pyStr(sit.wk_left) + '%', sit.wk_left <= 10 ? '#FF5555' : FOOD, null, true),
      S(' ↻ ' + twk(sit.wk_reset), GREY)];
    return merge([...left, ...cells, ...right]);
  }

  function f3Well(icon, tail, bg = WELL) {
    if (icon === null) return [S('    ', null, bg)];
    return pad([...icon.map((s) => keepBg(s, bg)), ...tail.map((s) => withBg(s, bg))], 4, bg);
  }

  function cnt(n, colour = WHITE) {
    if (n <= 1) return [];
    return [S(rjust(n < 100 ? pyStr(n) : '99', 2), n < 100 ? colour : '#FFFF55', null, true)];
  }

  function f3Tail(sit) {
    // Right of the hotbar, within 110 cells. Outside a repo the path keeps its last folders ('…/repos/project').
    // Beside git, the path shrinks to the folder name and the branch to its last segment. The folder is the same
    // all session and the end of a branch tells branches apart ('-v2', '-8.6.3'), so the folder name is cut to
    // '…' first (while 5 characters stay, as in Survival's slot), then the branch beside that shortest folder
    // (while 7 stay), and only then the folder goes. No cwd: no ⌂.
    const room = MAXW - G3 - B3 - 1;                // 39 cells after the separating space
    const g = sit.git, base = basename(sit.cwd);
    const home = (p) => [S('⌂ ' + p, GREY)];
    if (!g) return sit.cwd ? [S(' '), ...home(tailPath(sit.cwd, room - 2))] : [];
    const git = (b) => [S('⎇ ', GREY), S(b, WHITE), S(' '), S('+' + kilo(g.add), '#55FF55'), S(' '), S('-' + kilo(g.rem), '#FF5555')];
    const both = (b, p) => [...git(b), S(' · ', DGREY), ...home(p)];
    const seg = lastSeg(g.branch) || g.branch;      // '//////' has no segment: the name itself
    const forms = [];
    if (sit.cwd) {
      const fl = room - W(both(seg, ''));           // cells for a cut folder name beside the branch segment
      const fmin = cut(base, 6), lb = room - W(both('', fmin));   // cells for a cut branch beside the shortest folder
      forms.push(both(g.branch, sit.cwd), both(g.branch, base), both(seg, base), ...(fl >= 6 ? [both(seg, cut(base, fl))] : []),
        ...(lb >= 8 ? [both(cut(seg, lb), fmin)] : []));
    }
    forms.push(git(g.branch), git(seg));
    return [S(' '), ...(forms.find((t) => W(t) <= room) || git(cut(seg, room - W(git('')))))];
  }

  function f3Line2(sit) {
    // one space before the hotbar at col 24: 'Efficiency' becomes 'Eff', then '(1M context)' shrinks, then
    // the name is cut. No effort level: the model alone, an unenchanted item.
    const r = roman(sit.effort);
    const tip = pad(itemName(sit, G3 - 1, r ? [[S(' Efficiency ' + r, GREY)], [S(' Eff ' + r, GREY)]] : [[]]), G3);
    const fam = family(sit.model);
    const hb = [SEL, ...f3Well([S('⛏ ', get(TIER, fam, GREY))], [], glint(sit.effort)), SEL];
    const items = [];
    const c = sit.cache;
    if (none(c)) items.push(f3Well(null, null));
    else if (c.warm) items.push(f3Well([S('🔥', '#FFAA00')], [S(pie(c.ttl_left / c.ttl), '#55FFFF')]));
    else items.push(f3Well([S('❄ ', '#55FFFF')], [S('○', DGREY)]));
    items.push(sit.turns ? f3Well([S('📖', '#C8A27C')], cnt(sit.turns)) : f3Well(null, null));
    items.push(sit.compactions ? f3Well([S('🔨', GREY)], cnt(sit.compactions)) : f3Well(null, null));
    items.push(sit.cost > 0 ? f3Well([S('▄▄', '#FCEE4B')], cnt(Math.max(1, Math.trunc(sit.cost)))) : f3Well(null, null));
    if (none(sit.extra_left)) items.push(f3Well(null, null));
    else {                                          // no whole dollar left: an empty (still glowing) well
      const cash = Math.trunc(sit.extra_left), bg = paying(sit) ? '#10301C' : WELL;
      items.push(cash >= 1 ? f3Well([S('◆ ', '#17DD62')], cnt(cash, '#17DD62'), bg) : f3Well(null, null, bg));
    }
    while (items.length < 8) items.push(f3Well(null, null));
    items.forEach((it, i) => hb.push(...it, i === 7 ? EDGE_R : RIDGE));
    return merge([...tip, ...hb, ...f3Tail(sit)]);
  }

  const f3 = (sit) => [f3Line1(sit), f3Line2(sit)];

  // ---------- picker state -> gen.py situation ----------
  // Numbers are held to their domain (a used % to 0-100, a reset to its window, counts to whole numbers
  // >= 0, anything missing to 0), so nothing can print None, NaN or a negative count. A number may also come
  // as a numeric string ('93', ' 3.12', '98%'). A limit with no used % (an API key has none) is unknown
  // (null) and is drawn as such, not as made-up numbers.
  function num(v) {                                                         // a finite number, or undefined
    if (typeof v === 'string') { const t = v.trim(); v = t === '' || t === '%' ? NaN : +(t.endsWith('%') ? t.slice(0, -1) : t); }
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  }
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const fin = (v, lo, hi) => { const n = num(v); return n === undefined ? lo : clamp(n, lo, hi); };
  const whole = (v) => Math.floor(fin(v, 0, 1e15));
  const flag = (v) => {                                                     // Python's str(True) and ' TRUE ' too
    const t = typeof v === 'string' ? v.trim().toLowerCase() : v;
    return t === true || t === 1 || t === 'true' ? true : t === false || t === 0 || t === 'false' ? false : null;
  };
  const obj = (v) => (v !== null && typeof v === 'object' ? v : {});
  // characters that draw nothing: Default_Ignorable code points (soft hyphen, ZWSP, the Hangul fillers U+115F
  // U+1160 U+3164 U+FFA0, variation selectors, tags, ...) and the braille blank U+2800
  const BLANK = /^[\s\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u206f\u2800\u3164\ufe00-\ufe0f\ufeff\uffa0\ufff0-\ufff8\u{1bca0}-\u{1bca3}\u{1d173}-\u{1d17a}\u{e0000}-\u{e0fff}]$/u;
  // Escape sequences in user text go whole, before the control characters, so none of their bytes is left as
  // text: strings (OSC, DCS, SOS, PM, APC; an OSC 8 hyperlink keeps its visible text), CSI, then any other
  // ESC sequence. Each is one pass over disjoint classes: linear.
  const ESC_STR = /(?:\x1b[\]PX^_]|[\x90\x98\x9d-\x9f])[^\x07\x1b\x9c]*(?:\x07|\x1b\\|\x9c)?/g;
  const ESC_CSI = /(?:\x1b\[|\x9b)[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]?/g;
  const ESC_ANY = /\x1b[\x20-\x2f]*[\x30-\x7e]?/g;
  function tidy(v, trim, keep) {
    // User text (model, branch, cwd, version, effort): a string or a finite number (anything else, such as
    // an object, is ''), with no escape sequences, line breaks and tabs as a space (U+2028/U+2029 too: WT
    // draws them as empty cells), no other control characters, and nothing at either end that WT would join
    // into the cluster of the glyph beside it (a leading mark, ZWJ or VS16 after our space, a trailing Prepend),
    // so the widths of the spans always add up to the width of the line. `trim` also drops whitespace and blank
    // clusters (zero-width ones, and fillers that draw nothing) at both ends, so a line never opens with a
    // blank-looking cell. `keep` bounds the work on huge input (a 32,767-character path) by whole WT clusters:
    // the first `keep` code points stay, with '…' where the rest was. A negative `keep` is for a path or a
    // branch: its end stays ('…/repos/project'), unless its last name alone is longer, which then keeps its own
    // start ('…/projectnam…'), as the slots show a long name. A first cluster longer than the bound stays whole.
    // Linear: indexes, no shift().
    const s = typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
    const cps = Array.from(s.replace(ESC_STR, '').replace(ESC_CSI, '').replace(ESC_ANY, '')
      .replace(/[\t\n\v\f\r\x85\p{Zl}\p{Zp}]+/gu, ' ').replace(/[\u0000-\u001f\u007f-\u009f]/g, ''));
    let i = 0, j = cps.length, pre = '', post = '';
    const k = (n) => cls(cpOf(cps[n]));
    const next = (a) => {                           // where the WT cluster that starts at a ends
      let e = a + 1;
      for (let st = 0, lead = k(a); e < j && (st = joins(st, lead, k(e))) !== 3; e++) lead = k(e);
      return e;
    };
    const upTo = (a, n) => {                        // whole clusters from a, at most n code points (the first whole)
      let e = next(a);
      for (let f; e < j && (f = next(e)) - a <= n;) e = f;
      return e;
    };
    const loose = (n, joined) => joined !== 3 || (trim && /^\s$/u.test(cps[n]));
    const blank = (a, b) => { for (let q = a; q < b; q++) if (!BLANK.test(cps[q]) && cw(cpOf(cps[q])) !== 0) return false; return true; };
    const front = () => {                           // loose code points, then (trim) whole blank clusters
      for (;;) {
        while (i < j && loose(i, joins(0, 0, k(i)))) i++;
        if (!trim || i >= j) return;
        const e = next(i);
        if (!blank(i, e)) return;
        i = e;
      }
    };
    const back = () => {                            // the same at the end (a blank cluster holds no RI pair)
      for (;;) {
        while (j > i && loose(j - 1, joins(0, k(j - 1), 0))) j--;
        if (!trim || j <= i) return;
        let b = j - 1;
        while (b > i && joins(0, k(b - 1), k(b)) !== 3) b--;
        if (!blank(b, j)) return;
        j = b;
      }
    };
    const ends = () => { for (let n = -1; n !== j - i;) { n = j - i; front(); back(); } };
    ends();
    const K = Math.abs(keep || 0);
    if (keep > 0 && j - i > K) {
      const e = upTo(i, K);
      if (e < j) { j = e; post = '…'; }
      ends();
    }
    if (keep < 0 && j - i > K) {
      const cs = [];                                // where each cluster starts
      for (let a = i; a < j; a = next(a)) cs.push(a);
      const sep = (n) => cps[cs[n]] === '/' || cps[cs[n]] === '\\';
      let m = cs.length;
      while (m && sep(m - 1)) m--;                  // trailing separators name nothing
      let a = m;
      while (a && !sep(a - 1)) a--;                 // cs[a]: where the last name starts
      const end = m < cs.length ? cs[m] : j;
      if (m && end - cs[a] > K) {                   // the last name alone is longer: its start stays
        const e = upTo(cs[a], K);
        if (e < end) post = '…';
        j = e;
        if (a > 1) { i = cs[a - 1]; pre = '…'; }    // with the separator before it, so it is still the last name
      } else {
        if (m) j = end;
        let q = 0;
        while (q < (m || cs.length) - 1 && j - cs[q] > K) q++;   // the last cluster stays whole
        if (q) { i = cs[q]; pre = m ? '…' : ''; }
      }
      ends();
    }
    return i < j ? pre + cps.slice(i, j).join('') + post : '';
  }
  // state.hist (round 6, round6/round6-spec.json "history"): what Hungerbar remembers between renders in its small
  // per-session cache, handed to the render next to Claude Code's data. fromState() ignores it; only the mix's round-6
  // options read it (readHist above), and only git-wheat, git-terrain, git-creeper and book-bed; each also has a form
  // without it. All times are seconds on one clock (Hungerbar: Unix time; session4.js: frame i is 30 x i).
  //   hist = { now, sessionStart, dirtySince, commits, lastCommit: { at, add, del, branch } | null,
  //            buckets: [[index, maxT, add, del, commit], ...] }
  //   now           the time of this render
  //   sessionStart  when the session began: now - cost.total_duration_ms / 1000, else the cache's first render
  //                 (book-bed: session minutes = floor((now - sessionStart) / 60))
  //   dirtySince    when the current uncommitted changes appeared: the first render that saw them after a clean tree, a
  //                 commit or a branch switch; when a cache starts with changes already there (or it lost the time), the
  //                 oldest modification time of the changed files (the files git diff HEAD counts, so never an untracked
  //                 one); null while nothing is changed (git-wheat: stage = min(7, floor((now - dirtySince) / 600)))
  //   commits       commits seen in this session, one for each 'commit...' reflog entry (git-wheat's hay bale)
  //   lastCommit    the last render that saw a commit (a real commit only, see step 2): its time, what its commits saved
  //                 (insertions, deletions: git diff --shortstat from the HEAD each one moved from to the HEAD it made,
  //                 summed; a pull or rebase in the same interval adds nothing) and its branch; null before the first.
  //                 Same branch only: git-creeper booms under 30 s and smokes to 59 s even when changes stay uncommitted,
  //                 then draws the creeper of what is left, or a crater to 299 s when nothing is; git-wheat shows the hay
  //                 bale under 60 s
  //   buckets       up to 8 quarter hours (index = floor(time / 900)): maxT = the biggest added + removed seen in it, add
  //                 and del = the counts of the render that set it, commit = 1 when a commit was seen in it (git-terrain,
  //                 which draws the current quarter hour as this render's step 4 leaves it, like a past one)
  // Reading (a render never throws and never prints a bad value): hist that is not an object, or a now that is not a
  // finite number >= 0 (num(): numeric strings too), is no history at all. A now above 1e11 is in milliseconds: now,
  // sessionStart, dirtySince and lastCommit.at are divided by 1000 and a bucket index k becomes floor(k / 1000) (the
  // quarter hour floor(seconds / 900) it began in). now is held to 1e13; sessionStart and dirtySince to 0..now (one 'in
  // the future' counts as now); counts are whole() (0..1e15). A sessionStart or dirtySince that is not a number is
  // unknown (null). A lastCommit that is not an object, whose at is not a number, or whose at is later than now (the
  // clock went back further than the cache update saw), is null; its branch is read as saved, never tidied again (Hungerbar
  // saves fromState's branch, which is only compared, never printed: tidy is not idempotent on a cut it made); a branch
  // that is not a string or number, or a string over 4096 code units, matches no branch, and a number is tidied like
  // fromState's branch (tidy(v, true, -256) || 'HEAD'). Only the last 64 bucket entries are read; an entry that is not an
  // array, or whose index is not a whole number, or not from floor(now / 900) - 7 to floor(now / 900) once converted, is
  // skipped; a later entry with the same index wins; commit is 1 only for 1 or true.
  // The cache update Hungerbar runs once per render, before drawing (round4/session4.js runs it over its frames): with
  // B = fromState(state).git.branch (null outside a repo), add = git.add, del = git.rem (0 outside a repo), T = add + del,
  // H = the sha of HEAD (git rev-parse HEAD; null outside a repo, before the first commit or when git fails), and the
  // cache {now, sessionStart, branch, head, add, del, dirtySince, commits, lastCommit, buckets} read as above:
  //   1. no cache (or no valid now): sessionStart = now, no branch, head null, add = del = 0, dirtySince null,
  //      commits 0, lastCommit null, buckets []; when now < the cached now (the clock went back), the cached
  //      sessionStart, dirtySince and lastCommit.at move by now - cached now (never below 0), so every age stays continuous;
  //   2. a commit is seen when B is not null, B equals the cached branch, H and the cached head are known, H differs, and
  //      among the HEAD reflog entries newer than the newest one that set HEAD to the cached head (git reflog
  //      --format=%H%x09%gs HEAD, newest first: the sha HEAD moved to, a tab, the subject) one or more have a subject that
  //      starts with 'commit' ('commit:', 'commit (amend):', 'commit (merge):', 'commit (initial):'). A pull, reset,
  //      rebase, merge or checkout moves HEAD without one (no boom, no hay bale, no gold); a stash, a discard or a branch
  //      switch never is one; no commit when git fails. Every such entry i is one commit: commits + 1, and it saved the
  //      insertions and deletions of git diff --shortstat <sha of entry i + 1> <sha of entry i> (the HEAD it moved from;
  //      for the oldest entry read, the cached head; 0 when git fails); a pull, rebase or merge entry adds nothing, so a
  //      'commit && pull --rebase' inside one refresh still says what the commit saved. lastCommit = {at: now, add, del:
  //      the sums over this render's commits, branch: B};
  //   3. dirtySince = null when T = 0; else, when B equals the cached branch, the cached add + del > 0 and no commit was
  //      seen, the cached one, or when that is null (unknown) the oldest change on disk (below); else, when step 1 started
  //      the cache, the oldest change on disk; else now (the changes appeared since the last render). The oldest change on
  //      disk: the oldest modification time (stat mtime) of the paths git diff HEAD --name-only -z lists (git diff --cached
  //      on an unborn branch, as Hungerbar's counts there; relative to the top of the repo): exactly the files the + and -
  //      counts come from, so never an untracked file or folder; a rename's new path; deleted and unreadable paths skipped;
  //      clamped to 0..now; now when git or stat fails or no path can be read;
  //   4. in a repo only, I = floor(now / 900): when the last bucket's index is I, raise its maxT (and add, del) when T is
  //      bigger and set its commit when a commit was seen; else append [I, T, add, del, commit ? 1 : 0]; keep the entries
  //      with I - 8 < index <= I;
  //   5. save now, branch = B, head = H, add, del; hist = {now, sessionStart, dirtySince, commits, lastCommit, buckets}.
  // state.scoped (round 7, round7/round7-spec.json "data"): the weekly limits Anthropic's usage API reports for one model
  // only (limits[] entries of kind 'weekly_scoped', e.g. scope.model.display_name 'Fable'), as Hungerbar's usage.json
  // scoped[] holds them (opt-in, network.scopedWeekly):
  //   scoped = [{ name, used, left }]   name the model's name ('Fable'), used the % used (may be fractional), left the
  //                                     seconds until its reset or null
  // Missing, null, [] or anything that is not an array means no data (the feature is off, an API key login, or the API
  // did not send it), and then nothing changes on screen. Reading (readScoped, into sit.scoped): only the first 16
  // entries; an entry counts when it is a plain object whose used is a number (num(): numeric strings too) and whose
  // name, tidied (tidy(name, true, 64)), is not empty and not the text None, null, undefined, NaN, inf or Infinity (any
  // case, a sign allowed); a later entry with the same tidied name (any case) is skipped. Each counted entry becomes
  // { name, fam: its family() in lower case, left: % LEFT = 100 - floor(clamp(used, 0, 100)) (the picked rule: 34.6 used is
  // 66%), reset: floor(clamp(left, 0, 604800) / 60) minutes, or null when left is not a number }, in the API's order.
  // Only the mix's fable options read it; the entry whose family is the model in use's is the limit in use.
  const SC_MISSING = /^(?:none|null|undefined|nan|[+-]?inf(?:inity)?)$/i;
  function readScoped(a) {
    if (!Array.isArray(a)) return [];
    const out = [], seen = new Set();
    for (const e of a.slice(0, 16)) {
      if (e === null || typeof e !== 'object' || Array.isArray(e)) continue;
      const used = num(e.used), name = tidy(e.name, true, 64);
      if (used === undefined || !name || SC_MISSING.test(name)) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;                              // a repeated name (any case): the first one only
      seen.add(key);
      const l = num(e.left);
      out.push({ name, fam: String(family(name)).toLowerCase(), left: 100 - Math.floor(clamp(used, 0, 100)),
        reset: l === undefined ? null : Math.floor(clamp(l, 0, 604800) / 60) });
    }
    return out;
  }
  function fromState(st) {
    st = obj(st);                                   // render(null) draws an empty world instead of throwing
    const c = obj(st.cache), h5 = obj(st.h5), week = obj(st.week), x = obj(st.extra);
    const hit = num(c.hit), warm = flag(c.warm);
    const hasCache = hit !== undefined || warm !== null;
    const t = fin(c.ttl, 0, 86400), ttl = hasCache && t >= 1 ? t : 300;   // ttl / 10 never underflows to 0
    const extraUsed = fin(x.used, 0, 1e15), extraLimit = fin(x.limit, 0, 1e15);
    // Claude Code's own model object ({id, display_name}) as well as its name
    const m = st.model !== null && typeof st.model === 'object'
      ? tidy(st.model.display_name, true, 256) || tidy(st.model.id, true, 256) : tidy(st.model, true, 256);
    const used5 = num(h5.used), left5 = num(h5.left), usedWk = num(week.used), leftWk = num(week.left);
    // the reset is never further away than the 5-hour window (gen.py measures the day against 300 minutes),
    // so the clock is at most '5h00m'; a limit with no reset given resets after its whole window
    const win5 = Math.min(fin(h5.window, 0, 1e9) || 18000, 18000);
    // effort is one of a few levels, so 'None', 'null', 'undefined' or 'NaN' (a missing value a wrapper turned
    // into text) can only mean that there is none
    const eff = tidy(st.effort, true, 256);
    return {
      model: m || 'Claude',                          // lines start with it: never empty, never a space
      effort: /^(?:none|null|undefined|nan)$/i.test(eff) ? '' : eff,   // '' when not set (Haiku has none)
      // gen.py's situations hold whole thousands (237000 for the 236900 in states.json): nearest k.
      ctx_tokens: Math.round(fin(st.ctxTok, 0, 1e9) / 1000) * 1000,
      ctx_window: fin(st.ctxMax, 0, 1e9),
      ctx_pct: pyRound(fin(st.ctxPct, 0, 100)),
      // a branch that is empty once tidied (' ', a lone ZWJ) is still a repo: 'HEAD'. Like a path, a huge one
      // keeps its end: that is what every concept shows of it.
      git: none(st.branch) || st.branch === false ? null
        : { branch: tidy(st.branch, true, -256) || 'HEAD', add: whole(st.add), rem: whole(st.del) },
      s5_left: used5 === undefined ? null : 100 - Math.floor(clamp(used5, 0, 100)),
      s5_reset: Math.floor((left5 === undefined ? win5 : clamp(left5, 0, win5)) / 60),
      wk_left: usedWk === undefined ? null : 100 - Math.floor(clamp(usedWk, 0, 100)),
      wk_reset: Math.floor((leftWk === undefined ? 604800 : clamp(leftWk, 0, 604800)) / 60),
      // whole seconds, within the TTL; an unknown hit % (null) is left out of the readouts. warm is false for an unknown
      // flag too (the round 4 concepts draw that as cold); cold (round 6, book-bed) is true only when Claude Code said so.
      cache: hasCache ? { hit: hit === undefined ? null : pyRound(clamp(hit, 0, 100)), warm: warm === true,
        ttl_left: Math.floor(fin(c.left, 0, ttl)), ttl, cold: warm === false } : null,
      extra_used: extraUsed,
      extra_limit: extraLimit,
      extra_left: extraLimit ? Math.max(0, extraLimit - extraUsed) : null,   // used past the limit: $0, not $-25
      cwd: tidy(st.cwd, true, -512),                 // '' (none given): no 🏠 / ⌂
      ver: tidy(st.ver, true, 256),                  // '' (none given): Survival leaves it out, Day & Night shows v?
      cost: fin(st.cost, 0, 1e15),
      compactions: whole(st.compactions),
      turns: whole(st.turns),
      scoped: readScoped(st.scoped),                 // [] when there is no data: no fable option draws anything
    };
  }

  // opts.style ('colour' | 'plain') is accepted, but gen.py's spans are the same for both: the icon
  // style is WT's font fallback (colour emoji ignore fg), not a different span stream. The pickaxe
  // tier tint, for example, is always in the fg and only becomes visible under the plain style.
  const concept = (key, name, pitch, lines, fn) => ({
    key, name, pitch, lines,
    render(state, opts) { void opts; return fn(fromState(state)); },
  });

  return {
    concepts: [
      concept('survival', 'Survival Hotbar',
        "Three lines, the same height as today: hearts and drumsticks with the model's name between them, a notched XP bar for your context where every /compact is a level-up, and a real 9-slot hotbar where Opus is the enchanted pickaxe in your hand and every other slot is a Minecraft item with its number.",
        3, f1),
      concept('daynight', 'Day & Night',
        'The whole survival HUD stacked exactly like the game at 1:4 scale: your 5-hour window is one Minecraft day (sun, dusk, moon, then a skull and a respawn), the prompt cache is your breath underwater, the XP bar rests on the hotbar, and an emerald offhand slot lights up when you are paying with extra credits.',
        4, f2),
      concept('pocket', 'Pocket Edition',
        "Minecraft's HUD folded into two lines, one fewer than today: hearts, a notched XP bar with your context % as the green level, and drumsticks on top; the held item's name, a compact 9-slot hotbar right under the XP bar, and your git and folder below.",
        2, f3),
      // round 5: options = { git, pick, book } lists of { id, name, note }; render(state, { style, git, pick, book })
      // round 7: options.fable too; render(state, { style, git, pick, book, fable }). 4 lines, 5 only with fable-boss
      // while the model in use has a scoped limit (the new line is the first)
      {
        key: 'mix', name: 'Your mix',
        pitch: "Day & Night as picked, with three changes: the pickaxe slot shows the effort level the way Survival's did, git lines added and removed share one slot, and the book slot is a choice, off unless you turn it on.",
        lines: 4, options: MIX_OPTIONS, defaults: MIX_DEFAULTS,
        render(state, opts) {
          const sit = fromState(state), o = mixOpts(opts);
          return mixFable(mix(sit, o, readHist(obj(state).hist)), sit, o.fable);
        },
      },
    ],
    cellWidth,
    fromState,
  };
})();
