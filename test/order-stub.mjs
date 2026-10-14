// Preloaded with --import by hud.e2e.test.ts: records, in order, every write to stdout (fd 1) and every rename (the last
// step of an atomic cache write), and prints the list on stderr as `ORDER [...]` when the process exits. The patched
// functions are pushed to the ESM named exports too, which is how the bundle imports them.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const events = [];
const { writeSync, renameSync } = fs;
fs.writeSync = function (fd, ...rest) {
  if (fd === 1) events.push('stdout');
  return writeSync.call(fs, fd, ...rest);
};
fs.renameSync = function (from, to) {
  const r = renameSync.call(fs, from, to);
  events.push('rename ' + String(to).replace(/\\/g, '/'));
  return r;
};
syncBuiltinESMExports();
process.on('exit', () => {
  writeSync(2, 'ORDER ' + JSON.stringify(events) + '\n');
});
