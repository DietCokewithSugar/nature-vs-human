"""Small things: build pads, scaffolds, projectiles, team rings, effects and HUD icons."""
from __future__ import annotations

import math

from kit import INK, TEAM, C, Image, grid, hex2rgba, image, outline, sprite

N = TEAM["nature"]
H = TEAM["human"]


def pad(kind):
    """An empty building plot: mossy ring (nature), staked dirt (humans), stone ring in the snow (field)."""
    s = sprite(34, 20)
    if kind == "nature":
        s.ellipse(1, 2, 32, 18, C["sage"])
        s.ellipse(4, 4, 29, 16, C["bog"], only="opaque")
        for a in range(0, 360, 30):
            x = 16 + round(14 * math.cos(math.radians(a)))
            y = 10 + round(7 * math.sin(math.radians(a)))
            s.px(x, y, C["leaf"] if a % 60 else C["forest"])
    elif kind == "human":
        s.ellipse(1, 2, 32, 18, C["dusk"])
        s.ellipse(4, 4, 29, 16, C["umber"], only="opaque")
        for x, y in [(3, 4), (29, 4), (3, 14), (29, 14)]:
            s.line(x, y - 3, x, y + 1, C["clay"])
            s.px(x, y - 3, C["tan"])
    else:
        for a in range(0, 360, 24):
            x = 16 + round(14 * math.cos(math.radians(a)))
            y = 10 + round(7 * math.sin(math.radians(a)))
            s.ellipse(x - 2, y - 1, x + 1, y + 1, C["lilacGrey"])
            s.px(x - 1, y - 1, C["steel"])
        s.ellipse(6, 5, 26, 15, C["steel"])
        s.ellipse(8, 6, 26, 15, C["mist"], only="opaque")
    return image(s), (16, 10)


def scaffold(side):
    """A building going up: sprouting vines on a mound (nature) or a pole frame (humans)."""
    s = sprite(34, 30)
    if side == "nature":
        s.ellipse(3, 18, 30, 29, C["umber"])
        s.ellipse(5, 19, 26, 26, C["dusk"], only="opaque")
        for x0, h in [(8, 10), (13, 14), (19, 12), (24, 9)]:
            s.line(x0, 24, x0 - 1, 24 - h, C["forest"])
            s.px(x0 - 2, 24 - h, C["leaf"])
            s.px(x0, 24 - h + 1, C["green"])
        for x, y in [(12, 11), (19, 13), (7, 15)]:
            s.px(x, y, N["light"])
    else:
        for x in (5, 16, 27):
            s.line(x, 29, x + (1 if x < 16 else -1 if x > 16 else 0), 6, C["umber"])
        s.line(4, 12, 28, 12, C["clay"])
        s.line(4, 20, 28, 20, C["clay"])
        s.line(5, 29, 16, 6, C["rust"])
        s.polygon([(4, 29), (10, 22), (14, 29)], C["khaki"])
        s.px(16, 5, H["mid"])
    outline(s)
    return image(s), (16, 28)


def spear(angle, length=12, tip=C["steel"]):
    """A thrown spear at one of five slopes (−2 … 2), so nothing is ever rotated."""
    s = sprite(16, 9)
    dy = [-4, -2, 0, 2, 4][angle + 2]
    x0, y0 = 2, 4 - dy // 2
    x1, y1 = x0 + length - 1, 4 + dy // 2
    s.line(x0, y0, x1, y1, C["clay"])
    s.px(x1 + 1, y1 + (1 if dy > 0 else -1 if dy < 0 else 0) * 0, tip)
    s.px(x1, y1, C["mist"])
    return image(s), (8, 4)


def cone():
    s = sprite(8, 8)
    grid(s, 1, 1, [".DD.", "DLMD", "DMMD", ".DD."], {"D": C["rust"], "L": C["tan"], "M": C["clay"]})
    outline(s)
    return image(s), (3, 3)


def fireball(t):
    s = sprite(10, 10)
    rows = [
        ["..OO..", ".OAAO.", "OAGGAO", "OAGLAO", ".OAAO.", "..OO.."],
        ["...O..", ".OAAO.", "OAGGAO", "OAGLGO", ".OAAO.", ".O.O.."],
    ][t]
    grid(s, 2, 2, rows, {"O": C["orange"], "A": C["amber"], "G": C["gold"], "L": C["lemon"]})
    return image(s), (5, 5)


def ring(side, w):
    """A team-coloured ellipse under a unit, over a soft dark shadow (like an RTS selection ring)."""
    h = max(3, round(w * 0.4))
    s = sprite(w + 2, h + 2)
    t = TEAM[side]
    s.ellipse(1, 1, w, h, (46, 34, 47, 90))
    s.ellipse(1, 1, w, h, t["mid"], fill=False)
    # Lighter on the far edge, darker on the near edge.
    for x in range(w + 2):
        for y in range(h + 2):
            px = s.get(x, y)
            if px and px[:3] == hex2rgba(t["mid"])[:3] and y > h // 2 + 1:
                s.px(x, y, t["dark"])
    return image(s), ((w + 2) / 2, (h + 2) / 2)


def hit(t):
    """Impact spark: a white star that pops and fades in three frames."""
    s = sprite(11, 11)
    r = [2, 4, 3][t]
    col = [C["white"], C["lemon"], C["gold"]][t]
    for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
        for k in range(1, r + 1):
            s.px(5 + dx * k, 5 + dy * k, col if k < r else C["gold"])
    if t < 2:
        for dx, dy in [(1, 1), (-1, -1), (1, -1), (-1, 1)]:
            s.px(5 + dx * (r - 1), 5 + dy * (r - 1), C["white"])
    s.px(5, 5, C["white"])
    return image(s), (5, 5)


def poof(t):
    """Death puff: four soft balls bursting out and thinning away."""
    s = sprite(20, 16)
    r = [3, 4, 4, 3][t]
    d = [2, 4, 6, 7][t]
    cols = [(C["white"], C["mist"]), (C["white"], C["mist"]), (C["mist"], C["steel"]), (C["steel"], C["steel"])][t]
    for k, (dx, dy) in enumerate([(-1, 0), (1, 0), (0, -1), (-0.7, -0.7), (0.7, -0.7)]):
        cx = 10 + round(dx * d)
        cy = 9 + round(dy * d * 0.7)
        rr = max(1, r - (k % 2))
        if t == 3 and k % 2:
            continue
        s.circle(cx, cy, rr, cols[1], fill=True)
        s.circle(cx - 1, cy - 1, max(1, rr - 1), cols[0], fill=True)
    return image(s), (10, 12)


def rubble(t):
    """A building collapsing: dust and splinters."""
    s = sprite(36, 24)
    for k in range(7):
        cx = 6 + k * 4
        cy = 18 - (k % 3) * 2 - t * 2
        r = 3 + (k % 2) + (1 if t else 0)
        s.circle(cx, cy, r, [C["khaki"], C["mist"], C["steel"]][t], fill=True)
    for x, y in [(4, 20), (12, 22), (22, 21), (30, 20)]:
        s.line(x, y, x + 3, y - 2, C["umber"])
    return image(s), (18, 22)


def flame(t):
    """A building on fire (shown when it's badly hurt)."""
    s = sprite(10, 14)
    rows = [
        ["...O....", "..OAO...", "..OAAO..", ".OAGAO..", ".OAGGAO.", "OAGLGAO.", ".OOOOO.."],
        ["....O...", "...OAO..", "..OAAO..", ".OAGAO..", ".OAGGAO.", ".OAGLGAO", "..OOOOO."],
        ["..O.....", "..OAO...", ".OAAO...", ".OAGAO..", "OAGGAO..", "OAGLGAO.", ".OOOOO.."],
    ][t]
    grid(s, 1, 5, rows, {"O": C["orange"], "A": C["amber"], "G": C["gold"], "L": C["lemon"]})
    return image(s), (5, 12)


def smoke(t):
    s = sprite(10, 10)
    r = [2, 3, 3][t]
    s.circle(5, 5, r, [C["steel"], C["lilacGrey"], C["slate"]][t], fill=True)
    s.circle(4, 4, max(1, r - 1), [C["mist"], C["steel"], C["lilacGrey"]][t], fill=True)
    return image(s), (5, 5)


ICONS = {
    # 生机: a glowing leaf drop.
    "essence": (["...LL", "..LMM", ".LMMD", "LMMD.", "MMD..", "D...."], {"L": N["light"], "M": N["mid"], "D": N["deep"]}),
    "grass": (["L.L.L", "MLMLM", "MMMMM", ".MDM.", "..D.."], {"L": C["leaf"], "M": C["green"], "D": C["forest"]}),
    "meat": ([".RRR.", "RLRRR", "RRRRD", ".RRDW", "...WW"], {"R": C["red"], "L": C["peach"], "D": C["crimson"], "W": C["white"]}),
    "food": (["..W..", ".RWR.", "RRRRR", "RRRDD", ".DDD."], {"R": C["clay"], "W": C["skin"], "D": C["rust"]}),
    "supplies": (["SS...", "SLS..", ".SLS.", "..SWW", "...WW"], {"S": C["steel"], "L": C["mist"], "W": C["clay"]}),
    "gene": (["L...M", ".L.M.", "..X..", ".M.L.", "M...L"], {"L": N["light"], "M": C["lavender"], "X": C["white"]}),
    "atk": (["....W", "...WL", "..WL.", "DW...", ".D..."], {"W": C["white"], "L": C["steel"], "D": C["clay"]}),
    "hp": ([".R.R.", "RLRRR", "RRRRR", ".RRR.", "..R.."], {"R": C["red"], "L": C["peach"]}),
    "level": (["..G..", ".GGG.", "GGLGG", ".G.G.", "G...G"], {"G": C["gold"], "L": C["lemon"]}),
    "skull": ([".WWW.", "WEWEW", "WWWWW", ".W.W."], {"W": C["mist"], "E": INK}),
}


def icon(name):
    rows, legend = ICONS[name]
    s = sprite(len(rows[0]) + 2, len(rows) + 2)
    grid(s, 1, 1, rows, legend)
    outline(s)
    return image(s), (s.w / 2, s.h / 2)


def mirror(im):
    return im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
