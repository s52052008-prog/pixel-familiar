"""調整器的素材包：把 sprites/ 各類圖打包成 assets/<類>.json（跟調整器一起發佈）
用法：python3 tools/build_sim_assets.py 輸出資料夾"""
import glob,os,base64,json,sys
out=sys.argv[1];os.makedirs(out,exist_ok=True)
def dump(name,files):
    d={f[len('sprites/'):-4]:base64.b64encode(open(f,'rb').read()).decode() for f in sorted(files)}
    open(f'{out}/{name}.json','w').write(json.dumps(d,separators=(',',':')));print(name,len(d))
for c in ['fusion','items','sk','arena','fx','plots','decor','acc','train','ui','ui2']:dump(c,glob.glob(f'sprites/{c}/*.png'))
dump('misc',[f for f in glob.glob('sprites/*.png') if os.path.basename(f).startswith('egg')])

# V1.91.2 怪獸：把 wild_n／wild_b 大圖切成一隻一張（睜眼、閉眼），名字看得懂；套回去由 tools/apply_px.py 對回大圖位置
import io
from PIL import Image
W=json.load(open('tools/wild_mon.json'));d={}
for k in 'nb':
    A=Image.open(f'sprites/wild_{k}.png').convert('RGBA')
    for i,(nm,el,boss) in enumerate(W):
        if bool(boss)!=(k=='b'):continue
        for row,suf in ((0,''),(1,'-閉眼')):
            c=A.crop((i*48,row*48,i*48+48,row*48+48));b=io.BytesIO();c.save(b,'PNG')
            d[f'wild/{"王" if boss else "怪"}{i:02d}-{nm}{suf}']=base64.b64encode(b.getvalue()).decode()
open(f'{out}/wild.json','w').write(json.dumps(d,ensure_ascii=False,separators=(',',':')));print('wild',len(d))
