// Real speech-to-text check for Telegram voice notes: makes spoken questions in English, Russian and
// Kazakh with ElevenLabs text-to-speech (kept in memory, never played), transcribes them with the same
// code the bot uses, and compares. A few cents of ElevenLabs credit.
//   node --env-file=../.env scripts/test-stt.mjs
import { transcribe } from '../lib/stt.mjs';

const VOICE = 'hpp4J3VqNfWAUOO0d1Us'; // the voice agent's voice
const CASES = [
  ['en', 'How many cigarettes did an Almaty resident smoke in 2025?', ['cigarette', '2025']],
  ['ru', 'Насколько загрязнён воздух возле школ?', ['воздух', 'школ']],
  ['kk', 'Мектептер жанындағы ауа қаншалықты ластанған?', ['мектеп', 'ауа']],
];
const norm = s => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
let ok = 0;
for (const [lang, text, words] of CASES) {
  const tts = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_22050_32`, {
    method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_v3', language_code: lang }),
  });
  if (!tts.ok) { console.log(`❌ ${lang}: could not make the test audio (${tts.status}) ${(await tts.text()).slice(0, 160)}`); continue; }
  const audio = Buffer.from(await tts.arrayBuffer());
  const t0 = Date.now();
  const r = await transcribe(audio, { filename: 'voice.mp3', type: 'audio/mpeg' });
  const pass = words.every(w => norm(r.text).includes(w));
  if (pass) ok++;
  console.log(`${pass ? '✅' : '❌'} ${lang}: said «${text}» → heard «${r.text}» (${r.language}, ${Date.now() - t0} ms, ${Math.round(audio.length / 1024)} KB)`);
}
console.log(`\n${ok}/${CASES.length} voice notes understood`);
process.exit(ok === CASES.length ? 0 : 1);
