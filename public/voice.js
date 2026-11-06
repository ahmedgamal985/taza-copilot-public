// Taza voice agent (ElevenLabs). The agent talks with the user and drives this page through client
// tools; a visible pointer moves to each button and "clicks" it, so the user sees what happens.
// The ElevenLabs SDK (self-hosted in /vendor) is only loaded when the user taps the mic.

// Only these values are accepted from the agent (it can be confused by text it reads)
const PAGES = ['ask', 'map', 'schools', 'history', 'dashboard', 'sources', 'about', 'widget', 'ai', 'indrive'];
const CP_DISTRICTS = ['Alatau', 'Almaly', 'Auezov', 'Bostandyq', 'Medeu', 'Nauryzbay', 'Turksib', 'Zhetysu'];
const CP_CITIES = ['bishkek', 'tashkent', 'lahore', 'kathmandu'];
const pickYear = v => { const y = Number.parseInt(v, 10); return y >= 2022 && y <= new Date().getFullYear() ? String(y) : undefined; };
const hh = h => `${String(h % 24).padStart(2, '0')}:00`;
const DISTRICTS = ['city', 'Alatau', 'Almaly', 'Auezov', 'Bostandyk', 'Medeu', 'Nauryzbay', 'Turksib', 'Zhetysu'];
const CATEGORIES = ['all', 'good', 'moderate', 'sensitive', 'unhealthy', 'very'];
const pickFrom = (list, v, fallback) => (list.includes(v) ? v : fallback);

const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- The pointer ----------
const ghost = document.createElement('div');
ghost.id = 'ghost';
ghost.setAttribute('aria-hidden', 'true');
ghost.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M4 2l15 9-7 1.5L9 20z" fill="#0E8A6A" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
document.body.appendChild(ghost);

async function pointAt(el, { click = false } = {}) {
  if (!el) return;
  el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  await sleep(reduceMotion ? 50 : 350);
  const r = el.getBoundingClientRect();
  ghost.classList.add('on');
  ghost.style.transform = `translate(${r.left + Math.min(r.width / 2, 60)}px, ${r.top + r.height / 2}px)`;
  await sleep(reduceMotion ? 50 : 650);
  if (click) { ghost.classList.add('click'); await sleep(250); ghost.classList.remove('click'); }
}
const hidePointer = () => setTimeout(() => ghost.classList.remove('on'), 1500);

async function viaMenu(view) {
  if (!$('#menu').hidden) $('#menu').hidden = true;
  await pointAt($('#menuBtn'), { click: true });
  $('#menu').hidden = false;
  await sleep(200);
  await pointAt($(`#menu [data-view="${view}"]`), { click: true });
  $('#menu').hidden = true;
}

// ---------- Client tools the agent can call ----------
const clientTools = {
  async ask_research({ question }) {
    question = String(question || '').trim().slice(0, 500);
    if (question.length < 3) return 'Ask the user to repeat the question.';
    window.taza.closeStation();
    window.taza.show('ask');
    const box = $('#q');
    await pointAt(box, { click: true });
    box.value = '';
    // Typed on screen in about one second, whatever the length
    const step = Math.max(1, Math.ceil(question.length / 60));
    for (let i = 0; i < question.length; i += step) { box.value = question.slice(0, i + step); if (!reduceMotion) await sleep(16); }
    await pointAt($('#askBtn'), { click: true });
    hidePointer();
    const d = await window.taza.ask(question);
    if (!d || d.error) return `The search failed: ${d?.error || 'unknown error'}. Tell the user and suggest trying again.`;
    const sources = d.sources.map(s => `[${s.n}] ${s.live ? 'live AAI sensor data' : `${s.title}${s.page ? `, page ${s.page}` : ''}`}`).join('; ');
    return `ANSWER (already on the user's screen with the exact quotes): ${d.text.replace(/\[\d+\]/g, '')}\nSOURCES: ${sources || 'none found'}\n` +
      `Answered in ${(d.ms / 1000).toFixed(1)} seconds.`;
  },
  async show_map({ district = 'city', category = 'all' }) {
    district = pickFrom(DISTRICTS, district, 'city');
    category = pickFrom(CATEGORIES, category, 'all');
    window.taza.closeStation();
    await viaMenu('map');
    const shown = await window.taza.showMap(district, category);
    await sleep(1300);
    await pointAt($('#map'));
    hidePointer();
    return JSON.stringify(shown);
  },
  async show_station({ name, district = 'city', pick = 'worst' }) {
    district = pickFrom(DISTRICTS, district, 'city');
    pick = pickFrom(['worst', 'best'], pick, 'worst');
    name = typeof name === 'string' ? name.slice(0, 80) : undefined;
    await viaMenu('map');
    await window.taza.showMap(district, 'all');
    const s = await window.taza.findStation({ name, district, pick });
    if (!s) return 'No sensor found. Tell the user and offer the district map instead.';
    window.taza.focusStation(s);
    await sleep(1200);
    // Point at the sensor's pin, "click" it, then open its card
    const pin = [...document.querySelectorAll('.leaflet-marker-icon')].find(el => el.title?.startsWith(`${s.name}:`));
    if (pin) await pointAt(pin, { click: true });
    const d = await window.taza.openStation(s.id);
    hidePointer();
    if (!d || d.error) return `Could not load ${s.name}.`;
    return JSON.stringify({ sensor: d.name, pm25_now: d.pm25, category: d.label, change_24h: d.change_24h,
      last_24h: { min: d.min, avg: d.avg, max: d.max }, advice: d.advice, updated: d.updated });
  },
  async open_source({ n }) {
    n = Number.parseInt(n, 10);
    if (!Number.isInteger(n) || n < 1 || n > 50) return;
    window.taza.closeStation();
    if (!document.getElementById(`src-${n}`)) return;
    window.taza.show('ask', true);
    const card = document.getElementById(`src-${n}`);
    if (!card) return;
    await pointAt(card.querySelector('blockquote') || card);
    card.classList.add('flash');
    setTimeout(() => card.classList.remove('flash'), 2500);
    hidePointer();
  },
  async compare_air({ type = 'districts', a, b, year }) {
    type = pickFrom(['districts', 'years', 'cities'], type, 'districts');
    // Only known names and years go to the page; anything else falls back to the page's defaults
    const fix = v => (type === 'districts' ? CP_DISTRICTS.find(d => d.toLowerCase() === String(v || '').toLowerCase().replace('bostandyk', 'bostandyq'))
      : type === 'years' ? pickYear(v) : CP_CITIES.find(c => c === String(v || '').toLowerCase()));
    window.taza.closeStation();
    await viaMenu('compare');
    const r = await window.taza.compare(type, type === 'cities' ? 'almaty' : fix(a), fix(b), type === 'districts' ? pickYear(year) : undefined);
    const head = $('#cpOut .cp-head');
    if (head) await pointAt(head);
    hidePointer();
    if (r.error) return `Nothing to compare: ${String(r.error).replace(/\.+$/, '')}. Tell the user and suggest other choices.`;
    const side = s => ({ name: s.label || s.key, average_pm25: s.avg, clean_days_15_or_less: s.clean_days, days_above_35: s.over_limit_days });
    return JSON.stringify({ shown: r.headline, period: r.period, a: side(r.data.a), b: side(r.data.b), days_compared: r.data.days,
      note: 'Daily PM2.5 from AAI, only days both sides have data. WHO guideline 15, Kazakhstan limit 35 µg/m³.' });
  },
  async best_time() {
    window.taza.closeStation();
    await viaMenu('outdoor');
    const d = await window.taza.outdoor();
    const best = $('#odOut .od-best');
    if (best) await pointAt(best);
    hidePointer();
    if (!d || d.error || !d.best) return 'The hourly data is not available right now. Tell the user and offer the live map instead.';
    const w = x => ({ hours: `${hh(x.from)} to ${hh(x.to)}`, pm25_about: x.pm25, category: x.category });
    return JSON.stringify({ day: d.day, best: w(d.best), worst: w(d.worst), now: d.now,
      note: 'An estimate from today\'s readings and the last 14 days of AAI sensors, not a forecast.' });
  },
  async open_page({ page }) {
    if (!PAGES.includes(page)) return;
    window.taza.closeStation();
    if (page === 'ask') { window.taza.show('ask', true); hidePointer(); return; }
    await viaMenu(page);
    window.taza.show(page);
    hidePointer();
  },
};

// Exposed for testing and for a no-microphone demo fallback
window.tazaVoiceTools = clientTools;
// The same pointer drives the guided tour (tour.js)
window.tazaPointer = { pointAt, viaMenu, hide: () => ghost.classList.remove('on') };

// ---------- Talk button and status ----------
const fab = document.createElement('div');
fab.className = 'voice';
fab.innerHTML = `
  <div class="voice-panel" hidden>
    <div class="voice-status"><span class="pulse"></span><span id="voiceState">Connecting…</span></div>
    <p id="voiceLine" class="voice-line"></p>
  </div>
  <button id="voiceBtn" class="voice-btn" aria-label="${I18N.t('v_talk')}">
    <svg class="mic" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>
    <svg class="stop" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
    <span class="voice-label">${I18N.t('v_talk')}</span>
  </button>`;
document.body.appendChild(fab);

let convo = null;
// The state is kept as a translation key so it can be redrawn when the language changes
let stateKey = 'v_connecting', stateText = null;
const setState = (key, mode, raw) => { stateKey = key; stateText = raw || null; $('#voiceState').textContent = raw || I18N.t(key); fab.dataset.mode = mode || ''; };
document.addEventListener('taza:lang', () => {
  $('#voiceBtn').setAttribute('aria-label', I18N.t('v_talk'));
  fab.querySelector('.voice-label').textContent = I18N.t('v_talk');
  if (!stateText) $('#voiceState').textContent = I18N.t(stateKey);
});

$('#voiceBtn').addEventListener('click', async () => {
  if (convo) { await convo.endSession(); return; }
  fab.querySelector('.voice-panel').hidden = false;
  setState('v_connecting', 'connecting');
  try {
    const s = await fetch('/api/voice/session').then(r => r.json());
    if (!s.available) throw new Error(s.error || I18N.t('v_notset'));
    await navigator.mediaDevices.getUserMedia({ audio: true });
    await window.tazaLoadScript('vendor/elevenlabs-client.js');
    const transcript = []; // saved to this browser's history when the call ends
    convo = await window.ElevenLabsClient.Conversation.startSession({
      signedUrl: s.signed_url,
      clientTools,
      onConnect: () => { fab.classList.add('live'); setState('v_listening', 'listening'); },
      onDisconnect: () => { window.tazaHistory?.addVoice(transcript.splice(0)); convo = null; fab.classList.remove('live'); setState('v_tap', ''); ghost.classList.remove('on');
        setTimeout(() => { if (!convo) fab.querySelector('.voice-panel').hidden = true; }, 2500); },
      onModeChange: ({ mode }) => setState(mode === 'speaking' ? 'v_speaking' : 'v_listening', mode),
      onMessage: ({ message, source }) => { if (message) transcript.push({ role: source === 'user' ? 'user' : 'agent', text: message }); $('#voiceLine').textContent = `${source === 'user' ? I18N.t('v_you') : 'Taza'}: ${message}`; },
      onError: err => { console.error(err); setState('v_err', ''); },
    });
  } catch (err) {
    convo = null;
    if (err.name === 'NotAllowedError') setState('v_mic', ''); else setState('v_err', '', err.message);
  }
});
