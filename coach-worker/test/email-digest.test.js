import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handle } from "../src/index.js";
import {
  buildSummary, renderEmail, previousDate, reportDateFor, runDigest, handleDigestTest,
  recipientHash, digestEnabled, ALLOWED
} from "../src/email-digest.js";
import { sendEmail, buildResendRequest } from "../src/email-provider-resend.js";

const TZ = "America/Sao_Paulo";
const STATUS_WITH_EXTRAS = {
  steps: { logged: true, complete: false, actual: 6420, target: 7500 },
  workout: { required: true, logged: true, complete: true },
  protein: { logged: true, complete: true },
  meals: { logged_count: 3, total: 4, complete: false },
  // everything below MUST be ignored:
  checkin: { required: false, complete: false },
  weight: 172.5, measurements: { waist: 70 }, chat: ["secret chat message"],
  photos: ["data:image/jpeg;base64,SECRET"], calories: 1850, pain: "knee hurts", medical: "private note", foods: ["chicken", "rice"]
};

/* ---------- whitelist / privacy ---------- */
test("buildSummary reads ONLY whitelisted fields; ignores weight/measurements/chat/photos/calories/pain/medical/foods/checkin", () => {
  const sum = buildSummary(STATUS_WITH_EXTRAS, "2026-06-21", TZ, 1750000000000);
  assert.deepEqual(Object.keys(sum).sort(), ["has_sync", "last_synced", "local_date", "meals", "protein", "steps", "timezone", "workout"]);
  assert.deepEqual(Object.keys(sum.steps).sort(), ["actual", "complete", "logged", "target"]);
  assert.deepEqual(Object.keys(sum.workout).sort(), ["complete", "logged", "required"]);
  assert.deepEqual(Object.keys(sum.protein).sort(), ["complete", "logged"]);
  assert.deepEqual(Object.keys(sum.meals).sort(), ["complete", "logged_count", "total"]);
  const blob = JSON.stringify(sum);
  for(const forbidden of ["172.5", "waist", "secret chat", "data:image", "1850", "knee", "private note", "chicken", "checkin"])
    assert.ok(!blob.includes(forbidden), "summary leaked: " + forbidden);
  assert.deepEqual(ALLOWED, { steps: ["logged", "complete", "actual", "target"], workout: ["required", "logged", "complete"], protein: ["logged", "complete"], meals: ["logged_count", "total", "complete"] });
});

test("rendered email never contains raw status_json or any forbidden private data", () => {
  const env = { DIGEST_REPORT_MODE: "yesterday" };
  const { subject, text } = renderEmail(env, buildSummary(STATUS_WITH_EXTRAS, "2026-06-21", TZ, 1750000000000));
  assert.match(subject, /Hammy summary — Yesterday/);
  for(const forbidden of ["status_json", "172.5", "waist", "secret chat", "data:image", "1850", "knee", "private note", "chicken", "checkin", "weight", "measurement"])
    assert.ok(!text.toLowerCase().includes(forbidden.toLowerCase()), "email leaked: " + forbidden);
  assert.ok(!/fail/i.test(text), "email must never say 'failed'");
});

/* ---------- formatting ---------- */
test("formatting: meals count, steps actual/target with commas, protein/workout labels", () => {
  const env = {};
  const sum = buildSummary(STATUS_WITH_EXTRAS, "2026-06-21", TZ, 1750000000000);
  const { text } = renderEmail(env, sum);
  assert.match(text, /Meals: 3\/4 complete/);
  assert.match(text, /Protein: Done/);
  assert.match(text, /Workout: Done/);
  assert.match(text, /Steps: 6,420 \/ 7,500/);
});

test("formatting: workout rest day", () => {
  const sum = buildSummary({ ...STATUS_WITH_EXTRAS, workout: { required: false, logged: false, complete: false } }, "2026-06-21", TZ, 1);
  assert.match(renderEmail({}, sum).text, /Workout: Rest day/);
});

test("formatting: no-data day -> 'no sync' everywhere, never throws", () => {
  const sum = buildSummary(null, "2026-06-21", TZ, null);
  assert.equal(sum.has_sync, false);
  const { text } = renderEmail({}, sum);
  assert.match(text, /Last synced: no sync/);
  assert.match(text, /Meals: no sync/);
  assert.match(text, /Steps: no sync/);
  assert.match(text, /fresh start/i);
});

test("formatting: steps not logged vs logged", () => {
  const notLogged = buildSummary({ ...STATUS_WITH_EXTRAS, steps: { logged: false, complete: false, actual: 0, target: 7500 } }, "d", TZ, 1);
  assert.match(renderEmail({}, notLogged).text, /Steps: not logged/);
});

/* ---------- dates / mode ---------- */
test("report date defaults to yesterday", () => {
  assert.equal(previousDate("2026-06-22"), "2026-06-21");
  assert.equal(previousDate("2026-03-01"), "2026-02-28");
  assert.equal(reportDateFor({ DIGEST_REPORT_MODE: "yesterday" }, "2026-06-22"), "2026-06-21");
  assert.equal(reportDateFor({}, "2026-06-22"), "2026-06-21"); // default yesterday
  assert.equal(digestEnabled({ DIGEST_ENABLED: "true" }), true);
  assert.equal(digestEnabled({ DIGEST_ENABLED: "false" }), false);
});

/* ---------- Resend provider ---------- */
test("Resend request shape + safe failures", async () => {
  const env = { RESEND_API_KEY: "re_x", DIGEST_TO_EMAIL: "felipe@example.com", DIGEST_FROM_EMAIL: "Hammy <h@x.com>" };
  const body = buildResendRequest(env, { subject: "s", text: "t" });
  assert.deepEqual(body, { from: "Hammy <h@x.com>", to: ["felipe@example.com"], subject: "s", text: "t" });
  let captured = null;
  const fakeFetch = (url, opts) => { captured = { url, opts }; return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ id: "msg_1" }) }); };
  const r = await sendEmail(env, { to: "felipe@example.com", subject: "s", text: "t" }, fakeFetch);
  assert.equal(r.ok, true); assert.equal(r.id, "msg_1");
  assert.equal(captured.url, "https://api.resend.com/emails");
  assert.match(captured.opts.headers.Authorization, /^Bearer re_x$/);
  // missing key / to fail safely (no throw)
  assert.equal((await sendEmail({}, { subject: "s", text: "t" })).error, "missing_resend_api_key");
  assert.equal((await sendEmail({ RESEND_API_KEY: "k", DIGEST_FROM_EMAIL: "f" }, { subject: "s", text: "t" })).error, "missing_to_email");
});

/* ---------- in-memory store + runDigest ---------- */
function memStore(seed){
  const s = { statuses: new Map(), logs: new Map(), test: 0, ...seed };
  return {
    _s: s,
    async latestTimezone(){ let best = null, t = -1; for(const v of s.statuses.values()) if(v.updated_at > t){ t = v.updated_at; best = v.timezone; } return best; },
    async statusForDate(d){ return s.statuses.get(d) || null; },
    async getLog(d, h){ return s.logs.get(d + "|" + h) || null; },
    async record(d, h, status, now, id, err){ s.logs.set(d + "|" + h, { status, provider_message_id: id, last_error: err, sent_at: now }); },
    async lastTestAt(){ return s.test; },
    async markTest(now){ s.test = now; }
  };
}
function digestEnv(extra){
  return { DIGEST_ENABLED: "true", DIGEST_TIME: "08:00", DIGEST_REPORT_MODE: "yesterday", DIGEST_FALLBACK_TIMEZONE: TZ, REMINDERS_DB: {}, RESEND_API_KEY: "re_x", DIGEST_TO_EMAIL: "felipe@example.com", DIGEST_FROM_EMAIL: "Hammy <h@x.com>", SESSION_SIGNING_SECRET: "sek-123", ...extra };
}
// 2026-06-22 08:10 in Sao_Paulo (UTC-3) = 11:10Z -> in the 08:00 window; report date = 2026-06-21
const NOW_IN_WINDOW = new Date("2026-06-22T11:10:00Z");
function seedStore(){ const st = memStore(); st._s.statuses.set("2026-06-21", { status: STATUS_WITH_EXTRAS, timezone: TZ, updated_at: 1750000000000 }); return st; }

test("runDigest: sends for yesterday in the morning window and records provider id", async () => {
  const store = seedStore(); const sends = [];
  const send = (m) => { sends.push(m); return { ok: true, id: "msg_42" }; };
  const r = await runDigest(digestEnv(), { store, send, now: NOW_IN_WINDOW });
  assert.equal(r.ran, true); assert.equal(r.sent, true); assert.equal(r.report_date, "2026-06-21"); assert.equal(r.id, "msg_42");
  assert.equal(sends.length, 1);
  assert.match(sends[0].subject, /Yesterday/);
  const hash = await recipientHash("sek-123", "felipe@example.com");
  assert.equal(store._s.logs.get("2026-06-21|" + hash).status, "sent");
  assert.equal(store._s.logs.get("2026-06-21|" + hash).provider_message_id, "msg_42");
});

test("runDigest: duplicate daily digest is blocked by the log", async () => {
  const store = seedStore(); let count = 0;
  const send = () => { count++; return { ok: true, id: "m" }; };
  await runDigest(digestEnv(), { store, send, now: NOW_IN_WINDOW });
  const r2 = await runDigest(digestEnv(), { store, send, now: NOW_IN_WINDOW });
  assert.equal(count, 1);
  assert.equal(r2.ran, false); assert.equal(r2.reason, "already_sent");
});

test("runDigest: failed send records failure (status=failed)", async () => {
  const store = seedStore();
  const send = () => ({ ok: false, status: 401, error: "provider_http_401" });
  const r = await runDigest(digestEnv(), { store, send, now: NOW_IN_WINDOW });
  assert.equal(r.sent, false);
  const hash = await recipientHash("sek-123", "felipe@example.com");
  assert.equal(store._s.logs.get("2026-06-21|" + hash).status, "failed");
});

test("runDigest: not in window / disabled -> does not send", async () => {
  const store = seedStore(); let count = 0; const send = () => { count++; return { ok: true }; };
  const outOfWindow = new Date("2026-06-22T20:00:00Z"); // 17:00 local
  assert.equal((await runDigest(digestEnv(), { store, send, now: outOfWindow })).reason, "not_in_window");
  assert.equal((await runDigest(digestEnv({ DIGEST_ENABLED: "false" }), { store, send, now: NOW_IN_WINDOW })).reason, "disabled");
  assert.equal(count, 0);
});

test("runDigest: never calls OpenAI (only the email provider)", async () => {
  const store = seedStore(); const urls = [];
  const fetchSpy = (url) => { urls.push(String(url)); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ id: "x" }) }); };
  await runDigest(digestEnv(), { store, now: NOW_IN_WINDOW, fetch: fetchSpy });   // no deps.send -> uses sendEmail(env, m, fetch)
  assert.ok(urls.length >= 1);
  assert.ok(urls.every(u => !/openai|anthropic/i.test(u)));
  assert.ok(urls.some(u => u.includes("api.resend.com")));
});

/* ---------- /digest/test route (through handle) ---------- */
const ORIGIN = "https://jackblaze919.github.io";
function tEnv(extra){ return digestEnv({ ALLOWED_ORIGINS: ORIGIN, DIGEST_TEST_CODE: "secretcode", OPENAI_API_KEY: "x", OPENAI_MODEL: "m", COACH_ACCESS_CODE: "c", ...extra }); }
function dreq(code, body, origin){ const h = { "Content-Type": "application/json" }; if(code !== null) h["X-Digest-Test-Code"] = code; if(origin) h.Origin = origin; return new Request("https://w.example/digest/test", { method: "POST", headers: h, body: JSON.stringify(body || {}) }); }

test("/digest/test: missing or wrong code -> 401", async () => {
  const env = tEnv(); const deps = { store: seedStore(), send: () => ({ ok: true, id: "m" }) };
  assert.equal((await handle(dreq(null, {}, ORIGIN), env, deps)).status, 401);
  assert.equal((await handle(dreq("wrong", {}, ORIGIN), env, deps)).status, 401);
});

test("/digest/test: disallowed origin -> 403", async () => {
  const res = await handle(dreq("secretcode", {}, "https://evil.example"), tEnv(), { store: seedStore(), send: () => ({ ok: true }) });
  assert.equal(res.status, 403);
});

test("/digest/test: correct code sends + returns NO secrets / NO status_json", async () => {
  const env = tEnv(); const store = seedStore();
  const res = await handle(dreq("secretcode", { date: "2026-06-21" }, ORIGIN), env, { store, send: () => ({ ok: true, id: "msg_test" }) });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true); assert.equal(data.report_date, "2026-06-21"); assert.equal(data.provider_message_id, "msg_test");
  const blob = JSON.stringify(data);
  for(const secret of ["re_x", "secretcode", "sek-123", "status_json", "felipe@example.com", "OPENAI", "172.5", "knee", "chicken"])
    assert.ok(!blob.includes(secret), "/digest/test leaked: " + secret);
});

test("/digest/test: rate-limited on rapid repeat", async () => {
  const env = tEnv(); const store = seedStore(); const deps = { store, send: () => ({ ok: true, id: "m" }), now: 1_000_000 };
  assert.equal((await handle(dreq("secretcode", {}, ORIGIN), env, deps)).status, 200);
  assert.equal((await handle(dreq("secretcode", {}, ORIGIN), env, deps)).status, 429);
});

test("/digest/test: missing RESEND_API_KEY or DIGEST_TO_EMAIL fails safely (503, no throw)", async () => {
  assert.equal((await handle(dreq("secretcode", {}, ORIGIN), tEnv({ RESEND_API_KEY: undefined }), { store: seedStore() })).status, 503);
  assert.equal((await handle(dreq("secretcode", {}, ORIGIN), tEnv({ DIGEST_TO_EMAIL: undefined }), { store: seedStore() })).status, 503);
});

/* ---------- scheduled handler still runs reminders; meta checks ---------- */
test("scheduled handler runs the reminders scheduler without throwing (digest didn't break it)", async () => {
  const sql = [];
  const fakeD1 = { prepare(q){ sql.push(q); const st = { bind(){ return st; }, async first(){ return null; }, async all(){ return { results: [] }; }, async run(){ return {}; } }; return st; } };
  const env = { ALLOWED_ORIGINS: ORIGIN, SESSION_SIGNING_SECRET: "sek", REMINDERS_DB: fakeD1, DIGEST_ENABLED: "false" };
  const mod = await import("../src/index.js");
  let captured = null;
  mod.default.scheduled({}, env, { waitUntil: (p) => { captured = p; } });
  await captured;   // must resolve (allSettled) without throwing
  assert.ok(sql.some(q => /reminder_preferences/.test(q)), "reminders scheduler did not run");
});

test("no morning/evening double-digest logic anywhere", () => {
  const root = join(import.meta.dirname, "..");
  const files = ["src/email-digest.js", "src/index.js", "wrangler.toml", ".dev.vars.example"].map(f => readFileSync(join(root, f), "utf8")).join("\n");
  assert.ok(!/DIGEST_MORNING|DIGEST_EVENING|MORNING_ENABLED|EVENING_ENABLED/.test(files), "found forbidden morning/evening digest config");
});
