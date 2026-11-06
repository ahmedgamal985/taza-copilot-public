// Sound effects (ElevenLabs sound generation) and the music score (ElevenLabs music), made once.
//   node --env-file=../../../.env video/story/sfx.mjs   -> sfx/<name>.mp3, sfx/music.mp3
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, 'sfx'); mkdirSync(dir, { recursive: true });
const H = { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' };
const FX = {
  heartbeat: ['Slow deep human heartbeat, cinematic, low and muffled, ominous', 6],
  smog: ['Dark ambient city drone with low wind, smoggy and oppressive atmosphere, distant traffic hum', 12],
  braam: ['Huge cinematic braam impact, deep brass hit with long dark tail, trailer sound', 4],
  whoosh: ['Fast clean cinematic whoosh transition', 1],
  riser: ['Cinematic tension riser building up, ending abruptly', 3],
  notif: ['Soft modern smartphone notification ping, single tone', 1],
  ring: ['Modern smartphone incoming call ringtone, soft marimba melody, two rings', 4],
  pickup: ['Phone call connecting click and short beep', 1],
  hangup: ['Phone call ending tone, short double beep', 1],
  traffic: ['City traffic jam, idling engines, distant car horns, heard from inside a car with open window', 6],
  window: ['Car power window closing with electric motor whir, ending with a soft thud, outside noise becomes muffled', 3],
  typing: ['Typing on a smartphone touch keyboard, soft taps', 2],
  sent: ['Short soft message sent pop sound, user interface', 1],
  tick: ['Single soft digital user interface tick', 0.5],
  stamp: ['Satisfying user interface confirmation chime, positive', 1],
  logo: ['Warm uplifting cinematic logo reveal, soft shimmer and deep bass swell', 4],
  upload: ['Digital file upload whoosh followed by a soft success chime', 2],
};
for (const [name, [text, duration_seconds]] of Object.entries(FX)) {
  const f = join(dir, name + '.mp3'); if (existsSync(f)) continue;
  const r = await fetch('https://api.elevenlabs.io/v1/sound-generation', { method: 'POST', headers: H, body: JSON.stringify({ text, duration_seconds, prompt_influence: 0.5 }) });
  if (!r.ok) { console.log(name, r.status, (await r.text()).slice(0, 200)); continue; }
  writeFileSync(f, Buffer.from(await r.arrayBuffer())); console.log('fx', name);
}
const mf = join(dir, 'music.mp3');
if (!existsSync(mf)) {
  const prompt = 'Instrumental cinematic documentary score, no vocals. 0:00-0:30 dark, tense and sparse: low drones, a distant pulse, felt piano notes. ' +
    '0:30-2:50 hopeful and driven: warm piano ostinato, soft strings, light modern percussion, steady momentum, understated so a narrator can speak over it. ' +
    '2:50-3:30 emotional build: full strings, rising, then a resolved, uplifting ending with a long fade.';
  const r = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', { method: 'POST', headers: H, body: JSON.stringify({ prompt, music_length_ms: 230000, force_instrumental: true }) });
  if (!r.ok) console.log('music', r.status, (await r.text()).slice(0, 300));
  else { writeFileSync(mf, Buffer.from(await r.arrayBuffer())); console.log('music ok'); }
}
