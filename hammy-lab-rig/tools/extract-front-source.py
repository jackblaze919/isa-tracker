#!/usr/bin/env python3
"""
extract-front-source.py — hand-authored masks for THIS approved front source
(assets/source/front-rig-source.png). Same pipeline as cutout-tool.html: chroma-key
#0057FF, polygon mask per part, dilate by joint-overlap pad, feather, clip to fur,
crop. Emits transparent WebP layers (assets/front/), front-rig.json (scaled to the
lab canvas), a Cutout-Studio project for visual refining, and review composites.
Never auto-traces, never redraws, never vectorizes — it only cuts the supplied art.
"""
import os, json, base64
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE)
SRC=os.path.join(ROOT,"assets","source","front-rig-source.png")
OUT=os.path.join(ROOT,"assets","front"); REVIEW=os.path.join(ROOT,"review")
os.makedirs(OUT,exist_ok=True); os.makedirs(REVIEW,exist_ok=True)
KEY_HIGH,KEY_LOW=70,20
LAB_TARGET_H=300.0   # character display height in the lab stage

# part: polygon (full-res src coords), pad px, pivot frac, z, parent
PARTS=[
 ("tail",      [(910,878),(1010,884),(1008,954),(910,950)],                                            18,[0.15,0.5], 10,"body"),
 ("body",      [(392,452),(860,452),(888,560),(884,690),(852,800),(908,930),(950,1004),(900,1092),(702,1144),(543,1144),(346,1092),(300,1004),(312,930),(372,800),(322,690),(356,560)], 8,[0.5,0.96],20,None),
 ("foot-left", [(338,1050),(552,1050),(552,1182),(326,1182)],                                          24,[0.5,0.12], 25,"body"),
 ("foot-right",[(688,1050),(922,1050),(922,1182),(688,1182)],                                          24,[0.5,0.12], 25,"body"),
 ("arm-left",  [(300,628),(420,640),(410,760),(362,858),(266,888),(200,838),(218,708),(252,658)],      26,[0.74,0.12],30,"body"),
 ("arm-right", [(956,628),(836,640),(846,760),(894,858),(990,888),(1056,838),(1038,708),(1004,658)],   26,[0.26,0.12],30,"body"),
 ("ear-left",  [(322,258),(322,92),(356,54),(432,50),(506,108),(518,210),(472,260)],                   28,[0.62,0.86],35,"head"),
 ("ear-right", [(796,258),(786,148),(812,76),(886,56),(952,98),(966,212),(934,260)],                   28,[0.38,0.86],35,"head"),
 ("head",      [(348,134),(545,106),(715,106),(908,144),(958,285),(958,430),(912,548),(815,568),(640,574),(465,568),(348,548),(300,430),(298,285)], 18,[0.5,0.95],40,None),
]
EYES=[(528,380,68,72),(752,382,68,72)]  # cx,cy,rx,ry
# eyelids wipe down over the REAL eyes (kept in the head) to blink — no fabricated eye patch.
LIDS=[("lid-left",528,380,68,72),("lid-right",752,382,68,72)]
HEAD_FEATHER_TOP=470   # below this y the head's alpha ramps down so its bottom blends into body

def keyed_rgba(img):
    a=np.asarray(img.convert("RGB")).astype(np.float32)
    R,G,B=a[...,0],a[...,1],a[...,2]; excess=B-np.maximum(R,G)
    alpha=np.clip((KEY_HIGH-excess)/(KEY_HIGH-KEY_LOW),0,1)
    spill=(excess>0)&(alpha<0.95); B2=np.where(spill,np.minimum(B,np.maximum(R,G)+12),B)
    return np.dstack([R,G,B2,alpha*255]).astype(np.uint8)

def poly_mask(poly,pad,W,H):
    m=Image.new("L",(W,H),0); d=ImageDraw.Draw(m); d.polygon(poly,fill=255)
    if pad>0:
        d.line(poly+[poly[0]],fill=255,width=pad*2,joint="curve")
        m=m.filter(ImageFilter.MaxFilter(2*max(1,pad//6)+1))
        m=m.filter(ImageFilter.GaussianBlur(min(2.0,pad/5+0.4)))
    return m

def ellipse_mask(W,H,pad):
    # eyes layer is drawn 1.3x larger than the eyeball so, when open, it fully covers the
    # clean-plate fill below (seamless — it's the same source pixels); a blink squashes it away.
    m=Image.new("L",(W,H),0); d=ImageDraw.Draw(m)
    for cx,cy,rx,ry in EYES:
        RX,RY=rx*1.3+pad, ry*1.3+pad
        d.ellipse([cx-RX,cy-RY,cx+RX,cy+RY],fill=255)
    return m.filter(ImageFilter.GaussianBlur(1.2))

def clean_plate_eyes(rgba):
    """Build a 'clean plate' under the eyes so a blink reads as smooth fur, not a flat disc:
    fill each eye region with a VERTICAL fur gradient sampled from the fur just above and just
    below the eye (matching the face's top->bottom shading), then blur to blend."""
    px=np.asarray(Image.fromarray(rgba,"RGBA")).astype(np.uint8).copy()
    H,W=px.shape[:2]; ys,xs=np.ogrid[:H,:W]
    def band(y0,y1,cx,rx):
        x0,x1=int(cx-rx),int(cx+rx); y0=max(0,int(y0)); y1=min(H,int(y1))
        reg=px[y0:y1,x0:x1]; m=reg[...,3]>200
        return np.median(reg[m][:, :3],axis=0) if m.sum()>10 else None
    for cx,cy,rx,ry in EYES:
        top=band(cy-ry*1.9,cy-ry*1.25,cx,rx*0.8)     # tan fur just above the eye (below brow)
        bot=band(cy+ry*1.25,cy+ry*1.9,cx,rx*0.8)     # fur just below the eye
        if top is None or bot is None: continue
        d=((xs-cx)/(rx*1.18))**2+((ys-cy)/(ry*1.18))**2; m=d<=1.0
        t=np.clip((ys-(cy-ry))/ (2*ry),0,1)          # 0 at eye-top -> 1 at eye-bottom
        for ch in range(3):
            grad=(top[ch]*(1-t)+bot[ch]*t)
            px[...,ch]=np.where(m, grad.astype(np.uint8), px[...,ch])
        px[...,3]=np.where(m,255,px[...,3])
    out=Image.fromarray(px,"RGBA"); blur=out.filter(ImageFilter.GaussianBlur(5))
    base=np.asarray(out).copy(); bl=np.asarray(blur)
    for cx,cy,rx,ry in EYES:
        d=((xs-cx)/(rx*1.25))**2+((ys-cy)/(ry*1.25))**2; m=d<=1.0
        base[m]=bl[m]
    return base

def make_eyelid(kr,cx,cy,rx,ry):
    """An eye-shaped eyelid built from REAL cheek fur (matching texture/tone), that wipes
    down over the real eye to blink (transform-origin top, scaleY 0->1). Returns (RGBA, x, y).
    No synthetic gradient and no fabricated eye patch."""
    H,W=kr.shape[:2]
    side=-1 if cx<638 else 1
    scx=int(cx+side*rx*1.45)                                  # clean cheek fur, same tone (kept inside the face)
    sx0=int(scx-rx*0.7); sx1=int(scx+rx*0.7); sy0=int(cy-ry); sy1=int(cy+ry)
    LW=int(rx*2*1.14); LH=int(ry*2*1.04)
    reg=kr[sy0:sy1,sx0:sx1].astype(np.float32)
    furm=reg[...,3]>200
    fur=(np.median(reg[furm][:, :3],axis=0) if furm.sum()>20 else np.array([222,182,120])).astype(np.float32)
    rgb=reg[..., :3].copy(); rgb[reg[...,3]<=200]=fur          # kill any background/edge blue bleed
    patch=Image.fromarray(rgb.astype(np.uint8),"RGB").resize((LW,LH))
    pa=np.asarray(patch).astype(np.float32)
    tyv=np.linspace(0,1,LH).reshape(-1,1,1)
    pa=pa*(1-0.16*tyv)                                        # slightly shaded toward the fold
    yy,xx=np.mgrid[0:LH,0:LW].astype(np.float32)
    nx=(xx-LW/2)/(LW/2*0.99); ny=(yy-LH/2)/(LH/2*0.99)
    a=np.clip((1.0-(nx*nx+ny*ny))/0.32,0,1)                  # soft eye-shaped ellipse (blends into face)
    # faint, soft, slightly-curved lash crease near the lower rim
    crease=np.exp(-((ny-0.42)**2)/0.010)*(np.abs(nx)<0.85)
    for ch in range(3): pa[...,ch]=pa[...,ch]*(1-0.30*crease)
    out=np.dstack([pa, a*255]).astype(np.uint8)
    lid=Image.fromarray(out,"RGBA").filter(ImageFilter.GaussianBlur(1.0))
    return lid,int(cx-LW/2),int(cy-ry*1.0)

def alpha_bbox(arr):
    a=arr[...,3]; ys,xs=np.where(a>14)
    if not len(xs): return None
    return int(xs.min()),int(ys.min()),int(xs.max()-xs.min()+1),int(ys.max()-ys.min()+1)

def main():
    img=Image.open(SRC); W,H=img.size; print("source",W,H)
    kr=keyed_rgba(img)                       # HxWx4
    keyedA=kr[...,3]
    k=LAB_TARGET_H/float(np.ptp(np.where(keyedA.any(axis=1))[0]))
    print("lab scale k=%.4f -> canvas %dx%d"%(k,round(W*k),round(H*k)))
    proj_parts={}; rig_layers=[]; contact=[]
    H0=H
    def add_layer(name,crop,x,y,pivot,z,parent,opt=False,poly=None,pad=0):
        crop.save(os.path.join(OUT,name+".webp"),"WEBP",quality=95,method=6)
        contact.append((name,crop)); w,h=crop.size
        L={"name":name,"src":"assets/front/"+name+".webp","z":z,
           "x":round(x*k),"y":round(y*k),"w":round(w*k),"h":round(h*k),
           "pivot":[round(pivot[0],3),round(pivot[1],3)]}
        if parent: L["parent"]=parent
        if opt: L["optional"]=True
        rig_layers.append(L)
        buf=os.path.join(REVIEW,"_tmp.webp"); crop.save(buf,"WEBP",quality=92)
        with open(buf,"rb") as f: durl="data:image/webp;base64,"+base64.b64encode(f.read()).decode()
        proj_parts[name]={"poly":[[a,b] for a,b in (poly or [])],"pad":pad,"pivot":pivot,"scale":1,
            "opacity":1,"dx":0,"dy":0,"z":z,"hidden":False,"mirrored":False,
            "bbox":{"x":x,"y":y,"w":w,"h":h},"dataURL":durl}
        print("  %-10s %4dx%-4d  lab(%d,%d %dx%d)"%(name,w,h,L["x"],L["y"],L["w"],L["h"]))
    for name,poly,pad,pivot,z,parent in PARTS:
        mask=poly_mask(poly,pad,W,H)
        ma=np.asarray(mask).astype(np.float32)/255.0
        layer=kr.copy().astype(np.float32)
        layer[...,3]=layer[...,3]*ma
        if name=="head":
            # feather the head's lower edge so it blends into the body (no hard neck seam)
            yy=np.arange(H).reshape(-1,1).astype(np.float32)
            ramp=np.clip(1.0-(yy-HEAD_FEATHER_TOP)/(H*1.0),0,1)   # placeholder, refined next line
            bottom=alpha_bbox(layer.astype(np.uint8))
            if bottom:
                by=bottom[1]+bottom[3]
                ramp=np.clip((by-yy)/float(by-HEAD_FEATHER_TOP+1),0.0,1.0)  # 1 above feather-top -> 0 at head bottom
                ramp=0.30+0.70*ramp                                          # keep >=30% so jowls don't vanish
                layer[...,3]=layer[...,3]*ramp
        layer=layer.astype(np.uint8)
        bb=alpha_bbox(layer)
        if not bb: print("  !! empty",name); continue
        x,y,w,h=bb
        crop=Image.fromarray(layer[y:y+h,x:x+w],"RGBA")
        add_layer(name,crop,x,y,pivot,z,parent,poly=poly,pad=pad)
    # ---- eyelids (blink) : fur-colored lids that wipe down over the real eyes ----
    for name,cx,cy,rx,ry in LIDS:
        lid,lx,ly=make_eyelid(kr,cx,cy,rx,ry)
        add_layer(name,lid,lx,ly,[0.5,0.0],44,"head",opt=True)
    os.remove(os.path.join(REVIEW,"_tmp.webp"))
    rig={"name":"front","canvas":[round(W*k),round(H*k)],
         "comment":"Generated by tools/extract-front-source.py from the approved single full-body source. Hand-masked transparent layers (chroma-key + polygon + joint padding); no auto-trace, no vector redraw. Coords scaled to the lab stage; WebP are full resolution.",
         "layers":sorted(rig_layers,key=lambda l:l["z"])}
    json.dump(rig,open(os.path.join(ROOT,"manifests","front-rig.json"),"w"),indent=2)
    # studio project
    with open(os.path.join(SRC),"rb") as f: src_durl="data:image/png;base64,"+base64.b64encode(f.read()).decode()
    proj={"v":1,"srcName":"front-rig-source.png","srcW":W,"srcH":H,"keyHigh":KEY_HIGH,"keyLow":KEY_LOW,
          "srcImage":src_durl,"parts":proj_parts}
    json.dump(proj,open(os.path.join(REVIEW,"front-cutout-project.json"),"w"))
    # composite (verify no gaps) + contact sheet
    comp=Image.new("RGBA",(W,H),(20,20,30,0))
    for L in sorted(rig_layers,key=lambda l:l["z"]):
        nm=L["name"]; im=Image.open(os.path.join(OUT,nm+".webp")).convert("RGBA")
        comp.alpha_composite(im,( [p for p in proj_parts[nm]["bbox"].values()][0], [p for p in proj_parts[nm]["bbox"].values()][1] ))
    bg=Image.new("RGBA",(W,H),(255,240,247,255)); bg.alpha_composite(comp); bg.convert("RGB").save(os.path.join(REVIEW,"front-composite.png"))
    cell=230; cols=5; rows=(len(contact)+cols-1)//cols
    cs=Image.new("RGBA",(cols*cell,rows*cell+24),(255,255,255,255)); dd=ImageDraw.Draw(cs)
    for gy in range(0,cs.height,16):
        for gx in range(0,cs.width,16):
            if (gx//16+gy//16)%2: dd.rectangle([gx,gy,gx+16,gy+16],fill=(236,224,232,255))
    for i,(nm,im) in enumerate(contact):
        t=im.copy(); t.thumbnail((cell-24,cell-40)); cs.alpha_composite(t,((i%cols)*cell+(cell-t.width)//2,(i//cols)*cell+6))
        dd.text(((i%cols)*cell+5,(i//cols)*cell+cell-16),nm,fill=(90,40,60,255))
    cs.convert("RGB").save(os.path.join(REVIEW,"front-contact.png"))
    print("wrote manifests/front-rig.json, review/front-composite.png, review/front-contact.png, review/front-cutout-project.json")

if __name__=="__main__": main()
