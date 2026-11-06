// One screenshot of the page the race is recorded on, to check the layout before recording.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(process.env.MGTOOLS || 'C:/Users/ahmed.gamal_indriver/mgtools', 'package.json'));
const puppeteer = require('puppeteer');
const BASE = process.argv[2] || 'http://localhost:8790';
mkdirSync(join(here, 'out'), { recursive: true });
const b = await puppeteer.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1.5 });
await p.goto(`${BASE}/?lang=en`, { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 1500));
await p.screenshot({ path: join(here, 'out', 'peek.png') });
console.log(await p.evaluate(() => ({ q: !!document.querySelector('#q'), btn: !!document.querySelector('#askBtn'), dialogs: [...document.querySelectorAll('[role=dialog],.modal,.toast')].filter(e => e.offsetParent).length })));
await b.close();
