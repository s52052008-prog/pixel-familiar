#!/usr/bin/env python3
"""野生怪總表（綠底；每 2 列一組＝上排睜眼、下排閉眼；每列 8 隻）→ sprites/wild_n.png、sprites/wild_b.png
  wild_n：一般大小（最大 34×32），wild_b：Boss 大小（最大 42×40）
  每張圖：寬＝48×隻數，高＝96（上 48 睜眼、下 48 閉眼），腳底對齊 y=46
用法：python3 tools/import_wild.py   （讀 art/src/wild/w1.png … w6.png）
"""
import sys, os, json
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from import_art import mask_of, downsample, quantize, add_outline, lum, CELL

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEETS = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7']
FREE_COLS = False
SIZES = {'n': (34, 32), 'b': (42, 40)}
GROUND = 46


def runs(v, minlen):
    out, s = [], None
    for i, x in enumerate(list(v) + [0]):
        if x and s is None: s = i
        if not x and s is not None:
            if i - s >= minlen: out.append((s, i))
            s = None
    return out


def cells(path):
    global FREE_COLS; FREE_COLS = os.path.basename(path) in ('w7.png',)
    a = np.asarray(Image.open(path).convert('RGB')); m = mask_of(a); H, W = m.shape
    rows = runs(ndimage.binary_closing(m.sum(1) > 0, iterations=6), 40)
    out = []
    for r0 in range(0, len(rows) - 1, 2):
        pair = []
        for (y0, y1) in rows[r0:r0 + 2]:
            # V1.85：先把整列的色塊標號，再依「重心落在哪一格」分給每隻怪；翅膀、尾巴超出格線也不會被切成一直線
            band = np.zeros_like(m); band[y0:y1] = m[y0:y1]; lab, n = ndimage.label(band)
            sz = ndimage.sum(band, lab, range(1, n + 1)); cen = ndimage.center_of_mass(band, lab, range(1, n + 1))
            col_of = [min(7, max(0, int(cx / (W / 8)))) for (cy, cx) in cen]
            if FREE_COLS:   # V1.95：魔王比較大、沒對齊格線 → 用最大的 8 塊依左右排序當 8 格，小碎片歸到最近的那塊
                big8 = sorted(sorted(range(n), key=lambda i: -sz[i])[:8], key=lambda i: cen[i][1])
                col_of = [min(range(8), key=lambda c: abs(cen[i][1] - cen[big8[c]][1])) for i in range(n)]
            row = []
            for c in range(8):
                ids = [i + 1 for i in range(n) if col_of[i] == c]
                if not ids: row.append(np.zeros_like(m)); continue
                big = max(ids, key=lambda i: sz[i - 1]); by, bx = np.nonzero(lab == big); keep = [big]
                for i in ids:
                    if i == big or sz[i - 1] < 30: continue
                    ys, xs = np.nonzero(lab == i)
                    if xs.min() < bx.min() - 40 or xs.max() > bx.max() + 40 or ys.min() < by.min() - 40: continue
                    keep.append(i)
                row.append(np.isin(lab, keep))
            pair.append(row)
        for c in range(8): out.append((a, pair[0][c], pair[1][c]))
    return out


def bbox(m):
    ys, xs = np.nonzero(m); return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def main():
    mons = []
    for s in SHEETS:
        p = os.path.join(ROOT, 'art', 'src', 'wild', s + '.png')
        if os.path.exists(p): mons += cells(p)
    for key, (mw, mh) in SIZES.items():
        atlas = np.zeros((CELL * 2, CELL * len(mons), 4), np.uint8)
        for i, (a, mo, mc) in enumerate(mons):
            imgs = []
            # 睜眼／閉眼用同一個縮放比例（以睜眼為準），位置才不會跳
            bo = bbox(mo); bw, bh = bo[2] - bo[0], bo[3] - bo[1]; k = min(mw / bw, mh / bh)
            for m in (mo, mc):
                b = bbox(m); w, h = b[2] - b[0], b[3] - b[1]; tw, th = max(1, round(w * k)), max(1, round(h * k))
                tw, th = min(tw, CELL - 2), min(th, GROUND - 1)
                imgs.append(downsample(a, m, b, tw, th, (CELL - tw) // 2, GROUND - th))
            imgs, pal = quantize(imgs, 20)
            oc = min(pal.tolist(), key=lambda c: lum(c)); imgs = [add_outline(im, oc) for im in imgs]
            atlas[0:CELL, i * CELL:(i + 1) * CELL] = imgs[0]; atlas[CELL:, i * CELL:(i + 1) * CELL] = imgs[1]
        Image.fromarray(atlas, "RGBA").quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(os.path.join(ROOT, "sprites", f"wild_{key}.png"), optimize=True)   # 256 色：檔案小很多
        print(key, len(mons), 'monsters')
    pv = Image.open(os.path.join(ROOT, 'sprites', 'wild_n.png')).convert('RGBA')
    sc = 3; cols = 16; n = pv.width // CELL; out = Image.new('RGBA', (cols * CELL * sc, ((n + cols - 1) // cols) * CELL * 2 * sc), (60, 90, 60, 255))
    for i in range(n):
        out.alpha_composite(pv.crop((i * CELL, 0, (i + 1) * CELL, CELL * 2)).resize((CELL * sc, CELL * 2 * sc), Image.NEAREST), ((i % cols) * CELL * sc, (i // cols) * CELL * 2 * sc))
    out.save(os.path.join(ROOT, 'art', 'preview-wild.png'))


if __name__ == '__main__':
    main()
