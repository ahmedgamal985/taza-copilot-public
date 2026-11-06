// AI providers the user can choose from. Anthropic uses its native SDK (with built-in citations);
// OpenAI, DeepInfra, OpenRouter and Ollama all speak the OpenAI chat-completions format.
// Keys live in .env on the server and never reach the browser.
import Anthropic from '@anthropic-ai/sdk';

const env = k => (process.env[k] || '').trim();

export const PROVIDERS = {
  anthropic: {
    label: 'Anthropic (Claude)', kind: 'anthropic',
    key: () => env('LLM_API_KEY') || env('ANTHROPIC_API_KEY'),
    model: () => env('ANTHROPIC_MODEL') || 'auto',
    note: 'Best quality. Quotes are extracted by Claude\'s built-in citations. "auto" picks Haiku or Sonnet per question.',
  },
  openai: {
    label: 'OpenAI', kind: 'openai', base: () => 'https://api.openai.com/v1',
    key: () => env('OPENAI_API_KEY'), model: () => env('OPENAI_MODEL'),
  },
  deepinfra: {
    label: 'DeepInfra', kind: 'openai', base: () => 'https://api.deepinfra.com/v1/openai',
    key: () => env('DEEPINFRA_API_KEY'), model: () => env('DEEPINFRA_MODEL'),
  },
  openrouter: {
    label: 'OpenRouter', kind: 'openai', base: () => 'https://openrouter.ai/api/v1',
    key: () => env('OPENROUTER_API_KEY'), model: () => env('OPENROUTER_MODEL'),
  },
  ollama: {
    label: 'Ollama (local, free)', kind: 'openai', local: true,
    base: () => (env('OLLAMA_URL') || 'http://localhost:11434').replace(/\/$/, '') + '/v1',
    key: () => 'ollama', model: () => env('OLLAMA_MODEL'),
    note: 'Runs on your own machine. No API cost at all; it only needs a strong enough computer.',
  },
};

// USD per million tokens (input, output), where we know it. Local models cost nothing.
const PRICES = { 'claude-haiku-5-5': [0.10, 0.50], 'claude-sonnet-5-5': [2, 10], 'claude-opus-5-5': [4, 20] };
export function costUsd(provider, model, usage) {
  if (PROVIDERS[provider]?.local) return 0;
  const p = PRICES[model];
  return p ? +((usage.input * p[0] + usage.output * p[1]) / 1e6).toFixed(5) : null;
}

async function ollamaUp() {
  try {
    const r = await fetch(PROVIDERS.ollama.base().replace(/\/v1$/, '') + '/api/tags', { signal: AbortSignal.timeout(800) });
    return r.ok;
  } catch { return false; }
}

// Which providers are ready to use right now
export async function listProviders() {
  const up = await ollamaUp();
  return Object.entries(PROVIDERS).map(([id, p]) => ({
    id, label: p.label, note: p.note || null, local: Boolean(p.local),
    ready: p.local ? up : Boolean(p.key()),
    server_key: !p.local && Boolean(p.key()),
    default_model: p.model() || null,
    hint: p.local ? (up ? null : 'Ollama is not running on this server. See the setup guide.')
      : (p.key() ? null : `Add ${id === 'anthropic' ? 'LLM_API_KEY' : id.toUpperCase() + '_API_KEY'} to .env`),
  }));
}

// A user can bring their own key from the platform. It is used for that one request only:
// never stored on the server, never logged.
export async function isReady(id, userKey) {
  const p = PROVIDERS[id];
  if (!p) return false;
  if (p.local) return ollamaUp();
  return Boolean(userKey || p.key());
}

let serverClient = null;
export function anthropic(userKey) {
  if (userKey) return new Anthropic({ apiKey: userKey, maxRetries: 1 });
  if (!serverClient) serverClient = new Anthropic({ apiKey: PROVIDERS.anthropic.key() });
  return serverClient;
}

// Model list for the picker. Lists fetched with the server's keys are cached for 10 minutes.
const modelCache = new Map();
export async function listModels(id, userKey) {
  const hit = !userKey && modelCache.get(id);
  if (hit && Date.now() - hit.at < 600_000) return hit.models;
  const p = PROVIDERS[id];
  let models = [];
  if (p.kind === 'anthropic') {
    for await (const m of anthropic(userKey).models.list()) models.push(m.id);
    models.unshift('auto');
  } else {
    const r = await fetch(p.base() + '/models', { headers: { Authorization: `Bearer ${userKey || p.key()}` }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(r.status === 401 ? 'This API key was rejected.' : `${p.label} model list returned ${r.status}`);
    const j = await r.json();
    models = (j.data || j.models || []).map(m => m.id || m.name).filter(Boolean).sort();
  }
  models = [...new Set(models)].slice(0, 600);
  if (!userKey) modelCache.set(id, { at: Date.now(), models });
  return models;
}

// One chat call in the OpenAI format. Returns { text, usage }.
export async function openaiChat(id, model, system, user, { json = false, userKey } = {}) {
  const p = PROVIDERS[id];
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${userKey || p.key()}` };
  if (id === 'openrouter') { headers['HTTP-Referer'] = 'https://github.com/smog-hunters/taza-copilot'; headers['X-Title'] = 'Taza Copilot'; }
  const body = { model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], stream: false };
  if (json) body.response_format = { type: 'json_object' };
  const r = await fetch(p.base() + '/chat/completions', {
    method: 'POST', headers, body: JSON.stringify(body),
    signal: AbortSignal.timeout(p.local ? 300_000 : 90_000),
  });
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 300);
    // Some models reject response_format; retry once without it
    if (json && r.status === 400) return openaiChat(id, model, system, user, { json: false, userKey });
    if (r.status === 401) throw new Error(`${p.label} rejected the API key.`);
    throw new Error(`${p.label} returned ${r.status}: ${detail}`);
  }
  const j = await r.json();
  const text = (j.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  return { text, usage: { input: j.usage?.prompt_tokens || 0, output: j.usage?.completion_tokens || 0 } };
}
