// Taza Copilot server: the web platform, the ask API, live data for the map, and the Telegram bot.
// Run: npm start   (reads keys from ../.env, never sends them to the browser)
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync, statSync, readdirSync, renameSync, createReadStream } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { loadIndex, search, tokenize } from './lib/search.mjs';
import { ask, groupGaps, summarizeResearch } from './lib/copilot.mjs';
import { getStations, getStationDetail, hasAaiKey, warm, airSummary, compareAir, outdoorPlan } from './lib/aai.mjs';
import { listProviders, listModels, PROVIDERS } from './lib/providers.mjs';
import { startTelegram } from './lib/telegram.mjs';
import { partnerBrief, inAlmaty } from './lib/partner.mjs';
import { hasStt, transcribe } from './lib/stt.mjs';
import { createUploads, isUploadId, LANGS, MAX_PDF_BYTES } from './lib/uploads.mjs';
import { timingSafeEqual, createHash, randomBytes } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(here, 'public');
const PORT = Number(process.env.PORT || 8787);
const CHUNKS = join(here, 'data', 'chunks.json');
// Research uploaded by the AAI team is layered on top of the base index (see lib/uploads.mjs)
const uploads = createUploads(process.env.UPLOAD_DIR || join(here, 'data', 'uploads'));
let index = loadIndex(CHUNKS, uploads.corpus());
const LOG = process.env.LOG_FILE || join(here, 'data', 'log.jsonl');
mkdirSync(join(here, 'data'), { recursive: true });

// A crash in one request must never take the whole server down
process.on('unhandledRejection', err => console.error('Unhandled rejection:', err?.stack || err));
process.on('uncaughtException', err => console.error('Uncaught exception:', err?.stack || err));

// ---------- Responses: security headers, gzip, caching ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.jpg': 'image/jpeg',
  '.webmanifest': 'application/manifest+json; charset=utf-8' };

const CSP = [
  "default-src 'self'",
  // Only one exact file from jsDelivr: an audio worklet the voice SDK may load
  "script-src 'self' blob: https://cdn.jsdelivr.net/npm/@alexanderolsen/libsamplerate-js@2.1.2/dist/libsamplerate.worklet.js",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
  "media-src 'self' blob: data:",
  "connect-src 'self' https://api.elevenlabs.io wss://api.elevenlabs.io https://*.elevenlabs.io wss://*.elevenlabs.io https://*.livekit.cloud wss://*.livekit.cloud",
  "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
].join('; ');
// Which websites may embed the widget: WIDGET_ORIGINS (space-separated, e.g. "https://air.org.kz"), by default any https site
const WIDGET_ANCESTORS = (process.env.WIDGET_ORIGINS || 'https:').split(/\s+/).filter(o => /^(https:|https:\/\/[\w.-]+(:\d+)?)$/.test(o)).join(' ') || 'https:';
const WIDGET_CSP = CSP.replace("frame-ancestors 'none'", `frame-ancestors 'self' ${WIDGET_ANCESTORS}`);
const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'microphone=(self), geolocation=(), camera=()',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

const COMPRESSIBLE = /json|text|javascript|css|svg|manifest/;
const wantsGzip = req => /\bgzip\b/.test(req.headers['accept-encoding'] || '');

function send(req, res, status, body, type = 'application/json; charset=utf-8', extra = {}, gz = null) {
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const headers = { 'Content-Type': type, 'Cache-Control': 'no-store', ...SECURITY, ...extra };
  // Served over HTTPS through Cloudflare: browsers should never use plain HTTP for this site
  if (process.env.TRUST_PROXY === 'cloudflare') headers['Strict-Transport-Security'] = 'max-age=15552000';
  if (type.startsWith('text/html')) headers['Content-Security-Policy'] = extra['Content-Security-Policy'] || CSP;
  for (const k of Object.keys(headers)) if (headers[k] === undefined) delete headers[k]; // a page may drop a default header
  // Compress text over 1 KB (static files pass their pre-compressed copy; HEAD is never compressed)
  if (req.method !== 'HEAD' && buf.length > 1024 && COMPRESSIBLE.test(type) && wantsGzip(req)) {
    buf = gz || gzipSync(buf, { level: 6 });
    headers['Content-Encoding'] = 'gzip';
    headers['Vary'] = 'Accept-Encoding';
  }
  headers['Content-Length'] = buf.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : buf);
}

// Static files: the list of servable files is read once at start-up and only exact matches are
// served (so case or stream-name variants on Windows can't create extra copies). Each file is read
// and gzipped once, kept in memory, and revalidated with an ETag.
const STATIC = new Map();
(function scan(dir, prefix) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name), rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) scan(full, rel);
    else STATIC.set(rel, full);
  }
})(PUBLIC, '');
const staticCache = new Map();
// One version for this build of the site (from every file's size and date). Pages link their scripts and
// styles with ?v=<version>, so a browser never mixes an old cached file with a new page, and those
// versioned files can be cached for a year.
const VERSION = createHash('sha256').update([...STATIC.values()].map(f => { const s = statSync(f); return `${f}:${s.size}:${s.mtimeMs}`; }).join('|')).digest('hex').slice(0, 10);
const versionLinks = html => html.replace(/(src|href)="((?!https?:|data:|\/\/|#)[\w./-]+\.(?:js|css))"/g, `$1="$2?v=${VERSION}"`);
function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname).replace(/^\/+/, ''); }
  catch { return send(req, res, 400, 'Bad request', 'text/plain; charset=utf-8'); }
  const file = STATIC.get(rel); // exact, case-sensitive match against the start-up list only
  if (!file || !existsSync(file)) return send(req, res, 404, 'Not found', 'text/plain; charset=utf-8');
  const st = statSync(file);
  // The build version is part of the ETag: a page whose own file did not change still links new scripts
  const etag = `"${st.size.toString(36)}-${st.mtimeMs.toString(36)}-${VERSION}"`;
  // Proxies (Cloudflare) may send the ETag back weak (W/"…") or as a list
  const inm = String(req.headers['if-none-match'] || '').split(',').map(s => s.trim().replace(/^W\//, ''));
  if (inm.includes(etag)) {
    const h = { ETag: etag, ...SECURITY };
    if (rel === 'widget.html') delete h['X-Frame-Options'];
    res.writeHead(304, h); return res.end();
  }
  const type = TYPES[extname(file)] || 'application/octet-stream';
  // Videos: streamed from disk, with byte ranges (iPhones only play video that way); never kept in memory
  if (type === 'video/mp4') {
    const base = { ETag: etag, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400', 'Content-Type': type, ...SECURITY };
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
    let start = 0, end = st.size - 1, status = 200;
    if (m && (m[1] || m[2])) {
      start = m[1] ? Number(m[1]) : Math.max(0, st.size - Number(m[2]));
      end = m[1] && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
      if (start > end || start >= st.size) { res.writeHead(416, { ...base, 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      status = 206; base['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
    }
    res.writeHead(status, { ...base, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    return createReadStream(file, { start, end }).pipe(res);
  }
  let hit = staticCache.get(rel);
  if (!hit || hit.etag !== etag) {
    let body = readFileSync(file);
    if (type.startsWith('text/html')) body = Buffer.from(versionLinks(body.toString('utf8')));
    hit = { etag, body, gz: COMPRESSIBLE.test(type) && body.length > 1024 ? gzipSync(body, { level: 9 }) : null };
    staticCache.set(rel, hit);
  }
  // Vendor libraries never change for a given version: cache them for a day. Our own files: revalidate.
  // A script or style asked for with this build's ?v= never changes: cache it for a year
  const versioned = /[?&]v=([\w]+)/.exec(req.url || '')?.[1] === VERSION;
  const cache = versioned ? 'public, max-age=31536000, immutable'
    : rel.startsWith('vendor/') || rel.startsWith('tour/') || rel.startsWith('icons/') ? 'public, max-age=86400' : 'no-cache';
  // The widget is the one page other websites may show in a frame (it only reads public data and opens links)
  const frame = rel === 'widget.html' ? { 'X-Frame-Options': undefined, 'Content-Security-Policy': WIDGET_CSP } : {};
  return send(req, res, 200, hit.body, type, { ETag: etag, 'Cache-Control': cache, ...frame }, hit.gz);
}

async function readJson(req, limit = 10_000) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > limit) throw Object.assign(new Error('Request too large'), { status: 413 });
  }
  try { const v = JSON.parse(data || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

// ---------- Abuse protection ----------
// Client IP: behind a reverse proxy set TRUST_PROXY=1 to use the last X-Forwarded-For hop
function clientIp(req) {
  // Behind Cloudflare Tunnel (TRUST_PROXY=cloudflare) the server listens on 127.0.0.1 only, so every request
  // comes through the tunnel and Cloudflare's CF-Connecting-IP header is the visitor's real address
  if (process.env.TRUST_PROXY === 'cloudflare') {
    const cf = String(req.headers['cf-connecting-ip'] || '').trim();
    if (/^[0-9a-fA-F:.]{3,45}$/.test(cf)) return cf;
  }
  if (process.env.TRUST_PROXY === '1') {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
    if (xff.length) return xff[xff.length - 1];
  }
  return req.socket.remoteAddress || 'local';
}
// Per-IP limits per minute, per bucket
const hits = new Map();
const allowed = (ip, bucket, max) => {
  const key = `${bucket}:${ip}`, now = Date.now(), list = (hits.get(key) || []).filter(t => now - t < 60_000);
  if (list.length >= max) { hits.set(key, list); return false; } // refused hits are not recorded, so a flood stays cheap
  list.push(now); hits.set(key, list);
  return true;
};
// Per-IP daily cap on AI answers paid by the server's key (one visitor can't use up the whole budget)
const daily = new Map();
function dailyAllowed(ip, max = Number(process.env.DAILY_QUESTIONS_PER_IP || 60)) {
  const day = new Date().toISOString().slice(0, 10), d = daily.get(ip);
  if (!d || d.day !== day) { daily.set(ip, { day, n: 1 }); return true; }
  if (d.n >= max) return false;
  d.n++;
  return true;
}
setInterval(() => { const day = new Date().toISOString().slice(0, 10); for (const [k, v] of daily) if (v.day !== day) daily.delete(k); }, 3_600_000).unref();
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some(t => now - t < 60_000)) hits.delete(k); }, 60_000).unref();

// POSTs must be JSON from this site (blocks other websites from spending the AI credit through visitors' browsers).
// The one exception is the admin research upload, which sends the PDF itself (still same-site only).
function sameOriginJson(req, type = /^application\/json\b/i) {
  if (!type.test(req.headers['content-type'] || '')) return false;
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser clients (curl, tests) send no Origin; they still face the IP limits
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

// Daily AI budget on the server's own keys (default $5/day). Questions with a user's own key do not count.
const BUDGET = Number(process.env.DAILY_BUDGET_USD || 5);
const today = () => new Date().toISOString().slice(0, 10);
let spent = { day: today(), usd: 0 };
if (existsSync(LOG)) {
  for (const line of readFileSync(LOG, 'utf8').split('\n')) {
    try { const r = JSON.parse(line); if (r.at?.startsWith(spent.day) && !r.own_key && typeof r.cost_usd === 'number') spent.usd += r.cost_usd; } catch {}
  }
}
const overBudget = () => { if (spent.day !== today()) spent = { day: today(), usd: 0 }; return spent.usd >= BUDGET; };

const isProvider = id => typeof id === 'string' && Object.hasOwn(PROVIDERS, id);

// ---------- Suggested questions ----------
// Three simple questions journalists ask AAI most (from AAI's written answers to the media, November 2026)
const SUGGESTED_BY_LANG = {
  en: [
    'Why does smog get worse in Almaty in winter?',
    'What are the main sources of air pollution in Almaty?',
    'Which districts have the dirtiest air, and why?',
  ],
  ru: [
    'Почему зимой в Алматы усиливается смог?',
    'Какие основные источники загрязнения воздуха в Алматы?',
    'В каких районах Алматы самый грязный воздух и почему?',
  ],
  kk: [
    'Неге қыста Алматыда тұмша күшейеді?',
    'Алматы ауасы ластануының негізгі көздері қандай?',
    'Алматының қай аудандарында ауа ең лас және неге?',
  ],
};
const SUGGESTED = SUGGESTED_BY_LANG.en;
// They are simple, so they always use the fast model (it answers them correctly in all three languages,
// see the accuracy test) and all nine are pre-answered at start-up: a tap shows the answer at once
const SUGGESTED_MODEL = 'claude-haiku-5-5';
const ALL_SUGGESTED = Object.values(SUGGESTED_BY_LANG).flat();

// ---------- Answer cache and the single answer path ----------
const normQ = q => q.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const answers = new Map();
const cacheKey = (q, provider, model, mode = 'answer') => `${mode}|${provider}|${model && model !== 'auto' ? model : ''}|${normQ(q)}`;
function cached(q, provider, model, mode) {
  const hit = answers.get(cacheKey(q, provider, model, mode));
  return hit && Date.now() < hit.until ? hit.result : null;
}
function remember(q, provider, model, result, mode) {
  if (result.mode !== 'ai' || !result.found) return;
  const ttl = result.sources.some(s => s.live) ? 300_000 : 6 * 3600_000;
  answers.set(cacheKey(q, provider, model, mode), { until: Date.now() + ttl, result });
  if (answers.size > 500) answers.delete(answers.keys().next().value);
}

// ---------- Answer ids: share links, policy briefs and feedback ----------
// Answers given in the last 6 hours are kept in memory by id. Only these can be shared or rated, so
// the content of a shared link is always what the copilot itself wrote (it can't be forged by a client).
const RECENT_MS = 6 * 3600_000;
const recent = new Map();
const newId = () => randomBytes(9).toString('base64url'); // 12 characters, unguessable
const isAnswerId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{12}$/.test(id);
setInterval(() => { const now = Date.now(); for (const [k, v] of recent) if (v.until < now) recent.delete(k); }, 600_000).unref();
// Shared answers are kept 30 days (like the question log), without names or IPs
const SHARED = process.env.SHARED_FILE || join(here, 'data', 'shared.json');
let shared = {};
try { shared = JSON.parse(readFileSync(SHARED, 'utf8')) || {}; } catch {}
function saveShared() {
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const entries = Object.entries(shared).filter(([, v]) => v.at >= cutoff).slice(-5000);
  shared = Object.fromEntries(entries);
  writeFileSync(SHARED + '.tmp', JSON.stringify(shared));
  renameSync(SHARED + '.tmp', SHARED);
}
const publicAnswer = r => ({ question: r.question, lang: r.lang, text: r.text, found: r.found, model: r.model, kind: r.verdict ? 'factcheck' : 'answer', verdict: r.verdict || null, sources_differ: Boolean(r.sources_differ),
  sources: r.sources.map(s => ({ n: s.n, quote: s.quote, title: s.title, url: s.url, page: s.page, lang: s.lang, date: s.date, live: s.live })) });

// Live numbers for the brief and the widget, recomputed at most once a minute
let airCache = null;
async function air() {
  if (airCache && Date.now() - airCache.at < 60_000) return airCache.data;
  const data = await airSummary();
  airCache = { at: Date.now(), data };
  return data;
}

class BudgetError extends Error {}
let bot = null; // the Telegram bot, once started (for announcing new research)
// Telegram bot username, shown as a link in the site menu once the bot is running
let botUsername = /^[A-Za-z0-9_]{5,32}$/.test(process.env.TELEGRAM_BOT_USERNAME || '') ? process.env.TELEGRAM_BOT_USERNAME : null;
const RESERVE_USD = 0.03;        // held while an answer is being written (about one Sonnet answer)
const UNKNOWN_PRICE_USD = 0.02;  // charged to the budget when a provider's price is unknown

// One path for every channel (web, voice, Telegram): cache, budget, AI, and the accuracy log
async function answerQuestion(question, { provider, model, userKey, channel = 'web', onEvent, mode = 'answer' } = {}) {
  question = question.trim().slice(0, 500);
  const prov = provider || 'anthropic';
  if (prov === 'anthropic' && !userKey && (!model || model === 'auto') && mode === 'answer' && ALL_SUGGESTED.some(q => normQ(q) === normQ(question))) model = SUGGESTED_MODEL;
  const t0 = Date.now();
  let result;
  const hit = !userKey && cached(question, prov, model, mode);
  if (hit) result = { ...hit, ms: Date.now() - t0, cached: true };
  else {
    if (!userKey && overBudget()) throw new BudgetError('Daily AI budget reached');
    // Reserve an estimate before the call so parallel requests can't all slip under the budget,
    // then settle to the real cost (also when the call fails part-way)
    const reserve = userKey ? 0 : RESERVE_USD;
    spent.usd += reserve;
    let cost = reserve;
    try {
      // A user's own key is used for this request only. It is never stored or logged.
      result = await ask(index, question, { provider: prov, model: model || undefined, userKey, onEvent, mode });
      cost = userKey ? 0 : (typeof result.cost_usd === 'number' ? result.cost_usd : UNKNOWN_PRICE_USD);
      if (!userKey) remember(question, prov, model, result, mode);
    } catch (err) {
      if (!userKey && typeof err.cost_usd === 'number') cost = Math.max(err.cost_usd, 0);
      throw err;
    } finally {
      spent.usd += cost - reserve;
    }
  }
  // Every answer gets its own id, used to share it, make a policy brief from it, or rate it
  result = { ...result, id: newId() };
  recent.set(result.id, { result, until: Date.now() + RECENT_MS });
  appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), channel, question: result.question, lang: result.lang,
    mode: result.mode, kind: mode, verdict: result.verdict || undefined, provider: result.provider, model: result.model, auto: result.auto, route: result.route, on_topic: result.on_topic,
    own_key: result.own_key, cached: Boolean(result.cached), ms: result.ms, found: result.found, sources: result.sources.length,
    cost_usd: result.cached ? 0 : result.cost_usd }) + '\n');
  statsCache = null;
  return result;
}

const validKey = k => (typeof k === 'string' && /^[\x21-\x7e]{10,300}$/.test(k.trim()) ? k.trim() : undefined);
// On the server's own keys only the cost-controlled choice is allowed: "auto" (Haiku, Sonnet when needed) or Haiku.
// Any other model needs the user's own key.
function allowedModel(provider, model, userKey) {
  if (userKey || !model) return true;
  if (provider === 'anthropic') return ['auto', 'claude-haiku-5-5'].includes(model);
  return model === PROVIDERS[provider].model(); // other server-key providers: only their configured default
}

// ---------- Log retention: questions are kept for 30 days ----------
function pruneLog() {
  try {
    if (!existsSync(LOG)) return;
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const lines = readFileSync(LOG, 'utf8').split('\n').filter(Boolean);
    const kept = lines.filter(l => { try { return JSON.parse(l).at >= cutoff; } catch { return false; } });
    if (kept.length !== lines.length) writeFileSync(LOG, kept.map(l => l + '\n').join(''));
  } catch (err) { console.warn("Log pruning failed:", err.message); }
}
pruneLog();
setInterval(pruneLog, 86_400_000).unref();

// ---------- Accuracy dashboard (recomputed at most every 10 seconds) ----------
const avg = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
// Questions shown publicly are cleaned: no links, emails or phone numbers, and kept short
const clean = q => q.replace(/https?:\/\/\S+|www\.\S+/gi, '[link]').replace(/\S+@\S+\.\S+/g, '[email]')
  .replace(/\+?\d[\d\s()-]{7,}\d/g, '[number]').replace(/\s+/g, ' ').trim().slice(0, 140);
let statsCache = null;
function stats() {
  if (statsCache && Date.now() - statsCache.at < 10_000) return statsCache.data;
  const data = computeStats();
  statsCache = { at: Date.now(), data };
  return data;
}
function computeStats() {
  if (!existsSync(LOG)) return { questions: 0 };
  const all = readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  // AI answers. Rows logged on 5 Nov 2026 by a version that wrote the answer kind into "mode" are AI answers too
  // when they name a provider.
  const isAi = r => r.mode === 'ai' || (['answer', 'factcheck'].includes(r.mode) && Boolean(r.provider));
  const rows = all.filter(isAi);
  if (!rows.length) return { questions: 0 };
  // Feedback: the last vote for each answer counts (a person can change or undo their vote)
  const lastVote = new Map();
  for (const r of all) if (r.type === 'feedback' && r.id) lastVote.set(r.id, r.vote);
  const up = [...lastVote.values()].filter(v => v === 'up').length, down = [...lastVote.values()].filter(v => v === 'down').length;
  // Questions that are not about air (e.g. "price of bitcoin") are left out of the quality numbers
  const offTopic = new Set(rows.filter(r => r.on_topic === false || r.route === 'off-topic question').map(r => normQ(r.question)));
  const onTopic = rows.filter(r => !offTopic.has(normQ(r.question)));
  // Time and cost are measured on freshly generated answers; instant cached repeats would flatter them
  const fresh = rows.filter(r => !r.cached);
  const ms = (fresh.length ? fresh : rows).map(r => r.ms).sort((a, b) => a - b);
  const costs = fresh.filter(r => typeof r.cost_usd === 'number' && !r.own_key).map(r => r.cost_usd);
  const models = {};
  for (const r of fresh.filter(r => !r.own_key)) {
    const m = models[r.model || 'unknown'] ||= { model: r.model || 'unknown', provider: r.provider, questions: 0, costs: [] };
    m.questions++;
    if (typeof r.cost_usd === 'number') m.costs.push(r.cost_usd);
  }
  // Unanswered on-topic questions, each shown once (newest first)
  const seen = new Set();
  const unanswered = [];
  for (const r of [...onTopic].reverse()) {
    const k = normQ(r.question);
    if (r.found || seen.has(k)) continue;
    seen.add(k);
    unanswered.push(clean(r.question));
    if (unanswered.length >= 10) break;
  }
  return {
    questions: rows.length,
    on_topic_questions: onTopic.length,
    answered_with_source_pct: onTopic.length ? Math.round(100 * onTopic.filter(r => r.found).length / onTopic.length) : null,
    median_seconds: +(ms[Math.floor(ms.length / 2)] / 1000).toFixed(1),
    cost_per_answer_usd: costs.length ? +avg(costs).toFixed(4) : null,
    feedback: { up, down, helpful_pct: up + down ? Math.round(100 * up / (up + down)) : null },
    // The track's metric: time to a sourced answer, minutes instead of hours. Each answer with a source is
    // counted as one manual search avoided (MANUAL_MINUTES, a conservative 20 minutes by default).
    time_saved: (() => {
      const sourced = onTopic.filter(r => r.found).length, minutes = Number(process.env.MANUAL_MINUTES || 20);
      return { sourced_answers: sourced, manual_minutes: minutes, hours: +(sourced * minutes / 60).toFixed(1) };
    })(),
    by_model: Object.values(models).sort((a, b) => b.questions - a.questions)
      .map(m => ({ model: m.model, provider: m.provider, questions: m.questions, cost_each_usd: m.costs.length ? +avg(m.costs).toFixed(4) : null })),
    unanswered,
  };
}

// ---------- Admin helpers ----------
// Constant-time token check (hashing first makes both sides the same length)
const sha = s => createHash('sha256').update(String(s)).digest();
const isAdmin = req => Boolean(process.env.ADMIN_TOKEN) && typeof req.headers['x-admin-token'] === 'string'
  && timingSafeEqual(sha(req.headers['x-admin-token']), sha(process.env.ADMIN_TOKEN));
// Rebuild the search index with the uploaded research, and forget cached answers so new research is used
function reindex() {
  index = loadIndex(CHUNKS, uploads.corpus());
  answers.clear();
}
async function readBody(req, limit) {
  if (Number(req.headers['content-length'] || 0) > limit) throw Object.assign(new Error('The file is too large (max 30 MB).'), { status: 413 });
  const parts = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('The file is too large (max 30 MB).'), { status: 413 });
    parts.push(chunk);
  }
  return Buffer.concat(parts);
}
// Title, language, date and an optional public link come in headers (URI-encoded), so the body is just the PDF
function uploadMeta(req) {
  let title;
  try { title = decodeURIComponent(String(req.headers['x-doc-title'] || '')); } catch { return { error: 'Invalid title.' }; }
  title = title.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim();
  if (title.length < 3 || title.length > 200) return { error: 'Give the research a title (3 to 200 characters).' };
  const lang = String(req.headers['x-doc-lang'] || '');
  if (!LANGS.includes(lang)) return { error: 'Choose the language of the document.' };
  const date = String(req.headers['x-doc-date'] || '') || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return { error: 'Invalid date.' };
  let link = null;
  try { link = req.headers['x-doc-url'] ? decodeURIComponent(String(req.headers['x-doc-url'])).trim() : null; } catch { return { error: 'Invalid link.' }; }
  if (link) {
    try { const u = new URL(link); if (u.protocol !== 'https:' || link.length > 500) throw 0; link = u.href.split('#')[0]; }
    catch { return { error: 'The public link must start with https:// (or leave it empty).' }; }
  }
  return { title, lang, date, url: link };
}

// ---------- Research gaps: unanswered questions grouped into topics (AAI team only) ----------
// Recomputed at most every 6 hours on the fast model (a fraction of a cent); the cost counts toward the budget
let gapsCache = null;
function unansweredQuestions() {
  if (!existsSync(LOG)) return [];
  const rows = readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(r => r && (r.mode === 'ai' || (['answer', 'factcheck'].includes(r.mode) && Boolean(r.provider))) && r.on_topic !== false && r.route !== 'off-topic question');
  const answered = new Set(rows.filter(r => r.found).map(r => normQ(r.question)));
  const seen = new Set(), out = [];
  for (const r of rows.reverse()) {
    const k = normQ(r.question);
    if (r.found || answered.has(k) || seen.has(k)) continue;
    seen.add(k); out.push(clean(r.question));
  }
  return out;
}
async function researchGaps(force = false) {
  if (!force && gapsCache && Date.now() - gapsCache.at < 6 * 3600_000) return gapsCache.data;
  const questions = unansweredQuestions();
  let data = { at: new Date().toISOString(), total: questions.length, topics: [] };
  if (questions.length) {
    if (overBudget()) throw new BudgetError('Daily AI budget reached');
    const g = await groupGaps(questions);
    if (typeof g.cost_usd === 'number') spent.usd += g.cost_usd;
    data = { ...data, topics: g.topics };
  }
  gapsCache = { at: Date.now(), data };
  return data;
}

// ---------- Accuracy test results (re-read only when the file changes) ----------
const EVAL = join(here, 'data', 'eval-results.json');
let evalCache = { mtime: 0, data: { available: false } };
function evalSummary() {
  try {
    if (!existsSync(EVAL)) return { available: false };
    const mtime = statSync(EVAL).mtimeMs;
    if (mtime !== evalCache.mtime) {
      const r = JSON.parse(readFileSync(EVAL, 'utf8'));
      evalCache = { mtime, data: { available: true, run_at: r.run_at, model: r.model, total: r.total, passed: r.passed,
        accuracy_pct: r.accuracy_pct, median_seconds: r.median_seconds, cost_usd: r.cost_usd, escalated: r.escalated || 0,
        items: r.items.map(x => ({ question: x.question, expected: x.expected, pass: x.pass, escalated: Boolean(x.model && x.model !== r.model) })) } };
    }
    return evalCache.data;
  } catch { return { available: false }; }
}

// ---------- Routes ----------
const server = createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url || '/', 'http://localhost'); }
  catch { return send(req, res, 400, 'Bad request', 'text/plain; charset=utf-8'); }
  const ip = clientIp(req);
  try {
    if (req.method === 'POST' && !sameOriginJson(req, url.pathname === '/api/admin/upload' ? /^application\/pdf$/i : undefined)) {
      return send(req, res, 403, { error: 'Requests must come from this site as JSON.' });
    }
    if (!['GET', 'HEAD', 'POST'].includes(req.method)) return send(req, res, 405, { error: 'Method not allowed' });

    if (url.pathname === '/api/health') {
      const providers = await listProviders();
      return send(req, res, 200, { ai: providers.some(p => p.ready), live_data: hasAaiKey(), docs: index.docs.length, pages: index.N, telegram: botUsername });
    }
    if (url.pathname === '/api/providers') return send(req, res, 200, await listProviders());
    if (url.pathname === '/api/suggested') return send(req, res, 200, (Object.hasOwn(SUGGESTED_BY_LANG, url.searchParams.get('lang') || '') ? SUGGESTED_BY_LANG[url.searchParams.get('lang')] : SUGGESTED));
    if (url.pathname === '/api/models' && req.method === 'POST') {
      if (!allowed(ip, 'models', 20)) return send(req, res, 429, { error: 'Too many requests, wait a minute.' });
      const { provider: id, api_key } = await readJson(req);
      if (!isProvider(id)) return send(req, res, 400, { error: 'Unknown provider' });
      const userKey = PROVIDERS[id].local ? undefined : validKey(api_key);
      if (!userKey && !PROVIDERS[id].local && !PROVIDERS[id].key()) return send(req, res, 200, { models: [], error: 'Add an API key first.' });
      try { return send(req, res, 200, { models: await listModels(id, userKey) }); }
      catch (err) { return send(req, res, 200, { models: [], error: /rejected/.test(err.message) ? 'This API key was rejected.' : 'Could not load the model list.' }); }
    }
    if (url.pathname === '/api/ask' && req.method === 'POST') {
      if (!allowed(ip, 'ask', 12)) return send(req, res, 429, { error: 'Too many questions, wait a minute.' });
      const { question, provider, model, api_key, stream, mode: askMode } = await readJson(req);
      if (askMode !== undefined && !['answer', 'factcheck'].includes(askMode)) return send(req, res, 400, { error: 'Invalid mode' });
      const mode = askMode || 'answer';
      if (typeof question !== 'string' || question.trim().length < 3 || question.length > 500) {
        return send(req, res, 400, { error: 'Ask a question between 3 and 500 characters.' });
      }
      if (provider !== undefined && !isProvider(provider)) return send(req, res, 400, { error: 'Unknown provider' });
      if (model !== undefined && (typeof model !== 'string' || !/^[\w.:/@-]{1,120}$/.test(model))) return send(req, res, 400, { error: 'Invalid model name' });
      const prov = provider || 'anthropic';
      const userKey = PROVIDERS[prov].local ? undefined : validKey(api_key); // a user key is never sent to Ollama
      if (!allowedModel(prov, model, userKey)) return send(req, res, 400, { error: 'This model needs your own API key (menu → AI model).' });
      if (!userKey && !cached(question.trim(), prov, model, mode) && !dailyAllowed(ip)) return send(req, res, 429, { error: 'You have reached today\x27s limit of questions on the demo. Add your own API key in the menu (AI model), or come back tomorrow.' });
      // Streaming: Server-Sent Events over the POST response (stage, delta, final, error)
      if (stream === true) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', ...SECURITY });
        const ev = (type, data) => { if (!res.writableEnded) res.write(`event: ${type}
data: ${JSON.stringify(data)}

`); };
        try {
          const result = await answerQuestion(question, { provider: prov, model, userKey, channel: 'web', mode,
            onEvent: e => ev(e.type, e.type === 'delta' ? { text: e.text } : e) });
          ev('final', result);
        } catch (err) {
          if (!(err instanceof BudgetError)) console.error('Answer failed:', err.message);
          ev('error', { error: err instanceof BudgetError ? "Today's AI budget for the demo is used up. Add your own API key in the menu (AI model), or try tomorrow." : 'The AI provider failed. Please try again in a moment.' });
        }
        return res.end();
      }
      try {
        return send(req, res, 200, await answerQuestion(question, { provider: prov, model, userKey, channel: 'web', mode }));
      } catch (err) {
        if (err instanceof BudgetError) return send(req, res, 503, { error: "Today's AI budget for the demo is used up. Add your own API key in the menu (AI model), or try tomorrow." });
        console.error('Answer failed:', err.message);
        return send(req, res, 502, { error: 'The AI provider failed. Please try again in a moment.' });
      }
    }
    if (url.pathname === '/api/live') {
      if (!hasAaiKey()) return send(req, res, 200, { available: false });
      try { return send(req, res, 200, { available: true, ...(await getStations()) }); }
      catch { return send(req, res, 200, { available: true, error: 'Live data is temporarily unavailable' }); }
    }
    if (url.pathname === '/api/stats') {
      if (!allowed(ip, 'stats', 30)) return send(req, res, 429, { error: 'Too many requests, wait a minute.' });
      // The raw text of unanswered questions is private: only the AAI team (ADMIN_TOKEN) sees it; everyone else sees the count
      const data = stats();
      const admin = isAdmin(req);
      return send(req, res, 200, admin || !data.unanswered ? data : { ...data, unanswered: undefined, unanswered_count: data.unanswered.length });
    }
    // ---------- Share, policy brief, feedback ----------
    if (url.pathname === '/api/share' && req.method === 'POST') {
      if (!allowed(ip, 'share', 20)) return send(req, res, 429, { error: 'Too many requests, wait a minute.' });
      const { id } = await readJson(req);
      if (!isAnswerId(id)) return send(req, res, 400, { error: 'Invalid answer.' });
      if (!shared[id]) {
        const hit = recent.get(id);
        if (!hit) return send(req, res, 404, { error: 'This answer is too old to share. Ask again.' });
        shared[id] = { ...publicAnswer(hit.result), at: new Date().toISOString() };
        saveShared();
      }
      return send(req, res, 200, { id });
    }
    const ans = url.pathname.match(/^\/api\/answer\/([A-Za-z0-9_-]{12})$/);
    if (ans) {
      if (!allowed(ip, 'answer', 60)) return send(req, res, 429, { error: 'Too many requests, wait a minute.' });
      const a = Object.hasOwn(shared, ans[1]) ? shared[ans[1]] : null;
      return a ? send(req, res, 200, a) : send(req, res, 404, { error: 'This shared answer does not exist or has expired.' });
    }
    if (url.pathname === '/api/air') {
      if (!allowed(ip, 'air', 60)) return send(req, res, 429, { error: 'Too many requests, wait a minute.' });
      if (!hasAaiKey()) return send(req, res, 200, { available: false });
      return send(req, res, 200, { available: true, ...(await air()) });
    }
    // Schools and kindergartens with an AAI sensor, most polluted first (for decision-makers: where to act first)
    if (url.pathname === '/api/outdoor') {
      if (!allowed(ip, 'air', 60)) return send(req, res, 429, { error: 'Too many requests, wait a minute.' });
      if (!hasAaiKey()) return send(req, res, 200, { available: false });
      try {
        return send(req, res, 200, { available: true, ...(await outdoorPlan()) });
      } catch {
        return send(req, res, 503, { error: 'The AAI data is not available right now, try again in a minute.' });
      }
    }
    // Taza for inDrive: the daily message for drivers and riders, ready for a push or an in-app banner.
    // Public numbers only (no personal data), so any partner app may call it (CORS open, no cookies).
    if (url.pathname === '/api/partner/brief') {
      const cors = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=60' };
      if (!allowed(ip, 'air', 60)) return send(req, res, 429, { error: 'Too many requests, wait a minute.' }, undefined, cors);
      if (!hasAaiKey()) return send(req, res, 200, { available: false }, undefined, cors);
      const lang = String(url.searchParams.get('lang') || 'en').slice(0, 5), role = String(url.searchParams.get('role') || '').slice(0, 10);
      // The best and worst hours are a bonus: never wait more than 4 seconds for them
      const plan = await Promise.race([outdoorPlan().catch(() => null), new Promise(r => setTimeout(() => r(null), 4000))]);
      // An optional point (pickup, or where a driver waits): used for this answer only, never logged or stored
      const lat = Number.parseFloat(url.searchParams.get('lat')), lng = Number.parseFloat(url.searchParams.get('lng'));
      const point = inAlmaty(lat, lng) ? { lat, lng } : null;
      const stations = point ? (await getStations().catch(() => null))?.stations : null;
      const host = /^[\w.-]{1,100}(:\d{1,5})?$/.test(req.headers.host || '') ? req.headers.host : 'localhost';
      const origin = /^https:\/\//.test(process.env.PUBLIC_URL || '') ? process.env.PUBLIC_URL.replace(/\/+$/, '')
        : `${process.env.TRUST_PROXY === 'cloudflare' ? 'https' : 'http'}://${host}`;
      if (point) cors['Cache-Control'] = 'no-store';
      return send(req, res, 200, partnerBrief({ air: await air(), plan, lang, role, point, stations, origin }), undefined, cors);
    }
    // Search only, no AI: the best passages from AAI's research with title, page and a link that opens on that page.
    // For other assistants that write the answer themselves (the WhatsApp agent). Several queries can be sent at
    // once, separated by "|" (the same question in English, Russian and Kazakh finds reports in every language).
    if (url.pathname === '/api/search') {
      if (!allowed(ip, 'search', 60)) return send(req, res, 429, { error: 'Too many requests, wait a minute.' });
      const q = String(url.searchParams.get('q') || '').slice(0, 400).trim();
      if (q.length < 2) return send(req, res, 400, { error: 'Send a question in q.' });
      const lang = ['en', 'ru', 'kk'].includes(url.searchParams.get('lang')) ? url.searchParams.get('lang') : null;
      const k = Math.min(8, Math.max(1, Number.parseInt(url.searchParams.get('k'), 10) || 5));
      const queries = q.split('|').map(s => s.trim()).filter(s => s.length > 1).slice(0, 4);
      let found = search(index, queries, { limit: 12, maxPerDoc: 2 });
      // The asker's language first, when the research exists in it
      if (lang) found = [...found.filter(r => r.lang === lang), ...found.filter(r => r.lang !== lang)];
      // From each page, the paragraphs that share the most words with the question (kept in page order, up to ~1,200 characters)
      const words = new Set(queries.flatMap(tokenize));
      const pick = blocks => {
        const scored = (blocks || []).map((b, i) => ({ b: b.replace(/\s+/g, ' ').trim(), i, s: tokenize(b).filter(w => words.has(w)).length }));
        const keep = [...scored].sort((a, b) => b.s - a.s || a.i - b.i);
        const chosen = []; let len = 0;
        for (const x of keep) { if (len && len + x.b.length > 1200) continue; chosen.push(x); len += x.b.length; if (len > 1000) break; }
        return chosen.sort((a, b) => a.i - b.i).map(x => x.b).join(' … ').slice(0, 1400);
      };
      const results = found.slice(0, k).map((r, i) => ({ n: i + 1, title: r.title, page: r.page ?? null, url: r.url, lang: r.lang, date: r.date || null,
        text: pick(r.blocks) }));
      return send(req, res, 200, { query: queries, results, found: results.length,
        note: results.length ? 'Quote these passages exactly and give the title, page and link. If they do not answer the question, say AAI research does not cover it.' : 'Nothing in AAI research matches. Say so; do not guess.' });
    }
    if (url.pathname === '/api/compare') {
      if (!allowed(ip, 'air', 60)) return send(req, res, 429, { error: 'Too many requests, wait a minute.' });
      if (!hasAaiKey()) return send(req, res, 200, { available: false });
      const q = Object.fromEntries(['type', 'a', 'b', 'year'].map(k => [k, String(url.searchParams.get(k) || '').slice(0, 20)]));
      try {
        return send(req, res, 200, { available: true, ...(await compareAir(q)) });
      } catch (err) {
        return send(req, res, 400, { error: /^(Pick|Unknown)/.test(err.message) ? err.message : 'The AAI data is not available right now, try again in a minute.' });
      }
    }
    if (url.pathname === '/api/schools') {
      if (!allowed(ip, 'air', 60)) return send(req, res, 429, { error: 'Too many requests, wait a minute.' });
      if (!hasAaiKey()) return send(req, res, 200, { available: false });
      const { stations, meta } = await getStations();
      const SCHOOL = /mektep|mektebi|litsei|gimnaziya|школ|мектеп|лицей|гимназ/i, KINDER = /balabaq|böbekjai|балабақша|детск/i;
      const list = stations.filter(s => SCHOOL.test(s.name) || KINDER.test(s.name))
        .map(s => ({ id: s.id, name: s.name, pm25: s.pm25, category: s.category, lat: s.lat, lng: s.lng, kind: SCHOOL.test(s.name) ? 'school' : 'kindergarten' }))
        .sort((a, b) => b.pm25 - a.pm25);
      return send(req, res, 200, { available: true, updated: meta?.generated_at || null, total: list.length,
        above_who: list.filter(s => s.pm25 > 15).length, above_kz: list.filter(s => s.pm25 > 35).length, schools: list });
    }
    if (url.pathname === '/api/feedback' && req.method === 'POST') {
      if (!allowed(ip, 'feedback', 30)) return send(req, res, 429, { error: 'Too many requests, wait a minute.' });
      const { id, vote } = await readJson(req);
      if (!isAnswerId(id) || !['up', 'down', null].includes(vote ?? null)) return send(req, res, 400, { error: 'Invalid feedback.' });
      const hit = recent.get(id);
      if (!hit) return send(req, res, 404, { error: 'This answer is too old to rate.' });
      // No question text: only the vote, the model and the route, so the dashboard can show what helps
      appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), type: 'feedback', id, vote: vote ?? null,
        model: hit.result.model, route: hit.result.route, found: hit.result.found }) + '\n');
      statsCache = null;
      return send(req, res, 200, { ok: true });
    }
    // ---------- Admin: the AAI team adds its own research (ADMIN_TOKEN) ----------
    if (url.pathname.startsWith('/api/admin/')) {
      if (!process.env.ADMIN_TOKEN) return send(req, res, 403, { error: 'The admin area is turned off. Set ADMIN_TOKEN on the server.' });
      if (!allowed(ip, 'admin', 30)) return send(req, res, 429, { error: 'Too many requests, wait a minute.' });
      if (!isAdmin(req)) {
        if (!allowed(ip, 'adminfail', 5)) return send(req, res, 429, { error: 'Too many wrong tokens, wait a minute.' });
        return send(req, res, 401, { error: 'Wrong admin token.' });
      }
      if (url.pathname === '/api/admin/gaps' && req.method === 'GET') {
        try { return send(req, res, 200, await researchGaps(url.searchParams.get('refresh') === '1')); }
        catch (err) { return send(req, res, err instanceof BudgetError ? 503 : 502, { error: err instanceof BudgetError ? 'Today\x27s AI budget is used up.' : 'Could not group the questions right now.' }); }
      }
      if (url.pathname === '/api/admin/uploads' && req.method === 'GET') {
        return send(req, res, 200, uploads.list().map(u => ({ ...u, chunks: index.items.filter(i => i.chunk.doc === u.id).length })));
      }
      if (url.pathname === '/api/admin/upload' && req.method === 'POST') {
        const meta = uploadMeta(req);
        if (meta.error) return send(req, res, 400, { error: meta.error });
        const buf = await readBody(req, MAX_PDF_BYTES);
        if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') return send(req, res, 400, { error: 'This file is not a PDF.' });
        const entry = await uploads.add(buf, meta);
        reindex();
        console.log(`Research added: ${entry.id} "${entry.title}" (${entry.pages} pages, ${entry.chunks} sections)`);
        // A 5-point summary in three languages, and (if asked) a message to the bot's "new research" subscribers
        let summary = null, notified = 0;
        try {
          if (!overBudget()) {
            const text = index.items.filter(i => i.chunk.doc === entry.id).map(i => i.chunk.blocks.join(' ')).join(' ');
            const r = await summarizeResearch(entry.title, text);
            if (typeof r.cost_usd === 'number') spent.usd += r.cost_usd;
            summary = r.summary;
            uploads.update(entry.id, { summary });
          }
        } catch (err) { console.warn('Research summary failed:', err.message); }
        if (summary && req.headers['x-notify'] === '1' && bot?.announceResearch) {
          notified = await bot.announceResearch({ ...entry, summary }).catch(err => { console.warn('Announcing research failed:', err.message); return 0; });
        }
        return send(req, res, 200, { ...entry, summary, notified });
      }
      if (url.pathname === '/api/admin/delete' && req.method === 'POST') {
        const { id } = await readJson(req);
        if (!isUploadId(id) || !uploads.remove(id)) return send(req, res, 404, { error: 'Unknown document.' });
        reindex();
        return send(req, res, 200, { removed: id });
      }
      return send(req, res, 404, { error: 'Not found' });
    }
    // Uploaded research PDFs (opened from an answer's source link), sandboxed so a PDF can't run scripts on this site
    const up = url.pathname.match(/^\/research\/(up-[a-z0-9]{6,24})\.pdf$/);
    if (up) {
      const file = uploads.pdfPath(up[1]);
      if (!file) return send(req, res, 404, 'Not found', 'text/plain; charset=utf-8');
      return send(req, res, 200, readFileSync(file), 'application/pdf',
        { 'Content-Security-Policy': 'sandbox', 'Content-Disposition': `inline; filename="${up[1]}.pdf"`, 'Cache-Control': 'private, max-age=3600' });
    }
    // Latest accuracy test (scripts/eval.mjs): public summary and the questions with expected facts
    if (url.pathname === '/api/eval') {
      if (!allowed(ip, 'stats', 30)) return send(req, res, 429, { error: 'Too many requests, wait a minute.' });
      return send(req, res, 200, evalSummary());
    }
    const st = url.pathname.match(/^\/api\/station\/(\d{1,9})$/);
    if (st) {
      if (!hasAaiKey()) return send(req, res, 200, { available: false });
      if (!allowed(ip, 'station', 40)) return send(req, res, 429, { error: 'Too many requests, wait a minute.' });
      const id = Number(st[1]);
      let known = false;
      try { known = (await getStations()).stations.some(s => s.id === id); } catch {}
      if (!known) return send(req, res, 404, { available: true, error: 'Unknown sensor.' });
      try { return send(req, res, 200, { available: true, ...(await getStationDetail(id)) }); }
      catch { return send(req, res, 200, { available: true, error: 'This sensor has no data right now.' }); }
    }
    // Voice agent: a short-lived signed URL, so the ElevenLabs key never reaches the browser
    if (url.pathname === '/api/voice/session') {
      const cfgPath = join(here, 'data', 'voice-agent.json');
      if (!process.env.ELEVENLABS_API_KEY || !existsSync(cfgPath)) return send(req, res, 200, { available: false });
      if (!allowed(ip, 'voice', 3)) return send(req, res, 429, { error: 'Too many voice sessions, wait a minute.' });
      const { agent_id } = JSON.parse(readFileSync(cfgPath, 'utf8'));
      const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agent_id)}`,
        { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, signal: AbortSignal.timeout(10_000) });
      if (!r.ok) return send(req, res, 502, { error: 'The voice service is not available right now.' });
      return send(req, res, 200, { available: true, signed_url: (await r.json()).signed_url });
    }
    if (url.pathname === '/api/sources') {
      return send(req, res, 200, index.docs.map(d => ({ title: d.title, lang: d.lang, date: d.date, url: d.url, pages: d.pages, kind: d.kind })));
    }
    if (url.pathname.startsWith('/api/')) return send(req, res, 404, { error: 'Not found' });
    return serveStatic(req, res, url.pathname);
  } catch (err) {
    if (err.status) return send(req, res, err.status, { error: err.message });
    console.error('Request failed:', err.message);
    return send(req, res, 500, { error: 'Something went wrong. Try again.' });
  }
});
server.headersTimeout = 20_000;
server.requestTimeout = 120_000;

const HOST = process.env.HOST || '127.0.0.1';
server.listen(PORT, HOST, async () => {
  const providers = await listProviders();
  const ready = providers.filter(p => p.ready).map(p => p.id);
  console.log(`Taza Copilot on http://${HOST === '127.0.0.1' ? 'localhost' : HOST}:${PORT} | AI providers: ${ready.join(', ') || 'none (demo mode)'} | live data: ${hasAaiKey() ? 'on' : 'off'} | ${index.docs.length} sources, ${index.N} sections | AI budget $${BUDGET}/day ($${spent.usd.toFixed(3)} used today)`);
  // Keep AAI data warm in the background so no question waits for the API
  await warm().catch(() => {});
  setInterval(() => warm().catch(() => {}), 4 * 60_000).unref();
  // Telegram bot, sharing the same answers, cache, budget and accuracy log
  if (process.env.TELEGRAM_BOT_TOKEN) {
    bot = startTelegram({
      onReady: username => { botUsername = username; },
      token: process.env.TELEGRAM_BOT_TOKEN.trim(), sourceCount: index.docs.length, dataDir: join(here, 'data'),
      publicUrl: /^https:\/\//.test(process.env.PUBLIC_URL || '') ? process.env.PUBLIC_URL : null,
      askQuestion: (q, onEvent, { mode } = {}) => answerQuestion(q, { channel: 'telegram', onEvent: onEvent || undefined, mode: mode === 'factcheck' ? 'factcheck' : 'answer' }),
      transcribe: hasStt() ? transcribe : null, // voice notes, with the ElevenLabs key
      // AAI team chats for the weekly research-gaps report (TELEGRAM_ADMIN_CHATS=123,456; ids from the bot's /myid)
      gapsFn: () => researchGaps(), teamChats: String(process.env.TELEGRAM_ADMIN_CHATS || '').split(',').map(s => s.trim()).filter(Boolean),
    });
  }
  // Pre-answer the suggested questions with the default provider, one after another
  const def = providers.find(p => p.id === 'anthropic' && p.ready);
  if (def && process.env.PREWARM !== 'off') {
    for (const q of ALL_SUGGESTED) {
      if (cached(q, 'anthropic', SUGGESTED_MODEL)) continue;
      try { const r = await ask(index, q, { provider: 'anthropic', model: SUGGESTED_MODEL }); remember(q, 'anthropic', SUGGESTED_MODEL, r); if (typeof r.cost_usd === 'number') spent.usd += r.cost_usd; }
      catch (err) { console.warn('Pre-answer failed:', err.message); }
    }
    console.log('Suggested questions ready');
  }
});
