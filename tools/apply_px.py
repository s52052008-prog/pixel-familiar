"""把裝飾調整器「修圖」的 px 套進 sprites/*.png
用法：python3 tools/apply_px.py 設定.json
  寵物："flame1o"/"flame1c" → sprites/flame_1_open/closed.png
  其他素材："s:items/apple" → sprites/items/apple.png
  值："#rrggbb" 或 "x"（擦掉）；格子編號 = y*圖寬 + x"""
import json,sys,re
from PIL import Image
o=json.load(open(sys.argv[1]));n=0
for k,E in (o.get('px') or {}).items():
    w=re.fullmatch(r's:wild/([怪王])(\d+)-[^-]+(-閉眼)?',k)   # V1.91.2 怪獸：對回 wild_n／wild_b 大圖的那一格
    if w:
        f=f'sprites/wild_{"b" if w[1]=="王" else "n"}.png';im=Image.open(f).convert('RGBA');ox,oy=int(w[2])*48,48 if w[3] else 0
        for i,v in E.items():
            i=int(i);im.putpixel((ox+i%48,oy+i//48),(0,0,0,0) if v=='x' else (int(v[1:3],16),int(v[3:5],16),int(v[5:7],16),255));n+=1
        im.save(f);print(f,k,len(E));continue
    m=re.fullmatch(r'([a-z]+)(\d)([oc])',k)
    f=f'sprites/{m[1]}_{m[2]}_{"open" if m[3]=="o" else "closed"}.png' if m else f'sprites/{k[2:]}.png'
    im=Image.open(f).convert('RGBA');W=im.width
    for i,v in E.items():
        i=int(i);im.putpixel((i%W,i//W),(0,0,0,0) if v=='x' else (int(v[1:3],16),int(v[3:5],16),int(v[5:7],16),255));n+=1
    im.save(f);print(f,len(E))
print('共',n,'格')
