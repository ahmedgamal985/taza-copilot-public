// Records the race in real time: the five questions Tengrinews sent AAI on 2 November 2026, asked one after
// another on a Taza server whose index holds only AAI's published reports and articles (no media answers).
// Nothing is sped up: out/race.webm is the screen as it happened, and out/race.json has the moment of
// every submit, first word and finished answer, measured from the start of the recording.
//   node video/race/capture.mjs http://localhost:8790
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(process.env.MGTOOLS || 'C:/Users/ahmed.gamal_indriver/mgtools', 'package.json'));
const puppeteer = require('puppeteer');
const FF = require('ffmpeg-static');
const BASE = process.argv[2] || 'http://localhost:8790';
const PREFIX = process.argv[3] || ''; // for a retake: questions already asked are answered from the cache
const out = join(here, 'out'); mkdirSync(out, { recursive: true });

export const QUESTIONS = [
  'Как вы оцениваете текущую ситуацию с качеством воздуха в Алматы? Наблюдается ли ухудшение по сравнению с предыдущими годами?',
  'Какие основные источники загрязнения воздуха в городе? Какую долю вносят автомобили, ТЭЦ и частный сектор?',
  'Почему с наступлением холодов в Алматы усиливается смог? Насколько это связано с началом отопительного сезона?',
  'Насколько эффективны меры, которые сейчас принимаются для улучшения качества воздуха, например LEZ? Что необходимо сделать в первую очередь?',
  'Какие рекомендации вы бы дали жителям Алматы в дни сильного смога, чтобы снизить риски для здоровья?',
];
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1.5 });
await page.goto(`${BASE}/?lang=en`, { waitUntil: 'networkidle2' });
await sleep(1200);
const toForm = (smooth = false) => page.evaluate(s => {
  const f = document.querySelector('#askForm');
  window.scrollTo({ top: f.getBoundingClientRect().top + scrollY - 70, behavior: s ? 'smooth' : 'instant' });
}, smooth);
await toForm();
await sleep(500);

const rec = await page.screencast({ path: join(out, 'race.webm'), ffmpegPath: FF });
const t0 = Date.now();
const rel = () => +((Date.now() - t0) / 1000).toFixed(3);
const log = [];
await sleep(1500);
for (const [i, q] of QUESTIONS.entries()) {
  const item = { n: i + 1 };
  // empty the box completely (a triple-click does not select a wrapped textarea), then type the question
  await page.$eval('#q', el => { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.focus('#q');
  item.typing = rel();
  await page.type('#q', PREFIX + q, { delay: 0 });
  const sent = await page.$eval('#q', el => el.value);
  if (sent !== PREFIX + q) throw new Error(`Q${i + 1}: the box holds something else than the question`);
  await sleep(250);
  item.submit = rel();
  await page.click('#askBtn');
  await page.waitForFunction(() => { const b = document.querySelector('#result .answer.streaming'); return b && !b.hidden; }, { timeout: 60000, polling: 50 }).catch(() => {});
  item.first_words = rel();
  await page.waitForFunction(() => !document.querySelector('#askBtn').disabled && document.querySelector('#result .src'), { timeout: 90000, polling: 50 });
  item.done = rel();
  item.answer = await page.evaluate(() => ({
    text: document.querySelector('#result .text, #result .answer')?.innerText.slice(0, 1500) || '',
    sources: [...document.querySelectorAll('#result .src')].map(s => s.querySelector('.row')?.innerText.replace(/\s+/g, ' ').slice(0, 160)),
  }));
  // show the sources for a moment, then go back up for the next question
  await page.evaluate(() => { const s = document.querySelector('#result .src'); if (s) window.scrollTo({ top: s.getBoundingClientRect().top + scrollY - 260, behavior: 'smooth' }); });
  await sleep(1600);
  await toForm(true);
  await sleep(700);
  item.next = rel();
  log.push(item);
  console.log(`Q${item.n}: submit ${item.submit}s, first words ${item.first_words}s, done ${item.done}s (${(item.done - item.submit).toFixed(1)} s), ${item.answer.sources.length} sources`);
}
await sleep(800);
await rec.stop();
const total = rel();
writeFileSync(join(out, 'race.json'), JSON.stringify({ base: BASE, recorded_at: new Date().toISOString(), total, questions: log }, null, 1));
await browser.close();
console.log('recorded', total, 's; first submit', log[0].submit, 's; last answer done', log.at(-1).done, 's; all five took', (log.at(-1).done - log[0].submit).toFixed(1), 's');
