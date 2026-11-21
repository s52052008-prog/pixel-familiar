"""V1.86.7 休息室家具：GPT 畫的兩張格子圖 → sprites/decor/*.png
用法：python3 tools/import_lounge.py   （讀 art/src/decor/feeders.png、furni.png）"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, 'tools')
import import_art
from import_art import downsample, quantize
import_art.DARK = .5
import_art.CELL = 64
# (欄, 列, [(名字, 'h'或'w', 目標像素)])
SHEETS = {
  'feeders': (3, 2, [('feeder1', 'h', 28), ('feeder2', 'h', 30), ('feeder3', 'h', 31), ('water1', 'h', 28), ('water2', 'h', 30), ('water3', 'h', 31)]),
  'furni': (3, 1, [('cushion_soft', 'w', 36), ('tower_cat', 'h', 54), ('window_low', 'w', 34)]),
}
def fg_mask(path):
    im = Image.open(path).convert('RGBA'); A = np.asarray(im); a = A[..., :3]
    if (A[..., 3] < 50).mean() > .2: return a, A[..., 3] > 140
    ai = a.astype(int); bg = (ai.min(-1) > 215) & (ai.max(-1) - ai.min(-1) < 22)   # 白底／假透明格子
    lab, n = ndimage.label(bg); border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    return a, ~np.isin(lab, list(border))
for sheet, (C, R, ITEMS) in SHEETS.items():
    a, m = fg_mask(f'art/src/decor/{sheet}.png'); H, W = m.shape
    for i, (nm, ax, size) in enumerate(ITEMS):
        r, c = divmod(i, C); y0, y1 = r * H // R, (r + 1) * H // R; x0, x1 = c * W // C, (c + 1) * W // C
        sub = m[y0:y1, x0:x1].copy(); lab, n = ndimage.label(sub); sz = ndimage.sum(sub, lab, range(1, n + 1))
        sub = np.isin(lab, [k + 1 for k, v in enumerate(sz) if v > sz.max() * .01])
        ys = np.where(sub.any(1))[0]; xs = np.where(sub.any(0))[0]
        bx0, by0, bx1, by1 = x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1
        mm = np.zeros_like(m); mm[y0:y1, x0:x1] = sub
        k = size / ((by1 - by0) if ax == 'h' else (bx1 - bx0)); tw, th = max(1, round((bx1 - bx0) * k)), max(1, round((by1 - by0) * k))
        im = downsample(a, mm, (bx0, by0, bx1, by1), tw, th, 0, 0)[:th, :tw]
        (im,), _ = quantize([im], 24)
        Image.fromarray(im).save(f'sprites/decor/{nm}.png'); print(nm, im.shape[1], im.shape[0])
# 註：tower_cat 的毛球顏色縮小後變淡，匯入後有手動改回粉紅（見 V1.86.7）
# 這些小圖直接內嵌進 index.html（Claude 網頁版一個版本最多 512 個檔案，省檔案數）
import base64, re, glob, os
mp = {os.path.basename(f)[:-4]: base64.b64encode(open(f, 'rb').read()).decode() for f in sorted(glob.glob('sprites/decor/*.png'))}
line = 'const DECOR_B64=' + '{' + ','.join(f"{k}:'{v}'" for k, v in mp.items()) + '};   // 由 tools/import_lounge.py 產生'
h = open('index.html').read(); h = re.sub(r'const DECOR_B64=\{.*?\};[^\n]*', lambda _: line, h, count=1) if 'const DECOR_B64=' in h else h.replace('const DECOR_ART=', line + '\nconst DECOR_ART=', 1)
open('index.html', 'w').write(h); print('embedded', len(mp))
