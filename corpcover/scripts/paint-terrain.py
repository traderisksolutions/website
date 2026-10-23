# Page grounds: the home page's grass technique (scripts/paint-hero-grass.py) with colour schemes taken
# from Werner Bronkhorst's green paintings. Each terrain = a base palette plus soft zones (stripes, fairway,
# worn court) in a second palette. Deterministic.
# Usage: python3 scripts/paint-terrain.py <forest|jungle|football|tennis|golf|light> <out.webp>
import sys, numpy as np
from PIL import Image, ImageDraw, ImageFilter

KIND, OUT = sys.argv[1], sys.argv[2]
W, H = (2000, 2000) if KIND == "light" else (2400, 1400)
rng = np.random.default_rng({"forest": 11, "jungle": 23, "football": 5, "tennis": 41, "golf": 17, "light": 3}[KIND])

def noise(scale, oct=4):
    acc = np.zeros((H, W)); amp = 1; tot = 0
    for o in range(oct):
        s = max(2, int(scale * 2**o))
        g = rng.random((s + 1, int(s * W / H) + 2))
        im = Image.fromarray((g * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
        acc += amp * np.asarray(im, float) / 255; tot += amp; amp *= .5
    return acc / tot

def smooth(a, e0, e1):
    t = np.clip((a - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)
P = lambda *c: np.array(c, float)  # dark, mid, lit, tip

y, x = np.mgrid[0:H, 0:W] / H
X = x / (W / H)  # 0..1 across
hills = (np.sin(x * 2.1 + y * 3.4) * .55 + np.sin(x * 4.3 - y * 1.7 + 1.3) * .3
         + np.sin(x * 1.1 + y * 6.2 + .4) * .25 + (noise(2, 2) - .5) * .5)
relief = .35
zones = []   # (palette, mask)
if KIND == "forest":
    base = P([5, 20, 12], [24, 62, 30], [70, 118, 46], [138, 170, 82])
elif KIND == "jungle":
    base = P([3, 20, 15], [12, 70, 50], [40, 128, 72], [118, 186, 100])
    zones = [(P([16, 52, 20], [58, 118, 30], [126, 180, 48], [196, 222, 110]), smooth(noise(2, 2), .45, .75) * .5)]
elif KIND == "football":
    relief = .18
    sw = 1 / 8
    base = P([10, 40, 14], [40, 104, 38], [82, 156, 58], [150, 200, 98])
    zones = [(P([14, 52, 18], [56, 128, 46], [108, 182, 70], [176, 216, 116]), smooth(np.sin(np.pi * (X / sw + .5)), -.15, .15))]
elif KIND == "tennis":
    relief = .2
    base = P([8, 36, 16], [36, 96, 44], [80, 146, 70], [146, 192, 116])
    worn = smooth(-np.abs(y - .26) + .12, 0, .12) * smooth(X, .45, .75)   # worn baseline, soft
    zones = [(P([44, 50, 22], [112, 112, 62], [168, 164, 104], [214, 206, 152]), worn * .45)]
elif KIND == "golf":
    base = P([5, 24, 12], [26, 74, 30], [70, 128, 44], [132, 172, 76])
    band = smooth(-np.abs((y - .92) + (X - .25) * .9 - .06 * np.sin(X * 11)) + .16, 0, .05)
    zones = [(P([40, 84, 20], [108, 160, 40], [164, 206, 72], [214, 234, 138]), band)]
elif KIND == "light":
    relief = .25
    base = P([150, 182, 104], [186, 210, 140], [212, 228, 170], [234, 242, 206])

hills *= relief / .35
gy, gx = np.gradient(hills); gx *= H * .35; gy *= H * .35
light = np.array([.55, -.7, .45]); light /= np.linalg.norm(light)
nz = 1 / np.sqrt(gx**2 + gy**2 + 1)
shade = np.clip((-gx * light[0] - gy * light[1] + light[2]) * nz, 0, 1) ** 1.3
shade = shade * .95 + (noise(8, 3) - .5) * .35
if KIND == "light":
    v = np.clip(.35 + shade * .55, 0, 1)
else:
    vign = np.clip(.55 + .6 * x / (W / H) - .2 * y, .2, 1.15)   # darker left and bottom, as on home
    v = np.clip(shade * vign, 0, 1) ** .8

def ramp(t, pal):
    dark, mid, lit, tip = pal
    t = t[..., None]
    a = np.where(t < .45, dark + (mid - dark) * (t / .45), mid + (lit - mid) * ((t - .45) / .4))
    return np.where(t > .85, lit + (tip - lit) * ((t - .85) / .15), a)

def colour(t, yy=None, xx=None):
    """Field colour at value t, blended through the zones at (yy, xx)."""
    c = ramp(t, base)
    for pal, m in zones:
        mm = (m if yy is None else m[yy, xx])[..., None]
        c = c * (1 - mm) + ramp(t, pal) * mm
    return c

img = Image.fromarray(np.clip(colour(np.clip(v, 0, 1)), 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))

# Brush strokes: short curved blades, oriented with the slope, coloured from the field
d = ImageDraw.Draw(img, "RGBA")
for layer, (n, length, width) in enumerate([(30000, 40, 7), (70000, 20, 4), (110000, 9, 2)]):
    xs = rng.integers(0, W, n); ys = rng.integers(0, H, n)
    cs = colour(np.clip(v[ys, xs] + rng.normal(0, .14, n), 0, 1), ys, xs).astype(int)
    for i, (px, py) in enumerate(zip(xs, ys)):
        ang = np.arctan2(gy[py, px], gx[py, px]) + np.pi / 2 + rng.normal(0, .5)
        ang = ang * .35 - np.pi / 2 * .65
        L = length * (.6 + rng.random())
        bend = rng.normal(0, .25)
        pts = [(px + np.cos(ang + bend * k / 4) * L * k / 4, py + np.sin(ang + bend * k / 4) * L * k / 4) for k in range(5)]
        a = int(70 + 90 * rng.random()) if layer else int(50 + 60 * rng.random())
        d.line(pts, fill=(*map(int, cs[i]), a), width=width, joint="curve")

img = img.filter(ImageFilter.GaussianBlur(.6))
arr = np.asarray(img, float)
arr += rng.normal(0, 5 if KIND == "light" else 7, (H, W, 1))   # film grain
if KIND != "light":
    arr *= (1 - .4 * np.clip(1 - X * 1.6, 0, 1))[..., None]   # shadow behind copy, as on home
Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(OUT, "WEBP", quality=80, method=6)
