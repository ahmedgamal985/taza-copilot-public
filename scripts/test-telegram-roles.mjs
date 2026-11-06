// Test of the Telegram bot's driver / rider choice (Taza for inDrive) against a local fake Telegram API:
// the buttons in the alerts menu, the morning alert with each role's tips and AAI source, and unticking.
//   node scripts/test-telegram-roles.mjs   (no keys needed, nothing is sent to Telegram)
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startTelegram } from '../lib/telegram.mjs';

const out = []; let mid = 100, queue = [], uid = 1;
const cb = (chat, data) => ({ update_id: uid++, callback_query: { id: String(uid), from: { id: chat, is_bot: false, first_name: 'T' }, data, message: { message_id: ++mid, chat: { id: chat, type: 'private' } } } });
const msg = (chat, text) => ({ update_id: uid++, message: { message_id: ++mid, chat: { id: chat, type: 'private' }, from: { id: chat, is_bot: false, first_name: 'T' }, date: 0, text } });
const mock = createServer(async (req, res) => {
  let body = ''; for await (const c of req) body += c;
  const method = req.url.split('/').pop(), p = body ? JSON.parse(body) : {};
  const reply = r => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, result: r })); };
  if (method === 'getUpdates') { const b = queue.splice(0, 1); if (!b.length) await new Promise(r => setTimeout(r, 200)); return reply(b); }
  if (['sendMessage', 'editMessageText', 'editMessageReplyMarkup'].includes(method)) out.push({ method, ...p });
  if (method === 'getMe') return reply({ id: 1, is_bot: true, username: 'TestBot' });
  if (method === 'sendMessage') return reply({ message_id: ++mid, chat: { id: p.chat_id } });
  return reply(true);
});
await new Promise(r => mock.listen(0, r));
const smoggy = { city: { pm25: 58.2, category: 'sensitive', sensors: 156 }, days: [],
  districts: [{ district: 'Turksib', pm25: 71.4, category: 'unhealthy' }] };
const plan = { best: { from: 14, to: 16, pm25: 18.2 }, worst: { from: 20, to: 22, pm25: 61.5 } };
const bot = startTelegram({ airFn: async () => smoggy, outdoorFn: async () => plan, stationsFn: async () => ({ stations: [] }),
  token: '123456:TEST_TOKEN_FOR_LOCAL_MOCK_ONLY_xxxxxxxx', testApiBase: `http://127.0.0.1:${mock.address().port}`, sourceCount: 100,
  dataDir: mkdtempSync(join(tmpdir(), 'taza-tg-')), publicUrl: null, askQuestion: async () => ({ text: 'x', sources: [] }) });
const wait = async n => { const end = Date.now() + 8000; while (out.length < n && Date.now() < end) await new Promise(r => setTimeout(r, 100)); };
let ok = 0, bad = 0; const check = (name, cond, d = '') => { cond ? ok++ : bad++; console.log(`${cond ? '✅' : '❌'} ${name}${d ? ' — ' + d : ''}`); };
const kb = m => (m.reply_markup?.inline_keyboard || []).flat().map(b => b.text);

// Driver (English): open alerts, pick driver
queue.push(cb(8080, 'alerts')); await wait(1);
check('alerts menu mentions inDrive', /inDrive/.test(out[0].text));
check('menu has driver and rider buttons', kb(out[0]).some(t => /driver/.test(t)) && kb(out[0]).some(t => /rider/.test(t)), kb(out[0]).join(' | '));
queue.push(cb(8080, 'al:role:driver')); await wait(2);
const k1 = kb(out[1]);
check('driver ticked', k1.includes("✅ 🚗 I'm a driver"), k1.join(' | '));
check('morning alert turned on with the role', k1.includes('✅ Morning alert: on'));
// Rider (Russian)
queue.push(msg(9090, '/language')); await wait(3);
queue.push(cb(9090, 'setlang:ru')); await wait(4);
queue.push(cb(9090, 'al:role:rider')); await wait(5);
await new Promise(r => setTimeout(r, 1500)); { const e = out.filter(m => m.method === 'editMessageReplyMarkup' && String(m.chat_id) === '9090').at(-1) || {}; check('rider (ru) ticked', kb(e).includes('✅ 🧍 Я пассажир'), kb(e).join(' | ')); }
// Neither: a third chat with only the morning alert
queue.push(cb(7070, 'al:daily')); await wait(6);
await new Promise(r => setTimeout(r, 1500)); out.length = 0;
const r = await bot.runAlerts(new Date('2026-11-09T02:30:00Z')); // Monday 07:30 Almaty, smoggy
check('3 morning alerts sent', r.sent === 3, `sent ${r.sent}`);
const by = id => out.find(m => String(m.chat_id) === String(id) && m.method === 'sendMessage')?.text || '';
const d = by(8080), rr = by(9090), n = by(7070);
check('driver alert has driver tips', /For drivers/.test(d) && /recirculation/.test(d) && /20:00–22:00/.test(d));
check('driver alert cites AAI page 5', /AAI, page 5/.test(d) && /href="https:\/\/air\.org\.kz/.test(d));
check('rider alert (ru) has rider tips', /Пассажирам/.test(rr) && /попросите водителя/i.test(rr) && /стр\. 5/.test(rr));
check('no-role alert has no role tips', !/drivers|riders|Водителям|Пассажирам/.test(n));
check('alerts under 4096 chars', [d, rr, n].every(t => t.length < 4096), [d.length, rr.length, n.length].join(','));
const tags = t => (t.match(/<(\w+)/g) || []).length === (t.match(/<\/(\w+)>/g) || []).length;
check('HTML tags balanced', [d, rr, n].every(tags));
// Untick the role: it goes away, the morning alert stays on
queue.push(cb(8080, 'al:role:driver')); await wait(out.length + 1);
check('driver unticked', kb(out.at(-1)).includes("🚗 I'm a driver") && kb(out.at(-1)).includes('✅ Morning alert: on'), kb(out.at(-1)).join(' | '));
// First visit from a phone set to Russian: the welcome in Russian, then the language picker in all three languages
out.length = 0;
queue.push({ update_id: uid++, message: { message_id: ++mid, chat: { id: 6060, type: 'private' }, from: { id: 6060, is_bot: false, first_name: 'R', language_code: 'ru' }, date: 0, text: '/start' } });
await wait(2);
const first = out.filter(m => String(m.chat_id) === '6060');
check('first /start: welcome in the phone\'s language (ru)', /русск|Просто напишите|вопрос/i.test(first[0]?.text || ''), (first[0]?.text || '').slice(0, 60));
check('first /start: language picker asked in ru, kk and en', /Выберите язык/.test(first.at(-1)?.text || '') && /Тілді таңдаңыз/.test(first.at(-1)?.text || '') && /Choose your language/.test(first.at(-1)?.text || '') && kb(first.at(-1)).length === 3);
console.log('\n--- driver alert ---\n' + d + '\n\n--- rider alert (ru) ---\n' + rr);
console.log(`\n${ok}/${ok + bad} passed`);
bot.stop?.(); mock.close(); process.exit(bad ? 1 : 0);
