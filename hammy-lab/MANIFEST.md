# Hammy v3 — Animation Lab Manifest

Isolated prototype proving Hammy can look **alive** with genuine multi-frame
animation **before** any integration. Nothing here is wired to the production
tracker. Lab entry point: `hammy-lab/index.html`.

## Character spec
- **Canvas / viewBox:** `0 0 120 140` (every frame shares it → uniform scale)
- **Ground line:** y = **126** (feet rest here)
- **Palette:** body `#d4a574`, belly `#f5e6d0`, ear-inner `#ffb8c8`, paw `#f0cba0`,
  outline `#7a5030` (warm brown, never pure black), highlight `#f0c99a`, nose `#e07a9e`, blush `#ff9eb0`
- **Format:** hand-authored **SVG `<symbol>`** frames (consistent character, crisp at any size,
  tiny, offline-trivial). No AI raster art. **No baked-in words** (accents are emoji ⭐💗💢, never text labels).

## Art pipeline
Frames are produced parametrically by `assets/build_frames.py` → `assets/hammy-frames.svg`
(inlined into `index.html`). Adding/altering a pose = edit one pose's parameters and regenerate;
the character stays identical because every frame is drawn from the same parts.

## Frame inventory — 30 frames
| Animation | Frames | Count |
|---|---|---|
| idle    | `f-idle-0..3` | 4 |
| walk    | `f-walk-0..5` | 6 |
| pet     | `f-pet-0..4`  | 5 |
| fall    | `f-fall-0..9` | 10 |
| annoyed | `f-annoyed-0..4` | 5 |

## Animation table
| Name | Frame sequence | fps | frame dur | type | moves | returns to |
|---|---|---|---|---|---|---|
| idle    | idle-0,1,0,2,0,3 | 4 | 250 ms | loop | no | — |
| walk    | walk-0…walk-5 | 12 | ~83 ms | loop | **yes** (70 px/s, bounces off walls, faces travel dir) | — |
| pet     | pet-0,1,2,3,2,4 | 7 | ~143 ms | one-shot | no | idle |
| fall    | fall-0…fall-9 (stand → tip → on-back → dizzy → get up) | 9 | ~111 ms | one-shot | no | idle |
| annoyed | annoyed-0,1,2,3,1,4 | 7 | ~143 ms | one-shot | no | idle |

## Interaction mapping (matches the real app's direct-touch model — no Pet/Nudge buttons)
- **drag / stroke across Hammy** → `pet`
- **quick tap** → `fall` (fall → dizzy → recover)
- **three quick taps within 1.5 s** → `annoyed`
- **keyboard:** Enter → pet, Space → fall
- Debug panel (lab only): Idle · Walk left · Walk right · Pet · Fall · Annoyed · Pause

## Engine guarantees (`hammy-engine.js`)
Frame arrays + per-animation fps; loop vs one-shot; queued one-shot requests (max 3, no overlap/
corruption); movement integrated into the frame loop while walking; auto-return to idle after a
one-shot; rAF-driven with pause on hidden tab / Pause button.

## Verification (Playwright)
Chromium + WebKit + Firefox: **30/30 frames render** via same-document `<use>`; all 5 animations
render; **0 console errors, 0 404s**. Review assets: `review/contact-sheet.png`,
`review/seq-{walk,pet,fall,annoyed}.png`, `review/hammy-lab-session.webm`.

---

## If you later commission RASTER sprite sheets instead
Equivalent spec so an illustrator can match this lab exactly:
- **Per-frame cell:** 256 × 320 px (4:5, matches the character's 120×140 proportions), **transparent background (alpha)**.
- **Sheets (one horizontal strip per animation), filenames + frame counts:**
  - `hammy-idle.png` — 4 frames → 1024 × 320
  - `hammy-walk.png` — 6 frames → 1536 × 320
  - `hammy-pet.png` — 5 frames → 1280 × 320
  - `hammy-fall.png` — 10 frames → 2560 × 320
  - `hammy-annoyed.png` — 5 frames → 1280 × 320
- **Layout:** single row, left→right play order, frame *i* occupies x = `i*256 .. i*256+256`.
- **Ground line:** the feet must sit at **y = 288/320 (90%)** of each cell, consistent across all frames.
- **Frame timing:** as in the Animation table above (fps per animation).
- **Hard rules:** identical character every frame; transparent background; **no text/labels rendered into any frame**; no scene/props baked in (habitat is a separate layer).
