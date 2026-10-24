// Who runs Claude Code, for the HUD's folder field (SPEC §0.9, 0.7.0): the user name and the host name (hud.user), and
// whether Claude Code runs elevated (hud.op). Each is asked only when the HUD draws it, and none starts a process.
//   - The user: os.userInfo().username, else USERNAME, USER or LOGNAME (userInfo throws for a uid with no passwd entry).
//   - The host: os.hostname() up to its first '.', as a shell prompt's \h shows it ('build-01.corp.example' is build-01).
//   - Elevated: on Windows, whether this process may open %SystemRoot%\System32\config\systemprofile, the LocalSystem
//     account's profile, whose ACL grants only SYSTEM and Administrators. A non-elevated token (an administrator's under
//     UAC included: its Administrators group is deny-only) gets EPERM; an elevated one opens it. On POSIX, root (euid 0).
//     The status line runs as Claude Code's child, so it has the same token. One open and close, about 0.2 ms.
// Both names are cleaned like any user text (the engine's tidy: no escapes or controls, trimmed) and capped: the user at
// 32 code points (POSIX's longest), a host label at 63 (DNS's longest), with '…' where the rest was.
// Test hooks, as HUNGERBAR_NOW: HUNGERBAR_USER and HUNGERBAR_HOST replace the names, HUNGERBAR_ELEVATED=1|0 the check.
import { opendirSync } from 'node:fs';
import { hostname, userInfo } from 'node:os';
import { join } from 'node:path';
import type { Env } from './env.ts';
import { tidy } from './hud/text.ts';

export const USER_CAP = 32, HOST_CAP = 63;

/** Who runs Claude Code, as the HUD's sources hand it: each part read when asked. */
export interface WhoSource {
  user(): string;
  host(): string;
  elevated(): boolean;
}

/** The user name, cleaned and capped; '' when none can be found. */
export function userName(env: Env): string {
  let u = env.HUNGERBAR_USER;
  if (u === undefined) {
    try {
      u = userInfo().username;
    } catch {
      u = env.USERNAME || env.USER || env.LOGNAME || '';
    }
  }
  return tidy(u, true, USER_CAP);
}

/** The host name up to its first '.', cleaned and capped; '' when none can be found. */
export function hostName(env: Env): string {
  let h = env.HUNGERBAR_HOST;
  if (h === undefined) {
    try {
      h = hostname();
    } catch {
      h = env.COMPUTERNAME || env.HOSTNAME || '';
    }
  }
  return tidy(h.split('.')[0]!, true, HOST_CAP);
}

/** Whether this process runs elevated: Administrator on Windows, root elsewhere (see the header). */
export function elevated(env: Env, platform: NodeJS.Platform = process.platform): boolean {
  const v = env.HUNGERBAR_ELEVATED;
  if (v === '1' || v === '0') return v === '1';
  if (platform !== 'win32') return typeof process.geteuid === 'function' && process.geteuid() === 0;
  try {
    const d = opendirSync(join(env.SystemRoot || env.windir || 'C:\\Windows', 'System32', 'config', 'systemprofile'));
    d.closeSync();
    return true;
  } catch {
    return false;
  }
}

/** The disk sources' WhoSource: each part computed on first ask, then kept for the render. */
export function whoAmI(env: Env): WhoSource {
  let u: string | undefined, h: string | undefined, e: boolean | undefined;
  return {
    user: () => (u ??= userName(env)),
    host: () => (h ??= hostName(env)),
    elevated: () => (e ??= elevated(env)),
  };
}
