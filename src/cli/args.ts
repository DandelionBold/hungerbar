// Tiny argv parser: --flag, --key value, --key=value.

export interface Args {
  flags: Set<string>;
  values: Map<string, string>;
  rest: string[];
}

export function parseArgs(argv: string[], valued: string[]): Args {
  const flags = new Set<string>(), values = new Map<string, string>(), rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) {
      rest.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    const key = a.slice(2, eq < 0 ? undefined : eq);
    if (eq >= 0) values.set(key, a.slice(eq + 1));
    // A following --flag is never taken as a value: `--icons --print` must not read "--print" as the style.
    else if (valued.includes(key) && i + 1 < argv.length && !argv[i + 1]!.startsWith('--')) values.set(key, argv[++i]!);
    else flags.add(key);
  }
  return { flags, values, rest };
}

/**
 * What is wrong with the options for a command that takes `valued` (--key value) and `bare` (--key alone): an unknown
 * option, or a value on a bare one (`--print=1`). null when every option is known. Commands that write check this
 * first, so a typo (`--pritn`) is refused before anything is read for writing.
 */
export function optionError(a: Args, valued: readonly string[], bare: readonly string[]): string | null {
  for (const k of a.values.keys()) {
    if (bare.includes(k)) return `--${k} takes no value`;
    if (!valued.includes(k)) return `unknown option --${k}`;
  }
  for (const k of a.flags) if (!valued.includes(k) && !bare.includes(k)) return `unknown option --${k}`;
  return null;
}

export const say = (s = ''): void => {
  process.stdout.write(s + '\n');
};
