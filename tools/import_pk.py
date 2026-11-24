"""V1.90 射門 PK 的圖：球場背景、力道條、準度條、足球（art/src/pk → sprites/pk）"""
import numpy as np
from PIL import Image
from scipy import ndimage
def cut(im, box, size):
    c = im.crop(box).convert('RGBA'); a = np.asarray(c).copy()
    bg = (a[..., :3].min(2) > 232)
    lab, n = ndimage.label(bg); H, W = bg.shape
    edge = set(lab[0]) | set(lab[-1]) | set(lab[:, 0]) | set(lab[:, -1]); edge.discard(0)
    a[np.isin(lab, list(edge))] = 0
    out = Image.fromarray(a).resize(size, Image.BOX); b = np.asarray(out).copy(); b[..., 3] = np.where(b[..., 3] > 110, 255, 0); return Image.fromarray(b)
f = Image.open('art/src/pk/field.png').convert('RGB').resize((128, 112), Image.BOX).quantize(64, dither=0).convert('RGB'); f.save('sprites/pk/field.png')
u = Image.open('art/src/pk/ui.png')
cut(u, (180, 85, 410, 717), (20, 56)).save('sprites/pk/power.png')
cut(u, (550, 298, 1302, 553), (68, 23)).save('sprites/pk/aim.png')
cut(u, (1447, 217, 1841, 609), (16, 16)).save('sprites/pk/ball.png')
print('ok')
