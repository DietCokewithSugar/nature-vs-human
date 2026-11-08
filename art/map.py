"""The battlefield background (576 × 320) and the ground overlays that show who holds each stretch.

Readability first: the three lanes are bright packed snow, the strips between them dark pine
forest, so the eye goes straight to the paths. Nature's home on the left is green moss, the
humans' camp on the right trampled brown earth. A frozen river runs down the middle; the hot
springs (worth more to whoever holds them) steam at the top and bottom of it.

Geometry mirrors src/core/map/layout.ts.
"""
from __future__ import annotations

import math
import random

from kit import C, Image, hex2rgba, image, outline, sprite

W, H = 576, 320
LANE_Y = [60, 160, 260]
LANE_HALF = 34
FIELD_X0, FIELD_X1 = 120, 456
SEGMENTS = 7
SEG_W = (FIELD_X1 - FIELD_X0) / SEGMENTS
RIVER_X = 288


def _hash(ix, iy, seed):
    n = ix * 374761393 + iy * 668265263 + seed * 2147483647
    n = (n ^ (n >> 13)) * 1274126177
    return ((n ^ (n >> 16)) & 0xFFFF) / 0xFFFF


def noise(x, y, scale, seed=0):
    """Smooth value noise in 0..1."""
    fx, fy = x / scale, y / scale
    ix, iy = math.floor(fx), math.floor(fy)
    tx, ty = fx - ix, fy - iy
    tx = tx * tx * (3 - 2 * tx)
    ty = ty * ty * (3 - 2 * ty)
    a = _hash(ix, iy, seed)
    b = _hash(ix + 1, iy, seed)
    c = _hash(ix, iy + 1, seed)
    d = _hash(ix + 1, iy + 1, seed)
    return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty


def fbm(x, y, scale, seed=0):
    return noise(x, y, scale, seed) * 0.65 + noise(x, y, scale / 2.3, seed + 7) * 0.35


def rgb(name):
    return hex2rgba(C[name])


def lane_of(x, y):
    """Lane index if (x, y) is on a lane (with a ragged edge), else -1."""
    for i, ly in enumerate(LANE_Y):
        edge = LANE_HALF + (fbm(x, y + i * 50, 10, 3) - 0.5) * 7
        if abs(y - ly) <= edge:
            return i
    return -1


def river_x(y):
    return RIVER_X + 5 * math.sin(y / 23) + 2 * math.sin(y / 7)


def pine(variant):
    """A snowy pine for the forest strips."""
    s = sprite(18, 28)
    h = [22, 25, 19][variant]
    top = 26 - h
    s.line(8, 26, 8, 22, C["umber"])
    s.line(9, 26, 9, 22, C["night"])
    tiers = 4 if h > 20 else 3
    for t in range(tiers):
        y0 = top + t * (h - 4) // tiers
        y1 = y0 + (h - 4) // tiers + 4
        half = 2 + t * 2 + (1 if variant == 1 else 0)
        s.polygon([(8 - half, y1), (8, y0), (9, y0), (9 + half, y1)], C["pine"])
        s.polygon([(8 - half + 1, y1 - 1), (8, y0 + 1), (8, y1 - 1)], C["forest"], only="opaque")
        # Snow on each tier's top-left slope.
        s.line(8 - half + 1, y1 - 1, 8, y0 + 1, C["white"], only="opaque")
        s.line(8 - half + 2, y1 - 1, 8, y0 + 2, C["mist"], only="opaque")
    s.px(8, top, C["white"])
    outline(s)
    return image(s)


def boulder(variant):
    s = sprite(16, 12)
    w = [12, 9, 14][variant]
    s.ellipse(1, 2, w, 11, C["slate"])
    s.ellipse(1, 2, w - 2, 9, C["lilacGrey"], only="opaque")
    s.ellipse(2, 2, w // 2 + 1, 6, C["steel"], only="opaque")
    s.ellipse(2, 2, w - 3, 4, C["white"], only="opaque")
    outline(s)
    return image(s)


def background(seed=11):
    rnd = random.Random(seed)
    img = Image.new("RGBA", (W, H))
    px = img.load()
    for y in range(H):
        for x in range(W):
            lane = lane_of(x, y)
            n = fbm(x, y, 14, seed)
            fine = _hash(x, y, seed)
            if lane >= 0:
                # Packed snow: bright, calm, a few soft blue shadows and ruts.
                col = rgb("mist")
                if n > 0.72:
                    col = rgb("white")
                elif n < 0.17:
                    col = rgb("steel")
                ly = LANE_Y[lane]
                if abs(abs(y - ly) - 9) < 1 and fbm(x, y, 6, seed + 5) > 0.55:
                    col = rgb("steel")
                if fine > 0.985:
                    col = rgb("white")
            else:
                # Forest floor between the lanes: dark moss and old snow.
                col = rgb("bog")
                if n > 0.62:
                    col = rgb("mist")
                elif n > 0.5:
                    col = rgb("sage")
                elif n < 0.25:
                    col = rgb("charcoal")
            # Nature's home: lush tundra moss, ragged edge into the field.
            edge_n = FIELD_X0 - 8 + (fbm(x, y, 12, seed + 2) - 0.5) * 18
            if x < edge_n:
                m = fbm(x, y, 16, seed + 4)
                col = rgb("sage") if m < 0.58 else rgb("sageLight")
                if m < 0.2:
                    col = rgb("bog")
                if fine > 0.985:
                    col = rgb(rnd.choice(["pink", "gold", "leaf"]))
            edge_h = FIELD_X1 + 8 + (fbm(x, y, 12, seed + 9) - 0.5) * 18
            if x > edge_h:
                m = fbm(x, y, 16, seed + 6)
                col = rgb("dusk") if m < 0.6 else rgb("khaki")
                if m < 0.18:
                    col = rgb("plum")
                if fbm(x, y, 21, seed + 12) > 0.74:
                    col = rgb("mist")
                if fine > 0.99:
                    col = rgb("umber")
            # The frozen river.
            rx = river_x(y)
            d = abs(x - rx)
            if d < 6 and edge_n <= x <= edge_h:
                if lane >= 0:
                    # Frozen solid where the lanes cross: pale ice, walkable.
                    col = rgb("ice") if d > 3.5 else rgb("white") if _hash(x // 2, y // 3, 4) > 0.7 else rgb("mist")
                    if d > 5:
                        col = rgb("steel")
                else:
                    col = rgb("sky") if d < 3 else rgb("blue")
                    if (y + int(x)) % 7 == 0 and d < 3:
                        col = rgb("ice")
            px[x, y] = col
    # Hot springs at the middle of the top and bottom lanes, against the forest.
    for cy in (LANE_Y[0] - 24, LANE_Y[2] + 24):
        for y in range(cy - 9, cy + 10):
            for x in range(RIVER_X - 18, RIVER_X + 19):
                e = ((x - RIVER_X) / 16) ** 2 + ((y - cy) / 7.5) ** 2
                if e < 1:
                    inner = e < 0.55
                    col = rgb("aqua") if inner else rgb("teal")
                    if inner and _hash(x, y, 8) > 0.9:
                        col = rgb("foam")
                    if 0.8 < e < 1:
                        col = rgb("steel") if (x + y) % 3 else rgb("lilacGrey")
                    px[x, y] = col
    # Pines and boulders in the forest strips and borders, back to front.
    pines = [pine(i) for i in range(3)]
    rocks = [boulder(i) for i in range(3)]
    spots = []
    for y in range(-4, H + 20, 5):
        for x in range(-6, W + 6, 7):
            jx = x + rnd.randint(-3, 3)
            jy = y + rnd.randint(-2, 2)
            if jx < FIELD_X0 - 10 or jx > FIELD_X1 + 10:
                # Homes: only the outer borders get trees.
                if 6 < jy < H - 10:
                    continue
            if lane_of(jx, jy) >= 0 or lane_of(jx, jy - 8) >= 0:
                continue
            if abs(jx - river_x(jy)) < 8:
                continue
            spots.append((jy, jx, rnd.random()))
    spots.sort()
    for jy, jx, r in spots:
        if r < 0.82:
            im = pines[int(r * 100) % 3]
            img.alpha_composite(im, (jx - 9, jy - 26), (0, 0)) if 0 <= jx - 9 < W - 18 and 0 <= jy - 26 < H - 28 else _paste_clip(img, im, jx - 9, jy - 26)
        else:
            _paste_clip(img, rocks[int(r * 100) % 3], jx - 7, jy - 10)
    # Home decorations: ferns and flowers for nature; log piles and hide scraps for the humans.
    for _ in range(40):
        x, y = rnd.randint(4, FIELD_X0 - 16), rnd.randint(30, H - 30)
        for k in range(3):
            img.putpixel((x + k, y - k % 2), rgb("forest"))
            img.putpixel((x + k, y + 1), rgb("pine"))
    for _ in range(14):
        x, y = rnd.randint(FIELD_X1 + 16, W - 8), rnd.randint(30, H - 30)
        for k in range(5):
            img.putpixel((x + k, y), rgb("clay"))
            img.putpixel((x + k, y + 1), rgb("rust"))
        img.putpixel((x, y), rgb("tan"))
    return img


def _paste_clip(dst, im, x, y):
    box = (max(0, -x), max(0, -y), min(im.width, dst.width - x), min(im.height, dst.height - y))
    if box[2] <= box[0] or box[3] <= box[1]:
        return
    dst.alpha_composite(im.crop(box), (x + box[0], y + box[1]))


def territory(side, lane, seg, seed=21):
    """The ground a side lays over a stretch it holds: moss and flowers, or trodden mud and stakes.
    Calm two-tone ground in a rounded, ragged patch, a little wider than the stretch so neighbours knit."""
    w = int(SEG_W) + 8
    h = LANE_HALF * 2 + 4
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    k = seed + lane * 31 + seg * 7 + (0 if side == "nature" else 500)
    rnd = random.Random(k)
    cx, cy = (w - 1) / 2, (h - 1) / 2
    for y in range(h):
        for x in range(w):
            e = (abs(x - cx) / (w / 2)) ** 6 + (abs(y - cy) / (h / 2)) ** 6
            edge = 0.78 + (fbm(x, y, 4, k) - 0.5) * 0.5
            if e > edge:
                continue
            rim = e > edge - 0.12
            n = fbm(x, y, 9, k + 2)
            f = _hash(x, y, k)
            if side == "nature":
                col = rgb("sageLight") if n > 0.6 else rgb("sage")
                if f > 0.985:
                    col = rgb(rnd.choice(["pink", "gold", "white"]))
                elif f > 0.95:
                    col = rgb("forest")
                if rim:
                    col = rgb("forest") if f > 0.35 else rgb("aqua")
            else:
                col = rgb("khaki") if n > 0.62 else rgb("dusk")
                if f > 0.975:
                    col = rgb("plum")
                if rim:
                    col = rgb("dusk") if f > 0.4 else rgb("brick")
            px[x, y] = col
    if side == "human":
        # A couple of claim stakes on the edges.
        for sx, sy in [(rnd.randint(10, w - 12), 6), (rnd.randint(10, w - 12), h - 11)]:
            for yy in range(sy, sy + 5):
                px[sx, yy] = rgb("clay")
            px[sx, sy] = rgb("vermilion")
            px[sx + 1, sy] = rgb("vermilion")
    else:
        # A sprout or two.
        for _ in range(2):
            sx, sy = rnd.randint(10, w - 12), rnd.randint(12, h - 12)
            px[sx, sy] = rgb("forest")
            px[sx, sy - 1] = rgb("green")
            px[sx - 1, sy - 2] = rgb("leaf")
            px[sx + 1, sy - 2] = rgb("leaf")
    return img
