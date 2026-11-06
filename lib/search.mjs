// BM25 search over the AAI research chunks. Works across English, Russian and Kazakh:
// the caller passes several queries (the same question in each language) and the scores are merged.
import { readFileSync } from 'node:fs';
import { docKey } from './library.mjs';

const STOP = new Set(('the a an and or of in on at to for is are was were be by with from that this it as what how why which who when ' +
  'do does did can could about into than then there their its our your near over under not no yes ' +
  'и в во на с со по к ко у о об от до за из для что как это то так же ли не ни а но или при над под также ' +
  'бы был была были быть есть его ее их мы вы он она они чем где когда какой какая какие который которая которые ' +
  'және мен бен пен да де та те үшін бұл осы ол олар қалай неге қандай деп еді бар жоқ сол').split(/\s+/));

// Light stemming: keep the first 6 letters of long words. Crude, but it joins
// "школ", "школы", "школах" or "pollution", "polluted" without a language-specific stemmer.
// Short Cyrillic words also lose their vowel ending, so "штраф" finds "штрафы" and "въезд" finds "въезда" (a Kazakh
// question about LEZ fines missed the only passage that says "no fines this year").
const stem = w => (w.length > 6 ? w.slice(0, 6) : w.length >= 5 && /^[а-яё]+$/.test(w) ? w.replace(/[аеиоуыэюяй]+$/, '') : w);

export function tokenize(text) {
  // "ТЭЦ-2", "CHP-3", "PM2.5": the number is part of the name, so it also becomes one token ("тэц2"),
  // otherwise ТЭЦ-2 and ТЭЦ-3 would look the same to the search
  const t = text.toLowerCase().normalize('NFC').replace(/(\p{L}+)[-‑–]?(\d+)/gu, '$1$2 $1 $2');
  return (t.match(/[\p{L}\p{N}]+/gu) || [])
    .filter(w => w.length > 1 && !STOP.has(w))
    // one name for the power plants in every language (ЖЭО in Kazakh, ТЭЦ in Russian, CHP or TPP in English), so a
    // Kazakh "ЖЭО-2" query also finds the Russian "ТЭЦ-2" answer
    .map(w => w.replace(/^(жэо|chp|tpp|zheo)(?=\d*$)/, 'тэц'))
    .map(stem)
    // heart diseases: the Ministry's figures say "системы кровообращения" (circulatory system), people ask about
    // "болезни сердца", "сердечно-сосудистые", "heart", "жүрек": one token for all of them
    .map(w => (/^(сердеч|сердц|heart|cardio|circul|кровоо|жүрек)/.test(w) ? 'кровоо' : w));
}

// extra: more docs and chunks layered on top (research uploaded from the admin page, pages added from air.org.kz)
// hidden: keys (docKey) of documents the AAI team hid from answers on the admin page
export function loadIndex(path, extra = null, hidden = null) {
  let { docs, chunks } = JSON.parse(readFileSync(path, 'utf8'));
  if (extra) { docs = [...docs, ...extra.docs]; chunks = [...chunks, ...extra.chunks]; }
  if (hidden?.size) {
    const out = new Set(docs.filter(d => hidden.has(docKey(d))).map(d => d.id));
    docs = docs.filter(d => !out.has(d.id)); chunks = chunks.filter(c => !out.has(c.doc));
  }
  const docById = Object.fromEntries(docs.map(d => [d.id, d]));
  // Neighbours: a passage is often cut where the topic is named in the previous passage ("LEZ …" | "It has
  // run since 28 April in technical mode"). Each passage is therefore also matched on the last block of the
  // passage before it and the first block of the one after it, from the same document.
  const order = new Map();
  chunks.forEach((c, i) => { if (!order.has(c.doc)) order.set(c.doc, []); order.get(c.doc).push(i); });
  const prevOf = new Map(), nextOf = new Map();
  for (const list of order.values()) list.forEach((ci, k) => { if (k) prevOf.set(chunks[ci], chunks[list[k - 1]]); if (k < list.length - 1) nextOf.set(chunks[ci], chunks[list[k + 1]]); });
  const df = new Map();
  const items = chunks.map(c => {
    // A media answer is also found by the journalist's question it answers ("…measures such as the LEZ?"): the answer
    // itself often says only "The zone has run since 28 April"
    const tokens = tokenize(c.title + ' ' + (c.section?.q || '') + ' ' + c.blocks.join(' '));
    const edge = tokenize([prevOf.get(c)?.blocks.at(-1), nextOf.get(c)?.blocks[0]].filter(Boolean).join(' '));
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    for (const t of edge) tf.set(t, (tf.get(t) || 0) + 0.5); // neighbours count half
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    return { chunk: c, tf, len: tokens.length + edge.length * 0.5, tokens };
  });
  const avgLen = items.reduce((s, i) => s + i.len, 0) / items.length;
  return { docs, docById, items, df, avgLen, N: items.length, prevOf, nextOf };
}

// A bare number (not a year) counts half: a claim to check often carries a wrong figure ("75% from coal"), and a
// report that happens to print that number for something else ("70-75% of capacity") must not outrank the real answer
const NUM_W = 0.5;
// Month names (as stemmed tokens) in English, Russian and Kazakh
const MONTH = /^(januar|februa|march|april|may|june|july|august|septem|octobe|novemb|decemb|январ|феврал|март|апрел|май|мая|июн|июл|август|сентяб|октябр|ноябр|декабр|қаңтар|ақпан|наурыз|сәуір|мамыр|маусым|шілде|тамыз|қыркүй|қазан|қараша|желтоқ)/;
function bm25(index, query, k1 = 1.2, b = 0.75) {
  const ordered = tokenize(query);
  const terms = [...new Set(ordered)];
  const scores = new Map();
  const idfOf = t => { const n = index.df.get(t); return n ? Math.log(1 + (index.N - n + 0.5) / (n + 0.5)) : 0; };
  for (const t of terms) {
    const n = index.df.get(t);
    if (!n) continue;
    const idf = idfOf(t) * (/^\d+$/.test(t) && !/^(19|20)\d\d$/.test(t) ? NUM_W : 1);
    for (const item of index.items) {
      const f = item.tf.get(t);
      if (!f) continue;
      const s = idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * item.len / index.avgLen));
      scores.set(item, (scores.get(item) || 0) + s);
    }
  }
  // Phrase bonus: among the best 60 candidates, a passage that has two query words side by side
  // ("December 2025", "road dust") is a closer match than one with the same words far apart
  const pairs = [];
  for (let i = 1; i < ordered.length; i++) if (ordered[i] !== ordered[i - 1]) pairs.push([ordered[i - 1], ordered[i]]);
  if (pairs.length) {
    const top = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60);
    for (const [item, s] of top) {
      let bonus = 0;
      for (const [a, b2] of pairs) {
        if (!item.tf.has(a) || !item.tf.has(b2)) continue;
        const tk = item.tokens;
        // a month next to its year ("December 2025", "декабрь 2025") names the exact period asked about: it counts
        // three times, so the passage on that month outranks the same report's general pages
        const w = MONTH.test(a) && /^20\d\d$/.test(b2) ? 1.5 : 0.5;
        for (let j = 1; j < tk.length; j++) if (tk[j] === b2 && tk[j - 1] === a) { bonus += w * (idfOf(a) + idfOf(b2)); break; }
      }
      if (bonus) scores.set(item, s + bonus);
    }
  }
  return scores;
}

// The figures of a passage (two characters or more, decimal commas as points, no years: every page has those), to spot the same passage in another language
const figures = t => new Set((t.match(/\d+(?:[.,]\d+)?/g) || []).map(x => x.replace(',', '.')).filter(x => x.length > 1 && !/^(19|20)\d\d$/.test(x)));

// Kazakh letters → kk, other Cyrillic → ru, the rest → en (only used to group the queries by language)
const scriptOf = q => /[әғқңөұүһі]/i.test(q) ? 'kk' : /[а-яё]/i.test(q) ? 'ru' : 'en';

// Search with several queries; each query's scores are normalised to its best hit, then summed,
// so a strong match in any one language counts.
// neighbours: a hit from an article, a media answer or a law (not a PDF page, which has its own page
// number) also brings the passage that follows it, and the last block of the one before it, so a figure
// that comes right after the matched sentence ("…95% ready." | "Emissions fall from 37.1 to 2.7 thousand t")
// reaches the answer too.
// fresh: extra slots for AAI's most recent material (dated within `days`), when it is a reasonable match
// (at least `min` of the best score). On a topic with many older reports (LEZ, CHP), AAI's latest
// position would otherwise rank below a dozen older passages and never reach the answer.
export function search(index, queries, { limit = 8, maxPerDoc = 3, neighbors = false, fresh = null, dedupe = false } = {}) {
  // One vote per language: the question and the planner's query in the same language are near copies,
  // so they share a vote (the better of the two counts). Otherwise the question's language votes twice and
  // a passage that exists in only one other language (a media answer in Russian) can never reach the top.
  const byLang = new Map();
  for (const q of queries.filter(Boolean)) {
    const scores = bm25(index, q);
    const best = Math.max(0, ...scores.values());
    if (!best) continue;
    const lang = scriptOf(q);
    if (!byLang.has(lang)) byLang.set(lang, new Map());
    const vote = byLang.get(lang);
    for (const [item, s] of scores) vote.set(item, Math.max(vote.get(item) || 0, s / best));
  }
  const total = new Map();
  for (const vote of byLang.values()) for (const [item, s] of vote) total.set(item, (total.get(item) || 0) + s);
  const ranked = [...total.entries()].sort((a, b) => b[1] - a[1]);
  const perDoc = new Map();
  const out = [], taken = new Set();
  const take = (item, score) => {
    const c = item.chunk, d = c.doc;
    perDoc.set(d, (perDoc.get(d) || 0) + 1);
    taken.add(c);
    let blocks = c.blocks;
    if (neighbors && c.kind !== 'report') {
      const prev = index.prevOf?.get(c), next = index.nextOf?.get(c);
      // media answers are short passages: the whole previous one comes along; elsewhere its last block
      if (prev && !taken.has(prev)) blocks = c.kind === 'press' ? [...prev.blocks, ...blocks] : [prev.blocks.at(-1), ...blocks];
      if (next && !taken.has(next)) { blocks = [...blocks, ...next.blocks]; taken.add(next); }
    }
    out.push({ ...c, blocks, score: +score.toFixed(3) });
    // the passage's own figures only: its neighbours' blocks would also hold part of the next candidate, which
    // then looked like a copy and was dropped (the 776-cigarettes passage, right before a taken one)
    if (dedupe) seen.push(figures(c.blocks.join(' ')));
  };
  // dedupe: the same passage in another language (or the PDF of a web article) carries the same figures. Once one
  // copy is in, the others would only take the slots of new information (a figure ranked ninth never reached the
  // answer while three translations of one page were in). A passage counts as a copy when at least four of its
  // figures, and 70% of them, are already in a passage taken before it.
  const seen = [];
  const copy = c => {
    if (!dedupe) return false;
    const mine = figures(c.blocks.join(' '));
    return mine.size >= 4 && seen.some(s => { let n = 0; for (const x of mine) if (s.has(x)) n++; return n >= 4 && n / mine.size >= 0.7; });
  };
  for (const [item, score] of ranked) {
    if (taken.has(item.chunk) || (perDoc.get(item.chunk.doc) || 0) >= maxPerDoc || copy(item.chunk)) continue;
    take(item, score);
    if (out.length >= limit) break;
  }
  if (fresh && ranked.length) {
    const since = new Date(Date.now() - fresh.days * 864e5).toISOString().slice(0, 10), floor = ranked[0][1] * fresh.min;
    let added = 0;
    for (const [item, score] of ranked) {
      if (added >= fresh.slots || score < floor) break;
      const c = item.chunk;
      if (taken.has(c) || !c.date || c.date < since || (perDoc.get(c.doc) || 0) >= maxPerDoc || copy(c)) continue;
      take(item, score); added++;
    }
  }
  return out;
}
