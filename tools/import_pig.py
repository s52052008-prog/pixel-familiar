"""小豬撲滿 1～6 級：把 GPT 畫的一排六隻小豬縮成像素圖 sprites/items/pig1～6.png
用法：python3 tools/import_pig.py art/src/piggy.png"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, 'tools')
import import_art
from import_art import mask_of, downsample, quantize, add_outline
import_art.DARK = .5   # 小皇冠細節多：描邊不要吃掉顏色

W = [20, 22, 24, 26, 28, 30]   # 各級寬度（6 級含光暈）
a = np.asarray(Image.open(sys.argv[1]).convert('RGB')); m = mask_of(a)
# 先把東西依 x 分成六群（皇冠、星星這些小塊會併進最近的那一隻）
cols = m.any(0); runs = []; x = 0
while x < len(cols):
    if cols[x]:
        s = x
        while x < len(cols) and cols[x]: x += 1
        runs.append([s, x])
    x += 1
merged = []
for r in runs:
    if merged and r[0] - merged[-1][1] < 15: merged[-1][1] = r[1]
    else: merged.append(r)
assert len(merged) == 6, merged
for i, (x0, x1) in enumerate(merged):
    if i == 5:   # 6 級：先把外面一圈黃色光暈從遮罩拿掉（被黑框包住的金色皇冠、花紋會補回來）
        A = a.astype(int); yel = (A[..., 0] > 170) & (A[..., 1] > 160) & (A[..., 2] < 150) | ((A[..., 1] > A[..., 0] - 30) & (A[..., 1] > 120) & (A[..., 2] < 120))
        mm = m.copy(); mm[:, x0:x1] &= ~yel[:, x0:x1]; mm[:, x0:x1] = ndimage.binary_fill_holes(mm[:, x0:x1])
        lab, n = ndimage.label(mm[:, x0:x1]); sz = ndimage.sum(mm[:, x0:x1], lab, range(1, n + 1)); keep = [k + 1 for k, v in enumerate(sz) if v > sz.max() * .02]
        mm[:, x0:x1] = np.isin(lab, keep); m = mm
        xs = np.where(m[:, x0:x1].any(0))[0]; x0, x1 = x0 + xs.min(), x0 + xs.max() + 1
    sub = m[:, x0:x1]; ys = np.where(sub.any(1))[0]; y0, y1 = ys.min(), ys.max() + 1
    tw = W[i]; th = round(tw * (y1 - y0) / (x1 - x0))
    im = downsample(a, m, (x0, y0, x1, y1), tw, th, 0, 0)[:th, :tw]
    (im,), _ = quantize([im], 28)
    Image.fromarray(im).save(f'sprites/items/pig{i + 1}.png'); print(i + 1, tw, th)
