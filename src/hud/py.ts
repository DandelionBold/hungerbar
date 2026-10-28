// The Python semantics the HUD engine relies on (its design was gen.py) and its number readers, ported line for line
// from the oracle (test/reference/hud4.js L95-164 and L1273-1284; plan §3-§4). hud.oracle.test.ts compares each one.
// Traps kept on purpose: own/get see own properties only (an effort of 'constructor' must miss), rep floors its count
// and refuses a non-finite one, pyRound rounds ties to even and never returns -0, pyFixed is exact (toFixed(100) and
// BigInt), floatRepr/pyStr are Python's repr/str, and family() can return undefined.

// hud4.js L96
export const own = (o: object, k: unknown): k is string => typeof k === 'string' && Object.hasOwn(o, k);
// hud4.js L97: dict.get
export const get = <V, D>(o: Readonly<Record<string, V>>, k: unknown, d: D): V | D => (own(o, k) ? o[k]! : d);
// hud4.js L98: str * int
export const rep = (s: string, n: number): string => (n > 0 && Number.isFinite(n) ? s.repeat(Math.floor(n)) : '');
// hud4.js L99: len() in code points
export const pyLen = (s: string): number => Array.from(s).length;
// hud4.js L100
export const rjust = (s: string, n: number): string => ' '.repeat(Math.max(0, n - pyLen(s))) + s;
// hud4.js L101: round(), ties to even
export function pyRound(x: number): number {
  if (Math.abs(x % 1) === 0.5) return 2 * Math.round(x / 2) + 0;
  return Math.round(x) + 0;
}
// hud4.js L105
export function divmod(a: number, b: number): [number, number] { const q = Math.floor(a / b); return [q, a - q * b]; }
// hud4.js L106: f"{n:02d}"
export function pad02(n: number): string {
  const s = pyStr(Math.abs(n)), sign = n < 0 ? '-' : '';
  return sign + s.padStart(2 - sign.length, '0');
}
// hud4.js L110: repr(float)
export function floatRepr(x: number): string {
  if (Number.isNaN(x)) return 'nan';
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf';
  const [m, e] = x.toExponential().split('e');
  let mant = m!;
  const exp = +e!;
  const neg = mant[0] === '-';
  if (neg) mant = mant.slice(1);
  const dg = mant.replace('.', '');
  let out;
  if (exp >= -4 && exp < 16) {
    if (exp >= 0) out = dg.slice(0, exp + 1).padEnd(exp + 1, '0') + '.' + (dg.slice(exp + 1) || '0');
    else out = '0.' + '0'.repeat(-exp - 1) + dg;
  } else {
    out = dg[0]! + (dg.length > 1 ? '.' + dg.slice(1) : '') + 'e' + (exp < 0 ? '-' : '+') + String(Math.abs(exp)).padStart(2, '0');
  }
  return (neg ? '-' : '') + out;
}
// hud4.js L127: str() / f"{v}"
export function pyStr(v: unknown): string {
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return Math.abs(v) < 1e21 ? String(v + 0) : BigInt(v).toString();
    return floatRepr(v);
  }
  return String(v);
}
// hud4.js L137: f"{x:.{f}f}" (exact, ties to even)
export function pyFixed(x: number, f: number): string {
  if (Number.isNaN(x)) return 'nan';
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf';
  const neg = x < 0 || Object.is(x, -0), ax = Math.abs(x);
  let ip, fp;
  if (ax >= 1e21) { ip = BigInt(ax).toString(); fp = ''; }
  else { const s = ax.toFixed(100), dot = s.indexOf('.'); ip = s.slice(0, dot); fp = s.slice(dot + 1); }
  let keep = BigInt(ip + fp.slice(0, f).padEnd(f, '0'));
  const rest = fp.slice(f), tail = /[1-9]/.test(rest.slice(1));
  // rest[0] is undefined when nothing is left past f digits: both comparisons are then false, as in the oracle
  if (rest[0]! > '5' || (rest[0] === '5' && (tail || keep % 2n === 1n))) keep += 1n;
  const dg = keep.toString().padStart(f + 1, '0');
  return (neg ? '-' : '') + (f ? dg.slice(0, -f) + '.' + dg.slice(-f) : dg);
}
// hud4.js L150: str.split() whitespace (Python's isspace set, which differs from JS \s), by code point
export const PY_WS: ReadonlySet<number> = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x2028, 0x2029, 0x202f, 0x205f, 0x3000]);
// hud4.js L154
export function family(model: unknown): string | undefined {
  // the family named anywhere in the name, in any case ('Claude Opus 4.5', 'claude-opus-4-5', 'opus 5.5'),
  // else gen.py's model.split()[0]
  const k = /(?:^|[^a-z])(opus|fable|sonnet|haiku)(?![a-z])/i.exec(String(model));
  if (k) return k[1]![0]!.toUpperCase() + k[1]!.slice(1).toLowerCase();
  let out = '', started = false;
  for (const ch of String(model)) {
    if (PY_WS.has(ch.codePointAt(0)!)) { if (started) break; } else { out += ch; started = true; }
  }
  return started ? out : undefined;
}

// ---------- the number readers (hud4.js L1268-1284) ----------
// Numbers are held to their domain; a number may also come as a numeric string ('93', ' 3.12', '98%').
// hud4.js L1273: a finite number, or undefined
export function num(v: unknown): number | undefined {
  if (typeof v === 'string') { const t = v.trim(); v = t === '' || t === '%' ? NaN : +(t.endsWith('%') ? t.slice(0, -1) : t); }
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
// hud4.js L1277
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
// hud4.js L1278
export const fin = (v: unknown, lo: number, hi: number): number => { const n = num(v); return n === undefined ? lo : clamp(n, lo, hi); };
// hud4.js L1279
export const whole = (v: unknown): number => Math.floor(fin(v, 0, 1e15));
// hud4.js L1280: Python's str(True) and ' TRUE ' too
export const flag = (v: unknown): boolean | null => {
  const t = typeof v === 'string' ? v.trim().toLowerCase() : v;
  return t === true || t === 1 || t === 'true' ? true : t === false || t === 0 || t === 'false' ? false : null;
};
// hud4.js L1284
export const obj = (v: unknown): Record<string, unknown> => (v !== null && typeof v === 'object' ? v as Record<string, unknown> : {});
