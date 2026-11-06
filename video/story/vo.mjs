// Voice for the story video: one clip per line (lines.mjs + the call in call.json). Only changed lines are made again.
//   node --env-file=../../../.env video/story/vo.mjs   -> vo/<id>.mp3 and vo/lines.json (with durations)
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const SET = process.env.VO_SET || '';
const { LINES } = await import(`./lines${SET}.mjs`);

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(process.env.MGTOOLS || 'C:/Users/ahmed.gamal_indriver/mgtools', 'package.json'));
const FFPROBE = require('ffprobe-static').path;
const dir = join(here, 'vo'); mkdirSync(dir, { recursive: true });
const MODEL = 'eleven_v3';
const call = existsSync(join(here, `call${SET}.json`)) ? JSON.parse(readFileSync(join(here, `call${SET}.json`), 'utf8')).lines : [];
const all = [...LINES, ...call.map(c => [c.id, c.voice, c.lang, c.say])];
const metaFile = join(dir, `lines${SET}.json`);
const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : {};
const out = []; let made = 0;
for (const [id, voice, lang, text] of all) {
  const file = join(dir, `${id}.mp3`), h = createHash('sha256').update(`${voice}|${MODEL}|${lang}|${text}`).digest('hex').slice(0, 10);
  if (!existsSync(file) || meta[id]?.hash !== h) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: MODEL, language_code: lang, voice_settings: { stability: 0.5, similarity_boost: 0.8 } }),
    });
    if (!res.ok) throw new Error(`${id}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer())); made++;
  }
  const dur = +execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim();
  out.push({ id, text, hash: h, dur: +dur.toFixed(3) });
}
writeFileSync(metaFile, JSON.stringify(Object.fromEntries(out.map(o => [o.id, o])), null, 1));
console.log(out.map(o => `${o.id.padEnd(9)} ${o.dur.toFixed(1)}s`).join('\n'));
console.log(`made ${made}, speech total ${out.reduce((a, o) => a + o.dur, 0).toFixed(1)} s`);
