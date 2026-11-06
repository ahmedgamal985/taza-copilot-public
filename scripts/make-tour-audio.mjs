// Generates the guided tour's narration (public/tour/<lang>-<step>.mp3) with ElevenLabs, in the voice
// agent's voice, from public/tour/script.json. Only clips whose text changed are recorded again: each
// clip's text hash is kept in script.json ("audio"), which also busts the browser cache for that clip.
// Clips of steps that were removed are deleted.
//   node --env-file=../.env scripts/make-tour-audio.mjs [--force]
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', 'public', 'tour');
const scriptFile = join(dir, 'script.json');
const script = JSON.parse(readFileSync(scriptFile, 'utf8'));
const VOICE = 'hpp4J3VqNfWAUOO0d1Us'; // Bella, the voice agent's voice
const MODEL = 'eleven_v3';
const force = process.argv.includes('--force');
const hash = text => createHash('sha256').update(`${VOICE}|${MODEL}|${text}`).digest('hex').slice(0, 10);
const audio = script.audio || {};
const keep = new Set();
let made = 0, kept = 0, bytes = 0;

for (const lang of ['en', 'ru', 'kk']) {
  if (script[lang].length !== script.steps.length) throw new Error(`${lang}: ${script[lang].length} texts for ${script.steps.length} steps`);
  for (let i = 0; i < script.steps.length; i++) {
    const id = `${lang}-${script.steps[i]}`, file = join(dir, `${id}.mp3`), h = hash(script[lang][i]);
    keep.add(`${id}.mp3`);
    // Same text as last time (or a clip already there with no record yet): keep it
    if (existsSync(file) && !force && (audio[id] === h || !audio[id])) { audio[id] = h; kept++; continue; }
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_64`, {
      method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: script[lang][i], model_id: MODEL, language_code: lang }),
    });
    if (!res.ok) { console.error(`${id}: ${res.status} ${(await res.text()).slice(0, 200)}`); process.exitCode = 1; delete audio[id]; continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(file, buf);
    audio[id] = h;
    made++; bytes += buf.length;
    console.log(`${id}.mp3 ${Math.round(buf.length / 1024)} KB`);
  }
}

// Clips of steps that no longer exist
let removed = 0;
for (const f of readdirSync(dir)) if (f.endsWith('.mp3') && !keep.has(f)) { unlinkSync(join(dir, f)); removed++; }
for (const id of Object.keys(audio)) if (!keep.has(`${id}.mp3`)) delete audio[id];

script.audio = audio;
writeFileSync(scriptFile, JSON.stringify(script, null, 2) + '\n');
console.log(`made ${made}, kept ${kept}, removed ${removed}, ${Math.round(bytes / 1024)} KB written`);
