// A JSONC reader that records where every value sits, so one value can be changed in place and every other byte
// (comments, trailing commas, indentation, line endings) stays as the user wrote it.

export interface Located {
  /** Dotted path, with [i] for array items: profiles.list[2].font.face */
  path: string;
  kind: 'object' | 'array' | 'string' | 'other';
  /** Offsets of the value's first and one-past-last character. */
  start: number;
  end: number;
  /** Decoded string, for kind 'string'. */
  value?: string;
  /** Number of members, for objects. */
  members?: number;
}

export class JsoncError extends Error {}

export function scan(text: string): Map<string, Located> {
  const out = new Map<string, Located>();
  let i = 0;
  const fail = (what: string): never => {
    throw new JsoncError(`${what} at offset ${i}`);
  };
  const ws = (): void => {
    for (;;) {
      const c = text[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '﻿') i++;
      else if (c === '/' && text[i + 1] === '/') {
        while (i < text.length && text[i] !== '\n') i++;
      } else if (c === '/' && text[i + 1] === '*') {
        const e = text.indexOf('*/', i + 2);
        if (e < 0) fail('unclosed comment');
        i = e + 2;
      } else return;
    }
  };
  const str = (): string => {
    const s = i;
    i++;
    while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    if (text[i] !== '"') fail('unclosed string');
    i++;
    return JSON.parse(text.slice(s, i)) as string;
  };
  const value = (path: string): void => {
    ws();
    const start = i, c = text[i];
    if (c === '{') {
      i++;
      let members = 0;
      const seen = new Set<string>();
      for (;;) {
        ws();
        if (text[i] === '}') { i++; break; }
        if (text[i] !== '"') fail('expected a key');
        const key = str();
        ws();
        if (text[i] !== ':') fail('expected ":"');
        i++;
        const child = path ? `${path}.${key}` : key;
        // A repeated key replaces the earlier value (Windows Terminal's JSON reader keeps the last), so forget it.
        if (seen.has(key)) for (const p of [...out.keys()]) if (p === child || p.startsWith(child + '.') || p.startsWith(child + '[')) out.delete(p);
        seen.add(key);
        value(child);
        members++;
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === '}') { i++; break; }
        fail('expected "," or "}"');
      }
      out.set(path, { path, kind: 'object', start, end: i, members });
    } else if (c === '[') {
      i++;
      let n = 0;
      for (;;) {
        ws();
        if (text[i] === ']') { i++; break; }
        value(`${path}[${n++}]`);
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === ']') { i++; break; }
        fail('expected "," or "]"');
      }
      out.set(path, { path, kind: 'array', start, end: i });
    } else if (c === '"') {
      const v = str();
      out.set(path, { path, kind: 'string', start, end: i, value: v });
    } else {
      while (i < text.length && !/[\s,}\]/]/.test(text[i]!)) i++;
      if (i === start) fail('expected a value');
      out.set(path, { path, kind: 'other', start, end: i });
    }
  };
  value('');
  ws();
  if (i < text.length) fail('unexpected text after the end');
  return out;
}

/** The indentation of the line a position sits on. */
export function indentAt(text: string, pos: number): string {
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
  return /^[ \t]*/.exec(text.slice(lineStart))?.[0] ?? '';
}
