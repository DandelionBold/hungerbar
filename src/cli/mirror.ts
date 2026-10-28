// `hungerbar mirror <dir>`: a self-contained copy of the source, the build and the tarballs (SPEC §13, §14.9). It runs
// from a source checkout only: an installed release has no src/.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { readJson } from '../store.ts';
import { say } from './args.ts';

const ITEMS = [
  'src', 'test', 'bench', 'dist', 'docs', 'scripts', '.github', 'package.json', 'package-lock.json', 'tsconfig.json', 'build.mjs', 'schema.json',
  'README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'LICENSE', 'SPEC.md', '.gitignore', '.gitattributes',
];
const SKIP = new Set(['node_modules', '.git', '.tmp', 'results']);
// Inside a folder that git tracks, a live .gitignore would hide dist/ and the tarball,
// the two files an offline restore needs most; it is stored without the dot (rename it back to restore).
const RENAME: Record<string, string> = { '.gitignore': 'gitignore' };

export function mirror(argv: string[], self: string): number {
  const dest = argv[0];
  if (!dest) {
    process.stderr.write('usage: hungerbar mirror <dir>\n');
    return 1;
  }
  const repo = resolve(dirname(self), '..');
  const pkg = readJson<{ name?: string; version?: string }>(join(repo, 'package.json'));
  if (pkg?.name !== 'hungerbar' || !existsSync(join(repo, 'src'))) {
    process.stderr.write(`hungerbar: mirror runs from the source checkout (node dist/hungerbar.mjs mirror <dir>); ${repo} has no src/\n`);
    return 1;
  }
  const to = resolve(dest);
  mkdirSync(to, { recursive: true });
  const tgz = readdirSync(repo).filter((f) => /^hungerbar-.*\.tgz$/.test(f));
  const managed = new Set([...ITEMS, ...Object.values(RENAME)]);
  // the items are replaced; a tarball already there is kept (one of the same name is overwritten), so the earlier
  // releases stay in the copy for a rollback when the checkout no longer has them
  for (const old of readdirSync(to)) if (managed.has(old)) rmSync(join(to, old), { recursive: true, force: true });
  let files = 0;
  for (const item of [...ITEMS, ...tgz]) {
    const from = join(repo, item);
    if (!existsSync(from)) continue;
    cpSync(from, join(to, RENAME[item] ?? item), {
      recursive: true,
      filter: (src) => {
        if (SKIP.has(basename(src))) return false;
        if (statSync(src).isFile()) files++;
        return true;
      },
    });
  }
  say(`mirrored hungerbar ${pkg.version ?? ''} (${files} files${tgz.length ? ', ' + tgz.join(', ') : ''}) → ${to}`);
  return 0;
}
