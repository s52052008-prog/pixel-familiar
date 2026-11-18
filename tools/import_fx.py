"""GPT 畫的戰鬥特效（11 個粒子＋3 組 3 格動畫）和新圖示（15＋10 個）→ sprites/fx/*.png、sprites/items/ic_*.png
用法：python3 tools/import_fx.py"""
import sys
import numpy as np
from PIL import Image
sys.path.insert(0, 'tools')
import import_art
from import_art import mask_of, downsample, quantize
import_art.DARK = .5

def rows_of(m, n):
    r = m.any(1); runs = []; y = 0
    while y < len(r):
        if r[y]:
            s = y
            while y < len(r) and r[y]: y += 1
            runs.append([s, y])
        y += 1
    out = []
    for a in runs:
        if out and a[0] - out[-1][1] < 30: out[-1][1] = a[1]
        else: out.append(a)
    out = [o for o in out if o[1] - o[0] > 25]
    assert len(out) == n, out
    return out

def cols_of(m, y0, y1, n, gap=0):
    """用連通區塊分欄：大塊＝一個圖示（x 範圍重疊的併在一起），小碎點（光點、水滴）併到最近的大塊"""
    from scipy import ndimage
    sub = m[y0:y1]; lab, k = ndimage.label(sub); objs = ndimage.find_objects(lab); sz = ndimage.sum(sub, lab, range(1, k + 1))
    big = [i for i in range(k) if sz[i] > sz.max() * .12]
    cols = sorted([[objs[i][1].start, objs[i][1].stop] for i in big])
    out = []
    for c in cols:
        if out and c[0] < out[-1][1] - 3: out[-1][1] = max(out[-1][1], c[1])
        else: out.append(c)
    while len(out) > n:   # 還是太多：把最近的兩欄併起來
        d = [out[i + 1][0] - out[i][1] for i in range(len(out) - 1)]; i = d.index(min(d)); out[i] = [out[i][0], out[i + 1][1]]; del out[i + 1]
    assert len(out) == n, (len(out), out)
    for i in range(k):   # 小碎點：中心落在哪一欄（或最近的一欄）就併進去
        if i in big: continue
        cx = (objs[i][1].start + objs[i][1].stop) / 2; j = min(range(n), key=lambda j: 0 if out[j][0] <= cx < out[j][1] else min(abs(cx - out[j][0]), abs(cx - out[j][1])))
        out[j] = [min(out[j][0], objs[i][1].start), max(out[j][1], objs[i][1].stop)]
    return out

def cut(a, m, box, size, fixed=None):
    x0, y0, x1, y1 = box
    sub = m[y0:y1, x0:x1]; ys = np.where(sub.any(1))[0]; xs = np.where(sub.any(0))[0]
    if fixed is None: bx0, by0, bx1, by1 = x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1
    else: bx0, by0, bx1, by1 = x0, y0, x1, y1
    mm = np.zeros_like(m); mm[by0:by1, bx0:bx1] = m[by0:by1, bx0:bx1]
    k = size / max(bx1 - bx0, by1 - by0); tw, th = max(1, round((bx1 - bx0) * k)), max(1, round((by1 - by0) * k))
    im = downsample(a, mm, (bx0, by0, bx1, by1), tw, th, 0, 0)[:th, :tw]
    (im,), _ = quantize([im], 24)
    return Image.fromarray(im)

# ---- 特效 ----
a = np.asarray(Image.open('art/src/fx.png').convert('RGB')); m = mask_of(a)
(r1, r2) = rows_of(m, 2)
P = ['fire', 'bubble', 'leaf', 'rock', 'feather', 'bolt', 'shard', 'star', 'spark', 'heart', 'z']
for nm, (x0, x1) in zip(P, cols_of(m, *r1, 11)):
    cut(a, m, (x0, r1[0], x1, r1[1]), 12).save(f'sprites/fx/p_{nm}.png'); print('p_' + nm)
fr9 = cols_of(m, *r2, 9)
for i, (x0, x1) in enumerate(fr9):
    g = ['burn', 'splash', 'zap'][i // 3]
    cut(a, m, (x0, r2[0], x1, r2[1]), 26).save(f'sprites/fx/{g}{i % 3}.png'); print(g, i % 3)

# ---- 新圖示 ----
a = np.asarray(Image.open('art/src/icons2.png').convert('RGB')); m = mask_of(a)
(r1, r2) = rows_of(m, 2)
N1 = ['ball', 'sun', 'drop', 'sponge', 'tub', 'shoe', 'bite', 'poop', 'ember', 'fly', 'cranberry', 'blueberry', 'strawberry', 'worry', 'note']
N2 = ['el_fire', 'el_water', 'el_leaf', 'el_earth', 'el_bird', 'el_elec', 'el_metal', 'sex_m', 'sex_f', 'bondheart']
for nm, (x0, x1) in zip(N1, cols_of(m, *r1, 15)):
    cut(a, m, (x0, r1[0], x1, r1[1]), 16).save(f'sprites/items/ic_{nm}.png'); print('ic_' + nm)
for nm, (x0, x1) in zip(N2, cols_of(m, *r2, 10)):
    cut(a, m, (x0, r2[0], x1, r2[1]), 16).save(f'sprites/items/ic_{nm}.png'); print('ic_' + nm)
