"""Preview sheets for the look → critique → fix loop: python3 art/preview.py [names...]"""
from __future__ import annotations

import os
import sys

from kit import PREVIEW, contact
from units import ALL_UNITS as ANIMALS

names = sys.argv[1:] or list(ANIMALS)
rows = []
for n in names:
    frames, _ = ANIMALS[n]()
    rows.append(frames["walk"] + frames.get("attack", []))
contact(os.path.join(PREVIEW, "units.png"), rows, scale=8)
print("wrote", os.path.join(PREVIEW, "units.png"))
