"""戰鬥背景：GPT 畫的大圖（art/src/arena/*.png）→ 縮成遊戲解析度 128×112、32 色，看起來跟像素角色同一個風格
用法：python3 tools/import_arena.py"""
import glob, os
from PIL import Image
for f in sorted(glob.glob('art/src/arena/*.png')):
    k = os.path.basename(f)[:-4]
    q = Image.open(f).convert('RGB').resize((128, 112), Image.BOX).quantize(colors=32, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    q.save(f'sprites/arena/{k}.png', optimize=True); print(k)
