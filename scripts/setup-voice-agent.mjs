// Creates (or updates) the Taza voice agent on ElevenLabs with client tools that drive the platform.
// Run: node --env-file=../.env scripts/setup-voice-agent.mjs
// Saves the IDs to data/voice-agent.json. Safe to run again: it updates what already exists.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SAVE = join(here, '..', 'data', 'voice-agent.json');
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) { console.error('ELEVENLABS_API_KEY is not set'); process.exit(1); }

async function api(method, path, body) {
  const res = await fetch('https://api.elevenlabs.io' + path, {
    method, headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 600)}`);
  return text ? JSON.parse(text) : {};
}

const DISTRICTS = ['city', 'Alatau', 'Almaly', 'Auezov', 'Bostandyk', 'Medeu', 'Nauryzbay', 'Turksib', 'Zhetysu'];
const TOOLS = [
  {
    type: 'client', name: 'ask_research', expects_response: true, response_timeout_secs: 40,
    description: 'Search Almaty Air Initiative (AAI) research and live sensor data and get a sourced answer. Use it for EVERY ' +
      'factual question about Almaty air, pollution, health effects, districts, schools, policy or AAI studies. The answer and its ' +
      'source cards also appear on the user\'s screen. Returns the answer and the sources (number, title, page).',
    parameters: { type: 'object', required: ['question'], properties: {
      question: { type: 'string', description: 'The user question, rewritten as one clear standalone question, in the language the user is speaking (English, Russian or Kazakh), so the answer on screen is in that language too.' } } },
  },
  {
    type: 'client', name: 'show_map', expects_response: true, response_timeout_secs: 15,
    description: 'Open the live air map of Almaty on the user\'s screen, zoom to a district, and optionally show only sensors in one ' +
      'air category. Use when the user wants to see the map, a district, or where the air is bad or good. Returns what is shown.',
    parameters: { type: 'object', required: ['district'], properties: {
      district: { type: 'string', enum: DISTRICTS, description: 'District to zoom to, or "city" for the whole city.' },
      category: { type: 'string', enum: ['all', 'unhealthy', 'sensitive', 'moderate', 'good'], description: 'Which sensors to show. Default all.' } } },
  },
  {
    type: 'client', name: 'show_station', expects_response: true, response_timeout_secs: 20,
    description: 'Open the details card of one air sensor on the map: its PM2.5 now, the change over 24 hours, a 24-hour chart with ' +
      'min, average and max, and health advice. Use it for "show me the worst sensor in Turksib", "the cleanest place now", or a ' +
      'sensor or school by name. Returns the numbers shown.',
    parameters: { type: 'object', required: ['district', 'pick'], properties: {
      name: { type: 'string', description: 'Part of the sensor name, e.g. a school number like "№112", if the user named one.' },
      district: { type: 'string', enum: DISTRICTS, description: 'District to look in, or "city" for the whole city.' },
      pick: { type: 'string', enum: ['worst', 'best'], description: 'Without a name: the most polluted (worst) or cleanest (best) sensor.' } } },
  },
  {
    type: 'client', name: 'open_source', expects_response: false,
    description: 'Point at and open source card number n from the last answer, so the user sees the exact quote and page.',
    parameters: { type: 'object', required: ['n'], properties: { n: { type: 'integer', description: 'Source number, starting at 1.' } } },
  },
  {
    type: 'client', name: 'compare_air', expects_response: true, response_timeout_secs: 40,
    description: 'Open the Compare page and show two places or two years side by side from AAI\'s daily PM2.5: the average, clean days, ' +
      'days above the limit and a monthly chart. Use it for "compare Turksib and Medeu", "was 2025 worse than 2024?", or "Almaty vs ' +
      'Bishkek". Returns the numbers shown.',
    parameters: { type: 'object', required: ['type', 'b'], properties: {
      type: { type: 'string', enum: ['districts', 'years', 'cities'], description: 'districts: two Almaty districts in one year. years: all of Almaty in two years. cities: Almaty against another Asian city (2026 data).' },
      a: { type: 'string', description: 'First side. districts: one of Alatau, Almaly, Auezov, Bostandyq, Medeu, Nauryzbay, Turksib, Zhetysu. years: a year from 2022, e.g. "2025". cities: leave empty (always Almaty).' },
      b: { type: 'string', description: 'Second side. districts: another district from the same list. years: another year. cities: one of bishkek, tashkent, lahore, kathmandu.' },
      year: { type: 'string', description: 'Only for districts: the year, from 2022. Default last year.' } } },
  },
  {
    type: 'client', name: 'best_time', expects_response: true, response_timeout_secs: 30,
    description: 'Open "Best time to go out today": the cleanest and the dirtiest two daytime hours of today (or tomorrow late in the ' +
      'evening), from today\'s real readings and the last 14 days. Use it for "when should I go for a walk / take the kids out / ' +
      'open the windows today?". Returns the hours and PM2.5. It is an estimate, not a forecast.',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'client', name: 'open_page', expects_response: false,
    description: 'Open a page of the platform: ask (question page), map, schools (schools and kindergartens ranked by air now), history (the past questions and calls of this user, kept only in their browser), dashboard (accuracy dashboard, hours saved, unanswered questions), sources (all 100 reports and articles), about (about and privacy), widget (the one line of code that puts Taza on any website), ai (choose the AI model or use your own key), indrive (the Taza for inDrive concept: driver and rider phones and a short video). For Compare and Best time use compare_air and best_time.',
    parameters: { type: 'object', required: ['page'], properties: {
      page: { type: 'string', enum: ['ask', 'map', 'schools', 'history', 'dashboard', 'sources', 'about', 'widget', 'ai', 'indrive'], description: 'Which page to open.' } } },
  },
];

const PROMPT = `You are Taza, the voice of Taza Copilot, Almaty Air Initiative's air quality assistant. "Taza" means clean in Kazakh.
You talk with the user while they look at the Taza Copilot web platform, and you can control that screen with your tools.

How you work:
- For every factual question about air, pollution, health, districts, schools, policies or AAI research, call ask_research first.
  Never answer facts from memory. Then say the answer in one to three short spoken sentences, and mention the source briefly,
  for example "that's from AAI's 2025 report, page 3". The full quotes are on the screen.
- If ask_research says the research does not cover it, say so honestly. Never invent numbers.
- When the user wants to see something, show it: show_map for the map, a district, or where the air is bad; show_station for one
  sensor in detail (the worst or cleanest in a district, or a school by name); open_source to point at a quote; compare_air to
  compare two districts, two years, or Almaty with Bishkek, Tashkent, Lahore or Kathmandu; best_time for when to go outside or
  open the windows today; open_page for the schools ranking (which schools have the dirtiest air now), the user's history, the
  dashboard, the list of reports, about and privacy, the website widget, choosing the AI, or the Taza for inDrive concept. Say what you are showing while you show it.
- You can reach every part of the platform. If the user asks what Taza can do, or about a feature, explain it briefly and offer to
  show it. The platform: sourced answers from 100 AAI reports and articles with exact quotes and pages; "Check a claim" (paste a
  statement, get supported or contradicted with the quote); the live air bar at the top; the live map of 150+ sensors with a 24-hour
  card each; Best time to go out today; Compare; schools and kindergartens ranked by air now; the accuracy dashboard; a one-page
  policy brief, share link, quote card and APA citation for any answer; history kept only in the user's browser, exportable to
  Markdown or PDF; choosing the AI model; three languages; an installable phone app that opens without internet; a guided tour
  (the "Guided tour" button on the home page).
- Taza also lives in Telegram as @SmogHuntersBot (the Telegram link is in the menu): sourced answers by text or voice note, the
  sensor nearest to you, morning alerts on bad-air days and a weekly summary, fact-checking of any forwarded post, "My places"
  alerts for up to three sensors such as home and school, inline answers in any chat, and a daily school air card for parents'
  groups (an admin types /school and the number). And as a widget AAI can add to any website with one line of code.
- Taza is also on WhatsApp (the green WhatsApp button on the home page and in the menu): the same sourced answers in a natural
  chat in English, Russian or Kazakh, and a WhatsApp call is answered by a voice agent, like phoning an air-quality specialist.
- Taza for inDrive (a concept, open_page indrive): a morning air message for drivers and riders on bad-air days, the air at the
  pickup point, a cleaner place for a driver's break, a reminder to close the windows in traffic jams, and Ask Taza, all from one
  API call; the page shows driver and rider phones and a short video. The Telegram bot gives the same tips (Alerts, then
  "I'm a driver" or "I'm a rider").
- Colours on the map follow AAI's scale for PM2.5 in µg/m³: up to 15 good, 15 to 35 moderate, 35 to 70 unhealthy for sensitive
  groups, 70 to 140 unhealthy, above 140 very unhealthy.
- After answering, you may offer one next step, like "Want me to show it on the map?".
- Speak naturally and briefly, like a friendly expert. No lists, no markdown, no reading out links.
- Languages: English, Russian and Kazakh. Always reply in the language the user is speaking; if they switch, switch with them.
  Say numbers and units naturally in that language (for example "микрограммов на кубический метр").`;

const saved = existsSync(SAVE) ? JSON.parse(readFileSync(SAVE, 'utf8')) : {};
const toolIds = {};
for (const t of TOOLS) {
  const existing = saved.tools?.[t.name];
  if (existing) {
    await api('PATCH', `/v1/convai/tools/${existing}`, { tool_config: t });
    toolIds[t.name] = existing;
    console.log('updated tool', t.name);
  } else {
    const r = await api('POST', '/v1/convai/tools', { tool_config: t });
    toolIds[t.name] = r.id || r.tool_id;
    console.log('created tool', t.name, toolIds[t.name]);
  }
  // Save after every tool so a failed run never leaves orphan tools behind
  writeFileSync(SAVE, JSON.stringify({ ...saved, tools: { ...saved.tools, ...toolIds } }, null, 2));
}

const agentBody = {
  name: 'Taza Copilot voice',
  // Only signed URLs from our server can start a conversation (the agent ID alone is not enough)
  platform_settings: { auth: { enable_auth: true } },
  conversation_config: {
    agent: {
      first_message: "Hi, I'm Taza, Almaty's air assistant. Ask me anything about the air, or say: show me the map.",
      language: 'en',
      prompt: {
        prompt: PROMPT, llm: process.env.ELEVENLABS_LLM || 'claude-haiku-5-5', tool_ids: Object.values(toolIds),
        // Switches the conversation to Russian or Kazakh when the user speaks it
        built_in_tools: { language_detection: { type: 'system', name: 'language_detection', description: '',
          params: { system_tool_type: 'language_detection' } } },
      },
    },
    // eleven_v4_turbo is the real-time model whose language list includes Russian and Kazakh
    tts: { voice_id: process.env.ELEVENLABS_VOICE_ID || 'hpp4J3VqNfWAUOO0d1Us', model_id: 'eleven_v4_turbo' },
    language_presets: {
      ru: { overrides: { agent: { first_message: 'Привет, я Таза, помощник по качеству воздуха в Алматы. Спросите меня о воздухе или скажите: покажи карту.' } } },
      kk: { overrides: { agent: { first_message: 'Сәлеметсіз бе, мен Тазамын, Алматы ауасы бойынша көмекшімін. Ауа туралы сұраңыз немесе «картаны көрсет» деңіз.' } } },
    },
  },
};

let agentId = saved.agent_id;
if (agentId) {
  await api('PATCH', `/v1/convai/agents/${agentId}`, agentBody);
  console.log('updated agent', agentId);
} else {
  agentId = (await api('POST', '/v1/convai/agents/create', agentBody)).agent_id;
  console.log('created agent', agentId);
}
writeFileSync(SAVE, JSON.stringify({ agent_id: agentId, tools: toolIds, updated: new Date().toISOString() }, null, 2));
console.log('saved', SAVE);
