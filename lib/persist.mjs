// Keeps the server's own data safe on Cloudflare: a container's disk is wiped whenever it restarts, so
// the question log, shared answers, Telegram choices, uploaded research and the AAI data cache are copied
// to R2. Requests go to an internal hostname that only the Cloudflare Worker answers (outbound
// interception): nothing is exposed to the internet and no storage key is needed in the container.
// Turned on with PERSIST=cloudflare (set by the Worker); on a normal computer it does nothing.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const BASE = 'http://store.taza.internal';
export const persistOn = () => process.env.PERSIST === 'cloudflare';
// Only these files are ever stored or restored
const KEY = /^data\/(log\.jsonl|shared\.json|tg-users\.json|tg-alerts\.json|tg-places\.json|tg-groups\.json|aai-cache\.json|library\.json|uploads\/[\w.-]{1,80})$/;
// The AAI cache changes every few minutes and is only a speed-up: saved at most every 10 minutes
const SLOW = { 'data/aai-cache.json': 600_000 };

async function api(method, key = '', body) {
  const res = await fetch(`${BASE}/${key}`, { method, body, signal: AbortSignal.timeout(30_000) });
  if (!res.ok && res.status !== 404) throw new Error(`store ${method} ${key} → ${res.status}`);
  return res;
}

// Before the server starts: bring back every stored file
export async function restore(root) {
  const t0 = Date.now();
  const list = await (await api('GET', '?list')).json();
  let n = 0;
  for (const key of list.keys || []) {
    if (!KEY.test(key)) continue;
    const res = await api('GET', key);
    if (!res.ok) continue;
    const file = join(root, key);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    n++;
  }
  console.log(`Restored ${n} data files from Cloudflare R2 in ${Date.now() - t0} ms`);
}

// While running: save files that changed, and remove uploads that were deleted
export function startSync(root, everyMs = 10_000) {
  const seen = new Map(); // key -> "size:mtime" last saved
  const savedAt = new Map();
  const tracked = () => {
    const keys = Object.keys(SLOW).concat(['data/log.jsonl', 'data/shared.json', 'data/tg-users.json', 'data/tg-alerts.json',
      'data/tg-places.json', 'data/tg-groups.json', 'data/library.json']);
    const up = join(root, 'data', 'uploads');
    if (existsSync(up)) for (const f of readdirSync(up)) keys.push(`data/uploads/${f}`);
    return keys.filter(k => KEY.test(k) && !k.endsWith('.tmp'));
  };
  // Files restored at start are already in R2
  for (const k of tracked()) { const f = join(root, k); if (existsSync(f)) { const s = statSync(f); seen.set(k, `${s.size}:${s.mtimeMs}`); } }
  let running = false;
  async function sync(force = false) {
    if (running) return;
    running = true;
    try {
      const keys = tracked();
      for (const k of keys) {
        const f = join(root, k);
        if (!existsSync(f)) continue;
        const s = statSync(f), sig = `${s.size}:${s.mtimeMs}`;
        if (seen.get(k) === sig) continue;
        if (!force && SLOW[k] && Date.now() - (savedAt.get(k) || 0) < SLOW[k]) continue;
        await api('PUT', k, readFileSync(f));
        seen.set(k, sig); savedAt.set(k, Date.now());
      }
      // An uploaded report removed from the admin page is removed from R2 too
      for (const k of [...seen.keys()]) {
        if (k.startsWith('data/uploads/') && !keys.includes(k)) { await api('DELETE', k); seen.delete(k); }
      }
    } catch (err) {
      console.warn('Saving data to R2 failed (will retry):', err.message);
    } finally { running = false; }
  }
  setInterval(() => sync(), everyMs).unref();
  // Cloudflare stops a container with SIGTERM: save everything first
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.once(sig, async () => { await sync(true); process.exit(0); });
  }
  return sync;
}
