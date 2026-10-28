// Numbers and times, integer maths only where it matters (SPEC §7.1, §7.2, §0.1).

export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Limit %: floored, so 99.9 shows 99 and 100 only shows at exactly 100. */
export function limitPct(x: number): number {
  return clamp(Math.floor(x + 1e-9), 0, 100);
}

/** Context %: Claude Code's integer, or a rounded fallback. */
export function ctxPct(x: number): number {
  return clamp(Math.round(x), 0, 100);
}

/** Cache hit: round half up of ratio × 100. */
export function hitPct(ratio: number): number {
  return clamp(Math.floor(ratio * 100 + 0.5 + 1e-9), 0, 100);
}

/** Used tokens: 812, 280k, 1M, 1.3M. */
export function tokens(n: number): string {
  const v = Math.max(0, Math.round(n));
  if (v < 1000) return String(v);
  if (v < 999500) return Math.round(v / 1000) + 'k';
  return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
}

/** Window size: 200k, 1.0M (the Classic Plus look keeps one decimal for M). */
export function tokensMax(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1000) return Math.round(n / 1000) + 'k';
  return String(Math.round(n));
}

const SIGNS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' };

function withCurrency(amount: string, currency: string): string {
  const sign = SIGNS[currency.toUpperCase()];
  return sign !== undefined ? sign + amount : currency.toUpperCase() + ' ' + amount;
}

/** The used amount: always 2 decimals. */
export function moneyUsed(amount: number, currency: string): string {
  return withCurrency(amount.toFixed(2), currency);
}

/** The limit: 2 decimals with ".00" dropped. */
export function moneyLimit(amount: number, currency: string): string {
  return withCurrency(amount.toFixed(2).replace(/\.00$/, ''), currency);
}

/** Limit time left: 3d 23h, 4h 49m, 38m, <1m; null once it has passed. */
export function timeLeft(sec: number): string | null {
  const t = Math.floor(sec);
  if (t <= 0) return null;
  if (t < 60) return '<1m';
  const d = Math.floor(t / 86400), h = Math.floor((t % 86400) / 3600), m = Math.floor((t % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Cache countdown: 42s, 4m12s (5m TTL or under 2 min), else 47m. */
export function countdown(sec: number, ttl: string | null): string {
  const r = Math.max(0, Math.floor(sec));
  if (r < 60) return `${r}s`;
  const m = Math.floor(r / 60), s = r % 60;
  if (ttl === '5m' || r < 120) return `${m}m${String(s).padStart(2, '0')}s`;
  return `${m}m`;
}
