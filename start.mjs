// Container entry point (Cloudflare): restore the saved data first, then start the server and keep
// saving its data. On a normal computer use `npm start` (server.mjs) instead.
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { persistOn, restore, startSync } from './lib/persist.mjs';

const root = dirname(fileURLToPath(import.meta.url));
if (persistOn()) {
  // Keep trying: the server must not start with an empty log (it holds today's spending for the budget)
  let restored = false;
  for (let i = 1; i <= 5 && !restored; i++) {
    try { await restore(root); restored = true; }
    catch (err) {
      console.warn(`Restoring data failed (try ${i}):`, err.message);
      await new Promise(r => setTimeout(r, 2000 * i));
    }
  }
  // Never save over the stored data with an empty copy: without a restore, nothing is saved this run
  if (restored) startSync(root);
  else console.error('Data could not be restored from R2; running without saving to avoid overwriting it');
}
await import('./server.mjs');
