// The race video: the five real Tengrinews questions answered live (recorded in real time by capture.mjs),
// the facts matched against AAI's own answer, the platform in four quick scenes, Taza inside inDrive
// (../stage.html), what AAI needs, and the outro. Two cuts from the same scenes:
//   node video/race/build.mjs full|short            -> out/taza-race-<cut>.mp4 (captions burned in)
//   node video/race/build.mjs preview full 10,40,90 -> out/p-<cut>-<s>.png
//   node video/race/build.mjs audio full            -> remix the sound only, keep the rendered picture
// Scene times come from the voice-over lengths (vo/lines.json) and from the race recording (out/race.json).
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
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
const raceLog = JSON.parse(readFileSync(join(out, 'race.json'), 'utf8'));
const FRAMES = readdirSync(join(out, 'frames')).filter(f => f.endsWith('.jpg')).length;
const RACE = { total: +(FRAMES / 30).toFixed(3), frames: FRAMES,
  questions: raceLog.questions.map(q => ({ submit: q.submit, done: q.done, sources: q.answer.sources.length })) };
const FPS = 30, LEAD = .3, PAD = .5;
const [, , MODE = 'full', ARG2, ARG3] = process.argv;
const CUT = ['preview', 'audio'].includes(MODE) ? (ARG2 || 'full') : MODE;
if (!['full', 'short'].includes(CUT)) throw new Error('cut must be full or short');

// ---------- timeline ----------
const scenes = [], voAt = [], cues = [];
let t = 0;
const say = (id, at) => { if (!vo[id]) throw new Error(`no voice-over clip ${id}`); voAt.push([id, +at.toFixed(3)]); return at + vo[id].dur; };
const scene = (id, start, end, extra = {}) => { scenes.push({ id, start: +start.toFixed(3), end: +end.toFixed(3), ...extra }); t = end; cues.push([start, 'whoosh']); };
let P2 = 0, L = {}, partStart = 0;
function indrive(spans, total) { partStart = t; L = spans; P2 = total; scenes.push({ id: 'indrive', start: +t.toFixed(3), end: +(t + total).toFixed(3) }); cues.push([t, 'whoosh'], [t + .2, 'logo']); t += total; }
const off = { intro: [-20, -19], rdPush: [800, 801], ask: [902, 903], outro: [904, 905] };

if (CUT === 'full') {
  { const s = t; const e1 = say('hook', s + LEAD); const costAt = e1 + .35; const e2 = say('cost', costAt); scene('hook', s, e2 + PAD + .6, { costAt }); cues.push([costAt + .1, 'boom']); }
  { const s = t; const e = say('now', s + LEAD); scene('now', s, e + PAD + .5); cues.push([s + .2, 'logo']); }
  { const s = t, speed = 1, dur = RACE.total / speed;
    say('race', s + RACE.questions[0].submit + .9);
    scene('race', s, s + dur, { speed });
    for (const q of RACE.questions) cues.push([s + q.submit / speed, 'tick'], [s + q.done / speed, 'pop']);
    cues.push([s + RACE.questions.at(-1).done / speed + .05, 'chime']); }
  { const s = t; const e1 = say('punch', s + .4); const matchAt = e1 + .5; const e2 = say('match', matchAt + .2); scene('punch', s, e2 + PAD + 1.6, { matchAt }); cues.push([s + .2, 'boom'], [matchAt + 3.25, 'bell']); }
  { const s = t; const e = say('metric', s + LEAD); scene('metric', s, e + PAD + .5); for (let k = 0; k < 4; k++) cues.push([s + .4 + k * .5, 'tick']); }
  for (const id of ['trust', 'live', 'everywhere', 'decisions']) { const s = t; const e = say(id, s + LEAD); scene(id, s, e + PAD + (id === 'decisions' ? 1.0 : .3)); cues.push([s + .65, 'tick']); }
  { // inDrive, local times inside stage.html
    let u = 0; const sp = {}; const span = (id, hold = 0) => { const a = u; u += LEAD + vo[id].dur + PAD + hold; voAt.push([id, +(t + a + LEAD).toFixed(3)]); return [a, u]; };
    const split = (a, b, f) => [a, a + (b - a) * f];
    const [b0, b1] = span('part2', .4), [d0, d1] = span('driver', .3), [r0, r1] = span('rider', .3), [a0, a1] = span('api', .8);
    sp.brand = [b0, b1]; sp.drvPush = split(d0, d1, .42); sp.jam = [sp.drvPush[1], d1];
    sp.pickup = split(r0, r1, .55); sp.brk = [sp.pickup[1], r1]; sp.today = [sp.pickup[1], sp.pickup[1]]; sp.api = [a0, a1];
    const base = t; indrive({ ...sp, ...off }, u);
    cues.push([base + sp.drvPush[0] + .7, 'chime'], [base + sp.jam[0] + 1.8, 'alert'], [base + sp.pickup[0] + .9, 'pop'], [base + sp.brk[0] + 2.3, 'pop']);
  }
  { const s = t; const e = say('aai', s + LEAD); scene('aai', s, e + PAD + .8); for (let k = 0; k < 3; k++) cues.push([s + .3 + k * .5, 'tick']); }
  { const s = t; cues.push([s - 1.1, 'riser2']); const e = say('outro', s + .7); scene('outro', s, e + 3.2); cues.push([s + .2, 'bell']); }
} else {
  { const s = t; const e = say('s_hook', s + LEAD); scene('hook', s, e + PAD, { costAt: s + LEAD + 3.6 }); cues.push([s + LEAD + 3.7, 'boom']); }
  { const s = t, speed = 2.5, dur = RACE.total / speed;
    say('s_race', s + .5);
    scene('race', s, s + dur, { speed });
    for (const q of RACE.questions) cues.push([s + q.done / speed, 'pop']);
    cues.push([s + RACE.questions.at(-1).done / speed + .05, 'chime']); }
  { const s = t; const matchAt = s + 1.4; const e = say('s_match', matchAt + .3); scene('punch', s, Math.max(e + PAD, matchAt + 5.2), { matchAt }); cues.push([s + .2, 'boom'], [matchAt + 3.25, 'bell']); }
  { const s = t; const e = say('s_more', s + LEAD); scene('montage', s, e + PAD + .3); for (let k = 0; k < 4; k++) cues.push([s + .15 + k * .45, 'tick']); }
  { const base = t; voAt.push(['s_indrive', +(base + .5).toFixed(3)]);
    const sp = { brand: [0, 1.3], drvPush: [1.3, 3.5], jam: [700, 701], brk: [702, 703], pickup: [3.5, 5.6], today: [5.6, 5.6], api: [5.6, 7.6] };
    indrive({ ...sp, ...off }, 7.6); cues.push([base + 1.3 + .7, 'chime'], [base + 3.5 + .9, 'pop']); }
  { const s = t; cues.push([s - 1.1, 'riser2']); const e = say('outro', s + .6); scene('outro', s, e + 2.6); cues.push([s + .2, 'bell']); }
}
const TOTAL = +t.toFixed(3);
scenes.forEach(s => s.end > TOTAL && (s.end = TOTAL));
console.log(`${CUT}: ${TOTAL.toFixed(1)} s · ` + scenes.map(s => `${s.id} ${(s.end - s.start).toFixed(1)}`).join(' · '));
const tag = CUT;

// ---------- captions: the voice-over text, in chunks of one line ----------
function chunks(text, max = 66) {
  const parts = text.replace(/\s+/g, ' ').split(/(?<=[.!?:])\s+/);
  const out = [];
  for (const p of parts) {
    if (p.length <= max) { out.push(p); continue; }
    let cur = '';
    for (const w of p.split(/(?<=,)\s+|\s+/)) {
      if ((cur + ' ' + w).trim().length > max && cur) { out.push(cur.trim()); cur = w; } else cur = (cur + ' ' + w).trim();
    }
    if (cur) out.push(cur);
  }
  return out;
}
// Written by hand: figures as numbers (the voice says them as words) and breaks at natural pauses
const CAPS = {
  hook: ['On November 2, a Tengrinews journalist sent Almaty Air Initiative', 'five questions about the city\'s air.'],
  cost: ['AAI\'s experts answered by hand:', '3 pages, 23 sources, and hours of work.'],
  now: ['Now, the same five questions, asked live.'],
  race: ['Taza Copilot searches only AAI\'s published research and its live sensors,', 'and answers each question in seconds,', 'with the exact quote, the page, and a link.'],
  punch: ['All five, in 41 seconds.'],
  match: ['And the facts match AAI\'s own answer:', '31.2 µg/m³ in 2025, 30% worse than the year before.'],
  metric: ['Across 44 test questions, including 15 real questions', 'that journalists and colleagues sent to the initiative,', 'every answer came with a source, in a median of 3.3 seconds.'],
  trust: ['It checks claims from the news, shows both figures when sources disagree,', 'and says so when the research does not cover a question.'],
  live: ['Live data from more than 150 sensors: the map, the best time to go out,', 'comparisons with other cities, and schools ranked by the air right now.'],
  everywhere: ['Ask by voice, on Telegram, on WhatsApp, where you can even call Taza,', 'or from a widget on any website.'],
  decisions: ['And any answer becomes a one-page policy brief.'],
  part2: ['The same research can reach every driver and rider in inDrive.'],
  driver: ['Drivers get a morning alert on bad-air days,', 'and a reminder to close the windows in traffic.', 'In a jam, the air inside a car is 40% more polluted,', 'says AAI\'s own fleet study.'],
  rider: ['Riders see the air at their pickup point,', 'and drivers find a cleaner spot for a break.'],
  api: ['All from one API call, and the location is never stored.'],
  aai: ['For AAI, it costs about $7 a month,', 'needs no developers, and the code is open.'],
  outro: ['Taza Copilot. Ask AAI\'s research anything.'],
  s_hook: ['A journalist sent Almaty Air Initiative five questions.', 'Answering by hand took hours and 23 sources.'],
  s_race: ['Taza Copilot answered all five live, in 41 seconds,', 'each with the exact quote, the page, and a link.'],
  s_match: ['The same facts as AAI\'s own answer.'],
  s_more: ['Live sensor data, voice, Telegram, WhatsApp,', 'and a widget for any website.'],
  s_indrive: ['And inside inDrive:', 'air alerts and advice for drivers and riders.'],
};
// Lines said over the phone (inDrive) sit in the right-hand column, so they never cover the phone
const SIDE = new Set(['driver', 'rider', 's_indrive']);
const caps = [];
for (const [id, at] of voAt) {
  const c = CAPS[id] || chunks(vo[id].text), total = c.reduce((a, s) => a + s.length, 0);
  let s0 = at;
  for (const s of c) { const d = vo[id].dur * s.length / total; caps.push([s0, s0 + d, s, SIDE.has(id)]); s0 += d; }
}

// ---------- pictures ----------
const AUDIO_ONLY = MODE === 'audio';
const silent = join(out, `silent-${tag}.mp4`);
if (!AUDIO_ONLY) {
  const browser = await puppeteer.launch({ headless: true, protocolTimeout: 300000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--allow-file-access-from-files', '--force-color-profile=srgb'] });
  const open = async file => {
    const p = await browser.newPage();
    p.on('pageerror', e => console.log('pageerror:', file, e.message));
    await p.setViewport({ width: 1920, height: 1080 });
    await p.goto(pathToFileURL(file).href);
    return p;
  };
  const A = await open(join(here, 'race.html'));
  await A.evaluate((tl, r) => init(tl, r), { scenes, short: CUT === 'short', raceSpeed: CUT === 'short' ? 2.5 : 1 }, RACE);
  const B = await open(join(here, '..', 'stage.html'));
  await B.evaluate((d, o) => init(d, o), data, { timeline: L, total: P2, speed: CUT === 'short' ? .5 : .7, numbers: false, phoneOutAtApi: true });
  await B.evaluate(() => { const c = document.querySelector('#credit'); if (c) c.style.display = 'none'; }); // the captions use the bottom
  for (const p of [A, B]) await p.evaluate(async () => { await document.fonts.ready; await Promise.race([Promise.all([...document.images].filter(i => i.src).map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; }))), new Promise(r => setTimeout(r, 8000))]); });
  const ind = scenes.find(s => s.id === 'indrive');
  let front = null;
  async function frame(i, type = 'jpeg') {
    const g = i / FPS, inB = g >= ind.start && g < ind.end, page = inB ? B : A;
    if (front !== page) { await page.bringToFront(); front = page; }
    await page.evaluate(f => renderFrame(f), inB ? Math.round((g - ind.start) * FPS) : i);
    return page.screenshot(type === 'png' ? { type: 'png' } : { type: 'jpeg', quality: 92 });
  }
  if (MODE === 'preview') {
    const times = (ARG3 || '5,20,40,70,90').split(',').map(Number);
    for (const s of times) writeFileSync(join(out, `p-${tag}-${String(s).padStart(5, '0')}.png`), await frame(Math.round(s * FPS), 'png'));
    console.log('preview', times.join(', ')); await browser.close(); process.exit(0);
  }
  const frames = Math.ceil(TOTAL * FPS);
  const ff = spawn(FF, ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    const buf = await frame(i);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 600 === 0) console.log('frame', i, '/', frames, Math.round((Date.now() - t0) / 1000) + 's');
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  await browser.close();
}

// ---------- sound: voice, a music bed that ducks under it, and effects ----------
const sfx = join(here, '..', 'out', 'sfx');
const run = (args, opts = {}) => execFileSync(FF, ['-v', 'error', '-y', ...args], { maxBuffer: 1 << 26, ...opts });
const SR = 48000, B4 = .6, BAR = B4 * 4;
const ch = (a, b2, c, d) => `if(eq(floor(mod(t,${BAR * 4})/${BAR}),0),${a},if(eq(floor(mod(t,${BAR * 4})/${BAR}),1),${b2},if(eq(floor(mod(t,${BAR * 4})/${BAR}),2),${c},${d})))`;
const r = ch(220, 174.61, 261.63, 196), th = ch(261.63, 220, 329.63, 246.94), fi = ch(329.63, 261.63, 392, 293.66);
const env = `min(1,mod(t,${BAR})/0.25)*min(1,(${BAR}-mod(t,${BAR}))/0.25)`;
const m = `mod(t,${B4})`;
const bedExpr = `(sin(2*PI*${r}*t)+sin(2*PI*${th}*t)+sin(2*PI*${fi}*t)+0.5*sin(2*PI*${r}*2*t))*${env}*0.07+sin(2*PI*(48+90*exp(-28*${m}))*${m})*exp(-9*${m})*0.4+(random(0)*2-1)*exp(-70*mod(t+${B4 / 2},${B4}))*0.08+sin(2*PI*(${r}/2)*t)*exp(-3.5*${m})*0.2`;
const bed = join(out, `bed-${tag}.wav`);
run(['-f', 'lavfi', '-i', `aevalsrc='${bedExpr}':s=${SR}:d=${TOTAL.toFixed(2)}`, '-af', `lowpass=f=7000,afade=t=in:d=2,afade=t=out:st=${(TOTAL - 3).toFixed(2)}:d=3`, '-ac', '2', bed]);
const VOL = { whoosh: .32, boom: .55, logo: .45, chime: .5, alert: .45, pop: .3, tick: .22, riser2: .35, bell: .5 };
const inputs = ['-i', bed], parts = [], voLabels = [], fxLabels = [];
let k = 1;
for (const [id, s] of voAt) {
  inputs.push('-i', join(here, 'vo', `${id}.mp3`)); const ms = Math.round(s * 1000);
  parts.push(`[${k}]aresample=${SR},aformat=channel_layouts=stereo,adelay=${ms}|${ms}[v${k}]`); voLabels.push(`[v${k}]`); k++;
}
for (const [s, name] of cues.filter(([s]) => s >= 0 && s < TOTAL)) {
  if (!existsSync(join(sfx, `${name}.wav`))) throw new Error(`missing sound ${name}`);
  inputs.push('-i', join(sfx, `${name}.wav`)); const ms = Math.round(s * 1000);
  parts.push(`[${k}]volume=${VOL[name] ?? .3},adelay=${ms}|${ms}[f${k}]`); fxLabels.push(`[f${k}]`); k++;
}
const graph = parts.join(';') +
  `;${voLabels.join('')}amix=inputs=${voLabels.length}:normalize=0:duration=longest,volume=1.6,apad=whole_dur=${TOTAL.toFixed(2)},asplit=2[vo][key]` +
  `;[0]volume=0.8[b];[b][key]sidechaincompress=threshold=0.02:ratio=12:attack=15:release=400[bd]` +
  `;${fxLabels.join('')}amix=inputs=${fxLabels.length}:normalize=0:duration=longest[fx]` +
  `;[bd][vo][fx]amix=inputs=3:normalize=0:duration=first,atrim=0:${TOTAL.toFixed(2)},alimiter=limit=0.9,loudnorm=I=-15:TP=-1.5:LRA=11[a]`;
const audio = join(out, `audio-${tag}.m4a`);
writeFileSync(join(out, `audio-${tag}.graph`), graph);
run([...inputs, '-filter_complex_script', join(out, `audio-${tag}.graph`), '-map', '[a]', '-c:a', 'aac', '-b:a', '192k', '-ar', String(SR), audio]);

// ---------- captions burned in, then picture + sound ----------
const capDir = join(out, `caps-${tag}`); rmSync(capDir, { recursive: true, force: true }); mkdirSync(capDir);
const font = existsSync('C:/Windows/Fonts/seguisb.ttf') ? 'C:/Windows/Fonts/seguisb.ttf' : 'C:/Windows/Fonts/arialbd.ttf';
copyFileSync(font, join(out, 'capfont.ttf'));
const draws = caps.map(([a, b, text, side], i) => {
  const f = `caps-${tag}/c${String(i).padStart(3, '0')}.txt`; writeFileSync(join(out, f), text);
  const pos = side ? 'fontsize=34:x=1440-text_w/2:y=h-150' : 'fontsize=38:x=(w-text_w)/2:y=h-118';
  return `drawtext=fontfile=capfont.ttf:textfile=${f}:expansion=none:${pos}:fontcolor=white:box=1:boxcolor=black@0.62:boxborderw=16:enable='between(t,${a.toFixed(2)},${b.toFixed(2)})'`;
});
writeFileSync(join(out, `caps-${tag}.filter`), `[0:v]${draws.join(',')}[v]`);
const final = join(out, `taza-race-${tag}.mp4`);
run(['-i', `silent-${tag}.mp4`, '-i', `audio-${tag}.m4a`, '-filter_complex_script', `caps-${tag}.filter`, '-map', '[v]', '-map', '1:a',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', `taza-race-${tag}.mp4`], { cwd: out });
writeFileSync(join(out, `timeline-${tag}.json`), JSON.stringify({ total: TOTAL, scenes, voAt, cues, caps, indrive: L }, null, 1));
console.log('done', final, TOTAL.toFixed(1) + ' s');
