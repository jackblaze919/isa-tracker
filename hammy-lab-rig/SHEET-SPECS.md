# Hammy source-sheet grid specifications

Three source sheets, each one flat **`#0057FF`** (pure blue) background, one body part per
grid cell, every cell the **same size**, the part **centered** with generous empty margin
(≥12% of the cell on every side) so auto-crop has room. The extractor
(`tools/extract-rig-sheets.py`) keys out the blue, crops these exact cells, trims padding,
and exports transparent WebP. **The grid below is the contract — the cell order is fixed.**

Hard rules for every sheet:
- One consistent Hammy, generated from the **one approved reference** — same fur color, eye
  style, proportions across all three sheets and all cells.
- Background is **solid, flat `#0057FF`** only. No gradients, no shadows cast onto the
  background, no blue used anywhere on Hammy himself (no blue eyes/props).
- Soft fur edges are fine and wanted — the keyer ramps alpha. Avoid a hard dark outline
  that traps a blue fringe.
- **No text, no labels, no numbers, no emoji** anywhere on the sheet.
- Each **limb/ear/tail/head** part must include **extra "hidden" artwork** past the joint
  (the stub that tucks under the body or head) so rotation never exposes a transparent gap.
- Parts must be drawn at consistent scale to each other (a foot is foot-sized next to the body).

---

## FRONT RIG — one full-body source image (revised plan)
**`assets/source/front-rig-source.png`** — a SINGLE picture of the approved Hammy, not a grid
of detached parts. (Image models are unreliable at producing matching isolated limbs in an
exact grid, so we hand-mask one good full-body image instead.)

Pose & framing requirements (this is what makes it riggable):
- Front / three-quarter **A-pose**: **arms held slightly away from the torso**, **feet
  separated**, **both ears fully visible**, **tail visible**, **minimal overlap** between parts.
- Whole body in frame, centered, generous margin, upright.
- Flat solid **`#0057FF`** background — **no shadow, no text, no props, no labels**, no blue on Hammy.
- Soft fur edges (no hard sticker outline). Eyes open, neutral-friendly expression.

This single image is hand-masked into the layers below using **`cutout-tool.html`** (the
Cutout & Rig Studio). The tool removes the blue, lets you draw a polygon mask per part, adds
joint-overlap padding (the hidden art under body/head), sets pivots, and exports the WebP
layers + `front-rig.json`. **No grid, no detached-part generation, no auto-tracing, no SVG redraw.**

Layers you mask out of the one source → `assets/front/`:

| part | file | notes |
|------|------|-------|
| body | `body.webp` | torso/belly |
| head | `head.webp` | whole head incl. ears area you’ll exclude; ears are separate masks |
| ear-left / ear-right | `ear-left.webp` / `ear-right.webp` | mask each ear; padding tucks the base under the head |
| arm-left / arm-right | `arm-left.webp` / `arm-right.webp` | padding tucks the shoulder under the body |
| foot-left / foot-right | `foot-left.webp` / `foot-right.webp` | padding tucks the ankle under the body |
| tail | `tail.webp` | padding tucks the base under the body |
| eyes *(optional)* | `eyes.webp` | mask just the eyes so blink / happy-squint = a quick vertical squash (no separate eyes-closed art needed) |

> Tip: give arms/feet/ears a healthy **joint overlap pad** (8–16 px) in the tool so a rotated
> limb never reveals a transparent gap at the joint.

The previous 4×4 detached-parts sheet is retired for the front rig. Side / special sheets are
**not** being produced yet.

---

## Sheet 2 — `side-puppet-sheet.png`  (side-view, walking)
Grid: **4 columns × 3 rows = 12 cells.** Recommended canvas **2048×1536** (cell 512×512).
Hammy faces **left** (he’ll be mirrored in code to walk right). Read left→right, top→bottom:

| # | row,col | part | notes |
|---|---------|------|-------|
| 1 | 0,0 | `body-side` | side torso only, no head/legs/tail. Flat neck area for the head. |
| 2 | 0,1 | `head-side-neutral` | side head **including the muzzle/nose**, ears omitted. Neck stub tucks behind body. |
| 3 | 0,2 | `head-side-blink` | same side head, eye closed. |
| 4 | 0,3 | `ear-near` | the ear closest to camera (drawn fuller). Base stub. |
| 5 | 1,0 | `ear-far` | the far ear (slightly smaller/dimmer). Base stub. |
| 6 | 1,1 | `front-leg-near` | front leg nearest camera. **Hip stub extends up** under the body. |
| 7 | 1,2 | `front-leg-far` | front far leg (can be a touch smaller/dimmer). Hip stub. |
| 8 | 1,3 | `rear-leg-near` | rear leg nearest camera. Hip stub. |
| 9 | 2,0 | `rear-leg-far` | rear far leg. Hip stub. |
| 10| 2,1 | `tail-side` | side tail with base stub. |
| 11| 2,2 | *(empty)* | blank blue. |
| 12| 2,3 | *(empty)* | blank blue. |

Far limbs are rendered **behind** the body, near limbs **in front** (z-order is set in
`manifests/side-rig.json`).

---

## Sheet 3 — `special-poses-sheet.png`  (full poses)
Grid: **2 columns × 1 row = 2 cells.** Recommended canvas **1024×512** (cell 512×512).
These are whole-body poses used where a cutout rig would look unnatural.

| # | row,col | part | notes |
|---|---------|------|-------|
| 1 | 0,0 | `sleep-curled` | Hammy curled up asleep, eyes closed, one ear flopped. Complete pose. |
| 2 | 0,1 | `fallen-left` | Hammy lying on his **left** side, having toppled, dazed but unhurt. Code mirrors this for a right-side fall. |

---

### After generating
1. Drop the three PNGs into `assets/source/` with the exact filenames above.
2. `python3 tools/extract-rig-sheets.py` → transparent WebP parts + `review/extracted-contact-sheet.png`.
3. `python3 tools/validate-rig-assets.py -v` → must report 0 errors (alpha present, no blue halo, valid dims, manifests resolve).
4. Reload `index.html` — the placeholder banner disappears and the real cutouts drive the rig.
