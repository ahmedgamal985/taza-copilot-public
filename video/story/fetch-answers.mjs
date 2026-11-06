// Real answers from the live platform for the story video (the chat, the call and the website scenes).
//   node video/story/fetch-answers.mjs  -> video/story/answers.json   (a few cents of AI)
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
const BASE = 'https://taza-copilot.online';
const Q = {
  dana: ['Did Almaty\'s air really get cleaner in 2025?', 'answer'],
  aliya_chat: ['Мои дети ходят в школу в Турксибе. Насколько там грязный воздух?', 'answer'],
  call_ru: ['Какая школа в Алматы с самым грязным воздухом?', 'answer'],
  call_kk: ['Алматының қай ауданында ауа ең лас?', 'answer'],
  check: ['Almaty\'s air got 50% cleaner in 2025', 'factcheck'],
  tg_check: ['Говорят, что 80% смога в Алматы дают машины', 'factcheck'],
};
const FILE = new URL('answers.json', import.meta.url);
const out = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {};
const save = () => writeFileSync(FILE, JSON.stringify(out, null, 1));
for (const [k, [question, mode]] of Object.entries(Q)) {
  if (out[k]?.sources?.length) continue;
  const r = await fetch(`${BASE}/api/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, mode }) });
  const j = await r.json();
  out[k] = { question, mode, answer: j.answer ?? j.text ?? j.error, sources: (j.sources || []).map(s => ({ title: s.title, page: s.page, url: s.url })), verdict: j.verdict, model: j.model, ms: j.ms };
  save();
  console.log(k, r.status, (out[k].answer || '').slice(0, 300).replace(/\n/g, ' '));
}
for (const role of ['driver', 'rider']) out['partner_' + role] = await (await fetch(`${BASE}/api/partner/brief?lang=en&role=${role}`)).json();
out.outdoor = await (await fetch(`${BASE}/api/outdoor`)).json();
out.air = await (await fetch(`${BASE}/api/air`)).json().catch(() => null);
out.stats = await (await fetch(`${BASE}/api/stats`)).json();
save();
console.log('saved');
