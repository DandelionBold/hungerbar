// Makes the README's pictures in docs/media/ from the real product: every frame is what dist/hungerbar.mjs printed for
// a crafted session (see rig.mjs), drawn on Windows Terminal's grid (term.mjs) in headless Edge (edge.mjs), and the
// GIFs are encoded by ffmpeg (encode.mjs). Dev only: nothing here ships in the package.
//
//   node scripts/media/make.mjs [name ...] [--work <dir>] [--keep]
//
// names: hero fable git pr center idle frame setup classic anatomy (default: all). Needs Microsoft Edge (EDGE=<path> to point at
// it) and ffmpeg (FFMPEG=<path>, else ffmpeg on PATH), and the fonts Windows Terminal uses: Cascadia Mono, Segoe UI
// Emoji, Segoe UI Symbol and Yu Gothic UI. The work folder is a new hungerbar-media-* folder made inside --work's folder
// (default: the system temp folder), so only what this script made is ever removed; it is removed afterwards unless --keep.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir, userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import { openEdge } from './edge.mjs';
import { encodeGif } from './encode.mjs';
import { REPO_ROOT, Rig } from './rig.mjs';
import { pageHTML } from './screen.mjs';
/** Each picture: the module that builds its frames. */
const SCENES = { hero: 'hero', fable: 'looks', git: 'looks', pr: 'looks', center: 'looks', idle: 'looks', frame: 'looks', setup: 'setup', classic: 'looks', anatomy: 'anatomy' };
const OUT = join(REPO_ROOT, 'docs', 'media');
/** The frame's defaults: Cascadia Mono 16 px (WT's 12 pt at 100%), WT's padding, a caption strip, captured at 2x. */
const BASE = { font: 16, padX: 14, padY: 10, caption: true, cols: 120, rows: 10 };

const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const workArg = flag('--work');
const keep = args.includes('--keep');
const names = args.filter((a) => !a.startsWith('--'));
for (const n of names) if (!SCENES[n]) throw new Error(`unknown picture "${n}" (${Object.keys(SCENES).join(', ')})`);
const parent = workArg ? resolve(workArg) : tmpdir();
mkdirSync(parent, { recursive: true });
// a fresh folder of its own: the clean-up below and each scene's Rig delete only inside it, never the folder given
const work = mkdtempSync(join(parent, 'hungerbar-media-'));
mkdirSync(OUT, { recursive: true });

/** No picture may show this machine: its user name, its home, this checkout or the work folder. */
const norm = (s) => s.toLowerCase().replace(/\\/g, '/');
const PRIVATE = [work, REPO_ROOT, homedir(), userInfo().username].filter((s) => s && s.length >= 3).map(norm);
function guard(name, frames) {
  for (const f of frames) {
    const text = norm([...(f.status ?? []), ...(f.text ?? []), f.caption?.text ?? '', f.caption?.at ?? '', f.typed ?? ''].join('\n'));
    const hit = PRIVATE.find((s) => text.includes(s));
    if (hit) throw new Error(`${name}: a frame shows "${hit}"`);
  }
}

const b = spawnSync(process.execPath, [join(REPO_ROOT, 'build.mjs')], { cwd: REPO_ROOT, stdio: 'inherit' });
if (b.status !== 0) throw new Error('the build failed');

const edge = await openEdge(work);
try {
  for (const name of names.length ? names : Object.keys(SCENES)) {
    const rig = new Rig(join(work, name));
    const scene = await (await import(`./scenes/${SCENES[name]}.mjs`))[name](rig);
    guard(name, scene.frames);
    const o = { ...BASE, ...scene.opts };
    const page = scene.page ? scene.page(o) : pageHTML(scene.frames, o);
    const files = await edge.capture(page, scene.frames.length, join(work, name, 'frames'), { width: 2000, height: 1400 });
    const out = join(OUT, `${name}.${scene.png ? 'png' : 'gif'}`);
    if (scene.png) copyFileSync(files[0], out);
    else encodeGif(files, scene.frames.map((f) => f.hold), out);
    const secs = scene.frames.reduce((s, f) => s + (f.hold ?? 0), 0);
    console.log(`${name}: ${out} ${(statSync(out).size / 1048576).toFixed(2)} MB${scene.png ? '' : `, ${scene.frames.length} frames, ${secs.toFixed(1)} s`}`);
  }
} finally {
  await edge.close();
  if (!keep) rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  else console.log(`work folder kept: ${work}`);
}
