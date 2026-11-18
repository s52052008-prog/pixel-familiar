"""王的寶物 8 個＋銅／金寶箱：GPT 畫的 5×2 一張圖 → sprites/items/relic_*.png、chest_bronze/gold.png
用法：python3 tools/import_relic.py art/src/relics.png"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, 'tools')
import import_art
from import_art import mask_of, downsample, quantize
import_art.DARK = .5
NAMES = ['rhinoCharm', 'reaperBlade', 'boneShield', 'iceScale', 'mossHeart', 'phoenixFeather', 'dragonFang', 'ghostHat', 'chest_bronze', 'chest_gold']
SIZE = 24
A4 = np.asarray(Image.open(sys.argv[1]).convert('RGBA')); a = A4[..., :3]
m = A4[..., 3] > 140   # GPT 給的是透明底：直接用透明度當遮罩（護符繩圈中間本來就是透明的）
H, W = m.shape
for i, nm in enumerate(NAMES):
    r, c = divmod(i, 5); y0, y1 = r * H // 2, (r + 1) * H // 2; x0, x1 = c * W // 5, (c + 1) * W // 5
    sub = m[y0:y1, x0:x1].copy(); lab, n = ndimage.label(sub); sz = ndimage.sum(sub, lab, range(1, n + 1))
    sub = np.isin(lab, [k + 1 for k, v in enumerate(sz) if v > sz.max() * .01])
    ys = np.where(sub.any(1))[0]; xs = np.where(sub.any(0))[0]
    bx0, by0, bx1, by1 = x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1
    mm = np.zeros_like(m); mm[y0:y1, x0:x1] = sub
    k = SIZE / max(bx1 - bx0, by1 - by0); tw, th = max(1, round((bx1 - bx0) * k)), max(1, round((by1 - by0) * k))
    im = downsample(a, mm, (bx0, by0, bx1, by1), tw, th, 0, 0)[:th, :tw]
    (im,), _ = quantize([im], 24)
    out = nm if nm.startswith('chest') else 'relic_' + nm
    Image.fromarray(im).save(f'sprites/items/{out}.png'); print(out, tw, th)
