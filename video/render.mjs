// Renders video/stage.html to MP4, frame by frame (30 fps), with Puppeteer and ffmpeg from ~/mgtools.
//   node video/render.mjs preview 12,24,40   -> video/out/shot-*.png at those seconds
//   node video/render.mjs video               -> video/out/frames.mp4 (silent) + video/out/cues.json
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const TOOLS = process.env.MGTOOLS || 'C:/Users/ahmed.gamal_indriver/mgtools';
const require = createRequire(join(TOOLS, 'package.json'));
const puppeteer = require('puppeteer');
const FFMPEG = require('ffmpeg-static');
const out = join(here, 'out');
mkdirSync(out, { recursive: true });

const mode = process.argv[2] || 'preview';
const data = JSON.parse(readFileSync(join(here, 'data.json'), 'utf8'));
const browser = await puppeteer.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--allow-file-access-from-files', '--force-color-profile=srgb'] });
const page = await browser.newPage();
page.on('pageerror', e => console.log('pageerror:', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); });
await page.setViewport({ width: 1920, height: 1080 });
await page.goto(pathToFileURL(join(here, 'stage.html')).href);
await page.evaluate(d => init(d), data);
await page.evaluate(() => document.fonts.ready);
const { total, cues } = await page.evaluate(() => ({ total: window.TOTAL, cues: window.CUES }));
writeFileSync(join(out, 'cues.json'), JSON.stringify({ total, cues }));

if (mode === 'preview') {
  const times = (process.argv[3] || '3,8,14,25,36,45,53,61,72,80,88').split(',').map(Number);
  for (const t of times) {
    await page.evaluate(i => renderFrame(i), Math.round(t * 30));
    await page.screenshot({ path: join(out, `shot-${String(t).padStart(4, '0')}.png`) });
  }
  console.log('shots', times.length);
} else {
  const frames = Math.ceil(total * 30);
  const ff = spawn(FFMPEG, ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', join(out, 'frames.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    await page.evaluate(f => renderFrame(f), i);
    const buf = await page.screenshot({ type: 'jpeg', quality: 93 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 300 === 0) console.log('frame', i, '/', frames, Math.round((Date.now() - t0) / 1000) + 's');
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  console.log('done', frames, 'frames in', Math.round((Date.now() - t0) / 1000) + 's');
}
await browser.close();
