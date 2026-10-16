// The HUD oracle (plan §4): the vendored engine test/reference/hud4.js (the HUD design as rounds 4-7 left it),
// loaded with vm, never bundled. Two loads, both in a fresh context that must stay empty (no leaked globals):
//   loadHud4()          the file untouched, as the design pickers load it
//   loadHud4WithPort()  the file with one extra key `_port` in its returned object (inserted in memory before
//                       `concepts: [`, which must occur exactly once), handing out the internals the TypeScript port is
//                       compared with function by function. The extra key changes nothing else: hud.reference.test.ts
//                       checks that both loads render the same.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

export const REF = join(dirname(fileURLToPath(import.meta.url)), '..', 'reference');
export const HUD4_PATH = join(REF, 'hud4.js');
export const HUD4_CODE = readFileSync(HUD4_PATH, 'utf8');
/** The engine's return block; `_port` goes in right after its `{`. */
export const MARK = '  return {\n    concepts: [';

/** A span as the engine makes it: S() sets fg, bg and bold only when truthy (withBg always sets bg). */
export interface RefSpan { t: string; fg?: string; bg?: string | null; bold?: boolean }
export type RefLines = RefSpan[][];
export interface RefOption { id: string; name: string; note: string }
export type OptionGroup = 'git' | 'pick' | 'book' | 'fable';
export interface MixOpts { style?: string; git?: string; pick?: string; book?: string; fable?: string }
export interface RefConcept {
  key: string;
  name: string;
  pitch: string;
  lines: number;
  options?: Record<OptionGroup, RefOption[]>;
  defaults?: Record<OptionGroup, string>;
  render(state: unknown, opts?: unknown): RefLines;
}
export interface Hud4 {
  concepts: RefConcept[];
  cellWidth(s: string): number;
  fromState(state: unknown): Record<string, unknown>;
}

/** The engine's state format (picker states, session4 frames): loose on purpose, the engine reads anything. */
export type RefState = Record<string, unknown>;
/** [quarter-hour index, biggest added + removed, added, removed, commit seen 0|1] */
export type Bucket = [number, number, number, number, number];
export interface RefHist {
  now: number;
  sessionStart: number | null;
  dirtySince: number | null;
  commits: number;
  lastCommit: { at: number; add: number; del: number; branch: string | null } | null;
  buckets: Bucket[];
}
export interface RefFrame extends RefState { hist: RefHist; scoped: Array<{ name: string; used: number; left: number }> }
export interface RefSession {
  STEP: number;
  END: number;
  frames: RefFrame[];
  events: Array<{ t: number; text: string }>;
  at(t: number): RefFrame;
}

/** The internals handed out through `_port`: everything src/hud/{wt,py,text,spans,input,mix,fable}.ts ports (plan §3). */
export const PORT_NAMES = [
  // wt.ts: WT 1.25 widths and grapheme clusters
  'WT', 'R0', 'R1', 'RW', 'cw', 'CB', 'B0', 'B1', 'BC', 'cls', 'JOIN', 'joins', 'cpOf', 'clusters', 'cellWidth',
  // py.ts: Python semantics and number readers
  'own', 'get', 'rep', 'pyLen', 'rjust', 'pyRound', 'divmod', 'pad02', 'floatRepr', 'pyStr', 'pyFixed', 'PY_WS', 'family',
  'num', 'clamp', 'fin', 'whole', 'flag', 'obj',
  // text.ts
  'BLANK', 'ESC_STR', 'ESC_CSI', 'ESC_ANY', 'tidy', 'isSep', 'parts', 'join', 'lastSeg', 'cut', 'tailPath', 'lite', 'none',
  // spans.ts
  'S', 'withBg', 'W', 'sameAttrs', 'merge', 'pad', 'rtrim', 'splitAt',
  // input.ts
  'fromState', 'SC_MISSING', 'readScoped', 'QUARTER', 'QUARTERS', 'histTime', 'histBranch', 'readHist',
  // mix.ts: palette, helpers, Day & Night lines 1-3, mix line 4 (pick-numeral, book on, git-terrain)
  'ROMAN', 'RARITY', 'TIER', 'GLINT', 'WELL', 'HEART', 'DARK', 'GOLD', 'FOOD', 'GREY', 'DGREY', 'WHITE', 'XPG', 'MAXW',
  'roman', 'glint', 'icons10', 't5', 'twk', 'kilo', 'day', 'pctColour', 'modelSpan', 'itemName', 'ctxLabel', 'paying',
  'G2', 'B2', 'DIV', 'f2Line1', 'f2Line2', 'f2Line3', 'f2Well', 'f2Gutter', 'F2SEL_L', 'F2SEL_R', 'f2Book', 'f2Gold',
  'ENCH', 'PLUS', 'MINUS', 'LEVEL', 'level', 'pickaxe', 'MIX_PICK', 'GRASS', 'COBBLE', 'BARE', 'LOWER8', 'LEFT8', 'changed',
  'gitBlocks', 'gitPile', 'spillReadout', 'YELLOW', 'LOW9', 'hex2', 'terrainLevel', 'terrain', 'MIX_GIT6', 'MIX_BOOK6',
  'mixLine4', 'MIX_OPTIONS', 'MIX_DEFAULTS', 'mixOpts', 'mix',
  // fable.ts
  'SC_RED', 'SC_SEP', 'scRarity', 'scPct', 'scClock', 'scInUse', 'scQuiet', 'scFit', 'scLine2', 'HEX_FULL', 'HEX_EMPTY',
  'scLoud', 'fableTail', 'scWear', 'scEighths', 'scDurability', 'scTooltip', 'fableTooltip', 'BOSS', 'bossFill', 'shade',
  'bossLine', 'fableBoss', 'BEACON_ON', 'BEACON_OFF', 'ACCENT', 'lerp', 'beamColour', 'beaconCol', 'chip', 'chips',
  'fableBeacon', 'MIX_FABLE', 'mixFable',
] as const;
export type PortName = (typeof PORT_NAMES)[number];
// The oracle's internals are untyped JavaScript; each port test states the types it compares.
export type Port = Readonly<Record<PortName, any>>;

/** Runs `code` in a fresh, empty context and returns its completion value; the context must stay empty. */
export function isolate<T>(code: string, what: string, filename = HUD4_PATH): T {
  const ctx = {};
  const out = vm.runInNewContext(code, ctx, { filename }) as T;
  const leaked = Object.keys(ctx);
  if (leaked.length) throw new Error(`${what} leaked globals: ${leaked.join(', ')}`);
  return out;
}

/** hud4.js with `_port` inserted; throws unless the return block occurs exactly once. */
export function withPort(code: string = HUD4_CODE): string {
  const parts = code.split(MARK);
  if (parts.length !== 2) throw new Error(`hud4.js: the return block occurs ${parts.length - 1} times, not once`);
  return `${parts[0]}  return {\n    _port: { ${PORT_NAMES.join(', ')} },\n    concepts: [${parts[1]}`;
}

export const loadHud4 = (): Hud4 => isolate<Hud4>(HUD4_CODE + '\n;HUD4', 'hud4.js');
export const loadHud4WithPort = (): Hud4 & { _port: Port } => isolate<Hud4 & { _port: Port }>(withPort() + '\n;HUD4', 'hud4.js with _port');

export function mixOf(h: Hud4): RefConcept {
  const m = h.concepts.find((c) => c.key === 'mix');
  if (!m) throw new Error('hud4.js has no mix concept');
  return m;
}

/** The oracle every port test uses: one load with `_port`. */
export const HUD4 = loadHud4WithPort();
export const PORT: Port = HUD4._port;
export const MIX = mixOf(HUD4);
export const fromState = (state: unknown): Record<string, unknown> => HUD4.fromState(state);
export const cellWidth = (s: string): number => HUD4.cellWidth(s);

/** The fable ids Hungerbar ships (fable-mount is not shipped). */
export const FABLE_IDS = ['fable-off', 'fable-tail', 'fable-tooltip', 'fable-boss', 'fable-beacon'] as const;
export type FableId = (typeof FABLE_IDS)[number];
/** The pick (round 6, kept in round 7): the only mix Hungerbar ships, with the fable option on top. */
export const HUD_PICK = { git: 'git-terrain', pick: 'pick-numeral', book: 'on', style: 'colour' } as const;
export const picked = (fable: FableId, style: 'colour' | 'plain' = 'colour'): MixOpts => ({ ...HUD_PICK, style, fable });

/** A JSON copy in this realm: objects and arrays out of vm have other prototypes, so deepStrictEqual needs this. */
export const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** The form renders are compared and hashed in: [t, fg ?? null, bg ?? null, bold ?? null] per span. */
export type Tuple = [string, string | null, string | null, boolean | null];
export const tuples = (lines: RefLines): Tuple[][] => lines.map((l) => l.map((s) => [s.t, s.fg ?? null, s.bg ?? null, s.bold ?? null]));
export const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');
/** hud-spec.json's hash of a render (a list of lines). */
export const renderHash = (lines: RefLines): string => sha256(JSON.stringify(tuples(lines)));

const readJson = <T>(file: string): T => JSON.parse(readFileSync(join(REF, file), 'utf8')) as T;
/** round4/states.json: the four picker situations (normal, tight, fresh, extra). */
export const STATES = readJson<Record<'normal' | 'tight' | 'fresh' | 'extra', RefState>>('hud4-states.json');
/** round4/session4.js: the 5½-hour time-lapse, 661 frames 30 s apart, each with its hist and scoped. */
export const SESSION = isolate<RefSession>(readFileSync(join(REF, 'hud4-session.js'), 'utf8') + '\n;SESSION', 'hud4-session.js',
  join(REF, 'hud4-session.js'));

export interface SpecInput { from: string; about: string; state: RefState }
export interface HudSpec {
  about: string;
  hash: string;
  sources: Record<'round6' | 'round7', { file: string; sha256: string }>;
  hudPick: typeof HUD_PICK;
  round6: { option: string; renders: string; inputs: Record<string, SpecInput & { sha256: string }> };
  round7: { ids: FableId[]; renders: string; situations: Record<string, SpecInput & { sha256: Record<FableId, string> }> };
}
export const SPEC = readJson<HudSpec>('hud-spec.json');

export interface SourceEntry {
  kind: 'copy' | 'renamed' | 'extract' | 'tool' | 'generated';
  origin?: string | string[];
  originSha256?: string | Record<string, string>;
  originDate?: string;
  sha256: string;
  note?: string;
}
export interface Sources { about: string; origins: string; renamed: string; vendored: string; files: Record<string, SourceEntry> }
export const SOURCES = readJson<Sources>('SOURCES.json');

/** test/reference/hud4-cache.mjs: the round-6 judge's history cache (r6lib.mjs), verbatim. */
export interface CacheGit {
  head?: string | null;
  reflog?: (from: string, to: string) => unknown;
  stat?: (from: string, to: string) => unknown;
  oldest?: () => unknown;
}
export type CacheEntry = RefHist & { branch: string | null | undefined; head: string | null; add: number; del: number };
export interface CacheLib {
  BUCKET: number;
  NB: number;
  BRANCH_MAX: number;
  MS_ABOVE: number;
  SESSION: RefSession;
  branchOf(v: unknown): string | null;
  cleanHist(h: unknown): RefHist | null;
  isCommitSubject(s: unknown): boolean;
  reflogEntry(line: unknown): { sha: string | null; subject: string | null };
  cacheStep(cache: unknown, state: unknown, now: number, git?: CacheGit): [CacheEntry, RefHist];
  commitsOf(events?: RefSession['events']): Array<{ t: number; add: number; del: number }>;
  framesWithHist(frames?: RefFrame[], step?: number, events?: RefSession['events']): RefFrame[];
}
export const loadCache = async (): Promise<CacheLib> => (await import(pathToFileURL(join(REF, 'hud4-cache.mjs')).href)) as CacheLib;
