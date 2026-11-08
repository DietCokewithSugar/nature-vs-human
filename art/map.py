"""The ground: terrain tiles, the edges where terrains meet, who-holds-it overlays and decorations.

The map is generated per run (src/core/map/generate.ts), so the ground is not one baked picture
any more: the game lays these tiles cell by cell (a cell is 32 x 32 px) and bakes them into
chunks at runtime (src/pixel/ground.ts).

Layers, bottom to top:
  tile/<terrain>/<v>          the bare terrain (3 variants), 32 x 32
  edge/<terrain>/<dir>        a ragged fringe of a terrain spilling onto a neighbour, 32 x 32
                              (dir n e s w for sides, ne se sw nw for corners)
  own/nature/<terrain>/<v>    nature's ground, a ragged 40 x 40 patch (4 px overhang)
  own/human/<era>/<terrain>/<v>  the humans' ground in each era, a crisp 32 x 32 tile
  curb/<era>/<dir>            the edge of the humans' ground where it meets anyone else's
  deco/<name>/<v>             trees, stumps, rocks, the volcano cone (anchored at the foot)
  site/<kind>                 resource sites; flag/<n> the rally flag

Nature's ground follows the terrain under it: wildflower meadow, weedy sand, a beach of
coloured pebbles, glacier, a muddy stream full of reeds. The humans' ground follows the era:
levelled earth; rice paddies, stone paths, straightened streams; brick and tiled floors;
asphalt, lawns, flower beds and white beaches.
"""
from __future__ import annotations

import math
import random

from kit import C, Image, hex2rgba, image, outline, sprite

CELL = 32
TERRAINS = ["grass", "forest", "dune", "beach", "snow", "stream", "water", "volcano"]
LAND = ["grass", "forest", "dune", "beach", "snow", "stream"]
# Which terrain spills over which: higher draws its fringe onto lower neighbours.
PRIORITY = {"water": 0, "stream": 1, "beach": 2, "dune": 3, "grass": 4, "snow": 5, "forest": 6, "volcano": 7}
SIDES = ["n", "e", "s", "w"]
CORNERS = ["ne", "se", "sw", "nw"]


def _hash(ix, iy, seed):
    n = (ix * 374761393 + iy * 668265263 + seed * 1274126177) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
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


def tnoise(x, y, scale, seed=0):
    """Value noise that tiles every CELL pixels, so neighbouring tiles of a kind knit together."""
    period = max(1, round(CELL / scale))
    fx, fy = x / CELL * period, y / CELL * period
    ix, iy = math.floor(fx), math.floor(fy)
    tx, ty = fx - ix, fy - iy
    tx = tx * tx * (3 - 2 * tx)
    ty = ty * ty * (3 - 2 * ty)
    h = lambda i, j: _hash(i % period, j % period, seed)  # noqa: E731
    a, b, c, d = h(ix, iy), h(ix + 1, iy), h(ix, iy + 1), h(ix + 1, iy + 1)
    return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty


def rgb(name):
    return hex2rgba(C[name])


def blank(w=CELL, h=CELL):
    return Image.new("RGBA", (w, h), (0, 0, 0, 0))


# ── Bare terrain ────────────────────────────────────────────────


def terrain_color(kind, x, y, v):
    """The colour of bare terrain at a pixel of a tile (v: variant)."""
    s = 31 + v * 7
    n = tnoise(x, y, 8, s)
    fine = _hash(x, y, s + 3)
    if kind == "grass":
        col = "sageLight" if n > 0.62 else "sage"
        if n < 0.2:
            col = "bog"
        if fine > 0.97:
            col = "reed"
        elif fine < 0.025:
            col = "olive"
        return col
    if kind == "forest":
        col = "bog" if n > 0.45 else "charcoal"
        if n > 0.78:
            col = "sage"
        if fine > 0.96:
            col = "pine"
        return col
    if kind == "dune":
        # Wind ripples: diagonal bands, light on the windward side.
        r = (x * 0.55 + y + tnoise(x, y, 8, s + 1) * 9) % 8
        col = "straw" if r < 3 else "tan"
        if r > 6.5:
            col = "clay"
        if fine > 0.985:
            col = "apricot"
        return col
    if kind == "beach":
        col = "apricot" if n > 0.5 else "skin"
        if fine > 0.95:
            col = "tan"
        return col
    if kind == "snow":
        col = "white" if n > 0.55 else "mist"
        if n < 0.18:
            col = "steel"
        if fine > 0.985:
            col = "ice"
        return col
    if kind == "stream":
        col = "sky" if n > 0.42 else "blue"
        if (y + int(n * 6)) % 7 == 0 and fine > 0.4:
            col = "ice"
        return col
    if kind == "water":
        col = "blue" if n > 0.4 else "indigo"
        if n < 0.15:
            col = "navy"
        if (y * 3 + x + int(n * 10)) % 13 == 0 and fine > 0.55:
            col = "sky"
        return col
    if kind == "volcano":
        col = "night" if n > 0.5 else "charcoal"
        if n < 0.2:
            col = "ink"
        crack = tnoise(x, y, 6, s + 9)
        if abs(crack - 0.5) < 0.035:
            col = "orange" if fine > 0.3 else "amber"
        elif abs(crack - 0.5) < 0.06:
            col = "rust"
        return col
    raise ValueError(kind)


def terrain_tile(kind, v):
    img = blank()
    px = img.load()
    for y in range(CELL):
        for x in range(CELL):
            px[x, y] = rgb(terrain_color(kind, x, y, v))
    return img


def _edge_alpha(direction, x, y, depth, seed):
    """Is (x, y) inside a ragged fringe `depth` px deep along one side or corner of a tile?"""
    wob = (noise(x if direction in ("n", "s") else y, 0, 5, seed) - 0.5) * 5
    if direction == "n":
        return y < depth + wob
    if direction == "s":
        return CELL - 1 - y < depth + wob
    if direction == "w":
        return x < depth + wob
    if direction == "e":
        return CELL - 1 - x < depth + wob
    cx = 0 if "w" in direction else CELL - 1
    cy = 0 if "n" in direction else CELL - 1
    d = math.hypot(x - cx, y - cy)
    return d < depth + 1 + (noise(x, y, 4, seed) - 0.5) * 4


def edge(kind, direction):
    """A terrain spilling a few ragged pixels onto the neighbouring cell on one side."""
    depth = {"forest": 6, "volcano": 6, "snow": 5, "grass": 5, "dune": 5, "beach": 6, "stream": 4, "water": 4}[kind]
    seed = 400 + TERRAINS.index(kind) * 13 + (SIDES + CORNERS).index(direction)
    img = blank()
    px = img.load()
    for y in range(CELL):
        for x in range(CELL):
            if not _edge_alpha(direction, x, y, depth, seed):
                continue
            col = rgb(terrain_color(kind, x, y, 0))
            # A lip of darker pixels where the fringe ends reads as a gentle bank.
            if not _edge_alpha(direction, x, y, depth - 1.2, seed):
                if kind == "beach":
                    col = rgb("foam")
                elif kind in ("forest", "grass"):
                    col = rgb("pine") if kind == "forest" else rgb("bog")
                elif kind == "volcano":
                    col = rgb("ink")
                elif kind == "snow":
                    col = rgb("steel")
                elif kind == "dune":
                    col = rgb("clay")
            px[x, y] = col
    return img


# ── Nature's ground ──────────────────────────────────────────────

FLOWERS = ["pink", "gold", "white", "lavender", "blush", "lemon"]
PEBBLES = ["coral", "sky", "lavender", "gold", "mint", "white", "salmon", "steel"]


def nature_patch(kind, v):
    """Nature's ground over a terrain: a ragged patch 4 px wider than the cell all round."""
    w = CELL + 8
    img = blank(w, w)
    px = img.load()
    seed = 700 + LAND.index(kind) * 17 + v * 5
    rnd = random.Random(seed)
    c = (w - 1) / 2
    for y in range(w):
        for x in range(w):
            e = (abs(x - c) / (w / 2)) ** 5 + (abs(y - c) / (w / 2)) ** 5
            if e > 0.8 + (noise(x, y, 4, seed) - 0.5) * 0.45:
                continue
            n = noise(x, y, 7, seed + 1)
            f = _hash(x, y, seed + 2)
            if kind in ("grass", "forest"):
                # Wildflower meadow (on the forest floor, darker under the trees).
                col = "leaf" if n > 0.6 else "green"
                if kind == "forest":
                    col = "green" if n > 0.55 else "forest"
                if f > 0.93:
                    col = FLOWERS[int(f * 1000) % len(FLOWERS)]
                elif f < 0.06:
                    col = "forest" if kind == "grass" else "pine"
            elif kind == "dune":
                # Sand overgrown with weeds.
                col = "straw" if n > 0.5 else "tan"
                g = noise(x, y, 3, seed + 3)
                if g > 0.66:
                    col = "moss" if f > 0.4 else "olive"
                    if f > 0.9:
                        col = "leaf"
            elif kind == "beach":
                # A beach of coloured pebbles.
                col = "skin" if n > 0.5 else "apricot"
                if f > 0.97:
                    col = "tan"
            elif kind == "snow":
                # Glacier: glassy blue ice with cracks.
                col = "ice" if n > 0.45 else "sky"
                if n > 0.8:
                    col = "white"
                crack = noise(x, y, 5, seed + 4)
                if abs(crack - 0.5) < 0.03:
                    col = "blue"
            elif kind == "stream":
                # A muddy stream, reeds along it.
                col = "olive" if n > 0.5 else "umber"
                if 0.3 < noise(x, y, 6, seed + 5) < 0.4:
                    col = "moss"
            else:
                raise ValueError(kind)
            px[x, y] = rgb(col)
    if kind == "stream":
        for _ in range(9):
            x, y = rnd.randint(4, w - 5), rnd.randint(6, w - 3)
            h = rnd.randint(3, 6)
            for k in range(h):
                if 0 <= y - k < w and px[x, y - k][3]:
                    px[x, y - k] = rgb("reed" if k < h - 1 else "khaki")
            if px[x, y][3]:
                px[x, y] = rgb("olive")
    if kind == "beach":
        for _ in range(26):
            x, y = rnd.randint(5, w - 7), rnd.randint(5, w - 6)
            col = rgb(rnd.choice(PEBBLES))
            cells = [(0, 0), (1, 0), (0, 1), (1, 1)] + ([(2, 0)] if rnd.random() < 0.5 else [])
            for dx, dy in cells:
                if px[x + dx, y + dy][3]:
                    px[x + dx, y + dy] = col
            if px[x, y][3]:
                px[x, y] = rgb("white")
    if kind == "grass":
        # A few bigger blooms: four petals round a gold heart.
        for _ in range(3):
            x, y = rnd.randint(6, w - 7), rnd.randint(6, w - 7)
            petal = rgb(rnd.choice(["pink", "white", "lavender", "blush"]))
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                px[x + dx, y + dy] = petal
            px[x, y] = rgb("gold")
    return img


# ── The humans' ground, era by era ─────────────────────────────────

HUMAN_STYLE = {
    0: {t: "earth" for t in LAND},
    1: {"grass": "paddy", "forest": "paddy", "dune": "stone", "beach": "stone", "snow": "stone", "stream": "channel"},
    2: {"grass": "brick", "forest": "brick", "dune": "tiles", "beach": "tiles", "snow": "tiles", "stream": "canal"},
    3: {"grass": "lawn", "forest": "flowerbed", "dune": "asphalt", "beach": "whitesand", "snow": "asphalt", "stream": "canal"},
}
HUMAN_STYLE[0]["stream"] = "ford"
CURB = {0: ("dusk", "plum"), 1: ("khaki", "dusk"), 2: ("rust", "blood"), 3: ("mist", "steel")}


def human_color(style, x, y, v):
    s = 900 + v * 11
    f = _hash(x, y, s)
    n = tnoise(x, y, 8, s + 1)
    if style == "earth":
        # Levelled earth: flat, raked in straight lines.
        col = "khaki" if n > 0.45 else "dusk"
        if y % 6 == 0 and f > 0.35:
            col = "dusk" if col == "khaki" else "plum"
        if f > 0.985:
            col = "umber"
        return col
    if style == "ford":
        # A stream crossed on stepping stones between levelled banks.
        if 11 <= y <= 20:
            col = "sky" if n > 0.4 else "blue"
            if (x // 6) % 2 == 0 and 14 <= y <= 17 and x % 6 in (1, 2, 3, 4):
                col = "steel" if y > 14 else "mist"
            return col
        return human_color("earth", x, y, v)
    if style == "paddy":
        # One flooded paddy: a bund round the edge, rows of rice shoots in the water.
        if x < 2 or y < 2:
            return "khaki" if (x + y) % 5 else "olive"
        col = "teal" if n > 0.5 else "aqua"
        if (x % 4 == 1) and (y % 5 in (1, 2)):
            col = "leaf" if y % 5 == 1 else "green"
        return col
    if style == "stone":
        # Flagstones: irregular slabs in grey, mortar lines between.
        bx = (x + (8 if (y // 8) % 2 else 0)) // 8
        by = y // 8
        h = _hash(bx, by, s + 7)
        edge = (y % 8 == 7) or ((x + (8 if (y // 8) % 2 else 0)) % 8 == 7)
        if edge:
            return "slate"
        col = "steel" if h > 0.6 else "lilacGrey" if h > 0.25 else "mist"
        if f > 0.97:
            col = "slate"
        return col
    if style == "channel":
        # A straightened stream between stone banks.
        if 9 <= y <= 22:
            if y in (9, 22):
                return "slate"
            col = "sky" if n > 0.45 else "blue"
            if (x + y * 2) % 11 == 0:
                col = "ice"
            return col
        return human_color("stone", x, y, v)
    if style == "brick":
        # Running bond: 8 x 4 bricks, mortar between.
        row = y // 4
        off = 4 if row % 2 else 0
        if y % 4 == 3 or (x + off) % 8 == 7:
            return "khaki"
        h = _hash((x + off) // 8, row, s + 3)
        return "brick" if h > 0.55 else "rust" if h > 0.2 else "clay"
    if style == "tiles":
        # Square floor tiles, light and lighter, with grout lines.
        if x % 8 == 7 or y % 8 == 7:
            return "steel"
        return "white" if ((x // 8) + (y // 8)) % 2 else "mist"
    if style == "canal":
        # A concrete canal.
        if 8 <= y <= 23:
            if y in (8, 23):
                return "slate"
            if y in (9, 22):
                return "lilacGrey"
            col = "sky" if n > 0.45 else "blue"
            if (x * 2 + y) % 13 == 0:
                col = "ice"
            return col
        return human_color("tiles", x, y, v)
    if style == "lawn":
        # Mown stripes.
        col = "leaf" if (y // 4) % 2 else "green"
        if f > 0.97:
            col = "pear"
        return col
    if style == "flowerbed":
        # A bed of flowers in neat rows inside a low border.
        if x < 2 or y < 2 or x > 29 or y > 29:
            return "mist" if x in (0, 31) or y in (0, 31) else "steel"
        if x % 4 == 2 and y % 4 == 2:
            return ["hotPink", "gold", "white", "red"][((x // 4) + (y // 4) * 2 + v) % 4]
        if (x % 4 == 2 and y % 4 in (1, 3)) or (y % 4 == 2 and x % 4 in (1, 3)):
            return "green"
        return "umber" if n > 0.4 else "night"
    if style == "asphalt":
        col = "charcoal" if n > 0.4 else "night"
        if f > 0.96:
            col = "slate"
        # Dashed lane markings now and then.
        if v == 1 and 15 <= y <= 16 and x % 12 < 6:
            col = "white"
        return col
    if style == "whitesand":
        col = "white" if n > 0.45 else "mist"
        if f > 0.985:
            col = "apricot"
        return col
    raise ValueError(style)


def human_tile(era, kind, v):
    style = HUMAN_STYLE[era][kind]
    img = blank()
    px = img.load()
    for y in range(CELL):
        for x in range(CELL):
            px[x, y] = rgb(human_color(style, x, y, v))
    return img


def curb(era, direction):
    """The rim of the humans' ground where it meets ground that isn't theirs."""
    light, dark = CURB[era]
    img = blank()
    px = img.load()
    for k in range(CELL):
        for d, col in ((0, dark), (1, light)):
            if direction == "n":
                px[k, d] = rgb(col)
            elif direction == "s":
                px[k, CELL - 1 - d] = rgb(col)
            elif direction == "w":
                px[d, k] = rgb(col)
            else:
                px[CELL - 1 - d, k] = rgb(col)
    return img


# ── Decorations ─────────────────────────────────────────────────


def pine(variant, snowy=False):
    """A pine for the dense forest: 3 shapes, with or without snow."""
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
        if snowy:
            s.line(8 - half + 1, y1 - 1, 8, y0 + 1, C["white"], only="opaque")
            s.line(8 - half + 2, y1 - 1, 8, y0 + 2, C["mist"], only="opaque")
        else:
            s.line(8 - half + 1, y1 - 1, 8, y0 + 1, C["green"], only="opaque")
    s.px(8, top, C["white"] if snowy else C["green"])
    outline(s)
    return image(s), (9, 26)


def lush(variant):
    """Nature's forest: a round, healthy tree in blossom."""
    s = sprite(20, 24)
    s.line(9, 22, 9, 15, C["umber"])
    s.line(10, 22, 10, 15, C["night"])
    blobs = [[(2, 4, 17, 17), (5, 1, 14, 10)], [(3, 3, 16, 16), (1, 7, 9, 15), (10, 6, 18, 15)]][variant]
    for x0, y0, x1, y1 in blobs:
        s.ellipse(x0, y0, x1, y1, C["forest"])
    for x0, y0, x1, y1 in blobs:
        s.ellipse(x0 + 1, y0, x1 - 2, y1 - 3, C["green"], only="opaque")
        s.ellipse(x0 + 2, y0 + 1, (x0 + x1) // 2, (y0 + y1) // 2, C["leaf"], only="opaque")
    rnd = random.Random(80 + variant)
    for _ in range(6):
        x, y = rnd.randint(4, 15), rnd.randint(3, 13)
        s.px(x, y, C[rnd.choice(["pink", "blush", "white"])], only="opaque")
    outline(s)
    return image(s), (10, 22)


def stump():
    s = sprite(12, 9)
    s.ellipse(1, 2, 10, 8, C["umber"])
    s.ellipse(2, 2, 9, 5, C["tan"])
    s.ellipse(4, 3, 7, 4, C["clay"])
    outline(s)
    return image(s), (6, 7)


def rock(variant):
    s = sprite(14, 11)
    w = [11, 8, 13][variant]
    s.ellipse(1, 2, w, 10, C["slate"])
    s.ellipse(1, 2, w - 2, 8, C["lilacGrey"], only="opaque")
    s.ellipse(2, 2, w // 2 + 1, 5, C["steel"], only="opaque")
    outline(s)
    return image(s), (w // 2 + 1, 9)


def shrub():
    """A dry shrub on the dunes."""
    s = sprite(12, 9)
    for x0, x1 in ((5, 1), (6, 10), (6, 4), (5, 8)):
        s.line(x0, 8, x1, 2 + (x1 % 3), C["umber"])
    s.px(1, 3, C["olive"])
    s.px(10, 3, C["olive"])
    s.px(8, 4, C["moss"])
    return image(s), (6, 8)


def drift():
    """A snowdrift with a rock poking out."""
    s = sprite(16, 8)
    s.ellipse(0, 2, 15, 7, C["mist"])
    s.ellipse(1, 2, 10, 5, C["white"], only="opaque")
    s.ellipse(11, 3, 14, 6, C["slate"])
    return image(s), (8, 7)


def volcano():
    """A volcano cone with a glowing crater, sitting on the volcano cells."""
    s = sprite(72, 58)
    s.polygon([(2, 57), (26, 10), (46, 10), (70, 57)], C["night"])
    s.polygon([(6, 56), (27, 13), (34, 13), (24, 56)], C["slate"], only="opaque")
    s.polygon([(44, 13), (66, 56), (52, 56)], C["ink"], only="opaque")
    # Lava runs down from the crater.
    for x0, x1, x2 in ((33, 30, 26), (39, 42, 47)):
        s.line(x0, 12, x1, 30, C["orange"])
        s.line(x1, 30, x2, 52, C["red"])
        s.line(x1 + 1, 31, x2 + 1, 50, C["amber"])
    s.ellipse(26, 7, 46, 14, C["blood"])
    s.ellipse(28, 8, 44, 12, C["orange"], only="opaque")
    s.ellipse(31, 9, 41, 11, C["gold"], only="opaque")
    outline(s)
    return image(s), (36, 54)


# ── Resource sites and the rally flag ─────────────────────────────


def site(kind):
    """Resource sites: whoever holds the cell is paid for it."""
    s = sprite(26, 22)
    if kind == "grove":
        # A ring of glowing mushrooms round an old stump.
        s.ellipse(7, 12, 18, 19, C["umber"])
        s.ellipse(8, 12, 17, 15, C["tan"])
        s.ellipse(10, 13, 15, 14, C["clay"])
        for x, y in ((3, 15), (21, 14), (6, 19), (19, 19), (12, 20)):
            s.ellipse(x - 2, y - 3, x + 2, y - 1, C["mint"])
            s.px(x - 1, y - 3, C["foam"])
            s.line(x, y - 1, x, y, C["white"])
    elif kind == "spring":
        # A clear spring in a ring of stones.
        s.ellipse(3, 8, 22, 20, C["slate"])
        s.ellipse(5, 9, 20, 18, C["sky"])
        s.ellipse(8, 11, 17, 16, C["ice"], only="opaque")
        s.ellipse(11, 12, 14, 14, C["white"], only="opaque")
        for x, y in ((4, 11), (21, 11), (6, 18), (19, 18), (12, 20)):
            s.ellipse(x - 2, y - 1, x + 1, y + 1, C["lilacGrey"])
    elif kind == "amber":
        # Amber crystals breaking through the sand.
        s.ellipse(2, 13, 23, 20, C["clay"])
        for x0, h in ((6, 9), (11, 13), (16, 8), (20, 6)):
            s.polygon([(x0 - 2, 17), (x0, 17 - h), (x0 + 2, 17)], C["amber"])
            s.line(x0, 17 - h + 1, x0, 16, C["gold"], only="opaque")
            s.px(x0 - 1, 15, C["orange"], only="opaque")
    elif kind == "vent":
        # A steaming vent glowing from below.
        s.ellipse(3, 11, 22, 20, C["night"])
        s.ellipse(7, 13, 18, 18, C["blood"], only="opaque")
        s.ellipse(9, 14, 16, 17, C["orange"], only="opaque")
        s.ellipse(11, 15, 14, 16, C["gold"], only="opaque")
        for x in (6, 19):
            s.ellipse(x - 2, 12, x + 1, 15, C["charcoal"])
    else:
        raise ValueError(kind)
    outline(s)
    return image(s), (12, 18)


def flag(t):
    """Nature's rally flag: a mint banner on a branch, two frames of wind."""
    s = sprite(14, 24)
    s.line(2, 23, 2, 1, C["umber"])
    s.line(3, 23, 3, 2, C["night"])
    wave = [0, 1][t]
    s.polygon([(4, 2), (12, 3 + wave), (12, 9 + wave), (4, 10)], C["mint"])
    s.line(4, 9, 12, 8 + wave, C["aqua"])
    s.px(7, 5 + wave // 2, C["foam"])
    s.px(8, 5, C["white"])
    s.px(2, 0, C["leaf"])
    s.px(1, 1, C["leaf"])
    outline(s)
    return image(s), (2, 23)


def all_ground():
    """Every ground sprite: (key, image, anchor in px, keep untrimmed)."""
    out = []
    for kind in TERRAINS:
        for v in range(3):
            out.append((f"tile/{kind}/{v}", terrain_tile(kind, v), (0, 0), True))
        for d in SIDES + CORNERS:
            out.append((f"edge/{kind}/{d}", edge(kind, d), (0, 0), True))
    for kind in LAND:
        for v in range(2):
            out.append((f"own/nature/{kind}/{v}", nature_patch(kind, v), (4, 4), True))
    for era in range(4):
        for kind in LAND:
            for v in range(2):
                out.append((f"own/human/{era}/{kind}/{v}", human_tile(era, kind, v), (0, 0), True))
        for d in SIDES:
            out.append((f"curb/{era}/{d}", curb(era, d), (0, 0), True))
    for v in range(3):
        im, a = pine(v)
        out.append((f"deco/pine/{v}", im, a, False))
        im, a = pine(v, snowy=True)
        out.append((f"deco/snowpine/{v}", im, a, False))
        im, a = rock(v)
        out.append((f"deco/rock/{v}", im, a, False))
    for v in range(2):
        im, a = lush(v)
        out.append((f"deco/lush/{v}", im, a, False))
    for name, make in (("stump", stump), ("shrub", shrub), ("drift", drift), ("volcano", volcano)):
        im, a = make()
        out.append((f"deco/{name}/0", im, a, False))
    for kind in ("grove", "spring", "amber", "vent"):
        im, a = site(kind)
        out.append((f"site/{kind}", im, a, False))
    for t in range(2):
        im, a = flag(t)
        out.append((f"flag/{t}", im, a, False))
    return out


def preview(seed=3, size=24):
    """A quick look at the ground kit: a strip of every tile, for art/.preview."""
    items = all_ground()
    cols = 16
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * 44, rows * 64), hex2rgba(C["ink"]))
    for k, (_, im, _, _) in enumerate(items):
        sheet.alpha_composite(im, ((k % cols) * 44 + 2, (k // cols) * 64 + 2))
    return sheet
