// The mentors' 75 test questions (scripts/mentor/{en,ru,kk}.txt), answered the same way the site answers them.
// Saves every answer with its sources and flags the ones to read: no source, wrong language, "not covered".
//   node --env-file=../.env --env-file=../.env.dev scripts/mentor-test.mjs en,ru [1,5,16] [out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadIndex } from '../lib/search.mjs';
import { ask, detectLanguage } from '../lib/copilot.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const index = loadIndex(join(here, '..', 'data', 'chunks.json'));
const LANGS = (process.argv[2] || 'en').split(',');
const ONLY = process.argv[3] && process.argv[3] !== 'all' ? process.argv[3].split(',').map(Number) : null;
const OUT = process.argv[4] || join(here, '..', 'data', 'mentor-results.json');
const NOT_COVERED = /not (covered|in (the|AAI)|available)|no (data|information)|не (освещ|рассматрива|содерж|найд)|нет (данных|информации)|қамтылмаған|деректер жоқ|ақпарат жоқ|кездеспейді|жоқ\./i;

const jobs = [];
for (const lang of LANGS) {
  const lines = readFileSync(join(here, 'mentor', `${lang}.txt`), 'utf8').split('\n');
  for (const l of lines) {
    const m = l.match(/^(\d+)\.\s*(.+)$/);
    if (m && (!ONLY || ONLY.includes(+m[1]))) jobs.push({ lang, n: +m[1], q: m[2].trim() });
  }
}

const results = [];
let cost = 0, i = 0;
async function worker() {
  while (i < jobs.length) {
    const j = jobs[i++];
    try {
      const r = await ask(index, j.q);
      const text = r.text || '';
      const want = detectLanguage(j.q);
      const got = detectLanguage(text);
      const flags = [];
      if (!r.sources?.length) flags.push('no-source');
      if (got !== want) flags.push(`lang:${got}`);
      if (NOT_COVERED.test(text.slice(0, 300))) flags.push('not-covered');
      if (r.route) flags.push('route');
      cost += r.cost_usd || 0;
      results.push({ ...j, model: r.model, route: r.route, cost: r.cost_usd, flags, text,
        sources: (r.sources || []).map(s => s.live ? `LIVE ${s.title}` : `${s.title}${s.page ? ' p' + s.page : ''}${s.date ? ' (' + s.date + ')' : ''}`) });
      process.stdout.write(`${j.lang}${j.n}${flags.length ? '!' : ''} `);
    } catch (e) {
      results.push({ ...j, flags: ['error'], text: e.message, sources: [] });
      process.stdout.write(`${j.lang}${j.n}E `);
    }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
results.sort((a, b) => a.lang.localeCompare(b.lang) || a.n - b.n);
writeFileSync(OUT, JSON.stringify(results, null, 1));
const flagged = results.filter(r => r.flags.some(f => f !== 'route'));
console.log(`\n${results.length} answers · ${flagged.length} flagged · AI cost $${cost.toFixed(3)} · saved to ${OUT}`);
for (const r of flagged) console.log(`  ${r.lang}${r.n} ${r.flags.join(',')}`);
