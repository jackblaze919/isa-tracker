import { test } from "node:test";
import assert from "node:assert/strict";
import { handle } from "../src/index.js";
import { createSession } from "../src/session.js";
import {
  importAsKeyPair, deriveContentKeys, encryptContent, b64urlToBytes, bytesToB64url, vapidAuthHeader
} from "../src/web-push.js";
import {
  validateSubscriptionBody, validatePreferencesBody, validateStatusBody, validatePauseBody,
  isValidTime, isValidTimezone, isValidLocalDate
} from "../src/validation.js";
import {
  dueCategories, categoriesToSend, inQuietHours, localParts, copyFor, TEST_COPY, buildPayload,
  deriveUserId, runScheduled, handleReminders, DEFAULT_TIMES
} from "../src/reminders.js";

/* ================= Web Push crypto (RFC 8291 §5 vector) ================= */
test("web-push: matches the RFC 8291 §5 worked example (ECDH/CEK/NONCE/message)", async () => {
  const V = {
    uaPub: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
    auth: "BTBZMqHH6r4Tts7J_aSIgg",
    asPub: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
    asPriv: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
    salt: "DGv6ra1nlYgDCS1FRnbzlw",
    text: "When I grow up, I want to be a watermelon",
    expCek: "oIhVW04MRdy2XN9CiKLxTg", expNonce: "4h_95klXJ5E_qnoN",
    expMsg: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN"
  };
  const as = await importAsKeyPair(V.asPriv, V.asPub);
  const uaKey = await crypto.subtle.importKey("raw", b64urlToBytes(V.uaPub), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const { cek, nonce } = await deriveContentKeys(b64urlToBytes(V.uaPub), b64urlToBytes(V.auth), as.publicBytes, ecdh, b64urlToBytes(V.salt));
  assert.equal(bytesToB64url(cek), V.expCek);
  assert.equal(bytesToB64url(nonce), V.expNonce);
  const body = await encryptContent(V.text, V.uaPub, V.auth, { salt: V.salt, asKeyPair: as });
  assert.equal(bytesToB64url(body), V.expMsg);
});

async function genVapid(){
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pub = bytesToB64url(new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey)));
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  return { pub, priv: bytesToB64url(b64urlToBytes(jwk.d)), verifyKey: kp.publicKey };
}

test("web-push: VAPID auth header is a valid ES256 JWT for the endpoint origin", async () => {
  const k = await genVapid();
  const env = { VAPID_PUBLIC_KEY: k.pub, VAPID_PRIVATE_KEY: k.priv, VAPID_SUBJECT: "https://jackblaze919.github.io/isa-tracker/" };
  const header = await vapidAuthHeader(env, "https://push.example", 1_700_000_000);
  assert.match(header, /^vapid t=.+, k=/);
  assert.ok(header.endsWith(k.pub));
  const jwt = header.slice(8, header.indexOf(", k="));
  const [h, p, s] = jwt.split(".");
  assert.ok(h && p && s);
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
  assert.equal(payload.aud, "https://push.example");
  assert.equal(payload.sub, "https://jackblaze919.github.io/isa-tracker/");
  // signature verifies against the public key
  const data = new TextEncoder().encode(h + "." + p);
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, k.verifyKey, b64urlToBytes(s), data);
  assert.equal(ok, true);
});

/* ================= validation ================= */
test("time / timezone / local-date validators", () => {
  assert.ok(isValidTime("18:00") && isValidTime("00:00") && isValidTime("23:59"));
  assert.ok(!isValidTime("24:00") && !isValidTime("7:5") && !isValidTime("aa:bb"));
  assert.ok(isValidTimezone("America/New_York") && isValidTimezone("Europe/Madrid"));
  assert.ok(!isValidTimezone("Mars/Phobos") && !isValidTimezone(""));
  assert.ok(isValidLocalDate("2026-06-22") && !isValidLocalDate("2026-13-01") && !isValidLocalDate("2026-6-2"));
});

test("subscription validation", () => {
  const good = { subscription: { endpoint: "https://fcm.googleapis.com/x", expirationTime: null, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } } };
  assert.equal(validateSubscriptionBody(good).ok, true);
  assert.equal(validateSubscriptionBody({}).error, "bad_subscription");
  assert.equal(validateSubscriptionBody({ subscription: { endpoint: "http://x", keys: {} } }).error, "bad_endpoint");
  assert.equal(validateSubscriptionBody({ subscription: { endpoint: "https://x", keys: { p256dh: "ok", auth: "" } } }).error, "bad_keys");
  assert.equal(validateSubscriptionBody({ subscription: { endpoint: "https://x", keys: { p256dh: "ok", auth: "ok" }, expirationTime: "soon" } }).error, "bad_expiration");
});

test("preferences validation (bad timezone / time / category)", () => {
  const base = { timezone: "America/New_York", quiet_start: "21:00", quiet_end: "08:00", categories: { steps: { enabled: true, time: "18:00" } } };
  assert.equal(validatePreferencesBody(base).ok, true);
  assert.equal(validatePreferencesBody({ ...base, timezone: "Nope/Nope" }).error, "bad_timezone");
  assert.equal(validatePreferencesBody({ ...base, quiet_start: "9pm" }).error, "bad_time");
  assert.equal(validatePreferencesBody({ ...base, categories: { lunch: { enabled: true, time: "12:00" } } }).error, "bad_category");
  assert.equal(validatePreferencesBody({ ...base, categories: { steps: { enabled: "yes", time: "18:00" } } }).error, "bad_category");
});

test("status schema rejects extra/private fields and bad types", () => {
  const ok = {
    local_date: "2026-06-22", timezone: "America/New_York",
    steps: { logged: true, complete: false, actual: 4200, target: 7500 },
    workout: { required: true, logged: false, complete: false },
    protein: { logged: false, complete: false },
    meals: { logged_count: 2, total: 4, complete: false },
    checkin: { required: false, complete: false }
  };
  assert.equal(validateStatusBody(ok).ok, true);
  assert.equal(validateStatusBody({ ...ok, weight: 130 }).error, "unexpected_field:weight");
  assert.match(validateStatusBody({ ...ok, steps: { ...ok.steps, calories: 1800 } }).error, /unexpected_field:steps\.calories/);
  assert.match(validateStatusBody({ ...ok, protein: { logged: "no", complete: false } }).error, /bad_status:protein\.logged/);
  assert.equal(validateStatusBody({ ...ok, local_date: "nope" }).error, "bad_local_date");
});

test("pause validation", () => {
  assert.equal(validatePauseBody({ local_date: "2026-06-22" }).ok, true);
  assert.equal(validatePauseBody({ local_date: "bad" }).error, "bad_local_date");
});

/* ================= pure scheduling logic ================= */
const PREFS = {
  timezone: "America/New_York", quiet_start: "21:00", quiet_end: "08:00", paused_local_date: null, enabled: true,
  categories: {
    steps: { enabled: true, time: "18:00" }, workout: { enabled: true, time: "17:00" },
    protein: { enabled: true, time: "20:00" }, meals: { enabled: true, time: "19:30" }, checkin: { enabled: true, time: "16:00" }
  }
};
const FULL_STATUS = {
  steps: { logged: false, complete: false, actual: 0, target: 7500 },
  workout: { required: true, logged: false, complete: false },
  protein: { logged: false, complete: false },
  meals: { logged_count: 1, total: 4, complete: false },
  checkin: { required: false, complete: false }
};

test("dueCategories: fires steps at its time when incomplete", () => {
  const due = dueCategories(PREFS, FULL_STATUS, { localDate: "2026-06-22", minutes: 18 * 60 + 5 });
  assert.ok(due.includes("steps"));
});
test("dueCategories: completed steps do NOT notify", () => {
  const s = { ...FULL_STATUS, steps: { logged: true, complete: true, actual: 8000, target: 7500 } };
  assert.ok(!dueCategories(PREFS, s, { localDate: "d", minutes: 18 * 60 + 5 }).includes("steps"));
});
test("dueCategories: before time and after window do not fire", () => {
  assert.ok(!dueCategories(PREFS, FULL_STATUS, { localDate: "d", minutes: 17 * 60 + 59 }).includes("steps"));
  assert.ok(!dueCategories(PREFS, FULL_STATUS, { localDate: "d", minutes: 18 * 60 + 31 }).includes("steps"));
});
test("dueCategories: workout skipped on rest day (required:false) and when complete", () => {
  const rest = { ...FULL_STATUS, workout: { required: false, logged: false, complete: false } };
  assert.ok(!dueCategories(PREFS, rest, { localDate: "d", minutes: 17 * 60 + 1 }).includes("workout"));
  const done = { ...FULL_STATUS, workout: { required: true, logged: true, complete: true } };
  assert.ok(!dueCategories(PREFS, done, { localDate: "d", minutes: 17 * 60 + 1 }).includes("workout"));
});
test("dueCategories: protein completed does not notify", () => {
  const s = { ...FULL_STATUS, protein: { logged: true, complete: true } };
  assert.ok(!dueCategories(PREFS, s, { localDate: "d", minutes: 20 * 60 + 1 }).includes("protein"));
});
test("dueCategories: checkin only when required (Sunday)", () => {
  assert.ok(!dueCategories(PREFS, FULL_STATUS, { localDate: "d", minutes: 16 * 60 + 1 }).includes("checkin"));
  const sun = { ...FULL_STATUS, checkin: { required: true, complete: false } };
  assert.ok(dueCategories(PREFS, sun, { localDate: "d", minutes: 16 * 60 + 1 }).includes("checkin"));
});
test("dueCategories: already-sent category is not repeated", () => {
  const due = dueCategories(PREFS, FULL_STATUS, { localDate: "d", minutes: 18 * 60 + 5, alreadySent: new Set(["steps"]) });
  assert.ok(!due.includes("steps"));
});

test("inQuietHours wraps midnight (21:00–08:00)", () => {
  assert.ok(inQuietHours(22 * 60, "21:00", "08:00"));
  assert.ok(inQuietHours(2 * 60, "21:00", "08:00"));
  assert.ok(!inQuietHours(12 * 60, "21:00", "08:00"));
});

test("categoriesToSend: quiet hours, pause, no-status, and disabled all block", () => {
  const ctx = { localDate: "2026-06-22", minutes: 22 * 60 };               // inside quiet
  assert.deepEqual(categoriesToSend(PREFS, FULL_STATUS, ctx), []);
  const paused = { ...PREFS, paused_local_date: "2026-06-22" };
  assert.deepEqual(categoriesToSend(paused, FULL_STATUS, { localDate: "2026-06-22", minutes: 18 * 60 + 5 }), []);
  assert.deepEqual(categoriesToSend(PREFS, null, { localDate: "2026-06-22", minutes: 18 * 60 + 5 }), []);
  assert.deepEqual(categoriesToSend({ ...PREFS, enabled: false }, FULL_STATUS, { localDate: "2026-06-22", minutes: 18 * 60 + 5 }), []);
});

test("localParts handles timezone + daylight saving", () => {
  const summer = localParts(new Date("2026-06-22T18:30:00Z"), "America/New_York"); // EDT -4
  assert.equal(summer.date, "2026-06-22"); assert.equal(summer.minutes, 14 * 60 + 30); assert.equal(summer.dow, 1);
  const winter = localParts(new Date("2026-01-15T18:30:00Z"), "America/New_York"); // EST -5
  assert.equal(winter.minutes, 13 * 60 + 30);
});

test("copy is deterministic and matches spec", () => {
  assert.match(copyFor("steps", { steps: { logged: false } }).title, /Tiny feet check/);
  assert.match(copyFor("steps", { steps: { logged: true } }).body, /short of today's step target/);
  assert.match(copyFor("workout").body, /workout isn't logged yet/);
  assert.match(copyFor("protein").body, /Protein top-up/);
  assert.match(copyFor("meals").body, /one of today's meals|meals is still unlogged/i);
  assert.match(copyFor("checkin").body, /Sunday check-in/);
  assert.match(TEST_COPY.title, /reminders are working/);
  assert.equal(buildPayload("steps", FULL_STATUS, "2026-06-22").tag, "hammy-steps-2026-06-22");
});

test("default reminder times match spec", () => {
  assert.deepEqual(DEFAULT_TIMES, { steps: "18:00", workout: "17:00", protein: "20:00", meals: "19:30", checkin: "16:00" });
});

/* ================= in-memory store + runScheduled ================= */
function memStore(seed){
  const s = { prefs: new Map(), subs: [], status: new Map(), log: new Map(), test: new Map(), ...seed };
  const key = (u, d) => u + "|" + d;
  return {
    _state: s,
    async getPreferences(u){ return s.prefs.get(u) || null; },
    async putPreferences(u, p){ s.prefs.set(u, { ...p, user_id: u }); },
    async setEnabled(u, e){ const p = s.prefs.get(u); if(p) p.enabled = e; },
    async setPaused(u, d){ const p = s.prefs.get(u) || { user_id: u, categories: {}, enabled: true }; p.paused_local_date = d; s.prefs.set(u, p); },
    async upsertSubscription(u, sub){ s.subs = s.subs.filter(x => x.endpoint !== sub.endpoint); s.subs.push({ user_id: u, endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth }, enabled: 1 }); },
    async deleteSubscription(u, ep){ s.subs = s.subs.filter(x => !(x.user_id === u && x.endpoint === ep)); },
    async deleteSubscriptionByEndpoint(ep){ s.subs = s.subs.filter(x => x.endpoint !== ep); },
    async activeSubscriptions(u){ return s.subs.filter(x => x.user_id === u && x.enabled).map(x => ({ endpoint: x.endpoint, keys: x.keys })); },
    async putStatus(u, d, tz, st){ s.status.set(key(u, d), st); },
    async getStatus(u, d){ return s.status.get(key(u, d)) || null; },
    async sentCategories(u, d){ return s.log.get(key(u, d)) || new Set(); },
    async recordSent(u, d, c){ const k = key(u, d); if(!s.log.has(k)) s.log.set(k, new Set()); s.log.get(k).add(c); },
    async lastTestAt(u){ return s.test.get(u) || 0; },
    async markTest(u, now){ s.test.set(u, now); },
    async allEnabledPreferences(){ return [...s.prefs.values()].filter(p => p.enabled); },
    async deleteAllForUser(u){ s.prefs.delete(u); s.subs = s.subs.filter(x => x.user_id !== u); }
  };
}

test("runScheduled: notifies incomplete category, records log, no double-send, no OpenAI", async () => {
  const uid = "u1";
  const store = memStore();
  store._state.prefs.set(uid, { user_id: uid, ...PREFS });
  await store.upsertSubscription(uid, { endpoint: "https://push.example/a", p256dh: "p", auth: "a" });
  await store.putStatus(uid, "2026-06-22", "America/New_York", FULL_STATUS);
  const sends = [];
  let openaiCalled = false;
  const fetchImpl = () => { openaiCalled = true; return { ok: true }; };
  const send = (sub, payload) => { sends.push({ ep: sub.endpoint, cat: payload.category }); return { status: 201 }; };
  const now = new Date("2026-06-22T22:05:00Z"); // 18:05 EDT -> steps window
  const r1 = await runScheduled({ REMINDERS_DB: {} }, { store, send, now, fetch: fetchImpl });
  assert.equal(r1.sent, 1);
  assert.deepEqual(sends.map(x => x.cat), ["steps"]);
  // second run same minute -> already logged -> no resend
  const r2 = await runScheduled({ REMINDERS_DB: {} }, { store, send, now });
  assert.equal(r2.sent, 0);
  assert.equal(openaiCalled, false);
});

test("runScheduled: completed steps do not notify", async () => {
  const uid = "u2"; const store = memStore();
  store._state.prefs.set(uid, { user_id: uid, ...PREFS });
  await store.upsertSubscription(uid, { endpoint: "https://push.example/b", p256dh: "p", auth: "a" });
  await store.putStatus(uid, "2026-06-22", "America/New_York", { ...FULL_STATUS, steps: { logged: true, complete: true, actual: 9000, target: 7500 } });
  const sends = [];
  await runScheduled({ REMINDERS_DB: {} }, { store, send: (s, p) => { sends.push(p.category); return { status: 201 }; }, now: new Date("2026-06-22T22:05:00Z") });
  assert.ok(!sends.includes("steps"));
});

test("runScheduled: dead subscription (410) is removed", async () => {
  const uid = "u3"; const store = memStore();
  store._state.prefs.set(uid, { user_id: uid, ...PREFS });
  await store.upsertSubscription(uid, { endpoint: "https://push.example/dead", p256dh: "p", auth: "a" });
  await store.putStatus(uid, "2026-06-22", "America/New_York", FULL_STATUS);
  await runScheduled({ REMINDERS_DB: {} }, { store, send: () => ({ status: 410 }), now: new Date("2026-06-22T22:05:00Z") });
  assert.equal((await store.activeSubscriptions(uid)).length, 0);
});

/* ================= route handler tests (through handle()) ================= */
const ORIGIN = "https://jackblaze919.github.io";
function baseEnv(extra){
  return { ALLOWED_ORIGINS: ORIGIN, SESSION_SIGNING_SECRET: "sek-123", REMINDERS_DB: {}, VAPID_PUBLIC_KEY: "BPpublic", VAPID_PRIVATE_KEY: "privsecret", VAPID_SUBJECT: "https://x/", OPENAI_API_KEY: "x", OPENAI_MODEL: "m", COACH_ACCESS_CODE: "c", ...extra };
}
function reqOf(method, path, { token, anon, body, origin } = {}){
  const headers = {}; if(token) headers.Authorization = "Bearer " + token; if(anon) headers["X-Hammy-Anon"] = anon; if(origin) headers.Origin = origin; if(body) headers["Content-Type"] = "application/json";
  return new Request("https://worker.example" + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

test("GET /reminders/config returns ONLY public values (no secrets)", async () => {
  const res = await handle(reqOf("GET", "/reminders/config", { origin: ORIGIN }), baseEnv(), {});
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(data).sort(), ["cron_interval_minutes", "vapid_public_key"]);
  assert.equal(data.vapid_public_key, "BPpublic");
  const raw = JSON.stringify(data);
  assert.ok(!raw.includes("privsecret") && !raw.includes("VAPID_PRIVATE") && !raw.includes("sek-123") && !raw.includes("OPENAI"));
});

test("reminder routes reject missing/invalid token and bad anon", async () => {
  const env = baseEnv();
  let res = await handle(reqOf("GET", "/reminders/preferences", { origin: ORIGIN }), env, {});
  assert.equal(res.status, 401);
  res = await handle(reqOf("GET", "/reminders/preferences", { origin: ORIGIN, token: "garbage.token", anon: "anon12345" }), env, {});
  assert.equal(res.status, 401);
  const { token } = await createSession(env.SESSION_SIGNING_SECRET);
  res = await handle(reqOf("GET", "/reminders/preferences", { origin: ORIGIN, token, anon: "!!" }), env, {});
  assert.equal(res.status, 400); // bad anon
});

test("reminder routes reject a disallowed origin (403)", async () => {
  const env = baseEnv();
  const { token } = await createSession(env.SESSION_SIGNING_SECRET);
  const res = await handle(reqOf("GET", "/reminders/preferences", { origin: "https://evil.example", token, anon: "anon12345" }), env, {});
  assert.equal(res.status, 403);
});

test("preferences round-trip + subscribe + status via handle() with injected store", async () => {
  const env = baseEnv();
  const { token } = await createSession(env.SESSION_SIGNING_SECRET);
  const store = memStore();
  const deps = { store };
  const anon = "anon-abcdef12";
  // save prefs
  let res = await handle(reqOf("PUT", "/reminders/preferences", { origin: ORIGIN, token, anon, body: { timezone: "America/New_York", quiet_start: "21:00", quiet_end: "08:00", categories: { steps: { enabled: true, time: "18:00" } }, enabled: true } }), env, deps);
  assert.equal(res.status, 200);
  // read back
  res = await handle(reqOf("GET", "/reminders/preferences", { origin: ORIGIN, token, anon }), env, deps);
  const got = await res.json();
  assert.equal(got.preferences.timezone, "America/New_York");
  // subscribe
  res = await handle(reqOf("POST", "/reminders/subscribe", { origin: ORIGIN, token, anon, body: { subscription: { endpoint: "https://push.example/x", keys: { p256dh: "BNcRdreALRFX", auth: "tBHItJI5svb" } } } }), env, deps);
  assert.equal(res.status, 200);
  assert.equal(store._state.subs.length, 1);
  // duplicate subscribe -> still one row
  await handle(reqOf("POST", "/reminders/subscribe", { origin: ORIGIN, token, anon, body: { subscription: { endpoint: "https://push.example/x", keys: { p256dh: "BNcRdreALRFX", auth: "tBHItJI5svb" } } } }), env, deps);
  assert.equal(store._state.subs.length, 1);
  // status with extra field -> 400
  res = await handle(reqOf("PUT", "/reminders/status", { origin: ORIGIN, token, anon, body: { local_date: "2026-06-22", timezone: "America/New_York", steps: { logged: false, complete: false, actual: 0, target: 7500 }, workout: { required: true, logged: false, complete: false }, protein: { logged: false, complete: false }, meals: { logged_count: 0, total: 4, complete: false }, checkin: { required: false, complete: false }, weight: 130 } }), env, deps);
  assert.equal(res.status, 400);
});

test("POST /reminders/test is rate-limited", async () => {
  const env = baseEnv();
  const { token } = await createSession(env.SESSION_SIGNING_SECRET);
  const store = memStore(); const anon = "anon-test1234";
  const uid = await deriveUserId(env.SESSION_SIGNING_SECRET, anon);
  await store.upsertSubscription(uid, { endpoint: "https://push.example/t", p256dh: "p", auth: "a" });
  const deps = { store, send: () => ({ status: 201 }) };
  let res = await handle(reqOf("POST", "/reminders/test", { origin: ORIGIN, token, anon, body: {} }), env, deps);
  assert.equal((await res.json()).ok, true);
  res = await handle(reqOf("POST", "/reminders/test", { origin: ORIGIN, token, anon, body: {} }), env, deps);
  assert.equal(res.status, 429);
});

test("503 when reminders not configured (no D1 / VAPID)", async () => {
  const env = baseEnv({ REMINDERS_DB: undefined, VAPID_PUBLIC_KEY: "" });
  const { token } = await createSession(env.SESSION_SIGNING_SECRET);
  const res = await handle(reqOf("GET", "/reminders/preferences", { origin: ORIGIN, token, anon: "anon12345" }), env, {});
  assert.equal(res.status, 503);
});
