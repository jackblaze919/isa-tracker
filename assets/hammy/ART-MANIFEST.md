# Hammy Art Asset Manifest

## Overview

All character poses are transparent-background WebP files at a fixed canvas size.
Habitat layers are opaque (background) or partially transparent (foreground) WebP files.

---

## Character Poses

| Filename | Dimensions | Transparent | Description |
|----------|-----------|-------------|-------------|
| `hammy-idle.webp` | 256×320 | Yes | Front-facing relaxed standing pose, neutral happy expression |
| `hammy-look-left.webp` | 256×320 | Yes | Head and eyes turned left, body mostly front-facing |
| `hammy-look-right.webp` | 256×320 | Yes | Head and eyes turned right, body mostly front-facing |
| `hammy-walk-1.webp` | 256×320 | Yes | Walk cycle frame 1 — left paw forward (contact) |
| `hammy-walk-2.webp` | 256×320 | Yes | Walk cycle frame 2 — body low, paws under (down) |
| `hammy-walk-3.webp` | 256×320 | Yes | Walk cycle frame 3 — right paw forward (passing) |
| `hammy-walk-4.webp` | 256×320 | Yes | Walk cycle frame 4 — body high, pushing off (up) |
| `hammy-sit.webp` | 256×320 | Yes | Sitting upright, front paws in lap, round body |
| `hammy-sniff.webp` | 256×320 | Yes | Nose tilted up, whiskers spread, leaning forward |
| `hammy-groom-1.webp` | 256×320 | Yes | Front paws raised to face, washing motion |
| `hammy-groom-2.webp` | 256×320 | Yes | Paw over right ear, head tilted |
| `hammy-eat-1.webp` | 256×320 | Yes | Paws holding food near mouth, eager face |
| `hammy-eat-2.webp` | 256×320 | Yes | Paws at mouth, cheeks puffing, head bobbing down |
| `hammy-eat-3.webp` | 256×320 | Yes | Chewing happily, cheeks full, eyes content half-closed |
| `hammy-drink.webp` | 256×320 | Yes | Head tilted up, tongue reaching toward bottle nozzle |
| `hammy-sleep.webp` | 256×320 | Yes | Curled into ball, eyes closed, paws tucked, tail wrapped |
| `hammy-wake.webp` | 256×320 | Yes | Stretching, front paws forward, back arched, yawn |
| `hammy-wheel-1.webp` | 256×320 | Yes | Running pose frame 1 — left limbs forward |
| `hammy-wheel-2.webp` | 256×320 | Yes | Running pose frame 2 — limbs midway |
| `hammy-workout-1.webp` | 256×320 | Yes | Squatting down, arms out to sides |
| `hammy-workout-2.webp` | 256×320 | Yes | Jumping up, arms raised, happy |
| `hammy-petted.webp` | 256×320 | Yes | Eyes blissfully closed, ears lowered, body relaxed/melted |
| `hammy-shove-left.webp` | 256×320 | Yes | Anticipation — eyes wide, body compresses, bracing left |
| `hammy-shove-right.webp` | 256×320 | Yes | Anticipation — eyes wide, body compresses, bracing right |
| `hammy-fall-left.webp` | 256×320 | Yes | Tipped over on left side, feet off ground, surprised face |
| `hammy-fall-right.webp` | 256×320 | Yes | Tipped over on right side, feet off ground, surprised face |
| `hammy-dizzy.webp` | 256×320 | Yes | Sitting up wobbly, spiral eyes, small stars around head |
| `hammy-annoyed.webp` | 256×320 | Yes | Standing, narrowed eyes, ears back, one paw stomping, side-eye |
| `hammy-shake-off.webp` | 256×320 | Yes | Shaking fur back into place, slight blur/motion lines |
| `hammy-recover.webp` | 256×320 | Yes | Standing back up, slightly wobbly, blinking |
| `hammy-celebrate.webp` | 256×320 | Yes | Jumping with joy, paws up, big open smile |
| `hammy-wait-bowl.webp` | 256×320 | Yes | Sitting expectantly, one paw reaching toward bowl area |
| `hammy-tunnel-enter.webp` | 256×320 | Yes | Rear half visible, front disappearing into tunnel |
| `hammy-tunnel-exit.webp` | 256×320 | Yes | Front half emerging, paws first |

## Habitat Layers

| Filename | Dimensions | Transparent | Description |
|----------|-----------|-------------|-------------|
| `habitat-background.webp` | 780×560 | No (opaque) | Full illustrated habitat room — warm wall, bedding floor, mounted wheel, water bottle, bowl area, bed/nest area, tunnel/hideout, consistent warm lighting from upper-left |
| `habitat-foreground.webp` | 780×560 | Yes (partial) | Foreground depth elements — bedding texture at bottom edge, soft cast shadows, one or two objects Hammy can pass behind, subtle vignette framing |

## Interactive Props (optional, only if needed separately from background)

| Filename | Dimensions | Transparent | Description |
|----------|-----------|-------------|-------------|
| `prop-wheel-spin.webp` | 220×220 | Yes | Wheel in spinning state (if animated separately from bg) |
| `prop-bowl-full.webp` | 120×80 | Yes | Food bowl with visible food inside |
| `prop-bowl-empty.webp` | 120×80 | Yes | Empty food bowl |

---

## Technical Specifications

### Character Canvas Rules

- **Canvas**: 256×320 pixels (width × height)
- **Ground line**: Bottom of feet/body touches y=290 (30px padding below)
- **Top padding**: Head peak at approximately y=40 (40px above)
- **Horizontal center**: Character centered at x=128
- **Character height**: Approximately 200–240px from feet to ear tips
- **Format**: WebP with alpha channel, lossy quality 85–90
- **Max file size**: 50KB per pose frame
- **Color profile**: sRGB

### Habitat Canvas Rules

- **Canvas**: 780×560 pixels (2× the CSS display size of 390×280)
- **Display**: Rendered at CSS width 100% of container (max ~390px), height 280px
- **Format**: WebP, quality 80–85
- **Background max size**: 120KB
- **Foreground max size**: 80KB
- **Color profile**: sRGB

### Character Placement in Habitat

- Character is positioned with CSS `bottom` and `left` properties
- At display scale: character renders at approximately 80×100px CSS (256×320 source at ~0.31× scale)
- Ground line of character aligns with habitat floor at approximately CSS bottom: 44px
- Character can be CSS-mirrored with `transform: scaleX(-1)` for right-facing

### Consistency Requirements

All character frames MUST share:
- Identical canvas dimensions (256×320)
- Identical ground line (feet at y=290)
- Identical horizontal center (x=128)
- Same fur color palette (caramel/cream/pink)
- Same face proportions (eye size, nose position, ear placement)
- Same outline style and weight
- Same lighting direction (soft upper-left)
- Same level of detail and rendering style
- Same character identity (recognizably the same hamster)

---

## Minimum Approval Set

Generate these 13 files first for review before producing the full set:

1. `hammy-idle.webp`
2. `hammy-walk-1.webp`
3. `hammy-walk-2.webp`
4. `hammy-walk-3.webp`
5. `hammy-walk-4.webp`
6. `hammy-eat-1.webp` (listed as `hammy-eat.webp` in brief shorthand)
7. `hammy-sleep.webp`
8. `hammy-petted.webp`
9. `hammy-fall-left.webp` (listed as `hammy-fallen.webp` in brief shorthand)
10. `hammy-dizzy.webp`
11. `hammy-annoyed.webp`
12. `habitat-background.webp`
13. `habitat-foreground.webp`

Place all files in: `isa-tracker/assets/hammy/poses/` (character) and `isa-tracker/assets/hammy/habitat/` (environment)
