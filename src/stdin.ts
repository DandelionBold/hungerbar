// stdin: a blocking read capped at 256 KiB, with a stream fallback for non-blocking pipes (SPEC §4.2).
import { readSync } from 'node:fs';

export const STDIN_CAP = 256 * 1024;

type SyncResult = { kind: 'done'; text: string | null } | { kind: 'again'; partial: Buffer };

function readAllSync(): SyncResult {
  const chunks: Buffer[] = [];
  let total = 0;
  const buf = Buffer.alloc(65536);
  for (;;) {
    let n: number;
    try {
      n = readSync(0, buf, 0, buf.length, null);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'EOF') break;
      if (code === 'EAGAIN') return { kind: 'again', partial: Buffer.concat(chunks) };
      return { kind: 'done', text: null };
    }
    if (n === 0) break;
    chunks.push(Buffer.from(buf.subarray(0, n)));
    total += n;
    if (total > STDIN_CAP) return { kind: 'done', text: null };
  }
  return { kind: 'done', text: Buffer.concat(chunks).toString('utf8') };
}

/** Resolves on EOF or on the first complete JSON document, whichever comes first; 250 ms idle timeout. */
function readStream(partial: Buffer): Promise<string | null> {
  return new Promise((resolve) => {
    let text = partial.toString('utf8');
    let idle: NodeJS.Timeout | undefined;
    const done = (v: string | null): void => {
      if (idle) clearTimeout(idle);
      process.stdin.removeAllListeners();
      process.stdin.pause();
      resolve(v);
    };
    const arm = (): void => {
      if (idle) clearTimeout(idle);
      idle = setTimeout(() => done(text || null), 250);
    };
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d: string) => {
      text += d;
      if (text.length > STDIN_CAP) return done(null);
      try {
        JSON.parse(text);
        return done(text);
      } catch {
        arm();
      }
    });
    process.stdin.on('end', () => done(text));
    process.stdin.on('error', () => done(text || null));
    arm();
  });
}

export async function readStdin(): Promise<string | null> {
  const r = readAllSync();
  return r.kind === 'done' ? r.text : readStream(r.partial);
}
