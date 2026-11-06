// The story video ("One day in Almaty"): timeline from the voice lengths, picture from story.html, then the sound
// (narration, the WhatsApp call, ElevenLabs effects and music ducked under the voice).
//   node video/story/build.mjs preview 5,30,60   -> out/p-*.png
//   node video/story/build.mjs                   -> out/taza-story.mp4
//   node video/story/build.mjs audio             -> remix the sound only
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(process.env.MGTOOLS || 'C:/Users/ahmed.gamal_indriver/mgtools', 'package.json'));
const FF = require('ffmpeg-static');
const out = join(here, 'out'); mkdirSync(out, { recursive: true });
const vo = JSON.parse(readFileSync(join(here, 'vo', 'lines.json'), 'utf8'));
const call = JSON.parse(readFileSync(join(here, 'call.json'), 'utf8')).lines;
const FPS = 30, TEMPO = 1.1;
const isCall = id => id.startsWith('c_');
const dur = id => isCall(id) ? vo[id].dur : vo[id].dur / TEMPO;

// ---------- timeline ----------
// [scene, [[line, pause after], …], pause before the scene's first line]
const PLAN = [
  ['hook', [['hook1', .9], ['hook2', .5], ['hook3', 1.1]], 1.8],
  ['problem', [['problem', .6]], .5],
  ['meet', [['meet', 2.1]], .4],
  ['dana', [['dana1', .4], ['dana2', .4], ['dana3', .4], ['voice', 1.0]], .6],
  ['arman', [['arman1', .4], ['arman2', .5], ['arman3', .7]], .6],
  ['aliya', [['aliya1', 3.4], ['aliya2', 4.0], ['c_en_q', .45], ['c_en_a', .55], ['c_ru_q', .45], ['c_ru_a', .55], ['c_kk_q', .45], ['c_kk_a', .9], ['aliya3', .6]], .6],
  ['tg', [['tg', .9]], .6],
  ['admin', [['admin', .7]], .7],
  ['dash', [['dash', .8]], .6],
  ['cost', [['cost', .7]], .6],
  ['metric', [['metric', 1.0]], .6],
  ['close', [['close', 1.0]], .5],
  ['thanks', [['thanks', 3.6]], .8],
];
const TLvo = {}, TLsc = {};
let t = 0;
for (const [sc, lines, pre] of PLAN) {
  const s = t; t += pre;
  for (const [id, post] of lines) { TLvo[id] = { s: +t.toFixed(3), d: +dur(id).toFixed(3) }; t += dur(id) + post; }
  TLsc[sc] = { s: +s.toFixed(3), e: +t.toFixed(3) };
}
const TOTAL = +t.toFixed(3);
const V = id => TLvo[id], E = id => V(id).s + V(id).d;
const cue = {
  push: V('arman1').s + V('arman1').d * .72,
  jam: V('arman2').s + V('arman2').d * .42,
  wSent: V('aliya1').s + V('aliya1').d * .86,
};
cue.wReply = cue.wSent + 2.6;
cue.ring = E('aliya2') + .1;
cue.pick = V('c_en_q').s - .45;
cue.hang = E('c_kk_a') + .55;
const TL = { total: TOTAL, vo: TLvo, sc: TLsc, cue, call: call.map(c => ({ id: c.id, who: c.who, lang: c.lang, say: c.say, sub: c.sub })) };
console.log(Object.entries(TLsc).map(([k, v]) => `${k.padEnd(8)} ${v.s.toFixed(1)}–${v.e.toFixed(1)}`).join('\n'));
console.log(`total ${TOTAL.toFixed(1)} s (${Math.floor(TOTAL / 60)}:${String(Math.round(TOTAL % 60)).padStart(2, '0')})`);
if (TOTAL > 240) throw new Error('over four minutes');
writeFileSync(join(out, 'timeline.json'), JSON.stringify(TL, null, 1));

// ---------- picture ----------
const mode = process.argv[2];
const silent = join(out, 'story-silent.mp4');
if (mode !== 'audio') {
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ headless: true, protocolTimeout: 300000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--allow-file-access-from-files', '--force-color-profile=srgb', '--mute-audio'] });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('pageerror:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); });
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto(pathToFileURL(join(here, 'story.html')).href);
  await page.evaluate(tl => init(tl), TL);
  // every screenshot is loaded once before filming
  await page.evaluate(async names => { await Promise.all(names.map(n => new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = `shots/${n}.png`; }))); await document.fonts.ready; },
    ['answer', 'quote', 'compare_city', 'compare_dist', 'check', 'brief', 'map', 'schools', 'outdoor', 'widget', 'admin_form', 'admin_done', 'admin_lib', 'admin_src', 'dash_top', 'dash_eval', 'ai', 'voice']);
  const frame = async (i, type = 'jpeg') => { await page.evaluate(f => renderFrame(f), i); return page.screenshot(type === 'png' ? { type: 'png' } : { type: 'jpeg', quality: 92 }); };
  if (mode === 'preview') {
    const times = (process.argv[3] || '3,8,14,22,30,40').split(',').map(Number);
    // warm-up: the montage images are added to the page the first time they are needed
    for (const s of times) await frame(Math.round(s * FPS));
    for (const s of times) writeFileSync(join(out, `p-${String(s).padStart(6, '0')}.png`), await frame(Math.round(s * FPS), 'png'));
    console.log('preview', times.join(', ')); await browser.close(); process.exit(0);
  }
  if (mode === 'check') {
    // Every quarter second: no two visible blocks overlap, nothing leaves the frame, no text overflows its box
    const bad = new Map();
    for (let s = 0; s < TOTAL; s += .25) {
      const found = await page.evaluate(f => {
        renderFrame(f);
        const vis = el => { let o = 1; for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return 0; o *= +cs.opacity; } return o; };
        const SEL = '.card, .tick, .head, .title, .phone, .browser, .badge, .tagc, .reen, .sub, #langRow, #ringTxt > div, #callEnd > div, #pTitle, #pOne, #docs, #logo, #cast .who, #hookWrap, #almaty, .src, #mWrap > *, #cWrap > div, #qrs > div, #tryNow, #aimira, #team, .chips, .code, .ctr > div';
        const els = [...document.querySelectorAll(SEL)].filter(e => vis(e) > .15);
        const name = e => e.id ? '#' + e.id : (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : e.tagName) + (e.textContent || '').trim().slice(0, 24).replace(/\s+/g, ' ');
        const ok = (a, b) => a.contains(b) || b.contains(a) || (a.id === 'pOne' && b.id === 'docs') || (b.id === 'pOne' && a.id === 'docs');
        const out = [];
        const R = els.map(e => e.getBoundingClientRect());
        for (let i = 0; i < els.length; i++) {
          const r = R[i];
          if (r.left < -1 || r.top < -1 || r.right > 1921 || r.bottom > 1081) out.push(`off-frame ${name(els[i])} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
          if (els[i].scrollWidth > els[i].clientWidth + 2 && !els[i].classList.contains('phone') && !els[i].classList.contains('browser')) out.push(`text overflows ${name(els[i])}`);
          for (let j = i + 1; j < els.length; j++) {
            if (ok(els[i], els[j])) continue;
            const q = R[j]; const w = Math.min(r.right, q.right) - Math.max(r.left, q.left), h = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
            if (w > 2 && h > 2) out.push(`overlap ${name(els[i])} × ${name(els[j])}`);
          }
        }
        return out;
      }, Math.round(s * FPS));
      for (const x of found) { if (!bad.has(x)) bad.set(x, []); bad.get(x).push(s.toFixed(2)); }
    }
    for (const [x, ts] of bad) console.log(`${x}  @ ${ts[0]}–${ts.at(-1)} s (${ts.length}×)`);
    console.log(bad.size ? `${bad.size} problems` : 'no overlaps, nothing off-frame');
    await browser.close(); process.exit(0);
  }
  // warm-up pass over the montages so every <img> exists and is decoded
  for (let s = 0; s < TOTAL; s += .5) await page.evaluate(f => renderFrame(f), Math.round(s * FPS));
  await new Promise(r => setTimeout(r, 1500));
  const frames = Math.ceil(TOTAL * FPS);
  const ff = spawn(FF, ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    const buf = await frame(i);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 600 === 0) console.log('frame', i, '/', frames, Math.round((Date.now() - t0) / 1000) + 's');
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  await browser.close();
}

// ---------- sound ----------
const run = args => execFileSync(FF, ['-v', 'error', '-y', ...args], { maxBuffer: 1 << 26 });
const SR = 48000;
const S = id => TLsc[id];
const fx = [];
const add = (at, name, vol) => fx.push([at, name, vol]);
add(0, 'smog', .55); add(.3, 'heartbeat', .95); add(6.3, 'heartbeat', .75);
add(V('hook1').s - .1, 'braam', .9);
add(S('meet').s - 2.2, 'riser', .45); add(V('meet').s - .2, 'logo', .7);
for (const sc of ['problem', 'arman', 'aliya', 'tg', 'dana', 'admin', 'dash', 'cost']) add(S(sc).s + .1, 'whoosh', .35);
add(cue.push, 'notif', .75);
add(cue.jam - 1.6, 'traffic', .5); add(cue.jam + .1, 'window', .8);
add(V('arman3').s + V('arman3').d * .45, 'notif', .5);
add(cue.wSent - 1.9, 'typing', .55); add(cue.wSent, 'sent', .55); add(cue.wReply, 'notif', .65);
add(cue.ring, 'ring', .6); add(cue.pick, 'pickup', .6); add(cue.hang, 'hangup', .6);
{ const g = V('tg'); [g.s + .2, g.s + g.d * .28, g.s + g.d * .52].forEach(a => add(a, 'notif', .45)); [g.s + g.d * .2, g.s + g.d * .42].forEach(a => add(a, 'sent', .45)); }
add(V('dana2').s + .9, 'stamp', .6);
{ const a = S('admin'); add(a.s + (a.e - a.s) / 4, 'upload', .6); }
{ const d = V('dash'); [.3, .62, .8, .9].forEach((k, j) => add(d.s + d.d * k + (j ? 0 : .9), j ? 'tick' : 'stamp', j ? .5 : .55)); }
{ const c = V('cost'); for (let k = 0; k < 5; k++) add(c.s + .3 + k * .45, 'tick', .4); add(c.s + c.d * .5, 'stamp', .5); }
add(V('metric').s - .1, 'braam', .45);
add(S('thanks').s + .1, 'logo', .6);

const inputs = [], parts = [], voL = [], fxL = [];
let k = 0;
// music: fades in, sits low, out at the end
inputs.push('-i', join(here, 'sfx', 'music.mp3'));
parts.push(`[0]atrim=0:${TOTAL},asetpts=N/SR/TB,aresample=${SR},volume=0.42,afade=t=in:d=3,afade=t=out:st=${(TOTAL - 4).toFixed(2)}:d=4[mus]`); k++;
for (const id of Object.keys(TLvo)) {
  inputs.push('-i', join(here, 'vo', `${id}.mp3`)); const ms = Math.round(V(id).s * 1000);
  const c = call.find(x => x.id === id);
  const f = !c ? `atempo=${TEMPO},volume=1.15` : c.who === 'taza' ? 'highpass=f=260,lowpass=f=3800,volume=1.05' : 'volume=1.0';
  parts.push(`[${k}]aresample=${SR},aformat=channel_layouts=stereo,${f},adelay=${ms}|${ms}[v${k}]`); voL.push(`[v${k}]`); k++;
}
for (const [at, name, vol] of fx) {
  inputs.push('-i', join(here, 'sfx', `${name}.mp3`)); const ms = Math.max(0, Math.round(at * 1000));
  parts.push(`[${k}]aresample=${SR},aformat=channel_layouts=stereo,volume=${vol},adelay=${ms}|${ms}[f${k}]`); fxL.push(`[f${k}]`); k++;
}
const graph = parts.join(';') +
  `;${voL.join('')}amix=inputs=${voL.length}:normalize=0:duration=longest,apad=whole_dur=${TOTAL},asplit=2[vo][key]` +
  `;[mus][key]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=500[bed]` +
  `;${fxL.join('')}amix=inputs=${fxL.length}:normalize=0:duration=longest[fx]` +
  `;[bed][vo][fx]amix=inputs=3:normalize=0:duration=first,atrim=0:${TOTAL},alimiter=limit=0.92,loudnorm=I=-14:TP=-1.5:LRA=11[a]`;
const audio = join(out, 'story-audio.m4a');
run([...inputs, '-filter_complex', graph, '-map', '[a]', '-c:a', 'aac', '-b:a', '192k', '-ar', String(SR), audio]);
const final = join(out, 'taza-story.mp4');
run(['-i', silent, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', final]);
console.log('done', final);
