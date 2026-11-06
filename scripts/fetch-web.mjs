// Downloads the text of AAI's web pages (research articles, external research, FAQ, glossary,
// legislation) from air.org.kz. The WordPress API returns these bodies empty, so we read the pages.
// Output: ../aai-research/web/<type>/<lang> <date> <title>.md   Run: node scripts/fetch-web.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const corpus = join(here, '..', '..', 'aai-research');
const index = JSON.parse(readFileSync(join(corpus, 'index.json'), 'utf8'));
const out = join(corpus, 'web');

const decode = s => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&laquo;/g, '«').replace(/&raquo;/g, '»');

function pageText(html) {
  // The article lives in <main>; drop navigation, forms, scripts, modals and footers
  let m = html.match(/<main[\s\S]*?<\/main>/i)?.[0] || html.match(/<body[\s\S]*<\/body>/i)?.[0] || html;
  m = m.replace(/<(script|style|noscript|svg|form|nav|footer|header|button|iframe)[\s\S]*?<\/\1>/gi, '')
    .replace(/<div[^>]*class="(?:[^"]*\s)?(share-modal|search-results|search-form|mobile-search-results|cookies-notice|page-nav|research-image-modal)[^"]*"[\s\S]*?<\/div>/gi, '')
    .replace(/<img[^>]*>/gi, '');
  return decode(m
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|table)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<td[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t ​]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const safe = s => decode(s).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 110);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const items = index.texts;
let done = 0, kept = 0;
async function worker(queue) {
  for (let t; (t = queue.shift());) {
    const dir = join(out, t.type);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${t.lang} ${t.date} ${safe(t.title) || 'untitled'}.md`);
    if (process.argv.includes('--refresh') || !existsSync(file)) {
      try {
        const res = await fetch(t.url, { headers: { 'User-Agent': 'Mozilla/5.0 (Taza Copilot research index)' }, signal: AbortSignal.timeout(20_000) });
        if (res.ok) {
          const text = pageText(await res.text());
          writeFileSync(file, `# ${t.title}\n\nSource: ${decodeURI(t.url)}\nDate: ${t.date}\nLanguage: ${t.lang}\nType: ${t.type}\n\n${text}\n`);
        } else console.warn(res.status, t.url);
      } catch (err) { console.warn('failed', t.url, err.message); }
      await sleep(250);
    }
    if (existsSync(file) && readFileSync(file, 'utf8').length > 600) kept++;
    if (++done % 25 === 0) console.log(`${done}/${items.length}`);
  }
}
const queue = [...items];
await Promise.all([1, 2, 3, 4].map(() => worker(queue)));
console.log(`pages ${items.length}, with text ${kept}`);
