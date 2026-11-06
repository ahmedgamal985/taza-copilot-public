// Builds data/chunks.json from the AAI research corpus in ../aai-research.
// One chunk per PDF page (split into short blocks so Claude can cite exact sentences),
// plus the FAQ, glossary and non-empty web articles.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toBlocks } from '../lib/blocks.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const corpus = join(root, '..', 'aai-research');
const index = JSON.parse(readFileSync(join(corpus, 'index.json'), 'utf8'));

// Clean English titles for the reports (the file names on the AAI site are often wrong).
// Key: start of the PDF file name. null = skip (duplicate or no text).
const TITLES = [
  ['2025-10-22 Halyk', null],
  ['2025-11-07 ', null], // older copy of the 2026-02-24 survey report
  ['2025-11-11 ', null],
  ['2026-03-31 Отчет Казгидромет', null], // same Kazakh text as 2026-04-07
  ['2026-01-27 ', "What Was Almaty's Air Like in 2025? Annual PM2.5 report"],
  ['2026-01-28 ', 'AAI sociological study of Almaty residents'],
  ['2026-01-29 ', "Not the Quantity, but the Quality: how Almaty's vehicle fleet affects the air"],
  ['2026-02-03 ', "What Was Almaty's Air Like in 2025? Annual PM2.5 report"],
  ['2026-02-04 Not', "Not the Quantity, but the Quality: how Almaty's vehicle fleet affects the air"],
  ['2026-02-04 Саны', "Not the Quantity, but the Quality: how Almaty's vehicle fleet affects the air"],
  ['2026-02-16 NO2', 'What Almaty residents breathe: NO2 pollution in 2023-2024'],
  ['2026-02-16 Диоксид', 'What Almaty residents breathe: NO2 pollution in 2023-2024'],
  ['2026-02-17 _NO', 'What Almaty residents breathe: NO2 pollution in 2023-2024'],
  ['2026-02-17 Отчет_для', 'Public attitudes toward Low Emission Zones (LEZ) in Almaty, 2025'],
  ['2026-02-19 2024', 'What air did Almaty breathe in 2024?'],
  ['2026-02-19 Каким', 'What air did Almaty breathe in 2024?'],
  ['2026-02-24 ', 'How Almaty residents perceive smog: annual AAI survey'],
  ['2026-02-25 ', 'How Almaty residents perceive smog: annual AAI survey'],
  ['2026-03-10 ', 'Public attitudes toward Low Emission Zones (LEZ) in Almaty'],
  ['2026-03-31 Парадокс', "The 2025 Paradox: what Kazhydromet's data leaves out"],
  ['2026-04-07 ', "The 2025 Paradox: what Kazhydromet's data leaves out"],
  ['2026-05-29 ', 'The air children in Almaty breathe: schools and kindergartens'],
  ['2026-06-05 ', "China's experience in combating air pollution"],
  ['2026-06-08 ', "China's experience in combating air pollution"],
  ['2026-08-21 CRAES', "China's experience in combating air pollution"],
  ['2026-08-21 Отчет_София', "Low Emission Zone: Sofia's experience"],
  ['2026-08-28 ', 'How Almaty residents perceive smog: annual AAI survey'],
  ['2026-10-15 ', 'Public perceptions of air quality in Almaty: third annual study (reviewed by PwC)'],
  ['2026-10-29 ', "The 2025 Paradox: what Kazhydromet's data leaves out"],
];
const titleFor = file => {
  const hit = TITLES.find(([prefix]) => file.normalize('NFC').startsWith(prefix.normalize('NFC')));
  return hit ? hit[1] : undefined;
};

const chunks = [];
const docs = [];
let skipped = 0;

// 1. PDF reports, one chunk per page
for (const p of index.pdfs.filter(p => p.file && p.text)) {
  const file = p.file.slice(4);
  const title = titleFor(file);
  if (title === null) { skipped++; continue; }
  if (title === undefined) { console.warn('No title for', file); continue; }
  const textPath = join(corpus, p.text);
  if (!existsSync(textPath)) continue;
  const pages = readFileSync(textPath, 'utf8').split('\f');
  const docId = `pdf${docs.length}`;
  docs.push({ id: docId, title, lang: p.lang, date: p.date, url: p.url, kind: 'report', pages: pages.length });
  pages.forEach((pageText, i) => {
    const blocks = toBlocks(pageText);
    if (blocks.join(' ').length < 120) return;
    chunks.push({ id: `${docId}-p${i + 1}`, doc: docId, title, lang: p.lang, date: p.date, kind: 'report',
      page: i + 1, url: `${p.url}#page=${i + 1}`, blocks });
  });
}

// 2. Web articles read from air.org.kz by scripts/fetch-web.mjs (research, external research, legislation)
const seenBodies = new Set();
let dupes = 0;
// press: AAI's written answers to media questions (quoted with title and date; the files are not published)
for (const type of ['research', 'external_research', 'actual_legislation', 'press']) {
  const dir = join(corpus, 'web', type);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir).filter(f => f.endsWith('.md')).sort()) {
    const raw = readFileSync(join(dir, name), 'utf8');
    const head = Object.fromEntries([...raw.matchAll(/^(Source|Date|Language|Type): (.*)$/gm)].map(m => [m[1], m[2].trim()]));
    const title = raw.match(/^# (.*)$/m)?.[1]?.trim() || name;
    // Body starts after the header block; drop the repeated title line and the date line
    const body = raw.split(/\nType: .*\n/)[1]?.replace(title, '').replace(/^\s*\d{1,2} \S+ \d{4}\s*$/m, '').trim() || '';
    if (body.length < 400) continue;
    const key = body.replace(/\s+/g, ' ').slice(0, 3000);
    if (seenBodies.has(key)) { dupes++; continue; }
    seenBodies.add(key);
    const blocks = toBlocks(body);
    if (!blocks.length) continue;
    const docId = `web${docs.length}`;
    const kind = type === 'actual_legislation' ? 'legislation' : type === 'press' ? 'press' : 'article';
    docs.push({ id: docId, title, lang: head.Language, date: head.Date, url: encodeURI(head.Source), kind });
    // Long articles: chunks of about 8 blocks. Media answers are dense question-and-answer text: smaller chunks
    // (about one answer each) so a specific figure is not diluted by the rest of a long reply
    const per = kind === 'press' ? 3 : 8;
    for (let i = 0; i < blocks.length; i += per) {
      chunks.push({ id: `${docId}-${i / per + 1}`, doc: docId, title, lang: head.Language, date: head.Date, kind,
        page: null, url: encodeURI(head.Source), blocks: blocks.slice(i, i + per) });
    }
  }
}
if (dupes) console.log(`skipped ${dupes} duplicate web articles`);

mkdirSync(join(root, 'data'), { recursive: true });
writeFileSync(join(root, 'data', 'chunks.json'), JSON.stringify({ built: new Date().toISOString(), docs, chunks }));
const byKind = chunks.reduce((m, c) => (m[c.kind] = (m[c.kind] || 0) + 1, m), {});
const byLang = docs.reduce((m, d) => (m[d.lang] = (m[d.lang] || 0) + 1, m), {});
console.log(`docs ${docs.length} (skipped ${skipped} duplicate PDFs) | chunks ${chunks.length}`, byKind, 'docs by lang', byLang);
