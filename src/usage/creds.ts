// The OAuth token for the usage API. Read only; never refreshed, written or logged (SPEC §11).
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { claudeDir, type Env } from '../env.ts';
import { childProcess } from '../proc.ts';
import { readJson } from '../store.ts';

interface Creds {
  claudeAiOauth?: { accessToken?: unknown; expiresAt?: unknown };
}

function fromCreds(c: Creds | null, nowMs: number): string | null {
  const o = c?.claudeAiOauth;
  if (!o || typeof o.accessToken !== 'string' || !o.accessToken) return null;
  if (typeof o.expiresAt === 'number' && o.expiresAt <= nowMs) return null;
  return o.accessToken;
}

/** Claude Code appends the first 8 hex digits of sha256(CLAUDE_CONFIG_DIR) to the Keychain service name. */
export function keychainService(env: Env): string {
  const dir = env.CLAUDE_CONFIG_DIR;
  return dir ? 'Claude Code-credentials-' + createHash('sha256').update(dir).digest('hex').slice(0, 8) : 'Claude Code-credentials';
}

export function getToken(env: Env, nowMs: number): string | null {
  const direct = env.CLAUDE_CODE_OAUTH_TOKEN?.trim();
  if (direct) return direct;
  const file = fromCreds(readJson<Creds>(join(claudeDir(env), '.credentials.json')), nowMs);
  if (file) return file;
  if (process.platform === 'darwin') {
    const r = childProcess().spawnSync('/usr/bin/security', ['find-generic-password', '-s', keychainService(env), '-w'], {
      encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (r.status === 0 && typeof r.stdout === 'string') {
      try {
        return fromCreds(JSON.parse(r.stdout) as Creds, nowMs);
      } catch {
        return null;
      }
    }
  }
  return null;
}
