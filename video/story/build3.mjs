// The 3:28 cut of the story video (exactly 208 s): timeline from the voice lengths, picture from story.html, then the sound
// (narration, the WhatsApp call, ElevenLabs effects and music ducked under the voice).
//   node video/story/build3.mjs preview 5,30,60  -> out/p-*.png
//   node video/story/build3.mjs                  -> out/taza-story-328.mp4
//   node video/story/build3.mjs audio            -> remix the sound only
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(process.env.MGTOOLS || 'C:/Users/ahmed.gamal_indriver/mgtools', 'package.json'));
const FF = require('ffmpeg-static');
const out = join(here, 'out'); mkdirSync(out, { recursive: true });
const vo = JSON.parse(readFileSync(join(here, 'vo', 'lines3.json'), 'utf8'));
const call = JSON.parse(readFileSync(join(here, 'call3.json'), 'utf8')).lines;
const FPS = 30, TEMPO = 1.1;
const isCall = id => id.startsWith('c_');
const dur = id => isCall(id) ? vo[id].dur : vo[id].dur / TEMPO;

// ---------- timeline ----------
// [scene, [[line, pause after], …], pause before the scene's first line]
const LENGTH = 208; // 3:28, exactly
const PLAN = [
  ['hook', [['x_hook1', .4], ['x_hook2', 1.3]], 1.2],
  ['intro', [['x_intro', 1.6]], .4],
  ['dana', [['x_dana1', .4], ['x_dana2', 1.4]], .5],
  ['aliya', [['x_aliya1', 'chat'], ['x_aliya2', 4.0], ['c_en_q', .4], ['c3_en_a', .5], ['c_ru_q', .4], ['c3_ru_a', .5], ['c_kk_q', .4], ['c_kk_a', 1.8]], .5],
  ['tg', [['x_tg1', 2.4], ['x_tg2', 3.6], ['x_tg3', 3.6]], .5],
  ['arman', [['x_arman1', .6], ['x_arman2', .8], ['x_arman3', 1.6]], .5],
  ['admin', [['x_admin1', .5], ['x_admin2', .8]], .5],
  ['proof', [['x_proof', 1.4]], .5],
  ['metric', [['metric', 1.0]], .5],
  ['thanks', [['thanks', 0]], .6],
];
const CHAT = 18; // the WhatsApp chat: the narration line, then the three exchanges, before "she just calls"
const TLvo = {}, TLsc = {};
let t = 0;
for (const [sc, lines, pre] of PLAN) {
  const s = t; t += pre;
  for (const [id, post] of lines) { TLvo[id] = { s: +t.toFixed(3), d: +dur(id).toFixed(3) }; t += post === 'chat' ? CHAT : dur(id) + post; }
  TLsc[sc] = { s: +s.toFixed(3), e: +t.toFixed(3) };
}
// the closing card holds until the video is exactly LENGTH seconds
const hold = LENGTH - t;
if (hold < 2.5) throw new Error(`too long by ${(2.5 - hold).toFixed(2)} s`);
TLsc.thanks.e = LENGTH; t = LENGTH;
// one voice line, two pictures: the reports, then Taza and the three people
{ const i = TLsc.intro, cut = TLvo.x_intro.s + TLvo.x_intro.d * .52; TLsc.problem = { s: i.s, e: +cut.toFixed(3) }; TLsc.meet = { s: +cut.toFixed(3), e: i.e }; delete TLsc.intro; }
const TOTAL = LENGTH;
const V = id => TLvo[id], E = id => V(id).s + V(id).d;
const a1 = V('x_aliya1').s;
const cue = {
  chat: { q1: a1 + 1.0, a1: a1 + 3.6, q2: a1 + 6.4, a2: a1 + 8.6, q3: a1 + 11.2, a3: a1 + 13.8 },
  push: V('x_arman1').s + V('x_arman1').d * .5,
  jam: V('x_arman2').s + .2,
  ring: E('x_aliya2') + .1,
  pick: V('c_en_q').s - .45,
  hang: E('c_kk_a') + .55,
};
{ const T1 = V('x_tg1'), T2 = V('x_tg2'), T3 = V('x_tg3'), inl = T3.s + T3.d * .6;
  cue.tg = { card: T1.s + T1.d * .55, voice: T2.s, vrep: T2.s + 1.3, fwd: T2.s + T2.d * .45, chk: T2.s + T2.d * .45 + 1.4,
    loc: T3.s - .1, near: T3.s + .7, saved: T3.s + T3.d * .2, alerts: T3.s + T3.d * .4, kb: T3.s + T3.d * .5,
    inline: inl, inres: inl + .9, sent: inl + 2.0, lang: E('x_tg3') + 1.0 }; }
const { LINES } = await import('./lines3.mjs');
const caps = [];
for (const [id, , , raw] of LINES) {
  if (!TLvo[id] || id === 'thanks') continue;
  const text = raw.replace(/\[[a-z ]+\]\s*/gi, '').replace(/\s*\.\.\.\s*/g, '… ').replace(/\s+/g, ' ').trim()
    // numbers read better as digits on screen
    .replace('Fourteen thousand', '14,000').replace('twenty-one hundred', '2,100').replace('a hundred and fifty', '150')
    .replace('forty-four out of forty-four', '44 out of 44').replace('about five hours', 'about 5 hours').replace('five-point', '5-point')
    .replace('seven times', '7 times').replace('page five', 'page 5').replace('about seven dollars a month', 'about $7 a month')
    .replace('Nine p.m.', '9 p.m.').replace('A-A-I', 'AAI').replace('in three languages', 'in 3 languages');
  // short pieces (at most ~52 characters), cut after punctuation where possible
  const words = text.split(' '), parts = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (next.length > 52 && cur) { parts.push(cur); cur = w; } else cur = next;
    if (/[.?!:;…]$/.test(w) && cur.length > 24) { parts.push(cur); cur = ''; }
  }
  if (cur) parts.push(cur);
  // a piece never ends on a small word or a number ("about 5 | hours"): it moves to the next piece
  for (let k = 0; k < parts.length - 1; k++) {
    let ws = parts[k].split(' ');
    while (ws.length > 3 && /^(a|an|the|of|in|to|at|about|and|or|are|is|with|for|by|\$?\d[\d,.]*)$/i.test(ws.at(-1))) parts[k + 1] = ws.pop() + ' ' + parts[k + 1];
    parts[k] = ws.join(' ');
  }
  const total = parts.reduce((a, p) => a + p.length, 0), { s, d } = TLvo[id];
  let at = s;
  for (const p of parts) { const len = d * p.length / total; caps.push({ s: +at.toFixed(3), e: +(at + len).toFixed(3), text: p }); at += len; }
}
const TL = { total: TOTAL, vo: TLvo, sc: TLsc, cue, caps, call: call.map(c => ({ id: c.id, who: c.who, lang: c.lang, say: c.show || c.say, sub: c.sub })) };
console.log(Object.entries(TLsc).map(([k, v]) => `${k.padEnd(8)} ${v.s.toFixed(1)}–${v.e.toFixed(1)}`).join('\n'));
console.log(`total ${TOTAL} s (3:28), closing hold ${hold.toFixed(1)} s`);
writeFileSync(join(out, 'timeline3.json'), JSON.stringify(TL, null, 1));

// ---------- picture ----------
const mode = process.argv[2];
const silent = join(out, 'story3c-silent.mp4');
if (mode !== 'audio') {
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ headless: true, protocolTimeout: 300000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--allow-file-access-from-files', '--force-color-profile=srgb', '--mute-audio'] });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('pageerror:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); });
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto(pathToFileURL(join(here, 'story3.html')).href);
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
        const SEL = '#cap, .card, .tick, .head, .title, .wcap, .phone, .browser, .badge, .tagc, .reen, .sub, #langRow, #ringTxt > div, #callEnd > div, #pTitle, #pOne, #docs, #logo, #cast .who, #hookWrap, #almaty, .src, #mWrap > *, #cWrap > div, #qrs > div, #tryNow, #aimira, #team, .chips, .code, .ctr > div';
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
add(V('x_hook1').s - .1, 'braam', .9);
add(S('meet').s - 2.0, 'riser', .45); add(S('meet').s, 'logo', .7);
for (const sc of ['dana', 'aliya', 'tg', 'arman', 'admin', 'proof']) add(S(sc).s + .1, 'whoosh', .35);
add(V('x_dana2').s + .7, 'stamp', .6);
for (const k of [1, 2, 3]) { const q = cue.chat['q' + k], a = cue.chat['a' + k]; add(q - 1.2, 'typing', .5); add(q, 'sent', .5); add(a, 'notif', .6); }
add(cue.ring, 'ring', .6); add(cue.pick, 'pickup', .6); add(cue.hang, 'hangup', .6);
{ const c = cue.tg; ['card', 'vrep', 'chk', 'near', 'saved', 'alerts', 'sent'].forEach(k => add(c[k], 'notif', .45)); ['voice', 'fwd', 'loc'].forEach(k => add(c[k], 'sent', .45)); add(c.inline, 'typing', .45); }
add(cue.push, 'notif', .75);
add(cue.jam - 1.6, 'traffic', .5); add(cue.jam + .1, 'window', .8);
add(V('x_arman3').s + V('x_arman3').d * .45, 'notif', .5);
{ const a = S('admin'), gaps = V('x_admin2').s + V('x_admin2').d * .55; add(a.s + (gaps - a.s) / 4, 'upload', .6); add(gaps, 'whoosh', .3); }
{ const d = V('x_proof'); add(d.s + d.d * .12 + .9, 'stamp', .55); [.2, .3, .62].forEach(k => add(d.s + d.d * k, 'tick', .5)); for (let k = 0; k < 7; k++) add(d.s + d.d * .38 + k * .35, 'tick', .35); }
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
const audio = join(out, 'story3c-audio.m4a');
run([...inputs, '-filter_complex', graph, '-map', '[a]', '-c:a', 'aac', '-b:a', '192k', '-ar', String(SR), audio]);
const final = join(out, 'taza-story-328-captions.mp4');
run(['-i', silent, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', final]);
console.log('done', final);
