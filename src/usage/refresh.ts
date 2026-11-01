// `hungerbar refresh usage`: the opt-in OAuth usage worker, and since 1.1.0 a command for people too. Never runs on the
// render path (SPEC §11, §13).
import { captureUsage } from '../capture.ts';
import { loadConfig } from '../config.ts';
import { intEnv, nowSec, offline, VERSION, type Env } from '../env.ts';
import { limitPct, moneyLimit, moneyUsed, timeLeft } from '../format.ts';
import { CAP, sanitize } from '../sanitize.ts';
import { acctDir, tryLock, unlock, writeJson } from '../store.ts';
import { getToken, securityKeychain, type KeychainReader } from './creds.ts';
import { readUsage, usageLockPath, usagePath, type UsageExtra, type UsageFile, type UsageScoped } from './file.ts';

export const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';

/** HUNGERBAR_USAGE_URL is honoured only for a local mock server. */
export function usageUrl(env: Env): string {
  const u = env.HUNGERBAR_USAGE_URL;
  if (u) {
    try {
      const h = new URL(u).hostname;
      if (h === '127.0.0.1' || h === 'localhost') return u;
    } catch { /* ignored */ }
  }
  return USAGE_URL;
}

interface ApiLimit {
  kind?: unknown;
  percent?: unknown;
  resets_at?: unknown;
  scope?: { model?: { display_name?: unknown } | null } | null;
}

interface ApiBody {
  extra_usage?: { is_enabled?: unknown; used_credits?: unknown; monthly_limit?: unknown; currency?: unknown } | null;
  limits?: unknown;
}

const numOr = (v: unknown, d: number | null): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function parseBody(body: ApiBody): { extra: UsageExtra | null; scoped: UsageScoped[] } {
  const x = body.extra_usage;
  const extra: UsageExtra | null = x
    ? {
        enabled: x.is_enabled === true,
        usedCents: numOr(x.used_credits, 0) ?? 0,
        limitCents: numOr(x.monthly_limit, null),
        currency: typeof x.currency === 'string' && x.currency ? x.currency : 'USD',
      }
    : null;
  const scoped: UsageScoped[] = [];
  if (Array.isArray(body.limits)) {
    for (const l of body.limits as ApiLimit[]) {
      const name = l?.scope?.model?.display_name;
      if (l?.kind !== 'weekly_scoped' || typeof name !== 'string' || !name) continue;
      const t = typeof l.resets_at === 'string' ? Date.parse(l.resets_at) : NaN;
      // An entry with percent 0 and no reset that names a model is real data (ccstatusline's rule).
      scoped.push({ name, pct: numOr(l.percent, 0) ?? 0, resets_at: Number.isFinite(t) ? Math.floor(t / 1000) : null });
    }
  }
  return { extra, scoped };
}

/**
 * One fetch; the usage.json it wrote, or null when it did nothing (non-essential traffic off, or another refresh holds
 * the lock). `readKeychain` and `platform` go to getToken, so the tests hand it a stub and never run the real
 * `security`, on any OS.
 */
export async function refreshUsage(env: Env, readKeychain: KeychainReader = securityKeychain, platform: NodeJS.Platform = process.platform): Promise<UsageFile | null> {
  if (offline(env)) return null;
  const acct = acctDir(env);
  const lock = usageLockPath(acct);
  if (!tryLock(lock, 30_000)) return null;
  const now = nowSec(env);
  const prev = readUsage(acct);
  const write = (u: UsageFile): UsageFile => {
    writeJson(usagePath(acct), u);
    return u;
  };
  const keep = (lockFor: number, error: string): UsageFile =>
    write({ v: 1, at: prev?.at ?? now, extra: prev?.extra ?? null, scoped: prev?.scoped ?? [], lockUntil: now + lockFor, error });
  try {
    const token = getToken(env, Date.now(), platform, readKeychain);
    if (!token) return keep(600, 'no-credentials');
    const url = usageUrl(env);
    // The timeout override exists for the mock-server tests and only applies to a local URL.
    const timeoutMs = (url !== USAGE_URL && intEnv(env, 'HUNGERBAR_USAGE_TIMEOUT_MS')) || 5000;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20', 'User-Agent': `hungerbar/${VERSION}` },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return keep(30, 'network');
    }
    if (res.status === 401 || res.status === 403) return keep(600, 'auth');
    if (res.status === 429) {
      const ra = Number(res.headers.get('retry-after'));
      return keep(Number.isFinite(ra) && ra > 0 ? Math.min(Math.ceil(ra), 86400) : 300, 'rate-limited');
    }
    if (!res.ok) return keep(30, `http-${res.status}`);
    let body: ApiBody;
    try {
      body = (await res.json()) as ApiBody;
    } catch {
      return keep(30, 'parse');
    }
    const { extra, scoped } = parseBody(body ?? {});
    if (env.HUNGERBAR_CAPTURE) captureUsage(body, env.HUNGERBAR_CAPTURE, nowSec(env));
    return write({ v: 1, at: nowSec(env), extra, scoped, lockUntil: 0 });
  } finally {
    unlock(lock);
  }
}

/** What `hungerbar refresh usage` says when the usage API is off in the config. */
export const USAGE_OFF = 'the usage API is off (network.usageApi); nothing fetched';

/** A failed fetch's reason (usage.json's error) in words. */
function why(error: string): string {
  if (error === 'no-credentials') return 'no Claude login token was found';
  if (error === 'auth') return 'the login token was refused';
  if (error === 'network') return 'no answer (network or timeout)';
  if (error === 'parse') return 'the answer was not JSON';
  if (/^http-\d+$/.test(error)) return 'HTTP ' + error.slice(5);
  return sanitize(error, 32) || 'an error';
}

const nextTry = (u: UsageFile, now: number): string => `the next try is in ${timeLeft(u.lockUntil - now) ?? 'under a minute'}`;

/**
 * The one line `hungerbar refresh usage` prints for a fetch (1.1.0): the extra credits left (and, with scopedWeekly
 * on, each per-model weekly % left), or why it failed and when the background refresher tries again. Null: another
 * refresh held the lock.
 */
export function usageSummary(u: UsageFile | null, now: number, scopedWeekly: boolean): string {
  if (!u) return 'a usage refresh is already running; nothing fetched';
  if (u.error) return `usage API: ${why(u.error)}; ${nextTry(u, now)}`;
  const x = u.extra, cur = sanitize(x?.currency || 'USD', CAP.currency) || 'USD';
  const parts = [
    !x ? 'no extra usage in the answer'
      : !x.enabled ? 'extra usage is off for this account'
        : x.limitCents === null ? `extra credits ${moneyUsed(x.usedCents / 100, cur)} used, no monthly limit`
          : `extra credits ${moneyUsed(Math.max(0, x.limitCents - x.usedCents) / 100, cur)} left of ${moneyLimit(x.limitCents / 100, cur)}`,
  ];
  if (scopedWeekly) {
    // a reset that has passed is a full week, as the HUD draws it until the next fetch
    const left = (s: UsageScoped): number => (s.resets_at !== null && s.resets_at <= now ? 100 : 100 - limitPct(s.pct));
    parts.push(u.scoped.length ? u.scoped.map((s) => `${sanitize(s.name, CAP.scoped)}'s weekly ${left(s)}% left`).join(', ') : 'no per-model weekly limit');
  }
  return `${parts.join('; ')} (fetched now)`;
}

/**
 * `hungerbar refresh usage` (SPEC §13, 1.1.0): one fetch now, whatever the TTL, and one line saying what came back.
 * Nothing is fetched (and no token read) while non-essential traffic is off, while the usage API is off in the config,
 * or while a 429's lock lasts. The render's detached worker runs the same command; its stdout goes nowhere.
 */
export async function refreshUsageNow(env: Env, readKeychain: KeychainReader = securityKeychain, platform: NodeJS.Platform = process.platform): Promise<string> {
  if (offline(env)) return 'non-essential traffic is off here (HUNGERBAR_OFFLINE or CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC); nothing fetched';
  const { cfg } = loadConfig(env);
  if (!cfg.network.usageApi) return USAGE_OFF;
  const now = nowSec(env), prev = readUsage(acctDir(env));
  if (prev?.error === 'rate-limited' && prev.lockUntil > now) return `usage API: rate-limited; ${nextTry(prev, now)} (nothing fetched now)`;
  return usageSummary(await refreshUsage(env, readKeychain, platform), nowSec(env), cfg.network.scopedWeekly);
}
