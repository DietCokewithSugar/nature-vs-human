"""Shared drawing kit for the sprite build scripts.

Every sprite in the game is drawn here, in code, one pixel at a time, with the
pixel-art-studio library (art/lib/pixelstudio.py, MIT, Gamezxz). The rules from
docs/art-style.md are enforced in one place: the Resurrect 64 palette, a 1 px ink
outline, light from the top left, feet at the bottom centre.
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))

from PIL import Image  # noqa: E402

from pixelstudio import Sprite, hex2rgba  # noqa: E402,F401

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PREVIEW = os.path.join(ROOT, "art", ".preview")

# Resurrect 64 by Kerrie Lake — the only colours the game uses.
R64 = [
    "#2e222f", "#3e3546", "#625565", "#966c6c", "#ab947a", "#694f62", "#7f708a", "#9babb2",
    "#c7dcd0", "#ffffff", "#6e2727", "#b33831", "#ea4f36", "#f57d4a", "#ae2334", "#e83b3b",
    "#fb6b1d", "#f79617", "#f9c22b", "#7a3045", "#9e4539", "#cd683d", "#e6904e", "#fbb954",
    "#4c3e24", "#676633", "#a2a947", "#d5e04b", "#fbff86", "#165a4c", "#239063", "#1ebc73",
    "#91db69", "#cddf6c", "#313638", "#374e4a", "#547e64", "#92a984", "#b2ba90", "#0b5e65",
    "#0b8a8f", "#0eaf9b", "#30e1b9", "#8ff8e2", "#323353", "#484a77", "#4d65b4", "#4d9be6",
    "#8fd3ff", "#45293f", "#6b3e75", "#905ea9", "#a884f3", "#eaaded", "#753c54", "#a24b6f",
    "#cf657f", "#ed8099", "#831c5d", "#c32454", "#f04f78", "#f68181", "#fca790", "#fdcbb0",
]

# Named entries (same names as src/pixel/palette.ts).
C = dict(
    ink="#2e222f", night="#3e3546", slate="#625565", dusk="#966c6c", khaki="#ab947a", plum="#694f62",
    lilacGrey="#7f708a", steel="#9babb2", mist="#c7dcd0", white="#ffffff", blood="#6e2727", brick="#b33831",
    vermilion="#ea4f36", salmon="#f57d4a", crimson="#ae2334", red="#e83b3b", orange="#fb6b1d", amber="#f79617",
    gold="#f9c22b", wine="#7a3045", rust="#9e4539", clay="#cd683d", tan="#e6904e", straw="#fbb954",
    umber="#4c3e24", olive="#676633", moss="#a2a947", lime="#d5e04b", lemon="#fbff86", pine="#165a4c",
    forest="#239063", green="#1ebc73", leaf="#91db69", pear="#cddf6c", charcoal="#313638", bog="#374e4a",
    sage="#547e64", sageLight="#92a984", reed="#b2ba90", deepTeal="#0b5e65", teal="#0b8a8f", aqua="#0eaf9b",
    mint="#30e1b9", foam="#8ff8e2", navy="#323353", indigo="#484a77", blue="#4d65b4", sky="#4d9be6",
    ice="#8fd3ff", aubergine="#45293f", grape="#6b3e75", violet="#905ea9", lavender="#a884f3", pink="#eaaded",
    rose="#753c54", raspberry="#a24b6f", coral="#cf657f", blush="#ed8099", magenta="#831c5d", cerise="#c32454",
    hotPink="#f04f78", peach="#f68181", apricot="#fca790", skin="#fdcbb0",
)

INK = C["ink"]
# Team colours: nature is mint/teal, the humans vermilion/orange. Every unit and building
# carries a patch of its side's colour (collar, banner, glow), like a team colour in an RTS.
TEAM = {
    "nature": dict(light=C["foam"], mid=C["mint"], dark=C["aqua"], deep=C["teal"]),
    "human": dict(light=C["salmon"], mid=C["vermilion"], dark=C["brick"], deep=C["blood"]),
}


def sprite(w: int, h: int) -> Sprite:
    return Sprite(w, h, palette=R64)


def grid(s: Sprite, x: int, y: int, rows: list[str], legend: dict[str, str | None]) -> None:
    """Stamp rows of letters at (x, y). '.' and ' ' are skipped; legend maps letters to colours."""
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch in ". ":
                continue
            col = legend.get(ch)
            if col is None and ch not in legend:
                raise KeyError(f"letter {ch!r} not in legend")
            s.px(x + i, y + j, col)


def outline(s: Sprite, color: str = INK) -> None:
    s.outline(color, where="outside")


def image(s: Sprite, frame: int = 1) -> Image.Image:
    return s.composite(frame).copy()


def flip(im: Image.Image) -> Image.Image:
    return im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)


def trim(im: Image.Image, anchor: tuple[float, float]) -> tuple[Image.Image, tuple[float, float]]:
    """Crop transparent margins, keeping the anchor (in source px) where it was."""
    box = im.getbbox()
    if not box:
        return im, (anchor[0] / im.width, anchor[1] / im.height)
    x0, y0, x1, y1 = box
    out = im.crop(box)
    return out, ((anchor[0] - x0) / out.width, (anchor[1] - y0) / out.height)


class Atlas:
    """Collects frames by key and packs them into one PNG + a PixiJS spritesheet JSON."""

    def __init__(self) -> None:
        self.items: list[tuple[str, Image.Image, tuple[float, float]]] = []
        self.keys: set[str] = set()

    def add(self, key: str, im: Image.Image, anchor_px: tuple[float, float], keep: bool = False) -> None:
        """anchor_px: the feet / ground point in source pixels. keep=True skips trimming."""
        if key in self.keys:
            raise ValueError(f"duplicate sprite key {key}")
        self.keys.add(key)
        if keep:
            self.items.append((key, im, (anchor_px[0] / im.width, anchor_px[1] / im.height)))
        else:
            out, anchor = trim(im, anchor_px)
            self.items.append((key, out, anchor))

    def pack(self, png: str, js: str, width: int = 1024) -> None:
        # Shelf packing, tallest first, 1 px gutter so neighbours never bleed.
        items = sorted(self.items, key=lambda t: (-t[1].height, -t[1].width, t[0]))
        x = y = shelf = 0
        place = {}
        for key, im, anchor in items:
            if x + im.width + 1 > width:
                x = 0
                y += shelf + 1
                shelf = 0
            place[key] = (x, y)
            x += im.width + 1
            shelf = max(shelf, im.height)
        height = y + shelf + 1
        h = 1
        while h < height:
            h *= 2
        sheet = Image.new("RGBA", (width, h), (0, 0, 0, 0))
        frames = {}
        for key, im, anchor in items:
            px, py = place[key]
            sheet.paste(im, (px, py))
            frames[key] = {
                "frame": {"x": px, "y": py, "w": im.width, "h": im.height},
                "rotated": False,
                "trimmed": False,
                "spriteSourceSize": {"x": 0, "y": 0, "w": im.width, "h": im.height},
                "sourceSize": {"w": im.width, "h": im.height},
                "anchor": {"x": round(anchor[0], 4), "y": round(anchor[1], 4)},
            }
        os.makedirs(os.path.dirname(png), exist_ok=True)
        sheet.save(png)
        meta = {"image": os.path.basename(png), "format": "RGBA8888", "size": {"w": width, "h": h}, "scale": "1"}
        with open(js, "w") as f:
            json.dump({"frames": dict(sorted(frames.items())), "meta": meta}, f, separators=(",", ":"))
        print(f"atlas: {len(frames)} frames, {width}x{h} -> {os.path.relpath(png, ROOT)}")


def contact(path: str, rows: list[list[Image.Image]], scale: int = 4, bg: str = "#c7dcd0", gap: int = 4) -> None:
    """A preview sheet: each row a list of frames, on a ground colour, integer-scaled."""
    w = max(sum(im.width + gap for im in r) for r in rows) + gap
    h = sum(max((im.height for im in r), default=0) + gap for r in rows) + gap
    sheet = Image.new("RGBA", (w, h), hex2rgba(bg))
    y = gap
    for r in rows:
        x = gap
        rh = max((im.height for im in r), default=0)
        for im in r:
            sheet.alpha_composite(im, (x, y + rh - im.height))
            x += im.width + gap
        y += rh + gap
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sheet.resize((w * scale, h * scale), Image.Resampling.NEAREST).save(path)


def check_palette(im: Image.Image, key: str) -> None:
    allowed = {hex2rgba(c)[:3] for c in R64}
    for px in im.getdata():
        if px[3] and px[:3] not in allowed:
            raise ValueError(f"{key}: colour {px[:3]} is not in Resurrect 64")
