// Print or save as PDF, on desktop and on phones.
// - Desktop browsers wait inside window.print() until the dialog closes; phone browsers return at once and
//   print the page a moment later. So anything prepared for printing is put back only on "afterprint".
// - Some places cannot print at all: the installed app, in-app browsers (Telegram, WhatsApp, Instagram) and
//   Android's in-app tabs. If no print dialog starts, we say how to print from the browser instead.
(() => {
  const t = k => (window.I18N ? I18N.t(k) : k);
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(navigator.userAgent);

  function help() {
    document.querySelector('.print-help')?.remove();
    const box = document.createElement('div');
    box.className = 'print-help no-print'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-live', 'polite');
    const steps = isIOS ? t('pr_ios') : isAndroid ? t('pr_android') : t('pr_other');
    box.innerHTML = '<b></b><p></p><div class="print-help-acts"><button type="button" class="primary" data-copy></button><button type="button" data-close></button></div>';
    box.querySelector('b').textContent = t('pr_title');
    box.querySelector('p').textContent = steps;
    const copy = box.querySelector('[data-copy]'), close = box.querySelector('[data-close]');
    copy.textContent = t('pr_copy'); close.textContent = t('pr_close');
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(location.href); copy.textContent = t('pr_copied'); }
      catch { prompt(t('pr_copy'), location.href); }
    });
    close.addEventListener('click', () => box.remove());
    document.body.appendChild(box);
  }

  window.tazaPrint = ({ before, after } = {}) => {
    let started = false, done = false;
    const mq = matchMedia('print');
    const onBefore = () => { started = true; };
    const onMq = e => { if (e.matches) started = true; };
    const finish = () => {
      if (done) return; done = true;
      removeEventListener('beforeprint', onBefore); removeEventListener('afterprint', finish);
      mq.removeEventListener?.('change', onMq);
      after?.();
    };
    addEventListener('beforeprint', onBefore);
    addEventListener('afterprint', finish);
    mq.addEventListener?.('change', onMq);
    document.querySelector('.print-help')?.remove();
    before?.();
    try { window.print(); } catch { /* not available here */ }
    // No print dialog started: printing is not available in this browser or app
    setTimeout(() => { if (!started && !done) { finish(); help(); } }, 1500);
    // Never leave the page in its print layout
    setTimeout(finish, 5 * 60 * 1000);
  };
})();
