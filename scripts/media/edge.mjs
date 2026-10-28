// Headless Microsoft Edge over the DevTools protocol on a pipe (no port, no window): load a page of frames, then show
// each frame and take its screenshot at 2x. EDGE overrides the browser's path.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const EDGE = process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

export async function openEdge(work) {
  const profile = join(work, 'edge-profile');
  rmSync(profile, { recursive: true, force: true });
  const proc = spawn(EDGE, [
    '--headless=new', '--remote-debugging-pipe', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-default-apps',
    '--disable-features=msEdgeSidebarV2,EdgeCollections,Translate', '--mute-audio', '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'], windowsHide: true });
  const toEdge = proc.stdio[3], fromEdge = proc.stdio[4];
  const pending = new Map();
  let id = 0, buf = Buffer.alloc(0);
  fromEdge.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    for (let i; (i = buf.indexOf(0)) >= 0; buf = buf.subarray(i + 1)) {
      const msg = JSON.parse(buf.subarray(0, i).toString('utf8'));
      const p = msg.id !== undefined && pending.get(msg.id);
      if (!p) continue;
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
      else p.resolve(msg.result);
    }
  });
  const exited = new Promise((r) => proc.once('exit', r));
  proc.once('exit', () => { for (const p of pending.values()) p.reject(new Error('Edge exited')); });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject, method });
    toEdge.write(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
  });
  /** A fresh tab for each page, so nothing of the last page (its script's globals) is left. */
  const tab = async () => {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const page = (method, params) => send(method, params, sessionId);
    const evaluate = async (expression) => {
      const r = await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`page: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
      return r.result.value;
    };
    return { page, evaluate, close: () => send('Target.closeTarget', { targetId }) };
  };

  return {
    /**
     * Loads `html` (a page that defines `async show(i)`, which draws frame i and returns the rectangle to capture) at
     * the given viewport, then captures each index into `dir/0001.png`, ...; returns the files.
     */
    async capture(html, count, dir, { width = 1600, height = 900, scale = 2 } = {}) {
      mkdirSync(dir, { recursive: true });
      const { page, evaluate, close } = await tab();
      await page('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
      await page('Emulation.setDefaultBackgroundColorOverride', { color: { r: 12, g: 12, b: 12, a: 1 } });
      const { frameTree } = await page('Page.getFrameTree');
      await page('Page.setDocumentContent', { frameId: frameTree.frame.id, html });
      await evaluate('document.fonts.ready.then(() => true)');
      const files = [];
      for (let i = 0; i < count; i++) {
        const r = await evaluate(`show(${i})`);
        const shot = await page('Page.captureScreenshot', { format: 'png', clip: { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 }, captureBeyondViewport: true });
        const file = join(dir, String(i + 1).padStart(4, '0') + '.png');
        writeFileSync(file, Buffer.from(shot.data, 'base64'));
        files.push(file);
      }
      await close();
      return files;
    },
    async close() {
      try { await Promise.race([send('Browser.close'), exited]); } catch { /* already gone */ }
      if (proc.exitCode === null) proc.kill();
      await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
      try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Edge may hold a file a moment longer */ }
    },
  };
}
