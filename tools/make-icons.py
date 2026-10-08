"""Render the Farsi app icons: firuzeh tile, white فا in Lalezar, tile-dot border.
usage (needs Pillow + fonttools): python tools/make-icons.py fonts/lalezar-arabic-*.woff2 icons <tmp dir>
"""
import sys, os
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

woff2, outdir, tmp = sys.argv[1:4]
ttf = os.path.join(tmp, 'lalezar-arabic.ttf')
f = TTFont(woff2)
f.flavor = None
f.save(ttf)

FIRUZEH = (13, 122, 123)
DEEP = (10, 98, 99)       # slightly deeper firuzeh for the inner ground
DOT = (255, 255, 255, 70)
WHITE = (255, 255, 255)
# No libraqm: pass presentation forms in visual (left-to-right) order:
# alef final form on the left, feh initial form on the right.
TEXT = 'ﺎﻓ'
SS = 4  # supersampling


def render(size, maskable=False, dots=True):
    S = size * SS
    img = Image.new('RGB', (S, S), FIRUZEH)
    d = ImageDraw.Draw(img, 'RGBA')
    # maskable: no dot ring and a smaller glyph, so all of it sits in the 80% safe circle
    if dots and not maskable:
        # ring of small dots along a rounded square, like a tile border;
        # kept clear of the corners iOS rounds off
        import math
        r = S * 0.011
        m = S * 0.095
        rad = S * 0.16
        side = S - 2 * m - 2 * rad
        n = 64
        # one quarter of the path (top side + top-right corner), rotated four times
        quarter = []
        q = side + math.pi * rad / 2
        cnt = n // 4
        for i in range(cnt):
            u = q * i / cnt
            if u < side:
                x, y = m + rad + u, m
            else:
                th = -math.pi / 2 + (u - side) / rad
                x, y = S - m - rad + rad * math.cos(th), m + rad + rad * math.sin(th)
            quarter.append((x, y))
        c = S / 2
        for k in range(4):
            for (x, y) in quarter:
                dx, dy = x - c, y - c
                for _ in range(k):
                    dx, dy = -dy, dx
                X, Y = c + dx, c + dy
                d.ellipse((X - r, Y - r, X + r, Y + r), fill=DOT)
    # glyphs
    target_w = S * (0.46 if maskable else 0.54)
    fs = int(S * 0.5)
    font = ImageFont.truetype(ttf, fs)
    l, t, rr, b = d.textbbox((0, 0), TEXT, font=font)
    fs = int(fs * target_w / (rr - l))
    font = ImageFont.truetype(ttf, fs)
    l, t, rr, b = d.textbbox((0, 0), TEXT, font=font)
    x = (S - (rr - l)) / 2 - l
    y = (S - (b - t)) / 2 - t + S * 0.01
    # soft shadow for depth
    from PIL import ImageFilter
    sh = Image.new('L', (S, S), 0)
    ImageDraw.Draw(sh).text((x + S * 0.006, y + S * 0.014), TEXT, font=font, fill=110)
    sh = sh.filter(ImageFilter.GaussianBlur(S * 0.012))
    img.paste(Image.new('RGB', (S, S), (0, 52, 53)), (0, 0), sh)
    d = ImageDraw.Draw(img, 'RGBA')
    d.text((x, y), TEXT, font=font, fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)


os.makedirs(outdir, exist_ok=True)
render(180).save(os.path.join(outdir, 'apple-touch-icon.png'), optimize=True)
render(192).save(os.path.join(outdir, 'icon-192.png'), optimize=True)
render(512).save(os.path.join(outdir, 'icon-512.png'), optimize=True)
render(512, maskable=True).save(os.path.join(outdir, 'icon-maskable-512.png'), optimize=True)
fav = render(64, dots=False)
fav.resize((32, 32), Image.LANCZOS).save(os.path.join(outdir, 'favicon-32.png'), optimize=True)
fav.save(os.path.join(outdir, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])
print('ok')
