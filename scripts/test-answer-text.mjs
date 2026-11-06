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
    name: 'a quote that opens by repeating the sentence before it loses the repeat, keeps the new figures',
    content: [T("AAI's sensor archive counts 138 days at or below the WHO 24-hour guideline of 15 µg/m³ in 2024 "),
      T('(138 days at or below the WHO 24-hour guideline of 15 µg/m³, 127 days between 15 and 35 µg/m³, and 101 days above the limit',
        cite("Days in 2024 by daily PM2.5: 138 days at or below the WHO 24-hour guideline of 15 µg/m³, 127 days between 15 and 35 µg/m³, and 101 days above Kazakhstan's daily limit")),
      T('). The report gives 164.')],
    must: [/127 days/, /101 days/, /\[1\]/], count: [/138 days/, 1],
  },
  {
    name: 'a quote that only repeats the sentence before it leaves no empty brackets',
    content: [T("AAI's sensor archive counts 138 days at or below the WHO 24-hour guideline of 15 µg/m³ in 2024 "),
      T('(138 days at or below the WHO 24-hour guideline of 15 µg/m³', cite('138 days at or below the WHO 24-hour guideline of 15 µg/m³')), T('). The report gives 164.')],
    must: [/in 2024\[1\]\. The report/], count: [/138 days/, 1],
  },
  {
    name: 'a sentence that ends on a comma before a new sentence gets its full stop (",[1] That")',
    content: [T('Almaty is at 67.7 µg/m³, ahead of Bishkek at 41.7 µg/m³,', cite('Almaty 67.7; Bishkek 41.7')), T(' That comparison covers five cities.')],
    must: [/41\.7 µg\/m³\.\[1\] That/],
  },
  {
    name: 'a pasted sentence with the same words as the one before it goes, even without figures',
    content: [T('Нет, такой цифры нет. По словам AAI, универсальной доли «во всём загрязнении» не существует, потому что вклад источников зависит от конкретного вещества. '),
      T('Вклад источников зависит от конкретного вещества: универсальной доли «во всем загрязнении» не существует.', cite('Вклад источников зависит от конкретного вещества: универсальной доли «во всем загрязнении» не существует.', 1)),
      T(' Единственная доля для PM2.5 — 34%.')],
    count: [/универсальной доли/, 1], must: [/\[1\]/, /34%/],
  },
  {
    name: 'a cited sentence on a new point that shares a few words stays',
    content: [T('Road dust is the largest PM2.5 source in Almaty at one site. '), T('Coal burning plays a decisive role in winter PM2.5 concentrations from private homes.', cite('coal burning plays a decisive role in winter PM2.5', 1))],
    must: [/decisive role/],
  },
  {
    name: 'a repeat after an unfinished sentence ("…adds that") is kept, so the sentence is not left broken',
    content: [T('The most polluted time is between 19:00 and 21:00 in winter, above 80 µg/m³', cite('peak 19:00–21:00, above 80 µg/m³')), T('. The 2025 review adds that '),
      T('the most polluted time is between 19:00 and 21:00 in winter, above 80 µg/m³', cite('In winter, peak levels occur between 19:00 and 21:00 (above 80 µg/m³)', 0, 1)), T(', which AAI links to inversions.')],
    not: [/adds that\s*\[/],
  },
  {
    name: 'a closing sentence with no source that only repeats figures goes',
    content: [T('The archive counts 138 days', cite('138 days')), T(' and the report 164 days', cite('164 days', 1)), T('. The two counts differ: 138 days in the archive and 164 days in the report.')],
    count: [/138/, 1], must: [/164 days\[2\]/],
  },
  {
    name: 'a sentence with no source but a new figure stays',
    content: [T('The archive counts 138 days', cite('138 days')), T('. That is 26 fewer than the 164 days in the report.')],
    must: [/26 fewer/],
  },
  {
    name: 'a quote that repeats the start of the last sentence is kept whole when the rest would start in lower case',
    content: [T('A child at a school in Turksib district is counted. '), T('A child at a school in Turksib district accumulates a dose of 423 cigarettes over one heating season', cite('A child attending a school or kindergarten in Turksib district accumulates, over one heating season, a dose equivalent to 423 cigarettes')), T('.')],
    not: [/counted\.\s+accumulates/], must: [/423/],
  },
  {
    name: 'a pasted source sentence with the one figure just given goes (15.4% twice)',
    content: [T('Да, по данным Минздрава, за последние пять лет заболеваемость системы кровообращения у детей в Алматы выросла на 15,4%. '),
      T('За последние 5 лет у детей зафиксирован рост заболеваний системы кровообращения на 15,4%.', cite('За последние 5 лет у детей зафиксирован рост заболеваний системы кровообращения на 15,4%.', 1)),
      T(' Для взрослых такого показателя нет.')],
    must: [/\[1\]/, /Для взрослых/], count: [/15,4/, 1],
  },
  {
    name: 'a two-word leftover of a removed quote goes, its mark joins the sentence before ("В отоплении[2].")',
    content: [T('Число машин упало на 93%.', cite('упало на 93%')), T(' Это говорит о важности коммуникации. '),
      T('В отоплении', cite('В отоплении город перешёл на газ.', 1)), T('. При этом эффект был близок к нулю.', cite('эффект был близок к нулю', 0, 2))],
    not: [/В отоплении/], must: [/коммуникации\.\[2\]/, /близок к нулю/],
  },
  {
    name: 'a joining word is not left alone before a citation ("субсидий[3], а[4].")',
    content: [T('Основным инструментом стала замена оборудования за счёт субсидий', cite('замена оборудования за счёт субсидий')), T(', а '),
      T('субсидии покрывали до 100% стоимости котла', cite('субсидии покрывали до 100% стоимости котла', 1)), T('.')],
    not: [/,\s*а\s*\[/, /\sа\[/],
  },
  {
    name: 'marks after a full stop join the marks before it ("год[3].[4]" → "год[3][4].")',
    content: [T('Механизм заработал лишь на третий год', cite('реальная работа началась на третий год')), T('.'),
      T('Интервал может составлять два-три года.', cite('Интервал может составлять два-три года.', 1))],
    not: [/\]\.\[/],
  },
  {
    name: 'a short answer word at the start stays ("Да.")',
    content: [T('Да. '), T('Поддержка составляет 51%.', cite('идею поддерживают 51% горожан'))],
    must: [/^Да\./, /51%/],
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
