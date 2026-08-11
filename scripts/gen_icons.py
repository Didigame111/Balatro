#!/usr/bin/env python3
"""Generate the app icons as PNGs with no third-party dependencies.

Draws two fanned playing cards on a dark background, with a red heart pip on
the front card. Everything is rendered with 3x supersampling for smooth edges.
"""

import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"

BG_TOP = (58, 76, 89)
BG_BOTTOM = (27, 36, 44)
CARD = (251, 251, 243)
CARD_EDGE = (200, 200, 186)
BACK_CARD = (176, 190, 200)
HEART = (224, 64, 63)
SPADE = (43, 52, 64)

SS = 3  # supersampling factor


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def rounded_rect(px, py, cx, cy, hw, hh, r, angle):
    """Signed test for a rotated rounded rectangle centred on (cx, cy)."""
    ca, sa = math.cos(-angle), math.sin(-angle)
    dx, dy = px - cx, py - cy
    x = dx * ca - dy * sa
    y = dx * sa + dy * ca
    qx = abs(x) - (hw - r)
    qy = abs(y) - (hh - r)
    if qx < 0 and qy < 0:
        return True
    qx = max(qx, 0.0)
    qy = max(qy, 0.0)
    return qx * qx + qy * qy <= r * r


def heart(px, py, cx, cy, size):
    x = (px - cx) / size
    y = -(py - cy) / size
    t = x * x + y * y - 1.0
    return t * t * t - x * x * y * y * y <= 0.0


def spade(px, py, cx, cy, size):
    x = (px - cx) / size
    y = (py - cy) / size  # spade is a vertically flipped heart plus a stem
    t = x * x + y * y - 1.0
    if t * t * t - x * x * y * y * y <= 0.0:
        return True
    # stem
    return abs(x) < 0.10 + 0.22 * max(0.0, y - 0.55) and 0.55 < y < 1.25


def render(size, maskable=False):
    pad = 0.0 if not maskable else 0.10
    rows = []
    inset = size * pad
    span = size - 2 * inset

    for py in range(size):
        row = bytearray()
        for px in range(size):
            r = g = b = 0
            for sy in range(SS):
                for sx in range(SS):
                    fx = px + (sx + 0.5) / SS
                    fy = py + (sy + 0.5) / SS
                    col = shade(fx, fy, size, inset, span)
                    r += col[0]
                    g += col[1]
                    b += col[2]
            n = SS * SS
            row += bytes((r // n, g // n, b // n))
        rows.append(bytes(row))
    return rows


def shade(fx, fy, size, inset, span):
    # Background gradient.
    col = lerp(BG_TOP, BG_BOTTOM, min(1.0, max(0.0, fy / size)))

    cx = inset + span * 0.5
    cy = inset + span * 0.52
    hw = span * 0.235
    hh = span * 0.335
    rad = span * 0.055

    # Back card, fanned to the left.
    bx = cx - span * 0.115
    if rounded_rect(fx, fy, bx, cy, hw, hh, rad, math.radians(-16)):
        col = BACK_CARD
    if rounded_rect(fx, fy, bx, cy, hw * 0.86, hh * 0.9, rad, math.radians(-16)):
        col = lerp(BACK_CARD, BG_BOTTOM, 0.28)

    # Front card, fanned to the right.
    fxp = cx + span * 0.085
    if rounded_rect(fx, fy, fxp, cy, hw + span * 0.006, hh + span * 0.006, rad, math.radians(11)):
        col = CARD_EDGE
    if rounded_rect(fx, fy, fxp, cy, hw, hh, rad, math.radians(11)):
        col = CARD
        # Pips on the front card, rotated with it.
        ca, sa = math.cos(math.radians(-11)), math.sin(math.radians(-11))
        dx, dy = fx - fxp, fy - cy
        lx = dx * ca - dy * sa
        ly = dx * sa + dy * ca
        if heart(lx, ly, 0, -span * 0.02, span * 0.115):
            col = HEART
        elif spade(lx, ly, -hw * 0.62, -hh * 0.66, span * 0.045):
            col = SPADE

    return col


def write_png(path, rows, size):
    raw = b"".join(b"\x00" + row for row in rows)

    def chunk(tag, data):
        payload = tag + data
        return struct.pack(">I", len(data)) + payload + struct.pack(">I", zlib.crc32(payload) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)
    print(f"wrote {path.relative_to(path.parent.parent)} ({len(png)} bytes)")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for size, name, maskable in [
        (180, "apple-touch-icon.png", False),
        (192, "icon-192.png", False),
        (512, "icon-512.png", False),
        (512, "icon-maskable-512.png", True),
    ]:
        write_png(OUT / name, render(size, maskable), size)


if __name__ == "__main__":
    main()
