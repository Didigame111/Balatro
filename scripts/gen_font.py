#!/usr/bin/env python3
"""Build a pixel-art TrueType font with no third-party dependencies.

Each glyph is a 5x7 bitmap (plus two descender rows). Horizontal runs of set
pixels become rectangles, and those rectangles become TrueType contours, so the
outlines stay tiny and render crisply at any size.
"""

import struct
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "fonts" / "pixel.ttf"

UPM = 1000          # units per em
PX = 100            # one bitmap pixel, in font units
ROWS_ABOVE = 7      # rows sitting on/above the baseline
ADVANCE = 6 * PX    # 5 wide + 1 spacing

# --------------------------------------------------------------------------
# Glyph bitmaps. '#' is ink. Rows past the seventh hang below the baseline.
# --------------------------------------------------------------------------

G = {
    " ": ["....."] * 7,
    "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
    '"': [".#.#.", ".#.#.", ".....", ".....", ".....", ".....", "....."],
    "#": [".#.#.", ".#.#.", "#####", ".#.#.", "#####", ".#.#.", ".#.#."],
    "$": ["..#..", ".####", "#.#..", ".###.", "..#.#", "####.", "..#.."],
    "%": ["##..#", "##.#.", "..#..", ".#...", "#..##", ".#.##", "#...."],
    "&": [".##..", "#..#.", "#.#..", ".#...", "#.#.#", "#..#.", ".##.#"],
    "'": ["..#..", "..#..", ".....", ".....", ".....", ".....", "....."],
    "(": ["...#.", "..#..", ".#...", ".#...", ".#...", "..#..", "...#."],
    ")": [".#...", "..#..", "...#.", "...#.", "...#.", "..#..", ".#..."],
    "*": [".....", "#.#.#", ".###.", "#####", ".###.", "#.#.#", "....."],
    "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
    ",": [".....", ".....", ".....", ".....", ".....", "..##.", "..##.", ".#...", "....."],
    "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
    ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
    "/": ["....#", "...#.", "..#..", "..#..", "..#..", ".#...", "#...."],
    "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
    "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
    "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
    "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
    "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
    "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
    "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
    "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
    "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
    ":": [".....", "..#..", "..#..", ".....", "..#..", "..#..", "....."],
    ";": [".....", "..#..", "..#..", ".....", "..#..", "..#..", ".#..."],
    "<": ["...#.", "..#..", ".#...", "#....", ".#...", "..#..", "...#."],
    "=": [".....", ".....", "#####", ".....", "#####", ".....", "....."],
    ">": [".#...", "..#..", "...#.", "....#", "...#.", "..#..", ".#..."],
    "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
    "@": [".###.", "#...#", "#.###", "#.#.#", "#.###", "#....", ".###."],
    "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "B": ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
    "C": [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
    "D": ["###..", "#..#.", "#...#", "#...#", "#...#", "#..#.", "###.."],
    "E": ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    "F": ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
    "G": [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
    "H": ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "I": [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "J": ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
    "K": ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
    "L": ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    "M": ["#...#", "##.##", "#.#.#", "#...#", "#...#", "#...#", "#...#"],
    "N": ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
    "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "P": ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
    "Q": [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
    "R": ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    "S": [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
    "T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    "U": ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "V": ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
    "W": ["#...#", "#...#", "#...#", "#...#", "#.#.#", "##.##", "#...#"],
    "X": ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
    "Y": ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
    "Z": ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
    "[": [".###.", ".#...", ".#...", ".#...", ".#...", ".#...", ".###."],
    "\\": ["#....", ".#...", "..#..", "..#..", "..#..", "...#.", "....#"],
    "]": [".###.", "...#.", "...#.", "...#.", "...#.", "...#.", ".###."],
    "^": ["..#..", ".#.#.", "#...#", ".....", ".....", ".....", "....."],
    "_": [".....", ".....", ".....", ".....", ".....", ".....", "#####"],
    "`": [".#...", "..#..", ".....", ".....", ".....", ".....", "....."],
    "a": [".....", ".....", ".###.", "....#", ".####", "#...#", ".####"],
    "b": ["#....", "#....", "####.", "#...#", "#...#", "#...#", "####."],
    "c": [".....", ".....", ".###.", "#....", "#....", "#....", ".###."],
    "d": ["....#", "....#", ".####", "#...#", "#...#", "#...#", ".####"],
    "e": [".....", ".....", ".###.", "#...#", "#####", "#....", ".###."],
    "f": ["..##.", ".#...", "####.", ".#...", ".#...", ".#...", ".#..."],
    "g": [".....", ".....", ".####", "#...#", "#...#", ".####", "....#", ".###.", "....."],
    "h": ["#....", "#....", "####.", "#...#", "#...#", "#...#", "#...#"],
    "i": ["..#..", ".....", ".##..", "..#..", "..#..", "..#..", ".###."],
    "j": ["...#.", ".....", "..##.", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
    "k": ["#....", "#....", "#..#.", "#.#..", "##...", "#.#..", "#..#."],
    "l": [".##..", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "m": [".....", ".....", "##.#.", "#.#.#", "#.#.#", "#...#", "#...#"],
    "n": [".....", ".....", "####.", "#...#", "#...#", "#...#", "#...#"],
    "o": [".....", ".....", ".###.", "#...#", "#...#", "#...#", ".###."],
    "p": [".....", ".....", "####.", "#...#", "#...#", "####.", "#....", "#....", "....."],
    "q": [".....", ".....", ".####", "#...#", "#...#", ".####", "....#", "....#", "....."],
    "r": [".....", ".....", "#.##.", "##...", "#....", "#....", "#...."],
    "s": [".....", ".....", ".####", "#....", ".###.", "....#", "####."],
    "t": [".#...", ".#...", "####.", ".#...", ".#...", ".#..#", "..##."],
    "u": [".....", ".....", "#...#", "#...#", "#...#", "#...#", ".####"],
    "v": [".....", ".....", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
    "w": [".....", ".....", "#...#", "#...#", "#.#.#", "#.#.#", ".#.#."],
    "x": [".....", ".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
    "y": [".....", ".....", "#...#", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
    "z": [".....", ".....", "#####", "...#.", "..#..", ".#...", "#####"],
    "{": ["..##.", "..#..", "..#..", ".#...", "..#..", "..#..", "..##."],
    "|": ["..#..", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    "}": [".##..", "..#..", "..#..", "...#.", "..#..", "..#..", ".##.."],
    "~": [".....", ".....", ".##.#", "#..#.", ".....", ".....", "....."],
}

# Symbols the interface actually uses, so they match the rest of the type.
EXTRA = {
    0x00B7: [".....", ".....", ".....", "..#..", ".....", ".....", "....."],   # ·
    0x00D7: [".....", ".....", "#...#", ".#.#.", "#...#", ".....", "....."],   # ×
    0x2014: [".....", ".....", ".....", "#####", ".....", ".....", "....."],   # —
    0x2192: [".....", "..#..", "...#.", "#####", "...#.", "..#..", "....."],   # →
    0x2660: ["..#..", ".###.", "#####", "#####", "##.##", "..#..", ".###."],   # ♠
    0x2663: ["..#..", ".###.", ".###.", "#####", "#####", "..#..", ".###."],   # ♣
    0x2665: [".#.#.", "#####", "#####", "#####", ".###.", "..#..", "....."],   # ♥
    0x2666: ["..#..", ".###.", "#####", ".###.", "..#..", ".....", "....."],   # ♦
}

# --------------------------------------------------------------------------
# Bitmap -> contours
# --------------------------------------------------------------------------


def runs(bitmap):
    """Horizontal runs of ink, as (x_start, x_end_exclusive, row)."""
    out = []
    for row, line in enumerate(bitmap):
        x = 0
        while x < len(line):
            if line[x] == "#":
                start = x
                while x < len(line) and line[x] == "#":
                    x += 1
                out.append((start, x, row))
            else:
                x += 1
    return out


def contours_for(bitmap):
    """One clockwise rectangle per run, in a y-up coordinate system."""
    result = []
    for x0, x1, row in runs(bitmap):
        left = x0 * PX
        right = x1 * PX
        top = (ROWS_ABOVE - row) * PX
        bottom = top - PX
        # bottom-left, top-left, top-right, bottom-right is clockwise when y is up
        result.append([(left, bottom), (left, top), (right, top), (right, bottom)])
    return result


def glyph_data(bitmap):
    contours = contours_for(bitmap)
    if not contours:
        return b""

    points = [pt for c in contours for pt in c]
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]

    end_pts = []
    n = 0
    for c in contours:
        n += len(c)
        end_pts.append(n - 1)

    data = struct.pack(">hhhhh", len(contours), min(xs), min(ys), max(xs), max(ys))
    data += struct.pack(f">{len(end_pts)}H", *end_pts)
    data += struct.pack(">H", 0)                      # no instructions

    # All points are on-curve; emit flags one per point (no repeat compression).
    data += bytes([0x01] * len(points))

    prev = 0
    for x, _ in points:
        data += struct.pack(">h", x - prev)
        prev = x
    prev = 0
    for _, y in points:
        data += struct.pack(">h", y - prev)
        prev = y
    return data


# --------------------------------------------------------------------------
# sfnt assembly
# --------------------------------------------------------------------------


def pad4(b):
    return b + b"\0" * (-len(b) % 4)


def checksum(data):
    data = pad4(data)
    total = 0
    for i in range(0, len(data), 4):
        total = (total + struct.unpack(">I", data[i:i + 4])[0]) & 0xFFFFFFFF
    return total


def build():
    # Glyph order: .notdef, then ASCII 32..126, then the extras.
    order = [None] + [chr(c) for c in range(32, 127)] + list(EXTRA.keys())
    bitmaps = []
    for entry in order:
        if entry is None:
            bitmaps.append(["....."] * 7)
        elif isinstance(entry, int):
            bitmaps.append(EXTRA[entry])
        else:
            bitmaps.append(G.get(entry, ["....."] * 7))

    glyphs = [pad4(glyph_data(b)) for b in bitmaps]
    num_glyphs = len(glyphs)

    # glyf + loca
    glyf = b"".join(glyphs)
    offsets = [0]
    for g in glyphs:
        offsets.append(offsets[-1] + len(g))
    long_loca = offsets[-1] > 0x1FFFF
    if long_loca:
        loca = b"".join(struct.pack(">I", o) for o in offsets)
    else:
        loca = b"".join(struct.pack(">H", o // 2) for o in offsets)

    # hmtx: every glyph is the same width, this is a monospaced pixel font.
    hmtx = b"".join(struct.pack(">Hh", ADVANCE, 0) for _ in range(num_glyphs))

    descender = -2 * PX
    ascender = ROWS_ABOVE * PX

    head = struct.pack(
        ">IIIIHHQQhhhhHHhhh",
        0x00010000, 0x00010000, 0, 0x5F0F3CF5,
        0b0000000000000011,      # baseline at y=0, lsb at x=0
        UPM, 0, 0,               # created / modified
        0, descender, 5 * PX, ascender,
        0, PX, 2,                # macStyle, lowestRecPPEM, fontDirectionHint
        1 if long_loca else 0,   # indexToLocFormat
        0,                       # glyphDataFormat
    )

    hhea = struct.pack(
        ">IhhhHhhhhhhhhhhhH",
        0x00010000, ascender, descender, 0,
        ADVANCE, 0, 5 * PX, ADVANCE,
        1, 0, 0, 0, 0, 0, 0, 0,
        num_glyphs,
    )

    maxp = struct.pack(">IHHHHHHHHHHHHHH", 0x00010000, num_glyphs,
                       64, 32, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0)

    os2 = struct.pack(
        ">HhHHH" + "h" * 10 + "h" + "10s" + "IIII" + "4s" + "HHH" + "hhh" + "HH" + "II" + "hh" + "HHH",
        4,                                   # version
        ADVANCE, 700, 5, 0,                  # xAvgCharWidth, weight, width, fsType
        0, 0, 0, 0, 0, 0, 0, 0,              # sub/superscript metrics
        PX, 3 * PX,                          # strikeout size / position
        8,                                   # sFamilyClass: ornamental
        bytes([2, 0, 5, 9, 0, 0, 0, 0, 0, 0]),   # panose: monospaced
        0x00000003, 0, 0, 0,                 # unicode ranges (latin)
        b"PIXL",
        0x0040,                              # fsSelection: regular
        0x20, 0x2666,                        # first / last char index
        ascender, descender, 0,              # typo ascender / descender / lineGap
        ascender, -descender,                # win ascent / descent
        1, 0,                                # code page ranges (latin-1)
        5 * PX, 7 * PX,                      # xHeight, capHeight
        0, 0x20, 1,                          # default char, break char, maxContext
    )

    # cmap format 4: ASCII in one run, then a segment per extra symbol.
    segs = [(32, 126, 1 - 32)]
    gid = 96
    for code in EXTRA:
        segs.append((code, code, gid - code))
        gid += 1
    segs.append((0xFFFF, 0xFFFF, 1))
    seg_count = len(segs)

    search_range = 2 * (2 ** (seg_count.bit_length() - 1))
    sub = struct.pack(">HHHHHHH", 4, 16 + 8 * seg_count, 0, seg_count * 2,
                      search_range, seg_count.bit_length() - 1,
                      seg_count * 2 - search_range)
    sub += b"".join(struct.pack(">H", e) for _, e, _ in segs)
    sub += struct.pack(">H", 0)
    sub += b"".join(struct.pack(">H", s) for s, _, _ in segs)
    sub += b"".join(struct.pack(">h", ((d + 32768) % 65536) - 32768) for _, _, d in segs)
    sub += b"".join(struct.pack(">H", 0) for _ in segs)
    cmap = struct.pack(">HHHHI", 0, 1, 3, 1, 12) + sub

    def name_record(strings):
        header = struct.pack(">HHH", 0, len(strings), 6 + 12 * len(strings))
        records = b""
        pool = b""
        for name_id, text in strings:
            data = text.encode("utf-16-be")
            records += struct.pack(">HHHHHH", 3, 1, 0x409, name_id, len(data), len(pool))
            pool += data
        return header + records + pool

    name = name_record([
        (1, "Balatro Pixel"), (2, "Regular"), (3, "BalatroPixel-Regular"),
        (4, "Balatro Pixel"), (5, "Version 1.0"), (6, "BalatroPixel-Regular"),
    ])

    post = struct.pack(">IIhhIIIII", 0x00030000, 0, -PX, PX, 1, 0, 0, 0, 0)

    tables = {
        b"OS/2": os2, b"cmap": cmap, b"glyf": glyf, b"head": head,
        b"hhea": hhea, b"hmtx": hmtx, b"loca": loca, b"maxp": maxp,
        b"name": name, b"post": post,
    }

    tags = sorted(tables)
    num_tables = len(tags)
    entry_selector = num_tables.bit_length() - 1
    search_range = 16 * (2 ** entry_selector)
    header = struct.pack(">IHHHH", 0x00010000, num_tables, search_range,
                         entry_selector, num_tables * 16 - search_range)

    offset = len(header) + 16 * num_tables
    directory = b""
    body = b""
    for tag in tags:
        data = tables[tag]
        directory += struct.pack(">4sIII", tag, checksum(data), offset + len(body), len(data))
        body += pad4(data)

    font = header + directory + body

    # head.checkSumAdjustment is computed over the finished file.
    head_offset = offset + sum(len(pad4(tables[t])) for t in tags[:tags.index(b"head")])
    adjustment = (0xB1B0AFBA - checksum(font)) & 0xFFFFFFFF
    font = font[:head_offset + 8] + struct.pack(">I", adjustment) + font[head_offset + 12:]
    return font


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    data = build()
    OUT.write_bytes(data)
    print(f"wrote {OUT.relative_to(OUT.parent.parent)} ({len(data)} bytes)")


if __name__ == "__main__":
    main()
