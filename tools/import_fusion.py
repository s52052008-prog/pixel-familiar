#!/usr/bin/env python3
"""血繼幻獸圖（綠底，4 欄＝幼年／少年／成年／高階 × 2 排＝睜眼／閉眼）→ sprites/fusion/<名>_<1..4>_<open|closed>.png
用法：python3 tools/import_fusion.py <名稱> [原圖路徑] [--base=主屬性] [--eyes=左眼x,右眼x,y] [--iris=#深色,#亮色]
  --eyes：高階縮圖後眼睛糊掉時，在這兩個位置重畫 5×5 的像素大眼（睜眼）和「︶」（閉眼）
例：python3 tools/import_fusion.py blossom --base=flame --eyes=13,22,17 --iris=#8a3a10,#f0a030
會另外輸出 art/preview-fusion-<名稱>.png（和主屬性同階段並排比較）
"""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from import_art import mask_of, downsample, quantize, add_outline, lum, CELL, FIT

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def runs(v, minlen):
    out, s = [], None
    for i, x in enumerate(list(v) + [0]):
        if x and s is None: s = i
        if not x and s is not None:
            if i - s >= minlen: out.append((s, i))
            s = None
    return out


def bbox(m):
    ys, xs = np.nonzero(m); return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def columns(m, n=4):
    """找出 n 欄：先用空白分欄；黏在一起的就在最窄處切開"""
    cs = m.sum(0); cols = runs(ndimage.binary_dilation(cs > 0, iterations=4), 40)
    while len(cols) < n:
        i = max(range(len(cols)), key=lambda k: cols[k][1] - cols[k][0]); x0, x1 = cols[i]
        a, b = x0 + (x1 - x0) // 4, x1 - (x1 - x0) // 4; cut = a + int(np.argmin(cs[a:b]))
        cols[i:i + 1] = [(x0, cut), (cut, x1)]
    return cols[:n]


K, W = (26, 16, 32, 255), (255, 255, 255, 255)
def hexc(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)
def fix_eyes(im, xs, y, iris, closed):
    a = im.copy(); from collections import Counter
    face = [tuple(a[yy, xx]) for yy in range(y + 5, y + 9) for xx in range(min(xs), max(xs) + 5) if a[yy, xx, 3] and int(a[yy, xx, :3].sum()) > 480]
    skin = Counter(face).most_common(1)[0][0] if face else (253, 235, 200, 255)
    B, G = iris; tpl = ['.....', '.....', '.KKK.', 'K...K', '.....'] if closed else ['.KKK.', 'KWWBK', 'KWBBK', 'KBGGK', '.KKK.']
    for x0 in xs:
        for j in range(5):
            for i in range(5): a[y + j, x0 + i] = skin
        for j, row in enumerate(tpl):
            for i, ch in enumerate(row):
                if ch != '.': a[y + j, x0 + i] = {'K': K, 'W': W, 'B': B, 'G': G}[ch]
    return a


def main(name, path=None, base=None, eyes=None, iris=('#2a3a8a', '#e8a030')):
    path = path or os.path.join(ROOT, 'art', 'src', 'fusion', name + '.png')
    a = np.asarray(Image.open(path).convert('RGB')); m = mask_of(a)
    rows = runs(ndimage.binary_closing(m.sum(1) > 0, iterations=6), 40)[:2]
    cols = columns(m)
    out = os.path.join(ROOT, 'sprites', 'fusion'); os.makedirs(out, exist_ok=True); res = []
    for c, (x0, x1) in enumerate(cols):
        st = c + 1; mw, mh = FIT[st]; ms = []
        for (y0, y1) in rows:
            sub = np.zeros_like(m); sub[y0:y1, x0:x1] = m[y0:y1, x0:x1]
            lab, n = ndimage.label(sub); sz = ndimage.sum(sub, lab, range(1, n + 1))
            ms.append(np.isin(lab, [i + 1 for i, v in enumerate(sz) if v >= max(40, sz.max() * .002)]))
        bo = bbox(ms[0]); k = min(mw / (bo[2] - bo[0]), mh / (bo[3] - bo[1])); ims = []   # 睜眼／閉眼同一個比例
        for mm in ms:
            b = bbox(mm); tw, th = min(CELL - 2, round((b[2] - b[0]) * k)), min(45, round((b[3] - b[1]) * k))
            ims.append(downsample(a, mm, b, tw, th, (CELL - tw) // 2, 46 - th))
        ims, pal = quantize(ims, 24); oc = min(pal.tolist(), key=lambda q: lum(q)); ims = [add_outline(i, oc) for i in ims]
        if eyes and st == 4: ims = [fix_eyes(ims[0], eyes[:2], eyes[2], [hexc(c) for c in iris], False), fix_eyes(ims[1], eyes[:2], eyes[2], [hexc(c) for c in iris], True)]
        for kind, im in zip(('open', 'closed'), ims): Image.fromarray(im, 'RGBA').save(os.path.join(out, f'{name}_{st}_{kind}.png'))
        res.append(ims)
    S = 4; pv = Image.new('RGBA', (4 * (CELL * S * 2 + 20), CELL * S * 2 + 30), (70, 110, 70, 255))
    for c in range(4):
        X = c * (CELL * S * 2 + 20)
        if base:
            f = Image.open(os.path.join(ROOT, 'sprites', f'{base}_{c + 1}_open.png')).convert('RGBA'); pv.alpha_composite(f.resize((CELL * S, CELL * S), Image.NEAREST), (X, 0))
        for r in range(2): pv.alpha_composite(Image.fromarray(res[c][r], 'RGBA').resize((CELL * S, CELL * S), Image.NEAREST), (X + CELL * S, r * (CELL * S + 30)))
    pv.save(os.path.join(ROOT, 'art', f'preview-fusion-{name}.png'))


if __name__ == '__main__':
    opt = lambda k: next((x[len(k) + 3:] for x in sys.argv[1:] if x.startswith('--' + k + '=')), None)
    args = [x for x in sys.argv[1:] if not x.startswith('--')]
    ey = opt('eyes'); ir = opt('iris')
    main(args[0], args[1] if len(args) > 1 else None, opt('base'), [int(v) for v in ey.split(',')] if ey else None, ir.split(',') if ir else ('#2a3a8a', '#e8a030'))
