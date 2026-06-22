/* email-digest.js — ONE daily Hammy completion-summary email for Felipe.
   Completion/accountability only. Reads ONLY whitelisted fields from the existing D1
   daily_status table; raw status_json is never emailed. No OpenAI. Deterministic copy.
   At most one email per local date (enforced by email_digest_log unique constraint). */

import { localParts, toMin } from "./reminders.js";
import { bytesToB64url } from "./web-push.js";
import { sendEmail } from "./email-provider-resend.js";

const enc = new TextEncoder();
export const DIGEST_SEND_WINDOW_MIN = 30;
const TEST_THROTTLE_MS = 60 * 1000;

/* ---------- config helpers ---------- */
export function digestEnabled(env){ return String(env && env.DIGEST_ENABLED).toLowerCase() === "true"; }
export function digestConfigured(env){ return !!(env && env.REMINDERS_DB && env.RESEND_API_KEY && env.DIGEST_TO_EMAIL && env.DIGEST_FROM_EMAIL && env.SESSION_SIGNING_SECRET); }
function digestTime(env){ return (env && env.DIGEST_TIME) || "08:00"; }
function reportMode(env){ return (env && env.DIGEST_REPORT_MODE) || "yesterday"; }
function fallbackTz(env){ return (env && env.DIGEST_FALLBACK_TIMEZONE) || "America/Sao_Paulo"; }

/* ---------- dates ---------- */
function pad(n){ return (n < 10 ? "0" : "") + n; }
// previous calendar day of a YYYY-MM-DD string (DST-safe, pure date math)
export function previousDate(localDate){
  const [y, m, d] = localDate.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) - 86400000);
  return t.getUTCFullYear() + "-" + pad(t.getUTCMonth() + 1) + "-" + pad(t.getUTCDate());
}
export function reportDateFor(env, todayLocal){
  return reportMode(env) === "yesterday" ? previousDate(todayLocal) : todayLocal;  // default yesterday
}
const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MO = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function prettyDate(localDate){
  const [y, m, d] = localDate.split("-").map(Number);
  const wd = WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return wd + ", " + MO[m - 1] + " " + d;
}
function prettyTime(updatedAtMs, tz){
  if(!updatedAtMs) return null;
  try{ return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(updatedAtMs)); }
  catch(e){ return null; }
}
function comma(n){ return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

/* ---------- whitelist -> normalized summary (NEVER includes raw status_json) ---------- */
const ALLOWED = {
  steps: ["logged", "complete", "actual", "target"],
  workout: ["required", "logged", "complete"],
  protein: ["logged", "complete"],
  meals: ["logged_count", "total", "complete"]
};
export function buildSummary(statusObj, reportDate, tz, updatedAtMs){
  const s = statusObj || {};
  const pickBool = (o, k) => !!(o && o[k]);
  const pickNum = (o, k) => (o && typeof o[k] === "number" && isFinite(o[k]) ? o[k] : 0);
  return {
    local_date: reportDate,
    timezone: tz,
    last_synced: prettyTime(updatedAtMs, tz),     // null when never synced
    has_sync: !!statusObj,
    meals: { logged_count: pickNum(s.meals, "logged_count"), total: pickNum(s.meals, "total"), complete: pickBool(s.meals, "complete") },
    protein: { logged: pickBool(s.protein, "logged"), complete: pickBool(s.protein, "complete") },
    workout: { required: pickBool(s.workout, "required"), logged: pickBool(s.workout, "logged"), complete: pickBool(s.workout, "complete") },
    steps: { logged: pickBool(s.steps, "logged"), complete: pickBool(s.steps, "complete"), actual: pickNum(s.steps, "actual"), target: pickNum(s.steps, "target") }
  };
  // NOTE: any other field in statusObj (weight, checkin, chat, photos, calories, pain, medical…)
  // is intentionally ignored — only the keys in ALLOWED above are ever read.
}
export { ALLOWED };

/* ---------- deterministic copy (no OpenAI, no guilt, never "failed") ---------- */
function proteinLabel(p){ return p.complete ? "Done" : (p.logged ? "Still open" : "Not logged"); }
function workoutLabel(w){ return !w.required ? "Rest day" : (w.complete ? "Done" : (w.logged ? "Still open" : "Not logged")); }
function stepsLine(st, hasSync){
  if(!hasSync) return "Steps: no sync";
  if(!st.logged && !st.actual) return "Steps: not logged";
  return "Steps: " + comma(st.actual) + " / " + comma(st.target || 0);
}
function hammyNote(sum){
  if(!sum.has_sync) return "No sync yesterday, so nothing got logged — totally okay. Today's a fresh start. 🐹";
  const handled = [], open = [];
  (sum.meals.complete ? handled : open).push("meals");
  (sum.protein.complete ? handled : open).push("protein");
  if(sum.workout.required) (sum.workout.complete ? handled : open).push("workout");   // rest day: not counted either way
  (sum.steps.complete ? handled : open).push("steps");
  if(open.length === 0) return "Great day — everything was handled. So proud of her. 🐹";
  if(handled.length === 0) return "Quiet day on the tracker. That happens — today's a clean slate. 🐹";
  const join = (a) => a.length === 1 ? a[0] : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
  return "Pretty solid day. " + cap(join(handled)) + " " + (handled.length === 1 ? "was" : "were") + " handled; " + join(open) + " stayed open. No big deal. 🐹";
}
function cap(s){ return s.charAt(0).toUpperCase() + s.slice(1); }

export function renderEmail(env, sum){
  const modeWord = reportMode(env) === "yesterday" ? "Yesterday" : "Today";
  const subject = "🐹 Hammy summary — " + modeWord;
  const lines = [
    "Hammy daily summary 🐹",
    "",
    "Date: " + prettyDate(sum.local_date),
    "Last synced: " + (sum.last_synced || "no sync"),
    "",
    sum.has_sync ? ("Meals: " + sum.meals.logged_count + "/" + sum.meals.total + " complete") : "Meals: no sync",
    "Protein: " + (sum.has_sync ? proteinLabel(sum.protein) : "no sync"),
    "Workout: " + (sum.has_sync ? workoutLabel(sum.workout) : "no sync"),
    stepsLine(sum.steps, sum.has_sync),
    "",
    "Hammy note:",
    hammyNote(sum)
  ];
  return { subject, text: lines.join("\n") };
}

/* ---------- recipient hash (raw email never stored) ---------- */
export async function recipientHash(secret, email){
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("digest-recipient:" + String(email).toLowerCase()));
  return bytesToB64url(new Uint8Array(sig));
}

/* ---------- D1 store (parameterized; only the digest-relevant queries) ---------- */
export function digestStore(db){
  return {
    async latestTimezone(){
      const r = await db.prepare("SELECT timezone FROM daily_status ORDER BY updated_at DESC LIMIT 1").first();
      return r ? r.timezone : null;
    },
    async statusForDate(localDate){
      const r = await db.prepare("SELECT status_json, timezone, updated_at FROM daily_status WHERE local_date=? ORDER BY updated_at DESC LIMIT 1").bind(localDate).first();
      if(!r) return null;
      let obj = null; try{ obj = JSON.parse(r.status_json); }catch(e){ obj = null; }
      return { status: obj, timezone: r.timezone, updated_at: r.updated_at };
    },
    async getLog(date, hash){
      return db.prepare("SELECT status FROM email_digest_log WHERE digest_date=? AND recipient_hash=?").bind(date, hash).first();
    },
    async record(date, hash, status, now, providerId, error){
      await db.prepare("INSERT INTO email_digest_log (digest_date,recipient_hash,sent_at,status,provider_message_id,last_error) VALUES (?,?,?,?,?,?) ON CONFLICT(digest_date,recipient_hash) DO UPDATE SET sent_at=excluded.sent_at,status=excluded.status,provider_message_id=excluded.provider_message_id,last_error=excluded.last_error")
        .bind(date, hash, now, status, providerId || null, error || null).run();
    },
    async lastTestAt(){
      const r = await db.prepare("SELECT sent_at FROM email_digest_log WHERE digest_date='__test__' AND recipient_hash='__test__'").first();
      return r ? r.sent_at : 0;
    },
    async markTest(now){
      await db.prepare("INSERT INTO email_digest_log (digest_date,recipient_hash,sent_at,status) VALUES ('__test__','__test__',?, 'test') ON CONFLICT(digest_date,recipient_hash) DO UPDATE SET sent_at=excluded.sent_at").bind(now).run();
    }
  };
}

/* ---------- core: build + send one digest for a given report date ---------- */
async function buildAndSend(env, deps, store, reportDate, tz, hash, nowMs){
  const row = await store.statusForDate(reportDate);
  const sum = buildSummary(row ? row.status : null, reportDate, (row && row.timezone) || tz, row ? row.updated_at : null);
  const email = renderEmail(env, sum);
  const sender = (deps && deps.send) || ((m) => sendEmail(env, m, deps && deps.fetch));
  const result = await sender({ to: env.DIGEST_TO_EMAIL, subject: email.subject, text: email.text });
  await store.record(reportDate, hash, result.ok ? "sent" : "failed", nowMs, result.id, result.ok ? null : result.error);
  return { ok: result.ok, id: result.id, status: result.status, error: result.error, summary: sum };
}

/* ---------- scheduled digest run (called from the Worker scheduled handler) ---------- */
export async function runDigest(env, deps){
  if(!digestEnabled(env)) return { ran: false, reason: "disabled" };
  if(!digestConfigured(env)) return { ran: false, reason: "not_configured" };
  const store = (deps && deps.store) || digestStore(env.REMINDERS_DB);
  const now = (deps && deps.now) || new Date();
  const nowMs = typeof now === "number" ? now : now.getTime();

  const tz = (await store.latestTimezone()) || fallbackTz(env);
  let parts; try{ parts = localParts(now, tz); }catch(e){ return { ran: false, reason: "bad_timezone" }; }
  const sendAt = toMin(digestTime(env));
  if(parts.minutes < sendAt || parts.minutes > sendAt + DIGEST_SEND_WINDOW_MIN) return { ran: false, reason: "not_in_window" };

  const reportDate = reportDateFor(env, parts.date);
  const hash = await recipientHash(env.SESSION_SIGNING_SECRET, env.DIGEST_TO_EMAIL);
  const existing = await store.getLog(reportDate, hash);
  if(existing && existing.status === "sent") return { ran: false, reason: "already_sent" };

  const r = await buildAndSend(env, deps, store, reportDate, tz, hash, nowMs);
  return { ran: true, sent: r.ok, report_date: reportDate, id: r.id };
}

/* ---------- POST /digest/test ---------- */
function json(obj, status, headers){ return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...(headers || {}) } }); }
function ctEq(a, b){ if(typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false; let o = 0; for(let i = 0; i < a.length; i++) o |= a.charCodeAt(i) ^ b.charCodeAt(i); return o === 0; }

export async function handleDigestTest(request, env, cors, deps){
  if(!env.DIGEST_TEST_CODE) return json({ error: "digest_unavailable" }, 503, cors);
  const code = request.headers.get("X-Digest-Test-Code") || "";
  if(!code || !ctEq(code, env.DIGEST_TEST_CODE)) return json({ error: "unauthorized" }, 401, cors);   // missing or wrong
  if(!digestConfigured(env)) return json({ error: "digest_unavailable" }, 503, cors);

  const store = (deps && deps.store) || digestStore(env.REMINDERS_DB);
  const now = (deps && deps.now) || Date.now();
  const last = await store.lastTestAt();
  if(now - last < TEST_THROTTLE_MS) return json({ error: "rate_limited" }, 429, cors);

  let body = {}; try{ body = await request.json(); }catch(e){ body = {}; }
  const tz = (await store.latestTimezone()) || fallbackTz(env);
  let reportDate;
  if(typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) reportDate = body.date;
  else { let parts; try{ parts = localParts(typeof now === "number" ? new Date(now) : now, tz); }catch(e){ parts = { date: "1970-01-01" }; } reportDate = reportDateFor(env, parts.date); }

  await store.markTest(now);
  const hash = await recipientHash(env.SESSION_SIGNING_SECRET, env.DIGEST_TO_EMAIL);
  const r = await buildAndSend(env, deps, store, reportDate, tz, hash, typeof now === "number" ? now : now.getTime());
  // never return secrets or raw status_json — only a safe status + the report date
  return json({ ok: r.ok, report_date: reportDate, provider_message_id: r.ok ? (r.id || null) : null, error: r.ok ? null : (r.error || "send_failed") }, r.ok ? 200 : 502, cors);
}
