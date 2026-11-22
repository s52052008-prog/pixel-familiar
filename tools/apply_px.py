"""把裝飾調整器「修圖」匯出的 px 套進 sprites/*.png
用法：python3 tools/apply_px.py 設定.json   （json 裡的 "px": {"flame1o": {"格子編號": "#rrggbb" 或 "x"(擦掉)}}）"""
import json,sys,re
from PIL import Image
o=json.load(open(sys.argv[1]));n=0
for k,E in (o.get('px') or {}).items():
    m=re.fullmatch(r'([a-z]+)(\d)([oc])',k);el,st,e=m.groups()
    f=f'sprites/{el}_{st}_{"open" if e=="o" else "closed"}.png';im=Image.open(f).convert('RGBA')
    for i,v in E.items():
        i=int(i);x,y=i%48,i//48
        im.putpixel((x,y),(0,0,0,0) if v=='x' else (int(v[1:3],16),int(v[3:5],16),int(v[5:7],16),255));n+=1
    im.save(f);print(f,len(E))
print('共',n,'格')
