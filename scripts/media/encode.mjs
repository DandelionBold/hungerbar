// PNG frames to a GIF with ffmpeg: one palette for the whole GIF (palettegen), no dithering (the terminal's colours are
// flat), only the changed rectangle of each frame re-encoded, each frame shown for its own time, looping forever.
// FFMPEG overrides the path (else ffmpeg on PATH).
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function encodeGif(files, durations, out) {
  const ffmpeg = process.env.FFMPEG || 'ffmpeg';
  const list = join(dirname(files[0]), 'frames.txt');
  const q = (f) => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`;
  // the concat demuxer ignores the last file's duration unless the file is listed once more (that copy shows for a
  // moment more, unchanged)
  writeFileSync(list, files.map((f, i) => `${q(f)}\nduration ${durations[i].toFixed(3)}`).join('\n') + `\n${q(files[files.length - 1])}\n`);
  const r = spawnSync(ffmpeg, [
    '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list,
    '-filter_complex', '[0:v]split[a][b];[a]palettegen=max_colors=256:stats_mode=full:reserve_transparent=0[p];[b][p]paletteuse=dither=none:diff_mode=rectangle',
    '-fps_mode', 'vfr', '-loop', '0', out,
  ], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.error ?? ''}${r.stderr}`);
}
