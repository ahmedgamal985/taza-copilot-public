// The 3:28 cut with the live test on the platform. Narrator: Bella (the voice the team liked in the first video).
// The call (call4.json): Aliya (Aruzhan) and Taza (Matilda, so Taza does not sound like the narrator).
// y_dana3 is written after the live recording, with the real total time.
export const BELLA = 'hpp4J3VqNfWAUOO0d1Us';
import { existsSync, readFileSync } from 'node:fs';
const live = existsSync(new URL('live/live.json', import.meta.url)) ? JSON.parse(readFileSync(new URL('live/live.json', import.meta.url), 'utf8')) : null;
export const LINES = [
  ['y_hook1', BELLA, 'en', '[serious] Fourteen thousand premature deaths a year in Kazakhstan are linked to air pollution.'],
  ['y_hook2', BELLA, 'en', '[quietly] Up to twenty-one hundred of them... in Almaty alone.'],
  ['y_intro', BELLA, 'en', 'The answers that could protect people are buried in a hundred and fifty sources from A-A-I. Taza Copilot finds them in seconds. Meet three people.'],
  ['y_dana1', BELLA, 'en', 'On November second, a Tengrinews journalist sent A-A-I six questions. Answering them took the team about five hours: six pages, twenty-three sources.'],
  ['y_dana2', BELLA, 'en', 'So we asked Taza the same six questions. Live, on the platform.'],
  ...(live ? [['y_dana3', BELLA, 'en', live.say]] : []),
  ['y_aliya1', BELLA, 'en', 'Aliya has two kids. She doesn\'t open websites. She texts Taza on WhatsApp, like a friend. In Russian, English, or Kazakh.'],
  ['y_aliya2', BELLA, 'en', 'And when her hands are full... she just calls.'],
  ['y_tg1', BELLA, 'en', 'On Telegram: a daily air card for the school, questions by voice, and rumours fact-checked.'],
  ['y_tg2', BELLA, 'en', 'Air near me, saved places, alerts, and inline in any chat.'],
  ['y_arman1', BELLA, 'en', 'Nine p.m. Arman is driving the evening rush for inDrive. Taza tells him the air right now, the worst hours, and the cleanest.'],
  ['y_arman2', BELLA, 'en', 'Stuck in traffic? Shut the windows. With them open, drivers breathe air seven times dirtier than pedestrians. [pause] A-A-I\'s research, page five.'],
  ['y_arman3', BELLA, 'en', 'One call to Taza\'s partner API. For every driver and rider, in three languages.'],
  ['y_admin1', BELLA, 'en', 'Behind it all: the A-A-I team. One person, no code. Upload a report, and Taza quotes it seconds later, with a five-point summary for subscribers.'],
  ['y_admin2', BELLA, 'en', 'It checks air.org.kz every day, hides an outdated source in one click, and shows what nobody could answer yet.'],
  ['y_proof', BELLA, 'en', 'Every answer is measured: forty-four out of forty-four correct. Any AI provider works, or a local model, where the AI cost is zero. Hosting: about seven dollars a month.'],
  ['y_metric', BELLA, 'en', '[serious] From hours of reading reports... to a sourced answer in seconds.'],
  ['y_thanks', BELLA, 'en', 'Thank you. Try it, right now. [pause] And now... over to Aimira.'],
];
