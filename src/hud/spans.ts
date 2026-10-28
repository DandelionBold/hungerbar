// Spans, the HUD engine's unit of output, and the helpers that build and cut lines of them, ported line for line
// from the oracle (test/reference/hud4.js L171-199, L330-339 and L1022-1039; plan §3-§4).
// Traps kept on purpose: S() sets fg, bg and bold only when truthy, in the order t, fg, bg, bold; withBg always
// sets bg; sameAttrs compares which keys are present, and merge() depends on it.
import { own, rep } from './py.ts';
import { cellWidth, clusters } from './wt.ts';

/** A run of text with one style: fg and bg are '#RRGGBB'. */
export interface Span { t: string; fg?: string; bg?: string; bold?: true }

// hud4.js L172
export function S(t: string, fg?: string | null, bg?: string | null, bold?: boolean | null): Span {
  const d: Span = { t };
  if (fg) d.fg = fg;
  if (bg) d.bg = bg;
  if (bold) d.bold = true;
  return d;
}
// hud4.js L179: {**s, "bg": bg}
export const withBg = (s: Span, bg: string): Span => ({ ...s, bg });
// hud4.js L181
export const W = (spans: readonly Span[]): number => spans.reduce((w, s) => w + cellWidth(s.t), 0);
// hud4.js L182
export function sameAttrs(a: Span, b: Span): boolean {
  const ka = Object.keys(a).filter((k) => k !== 't'), kb = Object.keys(b).filter((k) => k !== 't');
  const av = a as unknown as Readonly<Record<string, unknown>>, bv = b as unknown as Readonly<Record<string, unknown>>;
  return ka.length === kb.length && ka.every((k) => own(b, k) && av[k] === bv[k]);
}
// hud4.js L186
export function merge(spans: readonly Span[]): Span[] {
  const out: Span[] = [];
  for (const s of spans) {
    if (!s.t) continue;
    const last = out[out.length - 1];
    if (last && sameAttrs(last, s)) last.t += s.t;
    else out.push({ ...s });
  }
  return out;
}
// hud4.js L196
export function pad(spans: readonly Span[], n: number, bg?: string | null): Span[] {
  const w = W(spans);                                                     // gen.py: assert w <= n
  return n > w ? [...spans, S(rep(' ', n - w), null, bg)] : [...spans];
}
// hud4.js L330: no blank cells at the end of a line
export function rtrim(spans: readonly Span[]): Span[] {
  const out = [...spans];
  while (out.length && !out[out.length - 1]!.bg) {
    let t = out[out.length - 1]!.t;
    while (t.endsWith(' ')) t = t.slice(0, -1);
    if (t) { out[out.length - 1] = { ...out[out.length - 1]!, t }; break; }
    out.pop();
  }
  return out;
}
// hud4.js L1022: [spans before col, spans from col], by WT clusters; where the options cut (col 42 of lines 1 and 2)
// it is always a span border or a run of plain spaces
export function splitAt(line: readonly Span[], col: number): [Span[], Span[]] {
  const a: Span[] = [], b: Span[] = [];
  let c = 0;
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
