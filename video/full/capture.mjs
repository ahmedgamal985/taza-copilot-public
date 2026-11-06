// Real screenshots of the live platform for the full motion video (part 1).
//   node video/full/capture.mjs [https://taza-copilot.online]   -> video/full/shots/*.png
// Asks 2 real questions (a few cents). Nothing here holds a key: the admin step is the tour's preview.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(process.env.MGTOOLS || 'C:/Users/ahmed.gamal_indriver/mgtools', 'package.json'));
const puppeteer = require('puppeteer');
const BASE = process.argv.find(a => /^https?:/.test(a)) || 'https://taza-copilot.online';
const out = join(here, 'shots'); mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: true, protocolTimeout: 120000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--force-color-profile=srgb'] });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('taza-tour-seen', '1'); localStorage.setItem('taza-lang', 'en'); } catch {} });
page.on('pageerror', e => console.log('pageerror:', e.message));
const shot = async (name, opts = {}) => { await sleep(opts.wait ?? 600); await page.screenshot({ path: join(out, name + '.png') }); console.log('shot', name); };
const waitFor = (sel, timeout = 30000) => page.waitForSelector(sel, { timeout }).catch(() => console.log('timeout', sel));
const go = async v => { await page.evaluate(v => window.taza.show(v), v); await sleep(400); };
const ask = async (q, mode = 'answer') => {
  await page.evaluate((q, mode) => { window.taza.show('ask'); document.querySelector(`[data-mode="${mode}"]`)?.click(); document.querySelector('#q').value = q; }, q, mode);
  await page.click('#askBtn');
  await page.waitForFunction(() => document.querySelector('#result .src') || document.querySelector('#result .error'), { timeout: 60000 }).catch(() => console.log('answer timeout'));
  await sleep(1500);
};

// ---------- Desktop, 1440×900 at 1.5× (crisp when zoomed) ----------
const REST = process.argv.includes('rest');
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
let briefUrl = null;
if (!REST) {
await page.goto(`${BASE}/?lang=en&tourmute`, { waitUntil: 'networkidle2' });
await sleep(1500);
await shot('home');

// A pre-answered home question (instant): the answer with its exact quotes
await page.evaluate(() => [...document.querySelectorAll('#suggest button')].at(-1)?.click());
await waitFor('#result .src');
await sleep(1800);
await page.evaluate(() => document.querySelector('#result').scrollIntoView({ block: 'start' }));
await shot('answer');
await page.evaluate(() => document.querySelector('#result .src')?.scrollIntoView({ block: 'center' }));
await shot('quote');
// The brief link of this answer
briefUrl = await page.evaluate(() => { let u = null; const o = window.open; window.open = x => { u = x; return null; }; document.querySelector('#result [data-act="brief"]')?.click(); window.open = o; return u; });

// Two AAI sources that disagree (1 November): both figures with their sources
await ask('What was the daily average PM2.5 in Almaty on 1 November 2026?');
await page.evaluate(() => document.querySelector('#result').scrollIntoView({ block: 'start' }));
await shot('differ');

// Check a claim
await ask('Almaty’s air got 50% cleaner in 2025', 'factcheck');
await page.evaluate(() => (document.querySelector('#result .verdict') || document.querySelector('#result')).scrollIntoView({ block: 'center' }));
await shot('check');

// Live map and a sensor's card
await go('map');
await waitFor('.leaflet-marker-icon'); await sleep(2500);
await shot('map');
await page.evaluate(async () => { const s = await window.taza.findStation({ pick: 'worst' }); if (s) { window.taza.focusStation(s); await new Promise(r => setTimeout(r, 1500)); await window.taza.openStation(s.id); } });
await sleep(3500);
await shot('station');
await page.evaluate(() => window.taza.closeStation());

for (const [v, sel] of [['outdoor', '#odOut .od-best'], ['compare', '#cpOut .cp-head'], ['schools', '#schoolsList li'], ['dashboard', '.stat.saved'], ['sources', '#sourceList li'], ['history', '#historyList > *'], ['ai', '#providerList > *'], ['widget', '#wdSite iframe']]) {
  await go(v); await waitFor(sel); await sleep(2000);
  if (v === 'dashboard') await page.evaluate(() => document.querySelector('#evalBox')?.scrollIntoView({ block: 'center' }));
  await shot(v);
  if (v === 'dashboard') { await page.evaluate(() => window.scrollTo(0, 0)); await shot('dashboard_top'); }
}
// The widget open inside the pretend website
const wf = await (await page.$('#wdSite iframe'))?.contentFrame();
if (wf) { await wf.evaluate(() => document.querySelector('.tw-launcher, button')?.click()); await sleep(2500); await page.evaluate(() => document.querySelector('#wdSite').scrollIntoView({ block: 'center' })); await shot('widget_open'); }

// The voice agent's panel on the map (the real UI, set to "speaking")
await go('map'); await sleep(2500);
await page.evaluate(() => {
  const fab = document.querySelector('.voice'); fab.classList.add('live'); fab.dataset.mode = 'speaking';
  fab.querySelector('.voice-panel').hidden = false;
  document.querySelector('#voiceState').textContent = 'Speaking';
  document.querySelector('#voiceLine').textContent = 'Taza: Turksib is the dirtiest district right now. Here it is on the map.';
});
await shot('voice');
await page.evaluate(() => { const fab = document.querySelector('.voice'); fab.classList.remove('live'); fab.querySelector('.voice-panel').hidden = true; });
} else {
  await page.goto(`${BASE}/?lang=en&tourmute`, { waitUntil: 'networkidle2' }); await sleep(1500);
  await page.evaluate(() => [...document.querySelectorAll('#suggest button')].at(-1)?.click());
  await waitFor('#result .src'); await sleep(1500);
  briefUrl = await page.evaluate(() => { let u = null; const o = window.open; window.open = x => { u = x; return null; }; document.querySelector('#result [data-act="brief"]')?.click(); window.open = o; return u; });
}

// The guided tour (muted) on the map step, and the admin page preview
await page.goto(`${BASE}/?lang=en&tourmute`, { waitUntil: 'networkidle2' }); await sleep(1500);
const stepOf = await page.evaluate(async () => (await fetch('tour/script.json', { cache: 'no-cache' }).then(r => r.json())).steps);
await page.evaluate(() => { window.tazaTour.start(); return 1; });
const jump = async name => { const i = stepOf.indexOf(name); for (let k = 0; k < 60 && (await page.evaluate(() => window.tazaTour.step)) < i; k++) { await page.evaluate(() => document.querySelector('.tour-bar [data-t="next"]').click()); await sleep(700); } };
await jump('dashboard'); await sleep(4500); await page.evaluate(() => window.taza.closeStation()); await sleep(800); await shot('tour');
await jump('admin'); await sleep(9500); await shot('admin');
await page.evaluate(() => window.tazaTour.stop());

// Brief (one page for decision makers)
if (briefUrl) { await page.goto(new URL(briefUrl, BASE).href, { waitUntil: 'networkidle2' }); await sleep(2500); await shot('brief'); }

// ---------- Phone, 390×844 at 2× ----------
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(`${BASE}/?lang=ru&tourmute`, { waitUntil: 'networkidle2' }); await sleep(2000);
await shot('m_home');
await page.goto(`${BASE}/?lang=kk&tourmute`, { waitUntil: 'networkidle2' }); await sleep(1500);
await page.evaluate(() => window.taza.show('map')); await sleep(3500);
await shot('m_map');
await browser.close();
console.log('done');
