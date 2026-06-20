/* ============================================================
   Hammy v3 — sprite animation engine (LAB PROTOTYPE)
   Genuine multi-frame playback: frame arrays + per-animation
   frame duration, loop vs one-shot, queued actions, movement
   while walking, auto-return to idle, no overlap/corruption.
   Not wired to the production tracker.
   ============================================================ */
(function(){
  "use strict";
  const M = window.HAMMY_MANIFEST;
  const RM = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

  const stage = document.getElementById("stage");
  const el    = document.getElementById("hammy");
  const use   = document.getElementById("frameUse");
  const statusEl = document.getElementById("status");
  const hint  = document.getElementById("hint");
  if(!stage || !el || !use) return;

  // ---- animation state (ephemeral) ----
  const S = {
    name:"idle", def:M.animations.idle, idx:0, acc:0,   // acc = ms accumulated toward next frame
    dir:1, x:0, w:0, charW:120,
    raf:0, last:0, paused:false,
    queue:[],            // pending one-shot animation names
    locked:false         // true while a one-shot is playing (prevents overlap)
  };

  // frame ids in the manifest are bare ("f-idle-0"); reference them same-document with "#"
  function setFrame(i){ S.idx=i; const id=S.def.frames[i]; const ref=id[0]==="#"?id:"#"+id;
    use.setAttribute("href", ref); use.setAttributeNS("http://www.w3.org/1999/xlink","href", ref); }
  function face(d){ S.dir = d<0?-1:1; render(); }
  function render(){
    el.style.transform = "translateX(-50%) scaleX("+S.dir+")";
    el.style.left = S.x + "px";
  }
  function measure(){ S.w = stage.clientWidth || 320; S.charW = el.offsetWidth || 120;
    if(!S.x) S.x = S.w*0.5; clampX(); render(); }
  function clampX(){ const m=S.charW*0.5+4; S.x = Math.max(m, Math.min(S.w-m, S.x)); }
  function setStatus(t){ if(statusEl) statusEl.textContent = t; }

  // ---- core playback ----
  // play(): loops (idle/walk) just switch; one-shots lock + auto-return.
  function play(name, opts){
    opts = opts || {};
    const def = M.animations[name];
    if(!def) return;
    if(def.loop){
      // a loop only starts if nothing one-shot is currently locked (unless forced)
      if(S.locked && !opts.force) { return; }
      S.name=name; S.def=def; S.acc=0; setFrame(0); S.locked=false;
      setStatus(name);
    } else {
      // one-shot: interrupt current and play now (queue is for stacking requests)
      S.name=name; S.def=def; S.acc=0; setFrame(0); S.locked=true;
      setStatus(name);
    }
  }
  function enqueue(name){ // request a one-shot; if busy, queue it (no overlap/corruption)
    if(S.locked){ if(S.queue.length<3) S.queue.push(name); }
    else play(name);
  }
  function finishOneShot(){
    S.locked=false;
    const next = S.queue.shift();
    if(next) play(next);
    else play("idle", {force:true});
  }

  // ---- frame loop (rAF; movement integrated; pauses when hidden/paused) ----
  function tick(ts){
    S.raf = requestAnimationFrame(tick);
    if(S.paused){ S.last=ts; return; }
    const dt = S.last ? Math.min(64, ts - S.last) : 16; S.last = ts;

    // advance frames by accumulated time
    const frameDur = 1000 / (S.def.fps || 6);
    S.acc += dt;
    while(S.acc >= frameDur){
      S.acc -= frameDur;
      let n = S.idx + 1;
      if(n >= S.def.frames.length){
        if(S.def.loop){ n = 0; }
        else { setFrame(S.def.frames.length-1); finishOneShot(); return; }
      }
      setFrame(n);
    }
    // movement while walking
    if(S.def.moves){
      const speed = 70; // px/sec
      S.x += S.dir * speed * (dt/1000);
      const m = S.charW*0.5+4;
      if(S.x <= m){ S.x=m; face(1); }          // bounce off walls, keep walking
      else if(S.x >= S.w-m){ S.x=S.w-m; face(-1); }
      render();
    }
  }

  // ---- interactions: stroke=pet, tap=fall, 3 quick taps=annoyed ----
  // (mirrors the real app's direct-touch model; no Pet/Nudge buttons)
  let pd=null, tapTimes=[];
  function onDown(e){ pd={x:e.clientX,y:e.clientY,t:performance.now(),moved:0,pet:false};
    try{ el.setPointerCapture(e.pointerId); }catch(_){} }
  function onMove(e){ if(!pd) return; pd.moved=Math.hypot(e.clientX-pd.x, e.clientY-pd.y);
    if(pd.moved>16 && !pd.pet){ pd.pet=true; enqueue("pet"); } }
  function onUp(e){ if(!pd) return; const dur=performance.now()-pd.t, moved=pd.moved; pd=null;
    if(moved>16) return;                      // was a stroke → already petting
    if(dur<260 && moved<10){                  // quick tap
      const now=performance.now(); tapTimes=tapTimes.filter(t=>now-t<1500); tapTimes.push(now);
      if(tapTimes.length>=3){ tapTimes=[]; enqueue("annoyed"); }
      else enqueue("fall");
    }
  }
  el.addEventListener("pointerdown",onDown);
  el.addEventListener("pointermove",onMove);
  el.addEventListener("pointerup",onUp);
  el.addEventListener("pointercancel",()=>{pd=null;});
  el.addEventListener("keydown",e=>{
    if(e.key==="Enter"){ e.preventDefault(); enqueue("pet"); }
    else if(e.key===" "){ e.preventDefault(); enqueue("fall"); }
  });

  // ---- debug panel (lab only) ----
  document.querySelectorAll(".panel button").forEach(b=>{
    b.addEventListener("click",()=>{
      const a=b.dataset.act;
      if(a==="idle") play("idle",{force:true});
      else if(a==="walkLeft"){ face(-1); play("walk",{force:true}); }
      else if(a==="walkRight"){ face(1); play("walk",{force:true}); }
      else if(a==="pet") enqueue("pet");
      else if(a==="fall") enqueue("fall");
      else if(a==="annoyed") enqueue("annoyed");
      else if(a==="pause"){ S.paused=!S.paused; document.getElementById("pauseBtn").textContent=S.paused?"Resume":"Pause"; if(stage) stage.classList.toggle("paused",S.paused); }
    });
  });

  // ---- lifecycle ----
  document.addEventListener("visibilitychange",()=>{ // pause work when hidden
    if(document.hidden){ S.paused=true; if(stage) stage.classList.add("paused"); }
    else { S.paused=false; if(stage) stage.classList.remove("paused"); S.last=0; }
  });
  window.addEventListener("resize", measure);
  setTimeout(()=>{ if(hint) hint.classList.add("show"); }, 600);
  setTimeout(()=>{ if(hint) hint.classList.remove("show"); }, 4200);

  // expose for capture/tests
  window.HammyLab = {
    play:(n)=>play(n,{force:true}), enqueue, face,
    state:()=>({name:S.name, idx:S.idx, frame:S.def.frames[S.idx], dir:S.dir, x:Math.round(S.x), locked:S.locked, paused:S.paused}),
    setPaused:(v)=>{S.paused=!!v;}
  };

  measure(); play("idle",{force:true});
  S.raf = requestAnimationFrame(tick);
})();
