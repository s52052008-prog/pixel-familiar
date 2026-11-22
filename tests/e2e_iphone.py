# 幻獸日記 端對端測試（Playwright + Chromium 模擬 iPhone 13 / SE）
# 用法：PLAYWRIGHT_BROWSERS_PATH=... python3 tests/e2e_iphone.py
import asyncio, json, sys, os, subprocess, time, base64
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.environ.get('OUT', '/tmp/pf-shots'); os.makedirs(OUT, exist_ok=True)
PORT = 8790; URL = f'http://localhost:{PORT}/'
errors, results = [], []
def ok(name, cond, detail=''):
    results.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name + (f' — {detail}' if detail != '' else ''))
async def st(p): return await p.evaluate('JSON.parse(JSON.stringify(PF.state))')
async def tap(p, x=64, y=80):
    await p.locator('#scene').scroll_into_view_if_needed(); b = await p.locator('#scene').bounding_box()
    await p.mouse.click(b['x'] + x / 128 * b['width'], b['y'] + y / 112 * b['height'])
async def newpage(br, dev, init=None):
    ctx = await br.new_context(**dev); p = await ctx.new_page()
    await p.add_init_script('window.PF_NO_WANDER=1;window.PF_NO_SOCIAL=1;window.PLAY_DIRECT=1;window.PF_NO_RPS=1;window.PF_NO_TRAITS=1;window.PF_NO_WEATHER=1;window.PF_NO_CRAVE=1;window.PF_NO_LVPOP=1;window.PF_NO_SKILLS=1;window.PF_SKIP_INTRO=1;window.PF_NO_GUIDE=1;window.PF_XP1=1')   # 測試時關掉待命亂走與猜拳（猜拳另外測）
    p.on('pageerror', lambda e: errors.append(str(e)))
    p.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'favicon' not in m.text else None)
    if init: await p.add_init_script(init)
    await p.goto(URL); await p.wait_for_timeout(700); return ctx, p
async def hatch(p, name='小露'):
    for i in range(5): await tap(p); await p.wait_for_timeout(450)
    await p.wait_for_selector('#nameIn', timeout=5000); await p.fill('#nameIn', name); await p.click('#mbtns .pri'); await p.wait_for_timeout(1200)
async def scene_xy(p, x, y):
    await p.wait_for_timeout(400); await p.locator('#scene').scroll_into_view_if_needed(); b = await p.locator('#scene').bounding_box(); return b['x'] + x / 128 * b['width'], b['y'] + y / 112 * b['height']
async def do_feed(p, x=96, y=70):
    await p.click('[data-act=feed]'); await p.mouse.click(*await scene_xy(p, x, y))
    for _ in range(80):
        if await p.evaluate("!PF.mode"): break
        await p.wait_for_timeout(100)
async def do_wash(p):
    await p.click('[data-act=wash]'); await p.wait_for_timeout(400); b = await p.locator('#scene').bounding_box(); cx = await p.evaluate('PF.petX') + 24
    X = lambda v: b['x'] + v / 128 * b['width']; Y = lambda v: b['y'] + v / 112 * b['height']
    await p.mouse.move(X(cx), Y(82)); await p.mouse.down()
    for i in range(60):
        if await p.evaluate("!PF.mode"): break
        await p.mouse.move(X(cx - 12 + (i % 2) * 24), Y(80 + (i % 3) * 3), steps=3); await p.wait_for_timeout(60)
    await p.mouse.up(); await p.wait_for_timeout(300)
async def do_play(p, timed=True, goals=2):
    """頂球：點一下開始；球快到頭上時點一下（V1.46 不用蓄力，可以一直點）。進 goals 球之後就不按，讓 3 條命用完結束"""
    await p.click('[data-act=play]'); await p.wait_for_timeout(400); b = await p.locator('#scene').bounding_box()
    tapxy = (b['x'] + 64 / 128 * b['width'], b['y'] + 40 / 112 * b['height'])
    await p.mouse.click(*tapxy)
    for _ in range(1500):
        if await p.evaluate("!PF.mode"): break
        info = await p.evaluate("(()=>{const b=PF.ball.b;return b&&{y:b.y,vy:b.vy,g:b.g,x:b.x,hit:b.hit,tapped:b.tapped,score:PF.ball.score,head:PF.headY()}})()")
        if info and timed and not info['hit'] and not info['tapped'] and info['score'] < goals and info['vy'] > 0:
            g, d = info['g'], info['head'] - info['y']; tt = (-info['vy'] + (info['vy'] ** 2 + 2 * g * max(d, 0)) ** .5) / g   # 球還要多久到頭上
            if tt < 0.14:
                await p.mouse.click(*tapxy)
        await p.wait_for_timeout(12)
async def closeall(p):
    if await p.is_visible('#modal'):
        if await p.is_visible('#mX'): await p.click('#mX')
        else: await p.click('#mbtns .btn >> nth=0')
async def move(p, mv):   # V1.40：技能、背包要先點開第二層
    if mv in ('tackle', 'special', 'charge', 'ult'): await p.click('#mvSkill'); await p.wait_for_timeout(80)
    elif mv in ('potion', 'potion2'): await p.click('#mvBag'); await p.wait_for_timeout(80)
    await p.click(f'#moves [data-mv={mv}]')

async def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '-d', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
    async with async_playwright() as pw:
        br = await pw.chromium.launch(); I13 = pw.devices['iPhone 13']
        # ---------- 1. 孵化、命名、刷新保留 ----------
        ctx, p = await newpage(br, I13)
        await p.screenshot(path=f'{OUT}/01_egg.png')
        s = await st(p); ok('新存檔：蛋、金幣 50（第一天不送金幣）、食物 3+1', s['stage'] == 'egg' and s['coins'] == 50 and s['inv']['food'] == 4, (s['coins'], s['inv']))
        await p.evaluate("quizIntro(true)"); await p.wait_for_timeout(300); await p.mouse.click(5, 5); await p.wait_for_timeout(200)
        ok('V1.66 第一次測驗：點旁邊關不掉', await p.is_visible('#modal'))
        await p.click('#mbtns .btn:not(.pri)'); await p.wait_for_timeout(400); t1 = await p.inner_text('#sheet h2')
        await p.click('#mbtns .btn:not(.pri)'); await p.wait_for_timeout(500)
        ok('V1.66 跳過會再問一次、第二次跳過才給隨機蛋', '真的不做' in t1 and not await p.is_visible('#modal'), t1)
        await hatch(p, '露米')
        s = await st(p); ok('孵化並命名、孵化時就有屬性（嬰兒期）', s['hatched'] and s['stage'] == 'baby' and s['name'] == '露米' and s['route'] in ['flame','tide','forest','earth','bird','elec','metal'], s['route'])
        stx = await p.evaluate("document.getElementById('stageText').textContent"); ok('畫面顯示屬性', any(k in stx for k in ['火系','水系','草系','岩系','飛行系','雷系','鋼系']), stx)
        await p.reload(); await p.wait_for_timeout(700); s = await st(p); ok('刷新後保留', s['hatched'] and s['name'] == '露米')
        ok('每日禮物刷新後不重複', s['coins'] == 50, s['coins'])
        # ---------- 2. 照顧行為 ----------
        await p.evaluate("PF.debug.set({hunger:50,mood:50,clean:40,energy:60})")
        await p.click('[data-act=feed]'); await p.wait_for_timeout(200); ok('按餵食進入放蘋果模式', await p.evaluate("PF.mode") == 'feed')
        await p.mouse.click(*await scene_xy(p, 96, 60)); await p.wait_for_timeout(300); ok('點畫面放下蘋果', await p.evaluate("!!PF.apple"))
        await p.screenshot(path=f'{OUT}/02_apple.png')
        for _ in range(80):
            if await p.evaluate("!PF.mode"): break
            await p.wait_for_timeout(100)
        s = await st(p); ok('走過去吃完：用掉蘋果、飽食 +10、XP +3、留下果核', s['inv']['food'] == 3 and round(s['hunger']) == 60 and s['xp'] == 3 and len(s['cores']) == 1, (s['inv'], round(s['hunger']), s['xp'], s['cores']))
        await p.wait_for_timeout(5000); await p.screenshot(path=f'{OUT}/02b_core.png')
        await p.mouse.click(*await scene_xy(p, s['cores'][0]['x'], 98)); await p.wait_for_timeout(300)
        ok('點果核清掉', len((await st(p))['cores']) == 0)
        await do_play(p); s = await st(p)
        ok('頂球一回合：心情 +15、體力 -10、記錄分數', round(s['mood']) == 65 and round(s['energy']) == 55 and s['ball']['goals'] >= 0, (round(s['mood']), round(s['energy']), s['ball']))
        await p.wait_for_timeout(2800); ok('頂球結算卡：出現在中間、顯示進球與經驗', await p.is_visible('#gResult') and '頂球結算' in await p.inner_text('#gResult') and '經驗' in await p.inner_text('#gResult'), (await p.inner_text('#gResult'))[:80]); await p.click('#gDone')
        await p.click('[data-act=wash]'); await p.wait_for_timeout(300); await p.click('[data-act=wash]'); await p.wait_for_timeout(300)
        ok('再按一次可以取消', await p.evaluate("PF.mode") is None)
        c0 = (await st(p))['clean']; await do_wash(p); s = await st(p); ok('海綿刷 3 秒：清潔 +35', round(s['clean'] - c0) == 35, (c0, round(s['clean'])))
        # ---------- 3. 冷卻不能用重新整理繞過 ----------
        await p.evaluate("PF.debug.set({clean:30})"); await p.reload(); await p.wait_for_timeout(700)
        await p.click('[data-act=wash]'); await p.wait_for_timeout(300)
        ok('V1.55 洗澡沒有冷卻：剛洗完、重新整理後髒了就能再洗', await p.evaluate("PF.mode") == 'wash', await p.evaluate("PF.mode"))
        await p.click('[data-act=wash]'); await p.wait_for_timeout(300)
        await p.wait_for_timeout(800)
        b0 = (await st(p))['bond']; await tap(p); await p.wait_for_timeout(1200); b1 = (await st(p))['bond']
        await p.reload(); await p.wait_for_timeout(700); await tap(p); await p.wait_for_timeout(1200); b2 = (await st(p))['bond']
        ok('撫摸 30 分鐘一次收益：重新整理後不能再拿', b1 == b0 + 2 and b2 == b1, (b0, b1, b2))
        await p.screenshot(path=f'{OUT}/04_pet.png')
        # 果核發臭
        await p.evaluate("(()=>{PF.PC.addCore(PF.state,30,Date.now()-120*60000,'yard');PF.debug.set({mood:80})})()"); await p.wait_for_timeout(600)
        await p.screenshot(path=f'{OUT}/03b_rotten.png')
        await p.evaluate("PF.debug.skip(60)"); s = await st(p); ok('發臭果核：每小時心情多掉 4', abs(s['mood'] - 73) < .2, round(s['mood'], 1))
        await p.mouse.click(*await scene_xy(p, 30, 98)); await p.wait_for_timeout(300); ok('清掉臭果核', len((await st(p))['cores']) == 0)
        # ---------- 4. 離線上限 12 小時 ----------
        for hrs in (2, 24, 168):
            await p.evaluate("PF.debug.set({hunger:80,mood:80,clean:80,energy:20})"); await p.evaluate(f"PF.debug.skip({hrs*60})")
            await p.wait_for_timeout(300); s = await st(p); eff = min(hrs, 12)
            ok(f'離線 {hrs} 小時 → 只計算 {eff} 小時（飽食用真實時間，20 小時會餓到 0）', abs(s['hunger'] - (0 if hrs >= 20 else 80 - 4 * eff)) < .2 and (s['runaway'] is not None) == (hrs >= 32) and abs(s['energy'] - min(100, 20 + 8 * eff)) < .2, (round(s['hunger'], 1), round(s['energy'], 1)))
        await p.wait_for_timeout(500); ok('離家出走時畫面提示要走路找回來', '離家出走' in await p.inner_text('#growText'))
        await p.evaluate("PF.creditSteps((PF.state.steps.days[PF.PC.dayKey(Date.now())]||0)+10000)"); await p.wait_for_timeout(300); s = await st(p); ok('走 1 萬步把牠找回來', s['runaway'] is None and abs(s['hunger'] - 40) < .1, (s['runaway'], s['hunger']))
        await p.evaluate("PF.debug.set({hunger:80,mood:80,clean:80,energy:60})")
        # ---------- 5. 成長門檻（用 debug 把孵化時間往前移） ----------
        await p.evaluate("PF.debug.set({xp:449})"); await p.evaluate("PF.debug.age(12)"); await p.wait_for_timeout(4500)
        ok('12h、449 XP：嬰兒期 → 幼年期，但還不到少年期', (await st(p))['stage'] == 'juvenile')
        await p.evaluate("PF.debug.set({xp:450})"); await p.evaluate("PF.debug.age(0)"); await p.wait_for_timeout(1000)
        await p.screenshot(path=f'{OUT}/05_evolving.png'); await p.wait_for_timeout(3500)
        ok('12h + 450 XP：少年期', (await st(p))['stage'] == 'adolescent')
        await p.screenshot(path=f'{OUT}/06_teen.png')
        el0 = (await st(p))['route']; await p.evaluate("PF.debug.set({xp:1200,path:{flame:99,tide:0,forest:0}})"); await p.evaluate("PF.debug.age(36)"); await p.wait_for_timeout(5500)
        s = await st(p); ok('48h + 1200 XP → 成年期，屬性維持孵化時的那一系', s['stage'] == 'adult' and s['route'] == el0, (s['stage'], s['route'], el0))
        await p.screenshot(path=f'{OUT}/07_adult.png', full_page=True)
        await p.evaluate("PF.debug.set({xp:1200})"); await p.evaluate("PF.debug.age(200)"); await p.wait_for_timeout(1500)
        ok('沒有特殊事件不能高階', (await st(p))['stage'] == 'adult')
        evname = await p.evaluate("PF.PC.ascendInfo(PF.state).task.text"); g = await p.evaluate("document.getElementById('bondRow').textContent"); ok('成年期顯示專屬任務進度', evname in g, g)
        # 日記
        await p.click('#bCodex'); await p.click('#cxJournal'); await p.wait_for_timeout(300); await p.click('[data-jt=diary]'); await p.wait_for_timeout(300); txt = await p.inner_text('#sheet')
        ok('日記自動記錄孵化與進化', '孵化' in txt and '少年期' in txt and '成年期' in txt); await p.screenshot(path=f'{OUT}/08_journal.png'); await closeall(p)
        # ---------- 7. 零資源不卡死 ----------
        await p.evaluate("PF.debug.set({coins:0,inv:{food:0,seeds:0,candy:0,potion:1},hunger:20,sleeping:false})"); await p.wait_for_timeout(1200)
        await p.click('[data-act=feed]'); await p.wait_for_selector('#mbtns .pri', timeout=3000); await p.click('#mbtns .pri'); await p.wait_for_timeout(300)
        ok('零金幣零食物 → 採集得到食物', (await st(p))['inv']['food'] == 1)
        # ---------- 家園種植 ----------
        await p.evaluate("PF.debug.set({inv:{food:1,seeds:2,candy:0,potion:1}})")
        async def tap_plot(i):
            b = await p.locator('#fmcv').bounding_box(); q = await p.evaluate(f"(()=>{{const L=fmLayout()[{i}];return [L.x,L.y-8*L.sc]}})()")
            await p.mouse.click(b['x'] + q[0] / 128 * b['width'], b['y'] + q[1] / 112 * b['height']); await p.wait_for_timeout(300)
        await p.click('#bFarm'); await p.wait_for_timeout(400); fz = await p.is_visible('#farmZone'); await tap_plot(0)
        s = await st(p); ok('種田畫面：點空地種下種子', fz and s['inv']['seeds'] == 1 and s['plots'][0]['at'] > 0)
        await tap_plot(0); s2 = await st(p); ok('成長中不能收成', s2['plots'][0]['at'] == s['plots'][0]['at'] and '成熟' in await p.inner_text('#fmMsg')); await p.screenshot(path=f'{OUT}/09a_farm.png'); await p.click('#fmHome'); await p.wait_for_timeout(300)
        await p.evaluate("(()=>{const s=PF.state;s.plots[0].at=Date.now()-2*3600000-1000;PF.debug.set({})})()"); await p.wait_for_timeout(600)
        await p.screenshot(path=f'{OUT}/09b_ripe_in_scene.png')
        x0 = (await st(p))['xp']; await p.click('#bFarm'); await p.wait_for_timeout(400); await p.screenshot(path=f'{OUT}/09c_farm_ripe.png'); await tap_plot(0); await p.wait_for_timeout(500)
        card = (not await p.is_visible('#gResult')) and '收成' in (await p.evaluate("document.getElementById('fmMsg').textContent"))   # V1.86.6 收成不跳視窗，訊息顯示在種田畫面
        s = await st(p); ok('2 小時後收成：蔓越莓／藍莓／草莓 2～3 顆、XP +5、收成次數 1、不用點視窗', card and sum(s['inv'].get(k, 0) for k in ('cranberry', 'blueberry', 'strawberry')) in (2, 3) and s['xp'] == x0 + 5 and s['harvests'] == 1, (s['inv'], s['xp'] - x0)); await p.click('#fmHome'); await p.wait_for_timeout(300); await closeall(p)
        # ---------- 每日小目標 ----------
        await p.click('#bGoals'); await p.wait_for_timeout(300); s = await st(p)
        ok('每日 3 個小目標', len(s['goals']['list']) == 3)
        await p.evaluate("(()=>{const s=PF.state;s.goals.list[0].n=s.goals.list[0].need;PF.debug.set({})})()"); await closeall(p); await p.wait_for_timeout(1200)
        ok('完成目標時按鈕出現紅點', await p.is_visible('#goalDot'))
        await p.click('#bGoals'); await p.wait_for_timeout(300); await p.screenshot(path=f'{OUT}/09d_goals.png')
        c0 = await st(p); await p.click('[data-g="0"]'); await p.wait_for_timeout(300); s = await st(p)
        ok('領取目標獎勵、只能領一次', s['goals']['list'][0]['claimed'] and (s['coins'] > c0['coins'] or s['inv']['food'] > c0['inv']['food'] or s['inv']['seeds'] > c0['inv']['seeds']) and await p.is_disabled('[data-g="0"]'))
        await closeall(p)
        # ---------- 商店與小屋 ----------
        await p.evaluate("PF.debug.set({coins:400,mood:50,hunger:50,sleeping:false})")
        await p.click('#coinBtn'); await p.wait_for_timeout(300); await p.screenshot(path=f'{OUT}/09e_shop.png')
        for it in ['paper_mint', 'wall_clock', 'lamp_moon', 'plant_flower', 'bed_cloud', 'rug_star', 'toy_block']:
            await p.click(f'[data-si="{it}"]'); await p.click(f'[data-dz="{it}"]'); await p.wait_for_timeout(150)
        s = await st(p); ok('買 7 件家具、扣錢、自動擺上', len(s['decor']['owned']) == 9 and s['coins'] == 400 - 30 - 45 - 50 - 35 - 80 - 60 - 25 and s['decor']['placed']['bed'] == 'bed_cloud', s['coins'])
        await p.click('[data-si="toy_block"]'); await p.click('[data-dz="toy_block"]'); await p.wait_for_timeout(150); ok('收起家具', 'toy' not in (await st(p))['decor']['placed'])
        await p.click('[data-dz="toy_block"]'); await p.wait_for_timeout(150)
        await p.evaluate("PF.state.coins+=600"); lv0 = await p.evaluate("PF.PC.level(PF.state.xp)")
        await p.click('[data-tab="tools"]'); await p.wait_for_timeout(150); await p.click('[data-si="candy"]'); await p.click('[data-bi="candy"]'); await p.wait_for_timeout(150)
        ok('買星星糖', (await st(p))['inv']['candy'] == 1); await p.click('#eatCandy'); await p.wait_for_timeout(1500)
        s = await st(p); ok('吃星星糖：心情 +20、升 1 級', s['inv']['candy'] == 0 and round(s['mood']) >= 69 and await p.evaluate("PF.PC.level(PF.state.xp)") == lv0 + 1, round(s['mood']))
        ok('買完家具後切到室內', s['view'] == 'room'); await p.screenshot(path=f'{OUT}/09f_room.png')
        await p.click('#viewBtn'); await p.wait_for_timeout(400); ok('切換回戶外', (await st(p))['view'] == 'yard')
        ok('戶外沒有「進窩」按鈕', not await p.is_visible('#viewBtn'))
        await tap(p, 20, 56); await p.wait_for_timeout(200); ok('點一下小窩：提示點兩下', (await st(p))['view'] == 'yard')
        await tap(p, 20, 56); await p.wait_for_timeout(150); await tap(p, 20, 56); await p.wait_for_timeout(500); ok('點兩下小窩 → 進入小窩', (await st(p))['view'] == 'room')
        # ---------- 大便、馬桶、回窩睡覺 ----------
        await p.evaluate("PF.debug.set({view:'yard',sleeping:false})"); await p.wait_for_timeout(300)
        await p.evaluate("(()=>{PF.state.digest=[Date.now()-1000];PF.debug.set({})})()"); await p.wait_for_timeout(1500)
        s = await st(p); poo = [c for c in s['cores'] if c['k'] == 'poop']; ok('吃完一段時間後大便', len(poo) == 1, s['cores'])
        await p.screenshot(path=f'{OUT}/09g_poop.png')
        await p.mouse.click(*await scene_xy(p, poo[0]['x'], 98)); await p.wait_for_timeout(300); ok('點大便清掉', not [c for c in (await st(p))['cores'] if c['k'] == 'poop'])
        await p.evaluate("PF.debug.set({coins:300})"); await p.click('#coinBtn'); await p.wait_for_timeout(300); await p.click('[data-si="toilet_pot"]'); await p.click('[data-dz="toilet_pot"]'); await p.wait_for_timeout(200); await closeall(p)
        await p.evaluate("(()=>{PF.state.digest=[Date.now()-1000];PF.debug.set({})})()"); await p.wait_for_timeout(1500); s = await st(p)
        ok('有寵物馬桶：自己上廁所、地上沒有大便', s['toiletUses'] == 1 and not [c for c in s['cores'] if c['k'] == 'poop'])
        await p.evaluate("PF.debug.set({view:'yard',energy:40})"); await p.wait_for_timeout(200)
        await p.evaluate("PF.debug.set({view:'yard'})"); await p.wait_for_timeout(300); await p.click('[data-act=sleep]')
        for _ in range(40):
            if await p.evaluate("PF.state.sleeping"): break
            await p.wait_for_timeout(150)
        s = await st(p); ok('在外面按睡覺 → 自動回小窩、走到小圓床睡', s['sleeping'] and s['view'] == 'room' and abs(await p.evaluate("PF.petX") - 72) <= 2, (s['sleeping'], s['view']))
        await p.locator('#scene').screenshot(path=f'{OUT}/09h_sleep_bed.png')
        await p.click('#viewBtn'); await p.wait_for_timeout(200); ok('睡覺時不能出門', (await st(p))['view'] == 'room')
        await p.wait_for_timeout(700); await p.click('[data-act=sleep]'); await p.wait_for_timeout(1000); ok('叫醒', not (await st(p))['sleeping'])
        # ---------- 冒險 ----------
        await p.evaluate("PF.debug.set({energy:100,mood:90,hunger:90,coins:100})")
        await p.click('#bAdv'); await p.wait_for_timeout(300); await p.screenshot(path=f'{OUT}/09_adv.png')
        await p.click('[data-st="1"]'); await p.wait_for_timeout(500); ok('戰鬥開始、體力 -20', await p.is_visible('#battle') and round((await st(p))['energy']) == 80)
        await p.screenshot(path=f'{OUT}/10_battle.png')
        for i in range(40):
            if await p.is_visible('#bDone'): break
            mv = 'special' if not await p.is_disabled('#mvSp') else 'tackle'
            await move(p, mv); await p.wait_for_timeout(250)
            for _ in range(30):
                if not await p.evaluate("PF.B&&PF.B.busy"): break
                await p.wait_for_timeout(200)
        await p.screenshot(path=f'{OUT}/11_battle_end.png'); s = await st(p)
        ok('打完後藥水只會被用掉或撿到，不會變負數', s['inv']['potion'] >= 0)
        ok('戰鬥結算並記錄', s['adv']['wins'] + s['adv']['losses'] == 1 and s['daily']['adv'] == 1, await p.inner_text('#blog'))
        await p.click('#bDone')
        # 戰鬥擴充：場地、蓄力、藥水、羈絆之力
        await p.evaluate("PF.debug.set({energy:100,inv:{food:3,seeds:2,candy:0,potion:2}})"); await p.evaluate("(()=>{PF.state.adv.stage=Math.max(PF.state.adv.stage,15)})()")
        await p.evaluate("PF.startBattle(13)"); await p.wait_for_timeout(500)
        bl = await p.inner_text('#blog'); ok('岩石／水邊等場地依怪獸屬性', any(k in bl for k in ['岩地', '水邊', '森林', '草原', '峽谷', '天空', '雷雲', '礦坑']), bl)
        await move(p, 'charge'); await p.wait_for_timeout(2500); ok('蓄力', await p.evaluate("PF.B.me.charged") or '蓄力' in await p.inner_text('#blog'))
        for _ in range(40):
            if not await p.evaluate("PF.B.busy"): break
            await p.wait_for_timeout(150)
        if not await p.evaluate("PF.B.over"):
            await p.evaluate("(()=>{PF.B.me.hp=Math.max(1,Math.floor(PF.B.me.max/3));PF.bUI()})()"); hp0 = await p.evaluate("PF.B.me.hp")
            await move(p, 'potion'); await p.wait_for_timeout(300); ok('喝藥水回血、藥水 −1', (await st(p))['inv']['potion'] == 1)
            for _ in range(40):
                if not await p.evaluate("PF.B.busy"): break
                await p.wait_for_timeout(150)
        if not await p.evaluate("PF.B.over"):
            await p.evaluate("(()=>{PF.B.me.hp=1;PF.B.foe.hp=PF.B.foe.max;PF.bUI()})()"); await p.wait_for_timeout(200)
            ok('危險時出現羈絆之力按鈕', await p.is_visible('#mvBond')); await p.screenshot(path=f'{OUT}/11b_danger.png')
            c0 = (await st(p))['coins']; f0 = await p.evaluate("PF.B.foe.hp"); await p.click('#mvBond'); await p.wait_for_timeout(2300)
            for i in range(8): await p.mouse.click(200, 400); await p.wait_for_timeout(60)
            for _ in range(60):
                if await p.evaluate("!PF.B.busy||PF.B.over"): break
                await p.wait_for_timeout(150)
            s = await st(p); ok('羈絆之力花 10 金幣買加油棒、之後要休息 2 小時', (c0 - s['coins'] == 10 or await p.evaluate('PF.B.over')) and s['bondRestUntil'] > 0, (c0, s['coins']))   # 一擊打倒就會先拿到獎金
            ok('羈絆之力：連打造成大傷害、每場只能一次', await p.evaluate("PF.B.bondUsed") and f0 - await p.evaluate("PF.B.foe.hp") > 30)
        for _ in range(60):
            if await p.is_visible('#bDone'): break
            if not await p.evaluate("PF.B.busy"): await move(p, 'tackle')
            await p.wait_for_timeout(200)
        await p.click('#bDone')
        # V1.40：大絕招、超級藥水、場外特訓、雞湯
        await p.evaluate("PF.debug.set({energy:100,bondRestUntil:0,inv:{food:3,seeds:2,candy:0,potion:0,potion2:1}})"); await p.evaluate("PF.startBattle(1)"); await p.wait_for_timeout(500)
        ok('戰鬥主選單：技能／防禦／背包／逃跑', await p.is_visible('#mvSkill') and await p.is_visible('#mvBag') and not await p.is_visible('#mvTk'))
        await p.click('#mvSkill'); await p.wait_for_timeout(100); ok('技能有四種', all([await p.is_visible(x) for x in ('#mvTk', '#mvCh', '#mvSp', '#mvUlt')]))
        await p.click('#mpSkill .back'); await p.evaluate("(()=>{PF.B.me.hp=1;PF.B.foe.hp=PF.B.foe.max*9;PF.B.foe.max*=9;PF.bUI()})()")
        await move(p, 'potion2'); await p.wait_for_timeout(1300)
        for _ in range(40):
            if not await p.evaluate("PF.B.busy"): break
            await p.wait_for_timeout(150)
        ok('超級藥水：回復、−1', (await st(p))['inv']['potion2'] == 0 and await p.evaluate("PF.B.over||PF.B.me.hp>1"))
        if not await p.evaluate("PF.B.over"):
            f0 = await p.evaluate("PF.B.foe.hp"); await move(p, 'ult'); await p.wait_for_timeout(1500)
            for _ in range(40):
                if not await p.evaluate("PF.B.busy"): break
                await p.wait_for_timeout(150)
            ok('大絕招：造成傷害、每場一次', await p.evaluate("PF.B.ultUsed") and f0 > await p.evaluate("PF.B.foe.hp") and (await p.evaluate("PF.B.over") or await p.is_disabled('#mvUlt')))
        for _ in range(40):
            if not await p.evaluate("PF.B.busy"): break
            await p.wait_for_timeout(150)
        if not await p.evaluate("PF.B.over"): await p.click('#mpMain [data-mv=run]'); await p.wait_for_timeout(1200)
        await p.wait_for_selector('#bDone', state='visible', timeout=8000); await p.click('#bDone'); await p.wait_for_timeout(300)
        await p.evaluate("PF.debug.set({energy:100,sleeping:false,xp:512,coins:100})"); x0 = (await st(p))['xp']
        await p.click('#bTrain'); await p.wait_for_timeout(300); await p.click('[data-tk=combo]'); await p.wait_for_timeout(3200)
        seq = await p.evaluate('PF.TG.seq'); ok('組合拳節奏版：5 組 × 5 拳、有方向鍵與 AB 鍵', len(seq) == 25 and await p.locator('#tCtl [data-tb]').count() == 6, (len(seq), await p.locator('#tCtl [data-tb]').count()))
        await p.evaluate("""new Promise(r=>{const iv=setInterval(()=>{const G=PF.TG;if(!G||G.phase==='done'){clearInterval(iv);r(1);return}if(G.phase==='play'){const n=G.notes.find(n=>!n.st&&Math.abs(G.t-n.t)<.05);if(n)G.btn(n.k)}},8)})""")
        await p.wait_for_selector('#tResult', state='visible', timeout=8000); s = await st(p)
        ok('訓練場：組合拳成功、扣 20 金幣、有經驗', s['coins'] == 80 and s['xp'] > x0 and '成功' in await p.inner_text('#tRTitle'), (s['coins'], s['xp'] - x0))
        await p.click('#tAgain'); await p.wait_for_timeout(300); x1 = (await st(p))['xp']; await p.wait_for_timeout(23000)   # V1.66 都不按 → 整首跑完才結算 → 失敗
        await p.wait_for_selector('#tResult', state='visible', timeout=8000); s = await st(p)
        ok('訓練失敗沒有經驗、錢不退', s['coins'] == 60 and s['xp'] == x1 and '失敗' in await p.inner_text('#tRTitle'), (s['coins'], s['xp'] - x1))
        await p.click('#tClose'); await p.wait_for_timeout(300)
        await p.evaluate(f"PF.debug.set({{coins:200,bondRestUntil:Date.now()+3600000,energy:40}})")
        r = await p.evaluate("(()=>{const s=PF.state;const a=PF.PC.buyItem(s,'soup');const b=PF.PC.useSoup(s,Date.now());return [a.ok,b.ok,s.coins,s.bondRestUntil,Math.round(s.energy)]})()")
        ok('雞湯 120 金幣、喝了不用休息、體力 +20（火系 +30）', r[0] and r[1] and r[2] == 80 and r[3] == 0 and r[4] in (60, 70), r)   # 成年火系會加熱雞湯 +50%
        # ---------- 步數 ----------
        await p.goto(URL + '?steps=12345'); await p.wait_for_timeout(900); s = await st(p)
        ok('捷徑網址登記步數', s['steps']['total'] == 12345 and 'steps' not in p.url, (s['steps']['total'], p.url))
        # ---------- 配對 ----------
        ctx2, f = await newpage(br, I13); await hatch(f, '阿花')
        await f.evaluate("PF.debug.set({stage:'adult',route:'flame',sex:'f'})"); fcode = await f.evaluate("PF.mateCode()")
        await f.evaluate("PF.debug.set({sex:'m'})"); fcode_m = await f.evaluate("PF.mateCode()"); await ctx2.close()
        await p.evaluate("PF.debug.set({mood:90,coins:100,sex:'m'})")
        await p.evaluate('mateDialog()'); await p.fill('#mIn', fcode_m); await p.click('#mGo'); await p.wait_for_timeout(300); ok('跟朋友配對也要一公一母', '一公一母' in await p.inner_text('#mErr'), await p.inner_text('#mErr'))
        await p.fill('#mIn', fcode); await p.click('#mGo'); await p.wait_for_timeout(300); await p.screenshot(path=f'{OUT}/12_mate.png')
        await p.click('#mConfirm'); await p.wait_for_timeout(500); s = await st(p)
        ok('配對：牠去愛的小窩住一天、扣 20 金幣', bool(s.get('loveEgg')) and len(s['eggs']) == 0 and s['coins'] == 80)
        await p.evaluate("(()=>{const s=PF.state,t=Date.now()-1;s.loveEgg.end=t;s.nestUntil=t;PF.PC.applyTime(s,Date.now())})()"); await p.wait_for_timeout(200); s = await st(p)
        ok('住滿一天：回來帶著蛋（還要暖 6 小時）', len(s['eggs']) == 1 and not s.get('loveEgg') and s['eggs'][0]['ready'] > s['eggs'][0]['at'])
        await p.evaluate('mateDialog()'); await p.fill('#mIn', fcode); await p.click('#mGo'); await p.wait_for_timeout(200)
        ok('配對冷卻 6 小時', '⏳' in await p.inner_text('#mErr')); await closeall(p)
        # ---------- 小窩 ----------
        await p.evaluate("PF.debug.set({view:'room',coins:500})"); await p.wait_for_timeout(500)
        await p.click('#denBtn'); await p.wait_for_timeout(300); ok('小窩裡按「🛠 小窩」打開小窩畫面', '小窩' in await p.inner_text('#sheet'))
        await p.screenshot(path=f'{OUT}/12b_den.png'); await p.click('#dUp'); await p.wait_for_timeout(300); s = await st(p)
        ok('升級小窩：扣 120 金幣、可住 2 隻', s['den']['level'] == 2 and s['coins'] == 380); await closeall(p)
        await p.wait_for_timeout(400); await p.screenshot(path=f'{OUT}/12c_den2.png')
        # ---------- 9. 匯出、迎接新蛋、匯入 ----------
        code = await p.evaluate("PF.exportCode()"); before = await st(p)
        await p.click('#bMenu'); await p.click('#mReset'); await p.click('#mbtns .pri'); await p.wait_for_timeout(400); s = await st(p)
        ok('迎接新蛋：第 1 顆扣 300 金幣、保留圖鑑、日記、每日紀錄', s['stage'] == 'egg' and s['coins'] == before['coins'] - 300 and s['eggBuys'] == 1 and len(s['dex']) == 1 and len(s['journal']) >= 3 and s['daily']['date'] == before['daily']['date'])
        ok('小窩有空位：舊夥伴搬進小窩', len(s['roster']) == 1 and s['roster'][0]['name'] == '露米')
        await hatch(p, '小二'); await p.evaluate("PF.debug.set({view:'room'})"); await p.wait_for_timeout(500); await p.screenshot(path=f'{OUT}/12d_room_residents.png')
        await p.click('#denBtn'); await p.wait_for_timeout(300); await p.click('[data-sw="0"]'); await p.wait_for_timeout(300); s = await st(p)
        ok('從小窩換夥伴出來', s['name'] == '露米' and s['roster'][0]['name'] == '小二')
        await p.click('#bMenu'); await p.click('#mSave'); await p.fill('#impText', code); await p.click('#bImp'); await p.wait_for_timeout(200); await p.click('#mbtns .pri'); await p.wait_for_timeout(400)
        s = await st(p); ok('匯入還原', s['name'] == '露米' and s['stage'] == 'adult' and s['den']['level'] == 2)
        # 減少動畫、音效
        await p.click('#bMenu'); await p.click('#mMotion'); await p.click('#mSound'); s = await st(p); await closeall(p)
        ok('減少動畫與音效開關會存檔', s['settings']['reducedMotion'] and not s['settings']['sound'])
        # 觸控面積
        small = await p.evaluate("[...document.querySelectorAll('#app button')].filter(b=>b.offsetParent&&(b.getBoundingClientRect().height<44||b.getBoundingClientRect().width<44)).map(b=>b.textContent.trim())")
        ok('所有按鈕觸控區至少 44×44', not small, small)
        await p.screenshot(path=f'{OUT}/13_main.png', full_page=True)
        # SW 離線
        await p.wait_for_timeout(1500); await p.reload(); await p.wait_for_timeout(800)
        ok('Service Worker 啟用', await p.evaluate("navigator.serviceWorker.getRegistration().then(r=>!!(r&&r.active))"))
        await ctx.set_offline(True)
        try: await p.reload(); await p.wait_for_timeout(1000); off = await p.evaluate("!!window.PF&&PF.VERSION")
        except Exception: off = False
        ok('離線啟動（已快取）', off); await ctx.set_offline(False); await ctx.close()
        # ---------- 版本升級與損毀資料 ----------
        legacy = {"v": 5, "hatched": True, "name": "舊小露", "level": 4, "xp": 10, "coins": 77, "route": None, "seed": 9, "hunger": 60, "updated": int(time.time() * 1000) - 60000}
        ctx3, q = await newpage(br, I13, "if(!sessionStorage.t){sessionStorage.t=1;localStorage.setItem('pixel-familiar-save',JSON.stringify(%s))}" % json.dumps(legacy))
        s = await st(q); ok('V1.5 存檔升級：等級轉累積 XP', s['name'] == '舊小露' and s['xp'] == 50 + 100 + 150 + 10 and s['v'] == 7, (s['xp'], s['v']))
        ok('升級提示', True); await ctx3.close()
        ctx4, q = await newpage(br, I13, "if(!sessionStorage.t){sessionStorage.t=1;localStorage.setItem('pixel-familiar-v1',JSON.stringify({hatched:true,name:'V12',level:2,xp:5,coins:9}))}")
        s = await st(q); ok('V1.2 舊存檔搬移', s['name'] == 'V12' and s['xp'] == 55); await ctx4.close()
        ctx5, q = await newpage(br, I13, "if(!sessionStorage.t){sessionStorage.t=1;localStorage.setItem('pixel-familiar-save-backup',JSON.stringify({v:6,hatched:true,name:'備份君',stage:'juvenile'}));localStorage.setItem('pixel-familiar-save','{broken')}")
        s = await st(q); ok('損毀 JSON → 從備份還原', s['name'] == '備份君'); await ctx5.close()
        # ---------- V1.17–1.18：待命走動、皮球、暖燈、野生怪獸外型 ----------
        ctx7, q = await newpage(br, I13); await hatch(q, '走走')
        await q.evaluate("window.PF_NO_WANDER=0"); xs = set()
        for _ in range(48): xs.add(round(await q.evaluate('PF.petX'))); await q.wait_for_timeout(500)
        ok('待命時會自己走來走去', len(xs) >= 3, sorted(xs)[:8])
        await q.evaluate("window.PF_NO_WANDER=1"); await q.wait_for_timeout(300)
        tx = await q.evaluate('PF.toy.x'); await tap(q, tx, 98); await q.wait_for_timeout(600)
        ok('點皮球會滾', abs(await q.evaluate('PF.toy.x') - tx) > 5, (tx, await q.evaluate('PF.toy.x')))
        ok('野生怪獸不用 7 系手繪造型', await q.evaluate("(()=>{const k=PF.petKey('g:5','flame')+'|wild';return PF.formOf(k).wild===true&&WILD_MON.some(m=>m[0]===PF.formOf(k).name)})()"))
        await q.evaluate("PF.state.settings.light=false"); s = await st(q); ok('開燈設定可存', s['settings']['light'] is False)
        # 猜拳與嬰兒期
        ok('孵化後是嬰兒期', (await st(q))['stage'] == 'baby')
        await q.evaluate("window.PF_NO_RPS=0;PF.debug.set({energy:100,hp:100})"); await q.evaluate("PF.startBattle(1)"); await q.wait_for_timeout(600)
        seen = False
        for _ in range(6):
            await move(q, 'tackle'); 
            for _ in range(20):
                await q.wait_for_timeout(150)
                if await q.is_visible('#rpsZone'): seen = True; break
            if seen: break
        ok('敵人攻擊前跳出猜拳', seen)
        if seen:
            await q.click('[data-rps=rock]'); await q.wait_for_timeout(300); m = await q.inner_text('#rpsMsg')
            ok('猜拳有結果（贏／平手／輸）', any(k in m for k in ['躲開', '0.8', '1.2']), m)
        await ctx7.close()
        # ---------- iOS App 版：模擬 Capacitor 健康外掛，打開就自動同步步數 ----------
        mock = """window.PF_NO_WANDER=1;window.PF_NO_SOCIAL=1;window.PLAY_DIRECT=1;window.PF_NO_RPS=1;window.PF_NO_TRAITS=1;window.PF_NO_WEATHER=1;window.PF_NO_CRAVE=1;window.PF_NO_LVPOP=1;window.PF_NO_SKILLS=1;window.PF_SKIP_INTRO=1;window.PF_NO_GUIDE=1;window.PF_XP1=1;
          const _d=n=>{const t=new Date(Date.now()-n*86400000);return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(t)};
          window.Capacitor={isNativePlatform:()=>true,Plugins:{HealthSteps:{requestAuthorization:async()=>({granted:true}),getDailySteps:async()=>({days:[{date:_d(1),steps:4200},{date:_d(0),steps:6800}]})}}};"""
        ctx8 = await br.new_context(**I13); q = await ctx8.new_page(); await q.add_init_script(mock)
        await q.goto(URL); await q.wait_for_timeout(2500); s = await st(q)
        ok('App 版：打開就從健康 App 同步最近幾天的步數', s['steps']['total'] == 11000, s['steps'])
        await q.click('#bSteps'); await q.wait_for_timeout(300); ok('App 版：步數畫面顯示已連接健康 App、沒有捷徑教學', await q.is_visible('#sSync') and not await q.is_visible('#sCopyUrl'))
        await ctx8.close()
        # ---------- V1.55 一頁式、背包 ----------
        ctxB, b = await newpage(br, I13); await hatch(b)
        ok('主畫面：放得下就不捲；螢幕太矮就改成可往下捲、遊戲畫面維持大尺寸', await b.evaluate("document.documentElement.scrollHeight<=innerHeight+1||(document.body.classList.contains('scrollm')&&document.getElementById('stagewrap').offsetWidth>=innerWidth*.85)"), await b.evaluate("[document.documentElement.scrollHeight,innerHeight,document.getElementById('stagewrap').offsetWidth]"))
        await b.evaluate("(()=>{const s=PF.state;s.inv.relics={iceScale:1};s.inv.melon=1;PF.debug.set({})})()")
        await b.click('#bShop'); await b.wait_for_timeout(300)
        heads = await b.evaluate("[...document.querySelectorAll('#shopBody .shead')].map(e=>e.textContent)")
        ok('V1.55 背包順序：寶物→道具→食物→水果→素材', heads[0].endswith('王的寶物') and heads.index([h for h in heads if h.endswith('道具')][0]) < heads.index([h for h in heads if h.endswith('食物')][0]) < heads.index([h for h in heads if h.endswith('水果')][0]), heads)
        await ctxB.close()
        # ---------- V1.58 餵食選單不壓縮畫面、資訊按鈕 ----------
        ctxC, c2 = await newpage(br, I13); await hatch(c2)
        h0 = await c2.evaluate("document.querySelector('#scene').getBoundingClientRect().height"); await c2.click('[data-act=feed]'); await c2.wait_for_timeout(300)
        h1 = await c2.evaluate("document.querySelector('#scene').getBoundingClientRect().height")
        ok('V1.58 打開餵食選單時遊戲畫面大小不變', abs(h0 - h1) < 1 and await c2.is_visible('#foodBar'), (h0, h1))
        await c2.click('[data-act=feed]'); await c2.wait_for_timeout(200)
        order = await c2.evaluate("['.nameplate','section.panel','#stats','.actions'].map(q=>document.querySelector(q).getBoundingClientRect().top)")
        ok('V1.60 資訊直接顯示、成長經驗在狀態列上面', await c2.is_visible('#stageText') and order == sorted(order), order)
        await ctxC.close()
        # ---------- V1.51 自由佈置房間 ----------
        ctxA, a = await newpage(br, I13); await hatch(a)
        await a.evaluate("PF.startArrange()"); await a.wait_for_timeout(300)
        vis = await a.is_visible('#arrPanel')
        r0 = await a.evaluate("PF.arrItems().find(o=>o.sl==='bed').r")
        box = await a.locator('#scene').bounding_box(); sx = box['width'] / 128; sy = box['height'] / 112
        cx, cy = box['x'] + (r0[0] + r0[2] / 2) * sx, box['y'] + (r0[1] + r0[3] / 2) * sy
        await a.mouse.move(cx, cy); await a.mouse.down(); await a.mouse.move(cx - 30 * sx, cy - 6 * sy, steps=6); await a.mouse.up(); await a.wait_for_timeout(200)
        r1 = await a.evaluate("PF.arrItems().find(o=>o.sl==='bed').r")
        await a.screenshot(path=f'{OUT}/15_arrange.png')
        await a.click('#arrDone'); await a.reload(); await a.wait_for_timeout(800)
        kept = await a.evaluate("PF.state.decor.pos.bed")
        ok('佈置房間：可以拖動床、按完成後重開還在', vis and abs((r0[0] - r1[0]) - 30) <= 2 and kept is not None and not await a.is_visible('#arrPanel'), (r0, r1, kept))
        # ---------- V1.83 釣魚 ----------
        await a.evaluate("(()=>{PF.state.coins=500;PF.state.view='yard';renderUI()})()"); await a.wait_for_timeout(300)
        await a.click('#bFish'); await a.wait_for_timeout(400); vis = await a.is_visible('#fishZone')
        await a.click('#fsCast'); await a.wait_for_timeout(600); shop = await a.is_visible('#modal'); await a.click('[data-fb=b10]'); await a.wait_for_timeout(200); await a.evaluate("closeModal()")
        await a.dispatch_event('#fsCast', 'pointerdown'); await a.wait_for_timeout(500); await a.dispatch_event('#fsCast', 'pointerup'); await a.wait_for_timeout(800)
        await a.evaluate("FZ.c.key='f_creek';FZ.c.star=1;FZ.c.heavy=false;FZ.c.mv='calm';FZ.c.zap=false;FZ.escAt=0;FZ.biteAt=0"); await a.wait_for_timeout(200)
        await a.dispatch_event('#fsReel', 'pointerdown'); await a.wait_for_timeout(200); reel = await a.evaluate("FZ.ph")
        await a.evaluate("FZ.prog=1.2"); await a.wait_for_timeout(900); card = await a.is_visible('#gResult'); await a.click('#gDone'); f = await a.evaluate("JSON.stringify(PF.state.fish)")
        await a.click('#fsHome'); await a.wait_for_timeout(300)
        ok('釣魚：沒餌會開釣具店、買餌、拋竿、上鉤拉條、跳結算視窗、記進圖鑑、回院子', vis and shop and reel == 'reel' and '"f_creek":1' in f and '"bait":9' in f and card and not await a.is_visible('#fishZone'), (vis, shop, reel, card, f))
        await ctxA.close()
        # ---------- 小螢幕 ----------
        ctx6, q = await newpage(br, pw.devices['iPhone SE']); await q.screenshot(path=f'{OUT}/14_iphoneSE.png', full_page=True)
        ok('iPhone SE 無橫向捲動', await q.evaluate("document.documentElement.scrollWidth<=innerWidth"))
        # 美術：各成長階段畫廊
        d = await q.evaluate('''(()=>{const codes=['juv','teen','flame','tide','forest','asc-flame','asc-tide','asc-forest'],ids=['classic','g:7','g:12345','g:99'];
          const c=document.createElement('canvas');c.width=48*codes.length;c.height=48*ids.length;const x=c.getContext('2d');x.fillStyle='#7fb07a';x.fillRect(0,0,c.width,c.height);
          ids.forEach((id,r)=>codes.forEach((cd,i)=>{const S=PF.sheet(PF.petKey(id,cd));x.drawImage(S.cv,S.idx.idle0*48,0,48,48,i*48,r*48,48,48)}));return c.toDataURL()})()''')
        open(f'{ROOT}/art/stages-gallery.png', 'wb').write(base64.b64decode(d.split(',')[1]))
        await ctx6.close(); await br.close()
    srv.terminate()
    print('\nconsole/page errors:', errors if errors else 'none')
    n = sum(r[1] for r in results); print(f'\n{n}/{len(results)} passed'); sys.exit(0 if n == len(results) and not errors else 1)
asyncio.run(main())
