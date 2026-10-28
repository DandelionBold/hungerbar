// A slow stand-in for git, used through HUNGERBAR_GIT_BIN. It starts a grandchild (to prove the timeout
// kills the whole tree), records both pids, sleeps FAKE_GIT_SLEEP_MS, then prints a shortstat.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const ms = Number(process.env.FAKE_GIT_SLEEP_MS ?? 3000);
const child = spawn(process.execPath, ['-e', `setTimeout(() => {}, ${ms + 5000})`], { stdio: 'ignore', windowsHide: true });
if (process.env.FAKE_GIT_PIDFILE) writeFileSync(process.env.FAKE_GIT_PIDFILE, JSON.stringify({ self: process.pid, child: child.pid }));
setTimeout(() => {
  process.stdout.write(' 3 files changed, 10 insertions(+), 2 deletions(-)\n');
  child.kill();
  process.exit(0);
}, ms);
