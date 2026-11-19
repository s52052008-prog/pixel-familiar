"""V1.76 開寶箱過場：關著／掀開一點的金、銅寶箱（GPT 2×2）→ sprites/items/chest_*_c.png、chest_*_h.png
用法：python3 tools/import_chests2.py art/src/chests2.png"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, 'tools')
import import_art
from import_art import downsample, quantize
import_art.DARK = .5
NAMES = ['chest_gold_c', 'chest_gold_h', 'chest_bronze_c', 'chest_bronze_h']
SIZE = 26   # 關著的寶箱寬 26px；掀開那張用同一個縮放比例（光芒會比較寬）
A4 = np.asarray(Image.open(sys.argv[1]).convert('RGBA')); a = A4[..., :3]
m = A4[..., 3] > 140
H, W = m.shape
k = None
for i, nm in enumerate(NAMES):
    r, c = divmod(i, 2); y0, y1 = r * H // 2, (r + 1) * H // 2; x0, x1 = c * W // 2, (c + 1) * W // 2
    sub = m[y0:y1, x0:x1].copy(); lab, n = ndimage.label(sub); sz = ndimage.sum(sub, lab, range(1, n + 1))
    sub = np.isin(lab, [j + 1 for j, v in enumerate(sz) if v > sz.max() * .002])
    ys = np.where(sub.any(1))[0]; xs = np.where(sub.any(0))[0]
    bx0, by0, bx1, by1 = x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1
    mm = np.zeros_like(m); mm[y0:y1, x0:x1] = sub
    if nm.endswith('_c'): k = SIZE / (bx1 - bx0)
    tw, th = max(1, round((bx1 - bx0) * k)), max(1, round((by1 - by0) * k))
    im = downsample(a, mm, (bx0, by0, bx1, by1), tw, th, 0, 0)[:th, :tw]
    (im,), _ = quantize([im], 28)
    Image.fromarray(im).save(f'sprites/items/{nm}.png'); print(nm, tw, th)
