"""V1.90 冠宏畫的遊戲按鍵／圖示（art/src/ui2/ui.png → sprites/gbtn）、新蘑菇（art/src/ui2/mush.png → sprites/mush）"""
import numpy as np
from PIL import Image
from scipy import ndimage
def boxes(im, it):
    a = np.asarray(im.convert('RGBA')); m = a[..., 3] > 40
    lab, _ = ndimage.label(ndimage.binary_dilation(m, iterations=it))
    B = [(s[1].start, s[0].start, s[1].stop, s[0].stop) for s in ndimage.find_objects(lab) if (s[1].stop - s[1].start) * (s[0].stop - s[0].start) > 400]
    B.sort(key=lambda b: (b[1] + b[3]) / 2); R = []
    for b in B:
        if R and abs((b[1] + b[3]) / 2 - (R[-1][0][1] + R[-1][0][3]) / 2) < 110: R[-1].append(b)
        else: R.append([b])
    return [b for r in R for b in sorted(r, key=lambda b: b[0])]
def cut(im, b, sc):
    c = im.crop(b).convert('RGBA'); w, h = c.size
    o = c.resize((max(1, round(w / sc)), max(1, round(h / sc))), Image.BOX); a = np.asarray(o).copy(); a[..., 3] = np.where(a[..., 3] > 110, 255, 0); return Image.fromarray(a)
u = Image.open('art/src/ui2/ui.png'); B = boxes(u, 2)
N = ['tri', 'tri_p', 'cir', 'cir_p', 'sq', 'sq_p', 'x', 'x_p', 'up', 'up_p', 'down', 'down_p', 'left', 'left_p', 'right', 'right_p', 'start', 'start_s', 'gameover', 'coin0', 'coin1', 'coin2', 'coin3', 'heart', 'star', 'trophy', 'bomb', 'crown']
assert len(B) == len(N), len(B)
for n, b in zip(N, B): cut(u, b, 6).save(f'sprites/gbtn/{n}.png')
m = Image.open('art/src/ui2/mush.png'); B = boxes(m, 6)
for n, b in zip(['mushT', 'mushP', 'mushM', 'mushR', 'mushL', 'mushB', 'mushK', 'mushC'], B): cut(m, b, 10).save(f'sprites/mush/{n}.png')
print('ok')
