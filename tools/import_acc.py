"""V1.88 寵物裝飾：GPT 畫的格子圖 → sprites/acc/*.png（之後內嵌進 index.html）
用法：python3 tools/import_acc.py"""
import sys, base64, re, glob, os
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, 'tools')
import import_art
from import_art import downsample, quantize
import_art.DARK = .5; import_art.CELL = 64
SHEETS = {
  'santa': (3, 1, [('santa', 30), ('santa_side', 30), ('santa_s', 24)]),
  'mushhat': (2, 1, [('mushhat', 28), ('mushhat_s', 24)]),
  'acc2': (5, 2, [('gradcap', 26), ('halo', 24), ('pumpkin', 28), ('monocle', 16), ('eyepatch', 24), ('rose', 18), ('lollipop', 12), ('bowtie', 16), ('scarf', 20)]),
  'acc': (5, 2, [('bow', 18), ('tophat', 24), ('crown', 22), ('glasses', 24), ('wreath', 30), ('chef', 24), ('necklace', 22), ('cigar', 20), ('turkey', 28), ('antler', 30)]),
}
def fg_mask(path):
    im = Image.open(path).convert('RGBA'); A = np.asarray(im); a = A[..., :3]
    if (A[..., 3] < 50).mean() > .2: return a, A[..., 3] > 140
    ai = a.astype(int); bg = (ai.min(-1) > 215) & (ai.max(-1) - ai.min(-1) < 22)
    lab, n = ndimage.label(bg); border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    keep = ~np.isin(lab, list(border))
    if 'acc2' in path:   # 被圈住的大片白底（光環中間、眼罩繩子圈住的地方）也算背景
        sz = ndimage.sum(bg, lab, range(1, n + 1)); big = []
        for i, sl in enumerate(ndimage.find_objects(lab)):
            if sl is None or sz[i] < 2500: continue
            h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
            if w > h * 1.8: big.append(i + 1)   # 扁扁的（光環中間、繩子圈）才挖掉；骷髏頭那種方方的留著
        keep &= ~np.isin(lab, big)
    return a, keep
for sheet, (C, R, ITEMS) in SHEETS.items():
    a, m = fg_mask(f'art/src/acc/{sheet}.png'); H, W = m.shape
    for i, (nm, size) in enumerate(ITEMS):
        r, c = divmod(i, C); y0, y1 = r * H // R, (r + 1) * H // R; x0, x1 = c * W // C, (c + 1) * W // C
        sub = m[y0:y1, x0:x1].copy(); lab, n = ndimage.label(sub); sz = ndimage.sum(sub, lab, range(1, n + 1))
        sub = np.isin(lab, [k + 1 for k, v in enumerate(sz) if v > sz.max() * .01])
        ys = np.where(sub.any(1))[0]; xs = np.where(sub.any(0))[0]
        bx0, by0, bx1, by1 = x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1
        mm = np.zeros_like(m); mm[y0:y1, x0:x1] = sub
        k = size / (bx1 - bx0); tw, th = size, max(1, round((by1 - by0) * k))
        im = downsample(a, mm, (bx0, by0, bx1, by1), tw, th, 0, 0)[:th, :tw]
        (im,), _ = quantize([im], 20)
        if sheet == 'acc2':   # 去掉孤零零的一點
            al = im[..., 3] > 0; nb = ndimage.convolve(al.astype(int), np.ones((3, 3), int), mode='constant') - al
            im[al & (nb == 0)] = 0
        Image.fromarray(im).save(f'sprites/acc/{nm}.png'); print(nm, tw, th)
mp = {os.path.basename(f)[:-4]: base64.b64encode(open(f, 'rb').read()).decode() for f in sorted(glob.glob('sprites/acc/*.png'))}
line = 'const ACC_B64=' + '{' + ','.join(f"{k}:'{v}'" for k, v in mp.items()) + '};   // 由 tools/import_acc.py 產生'
h = open('index.html').read()
if 'const ACC_B64=' in h: h = re.sub(r'const ACC_B64=\{.*?\};[^\n]*', lambda _: line, h, count=1)
else: h = h.replace('const DECOR_B64=', line + '\nconst DECOR_B64=', 1)
open('index.html', 'w').write(h); print('embedded', len(mp))
