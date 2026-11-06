// Cloudflare Worker in front of the Taza Copilot container: every request goes to one always-on
// container (the server, the Telegram bot and the alerts run inside it), a cron every 5 minutes keeps
// it awake and restarts it if it ever stops, and the container's data is kept in R2 through an
// internal-only hostname (never reachable from the internet).
import { Container } from '@cloudflare/containers';
// Required for outbound interception (the internal storage hostname below)
export { ContainerProxy } from '@cloudflare/containers';

// Secrets (set with `wrangler secret put`) and settings passed to the server inside the container
const SECRETS = ['AAI_API_KEY', 'LLM_API_KEY', 'TELEGRAM_BOT_TOKEN', 'ELEVENLABS_API_KEY', 'ADMIN_TOKEN',
  'OPENAI_API_KEY', 'DEEPINFRA_API_KEY', 'OPENROUTER_API_KEY'];
const SETTINGS = ['ANTHROPIC_MODEL', 'OPENAI_MODEL', 'DEEPINFRA_MODEL', 'OPENROUTER_MODEL', 'PUBLIC_URL',
  'DAILY_BUDGET_USD', 'DAILY_QUESTIONS_PER_IP', 'WIDGET_ORIGINS', 'TELEGRAM_ADMIN_CHATS', 'MANUAL_MINUTES'];

// Files the container may keep in R2 (same list as lib/persist.mjs)
const KEY = /^data\/(log\.jsonl|shared\.json|tg-users\.json|tg-alerts\.json|tg-places\.json|tg-groups\.json|aai-cache\.json|library\.json|uploads\/[\w.-]{1,80})$/;
const MAX_BYTES = 40 * 1024 * 1024;

async function store(req, env) {
  const url = new URL(req.url);
  if (req.method === 'GET' && url.searchParams.has('list')) {
    const keys = [];
    let cursor;
    do {
      const page = await env.DATA.list({ prefix: 'data/', cursor });
      keys.push(...page.objects.map(o => o.key));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return Response.json({ keys: keys.filter(k => KEY.test(k)) });
  }
  const key = decodeURIComponent(url.pathname.slice(1));
  if (!KEY.test(key)) return new Response('Not allowed', { status: 403 });
  if (req.method === 'GET') {
    const obj = await env.DATA.get(key);
    return obj ? new Response(obj.body) : new Response('Not found', { status: 404 });
  }
  if (req.method === 'PUT') {
    const body = await req.arrayBuffer();
    if (body.byteLength > MAX_BYTES) return new Response('Too large', { status: 413 });
    await env.DATA.put(key, body);
    return new Response('ok');
  }
  if (req.method === 'DELETE') { await env.DATA.delete(key); return new Response('ok'); }
  return new Response('Method not allowed', { status: 405 });
}

export class TazaContainer extends Container {
  defaultPort = 8787;
  // Kept awake by the cron below; this only matters if the cron ever stops
  sleepAfter = '24h';
  enableInternet = true; // the AI providers, the AAI API, Telegram and ElevenLabs

  constructor(ctx, env) {
    super(ctx, env);
    const pass = {};
    for (const k of [...SECRETS, ...SETTINGS]) if (env[k]) pass[k] = String(env[k]);
    this.envVars = { ...pass, HOST: '0.0.0.0', PORT: '8787', TRUST_PROXY: 'cloudflare', PERSIST: 'cloudflare', NODE_ENV: 'production' };
  }

  onStart() { console.log('Taza container started'); }
  onStop(params) { console.log('Taza container stopped', JSON.stringify(params)); }
  onError(err) { console.error('Taza container error', err?.message || err); }
}

// Only the container's own saves reach this handler (an internal hostname, not on the internet).
// Assigned here, not as a `static` class field: the library registers handlers through a static setter,
// and a class field would define a plain property instead and the handler would never be used.
TazaContainer.outboundByHost = {
  'store.taza.internal': (req, env) => store(req, env),
};

// One container for everything (one Telegram bot, one budget, one set of data)
// Created in Western Europe on purpose: without a hint, the first caller (the cron, which can run anywhere)
// decides where it lives, and every request would cross the Atlantic. The container itself runs nearby.
const main = env => env.TAZA.get(env.TAZA.idFromName('main-weur'), { locationHint: 'weur' });

export default {
  async fetch(req, env) {
    return main(env).fetch(req);
  },
  // Every 5 minutes: keep the container running (the Telegram bot and the morning alerts live there)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(main(env).fetch(new Request('https://taza-copilot.online/api/health')).then(r => r.body?.cancel()).catch(err => console.error('Keep-alive failed', err?.message)));
  },
};
