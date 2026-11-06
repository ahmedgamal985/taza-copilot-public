// Accuracy test: simple questions whose answers are checked facts from AAI research, including real
// questions journalists and colleagues sent to AAI (in Russian and Kazakh).
// Every question runs on the fast model (Haiku) only, so a full run costs about $0.05.
// An answer passes when it contains the expected fact AND cites at least one source.
//   node --env-file=../.env scripts/eval.mjs
// Results go to data/eval-results.json and appear on the dashboard.
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadIndex } from '../lib/search.mjs';
import { ask } from '../lib/copilot.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const index = loadIndex(join(here, '..', 'data', 'chunks.json'));
const MODEL = 'claude-haiku-5-5';

// [question, expected fact (shown on the dashboard), check]
const TESTS = [
  ['What was the average PM2.5 level in Almaty in 2025?', '31.2 µg/m³', /31[.,]2/],
  ['How many cigarettes did an Almaty resident "smoke" by breathing the air in 2025?', '518 cigarettes', /518/],
  ['How many cigarettes a day did an Almaty resident "smoke" in 2025?', '1.42 a day', /1[.,]42/],
  ['How many cigarettes did a Turksib district resident "smoke" in 2025?', '776 cigarettes', /776/],
  ['How many clean-air days did Almaty have in 2025?', '148 days', /148/],
  ['How many clean-air days did Almaty have in 2024?', '164 days', /164/],
  ['What was the average PM2.5 in Turksib district in 2025?', '46.8 µg/m³', /46[.,]8/],
  ['What was the average PM2.5 in Bostandyk district in 2025?', '22.1 µg/m³', /22[.,]1/],
  ['How many times dirtier was the air in Turksib than in Bostandyk in 2025?', '2.1 times', /2[.,]1/],
  ['How many times above the WHO guideline was Almaty\'s average PM2.5 in 2025?', '6.3 times', /6[.,]3/],
  ['How many schools were analysed in the study of air near schools?', '352 schools', /352/],
  ['How many kindergartens were analysed in the study of air near schools?', '1,008 kindergartens', /1[ ,.]?008/],
  ['What share of school days near schools had PM2.5 above Kazakhstan’s daily limit?', '48.4%', /48[.,]4/],
  ['How many school days out of 157 were above Kazakhstan’s daily PM2.5 limit near schools?', '76 of 157 days', /\b76\b/],
  ['Which school had the most polluted air?', 'School No. 156', /156/],
  ['What was the average PM2.5 near the cleanest school in Medeu district?', '19.7 µg/m³', /19[.,]7/],
  ['How big was the gap between the most and least polluted schools?', '3.5 times', /3[.,]5/],
  ['What was the average PM2.5 near schools in December 2025?', '62.4 µg/m³', /62[.,]4/],
  ['What was the PM2.5 level near the Balausa kindergarten?', '71.3 µg/m³', /71[.,]3/],
  ['What share of PM2.5 in Almaty comes from urban road dust?', '32%', /32\s?%/],
  ['What share of PM2.5 in Almaty comes from the urban atmosphere factor?', '20%', /20\s?%/],
  ['Where were the PM2.5 samples collected for the study of pollution sources?', 'KazNU campus', /KazNU|al-Farabi Kazakh National/i],
  ['What did the blood experiment find on red blood cells after the walk?', 'soot (dark) particles', /soot|particles/i],
  ['What share of Almaty residents took no environmental action in the past year?', '46%', /46([.,]\d)?\s?%/],
  ['What share of Almaty residents use no measures to protect themselves from polluted air?', '17%', /17\s?%/],
  ['What share of 25–34-year-olds in Almaty use air purifiers?', '36% (2025) or 35.5% (2026 wave)', /36\s?%|35[.,]5\s?%/],
  // the same survey gives 43% (allergic reactions noticed as a sign of smog) and 39% (reported as a symptom): both are right
  ['What share of Almaty residents report allergic reactions from smog?', '43% (or 39% as a symptom)', /43\s?%|39\s?%/],
  ['By how much did Kazhydromet\'s count of PM10 exceedances fall in 2025?', '29% (1,091 → 772)', /29\s?%|1[ ,.]?091[^.]{0,40}772/],
  ['When did the Almaty delegation visit Sofia to study its low emission zone?', 'July 2026', /July\s*2026|6[–-]10 July/i],
  // Real questions journalists (Tengrinews, Kursiv, Informburo...) and AAI colleagues sent to AAI in November 2026,
  // asked in their own language; the expected facts come from AAI's written answers to them
  ['Насколько выросла средняя концентрация PM2.5 в Алматы в 2025 году по сравнению с 2024 годом?', '31.2 vs 24.1 µg/m³, about 30%', /24[.,]1|30\s?%/],
  ['Какую долю PM2.5 в Алматы дают ТЭЦ и котельные по исследованию КазНУ?', '18%', /18\s?%/],
  ['Какой процент автотранспорта (выхлопов) был в исследовании КазНУ?', '14%', /14\s?%/],
  ['Насколько готова новая газовая часть ТЭЦ-2?', 'about 95%', /95\s?%/],
  ['Какова готовность перевода ТЭЦ-3 на газ по данным Минэнерго?', '27.09%', /27[.,]09/],
  ['Сколько автомобилей проверили в сентябре в рамках пилота зоны низких выбросов (LEZ) и у скольких выявили превышение?', '6,833 checked, 922 (13.5%) over the limit', /6[\s  ,.]?833|922|13[.,]5\s?%/],
  ['Когда в Алматы начался отопительный сезон 2026–2027 годов?', '9 October 2026', /9 октября|October 9|9 October/i],
  ['В какие часы в холодный сезон обычно максимум PM2.5 в Алматы?', '19:00–21:00', /19[:.]00/],
  ['Сколько преждевременных смертей в год в Алматы связывают с воздействием PM2.5?', 'up to about 2,100 a year', /2[\s ,.]?1\s?тыс|2[\s  ,.]?100/],
  ['Какие рекомендации вы бы дали жителям Алматы в дни сильного смога, чтобы снизить риски для здоровья?', 'AAI’s advice: less time and exercise outside, respirator, purifier, windows', /N95|FFP2|KN95|HEPA|респиратор|очистител|прогул|окн|нагрузк/i],
  // 72 µg/m³ (Tengrinews answer); AAI confirmed the 77.5 in its 5 November answer was a mistake, left out of the index
  ['Какой была среднесуточная концентрация PM2.5 в Алматы 1 ноября 2026 года?', '72 µg/m³', /\b72\b/],
  ['Сколько автомобилей ежедневно передвигается по Алматы?', 'about 650 thousand', /650/],
  ['Какую долю транспортных выбросов PM дают грузовики в Алматы?', '64% of PM (32% of NOx)', /64\s?%/],
  ['Қаланың қай аймағында жағдай аса ауыр? Не себепті?', 'the north and north-west: Turksib (46.8), Zhetysu, Alatau', /46[.,]8|Түрксіб|солтүстік/i],
  ['Алматыда қай маусымда тұмша басылып, қай мезгілде керісінше үдейді?', 'worse in late autumn and winter, lower in spring and summer', /қыс|күз|winter/i],
];

const t0 = Date.now();
const items = [];
let cost = 0;
// Three at a time: fast, and well under the API rate limits
for (let i = 0; i < TESTS.length; i += 3) {
  const batch = TESTS.slice(i, i + 3);
  const done = await Promise.all(batch.map(async ([q, expected, re]) => {
    try {
      const r = await ask(index, q, { provider: 'anthropic', model: MODEL });
      if (typeof r.cost_usd === 'number') cost += r.cost_usd;
      const hasFact = re.test(r.text), cited = r.sources.length > 0;
      return { question: q, expected, pass: hasFact && cited, has_fact: hasFact, cited, model: r.model, ms: r.ms,
        source: r.sources[0] ? `${r.sources[0].title}${r.sources[0].page ? `, p. ${r.sources[0].page}` : ''}` : null,
        answer: r.text.slice(0, 300) };
    } catch (err) {
      return { question: q, expected, pass: false, error: err.message.slice(0, 120) };
    }
  }));
  for (const d of done) console.log(`${d.pass ? '✅' : '❌'} ${d.question}  → expected ${d.expected}${d.pass ? '' : `  | fact:${d.has_fact} cited:${d.cited} ${d.error || ''}`}`);
  items.push(...done);
}

const passed = items.filter(x => x.pass).length;
const ms = items.filter(x => x.ms).map(x => x.ms).sort((a, b) => a - b);
const result = {
  run_at: new Date().toISOString(), model: MODEL, total: items.length, passed,
  accuracy_pct: Math.round(100 * passed / items.length),
  median_seconds: +(ms[Math.floor(ms.length / 2)] / 1000).toFixed(1),
  cost_usd: +cost.toFixed(4), minutes: +((Date.now() - t0) / 60000).toFixed(1),
  // Answers the fast model could not source twice go to the stronger model once (as for users): counted here
  escalated: items.filter(x => x.model && x.model !== MODEL).length, items,
};
writeFileSync(join(here, '..', 'data', 'eval-results.json'), JSON.stringify(result, null, 2));
console.log(`\nAccuracy: ${passed}/${items.length} (${result.accuracy_pct}%) · median ${result.median_seconds}s · cost $${result.cost_usd} · on ${MODEL}${result.escalated ? ` (${result.escalated} escalated to the stronger model for a source)` : ''}`);
