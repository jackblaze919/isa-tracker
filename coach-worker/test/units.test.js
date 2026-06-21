import { test } from "node:test";
import assert from "node:assert/strict";
import { createSession, verifySession } from "../src/session.js";
import { validateChatBody, validateSessionBody, originAllowed, parseAllowedOrigins, inspectImage, LIMITS } from "../src/validation.js";
import { normalizeReply, buildInstructions, SAFETY_VALUES, MOOD_VALUES } from "../src/coach-prompt.js";

const SECRET = "test-signing-secret-abc123";

test("session: valid token round-trips", async () => {
  const { token } = await createSession(SECRET);
  const payload = await verifySession(token, SECRET);
  assert.ok(payload && payload.v === 1 && typeof payload.sid === "string");
});

test("session: missing/garbage token rejected", async () => {
  assert.equal(await verifySession("", SECRET), null);
  assert.equal(await verifySession("not.a.token", SECRET), null);
  assert.equal(await verifySession(undefined, SECRET), null);
});

test("session: modified token rejected", async () => {
  const { token } = await createSession(SECRET);
  const tampered = token.slice(0, -2) + (token.slice(-2) === "AA" ? "BB" : "AA");
  assert.equal(await verifySession(tampered, SECRET), null);
});

test("session: token signed with a different secret rejected", async () => {
  const { token } = await createSession(SECRET);
  assert.equal(await verifySession(token, "another-secret"), null);
});

test("session: expired token rejected", async () => {
  const { token } = await createSession(SECRET, -1000); // already expired
  assert.equal(await verifySession(token, SECRET), null);
});

test("origin allow-list", () => {
  const allowed = parseAllowedOrigins({ ALLOWED_ORIGINS: "https://jackblaze919.github.io, http://localhost:8080" });
  assert.equal(originAllowed("https://jackblaze919.github.io", allowed), true);
  assert.equal(originAllowed("http://localhost:8080", allowed), true);
  assert.equal(originAllowed("https://evil.example", allowed), false);
  assert.equal(originAllowed(null, allowed), false);
});

test("session body validation", () => {
  assert.equal(validateSessionBody({ access_code: "x" }).ok, true);
  assert.equal(validateSessionBody({}).ok, false);
  assert.equal(validateSessionBody({ access_code: "y".repeat(500) }).ok, false);
});

test("chat body: rejects oversized message", () => {
  const r = validateChatBody({ messages: [{ role: "user", text: "x".repeat(LIMITS.MAX_MSG_CHARS + 1) }] });
  assert.equal(r.ok, false); assert.equal(r.error, "message_too_long");
});

test("chat body: rejects too many messages", () => {
  const messages = Array.from({ length: LIMITS.MAX_MESSAGES + 1 }, () => ({ role: "user", text: "hi" }));
  assert.equal(validateChatBody({ messages }).error, "too_many_messages");
});

test("chat body: requires last message to be user", () => {
  const r = validateChatBody({ messages: [{ role: "user", text: "hi" }, { role: "assistant", text: "hello" }] });
  assert.equal(r.error, "last_not_user");
});

test("chat body: image type + size enforcement", () => {
  assert.equal(inspectImage("data:image/gif;base64,AAAA").error, "image_unsupported_type");
  assert.equal(inspectImage("data:image/jpeg;base64," + "A".repeat(3_000_000)).error, "image_too_large");
  assert.equal(inspectImage("data:image/jpeg;base64,AAAA").ok, true);
  assert.equal(inspectImage("not-an-image").error, "image_invalid");
});

test("chat body: oversized context rejected", () => {
  const big = { messages: [{ role: "user", text: "hi" }], context: { blob: "z".repeat(LIMITS.MAX_CONTEXT_BYTES + 100) } };
  assert.equal(validateChatBody(big).error, "context_too_large");
});

test("chat body: accepts a clean payload", () => {
  const r = validateChatBody({ messages: [{ role: "assistant", text: "hey" }, { role: "user", text: "swap?" }], context: { dayName: "Monday" }, image: "data:image/png;base64,AAAA" });
  assert.equal(r.ok, true); assert.equal(r.messages.length, 2); assert.ok(r.image);
});

test("normalizeReply: validates + clamps + coerces", () => {
  const out = normalizeReply({
    reply: " hi ",
    options: [1, 2, 3, 4, 5].map(n => ({ title: "t" + n, details: "d" + n })),
    follow_up_question: "  ",
    safety: "weird", hammy_mood: "banana"
  });
  assert.equal(out.reply, "hi");
  assert.equal(out.options.length, 4);            // capped at 4
  assert.equal(out.follow_up_question, null);     // blank -> null
  assert.equal(out.safety, "normal");             // invalid -> normal
  assert.equal(out.hammy_mood, "neutral");        // invalid -> neutral
});

test("normalizeReply: keeps urgent safety + valid mood", () => {
  const out = normalizeReply({ reply: "Stop and seek help now.", options: [], follow_up_question: null, safety: "urgent", hammy_mood: "concerned" });
  assert.equal(out.safety, "urgent");
  assert.equal(out.hammy_mood, "concerned");
});

test("normalizeReply: rejects empty/garbage", () => {
  assert.throws(() => normalizeReply(null));
  assert.throws(() => normalizeReply({ reply: "" }));
});

test("prompt: contains injection-resistance, secret-refusal, urgent-first, no-physique-photo rules", () => {
  const p = buildInstructions({ dayName: "Monday", scheduledWorkout: "Lower body" });
  assert.match(p, /UNTRUSTED user content/);
  assert.match(p, /Never reveal[^.]*secrets/i);
  assert.match(p, /BEGIN the reply with clear guidance to stop and seek/i);
  assert.match(p, /do NOT analyze body-progress or physique photos/i);
  assert.match(p, /Lower body/);                  // sanitized plan grounding included
  assert.deepEqual(SAFETY_VALUES, ["normal", "caution", "urgent"]);
  assert.deepEqual(MOOD_VALUES, ["neutral", "thinking", "proud", "concerned", "sleepy", "excited"]);
});
