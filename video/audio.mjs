// Sound for the concept video, made entirely with ffmpeg (synthesized: no cost, no licences):
// a soft music bed (beat, bass, chords), wind under the smoggy intro, and effects at the cues
// stage.html exports (whooshes, notification chimes, a traffic-jam alert, pops, typing ticks, a closing bell).
//   node video/audio.mjs   -> video/out/audio.m4a, then muxes video/out/frames.mp4 into ../public/video/taza-indrive.mp4
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(process.env.MGTOOLS || 'C:/Users/ahmed.gamal_indriver/mgtools', 'package.json'));
const FF = require('ffmpeg-static');
const out = join(here, 'out'), sfx = join(out, 'sfx');
mkdirSync(sfx, { recursive: true });
const { total, cues } = JSON.parse(readFileSync(join(out, 'cues.json'), 'utf8'));
const ff = args => execFileSync(FF, ['-v', 'error', '-y', ...args], { maxBuffer: 1 << 26 });
const SR = 48000;
const gen = (name, expr, d, extra = '') => ff(['-f', 'lavfi', '-i', `aevalsrc='${expr}':s=${SR}:d=${d}`, ...(extra ? ['-af', extra] : []), '-ac', '2', join(sfx, name + '.wav')]);

// ---------- effects ----------
gen('boom', 'sin(2*PI*(42+70*exp(-5*t))*t)*exp(-2.2*t)*0.9', 1.8, 'lowpass=f=400');
gen('riser', '(random(0)*2-1)*pow(t/2,2)*0.35+sin(2*PI*(180+260*t*t/4)*t)*pow(t/2,2)*0.25', 2, 'highpass=f=300,afade=t=out:st=1.85:d=0.15');
gen('riser2', '(random(0)*2-1)*pow(t/1.2,2)*0.3', 1.2, 'highpass=f=800,lowpass=f=9000');
gen('whoosh', '(random(0)*2-1)*sin(PI*t/0.75)*0.6', 0.75, 'bandpass=f=1400:width_type=o:w=2.2,volume=1.6');
gen('logo', '((sin(2*PI*523.25*t)+sin(2*PI*659.25*t)+sin(2*PI*783.99*t))/3+0.3*sin(2*PI*1046.5*t)*exp(-4*t))*exp(-2.6*t)*0.55', 1.8);
gen('chime', 'if(lt(t,0.13),sin(2*PI*1318.5*t)*exp(-9*t),sin(2*PI*1760*t)*exp(-5*(t-0.13)))*0.5', 1.0);
gen('alert', 'if(lt(mod(t,0.2),0.11),sin(2*PI*740*t)+0.4*sin(2*PI*1480*t),0)*0.35*exp(-1.5*t)', 0.62);
gen('pop', 'sin(2*PI*(1100-700*t*6)*t)*exp(-28*t)*0.55', 0.17);
gen('tick', '(random(0)*2-1)*exp(-160*t)*0.35+sin(2*PI*3200*t)*exp(-200*t)*0.15', 0.04);
gen('bell', '(sin(2*PI*880*t)+0.55*sin(2*PI*1318.5*t)+0.3*sin(2*PI*2637*t))*exp(-1.4*t)*0.4', 3);

// ---------- music bed: 100 bpm, Am - F - C - G, soft kick, offbeat hats, bass, pad ----------
const B = 0.6, BAR = B * 4;
const ch = (a, b2, c, d) => `if(eq(floor(mod(t,${BAR * 4})/${BAR}),0),${a},if(eq(floor(mod(t,${BAR * 4})/${BAR}),1),${b2},if(eq(floor(mod(t,${BAR * 4})/${BAR}),2),${c},${d})))`;
const r = ch(220, 174.61, 261.63, 196), th = ch(261.63, 220, 329.63, 246.94), fi = ch(329.63, 261.63, 392, 293.66);
const env = `min(1,mod(t,${BAR})/0.25)*min(1,(${BAR}-mod(t,${BAR}))/0.25)`;
const pad = `(sin(2*PI*${r}*t)+sin(2*PI*${th}*t)+sin(2*PI*${fi}*t)+0.5*sin(2*PI*${r}*2*t))*${env}*0.07`;
const m = `mod(t,${B})`, kick = `sin(2*PI*(48+90*exp(-28*${m}))*${m})*exp(-9*${m})*0.45`;
const hat = `(random(0)*2-1)*exp(-70*mod(t+${B / 2},${B}))*0.10`;
const bass = `sin(2*PI*(${r}/2)*t)*exp(-3.5*${m})*0.22`;
const start = 5.6, fadeOut = total - 4;
ff(['-f', 'lavfi', '-i', `aevalsrc='(${pad})+(${kick})+(${hat})+(${bass})':s=${SR}:d=${(total - start).toFixed(2)}`,
  '-af', `lowpass=f=7000,afade=t=in:d=1.2,afade=t=out:st=${(fadeOut - start).toFixed(2)}:d=4,adelay=${Math.round(start * 1000)}|${Math.round(start * 1000)},apad=whole_dur=${total}`,
  '-ac', '2', join(sfx, 'bed.wav')]);
// wind under the smoggy intro
ff(['-f', 'lavfi', '-i', `anoisesrc=color=brown:d=7:a=0.5:r=${SR}`, '-af', 'lowpass=f=600,afade=t=in:d=1.5,afade=t=out:st=5:d=2,volume=0.5', '-ac', '2', join(sfx, 'wind.wav')]);

// ---------- mix ----------
const VOL = { whoosh: .55, chime: .9, alert: .8, pop: .6, tick: .5, boom: 1, riser: .6, riser2: .5, logo: .8, bell: .8 };
const inputs = ['-i', join(sfx, 'bed.wav'), '-i', join(sfx, 'wind.wav')];
const parts = ['[0]volume=0.9[bed]', '[1]volume=0.9[wind]'];
const labels = ['[bed]', '[wind]'];
cues.forEach(([t, s], i) => {
  inputs.push('-i', join(sfx, s + '.wav'));
  const ms = Math.max(0, Math.round(t * 1000));
  parts.push(`[${i + 2}]volume=${VOL[s] ?? .6},adelay=${ms}|${ms}[c${i}]`);
  labels.push(`[c${i}]`);
});
const graph = parts.join(';') + `;${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=longest,atrim=0:${total},alimiter=limit=0.9,loudnorm=I=-16:TP=-1.5:LRA=11[a]`;
ff([...inputs, '-filter_complex', graph, '-map', '[a]', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', join(out, 'audio.m4a')]);
console.log('audio ok', cues.length, 'cues,', total, 's');

// ---------- final video ----------
const frames = join(out, 'frames.mp4');
if (existsSync(frames)) {
  const pub = join(here, '..', 'public', 'video');
  mkdirSync(pub, { recursive: true });
  ff(['-i', frames, '-i', join(out, 'audio.m4a'), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', join(pub, 'taza-indrive.mp4')]);
  ff(['-ss', '25', '-i', frames, '-frames:v', '1', '-q:v', '4', '-vf', 'scale=1280:-2', join(pub, 'taza-indrive.jpg')]);
  console.log('video ok', join(pub, 'taza-indrive.mp4'));
}
