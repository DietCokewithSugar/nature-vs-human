"""Builds every sprite into public/sprites/: atlas.png + atlas.json (PixiJS spritesheet) and map.png.

    npm run sprites        (python3 art/build.py)

Keys: unit/<id>/walk0..3, unit/<id>/attack0..1, building/<id>, pad/<kind>, scaffold/<side>,
proj/<kind>[..], ring/<side>/<w>, fx/<name><n>, icon/<name>, terrain/<side>/<lane>-<seg>.
"""
from __future__ import annotations

import os

from buildings import ALL_BUILDINGS
from kit import PREVIEW, ROOT, Atlas, check_palette, contact
from map import SEGMENTS, background, territory
from props import cone, fireball, flame, hit, icon, ICONS, pad, poof, ring, rubble, scaffold, smoke, spear
from units import ALL_UNITS

OUT = os.path.join(ROOT, "public", "sprites")


def main() -> None:
    atlas = Atlas()
    rows = []
    for uid, make in ALL_UNITS.items():
        frames, anchor = make()
        row = []
        for anim, ims in frames.items():
            for i, im in enumerate(ims):
                # Attack frames are wider: keep the feet where the walk frames have them.
                atlas.add(f"unit/{uid}/{anim}{i}", im, anchor)
                row.append(im)
        rows.append(row)
    brow = []
    for bid, make in ALL_BUILDINGS.items():
        im, anchor = make()
        atlas.add(f"building/{bid}", im, anchor)
        brow.append(im)
    for kind in ("nature", "human", "field"):
        im, anchor = pad(kind)
        atlas.add(f"pad/{kind}", im, anchor, keep=True)
    for side in ("nature", "human"):
        im, anchor = scaffold(side)
        atlas.add(f"scaffold/{side}", im, anchor)
        for w in (8, 12, 16, 20, 26, 34):
            im, anchor = ring(side, w)
            atlas.add(f"ring/{side}/{w}", im, anchor, keep=True)
    for a in range(-2, 3):
        im, anchor = spear(a, 12)
        atlas.add(f"proj/spear{a + 2}", im, anchor)
        im, anchor = spear(a, 9, tip="#c7dcd0")
        atlas.add(f"proj/javelin{a + 2}", im, anchor)
    im, anchor = cone()
    atlas.add("proj/cone", im, anchor)
    for t in range(2):
        im, anchor = fireball(t)
        atlas.add(f"proj/fire{t}", im, anchor)
    for name, make, n in [("hit", hit, 3), ("poof", poof, 4), ("rubble", rubble, 3), ("flame", flame, 3), ("smoke", smoke, 3)]:
        for t in range(n):
            im, anchor = make(t)
            atlas.add(f"fx/{name}{t}", im, anchor, keep=name in ("flame", "smoke"))
    for name in ICONS:
        im, anchor = icon(name)
        atlas.add(f"icon/{name}", im, anchor, keep=True)
    for side in ("nature", "human"):
        for lane in range(3):
            for seg in range(SEGMENTS):
                im = territory(side, lane, seg)
                atlas.add(f"terrain/{side}/{lane}-{seg}", im, (0, 0), keep=True)
    for key, im, _ in atlas.items:
        check_palette(im, key)
    atlas.pack(os.path.join(OUT, "atlas.png"), os.path.join(OUT, "atlas.json"))
    bg = background()
    check_palette(bg, "map")
    bg.save(os.path.join(OUT, "map.png"))
    print("map: 576x320 -> public/sprites/map.png")
    contact(os.path.join(PREVIEW, "all-units.png"), rows, scale=4)
    contact(os.path.join(PREVIEW, "all-buildings.png"), [brow], scale=3)


if __name__ == "__main__":
    main()
