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

document.addEventListener('click', e => { const l = e.target.closest('[data-lang]')?.dataset.lang; if (l) I18N.set(l); });
document.addEventListener('taza:lang', renderDocs);
I18N.apply();
$('#date').valueAsDate = new Date();
open();
