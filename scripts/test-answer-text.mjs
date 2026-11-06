// Offline test of how an answer's text is put together from the model's blocks and citations
// (no API call, no cost). Each case is a real answer shape that once came out broken.
//   node scripts/test-answer-text.mjs
import { buildAnswer } from '../lib/copilot.mjs';

const meta = [{ title: 'Source A', url: 'https://air.org.kz/a', date: '2026-01-27' }, { title: 'Source B', url: null, date: '2026-11-02', kind: 'press' }];
const cite = (text, i = 0, b = 0) => ({ type: 'search_result_location', search_result_index: i, start_block_index: b, end_block_index: b + 1, cited_text: text });
const T = (text, ...citations) => ({ type: 'text', text, citations: citations.length ? citations : undefined });

const CASES = [
  {
    name: 'two facts that share one figure stay (23 cars over CO and 23 over CH)',
    content: [T('AAI measured 51 vehicles, and 33 exceeded the limits.', cite('33 out of 51 vehicles (65%) exceeded the permissible emission limits')),
      T(' Of these, 23 vehicles exceeded the carbon monoxide (CO) content and '),
      T('23 vehicles exceeded the hydrocarbon (CH) content', cite('23 vehicles exceeded the carbon monoxide (CO) content, and 23 vehicles exceeded the hydrocarbon (CH) content.', 0, 1)), T('.')],
    must: [/hydrocarbon/], not: [/and\s*\[/],
  },
  {
    name: 'a period after a citation mark is not taken for a figure ("from 1 August 2024")',
    content: [T('22% were made before 2005.', cite('22% – were made before 2005')),
      T(' This refers to the traffic flow analysed from '),
      T('1 August 2024 to 1 August 2025', cite('studied traffic flows for a year – from August 1, 2024, to August 1, 2025.', 0, 1)), T('.')],
    must: [/1 August 2024 to 1 August 2025/],
  },
  {
    name: 'a pasted copy of the sentence just written goes, and its mark moves back (37.1 → 2.7)',
    content: [T('Заявленный эффект проекта по ТЭЦ-2 — снижение валовых выбросов с 37,1 до 2,7 тыс. тонн в год, то есть более чем на 90%. '),
      T('Заявленный экологический эффект проекта заключается в снижении валовых выбросов с 37,1 до 2,7 тыс. тонн в год, то есть более чем на 90%.',
        cite('Заявленный экологический эффект проекта заключается в снижении валовых выбросов с 37,1 до 2,7 тыс. тонн в год, то есть более чем на 90%, с полным исключением выбросов диоксида серы и угольной золы.', 1)),
      T(' Это примерно в 13–14 раз.')],
    must: [/тыс\. тонн в год/, /\[1\]/], count: [/37,1/, 1],
  },
  {
    name: 'an abbreviation ("тыс.") does not cut the claim in two',
    content: [T('Выбросы должны снизиться с 37,1 до 2,7 тыс. тонн в год, то есть более чем на 90%, с полным исключением выбросов диоксида серы.',
      cite('Заявленный экологический эффект проекта заключается в снижении валовых выбросов с 37,1 до 2,7 тыс. тонн в год, то есть более чем на 90%, с полным исключением выбросов диоксида серы и угольной золы.', 1))],
    must: [/тыс\. тонн в год/, /диоксида серы/],
  },
  {
    name: 'the same figures repeated later in the answer are dropped (32% NOx, 64% PM)',
    content: [T('Trucks make up about 3% of mileage but 32% of NOx and 64% of PM emissions', cite('trucks account for 32% of NOx emissions and 64% of PM', 1)),
      T(', and the fleet structure matters as much as the count.'),
      T(' Trucks account for 32% of NOx emissions and 64% of PM', cite('Trucks account for 32% of NOx emissions and 64% of PM, highlighting their disproportionately high contribution', 0, 2)), T('.')],
    count: [/64%/, 1], not: [/\.\[\d\],/],
  },
  {
    name: 'a mark after a full stop and before a comma is tidied ("emissions.[1], and")',
    content: [T('Trucks produce 64% of PM emissions.', cite('64% of PM')), T(', and AAI notes the fleet matters.')],
    must: [/emissions\[1\], and/],
  },
  {
    name: 'a new claim with new figures after a cited one stays',
    content: [T('Turksib averaged 46.8 µg/m³ in 2025', cite('Turksib District: 46.8 µg/m³')), T(', and '),
      T('Bostandyk 22.1 µg/m³, a 2.1-fold gap', cite('Turksib District (46.8 µg/m³) was 2.1 times more polluted than Bostandyk District (22.1 µg/m³).', 0, 1)), T('.')],
    must: [/22\.1/, /2\.1-fold/],
  },
  {
    name: 'a "not covered" answer with no figures keeps its text',
    content: [T("AAI's research does not cover radon in apartments. A related topic is indoor PM2.5 measured in homes during the heating season", cite('measurements of PM2.5 inside Almaty apartments during the heating season', 1)), T('.')],
    must: [/does not cover radon/, /\[1\]/],
  },
];

let ok = 0;
for (const c of CASES) {
  const { text, sources } = buildAnswer(c.content, meta);
  const fails = [];
  for (const p of c.must || []) if (!p.test(text)) fails.push(`missing ${p}`);
  for (const p of c.not || []) if (p.test(text)) fails.push(`should not have ${p}`);
  if (c.count) { const n = (text.match(new RegExp(c.count[0].source, 'g')) || []).length; if (n !== c.count[1]) fails.push(`${c.count[0]} appears ${n}×, expected ${c.count[1]}`); }
  if (!sources.length) fails.push('no sources');
  if (!fails.length) ok++;
  console.log(`${fails.length ? 'FAIL' : 'ok  '} ${c.name}${fails.length ? `\n     ${fails.join('; ')}\n     → ${text}` : ''}`);
}
console.log(`\n${ok}/${CASES.length} pass`);
process.exit(ok === CASES.length ? 0 : 1);
