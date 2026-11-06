// Listens to every voice-over clip with ElevenLabs speech-to-text and compares the words with the script,
// so a clip that skips, adds or garbles words is caught before rendering.
//   node --env-file=../.env video/race/vo-check.mjs [id ...]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const lines = JSON.parse(readFileSync(join(here, 'vo', 'lines.json'), 'utf8'));
const only = process.argv.slice(2);
const words = s => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
let bad = 0;
for (const [id, l] of Object.entries(lines)) {
  if (only.length && !only.includes(id)) continue;
  const fd = new FormData();
  fd.append('model_id', 'scribe_v1');
  fd.append('language_code', 'en');
  fd.append('file', new Blob([readFileSync(join(here, 'vo', `${id}.mp3`))], { type: 'audio/mpeg' }), `${id}.mp3`);
  const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, body: fd });
  if (!r.ok) { console.log(id, 'STT failed', r.status, (await r.text()).slice(0, 200)); bad++; continue; }
  const heard = (await r.json()).text || '';
  const a = words(l.text), b = words(heard);
  // word-level edit distance
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  const dist = d[a.length][b.length];
  const ok = dist <= Math.max(1, Math.round(a.length * 0.08));
  if (!ok) bad++;
  console.log(`${ok ? 'OK ' : 'CHECK'} ${id.padEnd(10)} diff ${dist}/${a.length}${ok ? '' : `\n   script: ${l.text}\n   heard:  ${heard}`}`);
}
console.log(bad ? `${bad} clip(s) to check` : 'all clips match the script');
