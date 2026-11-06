// Taza Copilot on Telegram (long polling, no webhook needed).
// English by default; each user can switch to Russian or Kazakh inside the bot.
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getStations, getStationDetail, liveContext, pm25Category, airSummary, outdoorPlan } from './aai.mjs';
import { roleMessage, SOURCE } from './partner.mjs';

let apiBase = 'https://api.telegram.org';
const API = token => `${apiBase}/bot${token}`;
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EMOJI = { good: '🟢', moderate: '🟡', sensitive: '🟠', unhealthy: '🔴', very: '🟣', unknown: '⚪' };

// ---------- Texts ----------
const T = {
  en: {
    lang_name: 'English 🇬🇧',
    welcome: '🌿 <b>Taza Copilot</b>\n<i>Almaty\'s air, explained in seconds.</i>\n\nI read <b>{docs} AAI reports and articles</b> and <b>{sensors} live sensors</b>, and answer with the <b>exact quote</b> and a link to the page.\n\n✍️ Just type your question, in English, Russian or Kazakh, 🎙 send a voice note, or tap a button below.',
    b_air: '🌫 Air now', b_districts: '🗺 Districts', b_near: '📍 Air near me', b_examples: '💡 Example questions',
    b_lang: '🌐 Language', b_about: 'ℹ️ About', b_map: '🗺 Open the live map', b_menu: '🏠 Menu',
    choose_lang: '🌐 Choose your language:', lang_set: '✅ Language set to English.',
    step1: '🔎 Searching {n} AAI sources in 3 languages…', step2: '📖 Reading the most relevant pages…', step3: '✍️ Writing the answer with exact quotes…',
    sources: '📚 <b>Sources</b>', page: 'p. {p}', answer_to: 'answer to question {n}', live: 'live AAI sensors', footer: '⚡ {s} s · {k} sources · exact quotes',
    footer_cached: '⚡ instant · {k} sources · exact quotes', open_src: '📄 Source {n}',
    not_found: '🤷 AAI\'s research does not cover this yet.',
    examples: '💡 <b>Try one of these</b>, or type your own question:',
    ex: ['How many cigarettes did an Almaty resident "smoke" in 2025?', 'How polluted is the air near schools?', 'Which district had the dirtiest air in 2025?', 'What are the main sources of PM2.5 in Almaty?'],
    air_title: '🌫 <b>Almaty right now</b>', avg: 'City average', sensors: '{n} AAI sensors',
    vs_yesterday: '📈 <b>Today vs yesterday</b> (same hours): {cur} vs {prev} µg/m³ ({chg})',
    worst: '🏭 <b>Highest now</b>', best: '🌿 <b>Cleanest now</b>', who: 'WHO daily guideline: 15 µg/m³',
    updated: 'updated {t}', districts_title: '🗺 <b>Districts right now</b> (PM2.5, µg/m³)',
    near_ask: '📍 Share your location and I\'ll show the air at the nearest AAI sensor.', near_btn: '📍 Send my location',
    near_title: '📍 <b>Nearest sensor</b>: {name}\n<i>{km} km away · updated {t}</i>',
    change24: '{arrow} {chg} in 24 h', last24: '<b>Last 24 hours</b>', minavg: 'min {min} · avg {avg} · max {max}', advice: '💡 <b>Advice</b>',
    about: 'ℹ️ <b>Taza Copilot</b> (таза = "clean" in Kazakh)\n\nAn AI copilot for <b>Almaty Air Initiative</b>: it searches AAI\'s research and live sensor data and answers with the exact fragment and a link to the source, in seconds instead of hours.\n\nBuilt by team <b>Smog Hunters</b> for the inDrive Hackathon 2026, track AAI-03.\n\n🔒 Your questions are kept for 30 days without your name, only to measure accuracy, and are sent to the AI provider to write the answer. Your location is used once to find the nearest sensor and is never stored. Voice notes are turned into text by ElevenLabs and are not stored.',
    voice_listening: '🎙 Listening to your voice note…', voice_heard: '🎙 You said: <i>«{text}»</i>',
    voice_long: '⏱ Please keep voice notes under one minute.', voice_off: '🎙 Voice notes are not available right now. Please type your question.',
    voice_fail: '🤷 I couldn\'t make out that voice note. Please try again a bit closer to the microphone, or type your question.',
    too_many: '⏳ That\'s a lot of questions! Please wait a minute and try again.', daily: '⏳ You\'ve reached today\'s limit of questions. Please come back tomorrow.',
    error: '⚠️ Something went wrong. Please try again in a moment.', no_live: '⚠️ Live data is not available right now. Please try again shortly.',
    busy: '⏳ One moment, I am still answering your previous question.', unit: 'µg/m³',
    private_only: '👋 Message me directly to ask about Almaty\'s air.', short: '✍️ Please write a full question (at least a few words).',
    cats: { good: 'Good', moderate: 'Moderate', sensitive: 'Unhealthy for sensitive groups', unhealthy: 'Unhealthy', very: 'Very unhealthy', unknown: 'No data' },
    adv: {
      good: ['Great time to be outdoors', 'Open the windows and air the rooms'],
      moderate: ['Safe for healthy people, walks are possible', 'Sensitive people: keep long outdoor exercise short'],
      sensitive: ['Better to stay indoors', 'Use a mask outdoors', 'Children, elderly and people with asthma should limit time outside'],
      unhealthy: ['Avoid outdoor walks', 'Use a mask outdoors', 'Close windows'],
      very: ['Stay indoors', 'Use an air purifier if you have one', 'Use a mask (N95/FFP2) if you must go out', 'Close windows'],
    },
    b_alerts: '🔔 Alerts',
    myid: '🆔 This chat\'s ID: <code>{id}</code>\nGive it to the Taza admin to receive the weekly research-gaps report for the AAI team.',
    team_gaps: '🔬 <b>Research gaps this week</b>\n<i>What people asked that AAI\'s research does not cover yet</i>\n\n{list}\n\n<i>{total} unanswered questions in the last 30 days. Full list on the dashboard.</i>',
    alerts_title: '🔔 <b>Air alerts</b>\n\n<b>Morning alert</b>: a message between 7 and 10 a.m., only on days when Almaty\'s air is above Kazakhstan\'s daily limit (35 µg/m³). Never more than once a day.\n\n<b>Weekly summary</b>: every Monday morning, last week in numbers.\n\n🔒 Only this chat\'s ID and your choices are stored. Turn them off any time.',
    al_research_on: '✅ New AAI research: on', al_research_off: '🔕 New AAI research: off',
    research_new: '📚 <b>New research from AAI</b>\n<b>{title}</b>\n\n{points}\n\n<i>Ask me anything about it: I can now quote it, with the page.</i>',
    al_daily_on: '✅ Morning alert: on', al_daily_off: '🔕 Morning alert: off', al_weekly_on: '✅ Weekly summary: on', al_weekly_off: '🔕 Weekly summary: off',
    alert: '{emoji} <b>Air alert for Almaty</b> · {time}\n\nPM2.5 is <b>{v} µg/m³</b>: {cat}, {x} times the WHO daily guideline.\n\n🏭 <b>Most polluted districts now</b>\n{districts}\n\n💡 <b>Advice</b>\n{advice}',
    weekly: '📊 <b>Almaty air: weekly summary</b>\n<i>{from} – {to}</i>\n\nAverage PM2.5: <b>{avg} µg/m³</b> {trend}\n<code>{spark}</code>\n\n🔴 Days above Kazakhstan\'s limit (35): <b>{bad} of {n}</b>\n🥵 Worst day: {worst}\n🌿 Cleanest day: {best}\n\n🗺 <b>Most polluted districts now</b>\n{districts}',
    trend_up: '(📈 +{x}% vs the week before)', trend_down: '(📉 {x}% vs the week before)', trend_flat: '(➖ same as the week before)',
    commands: { start: 'Start and main menu', alerts: 'Air alerts and weekly summary', air: 'Air in Almaty right now', districts: 'Districts ranking', near: 'Air near me', examples: 'Example questions', language: 'Change language', about: 'About Taza Copilot' },
    desc: 'Ask Almaty Air Initiative\'s research anything. Answers in seconds with the exact quote and a link to the page, plus live air data from 150+ sensors. English, Russian and Kazakh.',
    short_desc: 'Almaty\'s air, explained in seconds, with sources.',
  },
  ru: {
    lang_name: 'Русский 🇷🇺',
    welcome: '🌿 <b>Taza Copilot</b>\n<i>Воздух Алматы — понятно и за секунды.</i>\n\nЯ читаю <b>{docs} отчётов и статей AAI</b> и <b>{sensors} датчиков</b> в реальном времени и отвечаю <b>точной цитатой</b> со ссылкой на страницу.\n\n✍️ Просто напишите вопрос — на русском, казахском или английском, 🎙 отправьте голосовое или нажмите кнопку ниже.',
    b_air: '🌫 Воздух сейчас', b_districts: '🗺 Районы', b_near: '📍 Воздух рядом', b_examples: '💡 Примеры вопросов',
    b_lang: '🌐 Язык', b_about: 'ℹ️ О проекте', b_map: '🗺 Открыть карту', b_menu: '🏠 Меню',
    choose_lang: '🌐 Выберите язык:', lang_set: '✅ Язык: русский.',
    step1: '🔎 Ищу в {n} источниках AAI на 3 языках…', step2: '📖 Читаю самые подходящие страницы…', step3: '✍️ Пишу ответ с точными цитатами…',
    sources: '📚 <b>Источники</b>', page: 'стр. {p}', answer_to: 'ответ на вопрос {n}', live: 'датчики AAI в реальном времени', footer: '⚡ {s} с · источников: {k} · точные цитаты',
    footer_cached: '⚡ мгновенно · источников: {k} · точные цитаты', open_src: '📄 Источник {n}',
    not_found: '🤷 Исследования AAI пока этого не охватывают.',
    examples: '💡 <b>Попробуйте один из вопросов</b> или напишите свой:',
    ex: ['Сколько сигарет «выкурил» житель Алматы в 2025 году?', 'Насколько загрязнён воздух возле школ?', 'В каком районе воздух был самым грязным в 2025 году?', 'Какие главные источники PM2.5 в Алматы?'],
    air_title: '🌫 <b>Алматы сейчас</b>', avg: 'В среднем по городу', sensors: '{n} датчиков AAI',
    vs_yesterday: '📈 <b>Сегодня и вчера</b> (те же часы): {cur} и {prev} мкг/м³ ({chg})',
    worst: '🏭 <b>Хуже всего сейчас</b>', best: '🌿 <b>Чище всего сейчас</b>', who: 'Суточная норма ВОЗ: 15 мкг/м³',
    updated: 'обновлено {t}', districts_title: '🗺 <b>Районы сейчас</b> (PM2.5, мкг/м³)',
    near_ask: '📍 Отправьте геолокацию — покажу воздух у ближайшего датчика AAI.', near_btn: '📍 Отправить геолокацию',
    near_title: '📍 <b>Ближайший датчик</b>: {name}\n<i>{km} км от вас · обновлено {t}</i>',
    change24: '{arrow} {chg} за 24 ч', last24: '<b>Последние 24 часа</b>', minavg: 'мин {min} · сред {avg} · макс {max}', advice: '💡 <b>Советы</b>',
    about: 'ℹ️ <b>Taza Copilot</b> (таза — «чистый» по-казахски)\n\nИИ-копилот для <b>Almaty Air Initiative</b>: ищет по исследованиям AAI и данным датчиков и отвечает точным фрагментом со ссылкой на источник — за секунды, а не часы.\n\nСоздано командой <b>Smog Hunters</b> для inDrive Hackathon 2026, трек AAI-03.\n\n🔒 Вопросы хранятся 30 дней без вашего имени, только для оценки точности, и передаются провайдеру ИИ для составления ответа. Геолокация используется один раз, чтобы найти ближайший датчик, и не сохраняется. Голосовые сообщения переводятся в текст через ElevenLabs и не сохраняются.',
    voice_listening: '🎙 Слушаю ваше голосовое…', voice_heard: '🎙 Вы сказали: <i>«{text}»</i>',
    voice_long: '⏱ Пожалуйста, голосовые не длиннее одной минуты.', voice_off: '🎙 Голосовые сейчас недоступны. Пожалуйста, напишите вопрос.',
    voice_fail: '🤷 Не удалось разобрать голосовое. Попробуйте ещё раз ближе к микрофону или напишите вопрос.',
    too_many: '⏳ Слишком много вопросов подряд. Подождите минуту и попробуйте снова.', daily: '⏳ На сегодня лимит вопросов исчерпан. Возвращайтесь завтра.',
    error: '⚠️ Что-то пошло не так. Попробуйте ещё раз чуть позже.', no_live: '⚠️ Живые данные сейчас недоступны. Попробуйте чуть позже.',
    busy: '⏳ Секунду, ещё отвечаю на предыдущий вопрос.', unit: 'мкг/м³',
    private_only: '👋 Напишите мне в личные сообщения, чтобы спросить о воздухе Алматы.', short: '✍️ Напишите, пожалуйста, полный вопрос.',
    cats: { good: 'Хорошо', moderate: 'Умеренно', sensitive: 'Вредно для чувствительных групп', unhealthy: 'Вредно', very: 'Очень вредно', unknown: 'Нет данных' },
    adv: {
      good: ['Отличное время для прогулок', 'Откройте окна и проветрите комнаты'],
      moderate: ['Безопасно для здоровых людей, прогулки возможны', 'Чувствительным людям лучше сократить долгие нагрузки на улице'],
      sensitive: ['Лучше оставаться в помещении', 'Используйте маску на улице', 'Детям, пожилым и людям с астмой стоит меньше бывать на улице'],
      unhealthy: ['Избегайте прогулок', 'Используйте маску на улице', 'Закройте окна'],
      very: ['Оставайтесь дома', 'Включите очиститель воздуха, если он есть', 'Если нужно выйти, наденьте маску (N95/FFP2)', 'Закройте окна'],
    },
    b_alerts: '🔔 Оповещения',
    myid: '🆔 ID этого чата: <code>{id}</code>\nПередайте его администратору Taza, чтобы получать еженедельный отчёт о пробелах в исследованиях для команды AAI.',
    team_gaps: '🔬 <b>Пробелы в исследованиях за неделю</b>\n<i>О чём спрашивали, но исследования AAI пока не отвечают</i>\n\n{list}\n\n<i>Вопросов без ответа за 30 дней: {total}. Полный список — на панели.</i>',
    alerts_title: '🔔 <b>Оповещения о воздухе</b>\n\n<b>Утреннее оповещение</b>: сообщение с 7 до 10 утра, только в дни, когда воздух в Алматы выше ПДК РК (35 мкг/м³). Не чаще раза в день.\n\n<b>Итоги недели</b>: каждый понедельник утром — прошлая неделя в цифрах.\n\n🔒 Хранится только ID этого чата и ваш выбор. Отключить можно в любой момент.',
    al_research_on: '✅ Новые исследования AAI: вкл', al_research_off: '🔕 Новые исследования AAI: выкл',
    research_new: '📚 <b>Новое исследование AAI</b>\n<b>{title}</b>\n\n{points}\n\n<i>Спрашивайте о нём что угодно: теперь я цитирую его со страницей.</i>',
    al_daily_on: '✅ Утреннее оповещение: вкл', al_daily_off: '🔕 Утреннее оповещение: выкл', al_weekly_on: '✅ Итоги недели: вкл', al_weekly_off: '🔕 Итоги недели: выкл',
    alert: '{emoji} <b>Оповещение о воздухе в Алматы</b> · {time}\n\nPM2.5 сейчас <b>{v} мкг/м³</b>: {cat}, в {x} раза выше суточной рекомендации ВОЗ.\n\n🏭 <b>Самые загрязнённые районы сейчас</b>\n{districts}\n\n💡 <b>Советы</b>\n{advice}',
    weekly: '📊 <b>Воздух Алматы: итоги недели</b>\n<i>{from} – {to}</i>\n\nСредний PM2.5: <b>{avg} мкг/м³</b> {trend}\n<code>{spark}</code>\n\n🔴 Дней выше ПДК РК (35): <b>{bad} из {n}</b>\n🥵 Худший день: {worst}\n🌿 Самый чистый день: {best}\n\n🗺 <b>Самые загрязнённые районы сейчас</b>\n{districts}',
    trend_up: '(📈 +{x}% к прошлой неделе)', trend_down: '(📉 {x}% к прошлой неделе)', trend_flat: '(➖ как на прошлой неделе)',
    commands: { start: 'Старт и главное меню', alerts: 'Оповещения и итоги недели', air: 'Воздух в Алматы сейчас', districts: 'Рейтинг районов', near: 'Воздух рядом со мной', examples: 'Примеры вопросов', language: 'Сменить язык', about: 'О Taza Copilot' },
    desc: 'Спросите исследования Almaty Air Initiative о чём угодно. Ответ за секунды с точной цитатой и ссылкой на страницу, а также живые данные с 150+ датчиков. Русский, казахский и английский.',
    short_desc: 'Воздух Алматы — за секунды и с источниками.',
  },
  kk: {
    lang_name: 'Қазақша 🇰🇿',
    welcome: '🌿 <b>Taza Copilot</b>\n<i>Алматы ауасы — бірнеше секундта, түсінікті.</i>\n\nМен <b>AAI-дің {docs} есебі мен мақаласын</b> және <b>{sensors} датчикті</b> нақты уақытта оқып, бетке сілтемесі бар <b>нақты дәйексөзбен</b> жауап беремін.\n\n✍️ Сұрағыңызды қазақша, орысша немесе ағылшынша жазыңыз, 🎙 дауыстық хабар жіберіңіз не төмендегі батырманы басыңыз.',
    b_air: '🌫 Қазіргі ауа', b_districts: '🗺 Аудандар', b_near: '📍 Жанымдағы ауа', b_examples: '💡 Сұрақ мысалдары',
    b_lang: '🌐 Тіл', b_about: 'ℹ️ Жоба туралы', b_map: '🗺 Картаны ашу', b_menu: '🏠 Мәзір',
    choose_lang: '🌐 Тілді таңдаңыз:', lang_set: '✅ Тіл: қазақша.',
    step1: '🔎 AAI-дің {n} дереккөзінен 3 тілде іздеп жатырмын…', step2: '📖 Ең қажетті беттерді оқып жатырмын…', step3: '✍️ Нақты дәйексөздермен жауап жазып жатырмын…',
    sources: '📚 <b>Дереккөздер</b>', page: '{p}-бет', answer_to: '{n}-сұраққа жауап', live: 'AAI датчиктері, нақты уақыт', footer: '⚡ {s} с · дереккөз: {k} · нақты дәйексөздер',
    footer_cached: '⚡ лезде · дереккөз: {k} · нақты дәйексөздер', open_src: '📄 Дереккөз {n}',
    not_found: '🤷 AAI зерттеулері бұл сұрақты әлі қамтымайды.',
    examples: '💡 <b>Мына сұрақтардың бірін көріңіз</b> немесе өзіңіз жазыңыз:',
    ex: ['2025 жылы Алматы тұрғыны қанша темекі «шекті»?', 'Мектептер жанындағы ауа қаншалықты ластанған?', '2025 жылы қай ауданда ауа ең лас болды?', 'Алматыдағы PM2.5-тің негізгі көздері қандай?'],
    air_title: '🌫 <b>Алматы қазір</b>', avg: 'Қала бойынша орташа', sensors: 'AAI-дің {n} датчигі',
    vs_yesterday: '📈 <b>Бүгін мен кеше</b> (сол сағаттар): {cur} және {prev} мкг/м³ ({chg})',
    worst: '🏭 <b>Қазір ең лас</b>', best: '🌿 <b>Қазір ең таза</b>', who: 'ДДСҰ тәуліктік нормасы: 15 мкг/м³',
    updated: '{t} жаңартылды', districts_title: '🗺 <b>Аудандар қазір</b> (PM2.5, мкг/м³)',
    near_ask: '📍 Геолокацияңызды жіберіңіз — ең жақын AAI датчигіндегі ауаны көрсетемін.', near_btn: '📍 Геолокацияны жіберу',
    near_title: '📍 <b>Ең жақын датчик</b>: {name}\n<i>{km} км қашықтықта · {t} жаңартылды</i>',
    change24: '{arrow} 24 сағатта {chg}', last24: '<b>Соңғы 24 сағат</b>', minavg: 'ең аз {min} · орташа {avg} · ең көп {max}', advice: '💡 <b>Кеңестер</b>',
    about: 'ℹ️ <b>Taza Copilot</b> (таза — қазақша «таза»)\n\n<b>Almaty Air Initiative</b> үшін ЖИ-копилот: AAI зерттеулері мен датчик деректерінен іздеп, дереккөзге сілтемесі бар нақты үзіндімен жауап береді — сағаттар емес, секундтар ішінде.\n\n<b>Smog Hunters</b> командасы inDrive Hackathon 2026 үшін жасаған, AAI-03 трегі.\n\n🔒 Сұрақтарыңыз 30 күн бойы атыңызсыз, тек дәлдікті өлшеу үшін сақталады және жауап жазу үшін ЖИ провайдеріне жіберіледі. Геолокация ең жақын датчикті табу үшін бір рет қолданылады және сақталмайды. Дауыстық хабарлар ElevenLabs арқылы мәтінге айналады және сақталмайды.',
    voice_listening: '🎙 Дауыстық хабарыңызды тыңдап жатырмын…', voice_heard: '🎙 Сіз айттыңыз: <i>«{text}»</i>',
    voice_long: '⏱ Дауыстық хабар бір минуттан аспасын.', voice_off: '🎙 Дауыстық хабарлар қазір қолжетімсіз. Сұрағыңызды жазыңыз.',
    voice_fail: '🤷 Дауыстық хабарды түсіне алмадым. Микрофонға жақынырақ қайталап көріңіз немесе сұрағыңызды жазыңыз.',
    too_many: '⏳ Сұрақтар тым көп. Бір минут күтіп, қайта көріңіз.', daily: '⏳ Бүгінгі сұрақ лимиті таусылды. Ертең қайта келіңіз.',
    error: '⚠️ Бірдеңе дұрыс болмады. Сәлден кейін қайта көріңіз.', no_live: '⚠️ Нақты уақыттағы деректер қазір қолжетімсіз. Сәлден кейін көріңіз.',
    busy: '⏳ Бір сәт, алдыңғы сұраққа әлі жауап беріп жатырмын.', unit: 'мкг/м³',
    private_only: '👋 Алматы ауасы туралы сұрау үшін маған жеке жазыңыз.', short: '✍️ Толық сұрақ жазыңыз.',
    cats: { good: 'Жақсы', moderate: 'Орташа', sensitive: 'Сезімтал топтар үшін зиянды', unhealthy: 'Зиянды', very: 'Өте зиянды', unknown: 'Дерек жоқ' },
    adv: {
      good: ['Далада болуға тамаша уақыт', 'Терезені ашып, бөлмені желдетіңіз'],
      moderate: ['Сау адамдар үшін қауіпсіз, серуендеуге болады', 'Сезімтал адамдар далада ұзақ жаттығуды қысқартқаны жөн'],
      sensitive: ['Үйде болған дұрыс', 'Далада маска киіңіз', 'Балалар, қарттар және демікпесі бар адамдар далада аз болғаны жөн'],
      unhealthy: ['Серуендеуден бас тартыңыз', 'Далада маска киіңіз', 'Терезелерді жабыңыз'],
      very: ['Үйде болыңыз', 'Ауа тазартқыш болса, қосыңыз', 'Сыртқа шықсаңыз, маска (N95/FFP2) киіңіз', 'Терезелерді жабыңыз'],
    },
    b_alerts: '🔔 Хабарламалар',
    myid: '🆔 Осы чаттың ID-і: <code>{id}</code>\nAAI командасына арналған апталық зерттеу олқылықтары есебін алу үшін оны Taza әкімшісіне беріңіз.',
    team_gaps: '🔬 <b>Апта бойынша зерттеу олқылықтары</b>\n<i>Адамдар сұраған, бірақ AAI зерттеулері әлі жауап бермейтін тақырыптар</i>\n\n{list}\n\n<i>30 күндегі жауапсыз сұрақтар: {total}. Толық тізім — панельде.</i>',
    alerts_title: '🔔 <b>Ауа туралы хабарламалар</b>\n\n<b>Таңғы хабарлама</b>: таңғы 7-ден 10-ға дейін, тек Алматыдағы ауа ҚР ШРК-дан (35 мкг/м³) жоғары болған күндері. Күніне бір реттен артық емес.\n\n<b>Апта қорытындысы</b>: әр дүйсенбі таңертең — өткен апта сандармен.\n\n🔒 Тек осы чаттың ID-і мен таңдауыңыз сақталады. Кез келген уақытта өшіруге болады.',
    al_research_on: '✅ AAI-дің жаңа зерттеулері: қосулы', al_research_off: '🔕 AAI-дің жаңа зерттеулері: өшірулі',
    research_new: '📚 <b>AAI-дің жаңа зерттеуі</b>\n<b>{title}</b>\n\n{points}\n\n<i>Ол туралы кез келген нәрсені сұраңыз: енді оны бетімен дәйексөз келтіремін.</i>',
    al_daily_on: '✅ Таңғы хабарлама: қосулы', al_daily_off: '🔕 Таңғы хабарлама: өшірулі', al_weekly_on: '✅ Апта қорытындысы: қосулы', al_weekly_off: '🔕 Апта қорытындысы: өшірулі',
    alert: '{emoji} <b>Алматы ауасы туралы хабарлама</b> · {time}\n\nPM2.5 қазір <b>{v} мкг/м³</b>: {cat}, ДДҰ тәуліктік ұсынымынан {x} есе жоғары.\n\n🏭 <b>Қазір ең ластанған аудандар</b>\n{districts}\n\n💡 <b>Кеңестер</b>\n{advice}',
    weekly: '📊 <b>Алматы ауасы: апта қорытындысы</b>\n<i>{from} – {to}</i>\n\nОрташа PM2.5: <b>{avg} мкг/м³</b> {trend}\n<code>{spark}</code>\n\n🔴 ҚР ШРК-дан (35) жоғары күндер: <b>{n} күннің {bad}</b>\n🥵 Ең нашар күн: {worst}\n🌿 Ең таза күн: {best}\n\n🗺 <b>Қазір ең ластанған аудандар</b>\n{districts}',
    trend_up: '(📈 өткен аптамен салыстырғанда +{x}%)', trend_down: '(📉 өткен аптамен салыстырғанда {x}%)', trend_flat: '(➖ өткен аптадағыдай)',
    commands: { start: 'Бастау және басты мәзір', alerts: 'Хабарламалар және апта қорытындысы', air: 'Алматыдағы қазіргі ауа', districts: 'Аудандар рейтингі', near: 'Жанымдағы ауа', examples: 'Сұрақ мысалдары', language: 'Тілді ауыстыру', about: 'Taza Copilot туралы' },
    desc: 'Almaty Air Initiative зерттеулерінен кез келген нәрсені сұраңыз. Бірнеше секундта нақты дәйексөз бен бетке сілтеме, сондай-ақ 150+ датчиктің нақты уақыттағы деректері. Қазақша, орысша және ағылшынша.',
    short_desc: 'Алматы ауасы — секундта және дереккөзімен.',
  },
};

// Texts for fact-checking forwarded posts, My places, the best time to go out, inline mode and parent groups
const T2 = {
  en: {
    b_check: '🔎 Check a claim', b_places: '⭐ My places', b_best: '🕐 Best time today',
    check_intro: '🔎 <b>Check a claim</b>\n\nForward me any post or message about Almaty\'s air (from a channel, a group or a friend), or type <code>/check</code> and the claim. I compare it with AAI\'s research and reply with a verdict and the exact quotes.\n\n🔒 Only the text is checked. Who wrote or forwarded it is never stored.',
    checking: '🔎 Checking this against AAI\'s research…', check_none: '🔎 I can only check text. Forward a message that has text, or type /check and the claim.',
    check_cut: '<i>I checked the first part of the message (up to 500 characters).</i>',
    verdicts: { SUPPORTED: '✅ <b>Supported by AAI\'s research</b>', CONTRADICTED: '❌ <b>Contradicted by AAI\'s research</b>', PARTLY: '⚠️ <b>Partly right</b>', 'NOT COVERED': '🤷 <b>AAI\'s research does not cover this</b>' },
    places_title: '⭐ <b>My places</b>\n\nSave up to 3 places: home, your child\'s school, work. When the air at a place goes above Kazakhstan\'s daily limit (35 µg/m³) I send you a message, at most once a day per place, between 7:00 and 21:00.\n\n🔒 Only the sensor\'s number and its public name are stored, never your location.',
    places_empty: '<i>No places yet.</i>', pl_add_loc: '📍 Add by location', pl_add_school: '🏫 Add a school', pl_remove: '🗑 {name}',
    pl_saved: '⭐ Saved: <b>{name}</b>. I\'ll message you when the air there goes above 35 µg/m³.', pl_full: '⭐ You already have 3 places. Remove one first.',
    pl_exists: '⭐ This place is already saved.', pl_removed: '🗑 Removed.', pl_save_btn: '⭐ Save as my place',
    pl_school_ask: '🏫 Type the school or kindergarten number (for example <code>112</code>) or part of its name.',
    pl_school_none: '🤷 No school or kindergarten sensor matches «{q}». Try just the number.', pl_school_pick: '🏫 Pick one:',
    pl_alert: '{emoji} <b>Air at your place: {name}</b>\n\nPM2.5 is <b>{v} µg/m³</b> now: {cat}.\n\n💡 <b>Advice</b>\n{advice}',
    best_text: '🕐 <b>Best time to go out {day}</b>\n\n✅ <b>{bf}–{bt}</b> · ≈ {bv} µg/m³ · {bc}\n⛔ Avoid <b>{wf}–{wt}</b> · ≈ {wv} µg/m³ · {wc}\n\n<i>An estimate from AAI\'s sensors: today\'s readings and the same hours over the last 14 days. Not a weather forecast.</i>',
    day_today: 'today', day_tomorrow: 'tomorrow',
    in_air: 'Air in Almaty now', in_best: 'Best time to go out today', in_ask: 'Answer with sources', in_hint: 'Type a question about Almaty\'s air…',
    in_open: 'Ask Taza Copilot', in_slow: 'Still working on it: open the bot for the full answer', in_via: 'Taza Copilot · AAI research',
    grp_hello: '👋 Hi! I\'m <b>Taza Copilot</b>. I can post a short air card for your school every school morning (Mon–Fri, about 7:30).\n\nAn admin types <code>/school 112</code> (the school or kindergarten number). <code>/school off</code> stops it. <code>/air</code> shows the air now, <code>/best</code> the best time to go out.',
    grp_admin_only: '🔒 Only the group\'s admins can choose the school.',
    grp_set: '🏫 Done! Every school morning (Mon–Fri) at about 7:30 I\'ll post the air at <b>{name}</b>.', grp_off: '🔕 The daily school card is off.',
    grp_card: '🏫 <b>Good morning! Air at {name}</b> · {time}\n\n{emoji} <b>{v} µg/m³</b> · {cat}\n\n{best}💡 {advice}',
    grp_best: '🕐 Best time to go out today: <b>{bf}–{bt}</b> (≈ {bv}), avoid <b>{wf}–{wt}</b> (≈ {wv}).\n\n',
    cmd_more: { check: 'Check a claim or a forwarded post', places: 'My places and their alerts', best: 'Best time to go out today' },
    grp_commands: { school: 'Daily air card for your school', air: 'Air in Almaty right now', best: 'Best time to go out today', help: 'How I work in groups' },
  },
  ru: {
    b_check: '🔎 Проверить факт', b_places: '⭐ Мои места', b_best: '🕐 Когда выйти',
    check_intro: '🔎 <b>Проверить утверждение</b>\n\nПерешлите мне любой пост или сообщение о воздухе Алматы (из канала, группы или от друга) или напишите <code>/check</code> и утверждение. Я сравню его с исследованиями AAI и отвечу вердиктом с точными цитатами.\n\n🔒 Проверяется только текст. Кто его написал или переслал, не сохраняется.',
    checking: '🔎 Сверяю с исследованиями AAI…', check_none: '🔎 Я проверяю только текст. Перешлите сообщение с текстом или напишите /check и утверждение.',
    check_cut: '<i>Я проверил первую часть сообщения (до 500 символов).</i>',
    verdicts: { SUPPORTED: '✅ <b>Подтверждается исследованиями AAI</b>', CONTRADICTED: '❌ <b>Опровергается исследованиями AAI</b>', PARTLY: '⚠️ <b>Верно частично</b>', 'NOT COVERED': '🤷 <b>Исследования AAI этого не охватывают</b>' },
    places_title: '⭐ <b>Мои места</b>\n\nСохраните до 3 мест: дом, школу ребёнка, работу. Когда воздух там превысит суточную норму Казахстана (35 мкг/м³), я напишу вам — не чаще раза в день для каждого места, с 7:00 до 21:00.\n\n🔒 Хранится только номер датчика и его публичное название, а не ваша геолокация.',
    places_empty: '<i>Пока нет мест.</i>', pl_add_loc: '📍 Добавить по геолокации', pl_add_school: '🏫 Добавить школу', pl_remove: '🗑 {name}',
    pl_saved: '⭐ Сохранено: <b>{name}</b>. Напишу, когда воздух там превысит 35 мкг/м³.', pl_full: '⭐ У вас уже 3 места. Сначала удалите одно.',
    pl_exists: '⭐ Это место уже сохранено.', pl_removed: '🗑 Удалено.', pl_save_btn: '⭐ Сохранить как моё место',
    pl_school_ask: '🏫 Напишите номер школы или детсада (например, <code>112</code>) или часть названия.',
    pl_school_none: '🤷 Нет датчика у школы или детсада по запросу «{q}». Попробуйте только номер.', pl_school_pick: '🏫 Выберите:',
    pl_alert: '{emoji} <b>Воздух у вашего места: {name}</b>\n\nPM2.5 сейчас <b>{v} мкг/м³</b>: {cat}.\n\n💡 <b>Советы</b>\n{advice}',
    best_text: '🕐 <b>Когда лучше выйти {day}</b>\n\n✅ <b>{bf}–{bt}</b> · ≈ {bv} мкг/м³ · {bc}\n⛔ Избегайте <b>{wf}–{wt}</b> · ≈ {wv} мкг/м³ · {wc}\n\n<i>Оценка по датчикам AAI: сегодняшние данные и те же часы за последние 14 дней. Это не прогноз погоды.</i>',
    day_today: 'сегодня', day_tomorrow: 'завтра',
    in_air: 'Воздух в Алматы сейчас', in_best: 'Когда лучше выйти сегодня', in_ask: 'Ответ с источниками', in_hint: 'Напишите вопрос о воздухе Алматы…',
    in_open: 'Спросить Taza Copilot', in_slow: 'Ещё думаю: откройте бота, чтобы увидеть полный ответ', in_via: 'Taza Copilot · исследования AAI',
    grp_hello: '👋 Привет! Я <b>Taza Copilot</b>. Могу каждое учебное утро (пн–пт, около 7:30) присылать короткую карточку воздуха у вашей школы.\n\nАдминистратор пишет <code>/school 112</code> (номер школы или детсада). <code>/school off</code> отключает. <code>/air</code> — воздух сейчас, <code>/best</code> — когда лучше выйти.',
    grp_admin_only: '🔒 Выбрать школу могут только администраторы группы.',
    grp_set: '🏫 Готово! Каждое учебное утро (пн–пт) около 7:30 я буду присылать воздух у <b>{name}</b>.', grp_off: '🔕 Ежедневная карточка школы отключена.',
    grp_card: '🏫 <b>Доброе утро! Воздух у {name}</b> · {time}\n\n{emoji} <b>{v} мкг/м³</b> · {cat}\n\n{best}💡 {advice}',
    grp_best: '🕐 Когда лучше выйти сегодня: <b>{bf}–{bt}</b> (≈ {bv}), избегайте <b>{wf}–{wt}</b> (≈ {wv}).\n\n',
    cmd_more: { check: 'Проверить утверждение или пост', places: 'Мои места и оповещения', best: 'Когда лучше выйти сегодня' },
    grp_commands: { school: 'Ежедневная карточка воздуха у школы', air: 'Воздух в Алматы сейчас', best: 'Когда лучше выйти сегодня', help: 'Как я работаю в группах' },
  },
  kk: {
    b_check: '🔎 Мәлімдемені тексеру', b_places: '⭐ Менің орындарым', b_best: '🕐 Қашан шығу керек',
    check_intro: '🔎 <b>Мәлімдемені тексеру</b>\n\nАлматы ауасы туралы кез келген жазбаны не хабарды (арнадан, топтан немесе досыңыздан) маған жіберіңіз немесе <code>/check</code> деп мәлімдемені жазыңыз. Мен оны AAI зерттеулерімен салыстырып, нақты дәйексөздермен қорытынды беремін.\n\n🔒 Тек мәтін тексеріледі. Оны кім жазғаны не жібергені сақталмайды.',
    checking: '🔎 AAI зерттеулерімен салыстырып жатырмын…', check_none: '🔎 Мен тек мәтінді тексеремін. Мәтіні бар хабарды жіберіңіз немесе /check деп мәлімдемені жазыңыз.',
    check_cut: '<i>Хабардың алғашқы бөлігін тексердім (500 таңбаға дейін).</i>',
    verdicts: { SUPPORTED: '✅ <b>AAI зерттеулері растайды</b>', CONTRADICTED: '❌ <b>AAI зерттеулері жоққа шығарады</b>', PARTLY: '⚠️ <b>Ішінара дұрыс</b>', 'NOT COVERED': '🤷 <b>AAI зерттеулері мұны қамтымайды</b>' },
    places_title: '⭐ <b>Менің орындарым</b>\n\n3 орынға дейін сақтаңыз: үй, баланың мектебі, жұмыс. Сол жердегі ауа Қазақстанның тәуліктік нормасынан (35 мкг/м³) асқанда сізге жазамын — әр орын үшін күніне бір реттен артық емес, 7:00-ден 21:00-ге дейін.\n\n🔒 Тек датчиктің нөмірі мен оның жария атауы сақталады, геолокацияңыз сақталмайды.',
    places_empty: '<i>Әзірге орын жоқ.</i>', pl_add_loc: '📍 Геолокация арқылы қосу', pl_add_school: '🏫 Мектеп қосу', pl_remove: '🗑 {name}',
    pl_saved: '⭐ Сақталды: <b>{name}</b>. Ондағы ауа 35 мкг/м³-ден асқанда жазамын.', pl_full: '⭐ Сізде 3 орын бар. Алдымен біреуін өшіріңіз.',
    pl_exists: '⭐ Бұл орын бұрыннан сақталған.', pl_removed: '🗑 Өшірілді.', pl_save_btn: '⭐ Менің орным ретінде сақтау',
    pl_school_ask: '🏫 Мектептің не балабақшаның нөмірін (мысалы, <code>112</code>) немесе атауының бөлігін жазыңыз.',
    pl_school_none: '🤷 «{q}» бойынша мектеп не балабақша датчигі табылмады. Тек нөмірін жазып көріңіз.', pl_school_pick: '🏫 Таңдаңыз:',
    pl_alert: '{emoji} <b>Сіздің орныңыздағы ауа: {name}</b>\n\nPM2.5 қазір <b>{v} мкг/м³</b>: {cat}.\n\n💡 <b>Кеңестер</b>\n{advice}',
    best_text: '🕐 <b>{day} қай кезде шыққан жөн</b>\n\n✅ <b>{bf}–{bt}</b> · ≈ {bv} мкг/м³ · {bc}\n⛔ Абай болыңыз: <b>{wf}–{wt}</b> · ≈ {wv} мкг/м³ · {wc}\n\n<i>AAI датчиктері бойынша бағалау: бүгінгі деректер және соңғы 14 күндегі сол сағаттар. Ауа райы болжамы емес.</i>',
    day_today: 'Бүгін', day_tomorrow: 'Ертең',
    in_air: 'Алматыдағы қазіргі ауа', in_best: 'Бүгін қай кезде шыққан жөн', in_ask: 'Дереккөзі бар жауап', in_hint: 'Алматы ауасы туралы сұрақ жазыңыз…',
    in_open: 'Taza Copilot-тан сұрау', in_slow: 'Әлі ойланып жатырмын: толық жауап үшін ботты ашыңыз', in_via: 'Taza Copilot · AAI зерттеулері',
    grp_hello: '👋 Сәлем! Мен <b>Taza Copilot</b>. Әр оқу күні таңертең (дс–жм, шамамен 7:30) мектебіңіздегі ауа туралы қысқа карточка жібере аламын.\n\nӘкімші <code>/school 112</code> деп жазады (мектеп не балабақша нөмірі). <code>/school off</code> өшіреді. <code>/air</code> — қазіргі ауа, <code>/best</code> — қашан шыққан жөн.',
    grp_admin_only: '🔒 Мектепті тек топ әкімшілері таңдай алады.',
    grp_set: '🏫 Дайын! Әр оқу күні таңертең (дс–жм) шамамен 7:30-да <b>{name}</b> жанындағы ауаны жіберемін.', grp_off: '🔕 Мектептің күнделікті карточкасы өшірілді.',
    grp_card: '🏫 <b>Қайырлы таң! {name} жанындағы ауа</b> · {time}\n\n{emoji} <b>{v} мкг/м³</b> · {cat}\n\n{best}💡 {advice}',
    grp_best: '🕐 Бүгін шыққан жөн: <b>{bf}–{bt}</b> (≈ {bv}), абай болыңыз: <b>{wf}–{wt}</b> (≈ {wv}).\n\n',
    cmd_more: { check: 'Мәлімдемені не жазбаны тексеру', places: 'Менің орындарым және хабарламалар', best: 'Бүгін қай кезде шыққан жөн' },
    grp_commands: { school: 'Мектептегі ауаның күнделікті карточкасы', air: 'Алматыдағы қазіргі ауа', best: 'Бүгін қай кезде шыққан жөн', help: 'Топтарда қалай жұмыс істеймін' },
  },
};
for (const [l, extra] of Object.entries(T2)) { Object.assign(T[l], extra); Object.assign(T[l].commands, extra.cmd_more); }
// Taza for inDrive: drivers and riders get their own tips in the morning alert (only the choice is stored)
const T3 = {
  en: { al_role: '\n\n🚗 <b>Drive or ride with inDrive?</b> Pick one and the morning alert adds tips for you.',
    al_driver_on: '✅ 🚗 I\'m a driver', al_driver_off: '🚗 I\'m a driver', al_rider_on: '✅ 🧍 I\'m a rider', al_rider_off: '🧍 I\'m a rider',
    role_head: { driver: '🚗 <b>For drivers</b>', rider: '🧍 <b>For riders</b>' }, role_src: '📄 <a href="{url}">AAI, page {page}</a>' },
  ru: { al_role: '\n\n🚗 <b>Водите или ездите с inDrive?</b> Выберите — и в утреннем оповещении будут советы для вас.',
    al_driver_on: '✅ 🚗 Я водитель', al_driver_off: '🚗 Я водитель', al_rider_on: '✅ 🧍 Я пассажир', al_rider_off: '🧍 Я пассажир',
    role_head: { driver: '🚗 <b>Водителям</b>', rider: '🧍 <b>Пассажирам</b>' }, role_src: '📄 <a href="{url}">AAI, стр. {page}</a>' },
  kk: { al_role: '\n\n🚗 <b>inDrive-та жүргізесіз бе, әлде жолаушысыз ба?</b> Таңдаңыз — таңғы хабарламада сізге арналған кеңестер болады.',
    al_driver_on: '✅ 🚗 Мен жүргізушімін', al_driver_off: '🚗 Мен жүргізушімін', al_rider_on: '✅ 🧍 Мен жолаушымын', al_rider_off: '🧍 Мен жолаушымын',
    role_head: { driver: '🚗 <b>Жүргізушілерге</b>', rider: '🧍 <b>Жолаушыларға</b>' }, role_src: '📄 <a href="{url}">AAI, {page}-бет</a>' },
};
for (const [l, extra] of Object.entries(T3)) Object.assign(T[l], extra);

const fill = (s, v = {}) => String(s).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const SPARK = '▁▂▃▄▅▆▇█';
const sparkline = vs => { const lo = Math.min(...vs), hi = Math.max(...vs); return vs.map(v => SPARK[Math.round((v - lo) / ((hi - lo) || 1) * 7)]).join(''); };
const bar = (v, max, width = 10) => '█'.repeat(Math.max(1, Math.round(v / max * width))) + '░'.repeat(Math.max(0, width - Math.max(1, Math.round(v / max * width))));
const almatyTime = iso => iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Almaty' }) : '';
const km = (a, b) => { const R = 6371, d2r = Math.PI / 180, dLat = (b.lat - a.lat) * d2r, dLng = (b.lng - a.lng) * d2r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * d2r) * Math.cos(b.lat * d2r) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };

export function startTelegram({ token, askQuestion, sourceCount, publicUrl, dataDir, testApiBase, onReady, airFn = airSummary, transcribe = null, gapsFn = null, teamChats = [],
  outdoorFn = outdoorPlan, stationsFn = getStations }) {
  if (!token) return;
  if (testApiBase) apiBase = testApiBase; // only used by scripts/test-telegram.mjs with a local mock
  const usersFile = `${dataDir}/tg-users.json`;
  // Only the chosen language is kept per chat (no names, no messages)
  const isLang = l => typeof l === 'string' && Object.hasOwn(T, l);
  let stored = {};
  try { if (existsSync(usersFile)) stored = JSON.parse(readFileSync(usersFile, 'utf8')) || {}; } catch { console.warn('tg-users.json was unreadable; starting fresh'); }
  const langs = new Map(Object.entries(stored).filter(([, l]) => isLang(l)));
  const saveLangs = () => {
    try { writeFileSync(usersFile + '.tmp', JSON.stringify(Object.fromEntries(langs))); renameSync(usersFile + '.tmp', usersFile); } catch {}
  };
  const L = chatId => (isLang(langs.get(String(chatId))) ? langs.get(String(chatId)) : 'en');
  const tr = chatId => T[L(chatId)];

  async function call(method, body) {
    const res = await fetch(`${API(token)}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(method === 'getUpdates' ? 40_000 : 15_000) });
    const j = await res.json().catch(() => ({}));
    if (!j.ok) {
      if (/message is not modified/i.test(j.description || '')) return j;
      const err = new Error(`${method}: ${j.description || res.status}`);
      err.retryAfter = j.parameters?.retry_after;
      throw err;
    }
    return j;
  }
  const send = (chat_id, text, extra = {}) => call('sendMessage', { chat_id, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });
  const edit = (chat_id, message_id, text, extra = {}) => call('editMessageText', { chat_id, message_id, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });

  const menuKeyboard = t => ({ inline_keyboard: [
    [{ text: t.b_air, callback_data: 'air' }, { text: t.b_districts, callback_data: 'districts' }],
    [{ text: t.b_near, callback_data: 'near' }, { text: t.b_best, callback_data: 'best' }],
    [{ text: t.b_check, callback_data: 'check' }, { text: t.b_places, callback_data: 'places' }],
    [{ text: t.b_examples, callback_data: 'examples' }, { text: t.b_alerts, callback_data: 'alerts' }],
    [{ text: t.b_lang, callback_data: 'lang' }, { text: t.b_about, callback_data: 'about' }],
    ...(publicUrl ? [[{ text: t.b_map, url: publicUrl }]] : []),
  ] });
  // "Выберите язык / Тілді таңдаңыз / Choose your language", one per line
  const CHOOSE_LANG_ALL = [T.ru.choose_lang, T.kk.choose_lang, T.en.choose_lang].join('\n');
  const langKeyboard = { inline_keyboard: [[
    { text: T.en.lang_name, callback_data: 'setlang:en' }, { text: T.ru.lang_name, callback_data: 'setlang:ru' }, { text: T.kk.lang_name, callback_data: 'setlang:kk' },
  ]] };
  const backKeyboard = t => ({ inline_keyboard: [[{ text: t.b_menu, callback_data: 'menu' }]] });

  // ---------- Alerts: morning alert on bad-air days and a weekly summary (opt-in) ----------
  // Only the chat ID and the two choices are stored, plus the last day/week a message was sent
  const alertsFile = `${dataDir}/tg-alerts.json`;
  let subs = {};
  try { if (existsSync(alertsFile)) subs = JSON.parse(readFileSync(alertsFile, 'utf8')) || {}; } catch { console.warn('tg-alerts.json was unreadable; starting fresh'); }
  subs = Object.fromEntries(Object.entries(subs).filter(([k, v]) => /^-?\d{1,20}$/.test(k) && v && typeof v === 'object'));
  const saveSubs = () => {
    try { writeFileSync(alertsFile + '.tmp', JSON.stringify(subs)); renameSync(alertsFile + '.tmp', alertsFile); } catch {}
  };
  const ALERT_LEVEL = 35; // Kazakhstan's daily limit for PM2.5 (µg/m³)
  const alertsKeyboard = (t, s = {}) => ({ inline_keyboard: [
    [{ text: s.daily ? t.al_daily_on : t.al_daily_off, callback_data: 'al:daily' }],
    [{ text: s.weekly ? t.al_weekly_on : t.al_weekly_off, callback_data: 'al:weekly' }],
    [{ text: s.research ? t.al_research_on : t.al_research_off, callback_data: 'al:research' }],
    [{ text: s.role === 'driver' ? t.al_driver_on : t.al_driver_off, callback_data: 'al:role:driver' },
      { text: s.role === 'rider' ? t.al_rider_on : t.al_rider_off, callback_data: 'al:role:rider' }],
    [{ text: t.b_menu, callback_data: 'menu' }],
  ] });
  const alertsMenu = chatId => send(chatId, tr(chatId).alerts_title + tr(chatId).al_role, { reply_markup: alertsKeyboard(tr(chatId), subs[String(chatId)]) });
  async function toggleAlert(chatId, kind, messageId) {
    const key = String(chatId);
    const s = subs[key] || { daily: false, weekly: false };
    if (kind === 'role:driver' || kind === 'role:rider') {
      const role = kind.slice(5);
      if (s.role === role) delete s.role; else s.role = role;
      if (s.role && !s.daily) s.daily = true; // tips only arrive with the morning alert, so choosing a role turns it on
    } else s[kind] = !s[kind];
    if (s.daily || s.weekly || s.research || s.last_gaps || s.role) subs[key] = s; else delete subs[key]; // nothing kept once all are off
    saveSubs();
    await call('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: alertsKeyboard(tr(chatId), subs[key]) }).catch(() => {});
  }

  // Almaty is UTC+5 all year
  const almaty = d => new Date(d.getTime() + 5 * 3600_000);
  const isoWeek = d => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = x.getUTCDay() || 7;
    x.setUTCDate(x.getUTCDate() + 4 - day);
    const y = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
    return `${x.getUTCFullYear()}-W${String(Math.ceil(((x - y) / 86_400_000 + 1) / 7)).padStart(2, '0')}`;
  };
  const dayLabel = (iso, lang) => new Date(iso + 'T12:00:00Z').toLocaleDateString(lang === 'kk' ? 'kk-KZ' : lang === 'ru' ? 'ru-RU' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const topDistricts = (air, n = 3) => (air.districts || []).slice(0, n).map(d => `${EMOJI[d.category] || '⚪'} ${esc(d.district)} — <b>${d.pm25}</b>`).join('\n') || '—';

  function alertText(chatId, air, local, plan = null, role = null) {
    const t = tr(chatId), c = air.city;
    // Drivers and riders (inDrive): their own tips under the alert, with the AAI page they come from
    const m = role ? roleMessage(L(chatId), role, { pm25: c.pm25, best: plan?.best, worst: plan?.worst }) : null;
    const src = SOURCE[L(chatId)] || SOURCE.en;
    const extra = m ? `\n\n${t.role_head[role]}\n${m.tips.map(x => `• ${esc(x)}`).join('\n')}\n${fill(t.role_src, { url: esc(src.url), page: src.page })}` : '';
    const time = `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
    return fill(t.alert, { emoji: EMOJI[c.category] || '🔴', time, v: c.pm25, cat: esc(t.cats[c.category] || ''), x: (c.pm25 / 15).toFixed(1),
      districts: topDistricts(air), advice: (t.adv[c.category] || []).map(a => `• ${esc(a)}`).join('\n') }) + extra;
  }
  function weeklyText(chatId, air, today) {
    const lang = L(chatId), t = T[lang];
    const done = (air.days || []).filter(d => d.date < today); // whole days only
    const week = done.slice(-7), before = done.slice(-14, -7);
    if (week.length < 5) return null;
    const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
    const avg = mean(week.map(d => d.pm25)), prev = before.length >= 5 ? mean(before.map(d => d.pm25)) : null;
    const chg = prev ? Math.round(100 * (avg - prev) / prev) : null;
    const trend = chg == null ? '' : chg > 2 ? fill(t.trend_up, { x: chg }) : chg < -2 ? fill(t.trend_down, { x: chg }) : t.trend_flat;
    const sorted = [...week].sort((a, b) => b.pm25 - a.pm25);
    const fmt = d => `${dayLabel(d.date, lang)}, <b>${d.pm25}</b> ${t.unit}`;
    return fill(t.weekly, { from: dayLabel(week[0].date, lang), to: dayLabel(week[week.length - 1].date, lang), avg: avg.toFixed(1), trend,
      spark: sparkline(week.map(d => d.pm25)), bad: week.filter(d => d.pm25 > ALERT_LEVEL).length, n: week.length,
      worst: fmt(sorted[0]), best: fmt(sorted[sorted.length - 1]), districts: topDistricts(air) });
  }

  // Checked every 5 minutes. The morning alert goes out between 7 and 10 a.m. only if the city average is
  // above the limit (checked again until 10, so a smog that builds up at 8 still triggers it); the weekly
  // summary goes out on Monday between 9 a.m. and noon. Each at most once per chat.
  async function runAlerts(now = new Date()) {
    const local = almaty(now), today = local.toISOString().slice(0, 10), hour = local.getUTCHours(), week = isoWeek(local);
    const list = Object.entries(subs);
    const dailyDue = hour >= 7 && hour < 10 && list.some(([, s]) => s.daily && s.last_daily !== today);
    const weeklyDue = local.getUTCDay() === 1 && hour >= 9 && hour < 12 && list.some(([, s]) => s.weekly && s.last_weekly !== week);
    // The AAI team gets the research-gaps report on Monday morning too (chats listed in TELEGRAM_ADMIN_CHATS)
    const team = (teamChats || []).map(String).filter(id => /^-?\d{1,20}$/.test(id));
    const teamDue = gapsFn && local.getUTCDay() === 1 && hour >= 9 && hour < 12 && team.some(id => subs[id]?.last_gaps !== week);
    let sentTeam = 0;
    if (teamDue) {
      try {
        const g = await gapsFn();
        for (const id of team) {
          if (subs[id]?.last_gaps === week) continue;
          const t = tr(id), lang = L(id);
          const list = g.topics.length ? g.topics.slice(0, 8).map((x, i) => `${i + 1}. <b>${esc(x.name[lang] || x.name.en)}</b> — ${x.count}\n   <i>«${esc(x.examples[0] || '')}»</i>`).join('\n') : '—';
          await send(id, fill(t.team_gaps, { list, total: g.total })).catch(err => console.warn('Team report failed:', err.message));
          subs[id] = { daily: false, weekly: false, ...subs[id], last_gaps: week };
          sentTeam++;
          await sleep(50);
        }
      } catch (err) { console.warn('Research gaps for Telegram failed:', err.message); }
    }
    // My places: when the air at a saved place goes above the limit (7:00–21:00, at most once a day per place)
    // Parent groups: the school's morning card on school days (Mon–Fri) from 7:30, once a day
    const placesDue = hour >= 7 && hour < 21 && Object.keys(places).length > 0;
    const weekday = local.getUTCDay();
    const cardsDue = weekday >= 1 && weekday <= 5 && ((hour === 7 && local.getUTCMinutes() >= 30) || hour === 8)
      && Object.values(groups).some(g => g.last !== today);
    if (placesDue || cardsDue) {
      const byId = new Map(((await stationsFn().catch(() => null))?.stations || []).map(s => [s.id, s]));
      let changed = false;
      if (placesDue) for (const [chatId, list] of Object.entries(places)) {
        for (const p of list) {
          const s = byId.get(p.id);
          if (!s || !(s.pm25 > ALERT_LEVEL) || p.last === today) continue;
          const t = tr(chatId);
          try {
            await send(chatId, fill(t.pl_alert, { emoji: EMOJI[s.category] || '🔴', name: esc(p.name), v: s.pm25, cat: esc(t.cats[s.category] || ''),
              advice: (t.adv[s.category] || []).map(a => `• ${esc(a)}`).join('\n') }),
              { reply_markup: { inline_keyboard: [[{ text: t.b_best, callback_data: 'best' }, { text: t.b_places, callback_data: 'places' }]] } });
            p.last = today; sentTeam++; changed = true;
          } catch (err) {
            if (/blocked|deactivated|chat not found|kicked/i.test(err.message)) { delete places[chatId]; changed = true; break; }
          }
          await sleep(50);
        }
      }
      if (changed) savePlaces();
      if (cardsDue) {
        const plan = await outdoorFn().catch(() => null);
        for (const [chatId, g] of Object.entries(groups)) {
          const s = byId.get(g.id);
          if (g.last === today || !s) continue;
          try { await send(chatId, groupCard(chatId, s, plan, local)); g.last = today; sentTeam++; }
          catch (err) { if (/blocked|deactivated|chat not found|kicked|not a member/i.test(err.message)) delete groups[chatId]; }
          await sleep(50);
        }
        saveGroups();
      }
    }
    if (!dailyDue && !weeklyDue) { if (sentTeam) saveSubs(); return { sent: sentTeam }; }
    const air = await airFn();
    const bad = Boolean(air?.city && air.city.pm25 > ALERT_LEVEL);
    // Best and worst hours, only needed when someone chose driver or rider
    const plan = dailyDue && bad && list.some(([, s]) => s.daily && s.role) ? await outdoorFn().catch(() => null) : null;
    let sent = 0;
    for (const [chatId, s] of list) {
      try {
        if (dailyDue && bad && s.daily && s.last_daily !== today) {
          await send(chatId, alertText(chatId, air, local, plan, s.role), { reply_markup: { inline_keyboard: [[{ text: tr(chatId).b_near, callback_data: 'near' }, { text: tr(chatId).b_districts, callback_data: 'districts' }]] } });
          s.last_daily = today; sent++;
        }
        if (weeklyDue && s.weekly && s.last_weekly !== week) {
          const text = weeklyText(chatId, air, today);
          if (text) { await send(chatId, text); s.last_weekly = week; sent++; }
        }
      } catch (err) {
        // The person blocked the bot or deleted the chat: forget the subscription
        if (/blocked|deactivated|chat not found|kicked/i.test(err.message)) delete subs[chatId];
        else if (err.retryAfter) await sleep(err.retryAfter * 1000);
      }
      await sleep(50); // stay well under Telegram's sending limits
    }
    saveSubs();
    return { sent: sent + sentTeam };
  }
  const alertTimer = setInterval(() => runAlerts().catch(err => console.warn('Telegram alerts failed:', err.message)), 5 * 60_000);
  alertTimer.unref?.();

  // Abuse limits per chat: 6 questions a minute, 60 a day
  const usage = new Map();
  function allowed(chatId) {
    const now = Date.now(), u = usage.get(chatId) || { minute: [], day: [] };
    u.minute = u.minute.filter(x => now - x < 60_000); u.day = u.day.filter(x => now - x < 86_400_000);
    if (u.day.length >= 60) return 'daily';
    if (u.minute.length >= 6) return 'too_many';
    u.minute.push(now); u.day.push(now); usage.set(chatId, u);
    return null;
  }
  const busy = new Set();
  // Taps and commands: at most 20 a minute per chat (keeps one chat from using up the bot's Telegram limits)
  const actions = new Map();
  function actionAllowed(chatId) {
    const now = Date.now(), list = (actions.get(chatId) || []).filter(x => now - x < 60_000);
    if (list.length >= 20) { actions.set(chatId, list); return false; }
    list.push(now); actions.set(chatId, list); return true;
  }
  // Forget idle chats so the counters never grow without limit
  setInterval(() => {
    const now = Date.now();
    for (const [k, u] of usage) if (!u.day.some(x => now - x < 86_400_000)) usage.delete(k);
    for (const [k, l] of actions) if (!l.some(x => now - x < 60_000)) actions.delete(k);
  }, 3_600_000).unref();

  async function welcome(chatId) {
    let sensors = '150+';
    try { sensors = String((await getStations()).stations.length); } catch {}
    const t = tr(chatId);
    await send(chatId, fill(t.welcome, { docs: sourceCount, sensors }), { reply_markup: menuKeyboard(t) });
  }

  async function airNow(chatId) {
    const t = tr(chatId);
    let stations;
    try { ({ stations } = await getStations()); } catch { return send(chatId, t.no_live, { reply_markup: backKeyboard(t) }); }
    if (!stations.length) return send(chatId, t.no_live, { reply_markup: backKeyboard(t) });
    const avg = stations.reduce((a, s) => a + s.pm25, 0) / stations.length;
    const cat = pm25Category(avg).key;
    const counts = stations.reduce((m, s) => (m[s.category] = (m[s.category] || 0) + 1, m), {});
    const order = ['good', 'moderate', 'sensitive', 'unhealthy', 'very'];
    const maxCount = Math.max(...Object.values(counts));
    const dist = order.filter(k => counts[k]).map(k => `${EMOJI[k]} <code>${bar(counts[k], maxCount)}</code> ${counts[k]} · ${esc(t.cats[k])}`).join('\n');
    const sorted = [...stations].sort((a, b) => b.pm25 - a.pm25);
    let compare = '';
    try {
      const c = (await liveContext(['compare']))[0]?.blocks?.[0];
      const m = c?.match(/is ([\d.]+) µg\/m³, versus ([\d.]+) µg\/m³ .*\(([+-]?\d+)%\)/);
      if (m) compare = '\n\n' + fill(t.vs_yesterday, { cur: m[1], prev: m[2], chg: `${+m[3] > 0 ? '+' : ''}${m[3]}%` });
    } catch {}
    const updated = stations.map(s => s.last).filter(Boolean).sort().pop();
    const text = `${t.air_title}\n\n${EMOJI[cat]} <b>${avg.toFixed(1)} ${t.unit}</b> · ${esc(t.cats[cat])}\n<i>${esc(t.avg)}, ${esc(fill(t.sensors, { n: stations.length }))}</i>\n\n${dist}${compare}\n\n` +
      `${t.worst}\n${sorted.slice(0, 3).map(s => `${EMOJI[s.category]} ${esc(s.name)} — <b>${s.pm25}</b>`).join('\n')}\n\n` +
      `${t.best}\n${sorted.slice(-3).reverse().map(s => `${EMOJI[s.category]} ${esc(s.name)} — <b>${s.pm25}</b>`).join('\n')}\n\n<i>${esc(t.who)} · ${esc(fill(t.updated, { t: almatyTime(updated) }))}</i>`;
    await send(chatId, text, { reply_markup: { inline_keyboard: [[{ text: t.b_districts, callback_data: 'districts' }, { text: t.b_near, callback_data: 'near' }], [{ text: t.b_menu, callback_data: 'menu' }]] } });
  }

  async function districts(chatId) {
    const t = tr(chatId);
    const part = (await liveContext(['districts']).catch(() => []))[0];
    const rows = (part?.blocks || []).map(b => b.match(/^(.+?) district: PM2\.5 ([\d.]+)/)).filter(Boolean).map(m => ({ name: m[1], v: +m[2] }));
    if (!rows.length) return send(chatId, t.no_live, { reply_markup: backKeyboard(t) });
    const max = Math.max(...rows.map(r => r.v));
    const medals = ['🥵', '😷', '😐'];
    const text = `${t.districts_title}\n\n${rows.map((r, i) => `${EMOJI[pm25Category(r.v).key]} <code>${bar(r.v, max, 8)}</code> <b>${r.v}</b> ${esc(r.name)}${i < 3 ? ' ' + medals[i] : ''}`).join('\n')}\n\n<i>${esc(t.who)}</i>`;
    await send(chatId, text, { reply_markup: { inline_keyboard: [[{ text: t.b_air, callback_data: 'air' }, { text: t.b_near, callback_data: 'near' }], [{ text: t.b_menu, callback_data: 'menu' }]] } });
  }

  async function askNear(chatId) {
    const t = tr(chatId);
    await send(chatId, t.near_ask, { reply_markup: { keyboard: [[{ text: t.near_btn, request_location: true }]], resize_keyboard: true, one_time_keyboard: true } });
  }

  async function near(chatId, loc) {
    const t = tr(chatId);
    let stations;
    try { ({ stations } = await getStations()); } catch { return send(chatId, t.no_live, { reply_markup: { remove_keyboard: true } }); }
    const me = { lat: loc.latitude, lng: loc.longitude };
    const nearest = stations.map(s => ({ s, d: km(me, s) })).sort((a, b) => a.d - b.d)[0];
    if (!nearest) return send(chatId, t.no_live, { reply_markup: { remove_keyboard: true } });
    let d;
    try { d = await getStationDetail(nearest.s.id); } catch { return send(chatId, t.no_live, { reply_markup: { remove_keyboard: true } }); }
    const vals = d.series.map(p => p.v);
    const arrow = d.change_24h > 0 ? '↗' : d.change_24h < 0 ? '↘' : '→';
    const text = `${fill(t.near_title, { name: esc(d.name), km: nearest.d.toFixed(1), t: almatyTime(d.updated) })}\n\n` +
      `${EMOJI[d.category]} <b>${Math.round(d.pm25)} ${t.unit}</b> · ${esc(t.cats[d.category])}` +
      `${d.change_24h != null ? `\n${esc(fill(t.change24, { arrow, chg: `${d.change_24h > 0 ? '+' : ''}${d.change_24h}` }))}` : ''}\n\n` +
      (vals.length > 1 ? `${t.last24}\n<code>${sparkline(vals)}</code>\n${esc(fill(t.minavg, d))}\n\n` : '') +
      `${t.advice}\n${(t.adv[d.category] || []).map(a => `• ${esc(a)}`).join('\n')}\n\n<i>${esc(t.who)}</i>`;
    // Remove the location keyboard, then show the card with the menu
    await send(chatId, '📍', { reply_markup: { remove_keyboard: true } }).then(r => r?.result && call('deleteMessage', { chat_id: chatId, message_id: r.result.message_id }).catch(() => {}));
    await send(chatId, text, { reply_markup: { inline_keyboard: [[{ text: t.pl_save_btn, callback_data: `pl:add:${nearest.s.id}` }],
      [{ text: t.b_air, callback_data: 'air' }, { text: t.b_districts, callback_data: 'districts' }], [{ text: t.b_menu, callback_data: 'menu' }]] } });
  }

  async function examples(chatId) {
    const t = tr(chatId);
    await send(chatId, t.examples, { reply_markup: { inline_keyboard: [...t.ex.map((q, i) => [{ text: q, callback_data: `ex:${i}` }]), [{ text: t.b_menu, callback_data: 'menu' }]] } });
  }

  // An answer as Telegram HTML: the text, its sources with the exact quotes, and buttons that open each
  // cited page. `head` goes on top (a fact-check verdict); `quotes: false` leaves the quotes out.
  function formatAnswer(t, r, { head = '', quotes = true, footer: showFooter = true } = {}) {
    const plain = r.text.length > 2400 ? r.text.slice(0, 2400) + '…' : r.text;
    const body = esc(plain).replace(/\[(\d+)\]/g, '<b>[$1]</b>');
    const srcs = r.sources.slice(0, 5).map(s => {
      const where = s.live ? t.live : `${esc(s.title)}${s.page ? `, ${fill(t.page, { p: s.page })}` : ''}${s.section ? `, ${fill(t.answer_to, { n: s.section.n })}` : ''}`;
      const quote = s.quote.length > 240 ? s.quote.slice(0, 237) + '…' : s.quote;
      return quotes ? `<b>[${s.n}]</b> ${where}\n<blockquote expandable>${esc(quote)}</blockquote>` : `<b>[${s.n}]</b> ${where}`;
    }).join('\n');
    const footer = !showFooter ? '' : `\n\n<i>${r.cached ? fill(t.footer_cached, { k: r.sources.length }) : fill(t.footer, { s: ((r.ms || 0) / 1000).toFixed(1), k: r.sources.length })}</i>`;
    const top = head ? `${head}\n\n` : '';
    let text = r.found ? `${top}${body}\n\n${t.sources}\n${srcs}${footer}` : `${top || `${t.not_found}\n\n`}${body}`;
    if (text.length > 4096) text = r.found ? `${top}${body}${footer}` : `${top || `${t.not_found}\n\n`}${body}`; // drop the quotes rather than break the HTML
    // Buttons that open each cited page (http links only), three to a row
    const list = r.sources.slice(0, 5).filter(s => /^https?:\/\//.test(s.url || '') && !s.live)
      .map(s => ({ text: fill(t.open_src, { n: s.n }), url: encodeURI(decodeURI(s.url)) }));
    const links = [];
    for (let k = 0; k < list.length; k += 3) links.push(list.slice(k, k + 3));
    return { text, links };
  }

  async function answer(chatId, question) {
    const t = tr(chatId);
    if (question.length < 6) return send(chatId, t.short);
    if (question.length > 500) question = question.slice(0, 500);
    if (busy.has(chatId)) return send(chatId, t.busy); // one question at a time per chat
    const limit = allowed(chatId);
    if (limit) return send(chatId, t[limit]);
    busy.add(chatId);
    const steps = [fill(t.step1, { n: sourceCount }), t.step2, t.step3];
    let msg, stepTimer;
    try {
      call('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
      msg = (await send(chatId, steps[0])).result;
      // Progress follows the real pipeline; once the answer starts, it is typed into the message
      // (edits at most every 1.2 s, within Telegram's limits)
      let partial = '', shown = '', stage = 0, shownStage = 0;
      stepTimer = setInterval(() => {
        if (partial && partial !== shown) {
          shown = partial;
          edit(chatId, msg.message_id, `${esc(partial.replace(/\*\*/g, ''))} ▍`).catch(() => {});
        } else if (!partial && shownStage < stage) {
          shownStage = stage;
          edit(chatId, msg.message_id, steps[stage]).catch(() => {});
        }
        call('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
      }, 1200);
      const r = await askQuestion(question, e => {
        if (e.type === 'stage') stage = e.stage === 'search' ? 1 : 2;
        else if (e.type === 'delta') partial += e.text;
        else if (e.type === 'reset') partial = '';
      });
      clearInterval(stepTimer);
      const { text, links } = formatAnswer(t, r);
      const rows = [...links, [{ text: t.b_examples, callback_data: 'examples' }, { text: t.b_menu, callback_data: 'menu' }]];
      await edit(chatId, msg.message_id, text, { reply_markup: { inline_keyboard: rows } });
    } catch (err) {
      clearInterval(stepTimer);
      console.warn('Telegram answer failed:', err.message);
      if (msg) await edit(chatId, msg.message_id, t.error).catch(() => {}); else await send(chatId, t.error).catch(() => {});
    } finally {
      busy.delete(chatId);
    }
  }

  // ---------- Voice notes: turned into text, then answered like a typed question ----------
  // Up to 1 minute each, 4 a minute and 30 a day per chat (speech-to-text has a cost). The audio is kept
  // in memory only for the transcription and never saved.
  const voiceUse = new Map();
  function voiceAllowed(chatId) {
    const now = Date.now(), u = (voiceUse.get(chatId) || []).filter(x => now - x < 86_400_000);
    if (u.length >= 30 || u.filter(x => now - x < 60_000).length >= 4) { voiceUse.set(chatId, u); return false; }
    u.push(now); voiceUse.set(chatId, u); return true;
  }
  setInterval(() => { const now = Date.now(); for (const [k, u] of voiceUse) if (!u.some(x => now - x < 86_400_000)) voiceUse.delete(k); }, 3_600_000).unref?.();
  const MAX_VOICE_BYTES = 2_000_000;
  async function voiceNote(chatId, v) {
    const t = tr(chatId);
    if (!transcribe) return send(chatId, t.voice_off);
    if ((v.duration || 0) > 60 || (v.file_size || 0) > MAX_VOICE_BYTES) return send(chatId, t.voice_long);
    if (busy.has(chatId)) return send(chatId, t.busy);
    if (!voiceAllowed(chatId)) return send(chatId, t.too_many);
    call('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
    const status = (await send(chatId, t.voice_listening)).result;
    let said = '';
    try {
      const f = await call('getFile', { file_id: v.file_id });
      const path = f.result?.file_path;
      if (!path || !/^[\w./-]{1,200}$/.test(path) || path.includes('..')) throw new Error('bad file path');
      const res = await fetch(`${apiBase}/file/bot${token}/${path}`, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`download ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length || buf.length > MAX_VOICE_BYTES) throw new Error('voice file size');
      const r = await transcribe(buf, { filename: path.split('/').pop() || 'voice.ogg', type: v.mime_type || 'audio/ogg' });
      said = r.text.replace(/\s+/g, ' ').trim().slice(0, 500);
    } catch (err) {
      console.warn('Telegram voice note failed:', err.message); // never includes the file URL (it holds the bot token)
    }
    if (said.length < 3) return edit(chatId, status.message_id, t.voice_fail).catch(() => {});
    await edit(chatId, status.message_id, fill(t.voice_heard, { text: esc(said) })).catch(() => {});
    return answer(chatId, said);
  }

  // ---------- Fact-check: a forwarded post, or /check <claim> ----------
  // Only the text is checked; the author, the channel and who forwarded it are never read or stored.
  async function factCheck(chatId, claim) {
    const t = tr(chatId);
    claim = String(claim || '').replace(/\s+/g, ' ').trim();
    if (claim.length < 15) return send(chatId, t.check_none, { reply_markup: backKeyboard(t) });
    let cut = false;
    if (claim.length > 500) { // the copilot checks up to 500 characters: stop at the last full sentence
      const s = claim.slice(0, 500), end = Math.max(s.lastIndexOf('. '), s.lastIndexOf('! '), s.lastIndexOf('? '));
      claim = end > 150 ? s.slice(0, end + 1) : s;
      cut = true;
    }
    if (busy.has(chatId)) return send(chatId, t.busy);
    const limit = allowed(chatId);
    if (limit) return send(chatId, t[limit]);
    busy.add(chatId);
    let msg;
    try {
      call('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
      msg = (await send(chatId, t.checking)).result;
      const r = await askQuestion(claim, null, { mode: 'factcheck' });
      const verdict = t.verdicts[r.verdict] || (r.found ? '' : t.verdicts['NOT COVERED']);
      const shown = claim.length > 300 ? claim.slice(0, 297) + '…' : claim;
      const head = `${verdict}\n<blockquote>${esc(shown)}</blockquote>${cut ? `\n${t.check_cut}` : ''}`;
      const { text, links } = formatAnswer(t, r.found ? r : { ...r, found: true, sources: [] }, { head });
      await edit(chatId, msg.message_id, text, { reply_markup: { inline_keyboard: [...links, [{ text: t.b_check, callback_data: 'check' }, { text: t.b_menu, callback_data: 'menu' }]] } });
    } catch (err) {
      console.warn('Telegram fact-check failed:', err.message);
      if (msg) await edit(chatId, msg.message_id, t.error).catch(() => {}); else await send(chatId, t.error).catch(() => {});
    } finally {
      busy.delete(chatId);
    }
  }

  // ---------- Best time to go out (no AI: AAI's hourly data) ----------
  const hh = h => `${String(h % 24).padStart(2, '0')}:00`;
  async function bestText(t) {
    const p = await outdoorFn();
    return fill(t.best_text, { day: p.day === 'tomorrow' ? t.day_tomorrow : t.day_today,
      bf: hh(p.best.from), bt: hh(p.best.to), bv: p.best.pm25, bc: esc(t.cats[p.best.category] || ''),
      wf: hh(p.worst.from), wt: hh(p.worst.to), wv: p.worst.pm25, wc: esc(t.cats[p.worst.category] || '') });
  }
  async function bestTime(chatId) {
    const t = tr(chatId);
    let text;
    try { text = await bestText(t); } catch { return send(chatId, t.no_live, { reply_markup: backKeyboard(t) }); }
    return send(chatId, text, { reply_markup: { inline_keyboard: [[{ text: t.b_air, callback_data: 'air' }, { text: t.b_places, callback_data: 'places' }], [{ text: t.b_menu, callback_data: 'menu' }]] } });
  }

  // ---------- My places: up to 3 sensors per chat, with an alert when the air there is bad ----------
  // Stored: the sensor's number, its public name and the last day an alert went out. Never a location.
  const placesFile = `${dataDir}/tg-places.json`;
  let places = {};
  try { if (existsSync(placesFile)) places = JSON.parse(readFileSync(placesFile, 'utf8')) || {}; } catch { console.warn('tg-places.json was unreadable; starting fresh'); }
  places = Object.fromEntries(Object.entries(places).filter(([k, v]) => /^-?\d{1,20}$/.test(k) && Array.isArray(v))
    .map(([k, v]) => [k, v.filter(p => Number.isInteger(p?.id) && typeof p.name === 'string').slice(0, 3)]).filter(([, v]) => v.length));
  const savePlaces = () => { try { writeFileSync(placesFile + '.tmp', JSON.stringify(places)); renameSync(placesFile + '.tmp', placesFile); } catch {} };
  const MAX_PLACES = 3;
  const pendingSchool = new Map(); // chat → time until which the next text is a school search (5 minutes)
  const SCHOOL = /mektep|mektebi|litsei|gimnaziya|школ|мектеп|лицей|гимназ/i, KINDER = /balabaq|böbekjai|балабақша|детск|ясли/i;

  async function placesMenu(chatId) {
    const t = tr(chatId), list = places[String(chatId)] || [];
    let lines = t.places_empty;
    if (list.length) {
      const byId = new Map(((await stationsFn().catch(() => null))?.stations || []).map(s => [s.id, s]));
      lines = list.map(p => { const s = byId.get(p.id); return s ? `${EMOJI[s.category] || '⚪'} <b>${esc(p.name)}</b> — ${s.pm25} ${t.unit}` : `⚪ <b>${esc(p.name)}</b>`; }).join('\n');
    }
    const rows = [[{ text: t.pl_add_loc, callback_data: 'pl:loc' }, { text: t.pl_add_school, callback_data: 'pl:school' }],
      ...list.map(p => [{ text: fill(t.pl_remove, { name: p.name.slice(0, 40) }), callback_data: `pl:del:${p.id}` }]),
      [{ text: t.b_menu, callback_data: 'menu' }]];
    return send(chatId, `${t.places_title}\n\n${lines}`, { reply_markup: { inline_keyboard: rows } });
  }
  async function addPlace(chatId, id) {
    const t = tr(chatId), key = String(chatId), list = places[key] || [];
    if (list.some(p => p.id === id)) return send(chatId, t.pl_exists, { reply_markup: { inline_keyboard: [[{ text: t.b_places, callback_data: 'places' }]] } });
    if (list.length >= MAX_PLACES) return placesMenu(chatId).then(() => send(chatId, t.pl_full));
    const s = ((await stationsFn().catch(() => null))?.stations || []).find(x => x.id === id);
    if (!s) return send(chatId, t.no_live, { reply_markup: backKeyboard(t) });
    places[key] = [...list, { id, name: String(s.name).slice(0, 80) }];
    savePlaces();
    return send(chatId, fill(t.pl_saved, { name: esc(s.name) }), { reply_markup: { inline_keyboard: [[{ text: t.b_places, callback_data: 'places' }, { text: t.b_menu, callback_data: 'menu' }]] } });
  }
  async function removePlace(chatId, id, messageId) {
    const key = String(chatId);
    places[key] = (places[key] || []).filter(p => p.id !== id);
    if (!places[key].length) delete places[key]; // nothing kept once the last place is removed
    savePlaces();
    if (messageId) call('deleteMessage', { chat_id: chatId, message_id: messageId }).catch(() => {});
    return placesMenu(chatId);
  }
  // School and kindergarten sensors whose name matches a number ("112") or part of a name
  async function findSchools(q) {
    const { stations } = await stationsFn();
    const query = String(q).trim().slice(0, 60), num = query.match(/\d{1,4}/)?.[0];
    const hit = s => num ? new RegExp(`(^|\\D)${num}(\\D|$)`).test(s.name) : s.name.toLowerCase().includes(query.toLowerCase());
    return stations.filter(s => (SCHOOL.test(s.name) || KINDER.test(s.name)) && hit(s)).slice(0, 8);
  }
  async function schoolSearch(chatId, q, prefix) {
    const t = tr(chatId);
    let found;
    try { found = await findSchools(q); } catch { return send(chatId, t.no_live); }
    if (!found.length) return send(chatId, fill(t.pl_school_none, { q: esc(String(q).slice(0, 60)) }));
    return send(chatId, t.pl_school_pick, { reply_markup: { inline_keyboard: found.map(s => [{ text: `${EMOJI[s.category] || '⚪'} ${s.name.slice(0, 50)} · ${s.pm25}`, callback_data: `${prefix}${s.id}` }]) } });
  }

  // ---------- Parent groups: a daily air card for the group's school ----------
  // Stored per group: the sensor's number and name, and the last day a card went out
  const groupsFile = `${dataDir}/tg-groups.json`;
  let groups = {};
  try { if (existsSync(groupsFile)) groups = JSON.parse(readFileSync(groupsFile, 'utf8')) || {}; } catch { console.warn('tg-groups.json was unreadable; starting fresh'); }
  groups = Object.fromEntries(Object.entries(groups).filter(([k, v]) => /^-\d{1,20}$/.test(k) && Number.isInteger(v?.id) && typeof v.name === 'string'));
  const saveGroups = () => { try { writeFileSync(groupsFile + '.tmp', JSON.stringify(groups)); renameSync(groupsFile + '.tmp', groupsFile); } catch {} };
  const isGroup = chat => chat?.type === 'group' || chat?.type === 'supergroup';
  async function isAdmin(chatId, from, senderChat) {
    if (senderChat?.id === chatId) return true; // an anonymous admin posting as the group
    if (!from?.id) return false;
    const r = await call('getChatMember', { chat_id: chatId, user_id: from.id }).catch(() => null);
    return ['creator', 'administrator'].includes(r?.result?.status);
  }
  // A group's language: the one its admin uses with the bot, else their Telegram app's language
  const langFrom = from => (isLang(langs.get(String(from?.id))) ? langs.get(String(from.id))
    : isLang(String(from?.language_code || '').slice(0, 2)) ? String(from.language_code).slice(0, 2) : 'en');
  async function setGroupSchool(chatId, id, from) {
    const s = ((await stationsFn().catch(() => null))?.stations || []).find(x => x.id === id);
    const t = tr(chatId);
    if (!s) return send(chatId, t.no_live);
    groups[String(chatId)] = { id, name: String(s.name).slice(0, 80) };
    saveGroups();
    return send(chatId, fill(t.grp_set, { name: esc(s.name) }));
  }
  async function onGroupMessage(m) {
    const chatId = m.chat.id, text = (m.text || '').trim();
    const c = text.match(/^\/(\w+)(?:@(\w+))?(?:\s+([\s\S]*))?$/);
    if (!c) return; // in groups the bot only reacts to its commands
    if (c[2] && botName && c[2].toLowerCase() !== botName.toLowerCase()) return; // a command for another bot
    const cmd = c[1].toLowerCase(), arg = (c[3] || '').trim();
    if (!langs.has(String(chatId))) { langs.set(String(chatId), langFrom(m.from)); saveLangs(); }
    const t = tr(chatId);
    if (cmd === 'start' || cmd === 'help') return send(chatId, t.grp_hello);
    if (cmd === 'air') return airNow(chatId);
    if (cmd === 'best') return bestTime(chatId);
    if (cmd === 'school') {
      if (!(await isAdmin(chatId, m.from, m.sender_chat))) return send(chatId, t.grp_admin_only);
      if (/^(off|stop|выкл|өшір)/i.test(arg)) { delete groups[String(chatId)]; saveGroups(); return send(chatId, t.grp_off); }
      if (!arg) return send(chatId, t.grp_hello);
      return schoolSearch(chatId, arg, 'gs:');
    }
  }
  function groupCard(chatId, s, plan, local) {
    const t = tr(chatId);
    const time = `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
    const best = plan ? fill(t.grp_best, { bf: hh(plan.best.from), bt: hh(plan.best.to), bv: plan.best.pm25, wf: hh(plan.worst.from), wt: hh(plan.worst.to), wv: plan.worst.pm25 }) : '';
    return fill(t.grp_card, { name: esc(s.name), time, emoji: EMOJI[s.category] || '⚪', v: s.pm25, cat: esc(t.cats[s.category] || ''),
      best, advice: esc((t.adv[s.category] || [''])[0]) });
  }

  // ---------- Inline mode: @bot <question> in any chat ----------
  // Short or empty queries get instant cards (air now, best time); a question is answered with its
  // sources after a 1.2 s pause in typing, so each keystroke does not cost an AI call.
  const inlineWait = new Map();
  const shortId = s => createHash('sha1').update(s).digest('hex').slice(0, 32);
  async function airText(t) {
    const { stations } = await getStations();
    if (!stations.length) throw new Error('no stations');
    const avg = stations.reduce((a, s) => a + s.pm25, 0) / stations.length, cat = pm25Category(avg).key;
    return { avg: avg.toFixed(1), cat, text: `${t.air_title}\n\n${EMOJI[cat]} <b>${avg.toFixed(1)} ${t.unit}</b> · ${esc(t.cats[cat])}\n<i>${esc(t.avg)}, ${esc(fill(t.sensors, { n: stations.length }))}</i>\n\n<i>${esc(t.who)}</i>` };
  }
  async function onInline(q) {
    const from = q.from?.id;
    if (!from) return;
    const lang = langFrom(q.from), t = T[lang];
    const query = String(q.query || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    const answerInline = (results, extra = {}) => call('answerInlineQuery', { inline_query_id: q.id, results, is_personal: true, cache_time: 30,
      button: { text: t.in_open, start_parameter: lang }, ...extra }).catch(err => console.warn('Inline answer failed:', err.message));
    const html = text => ({ message_text: text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    if (query.length < 8) {
      const results = [];
      try { const a = await airText(t); results.push({ type: 'article', id: `air-${lang}`, title: `🌫 ${t.in_air}`, description: `${a.avg} ${t.unit} · ${t.cats[a.cat]}`, input_message_content: html(a.text) }); } catch {}
      try { results.push({ type: 'article', id: `best-${lang}`, title: `🕐 ${t.in_best}`, description: t.in_hint, input_message_content: html(await bestText(t)) }); } catch {}
      return answerInline(results);
    }
    const mark = Symbol();
    inlineWait.set(from, mark);
    await sleep(1200);
    if (inlineWait.get(from) !== mark) return; // the person kept typing: only the last query is answered
    inlineWait.delete(from);
    if (!actionAllowed(from)) return;
    const limit = allowed(from);
    if (limit) return answerInline([{ type: 'article', id: `limit-${lang}`, title: t[limit].replace(/<[^>]+>/g, ''), input_message_content: html(t[limit]) }], { cache_time: 0 });
    try {
      const r = await Promise.race([askQuestion(query, null, {}), sleep(9000).then(() => { throw new Error('slow'); })]);
      const { text, links } = formatAnswer(t, r, { head: `❓ <b>${esc(query)}</b>`, quotes: false, footer: false });
      const site = publicUrl ? ` · <a href="${esc(publicUrl)}">${esc(t.in_via)}</a>` : ` · ${esc(t.in_via)}`;
      const body = (text + `\n\n<i>⚡${site}</i>`).slice(0, 4096);
      return answerInline([{ type: 'article', id: shortId(`${lang}:${query}`), title: query.slice(0, 100), description: r.text.replace(/\[\d+\]/g, '').slice(0, 140),
        input_message_content: html(body), ...(links.length ? { reply_markup: { inline_keyboard: links } } : {}) }], { cache_time: 300 });
    } catch (err) {
      if (err.message !== 'slow') console.warn('Inline question failed:', err.message);
      return answerInline([], { cache_time: 0, button: { text: t.in_slow.slice(0, 64), start_parameter: lang } });
    }
  }

  // Added to a group: say hello and explain the school card. Removed: forget the group.
  async function onMyChatMember(u) {
    const chatId = u.chat?.id, now = u.new_chat_member?.status, before = u.old_chat_member?.status;
    if (!isGroup(u.chat)) return;
    if (['left', 'kicked'].includes(now)) { if (groups[String(chatId)]) { delete groups[String(chatId)]; saveGroups(); } return; }
    if (['member', 'administrator'].includes(now) && ['left', 'kicked', undefined].includes(before)) {
      if (!langs.has(String(chatId))) { langs.set(String(chatId), langFrom(u.from)); saveLangs(); }
      return send(chatId, tr(chatId).grp_hello).catch(() => {});
    }
  }

  async function onMessage(m) {
    const chatId = m.chat.id;
    if (!actionAllowed(chatId)) return;
    if (isGroup(m.chat)) return onGroupMessage(m);
    if (m.chat.type !== 'private') return; // channels
    // A forwarded post or message: check it against AAI's research (text or a photo's caption)
    if (m.forward_origin || m.forward_date || m.forward_from || m.forward_from_chat) return factCheck(chatId, m.text || m.caption || '');
    if (m.location) return near(chatId, m.location);
    if (m.voice || m.audio || m.video_note) return voiceNote(chatId, m.voice || m.audio || m.video_note);
    const text = (m.text || '').trim();
    if (!text) return;
    const cmd = text.match(/^\/(\w+)/)?.[1]?.toLowerCase();
    // Right after "Add a school": the next text is the school's number or name
    if (!cmd && pendingSchool.get(chatId) > Date.now()) { pendingSchool.delete(chatId); return schoolSearch(chatId, text, 'pl:add:'); }
    pendingSchool.delete(chatId);
    if (cmd === 'start') {
      // Opened from the website (t.me/<bot>?start=ru): start straight in the site's language
      const payload = text.split(/\s+/)[1]?.toLowerCase();
      if (isLang(payload)) { langs.set(String(chatId), payload); saveLangs(); return welcome(chatId); }
      // First visit: the welcome in the language of the user's Telegram app (English if it is none of the three),
      // then the language picker, asked in all three languages so anyone can read it
      if (!langs.has(String(chatId))) {
        langs.set(String(chatId), langFrom(m.from)); saveLangs();
        await welcome(chatId);
        return send(chatId, CHOOSE_LANG_ALL, { reply_markup: langKeyboard });
      }
      return welcome(chatId);
    }
    if (cmd === 'air') return airNow(chatId);
    if (cmd === 'districts') return districts(chatId);
    if (cmd === 'near') return askNear(chatId);
    if (cmd === 'examples' || cmd === 'help') return examples(chatId);
    if (cmd === 'language' || cmd === 'lang') return send(chatId, tr(chatId).choose_lang, { reply_markup: langKeyboard });
    if (cmd === 'about') return send(chatId, tr(chatId).about, { reply_markup: backKeyboard(tr(chatId)) });
    if (cmd === 'alerts') return alertsMenu(chatId);
    if (cmd === 'myid') return send(chatId, fill(tr(chatId).myid, { id: chatId }));
    if (cmd === 'check') {
      const claim = text.replace(/^\/check(@\w+)?\s*/i, '');
      return claim ? factCheck(chatId, claim) : send(chatId, tr(chatId).check_intro, { reply_markup: backKeyboard(tr(chatId)) });
    }
    if (cmd === 'places') return placesMenu(chatId);
    if (cmd === 'best') return bestTime(chatId);
    if (cmd) return welcome(chatId);
    return answer(chatId, text);
  }

  async function onCallback(q) {
    const chatId = q.message?.chat?.id;
    call('answerCallbackQuery', { callback_query_id: q.id }).catch(() => {});
    if (chatId && !actionAllowed(chatId)) return;
    const data = String(q.data || '');
    // In a group: only an admin can pick the school from the list
    if (chatId && isGroup(q.message.chat)) {
      const g = data.match(/^gs:(\d{1,12})$/);
      if (!g) return;
      if (!(await isAdmin(chatId, q.from))) return send(chatId, tr(chatId).grp_admin_only);
      call('deleteMessage', { chat_id: chatId, message_id: q.message.message_id }).catch(() => {});
      return setGroupSchool(chatId, +g[1], q.from);
    }
    if (!chatId || q.message.chat.type !== 'private') return;
    if (data.startsWith('setlang:')) {
      const l = data.slice(8);
      if (!isLang(l)) return;
      langs.set(String(chatId), l); saveLangs();
      await edit(chatId, q.message.message_id, T[l].lang_set).catch(() => {});
      return welcome(chatId);
    }
    if (data === 'menu') return welcome(chatId);
    if (data === 'air') return airNow(chatId);
    if (data === 'districts') return districts(chatId);
    if (data === 'near') return askNear(chatId);
    if (data === 'examples') return examples(chatId);
    if (data === 'lang') return send(chatId, tr(chatId).choose_lang, { reply_markup: langKeyboard });
    if (data === 'about') return send(chatId, tr(chatId).about, { reply_markup: backKeyboard(tr(chatId)) });
    if (data === 'alerts') return alertsMenu(chatId);
    if (data === 'check') return send(chatId, tr(chatId).check_intro, { reply_markup: backKeyboard(tr(chatId)) });
    if (data === 'best') return bestTime(chatId);
    if (data === 'places') return placesMenu(chatId);
    if (data === 'pl:loc') return askNear(chatId);
    if (data === 'pl:school') { pendingSchool.set(chatId, Date.now() + 5 * 60_000); return send(chatId, tr(chatId).pl_school_ask); }
    const pl = data.match(/^pl:(add|del):(\d{1,12})$/);
    if (pl) return pl[1] === 'add' ? addPlace(chatId, +pl[2]) : removePlace(chatId, +pl[2], q.message.message_id);
    if (['al:daily', 'al:weekly', 'al:research', 'al:role:driver', 'al:role:rider'].includes(data)) return toggleAlert(chatId, data.slice(3), q.message.message_id);
    const ex = data.match(/^ex:(\d)$/);
    if (ex) { const qText = tr(chatId).ex[+ex[1]]; if (qText) return answer(chatId, qText); }
  }

  // Bot profile: commands, description and short description in all three languages
  async function setup() {
    for (const [lang, t] of Object.entries(T)) {
      const language_code = lang === 'en' ? undefined : lang;
      const commands = Object.entries(t.commands).map(([command, description]) => ({ command, description }));
      await call('setMyCommands', { commands, ...(language_code && { language_code }) }).catch(() => {});
      await call('setMyDescription', { description: t.desc, ...(language_code && { language_code }) }).catch(() => {});
      await call('setMyShortDescription', { short_description: t.short_desc, ...(language_code && { language_code }) }).catch(() => {});
      const groupCommands = Object.entries(t.grp_commands).map(([command, description]) => ({ command, description }));
      await call('setMyCommands', { commands: groupCommands, scope: { type: 'all_group_chats' }, ...(language_code && { language_code }) }).catch(() => {});
    }
  }

  // Long polling loop with back-off on errors
  let offset = 0, stopped = false, botName = '';
  (async () => {
    await call('deleteWebhook', { drop_pending_updates: false }).catch(() => {});
    await setup();
    const me = await call('getMe', {}).catch(() => null);
    console.log(`Telegram bot @${me?.result?.username || '?'} is running`);
    if (me?.result?.username) { botName = me.result.username; onReady?.(me.result.username); }
    let backoff = 1000;
    while (!stopped) {
      try {
        const r = await call('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query', 'inline_query', 'my_chat_member'] });
        backoff = 1000;
        for (const u of r.result || []) {
          offset = u.update_id + 1;
          const job = u.message ? onMessage(u.message) : u.callback_query ? onCallback(u.callback_query)
            : u.inline_query ? onInline(u.inline_query) : u.my_chat_member ? onMyChatMember(u.my_chat_member) : null;
          job?.catch(err => console.warn('Telegram update failed:', err.message));
        }
      } catch (err) {
        console.warn('Telegram polling error:', err.message);
        await sleep(err.retryAfter ? err.retryAfter * 1000 : backoff);
        backoff = Math.min(backoff * 2, 30_000);
      }
    }
  })();
  // New research from AAI (uploaded on the admin page): its 5-point summary to the chats that opted in
  async function announceResearch(entry) {
    let sent = 0;
    for (const [chatId, s] of Object.entries(subs)) {
      if (!s.research) continue;
      const lang = L(chatId), t = T[lang];
      const points = (entry.summary?.[lang] || entry.summary?.en || []).map(p => `• ${esc(p)}`).join('\n');
      const link = entry.url && /^https:\/\//.test(entry.url) ? entry.url : publicUrl ? `${publicUrl}/research/${entry.id}.pdf` : null;
      try {
        await send(chatId, fill(t.research_new, { title: esc(entry.title), points }),
          link ? { reply_markup: { inline_keyboard: [[{ text: fill(t.open_src, { n: '' }).trim(), url: link }]] } } : {});
        sent++;
      } catch (err) { if (/blocked|deactivated|chat not found|kicked/i.test(err.message)) { delete subs[chatId]; } }
      await sleep(50);
    }
    saveSubs();
    return sent;
  }

  return { stop: () => { stopped = true; clearInterval(alertTimer); }, runAlerts, announceResearch, subscriptions: () => subs,
    places: () => places, groups: () => groups };
}
