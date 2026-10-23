# Painterly grass hills: shaded height field + layered brush strokes. Deterministic.
import sys, numpy as np
from PIL import Image, ImageDraw, ImageFilter
rng = np.random.default_rng(7)
W, H = 2400, 1400
out = sys.argv[1]

# Smooth value noise
def noise(scale, oct=4):
    acc = np.zeros((H, W)); amp = 1; tot = 0
    for o in range(oct):
        s = max(2, int(scale * 2**o))
        g = rng.random((s + 1, int(s * W / H) + 2))
        im = Image.fromarray((g * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
        acc += amp * np.asarray(im, float) / 255; tot += amp; amp *= .5
    return acc / tot

y, x = np.mgrid[0:H, 0:W] / H
# Rolling ridges running diagonally, like the North photo
hills = (np.sin(x * 2.1 + y * 3.4) * .55 + np.sin(x * 4.3 - y * 1.7 + 1.3) * .3
         + np.sin(x * 1.1 + y * 6.2 + .4) * .25 + (noise(2, 2) - .5) * .5)
gy, gx = np.gradient(hills); gx *= H * .35; gy *= H * .35
light = np.array([.55, -.7, .45]); light /= np.linalg.norm(light)
nz = 1 / np.sqrt(gx**2 + gy**2 + 1)
shade = np.clip((-gx * light[0] - gy * light[1] + light[2]) * nz, 0, 1) ** 1.3
shade = shade * .95 + (noise(8, 3) - .5) * .35
# Darker left and bottom for copy, brighter top-right
vign = np.clip(.55 + .6 * x / (W / H) - .2 * y, .2, 1.15)
v = np.clip(shade * vign, 0, 1) ** .8

dark, mid, lit, tip = map(np.array, ([7, 22, 12], [38, 80, 24], [118, 162, 40], [200, 214, 96]))
def ramp(t):
    t = t[..., None]
    a = np.where(t < .45, dark + (mid - dark) * (t / .45), mid + (lit - mid) * ((t - .45) / .4))
    return np.where(t > .85, lit + (tip - lit) * ((t - .85) / .15), a)
base = ramp(np.clip(v, 0, 1))
img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))

# Brush strokes: short curved blades, oriented with the slope, coloured from the field
d = ImageDraw.Draw(img, "RGBA")
for layer, (n, length, width) in enumerate([(30000, 40, 7), (70000, 20, 4), (110000, 9, 2)]):
    xs = rng.integers(0, W, n); ys = rng.integers(0, H, n)
    for px, py in zip(xs, ys):
        t = v[py, px] + rng.normal(0, .14)
        c = ramp(np.array([np.clip(t, 0, 1)]))[0]
        ang = np.arctan2(gy[py, px], gx[py, px]) + np.pi / 2 + rng.normal(0, .5)
        ang = ang * .35 - np.pi / 2 * .65          # bias toward upright blades
        L = length * (.6 + rng.random())
        bend = rng.normal(0, .25)
        pts = [(px + np.cos(ang + bend * k / 4) * L * k / 4, py + np.sin(ang + bend * k / 4) * L * k / 4) for k in range(5)]
        a = int(70 + 90 * rng.random()) if layer else int(50 + 60 * rng.random())
        d.line(pts, fill=(*map(int, c), a), width=width, joint="curve")

img = img.filter(ImageFilter.GaussianBlur(.6))
arr = np.asarray(img, float)
arr += rng.normal(0, 7, (H, W, 1))            # film grain
arr *= (1 - .4 * np.clip(1 - x / (W / H) * 1.6, 0, 1))[..., None]  # extra shadow behind copy
Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(out, "WEBP", quality=80, method=6)
