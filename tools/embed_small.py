"""V1.90 小圖直接內嵌進 index.html（const EMB）：Claude 上的版本檔案數有上限，新圖不用另外放檔案"""
import base64, glob, re
L = [f for f in sorted(glob.glob('sprites/gbtn/*.png') + glob.glob('sprites/mush/*.png') + glob.glob('sprites/pk/*.png') + glob.glob('sprites/uik/*.png')) if not re.search(r'/(heart|star|bomb|start_s)\.png$', f)]
line = 'const EMB={' + ','.join(f"'{f}':'data:image/png;base64,{base64.b64encode(open(f, 'rb').read()).decode()}'" for f in L) + '},SP=p=>EMB[p]||p;   // 由 tools/embed_small.py 產生'
h = open('index.html').read()
if 'const EMB={' in h: h = re.sub(r"const EMB=\{.*?\},SP=p=>EMB\[p\]\|\|p;[^\n]*", lambda _: line, h, count=1)
else: h = h.replace('const ACC_B64=', line + '\nconst ACC_B64=', 1)
open('index.html', 'w').write(h); print('embedded', len(L))
