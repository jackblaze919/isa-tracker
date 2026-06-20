#!/usr/bin/env python3
"""
Hammy Art Asset Validator
Checks supplied artwork files for correct naming, dimensions,
transparency, file size, and consistency.

Usage: python3 validate-assets.py [--strict]
  --strict: Fail on warnings (oversized files, etc.)

Run from the isa-tracker/ directory.
"""
import os, sys, struct, json

ASSETS_DIR = "assets/hammy"
POSES_DIR = os.path.join(ASSETS_DIR, "poses")
HABITAT_DIR = os.path.join(ASSETS_DIR, "habitat")

# Expected character pose dimensions
CHAR_WIDTH = 256
CHAR_HEIGHT = 320
CHAR_MAX_SIZE_KB = 50

# Expected habitat dimensions
HABITAT_WIDTH = 780
HABITAT_HEIGHT = 560
HABITAT_BG_MAX_SIZE_KB = 120
HABITAT_FG_MAX_SIZE_KB = 80

# Minimum approval set
MINIMUM_SET = [
    "poses/hammy-idle.webp",
    "poses/hammy-walk-1.webp",
    "poses/hammy-walk-2.webp",
    "poses/hammy-walk-3.webp",
    "poses/hammy-walk-4.webp",
    "poses/hammy-eat-1.webp",
    "poses/hammy-sleep.webp",
    "poses/hammy-petted.webp",
    "poses/hammy-fall-left.webp",
    "poses/hammy-dizzy.webp",
    "poses/hammy-annoyed.webp",
    "habitat/habitat-background.webp",
    "habitat/habitat-foreground.webp",
]

# Full character pose set
ALL_POSES = [
    "hammy-idle.webp", "hammy-look-left.webp", "hammy-look-right.webp",
    "hammy-walk-1.webp", "hammy-walk-2.webp", "hammy-walk-3.webp", "hammy-walk-4.webp",
    "hammy-sit.webp", "hammy-sniff.webp",
    "hammy-groom-1.webp", "hammy-groom-2.webp",
    "hammy-eat-1.webp", "hammy-eat-2.webp", "hammy-eat-3.webp",
    "hammy-drink.webp", "hammy-sleep.webp", "hammy-wake.webp",
    "hammy-wheel-1.webp", "hammy-wheel-2.webp",
    "hammy-workout-1.webp", "hammy-workout-2.webp",
    "hammy-petted.webp",
    "hammy-shove-left.webp", "hammy-shove-right.webp",
    "hammy-fall-left.webp", "hammy-fall-right.webp",
    "hammy-dizzy.webp", "hammy-annoyed.webp",
    "hammy-shake-off.webp", "hammy-recover.webp",
    "hammy-celebrate.webp", "hammy-wait-bowl.webp",
    "hammy-tunnel-enter.webp", "hammy-tunnel-exit.webp",
]

ALL_HABITAT = [
    "habitat-background.webp",
    "habitat-foreground.webp",
]


def get_webp_dimensions(filepath):
    """Read WebP file dimensions from header."""
    try:
        with open(filepath, "rb") as f:
            header = f.read(30)
            if header[:4] != b'RIFF' or header[8:12] != b'WEBP':
                return None, None, False
            
            chunk_type = header[12:16]
            
            if chunk_type == b'VP8 ':
                # Lossy WebP
                # Width and height at bytes 26-29 (little-endian 16-bit each)
                if len(header) >= 30:
                    w = struct.unpack_from('<H', header, 26)[0] & 0x3FFF
                    h = struct.unpack_from('<H', header, 28)[0] & 0x3FFF
                    return w, h, False  # Lossy VP8 doesn't have alpha
            
            elif chunk_type == b'VP8L':
                # Lossless WebP
                signature = header[21]
                if signature != 0x2F:
                    return None, None, False
                bits = struct.unpack_from('<I', header, 22)[0]
                w = (bits & 0x3FFF) + 1
                h = ((bits >> 14) & 0x3FFF) + 1
                has_alpha = bool((bits >> 28) & 1)
                return w, h, has_alpha
            
            elif chunk_type == b'VP8X':
                # Extended WebP
                flags = header[20]
                has_alpha = bool(flags & 0x10)
                w = struct.unpack_from('<I', header[24:27] + b'\x00', 0)[0] + 1
                h = struct.unpack_from('<I', header[27:30] + b'\x00', 0)[0] + 1
                return w, h, has_alpha
            
            return None, None, False
    except Exception as e:
        return None, None, False


def try_pillow_dimensions(filepath):
    """Fallback: use Pillow if available."""
    try:
        from PIL import Image
        img = Image.open(filepath)
        w, h = img.size
        has_alpha = img.mode in ('RGBA', 'LA', 'PA')
        return w, h, has_alpha
    except ImportError:
        return None, None, None
    except Exception:
        return None, None, None


def get_dimensions(filepath):
    """Get dimensions, trying header parsing first, then Pillow."""
    w, h, alpha = get_webp_dimensions(filepath)
    if w is None:
        w, h, alpha = try_pillow_dimensions(filepath)
    return w, h, alpha


def validate():
    strict = "--strict" in sys.argv
    errors = []
    warnings = []
    passed = []
    
    # Check directory structure
    if not os.path.isdir(ASSETS_DIR):
        errors.append(f"Missing directory: {ASSETS_DIR}")
        print_results(passed, warnings, errors)
        return len(errors) > 0
    
    # Check minimum approval set
    print("=" * 60)
    print("HAMMY ART ASSET VALIDATION")
    print("=" * 60)
    print(f"\nChecking minimum approval set ({len(MINIMUM_SET)} files)...\n")
    
    min_found = 0
    min_missing = []
    
    for rel_path in MINIMUM_SET:
        full_path = os.path.join(ASSETS_DIR, rel_path)
        if os.path.isfile(full_path):
            min_found += 1
            passed.append(f"Found: {rel_path}")
        else:
            min_missing.append(rel_path)
    
    if min_missing:
        errors.append(f"Missing {len(min_missing)} minimum-set files:")
        for m in min_missing:
            errors.append(f"  - {m}")
    else:
        passed.append(f"All {len(MINIMUM_SET)} minimum-set files present")
    
    # Validate each found file
    print(f"\nValidating file properties...\n")
    
    # Character poses
    pose_files = [f for f in os.listdir(POSES_DIR) if f.endswith('.webp')] if os.path.isdir(POSES_DIR) else []
    
    for filename in pose_files:
        filepath = os.path.join(POSES_DIR, filename)
        size_kb = os.path.getsize(filepath) / 1024
        
        # Check dimensions
        w, h, has_alpha = get_dimensions(filepath)
        
        if w is not None and h is not None:
            if w == CHAR_WIDTH and h == CHAR_HEIGHT:
                passed.append(f"{filename}: {w}×{h} ✓")
            else:
                errors.append(f"{filename}: Expected {CHAR_WIDTH}×{CHAR_HEIGHT}, got {w}×{h}")
        else:
            warnings.append(f"{filename}: Could not read dimensions (install Pillow for full validation)")
        
        # Check transparency
        if has_alpha is not None:
            if has_alpha:
                passed.append(f"{filename}: Has alpha channel ✓")
            else:
                errors.append(f"{filename}: Missing alpha channel (must be transparent background)")
        
        # Check file size
        if size_kb > CHAR_MAX_SIZE_KB:
            warnings.append(f"{filename}: {size_kb:.1f}KB exceeds {CHAR_MAX_SIZE_KB}KB target")
        else:
            passed.append(f"{filename}: {size_kb:.1f}KB ✓")
        
        # Check naming convention
        if filename not in ALL_POSES:
            warnings.append(f"{filename}: Not in expected pose list (typo?)")
    
    # Habitat files
    habitat_files = [f for f in os.listdir(HABITAT_DIR) if f.endswith('.webp')] if os.path.isdir(HABITAT_DIR) else []
    
    for filename in habitat_files:
        filepath = os.path.join(HABITAT_DIR, filename)
        size_kb = os.path.getsize(filepath) / 1024
        
        w, h, has_alpha = get_dimensions(filepath)
        
        if w is not None and h is not None:
            if w == HABITAT_WIDTH and h == HABITAT_HEIGHT:
                passed.append(f"{filename}: {w}×{h} ✓")
            else:
                errors.append(f"{filename}: Expected {HABITAT_WIDTH}×{HABITAT_HEIGHT}, got {w}×{h}")
        
        # Background should be opaque, foreground should have alpha
        if filename == "habitat-background.webp":
            max_size = HABITAT_BG_MAX_SIZE_KB
            # Opaque is fine (no alpha required)
        elif filename == "habitat-foreground.webp":
            max_size = HABITAT_FG_MAX_SIZE_KB
            if has_alpha is not None and not has_alpha:
                errors.append(f"{filename}: Must have alpha channel for transparency")
        else:
            max_size = HABITAT_BG_MAX_SIZE_KB
        
        if size_kb > max_size:
            warnings.append(f"{filename}: {size_kb:.1f}KB exceeds {max_size}KB target")
        else:
            passed.append(f"{filename}: {size_kb:.1f}KB ✓")
    
    # Check for unexpected files
    all_expected = set(ALL_POSES + ALL_HABITAT)
    all_found = set(pose_files + habitat_files)
    unexpected = all_found - all_expected
    if unexpected:
        for u in unexpected:
            warnings.append(f"Unexpected file: {u}")
    
    # Summary: which full-set poses are still missing
    missing_full = [p for p in ALL_POSES if p not in pose_files]
    if missing_full and min_found == len(MINIMUM_SET):
        print(f"\nFull set progress: {len(pose_files)}/{len(ALL_POSES)} poses")
        print(f"Still needed: {', '.join(missing_full[:10])}")
        if len(missing_full) > 10:
            print(f"  ... and {len(missing_full)-10} more")
    
    print_results(passed, warnings, errors)
    
    if strict:
        return len(errors) + len(warnings) > 0
    return len(errors) > 0


def print_results(passed, warnings, errors):
    print("\n" + "=" * 60)
    print(f"✅ PASSED: {len(passed)}")
    print(f"⚠️  WARNINGS: {len(warnings)}")
    print(f"❌ ERRORS: {len(errors)}")
    print("=" * 60)
    
    if errors:
        print("\n❌ ERRORS:")
        for e in errors:
            print(f"   {e}")
    
    if warnings:
        print("\n⚠️  WARNINGS:")
        for w in warnings:
            print(f"   {w}")
    
    if not errors and not warnings:
        print("\n🎉 All validations passed!")
    
    print()


if __name__ == "__main__":
    has_errors = validate()
    sys.exit(1 if has_errors else 0)
