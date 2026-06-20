# Image-generation prompts for the three Hammy source sheets

These produce the **raster cutout parts** the rig consumes. They are written for an
image model that accepts a **reference image** (the one approved Hammy). Generate the
reference first (or reuse the approved one), then pass it as the style/character
reference for all three sheets so the character stays identical.

**Golden rules baked into every prompt below — keep them verbatim:**
- Flat, solid **`#0057FF`** (pure blue) background, edge to edge. No gradient, no vignette,
  no drop shadow on the background.
- The **same** hamster as the reference in every cell: same warm caramel-and-cream fur,
  same round black eyes, same proportions.
- **No blue anywhere on the hamster.** No text, letters, numbers, watermarks, emoji, or UI.
- Soft, slightly fuzzy fur edges (no hard black sticker outline).
- Each separated part includes the **extra stub of fur past the joint** that tucks under the
  body/head, so nothing shows a gap when rotated.
- Even grid, one part per cell, each part centered with empty margin around it.

> Replace `[REFERENCE]` with the approved Hammy reference image. If your tool can’t place
> parts on an exact grid reliably, generate each part on its own `#0057FF` square instead and
> drop them straight into `assets/front|side|special/` as `<name>.webp` — the extractor’s
> grid step is then optional.

---

## 0. (If needed) The one approved reference
```
A cute chibi cartoon hamster mascot named Hammy, front three-quarter view, standing.
Warm caramel/tan fur with a soft cream belly and cream muzzle, round glossy black eyes with
a tiny highlight, small pink inner ears, tiny pink nose, gentle friendly smile, short stubby
arms and feet, tiny tail. Soft cel-shaded children’s-app illustration style, clean soft fur
edges, no outline sticker border. Centered, full body, flat solid #0057FF background.
No text, no labels, no emoji.
```

---

## 1. `front-puppet-sheet.png` — 4×3 layout of separable FRONT parts
Canvas 2048×2048, a 4-column × 4-row grid, flat `#0057FF`.
```
Using [REFERENCE] as the exact character, produce a "puppet parts" sheet of the SAME hamster
for a cutout animation rig. Flat solid #0057FF background. A clean 4×4 grid, one part per
cell, each part centered with generous empty margin. Soft fuzzy fur edges, no hard outline.
No blue on the character. No text, numbers, labels, or emoji anywhere.

Cells, left to right, top to bottom:
1. FRONT BODY only — torso/belly, NO head, NO arms, NO feet, NO tail; flat neck area on top.
2. HEAD with NEUTRAL calm face, ears removed, include a neck stub at the bottom.
3. HEAD with HAPPY squinty content face + soft smile (same head shape as #2).
4. HEAD with EYES CLOSED (same head shape).
5. HEAD EATING — cheeks a little full, nibbling mouth (same head shape).
6. HEAD ANNOYED — brows down, small frown (same head shape).
7. HEAD DIZZY — woozy spiral eyes, wobbly mouth (same head shape).
8. LEFT EAR alone, with a fur stub at its base.
9. RIGHT EAR alone, with a fur stub at its base.
10. LEFT ARM/PAW alone, with a shoulder stub of fur.
11. RIGHT ARM/PAW alone, with a shoulder stub of fur.
12. LEFT FOOT alone, with an ankle stub of fur.
13. RIGHT FOOT alone, with an ankle stub of fur.
14. small TAIL alone, with a base stub of fur.
15. empty (just blue).
16. empty (just blue).

All seven heads must be the SAME size and shape — only the face expression changes.
```

---

## 2. `side-puppet-sheet.png` — 4×3 layout of separable SIDE parts
Canvas 2048×1536, a 4-column × 3-row grid, flat `#0057FF`. Hammy faces LEFT.
```
Using [REFERENCE] as the exact character, produce a SIDE-VIEW "puppet parts" sheet of the
SAME hamster facing LEFT, for a walking cutout rig. Flat solid #0057FF background. Clean 4×3
grid, one part per cell, centered with empty margin. Soft fur edges, no hard outline. No blue
on the character. No text, labels, numbers, or emoji.

Cells, left to right, top to bottom:
1. SIDE BODY only — torso/belly, NO head, NO legs, NO tail; flat neck area.
2. SIDE HEAD neutral, including the muzzle and nose, ears removed, neck stub at back.
3. SIDE HEAD with the eye CLOSED (same side head shape).
4. NEAR EAR (closest to camera), fuller, with a base stub.
5. FAR EAR (slightly smaller/dimmer), with a base stub.
6. NEAR FRONT LEG, with a hip stub.
7. FAR FRONT LEG (a touch smaller/dimmer), with a hip stub.
8. NEAR REAR LEG, with a hip stub.
9. FAR REAR LEG (slightly smaller/dimmer), with a hip stub.
10. SIDE TAIL with a base stub.
11. empty (just blue).
12. empty (just blue).

Keep the side head the same scale and registration in cells 2 and 3.
```

---

## 3. `special-poses-sheet.png` — 2 full poses
Canvas 1024×512, a 2-column × 1-row grid, flat `#0057FF`.
```
Using [REFERENCE] as the exact character, produce TWO full-body special poses of the SAME
hamster, side by side on a flat solid #0057FF background, each centered with empty margin.
Soft fur edges, no hard outline. No blue on the character. No text, labels, or emoji.

Left cell: Hammy CURLED UP ASLEEP — eyes gently closed, body curled into a cozy ball,
one ear softly flopped, peaceful.
Right cell: Hammy FALLEN onto his LEFT side — toppled over, lying down, dazed but unhurt and
still cute, little arms up.
```

---

### Validation gate (before any rig work)
After extraction, `tools/validate-rig-assets.py -v` must pass with **0 errors**:
every required part present, real alpha, **no residual `#0057FF` halo**, sane dimensions,
and all `manifests/*.json` references resolve. Re-render or re-key anything it rejects.
