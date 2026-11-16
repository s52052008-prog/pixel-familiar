import asyncio, json, sys, base64, os, subprocess, time
from playwright.async_api import async_playwright
ROOT='/home/claude/pixel-familiar'; OUT='/home/claude/out'; URL='http://localhost:8765/'
errors=[]; results=[]
def ok(name,cond,detail=''):
    results.append((name,bool(cond),detail)); print(('PASS ' if cond else 'FAIL ')+name+(' — '+str(detail) if detail else ''))
async def tap_logical(page,x,y):
    b=await page.locator('#scene').bounding_box()
    await page.mouse.click(b['x']+x/128*b['width'], b['y']+y/112*b['height'])
async def st(page): return await page.evaluate('JSON.parse(JSON.stringify(PF.state))')
async def main():
    srv=subprocess.Popen([sys.executable,'-m','http.server','8765','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
    async with async_playwright() as p:
        br=await p.chromium.launch()
        dev=p.devices['iPhone 13']
        ctx=await br.new_context(**dev); page=await ctx.new_page()
        page.on('console',lambda m: errors.append(m.text) if m.type=='error' else None)
        page.on('pageerror',lambda e: errors.append(str(e)))
        await page.goto(URL); await page.wait_for_timeout(800)
        await page.screenshot(path=f'{OUT}/01_egg.png',full_page=True)
        s=await st(page); ok('fresh state egg',not s['hatched'] and s['coins']==20)
        for i in range(4):
            await tap_logical(page,64,80); await page.wait_for_timeout(500)
        await page.screenshot(path=f'{OUT}/02_cracked.png')
        ok('egg taps counted',(await st(page))['eggTaps']==4)
        await tap_logical(page,64,80); await page.wait_for_timeout(2300)
        ok('hatched',(await st(page))['hatched'])
        ok('rename modal opened after hatch',await page.is_visible('#nameIn'))
        await page.screenshot(path=f'{OUT}/03_rename.png')
        await page.fill('#nameIn','阿露露露露露露露露露露露超長'); await page.click('#mbtns .pri'); await page.wait_for_timeout(300)
        ok('name limited to 10 chars',len((await st(page))['name'])==10,(await st(page))['name'])
        await page.click('#bRename'); await page.fill('#nameIn','小露'); await page.click('#mbtns .pri')
        await page.wait_for_timeout(1500)
        s0=await st(page)
        await page.click('[data-act=feed]'); await page.wait_for_timeout(250); await page.screenshot(path=f'{OUT}/04_eat.png'); await page.wait_for_timeout(1300)
        s1=await st(page); ok('feed costs 5 coins & +hunger',s1['coins']==s0['coins']-5 and s1['hunger']>s0['hunger'],(s0['coins'],s1['coins'],round(s0['hunger']),round(s1['hunger'])))
        await page.click('[data-act=play]'); await page.wait_for_timeout(350); await page.screenshot(path=f'{OUT}/05_play.png'); await page.wait_for_timeout(1200)
        s2=await st(page); ok('play +4 coins, -energy',s2['coins']==s1['coins']+4 and s2['energy']<s1['energy'])
        await page.click('[data-act=wash]'); await page.wait_for_timeout(300); await page.screenshot(path=f'{OUT}/06_wash.png'); await page.wait_for_timeout(1200)
        s3=await st(page); ok('wash +clean',s3['clean']>s2['clean'])
        # spam test: wash to full, xp should stop
        for i in range(6):
            await page.click('[data-act=wash]'); await page.wait_for_timeout(1300)
        a=await st(page)
        for i in range(5):
            await page.click('[data-act=wash]'); await page.wait_for_timeout(700)
        b2=await st(page); ok('no XP farming when clean full',b2['xp']==a['xp'] and b2['level']==a['level'],(a['xp'],b2['xp']))
        # rapid double tap is ignored while busy
        x0=(await st(page))['care']['play']
        await page.click('[data-act=play]'); await page.click('[data-act=play]'); await page.click('[data-act=play]'); await page.wait_for_timeout(1500)
        ok('rapid taps debounced',(await st(page))['care']['play']==x0+1)
        # sleep
        await page.evaluate("PF.debug.set({energy:40})")
        await page.click('[data-act=sleep]'); await page.wait_for_timeout(1500)
        ok('sleeping',(await st(page))['sleeping']); await page.screenshot(path=f'{OUT}/07_sleep.png')
        ok('sleep button shows 叫醒',(await page.inner_text('#sleepLabel'))=='叫醒')
        await page.evaluate("PF.debug.skip(10)"); s4=await st(page)
        ok('offline sleep restores energy & auto-wakes',(not s4['sleeping']) and s4['energy']>90,(s4['sleeping'],round(s4['energy'])))
        # pet
        await page.wait_for_timeout(1500); m0=(await st(page))['mood']
        await page.evaluate("PF.debug.set({mood:50})")
        await tap_logical(page,64,80); await page.wait_for_timeout(250); await page.screenshot(path=f'{OUT}/08_pet.png'); await page.wait_for_timeout(1000)
        ok('pet +mood',(await st(page))['mood']>=52.9)
        # decay 6 hours
        await page.evaluate("PF.debug.set({hunger:80,mood:80,clean:80,energy:80})"); await page.evaluate("PF.debug.skip(360)")
        s5=await st(page); ok('6h decay applied',35<s5['hunger']<45,round(s5['hunger']))
        await page.evaluate("PF.debug.skip(100000)"); s6=await st(page)
        ok('decay capped at 24h, no negatives',min(s6['hunger'],s6['mood'],s6['clean'],s6['energy'])>=0)
        await page.wait_for_timeout(600); await page.screenshot(path=f'{OUT}/09_sad.png')
        # level-up message visible
        await page.evaluate("PF.debug.set({hunger:50,mood:60,clean:60,energy:70})")
        await page.evaluate("PF.debug.set({xp:PF.state.level*50-5})")
        await page.click('[data-act=feed]'); await page.wait_for_timeout(1900)
        bub=await page.inner_text('#bubble'); ok('level-up message shown (queued, not overwritten)','升級' in bub,bub)
        # evolution — make play dominant
        await page.evaluate("PF.debug.set({care:{feed:3,play:30,wash:2,pet:4,sleep:1}})")
        await page.wait_for_timeout(1200)
        await page.evaluate("PF.debug.xp(2000)"); await page.wait_for_timeout(1300+800)
        await page.screenshot(path=f'{OUT}/10_evolving.png'); await page.wait_for_timeout(3000)
        s7=await st(page); ok('evolved to ember (play route)',s7['route']=='ember',s7['route'])
        await page.screenshot(path=f'{OUT}/11_evolved.png',full_page=True)
        # codex
        await page.click('#bCodex'); await page.wait_for_timeout(300); await page.screenshot(path=f'{OUT}/12_codex.png'); await page.click('#mbtns .btn')
        # random species
        s7=await st(page); ok('new egg has random seed',isinstance(s7.get('seed'),int))
        ok('species name generated','獸' in await page.inner_text('#stageText'),await page.inner_text('#stageText'))
        ok('dex records current pet',len(s7['dex'])==1 and s7['dex'][0]['route']=='ember')
        dist=await page.evaluate("(()=>{const c=[0,0,0,0];const names=new Set();for(let i=0;i<2000;i++){const G=PF.makeGenome(i*2654435761>>>0);c[G.rarity]++;names.add(PF.genomeForm(G,null).name)}return{c,n:names.size}})()")
        ok('rarity distribution ~75/20/5',1350<dist['c'][1]<1650 and 300<dist['c'][2]<500 and 50<dist['c'][3]<150,dist)
        ok('many distinct species names',dist['n']>=60,dist['n'])
        same=await page.evaluate("(()=>{const G=PF.makeGenome(12345);return PF.genomeForm(G,null).pal.b===PF.genomeForm(G,'mist').pal.b})()")
        ok('evolution keeps body color',same)
        # menu sprite
        await page.click('#bMenu'); await page.click('#mSprite'); await page.wait_for_timeout(300); await page.screenshot(path=f'{OUT}/13_sprites.png'); await page.click('#mbtns .btn')
        # export / import
        code=await page.evaluate("PF.exportCode()"); ok('export code format',code.startswith('PF1.'))
        await page.click('#bMenu'); await page.click('#mReset'); await page.click('#mbtns .pri'); await page.wait_for_timeout(300)
        R=await st(page); ok('new egg after reset',not R['hatched'] and R['seed']!=s7['seed'])
        ok('dex kept after new egg',len(R['dex'])==1)
        for i in range(5):
            await tap_logical(page,64,80); await page.wait_for_timeout(500)
        await page.wait_for_timeout(1800); await page.click('#mbtns .pri'); await page.wait_for_timeout(300)
        R2=await st(page); ok('second species hatched, dex=2',R2['hatched'] and len(R2['dex'])==2)
        await page.screenshot(path=f'{OUT}/16_second_species.png')
        await page.click('#bCodex'); await page.wait_for_timeout(300); await page.screenshot(path=f'{OUT}/17_dex.png'); await page.click('#mbtns .btn')
        await page.click('#bSave'); await page.fill('#impText',code[:-3]+'zzz'); await page.click('#bImp'); await page.wait_for_timeout(200)
        ok('tampered code rejected','失敗' in await page.inner_text('#impErr'))
        await page.fill('#impText',code); await page.click('#bImp'); await page.wait_for_timeout(200); await page.click('#mbtns .pri'); await page.wait_for_timeout(400)
        s8=await st(page); ok('import restores',s8['route']=='ember' and s8['name']=='小露' and len(s8['dex'])==1,(s8['route'],s8['name']))
        # reload persistence
        await page.reload(); await page.wait_for_timeout(800); s9=await st(page)
        ok('persists after reload',s9['route']=='ember' and s9['level']==s8['level'])
        # SW offline
        await page.wait_for_timeout(1500)
        swok=await page.evaluate("navigator.serviceWorker.getRegistration().then(r=>!!(r&&r.active))"); ok('service worker active',swok)
        await page.reload(); await page.wait_for_timeout(800)
        await ctx.set_offline(True)
        try:
            await page.reload(); await page.wait_for_timeout(1000); off=await page.evaluate("!!window.PF&&PF.VERSION")
        except Exception as e: off=False
        ok('offline launch works',off)
        await ctx.set_offline(False)
        await ctx.close()
        # legacy migration (inject before page scripts run, once)
        ctx2=await br.new_context(**dev); pg=await ctx2.new_page(); pg.on('pageerror',lambda e: errors.append(str(e)))
        legacy={"hatched":True,"name":"舊小露","level":3,"xp":40,"coins":77,"hunger":60,"mood":70,"clean":50,"energy":40,"created":int(time.time()*1000)-86400000*2,"updated":int(time.time()*1000)-60000*30}
        await pg.add_init_script("if(!sessionStorage.getItem('t1')){sessionStorage.setItem('t1','1');localStorage.setItem('pixel-familiar-v1',JSON.stringify(%s))}"%json.dumps(legacy))
        await pg.goto(URL); await pg.wait_for_timeout(800); L=await st(pg)
        ok('legacy V1.2 save migrated',L['name']=='舊小露' and L['level']==3 and L['coins']==77 and L['hunger']<60,(L['name'],L['level'],L['coins'],round(L['hunger'])))
        ok('legacy toast shown','舊存檔' in await pg.inner_text('#toast'))
        ok('legacy key kept untouched',await pg.evaluate("!!localStorage.getItem('pixel-familiar-v1')"))
        await pg.screenshot(path=f'{OUT}/14_legacy.png')
        await ctx2.close()
        # corrupt main -> backup
        ctx4=await br.new_context(**dev); p4=await ctx4.new_page()
        good=json.dumps(json.dumps({"hatched":True,"name":"備份君","level":2,"xp":5,"coins":30}))
        await p4.add_init_script("if(!sessionStorage.getItem('t2')){sessionStorage.setItem('t2','1');localStorage.setItem('pixel-familiar-save-backup',%s);localStorage.setItem('pixel-familiar-save','{broken')}"%good)
        await p4.goto(URL); await p4.wait_for_timeout(800); C=await st(p4)
        ok('corrupt save restored from backup',C['name']=='備份君',C['name'])
        ok('corrupt toast shown','備份' in await p4.inner_text('#toast'))
        await ctx4.close()
        ctx2=await br.new_context(**dev); pg=await ctx2.new_page()
        await pg.goto(URL)
        # storage failure doesn't crash
        await pg.add_init_script("Storage.prototype.setItem=function(){throw new Error('QuotaExceeded')}")
        await pg.reload(); await pg.wait_for_timeout(800)
        ok('storage failure: game still runs + warning',await pg.is_visible('#saveWarn'))
        await ctx2.close()
        # small screen
        ctx3=await br.new_context(**p.devices['iPhone SE']); p3=await ctx3.new_page(); await p3.goto(URL); await p3.wait_for_timeout(700)
        await p3.screenshot(path=f'{OUT}/15_iphoneSE.png',full_page=True)
        ov=await p3.evaluate("document.documentElement.scrollWidth<=innerWidth"); ok('no horizontal overflow on iPhone SE',ov)
        # export art: sprite sheets + icons
        for k in ['egg','baby','ember','mist','sylvan']:
            d=await p3.evaluate(f"PF.sheet('{k}').cv.toDataURL()")
            open(f'{ROOT}/art/sheet-{k}.png','wb').write(base64.b64decode(d.split(',')[1]))
        for size in [180,192,512]:
            d=await p3.evaluate("""(n)=>{const c=document.createElement('canvas');c.width=c.height=n;const x=c.getContext('2d');x.imageSmoothingEnabled=false;
              x.fillStyle='#17233b';x.fillRect(0,0,n,n);const g=x.createLinearGradient(0,0,0,n);g.addColorStop(0,'#2b4f7a');g.addColorStop(1,'#17233b');x.fillStyle=g;x.fillRect(0,0,n,n);
              x.fillStyle='#3f8a5a';x.fillRect(0,Math.round(n*.78),n,n);const S=PF.sheet('baby');const sc=Math.floor(n*0.72/48);const w=48*sc;
              x.drawImage(S.cv,S.idx.happy1*48,0,48,48,Math.round((n-w)/2),Math.round(n*.82-w*0.93),w,w);return c.toDataURL()}""",size)
            open(f'{ROOT}/icon-{size}.png','wb').write(base64.b64decode(d.split(',')[1]))
        d=await p3.evaluate('''(()=>{const N=24,c=document.createElement('canvas');c.width=48*8;c.height=48*6;const x=c.getContext('2d');x.fillStyle='#7fb07a';x.fillRect(0,0,c.width,c.height);
          for(let i=0;i<N;i++){const sd=(i+1)*2246822519>>>0;const rt=['ember','mist','sylvan'][i%3];const a=PF.sheet(PF.petKey(sd,null)),b=PF.sheet(PF.petKey(sd,rt)),e=PF.sheet('egg:'+sd);
           const col=(i%8)*48,row=Math.floor(i/8)*96;x.drawImage(a.cv,a.idx.idle0*48,0,48,48,col,row,48,48);x.drawImage(b.cv,b.idx.idle0*48,0,48,48,col,row+48,48,48)}return c.toDataURL()})()''')
        open(f'{ROOT}/art/random-species-gallery.png','wb').write(base64.b64decode(d.split(',')[1]))
        await ctx3.close(); await br.close()
    srv.terminate()
    print('\nconsole/page errors:',errors if errors else 'none')
    print(f"\n{sum(r[1] for r in results)}/{len(results)} passed")
os.makedirs(f'{ROOT}/art',exist_ok=True)
asyncio.run(main())
