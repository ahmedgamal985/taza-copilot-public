// Taza Copilot web client
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t = (k, v) => I18N.t(k, v);
const catLabel = c => t(`cat_${c}`);
// Only http(s) links are ever put in an href
const safeHref = u => { try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href : "#"; } catch { return "#"; } };
// Load a script once, when it is first needed
const loaded = {};
const loadScript = src => !/^vendor\/[\w.-]+\.js$/.test(src) ? Promise.reject(new Error("Only bundled scripts can be loaded")) : loaded[src] ||= new Promise((ok, fail) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => { delete loaded[src]; fail(new Error("Could not load " + src)); }; document.head.appendChild(s); });
window.tazaLoadScript = loadScript;

I18N.apply();

// ---------- Status pill ----------
let health = null;
let sourceCount = 100;
function renderStatus() {
  if (!health) return;
  $('#status').innerHTML = `${esc(t('status_sources', { n: health.docs }))} · ${health.ai ? `<b>${esc(t('ai_on'))}</b>` : esc(t('demo_mode'))} · ${health.live_data ? `<b>${esc(t('live_data'))}</b>` : esc(t('no_live'))}`;
}
// The Telegram link opens the bot in the language the site is showing (t.me/<bot>?start=ru)
function updateTelegramLink() {
  const a = $('#tgLink'), name = health?.telegram;
  if (!name || !/^[A-Za-z0-9_]{5,32}$/.test(name)) { a.hidden = true; return; }
  a.href = `https://t.me/${name}?start=${I18N.lang}`;
  a.hidden = false;
}
fetch("/api/health").then(r => r.json()).then(h => { health = h; sourceCount = h.docs; renderStatus(); updateTelegramLink(); renderSaved(); }).catch(() => {});
// WhatsApp: the same Taza on WhatsApp (an AI agent on team Smog Hunters' number), with a first message in the site's language
const WA_NUMBER = '201509000921';
function updateWhatsAppLink() {
  const href = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(t('wa_text'))}`;
  for (const id of ['#waLink', '#waHome']) { const a = $(id); if (a) a.href = href; }
}
updateWhatsAppLink();
// Rebuilt on every tap too, so the first message is always in the language on screen
for (const id of ['#waLink', '#waHome']) $(id)?.addEventListener('click', updateWhatsAppLink);
// Entrance animations only when the page is actually on screen (a background tab shows everything at once)
if (document.visibilityState === 'visible' && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.documentElement.classList.add('anim');

// Numbers under the title: reports, live sensors, languages, and the track's metric (hours saved).
// They count up once when the page opens (skipped when the visitor turns motion off).
let savedHours = null, sensorCount = null, counted = false;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function renderSaved() {
  const el = $('#savedLine');
  const items = [
    health?.docs && [health.docs, t('hs_sources'), ''],
    sensorCount && [sensorCount, t('hs_sensors'), ''],
    [3, t('hs_langs'), ''],
    savedHours >= 1 && [savedHours, t('hs_saved'), 'hs-saved'],
  ].filter(Boolean);
  el.hidden = false;
  el.innerHTML = items.map(([n, label, cls]) => `<span class="${cls}">${cls ? '⏱ ' : ''}<b data-n="${n}">${counted || reduceMotion ? n : 0}</b> ${esc(label)}</span>`).join('');
  if (counted || reduceMotion) return;
  if (!(health?.docs && savedHours != null && sensorCount)) return; // wait until all numbers are known
  counted = true;
  const t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / 900), ease = 1 - Math.pow(1 - k, 3);
    el.querySelectorAll('b[data-n]').forEach(b => { const n = Number(b.dataset.n); b.textContent = Number.isInteger(n) ? Math.round(n * ease) : (n * ease).toFixed(1); });
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  // If the browser pauses animation frames (a background tab), the final numbers still appear
  setTimeout(() => el.querySelectorAll('b[data-n]').forEach(b => { b.textContent = b.dataset.n; }), 1200);
}
fetch('/api/stats').then(r => r.json()).then(s => { savedHours = s.time_saved?.hours ?? 0; renderSaved(); }).catch(() => {});
// Live pill above the title: the air in Almaty right now, coloured by category; it opens the map
let airNow = null;
function renderLivePill() {
  const el = $('#livePill'), c = airNow;
  if (!c) { el.hidden = true; return; }
  el.hidden = false;
  el.style.setProperty('--cat', `var(--${c.category})`);
  el.innerHTML = `<i class="live-dot"></i><b class="lp-tag">LIVE</b><span class="lp-text">${esc(t('live_pill'))} <b>${esc(String(c.pm25))}</b> µg/m³ · ${esc(t(`cat_${c.category}`))}</span><span aria-hidden="true">→</span>`;
}
$('#livePill').addEventListener('click', () => show('map'));
fetch('/api/air').then(r => r.json()).then(a => { sensorCount = a.city?.sensors || null; airNow = a.city || null; renderSaved(); renderLivePill(); }).catch(() => {});
// The menu closes with Escape too
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#menu').hidden) { $('#menu').hidden = true; $('#menuBtn').setAttribute('aria-expanded', 'false'); } });

// ---------- Suggested questions (simple ones; the English ones are pre-answered on the server) ----------
// Two modes: ask a question, or check a claim against the research
let askMode = 'answer';
function setMode(m) {
  askMode = m === 'factcheck' ? 'factcheck' : 'answer';
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === askMode)));
  $('#q').placeholder = t(askMode === 'factcheck' ? 'fc_ph' : 'ask_ph');
  $('#askBtn').textContent = t(askMode === 'factcheck' ? 'fc_btn' : 'ask_btn');
  loadSuggested();
}
document.querySelector('.mode-tabs').addEventListener('click', e => { const m = e.target.closest('[data-mode]')?.dataset.mode; if (m) { setMode(m); $('#q').focus(); } });
function loadSuggested() {
  if (askMode === 'factcheck') { $('#suggest').innerHTML = t('fc_examples').map(q => `<button class="chip" type="button">${esc(q)}</button>`).join(''); return; }
  fetch(`/api/suggested?lang=${I18N.lang}`).then(r => r.json()).then(list => {
    if (askMode !== 'answer') return;
    $('#suggest').innerHTML = list.map(q => `<button class="chip" type="button">${esc(q)}</button>`).join('');
  }).catch(() => {});
}
loadSuggested();
$('#suggest').addEventListener('click', e => {
  if (e.target.classList.contains('chip')) { $('#q').value = e.target.textContent; ask(); }
});

$('#askForm').addEventListener('submit', e => { e.preventDefault(); ask(); });
$('#q').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } });

// Chosen AI provider and model, remembered in this browser
// Provider and model are remembered in this browser; a user's own API keys only for this tab session
const store = {
  get() {
    try {
      const v = JSON.parse(localStorage.getItem('taza-ai') || '{}');
      // Older versions kept keys in localStorage: remove them from there
      if (v.keys) { delete v.keys; localStorage.setItem('taza-ai', JSON.stringify(v)); }
      v.keys = JSON.parse(sessionStorage.getItem('taza-keys') || '{}');
      return v;
    } catch { return {}; }
  },
  set({ keys, ...rest }) {
    try { localStorage.setItem('taza-ai', JSON.stringify(rest)); sessionStorage.setItem('taza-keys', JSON.stringify(keys || {})); } catch {}
  },
};

// ---------- Ask ----------
let lastAnswer = null;
async function ask(fromVoice) {
  if (typeof fromVoice === 'string') { show('ask', true); $('#q').value = fromVoice; }
  const question = $('#q').value.trim();
  if (question.length < 3) return null;
  if (location.search.includes('a=')) history.replaceState(null, '', location.pathname); // leaving a shared answer
  const choice = store.get();
  $('#askBtn').disabled = true;
  const started = performance.now();
  // The steps follow the real pipeline, driven by the server's events: understand -> search -> write
  let stage = 'step1';
  $('#result').innerHTML = '<div class="loading"><span class="spinner"></span><span id="tick"></span></div><div class="answer streaming" hidden><div class="text" id="liveText"></div></div>';
  const tick = () => {
    const el = $('#tick'); if (!el) return;
    el.textContent = `${t(stage, { n: sourceCount })}… ${((performance.now() - started) / 1000).toFixed(1)} ${t('sec')}`;
  };
  tick();
  const timer = setInterval(tick, 100);
  let live = '';
  try {
    const res = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, stream: true, mode: askMode, provider: choice.provider, model: choice.model || undefined, api_key: choice.keys?.[choice.provider] || undefined }) });
    if (!res.ok || !res.body) { const e = await res.json().catch(() => ({})); throw new Error(e.error || t('req_failed')); }
    // Read Server-Sent Events from the response body
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
        if (type === 'stage') stage = ev.stage === 'search' ? 'step2' : 'step4';
        else if (type === 'reset') { live = ''; $('#liveText').textContent = ''; }
        else if (type === 'delta') {
          live += ev.text;
          const box = $('#result .answer.streaming');
          if (box?.hidden) { box.hidden = false; $('#result .loading').hidden = true; }
          // In claim-check mode the verdict word opens the text; it is shown as a badge at the end instead
          $('#liveText').textContent = live.replace(/\*\*/g, '').replace(/^\s*(SUPPORTED|CONTRADICTED|PARTLY|NOT COVERED)\s*[:：.\-–—]?\s*/i, '').replace(/⚖️?\s*/g, '');
        }
        else if (type === 'error') throw new Error(ev.error || t('req_failed'));
        else if (type === 'final') { data = ev; break; }
      }
    }
    reader.cancel().catch(() => {});
    if (!data) throw new Error(t('req_failed'));
    lastAnswer = data;
    render(data);
    history_.addAnswer(data, typeof fromVoice === 'string' ? 'voice' : 'text');
    return data;
  } catch (err) {
    lastAnswer = null;
    $('#result').innerHTML = `<p class="error">${esc(err.message)}</p>`;
    return { error: err.message };
  } finally {
    clearInterval(timer);
    $('#askBtn').disabled = false;
  }
}

function render(d) {
  const text = esc(d.text).replace(/\[(\d+)\]/g, (_, n) => `<sup><a href="#src-${n}" data-n="${n}">[${n}]</a></sup>`);
  const secs = (d.ms / 1000).toFixed(1);
  const cost = d.mode !== 'ai' || d.cached ? '' : d.cost_usd === 0 ? ` · ${t('free_local')}` : d.cost_usd ? ` · ${usd(d.cost_usd)}` : '';
  const sources = d.sources.map(s => {
    const href = s.url ? safeHref(s.url) : '#';
    return `<div class="src" id="src-${s.n}">
      <blockquote>${esc(s.quote)}</blockquote>
      <div class="row">
        <span class="n">[${s.n}]</span>
        ${s.live ? '<span class="badge live">LIVE</span>' : `<span class="badge">${esc((s.lang || '').toUpperCase())}</span>`}
        <span>${esc(s.title)}${s.page ? `, ${esc(t('page_n', { p: s.page }))}` : ''}${s.section ? `, ${esc(t('answer_to_q', { n: s.section.n }))}: «${esc(s.section.q)}»` : ''}</span>
        ${s.url ? `<a href="${href}" target="_blank" rel="noopener">${esc(t('open_source'))}</a>` : `<span class="muted">${esc(t('src_unpublished'))}</span>`}
        ${d.mode === 'ai' ? `<span class="verified">${esc(t('exact_quote'))}</span>` : ''}
        <span class="src-tools">
          <button type="button" class="mini" data-card="${s.n}" title="${esc(t('card_btn'))}">🖼 ${esc(t('card_short'))}</button>
          ${s.live ? '' : `<button type="button" class="mini" data-cite="${s.n}" title="${esc(t('cite_btn'))}">APA</button>`}
        </span>
      </div>
      <p class="cite-out small muted" id="cite-${s.n}" hidden></p>
    </div>`;
  }).join('');
  // "6 passages · 2 sources": several quotes often come from one document
  const nDocs = new Set(d.sources.map(s => s.title)).size;
  const counted = d.sources.length === nDocs ? I18N.plural('source', nDocs) : `${I18N.plural('passage', d.sources.length)} · ${I18N.plural('source', nDocs)}`;
  const meta = d.shared || d.saved
    ? `<span class="fast">${esc(t(d.saved ? 'h_saved' : 'shared_note'))}</span><span>${esc(counted)}</span>`
    : `<span class="fast">${esc(d.cached ? t('instant') : t('answered_in', { s: secs }))}</span><span>${esc(counted)}${cost}</span>${d.model ? `<span>${esc(d.provider_label)} · ${d.auto ? `auto → ${esc(d.model)}` : esc(d.model)}${d.own_key ? ` · ${esc(t('your_key'))}` : ''}</span>` : ''}`;
  // Rate (only right after asking), share, and turn into a one-page policy brief
  const actions = d.id ? `<div class="actions" role="group">
      ${d.shared || d.saved ? '' : `<button type="button" class="act" data-act="up" aria-pressed="${d.vote === 'up'}" title="${esc(t('act_up'))}" aria-label="${esc(t('act_up'))}">👍</button>
      <button type="button" class="act" data-act="down" aria-pressed="${d.vote === 'down'}" title="${esc(t('act_down'))}" aria-label="${esc(t('act_down'))}">👎</button>`}
      ${d.found ? `<button type="button" class="act" data-act="share">🔗 ${esc(t('act_share'))}</button>
      <button type="button" class="act" data-act="brief">📄 ${esc(t('act_brief'))}</button>` : ''}
      <span class="act-msg" role="status">${d.vote ? esc(t('act_thanks')) : ''}</span>
    </div>` : '';
  $('#result').innerHTML = `
    <div class="answer ${d.found ? '' : 'notfound'}">
      ${d.verdict ? `<div class="verdict v-${esc(d.verdict.toLowerCase().replace(/ /g, '-'))}">${esc(t(`fc_${d.verdict.toLowerCase().replace(/ /g, '_')}`))}</div>` : ''}
      ${d.sources_differ ? `<div class="differ">${esc(t('differ'))}</div>` : ''}
      <div class="text">${text}</div>
      ${answerChart(d)}
      <div class="meta">${meta}</div>
      ${actions}
    </div>
    ${sources}`;
}

// ---------- Automatic chart: PM2.5 by district or by month, when the answer has 3 or more such numbers ----------
const DISTRICT_NAMES = {
  Alatau: ['alatau', 'алатау'], Almaly: ['almaly', 'алмалин', 'алмалы'], Auezov: ['auezov', 'ауэзов', 'әуезов'],
  Bostandyk: ['bostandyk', 'бостандык', 'бостандық'], Medeu: ['medeu', 'медеу'], Nauryzbay: ['nauryzbay', 'наурызбай'],
  Turksib: ['turksib', 'турксиб', 'түрксіб'], Zhetysu: ['zhetysu', 'жетысу', 'жетісу'],
};
const MONTH_NAMES = [['jan', 'январ', 'қаңтар'], ['feb', 'феврал', 'ақпан'], ['mar', 'март', 'наурыз'], ['apr', 'апрел', 'сәуір'],
  ['may', 'ма[йя]', 'мамыр'], ['jun', 'июн', 'маусым'], ['jul', 'июл', 'шілде'], ['aug', 'август', 'тамыз'], ['sep', 'сентябр', 'қыркүйек'],
  ['oct', 'октябр', 'қазан'], ['nov', 'ноябр', 'қараша'], ['dec', 'декабр', 'желтоқсан']];
const catOf = v => (v <= 15 ? 'good' : v <= 35 ? 'moderate' : v <= 70 ? 'sensitive' : v <= 140 ? 'unhealthy' : 'very');
function findSeries(text) {
  // "PM2.5" / "PM10" between a name and its value would be read as numbers: take them out first
  const t = text.toLowerCase().replace(/pm\s?2[.,]5|pm₂[.,]₅|pm\s?10|no2|so2|o3/g, ' ');
  const num = '(\\d{1,3}(?:[.,]\\d)?)';
  const byDistrict = {};
  for (const [name, stems] of Object.entries(DISTRICT_NAMES)) {
    // In the sentence after each mention of the district, the first number that is not an AQI, a percentage or a
    // count of sensors (a "." followed by a digit is a decimal point, not the end of the sentence)
    const mentions = stems.flatMap(s => [...t.matchAll(new RegExp(`(?:^|[^\\p{L}])${s}[\\p{L}]*`, 'gu'))]).sort((a, b) => a.index - b.index);
    for (const m of mentions) {
      const sentence = t.slice(m.index + m[0].length).split(/[\n;!?]|\.(?!\d)/)[0].slice(0, 90);
      const value = [...sentence.matchAll(/(\d{1,3}(?:[.,]\d+)?)(?!\d)/g)].find(n => {
        const before = sentence.slice(Math.max(0, n.index - 14), n.index), after = sentence.slice(n.index + n[0].length, n.index + n[0].length + 10);
        return !/aqi|индекс/.test(before) && !/^\s*(%|sensor|датчик)/.test(after);
      });
      if (value) { byDistrict[name] = parseFloat(value[1].replace(',', '.')); break; }
    }
  }
  const byMonth = [];
  MONTH_NAMES.forEach((stems, i) => {
    for (const s of stems) {
      const m = t.match(new RegExp(`(?:^|[^\\p{L}])${s}[\\p{L}]*\\.?[^\\d\\n]{0,15}?${num}\\s*(?:µg|мкг|,|;|\\.|\\)|$)`, 'u'));
      if (m) { byMonth[i] = parseFloat(m[1].replace(',', '.')); break; }
    }
  });
  const d = Object.entries(byDistrict).filter(([, v]) => v > 0 && v < 500);
  const mo = byMonth.map((v, i) => [i, v]).filter(([, v]) => v > 0 && v < 500);
  if (d.length >= 3) return { kind: 'district', rows: d.sort((a, b) => b[1] - a[1]) };
  if (mo.length >= 3) return { kind: 'month', rows: mo };
  return null;
}
function answerChart(d) {
  // The answer's own words first; the cited sources (e.g. a live table of districts) only if needed
  const s = findSeries(d.text) || findSeries(d.sources.map(x => x.quote).join('\n'));
  if (!s) return '';
  const monthLabel = i => I18N.date(new Date(2026, i, 1), { day: false });
  const rows = s.rows.map(([k, v]) => ({ label: s.kind === 'month' ? monthLabel(k) : k, v }));
  const max = Math.max(40, ...rows.map(r => r.v)) * 1.08;
  let svg;
  if (s.kind === 'district') {
    const W = 360, rh = 22, L = 84;
    const x = v => L + (W - L - 36) * v / max;
    svg = `<svg viewBox="0 0 ${W} ${rows.length * rh + 6}" role="img" aria-label="${esc(t('ch_district'))}">${rows.map((r, i) => `
      <text x="${L - 6}" y="${i * rh + 15}" text-anchor="end" class="ch-l">${esc(r.label)}</text>
      <rect x="${L}" y="${i * rh + 4}" width="${Math.max(2, x(r.v) - L)}" height="${rh - 8}" rx="3" fill="var(--${catOf(r.v)})"></rect>
      <text x="${x(r.v) + 4}" y="${i * rh + 15}" class="ch-v">${r.v}</text>`).join('')}</svg>`;
  } else {
    const W = 360, H = 150, B = 20, bw = (W - 10) / rows.length;
    const y = v => 6 + (H - B - 6) * (1 - v / max);
    svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('ch_month'))}">${rows.map((r, i) => `
      <rect x="${5 + i * bw + 3}" y="${y(r.v)}" width="${bw - 6}" height="${H - B - y(r.v)}" rx="3" fill="var(--${catOf(r.v)})"></rect>
      <text x="${5 + i * bw + bw / 2}" y="${y(r.v) - 3}" text-anchor="middle" class="ch-v">${r.v}</text>
      <text x="${5 + i * bw + bw / 2}" y="${H - 5}" text-anchor="middle" class="ch-l">${esc(r.label)}</text>`).join('')}</svg>`;
  }
  return `<figure class="answer-chart"><figcaption>${esc(t(s.kind === 'district' ? 'ch_district' : 'ch_month'))}</figcaption>${svg}</figure>`;
}

// Answer actions: feedback, share link, policy brief
$('#result').addEventListener('click', async e => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (!act || !lastAnswer?.id) return;
  const d = lastAnswer, msg = () => $('#result .act-msg');
  if (act === 'up' || act === 'down') {
    const vote = d.vote === act ? null : act; // tapping again undoes the vote
    const r = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: d.id, vote }) }).catch(() => null);
    if (!r?.ok) return;
    d.vote = vote;
    document.querySelectorAll('#result [data-act="up"], #result [data-act="down"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.act === vote)));
    msg().textContent = vote ? t('act_thanks') : '';
  }
  if (act === 'brief') window.open(`brief.html?id=${encodeURIComponent(d.id)}&lang=${I18N.lang}`, '_blank', 'noopener');
  if (act === 'share') {
    const r = await fetch('/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: d.id }) })
      .then(x => x.json().then(j => ({ ok: x.ok, ...j }))).catch(() => ({}));
    if (!r.ok) { msg().textContent = r.error || t('req_failed'); return; }
    const link = `${location.origin}/?a=${r.id}`;
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { navigator.share({ title: d.question, url: link }).catch(() => {}); return; }
    try { await navigator.clipboard.writeText(link); msg().textContent = `${t('act_copied')}: ${link}`; }
    catch { msg().textContent = link; }
  }
});

// Opened from the widget on another site (/?lang=ru&q=...): that language, and the question asked at once
// A shared link (/?a=<id>) opens that answer; from the widget, a fresh answer is shared on the way
const startParams = new URLSearchParams(location.search);
(() => {
  const l = startParams.get('lang'), q = startParams.get('q');
  if (['ru', 'kk'].includes(l)) { I18N.set(l); loadSuggested(); }
  // Opened from the widget on a page that only the platform has (/?view=dashboard)
  const v = startParams.get('view');
  if (['dashboard', 'sources', 'history', 'about', 'map', 'schools', 'compare', 'outdoor', 'indrive'].includes(v)) setTimeout(() => show(v), 0);
  if (q != null || startParams.get('view') != null || (l != null && !startParams.get('a'))) history.replaceState(null, '', location.pathname);
  if (q && q.trim().length >= 3 && q.length <= 500) { $('#q').value = q.trim(); ask(); }
})();
(async () => {
  const a = startParams.get('a');
  if (!a || !/^[A-Za-z0-9_-]{12}$/.test(a)) return;
  history.replaceState(null, '', `/?a=${a}`);
  const get = () => fetch(`/api/answer/${a}`).then(x => (x.ok ? x.json() : null)).catch(() => null);
  let r = await get();
  if (!r) { // an answer from the last few hours that wasn't shared yet (only the server's own answers can be)
    const s = await fetch('/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a }) }).catch(() => null);
    if (s?.ok) r = await get();
  }
  if (!r) { $('#result').innerHTML = `<p class="error">${esc(t('shared_missing'))}</p>`; return; }
  $('#q').value = r.question;
  lastAnswer = { ...r, id: a, shared: true, mode: 'ai' };
  render(lastAnswer);
})();

// ---------- APA citation and a quote card image for social media ----------
const yearOf = s => (/^\d{4}/.test(s.date || '') ? s.date.slice(0, 4) : 'n.d.');
function apa(s) {
  // APA: no extra full stop after a title that already ends with ? or !; a written answer that is not
  // published online gets "[Unpublished written answer]" instead of a link
  const end = s.url ? ` ${safeHref(s.url).split('#')[0]}` : ' [Unpublished written answer].';
  return {
    ref: `Almaty Air Initiative. (${yearOf(s)}). ${s.title}${/[.?!]$/.test(s.title) ? '' : '.'}${end}`,
    inText: `(Almaty Air Initiative, ${yearOf(s)}${s.page ? `, p. ${s.page}` : s.section ? `, answer to question ${s.section.n}` : ''})`,
  };
}
// Wraps text to the width, shrinking the font until it fits the space
function fitText(ctx, text, maxW, maxH, start, min, weight) {
  for (let size = start; size >= min; size -= 2) {
    ctx.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
    const lines = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; } else line = test;
    }
    if (line) lines.push(line);
    if (lines.length * size * 1.3 <= maxH) return { lines, size };
  }
  return null;
}
function quoteCard(s, question) {
  const W = 1080, c = document.createElement('canvas');
  c.width = W; c.height = W;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, W, W);
  g.addColorStop(0, '#0E8A6A'); g.addColorStop(1, '#0A5C48');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, W);
  // Header: logo and name
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(110, 110, 34, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#0E8A6A'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(110, 124, 18, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = '700 40px system-ui, "Segoe UI", Arial, sans-serif'; ctx.fillText('Taza Copilot', 165, 124);
  ctx.globalAlpha = 0.75; ctx.font = '400 26px system-ui, "Segoe UI", Arial, sans-serif'; ctx.fillText(t('card_by'), 165, 160); ctx.globalAlpha = 1;
  // The quote, as large as fits; a figure in it is what people remember
  ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.font = '700 220px Georgia, serif'; ctx.fillText('“', 70, 400);
  const fit = fitText(ctx, s.quote.replace(/\s+/g, ' ').trim().replace(/^[•●▪·\-–—\s]+/, ''), W - 180, 520, 64, 30, 600);
  ctx.fillStyle = '#fff';
  let y = 330;
  for (const l of (fit || { lines: [s.quote.slice(0, 160) + '…'], size: 30 }).lines) { ctx.fillText(l, 90, y); y += fit.size * 1.3; }
  // Footer: the source and the address
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(0, W - 190, W, 190);
  ctx.fillStyle = '#fff';
  const src = fitText(ctx, `${s.live ? 'AAI sensor network (live)' : s.title}${s.page ? ` · ${t('page_n', { p: s.page })}` : ''}${s.live ? '' : ` · ${yearOf(s)}`}`, W - 180, 80, 30, 22, 600);
  let fy = W - 135;
  for (const l of (src?.lines || []).slice(0, 2)) { ctx.fillText(l, 90, fy); fy += src.size * 1.3; }
  ctx.globalAlpha = 0.85; ctx.font = '400 26px system-ui, "Segoe UI", Arial, sans-serif'; ctx.fillText(`${location.host} · ${t('card_ask')}`, 90, W - 40); ctx.globalAlpha = 1;
  c.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `taza-quote-${(question || 'aai').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40)}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/png');
}
$('#result').addEventListener('click', async e => {
  const card = e.target.closest('[data-card]'), cite = e.target.closest('[data-cite]');
  if (!lastAnswer || (!card && !cite)) return;
  const s = lastAnswer.sources.find(x => String(x.n) === (card || cite).dataset[card ? 'card' : 'cite']);
  if (!s) return;
  if (card) return quoteCard(s, lastAnswer.question);
  const { ref, inText } = apa(s);
  const out = document.getElementById(`cite-${s.n}`);
  out.hidden = false;
  out.textContent = `${ref}  ·  ${t('cite_intext')}: ${inText}`;
  try { await navigator.clipboard.writeText(`${ref}\n${inText}`); out.textContent = `✓ ${t('act_copied')}: ${out.textContent}`; } catch {}
});

// Clicking [n] highlights the source card
$('#result').addEventListener('click', e => {
  const n = e.target.dataset?.n;
  if (!n) return;
  e.preventDefault();
  const card = document.getElementById(`src-${n}`);
  card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card?.classList.add('flash');
  setTimeout(() => card?.classList.remove('flash'), 1400);
});

// ---------- Menu, views and language ----------
const menu = $('#menu');
let currentView = 'ask';
$('#menuBtn').addEventListener('click', () => { menu.hidden = !menu.hidden; $('#menuBtn').setAttribute('aria-expanded', String(!menu.hidden)); });
document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target) && !$('#menuBtn').contains(e.target)) menu.hidden = true; });
menu.addEventListener('click', e => {
  const v = e.target.closest('[data-view]')?.dataset.view;
  const l = e.target.closest('[data-lang]')?.dataset.lang;
  if (v) { show(v); menu.hidden = true; }
  if (l) { I18N.set(l); menu.hidden = true; }
  if (e.target.closest('#tgLink, #waLink')) menu.hidden = true;
});

function show(view, keep) {
  currentView = view;
  document.querySelectorAll('.view').forEach(s => { s.hidden = s.id !== `view-${view}`; });
  if (view === 'ask' && !keep) { $('#q').value = ''; $('#result').innerHTML = ''; lastAnswer = null; $('#q').focus(); }
  if (view === 'map') loadMap();
  if (view === 'dashboard') loadStats();
  if (view === 'history') renderHistory();
  if (view === 'schools') loadSchools();
  if (view === 'compare') loadCompare();
  if (view === 'outdoor') loadOutdoor();
  if (view === 'indrive') loadIndrive();
  if (view === 'widget') renderWidgetPage();
  if (view === 'sources') loadSources();
  if (view === 'ai') loadProviders();
  window.scrollTo(0, 0);
}

// When the language changes, redraw everything that was built in code
document.addEventListener('taza:lang', () => {
  renderStatus();
  renderSaved();
  renderLivePill();
  updateTelegramLink();
  updateWhatsAppLink();
  setMode(askMode);
  if (lastAnswer) render(lastAnswer);
  if (stations.length) renderMarkers(); else setNote(mapNote.key, mapNote.vars);
  if (currentView === 'dashboard') loadStats();
  renderGaps();
  if (currentView === 'history') renderHistory();
  if (currentView === 'compare') { fillCompare(); if (cpLast) renderCompare(cpLast); }
  if (currentView === 'outdoor' && odLast) renderOutdoor(odLast);
  if (currentView === 'indrive') loadIndrive();
  if (currentView === 'schools') renderSchools();
  if (currentView === 'widget' && widgetLang === 'auto') renderWidgetPage();
  if (currentView === 'sources') loadSources();
  if (currentView === 'ai') loadProviders();
  if (lastStation && !$('#stationSheet').hidden) renderStation(lastStation);
});

// ---------- AI model page ----------
let providers = [];
async function loadProviders() {
  providers = await fetch('/api/providers').then(r => r.json());
  const saved = store.get();
  const current = saved.provider || (providers.find(p => p.ready) || providers[0]).id;
  // Cloud providers can always be picked: with the server's key, or with the user's own key.
  // Ollama stays selectable so its setup guide can be read.
  $('#providerList').innerHTML = providers.map(p => {
    const note = p.id === 'anthropic' ? t('note_anthropic') : p.id === 'ollama' ? t('note_ollama') : t('ai_ready');
    const status = p.local ? (p.ready ? note : t('ai_ollama_off')) : p.server_key ? note : t('ai_byok');
    return `<label class="provider">
      <input type="radio" name="provider" value="${p.id}" ${p.id === current ? 'checked' : ''}>
      <span><b>${esc(p.label)}${p.local ? `<span class="tag">${esc(t('tag_free'))}</span>` : ''}${p.server_key ? `<span class="tag">${esc(t('tag_ready'))}</span>` : ''}</b>
      <small>${esc(status)}</small></span>
    </label>`;
  }).join('');
  pickProvider(current, saved.provider === current ? saved.model : null);
}

async function pickProvider(id, model) {
  const p = providers.find(x => x.id === id);
  const saved = store.get();
  $('#localInfo').hidden = !p?.local;
  $('#keyField').hidden = Boolean(p?.local);
  $('#keyInput').value = saved.keys?.[id] || '';
  $('#modelInput').value = model || p?.default_model || '';
  await loadModels(id);
}

async function loadModels(id) {
  const p = providers.find(x => x.id === id);
  const key = $('#keyInput').value.trim();
  $('#modelOptions').innerHTML = '';
  if (!p?.local && !p?.server_key && !key) { $('#modelHint').textContent = t('m_paste'); return; }
  $('#modelHint').textContent = t('m_loading');
  const r = await fetch('/api/models', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: id, api_key: key || undefined }) }).then(r => r.json()).catch(() => ({ models: [] }));
  $('#modelOptions').innerHTML = r.models.map(m => `<option value="${esc(m)}">${m === 'auto' ? esc(t('m_auto_opt')) : ''}</option>`).join('');
  $('#modelHint').textContent = r.models.length ? t('m_count', { n: r.models.length }) + (p.id === 'anthropic' ? t('m_auto') : '')
    : (p.local ? t('m_none_local') : (r.error || t('m_type')));
}

$('#providerList').addEventListener('change', e => { if (e.target.name === 'provider') pickProvider(e.target.value); });
let keyTimer;
$('#keyInput').addEventListener('input', () => {
  clearTimeout(keyTimer);
  keyTimer = setTimeout(() => loadModels(document.querySelector('input[name="provider"]:checked')?.value), 600);
});
$('#saveAi').addEventListener('click', () => {
  const provider = document.querySelector('input[name="provider"]:checked')?.value;
  const model = $('#modelInput').value.trim();
  if (!provider) return;
  const p = providers.find(x => x.id === provider);
  const saved = store.get();
  const keys = { ...(saved.keys || {}) };
  const key = $('#keyInput').value.trim();
  if (key) keys[provider] = key; else delete keys[provider];
  if (!p.local && !p.server_key && !key) { $('#aiSaved').textContent = t('s_needkey'); return; }
  if (p.local && !p.ready) { $('#aiSaved').textContent = t('s_ollama'); return; }
  if (!model && !p.default_model) { $('#aiSaved').textContent = t('s_model'); return; }
  store.set({ provider, model, keys });
  $('#aiSaved').textContent = t('s_saved', { x: `${p.label}${model ? ' · ' + model : ''}${key ? ' · ' + t('your_key') : ''}` });
});

// ---------- Map ----------
let map, markers = [], stations = [];
let mapState = { district: 'city', category: 'all' };
const mapNote = { key: 'map_lead', vars: {} };
function setNote(key, vars = {}) { mapNote.key = key; mapNote.vars = vars; $('#mapNote').textContent = t(key, vars); }

// Approximate centres of Almaty's districts, for zooming
const DISTRICTS = {
  city: [43.25, 76.92, 11], Alatau: [43.285, 76.83, 13], Almaly: [43.255, 76.915, 14], Auezov: [43.225, 76.855, 13],
  Bostandyk: [43.205, 76.905, 13], Medeu: [43.235, 76.985, 13], Nauryzbay: [43.195, 76.79, 13],
  Turksib: [43.32, 76.975, 13], Zhetysu: [43.29, 76.93, 13],
};

function renderMarkers() {
  const { category } = mapState;
  markers.forEach(m => m.remove());
  // "unhealthy" from the voice agent also includes the "very unhealthy" sensors
  const visible = stations.filter(s => category === 'all' || s.category === category || (category === 'unhealthy' && s.category === 'very'));
  markers = visible.map(s => L.marker([s.lat, s.lng], {
    icon: L.divIcon({ className: 'pm-icon', iconSize: [30, 30], iconAnchor: [15, 15],
      html: `<div class="pm-pin ${s.category}" style="background:var(--${s.category})">${Math.round(s.pm25)}</div>` }),
    title: `${s.name}: ${s.pm25} ${t('unit')}, ${catLabel(s.category)}`,
    keyboard: true,
    zIndexOffset: Math.round(s.pm25), // dirtier sensors on top
  }).on('click', () => openStation(s.id)).addTo(map));
  const note = t('map_note', { n: stations.length }) + (category !== 'all' ? t('map_filtered', { v: visible.length, c: catLabel(category) }) : '');
  mapNote.key = 'map_note'; mapNote.vars = { n: stations.length };
  $('#mapNote').textContent = note;
  return visible;
}

async function loadMap(district = 'city', category = 'all') {
  if (!DISTRICTS[district]) district = 'city';
  if (!['all', 'good', 'moderate', 'sensitive', 'unhealthy', 'very'].includes(category)) category = 'all';
  if (!window.L) {
    setNote('map_loading');
    try { await loadScript('vendor/leaflet.js'); } catch { setNote('map_unreach'); return { shown: 0 }; }
  }
  if (!map) {
    // Mouse wheel zooms the map (the + and − buttons stay); pinch zoom works on phones
    map = L.map('map', { scrollWheelZoom: true, wheelDebounceTime: 40, wheelPxPerZoomLevel: 90 }).setView([43.25, 76.92], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap' }).addTo(map);
    // Zoomed out: small dots so 150+ sensors stay readable. Zoomed in: numbered pins.
    const sizeByZoom = () => $('#map').classList.toggle('zoomed-out', map.getZoom() < 13);
    map.on('zoomend', sizeByZoom);
    sizeByZoom();
  }
  setTimeout(() => map.invalidateSize(), 50);
  if (!stations.length) {
    // Keep trying for about 30 seconds (e.g. while the server restarts or AAI is slow), showing that it is loading
    setNote('map_loading');
    let d = null;
    for (let i = 0; i < 12; i++) {
      d = await fetch('/api/live').then(r => r.json()).catch(() => null);
      if (d?.stations?.length) break;
      if (d && d.available === false) break; // no AAI key on the server: retrying will not help
      await new Promise(r => setTimeout(r, Math.min(1000 + i * 500, 4000)));
    }
    if (!d?.stations?.length) {
      setNote(d?.available === false ? 'map_nokey' : 'map_unreach');
      return { shown: 0 };
    }
    stations = d.stations;
  }
  mapState = { district, category };
  const visible = renderMarkers();
  const [lat, lng, zoom] = DISTRICTS[district] || DISTRICTS.city;
  map.invalidateSize();
  map.flyTo([lat, lng], zoom, { duration: 1.2 });
  // Summary for the voice agent: what is on screen
  const inView = visible.filter(s => Math.abs(s.lat - lat) < (zoom >= 13 ? 0.04 : 0.2) && Math.abs(s.lng - lng) < (zoom >= 13 ? 0.06 : 0.3));
  const avg = inView.length ? inView.reduce((a, s) => a + s.pm25, 0) / inView.length : null;
  const worst = [...inView].sort((a, b) => b.pm25 - a.pm25)[0];
  return { district, category, sensors_in_view: inView.length, average_pm25: avg && +avg.toFixed(1),
    highest: worst ? `${worst.name} ${worst.pm25} µg/m³` : null, who_24h_guideline: 15 };
}

// ---------- Sensor details sheet ----------
const FACES = {
  happy: '<path d="M8 14s1.5 2 4 2 4-2 4-2"/>', flat: '<path d="M8.5 15h7"/>', sad: '<path d="M16 16s-1.5-2-4-2-4 2-4 2"/>',
};
const face = cat => `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <circle cx="12" cy="12" r="10"/>${FACES[cat === 'good' ? 'happy' : cat === 'moderate' ? 'flat' : 'sad']}<path d="M9 9.5h.01M15 9.5h.01" stroke-width="3"/></svg>`;

function chartSvg(series, color, avg) {
  if (series.length < 2) return `<p class="muted">${esc(t('st_few'))}</p>`;
  const W = 400, H = 150, L = 30, R = 8, T = 10, B = 22;
  const vs = series.map(p => p.v), lo = Math.floor(Math.min(...vs) * 0.9), hi = Math.ceil(Math.max(...vs) * 1.08);
  const x = i => L + (W - L - R) * i / (series.length - 1), y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo || 1));
  const pts = series.map((p, i) => [x(i), y(p.v)]);
  // Smooth line (Catmull-Rom to Bezier)
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1] || pts[i], pts[i], pts[i + 1], pts[i + 2] || pts[i + 1]];
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  const ticks = [lo, Math.round(lo + (hi - lo) / 3), Math.round(lo + 2 * (hi - lo) / 3), hi];
  const step = Math.max(1, Math.round(series.length / 5));
  const labels = series.map((p, i) => (i % step === 0 || i === series.length - 1) && (i === series.length - 1 || series.length - 1 - i >= step / 2)
    ? `<text x="${x(i)}" y="${H - 5}" text-anchor="middle">${p.t}</text>` : '').join('');
  return `<svg class="st-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="PM2.5, ${esc(t('st_last24'))}">
    <defs><linearGradient id="stFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".3"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-dasharray="3 4"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('')}
    <path d="${d} L${pts[pts.length - 1][0]},${H - B} L${pts[0][0]},${H - B} Z" fill="url(#stFill)"/>
    <line x1="${L}" x2="${W - R}" y1="${y(avg)}" y2="${y(avg)}" stroke="var(--muted)" stroke-dasharray="6 5" opacity=".7"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
    ${labels}</svg>`;
}

const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Almaty' }) : '';

let lastStation = null;
function renderStation(d) {
  const color = getComputedStyle(document.documentElement).getPropertyValue(`--${d.category}`).trim();
  const trend = d.change_24h == null ? '' : `<div class="st-trend"><b>${d.change_24h > 0 ? '↗ +' : d.change_24h < 0 ? '↘ ' : '→ '}${d.change_24h}</b>${esc(t('st_24h'))}</div>`;
  const advice = t(`advice_${d.category}`);
  $('#stationBody').innerHTML = `
    <div class="st-head ${d.category}" style="background:${color}">
      <div class="st-top">
        <div><h2 class="st-name" id="stName">${esc(d.name)}</h2>
          <div class="st-sub">${esc(t('st_updated', { t: fmtTime(d.updated) }))}</div></div>
        ${trend}
      </div>
      <hr class="st-rule">
      <div class="st-label">PM2.5</div>
      <div class="st-cat">${esc(catLabel(d.category))}</div>
      <div class="st-value"><b>${Math.round(d.pm25)}<small>${esc(t('unit'))}</small></b><span class="st-face">${face(d.category)}</span></div>
    </div>
    <div class="st-card">
      <h3>${esc(t('st_last24'))} <span>${esc(t('st_hourly'))}</span></h3>
      ${chartSvg(d.series, color, d.avg)}
      <div class="st-stats"><div><span>${esc(t('st_min'))}</span><b>${d.min ?? '–'}</b></div><div><span>${esc(t('st_avg'))}</span><b>${d.avg ?? '–'}</b></div><div><span>${esc(t('st_max'))}</span><b>${d.max ?? '–'}</b></div></div>
      <div class="st-extra">${d.pm10 != null ? `<span>PM10 ${d.pm10} ${esc(t('unit'))}</span>` : ''}${d.temperature != null ? `<span>${d.temperature} °C</span>` : ''}${d.humidity != null ? `<span>${esc(t('st_humidity', { h: d.humidity }))}</span>` : ''}<span>${esc(t('st_who'))}</span></div>
    </div>
    <div class="st-card">
      <h3>${esc(t('st_advice'))}</h3>
      <ul class="st-advice">${(Array.isArray(advice) ? advice : d.advice).map(a => `<li>${esc(a)}</li>`).join('')}</ul>
    </div>`;
}

async function openStation(id) {
  const sheet = $('#stationSheet');
  $('#stationBody').innerHTML = `<div class="loading"><span class="spinner"></span>${esc(t('st_loading'))}</div>`;
  sheet.hidden = false;
  document.body.style.overflow = 'hidden';
  const d = await fetch(`/api/station/${id}`).then(r => r.json()).catch(() => ({ error: t('st_error') }));
  if (d.error || !d.available) {
    lastStation = null;
    $('#stationBody').innerHTML = `<p class="error">${esc(d.available === false ? t('map_nokey') : d.error === 'This sensor has no data right now.' ? t('st_nodata') : d.error || t('st_error'))}</p>`;
    return d;
  }
  lastStation = d;
  renderStation(d);
  sheet.querySelector('.sheet-close').focus();
  return d;
}
function closeStation() { $('#stationSheet').hidden = true; document.body.style.overflow = ''; }
$('#stationSheet').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeStation(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#stationSheet').hidden) closeStation(); });

// Find a sensor by name, or the worst / cleanest one in a district (used by the voice agent)
function findStation({ name, district = 'city', pick = 'worst' } = {}) {
  if (name) {
    const q = name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    const hit = stations.find(s => s.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').includes(q));
    if (hit) return hit;
  }
  const [lat, lng] = DISTRICTS[district] || DISTRICTS.city;
  const near = stations.filter(s => district === 'city' || (Math.abs(s.lat - lat) < 0.04 && Math.abs(s.lng - lng) < 0.06));
  const list = [...(near.length ? near : stations)].sort((a, b) => b.pm25 - a.pm25);
  return pick === 'best' ? list[list.length - 1] : list[0];
}

// Used by the voice agent (voice.js)
window.taza = {
  openStation: id => openStation(id),
  closeStation,
  findStation: async opts => { if (!stations.length) await loadMap(); return findStation(opts); },
  focusStation: s => { if (map && s) map.flyTo([s.lat, s.lng], 15, { duration: 1 }); },
  ask: q => ask(q),
  show: (v, keep) => show(v, keep),
  showMap: async (district, category) => { currentView = 'map'; document.querySelectorAll('.view').forEach(s => { s.hidden = s.id !== 'view-map'; }); return loadMap(district, category); },
  // Opens Compare with these choices and resolves with what is shown (or why nothing is)
  compare: async (type, a, b, year) => {
    cpType = ['districts', 'years', 'cities'].includes(type) ? type : 'districts';
    $('#cpTabs').querySelectorAll('[data-cp]').forEach(btn => btn.setAttribute('aria-selected', String(btn.dataset.cp === cpType)));
    fillCompare();
    const set = (sel, v) => { const el = $(sel); if (v != null && [...el.options].some(o => o.value === String(v))) el.value = String(v); };
    set('#cpA', a); set('#cpB', b); set('#cpYear', year);
    cpLast = null;
    show('compare');
    const end = Date.now() + 30000;
    while (Date.now() < end && !$('#cpOut .cp-result, #cpOut .error') && !(cpType !== 'cities' && $('#cpA').value === $('#cpB').value)) await new Promise(r => setTimeout(r, 250));
    const head = $('#cpOut .cp-head');
    return cpLast && head ? { headline: head.textContent, period: $('#cpOut .cp-result .muted')?.textContent, data: cpLast }
      : { error: $('#cpOut').textContent.trim() || 'No result' };
  },
  // Opens "Best time to go out" and resolves with today's plan
  outdoor: async () => {
    show('outdoor');
    const end = Date.now() + 25000;
    while (Date.now() < end && !$('#odOut .od-best, #odOut .error')) await new Promise(r => setTimeout(r, 250));
    return odLast || { error: $('#odOut').textContent.trim() || 'No result' };
  },
};

// ---------- Widget page: the one line to copy, and the real widget running in a pretend website ----------
let widgetLang = 'auto';
function renderWidgetPage() {
  const attr = widgetLang === 'auto' ? '' : ` data-lang="${widgetLang}"`;
  $('#wdCode').textContent = `<script src="${location.origin}/widget.js"${attr} async></script>`;
  document.querySelectorAll('[data-wl]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.wl === widgetLang)));
  // The same widget.js the website would load, shown inside the preview box
  const s = document.createElement('script');
  s.src = 'widget.js';
  s.dataset.target = '#wdSite';
  // On a phone the site's own voice button sits in the bottom-right corner: keep the preview's button clear of it
  if (innerWidth < 760) s.dataset.position = 'left';
  s.dataset.lang = widgetLang === 'auto' ? I18N.lang : widgetLang;
  document.body.appendChild(s);
  s.onload = () => s.remove();
}
document.querySelector('.wd-langs').addEventListener('click', e => {
  const l = e.target.closest('[data-wl]')?.dataset.wl;
  if (l) { widgetLang = l; renderWidgetPage(); }
});
$('#wdCopy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#wdCode').textContent); $('#wdCopy').textContent = t('act_copied'); }
  catch { const r = document.createRange(); r.selectNodeContents($('#wdCode')); getSelection().removeAllRanges(); getSelection().addRange(r); }
  setTimeout(() => { $('#wdCopy').textContent = t('wd_copy'); }, 2000);
});

// ---------- Schools and kindergartens ranked by air now ----------
const CAT_COLOR = { good: 'var(--good)', moderate: 'var(--moderate)', sensitive: 'var(--sensitive)', unhealthy: 'var(--unhealthy)', very: 'var(--very)' };
let schoolsData = null;
async function loadSchools() {
  schoolsData = await fetch('/api/schools').then(r => r.json()).catch(() => null);
  renderSchools();
}
function renderSchools() {
  const d = schoolsData;
  if (!d?.available || !d.schools) { $('#schoolsSummary').innerHTML = ''; $('#schoolsList').innerHTML = `<li class="muted">${esc(t(d ? 'br_nolive' : 'map_loading'))}</li>`; return; }
  $('#schoolsSummary').innerHTML = [[d.total, t('sc_sensors')], [d.above_who, t('sc_who')], [d.above_kz, t('sc_kz')]]
    .map(([b, l]) => `<div class="stat"><b>${esc(String(b))}</b><span>${esc(l)}</span></div>`).join('');
  const max = Math.max(40, ...d.schools.map(s => s.pm25));
  const time = d.updated ? new Date(d.updated).toLocaleTimeString(I18N.lang === 'kk' ? 'kk-KZ' : I18N.lang === 'ru' ? 'ru-RU' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
  $('#schoolsList').innerHTML = d.schools.map(s => `<li>
      <span class="sc-name">${esc(s.name)} <span class="muted small">· ${esc(t(s.kind === 'school' ? 'sc_school' : 'sc_kinder'))}</span></span>
      <span class="sc-bar"><i style="width:${Math.max(3, 100 * s.pm25 / max).toFixed(1)}%;background:${CAT_COLOR[s.category] || 'var(--unknown)'}"></i></span>
      <b class="sc-val">${esc(String(s.pm25))}</b>
      <button type="button" class="act sc-map" data-sid="${s.id}">${esc(t('sc_map'))}</button>
    </li>`).join('') + (time ? `<li class="muted small sc-note">${esc(t('sc_updated', { time }))}</li>` : '');
}
$('#schoolsList').addEventListener('click', async e => {
  const id = Number(e.target.closest('[data-sid]')?.dataset.sid);
  const s = schoolsData?.schools.find(x => x.id === id);
  if (!s) return;
  await window.taza.showMap();
  window.taza.focusStation(s);
  openStation(s.id);
});
$('#scAsk').addEventListener('click', () => { show('ask', true); $('#q').value = t('sc_q'); ask(); });
$('#scBest').addEventListener('click', () => show('outdoor'));

// ---------- Compare: two districts, two years, or Almaty against another city ----------
const CP = {
  districts: ['Alatau', 'Almaly', 'Auezov', 'Bostandyq', 'Medeu', 'Nauryzbay', 'Turksib', 'Zhetysu'],
  cities: ['bishkek', 'tashkent', 'lahore', 'kathmandu'],
  first: 2022,
};
let cpType = 'districts', cpLast = null, cpSeq = 0;
const cpThisYear = new Date().getFullYear();
const cpName = key => t(`pl_${String(key).toLowerCase()}`) || key;

function fillCompare() {
  const a = $('#cpA'), b = $('#cpB'), y = $('#cpYear');
  const keep = [a.value, b.value, y.value];
  const opt = (v, label) => `<option value="${esc(v)}">${esc(label)}</option>`;
  const years = [];
  for (let i = cpThisYear; i >= CP.first; i--) years.push(String(i));
  if (cpType === 'districts') {
    a.innerHTML = CP.districts.map(d => opt(d, cpName(d))).join('');
    b.innerHTML = a.innerHTML;
    y.innerHTML = years.map(v => opt(v, v)).join('');
    y.hidden = false; a.disabled = false;
    if (!CP.districts.includes(keep[0])) { a.value = 'Turksib'; b.value = 'Bostandyq'; y.value = String(cpThisYear - 1); }
    else { a.value = keep[0]; b.value = keep[1]; y.value = keep[2] || String(cpThisYear - 1); }
  } else if (cpType === 'years') {
    a.innerHTML = years.map(v => opt(v, v)).join('');
    b.innerHTML = a.innerHTML;
    y.hidden = true; a.disabled = false;
    if (!years.includes(keep[0])) { a.value = String(cpThisYear); b.value = String(cpThisYear - 1); }
    else { a.value = keep[0]; b.value = keep[1]; }
  } else {
    a.innerHTML = opt('almaty', cpName('almaty'));
    a.disabled = true;
    b.innerHTML = CP.cities.map(c => opt(c, cpName(c))).join('');
    y.hidden = true;
    b.value = CP.cities.includes(keep[1]) ? keep[1] : 'bishkek';
  }
}

async function loadCompare(retry = true) {
  if (!$('#cpA').options.length) fillCompare();
  const a = $('#cpA').value, b = $('#cpB').value, year = $('#cpYear').value;
  const out = $('#cpOut');
  if (cpType !== 'cities' && a === b) { out.innerHTML = `<p class="muted">${esc(t('cp_same'))}</p>`; return; }
  const seq = ++cpSeq;
  out.innerHTML = `<p class="muted">${esc(t('cp_loading'))}</p>`;
  try {
    const qs = new URLSearchParams({ type: cpType, a, b, year: cpType === 'districts' ? year : '' });
    const r = await fetch(`/api/compare?${qs}`);
    const d = await r.json();
    if (seq !== cpSeq) return; // a newer choice is already loading
    if (!r.ok || d.error) throw new Error(d.error || 'error');
    if (!d.available) { out.innerHTML = `<p class="muted">${esc(t('cp_off'))}</p>`; return; }
    cpLast = d;
    renderCompare(d);
  } catch {
    if (seq !== cpSeq) return;
    if (retry) { setTimeout(() => { if (seq === cpSeq) loadCompare(false); }, 4000); return; }
    out.innerHTML = `<p class="error">${esc(t('cp_error'))}</p>`;
  }
}

function renderCompare(d) {
  const out = $('#cpOut');
  const nameOf = s => (d.type === 'years' ? s.label : cpName(s.key));
  const A = nameOf(d.a), B = nameOf(d.b);
  if (!d.days || d.a.avg == null || d.b.avg == null) { out.innerHTML = `<p class="muted">${esc(t('cp_nodata', { a: A, b: B }))}</p>`; return; }
  // Headline: which side was dirtier, and by how much
  const hi = d.a.avg >= d.b.avg ? [A, d.a.avg] : [B, d.b.avg], lo = d.a.avg >= d.b.avg ? [B, d.b.avg] : [A, d.a.avg];
  const times = hi[1] / lo[1];
  const head = times < 1.05 ? t('cp_same_air', { a: A, b: B })
    : times >= 1.5 ? t('cp_times', { hi: hi[0], lo: lo[0], x: times.toFixed(1) })
    : t('cp_pct', { hi: hi[0], lo: lo[0], p: Math.round((times - 1) * 100) });
  // Period: the days both sides have data
  const day = k => {
    const [m, dd] = k.slice(-5).split('-').map(Number);
    return I18N.date(new Date(2001, m - 1, dd));
  };
  const period = t(d.type === 'years' ? 'cp_period_years' : 'cp_period', { n: d.days, from: day(d.from), to: day(d.to), y: d.year || '' });
  // Chart: monthly averages side by side, with the WHO (15) and Kazakhstan (35) lines
  const W = Math.round(Math.min(720, Math.max(300, out.clientWidth || 640))), H = 230, L = 34, R = 8, T = 10, Bm = 24;
  const vals = [...d.a.monthly, ...d.b.monthly].filter(v => v != null);
  const max = Math.max(40, ...vals) * 1.1;
  const y = v => T + (H - T - Bm) * (1 - v / max);
  const gw = (W - L - R) / 12, bw = Math.min(16, gw / 2 - 3);
  const month = i => I18N.date(new Date(2001, i, 1), { day: false });
  const bars = d.a.monthly.map((va, i) => {
    const x0 = L + i * gw + gw / 2;
    const bar = (v, x, cls, who) => v == null ? '' :
      `<rect x="${x}" y="${y(v)}" width="${bw}" height="${Math.max(1, H - Bm - y(v))}" rx="3" class="${cls}"><title>${esc(who)} · ${esc(month(i))}: ${v} µg/m³</title></rect>`;
    return bar(va, x0 - bw - 1, 'cp-a', A) + bar(d.b.monthly[i], x0 + 1, 'cp-b', B) +
      `<text x="${x0}" y="${H - 7}" text-anchor="middle" class="ch-l">${esc(month(i))}</text>`;
  }).join('');
  const line = (v, label) => v < max ? `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="cp-limit"/><text x="${L - 4}" y="${y(v) + 4}" text-anchor="end" class="ch-l">${v}</text>` : '';
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('cp_chart', { a: A, b: B }))}">
    ${line(15, t('cp_who'))}${line(35, t('cp_kz'))}${bars}</svg>`;
  const card = (s, name, cls) => `<div class="cp-card ${cls}"><h3><i></i>${esc(name)}</h3>
    <b>${s.avg} <small>µg/m³</small></b><span>${esc(t('cp_avg'))}</span>
    <ul class="plain"><li>🌿 ${esc(t('cp_clean', { n: s.clean_days }))}</li><li>⚠️ ${esc(t('cp_over', { n: s.over_limit_days }))}</li></ul></div>`;
  const q = d.type === 'years' ? t('cp_q_years', { a: A, b: B }) : d.type === 'districts' ? t('cp_q_districts', { a: A, b: B }) : t('cp_q_cities', { b: B });
  out.innerHTML = `<div class="cp-result">
    <p class="cp-head">${esc(head)}</p>
    <p class="muted small">${esc(period)}</p>
    <div class="cp-cards">${card(d.a, A, 'cp-a')}${card(d.b, B, 'cp-b')}</div>
    <figure class="answer-chart cp-chart"><figcaption>${esc(t('cp_monthly'))}</figcaption>${svg}
      <div class="cp-legend"><span><i class="cp-a"></i>${esc(A)}</span><span><i class="cp-b"></i>${esc(B)}</span><span><i class="cp-dash"></i>15 ${esc(t('cp_who'))} · 35 ${esc(t('cp_kz'))}</span></div></figure>
    <p class="muted small">${esc(t('cp_source'))}</p>
    <p><button class="act" type="button" id="cpAsk">💬 ${esc(t('cp_ask'))}</button></p>
  </div>`;
  $('#cpAsk').addEventListener('click', () => { show('ask', true); $('#q').value = q; ask(); });
}

$('#cpTabs').addEventListener('click', e => {
  const btn = e.target.closest('[data-cp]');
  if (!btn || btn.dataset.cp === cpType) return;
  cpType = btn.dataset.cp;
  $('#cpTabs').querySelectorAll('[data-cp]').forEach(b => b.setAttribute('aria-selected', String(b === btn)));
  fillCompare();
  loadCompare();
});
['#cpA', '#cpB', '#cpYear'].forEach(s => $(s).addEventListener('change', () => loadCompare()));

// ---------- Taza for inDrive (concept): the morning message for drivers and riders, from /api/partner/brief ----------
let idRole = 'driver', idLast = null, idSeq = 0;
// A demo point for the location features: Abay Avenue at Dostyk (the app would send the real pickup)
const ID_POINT = { lat: 43.2398, lng: 76.9455 }, ID_DRIVER = { lat: 43.2017, lng: 76.8919 };
const idCode = () => { const p = idRole === 'driver' ? ID_DRIVER : ID_POINT; $('#idCode').textContent = `GET ${location.origin}/api/partner/brief?lang=${I18N.lang}${idRole === 'video' ? '' : `&role=${idRole}`}&lat=${p.lat}&lng=${p.lng}`; };
async function loadIndrive() {
  idCode();
  const seq = ++idSeq;
  if (!idLast || idLast.lang !== I18N.lang) $('#idPhone').innerHTML = `<p class="muted">${esc(t('cp_loading'))}</p>`;
  try {
    // Two demo points: the rider's pickup (Abay Ave) and where a driver waits (Mega Alma-Ata)
    const q = (role, p) => fetch(`/api/partner/brief?lang=${encodeURIComponent(I18N.lang)}&role=${role}&lat=${p.lat}&lng=${p.lng}`);
    const [r, rd] = await Promise.all([q('rider', ID_POINT), q('driver', ID_DRIVER)]);
    const d = await r.json();
    if (rd.ok) d.driver = (await rd.json()).driver;
    if (seq !== idSeq) return;
    if (!r.ok || !d.available) throw new Error(d.error || 'off');
    idLast = d;
    renderIndrive(d);
  } catch {
    if (seq === idSeq) $('#idPhone').innerHTML = `<p class="error">${esc(t('cp_error'))}</p>`;
  }
}
function renderIndrive(d) {
  const video = idRole === 'video';
  $('#idVideo').hidden = !video;
  document.querySelector('#view-indrive .id-grid').hidden = video;
  if (video) return;
  const m = d[idRole];
  if (!m) return;
  const now = new Date();
  // Driver: what the app shows in a traffic jam, and a cleaner place for a break. Rider: the air at the pickup, and Ask Taza.
  const extra = idRole === 'driver'
    ? `${m.jam ? `<div class="id-toast"><b>🚦 ${esc(m.jam.title)}</b><p>${esc(m.jam.body)}</p></div>` : ''}
       ${m.break_spot ? `<div class="id-spot"><span class="id-tag">${esc(t('id_break'))}</span><p>📍 ${esc(m.break_spot.text)}</p></div>` : ''}`
    : `${m.pickup ? `<div class="id-spot" style="--c: var(--${esc(m.pickup.category)})"><span class="id-tag">${esc(t('id_pickup'))}</span><p>📍 ${esc(m.pickup.text)}</p></div>` : ''}`;
  const ask = idRole === 'rider' && /^https?:\/\//.test(d.ask_url || '')
    ? `<a class="id-ask" href="${esc(d.ask_url)}" target="_blank" rel="noopener">💬 ${esc(t('id_ask'))}</a>` : '';
  // A phone: the lock-screen push (sent only on mornings above the limit), then the banner inside the app
  $('#idPhone').innerHTML = `<div class="id-screen">
      <div class="id-clock">07:45<small>${esc(I18N.date(now, { month: 'long' }))}</small></div>
      <div class="id-push ${d.send_push ? '' : 'id-off'}">
        <div class="id-push-top"><i class="id-icon" aria-hidden="true"></i><b>inDrive</b><span>${esc(t('id_now'))}</span></div>
        <b class="id-push-title">${esc(m.title)}</b><p>${esc(m.body)}</p>
      </div>
      <p class="id-push-note">${esc(t(d.send_push ? 'id_push_yes' : 'id_push_no'))}</p>
      <div class="id-app">
        <div class="id-app-bar"><i class="id-icon" aria-hidden="true"></i><b>inDrive</b></div>
        ${idRole === 'rider' ? extra : ''}
        <div class="id-banner" style="--c: var(--${esc(d.air.category)})">
          <span class="id-tag">${esc(t('id_banner'))}</span>
          <b>${esc(m.title)}</b>
          <ul>${m.tips.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
          <small>${esc(t('id_banner_src'))}</small>
        </div>
        ${idRole === 'driver' ? extra : ''}${ask}
      </div>
    </div>`;
  $('#idQuote').textContent = `“${d.source.quote}”`;
  const src = $('#idSrc');
  src.href = /^https:\/\/air\.org\.kz\//.test(d.source.url) ? d.source.url : 'https://air.org.kz/';
  src.textContent = `📄 ${d.source.title}, ${t('id_page', { n: d.source.page })}`;
}
$('#idRoles').addEventListener('click', e => {
  const b = e.target.closest('[data-role]');
  if (!b || b.dataset.role === idRole) return;
  idRole = b.dataset.role;
  $('#idRoles').querySelectorAll('[data-role]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  idCode();
  if (idRole !== 'video') $('#idVideo video')?.pause();
  if (idLast || idRole === 'video') renderIndrive(idLast || {});
});

// ---------- Best time to go out today: real hours so far, an estimate for the hours ahead ----------
let odLast = null;
const hh = h => `${String(h % 24).padStart(2, '0')}:00`;

async function loadOutdoor(retry = true) {
  const out = $('#odOut');
  if (!odLast) out.innerHTML = `<p class="muted">${esc(t('cp_loading'))}</p>`;
  try {
    const r = await fetch('/api/outdoor');
    const d = await r.json();
    if (!r.ok || d.error) throw new Error(d.error || 'error');
    if (!d.available) { out.innerHTML = `<p class="muted">${esc(t('cp_off'))}</p>`; return; }
    odLast = d;
    renderOutdoor(d);
  } catch {
    // The AAI API is sometimes slow on a first request: try once more before showing an error
    if (retry) { setTimeout(() => loadOutdoor(false), 4000); return; }
    if (!odLast) out.innerHTML = `<p class="error">${esc(t('cp_error'))}</p>`;
  }
}

function renderOutdoor(d) {
  const out = $('#odOut');
  const tomorrow = d.day === 'tomorrow';
  $('#odTitle').textContent = t(tomorrow ? 'od_h1_tomorrow' : 'od_h1');
  const win = (w, kind) => `<div class="od-card od-${kind}" style="--c: var(--${w.category})">
    <span class="od-tag">${esc(t(kind === 'best' ? 'od_best' : 'od_avoid'))}</span>
    <b>${hh(w.from)}–${hh(w.to)}</b>
    <span class="od-val"><i class="dot ${esc(w.category)}"></i>≈ ${w.pm25} µg/m³ · ${esc(catLabel(w.category))}</span></div>`;
  // 24 hours: measured today (solid), estimate (faded), the best and worst windows shaded
  const W = Math.round(Math.min(720, Math.max(300, out.clientWidth || 640))), H = 190, L = 30, R = 6, T = 8, Bm = 22;
  const vals = d.hours.map(x => x.pm25).filter(v => v != null);
  const max = Math.max(40, ...vals) * 1.1;
  const bw = (W - L - R) / 24;
  const y = v => T + (H - T - Bm) * (1 - v / max);
  const band = (w, cls) => `<rect x="${L + w.from * bw}" y="${T}" width="${bw * (w.to - w.from)}" height="${H - T - Bm}" class="${cls}" rx="4"/>`;
  const bars = d.hours.map(x => x.pm25 == null ? '' :
    `<rect x="${L + x.h * bw + 1.5}" y="${y(x.pm25)}" width="${Math.max(2, bw - 3)}" height="${Math.max(1, H - Bm - y(x.pm25))}" rx="2"
      fill="var(--${x.category})" class="${x.kind === 'estimate' ? 'od-est' : ''}"><title>${hh(x.h)} · ${x.pm25} µg/m³ · ${esc(t(x.kind === 'estimate' ? 'od_est' : 'od_measured'))}</title></rect>`).join('');
  const ticks = [0, 3, 6, 9, 12, 15, 18, 21].map(h => `<text x="${L + h * bw + bw / 2}" y="${H - 6}" text-anchor="middle" class="ch-l">${hh(h)}</text>`).join('');
  const lines = [15, 35].filter(v => v < max).map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="cp-limit"/><text x="${L - 4}" y="${y(v) + 4}" text-anchor="end" class="ch-l">${v}</text>`).join('');
  const nowX = L + (d.hour_now + 0.5) * bw;
  const nowMark = tomorrow ? '' : `<line x1="${nowX}" x2="${nowX}" y1="${T}" y2="${H - Bm}" class="od-now"/><text x="${nowX}" y="${T + 10}" text-anchor="middle" class="ch-v od-now-t">${esc(t('od_now'))}</text>`;
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('od_chart'))}">${band(d.best, 'od-band-best')}${band(d.worst, 'od-band-worst')}${lines}${bars}${nowMark}${ticks}</svg>`;
  const now = d.now ? `<p class="od-nowline"><i class="dot ${esc(d.now.category)}"></i>${esc(t('od_now_val', { v: d.now.pm25, c: catLabel(d.now.category) }))}</p>` : '';
  out.innerHTML = `${now}
    <div class="od-cards">${win(d.best, 'best')}${win(d.worst, 'worst')}</div>
    <p class="od-advice">${esc(t(`od_adv_${d.best.category}`))}</p>
    <figure class="answer-chart cp-chart"><figcaption>${esc(t('od_chart'))}</figcaption>${svg}
      <div class="cp-legend"><span><i class="od-l-solid"></i>${esc(t('od_measured'))}</span><span><i class="od-l-est"></i>${esc(t('od_est'))}</span>
      <span><i class="od-l-best"></i>${esc(t('od_best'))}</span><span><i class="od-l-worst"></i>${esc(t('od_avoid'))}</span></div></figure>
    <p class="muted small">${esc(t('od_how'))}</p>`;
}

// ---------- History: typed answers and voice calls, kept in this browser only ----------
const history_ = (() => {
  const KEY = 'taza-history', MAX = 50;
  const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
  const write = list => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); } catch {} };
  const add = entry => { write([...read(), { ...entry, at: new Date().toISOString() }]); if (currentView === 'history') renderHistory(); };
  return {
    read, clear: () => { try { localStorage.removeItem(KEY); } catch {} },
    addAnswer: (d, channel) => {
      if (!d?.text) return;
      add({ type: 'answer', channel, id: d.id, question: d.question, lang: d.lang, text: d.text, found: d.found, verdict: d.verdict || null,
        sources: (d.sources || []).map(s => ({ n: s.n, title: s.title, page: s.page, section: s.section, url: s.url, live: s.live, lang: s.lang, quote: (s.quote || '').slice(0, 400) })) });
    },
    addVoice: transcript => {
      const lines = (transcript || []).filter(l => l?.text).map(l => ({ role: l.role === 'user' ? 'user' : 'agent', text: String(l.text).slice(0, 2000) }));
      if (lines.length) add({ type: 'voice', lines });
    },
  };
})();
window.tazaHistory = { addVoice: history_.addVoice };

const when = iso => `${I18N.date(iso)}, ${I18N.time(iso)}`;
function renderHistory() {
  const list = history_.read().slice().reverse();
  $('#historyList').innerHTML = list.length ? list.map((h, i) => h.type === 'voice' ? `
    <details class="hist">
      <summary><span class="badge">🎙</span> <b>${esc(t('h_voice'))}</b> <span class="muted small">· ${esc(when(h.at))}</span></summary>
      <div class="hist-body">${h.lines.map(l => `<p><b>${esc(l.role === 'user' ? t('h_you') : 'Taza')}:</b> ${esc(l.text)}</p>`).join('')}</div>
    </details>` : `
    <details class="hist">
      <summary><span class="badge">${h.channel === 'voice' ? '🎙' : '⌨'}</span> <b>${esc(h.question)}</b> <span class="muted small">· ${esc(when(h.at))}</span></summary>
      <div class="hist-body">
        <p>${esc(h.text).replace(/\[(\d+)\]/g, '<sup>[$1]</sup>')}</p>
        ${h.sources.length ? `<p class="muted small"><b>${esc(t('h_sources'))}:</b></p><ol class="small">${h.sources.map(s =>
          `<li>${s.live ? 'AAI sensor network (live)' : `${s.url ? `<a href="${safeHref(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title)}${s.page ? `, ${esc(t('page_n', { p: s.page }))}` : ''}${s.section ? `, ${esc(t('answer_to_q', { n: s.section.n }))}` : ''}${s.url ? '' : ` · ${esc(t('src_unpublished'))}`}`}</li>`).join('')}</ol>` : ''}
        <button type="button" class="act no-print" data-hopen="${list.length - 1 - i}">${esc(t('h_open'))} →</button>
      </div>
    </details>`).join('') : `<p class="muted">${esc(t('h_empty'))}</p>`;
}
$('#historyList').addEventListener('click', e => {
  const i = e.target.closest('[data-hopen]')?.dataset.hopen;
  if (i == null) return;
  const h = history_.read()[Number(i)];
  if (!h) return;
  show('ask', true);
  $('#q').value = h.question;
  lastAnswer = { ...h, saved: true, mode: 'ai' };
  render(lastAnswer);
});
// Markdown export, made in the browser (nothing is uploaded)
$('#hExport').addEventListener('click', () => {
  const list = history_.read();
  if (!list.length) return;
  const md = [`# ${t('h_title')}`, '', t('h_exported', { date: new Date().toLocaleString() }), ''];
  for (const h of list) {
    md.push('---', '');
    if (h.type === 'voice') {
      md.push(`## ${t('h_voice')} · ${when(h.at)}`, '', ...h.lines.map(l => `**${l.role === 'user' ? t('h_you') : 'Taza'}:** ${l.text}  `), '');
    } else {
      md.push(`## ${h.question}`, `*${when(h.at)} · ${h.channel === 'voice' ? t('h_by_voice') : t('h_typed')}*`, '', h.text, '');
      if (h.sources.length) md.push(`**${t('h_sources')}**`, '', ...h.sources.map(s => `${s.n}. ${s.live ? 'AAI sensor network (live)' : (s.url ? `[${s.title}${s.page ? `, ${t('page_n', { p: s.page })}` : ''}](${s.url})` : `${s.title}${s.section ? `, ${t('answer_to_q', { n: s.section.n })}` : ''} (${t('src_unpublished')})`)}${s.quote ? ` — “${s.quote.replace(/\s+/g, ' ')}”` : ''}`), '');
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([md.join('\n')], { type: 'text/markdown;charset=utf-8' }));
  a.download = `taza-history-${new Date().toISOString().slice(0, 10)}.md`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});
// Print: every entry opened, only the history on the page
// (phones print after window.print() returns, so the page is put back only when printing ends: print.js)
$('#hPrint').addEventListener('click', () => {
  const items = [...document.querySelectorAll('#historyList details')];
  const open = items.map(d => d.open);
  tazaPrint({
    before: () => { items.forEach(d => { d.open = true; }); document.body.classList.add('printing-history'); },
    after: () => { document.body.classList.remove('printing-history'); items.forEach((d, i) => { d.open = open[i]; }); },
  });
});
$('#hClear').addEventListener('click', () => { if (confirm(t('h_confirm'))) { history_.clear(); renderHistory(); } });

// ---------- Accuracy dashboard ----------
const MODEL_NAMES = { 'claude-haiku-5-5': 'Claude Haiku 5.5', 'claude-sonnet-5-5': 'Claude Sonnet 5.5', 'claude-opus-5-5': 'Claude Opus 5.5' };
const MODEL_COLORS = ['var(--accent)', 'var(--moderate)', 'var(--sensitive)', '#5B7FD6', '#9A6BD1', 'var(--unknown)'];
const usd = v => v == null ? '–' : v === 0 ? t('d_free') : `$${v < 0.01 ? v.toFixed(4) : v < 0.1 ? v.toFixed(3) : v.toFixed(2)}`;

const adminToken = (() => {
  try {
    const p = new URLSearchParams(location.search), tok = p.get('admin');
    if (tok) { sessionStorage.setItem('taza-admin', tok); history.replaceState(null, '', location.pathname); }
    return sessionStorage.getItem('taza-admin') || '';
  } catch { return ''; }
})();
// The accuracy test: score, how it was checked, and every question with its expected fact
async function loadEval() {
  const e = await fetch('/api/eval').then(r => r.json()).catch(() => ({}));
  if (!e.available) { $('#evalBox').innerHTML = ''; return; }
  const date = I18N.date(e.run_at, { year: true });
  $('#evalBox').innerHTML = `
    <h2>${esc(t('d_test'))}</h2>
    <div class="evalcard">
      <div class="evalscore"><b>${esc(String(e.accuracy_pct))}%</b><span>${esc(t('d_test_score', { p: e.passed, n: e.total }))}</span></div>
      <div><p>${esc(t('d_test_lead', { m: MODEL_NAMES[e.model] || e.model }))}${e.escalated ? ` ${esc(t('d_test_esc', { n: e.escalated }))}` : ''}</p>
        <p class="muted small">${esc(t('d_test_meta', { date, s: e.median_seconds, usd: usd(e.cost_usd) }))}</p></div>
    </div>
    <details class="evallist"><summary>${esc(t('d_test_list'))} (${esc(String(e.total))})</summary>
      <ol>${e.items.map(x => `<li><span aria-hidden="true">${x.pass ? '✅' : '❌'}</span> ${esc(x.question)} <span class="muted">— ${esc(t('d_test_exp'))}: ${esc(x.expected)}${x.escalated ? ` · ${esc(t('d_test_esc_one'))}` : ''}</span></li>`).join('')}</ol>
    </details>`;
}

// Research gaps, grouped by topic (AAI team only: needs the admin token)
let gaps = null;
async function loadGaps(refresh = false) {
  if (!adminToken) { $('#gapsBox').hidden = true; return; }
  $('#gapsBox').hidden = false;
  if (!gaps || refresh) {
    $('#gapsList').innerHTML = `<li class="muted">${esc(t('gp_loading'))}</li>`;
    gaps = await fetch(`/api/admin/gaps${refresh ? '?refresh=1' : ''}`, { headers: { 'x-admin-token': adminToken } }).then(r => r.json()).catch(() => ({ error: t('req_failed') }));
  }
  renderGaps();
}
function renderGaps() {
  if (!gaps) return;
  if (gaps.error) { $('#gapsList').innerHTML = `<li class="error">${esc(gaps.error)}</li>`; return; }
  const max = Math.max(1, ...gaps.topics.map(g => g.count));
  $('#gapsList').innerHTML = gaps.topics.length ? gaps.topics.map(g => `<li>
      <div class="gap-head"><b>${esc(g.name[I18N.lang] || g.name.en)}</b><span class="muted small">${esc(t('gp_count', { n: g.count }))}</span></div>
      <span class="gap-bar"><i style="width:${(100 * g.count / max).toFixed(0)}%"></i></span>
      <ul class="small muted">${g.examples.map(q => `<li>«${esc(q)}»</li>`).join('')}</ul></li>`).join('')
    : `<li class="muted">${esc(t('gp_none'))}</li>`;
}
$('#gapsRefresh').addEventListener('click', () => loadGaps(true));

async function loadStats() {
  loadEval();
  loadGaps();
  $('#addResearch').hidden = !adminToken;
  const s = await fetch('/api/stats', { headers: adminToken ? { 'x-admin-token': adminToken } : {} }).then(r => r.json());
  if (!s.questions) { $('#stats').innerHTML = `<p class="muted">${esc(t('d_empty'))}</p>`; $('#unanswered').innerHTML = ''; return; }
  const ts = s.time_saved;
  const hero = ts ? `<div class="stat saved"><b>⏱ ${esc(String(ts.hours))} ${esc(t('d_hours'))}</b><span>${esc(t('d_saved'))}</span>
    <small>${esc(t('d_saved_sub', { n: ts.sourced_answers, m: ts.manual_minutes, s: s.median_seconds }))}</small></div>` : '';
  const cards = [
    [`${s.median_seconds} ${t('sec')}`, t('d_median')],
    [s.questions, t('d_questions')],
    [s.answered_with_source_pct == null ? '–' : `${s.answered_with_source_pct}%`, t('d_sourced')],
    ...(s.feedback?.helpful_pct != null ? [[`${s.feedback.helpful_pct}%`, t('d_helpful'), t('d_votes', { up: s.feedback.up, down: s.feedback.down })]] : []),
    [usd(s.cost_per_answer_usd), t('d_per'),
      s.cost_per_answer_usd ? t('d_per1000', { x: Math.max(1, Math.round(s.cost_per_answer_usd * 1000)) }) : ''],
  ].map(([b, label, sub]) => `<div class="stat"><b>${b}</b><span>${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`).join('');

  const bar = s.by_model.map((m, i) => `<i style="flex:${m.questions};background:${MODEL_COLORS[i % MODEL_COLORS.length]}" title="${esc(m.model)}"></i>`).join('');
  const rows = s.by_model.map((m, i) => `<li><i class="dot" style="background:${MODEL_COLORS[i % MODEL_COLORS.length]}"></i>
    <span class="mname">${esc(MODEL_NAMES[m.model] || m.model)}</span>
    <span class="mnum">${esc(I18N.plural('question', m.questions))} · ${esc(m.cost_each_usd === 0 ? t('d_free') : t('d_each', { x: usd(m.cost_each_usd) }))}</span></li>`).join('');
  const usesAuto = s.by_model.some(m => m.model === 'claude-haiku-5-5') && s.by_model.some(m => m.model === 'claude-sonnet-5-5');
  $('#stats').innerHTML = hero + cards + `
    <div class="stat models">
      <span>${esc(t('d_which'))}</span>
      <div class="mbar" role="img" aria-label="${esc(t('d_which'))}">${bar}</div>
      <ul class="mlist">${rows}</ul>
      ${usesAuto ? `<small>${esc(t('d_route'))}</small>` : ''}
    </div>`;
  // The questions themselves are private (AAI team only); everyone else sees how many there are
  $('#unanswered').innerHTML = Array.isArray(s.unanswered)
    ? (s.unanswered.length ? s.unanswered.map(q => `<li>${esc(q)}</li>`).join('') : `<li class="muted">${esc(t('d_none'))}</li>`)
    : `<li class="muted">${esc(s.unanswered_count ? t('d_private', { n: s.unanswered_count }) : t('d_none'))}</li>`;
}

// ---------- Sources ----------
async function loadSources() {
  const list = await fetch('/api/sources').then(r => r.json());
  $('#sourceList').innerHTML = list.sort((a, b) => b.date.localeCompare(a.date)).map(s =>
    `<li><span class="badge">${esc(String(s.lang).toUpperCase())}</span> ${s.url ? `<a href="${safeHref(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title)} <span class="muted">· ${esc(s.date)}${s.pages ? ` · ${esc(t('src_pages', { n: s.pages }))}` : ''}${s.kind === 'press' ? ` · ${esc(t('src_press'))}` : ''}</span></li>`).join('');
}

// ---------- Installable app (PWA) ----------
// The service worker keeps only the public page and its files, never questions or answers (see sw.js)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
let installEvent = null;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; $('#installBtn').hidden = standalone(); });
addEventListener('appinstalled', () => { installEvent = null; $('#installBtn').hidden = true; $('#installHint').hidden = true; });
// iPhone and iPad: Safari has no install prompt; the button shows how to add it to the home screen
if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone()) $('#installBtn').hidden = false;
$('#installBtn').addEventListener('click', async () => {
  if (installEvent) {
    installEvent.prompt();
    const { outcome } = await installEvent.userChoice.catch(() => ({}));
    if (outcome === 'accepted') $('#installBtn').hidden = true;
    installEvent = null;
  } else $('#installHint').hidden = !$('#installHint').hidden;
});

// Without internet the app still opens; answers and live air need the connection
function renderOnline() {
  let bar = $('#offlineBar');
  if (navigator.onLine) { bar?.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'offlineBar'; bar.className = 'offline-bar'; bar.setAttribute('role', 'status'); document.body.prepend(bar); }
  bar.textContent = t('pwa_offline');
}
addEventListener('online', renderOnline);
addEventListener('offline', renderOnline);
document.addEventListener('taza:lang', renderOnline);
renderOnline();
