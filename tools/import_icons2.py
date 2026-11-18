"""V1.70 UI 圖示 42 個：GPT 畫的 7×6 一張圖 → sprites/ui2/*.png（16px）
用法：python3 tools/import_icons2.py art/src/icons2.png"""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, 'tools')
import import_art
from import_art import downsample, quantize
import_art.DARK = .5
NAMES = ['crown', 'tower', 'sparkle', 'shield', 'run', 'crit', 'skull',
         'shake', 'dragonhead', 'snow', 'volcano', 'muscle', 'dodge', 'fist',
         'zen', 'glove', 'bulb', 'rock', 'scissors', 'paper', 'cross',
         'warn', 'bell', 'lock', 'hourglass', 'party', 'gift', 'egg',
         'hatch', 'orb', 'basket', 'tools', 'chair', 'user', 'medal',
         'wand', 'sound', 'mute', 'turtle', 'back', 'dice', 'pin']
SIZE = 16
A4 = np.asarray(Image.open(sys.argv[1]).convert('RGBA')); a = A4[..., :3]
m = A4[..., 3] > 140
H, W = m.shape
os.makedirs('sprites/ui2', exist_ok=True)
for i, nm in enumerate(NAMES):
    r, c = divmod(i, 7); y0, y1 = r * H // 6, (r + 1) * H // 6; x0, x1 = c * W // 7, (c + 1) * W // 7
    sub = m[y0:y1, x0:x1].copy(); lab, n = ndimage.label(sub); sz = ndimage.sum(sub, lab, range(1, n + 1))
    sl = ndimage.find_objects(lab); hh, ww = sub.shape
    edge = lambda k: sl[k][0].start == 0 or sl[k][1].start == 0 or sl[k][0].stop == hh or sl[k][1].stop == ww
    sub = np.isin(lab, [k + 1 for k, v in enumerate(sz) if v > sz.max() * .01 and not (edge(k) and v < sz.max() * .3)])   # 切到鄰居的碎片丟掉
    ys = np.where(sub.any(1))[0]; xs = np.where(sub.any(0))[0]
    bx0, by0, bx1, by1 = x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1
    mm = np.zeros_like(m); mm[y0:y1, x0:x1] = sub
    k = SIZE / max(bx1 - bx0, by1 - by0); tw, th = max(1, round((bx1 - bx0) * k)), max(1, round((by1 - by0) * k))
    im = downsample(a, mm, (bx0, by0, bx1, by1), tw, th, 0, 0)[:th, :tw]
    (im,), _ = quantize([im], 20)
    Image.fromarray(im).save(f'sprites/ui2/{nm}.png'); print(nm, tw, th)
