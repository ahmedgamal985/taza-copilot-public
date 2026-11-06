// Voice-over for the full video, in Taza's voice (Bella, the voice agent's voice), one clip per scene.
// Only lines whose text changed are recorded again. Writes vo/<id>.mp3 and vo/lines.json (with durations).
//   node --env-file=../.env video/full/vo.mjs
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(process.env.MGTOOLS || 'C:/Users/ahmed.gamal_indriver/mgtools', 'package.json'));
const FFPROBE = require('ffprobe-static').path;
const dir = join(here, 'vo'); mkdirSync(dir, { recursive: true });
const VOICE = 'hpp4J3VqNfWAUOO0d1Us', MODEL = 'eleven_v3';

// part 1: the platform · part 2: inDrive · outro
export const LINES = [
  ['hook', 'A journalist sends Almaty Air Initiative five questions. Answering takes hours: three pages, twenty-three sources.'],
  ['title', 'Taza Copilot answers in seconds, in English, Russian or Kazakh.'],
  ['answer', 'Every answer comes from a hundred and four AAI sources, with the exact quote, the page, and a link.'],
  ['differ', 'When sources disagree, it shows both. And it checks any claim from the news.'],
  ['live', 'Live data from a hundred and fifty sensors: the map, the best time to go out, and comparisons with other cities.'],
  ['schools', 'Schools ranked by the air right now. A policy brief, a quote card or a citation from any answer.'],
  ['accuracy', 'Accuracy is measured: forty-four out of forty-four, including real questions journalists sent AAI.'],
  ['admin', 'The AAI team uploads a new report, and Taza quotes it seconds later.'],
  ['voice', 'Talk to it: the voice agent answers and drives the page. A guided tour explains the rest.'],
  ['channels', 'It is everywhere: Telegram alerts, WhatsApp chat and calls, a website widget, and a phone app.'],
  ['trust', 'History stays in your browser, any AI model works, keys stay on the server, and it costs about seven dollars a month.'],
  ['part2', 'And inside inDrive.'],
  ['driver', 'Drivers get a morning push on bad-air days, and a reminder to close the windows in traffic jams.'],
  ['rider', 'Riders see the air at their pickup point. Drivers find a cleaner spot for a break.'],
  ['api', 'All from one API call, with no personal data.'],
  ['outro', 'Answers in seconds instead of hours. Ready for Almaty today, and Kathmandu and Lahore next.'],
];

const metaFile = join(dir, 'lines.json');
const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : {};
const out = [];
let made = 0;
for (const [id, text] of LINES) {
  const file = join(dir, `${id}.mp3`), h = createHash('sha256').update(`${VOICE}|${MODEL}|${text}`).digest('hex').slice(0, 10);
  if (!existsSync(file) || meta[id]?.hash !== h) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
      method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: MODEL, language_code: 'en' }),
    });
    if (!res.ok) throw new Error(`${id}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    made++;
  }
  const dur = +execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim();
  out.push({ id, text, hash: h, dur: +dur.toFixed(3) });
}
writeFileSync(metaFile, JSON.stringify(Object.fromEntries(out.map(o => [o.id, o])), null, 1));
const total = out.reduce((a, o) => a + o.dur, 0);
console.log(out.map(o => `${o.id.padEnd(9)} ${o.dur.toFixed(1)}s`).join('\n'));
console.log(`made ${made}, speech total ${total.toFixed(1)} s`);
