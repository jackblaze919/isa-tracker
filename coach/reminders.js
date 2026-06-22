/* reminders.js — "Hammy Reminders" frontend.
   Reuses the Ask Hammy signed session (no separate password) and the anonymous id.
   Talks ONLY to the coach Worker /reminders/* routes. Uploads only minimal completion flags.
   Notification text is server-controlled; this file never composes notification copy. */
(function () {
  if (window.__hammyReminders) return;
  window.__hammyReminders = true;

  var NS = "isa:coach:v1:";          // shared with coach.js (session + anonymous-id)
  var RNS = "isa:reminders:v1:";     // local reminder settings mirror
  var CFG = window.HAMMY_COACH_CONFIG || {};
  var WORKER = (CFG.workerUrl || "").replace(/\/$/, "");
  var DEV_MOCK = !!CFG.developmentMock;

  function jget(ns, k, d) { try { var v = localStorage.getItem(ns + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function jset(ns, k, v) { try { localStorage.setItem(ns + k, JSON.stringify(v)); } catch (e) {} }
  function jdel(ns, k) { try { localStorage.removeItem(ns + k); } catch (e) {} }
  function lget(k, d) { return jget(RNS, k, d); }
  function lset(k, v) { jset(RNS, k, v); }

  /* ---------- coach session reuse ---------- */
  function getSession() { return jget(NS, "session", null); }
  function sessionValid() { var s = getSession(); return !!(s && s.token && (!s.expires_at || Date.now() < s.expires_at)); }
  function getAnonId() { var id = jget(NS, "anonymous-id", null); if (!id) { id = "a-" + Math.random().toString(36).slice(2) + Date.now().toString(36); jset(NS, "anonymous-id", id); } return id; }

  /* ---------- feature detection (not browser-name sniffing) ---------- */
  function feat() {
    var sw = "serviceWorker" in navigator;
    var push = "PushManager" in window;
    var notif = "Notification" in window;
    var standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
    var iOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    var supported = sw && push && notif;
    return { sw: sw, push: push, notif: notif, standalone: standalone, iOS: iOS, supported: supported,
      permission: notif ? Notification.permission : "unsupported" };
  }

  /* ---------- worker client (reuses Bearer session + anon header) ---------- */
  function api(method, path, body) {
    var s = getSession();
    if (!WORKER) return Promise.resolve({ status: 0, offline: true });
    if (!s || !s.token) return Promise.resolve({ status: 401 });
    var headers = { "Authorization": "Bearer " + s.token, "X-Hammy-Anon": getAnonId() };
    if (body) headers["Content-Type"] = "application/json";
    return fetch(WORKER + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, data: d }; }); })
      .catch(function () { return { status: 0, offline: true }; });
  }
  function getConfig() {
    if (!WORKER) return Promise.resolve(null);
    return fetch(WORKER + "/reminders/config").then(function (r) { return r.json(); }).catch(function () { return null; });
  }

  function urlB64ToUint8Array(b64) {
    var pad = "=".repeat((4 - (b64.length % 4)) % 4);
    var base = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
    var raw = atob(base); var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  /* ---------- status (only allowed completion flags; nothing else) ---------- */
  function callFn(name, fb) { try { return (typeof window[name] === "function") ? window[name]() : fb; } catch (e) { return fb; } }
  function buildReminderStatus() {
    var nd = new Date();
    var localDate = nd.getFullYear() + "-" + String(nd.getMonth() + 1).padStart(2, "0") + "-" + String(nd.getDate()).padStart(2, "0");
    var tz = "UTC"; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) {}
    var dow = (typeof TODAY_DOW !== "undefined") ? TODAY_DOW : nd.getDay();

    var stepsActual = callFn("gStepsActual", 0) | 0;
    var stepTarget = 7000;
    try { if (typeof load === "function") stepTarget = parseInt(load("step_target", 7000), 10) || 7000; } catch (e) {}
    var stepsComplete = (typeof window.stepDone === "function") ? !!window.stepDone() : (stepsActual >= stepTarget);

    var woRequired = false, woLogged = !!callFn("gWorkout", false);
    try { if (typeof SCHED !== "undefined" && typeof TODAY_DOW !== "undefined" && SCHED[TODAY_DOW]) { var wt = SCHED[TODAY_DOW].wo; woRequired = !!wt && wt !== "walk" && wt !== "rest"; } } catch (e) {}

    var proteinLogged = !!callFn("gProtein", false);
    var mealComplete = !!callFn("gMeals", false);
    var loggedCount = 0, total = 4;
    try { if (typeof load === "function" && typeof TODAY_KEY !== "undefined") { var m = load("meal|" + TODAY_KEY, {}); var ks = Object.keys(m); total = Math.max(4, ks.length || 4); loggedCount = ks.filter(function (k) { return m[k]; }).length; } } catch (e) {}
    if (mealComplete) loggedCount = total;

    var checkinRequired = dow === 0;
    var checkinComplete = lget("checkin-done", "") === localDate;

    return {
      local_date: localDate, timezone: tz,
      steps: { logged: stepsActual > 0, complete: !!stepsComplete, actual: Math.min(200000, Math.max(0, stepsActual)), target: Math.min(200000, Math.max(0, stepTarget)) },
      workout: { required: woRequired, logged: woLogged, complete: woLogged },
      protein: { logged: proteinLogged, complete: proteinLogged },
      meals: { logged_count: Math.min(50, loggedCount), total: Math.min(50, total), complete: mealComplete },
      checkin: { required: checkinRequired, complete: checkinComplete }
    };
  }
  window.buildReminderStatus = buildReminderStatus;

  /* ---------- status sync (debounced, dedup, offline-retry) ---------- */
  var syncTimer = null, lastSent = "";
  function active() { return lget("enabled", false) && sessionValid() && !DEV_MOCK && !!WORKER; }
  function syncStatus() {
    if (!active()) return Promise.resolve(false);
    var status = buildReminderStatus();
    var sig = JSON.stringify(status);
    if (sig === lastSent) return Promise.resolve(false);                 // no redundant upload
    return api("PUT", "/reminders/status", status).then(function (r) {
      if (r.status === 200) { lastSent = sig; lset("pending-sync", false); return true; }
      if (r.status === 401) { /* session expired — keep settings, surface on open */ return false; }
      lset("pending-sync", true); return false;                          // offline/error -> retry later
    });
  }
  function scheduleSync(delay) {
    if (!active()) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(function () { syncTimer = null; syncStatus(); }, delay == null ? 1200 : delay);
  }
  function wireSync() {
    ["isa:meal-completed", "isa:protein-completed", "isa:workout-completed", "isa:step-target-reached", "isa:sleep-logged", "isa:checkin-saved"]
      .forEach(function (ev) { window.addEventListener(ev, function () { scheduleSync(); }); });
    window.addEventListener("isa:checkin-saved", function () { var s = buildReminderStatus(); lset("checkin-done", s.local_date); });
    document.addEventListener("visibilitychange", function () { if (!document.hidden) { if (lget("pending-sync", false)) scheduleSync(300); else scheduleSync(2500); } });
    window.addEventListener("online", function () { if (lget("pending-sync", false)) scheduleSync(300); });
    window.addEventListener("load", function () { scheduleSync(4000); });
    // midnight rollover: re-sync if the local date changed
    setInterval(function () { var d = buildReminderStatus().local_date; if (d !== lget("last-date", d)) { lset("last-date", d); lastSent = ""; scheduleSync(500); } }, 60 * 1000);
    lset("last-date", buildReminderStatus().local_date);
  }

  /* ===================== UI ===================== */
  var DEFAULT_TIMES = { steps: "18:00", workout: "17:00", protein: "20:00", meals: "19:30", checkin: "16:00" };
  var CAT_LABEL = { steps: "Steps", workout: "Workout", protein: "Protein", meals: "Meals", checkin: "Sunday check-in" };
  var CAT_HINT = {
    steps: "If you're short of today's step target.",
    workout: "If today's workout isn't logged yet (never on rest days).",
    protein: "A gentle protein top-up nudge.",
    meals: "If a meal is still unlogged.",
    checkin: "Only on Sundays, for the weekly check-in."
  };
  var prefs = lget("prefs", null) || { timezone: tzNow(), quiet_start: "21:00", quiet_end: "08:00", enabled: false, categories: defaultCats() };
  function tzNow() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; } }
  function defaultCats() { var c = {}; Object.keys(DEFAULT_TIMES).forEach(function (k) { c[k] = { enabled: false, time: DEFAULT_TIMES[k] }; }); return c; }
  function savePrefsLocal() { lset("prefs", prefs); }

  var overlay = null, lastFocus = null;
  function open() {
    lastFocus = document.activeElement;
    if (!overlay) buildPanel();
    overlay.classList.add("show");
    refreshStatus();
    setTimeout(function () { var f = overlay.querySelector("button, input, select"); if (f) f.focus(); }, 60);
  }
  function close() { if (overlay) overlay.classList.remove("show"); if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) {} }

  function el(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }

  function buildPanel() {
    overlay = el("div", "rem-modal");
    overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-modal", "true"); overlay.setAttribute("aria-label", "Hammy reminders settings");
    var card = el("div", "rem-card");
    card.innerHTML =
      '<div class="rem-head"><div class="rem-ttl">🔔 Hammy Reminders</div><button class="rem-x" id="remClose" aria-label="Close reminders">✕</button></div>' +
      '<div class="rem-body" id="remBody"></div>';
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    card.querySelector("#remClose").addEventListener("click", close);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && overlay.classList.contains("show")) close(); });
  }

  var statusLine = null;
  function refreshStatus() {
    var body = overlay.querySelector("#remBody");
    body.textContent = "";
    var f = feat();

    // ----- gate: unsupported / iOS-not-installed / locked -----
    if (!f.supported) {
      body.appendChild(el("p", "rem-note", "This device or browser doesn't support web notifications, so Hammy can't send reminders here. Everything else in the tracker still works. 🐹"));
      addPrivacy(body); return;
    }
    if (f.iOS && !f.standalone) {
      var g = el("div", "rem-card-in");
      g.appendChild(el("h4", null, "Add to Home Screen first"));
      g.appendChild(el("p", "rem-note", "To receive Hammy reminders on iPhone (needs iOS 16.4+):"));
      var ol = el("ol", "rem-steps",
        "<li>Open the tracker in <b>Safari</b>.</li><li>Tap <b>Share</b> ⬆️.</li><li>Tap <b>Add to Home Screen</b>.</li><li>Open the new <b>Isa's Tracker</b> icon.</li><li>Come back here and tap <b>Enable Hammy reminders</b>.</li>");
      g.appendChild(ol);
      body.appendChild(g);
      addPrivacy(body); return;
    }

    // ----- status block -----
    var subActive = lget("enabled", false) && f.permission === "granted";
    var st = el("div", "rem-status");
    st.appendChild(statRow("Notifications", "Supported", "ok"));
    st.appendChild(statRow("Installed as app", f.standalone ? "Yes" : "No (browser tab)", f.standalone ? "ok" : "warn"));
    st.appendChild(statRow("Permission", permLabel(f.permission), f.permission === "granted" ? "ok" : (f.permission === "denied" ? "bad" : "warn")));
    st.appendChild(statRow("Subscription", subActive ? "Active" : "Inactive", subActive ? "ok" : "warn"));
    st.appendChild(statRow("Time zone", prefs.timezone || tzNow(), "ok"));
    st.appendChild(statRow("Worker", WORKER ? (DEV_MOCK ? "Dev mock" : "Connected") : "Not configured", WORKER && !DEV_MOCK ? "ok" : "warn"));
    body.appendChild(st);

    var msg = el("p", "rem-live"); msg.id = "remLive"; msg.setAttribute("aria-live", "polite"); body.appendChild(msg);

    if (DEV_MOCK) { body.appendChild(el("p", "rem-note", "Reminders need the live coach Worker. They're disabled in development mock mode.")); addPrivacy(body); return; }
    if (!sessionValid()) {
      body.appendChild(el("p", "rem-note", "Unlock Ask Hammy first (the 🔒 chat) — reminders use the same secure session, with no separate password."));
      addPrivacy(body); return;
    }

    if (f.permission === "denied") body.appendChild(el("p", "rem-note", "Notifications are blocked for this site. Enable them in your browser/site settings, then come back."));

    // ----- enable button -----
    if (!subActive) {
      var enableBtn = el("button", "rem-primary"); enableBtn.id = "remEnable"; enableBtn.textContent = "Enable Hammy reminders";
      enableBtn.disabled = f.permission === "denied";
      enableBtn.addEventListener("click", enable);
      body.appendChild(enableBtn);
    }

    // ----- categories (only when enabled) -----
    if (subActive) {
      var cw = el("div", "rem-cats");
      cw.appendChild(el("h4", null, "What should Hammy remind you about?"));
      Object.keys(DEFAULT_TIMES).forEach(function (cat) {
        var c = prefs.categories[cat] || { enabled: false, time: DEFAULT_TIMES[cat] };
        var row = el("div", "rem-cat");
        var id = "remcat-" + cat, tid = "remtime-" + cat;
        row.innerHTML =
          '<label class="rem-switch"><input type="checkbox" id="' + id + '"' + (c.enabled ? " checked" : "") + '><span class="rem-slider"></span></label>' +
          '<div class="rem-cat-txt"><label for="' + id + '"><b>' + CAT_LABEL[cat] + '</b></label><span>' + CAT_HINT[cat] + '</span></div>' +
          '<input type="time" id="' + tid + '" class="rem-time" value="' + c.time + '" aria-label="' + CAT_LABEL[cat] + ' reminder time">';
        cw.appendChild(row);
        row.querySelector("#" + id).addEventListener("change", function (e) { c.enabled = e.target.checked; prefs.categories[cat] = c; savePrefs(); });
        row.querySelector("#" + tid).addEventListener("change", function (e) { if (/^([01]\d|2[0-3]):[0-5]\d$/.test(e.target.value)) { c.time = e.target.value; prefs.categories[cat] = c; savePrefs(); } });
      });
      body.appendChild(cw);

      // quiet hours
      var qh = el("div", "rem-quiet");
      qh.innerHTML = '<h4>Quiet hours</h4><div class="rem-quiet-row"><label>From <input type="time" id="remQS" value="' + prefs.quiet_start + '"></label><label>To <input type="time" id="remQE" value="' + prefs.quiet_end + '"></label></div><p class="rem-note">No reminders during these hours.</p>';
      body.appendChild(qh);
      qh.querySelector("#remQS").addEventListener("change", function (e) { prefs.quiet_start = e.target.value; savePrefs(); });
      qh.querySelector("#remQE").addEventListener("change", function (e) { prefs.quiet_end = e.target.value; savePrefs(); });

      // other actions
      var acts = el("div", "rem-acts");
      var pauseBtn = el("button", "rem-ghost"); pauseBtn.textContent = isPausedToday() ? "Paused for today ✓" : "Pause all reminders for today";
      pauseBtn.addEventListener("click", pauseToday);
      var testBtn = el("button", "rem-ghost"); testBtn.textContent = "Send test notification"; testBtn.addEventListener("click", sendTest);
      var offBtn = el("button", "rem-danger"); offBtn.textContent = "Disable reminders"; offBtn.addEventListener("click", disable);
      var delBtn = el("button", "rem-danger-out"); delBtn.textContent = "Delete reminder data"; delBtn.addEventListener("click", deleteData);
      [pauseBtn, testBtn, offBtn, delBtn].forEach(function (b) { acts.appendChild(b); });
      body.appendChild(acts);
    }

    addPrivacy(body);
  }

  function addPrivacy(body) {
    body.appendChild(el("p", "rem-privacy", "Hammy only syncs whether today's items are finished, your selected reminder times, and the push subscription needed to notify this device. Detailed meals, weight history, photos, and chat messages are not uploaded."));
  }
  function statRow(label, val, kind) {
    var r = el("div", "rem-strow");
    r.innerHTML = '<span class="rem-stk">' + label + '</span><span class="rem-stv rem-' + kind + '"><span class="rem-dot"></span>' + val + '</span>';
    return r;
  }
  function permLabel(p) { return p === "granted" ? "Allowed" : p === "denied" ? "Blocked" : "Not requested"; }
  function say(msg) { var l = overlay && overlay.querySelector("#remLive"); if (l) l.textContent = msg; }
  function isPausedToday() { return lget("paused-date", "") === buildReminderStatus().local_date; }

  /* ---------- actions ---------- */
  function enable() {
    var f = feat();
    if (!f.supported) { say("This browser can't receive notifications."); return; }
    if (f.iOS && !f.standalone) { refreshStatus(); return; }
    if (DEV_MOCK || !sessionValid()) { refreshStatus(); return; }
    say("Asking for notification permission…");
    Notification.requestPermission().then(function (perm) {                 // ONLY here, on the button click
      if (perm !== "granted") { say(perm === "denied" ? "Notifications were blocked." : "Permission not granted."); refreshStatus(); return; }
      subscribe();
    });
  }

  function subscribe() {
    say("Setting up reminders…");
    return navigator.serviceWorker.ready.then(function (reg) {
      return getConfig().then(function (cfg) {
        if (!cfg || !cfg.vapid_public_key) { say("Couldn't reach the reminders service."); return; }
        return reg.pushManager.getSubscription().then(function (existing) {
          var p = existing ? Promise.resolve(existing)
            : reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(cfg.vapid_public_key) });
          return p;
        }).then(function (sub) {
          if (!sub) return;
          return api("POST", "/reminders/subscribe", { subscription: sub.toJSON ? sub.toJSON() : sub }).then(function (r) {
            if (r.status !== 200) { say("Couldn't save the subscription. Try again."); return; }
            lset("enabled", true);
            prefs.enabled = true; prefs.timezone = tzNow(); savePrefsLocal();
            return api("PUT", "/reminders/preferences", apiPrefs()).then(function () { lastSent = ""; syncStatus(); say("Reminders are on. Pick what Hammy should remind you about. 🐹"); refreshStatus(); });
          });
        });
      });
    }).catch(function () { say("Something went wrong enabling reminders."); });
  }

  function apiPrefs() {
    return { timezone: prefs.timezone || tzNow(), quiet_start: prefs.quiet_start, quiet_end: prefs.quiet_end, enabled: !!prefs.enabled, categories: prefs.categories };
  }
  function savePrefs() {
    savePrefsLocal();
    api("PUT", "/reminders/preferences", apiPrefs()).then(function (r) { if (r.status === 401) say("Session expired — unlock Ask Hammy again to save."); });
  }

  function pauseToday() {
    var d = buildReminderStatus().local_date;
    lset("paused-date", d);
    api("POST", "/reminders/pause-today", { local_date: d }).then(function () { say("Paused for today. 🌙"); refreshStatus(); });
  }
  function sendTest() {
    say("Sending a test…");
    api("POST", "/reminders/test", {}).then(function (r) {
      if (r.status === 429) say("Just sent one — give it a few seconds.");
      else if (r.status === 200 && r.data && r.data.ok) say("Sent! It should appear shortly. 🐹");
      else if (r.status === 409) say("Enable reminders first.");
      else say("Couldn't send the test right now.");
    });
  }
  function disable() {
    if (!confirm("Turn off Hammy reminders on this device?")) return;
    say("Turning reminders off…");
    var done = function () { lset("enabled", false); prefs.enabled = false; savePrefsLocal(); refreshStatus(); };
    navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
      var ep = sub ? sub.endpoint : null;
      var unsub = sub ? sub.unsubscribe() : Promise.resolve();
      return unsub.then(function () { return api("PUT", "/reminders/preferences", Object.assign(apiPrefs(), { enabled: false })); })
        .then(function () { return ep ? api("DELETE", "/reminders/subscribe", { endpoint: ep }) : null; });
    }).then(done).catch(done);
  }
  function deleteData() {
    if (!confirm("Delete all Hammy reminder data (subscriptions, times, today's status)? Your tracker history, chats, and Hammy are NOT affected.")) return;
    say("Deleting reminder data…");
    navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) { return sub ? sub.unsubscribe() : null; })
      .then(function () { return api("DELETE", "/reminders/data", {}); })
      .then(function () { ["enabled", "prefs", "paused-date", "checkin-done", "pending-sync", "last-date"].forEach(function (k) { jdel(RNS, k); }); prefs = { timezone: tzNow(), quiet_start: "21:00", quiet_end: "08:00", enabled: false, categories: defaultCats() }; lastSent = ""; say("Reminder data deleted."); refreshStatus(); })
      .catch(function () { say("Couldn't delete right now."); });
  }

  /* ---------- deep-link from a tapped notification (known tabs only) ---------- */
  var ALLOWED_TABS = ["today", "hammy", "meals", "training", "walking", "groceries", "progress", "checkin"];
  function gotoTab(tab) { if (ALLOWED_TABS.indexOf(tab) < 0) return; var b = document.getElementById("tab-" + tab); if (b) b.click(); }
  function handleDeepLink() {
    try { var m = (location.hash || "").match(/hammy-remind=([a-z]+)/); if (m) { gotoTab(m[1]); history.replaceState(null, "", location.pathname + location.search); } } catch (e) {}
    try { if (navigator.serviceWorker && navigator.serviceWorker.addEventListener) navigator.serviceWorker.addEventListener("message", function (e) { if (e.data && e.data.type === "hammy-remind" && typeof e.data.tab === "string") gotoTab(e.data.tab); }); } catch (e) {}
  }

  /* ---------- public API ---------- */
  window.HammyReminders = {
    open: open, close: close, buildReminderStatus: buildReminderStatus, syncStatus: syncStatus,
    _feat: feat, _enable: enable, _refresh: function () { if (overlay) refreshStatus(); }
  };

  function init() { wireSync(); handleDeepLink(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
