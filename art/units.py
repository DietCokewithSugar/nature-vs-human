"""Units: nature's six animals and the humans' four tribespeople, all facing right.

Each unit is drawn from parts (body, head, legs) so the walk and attack frames are
function calls, not redrawn by hand. Animals carry a mint leaf collar and people an
orange-red headband or sash: the team colour.
"""
from __future__ import annotations

from kit import INK, TEAM, C, grid, image, outline, sprite

N = TEAM["nature"]
H = TEAM["human"]


def thick_line(s, x0, y0, x1, y1, col, w=2):
    """A Bresenham line w px wide (extra width to the right)."""
    for k in range(w):
        s.line(x0 + k, y0, x1 + k, y1, col)


def leg(s, hip, knee, foot, col, w=2, paw=None):
    thick_line(s, hip[0], hip[1], knee[0], knee[1], col, w)
    thick_line(s, knee[0], knee[1], foot[0], foot[1], col, w)
    if paw:
        s.px(foot[0] + w, foot[1], paw)


# ── Wolf ────────────────────────────────────────────────────────────────────

WOLF = {
    "L": C["steel"], "M": C["lilacGrey"], "S": C["slate"], "D": C["night"], "W": C["mist"],
    "E": C["gold"], "N": INK, "G": N["mid"], "A": N["dark"], "T": C["white"], "R": C["crimson"],
}

# 28 wide. Ears up, long muzzle, deep chest, tucked belly, bushy tail hanging from the rump.
WOLF_BODY = [
    "...................L.L......",
    "...................LMLL.....",
    "..................LMMMMM....",
    "......LLLLLLLLLLLLMMMMEMMM..",
    "....LLMMMMMMMMMMMMMMMMMMMMMN",
    "...LMMMMMMMMMMMMMMMMMMWWWWD.",
    "..LMMMMMMMMMMMMMMMMMMGGWW...",
    "..LMMMMMMMMMMMMMMMMMGAWWWW..",
    ".LLSMMMMMMMMMMMMMMMMMWWWWW..",
    "LMS.SMMMMMMMMMMMMMMMMWWWW...",
    "MS..SSSSSMMMMMMMSSSSSSWW....",
    "W...SSSS.......SSSSS........",
]
# The bite: jaws open, teeth showing.
WOLF_BITE = [
    "...................L.L......",
    "...................LMLL.....",
    "..................LMMMMM..N.",
    "......LLLLLLLLLLLLMMMMEMMMM.",
    "....LLMMMMMMMMMMMMMMMMMMTTT.",
    "...LMMMMMMMMMMMMMMMMMMRRR...",
    "..LMMMMMMMMMMMMMMMMMMGGWTTT.",
    "..LMMMMMMMMMMMMMMMMMGAWWWWD.",
    ".LLSMMMMMMMMMMMMMMMMMWWWWW..",
    "LMS.SMMMMMMMMMMMMMMMMWWWW...",
    "MS..SSSSSMMMMMMMSSSSSSWW....",
    "W...SSSS.......SSSSS........",
]


def quad_walk(stride):
    """Leg poses for a 4-frame trot: (knee dx, foot dx, lift) per leg: far-back, near-back, far-front, near-front."""
    a, b = stride, -stride
    return [
        [(a, a, 0), (b, b, 0), (b, b, 0), (a, a, 0)],
        [(0, 1, 1), (0, 0, 0), (0, -1, 1), (0, 0, 0)],
        [(b, b, 0), (a, a, 0), (a, a, 0), (b, b, 0)],
        [(0, 0, 0), (0, 1, 1), (0, 0, 0), (0, -1, 1)],
    ]


def wolf():
    frames = {"walk": [], "attack": []}
    ox, oy = 1, 1
    hips = [(5, 11), (6, 11), (16, 11), (17, 11)]
    far, near = C["night"], C["slate"]
    for pose, bob in zip(quad_walk(2), [0, -1, 0, -1]):
        s = sprite(31, 21)
        for i, ((hx, hy), (kdx, fdx, lift)) in enumerate(zip(hips, pose)):
            col = far if i % 2 == 0 else near
            hind = i < 2
            knee = (hx + ox + kdx // 2 + (1 if hind else 0), hy + oy + 3 + bob)
            foot = (hx + ox + fdx, hy + oy + 6 - lift)
            leg(s, (hx + ox, hy + oy + bob), knee, foot, col)
        grid(s, ox, oy + bob, WOLF_BODY, WOLF)
        outline(s)
        frames["walk"].append(image(s))
    # Attack: crouch back, then lunge with the jaws open.
    for rows, lunge, crouch in [(WOLF_BODY, -1, 1), (WOLF_BITE, 2, 0)]:
        s = sprite(33, 21)
        for i, (hx, hy) in enumerate(hips):
            col = far if i % 2 == 0 else near
            front = i >= 2
            sx = hx + ox + (lunge if front else 0) + 1
            knee = (sx + (1 if front else 0), hy + oy + 3 + crouch)
            foot = (sx + (2 if front and lunge > 0 else 0) - (1 if not front and lunge > 0 else 0), hy + oy + 6)
            leg(s, (sx, hy + oy + crouch), knee, foot, col)
        grid(s, ox + 1 + lunge, oy + crouch, rows, WOLF)
        outline(s)
        frames["attack"].append(image(s))
    return frames, (16, 19)




def quadruped(body, bite, legend, hips, leg_len, leg_w, far, near, size, anchor, stride=2, knee_back=1, ox=1, oy=1, lunge=2, shade=None):
    """Generic four-legged walker: a body grid (with and without an open mouth) on four jointed legs."""
    w, h = size
    frames = {"walk": [], "attack": []}
    for pose, bob in zip(quad_walk(stride), [0, -1, 0, -1]):
        s = sprite(w, h)
        for i, ((hx, hy), (kdx, fdx, lift)) in enumerate(zip(hips, pose)):
            col = far if i % 2 == 0 else near
            hind = i < 2
            knee = (hx + ox + kdx // 2 + (knee_back if hind else 0), hy + oy + leg_len // 2 + bob)
            foot = (hx + ox + fdx, hy + oy + leg_len - lift)
            leg(s, (hx + ox, hy + oy + bob), knee, foot, col, leg_w)
        grid(s, ox, oy + bob, body, legend)
        if shade:
            shade(s, ox, oy + bob)
        outline(s)
        frames["walk"].append(image(s))
    for rows, dx, crouch in [(body, -1, 1), (bite, lunge, 0)]:
        s = sprite(w + lunge + 1, h)
        for i, (hx, hy) in enumerate(hips):
            col = far if i % 2 == 0 else near
            front = i >= 2
            sx = hx + ox + 1 + (dx if front else 0)
            knee = (sx + (1 if front else knee_back), hy + oy + leg_len // 2 + crouch)
            foot = (sx + (2 if front and dx > 0 else 0) - (1 if not front and dx > 0 else 0), hy + oy + leg_len)
            leg(s, (sx, hy + oy + crouch), knee, foot, col, leg_w)
        grid(s, ox + 1 + dx, oy + crouch, rows, legend)
        if shade:
            shade(s, ox + 1 + dx, oy + crouch)
        outline(s)
        frames["attack"].append(image(s))
    return frames, anchor


# ── Sabertooth ──────────────────────────────────────────────────────────────

SABER = {
    "L": C["straw"], "M": C["tan"], "S": C["clay"], "D": C["rust"], "K": C["rust"], "W": C["skin"],
    "E": C["lime"], "N": INK, "T": C["white"], "G": N["mid"], "A": N["dark"], "R": C["crimson"],
}
SABER_BODY = [
    "..................LL........",
    ".................LMML.L.....",
    "......LLLLLLLLLLLMMMMLML....",
    "....LLMMKMMKMMKMMMMMMEMM....",
    "...LMMMMKMMKMMKMMMMMMMMMMN..",
    "..LMMMMMMMMMMMMMMMMMMWWWWW..",
    ".LMMMMMMMMMMMMMMMMMGGWW.T...",
    "LLSMMMMMMMMMMMMMMMMAGWW.T...",
    "L.SSMMMMMMMMMMMMMMMMWW..T...",
    "..SSSSSSSMMMMMMMSSSSSW......",
    "...SSSS.......SSSSS.........",
]
SABER_BITE = [
    "..................LL........",
    ".................LMML.L.....",
    "......LLLLLLLLLLLMMMMLMLMN..",
    "....LLMMKMMKMMKMMMMMMEMMT...",
    "...LMMMMKMMKMMKMMMMMMMMRT...",
    "..LMMMMMMMMMMMMMMMMMMWRRT...",
    ".LMMMMMMMMMMMMMMMMMGGWWWW...",
    "LLSMMMMMMMMMMMMMMMMAGWW.....",
    "L.SSMMMMMMMMMMMMMMMMWW......",
    "..SSSSSSSMMMMMMMSSSSSW......",
    "...SSSS.......SSSSS.........",
]


def sabertooth():
    return quadruped(SABER_BODY, SABER_BITE, SABER, [(4, 10), (5, 10), (15, 10), (16, 10)], 6, 2, C["rust"], C["clay"], (31, 20), (16, 18))


# ── Cave bear ───────────────────────────────────────────────────────────────

BEAR = {
    "L": C["dusk"], "K": C["plum"], "M": C["umber"], "S": C["charcoal"], "W": C["khaki"], "E": INK, "N": INK,
    "G": N["mid"], "A": N["dark"], "T": C["white"], "R": C["crimson"],
}
BEAR_BODY = [
    "...........LLLL................",
    "........LLLLKKKKLL......LL.....",
    "......LLKKKKKKKKKKLL...LKKL....",
    "....LLKKKMMMMMMMMMKKLLLKKKKL...",
    "...LKKMMMMMMMMMMMMMMMMKKKKEKL..",
    "..LKMMMMMMMMMMMMMMMMMMMKKKKKWWN",
    "..KMMMMMMMMMMMMMMMMMMMGGMKKWWW.",
    ".LKMMMMMMMMMMMMMMMMMMMAGMMMMM..",
    ".KMMMMMMMMMMMMMMMMMMMMMMMMMMM..",
    ".SMMMMMMMMMMMMMMMMMMMMMMMMMMS..",
    "..SSSSMMMMMMMMMMMMMMMMSSSSSS...",
    "...SSSSSS.........SSSSSS.......",
]
BEAR_BITE = [
    "...........LLLL................",
    "........LLLLKKKKLL......LL.....",
    "......LLKKKKKKKKKKLL...LKKL..N.",
    "....LLKKKMMMMMMMMMKKLLLKKKKLWT.",
    "...LKKMMMMMMMMMMMMMMMMKKKKEKRR.",
    "..LKMMMMMMMMMMMMMMMMMMMKKKKKRR.",
    "..KMMMMMMMMMMMMMMMMMMMGGMKKWWT.",
    ".LKMMMMMMMMMMMMMMMMMMMAGMMMWW..",
    ".KMMMMMMMMMMMMMMMMMMMMMMMMMMM..",
    ".SMMMMMMMMMMMMMMMMMMMMMMMMMMS..",
    "..SSSSMMMMMMMMMMMMMMMMSSSSSS...",
    "...SSSSSS.........SSSSSS.......",
]


def bear():
    return quadruped(BEAR_BODY, BEAR_BITE, BEAR, [(4, 11), (6, 11), (19, 11), (21, 11)], 5, 3, C["charcoal"], C["umber"], (34, 21), (17, 19), stride=1, knee_back=0)


# ── Megaloceros (giant elk) ─────────────────────────────────────────────────

ELK = {
    "L": C["clay"], "M": C["rust"], "S": C["wine"], "W": C["skin"], "E": INK, "N": INK,
    "A": C["straw"], "K": C["tan"], "G": N["mid"], "Q": N["dark"], "T": C["white"],
}
ELK_BODY = [
    "..............A..A..A....A.....",
    "..............AAKAAKAA..AA.....",
    "...............AKKKKKAAAA......",
    ".................KK.KKKK.......",
    "..................KK.KK........",
    "...................LMML........",
    "...................MMEMM.......",
    "..................LMMMMMMN.....",
    ".................LMMMWWW.......",
    ".................MMGGW.........",
    "................LMQGWW.........",
    ".....LLLLLLLLLLLMMMMWW.........",
    "...LWLMMMMMMMMMMMMMMW..........",
    "..WWMMMMMMMMMMMMMMMMW..........",
    "..WSMMMMMMMMMMMMMMMMS..........",
    "...SSSSSSSSSSSSSSSSS...........",
]
ELK_BITE = [
    "...................A..A..A....A",
    "...................AAKAAKAA..AA",
    "....................AKKKKKAAAA.",
    "......................KK.KKKK..",
    ".......................KK.KK...",
    ".....................LMMMLL....",
    "....................LMMEMMMMN..",
    "...................LMMMMWWW....",
    "..................LMMMGGW......",
    ".................LMMMQGWW......",
    "................LMMMMWW........",
    ".....LLLLLLLLLLLMMMMMW.........",
    "...LWLMMMMMMMMMMMMMMW..........",
    "..WWMMMMMMMMMMMMMMMMW..........",
    "..WSMMMMMMMMMMMMMMMMS..........",
    "...SSSSSSSSSSSSSSSSS...........",
]


def elk():
    return quadruped(ELK_BODY, ELK_BITE, ELK, [(4, 15), (5, 15), (16, 15), (17, 15)], 9, 2, C["wine"], C["rust"], (34, 28), (15, 26), stride=2)


# ── Mammoth ─────────────────────────────────────────────────────────────────

MAMMOTH = {
    "L": C["clay"], "M": C["rust"], "S": C["blood"], "D": C["aubergine"], "E": INK, "T": C["skin"], "U": C["white"],
    "G": N["mid"], "A": N["dark"], "F": N["light"],
}
# Domed head, dark ear behind the eye, a hump, sloping back, shaggy fringe. Trunk and tusks are drawn on top.
MAMMOTH_BODY = [
    "...........................LLLL...........",
    ".........................LLMMMML..........",
    "...............LLLLLLL.LLMMMMMMML.........",
    "...........LLLLMMMMMMMLLMMMMMMMMML........",
    "........LLLMMMMMMMMMMMMMMSMMMMMMMMM.......",
    "......LLMMMMMMMMMMMMMMMMSSSMMMMEMMM.......",
    ".....LMMMMMMMMMMMMMMMMMMSSSSMMMMMMMM......",
    "....LMMMMMMMMMMMMMMMMMMMSSSSMMMMMMMMS.....",
    "...LMMMMMMMMMMMMMMMMMMMMMSSMMMMMMMMSS.....",
    "..LMMMMMMMMMMMMMMMMMMMMMMGFGMMMMMMMSS.....",
    "..MMMMMMMMMMMMMMMMMMMMMMMAGAMMMMMMMS......",
    ".LMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMS.......",
    ".MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMS........",
    ".MSMMMMMMMMMMMMMMMMMMMMMMMMMMMMMSS........",
    ".MSSMMMMMMMMMMMMMMMMMMMMMMMMMMMSSS........",
    "..SSSMSMMMMMMMMMMMMMMMMSMSMSSSSSS.........",
    "..S.SSS.SMSMMMSMSMMMSMS.S.SS.SSS..........",
]
MAMMOTH_BITE = MAMMOTH_BODY


def _trunk_tusks(s, ox, oy, raised=False):
    """The trunk hangs from the face and curls; the near tusk sweeps forward and up in front of it."""
    if raised:
        thick_line(s, ox + 34, oy + 8, ox + 38, oy + 4, C["rust"], 3)
        thick_line(s, ox + 38, oy + 4, ox + 40, oy + 1, C["rust"], 2)
        s.px(ox + 41, oy + 1, C["blood"])
    else:
        thick_line(s, ox + 33, oy + 9, ox + 34, oy + 17, C["rust"], 3)
        s.line(ox + 36, oy + 10, ox + 36, oy + 17, C["blood"])
        thick_line(s, ox + 34, oy + 18, ox + 37, oy + 19, C["rust"], 2)
        s.px(ox + 38, oy + 18, C["blood"])
    tusk = [(31, 12), (33, 14), (36, 15), (39, 14), (41, 12), (41, 10)]
    for (x0, y0), (x1, y1) in zip(tusk, tusk[1:]):
        thick_line(s, ox + x0, oy + y0, ox + x1, oy + y1, C["skin"], 2)
    for (x0, y0), (x1, y1) in zip(tusk, tusk[1:]):
        s.line(ox + x0, oy + y0 - 0, ox + x1, oy + y1 - 0, C["white"])


def mammoth():
    frames, anchor = quadruped(
        MAMMOTH_BODY, MAMMOTH_BITE, MAMMOTH, [(5, 15), (8, 15), (23, 15), (26, 15)], 7, 4, C["blood"], C["rust"], (46, 27), (22, 25),
        stride=1, knee_back=0, lunge=2, shade=lambda s, ox, oy: _trunk_tusks(s, ox, oy),
    )
    # The swing: trunk raised, then the tusks come down.
    return frames, anchor


# ── Ant (a leafcutter with a mint leaf: the team colour) ────────────────────

ANT = {"L": C["vermilion"], "M": C["brick"], "S": C["blood"], "G": N["mid"], "A": N["dark"], "F": N["light"], "E": INK}
ANT_BODY = [
    "........FG.....",
    ".......FGGG....",
    "......GGGGAA...",
    "........A..L.L.",
    ".LLL....A.LML..",
    "LMMMML.LML MMLS",
    "MMMMMMMMMMMMME.",
    ".SMMS..SS.SS...",
]
ANT_BITE = [
    ".........FG....",
    "........FGGG...",
    ".......GGGGAA..",
    ".........A..L.L",
    ".LLL.....A.LML.",
    "LMMMML.LMLLMMLS",
    "MMMMMMMMMMMMMES",
    ".SMMS..SS.SS...",
]


def ant():
    frames = {"walk": [], "attack": []}
    legs = [
        [(4, -1), (8, 1), (11, -1)],
        [(4, 0), (8, 0), (11, 0)],
        [(4, 1), (8, -1), (11, 1)],
        [(4, 0), (8, 0), (11, 0)],
    ]
    for i, pose in enumerate(legs):
        s = sprite(18, 12)
        bob = -1 if i % 2 else 0
        for x, dx in pose:
            s.line(x + 1, 8 + bob, x + 1 + dx, 10, C["blood"])
            s.line(x + 2, 8 + bob, x + 2 - dx, 10, C["blood"])
        grid(s, 1, 1 + bob, ANT_BODY, ANT)
        outline(s)
        frames["walk"].append(image(s))
    for rows, dx in [(ANT_BODY, -1), (ANT_BITE, 1)]:
        s = sprite(19, 12)
        for x in (4, 8, 11):
            s.line(x + 2 + dx, 8, x + 1 + dx, 10, C["blood"])
            s.line(x + 3 + dx, 8, x + 3 + dx, 10, C["blood"])
        grid(s, 2 + dx, 1, rows, ANT)
        outline(s)
        frames["attack"].append(image(s))
    return frames, (9, 11)


ANIMALS = {"ant": ant, "elk": elk, "mammoth": mammoth, "wolf": wolf, "sabertooth": sabertooth, "bear": bear}


# ── People ──────────────────────────────────────────────────────────────────
# Chibi tribespeople: a big head with an orange-red headband (the team colour), a fur tunic,
# and the tool of their trade, which is what tells them apart at a glance.

PEOPLE = {
    "h": C["umber"], "F": C["apricot"], "f": C["tan"], "E": INK, "B": H["mid"], "b": H["dark"],
    "T": C["khaki"], "t": C["dusk"], "W": C["white"], "w": C["mist"], "K": C["umber"], "k": C["night"],
    "S": H["mid"], "s": H["dark"],
}
HEAD = [
    ".hhhhh.",
    "hhhhhhh",
    "BBBBBBB",
    "hhFFFEF",
    "hhFFFFF",
    ".hfFFFf",
    "..fff..",
]
TUNIC = {
    "gatherer": ["TTTTTT", "TTTTTT", "STTTTT", "TSTTTT", "TTSTTT", "tttttt"],
    "spearman": ["WwwwwW", "wWWWWw", "TSTTTT", "TTSTTT", "TTTSTT", "tttttt"],
    "javelin": ["TTTTTT", "tTTTTT", "SSSSSS", "TTTTTT", "TTTTTT", "tttttt"],
    "torch": ["bbbbbb", "BbbbbB", "TTTTTT", "TTTTTT", "STTTTS", "tttttt"],
}


def _flame(s, x, y, t):
    """A small torch flame, flickering with t (0–3)."""
    shapes = [
        [(0, -3, "gold"), (0, -2, "gold"), (-1, -1, "amber"), (0, -1, "lemon"), (1, -1, "amber"), (0, 0, "orange")],
        [(1, -3, "gold"), (0, -2, "gold"), (1, -2, "amber"), (-1, -1, "amber"), (0, -1, "lemon"), (0, 0, "orange")],
        [(0, -4, "amber"), (0, -3, "gold"), (0, -2, "lemon"), (-1, -1, "orange"), (0, -1, "gold"), (1, -1, "orange"), (0, 0, "orange")],
        [(-1, -3, "gold"), (0, -2, "gold"), (-1, -2, "amber"), (0, -1, "lemon"), (1, -1, "amber"), (0, 0, "orange")],
    ]
    for dx, dy, col in shapes[t % 4]:
        s.px(x + dx, y + dy, C[col])


def person(kind, pose, t):
    """pose: 'walk' (t = 0..3) or 'windup' / 'strike'."""
    s = sprite(30, 30)
    ox, oy = 11, 6
    walk = pose == "walk"
    bob = -1 if walk and t % 2 == 1 else 0
    swing = [1, 0, -1, 0][t % 4] if walk else 0
    # Things carried on the back go first.
    if kind == "gatherer":
        grid(s, ox - 2, oy + 7 + bob, ["KKKK", "kTTk", "kTTk", "kTTk", "kkkk"], {"K": C["clay"], "k": C["rust"], "T": C["straw"]})
    if kind == "javelin":
        # A bundle of javelins slung across the back, points up behind the head.
        for i in (0, 3):
            s.line(ox - 4 + i, oy + 13 + bob, ox + i, oy - 2 + bob, C["clay"])
            s.px(ox + i, oy - 3 + bob, C["steel"])
            s.px(ox + i, oy - 4 + bob, C["mist"])
    # Legs: far leg darker.
    far, near = C["night"], C["dusk"]
    lx = [ox + 2, ox + 4]
    step = [swing, -swing]
    for i, col in enumerate([far, near]):
        x = lx[i]
        for y in range(oy + 12 + bob, oy + 17):
            k = (y - (oy + 12 + bob)) / 4
            s.px(x + round(step[i] * k), y, col)
            s.px(x + 1 + round(step[i] * k), y, col)
        s.px(x + 2 + step[i], oy + 16, C["umber"])
    # Far arm.
    if walk:
        s.line(ox + 1 - swing, oy + 8 + bob, ox + 1 - swing, oy + 11 + bob, C["tan"])
    grid(s, ox + 1, oy + 7 + bob, TUNIC[kind], PEOPLE)
    grid(s, ox, oy + bob, HEAD, PEOPLE)
    # Near arm and the tool.
    hx, hy = ox + 5, oy + 10 + bob
    if kind == "spearman":
        if pose == "walk":
            s.line(hx + 1, hy - 12, hx + 1, hy + 4, C["clay"])
            s.px(hx + 1, hy - 13, C["mist"]); s.px(hx + 1, hy - 14, C["steel"]); s.px(hx, hy - 12, C["steel"]); s.px(hx + 2, hy - 12, C["steel"])
            s.line(ox + 4, oy + 8 + bob, hx, hy, C["apricot"])
        else:
            reach = -3 if pose == "windup" else 4
            y = hy - 1
            s.line(hx - 9 + reach, y, hx + 5 + reach, y, C["clay"])
            s.px(hx + 6 + reach, y, C["mist"]); s.px(hx + 7 + reach, y, C["steel"]); s.px(hx + 6 + reach, y - 1, C["steel"]); s.px(hx + 6 + reach, y + 1, C["steel"])
            s.line(ox + 4, oy + 8, hx + reach // 2, y, C["apricot"])
    elif kind == "javelin":
        if pose == "walk":
            s.line(ox + 4, oy + 8 + bob, hx, hy - 1, C["apricot"])
        elif pose == "windup":
            s.line(ox + 3, oy + 8, ox, oy + 5, C["apricot"])
            s.line(ox - 4, oy + 6, ox + 6, oy + 3, C["clay"])
            s.px(ox + 7, oy + 2, C["steel"])
        else:
            s.line(ox + 4, oy + 8, hx + 3, oy + 5, C["apricot"])
    elif kind == "torch":
        if pose == "walk":
            s.line(hx + 3, hy - 4, hx + 2, hy + 1, C["rust"])
            s.line(ox + 4, oy + 8 + bob, hx + 2, hy, C["apricot"])
            _flame(s, hx + 3, hy - 5, t)
        else:
            tip = (hx + 6, hy - 6) if pose == "strike" else (hx - 3, hy - 8)
            s.line(hx, hy - 1, tip[0], tip[1] + 2, C["rust"])
            s.line(ox + 4, oy + 8, hx, hy - 1, C["apricot"])
            _flame(s, tip[0], tip[1], t + 2)
            if pose == "strike":
                _flame(s, tip[0] + 2, tip[1] + 1, t + 1)
    else:  # gatherer: a digging stick
        if pose == "walk":
            s.line(hx + 1, hy - 4, hx + 2, hy + 4, C["clay"])
            s.line(ox + 4, oy + 8 + bob, hx, hy, C["apricot"])
        else:
            tip = (hx + 6, hy) if pose == "strike" else (hx - 1, hy - 8)
            s.line(hx, hy - 1, tip[0], tip[1], C["clay"])
            s.line(ox + 4, oy + 8, hx, hy - 1, C["apricot"])
    outline(s)
    return image(s)


def people(kind):
    def make():
        return {
            "walk": [person(kind, "walk", t) for t in range(4)],
            "attack": [person(kind, "windup", 0), person(kind, "strike", 1)],
        }, (14, 23)
    return make


HUMANS = {k: people(k) for k in ("gatherer", "spearman", "javelin", "torch")}
ALL_UNITS = {**ANIMALS, **HUMANS}
