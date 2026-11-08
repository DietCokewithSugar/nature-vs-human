"""Buildings, seen from the front and a little above (3/4 view), light from the top left.

Nature's buildings glow mint somewhere (runes, eyes, sprouts); the humans' fly orange-red
banners. Each one's silhouette says what it makes: a red ant mound, an antlered grove, a
tusk arch, a fanged cave, a hide tent with crossed spears.
"""
from __future__ import annotations

from kit import TEAM, C, grid, image, outline, sprite

N = TEAM["nature"]
H = TEAM["human"]


def shaded_ellipse(s, x0, y0, x1, y1, dark, mid, light, hi=None):
    """Shifted-shape shading: darkest silhouette, then lighter shapes nudged to the top left."""
    s.ellipse(x0, y0, x1, y1, dark)
    s.ellipse(x0, y0, x1 - 2, y1 - 2, mid, only="opaque")
    w, h = x1 - x0, y1 - y0
    s.ellipse(x0 + 1, y0, x0 + w * 0.6, y0 + h * 0.55, light, only="opaque")
    if hi:
        s.ellipse(x0 + w * 0.18, y0 + 1, x0 + w * 0.38, y0 + h * 0.25, hi, only="opaque")


def rock(s, x0, y0, x1, y1, dark=None, mid=None, light=None, snow=True):
    dark = dark or C["slate"]
    mid = mid or C["lilacGrey"]
    light = light or C["steel"]
    shaded_ellipse(s, x0, y0, x1, y1, dark, mid, light)
    if snow:
        w = x1 - x0
        s.ellipse(x0 + 1, y0, x0 + w * 0.7, y0 + 3, C["white"], only="opaque")


def banner(s, x, y, h=12, flip=False, side="human"):
    """A pole with a pennant in the side's colours."""
    t = TEAM[side]
    s.line(x, y, x, y + h, C["umber"])
    d = -1 if flip else 1
    rows = [(0, 4), (1, 5), (2, 5), (3, 4), (4, 3)]
    for j, (a, b) in enumerate(rows):
        for i in range(a, b):
            col = t["mid"] if j < 3 else t["dark"]
            if j == 0:
                col = t["light"]
            s.px(x + d * (i - a + 1), y + j, col)


def glow(s, pts, col=None):
    for x, y in pts:
        s.px(x, y, col or N["mid"])


def canopy(s, blobs, dark, mid, light, hi=None):
    """A tree crown from overlapping round clusters, shaded from the top left."""
    for cx, cy, r in blobs:
        s.circle(cx, cy, r, dark, fill=True)
    for cx, cy, r in blobs:
        s.circle(cx - 1, cy - 1, max(1, r - 1), mid, fill=True, only="opaque")
    for cx, cy, r in blobs:
        s.circle(cx - 2, cy - 2, max(1, r - 3), light, fill=True, only="opaque")
    if hi:
        for cx, cy, r in blobs:
            if r >= 5:
                s.circle(cx - 3, cy - 3, max(1, r - 5), hi, fill=True, only="opaque")


# ── Nature ──────────────────────────────────────────────────────────────────


def mothertree():
    s = sprite(72, 84)
    # Roots spreading over the ground.
    for x0, x1 in [(14, 4), (20, 12), (50, 60), (46, 68), (30, 22), (42, 50)]:
        s.line(x0 + 3, 74, x1 + 3, 80, C["umber"])
        s.line(x0 + 4, 74, x1 + 4, 80, C["plum"])
    # Trunk.
    s.polygon([(24, 82), (28, 44), (44, 44), (50, 82)], C["umber"])
    s.polygon([(27, 80), (30, 46), (38, 46), (37, 80)], C["plum"], only="opaque")
    s.polygon([(29, 78), (31, 48), (34, 48), (32, 78)], C["dusk"], only="opaque")
    for y in range(50, 78, 6):
        s.line(40, y, 44, y + 3, C["night"])
    # Glowing runes on the bark.
    glow(s, [(35, 56), (36, 57), (35, 58), (34, 59), (38, 64), (38, 65), (39, 66), (37, 66), (35, 71), (36, 72)])
    glow(s, [(36, 57), (38, 65)], N["light"])
    # The crown: big, layered, lush.
    blobs = [(20, 30, 12), (36, 20, 15), (53, 30, 12), (30, 38, 11), (46, 40, 11), (12, 40, 8), (62, 40, 8), (36, 34, 12)]
    canopy(s, blobs, C["pine"], C["forest"], C["green"], C["leaf"])
    # Mint blossoms and fruit of light in the crown.
    glow(s, [(24, 22), (40, 12), (48, 28), (16, 34), (58, 36), (30, 30), (42, 40), (22, 40), (54, 22)], N["light"])
    glow(s, [(25, 23), (41, 13), (49, 29), (31, 31)], N["mid"])
    outline(s)
    return image(s), (37, 80)


def meadow():
    s = sprite(36, 24)
    shaded_ellipse(s, 1, 8, 34, 22, C["bog"], C["sage"], C["sageLight"])
    # Tall grass tufts.
    for x in range(4, 32, 3):
        h = 4 + (x * 7) % 4
        base = 15 + (x % 2)
        s.line(x, base, x - 1, base - h, C["forest"])
        s.line(x + 1, base, x + 2, base - h + 1, C["green"])
        s.px(x - 1, base - h, C["leaf"])
    # Flowers.
    for x, y, col in [(7, 11, "pink"), (13, 9, "gold"), (21, 10, "pink"), (27, 12, "gold"), (17, 14, "white"), (30, 15, "pink"), (10, 16, "gold")]:
        s.px(x, y, C[col])
    # A glowing sapling marks it as nature's.
    s.line(18, 8, 18, 3, C["forest"])
    glow(s, [(17, 2), (19, 2), (18, 1), (16, 3), (20, 3)])
    glow(s, [(18, 2)], N["light"])
    outline(s)
    return image(s), (18, 20)


def ancient():
    s = sprite(36, 52)
    # Gnarled trunk with arms.
    s.polygon([(10, 50), (13, 20), (23, 20), (26, 50)], C["umber"])
    s.polygon([(13, 48), (15, 22), (19, 22), (18, 48)], C["plum"], only="opaque")
    s.line(14, 28, 4, 18, C["umber"]); s.line(14, 29, 5, 19, C["umber"]); s.line(4, 18, 3, 13, C["umber"])
    s.line(22, 28, 32, 20, C["umber"]); s.line(22, 29, 32, 21, C["umber"]); s.line(32, 20, 33, 15, C["umber"])
    # Face: glowing eyes and a knot mouth.
    glow(s, [(15, 32), (16, 32), (20, 32), (21, 32)], N["light"])
    glow(s, [(15, 33), (21, 33)])
    s.line(16, 38, 20, 38, C["night"])
    s.px(18, 39, C["night"])
    # Crown and the cone it throws.
    canopy(s, [(18, 12, 9), (9, 14, 6), (27, 13, 6)], C["pine"], C["forest"], C["green"])
    s.ellipse(9, 4, 26, 7, C["white"], only="opaque")
    for x, y in [(6, 18), (30, 18), (18, 21)]:
        s.px(x, y, C["rust"]); s.px(x, y + 1, C["clay"])
    outline(s)
    return image(s), (18, 49)


def anthill():
    s = sprite(38, 26)
    # A low, wide mound of red earth with a cone on top.
    s.polygon([(1, 25), (8, 14), (15, 6), (19, 3), (23, 6), (30, 14), (36, 25)], C["rust"])
    s.polygon([(3, 24), (9, 15), (15, 8), (19, 5), (22, 8), (27, 15), (32, 24)], C["clay"], only="opaque")
    s.polygon([(5, 22), (10, 15), (15, 9), (18, 7), (17, 14), (12, 22)], C["tan"], only="opaque")
    for x, y in [(15, 11), (10, 19), (24, 17), (19, 21), (28, 22)]:
        s.ellipse(x, y, x + 3, y + 2, C["blood"])
        s.px(x + 1, y + 1, C["ink"]); s.px(x + 2, y + 1, C["ink"])
    s.ellipse(17, 3, 21, 6, C["ink"])
    # Ants on the slopes.
    for x, y in [(7, 20), (13, 13), (25, 12), (31, 21), (21, 16)]:
        s.px(x, y, C["crimson"]); s.px(x + 1, y, C["blood"])
    # Leaf flag at the top: the leafcutters' colours.
    s.line(23, 5, 25, 0, C["umber"])
    glow(s, [(26, 0), (27, 0), (26, 1), (27, 1), (28, 1), (26, 2)])
    glow(s, [(27, 0)], N["light"])
    outline(s)
    return image(s), (19, 24)


def glade():
    s = sprite(40, 38)
    shaded_ellipse(s, 2, 26, 37, 36, C["bog"], C["sage"], C["sageLight"])
    # Two birches.
    for x, h in [(8, 22), (31, 18)]:
        s.rect(x, 32 - h, x + 2, 32, C["white"])
        s.line(x + 2, 32 - h, x + 2, 32, C["steel"])
        for y in range(34 - h, 32, 4):
            s.px(x + (y % 3), y, C["ink"])
        canopy(s, [(x + 1, 32 - h - 2, 6)], C["olive"], C["moss"], C["pear"])
    # An antler arch over a mossy bed.
    for (x0, y0), (x1, y1) in [((13, 30), (14, 18)), ((14, 18), (20, 13)), ((20, 13), (26, 18)), ((26, 18), (27, 30))]:
        s.line(x0, y0, x1, y1, C["straw"])
        s.line(x0 + 1, y0, x1 + 1, y1, C["tan"])
    for x, y in [(12, 20), (11, 17), (16, 14), (24, 14), (28, 17), (29, 20)]:
        s.px(x, y, C["straw"])
    s.ellipse(15, 26, 26, 31, C["ink"])
    glow(s, [(19, 28), (21, 28)], N["light"])
    glow(s, [(18, 15), (22, 15)])
    outline(s)
    return image(s), (20, 34)


def valley():
    s = sprite(46, 40)
    # An icy hollow: blue-white rocks around a dark mouth.
    rock(s, 1, 14, 20, 38, C["indigo"], C["sky"], C["ice"])
    rock(s, 25, 12, 45, 38, C["indigo"], C["sky"], C["ice"])
    rock(s, 10, 4, 36, 30, C["indigo"], C["sky"], C["ice"])
    s.ellipse(14, 20, 32, 38, C["navy"])
    s.ellipse(16, 23, 30, 38, C["ink"], only="opaque")
    # Tusks curving over the mouth, a skull between them.
    for pts in ([(12, 36), (11, 26), (14, 18), (19, 14)], [(34, 36), (35, 26), (32, 18), (27, 14)]):
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            s.line(x0, y0, x1, y1, C["skin"])
            s.line(x0 + 1, y0, x1 + 1, y1, C["white"])
    s.ellipse(19, 10, 27, 17, C["mist"])
    s.px(21, 13, C["ink"]); s.px(25, 13, C["ink"])
    glow(s, [(21, 13), (25, 13)], N["light"])
    glow(s, [(20, 30), (23, 29), (26, 31)])
    outline(s)
    return image(s), (23, 37)


def den():
    s = sprite(40, 40)
    # A rocky den under a tall howling rock.
    rock(s, 22, 0, 34, 30, C["plum"], C["dusk"], C["khaki"])
    rock(s, 1, 18, 22, 39, C["plum"], C["dusk"], C["khaki"])
    rock(s, 16, 14, 38, 39, C["plum"], C["dusk"], C["khaki"])
    rock(s, 8, 12, 28, 32, C["plum"], C["dusk"], C["khaki"])
    s.ellipse(12, 24, 28, 40, C["umber"])
    s.ellipse(14, 26, 26, 40, C["ink"], only="opaque")
    # Eyes in the dark.
    glow(s, [(17, 31), (22, 31)], N["light"])
    glow(s, [(17, 32), (22, 32)])
    # Bones by the entrance.
    s.line(4, 37, 9, 35, C["mist"]); s.px(3, 37, C["white"]); s.px(9, 34, C["white"])
    outline(s)
    return image(s), (20, 38)


def sabercave():
    s = sprite(42, 34)
    rock(s, 1, 6, 41, 33, C["rust"], C["clay"], C["tan"])
    rock(s, 6, 2, 34, 22, C["rust"], C["clay"], C["tan"])
    s.ellipse(11, 14, 31, 34, C["blood"])
    s.ellipse(13, 16, 29, 34, C["ink"], only="opaque")
    # Fangs hanging over the mouth.
    for x, h in [(14, 6), (18, 4), (23, 4), (27, 6)]:
        for k in range(h):
            s.px(x, 16 + k, C["white"] if k < h - 1 else C["mist"])
            if k < h - 2:
                s.px(x + 1, 16 + k, C["mist"])
    glow(s, [(19, 26), (23, 26)], N["light"])
    outline(s)
    return image(s), (21, 32)


def bearcave():
    s = sprite(46, 36)
    rock(s, 1, 10, 45, 35, C["night"], C["slate"], C["lilacGrey"])
    rock(s, 7, 2, 39, 26, C["night"], C["slate"], C["lilacGrey"])
    s.ellipse(12, 15, 34, 36, C["ink"])
    # Claw marks either side of the entrance.
    for x in (6, 36):
        for k in range(3):
            s.line(x + k * 2, 14, x + k * 2 + 2, 20, C["ink"])
    glow(s, [(20, 25), (26, 25)], N["light"])
    glow(s, [(20, 26), (26, 26)])
    # Moss on the brow.
    for x in range(14, 33, 2):
        s.px(x, 13, N["dark"])
    outline(s)
    return image(s), (23, 34)


# ── Humans ──────────────────────────────────────────────────────────────────


def hide_tent(s, x0, y0, w, h, hide=None, dark=None, light=None):
    hide = hide or C["khaki"]
    dark = dark or C["dusk"]
    light = light or C["skin"]
    cx = x0 + w // 2
    s.polygon([(x0, y0 + h), (cx, y0), (x0 + w, y0 + h)], dark)
    s.polygon([(x0 + 1, y0 + h - 1), (cx, y0 + 1), (x0 + w - 3, y0 + h - 1)], hide, only="opaque")
    s.polygon([(x0 + 2, y0 + h - 2), (cx - 1, y0 + 3), (cx - 1, y0 + h - 2)], light, only="opaque")
    # Stitched seams.
    for k in range(3, h, 4):
        s.px(cx - k // 3, y0 + k, C["dusk"])
        s.px(cx + k // 3, y0 + k, C["dusk"])
    # Poles poking out of the top.
    s.line(cx - 2, y0 - 3, cx, y0 + 1, C["umber"])
    s.line(cx + 2, y0 - 3, cx, y0 + 1, C["umber"])


def lodge():
    s = sprite(72, 64)
    # A big dome of mammoth hides on a tusk frame.
    s.ellipse(6, 14, 66, 62, C["dusk"])
    s.ellipse(7, 15, 63, 60, C["khaki"], only="opaque")
    s.ellipse(9, 16, 44, 44, C["skin"], only="opaque")
    for y in range(22, 60, 6):
        s.line(8, y, 64, y + 1, C["dusk"], only="opaque")
    # Tusk ribs over the dome.
    for x0 in (16, 30, 44, 56):
        s.line(x0, 60, x0 - 4 + (x0 // 20), 22, C["white"])
        s.line(x0 + 1, 60, x0 - 3 + (x0 // 20), 22, C["mist"])
    # The entrance under a tusk arch.
    s.ellipse(28, 40, 44, 64, C["umber"])
    s.ellipse(30, 43, 42, 64, C["ink"], only="opaque")
    for pts in ([(27, 62), (26, 48), (30, 40), (35, 37)], [(45, 62), (46, 48), (42, 40), (37, 37)]):
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            s.line(x0, y0, x1, y1, C["white"])
    # Smoke hole and chief's banners.
    s.ellipse(32, 10, 40, 16, C["ink"])
    banner(s, 8, 4, 30)
    banner(s, 64, 4, 30, flip=True)
    banner(s, 36, 0, 12)
    outline(s)
    return image(s), (36, 61)


def rack():
    s = sprite(36, 30)
    # A-frame posts and a cross pole.
    for x0, x1 in [(4, 8), (12, 8), (24, 28), (32, 28)]:
        s.line(x0, 28, x1, 6, C["umber"])
    s.line(6, 8, 30, 8, C["clay"])
    s.line(6, 9, 30, 9, C["rust"])
    # Strips of meat drying.
    for x in range(10, 28, 3):
        h = 8 + (x % 4)
        s.line(x, 10, x, 10 + h, C["crimson"])
        s.line(x + 1, 10, x + 1, 9 + h, C["red"])
        s.px(x, 10 + h, C["blood"])
    banner(s, 30, 0, 10)
    outline(s)
    return image(s), (18, 28)


def spearcamp():
    s = sprite(40, 36)
    hide_tent(s, 2, 10, 24, 24)
    s.ellipse(11, 26, 17, 34, C["ink"])
    # Crossed spears on a rack.
    for x0, y0, x1, y1 in [(26, 34, 36, 8), (36, 34, 26, 8), (31, 34, 31, 6)]:
        s.line(x0, y0, x1, y1, C["clay"])
        s.px(x1, y1 - 1, C["steel"])
        s.px(x1, y1 - 2, C["mist"])
    s.line(25, 26, 37, 26, C["umber"])
    banner(s, 4, 2, 14)
    outline(s)
    return image(s), (18, 34)


def javelincamp():
    s = sprite(40, 34)
    # A lean-to of hides.
    s.polygon([(2, 32), (10, 10), (26, 10), (26, 32)], C["dusk"])
    s.polygon([(3, 31), (11, 12), (24, 12), (24, 31)], C["khaki"], only="opaque")
    s.polygon([(4, 30), (11, 14), (14, 14), (10, 30)], C["skin"], only="opaque")
    s.line(10, 10, 27, 10, C["umber"])
    # A target post with javelins stuck in it.
    s.rect(31, 14, 33, 32, C["umber"])
    s.ellipse(28, 12, 37, 21, C["straw"])
    s.ellipse(30, 14, 35, 19, H["mid"])
    s.px(32, 16, C["ink"])
    for x0, y0 in [(24, 13), (26, 20), (25, 17)]:
        s.line(x0, y0, x0 + 6, y0 + 2, C["clay"])
    banner(s, 2, 0, 14)
    outline(s)
    return image(s), (18, 32)


def firepit():
    s = sprite(38, 36)
    # Stone ring.
    s.ellipse(4, 20, 34, 34, C["slate"])
    s.ellipse(6, 22, 32, 32, C["night"], only="opaque")
    for x in range(5, 34, 4):
        s.ellipse(x, 21 + (x % 3), x + 3, 24 + (x % 3), C["steel"])
    # Big flames.
    s.polygon([(10, 29), (14, 12), (17, 20), (19, 8), (22, 19), (25, 14), (28, 29)], C["orange"])
    s.polygon([(13, 29), (16, 18), (19, 13), (22, 20), (25, 29)], C["amber"], only="opaque")
    s.polygon([(16, 29), (19, 18), (22, 29)], C["gold"], only="opaque")
    s.line(19, 26, 19, 22, C["lemon"])
    # Torches on poles either side.
    for x in (2, 35):
        s.line(x, 33, x, 14, C["umber"])
        s.px(x, 13, C["orange"]); s.px(x, 12, C["gold"]); s.px(x, 11, C["amber"])
    banner(s, 2, 2, 8)
    outline(s)
    return image(s), (19, 33)


def tower():
    s = sprite(28, 56)
    # Stilts with cross braces.
    for x0, x1 in [(4, 7), (22, 19)]:
        s.line(x0, 54, x1, 18, C["umber"])
        s.line(x0 + 1, 54, x1 + 1, 18, C["rust"])
    s.line(6, 46, 20, 30, C["umber"]); s.line(20, 46, 6, 30, C["umber"])
    # Platform and a hide roof.
    s.rect(3, 16, 24, 20, C["clay"])
    s.line(3, 16, 24, 16, C["tan"])
    s.line(3, 20, 24, 20, C["rust"])
    s.polygon([(1, 12), (13, 2), (26, 12)], C["dusk"])
    s.polygon([(3, 11), (13, 4), (20, 11)], C["khaki"], only="opaque")
    # A lookout with a spear.
    s.rect(11, 12, 15, 16, C["apricot"])
    s.line(11, 12, 15, 12, H["mid"])
    s.line(18, 2, 18, 16, C["clay"]); s.px(18, 1, C["steel"])
    banner(s, 24, 4, 10)
    outline(s)
    return image(s), (13, 54)


NATURE_BUILDINGS = {
    "mothertree": mothertree, "meadow": meadow, "ancient": ancient, "anthill": anthill, "glade": glade,
    "valley": valley, "den": den, "sabercave": sabercave, "bearcave": bearcave,
}
HUMAN_BUILDINGS = {"lodge": lodge, "rack": rack, "spearcamp": spearcamp, "javelincamp": javelincamp, "firepit": firepit, "tower": tower}
ALL_BUILDINGS = {**NATURE_BUILDINGS, **HUMAN_BUILDINGS}
