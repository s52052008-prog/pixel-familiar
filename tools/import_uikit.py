"""V1.91 冠宏用 GPT 畫的 UI 零件包（art/src/uikit → sprites/uik）：外框、按鈕、分頁、進度條、格子、小圖示"""
import numpy as np
from PIL import Image
def trim(c):
    a = np.asarray(c); m = a[..., 3] > 40; ys, xs = np.where(m)
    return c.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)) if len(xs) else c
def clean(c):   # 拿掉從隔壁格子跑進來的碎片（碰到裁切邊的小塊）
    from scipy import ndimage
    a = np.asarray(c).copy(); lab, n = ndimage.label(ndimage.binary_dilation(a[..., 3] > 40, iterations=3)); H, W = lab.shape
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        if sl and (sl[0].start == 0 or sl[1].start == 0 or sl[0].stop == H or sl[1].stop == W) and (sl[0].stop - sl[0].start) * (sl[1].stop - sl[1].start) < H * W * .05: a[lab == i] = 0
    return Image.fromarray(a)
def save(im, box, name, sc):
    c = trim(clean(im.crop(box).convert('RGBA'))); w, h = c.size
    o = c.resize((max(1, round(w / sc)), max(1, round(h / sc))), Image.BOX); a = np.asarray(o).copy(); a[..., 3] = np.where(a[..., 3] > 110, 255, 0)
    Image.fromarray(a).save(f'sprites/uik/{name}.png'); return Image.fromarray(a).size
F = Image.open('art/src/uikit/frames.png')
P = {'title': (657, 15, 1401, 197), 'btn': (625, 229, 916, 347), 'btn_p': (922, 238, 1211, 349), 'btn_off': (1217, 230, 1505, 346),
     'panel': (27, 11, 609, 601), 'wood': (627, 382, 916, 483), 'wood_p': (935, 385, 1226, 484), 'chip': (1250, 388, 1512, 478),
     'ib_x': (1163, 514, 1274, 622), 'ib_back': (1282, 514, 1391, 622), 'ib_edit': (1398, 514, 1509, 622),
     'ib_x_p': (1163, 628, 1274, 737), 'ib_back_p': (1282, 628, 1393, 737), 'ib_edit_p': (1400, 628, 1511, 737),
     'tab_on': (618, 544, 875, 658), 'tab_off': (876, 544, 1133, 658), 'bar_g': (21, 674, 588, 779), 'bar_y': (21, 788, 587, 894), 'bar_r': (21, 901, 588, 1009),
     'ribbon': (605, 728, 1075, 890), 'slot': (1095, 788, 1285, 978), 'slot_on': (1286, 788, 1519, 978)}
for n, b in P.items(): print(n, save(F, b, n, 4))
I = Image.open('art/src/uikit/icons.png'); W, H = I.size
N = ['equip', 'edit', 'close', 'back', 'gear', 'bag', 'shop', 'dex', 'friends', 'water', 'atk', 'def', 'hp', 'spd', 'dodge_old', 'crit_old', 'coin', 'exp', 'mush', 'fish']
for i, n in enumerate(N): save(I, (int(i % 5 * W / 5), int(i // 5 * H / 4), int((i % 5 + 1) * W / 5), int((i // 5 + 1) * H / 4)), 'i_' + n, 8)
J = Image.open('art/src/uikit/icons2.png'); save(J, (100, 100, 950, 800), 'i_dodge', 10); save(J, (980, 100, 1720, 800), 'i_crit', 10)
print('ok')
