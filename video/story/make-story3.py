# Builds story3.html (the 3:28 cut) from story.html: same styles and helpers, new scenes and frame code.
#   python video/story/make-story3.py
import os, re
here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, 'story.html'), encoding='utf-8').read()
head, rest = src.split('<body>', 1)
helpers = rest.split('<script>', 1)[1].split('// ---------- init ----------', 1)[0]

EXTRA_CSS = """
#l14 b { color: #fff; font-weight: 600; }
#l14 #l14b { color: var(--red); font-weight: 600; }
#n14 { color: #ff7a59; }
.loc { width: 260px; height: 130px; border-radius: 12px; background: repeating-linear-gradient(0deg, #dfe7d8 0 26px, #cfd9c6 26px 28px), #dfe7d8; position: relative; margin-bottom: 6px; }
.loc::after { content: '📍'; position: absolute; left: 112px; top: 36px; font-size: 34px; }
.btnrow { display: grid; gap: 6px; margin-top: 8px; }
.btnrow span { background: #eef5fb; border-radius: 10px; padding: 8px 10px; text-align: center; font-size: 16px; font-weight: 600; color: #1f6fb2; }
.inbar { position: absolute; left: 12px; right: 12px; bottom: 14px; background: #fff; border-radius: 22px; padding: 12px 16px; font-size: 18px; color: #111; box-shadow: 0 2px 8px rgba(0,0,0,.15); display: none; z-index: 3; }
.inbar b { color: #2a8bd6; }
.inres { position: absolute; left: 12px; right: 12px; bottom: 70px; background: #fff; border-radius: 14px; padding: 12px 16px; font-size: 16px; color: #111; box-shadow: 0 6px 20px rgba(0,0,0,.2); display: none; z-index: 3; }
.inres b { display: block; font-size: 17px; margin-bottom: 4px; }
.via { display: block; font-size: 14px; color: #2a8bd6; margin-bottom: 4px; }
.msgs { padding-bottom: 34px !important; }
#docs { top: 220px !important; height: 640px !important; gap: 10px 16px !important; }
#docs i { width: 48px !important; height: 54px !important; }
#docs i::before { top: 12px !important; box-shadow: 0 9px 0 #4a545c, 0 18px 0 #4a545c, 0 27px 0 #3c454c !important; }
.wcap { position: absolute; left: 90px; top: 330px; width: 1000px; }
#cap { position: absolute; bottom: 22px; transform: translateX(-50%); max-width: 1150px; padding: 9px 24px; border-radius: 14px; background: rgba(0,0,0,.66); color: #fff; font-size: 33px; font-weight: 500; line-height: 1.3; white-space: nowrap; opacity: 0; z-index: 50; }
.src { bottom: 110px; }
"""
head = head.replace('</style>', EXTRA_CSS + '</style>')

BODY = r"""<body>
<div id="smog"></div>
<div id="sky"></div>

<section class="scene" id="s-hook">
  <div id="hookWrap"><div id="n14">0</div><div id="l14"><span id="l14a">premature deaths a year in Kazakhstan</span><span id="l14b">&nbsp;·&nbsp;up to ~2,100 in Almaty</span></div></div>
  <div class="src" id="hSrc">Source: Almaty Air Initiative (AAI)</div>
</section>

<section class="scene" id="s-problem">
  <div id="pTitle"><b>150</b> reports, articles and documents from AAI</div>
  <div id="docs"></div>
  <div id="pOne">Taza finds the answer in seconds.</div>
</section>

<section class="scene" id="s-meet">
  <div id="logo"><div class="mark"><div class="sq">T</div><div class="nm"><em>Taza</em> Copilot</div></div><p>Ask AAI's research anything</p></div>
  <div id="cast">
    <div class="who" data-k="dana"><div class="av"></div><h3>DANA</h3><h4>Journalist</h4><div class="q">Did the air really get cleaner?</div></div>
    <div class="who" data-k="aliya"><div class="av"></div><h3>ALIYA</h3><h4>Mother of two</h4><div class="q">Can my kids walk to school?</div></div>
    <div class="who" data-k="arman"><div class="av"></div><h3>ARMAN</h3><h4>inDrive driver</h4><div class="q">Windows open or shut today?</div></div>
  </div>
</section>

<section class="scene" id="s-dana">
  <div class="head"><div class="clock">06:30</div><div class="av" data-av="dana"></div><div><h3>Dana<small>Journalist</small></h3><div class="q">Did the air really get cleaner?</div></div></div>
  <div class="col" id="dCol1" style="width:640px">
    <div class="card"><span class="s" style="margin:0 0 6px">A real media request · 2 Nov 2026</span><b>6 questions</b> from one journalist</div>
    <div class="card">Answered by hand: <b>6 pages</b>, <b>23 sources</b></div>
    <div class="card" style="font-size:44px"><span class="k" style="font-size:70px">≈ 5 h</span> of work<span class="s">AAI's estimate: 2 h PR + 3 h research</span></div>
  </div>
  <div class="col" id="dCol2" style="width:640px"></div>
  <div class="browser" id="dBr" style="left:780px;top:276px;width:1060px"><div class="top"><i></i><i></i><i></i><span>taza-copilot.online</span></div><div class="vp" style="height:663px"></div></div>
  <div class="badge" id="dBadge" style="left:90px;top:800px">⚡ Answered in 4.0 s</div>
</section>

<section class="scene" id="s-aliya">
  <div class="head"><div class="clock">08:15</div><div class="av" data-av="aliya"></div><div><h3>Aliya<small>Mother of two</small></h3><div class="q">Can my kids walk to school?</div></div></div>
  <div class="wcap" id="wc1"><div class="card cy"><span class="s" style="margin:0 0 8px">Aliya · in Russian</span>«Мои дети ходят в школу в Турксибе. Насколько там грязный воздух?»</div>
    <div class="card cy"><span class="s" style="margin:0 0 8px">Taza · in Russian, from AAI's research</span>Воздух в Турксибском районе — один из самых грязных в городе: за отопительный сезон 2025–2026 средний PM2.5 там <b>59,3 мкг/м³</b> против 31,1 в Бостандыкском. Утром, с 7:00 до 9:00 — <b>40–46 мкг/м³</b>.<span class="s">AAI · The Air Children in Almaty Breathe</span></div></div>
  <div class="wcap" id="wc2"><div class="card"><span class="s" style="margin:0 0 8px">Aliya · in English</span>“When is it safest to go out today?”</div>
    <div class="card"><span class="s" style="margin:0 0 8px">Taza · in English, from AAI's live sensors</span>Right now, until about 10:00, is one of the cleanest times today: <b>≈ 34 µg/m³</b>. Avoid <b>20:00–22:00</b>, when it gets close to 80.<span class="s">AAI sensor network · today and the same hours over the last 14 days</span></div></div>
  <div class="wcap" id="wc3"><div class="card cy"><span class="s" style="margin:0 0 8px">Aliya · in Kazakh</span>«Мектептердің маңындағы ауа қандай? Балаларға қауіпті ме?»</div>
    <div class="card cy"><span class="s" style="margin:0 0 8px">Taza · in Kazakh, from AAI's research</span>Иә, қауіпті. Оқу күндерінің <b>48,4%</b>-ында мектептер маңындағы PM2.5 ҚР ШРК деңгейінен (35 мкг/м³) жоғары болған. Балалар ересектерге қарағанда 2–3 есе көп ауа жұтады.<span class="s">AAI · Алматыдағы балалар тыныс алатын ауа</span></div></div>
  <div class="col" id="ringTxt" style="top:420px"><div style="font-size:64px;font-weight:700">📞 Calling Taza…</div><div style="font-size:36px;color:#c9ced2;margin-top:16px">on WhatsApp, hands full, kids ready</div></div>
  <div class="sub" id="sub"><div class="who2"><span id="subWho">Aliya</span><span class="lang" id="subLang">EN</span></div><div class="say" id="subSay"></div><div class="en" id="subEn"></div></div>
  <div id="langRow"><span data-l="en">EN</span><span data-l="ru">RU</span><span data-l="kk">KK</span></div>
  <div class="phone" id="wPhone" style="left:1330px;top:90px"><div class="notch"></div><div class="scr">
    <div class="wa"><div class="bar"><i>T</i><div>Taza Copilot<small id="waSt">online</small></div></div>
      <div class="msgs" id="wMsgs">
        <div class="m me cy" data-x="q1">Мои дети ходят в школу в Турксибе. Насколько там грязный воздух?<span class="t">08:15 ✓✓</span></div>
        <div class="m it cy" data-x="a1">Воздух в Турксибском районе — один из самых грязных в городе: за отопительный сезон 2025–2026 средний PM2.5 там <b>59,3 мкг/м³</b> против 31,1 в Бостандыкском. Утром, с 7:00 до 9:00 — <b>40–46 мкг/м³</b>.<span class="ref">📄 AAI · The Air Children in Almaty Breathe</span><span class="t">08:15</span></div>
        <div class="m me" data-x="q2">When is it safest to go out today?<span class="t">08:16 ✓✓</span></div>
        <div class="m it" data-x="a2">Right now, until about 10:00, is one of the cleanest times today: <b>≈ 34 µg/m³</b> 🌤 Avoid <b>20:00–22:00</b>, when it gets close to 80.<span class="ref">📡 AAI sensors, live</span><span class="t">08:16</span></div>
        <div class="m me cy" data-x="q3">Мектептердің маңындағы ауа қандай? Балаларға қауіпті ме?<span class="t">08:17 ✓✓</span></div>
        <div class="m it cy" data-x="a3">Иә, қауіпті. Оқу күндерінің <b>48,4%</b>-ында мектептер маңындағы PM2.5 ҚР ШРК деңгейінен (35 мкг/м³) жоғары болған. Балалар ересектерге қарағанда 2–3 есе көп ауа жұтады.<span class="ref">📄 AAI · Алматыдағы балалар тыныс алатын ауа</span><span class="t">08:17</span></div>
        <div class="typing" id="wTy"><i></i><i></i><i></i></div>
      </div></div>
    <div class="call" id="wCall"><div class="av">T</div><h5>Taza Copilot</h5><p id="callSt">WhatsApp voice call · Calling…</p>
      <div class="wave" id="wave"></div>
      <div class="btns"><i>🔇</i><i class="end">✆</i><i>🔊</i></div></div>
  </div></div>
  <div class="reen" id="reen">Re-enactment · Taza's answers are real</div>
  <div class="col" id="callEnd" style="top:420px"><div style="font-size:120px;font-weight:700;letter-spacing:-3px;line-height:1">EN · RU · KK</div><div style="font-size:44px;color:#c9ced2;margin-top:24px">Chat or call. Every answer from AAI's research.</div></div>
</section>

<section class="scene" id="s-tg">
  <div class="head"><div class="clock" id="tgClock">07:30</div><div class="av" data-av="aliya"></div><div><h3>Taza on Telegram<small>@SmogHuntersBot · groups, private chats, inline</small></h3></div></div>
  <div class="col" id="tCol"></div>
  <div class="phone" id="tPhone" style="left:1330px;top:90px"><div class="notch"></div><div class="scr">
    <div class="tg"><div class="bar"><i id="tgIc">👪</i><div><span id="tgNm">Parents · Class 3B</span><small id="tgSub">28 members</small></div></div>
      <div class="msgs" id="tMsgs">
        <div class="m it" data-c="1" data-k="card"><span class="nm bot">Taza Copilot</span>🏫 <b>Good morning! Air at Lyceum No. 12</b> · 07:30<br><br>🟡 <b>34 µg/m³</b> · Moderate<br><br>🕐 Best time to go out today: <b>06:00–08:00</b> (≈ 33.6), avoid <b>20:00–22:00</b> (≈ 79.7).<span class="t">07:30</span></div>
        <div class="m me" data-c="1" data-k="voice"><span class="vbar" id="vb"></span>0:04<span class="t">07:35 ✓✓</span></div>
        <div class="m it" data-c="1" data-k="vrep"><span class="nm bot">Taza Copilot</span>🎙 You said: <i>«When is it better to go for a walk today?»</i><br><br>🕐 <b>Best time to go out today</b><br>✅ <b>06:00–08:00</b> · ≈ 33.6 µg/m³<br>⛔ Avoid <b>20:00–22:00</b> · ≈ 79.7 µg/m³<span class="t">07:35</span></div>
        <div class="m me cy" data-c="1" data-k="fwd"><span class="fwd">Forwarded message</span>Говорят, что 80% смога в Алматы дают машины!<span class="t">07:40 ✓✓</span></div>
        <div class="m it cy" data-c="1" data-k="chk"><span class="nm bot">Taza Copilot</span>🔎 Исследования AAI не подтверждают долю в 80%: выхлопы автомобилей дают <b>14%</b> частиц PM2.5, дорожная пыль — <b>32%</b>, ТЭЦ и котельные — около 18%.<span class="ref" style="color:#2a8bd6">📄 AAI · Main Sources of PM2.5 Pollution in Almaty</span><span class="t">07:40</span></div>
        <div class="m me" data-c="2" data-k="loc"><div class="loc"></div>Location<span class="t">21:40 ✓✓</span></div>
        <div class="m it" data-c="2" data-k="near">📍 <b>Nearest sensor</b>: №61 mektep<br><i>0.4 km away · updated 21:40</i><br><br>🟣 <b>281.8 µg/m³</b> · Very unhealthy<div class="btnrow"><span>⭐ Save as my place</span></div><span class="t">21:40</span></div>
        <div class="m it" data-c="2" data-k="saved">⭐ Saved: <b>№61 mektep</b>. I'll alert you when the air there gets bad.<span class="t">21:40</span></div>
        <div class="m it" data-c="2" data-k="alerts">🔔 <b>Air alerts</b><div class="btnrow"><span>✅ Morning alert: on</span><span>✅ Weekly summary: on</span><span>✅ New AAI research: on</span></div><div class="btnrow" style="grid-template-columns:1fr 1fr"><span>✅ 🚗 I'm a driver</span><span>🧍 I'm a rider</span></div><span class="t">21:41</span></div>
        <div class="m it" data-c="3" data-k="sent"><span class="via">via @SmogHuntersBot</span>❓ <b>Did Almaty's air really get cleaner in 2025?</b><br><br>No. AAI's sources show the air got worse in 2025: <b>31.2 µg/m³</b>, almost 30% above 2024.<br><i>⚡ · Taza Copilot</i><span class="t">21:45 ✓✓</span></div>
        <div class="kb" id="tKb"><span>🌫 Air now</span><span>🗺 Districts</span><span>📍 Air near me</span><span>🕐 Best time today</span><span>🔎 Check a claim</span><span>⭐ My places</span><span>🔔 Alerts</span><span>🌐 Language</span></div>
      </div>
      <div class="inres" id="inRes"><b>Did Almaty's air really get cleaner in 2025?</b>No. AAI's sources show the air got worse in 2025…</div>
      <div class="inbar" id="inBar"><b>@SmogHuntersBot</b> did Almaty's air really get cleaner in 2025?</div>
    </div>
  </div></div>
  <div class="reen">Re-enactment · real bot texts and AAI data</div>
</section>

<section class="scene" id="s-arman">
  <div class="head"><div class="clock">21:00</div><div class="av" data-av="arman"></div><div><h3>Arman<small>inDrive driver</small></h3><div class="q">Windows open or shut today?</div></div></div>
  <div class="col" id="aCol1">
    <div class="card" id="aBest"><span class="k">✅ Cleanest</span> <b>06:00–08:00</b> · ≈ 34 µg/m³</div>
    <div class="card" id="aWorst"><span style="color:var(--red);font-weight:700">⛔ Dirtiest</span> <b>20:00–22:00</b> · ≈ 80 µg/m³</div>
    <div class="card" id="a7"><div class="big7">7×</div><b>dirtier air</b> for drivers in a jam with open windows than for pedestrians at intersections.<span class="s">AAI · “Not the Quantity, but the Quality: how Almaty's vehicle fleet affects air quality”, page 5</span></div>
  </div>
  <div class="col" id="aCol2">
    <div class="code" id="aCode"><span class="g">GET</span> /api/partner/brief?role=<span class="y">driver</span>&amp;lang=<span class="y">kk</span>

{ "air": { "pm25": 95.5, "worst_district": "Turksib" },
  "best_time":  "06:00–08:00",
  "worst_time": "20:00–22:00",
  "driver": { "title": "⚠️ Polluted air today · 95.5 µg/m³", … },
  "source": { "title": "AAI…", "page": 5 } }</div>
    <div class="chips" id="aChips"><span class="on">🚗 Drivers</span><span class="on">🧍 Riders</span><span>EN</span><span>RU</span><span>KK</span><span>no AI cost · live AAI data</span></div>
  </div>
  <div class="phone" id="aPhone" style="left:1330px;top:90px"><div class="notch"></div><div class="scr">
    <div class="drv"><div class="car"></div><div class="online">🟢 <b>Online</b> · looking for rides nearby…</div></div>
    <div class="push" id="pDrv"><div class="hd"><div class="ic">T</div>Taza Copilot · now</div><b>⚠️ Polluted air today · 95.5 µg/m³</b>In traffic jams, keep the windows closed and use recirculation: with open windows you breathe air 7× dirtier than pedestrians at intersections (AAI). Dirtiest hours: 20:00–22:00.</div>
    <div class="push" id="pJam" style="top:330px"><div class="hd"><div class="ic">T</div>Taza Copilot · now</div><b>🚦 Traffic jam: close the windows</b>Switch to recirculation. In a jam the air inside a car is 40% dirtier than in moving traffic, and 7× dirtier with open windows than for pedestrians (AAI, p. 5).</div>
    <div class="push" id="pRide"><div class="hd"><div class="ic">T</div>Taza Copilot · for riders</div><b>⚠️ Polluted air today · 95.5 µg/m³</b>Wait for your car indoors, not by a busy road, and ask the driver to close the windows. Cleanest hours: 06:00–08:00.</div>
  </div></div>
  <div class="tagc" id="aConcept" style="left:1400px;top:1020px;background:#2b3135;color:#dfe3e6">Concept: Taza inside the inDrive app</div>
</section>

<section class="scene" id="s-admin">
  <div class="title">Behind it all: the AAI team<small>🔒 Admin page · only the team has the key</small></div>
  <div class="col" id="adCol" style="width:640px;top:300px"></div>
  <div class="browser" id="adBr" style="left:780px;top:250px;width:1060px"><div class="top"><i></i><i></i><i></i><span id="adUrl">taza-copilot.online/admin</span></div><div class="vp" style="height:663px"></div></div>
</section>

<section class="scene" id="s-proof">
  <div class="title">Measured, and cheap to run<small>Accuracy dashboard · AI model · live on the site</small></div>
  <div class="ctr abs" id="ctr" style="left:90px;top:300px;width:660px">
    <div><b data-n="44" data-f="44/44">0</b><span>accuracy test: right figure and a cited source</span></div>
    <div><b data-n="99" data-f="99%">0</b><span>answers with a source</span></div>
    <div><b data-n="5.4" data-f="5.4 s">0</b><span>median time to answer</span></div>
    <div><b data-n="0" data-f="$0">0</b><span>AI cost with a local model (Ollama)</span></div>
  </div>
  <div class="chips abs" id="provs" style="left:90px;top:760px;width:680px"><span>Claude</span><span>OpenAI</span><span>OpenRouter</span><span>DeepInfra</span><span class="on">Ollama · free</span><span>≈ $7 / month hosting</span><span>≈ $0.017 per answer</span></div>
  <div class="browser" id="dsBr" style="left:820px;top:250px;width:1020px"><div class="top"><i></i><i></i><i></i><span>taza-copilot.online</span></div><div class="vp" style="height:638px"></div></div>
</section>

<section class="scene" id="s-metric">
  <div id="mWrap"><h6>Our metric</h6><div class="l1">Time to a sourced answer:</div><div class="l2">from hours to seconds.</div></div>
</section>

<section class="scene" id="s-thanks">
  <div id="ty"><h1>Thank you.</h1>
    <div id="qrs">
      <div><div class="q"><img src="img/qr_site.png"></div><h5 style="color:var(--lime)">Try it now</h5><p>taza-copilot.online</p></div>
      <div><div class="q"><img src="img/qr_tg.png"></div><h5 style="color:#38a8f2">Telegram</h5><p>@SmogHuntersBot</p></div>
      <div><div class="q"><img src="img/qr_wa.png"></div><h5 style="color:#2fd06c">WhatsApp</h5><p>chat or call the Copilot</p></div>
    </div>
    <div id="tryNow">Feel free to try it, right now.</div>
    <div id="aimira">Now, over to Aimira →</div>
    <div id="team">Team Smog Hunters · Ahmed · Khaled · Usman · Aimira · Zaki</div>
  </div>
</section>
<div id="cap"></div>
<div id="prog"></div>
<script>"""

CODE = r"""// ---------- init ----------
function init(tl) {
  TL = tl;
  for (const el of $$('[data-av]')) el.innerHTML = avatar(el.dataset.av);
  for (const w of $$('.who')) w.querySelector('.av').innerHTML = avatar(w.dataset.k);
  const smog = $('#smog');
  [['#5c5348', 900, 200, 300], ['#3f3b36', 1100, 1100, 500], ['#6a5f50', 800, 600, 700], ['#2f2d2a', 1200, 300, 900], ['#544c42', 700, 1500, 200]].forEach(([c, r, x, y]) => {
    const i = document.createElement('i'); i.style.cssText = `width:${r}px;height:${r}px;left:${x}px;top:${y}px;background:${c}`; smog.appendChild(i);
  });
  $('#docs').innerHTML = Array.from({ length: 150 }, () => '<i></i>').join('');
  $('#wave').innerHTML = Array.from({ length: 22 }, () => '<i></i>').join('');
  $('#vb').innerHTML = Array.from({ length: 26 }, (_, k) => `<i style="height:${6 + Math.round(18 * Math.abs(Math.sin(k * 1.7)))}px"></i>`).join('');
  $('#tCol').innerHTML = [['🏫', 'Daily air card for the school', 'card'], ['🎙', 'Questions by voice message', 'voice'], ['🔎', 'Forwarded rumours, fact-checked', 'fwd'], ['📍', 'Air near me', 'loc'], ['⭐', 'Saved places and their alerts', 'saved'], ['🔔', 'Morning, weekly and new-research alerts', 'alerts'], ['💬', 'Inline in any chat: @SmogHuntersBot', 'inline'], ['🌐', 'English · Русский · Қазақша', 'lang']]
    .map(([i, x, k]) => `<div class="tick" data-k="${k}" style="font-size:33px;margin-bottom:16px"><i>${i}</i>${x}</div>`).join('');
  $('#dCol2').innerHTML = ['✓ The exact quote', '✓ The page and the link', '⇄ Compare cities and districts', '🔎 Check a claim', '📄 Policy brief'].map(x => `<div class="tick">${x}</div>`).join('');
  $('#adCol').innerHTML = ['⬆ Upload a PDF: searchable in seconds', '✉ 5-point summary to Telegram, in 3 languages', '🔄 Checks air.org.kz every day', '🙈 Hide an outdated source, nothing deleted', '❓ Unanswered questions: what to research next']
    .map(x => `<div class="tick" style="font-size:31px">${x}</div>`).join('');
}

// ---------- frame ----------
function renderFrame(i) {
  const t = i / 30;
  $('#prog').style.width = (100 * t / TL.total) + '%';
  for (const sc of $$('.scene')) {
    const s = S(sc.id.slice(2)); const o = fade(t, s.s, s.e, .45);
    sc.style.display = o > 0 ? 'block' : 'none'; sc.style.opacity = o;
  }
  const smogO = t < S('dana').s ? .9 : .35 * (1 - seg(t, S('metric').s, S('metric').s + 2));
  $('#smog').style.opacity = smogO * Math.min(1, seg(t, 0, 2.5) + (t > 3 ? 1 : 0));
  $$('#smog i').forEach((b, k) => { b.style.transform = `translate(${Math.sin(t * .11 + k) * 140}px, ${Math.cos(t * .09 + k * 2) * 90}px)`; });
  // English captions of the narration (the call has its own subtitles)
  const cap = TL.caps.find(c => t >= c.s && t < c.e), capEl = $('#cap');
  if (cap) {
    capEl.textContent = cap.text;
    capEl.style.opacity = Math.min(seg(t, cap.s, cap.s + .12), 1 - seg(t, cap.e - .12, cap.e));
    const side = ['dana', 'aliya', 'tg', 'arman', 'admin', 'proof'].find(k => t >= S(k).s && t < S(k).e);
    capEl.style.left = (side ? 670 : 960) + 'px';
  } else capEl.style.opacity = 0;
  $('#sky').style.opacity = t < S('thanks').s - 1 ? 0 : seg(t, S('thanks').s - 1, S('thanks').s + 1.5) * .7;

  // hook: the number, then one line: Kazakhstan · Almaty
  if (t < S('hook').e + .5) {
    const h1 = V('x_hook1'), h2 = V('x_hook2');
    $('#n14').textContent = Math.round(14000 * eo(seg(t, h1.s - .3, h1.s + 1.3))).toLocaleString('en-US');
    $('#n14').style.opacity = seg(t, h1.s - .6, h1.s - .1);
    ap($('#l14a'), t, h1.s + 1.0, .7, 0); $('#l14a').style.display = 'inline-block';
    ap($('#l14b'), t, h2.s + .2, .7, 0); $('#l14b').style.display = 'inline-block';
    ap($('#hSrc'), t, h2.s + 1.0, .8, 0);
  }
  // problem, then Taza and the three people (one voice line)
  if (t > S('problem').s - 1 && t < S('meet').e + 1) {
    const p = S('problem');
    ap($('#pTitle'), t, p.s + .1, .6, 20);
    $$('#docs i').forEach((d, k) => { const a = p.s + .2 + (k % 15) * .03 + Math.floor(k / 15) * .09; const q = eo(seg(t, a, a + .3)); d.style.opacity = q; d.style.transform = `scale(${.6 + .4 * q})`; });
    const dim = seg(t, p.s + (p.e - p.s) * .5, p.s + (p.e - p.s) * .5 + .5);
    $('#docs').style.filter = `blur(${7 * dim}px)`; $('#docs').style.opacity = 1 - .65 * dim;
    ap($('#pOne'), t, p.s + (p.e - p.s) * .55, .5, 30);
    const m = S('meet'), split = m.s + 1.3;
    const lp = eo(seg(t, m.s - .1, m.s + .6)), up = eio(seg(t, split, split + .6));
    $('#logo').style.opacity = lp * (1 - up); $('#logo').style.transform = `scale(${.92 + .08 * lp - .1 * up}) translateY(${-60 * up}px)`;
    $$('#cast .who').forEach((w, k) => { ap(w, t, split + .35 + k * .25, .55, 50); w.classList.toggle('on', t > m.e - 1.0 && w.dataset.k === 'dana'); });
  }
  // dana
  if (t > S('dana').s - 1 && t < S('dana').e + 1) {
    const d1 = V('x_dana1'), d2 = V('x_dana2');
    ap($('#dCol1'), t, d1.s + d1.d * .4, .5, 0, d2.s);
    $$('#dCol1 .card').forEach((c, k) => ap(c, t, d1.s + d1.d * .4 + k * .45, .5, 30));
    $$('#dCol2 .tick').forEach((x, k) => ap(x, t, d2.s + d2.d * [.3, .42, .62, .76, .88][k], .5, 0, 1e9, -40));
    ap($('#dBr'), t, d2.s - .2, .7, 60);
    ap($('#dBadge'), t, d2.s + .7, .45, -20, d2.s + d2.d * .55);
    montage($('#dBr'), [
      { n: 'answer', z0: 1.22, z1: 1.3, o: '35% 88%', w: 2.4 }, { n: 'quote', z0: 1.4, z1: 1.5, o: '38% 35%', w: 1.6 },
      { n: 'compare_city', z0: 1.35, z1: 1.42, o: '22% 18%' }, { n: 'check', z0: 1.35, z1: 1.42, o: '62% 42%' }, { n: 'brief', z0: 1.3, z1: 1.38, o: '45% 22%' },
    ], t, d2.s, S('dana').e);
  }
  // aliya: WhatsApp chat in three languages, then the call
  if (t > S('aliya').s - 1 && t < S('aliya').e + 1) {
    const l2 = V('x_aliya2'), C = TL.cue.chat;
    ap($('#wPhone'), t, S('aliya').s + .2, .8, 60);
    $$('#wMsgs .m').forEach(m => { m.style.display = t >= C[m.dataset.x] ? 'block' : 'none'; });
    const typing = [['q1', 'a1'], ['q2', 'a2'], ['q3', 'a3']].some(([q, a]) => t >= C[q] + .6 && t < C[a]);
    $('#wTy').style.display = typing ? 'flex' : 'none'; $('#waSt').textContent = typing ? 'typing…' : 'online';
    $$('#wTy i').forEach((d, k) => { d.style.opacity = .35 + .65 * Math.abs(Math.sin(t * 5 + k)); });
    for (const [k, q, nx] of [[1, 'q1', 'q2'], [2, 'q2', 'q3'], [3, 'q3', null]]) {
      const el = $('#wc' + k), until = nx ? C[nx] - .1 : l2.s + .3;
      ap(el, t, C[q], .45, 20, until);
      const cards = $$('.card', el); ap(cards[0], t, C[q], .45, 20); ap(cards[1], t, C['a' + k], .45, 20);
    }
    $('#wCall').style.opacity = seg(t, l2.s + .4, l2.s + .7);
    const pick = TL.cue.pick, hang = TL.cue.hang;
    let st = 'WhatsApp voice call · Calling…';
    if (t >= pick) st = `WhatsApp voice call · 00:${String(Math.max(0, Math.floor(t - pick))).padStart(2, '0')}`;
    if (t >= hang) st = 'Call ended';
    $('#callSt').textContent = st;
    let cur = null;
    for (const c of TL.call) if (t >= V(c.id).s - .15 && t < Ve(c.id) + .5) cur = c;
    const speaking = cur && t < Ve(cur.id);
    $$('#wave i').forEach((b, k) => { const h = speaking && cur.who === 'taza' ? 14 + 90 * Math.abs(Math.sin(t * 9 + k * .8) * Math.sin(t * 3.1 + k)) : speaking ? 10 + 30 * Math.abs(Math.sin(t * 8 + k)) : 8; b.style.height = h + 'px'; b.style.opacity = t >= pick && t < hang ? 1 : .25; });
    const inCall = t >= pick - .2 && t < hang;
    $('#sub').style.opacity = inCall && cur ? 1 : 0;
    if (cur) {
      $('#subWho').textContent = cur.who === 'taza' ? 'Taza Copilot' : 'Aliya';
      $('#subLang').textContent = cur.lang.toUpperCase();
      $('#subSay').textContent = cur.say; $('#subSay').className = 'say' + (cur.lang === 'en' ? '' : ' cy');
      $('#subEn').textContent = '';
      const p = eo(seg(t, V(cur.id).s - .15, V(cur.id).s + .3)); $('#subSay').style.opacity = p; $('#subEn').style.opacity = p;
    }
    $('#langRow').style.opacity = inCall ? 1 : 0;
    $$('#langRow span').forEach(s => s.classList.toggle('on', !!cur && cur.lang === s.dataset.l));
    ap($('#ringTxt'), t, l2.s + 1.0, .5, 20, pick - .1);
    ap($('#callEnd'), t, hang + .1, .6, 30);
  }
  // telegram: the group, the bot's private chat, then inline in a friend's chat; each step when the voice names it
  if (t > S('tg').s - 1 && t < S('tg').e + 1) {
    const g = S('tg'), at = TL.cue.tg;
    ap($('#tPhone'), t, g.s + .2, .8, 60);
    const chat = t < at.loc - .25 ? 1 : t < at.inline - .1 ? 2 : 3;
    $('#tgIc').textContent = ['👪', '🤖', '👩'][chat - 1];
    $('#tgClock').textContent = chat === 1 ? '07:30' : '21:40';
    $('#tgNm').textContent = ['Parents · Class 3B', 'Taza Copilot', 'Saule'][chat - 1];
    $('#tgSub').textContent = ['28 members', 'bot', 'online'][chat - 1];
    $$('#tMsgs .m').forEach(m => { m.style.display = +m.dataset.c === chat && t >= at[m.dataset.k] ? 'block' : 'none'; });
    $('#tKb').style.display = chat === 2 && t >= at.kb ? 'grid' : 'none';
    $('#inBar').style.display = chat === 3 && t < at.sent ? 'block' : 'none';
    $('#inRes').style.display = chat === 3 && t >= at.inres && t < at.sent ? 'block' : 'none';
    $$('#tCol .tick').forEach(x => ap(x, t, at[x.dataset.k], .45, 0, 1e9, -40));
  }
  // arman (Taza for inDrive)
  if (t > S('arman').s - 1 && t < S('arman').e + 1) {
    const a2 = V('x_arman2'), a3 = V('x_arman3');
    ap($('#aPhone'), t, S('arman').s + .2, .8, 60);
    ap($('#aConcept'), t, S('arman').s + .8, .6, 10);
    ap($('#pDrv'), t, TL.cue.push, .55, -160, a3.s);
    ap($('#aCol1'), t, TL.cue.push + .3, .3, 0, a3.s);
    ap($('#aBest'), t, TL.cue.push + .5, .5, 30); ap($('#aWorst'), t, TL.cue.push + 1.4, .5, 30);
    ap($('#a7'), t, TL.cue.jam - .2, .6, 30);
    ap($('#pJam'), t, TL.cue.jam, .55, -60, a3.s);
    ap($('#aCol2'), t, a3.s + .1, .6, 30);
    ap($('#pRide'), t, a3.s + a3.d * .45, .55, -160);
  }
  // admin
  if (t > S('admin').s - 1 && t < S('admin').e + 1) {
    const a1 = V('x_admin1'), a2 = V('x_admin2');
    ap($('#adBr'), t, S('admin').s + .1, .7, 60);
    $$('#adCol .tick').forEach((x, k) => ap(x, t, [a1.s + a1.d * .4, a1.s + a1.d * .72, a2.s + .2, a2.s + a2.d * .3, a2.s + a2.d * .6][k], .5, 0, 1e9, -40));
    const gapsAt = a2.s + a2.d * .55;
    montage($('#adBr'), [
      { n: 'admin_form', z0: 1.35, z1: 1.42, o: '45% 30%', at: S('admin').s }, { n: 'admin_done', z0: 1.45, z1: 1.52, o: '45% 44%', at: a1.s + a1.d * .55 },
      { n: 'admin_lib', z0: 1.35, z1: 1.42, o: '35% 20%', at: a2.s - .1 }, { n: 'admin_src', z0: 1.35, z1: 1.42, o: '40% 35%', at: a2.s + a2.d * .27 },
    ], t, S('admin').s, gapsAt, { hideLast: true });
    montage($('#adBr'), [{ n: 'dash_eval', z0: 1.5, z1: 1.58, o: '25% 78%' }], t, gapsAt, S('admin').e, { slideIn: true, z: 20 });
    $('#adUrl').textContent = t < gapsAt ? 'taza-copilot.online/admin' : 'taza-copilot.online · dashboard (AAI team)';
  }
  // proof: accuracy and cost
  if (t > S('proof').s - 1 && t < S('proof').e + 1) {
    const d = V('x_proof');
    ap($('#dsBr'), t, S('proof').s + .1, .7, 60);
    $$('#ctr > div').forEach((c, k) => {
      const at = d.s + [d.d * .12, d.d * .2, d.d * .3, d.d * .62][k]; ap(c, t, at, .5, 30);
      const b = c.querySelector('b'), n = +b.dataset.n, p = eo(seg(t, at, at + .9));
      b.textContent = p >= 1 || !n ? b.dataset.f : (n % 1 ? (n * p).toFixed(1) : Math.round(n * p));
    });
    $$('#provs span').forEach((s, k) => ap(s, t, d.s + d.d * .38 + k * .35, .4, 20));
    montage($('#dsBr'), [{ n: 'dash_top', z0: 1.35, z1: 1.45, o: '35% 12%' }, { n: 'ai', z0: 1.4, z1: 1.5, o: '25% 30%' }], t, S('proof').s, S('proof').e);
  }
  if (t > S('metric').s - 1 && t < S('metric').e + 1) {
    const m = V('metric');
    ap($('#mWrap h6'), t, S('metric').s + .2, .5, 10); ap($('#mWrap .l1'), t, m.s, .6, 30); ap($('#mWrap .l2'), t, m.s + m.d * .5, .6, 30);
  }
  if (t > S('thanks').s - 1) {
    const th = V('thanks');
    ap($('#ty h1'), t, S('thanks').s + .2, .7, 30);
    $$('#qrs > div').forEach((q, k) => ap(q, t, th.s + .6 + k * .3, .6, 40));
    ap($('#tryNow'), t, th.s + 1.8, .6, 20);
    const a = ap($('#aimira'), t, th.s + th.d * .62, .7, 0);
    $('#aimira').style.transform = `translateX(-50%) scale(${.9 + .1 * a})`;
    ap($('#team'), t, th.s + 1.2, .8, 0);
  }
}
</script>
</body></html>
"""
open(os.path.join(here, 'story3.html'), 'w', encoding='utf-8').write(head + BODY + helpers + CODE)
print('story3.html written')
