// Inside the widget frame: the round button (live air colour and number), a note on bad-air days,
// and a chat with AAI's research (streamed answers, exact quotes, page links, voice, feedback).
// The chat is kept in this browser only. The host page is told only the widget's state (open/closed).
const $ = s => document.querySelector(s);
const t = (k, v) => I18N.t(k, v);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeHref = u => { try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href : '#'; } catch { return '#'; } };
const COLORS = { good: '#2E9E5B', moderate: '#E9B824', sensitive: '#F07B3F', unhealthy: '#E02D3C', very: '#8E3B9E' };
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const params = new URLSearchParams(location.search);
if (['ru', 'kk'].includes(params.get('lang'))) I18N.set(params.get('lang'));
if (params.get('side') === 'left') document.body.classList.add('tw-left');
I18N.apply();
$('#twFull').href = `/?lang=${I18N.lang}`;

// ---------- State, shared with the host page (only "open", "nudge" or "closed") ----------
let state = 'closed';
function setState(next) {
  state = next;
  $('#twPanel').hidden = next !== 'open';
  $('#twLauncher').hidden = next === 'open';
  $('#twNudge').hidden = next !== 'nudge';
  parent.postMessage({ taza: 'state', state: next }, '*');
  if (next === 'open') { renderLog(); setTimeout(() => $('#twQ').focus(), 50); }
}
$('#twLauncher').addEventListener('click', () => setState(state === 'open' ? 'closed' : 'open'));
$('#twMin').addEventListener('click', () => setState('closed'));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && state === 'open') setState('closed'); });

// ---------- Live air: the button's colour and number, the line at the top of the chat ----------
let air = null;
async function loadAir() {
  air = await fetch('/api/air').then(r => r.json()).catch(() => null);
  const c = air?.available && air.city;
  if (!c) { $('#twAir').hidden = true; return; }
  const color = COLORS[c.category] || '#0E8A6A';
  $('#twLauncher').style.background = color;
  $('#twLauncher').classList.toggle('tw-bad', c.pm25 > 35);
  $('#twBadge').hidden = false;
  $('#twBadge').textContent = Math.round(c.pm25);
  $('#twLauncher').title = `${t('tw_open')} · PM2.5 ${c.pm25} µg/m³, ${t(`cat_${c.category}`)}`;
  const worst = air.districts?.[0];
  $('#twAir').hidden = false;
  $('#twAir').innerHTML = `<span class="tw-dot" style="background:${color}"></span>
    <span><b>${esc(String(c.pm25))}</b> µg/m³ · ${esc(t(`cat_${c.category}`))}${worst ? ` · ${esc(t('wg_worst', { d: worst.district, v: worst.pm25 }))}` : ''}</span>`;
  maybeNudge();
}
loadAir();
setInterval(loadAir, 5 * 60_000);

// A note above the button: on a bad-air day (once a day), or once on the first visit
function maybeNudge() {
  if (state !== 'closed' || params.get('preview')) return;
  const today = new Date().toISOString().slice(0, 10);
  const c = air?.city;
  let text = null, ask = null;
  if (c && c.pm25 > 35 && store.get('taza-w-nudge') !== today) {
    text = t('tw_nudge_bad', { v: c.pm25, cat: t(`cat_${c.category}`).toLowerCase() });
    ask = t('tw_q_bad');
    store.set('taza-w-nudge', today);
  } else if (!store.get('taza-w-seen', false)) {
    text = t('tw_nudge_hi');
    store.set('taza-w-seen', true);
  }
  if (!text) return;
  $('#twNudgeText').textContent = text;
  $('#twNudgeGo').textContent = ask ? t('tw_nudge_go') : t('tw_nudge_open');
  $('#twNudgeGo').onclick = () => { setState('open'); if (ask) send(ask); };
  setTimeout(() => { if (state === 'closed') setState('nudge'); }, 2500);
}
$('#twNudgeClose').addEventListener('click', () => setState('closed'));

// ---------- The conversation (kept in this browser only, last 30 messages) ----------
let log = store.get('taza-w-chat', []);
if (!Array.isArray(log)) log = [];
const save = () => store.set('taza-w-chat', log.slice(-30));
let suggested = [];
fetch(`/api/suggested?lang=${I18N.lang}`).then(r => r.json()).then(s => { suggested = s; if (state === 'open') renderLog(); }).catch(() => {});

function bubble(m, i) {
  if (m.role === 'user') return `<div class="tw-msg tw-user">${m.voice ? '🎙 ' : ''}${esc(m.text)}</div>`;
  if (m.role === 'spoken') return `<div class="tw-spoken">🔊 ${esc(m.text)}</div>`;
  if (m.role === 'link') return `<a class="tw-linkmsg" href="${esc(m.href)}" target="_blank" rel="noopener">${esc(m.text)}</a>`;
  if (m.role === 'error') return `<div class="tw-msg tw-bot tw-err">${esc(m.text)}</div>`;
  const text = esc(m.text).replace(/\[(\d+)\]/g, '<sup>[$1]</sup>');
  const srcs = (m.sources || []).map(s => `<li><blockquote>${esc(s.quote)}</blockquote>
      <span class="small">[${s.n}] ${s.live ? esc(t('tw_live')) : `${esc(s.title)}${s.page ? `, ${esc(t('page_n', { p: s.page }))}` : ''}${s.section ? `, ${esc(t('answer_to_q', { n: s.section.n }))}` : ''}`}
      ${s.url ? ` · <a href="${safeHref(s.url)}" target="_blank" rel="noopener">${esc(t('open_source'))}</a>` : s.live ? '' : ` · ${esc(t('src_unpublished'))}`}</span></li>`).join('');
  return `<div class="tw-msg tw-bot">
    <div>${text}</div>
    ${srcs ? `<details class="tw-srcs"><summary>📚 ${esc(I18N.plural('source', m.sources.length))} · ${esc(t('exact_quote'))}</summary><ol>${srcs}</ol></details>` : ''}
    ${m.id ? `<div class="tw-acts">
      <button type="button" data-v="up" data-i="${i}" aria-pressed="${m.vote === 'up'}" aria-label="${esc(t('act_up'))}">👍</button>
      <button type="button" data-v="down" data-i="${i}" aria-pressed="${m.vote === 'down'}" aria-label="${esc(t('act_down'))}">👎</button>
      ${m.found ? `<a href="/?a=${esc(m.id)}&lang=${I18N.lang}" target="_blank" rel="noopener">${esc(t('tw_open_full'))}</a>
      <a href="brief.html?id=${esc(m.id)}&lang=${I18N.lang}" target="_blank" rel="noopener">📄 ${esc(t('tw_brief'))}</a>` : ''}
    </div>` : ''}
  </div>`;
}
function renderLog(live) {
  const hello = `<div class="tw-msg tw-bot">${esc(t('tw_hello'))}</div>`;
  const chips = !log.length && suggested.length
    ? `<div class="tw-chips">${[t('tw_q_now'), ...suggested].map(q => `<button type="button" class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : '';
  $('#twLog').innerHTML = hello + chips + log.map(bubble).join('') + (live ?? '');
  $('#twLog').scrollTop = $('#twLog').scrollHeight;
}
$('#twLog').addEventListener('click', async e => {
  const chip = e.target.closest('[data-q]');
  if (chip) return send(chip.dataset.q);
  const v = e.target.closest('[data-v]');
  if (v) {
    const m = log[Number(v.dataset.i)];
    if (!m?.id) return;
    const vote = m.vote === v.dataset.v ? null : v.dataset.v;
    const r = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id, vote }) }).catch(() => null);
    if (r?.ok) { m.vote = vote; save(); renderLog(); }
  }
});
$('#twNew').addEventListener('click', () => { log = []; save(); renderLog(); $('#twQ').focus(); });

// ---------- Asking: the answer streams in word by word ----------
let busy = false;
async function send(question, { voice = false } = {}) {
  question = String(question || '').trim().slice(0, 500);
  if (question.length < 3 || busy) return null;
  if (view !== 'chat') showView('chat');
  busy = true;
  $('#twSend').disabled = true;
  log.push({ role: 'user', text: question, voice });
  save();
  let live = '';
  const draw = () => renderLog(`<div class="tw-msg tw-bot tw-live">${live ? esc(live.replace(/\*\*/g, '')) : `<span class="tw-typing"><i></i><i></i><i></i></span> ${esc(t('step1', { n: 100 }))}`}</div>`);
  draw();
  try {
    const res = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, stream: true }) });
    if (!res.ok || !res.body) { const e = await res.json().catch(() => ({})); throw new Error(e.error || t('req_failed')); }
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = '', data = null;
    while (!data) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
        const type = chunk.match(/^event: (.+)$/m)?.[1], payload = chunk.match(/^data: (.*)$/m)?.[1];
        if (!type || payload == null) continue;
        const ev = JSON.parse(payload);
        if (type === 'delta') { live += ev.text; draw(); }
        else if (type === 'reset') { live = ''; draw(); }
        else if (type === 'error') throw new Error(ev.error || t('req_failed'));
        else if (type === 'final') { data = ev; break; }
      }
    }
    reader.cancel().catch(() => {});
    if (!data) throw new Error(t('req_failed'));
    log.push({ role: 'bot', id: data.id, text: data.text, found: data.found,
      sources: data.sources.map(s => ({ n: s.n, quote: s.quote, title: s.title, page: s.page, section: s.section, url: s.url, live: s.live })) });
    save(); renderLog();
    return data;
  } catch (err) {
    log.push({ role: 'error', text: err.message }); save(); renderLog();
    return { error: err.message };
  } finally {
    busy = false;
    $('#twSend').disabled = false;
  }
}
$('#twForm').addEventListener('submit', e => { e.preventDefault(); const q = $('#twQ').value; $('#twQ').value = ''; send(q); });

// ---------- Views inside the widget: chat, live map, a sensor's card, schools ranking ----------
const VIEWS = { chat: '#twLog', map: '#twMapView', station: '#twStation', schools: '#twSchools' };
let view = 'chat';
function showView(v) {
  view = v;
  for (const [k, sel] of Object.entries(VIEWS)) $(sel).hidden = k !== v;
  const tab = v === 'station' ? 'map' : v;
  document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  if (state !== 'open') setState('open');
  if (v === 'chat') renderLog();
  if (v === 'map') setTimeout(() => wmap?.invalidateSize(), 30);
}
document.querySelector('.tw-tabs').addEventListener('click', e => {
  const tab = e.target.closest('[data-tab]')?.dataset.tab;
  if (tab === 'map') showMap(); else if (tab === 'schools') showSchools(); else if (tab) showView('chat');
});

// Live sensors, loaded once and kept for 5 minutes
let stations = [], stationsAt = 0;
async function getStations() {
  if (stations.length && Date.now() - stationsAt < 300_000) return stations;
  const d = await fetch('/api/live').then(r => r.json()).catch(() => null);
  if (d?.stations?.length) { stations = d.stations; stationsAt = Date.now(); }
  return stations;
}
const DISTRICTS = {
  city: [43.25, 76.92, 11], Alatau: [43.285, 76.83, 13], Almaly: [43.255, 76.915, 14], Auezov: [43.225, 76.855, 13],
  Bostandyk: [43.205, 76.905, 13], Medeu: [43.235, 76.985, 13], Nauryzbay: [43.195, 76.79, 13],
  Turksib: [43.32, 76.975, 13], Zhetysu: [43.29, 76.93, 13],
};
const CATS = ['all', 'good', 'moderate', 'sensitive', 'unhealthy', 'very'];
const loadFile = (tag, src) => new Promise((ok, fail) => { const s = document.createElement(tag); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });

let wmap = null, markers = [];
async function showMap(district = 'city', category = 'all') {
  if (!DISTRICTS[district]) district = 'city';
  if (!CATS.includes(category)) category = 'all';
  showView('map');
  $('#twMapNote').textContent = t('map_loading');
  if (!window.L) { try { await loadFile('script', 'vendor/leaflet.js'); } catch { $('#twMapNote').textContent = t('map_unreach'); return { shown: 0 }; } }
  if (!wmap) {
    wmap = L.map('twMap', { scrollWheelZoom: true, zoomControl: true, attributionControl: true }).setView([43.25, 76.92], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap' }).addTo(wmap);
    const sizeByZoom = () => $('#twMap').classList.toggle('zoomed-out', wmap.getZoom() < 13);
    wmap.on('zoomend', sizeByZoom); sizeByZoom();
  }
  const list = await getStations();
  if (!list.length) { $('#twMapNote').textContent = t('map_unreach'); return { shown: 0 }; }
  markers.forEach(m => m.remove());
  const visible = list.filter(s => category === 'all' || s.category === category || (category === 'unhealthy' && s.category === 'very'));
  markers = visible.map(s => L.marker([s.lat, s.lng], {
    icon: L.divIcon({ className: 'pm-icon', iconSize: [30, 30], iconAnchor: [15, 15],
      html: `<div class="pm-pin ${s.category}" style="background:var(--${s.category})">${Math.round(s.pm25)}</div>` }),
    title: `${s.name}: ${s.pm25} µg/m³`, keyboard: true, zIndexOffset: Math.round(s.pm25),
  }).on('click', () => showStation(s.id)).addTo(wmap));
  const [lat, lng, zoom] = DISTRICTS[district];
  wmap.invalidateSize();
  wmap.flyTo([lat, lng], zoom, { duration: 1 });
  $('#twMapNote').textContent = t('tw_map_note', { n: visible.length });
  const inView = visible.filter(s => Math.abs(s.lat - lat) < (zoom >= 13 ? 0.04 : 0.2) && Math.abs(s.lng - lng) < (zoom >= 13 ? 0.06 : 0.3));
  const avg = inView.length ? inView.reduce((a, s) => a + s.pm25, 0) / inView.length : null;
  const worst = [...inView].sort((a, b) => b.pm25 - a.pm25)[0];
  return { district, category, sensors_in_view: inView.length, average_pm25: avg && +avg.toFixed(1),
    highest: worst ? `${worst.name} ${worst.pm25} µg/m³` : null, who_24h_guideline: 15 };
}

// A sensor's card: reading now, the last 24 hours, advice
function spark(series, color) {
  if (!series || series.length < 2) return `<p class="muted small">${esc(t('st_few'))}</p>`;
  const W = 340, H = 90, vs = series.map(p => p.v), lo = Math.min(...vs) * 0.9, hi = Math.max(...vs) * 1.08;
  const x = i => 6 + (W - 12) * i / (series.length - 1), y = v => 6 + (H - 22) * (1 - (v - lo) / ((hi - lo) || 1));
  const pts = series.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" class="tw-spark" role="img" aria-label="${esc(t('st_last24'))}">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    <text x="6" y="${H - 3}">${esc(series[0].t)}</text><text x="${W - 6}" y="${H - 3}" text-anchor="end">${esc(series[series.length - 1].t)}</text></svg>`;
}
async function showStation(id) {
  showView('station');
  $('#twStation').innerHTML = `<p class="muted tw-pad">${esc(t('st_loading'))}</p>`;
  const d = await fetch(`/api/station/${Number(id)}`).then(r => r.json()).catch(() => null);
  if (!d || d.error || !d.available) { $('#twStation').innerHTML = `<p class="tw-pad tw-err">${esc(t('st_nodata'))}</p>`; return d; }
  const color = COLORS[d.category] || '#0E8A6A';
  const advice = t(`advice_${d.category}`);
  $('#twStation').innerHTML = `
    <div class="tw-st-head" style="background:${color}">
      <button type="button" class="tw-back" data-back="map">← ${esc(t('tw_tab_map'))}</button>
      <h3>${esc(d.name)}</h3>
      <div class="tw-st-val"><b>${Math.round(d.pm25)}</b> µg/m³ · ${esc(t(`cat_${d.category}`))}</div>
      ${d.change_24h != null ? `<div class="small">${d.change_24h > 0 ? '↗ +' : d.change_24h < 0 ? '↘ ' : '→ '}${esc(String(d.change_24h))} ${esc(t('st_24h'))}</div>` : ''}
    </div>
    <div class="tw-pad">
      <p class="small muted">${esc(t('st_last24'))}</p>
      ${spark(d.series, color)}
      <p class="small">${esc(t('st_min'))} <b>${d.min ?? '–'}</b> · ${esc(t('st_avg'))} <b>${d.avg ?? '–'}</b> · ${esc(t('st_max'))} <b>${d.max ?? '–'}</b></p>
      <p class="small"><b>${esc(t('st_advice'))}</b></p>
      <ul class="small">${(Array.isArray(advice) ? advice : d.advice || []).map(a => `<li>${esc(a)}</li>`).join('')}</ul>
    </div>`;
  return d;
}
$('#twStation').addEventListener('click', e => { if (e.target.closest('[data-back]')) showView('map'); });
function findStation(list, { name, district = 'city', pick = 'worst' } = {}) {
  if (name) {
    const q = String(name).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    const hit = q && list.find(s => s.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').includes(q));
    if (hit) return hit;
  }
  const [lat, lng] = DISTRICTS[district] || DISTRICTS.city;
  const near = list.filter(s => district === 'city' || (Math.abs(s.lat - lat) < 0.04 && Math.abs(s.lng - lng) < 0.06));
  const sorted = [...(near.length ? near : list)].sort((a, b) => b.pm25 - a.pm25);
  return pick === 'best' ? sorted[sorted.length - 1] : sorted[0];
}

// Schools and kindergartens, most polluted first
let schools = null;
async function showSchools() {
  showView('schools');
  if (!schools) {
    $('#twSchools').innerHTML = `<p class="muted tw-pad">${esc(t('map_loading'))}</p>`;
    schools = await fetch('/api/schools').then(r => r.json()).catch(() => null);
  }
  if (!schools?.available) { $('#twSchools').innerHTML = `<p class="tw-pad tw-err">${esc(t('br_nolive'))}</p>`; return { shown: 0 }; }
  const max = Math.max(40, ...schools.schools.map(s => s.pm25));
  $('#twSchools').innerHTML = `<p class="tw-pad small">${esc(t('tw_sc_sum', { n: schools.total, who: schools.above_who, kz: schools.above_kz }))}</p>
    <ol class="tw-sc">${schools.schools.map(s => `<li><button type="button" data-sid="${s.id}">
      <span class="tw-sc-name">${esc(s.name)}</span>
      <span class="tw-sc-bar"><i style="width:${Math.max(3, 100 * s.pm25 / max).toFixed(1)}%;background:${COLORS[s.category] || '#9AA5A1'}"></i></span>
      <b>${esc(String(s.pm25))}</b></button></li>`).join('')}</ol>`;
  return { schools_with_sensor: schools.total, above_who_15: schools.above_who, above_kazakhstan_35: schools.above_kz,
    most_polluted_now: schools.schools.slice(0, 3).map(s => `${s.name} ${s.pm25} µg/m³`), cleanest_now: schools.schools.slice(-2).map(s => `${s.name} ${s.pm25} µg/m³`) };
}
$('#twSchools').addEventListener('click', e => { const id = e.target.closest('[data-sid]')?.dataset.sid; if (id) showStation(id); });

// Pages that only exist in the full platform: a link in the chat (a new tab can only open on the visitor's tap)
const PLATFORM_PAGES = { dashboard: 'm_dash', sources: 'm_sources', history: 'm_history', about: 'm_about' };
function linkToPlatform(page) {
  log.push({ role: 'link', text: t('tw_open_page', { page: t(PLATFORM_PAGES[page]) }), href: `/?view=${page}&lang=${I18N.lang}` });
  save(); showView('chat');
}

// ---------- Voice: talk to Taza inside the widget (same agent as the platform) ----------
let convo = null;
const voiceState = key => { $('#twVoice').hidden = !key; $('#twVoiceState').textContent = key ? t(key) : ''; };
const loadSdk = () => window.ElevenLabsClient ? Promise.resolve() : new Promise((ok, fail) => {
  const s = document.createElement('script'); s.src = 'vendor/elevenlabs-client.js'; s.onload = ok; s.onerror = () => fail(new Error('voice')); document.head.appendChild(s);
});
// The agent's tools, all working inside the widget (only values from these lists are accepted)
const clientTools = {
  async ask_research({ question }) {
    showView('chat');
    const d = await send(question, { voice: true });
    if (!d || d.error) return `The search failed: ${d?.error || 'unknown error'}. Tell the user and suggest trying again.`;
    const sources = d.sources.map(s => `[${s.n}] ${s.live ? 'live AAI sensor data' : `${s.title}${s.page ? `, page ${s.page}` : ''}`}`).join('; ');
    return `ANSWER (already in the chat with the exact quotes): ${d.text.replace(/\[\d+\]/g, '')}\nSOURCES: ${sources || 'none found'}`;
  },
  async show_map({ district = 'city', category = 'all' } = {}) {
    return JSON.stringify(await showMap(DISTRICTS[district] ? district : 'city', CATS.includes(category) ? category : 'all'));
  },
  async show_station({ name, district = 'city', pick = 'worst' } = {}) {
    district = DISTRICTS[district] ? district : 'city';
    pick = pick === 'best' ? 'best' : 'worst';
    await showMap(district, 'all');
    const s = findStation(stations, { name: typeof name === 'string' ? name.slice(0, 80) : undefined, district, pick });
    if (!s) return 'No sensor found. Tell the user and offer the district map instead.';
    wmap?.flyTo([s.lat, s.lng], 15, { duration: 0.8 });
    await new Promise(r => setTimeout(r, 900));
    const d = await showStation(s.id);
    if (!d || d.error) return `Could not load ${s.name}.`;
    return JSON.stringify({ sensor: d.name, pm25_now: d.pm25, category: d.label, change_24h: d.change_24h,
      last_24h: { min: d.min, avg: d.avg, max: d.max }, advice: d.advice, updated: d.updated });
  },
  async open_source({ n } = {}) {
    n = Number.parseInt(n, 10);
    const i = log.map(m => m.role).lastIndexOf('bot');
    if (!Number.isInteger(n) || n < 1 || n > 50 || i < 0 || !log[i].sources?.some(s => s.n === n)) return 'That source is not in the last answer.';
    showView('chat');
    const msg = [...document.querySelectorAll('.tw-msg.tw-bot')].pop();
    const det = msg?.querySelector('details'); if (det) det.open = true;
    const li = msg?.querySelectorAll('.tw-srcs li')[log[i].sources.findIndex(s => s.n === n)];
    if (li) { li.scrollIntoView({ block: 'center', behavior: 'smooth' }); li.classList.add('flash'); setTimeout(() => li.classList.remove('flash'), 2500); }
    const s = log[i].sources.find(x => x.n === n);
    return `Showing source [${n}]: ${s.live ? 'live AAI sensors' : `${s.title}${s.page ? `, page ${s.page}` : ''}`}. Quote: ${s.quote}`;
  },
  async open_page({ page } = {}) {
    if (page === 'map') return JSON.stringify(await showMap());
    if (page === 'schools') return JSON.stringify(await showSchools());
    if (page === 'ask') { showView('chat'); return 'The chat is open.'; }
    if (Object.hasOwn(PLATFORM_PAGES, page)) { linkToPlatform(page); return `The ${page} page is on the full Taza website. A link to it is now in the chat; tell the user to tap it.`; }
    return 'Unknown page.';
  },
};
// Exposed for testing without a microphone, like window.tazaVoiceTools on the platform
window.tazaWidgetTools = clientTools;
$('#twMic').addEventListener('click', async () => {
  if (convo) { await convo.endSession(); return; }
  voiceState('v_connecting');
  try {
    const s = await fetch('/api/voice/session').then(r => r.json());
    if (!s.available) throw new Error(s.error || t('v_notset'));
    await navigator.mediaDevices.getUserMedia({ audio: true });
    await loadSdk();
    convo = await window.ElevenLabsClient.Conversation.startSession({
      signedUrl: s.signed_url, clientTools,
      onConnect: () => { $('#twMic').classList.add('live'); voiceState('v_listening'); },
      onDisconnect: () => { convo = null; $('#twMic').classList.remove('live'); voiceState(null); },
      onModeChange: ({ mode }) => voiceState(mode === 'speaking' ? 'v_speaking' : 'v_listening'),
      onMessage: ({ message, source }) => {
        if (!message) return;
        // What the user said appears when the agent asks the research; the agent's spoken lines are shown small
        if (source !== 'user') { log.push({ role: 'spoken', text: message.slice(0, 600) }); save(); renderLog(); }
      },
      onError: () => voiceState('v_err'),
    });
  } catch (err) {
    convo = null;
    $('#twMic').classList.remove('live');
    voiceState(err.name === 'NotAllowedError' ? 'v_mic' : 'v_err');
    setTimeout(() => { if (!convo) voiceState(null); }, 4000);
  }
});

setState('closed');
