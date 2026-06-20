import json, math
# Parametric cute hamster -> distinct SVG <symbol> frames. viewBox 0 0 120 140, ground y=126.
C = dict(body="#d4a574", belly="#f5e6d0", ear="#ffb8c8", paw="#f0cba0", out="#7a5030",
         hi="#f0c99a", nose="#e07a9e", blush="#ff9eb0", dark="#5a3a22")
OUT=C["out"]
def el(cx,cy,rx,ry,fill,sw=2.4,st=None):
    st=st or OUT
    return f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{rx:.1f}" ry="{ry:.1f}" fill="{fill}" stroke="{st}" stroke-width="{sw}"/>'
def path(d,fill="none",sw=2.4,st=None,cap="round"):
    st=st or OUT
    return f'<path d="{d}" fill="{fill}" stroke="{st}" stroke-width="{sw}" stroke-linecap="{cap}" stroke-linejoin="round"/>'

def eyes(kind, sx=0):
    lx,rx,y=46+sx,74+sx,66
    if kind=="closed":
        return path(f"M{lx-6} {y} Q{lx} {y+5} {lx+6} {y}",sw=2.6)+path(f"M{rx-6} {y} Q{rx} {y+5} {rx+6} {y}",sw=2.6)
    if kind=="happy":  # upward arcs ^_^
        return path(f"M{lx-6} {y+2} Q{lx} {y-5} {lx+6} {y+2}",sw=2.6)+path(f"M{rx-6} {y+2} Q{rx} {y-5} {rx+6} {y+2}",sw=2.6)
    if kind=="dizzy":  # spiral-ish swirls
        sw=2.2
        def sp(cx):
            return path(f"M{cx} {y} m-5,0 a5,5 0 1,1 5,5 a3,3 0 1,1 -3,-3",sw=sw)
        return sp(lx)+sp(rx)
    r=6.5 if kind!="wide" else 7.5
    def e(cx):
        return el(cx,y,r,r,C["dark"],sw=0,st=C["dark"])+f'<circle cx="{cx-2}" cy="{y-2}" r="2" fill="#fff"/>'
    if kind=="half":
        return (el(lx,y+1,6,3.2,C["dark"],sw=0)+el(rx,y+1,6,3.2,C["dark"],sw=0)+
                f'<circle cx="{lx-2}" cy="{y-1}" r="1.5" fill="#fff"/><circle cx="{rx-2}" cy="{y-1}" r="1.5" fill="#fff"/>')
    return e(lx)+e(rx)

def mouth(kind, sx=0):
    x,y=60+sx,80
    if kind=="smile": return path(f"M{x-7} {y} Q{x} {y+7} {x+7} {y}",sw=2.4)
    if kind=="open":  return f'<ellipse cx="{x}" cy="{y+3}" rx="5" ry="6" fill="#b86a78" stroke="{OUT}" stroke-width="2"/><ellipse cx="{x}" cy="{y+5}" rx="3" ry="3" fill="#ff8fa3"/>'
    if kind=="frown": return path(f"M{x-7} {y+5} Q{x} {y-2} {x+7} {y+5}",sw=2.6)
    if kind=="flat":  return path(f"M{x-6} {y+2} L{x+6} {y+2}",sw=2.6)
    return path(f"M{x} {y-1} Q{x-5} {y+4} {x-8} {y+1} M{x} {y-1} Q{x+5} {y+4} {x+8} {y+1}",sw=2.2)

def ear(cx,cy,rot):
    return (f'<g transform="rotate({rot} {cx} {cy})">'+el(cx,cy,11,13,C["body"])+el(cx,cy+1,5.5,7,C["ear"],sw=0)+'</g>')

def drawHammy(o):
    dy=o.get("dy",0); sq=o.get("squash",1.0); rot=o.get("rot",0)
    sx=o.get("faceX",0)
    bcx,bcy=60,78+dy; brx,bry=42,44*sq
    parts=[]
    # tail
    parts.append(path(f"M{bcx-40} {bcy+6} q-9,-2 -9,-9 q0,-5 5,-4 q5,1 5,8",fill=C["body"],sw=2))
    # feet
    fl=o.get("footL",(46,122)); fr=o.get("footR",(74,122))
    parts.append(el(fl[0],fl[1]+dy*0.3,10,7,C["paw"]))
    parts.append(el(fr[0],fr[1]+dy*0.3,10,7,C["paw"]))
    # ears
    parts.append(ear(38,40+dy,o.get("earL",-8)))
    parts.append(ear(82,40+dy,o.get("earR",8)))
    # body
    parts.append(el(bcx,bcy,brx,bry,C["body"]))
    parts.append(el(bcx,bcy+10,brx-14,bry-14,C["belly"],sw=0))
    # cheeks / blush
    bl=o.get("blush",0)
    chr_=11 if o.get("puff") else 8
    if bl>0:
        parts.append(f'<circle cx="{36+sx}" cy="{82}" r="{chr_}" fill="{C["blush"]}" opacity="{bl:.2f}"/>')
        parts.append(f'<circle cx="{84+sx}" cy="{82}" r="{chr_}" fill="{C["blush"]}" opacity="{bl:.2f}"/>')
    elif o.get("puff"):
        parts.append(el(34+sx,82,chr_,chr_,C["hi"],sw=0))
        parts.append(el(86+sx,82,chr_,chr_,C["hi"],sw=0))
    # face
    parts.append(eyes(o.get("eye","open"),sx))
    parts.append(el(60+sx,77,4.5,3.5,C["nose"],sw=1.6))
    parts.append(mouth(o.get("mouth","neutral"),sx))
    # front paws
    pl=o.get("pawL",(48,104)); pr=o.get("pawR",(72,104))
    parts.append(el(pl[0],pl[1],8,6.5,C["paw"]))
    parts.append(el(pr[0],pr[1],8,6.5,C["paw"]))
    # accents
    for a in o.get("acc",[]):
        if a=="anger": parts.append(f'<g stroke="#e8483f" stroke-width="2.6" stroke-linecap="round" fill="none"><path d="M90 44 l8 -2 M90 44 l7 5 M98 38 l1 8"/></g>')
        if a=="motion": parts.append(f'<g stroke="{OUT}" stroke-width="2" opacity="0.5" stroke-linecap="round"><path d="M12 70 h12 M10 80 h14 M14 90 h10"/></g>')
        if a=="stars": parts.append('<text x="90" y="36" font-size="14">⭐</text><text x="20" y="40" font-size="11">✨</text>')
        if a=="hearts": parts.append('<text x="86" y="34" font-size="14">💗</text>')
        if a=="sweat": parts.append(f'<path d="M92 58 q4,6 0,10 q-4,-4 0,-10" fill="#a9d8f0" stroke="{OUT}" stroke-width="1"/>')
    inner="".join(parts)
    if rot:
        inner=f'<g transform="rotate({rot} 60 122)">{inner}</g>'
    return inner

frames={}
def F(name,o): frames[name]=drawHammy(o)

# IDLE (4)
F("idle-0",dict())
F("idle-1",dict(dy=-2,squash=1.03,mouth="smile"))
F("idle-2",dict(eye="closed"))
F("idle-3",dict(earR=22,eye="open"))
# WALK (6) — genuine leg cycle + bob + lean
walk_feet=[((40,124),(78,120)),((46,121),(74,123)),((52,124),(70,120)),((58,121),(64,123)),((52,124),(70,120)),((46,122),(74,122))]
for i,(fl,fr) in enumerate(walk_feet):
    F(f"walk-{i}",dict(dy=(-2 if i%2 else 0),rot=3,footL=fl,footR=fr,mouth="smile",eye="open",
                       pawL=(50,102),pawR=(74,106)))
# PET (5)
F("pet-0",dict(eye="wide",faceX=0,dy=-1,mouth="neutral"))
F("pet-1",dict(eye="half",blush=0.5,mouth="smile",dy=1,squash=0.98))
F("pet-2",dict(eye="happy",blush=0.8,mouth="smile",dy=2,squash=0.94,pawL=(50,100),pawR=(70,100)))
F("pet-3",dict(eye="happy",blush=0.9,mouth="smile",dy=2,squash=0.93,acc=["hearts"],pawL=(50,100),pawR=(70,100)))
F("pet-4",dict(eye="half",blush=0.5,mouth="smile",dy=0))
# FALL -> DIZZY -> RECOVER (10)
F("fall-0",dict(eye="wide",mouth="open",rot=-6,dy=-2))
F("fall-1",dict(eye="wide",mouth="open",rot=-26,footL=(42,122),footR=(80,118)))
F("fall-2",dict(eye="closed",mouth="open",rot=-55,footL=(40,118),footR=(82,112)))
F("fall-3",dict(eye="dizzy",mouth="open",rot=-86,footL=(40,108),footR=(84,104),pawL=(50,92),pawR=(72,90),acc=["stars"]))
F("fall-4",dict(eye="dizzy",mouth="flat",rot=-90,footL=(38,106),footR=(86,108),pawL=(48,90),pawR=(74,94),acc=["stars"]))
F("fall-5",dict(eye="dizzy",mouth="flat",rot=-78,footL=(42,110),footR=(82,106),acc=["stars"]))
F("fall-6",dict(eye="dizzy",mouth="flat",rot=-40,footL=(46,120),footR=(74,118),acc=["stars"]))
F("fall-7",dict(eye="half",mouth="flat",rot=-12,acc=["sweat"]))
F("fall-8",dict(eye="half",mouth="neutral",rot=6,acc=["motion"]))
F("fall-9",dict(eye="open",mouth="smile"))
# ANNOYED (5)
F("annoyed-0",dict(eye="half",mouth="flat",faceX=-4))
F("annoyed-1",dict(eye="open",mouth="frown",puff=True,acc=["anger"]))
F("annoyed-2",dict(eye="open",mouth="frown",puff=True,acc=["anger"],footL=(46,116),dy=-2))
F("annoyed-3",dict(eye="open",mouth="frown",puff=True,acc=["anger"],footL=(46,124),dy=0))
F("annoyed-4",dict(eye="half",mouth="flat",faceX=4,acc=["sweat"]))

defs="".join(f'<symbol id="f-{k}" viewBox="0 0 120 140">{v}</symbol>' for k,v in frames.items())
open("/tmp/frames_defs.svg","w").write(defs)

manifest={
 "viewBox":"0 0 120 140","groundY":126,"frameCount":len(frames),
 "animations":{
  "idle":{"frames":["f-idle-0","f-idle-1","f-idle-0","f-idle-2","f-idle-0","f-idle-3"],"fps":4,"loop":True},
  "walk":{"frames":[f"f-walk-{i}" for i in range(6)],"fps":12,"loop":True,"moves":True},
  "pet":{"frames":["f-pet-0","f-pet-1","f-pet-2","f-pet-3","f-pet-2","f-pet-4"],"fps":7,"loop":False,"returnTo":"idle"},
  "fall":{"frames":[f"f-fall-{i}" for i in range(10)],"fps":9,"loop":False,"returnTo":"idle"},
  "annoyed":{"frames":["f-annoyed-0","f-annoyed-1","f-annoyed-2","f-annoyed-3","f-annoyed-1","f-annoyed-4"],"fps":7,"loop":False,"returnTo":"idle"}
 }}
open("/tmp/frames_manifest.json","w").write(json.dumps(manifest,indent=2))
print("frames:",len(frames)," ids:", ", ".join(frames.keys()))
