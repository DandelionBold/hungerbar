// The HUD look's edge (plan §2, §9): the gate that picks it over classic, the HUD path of one render (renderHudLook:
// adapt, the history step, the engine, the git state and the PR's badge (gitstate.ts, prci.ts, 0.7.0), the player's
// layers (player.ts: the name and the operator's mark, the idle bed, the phantoms, 0.7.0), the hotbar's frame
// (frame.ts, 0.5.1), the centring (align.ts, 0.6.0), the writer), and the writer that turns the HUD's spans into the
// bytes Claude Code shows.
// render.ts answers a throw from the HUD path with classic and the stack on stderr.
// The writer is test/hud/sgr-oracle.ts's encoding: each span gets 1 (bold, when the span is bold and cfg.bold), then fg
// (38;2;R;G;B, or 38;5;n at 256 colours), then bg (48;2 or 48;5); a styled span is ESC[…m + text + ESC[0m and a span with
// no params is its bare text, so every styled line ends in ESC[0m and trimming a line never drops its last background
// cell. With nbsp on, every space is U+00A0, background cells included: the same width the engine measured.
import { bgParams, fgParams, type Depth } from '../color.ts';
import type { Config } from '../config.ts';
import { flag, type Env } from '../env.ts';
import { budget } from '../layout.ts';
import { str, type Payload } from '../payload.ts';
import type { Sources, State } from '../state.ts';
import { adapt, type HudState } from './adapter.ts';
import { hudOffset, shiftHud } from './align.ts';
import { renderHud } from './fable.ts';
import { frameHud } from './frame.ts';
import { gitHud, gitMarks, type GitMarks } from './gitstate.ts';
import { fromState } from './input.ts';
import { signs } from './phantoms.ts';
import { away, playerHud, sessionSecs, type PlayerMarks } from './player.ts';
import { prBadge } from './prci.ts';
import type { Span } from './spans.ts';
import type { PrInfo } from '../pr/gh.ts';

/** The depths the HUD draws at: its wells, notches and lost hearts are colour only. */
export type HudDepth = 'truecolor' | '256';

/** The HUD's lines as SGR: lines joined with \n, no trailing newline. */
export function encode(lines: readonly (readonly Span[])[], depth: HudDepth, cfg: Pick<Config, 'bold' | 'nbsp'>): string {
  return lines.map((line) => {
    let out = '';
    for (const s of line) {
      const p: string[] = [];
      if (s.bold && cfg.bold) p.push('1');
      if (s.fg) p.push(fgParams(s.fg, depth));
      if (s.bg) p.push(bgParams(s.bg, depth));
      const t = cfg.nbsp ? s.t.replaceAll(' ', '\u00a0') : s.t;
      out += p.length ? `\x1b[${p.join(';')}m${t}\x1b[0m` : t;
    }
    return out;
  }).join('\n');
}

export type Gate = { ok: true; depth: HudDepth } | { ok: false; reason: string };

/**
 * Whether this render draws the HUD; when it does not, the render is classic, byte for byte. The first reason that holds
 * wins: an invalid hungerbar.json (even with HUNGERBAR_LOOK=hud: classic shows its cfg! tag), a look other than hud, no
 * colour or 16 colours, ASCII mode, a known budget (HUNGERBAR_WIDTH or COLUMNS, minus 4 and widthReserve) below
 * hud.minWidth. With an unknown width the HUD always draws: it never re-fits itself, 110 cells is the engine's grid.
 */
export function hudGate(cfg: Config, cfgError: string | null, depth: Depth, env: Env): Gate {
  if (cfgError !== null) return { ok: false, reason: 'hungerbar.json is invalid' };
  if (cfg.look !== 'hud') return { ok: false, reason: 'look is classic' };
  if (depth === 'none') return { ok: false, reason: 'no colour (NO_COLOR, FORCE_COLOR=0 or color "never")' };
  if (depth === '16') return { ok: false, reason: '16 colours (FORCE_COLOR=1 or colorDepth "16")' };
  // applyEnv folds HUNGERBAR_ASCII and TERM=dumb into icons; an in-memory config (preview) may not have been through it
  if (cfg.icons === 'ascii' || flag(env, 'HUNGERBAR_ASCII') || env.TERM === 'dumb') return { ok: false, reason: 'ASCII mode (icons "ascii", HUNGERBAR_ASCII or TERM=dumb)' };
  const b = budget(env, cfg);
  if (b !== null && b < cfg.hud.minWidth) return { ok: false, reason: `budget ${b} is below hud.minWidth ${cfg.hud.minWidth}` };
  return { ok: true, depth };
}

/**
 * What the HUD path drew (RenderResult.hud, for the tests): the bytes, the engine's input, the git state's input (marks),
 * the pull request (null: none drawn), the player's layers' input, the engine's lines (the oracle's, span for span), the
 * lines with the git state, the PR's badge, the player's layers and the hotbar's frame (gitHud, playerHud, then frameHud:
 * one more line, the bottom edge, and the boss line without its name), and the centring's offset (0 unless hud.align is
 * center and the budget leaves room): the bytes are encode(shiftHud(framed, offset)).
 */
export interface HudRender { text: string; input: HudState; git: GitMarks; pr: PrInfo | null; player: PlayerMarks; lines: Span[][]; framed: Span[][]; offset: number }

/**
 * What the player's layers draw this render (SPEC §0.9, 0.7.0). Each part is read only when its option draws it: the
 * names (hud.user) and the elevation check (hud.op) from the sources' WhoSource (none: nothing), the last message's time
 * and whether a tool call is running (hud.bed) from stdin's prompt cache and the transcript's summary, the signs
 * (hud.phantoms) from the engine's input and the session's age (stdin's cost.total_duration_ms, else the history's
 * sessionStart).
 */
export function playerMarks(st: State, p: Payload, sources: Sources, cfg: Config, input: HudState): PlayerMarks {
  const h = cfg.hud, w = sources.who;
  const user = w && h.user !== 'off' ? w.user() || null : null;
  const host = w && user && h.user === 'user@host' ? w.host() || null : null;
  const op = w && h.op !== 'off' && w.elevated() ? h.op : null;
  const bed = h.bed === 'on' && away(st.now, p, sources.transcript());
  const phantoms = h.phantoms === 'on' ? signs({ turns: input.turns, compactions: input.compactions, ctxPct: input.ctxPct, secs: sessionSecs(p, st.now, input.hist) }) : 0;
  return { who: { user, host, op }, bed, phantoms };
}

/**
 * The HUD path of one render (plan §2). The history step is handed the port's own reading of this state (fromState's
 * branch, add and rem), so the history file keys on the same branch text the engine draws; its write, when anything
 * changed, waits on the render's `after` list until the line is out. The git state and the PR's badge (0.7.0) are drawn
 * on the engine's finished hotbar line, from the readout's ⎇ on, then the player's layers (0.7.0) in their own cells,
 * and the frame on the result; with hud.align center every framed line then moves right by one offset, from `budget`
 * (the gate's, null when the width is unknown) and the widest line. With left nothing is measured and the
 * framed lines are encoded as they are.
 */
export function renderHudLook(st: State, p: Payload, sources: Sources, cfg: Config, depth: HudDepth, budget: number | null): HudRender {
  const input = adapt(st, p, sources.counts());
  const sit = fromState(input), g = sit.git;
  const full: HudState = { ...input, hist: sources.history(st.git.repo, g ? g.branch : null, g ? g.add : 0, g ? g.rem : 0) };
  const git = gitMarks(st.git, str(p.worktree?.branch) !== null);
  const pr = g && sources.pr ? sources.pr(st.git.repo) : null;
  const player = playerMarks(st, p, sources, cfg, full);
  const lines = renderHud(full, cfg.hud.fable);
  const framed = frameHud(playerHud(g ? gitHud(lines, git, g.branch, prBadge(pr)) : lines, player, sit.cwd));
  const offset = hudOffset(cfg.hud.align, budget, framed);
  return { text: encode(offset ? shiftHud(framed, offset) : framed, depth, cfg), input: full, git, pr, player, lines, framed, offset };
}
