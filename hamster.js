/* ============================================================
   Hammy — virtual pet hamster
   Public API: window.IsaHamster = { init, handleTrackerEvent, pet, nudge, getState, openTab }

   Two clearly separated concerns:
     • CARE state  -> persistent, authoritative, saved at isa:v1:hamster:state
     • ANIM state  -> ephemeral animation/queue bookkeeping (never persisted)
   ============================================================ */
window.IsaHamster = (function(){
  "use strict";

  const NS = "isa:v1:";
  const STATE_KEY = "hamster:state";
  const VERSION = 1;
  // Owner opted Hammy into full animation regardless of the OS "Reduce Motion" setting
  // (that setting was making tap look identical to pet and freezing the pet).
  const RM = false;
  const MAX_ELAPSED_MS = 72 * 3600 * 1000; // decay cap: a month closed ≈ 3 days of change

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

  // Validate anything we read from storage / a backup before trusting it.
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
    if(!c){ // fresh, or migrate from the very first prototype keys
      c=defaults();
      try{ const on=JSON.parse(rawGet("hammy_name")); if(typeof on==="string"&&on.trim()) c.name=on.trim().slice(0,16); }catch(e){}
      try{ const oh=JSON.parse(rawGet("hammy_happy")); if(Number.isFinite(oh)) c.happiness=clamp(oh,0,100); }catch(e){}
    }
    care=c;
    pruneProcessed();
    applyDecay();      // catch up on real time that passed while closed
    saveCare();
    return care;
  }
  function saveCare(){ if(!care.lastUpdatedAt) care.lastUpdatedAt=now(); rawSet(STATE_KEY, JSON.stringify(care)); }

  /* ---------- elapsed-time decay ----------
     Computed only when the app opens / becomes visible — never via a
     background timer. Elapsed time is capped so a long absence stays gentle,
     and the hamster can never reach a "dead" or harmful state. */
  function applyDecay(){
    const t=now(); let dt=t-(care.lastUpdatedAt||t);
    if(dt<=0){ care.lastUpdatedAt=t; return; }
    dt=Math.min(dt, MAX_ELAPSED_MS);
    const hrs=dt/3600000;
    care.fullness  = clamp(care.fullness  - hrs*1.0, 0, 100); // slow (~24/day)
    care.happiness = clamp(care.happiness - hrs*0.3, 0, 100); // extremely slow
    care.energy    = clamp(care.energy    + hrs*2.2, 0, 100); // recovers while resting
    care.lastUpdatedAt=t;
  }

  /* ---------- event idempotency ----------
     Each rewardable tracker event has a stable id like "meal|2026-6-19|0".
     We store processed ids in care.processedEvents so unchecking/rechecking
     or reloading can never replay or duplicate a reward. */
  function processed(id){ return !!care.processedEvents[id]; }
  function markProcessed(id){ care.processedEvents[id]=1; }
  function pruneProcessed(){ // forget ids older than ~31 days to keep state small
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
  const A = { el:null, flip:null, stage:null, wheel:null, shadow:null, bowlFood:null, decorEl:null,
    poseEl:null, fxLayer:null, walkInterval:0,
    hx:60, dir:1, w:320, raf:0, idleTimer:0, timers:[], paused:false,
    mood:"idle", busy:false, gen:0, queue:[], started:false, lastPet:0, lastTap:0 };

  const SPOT={ bed:0.08, bowl:0.20, wheel:0.54, tunnel:0.9, bottle:0.9, center:0.5, home:0.30, exercise:0.34 };
  const ACTIVITY={ idle:"is exploring",walking:"is exploring",sniffing:"is sniffing around",grooming:"is grooming its fur",
    sitting:"is just chilling",waitbowl:"is waiting by the bowl",looking:"is looking at you 🥰",wiggle:"wiggled its ears",
    eating:"is munching too 🍽️",drinking:"is having a sip",sleeping:"is napping 😴",resting:"is catching its breath",
    wheel:"is running on its wheel",exercising:"is working out too 💪",petted:"loves the pets 💕",
    tumbling:"toppled over! ⭐",recovering:"is shaking it off",dizzy:"is seeing stars ⭐",annoyed:"is a little annoyed 😤" };

  const POSE_MAP = {
    idle:"pose-idle", walking:null, sniffing:"pose-sniff", grooming:"pose-groom-1",
    sitting:"pose-sit", waitbowl:"pose-wait-bowl", looking:"pose-look-left",
    wiggle:"pose-idle", eating:"pose-eat-1", drinking:"pose-drink",
    sleeping:"pose-sleep", resting:"pose-sit", wheel:"pose-wheel-1",
    exercising:"pose-exercise-1", petted:"pose-petted", tumbling:"pose-tumble-1",
    recovering:"pose-recover", dizzy:"pose-dizzy", annoyed:"pose-annoyed"
  };

  function frac(f){ return Math.max(38, Math.min(A.w-38, f*A.w)); }
  function place(){ if(A.el) A.el.style.left=A.hx+"px"; if(A.shadow){ A.shadow.style.left=A.hx+"px"; A.shadow.style.display="block"; } }
  function face(d){ A.dir=d<0?-1:1; if(A.flip) A.flip.style.transform="scaleX("+A.dir+")"; }
  function cancelRaf(){ if(A.raf){ cancelAnimationFrame(A.raf); A.raf=0; } }
  function clearTimers(){ A.timers.forEach(clearTimeout); A.timers=[]; }
  function after(ms,fn){ const id=setTimeout(fn, ms); A.timers.push(id); return id; }
  function mood(m){
    A.mood=m;
    const pid=POSE_MAP[m]; if(pid&&A.poseEl) A.poseEl.setAttribute("href","#"+pid);
    if(A.el){ const onWheel=A.el.classList.contains("on-wheel"), inT=A.el.classList.contains("in-tunnel"),
      tl=A.el.classList.contains("tumble-left"), tr=A.el.classList.contains("tumble-right");
      A.el.className="hammy mood-"+m+(onWheel?" on-wheel":"")+(inT?" in-tunnel":"")+(tl?" tumble-left":"")+(tr?" tumble-right":""); }
    face(A.dir); render();
  }

  /* ---------- floating effects ---------- */
  const FX_MAP={heart:["fx-heart-1","fx-heart-2","fx-heart-3"],star:["fx-star-1","fx-sparkle","fx-star-2"],zzz:["fx-zzz"],dust:["fx-dust-1","fx-dust-2"],crumb:["fx-crumb-1","fx-crumb-2"]};
  function fx(kind,n){
    const layer=A.fxLayer||A.stage; if(!layer) return;
    const syms=FX_MAP[kind]||FX_MAP.star;
    n=n||(kind==="zzz"?1:3);
    for(let i=0;i<n;i++){
      const s=document.createElementNS("http://www.w3.org/2000/svg","svg");
      s.setAttribute("class","hfx "+kind); s.setAttribute("viewBox","0 0 24 24");
      s.style.left=A.hx+"px"; s.style.setProperty("--dx",rand(-16,16)+"px");
      s.style.animationDelay=(i*90)+"ms";
      const u=document.createElementNS("http://www.w3.org/2000/svg","use");
      u.setAttribute("href","#"+syms[i%syms.length]);
      s.appendChild(u); layer.appendChild(s); setTimeout(()=>s.remove(),1500);
    }
  }
  function onWheel(on){
    if(A.wheel){
      if(on){ A.wheel.classList.remove("wobble"); A.wheel.classList.toggle("spin", !RM); }
      else { A.wheel.classList.remove("spin"); if(!RM) A.wheel.classList.add("wobble"); }
    }
    if(A.el) A.el.classList.toggle("on-wheel", on);
  }
  function bowlFood(show){ if(A.bowlFood) A.bowlFood.style.display=show?"block":"none"; }

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

  /* ---------- movement (rAF only while actually walking; instant under reduced motion) ---------- */
  function walkTo(target, done){
    mood("walking");
    if(!RM && A.poseEl){
      let wf=0; const WF=["pose-walk-1","pose-walk-2","pose-walk-3","pose-walk-4"];
      clearInterval(A.walkInterval);
      A.walkInterval=setInterval(()=>{wf=(wf+1)%4;if(A.poseEl)A.poseEl.setAttribute("href","#"+WF[wf]);},120);
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

  /* ---------- action queue ----------
     Idle actions and event reactions are queued so they never overlap or
     corrupt each other. A generation counter (A.gen) invalidates any in-flight
     action when an interaction interrupts it. */
  function enqueue(act, front){ if(front) A.queue.unshift(act); else A.queue.push(act); pump(); }
  function pump(){
    if(A.busy||A.paused) return;
    if(!A.queue.length){ scheduleIdle(); return; }
    const act=A.queue.shift(); A.busy=true; const g=A.gen;
    act(()=>{ if(g!==A.gen) return; A.busy=false; pump(); });
  }
  function scheduleIdle(){ clearTimeout(A.idleTimer); if(A.paused) return;
    A.idleTimer=setTimeout(()=>{ if(!A.busy&&!A.paused&&!A.queue.length) enqueue(pickIdle()); }, rand(2200,5000)); }

  /* ---------- micro-idle: small glances / ear-wiggles so Hammy is never frozen
     between scheduled actions. Only runs while truly resting (idle, not busy);
     reverts only if still idle so it can never clobber a real animation. ---------- */
  function scheduleMicro(){ clearTimeout(A.microTimer); if(A.paused) return;
    A.microTimer=setTimeout(()=>{
      if(A.mood==="idle" && !A.busy && !A.paused && !A.queue.length && A.poseEl){
        const r=Math.random();
        if(r<0.55){ // quick glance using existing look poses
          A.poseEl.setAttribute("href", Math.random()<0.5 ? "#pose-look-left" : "#pose-look-right");
          setTimeout(()=>{ if(A.mood==="idle" && !A.busy && A.poseEl) A.poseEl.setAttribute("href","#pose-idle"); }, 650);
        } else if(r<0.85 && A.el){ // brief ear wiggle (reuses .mood-wiggle CSS)
          A.el.classList.add("mood-wiggle");
          setTimeout(()=>{ if(A.mood==="idle" && !A.busy && A.el) A.el.classList.remove("mood-wiggle"); }, 1000);
        }
      }
      scheduleMicro();
    }, rand(1800,3400)); }

  /* ---------- idle actions ---------- */
  function aIdle(done){ mood("idle"); after(rand(1400,2600),done); }
  function aLook(done){ face(Math.random()<.5?-1:1); mood("looking"); after(1800,done); }
  function aWiggle(done){ mood("wiggle"); after(1200,done); }
  // wander to a clear spot, avoiding the wheel band so we never park on/inside the wheel
  function aSniff(done){ const x=Math.random()<.5?rand(.12,.40):rand(.64,.84); walkTo(frac(x), ()=>{ mood("sniffing"); after(1600,done); }); }
  function aGroom(done){ mood("sitting"); after(300,()=>{ mood("grooming"); after(2200,done); }); }
  function aDrink(done){ walkTo(frac(SPOT.bottle), ()=>{ face(1); mood("drinking"); after(2200,done); }); }
  function aWaitBowl(done){ walkTo(frac(SPOT.bowl), ()=>{ mood("waitbowl"); after(2000,done); }); }
  function aTunnel(done){
    const tunnelEl=document.querySelector('.prop-tunnel');
    walkTo(frac(SPOT.tunnel), ()=>{
      if(A.el)A.el.classList.add("in-tunnel");
      if(tunnelEl)tunnelEl.classList.add("hammy-inside");
      mood("idle"); after(1800,()=>{
        if(A.el)A.el.classList.remove("in-tunnel");
        if(tunnelEl)tunnelEl.classList.remove("hammy-inside");
        done();
      });
    });
  }
  function aSit(done){ mood("sitting"); after(2200,done); }
  function aWheelIdle(done){ walkTo(frac(SPOT.wheel), ()=>{ onWheel(true); mood("wheel"); after(2400,()=>{ onWheel(false); bump("energy",-1); saveCare(); walkTo(frac(SPOT.home), done); }); }); }
  function aNap(done){ walkTo(frac(SPOT.bed), ()=>{ mood("sitting"); after(300,()=>{ mood("sleeping"); fx("zzz"); bump("energy",2); saveCare(); after(2800,done); }); }); }

  // pick the next idle action, gently weighted by care state + time of day
  function pickIdle(){
    const hr=new Date().getHours(); const night=(hr>=21||hr<6);
    const pool=[];
    const add=(fn,w)=>{ for(let i=0;i<w;i++) pool.push(fn); };
    add(aIdle,1); add(aLook,3); add(aWiggle,2); add(aSniff,3); add(aGroom,2); add(aDrink,1); add(aSit,1); add(aTunnel,1); add(aWheelIdle,1);
    add(aNap, night?5:2);
    if(care.energy<30) add(aNap,6);                 // sleepy day → naps more
    if(care.fullness<30) add(aWaitBowl,5);          // hungry → waits by the bowl
    if(care.happiness<35) add(aSit,5);              // low spirits → sits quietly (until petted)
    return pool[Math.floor(Math.random()*pool.length)];
  }

  /* ---------- event reaction animations ---------- */
  function animMeal(idx, done){
    bowlFood(true);
    walkTo(frac(SPOT.bowl), ()=>{ face(-1); mood("eating");
      if(idx===3) fx("heart",3); else if(idx===1) fx("heart",1);
      const dur = idx===1?2800 : idx===2?1400 : idx===3?2000 : 1800;
      after(dur, ()=>{ bowlFood(false); done(); }); });
  }
  function animWorkout(done){
    walkTo(frac(SPOT.exercise), ()=>{ mood("exercising");
      after(2600, ()=>{ mood("resting"); after(1400, ()=>walkTo(frac(SPOT.home), done)); }); });   // exercise → rest → home
  }
  function animWheel(done){
    walkTo(frac(SPOT.wheel), ()=>{ onWheel(true); mood("wheel"); fx("star",2);
      after(4000, ()=>{ onWheel(false); mood("resting"); after(1000, ()=>walkTo(frac(SPOT.home), done)); }); });
  }
  function animSleep(happy, done){
    walkTo(frac(SPOT.bed), ()=>{ mood("sleeping"); fx("zzz");
      after(1600, ()=>fx("zzz")); after(happy?4200:3400, done); });
  }

  /* ---------- public reaction: handleTrackerEvent ----------
     Rewards are applied here (synchronously, exactly once via idempotency),
     decoupled from the animation so an interrupted animation never affects
     the reward. */
  function handleTrackerEvent(type, detail){
    detail=detail||{}; const dk=detail.date||todayKey();
    if(type==="meal"){
      const idx = (detail.mealIndex!=null) ? detail.mealIndex : 0;
      const id="meal|"+dk+"|"+idx;
      if(processed(id)) return;                     // already eaten today → no duplicate
      markProcessed(id);
      const gain = idx===1?24 : idx===2?10 : idx===3?12 : 14;   // main / topup / treat / breakfast
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
      const id="step|"+dk; if(processed(id)) return; markProcessed(id);     // only on first crossing per day
      bump("happiness",4); bump("energy",-4); addAffection(1); saveCare();
      message("Hammy ran on the wheel! 🎡"); enqueue(animWheel, true); render(); return;
    }
    if(type==="sleep"){
      const id="sleep|"+dk; if(processed(id)) return; markProcessed(id);
      const hrs=Number(detail.sleepHours)||0, good=hrs>=7;
      bump("energy", good?30:20); if(good) bump("happiness",3); addAffection(1); saveCare();
      message(good?"Hammy had a cozy sleep 😴":"Hammy had a little nap 😴");   // supportive either way
      enqueue((d)=>animSleep(good,d), true); render(); return;
    }
    if(type==="checkin"){
      bump("happiness",4); addAffection(2); saveCare();                     // not deduped — celebrate every save
      fx("heart",4); if(!RM && typeof window.confettiRain==="function") window.confettiRain();
      message("Hammy is proud of you 💖"); render(); return;
    }
  }

  /* ---------- interactions: pet (stroke) & nudge (tap) ---------- */
  function interrupt(){ A.gen++; cancelRaf(); clearTimers(); clearTimeout(A.idleTimer); clearInterval(A.walkInterval); A.walkInterval=0; A.busy=true; }
  function release(){ if(A.paused){ A.busy=false; return; } A.busy=false; mood("idle"); pump(); }

  function petStart(){ interrupt(); mood("petted"); fx("heart",1); }
  function petFinish(){
    const t=now();
    // throttle so rapidly rubbing the screen can't farm happiness/affection
    if(t-A.lastPet>1200){ A.lastPet=t; bump("happiness",4); addAffection(2); care.lastInteractionAt=t; saveCare();
      fx("heart",3); message(care.name+" loves that 💕"); render(); }
    after(900, release);
  }
  function pet(){ petStart(); petFinish(); }   // public / button / keyboard

  // quick tap → topple over → see stars (dizzy) → shake it off. Distinct from pet.
  function nudge(dir){
    const t=now(); if(t-A.lastTap<900) return;  // short cooldown so it can't be spammed into broken states
    A.lastTap=t; interrupt(); face(dir<0?-1:1);
    care.lastInteractionAt=t; saveCare();
    if(A.el) A.el.classList.add(dir<0?"tumble-left":"tumble-right");
    mood("tumbling"); fx("star",4); message(care.name+" toppled over — wheee! ⭐");
    after(900, ()=>{ if(A.el) A.el.classList.remove("tumble-left","tumble-right"); mood("dizzy"); fx("star",2);
      after(900, ()=>{ mood("recovering"); after(600, release); }); });
  }
  // three quick taps → annoyed (no harm, just a cute huff)
  function annoyed(){
    const t=now(); A.lastTap=t; interrupt();
    mood("annoyed"); fx("star",2); message(care.name+" is a little annoyed 😤");
    after(1500, release);
  }

  /* ---------- gesture detection (pointer + touch + keyboard) ----------
     A stroke = pointer started on Hammy and moved ≥15px (rewarded on release).
     A tap    = released <250ms with <10px movement (playful nudge away from tap). */
  function bindGestures(){
    let pd=null, tapTimes=[];
    A.el.addEventListener("pointerdown", e=>{ pd={x:e.clientX,y:e.clientY,t:performance.now(),moved:0,pet:false};
      try{ A.el.setPointerCapture(e.pointerId); }catch(_){} });
    A.el.addEventListener("pointermove", e=>{ if(!pd) return; pd.moved=Math.hypot(e.clientX-pd.x, e.clientY-pd.y);
      if(pd.moved>15 && !pd.pet){ pd.pet=true; petStart(); } });
    A.el.addEventListener("pointerup", e=>{ if(!pd) return; const dur=performance.now()-pd.t, moved=pd.moved;
      const r=A.el.getBoundingClientRect(), cx=r.left+r.width/2, p=pd; pd=null;
      if(p.pet){ petFinish(); }
      else if(dur<250 && moved<10){           // quick tap
        const tn=performance.now(); tapTimes=tapTimes.filter(x=>tn-x<1500); tapTimes.push(tn);
        if(tapTimes.length>=3){ tapTimes=[]; annoyed(); }      // three quick taps → annoyed
        else nudge(e.clientX<cx?1:-1);                          // single tap → topple away from the tapped side
      } });
    A.el.addEventListener("pointercancel", ()=>{ if(pd&&pd.pet) release(); pd=null; });
    // keyboard: Enter pets, Space topples
    A.el.addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); pet(); }
      else if(e.key===" "){ e.preventDefault(); nudge(Math.random()<.5?-1:1); } });
  }

  /* ---------- rendering of status / bars / messages ---------- */
  function setText(id,t){ const e=document.getElementById(id); if(e) e.textContent=t; }
  function setWidth(id,v){ const e=document.getElementById(id); if(e) e.style.width=clamp(v,0,100)+"%"; }
  function heartsStr(){ const lvl=Math.min(5, Math.floor(care.affectionXp/20)); return "❤️".repeat(Math.max(1,lvl)) + "  ·  Lv " + (Math.floor(care.affectionXp/20)+1); }
  let _msg="";
  function message(t){ _msg=t; setText("hamMsg", t); }
  function gentleHint(){ // friendly, never guilt — used when nothing recent happened
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
  window.__hammyRefresh = render;   // tracker re-render hook (Today card rebuilds)
  function renderDecor(){ if(!A.decorEl) return; A.decorEl.style.display = care.unlockedDecorations.indexOf("bow")>=0 ? "block" : "none"; }

  /* ---------- time of day (local) ---------- */
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

  /* ---------- give food / water (manual care buttons) ---------- */
  function giveFood(){
    const t=now(); if(t-(A._lastFeed||0)<1500) return; A._lastFeed=t;   // throttle so it can't be spammed
    interrupt();
    walkTo(frac(SPOT.bowl), ()=>{ face(-1); bowlFood(true); mood("eating"); fx("heart",1);
      bump("fullness",12); addAffection(1); saveCare(); message(care.name+" enjoyed a snack 🥕");
      after(2000, ()=>{ bowlFood(false); release(); }); });
  }
  function giveWater(){
    const t=now(); if(t-(A._lastWater||0)<1500) return; A._lastWater=t;
    interrupt();
    walkTo(frac(SPOT.bottle), ()=>{ face(1); mood("drinking"); fx("heart",1);
      bump("happiness",2); addAffection(1); saveCare(); message(care.name+" had a refreshing drink 💧");
      after(2000, release); });
  }
  function bindButtons(){
    const fb=document.getElementById("hammyFeedBtn"); if(fb) fb.addEventListener("click", giveFood);
    const wb=document.getElementById("hammyWaterBtn"); if(wb) wb.addEventListener("click", giveWater);
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
    if(document.hidden){ // pause all animation work while the tab is hidden
      A.paused=true; cancelRaf(); clearTimers(); clearTimeout(A.idleTimer); clearTimeout(A.microTimer); clearInterval(A.walkInterval); A.walkInterval=0; clearTimeout(bubbleTimer); bubbleTimer=0; if(A.stage) A.stage.classList.add("paused");
    } else { // recompute decay for the time we were away, then resume cleanly
      A.paused=false; if(A.stage) A.stage.classList.remove("paused");
      applyDecay(); saveCare();
      A.gen++; A.busy=false; onWheel(false); clearInterval(A.walkInterval); A.walkInterval=0;
      if(A.el) A.el.classList.remove("in-tunnel","tumble-left","tumble-right");
      applyTimeOfDay(); mood("idle"); _msg=""; render(); scheduleIdle(); scheduleBubble(); scheduleMicro();
    }
  }

  /* ---------- init ---------- */
  function init(){
    if(A.started) return;
    A.el=document.getElementById("hammyPet"); A.flip=document.getElementById("hammyFlip");
    A.stage=document.getElementById("hammyStage"); A.wheel=document.getElementById("hammyWheel");
    A.shadow=document.getElementById("hammyShadow"); A.bowlFood=document.getElementById("hammyBowlFood");
    A.decorEl=document.getElementById("hammyDecorUnlock");
    A.poseEl=document.getElementById("hammyPose");
    A.fxLayer=document.getElementById("hammyFxLayer");
    if(!A.el||!A.stage) return;     // markup not present
    A.started=true;
    loadCare();
    measure(); A.hx=frac(SPOT.home); place(); face(1);
    applyTimeOfDay();
    bindGestures(); bindButtons(); bindName(); bindEvents();
    mood("idle"); render(); scheduleIdle(); scheduleBubble(); scheduleMicro();
    window.addEventListener("resize", measure);
    document.addEventListener("visibilitychange", onVis);
    // refresh time-of-day roughly each half hour (cheap, only when visible)
    setInterval(()=>{ if(!document.hidden) applyTimeOfDay(); }, 1800000);
  }

  function openTab(){ const t=document.getElementById("tab-hammy"); if(t) t.click(); }
  function getState(){ return JSON.parse(JSON.stringify(care)); }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init); else init();

  return { init, handleTrackerEvent, pet, nudge, getState, openTab };
})();
