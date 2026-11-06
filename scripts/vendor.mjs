// Copies the browser libraries into public/vendor so the site serves them itself
// (no third-party CDN at run time, same-origin caching and gzip). Run after npm install.
import { mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'vendor');
mkdirSync(join(out, 'images'), { recursive: true });
const nm = join(root, 'node_modules');
copyFileSync(join(nm, 'leaflet/dist/leaflet.js'), join(out, 'leaflet.js'));
copyFileSync(join(nm, 'leaflet/dist/leaflet.css'), join(out, 'leaflet.css'));
for (const f of readdirSync(join(nm, 'leaflet/dist/images'))) copyFileSync(join(nm, 'leaflet/dist/images', f), join(out, 'images', f));
copyFileSync(join(nm, '@elevenlabs/client/dist/lib.iife.js'), join(out, 'elevenlabs-client.js'));
console.log('vendor files copied to public/vendor');
