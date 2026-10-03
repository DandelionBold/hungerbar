// Display width, wcwidth-lite (SPEC §7.6).

export function cpWidth(cp: number): number {
  if ((cp >= 0x300 && cp <= 0x36f) || (cp >= 0x200b && cp <= 0x200d) || (cp >= 0xfe00 && cp <= 0xfe0f)) return 0;
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff)
  ) return 2;
  return 1;
}

export function strWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += cpWidth(ch.codePointAt(0) ?? 0);
  return w;
}

/** Cuts s to at most max columns, ending with the ellipsis when anything was cut. */
export function truncateWidth(s: string, max: number, ellipsis: string): string {
  if (strWidth(s) <= max) return s;
  const room = max - strWidth(ellipsis);
  let out = '', w = 0;
  for (const ch of s) {
    const cw = cpWidth(ch.codePointAt(0) ?? 0);
    if (w + cw > room) break;
    out += ch;
    w += cw;
  }
  return out + ellipsis;
}
