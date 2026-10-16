// User text for the HUD: tidy() and the path/name helpers, ported line for line from the oracle
// (test/reference/hud4.js L252-308, L327 and L1285-1372; plan §3-§4). The regexes are the oracle's byte for byte
// (hud.oracle.test.ts compares them), and iteration is by code point.
import { cellWidth, cls, clusters, cpOf, cw, joins } from './wt.ts';

// hud4.js L1285-1287: characters that draw nothing: Default_Ignorable code points (soft hyphen, ZWSP, the Hangul
// fillers U+115F U+1160 U+3164 U+FFA0, variation selectors, tags, ...) and the braille blank U+2800
export const BLANK = /^[\s\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u206f\u2800\u3164\ufe00-\ufe0f\ufeff\uffa0\ufff0-\ufff8\u{1bca0}-\u{1bca3}\u{1d173}-\u{1d17a}\u{e0000}-\u{e0fff}]$/u;
// hud4.js L1288-1293: escape sequences in user text go whole, before the control characters, so none of their bytes
// is left as text: strings (OSC, DCS, SOS, PM, APC; an OSC 8 hyperlink keeps its visible text), CSI, then any other
// ESC sequence. Each is one pass over disjoint classes: linear.
export const ESC_STR = /(?:\x1b[\]PX^_]|[\x90\x98\x9d-\x9f])[^\x07\x1b\x9c]*(?:\x07|\x1b\\|\x9c)?/g;
export const ESC_CSI = /(?:\x1b\[|\x9b)[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]?/g;
export const ESC_ANY = /\x1b[\x20-\x2f]*[\x30-\x7e]?/g;
// hud4.js L1294
export function tidy(v: unknown, trim?: boolean, keep?: number): string {
  // User text (model, branch, cwd, version, effort): a string or a finite number (anything else, such as an object,
  // is ''), with no escape sequences, line breaks and tabs as a space (U+2028/U+2029 too: WT draws them as empty
  // cells), no other control characters, and nothing at either end that WT would join into the cluster of the glyph
  // beside it (a leading mark, ZWJ or VS16 after our space, a trailing Prepend), so the widths of the spans always add
  // up to the width of the line. `trim` also drops whitespace and blank clusters (zero-width ones, and fillers that
  // draw nothing) at both ends, so a line never opens with a blank-looking cell. `keep` bounds the work on huge input
  // (a 32,767-character path) by whole WT clusters: the first `keep` code points stay, with '…' where the rest was. A
  // negative `keep` is for a path or a branch: its end stays ('…/repos/project'), unless its last name alone is
  // longer, which then keeps its own start ('…/projectnam…'), as the slots show a long name. A first cluster longer
  // than the bound stays whole. Linear: indexes, no shift().
  const s = typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
  const cps = Array.from(s.replace(ESC_STR, '').replace(ESC_CSI, '').replace(ESC_ANY, '')
    .replace(/[\t\n\v\f\r\x85\p{Zl}\p{Zp}]+/gu, ' ').replace(/[\u0000-\u001f\u007f-\u009f]/g, ''));
  let i = 0, j = cps.length, pre = '', post = '';
  const k = (n: number): number => cls(cpOf(cps[n]!));
  const next = (a: number): number => {            // where the WT cluster that starts at a ends
    let e = a + 1;
    for (let st = 0, lead = k(a); e < j && (st = joins(st, lead, k(e))) !== 3; e++) lead = k(e);
    return e;
  };
  const upTo = (a: number, n: number): number => { // whole clusters from a, at most n code points (the first whole)
    let e = next(a);
    for (let f: number; e < j && (f = next(e)) - a <= n;) e = f;
    return e;
  };
  const loose = (n: number, joined: number): boolean | undefined => joined !== 3 || (trim && /^\s$/u.test(cps[n]!));
  const blank = (a: number, b: number): boolean => { for (let q = a; q < b; q++) if (!BLANK.test(cps[q]!) && cw(cpOf(cps[q]!)) !== 0) return false; return true; };
  const front = (): void => {                       // loose code points, then (trim) whole blank clusters
    for (;;) {
      while (i < j && loose(i, joins(0, 0, k(i)))) i++;
      if (!trim || i >= j) return;
      const e = next(i);
      if (!blank(i, e)) return;
      i = e;
    }
  };
  const back = (): void => {                        // the same at the end (a blank cluster holds no RI pair)
    for (;;) {
      while (j > i && loose(j - 1, joins(0, k(j - 1), 0))) j--;
      if (!trim || j <= i) return;
      let b = j - 1;
      while (b > i && joins(0, k(b - 1), k(b)) !== 3) b--;
      if (!blank(b, j)) return;
      j = b;
    }
  };
  const ends = (): void => { for (let n = -1; n !== j - i;) { n = j - i; front(); back(); } };
  ends();
  const K = Math.abs(keep || 0);
  // keep! : an absent keep compares false both ways, as in the oracle
  if (keep! > 0 && j - i > K) {
    const e = upTo(i, K);
    if (e < j) { j = e; post = '…'; }
    ends();
  }
  if (keep! < 0 && j - i > K) {
    const cs: number[] = [];                        // where each cluster starts
    for (let a = i; a < j; a = next(a)) cs.push(a);
    const sep = (n: number): boolean => cps[cs[n]!] === '/' || cps[cs[n]!] === '\\';
    let m = cs.length;
    while (m && sep(m - 1)) m--;                    // trailing separators name nothing
    let a = m;
    while (a && !sep(a - 1)) a--;                   // cs[a]: where the last name starts
    const end = m < cs.length ? cs[m]! : j;
    if (m && end - cs[a]! > K) {                    // the last name alone is longer: its start stays
      const e = upTo(cs[a]!, K);
      if (e < end) post = '…';
      j = e;
      if (a > 1) { i = cs[a - 1]!; pre = '…'; }     // with the separator before it, so it is still the last name
    } else {
      if (m) j = end;
      let q = 0;
      while (q < (m || cs.length) - 1 && j - cs[q]! > K) q++;   // the last cluster stays whole
      if (q) { i = cs[q]!; pre = m ? '…' : ''; }
    }
    ends();
  }
  return i < j ? pre + cps.slice(i, j).join('') + post : '';
}

// hud4.js L252-253: a path or branch splits at '/' (and at '\', for a native Windows cwd), but only between WT's
// clusters: a separator that a Prepend before it joins (U+0600 + '/') belongs to that name.
/** A WT cluster and its width. */
export type Cluster = [string, number];
// hud4.js L254
export const isSep = (g: string): boolean => g[0] === '/' || g[0] === '\\';
// hud4.js L255: [cluster, width]s, no trailing separator
export function parts(p: string): Cluster[] {
  const cl: Cluster[] = [];
  clusters(p, (g, w) => cl.push([g, w]));
  while (cl.length && isSep(cl[cl.length - 1]![0])) cl.pop();
  return cl;
}
// hud4.js L261
export const join = (cl: readonly Cluster[]): string => cl.map((c) => c[0]).join('');
// hud4.js L262: the last name that is not blank ('/a/ /': a)
export function lastSeg(p: string): string {
  const cl = parts(p);
  for (let e = cl.length; e;) {
    let k = e;
    while (k && !isSep(cl[k - 1]![0])) k--;
    const name = tidy(join(cl.slice(k, e)), true);
    if (name) return name;
    for (e = k; e && isSep(cl[e - 1]![0]);) e--;
  }
  return '';
}
// hud4.js L273: whole clusters up to n cells, '…' if cut
export function cut(text: string, n: number): string {
  if (cellWidth(text) <= n) return text;
  if (n < 1) return '';
  let out = '', w = 0, full = false;
  clusters(text, (g, gw) => { if (!full && w + gw <= n - 1) { out += g; w += gw; } else full = true; });
  return out + '…';
}
// hud4.js L285: at most n cells: '…/company/project'
export function tailPath(p: string, n: number): string {
  if (cellWidth(p) <= n) return p;
  // the longest tail that starts at a separator and fits after '…', walking the clusters from the right
  const cl = parts(p);
  let w = 1, from = -1;
  for (let k = cl.length - 1; k >= 0 && (w += cl[k]![1]) <= n; k--) if (isSep(cl[k]![0])) from = k;
  if (from >= 0) return '…' + join(cl.slice(from));
  const name = lastSeg(p);                                                // '' when it is all separators ('//////')
  if (name && cellWidth(join(cl)) <= n) return join(cl);                  // only a trailing separator went
  // no separator tail fits: the last name, never without a mark that its front was dropped
  const last = name || p, lw = cellWidth(last);
  return lw + 1 <= n ? '…' + last : cut(last, lw > n ? n : n - 1);
}
// hud4.js L298-300: '(1M context)' at the end of a model name shrinks to '1M' (any other last parenthetical goes)
// before the name is cut. String steps, not a regex that would backtrack over long runs of spaces or '('.
export function lite(m: string): string {
  let s = m.trimEnd();
  const o = s.lastIndexOf('(');
  if (o >= 0 && s.indexOf(')', o) === s.length - 1) {
    const k = /^(\S+) context$/i.exec(s.slice(o + 1, -1));
    s = s.slice(0, o).trimEnd() + (k ? ' ' + k[1]! : '');
  }
  return tidy(s, true) || m;
}
// hud4.js L327
export const none = (v: unknown): v is null | undefined => v === null || v === undefined;
