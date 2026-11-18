"""小窩 1～7 級＋血繼小屋：把 GPT 畫的圖縮成像素圖 sprites/items/den1～7.png、den_fusion.png
用法：python3 tools/import_den.py art/src/dens.png art/src/fusion_house.png"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, 'tools')
import import_art
from import_art import mask_of, downsample, quantize
import_art.DARK = .5
W = [26, 30, 38, 44, 48, 52, 56]   # 各級寬度（院子左邊，最大約 56×66）

def cut(a, m, x0, x1, tw, name, glow=False):
    if glow:   # 星星光點和光暈：只留被黑框包住的部分
        A = a.astype(int); yel = (A[..., 0] > 200) & (A[..., 1] > 190) & (A[..., 2] < 170)
        mm = m.copy(); mm[:, x0:x1] &= ~yel[:, x0:x1]; mm[:, x0:x1] = ndimage.binary_fill_holes(mm[:, x0:x1])
        lab, n = ndimage.label(mm[:, x0:x1]); sz = ndimage.sum(mm[:, x0:x1], lab, range(1, n + 1)); keep = [k + 1 for k, v in enumerate(sz) if v > sz.max() * .03]
        mm[:, x0:x1] = np.isin(lab, keep); m = mm
        xs = np.where(m[:, x0:x1].any(0))[0]; x0, x1 = x0 + xs.min(), x0 + xs.max() + 1
    ys = np.where(m[:, x0:x1].any(1))[0]; y0, y1 = ys.min(), ys.max() + 1
    th = round(tw * (y1 - y0) / (x1 - x0)); big = np.zeros((max(th, tw) + 2, max(th, tw) + 2, 4), np.uint8)
    import_art.CELL = big.shape[0]
    im = downsample(a, m, (x0, y0, x1, y1), tw, th, 0, 0)[:th, :tw]
    (im,), _ = quantize([im], 48)
    c = im[..., :3].astype(int); teal = (im[..., 3] > 0) & (c[..., 2] > 140) & (c[..., 1] > 100) & (c[..., 0] < 90)   # 藍旗子邊緣混到綠底變青綠：拉回藍色
    lt = c[..., :3].sum(-1) > 420; im[teal & lt, :3] = (130, 200, 255); im[teal & ~lt, :3] = (40, 130, 235)
    Image.fromarray(im).save(f'sprites/items/{name}.png'); print(name, tw, th)

a = np.asarray(Image.open(sys.argv[1]).convert('RGB')); m = mask_of(a)
cols = m.any(0); runs = []; x = 0
while x < len(cols):
    if cols[x]:
        s = x
        while x < len(cols) and cols[x]: x += 1
        runs.append([s, x])
    x += 1
merged = []
for r in runs:
    if merged and r[0] - merged[-1][1] < 3: merged[-1][1] = r[1]
    else: merged.append(r)
merged = [r for r in merged if r[1] - r[0] > 40]
assert len(merged) == 7, merged
for i, (x0, x1) in enumerate(merged): cut(a, m, x0, x1, W[i], f'den{i + 1}', glow=i >= 6)
b = np.asarray(Image.open(sys.argv[2]).convert('RGB')); mb = mask_of(b); xs = np.where(mb.any(0))[0]
cut(b, mb, xs.min(), xs.max() + 1, 52, 'den_fusion', glow=True)
