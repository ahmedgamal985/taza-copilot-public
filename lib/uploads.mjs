// Research uploaded by the AAI team from the admin page.
// Each PDF is saved under a name the server makes up (never the uploader's file name), its text is
// extracted with pdftotext, split into citable blocks page by page, and layered on top of the base
// index, so it is searchable at once without rebuilding or restarting anything.
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { toBlocks } from './blocks.mjs';

export const LANGS = ['en', 'ru', 'kk'];
export const MAX_PDF_BYTES = 30 * 1024 * 1024;
export const isUploadId = id => typeof id === 'string' && /^up-[a-z0-9]{6,24}$/.test(id);

export function createUploads(dir) {
  mkdirSync(dir, { recursive: true });
  const listFile = join(dir, 'uploads.json');
  const read = () => {
    try { const v = JSON.parse(readFileSync(listFile, 'utf8')); return Array.isArray(v) ? v : []; } catch { return []; }
  };
  const write = list => { writeFileSync(listFile + '.tmp', JSON.stringify(list, null, 2)); renameSync(listFile + '.tmp', listFile); };
  let list = read();

  // pdftotext: PDFTOTEXT env, then the PATH (Linux servers: poppler-utils), then Git for Windows
  const candidates = [process.env.PDFTOTEXT, 'pdftotext',
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'mingw64', 'bin', 'pdftotext.exe'),
    'C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe'].filter(Boolean);
  const run = (bin, args) => new Promise((resolve, reject) =>
    execFile(bin, args, { timeout: 90_000, windowsHide: true }, err => (err ? reject(err) : resolve())));
  async function pdfToText(pdf, txt) {
    let last;
    for (const bin of candidates) {
      try { await run(bin, ['-q', '-enc', 'UTF-8', pdf, txt]); return; }
      catch (err) { last = err; if (err.code !== 'ENOENT') break; } // a real failure (bad PDF): stop trying
    }
    throw Object.assign(new Error(last?.code === 'ENOENT' ? 'pdftotext is not installed on the server.' : 'Could not read this PDF.'), { status: last?.code === 'ENOENT' ? 500 : 400 });
  }

  // Docs and chunks for the search index, in the same shape as data/chunks.json
  function corpus() {
    const docs = [], chunks = [];
    for (const u of list) {
      const txt = join(dir, `${u.id}.txt`);
      if (!existsSync(txt)) continue;
      const url = u.url || `/research/${u.id}.pdf`;
      docs.push({ id: u.id, title: u.title, lang: u.lang, date: u.date, url, kind: 'report', pages: u.pages, uploaded: true });
      readFileSync(txt, 'utf8').split('\f').forEach((pageText, i) => {
        const blocks = toBlocks(pageText);
        if (blocks.join(' ').length < 80) return;
        chunks.push({ id: `${u.id}-p${i + 1}`, doc: u.id, title: u.title, lang: u.lang, date: u.date, kind: 'report',
          page: i + 1, url: `${url}#page=${i + 1}`, blocks });
      });
    }
    return { docs, chunks };
  }

  let busy = false;
  async function add(buf, meta) {
    if (busy) throw Object.assign(new Error('Another upload is being processed. Try again in a moment.'), { status: 429 });
    busy = true;
    const id = `up-${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
    const pdf = join(dir, `${id}.pdf`), txt = join(dir, `${id}.txt`);
    try {
      writeFileSync(pdf, buf);
      await pdfToText(pdf, txt);
      const text = readFileSync(txt, 'utf8');
      const pages = text.replace(/\f\s*$/, '').split('\f'); // pdftotext ends every page, the last one too, with \f
      const words = (text.match(/[\p{L}\p{N}]+/gu) || []).length;
      if (words < 50) throw Object.assign(new Error('This PDF has no readable text (it may be a scanned image). Upload a PDF with selectable text.'), { status: 400 });
      const entry = { id, ...meta, pages: pages.length, words, at: new Date().toISOString() };
      list = [...list, entry];
      write(list);
      const chunks = corpus().chunks.filter(c => c.doc === id).length;
      return { ...entry, chunks };
    } catch (err) {
      for (const f of [pdf, txt]) try { unlinkSync(f); } catch {}
      throw err;
    } finally { busy = false; }
  }

  function remove(id) {
    if (!list.some(u => u.id === id)) return false;
    list = list.filter(u => u.id !== id);
    write(list);
    for (const f of [`${id}.pdf`, `${id}.txt`]) try { unlinkSync(join(dir, f)); } catch {}
    return true;
  }

  // Add fields to an uploaded report (its 5-point summary)
  function update(id, patch) {
    if (!list.some(u => u.id === id)) return null;
    list = list.map(u => (u.id === id ? { ...u, ...patch } : u));
    write(list);
    return list.find(u => u.id === id);
  }

  const pdfPath = id => (isUploadId(id) && list.some(u => u.id === id) && existsSync(join(dir, `${id}.pdf`)) ? join(dir, `${id}.pdf`) : null);
  return { list: () => list, corpus, add, remove, update, pdfPath };
}
