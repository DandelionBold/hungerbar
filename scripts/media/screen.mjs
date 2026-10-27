// A frame of a picture: Windows Terminal with Claude Code's prompt box and the status line under it, bottom-anchored as
// Claude Code draws it (a sixth line pushes the box up one row), and an optional caption strip under the window.
// pageHTML wraps the frames in one page whose show(i) draws frame i and returns the rectangle to capture.
import { cutTo, lineHTML, parseLine, plain, TERM_CSS, width } from './term.mjs';

const RULE = '#5A5A5A';
const BLANK_LINE = lineHTML([]);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Claude Code's prompt box: a rule, `> ` with what is typed and the cursor, a rule; as wide as the window. */
export function promptBox(cols, typed = '') {
  const prompt = [...plain('> ', '#CCCCCC'), ...plain(typed, '#FFFFFF'), { g: ' ', w: 1, fg: null, bg: '#CCCCCC', bold: false, dim: false }];
  return [lineHTML(plain('─'.repeat(cols), RULE)), lineHTML(prompt), lineHTML(plain('─'.repeat(cols), RULE))];
}

/** The status line as Claude Code shows it: after its 2-cell margin, each line cut at cols - 4 with '…'. */
export function statusRows(lines, cols) {
  return lines.map((l) => {
    const cells = cutTo(parseLine(l), cols - 4);
    return lineHTML([{ g: ' ', w: 2, fg: null, bg: null, bold: false, dim: false }, ...cells]);
  });
}

/**
 * One frame's HTML: the terminal (`rows` tall, `cols` wide, content at the bottom), then the caption.
 * f: {status: string[] (ANSI lines), typed?: string, caption?: {at?: string, text: string}, cols?: number, rows?: string[]}
 */
export function frameHTML(f, o) {
  const cols = f.cols ?? o.cols;
  const body = f.rowsHTML ?? [...promptBox(cols, f.typed ?? ''), ...statusRows(f.status, cols)];
  const pad = Math.max(0, o.rows - body.length);
  // Claude Code sits at the bottom of the window; a shell (anchor top) starts at the top of a cleared one
  const shown = body.slice(-o.rows).join(''), blank = BLANK_LINE.repeat(pad);
  const term = `<div class="term" style="width:${cols}ch;padding:${o.padY}px ${o.padX}px">${o.anchor === 'top' ? shown + blank : blank + shown}</div>`;
  const cap = o.caption ? `<div class="cap">${f.caption?.at ? `<span class="at">${esc(f.caption.at)}</span>` : ''}${esc(f.caption?.text ?? '')}</div>` : '';
  return term + cap;
}

/**
 * The page: every frame's HTML, and show(i). The shot is `canvasCols` wide (the widest frame), so every frame of a GIF
 * has the same size; a narrower window leaves the canvas showing beside it.
 */
export function pageHTML(frames, o) {
  const canvasCols = o.canvasCols ?? o.cols;
  const html = frames.map((f) => frameHTML(f, o));
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:${o.canvas ?? '#0C0C0C'}}
${TERM_CSS}
#shot{display:block;width:calc(${canvasCols}ch + ${2 * o.padX}px);font-family:"Cascadia Mono";font-size:${o.font}px;background:${o.canvas ?? '#0C0C0C'}}

.cap{box-sizing:border-box;width:100%;background:#1B1B1B;color:#D6D6D6;font:${o.capFont ?? 14}px/1.3 "Segoe UI",sans-serif;padding:7px ${o.padX}px 8px;white-space:nowrap;overflow:hidden;border-top:1px solid #2A2A2A}
.cap .at{font-family:"Cascadia Mono";color:#FFAA00;margin-right:12px}
${o.css ?? ''}
</style></head><body><div id="shot"></div><script>
const FRAMES = ${JSON.stringify(html)};
async function show(i) {
  const shot = document.getElementById('shot');
  shot.innerHTML = FRAMES[i];
  await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const b = shot.getBoundingClientRect();
  return { x: b.x, y: b.y, width: Math.ceil(b.width), height: Math.ceil(b.height) };
}
</script></body></html>`;
}

export { width };
