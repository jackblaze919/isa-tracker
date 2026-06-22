/* Executes the real ../../sw.js push + notificationclick handlers in a mock SW global,
   so the actual shipped code is tested (not a re-implementation). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadSW(){
  const src = readFileSync(join(import.meta.dirname, "..", "..", "sw.js"), "utf8");
  const handlers = {};
  const calls = { showNotification: [], openWindow: [], focused: [], posted: [] };
  let clientList = [];
  const self = {
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: () => Promise.resolve(),
    registration: {
      scope: "https://jackblaze919.github.io/isa-tracker/",
      showNotification: (title, opts) => { calls.showNotification.push({ title, opts }); return Promise.resolve(); }
    },
    clients: {
      matchAll: () => Promise.resolve(clientList),
      openWindow: (url) => { calls.openWindow.push(url); return Promise.resolve({}); },
      claim: () => Promise.resolve()
    }
  };
  const caches = { open: () => Promise.resolve({ addAll: () => Promise.resolve(), put: () => Promise.resolve(), match: () => Promise.resolve(null) }), keys: () => Promise.resolve([]), delete: () => Promise.resolve(), match: () => Promise.resolve(null) };
  const fn = new Function("self", "caches", "Response", "fetch", src);
  fn(self, caches, function(){}, () => Promise.resolve({ ok: true }));
  return { handlers, calls, setClients: (l) => { clientList = l; } };
}
function pushEvent(payload){ const p = []; return { event: { data: payload === undefined ? null : { json: () => { if(payload === "BAD") throw new Error("bad"); return payload; } }, waitUntil: (x) => p.push(x) }, waits: p }; }

test("sw push: valid payload shows a notification with title/body/tag and category data", async () => {
  const sw = loadSW();
  const { event, waits } = pushEvent({ title: "Tiny feet check 🐹", body: "steps...", category: "steps", tag: "hammy-steps-2026-06-22" });
  sw.handlers.push(event); await Promise.all(waits);
  assert.equal(sw.calls.showNotification.length, 1);
  const n = sw.calls.showNotification[0];
  assert.equal(n.title, "Tiny feet check 🐹");
  assert.equal(n.opts.body, "steps...");
  assert.equal(n.opts.tag, "hammy-steps-2026-06-22");
  assert.equal(n.opts.data.category, "steps");
  assert.equal(n.opts.renotify, false);
});

test("sw push: malformed / empty payload is handled safely (default title, no throw)", async () => {
  const sw = loadSW();
  for(const bad of [undefined, "BAD"]){
    const { event, waits } = pushEvent(bad);
    sw.handlers.push(event); await Promise.all(waits);
  }
  assert.equal(sw.calls.showNotification.length, 2);
  assert.equal(sw.calls.showNotification[0].title, "Hammy 🐹");      // safe default
});

test("sw push: unknown category falls back to a known tab (no arbitrary destination)", async () => {
  const sw = loadSW();
  const { event, waits } = pushEvent({ title: "x", body: "y", category: "evil-tab" });
  sw.handlers.push(event); await Promise.all(waits);
  assert.equal(sw.calls.showNotification[0].opts.data.category, "today");  // sanitized
});

test("sw notificationclick: focuses an existing app window and posts the tab", async () => {
  const sw = loadSW();
  let focused = false, posted = null;
  sw.setClients([{ url: "https://jackblaze919.github.io/isa-tracker/", focus: () => { focused = true; return Promise.resolve(); }, postMessage: (m) => { posted = m; } }]);
  const waits = [];
  sw.handlers.notificationclick({ notification: { data: { category: "checkin" }, close: () => {} }, waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  assert.equal(focused, true);
  assert.deepEqual(posted, { type: "hammy-remind", tab: "checkin" });
  assert.equal(sw.calls.openWindow.length, 0);
});

test("sw notificationclick: opens the app (same-origin) when none is open", async () => {
  const sw = loadSW();
  sw.setClients([]);
  const waits = [];
  sw.handlers.notificationclick({ notification: { data: { category: "steps" }, close: () => {} }, waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  assert.equal(sw.calls.openWindow.length, 1);
  assert.match(sw.calls.openWindow[0], /^https:\/\/jackblaze919\.github\.io\/isa-tracker\/#hammy-remind=today$/);
});
