// Guided tour of every feature (a few minutes; every new feature gets a step): a recorded narration in the voice agent's voice, with captions, while
// the pointer shows each part of the platform. Scripted on purpose: the same every time, no AI cost, and
// it works even if an AI provider is down. It starts only when someone taps the tour button; first-time
// visitors get one small invitation (remembered in their own browser, nothing on the server).
(() => {
  const $ = s => document.querySelector(s);
  const t = (k, v) => I18N.t(k, v);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const params = new URLSearchParams(location.search);
  const muted = params.has('tourmute');          // for automated tests: no sound
  const fast = params.has('tourfast');           // for automated tests: short steps
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const P = () => window.tazaPointer || { pointAt: async () => {}, viaMenu: async () => {}, hide: () => {} };
  const waitFor = async (sel, ms = 9000) => { const end = Date.now() + ms; while (Date.now() < end) { const el = $(sel); if (el) return el; await sleep(150); } return null; };
  const typeInto = async (el, text) => { el.value = ''; const step = Math.max(1, Math.ceil(text.length / 40)); for (let i = 0; i < text.length; i += step) { el.value = text.slice(0, i + step); await sleep(18); } };

  let script = null, running = false, paused = false, skip = false, audio = null, stepIdx = 0, stepToken = 0;
  // True while the step that called it is still the current one
  const stillOn = tok => running && stepToken === tok;

  // What happens on screen during each step (the narration plays at the same time)
  const ACTIONS = {
    async hello() { window.taza.show('ask'); await point($('#view-ask h1')); },
    async ask() {
      document.querySelector('[data-mode="answer"]')?.click();
      await point($('#q'), { click: true });
      await typeInto($('#q'), t('tour_q'));
      await point($('#askBtn'), { click: true });
      window.taza.ask(t('tour_q'));
    },
    async sources() { const el = await waitFor('#result .src blockquote'); if (el) await point(el); },
    async check() {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const tab = $('[data-mode="factcheck"]');
      await point(tab, { click: true }); tab.click();
      await typeInto($('#q'), t('tour_claim'));
      await point($('#askBtn'), { click: true });
      window.taza.ask(t('tour_claim'));
      const v = await waitFor('#result .verdict', 12000); if (v) await point(v);
    },
    async live() { window.scrollTo({ top: 0, behavior: 'smooth' }); await sleep(400); await point($('#livePill')); },
    async map() {
      await P().viaMenu('map'); await window.taza.showMap();
      await sleep(1500); await point($('#map'));
      const s = await window.taza.findStation({ pick: 'worst' }); if (s) { window.taza.focusStation(s); await sleep(1200); window.taza.openStation(s.id); }
    },
    async outdoor() {
      window.taza.closeStation(); await page('outdoor');
      const best = await waitFor('#odOut .od-best', 15000); if (best) await point(best);
      await sleep(2500); const worst = $('#odOut .od-worst'); if (worst) await point(worst);
      await sleep(2500); const chart = $('#odOut .cp-chart'); if (chart) await point(chart);
    },
    async compare() {
      await page('compare');
      const head = await waitFor('#cpOut .cp-head', 15000); if (head) await point(head);
      await sleep(2500); const chart = $('#cpOut .cp-chart'); if (chart) await point(chart);
      // Then Almaty against another city
      await sleep(2000); const tab = $('#cpTabs [data-cp="cities"]');
      if (tab && running && !$('#view-compare').hidden) { await point(tab, { click: true }); tab.click(); const h = await waitFor('#cpOut .cp-head', 15000); if (h) await point(h); }
    },
    async schools() { await page('schools'); const row = await waitFor('#schoolsList li'); if (row) await point(row); },
    async dashboard() {
      await page('dashboard'); const el = await waitFor('.stat.saved'); if (el) await point(el);
      await sleep(3500); const ev = $('#evalBox'); if (ev?.textContent.trim()) await point(ev);
      await sleep(3000); const gaps = $('#gapsBox:not([hidden])') || $('#unanswered'); if (gaps) await point(gaps);
    },
    async share() {
      window.taza.show('ask', true);
      const brief = await waitFor('#result [data-act="brief"]'); if (brief) await point(brief);
      const card = $('#result [data-card]'); if (card) { await sleep(2000); await point(card); }
      const cite = $('#result [data-cite]'); if (cite) { await sleep(1800); await point(cite); }
      const up = $('#result [data-act="up"]'); if (up) { await sleep(1800); await point(up); }
    },
    async history() {
      await page('history'); await point($('#historyList'));
      await sleep(2500); await point($('#hExport'));
    },
    async library() { await page('sources'); const li = await waitFor('#sourceList li, #sourceList > *'); if (li) await point(li); },
    // Admin: a PREVIEW of the admin page. The tour never holds the real key (anything in this file is public), so the
    // stars it types are not a key and nothing is sent anywhere; the preview is labelled as such.
    async admin() {
      const tok = stepToken;
      window.taza.show('ask', true); await openMenu();
      const link = $('#menu a[href="admin.html"]'); if (link) await point(link);
      await sleep(1800); $('#menu').hidden = true; if (!stillOn(tok)) return;
      const box = adminPreview('signin');
      const key = box.querySelector('.ta-key');
      await point(key, { click: true });
      for (let i = 1; i <= 14 && stillOn(tok); i++) { key.textContent = '●'.repeat(i); await sleep(80); }
      await point(box.querySelector('.ta-btn'), { click: true });
      await sleep(500); if (!stillOn(tok)) return;
      adminPreview('panel');
      await point($('#tourAdmin .ta-file'));
      const bar = $('#tourAdmin .ta-progress i');
      for (let p = 0; p <= 100 && stillOn(tok); p += 5) { bar.style.width = p + '%'; await sleep(70); }
      $('#tourAdmin .ta-ready').hidden = false; await point($('#tourAdmin .ta-ready'));
      await sleep(6000); if (!stillOn(tok)) return;
      await point($('#tourAdmin .ta-gaps'));
      await sleep(6500); if (!stillOn(tok)) return;
      // the daily check of air.org.kz, then hiding or showing any source
      await point($('#tourAdmin .ta-auto'));
      await sleep(4500); if (!stillOn(tok)) return;
      await point($('#tourAdmin .ta-hide'));
      await sleep(4000); if (!stillOn(tok)) return;
      await point($('#tourAdmin .ta-lock'));
    },
    async ai() { await page('ai'); const p = await waitFor('#providerList > *'); if (p) await point(p); await sleep(3000); await point($('#keyInput')); },
    async telegram() { await openMenu(); const tg = $('#tgLink:not([hidden])') || $('#menuBtn'); await point(tg); },
    async groups() { await openMenu(); const tg = $('#tgLink:not([hidden])') || $('#menuBtn'); await point(tg); await sleep(6000); $('#menu').hidden = true; },
    // WhatsApp: only points at the buttons (the home page, then the menu); never opens WhatsApp
    async whatsapp() {
      const tok = stepToken;
      $('#menu').hidden = true; window.taza.show('ask', true); window.scrollTo({ top: 0, behavior: 'smooth' });
      await sleep(400); await point($('#waHome'));
      await sleep(7000); if (!stillOn(tok)) return;
      await openMenu(); await point($('#waLink'));
      await sleep(5000); $('#menu').hidden = true;
    },
    async widget() {
      await page('widget'); await point($('#wdCode'));
      await sleep(3000); const f = await waitFor('#wdSite iframe'); if (f) await point(f);
    },
    // inDrive: the driver's phone, then the rider's, then the video tab (shown, not played)
    async indrive() {
      const tok = stepToken;
      await page('indrive');
      const phone = await waitFor('#idPhone .id-screen', 12000); if (phone) await point(phone);
      const tab = r => $(`#idRoles [data-role="${r}"]`);
      await sleep(4500); if (!stillOn(tok) || $('#view-indrive').hidden) return;
      await point(tab('rider'), { click: true }); tab('rider').click();
      await sleep(4500); if (!stillOn(tok) || $('#view-indrive').hidden) return;
      await point(tab('video'), { click: true }); tab('video').click();
      await sleep(600); await point($('#idVideo video'));
    },
    async app() {
      // Leave the inDrive page on the driver's phone for the next visitor
      const drv = $('#idRoles [data-role="driver"]'); if (drv && drv.getAttribute('aria-selected') !== 'true') drv.click();
      window.taza.show('ask', true); await openMenu();
      await point($('#menu .lang-switch'));
      await sleep(2500); const inst = $('#installBtn:not([hidden])') || $('#installHint:not([hidden])'); if (inst) { await point(inst); await sleep(2500); }
      await point($('#menu [data-view="about"]'));
    },
    async you() {
      $('#menu').hidden = true; window.taza.show('ask', true);
      window.scrollTo({ top: 0, behavior: 'smooth' }); await point($('#voiceBtn'));
    },
  };
  // The admin preview card: 'signin' (a key field the tour fills with stars) or 'panel' (upload, summary, research gaps)
  function adminPreview(stage) {
    let box = $('#tourAdmin');
    if (!box) { box = document.createElement('div'); box.id = 'tourAdmin'; box.className = 'tour-admin'; box.setAttribute('aria-hidden', 'true'); document.body.appendChild(box); }
    const head = `<div class="ta-tag">${esc(t('tadm_preview'))}</div><h3>${esc(t('adm_h1'))}</h3>`;
    box.innerHTML = stage === 'signin'
      ? `${head}<label>${esc(t('adm_token'))}</label><div class="ta-key"></div>
         <div class="ta-btn">${esc(t('adm_signin'))}</div><p class="ta-lock">🔒 ${esc(t('tadm_lock'))}</p>`
      : `${head}<div class="ta-file">📄 AAI-report-2026.pdf <small>${esc(t('tadm_example'))}</small></div>
         <div class="ta-progress"><i></i></div>
         <label class="ta-check">☑ ${esc(t('adm_notify'))}</label>
         <p class="ta-ready" hidden>✅ ${esc(t('tadm_ready'))}</p>
         <div class="ta-gaps"><b>${esc(t('tadm_gaps'))}</b>
           <ul><li>${esc(t('tadm_t1'))} <span>· 4</span></li><li>${esc(t('tadm_t2'))} <span>· 3</span></li></ul>
           <small>${esc(t('tadm_example'))} · ${esc(t('tadm_monday'))}</small></div>
         <div class="ta-auto">🔄 <b>${esc(t('lib_h'))}</b><br><small>☑ ${esc(t('lib_auto'))}</small></div>
         <div class="ta-hide">👁 <b>${esc(t('src_h'))}</b> <span class="ta-pill">${esc(t('src_hide'))}</span> <span class="ta-pill">${esc(t('src_show'))}</span></div>
         <p class="ta-lock">🔒 ${esc(t('tadm_lock'))}</p>`;
    box.hidden = false;
    return box;
  }
  const hideAdmin = () => { const b = $('#tourAdmin'); if (b) b.hidden = true; };
  // Opens a page the way a person would: the menu, then the page's button
  async function page(view) { window.taza.closeStation(); await P().viaMenu(view); window.taza.show(view); }
  async function openMenu() { if ($('#menu').hidden) { await point($('#menuBtn'), { click: true }); $('#menu').hidden = false; await sleep(250); } }

  // ---------- The bar at the bottom: captions, progress, pause / next / stop ----------
  const bar = document.createElement('div');
  bar.className = 'tour-bar'; bar.hidden = true;
  bar.setAttribute('role', 'region');
  bar.innerHTML = `<div class="tour-dots" aria-hidden="true"></div>
    <p class="tour-caption" aria-live="polite"></p>
    <div class="tour-ctrls">
      <button type="button" class="tour-b" data-t="pause"></button>
      <button type="button" class="tour-b" data-t="next"></button>
      <button type="button" class="tour-b tour-x" data-t="stop" aria-label="Stop">✕</button>
    </div>`;
  document.body.appendChild(bar);
  const labels = () => {
    bar.setAttribute('aria-label', t('tour_btn'));
    bar.querySelector('[data-t="pause"]').textContent = paused ? `▶ ${t('tour_resume')}` : `⏸ ${t('tour_pause')}`;
    bar.querySelector('[data-t="next"]').textContent = `⏭ ${t('tour_next')}`;
  };
  bar.addEventListener('click', e => {
    const b = e.target.closest('[data-t]')?.dataset.t;
    if (b === 'pause') { paused = !paused; if (audio) paused ? audio.pause() : audio.play().catch(() => {}); labels(); }
    if (b === 'next') { skip = true; audio?.pause(); }
    if (b === 'stop') stop();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && running) stop(); });

  // ---------- The caption bar never hides what is being explained ----------
  // Each time the pointer heads to something, once the page has scrolled to it: if the bar covers it, the bar
  // slides to the other edge of the screen (top or bottom), but only if that edge leaves the thing visible.
  function place(el) {
    if (!el || bar.hidden || !el.isConnected) return;
    const r = el.getBoundingClientRect(), b = bar.getBoundingClientRect();
    if (!r.width && !r.height) return;
    if (r.bottom <= b.top || r.top >= b.bottom) return; // not covered
    const top = !bar.classList.contains('at-top'), room = b.height + 28, header = 64;
    const free = top ? r.top >= header + room : r.bottom <= innerHeight - room;
    if (free) moveBar(top);
  }
  function moveBar(top) {
    if (bar.classList.contains('at-top') === top) return;
    bar.classList.add('moving');
    setTimeout(() => { bar.classList.toggle('at-top', top); bar.classList.remove('moving'); }, 170);
  }
  // Every pointer move of the tour goes through here: the page scrolls first (in pointAt), then the bar steps aside
  async function point(el, opts) {
    if (!el) return;
    const going = P().pointAt(el, opts);
    await sleep(380);
    place(el);
    await going;
    place(el);
  }

  function stop(done = false) {
    running = false; skip = true; paused = false;
    if (audio) { audio.pause(); audio = null; }
    hideAdmin();
    P().hide();
    $('#menu').hidden = true;
    if (done) {
      bar.querySelector('.tour-caption').textContent = t('tour_done');
      bar.querySelector('.tour-ctrls').hidden = true;
      setTimeout(() => { if (!running) bar.hidden = true; }, 6000);
    } else bar.hidden = true;
    document.body.classList.remove('touring');
  }

  // Plays one narration clip; resolves when it ends (or on skip/stop). Without sound, waits for a reading time.
  function narrate(lang, i, text) {
    return new Promise(resolve => {
      const ms = fast ? 1200 : Math.max(3000, text.length * 62);
      if (muted) {
        const t0 = Date.now(); const tick = setInterval(() => { if (skip || !running || (!paused && Date.now() - t0 > ms)) { clearInterval(tick); resolve(); } }, 100);
        return;
      }
      const id = `${lang}-${script.steps[i]}`;
      audio = new Audio(`tour/${id}.mp3?v=${encodeURIComponent(script.audio?.[id] || '')}`);
      const done = () => { clearInterval(watch); resolve(); };
      audio.onended = done; audio.onerror = () => { audio = null; setTimeout(done, ms); };
      const watch = setInterval(() => { if (skip || !running) done(); }, 150);
      audio.play().catch(() => { audio = null; setTimeout(done, ms); });
    });
  }

  // ---------- The tour's language: asked first, in all three languages ----------
  // The site switches to the chosen language too, so the buttons the pointer shows read the same as the narration.
  const LANGS = [['en', 'English'], ['ru', 'Русский'], ['kk', 'Қазақша']];
  function choose() {
    if (running || $('#tourLang')) return;
    try { localStorage.setItem('taza-tour-seen', '1'); } catch {}
    $('#tourInvite')?.remove();
    const now = LANGS.some(([l]) => l === I18N.lang) ? I18N.lang : 'en';
    const box = document.createElement('div');
    box.id = 'tourLang'; box.className = 'tour-lang';
    box.innerHTML = `<div class="tour-lang-card" role="dialog" aria-modal="true" aria-labelledby="tourLangT">
        <button type="button" class="tour-x" aria-label="Close">✕</button>
        <p id="tourLangT" class="tour-lang-t">Choose the tour language<br>Выберите язык тура<br>Тур тілін таңдаңыз</p>
        <div class="tour-lang-b">${[...LANGS].sort(([a], [b]) => (b === now) - (a === now))
          .map(([l, name]) => `<button type="button" class="tour-go" data-l="${l}" lang="${l}">${name}</button>`).join('')}</div>
      </div>`;
    const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    box.addEventListener('click', e => {
      const l = e.target.closest('[data-l]')?.dataset.l;
      if (l) { close(); if (l !== I18N.lang) I18N.set(l); start(l); }
      else if (e.target === box || e.target.closest('.tour-x')) close();
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(box);
    box.querySelector('[data-l]').focus();
  }

  async function start(chosen) {
    if (running) return;
    try { localStorage.setItem('taza-tour-seen', '1'); } catch {}
    $('#tourInvite')?.remove();
    // Always the latest script (a new feature means a new step), checked with the server each time
    if (!script) script = await fetch('tour/script.json', { cache: 'no-cache' }).then(r => r.json()).catch(() => null);
    if (!script) return;
    const lang = ['en', 'ru', 'kk'].includes(chosen) ? chosen : ['en', 'ru', 'kk'].includes(I18N.lang) ? I18N.lang : 'en';
    running = true; paused = false;
    document.body.classList.add('touring');
    bar.classList.remove('at-top', 'moving');
    bar.hidden = false; bar.querySelector('.tour-ctrls').hidden = false; labels();
    const dots = bar.querySelector('.tour-dots');
    dots.innerHTML = script.steps.map(() => '<i></i>').join('');
    for (stepIdx = 0; stepIdx < script.steps.length && running; stepIdx++) {
      skip = false;
      dots.querySelectorAll('i').forEach((d, k) => d.classList.toggle('on', k <= stepIdx));
      const text = script[lang][stepIdx];
      bar.querySelector('.tour-caption').textContent = text;
      stepToken++;
      hideAdmin(); // the admin preview only lives inside its own step
      const action = ACTIONS[script.steps[stepIdx]];
      const acting = action ? action().catch(err => console.warn('Tour step failed:', err)) : Promise.resolve();
      await narrate(lang, stepIdx, text);
      await Promise.race([acting, sleep(fast ? 300 : 2500)]);
      while (paused && running) await sleep(200);
    }
    if (running) stop(true);
  }

  // ---------- Entry points: the home button, the menu, and one invitation for first-time visitors ----------
  const btn = $('#tourBtn'), menuBtn = $('#tourMenu');
  btn?.addEventListener('click', choose);
  menuBtn?.addEventListener('click', () => { $('#menu').hidden = true; choose(); });
  let seen = true;
  try { seen = Boolean(localStorage.getItem('taza-tour-seen')); } catch {}
  if (!seen && !params.get('a') && !params.get('q') && !fast) {
    setTimeout(() => {
      if (running) return;
      const inv = document.createElement('div');
      inv.id = 'tourInvite'; inv.className = 'tour-invite'; inv.setAttribute('role', 'status');
      inv.innerHTML = `<button type="button" class="tour-go">${esc(t('tour_invite'))}</button><button type="button" class="tour-x" aria-label="Close">✕</button>`;
      inv.querySelector('.tour-go').onclick = choose;
      inv.querySelector('.tour-x').onclick = () => { inv.remove(); try { localStorage.setItem('taza-tour-seen', '1'); } catch {} };
      document.body.appendChild(inv);
    }, 2500);
  }
  document.addEventListener('taza:lang', () => { labels(); const inv = $('#tourInvite .tour-go'); if (inv) inv.textContent = t('tour_invite'); });
  // start(lang) runs at once (the video capture uses it); choose() asks for the language first (the buttons)
  window.tazaTour = { start, choose, stop: () => stop(false), get running() { return running; }, get step() { return stepIdx; } };
})();
