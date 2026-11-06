# Taza Copilot

**AQI Data Copilot for Almaty Air Initiative (AAI)** · inDrive Hackathon 2026, track AAI-03 · team Smog Hunters

🌐 **Live: https://taza-copilot.online** · 🤖 Telegram: [@SmogHuntersBot](https://t.me/SmogHuntersBot) ·
🧩 Widget demo: https://taza-copilot.online/widget-demo.html

> **About this public copy.** This is the full source code of the live platform, kept identical to it. Its search index
> leaves out AAI's 4 written answers to the media (November 2026), because they are not confirmed as public yet; the live
> site uses them and quotes them with their title and date. The deploy workflow (`.github/workflows/deploy.yml`) is also
> left out, because it needs the team's Cloudflare secrets.

Ask AAI's research anything, in English, Russian or Kazakh. Taza Copilot searches every AAI report
and live sensor data, and answers in seconds with **the exact quote, the page, and a link that opens
on that page**. If the research does not cover the question, it says so instead of guessing.

> Metric: the time to a sourced answer goes from hours of reading reports to seconds.

### ▶ Watch: the whole platform in under 2 minutes

[![Taza Copilot, the full video (1:51)](docs/video/taza-copilot-full.jpg)](docs/video/taza-copilot-full.mp4)

[`docs/video/taza-copilot-full.mp4`](docs/video/taza-copilot-full.mp4), 1:51 with a voice-over. Part 1 is the
platform on real screenshots of the live site; part 2 is the Taza for inDrive concept. Made from
[`video/full/`](video/full): `capture.mjs` (screenshots of the live site), `vo.mjs` (voice-over in Taza's voice),
`build.mjs` (renders frame by frame and mixes the voice, a music bed that ducks under it, and effects).

## What it does

- **Sourced answers.** Each sentence carries a citation. The quote shown is the original sentence
  from the report, and the link opens the PDF on the cited page.
- **Three languages.** The question is turned into search queries in English, Russian and Kazakh,
  so a question in one language finds reports written in another.
- **104 sources.** 29 PDF reports (page by page), 71 research articles from air.org.kz, and AAI's
  written answers to the media (Kursiv, Tengrinews, November 2026), in English, Russian and Kazakh.
  The media answers are quoted with their title and date; the files themselves are not published.
- **Datasets too.** Live PM2.5 and districts, today vs yesterday, worst hours, the daily archive
  (any date, month or year, PM2.5 and NO2), gases, pollen, and other cities. All AAI data is kept
  warm on the server in the background, so no question waits for the API and the 100
  requests/minute limit is never reached. The map shows every sensor by category.
- **Fast.** First words in about 2 seconds (streamed), a full answer in 3–6 seconds; repeated and suggested questions answer instantly.
- **Choose the AI.** Anthropic (Claude), OpenAI, DeepInfra, OpenRouter, or **Ollama locally for
  free**. See [docs/LOCAL-OLLAMA.md](docs/LOCAL-OLLAMA.md).
- **For the AAI team.** An accuracy dashboard (share answered with a source, median time, cost per
  answer) and a list of unanswered questions that shows what to research next.
- **Never blank.** Without any AI key it still shows the most relevant passages.

- **Measured accuracy.** 44 questions with known answers are checked automatically (right number + cited
  source), including 15 real questions journalists and colleagues sent to AAI in November 2026, asked in
  Russian and Kazakh: **44/44** on the last run, median 3.3 s, about $0.08 per run, on the low-cost model
  (an answer it cannot source twice goes to the stronger model once, as for users; the dashboard shows
  how many). `node --env-file=../.env scripts/eval.mjs`.
- **Home page questions.** Three simple questions journalists ask AAI most, in the visitor's language,
  answered by the low-cost model and pre-answered at start-up, so a tap shows the answer at once.
- **AAI adds its own research.** `/admin.html` (ADMIN_TOKEN): upload a PDF and it is searchable and
  citable a few seconds later, with links to the uploaded file's pages. No rebuild, no restart.
- **The research stays up to date by itself, and the AAI team controls it.** Once a day the server checks
  air.org.kz (its WordPress API: research, external research, legislation) for pages Taza does not have yet,
  reads them and adds them to the search; a page that repeats a report already indexed is skipped. On the admin
  page the team turns the daily check on or off, runs it at once ("Check now"), sees when it last ran and what it
  added, and can hide any source from answers (an outdated report, say) and show it again. No developer needed
  (`lib/library.mjs`, state in `data/library.json`, saved to R2).
- **The metric, live.** "Taza has already saved N hours of reading reports": sourced answers × a
  conservative 20 minutes of manual searching each (`MANUAL_MINUTES`), shown on the home page and dashboard.
- **Check a claim.** Paste a statement from the news or a post: ✅ supported / ❌ contradicted /
  ⚠️ partly true / ❔ not covered, with the correct figure and the quote.
- **When sources disagree** (two survey waves, AAI sensors vs Kazhydromet) the answer gives both figures
  and where each comes from, with a ⚖ badge.
- **Charts in answers.** Figures by district or by month in an answer become a small chart, coloured on
  AAI's scale (AQI values, percentages and sensor counts are ignored).
- **Quote cards and citations.** Any source becomes a 1080×1080 image for social media, or an APA
  reference with the in-text citation and page.
- **Research gaps for the AAI team.** Unanswered questions grouped into topics to study next (admin
  only), also sent every Monday on Telegram to the chats in `TELEGRAM_ADMIN_CHATS` (ids from `/myid`).
- **New research, announced.** An uploaded report gets a 5-point summary in three languages; bot users
  who turned on "New research" receive it.
- **Guided tour of every feature.** 22 steps (about 5.5 minutes, including a preview of the admin page that never holds a real key): a recorded narration in the voice agent's
  voice, with captions, while the pointer opens and shows each part of the platform, from sourced answers
  to compare, best time, the Telegram bot, the widget and the installable app. Every new feature gets a
  step: add it to `public/tour/script.json` and its action to `public/tour.js`, then run
  `scripts/make-tour-audio.mjs`, which records only the clips whose text changed. Starts only on tap.
- **Compare.** Two districts, two years, or Almaty against Bishkek, Tashkent, Lahore or Kathmandu, side by
  side: monthly averages, clean days and days above the limit, counted only on the days both sides have
  data (`/api/compare`, from AAI's daily calendars).
- **Best time to go out today.** The cleanest and the dirtiest two daytime hours: today's real readings,
  then the same hours over the last 14 days scaled to today. An estimate, no AI (`/api/outdoor`).
- **Taza for inDrive (concept).** One public request, `/api/partner/brief?lang=&role=&lat=&lng=`, gives an app
  everything for 7 features: a morning push for drivers and for riders (`send_push` only above 35 µg/m³, 7–10 a.m.),
  an "Air today" card, the air at the pickup point (nearest AAI sensor), a cleaner place nearby for a driver's
  break, a traffic-jam reminder to close the windows, and an "Ask Taza" link. Advice is grounded in AAI's fleet
  report (page 5: in a jam the air inside a car is 40% dirtier; 7× with open windows than for pedestrians). The
  point is used once, never logged or stored. Menu → "Taza for inDrive" shows it on a phone, live, with a concept
  video (`video/`: rendered frame by frame with Puppeteer, synthesized sound with ffmpeg). The Telegram bot offers
  the same tips: Alerts → "I'm a driver" / "I'm a rider".
- **Installable app.** Add it to the phone's home screen (manifest + service worker). It opens without
  internet; questions and answers are never stored by the service worker.
- **For decision-makers.** A one-page **policy brief** from any answer (findings with citations,
  live numbers, two charts, sources; print or save as PDF), and **schools and kindergartens ranked**
  by the air at their sensors right now.
- **Share, rate, keep.** Share links (the server stores only what the copilot itself wrote, so a
  shared answer can't be forged), 👍/👎 feedback on the dashboard, and a history of questions and voice
  calls kept only in the browser, exportable to Markdown or PDF.
- **Widget for any website.** One line: `<script src="https://YOUR-SERVER/widget.js" data-lang="en" async></script>`
  adds a round chat button whose colour and number are the air now. It opens a full chat with AAI's
  research (streamed answers, exact quotes, page links, voice, feedback, policy brief), shows a short
  note once on bad-air days, follows the page's language, and runs in a sandboxed frame that reads
  nothing from the host page. Menu → "Widget for websites" (or `/widget-demo.html`).
- **Telegram bot.** The same copilot in Telegram (English by default, Russian and Kazakh in the
  menu): sourced answers with live progress, air now, districts ranking, the air at the sensor
  nearest to your location, **voice notes** (turned into text with ElevenLabs Scribe in English, Russian
  or Kazakh, then answered; up to 1 minute, audio not stored), and opt-in **alerts**: a morning message only on bad-air days (above
  35 µg/m³, at most once a day) and a weekly summary every Monday.
  **Forward any post** to the bot and it is fact-checked against AAI's research (✅ / ❌ / ⚠️ / 🤷 with the
  quotes; the author is never read or stored). **My places**: save up to 3 sensors (home, a school) and get
  a message when the air there goes above 35 µg/m³ (only the sensor's number is stored, never a location).
  **Inline mode**: type `@bot question` in any chat to send a sourced answer there. **Parent groups**: an
  admin types `/school 112` and the group gets the school's air and the best time to go out every school
  morning at 7:30.
- **WhatsApp.** A "WhatsApp" button (home page and menu) opens a chat with Taza on WhatsApp (+20 150 900 0921),
  with a first message in the site's language. The WhatsApp agent runs on EasyReply with its own AI (not this
  server's AI key) and calls four public endpoints of this server for its facts: `/api/search` (AAI passages with
  title, page and link, no AI), `/api/air`, `/api/outdoor` and `/api/compare`. It sends no contact data to them.
- **Voice agent.** Talk to Taza (ElevenLabs): it answers by voice and drives the page — opens the
  map, zooms to a district, opens a sensor's card, points at the quote.

## Security and cost control

- API keys stay on the server; the voice agent uses short-lived signed URLs. A user's own key is
  used for one request and never stored on the server or logged (kept only for the browser tab session).
- Content-Security-Policy, nosniff, frame blocking, Referrer-Policy, microphone limited to the site.
  Browser libraries are self-hosted (no CDN at run time).
- POSTs must be same-origin JSON; per-IP rate limits per endpoint; a daily AI budget on the
  server's keys (`DAILY_BUDGET_USD`, default 5); only `auto`/Haiku on the server key.
- Behind a reverse proxy set `TRUST_PROXY=1` so limits use the real client IP.
- The server listens on `127.0.0.1` by default; on a public server set `HOST=0.0.0.0`.
- Per-visitor daily cap on server-key answers: `DAILY_QUESTIONS_PER_IP` (default 60).
- Unanswered questions are private: the dashboard shows only their count, unless the AAI team opens
  the site once with `?admin=<ADMIN_TOKEN>` (set `ADMIN_TOKEN` in `.env`).
- Admin upload: token checked in constant time, 5 wrong tokens a minute then blocked, PDF only
  (checked by its bytes, max 30 MB), file names made by the server, uploaded PDFs served sandboxed.
- Only `widget.html` may be framed by other sites (`WIDGET_ORIGINS` to restrict it, e.g.
  `https://air.org.kz`); every other page refuses to be framed.
- Privacy: questions are kept 30 days without names or IPs; Telegram stores only each chat's
  language and, if turned on, its alert choices; a shared location is used once and never stored.
  History stays in the browser. A shared answer is kept 30 days. No Google Fonts or other trackers.
- Tests: `node scripts/smoke-test.mjs` (134 checks, features + attacks), `node scripts/test-telegram-roles.mjs` (driver/rider tips),
  `node scripts/test-admin.mjs` (research upload, 31 checks),
  `node --env-file=../.env scripts/test-telegram.mjs` (bot + alerts),
  `node --env-file=../.env scripts/eval.mjs` (accuracy, 44 questions),
  `node scripts/test-answer-text.mjs` (offline, free: how answer text and citation marks are put together),
  `node --env-file=../.env scripts/mentor-test.mjs en,ru,kk` (the mentors' 75 test questions in each language; flags answers
  with no source, in the wrong language or saying "not covered" for reading).

## Run it

Requires Node.js 22+.

```bash
npm install
node scripts/vendor.mjs   # copies Leaflet and the voice SDK into public/vendor
npm run index     # builds data/chunks.json from ../aai-research
npm start         # http://localhost:8787
```

Keys go in `.env` (in this folder or the parent folder). They stay on the server.

```
AAI_API_KEY=          # AAI sensor API
LLM_API_KEY=          # Anthropic (Claude)
OPENAI_API_KEY=       # optional
DEEPINFRA_API_KEY=    # optional
OPENROUTER_API_KEY=   # optional
OLLAMA_URL=http://localhost:11434   # optional, local and free
TELEGRAM_BOT_TOKEN=   # optional, the Telegram bot
ELEVENLABS_API_KEY=   # optional, the voice agent
ADMIN_TOKEN=          # turns on /admin.html (Add research) and the private dashboard list
WIDGET_ORIGINS=       # optional, sites allowed to embed the widget (default: any https site)
```

### Deploy on Cloudflare (runs 24/7, no server of your own)

The whole platform (web, voice, Telegram bot, alerts) runs in one Cloudflare Container behind a Worker
(`cloudflare/worker.js`, `wrangler.jsonc`, `Dockerfile`). A cron every 5 minutes keeps it awake; its data
(question log, shared answers, bot choices, uploaded research) is kept in R2 through an internal-only
hostname (`lib/persist.mjs`), so restarts lose nothing.

1. `npx wrangler r2 bucket create taza-copilot-data`
2. Keys as Worker secrets (never in Git): `npx wrangler secret put LLM_API_KEY` (and `AAI_API_KEY`,
   `TELEGRAM_BOT_TOKEN`, `ELEVENLABS_API_KEY`, `ADMIN_TOKEN`)
3. GitHub secrets `CLOUDFLARE_API_TOKEN` (template "Edit Cloudflare Workers", with Containers: Edit) and
   `CLOUDFLARE_ACCOUNT_ID`; every push to `main` builds the image and deploys (`.github/workflows/deploy.yml`).

Uploading research needs `pdftotext` (Linux: `apt install poppler-utils`; Windows: comes with Git for Windows).

## How it works

1. **Plan.** The AI writes short search queries in English, Russian and Kazakh and decides whether
   live sensor data is needed.
2. **Search.** BM25 over 1,500+ report pages and article sections (no vector database needed), merged across languages (one vote per language, so a passage that exists only in Russian, such as a media answer, still reaches an English question), with a bonus for passages where the query words appear side by side. Each passage is also matched on the edges of its neighbours and brings the next passage along (a figure often follows the sentence that names the topic), "ТЭЦ-2" counts as one word, and AAI's newest material (last 45 days) gets two extra slots, so its latest position is not buried under older reports. AAI's written answers to the media have no public file: their passages say which question they answer instead of a page.
   The fast model's answer goes to the stronger model once when it has no source, says the research does not cover the question, or copies Russian or Kazakh wording into an English answer. The stronger model's answer is tried once more when it has no source or carries words in another language. Team test of 9 media questions: `node scripts/team-test.mjs`.
3. **Answer.** With Claude, each page is sent as a `search_result` block with citations enabled,
   so the quotes come back extracted from the source. With other providers, passages are numbered
   and the model cites numbers; the platform shows the original passage text.

## Data

Public research from [air.org.kz](https://air.org.kz) and the AAI API
([docs](https://backend.air.org.kz/docs)). All rights to the research belong to Almaty Air Initiative.
