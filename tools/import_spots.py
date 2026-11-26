"""V1.94 祕密景點插畫（GPT 畫）→ 縮成像素大小，打包成 spots.js（一個檔案，要用的時候才載入）"""
from PIL import Image
import base64, io, os
OUT = {}
for el in ['flame', 'tide', 'forest', 'earth', 'bird', 'elec', 'metal']:
    im = Image.open(f'art/src/spots/{el}.png').convert('RGB').resize((240, 180), Image.BOX)
    im = im.quantize(colors=96, method=Image.MEDIANCUT, dither=Image.NONE).convert('RGB')
    im.save(f'sprites/spots/{el}.png', optimize=True)
    b = io.BytesIO(); im.save(b, 'PNG', optimize=True); OUT[el] = base64.b64encode(b.getvalue()).decode(); print(el, len(b.getvalue()))
open('spots.js', 'w').write('window.SPOT_IMG={' + ','.join(f"{k}:'data:image/png;base64,{v}'" for k, v in OUT.items()) + '};   // 由 tools/import_spots.py 產生\n')
print('spots.js', os.path.getsize('spots.js'))
