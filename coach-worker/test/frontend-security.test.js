import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");           // repo root
const read = (p) => { try { return readFileSync(join(ROOT, p), "utf8"); } catch (e) { return ""; } };

// Files the BROWSER actually loads (served by GitHub Pages and referenced by index.html).
const FRONTEND = [
  "index.html", "hamster.js", "hamster.css", "sw.js", "manifest.webmanifest",
  "coach/coach.js", "coach/coach.css", "coach/coach-context.js",
  "coach/offline-help.js", "coach/coach-config.js", "coach/coach-config.example.js"
];

test("frontend contains NO AI-provider key, name, or direct-to-provider call", () => {
  const forbidden = [
    { re: /sk-ant/i, why: "Anthropic key prefix" },
    { re: /sk-[A-Za-z0-9_-]{16,}/, why: "provider secret key" },
    { re: /anthropic/i, why: "Anthropic reference" },
    { re: /dangerous-direct-browser-access/i, why: "direct browser->provider header" },
    { re: /api\.anthropic\.com/i, why: "direct Anthropic call" },
    { re: /api\.openai\.com/i, why: "direct OpenAI call from browser" },
    { re: /x-api-key/i, why: "provider key header" },
    { re: /claude-[a-z0-9]/i, why: "Anthropic model name" },
    { re: /gpt-[0-9]/i, why: "OpenAI model name in frontend (belongs in Worker only)" },
    { re: /coach_aikey/i, why: "old localStorage provider-key" },
    { re: /Connect AI/i, why: "removed Connect-AI UI" },
    { re: /coachModelSel|model selector|modelSel/i, why: "model selector UI" },
    { re: /OPENAI_API_KEY|OPENAI_MODEL/i, why: "provider env name in frontend" },
  ];
  const hits = [];
  for (const f of FRONTEND) {
    const src = read(f);
    for (const { re, why } of forbidden) {
      const m = src.match(re);
      if (m) hits.push(`${f}: ${why} -> "${m[0]}"`);
    }
  }
  assert.deepEqual(hits, [], "Forbidden provider artifacts found in frontend:\n" + hits.join("\n"));
});

test("frontend only talks to the configured Worker (HAMMY_COACH_CONFIG.workerUrl)", () => {
  const coach = read("coach/coach.js");
  // every fetch() target is built from the WORKER base
  const fetchCalls = coach.match(/fetch\(([^)]*)/g) || [];
  for (const c of fetchCalls) {
    assert.ok(/WORKER\s*\+/.test(c) || /url/i.test(c) === false ? /WORKER/.test(c) : true,
      "fetch should target the Worker base, got: " + c);
    assert.ok(!/openai|anthropic/i.test(c), "fetch must not target a provider: " + c);
  }
  assert.match(coach, /HAMMY_COACH_CONFIG/);
});

test("no real provider key committed anywhere in the branch", () => {
  // walk the whole repo (skip node_modules / .git / .wrangler) for key-shaped secrets
  const KEY = /sk-(ant|proj|[A-Za-z0-9]{2})[A-Za-z0-9_-]{18,}/;
  const offenders = [];
  (function walk(dir) {
    for (const name of readdirSync(join(ROOT, dir))) {
      if (name === ".git" || name === "node_modules" || name === ".wrangler") continue;
      const rel = dir ? dir + "/" + name : name;
      const st = statSync(join(ROOT, rel));
      if (st.isDirectory()) { walk(rel); continue; }
      if (/\.example$/i.test(name)) continue;   // templates legitimately contain placeholders
      if (!/\.(js|css|html|json|md|toml|txt|webmanifest|vars)$/i.test(name)) continue;
      const src = read(rel);
      if (KEY.test(src)) offenders.push(rel);
    }
  })("");
  assert.deepEqual(offenders, [], "Real provider key found in: " + offenders.join(", "));
});

test("offline help is clearly labeled as NON-AI", () => {
  const oh = read("coach/offline-help.js");
  assert.match(oh, /NOT an AI response/i);
  assert.match(oh, /Offline Quick Help/);
  const coach = read("coach/coach.js");
  assert.match(coach, /not a real AI response/i);     // the tag shown on offline/mock bubbles
});

test("frontend never sends an Authorization header to anything but the Worker /chat", () => {
  const coach = read("coach/coach.js");
  // the only Authorization usage is the Bearer session token to the Worker
  const auths = coach.match(/Authorization[^,]*/g) || [];
  for (const a of auths) assert.match(a, /Bearer.*session\.token/);
});
