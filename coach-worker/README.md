# Hammy Coach Worker

Secure backend for **Ask Hammy**. The browser never holds an AI provider key.

```
GitHub Pages frontend  ->  Cloudflare Worker (this)  ->  OpenAI Responses API
```

The Worker authenticates with a private **access code** that mints a **signed session token**
(HMAC‑SHA256, ~30 days). The token authorizes `/chat`, which calls the **OpenAI Responses API**
server‑side and returns only normalized, validated JSON.

## Secrets / config (Worker env only — never in the browser, never committed)

| Name | What | How |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI key | `wrangler secret put OPENAI_API_KEY` |
| `COACH_ACCESS_CODE` | private code Isa types once | `wrangler secret put COACH_ACCESS_CODE` |
| `SESSION_SIGNING_SECRET` | long random string for HMAC | `wrangler secret put SESSION_SIGNING_SECRET` |
| `OPENAI_MODEL` | Responses‑API model (e.g. `gpt-4.1-mini`) | `[vars]` in `wrangler.toml` |
| `ALLOWED_ORIGINS` | comma list of allowed web origins | `[vars]` in `wrangler.toml` |

Generate a signing secret: `openssl rand -base64 48`

## Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | liveness + `{ ready }` (true when all secrets configured) |
| POST | `/session` | access code | `{access_code}` → `{token, expires_at}` |
| POST | `/chat` | `Authorization: Bearer <token>` | chat turn → normalized Hammy reply |
| OPTIONS | `*` | — | CORS preflight |

`/chat` rejects: missing/invalid/expired/modified token, disallowed origin, malformed JSON,
oversized text/history/image, unsupported image type, and missing Worker config (safe 5xx).

### `/chat` request (from browser)
```json
{
  "messages": [ {"role":"user","text":"..."}, {"role":"assistant","text":"..."} ],
  "context": { "dayName":"Monday", "scheduledWorkout":"Lower body", "...": "sanitized plan values" },
  "image": "data:image/jpeg;base64,...",   // optional, current menu/food photo only
  "anon_id": "opaque-random"               // optional anonymous safety id
}
```

### `/chat` response (normalized — never the raw OpenAI object)
```json
{
  "reply": "Concise response",
  "options": [ { "title": "Option", "details": "Actionable details" } ],
  "follow_up_question": null,
  "safety": "normal",          // normal | caution | urgent
  "hammy_mood": "neutral"      // neutral | thinking | proud | concerned | sleepy | excited
}
```

### OpenAI Responses API call (server-side)
`POST https://api.openai.com/v1/responses` with: `model` (from `OPENAI_MODEL`), `instructions`
(authoritative Hammy prompt + sanitized plan), `input` (recent messages + optional current image),
`store: false`, bounded `max_output_tokens`, a random `safety_identifier`, and
`text.format = json_schema` (strict) for structured output. The reply is validated server-side
before returning.

## Local development
```bash
cd coach-worker
npm install
cp .dev.vars.example .dev.vars     # fill in real values (gitignored)
npm run dev                        # wrangler dev, default http://localhost:8787
npm test                           # unit tests (no network/secrets needed)
```

## Deploy
```bash
wrangler login
wrangler secret put OPENAI_API_KEY
wrangler secret put COACH_ACCESS_CODE
wrangler secret put SESSION_SIGNING_SECRET
# set OPENAI_MODEL + ALLOWED_ORIGINS in wrangler.toml [vars]
wrangler deploy
```
Then put the Worker URL in the frontend `coach/coach-config.js` (`workerUrl`). The URL is public.

---

# Hammy Reminders (Web Push) — one-time setup

Smart, **deterministic** phone reminders from Hammy (no OpenAI). Reuses the same signed coach
session for auth; adds Cloudflare **D1** + standards-based **VAPID Web Push** + a 15-minute Cron.

### Extra secrets / config

| Name | What | How |
|---|---|---|
| `VAPID_PRIVATE_KEY` | VAPID signing key | `wrangler secret put VAPID_PRIVATE_KEY` (SECRET) |
| `VAPID_PUBLIC_KEY` | VAPID public key (browser needs it) | `[vars]` in `wrangler.toml` |
| `VAPID_SUBJECT` | `mailto:` or site URL | `[vars]` (defaults to the GitHub Pages URL) |
| `REMINDERS_DB` | D1 binding | `[[d1_databases]]` in `wrangler.toml` |

### Reminder routes (all origin-gated; all but `/config` require the Bearer session + `X-Hammy-Anon`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/reminders/config` | public: `{ vapid_public_key, cron_interval_minutes }` |
| GET / PUT | `/reminders/preferences` | read / save category times, quiet hours, timezone |
| POST / DELETE | `/reminders/subscribe` | save / remove this device's push subscription |
| PUT | `/reminders/status` | sync today's minimal completion flags only |
| POST | `/reminders/pause-today` | pause reminders for the user's local date |
| POST | `/reminders/test` | send a rate-limited test push |
| DELETE | `/reminders/data` | delete all reminder data for this anonymous user |

### Exact one-time setup commands

```bash
cd coach-worker

# 1) Create the D1 database (prints a database_id)
npx wrangler d1 create hammy-reminders

# 2) Paste that id into wrangler.toml -> [[d1_databases]] database_id = "..."

# 3) Apply the migration locally, then remotely
npx wrangler d1 migrations apply hammy-reminders --local
npx wrangler d1 migrations apply hammy-reminders --remote

# 4) Generate VAPID keys (no extra deps)
node scripts/gen-vapid.mjs
#    -> copy PUBLIC into wrangler.toml [vars] VAPID_PUBLIC_KEY
#    -> store PRIVATE as a secret:
echo -n "<PASTE_VAPID_PRIVATE_KEY>" | npx wrangler secret put VAPID_PRIVATE_KEY

# 5) (Cron is already configured in wrangler.toml: */15 * * * *)

# 6) Deploy
npx wrangler deploy

# 7) Verify config route (public values only)
curl -H "Origin: https://jackblaze919.github.io" https://hammy-coach.<sub>.workers.dev/reminders/config

# 8) Test a push: in the app -> Ask Hammy -> 🔔 -> Enable -> Send test notification
```

**Privacy:** D1 stores only the push subscription, the chosen reminder times, and minimal
boolean completion flags for the current day. No names, emails, weights, meal
contents, photos, chat, or medical data are ever uploaded. `user_id` is an HMAC of the browser's
anonymous id (never the raw id, never the access code). Notification copy is server-controlled.
