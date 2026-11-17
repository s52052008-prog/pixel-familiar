#!/usr/bin/env python3
"""把一張「設計總表」切成單張圖，交給 import_art.py。

怪獸總表：2 列 × 4 欄（上排睜眼、下排閉眼；左到右＝幼年、少年、成年、高階）
  python3 tools/slice_sheet.py creature forest art/src/sheets/forest.png
蛋總表：上排 水 森 土 鳥、下排 電 金 火（每顆蛋下方的文字標籤會被切掉）
  python3 tools/slice_sheet.py eggs art/src/sheets/eggs.png
"""
import sys, os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STAGES = ['1_juvenile', '2_teen', '3_adult', '4_ascended']


def creature(el, path):
    """用「連在一起的色塊」找出每一隻，而不是硬切成等寬格子（翅膀常常超過格線）。"""
    import numpy as np
    from scipy import ndimage
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from import_art import mask_of
    im = Image.open(path).convert('RGB')
    a = np.asarray(im)
    H, W = a.shape[:2]
    fg = mask_of(a)
    lab, n = ndimage.label(fg)
    objs = ndimage.find_objects(lab)
    areas = ndimage.sum(fg, lab, range(1, n + 1))
    out = os.path.join(ROOT, 'art', 'src', el)
    os.makedirs(out, exist_ok=True)
    for row, eye in enumerate(['open', 'closed']):
        comps = [i for i, sl in enumerate(objs) if row * H / 2 <= (sl[0].start + sl[0].stop) / 2 < (row + 1) * H / 2]
        main = sorted(sorted(comps, key=lambda i: -areas[i])[:4], key=lambda i: objs[i][1].start)
        groups = {m: [m] for m in main}
        for i in comps:
            if i in main:
                continue
            cx = (objs[i][1].start + objs[i][1].stop) / 2
            near = min(main, key=lambda m: abs((objs[m][1].start + objs[m][1].stop) / 2 - cx))
            groups[near].append(i)
        for st, m in zip(STAGES, main):
            ids = [g + 1 for g in groups[m]]
            sel = np.isin(lab, ids)
            ys, xs = np.where(sel)
            pad = 12
            y0, y1, x0, x1 = max(0, ys.min() - pad), ys.max() + pad, max(0, xs.min() - pad), xs.max() + pad
            crop = a[y0:y1, x0:x1].copy()
            crop[~sel[y0:y1, x0:x1]] = (0, 255, 0)
            Image.fromarray(crop).save(os.path.join(out, f'{el}_{st}_{eye}.png'))
    print('sliced', el)


# 蛋總表的格位（以 1659×948 的原圖為準，依比例換算），只取蛋本體，不含下方標籤
EGG_BOX = {
    'tide': (0.00, 0.00, 0.25, 0.39), 'forest': (0.25, 0.00, 0.50, 0.39),
    'earth': (0.50, 0.00, 0.75, 0.39), 'bird': (0.75, 0.00, 1.00, 0.39),
    'elec': (0.05, 0.50, 0.35, 0.86), 'metal': (0.37, 0.50, 0.63, 0.86), 'flame': (0.65, 0.50, 0.97, 0.86),
}


def eggs(path):
    im = Image.open(path).convert('RGB')
    W, H = im.size
    out = os.path.join(ROOT, 'art', 'src', 'eggs')
    os.makedirs(out, exist_ok=True)
    for el, (a, b, c, d) in EGG_BOX.items():
        im.crop((round(a * W), round(b * H), round(c * W), round(d * H))).save(os.path.join(out, f'egg_{el}.png'))
    print('sliced eggs')


def pair(el, path, stage='0_baby'):
    """一張圖裡左右兩隻：左＝睜眼、右＝閉眼（嬰兒期用）。"""
    import numpy as np
    from scipy import ndimage
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from import_art import mask_of
    a = np.asarray(Image.open(path).convert('RGB'))
    fg = mask_of(a)
    lab, n = ndimage.label(fg)
    objs = ndimage.find_objects(lab)
    areas = ndimage.sum(fg, lab, range(1, n + 1))
    main = sorted(sorted(range(n), key=lambda i: -areas[i])[:2], key=lambda i: objs[i][1].start)
    out = os.path.join(ROOT, 'art', 'src', el)
    os.makedirs(out, exist_ok=True)
    for eye, m in zip(['open', 'closed'], main):
        cx = (objs[m][1].start + objs[m][1].stop) / 2
        ids = [i + 1 for i in range(n) if i == m or abs((objs[i][1].start + objs[i][1].stop) / 2 - cx) < abs((objs[i][1].start + objs[i][1].stop) / 2 - (sum((objs[k][1].start + objs[k][1].stop) / 2 for k in main) - cx))]
        sel = np.isin(lab, ids)
        ys, xs = np.where(sel)
        y0, y1, x0, x1 = max(0, ys.min() - 12), ys.max() + 12, max(0, xs.min() - 12), xs.max() + 12
        crop = a[y0:y1, x0:x1].copy()
        crop[~sel[y0:y1, x0:x1]] = (0, 255, 0)
        Image.fromarray(crop).save(os.path.join(out, f'{el}_{stage}_{eye}.png'))
    print('sliced pair', el)


if __name__ == '__main__':
    if sys.argv[1] == 'pair':
        pair(sys.argv[2], sys.argv[3])
    elif sys.argv[1] == 'creature':
        creature(sys.argv[2], sys.argv[3])
    else:
        eggs(sys.argv[2])
