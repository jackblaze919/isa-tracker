/* ============================================================
   Ask Hammy — frontend (secure).
   Browser -> Cloudflare Worker -> OpenAI Responses API.
   The browser NEVER holds an AI provider key. It only ever stores a signed session
   token minted by the Worker after a private access code is verified server-side.
   ============================================================ */
(function(){
  "use strict";
  if(window.__hammyCoach) return; window.__hammyCoach = true;

  const CFG = window.HAMMY_COACH_CONFIG || {};
  const WORKER = (CFG.workerUrl || "").replace(/\/+$/,"");
  const DEV_MOCK = !!CFG.developmentMock;

  /* ---------- namespaced storage (no provider keys, ever) ---------- */
  const NS = "isa:coach:v1:";
  const lget = (k,d)=>{ try{ const v=localStorage.getItem(NS+k); return v==null?d:JSON.parse(v);}catch(e){return d;} };
  const lset = (k,v)=>{ try{ localStorage.setItem(NS+k, JSON.stringify(v)); }catch(e){} };
  const ldel = (k)=>{ try{ localStorage.removeItem(NS+k); }catch(e){} };
  function anonId(){ let id=lget("anonymous-id",null); if(!id){ id="a-"+Math.random().toString(36).slice(2)+Date.now().toString(36); lset("anonymous-id",id);} return id; }

  let session = lget("session", null);              // { token, expires_at }
  let history = lget("history", []);                // visible messages (~30 kept)
  let attached = null;                              // resized data URL (current image only)
  let busy = false, status = "checking";
  const el = {};

  function sessionValid(){ return !!(session && session.token && (!session.expires_at || Date.now() < session.expires_at)); }

  /* ---------- Worker client ---------- */
  async function health(){
    if(DEV_MOCK) return { ok:true, ready:true, mock:true };
    if(!WORKER) return { ok:false, reason:"unconfigured" };
    try{ const r = await fetch(WORKER+"/health",{cache:"no-store"}); if(!r.ok) return {ok:false}; const j=await r.json(); return {ok:true, ready:!!j.ready}; }
    catch(e){ return { ok:false, offline:true }; }
  }
  async function postSession(code){
    if(DEV_MOCK) return code ? { status:200, token:"dev-mock-token", expires_at: Date.now()+30*864e5 } : { status:401 };
    if(!WORKER) return { status:0 };
    try{
      const r = await fetch(WORKER+"/session",{ method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ access_code: code }) });
      if(r.status===200){ const j=await r.json(); return { status:200, token:j.token, expires_at:j.expires_at }; }
      return { status:r.status };
    }catch(e){ return { status:0, offline:true }; }
  }
  async function postChat(messages, image, context){
    if(DEV_MOCK){
      const last = messages.filter(m=>m.role==="user").slice(-1)[0];
      const a = (window.HammyOfflineHelp ? window.HammyOfflineHelp.answer(last?last.text:"", context) : {reply:"(mock)",options:[],safety:"normal"});
      await new Promise(r=>setTimeout(r, 500));
      return { status:200, data:{ reply:a.reply, options:a.options||[], follow_up_question:null, safety:a.safety||"normal", hammy_mood:"neutral" }, mock:true };
    }
    if(!WORKER || !sessionValid()) return { status:401 };
    try{
      const r = await fetch(WORKER+"/chat",{ method:"POST",
        headers:{ "Content-Type":"application/json", "Authorization":"Bearer "+session.token },
        body: JSON.stringify({ messages, image: image||undefined, context, anon_id: anonId() }) });
      if(r.status===200) return { status:200, data: await r.json() };
      let err=""; try{ err=(await r.json()).error; }catch(e){}
      return { status:r.status, error:err };
    }catch(e){ return { status:0, offline:true }; }
  }

  /* ---------- image resize/compress (longest edge ~1200px, JPEG, bounded) ---------- */
  function resizeImage(file, cb){
    const url=URL.createObjectURL(file), img=new Image();
    img.onload=()=>{ URL.revokeObjectURL(url);
      let w=img.naturalWidth, h=img.naturalHeight; const scale=Math.min(1, 1200/Math.max(w,h));
      w=Math.max(1,Math.round(w*scale)); h=Math.max(1,Math.round(h*scale));
      const cv=document.createElement("canvas"); cv.width=w; cv.height=h;
      cv.getContext("2d").drawImage(img,0,0,w,h);
      let q=0.82, data=cv.toDataURL("image/jpeg",q);
      while(data.length>1_400_000 && q>0.4){ q-=0.12; data=cv.toDataURL("image/jpeg",q); }
      cb(data.length>1_400_000 ? null : data);
    };
    img.onerror=()=>{ URL.revokeObjectURL(url); cb(null); };
    img.src=url;
  }

  /* ---------- avatar (reuse stable sprite poses; never new art) ---------- */
  function avatar(pose){ return `<svg viewBox="0 0 120 135" aria-hidden="true"><use href="#${pose||"pose-idle"}"/></svg>`; }
  const MOOD_POSE = { neutral:"pose-idle", thinking:"pose-look-left", proud:"pose-petted", concerned:"pose-sad", sleepy:"pose-sleep", excited:"pose-idle" };

  /* ---------- status ---------- */
  function setStatus(s){
    status=s;
    const map={ online:["Hammy is online","online"], internet:["Hammy needs internet",""], unavailable:["Coach unavailable",""],
      locked:["Locked",""], mock:["Development mock","mock"], checking:["Connecting…",""] };
    const [label,cls]=map[s]||["",""];
    if(el.status){ el.status.textContent=label; el.status.className="coach-status"+(cls?" "+cls:""); }
    if(el.fab) el.fab.classList.toggle("has-ai", s==="online"||s==="mock");
  }
  function coachMood(mood){ try{ if(window.IsaHamster && IsaHamster.handleCoachMood){ const m={proud:"proud",concerned:"caution",sleepy:"sleep",thinking:"thinking",excited:"proud"}[mood]; if(m) IsaHamster.handleCoachMood(m); } }catch(e){} }

  /* ============================================================ UI ============================================================ */
  const CHIPS = ["I can't do today's exercise","I can't cook today","I'm eating out","Quick high-protein meal","I'm sore today","Give me an exercise swap"];

  function build(){
    const fab=document.createElement("button"); fab.className="coach-fab"; fab.id="coachFab"; fab.type="button";
    fab.setAttribute("aria-label","Ask Hammy — your coach");
    fab.innerHTML=`<span class="coach-fab-dot"></span><span class="coach-fab-av">${avatar("pose-idle")}</span><span>Ask Hammy</span>`;
    document.body.appendChild(fab);
    const back=document.createElement("div"); back.className="coach-backdrop"; back.id="coachBack"; document.body.appendChild(back);

    const panel=document.createElement("div"); panel.className="coach-panel"; panel.id="coachPanel";
    panel.setAttribute("role","dialog"); panel.setAttribute("aria-modal","true"); panel.setAttribute("aria-label","Ask Hammy coach chat");
    panel.innerHTML=`
      <div class="coach-head">
        <div class="av">${avatar("pose-idle")}</div>
        <div class="ttl"><b>Ask Hammy</b><span class="sub">Fitness, food, and plan help <span class="coach-status" id="coachStatus">Connecting…</span></span></div>
        <button class="hbtn" id="coachLock" title="Lock / sign out" aria-label="Lock coach">🔒</button>
        <button class="hbtn" id="coachNew" title="New chat" aria-label="New chat">🗑️</button>
        <button class="hbtn" id="coachClose" title="Close" aria-label="Close">✕</button>
      </div>
      <div class="coach-msgs" id="coachMsgs" aria-live="polite"></div>
      <div class="coach-chips" id="coachChips"></div>
      <div class="coach-attach-preview" id="coachAttachPrev" style="display:none"></div>
      <div class="coach-input" id="coachInputBar">
        <input type="file" id="coachFile" accept="image/*" hidden>
        <button class="coach-iconbtn coach-attach" id="coachAttachBtn" title="Attach a menu/food photo" aria-label="Attach a photo">📎</button>
        <textarea id="coachText" rows="1" placeholder="Ask Hammy anything…" aria-label="Message Hammy"></textarea>
        <button class="coach-iconbtn coach-send" id="coachSend" title="Send" aria-label="Send" disabled>➤</button>
      </div>`;
    document.body.appendChild(panel);

    Object.assign(el,{ fab,back,panel,
      msgs:panel.querySelector("#coachMsgs"), chips:panel.querySelector("#coachChips"),
      text:panel.querySelector("#coachText"), send:panel.querySelector("#coachSend"),
      status:panel.querySelector("#coachStatus"), inputBar:panel.querySelector("#coachInputBar"),
      attachPrev:panel.querySelector("#coachAttachPrev"), file:panel.querySelector("#coachFile") });
    wire();
    el.chips.innerHTML=""; CHIPS.forEach(c=>{ const b=document.createElement("button"); b.className="coach-chip"; b.type="button"; b.textContent=c; b.addEventListener("click",()=>{ el.text.value=c; ask(); }); el.chips.appendChild(b); });
  }

  function showChrome(unlocked){
    el.chips.style.display = unlocked ? "flex" : "none";
    el.inputBar.style.display = unlocked ? "flex" : "none";
    el.attachPrev.style.display = (unlocked && attached) ? "block" : "none";
  }

  /* ---------- locked / access-code screen ---------- */
  function renderLocked(message){
    showChrome(false);
    el.msgs.innerHTML="";
    const box=document.createElement("div"); box.className="coach-locked";
    box.innerHTML=`
      <div class="wav">${avatar("pose-sit")}</div>
      <h3>🐹 Hammy's coach room is locked</h3>
      <p>Enter the private access code to chat with Hammy. Your code goes only to the secure coach server — it's never stored in your browser.</p>
      <form id="coachUnlockForm" autocomplete="off">
        <input id="coachCode" type="password" inputmode="text" placeholder="Access code" aria-label="Access code" autocomplete="off">
        <button type="submit" class="coach-unlock" id="coachUnlockBtn">Unlock</button>
      </form>
      <div class="coach-locked-err" id="coachUnlockErr">${message?message:""}</div>
      <button class="coach-offline-link" id="coachOfflineLink" type="button">Use Hammy's Offline Quick Help instead →</button>`;
    el.msgs.appendChild(box);
    const form=box.querySelector("#coachUnlockForm");
    form.addEventListener("submit",async (e)=>{ e.preventDefault(); await unlock(box.querySelector("#coachCode").value.trim(), box.querySelector("#coachUnlockBtn"), box.querySelector("#coachUnlockErr")); });
    box.querySelector("#coachOfflineLink").addEventListener("click",openOffline);
    setTimeout(()=>{ const i=box.querySelector("#coachCode"); if(i) i.focus(); },250);
  }
  async function unlock(code, btn, errEl){
    if(!code){ errEl.textContent="Enter the access code."; return; }
    btn.disabled=true; btn.textContent="Checking…"; errEl.textContent="";
    const r=await postSession(code);
    btn.disabled=false; btn.textContent="Unlock";
    if(r.status===200){ session={token:r.token, expires_at:r.expires_at}; lset("session",session); setStatus(DEV_MOCK?"mock":"online"); renderChat(); showChrome(true); setTimeout(()=>el.text.focus(),100); }
    else if(r.status===401){ errEl.textContent="That code didn't work. Try again."; }
    else if(r.offline || r.status===0){ errEl.textContent="Can't reach the coach server — check your internet."; setStatus("internet"); }
    else{ errEl.textContent="Coach is unavailable right now. Try again later."; setStatus("unavailable"); }
  }

  /* ---------- chat rendering ---------- */
  function renderChat(){
    showChrome(true);
    el.msgs.innerHTML="";
    if(!history.length){
      const w=document.createElement("div"); w.className="coach-welcome";
      w.innerHTML=`<div class="wav">${avatar("pose-idle")}</div><h3>Hi, I'm Hammy! 🐹</h3>
        <p>Your fitness & food coach. Ask me about workouts, swaps, soreness, meals, protein, eating out, sleep, or your weight — anything in your plan. Tap a suggestion to start.</p>`;
      el.msgs.appendChild(w);
      return;
    }
    history.forEach((m,i)=> el.msgs.appendChild(renderMsg(m,i)));
    scroll();
  }
  function renderMsg(m,i){
    const row=document.createElement("div"); row.className="coach-row "+(m.role==="user"?"user":"bot");
    if(m.role!=="user"){ const a=document.createElement("div"); a.className="av-sm"; a.innerHTML=avatar(MOOD_POSE[m.mood]||"pose-idle"); row.appendChild(a); }
    const bub=document.createElement("div"); bub.className="coach-bubble"; row.appendChild(bub);

    if(m.role==="user"){
      bub.textContent = m.text||"";                       // textContent — never raw HTML
      if(m._img){ const im=document.createElement("img"); im.src=m._img; im.alt="attached photo"; bub.appendChild(im); }
      return row;
    }
    // Hammy / system bubble
    if(m.source==="offline" || m.source==="mock"){
      const tag=document.createElement("div"); tag.className="coach-tag"; tag.textContent = m.source==="mock" ? "Development mock — not a real AI response" : "Offline Quick Help — not an AI response";
      bub.appendChild(tag);
    }
    if(m.safety==="urgent" || m.safety==="caution"){
      const ban=document.createElement("div"); ban.className="coach-safety "+m.safety;
      ban.textContent = (m.safety==="urgent"?"⚠️ Please take this seriously":"⚠️ A little caution");
      bub.appendChild(ban);
    }
    const p=document.createElement("div"); p.className="coach-reply"; p.textContent=m.text||"";   // textContent
    bub.appendChild(p);
    if(Array.isArray(m.options) && m.options.length){
      const wrap=document.createElement("div"); wrap.className="coach-options";
      m.options.slice(0,4).forEach(o=>{ const card=document.createElement("div"); card.className="coach-opt";
        const t=document.createElement("b"); t.textContent=o.title||""; const d=document.createElement("span"); d.textContent=o.details||"";
        card.appendChild(t); card.appendChild(d); wrap.appendChild(card); });
      bub.appendChild(wrap);
    }
    if(m.follow_up_question){ const f=document.createElement("button"); f.className="coach-followup"; f.type="button"; f.textContent=m.follow_up_question;
      f.addEventListener("click",()=>{ el.text.value=m.follow_up_question; el.text.focus(); }); bub.appendChild(f); }
    if(m.error){ const e2=document.createElement("button"); e2.className="coach-retry"; e2.type="button"; e2.textContent="↻ Retry"; e2.addEventListener("click",()=>retry(i)); bub.appendChild(e2); }
    if(m._offlineOffer){ const ob=document.createElement("button"); ob.className="coach-offline-link"; ob.type="button"; ob.textContent="Use Offline Quick Help →"; ob.addEventListener("click",openOffline); bub.appendChild(ob); }
    return row;
  }
  function scroll(){ requestAnimationFrame(()=>{ el.msgs.scrollTop=el.msgs.scrollHeight; }); }
  function typing(on){
    let t=el.msgs.querySelector(".coach-typing-row");
    if(on){ if(t)return; const row=document.createElement("div"); row.className="coach-row bot coach-typing-row";
      row.innerHTML=`<div class="av-sm">${avatar("pose-look-left")}</div><div class="coach-bubble" style="padding:6px 10px"><div class="coach-typing"><span></span><span></span><span></span></div></div>`;
      el.msgs.appendChild(row); scroll(); coachMood("thinking"); }
    else if(t){ t.remove(); }
  }
  function saveHistory(){ history=history.slice(-30); lset("history",history); }

  /* ---------- send / respond ---------- */
  function recentForWorker(){
    // send only the most recent useful 8–10 messages (text + role); image attached separately
    return history.filter(m=>m.role==="user"||m.role==="bot").slice(-10).map(m=>({ role: m.role==="user"?"user":"assistant", text: m.text||"" }));
  }
  async function ask(){
    const text=(el.text.value||"").trim();
    if((!text && !attached) || busy) return;
    if(!sessionValid() && !DEV_MOCK){ renderLocked("Please unlock the coach first."); return; }
    busy=true; el.send.disabled=true;
    const um={ role:"user", text:text||"(photo)" }; if(attached) um._img=attached;
    history.push(um);
    const img=attached; el.text.value=""; autosize(); clearAttach(); renderChat(); saveHistory();
    await respond(img);
    busy=false; updateSend();
  }
  async function respond(image){
    typing(true);
    const minDelay=new Promise(r=>setTimeout(r,450));
    const context = (typeof window.buildCoachContext==="function") ? window.buildCoachContext() : {};
    const r = await postChat(recentForWorker(), image, context);
    await minDelay; typing(false);
    if(r.status===200 && r.data){
      const d=r.data;
      history.push({ role:"bot", text:d.reply, options:d.options||[], follow_up_question:d.follow_up_question||null, safety:d.safety||"normal", mood:d.hammy_mood||"neutral", source: r.mock?"mock":undefined });
      setStatus(r.mock?"mock":"online"); coachMood(d.hammy_mood);
    } else if(r.status===401){
      ldel("session"); session=null; setStatus("locked"); renderLocked("Your session expired — please unlock again.");
      return;
    } else if(r.offline || r.status===0){
      setStatus("internet");
      history.push({ role:"bot", text:"I can't reach the coach server right now — looks like the internet dropped. You can use Offline Quick Help below for a fast tip. 🐹", error:true, safety:"normal", _offlineOffer:true });
    } else {
      setStatus("unavailable");
      history.push({ role:"bot", text:"The coach is having a moment and couldn't answer. Tap retry, or use Offline Quick Help. 🐹", error:true, safety:"normal", _offlineOffer:true });
    }
    renderChat(); saveHistory();
  }
  async function retry(i){
    if(busy) return;
    if(history[i] && history[i].role==="bot") history.splice(i,1);
    renderChat(); busy=true; el.send.disabled=true;
    const lastUser=history.filter(m=>m.role==="user").slice(-1)[0];
    await respond(lastUser && lastUser._img);
    busy=false; updateSend();
  }

  /* ---------- offline quick help (explicit, clearly labeled) ---------- */
  function openOffline(){
    showChrome(true); setStatus(status==="checking"?"internet":status);
    if(!history.length){ history=[]; }
    history.push({ role:"bot", text:"Switched to Hammy's Offline Quick Help — quick deterministic tips, not full AI answers. Ask away! 🐹", source:"offline", safety:"normal" });
    renderChat(); saveHistory(); setTimeout(()=>el.text.focus(),100);
    // route subsequent sends to offline help by flagging:
    offlineMode=true;
  }
  let offlineMode=false;
  async function offlineRespond(){
    typing(true); const minDelay=new Promise(r=>setTimeout(r,350));
    const context=(typeof window.buildCoachContext==="function")?window.buildCoachContext():{};
    const lastUser=history.filter(m=>m.role==="user").slice(-1)[0];
    const a=(window.HammyOfflineHelp?window.HammyOfflineHelp.answer(lastUser?lastUser.text:"",context):{reply:"(offline)",options:[],safety:"normal"});
    await minDelay; typing(false);
    history.push({ role:"bot", text:a.reply, options:a.options||[], safety:a.safety||"normal", source:"offline", mood:"neutral" });
    renderChat(); saveHistory();
  }

  /* ---------- attachments ---------- */
  function clearAttach(){ attached=null; el.attachPrev.style.display="none"; el.attachPrev.innerHTML=""; }
  function setAttach(dataUrl){ attached=dataUrl; el.attachPrev.style.display="block";
    el.attachPrev.innerHTML=`<img src="${dataUrl}" alt="attachment"><button type="button" id="coachAttachX" aria-label="Remove image">✕</button>`;
    el.attachPrev.querySelector("#coachAttachX").addEventListener("click",clearAttach); updateSend(); }
  function updateSend(){ el.send.disabled = busy || (!(el.text.value||"").trim() && !attached); }
  function autosize(){ el.text.style.height="auto"; el.text.style.height=Math.min(120, el.text.scrollHeight)+"px"; }

  /* ---------- open / close ---------- */
  let lastFocus=null, lockedScrollY=0;
  function lockScroll(){
    // iOS Safari ignores body{overflow:hidden} for touch scrolling, so pin the body in
    // place and restore the scroll position on close. Stops the tab scrolling behind the sheet.
    lockedScrollY=window.scrollY||window.pageYOffset||0;
    const b=document.body.style;
    b.position="fixed"; b.top=(-lockedScrollY)+"px"; b.left="0"; b.right="0"; b.width="100%"; b.overflow="hidden";
  }
  function unlockScroll(){
    const b=document.body.style;
    b.position=""; b.top=""; b.left=""; b.right=""; b.width=""; b.overflow="";
    window.scrollTo(0, lockedScrollY);
  }
  async function open(){
    lastFocus=document.activeElement;
    el.back.classList.add("open"); el.panel.classList.add("open"); el.fab.classList.add("hidden");
    lockScroll();
    setStatus("checking");
    const h=await health();
    if(DEV_MOCK){ if(sessionValid()){ setStatus("mock"); renderChat(); } else { setStatus("locked"); renderLocked(""); } }
    else if(!h.ok){ if(h.offline){ setStatus("internet"); if(sessionValid()){ renderChat(); } else renderLocked("Can't reach the coach server — you can use Offline Quick Help below."); }
                    else { setStatus("unavailable"); renderLocked("The coach server isn't reachable right now."); } }
    else if(!h.ready){ setStatus("unavailable"); renderLocked("The coach server isn't fully configured yet."); }
    else if(sessionValid()){ setStatus("online"); renderChat(); }
    else { setStatus("locked"); renderLocked(""); }
    if(sessionValid()||DEV_MOCK&&sessionValid()) setTimeout(()=>el.text&&el.text.focus(),300);
  }
  function close(){ el.back.classList.remove("open"); el.panel.classList.remove("open"); el.fab.classList.remove("hidden");
    unlockScroll(); if(lastFocus&&lastFocus.focus) try{lastFocus.focus();}catch(e){} }

  function wire(){
    el.fab.addEventListener("click",open);
    el.panel.querySelector("#coachClose").addEventListener("click",close);
    el.back.addEventListener("click",close);
    el.panel.querySelector("#coachNew").addEventListener("click",()=>{ if(history.length && !confirm("Start a new chat? This clears the current conversation.")) return; history=[]; offlineMode=false; saveHistory(); sessionValid()||DEV_MOCK?renderChat():renderLocked(""); });
    el.panel.querySelector("#coachLock").addEventListener("click",()=>{ if(!confirm("Lock the coach and sign out on this device?")) return; ldel("session"); session=null; offlineMode=false; setStatus("locked"); renderLocked("Locked. Enter your access code to chat again."); });
    el.text.addEventListener("input",()=>{ autosize(); updateSend(); });
    el.text.addEventListener("keydown",e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); offlineMode?offlineAsk():ask(); } });
    el.send.addEventListener("click",()=>{ offlineMode?offlineAsk():ask(); });
    el.panel.querySelector("#coachAttachBtn").addEventListener("click",()=>el.file.click());
    el.file.addEventListener("change",e=>{ const f=e.target.files[0]; if(!f) return; e.target.value="";
      if(!/^image\//.test(f.type)){ alert("Please choose an image."); return; }
      resizeImage(f,(data)=>{ if(!data){ alert("That image is too large even after shrinking — try a smaller photo."); return; } setAttach(data); }); });
    document.addEventListener("keydown",e=>{ if(e.key==="Escape" && el.panel.classList.contains("open")) close(); });
  }
  async function offlineAsk(){
    const text=(el.text.value||"").trim(); if((!text && !attached)||busy) return; busy=true; el.send.disabled=true;
    const um={role:"user",text:text||"(photo)"}; if(attached) um._img=attached; history.push(um);
    el.text.value=""; autosize(); clearAttach(); renderChat(); saveHistory();
    await offlineRespond(); busy=false; updateSend();
  }

  function init(){ if(!document.body) return; build(); }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init); else init();
})();
