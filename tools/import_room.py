"""V1.83 房間底圖：三種壁紙（art/src/room/*.png）→ sprites/arena/room_*.png 128×112；牆 0–60、踢腳板以下 60–112
用法：python3 tools/import_room.py"""
import glob, os
from PIL import Image
for f in sorted(glob.glob('art/src/room/*.png')):
    k = os.path.basename(f)[:-4]; im = Image.open(f).convert('RGB'); w, h = im.size; cut = round(h * 710 / 1174)
    top = im.crop((0, 0, w, cut)).resize((128, 60), Image.BOX); bot = im.crop((0, cut, w, h)).resize((128, 52), Image.BOX)
    o = Image.new('RGB', (128, 112)); o.paste(top, (0, 0)); o.paste(bot, (0, 60))
    o = o.quantize(colors=32, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB'); o.save(f'sprites/arena/room_{k}.png', optimize=True); print(k)
