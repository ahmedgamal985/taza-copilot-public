// End-to-end test of "Add research" (admin upload): starts a separate test server on port 8788 with a
// throw-away admin token and upload folder (the Telegram bot and pre-answering are off), then checks
// security, upload, indexing, answering from the new PDF, and removal. One AI answer: about $0.002.
//   node scripts/test-admin.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 8788, BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = randomBytes(24).toString('hex');
const tmp = mkdtempSync(join(tmpdir(), 'taza-admin-'));
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`); };

// A small real PDF with a text layer (a made-up test fact, so the answer can only come from this file)
function makePdf(lines) {
  const esc = s => s.replace(/[\\()]/g, m => '\\' + m);
  const content = `BT /F1 12 Tf 60 760 Td 16 TL ${lines.map(l => `(${esc(l)}) Tj T*`).join(' ')} ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objs.map((o, i) => { const at = Buffer.byteLength(pdf); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
const TITLE = 'Taza test report: cyclists and winter smog';
const PDF = makePdf([
  'TEST DOCUMENT for the Taza Copilot upload feature.',
  'Winter cycling in Almaty and the use of masks.',
  'The Taza test survey of winter cyclists in Almaty asked riders how they protect themselves',
  'from smog on cold mornings, when PM2.5 is usually at its highest in the city.',
  'The survey found that 87.3 percent of Almaty winter cyclists wear a mask on smoggy mornings.',
  'Most riders said they check the air quality map before leaving home, and many change',
  'their route to avoid the busiest roads. Riders in the northern districts reported the',
  'worst air, and riders in the southern districts near the mountains reported cleaner air.',
  'This document exists only to test that new research can be uploaded and cited.',
]);
const EMPTY_PDF = makePdf([' ']); // no readable text, like a scanned image

const req = (path, { method = 'GET', headers = {}, body } = {}) =>
  fetch(BASE + path, { method, headers, body }).then(async r => ({ status: r.status, headers: r.headers, data: await (r.headers.get('content-type') || '').includes('json') ? await r.json() : await r.arrayBuffer() }));
const upload = (body, meta = {}, headers = {}) => req('/api/admin/upload', { method: 'POST', body, headers: {
  'Content-Type': 'application/pdf', 'x-admin-token': TOKEN, 'x-doc-title': encodeURIComponent(meta.title ?? TITLE),
  'x-doc-lang': meta.lang ?? 'en', 'x-doc-date': meta.date ?? '2026-11-01', ...(meta.url ? { 'x-doc-url': encodeURIComponent(meta.url) } : {}), ...headers } });

// Start the test server
const server = spawn(process.execPath, ['--env-file-if-exists=../.env', 'server.mjs'], {
  cwd: join(here, '..'),
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ADMIN_TOKEN: TOKEN, UPLOAD_DIR: join(tmp, 'uploads'),
    LOG_FILE: join(tmp, 'log.jsonl'), TELEGRAM_BOT_TOKEN: '', PREWARM: 'off' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOut = '';
server.stdout.on('data', d => { serverOut += d; });
server.stderr.on('data', d => { serverOut += d; });
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break; } catch {} await new Promise(r => setTimeout(r, 250)); }

try {
  // ---- Security ----
  const page = await req('/admin.html');
  check('admin page is served', page.status === 200);
  check('no token → refused', (await req('/api/admin/uploads')).status === 401);
  check('wrong token → refused', (await req('/api/admin/uploads', { headers: { 'x-admin-token': 'wrong-token-123' } })).status === 401);
  check('upload without token → refused', (await upload(PDF, {}, { 'x-admin-token': '' })).status === 401);
  check('upload from another website → blocked', (await upload(PDF, {}, { Origin: 'https://evil.example' })).status === 403);
  check('upload with a non-PDF content type → blocked', (await upload(PDF, {}, { 'Content-Type': 'text/plain' })).status === 403);
  const notPdf = await upload(Buffer.from('<html><script>alert(1)</script></html>'));
  check('a file that is not a PDF → refused', notPdf.status === 400, notPdf.data.error);
  const big = await fetch(BASE + '/api/admin/upload', { method: 'POST', headers: { 'Content-Type': 'application/pdf', 'x-admin-token': TOKEN,
    'x-doc-title': 'Big file', 'x-doc-lang': 'en', 'Content-Length': String(31 * 1024 * 1024) }, body: Buffer.alloc(1024), duplex: 'half' }).then(r => r.status).catch(() => 413);
  check('file over 30 MB → refused before reading it', big === 413, `status ${big}`);
  check('missing title → refused', (await upload(PDF, { title: '' })).status === 400);
  check('unknown language → refused', (await upload(PDF, { lang: 'xx' })).status === 400);
  check('bad date → refused', (await upload(PDF, { date: '2026-13-45' })).status === 400);
  check('non-https public link → refused', (await upload(PDF, { url: 'javascript:alert(1)' })).status === 400);
  const empty = await upload(EMPTY_PDF);
  check('PDF without readable text (scanned) → refused with a clear message', empty.status === 400, empty.data.error);

  // ---- Upload and index ----
  const t0 = Date.now();
  const up = await upload(PDF, { title: `${TITLE} <b>bold</b>` });
  check('valid PDF uploaded and indexed', up.status === 200 && up.data.chunks > 0, `${up.data.pages} page, ${up.data.chunks} section in ${Date.now() - t0} ms`);
  check('title tags removed', up.status === 200 && !/[<>]/.test(up.data.title), up.data.title);
  const sm = up.data.summary;
  check('5-point summary written in English, Russian and Kazakh', sm && ['en', 'ru', 'kk'].every(l => sm[l]?.length === 5), sm ? `en: «${sm.en[0]}»` : 'none');
  check('summary keeps the report’s own number', sm && sm.en.some(p => /87[.,]3/.test(p)));
  const id = up.data.id;
  check('server-made file id (never the uploader\'s name)', /^up-[a-z0-9]+$/.test(id || ''), id);
  const list = await req('/api/admin/uploads', { headers: { 'x-admin-token': TOKEN } });
  check('listed on the admin page', list.status === 200 && list.data.some(d => d.id === id));
  const pdf = await req(`/research/${id}.pdf`);
  check('uploaded PDF opens from a source link', pdf.status === 200 && pdf.headers.get('content-type') === 'application/pdf');
  check('uploaded PDF is sandboxed (cannot run scripts on the site)', pdf.headers.get('content-security-policy') === 'sandbox');
  for (const p of ['/research/up-doesnotexist1.pdf', '/research/../server.mjs', '/research/%2e%2e%2fserver.mjs', `/research/${id}.txt`]) {
    check(`blocked: ${p}`, (await req(p)).status === 404);
  }
  const sources = await req('/api/sources');
  check('appears in the public sources list', sources.data.some(s => s.title === up.data.title));

  // ---- The copilot answers from it (one Haiku answer) ----
  const ans = await req('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'What share of Almaty winter cyclists wear a mask on smoggy mornings?', model: 'claude-haiku-5-5' }) });
  const cited = ans.data.sources?.find(s => s.title === up.data.title);
  check('answers from the new research with its quote', /87[.,]3/.test(ans.data.text || '') && Boolean(cited), `${(ans.data.ms / 1000).toFixed(1)} s, $${ans.data.cost_usd}`);
  check('source link opens the uploaded PDF on the page', cited && cited.url === `/research/${id}.pdf#page=1`, cited?.url);

  // ---- Remove ----
  const del = await req('/api/admin/delete', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-token': TOKEN }, body: JSON.stringify({ id }) });
  check('removed', del.status === 200);
  check('PDF link gone after removal', (await req(`/research/${id}.pdf`)).status === 404);
  check('gone from the sources', !(await req('/api/sources')).data.some(s => s.title === up.data.title));
  check('removing an unknown id → 404', (await req('/api/admin/delete', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-token': TOKEN }, body: JSON.stringify({ id: '../../.env' }) })).status === 404);

  // ---- Brute force: after 5 wrong tokens in a minute, the next ones are refused ----
  let last;
  for (let i = 0; i < 6; i++) last = await req('/api/admin/uploads', { headers: { 'x-admin-token': `guess-${i}` } });
  check('guessing the token is rate-limited', last.status === 429);
} finally {
  server.kill();
  rmSync(tmp, { recursive: true, force: true });
}
if (/Uncaught|Unhandled/.test(serverOut)) console.log('\nServer log:\n' + serverOut);
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
