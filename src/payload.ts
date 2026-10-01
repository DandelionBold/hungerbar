// Claude Code's statusLine stdin JSON. Every field may be absent or null, and absent is never 0.

export interface RateWindow {
  used_percentage?: number | string | null;
  resets_at?: number | string | null;
}

export interface SpendLimit extends RateWindow {
  used_usd?: number | string | null;
  limit_usd?: number | string | null;
}

export interface Usage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export interface Payload {
  session_id?: string | null;
  transcript_path?: string | null;
  cwd?: string | null;
  version?: string | null;
  model?: { id?: string | null; display_name?: string | null } | string | null;
  effort?: { level?: string | null } | null;
  workspace?: { current_dir?: string | null; project_dir?: string | null } | null;
  worktree?: { branch?: string | null; path?: string | null } | null;
  cost?: { total_lines_added?: number | null; total_lines_removed?: number | null; total_cost_usd?: number | string | null; total_duration_ms?: number | string | null } | null;
  context_window?: {
    context_window_size?: number | string | null;
    used_percentage?: number | string | null;
    total_input_tokens?: number | string | null;
    current_usage?: Usage | number | null;
  } | null;
  rate_limits?: {
    five_hour?: RateWindow | null;
    seven_day?: RateWindow | null;
    spend_limit?: SpendLimit | null;
  } | null;
  prompt_cache?: {
    warm?: boolean | null;
    caching_observed?: boolean | null;
    ttl?: string | null;
    expires_at?: number | string | null;
    hit_ratio?: number | string | null;
  } | null;
}

/** A finite number, also from a numeric string; anything else is null. */
export function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

export function obj<T>(v: T | null | undefined | string | number): T | null {
  return v !== null && typeof v === 'object' ? (v as T) : null;
}

/** "Opus 5.5 (1M context)" → "Opus 5.5". */
export function cleanModelName(name: string): string {
  return name.replace(/\s*\([\d.]+[kKmM] context\)$/, '').trim();
}

/** "claude-opus-5-5[1m]" → "claude-opus-5-5", for comparing with transcript rows. */
export function baseModelId(id: string): string {
  return id.replace(/\[[^\]]*\]$/, '');
}
