/* ============================================================
   Hammy — virtual pet hamster (WebP raster renderer)
   Public API: window.IsaHamster = { init, handleTrackerEvent, pet, tease, getState, openTab }

   Two clearly separated concerns:
     • CARE state  -> persistent, authoritative, saved at isa:v1:hamster:state
     • ANIM state  -> ephemeral animation/queue bookkeeping (never persisted)
   ============================================================ */
window.IsaHamster = (function(){
  "use strict";

  const NS = "isa:v1:";
  const STATE_KEY = "hamster:state";
  const VERSION = 1;
  const RM = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const MAX_ELAPSED_MS = 72 * 3600 * 1000; // decay cap

  /* ---------- low-level namespaced storage ---------- */
  function rawGet(k){ try{ return localStorage.getItem(NS+k); }catch(e){ return null; } }
  function rawSet(k,v){ try{ localStorage.setItem(NS+k, v); }catch(e){} }
  function clamp(v,a,b){ v=Number(v); if(!Number.isFinite(v)) v=a; return Math.max(a,Math.min(b,v)); }
  const rand=(a,b)=>a+Math.random()*(b-a);
  function now(){ return Date.now(); }

  /* ---------- CARE state (authoritative) ---------- */
  function defaults(){
    return { version:VERSION, name:"Hammy", fullness:70, happiness:70, energy:75,
      affectionXp:0, lastUpdatedAt:now(), lastInteractionAt:0, processedEvents:{}, unlockedDecorations:[] };
  }
  let care = defaults();

  function validate(o){
    if(!o || typeof o!=="object") return null;
    const d=defaults();
    return {
      version:VERSION,
      name:(typeof o.name==="string" && o.name.trim()) ? o.name.trim().slice(0,16) : d.name,
      fullness:clamp(o.fullness,0,100), happiness:clamp(o.happiness,0,100), energy:clamp(o.energy,0,100),
      affectionXp:Math.max(0, Math.floor(Number(o.affectionXp)||0)),
      lastUpdatedAt:Number(o.lastUpdatedAt)||now(),
      lastInteractionAt:Number(o.lastInteractionAt)||0,
      processedEvents:(o.processedEvents && typeof o.processedEvents==="object") ? o.processedEvents : {},
      unlockedDecorations:Array.isArray(o.unlockedDecorations) ? o.unlockedDecorations.filter(x=>typeof x==="string") : []
    };
  }
  function loadCare(){
    let parsed=null; try{ parsed=JSON.parse(rawGet(STATE_KEY)); }catch(e){}
    let c=validate(parsed);
    if(!c){
      c=defaults();
      try{ const on=JSON.parse(rawGet("hammy_name")); if(typeof on==="string"&&on.trim()) c.name=on.trim().slice(0,16); }catch(e){}
      try{ const oh=JSON.parse(rawGet("hammy_happy")); if(Number.isFinite(oh)) c.happiness=clamp(oh,0,100); }catch(e){}
    }
    care=c;
    pruneProcessed();
    applyDecay();
    saveCare();
    return care;
  }
  function saveCare(){ if(!care.lastUpdatedAt) care.lastUpdatedAt=now(); rawSet(STATE_KEY, JSON.stringify(care)); }

  /* ---------- elapsed-time decay ---------- */
  function applyDecay(){
    const t=now(); let dt=t-(care.lastUpdatedAt||t);
    if(dt<=0){ care.lastUpdatedAt=t; return; }
    dt=Math.min(dt, MAX_ELAPSED_MS);
    const hrs=dt/3600000;
    care.fullness  = clamp(care.fullness  - hrs*1.0, 0, 100);
    care.happiness = clamp(care.happiness - hrs*0.3, 0, 100);
    care.energy    = clamp(care.energy    + hrs*2.2, 0, 100);
    care.lastUpdatedAt=t;
  }

  /* ---------- event idempotency ---------- */
  function processed(id){ return !!care.processedEvents[id]; }
  function markProcessed(id){ care.processedEvents[id]=1; }
  function pruneProcessed(){
    const keep={}, cutoff=now()-31*86400000;
    Object.keys(care.processedEvents||{}).forEach(id=>{
      const dk=id.split("|")[1]; let ts=NaN;
      if(dk){ const p=dk.split("-").map(Number); if(p.length===3) ts=new Date(p[0],p[1]-1,p[2]).getTime(); }
      if(!Number.isFinite(ts) || ts>=cutoff) keep[id]=1;
    });
    care.processedEvents=keep;
  }
  function todayKey(){ const d=new Date(); return d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate(); }

  function bump(stat, delta){ care[stat]=clamp(care[stat]+delta, 0, 100); }
  function addAffection(n){ care.affectionXp=Math.max(0, care.affectionXp+n); checkUnlocks(); }
  function checkUnlocks(){
    if(care.affectionXp>=40 && care.unlockedDecorations.indexOf("bow")<0) care.unlockedDecorations.push("bow");
  }

  /* ---------- ANIM state (ephemeral) ---------- */
  const A = { el:null, stage:null, shadow:null, decorEl:null,
    poseEl:null, fxLayer:null, walkInterval:0,
    hx:60, dir:1, w:320, raf:0, idleTimer:0, timers:[], paused:false,
    mood:"idle", busy:false, gen:0, queue:[], started:false, lastPet:0, lastTap:0 };

  const SPOT={ bed:0.08, bowl:0.20, wheel:0.54, tunnel:0.9, bottle:0.9, center:0.5, home:0.30, exercise:0.34 };
  const ACTIVITY={ idle:"is exploring",walking:"is exploring",sniffing:"is sniffing around",grooming:"is grooming its fur",
    sitting:"is just chilling",waitbowl:"is waiting by the bowl",looking:"is looking at you 🥰",wiggle:"wiggled its ears",
    eating:"is munching too 🍽️",drinking:"is having a sip",sleeping:"is napping 😴",resting:"is catching its breath",
    wheel:"is running on its wheel",exercising:"is working out too 💪",petted:"loves the pets 💕",
    shoveLeft:"needs a second…",shoveRight:"needs a second…",
    fallLeft:"went tumbling! ⭐",fallRight:"went tumbling! ⭐",
    dizzy:"looks dizzy",annoyed:"is not impressed",shakeOff:"shook it off",
    recovering:"is shaking it off" };

  /* ---------- WebP pose system ---------- */
  const POSE_PATH = "assets/hammy/poses/hammy-";
  const POSE_MAP = {
    idle:"idle", walking:null, sniffing:"idle", grooming:"idle",
    sitting:"idle", waitbowl:"idle", looking:"idle",
    wiggle:"idle", eating:"eat", drinking:"eat",
    sleeping:"sleep", resting:"idle", wheel:"walk-1",
    exercising:"walk-1", petted:"petted",
    recovering:"idle",
    shoveLeft:"idle", shoveRight:"idle",
    fallLeft:"fallen", fallRight:"fallen",
    dizzy:"dizzy", annoyed:"annoyed", shakeOff:"idle"
  };
  const WALK_FRAMES=["walk-1","walk-2","walk-3","walk-4"];

  function frac(f){ return Math.max(38, Math.min(A.w-38, f*A.w)); }
  function place(){ if(A.el) A.el.style.left=A.hx+"px"; if(A.shadow){ A.shadow.style.left=A.hx+"px"; A.shadow.style.display="block"; } }
  function face(d){ A.dir=d<0?-1:1; if(A.el) A.el.style.transform="translateX(-50%) scaleX("+A.dir+")"; }
  function cancelRaf(){ if(A.raf){ cancelAnimationFrame(A.raf); A.raf=0; } }
  function clearTimers(){ A.timers.forEach(clearTimeout); A.timers=[]; }
  function after(ms,fn){ const id=setTimeout(fn, ms); A.timers.push(id); return id; }

  function mood(m){
    A.mood=m;
    const pose=POSE_MAP[m];
    if(pose && A.poseEl) A.poseEl.src = POSE_PATH + pose + ".webp";
    if(A.el){
      A.el.className="hammy mood-"+m;
    }
    face(A.dir); render();
  }

  /* ---------- floating effects (emoji-based) ---------- */
  function fx(kind,n){
    const layer=A.fxLayer||A.stage; if(!layer) return;
    const chars = kind==="heart"?["❤️","💗","💖"]:kind==="star"?["⭐","✨","🌟"]:["💤"];
    n=n||(kind==="zzz"?1:3);
    for(let i=0;i<n;i++){
      const d=document.createElement("div"); d.className="hfx "+kind; d.textContent=chars[i%chars.length];
      d.style.left=A.hx+"px"; d.style.setProperty("--dx",rand(-16,16)+"px");
      d.style.animationDelay=(i*90)+"ms";
      layer.appendChild(d); setTimeout(()=>d.remove(),1500);
    }
  }

  /* ---------- environment ambient ---------- */
  let bubbleTimer=0;
  function scheduleBubble(){
    if(bubbleTimer) clearTimeout(bubbleTimer);
    if(A.paused||RM) return;
    bubbleTimer=setTimeout(()=>{
      if(!A.paused&&!document.hidden&&A.stage){
        const b=document.createElement("div"); b.className="bottle-bubble";
        b.style.top="54px"; b.style.right="18px";
        A.stage.appendChild(b); setTimeout(()=>b.remove(),1300);
      }
      scheduleBubble();
    }, rand(15000,40000));
  }

  /* ---------- movement ---------- */
  function walkTo(target, done){
    mood("walking");
    if(!RM && A.poseEl){
      let wf=0;
      clearInterval(A.walkInterval);
      A.walkInterval=setInterval(()=>{wf=(wf+1)%4;if(A.poseEl)A.poseEl.src=POSE_PATH+WALK_FRAMES[wf]+".webp";},150);
    }
    const start=A.hx, dist=target-start;
    if(Math.abs(dist)<3 || RM){ A.hx=target; place(); clearInterval(A.walkInterval); A.walkInterval=0; done&&done(); return; }
    face(dist>0?1:-1);
    const dur=Math.min(2600, Math.max(350, Math.abs(dist)/0.075));
    const t0=performance.now(), g=A.gen; cancelRaf();
    function step(t){ if(g!==A.gen||A.paused) return; const k=Math.min(1,(t-t0)/dur);
      A.hx=start+dist*k; place();
      if(k<1) A.raf=requestAnimationFrame(step); else { A.raf=0; clearInterval(A.walkInterval); A.walkInterval=0; done&&done(); } }
    A.raf=requestAnimationFrame(step);
  }

  /* ---------- action queue ---------- */
  function enqueue(act, front){ if(front) A.queue.unshift(act); else A.queue.push(act); pump(); }
  function pump(){
    if(A.busy||A.paused) return;
    if(!A.queue.length){ scheduleIdle(); return; }
    const act=A.queue.shift(); A.busy=true; const g=A.gen;
    act(()=>{ if(g!==A.gen) return; A.busy=false; pump(); });
  }
  function scheduleIdle(){ clearTimeout(A.idleTimer); if(A.paused) return;
    A.idleTimer=setTimeout(()=>{ if(!A.busy&&!A.paused&&!A.queue.length) enqueue(pickIdle()); }, rand(4000,10000)); }

  /* ---------- idle actions ---------- */
  function aIdle(done){ mood("idle"); after(rand(1400,2600),done); }
  function aLook(done){ face(Math.random()<.5?-1:1); mood("looking"); after(1800,done); }
  function aWiggle(done){ mood("wiggle"); after(1200,done); }
  function aSniff(done){ const x=Math.random()<.5?rand(.12,.40):rand(.64,.84); walkTo(frac(x), ()=>{ mood("sniffing"); after(1600,done); }); }
  function aGroom(done){ mood("sitting"); after(300,()=>{ mood("grooming"); after(2200,done); }); }
  function aDrink(done){ walkTo(frac(SPOT.bottle), ()=>{ face(1); mood("drinking"); after(2200,done); }); }
  function aWaitBowl(done){ walkTo(frac(SPOT.bowl), ()=>{ mood("waitbowl"); after(2000,done); }); }
  function aTunnel(done){
    walkTo(frac(SPOT.tunnel), ()=>{
      if(A.el)A.el.style.opacity="0.15";
      mood("idle"); after(1800,()=>{
        if(A.el)A.el.style.opacity="";
        done();
      });
    });
  }
  function aSit(done){ mood("sitting"); after(2200,done); }
  function aWheelIdle(done){ walkTo(frac(SPOT.wheel), ()=>{ mood("wheel");
    // Cycle wheel frames
    let wf=0; const WH=["walk-1","walk-2"];
    if(!RM && A.poseEl){ clearInterval(A.walkInterval); A.walkInterval=setInterval(()=>{wf=(wf+1)%2;A.poseEl.src=POSE_PATH+WH[wf]+".webp";},200); }
    after(2400,()=>{ clearInterval(A.walkInterval); A.walkInterval=0; bump("energy",-1); saveCare(); walkTo(frac(SPOT.home), done); }); }); }
  function aNap(done){ walkTo(frac(SPOT.bed), ()=>{ mood("sitting"); after(300,()=>{ mood("sleeping"); fx("zzz"); bump("energy",2); saveCare(); after(2800,done); }); }); }

  function pickIdle(){
    const hr=new Date().getHours(); const night=(hr>=21||hr<6);
    const pool=[];
    const add=(fn,w)=>{ for(let i=0;i<w;i++) pool.push(fn); };
    add(aIdle,2); add(aLook,2); add(aWiggle,1); add(aSniff,2); add(aGroom,2); add(aDrink,1); add(aSit,1); add(aTunnel,1); add(aWheelIdle,1);
    add(aNap, night?5:2);
    if(care.energy<30) add(aNap,6);
    if(care.fullness<30) add(aWaitBowl,5);
    if(care.happiness<35) add(aSit,5);
    return pool[Math.floor(Math.random()*pool.length)];
  }

  /* ---------- event reaction animations ---------- */
  function animMeal(idx, done){
    walkTo(frac(SPOT.bowl), ()=>{ face(-1); mood("eating");
      // Cycle eat frames
      let ef=0; const EF=["eat","eat","eat"];
      if(!RM && A.poseEl){ clearInterval(A.walkInterval); A.walkInterval=setInterval(()=>{ef=(ef+1)%3;A.poseEl.src=POSE_PATH+EF[ef]+".webp";},250); }
      if(idx===3) fx("heart",3); else if(idx===1) fx("heart",1);
      const dur = idx===1?2800 : idx===2?1400 : idx===3?2000 : 1800;
      after(dur, ()=>{ clearInterval(A.walkInterval); A.walkInterval=0; done(); }); });
  }
  function animWorkout(done){
    walkTo(frac(SPOT.exercise), ()=>{ mood("exercising");
      // Cycle workout frames
      let wf=0; const WK=["walk-1","walk-3"];
      if(!RM && A.poseEl){ clearInterval(A.walkInterval); A.walkInterval=setInterval(()=>{wf=(wf+1)%2;A.poseEl.src=POSE_PATH+WK[wf]+".webp";},300); }
      after(2600, ()=>{ clearInterval(A.walkInterval); A.walkInterval=0; mood("resting"); after(1400, ()=>walkTo(frac(SPOT.home), done)); }); });
  }
  function animWheel(done){
    walkTo(frac(SPOT.wheel), ()=>{ mood("wheel");
      let wf=0; const WH=["walk-1","walk-2"];
      if(!RM && A.poseEl){ clearInterval(A.walkInterval); A.walkInterval=setInterval(()=>{wf=(wf+1)%2;A.poseEl.src=POSE_PATH+WH[wf]+".webp";},200); }
      fx("star",2);
      after(4000, ()=>{ clearInterval(A.walkInterval); A.walkInterval=0; mood("resting"); after(1000, ()=>walkTo(frac(SPOT.home), done)); }); });
  }
  function animSleep(happy, done){
    walkTo(frac(SPOT.bed), ()=>{ mood("sleeping"); fx("zzz");
      after(1600, ()=>fx("zzz")); after(happy?4200:3400, done); });
  }

  /* ---------- public reaction: handleTrackerEvent ---------- */
  function handleTrackerEvent(type, detail){
    detail=detail||{}; const dk=detail.date||todayKey();
    if(type==="meal"){
      const idx = (detail.mealIndex!=null) ? detail.mealIndex : 0;
      const id="meal|"+dk+"|"+idx;
      if(processed(id)) return;
      markProcessed(id);
      const gain = idx===1?24 : idx===2?10 : idx===3?12 : 14;
      bump("fullness",gain); addAffection(1); saveCare();
      const msg = idx===1?"Hammy enjoyed a big meal 🍲" : idx===2?"Hammy had a protein snack 💪" : idx===3?"Hammy got a special treat 🍓" : "Hammy had a little breakfast 🌅";
      message(msg); enqueue((d)=>animMeal(idx,d), true); render(); return;
    }
    if(type==="protein"){
      const id="protein|"+dk; if(processed(id)) return; markProcessed(id);
      bump("fullness",5); addAffection(1); saveCare(); fx("heart",2); message("Hammy nibbled some protein 💕"); render(); return;
    }
    if(type==="workout"){
      const id="workout|"+dk+"|"+(detail.workoutType||"any"); if(processed(id)) return; markProcessed(id);
      bump("happiness",6); bump("energy",-6); addAffection(2); saveCare();
      message("Hammy trained with you 💪"); enqueue(animWorkout, true); render(); return;
    }
    if(type==="steps"){
      const id="step|"+dk; if(processed(id)) return; markProcessed(id);
      bump("happiness",4); bump("energy",-4); addAffection(1); saveCare();
      message("Hammy ran on the wheel! 🎡"); enqueue(animWheel, true); render(); return;
    }
    if(type==="sleep"){
      const id="sleep|"+dk; if(processed(id)) return; markProcessed(id);
      const hrs=Number(detail.sleepHours)||0, good=hrs>=7;
      bump("energy", good?30:20); if(good) bump("happiness",3); addAffection(1); saveCare();
      message(good?"Hammy had a cozy sleep 😴":"Hammy had a little nap 😴");
      enqueue((d)=>animSleep(good,d), true); render(); return;
    }
    if(type==="checkin"){
      bump("happiness",4); addAffection(2); saveCare();
      fx("heart",4); if(!RM && typeof window.confettiRain==="function") window.confettiRain();
      message("Hammy is proud of you 💖"); render(); return;
    }
  }

  /* ---------- interactions: pet (stroke) & tease (tap) ---------- */
  function interrupt(){ A.gen++; cancelRaf(); clearTimers(); clearTimeout(A.idleTimer); clearInterval(A.walkInterval); A.walkInterval=0; A.busy=true; }
  function release(){ if(A.paused){ A.busy=false; return; } A.busy=false; mood("idle"); pump(); }

  function petStart(){ interrupt(); mood("petted"); fx("heart",1); }
  function petFinish(){
    const t=now();
    if(t-A.lastPet>1200){ A.lastPet=t; bump("happiness",4); addAffection(2); care.lastInteractionAt=t; saveCare();
      fx("heart",3); message(care.name+" loves that 💕"); render(); }
    after(900, release);
  }
  function pet(){ petStart(); petFinish(); }

  /* ---------- tease (fall-over sequence) ---------- */
  let recentTaps = [];

  function tease(dir){
    const t=now();
    if(t-A.lastTap<1200) return; // cooldown
    A.lastTap=t; interrupt();
    care.lastInteractionAt=t; saveCare();

    recentTaps.push(t);
    recentTaps = recentTaps.filter(ts => t-ts < 5000);
    const forceAnnoyed = recentTaps.length >= 2;

    if(RM){
      mood("dizzy"); fx("star",1); message(care.name+" looks dizzy");
      after(700, release); return;
    }

    // 1. Anticipation
    const fallDir = dir < 0 ? "Left" : "Right";
    mood("shove"+fallDir);

    after(100, ()=>{
      // 2. Fall
      mood("fall"+fallDir); fx("star",3);

      after(250, ()=>{
        // 3. On floor — stay in fall pose

        after(rand(500,900), ()=>{
          // 4. Reaction
          if(forceAnnoyed || Math.random() < 0.4){
            mood("annoyed");
            message(care.name+" is not impressed");
          } else {
            mood("dizzy");
            message(care.name+" looks dizzy");
          }

          after(1200, ()=>{
            // 5. Recovery
            mood("shakeOff");
            message(care.name+" shook it off");
            after(600, release);
          });
        });
      });
    });
  }

  /* ---------- gesture detection ---------- */
  function bindGestures(){
    let pd=null;
    A.el.addEventListener("pointerdown", e=>{ pd={x:e.clientX,y:e.clientY,t:performance.now(),moved:0,pet:false};
      try{ A.el.setPointerCapture(e.pointerId); }catch(_){} });
    A.el.addEventListener("pointermove", e=>{ if(!pd) return; pd.moved=Math.hypot(e.clientX-pd.x, e.clientY-pd.y);
      if(pd.moved>15 && !pd.pet){ pd.pet=true; petStart(); } });
    A.el.addEventListener("pointerup", e=>{ if(!pd) return; const dur=performance.now()-pd.t, moved=pd.moved;
      const r=A.el.getBoundingClientRect(), cx=r.left+r.width/2, p=pd; pd=null;
      if(p.pet){ petFinish(); }
      else if(dur<250 && moved<10){ tease(e.clientX<cx?1:-1); } });
    A.el.addEventListener("pointercancel", ()=>{ if(pd&&pd.pet) release(); pd=null; });
    // keyboard: Enter pets, Space teases
    A.el.addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); pet(); }
      else if(e.key===" "){ e.preventDefault(); tease(Math.random()<.5?-1:1); } });
  }

  /* ---------- rendering ---------- */
  function setText(id,t){ const e=document.getElementById(id); if(e) e.textContent=t; }
  function setWidth(id,v){ const e=document.getElementById(id); if(e) e.style.width=clamp(v,0,100)+"%"; }
  function heartsStr(){ const lvl=Math.min(5, Math.floor(care.affectionXp/20)); return "❤️".repeat(Math.max(1,lvl)) + "  ·  Lv " + (Math.floor(care.affectionXp/20)+1); }
  let _msg="";
  function message(t){ _msg=t; setText("hamMsg", t); }
  function gentleHint(){
    if(care.fullness<25) return "Hammy could use a snack when you have your next meal";
    if(care.energy<25)   return "Hammy is having a sleepy day";
    if(care.happiness<35) return "A little pet would make Hammy happy";
    return "Hammy is happy you're here 💕";
  }
  function render(){
    setText("hammyStatus", care.name+" "+(ACTIVITY[A.mood]||"is hanging out"));
    setText("hammyCardStatus", ACTIVITY[A.mood]||"is hanging out");
    setText("hammyCardName", care.name);
    setText("hammyNameShow", care.name);
    setWidth("hamFullness", care.fullness); setWidth("hamHappiness", care.happiness); setWidth("hamEnergy", care.energy);
    setText("hamHearts", heartsStr());
    if(!_msg) setText("hamMsg", gentleHint());
    renderDecor();
  }
  window.__hammyRefresh = render;
  function renderDecor(){ if(!A.decorEl) return; A.decorEl.style.display = care.unlockedDecorations.indexOf("bow")>=0 ? "block" : "none"; }

  /* ---------- time of day ---------- */
  function applyTimeOfDay(){
    if(!A.stage) return; const hr=new Date().getHours();
    A.stage.classList.remove("tod-day","tod-evening","tod-night");
    A.stage.classList.add(hr>=21||hr<6 ? "tod-night" : (hr>=18 ? "tod-evening" : "tod-day"));
  }

  /* ---------- name editing ---------- */
  function bindName(){
    const inp=document.getElementById("hammyName"), btn=document.getElementById("hammyNameSave");
    if(inp) inp.value=care.name;
    function saveName(){ const v=((inp&&inp.value)||"").trim().slice(0,16); care.name=v||"Hammy"; if(inp) inp.value=care.name;
      saveCare(); render(); message("Hi, I'm "+care.name+"! 🐹"); }
    if(btn) btn.addEventListener("click", saveName);
    if(inp) inp.addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); saveName(); } });
  }

  /* ---------- instruction overlay ---------- */
  const HINT_KEY = "hammy_hint_seen";
  function showHintOnce(){
    if(rawGet(HINT_KEY)) return;
    const hint = document.getElementById("hammyHint");
    if(hint){ hint.classList.add("show");
      setTimeout(()=>{ hint.classList.remove("show"); rawSet(HINT_KEY,"1"); }, 4000);
    }
  }

  /* ---------- tracker custom-event bridge ---------- */
  const EVMAP={ "meal-completed":"meal","protein-completed":"protein","workout-completed":"workout",
    "step-target-reached":"steps","sleep-logged":"sleep","checkin-saved":"checkin" };
  function bindEvents(){
    Object.keys(EVMAP).forEach(name=>{
      window.addEventListener("isa:"+name, e=>handleTrackerEvent(EVMAP[name], (e&&e.detail)||{}));
    });
  }

  /* ---------- visibility & resize ---------- */
  function measure(){ if(!A.stage) return; A.w=A.stage.clientWidth||320; A.hx=Math.max(38,Math.min(A.w-38,A.hx)); place(); }
  function onVis(){
    if(document.hidden){
      A.paused=true; cancelRaf(); clearTimers(); clearTimeout(A.idleTimer); clearInterval(A.walkInterval); A.walkInterval=0; clearTimeout(bubbleTimer); bubbleTimer=0; if(A.stage) A.stage.classList.add("paused");
    } else {
      A.paused=false; if(A.stage) A.stage.classList.remove("paused");
      applyDecay(); saveCare();
      A.gen++; A.busy=false; clearInterval(A.walkInterval); A.walkInterval=0;
      if(A.el) A.el.style.opacity="";
      applyTimeOfDay(); mood("idle"); _msg=""; render(); scheduleIdle(); scheduleBubble();
    }
  }

  /* ---------- init ---------- */
  function init(){
    if(A.started) return;
    A.el=document.getElementById("hammyPet");
    A.stage=document.getElementById("hammyStage");
    A.shadow=document.getElementById("hammyShadow");
    A.decorEl=document.getElementById("hammyDecorUnlock");
    A.poseEl=document.getElementById("hammyPose");
    A.fxLayer=document.getElementById("hammyFxLayer");
    if(!A.el||!A.stage) return;
    A.started=true;
    loadCare();
    measure(); A.hx=frac(SPOT.home); place(); face(1);
    applyTimeOfDay();
    bindGestures(); bindName(); bindEvents();
    mood("idle"); render(); scheduleIdle(); scheduleBubble();
    window.addEventListener("resize", measure);
    document.addEventListener("visibilitychange", onVis);
    setInterval(()=>{ if(!document.hidden) applyTimeOfDay(); }, 1800000);
    // Show hint after a short delay for first-time users
    setTimeout(showHintOnce, 2000);
  }

  function openTab(){ const t=document.getElementById("tab-hammy"); if(t) t.click(); }
  function getState(){ return JSON.parse(JSON.stringify(care)); }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init); else init();

  return { init, handleTrackerEvent, pet, tease, getState, openTab };
})();
