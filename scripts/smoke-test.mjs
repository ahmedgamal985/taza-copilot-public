// Full feature and security test of a running Taza Copilot server (default http://localhost:8787).
// Uses only cached / free requests for the AI parts, so it costs (almost) nothing to run.
//   node scripts/smoke-test.mjs [baseUrl]
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

const BASE = process.argv[2] || 'http://localhost:8787';
const results = [];
// Behind a CDN (https), caching headers and HEAD handling belong to the CDN: those two checks are skipped
const CDN = BASE.startsWith('https:');
const skip = name => console.log(`⏭  ${name} — skipped behind the CDN`);
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`); };

// Raw request (lets us send paths fetch() would normalise, like "//" or "/%2e%2e/")
function raw(path, { method = 'GET', headers = {}, body } = {}) {
  const u = new URL(BASE);
  return new Promise(resolve => {
    const request = u.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = request({ host: u.hostname, port: u.port || undefined, method, path, headers: { 'User-Agent': 'taza-smoke-test', ...headers } }, res => {
      let data = ''; res.on('data', c => data += c); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', e => resolve({ status: 0, error: e.message }));
    if (body) req.write(body);
    req.end();
  });
}
const json = (path, body, headers = {}) => raw(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const timed = async fn => { const t = performance.now(); const r = await fn(); return [r, Math.round(performance.now() - t)]; };

// ---------- Pages and speed ----------
{
  const [r, ms] = await timed(() => raw('/', { headers: { 'Accept-Encoding': 'gzip' } }));
  check('home page loads', r.status === 200, `${ms} ms`);
  check('home page is compressed', ['gzip', 'br', 'zstd'].includes(r.headers['content-encoding']), r.headers['content-encoding']);
  check('Content-Security-Policy set', /default-src 'self'/.test(r.headers['content-security-policy'] || ''));
  check('X-Content-Type-Options nosniff', r.headers['x-content-type-options'] === 'nosniff');
  check('clickjacking blocked (X-Frame-Options)', r.headers['x-frame-options'] === 'DENY');
  check('Referrer-Policy set', Boolean(r.headers['referrer-policy']));
  check('microphone limited to this site', /microphone=\(self\)/.test(r.headers['permissions-policy'] || ''));
  check('no CORS opened', !r.headers['access-control-allow-origin']);
  const etag = r.headers.etag;
  const again = etag ? await raw('/', { headers: { 'If-None-Match': etag } }) : { status: 0 };
  if (CDN) skip('repeat visit served from browser cache (304)'); else check('repeat visit served from browser cache (304)', again.status === 304);
}
for (const f of ['/app.js', '/i18n.js', '/voice.js', '/style.css', '/vendor/leaflet.js', '/vendor/leaflet.css', '/guide-ollama.html']) {
  const r = await raw(f);
  check(`static ${f}`, r.status === 200);
}
{
  const r = await raw('/vendor/elevenlabs-client.js', { headers: { 'Accept-Encoding': 'gzip' } });
  check('voice SDK self-hosted, cached a day and gzipped', r.status === 200 && /max-age=86400/.test(r.headers['cache-control']) && r.headers['content-encoding'] === 'gzip', `${Math.round(r.body.length / 1024)} KB on the wire`);
}

// ---------- API features ----------
{
  const h = JSON.parse((await raw('/api/health')).body);
  check('health: AI and live data on', h.ai && h.live_data, `${h.docs} sources, ${h.pages} sections`);
  for (const l of ['en', 'ru', 'kk']) {
    const s = JSON.parse((await raw(`/api/suggested?lang=${l}`)).body);
    check(`suggested questions (${l})`, Array.isArray(s) && s.length === 3, s[0]);
  }
  const [live, ms] = await timed(async () => JSON.parse((await raw('/api/live')).body));
  check('live sensors', live.stations?.length > 100, `${live.stations?.length} sensors in ${ms} ms`);
  const id = live.stations?.[0]?.id;
  let st = JSON.parse((await raw(`/api/station/${id}`)).body);
  // AAI's API can take ~15 s the first time a sensor's history is asked for: the card opens with the
  // current reading at once (4 s cap) and the history is cached when it arrives, so ask once more
  let waited = '';
  if (!(st.series?.length > 5)) { await new Promise(r => setTimeout(r, 15_000)); st = JSON.parse((await raw(`/api/station/${id}`)).body); waited = ' (2nd try, AAI was slow)'; }
  check('sensor details (24h chart data)', st.series?.length > 5 && st.min != null, `${st.name}: ${st.pm25} µg/m³, ${st.series?.length} hours${waited}`);
  const src = JSON.parse((await raw('/api/sources')).body);
  check('sources list', src.length >= 90, `${src.length} sources`);
  const stats = JSON.parse((await raw('/api/stats')).body);
  check('accuracy dashboard', typeof stats.questions === 'number', `${stats.questions} questions, median ${stats.median_seconds} s`);
  const prov = JSON.parse((await raw('/api/providers')).body);
  check('providers list has no secrets', !JSON.stringify(prov).match(/sk-|key":"[A-Za-z0-9]{20}/), prov.map(p => `${p.id}:${p.ready ? 'ready' : 'off'}`).join(' '));
  const Q = 'How many cigarettes did an Almaty resident "smoke" in 2025?';
  await json('/api/ask', { question: Q }); // makes sure it is in the cache
  const [ans, ams] = await timed(async () => JSON.parse((await json('/api/ask', { question: Q })).body));
  check('ask (suggested, cached) answers instantly with sources', ans.found && ans.sources.length > 0 && ans.cached === true && ams < 1500, `${ams} ms, cached=${ans.cached}, ${ans.sources.length} sources`);
  check('answer is marked as an AI answer with exact quotes', ans.mode === 'ai' && ans.kind === 'answer');
  check('answer has exact quotes and page links', ans.sources.every(s => s.quote && /^https?:/.test(s.url)));
}

// ---------- Attacks from the security review ----------
{
  const r = await raw('//');
  check('crash request "//" handled', r.status === 400 || r.status === 404, `status ${r.status}`);
  const alive = await raw('/api/health');
  check('server still alive after it', alive.status === 200);
  for (const p of ['/../.env', '/%2e%2e/.env', '/..%2f..%2f.env', '/..%5c..%5c.env', '/%252e%252e/.env', '/..\\server.mjs', '/C:/Windows/win.ini',
    '/data/log.jsonl', '/../data/voice-agent.json', '/%00', '/public/../.env', '/vendor/../../server.mjs']) {
    const r2 = await raw(p);
    check(`path traversal blocked: ${p}`, r2.status === 404 || r2.status === 400, `status ${r2.status}`);
  }
  const bad = await raw('/%E0%A4%A');
  check('malformed % encoding handled', bad.status === 400, `status ${bad.status}`);
  const xsite = await raw('/api/ask', { method: 'POST', headers: { 'Content-Type': 'text/plain', Origin: 'https://evil.example' }, body: JSON.stringify({ question: 'test question here' }) });
  check('cross-site POST from another website blocked', xsite.status === 403, `status ${xsite.status}`);
  const xorigin = await json('/api/ask', { question: 'test question here' }, { Origin: 'https://evil.example' });
  check('JSON POST with foreign Origin blocked', xorigin.status === 403, `status ${xorigin.status}`);
  const opus = await json('/api/ask', { question: 'What is PM2.5?', model: 'claude-opus-5-5' });
  check('expensive model refused on the server key', opus.status === 400, JSON.parse(opus.body).error);
  const proto = await json('/api/ask', { question: 'What is PM2.5?', provider: '__proto__' });
  check('provider "__proto__" refused', proto.status === 400);
  const ctor = await json('/api/models', { provider: 'constructor' });
  check('provider "constructor" refused', ctor.status === 400);
  const badjson = await raw('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
  check('invalid JSON → 400, no crash', badjson.status === 400, `status ${badjson.status}`);
  const big = await raw('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'x'.repeat(20_000) }) });
  check('oversized body refused', big.status === 413, `status ${big.status}`);
  const del = await raw('/api/ask', { method: 'DELETE' });
  check('unknown method refused', del.status === 405, `status ${del.status}`);
  const nf = await raw('/api/nothing');
  check('unknown API route → 404', nf.status === 404);
  // Second review
  for (const p of ['/VENDOR/leaflet.js', '/vendor/LEAFLET.js', '/vendor/leaflet.js::$DATA', '/Index.html', '/vendor/']) {
    const r2 = await raw(p);
    check(`only exact file names served: ${p}`, r2.status === 404, `status ${r2.status}`);
  }
  const ctorLang = await raw('/api/suggested?lang=constructor');
  check('suggested ?lang=constructor handled', ctorLang.status === 200, `status ${ctorLang.status}`);
  const fakeStation = await raw('/api/station/999999999');
  check('unknown sensor id never reaches the AAI API', fakeStation.status === 404, `status ${fakeStation.status}`);
  const pub = JSON.parse((await raw('/api/stats')).body);
  check('unanswered questions are private (count only)', pub.unanswered === undefined, `count ${pub.unanswered_count ?? 0}`);
  const head = await raw('/vendor/elevenlabs-client.js', { method: 'HEAD', headers: { 'Accept-Encoding': 'gzip' } });
  if (CDN) skip('HEAD request is not compressed'); else check('HEAD request is not compressed', head.status === 200 && !head.headers['content-encoding']);
  const csp = (await raw('/')).headers['content-security-policy'] || '';
  check('CSP allows only one exact jsDelivr file', !/cdn\.jsdelivr\.net[ ;"]/.test(csp) && /libsamplerate\.worklet\.js/.test(csp));
  // ---- New features: accuracy test, share, brief, feedback, schools, live summary, widget, admin ----
  for (const f of ['/brief.html', '/brief.js', '/print.js', '/admin.html', '/admin.js', '/widget.js', '/widget.html', '/widget-frame.js', '/widget-demo.html']) {
    check(`static ${f}`, (await raw(f)).status === 200);
  }
  // Print works on phones too: both print buttons go through print.js (waits for afterprint, explains when it can't print)
  check('print helper loaded on home and brief', /print\.js/.test((await raw('/')).body) && /print\.js/.test((await raw('/brief.html')).body));
  const ev = JSON.parse((await raw('/api/eval')).body);
  check('accuracy test results published, 100%', ev.available && ev.total >= 44 && ev.passed === ev.total, `${ev.passed}/${ev.total} (${ev.accuracy_pct}%) on ${ev.model}`);
  const airS = JSON.parse((await raw('/api/air')).body);
  check('live summary for brief and widget', airS.available && airS.city?.pm25 > 0 && airS.districts.length > 0, `${airS.city?.pm25} µg/m³, ${airS.districts.length} districts, ${airS.days?.length} days`);
  const sch = JSON.parse((await raw('/api/schools')).body);
  check('schools ranking', sch.available && sch.total > 30 && sch.schools[0].pm25 >= sch.schools.at(-1).pm25, `${sch.total} sensors, ${sch.above_who} above WHO, ${sch.above_kz} above KZ limit`);
  const a1 = JSON.parse((await json('/api/ask', { question: 'How many cigarettes did an Almaty resident "smoke" in 2025?' })).body);
  check('every answer gets an id', /^[A-Za-z0-9_-]{12}$/.test(a1.id || ''), a1.id);
  const sh = await json('/api/share', { id: a1.id });
  const shId = JSON.parse(sh.body).id;
  check('share an answer', sh.status === 200 && shId === a1.id);
  const got = JSON.parse((await raw(`/api/answer/${shId}`)).body);
  check('shared link returns the copilot\'s own text and quotes', got.text === a1.text && got.sources.length === a1.sources.length);
  check('shared answer holds no IP, cost or timing', !('own_key' in got) && !('cost_usd' in got) && !('ms' in got));
  check('cannot share a made-up answer id (no forged answers)', (await json('/api/share', { id: 'AAAAAAAAAAAA' })).status === 404);
  check('cannot share a non-id', (await json('/api/share', { id: '../../etc' })).status === 400);
  check('unknown shared answer → 404', (await raw('/api/answer/ZZZZZZZZZZZZ')).status === 404);
  check('malformed answer id → 404', (await raw('/api/answer/..%2f..%2fserver')).status === 404);
  check('feedback 👍 on a real answer', (await json('/api/feedback', { id: a1.id, vote: 'up' })).status === 200);
  check('feedback undo', (await json('/api/feedback', { id: a1.id, vote: null })).status === 200);
  check('feedback with a bad vote → 400', (await json('/api/feedback', { id: a1.id, vote: 'love' })).status === 400);
  check('feedback on a made-up answer → 404', (await json('/api/feedback', { id: 'BBBBBBBBBBBB', vote: 'up' })).status === 404);
  const stats2 = JSON.parse((await raw('/api/stats')).body);
  check('dashboard has feedback numbers', typeof stats2.feedback?.up === 'number');
  const wg = await raw('/widget.html');
  check('widget can be embedded by other https sites', !wg.headers['x-frame-options'] && /frame-ancestors 'self' https:/.test(wg.headers['content-security-policy'] || ''));
  const home = await raw('/');
  check('every other page still refuses to be framed', home.headers['x-frame-options'] === 'DENY' && /frame-ancestors 'none'/.test(home.headers['content-security-policy']));
  check('admin API off or locked without a token', [401, 403].includes((await raw('/api/admin/uploads')).status));
  check('admin upload from another site blocked', (await raw('/api/admin/upload', { method: 'POST', headers: { 'Content-Type': 'application/pdf', Origin: 'https://evil.example' }, body: '%PDF-1.4' })).status === 403);
  for (const p of ['/research/../server.mjs', '/research/up-zzzzzzzz.pdf', '/research/x.pdf', '/data/shared.json', '/data/uploads/uploads.json', '/data/eval-results.json', '/data/tg-alerts.json',
    '/data/tg-places.json', '/data/tg-groups.json']) {
    check(`blocked: ${p}`, (await raw(p)).status === 404);
  }
  // ---- Time saved, claim check, research gaps, tour ----
  const st3 = JSON.parse((await raw('/api/stats')).body);
  check('time saved (the track’s metric) on the dashboard', st3.time_saved?.hours >= 0 && st3.time_saved?.manual_minutes > 0, `${st3.time_saved?.hours} h from ${st3.time_saved?.sourced_answers} sourced answers`);
  check('unknown answer mode refused', (await json('/api/ask', { question: 'What is PM2.5?', mode: 'jailbreak' })).status === 400);
  check('research gaps are for the AAI team only', [401, 403].includes((await raw('/api/admin/gaps')).status));
  for (const f of ['/tour.js', '/tour/script.json', '/tour/en-hello.mp3', '/tour/ru-you.mp3', '/tour/kk-compare.mp3', '/tour/en-groups.mp3']) check(`tour file ${f}`, (await raw(f)).status === 200);
  // ---- Accuracy, compare mode, best time to go out, installable app ----
  const cmp = await raw('/api/compare?type=districts&a=Turksib&b=Bostandyq&year=2025');
  const cj = cmp.status === 200 ? JSON.parse(cmp.body) : {};
  check('compare two districts (2025): Turksib about 2× Bostandyk, as in AAI\'s report', cj.days === 365 && cj.ratio > 1.9 && cj.ratio < 2.3, `${cj.a?.avg} vs ${cj.b?.avg} µg/m³, ×${cj.ratio}`);
  const cy = await raw('/api/compare?type=years&a=2026&b=2025');
  check('compare two years (same calendar days)', cy.status === 200 && JSON.parse(cy.body).days > 200, `${cy.status}`);
  const cc = await raw('/api/compare?type=cities&b=lahore');
  check('compare Almaty with another city', cc.status === 200 && JSON.parse(cc.body).b?.label === 'Lahore', `${cc.status}`);
  check('compare refuses bad input', (await raw('/api/compare?type=districts&a=Turksib&b=%3Cscript%3E&year=2025')).status === 400
    && (await raw('/api/compare?type=years&a=2025&b=2025')).status === 400 && (await raw('/api/compare?type=nope')).status === 400);
  const od = await raw('/api/outdoor');
  const oj = od.status === 200 ? JSON.parse(od.body) : {};
  check('best time to go out: a 2-hour daytime window', oj.best?.to - oj.best?.from === 2 && oj.best.from >= 6 && oj.worst && oj.hours?.length === 24, `${oj.day} ${oj.best?.from}:00–${oj.best?.to}:00, avoid ${oj.worst?.from}:00`);
  const mf = await raw('/manifest.webmanifest');
  const mj = mf.status === 200 ? JSON.parse(mf.body) : {};
  check('installable app: manifest', /manifest\+json/.test(mf.headers['content-type'] || '') && mj.display === 'standalone' && mj.icons?.some(i => i.sizes === '512x512' && i.purpose === 'maskable'));
  const sw = await raw('/sw.js');
  check('installable app: service worker never stores the API', sw.status === 200 && /\/api\//.test(sw.body) && /javascript/.test(sw.headers['content-type'] || ''));
  for (const f of ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png']) check(`app icon ${f}`, (await raw(f)).status === 200);
  // ---- Taza for inDrive, the search API for other assistants, the video, WhatsApp, the full tour ----
  const pb = await raw('/api/partner/brief?lang=ru');
  const pj = pb.status === 200 ? JSON.parse(pb.body) : {};
  check('inDrive brief: both roles, push rule, AAI source, open to partner apps', pj.available && pj.driver?.title && pj.rider?.tips?.length && typeof pj.send_push === 'boolean'
    && pj.driver?.jam?.body && pj.source?.page === 5 && pb.headers['access-control-allow-origin'] === '*', `push ${pj.send_push}, ${pj.air?.pm25} µg/m³`);
  const pp = await raw('/api/partner/brief?lang=en&lat=43.2398&lng=76.9455');
  const ppj = pp.status === 200 ? JSON.parse(pp.body) : {};
  check('inDrive brief with a point: air at the pickup and a break spot, never cached', ppj.rider?.pickup?.pm25 != null && ppj.driver?.break_spot?.text && /no-store/.test(pp.headers['cache-control'] || ''), ppj.rider?.pickup?.sensor);
  const pc = JSON.parse((await raw('/api/partner/brief?lang=en&lat=30.04&lng=31.23')).body);
  check('inDrive brief ignores a point outside Almaty', pc.available && !pc.rider?.pickup && !pc.driver?.break_spot);
  const pr = JSON.parse((await raw('/api/partner/brief?lang=kk&role=rider')).body);
  check('inDrive brief: one role on request', pr.rider && !pr.driver && pr.lang === 'kk');
  const se = await raw(`/api/search?q=${encodeURIComponent('cigarettes 2025|сигарет 2025')}&lang=en`);
  const sj = se.status === 200 ? JSON.parse(se.body) : {};
  check('search API: AAI passages with title and link, the 518 cigarettes found', sj.found > 0 && sj.results.every(r => r.title && /^https:\/\//.test(r.url)) && sj.results.some(r => /518/.test(r.text)));
  check('search API: nothing for off-topic, 400 for empty', JSON.parse((await raw('/api/search?q=pizza%20recipe')).body).found === 0 && (await raw('/api/search?q=')).status === 400);
  const vr = await raw('/video/taza-indrive.mp4', { headers: { Range: 'bytes=0-1' } });
  check('concept video: byte ranges for phones', vr.status === 206 && /^bytes 0-1\//.test(vr.headers['content-range'] || '') && /video\/mp4/.test(vr.headers['content-type'] || ''));
  check('concept video: poster', (await raw('/video/taza-indrive.jpg')).status === 200);
  const page = (await raw('/')).body;
  check('WhatsApp button on the home page and in the menu', /id="waHome"[^>]*wa\.me\/201509000921/.test(page) && /id="waLink"[^>]*wa\.me\/201509000921/.test(page));
  const tour = JSON.parse((await raw('/tour/script.json')).body);
  check('guided tour covers every part (22 steps, 3 languages, a clip each)', tour.steps.length >= 22 && ['en', 'ru', 'kk'].every(l => tour[l].length === tour.steps.length && tour.steps.every(s => tour.audio[`${l}-${s}`]))
    && ['whatsapp', 'indrive', 'admin', 'compare', 'outdoor', 'telegram', 'widget'].every(s => tour.steps.includes(s)), `${tour.steps.length} steps`);
  for (const f of ['/tour/en-whatsapp.mp3', '/tour/ru-indrive.mp3', '/tour/kk-sources.mp3']) check(`tour file ${f}`, (await raw(f)).status === 200);
  // Rate limit: 13 quick invalid questions (no AI cost) → the 13th is refused
  let last;
  for (let i = 0; i < 13; i++) last = await json('/api/ask', { question: 'x' });
  check('per-IP rate limit on questions', last.status === 429, `13th request: ${last.status}`);
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
