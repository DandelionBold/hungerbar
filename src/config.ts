// env > hungerbar.json > defaults (SPEC §12). Strict JSON; unknown keys are ignored.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { claudeDir, flag, offline, type Env } from './env.ts';

export const ITEM_IDS = ['model', 'effort', 'context', 'git', 'limit5h', 'limitWeek', 'scopedWeek', 'cache', 'extra', 'cwd', 'version'] as const;
export type ItemId = (typeof ITEM_IDS)[number];

export type Icons = 'minecraft' | 'unicode' | 'ascii';
/** What the limit icons and % count. */
export type LimitCount = 'left' | 'used';
/** Which Minecraft bar a limit window shows. */
export type Bar = 'hearts' | 'food';
/** hud: the Minecraft HUD, the mix picked in the design rounds (plan §1), the default; classic: the Classic Plus lines. */
export type Look = 'classic' | 'hud';
/** The HUD's Fable weekly options, the engine's fable-<id> without the prefix (src/hud/fable.ts FABLE_IDS). */
export const HUD_FABLES = ['off', 'tail', 'tooltip', 'boss', 'beacon'] as const;
export type HudFable = (typeof HUD_FABLES)[number];
/** Where the HUD sits: the left edge, or the hotbar in the middle of the status line (the default; SPEC §0.9, 0.6.0). */
export const HUD_ALIGNS = ['left', 'center'] as const;
export type HudAlign = (typeof HUD_ALIGNS)[number];
/**
 * The HUD's pull request and CI status after the branch (SPEC §0.9, 0.7.0): off (the default) or on, through the gh CLI.
 * It uses the network, so it stays off until the user says yes (setup asks; SPEC §0.10).
 */
export const HUD_PRS = ['off', 'on'] as const;
export type HudPr = (typeof HUD_PRS)[number];
/** Who you are before the folder on line 3 (SPEC §0.9, 0.7.0): nothing, your user name (the default), or user@host. */
export const HUD_USERS = ['off', 'user', 'user@host'] as const;
export type HudUser = (typeof HUD_USERS)[number];
/**
 * How the HUD marks a Claude Code that runs elevated (Administrator on Windows, root elsewhere; SPEC §0.9, 0.7.0): a
 * bold red [OP] before the name, the name in bold gold (the default; the ⌂ with the name off), or nothing.
 */
export const HUD_OPS = ['off', 'tag', 'gold'] as const;
export type HudOp = (typeof HUD_OPS)[number];
/** The idle bed in hotbar slot 4 and the phantoms of a long session (SPEC §0.9, 0.7.0): on (the default) or off. */
export const HUD_SWITCHES = ['on', 'off'] as const;
export type HudSwitch = (typeof HUD_SWITCHES)[number];

export interface Config {
  icons: Icons;
  color: 'auto' | 'always' | 'never';
  colorDepth: 'auto' | 'truecolor' | '256' | '16';
  bold: boolean;
  lines: ItemId[][];
  bar: { width: number };
  thresholds: { warn: number; crit: number };
  git: { mode: 'swr' | 'sync' | 'off'; ttlSeconds: number; timeoutMs: number };
  network: { usageApi: boolean; ttlSeconds: number; scopedWeekly: boolean };
  /** The icons and the % both count what is left (default) or both what is used (SPEC §0.8). */
  limits: LimitCount;
  /** Hearts for the session and food for the week: in Minecraft food refills the hearts (SPEC §0.6). */
  minecraft: { session: Bar; weekly: Bar };
  nbsp: boolean;
  widthReserve: number;
  look: Look;
  /**
   * fable: how the HUD draws a scoped weekly limit (Fable's); minWidth: the HUD only when a known budget is at least this;
   * align: where it sits in the status line (center: the hotbar in the middle of a known budget, src/hud/align.ts);
   * pr: the branch's pull request and its CI after the branch, from a background gh (opt-in: it uses the network);
   * user: your name before the folder; op: the operator's mark while Claude Code runs elevated; bed: a bed in hotbar
   * slot 4 after 5 minutes without a message, not while a tool runs; phantoms: phantoms in line 1's sky for each sign
   * of a long session.
   */
  hud: { fable: HudFable; minWidth: number; align: HudAlign; pr: HudPr; user: HudUser; op: HudOp; bed: HudSwitch; phantoms: HudSwitch };
}

/**
 * The defaults (SPEC §0.10): the HUD with Fable's boss bar, centred, the user's name with the gold
 * operator's mark, the bed and the phantoms. What uses the network stays off until the user says yes: the usage API and
 * scopedWeekly (which the Fable options need, so the boss bar draws nothing until then) and the PR status. setup asks
 * for both.
 */
export function defaults(): Config {
  return {
    icons: 'minecraft',
    color: 'auto',
    colorDepth: 'auto',
    bold: true,
    lines: [['model', 'effort', 'context', 'git'], ['limit5h', 'limitWeek', 'cache'], ['extra', 'cwd', 'version']],
    bar: { width: 16 },
    thresholds: { warn: 75, crit: 90 },
    git: { mode: 'swr', ttlSeconds: 15, timeoutMs: 2000 },
    network: { usageApi: false, ttlSeconds: 180, scopedWeekly: false },
    limits: 'left',
    minecraft: { session: 'hearts', weekly: 'food' },
    nbsp: true,
    widthReserve: 0,
    look: 'hud',
    hud: { fable: 'boss', minWidth: 80, align: 'center', pr: 'off', user: 'user', op: 'gold', bed: 'on', phantoms: 'on' },
  };
}

export interface Loaded {
  cfg: Config;
  path: string;
  /** Set when the file exists but is not valid JSON; the render adds a dim "cfg!" tag. */
  error: string | null;
}

export function configPath(env: Env): string {
  return env.HUNGERBAR_CONFIG || join(claudeDir(env), 'hungerbar.json');
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const oneOf = <T extends string>(v: unknown, opts: readonly T[], d: T): T => (typeof v === 'string' && (opts as readonly string[]).includes(v) ? (v as T) : d);
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const int = (v: unknown, d: number, lo: number, hi: number): number => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : d);

/** A Fable option: one of HUD_FABLES, or the engine's id ('fable-boss'); anything else is off (an absent one is the default, in merge). */
export function fableId(v: unknown): HudFable {
  return typeof v === 'string' ? oneOf(v.startsWith('fable-') ? v.slice(6) : v, HUD_FABLES, 'off') : 'off';
}

export function merge(raw: unknown): Config {
  const d = defaults();
  if (!isObj(raw)) return d;
  const lines = Array.isArray(raw.lines)
    ? raw.lines.slice(0, 3).filter(Array.isArray).map((l: unknown[]) => l.filter((x): x is ItemId => typeof x === 'string' && (ITEM_IDS as readonly string[]).includes(x)))
    : d.lines;
  const bar = isObj(raw.bar) ? raw.bar : {};
  const th = isObj(raw.thresholds) ? raw.thresholds : {};
  const git = isObj(raw.git) ? raw.git : {};
  const net = isObj(raw.network) ? raw.network : {};
  const mc = isObj(raw.minecraft) ? raw.minecraft : {};
  const hud = isObj(raw.hud) ? raw.hud : {};
  const warn = int(th.warn, d.thresholds.warn, 1, 100);
  return {
    icons: oneOf(raw.icons, ['minecraft', 'unicode', 'ascii'] as const, d.icons),
    color: oneOf(raw.color, ['auto', 'always', 'never'] as const, d.color),
    colorDepth: oneOf(raw.colorDepth, ['auto', 'truecolor', '256', '16'] as const, d.colorDepth),
    bold: bool(raw.bold, d.bold),
    lines,
    bar: { width: int(bar.width, d.bar.width, 4, 40) },
    thresholds: { warn, crit: Math.max(warn, int(th.crit, d.thresholds.crit, 1, 100)) },
    git: {
      mode: oneOf(git.mode, ['swr', 'sync', 'off'] as const, d.git.mode),
      ttlSeconds: int(git.ttlSeconds, d.git.ttlSeconds, 1, 3600),
      timeoutMs: int(git.timeoutMs, d.git.timeoutMs, 100, 30000),
    },
    network: {
      usageApi: bool(net.usageApi, d.network.usageApi),
      ttlSeconds: int(net.ttlSeconds, d.network.ttlSeconds, 60, 86400),
      scopedWeekly: bool(net.scopedWeekly, d.network.scopedWeekly),
    },
    limits: oneOf(raw.limits, ['left', 'used'] as const, d.limits),
    minecraft: {
      session: oneOf(mc.session, ['hearts', 'food'] as const, d.minecraft.session),
      weekly: oneOf(mc.weekly, ['hearts', 'food'] as const, d.minecraft.weekly),
    },
    nbsp: bool(raw.nbsp, d.nbsp),
    widthReserve: int(raw.widthReserve, d.widthReserve, 0, 200),
    look: oneOf(raw.look, ['classic', 'hud'] as const, d.look),
    // 62 at least: the hotbar sits at columns 16-61 (plan §9)
    // an absent hud.fable is the default (boss), any other value that is not an option off; for the other keys anything
    // but a listed value is the default: align center, pr off, user user, op gold, bed and phantoms on
    hud: {
      fable: hud.fable === undefined ? d.hud.fable : fableId(hud.fable), minWidth: int(hud.minWidth, d.hud.minWidth, 62, 200), align: oneOf(hud.align, HUD_ALIGNS, d.hud.align), pr: oneOf(hud.pr, HUD_PRS, d.hud.pr),
      user: oneOf(hud.user, HUD_USERS, d.hud.user), op: oneOf(hud.op, HUD_OPS, d.hud.op), bed: oneOf(hud.bed, HUD_SWITCHES, d.hud.bed), phantoms: oneOf(hud.phantoms, HUD_SWITCHES, d.hud.phantoms),
    },
  };
}

/** Environment variables win over the file. */
export function applyEnv(cfg: Config, env: Env): Config {
  const icons = env.HUNGERBAR_ICONS;
  if (icons === 'minecraft' || icons === 'unicode' || icons === 'ascii') cfg.icons = icons;
  if (flag(env, 'HUNGERBAR_ASCII') || env.TERM === 'dumb') cfg.icons = 'ascii';
  if (flag(env, 'HUNGERBAR_USAGE_API')) cfg.network.usageApi = true;
  const look = env.HUNGERBAR_LOOK;
  if (look === 'classic' || look === 'hud') cfg.look = look;
  const align = env.HUNGERBAR_HUD_ALIGN;
  if (align === 'left' || align === 'center') cfg.hud.align = align;
  return cfg;
}

export function loadConfig(env: Env): Loaded {
  const path = configPath(env);
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return { cfg: applyEnv(defaults(), env), path, error: null };
  }
  try {
    return { cfg: applyEnv(merge(JSON.parse(text.replace(/^﻿/, ''))), env), path, error: null };
  } catch (e) {
    return { cfg: applyEnv(defaults(), env), path, error: (e as Error).message };
  }
}

/** The usage API is opt-in and always off when non-essential traffic is disabled. */
export function usageEnabled(cfg: Config, env: Env): boolean {
  if (offline(env)) return false;
  return cfg.network.usageApi;
}

/** The HUD's PR status is opt-in (hud.pr on) and, like the usage API, always off when non-essential traffic is disabled. */
export function prEnabled(cfg: Config, env: Env): boolean {
  return cfg.hud.pr === 'on' && !offline(env);
}
