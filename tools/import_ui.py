#!/usr/bin/env python3
"""介面圖示總表（9×4，白底）→ sprites/ui/<名稱>.png（像素化成 14×14，和蘋果同風格）
用法：python3 tools/import_ui.py art/src/sheets/ui.png
"""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from import_art import quantize, lum
from import_items import down, outline

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAMES = [['star', 'calendar', 'leaf', 'check', 'apple', 'stew', 'waterbowl', 'dumbbell', 'bolt'],
         ['backpack', 'swords', 'house', 'shop', 'trophy', 'heart', 'zzz', 'levelup', 'pawbook'],
         ['scroll', 'book', 'map', 'chest', 'coin', 'gem', 'meat', 'cheese', 'moon'],
         ['paw', 'pawlight', 'leafbook', 'picture', 'floppy', 'gear', 'refresh', 'question', 'info']]
SIZE = 14
SOLO = {'heart'}   # 只留主體（旁邊的小星星縮小後會把圖示擠扁）


def main(path):
    rgba = np.asarray(Image.open(path).convert('RGBA'))
    a = rgba[..., :3].copy()
    white = (a.min(2) > 232) | (rgba[..., 3] < 20)
    lab, _ = ndimage.label(white)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    fg = ~np.isin(lab, list(border))                      # 白底（和外框連通的白色）去掉，圖示裡面的白色保留
    gl, gn = ndimage.label(fg, structure=np.ones((3, 3)))
    cents = ndimage.center_of_mass(fg, gl, range(1, gn + 1)); sizes = ndimage.sum(fg, gl, range(1, gn + 1))
    H, W = fg.shape
    rows = np.array_split(np.arange(H), 4); rb = [(r[0], r[-1] + 1) for r in rows]
    # 每列圖示的中心（用前景投影找）→ 欄位分界
    cx = [124, 334, 535, 735, 922, 1110, 1300, 1490, 1676]; cx = [c * W / 1774 for c in cx]
    cb = [0] + [(cx[i] + cx[i + 1]) / 2 for i in range(8)] + [W]
    out = os.path.join(ROOT, 'sprites', 'ui'); os.makedirs(out, exist_ok=True)
    prev = []
    for r, (y0, y1) in enumerate(rb):
        for c in range(9):
            ids = [i + 1 for i, (cy, cx_) in enumerate(cents) if y0 <= cy < y1 and cb[c] <= cx_ < cb[c + 1] and sizes[i] >= 20]
            if NAMES[r][c] in SOLO: ids = [max(ids, key=lambda i: sizes[i - 1])]
            sel = np.isin(gl, ids); ys, xs = np.nonzero(sel)
            box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1); bw, bh = box[2] - box[0], box[3] - box[1]
            k = min(SIZE / bw, SIZE / bh); tw, th = max(1, round(bw * k)), max(1, round(bh * k))
            im = down(a, sel, box, tw, th)
            (im,), pal = quantize([im], 16)
            im = outline(im, min(pal.tolist(), key=lambda q: lum(q)))
            sq = np.zeros((SIZE, SIZE, 4), np.uint8); oy, ox = (SIZE - th) // 2, (SIZE - tw) // 2; sq[oy:oy + th, ox:ox + tw] = im
            Image.fromarray(sq, 'RGBA').save(os.path.join(out, NAMES[r][c] + '.png'), optimize=True); prev.append(sq)
    sc = 6; pv = Image.new('RGBA', (9 * (SIZE * sc + 8), 4 * (SIZE * sc + 8)), (90, 60, 40, 255))
    for i, im in enumerate(prev):
        pv.alpha_composite(Image.fromarray(im, 'RGBA').resize((SIZE * sc, SIZE * sc), Image.NEAREST), ((i % 9) * (SIZE * sc + 8) + 4, (i // 9) * (SIZE * sc + 8) + 4))
    pv.save(os.path.join(ROOT, 'art', 'preview-ui.png'))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'art', 'src', 'sheets', 'ui.png'))
