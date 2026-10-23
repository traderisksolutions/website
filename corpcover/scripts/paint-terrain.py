# Impasto terrains for page heroes, after Werner Bronkhorst: flat greens laid with a palette knife,
# lit from the top left, a few tiny figures. Code-drawn and deterministic.
# Usage: python3 scripts/paint-terrain.py <terrain> <out.webp>   terrain: forest|jungle|football|tennis|golf|light
import sys, math, numpy as np
from PIL import Image, ImageDraw, ImageFilter

KIND, OUT = sys.argv[1], sys.argv[2]
W, H = (2000, 2000) if KIND == "light" else (2400, 1300)
rng = np.random.default_rng({"forest": 11, "jungle": 23, "football": 5, "tennis": 41, "golf": 17, "light": 3}[KIND])
hex2 = lambda h: np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float)

col = np.zeros((H, W, 3)); hgt = np.zeros((H, W))

def stroke(x, y, ang, L, w, c, thick=1.0, bend=None):
    """One knife swipe: flat band with streaks, ridged edges, paint piled at the end."""
    ca, sa = math.cos(ang), math.sin(ang)
    r = int(L + w) + 4
    x0, x1, y0, y1 = max(0, int(x - r)), min(W, int(x + r)), max(0, int(y - r)), min(H, int(y + r))
    if x0 >= x1 or y0 >= y1: return
    yy, xx = np.mgrid[y0:y1, x0:x1]
    dx, dy = xx - x, yy - y
    u = dx * ca + dy * sa           # along the stroke
    v = -dx * sa + dy * ca          # across
    bend = rng.normal(0, .18) if bend is None else bend
    v = v - bend * np.clip(u, 0, None)**2 / max(L, 1)          # the knife curves
    half = (w / 2) * (.72 + .28 * np.clip(u / (.3 * L + 1), 0, 1))  # tapered start
    s = v / half
    n = max(4, int(w / 3))
    streak = np.interp(s, np.linspace(-1, 1, n), rng.normal(0, 1, n))
    end = L * (1 - .1 * np.abs(np.interp(s, np.linspace(-1, 1, 6), rng.random(6))))
    m = np.clip((1 - np.abs(s)) * half / 1.5, 0, 1) * np.clip(u / 3 + 1, 0, 1) * np.clip((end - u) / 2, 0, 1)
    if not m.any(): return
    h = thick * (.55 + .35 * (1 - s**2) + .08 * streak + .5 * np.exp(-((np.abs(s) - .92) / .09)**2)
                 + .9 * np.exp(-((u - end) / (.05 * L + 3))**2) - .25 * np.clip(1 - u / (.15 * L + 1), 0, 1))
    shade = 1 + .035 * streak
    sl = (slice(y0, y1), slice(x0, x1))
    hgt[sl] = hgt[sl] * (1 - m) + m * (h + .25 * hgt[sl])
    col[sl] = col[sl] * (1 - m[..., None]) + m[..., None] * (c * shade[..., None])

def jit(c, a=10): return np.clip(hex2(c) + rng.normal(0, a, 3), 0, 255)
def scatter(n, pal, Lr, wr, angf, region=None, thick=1.0, a=8):
    for _ in range(n):
        x, y = rng.uniform(-60, W + 60), rng.uniform(-60, H + 60)
        if region and not region(x, y): continue
        stroke(x, y, angf(x, y), rng.uniform(*Lr), rng.uniform(*wr), jit(pal[rng.integers(len(pal))], a), thick)

figures = []
if KIND == "forest":
    col[:] = hex2("#14361f")
    pal = ["#123320", "#163a23", "#1a4127", "#1e482a", "#24502e", "#10301d"]
    a = lambda x, y: rng.normal(-1.1, .35)
    scatter(420, pal, (320, 720), (110, 220), a, a=4); scatter(650, pal, (140, 320), (50, 100), a, a=4); scatter(300, pal + ["#2f5e33", "#386a36"], (60, 160), (20, 40), a, a=4)
elif KIND == "jungle":
    col[:] = hex2("#123d26")
    pal = ["#0f3a24", "#144529", "#1a5230", "#215d33", "#0f4436", "#2a6a35"]
    a = lambda x, y: rng.choice([-.8, -2.3, -.2]) + rng.normal(0, .3)
    for _ in range(420): stroke(rng.uniform(-60, W + 60), rng.uniform(-60, H + 60), a(0, 0), rng.uniform(300, 700), rng.uniform(110, 220), jit(pal[rng.integers(len(pal))], 4), 1.0, rng.normal(0, .5))
    for _ in range(700): stroke(rng.uniform(-60, W + 60), rng.uniform(-60, H + 60), a(0, 0), rng.uniform(140, 320), rng.uniform(45, 100), jit(pal[rng.integers(len(pal))], 4), 1.0, rng.normal(0, .55))
    scatter(260, pal + ["#3c7a36", "#4b8a38"], (80, 200), (25, 50), a, a=4)
elif KIND == "football":
    sw = W / 9
    light, dark = ["#3c9a3b", "#44a442", "#379236"], ["#2c7f30", "#31873a", "#287a2c"]
    for i in range(10):
        pal = light if i % 2 else dark
        col[:, int(i * sw):int((i + 1) * sw)] = hex2(pal[0])
        inside = lambda x, y, i=i: i * sw - 10 < x < (i + 1) * sw + 10
        vert = lambda x, y: -math.pi / 2 + rng.normal(0, .06)
        scatter(260, pal, (260, 560), (sw * .7, sw * 1.05), vert, inside, a=3)
        scatter(160, pal, (100, 240), (40, 90), vert, inside, a=4)
    stroke(W * .78, -40, math.pi / 2, H + 80, 16, hex2("#eef2e8"), 1.4, 0)
    stroke(W * .78 - H * .05, H * .2, math.pi / 2 + .55, H * .62, 15, hex2("#eef2e8"), 1.3, bend=-.42)
    figures = [(W * .62, H * .38, "#f2f2ee"), (W * .7, H * .62, "#f2f2ee"), (W * .86, H * .3, "#1a1a1a"), (W * .9, H * .7, "#1a1a1a"), (W * .66, H * .82, "#f2f2ee")]
elif KIND == "tennis":
    col[:] = hex2("#1d5232")
    surround = ["#1d5232", "#215a37", "#184a2c", "#25603a"]
    scatter(600, surround, (260, 600), (90, 180), lambda x, y: rng.normal(.2, .25), a=6)
    cx0, cx1, cy0, cy1 = W * .7, W * 1.1, -H * .08, H * .56
    court = ["#3f8a4f", "#468f55", "#3a8049"]
    inside = lambda x, y: cx0 + 20 < x < cx1 and cy0 + 20 < y < cy1 - 20
    scatter(1200, court, (240, 520), (70, 140), lambda x, y: rng.normal(0, .05), inside, a=3)
    white = hex2("#b9d8b0")
    for yy in (cy0, cy1, cy0 + (cy1 - cy0) * .12, cy1 - (cy1 - cy0) * .12):
        stroke(cx0, yy, 0, cx1 - cx0, 15, white, 1.4, 0)
    for xx, a0, a1 in ((cx0, cy0, cy1), (cx0 + (cx1 - cx0) * .42, cy0 + (cy1 - cy0) * .12, cy1 - (cy1 - cy0) * .12)):
        stroke(xx, a0, math.pi / 2, a1 - a0, 15, white, 1.4, 0)
    stroke(cx0 + (cx1 - cx0) * .42, (cy0 + cy1) / 2, 0, (cx1 - cx0) * .6, 13, white, 1.4, 0)
    figures = [(W * .8, H * .2, "#f2f2ee"), (W * .97, H * .42, "#f2f2ee")]
elif KIND == "golf":
    col[:] = hex2("#1f5a2c")
    rough = ["#1a5028", "#1f5a2c", "#246330", "#2c6c34", "#184824"]
    scatter(600, rough, (300, 680), (100, 200), lambda x, y: rng.normal(-.6, .3), a=4)
    scatter(500, rough, (120, 280), (40, 80), lambda x, y: rng.normal(-.6, .35), a=4)
    fair = ["#8cc63f", "#9bd04a", "#84bd3a", "#a6d655"]
    band = lambda x, y: abs((y - H * .95) + (x - W * .2) * .55 - 80 * math.sin(x / 260)) < 170
    scatter(1400, fair, (240, 520), (80, 150), lambda x, y: -.5 + rng.normal(0, .1), band, a=3)
    green = lambda x, y: (x - W * .82)**2 / 1.6 + (y - H * .24)**2 < 150**2
    scatter(500, ["#b2de66", "#a6d655"], (60, 160), (30, 60), lambda x, y: rng.normal(.3, .2), green, a=4)
    bunker = lambda x, y: (x - W * .66)**2 / 2.2 + (y - H * .5)**2 < 70**2
    scatter(260, ["#e9d4a6", "#f0dcb2", "#dfc797"], (40, 110), (20, 45), lambda x, y: rng.normal(.2, .4), bunker, a=4)
    figures = [(W * .6, H * .66, "#f2f2ee"), (W * .63, H * .64, "#1a1a1a"), (W * .8, H * .27, "#f2f2ee"), (W * .45, H * .82, "#f2f2ee")]
elif KIND == "light":
    col[:] = hex2("#d5e6ac")
    pal = ["#d3e5a8", "#d8e8b2", "#cee1a0", "#dcebba", "#c9de98"]
    a = lambda x, y: rng.normal(-.6, .4)
    scatter(600, pal, (360, 760), (120, 240), a, a=3, thick=.6); scatter(800, pal, (150, 340), (50, 110), a, a=3, thick=.6)

# Light the paint
h = np.asarray(Image.fromarray((np.clip(hgt, 0, 4) * 60).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.1)), float) / 60
gy, gx = np.gradient(h)
k = 2.2 if KIND == "light" else 3.2
nx, ny, nz = -gx * k, -gy * k, np.ones_like(h)
nl = np.sqrt(nx**2 + ny**2 + 1)
L = np.array([-.55, -.6, .58]); L /= np.linalg.norm(L)
diff = (nx * L[0] + ny * L[1] + nz * L[2]) / nl
spec = np.clip(diff, 0, 1)**28 * (.25 if KIND == "light" else .35)
img = col * (.62 + .5 * diff)[..., None] + 255 * spec[..., None]
img += rng.normal(0, 3, (H, W, 1))
out = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))

# Tiny figures with cast shadows
d = ImageDraw.Draw(out, "RGBA")
for fx, fy, fc in figures:
    d.ellipse([fx + 2, fy + 9, fx + 22, fy + 14], fill=(0, 0, 0, 70))
    d.rounded_rectangle([fx - 3, fy - 4, fx + 3, fy + 10], 2, fill=(*hex2(fc).astype(int), 255))
    d.ellipse([fx - 2.6, fy - 10, fx + 2.6, fy - 4.8], fill=(214, 176, 140, 255))
out.save(OUT, "WEBP", quality=80, method=6)
