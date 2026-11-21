"""V1.86 招式／天賦／狀態圖示：GPT 畫的三張格子圖 → sprites/sk/*.png（最長邊 32px）
用法：python3 tools/import_skills.py   （讀 art/src/sk/elem.png、boss.png、common.png）"""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, 'tools')
import import_art
from import_art import downsample, quantize
import_art.DARK = .5
EL = ['fire', 'water', 'leaf', 'earth', 'bird', 'elec', 'metal']
COLS = ['badge', 'tal1', 'tal2', 'ctr', 'sp', 'ult', 'life']
SHEETS = {
  'elem': (7, 7, [f'{e}_{c}' for e in EL for c in COLS]),
  'boss': (5, 4, ['b_mossshell', 'b_mossregen', 'b_lavabody', 'b_rhinoburn', 'b_rhinocharge',
                  'b_bonearmor', 'b_bonewall', 'b_ghost', 'b_chant', 'b_confuse',
                  'b_reap', 'b_doom', 'b_flamewing', 'b_firewind', 'b_rebirth',
                  'b_scale', 'b_breath', 'b_chill', 'b_icetide', 'b_zero']),
  'peels': (4, 2, ['peel_banana', 'peel_melonw', 'peel_melon', 'peel_dragon', 'peel_coconut', 'peel_nut', 'peel_potato', 'peel_fbone']),
  'common': (6, 3, ['m_tackle', 'm_charge', 'm_guard', 'm_potion', 'm_potion2', 'm_combo',
                    'm_bond', 's_burn', 's_para', 's_frozen', 's_frost', 's_charged',
                    's_stiff', 's_rage', 's_drain', 's_elite', 't_boss', 'm_elixir']),
}
SIZE = 32
ONLY = None
os.makedirs('sprites/sk', exist_ok=True)
import sys as _s
ONLY = _s.argv[1] if len(_s.argv) > 1 else None
for sheet, (C, R, NAMES) in SHEETS.items():
    if ONLY and sheet != ONLY: continue
    size = 14 if sheet == 'peels' else SIZE
    outdir = 'sprites/items' if sheet == 'peels' else 'sprites/sk'
    A4 = np.asarray(Image.open(f'art/src/sk/{sheet}.png').convert('RGBA')); a = A4[..., :3]
    m = A4[..., 3] > 140
    H, W = m.shape
    for i, nm in enumerate(NAMES):
        r, c = divmod(i, C); y0, y1 = r * H // R, (r + 1) * H // R; x0, x1 = c * W // C, (c + 1) * W // C
        sub = m[y0:y1, x0:x1].copy(); lab, n = ndimage.label(sub); sz = ndimage.sum(sub, lab, range(1, n + 1))
        sl = ndimage.find_objects(lab); hh, ww = sub.shape
        edge = lambda k: sl[k][0].start == 0 or sl[k][1].start == 0 or sl[k][0].stop == hh or sl[k][1].stop == ww
        keep = [k + 1 for k, v in enumerate(sz) if v > sz.max() * .004 and not (edge(k) and v < sz.max() * .3)]
        sub = np.isin(lab, keep)
        ys = np.where(sub.any(1))[0]; xs = np.where(sub.any(0))[0]
        bx0, by0, bx1, by1 = x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1
        mm = np.zeros_like(m); mm[y0:y1, x0:x1] = sub
        k = size / max(bx1 - bx0, by1 - by0); tw, th = max(1, round((bx1 - bx0) * k)), max(1, round((by1 - by0) * k))
        im = downsample(a, mm, (bx0, by0, bx1, by1), tw, th, 0, 0)[:th, :tw]
        (im,), _ = quantize([im], 16 if sheet == 'peels' else 24)
        Image.fromarray(im).save(f'{outdir}/{nm}.png')
    print(sheet, len(NAMES))
