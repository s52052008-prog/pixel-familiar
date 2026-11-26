"""V1.93 GPT 畫的招式特效 → sprites/fx/*.png（去白底、切格子、縮成遊戲像素大小）"""
from PIL import Image
from collections import deque
import os,sys
OUT='sprites/vfx';os.makedirs(OUT,exist_ok=True)
def unwhite(im):
    im=im.convert('RGBA');W,H=im.size;px=im.load();seen=bytearray(W*H);q=deque()
    bg=lambda p:min(p[:3])>=226 and max(p[:3])-min(p[:3])<24
    for x in range(W):
        for y in (0,H-1):q.append((x,y))
    for y in range(H):
        for x in (0,W-1):q.append((x,y))
    while q:
        x,y=q.popleft()
        if x<0 or y<0 or x>=W or y>=H or seen[y*W+x]:continue
        seen[y*W+x]=1
        if not bg(px[x,y]):continue
        px[x,y]=(0,0,0,0);q.extend(((x+1,y),(x-1,y),(x,y+1),(x,y-1)))
    return im
def shrink(cell,k):
    bb=cell.getbbox()
    if not bb:return None
    c=cell.crop(bb);w,h=max(1,round(c.width/k)),max(1,round(c.height/k))
    # 先預乘 alpha 再縮，邊緣才不會帶白邊
    r=c.resize((w,h),Image.BOX);px=r.load()
    for y in range(h):
        for x in range(w):
            p=px[x,y];px[x,y]=(p[0],p[1],p[2],255 if p[3]>=110 else 0)
    return r
def cut(src,rows,cols,names,k):
    im=unwhite(Image.open(src));W,H=im.size
    for r in range(rows):
        for c in range(cols):
            n=names[r][c]
            if not n:continue
            cell=im.crop((c*W//cols,r*H//rows,(c+1)*W//cols,(r+1)*H//rows));s=shrink(cell,k)
            if s:s.save(f'{OUT}/{n}.png');print(n,s.size)
cut('art/fx_src/objs.png',4,4,[['fireA','fireB','waterball','drops'],['leaf','feather','rock','pebbles'],['star','slash','heart','curse'],['skull','snow','bone','meteor']],15)
cut('art/fx_src/hits.png',8,4,[[f'hit_{e}{i}' for i in range(4)] for e in ['fire','water','leaf','earth','bird','elec','metal','none']],6.5)
