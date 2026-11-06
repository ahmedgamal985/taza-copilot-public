// BM25 search over the AAI research chunks. Works across English, Russian and Kazakh:
// the caller passes several queries (the same question in each language) and the scores are merged.
import { readFileSync } from 'node:fs';

const STOP = new Set(('the a an and or of in on at to for is are was were be by with from that this it as what how why which who when ' +
  'do does did can could about into than then there their its our your near over under not no yes ' +
  'и в во на с со по к ко у о об от до за из для что как это то так же ли не ни а но или при над под также ' +
  'бы был была были быть есть его ее их мы вы он она они чем где когда какой какая какие который которая которые ' +
  'және мен бен пен да де та те үшін бұл осы ол олар қалай неге қандай деп еді бар жоқ сол').split(/\s+/));

// Light stemming: keep the first 6 letters of long words. Crude, but it joins
// "школ", "школы", "школах" or "pollution", "polluted" without a language-specific stemmer.
const stem = w => (w.length > 6 ? w.slice(0, 6) : w);

export function tokenize(text) {
  return (text.toLowerCase().normalize('NFC').match(/[\p{L}\p{N}]+/gu) || [])
    .filter(w => w.length > 1 && !STOP.has(w))
    .map(stem);
}

// extra: more docs and chunks layered on top (research uploaded from the admin page)
export function loadIndex(path, extra = null) {
  let { docs, chunks } = JSON.parse(readFileSync(path, 'utf8'));
  if (extra) { docs = [...docs, ...extra.docs]; chunks = [...chunks, ...extra.chunks]; }
  const docById = Object.fromEntries(docs.map(d => [d.id, d]));
  const df = new Map();
  const items = chunks.map(c => {
    const tokens = tokenize(c.title + ' ' + c.blocks.join(' '));
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    return { chunk: c, tf, len: tokens.length, tokens };
  });
  const avgLen = items.reduce((s, i) => s + i.len, 0) / items.length;
  return { docs, docById, items, df, avgLen, N: items.length };
}

function bm25(index, query, k1 = 1.2, b = 0.75) {
  const ordered = tokenize(query);
  const terms = [...new Set(ordered)];
  const scores = new Map();
  const idfOf = t => { const n = index.df.get(t); return n ? Math.log(1 + (index.N - n + 0.5) / (n + 0.5)) : 0; };
  for (const t of terms) {
    const n = index.df.get(t);
    if (!n) continue;
    const idf = idfOf(t);
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
        for (let j = 1; j < tk.length; j++) if (tk[j] === b2 && tk[j - 1] === a) { bonus += 0.5 * (idfOf(a) + idfOf(b2)); break; }
      }
      if (bonus) scores.set(item, s + bonus);
    }
  }
  return scores;
}

// Search with several queries; each query's scores are normalised to its best hit, then summed,
// so a strong match in any one language counts.
export function search(index, queries, { limit = 8, maxPerDoc = 3 } = {}) {
  const total = new Map();
  for (const q of queries.filter(Boolean)) {
    const scores = bm25(index, q);
    const best = Math.max(0, ...scores.values());
    if (!best) continue;
    for (const [item, s] of scores) total.set(item, (total.get(item) || 0) + s / best);
  }
  const ranked = [...total.entries()].sort((a, b) => b[1] - a[1]);
  const perDoc = new Map();
  const out = [];
  for (const [item, score] of ranked) {
    const d = item.chunk.doc;
    if ((perDoc.get(d) || 0) >= maxPerDoc) continue;
    perDoc.set(d, (perDoc.get(d) || 0) + 1);
    out.push({ ...item.chunk, score: +score.toFixed(3) });
    if (out.length >= limit) break;
  }
  return out;
}
