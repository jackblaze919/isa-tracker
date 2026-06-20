# Hammy Renderer Integration Specification

## Architecture Overview

The renderer replaces the current inline SVG sprite system with a WebP image-based pose system. The existing behavior layer (hamster.js state management, event handling, action queue, gesture detection, care state persistence) remains unchanged. Only the visual rendering functions are modified.

---

## Pose Mapping

### State → Image File

```javascript
const POSE_FILES = {
  idle:        "hammy-idle.webp",
  "look-left": "hammy-look-left.webp",
  "look-right":"hammy-look-right.webp",
  "walk-1":    "hammy-walk-1.webp",
  "walk-2":    "hammy-walk-2.webp",
  "walk-3":    "hammy-walk-3.webp",
  "walk-4":    "hammy-walk-4.webp",
  sit:         "hammy-sit.webp",
  sniff:       "hammy-sniff.webp",
  "groom-1":   "hammy-groom-1.webp",
  "groom-2":   "hammy-groom-2.webp",
  "eat-1":     "hammy-eat-1.webp",
  "eat-2":     "hammy-eat-2.webp",
  "eat-3":     "hammy-eat-3.webp",
  drink:       "hammy-drink.webp",
  sleep:       "hammy-sleep.webp",
  wake:        "hammy-wake.webp",
  "wheel-1":   "hammy-wheel-1.webp",
  "wheel-2":   "hammy-wheel-2.webp",
  "workout-1": "hammy-workout-1.webp",
  "workout-2": "hammy-workout-2.webp",
  petted:      "hammy-petted.webp",
  "shove-left":"hammy-shove-left.webp",
  "shove-right":"hammy-shove-right.webp",
  "fall-left": "hammy-fall-left.webp",
  "fall-right":"hammy-fall-right.webp",
  dizzy:       "hammy-dizzy.webp",
  annoyed:     "hammy-annoyed.webp",
  "shake-off": "hammy-shake-off.webp",
  recover:     "hammy-recover.webp",
  celebrate:   "hammy-celebrate.webp",
  "wait-bowl": "hammy-wait-bowl.webp",
  "tunnel-enter":"hammy-tunnel-enter.webp",
  "tunnel-exit":"hammy-tunnel-exit.webp"
};
```

### Mood → Pose Mapping (bridges existing mood system)

```javascript
const MOOD_TO_POSE = {
  idle:       "idle",
  walking:    null,         // handled by walk cycle
  sniffing:   "sniff",
  grooming:   "groom-1",   // alternates with groom-2
  sitting:    "sit",
  waitbowl:   "wait-bowl",
  looking:    "look-left",  // direction set by face()
  wiggle:     "idle",       // ear wiggle uses idle + CSS transform on ears (or stays idle)
  eating:     "eat-1",      // cycles through eat-1, eat-2, eat-3
  drinking:   "drink",
  sleeping:   "sleep",
  resting:    "sit",
  wheel:      "wheel-1",   // cycles wheel-1, wheel-2
  exercising: "workout-1", // cycles workout-1, workout-2
  petted:     "petted",
  tumbling:   null,         // handled by fall sequence
  recovering: "recover"
};
```

---

## Left/Right Mirroring

- All character art is drawn facing RIGHT in the source file
- When Hammy faces LEFT, apply `transform: scaleX(-1)` on the character container
- The existing `face(dir)` function already does this via the `.hammy-flip` element
- Exception: `fall-left` and `fall-right` are separate files (no mirroring needed for falls)
- Exception: `shove-left` and `shove-right` are separate files

---

## Frame Preloading

On init, preload all pose images to prevent pop-in:

```javascript
function preloadPoses() {
  const basePath = "assets/hammy/poses/";
  Object.values(POSE_FILES).forEach(filename => {
    const img = new Image();
    img.src = basePath + filename;
  });
  // Also preload habitat layers
  new Image().src = "assets/hammy/habitat/habitat-background.webp";
  new Image().src = "assets/hammy/habitat/habitat-foreground.webp";
}
```

Call during `init()` — images cache in browser memory.

---

## Animation Sequences

### Walking (4-frame cycle)

```
Trigger: walkTo() called
Frame sequence: walk-1 → walk-2 → walk-3 → walk-4 → repeat
Frame rate: ~8fps (125ms per frame)
Duration: Until walkTo() destination reached
End: Switch to destination mood pose
```

Implementation: `setInterval` cycles through frames during rAF walk. Cleared on arrival.

### Eating (3-frame sequence)

```
Trigger: meal tracker event
Sequence:
  1. Walk to bowl area
  2. Show eat-1 (reaching for food) — 600ms
  3. Show eat-2 (cheeks puffing) — 800ms  
  4. Show eat-3 (chewing happily) — 1200ms
  5. Return to idle
Total duration: ~2600ms eating + walk time
```

### Sleeping

```
Trigger: sleep tracker event
Sequence:
  1. Walk to bed area
  2. Show sit — 300ms (settling)
  3. Show sleep (curled) — hold for 3000-4000ms
  4. Return via wake pose — 800ms
  5. Return to idle
```

### Petting (stroke interaction)

```
Trigger: Pointer movement ≥15px on Hammy
Sequence:
  1. Immediately show petted pose
  2. Spawn heart effects
  3. Hold petted for 900ms after stroke ends
  4. Return to idle
```

No whole-sprite squash — the petted.webp IS the visual (relaxed melted hamster).

### Fall Sequence (tap/tease interaction)

```
Trigger: Quick tap (<220ms, <8px movement)
Determine direction from tap position (left tap → fall right, right tap → fall left)

Sequence:
  1. ANTICIPATION (80-120ms)
     - Show shove-left or shove-right (compressed, bracing)
  
  2. FALL (180-280ms)  
     - Show fall-left or fall-right (on side, feet up)
     - Character slides slightly in fall direction (5-10px CSS)
  
  3. ON FLOOR (500-900ms)
     - Hold fall pose
     - Spawn small star effects around head
     - Optional: tiny CSS wobble on the image (±2deg rotation, 200ms)
  
  4. REACTION (choose one):
     a) DIZZY (default, or first tap):
        - Show dizzy (sitting up, spiral eyes) — 1200ms
        - Show shake-off — 500ms
        - Show recover — 400ms
        - Return to idle
     
     b) ANNOYED (if tapped 2+ times in 5s):
        - Show annoyed (narrowed eyes, side-eye) — 1500ms
        - Face AWAY from viewer (scaleX flip) — 1000ms
        - Face back, return to idle

  5. COOLDOWN: 1200ms before next tap accepted

Messages:
  - Dizzy: "Hammy needs a second…" or "Hammy looks dizzy"
  - Annoyed: "Hammy is not impressed" or "Hammy gave you the side-eye"
```

### Wheel Running

```
Trigger: step-target-reached event
Sequence:
  1. Walk to wheel position
  2. Cycle wheel-1, wheel-2 at ~6fps (170ms per frame)
  3. Run for 3000-4000ms
  4. Stop, show idle
```

### Grooming

```
Trigger: Idle action selection
Sequence:
  1. Show sit — 300ms
  2. Alternate groom-1, groom-2 at 400ms each — 3 cycles
  3. Return to idle
```

---

## Habitat Layering

### DOM Structure (replaces current SVG layers)

```html
<div class="hammy-stage" id="hammyStage">
  <!-- Layer 0: Background (below everything) -->
  <img class="habitat-bg" src="assets/hammy/habitat/habitat-background.webp" alt="" aria-hidden="true">
  
  <!-- Time-of-day overlay -->
  <div class="ham-tod" aria-hidden="true"></div>
  
  <!-- Layer 1: Character + shadow -->
  <div class="hammy-shadow" id="hammyShadow" aria-hidden="true"></div>
  <div id="hammyPet" class="hammy" role="img" aria-label="Hammy the hamster" tabindex="0">
    <div id="hammyFlip" class="hammy-flip">
      <img id="hammyImg" class="hammy-img" src="assets/hammy/poses/hammy-idle.webp" alt="">
    </div>
  </div>
  
  <!-- Layer 2: Foreground (above character for depth) -->
  <img class="habitat-fg" src="assets/hammy/habitat/habitat-foreground.webp" alt="" aria-hidden="true">
  
  <!-- Layer 3: Effects (hearts, stars) -->
  <div class="hammy-fx-layer" id="hammyFxLayer" aria-hidden="true"></div>
  
  <!-- Toast message -->
  <div class="hammy-toast" id="hammyToast" aria-hidden="true"></div>
</div>
```

### CSS Z-Index Stacking

```css
.habitat-bg   { z-index: 0; }   /* painted background */
.ham-tod      { z-index: 1; }   /* time-of-day color overlay */
.hammy-shadow { z-index: 2; }   /* soft shadow under character */
.hammy        { z-index: 3; }   /* character */
.habitat-fg   { z-index: 4; }   /* foreground depth objects */
.hammy-fx-layer { z-index: 5; } /* floating effects */
.hammy-toast  { z-index: 6; }   /* status messages */
```

---

## Preserved Behavior (NO CHANGES)

The following systems remain completely unchanged:

- **Care State**: fullness, happiness, energy, affectionXp, processedEvents, unlockedDecorations
- **Persistence**: `isa:v1:hamster:state` in localStorage
- **Decay System**: Elapsed-time calculation on visibility change
- **Event Bridge**: CustomEvent listeners for meal/workout/step/sleep/checkin
- **Event Idempotency**: processedEvents map preventing duplicate rewards
- **Action Queue**: Sequential processing with generation counter
- **Idle Scheduling**: Weighted random actions every 4-10 seconds
- **Visibility Handling**: Pause on tab hide, resume on show
- **Backup/Restore**: hamster:state included in isa:v1:* export
- **Name Editing**: 16-char max, persisted in care state
- **Affection XP**: Accumulation from interactions and tracker events
- **Time of Day**: tod-day/evening/night class toggling

---

## Removed Elements

- `.hammy-controls` div (Pet/Nudge buttons)
- Button click handlers for pet/nudge
- All inline SVG sprite symbols from index.html
- All `<use href="#pose-...">` elements
- SVG-based effect spawning (replaced with small illustrated SVG hearts/stars that remain acceptable)

---

## Added Elements

- First-time instruction overlay: "Stroke Hammy to pet · tap to tease"
  - Shown once on first visit
  - Dismissed on first interaction or after 5 seconds
  - Remembered via `isa:v1:hammy-hint-seen` localStorage key
  
- Repeated-tap tracking:
  - `A.recentTaps` array of timestamps
  - If 2+ taps within 5000ms → annoyed reaction
  - Cooldown prevents taps during active fall/recovery sequence

---

## Keyboard Accessibility (preserved)

- `Enter` on focused #hammyPet → triggers pet (stroke) action
- `Space` on focused #hammyPet → triggers tease (tap/fall) action
- `tabindex="0"` maintained on character element
- `aria-label` updated to reflect current activity
- `role="img"` maintained

---

## Service Worker Updates

Add to ASSETS array:
```javascript
'./assets/hammy/poses/hammy-idle.webp',
'./assets/hammy/poses/hammy-walk-1.webp',
// ... all pose files
'./assets/hammy/habitat/habitat-background.webp',
'./assets/hammy/habitat/habitat-foreground.webp'
```

Cache version bumped on each art update.

---

## setPose() Function (new core render function)

```javascript
function setPose(poseKey) {
  if (!A.imgEl) return;
  const file = POSE_FILES[poseKey];
  if (!file) return;
  const src = "assets/hammy/poses/" + file;
  if (A.imgEl.src !== src) A.imgEl.src = src;
}
```

This replaces the current `mood()` → SVG `<use>` href swap. The mood() function will call setPose() internally instead of setAttribute("href"...).
