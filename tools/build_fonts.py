"""V1.94.1 遊戲字型：俐方體 11 號（Cubic 11, ACh-K, SIL OFL 1.1）、jf open 粉圓（Huninn, justfont, SIL OFL 1.1）
只留遊戲文字用得到的字，輸出 font_cubic.js、font_huninn.js（要用的時候才載入）。改了遊戲文字後重跑一次。
粉圓原始檔用 npm 抓 @fontsource/huninn（分好多塊），抓下來合併。"""
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.merge import Merger
import base64, glob, os, string, subprocess, io
TXT = ''.join(open(f, encoding='utf8').read() for f in ['index.html', 'game-core.js'])
NEED = sorted({c for c in TXT if ord(c) > 127} | set(string.printable) | set('０１２３４５６７８９，。！？、：；「」『』（）～…—・'))
def sub(t, chars):
    o = subset.Options(); o.layout_features = ['*']; o.flavor = None; s = subset.Subsetter(o); s.populate(text=''.join(chars)); s.subset(t); return t
def out(name, F):
    F.flavor = 'woff2'; b = io.BytesIO(); F.save(b); d = base64.b64encode(b.getvalue()).decode()
    open(f'font_{name}.js', 'w').write(f"(window.PF_FONTS=window.PF_FONTS||{{}}).{name}='data:font/woff2;base64,{d}';   // tools/build_fonts.py 產生（SIL OFL 1.1）\n")
    print(name, len(b.getvalue()))
out('cubic', sub(TTFont('art/fonts/Cubic_11.woff2'), NEED))
HD = '/tmp/hun/package/files'
if not os.path.isdir(HD):
    os.makedirs('/tmp/hun', exist_ok=True); subprocess.run('cd /tmp/hun && npm pack @fontsource/huninn >/dev/null && tar xzf fontsource-huninn-*.tgz', shell=True, check=True)
parts = []
for f in sorted(glob.glob(f'{HD}/huninn-*-400-normal.woff2')):
    t = TTFont(f); have = {chr(c) for c in t.getBestCmap()} & set(NEED)
    if have: p = f'/tmp/hun/s_{os.path.basename(f)}.ttf'; sub(t, have).save(p); parts.append(p)
out('huninn', Merger().merge(parts))
