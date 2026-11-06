// Real screenshots for the story video: the live platform, and the admin page on a local run with a test token.
//   node --env-file=../.env.video video/story/capture.mjs [live|admin]   -> video/story/shots/*.png
// The live questions were asked before (fetch-answers.mjs), so their answers come from the cache. No key is used on
// the live site; the admin page is filmed on localhost:8790 with the test token from ../.env.video.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(process.env.MGTOOLS || 'C:/Users/ahmed.gamal_indriver/mgtools', 'package.json'));
const puppeteer = require('puppeteer');
const LIVE = process.env.CAPTURE_BASE || 'https://taza-copilot.online', LOCAL = 'http://localhost:8790';
const out = join(here, 'shots'); mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const only = process.argv[2];

const browser = await puppeteer.launch({ headless: true, protocolTimeout: 180000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--force-color-profile=srgb', '--mute-audio'] });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('taza-tour-seen', '1'); localStorage.setItem('taza-lang', 'en'); } catch {} });
page.on('pageerror', e => console.log('pageerror:', e.message));
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
const shot = async (name, wait = 700) => { await sleep(wait); await page.screenshot({ path: join(out, name + '.png') }); console.log('shot', name); };
const waitFor = (sel, timeout = 40000) => page.waitForSelector(sel, { timeout }).catch(() => console.log('timeout', sel));
const go = async v => { await page.evaluate(v => window.taza.show(v), v); await sleep(500); };
const ask = async (q, mode = 'answer') => {
  await page.evaluate((q, mode) => { window.taza.show('ask'); document.querySelector(`[data-mode="${mode}"]`)?.click(); document.querySelector('#q').value = q; }, q, mode);
  await page.click('#askBtn');
  await page.waitForFunction(() => document.querySelector('#result .src') || document.querySelector('#result .error'), { timeout: 90000 }).catch(() => console.log('answer timeout'));
  await sleep(2000);
};

if (!only || only === 'live') {
  await page.goto(`${LIVE}/?lang=en&tourmute`, { waitUntil: 'networkidle2' }); await sleep(1500);
  await shot('home');
  // Dana's question: the answer, then its exact quotes
  await ask('Did Almaty\'s air really get cleaner in 2025?');
  await page.evaluate(() => { document.querySelector('#result').scrollIntoView({ block: 'start' }); window.scrollBy(0, -110); }); await shot('answer');
  await page.evaluate(() => document.querySelector('#result .src')?.scrollIntoView({ block: 'center' })); await shot('quote');
  const briefUrl = await page.evaluate(() => { let u = null; const o = window.open; window.open = x => { u = x; return null; }; document.querySelector('#result [data-act="brief"]')?.click(); window.open = o; return u; });
  // A claim checked
  await ask('Almaty\'s air got 50% cleaner in 2025', 'factcheck');
  await page.evaluate(() => (document.querySelector('#result .verdict') || document.querySelector('#result')).scrollIntoView({ block: 'center' })); await shot('check');
  // Compare: another city, and two districts
  await go('compare');
  await page.evaluate(() => window.taza.compare('cities', 'almaty', 'kathmandu')); await sleep(2500); await shot('compare_city');
  await page.evaluate(() => window.taza.compare('districts', 'Turksib', 'Bostandyq', 2025)); await sleep(2500); await shot('compare_dist');
  // Live map, schools, best time, history, sources, AI model, widget
  await go('map'); await waitFor('.leaflet-marker-icon'); await sleep(3000); await shot('map');
  for (const [v, sel] of [['schools', '#schoolsList li'], ['outdoor', '#odOut .od-best'], ['history', '#historyList > *'], ['sources', '#sourceList li'], ['ai', '#providerList > *'], ['widget', '#wdSite iframe']]) {
    await go(v); await waitFor(sel); await sleep(2200); await shot(v);
  }
  // Accuracy dashboard: the numbers at the top, then the test
  await go('dashboard'); await waitFor('.stat.saved'); await sleep(2500);
  await page.evaluate(() => window.scrollTo(0, 0)); await shot('dash_top');
  await page.evaluate(() => document.querySelector('#evalBox')?.scrollIntoView({ block: 'start' })); await shot('dash_eval');
  if (briefUrl) { await page.goto(new URL(briefUrl, LIVE).href, { waitUntil: 'networkidle2' }); await sleep(2500); await shot('brief'); }
}

if (only === 'voice') {
  // The voice agent's panel on the map: the real UI in its "speaking" state, with the agent's answer built from the
  // live district numbers at the moment of filming (the agent itself is not called: no cost, no microphone)
  const air = await (await fetch(`${LIVE}/api/partner/brief?lang=en`)).json();
  const w = air.air.worst_district;
  await page.goto(`${LIVE}/?lang=en&tourmute`, { waitUntil: 'networkidle2' }); await sleep(1500);
  await page.evaluate(d => window.taza.showMap(d), w.district); await waitFor('.leaflet-marker-icon'); await sleep(3500);
  await page.evaluate(line => {
    const fab = document.querySelector('.voice'); fab.classList.add('live'); fab.dataset.mode = 'speaking';
    fab.querySelector('.voice-panel').hidden = false;
    document.querySelector('#voiceState').textContent = 'Speaking';
    document.querySelector('#voiceLine').textContent = line;
  }, `Taza: right now ${w.district} has the dirtiest air, PM2.5 ${w.pm25} µg/m³. Here it is on the map.`);
  await shot('voice', 1200);
  await browser.close(); console.log('done'); process.exit(0);
}

if (only !== 'live') {
  const token = process.env.ADMIN_TOKEN;
  if (!token?.startsWith('video-')) throw new Error('run with --env-file=../.env.video (the test token)');
  await page.goto(`${LOCAL}/admin.html?lang=en`, { waitUntil: 'networkidle2' }); await sleep(800);
  await page.type('#token', token); await page.click('#signin button[type="submit"]');
  await waitFor('#panel:not([hidden])'); await sleep(1500);
  const input = await page.$('#file');
  await input.uploadFile(join(here, '..', '..', '..', 'aai-research', 'pdf', '2026-03-10 Отношения населения к внедрению LEZ в Алматы англ.pdf'));
  await page.evaluate(() => {
    const set = (s, v) => { const el = document.querySelector(s); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    set('#title', 'How Almaty residents see a low emission zone (LEZ)'); set('#date', '2026-03-10'); set('#link', 'https://air.org.kz/');
    const l = document.querySelector('#lang'); l.value = 'en'; l.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#notify').checked = true;
    document.querySelector('#upload').scrollIntoView({ block: 'start' });
  });
  await shot('admin_form');
  // the summary is not sent from this local run (no bot), so the box is unticked before the real upload
  await page.evaluate(() => { document.querySelector('#notify').checked = false; });
  await page.click('#uploadBtn');
  await page.waitForFunction(() => /Added|Добавлено|Қосылды/.test(document.querySelector('#uploadMsg')?.textContent || ''), { timeout: 120000 }).catch(() => console.log('upload timeout'));
  await sleep(1500); await page.evaluate(() => document.querySelector('#uploadMsg').scrollIntoView({ block: 'center' })); await shot('admin_done');
  await page.evaluate(() => document.querySelector('#lib').scrollIntoView({ block: 'start' })); await shot('admin_lib');
  await page.evaluate(() => document.querySelector('#srcList').scrollIntoView({ block: 'center' })); await shot('admin_src');
}
await browser.close();
console.log('done');
