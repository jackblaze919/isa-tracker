#!/usr/bin/env python3
"""
validate-rig-assets.py — automated checks on extracted rig parts + manifests.
Verifies: every required layer/variant file exists, has real alpha transparency,
has no significant #0057FF pixels left, has sensible dimensions, that each rig
JSON references valid asset files, and that no layer is positioned outside its
canvas. Prints PASS/WARN/FAIL with an exit code (0 = all required checks pass).
Requires Pillow + numpy. Safe to run before art exists (reports what's missing).
"""
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
MAN = os.path.join(ROOT, "manifests")
BG = (0, 87, 255); BLUE_EXCESS = 55; BLUE_MAX_FRAC = 0.01
errs = []; warns = []; passes = 0
def E(m): errs.append(m)
def W(m): warns.append(m)
def P(m):
    global passes; passes += 1
    if "-v" in sys.argv: print("  ✓", m)

def collect_layer_files(rig):
    files = []
    for L in rig["layers"]:
        files.append(L["src"])
        for v in (L.get("variants") or {}).values(): files.append(v)
    # de-dup, keep order
    seen=set(); out=[]
    for f in files:
        if f not in seen: seen.add(f); out.append(f)
    return out

def check_image(relpath):
    import numpy as np
    from PIL import Image
    p = os.path.join(ROOT, relpath)
    if not os.path.exists(p): E(f"missing asset: {relpath}"); return
    try: im = Image.open(p)
    except Exception as ex: E(f"cannot open {relpath}: {ex}"); return
    if im.mode != "RGBA": E(f"{relpath}: not RGBA (no alpha channel)"); return
    a = np.asarray(im); alpha = a[..., 3]
    if (alpha < 250).mean() < 0.02: E(f"{relpath}: alpha looks fully opaque (background not removed?)"); return
    if alpha.max() == 0: E(f"{relpath}: fully transparent (empty)"); return
    R, G, Bc = a[...,0].astype(int), a[...,1].astype(int), a[...,2].astype(int)
    excess = Bc - np.maximum(R, G)
    blue_frac = float(((alpha > 30) & (excess > BLUE_EXCESS)).sum()) / max(1, alpha.size)
    if blue_frac > BLUE_MAX_FRAC: E(f"{relpath}: {blue_frac*100:.1f}% residual #0057FF halo (> {BLUE_MAX_FRAC*100:.0f}%)"); return
    if im.width < 8 or im.height < 8 or im.width > 1024 or im.height > 1024:
        W(f"{relpath}: unusual dimensions {im.width}x{im.height}")
    P(f"{relpath} ({im.width}x{im.height}, alpha ok, halo {blue_frac*100:.2f}%)")

def check_rig(name):
    path = os.path.join(MAN, name)
    if not os.path.exists(path): E(f"manifest missing: {name}"); return
    rig = json.load(open(path))
    cw, chh = rig.get("canvas", [None, None])
    for L in rig["layers"]:
        if cw and (L["x"] < -L["w"] or L["y"] < -L["h"] or L["x"] > cw or L["y"] > chh):
            W(f'{name}:{L["name"]} sits outside canvas ({L["x"]},{L["y"]})')
    files = collect_layer_files(rig)
    any_present = any(os.path.exists(os.path.join(ROOT, f)) for f in files)
    if not any_present:
        W(f"{name}: no art present yet ({len(files)} files expected) — placeholder mode")
        return
    for f in files: check_image(f)

def main():
    try:
        import numpy, PIL  # noqa
    except Exception as e:
        print("Needs Pillow + numpy:", e); sys.exit(1)
    for m in ("front-rig.json", "side-rig.json"): check_rig(m)
    # special poses referenced by the engine
    for f in ("assets/special/sleep-curled.webp", "assets/special/fallen-left.webp"):
        if any(os.path.exists(os.path.join(ROOT, x)) for x in [f]):
            check_image(f)
        else:
            W(f"special pose not present yet: {f}")
    print(f"\n{passes} passed · {len(warns)} warnings · {len(errs)} errors")
    for w in warns: print("  ⚠ ", w)
    for e in errs: print("  ✗ ", e)
    sys.exit(1 if errs else 0)

if __name__ == "__main__":
    main()
