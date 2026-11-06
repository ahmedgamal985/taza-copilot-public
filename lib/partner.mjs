// Taza for inDrive: a short daily air message for drivers and riders, in English, Russian and Kazakh.
// The same texts feed the partner API (a push or an in-app banner in inDrive), the Telegram morning alert
// for people who chose "driver" or "rider", and the concept page on the site. No AI: fixed texts, live
// numbers from AAI, and advice grounded in AAI's own research (quoted with its page).

export const ROLES = ['driver', 'rider'];
export const LANGS = ['en', 'ru', 'kk'];
const LIMIT = 35; // Kazakhstan's daily limit for PM2.5 (µg/m³): above it, the morning push is worth sending

// AAI, "Not the Quantity, but the Quality: how Almaty's vehicle fleet affects air quality", page 5
export const SOURCE = {
  en: { title: 'Not the Quantity, but the Quality: how the structure of Almaty’s vehicle fleet affects air quality (AAI)', page: 5,
    url: 'https://air.org.kz/wp-content/uploads/2026/02/Not-the-Quantity-but-the-Quality_-How-the-Structure-of-Almatys-Vehicle-Fleet-Affects-Air-Quality.pdf#page=5',
    quote: 'Drivers and passengers stuck in traffic with the open windows breathe air seven times more polluted than pedestrians standing at intersections. Furthermore, air pollution inside a car stuck in traffic is 40% higher than under free-flowing traffic conditions.' },
  ru: { title: 'Не количество, а качество: как структура автопарка влияет на воздух в Алматы (AAI)', page: 5,
    url: 'https://air.org.kz/wp-content/uploads/2026/01/Не-количество-а-качество_-как-структура-автопарка-влияет-на-воздух-в-Алматы-.pdf#page=5',
    quote: 'Водители и пассажиры автомобиля, застрявшего в пробке с открытыми окнами, дышат воздухом в 7 раз грязнее, чем пешеходы, стоящие на перекрестке. При этом загрязнение воздуха в салоне автомобиля, застрявшего в пробках, на 40% выше, чем при свободном движении транспорта.' },
  kk: { title: 'Саны емес, сапасы: автопарк құрылымының Алматы ауасына әсері (AAI)', page: 5,
    url: 'https://air.org.kz/wp-content/uploads/2026/02/Саны-емес-сапасы_-автопарк-құрылымының-Алматы-ауасына-әсері-Almaty-Air-Initiative-қорының-зерттеуі.pdf#page=5',
    quote: 'Терезесі ашық тұрған автокөліктің жүргізушілері мен жолаушылары қиылыста тұрған жаяу жүргіншілерге қарағанда 7 есе лас ауамен тыныс алатыны анықталған. Сонымен қатар, кептелісте тұрған автокөлік салонындағы ауа ластануы көлік еркін қозғалған жағдаймен салыстырғанда 40%-ға жоғары.' },
};

// {v} PM2.5 now, {best} / {worst} the cleanest and dirtiest two hours today
const T = {
  en: {
    title: { good: '🌿 Clean air today · {v} µg/m³', moderate: '🙂 Moderate air today · {v} µg/m³', bad: '⚠️ Polluted air today · {v} µg/m³' },
    driver: {
      body: {
        good: 'A good day to air out the car. Cleanest hours: {best}.',
        moderate: 'In heavy traffic, close the windows and switch to recirculation. Dirtiest hours: {worst}.',
        bad: 'In traffic jams, keep the windows closed and use recirculation: with open windows you breathe air 7× dirtier than pedestrians at intersections (AAI). Dirtiest hours: {worst}.',
      },
      tips: {
        good: ['Open the windows and air the car between rides.', 'Cleanest hours today: {best}.'],
        moderate: ['In traffic jams, close the windows and switch to recirculation.', 'Take your breaks away from big roads, especially at {worst}.'],
        bad: ['In traffic jams, close the windows and switch to recirculation. AAI: in a jam the air inside a car is 40% dirtier than in moving traffic, and with open windows 7× dirtier than for pedestrians at intersections.',
          'Check the cabin air filter: a clogged one lets more fine dust in.', 'Take your breaks away from big roads, especially at {worst}.'],
      },
    },
    rider: {
      body: {
        good: 'A good day to walk to your pickup point. Cleanest hours: {best}.',
        moderate: 'Sensitive to the air? Wait for your car indoors, not by a busy road.',
        bad: 'Wait for your car indoors, not by a busy road, and ask the driver to close the windows. Cleanest hours: {best}.',
      },
      tips: {
        good: ['A good day to walk part of the way.', 'Cleanest hours today: {best}.'],
        moderate: ['Wait indoors until your car is close: the app shows when it arrives.', 'Children, older people and people with asthma: avoid long walks along busy roads at {worst}.'],
        bad: ['Wait indoors until your car is close: the app shows when it arrives.', 'Ask the driver to close the windows and switch to recirculation.',
          'Children, older people and people with asthma: avoid walks along busy roads, especially at {worst}.', 'If you must be outside for long, an N95/FFP2 mask helps.'],
      },
    },
  },
  ru: {
    title: { good: '🌿 Сегодня чистый воздух · {v} мкг/м³', moderate: '🙂 Сегодня умеренный воздух · {v} мкг/м³', bad: '⚠️ Сегодня грязный воздух · {v} мкг/м³' },
    driver: {
      body: {
        good: 'Хороший день, чтобы проветрить машину. Самые чистые часы: {best}.',
        moderate: 'В плотном потоке закройте окна и включите рециркуляцию. Самые грязные часы: {worst}.',
        bad: 'В пробках держите окна закрытыми и включите рециркуляцию: с открытыми окнами в пробке воздух в 7 раз грязнее, чем у пешеходов на перекрёстке (AAI). Самые грязные часы: {worst}.',
      },
      tips: {
        good: ['Откройте окна и проветрите салон между поездками.', 'Самые чистые часы сегодня: {best}.'],
        moderate: ['В пробках закрывайте окна и включайте рециркуляцию.', 'Делайте перерывы подальше от больших дорог, особенно в {worst}.'],
        bad: ['В пробках закрывайте окна и включайте рециркуляцию. По данным AAI, в салоне машины в пробке воздух на 40% грязнее, чем при свободном движении, а с открытыми окнами — в 7 раз грязнее, чем у пешеходов на перекрёстке.',
          'Проверьте салонный фильтр: забитый пропускает больше мелкой пыли.', 'Делайте перерывы подальше от больших дорог, особенно в {worst}.'],
      },
    },
    rider: {
      body: {
        good: 'Хороший день, чтобы дойти до точки посадки пешком. Самые чистые часы: {best}.',
        moderate: 'Чувствительны к воздуху? Ждите машину в помещении, а не у оживлённой дороги.',
        bad: 'Ждите машину в помещении, а не у оживлённой дороги, и попросите водителя закрыть окна. Самые чистые часы: {best}.',
      },
      tips: {
        good: ['Хороший день, чтобы часть пути пройти пешком.', 'Самые чистые часы сегодня: {best}.'],
        moderate: ['Ждите в помещении, пока машина не подъедет: приложение покажет, когда она рядом.', 'Детям, пожилым и людям с астмой лучше не гулять долго вдоль оживлённых дорог в {worst}.'],
        bad: ['Ждите в помещении, пока машина не подъедет: приложение покажет, когда она рядом.', 'Попросите водителя закрыть окна и включить рециркуляцию.',
          'Детям, пожилым и людям с астмой лучше не гулять вдоль оживлённых дорог, особенно в {worst}.', 'Если нужно долго быть на улице, поможет маска N95/FFP2.'],
      },
    },
  },
  kk: {
    title: { good: '🌿 Бүгін ауа таза · {v} мкг/м³', moderate: '🙂 Бүгін ауа орташа · {v} мкг/м³', bad: '⚠️ Бүгін ауа лас · {v} мкг/м³' },
    driver: {
      body: {
        good: 'Көлікті желдетуге жақсы күн. Ең таза сағаттар: {best}.',
        moderate: 'Көлік көп кезде терезені жабып, рециркуляцияны қосыңыз. Ең лас сағаттар: {worst}.',
        bad: 'Кептелісте терезені жабық ұстап, рециркуляцияны қосыңыз: терезе ашық болса, кептелісте ауа қиылыстағы жаяу жүргіншілерге қарағанда 7 есе лас (AAI). Ең лас сағаттар: {worst}.',
      },
      tips: {
        good: ['Сапарлар арасында терезені ашып, салонды желдетіңіз.', 'Бүгінгі ең таза сағаттар: {best}.'],
        moderate: ['Кептелісте терезені жабып, рециркуляцияны қосыңыз.', 'Үзілісті үлкен жолдардан алыс жерде жасаңыз, әсіресе {worst} аралығында.'],
        bad: ['Кептелісте терезені жабып, рециркуляцияны қосыңыз. AAI деректері бойынша кептелістегі көлік салонында ауа еркін қозғалыспен салыстырғанда 40%-ға лас, ал терезе ашық болса — қиылыстағы жаяу жүргіншілерге қарағанда 7 есе лас.',
          'Салон сүзгісін тексеріңіз: бітелген сүзгі ұсақ шаңды көбірек өткізеді.', 'Үзілісті үлкен жолдардан алыс жерде жасаңыз, әсіресе {worst} аралығында.'],
      },
    },
    rider: {
      body: {
        good: 'Отыру нүктесіне жаяу баруға жақсы күн. Ең таза сағаттар: {best}.',
        moderate: 'Ауаға сезімталсыз ба? Көлікті көп жүретін жол жанында емес, ғимарат ішінде күтіңіз.',
        bad: 'Көлікті көп жүретін жол жанында емес, ғимарат ішінде күтіңіз және жүргізушіден терезені жабуды сұраңыз. Ең таза сағаттар: {best}.',
      },
      tips: {
        good: ['Жолдың бір бөлігін жаяу жүруге жақсы күн.', 'Бүгінгі ең таза сағаттар: {best}.'],
        moderate: ['Көлік жақындағанша ғимарат ішінде күтіңіз: қосымша оның қашан келетінін көрсетеді.', 'Балалар, қарттар және демікпесі барлар {worst} аралығында көп жүретін жолдардың бойында ұзақ серуендемегені жөн.'],
        bad: ['Көлік жақындағанша ғимарат ішінде күтіңіз: қосымша оның қашан келетінін көрсетеді.', 'Жүргізушіден терезені жауып, рециркуляцияны қосуды сұраңыз.',
          'Балалар, қарттар және демікпесі барлар көп жүретін жолдардың бойында серуендемегені жөн, әсіресе {worst} аралығында.', 'Далада ұзақ болу керек болса, N95/FFP2 маскасы көмектеседі.'],
      },
    },
  },
};

// Location-based parts (a point sent by the app, used once, never stored) and the traffic-jam reminder
const NEAR = {
  en: { cats: { good: 'good', moderate: 'moderate', sensitive: 'unhealthy for sensitive groups', unhealthy: 'unhealthy', very: 'very unhealthy' },
    pickup: { good: 'Air at your pickup: {v} µg/m³, {cat}. Fine to wait outside.', moderate: 'Air at your pickup: {v} µg/m³, {cat}. Sensitive to the air? Wait inside.',
      bad: 'Air at your pickup: {v} µg/m³, {cat}. Wait inside until your car is close.' },
    brk: 'Cleaner place for a break: near {name}, {v} µg/m³, {d} km away.', brk_here: 'The air around you is already the cleanest nearby.',
    jam_title: 'Traffic jam: close the windows', jam: { good: 'The air is clean today: no need to close the windows.',
      moderate: 'Switch to recirculation. In a jam the air inside a car is 40% dirtier than in moving traffic (AAI, p. 5).',
      bad: 'Switch to recirculation. In a jam the air inside a car is 40% dirtier than in moving traffic, and 7× dirtier with open windows than for pedestrians (AAI, p. 5).' } },
  ru: { cats: { good: 'хорошо', moderate: 'умеренно', sensitive: 'вредно для чувствительных групп', unhealthy: 'вредно', very: 'очень вредно' },
    pickup: { good: 'Воздух у точки посадки: {v} мкг/м³, {cat}. Можно ждать на улице.', moderate: 'Воздух у точки посадки: {v} мкг/м³, {cat}. Чувствительны к воздуху? Ждите в помещении.',
      bad: 'Воздух у точки посадки: {v} мкг/м³, {cat}. Ждите в помещении, пока машина не подъедет.' },
    brk: 'Где почище для перерыва: возле «{name}», {v} мкг/м³, {d} км отсюда.', brk_here: 'Вокруг вас уже самый чистый воздух поблизости.',
    jam_title: 'Пробка: закройте окна', jam: { good: 'Сегодня воздух чистый: окна можно не закрывать.',
      moderate: 'Включите рециркуляцию. В пробке воздух в салоне на 40% грязнее, чем при свободном движении (AAI, стр. 5).',
      bad: 'Включите рециркуляцию. В пробке воздух в салоне на 40% грязнее, чем при свободном движении, а с открытыми окнами — в 7 раз грязнее, чем у пешеходов (AAI, стр. 5).' } },
  kk: { cats: { good: 'жақсы', moderate: 'орташа', sensitive: 'сезімтал топтарға зиянды', unhealthy: 'зиянды', very: 'өте зиянды' },
    pickup: { good: 'Отыру нүктесіндегі ауа: {v} мкг/м³, {cat}. Далада күтуге болады.', moderate: 'Отыру нүктесіндегі ауа: {v} мкг/м³, {cat}. Ауаға сезімталсыз ба? Ішке кіріп күтіңіз.',
      bad: 'Отыру нүктесіндегі ауа: {v} мкг/м³, {cat}. Көлік жақындағанша ғимарат ішінде күтіңіз.' },
    brk: 'Үзіліске тазарақ жер: «{name}» маңы, {v} мкг/м³, {d} км жерде.', brk_here: 'Айналаңыздағы ауа маңайдағы ең таза ауа.',
    jam_title: 'Кептеліс: терезені жабыңыз', jam: { good: 'Бүгін ауа таза: терезені жабудың қажеті жоқ.',
      moderate: 'Рециркуляцияны қосыңыз. Кептелісте салондағы ауа еркін қозғалыспен салыстырғанда 40%-ға лас (AAI, 5-бет).',
      bad: 'Рециркуляцияны қосыңыз. Кептелісте салондағы ауа еркін қозғалыспен салыстырғанда 40%-ға лас, ал терезе ашық болса, жаяу жүргіншілерге қарағанда 7 есе лас (AAI, 5-бет).' } },
};
const km = (a, b) => { // distance in km between two {lat, lng}
  const R = 6371, rad = x => x * Math.PI / 180, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
// Only points inside greater Almaty are used (anything else is ignored, not an error)
export const inAlmaty = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat > 43.0 && lat < 43.5 && lng > 76.6 && lng < 77.3;
const short = n => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 60);

// The air at the nearest sensor (pickup) and the cleanest sensor within 3 km (a driver's break)
export function nearbyAir(lang, point, stations) {
  const t = NEAR[LANGS.includes(lang) ? lang : 'en'];
  const list = (stations || []).filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng) && s.pm25 != null)
    .map(s => ({ ...s, d: km(point, s) })).sort((a, b) => a.d - b.d);
  const near = list[0];
  if (!near || near.d > 5) return null;
  const lvl = levelOf(near.pm25), cat = t.cats[near.category] || '';
  const pickup = { sensor: short(near.name), pm25: near.pm25, category: near.category, distance_km: +near.d.toFixed(1),
    wait_inside: near.pm25 > LIMIT, text: fill(t.pickup[lvl], { v: near.pm25, cat }) };
  const clean = list.filter(s => s.d <= 3).sort((a, b) => a.pm25 - b.pm25)[0];
  const better = clean && clean.id !== near.id && clean.pm25 < near.pm25 * 0.85; // only worth a drive if clearly cleaner
  const break_spot = better
    ? { sensor: short(clean.name), pm25: clean.pm25, category: clean.category, distance_km: +clean.d.toFixed(1), lat: clean.lat, lng: clean.lng,
      text: fill(t.brk, { name: short(clean.name), v: clean.pm25, d: clean.d.toFixed(1) }) }
    : { sensor: null, text: t.brk_here };
  return { pickup, break_spot };
}
export const jamReminder = (lang, pm25) => {
  const t = NEAR[LANGS.includes(lang) ? lang : 'en'], lvl = levelOf(pm25);
  return lvl ? { title: t.jam_title, body: t.jam[lvl] } : null;
};

const hh = h =>`${String(((h % 24) + 24) % 24).padStart(2, '0')}:00`;
const span = w => (w && Number.isFinite(w.from) && Number.isFinite(w.to) ? `${hh(w.from)}–${hh(w.to)}` : '—');
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ''));
export const levelOf = pm25 => (pm25 == null ? null : pm25 <= 15 ? 'good' : pm25 <= LIMIT ? 'moderate' : 'bad');

// One role's message: a push (title + short body), a banner (same body) and a few tips
export function roleMessage(lang, role, { pm25, best, worst }) {
  const t = T[LANGS.includes(lang) ? lang : 'en'], level = levelOf(pm25);
  if (!level || !ROLES.includes(role)) return null;
  const v = { v: pm25, best: span(best), worst: span(worst) };
  return {
    title: fill(t.title[level], v),
    body: fill(t[role].body[level], v),
    tips: t[role].tips[level].map(s => fill(s, v)),
  };
}

// The whole brief for a partner app: the numbers, both roles, whether a morning push is worth sending
export function partnerBrief({ air, plan, lang = 'en', role, point = null, stations = null, origin = '' } = {}) {
  lang = LANGS.includes(lang) ? lang : 'en';
  const pm25 = air?.city?.pm25 ?? null;
  if (pm25 == null) return { available: false, lang };
  const best = plan?.best || null, worst = plan?.worst || null;
  const roles = ROLES.includes(role) ? [role] : ROLES;
  const out = {
    available: true, lang, at: air.at || new Date().toISOString(),
    air: { pm25, category: air.city.category, level: levelOf(pm25), sensors: air.city.sensors ?? null,
      worst_district: air.districts?.[0] ? { district: air.districts[0].district, pm25: air.districts[0].pm25 } : null },
    best_time: best ? { hours: span(best), pm25: best.pm25 } : null,
    worst_time: worst ? { hours: span(worst), pm25: worst.pm25 } : null,
    // The rule the Telegram bot follows too: a morning push (7–10, Almaty time) only on days above the limit
    send_push: pm25 > LIMIT,
    push_window: '07:00–10:00 Asia/Almaty',
  };
  for (const r of roles) out[r] = roleMessage(lang, r, { pm25, best, worst });
  // Drivers: what to show when the app sees the car stuck in traffic (the app decides when)
  if (out.driver) out.driver.jam = jamReminder(lang, pm25);
  // With a point (the pickup, or where a driver waits): the nearest sensor and a cleaner spot for a break
  if (point && stations) {
    const n = nearbyAir(lang, point, stations);
    if (n) { if (out.rider) out.rider.pickup = n.pickup; if (out.driver) out.driver.break_spot = n.break_spot; }
  }
  // "Ask Taza" inside the app: the full copilot in a web view, in the same language
  out.ask_url = `${origin}/?lang=${lang}`;
  out.source ={ ...SOURCE[lang], live: 'https://air.org.kz/' };
  return out;
}
