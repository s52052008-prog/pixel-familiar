"""訓練小遊戲＋頂球的素材與背景（GPT 畫的）→ sprites/train/
背景縮成遊戲的像素大小（寬 128／166 像素、32 色），跟角色同一個像素風格。
用法：python3 tools/import_train.py"""
import sys
import numpy as np
from PIL import Image
sys.path.insert(0, 'tools')
import import_art
from import_art import mask_of, downsample, quantize
import_art.DARK = .5
import_art.CELL = 96

def cut(a, m, box, size, out):
    x0, y0, x1, y1 = box
    sub = m[y0:y1, x0:x1]; ys = np.where(sub.any(1))[0]; xs = np.where(sub.any(0))[0]
    bx0, by0, bx1, by1 = x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1
    mm = np.zeros_like(m); mm[by0:by1, bx0:bx1] = m[by0:by1, bx0:bx1]
    k = size / max(bx1 - bx0, by1 - by0); tw, th = max(1, round((bx1 - bx0) * k)), max(1, round((by1 - by0) * k))
    im = downsample(a, mm, (bx0, by0, bx1, by1), tw, th, 0, 0)[:th, :tw]
    (im,), _ = quantize([im], 24)
    Image.fromarray(im).save(f'sprites/train/{out}.png'); print(out, tw, th)

a = np.asarray(Image.open('art/src/train/sheet.png').convert('RGB')); m = mask_of(a)
for i, b in enumerate([(100, 0, 345, 360), (455, 0, 705, 360), (735, 0, 1062, 360), (1120, 0, 1495, 365)]): cut(a, m, b, 30, f'pitch{i}')
cut(a, m, (1640, 100, 1785, 250), 12, 'ball'); cut(a, m, (1815, 30, 2075, 315), 16, 'ball_super')
for nm, b in [('bag_r0', (75, 362, 220, 700)), ('bag_b0', (645, 362, 795, 700))]: cut(a, m, b, 54, nm)
for i, b in enumerate([(1265, 355, 1480, 495), (1495, 355, 1705, 495), (1730, 355, 1950, 495)]): cut(a, m, b, 16, f'frisbee{i}')
cut(a, m, (1120, 505, 1375, 715), 20, 'bubble')
h = np.asarray(Image.open('art/src/train/hoop.png').convert('RGB')); hm = mask_of(h)
cut(h, hm, (140, 165, 600, 1065), 67, 'hoop0'); cut(h, hm, (720, 165, 1185, 1065), 67, 'hoop1')

# 背景：縮成遊戲像素、32 色、不抖色
for nm, W in [('gym_main', 128), ('gym_hook', 166), ('waterfall', 128)]:
    im = Image.open(f'art/src/train/{nm}.png').convert('RGB'); H = round(im.height * W / im.width)
    q = im.resize((W, H), Image.BOX).quantize(colors=32, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    q.save(f'sprites/train/bg_{nm}.png', optimize=True); print('bg', nm, W, H)
