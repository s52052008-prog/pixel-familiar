"""V1.90 小圖直接內嵌進 index.html（const EMB）：Claude 上的版本檔案數有上限，新圖不用另外放檔案"""
import base64, glob, re
L = [f for f in sorted(glob.glob('sprites/gbtn/*.png') + glob.glob('sprites/mush/*.png') + glob.glob('sprites/pk/*.png') + glob.glob('sprites/uik/*.png')) if not re.search(r'/(heart|star|bomb|start_s)\.png$', f)]
# V1.91.1 放到獨立的 emb.js（index.html 太大，手機網路慢時 3 秒內載不完會一直拿到舊版）
open('emb.js', 'w').write('window.EMB={' + ','.join(f"'{f}':'data:image/png;base64,{base64.b64encode(open(f, 'rb').read()).decode()}'" for f in L) + '};   // 由 tools/embed_small.py 產生\n'); print('embedded', len(L))
