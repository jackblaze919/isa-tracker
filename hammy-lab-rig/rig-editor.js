/* ============================================================
   Hammy rig EDITOR (LAB ONLY) — drag layers, set rotation pivot, scale,
   z-order, toggle visibility, preview mirroring, export the rig JSON.
   Never shipped to production. Operates on whichever rig is active.
   ============================================================ */
(function(){
  "use strict";
  let on=false, rigName="front", sel=null;
  const panel = document.getElementById("editorPanel");
  const stage = document.getElementById("stage");
  const toggleBtn = document.getElementById("editorToggle");
  if(!panel || !toggleBtn) return;

  function rig(){ return window.RigLab.rigs()[rigName]; }
  function cancelAllAnims(){ const r=rig(); if(!r) return; r.layers.forEach(L=>{ L.anims.forEach(a=>{try{a.cancel();}catch(e){}}); L.anims=[]; L.inner.style.transform="none"; }); }

  function applyLayer(L){
    L.outer.style.left=L.def.x+"px"; L.outer.style.top=L.def.y+"px";
    L.outer.style.width=L.def.w+"px"; L.outer.style.height=L.def.h+"px"; L.outer.style.zIndex=L.def.z;
    L.outer.style.opacity = L.def.opacity!=null?L.def.opacity:1;
    L.outer.style.display = L.def.__hidden?"none":"block";
    L.mir.style.transform = L.def.mirrored?"scaleX(-1)":"none";
    L.inner.style.transformOrigin=`${(L.def.pivot?L.def.pivot[0]:0.5)*100}% ${(L.def.pivot?L.def.pivot[1]:0.5)*100}%`;
  }

  function buildList(){
    const r=rig(); if(!r) return;
    const list=document.getElementById("layerList"); list.innerHTML="";
    r.def.layers.slice().sort((a,b)=>b.z-a.z).forEach(d=>{
      const L=r.layerMap[d.name];
      const row=document.createElement("div"); row.className="ed-row"+(sel===L?" sel":"");
      row.innerHTML=`<input type="checkbox" ${L.def.__hidden?"":"checked"} title="visible"> <button class="ed-name">${d.name}</button> <span class="ed-z">z${d.z}</span>`;
      row.querySelector("input").addEventListener("change",e=>{ L.def.__hidden=!e.target.checked; applyLayer(L); });
      row.querySelector(".ed-name").addEventListener("click",()=>{ select(L); });
      list.appendChild(row);
    });
  }
  function select(L){ sel=L; buildList(); showPivot(); syncControls(); }

  function showPivot(){
    document.querySelectorAll(".pivot-dot").forEach(d=>d.remove());
    if(!sel) return;
    const dot=document.createElement("div"); dot.className="pivot-dot"; sel.outer.appendChild(dot);
    const px=(sel.def.pivot?sel.def.pivot[0]:0.5), py=(sel.def.pivot?sel.def.pivot[1]:0.5);
    dot.style.left=px*100+"%"; dot.style.top=py*100+"%";
    let drag=false;
    dot.addEventListener("pointerdown",e=>{ drag=true; e.stopPropagation(); dot.setPointerCapture(e.pointerId); });
    dot.addEventListener("pointermove",e=>{ if(!drag) return; const r=sel.outer.getBoundingClientRect();
      const fx=Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)), fy=Math.min(1,Math.max(0,(e.clientY-r.top)/r.height));
      sel.def.pivot=[+fx.toFixed(3),+fy.toFixed(3)]; dot.style.left=fx*100+"%"; dot.style.top=fy*100+"%"; applyLayer(sel); syncControls(); });
    dot.addEventListener("pointerup",()=>{drag=false;});
  }

  function syncControls(){
    if(!sel) return;
    document.getElementById("edScale").value = Math.round((sel.def.__scale||1)*100);
    document.getElementById("edScaleVal").textContent=(sel.def.__scale||1).toFixed(2)+"×";
    document.getElementById("edZ").value=sel.def.z;
    document.getElementById("edMirror").checked=!!sel.def.mirrored;
    document.getElementById("edSel").textContent=sel.name;
  }

  // drag layers in the stage when editing
  function bindStageDrag(){
    const r=rig(); if(!r) return;
    r.layers.forEach(L=>{
      L.outer.style.pointerEvents = on?"auto":"none";
      if(L._edBound) return; L._edBound=true;
      let drag=null;
      L.outer.addEventListener("pointerdown",e=>{ if(!on) return; if(e.target.classList.contains("pivot-dot")) return;
        select(L); drag={sx:e.clientX,sy:e.clientY,x0:L.def.x,y0:L.def.y}; L.outer.setPointerCapture(e.pointerId); e.stopPropagation(); });
      L.outer.addEventListener("pointermove",e=>{ if(!drag) return; L.def.x=Math.round(drag.x0+(e.clientX-drag.sx)); L.def.y=Math.round(drag.y0+(e.clientY-drag.sy)); applyLayer(L); });
      L.outer.addEventListener("pointerup",()=>{ drag=null; });
    });
  }

  function setMode(v){
    on=v; document.body.classList.toggle("editing",on);
    panel.style.display=on?"block":"none";
    toggleBtn.textContent=on?"✕ Close editor":"✎ Rig editor";
    if(on){ cancelAllAnims(); buildList(); bindStageDrag(); select(sel|| rig().layers[0]); }
    else { document.querySelectorAll(".pivot-dot").forEach(d=>d.remove()); rig().layers.forEach(L=>L.outer.style.pointerEvents="none"); window.RigLab.idle(); }
  }

  function exportJSON(){
    const r=rig();
    const out={ name:r.def.name, canvas:r.def.canvas, comment:r.def.comment, layers:r.def.layers.map(d=>{
      const o={ name:d.name, src:d.src, z:d.z, x:d.x, y:d.y, w:Math.round(d.w*(d.__scale||1)), h:Math.round(d.h*(d.__scale||1)), pivot:d.pivot };
      if(d.parent) o.parent=d.parent; if(d.opacity!=null) o.opacity=d.opacity; if(d.mirrored) o.mirrored=true; if(d.variants) o.variants=d.variants;
      return o; }) };
    const blob=new Blob([JSON.stringify(out,null,2)],{type:"application/json"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=rigName+"-rig.json"; a.click(); URL.revokeObjectURL(a.href);
  }

  // wire controls
  toggleBtn.addEventListener("click",()=>setMode(!on));
  document.getElementById("edRig").addEventListener("change",e=>{ rigName=e.target.value; window.RigLab.useRig(rigName); sel=null; if(on){ cancelAllAnims(); buildList(); bindStageDrag(); select(rig().layers[0]); } });
  document.getElementById("edScale").addEventListener("input",e=>{ if(!sel)return; const s=e.target.value/100; sel.def.__scale=s;
    sel.outer.style.width=(sel.def.w*s)+"px"; sel.outer.style.height=(sel.def.h*s)+"px"; document.getElementById("edScaleVal").textContent=s.toFixed(2)+"×"; });
  document.getElementById("edZ").addEventListener("input",e=>{ if(!sel)return; sel.def.z=parseInt(e.target.value,10)||0; sel.outer.style.zIndex=sel.def.z; buildList(); });
  document.getElementById("edMirror").addEventListener("change",e=>{ if(!sel)return; sel.def.mirrored=e.target.checked; applyLayer(sel); });
  document.getElementById("edExport").addEventListener("click",exportJSON);
})();
