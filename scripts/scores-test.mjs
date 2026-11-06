// The team's 20-question test (Russian and Kazakh, scored against AAI's own documents), with automatic checks for
// the issues it found on 7 November: two-part questions, verdict wording, dates of sources, unrelated extra facts.
//   node --env-file=../.env --env-file=../.env.dev scripts/scores-test.mjs [ids,comma,separated]
//   LIVE=https://taza-copilot.online node scripts/scores-test.mjs   (the same questions on the live site)
// About $0.03 per question on the auto route (Russian and Kazakh go to the stronger model).
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { loadIndex } from '../lib/search.mjs';
import { ask } from '../lib/copilot.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const index = loadIndex(join(here, '..', 'data', 'chunks.json'));

const opening = t => t.trim().slice(0, 80).toLowerCase();
// [id, question, checks: { must: [regex], not: [regex], startNot: [regex], start: [regex], note }]
const TESTS = [
  ['RU-073', 'Сколько дней в 2025 году воздух в Алматы превышал казахстанскую суточную норму по PM2.5?', { must: [/12[46]/] }],
  ['RU-085', 'Правда ли, что Алматы на втором месте в мире по загрязнению воздуха?', { start: [/^исследования aai (этого )?не подтвержда/], startNot: [/^отчасти/, /^да\b/, /^нет\b/] }],
  ['RU-049', 'Какой сейчас уровень PM2.5 в Турксибском районе?', { must: [/\d{1,2}:\d{2}/, /мкг\/м³|µg\/m³/] }],
  ['RU-057', 'Сколько в Алматы чистых дней в году?', { must: [/14[89]/] }],
  ['RU-104', 'Сколько датчиков у AAI и правда ли, что это крупнейшая сеть в Азии?', { must: [/170/, /частн/] }],
  ['RU-005', 'Какие основные источники загрязнения воздуха в городе? Какую долю вносят автомобили, ТЭЦ и частный сектор?', { must: [/32/, /18/, /16/, /14/] }],
  ['RU-020', 'Поможет ли LEZ и насколько, как ТЭЦ улучшит качество воздуха?', { must: [/37[,.]1/, /2[,.]7/, /28 апреля|технич/] }],
  ['RU-094', 'Правда ли, что ТЭЦ-2 входит в 10% самых загрязняющих объектов мира?', { must: [/37[,.]1/], startNot: [/^да\b/, /^нет\b/] }],
  ['RU-078', 'Что выяснила AAI о загрязнении воды в Капчагае?', { not: [/турксиб/i, /pm2[.,]5/i], must: [/не (охватыва|рассматрива|изуча|содерж)|нет данных|не исследова/] }],
  ['RU-040', 'Сколько машин на дорогах Алматы выпущены до 2005 года?', { must: [/22\s?%/] }],
  ['KZ-073', 'Алматыда төмен шығарындылар аймағына кіргені үшін айыппұл қашан салына бастайды?', { must: [/28 сәуір/] }],
  ['KZ-049', 'Алматыда әлеуметтік тұрғын үйлер қай жерде орналасқан және онда тұратындар қандай ауамен тыныс алады?', {}],
  ['KZ-057', 'Жүк көліктері қанша NOx пен ұсақ бөлшек шығарады?', { must: [/32/, /64/] }],
  ['KZ-005', 'Алматыда қай маусымда тұмша күшейеді және неге?', { must: [/2025/] }],
  ['KZ-020', 'Алматы ауасын не көбірек ластайды: көліктер ме, ЖЭО ма, әлде жеке сектор ма?', { must: [/32/, /18/] }],
  ['KZ-040', 'Алматыдағы барлық жеке үйлер газға қосылған ба?', { must: [/98[,.]8|149\s?341/] }],
  ['KZ-032', 'Алматыда қанша көлік бар?', { must: [/797/] }],
  ['KZ-028', 'Алматы оқушылары ДДҰ нормасынан 9 есе лас ауамен тыныс алады деген рас па?', { start: [/^aai зерттеулері мұны растамайды/], startNot: [/^жоқ\b/, /^иә\b/, /^ішінара/], must: [/16/] }],
  ['KZ-010', 'Әр төртінші алматылық қаладан көшкісі келеді деген рас па?', { must: [/25[,.]9/] }],
  ['KZ-072', 'Неліктен Қазақстанда PM2.5 бойынша жылдық норма жоқ және қазақстандық нормалар ДДҰ нормаларынан қаншалықты жұмсақ?', { must: [/35/, /15/] }],
];

const only = process.argv[2]?.split(',');
const out = [];
let pass = 0, n = 0, cost = 0;
for (const [id, q, c] of TESTS) {
  if (only && !only.includes(id)) continue;
  n++;
  if (process.env.LIVE && n > 1) await new Promise(r => setTimeout(r, 6000)); // the site allows 12 questions a minute per user
  // LIVE=https://… asks the live site itself (its own deploy, cache and data) instead of this checkout's code
  const r = process.env.LIVE
    ? await fetch(`${process.env.LIVE}/api/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q }) })
      .then(x => x.json()).then(j => ({ ...j, text: j.text ?? j.answer ?? j.error ?? '', sources: j.sources || [] }))
    : await ask(index, q, { model: 'auto' });
  cost += r.cost_usd || 0;
  const text = r.text, low = text.toLowerCase(), start = opening(text);
  const fails = [];
  for (const p of c.must || []) if (!p.test(low)) fails.push(`missing ${p}`);
  for (const p of c.not || []) if (p.test(low)) fails.push(`has ${p}`);
  if (c.start && !c.start.some(p => p.test(start))) fails.push(`opening should match ${c.start}`);
  for (const p of c.startNot || []) if (p.test(start)) fails.push(`opening should not match ${p}`);
  if (!r.sources.length && !/^(RU-078|KZ-049)$/.test(id)) fails.push('no source');
  // a date named in the text must be the date of a cited source ("2 November" while only the 5 November answer is cited)
  const named = [...text.matchAll(/(\d{1,2})\s(ноября|қараша|November)/gi)].map(m => +m[1]);
  const cited = r.sources.map(s => +(String(s.date || '').match(/-(\d{2})$/)?.[1] || 0));
  const today = new Date(Date.now() + 5 * 3600e3).getUTCDate(); // live readings carry today's Almaty date, not a source date
  const hasLive = r.sources.some(s => !s.date); // live readings and the sensor archive carry recent dates of their own
  for (const d of named) if (d >= 1 && d <= 7 && d !== today && !(hasLive && d >= today - 1) && !cited.includes(d)) fails.push(`names ${d} November but cites ${cited.join('/') || 'nothing'}`);
  if (!fails.length) pass++;
  out.push({ id, q, ok: !fails.length, fails, model: r.model, route: r.route, ms: r.ms, text, sources: r.sources.map(s => `${s.title} · ${s.date}`) });
  console.log(`${fails.length ? 'FAIL' : 'ok  '} ${id} ${(r.ms / 1000).toFixed(1)}s ${r.model}${fails.length ? '\n     ' + fails.join('; ') : ''}\n     → ${text.slice(0, 400).replace(/\n/g, ' ')}`);
}
writeFileSync(join(here, '..', '..', 'scores-test-results.json'), JSON.stringify(out, null, 1));
console.log(`\n${pass}/${n} pass · cost $${cost.toFixed(3)}`);
