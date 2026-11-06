// Admin page: the AAI team uploads new research PDFs; the copilot indexes them at once.
// The admin token is kept in sessionStorage only (this tab), and sent as a header, never in a URL.
const $ = s => document.querySelector(s);
const t = (k, v) => I18N.t(k, v);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LANG_NAMES = { en: 'English', ru: 'Русский', kk: 'Қазақша' };

let token = '';
try { token = sessionStorage.getItem('taza-admin') || ''; } catch {}
const saveToken = v => { token = v; try { v ? sessionStorage.setItem('taza-admin', v) : sessionStorage.removeItem('taza-admin'); } catch {} };

const api = (path, opts = {}) => fetch(path, { ...opts, headers: { 'x-admin-token': token, ...(opts.headers || {}) } })
  .then(async r => ({ ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) }));

let docs = [];
function renderDocs() {
  $('#docs').innerHTML = docs.length ? docs.slice().reverse().map(d => `
    <li>
      <div><b>${esc(d.title)}</b><br><span class="muted small">${esc(t('adm_meta', { lang: LANG_NAMES[d.lang] || d.lang, date: d.date, pages: d.pages, chunks: d.chunks }))}</span>
        ${d.summary ? `<details class="small"><summary>${esc(t('adm_summary'))}</summary><ul>${(d.summary[I18N.lang] || d.summary.en || []).map(p => `<li>${esc(p)}</li>`).join('')}</ul></details>` : ''}</div>
      <div class="admin-actions">
        <a href="${esc(d.url && /^https:\/\//.test(d.url) ? d.url : `/research/${d.id}.pdf`)}" target="_blank" rel="noopener">${esc(t('adm_open'))}</a>
        <button type="button" class="link-btn danger" data-remove="${esc(d.id)}">${esc(t('adm_remove'))}</button>
      </div>
    </li>`).join('') : `<li class="muted">${esc(t('adm_none'))}</li>`;
}

async function open() {
  if (!token) { $('#signin').hidden = false; $('#panel').hidden = true; return; }
  const r = await api('/api/admin/uploads');
  if (!r.ok) {
    $('#signin').hidden = false; $('#panel').hidden = true;
    $('#signinMsg').textContent = r.status === 403 ? t('adm_off') : r.status === 401 ? t('adm_bad') : (r.data.error || t('adm_err'));
    if (r.status === 401) saveToken('');
    return;
  }
  $('#signin').hidden = true; $('#panel').hidden = false; $('#signinMsg').textContent = '';
  docs = r.data;
  renderDocs();
  loadLibrary();
}

$('#signin').addEventListener('submit', e => { e.preventDefault(); saveToken($('#token').value.trim()); $('#token').value = ''; open(); });
$('#signout').addEventListener('click', () => { saveToken(''); open(); });

$('#upload').addEventListener('submit', async e => {
  e.preventDefault();
  const file = $('#file').files[0];
  const msg = $('#uploadMsg');
  msg.className = '';
  if (!file) return;
  if (file.size > 30 * 1024 * 1024) { msg.className = 'error'; msg.textContent = 'Max 30 MB.'; return; }
  $('#uploadBtn').disabled = true;
  msg.textContent = t('adm_working');
  try {
    const r = await api('/api/admin/upload', {
      method: 'POST', body: file,
      headers: { 'Content-Type': 'application/pdf', 'x-doc-title': encodeURIComponent($('#title').value.trim()),
        'x-doc-lang': $('#lang').value, 'x-doc-date': $('#date').value, 'x-doc-url': encodeURIComponent($('#link').value.trim()),
        'x-notify': $('#notify').checked ? '1' : '0' },
    });
    if (!r.ok) { msg.className = 'error'; msg.textContent = r.status === 401 ? t('adm_bad') : (r.data.error || t('adm_err')); return; }
    msg.className = 'ok';
    msg.innerHTML = `${esc(t('adm_done', { pages: r.data.pages, chunks: r.data.chunks }))} <a href="/">${esc(t('adm_try'))} →</a>` +
      (r.data.summary ? `<br>${esc(t('adm_notified', { n: r.data.notified || 0 }))}` : '');
    $('#upload').reset();
    $('#date').valueAsDate = new Date();
    await open();
  } catch { msg.className = 'error'; msg.textContent = t('adm_err'); }
  finally { $('#uploadBtn').disabled = false; }
});

$('#docs').addEventListener('click', async e => {
  const id = e.target.closest('[data-remove]')?.dataset.remove;
  if (!id) return;
  const d = docs.find(x => x.id === id);
  if (!confirm(t('adm_confirm', { title: d?.title || id }))) return;
  const r = await api('/api/admin/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
  $('#uploadMsg').className = r.ok ? 'ok' : 'error';
  $('#uploadMsg').textContent = r.ok ? t('adm_removed') : (r.data.error || t('adm_err'));
  open();
});

// ---------- The research library: daily updates from air.org.kz, and hiding or showing any source ----------
let lib = { auto: null, sources: [] };
// Kazakh month names are missing in some browsers ("2026 M11 6"), so Kazakh gets a numeric date
const when = iso => {
  if (!iso) return '';
  const d = new Date(iso), p = n => String(n).padStart(2, '0');
  if (I18N.lang === 'kk') return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
  return d.toLocaleString(I18N.lang === 'en' ? 'en-GB' : 'ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
};
const ORIGIN = { 'built-in': 'origin_builtin', upload: 'origin_upload', auto: 'origin_auto' };
const openLink = u => (u && /^https:\/\//.test(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t('adm_open'))}</a>` : '');
function sourceRow(s) {
  return `<li${s.hidden ? ' class="muted"' : ''}>
      <div><b>${esc(s.title)}</b><br><span class="muted small">${esc(t(ORIGIN[s.origin] || 'origin_builtin'))} · ${esc(LANG_NAMES[s.lang] || s.lang || '')} · ${esc(s.date || '')}${s.hidden ? ` · <b>${esc(t('src_hidden'))}</b>` : ''}</span></div>
      <div class="admin-actions">${openLink(s.url)}
        <button type="button" class="link-btn${s.hidden ? '' : ' danger'}" data-key="${esc(s.key)}" data-hide="${s.hidden ? '0' : '1'}">${esc(t(s.hidden ? 'src_show' : 'src_hide'))}</button></div>
    </li>`;
}
function renderLibrary() {
  const a = lib.auto;
  if (!a) return;
  $('#libAuto').checked = a.enabled;
  $('#libStatus').textContent = [
    a.last_run ? t('lib_status', { last: when(a.last_run), checked: a.checked ?? 0, added: a.last_added ?? 0 }) : t('lib_never'),
    a.enabled ? (a.next_run ? t('lib_next', { next: when(a.next_run) }) : '') : t('lib_off'),
    a.last_status === 'failed' ? t('lib_failed') : '',
  ].filter(Boolean).join(' · ');
  const added = lib.sources.filter(s => s.origin === 'auto');
  $('#libAdded').innerHTML = added.length ? added.map(sourceRow).join('') : `<li class="muted">${esc(t('lib_none'))}</li>`;
  const q = $('#srcFilter').value.trim().toLowerCase();
  const list = lib.sources.filter(s => !q || `${s.title} ${s.lang} ${s.date}`.toLowerCase().includes(q));
  const hiddenN = lib.sources.filter(s => s.hidden).length;
  $('#srcCount').textContent = t('src_count', { n: lib.sources.length - hiddenN, h: hiddenN });
  $('#srcList').innerHTML = list.map(sourceRow).join('');
}
async function loadLibrary() {
  const r = await api('/api/admin/library');
  if (r.ok) { lib = r.data; renderLibrary(); }
}
$('#libAuto').addEventListener('change', async e => {
  const r = await api('/api/admin/library/auto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: e.target.checked }) });
  if (r.ok) { lib.auto = r.data.auto; renderLibrary(); } else { e.target.checked = !e.target.checked; $('#libMsg').className = 'error'; $('#libMsg').textContent = r.data.error || t('adm_err'); }
});
$('#libCheck').addEventListener('click', async () => {
  const btn = $('#libCheck'), msg = $('#libMsg');
  btn.disabled = true; msg.className = ''; msg.textContent = t('lib_checking');
  const r = await api('/api/admin/library/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  btn.disabled = false;
  if (!r.ok) { msg.className = 'error'; msg.textContent = r.data.error || t('lib_failed'); return; }
  msg.className = 'ok';
  msg.textContent = t('lib_result', { checked: r.data.checked, added: r.data.added.length, dup: r.data.duplicates || 0 });
  await loadLibrary();
});
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-key][data-hide]');
  if (!b) return;
  b.disabled = true;
  const r = await api('/api/admin/library/hide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: b.dataset.key, hidden: b.dataset.hide === '1' }) });
  if (r.ok) await loadLibrary(); else { b.disabled = false; $('#libMsg').className = 'error'; $('#libMsg').textContent = r.data.error || t('adm_err'); }
});
$('#srcFilter').addEventListener('input', renderLibrary);

document.addEventListener('click', e => { const l = e.target.closest('[data-lang]')?.dataset.lang; if (l) I18N.set(l); });
document.addEventListener('taza:lang', () => { renderDocs(); renderLibrary(); });
I18N.apply();
$('#date').valueAsDate = new Date();
open();
