// `hungerbar refresh usage`: the opt-in OAuth usage worker. Never runs on the render path (SPEC §11).
import { flag, intEnv, nowSec, VERSION, type Env } from '../env.ts';
import { acctDir, tryLock, unlock, writeJson } from '../store.ts';
import { getToken } from './creds.ts';
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

export async function refreshUsage(env: Env): Promise<void> {
  if (env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC || flag(env, 'HUNGERBAR_OFFLINE')) return;
  const acct = acctDir(env);
  const lock = usageLockPath(acct);
  if (!tryLock(lock, 30_000)) return;
  const now = nowSec(env);
  const prev = readUsage(acct);
  const keep = (lockFor: number, error: string): void =>
    writeJson(usagePath(acct), { v: 1, at: prev?.at ?? now, extra: prev?.extra ?? null, scoped: prev?.scoped ?? [], lockUntil: now + lockFor, error } satisfies UsageFile);
  try {
    const token = getToken(env, Date.now());
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
    writeJson(usagePath(acct), { v: 1, at: nowSec(env), extra, scoped, lockUntil: 0 } satisfies UsageFile);
  } finally {
    unlock(lock);
  }
}
