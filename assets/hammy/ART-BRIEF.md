# Hammy Character Art Brief

## Character: Hammy the Hamster

A virtual pet hamster living inside a mobile health tracker app. The artwork should feel like a polished indie mobile game — warm, cozy, and expressive enough to carry emotional weight on a small phone screen.

---

## Visual Style

**Target**: Soft painterly 2D cartoon illustration, similar to quality found in Neko Atsume, Tsuki's Odyssey, or Hamster Cookie Factory.

**Qualities**:
- Warm and inviting color temperature
- Soft cel shading with visible light direction (upper-left)
- Slightly textured fur (not flat fill, not hyper-detailed)
- Clean readable silhouette at small sizes
- Natural asymmetry (not perfectly geometric)
- Rounded organic forms (no obvious circle/ellipse construction)
- Consistent warm brown outlines (not pure black, not harsh)
- Visible but restrained cast shadows

**Avoid**:
- Flat vector/clipart look
- Thick uniform outlines
- Geometric construction (obvious circles for body)
- Hyper-realism
- Anime/manga style
- 3D rendered look
- Logo/mascot style
- Generic stock illustration

---

## Character Design

**Body shape**: Pear or bean-shaped, slightly bottom-heavy. NOT a circle with appendages.

**Fur palette**:
- Main body: Warm caramel (#C8956C to #D4A574 range)
- Belly/muzzle/inner: Cream (#F5E6D0 to #FFF3E0)
- Shadow tone: Warm brown (#9A7050)
- Highlight: Soft gold (#F0C99A)

**Features**:
- Small rounded ears with visible pink inner color
- Large expressive dark eyes (NOT solid black — should have highlights, subtle iris)
- Expressive eyelids and tiny brows for emotion
- Small pink triangular nose with a highlight dot
- Tiny whiskers (2-3 per side, subtle)
- Cream-colored muzzle area distinct from body fur
- Visible but subtle fur texture at silhouette edges
- Small round pink paw pads
- Tiny nub tail visible in side/rear views
- Soft cast shadow beneath the body

**Proportions** (approximate at 256×320 canvas):
- Head: ~35% of total height
- Body: ~45% of total height  
- Legs/paws: ~20% of total height
- Width at widest (cheeks/body): ~60% of canvas width

---

## Pose Descriptions

### Idle (front-facing reference)
Standing relaxed, weight even on both feet. Slight head tilt. Neutral happy expression — eyes open, small content smile. Arms/paws at sides or slightly in front. This is THE reference pose — all others must look like the same character.

### Walk Cycle (4 frames, side-facing)
Character faces RIGHT in source art (will be CSS-mirrored for left).
- Frame 1 (contact): Left paw forward touching ground, right paw behind, body tilted slightly forward
- Frame 2 (down): Body at lowest point, both paws underneath, slight squash
- Frame 3 (passing): Right paw forward, left behind, body level
- Frame 4 (up): Body at highest point, slight stretch, pushing off rear paw

### Eating (paws holding food)
Upper body leaned forward slightly. Front paws raised holding a small seed or nut near mouth. Cheeks beginning to puff. Happy focused expression.

### Sleeping (curled)
Genuinely curled into a ball — NOT the standing pose squashed. Eyes peacefully closed. Paws tucked under chin or alongside body. Tail curled around. Ears relaxed/folded slightly. Should read as "sleeping" even at thumbnail size.

### Petted (blissful)
Eyes closed in contentment (happy arcs). Ears lowered and relaxed. Body slightly compressed/melted as if leaning into a stroke. Cheeks slightly squished. Peaceful smile. Should clearly communicate pleasure/relaxation.

### Fallen (on side)
Lying on left side (for fall-left version). Feet visibly off the ground/in the air. Surprised expression — eyes wide, small "o" mouth. NOT a full rotation — just tipped over onto the side. Should look harmless and funny, not painful.

### Dizzy (sitting up after fall)
Sitting up from fallen position. Spiral or unfocused eyes (classic cartoon dizziness). Small stars or circles orbiting the head (can be part of the illustration or added programmatically). Slightly wobbly posture. Expression reads as "confused but fine."

### Annoyed (displeased after repeated taps)
Standing with attitude. Narrowed eyes (one slightly more closed). Ears angled backward. One front paw slightly raised as if stomping. Body turned at a slight angle — giving side-eye to the viewer. Mouth in a small flat line or slight frown. Should be cute-annoyed, not genuinely angry.

---

## Habitat Background

**Scene**: A cozy hamster habitat viewed from the front, like a cross-section of a terrarium/cage.

**Must include** (painted as one cohesive scene):
- Warm-toned back wall (soft beige/cream with subtle texture)
- Sawdust/bedding floor with real texture (not flat)
- An exercise wheel (mounted on right side, looks functional)
- A water bottle (hung from top-right area, with visible water and metal nozzle)
- A food bowl area (lower-left quadrant)
- A cozy nest/bed (far left, soft looking)
- A tunnel or wooden hideout (right side, with dark entrance visible)
- Warm consistent lighting from upper-left
- Soft ambient feel — the room should feel lived-in and cozy

**Style**: Same painterly quality as the character. Props should have depth, shading, and consistent perspective. Everything looks like it belongs in one illustration.

**Dimensions**: 780×560px, opaque, WebP quality 80-85.

---

## Habitat Foreground

**Purpose**: Creates depth by overlapping in front of the character layer.

**Contains**:
- Bedding/sawdust texture at the very bottom (20-30% of height)
- 1-2 small foreground objects (a wood chip, scattered bedding, edge of the habitat frame)
- Soft cast shadow bands where props would cast onto the floor
- Subtle darker vignette at edges for framing

**Dimensions**: 780×560px, transparent (only bottom portion and edges have content, center is see-through so the character shows through).

---

## Generation Prompts (for AI image tools)

### Character reference prompt (adapt as needed):
```
Cute cartoon hamster character for a cozy mobile game. Pear-shaped body, warm caramel fur with cream belly and muzzle. Small pink rounded ears with inner pink. Large expressive dark brown eyes with white highlights. Tiny whiskers. Small pink nose. Soft cel shading with warm lighting from upper left. Slightly textured fur at edges. Gentle cast shadow beneath. Transparent background. Professional quality 2D game character illustration. Front-facing idle standing pose with small content smile. NOT a circle with appendages. NOT flat vector. NOT a logo. Painterly children's game quality.
```

### Habitat prompt (adapt as needed):
```
Cozy illustrated hamster habitat interior, cross-section view. Warm beige walls with soft texture. Sawdust bedding floor with visible texture. Contains: wooden exercise wheel on right, hanging water bottle with metal nozzle, ceramic food bowl lower-left, soft fabric nest/bed far left, wooden tunnel hideout with dark entrance on right. Warm lighting from upper left. Painterly 2D game background style. Cohesive professional illustration. Same art style as a polished indie mobile game. NOT separate icons placed in a box. One unified painted scene. 780x560 pixels.
```

---

## Quality Checklist

Before submitting any artwork, verify:

- [ ] Character is recognizably the same hamster in every pose
- [ ] Fur color is consistent (not different shades between poses)
- [ ] Eye style is consistent (same size, same highlight placement)
- [ ] Outline style is consistent (same weight, same warmth)
- [ ] Lighting direction is consistent (upper-left in all frames)
- [ ] Ground line is consistent (feet at same y-position across poses)
- [ ] Character scale is consistent (not bigger in some poses than others)
- [ ] Canvas is exactly 256×320 for all character poses
- [ ] Background is transparent for all character poses
- [ ] Habitat is exactly 780×560
- [ ] No text, watermarks, or artifacts
- [ ] Reads clearly at 80×100 CSS pixels (phone display size)
- [ ] Sleeping pose is genuinely curled (not standing pose squashed)
- [ ] Walking frames show actual paw movement (not same pose rotated)
- [ ] Fallen pose shows character on its side (not just tilted)
