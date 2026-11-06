// The team's 9 test questions (EN, RU, KZ), checked against AAI's own written answers to the media.
// Prints each answer with its sources and what the answer must (or must not) contain.
//   node scripts/team-test.mjs [http://localhost:8791] [1,2,4]
const BASE = process.argv[2] || 'http://localhost:8791';
const ONLY = process.argv[3] ? process.argv[3].split(',').map(Number) : null;

// must: every pattern has to appear in the answer; not: none may appear
export const TEAM = [
  { n: 1, q: 'What are the main sources of PM2.5 pollution in Almaty, and what share does each contribute?',
    must: [/32\s?%/, /20\s?%/, /14\s?%/], note: 'PMF study: road dust 32%, mixed urban 20%, transport 14%; one site only' },
  { n: 2, q: 'Is there a low emission zone (LEZ) operating in Almaty?',
    must: [/28 April|April 28|28 апреля/i], not: [/no LEZ|not (yet )?operat|does not have a LEZ|no low emission zone/i], note: 'LEZ runs in technical mode since 28 April 2026' },
  { n: 3, q: 'Which district of Almaty has the dirtiest air right now?', must: [/µg\/m³/], note: 'live data with a timestamp' },
  { n: 4, q: 'Когда ТЭЦ-2 переведут на газ и как изменятся её выбросы?',
    must: [/37[,.]1/, /2[,.]7/], not: [/нет в (предоставленных )?источниках|не указан/i], note: '37.1 → 2.7 thousand t/year' },
  { n: 5, q: 'Помогает ли дождь очистить воздух в Алматы от смога?', must: [], note: 'honest, no invented numbers' },
  { n: 6, q: 'Is burning coal banned in Almaty, and what are the fines?', must: [], note: 'should say clearly if it is not in the research' },
  { n: 7, q: 'Алматыда ауа қай маусымда ең лас болады?', must: [/20\d\d/], note: 'must say which year the data is from' },
  { n: 8, q: 'Түтін қатты болған күндері алматылықтарға қандай кеңес бересіз?', must: [], note: 'advice on smog days, in Kazakh' },
  { n: 9, q: '2025 жылы Алматыдағы PM2.5 орташа жылдық деңгейі қандай болды?', must: [/31[,.]2/], note: '31.2 µg/m³, 6.3× WHO, +30% vs 2024' },
];

let ok = 0, total = 0, cost = 0;
for (const t of TEAM.filter(t => !ONLY || ONLY.includes(t.n))) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/api/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ question: t.q }) });
  const j = await r.json();
  const text = j.text || j.error || '';
  const miss = (t.must || []).filter(p => !p.test(text)), bad = (t.not || []).filter(p => p.test(text));
  const pass = r.ok && j.found !== false && !miss.length && !bad.length;
  total++; if (pass) ok++; cost += j.cost_usd || 0;
  console.log(`\nQ${t.n} ${pass ? 'PASS' : 'CHECK'} · ${((Date.now() - t0) / 1000).toFixed(1)} s · ${j.model} · $${(j.cost_usd || 0).toFixed(4)} · ${t.note}`);
  if (miss.length) console.log('   missing:', miss.map(String).join(' '));
  if (bad.length) console.log('   should not say:', bad.map(String).join(' '));
  console.log('  ', text.replace(/\s+/g, ' ').slice(0, 1100));
  const docs = new Set((j.sources || []).map(s => s.title));
  console.log(`   ${j.sources?.length || 0} passages · ${docs.size} sources:`, [...docs].map(d => d.slice(0, 70)).join(' | '));
}
console.log(`\n${ok}/${total} pass the automatic checks · AI cost $${cost.toFixed(4)}`);
