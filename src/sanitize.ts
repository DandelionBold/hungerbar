// Every string that comes from stdin, git, the transcript or the API passes through here (SPEC §7.5).

// CSI, OSC (ended by BEL or ST), any other two-byte ESC sequence, then a lone ESC.
const ESCAPES = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][\s\S]*?(?:\x07|\x1b\\)|\x1b[@-_]|\x1b/g;
// C0, DEL, C1 and the bidi controls.
const CONTROLS = /[\u0000-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]/g;

export function sanitize(s: string, cap: number): string {
  const clean = s.replace(ESCAPES, '').replace(CONTROLS, '');
  const cps = Array.from(clean);
  return cps.length > cap ? cps.slice(0, cap).join('') : clean;
}

/** Like sanitize, but keeps the end of the string and marks the cut with a leading ellipsis. */
export function sanitizeTail(s: string, cap: number, ellipsis: string): string {
  const cps = Array.from(s.replace(ESCAPES, '').replace(CONTROLS, ''));
  return cps.length > cap ? ellipsis + cps.slice(cps.length - cap + 1).join('') : cps.join('');
}

// branchFull and cwdFull are the HUD engine's own bounds (tidy keeps the last 256 and 512 code points), so it never cuts twice.
export const CAP = { model: 40, effort: 16, folder: 48, branch: 64, path: 64, version: 24, currency: 8, scoped: 24, branchFull: 256, cwdFull: 512 } as const;
