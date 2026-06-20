/* ============================================================
   Hammy rig-lab engine (ISOLATED LAB — not wired to production)
   Layered raster cutout-puppet rig driven by the Web Animations API.
   Reuses the v3 lab's queue / gesture / timing / state-machine ideas.
   Until the real WebP parts are supplied, every layer renders as a clearly
   labelled PLACEHOLDER rectangle so the rig + animations can be validated.
   ============================================================ */
window.RigLab = (function(){
  "use strict";
  const RM = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const PH_COLORS = { head:"#ffb38a", body:"#e8b888", ear:"#ff9ec6", arm:"#d8a87a", leg:"#d8a87a",
    foot:"#d8a87a", tail:"#caa074", default:"#bfa", };
  function partColor(name){ for(const k in PH_COLORS){ if(name.indexOf(k)>=0) return PH_COLORS[k]; } return "#cdbfe8"; }

  const S = { rigs:{}, anims:null, active:null, dir:1, x:0, baseX:0,
    state:"idle", busy:false, gen:0, queue:[], raf:0, timers:[], paused:false,
    placeholder:false, started:false, lastPet:0, lastTap:0 };

  function fetchJSON(u){ return fetch(u).then(r=>{ if(!r.ok) throw new Error(u+" "+r.status); return r.json(); }); }
  function clearTimers(){ S.timers.forEach(clearTimeout); S.timers=[]; }
  function after(ms,fn){ const id=setTimeout(fn,ms); S.timers.push(id); return id; }

  /* ---------- build a rig into the DOM (outer = position, mirror = facing,
     inner = transform-origin + art/placeholder) ---------- */
  function buildRig(def, mount, rigName){
    mount.innerHTML="";
    const layerMap={};
    def.layers.slice().sort((a,b)=>a.z-b.z).forEach(L=>{
      const outer=document.createElement("div"); outer.className="rig-layer";
      outer.style.cssText=`left:${L.x}px;top:${L.y}px;width:${L.w}px;height:${L.h}px;z-index:${L.z};`+(L.opacity!=null?`opacity:${L.opacity};`:"");
      const mir=document.createElement("div"); mir.className="rig-mirror";
      if(L.mirrored) mir.style.transform="scaleX(-1)";
      const inner=document.createElement("div"); inner.className="rig-inner";
      inner.style.transformOrigin=`${(L.pivot?L.pivot[0]:0.5)*100}% ${(L.pivot?L.pivot[1]:0.5)*100}%`;
      mir.appendChild(inner); outer.appendChild(mir); mount.appendChild(outer);
      const rec={def:L, name:L.name, outer, mir, inner, anims:[], variant:null};
      layerMap[L.name]=rec;
      applyArt(rec, L.src);   // sets image or placeholder
    });
    return { name:rigName, def, mount, layerMap, layers:Object.values(layerMap) };
  }

  function applyArt(rec, src){
    const img=new Image();
    img.onload=()=>{ rec.inner.classList.remove("ph"); rec.inner.style.backgroundImage=`url(${src})`;
      rec.inner.style.backgroundSize="100% 100%"; rec.inner.textContent=""; };
    img.onerror=()=>{ markPlaceholder(rec); };
    img.src=src;
  }
  function markPlaceholder(rec){
    S.placeholder=true; document.body.classList.add("ph-mode");
    rec.inner.classList.add("ph"); rec.inner.style.backgroundImage="none";
    rec.inner.style.background=partColor(rec.name)+"cc";
    rec.inner.innerHTML=`<span class="ph-label">${rec.name}</span>`;
    const b=document.getElementById("missingBanner"); if(b) b.style.display="block";
  }

  function setHead(variant){
    const rig=S.active; if(!rig) return;
    const head = rig.name==="front" ? rig.layerMap["head"] : rig.layerMap["head-side"];
    if(!head) return;
    const v = (head.def.variants||{})[variant];
    if(head.inner.classList.contains("ph")){ head.inner.querySelector(".ph-label").textContent = head.name+":"+(variant||"neutral"); head.inner.style.background=partColor("head")+"cc"; }
    else if(v){ head.inner.style.backgroundImage=`url(${v})`; }
  }
  // Single-source rigs have no separate eyes-closed art — a blink / happy-squint is a quick
  // vertical squash of the optional 'eyes' layer (falls back to a head-variant swap if present).
  function eyeSquash(ms){
    const rig=S.active; if(!rig) return;
    const eyes=rig.layerMap["eyes"];
    if(eyes){ eyes.inner.animate([{transform:"scaleY(1)"},{transform:"scaleY(0.08)"},{transform:"scaleY(1)"}],{duration:ms||220,easing:"ease-in-out"}); }
    else { setHead("eyes-closed"); setTimeout(()=>{ if(S.state==="idle"&&!S.busy) setHead("neutral"); }, (ms||220)*0.6); }
  }

  /* ---------- switch which rig is visible ---------- */
  function useRig(name){
    if(S.active && S.active.name===name) return S.active;
    Object.values(S.rigs).forEach(r=> r.mount.style.display = r.name===name ? "block":"none");
    S.active=S.rigs[name]; return S.active;
  }
  function face(dir){ S.dir=dir<0?-1:1; const w=document.getElementById("charWrap"); if(w) w.style.transform=`translateX(${S.x}px) scaleX(${S.dir})`; }
  function place(){ const w=document.getElementById("charWrap"); if(w) w.style.transform=`translateX(${S.x}px) scaleX(${S.dir})`; }

  /* ---------- WAAPI playback of a state's per-layer tracks ---------- */
  function cancelAnims(){ Object.values(S.rigs).forEach(r=> r.layers.forEach(L=>{ L.anims.forEach(a=>{try{a.cancel();}catch(e){}}); L.anims=[]; })); }
  function playState(name){
    const def = (S.anims.front[name] ? S.anims.front[name] : S.anims.side[name]);
    if(!def){ console.warn("no anim:",name); return; }
    const rig=useRig(def.rig); cancelAnims(); S.state=name;
    if(def.head) setHead(def.head);
    setStatus(name);
    const dur=def.duration||1000, loop=!!def.loop;
    Object.keys(def.tracks||{}).forEach(layerName=>{
      const L=rig.layerMap[layerName]; if(!L) return;
      let t=def.tracks[layerName], kf, opts={};
      if(Array.isArray(t)) kf=t; else { kf=t.kf; opts=t.opts||{}; }
      const a=L.inner.animate(kf, {
        duration: RM?1:(opts.duration||dur),
        iterations: loop?Infinity:(opts.iterations||1),
        easing: opts.easing||"ease-in-out", direction: opts.direction||"normal",
        delay: opts.delay||0, fill:"forwards"
      });
      L.anims.push(a);
    });
    if(def.fx) fx(def.fx);
    if(def.translate) startTranslate(def.translate); else stopTranslate();
  }

  /* ---------- horizontal travel for side-rig states (feet contact ground) ---------- */
  function startTranslate(pxPerSec){
    stopTranslate(); const g=S.gen; let last=performance.now();
    function step(t){ if(g!==S.gen||S.paused){ return; }
      const dt=Math.min(64,t-last); last=t;
      S.x += S.dir * pxPerSec * (dt/1000);
      const stage=document.getElementById("stage"), W=stage?stage.clientWidth:320;
      if(S.x>W*0.32){ S.x=W*0.32; face(-1); } else if(S.x<-W*0.32){ S.x=-W*0.32; face(1); }
      place(); S.raf=requestAnimationFrame(step);
    }
    S.raf=requestAnimationFrame(step);
  }
  function stopTranslate(){ if(S.raf){ cancelAnimationFrame(S.raf); S.raf=0; } }

  /* ---------- queue / one-shots ---------- */
  function isLoop(name){ const d=S.anims.front[name]||S.anims.side[name]; return d&&d.loop; }
  function returnTo(name){ const d=S.anims.front[name]||S.anims.side[name]; return d&&d.returnTo; }
  function enqueue(name, front){ if(S.busy && !isLoop(name)){ if(front)S.queue.unshift(name); else S.queue.push(name); } else run(name); }
  function run(name){
    S.gen++; const g=S.gen; clearTimers(); stopTranslate();
    playState(name);
    if(isLoop(name)){ S.busy=false; return; }
    S.busy=true;
    const d=S.anims.front[name]||S.anims.side[name];
    after(d.duration||900, ()=>{ if(g!==S.gen) return; const rt=returnTo(name);
      if(rt){ run(rt); } else { S.busy=false; const nx=S.queue.shift(); if(nx) run(nx); else run("idle"); } });
  }

  /* ---------- compound behaviours ---------- */
  function doIdle(){ run("idle"); idleBlinkLoop(); }
  function idleBlinkLoop(){ clearTimeout(S._blink); if(S.paused) return;
    S._blink=setTimeout(()=>{ if(S.state==="idle" && !S.busy) eyeSquash(200); idleBlinkLoop(); }, 2200+Math.random()*2600); }
  function doPet(){ const t=performance.now(); enqueue("pet",true); eyeSquash(700);  // happy squint
    if(t-S.lastPet>1200){ S.lastPet=t; toast("Hammy loves that"); } }
  function doFall(){ const t=performance.now(); if(t-S.lastTap<800) return; S.lastTap=t;
    // anticipation -> (special fallen image would crossfade here) -> dizzy -> recover -> idle
    S.gen++; const g=S.gen; clearTimers(); stopTranslate(); playState("fallAnticipation"); S.busy=true;
    after(260, ()=>{ if(g!==S.gen)return; run("dizzy"); }); }   // dizzy -> recover -> idle via returnTo chain
  function doAnnoyed(){ enqueue("annoyed",true); }
  function doWalk(dir){ if(dir) face(dir); run("walk"); }
  function doWheel(){ run("wheel"); }
  function doSleep(){ /* phase-2: crossfade to sleep-curled special pose */ run("idle"); toast("(sleep uses a special pose — phase 2)"); }

  /* ---------- effects (small shapes, never part of the character art) ---------- */
  function fx(kind,n){
    const layer=document.getElementById("fxLayer"); if(!layer||RM&&kind!=="heart") {}
    n=n||3;
    const SHP={ heart:'<path d="M9 16 C2 11 2 5 6 4 C8 3.5 9 5 9 6 C9 5 10 3.5 12 4 C16 5 16 11 9 16Z" fill="#ff5fa2"/>',
      star:'<path d="M9 1 l2 5 5 .5 -4 3.5 1.3 5 -4.3-3 -4.3 3 1.3-5 -4-3.5 5-.5Z" fill="#ffcf4d"/>',
      crumb:'<circle cx="6" cy="6" r="3" fill="#c98a3a"/><circle cx="13" cy="11" r="2.4" fill="#b97a2e"/>',
      zzz:'<text x="2" y="14" font-size="13" fill="#9a7bd0" font-family="sans-serif">z</text>',
      dust:'<circle cx="9" cy="9" r="6" fill="rgba(180,150,120,.5)"/>' };
    for(let i=0;i<n;i++){ const d=document.createElement("div"); d.className="fx "+kind;
      d.innerHTML=`<svg viewBox="0 0 18 18" width="22" height="22">${SHP[kind]||SHP.star}</svg>`;
      d.style.left=(40+Math.random()*60)+"%"; d.style.setProperty("--dx",(Math.random()*30-15)+"px"); d.style.animationDelay=(i*90)+"ms";
      layer.appendChild(d); setTimeout(()=>d.remove(),1300); }
  }

  /* ---------- status / toast ---------- */
  function setStatus(s){ const e=document.getElementById("rigStatus"); if(e) e.textContent=s; }
  function toast(msg){ const t=document.getElementById("rigToast"); if(!t)return; t.textContent=msg; t.classList.add("show"); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove("show"),1500); }

  /* ---------- gestures (stroke=pet, tap=fall, 3 taps=annoyed) + keyboard ---------- */
  function bindGestures(){
    const el=document.getElementById("charWrap"); if(!el) return; let pd=null, taps=[];
    el.addEventListener("pointerdown",e=>{ pd={x:e.clientX,y:e.clientY,t:performance.now(),moved:0,pet:false}; try{el.setPointerCapture(e.pointerId);}catch(_){} });
    el.addEventListener("pointermove",e=>{ if(!pd)return; pd.moved=Math.hypot(e.clientX-pd.x,e.clientY-pd.y); if(pd.moved>16&&!pd.pet){ pd.pet=true; doPet(); } });
    el.addEventListener("pointerup",e=>{ if(!pd)return; const dur=performance.now()-pd.t,mv=pd.moved; pd=null;
      if(mv>16) return;
      if(dur<250&&mv<10){ const tn=performance.now(); taps=taps.filter(x=>tn-x<1500); taps.push(tn);
        if(taps.length>=3){ taps=[]; doAnnoyed(); } else doFall(); } });
    el.addEventListener("pointercancel",()=>{pd=null;});
    document.addEventListener("keydown",e=>{ if(e.target.tagName==="INPUT")return;
      if(e.key==="Enter"){ e.preventDefault(); doPet(); } else if(e.key===" "){ e.preventDefault(); doFall(); } });
  }
  function bindDebug(){
    document.querySelectorAll(".dbg [data-act]").forEach(b=> b.addEventListener("click",()=>{
      const a=b.dataset.act;
      if(a==="idle") doIdle(); else if(a==="walkL"){ doWalk(-1);} else if(a==="walkR"){ doWalk(1);}
      else if(a==="wheel") doWheel(); else if(a==="sniff") run("sniff");
      else if(a==="pet") doPet(); else if(a==="eat") run("eat"); else if(a==="fall") doFall();
      else if(a==="annoyed") doAnnoyed(); else if(a==="sleep") doSleep();
      else if(a==="pause"){ S.paused=!S.paused; const st=document.getElementById("stage"); if(st) st.classList.toggle("paused",S.paused); b.textContent=S.paused?"Resume":"Pause"; if(!S.paused){ place(); } }
    }));
  }

  function onVis(){ if(document.hidden){ S.paused=true; stopTranslate(); clearTimers(); clearTimeout(S._blink); document.getElementById("stage")&&document.getElementById("stage").classList.add("paused"); }
    else { S.paused=false; document.getElementById("stage")&&document.getElementById("stage").classList.remove("paused"); doIdle(); } }

  /* ---------- init ---------- */
  function init(){
    if(S.started) return;
    Promise.all([ fetchJSON("manifests/front-rig.json"), fetchJSON("manifests/side-rig.json"), fetchJSON("manifests/animations.json") ])
    .then(([front,side,anims])=>{
      S.anims=anims;
      S.rigs.front=buildRig(front, document.getElementById("rigFront"), "front");
      S.rigs.side =buildRig(side,  document.getElementById("rigSide"),  "side");
      useRig("front"); face(1); S.started=true;
      bindGestures(); bindDebug();
      window.addEventListener("RigEditor:applied",()=>{});  // editor hook
      document.addEventListener("visibilitychange", onVis);
      doIdle();
    }).catch(err=>{ console.error("rig load failed", err); const b=document.getElementById("missingBanner"); if(b){ b.style.display="block"; b.textContent="⚠ Could not load rig manifests: "+err.message; } });
  }

  // public API (debug / tests / editor)
  return { init, play:(n)=>run(n), idle:doIdle, pet:doPet, fall:doFall, annoyed:doAnnoyed, walk:doWalk,
    state:()=>({state:S.state, rig:S.active&&S.active.name, placeholder:S.placeholder, busy:S.busy, x:Math.round(S.x), dir:S.dir}),
    rigs:()=>S.rigs, useRig, setHead };
})();
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", window.RigLab.init); else window.RigLab.init();
