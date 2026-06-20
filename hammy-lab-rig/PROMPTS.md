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

## 1. `front-rig-source.png` — ONE full-body A-pose image (current plan)
A single picture of the SAME hamster, hand-masked later in `cutout-tool.html`. **Not** a grid
of detached parts. Recommended canvas **1024×1024** (square), flat `#0057FF`.
```
Using [REFERENCE] as the exact character, draw the SAME chibi hamster as ONE full-body
illustration in a front three-quarter A-POSE, suitable for cutting into animation puppet parts.

Pose: standing upright, facing the viewer at a slight three-quarter angle, ARMS HELD SLIGHTLY
AWAY FROM THE TORSO (a small gap under each arm), FEET SEPARATED with a gap between them, BOTH
EARS fully visible and not overlapping each other, TAIL visible at the side, and MINIMAL
OVERLAP between body parts so each part can be masked cleanly.

Style: same warm caramel/cream fur, round glossy black eyes (open, neutral-friendly), pink
inner ears, pink nose, soft cel-shaded children's-app look, soft fuzzy fur edges, NO hard
outline. Whole body in frame, centered, generous empty margin around it.

Background: flat solid #0057FF, edge to edge. NO shadow, NO gradient, NO props, NO text,
NO labels, NO emoji. NO blue anywhere on the hamster.
```
Then load it in the **Cutout & Rig Studio** (`cutout-tool.html`): remove the blue, draw a
polygon mask for body / head / each ear / each arm / each foot / tail (and optionally the eyes
for blinking), add joint-overlap padding, set pivots, and export the WebP layers +
`front-rig.json`.

> The old 4×4 detached-parts prompt is retired. Side / special prompts below are **not** in use
> yet — do not generate them.

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
