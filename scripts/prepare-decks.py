"""Prepare the pixel-art DJ decks for the hero.

usage: python3 scripts/prepare-decks.py "NEW dj decks.jpeg" src/assets

Writes (all mostly desaturated, keeping SATURATION of the original colour):
  decks.png            the decks with a transparent background, no shadow
                       underneath, the fader caps painted out (the page draws
                       its own, draggable), stretched 2x wider like a
                       stretched-resolution game
  fader-cap.png        a channel fader cap with its dithered shadow
  crossfader-cap.png   the crossfader cap with its dithered shadow
Coordinates are in the 1024x1040 source; Faders.tsx and Hero.tsx place things
as fractions of the decks' box, so the stretch carries over to them.
Needs ImageMagick (magick).
"""
import os, subprocess, sys, tempfile

src, out_dir = sys.argv[1], sys.argv[2]

def magick(*args):
    subprocess.run(["magick", *map(str, args)], check=True)

# Channel fader columns are identical apart from where the cap sits, so each
# cap is painted out by copying the same stretch from a column where it's clear.
# (x, y, w, h) source box -> (x, y) destination.
CH1, CH3 = 417, 549          # stem centres; ch2 is 484
COL = (-20, 26)              # column span around a stem centre (ticks + cap shadow)
PATCHES = [
    # ch1 and ch2 caps are low: take ch3's clean lower track.
    ((CH3 + COL[0], 684, COL[1] - COL[0], 46), (CH1 + COL[0], 684)),
    ((CH3 + COL[0], 684, COL[1] - COL[0], 46), (484 + COL[0], 684)),
    # ch3's cap is high: take ch1's clean upper track.
    ((CH1 + COL[0], 636, COL[1] - COL[0], 46), (CH3 + COL[0], 636)),
    # Crossfader cap: copy the ticked track from its left (4 tick spacings over).
    ((474, 751, 29, 38), (503, 751)),
]

# Sprites: (crop box, opaque cap rectangle, rows/columns of track to drop).
SPRITES = {
    "fader-cap.png": ((400, 686, 42, 42), (401, 687, 430, 710), ("x", 413, 421)),
    "crossfader-cap.png": ((503, 749, 30, 42), (506, 751, 521, 787), ("y", 769, 776)),
}

# Keep a hint of the art's olive: 30% of its saturation.
SATURATION = 30
GREY = ["-modulate", f"100,{SATURATION}"]

# Below the plinth: feet, the cable tangle, and dithered shadow. The shadow is
# small checker dots: with the alpha made hard, opening it with a 7x7 square
# removes them and keeps the feet and cables, which are thicker. The shadow
# streak trailing down-left from the tangle is cleared outright, then any
# leftover specks are dropped.
BELOW_DECKS = 846
STREAK_TOP = 965 - BELOW_DECKS
SPECK_AREA = 150
STRETCH = (2048, 1040)  # 2x wider, nearest-neighbour so pixels stay crisp

with tempfile.TemporaryDirectory() as tmp:
    clean = os.path.join(tmp, "clean.png")
    magick(src, clean)
    for (sx, sy, w, h), (dx, dy) in PATCHES:
        piece = os.path.join(tmp, "piece.png")
        magick(src, "-crop", f"{w}x{h}+{sx}+{sy}", "+repage", piece)
        magick(clean, piece, "-geometry", f"+{dx}+{dy}", "-composite", clean)
    # White background (and the white between halftone shadow dots) -> transparent.
    cut = os.path.join(tmp, "cut.png")
    magick(clean, "-fuzz", "7%", "-transparent", "white", *GREY, cut)
    # Drop the shadow under the decks.
    alpha, below = os.path.join(tmp, "alpha.png"), os.path.join(tmp, "below.png")
    magick(cut, "-alpha", "extract", alpha)
    magick(alpha, "-crop", f"1024x{1040 - BELOW_DECKS}+0+{BELOW_DECKS}", "+repage",
           "-threshold", "50%", "-morphology", "Open", "Square:3",
           "-fill", "black", "-draw", f"rectangle 0,{925 - BELOW_DECKS} 565,{1040 - BELOW_DECKS}",
           "-draw", f"rectangle 0,{STREAK_TOP} 1024,{1040 - BELOW_DECKS}",
           "-define", f"connected-components:area-threshold={SPECK_AREA}",
           "-define", "connected-components:mean-color=true", "-connected-components", "8", below)
    magick(alpha, below, "-geometry", f"+0+{BELOW_DECKS}", "-composite", alpha)
    magick(cut, alpha, "-alpha", "off", "-compose", "CopyOpacity", "-composite",
           "-filter", "point", "-resize", f"{STRETCH[0]}x{STRETCH[1]}!", "-strip", os.path.join(out_dir, "decks.png"))

    # Each sprite keeps its cap rectangle plus the dark shadow/outline pixels
    # around it, minus the stem, so it can slide over the cleaned track.
    for name, ((x, y, w, h), (cx0, cy0, cx1, cy1), (axis, a0, a1)) in SPRITES.items():
        crop = os.path.join(tmp, "crop.png")
        mask = os.path.join(tmp, "mask.png")
        magick(src, "-crop", f"{w}x{h}+{x}+{y}", "+repage", crop)
        stem = (f"rectangle {a0 - x},0 {a1 - x},{h}" if axis == "x" else f"rectangle 0,{a0 - y} {w},{a1 - y}")
        magick(crop, "-colorspace", "gray", "-threshold", "18%", "-negate",
               "-fill", "black", "-draw", stem,
               "-fill", "white", "-draw", f"rectangle {cx0 - x},{cy0 - y} {cx1 - x},{cy1 - y}", mask)
        magick(crop, mask, "-alpha", "off", "-compose", "CopyOpacity", "-composite", *GREY, "-strip", os.path.join(out_dir, name))

print("wrote decks.png, fader-cap.png, crossfader-cap.png")
