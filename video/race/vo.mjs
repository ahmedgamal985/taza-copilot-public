// Voice-over for the race video, in Taza's voice (Bella, the voice agent's voice). One clip per line;
// only lines whose text changed are recorded again. Writes vo/<id>.mp3 and vo/lines.json (with durations).
//   node --env-file=../.env video/race/vo.mjs          (records)
//   node video/race/vo.mjs --count                      (prints the text and the character count only)
// Every figure is measured or quoted: race times from out/race.json, accuracy from data/eval-results.json,
// 31.2 / 24.1 / 30% from AAI's 2025 report and AAI's written answer to Tengrinews, 40% from AAI's fleet study p. 5.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, 'vo'); mkdirSync(dir, { recursive: true });
const VOICE = 'hpp4J3VqNfWAUOO0d1Us', MODEL = 'eleven_v3';

export const LINES = [
  // the full video (about four minutes)
  ['hook', 'On November second, a Tengrinews journalist sent Almaty Air Initiative five questions about the city\'s air.'],
  ['cost', 'AAI\'s experts answered by hand: three pages, twenty-three sources, and hours of work.'],
  ['now', 'Now, the same five questions, asked live.'],
  ['race', 'Taza Copilot searches only AAI\'s published research and its live sensors, and answers each question in seconds, with the exact quote, the page, and a link.'],
  ['punch', 'All five, in forty-one seconds.'],
  ['match', 'And the facts match AAI\'s own answer: thirty-one point two micrograms in twenty twenty-five, thirty percent worse than the year before.'],
  ['metric', 'Across forty-four test questions, including fifteen real questions that journalists and colleagues sent to the initiative, every answer came with a source, in a median of three point three seconds.'],
  ['trust', 'It checks claims from the news, shows both figures when sources disagree, and says so when the research does not cover a question.'],
  ['live', 'Live data from more than a hundred and fifty sensors: the map, the best time to go out, comparisons with other cities, and schools ranked by the air right now.'],
  ['everywhere', 'Ask by voice, on Telegram, on WhatsApp, where you can even call Taza, or from a widget on any website.'],
  ['decisions', 'And any answer becomes a one-page policy brief.'],
  ['part2', 'The same research can reach every driver and rider in inDrive.'],
  ['driver', 'Drivers get a morning alert on bad-air days, and a reminder to close the windows in traffic. In a jam, the air inside a car is forty percent more polluted, says AAI\'s own fleet study.'],
  ['rider', 'Riders see the air at their pickup point, and drivers find a cleaner spot for a break.'],
  ['api', 'All from one API call, and the location is never stored.'],
  ['aai', 'For AAI, it costs about seven dollars a month, needs no developers, and the code is open.'],
  ['outro', 'Taza Copilot. Ask AAI\'s research anything.'],
  // the one-minute backup video
  ['s_hook', 'A journalist sent Almaty Air Initiative five questions. Answering by hand took hours and twenty-three sources.'],
  ['s_race', 'Taza Copilot answered all five live, in forty-one seconds, each with the exact quote, the page, and a link.'],
  ['s_match', 'The same facts as AAI\'s own answer.'],
  ['s_more', 'Live sensor data, voice, Telegram, WhatsApp, and a widget for any website.'],
  ['s_indrive', 'And inside inDrive: air alerts and advice for drivers and riders.'],
];

if (process.argv.includes('--count')) {
  for (const [id, t] of LINES) console.log(id.padEnd(10), t);
  console.log('characters:', LINES.reduce((a, [, t]) => a + t.length, 0));
  process.exit(0);
}

const require = createRequire(join(process.env.MGTOOLS || 'C:/Users/ahmed.gamal_indriver/mgtools', 'package.json'));
const FFPROBE = require('ffprobe-static').path;
const metaFile = join(dir, 'lines.json');
const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : {};
const out = [];
let made = 0, chars = 0;
for (const [id, text] of LINES) {
  const file = join(dir, `${id}.mp3`), h = createHash('sha256').update(`${VOICE}|${MODEL}|${text}`).digest('hex').slice(0, 10);
  if (!existsSync(file) || meta[id]?.hash !== h) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
      method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: MODEL, language_code: 'en' }),
    });
    if (!res.ok) throw new Error(`${id}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    made++; chars += text.length;
  }
  const dur = +execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim();
  out.push({ id, text, hash: h, dur: +dur.toFixed(3) });
}
writeFileSync(metaFile, JSON.stringify(Object.fromEntries(out.map(o => [o.id, o])), null, 1));
console.log(out.map(o => `${o.id.padEnd(10)} ${o.dur.toFixed(1)}s`).join('\n'));
console.log(`made ${made} clips (${chars} characters), speech total ${out.reduce((a, o) => a + o.dur, 0).toFixed(1)} s`);
