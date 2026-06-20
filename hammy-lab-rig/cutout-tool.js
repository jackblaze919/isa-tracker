/* ============================================================
   Hammy Cutout & Rig Studio (ISOLATED LAB)
   One full-body #0057FF source image -> hand-masked transparent puppet
   layers + rig JSON. Never auto-traces, never redraws, never vectorizes.
   ============================================================ */
(function(){
  "use strict";
  const $ = id => document.getElementById(id);
  const KEY = "hammy-cutout-project-v1";

  // required parts (+ optional eyes for blink / happy-squint from a single source)
  const DEFAULTS = [
    { name:"tail",       z:10, parent:"body", color:"#caa074" },
    { name:"body",       z:20, parent:null,   color:"#e8b888" },
    { name:"foot-left",  z:25, parent:"body", color:"#d8a87a" },
    { name:"foot-right", z:25, parent:"body", color:"#d8a87a" },
    { name:"arm-left",   z:30, parent:"body", color:"#d8a87a" },
    { name:"arm-right",  z:30, parent:"body", color:"#d8a87a" },
    { name:"ear-left",   z:35, parent:"head", color:"#ff9ec6" },
    { name:"ear-right",  z:35, parent:"head", color:"#ff9ec6" },
    { name:"head",       z:40, parent:null,   color:"#ffb38a" },
    { name:"eyes",       z:42, parent:"head", color:"#7ac88c", optional:true }
  ];

  const S = {
    img:null, srcW:0, srcH:0, srcName:"front-rig-source.png",
    keyed:null,            // canvas: source with blue removed
    disp:1,                // display scale (canvas px per source px)
    mode:"mask",
    parts:{}, order:DEFAULTS.map(d=>d.name), sel:"body",
    drawing:false,         // currently adding points to sel polygon
    dragVtx:null, dragPivot:false, dragLayer:null,
    keyHigh:70, keyLow:20
  };
  DEFAULTS.forEach(d=> S.parts[d.name] = {
    name:d.name, z:d.z, parent:d.parent, color:d.color, optional:!!d.optional,
    poly:[], pad:8, pivot:[0.5,0.5], scale:1, opacity:1, dx:0, dy:0, hidden:false, mirrored:false,
    layer:null, bbox:null, dataURL:null   // filled on extract
  });

  /* ---------- chroma key (matches tools/extract-rig-sheets.py) ---------- */
  function keyBackground(){
    if(!S.img) return;
    const c=document.createElement("canvas"); c.width=S.srcW; c.height=S.srcH;
    const x=c.getContext("2d"); x.drawImage(S.img,0,0);
    const d=x.getImageData(0,0,S.srcW,S.srcH), p=d.data, hi=S.keyHigh, lo=S.keyLow;
    for(let i=0;i<p.length;i+=4){
      const R=p[i],G=p[i+1],B=p[i+2], excess=B-Math.max(R,G);
      let a=(hi-excess)/(hi-lo); a=a<0?0:a>1?1:a;
      if(excess>0 && a<0.95) p[i+2]=Math.min(B, Math.max(R,G)+12); // de-spill
      p[i+3]=Math.round(a*255);
    }
    x.putImageData(d,0,0); S.keyed=c;
  }

  /* ---------- load source ---------- */
  function loadImage(src, name){
    const img=new Image(); img.crossOrigin="anonymous";
    img.onload=()=>{ S.img=img; S.srcW=img.naturalWidth; S.srcH=img.naturalHeight; S.srcName=name||S.srcName;
      keyBackground(); layoutStage(); draw(); buildPartList();
      $("srcStatus").textContent=`${S.srcName} · ${S.srcW}×${S.srcH}`; setStage(""); };
    img.onerror=()=>{ $("srcStatus").textContent="could not load "+(name||src); };
    img.src=src;
  }
  function layoutStage(){
    const wrap=$("toolStage"); const maxW=Math.min(wrap.clientWidth||640, 720);
    S.disp = S.srcW? Math.min(1, maxW/S.srcW) : 1;
    const w=Math.round(S.srcW*S.disp), h=Math.round(S.srcH*S.disp);
    ["bgCheck","srcCanvas","rigCanvas"].forEach(id=>{ const c=$(id); c.width=w; c.height=h; });
    const ov=$("overlay"); ov.setAttribute("width",w); ov.setAttribute("height",h); ov.setAttribute("viewBox",`0 0 ${w} ${h}`);
    drawChecker();
  }
  function drawChecker(){ const c=$("bgCheck"),x=c.getContext("2d"),s=14;
    for(let y=0;y<c.height;y+=s)for(let X=0;X<c.width;X+=s){ x.fillStyle=((X/s+y/s)&1)?"#eadfe6":"#fbf3f8"; x.fillRect(X,y,s,s);} }

  /* ---------- coord helpers ---------- */
  function toSrc(e){ const r=$("overlay").getBoundingClientRect();
    return [ (e.clientX-r.left)/S.disp, (e.clientY-r.top)/S.disp ]; }
  function D(v){ return v*S.disp; }   // src -> display

  /* ---------- draw source / overlay ---------- */
  function draw(){
    const c=$("srcCanvas"), x=c.getContext("2d"); x.clearRect(0,0,c.width,c.height);
    if(S.keyed) x.drawImage(S.keyed,0,0,c.width,c.height);
    drawOverlay();
  }
  function drawOverlay(){
    const ov=$("overlay"); ov.innerHTML="";
    if(S.mode==="mask"){
      const p=S.parts[S.sel]; if(!p) return;
      if(p.poly.length){
        const pts=p.poly.map(pt=>`${D(pt[0])},${D(pt[1])}`).join(" ");
        const el=document.createElementNS("http://www.w3.org/2000/svg", p.layer?"polygon":"polyline");
        el.setAttribute("points",pts); el.setAttribute("class","poly"+(p.layer?" done":"")); ov.appendChild(el);
        p.poly.forEach((pt,i)=>{ const cdot=document.createElementNS("http://www.w3.org/2000/svg","circle");
          cdot.setAttribute("cx",D(pt[0])); cdot.setAttribute("cy",D(pt[1])); cdot.setAttribute("r",5); cdot.setAttribute("class","vtx"); cdot.dataset.i=i; ov.appendChild(cdot); });
      }
    } else { // rig mode: hit-rects + pivot for selected
      orderByZ().forEach(p=>{ if(!p.layer||p.hidden) return;
        if(p.name===S.sel){ const b=rigBox(p);
          const hit=document.createElementNS("http://www.w3.org/2000/svg","rect");
          hit.setAttribute("x",D(b.x)); hit.setAttribute("y",D(b.y)); hit.setAttribute("width",D(b.w)); hit.setAttribute("height",D(b.h));
          hit.setAttribute("class","rig-hit"); hit.setAttribute("stroke","#d44f86"); hit.setAttribute("stroke-dasharray","4 3"); ov.appendChild(hit);
          const pv=document.createElementNS("http://www.w3.org/2000/svg","circle");
          pv.setAttribute("cx",D(b.x+p.pivot[0]*b.w)); pv.setAttribute("cy",D(b.y+p.pivot[1]*b.h)); pv.setAttribute("r",7); pv.setAttribute("class","pivot-mark"); pv.id="pivotMark"; ov.appendChild(pv);
        }
      });
    }
  }

  function rigBox(p){ const b=p.bbox; return { x:b.x+p.dx, y:b.y+p.dy, w:b.w*p.scale, h:b.h*p.scale }; }
  function orderByZ(){ return S.order.map(n=>S.parts[n]).slice().sort((a,b)=>a.z-b.z); }

  /* ---------- rig-mode composite render ---------- */
  function drawRig(){
    const c=$("rigCanvas"), x=c.getContext("2d"); x.clearRect(0,0,c.width,c.height);
    orderByZ().forEach(p=>{ if(!p.layer||p.hidden) return; const b=rigBox(p);
      x.save(); x.globalAlpha=p.opacity;
      if(p.mirrored){ x.translate(D(b.x+b.w),D(b.y)); x.scale(-1,1); x.drawImage(p.layer,0,0,D(b.w),D(b.h)); }
      else x.drawImage(p.layer, D(b.x),D(b.y),D(b.w),D(b.h));
      x.restore(); });
    drawOverlay();
  }

  /* ---------- masking: add/move/close polygon ---------- */
  function overlayDown(e){
    const [sx,sy]=toSrc(e);
    if(S.mode==="rig"){ rigDown(e,sx,sy); return; }
    const p=S.parts[S.sel];
    // grab a vertex?
    const vi=p.poly.findIndex(pt=>Math.hypot(pt[0]-sx,pt[1]-sy)<8/S.disp);
    if(vi>=0){ S.dragVtx={part:p,i:vi}; return; }
    // close if clicking near first point
    if(p.poly.length>2 && Math.hypot(p.poly[0][0]-sx,p.poly[0][1]-sy)<10/S.disp){ closePoly(); return; }
    p.poly.push([sx,sy]); p.layer=null; draw();
  }
  function overlayMove(e){
    if(S.dragVtx){ const [sx,sy]=toSrc(e); S.dragVtx.part.poly[S.dragVtx.i]=[sx,sy]; S.dragVtx.part.layer=null; draw(); return; }
    if(S.mode==="rig") rigMove(e);
  }
  function overlayUp(){ if(S.dragVtx){ S.dragVtx=null; } S.dragPivot=false; S.dragLayer=null; }

  function closePoly(){ setStage("polygon closed — Extract this part →"); draw(); }
  function undoPoint(){ const p=S.parts[S.sel]; p.poly.pop(); p.layer=null; draw(); }
  function clearPoly(){ const p=S.parts[S.sel]; p.poly=[]; p.layer=null; p.bbox=null; p.dataURL=null; draw(); buildPartList(); buildGallery(); }

  /* ---------- extraction: keyed source clipped by (dilated) polygon, cropped ---------- */
  function extract(name){
    const p=S.parts[name]; if(!p || p.poly.length<3 || !S.keyed){ return false; }
    // mask canvas at source res: filled polygon + thick round stroke = dilation by `pad`
    const m=document.createElement("canvas"); m.width=S.srcW; m.height=S.srcH; const mx=m.getContext("2d");
    mx.fillStyle="#fff"; mx.strokeStyle="#fff"; mx.lineJoin="round"; mx.lineCap="round"; mx.lineWidth=p.pad*2;
    mx.beginPath(); p.poly.forEach((pt,i)=> i?mx.lineTo(pt[0],pt[1]):mx.moveTo(pt[0],pt[1])); mx.closePath();
    if(p.pad>0) mx.stroke(); mx.fill();
    if(p.pad>0){ mx.filter="blur("+Math.min(2,p.pad/4+0.5)+"px)"; mx.drawImage(m,0,0); mx.filter="none"; } // soft joint edge
    // layer = keyed source kept only inside mask
    const L=document.createElement("canvas"); L.width=S.srcW; L.height=S.srcH; const lx=L.getContext("2d");
    lx.drawImage(S.keyed,0,0); lx.globalCompositeOperation="destination-in"; lx.drawImage(m,0,0);
    // crop to alpha bbox
    const bb=alphaBBox(lx,S.srcW,S.srcH); if(!bb){ return false; }
    const out=document.createElement("canvas"); out.width=bb.w; out.height=bb.h;
    out.getContext("2d").drawImage(L, bb.x,bb.y,bb.w,bb.h, 0,0,bb.w,bb.h);
    p.layer=out; p.bbox={x:bb.x,y:bb.y,w:bb.w,h:bb.h}; p.dataURL=out.toDataURL("image/webp",0.95);
    return true;
  }
  function alphaBBox(ctx,w,h){ const d=ctx.getImageData(0,0,w,h).data; let x0=w,y0=h,x1=0,y1=0,any=false;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){ if(d[(y*w+x)*4+3]>14){ any=true; if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; } }
    return any?{x:x0,y:y0,w:x1-x0+1,h:y1-y0+1}:null; }

  /* ---------- UI builders ---------- */
  function buildPartList(){
    const wrap=$("partList"); wrap.innerHTML="";
    S.order.forEach(n=>{ const p=S.parts[n]; const row=document.createElement("div");
      row.className="part-row"+(S.sel===n?" sel":"")+(p.optional?" optional":"");
      row.innerHTML=`<span class="swatch" style="background:${p.color}"></span><span class="pname">${n}</span>`+
        `<span class="pstate">${p.layer?"✅":(p.poly.length?"✏️":"⬜")}</span><span class="pz">z${p.z}</span>`;
      row.addEventListener("click",()=>select(n)); wrap.appendChild(row); });
  }
  function buildGallery(){
    const g=$("previewGallery"); g.innerHTML="";
    S.order.forEach(n=>{ const p=S.parts[n]; if(!p.dataURL) return;
      const cell=document.createElement("div"); cell.className="gcell";
      cell.innerHTML=`<img src="${p.dataURL}" alt="${n}"><div class="glabel">${n}.webp</div><div class="gdl">download</div>`;
      cell.querySelector(".gdl").addEventListener("click",()=>downloadDataURL(p.dataURL, n+".webp"));
      g.appendChild(cell); });
  }
  function select(n){ S.sel=n; const p=S.parts[n];
    $("selName").textContent=n; $("padInput").value=p.pad; $("padVal").textContent=p.pad+"px";
    $("scaleInput").value=Math.round(p.scale*100); $("scaleVal").textContent=p.scale.toFixed(2)+"×";
    $("opacityInput").value=Math.round(p.opacity*100); $("opacityVal").textContent=Math.round(p.opacity*100)+"%";
    $("zInput").value=p.z; $("hiddenInput").checked=p.hidden; $("mirrorInput").checked=p.mirrored;
    $("pivotVal").textContent=p.pivot[0].toFixed(2)+", "+p.pivot[1].toFixed(2);
    buildPartList(); (S.mode==="rig"?drawRig:draw)();
  }
  function setStage(t){ $("stageStatus").textContent=t; }

  /* ---------- rig-mode dragging (layer move + pivot) ---------- */
  function rigDown(e,sx,sy){ const p=S.parts[S.sel]; if(!p||!p.layer) return; const b=rigBox(p);
    const pvx=b.x+p.pivot[0]*b.w, pvy=b.y+p.pivot[1]*b.h;
    if(Math.hypot(sx-pvx,sy-pvy)<10/S.disp){ S.dragPivot=true; return; }
    if(sx>=b.x&&sx<=b.x+b.w&&sy>=b.y&&sy<=b.y+b.h){ S.dragLayer={sx,sy,dx0:p.dx,dy0:p.dy}; } }
  function rigMove(e){ const p=S.parts[S.sel]; if(!p) return; const [sx,sy]=toSrc(e); const b=rigBox(p);
    if(S.dragPivot){ p.pivot=[clamp((sx-b.x)/b.w),clamp((sy-b.y)/b.h)]; $("pivotVal").textContent=p.pivot[0].toFixed(2)+", "+p.pivot[1].toFixed(2); drawRig(); }
    else if(S.dragLayer){ p.dx=Math.round(S.dragLayer.dx0+(sx-S.dragLayer.sx)); p.dy=Math.round(S.dragLayer.dy0+(sy-S.dragLayer.sy)); drawRig(); } }
  function clamp(v){ return v<0?0:v>1?1:v; }

  /* ---------- mode switch ---------- */
  function setMode(m){ S.mode=m;
    $("modeMask").classList.toggle("active",m==="mask"); $("modeRig").classList.toggle("active",m==="rig");
    $("srcCanvas").style.display = m==="mask"?"block":"none";
    $("rigCanvas").style.display = m==="rig"?"block":"none";
    $("modeHint").textContent = m==="mask"
      ? "Mask mode: pick a part, click on the image to drop polygon points, close with Enter or double-click. Drag points to adjust."
      : "Rig mode: drag a layer to position it over the reference; drag the pink dot to set its rotation pivot. Adjust scale / z / opacity at right.";
    if(m==="rig") drawRig(); else draw();
  }

  /* ---------- export ---------- */
  function downloadDataURL(url,name){ const a=document.createElement("a"); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); }
  function exportLayers(){ const made=S.order.filter(n=>S.parts[n].dataURL);
    if(!made.length){ alert("Extract some parts first."); return; }
    let i=0; (function next(){ if(i>=made.length) return; const n=made[i++]; downloadDataURL(S.parts[n].dataURL,n+".webp"); setTimeout(next,400); })();
    setStage(`downloading ${made.length} WebP layers — save them into assets/front/`);
  }
  function buildRigJSON(){
    const layers=S.order.map(n=>S.parts[n]).filter(p=>p.bbox).sort((a,b)=>a.z-b.z).map(p=>{
      const o={ name:p.name, src:"assets/front/"+p.name+".webp", z:p.z,
        x:Math.round(p.bbox.x+p.dx), y:Math.round(p.bbox.y+p.dy),
        w:Math.round(p.bbox.w*p.scale), h:Math.round(p.bbox.h*p.scale),
        pivot:[+p.pivot[0].toFixed(3),+p.pivot[1].toFixed(3)] };
      if(p.parent) o.parent=p.parent; if(p.opacity<1) o.opacity=+p.opacity.toFixed(2); if(p.mirrored) o.mirrored=true;
      return o; });
    return { name:"front", canvas:[S.srcW,S.srcH],
      comment:"Generated by cutout-tool.js from a single full-body source. Hand-masked transparent layers; no auto-trace, no vector redraw.",
      layers };
  }
  function exportRig(){ if(!S.order.some(n=>S.parts[n].bbox)){ alert("Extract some parts first."); return; }
    const blob=new Blob([JSON.stringify(buildRigJSON(),null,2)],{type:"application/json"});
    downloadDataURL(URL.createObjectURL(blob),"front-rig.json"); setStage("front-rig.json downloaded — drop into manifests/"); }

  /* ---------- save / load project (localStorage + file) ---------- */
  function serialize(){ const parts={};
    S.order.forEach(n=>{ const p=S.parts[n]; parts[n]={ poly:p.poly, pad:p.pad, pivot:p.pivot, scale:p.scale,
      opacity:p.opacity, dx:p.dx, dy:p.dy, z:p.z, hidden:p.hidden, mirrored:p.mirrored, dataURL:p.dataURL,
      bbox:p.bbox }; });
    return { v:1, srcName:S.srcName, srcW:S.srcW, srcH:S.srcH, keyHigh:S.keyHigh, keyLow:S.keyLow,
      srcImage: S.img? S.img.src : null, parts }; }
  function applyProject(j){
    if(!j||!j.parts) return false;
    S.keyHigh=j.keyHigh||70; S.keyLow=j.keyLow||20; $("keyHigh").value=S.keyHigh; $("keyLow").value=S.keyLow;
    S.order.forEach(n=>{ const sp=j.parts[n]; if(!sp) return; const p=S.parts[n];
      Object.assign(p,{ poly:sp.poly||[], pad:sp.pad??8, pivot:sp.pivot||[0.5,0.5], scale:sp.scale??1,
        opacity:sp.opacity??1, dx:sp.dx||0, dy:sp.dy||0, z:sp.z??p.z, hidden:!!sp.hidden, mirrored:!!sp.mirrored,
        bbox:sp.bbox||null, dataURL:sp.dataURL||null, layer:null });
      if(p.dataURL){ const im=new Image(); im.onload=()=>{ p.layer=im; if(S.mode==="rig")drawRig(); }; im.src=p.dataURL; }
    });
    const finish=()=>{ buildPartList(); buildGallery(); select(S.sel); };
    if(j.srcImage){ loadImage(j.srcImage, j.srcName); setTimeout(finish,200); } else finish();
    return true;
  }
  function saveProject(){ try{ localStorage.setItem(KEY, JSON.stringify(serialize())); }catch(e){ /* may exceed quota with big images */ }
    const blob=new Blob([JSON.stringify(serialize(),null,2)],{type:"application/json"});
    downloadDataURL(URL.createObjectURL(blob),"hammy-front-cutout-project.json");
    setStage("project saved (local + downloaded JSON)"); }
  function loadProjectFromLocal(){ try{ const j=JSON.parse(localStorage.getItem(KEY)||"null"); if(j) return applyProject(j); }catch(e){} return false; }

  /* ---------- test idle (preview the rig moving, no export needed) ---------- */
  let idleRAF=0, idleOn=false;
  function testIdle(){ idleOn=!idleOn; $("testIdleBtn").textContent=idleOn?"⏸ Stop":"▶ Test idle";
    if(!idleOn){ cancelAnimationFrame(idleRAF); resetTransforms(); drawRig(); return; }
    setMode("rig"); const t0=performance.now();
    function loop(t){ if(!idleOn) return; const e=(t-t0)/1000;
      const set=(n,fn)=>{ const p=S.parts[n]; if(p&&p.bbox) fn(p); };
      set("body", p=> p._sy=1+0.02*Math.sin(e*1.9));
      set("head", p=> p._rot=2*Math.sin(e*1.3));
      set("ear-left", p=> p._rot=8*Math.sin(e*2.1));
      set("ear-right",p=> p._rot=-7*Math.sin(e*2.5+1));
      const blink=(e%3.4)>3.25;  // quick eye squash
      set("eyes", p=> p._sy=blink?0.1:1);
      drawRigAnimated(); idleRAF=requestAnimationFrame(loop); }
    idleRAF=requestAnimationFrame(loop);
  }
  function resetTransforms(){ S.order.forEach(n=>{ const p=S.parts[n]; p._rot=0; p._sy=1; }); }
  function drawRigAnimated(){
    const c=$("rigCanvas"), x=c.getContext("2d"); x.clearRect(0,0,c.width,c.height);
    orderByZ().forEach(p=>{ if(!p.layer||p.hidden) return; const b=rigBox(p);
      const px=D(b.x+p.pivot[0]*b.w), py=D(b.y+p.pivot[1]*b.h);
      x.save(); x.globalAlpha=p.opacity; x.translate(px,py);
      if(p._rot) x.rotate(p._rot*Math.PI/180); if(p._sy&&p._sy!==1) x.scale(1,p._sy);
      x.translate(-px,-py);
      x.drawImage(p.layer, D(b.x),D(b.y),D(b.w),D(b.h)); x.restore(); });
  }

  /* ---------- wiring ---------- */
  function wire(){
    $("srcFile").addEventListener("change",e=>{ const f=e.target.files[0]; if(!f)return; const r=new FileReader();
      r.onload=()=>loadImage(r.result, f.name.replace(/\.[^.]+$/,"")+".png"); r.readAsDataURL(f); });
    $("loadDefaultBtn").addEventListener("click",()=>loadImage("assets/source/front-rig-source.png","front-rig-source.png"));
    $("modeMask").addEventListener("click",()=>setMode("mask"));
    $("modeRig").addEventListener("click",()=>setMode("rig"));
    $("closePolyBtn").addEventListener("click",closePoly);
    $("undoPtBtn").addEventListener("click",undoPoint);
    $("clearPolyBtn").addEventListener("click",clearPoly);
    $("extractBtn").addEventListener("click",()=>{ if(extract(S.sel)){ setStage(S.sel+" extracted"); buildPartList(); buildGallery(); } else setStage("draw a closed 3+ point mask first"); });
    $("extractAllBtn").addEventListener("click",()=>{ let k=0; S.order.forEach(n=>{ if(S.parts[n].poly.length>=3 && extract(n)) k++; }); setStage(k+" parts extracted"); buildPartList(); buildGallery(); });
    $("padInput").addEventListener("input",e=>{ const p=S.parts[S.sel]; p.pad=+e.target.value; $("padVal").textContent=p.pad+"px"; if(p.poly.length>=3) extract(S.sel); buildGallery(); (S.mode==="rig"?drawRig:draw)(); });
    $("scaleInput").addEventListener("input",e=>{ S.parts[S.sel].scale=e.target.value/100; $("scaleVal").textContent=(e.target.value/100).toFixed(2)+"×"; if(S.mode==="rig")drawRig(); });
    $("opacityInput").addEventListener("input",e=>{ S.parts[S.sel].opacity=e.target.value/100; $("opacityVal").textContent=e.target.value+"%"; if(S.mode==="rig")drawRig(); });
    $("zInput").addEventListener("input",e=>{ S.parts[S.sel].z=parseInt(e.target.value,10)||0; buildPartList(); if(S.mode==="rig")drawRig(); });
    $("hiddenInput").addEventListener("change",e=>{ S.parts[S.sel].hidden=e.target.checked; if(S.mode==="rig")drawRig(); });
    $("mirrorInput").addEventListener("change",e=>{ S.parts[S.sel].mirrored=e.target.checked; if(S.mode==="rig")drawRig(); });
    $("keyHigh").addEventListener("input",e=>{ S.keyHigh=+e.target.value; });
    $("keyLow").addEventListener("input",e=>{ S.keyLow=+e.target.value; });
    $("rekeyBtn").addEventListener("click",()=>{ keyBackground(); draw(); setStage("background re-keyed"); });
    $("exportLayersBtn").addEventListener("click",exportLayers);
    $("exportRigBtn").addEventListener("click",exportRig);
    $("saveProjBtn").addEventListener("click",saveProject);
    $("loadProjFile").addEventListener("change",e=>{ const f=e.target.files[0]; if(!f)return; const r=new FileReader();
      r.onload=()=>{ try{ applyProject(JSON.parse(r.result)); setStage("project loaded"); }catch(err){ alert("bad project file"); } }; r.readAsText(f); });
    $("testIdleBtn").addEventListener("click",testIdle);
    const ov=$("overlay");
    ov.addEventListener("pointerdown",e=>{ ov.setPointerCapture(e.pointerId); overlayDown(e); });
    ov.addEventListener("pointermove",overlayMove);
    ov.addEventListener("pointerup",overlayUp);
    ov.addEventListener("dblclick",()=>{ if(S.mode==="mask") closePoly(); });
    document.addEventListener("keydown",e=>{ if(e.target.tagName==="INPUT")return;
      if(e.key==="Enter"&&S.mode==="mask"){ e.preventDefault(); closePoly(); }
      else if(e.key==="Backspace"&&S.mode==="mask"){ e.preventDefault(); undoPoint(); } });
    window.addEventListener("resize",()=>{ if(S.img){ layoutStage(); (S.mode==="rig"?drawRig:draw)(); } });
  }

  function init(){ wire(); buildPartList(); select("body"); drawChecker();
    if(!loadProjectFromLocal()){ /* try the default source if present */ loadImage("assets/source/front-rig-source.png","front-rig-source.png"); } }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init); else init();

  // test/automation API
  window.CutoutTool = { S, loadImage, keyBackground, extract, buildRigJSON, setMode, select,
    setPoly:(n,pts)=>{ S.parts[n].poly=pts; S.parts[n].layer=null; }, draw, drawRig };
})();
