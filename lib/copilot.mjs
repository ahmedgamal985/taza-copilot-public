// The copilot: plan the search, retrieve AAI research, add live data, and ask the chosen AI
// provider for an answer that cites exact sentences. Without any AI provider it falls back to
// showing the most relevant passages, so the demo never goes blank.
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { search, tokenize } from './search.mjs';
import { liveContext, hasAaiKey } from './aai.mjs';
import { PROVIDERS, anthropic, openaiChat, costUsd, isReady } from './providers.mjs';

// Auto mode (Anthropic): the cheap, fast model for simple questions, the stronger one for hard ones
const FAST = 'claude-haiku-5-5';
const STRONG = 'claude-sonnet-5-5';
// Words that make a question part of AAI's field whatever the planner says (EN, RU, KK)
const ON_TOPIC_WORDS = /\b(air|pollut\w*|smog|pm ?2[.,]?5|pm ?10|emission\w*|chp|coal|heating|lez|aai|aqi|no2|exhaust)\b|воздух|загрязн|смог|выброс|тэц|угол|уголь|газ|отоплен|котельн|зона низких|автотранспорт|ауа|ластан|тұмша|шығарынд|жэо|көмір|жылыту|сигарет|cigarett|темекі|шылым|датчик|сенсор|sensor|мектеп|школ|school|kindergarten|балабақша/i;
// An answer that carries words in another script: Cyrillic in English, Kazakh letters in Russian
const wrongScript = (lang, t) => {
  if (lang === 'en') return (t.match(/[а-яёәғқңөұүһі]{3,}/gi) || []).length >= 2 || /^\s*[а-яёәғқңөұүһі]+[.,:!]/i.test(t);
  // a Russian or Kazakh answer written mostly in English (Latin words outnumber Cyrillic ones)
  const latin = (t.match(/\b[a-z]{3,}\b/gi) || []).length, cyr = (t.match(/[а-яёәғқңөұүһі]{3,}/gi) || []).length;
  if (latin > cyr) return true;
  return lang === 'ru' && (t.match(/[а-яё]*[әғқңөұүһі][а-яёәғқңөұүһі]*/gi) || []).length >= 3;
};
// Text that stops mid-sentence: a link word or a colon, comma or dash at its end
const DANGLING = /(?:^|\s)(that|which|is|are|was|were|and|or|of|to|the|a|an|by|at|from|with|as|than|in|on|for|что|и|в|на|с|по|как|это|және|мен|деп|бұл)\s*$|[:,–—-]\s*$/i;
// Questions about what a policy achieved (its effect or results)
const OUTCOME = /\b(achiev\w*|results?|effects?|impact\w*|outcomes?|work(ed)?)\b|что дал|результат|эффект|нәтиже|әсер/i;
// The opening of a "the research does not cover this" answer (EN, RU, KK)
const NOT_FOUND = /could not find|couldn't find|does not (cover|contain|give|say|name|mention|state|list)|do not (cover|contain|give|say|name|mention|state|list)|no (figure|data|information) (on|for|about)|не (нашл|найден|содерж|охватыва|привод)|нет (данных|информации|сведений)|табылмады|қамтымайды|жоқ/i;
export const SEARCH_OPTS = { limit: 8, maxPerDoc: 3, neighbors: true, dedupe: true, fresh: { days: 45, slots: 2, min: 0.5 } };

export function detectLanguage(text) {
  if (/[әғқңөұүһі]/i.test(text)) return 'kk';
  if (/[а-яё]/i.test(text)) return 'ru';
  return 'en';
}

const LANG_NAME = { en: 'English', ru: 'Russian', kk: 'Kazakh' };

const PLAN_SYSTEM = 'You plan searches over Almaty Air Initiative (AAI) research about air quality in Almaty, Kazakhstan. ' +
  'Reports exist in English, Russian and Kazakh. For the user question, write a short keyword search query in each ' +
  'language (key nouns, place names, pollutants, years), worded the way a report sentence that answers it would be ' +
  'written ("How many cars are there?" → "vehicles registered in the city", "зарегистрировано автомобилей в городе", ' +
  '"қалада тіркелген автокөлік"), not the way the question is asked. Leave out figures quoted in a claim to check ' +
  '("75%", "9 times"): they may be wrong. language = the language the user wrote in; use "en" for any ' +
  'language other than Russian or Kazakh. live_data lists which AAI datasets help: "city" for the air right now or today, ' +
  '"districts" for districts now, "hours" for best or worst times of day, "compare" for today versus yesterday, "history" ' +
  'also for the last 7 days or counts of good and bad days, "gases" for ' +
  'NO2/SO2/O3/CO right now, "pollen" for pollen and allergies, "cities" to compare with other cities (Bishkek, Tashkent, ' +
  'Karaganda, Kathmandu, Lahore), "history" for daily PM2.5 on past dates, months or years (worst/cleanest days, monthly ' +
  'averages), "no2_history" for past NO2. Empty if the research reports alone answer it. dates: specific days asked about ' +
  'as YYYY-MM-DD (assume the most recent past year if no year is given; today is {TODAY}). years: years asked about. ' +
  'complexity: "simple" when one report or one reading answers it (a fact, a number, a definition, a finding of one ' +
  'study, the air right now); "complex" only when the answer must compare several reports, cities or policies, or ' +
  'give recommendations. Examples: "How polluted is the air near schools in winter?" = simple; "How many cigarettes ' +
  'did a resident smoke in 2025?" = simple; "What is the air like now?" = simple; "Compare Sofia and China, what should ' +
  'Almaty do?" = complex. on_topic: true if the question is about air quality, pollution, health effects of air, ' +
  'Almaty, AAI or its research, including what causes or reduces pollution: power plants (CHP, ТЭЦ, ЖЭО), heating, ' +
  'coal and gas, transport and cars, low emission zones (LEZ), emissions, weather and city policy; false otherwise.';

const planSystem = () => PLAN_SYSTEM.replace('{TODAY}', new Date().toISOString().slice(0, 10));

const Plan = z.object({
  language: z.enum(['en', 'ru', 'kk']),
  query_en: z.string(),
  query_ru: z.string(),
  query_kk: z.string(),
  live_data: z.array(z.enum(['city', 'districts', 'hours', 'compare', 'gases', 'pollen', 'cities', 'history', 'no2_history'])),
  dates: z.array(z.string()),
  years: z.array(z.number().int()),
  complexity: z.enum(['simple', 'complex']),
  on_topic: z.boolean(),
});

const RULES = `Answer the question using ONLY the sources provided. Every factual sentence must be supported by a citation.
- Write the whole answer in {LANG}. Translate everything you take from Russian or Kazakh sources into {LANG}.
  Never copy words or phrases in another language into the answer: the original quote is shown to the reader separately.
- Keep it short: 2 to 5 sentences, plain prose, no headings, no bullet lists, no bold or other markdown.
- Start with the answer itself. Never describe what you are going to do ("I'll answer using…", "Let me…").
- Write in your own words. Do not paste the source sentences, lists or table rows into the answer; the citation
  shows them. Every sentence must be a complete, grammatical sentence of your own.
- Give each figure once. Never repeat a figure or a sentence you already wrote.
- Do not mention the language of a source (no "EN", "RU", "the Russian version").
- Quote numbers exactly as the sources give them, with units written in {LANG} (for example µg/m³).
- Every figure must say which year or date it refers to ("in 2025", "on 1 November 2026"), taken from the
  source. Each source's title ends with its publication date; if the passage does not name the year, say
  "according to AAI's <title> (<date>)".
- A figure in a report about one year (its title or opening says "in 2025", "2025 annual report") refers to that year
  even when its own sentence does not repeat the year. Use it as that year's figure; never say the sources lack it.
- When sources give the same measure for different years, lead with the most recent one and name its year.
  For the current status of a policy, project or plant (is it running, when, what changed), prefer AAI's most
  recent source, such as its written answers to the media, over older reports, and say its date.
- Read every source before answering. Never say that something is not in the sources if any source above
  contains it.
- Never invent figures, dates or sources.
- When the source names the place, school, district or plant ("School No. 156 in Alatau district"), give that name
  exactly; never say the sources do not name it.
- Figures the sources give with a caveat (an estimate, indirect, preliminary, one site) are still the answer: give them
  with that caveat. Never say the sources have no results or no figure because the figures are only estimates.
- If the sources give different figures for the same thing (two survey waves, two years, two methods, or AAI's
  sensors versus Kazhydromet), give both, say which source each comes from and why they may differ if the sources
  say so. Never silently pick one. In that case start the answer with the symbol ⚖ and a space, and never mention the
  symbol anywhere else.
- If the question asks whether a claim is true ("Is it true that…", "Правда ли…", "…рас па?"), open with a clear
  verdict in {LANG} ({VERDICT}, or AAI's research does not cover it), then give the figures that show it, and say exactly
  what the claim gets wrong or leaves out (a different place, period, measure or group).
- If live sensor data is provided and relevant, use it for "right now" questions and say it is live.
- If the sources do not answer the question, reply with exactly one sentence saying that AAI's research does not
  cover this (in {LANG}), and suggest one related topic the sources do cover. Any figure you give for that topic
  needs its citation too. Do not guess.`;

// Fact-check mode: the user pastes a claim (news, a speech, a post) and gets a verdict from the research
const FACTCHECK = `
The user message is a CLAIM to check (from the news, a speech or social media), not a question.
- Begin with exactly one verdict word in English followed by a colon: SUPPORTED, CONTRADICTED, PARTLY or NOT COVERED.
  Keep that word in English even when the rest is in {LANG}.
- SUPPORTED: the sources say the same thing. CONTRADICTED: the sources give different facts (state the correct figure).
  PARTLY: part of the claim is right and part is wrong or not in the sources. NOT COVERED: the sources do not cover it.
- Then explain in 2 to 4 sentences, with citations, what the sources say compared with the claim.`;
const VERDICTS = ['SUPPORTED', 'CONTRADICTED', 'PARTLY', 'NOT COVERED'];
// The verdict words of each language (only the answer's own language reaches the prompt: listing all three made
// English answers open with «Нет.»)
const VERDICT_WORDS = { en: '"Yes", "No", "Partly"', ru: '«Да», «Нет», «Отчасти»', kk: '«Иә», «Жоқ», «Ішінара»' };
const rules = (lang, mode) => (RULES + (mode === 'factcheck' ? FACTCHECK : '')).replaceAll('{LANG}', LANG_NAME[lang]).replaceAll('{VERDICT}', VERDICT_WORDS[lang] || VERDICT_WORDS.en);

// Answers come from the given sources, so silent thinking only adds delay: the words start streaming
// right away. Haiku 5.5 allows thinking "disabled" (at effort high or below); Sonnet 5.5 uses
// "between_tools" for the same effect. Other models keep their defaults.
function noThinking(model) {
  if (/^claude-haiku-5-5/.test(model)) return { thinking: { type: 'disabled' } };
  if (/^claude-sonnet-5-5/.test(model)) return { thinking: { type: 'between_tools' } };
  return {};
}

const addUsage = (u, x, model) => { u.input += x.input || 0; u.output += x.output || 0; u.calls.push({ model, input: x.input || 0, output: x.output || 0 }); };

// ---------- Step 1: plan (queries in 3 languages, live data needs, complexity) ----------
async function plan(provider, model, question, usage, userKey) {
  if (PROVIDERS[provider].kind === 'anthropic') {
    const res = await anthropic(userKey).messages.parse({
      model, max_tokens: 1000,
      output_config: { effort: 'low', format: zodOutputFormat(Plan) },
      ...noThinking(model),
      system: planSystem(),
      messages: [{ role: 'user', content: question }],
    });
    addUsage(usage, { input: res.usage?.input_tokens, output: res.usage?.output_tokens }, model);
    return res.parsed_output;
  }
  const { text, usage: u } = await openaiChat(provider, model,
    planSystem() + '\nReply with JSON only: {"language":"en|ru|kk","query_en":"...","query_ru":"...","query_kk":"...","live_data":[],"dates":[],"years":[],"complexity":"simple|complex","on_topic":true}',
    question, { json: true, userKey });
  addUsage(usage, u, model);
  const parsed = Plan.safeParse(JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}'));
  if (!parsed.success) throw new Error('Plan was not valid JSON');
  return parsed.data;
}

// ---------- Step 2a: Anthropic, native citations on search_result blocks ----------
async function answerAnthropic(model, question, lang, results, live, usage, userKey, onDelta, mode) {
  const blocks = [
    ...live.map(l => ({ type: 'search_result', source: l.source, title: l.title,
      content: l.blocks.map(text => ({ type: 'text', text })), citations: { enabled: true } })),
    ...results.map(r => ({ type: 'search_result', source: r.url || `AAI written answer to the media (not published online), ${r.date}`,
      title: `${r.title} (${r.page ? `page ${r.page}, ` : ''}${r.section ? `answer to question ${r.section.n}, ` : ''}${r.date})`,
      content: r.blocks.map(text => ({ type: 'text', text })), citations: { enabled: true } })),
  ];
  const meta = [...live.map(l => ({ title: l.title, url: l.source, live: true })), ...results];
  const params = {
    model, max_tokens: 2000,
    output_config: { effort: 'low' },
    ...noThinking(model),
    system: 'You are Taza Copilot, the research assistant of Almaty Air Initiative (AAI).\n' + rules(lang, mode),
    messages: [{ role: 'user', content: [...blocks, { type: 'text', text: question }] }],
  };
  // Streamed: the words reach the reader while they are written; the final message (with
  // citations) is then processed exactly as before
  let res;
  if (onDelta) {
    const stream = anthropic(userKey).messages.stream(params);
    stream.on('text', t => onDelta(t));
    res = await stream.finalMessage();
  } else {
    res = await anthropic(userKey).messages.create(params);
  }
  addUsage(usage, { input: res.usage?.input_tokens, output: res.usage?.output_tokens }, model);
  if (res.stop_reason === 'refusal') { const e = new Error('The model declined this request'); e.refusal = true; throw e; }

  return buildAnswer(res.content, meta);
}

// Turns the model's text blocks and their citations into the answer text with [n] marks and the list of
// sources. Separate from the API call so it can be tested offline (scripts/test-answer-text.mjs).
export function buildAnswer(content, meta) {
  const sources = [];
  const keyToN = new Map();
  let text = '';
  for (const block of content) {
    if (block.type !== 'text') continue;
    // Smaller models sometimes paste the source sentence into their prose. The quote is shown
    // in the source card, so remove the copy from the answer text.
    let part = block.text.replace(/(?<!\n)[ \t]*\n[ \t]*(?!\n)/g, ' ');
    const original = part;
    for (const c of block.citations || []) {
      const q = c.cited_text?.replace(/\s+/g, ' ').trim();
      if (!q) continue;
      if (q.length > 25 && part.includes(q)) { part = part.replace(q, ''); continue; }
      // Also remove pasted sentences of the quote (split on ". " followed by a capital letter or a bullet)
      for (const s of q.split(/(?<=[.!?…])\s+(?=[A-ZА-ЯЁӘҒҚҢӨҰҮҺІ"«(])|\s*[●•]\s*/)) {
        const t = s.trim();
        if (t.length > 30 && part.includes(t)) part = part.replace(t, '');
      }
    }
    // Last pass, tolerant of quote marks, dashes and spacing: drop sentences of the answer that are
    // word-for-word copies of a cited passage (but never empty the block)
    const norm = s => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    const cited = (block.citations || []).map(c => norm(c.cited_text || '')).join('|');
    if (cited) {
      // Split only where a new sentence starts with a capital, so abbreviations ("тыс. тонн", "т.е.") do not cut
      // a sentence in two and leave the claim without its end
      const sentences = part.split(/(?<=[.!?…])\s+(?=[A-ZА-ЯЁӘҒҚҢӨҰҮҺІ"«(\d])/);
      const kept = sentences.filter(s => { const n = norm(s); return n.length < 40 || !cited.includes(n); });
      if (kept.length && kept.length < sentences.length) part = kept.join(' ');
    }
    // When the claim itself is the quoted sentence (it often carries the key number), keep it:
    // removing it would leave only a citation mark with nothing to cite
    if (norm(part).length < 15 && norm(original).length >= 15) part = original;
    // The model wrote the claim in its own words without a citation, then pasted the source sentence with the
    // citation: the same figures twice. The copy goes, and its citation mark moves to the sentence before it.
    // The pasted quote starts by repeating what the answer just said ("…138 days at or below the WHO guideline
    // (138 days at or below the WHO guideline, 127 days between…"): the repeated opening goes, the new part stays
    // A sentence still open before this block ("The 2025 review adds that"): removing the block would leave it
    // broken, so a repeat is kept there (a repeated figure reads better than half a sentence)
    const open_ = DANGLING.test(text);
    if (block.citations?.length && text && !open_) {
      const open = part.match(/^\s*\(?\s*/)[0], words = part.slice(open.length).split(' ');
      const flat = text.replace(/\s+/g, ' ');
      for (let k = words.length; k >= 4; k--) {
        // a word may carry the quote's own comma ("µg/m³,") that the answer's sentence does not have
        const head = words.slice(0, k).join(' ').replace(/[,;:.]+$/, '');
        if (head.length < 25 || !flat.includes(head)) continue;
        const rest = words.slice(k).join(' ').replace(/^[\s,;:–—-]+/, '');
        // the rest would open a new sentence in lower case ("…counted. its body over one season…"): keep the quote whole
        if (rest && /^[a-zа-яёәғқңөұүһі]/.test(rest) && /[.!?…]\s*$/.test(text)) break;
        const gap = /\s$/.test(text) ? '' : ' ';
        part = rest ? gap + (open.includes('(') ? '(' : '') + rest : (open.includes('(') ? gap + '(' : '');
        break;
      }
    }
    if (block.citations?.length) {
      // Figures only: no citation marks, no years, no single digits ("1 August"), each figure counted once
      const nums = s => [...new Set((s.replace(/\[\d+\]/g, ' ').match(/\d+(?:[.,]\d+)?/g) || [])
        .map(x => x.replace(',', '.')).filter(x => !/^(19|20)\d\d$/.test(x) && !/^\d$/.test(x)))];
      const tail = text.slice(text.lastIndexOf(']') + 1);
      const mine = nums(part), before = new Set(nums(tail)), said = new Set(nums(text));
      const shared = mine.filter(x => before.has(x)).length;
      // Two or more figures the answer already gave (right before, or anywhere): a copy, not a new claim.
      // One shared figure is not enough ("23 cars exceeded CO … and 23 exceeded CH" are two facts).
      // Without figures: the same words as the sentence right before it ("No universal share exists because it depends
      // on the pollutant. It depends on the pollutant: no universal share exists.")
      const words = t => (t.toLowerCase().match(/[\p{L}]{4,}/gu) || []).map(w => w.slice(0, 6));
      const pw = [...new Set(words(part))], tw = new Set(words(tail));
      const sameWords = pw.length >= 6 && pw.filter(w => tw.has(w)).length / pw.length >= 0.75;
      const copy = sameWords || (mine.length >= 2 && (mine.every(x => said.has(x)) || (norm(tail).length >= 30 && shared >= 2 && shared / mine.length >= 0.5)));
      if (copy && !open_) {
        text = text.replace(/\s+$/, '');
        part = '';
      }
    }
    text += part.replace(/\*\*/g, '').replace(/\(\s*[,;:]?\s*\)|«\s*»|"\s*"/g, '').replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1');
    const marks = [];
    for (const c of block.citations || []) {
      if (c.type !== 'search_result_location') continue;
      const m = meta[c.search_result_index];
      if (!m) continue;
      const key = `${c.search_result_index}:${c.start_block_index}`;
      if (!keyToN.has(key)) {
        keyToN.set(key, sources.length + 1);
        sources.push({ n: sources.length + 1, quote: c.cited_text.trim(), title: m.title, url: m.url ?? null,
          page: m.page ?? null, section: m.section ?? null, kind: m.kind ?? (m.live ? 'live' : null), lang: m.lang ?? null,
          date: m.date ?? null, live: Boolean(m.live) });
      }
      const n = keyToN.get(key);
      if (!marks.includes(n)) marks.push(n);
    }
    if (marks.length) text += marks.map(n => `[${n}]`).join('');
  }
  // "emissions.[1], and" → "emissions[1], and"; a citation mark after a full stop moves before it
  text = text.replace(/\.((?:\[\d+\])+)(?=[,;:])/g, '$1').replace(/\.((?:\[\d+\])+)\./g, '.$1')
    // brackets left holding only citation marks once a pasted quote was removed: "µg/m³ ([1])" → "µg/m³[1]"
    .replace(/\s*\(\s*((?:\[\d+\])+)\s*\)/g, '$1')
    // "…41.7 µg/m³,[1] That comparison": a sentence that ended on a comma gets its full stop
    .replace(/,((?:\[\d+\])+)\s+(?=[A-ZА-ЯЁӘҒҚҢӨҰҮҺІ])/g, '.$1 ');
  // A closing sentence with no citation that only repeats figures already given ("The two counts differ: 138 days in
  // the archive and 164 in the report.") goes: the answer already said it, with its sources
  const sentences = text.split(/(?<=[.!?…])\s+(?=[A-ZА-ЯЁӘҒҚҢӨҰҮҺІ"«(])/);
  const figs = t => (t.replace(/\[\d+\]/g, ' ').match(/\d+(?:[.,]\d+)?/g) || []).map(x => x.replace(',', '.')).filter(x => !/^(19|20)\d\d$/.test(x) && !/^\d$/.test(x));
  const kept = sentences.filter((s, i) => {
    if (!i || /\[\d+\]/.test(s)) return true;
    const mine = [...new Set(figs(s))], before = new Set(figs(sentences.slice(0, i).join(' ')));
    return !(mine.length >= 2 && mine.every(x => before.has(x)));
  });
  if (kept.length < sentences.length) text = kept.join(' ');
  return { text: text.trim(), sources };
}

// ---------- Step 2b: OpenAI-format providers, numbered passages ----------
// Every passage is numbered; the model cites numbers, and we show the passage text itself,
// so the quote on screen is always the exact original sentence from the report.
async function answerOpenAI(provider, model, question, lang, results, live, usage, userKey, mode) {
  const passages = [];
  for (const l of live) for (const b of l.blocks) passages.push({ text: b, title: l.title, url: l.source, live: true });
  for (const r of results) for (const b of r.blocks) passages.push({ text: b, title: r.title, url: r.url, page: r.page, section: r.section, kind: r.kind, lang: r.lang, date: r.date });
  const listing = passages.map((p, i) => `[${i + 1}] (${p.title}${p.page ? `, page ${p.page}` : ''}${p.section ? `, answer to question ${p.section.n}` : ''}${p.date ? `, ${p.date}` : ''}) ${p.text}`).join('\n');
  const system = 'You are Taza Copilot, the research assistant of Almaty Air Initiative (AAI).\n' +
    rules(lang, mode) +
    '\n- The sources are numbered passages. After each sentence, cite the passage numbers you used in square brackets, ' +
    'e.g. [4] or [4][9]. Only use numbers from the list. Do not add a source list at the end.';
  const { text: raw, usage: u } = await openaiChat(provider, model, system, `SOURCES:\n${listing}\n\nQUESTION: ${question}`, { userKey });
  addUsage(usage, u, model);

  const sources = [];
  const map = new Map();
  const text = raw.replace(/\[(\d{1,3})\]/g, (whole, num) => {
    const p = passages[Number(num) - 1];
    if (!p) return '';
    if (!map.has(num)) {
      map.set(num, sources.length + 1);
      sources.push({ n: sources.length + 1, quote: p.text, title: p.title, url: p.url ?? null, page: p.page ?? null,
        section: p.section ?? null, kind: p.kind ?? (p.live ? 'live' : null), lang: p.lang ?? null, date: p.date ?? null, live: Boolean(p.live) });
    }
    return `[${map.get(num)}]`;
  }).replace(/\n*(sources|источники|дереккөздер)\s*:[\s\S]*$/i, '').trim();
  return { text, sources };
}

// ---------- Fallback without any AI: best sentence from each top page ----------
function extractive(question, results) {
  const q = new Set(tokenize(question));
  const sources = results.slice(0, 3).map((r, i) => {
    const best = r.blocks.map(b => [b, tokenize(b).filter(t => q.has(t)).length]).sort((a, b) => b[1] - a[1])[0][0];
    return { n: i + 1, quote: best, title: r.title, url: r.url ?? null, page: r.page, section: r.section ?? null, kind: r.kind ?? null, lang: r.lang, date: r.date, live: false };
  });
  return { text: 'Demo mode (no AI provider connected): here are the most relevant passages from AAI research.', sources };
}

// onEvent (optional) receives progress: { type: 'stage', stage: 'search'|'write' }, { type: 'delta', text },
// and { type: 'reset' } when a second, stronger attempt replaces the first one
export async function ask(index, question, { provider = 'anthropic', model, userKey, onEvent, mode = 'answer' } = {}) {
  const emit = e => { try { onEvent?.(e); } catch {} };
  const onDelta = onEvent ? text => emit({ type: 'delta', text }) : undefined;
  const t0 = Date.now();
  const usage = { input: 0, output: 0, calls: [] };
  const timing = { plan: 0 };
  const p = PROVIDERS[provider] || PROVIDERS.anthropic;
  const ready = await isReady(provider, userKey);
  model = model || p.model();
  const useAi = ready && Boolean(model);
  const auto = p.kind === 'anthropic' && model === 'auto';
  let route = null;

  let lang = detectLanguage(question);
  let queries = [question];
  let liveTopics = [];
  let complexity = 'simple';
  let onTopic = true;
  let dates = [], years = [];
  if (useAi) {
    try {
      const tp = Date.now();
      const pl = await plan(provider, auto ? FAST : model, question, usage, userKey);
      timing.plan = Date.now() - tp;
      emit({ type: 'stage', stage: 'search' });
      // The script decides for Russian and Kazakh (the planner sometimes mislabels them); the planner only for the rest
      lang = detectLanguage(question) !== 'en' ? detectLanguage(question) : pl.language;
      queries = [question, pl.query_en, pl.query_ru, pl.query_kk];
      // "What did the zone achieve?": reports write results as reductions ("fell from 20,000 to 1,300", "снижение на 88%"),
      // so those words join each query; otherwise the pages that describe the policy outrank the ones with its results
      if (OUTCOME.test(question)) queries = [question, `${pl.query_en} reduction decreased fell`, `${pl.query_ru} снижение сократилось`, `${pl.query_kk} азайды төмендеді`];
      if (process.env.TAZA_DEBUG) console.log("[plan]", JSON.stringify(queries));
      liveTopics = pl.live_data;
      complexity = pl.complexity;
      onTopic = pl.on_topic;
      dates = (pl.dates || []).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 5);
      years = (pl.years || []).slice(0, 3);
    } catch (err) {
      console.warn(`Planning with ${provider} failed, searching with the raw question:`, err.message);
    }
  }

  // Safety net for the planner: words like "now" or "district" always bring in live data
  const ql = question.toLowerCase();
  if (/\b(now|today|right now|currently|tonight)\b|сейчас|сегодня|қазір|бүгін/.test(ql) && !liveTopics.includes('city')) liveTopics.push('city');
  if (/district|район|аудан/.test(ql) && /now|today|сейчас|сегодня|қазір|бүгін/.test(ql) && !liveTopics.includes('districts')) liveTopics.push('districts');
  if (/yesterday|вчера|кеше/.test(ql) && !liveTopics.includes('compare')) liveTopics.push('compare');
  // "How many sensors does AAI have?": the live network says how many sensors report right now
  if (/sensor|датчик|сенсор|датчиктер/.test(ql) && !liveTopics.includes('city')) liveTopics.push('city');
  if (dates.length && !liveTopics.includes('history') && !liveTopics.includes('no2_history')) liveTopics.push('history');

  const ts = Date.now();
  // Neighbouring passages come along with each hit, and AAI's newest material (last 45 days) gets two extra
  // slots, so a figure printed right after the matched sentence, or AAI's latest position, is not missed
  const results = search(index, queries, SEARCH_OPTS);
  if (process.env.TAZA_DEBUG) console.log('[search]', results.map(r => `${r.id}${/776|37[.,]1|797|20[ ,.]?000|88s?%|10[–-]13/.test(r.blocks.join(' ')) ? '*' : ''}`).join(' '));
  timing.search = Date.now() - ts;
  // The planner can misjudge a question as off-topic (a power plant, a law); strong matches in AAI's research overrule it
  const relevant = onTopic || ON_TOPIC_WORDS.test(question);
  // Live and archive data come from the server's warm cache, so this adds almost no time
  const live = useAi && hasAaiKey() && liveTopics.length ? await liveContext(liveTopics, { dates, years }) : [];

  timing.live = Date.now() - ts - timing.search;
  emit({ type: 'stage', stage: 'write' });
  const ta = Date.now();
  let out;
  try {
  if (!useAi) out = extractive(question, results);
  else if (p.kind !== 'anthropic') out = await answerOpenAI(provider, model, question, lang, results, live, usage, userKey, mode);
  else if (!auto) {
    out = await answerAnthropic(model, question, lang, results, live, usage, userKey, onDelta, mode);
    // A fixed model sometimes forgets its citations: one retry with the same model
    if (relevant && !out.sources.length && results.length) {
      route = 'retried: the first answer had no source';
      emit({ type: 'reset' });
      out = await answerAnthropic(model, question, lang, results, live, usage, userKey, onDelta, mode);
      // Still no source on the fast model: the stronger model, once. An answer is never shown without its source.
      if (!out.sources.length && model === FAST) {
        model = STRONG; route = 'escalated: the fast model gave no source twice';
        emit({ type: 'reset' });
        out = await answerAnthropic(model, question, lang, results, live, usage, userKey, onDelta, mode);
      }
    } else if (model === FAST && relevant && results.length && mode === 'answer' && NOT_FOUND.test(out.text.slice(0, 220))) {
      // The fast model says the research does not cover it: the stronger model reads the same sources once more
      model = STRONG; route = 'escalated: the fast model found no answer';
      emit({ type: 'reset' });
      out = await answerAnthropic(model, question, lang, results, live, usage, userKey, onDelta, mode);
    }
  }
  else {
    // Auto: simple questions go to the fast model; complex ones, Russian and Kazakh ones (the fast model
    // tends to copy source wording in those languages), or a fast answer that found no citation go to
    // the stronger model.
    const strong = relevant && (complexity === 'complex' || lang === 'ru' || lang === 'kk');
    model = strong ? STRONG : FAST;
    route = !relevant ? 'off-topic question' : complexity === 'complex' ? 'complex question'
      : lang === 'ru' ? 'Russian question' : lang === 'kk' ? 'Kazakh question' : 'simple question';
    try {
      out = await answerAnthropic(model, question, lang, results, live, usage, userKey, onDelta, mode);
      if (model === FAST && relevant && !out.sources.length && results.length) {
        model = STRONG; route = 'escalated: no source found by the fast model';
        emit({ type: 'reset' });
        out = await answerAnthropic(model, question, lang, results, live, usage, userKey, onDelta, mode);
      } else if (model === FAST && relevant && results.length && mode === 'answer' && NOT_FOUND.test(out.text.slice(0, 220))) {
        // The fast model says the research does not cover it: the stronger model reads the same sources once more
        model = STRONG; route = 'escalated: the fast model found no answer';
        emit({ type: 'reset' });
        out = await answerAnthropic(model, question, lang, results, live, usage, userKey, onDelta, mode);
      } else if (model === FAST && lang === 'en' && (/[а-яёәғқңөұүһі]{4,}/i.test(out.text) || wrongScript(lang, out.text))) {
        // The fast model pasted Russian or Kazakh source wording into an English answer: the stronger model translates
        model = STRONG; route = 'escalated: the fast model copied source wording in another language';
        emit({ type: 'reset' });
        out = await answerAnthropic(model, question, lang, results, live, usage, userKey, onDelta, mode);
      }
      // The stronger model also forgets its citations now and then (mostly on "not covered" answers that still
      // give a related figure): one more try, so an answer with figures is never shown without its source
      if (model === STRONG && relevant && mode === 'answer' && !out.sources.length && results.length) {
        route = `${route}; retried: the answer had no source`;
        emit({ type: 'reset' });
        out = await answerAnthropic(model, question, lang, results, live, usage, userKey, onDelta, mode);
      }
      // Words copied from a source in another language (a Kazakh sentence in a Russian answer, Russian in an
      // English one): one more try on the stronger model
      if (model === STRONG && relevant && wrongScript(lang, out.text)) {
        route = `${route}; retried: words in another language`;
        emit({ type: 'reset' });
        out = await answerAnthropic(model, question, lang, results, live, usage, userKey, onDelta, mode);
      }
    } catch (err) {
      if (!err.refusal || model === FAST) throw err;
      model = FAST; route = 'fallback after the strong model declined';
      emit({ type: 'reset' });
      out = await answerAnthropic(model, question, lang, results, live, usage, userKey, onDelta, mode);
    }
  }

  } catch (err) {
    // Report what was already spent (planning, a first attempt) so the server can count it
    const parts = usage.calls.map(c => costUsd(provider, c.model, c));
    err.cost_usd = parts.some(x => x == null) ? null : parts.reduce((x, y) => x + y, 0);
    throw err;
  }

  // Fact-check: the verdict word opens the answer; it becomes its own field and leaves the text
  let verdict = null;
  if (mode === 'factcheck') {
    const m = out.text.match(/^\s*(SUPPORTED|CONTRADICTED|PARTLY|NOT COVERED)\s*[:：.\-–—]?\s*/i);
    if (m) { verdict = m[1].toUpperCase(); out.text = out.text.slice(m[0].length); }
    if (!VERDICTS.includes(verdict)) verdict = out.sources.length ? null : 'NOT COVERED';
  }

  // Sources that disagree on a figure: the ⚖ mark becomes a flag the page shows as a badge
  let sourcesDiffer = false;
  const mark = out.text.match(/^\s*(?:(SUPPORTED|CONTRADICTED|PARTLY|NOT COVERED)\s*[:：.\-–—]?\s*)?⚖️?\s*/i);
  if (mark) { sourcesDiffer = true; out.text = out.text.replace(/⚖️?\s*/, ''); }
  // The mark written inside a sentence ("so I'm flagging this with ⚖"): drop the whole clause, keep the badge
  if (/⚖/.test(out.text)) {
    sourcesDiffer = true;
    out.text = out.text
      .replace(/[,;]?\s*(?:(?:so|and|hence)\s+)?(?:I'?m|I am|I have|I've|I)\s+(?:flagg|mark|label)\w*\s+(?:this|it|the answer)\s+(?:with|using)\s+(?:the\s+)?(?:symbol\s+)?\(?⚖️?\)?/gi, '')
      .replace(/\(\s*⚖️?\s*\)/g, '');
  }
  out.text = out.text.replace(/\s*⚖️?\s*/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();

  // English answers: Russian units and decimal commas copied from the sources become English ones
  if (lang === 'en') {
    out.text = out.text
      .replace(/мкг\s*\/\s*м\s*[³3]/g, 'µg/m³')
      .replace(/(\d+),(\d+)(?=\s*(?:µg|%|times|x\b))/g, '$1.$2');
  }

  return {
    question, lang, ...out,
    found: out.sources.length > 0,
    mode: useAi ? 'ai' : 'demo',
    provider: useAi ? provider : null,
    provider_label: useAi ? p.label : null,
    model: useAi ? model : null,
    auto, route, complexity, on_topic: relevant,
    // "kind" (answer or factcheck), not "mode": "mode" above already says whether an AI answered ("ai") or not
    kind: mode, verdict, sources_differ: sourcesDiffer,
    own_key: Boolean(userKey),
    ms: Date.now() - t0,
    timing: { ...timing, answer: Date.now() - ta },
    tokens: { input: usage.input, output: usage.output },
    // Each call is priced at its own model (planning runs on the fast model in auto mode)
    cost_usd: !useAi ? 0 : (() => {
      const parts = usage.calls.map(c => costUsd(provider, c.model, c));
      return parts.some(x => x == null) ? null : +parts.reduce((a, b) => a + b, 0).toFixed(5);
    })(),
    searched: results.map(r => ({ title: r.title, page: r.page, lang: r.lang, score: r.score })),
  };
}

// ---------- Small helper jobs on the fast model (cheap, structured output) ----------
async function quickJob(system, user, schema, maxTokens = 1500) {
  const res = await anthropic().messages.parse({
    model: FAST, max_tokens: maxTokens,
    output_config: { effort: 'low', format: zodOutputFormat(schema) },
    ...noThinking(FAST),
    system, messages: [{ role: 'user', content: user }],
  });
  const cost = costUsd('anthropic', FAST, { input: res.usage?.input_tokens || 0, output: res.usage?.output_tokens || 0 });
  return { data: res.parsed_output, cost_usd: cost };
}

// Research gaps: questions AAI's research could not answer, grouped into topics for the AAI team
const Gaps = z.object({ topics: z.array(z.object({
  name_en: z.string(), name_ru: z.string(), name_kk: z.string(), question_ids: z.array(z.number().int()),
})) });
export async function groupGaps(questions) {
  const list = questions.slice(0, 150).map((q, i) => `${i}. ${q}`).join('\n');
  const { data, cost_usd } = await quickJob(
    'You help Almaty Air Initiative (AAI) plan research. Below are questions people asked that AAI\'s research could not answer. ' +
    'Group them into at most 8 topics a researcher could study (for example "Coal heating in private houses"). Each topic: a short ' +
    'name (2 to 6 words) in English, Russian and Kazakh, and the ids of its questions. Every id goes in exactly one topic. ' +
    'Skip questions that are not about air, pollution, health or the environment.',
    list, Gaps);
  const topics = data.topics
    .map(t => ({ name: { en: t.name_en, ru: t.name_ru, kk: t.name_kk }, ids: [...new Set(t.question_ids)].filter(i => i >= 0 && i < questions.length) }))
    .filter(t => t.ids.length)
    .map(t => ({ name: t.name, count: t.ids.length, examples: t.ids.slice(0, 3).map(i => questions[i]) }))
    .sort((a, b) => b.count - a.count);
  return { topics, cost_usd };
}

// New research uploaded by AAI: a 5-point summary in English, Russian and Kazakh (Telegram, admin page)
const Summary = z.object({ en: z.array(z.string()), ru: z.array(z.string()), kk: z.array(z.string()) });
export async function summarizeResearch(title, text) {
  const { data, cost_usd } = await quickJob(
    'You summarise a new research report by Almaty Air Initiative (AAI) for the public. Write exactly 5 short bullet points ' +
    '(one sentence each, at most 25 words) with the key findings, using the report\'s own numbers exactly as written. No ' +
    'opinions, nothing that is not in the text. Give the same 5 points in English (en), Russian (ru) and Kazakh (kk).',
    `Title: ${title}\n\n${text.replace(/\s+/g, ' ').slice(0, 15000)}`, Summary, 2500);
  const five = a => (a || []).map(s => String(s).trim()).filter(Boolean).slice(0, 5);
  return { summary: { en: five(data.en), ru: five(data.ru), kk: five(data.kk) }, cost_usd };
}
