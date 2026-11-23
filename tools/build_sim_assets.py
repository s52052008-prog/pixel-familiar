"""調整器的素材包：把 sprites/ 各類圖打包成 assets/<類>.json（跟調整器一起發佈）
用法：python3 tools/build_sim_assets.py 輸出資料夾"""
import glob,os,base64,json,sys
out=sys.argv[1];os.makedirs(out,exist_ok=True)
def dump(name,files):
    d={f[len('sprites/'):-4]:base64.b64encode(open(f,'rb').read()).decode() for f in sorted(files)}
    open(f'{out}/{name}.json','w').write(json.dumps(d,separators=(',',':')));print(name,len(d))
for c in ['fusion','items','sk','arena','fx','plots','decor','acc','train','ui','ui2']:dump(c,glob.glob(f'sprites/{c}/*.png'))
dump('misc',[f for f in glob.glob('sprites/*.png') if os.path.basename(f).startswith(('egg','wild'))])
