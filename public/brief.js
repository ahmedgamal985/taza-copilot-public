// One-page policy brief made from a copilot answer: the question, key findings with citations,
// the air in Almaty now (live numbers and two charts), and the sources with their exact quotes.
// Print it or save it as PDF from the browser (A4, one page).
const $ = s => document.querySelector(s);
const t = (k, v) => I18N.t(k, v);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeHref = u => { try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href : '#'; } catch { return '#'; } };
const COLORS = { good: 'var(--good)', moderate: 'var(--moderate)', sensitive: 'var(--sensitive)', unhealthy: 'var(--unhealthy)', very: 'var(--very)' };

const params = new URLSearchParams(location.search);
const id = params.get('id') || '';
const lang = params.get('lang');
if (['ru', 'kk'].includes(lang)) I18N.set(lang);
I18N.apply();
$('#printBtn').addEventListener('click', () => tazaPrint());

const day = d => I18N.date(d);

// Horizontal bars: PM2.5 by district now
function districtChart(rows) {
  const w = 330, row = 19, left = 82, max = Math.max(40, ...rows.map(r => r.pm25)) * 1.1, x = v => left + (w - left - 34) * v / max;
  const lines = [[15, t('br_who')], [35, t('br_kz')]].filter(([v]) => v < max);
  return `<svg viewBox="0 0 ${w} ${rows.length * row + 18}" role="img" aria-label="${esc(t('br_districts'))}">
    ${rows.map((r, i) => `<text x="${left - 6}" y="${i * row + 13}" text-anchor="end" class="lbl">${esc(r.district)}</text>
      <rect x="${left}" y="${i * row + 3}" width="${Math.max(2, x(r.pm25) - left)}" height="${row - 6}" rx="3" fill="${COLORS[r.category] || 'var(--unknown)'}"></rect>
      <text x="${x(r.pm25) + 4}" y="${i * row + 13}" class="val">${r.pm25}</text>`).join('')}
    ${lines.map(([v, l]) => `<line x1="${x(v)}" x2="${x(v)}" y1="0" y2="${rows.length * row}" class="ref"></line>
      <text x="${x(v)}" y="${rows.length * row + 13}" text-anchor="middle" class="lbl">${esc(l)}</text>`).join('')}
  </svg>`;
}

// Vertical bars: daily city average for the last 14 days
function daysChart(rows) {
  const w = 330, h = 130, bottom = 18, top = 6, max = Math.max(40, ...rows.map(r => r.pm25)) * 1.1;
  const bw = (w - 10) / rows.length, y = v => top + (h - bottom - top) * (1 - v / max);
  const lines = [[15, t('br_who')], [35, t('br_kz')]].filter(([v]) => v < max);
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(t('br_days'))}">
    ${lines.map(([v, l]) => `<line x1="0" x2="${w}" y1="${y(v)}" y2="${y(v)}" class="ref"></line><text x="${w - 2}" y="${y(v) - 3}" text-anchor="end" class="lbl">${esc(l)}</text>`).join('')}
    ${rows.map((r, i) => `<rect x="${5 + i * bw + 2}" y="${y(r.pm25)}" width="${bw - 4}" height="${h - bottom - y(r.pm25)}" rx="2" fill="${COLORS[r.category] || 'var(--unknown)'}"><title>${esc(r.date)}: ${r.pm25}</title></rect>`).join('')}
    ${rows.map((r, i) => (rows.length - 1 - i) % 3 === 0 ? `<text x="${5 + i * bw + bw / 2}" y="${h - 4}" text-anchor="middle" class="lbl">${esc(day(r.date))}</text>` : '').join('')}
  </svg>`;
}

// The answer becomes a short list of findings (one per sentence, citations kept)
function findings(text) {
  const parts = text.split(/(?<=[.!?…](?:\[\d+\])*)\s+(?=[A-ZА-ЯЁӘҒҚҢӨҰҮҺІ0-9"«(])/).map(s => s.trim()).filter(s => s.length > 3);
  return parts.slice(0, 8).map(s => `<li>${esc(s).replace(/\[(\d+)\]/g, '<sup>[$1]</sup>')}</li>`).join('');
}

function render(a, air) {
  const now = I18N.date(new Date(), { month: 'long', year: true });
  const live = air?.available && air.city;
  const d = air?.districts || [];
  const vs = air?.compare?.change_pct;
  const sources = a.sources.slice(0, 6).map(s => `<li><b>[${s.n}]</b> ${s.live ? 'AAI sensor network (live)' : `${esc(s.title)}${s.page ? `, ${esc(t('page_n', { p: s.page }))}` : ''}${s.date ? ` · ${esc(s.date)}` : ''}`}
      <q>${esc(s.quote.length > 200 ? s.quote.slice(0, 197) + '…' : s.quote)}</q>
      ${s.url ? `<a href="${safeHref(s.url)}" target="_blank" rel="noopener">${esc(safeHref(s.url).replace(/^https?:\/\//, '').slice(0, 70))}</a>` : ''}</li>`).join('');
  document.title = `${t('br_title')} · ${a.question.slice(0, 60)}`;
  $('#brief').innerHTML = `
    <header class="brief-head">
      <div><span class="logo" aria-hidden="true"></span> <b>Taza Copilot</b> · Almaty Air Initiative</div>
      <div class="muted">${esc(t('br_title'))} · ${esc(now)}</div>
    </header>
    <p class="brief-label">${esc(t('br_q'))}</p>
    <h1>${esc(a.question)}</h1>
    <section class="brief-grid">
      <div>
        <h2>${esc(t('br_find'))}</h2>
        <ul class="brief-findings">${findings(a.text)}</ul>
      </div>
      <div class="brief-live">
        <h2>${esc(t('br_live'))}</h2>
        ${live ? `
        <div class="kpis">
          <div class="kpi" style="border-color:${COLORS[air.city.category]}"><b>${air.city.pm25}</b><span>${esc(t('br_city'))} · µg/m³</span>
            <small>${esc(t(`cat_${air.city.category}`))}${vs != null ? ` · ${esc(t('br_vs', { x: (vs > 0 ? '+' : '') + vs }))}` : ''}</small></div>
          ${d.length ? `<div class="kpi"><b>${esc(d[0].district)}</b><span>${esc(t('br_worst'))}</span><small>${d[0].pm25} µg/m³</small></div>
          <div class="kpi"><b>${esc(d[d.length - 1].district)}</b><span>${esc(t('br_cleanest'))}</span><small>${d[d.length - 1].pm25} µg/m³</small></div>` : ''}
        </div>
        ${d.length ? `<h3>${esc(t('br_districts'))} (µg/m³)</h3>${districtChart(d)}` : ''}
        ${air.days?.length ? `<h3>${esc(t('br_days'))} (µg/m³)</h3>${daysChart(air.days)}` : ''}` : `<p class="muted">${esc(t('br_nolive'))}</p>`}
      </div>
    </section>
    <h2>${esc(t('br_sources'))}</h2>
    <ol class="brief-sources">${sources}</ol>
    <footer class="brief-foot">${esc(t('br_foot', { date: now }))} · ${esc(location.origin)}/?a=${esc(a.id)}</footer>`;
}

(async () => {
  try {
    if (!/^[A-Za-z0-9_-]{12}$/.test(id)) throw new Error();
    // Saving it as a shared answer gives the brief a stable link (printed in the footer)
    const s = await fetch('/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    if (!s.ok) throw new Error();
    const [a, air] = await Promise.all([
      fetch(`/api/answer/${id}`).then(r => (r.ok ? r.json() : Promise.reject())),
      fetch('/api/air').then(r => r.json()).catch(() => null),
    ]);
    const draw = () => render({ ...a, id }, air);
    draw();
    document.addEventListener('taza:lang', draw);
  } catch {
    $('#brief').innerHTML = `<p class="error">${esc(t('shared_missing'))}</p>`;
  }
})();
