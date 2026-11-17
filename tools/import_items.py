#!/usr/bin/env python3
"""道具總表（5×5，綠底）→ sprites/items/<名稱>.png

順序（左到右、上到下）：
  小圓床 稻草窩 雲朵床 馬桶 紅地毯 / 星星地毯 盆栽 向日葵 蠟燭燈 月亮燈 /
  風景畫 咕咕鐘 皮球 積木 藥水 / 蘋果 莓果 烤魚 肉排 蛋糕 / 種子 星星糖 金幣 果核 魚骨
用法：python3 tools/import_items.py art/src/sheets/items.png
"""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from import_art import mask_of, quantize, lum

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 名稱、最大寬、最大高、是否保持比例（地毯是俯視圖，壓扁成透視）
ITEMS = [
    ('bed_round', 40, 26, 1), ('bed_straw', 40, 26, 1), ('bed_cloud', 42, 28, 1), ('toilet_pot', 18, 20, 1), ('rug_red', 54, 15, 0),
    ('rug_star', 54, 15, 0), ('plant_pot', 17, 22, 1), ('plant_flower', 18, 26, 1), ('lamp_candle', 13, 18, 1), ('lamp_moon', 20, 26, 1),
    ('wall_frame', 28, 22, 1), ('wall_clock', 18, 28, 1), ('toy_ball', 15, 15, 1), ('toy_block', 17, 15, 1), ('potion', 11, 12, 1),
    ('apple', 12, 12, 1), ('berry', 13, 11, 1), ('fish', 16, 10, 1), ('meat', 14, 12, 1), ('cake', 13, 12, 1),
    ('seed', 11, 12, 1), ('candy', 14, 9, 1), ('coin', 11, 11, 1), ('core', 10, 11, 1), ('bone', 14, 9, 1),
]


def down(a, m, box, tw, th):
    x0, y0, x1, y1 = box
    out = np.zeros((th, tw, 4), np.uint8)
    sw, sh = (x1 - x0) / tw, (y1 - y0) / th
    for j in range(th):
        for i in range(tw):
            sx0, sx1, sy0, sy1 = int(x0 + i * sw), max(int(x0 + (i + 1) * sw), int(x0 + i * sw) + 1), int(y0 + j * sh), max(int(y0 + (j + 1) * sh), int(y0 + j * sh) + 1)
            bm = m[sy0:sy1, sx0:sx1]
            if bm.mean() < .45:
                continue
            blk = a[sy0:sy1, sx0:sx1]
            px = blk[bm]
            dark = (0.3 * px[:, 0] + 0.59 * px[:, 1] + 0.11 * px[:, 2]) < 60
            if dark.mean() > .45:
                c = np.median(px[dark], 0)
            else:   # 取區塊中心附近（保留高光）
                cy, cx = (sy1 - sy0) // 2, (sx1 - sx0) // 2
                r = max(1, int(min(sw, sh) * .2))
                sub = blk[max(0, cy - r):cy + r + 1, max(0, cx - r):cx + r + 1].reshape(-1, 3)
                sm = bm[max(0, cy - r):cy + r + 1, max(0, cx - r):cx + r + 1].reshape(-1)
                c = np.median(sub[sm] if sm.any() else px, 0)
            out[j, i] = (*c.astype(np.uint8), 255)
    return out


def outline(im, col):
    a = im[..., 3] > 0
    p = np.pad(a, 1)
    inner = p[2:, 1:-1] & p[:-2, 1:-1] & p[1:-1, 2:] & p[1:-1, :-2]
    im[a & ~inner] = (*col, 255)
    return im


# 第二張總表（2 列 × 7）：能力水果、高階進化素材
ITEMS2 = [(n, 16, 16, 1) for n in ['dragon', 'melonw', 'melon', 'potato', 'nut', 'coconut', 'banana',
                                   'mat_flame', 'mat_tide', 'mat_forest', 'mat_earth', 'mat_bird', 'mat_metal', 'mat_elec']]


def main(path, items=None, rows=5, cols=5, preview='preview-items.png'):
    items = items or ITEMS
    a = np.asarray(Image.open(path).convert('RGB'))
    fg = mask_of(a)
    lab, n = ndimage.label(fg)
    objs = ndimage.find_objects(lab)
    areas = ndimage.sum(fg, lab, range(1, n + 1))
    big = sorted(range(n), key=lambda i: -areas[i])[:rows * cols]
    H = a.shape[0]
    rws = sorted(big, key=lambda i: (objs[i][0].start + objs[i][0].stop) / 2)
    order = []
    for r in range(rows):
        order += sorted(rws[r * cols:(r + 1) * cols], key=lambda i: objs[i][1].start)
    outdir = os.path.join(ROOT, 'sprites', 'items')
    os.makedirs(outdir, exist_ok=True)
    prev = []
    for (name, mw, mh, keep), i in zip(items, order):
        # 同一格附近的小碎塊（例如星星、葉子）一起算進來
        cy, cx = (objs[i][0].start + objs[i][0].stop) / 2, (objs[i][1].start + objs[i][1].stop) / 2
        ids = [i + 1] + [k + 1 for k in range(n) if k not in big and areas[k] > 30 and abs((objs[k][0].start + objs[k][0].stop) / 2 - cy) < 110 and abs((objs[k][1].start + objs[k][1].stop) / 2 - cx) < 110]
        sel = np.isin(lab, ids)
        ys, xs = np.where(sel)
        box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
        bw, bh = box[2] - box[0], box[3] - box[1]
        if keep:
            k = min(mw / bw, mh / bh); tw, th = max(1, round(bw * k)), max(1, round(bh * k))
        else:
            tw, th = mw, mh
        im = down(a, sel, box, tw, th)
        (im,), pal = quantize([im], 24)
        im = outline(im, min(pal.tolist(), key=lambda c: lum(c)))
        Image.fromarray(im, 'RGBA').save(os.path.join(outdir, name + '.png'), optimize=True)
        prev.append((name, im))
        print(name, f'{tw}x{th}')
    sc = 5
    W = sum(im.shape[1] * sc + 10 for _, im in prev)
    pv = Image.new('RGBA', (W, 60 * sc // 2 + 20), (90, 60, 40, 255))
    x = 5
    for _, im in prev:
        pv.alpha_composite(Image.fromarray(im, 'RGBA').resize((im.shape[1] * sc, im.shape[0] * sc), Image.NEAREST), (x, 10)); x += im.shape[1] * sc + 10
    pv.save(os.path.join(ROOT, 'art', preview))


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'items2':
        main(os.path.join(ROOT, 'art', 'src', 'sheets', 'items2.png'), ITEMS2, 2, 7, 'preview-items2.png')
    else:
        main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'art', 'src', 'sheets', 'items.png'))
