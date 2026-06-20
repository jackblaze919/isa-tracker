#!/usr/bin/env python3
"""
pack-review-sheet.py — compose a single labelled review image of all extracted
rig parts (front, side, special) on a checkerboard so transparency/edges are
visible for human review. Output: review/rig-parts-review.png.
Requires Pillow. Safe to run before art exists (says what's missing).
"""
import os, glob
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
REVIEW = os.path.join(ROOT, "review")
GROUPS = [("front","assets/front"),("side","assets/side"),("special","assets/special"),("effects","assets/effects")]

def main():
    parts = []
    for label, rel in GROUPS:
        for p in sorted(glob.glob(os.path.join(ROOT, rel, "*.webp"))):
            parts.append((label, os.path.splitext(os.path.basename(p))[0], p))
    if not parts:
        print("No extracted parts yet. Run extract-rig-sheets.py after supplying source sheets."); return
    os.makedirs(REVIEW, exist_ok=True)
    cell = 160; cols = 6; rows = (len(parts)+cols-1)//cols
    img = Image.new("RGBA",(cols*cell, rows*cell+30),(255,255,255,255))
    d = ImageDraw.Draw(img)
    for gy in range(0,img.height,16):
        for gx in range(0,img.width,16):
            if (gx//16+gy//16)%2: d.rectangle([gx,gy,gx+16,gy+16], fill=(236,224,232,255))
    for i,(label,name,p) in enumerate(parts):
        im = Image.open(p).convert("RGBA"); im.thumbnail((cell-22, cell-40))
        cx=(i%cols)*cell; cy=(i//cols)*cell
        img.alpha_composite(im,(cx+(cell-im.width)//2, cy+6))
        d.text((cx+4, cy+cell-18), f"{label}/{name}", fill=(90,40,60,255))
    out = os.path.join(REVIEW,"rig-parts-review.png"); img.convert("RGB").save(out)
    print(f"Wrote {out} ({len(parts)} parts)")

if __name__ == "__main__":
    main()
