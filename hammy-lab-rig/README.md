# Hammy Rig Lab (isolated raster cutout-puppet prototype)

A browser-native **layered-image puppet rig** for Hammy. Transparent raster body-part
layers are positioned by a rig JSON and animated **per-part** with CSS transforms via the
Web Animations API. This is an **isolated lab** on `feature/hammy-v3` — it is **not** wired
into the production tracker and must not be merged to `main` or deployed.

> The old parametric-SVG lab (`../hammy-lab/`) is kept only as a **motion/timing reference**.
> None of its geometric artwork is used here.

## Status — phase 1 (engineering scaffold)
Everything runs on **clearly-labelled placeholder rectangles**. No Hammy art has been
generated yet. Placeholders are temporary and exist only to validate the rig, the animation
wiring, the editor, and the tooling. **This is not a visual-completion milestone.**

Open `index.html` from a local server (`python3 -m http.server`) and you’ll see the rig with
a yellow “engineering placeholders” banner. Debug buttons drive every state; gestures work
(stroke = pet, tap = fall→dizzy, triple-tap = annoyed, Enter = pet, Space = fall).

## Layout
```
index.html        lab page (stage, debug buttons, editor panel, missing-assets banner)
rig-lab.css       styles (incl. placeholder + editor styling)
rig-engine.js     rig builder + WAAPI state machine + queue + gestures + effects
rig-editor.js     lab-only visual editor (drag / pivot / scale / z / toggle / mirror / export)
manifests/
  front-rig.json  front cutout layers (filename, z, x/y, w/h, pivot, parent, opacity, mirror, variants)
  side-rig.json   side cutout layers (far limbs behind body, near limbs in front)
  animations.json per-state per-layer keyframe tracks
tools/
  extract-rig-sheets.py   #0057FF chroma-key → grid-crop → autocrop → despill → WebP → contact sheet → halo reject
  validate-rig-assets.py  alpha / no-blue-halo / dims / manifest-resolves / in-canvas checks
  pack-review-sheet.py    labelled contact sheet of extracted parts on a checkerboard
assets/
  source/   <- drop the 3 blue-background sheets here (see SHEET-SPECS.md)
  front/ side/ special/ effects/   <- extracted transparent WebP parts land here
review/     contact sheets + review captures
SHEET-SPECS.md  exact 3-sheet grid layout (the extractor contract)
PROMPTS.md      exact image-generation prompts for the 3 sheets
```

## Pipeline (once art exists)
1. Generate the 3 sheets from the approved Hammy reference using `PROMPTS.md`; save into
   `assets/source/` with the exact names in `SHEET-SPECS.md`.
2. `python3 tools/extract-rig-sheets.py` → transparent parts + `review/extracted-contact-sheet.png`.
3. `python3 tools/validate-rig-assets.py -v` → 0 errors required.
4. Reload `index.html`; the placeholder banner clears and real cutouts drive the rig.

## Approval gate
Phase 1 delivers the empty rig lab, editor, extraction/validation tooling, exact grid specs,
exact prompts, and placeholder-only animation definitions. **Stop for approval.** On the front
puppet sheet being supplied: extract it, build only idle / blink / ear-twitch / pet on the real
cutouts, record a review video, and stop again. No extra art, no merge, no deploy.
