#!/usr/bin/env python3
"""Outlines a word in the site's display face (Archivo, wght 800, wdth 78) as SVG path data.

Used by scripts/brand-marks.ts for the "ShinyQ HQ" lockup, so the lockup file needs no web font.
Prints JSON: {"words": [{"d": ..., "x0": ..., "advance": ...}], "unitsPerEm", "capHeight"}.
Needs fonttools and brotli (the same tools as scripts/subset-fonts.sh).

    python3 scripts/brand-wordmark.py ShinyQ HQ
"""
import json
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

FONT = "src/assets/fonts/archivo-ascii-wdth72-92-wght600-800.woff2"
LETTER_SPACING = 0.01  # em, like the header lockup in the exploration


def main(words):
    font = instantiateVariableFont(TTFont(FONT), {"wght": 800, "wdth": 78})
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font["head"].unitsPerEm
    cap = font["OS/2"].sCapHeight
    space = glyphs[cmap[ord(" ")]].width
    out = []
    x = 0.0
    for i, word in enumerate(words):
        if i:
            x += space
        pen = SVGPathPen(glyphs)
        start = x
        for ch in word:
            name = cmap[ord(ch)]
            # Font units are y-up; SVG is y-down with the baseline at 0.
            glyphs[name].draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))
            x += glyphs[name].width + LETTER_SPACING * upm
        out.append({"d": pen.getCommands(), "x0": start, "advance": x - start})
    json.dump({"words": out, "unitsPerEm": upm, "capHeight": cap, "width": x}, sys.stdout)


if __name__ == "__main__":
    main(sys.argv[1:] or ["ShinyQ", "HQ"])
