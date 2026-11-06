// Free search test (no AI, no cost): for each of the mentors' 75 questions, does the search bring the passage
// that holds the answer? Each question is searched with its English, Russian and Kazakh wording together
// (what the planner does), then with each wording alone (what happens if the planner fails).
//   node scripts/search-test.mjs [n,n,…]
// It searches with the whole question, not the planner's short keyword queries, so it is stricter than the site:
// on 6 November 2026 it found 55 of 61; the 6 it missed (12, 16, 23, 63, 64, 65) were answered correctly on the site.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadIndex, search } from '../lib/search.mjs';
import { SEARCH_OPTS } from '../lib/copilot.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const index = loadIndex(join(here, '..', 'data', 'chunks.json'));
const ONLY = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
const read = lang => Object.fromEntries(readFileSync(join(here, 'mentor', `${lang}.txt`), 'utf8').split('\n')
  .map(l => l.match(/^(\d+)\.\s*(.+)$/)).filter(Boolean).map(m => [+m[1], m[2].trim()]));
const Q = { en: read('en'), ru: read('ru'), kk: read('kk') };

// The fact the answer needs, as found in AAI's research (checked by hand on 6 November 2026).
// null: AAI's research does not cover it (the honest answer is "not covered"); 'live': answered from live sensors.
const T = s => ({ title: s });
const FACT = {
  1: T(/Key Outcomes|воркшоп|workshop/i), 2: /65\s?%/, 3: /22\s?%[^.]{0,40}2005/, 4: null, 5: /49[.,]4|30[.,]6/, 6: null, 7: null,
  8: /амброз|ragweed|ойраншөп|PollenSense/i, 9: /51\s?%/, 10: /32\s?%/, 11: /48[.,]4/, 12: /инверси|inversion|инверсия/i, 13: 'live',
  14: /18\s?%/, 15: /46[.,]8/, 16: /18\s?%|универсальн|universal share|single (fixed )?share/i, 17: /5[.,]8[^.]{0,30}4[.,]1|31\s?%/,
  18: /\b5\s?(µg|мкг|μg)/, 19: T(/school|школ|мектеп/i), 20: T(/NO₂|NO2/), 21: /145[.,]1/, 22: /148|164/, 23: /797|643[\s ,]?470/,
  24: null, 25: /6[.,]3/, 26: /352/, 27: null, 28: null, 29: /25[.,]9|one in four|каждый четв|әр төртінші/i, 30: /31[.,]2/,
  31: /98[.,]8|91\s?%/, 32: /61\s?%|64\s?%/, 33: /5[.,]5/, 34: /формальн|formality|3[–-]5 (min|мин)/i, 35: /1[.,]42/, 36: null,
  37: T(/Sofia|Софи/i), 38: /Алатау|Alatau/, 39: /\b12[46]\b/, 40: null, 41: /4[.,]6|6[.,]1/, 42: /2[.,]1 тыс|2,100|2 100|\b265\b/,
  43: /79\s?%/, 44: null, 45: /46[.,]8/, 46: /ОНД[- ]?86|OND[- ]?86/, 47: T(/blood|кров|қан/i), 48: /64\s?%/, 49: /32\s?%/,
  50: /37[.,]1/, 51: null, 52: /518/, 53: /бан[яиь]|bathhouse|монша/i, 54: /0[.,]27/, 55: /164/, 56: T(/NO₂|NO2/), 57: null,
  58: /4[.,]6|4[.,]2/, 59: null, 60: /797/, 61: /32\s?%/, 62: null, 63: /19[:.]00/, 64: /160/, 65: /28 (April|апреля|сәуір)|April 28/i,
  66: /41\s?%/, 67: /423/, 68: /Bradford|Брэдфорд|Брэдфорд|London|Лондон/i, 69: /12 (months|месяц|ай)/i, 70: T(/blood|кров|қан/i),
  71: /49\s?%|54[.,]5/, 72: /\b200\b/, 73: /217|124|148/, 74: /25[.,]9|one in four|каждый четв|әр төртінші/i, 75: /98[.,]8|бан[яиь]|bathhouse/i,
};

const hit = (results, f) => results.findIndex(r => f.title ? f.title.test(r.title) : f.test(r.title + ' ' + r.blocks.join(' ')));
let all = 0, alone = { en: 0, ru: 0, kk: 0 }, checked = 0;
const misses = [];
for (let n = 1; n <= 75; n++) {
  if (ONLY && !ONLY.includes(n)) continue;
  const f = FACT[n];
  if (!f || f === 'live') continue;
  checked++;
  const together = search(index, [Q.en[n], Q.ru[n], Q.kk[n]], SEARCH_OPTS);
  const at = hit(together, f);
  if (at >= 0) all++;
  const single = {};
  for (const l of ['en', 'ru', 'kk']) { single[l] = hit(search(index, [Q[l][n]], SEARCH_OPTS), f); if (single[l] >= 0) alone[l]++; }
  const line = `${String(n).padStart(2)} ${at >= 0 ? `ok #${at + 1}` : 'MISS '}  alone: en ${single.en >= 0 ? 'ok' : '--'} ru ${single.ru >= 0 ? 'ok' : '--'} kk ${single.kk >= 0 ? 'ok' : '--'}  ${Q.en[n].slice(0, 70)}`;
  console.log(line);
  if (at < 0) misses.push({ n, top: together.slice(0, 4).map(r => `${r.title.slice(0, 50)} (${r.lang})`) });
}
console.log(`\nAll three wordings together: ${all}/${checked} find the answer`);
console.log(`One wording alone: en ${alone.en}/${checked} · ru ${alone.ru}/${checked} · kk ${alone.kk}/${checked}`);
for (const m of misses) console.log(`  missed ${m.n}: got ${m.top.join(' | ')}`);
process.exit(all === checked ? 0 : 1);
