// `hungerbar icons [plain|colour] [--print]`: the two icon styles (SPEC §0.7).
// Hungerbar prints the same text in both. Windows Terminal decides how 🍗 🔥 💾 💳 ❄ look: with "Segoe UI Symbol"
// after the main font they are plain glyphs in Hungerbar's colours, without it they are colour emoji.
// Only the default profile font face changes, after a backup; every other byte of settings.json stays as it was.
import { chmodSync, copyFileSync, existsSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Env } from '../env.ts';
import { writeAtomic } from '../store.ts';
import { optionError, parseArgs, say } from './args.ts';
import { indentAt, JsoncError, scan, type Located } from './jsonc.ts';
import { stamp } from './setup.ts';

export const SYMBOL_FONT = 'Segoe UI Symbol';
export type IconStyle = 'plain' | 'colour';
const WT_DEFAULT_FONT = 'Cascadia Mono';

export function parseStyle(s: string | undefined): IconStyle | null {
  const v = s?.toLowerCase();
  return v === 'plain' ? 'plain' : v === 'colour' || v === 'color' ? 'colour' : null;
}

export function wtSettingsCandidates(env: Env): string[] {
  if (env.HUNGERBAR_WT_SETTINGS) return [env.HUNGERBAR_WT_SETTINGS];
  const local = env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
  return [
    join(local, 'Packages', 'Microsoft.WindowsTerminal_8wekyb3d8bbwe', 'LocalState', 'settings.json'),
    join(local, 'Packages', 'Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe', 'LocalState', 'settings.json'),
    join(local, 'Packages', 'Microsoft.WindowsTerminalCanary_8wekyb3d8bbwe', 'LocalState', 'settings.json'),
    join(local, 'Microsoft', 'Windows Terminal', 'settings.json'),
  ];
}

/** Every installed Windows Terminal's settings.json (stable, Preview, Canary, unpackaged), symlinks resolved. */
export function wtSettingsFiles(env: Env): string[] {
  const out: string[] = [];
  for (const c of wtSettingsCandidates(env)) {
    if (!existsSync(c)) continue;
    let p = c;
    try { p = realpathSync(c); } catch { /* keep the path as found */ }
    if (!out.some((o) => o.toLowerCase() === p.toLowerCase())) out.push(p);
  }
  return out;
}

export interface FontState {
  face: string;
  faces: string[];
  style: IconStyle;
  /** Where the face came from: the defaults "font" object, the legacy fontFace key, or Windows Terminal's default. */
  source: 'font.face' | 'fontFace' | 'default';
  /** Profiles that set their own font face, which a defaults change does not reach. */
  overrides: Array<{ name: string; face: string }>;
}

const isSymbol = (f: string): boolean => f.toLowerCase() === SYMBOL_FONT.toLowerCase();

/** Windows Terminal's rule: when a scope has a "font" key only font.face counts; fontFace only without one. */
function faceIn(m: Map<string, Located>, scope: string): Located | undefined {
  if (m.has(`${scope}.font`)) return m.get(`${scope}.font.face`);
  return m.get(`${scope}.fontFace`);
}

export function readFontState(text: string): FontState {
  const m = scan(text);
  const f = faceIn(m, 'profiles.defaults');
  const face = f?.kind === 'string' && f.value!.trim() ? f.value! : WT_DEFAULT_FONT;
  const faces = face.split(',').map((s) => s.trim()).filter(Boolean);
  const overrides: FontState['overrides'] = [];
  for (const [path] of m) {
    const hit = /^profiles\.list\[(\d+)\]$/.exec(path);
    if (!hit) continue;
    const o = faceIn(m, path);
    if (o?.kind === 'string') overrides.push({ name: m.get(`${path}.name`)?.value ?? `profile ${hit[1]}`, face: o.value! });
  }
  return {
    face, faces, overrides,
    style: faces.some(isSymbol) ? 'plain' : 'colour',
    source: f?.kind !== 'string' ? 'default' : f.path.endsWith('fontFace') ? 'fontFace' : 'font.face',
  };
}

/** The font list for a style: Segoe UI Symbol right after the main font for plain, nowhere for colour. */
export function faceFor(faces: string[], style: IconStyle): string {
  const rest = faces.filter((f) => !isSymbol(f));
  if (rest.length === 0) rest.push(WT_DEFAULT_FONT);
  return (style === 'plain' ? [rest[0]!, SYMBOL_FONT, ...rest.slice(1)] : rest).join(', ');
}

/** Adds a member right after an object's "{", indented like its siblings (or one level deeper than the object). */
function insertMember(text: string, obj: Located, member: string): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const base = indentAt(text, obj.start);
  let indent = base + (base.includes('\t') ? '\t' : '    ');
  if (obj.members) {
    const first = /"/.exec(text.slice(obj.start + 1));
    if (first) {
      const at = obj.start + 1 + first.index;
      const lineStart = text.lastIndexOf('\n', at - 1) + 1;
      if (lineStart > obj.start) indent = indentAt(text, at);
    }
  }
  return text.slice(0, obj.start + 1) + eol + indent + member + (obj.members ? ',' : eol + base) + text.slice(obj.start + 1);
}

/** The settings text with only the default font face set (inserted where Windows Terminal reads it if absent). */
export function setDefaultFace(text: string, face: string): string {
  const m = scan(text);
  const lit = JSON.stringify(face);
  const splice = (loc: Located): string => {
    if (loc.kind !== 'string') throw new JsoncError('the default font face is not a string');
    return text.slice(0, loc.start) + lit + text.slice(loc.end);
  };
  const profiles = m.get('profiles'), defaults = m.get('profiles.defaults'), font = m.get('profiles.defaults.font');
  if (profiles && profiles.kind !== 'object') throw new JsoncError('"profiles" is not an object (an older layout)');
  if (defaults && defaults.kind !== 'object') throw new JsoncError('"profiles.defaults" is not an object');
  if (font) {
    if (font.kind !== 'object') throw new JsoncError('"font" under profiles.defaults is not an object');
    const f = m.get('profiles.defaults.font.face');
    return f ? splice(f) : insertMember(text, font, `"face": ${lit}`);
  }
  const legacy = m.get('profiles.defaults.fontFace');
  if (legacy) return splice(legacy);
  if (defaults) return insertMember(text, defaults, `"font": { "face": ${lit} }`);
  if (profiles) return insertMember(text, profiles, `"defaults": { "font": { "face": ${lit} } }`);
  throw new JsoncError('no "profiles" object');
}

function backupPath(path: string): string {
  const base = `${path}.bak.hungerbar-icons-${stamp()}`;
  let to = base;
  for (let i = 2; existsSync(to); i++) to = `${base}-${i}`;
  return to;
}

interface FileResult { ok: boolean; lines: string[] }

/** Reads, plans and (unless print) applies the switch for one settings.json. */
function switchFile(path: string, want: IconStyle | null, print: boolean): FileResult {
  const lines: string[] = [], fail = (msg: string): FileResult => ({ ok: false, lines: [...lines, msg] });
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch (e) {
    return fail(`cannot read it: ${(e as NodeJS.ErrnoException).code ?? (e as Error).message}`);
  }
  const text = bytes.toString('utf8');
  let st: FontState;
  try {
    if (!Buffer.from(text, 'utf8').equals(bytes)) throw new JsoncError('it is not UTF-8 text');
    st = readFontState(text);
  } catch (e) {
    return fail(`cannot read it: ${(e as Error).message}`);
  }
  lines.push(`icons: ${st.style} (font face "${st.face}"${st.source === 'default' ? ", Windows Terminal's default" : ''})`);
  for (const o of st.overrides) lines.push(`note: profile "${o.name}" sets its own font face ("${o.face}"), so this switch does not reach it; change it in that profile.`);
  if (!want) return { ok: true, lines };
  if (want === st.style) return { ok: true, lines: [...lines, `already ${want}; nothing changed.`] };
  const face = faceFor(st.faces, want);
  let next: string;
  try {
    next = setDefaultFace(text, face);
    if (readFontState(next).face !== face) throw new JsoncError('the edit did not land where Windows Terminal reads it');
  } catch (e) {
    return fail(`cannot change it: ${(e as Error).message}. Set it by hand: Settings → Profiles → Defaults → Appearance → Font face = ${face}`);
  }
  if (print) return { ok: true, lines: [...lines, `would set the default font face to "${face}" (nothing written, --print).`] };
  const bak = backupPath(path);
  try {
    copyFileSync(path, bak);
    // A hard-linked file (a dotfiles setup) is written in place so every link sees the change.
    if (statSync(path).nlink > 1) writeFileSync(path, next);
    else writeAtomic(path, next);
  } catch (e) {
    try { chmodSync(bak, 0o666); unlinkSync(bak); } catch { /* no backup was made */ }
    const code = (e as NodeJS.ErrnoException).code;
    return fail(`could not write it (${code ?? (e as Error).message}): it is read-only or another program has it open. Nothing changed.`);
  }
  return { ok: true, lines: [...lines, `now ${want} (font face "${face}"). Windows Terminal reloads its settings by itself.`, `backup: ${bak}`] };
}

const USAGE = 'usage: hungerbar icons [plain|colour] [--print]';

export function icons(argv: string[], env: Env): number {
  const a = parseArgs(argv, []);
  const opt = optionError(a, [], ['print']);
  if (opt) {
    process.stderr.write(`hungerbar: ${opt}\n${USAGE}\n`);
    return 1;
  }
  const want = parseStyle(a.rest[0]);
  if (a.rest[0] && !want) {
    process.stderr.write(`hungerbar: unknown icon style "${a.rest[0]}"\n${USAGE}\n`);
    return 1;
  }
  const files = wtSettingsFiles(env);
  if (files.length === 0) {
    say('Windows Terminal settings not found. In another terminal, plain icons need that terminal to fall back to Segoe UI Symbol (or another plain symbol font) before its colour emoji font.');
    return want ? 1 : 0;
  }
  let ok = true;
  for (const f of files) {
    const r = switchFile(f, want, a.flags.has('print'));
    say(`Windows Terminal settings: ${f}`);
    for (const l of r.lines) (r.ok ? say : (s: string) => process.stderr.write(`hungerbar: ${s}\n`))(`  ${l}`);
    ok &&= r.ok;
  }
  if (!want && ok) say('switch with: hungerbar icons plain   or   hungerbar icons colour');
  return ok ? 0 : 1;
}

/** One-line style summary for setup and doctor; null when there is no Windows Terminal. */
export function iconSummary(env: Env): Array<{ path: string; state: FontState | null; error: string | null }> {
  return wtSettingsFiles(env).map((path) => {
    try {
      const bytes = readFileSync(path), text = bytes.toString('utf8');
      if (!Buffer.from(text, 'utf8').equals(bytes)) throw new JsoncError('not UTF-8 text');
      return { path, state: readFontState(text), error: null };
    } catch (e) {
      return { path, state: null, error: (e as Error).message };
    }
  });
}
