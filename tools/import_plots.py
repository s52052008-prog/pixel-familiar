"""V1.78 田地作物（GPT 5×3）→ sprites/plots/*.png（寬 26、底部對齊）；過熟版自動產生（葉子變黃、果實變暗）
種子包（GPT 4×1）→ sprites/items/seed.png、seed2/3/4.png
用法：python3 tools/import_plots.py art/src/plots.png art/src/seeds.png"""
import sys, colorsys
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, 'tools')
import import_art
from import_art import downsample, quantize
import_art.DARK = .5

def cells(path, cols, rows, keep=.01):
    A4 = np.asarray(Image.open(path).convert('RGBA')); a = A4[..., :3]; m = A4[..., 3] > 140; H, W = m.shape
    out = []
    for i in range(cols * rows):
        r, c = divmod(i, cols); y0, y1 = r * H // rows, (r + 1) * H // rows; x0, x1 = c * W // cols, (c + 1) * W // cols
        sub = m[y0:y1, x0:x1].copy(); lab, n = ndimage.label(sub); sz = ndimage.sum(sub, lab, range(1, n + 1))
        sl = ndimage.find_objects(lab); hh, ww = sub.shape
        edge = lambda k: sl[k][0].start == 0 or sl[k][1].start == 0 or sl[k][0].stop == hh or sl[k][1].stop == ww
        sub = np.isin(lab, [k + 1 for k, v in enumerate(sz) if v > sz.max() * keep and not (edge(k) and v < sz.max() * .3)])
        ys = np.where(sub.any(1))[0]; xs = np.where(sub.any(0))[0]
        mm = np.zeros_like(m); mm[y0:y1, x0:x1] = sub
        out.append((a, mm, (x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1)))
    return out

PLOTS = ['empty', 'seed', 'sprout', 'leafy', 'rot', 'cranberry', 'blueberry', 'strawberry', 'dragon', 'melonw', 'melon', 'potato', 'nut', 'coconut', 'banana']
CW, CH = 26, 26
P = cells(sys.argv[1], 5, 3, keep=.004)
k = CW / (P[0][2][2] - P[0][2][0])   # 用空田土的寬度當基準，每張同一個縮放比例
imgs = {}
for nm, (a, mm, (bx0, by0, bx1, by1)) in zip(PLOTS, P):
    tw, th = max(1, round((bx1 - bx0) * k)), max(1, round((by1 - by0) * k))
    im = downsample(a, mm, (bx0, by0, bx1, by1), tw, th, 0, 0)[:th, :tw]
    (im,), _ = quantize([im], 24)
    can = Image.new('RGBA', (CW, CH)); src = Image.fromarray(im)
    if src.width > CW or src.height > CH: src.thumbnail((CW, CH), Image.NEAREST)
    can.paste(src, ((CW - src.width) // 2, CH - src.height), src)
    imgs[nm] = can; can.save(f'sprites/plots/{nm}.png')
def overripe(im):   # 葉子變黃褐、果實變暗一點
    a = np.asarray(im).astype(float); out = a.copy()
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            r, g, b, al = a[y, x]
            if al < 10: continue
            h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            if .17 < h < .45 and s > .25: h, s, l = .11 + (h - .17) * .15, s * .8, l * .92   # 綠 → 黃褐
            elif l > .12: l *= .82; s *= .85
            rr, gg, bb = colorsys.hls_to_rgb(h, l, s); out[y, x, :3] = [rr * 255, gg * 255, bb * 255]
    return Image.fromarray(out.astype(np.uint8), 'RGBA')
for nm in PLOTS[5:]: overripe(imgs[nm]).save(f'sprites/plots/{nm}_over.png')
S = cells(sys.argv[2], 4, 1, keep=.01)
for nm, (a, mm, (bx0, by0, bx1, by1)) in zip(['seed', 'seed2', 'seed3', 'seed4'], S):
    kk = 16 / max(bx1 - bx0, by1 - by0); tw, th = max(1, round((bx1 - bx0) * kk)), max(1, round((by1 - by0) * kk))
    im = downsample(a, mm, (bx0, by0, bx1, by1), tw, th, 0, 0)[:th, :tw]; (im,), _ = quantize([im], 20)
    Image.fromarray(im).save(f'sprites/items/{nm}.png'); print(nm, tw, th)
print('plots', CW, CH)
