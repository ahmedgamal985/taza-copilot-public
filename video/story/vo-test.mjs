// Records test takes into vo-test/ (never over the real clips) and transcribes them back.
//   node --env-file=../.env video/story/vo-test.mjs
import { writeFileSync, readFileSync } from 'node:fs';
const TAKES = [
  ['t_ma', 'XrExE9yKIg1WjnnlVkGX', 'kk', 'Түрксіб ауданы: орташа PM2.5 қырық алты бүтін сегіз микрограмм, Бостандықтан екі еседен астам жоғары.'],
  ['t_mb', 'XrExE9yKIg1WjnnlVkGX', 'kk', 'Түрксіб ауданы: орташа PM2.5 қырық алты бүтін сегіз микрограмм, Бостандықтан екі еседен астам жоғары.'],
  ['t_mc', 'XrExE9yKIg1WjnnlVkGX', 'kk', 'Түрксіб ауданы: орташа PM2.5 қырық алты бүтін сегіз микрограмм, Бостандықтан екі еседен астам жоғары.'],
  ['t_md', 'XrExE9yKIg1WjnnlVkGX', 'kk', 'Түрксіб ауданы: орташа PM2.5 қырық алты бүтін сегіз микрограмм, Бостандықтан екі еседен астам жоғары.'],
];
for (const [id, voice, lang, text] of TAKES) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, { method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_v3', language_code: lang, voice_settings: { stability: 0.5, similarity_boost: 0.8 } }) });
  const buf = Buffer.from(await res.arrayBuffer()); writeFileSync(new URL(`vo-test/${id}.mp3`, import.meta.url), buf);
  const form = new FormData(); form.append('model_id', 'scribe_v1'); form.append('file', new Blob([buf], { type: 'audio/mpeg' }), `${id}.mp3`);
  const j = await (await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, body: form })).json();
  console.log(id.padEnd(10), j.text);
}
