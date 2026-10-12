# Shipping Shorts — maritime news pipeline

**Source → scrape public articles → generate scripts with your chosen OpenRouter model.**

Backend runs inside Next.js; no separate Python service is needed. Supabase handles email/password authentication and Postgres persistence for sources, articles, scripts, and jobs. Each user has a private workspace protected by Row Level Security. SQLite remains available only as an explicit local/test option.

## Start

Requires Node.js 22.13+ (native `node:sqlite`).

```bash
npm install
cp .env.example .env.local
# Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
# and OPENROUTER_API_KEY in .env.local
npm run dev -- --hostname 127.0.0.1
```

### Supabase setup (required before using the dashboard)

1. In your Supabase project's **SQL Editor**, run the complete setup SQL provided in chat once. It creates tables, per-user access policies, transactional script saving, and one-time source seeding. SQL files are intentionally not stored in this app. The public API key cannot create these tables.
2. Under **Authentication → Providers**, enable email/password signup. Keep email confirmation enabled for production.
3. Under **Authentication → URL Configuration**, set Site URL to your app URL and allow `http://localhost:3000/auth/callback` (or `http://127.0.0.1:3000/auth/callback` when using that host). Add your exact production callback URL before deployment.
4. Visit `/login`, create an account, confirm the email in the same browser (the callback uses PKCE), and sign in. Supabase's built-in email service has sending limits; configure custom SMTP for production. If confirmation is opened in another browser, return to the original browser or request a fresh confirmation flow.
5. Leave `NEWS_API_TOKEN` and `NEXT_PUBLIC_BACKEND` unset. Auth uses secure server-managed sessions and same-origin requests. No service-role key, database password, or Supabase secret key is needed.

### Missing tables / seed function

If the API reports that `public.seed_news_sources` or a table is missing, run the complete setup SQL provided in chat in the same Supabase project's SQL Editor. For a new database, no reset is necessary. The SQL refreshes the API schema cache. Restart the app and sign in; default sources are seeded on first access.

Do not drop the `public` or `auth` schema. Existing user accounts do not need to be recreated. Database schema changes are manual SQL Editor operations, not operations performed with the publishable key.

`proxy.ts` refreshes session cookies and redirects unauthenticated dashboard visits. API routes independently verify the user with Supabase and return 401 without a valid session. Server operations use the user's session and publishable key, not a privileged key. Add rate limiting/quotas before public release, especially for scraping and paid OpenRouter calls.

Existing `data/news.sqlite` is left untouched and is **not automatically imported** into Supabase. New accounts start with the default sources. Back up old data before any manual migration. To temporarily use the old local-only store, set `NEWS_STORAGE=sqlite`; this unauthenticated mode is disabled in production.

Create an OpenRouter API key at https://openrouter.ai/settings/keys. Set `OPENROUTER_MODEL` to the exact model ID from OpenRouter (for example, `openai/gpt-oss-20b`). Both paid and free models are supported. The default remains `openrouter/free`; free models may also use IDs ending in `:free`. Paid models require sufficient account credits and an API key with an adequate spending limit. The UI displays the selected model and warns when generation may incur charges. Restart the server after changing the key or model. Free providers have rate limits and availability restrictions; an API key does not guarantee unlimited free requests.

Leave `NEXT_PUBLIC_BACKEND` unset to use the new same-origin API. If an existing `.env` points it to port 8000, remove that setting or override it with `NEXT_PUBLIC_BACKEND=` in `.env.local`. Restart after changing environment variables.

## Use

1. Open **Sources**. Confirm/edit URLs and enable desired publishers.
2. Click **Run pipeline**: discover links/RSS → extract public article text → save articles → generate and save scripts.
3. Open **Articles** to review original content or retry generation individually.
4. Open **Generated Scripts** to review and copy the complete **video-ready creation brief** into your external video platform. Each brief includes a 60–90 second vertical 9:16 format, 5–8 timed scenes, voiceover, visual directions, on-screen text, production notes, and article attribution. This app produces text only; it does not create media.

Older narration-only scripts are preserved. Open a script and click **Convert to video-ready script** to replace it with the new format. For an unsatisfactory script, enter optional feedback (for example, a stronger hook, simpler narration, or different visuals) and click **Regenerate script**. Leaving feedback blank requests a fresh alternative. The model receives the previous draft and feedback while the original article remains the factual source. Regeneration uses your configured model, may incur charges, replaces the saved version on success, and preserves the old script if it fails. Platform support differs: paste the full brief into a prompt/storyboard input; a narration-only input should receive only the VOICEOVER sections. Review generated facts and illustrative visuals before publishing.

### Star important articles and scripts

Use the Lucide star at the top center of a script card, or the star just left of an article row's arrow. A selected star is filled yellow. Both sections have a **Starred** filter. Article stars are the persisted source of truth: starring or unstarring either view updates the related item, newly generated scripts inherit the article's star, and regenerating a script preserves it. Stars use the existing article JSON data, so no additional SQL or tables are needed.

### Live dashboard progress

The dashboard polls `/api/jobs` every 2 seconds and shows active pipeline, scraping, generation, and regeneration jobs started from any page. Cards show the current source/article, stage completion counts, saved articles, generated scripts, and errors. Progress is **completed items in the current stage**, not an estimated token percentage or overall ETA. It resets when a pipeline moves from scraping to generation. Dashboard article/script totals refresh as results are saved. The last three finished jobs are shown alongside all active jobs; up to 30 recent job records are available through the API.

Job state persists in Supabase Postgres. Reloading or navigating to the dashboard resumes observing a running job. Jobs remain request-bound in the long-running server: restarting the server interrupts work and does not automatically retry paid calls. Supabase jobs with no progress for 10 minutes are marked interrupted on polling; this heuristic is not a worker heartbeat/lease system. This is progress tracking, not a durable background queue. Existing scripts are retained when generation/regeneration fails.

Each run fetches up to `NEWS_SCAN_LIMIT` new links per active source (default 3), then sequentially attempts scripts for every article newly saved by that scan. There is no five-script cap. Older pending or failed articles are never retried by **Run pipeline**; generate those individually from **Articles**. Each newly saved article is attempted once; generation failures stay pending and do not stop subsequent articles. If nothing new is saved, no generation calls are made. When a `sourceId` is supplied, the scan stays scoped to that source. **Scrape articles** performs extraction without spending model quota; articles saved that way also require individual generation. Duplicate URLs (including redirects to existing articles) do not enter the generation batch. The response's `remaining` count includes older pending articles, not an automatic retry queue. Paid generation costs, hosting timeouts, and provider rate limits still apply.

## Sources

Initial publishers: Drewry, Maritime Analytica, Lloyd’s List Maritime, Shipping & Freight Resource, Marine Insight, Expeditors, Jiss Mathew, and India Shipping News.

- Maritime Analytica and Jiss Mathew are disabled until you supply confirmed URLs; spelling/channel identity is ambiguous.
- “Lloyd maritime” is provisionally mapped to Lloyd’s List; edit if you meant another publisher.
- Homepages are starting points, not guaranteed adapters. Use a publisher’s public news/archive or RSS URL for better discovery.
- Expeditors uses its public blog host. Podcasts and videos need **public transcript pages**; this implementation does not download/transcribe media or scrape YouTube captions.
- JavaScript-only, blocked, or login/paywalled pages may fail. No paywall bypass, CAPTCHA bypass, or credentialed publisher access is performed.
- The crawler checks robots.txt, fetches sequentially with a delay, limits response sizes/timeouts, and rejects private/reserved IPs, including redirected destinations. Check publisher terms and rights before republishing. Generated scripts need editorial fact-checking.
- Robots requests accept `text/plain` (Xinde returns HTTP 406 without a compatible Accept header). The client follows up to five standard redirects, bounds DNS to 10 seconds and connection/TLS/body to 15 seconds per hop, and makes at most three attempts for temporary failures with exponential backoff. Verified rules and confirmed 404/410 absence are cached for one hour; other HTTP errors, DNS/TLS/timeouts, and invalid responses fail closed and are cached for one minute. Expired permission is not reused. JSON server logs include HTTP status, redirects, network error codes and robots decisions; source/job errors retain the specific skip reason.
- Existing Xinde `/news-list?tags=Global%20News`, `/news-list?tags=Breaking%20News`, and `/latest-news` records use the publisher’s public `/portal/news/list` API for discovery, preserving their query filters and IDs. No RSS feed was advertised on the checked listing pages; advertised feeds are preferred when present. Discovery checks API robots permission, follows up to five pages of ten rows, skips paid/unknown-access rows, and extracts only public article HTML after its own robots check. Repeat URLs and redirected duplicates use the existing database deduplication. Source records, extra mapping fields, and database schemas are unchanged. Xinde’s footer prohibits reproduction without permission: robots allowance is not a republication license.

## API

- `GET/POST /api/sources` — list/create sources (`name`, `url`).
- `PATCH/DELETE /api/sources/:id` — change name/URL/active state or remove source.
- `POST /api/scan` — extract articles; optional `{ "sourceId": "..." }`.
- `POST /api/pipeline` — extraction and script generation; optional sourceId.
- `GET /api/articles`, `GET /api/articles/:id`.
- `PATCH /api/articles/:id` — set `{ "starred": true }` or `false`; related script reads share this value.
- `POST /api/articles` — manually scrape a direct public article URL using `{ "sourceId": "...", "url": "https://..." }`.
- `POST /api/articles/:id/generate` — generate a video-ready script, or return the existing script. Send `{ "regenerate": true, "feedback": "Make the hook stronger" }` to replace an existing version using the same script ID. Feedback is optional and limited to 2000 characters.
- `GET /api/scripts`, `GET /api/scripts/:id`.
- `PATCH /api/scripts/:id` — set `{ "starred": true }` or `false`; updates the related article's shared star.
- `GET /api/jobs`, `GET /api/jobs/:id` — active/recent job progress and errors.
- `GET /api/providers` — server-side OpenRouter configuration status; no API key exposed.

POST scan/pipeline bodies must be JSON, including `{}` when running all sources. A pipeline response contains scans, generated scripts, errors, and remaining count. Article publication time is `Unknown` if the publisher does not supply it; discovery time is stored separately.

## Deployment and limits

Supabase persists the database across deployments, but does not make the scraping/generation pipeline a durable background queue. Use a **single long-running Node process**, not ephemeral/serverless hosting, for the current request-bound jobs and process-local scan/pipeline locks. Large source lists require a durable queue/worker before production scaling. Scheduling is not enabled: runs are manual/API-triggered.

Accounts have private data through authentication and RLS. Paid generation still uses the app owner's server-side OpenRouter key: add account approval, rate limits, quotas, and spending controls before allowing unrestricted public signup. Keep OpenRouter keys server-only. `NEWS_API_TOKEN` is a legacy additional API bearer-token check; leave it unset when using the browser dashboard, which does not send it.

This app is script-only. There are no Studio, video-generation, audio-generation, or media-rendering features.

## Checks

```bash
npm run typecheck
npm test
npm run build
```

Tests use isolated SQLite storage and mocked OpenRouter responses; live scraping and real model output depend on publisher access and your API key.

### Browser/UI checks

The interface includes the ShippingShorts sidebar wordmark, plain navigation, responsive lists, shared article/script stars, scene-based script review, and live job progress. The existing dashboard browser tests mock API responses. Run a separate development server with `NEWS_STORAGE=sqlite` for those tests (never use this mode for a public deployment). With that server already running:

```bash
npx playwright install chromium
npm run test:ui
```

Set `UI_TEST_BASE_URL` to test a different server. Desktop and mobile browser tests mock API responses to check navigation, filters, dialogs, job progress, and revision feedback without scraping or incurring model charges. Production data and API integrations are unchanged. The clean UI direction was informed by the existing app and the public Linear feature-page HTML structure; no authenticated Mobbin access was available.
