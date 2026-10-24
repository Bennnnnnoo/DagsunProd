"""Split the traced artwork into layers for the hero.

usage: python3 scripts/split-art.py "SVG IMAGE.svg" src/assets/art [--tint]

Writes into the output directory:
  speaker.svg, speaker-dark.svg      the cabinet (static)
  driver-1.svg ... driver-N.svg      each speaker cone, pumped on the kick
  character.svg, character-dark.svg  the figure and staff
  zoom.png, zoom-dark.png            everything flattened, for the /events zoom
  drivers.ts                         cone images, centres and strengths for the page
Dark variants redraw the ground shadows as a white halftone and turn paper-white
pockets black. --tint colours layers flat to check the split.
Needs rsvg-convert and ImageMagick (magick).
"""
import base64, colorsys, math, os, re, subprocess, sys, tempfile

src_path, out_dir = sys.argv[1], sys.argv[2]
tint = "--tint" in sys.argv
src = open(src_path).read()
paths = re.findall(r'<path\b([^>]*)>\s*</path>', src, re.S)

SPEAKER_RIGHT_EDGE = 590            # x (of 1024) where the speaker stack ends
STAFF = ((295, 885), (650, 540))    # staff/arm diagonal crossing the speaker
STAFF_HALF_WIDTH = 26

# Cast shadows on the ground (image coords): left of the speaker, under the
# robe, and the streak running down-left from the feet.
SHADOWS = [
    [(0, 795), (155, 790), (155, 905), (215, 1010), (85, 1010), (0, 870)],
    [(860, 830), (1010, 830), (1010, 930), (790, 930), (790, 905), (860, 895)],
    [(600, 900), (690, 895), (690, 935), (450, 1025), (355, 1025), (355, 1000), (560, 925)],
]
# Dark theme redraws the shadows as a clean halftone: left shadow sits in the
# speaker layer, the others in the character layer (behind the speaker).
SHADOW_LAYER = ["speaker", "character", "character"]
HALFTONE_SPACING = 6.5   # px between dot centres, on a 45-degree grid
HALFTONE_BLUR = 6        # px; smooths the traced shadow into a density field
HALFTONE_COLOUR = "#CFCFCF"
POCKET_MIN_AREA = 400  # near-white shapes this big in the character are paper, not highlights

# The traced art has no speaker under the staff, so the speaker layer has a
# staff-shaped hole that opens up when the speaker thumps. Fill it with the
# speaker's own surrounding colours (a raster patch spread inward from the hole's
# edges), masked to the staff area and kept inside the cabinet.
CABINET = [(60, 300), (190, 100), (505, 280), (552, 535), (582, 745), (568, 990), (300, 1025), (150, 895), (100, 420)]
PATCH_BOX = (250, 500, 420, 420)  # x, y, w, h around the staff; the patch is only this big
PATCH_GROW = 24  # mask stroke width; covers ~9px of movement at the staff's tip

# Speaker cones (image px): centre, radii, and how hard each one pumps.
DRIVERS = [
    {"cx": 308, "cy": 340, "rx": 83, "ry": 140, "strength": 1.0},   # top-left woofer
    {"cx": 460, "cy": 395, "rx": 70, "ry": 120, "strength": 1.0},   # top-right woofer
    {"cx": 320, "cy": 648, "rx": 65, "ry": 103, "strength": 0.8},   # middle cone
    {"cx": 503, "cy": 645, "rx": 40, "ry": 75, "strength": 0.55},   # middle small cone
    {"cx": 320, "cy": 868, "rx": 65, "ry": 103, "strength": 0.8},   # bottom cone
    {"cx": 510, "cy": 855, "rx": 45, "ry": 85, "strength": 0.6},    # bottom small cone
]

def driver_of(x0, y0, x1, y1):
    """Index of the cone that wholly contains this bounding box, else None."""
    for n, d in enumerate(DRIVERS):
        corners = ((x0, y0), (x1, y0), (x0, y1), (x1, y1))
        # 6% margin so each cone's outer rim moves with it.
        if all(((x - d["cx"]) / d["rx"]) ** 2 + ((y - d["cy"]) / d["ry"]) ** 2 <= 1.06 ** 2 for x, y in corners):
            return n
    return None

def inside(px, py, poly):
    hit = False
    for (ax, ay), (bx, by) in zip(poly, poly[1:] + poly[:1]):
        if (ay > py) != (by > py) and px < ax + (py - ay) * (bx - ax) / (by - ay):
            hit = not hit
    return hit

def seg_dist(px, py, a, b):
    (ax, ay), (bx, by) = a, b
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))

def compact(d):
    # Round to 0.1px and collapse whitespace: same shape, far smaller file.
    d = re.sub(r'-?\d+\.\d+', lambda m: ('%.1f' % float(m.group())).rstrip('0').rstrip('.'), d)
    return re.sub(r'\s+', ' ', d).strip()

W, H = 1024, 1040
SVG_OPEN = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">'

def render_gray(svg_body, background, ops):
    """Rasterise SVG content and return a W*H list of 0-255 values after ImageMagick ops."""
    with tempfile.TemporaryDirectory() as tmp:
        svg, png, pgm = (os.path.join(tmp, n) for n in ("in.svg", "in.png", "out.pgm"))
        open(svg, "w").write(SVG_OPEN + f'<rect width="{W}" height="{H}" fill="{background}"/>' + svg_body + "</svg>")
        subprocess.run(["rsvg-convert", "-w", str(W), "-h", str(H), svg, "-o", png], check=True)
        subprocess.run(["magick", png, "-colorspace", "gray", *ops, "-depth", "8", pgm], check=True)
        data = open(pgm, "rb").read()
    return data[len(data) - W * H:]

def halftone(shadow_paths, blocker_paths):
    """Clean halftone dots following the traced shadow's darkness."""
    density = render_gray("".join(shadow_paths), "#FFF", ["-negate", "-blur", f"0x{HALFTONE_BLUR}"])
    blocked = render_gray("".join(blocker_paths), "#FFF", ["-negate"]) if blocker_paths else None
    dots = []
    step = HALFTONE_SPACING / math.sqrt(2)
    max_r = HALFTONE_SPACING * 0.36  # dots never touch, even in the darkest areas
    rows = int(H / step) + 1
    for j in range(rows):
        y = j * step
        for i in range(int(W / HALFTONE_SPACING) + 2):
            x = i * HALFTONE_SPACING + (HALFTONE_SPACING / 2 if j % 2 else 0)
            if x >= W or y >= H:
                continue
            k = int(y) * W + int(x)
            if blocked and blocked[k] > 128:
                continue
            v = max(0.0, (density[k] / 255 - 0.12) / 0.8)
            r = max_r * math.sqrt(min(v, 1.0))
            if r >= 0.45:
                dots.append(f"M{x - r:.1f} {y:.1f}a{r:.2f} {r:.2f} 0 1 0 {2 * r:.2f} 0a{r:.2f} {r:.2f} 0 1 0 {-2 * r:.2f} 0")
    return f'<path fill="{HALFTONE_COLOUR}" d="{"".join(dots)}"/>', len(dots)

layers = {"speaker": [], "character": [], "speaker-dark": [], "character-dark": []}
layers.update({f"driver-{n + 1}": [] for n in range(len(DRIVERS))})
speaker_all = []  # cabinet + cones, as drawn in the original
shadow_src = {"speaker": [], "character": []}
underpaint = []
for i, attrs in enumerate(paths):
    if i == 0:
        continue  # full-canvas white background
    fill = re.search(r'fill="#([0-9A-Fa-f]{6})"', attrs).group(1)
    d = re.search(r'\bd="([^"]*)"', attrs, re.S).group(1)
    nums = list(map(float, re.findall(r'-?\d+\.?\d*', d)))
    xs, ys = nums[0::2], nums[1::2]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    w, h = max(xs) - min(xs), max(ys) - min(ys)

    r, g, b = (int(fill[k:k + 2], 16) / 255 for k in (0, 2, 4))
    hue, light, sat = colorsys.rgb_to_hls(r, g, b)
    warm = 15 / 360 <= hue <= 60 / 360 and sat > 0.25 and 0.12 < light < 0.92

    # The cones are warm-toned too, so only warm shapes along the staff count as character.
    staff_dist = seg_dist(cx, cy, *STAFF)
    on_staff = (staff_dist < STAFF_HALF_WIDTH and w < 90 and h < 90) or (warm and staff_dist < 60)
    is_speaker = cx < SPEAKER_RIGHT_EDGE and not on_staff

    layer = "speaker" if is_speaker else "character"
    shadow_poly = next((n for n, poly in enumerate(SHADOWS) if inside(cx, cy, poly)), None) if sat < 0.35 else None
    pocket = not is_speaker and min(r, g, b) >= 0.92 and w * h > POCKET_MIN_AREA

    driver = driver_of(min(xs), min(ys), max(xs), max(ys)) if is_speaker else None

    path = compact(d)
    colour = "#" + fill.upper()
    if tint:
        colour = "#2b2" if shadow_poly is not None else ("#d2d" if driver is not None else ("#d22" if is_speaker else "#22d"))
    element = f'<path fill="{colour}" d="{path}"/>'
    if is_speaker:
        speaker_all.append(element)
    if layer == "character" and cx < SPEAKER_RIGHT_EDGE:
        underpaint.append(path)
    if driver is not None:
        layers[f"driver-{driver + 1}"].append(element)  # same in both themes
        continue
    layers[layer].append(element)

    if shadow_poly is not None:
        # Dropped from dark; redrawn as halftone below.
        shadow_src[SHADOW_LAYER[shadow_poly]].append(f'<path fill="{colour}" d="{path}"/>')
        continue
    dark = "#000000" if pocket and not tint else colour
    layers[layer + "-dark"].append(f'<path fill="{dark}" d="{path}"/>')

# Halftone goes first so the art covers it; character-layer shadow skips
# anywhere the speaker is drawn, so it reads as behind the cabinet.
speaker_cover = layers["speaker-dark"] + [p for n in range(len(DRIVERS)) for p in layers[f"driver-{n + 1}"]]
for name in ("speaker", "character"):
    dots, count = halftone(shadow_src[name], speaker_cover if name == "character" else None)
    layers[name + "-dark"].insert(0, dots)
    print(name, "halftone dots:", count)

def hole_patch(speaker_paths):
    """PNG of the speaker around the staff with its holes filled from the edges inward."""
    x, y, w, h = PATCH_BOX
    with tempfile.TemporaryDirectory() as tmp:
        svg, png = os.path.join(tmp, "s.svg"), os.path.join(tmp, "s.png")
        open(svg, "w").write(SVG_OPEN + "".join(speaker_paths) + "</svg>")
        subprocess.run(["rsvg-convert", "-w", str(W), "-h", str(H), svg, "-o", png], check=True)
        # Pull-push fill: lay the image over ever-blurrier copies of itself, so
        # each transparent pixel takes the colour of the nearest painted ones.
        cur = os.path.join(tmp, "cur.png")
        subprocess.run(["magick", png, "-crop", f"{w}x{h}+{x}+{y}", "+repage", cur], check=True)
        for radius in (2, 4, 8, 16, 32):
            blurred = os.path.join(tmp, "blur.png")
            subprocess.run(["magick", cur, "-channel", "RGBA", "-blur", f"0x{radius}",
                            "-channel", "A", "-level", "0,10%", "+channel", blurred], check=True)
            subprocess.run(["magick", blurred, cur, "-composite", cur], check=True)
        subprocess.run(["magick", cur, "-background", "#1C1C1E", "-flatten", "-strip", cur], check=True)
        return base64.b64encode(open(cur, "rb").read()).decode()

cabinet = "M" + " L".join(f"{px} {py}" for px, py in CABINET) + "Z"
px, py, pw, ph = PATCH_BOX
patch = hole_patch(speaker_all)
fill_gap = (f'<defs><clipPath id="cabinet"><path d="{cabinet}"/></clipPath>'
            f'<mask id="staff" maskUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}">'
            f'<path fill="#fff" stroke="#fff" stroke-width="{PATCH_GROW}" stroke-linejoin="round" d="{"".join(underpaint)}"/></mask></defs>'
            f'<g clip-path="url(#cabinet)"><image mask="url(#staff)" x="{px}" y="{py}" width="{pw}" height="{ph}" '
            f'href="data:image/png;base64,{patch}"/></g>')
for name in ("speaker", "speaker-dark"):
    layers[name].insert(0, fill_gap)
print("hole patch:", round(len(patch) * 3 / 4 / 1024), "KB from", len(underpaint), "staff shapes")

for name, items in layers.items():
    svg = SVG_OPEN + "".join(items) + "</svg>"
    open(f"{out_dir}/{name}.svg", "w").write(svg)
    print(name, len(items), "paths", round(len(svg) / 1024), "KB")

ts = ["// Generated by scripts/split-art.py. Do not edit by hand.", ""]
ts += [f'import driver{n + 1} from "./driver-{n + 1}.svg";' for n in range(len(DRIVERS))]
ts += ["", "/** Speaker cones: image, centre as a fraction of the artwork, and kick strength. */",
       "export const drivers = ["]
ts += [f'  {{ src: driver{n + 1}, x: {d["cx"] / W:.4f}, y: {d["cy"] / H:.4f}, strength: {d["strength"]} }},'
       for n, d in enumerate(DRIVERS)]
ts += ["];", ""]
open(f"{out_dir}/drivers.ts", "w").write("\n".join(ts))

# Flat raster of the whole artwork (cabinet, cones, character), for zooming:
# scaling ~10k SVG shapes to 300x is far too slow, scaling one image is cheap.
with tempfile.TemporaryDirectory() as tmp:
    for suffix in ("", "-dark"):
        parts = [f"speaker{suffix}"] + [f"driver-{n + 1}" for n in range(len(DRIVERS))] + [f"character{suffix}"]
        pngs = []
        for part in parts:
            png = os.path.join(tmp, f"{part}.png")
            subprocess.run(["rsvg-convert", "-w", str(W), "-h", str(H), f"{out_dir}/{part}.svg", "-o", png], check=True)
            pngs.append(png)
        out = f"{out_dir}/zoom{suffix}.png"
        # The traced art is flat colour, so a 256-colour palette loses next to nothing.
        subprocess.run(["magick", "-size", f"{W}x{H}", "xc:none", *[a for p in pngs for a in (p, "-composite")],
                        "-dither", "None", "-colors", "256", "-strip", f"PNG8:{out}"], check=True)
        print(f"zoom{suffix}.png", round(os.path.getsize(out) / 1024), "KB")
