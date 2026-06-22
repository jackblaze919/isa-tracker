/* reminders.js — Hammy's smart, deterministic push reminders.
   - Reuses the existing signed coach session (Authorization: Bearer <token>) for auth.
   - Stores only minimal completion flags in D1 (see migrations/0001_reminders.sql).
   - Never calls OpenAI. Notification copy is server-controlled and deterministic.
   The PURE logic (timezone math, quiet hours, due-category decision, copy) is separated from
   D1 I/O so it is fully unit-testable; runScheduled/route handlers take a `store` that is the
   D1 layer in production and an in-memory fake in tests. */

import { verifySession } from "./session.js";
import { bytesToB64url } from "./web-push.js";
import { sendNotification } from "./web-push.js";
import {
  REMINDER_CATEGORIES, validateSubscriptionBody, validatePreferencesBody, validateStatusBody, validatePauseBody, isValidTimezone
} from "./validation.js";

const enc = new TextEncoder();

export const DEFAULT_TIMES = { steps: "18:00", workout: "17:00", protein: "20:00", meals: "19:30", checkin: "16:00" };
export const DEFAULT_QUIET = { start: "21:00", end: "08:00" };
export const SEND_WINDOW_MIN = 30;          // a reminder may fire up to 30 min after its time
export const CRON_INTERVAL_MIN = 15;
const TEST_THROTTLE_MS = 30 * 1000;

/* ---------- pure time helpers ---------- */
export function toMin(hhmm){ const [h, m] = String(hhmm).split(":").map(Number); return h * 60 + m; }

// Current local date / minutes-of-day / day-of-week for an IANA timezone (DST-correct via Intl).
export function localParts(date, tz){
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short" });
  const p = {}; for(const part of fmt.formatToParts(date)) p[part.type] = part.value;
  let hour = parseInt(p.hour, 10); if(hour === 24) hour = 0;   // some engines render midnight as 24
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: hour * 60 + parseInt(p.minute, 10), dow };
}

export function inQuietHours(minutes, quietStart, quietEnd){
  const s = toMin(quietStart), e = toMin(quietEnd);
  if(s === e) return false;
  return s < e ? (minutes >= s && minutes < e) : (minutes >= s || minutes < e);   // wraps midnight
}

export function isPausedToday(prefs, localDate){ return !!prefs && prefs.paused_local_date === localDate; }

/* ---------- deterministic, server-controlled copy ---------- */
export function copyFor(category, status){
  switch(category){
    case "steps":
      return status && status.steps && status.steps.logged
        ? { title: "Hammy checking in 🐹", body: "You're still a little short of today's step target. A short walk still counts." }
        : { title: "Tiny feet check 🐹", body: "Your steps haven't been logged yet. A short walk still counts." };
    case "workout": return { title: "Hammy 🐹", body: "Today's workout isn't logged yet. The short version still counts. 💪" };
    case "protein": return { title: "Hammy 🐹", body: "Protein top-up time? Yogurt, milk, eggs, or chicken all work." };
    case "meals":   return { title: "Hammy 🐹", body: "One of today's meals is still unlogged. No rush—just don't forget to feed yourself." };
    case "checkin": return { title: "Hammy 🌷", body: "Tiny Sunday check-in when you're ready 🌷" };
    default: return { title: "Hammy 🐹", body: "Gentle check-in 🐹" };
  }
}
export const TEST_COPY = { title: "Hammy reminders are working 🐹", body: "I'll give you a gentle nudge when something important is still unfinished." };

export function buildPayload(category, status, localDate){
  const c = copyFor(category, status);
  return { title: c.title, body: c.body, category, date: localDate, tag: `hammy-${category}-${localDate}` };
}

/* ---------- the smart decision (pure) ---------- */
// Is a single category not-yet-complete and actionable, per the synced status?
function categoryIncomplete(category, status){
  const s = status && status[category];
  if(!s) return false;
  switch(category){
    case "steps":   return !s.complete;
    case "workout": return s.required && !s.complete;     // never on a rest day
    case "protein": return !s.complete;
    case "meals":   return !s.complete;
    case "checkin": return s.required && !s.complete;     // only when required (Sunday)
    default: return false;
  }
}

// Categories whose chosen time has arrived (within the window), are enabled, incomplete, and
// not already sent today. Does NOT consider quiet hours / pause — see categoriesToSend.
export function dueCategories(prefs, status, ctx){
  const { minutes, windowMin = SEND_WINDOW_MIN, alreadySent = new Set() } = ctx || {};
  const cats = (prefs && prefs.categories) || {};
  const out = [];
  for(const cat of REMINDER_CATEGORIES){
    const pref = cats[cat];
    if(!pref || !pref.enabled) continue;
    const t = toMin(pref.time);
    if(minutes < t || minutes > t + windowMin) continue;     // not in the send window
    if(alreadySent.has && alreadySent.has(cat)) continue;
    if(Array.isArray(alreadySent) && alreadySent.indexOf(cat) >= 0) continue;
    if(!categoryIncomplete(cat, status)) continue;           // completed / not required -> skip
    out.push(cat);
  }
  return out;
}

// Full gate: quiet hours + pause + reminders-enabled + a status row required.
export function categoriesToSend(prefs, status, ctx){
  if(!prefs || prefs.enabled === false) return [];
  if(!status) return [];                                      // no synced status -> don't guess
  if(isPausedToday(prefs, ctx.localDate)) return [];
  if(inQuietHours(ctx.minutes, prefs.quiet_start || DEFAULT_QUIET.start, prefs.quiet_end || DEFAULT_QUIET.end)) return [];
  return dueCategories(prefs, status, ctx);
}

/* ---------- stable, privacy-preserving user id ---------- */
export async function deriveUserId(secret, anonId){
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("hammy-reminder-user:" + anonId));
  return bytesToB64url(new Uint8Array(sig));
}
function validAnonId(s){ return typeof s === "string" && s.length >= 8 && s.length <= 128 && /^[A-Za-z0-9_\-]+$/.test(s); }

/* ---------- D1 store (the ONLY place with SQL; all parameterized) ---------- */
export function d1Store(db){
  return {
    async getPreferences(uid){
      const r = await db.prepare("SELECT timezone,quiet_start,quiet_end,paused_local_date,categories_json,enabled FROM reminder_preferences WHERE user_id=?").bind(uid).first();
      if(!r) return null;
      return { timezone: r.timezone, quiet_start: r.quiet_start, quiet_end: r.quiet_end, paused_local_date: r.paused_local_date, categories: JSON.parse(r.categories_json || "{}"), enabled: !!r.enabled };
    },
    async putPreferences(uid, p, now){
      await db.prepare("INSERT INTO reminder_preferences (user_id,timezone,quiet_start,quiet_end,categories_json,enabled,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET timezone=excluded.timezone,quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end,categories_json=excluded.categories_json,enabled=excluded.enabled,updated_at=excluded.updated_at")
        .bind(uid, p.timezone, p.quiet_start, p.quiet_end, JSON.stringify(p.categories), p.enabled ? 1 : 0, now).run();
    },
    async setEnabled(uid, enabled, now){
      await db.prepare("UPDATE reminder_preferences SET enabled=?,updated_at=? WHERE user_id=?").bind(enabled ? 1 : 0, now, uid).run();
    },
    async setPaused(uid, localDate, now){
      await db.prepare("INSERT INTO reminder_preferences (user_id,paused_local_date,updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET paused_local_date=excluded.paused_local_date,updated_at=excluded.updated_at").bind(uid, localDate, now).run();
    },
    async upsertSubscription(uid, sub, now){
      await db.prepare("INSERT INTO push_subscriptions (user_id,endpoint,p256dh,auth,expiration_time,enabled,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth,expiration_time=excluded.expiration_time,enabled=1,updated_at=excluded.updated_at")
        .bind(uid, sub.endpoint, sub.p256dh, sub.auth, sub.expiration_time, now, now).run();
    },
    async deleteSubscription(uid, endpoint){
      await db.prepare("DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?").bind(uid, endpoint).run();
    },
    async deleteSubscriptionByEndpoint(endpoint){
      await db.prepare("DELETE FROM push_subscriptions WHERE endpoint=?").bind(endpoint).run();
    },
    async activeSubscriptions(uid){
      const r = await db.prepare("SELECT endpoint,p256dh,auth FROM push_subscriptions WHERE user_id=? AND enabled=1").bind(uid).all();
      return (r.results || []).map(x => ({ endpoint: x.endpoint, keys: { p256dh: x.p256dh, auth: x.auth } }));
    },
    async putStatus(uid, localDate, tz, status, now){
      await db.prepare("INSERT INTO daily_status (user_id,local_date,timezone,status_json,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id,local_date) DO UPDATE SET timezone=excluded.timezone,status_json=excluded.status_json,updated_at=excluded.updated_at")
        .bind(uid, localDate, tz, JSON.stringify(status), now).run();
    },
    async getStatus(uid, localDate){
      const r = await db.prepare("SELECT status_json FROM daily_status WHERE user_id=? AND local_date=?").bind(uid, localDate).first();
      return r ? JSON.parse(r.status_json) : null;
    },
    async sentCategories(uid, localDate){
      const r = await db.prepare("SELECT category FROM reminder_log WHERE user_id=? AND local_date=?").bind(uid, localDate).all();
      return new Set((r.results || []).map(x => x.category));
    },
    async recordSent(uid, localDate, category, now, result){
      await db.prepare("INSERT INTO reminder_log (user_id,local_date,category,sent_at,delivery_count,last_result) VALUES (?,?,?,?,1,?) ON CONFLICT(user_id,local_date,category) DO UPDATE SET sent_at=excluded.sent_at,delivery_count=reminder_log.delivery_count+1,last_result=excluded.last_result")
        .bind(uid, localDate, category, now, result).run();
    },
    async lastTestAt(uid){
      const r = await db.prepare("SELECT sent_at FROM reminder_log WHERE user_id=? AND local_date='__test__' AND category='test'").bind(uid).first();
      return r ? r.sent_at : 0;
    },
    async markTest(uid, now){
      await db.prepare("INSERT INTO reminder_log (user_id,local_date,category,sent_at,delivery_count,last_result) VALUES (?,'__test__','test',?,1,'sent') ON CONFLICT(user_id,local_date,category) DO UPDATE SET sent_at=excluded.sent_at").bind(uid, now).run();
    },
    async allEnabledPreferences(){
      const r = await db.prepare("SELECT user_id,timezone,quiet_start,quiet_end,paused_local_date,categories_json,enabled FROM reminder_preferences WHERE enabled=1").all();
      return (r.results || []).map(x => ({ user_id: x.user_id, timezone: x.timezone, quiet_start: x.quiet_start, quiet_end: x.quiet_end, paused_local_date: x.paused_local_date, categories: JSON.parse(x.categories_json || "{}"), enabled: !!x.enabled }));
    },
    async deleteAllForUser(uid){
      for(const sql of ["DELETE FROM push_subscriptions WHERE user_id=?", "DELETE FROM reminder_preferences WHERE user_id=?", "DELETE FROM daily_status WHERE user_id=?", "DELETE FROM reminder_log WHERE user_id=?"])
        await db.prepare(sql).bind(uid).run();
    }
  };
}

/* ---------- helpers shared by routes ---------- */
function json(obj, status, headers){ return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...(headers || {}) } }); }
function publicConfig(env){ return { vapid_public_key: env.VAPID_PUBLIC_KEY || "", cron_interval_minutes: CRON_INTERVAL_MIN }; }
export function remindersConfigured(env){ return !!(env && env.REMINDERS_DB && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.SESSION_SIGNING_SECRET); }

async function authUser(request, env){
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if(!token) return { error: "unauthorized", status: 401 };
  const session = await verifySession(token, env.SESSION_SIGNING_SECRET);
  if(!session) return { error: "unauthorized", status: 401 };
  const anon = request.headers.get("X-Hammy-Anon") || "";
  if(!validAnonId(anon)) return { error: "bad_anon", status: 400 };
  const uid = await deriveUserId(env.SESSION_SIGNING_SECRET, anon);
  return { uid };
}

/* ---------- route dispatch (called from index.js handle()) ---------- */
export async function handleReminders(request, env, cors, deps){
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const store = (deps && deps.store) || (env.REMINDERS_DB ? d1Store(env.REMINDERS_DB) : null);
  const now = (deps && deps.now) || Date.now();

  // public config (no session needed; returns ONLY public values)
  if(path === "/reminders/config" && method === "GET") return json(publicConfig(env), 200, cors);

  if(!remindersConfigured(env)) return json({ error: "reminders_unavailable" }, 503, cors);

  const a = await authUser(request, env);
  if(a.error) return json({ error: a.error }, a.status, cors);
  const uid = a.uid;

  let body = null;
  if(method === "PUT" || method === "POST" || method === "DELETE"){
    try{ body = await request.json(); }catch(e){ body = {}; }
  }

  if(path === "/reminders/preferences" && method === "GET"){
    const p = await store.getPreferences(uid);
    return json({ preferences: p }, 200, cors);
  }
  if(path === "/reminders/preferences" && method === "PUT"){
    const v = validatePreferencesBody(body);
    if(!v.ok) return json({ error: v.error }, 400, cors);
    await store.putPreferences(uid, v.preferences, now);
    return json({ ok: true }, 200, cors);
  }
  if(path === "/reminders/subscribe" && method === "POST"){
    const v = validateSubscriptionBody(body);
    if(!v.ok) return json({ error: v.error }, 400, cors);
    await store.upsertSubscription(uid, v.subscription, now);
    return json({ ok: true }, 200, cors);
  }
  if(path === "/reminders/subscribe" && method === "DELETE"){
    const endpoint = body && body.endpoint;
    if(typeof endpoint !== "string" || !/^https:\/\//.test(endpoint)) return json({ error: "bad_endpoint" }, 400, cors);
    await store.deleteSubscription(uid, endpoint);
    return json({ ok: true }, 200, cors);
  }
  if(path === "/reminders/status" && method === "PUT"){
    const v = validateStatusBody(body);
    if(!v.ok) return json({ error: v.error }, 400, cors);
    await store.putStatus(uid, v.local_date, v.timezone, v.status, now);
    return json({ ok: true }, 200, cors);
  }
  if(path === "/reminders/pause-today" && method === "POST"){
    const v = validatePauseBody(body);
    if(!v.ok) return json({ error: v.error }, 400, cors);
    await store.setPaused(uid, v.local_date, now);
    return json({ ok: true }, 200, cors);
  }
  if(path === "/reminders/test" && method === "POST"){
    const last = await store.lastTestAt(uid);
    if(now - last < TEST_THROTTLE_MS) return json({ error: "rate_limited" }, 429, cors);
    const subs = await store.activeSubscriptions(uid);
    if(!subs.length) return json({ error: "no_subscription" }, 409, cors);
    await store.markTest(uid, now);
    const sender = (deps && deps.send) || ((sub, payload) => sendNotification(sub, payload, env, deps && deps.fetch));
    let ok = 0;
    for(const sub of subs){
      try{ const r = await sender(sub, { title: TEST_COPY.title, body: TEST_COPY.body, category: "test", tag: "hammy-test" }); if(r && r.status >= 200 && r.status < 300) ok++; if(r && (r.status === 404 || r.status === 410)) await store.deleteSubscriptionByEndpoint(sub.endpoint); }catch(e){}
    }
    return json({ ok: ok > 0, delivered: ok }, 200, cors);
  }
  if(path === "/reminders/data" && method === "DELETE"){
    await store.deleteAllForUser(uid);
    return json({ ok: true }, 200, cors);
  }
  return json({ error: "not_found" }, 404, cors);
}

/* ---------- scheduled runner (cron) ---------- */
export async function runScheduled(env, deps){
  const store = (deps && deps.store) || (env.REMINDERS_DB ? d1Store(env.REMINDERS_DB) : null);
  if(!store) return { users: 0, sent: 0 };
  const now = (deps && deps.now) || new Date();
  const sender = (deps && deps.send) || ((sub, payload) => sendNotification(sub, payload, env, deps && deps.fetch));

  const prefsList = await store.allEnabledPreferences();
  let sentTotal = 0;
  for(const prefs of prefsList){
    if(!isValidTimezone(prefs.timezone)) continue;
    const { date: localDate, minutes } = localParts(now, prefs.timezone);
    if(isPausedToday(prefs, localDate)) continue;
    if(inQuietHours(minutes, prefs.quiet_start || DEFAULT_QUIET.start, prefs.quiet_end || DEFAULT_QUIET.end)) continue;
    const status = await store.getStatus(prefs.user_id, localDate);
    if(!status) continue;
    const alreadySent = await store.sentCategories(prefs.user_id, localDate);
    const due = dueCategories(prefs, status, { localDate, minutes, alreadySent });
    if(!due.length) continue;

    const subs = await store.activeSubscriptions(prefs.user_id);
    if(!subs.length) continue;

    for(const category of due){
      const payload = buildPayload(category, status, localDate);
      let ok = 0, lastResult = "none";
      for(const sub of subs){
        try{
          const r = await sender(sub, payload);
          lastResult = String(r && r.status);
          if(r && r.status >= 200 && r.status < 300) ok++;
          if(r && (r.status === 404 || r.status === 410)) await store.deleteSubscriptionByEndpoint(sub.endpoint);
        }catch(e){ lastResult = "error"; }
      }
      if(ok > 0){ await store.recordSent(prefs.user_id, localDate, category, typeof now === "number" ? now : now.getTime(), lastResult); sentTotal++; }
    }
  }
  return { users: prefsList.length, sent: sentTotal };
}
