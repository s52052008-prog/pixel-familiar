#!/usr/bin/env python3
"""血繼幻獸圖（綠底，4 欄＝幼年／少年／成年／高階 × 2 排＝睜眼／閉眼）→ sprites/fusion/<名>_<1..4>_<open|closed>.png
用法：python3 tools/import_fusion.py <名稱> [原圖路徑] [--base=主屬性] [--eyes=左眼x,右眼x,y] [--iris=#深色,#亮色]
  --sym=X1,Y1,X2,Y2,L|R[,半徑]：不重畫眼睛，把左（L）或右（R）眼鏡像到另一邊，讓兩眼對稱（座標是原圖上的眼睛中心）
  --spark：有細電光的（電系組合）把混到綠底的藍綠色換回電光青
  --eyesrc=X1,Y1,X2,Y2：原圖上左右眼中心（高階那欄），自動換算位置（比 --eyes 準）
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


def main(name, path=None, base=None, eyes=None, iris=('#2a3a8a', '#e8a030'), esize=5, keepclosed=False, clean=None, mouth=None, eyesrc=None, spark=False, sym=None):
    path = path or os.path.join(ROOT, 'art', 'src', 'fusion', name + '.png')
    a = np.asarray(Image.open(path).convert('RGB')); m = mask_of(a)
    bgc = np.median(np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3)]), axis=0)   # 背景綠
    m &= np.abs(a.astype(int) - bgc).sum(2) > 70   # 被圈起來的綠底（觸角的圈圈裡面）也要去掉；樹葉的黃綠色離背景綠夠遠，不會被去掉
    rows = runs(ndimage.binary_closing(m.sum(1) > 0, iterations=6), 40)[:2]
    if len(rows) < 2:   # 上下兩排貼太近（高階的頭髮／翅膀幾乎碰到）：在中間找最空的那一列切開
        H = m.shape[0]; s = m.sum(1); cut = H * 2 // 5 + int(np.argmin(s[H * 2 // 5: H * 3 // 5])); r0 = rows[0]
        rows = [(r0[0], cut), (cut, r0[1])]
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
        if eyesrc and st == 4:   # 原圖上的眼睛中心 → 48 格座標（和縮圖同一個比例），眼睛就不會放歪
            b = bbox(ms[0]); tw = min(CELL - 2, round((b[2] - b[0]) * k)); th = min(45, round((b[3] - b[1]) * k)); ox, oy = (CELL - tw) // 2, 46 - th
            mp = lambda X, Y: ((X - b[0]) * tw / (b[2] - b[0]) + ox, (Y - b[1]) * th / (b[3] - b[1]) + oy)
            (lx, ly), (rx, ry) = mp(*eyesrc[:2]), mp(*eyesrc[2:4]); s5 = 5 if esize in (5, 'beast') else 4
            eyes = [round(lx - s5 / 2), round(rx - s5 / 2), round((ly + ry) / 2 - s5 / 2)]; print('眼睛換算成', eyes)
        for im in (ims if spark else []):   # --spark：細細的電光（青色）縮小後會混到綠底，變成藍綠色：換回電光青；樹葉（綠、不帶藍）不受影響
            r, g, bl = im[..., 0].astype(int), im[..., 1].astype(int), im[..., 2].astype(int)
            teal = (im[..., 3] > 0) & (r < 120) & (g > r + 40) & (bl > r + 30) & (np.abs(g - bl) < 70)   # 混到綠底的電光：紅很少、綠藍差不多；水的藍（藍比綠高很多）不會被改
            im[teal, 0] = np.clip(140 + (g[teal] - 120) // 2, 120, 220); im[teal, 1] = 235; im[teal, 2] = 255
        sy = SYMS.get(st) or (sym if st == 4 else None)
        if sy:   # --sym：不重畫，只把比較好看的那隻眼睛左右鏡像到另一邊，兩眼對稱
            b = bbox(ms[0]); tw = min(CELL - 2, round((b[2] - b[0]) * k)); th = min(45, round((b[3] - b[1]) * k)); ox, oy = (CELL - tw) // 2, 46 - th
            mp = lambda X, Y: (round((X - b[0]) * tw / (b[2] - b[0]) + ox), round((Y - b[1]) * th / (b[3] - b[1]) + oy))
            (lx, ly), (rx, ry) = mp(*sy['src'][:2]), mp(*sy['src'][2:4]); cy = round((ly + ry) / 2); h = sy['r']
            (sx, dx) = (lx, rx) if sy['from'] == 'L' else (rx, lx); print('鏡像眼睛', sy['from'], (lx, rx, cy))
            for im in ims:
                src = im.copy()
                for yy in range(cy - h, cy + h + 1):
                    for xo in range(-h, h + 1): im[yy, dx - xo] = src[yy, sx + xo]
        if WARM:   # --warm：整隻幾乎都是藍白色時，小小的橘色嘴喙、腳、粉紅臉頰會在減色時被吃掉：先記下來，減色後補回去
            acc = np.array([[245, 170, 60], [225, 130, 35], [170, 85, 25], [245, 150, 150], [215, 110, 115]])
            wk = []
            for im in ims:
                c = im[..., :3].astype(int); r, g, bl = c[..., 0], c[..., 1], c[..., 2]
                sel = (im[..., 3] > 0) & (r > 150) & (r - bl > 70) & (r - g > 60)
                wk.append((sel, acc[((c[sel][:, None, :] - acc[None]) ** 2).sum(-1).argmin(1)]))
        ims, pal = quantize(ims, 24)
        for im, (sel, cc) in zip(ims, wk if WARM else []): im[sel, :3] = cc
        ims, pal = ims, pal; oc = min(pal.tolist(), key=lambda q: lum(q)); ims = [add_outline(i, oc) for i in ims]
        if eyes and st == 4:
            ir = [hexc(c) for c in iris]
            if clean:   # 先清掉臉上的深色殘影，再畫眼睛
                ims = [clean_face(im, clean, set()) for im in ims]
            ims = [fix_eyes(ims[0], eyes[:2], eyes[2], ir, False, esize), ims[1] if keepclosed else fix_eyes(ims[1], eyes[:2], eyes[2], ir, True, esize)]
            if mouth:   # 小小的 ω 嘴（清殘影時會被一起清掉，補回來）
                for im in ims:
                    for dx, dy in ((0, 0), (1, 1), (2, 1), (3, 0)): im[mouth[1] + dy, mouth[0] + dx] = (70, 30, 20, 255)
        for mr in [q for q in MIR if q[0] == st]:   # --mir：在 48 格上精準鏡像（x → 軸2 − x），睜眼閉眼都套，兩眼一模一樣大
            _, mx0, mx1, my0, my1, ax2 = mr
            for im in ims:
                src = im.copy()
                for yy in range(my0, my1 + 1):
                    for xx in range(mx0, mx1 + 1): im[yy, ax2 - xx] = src[yy, xx]
        for pst, pts in PX:   # --px=階段:x,y,RRGGBB;…：最後手動修幾格（例如鬍鬚），睜眼閉眼都套
            if int(pst.rstrip('o')) == st:   # 階段後面加 o（例如 1o）＝只改睜眼那張
                for x, y, c in pts:
                    for im in (ims[:1] if pst.endswith('o') else ims): im[y, x] = hexc(c)
        for kind, im in zip(('open', 'closed'), ims): Image.fromarray(im, 'RGBA').save(os.path.join(out, f'{name}_{st}_{kind}.png'))
        res.append(ims)
    S = 4; pv = Image.new('RGBA', (4 * (CELL * S * 2 + 20), CELL * S * 2 + 30), (70, 110, 70, 255))
    for c in range(4):
        X = c * (CELL * S * 2 + 20)
        if base:
            f = Image.open(os.path.join(ROOT, 'sprites', f'{base}_{c + 1}_open.png')).convert('RGBA'); pv.alpha_composite(f.resize((CELL * S, CELL * S), Image.NEAREST), (X, 0))
        for r in range(2): pv.alpha_composite(Image.fromarray(res[c][r], 'RGBA').resize((CELL * S, CELL * S), Image.NEAREST), (X + CELL * S, r * (CELL * S + 30)))
    pv.save(os.path.join(ROOT, 'art', f'preview-fusion-{name}.png'))


SYMS = {int(x[5]): {'src': [int(v) for v in x[7:].split(',')[:4]], 'from': x[7:].split(',')[4], 'r': int(x[7:].split(',')[5]) if len(x[7:].split(',')) > 5 else 3} for x in sys.argv[1:] if x[:5] == '--sym' and x[5:6].isdigit()}   # --sym1=…～--sym4=：每個階段各自鏡像
PX = [(x[5:].split(':')[0], [(int(q.split(',')[0]), int(q.split(',')[1]), '#' + q.split(',')[2]) for q in x[5:].split(':')[1].split(';')]) for x in sys.argv[1:] if x.startswith('--px=')]
WARM = '--warm' in sys.argv
MIR = [[int(v) for v in x[6:].replace(':', ',').split(',')] for x in sys.argv[1:] if x.startswith('--mir=')]   # --mir=階段:x0,x1,y0,y1,軸2（可重複）

if __name__ == '__main__':
    opt = lambda k: next((x[len(k) + 3:] for x in sys.argv[1:] if x.startswith('--' + k + '=')), None)
    args = [x for x in sys.argv[1:] if not x.startswith('--')]
    ey = opt('eyes'); ir = opt('iris')
    main(args[0], args[1] if len(args) > 1 else None, opt('base'), [int(v) for v in ey.split(',')] if ey else None, ir.split(',') if ir else ('#2a3a8a', '#e8a030'), (opt('eyesize') if opt('eyesize') == 'beast' else int(opt('eyesize') or 5)), '--keepclosed' in sys.argv, [int(v) for v in opt('clean').split(',')] if opt('clean') else None, [int(v) for v in opt('mouth').split(',')] if opt('mouth') else None, [int(v) for v in opt('eyesrc').split(',')] if opt('eyesrc') else None, '--spark' in sys.argv, ({'src': [int(v) for v in opt('sym').split(',')[:4]], 'from': opt('sym').split(',')[4], 'r': int(opt('sym').split(',')[5]) if len(opt('sym').split(',')) > 5 else 3} if opt('sym') else None))
