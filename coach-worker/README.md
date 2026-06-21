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
