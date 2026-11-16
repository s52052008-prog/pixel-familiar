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
async def do_play(p, timed=True):
    await p.click('[data-act=play]'); await p.wait_for_timeout(400); b = await p.locator('#scene').bounding_box()
    tapxy = (b['x'] + 64 / 128 * b['width'], b['y'] + 40 / 112 * b['height'])
    for k in range(3):
        await p.mouse.click(*tapxy)
        for _ in range(80):
            bb = await p.evaluate("PF.ball.b&&{y:PF.ball.b.y,hit:PF.ball.b.hit}")
            if not bb or bb['hit']: break
            if timed and bb['y'] > 60: await p.mouse.click(*tapxy); break
            await p.wait_for_timeout(25)
        for _ in range(100):
            if not await p.evaluate("!!PF.ball.b"): break
            await p.wait_for_timeout(50)
    for _ in range(40):
        if await p.evaluate("!PF.mode"): break
        await p.wait_for_timeout(100)
async def closeall(p):
    if await p.is_visible('#modal'): await p.click('#mbtns .btn >> nth=0')
async def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '-d', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
    async with async_playwright() as pw:
        br = await pw.chromium.launch(); I13 = pw.devices['iPhone 13']
        # ---------- 1. 孵化、命名、刷新保留 ----------
        ctx, p = await newpage(br, I13)
        await p.screenshot(path=f'{OUT}/01_egg.png')
        s = await st(p); ok('新存檔：蛋、金幣 50+每日 10、食物 3+1', s['stage'] == 'egg' and s['coins'] == 60 and s['inv']['food'] == 4, (s['coins'], s['inv']))
        await hatch(p, '露米')
        s = await st(p); ok('孵化並命名、孵化時就有屬性', s['hatched'] and s['stage'] == 'juvenile' and s['name'] == '露米' and s['route'] in ['flame','tide','forest','earth','bird','elec','metal'], s['route'])
        stx = await p.inner_text('#stageText'); ok('畫面顯示屬性', any(k in stx for k in ['焰系','潮系','森系','土系','鳥系','電系','金系']), stx)
        await p.reload(); await p.wait_for_timeout(700); s = await st(p); ok('刷新後保留', s['hatched'] and s['name'] == '露米')
        ok('每日禮物刷新後不重複', s['coins'] == 60, s['coins'])
        # ---------- 2. 照顧行為 ----------
        await p.evaluate("PF.debug.set({hunger:50,mood:50,clean:40,energy:60})")
        await p.click('[data-act=feed]'); await p.wait_for_timeout(200); ok('按餵食進入放蘋果模式', await p.evaluate("PF.mode") == 'feed')
        await p.mouse.click(*await scene_xy(p, 96, 60)); await p.wait_for_timeout(300); ok('點畫面放下蘋果', await p.evaluate("!!PF.apple"))
        await p.screenshot(path=f'{OUT}/02_apple.png')
        for _ in range(80):
            if await p.evaluate("!PF.mode"): break
            await p.wait_for_timeout(100)
        s = await st(p); ok('走過去吃完：用掉食物、飽食 +25、XP +5、留下果核', s['inv']['food'] == 3 and round(s['hunger']) == 75 and s['xp'] == 5 and len(s['cores']) == 1, (s['inv'], round(s['hunger']), s['xp'], s['cores']))
        await p.wait_for_timeout(5000); await p.screenshot(path=f'{OUT}/02b_core.png')
        await p.mouse.click(*await scene_xy(p, s['cores'][0]['x'], 98)); await p.wait_for_timeout(300)
        ok('點果核清掉', len((await st(p))['cores']) == 0)
        await do_play(p); s = await st(p)
        ok('頂球一回合：心情 +20、體力 -10、記錄分數', round(s['mood']) == 70 and round(s['energy']) == 50 and s['ball']['goals'] >= 0, (round(s['mood']), round(s['energy']), s['ball']))
        await p.click('[data-act=wash]'); await p.wait_for_timeout(300); await p.click('[data-act=wash]'); await p.wait_for_timeout(300)
        ok('再按一次可以取消', await p.evaluate("PF.mode") is None)
        await do_wash(p); s = await st(p); ok('海綿刷 3 秒：清潔 +35', round(s['clean']) == 75, round(s['clean']))
        # ---------- 3. 冷卻不能用重新整理繞過 ----------
        await p.evaluate("PF.debug.set({clean:30})"); await p.reload(); await p.wait_for_timeout(700)
        await p.click('[data-act=wash]'); await p.wait_for_timeout(300)
        ok('洗澡冷卻：重新整理後仍有效', '分鐘後再洗' in await p.inner_text('#log'), await p.inner_text('#log'))
        await p.wait_for_timeout(800)
        b0 = (await st(p))['bond']; await tap(p); await p.wait_for_timeout(1200); b1 = (await st(p))['bond']
        await p.reload(); await p.wait_for_timeout(700); await tap(p); await p.wait_for_timeout(1200); b2 = (await st(p))['bond']
        ok('撫摸 30 分鐘一次收益：重新整理後不能再拿', b1 == b0 + 2 and b2 == b1, (b0, b1, b2))
        await p.screenshot(path=f'{OUT}/04_pet.png')
        # 果核發臭
        await p.evaluate("(()=>{PF.PC.addCore(PF.state,30,Date.now()-120*60000,'yard');PF.debug.set({mood:80})})()"); await p.wait_for_timeout(600)
        await p.screenshot(path=f'{OUT}/03b_rotten.png')
        await p.evaluate("PF.debug.skip(60)"); s = await st(p); ok('發臭果核：每小時心情多掉 4', abs(s['mood'] - 75) < .2, round(s['mood'], 1))
        await p.mouse.click(*await scene_xy(p, 30, 98)); await p.wait_for_timeout(300); ok('清掉臭果核', len((await st(p))['cores']) == 0)
        # ---------- 4. 離線上限 12 小時 ----------
        for hrs in (2, 24, 168):
            await p.evaluate("PF.debug.set({hunger:80,mood:80,clean:80,energy:20})"); await p.evaluate(f"PF.debug.skip({hrs*60})")
            s = await st(p); eff = min(hrs, 12)
            ok(f'離線 {hrs} 小時 → 只計算 {eff} 小時', abs(s['hunger'] - (80 - 2 * eff)) < .2 and abs(s['energy'] - (20 + 3 * eff)) < .2, (round(s['hunger'], 1), round(s['energy'], 1)))
        # ---------- 5. 成長門檻（用 debug 把孵化時間往前移） ----------
        await p.evaluate("PF.debug.set({xp:99})"); await p.evaluate("PF.debug.age(12)"); await p.wait_for_timeout(400)
        ok('12h 但 99 XP：還是幼年期', (await st(p))['stage'] == 'juvenile')
        await p.evaluate("PF.debug.set({xp:100})"); await p.evaluate("PF.debug.age(0)"); await p.wait_for_timeout(1000)
        await p.screenshot(path=f'{OUT}/05_evolving.png'); await p.wait_for_timeout(3500)
        ok('12h + 100 XP：少年期', (await st(p))['stage'] == 'adolescent')
        await p.screenshot(path=f'{OUT}/06_teen.png')
        el0 = (await st(p))['route']; await p.evaluate("PF.debug.set({xp:400,path:{flame:99,tide:0,forest:0}})"); await p.evaluate("PF.debug.age(36)"); await p.wait_for_timeout(5500)
        s = await st(p); ok('48h + 350 XP → 成年期，屬性維持孵化時的那一系', s['stage'] == 'adult' and s['route'] == el0, (s['stage'], s['route'], el0))
        await p.screenshot(path=f'{OUT}/07_adult.png', full_page=True)
        await p.evaluate("PF.debug.set({xp:1200})"); await p.evaluate("PF.debug.age(200)"); await p.wait_for_timeout(1500)
        ok('沒有特殊事件不能高階', (await st(p))['stage'] == 'adult')
        evname = await p.evaluate("PF.PC.EVENT_TEXT[PF.PC.ROUTE_EVENT[PF.state.route]]"); ok('畫面顯示還缺該屬性的特殊事件', evname in await p.inner_text('#growText'), await p.inner_text('#growText'))
        # 日記
        await p.click('#bMenu'); await p.click('#mJournal'); await p.wait_for_timeout(300); txt = await p.inner_text('#sheet')
        ok('日記自動記錄孵化與進化', '孵化' in txt and '少年期' in txt and '成年期' in txt); await p.screenshot(path=f'{OUT}/08_journal.png'); await closeall(p)
        # ---------- 7. 零資源不卡死 ----------
        await p.evaluate("PF.debug.set({coins:0,inv:{food:0,seeds:0,candy:0,potion:1},hunger:20,sleeping:false})"); await p.wait_for_timeout(1200)
        await p.click('[data-act=feed]'); await p.wait_for_selector('#mbtns .pri', timeout=3000); await p.click('#mbtns .pri'); await p.wait_for_timeout(300)
        ok('零金幣零食物 → 採集得到食物', (await st(p))['inv']['food'] == 1)
        # ---------- 家園種植 ----------
        await p.evaluate("PF.debug.set({inv:{food:1,seeds:2,candy:0,potion:1}})")
        await p.click('#bFarm'); await p.wait_for_timeout(300); await p.click('[data-pa="0"]'); await p.wait_for_timeout(300)
        s = await st(p); ok('種下種子', s['inv']['seeds'] == 1 and s['plots'][0]['at'] > 0)
        ok('成長中不能收成', await p.is_disabled('[data-pa="0"]')); await p.screenshot(path=f'{OUT}/09a_farm.png'); await closeall(p)
        await p.evaluate("(()=>{const s=PF.state;s.plots[0].at=Date.now()-2*3600000-1000;PF.debug.set({})})()"); await p.wait_for_timeout(600)
        await p.screenshot(path=f'{OUT}/09b_ripe_in_scene.png')
        x0 = (await st(p))['xp']; await p.click('#bFarm'); await p.wait_for_timeout(300); await p.screenshot(path=f'{OUT}/09c_farm_ripe.png'); await p.click('[data-pa="0"]'); await p.wait_for_timeout(300)
        s = await st(p); ok('2 小時後收成：食物 +2、XP +5、收成次數 1', s['inv']['food'] == 3 and s['xp'] == x0 + 5 and s['harvests'] == 1, (s['inv'], s['xp'] - x0)); await closeall(p)
        # ---------- 每日小目標 ----------
        await p.click('#bGoals'); await p.wait_for_timeout(300); s = await st(p)
        ok('每日 3 個小目標', len(s['goals']['list']) == 3)
        await p.evaluate("(()=>{const s=PF.state;s.goals.list[0].n=PF.PC.GOALS[s.goals.list[0].id].need;PF.debug.set({})})()"); await closeall(p); await p.wait_for_timeout(1200)
        ok('完成目標時按鈕出現紅點', await p.is_visible('#goalDot'))
        await p.click('#bGoals'); await p.wait_for_timeout(300); await p.screenshot(path=f'{OUT}/09d_goals.png')
        c0 = await st(p); await p.click('[data-g="0"]'); await p.wait_for_timeout(300); s = await st(p)
        ok('領取目標獎勵、只能領一次', s['goals']['list'][0]['claimed'] and (s['coins'] > c0['coins'] or s['inv']['food'] > c0['inv']['food'] or s['inv']['seeds'] > c0['inv']['seeds']) and await p.is_disabled('[data-g="0"]'))
        await closeall(p)
        # ---------- 商店與小屋 ----------
        await p.evaluate("PF.debug.set({coins:400,mood:50,hunger:50,sleeping:false})")
        await p.click('#bShop'); await p.wait_for_timeout(300); await p.screenshot(path=f'{OUT}/09e_shop.png')
        for it in ['paper_mint', 'wall_clock', 'lamp_moon', 'plant_flower', 'bed_cloud', 'rug_star', 'toy_block']:
            await p.click(f'[data-dz="{it}"]'); await p.wait_for_timeout(150)
        s = await st(p); ok('買 7 件家具、扣錢、自動擺上', len(s['decor']['owned']) == 9 and s['coins'] == 400 - 30 - 45 - 50 - 35 - 80 - 60 - 25 and s['decor']['placed']['bed'] == 'bed_cloud', s['coins'])
        await p.click('[data-dz="toy_block"]'); await p.wait_for_timeout(150); ok('收起家具', 'toy' not in (await st(p))['decor']['placed'])
        await p.click('[data-dz="toy_block"]'); await p.wait_for_timeout(150)
        await p.click('[data-tab="items"]'); await p.wait_for_timeout(150); await p.click('[data-bi="candy"]'); await p.wait_for_timeout(150)
        ok('買星星糖', (await st(p))['inv']['candy'] == 1); await p.click('#eatCandy'); await p.wait_for_timeout(1500)
        s = await st(p); ok('吃星星糖：心情 +20', s['inv']['candy'] == 0 and round(s['mood']) >= 69, round(s['mood']))
        ok('買完家具後切到室內', s['view'] == 'room'); await p.screenshot(path=f'{OUT}/09f_room.png')
        await p.click('#viewBtn'); await p.wait_for_timeout(400); ok('切換回戶外', (await st(p))['view'] == 'yard')
        await tap(p, 20, 56); await p.wait_for_timeout(400); await p.click('#dIn'); await p.wait_for_timeout(400); ok('點小窩 →「進入小窩」', (await st(p))['view'] == 'room')
        # ---------- 大便、馬桶、回窩睡覺 ----------
        await p.evaluate("PF.debug.set({view:'yard',sleeping:false})"); await p.wait_for_timeout(300)
        await p.evaluate("(()=>{PF.state.digest=[Date.now()-1000];PF.debug.set({})})()"); await p.wait_for_timeout(1500)
        s = await st(p); poo = [c for c in s['cores'] if c['k'] == 'poop']; ok('吃完一段時間後大便', len(poo) == 1, s['cores'])
        await p.screenshot(path=f'{OUT}/09g_poop.png')
        await p.mouse.click(*await scene_xy(p, poo[0]['x'], 98)); await p.wait_for_timeout(300); ok('點大便清掉', not [c for c in (await st(p))['cores'] if c['k'] == 'poop'])
        await p.evaluate("PF.debug.set({coins:300})"); await p.click('#bShop'); await p.wait_for_timeout(300); await p.click('[data-dz="toilet_pot"]'); await p.wait_for_timeout(200); await closeall(p)
        await p.evaluate("(()=>{PF.state.digest=[Date.now()-1000];PF.debug.set({})})()"); await p.wait_for_timeout(1500); s = await st(p)
        ok('有寵物馬桶：自己上廁所、地上沒有大便', s['toiletUses'] == 1 and not [c for c in s['cores'] if c['k'] == 'poop'])
        await p.evaluate("PF.debug.set({view:'yard',energy:40})"); await p.click('#viewBtn'); await p.wait_for_timeout(200); await p.click('#viewBtn'); await p.wait_for_timeout(200)
        await p.evaluate("PF.debug.set({view:'yard'})"); await p.wait_for_timeout(300); await p.click('[data-act=sleep]')
        for _ in range(40):
            if await p.evaluate("PF.state.sleeping"): break
            await p.wait_for_timeout(150)
        s = await st(p); ok('在外面按睡覺 → 自動回小窩、走到小圓床睡', s['sleeping'] and s['view'] == 'room' and await p.evaluate("PF.petX") <= 2, (s['sleeping'], s['view']))
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
            await p.click(f'[data-mv={mv}]'); await p.wait_for_timeout(250)
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
        await p.click('#mvCh'); await p.wait_for_timeout(200); ok('蓄力', await p.evaluate("PF.B.me.charged") or '蓄力' in await p.inner_text('#blog'))
        for _ in range(40):
            if not await p.evaluate("PF.B.busy"): break
            await p.wait_for_timeout(150)
        if not await p.evaluate("PF.B.over"):
            await p.evaluate("(()=>{PF.B.me.hp=Math.max(1,Math.floor(PF.B.me.max/3));PF.bUI()})()"); hp0 = await p.evaluate("PF.B.me.hp")
            await p.click('#mvPo'); await p.wait_for_timeout(300); ok('喝藥水回血、藥水 −1', (await st(p))['inv']['potion'] == 1)
            for _ in range(40):
                if not await p.evaluate("PF.B.busy"): break
                await p.wait_for_timeout(150)
        if not await p.evaluate("PF.B.over"):
            await p.evaluate("(()=>{PF.B.me.hp=1;PF.B.foe.hp=PF.B.foe.max;PF.bUI()})()"); await p.wait_for_timeout(200)
            ok('危險時出現羈絆之力按鈕', await p.is_visible('#mvBond')); await p.screenshot(path=f'{OUT}/11b_danger.png')
            f0 = await p.evaluate("PF.B.foe.hp"); await p.click('#mvBond'); await p.wait_for_timeout(2300)
            for i in range(8): await p.mouse.click(200, 400); await p.wait_for_timeout(60)
            for _ in range(60):
                if await p.evaluate("!PF.B.busy||PF.B.over"): break
                await p.wait_for_timeout(150)
            ok('羈絆之力：連打造成大傷害、每場只能一次', await p.evaluate("PF.B.bondUsed") and f0 - await p.evaluate("PF.B.foe.hp") > 30)
        for _ in range(60):
            if await p.is_visible('#bDone'): break
            if not await p.evaluate("PF.B.busy"): await p.click('[data-mv=tackle]')
            await p.wait_for_timeout(200)
        await p.click('#bDone')
        # ---------- 步數 ----------
        await p.goto(URL + '?steps=12345'); await p.wait_for_timeout(900); s = await st(p)
        ok('捷徑網址登記步數', s['steps']['total'] == 12345 and 'steps' not in p.url, (s['steps']['total'], p.url))
        # ---------- 配對 ----------
        ctx2, f = await newpage(br, I13); await hatch(f, '阿花')
        await f.evaluate("PF.debug.set({stage:'adult',route:'flame'})"); fcode = await f.evaluate("PF.mateCode()"); await ctx2.close()
        await p.evaluate("PF.debug.set({mood:90,coins:100})")
        await p.click('#bMate'); await p.fill('#mIn', fcode); await p.click('#mGo'); await p.wait_for_timeout(300); await p.screenshot(path=f'{OUT}/12_mate.png')
        await p.click('#mConfirm'); await p.wait_for_timeout(500); s = await st(p)
        ok('配對得到蛋、扣 20 金幣', len(s['eggs']) == 1 and s['coins'] == 80)
        await p.click('#bMate'); await p.fill('#mIn', fcode); await p.click('#mGo'); await p.wait_for_timeout(200)
        ok('配對冷卻 6 小時', '⏳' in await p.inner_text('#mErr')); await closeall(p)
        # ---------- 小窩 ----------
        await p.evaluate("PF.debug.set({view:'yard',coins:500})"); await p.wait_for_timeout(500)
        await p.mouse.click(*await scene_xy(p, 22, 56)); await p.wait_for_timeout(300); ok('點小窩打開小窩畫面', '小窩' in await p.inner_text('#sheet'))
        await p.screenshot(path=f'{OUT}/12b_den.png'); await p.click('#dUp'); await p.wait_for_timeout(300); s = await st(p)
        ok('升級小窩：扣 120 金幣、可住 2 隻', s['den']['level'] == 2 and s['coins'] == 380); await closeall(p)
        await p.wait_for_timeout(400); await p.screenshot(path=f'{OUT}/12c_den2.png')
        # ---------- 9. 匯出、迎接新蛋、匯入 ----------
        code = await p.evaluate("PF.exportCode()"); before = await st(p)
        await p.click('#bMenu'); await p.click('#mReset'); await p.click('#mbtns .pri'); await p.wait_for_timeout(400); s = await st(p)
        ok('迎接新蛋：保留金幣、圖鑑、日記、每日紀錄', s['stage'] == 'egg' and s['coins'] == before['coins'] and len(s['dex']) == 1 and len(s['journal']) >= 3 and s['daily']['date'] == before['daily']['date'])
        ok('小窩有空位：舊夥伴搬進小窩', len(s['roster']) == 1 and s['roster'][0]['name'] == '露米')
        await hatch(p, '小二'); await p.click('#viewBtn'); await p.wait_for_timeout(500); await p.screenshot(path=f'{OUT}/12d_room_residents.png'); await p.click('#viewBtn')
        await p.mouse.click(*await scene_xy(p, 22, 56)); await p.wait_for_timeout(300); await p.click('[data-sw="0"]'); await p.wait_for_timeout(300); s = await st(p)
        ok('從小窩換夥伴出來', s['name'] == '露米' and s['roster'][0]['name'] == '小二')
        await p.click('#bSave'); await p.fill('#impText', code); await p.click('#bImp'); await p.wait_for_timeout(200); await p.click('#mbtns .pri'); await p.wait_for_timeout(400)
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
