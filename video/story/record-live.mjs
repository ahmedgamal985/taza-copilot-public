// Screen recording of the live platform answering the six questions Tengrinews sent AAI on 2 November 2026
// (the same wording, in Russian). Frames come from Chrome's own screencast with their timestamps; the time of each
// answer is the one the page itself shows ("Ответ за N с"). Run right after a deploy, so nothing comes from the cache.
//   node video/story/record-live.mjs   -> video/story/live/frames/*.jpg + live/live.json
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(process.env.MGTOOLS || 'C:/Users/ahmed.gamal_indriver/mgtools', 'package.json'));
const puppeteer = require('puppeteer');
const BASE = process.env.CAPTURE_BASE || 'https://taza-copilot.online';
const dir = join(here, 'live'), fdir = join(dir, 'frames');
rmSync(fdir, { recursive: true, force: true }); mkdirSync(fdir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// From "AAI answers to Tengrinews on Almaty air, 2 November 2026" (aai-research/web/press): the journalist's six questions
const QUESTIONS = [
  'Как вы оцениваете текущую ситуацию с качеством воздуха в Алматы? Насколько серьезно загрязнение и наблюдается ли ухудшение по сравнению с предыдущими годами?',
  'Какие основные источники загрязнения воздуха в городе? Какую долю вносят автомобили, ТЭЦ и частный сектор?',
  'Как сейчас обстоит ситуация с алматинскими ТЭЦ? Насколько сильно их выбросы влияют на качество воздуха и какие меры необходимо принять, чтобы снизить загрязнение?',
  'Почему с наступлением холодов в Алматы усиливается смог? Насколько это связано с началом отопительного сезона?',
  'Насколько эффективны меры, которые сейчас принимаются для улучшения качества воздуха, например LEZ? Что необходимо сделать в первую очередь?',
  'Какие рекомендации вы бы дали жителям Алматы в дни сильного смога, чтобы снизить риски для здоровья?',
];

const browser = await puppeteer.launch({ headless: true, protocolTimeout: 300000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--force-color-profile=srgb', '--mute-audio'] });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('taza-tour-seen', '1'); localStorage.setItem('taza-lang', 'ru'); } catch {} });
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
await page.goto(`${BASE}/?lang=ru&tourmute`, { waitUntil: 'networkidle2' });
await sleep(2000);

const cdp = await page.target().createCDPSession();
const frames = [];
let t0 = null, n = 0;
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  const t = metadata.timestamp; if (t0 == null) t0 = t;
  const file = `f${String(++n).padStart(5, '0')}.jpg`;
  writeFileSync(join(fdir, file), Buffer.from(data, 'base64'));
  frames.push({ t: +(t - t0).toFixed(3), file });
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: 2160, maxHeight: 1350, everyNthFrame: 1 });
// frame timestamps are wall-clock seconds, so page events are placed on the same clock
await sleep(600);
const now = () => Date.now() / 1000 - t0;

const qs = [];
for (const [k, q] of QUESTIONS.entries()) {
  await page.evaluate(() => { window.scrollTo(0, 0); window.taza.show('ask'); document.querySelector('[data-mode="answer"]')?.click(); const el = document.querySelector('#q'); el.value = ''; el.focus(); });
  await sleep(500);
  const typeAt = now();
  await page.type('#q', q, { delay: 14 });
  await sleep(300);
  const askAt = now();
  await page.click('#askBtn');
  await page.waitForFunction(() => document.querySelector('#result .src') || document.querySelector('#result .error'), { timeout: 120000 });
  const doneAt = now();
  await sleep(400);
  const shown = await page.evaluate(() => document.querySelector('#result .fast')?.textContent?.trim() || '');
  const secs = +(shown.match(/(\d+(?:[.,]\d+)?)/)?.[1] || '0').replace(',', '.');
  const cached = !/\d/.test(shown);
  // show the answer and its first sources for a moment, as a person would read it
  await page.evaluate(() => document.querySelector('#result')?.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, -120));
  await sleep(1800);
  const sources = await page.evaluate(() => document.querySelectorAll('#result .src').length);
  const endAt = now();
  qs.push({ n: k + 1, q, typeAt: +typeAt.toFixed(2), askAt: +askAt.toFixed(2), doneAt: +doneAt.toFixed(2), endAt: +endAt.toFixed(2), shown, secs, cached, sources });
  console.log(`${k + 1}. ${shown} · ${sources} sources · wall ${(doneAt - askAt).toFixed(1)} s${cached ? ' · CACHED' : ''}`);
}
await cdp.send('Page.stopScreencast');
await browser.close();
const total = +qs.reduce((a, x) => a + x.secs, 0).toFixed(1);
const say = `Six answers, every one with its sources, in ${Math.round(total)} seconds in all.`;
writeFileSync(join(dir, 'live.json'), JSON.stringify({ recorded: new Date().toISOString(), base: BASE, total, say, questions: qs, frames }, null, 1));
console.log(`total ${total} s · ${frames.length} frames · ${qs.some(x => x.cached) ? 'SOME CACHED: re-run after a restart' : 'all fresh'}`);
