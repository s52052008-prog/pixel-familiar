#!/usr/bin/env python3
"""把 AI 畫的大圖（純綠底 #00FF00）轉成遊戲用的 48×48 像素圖。

用法：python3 tools/import_art.py flame
輸入：art/src/<屬性>/<屬性>_<階段>_<open|closed>.png
輸出：sprites/<屬性>_<1-4>_<open|closed>.png（48×48，透明背景，腳底對齊 y=46）
      art/preview-<屬性>.png（放大預覽）

做法：
1. 去綠底（含邊緣綠色溢色）。
2. 睜眼與閉眼兩張用同一個裁切框和縮放比例，動畫才不會跳動。
3. 每個目標像素取來源區塊的「眾數顏色」；深色描邊只要佔到一定比例就保留，避免縮小後線條消失。
4. 調色盤量化到約 20 色，最後補一圈 1px 深色外框。
"""
import sys, os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CELL = 48
MODE = os.environ.get('MODE', 'center')
DARK = 0.42                # 區塊裡深色超過這個比例才畫成線條
GROUND = 46               # 腳底所在的列
FIT = {1: (35, 33), 2: (39, 39), 3: (44, 43), 4: (48, 45)}   # 各階段最大 寬、高
STAGES = {1: 'juvenile', 2: 'teen', 3: 'adult', 4: 'ascended'}


def mask_of(a):
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    green = (g > 150) & (g - r > 70) & (g - b > 70)
    return ~green


def load(path):
    a = np.asarray(Image.open(path).convert('RGB'))
    return a, mask_of(a)


def bbox(m):
    ys, xs = np.where(m)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def lum(c):
    return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]


def downsample(a, m, box, tw, th, ox, oy):
    x0, y0, x1, y1 = box
    out = np.zeros((CELL, CELL, 4), np.uint8)
    sw, sh = (x1 - x0) / tw, (y1 - y0) / th
    for j in range(th):
        for i in range(tw):
            sx0, sx1 = int(x0 + i * sw), int(x0 + (i + 1) * sw)
            sy0, sy1 = int(y0 + j * sh), int(y0 + (j + 1) * sh)
            bm = m[sy0:sy1, sx0:sx1]
            if bm.mean() < 0.45:
                continue
            px = a[sy0:sy1, sx0:sx1][bm]
            q = (px // 24).astype(np.int32)
            keys = q[:, 0] * 10000 + q[:, 1] * 100 + q[:, 2]
            dark = (0.3 * px[:, 0] + 0.59 * px[:, 1] + 0.11 * px[:, 2]) < 60
            if dark.mean() > DARK:            # 描邊／眼睛線條優先
                sel = px[dark]
            elif MODE == 'center':           # 取區塊中心附近的顏色：細節（眼睛高光）比較留得住
                cy_, cx_ = (sy1 - sy0) // 2, (sx1 - sx0) // 2
                r = max(1, int(min(sw, sh) * .18))
                blk = a[sy0:sy1, sx0:sx1][max(0, cy_ - r):cy_ + r + 1, max(0, cx_ - r):cx_ + r + 1].reshape(-1, 3)
                bmk = bm[max(0, cy_ - r):cy_ + r + 1, max(0, cx_ - r):cx_ + r + 1].reshape(-1)
                sel = blk[bmk] if bmk.any() else px
            else:
                vals, cnt = np.unique(keys, return_counts=True)
                sel = px[keys == vals[cnt.argmax()]]
            c = np.median(sel, axis=0).astype(np.uint8)
            out[oy + j, ox + i] = (*c, 255)
    return out


def quantize(imgs, n=22):
    """兩張圖共用同一組調色盤，眨眼時顏色不會閃。"""
    stack = np.concatenate([im.reshape(-1, 4) for im in imgs])
    solid = stack[stack[:, 3] > 0][:, :3]
    pal_img = Image.fromarray(solid.reshape(1, -1, 3)).quantize(n, method=Image.Quantize.MEDIANCUT)
    pal = np.array(pal_img.getpalette()[:n * 3]).reshape(-1, 3)
    res = []
    for im in imgs:
        o = im.copy()
        sel = o[..., 3] > 0
        c = o[sel][:, :3].astype(int)
        d = ((c[:, None, :] - pal[None]) ** 2).sum(-1)
        o[sel, :3] = pal[d.argmin(1)]
        res.append(o)
    return res, pal


def add_outline(im, col):
    """最外圈的像素統一換成描邊色（不往外加粗）。"""
    a = im[..., 3] > 0
    p = np.pad(a, 1)
    interior = p[2:, 1:-1] & p[:-2, 1:-1] & p[1:-1, 2:] & p[1:-1, :-2]
    im[a & ~interior] = (*col, 255)
    return im


def process(el):
    src = os.path.join(ROOT, 'art', 'src', el)
    outdir = os.path.join(ROOT, 'sprites')
    os.makedirs(outdir, exist_ok=True)
    previews = []
    for st, name in STAGES.items():
        pair = {}
        for eye in ('open', 'closed'):
            p = os.path.join(src, f'{el}_{st}_{name}_{eye}.png')
            pair[eye] = load(p)
        boxes = [bbox(m) for _, m in pair.values()]
        box = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
        bw, bh = box[2] - box[0], box[3] - box[1]
        mw, mh = FIT[st]
        k = min(mw / bw, mh / bh)
        tw, th = max(1, round(bw * k)), max(1, round(bh * k))
        ox, oy = (CELL - tw) // 2, GROUND - th
        imgs = [downsample(a, m, box, tw, th, ox, oy) for a, m in pair.values()]
        imgs, pal = quantize(imgs)
        outline_col = min(pal.tolist(), key=lambda c: lum(c))
        imgs = [add_outline(im, outline_col) for im in imgs]
        for eye, im in zip(pair.keys(), imgs):
            Image.fromarray(im, 'RGBA').save(os.path.join(outdir, f'{el}_{st}_{eye}.png'), optimize=True)
            previews.append(im)
        print(f'{el} {st} {name}: {tw}x{th} 原圖 {bw}x{bh}')
    # 預覽：8 張排一列，放大 6 倍，棋盤底
    sc = 6
    pv = Image.new('RGBA', (CELL * sc * len(previews), CELL * sc), (40, 52, 70, 255))
    for i, im in enumerate(previews):
        pv.alpha_composite(Image.fromarray(im, 'RGBA').resize((CELL * sc, CELL * sc), Image.NEAREST), (i * CELL * sc, 0))
    pv.save(os.path.join(ROOT, 'art', f'preview-{el}.png'))


if __name__ == '__main__':
    for el in sys.argv[1:] or ['flame']:
        process(el)
