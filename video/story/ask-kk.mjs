import { readFileSync, writeFileSync } from 'node:fs';
const B = 'https://taza-copilot.online', F = new URL('answers.json', import.meta.url);
const r = await fetch(B + '/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: process.argv[2] }) });
const j = await r.json(); const text = j.answer ?? j.text;
console.log(r.status, text);
const a = JSON.parse(readFileSync(F, 'utf8')); a[process.argv[3]] = { question: process.argv[2], answer: text, sources: (j.sources || []).map(s => ({ title: s.title, page: s.page })) };
writeFileSync(F, JSON.stringify(a, null, 1));
