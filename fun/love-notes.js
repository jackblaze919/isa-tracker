/* love-notes.js — Hammy delivers hidden love notes from the gifter. 💌
   Purely additive: reads existing tracker globals via typeof-guards, listens to the
   tracker's window events, reuses confettiRain()/heartBurst() if present, and mounts
   its own DOM. It never rewires existing tracker or Hammy logic.

   Delivery model:
   - SPECIAL date (e.g. birthday): on that day, a special note is ready (once per year).
   - MILESTONE: on a "good day" event (workout / protein / steps / check-in) Hammy makes
     ONE milestone note ready (cycling through the list), at most once per day.
   A gentle 💌 envelope appears bottom-left; tapping it opens the note with confetti.
   Notes are never forced open — Isa taps when she wants them.
*/
(function () {
  if (window.__hammyLove) return;
  window.__hammyLove = true;

  var NS = "isa:v1:";
  var CFG = window.HAMMY_LOVE_NOTES || { from: "", notes: [], special: {} };
  var NOTES = Array.isArray(CFG.notes) ? CFG.notes : [];
  var SPECIAL = (CFG.special && typeof CFG.special === "object") ? CFG.special : {};

  function lget(k, d) { try { var v = localStorage.getItem(NS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lset(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) {} }

  var state = lget("love:state", null);
  if (!state || typeof state !== "object") state = { delivered: {}, nextIdx: 0 };
  if (!state.delivered) state.delivered = {};
  if (typeof state.nextIdx !== "number") state.nextIdx = 0;
  function persist() { lset("love:state", state); }

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function today() { return (typeof TODAY !== "undefined" && TODAY instanceof Date) ? TODAY : new Date(); }
  function todayKey() { return (typeof TODAY_KEY !== "undefined" && TODAY_KEY) ? TODAY_KEY : (today().getFullYear() + "-" + (today().getMonth() + 1) + "-" + today().getDate()); }
  function todayMMDD() {
    if (window.__loveDateOverride) return window.__loveDateOverride; // test-only seam
    var d = today(); return pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  var pending = []; // [{id, kind, title, text, style}]
  function isDelivered(id) { return !!state.delivered[id]; }
  function inPending(id) { for (var i = 0; i < pending.length; i++) if (pending[i].id === id) return true; return false; }
  function enqueue(note) { if (!note || isDelivered(note.id) || inPending(note.id)) return; pending.push(note); }

  function evalSpecial() {
    var mmdd = todayMMDD();
    var s = SPECIAL[mmdd];
    if (!s || !s.text) return;
    var id = "special:" + mmdd + ":" + today().getFullYear();
    enqueue({ id: id, kind: "special", title: s.title || "", text: s.text, style: s.style || "special" });
  }

  function offerMilestone() {
    if (!NOTES.length) return;
    var id = "milestone:" + todayKey(); // at most one milestone note per day
    if (isDelivered(id) || inPending(id)) return;
    var text = NOTES[((state.nextIdx % NOTES.length) + NOTES.length) % NOTES.length];
    enqueue({ id: id, kind: "milestone", title: "", text: text, style: "milestone" });
    renderFab();
  }

  /* ---------- envelope (bottom-left, only when a note is pending) ---------- */
  var fab, badge;
  function ensureFab() {
    if (fab) return;
    fab = document.createElement("button");
    fab.className = "love-fab";
    fab.type = "button";
    fab.setAttribute("aria-label", "A note for you");
    fab.innerHTML =
      '<span class="love-fab-pulse"></span>' +
      '<span class="love-fab-emoji">💌</span>' +
      '<span class="love-fab-badge" aria-hidden="true"></span>' +
      '<span class="love-fab-tip">Hammy has a note for you 💕</span>';
    badge = fab.querySelector(".love-fab-badge");
    fab.addEventListener("click", openNext);
    document.body.appendChild(fab);
  }
  function renderFab() {
    if (!pending.length) { if (fab) fab.classList.remove("show"); return; }
    ensureFab();
    badge.textContent = pending.length > 1 ? String(pending.length) : "";
    badge.style.display = pending.length > 1 ? "grid" : "none";
    // birthday/special gets a warmer glow
    fab.classList.toggle("special", pending[0].style === "birthday" || pending[0].kind === "special");
    fab.classList.add("show");
  }

  /* ---------- the note modal ---------- */
  function openNext() {
    if (!pending.length) return;
    var note = pending[0];
    showModal(note);
  }

  function showModal(note) {
    var overlay = document.createElement("div");
    overlay.className = "love-modal" + (note.style === "birthday" ? " birthday" : "");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", note.title ? note.title : "A note for you");

    var card = document.createElement("div");
    card.className = "love-card";

    var ham = document.createElement("div");
    ham.className = "love-ham";
    ham.innerHTML = '<svg viewBox="0 0 120 135" aria-hidden="true"><use href="#pose-petted" width="120" height="135"/></svg>';

    var seal = document.createElement("div");
    seal.className = "love-seal";
    seal.textContent = note.style === "birthday" ? "🎂" : "💌";

    var title = document.createElement("h3");
    title.className = "love-title";
    title.textContent = note.title || "A note for you";

    var text = document.createElement("p");
    text.className = "love-text";
    text.textContent = note.text; // never innerHTML — model/config content rendered as text

    var sign = document.createElement("p");
    sign.className = "love-sign";
    sign.textContent = CFG.from ? ("— " + CFG.from) : "— with love 💕";

    var close = document.createElement("button");
    close.className = "love-close";
    close.type = "button";
    close.textContent = "💕 Thank you, Hammy";

    card.appendChild(ham);
    card.appendChild(seal);
    card.appendChild(title);
    card.appendChild(text);
    card.appendChild(sign);
    card.appendChild(close);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add("show"); });

    // celebrate
    try { if (typeof confettiRain === "function") confettiRain(); } catch (e) {}
    if (note.style === "birthday") balloons(card);

    function done() {
      // mark delivered + advance
      state.delivered[note.id] = 1;
      if (note.kind === "milestone") state.nextIdx = (state.nextIdx + 1) % (NOTES.length || 1);
      persist();
      for (var i = 0; i < pending.length; i++) { if (pending[i].id === note.id) { pending.splice(i, 1); break; } }
      overlay.classList.remove("show");
      setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 280);
      renderFab();
      try { if (window.IsaHamster && typeof IsaHamster.handleCoachMood === "function") IsaHamster.handleCoachMood("proud"); } catch (e) {}
    }
    close.addEventListener("click", done);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) done(); });
    document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { done(); document.removeEventListener("keydown", esc); } });
    setTimeout(function () { close.focus(); }, 60);
  }

  function balloons(card) {
    var EM = ["🎈", "🎉", "💕", "🌸", "⭐", "🎂"];
    for (var i = 0; i < 14; i++) {
      (function (i) {
        var b = document.createElement("span");
        b.className = "love-balloon";
        b.textContent = EM[i % EM.length];
        b.style.left = (6 + Math.random() * 88) + "%";
        b.style.animationDelay = (Math.random() * 0.5) + "s";
        b.style.fontSize = (16 + Math.random() * 16) + "px";
        card.appendChild(b);
        setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 2600);
      })(i);
    }
  }

  /* ---------- wiring ---------- */
  function onWin() { offerMilestone(); }
  ["isa:workout-completed", "isa:protein-completed", "isa:step-target-reached", "isa:checkin-saved"].forEach(function (ev) {
    window.addEventListener(ev, onWin);
  });

  function refresh() { evalSpecial(); renderFab(); }

  // public (small) API — also used by tests
  window.HammyLove = {
    refresh: refresh,
    open: openNext,
    pendingCount: function () { return pending.length; },
    _offerMilestone: offerMilestone
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refresh);
  else refresh();
})();
