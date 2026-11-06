// The research library the AAI team controls from the admin page, without a developer:
// - New pages on air.org.kz (research, external research, legislation) are found through the site's WordPress
//   API once a day (or at once with "Check now"), read, split into citable passages and added to the search.
// - Any source (built-in, uploaded or added automatically) can be hidden from answers and shown again.
// State lives in data/library.json (saved to R2 like the other data files).
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { toBlocks } from './blocks.mjs';
import { decode, pageText } from './webtext.mjs';

const SITE = 'https://air.org.kz';
const TYPES = { research: 'article', external_research: 'article', actual_legislation: 'legislation' };
const MAX_NEW = 20;                 // pages added per check at most (the rest come the next time)
const DAY = 24 * 3600_000;

// One key per document, the same for the built-in index, uploads and added pages
export const normUrl = u => { let x = String(u || ''); try { x = decodeURI(x); } catch {} return x.toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, ''); };
export const docKey = d => (d.url ? `url:${normUrl(d.url)}` : `title:${d.title}`);
const langOf = link => (/\/en\//.test(link) ? 'en' : /\/kk\//.test(link) ? 'kk' : 'ru');
const plain = html => decode(String(html || '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

export function createLibrary(file) {
  const empty = () => ({ auto: { enabled: true, last_run: null, last_status: null, last_added: 0 }, added: [], hidden: [], same: [] });
  let state;
  try { state = { ...empty(), ...JSON.parse(readFileSync(file, 'utf8')) }; } catch { state = empty(); }
  const save = () => { writeFileSync(file + '.tmp', JSON.stringify(state)); renameSync(file + '.tmp', file); };
  let running = null;

  // Docs and chunks of the pages added automatically, in the shape of data/chunks.json
  function corpus() {
    return { docs: state.added.map(a => a.doc), chunks: state.added.flatMap(a => a.chunks) };
  }
  const hidden = () => new Set(state.hidden);

  // Reads one page and turns it into a document with passages of about 8 blocks (like scripts/build-index.mjs)
  async function readPage(item, type) {
    const res = await fetch(item.link, { headers: { 'User-Agent': 'Mozilla/5.0 (Taza Copilot research library)' }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`${res.status}`);
    const title = plain(item.title?.rendered) || item.link;
    const text = pageText(await res.text()).replace(title, '').replace(/^\s*\d{1,2} \S+ \d{4}\s*$/m, '').trim();
    if (text.length < 400) return null; // an empty or tiny page is not research
    const blocks = toBlocks(text);
    if (!blocks.length) return null;
    const id = `auto-${createHash('sha256').update(normUrl(item.link)).digest('hex').slice(0, 10)}`;
    const kind = TYPES[type], lang = langOf(item.link), date = String(item.date || '').slice(0, 10), url = encodeURI(decodeURI(item.link));
    const doc = { id, title, lang, date, url, kind, auto: true };
    const chunks = [];
    for (let i = 0; i < blocks.length; i += 8) chunks.push({ id: `${id}-${i / 8 + 1}`, doc: id, title, lang, date, kind, page: null, url, blocks: blocks.slice(i, i + 8) });
    return { doc, chunks, type, found_at: new Date().toISOString() };
  }

  // Checks air.org.kz for pages that are in no source yet. knownKeys: keys of every document already indexed;
  // isDuplicate(blocks): true when the page's text is already indexed under another address (the same report as a
  // PDF, or a page the index skipped as a copy). Such pages are remembered in `same` and not read again.
  function check(knownKeys, isDuplicate = () => false) {
    if (running) return running;
    running = (async () => {
      const known = new Set([...knownKeys, ...state.added.map(a => docKey(a.doc)), ...(state.same || [])]);
      const added = [], errors = [];
      let seen = 0, duplicates = 0;
      for (const type of Object.keys(TYPES)) {
        let list;
        try {
          const res = await fetch(`${SITE}/wp-json/wp/v2/${type}?per_page=50&orderby=date&order=desc&_fields=link,date,title`,
            { headers: { 'User-Agent': 'Mozilla/5.0 (Taza Copilot research library)' }, signal: AbortSignal.timeout(20_000) });
          if (!res.ok) throw new Error(`${type}: ${res.status}`);
          list = await res.json();
        } catch (err) { errors.push(err.message); continue; }
        for (const item of Array.isArray(list) ? list : []) {
          if (!item?.link || !String(item.link).startsWith(SITE)) continue;
          seen++;
          const key = `url:${normUrl(item.link)}`;
          if (known.has(key) || added.length >= MAX_NEW) continue;
          try {
            const page = await readPage(item, type);
            if (page && isDuplicate(page.chunks[0].blocks)) { duplicates++; known.add(key); (state.same ||= []).push(key); }
            else if (page) { added.push(page); known.add(key); }
          } catch (err) { errors.push(`${item.link}: ${err.message}`); }
        }
      }
      state.added.push(...added);
      state.auto.last_run = new Date().toISOString();
      state.auto.last_added = added.length;
      state.auto.last_status = errors.length && !seen ? 'failed' : errors.length ? 'partly' : 'ok';
      state.auto.last_error = errors.slice(0, 3).join(' · ') || null;
      state.auto.checked = seen;
      state.auto.duplicates = duplicates;
      save();
      return { added: added.map(a => ({ title: a.doc.title, lang: a.doc.lang, date: a.doc.date, url: a.doc.url })), checked: seen, duplicates, errors };
    })().finally(() => { running = null; });
    return running;
  }

  return {
    corpus, hidden,
    state: () => ({ ...state.auto, next_run: state.auto.enabled ? new Date((state.auto.last_run ? Date.parse(state.auto.last_run) : Date.now()) + DAY).toISOString() : null, running: Boolean(running) }),
    added: () => state.added.map(a => ({ key: docKey(a.doc), ...a.doc, passages: a.chunks.length, found_at: a.found_at })),
    check,
    due: () => state.auto.enabled && !running && (!state.auto.last_run || Date.now() - Date.parse(state.auto.last_run) >= DAY),
    setAuto(enabled) { state.auto.enabled = Boolean(enabled); save(); },
    setHidden(key, on) {
      const set = hidden();
      if (on) set.add(key); else set.delete(key);
      state.hidden = [...set]; save();
    },
  };
}
export { DAY };
export const libraryExists = file => existsSync(file);
