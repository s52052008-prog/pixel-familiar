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
pass

# 背景：縮成遊戲像素、32 色、不抖色
for nm, W in [('gym_main', 128), ('gym_hook', 166), ('waterfall', 128)]:
    im = Image.open(f'art/src/train/{nm}.png').convert('RGB'); H = round(im.height * W / im.width)
    q = im.resize((W, H), Image.BOX).quantize(colors=32, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    q.save(f'sprites/train/bg_{nm}.png', optimize=True); print('bg', nm, W, H)

# ---- V1.64 投手、沙包重新切：保留黑色描邊（舊方法會把描邊吃掉造成破圖），沙包上緣補平 ----
from scipy import ndimage
def bgmask(a):
    wh = a.min(2) > 232; lab, n = ndimage.label(wh)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    return ~np.isin(lab, list(edge))
def cut2(a, m, box, H, out):
    x0, y0, x1, y1 = box; sub = m[y0:y1, x0:x1]; ys = np.where(sub.any(1))[0]; xs = np.where(sub.any(0))[0]
    bx0, by0, bx1, by1 = x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1
    rgb = a[by0:by1, bx0:bx1].astype(float); al = m[by0:by1, bx0:bx1].astype(float)
    th = H; tw = max(1, round((bx1 - bx0) * H / (by1 - by0)))
    o = np.zeros((th, tw, 4), np.uint8); hh, ww = al.shape
    for j in range(th):
        for i in range(tw):
            ya, yb = int(j * hh / th), max(int(j * hh / th) + 1, int((j + 1) * hh / th)); xa, xb = int(i * ww / tw), max(int(i * ww / tw) + 1, int((i + 1) * ww / tw))
            w = al[ya:yb, xa:xb]
            if w.mean() < .45: continue
            px = rgb[ya:yb, xa:xb][w > 0]; dark = px.max(1) < 70
            c = px[dark].mean(0) if dark.mean() > .3 else px[~dark].mean(0) if (~dark).any() else px.mean(0)   # 描邊優先：黑色佔三成以上就畫黑
            o[j, i, :3] = np.clip(c, 0, 255); o[j, i, 3] = 255
    return o   # 不再減色（減色會把灰白混成粉紅）
A2 = np.asarray(Image.open('art/src/train/sheet.png').convert('RGBA')); a2 = A2[..., :3]; m2 = A2[..., 3] > 128 if (A2[..., 3] < 20).mean() > .2 else bgmask(a2)   # 透明底就用透明度
for i, b in enumerate([(100, 0, 345, 360), (455, 0, 705, 360), (735, 0, 1062, 360), (1120, 0, 1495, 365)]):
    Image.fromarray(cut2(a2, m2, b, 30, f'pitch{i}')).save(f'sprites/train/pitch{i}.png'); print('pitch', i)
for nm, b in [('bag_r0', (75, 362, 220, 700)), ('bag_b0', (645, 362, 795, 700))]:
    q = cut2(a2, m2, b, 54, nm); cut = 19; ref = cut + 7   # 袋子本體從第 19 列開始；上緣肩膀的缺口用下面的顏色補平
    xs = np.where(q[ref, :, 3] > 0)[0]; L, R = xs.min(), xs.max()
    for y in range(cut, ref):
        for x in range(L, R + 1):
            if q[y, x, 3] == 0: q[y, x] = q[ref, x] if (x in (L, R) or y == cut) else q[ref + 2, x]
    for x in range(L, R + 1): q[cut, x] = q[ref, L]   # 最上面一列畫成描邊
    Image.fromarray(q).save(f'sprites/train/{nm}.png'); print(nm)
# 籃框也用保留描邊的切法；左右鏡像（柱子在右邊）
H4 = np.asarray(Image.open('art/src/train/hoop.png').convert('RGBA')); hm2 = H4[..., 3] > 128 if (H4[..., 3] < 20).mean() > .2 else bgmask(H4[..., :3])
q = cut2(H4[..., :3], hm2, (140, 165, 600, 1065), 67, 'hoop0'); Image.fromarray(q[:, ::-1].copy()).save('sprites/train/hoop_r.png'); print('hoop0 mirrored', q.shape)
