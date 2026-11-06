// Taza Copilot chat widget for any website. One line, anywhere in the page:
//   <script src="https://YOUR-TAZA-SERVER/widget.js" async></script>
// Options: data-lang="en|ru|kk" (default: the page's own language, else English),
//          data-position="right|left", data-target="#box" (show it inside an element, for previews).
// A round button in the corner shows the air in Almaty now (its colour and number); tapping it opens a
// chat with AAI's research. Everything runs in a frame from the Taza server: the host page's content,
// cookies and forms are never read, and the frame can't touch the host page.
(function () {
  var me = document.currentScript;
  if (!me || !me.src) return;
  var origin = new URL(me.src).origin;
  var LANGS = ['en', 'ru', 'kk'];
  var pageLang = (document.documentElement.getAttribute('lang') || '').slice(0, 2).toLowerCase();
  var lang = LANGS.indexOf(me.getAttribute('data-lang')) >= 0 ? me.getAttribute('data-lang') : LANGS.indexOf(pageLang) >= 0 ? pageLang : 'en';
  var side = me.getAttribute('data-position') === 'left' ? 'left' : 'right';
  var target = me.getAttribute('data-target') && document.querySelector(me.getAttribute('data-target'));
  // One floating widget per page; a preview box can be redrawn (e.g. in another language)
  if (!target && window.__tazaWidget) return;
  if (!target) window.__tazaWidget = true;
  if (target) { var old = target.querySelector('iframe[data-taza]'); if (old) old.remove(); }

  var frame = document.createElement('iframe');
  frame.setAttribute('data-taza', '');
  frame.src = origin + '/widget.html?lang=' + lang + '&side=' + side + (target ? '&preview=1' : '');
  frame.title = 'Taza Copilot: ask about the air in Almaty';
  frame.setAttribute('allow', 'microphone');
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox');
  var pos = target ? 'absolute' : 'fixed';
  frame.style.cssText = 'position:' + pos + ';bottom:0;' + side + ':0;width:96px;height:96px;border:0;background:transparent;' +
    'color-scheme:normal;z-index:2147483000;max-width:100%;max-height:100%;transition:none';
  if (target) { if (getComputedStyle(target).position === 'static') target.style.position = 'relative'; target.appendChild(frame); }
  else (document.body || document.documentElement).appendChild(frame);

  // The frame tells us its state; we only change its size (messages from anywhere else are ignored)
  function size(state) {
    var box = target ? target.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
    var phone = !target && box.width < 520;
    if (state === 'open') {
      frame.style.width = phone ? '100%' : Math.min(410, box.width) + 'px';
      frame.style.height = phone ? '100%' : Math.min(660, box.height) + 'px';
    } else if (state === 'nudge') {
      frame.style.width = Math.min(330, box.width) + 'px'; frame.style.height = '200px';
    } else { frame.style.width = '96px'; frame.style.height = '96px'; }
  }
  var current = 'closed';
  window.addEventListener('message', function (e) {
    if (e.source !== frame.contentWindow || e.origin !== origin || !e.data || e.data.taza !== 'state') return;
    if (['open', 'nudge', 'closed'].indexOf(e.data.state) < 0) return;
    current = e.data.state; size(current);
  });
  window.addEventListener('resize', function () { size(current); });
})();
