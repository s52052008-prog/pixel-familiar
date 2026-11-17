#!/usr/bin/env python3
"""血繼幻獸圖（綠底，4 欄＝幼年／少年／成年／高階 × 2 排＝睜眼／閉眼）→ sprites/fusion/<名>_<1..4>_<open|closed>.png
用法：python3 tools/import_fusion.py <名稱> [原圖路徑] [--base=主屬性] [--eyes=左眼x,右眼x,y] [--iris=#深色,#亮色]
  --mouth=x,y：補一個小小的 ω 嘴
  --clean=x0,y0,x1,y1：先把臉上這塊範圍的深色殘影清掉（避免看起來像多一隻眼睛）
  --eyesize=beast：四腳獸的高階用兇兇的獸眼；--eyesize=4：臉比較小時用 4×4 的眼睛；--keepclosed：閉眼保留原圖（原本就畫得好時）
  --eyes：高階縮圖後眼睛糊掉時，在這兩個位置重畫 5×5 的像素大眼（睜眼）和「︶」（閉眼）
例：python3 tools/import_fusion.py lava --base=earth --eyes=8,17,24 --eyesize=4 --iris=#c83a10,#f0a020 --clean=6,24,24,31 --mouth=12,28
   （眼睛位置：先在原圖找眼睛中心，用同一個縮放比例換算成 48 格座標，不要用猜的）
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
def fix_eyes(im, xs, y, iris, closed, size=5):
    """在 xs 兩個位置重畫眼睛。只把原本眼睛的深色殘影換成上下最近的毛色，不會蓋出一塊淺色方框"""
    a = im.copy(); B, G = iris
    if size == 'beast':   # 獸眼（四腳獸的高階）：斜斜的兇眉＋小小的紅眼珠；閉眼是一條斜線。左眼的範本，右眼左右鏡像
        size = 5; tplL = ['KK...', '.KKK.', '..KKK', '.....', '.....'] if closed else ['KK...', '.KKKK', '.KBWK', '..KKK', '.....']
        tpls = [tplL, [r[::-1] for r in tplL]]
    elif size == 4: tpl = ['....', '.KK.', 'K..K', '....'] if closed else ['.KK.', 'KWBK', 'KBGK', '.KK.']
    else: tpl = ['.....', '.....', '.KKK.', 'K...K', '.....'] if closed else ['.KKK.', 'KWWBK', 'KWBBK', 'KBGGK', '.KKK.']
    if 'tpls' not in dir(): tpls = [tpl, tpl]
    dark = lambda c: c[3] and (int(c[0]) + int(c[1]) + int(c[2]) < 260 or (c[0] > 150 and c[1] < 80 and c[2] < 80))
    for n, x0 in enumerate(xs):
        tpl = tpls[n]
        for i in range(size):
            x = x0 + i; col = [a[yy, x] for yy in list(range(y - 1, y - 4, -1)) + list(range(y + size, y + size + 3)) if 0 <= yy < a.shape[0] and a[yy, x, 3] and not dark(a[yy, x])]
            fill = col[0] if col else (253, 235, 200, 255)
            for j in range(size):
                if dark(a[y + j, x]): a[y + j, x] = fill
        for j, row in enumerate(tpl):
            for i, ch in enumerate(row):
                if ch != '.': a[y + j, x0 + i] = {'K': K, 'W': W, 'B': B, 'G': G}[ch]
    return a


def clean_face(a, box, keep):
    """box 範圍裡的深色殘影（keep 是新畫的眼睛格子，不動）換成左右最近的淺色"""
    a = a.copy(); x0, y0, x1, y1 = box
    dark = lambda c: c[3] and int(c[0]) + int(c[1]) + int(c[2]) < 330
    for y in range(y0, y1):
        for x in range(x0, x1):
            if (x, y) in keep or not dark(a[y, x]): continue
            for d in range(1, 6):
                cand = [a[y, xx] for xx in (x - d, x + d) if x0 - 3 <= xx < x1 + 3 and (xx, y) not in keep and not dark(a[y, xx])]
                if cand: a[y, x] = cand[0]; break
    return a


def main(name, path=None, base=None, eyes=None, iris=('#2a3a8a', '#e8a030'), esize=5, keepclosed=False, clean=None, mouth=None):
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
        if eyes and st == 4:
            ir = [hexc(c) for c in iris]
            if clean:   # 先清掉臉上的深色殘影，再畫眼睛
                ims = [clean_face(im, clean, set()) for im in ims]
            ims = [fix_eyes(ims[0], eyes[:2], eyes[2], ir, False, esize), ims[1] if keepclosed else fix_eyes(ims[1], eyes[:2], eyes[2], ir, True, esize)]
            if mouth:   # 小小的 ω 嘴（清殘影時會被一起清掉，補回來）
                for im in ims:
                    for dx, dy in ((0, 0), (1, 1), (2, 1), (3, 0)): im[mouth[1] + dy, mouth[0] + dx] = (70, 30, 20, 255)
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
    main(args[0], args[1] if len(args) > 1 else None, opt('base'), [int(v) for v in ey.split(',')] if ey else None, ir.split(',') if ir else ('#2a3a8a', '#e8a030'), (opt('eyesize') if opt('eyesize') == 'beast' else int(opt('eyesize') or 5)), '--keepclosed' in sys.argv, [int(v) for v in opt('clean').split(',')] if opt('clean') else None, [int(v) for v in opt('mouth').split(',')] if opt('mouth') else None)
