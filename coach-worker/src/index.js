/* Ask Hammy — Cloudflare Worker.
   GitHub Pages frontend -> this Worker -> OpenAI Responses API.
   Secrets live ONLY in Worker env vars and are never sent to the browser. */

import { createSession, verifySession, randomId } from "./session.js";
import { parseAllowedOrigins, originAllowed, validateSessionBody, validateChatBody } from "./validation.js";
import { buildInstructions, REPLY_SCHEMA, normalizeReply } from "./coach-prompt.js";
import { handleReminders, runScheduled } from "./reminders.js";
import { handleDigestTest, runDigest } from "./email-digest.js";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const MAX_OUTPUT_TOKENS = 800;

/* ---------- CORS ---------- */
function corsHeaders(origin, allowed){
  const h = { "Vary": "Origin" };
  if(originAllowed(origin, allowed)){
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Authorization, Content-Type, X-Hammy-Anon, X-Digest-Test-Code";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}
function json(obj, status, headers){
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...(headers || {}) } });
}

function workerConfigured(env){
  return !!(env && env.OPENAI_API_KEY && env.OPENAI_MODEL && env.COACH_ACCESS_CODE && env.SESSION_SIGNING_SECRET);
}

/* ---------- OpenAI Responses request shaping (exported for tests) ---------- */
export function buildInput(messages, image){
  const input = [];
  messages.forEach((m, i) => {
    const isLast = i === messages.length - 1;
    const content = [{ type: m.role === "user" ? "input_text" : "output_text", text: m.text }];
    if(isLast && m.role === "user" && image){
      content.push({ type: "input_image", image_url: image });   // current menu/food image only
    }
    input.push({ role: m.role, content });
  });
  return input;
}

export function buildResponsesRequest(env, { messages, image, context, anonId }){
  return {
    model: env.OPENAI_MODEL,
    instructions: buildInstructions(context),
    input: buildInput(messages, image),
    store: false,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    safety_identifier: anonId || randomId(),
    text: { format: { type: "json_schema", name: "hammy_reply", schema: REPLY_SCHEMA, strict: true } }
  };
}

export function extractOutputText(data){
  if(!data) return "";
  if(typeof data.output_text === "string" && data.output_text) return data.output_text;
  let out = "";
  const items = Array.isArray(data.output) ? data.output : [];
  for(const item of items){
    const content = Array.isArray(item.content) ? item.content : [];
    for(const part of content){
      if(part && part.type === "output_text" && typeof part.text === "string") out += part.text;
      if(part && part.type === "refusal") throw new Error("model_refusal");
    }
  }
  return out;
}

async function callOpenAI(env, payload, fetchImpl){
  const res = await fetchImpl(OPENAI_URL, {
    method: "POST",
    headers: { "Authorization": "Bearer " + env.OPENAI_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if(!res.ok){
    let detail = ""; try{ detail = (await res.text()).slice(0, 200); }catch(e){}
    const err = new Error("openai_http_" + res.status); err.detail = detail; throw err;
  }
  return res.json();
}

/* ---------- routes ---------- */
async function handleSession(request, env, cors){
  if(!env.COACH_ACCESS_CODE || !env.SESSION_SIGNING_SECRET) return json({ error: "coach_unavailable" }, 503, cors);
  let body; try{ body = await request.json(); }catch(e){ return json({ error: "bad_request" }, 400, cors); }
  const v = validateSessionBody(body);
  if(!v.ok) return json({ error: "unauthorized" }, 401, cors);   // generic: never reveal which part
  // constant-time compare via the session module's primitive is overkill here; do a length+xor compare
  const a = v.access_code, b = env.COACH_ACCESS_CODE;
  let ok = a.length === b.length, diff = a.length ^ b.length;
  for(let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  ok = diff === 0;
  if(!ok) return json({ error: "unauthorized" }, 401, cors);     // never log or echo the code
  const { token, payload } = await createSession(env.SESSION_SIGNING_SECRET);
  return json({ token, expires_at: payload.exp }, 200, cors);
}

async function handleChat(request, env, cors, deps){
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if(!token) return json({ error: "unauthorized" }, 401, cors);
  if(!env.SESSION_SIGNING_SECRET) return json({ error: "coach_unavailable" }, 503, cors);
  const session = await verifySession(token, env.SESSION_SIGNING_SECRET);
  if(!session) return json({ error: "unauthorized" }, 401, cors);   // missing/invalid/expired/modified

  if(!workerConfigured(env)) return json({ error: "coach_unavailable" }, 503, cors);

  let body; try{ body = await request.json(); }catch(e){ return json({ error: "bad_request" }, 400, cors); }
  const v = validateChatBody(body);
  if(!v.ok) return json({ error: v.error }, 400, cors);

  const payload = buildResponsesRequest(env, { messages: v.messages, image: v.image, context: v.context, anonId: typeof body.anon_id === "string" ? body.anon_id.slice(0, 64) : "" });

  let data;
  try{ data = await callOpenAI(env, payload, (deps && deps.fetch) || fetch); }
  catch(e){ return json({ error: "coach_unavailable" }, 502, cors); }

  let normalized;
  try{
    const text = extractOutputText(data);
    normalized = normalizeReply(JSON.parse(text));
  }catch(e){
    if(e && e.message === "model_refusal")
      return json({ reply: "I can't help with that one, but I'm here for your fitness and food questions. 🐹", options: [], follow_up_question: null, safety: "normal", hammy_mood: "neutral" }, 200, cors);
    return json({ error: "coach_unavailable" }, 502, cors);
  }
  return json(normalized, 200, cors);   // normalized data only — never the raw OpenAI object
}

/* ---------- entry ---------- */
export async function handle(request, env, deps){
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  const allowed = parseAllowedOrigins(env);
  const cors = corsHeaders(origin, allowed);

  if(request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  if(url.pathname === "/health" && request.method === "GET")
    return json({ ok: true, ready: workerConfigured(env) }, 200, cors);

  // browser routes require an allowed Origin (CORS is not auth, but we still gate it)
  const isBrowserRoute = url.pathname === "/session" || url.pathname === "/chat";
  if(isBrowserRoute && origin && !originAllowed(origin, allowed))
    return json({ error: "forbidden_origin" }, 403, cors);

  if(url.pathname === "/session" && request.method === "POST") return handleSession(request, env, cors);
  if(url.pathname === "/chat" && request.method === "POST") return handleChat(request, env, cors, deps);

  // reminders: all routes are origin-gated; all except GET /reminders/config require the session (checked inside)
  if(url.pathname.startsWith("/reminders/")){
    if(origin && !originAllowed(origin, allowed)) return json({ error: "forbidden_origin" }, 403, cors);
    return handleReminders(request, env, cors, deps);
  }

  // email digest test send — origin-gated; authorized by the X-Digest-Test-Code header (checked inside)
  if(url.pathname === "/digest/test" && request.method === "POST"){
    if(origin && !originAllowed(origin, allowed)) return json({ error: "forbidden_origin" }, 403, cors);
    return handleDigestTest(request, env, cors, deps);
  }

  return json({ error: "not_found" }, 404, cors);
}

export default {
  fetch: (request, env) => handle(request, env),
  // run BOTH schedulers; allSettled so one failing never breaks the other (reminders keep working)
  scheduled: (event, env, ctx) => { ctx.waitUntil(Promise.allSettled([runScheduled(env), runDigest(env)])); }
};
