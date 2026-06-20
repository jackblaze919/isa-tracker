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

## Sheet 1 — `front-puppet-sheet.png`  (front / three-quarter)
Grid: **4 columns × 4 rows = 16 cells.** Recommended canvas **2048×2048** (cell 512×512).
Read left→right, top→bottom:

| # | row,col | part | notes |
|---|---------|------|-------|
| 1 | 0,0 | `body` | front torso only — **no** head, arms, feet, or tail. Flat shoulder/neck area on top for the head to sit over. |
| 2 | 0,1 | `head-neutral` | full head, ears **omitted** (ears are separate). Calm eyes. Include neck stub at the bottom that tucks behind the body. |
| 3 | 0,2 | `head-happy` | same head, content/squinty happy eyes + soft smile. |
| 4 | 0,3 | `head-eyes-closed` | same head, eyes closed (used for blink + petting). |
| 5 | 1,0 | `head-eating` | same head, cheeks slightly full, mouth nibbling. |
| 6 | 1,1 | `head-annoyed` | same head, brows down, small frown. |
| 7 | 1,2 | `head-dizzy` | same head, spiral/woozy eyes, mouth wobbly. |
| 8 | 1,3 | `ear-left` | left ear, **base stub extends down** so it tucks under the head when rotated. |
| 9 | 2,0 | `ear-right` | right ear (may be a mirror of left). Base stub included. |
| 10| 2,1 | `arm-left` | left arm/paw, **shoulder stub extends up/in** under the body. |
| 11| 2,2 | `arm-right` | right arm/paw, shoulder stub included. |
| 12| 2,3 | `foot-left` | left foot, **ankle stub extends up** under the body. |
| 13| 3,0 | `foot-right` | right foot, ankle stub included. |
| 14| 3,1 | `tail` | small tail, **base stub extends in** under the body. |
| 15| 3,2 | *(empty)* | leave blank blue. |
| 16| 3,3 | *(empty)* | leave blank blue. |

All seven heads must be **identical in size and registration** (same head outline, only the
face changes) so swapping them never shifts the head.

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
