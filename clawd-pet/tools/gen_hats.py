#!/usr/bin/env python3
"""Hats for clawd-pet: finds Clawd's head in every frame of the official sprites, writes
hooks/hats.ts (the hat art and where each frame's head is) and the hatted pictures,
frames-hat/<hat>/<sprite>/<n>[m].png, made the same way as frames/ (the canvas's bottom 32
rows, each pixel 4x4, `m` mirrored). Run from anywhere: python3 tools/gen_hats.py"""
import json, math, os, shutil
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CW, CH, AX, AY, PIC_PX = 48, 40, 20, 40, 32

# The art, top row first. `over`: the hat sits on the head (its last row just above the head's
# top row, or `drop` rows lower for a helmet that comes down round the head) and is drawn only
# where Clawd is not; False: it is worn across the forehead, its first row on the head's top row.
HATS = {
    'wizard': {
        'name': 'wizard hat',
        'over': True,
        'colors': {'P': '#3b4fb8', 'Q': '#2c3a8c', 'S': '#f6d860', 'Y': '#f0b429'},
        'art': [
            '..........PP........',
            '.........PPP........',
            '........PPPP........',
            '........PSPP........',
            '.......PPPPPP.......',
            '.......PPPPPP.......',
            '......PPPPPSPP......',
            '......PPPPPPPP......',
            '.....PPPPPPPPPP.....',
            '.....YYYYYYYYYY.....',
            'QQQQQQQQQQQQQQQQQQQQ',
        ],
    },
    'ninja': {
        'name': 'ninja headband',
        'over': False,
        'colors': {'B': '#2c4fa3', 'M': '#c9ccd6', 'K': '#6b7080'},
        'art': [
            '...BBBBMMMMMMMMMMBBBBBB.',
            '...BBBBMMMKKKKMMMBBBB.BB',
            '.......................B',
        ],
    },
    'tophat': {
        'name': 'top hat',
        'over': True,
        'colors': {'K': '#34343f', 'H': '#5c5c6e', 'R': '#c8323c'},
        'art': [
            '...KHKKKKKKKKKKK..',
            '...KHKKKKKKKKKKK..',
            '...KHKKKKKKKKKKK..',
            '...KHKKKKKKKKKKK..',
            '...RRRRRRRRRRRRR..',
            '...KKKKKKKKKKKKK..',
            'KKKKKKKKKKKKKKKKKK',
        ],
    },
    'cowboy': {
        'name': 'cowboy hat',
        'over': True,
        'colors': {'B': '#a0612a', 'H': '#c88a4a', 'K': '#5a3415'},
        'art': [
            '.......BBBB..BBBB.......',
            '......BBBBBBBBBBBB......',
            '......BHBBBBBBBBBB......',
            '......BHBBBBBBBBBB......',
            '......KKKKKKKKKKKK......',
            'BB....BBBBBBBBBBBB....BB',
            '.BBBBBBBBBBBBBBBBBBBBBB.',
            '..BBBBBBBBBBBBBBBBBBBB..',
        ],
    },
    'astronaut': {
        'name': 'astronaut helmet',
        'over': True,
        'drop': 5,
        'colors': {'W': '#e8ecf2', 'G': '#9fd3ff', 'L': '#ffffff', 'R': '#ff4d4d'},
        'art': [
            '...........RR...........',
            '.......WWWWWWWWWW.......',
            '.....WWGGGGGGGGGGWW.....',
            '....WGGGGGGGGGGGGGGW....',
            '...WGGLLGGGGGGGGGGGGW...',
            '..WWGLGGGGGGGGGGGGGGWW..',
            '..WWGGGGGGGGGGGGGGGGWW..',
            '..WW................WW..',
            '..WW................WW..',
            '..WW................WW..',
            '..WW................WW..',
            '..WWWW............WWWW..',
        ],
    },
    'crown': {
        'name': 'crown',
        'over': True,
        'colors': {'Y': '#f5c542', 'O': '#d49a1f', 'R': '#e0403c', 'B': '#3a7bd5'},
        'art': [
            'Y......YY......Y',
            'YY....YYYY....YY',
            'YYY..YYYYYY..YYY',
            'YYYYYYYYYYYYYYYY',
            'YRYYYYYBBYYYYYRY',
            'OOOOOOOOOOOOOOOO',
        ],
    },
}


def load_sprites():
    s = open(f'{ROOT}/hooks/sprites.ts').read()
    i = s.index('export const SPRITES')
    obj, _ = json.JSONDecoder().raw_decode(s[s.index('{', s.index('=', i)):])
    return obj


def anim(t):
    """The same decoding as register.tsx's anim(): every frame on the 48x40 canvas."""
    a = t['a0'] if t['a0'][2] > 0 else [0, 0, t['w'], t['h']]
    ox = math.floor(AX - (a[0] + a[2] / 2) + 0.5)
    oy = AY - (a[1] + a[3])
    raw = [255 if c == '.' else int(c, 36) for c in t['base']]

    def place(src):
        out = [255] * (CW * CH)
        for i, v in enumerate(src):
            if v == 255:
                continue
            x, y = i % t['w'] + ox, i // t['w'] + oy
            if 0 <= x < CW and 0 <= y < CH:
                out[y * CW + x] = v
        return out

    frames = [place(raw)]
    for d in t['deltas']:
        if d:
            for tok in d.split(','):
                k = len(tok) - 1
                raw[int(tok[:k], 36)] = 255 if tok[k] == '.' else int(tok[k], 36)
        frames.append(place(raw))
    colors = [tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) for c in t['palette']]
    return frames, colors


def row_run(frame, y, body):
    """The longest run of Clawd's own pixels in row y: (length, first x)."""
    best, run, end = 0, 0, -1
    for x in range(CW):
        run = run + 1 if frame[y * CW + x] in body else 0
        if run > best:
            best, end = run, x
    return best, end - best + 1


def head(frame, dark, body):
    """[centre x doubled, top row] of an upright head, and whether eyes were seen under it: the
    first row with a run of 14 pixels (a head side-on or tumbling is narrower; eyes on that row,
    looking up, are still head) with the next three rows running under all of it (a body
    tumbling is ragged), eyes in it or the seven rows below (a crouch squashes them down).
    None when there is no such row."""
    for y in range(CH):
        best, x0 = row_run(frame, y, body)
        if best < 14:
            continue
        end = x0 + best - 1

        def covers(yy):  # the row runs under the whole head (arms may stick out past it)
            n, start = row_run(frame, yy, body)
            return start <= x0 + 2 and start + n - 1 >= end - 2

        if y + 3 >= CH or not all(covers(yy) for yy in range(y + 1, y + 4)):
            return None, False
        eyes = any(frame[yy * CW + x] in dark for yy in range(y, min(CH, y + 8)) for x in range(x0, end + 1))
        return [x0 + end + 1, y], eyes
    return None, False


def heads(frames, dark, body):
    """Each frame's head: where eyes were seen, and where they were not (a blink, dizzy spirals)
    only when the head stands just where an eyed frame of the same sprite had it."""
    found = [head(f, dark, body) for f in frames]
    sure = {tuple(at) for at, eyes in found if at and eyes}
    out = [at if at and (eyes or tuple(at) in sure) else None for at, eyes in found]
    # a short gap (a head tilted to throw confetti, a crouch) keeps the hat, on the head's highest
    # pixel under where it last was, so the hat does not blink off and on
    i = 0
    while i < len(out):
        if out[i] is not None or i == 0 or out[i - 1] is None:
            i += 1
            continue
        j = i
        while j < len(out) and out[j] is None:
            j += 1
        if j < len(out) and j - i <= 4:
            cx = out[i - 1][0]
            for k in range(i, j):
                f = frames[k]
                cols = range(cx // 2 - 6, cx // 2 + 6)
                top = next((y for y in range(CH) if any(f[y * CW + x] in body for x in cols)), None)
                out[k] = [cx, top] if top is not None else None
        i = j
    return out


def wear(frame, colors, hat, at):
    """The frame with the hat on, and the palette grown by the hat's colours."""
    keys = list(hat['colors'])
    pal = colors + [tuple(int(hat['colors'][k][i:i + 2], 16) for i in (1, 3, 5)) for k in keys]
    out = list(frame)
    if not at:
        return out, pal
    art = hat['art']
    w = len(art[0])
    left = (at[0] - w) // 2
    top = at[1] - len(art) + hat.get('drop', 0) if hat['over'] else at[1]
    for j, row in enumerate(art):
        for i, c in enumerate(row):
            if c == '.':
                continue
            x, y = left + i, top + j
            if 0 <= x < CW and 0 <= y < CH and (out[y * CW + x] == 255 or not hat['over']):
                out[y * CW + x] = len(colors) + keys.index(c)
    return out, pal


def picture(frame, pal, mirror):
    small = Image.new('RGBA', (CW, PIC_PX), (0, 0, 0, 0))
    px = small.load()
    for y in range(CH - PIC_PX, CH):
        for x in range(CW):
            v = frame[y * CW + x]
            if v != 255:
                px[x, y - (CH - PIC_PX)] = pal[v] + (255,)
    if mirror:
        m = ImageOps.mirror(small)
        small = Image.new('RGBA', m.size, (0, 0, 0, 0))
        small.paste(m, (-8, 0))
    return small.resize((CW * 4, PIC_PX * 4), Image.NEAREST)


def main():
    sprites = load_sprites()
    anchors = {}
    out_dir = f'{ROOT}/frames-hat'
    shutil.rmtree(out_dir, ignore_errors=True)
    for name, t in sprites.items():
        frames, colors = anim(t)
        dark = {i for i, c in enumerate(colors) if sum(c) < 120}
        # Clawd's own pixels: its eyes and its warm clay shades, not a prop or confetti
        body = dark | {i for i, (r, g, b) in enumerate(colors) if r > 150 and r > g >= b}
        anchors[name] = heads(frames, dark, body)
        for key, hat in HATS.items():
            d = f'{out_dir}/{key}/{name}'
            os.makedirs(d)
            for i, f in enumerate(frames):
                worn, pal = wear(f, colors, hat, anchors[name][i])
                for m in (False, True):
                    picture(worn, pal, m).save(f"{d}/{i}{'m' if m else ''}.png", optimize=True)
    with open(f'{ROOT}/hooks/hats.ts', 'w') as fh:
        fh.write('// Generated by tools/gen_hats.py: the hats, and where Clawd\'s head is in every frame\n')
        fh.write('// ([centre x doubled, top row] on the 48x40 canvas, null when no hat fits). Do not edit.\n')
        fh.write('export type Hat = { name: string; over: boolean; drop?: number; colors: Record<string, string>; art: string[] }\n')
        fh.write(f'export const HATS: Record<string, Hat> = {json.dumps(HATS, separators=(",", ":"))}\n')
        fh.write(f'export const HEADS: Record<string, ([number, number] | null)[]> = {json.dumps(anchors, separators=(",", ":"))}\n')
    worn = sum(1 for a in anchors.values() for h in a if h)
    total = sum(len(a) for a in anchors.values())
    print(f'heads found in {worn}/{total} frames; {len(HATS)} hats written')


if __name__ == '__main__':
    main()
