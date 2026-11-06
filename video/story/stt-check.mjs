// Transcribes voice-over clips back to text, to catch an audio tag ("[serious]") read out loud or a wrong word.
//   node --env-file=../.env video/story/stt-check.mjs id1 id2 …
import { readFileSync } from 'node:fs';
for (const id of process.argv.slice(2)) {
  const form = new FormData();
  form.append('model_id', 'scribe_v1');
  form.append('file', new Blob([readFileSync(new URL(`vo/${id}.mp3`, import.meta.url))], { type: 'audio/mpeg' }), `${id}.mp3`);
  const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, body: form });
  const j = await r.json();
  console.log(`${id.padEnd(9)} ${r.status} ${j.text ?? JSON.stringify(j).slice(0, 120)}`);
}
