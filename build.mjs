// Bundles src/main.ts into one readable ESM file, dist/hungerbar.mjs.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/hungerbar.mjs',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  minify: false,
  legalComments: 'none',
  banner: { js: '#!/usr/bin/env node' },
  define: { __HUNGERBAR_VERSION__: JSON.stringify(pkg.version) },
  logLevel: 'warning',
});
