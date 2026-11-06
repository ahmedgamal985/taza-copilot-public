// The full video (under 2 minutes): part 1 = the platform (full.html), part 2 = Taza inside inDrive (../stage.html,
// fast mode), then the outro. Scene times come from the voice-over lengths, so picture and voice stay in step.
//   node video/full/build.mjs preview 10,30,60   -> out/p-*.png (global seconds)
//   node video/full/build.mjs                    -> out/taza-copilot-full.mp4
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(process.env.MGTOOLS || 'C:/Users/ahmed.gamal_indriver/mgtools', 'package.json'));
const puppeteer = require('puppeteer');
const FF = require('ffmpeg-static');
const out = join(here, 'out'); mkdirSync(out, { recursive: true });
const vo = JSON.parse(readFileSync(join(here, 'vo', 'lines.json'), 'utf8'));
const data = JSON.parse(readFileSync(join(here, '..', 'data.json'), 'utf8'));
const FPS = 30, LEAD = .3, PAD = .5;

// ---------- timeline ----------
const scenes = [], voAt = [];
let t = 0;
for (const id of ['hook', 'title', 'answer', 'differ', 'live', 'schools', 'accuracy', 'admin', 'voice', 'channels', 'trust']) {
  const extra = id === 'hook' ? .9 : 0;
  voAt.push([id, t + LEAD]);
  const end = t + LEAD + vo[id].dur + PAD + extra;
  scenes.push({ id, start: +t.toFixed(3), end: +end.toFixed(3) }); t = end;
}
const P1 = t;
// part 2, local times inside stage.html
const L = {}; let u = 0;
const span = (id, hold = 0) => { const s = u; u += LEAD + vo[id].dur + PAD + hold; voAt.push([id, P1 + s + LEAD]); return [s, u]; };
const [b0, b1] = span('part2', .4);
const [d0, d1] = span('driver');
const [r0, r1] = span('rider');
const [a0, a1] = span('api', .6);
const split = (a, b, f) => [a, a + (b - a) * f];
L.brand = [b0, b1]; L.drvPush = split(d0, d1, .45); L.jam = [L.drvPush[1], d1];
L.pickup = split(r0, r1, .55); L.brk = [L.pickup[1], r1]; L.today = [L.pickup[1], L.pickup[1]];
L.api = [a0, a1]; L.intro = [-20, -19]; L.rdPush = [800, 801]; L.ask = [902, 903]; L.outro = [904, 905];
const P2 = u;
const O = P1 + P2;
voAt.push(['outro', O + .6]);
const TOTAL = O + .6 + vo.outro.dur + 2.2;
scenes.push({ id: 'outro', start: +O.toFixed(3), end: +TOTAL.toFixed(3) });
console.log(`part 1 ${P1.toFixed(1)} s · part 2 ${P2.toFixed(1)} s · outro ${(TOTAL - O).toFixed(1)} s · total ${TOTAL.toFixed(1)} s`);
if (TOTAL > 120) throw new Error('over two minutes');

// ---------- pages ----------
const AUDIO_ONLY = process.argv[2] === 'audio'; // remix the sound only, keep the rendered picture
const silent = join(out, 'full-silent.mp4');
if (!AUDIO_ONLY) {
const browser = await puppeteer.launch({ headless: true, protocolTimeout: 180000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--allow-file-access-from-files', '--force-color-profile=srgb'] });
const open = async file => {
  const p = await browser.newPage();
  p.on('pageerror', e => console.log('pageerror:', file, e.message));
  await p.setViewport({ width: 1920, height: 1080 });
  await p.goto(pathToFileURL(file).href);
  return p;
};
const A = await open(join(here, 'full.html'));
await A.evaluate((tl, d) => init(tl, d), { scenes }, { sensors: data.stations.length });
const B = await open(join(here, '..', 'stage.html'));
await B.evaluate((d, o) => init(d, o), data, { timeline: L, total: P2, speed: .5, numbers: false, phoneOutAtApi: true });
for (const p of [A, B]) await p.evaluate(async () => { await document.fonts.ready; await Promise.race([Promise.all([...document.images].filter(i => i.src).map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; }))), new Promise(r => setTimeout(r, 8000))]); });
console.log("pages ready");

let front = null;
async function frame(i, type = 'jpeg') {
  const g = i / FPS;
  const usePart2 = g >= P1 && g < O;
  const page = usePart2 ? B : A;
  // A background tab is not painted: the page being filmed must be the front one
  if (front !== page) { await page.bringToFront(); front = page; }
  await page.evaluate(f => renderFrame(f), usePart2 ? Math.round((g - P1) * FPS) : i);
  return page.screenshot(type === 'png' ? { type: 'png' } : { type: 'jpeg', quality: 93 });
}

if (process.argv[2] === 'preview') {
  const times = (process.argv[3] || '6,12,20,28,36,45,52,58,66,72,78,84,90,96,104').split(',').map(Number);
  for (const s of times) { const t1 = Date.now(); writeFileSync(join(out, `p-${String(s).padStart(5, "0")}.png`), await frame(Math.round(s * FPS), "png")); console.log("frame", s, Date.now() - t1, "ms"); }
  console.log('preview', times.length); await browser.close(); process.exit(0);
}

// ---------- picture ----------
const frames = Math.ceil(TOTAL * FPS);
const ff = spawn(FF, ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
const t0 = Date.now();
for (let i = 0; i < frames; i++) {
  const buf = await frame(i);
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  if (i % 300 === 0) console.log('frame', i, '/', frames, Math.round((Date.now() - t0) / 1000) + 's');
}
ff.stdin.end(); await new Promise(r => ff.on('close', r));
await browser.close();
}

// ---------- sound: voice, a music bed that ducks under it, and effects ----------
const sfx = join(here, '..', 'out', 'sfx'); // made by ../audio.mjs
const run = args => execFileSync(FF, ['-v', 'error', '-y', ...args], { maxBuffer: 1 << 26 });
const SR = 48000, B4 = .6, BAR = B4 * 4;
const ch = (a, b2, c, d) => `if(eq(floor(mod(t,${BAR * 4})/${BAR}),0),${a},if(eq(floor(mod(t,${BAR * 4})/${BAR}),1),${b2},if(eq(floor(mod(t,${BAR * 4})/${BAR}),2),${c},${d})))`;
const r = ch(220, 174.61, 261.63, 196), th = ch(261.63, 220, 329.63, 246.94), fi = ch(329.63, 261.63, 392, 293.66);
const env = `min(1,mod(t,${BAR})/0.25)*min(1,(${BAR}-mod(t,${BAR}))/0.25)`;
const m = `mod(t,${B4})`;
const bedExpr = `(sin(2*PI*${r}*t)+sin(2*PI*${th}*t)+sin(2*PI*${fi}*t)+0.5*sin(2*PI*${r}*2*t))*${env}*0.07+sin(2*PI*(48+90*exp(-28*${m}))*${m})*exp(-9*${m})*0.4+(random(0)*2-1)*exp(-70*mod(t+${B4 / 2},${B4}))*0.08+sin(2*PI*(${r}/2)*t)*exp(-3.5*${m})*0.2`;
const bed = join(out, 'bed.wav');
run(['-f', 'lavfi', '-i', `aevalsrc='${bedExpr}':s=${SR}:d=${TOTAL.toFixed(2)}`, '-af', `lowpass=f=7000,afade=t=in:d=2,afade=t=out:st=${(TOTAL - 3).toFixed(2)}:d=3`, '-ac', '2', bed]);

const at = id => scenes.find(s => s.id === id);
const cues = [];
for (const s of scenes) if (s.id !== 'hook') cues.push([s.start, 'whoosh']);
cues.push([at('hook').start + 4.0, 'boom'], [at('title').start + .2, 'logo'], [P1, 'whoosh'], [P1 + .2, 'logo'],
  [P1 + L.drvPush[0] + .7, 'chime'], [P1 + L.jam[0] + 1.8, 'alert'], [P1 + L.brk[0] + 2.3, 'pop'], [P1 + L.pickup[0] + .9, 'pop'],
  [at('channels').start + .5, 'chime'], [at('channels').start + 3.2, 'pop'], [O - 1.2, 'riser2'], [O + 1.4, 'bell']);
for (const s of scenes.filter(s => !['hook', 'title', 'outro'].includes(s.id))) cues.push([s.start + .65, 'tick']);
const VOL = { whoosh: .35, boom: .6, logo: .45, chime: .5, alert: .45, pop: .3, tick: .25, riser2: .35, bell: .55 };

const inputs = ['-i', bed], parts = [], voLabels = [], fxLabels = [];
let k = 1;
for (const [id, s] of voAt) {
  inputs.push('-i', join(here, 'vo', `${id}.mp3`)); const ms = Math.round(s * 1000);
  parts.push(`[${k}]aresample=${SR},aformat=channel_layouts=stereo,adelay=${ms}|${ms}[v${k}]`); voLabels.push(`[v${k}]`); k++;
}
for (const [s, name] of cues) {
  inputs.push('-i', join(sfx, `${name}.wav`)); const ms = Math.max(0, Math.round(s * 1000));
  parts.push(`[${k}]volume=${VOL[name] ?? .3},adelay=${ms}|${ms}[f${k}]`); fxLabels.push(`[f${k}]`); k++;
}
const graph = parts.join(';') +
  `;${voLabels.join('')}amix=inputs=${voLabels.length}:normalize=0:duration=longest,volume=1.6,apad=whole_dur=${TOTAL.toFixed(2)},asplit=2[vo][key]` +
  `;[0]volume=0.8[b];[b][key]sidechaincompress=threshold=0.02:ratio=12:attack=15:release=400[bd]` +
  `;${fxLabels.join('')}amix=inputs=${fxLabels.length}:normalize=0:duration=longest[fx]` +
  `;[bd][vo][fx]amix=inputs=3:normalize=0:duration=first,atrim=0:${TOTAL.toFixed(2)},alimiter=limit=0.9,loudnorm=I=-15:TP=-1.5:LRA=11[a]`;
const audio = join(out, 'full-audio.m4a');
run([...inputs, '-filter_complex', graph, '-map', '[a]', '-c:a', 'aac', '-b:a', '192k', '-ar', String(SR), audio]);
const final = join(out, 'taza-copilot-full.mp4');
run(['-i', silent, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', final]);
writeFileSync(join(out, 'timeline.json'), JSON.stringify({ total: TOTAL, P1, P2, scenes, part2: L, voAt }, null, 1));
console.log('done', final, TOTAL.toFixed(1) + ' s');
