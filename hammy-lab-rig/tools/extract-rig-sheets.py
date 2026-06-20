#!/usr/bin/env python3
"""
extract-rig-sheets.py — turn the three blue-background source sheets into
transparent WebP cutout parts. NEVER redraws or vectorizes; it only keys out
the solid background (#0057FF), crops the predetermined grid cells, trims empty
padding, de-spills the blue fringe, preserves soft fur edges, and rejects parts
that still show a visible blue halo.

Usage:
    python3 extract-rig-sheets.py            # process every sheet that exists
    python3 extract-rig-sheets.py front      # just the front sheet
Requires: Pillow, numpy.

The GRID layout below is the contract the image-generation prompts must match
(see ../SHEET-SPECS.md). Every cell is the same size; one part per cell, drawn
on a flat #0057FF background, centered with generous margins. Limb parts must
include the extra "hidden" art that tucks under the body/head.
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC  = os.path.join(ROOT, "assets", "source")
OUT  = {"front": os.path.join(ROOT, "assets", "front"),
        "side":  os.path.join(ROOT, "assets", "side"),
        "special": os.path.join(ROOT, "assets", "special")}
REVIEW = os.path.join(ROOT, "review")

BG = (0, 87, 255)          # #0057FF
KEY_HIGH = 70              # blue-excess >= this  -> fully transparent
KEY_LOW  = 20              # blue-excess <= this  -> fully opaque (ramp between = soft edge)
HALO_EXCESS = 55           # a kept pixel this blue counts as halo
HALO_MAX_FRAC = 0.02       # >2% halo pixels -> reject

# --- grid spec: sheet -> (cols, rows, cell list left->right, top->bottom) ---
SHEETS = {
  "front": {
    "file": "front-puppet-sheet.png", "cols": 4, "rows": 4, "out": "front",
    "cells": [
      "body", "head-neutral", "head-happy", "head-eyes-closed",
      "head-eating", "head-annoyed", "head-dizzy", "ear-left",
      "ear-right", "arm-left", "arm-right", "foot-left",
      "foot-right", "tail", None, None
    ],
  },
  "side": {
    "file": "side-puppet-sheet.png", "cols": 4, "rows": 3, "out": "side",
    "cells": [
      "body-side", "head-side-neutral", "head-side-blink", "ear-near",
      "ear-far", "front-leg-near", "front-leg-far", "rear-leg-near",
      "rear-leg-far", "tail-side", None, None
    ],
  },
  "special": {
    "file": "special-poses-sheet.png", "cols": 2, "rows": 1, "out": "special",
    "cells": ["sleep-curled", "fallen-left"],
  },
}

def fail(msg): print("  ✗ " + msg)
def ok(msg):   print("  ✓ " + msg)

def key_cell(arr):
    """arr: HxWx3 uint8 -> HxWx4 uint8 with soft alpha + de-spill. Pure NumPy."""
    import numpy as np
    f = arr.astype(np.float32)
    R, G, Bc = f[..., 0], f[..., 1], f[..., 2]
    excess = Bc - np.maximum(R, G)                      # how "blue" beyond the warm channels
    alpha = np.clip((KEY_HIGH - excess) / (KEY_HIGH - KEY_LOW), 0.0, 1.0)  # soft ramp
    # de-spill: where partly transparent, pull blue down toward max(R,G) to kill the fringe
    spill = (excess > 0) & (alpha < 0.95)
    Bc2 = np.where(spill, np.minimum(Bc, np.maximum(R, G) + 12), Bc)
    out = np.dstack([R, G, Bc2, alpha * 255.0]).astype(np.uint8)
    halo_frac = float(((alpha > 0.08) & (excess > HALO_EXCESS)).sum()) / max(1, alpha.size)
    return out, halo_frac

def process(sheet_key):
    import numpy as np
    from PIL import Image
    spec = SHEETS[sheet_key]
    path = os.path.join(SRC, spec["file"])
    if not os.path.exists(path):
        fail(f"{spec['file']} not found in assets/source/ — skipping {sheet_key} (supply the sheet first)")
        return []
    outdir = OUT[spec["out"]]; os.makedirs(outdir, exist_ok=True)
    img = Image.open(path).convert("RGB")
    W, H = img.size
    cw, ch = W // spec["cols"], H // spec["rows"]
    print(f"[{sheet_key}] {spec['file']} {W}x{H}  grid {spec['cols']}x{spec['rows']}  cell {cw}x{ch}")
    made = []
    arr = np.asarray(img)
    for i, name in enumerate(spec["cells"]):
        if not name: continue
        r, c = divmod(i, spec["cols"])
        cell = arr[r*ch:(r+1)*ch, c*cw:(c+1)*cw, :]
        rgba, halo = key_cell(cell)
        im = Image.fromarray(rgba, "RGBA")
        bbox = im.getbbox()                               # trim empty padding
        if bbox: im = im.crop(bbox)
        if im.width < 6 or im.height < 6:
            fail(f"{name}: nearly empty after keying (cell may be blank)"); continue
        if halo > HALO_MAX_FRAC:
            fail(f"{name}: REJECTED — visible blue halo ({halo*100:.1f}% > {HALO_MAX_FRAC*100:.0f}%); re-key or re-render")
            continue
        dst = os.path.join(outdir, name + ".webp")
        im.save(dst, "WEBP", lossless=True, quality=100)
        ok(f"{name}.webp  {im.width}x{im.height}  halo {halo*100:.2f}%")
        made.append((name, dst))
    return made

def contact_sheet(parts):
    if not parts: return
    from PIL import Image, ImageDraw
    os.makedirs(REVIEW, exist_ok=True)
    cell = 150; cols = 6; rows = (len(parts) + cols - 1)//cols
    sheet = Image.new("RGBA", (cols*cell, rows*cell + 24), (255, 245, 250, 255))
    # checkerboard so transparency is visible
    d = ImageDraw.Draw(sheet)
    for gy in range(0, sheet.height, 16):
        for gx in range(0, sheet.width, 16):
            if (gx//16 + gy//16) % 2: d.rectangle([gx, gy, gx+16, gy+16], fill=(235, 220, 230, 255))
    for i, (name, p) in enumerate(parts):
        from PIL import Image as I
        im = I.open(p).convert("RGBA"); im.thumbnail((cell-20, cell-34))
        x = (i % cols)*cell + (cell-im.width)//2; y = (i//cols)*cell + 6
        sheet.alpha_composite(im, (x, y))
        d.text(((i % cols)*cell + 4, (i//cols)*cell + cell - 16), name, fill=(90, 40, 60, 255))
    out = os.path.join(REVIEW, "extracted-contact-sheet.png"); sheet.convert("RGB").save(out)
    ok(f"contact sheet -> review/extracted-contact-sheet.png ({len(parts)} parts)")

def main():
    try:
        import numpy  # noqa
        from PIL import Image  # noqa
    except Exception as e:
        print("This tool needs Pillow + numpy:  pip install pillow numpy\n", e); sys.exit(1)
    which = sys.argv[1:] or list(SHEETS.keys())
    allparts = []
    any_src = False
    for k in which:
        if k not in SHEETS: print("unknown sheet:", k); continue
        if os.path.exists(os.path.join(SRC, SHEETS[k]["file"])): any_src = True
        allparts += process(k)
    if not any_src:
        print("\nNo source sheets present yet in assets/source/.")
        print("Add them (see ../SHEET-SPECS.md + ../PROMPTS.md) then re-run.")
        return
    contact_sheet(allparts)
    print(f"\nDone. {len(allparts)} parts extracted. Review review/extracted-contact-sheet.png, then run validate-rig-assets.py")

if __name__ == "__main__":
    main()
