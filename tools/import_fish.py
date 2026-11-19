"""V1.83 釣魚美術：GPT 畫的格子圖 → sprites/items/*.png
用法：python3 tools/import_fish.py"""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, 'tools')
import import_art
from import_art import downsample, quantize
import_art.DARK = .5
def sheet(src, rows, cols, names, size, out='sprites/items', big=None):
    A4 = np.asarray(Image.open(src).convert('RGBA')); a = A4[..., :3]; m = A4[..., 3] > 140
    H, W = m.shape
    for i, nm in enumerate(names):
        if not nm: continue
        r, c = divmod(i, cols); y0, y1 = r * H // rows, (r + 1) * H // rows; x0, x1 = c * W // cols, (c + 1) * W // cols
        sub = m[y0:y1, x0:x1].copy(); lab, n = ndimage.label(sub); sz = ndimage.sum(sub, lab, range(1, n + 1))
        sl = ndimage.find_objects(lab); hh, ww = sub.shape
        edge = lambda k: sl[k][0].start == 0 or sl[k][1].start == 0 or sl[k][0].stop == hh or sl[k][1].stop == ww
        keep = [k + 1 for k, v in enumerate(sz) if v > sz.max() * .004 and not (edge(k) and v < sz.max() * .3)]
        sub = np.isin(lab, keep)
        ys = np.where(sub.any(1))[0]; xs = np.where(sub.any(0))[0]
        bx0, by0, bx1, by1 = x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1
        mm = np.zeros_like(m); mm[y0:y1, x0:x1] = sub
        for S, suf in [(size, '')] + ([(big, '_b')] if big else []):
            k = S / max(bx1 - bx0, by1 - by0); tw, th = max(1, round((bx1 - bx0) * k)), max(1, round((by1 - by0) * k))
            im = downsample(a, mm, (bx0, by0, bx1, by1), tw, th, 0, 0)[:th, :tw]
            (im,), _ = quantize([im], 24)
            Image.fromarray(im).save(f'{out}/{nm}{suf}.png'); print(nm + suf, tw, th)
FISH = ['f_creek', 'f_carp', 'f_catfish', 'f_ayu', 'f_rain', 'f_koi', 'f_dew', 'f_sunset', 'f_moon', 'f_eel', 'f_rainbow', 'f_star', 'f_king', 'f_dragon', 'j_boot', 'j_can']
sheet('art/src/fish/fish.png', 4, 4, FISH, 18, big=32)
GOODS = ['fo_trilobite', 'fo_ammonite', 'fo_tooth', 'fo_feather', 'fo_fish', 'fo_amber', 'gem_ruby', 'gem_sapphire', 'gem_emerald', 'scrap', 'amulet', 'grill_fish']
sheet('art/src/fish/goods.png', 3, 4, GOODS, 15, big=28)
sheet('art/src/fish/generator.png', 1, 2, ['gen_off', 'gen_on'], 24)
q = Image.open('art/src/fish/pondside.png').convert('RGB').resize((128, 112), Image.BOX).quantize(colors=32, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
q.save('sprites/arena/pondside.png', optimize=True); print('pondside')
sheet('art/src/fish/tools.png', 2, 3, ['rod_bamboo', 'rod_carbon', 'rod_gold', 'bobber', 'bait', 'bait2'], 16)
sheet('art/src/fish/tools.png', 2, 3, ['', '', '', 'bobber_s', '', ''], 6)
sheet('art/src/fish/campfire.png', 1, 2, ['fire_off', ''], 20)
sheet('art/src/fish/campfire.png', 1, 2, ['', 'fire_on'], 21)
q = Image.open('art/src/fish/pond_fp.png').convert('RGB').resize((128, 112), Image.BOX).quantize(colors=32, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
q.save('sprites/arena/pond_fp.png', optimize=True); print('pond_fp')
# 第一人稱用的大魚竿：去掉掛在竿尖下面的線和鉤子（遊戲裡自己畫釣線）
A4 = np.asarray(Image.open('art/src/fish/tools.png').convert('RGBA')).copy(); Hh, Ww = A4.shape[:2]
for c in range(3):
    x0, x1 = c * Ww // 3, (c + 1) * Ww // 3; y0, y1 = 0, Hh // 2
    sub = A4[y0:y1, x0:x1].copy(); m = sub[..., 3] > 140; ys, xs = np.where(m)
    bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1; w, h = bx1 - bx0, by1 - by0
    cut = np.zeros_like(m); cut[by0 + int(h * .16):, bx0 + int(w * .74):] = True; m &= ~cut
    sub[~m] = 0; im = Image.fromarray(sub[by0:by1, bx0:bx1]); k = 76 / h
    im = im.resize((max(1, round(w * k)), 76), Image.BOX); a = np.asarray(im).copy(); a[..., 3] = np.where(a[..., 3] > 110, 255, 0)
    im = Image.fromarray(a); rgb = im.convert('RGB').quantize(colors=24, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB'); out = Image.merge('RGBA', (*rgb.split(), im.split()[3]))
    nm = ['rod_bamboo', 'rod_carbon', 'rod_gold'][c] + '_fp'; out.save(f'sprites/items/{nm}.png'); print(nm, out.size)
sheet('art/src/fish/nest.png', 1, 1, ['nest_home'], 26)
sheet('art/src/fish/bush.png', 1, 2, ['bush_berry0', 'bush_berry'], 22)
q = Image.open('art/src/fish/farm_fp.png').convert('RGB').resize((128, 112), Image.BOX).quantize(colors=32, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
q.save('sprites/arena/farm_fp.png', optimize=True); print('farm_fp')
