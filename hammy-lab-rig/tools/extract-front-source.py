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
 ("tail",      [(940,888),(998,900),(995,942),(940,930)],                                              14,[0.15,0.5], 10,"body"),
 ("body",      [(370,430),(884,430),(940,560),(950,820),(905,1080),(700,1135),(545,1135),(345,1080),(305,820),(318,560)], 4,[0.5,0.96],20,None),
 ("foot-left", [(345,1055),(548,1055),(548,1178),(330,1178)],                                          24,[0.5,0.12], 25,"body"),
 ("foot-right",[(692,1055),(918,1055),(918,1178),(692,1178)],                                          24,[0.5,0.12], 25,"body"),
 ("arm-left",  [(298,630),(415,640),(405,760),(360,855),(270,885),(205,840),(220,710),(255,660)],      32,[0.72,0.12],30,"body"),
 ("arm-right", [(956,630),(840,640),(852,760),(896,855),(986,885),(1050,840),(1035,710),(1000,660)],   32,[0.28,0.12],30,"body"),
 ("ear-left",  [(332,250),(330,95),(360,58),(430,52),(500,110),(512,205),(470,255)],                   28,[0.62,0.86],35,"head"),
 ("ear-right", [(800,250),(790,150),(815,80),(885,60),(948,100),(960,210),(930,255)],                  28,[0.38,0.86],35,"head"),
 ("head",      [(372,150),(545,118),(715,118),(892,165),(910,330),(862,470),(640,512),(418,470),(368,330)], 8,[0.5,0.93],40,None),
 ("eyes",      "EYES",                                                                                  3,[0.5,0.5],  42,"head"),
]
EYES=[(528,380,68,72),(752,382,68,72)]  # cx,cy,rx,ry

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
    for name,poly,pad,pivot,z,parent in PARTS:
        if poly=="EYES": mask=ellipse_mask(W,H,pad)
        else: mask=poly_mask(poly,pad,W,H)
        ma=np.asarray(mask).astype(np.float32)/255.0
        layer=kr.copy().astype(np.float32)
        layer[...,3]=layer[...,3]*ma
        if name=="head": layer=clean_plate_eyes(layer.astype(np.uint8)).astype(np.float32)
        layer=layer.astype(np.uint8)
        bb=alpha_bbox(layer)
        if not bb: print("  !! empty",name); continue
        x,y,w,h=bb
        crop=Image.fromarray(layer[y:y+h,x:x+w],"RGBA")
        crop.save(os.path.join(OUT,name+".webp"),"WEBP",quality=95,method=6)
        contact.append((name,crop))
        L={"name":name,"src":"assets/front/"+name+".webp","z":z,
           "x":round(x*k),"y":round(y*k),"w":round(w*k),"h":round(h*k),
           "pivot":[round(pivot[0],3),round(pivot[1],3)]}
        if parent: L["parent"]=parent
        if name=="eyes": L["optional"]=True
        rig_layers.append(L)
        # studio project entry (full-res coords)
        buf=os.path.join(REVIEW,"_tmp.webp"); crop.save(buf,"WEBP",quality=92)
        with open(buf,"rb") as f: durl="data:image/webp;base64,"+base64.b64encode(f.read()).decode()
        proj_parts[name]={"poly":[[a,b] for a,b in (poly if poly!="EYES" else [])],"pad":pad,
            "pivot":pivot,"scale":1,"opacity":1,"dx":0,"dy":0,"z":z,"hidden":False,
            "mirrored":False,"bbox":{"x":x,"y":y,"w":w,"h":h},"dataURL":durl}
        print("  %-10s %4dx%-4d  lab(%d,%d %dx%d)"%(name,w,h,L["x"],L["y"],L["w"],L["h"]))
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
