// End-to-end test of the Telegram bot against a local fake Telegram API.
// It feeds the bot real-looking updates (commands, buttons, a location, questions) and checks every reply:
// valid Telegram HTML, message length, buttons, and the content in each language.
// Run with the main server already running on :8787 (questions go through its /api/ask):
//   node --env-file=../.env scripts/test-telegram.mjs
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startTelegram } from '../lib/telegram.mjs';
import { getStations } from '../lib/aai.mjs';

// Sensors for the My places and school-card tests (null = the real AAI sensors)
let fakeStations = null;
const station = (id, name, pm25) => ({ id, name, pm25, category: pm25 > 35 ? 'sensitive' : pm25 > 15 ? 'moderate' : 'good', lat: 43.2, lng: 76.9 });
const plan = { day: 'today', hour_now: 7, best: { from: 14, to: 16, pm25: 18.2, category: 'moderate' }, worst: { from: 20, to: 22, pm25: 61.5, category: 'sensitive' } };

const CHAT = 4242, GROUP = -100777;
const out = [];
let mid = 100, queue = [];
const user = { id: CHAT, is_bot: false, first_name: 'Test' };
let uid = 1;
const msg = (text, chat = { id: CHAT, type: 'private' }) => ({ update_id: uid++, message: { message_id: ++mid, chat, from: user, date: 0, text } });
const cb = (data) => ({ update_id: uid++, callback_query: { id: String(uid), from: user, data, message: { message_id: ++mid, chat: { id: CHAT, type: 'private' } } } });
const loc = (lat, lng) => ({ update_id: uid++, message: { message_id: ++mid, chat: { id: CHAT, type: 'private' }, from: user, date: 0, location: { latitude: lat, longitude: lng } } });

// Voice notes for the test: the "audio" is just the words, and the fake transcription reads them back
const VOICE = { q1: 'How many cigarettes did an Almaty resident "smoke" in 2025?', mumble: '' };
const VOICE_CHAT = 4343; // its own chat, so its taps do not count against the main scenario's limit
const voice = (id, duration = 4) => ({ update_id: uid++, message: { message_id: ++mid, chat: { id: VOICE_CHAT, type: 'private' }, from: { ...user, id: VOICE_CHAT }, date: 0,
  voice: { file_id: id, duration, mime_type: 'audio/ogg', file_size: 9000 } } });
const fakeTranscribe = async buf => ({ text: buf.toString('utf8') });
let downloads = 0;

const mock = createServer(async (req, res) => {
  if (req.url.startsWith('/file/bot')) { // Telegram's file download
    downloads++;
    const id = req.url.split('/').pop().replace(/\.oga$/, '');
    res.writeHead(200, { 'Content-Type': 'audio/ogg' }); return res.end(Buffer.from(VOICE[id] ?? ''));
  }
  let body = '';
  for await (const c of req) body += c;
  const method = req.url.split('/').pop();
  const p = body ? JSON.parse(body) : {};
  const reply = r => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, result: r })); };
  if (method === 'getUpdates') {
    const batch = queue.splice(0, 1); // one update per poll, like a person tapping one thing at a time
    if (!batch.length) await new Promise(r => setTimeout(r, 300));
    return reply(batch);
  }
  if (['sendMessage', 'editMessageText', 'answerInlineQuery'].includes(method)) out.push({ method, ...p });
  if (method === 'getMe') return reply({ id: 1, is_bot: true, username: 'TestBot' });
  // Group admins for the school-card tests: user 9002 is an admin, everyone else a member
  if (method === 'getChatMember') return reply({ status: p.user_id === 9002 ? 'administrator' : 'member', user: { id: p.user_id } });
  if (method === 'getFile') return reply({ file_id: p.file_id, file_path: `voice/${p.file_id}.oga` });
  if (method === 'sendMessage') return reply({ message_id: ++mid, chat: { id: p.chat_id } });
  return reply(true);
});
await new Promise(r => mock.listen(0, r));
const base = `http://127.0.0.1:${mock.address().port}`;

// Air for the alert tests: a smoggy morning (or a clean one), 14 days of history, three districts
let fakeAir = null;
const days = Array.from({ length: 14 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 9, 26 + i)).toISOString().slice(0, 10);
  const v = [22, 31, 48, 52, 40, 18, 27, 33, 61, 44, 38, 29, 15, 50][i];
  return { date: d, pm25: v, category: v > 35 ? 'sensitive' : v > 15 ? 'moderate' : 'good' };
});
const smoggy = { city: { pm25: 58.2, category: 'sensitive', sensors: 156 }, days,
  districts: [{ district: 'Turksib', pm25: 71.4, category: 'unhealthy' }, { district: 'Alatau', pm25: 64, category: 'sensitive' }, { district: 'Zhetysu', pm25: 60.2, category: 'sensitive' }] };
const clean = { ...smoggy, city: { pm25: 12.1, category: 'good', sensors: 156 } };

const bot = startTelegram({
  airFn: async () => fakeAir,
  transcribe: fakeTranscribe,
  teamChats: ['5151'], // an AAI team chat for the weekly research-gaps report
  gapsFn: async () => ({ total: 7, topics: [{ name: { en: 'Coal heating in private houses', ru: 'Отопление углем', kk: 'Көмірмен жылыту' }, count: 4, examples: ['How many houses still heat with coal?'] }, { name: { en: 'Health costs', ru: 'Затраты на здоровье', kk: 'Денсаулық шығыны' }, count: 3, examples: ['How many deaths are caused by smog?'] }] }),
  token: '123456:TEST_TOKEN_FOR_LOCAL_MOCK_ONLY_xxxxxxxx', testApiBase: base, sourceCount: 100,
  dataDir: mkdtempSync(join(tmpdir(), 'taza-tg-')), publicUrl: null,
  stationsFn: async () => (fakeStations ? { stations: fakeStations } : getStations()),
  outdoorFn: async () => plan,
  askQuestion: async (q, onEvent, opts = {}) => {
    const r = await fetch('http://localhost:8787/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q, ...(opts.mode && { mode: opts.mode }) }) });
    if (!r.ok) throw new Error(`ask ${r.status}`);
    return r.json();
  },
});

// The scenario, in order
const steps = [
  ['first /start (English + language picker)', msg('/start')],
  ['tap Русский', cb('setlang:ru')],
  ['air now (ru)', cb('air')],
  ['districts (ru)', cb('districts')],
  ['near me button (ru)', cb('near')],
  ['send a location in central Almaty', loc(43.2389, 76.8897)],
  ['examples (ru)', cb('examples')],
  ['switch to Қазақша via /language', msg('/language')],
  ['tap Қазақша', cb('setlang:kk')],
  ['about (kk)', cb('about')],
  ['back to English', cb('setlang:en')],
  ['ask an English question (cached on the server)', msg('How many cigarettes did an Almaty resident "smoke" in 2025?')],
  ['too short', msg('hi')],
  ['unknown command', msg('/whatever')],
  ['in a group chat', msg('/start', { id: GROUP, type: 'group' })],
  ['evil HTML in a question', msg('<b>bold</b> & <script>alert(1)</script> what is PM2.5 near schools?')],
  ['opened from the Kazakh website (deep link)', msg('/start kk')],
  ['deep link with a bad language', msg('/start constructor')],
  ['voice note with a question (cached answer)', voice('q1')],
  ['voice note longer than a minute', voice('q1', 95)],
  ['voice note nobody can make out', voice('mumble')],
  ['open alerts', cb('alerts')],
  ['turn on the morning alert', cb('al:daily')],
  ['turn on the weekly summary', cb('al:weekly')],
  ['/alerts command', msg('/alerts')],
];
for (const [, u] of steps) queue.push(u);

// Wait for the bot to work through the queue (answers can take a few seconds)
const deadline = Date.now() + 120_000;
while ((queue.length || Date.now() - (out.at(-1)?.t || 0) < 0) && Date.now() < deadline) await new Promise(r => setTimeout(r, 500));
await new Promise(r => setTimeout(r, 15_000)); // let the last answer finish

// ---- Alerts, with a fake clock (Almaty = UTC+5) ----
const alertChecks = [];
const expect = (name, ok, detail = '') => { alertChecks.push(ok); console.log(`${ok ? '✅' : '❌'} alerts: ${name}${detail ? ` — ${detail}` : ''}`); };

// ---- Voice notes ----
const texts = out.map(o => o.text || '');
const heard = texts.findIndex(x => x.includes('«How many cigarettes did an Almaty resident &quot;smoke&quot; in 2025?»') || x.includes('«How many cigarettes did an Almaty resident "smoke" in 2025?»'));
expect('voice note → "you said: «…»" shown', heard >= 0);
expect('voice note → answered with sources', heard >= 0 && texts.slice(heard + 1).some(x => /518/.test(x) && /\[1\]/.test(x)));
expect('voice note over a minute → asked to keep it short, not downloaded', texts.some(x => x.includes('⏱')) && downloads === 2, `${downloads} downloads`);
expect('unclear voice note → asked to try again', texts.some(x => x.includes('🤷') && /microphone|микрофон/i.test(x)));
const subs = bot.subscriptions()[String(CHAT)];
expect('subscribed to both after two taps', subs?.daily === true && subs?.weekly === true, JSON.stringify(subs));
fakeAir = smoggy;
let r = await bot.runAlerts(new Date('2026-11-09T02:30:00Z')); // Monday 07:30 in Almaty, smoggy
expect('smoggy Monday 07:30 → morning alert sent', r.sent === 1, `sent ${r.sent}`);
r = await bot.runAlerts(new Date('2026-11-09T02:35:00Z'));
expect('5 minutes later → nothing (once a day)', r.sent === 0, `sent ${r.sent}`);
r = await bot.runAlerts(new Date('2026-11-09T04:30:00Z')); // Monday 09:30
expect('Monday 09:30 → weekly summary + AAI team research-gaps report sent', r.sent === 2, `sent ${r.sent}`);
expect('team report lists the topics', out.some(o => o.chat_id === '5151' && (o.text || '').includes('Coal heating in private houses</b> — 4')));
r = await bot.runAlerts(new Date('2026-11-09T05:30:00Z'));
expect('Monday 10:30 → nothing more', r.sent === 0, `sent ${r.sent}`);
fakeAir = clean;
r = await bot.runAlerts(new Date('2026-11-10T02:30:00Z')); // Tuesday 07:30, clean air
expect('clean Tuesday morning → no alert', r.sent === 0, `sent ${r.sent}`);
fakeAir = smoggy;
r = await bot.runAlerts(new Date('2026-11-10T06:00:00Z')); // Tuesday 11:00, smoggy but past the window
expect('smoggy at 11:00 → no alert (only 7–10 a.m.)', r.sent === 0, `sent ${r.sent}`);
r = await bot.runAlerts(new Date('2026-11-10T03:45:00Z')); // Tuesday 08:45, smog built up
expect('smog builds up at 08:45 → alert sent', r.sent === 1, `sent ${r.sent}`);
// The scenario used up this chat's 20 taps a minute; wait for that window to pass before tapping again
await new Promise(r2 => setTimeout(r2, 60_000));
queue.push(cb('al:daily'), cb('al:weekly'));
await new Promise(r2 => setTimeout(r2, 3000));
expect('both turned off → nothing about this chat is kept', bot.subscriptions()[String(CHAT)] === undefined);
r = await bot.runAlerts(new Date('2026-11-11T02:30:00Z'));
expect('after turning off → no alert', r.sent === 0, `sent ${r.sent}`);

// ---- New research from AAI: only chats that turned on "New research" get the summary ----
expect('no subscriber yet → nobody gets new research', (await bot.announceResearch({ id: 'up-test12345', title: 'Coal & smog <2026>', url: 'https://air.org.kz/report.pdf',
  summary: { en: ['Point one 12.5%'], ru: ['Пункт один 12,5%'], kk: ['Бірінші тармақ 12,5%'] } })) === 0);
queue.push(cb('al:research'));
await new Promise(r2 => setTimeout(r2, 3000));
expect('"New research" switch turned on', bot.subscriptions()[String(CHAT)]?.research === true);
const n = await bot.announceResearch({ id: 'up-test12345', title: 'Coal & smog <2026>', url: 'https://air.org.kz/report.pdf',
  summary: { en: ['Point one 12.5%', 'Point two'], ru: ['Пункт один 12,5%', 'Пункт два'], kk: ['Бірінші тармақ 12,5%', 'Екінші тармақ'] } });
const ann = out.filter(o => /New research from AAI|Новое исследование AAI|AAI-дің жаңа зерттеуі/.test(o.text || '')).pop();
expect('new research announced once, in the chat’s language, title escaped, with a link button', n === 1 && ann && ann.text.includes('Coal &amp; smog &lt;2026&gt;') && ann.reply_markup?.inline_keyboard?.[0]?.[0]?.url === 'https://air.org.kz/report.pdf', `${n} sent`);
await new Promise(r2 => setTimeout(r2, 500));

// ---- New features: fact-check of forwarded posts, My places, inline mode, parent groups ----
// Each part uses its own chat, so the per-chat tap limit of one part never affects another
const settle = async (ms = 1500) => { const until = Date.now() + 90_000; while (queue.length && Date.now() < until) await new Promise(r2 => setTimeout(r2, 200)); await new Promise(r2 => setTimeout(r2, ms)); };
const since = n => out.slice(n);
const textsTo = (list, chat) => list.filter(o => String(o.chat_id) === String(chat)).map(o => o.text || '');
const pm = (chat, extra) => ({ update_id: uid++, message: { message_id: ++mid, chat: { id: chat, type: 'private' }, from: { ...user, id: chat }, date: 0, ...extra } });
const pcb = (chat, data) => ({ update_id: uid++, callback_query: { id: String(uid), from: { ...user, id: chat }, data, message: { message_id: ++mid, chat: { id: chat, type: 'private' } } } });

// Fact-check
const FC = 7070;
let n0 = out.length;
queue.push(pm(FC, { forward_origin: { type: 'channel', chat: { id: -100555, type: 'channel', title: 'Some news' }, message_id: 9, date: 0 },
  text: 'Breathing Almaty\'s air in 2025 was like smoking 518 cigarettes a year, AAI says.' }));
await settle(12_000);
let got = textsTo(since(n0), FC);
expect('forwarded post → checked against AAI research', got.some(x => x.includes('🔎')) && got.some(x => /✅|❌|⚠️|🤷/.test(x) && x.includes('<blockquote>') && /\[1\]/.test(x)), got.at(-1)?.slice(0, 90));
expect('forwarded true claim → ✅ supported', got.some(x => x.startsWith('✅')));
n0 = out.length;
queue.push(pm(FC, { forward_origin: { type: 'hidden_user', sender_user_name: 'Someone', date: 0 }, caption: 'In 2025 Almaty\'s air was always within the WHO guideline, every single day of the year.' }));
await settle(12_000);
got = textsTo(since(n0), FC);
expect('forwarded false claim (a photo caption) → ❌ or ⚠️', got.some(x => /^(❌|⚠️)/.test(x)), got.at(-1)?.slice(0, 90));
n0 = out.length;
queue.push(pm(FC, { forward_origin: { type: 'user', sender_user: { id: 1 }, date: 0 }, sticker: { file_id: 'x' } }), pm(FC, { text: '/check' }));
await settle();
got = textsTo(since(n0), FC);
expect('forwarded sticker → "I can only check text"', got.some(x => /only check text/.test(x)));
expect('/check alone → how to use it', got.some(x => x.includes('Forward me any post')));
expect('the author of a forwarded post is never shown', !out.some(o => /Some news|Someone/.test(o.text || '')));

// My places
const PL = 7171;
fakeStations = [station(501, '№112 mektep', 20), station(502, '№12 mektep-gimnaziya', 18), station(503, 'Balausa balabaqshasy', 25), station(504, '№1120 litsei', 30), station(505, 'Abai avenue', 22)];
n0 = out.length;
queue.push(pcb(PL, 'places'), pcb(PL, 'pl:school'), pm(PL, { text: '112' }));
await settle();
got = since(n0).filter(o => String(o.chat_id) === String(PL));
expect('My places opens empty, with privacy note', got.some(o => (o.text || '').includes('never your location') && (o.text || '').includes('No places yet')));
const pick = got.find(o => (o.text || '').includes('Pick one'));
const pickIds = (pick?.reply_markup?.inline_keyboard || []).flat().map(b => b.callback_data);
expect('school search "112" → only №112 (not №1120)', pickIds.length === 1 && pickIds[0] === 'pl:add:501', pickIds.join(','));
n0 = out.length;
queue.push(pcb(PL, 'pl:add:501'), pcb(PL, 'pl:add:501'), pcb(PL, 'pl:add:502'), pcb(PL, 'pl:add:503'), pcb(PL, 'pl:add:505'));
await settle();
got = textsTo(since(n0), PL);
expect('saved, then "already saved", then the 4th refused (max 3)', got.some(x => x.startsWith('⭐ Saved')) && got.some(x => x.includes('already saved')) && got.some(x => x.includes('already have 3')),
  JSON.stringify(bot.places()[String(PL)]?.map(p => p.id)));
expect('only the sensor number and name are stored', JSON.stringify(bot.places()[String(PL)]) === JSON.stringify([{ id: 501, name: '№112 mektep' }, { id: 502, name: '№12 mektep-gimnaziya' }, { id: 503, name: 'Balausa balabaqshasy' }]));
queue.push(pcb(PL, 'pl:del:502'));
await settle();
expect('remove a place', bot.places()[String(PL)]?.length === 2);
expect('"Air near me" card offers "Save as my place"', out.some(o => (o.reply_markup?.inline_keyboard || []).flat().some(b => /^pl:add:\d+$/.test(b.callback_data || ''))));
fakeStations[0] = station(501, '№112 mektep', 52.4); // smog at the school
r = await bot.runAlerts(new Date('2026-11-11T07:00:00Z')); // Wednesday 12:00 in Almaty
expect('bad air at a saved place → one alert', r.sent === 1 && out.at(-1).chat_id === String(PL) && out.at(-1).text.includes('№112 mektep') && out.at(-1).text.includes('52.4'), `sent ${r.sent}`);
r = await bot.runAlerts(new Date('2026-11-11T07:05:00Z'));
expect('5 minutes later → nothing (once a day per place)', r.sent === 0, `sent ${r.sent}`);
r = await bot.runAlerts(new Date('2026-11-11T17:00:00Z')); // 22:00
expect('at 22:00 → no place alerts at night', r.sent === 0, `sent ${r.sent}`);
n0 = out.length;
queue.push(pcb(PL, 'best'));
await settle();
expect('best time to go out (button)', textsTo(since(n0), PL).some(x => x.includes('14:00–16:00') && x.includes('20:00–22:00')));

// Parent groups
const GR = -100888, admin = { ...user, id: 9002 }, member = { ...user, id: 9001 };
const gm = (from, text) => ({ update_id: uid++, message: { message_id: ++mid, chat: { id: GR, type: 'supergroup', title: 'Class 3B parents' }, from, date: 0, text } });
const gcb = (from, data) => ({ update_id: uid++, callback_query: { id: String(uid), from, data, message: { message_id: ++mid, chat: { id: GR, type: 'supergroup' } } } });
n0 = out.length;
queue.push({ update_id: uid++, my_chat_member: { chat: { id: GR, type: 'supergroup', title: 'Class 3B parents' }, from: admin, date: 0,
  old_chat_member: { status: 'left', user: { id: 1 } }, new_chat_member: { status: 'member', user: { id: 1 } } } });
queue.push(gm(member, '/school 112'), gm(admin, '/school 112'), gm(admin, '/air@SomeOtherBot'));
await settle(2500);
got = since(n0).filter(o => String(o.chat_id) === String(GR));
expect('added to a group → says hello and explains /school', got.some(o => (o.text || '').includes('/school 112')));
expect('a member cannot choose the school', got.some(o => (o.text || '').includes('Only the group')));
const gpick = got.find(o => (o.text || '').includes('Pick one'));
expect('an admin gets the school list', (gpick?.reply_markup?.inline_keyboard || []).flat().some(b => b.callback_data === 'gs:501'));
expect('a command for another bot is ignored', !got.some(o => (o.text || '').includes('Almaty right now')));
queue.push(gcb(member, 'gs:501'), gcb(admin, 'gs:501'));
await settle();
expect('only the admin\'s tap sets the school', bot.groups()[String(GR)]?.id === 501 && out.some(o => String(o.chat_id) === String(GR) && (o.text || '').includes('Done!')));
fakeStations[0] = station(501, '№112 mektep', 27.3);
r = await bot.runAlerts(new Date('2026-11-12T02:40:00Z')); // Thursday 07:40 in Almaty
const card = out.at(-1);
expect('school morning → the school card, with the best time to go out', r.sent === 1 && String(card.chat_id) === String(GR) && card.text.includes('Good morning') && card.text.includes('27.3') && card.text.includes('14:00–16:00'), `sent ${r.sent}`);
r = await bot.runAlerts(new Date('2026-11-12T03:30:00Z'));
expect('same morning later → nothing more', r.sent === 0, `sent ${r.sent}`);
r = await bot.runAlerts(new Date('2026-11-14T02:40:00Z')); // Saturday
expect('Saturday → no school card', r.sent === 0, `sent ${r.sent}`);
queue.push(gm(admin, '/school off'));
await settle();
expect('/school off → the group is forgotten', bot.groups()[String(GR)] === undefined);

// Inline mode
const IN = 7272;
const iq = query => ({ update_id: uid++, inline_query: { id: `iq${uid}`, from: { ...user, id: IN, language_code: 'en' }, query, offset: '' } });
n0 = out.length;
queue.push(iq(''));
await settle();
let inl = since(n0).filter(o => o.method === 'answerInlineQuery');
expect('empty inline query → air now + best time cards', inl.length === 1 && inl[0].results.length === 2 && inl[0].results.every(x => x.input_message_content?.message_text), inl[0]?.results?.map(x => x.title).join(' | '));
n0 = out.length;
queue.push(iq('How many cig'), iq('How many cigarettes did an Almaty resident "smoke" in 2025?'));
await settle(6000);
inl = since(n0).filter(o => o.method === 'answerInlineQuery');
const art = inl.at(-1)?.results?.[0];
expect('typing → only the last query is answered (no AI call per keystroke)', inl.length === 1, `${inl.length} answers`);
expect('inline answer has the fact and its source, short enough to send', art && /518/.test(art.input_message_content.message_text) && /\[1\]/.test(art.input_message_content.message_text), art?.description?.slice(0, 80));

// Telegram HTML rules: only these tags, properly nested; & < > escaped elsewhere; max 4096 chars
const ALLOWED = new Set(['b', 'i', 'code', 'blockquote', 'a', 'u', 's', 'pre']);
function checkHtml(s) {
  const problems = [];
  if (s.length > 4096) problems.push(`too long (${s.length})`);
  const stack = [];
  for (const m of s.matchAll(/<\/?([a-z]+)[^>]*>/gi)) {
    const tag = m[1].toLowerCase();
    if (!ALLOWED.has(tag)) { problems.push(`tag <${tag}> not allowed`); continue; }
    if (m[0].startsWith('</')) { if (stack.pop() !== tag) problems.push(`bad nesting at </${tag}>`); } else stack.push(tag);
  }
  if (stack.length) problems.push(`unclosed ${stack.join(',')}`);
  if (/&(?!amp;|lt;|gt;|quot;|#\d+;)/.test(s)) problems.push('unescaped &');
  return problems;
}

let failures = 0;
for (const o of out) {
  // Inline answers: check the message each result would send
  if (o.method === 'answerInlineQuery') o.text = (o.results || []).map(x => x.input_message_content?.message_text || '').join('\n');
  const problems = o.method === 'answerInlineQuery' ? (o.results || []).flatMap(x => checkHtml(x.input_message_content?.message_text || '')) : checkHtml(o.text || '');
  const buttons = (o.reply_markup?.inline_keyboard || []).flat().map(b => b.text + (b.url ? ` →${b.url.slice(0, 40)}` : '')).join(' | ');
  const kb = o.reply_markup?.keyboard ? ' [location keyboard]' : o.reply_markup?.remove_keyboard ? ' [keyboard removed]' : '';
  if (problems.length) failures++;
  console.log(`\n--- ${o.method} to ${o.chat_id}${problems.length ? '  ❌ ' + problems.join('; ') : '  ✅'}`);
  console.log((o.text || '').slice(0, 420).replace(/\n{2,}/g, '\n'));
  if (buttons || kb) console.log(`   buttons: ${buttons}${kb}`);
}
console.log(`\n${out.length} bot messages, ${failures} with HTML problems · alerts ${alertChecks.filter(Boolean).length}/${alertChecks.length}`);
mock.close();
process.exit(failures || !alertChecks.every(Boolean) ? 1 : 0);
