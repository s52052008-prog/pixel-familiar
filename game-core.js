/* =========================================================
   幻獸日記 Pixel Familiar — 遊戲規則核心 game-core.js（V1.6）
   依據 GDD V2.1。這個檔案「不碰畫面」，只處理資料與規則，
   所以可以在 Node.js 直接做單元測試（tests/core.test.js）。
   所有可調整的數值都集中在 CONFIG。
   ========================================================= */
(function (root) {
'use strict';

/* ---------------- 可調整數值（GDD 第 2、3、4 節） ---------------- */
const CONFIG = {
  tz: 'Asia/Taipei',                 // 每日重置使用的時區（GDD：預設 Asia/Taipei）
  offlineCapHours: 12,               // 離線狀態變化最多補算 12 小時
  jumpWarnDays: 30,                  // 一次跳過超過 30 天 → 提示時間異常
  rates: {                           // 每小時變化
    awake: { hunger: -4, mood: -3, clean: -2, energy: 8 },  // V1.19：變餓、變無聊、變髒都比較快   // 醒著也會慢慢恢復：約 1 小時可以再玩 1 次
    sleep: { hunger: -2, mood: 0, clean: -1, energy: 25 }   // 睡 4 小時左右就充飽
  },
  full: 95,                          // 視為「已滿」的門檻
  feed: { hunger: 25, xp: 5, tide: 1, price: 5 },
  play: { minEnergy: 10, mood: 15, energy: -10, hunger: -5, clean: -6, xp: 10, xpWindowMin: 30, xpPerWindow: 3 },
  wash: { cooldownMin: 0, clean: 35, xp: 5, rubSeconds: 3 },
  pet:  { cooldownMin: 30, bond: 2, mood: 3, tide: 2, minMood: 40 },   // 心情 40 以下摸摸不會加親密度
  neglect: { below: 25, bondPerHour: 1 },                 // 飽食／心情／清潔任一低於 25：親密度每小時 −1
  adventure: { minEnergy: 20, energy: -20, hunger: -15, clean: -20, winMood: 8, lossMood: -12, xp: 15, coinsMin: 20, coinsMax: 30, seeds: 1, flame: 3, dailyFull: Infinity, overCapXpRate: 0.2, dropFood: 0.3, dropSeed: 0.4 },
  battleWin: { xp: 10, coins: 4, flame: 2 },
  battleLoss: { xp: 3 },
  discovery: { xp: 10, forest: 2 },
  steps: { per: 1000, xpPer: 10, forestEvery: 2000, dayCap: 50000, tier: 100000, tierCoins: 100, backDays: 7 },
  daily: { coins: 10, food: 1 },
  gather: { cooldownMin: 2, food: 1 },
  stages: { juvenile: { hours: 4, xp: 150 }, adolescent: { hours: 12, xp: 450 }, adult: { hours: 48, xp: 1200 }, ascended: { hours: 168, xp: 3000 } },   // V1.65 成長經驗門檻 ×1.5   // V1.20：嬰兒期＋門檻提高
  routeTie: ['tide', 'forest', 'flame', 'earth', 'bird', 'elec', 'metal'],   // 平手時的固定順序（GDD 前三個 + V1.11 新增四個）
  bondTiers: [20, 50, 80],
  moonspringBond: 60,
  harvestsForOldTree: 10,
  bossStages: { volcano: 15, oldtree: 20, canyon: 25, skypeak: 30, thunder: 35, mine: 40 },
  /* V1.37 高階條件（七屬性一樣）：① 終極素材 3 個（第 10、20、30 關大王各掉一次，依你這隻的屬性）② 專屬任務（長到成年期才出現、從那時開始算）
     tasks：[[計數器, 需要數量], …]，有兩組的是「二選一」 */
  starHeart: { stage: 40, shardRepeat: .3, statX: 2, piggyX: 1.5 },   // 第 40 關大王：每個屬性第一次打贏得到星辰之心＋星辰碎片；之後再打贏 30% 掉碎片
  ascend: { mats: 3, bigBoss: [10, 20, 30], tasks: {
    flame: [['wins', 30]], tide: [['washes', 30]], forest: [['harvests', 30]], earth: [['steps', 60000], ['earthWins', 20]],
    bird: [['goals', 30]], elec: [['bondUses', 5]], metal: [['cleanups', 40]] } },
  newRoutes: { stepsForEarth: 100000, goalsForBird: 30, bondForElec: 5, cleanForMetal: 50, earthEvery: 2000 },
  breed: { cost: 20, cooldownH: 6, minMood: 50, basket: 6, nestHours: 24, eggHours: 6 },   // V1.86.2 兩隻在愛的小窩住一天才生蛋；蛋再暖 6 小時才能孵
  piggy: { base: 2, per: .5, maxLv: 30, capHours: 12, minMood: 30, sleepRate: .5, pairShare: .5,
    rateX: [1, 1.25, 1.5, 1.8, 2.2, 3], capH: [12, 14, 16, 18, 20, 24], coreStages: [15, 20, 25, 30], corePrice: 1000 },   // V1.43 小豬撲滿等級 1～6：第 15／20／25／30 關王各掉一個核心碎片（+1 級），商店核心 1000 元（唯一，+1 級）   // 存錢筒（被動收入）：每小時 0.5＋等級×0.25（最多算到 Lv.30），最多存 12 小時
  loveNest: { cost: 300, cooldownH: 12, mood: 10 },          // 愛的小窩：買一次，成年期以上的一公一母可以進去生蛋
  pair: { rate: .5, advMinEnergy: 20, foeHp: 1.5, xpShare: .6 },   // 第二隻一起出來：狀態變化速度減半；第二隻分到 6 成經驗（V1.79 起一起冒險改成敵人也兩隻，foeHp 不再使用）
  farm: { plots: 3, maxPlots: 9, expand: [90, 150, 300, 500, 700, 999],   /* V1.64 開始 3 格，最多 9 格 */ growHours: 2, growBy: [2, 3, 6, 12], fruitMin: 2, fruitMax: 3, freshHours: 6, rotHours: 24, xp: 5, forest: 3, seedPrice: 5 },   // 收成：蘋果、莓果各隨機 1～2 顆；田可以花錢擴建到 6 格     // 種植：GDD「種子、2h、產 2 食物、XP+5、森+3」
  goals: { perDay: 3, coins: [15, 30, 50], maxLv: 10, needPerLv: .2, rewardPerLv: .2 },   // 每天 ★／★★／★★★ 三個；每天 3 個都完成，任務等級 +1（更難、獎勵更好）
  candy: { price: 500, mood: 20, hunger: 10 },   // V1.39：星星糖 200 金幣，吃了直接升 1 級（不受屬性經驗加成影響）
  core: { rotMin: 10, moodPerHour: 4, max: 8 },
  // V1.67 天氣：每 3 小時換一次（同一時段大家都一樣）；在外面淋雨、打雷會影響幻獸，在小窩裡就安全（雷雨還是會有點怕）
  weatherOn: true,
  weather: { slotHours: 3, odds: [['clear', .5], ['breeze', .25], ['rain', .17], ['storm', .08]], offlineCap: 3,
    fx: { breeze: { out: { mood: 1 } }, rain: { out: { mood: -2, clean: -3 } }, storm: { out: { mood: -5, clean: -4, energy: -2 }, in: { mood: -1 } } } },          // 果核：10 分鐘沒清會發臭長果蠅，每顆每小時心情 −4
  poop: { delayMin: 40, rotMin: 3 },                      // 每吃一次，40 分鐘後大便；大便 3 分鐘沒清就發臭
  potion: { price: 40, heal: .5, drop: .15 },
  elixir: { price: 60 },
  xpGain: .7,   // V1.86.7 升級慢一點：所有經驗 ×0.7
  /* V1.86.4 新手手冊：一步一步帶玩家玩一遍，每完成一步給獎勵 */
  guide: [
    { k: 'hatch', icon: '🥚', t: '孵出你的幻獸', d: '一直點畫面上的蛋，把牠孵出來！', btn: null, coins: 50 },
    { k: 'feed', icon: '🍎', t: '餵牠吃東西', d: '按「餵食」，把食物拖到畫面上，牠會自己走過去吃', btn: '[data-act=feed]', coins: 60, inv: { food: 3 } },
    { k: 'play', icon: '⚽', t: '陪牠玩頂球', d: '按「玩耍」，球掉下來時點一下，讓牠把球頂進籃框', btn: '[data-act=play]', coins: 60 },
    { k: 'wash', icon: '🧼', t: '幫牠洗澡', d: '按「洗澡」，用手指在牠身上來回搓一搓', btn: '[data-act=wash]', coins: 60 },
    { k: 'plant', icon: '🌱', t: '去種田', d: '按「種田」，在空田上種下一顆種子，過幾小時就能收成', btn: '#bFarm', coins: 100, inv: { seeds: 3 } },
    { k: 'fish', icon: '🎣', t: '去釣魚', d: '按「釣魚」，按住蓄力拋竿，魚咬鉤時把牠拉上來', btn: '#bFish', coins: 100 },
    { k: 'train', icon: '💪', t: '做一次訓練', d: '按「訓練」，選一個項目練一練，牠會變得更強', btn: '#bTrain', coins: 120 },
    { k: 'adv', icon: '⚔️', t: '去冒險打贏一場', d: '按「冒險」，挑第 1 關，用衝撞、防禦打倒野怪', btn: '#bAdv', coins: 150, inv: { potion: 2 } },
    { k: 'dex', icon: '📖', t: '打開圖鑑看看', d: '按「圖鑑」，看看你養過的幻獸、魔王和能力資料', btn: '#bCodex', coins: 200, inv: { potion2: 1 } } ],                                   // V1.86 萬靈藥：戰鬥中解除點燃、凍傷、混亂、死亡宣告、冰凍
  /* V1.86 戰鬥天賦：少年期是弱化版（w）、成年期以後是完整版（f） */
  talents: {
    fire:  { name: '灼燒',     w: { chance: .2, turns: 2 }, f: { chance: .35, turns: 4 } },
    water: { name: '潮汐',     w: { chance: .35, heal: .05 }, f: { every: 2, heal: .08 } },
    leaf:  { name: '生生不息', w: { chance: .5 }, f: { chance: 1, regen: .15, turns: 2 } },
    earth: { name: '堅石之軀', w: { crit: .5 }, f: { crit: 1, ult: .35 } },
    bird:  { name: '乘風',     w: { first: .5 }, f: { first: 1, peck: .5 } },
    elec:  { name: '蓄電',     w: { need: 4, mult: 1.3 }, f: { need: 3, mult: 1.6 } },
    metal: { name: '越打越硬', w: { per: .05, max: 3 }, f: { per: .06, max: 5 } } },
  /* V1.86 魔王天賦（第幾關 → 天賦） */
  bossTal: { 5: ['shell'], 10: ['lava', 'ignite'], 15: ['bone'], 20: ['ghost', 'chant'], 25: ['reap'], 30: ['wing', 'firewind'], 35: ['scale'], 40: ['chill', 'icetide'] },
  bt: { shell: .7, lava: .06, ignite: .5, bone: { per: .08, max: 5, reflect: .5 }, ghost: .3, chant: { mult: 2, chance: .35, cd: 3 }, reap: { up: .8, drain: .3 },
    wing: .4, firewind: { dodge: 1 / 3, peck: .6 }, scale: { hits: 3, turns: 2, atk: 1.3, burn: .06 }, chill: { per: .06, max: .4 }, icetide: { every: 2, heal: .06 } },
  status: { burn: .04, frost: .04, para: { turns: 2, chance: .7 } },   // 點燃、凍傷：每回合掉最大 HP 的一點點，打完才會好（萬靈藥、火焰護盾可解）
  elite: { chance: .12, from: 3, hp: 1.3, atk: 1.1, reward: .5 },   // V1.86 精英野怪：偶爾出現，帶少年版天賦，打贏多一半獎勵             // 回復藥水：回復 50% 最大 HP（V1.40：20 → 40 金幣）
  superPotion: { price: 100, heal: 1 },                   // V1.40 超級藥水：戰鬥中回復全部 HP
  soup: { price: 120, hunger: 10, mood: 20, energy: 20 },   // V1.41 神秘婆婆熬製雞湯：飽食 +10、心情 +20、體力 +20，還會消除羈絆之力後的 2 小時休息
  goodSeed: { price: 8, fruitMin: 3, fruitMax: 4, powerChance: .08 },   // V1.73 優良種子 8% 多長 1 顆能力水果
  mysterySeed: { powerChance: .3, powerMin: 1, powerMax: 2 },   // （key 保留 mystery＝稀有種子）
  magicSeed: { min: 1, maxN: 2, miniDrop: .25 },   // V1.77 神奇種子：必定長出能力水果 1～2 顆；打贏大王必掉、小王 25%   // V1.73 稀有種子：只能冒險掉落（打王必掉），30% 長出能力水果
  powerDrop: { win: .1, seed: .08 },
  appleTree: { growHours: 3, max: 3 },
  berryBush: { growHours: 3, max: 4 },   // V1.83 院子的野莓叢：每 3 小時長 1 顆，最多 4 顆
  fishing: { bait: 5, bait2: 20, premiumX: 2.5, weight: [40, 20, 8, 3, 1], junk: { j_boot: 8, j_can: 8, chest: 5 }, energy: 4, minEnergy: 4, zapPerDay: 3, tideBar: .04, xp: 3, eatHunger: 10, eatEnergy: 5, eatStep: 5, cookX: 2, cookCost: 5 },   // V1.83 釣魚
  skills: { fossilLuck: .02, fossilAll: .05, digMin: 10, digMax: 30, gemChance: .25, fossilChance: .15, fossilDup: 30, birdPower: .15, powerMin: 20, powerMax: 50, amuletChance: .6, grow: 1.2, soupX: 1.5 },   // V1.83 生活技能（成年才有）
  chargeMult: 1.5,
  battleLen: { me: 2, wild: 1.7, mini: 2.1, big: 2.5, reward: 1.3, enrage: 1.2, aiHeal: .15 },   // V1.86 戰鬥耐打一點：雙方血量放大；王打到一半會狂暴   // V1.82 蓄力後下一擊 ×1.5（原本 ×2 太強）   // V1.76 院子的蘋果樹：每 3 小時長 1 顆（樹上＋地上最多 3 顆），熟了會掉下來，撿起來免費   // V1.73 能力水果商店不賣：冒險打贏 10% 掉 1 顆、打贏王必掉 1 顆；稀有種子打贏 8%、打王必掉        // 優良種子：收成多 1 顆，比較容易長出藍莓、草莓
  seedOdds: { normal: [['cranberry', .55], ['blueberry', .3], ['strawberry', .15]], good: [['cranberry', .3], ['blueberry', .4], ['strawberry', .3]], rare: [['cranberry', .2], ['blueberry', .3], ['strawberry', .5]] },   // V1.41 種子都是綜合：蔓越莓／藍莓／草莓
  train: { cost: 20, energy: -15, hunger: -10, clean: -8, minEnergy: 15, base: 10, perLv: 4,   // V1.41 訓練場：每次 20 金幣（器材＋場地費），達成目標才拿到經驗＝10＋等級×4
    kinds: { dodge: { name: '閃避訓練：躲避球', skill: 'dodge' }, rush: { name: '攻擊訓練：沙包連打', skill: 'attack' }, combo: { name: '攻擊訓練：組合拳', skill: 'attack' }, flash: { name: '攻擊訓練：靈光一閃', skill: 'attack' }, zen: { name: '防禦訓練：瀑布打坐', skill: 'defense' } } },
  ult: { power: 2.2 },
  stageX: { egg: 1, baby: 1, juvenile: 1, adolescent: 1.1, adult: 1.3, ascended: 1.5 },   // V1.43 進化階段加能力：幼年 ×1.0、成長 ×1.1、成年 ×1.3、高階 ×1.5（星耀覺醒再 ×2）
  trainBonus: { per: .02, max: .2 },   // V1.44：每次 +2%，每種 10 次練滿                       // V1.42 訓練成功一次 +1%，每種最多 +20%：閃避＝猜拳輸也可能閃開、攻擊＝攻擊力、防禦＝防禦力和血量
  bossCoins: { mini: 15, big: 30 },
  // V1.52 固定的小王／大王（照長相決定屬性）與專屬寶物
  bosses: { 5: { mon: '苔石巨人', route: 'earth', route2: 'forest', relic: 'mossHeart' }, 10: { mon: '熔岩犀', route: 'earth', route2: 'flame', relic: 'rhinoCharm' }, 15: { mon: '骷髏騎士', route: 'metal', route2: 'forest', relic: 'boneShield' },
    20: { mon: '巫師幽靈', route: 'elec', route2: 'earth', relic: 'ghostHat' }, 25: { mon: '小死神', route: 'elec', route2: 'metal', relic: 'reaperBlade' }, 30: { mon: '火鳳', route: 'bird', route2: 'flame', relic: 'phoenixFeather' },
    35: { mon: '赤龍', route: 'flame', route2: 'dragon', relic: 'dragonFang' }, 40: { mon: '冰龍', route: 'tide', route2: 'dragon', relic: 'iceScale' } },   // V1.53 王有雙屬性；龍＝全抗性
  // V1.54 王的專屬絕招：血量第一次掉到一半以下時，先預告一回合、下一回合施放（火鳳的浴火重生是倒下時觸發）
  bossUlt: { 5: { key: 'moss', name: '苔蘚再生', turns: 3, heal: .1, tip: '接下來 3 回合牠每回合會回血，趁現在全力攻擊！' },
    10: { key: 'charge', name: '熔岩衝鋒', mult: 2.2, tip: '下一回合會撞出超痛的一擊，而且一定點燃——快按「🛡️ 防禦」！', burn: true },
    15: { key: 'wall', name: '骸骨鐵壁', turns: 2, cut: .5, reflect: .3, tip: '2 回合內打牠只有一半傷害，還會反彈 30%——先防禦或喝藥水！' },
    20: { key: 'curse', name: '混亂詛咒', turns: 2, miss: .4, tip: '被詛咒的 2 回合內攻擊有 40% 會打空——可以先蓄力或防禦拖過去' },
    25: { key: 'doom', name: '死亡宣告', turns: 3, left: .01, tip: '倒數 3 回合後會被打到只剩一絲血——結束後馬上補血，不然靈魂收割會很痛！' },
    30: { key: 'rebirth', name: '浴火重生', hp: .3, tip: '火鳳倒下一次會用 30% 血量復活，要打倒兩次！' },
    35: { key: 'breath', name: '龍炎吐息', hits: 2, mult: 1.5, tip: '連續兩回合噴火，兩隻都會被燒到、猜拳也閃不掉——先喝藥水把血補高！', aoe: true },
    40: { key: 'zero', name: '絕對零度', mult: 1.7, tip: '會被冰凍 1 回合，接著吃 1.7 倍冰爆——先把血補高！' } },
  bossBuff: { hp: 1.05, atk: 1.05, skip: [10, 40] },
  // V1.55 屬性反擊技：成年期以後解鎖，每隻每場一次，會比敵人先出手
  counter: { stages: ['adult', 'ascended'],
    fire:  { name: '火焰護盾', icon: '🔥', text: '燒掉兩隻身上的點燃、凍傷、混亂、死亡宣告和冰凍，下一次受到的傷害減半' },
    water: { name: '治癒之泉', icon: '💧', text: '兩隻都回復 30% HP', heal: .3 },
    leaf:  { name: '森林守護', icon: '🌿', text: '兩隻接下來 3 回合，每回合回復 10% HP', turns: 3, heal: .1 },
    earth: { name: '大地壁壘', icon: '🪨', text: '這一回合兩隻受到的傷害只剩 30%', cut: .7 },
    bird:  { name: '疾之風',   icon: '🌪️', text: '兩隻接下來 2 回合閃避 +50%（猜拳輸了也可能閃開）', turns: 2, dodge: .5 },
    elec:  { name: '雷電麻痺', icon: '⚡', text: '敵人麻痺 2 回合，很容易動不了，王的絕招也會被打斷、延後' },
    metal: { name: '荊棘鐵甲', icon: '⚙️', text: '下一次被攻擊時，把 60% 的傷害反彈回去', reflect: .6 },
    none:  { name: '星光守護', icon: '⭐', text: '回復 20% HP，下一次受到的傷害減半', heal: .2 } },
  combo: { mult: 1.6 },   // 羈絆合擊：兩隻一起衝上去，各打一次 1.6 倍   // V1.55 其他六隻王再強一點
  relics: { repeatDrop: .1, sell: 999, slots: 2, items: {
    rhinoCharm:     { name: '犀角護符',   icon: '📿', boss: '熔岩犀',   def: .1,   text: '防禦 +10%' },
    reaperBlade:    { name: '死神鐮刃',   icon: '🌙', boss: '小死神',   crit: .1,  text: '會心一擊機率 +10%' },
    boneShield:     { name: '骷髏騎士盾', icon: '🛡️', boss: '骷髏騎士', cut: .1,   text: '受到的傷害 −10%' },
    iceScale:       { name: '冰龍鱗片',   icon: '💠', boss: '冰龍',     def: .2, hp: .2, dodge: .1, text: '防禦 +20%、血量 +20%、閃避 +10%' },
    mossHeart:      { name: '苔石之心',   icon: '💚', boss: '苔石巨人', regen: .15, text: '每回合回復 15% 血量' },
    phoenixFeather: { name: '不死鳥羽毛', icon: '🪶', boss: '火鳳',     revive: .4, text: '每場戰鬥倒下一次時，用 40% 血量復活' },
    dragonFang:     { name: '赤龍之牙',   icon: '🦷', boss: '赤龍',     atk: .2, hp: .2, text: '攻擊 +20%、血量 +20%' },
    ghostHat:       { name: '幽靈魔帽',   icon: '🎩', boss: '巫師幽靈', sp: .2,    text: '屬性技和大絕招的傷害 +20%' } } },
  foeHp: { normal: 1.3, mini: 1.5, big: 2 }, tower: { from: 31, hp: 1.8, atk: 1.3 },   // V1.44 野生怪血量；第 31～40 關「星之塔」更硬更痛
  heritage: { xp: 3, train: 2 },                             // V1.44 傳承之力：已經有星耀覺醒的夥伴，其他幻獸經驗 ×2、訓練成果 ×2
  eggPrice: [300, 700, 1000],
  foster: { price: 399 },                                   // V1.45 神秘老爺爺寄養：每隻付一次 399，之後隨時可以接回、再寄
  fusionHouse: { price: 1000 },                             // V1.45 血繼限界的特殊幻獸要先花 1000 佈置新的小屋                               // V1.44 迎接新的蛋：第 1 顆 300、第 2 顆 700、之後 1000                        // V1.42 打贏小王／大王額外金幣                                    // V1.40 大絕招：屬性技 2.2 倍，每場一次
  rps: { seconds: 2, win: 0, tie: .8, lose: 1.2 },          // 敵人出招前猜拳：贏＝躲開、平手 0.8 倍、輸或超時 1.2 倍
  bond: { seconds: 2, steps: [[0, 1], [20, 2.2], [22, 2.5], [25, 2.7], [28, 3]], cost: 10, restHours: 2 },   // 羈絆之力：2 秒內連打；20 下 2.2 倍、22 下 2.5、25 下 2.7、28 下以上 3 倍（中間按比例）。要花 10 金幣買加油棒，之後 2 小時要休息不能冒險
  ballGame: { lives: 3, max: 99, goalCap: 5, coinEvery: 3, coinMax: 10, xpPer: 3, xpMax: 30 },   // V1.64 每進一球 +3 經驗（一場最多 30）   // 頂球：3 條命一直玩到漏接 3 次；每 3 球 1 金幣（最多 10）；冒險路線最多算 5 球
  den: [ { name: '草叢小窩', cap: 1, cost: 0 }, { name: '稻草窩', cap: 2, cost: 120 }, { name: '樹根洞窟', cap: 3, cost: 300 }, { name: '大樹屋', cap: 4, cost: 600 }, { name: '燈籠樹屋', cap: 5, cost: 1000 }, { name: '旗幟樹屋', cap: 6, cost: 1500 }, { name: '星光樹屋', cap: 7, cost: 2200 } ],   // V1.45 最多 7 隻（每個屬性一隻）                            // 商店零食「星星糖」
  lounge: [ { name: '基本款', xpH: 0, cost: 0 }, { name: '大容量款', xpH: 3, cost: 400 }, { name: '豪華營養款', xpH: 6, cost: 1200 } ],   // V1.86.7 休息室的自動投餵機＋飲水機：免費，升級後休息的寵物每小時慢慢長經驗
  decorSlots: ['paper', 'wall', 'window', 'lamp', 'plant', 'bed', 'cushion', 'tower', 'rug', 'toy', 'toilet'],
  decor: {                                                                      // 房間家具：純裝飾，不影響數值
    paper_cream: { slot: 'paper', name: '奶油色壁紙', price: 0 },
    paper_mint:  { slot: 'paper', name: '薄荷色壁紙', price: 30 },
    paper_night: { slot: 'paper', name: '星空壁紙', price: 60 },
    wall_frame:  { slot: 'wall', name: '風景畫', price: 40 },
    wall_clock:  { slot: 'wall', name: '咕咕鐘', price: 45 },
    lamp_candle: { slot: 'lamp', name: '蠟燭燈', price: 15 },
    lamp_moon:   { slot: 'lamp', name: '月亮燈', price: 50 },
    plant_pot:   { slot: 'plant', name: '小盆栽', price: 20 },
    plant_flower:{ slot: 'plant', name: '向日葵花盆', price: 35 },
    bed_round:   { slot: 'bed', name: '小圓床', price: 0 },
    bed_straw:   { slot: 'bed', name: '稻草窩', price: 25 },
    bed_cloud:   { slot: 'bed', name: '雲朵床', price: 80 },
    rug_red:     { slot: 'rug', name: '紅色地毯', price: 30 },
    rug_star:    { slot: 'rug', name: '星星地毯', price: 60 },
    toy_ball:    { slot: 'toy', name: '彈力球', price: 15 },
    toy_block:   { slot: 'toy', name: '積木', price: 25 },
    toilet_pot:  { slot: 'toilet', name: '寵物馬桶', price: 150 },
    cushion_soft:{ slot: 'cushion', name: '軟墊', price: 40 },        // V1.86.7 遊戲間家具
    tower_cat:   { slot: 'tower', name: '貓跳台', price: 120 },
    window_low:  { slot: 'window', name: '矮窗', price: 60 }
  },
  start: { coins: 50, food: 3, seeds: 2, stat: 80, hunger: 60, mood: 55, clean: 70, energy: 80 },
  foods: {   // 食物：key＝背包欄位；left＝吃剩的東西（會發臭）；fav＝愛吃的屬性（心情 +10、經驗 +5）。V1.21 依玩家設定
    food:  { name: '蘋果', icon: 'apple', hunger: 10, mood: 0,  energy: 5,  xp: 3, price: 10, left: 'core', fav: [] },
    berry: { name: '莓果', icon: 'berry', hunger: 10, mood: 10, energy: 0,  xp: 3, price: 10, left: null,   fav: [] },
    fish:  { name: '烤魚', icon: 'fish',  hunger: 20, mood: 0,  energy: 20, xp: 5, price: 20, left: 'fbone', fav: ['tide', 'metal', 'forest'] },
    meat:  { name: '肉排', icon: 'meat',  hunger: 20, mood: 0,  energy: 20, xp: 5, price: 20, left: 'bone', fav: ['flame', 'elec', 'bird'] },
    dragon:  { name: '火龍果', icon: 'dragon',  power: true, hunger: 10, mood: 10, energy: 10, xp: 10, price: 30, left: 'dragon', el: 'flame', fav: [] },
    melonw:  { name: '西瓜',   icon: 'melonw',  power: true, hunger: 10, mood: 10, energy: 10, xp: 10, price: 30, left: 'melonw', el: 'tide', fav: [] },
    melon:   { name: '哈密瓜', icon: 'melon',   power: true, hunger: 10, mood: 10, energy: 10, xp: 10, price: 30, left: 'melon', el: 'forest', fav: [] },
    potato:  { name: '地瓜',   icon: 'potato',  power: true, hunger: 10, mood: 10, energy: 10, xp: 10, price: 30, left: 'potato', el: 'earth', fav: [] },
    nut:     { name: '堅果',   icon: 'nut',     power: true, hunger: 10, mood: 10, energy: 10, xp: 10, price: 30, left: 'nut', el: 'bird', fav: [] },
    coconut: { name: '椰子',   icon: 'coconut', power: true, hunger: 10, mood: 10, energy: 10, xp: 10, price: 30, left: 'coconut', el: 'metal', fav: [] },
    banana:  { name: '香蕉',   icon: 'banana',  power: true, hunger: 10, mood: 10, energy: 10, xp: 10, price: 30, left: 'banana', el: 'elec', fav: [] },
    cranberry:  { name: '蔓越莓', icon: 'cranberry',  farm: true, hunger: 10, mood: 5,  energy: 5, xp: 3, price: 15, left: null, fav: [] },   // V1.41 家園種出來的（商店不賣）
    blueberry:  { name: '藍莓',   icon: 'blueberry',  farm: true, hunger: 12, mood: 8,  energy: 5, xp: 4, price: 20, left: null, fav: [] },
    strawberry: { name: '草莓',   icon: 'strawberry', farm: true, hunger: 12, mood: 12, energy: 8, xp: 5, price: 30, left: null, fav: [] },
    cake:  { name: '蛋糕', icon: 'cake',  hunger: 10, mood: 20, energy: 10, xp: 5, price: 25, left: null,   fav: ['flame', 'tide', 'forest', 'earth', 'bird', 'elec', 'metal'] }
  },
  sellFruit: { food: 15, berry: 15, cranberry: 15, blueberry: 20, strawberry: 30 },
  freshBonus: { energy: 5 },               // 自己種的水果品質好：吃了體力再 +5
  runaway: { starveHours: 12, steps: 10000, back: { hunger: 40, mood: 35, clean: 40 }, bondLoss: 15 },   // 餓肚子（飽食 0）超過 12 小時就離家出走；走 1 萬步才找得回來
  washCost: 3,                              // 洗澡要付水費
  ballLife: 3, ballCost: 3,                 // 球每玩 3 次就會爆掉，換新球 3 金幣
  traitsOn: true,
  /* 7 個屬性的特性與弱點（rate＝狀態下降速度倍率；energyUp＝體力恢復倍率） */
  traits: {
    flame:  { good: '攻擊力較高', bad: '心情容易變差（要多摸摸、陪牠玩）', atk: 1.15, rate: { mood: 1.5 } },
    tide:   { good: '防禦力較高', bad: '肚子容易餓（要多餵食）', def: 1.15, rate: { hunger: 1.5 } },
    forest: { good: '體力恢復快', bad: '容易髒（要多洗澡）', energyUp: 1.3, rate: { clean: 1.5 } },
    bird:   { good: '戰鬥容易撿到種子、食量小好餵飽', bad: '體力恢復慢（要多休息）', seedChance: .6, feed: 1.3, energyUp: .7 },
    earth:  { good: '戰鬥容易撿到莓果', bad: '容易髒又洗不乾淨，洗澡水費 5 金幣', berryChance: .6, rate: { clean: 1.3 }, washCost: 5, washGain: .8 },
    metal:  { good: '戰鬥常拿到 1.5 倍金幣', bad: '容易分心，經驗只吸收 7 成', coinChance: .6, coinX: 1.5, xp: .7 },
    elec:   { good: '攻擊有機會讓對手麻痺一回合', bad: '一直在發電，體力恢復慢', stun: .25, energyUp: .8 }
  },      // 自己種出來的水果可以賣
  ember: { stage: 10, share: .7, oldCoins: 50 },   // V1.85 經驗火種：只有一個，第一次打倒第 10 關大王拿到；給一隻幻獸帶著，牠沒上場也分到 70% 經驗
  favBonus: { mood: 10, xp: 5 },
  powerBonus: { energy: 10, xp: 15 },
  // V1.71 想吃的水果：每 3 小時隨機換一種（一半機率挑背包裡有的），頭上會冒泡泡；剛好餵到 → 飽食、心情、體力、親密度、經驗都加更多
  crave: { fruits: ['food', 'berry', 'dragon', 'melonw', 'melon', 'potato', 'nut', 'coconut', 'banana', 'cranberry', 'blueberry', 'strawberry'], hours: 3, cooldownHours: 3, ownedChance: .5,
    bonus: { hunger: 10, mood: 15, energy: 10, bond: 3, xp: 10 } },     // 剛好餵到想吃的；能力水果另外再加 powerBonus
  /* 進化到高階必備的素材：打贏該屬性區域的 Boss 掉落（第一次必掉，之後 35%） */
  materials: { flame: '火種源', tide: '波賽頓水晶', forest: '精靈石', earth: '地核項鍊', bird: '彩色羽毛', metal: '古代金幣', elec: 'X元素電池' },
  matDrop: .35
};
const ROUTES = ['flame', 'tide', 'forest', 'earth', 'bird', 'elec', 'metal'];
const ROUTE_EVENT = { flame: 'volcano', tide: 'moonspring', forest: 'oldtree', earth: 'canyon', bird: 'skypeak', elec: 'thunder', metal: 'mine' };
const STAGES = ['egg', 'baby', 'juvenile', 'adolescent', 'adult', 'ascended'];

/* ---------------- 小工具 ---------------- */
const clamp = (x, a = 0, b = 100) => Math.max(a, Math.min(b, x));
const num = (v, d, a, b) => { v = Number(v); return Number.isFinite(v) ? clamp(v, a, b) : d; };
const int = (v, d, a, b) => Math.floor(num(v, d, a, b));
const chars = t => Array.from(String(t));
const H = 3600000, MIN = 60000;
function dayKey(ts, tz = CONFIG.tz) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ts); }
  catch (e) { const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
}
function hourIn(ts, tz = CONFIG.tz) {
  try { return +new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(ts); }
  catch (e) { return new Date(ts).getHours(); }
}

const MAX_LV = 30, XPK = 7.5;   // V1.44 等級上限 Lv.30（練滿）；升級曲線：需要經驗＝7.5×(等級−1)²（原本 8）
const level = xp => Math.min(MAX_LV, 1 + Math.floor(Math.sqrt(Math.max(0, xp) / XPK)));
const lvBase = L => L <= 1 ? 0 : Math.ceil(XPK * (L - 1) * (L - 1));   // V1.75 第 L 級的起點經驗
const toNextLv = xp => { const L = level(xp); return L >= MAX_LV ? 0 : Math.max(1, Math.ceil(XPK * L * L) - xp); };   // V1.65 升下一級還差多少經驗   // 顯示與戰鬥用等級，由總 XP 推算

/* ---------------- 物種基因（V1.4 起；順序不可更改） ---------------- */
function rng(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const G_SIDE = ['nubs', 'horns', 'leaves', 'ears', 'bunny', 'none'], G_TOP = ['none', 'none', 'antenna', 'flower', 'crest', 'tuft'],
  G_TAIL = ['small', 'fluffy', 'fin', 'leaf', 'flame', 'none'], G_PAT = ['none', 'none', 'spots', 'stripes', 'belly'], G_EYE = ['open', 'big'];
function makeGenome(seed) {
  const r = rng(seed), pick = a => a[Math.floor(r() * a.length)];
  const q = r(), rarity = q < .05 ? 3 : q < .25 ? 2 : 1, hue = Math.floor(r() * 360);
  const G = { seed, rarity, hue, sat: 45 + Math.floor(r() * 30), acc: (hue + 140 + Math.floor(r() * 80)) % 360, bh: (hue + Math.floor(r() * 60) - 30 + 360) % 360,
    rx: 10 + Math.floor(r() * 3), ry: 9 + Math.floor(r() * 3), side: pick(G_SIDE), top: pick(G_TOP), tail: pick(G_TAIL), pattern: pick(G_PAT), eyes: pick(G_EYE), wings: r() < .15 };
  if (rarity >= 2 && G.pattern === 'none') G.pattern = ['spots', 'stripes', 'belly'][Math.floor(r() * 3)];
  G.el = EL_LIST[Math.floor(rng((seed ^ 0x5bd1e995) >>> 0)() * EL_LIST.length)];   // V1.12：蛋的屬性（另一組亂數，不影響外觀）
  return G;
}
const EL_LIST = ['flame', 'tide', 'forest', 'earth', 'bird', 'elec', 'metal'];
const CLASSIC_G = { rarity: 1, hue: 168, sat: 45, acc: 42, bh: 130, rx: 11, ry: 10, side: 'nubs', top: 'none', tail: 'small', pattern: 'none', eyes: 'open', wings: false, el: 'tide' };
function encodeGenome(G) { return [G.rarity, G.hue, G.sat, G.acc, G.bh, G.rx, G.ry, G_SIDE.indexOf(G.side), G_TOP.indexOf(G.top), G_TAIL.indexOf(G.tail), G_PAT.indexOf(G.pattern), G_EYE.indexOf(G.eyes), G.wings ? 1 : 0, Math.max(0, EL_LIST.indexOf(G.el))].join('.'); }
const G_LIM = [[1, 3], [0, 359], [30, 90], [0, 359], [0, 359], [9, 13], [8, 12], [0, 5], [0, 5], [0, 5], [0, 4], [0, 1], [0, 1], [0, 6]];
function decodeGenome(c) {
  const a = String(c).split('.').map(Number);
  if ((a.length !== 13 && a.length !== 14) || a.some((v, i) => !Number.isInteger(v) || v < G_LIM[i][0] || v > G_LIM[i][1])) return null;
  let el = EL_LIST[a[13]]; if (a.length === 13) { let h = 0; for (const ch of String(c)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; el = EL_LIST[h % EL_LIST.length]; }   // V1.11 以前的 13 碼基因：用雜湊決定屬性
  return { rarity: a[0], hue: a[1], sat: a[2], acc: a[3], bh: a[4], rx: a[5], ry: a[6], side: G_SIDE[a[7]], top: G_TOP[a[8]], tail: G_TAIL[a[9]], pattern: G_PAT[a[10]], eyes: G_EYE[a[11]], wings: !!a[12], el };
}
function breedGenome(A, B, r = Math.random) {
  const pick = (a, b) => r() < .5 ? a : b, mut = .08, any = arr => arr[Math.floor(r() * arr.length)];
  const d = ((B.hue - A.hue + 540) % 360) - 180;
  const G = { rarity: 1, hue: r() < mut ? Math.floor(r() * 360) : (r() < .35 ? Math.round((A.hue + d / 2 + 360) % 360) % 360 : pick(A.hue, B.hue)),
    sat: Math.round(clamp(pick(A.sat, B.sat) + (r() - .5) * 10, 40, 80)), acc: pick(A.acc, B.acc), bh: pick(A.bh, B.bh), rx: pick(A.rx, B.rx), ry: pick(A.ry, B.ry),
    side: r() < mut ? any(G_SIDE) : pick(A.side, B.side), top: r() < mut ? any(G_TOP) : pick(A.top, B.top), tail: r() < mut ? any(G_TAIL) : pick(A.tail, B.tail),
    pattern: r() < mut ? any(G_PAT) : pick(A.pattern, B.pattern), eyes: pick(A.eyes, B.eyes), wings: r() < mut ? r() < .5 : pick(A.wings, B.wings) };
  G.el = r() < .05 ? any(EL_LIST) : pick(A.el || 'tide', B.el || 'tide');   // 繼承爸爸或媽媽的屬性，5% 突變
  const best = Math.max(A.rarity, B.rarity), q = r();
  G.rarity = q < (best === 3 ? .15 : best === 2 ? .08 : .05) ? 3 : q < (best >= 2 ? .45 : .25) ? 2 : 1;
  if (G.rarity >= 2 && G.pattern === 'none') G.pattern = any(['spots', 'stripes', 'belly']);
  return G;
}
const GCACHE = {};
function genomeOfSeed(seed) { return GCACHE[seed] || (GCACHE[seed] = makeGenome(seed)); }
/* 玩過的屬性（圖鑑裡孵過的）：新蛋優先給還沒玩過的屬性，7 個都玩過才隨機 */
function playedRoutes(st) { const s = new Set(); for (const d of st.dex || []) if (d.route) s.add(d.route); if (st.hatched && st.route) s.add(st.route); return [...s]; }
function unplayedRoutes(st) { const p = playedRoutes(st); const u = EL_LIST.filter(e => !p.includes(e)); return u.length ? u : EL_LIST.slice(); }
function seedForEl(el, r = Math.random) { for (let i = 0; i < 2000; i++) { const sd = Math.floor(r() * 4294967296) >>> 0; if (genomeOfSeed(sd).el === el) return sd; } return null; }
function sexOfId(id) { let h = 2166136261; for (const c of String(id)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h % 2 ? 'm' : 'f'; }
function gidOf(st) { return st.genes ? 'x:' + st.genes : (st.seed === null || st.seed === undefined ? 'classic' : 'g:' + st.seed); }
function genomeFromId(id) {
  if (id === 'classic') return CLASSIC_G;
  if (/^g:\d+$/.test(id)) return genomeOfSeed(+id.slice(2));
  if (/^x:/.test(id)) return decodeGenome(id.slice(2)) || CLASSIC_G;
  return CLASSIC_G;
}
function okId(id) { return typeof id === 'string' && (id === 'classic' || /^g:\d+$/.test(id) || (/^x:[\d.]+$/.test(id) && !!decodeGenome(id.slice(2)))); }
/* 角色外觀代碼：juv / teen / flame|tide|forest / asc-<路線> */
function formCode(stage, route) {
  if (stage === 'adolescent') return route ? 'teen-' + route : 'teen';
  if (stage === 'baby') return route ? 'baby-' + route : 'baby';
  if (stage === 'juvenile' && route) return 'juv-' + route;
  if (stage === 'adult' && route) return route;
  if (stage === 'ascended' && route) return 'asc-' + route;
  return 'juv';
}

/* ---------------- 存檔：初始值、檢查、遷移 ---------------- */
function newSeed() { try { return (globalThis.crypto || require('crypto').webcrypto).getRandomValues(new Uint32Array(1))[0]; } catch (e) { return Math.floor(Math.random() * 4294967295); } }
/* V1.86.5 預設名字：菜市場名，每次孵蛋隨機一個 */
const PET_NAMES = ['小黃', '小白', '小黑', '小花', '阿福', '旺財', '球球', '豆豆', '咪咪', '胖胖', '小美', '阿弟', '妞妞', '毛毛', '來福', '皮皮', '小乖', '寶寶', '多多', '丸子'];
function fresh(now = Date.now()) {
  const S = CONFIG.start;
  return { v: 7, rev: 0, seed: newSeed(), genes: null, sex: null, name: PET_NAMES[Math.floor(Math.random() * PET_NAMES.length)], hatched: false, eggTaps: 0, stage: 'egg', route: null,
    xp: 0, coins: S.coins, hunger: S.hunger, mood: S.mood, clean: S.clean, energy: S.energy, bond: 0, sleeping: false,
    path: { flame: 0, tide: 0, forest: 0, earth: 0, bird: 0, elec: 0, metal: 0 }, bondUses: 0, cleanups: 0,
    care: { petLastRewardAt: 0, bathLastAt: 0, playXpAt: [], gatherAt: 0 },
    inv: Object.assign({ food: S.food, seeds: S.seeds, seeds2: 0, seeds3: 0, seeds4: 0, candy: 0, potion: 1, potion2: 0, soup: 0, ember: 0, shards: 0, hearts: 0, relics: {}, fresh: { food: 0, berry: 0, cranberry: 0, blueberry: 0, strawberry: 0 }, mats: {} }, ...Object.keys(CONFIG.foods).filter(k => k !== 'food').map(k => ({ [k]: 0 }))), harvests: 0, trainLog: { dodge: 0, attack: 0, defense: 0 }, trains: 0,
    plots: Array.from({ length: CONFIG.farm.plots }, () => ({ at: 0 })),
    goals: { date: '', list: [] }, goalLv: 0,
    decor: { owned: ['paper_cream', 'bed_round'], placed: { paper: 'paper_cream', bed: 'bed_round' } }, lounge: { lv: 1, at: 0, decor: { placed: { paper: 'paper_cream' }, pos: {}, flip: {} } }, view: 'yard', digest: [], toiletUses: 0, starveSince: 0, runaway: null, bondRestUntil: 0, ballUses: 0, ballBroken: false,
    cores: [], ball: { best: 0, goals: 0 }, den: { level: 1 }, roster: [], pair: null, owner: '', loveNest: false, loveAt: 0, piggy: 0, pigCores: [], pigBought: false, relics: [], relicGot: [], eggBuys: 0, foster: [], fusionHouse: false, fosterPaid: false, trials: {}, washes: 0, earthWins: 0, matGot: {}, ascBase: null, awake: false,
    events: { volcano: false, moonspring: false, oldtree: false, canyon: false, skypeak: false, thunder: false, mine: false },
    daily: { date: '', adv: 0, gift: false },
    steps: { days: {}, total: 0, rem: 0, forestRem: 0 },
    adv: { stage: 1, wins: 0, losses: 0 },
    dex: [], eggs: [], breedAt: 0, journal: [],
    created: now, hatchedAt: 0, lastTick: now, updated: now, clockWarn: 0, lastExport: 0,
    settings: { sound: true, reducedMotion: false, light: true } };
}
const OLD_ROUTE = { ember: 'flame', mist: 'tide', sylvan: 'forest' };
function sanitize(o, now = Date.now()) {
  const r = fresh(now);
  if (!o || typeof o !== 'object') return r;
  const legacy = !(Number(o.v) >= 6);
  r.rev = int(o.rev, 0, 0, 1e12);
  r.hatched = !!o.hatched;
  const sd = Number(o.seed);
  r.seed = Number.isInteger(sd) && sd >= 0 && sd <= 4294967295 ? sd : (r.hatched ? null : r.seed);
  r.genes = typeof o.genes === 'string' && decodeGenome(o.genes) ? o.genes : null;
  if (typeof o.name === 'string') { const n = chars(o.name.trim()).slice(0, 10).join(''); if (n) r.name = n; }
  r.sex = o.sex === 'm' || o.sex === 'f' ? o.sex : sexOfId(gidOf(r));   // 性別：舊存檔用基因決定（每隻固定）
  r.eggTaps = int(o.eggTaps, 0, 0, 4);
  // 經驗值：V1.x 是「目前等級內的 XP」，V1.6 起改為累積總 XP
  if (legacy) { const lv = int(o.level, 1, 1, 99); let tot = int(o.xp, 0, 0, 1e7); for (let l = 1; l < lv; l++) tot += l * 50; r.xp = tot; }
  else r.xp = int(o.xp, 0, 0, 1e9);
  r.coins = int(o.coins, legacy ? 20 : CONFIG.start.coins, 0, 1e9);
  for (const k of ['hunger', 'mood', 'clean', 'energy']) r[k] = num(o[k], r[k], 0, 100);
  r.bond = num(o.bond, 0, 0, 100);
  r.sleeping = r.hatched && o.sleeping === true;
  const route = ROUTES.includes(o.route) ? o.route : OLD_ROUTE[o.route] || null;
  r.route = route;
  if (!r.hatched) { r.stage = 'egg'; r.route = null; r.xp = 0; }
  else if (!legacy && STAGES.includes(o.stage) && o.stage !== 'egg') r.stage = o.stage;
  else r.stage = route ? 'adult' : 'juvenile';                 // 舊版已進化的視為成年
  // 已孵化但還沒有屬性的舊存檔：等路線點數讀完後再決定（見下方）
  const pa = o.path && typeof o.path === 'object' ? o.path : null;
  if (pa) for (const k of ROUTES) r.path[k] = int(pa[k], 0, 0, 1e7);
  else if (legacy && o.care && typeof o.care === 'object') {   // 舊版照顧次數 → 路線點數（近似）
    r.path.tide = int(o.care.feed, 0, 0, 1e6) + 2 * int(o.care.pet, 0, 0, 1e6);
    r.path.flame = 5 * int(o.adv && o.adv.wins, 0, 0, 1e6);
  }
  const c = o.care && typeof o.care === 'object' ? o.care : {};
  r.care.petLastRewardAt = num(c.petLastRewardAt, 0, 0, now); r.care.bathLastAt = num(c.bathLastAt, 0, 0, now); r.care.gatherAt = num(c.gatherAt, 0, 0, now);
  r.care.playXpAt = Array.isArray(c.playXpAt) ? c.playXpAt.map(Number).filter(t => Number.isFinite(t) && t <= now && now - t < CONFIG.play.xpWindowMin * MIN).slice(-10) : [];
  const iv = o.inv && typeof o.inv === 'object' ? o.inv : {};
  r.inv.food = int(iv.food, CONFIG.start.food, 0, 9999); r.inv.seeds = int(iv.seeds, CONFIG.start.seeds, 0, 9999); r.inv.candy = int(iv.candy, 0, 0, 9999); r.inv.potion = int(iv.potion, 1, 0, 9999); r.inv.seeds2 = int(iv.seeds2, 0, 0, 9999); r.inv.seeds3 = int(iv.seeds3, 0, 0, 9999); r.inv.seeds4 = int(iv.seeds4, 0, 0, 9999); r.inv.potion2 = int(iv.potion2, 0, 0, 9999); r.inv.elixir = int(iv.elixir, 0, 0, 9999); r.inv.soup = int(iv.soup, 0, 0, 9999);
  for (const k of [...Object.keys(CONFIG.foods).filter(k => k !== 'food'), 'ember', 'shards', 'hearts']) r.inv[k] = int(iv[k], 0, 0, 9999);
  const mt = iv.mats && typeof iv.mats === 'object' ? iv.mats : {}; r.inv.mats = {}; for (const el of ROUTES) r.inv.mats[el] = int(mt[el], 0, 0, 99);
  const fr = iv.fresh && typeof iv.fresh === 'object' ? iv.fresh : {}; r.inv.fresh = {}; for (const k of FRESH_KEYS) r.inv.fresh[k] = Math.min(int(fr[k], 0, 0, 9999), r.inv[k] || 0);   // 自己種的、還沒賣的水果數
  const dc = o.decor && typeof o.decor === 'object' ? o.decor : {};
  if (Array.isArray(dc.owned)) r.decor.owned = [...new Set(['paper_cream', 'bed_round', ...dc.owned.filter(id => CONFIG.decor[id])])];
  if (dc.placed && typeof dc.placed === 'object') { r.decor.placed = { paper: 'paper_cream' }; for (const sl of CONFIG.decorSlots) { const id = dc.placed[sl]; if (id && CONFIG.decor[id] && CONFIG.decor[id].slot === sl && r.decor.owned.includes(id)) r.decor.placed[sl] = id; } }
  if (!(Number(o.v) >= 7) && !r.decor.placed.bed) r.decor.placed.bed = 'bed_round';
  r.decor.pos = {}; if (dc.pos && typeof dc.pos === 'object') for (const k of ['wall', 'window', 'cushion', 'tower', 'toilet', 'toy', 'dresser', 'plant', 'rug', 'bed', 'bed2', 'pig']) { const v = dc.pos[k]; if (Array.isArray(v) && v.length === 2 && v.every(n => Number.isFinite(n) && Math.abs(n) <= 200)) r.decor.pos[k] = [Math.round(v[0]), Math.round(v[1])]; }
  r.decor.flip = {}; if (dc.flip && typeof dc.flip === 'object') for (const k of ['wall', 'window', 'cushion', 'tower', 'toilet', 'toy', 'dresser', 'plant', 'rug', 'bed', 'bed2', 'pig']) if (dc.flip[k]) r.decor.flip[k] = 1;   // V1.83 家具鏡像   // V1.51 自由佈置的家具位置
  { const b2 = dc.placed && dc.placed.bed2; if (b2 && CONFIG.decor[b2] && CONFIG.decor[b2].slot === 'bed' && r.decor.owned.includes(b2)) r.decor.placed.bed2 = b2; }   // 右邊第二張床   // 舊存檔：送一張小圓床
  { const lo = o.lounge && typeof o.lounge === 'object' ? o.lounge : {}, ld = lo.decor && typeof lo.decor === 'object' ? lo.decor : {}, K = ['wall', 'window', 'cushion', 'tower', 'toilet', 'toy', 'dresser', 'plant', 'rug', 'bed', 'bed2', 'feeder', 'water'];
    r.lounge = { lv: int(lo.lv, 1, 1, CONFIG.lounge.length), at: num(lo.at, now, 0, 9e15), decor: { placed: { paper: 'paper_cream' }, pos: {}, flip: {} } };
    if (ld.placed && typeof ld.placed === 'object') for (const sl of [...CONFIG.decorSlots, 'bed2']) { const id = ld.placed[sl], it = CONFIG.decor[id]; if (it && (it.slot === sl || (sl === 'bed2' && it.slot === 'bed')) && r.decor.owned.includes(id)) r.lounge.decor.placed[sl] = id; }
    if (ld.pos && typeof ld.pos === 'object') for (const k of K) { const v = ld.pos[k]; if (Array.isArray(v) && v.length === 2 && v.every(n => Number.isFinite(n) && Math.abs(n) <= 200)) r.lounge.decor.pos[k] = [Math.round(v[0]), Math.round(v[1])]; }
    if (ld.flip && typeof ld.flip === 'object') for (const k of K) if (ld.flip[k]) r.lounge.decor.flip[k] = 1; }   // V1.86.7 休息室：自己的家具擺法＋投餵機等級
  r.view = ['room', 'lounge'].includes(o.view) ? o.view : 'yard';
  r.digest = Array.isArray(o.digest) ? o.digest.map(Number).filter(Number.isFinite).slice(0, 10) : [];
  r.toiletUses = int(o.toiletUses, 0, 0, 1e7); r.starveSince = num(o.starveSince, 0, 0, 9e15); r.runaway = o.runaway && typeof o.runaway === 'object' ? { at: num(o.runaway.at, 0, 0, 9e15), got: int(o.runaway.got, 0, 0, 1e7) } : null; r.bondRestUntil = num(o.bondRestUntil, 0, 0, 9e15); r.ballUses = int(o.ballUses, 0, 0, CONFIG.ballLife - 1); r.ballBroken = o.ballBroken === true;
  r.cores = Array.isArray(o.cores) ? o.cores.filter(c => c && typeof c === 'object').slice(-CONFIG.core.max).map(c => ({ x: num(c.x, 64, 4, 124), at: num(c.at, now, 0, 9e15), v: ['room', 'lounge'].includes(c.v) ? c.v : 'yard', k: CORE_KINDS.includes(c.k) ? c.k : 'core' })) : [];   // V1.86.6 肉骨頭、魚骨存檔後不會變成果核
  const bl = o.ball && typeof o.ball === 'object' ? o.ball : {}; r.ball = { best: int(bl.best, 0, 0, 99), goals: int(bl.goals, 0, 0, 1e7) };
  r.den = { level: int(o.den && o.den.level, 1, 1, CONFIG.den.length) };
  r.roster = Array.isArray(o.roster) ? o.roster.filter(p => p && typeof p === 'object' && p.hatched).slice(0, CONFIG.den.length - 1).map(p => sanitizePet(p, now)) : [];
  r.foster = Array.isArray(o.foster) ? o.foster.filter(p => p && typeof p === "object" && p.hatched).slice(0, 60).map(p => sanitizePet(p, now)) : [];
  r.pair = o.pair && typeof o.pair === 'object' && o.pair.hatched && r.hatched ? sanitizePet(o.pair, now) : null;
  if (r.pair && r.roster.length > CONFIG.den.length - 2) r.roster.length = CONFIG.den.length - 2;
  r.owner = typeof o.owner === 'string' ? o.owner.replace(/[<>&"]/g, '').trim().slice(0, 12) : '';
  { const RI = CONFIG.relics.items, iv = o.inv && o.inv.relics && typeof o.inv.relics === 'object' ? o.inv.relics : {}; r.inv.relics = {}; for (const k in RI) { const n = int(iv[k], 0, 0, 999); if (n) r.inv.relics[k] = n; }
    r.relics = Array.isArray(o.relics) ? [...new Set(o.relics.filter(k => RI[k]))].slice(0, CONFIG.relics.slots) : []; r.relicGot = Array.isArray(o.relicGot) ? [...new Set(o.relicGot.filter(n => CONFIG.bosses[n]))] : []; }
  r.piggy = num(o.piggy, 0, 0, 1e5); r.pigCores = Array.isArray(o.pigCores) ? [...new Set(o.pigCores.filter(n => CONFIG.piggy.coreStages.includes(n)))] : []; r.pigBought = o.pigBought === true; r.eggBuys = int(o.eggBuys, 0, 0, 999); r.fosterPaid = o.fosterPaid === true; r.fusionHouse = o.fusionHouse === true;
  r.awake = o.awake === true && r.stage === 'ascended';
  r.washes = int(o.washes, 0, 0, 1e7); r.earthWins = int(o.earthWins, 0, 0, 1e7);
  r.tree = o.tree && typeof o.tree === 'object' ? { n: int(o.tree.n, 0, 0, CONFIG.appleTree.max), ground: int(o.tree.ground, 0, 0, CONFIG.appleTree.max), at: num(o.tree.at, now, 0, now) } : { n: 0, ground: 0, at: now };
  { const F = o.fish && typeof o.fish === 'object' ? o.fish : {}, cnt = m => { const q = {}; if (m && typeof m === 'object') for (const k in m) if ((FISH[k] || JUNK[k]) && Number.isFinite(+m[k]) && +m[k] > 0) q[k] = int(m[k], 0, 0, 9999); return q; };   // V1.83 釣魚
    r.fish = { rods: Array.isArray(F.rods) ? F.rods.filter(k => RODS.some(x => x.id === k)) : undefined, rod: RODS.some(x => x.id === F.rod) ? F.rod : 'bamboo', bait: int(F.bait, 0, 0, 9999), bait2: int(F.bait2, 0, 0, 9999), raw: cnt(F.raw), cooked: cnt(F.cooked), dex: cnt(F.dex), junk: cnt(F.junk), zap: Array.isArray(F.zap) && typeof F.zap[0] === 'string' ? [F.zap[0], int(F.zap[1], 0, 0, 99)] : ['', 0] }; }
  { const L = o.loot && typeof o.loot === 'object' ? o.loot : {}; r.loot = { fossils: {} }; for (const k in GOODS) r.loot[k] = int(L[k], 0, 0, 9999); if (L.fossils && typeof L.fossils === 'object') for (const k in FOSSILS) if (L.fossils[k]) r.loot.fossils[k] = 1; }
  r.bush = { at: o.bush && typeof o.bush === 'object' ? num(o.bush.at, now, 0, now) : now };
  { const S = o.stats && typeof o.stats === 'object' ? o.stats : {}, n0 = v => Math.max(0, Math.floor(+v || 0)), obj = (m, keys) => { const q = {}; if (m && typeof m === 'object') for (const k in m) if (!keys || keys.includes(k)) q[k] = n0(m[k]); return q; };   // V1.84 遊戲紀錄
    r.stats = { seeded: S.seeded ? 1 : 0, first: num(S.first, 0, 0, now), play: n0(S.play), days: n0(S.days), streak: n0(S.streak), best: n0(S.best), star5: n0(S.star5), lastDay: typeof S.lastDay === 'string' ? S.lastDay.slice(0, 10) : '', earn: obj(S.earn, Object.keys(EARN_NAME)), spend: obj(S.spend, Object.keys(SPEND_NAME)), cnt: obj(S.cnt, STAT_KEYS),
      today: S.today && typeof S.today.d === 'string' ? { d: S.today.d.slice(0, 10), ms: n0(S.today.ms) } : {}, wk: S.wk && typeof S.wk.key === 'string' ? { key: S.wk.key.slice(0, 10), base: obj(S.wk.base) } : {}, recap: S.recap && typeof S.recap.week === 'string' ? { week: S.recap.week.slice(0, 10), d: obj(S.recap.d), seen: !!S.recap.seen } : null };
    if (!r.stats.first) delete r.stats.first;
    r.badges = {}; if (o.badges && typeof o.badges === 'object') for (const k in o.badges) if (BADGE[k]) r.badges[k] = num(o.badges[k], now, 0, now); }
  { const T = o.trainLv && typeof o.trainLv === 'object' ? o.trainLv : {}; r.trainLv = {}; for (const k of ['zen', 'flash', 'rush', 'combo', 'dodge', 'ball']) if (T[k]) r.trainLv[k] = int(T[k], 0, 0, 10); }   // V1.85 訓練階段
  r.emberOwned = !!o.emberOwned || (r.adv && r.adv.stage > CONFIG.ember.stage); r.emberOn = Number.isFinite(+o.emberOn) && o.emberOn !== null && o.emberOn !== '' ? +o.emberOn : null;
  if (r.inv.ember > 0) { r.emberOwned = true; r.coins += r.inv.ember * CONFIG.ember.oldCoins; r.emberRefund = (r.emberRefund || 0) + r.inv.ember; r.inv.ember = 0; }   // 舊的經驗火種：保留一個，多的換成金幣
  r.guide = { i: int(o.guide && o.guide.i, 0, 0, 99), off: !!(o.guide && o.guide.off) }; r.tipsSeen = {}; if (o.tipsSeen && typeof o.tipsSeen === 'object') for (const k of ['farm', 'fish', 'train', 'adv']) if (o.tipsSeen[k]) r.tipsSeen[k] = 1;
  r.bossDex = {}; if (o.bossDex && typeof o.bossDex === 'object') for (const k in CONFIG.bosses) { const v = o.bossDex[k]; if (v && typeof v === 'object') r.bossDex[k] = { s: v.s ? 1 : 0, l: v.l ? 1 : 0, w: v.w ? 1 : 0, at: num(v.at, 0, 0, now) }; }   // V1.86 魔王圖鑑：遇過／輸過／打贏
  r.skillDay = typeof o.skillDay === 'string' ? o.skillDay.slice(0, 10) : '';
  r.yard = {}; if (o.yard && typeof o.yard === 'object') for (const k of ['den', 'nest', 'tree1', 'tree2', 'bush', 'path', 'pond', 'plots', 'gen', 'fire']) { const v = o.yard[k]; if (Array.isArray(v) && (v.length === 3 || v.length === 4) && v.every(Number.isFinite)) r.yard[k] = [Math.max(-130, Math.min(130, Math.round(v[0]))), Math.max(-80, Math.min(80, Math.round(v[1]))), Math.max(.5, Math.min(1.8, Math.round(v[2] * 10) / 10)), v[3] ? 1 : 0]; }   // V1.82 院子佈置：位移與大小
  r.seen = {}; if (o.seen && typeof o.seen === 'object') for (const k in o.seen) if (/^[a-zA-Z0-9_]{1,30}$/.test(k) && o.seen[k]) r.seen[k] = 1;   // V1.74 圖鑑：拿到過的東西
  r.crave = o.crave && typeof o.crave === 'object' ? { kind: CONFIG.foods[o.crave.kind] ? o.crave.kind : null, until: num(o.crave.until, 0, 0, now + 24 * H) } : null;   // 想吃的水果（含冷卻）也要存
  r.matGot = {}; if (o.matGot && typeof o.matGot === 'object') for (const k of ROUTES) if (Array.isArray(o.matGot[k])) r.matGot[k] = o.matGot[k].filter(n => [10, 20, 30, 40].includes(n)).slice(0, 4);
  r.ascBase = o.ascBase && typeof o.ascBase === 'object' ? Object.fromEntries(Object.keys(COUNTER_TEXT).map(k => [k, num(o.ascBase[k], 0, 0, 1e9)])) : null;
  r.trials = {}; for (const k of ROUTES) if ((o.trials && o.trials[k] === true) || (k !== 'tide' && o.events && o.events[ROUTE_EVENT[k]] === true)) r.trials[k] = true;   // 舊存檔：以前打過的屬性事件算通過試煉
  r.loveNest = o.loveNest === true; r.loveAt = num(o.loveAt, 0, 0, 9e15); r.nestUntil = num(o.nestUntil, 0, 0, 9e15);
  r.loveEgg = o.loveEgg && okId(o.loveEgg.id) ? { id: o.loveEgg.id, from: typeof o.loveEgg.from === 'string' ? chars(o.loveEgg.from).slice(0, 40).join('') : '', end: num(o.loveEgg.end, now, 0, 9e15), names: typeof o.loveEgg.names === 'string' ? chars(o.loveEgg.names).slice(0, 40).join('') : '', away: o.loveEgg.away ? 1 : 0 } : null;
  r.loveNote = typeof o.loveNote === 'string' ? chars(o.loveNote).slice(0, 80).join('') : '';
  r.harvests = int(o.harvests, 0, 0, 1e7); r.bondUses = int(o.bondUses, 0, 0, 1e7); r.cleanups = int(o.cleanups, 0, 0, 1e7); r.trains = int(o.trains, 0, 0, 1e7); { const tl = o.trainLog && typeof o.trainLog === 'object' ? o.trainLog : {}; r.trainLog = { dodge: int(tl.dodge, 0, 0, 1e7), attack: int(tl.attack, 0, 0, 1e7), defense: int(tl.defense, 0, 0, 1e7) }; }
  if (Array.isArray(o.plots)) r.plots = Array.from({ length: Math.max(CONFIG.farm.plots, Math.min(CONFIG.farm.maxPlots, o.plots.length)) }, (_, i) => ({ at: num(o.plots[i] && o.plots[i].at, 0, 0, 9e15), k: o.plots[i] && PLOT_KINDS.includes(o.plots[i].k) ? o.plots[i].k : 'food', ...(o.plots[i] && o.plots[i].g ? { g: [1, 2, 3].includes(o.plots[i].g) ? o.plots[i].g : 1 } : {}) }));
  const gl = o.goals && typeof o.goals === 'object' ? o.goals : {};
  r.goalLv = int(o.goalLv, 0, 0, CONFIG.goals.maxLv);
  if (/^\d{4}-\d\d-\d\d$/.test(gl.date) && Array.isArray(gl.list)) r.goals = { date: gl.date, list: gl.list.filter(g => g && GOALS[g.id]).slice(0, 5).map((g, i) => { const tier = int(g.tier, Math.min(i, 2), 0, 2); return { id: g.id, tier, need: int(g.need, goalNeed(g.id, tier, r.goalLv), 1, 1e6), n: int(g.n, 0, 0, 1e6), claimed: g.claimed === true }; }) };
  const ev = o.events && typeof o.events === 'object' ? o.events : {};
  for (const k in r.events) r.events[k] = ev[k] === true;
  const dl = o.daily && typeof o.daily === 'object' ? o.daily : {};
  r.daily = { date: /^\d{4}-\d\d-\d\d$/.test(dl.date) ? dl.date : '', adv: int(dl.adv, 0, 0, 999), gift: dl.gift === true };
  const st = o.steps && typeof o.steps === 'object' ? o.steps : {};
  r.steps.total = int(st.total, 0, 0, 1e10); r.steps.rem = num(st.rem, 0, 0, 999); r.steps.forestRem = num(st.forestRem, 0, 0, 1999);
  if (st.days && typeof st.days === 'object') for (const k in st.days) if (/^\d{4}-\d\d-\d\d$/.test(k)) r.steps.days[k] = int(st.days[k], 0, 0, 200000);
  if (legacy && !pa) r.path.earth = Math.floor(r.steps.total / CONFIG.steps.forestEvery);
  const av = o.adv && typeof o.adv === 'object' ? o.adv : {};
  if (r.hatched && !r.route) r.route = ROUTES.some(k => r.path[k] > 0) ? pickRoute(r) : (genomeFromId(gidOf(r)).el || 'tide');
  r.adv = { stage: int(av.stage, 1, 1, 999), wins: int(av.wins, 0, 0, 1e7), losses: int(av.losses, 0, 0, 1e7) };
  r.dex = Array.isArray(o.dex) ? o.dex.filter(e => e && typeof e === 'object').slice(-200).map(e => ({
    id: okId(e.id) ? e.id : (Number.isInteger(e.seed) ? 'g:' + e.seed : 'classic'),
    route: ROUTES.includes(e.route) ? e.route : OLD_ROUTE[e.route] || null,
    stage: STAGES.includes(e.stage) && e.stage !== 'egg' ? e.stage : (e.route ? 'adult' : 'juvenile'),
    petName: typeof e.petName === 'string' ? chars(e.petName).slice(0, 10).join('') : (typeof e.name === 'string' ? chars(e.name).slice(0, 10).join('') : ''), rel: e.rel ? 1 : 0,
    at: num(e.at, now, 0, now) })) : [];
  r.eggs = Array.isArray(o.eggs) ? o.eggs.filter(e => e && okId(e.id)).slice(0, CONFIG.breed.basket).map(e => ({ id: e.id, from: typeof e.from === 'string' ? chars(e.from).slice(0, 40).join('') : '', at: num(e.at, now, 0, now), ready: num(e.ready, 0, 0, 9e15), told: e.told ? 1 : 0 })) : [];
  r.breedAt = num(o.breedAt, 0, 0, now);
  r.journal = Array.isArray(o.journal) ? o.journal.filter(j => j && typeof j.t === 'string').slice(-200).map(j => ({ at: num(j.at, now, 0, now), t: chars(j.t).slice(0, 80).join('') })) : [];
  r.created = num(o.created, now, 0, now);
  r.hatchedAt = num(o.hatchedAt, r.hatched ? r.created : 0, 0, now);
  r.lastTick = num(o.lastTick !== undefined ? o.lastTick : o.updated, now, 0, 9e15);   // 未來時間保留，交由 applyTime 判斷倒退
  r.updated = num(o.updated, now, 0, 9e15); r.clockWarn = num(o.clockWarn, 0, 0, 9e15); r.lastExport = num(o.lastExport, 0, 0, 9e15);
  const sg = o.settings && typeof o.settings === 'object' ? o.settings : {};
  r.settings = { sound: (sg.sound !== undefined ? sg.sound : o.sound) !== false, reducedMotion: sg.reducedMotion === true, light: sg.light !== false };
  if (r.hatched) { const id = gidOf(r); let e = r.dex.find(x => x.id === id); if (!e) { e = { id, route: null, stage: r.stage, petName: r.name, at: r.hatchedAt || now }; r.dex.push(e); } e.route = r.route; e.stage = r.stage; e.petName = r.name; }
  return r;
}

/* ---------------- 時間：離線模擬（GDD 第 2 節） ---------------- */
function weatherAt(t = Date.now()) {
  const W = CONFIG.weather, slot = Math.floor((t + 8 * H) / (W.slotHours * H));   // 以台灣時間切時段
  let h = (slot * 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; const r = (h % 10000) / 10000;
  let acc = 0; for (const [k, p] of W.odds) { acc += p; if (r < acc) return k; } return 'clear';
}
function weatherFx(st, now) { if (!CONFIG.weatherOn) return null; const w = weatherAt(now), F = CONFIG.weather.fx[w]; let o = F ? F[st.view === 'room' ? 'in' : 'out'] || null : null;
  if (o && (w === 'storm' || w === 'rain') && hasSkill(st, 'flame')) { o = Object.assign({}, o); delete o.clean; delete o.energy; if (!Object.keys(o).length) o = null; }   // V1.83 火系升營火：抵消雨天、暴風雨扣的清潔和體力
  return o; }
function pickCrave(st, now = Date.now(), rnd = Math.random) {
  const C = CONFIG.crave, cur = st.crave && st.crave.kind, all = C.fruits.filter(k => k !== cur && (!((CONFIG.foods[k] || {}).farm || (CONFIG.foods[k] || {}).power) || (st.inv[k] || 0) > 0)),   // 家園水果、能力水果有拿到才會想吃
    own = all.filter(k => (st.inv[k] || 0) > 0);
  const pool = own.length && rnd() < C.ownedChance ? own : all;
  st.crave = { kind: pool[Math.floor(rnd() * pool.length) % pool.length], until: now + C.hours * H }; return st.crave;
}
function markSeen(st) {   // V1.74 背包裡有過的東西記進圖鑑
  const S = st.seen || (st.seen = {}), iv = st.inv || {};
  for (const k of [...Object.keys(CONFIG.foods), 'seeds', 'seeds2', 'seeds3', 'seeds4', 'candy', 'potion', 'potion2', 'elixir', 'soup', 'ember', 'shards', 'hearts']) if ((iv[k] || 0) > 0) S[k] = 1;
  for (const el of ROUTES) if (((iv.mats || {})[el] || 0) > 0) S['mat_' + el] = 1;
  for (const k in (iv.relics || {})) if (iv.relics[k] > 0) S['rl_' + k] = 1;
  for (const k of (st.relics || [])) S['rl_' + k] = 1;
  return S;
}
function growTree(st, now = Date.now()) {
  const A = CONFIG.appleTree, T = st.tree || (st.tree = { n: 0, ground: 0, at: now }), step = A.growHours * H;
  if (!(T.at > 0) || T.at > now) T.at = now;
  while (now - T.at >= step) { T.at += step; if (T.n + T.ground < A.max) T.n++; }
  if (T.n + T.ground >= A.max) T.at = Math.max(T.at, now - step + 1);   // 滿了就先不累積
  return T;
}
function dropApple(st, all = false, now = Date.now()) { const T = growTree(st, now); if (T.n <= 0) return 0; const k = all ? T.n : 1; T.n -= k; T.ground += k; return k; }
/* V1.83 野莓叢：不用 applyTime，依上次採收的時間算現在有幾顆 */
function bushBerries(st, now = Date.now()) { const B = CONFIG.berryBush, b = st.bush || (st.bush = { at: now }); if (!(b.at > 0) || b.at > now) b.at = now; return Math.min(B.max, Math.floor((now - b.at) / (B.growHours * H))); }
function pickBerries(st, now = Date.now()) {
  const n = bushBerries(st, now), B = CONFIG.berryBush;
  if (n < 1) { const left = B.growHours * H - (now - st.bush.at); return { ok: false, left, msg: `野莓還沒長出來，再等 ${Math.ceil(left / MIN)} 分鐘` }; }
  st.inv.berry = (st.inv.berry || 0) + n; st.bush.at = now; return { ok: true, n, msg: `摘到 ${n} 顆野莓 🫐（免費！）` };
}
function pickApple(st, now = Date.now()) {
  const T = growTree(st, now); if (T.ground <= 0) return { ok: false, msg: '地上沒有蘋果' };
  T.ground--; st.inv.food = (st.inv.food || 0) + 1; if (T.n + T.ground === CONFIG.appleTree.max - 1) T.at = now;
  return { ok: true, msg: '撿到 1 顆蘋果 🍎（免費！）' };
}
function ensureCrave(st, now = Date.now()) { if (st.hatched && (!st.crave || now >= st.crave.until)) pickCrave(st, now); return st.crave; }
function applyTime(st, now = Date.now()) {
  ensureCrave(st, now); growTree(st, now);
  if (now < st.lastTick) { st.clockWarn = now; return { warn: 'back', hours: 0, events: [] }; }   // 時間倒退：不回溯，記錄警告
  if (st.nestUntil && st.lastTick < st.nestUntil) st.lastTick = Math.min(now, Math.max(st.lastTick, st.nestUntil));   // V1.86.2 在愛的小窩裡：數值暫停
  loveTick(st, now); loungeTick(st, now);
  const hours = (now - st.lastTick) / H, eff = Math.min(hours, CONFIG.offlineCapHours);
  const last = st.lastTick; st.lastTick = now;
  const events = digest(st, now);
  if (st.hatched && eff > 0) {
    const R = CONFIG.rates[st.sleeping ? 'sleep' : 'awake'], T = trait(st);
    const hr = -R.hunger * ((T.rate && T.rate.hunger) || 1), h0 = st.hunger;   // 每小時掉多少飽食
    if (h0 > 0) st.starveSince = 0;   // 有吃東西（飽食 >0）就重新計算
    let starveT = 0; if (!st.runaway && hr > 0 && hours >= h0 / hr) starveT = Math.round(last + (h0 / hr) * H);   // 這段時間內（真實時間）餓到 0 的時刻
    for (const k in R) { let v = R[k]; if (v < 0 && T.rate && T.rate[k]) v *= T.rate[k]; if (k === 'energy' && v > 0 && T.energyUp) v *= T.energyUp; st[k] = clamp(st[k] + v * eff); }   // 屬性特性：某些狀態掉得比較快、體力恢復快慢不同
    // 發臭的果核：只算「已經發臭」的那段時間，同樣最多 12 小時
    let rotH = 0; for (const c of st.cores) { const from = Math.max(last, c.at + rotMin(c) * MIN); if (now > from) rotH += Math.min((now - from) / H, CONFIG.offlineCapHours); }
    if (rotH > 0) st.mood = clamp(st.mood - rotH * CONFIG.core.moodPerHour);
    if (starveT) { st.hunger = 0; st.starveSince = st.starveSince || starveT; }   // 真實時間已經餓到 0（不受 12 小時上限保護）
    if (st.hunger > 0) st.starveSince = 0;
    if (st.starveSince && !st.runaway && now - st.starveSince >= CONFIG.runaway.starveHours * H) { st.runaway = { at: now, got: 0 }; st.sleeping = false; journal(st, now, '肚子太餓，離家出走了…'); events.push('runaway'); }
    const N = CONFIG.neglect; if (Math.min(st.hunger, st.mood, st.clean) < N.below) st.bond = clamp(st.bond - N.bondPerHour * eff);   // 沒照顧好，親密度會掉
    if (st.pair) decayPair(st, eff);
    const WF = !st.sleeping && !st.runaway && weatherFx(st, now);   // 天氣：離線最多算 3 小時
    if (WF) { const wh = Math.min(eff, CONFIG.weather.offlineCap); for (const k in WF) { st[k] = clamp(st[k] + WF[k] * wh); if (st.pair && k in st.pair) st.pair[k] = clamp(st.pair[k] + WF[k] * wh); } }
    if (!st.runaway && st.mood >= CONFIG.piggy.minMood) st.piggy = Math.min(piggyCap(st), (st.piggy || 0) + piggyRate(st) * eff * (st.sleeping ? CONFIG.piggy.sleepRate : 1));
  }
  return { hours, eff, warn: hours > CONFIG.jumpWarnDays * 24 ? 'jump' : null, events };
}
/* 存錢筒：幻獸等級越高，每小時存越多；鋼系 ×1.5；一起出來的第二隻再加牠的一半 */
function piggyRateOf(p) { const P = CONFIG.piggy, T = traitOf(p.route); return (P.base + P.per * Math.min(level(p.xp), P.maxLv)) * (T.coinX || 1) * (p.awake ? CONFIG.starHeart.piggyX : 1); }
const pigLevel = st => Math.min(6, 1 + ((st.pigCores && st.pigCores.length) || 0) + (st.pigBought ? 1 : 0));
function piggyRate(st) {   // V1.86.7 以養過最高等的那隻來算（換照顧小隻的不會變少）；第二隻一起出來再加一半
  if (!st.hatched) return 0; const L = [st, ...(st.pair ? [st.pair] : []), ...(st.roster || []), ...(st.foster || [])].filter(p => p && p.hatched !== false);
  const best = L.reduce((a, p) => piggyRateOf(p) > piggyRateOf(a) ? p : a, st), extra = st.pair && st.pair !== best ? piggyRateOf(st.pair) * CONFIG.piggy.pairShare : best === st.pair ? piggyRateOf(st) * CONFIG.piggy.pairShare : 0;
  return (piggyRateOf(best) + extra) * CONFIG.piggy.rateX[pigLevel(st) - 1];
}
function piggyCap(st) { return Math.max(1, Math.round(piggyRate(st) * CONFIG.piggy.capH[pigLevel(st) - 1])); }
function buyPigCore(st) { const P = CONFIG.piggy; if (st.pigBought) return { ok: false, msg: '小豬撲滿核心只有一個，已經買過了' }; if (st.coins < P.corePrice) return { ok: false, msg: `金幣不足（需要 ${P.corePrice}）` };
  st.coins -= P.corePrice; st.pigBought = true; return { ok: true, lv: pigLevel(st), msg: `買了「小豬撲滿核心」！小豬撲滿升到 ${pigLevel(st)} 級${pigLevel(st) >= 6 ? '，變成最肥、會發光的金小豬！' : ''}` }; }
function collectPiggy(st, now = Date.now()) { applyTime(st, now); const n = Math.floor(st.piggy || 0); if (n < 1) return { ok: false, n: 0, msg: '存錢筒裡還沒有金幣' }; st.coins += n; st.piggy -= n; return { ok: true, n }; }
/* 星辰之心：高階的幻獸使用 → 星耀覺醒（全能力 +20%、存錢筒 ×1.5、名字前加「星耀」） */
function canAwaken(st) { if (!st.hatched || st.stage !== 'ascended') return '要先進化到高階'; if (st.awake) return '已經星耀覺醒了'; if ((st.inv.hearts || 0) < 1) return '沒有星辰之心（打倒第 40 關大王）'; return null; }
function awaken(st, now = Date.now()) { const w = canAwaken(st); if (w) return { ok: false, msg: w }; st.inv.hearts--; st.awake = true; journal(st, now, '使用星辰之心，星耀覺醒了！'); return { ok: true, msg: `${st.name} 星耀覺醒了！✨` }; }
/* 一起出來的第二隻：狀態變化速度只有一半（不會離家出走，餓到 0 只會心情、親密度往下掉） */
function decayPair(st, eff) {
  const p = st.pair, R = CONFIG.rates[st.sleeping ? 'sleep' : 'awake'], T = traitOf(p.route), k = eff * CONFIG.pair.rate;
  for (const key in R) { let v = R[key]; if (v < 0 && T.rate && T.rate[key]) v *= T.rate[key]; if (key === 'energy' && v > 0 && T.energyUp) v *= T.energyUp; p[key] = clamp(p[key] + v * k); }
  const N = CONFIG.neglect; if (Math.min(p.hunger, p.mood, p.clean) < N.below) p.bond = clamp(p.bond - N.bondPerHour * k);
  if (p.hunger <= 0) p.mood = clamp(p.mood - 2 * k);
}
/* 消化：時間到了就大便；有寵物馬桶就自己去上廁所 */
function digest(st, now) {
  const out = []; if (!st.hatched) { st.digest = []; return out; }
  const due = st.digest.filter(t => t <= now).sort((a, b) => a - b); st.digest = st.digest.filter(t => t > now);
  for (const t of due) {
    if (st.decor.placed.toilet) { st.toiletUses++; out.push('toilet'); if (st.toiletUses === 1) journal(st, t, '第一次自己去上廁所了！'); }
    else { const r = rng(Math.floor(t))(); addCore(st, 56 + r * 56, t, st.view, 'poop'); out.push('poop'); }
  }
  return out;
}
const ageHours = (st, now) => st.hatched ? Math.max(0, now - st.hatchedAt) / H : 0;

/* ---------------- 日記 ---------------- */
function journal(st, now, t) { st.journal.push({ at: now, t }); if (st.journal.length > 200) st.journal.shift(); }

/* ---------------- 每日保底（GDD 第 3 節：非連續簽到） ---------------- */
function claimDaily(st, now = Date.now()) {
  const k = dayKey(now);
  if (st.daily.date && k <= st.daily.date) return null;     // 同一天、或時間倒退／切換時區造成的「過去日期」都不能再領
  const first = !st.daily.date;   // V1.40：第一天不送金幣，開局就是 50 元
  st.daily = { date: k, adv: 0, gift: false }; ensureGoals(st, now);
  const c = first ? 0 : CONFIG.daily.coins; st.coins += c; st.inv.food += CONFIG.daily.food;
  return { coins: c, food: CONFIG.daily.food };
}
function canGather(st, now = Date.now()) {
  return st.inv.food === 0 && st.coins < CONFIG.feed.price && now - st.care.gatherAt >= CONFIG.gather.cooldownMin * MIN;
}
function gather(st, now = Date.now()) {
  if (st.inv.food > 0 || st.coins >= CONFIG.feed.price) return { ok: false, msg: '還有食物或金幣，暫時不用採集' };
  const wait = st.care.gatherAt + CONFIG.gather.cooldownMin * MIN - now;
  if (wait > 0) return { ok: false, msg: `再等 ${Math.ceil(wait / 1000)} 秒才能採集` };
  st.care.gatherAt = now; st.inv.food += CONFIG.gather.food;
  return { ok: true, msg: '採到一顆果子 🍎' };
}

/* ---------------- 照顧行為（GDD 第 3 節表格） ---------------- */
const trait = st => (CONFIG.traitsOn && st && CONFIG.traits[st.route]) || {};
const traitOf = route => (CONFIG.traitsOn && CONFIG.traits[route]) || {};
function addXP(st, n) { n = Math.max(0, Math.round(n * CONFIG.xpGain * (trait(st).xp || 1) * (!st.awake && hasHeritage(st) ? CONFIG.heritage.xp : 1))); st.xp += n; return n; }
const washCost = st => hasSkill(st, 'tide') ? 0 : trait(st).washCost || CONFIG.washCost;   // V1.83 水系：洗澡免水費
function act(st, a, now = Date.now(), opt) {
  const tm = applyTime(st, now);
  if (!st.hatched) return { ok: false, msg: '先把蛋孵出來吧！', tm };
  if (st.runaway) return { ok: false, code: 'runaway', msg: '牠離家出走了…要走路找牠回來', tm };
  const F = CONFIG.full;
  if (a === 'sleep') {
    if (st.sleeping) { st.sleeping = false; return { ok: true, anim: 'happy', sfx: 'wake', msg: '醒來了～', tm }; }
    if (st.view !== 'room') return { ok: false, code: 'outside', msg: '外面不能睡覺，要回小窩裡睡喔', tm };
    st.sleeping = true; return { ok: true, anim: 'sleep', sfx: 'sleep', msg: '晚安～💤（睡覺時體力每小時 +12，再按一次可叫醒）', tm };
  }
  if (st.sleeping) return { ok: false, msg: '噓…牠在睡覺，先叫醒牠吧', tm };
  if (a === 'feed') {
    const kind = CONFIG.foods[opt] ? opt : 'food', FD = CONFIG.foods[kind];
    if (st.hunger >= F) return { ok: false, msg: '飽飽的，吃不下了～', tm };
    let paid = '';
    fixFresh(st); const fr0 = (st.inv.fresh && st.inv.fresh[kind]) || 0, freshEat = fr0 > 0 && (st.inv[kind] || 0) <= fr0;   // 先吃買來的，只剩自己種的才吃到
    if ((st.inv[kind] || 0) > 0) { st.inv[kind]--; paid = `用掉 1 個${FD.name}`; }
    else if (FD.farm) return { ok: false, code: 'nofood', msg: `${FD.name}只能自己種田種出來，買不到喔`, tm };
    else if (FD.power) return { ok: false, code: 'nofood', msg: `${FD.name}是能力水果，商店買不到：冒險、打王、種田才拿得到`, tm };   // V1.72 家園水果只能自己種
    else if (st.coins >= FD.price) { st.coins -= FD.price; paid = `花 ${FD.price} 金幣買${FD.name}`; }
    else return { ok: false, code: 'nofood', msg: `沒有${FD.name}也沒有金幣了…可以去「採集」或種田`, tm };
    const fav = !!(st.route && FD.fav.includes(st.route)), B = CONFIG.favBonus, crave = !!(st.crave && st.crave.kind === kind && now < st.crave.until), CB = crave ? CONFIG.crave.bonus : null;
    st.hunger = clamp(st.hunger + FD.hunger * (trait(st).feed || 1) + (CB ? CB.hunger : 0)); st.mood = clamp(st.mood + FD.mood + (fav ? B.mood : 0) + (CB ? CB.mood : 0)); const PB = crave && FD.power ? CONFIG.powerBonus : null;
    if (FD.energy || freshEat || PB || CB) st.energy = clamp(st.energy + (FD.energy || 0) + (freshEat ? CONFIG.freshBonus.energy : 0) + (PB ? PB.energy : 0) + (CB ? CB.energy : 0)); fixFresh(st);
    if (CB) { st.bond = clamp(st.bond + CB.bond); st.crave = { kind: null, until: now + CONFIG.crave.cooldownHours * H }; }   // V1.73 餵到後吃飽滿足，3 小時後才會再想吃別的
    st.path.tide += CONFIG.feed.tide; track(st, 'feed', now); st.digest.push(now + CONFIG.poop.delayMin * MIN);
    return { ok: true, anim: 'eat', sfx: 'eat', kind, left: FD.left, fav: fav || crave, crave, xp: addXP(st, FD.xp + (fav ? B.xp : 0) + (PB ? PB.xp : 0) + (CB ? CB.xp : 0)), power: !!PB, fresh: freshEat, msg: (freshEat ? '✨自己種的' : '') + (crave ? `就是想吃${FD.name}！幸福～💕（親密度 +${CB.bond}）` : fav ? `最愛的${FD.name}！超好吃！` : `好吃的${FD.name}！`) + (freshEat ? `體力多 +${CONFIG.freshBonus.energy}` : '') + `（${paid}）`, tm };
  }
  if (a === 'play') {
    const C = CONFIG.play;
    if (st.energy < C.minEnergy) return { ok: false, msg: '太累了…先讓牠休息或睡一下', tm };
    let bought = 0; if (st.ballBroken) { if (st.coins < CONFIG.ballCost) return { ok: false, code: 'noball', msg: `球爆掉了，要 ${CONFIG.ballCost} 金幣買新球`, tm }; st.coins -= CONFIG.ballCost; st.ballBroken = false; bought = CONFIG.ballCost; }
    st.care.playXpAt = st.care.playXpAt.filter(t => now - t < C.xpWindowMin * MIN && t <= now);
    let xp = 0;
    if (st.care.playXpAt.length < C.xpPerWindow) { st.care.playXpAt.push(now); xp = addXP(st, C.xp); }
    st.mood = clamp(st.mood + C.mood); st.energy = clamp(st.energy + C.energy); st.hunger = clamp(st.hunger + C.hunger); st.clean = clamp(st.clean + C.clean); track(st, 'play', now);
    st.ballUses = (st.ballUses || 0) + 1; const popped = st.ballUses >= CONFIG.ballLife; if (popped) { st.ballUses = 0; st.ballBroken = true; }   // 球玩久了會爆掉
    return { ok: true, anim: 'play', sfx: 'play', xp, popped, bought, msg: (bought ? `買了新球（−${bought} 金幣）。` : '') + (xp ? '玩得好開心！' : '玩得好開心！（玩太多次了，暫時沒有經驗）') + (popped ? `\n💥 球被玩壞，爆掉了！下次玩要花 ${CONFIG.ballCost} 金幣買新球` : ''), tm };
  }
  if (a === 'wash') {
    const C = CONFIG.wash, wait = st.care.bathLastAt + C.cooldownMin * MIN - now;
    if (st.clean >= F) return { ok: false, msg: '已經很乾淨了！', tm };
    if (wait > 0) return { ok: false, msg: `剛洗過澡，${Math.ceil(wait / MIN)} 分鐘後再洗吧`, tm };
    const cost = washCost(st); if (st.coins < cost) return { ok: false, code: 'nocoin', msg: `沒有錢付水費了（洗一次 ${cost} 金幣）`, tm };
    st.coins -= cost; st.care.bathLastAt = now; st.clean = clamp(st.clean + C.clean * (trait(st).washGain || 1)); st.path.metal += 1; st.washes = (st.washes || 0) + 1; track(st, 'wash', now);
    return { ok: true, anim: 'wash', sfx: 'wash', cost, xp: addXP(st, C.xp), msg: `洗得香噴噴～（水費 −${cost}）`, tm };
  }
  return { ok: false, msg: '未知動作', tm };
}
function bondTier(b) { return CONFIG.bondTiers.filter(t => b >= t).length; }
function pet(st, now = Date.now()) {
  const tm = applyTime(st, now);
  if (!st.hatched) return { ok: false, tm };
  if (st.sleeping) return { ok: true, reward: false, msg: 'Zzz…（睡得好熟）', tm };
  const C = CONFIG.pet, out = { ok: true, reward: false, tm, events: [] };
  if (now - st.care.petLastRewardAt >= C.cooldownMin * MIN) {
    const t0 = bondTier(st.bond);
    st.care.petLastRewardAt = now; if (st.mood >= C.minMood) st.bond = clamp(st.bond + C.bond); else out.lowMood = true; st.mood = clamp(st.mood + C.mood); st.path.tide += C.tide;
    out.reward = true; track(st, 'pet', now); const t1 = bondTier(st.bond);
    if (t1 > t0) { out.bondUp = CONFIG.bondTiers[t1 - 1]; journal(st, now, `親密度達到 ${out.bondUp}！`); }
    // 親密度 50：每天一次，牠會撿東西送你
    if (st.bond >= 50 && !st.daily.gift && st.daily.date === dayKey(now)) { st.daily.gift = true; st.inv.food++; out.gift = true; }
    // 月泉事件：親密度 >= 60、晚上（19:00–04:59）摸摸時發生一次
    const h = hourIn(now);
    if (!st.events.moonspring && st.bond >= CONFIG.moonspringBond && (h >= 19 || h < 5)) { out.events.push(discover(st, now, 'moonspring')); }
  }
  return out;
}

/* ---------------- 特殊事件／探索發現 ---------------- */
const EVENT_TEXT = { volcano: '火山遺跡', moonspring: '月泉', oldtree: '古樹', canyon: '大地裂谷', skypeak: '天空之巔', thunder: '雷雲祭壇', mine: '鋼鐵礦坑' };
function discover(st, now, ev) {
  if (ev && st.events[ev]) return null;
  if (ev) st.events[ev] = true;
  addXP(st, CONFIG.discovery.xp); st.path.forest += CONFIG.discovery.forest;
  if (ev) journal(st, now, `發現了「${EVENT_TEXT[ev]}」！`);
  return ev || 'place';
}

/* ---------------- 成長與進化（GDD 第 4 節） ---------------- */
function pickRoute(st) {
  const done = r => (st.events[ROUTE_EVENT[r]] ? 1 : 0);
  return [...CONFIG.routeTie].sort((a, b) => (st.path[b] - st.path[a]) || (done(b) - done(a)) || (CONFIG.routeTie.indexOf(a) - CONFIG.routeTie.indexOf(b)))[0];
}
const COUNTER_TEXT = { wins: n => `打贏 ${n} 場戰鬥`, washes: n => `幫牠洗澡 ${n} 次`, harvests: n => `收成 ${n} 次`, steps: n => `走 ${n.toLocaleString('en-US')} 步`, earthWins: n => `打贏 ${n} 隻土屬性野生怪`, goals: n => `頂球進 ${n} 球`, bondUses: n => `發動羈絆之力 ${n} 次`, cleanups: n => `清理果核或大便 ${n} 次` };
function counter(st, k) { return k === 'wins' ? st.adv.wins : k === 'washes' ? (st.washes || 0) : k === 'harvests' ? st.harvests : k === 'steps' ? st.steps.total : k === 'earthWins' ? (st.earthWins || 0) : k === 'goals' ? st.ball.goals : k === 'bondUses' ? st.bondUses : k === 'cleanups' ? st.cleanups : 0; }
function counterSnap(st) { const o = {}; for (const k in COUNTER_TEXT) o[k] = counter(st, k); return o; }
/* 專屬任務：成年期才出現；從長成成年期那一刻開始算（ascBase＝那時的計數） */
function taskOf(st, route) {
  const T = CONFIG.ascend.tasks[route]; if (!T) return null; const base = st.ascBase || counterSnap(st);
  const alts = T.map(([k, need]) => { const have = Math.max(0, counter(st, k) - (base[k] || 0)); return { k, need, have: Math.min(have, need), done: have >= need, text: COUNTER_TEXT[k](need) }; });
  const done = alts.some(a => a.done), best = alts.reduce((a, b) => (b.have / b.need > a.have / a.need ? b : a));
  return { done, have: best.have, need: best.need, alts, text: alts.map(a => a.text).join('，或') };
}
function ascendInfo(st, route = st.route) { return { task: taskOf(st, route), mats: (st.inv.mats || {})[route] || 0, need: CONFIG.ascend.mats, show: st.stage === 'adult' }; }
function specialDone(st, route) { const t = taskOf(st, route); return !!t && t.done; }
function stageReq(st, now) {
  const age = ageHours(st, now), S = CONFIG.stages;
  const nxt = st.stage === 'baby' ? 'juvenile' : st.stage === 'juvenile' ? 'adolescent' : st.stage === 'adolescent' ? 'adult' : st.stage === 'adult' ? 'ascended' : null;
  if (!nxt) return null;
  return { next: nxt, hours: S[nxt].hours, xp: S[nxt].xp, ageOk: age >= S[nxt].hours, xpOk: st.xp >= S[nxt].xp, eventOk: nxt !== 'ascended' || specialDone(st, st.route), matOk: nxt !== 'ascended' || ((st.inv.mats || {})[st.route] || 0) + (st.inv.shards || 0) >= CONFIG.ascend.mats, matHave: (st.inv.mats || {})[st.route] || 0, shards: st.inv.shards || 0, mat: nxt === 'ascended' ? CONFIG.materials[st.route] : null, age };
}
const ROUTE_CH = { flame: '焰', tide: '潮', forest: '森', earth: '土', bird: '鳥', elec: '電', metal: '金' };
function checkStages(st, now = Date.now()) {
  const out = [];
  if (st.hatched && st.stage === 'adult' && !st.ascBase) st.ascBase = counterSnap(st);   // 舊存檔已經是成年期：從現在開始算
  for (let guard = 0; guard < 5 && st.hatched; guard++) {
    const q = stageReq(st, now);
    if (!q || !q.ageOk || !q.xpOk || !q.eventOk || !q.matOk) break;
    if (q.next === 'ascended') { const use = Math.min(st.inv.mats[st.route] || 0, CONFIG.ascend.mats); st.inv.mats[st.route] -= use; st.inv.shards -= CONFIG.ascend.mats - use; }   // 進化用掉 3 個素材（不夠的用星辰碎片補）
    const from = st.stage;
    if (q.next === 'adult' && !st.route) st.route = pickRoute(st);
    st.stage = q.next;
    if (st.stage === 'adult') { st.ascBase = counterSnap(st); journal(st, now, `🔔 專屬任務出現：${taskOf(st, st.route).text}`); }
    out.push({ from, to: st.stage, route: st.route });
    journal(st, now, { juvenile: '長成幼年期了！', adolescent: '長成少年期了！', adult: `進化成成年期（${ROUTE_CH[st.route]}系）！`, ascended: '達到高階型態！' }[st.stage]);
    const e = st.dex.find(x => x.id === gidOf(st)); if (e) { e.stage = st.stage; e.route = st.route; }
  }
  return out;
}
function tendencyHint(st) {
  if (!st.hatched || !st.route) return null;
  return { flame: '尾巴尖好像暖暖的…', tide: '眼睛像水面一樣閃閃發亮…', forest: '身上有淡淡的青草香…', earth: '腳步越來越穩，身上沾著泥土味…', bird: '常常抬頭看天空，好像想飛…', elec: '摸牠的時候會劈啪一下…', metal: '身體摸起來越來越硬，亮晶晶的…' }[st.route];
}

/* ---------------- 孵化 ---------------- */
function hatch(st, now = Date.now()) {
  st.hatched = true; st.eggTaps = 0; st.hatchedAt = now; st.lastTick = now; st.stage = 'baby';
  if (st.sex !== 'm' && st.sex !== 'f') st.sex = sexOfId(gidOf(st));
  st.route = genomeFromId(gidOf(st)).el || 'tide';   // V1.12：屬性在蛋裡就決定，一路長到高階
  const id = gidOf(st); if (!st.dex.find(x => x.id === id)) st.dex.push({ id, route: st.route, stage: 'baby', petName: st.name, at: now });
  journal(st, now, '孵化了！');
}

/* ---------------- 步數（捷徑傳入） ---------------- */
function creditSteps(st, raw, date, now = Date.now()) {
  const C = CONFIG.steps, n = Math.floor(Number(String(raw).replace(/[,，\s]/g, '')));
  if (!Number.isFinite(n) || n < 0) return { err: '步數格式不正確' };
  const td = dayKey(now); date = /^\d{4}-\d\d-\d\d$/.test(date || '') ? date : td;
  const age = (Date.parse(td) - Date.parse(date)) / 86400000;
  if (!(age >= 0 && age <= C.backDays)) return { err: `只能登記最近 ${C.backDays} 天的步數` };
  const v = Math.min(n, C.dayCap), prev = st.steps.days[date] || 0, delta = v - prev;
  if (delta <= 0) return { delta: 0, v };
  const tier0 = Math.floor(st.steps.total / C.tier);
  st.steps.days[date] = v; st.steps.total += delta; st.steps.rem += delta; st.steps.forestRem += delta;
  const k = Math.floor(st.steps.rem / C.per); st.steps.rem -= k * C.per;
  const f = Math.floor(st.steps.forestRem / C.forestEvery); st.steps.forestRem -= f * C.forestEvery;
  let xp = 0; if (st.hatched) { xp = addXP(st, k * C.xpPer); st.path.earth += f; }
  if (date === td) track(st, 'steps', now, delta);
  const up = Math.floor(st.steps.total / C.tier) - tier0; if (up > 0) { st.coins += up * C.tierCoins; journal(st, now, `累積 ${Math.floor(st.steps.total / C.tier) * C.tier} 步，突破！`); }
  const keys = Object.keys(st.steps.days).sort(); while (keys.length > 30) delete st.steps.days[keys.shift()];
  let found = false; if (st.runaway) { st.runaway.got += delta; if (st.runaway.got >= CONFIG.runaway.steps) found = comeHome(st, now); }   // 走路找離家出走的幻獸
  return { delta, v, xp, earth: st.hatched ? f : 0, up, found, search: st.runaway ? st.runaway.got : null };
}
function comeHome(st, now = Date.now()) {
  const B = CONFIG.runaway.back; st.runaway = null; st.starveSince = 0; st.lastTick = now;
  st.hunger = B.hunger; st.mood = B.mood; st.clean = B.clean; st.bond = clamp(st.bond - CONFIG.runaway.bondLoss);
  journal(st, now, '走了好遠的路，終於把牠找回來了！'); return true;
}
const stepTier = st => Math.floor(st.steps.total / CONFIG.steps.tier);

/* ---------------- 冒險與戰鬥 ---------------- */
const ELEM = { flame: 'fire', tide: 'water', forest: 'leaf', earth: 'earth', bird: 'bird', elec: 'elec', metal: 'metal' };
/* 屬性相剋：key 剋 陣列裡的屬性（傷害 ×1.5；反過來 ×0.67） */
const BEATS = { fire: ['leaf', 'metal'], water: ['fire', 'earth'], leaf: ['water', 'earth'], earth: ['fire', 'elec', 'metal'], bird: ['leaf', 'earth'], elec: ['water', 'bird'], metal: ['bird', 'leaf'] };
function canAdventure(st, n, now = Date.now()) {
  if (!st.hatched) return '先孵化幻獸才能冒險';
  if (st.runaway) return '牠離家出走了，先把牠找回來吧';
  if ((st.bondRestUntil || 0) > now) return `發揮了超常能力，還要休息 ${Math.ceil((st.bondRestUntil - now) / MIN)} 分鐘才能再冒險`;
  if (st.sleeping) return '牠在睡覺，先叫醒牠吧';
  if (st.energy < CONFIG.adventure.minEnergy) return `體力要 ${CONFIG.adventure.minEnergy} 以上才能冒險`;
  if (n < 1 || n > st.adv.stage) return '這一關還沒解鎖';
  return null;
}
function startAdventure(st, n, now = Date.now()) {
  applyTime(st, now); claimDaily(st, now);
  const why = canAdventure(st, n); if (why) return { ok: false, msg: why };
  const A = CONFIG.adventure; st.energy = clamp(st.energy + A.energy); st.hunger = clamp(st.hunger + A.hunger); st.clean = clamp(st.clean + A.clean); st.daily.adv++; track(st, 'adv', now);
  return { ok: true, full: true };   // V1.35：不限次數，有體力就能冒險、每次都是全額獎勵
}
function mkFighter(name, key, lvl, route, tierN, mood, bond) {
  const k = 1 + .1 * tierN, cond = mood < 30 ? .85 : 1, T = traitOf(route);
  return { name, key, level: lvl, el: ELEM[route] || 'none', max: Math.round((30 + lvl * 6) * k), hp: Math.round((30 + lvl * 6) * k), stunChance: T.stun || 0, stun: 0,
    atk: (8 + lvl * 2) * k * cond * (T.atk || 1), def: (6 + lvl * 1.5) * k * (T.def || 1), spd: 5 + lvl + tierN, cd: 0, guard: false, endure: bond >= 80 };
}
/* V1.44 野生怪戰鬥數值（畫面和模擬共用） */
function foeFighter(n, myLvl, name = '野生怪', key = 'k') {
  const f = foeFor(n, myLvl), H0 = CONFIG.foeHp, T = CONFIG.tower, ft = mkFighter(name, key, f.level, f.route, 0, 80, 0), tw = n >= T.from;
  ft.max = ft.hp = Math.round(ft.max * (f.big ? H0.big : f.boss ? H0.mini : H0.normal) * (tw ? T.hp : 1)); if (tw) ft.atk *= T.atk; ft.tower = tw; if (f.route2) ft.el2 = f.route2 === 'dragon' ? 'dragon' : ELEM[f.route2];
  { const BB = CONFIG.bossBuff; if (CONFIG.bosses[n] && !BB.skip.includes(n)) { ft.max = ft.hp = Math.round(ft.max * BB.hp); ft.atk *= BB.atk; } } ft.bt = (CONFIG.bossTal[n] || []).slice(); ft.boss = !!f.boss; ft.big = !!f.big; return ft;
}
const hasHeritage = st => !!(st.awake || (st.pair && st.pair.awake) || (st.roster || []).some(p => p.awake));
/* V1.42 我方加成：進化階段、訓練成果、星耀覺醒 */
function trainBonus(p) { const T = CONFIG.trainBonus, L = (p && p.trainLog) || {}, f = k => Math.min(T.max, Math.round((L[k] || 0) * T.per * 1000) / 1000); return { dodge: f('dodge'), attack: f('attack'), defense: f('defense') }; }
function buffFighter(f, p) {
  if (!f || !p) return f; const sx = CONFIG.stageX[p.stage] || 1, tb = trainBonus(p), aw = p.awake ? CONFIG.starHeart.statX : 1;
  f.atk *= sx * (1 + tb.attack) * aw; f.def *= sx * (1 + tb.defense) * aw; f.max = f.hp = Math.round(f.max * sx * (1 + tb.defense) * aw); f.dodge = tb.dodge; f.stageX = sx;
  for (const k of (p.relics || [])) { const R = CONFIG.relics.items[k]; if (!R) continue;   // V1.52 寶物
    if (R.def) f.def *= 1 + R.def; if (R.atk) f.atk *= 1 + R.atk; if (R.hp) f.max = f.hp = Math.round(f.max * (1 + R.hp));
    if (R.crit) f.critUp = (f.critUp || 0) + R.crit; if (R.cut) f.dmgCut = (f.dmgCut || 0) + R.cut; if (R.regen) f.regen = (f.regen || 0) + R.regen; if (R.revive) f.revive = R.revive; if (R.sp) f.spUp = (f.spUp || 0) + R.sp; if (R.dodge) f.dodge = (f.dodge || 0) + R.dodge; }
  return f;
}
/* V1.86 戰鬥天賦等級：少年期 1（弱化版）、成年期以後 2（完整版） */
const talLv = stage => stage === 'adolescent' ? 1 : stage === 'adult' || stage === 'ascended' ? 2 : 0;
function talentOn(f, el, lv) {   // 把天賦掛到戰鬥角色身上（被動的數值；會觸發的在畫面那邊處理）
  if (!f || !lv || !CONFIG.talents[el]) return f; const T = CONFIG.talents[el][lv === 2 ? 'f' : 'w']; f.tal = el; f.talLv = lv;
  if (el === 'earth') { f.critRes = T.crit; f.ultRes = T.ult || 0; } if (el === 'leaf') f.sprout = T.chance; return f;
}
function bossTalOn(f) { const K = CONFIG.bt; for (const t of f.bt || []) { if (t === 'shell') f.spCut = K.shell; if (t === 'reap') f.reap = K.reap.up; } return f; }
/* V1.86 魔王圖鑑紀錄 */
function bossSeen(st, n, what, now = Date.now()) { if (!CONFIG.bosses[n]) return; const D = st.bossDex || (st.bossDex = {}), e = D[n] || (D[n] = { s: 0, l: 0, w: 0, at: 0 }); e.s = 1; if (what === 'loss') e.l = 1; if (what === 'win') { if (!e.w) e.at = now; e.w = 1; } }
function eliteBonus(st, r) { const E = CONFIG.elite, c = Math.ceil((r.coins || 0) * E.reward), x = st.hatched ? addXP(st, Math.round((r.xp || 0) * E.reward)) : 0; st.coins += c; return { coins: c, xp: x }; }
/* 冒險區域（每 5 關一區）主要出現的屬性 */
const AREA_ROUTE = [null, 'tide', 'flame', 'forest', 'earth', 'bird', 'elec', 'metal', null];
function foeFor(n, myLvl = 1) {
  const seed = (Math.imul(n, 2654435761) ^ 0x9e3779b9) >>> 0, G = makeGenome(seed), boss = n % 5 === 0, big = n % 10 === 0;   // 5 關一小王、10 關一大王
  if (boss) G.rarity = 3;
  const BS = CONFIG.bosses[n], area = AREA_ROUTE[Math.min(AREA_ROUTE.length - 1, Math.floor((n - 1) / 5))], route = BS ? BS.route : area && (seed >>> 8) % 10 < 7 ? area : ROUTES[seed % ROUTES.length], stage = n >= 4 ? 'adult' : (n >= 2 ? 'adolescent' : 'juvenile');
  const lvl = boss ? (n <= 5 ? n + 1 : Math.round(4 + n * .6) + (big ? 4 : 2))   // V1.42：小王／大王固定等級，不會跟著你變強（練功就打得贏）
    : n <= 5 ? Math.max(n, Math.round(myLvl) - 2) : Math.max(1, Math.round(4 + n * .6), Math.round(myLvl) - 1);   // 一般野生怪：新手區比你低 2 級；之後跟著你的等級（最低 ≈ 4＋關卡×0.6）   // 新手區（1–5 關）比你低 2 級；之後野生怪跟著你的等級，最低等級 ≈ 4＋關卡×0.6（V1.33 前是關卡數，後期太難）
  return { id: 'x:' + encodeGenome(G), route, route2: BS ? BS.route2 : null, stage, level: lvl, boss, big, mon: BS ? BS.mon : null };
}
function elemMult(a, d, special) { if (!special || !a.el || a.el === 'none' || a.el === 'dragon') return 1;   // V1.53 雙屬性相乘；龍屬性被打一律 ×0.75（全抗性）
  const one = y => !y || y === 'none' ? 1 : y === 'dragon' ? .75 : (BEATS[a.el] || []).includes(y) ? 1.4 : (BEATS[y] || []).includes(a.el) ? .75 : 1;
  return Math.round(one(d.el) * one(d.el2) * 1000) / 1000; }
/* 預估傷害（不含隨機與會心一擊）：用來顯示「這一擊強不強」、判斷是不是快撐不住了 */
function expectDamage(a, d, special, boost = 1) {
  const pow = special ? (a.el === 'none' ? 1.15 : 1.3) : 1, ch = a.charged ? CONFIG.chargeMult : 1;
  let dmg = Math.max(1, Math.round(a.atk * pow * (a.atk / (a.atk + d.def)) * 1.6 * elemMult(a, d, special) * ch * boost));
  if (d.guard) dmg = Math.max(1, Math.round(dmg * .5)); return dmg;
}
const RPS = ['rock', 'scissors', 'paper'];
/* 猜拳：me 為 null（沒選）算輸。回傳 { result, mult } */
function rps(me, foe) {
  const R = CONFIG.rps;
  if (!RPS.includes(me)) return { result: 'lose', mult: R.lose };
  if (me === foe) return { result: 'tie', mult: R.tie };
  const win = (me === 'rock' && foe === 'scissors') || (me === 'scissors' && foe === 'paper') || (me === 'paper' && foe === 'rock');
  return win ? { result: 'win', mult: R.win } : { result: 'lose', mult: R.lose };
}
function bondBoost(taps) {
  const P = CONFIG.bond.steps; taps = Math.max(0, num(taps, 0));
  for (let i = 1; i < P.length; i++) if (taps <= P[i][0]) { const [x0, y0] = P[i - 1], [x1, y1] = P[i]; return Math.round((y0 + (y1 - y0) * (taps - x0) / (x1 - x0)) * 100) / 100; }
  return P[P.length - 1][1];
}
function damage(a, d, special, r = Math.random, boost = 1) {
  const pow = (special ? (a.el === 'none' ? 1.15 : 1.3) * (1 + (a.spUp || 0)) : 1) * (a.charged ? CONFIG.chargeMult : 1) * boost; a.charged = false;
  const mult = elemMult(a, d, special);
  let dmg = Math.max(1, Math.round(a.atk * pow * (a.atk / (a.atk + d.def)) * 1.6 * mult * (.85 + r() * .3)));
  if (a.reap) dmg = Math.round(dmg * (1 + a.reap * (1 - d.hp / d.max)));   // V1.86 靈魂收割：你的血越少打越痛
  if (special && d.spCut) dmg = Math.max(1, Math.round(dmg * (1 - d.spCut)));   // 苔石鎧甲：屬性攻擊打不痛
  if (d.stiffCut) dmg = Math.max(1, Math.round(dmg * (1 - d.stiffCut)));   // 越打越硬／不死骨架
  if (d.guard) { dmg = Math.max(1, Math.round(dmg * .5)); d.guard = false; }
  if (d.dmgCut) dmg = Math.max(1, Math.round(dmg * (1 - d.dmgCut)));
  if (d.roundCut) dmg = Math.max(1, Math.round(dmg * (1 - d.roundCut)));   // 大地壁壘（這一回合）
  if (d.halfNext) { dmg = Math.max(1, Math.round(dmg * .5)); d.halfNext = false; }   // 烈焰護盾／星光守護
  let reflect = 0; if (d.counterRefl) { reflect += Math.max(1, Math.round(dmg * d.counterRefl)); d.counterRefl = 0; } if (d.wallT > 0) { dmg = Math.max(1, Math.round(dmg * (1 - (d.wallCut || .5)))); reflect += Math.max(1, Math.round(dmg * (d.wallReflect || .3))); }   // V1.54 骸骨鐵壁
  const crit = r() < .08 + (a.critUp || 0); if (crit) dmg = Math.round(dmg * (1 + .5 * (1 - (d.critRes || 0))));   // 堅石之軀：抗暴擊
  let amulet = false; if (d.amulet) { dmg = Math.max(1, Math.round(dmg * .5)); d.amulet = false; amulet = true; }   // V1.83 小護身符：擋一次，傷害減半
  let endured = false, sprouted = false;
  if (dmg >= d.hp && d.sprout && !d.sproutUsed) { d.sproutUsed = true; if (r() < d.sprout) { dmg = d.hp - 1; sprouted = true; } }   // V1.86 生生不息
  if (!sprouted && dmg >= d.hp && d.endure) { dmg = d.hp - 1; d.endure = false; endured = true; }
  let revived = false; if (dmg >= d.hp && d.revive) { d.hp = Math.max(1, Math.round(d.max * d.revive)); d.revive = 0; revived = true; } else d.hp = Math.max(0, d.hp - dmg);   // V1.52 不死鳥羽毛
  return { dmg, mult, crit, endured, revived, reflect, amulet, sprouted };
}
function finishAdventure(st, n, result, full, now = Date.now(), r = Math.random) {
  const A = CONFIG.adventure, out = { xp: 0, coins: 0, food: 0, seeds: 0, unlocked: 0, events: [] };
  if (result === 'win' || result === 'loss') st.mood = clamp(st.mood + (result === 'win' ? A.winMood : A.lossMood));
  if (result === 'win') {
    st.adv.wins++; track(st, 'win', now);
    const xp = Math.round((A.xp + CONFIG.battleWin.xp) * CONFIG.battleLen.reward);   // V1.86 戰鬥變長，經驗金幣也多一點
    if (full) { const T = trait(st); out.xp = addXP(st, xp); out.coins = Math.round((A.coinsMin + Math.floor(r() * (A.coinsMax - A.coinsMin + 1))) * CONFIG.battleLen.reward); if (T.coinX && r() < T.coinChance) { out.coins = Math.round(out.coins * T.coinX); out.coinBonus = true; } st.coins += out.coins;
      if (T.seedChance && r() < T.seedChance) { st.inv.seeds++; out.bonusSeed = 1; } if (T.berryChance && r() < T.berryChance) { const b = 1 + Math.floor(r() * 2); st.inv.berry = (st.inv.berry || 0) + b; out.berry = b; } st.inv.seeds += A.seeds; out.seeds = A.seeds; st.path.flame += A.flame + CONFIG.battleWin.flame;
      { const fb = foeFor(n); if (fb.boss) { const bc = fb.big ? CONFIG.bossCoins.big : CONFIG.bossCoins.mini; st.coins += bc; out.coins += bc; out.bossCoins = bc; } }
      if (n === CONFIG.ember.stage && !st.emberOwned) { st.emberOwned = true; out.ember = 1; journal(st, now, '打倒大王，得到了「經驗火種」！'); } }
    else out.xp = addXP(st, Math.round(xp * A.overCapXpRate));
    const LK = fossilLuck(st);   // V1.83 化石：掉寶率加成
    if (r() < A.dropFood + LK) { st.inv.food++; out.food = 1; }
    if (r() < CONFIG.potion.drop + LK) { st.inv.potion++; out.potion = 1; }
    { const boss = !!foeFor(n).boss, PD = CONFIG.powerDrop, PW = Object.keys(CONFIG.foods).filter(x => CONFIG.foods[x].power);   // V1.73 能力水果、稀有種子
      if (boss || r() < PD.win + LK) { const k = PW[Math.floor(r() * PW.length) % PW.length]; st.inv[k] = (st.inv[k] || 0) + 1; out.power = k; }
      if (boss || r() < PD.seed + LK) { st.inv.seeds3 = (st.inv.seeds3 || 0) + 1; out.seeds3 = 1; }
      if (boss && (foeFor(n).big || r() < CONFIG.magicSeed.miniDrop)) { st.inv.seeds4 = (st.inv.seeds4 || 0) + 1; out.seeds4 = 1; } }
    { const BS = CONFIG.bosses[n]; if (BS) { const got = st.relicGot || (st.relicGot = []), first = !got.includes(n);   // V1.52 王的寶箱：第一次一定掉，之後 20%
      if (first || r() < CONFIG.relics.repeatDrop) { if (first) got.push(n); const iv = st.inv.relics || (st.inv.relics = {}); iv[BS.relic] = (iv[BS.relic] || 0) + 1; out.relic = BS.relic; out.chest = n % 10 === 0 ? 'gold' : 'bronze';
        journal(st, now, `打開${n % 10 === 0 ? '金' : '銅'}寶箱，得到寶物「${CONFIG.relics.items[BS.relic].name}」！`); } } }
    if (CONFIG.piggy.coreStages.includes(n) && !(st.pigCores || (st.pigCores = [])).includes(n)) { st.pigCores.push(n); out.pigCore = pigLevel(st); journal(st, now, `第 ${n} 關王掉了「小豬撲滿核心碎片」！小豬撲滿升到 ${pigLevel(st)} 級`); }   // V1.43
    if (CONFIG.ascend.bigBoss.includes(n) && st.route) {   // 第 10／20／30 關大王：這個屬性各掉一次終極素材
      const got = st.matGot[st.route] || (st.matGot[st.route] = []);
      if (!got.includes(n)) { got.push(n); st.inv.mats[st.route] = (st.inv.mats[st.route] || 0) + 1; out.mat = st.route; out.matN = st.inv.mats[st.route]; journal(st, now, `第 ${n} 關大王掉了「${CONFIG.materials[st.route]}」（${Math.min(st.inv.mats[st.route], CONFIG.ascend.mats)}/${CONFIG.ascend.mats}）`); } }
    if (n === CONFIG.starHeart.stage && st.route) {   // 第 40 關大王：星辰之心＋星辰碎片
      const got = st.matGot[st.route] || (st.matGot[st.route] = []);
      if (!got.includes(n)) { got.push(n); st.inv.hearts++; st.inv.shards++; out.heart = 1; out.shard = 1; journal(st, now, '打倒最終大王！得到「星辰之心」和「星辰碎片」'); }
      else if (r() < CONFIG.starHeart.shardRepeat) { st.inv.shards++; out.shard = 1; } }
    if (foeFor(n).route === 'earth') st.earthWins = (st.earthWins || 0) + 1;
    if (n === st.adv.stage) {                                   // 第一次打通：新地點 = 探索發現
      st.adv.stage++; out.unlocked = st.adv.stage; discover(st, now, null); out.events.push('place');
      for (const ev in CONFIG.bossStages) if (CONFIG.bossStages[ev] === n) { const e = discover(st, now, ev); if (e) out.events.push(e); }
    }
  } else if (result === 'loss') { st.adv.losses++; out.xp = addXP(st, CONFIG.battleLoss.xp); }
  return out;
}

/* ---------------- V1.83 釣魚、生活技能 ---------------- */
// 時段：早 5–10、午 10–17、黃昏 17–19、夜 19–5（台灣時間）；天氣沿用 weatherAt
const FISH = {
  f_creek:   { name: '小溪魚',   star: 1, price: 5 , mv: 'calm' },
  f_carp:    { name: '鯉魚',     star: 1, price: 8,   t: ['morning', 'day'], w: ['clear'] , mv: 'calm' },
  f_catfish: { name: '鯰魚',     star: 2, price: 15,  t: ['night'] , mv: 'dart' },
  f_ayu:     { name: '香魚',     star: 2, price: 15,  t: ['morning'], w: ['clear', 'breeze'] , mv: 'zig' },
  f_rain:    { name: '雨點魚',   star: 2, price: 18,  w: ['rain'] , mv: 'sine' },
  f_koi:     { name: '錦鯉',     star: 3, price: 35,  t: ['day'], w: ['clear'] , mv: 'float' },
  f_dew:     { name: '晨露魚',   star: 3, price: 35,  t: ['morning'], w: ['breeze'] , mv: 'sine' },
  f_sunset:  { name: '夕陽鱒',   star: 3, price: 40,  t: ['dusk'], w: ['clear'] , mv: 'zig' },
  f_moon:    { name: '月光魚',   star: 3, price: 40,  t: ['night'], w: ['clear'] , mv: 'float' },
  f_eel:     { name: '雷光鰻',   star: 3, price: 45,  w: ['storm'] , mv: 'burst' },
  f_rainbow: { name: '彩虹鱒',   star: 4, price: 90,  t: ['morning'], w: ['rain'] , mv: 'float' },
  f_star:    { name: '星空魚',   star: 4, price: 90,  t: ['night'], w: ['breeze'] , mv: 'float' },
  f_king:    { name: '暴風鯰王', star: 5, price: 200, t: ['night'], w: ['storm'] , mv: 'burst' },
  f_dragon:  { name: '金龍魚',   star: 5, price: 250, t: ['dusk'], w: ['storm'], rod: 'gold' , mv: 'float' },
};
const JUNK = { j_boot: { name: '舊靴子', price: 2 }, j_can: { name: '空罐', price: 1 } };
const SLOT_NAME = { morning: '早上', day: '中午', dusk: '黃昏', night: '晚上' }, WEATHER_NAME = { clear: '晴天', breeze: '微風', rain: '下雨', storm: '暴風雨' };
const GOODS = {
  gem_ruby: { name: '紅寶石', price: 80 }, gem_sapphire: { name: '藍寶石', price: 120 }, gem_emerald: { name: '綠寶石', price: 200 },
  scrap: { name: '廢鐵', price: 20 }, amulet: { name: '小護身符', price: 0 },
};
const FOSSILS = { fo_trilobite: '三葉蟲化石', fo_ammonite: '菊石', fo_tooth: '恐龍牙化石', fo_feather: '羽毛化石', fo_fish: '魚化石', fo_amber: '琥珀' };
const RODS = [{ id: 'bamboo', name: '破爛釣竿', price: 0, bar: .20, steady: 0 }, { id: 'carbon', name: '碳纖竿', price: 300, bar: .30, steady: .5 }, { id: 'gold', name: '黃金釣竿', price: 1200, bar: .40, steady: .8 }];   // V1.84 綠框 20／30／40%
const SKILL = {
  flame: { name: '小當家', icon: '🔥' }, tide: { name: '捕魚', icon: '💧' }, forest: { name: '催熟', icon: '🌿' }, earth: { name: '挖寶', icon: '🪨' },
  bird: { name: '採集', icon: '🐦' }, elec: { name: '發電', icon: '⚡' }, metal: { name: '回收', icon: '⚙️' },
};
function fishSlot(now = Date.now()) { const h = hourIn(now); return h >= 5 && h < 10 ? 'morning' : h < 17 && h >= 10 ? 'day' : h >= 17 && h < 19 ? 'dusk' : 'night'; }
function fishOf(st) {
  const F = st.fish || (st.fish = {}); F.rod = RODS.some(r => r.id === F.rod) ? F.rod : 'bamboo';
  for (const k of ['raw', 'cooked', 'dex', 'junk']) if (!F[k] || typeof F[k] !== 'object') F[k] = {};
  if (!Array.isArray(F.rods)) F.rods = RODS.slice(0, RODS.findIndex(r => r.id === F.rod) + 1).map(r => r.id); if (!F.rods.includes('bamboo')) F.rods.unshift('bamboo'); if (!F.rods.includes(F.rod)) F.rods.push(F.rod);
  F.bait = F.bait || 0; F.bait2 = F.bait2 || 0; F.zap = Array.isArray(F.zap) ? F.zap : ['', 0]; return F;
}
function lootOf(st) { const L = st.loot || (st.loot = {}); if (!L.fossils || typeof L.fossils !== 'object') L.fossils = {}; for (const k in GOODS) L[k] = L[k] || 0; return L; }
const rodOf = st => RODS.find(r => r.id === fishOf(st).rod);
/* 生活技能：成年（含高階）才開放；目前這隻＋一起出來的那隻，同一系只算一次 */
const adultPet = p => !!(p && p.hatched !== false && p.route && (p.stage === 'adult' || p.stage === 'ascended') && !p.runaway);
function skillPets(st) { const out = []; for (const p of [st.hatched ? st : null, st.pair]) if (adultPet(p) && !out.some(o => o.route === p.route)) out.push({ route: p.route, name: p.name || '幻獸' }); return out; }
const hasSkill = (st, route) => skillPets(st).some(p => p.route === route);
const fossilLuck = st => { const n = Object.keys(lootOf(st).fossils).length; return n * CONFIG.skills.fossilLuck + (n >= 6 ? CONFIG.skills.fossilAll : 0); };
function fishPool(st, now = Date.now()) {
  const t = fishSlot(now), w = weatherAt(now), rod = rodOf(st).id;
  return Object.entries(FISH).filter(([, f]) => (!f.t || f.t.includes(t)) && (!f.w || f.w.includes(w)) && (!f.rod || f.rod === rod)).map(([k]) => k);
}
function buyBait(st, kind, n = 1) {
  const P = kind === 'premium' ? CONFIG.fishing.bait2 : CONFIG.fishing.bait, cost = P * n, F = fishOf(st);
  if (st.coins < cost) return { ok: false, msg: `金幣不夠（要 ${cost}）` };
  st.coins -= cost; F[kind === 'premium' ? 'bait2' : 'bait'] += n; return { ok: true, msg: `買了 ${n} 個${kind === 'premium' ? '高級魚餌' : '魚餌'}` };
}
function buyRod(st, id) {
  const R = RODS.find(r => r.id === id), F = fishOf(st);
  if (!R) return { ok: false, msg: '沒有這支魚竿' };
  if (F.rods.includes(id)) return { ok: false, msg: '已經有這支魚竿了' };
  if (st.coins < R.price) return { ok: false, msg: `金幣不夠（要 ${R.price}）` };
  st.coins -= R.price; F.rods.push(id); F.rod = id; return { ok: true, msg: `買了${R.name}，已經換上！🎣` };
}
function selectRod(st, id) { const F = fishOf(st), R = RODS.find(r => r.id === id); if (!R || !F.rods.includes(id)) return { ok: false, msg: '還沒有這支魚竿' }; F.rod = id; return { ok: true, msg: `換上${R.name}` }; }
/* 拋竿：先扣魚餌、決定這一竿會是什麼（UI 再玩拉條）。zap＝雷系電魚（每天前 3 竿保證釣到） */
/* power：蓄力甩竿的力道 0～1，甩越遠越容易釣到好魚 */
function castLine(st, now = Date.now(), r = Math.random, premium = false, power = .5) {
  const F = fishOf(st), C = CONFIG.fishing, key = premium ? 'bait2' : 'bait';
  if (st.hatched && st.energy < C.minEnergy) return { ok: false, code: 'tired', msg: `牠太累了（拋一次要 ${C.minEnergy} 體力），先休息一下吧` };
  if (F[key] < 1) return { ok: false, code: 'nobait', msg: premium ? '沒有高級魚餌了' : '沒有魚餌了（釣具店可以買，5 金幣一個）' };
  F[key]--; if (st.hatched) st.energy = clamp(st.energy - C.energy);   // V1.84 拋一次竿花一點體力
  const pool = fishPool(st, now), list = [];
  const pw = Math.max(0, Math.min(1, +power || 0));
  for (const k of pool) { const s = FISH[k].star; list.push([k, C.weight[s - 1] * (premium && s >= 3 ? C.premiumX : 1) * (s >= 3 ? 1 + 1.5 * pw : s === 2 ? 1 + .6 * pw : 1)]); }
  for (const [k, w] of Object.entries(C.junk)) list.push([k, w * (1.15 - .35 * pw)]);
  let tot = list.reduce((a, b) => a + b[1], 0), x = r() * tot, pick = list[list.length - 1][0];
  for (const [k, w] of list) { if (x < w) { pick = k; break; } x -= w; }
  const day = dayKey(now); if (F.zap[0] !== day) F.zap = [day, 0];
  const zap = hasSkill(st, 'elec') && F.zap[1] < C.zapPerDay; if (zap) F.zap[1]++;
  return { ok: true, key: pick, star: FISH[pick] ? FISH[pick].star : 0, heavy: !FISH[pick], mv: FISH[pick] ? FISH[pick].mv : null, power: pw, zap, bar: rodOf(st).bar + (hasSkill(st, 'tide') ? C.tideBar : 0), steady: rodOf(st).steady };
}
/* 收竿：ok＝拉條成功 */
function landFish(st, key, ok, r = Math.random) {
  if (!ok) return { ok: false, msg: '啊…魚跑掉了 💦' };
  const F = fishOf(st);
  if (key === 'chest') { if (r() < .5) { const c = 20 + Math.floor(r() * 41); st.coins += c; return { ok: true, key, coins: c, msg: `釣到小寶箱！裡面有 ${c} 金幣 🪙` }; } st.inv.seeds2 = (st.inv.seeds2 || 0) + 1; return { ok: true, key, seeds2: 1, msg: '釣到小寶箱！裡面有 1 顆優良種子 🌟' }; }
  if (JUNK[key]) { F.junk[key] = (F.junk[key] || 0) + 1; return { ok: true, key, junk: 1, msg: `釣到${JUNK[key].name}…（${hasSkill(st, 'metal') ? '鋼系會幫你回收' : '可以賣 ' + JUNK[key].price + ' 金幣'}）` }; }
  const f = FISH[key]; if (!f) return { ok: false, msg: '?' };
  const first = !F.dex[key]; F.dex[key] = (F.dex[key] || 0) + 1; F.raw[key] = (F.raw[key] || 0) + 1;
  let xp = 0; if (st.hatched) xp = addXP(st, CONFIG.fishing.xp * f.star);
  return { ok: true, key, first, xp, msg: `釣到${'★'.repeat(f.star)} ${f.name}！${first ? '（新魚種，記進圖鑑了）' : ''}` };
}
const fishFood = (key, cooked) => { const s = FISH[key].star, C = CONFIG.fishing, k = cooked ? C.cookX : 1; return { hunger: Math.round((C.eatHunger + (s - 1) * C.eatStep) * k), energy: Math.round((C.eatEnergy + (s - 1) * C.eatStep) * k) }; };
function eatFish(st, key, now = Date.now()) {
  const tm = applyTime(st, now), F = fishOf(st), f = FISH[key];
  if (!st.hatched) return { ok: false, msg: '先把蛋孵出來吧！', tm };
  if (st.sleeping) return { ok: false, msg: '牠在睡覺，醒來再吃吧', tm };
  if (!f) return { ok: false, msg: '?', tm };
  const cooked = (F.cooked[key] || 0) > 0; if (!cooked) return { ok: false, code: F.raw[key] > 0 ? 'raw' : 'none', msg: F.raw[key] > 0 ? `生的${f.name}不能吃，先到 🧺 魚簍烤一下吧` : `沒有烤${f.name}了`, tm };   // V1.84 幻獸不吃生魚
  if (st.hunger >= CONFIG.full) return { ok: false, msg: '牠已經吃飽了', tm };
  F[cooked ? 'cooked' : 'raw'][key]--; const E = fishFood(key, cooked);
  st.hunger = clamp(st.hunger + E.hunger); st.energy = clamp(st.energy + E.energy); const xp = addXP(st, 2 + f.star);
  return { ok: true, tm, cooked, xp, left: 'fbone', msg: `${cooked ? '烤' : '生'}${f.name}好好吃！飽食 +${E.hunger}、體力 +${E.energy}` };
}
function cookFish(st, key) {
  const F = fishOf(st), f = FISH[key]; if (!f || !(F.raw[key] > 0)) return { ok: false, msg: '沒有生魚可以烤' };
  const free = hasSkill(st, 'flame'), cost = free ? 0 : CONFIG.fishing.cookCost;
  if (st.coins < cost) return { ok: false, msg: `柴火要 ${cost} 金幣` };
  st.coins -= cost; F.raw[key]--; F.cooked[key] = (F.cooked[key] || 0) + 1;
  return { ok: true, msg: `烤好一條${f.name} 🔥${cost ? `（柴火 −${cost}）` : '（火系幫忙，免費）'}` };
}
function sellFish(st, key) {
  const F = fishOf(st), L = lootOf(st);
  if (FISH[key]) { const src = F.raw[key] > 0 ? 'raw' : F.cooked[key] > 0 ? 'cooked' : null; if (!src) return { ok: false, msg: '沒有這種魚了' }; F[src][key]--; st.coins += FISH[key].price; return { ok: true, msg: `賣掉 1 條${FISH[key].name}，+${FISH[key].price} 金幣` }; }
  if (JUNK[key]) { if (!(F.junk[key] > 0)) return { ok: false, msg: '沒有了' }; F.junk[key]--; st.coins += JUNK[key].price; return { ok: true, msg: `賣掉${JUNK[key].name}，+${JUNK[key].price} 金幣` }; }
  if (GOODS[key] && GOODS[key].price) { if (!(L[key] > 0)) return { ok: false, msg: '沒有了' }; L[key]--; st.coins += GOODS[key].price; return { ok: true, msg: `賣掉${GOODS[key].name}，+${GOODS[key].price} 金幣` }; }
  return { ok: false, msg: '這個不能賣' };
}
/* 每天一次：成年幻獸自動做生活技能，回傳今天的收穫（UI 跳視窗） */
function runSkills(st, now = Date.now(), r = Math.random) {
  const day = dayKey(now), pets = skillPets(st); if (!pets.length || st.skillDay === day) return null;
  if (!st.skillDay) { st.skillDay = day; }   // 第一次成年當天也算
  st.skillDay = day; const out = [], F = fishOf(st), L = lootOf(st), K = CONFIG.skills, ri = (a, b) => a + Math.floor(r() * (b - a + 1));
  for (const p of pets) {
    const it = { route: p.route, name: p.name, skill: SKILL[p.route].name, got: [] }, G = (icon, text) => it.got.push({ icon, text });
    if (p.route === 'tide') { const n = ri(1, 2), pool = Object.keys(FISH).filter(k => FISH[k].star <= 3 && !FISH[k].rod); for (let i = 0; i < n; i++) { const k = pool[Math.floor(r() * pool.length) % pool.length]; F.raw[k] = (F.raw[k] || 0) + 1; F.dex[k] = (F.dex[k] || 0) + 1; G(k, FISH[k].name); } }
    if (p.route === 'earth') { const c = ri(K.digMin, K.digMax); st.coins += c; G('coin', `${c} 金幣`);
      if (r() < K.gemChance) { const x = r(), g = x < .5 ? 'gem_ruby' : x < .85 ? 'gem_sapphire' : 'gem_emerald'; L[g]++; G(g, GOODS[g].name); }
      if (r() < K.fossilChance) { const ks = Object.keys(FOSSILS), miss = ks.filter(k => !L.fossils[k]), k = (miss.length ? miss : ks)[Math.floor(r() * (miss.length || ks.length)) % (miss.length || ks.length)]; if (L.fossils[k]) { st.coins += K.fossilDup; G(k, `${FOSSILS[k]}（重複，換 ${K.fossilDup} 金幣）`); } else { L.fossils[k] = 1; G(k, `${FOSSILS[k]}！掉寶率 +${Math.round(K.fossilLuck * 100)}%`); } } }
    if (p.route === 'bird') { const n = ri(1, 2); for (let i = 0; i < n; i++) { const x = r();
        if (x < K.birdPower) { const PW = Object.keys(CONFIG.foods).filter(k => CONFIG.foods[k].power), k = PW[Math.floor(r() * PW.length) % PW.length]; st.inv[k] = (st.inv[k] || 0) + 1; G(CONFIG.foods[k].icon, CONFIG.foods[k].name + '（能力水果！）'); }
        else if (x < .4) { st.inv.food++; G('apple', '蘋果'); } else if (x < .6) { st.inv.berry = (st.inv.berry || 0) + 1; G('berry', '莓果'); }
        else if (x < .8) { const c = ri(10, 30); st.coins += c; G('coin', `${c} 金幣`); } else if (x < .92) { st.inv.potion++; G('potion', '回復藥水'); } else { st.inv.seeds3 = (st.inv.seeds3 || 0) + 1; G('seed3', '稀有種子'); } } }
    if (p.route === 'elec') { const c = ri(K.powerMin, K.powerMax); st.coins += c; G('coin', `發電賺了 ${c} 金幣`); G('gen_on', `今天前 ${CONFIG.fishing.zapPerDay} 竿電魚保證釣到`); }
    if (p.route === 'metal') { let n = 0; for (const k in F.junk) { n += F.junk[k] || 0; F.junk[k] = 0; } if (n) { L.scrap += n; G('scrap', `回收 ${n} 個破銅爛鐵 → 廢鐵（一個賣 ${GOODS.scrap.price}）`); }
      if (r() < K.amuletChance) { L.amulet++; G('amulet', '做好 1 個小護身符（冒險時擋一次傷害）'); } if (!it.got.length) G('scrap', '今天沒有東西可以回收'); }
    if (p.route === 'flame') { let n = 0; for (const k in F.raw) { const c = F.raw[k] || 0; if (c) { F.cooked[k] = (F.cooked[k] || 0) + c; F.raw[k] = 0; n += c; } } G('grill_fish', n ? `烤好 ${n} 條魚` : '背包沒有生魚，烤了地瓜自己吃 😋');
      let rot = 0; (st.plots || []).forEach((pl, i) => { const q = plotState(st, i, now); if (q && q.rotten) { pl.at = 0; delete pl.g; rot++; } }); if (rot) G('ic_fly', `燒掉 ${rot} 塊爛掉的作物`); }
    if (p.route === 'forest') G('ic_el_leaf', `田裡的作物都長快 ${Math.round((K.grow - 1) * 100)}%`);
    out.push(it);
  }
  return { day, list: out };
}

/* ---------------- 家園種植（GDD 第 3 節） ---------------- */
function plotState(st, i, now = Date.now()) {
  const p = st.plots[i]; if (!p) return null;
  if (!p.at) return { empty: true, progress: 0, left: 0 };
  const grow = growHoursOf(st, p.g || 0) * H, el = Math.max(0, now - p.at);   // 時間倒退時不會變成負的
  const F = CONFIG.farm, after = (el - grow) / H;   // 成熟後過了幾小時：太久沒收會過熟、再久會爛掉
  return { empty: false, kind: PLOT_KINDS.includes(p.k) ? p.k : 'food', progress: Math.min(1, el / grow), ripe: el >= grow, left: Math.max(0, grow - el), over: after >= F.freshHours && after < F.rotHours, rotten: after >= F.rotHours, freshLeft: Math.max(0, (F.freshHours - after) * H) };
}
const growHoursOf = (st, g = 0) => (CONFIG.farm.growBy[g] || CONFIG.farm.growHours) / (st && hasSkill(st, 'forest') ? CONFIG.skills.grow : 1);   // V1.83 種子越好長越久；草系快 20%
const PLOT_KINDS = ['food', 'berry', 'cranberry', 'blueberry', 'strawberry', 'dragon', 'melonw', 'melon', 'potato', 'nut', 'coconut', 'banana'];
function pickFruit(good, r = Math.random) { const T = CONFIG.seedOdds[good === 'rare' ? 'rare' : good ? 'good' : 'normal']; let x = r(); for (const [k, p] of T) { if (x < p) return k; x -= p; } return T[T.length - 1][0]; }
function plant(st, i, now = Date.now(), r = Math.random, good = false) {
  const q = plotState(st, i, now); if (!q) return { ok: false, msg: '沒有這塊田' };
  if (!q.empty) return { ok: false, msg: '這塊田已經種了東西' };
  const magic = good === 'magic', myst = good === 'mystery', key = magic ? 'seeds4' : myst ? 'seeds3' : good ? 'seeds2' : 'seeds';
  if ((st.inv[key] || 0) < 1) return { ok: false, code: 'noseed', msg: magic ? '沒有神奇種子了（打贏王才拿得到）' : myst ? '沒有稀有種子了（冒險、打王才撿得到）' : good ? '沒有優良種子了（商店道具可以買）' : '沒有種子了（冒險有機會撿到，或花金幣買）' };
  st.inv[key]--; st.plots[i].at = now; const PW0 = Object.keys(CONFIG.foods).filter(x => CONFIG.foods[x].power); st.plots[i].k = magic ? PW0[Math.floor(r() * PW0.length) % PW0.length] : pickFruit(myst ? 'rare' : !!good, r); if (good) st.plots[i].g = magic ? 3 : myst ? 2 : 1; else delete st.plots[i].g; track(st, 'plant', now);   // 長出來才知道：紅色＝蘋果、紫色＝莓果
  const hh = +growHoursOf(st, st.plots[i].g || 0).toFixed(1);
  if (magic) return { ok: true, msg: `種下一顆神奇種子 ✨（${hh} 小時後一定長出能力水果！）` };
  if (myst) return { ok: true, msg: `種下一顆稀有種子 🔮（${hh} 小時後成熟，比較容易長出草莓，還有機會長出能力水果！）` };
  return { ok: true, msg: good ? `種下一顆優良種子 🌟（${hh} 小時後收成，比較多、比較容易長出藍莓、草莓）` : `種下一顆綜合種子 🌱（${hh} 小時後收成：蔓越莓、藍莓或草莓）` };
}
function harvest(st, i, now = Date.now(), r = Math.random) {
  const q = plotState(st, i, now); if (!q || q.empty) return { ok: false, msg: '這塊田是空的' };
  if (!q.ripe) return { ok: false, msg: `還沒成熟，再等 ${Math.ceil(q.left / MIN)} 分鐘` };
  const F = CONFIG.farm, k = q.kind, name = CONFIG.foods[k].name, g = st.plots[i].g || 0, good = g >= 1, myst = g === 2, magic = g === 3, G = CONFIG.goodSeed; st.plots[i].at = 0; delete st.plots[i].g;
  if (q.rotten) { track(st, 'harvest', now); return { ok: true, rotten: true, n: 0, xp: 0, msg: `${name}放太久爛掉了…只好丟掉 🪰` }; }
  const MG = CONFIG.magicSeed, lo = magic ? MG.min : good ? G.fruitMin : F.fruitMin, hi = magic ? MG.maxN : good ? G.fruitMax : F.fruitMax, n = lo + Math.floor(r() * (hi - lo + 1));
  const PW = Object.keys(CONFIG.foods).filter(x => CONFIG.foods[x].power), M = CONFIG.mysterySeed;
  let bonus = null, bn = 0; if (magic) {} else if (myst ? r() < M.powerChance : good && r() < G.powerChance) { bonus = PW[Math.floor(r() * PW.length) % PW.length]; bn = myst ? M.powerMin + Math.floor(r() * (M.powerMax - M.powerMin + 1)) : 1; st.inv[bonus] = (st.inv[bonus] || 0) + bn; }
  st.inv[k] = (st.inv[k] || 0) + n; if (FRESH_KEYS.includes(k)) st.inv.fresh[k] = (st.inv.fresh[k] || 0) + n; st.harvests++;   // V1.77 過熟的也還是自己種的：會發光、能賣、體力 +5
  let xp = 0; if (st.hatched) { xp = addXP(st, F.xp); st.path.forest += F.forest; }
  track(st, 'harvest', now);
  if (st.harvests === CONFIG.harvestsForOldTree) journal(st, now, `收成第 ${st.harvests} 次了！`);
  return { ok: true, kind: k, n, over: q.over, xp, good, myst, magic, bonus, bonusN: bn, forest: st.hatched ? F.forest : 0, msg: (magic ? `✨神奇種子長出了能力水果！${name} +${n}` : q.over ? `${name}有點過熟了，趕快收！收成 ${n} 顆` : `收成！✨${name} +${n}`) + (bonus ? `、⚡能力水果 ${CONFIG.foods[bonus].name} +${bn}！` : '') + (xp ? `、經驗 +${xp}、🌿 森 +${F.forest}` : '') };
}
function buySeed(st) {
  const P = CONFIG.farm.seedPrice; if (st.coins < P) return { ok: false, msg: `金幣不足（種子 ${P} 金幣）` };
  st.coins -= P; st.inv.seeds++; return { ok: true, msg: `買了 1 顆種子（−${P} 金幣）` };
}

/* ---------------- 商店與房間裝飾 ---------------- */
function buyDecor(st, id) {
  const it = CONFIG.decor[id]; if (!it) return { ok: false, msg: '沒有這個商品' };
  if (st.decor.owned.includes(id)) return { ok: false, msg: '已經擁有了' };
  if (st.coins < it.price) return { ok: false, msg: `金幣不足（需要 ${it.price}）` };
  st.coins -= it.price; st.decor.owned.push(id); st.decor.placed[it.slot] = id;
  if (id === 'toy_ball') { st.ballBroken = false; st.ballUses = 0; return { ok: true, msg: '買了「彈力球」！院子和房間都可以拿來玩' }; }
  return { ok: true, msg: `買了「${it.name}」，已經擺進房間！` };
}
function placeDecor(st, id, where) {
  const it = CONFIG.decor[id]; if (!it || !st.decor.owned.includes(id)) return { ok: false, msg: '還沒有這個家具' };
  const P = where === 'lounge' && it.slot !== 'paper' ? st.lounge.decor.placed : st.decor.placed;   // 壁紙兩邊同步   // V1.86.7 休息室有自己的擺法（家具共用）
  if (P[it.slot] === id) { if (it.slot === 'paper') return { ok: false, msg: '壁紙不能拿掉，可以換別的' }; delete P[it.slot]; return { ok: true, msg: `收起「${it.name}」` }; }
  P[it.slot] = id; return { ok: true, msg: `擺上「${it.name}」` };
}
/* 第二張床（兩隻一起睡）：已擁有的床可以擺到左邊的床位，同一張床可以兩邊都擺 */
function placeBed2(st, id) {
  const it = CONFIG.decor[id]; if (!it || it.slot !== 'bed' || !st.decor.owned.includes(id)) return { ok: false, msg: '還沒有這張床' };
  if (st.decor.placed.bed2 === id) { delete st.decor.placed.bed2; return { ok: true, msg: `收起左邊的「${it.name}」` }; }
  st.decor.placed.bed2 = id; return { ok: true, msg: `左邊也擺上「${it.name}」，兩隻都有床睡了！` };
}
function buyItem(st, kind) {
  const price = CONFIG.foods[kind] ? CONFIG.foods[kind].price : kind === 'seeds' ? CONFIG.farm.seedPrice : kind === 'seeds2' ? CONFIG.goodSeed.price : kind === 'candy' ? CONFIG.candy.price : kind === 'potion' ? CONFIG.potion.price : kind === 'potion2' ? CONFIG.superPotion.price : kind === 'elixir' ? CONFIG.elixir.price : kind === 'soup' ? CONFIG.soup.price : 0;
  if (!price || (CONFIG.foods[kind] && (CONFIG.foods[kind].power || CONFIG.foods[kind].farm))) return { ok: false, msg: '這個商店沒有賣' };
  if (st.coins < price) return { ok: false, msg: `金幣不足（需要 ${price}）` };
  st.coins -= price; st.inv[kind] = (st.inv[kind] || 0) + 1; return { ok: true, msg: `買了 1 個${ITEM_NAME[kind] || CONFIG.foods[kind].name}（−${price} 金幣）` };
}
const ITEM_NAME = { food: '食物', seeds: '種子', seeds2: '優良種子', seeds3: '稀有種子', seeds4: '神奇種子', candy: '星星糖', potion: '回復藥水', potion2: '超級藥水', elixir: '萬靈藥', soup: '神秘婆婆熬製雞湯' };
/* V1.40 神秘婆婆熬製雞湯：消除羈絆之力後的休息時間 */
function useSoup(st, now = Date.now()) {
  const tm = applyTime(st, now);
  if (!st.hatched) return { ok: false, msg: '先把蛋孵出來吧！', tm };
  if (st.sleeping) return { ok: false, msg: '牠在睡覺，醒來再喝吧', tm };
  if ((st.inv.soup || 0) < 1) return { ok: false, msg: '沒有雞湯了', tm };
  const S = CONFIG.soup, rest = (st.bondRestUntil || 0) > now; st.inv.soup--; st.bondRestUntil = 0;
  const sx = hasSkill(st, 'flame') ? CONFIG.skills.soupX : 1, SH = Math.round(S.hunger * sx), SM = Math.round(S.mood * sx), SE = Math.round(S.energy * sx);   // V1.83 火系：雞湯加熱 +50%
  st.hunger = clamp(st.hunger + SH); st.mood = clamp(st.mood + SM); st.energy = clamp(st.energy + SE);
  return { ok: true, rest, tm, msg: `咕嚕咕嚕…${sx > 1 ? '熱騰騰的' : '神秘婆婆的'}雞湯好補！飽食 +${SH}、心情 +${SM}、體力 +${SE}${rest ? '，馬上恢復精神，可以再去冒險了' : ''} 🍲` };
}
/* V1.41 訓練場：每次 20 金幣，玩小遊戲，達成目標才拿到經驗 */
function canTrain(st) {
  if (!st.hatched) return '先孵化幻獸才能訓練';
  if (st.runaway) return '牠離家出走了，先把牠找回來吧';
  if (st.sleeping) return '牠在睡覺，先叫醒牠吧';
  if (st.energy < CONFIG.train.minEnergy) return `體力要 ${CONFIG.train.minEnergy} 以上才能訓練`;
  if (st.coins < CONFIG.train.cost) return `訓練要 ${CONFIG.train.cost} 金幣（器材＋場地費）`;
  return null;
}
const trainXp = st => Math.round((CONFIG.train.base + CONFIG.train.perLv * level(st.xp)) * (trait(st).xp || 1));
function startTrain(st, kind, now = Date.now()) {
  const tm = applyTime(st, now); if (!CONFIG.train.kinds[kind]) return { ok: false, msg: '沒有這個訓練', tm };
  const why = canTrain(st); if (why) return { ok: false, msg: why, tm };
  const T = CONFIG.train; st.coins -= T.cost; st.energy = clamp(st.energy + T.energy); st.hunger = clamp(st.hunger + T.hunger); st.clean = clamp(st.clean + T.clean);
  st.trains = (st.trains || 0) + 1; return { ok: true, tm };
}
function finishTrain(st, kind, success, now = Date.now()) {
  const K = CONFIG.train.kinds[kind]; if (!K) return { ok: false, xp: 0 };
  if (!success) return { ok: true, success: false, xp: 0 };
  const xp = addXP(st, CONFIG.train.base + CONFIG.train.perLv * level(st.xp));
  const tl = st.trainLog || (st.trainLog = { dodge: 0, attack: 0, defense: 0 }), gain = !st.awake && hasHeritage(st) ? CONFIG.heritage.train : 1, cap = Math.round(CONFIG.trainBonus.max / CONFIG.trainBonus.per); tl[K.skill] = Math.min(cap, (tl[K.skill] || 0) + gain);
  if (tl.dodge + tl.attack + tl.defense === 1) journal(st, now, '第一次訓練成功！');
  return { ok: true, success: true, xp };
}
const FRESH_KEYS = ['food', 'berry', 'cranberry', 'blueberry', 'strawberry'];   // 自己種的（會發光、能賣）
/* V1.44 迎接新的蛋要花錢 */
const eggPrice = st => CONFIG.eggPrice[Math.min(CONFIG.eggPrice.length - 1, st.eggBuys || 0)];
function buyEgg(st) { const p = eggPrice(st); if (st.coins < p) return { ok: false, msg: `金幣不足（新的蛋要 ${p} 金幣）` }; st.coins -= p; st.eggBuys = (st.eggBuys || 0) + 1; return { ok: true, price: p }; }
function fixFresh(st) { const f = st.inv.fresh || (st.inv.fresh = {}); for (const k of FRESH_KEYS) f[k] = Math.min(f[k] || 0, st.inv[k] || 0); }
/* 賣自己種的水果（一顆 15 元）。商店買來的不能賣，避免買低賣高 */
function sellFruit(st, kind) {
  fixFresh(st); const price = CONFIG.sellFruit[kind];
  if (!price) return { ok: false, msg: '這個不能賣' };
  if ((st.inv.fresh[kind] || 0) < 1) return { ok: false, msg: '只能賣自己種出來的水果喔' };
  st.inv[kind]--; st.inv.fresh[kind]--; st.coins += price;
  return { ok: true, msg: `賣掉 1 個${CONFIG.foods[kind].name}，+${price} 金幣` };
}
/* 擴建田地：第 4、5、6 格 */
function expandFarm(st) {
  const F = CONFIG.farm, n = st.plots.length;
  if (n >= F.maxPlots) return { ok: false, msg: '田已經最大了' };
  const price = F.expand[n - F.plots];
  if (st.coins < price) return { ok: false, msg: `金幣不夠（需要 ${price}）` };
  st.coins -= price; st.plots.push({ at: 0 });
  return { ok: true, msg: `田地擴建到 ${st.plots.length} 格！（−${price} 金幣）` };
}
const expandPrice = st => st.plots.length >= CONFIG.farm.maxPlots ? null : CONFIG.farm.expand[st.plots.length - CONFIG.farm.plots];
/* 經驗火種：心情 +10、體力 +20、經驗 +20 */
/* V1.85 經驗火種：給一隻幻獸帶著（用 seed 認牠）；牠沒上場，戰鬥贏了也分到 70% 經驗 */
function allPets(st) { const L = []; if (st.hatched) L.push({ ref: 'cur', p: st }); if (st.pair) L.push({ ref: 'pair', p: st.pair }); (st.roster || []).forEach((p, i) => L.push({ ref: 'r' + i, p })); return L; }
function giveEmber(st, seed) { if (!st.emberOwned) return { ok: false, msg: '還沒有經驗火種（第一次打倒第 10 關大王會得到）' }; const t = allPets(st).find(x => x.p.seed === seed); if (!t) return { ok: false, msg: '找不到這隻' }; st.emberOn = seed; return { ok: true, msg: `🔥 經驗火種交給 ${t.p.name} 帶著了` }; }
function emberShare(st, xp, inBattle) {   // inBattle：這場有上場的幻獸 seed 清單
  if (!st.emberOwned || st.emberOn == null || !(xp > 0)) return null; const t = allPets(st).find(x => x.p.seed === st.emberOn); if (!t || inBattle.includes(t.p.seed)) return null;
  const n = Math.round(xp * CONFIG.ember.share); if (t.ref === 'cur') addXP(st, n); else { t.p.xp += n; } return { name: t.p.name, xp: n };
}
/* V1.85 出戰隊伍：選主角（lead）和一起上場的夥伴（partner，可以沒有）；用調換位置的方式，主角變成「現在照顧的」、夥伴變成「在外面陪你的」 */
function setTeam(st, leadRef, partnerRef, now = Date.now()) {
  if (leadRef === partnerRef) partnerRef = null; applyTime(st, now); if (st.runaway) return { ok: false, msg: '牠離家出走了，先把牠找回來吧' };
  const all = allPets(st).map(x => ({ ref: x.ref, p: x.ref === 'cur' ? snapshotPet(st) : x.p })), lead = all.find(x => x.ref === leadRef), part = partnerRef ? all.find(x => x.ref === partnerRef) : null;
  if (!lead) return { ok: false, msg: '找不到這隻' };
  const rest = all.filter(x => x !== lead && x !== part).map(x => x.p), sl = st.sleeping;
  if (lead.ref !== 'cur') { Object.assign(st, JSON.parse(JSON.stringify(lead.p))); st.sleeping = false; st.lastTick = now; } else st.sleeping = sl;
  st.pair = part ? JSON.parse(JSON.stringify(part.p)) : null; st.roster = rest.map(p => JSON.parse(JSON.stringify(p)));
  return { ok: true, msg: part ? `${st.name} 和 ${st.pair.name} 一起出發！` : `${st.name} 出發！` };
}
/* V1.85 訓練階段：每練成一次升一階，最多 10 階；1–3 普通、4–6 有點難、7–9 困難、10 最困難 */
const TRAIN_TIER = ['普通', '有點難', '困難', '最困難'];
const trainLvOf = (st, k) => Math.min(10, ((st.trainLv || {})[k] || 0) + 1);
const trainTier = lv => lv >= 10 ? 3 : lv >= 7 ? 2 : lv >= 4 ? 1 : 0;
function trainLvUp(st, k) { const T = st.trainLv || (st.trainLv = {}); T[k] = Math.min(9, (T[k] || 0) + 1); return trainLvOf(st, k); }
function useEmber(st, now = Date.now()) {
  const tm = applyTime(st, now);
  if (!st.hatched) return { ok: false, msg: '先把蛋孵出來吧！', tm };
  if (st.sleeping) return { ok: false, msg: '牠在睡覺，醒來再吃吧', tm };
  if ((st.inv.ember || 0) < 1) return { ok: false, msg: '沒有經驗火種', tm };
  const E = CONFIG.ember; st.inv.ember--; st.mood = clamp(st.mood + E.mood); st.energy = clamp(st.energy + E.energy);
  return { ok: true, xp: addXP(st, E.xp), msg: '吃下經驗火種，全身暖呼呼！🔥', tm };
}
function useCandy(st, now = Date.now()) {
  const tm = applyTime(st, now);
  if (!st.hatched) return { ok: false, msg: '先把蛋孵出來吧！', tm };
  if (st.sleeping) return { ok: false, msg: '牠在睡覺，醒來再吃吧', tm };
  if (st.inv.candy < 1) return { ok: false, msg: '沒有星星糖了', tm };
  const L = level(st.xp); if (L >= MAX_LV) return { ok: false, msg: `已經是最高等級 Lv.${MAX_LV} 了`, tm };
  const C = CONFIG.candy; st.inv.candy--; st.mood = clamp(st.mood + C.mood); st.hunger = clamp(st.hunger + C.hunger);
  const gain = Math.ceil(XPK * L * L) - st.xp; st.xp += gain;   // 直接升到下一級
  return { ok: true, xp: gain, lv: L + 1, msg: `甜甜的星星糖！升到 Lv.${L + 1} 了 ✨`, tm };
}

/* ---------------- 果核（餵食後留下，要點一下清掉） ---------------- */
function canAct(st, a, now = Date.now()) {
  if (!st.hatched) return '先把蛋孵出來吧！';
  if (st.runaway) return '牠離家出走了…要走路找牠回來';
  if (st.sleeping) return a === 'sleep' ? null : '噓…牠在睡覺，先叫醒牠吧';
  if (a === 'feed') { if (st.hunger >= CONFIG.full) return '飽飽的，吃不下了～'; if (!Object.keys(CONFIG.foods).some(k => (st.inv[k] || 0) > 0) && st.coins < Math.min(...Object.values(CONFIG.foods).map(f => f.price))) return '沒有食物也沒有金幣了…可以去「採集」或種田'; }
  if (a === 'play' && st.energy < CONFIG.play.minEnergy) return '太累了…先讓牠休息或睡一下';
  if (a === 'sleep' && st.view !== 'room') return '外面不能睡覺，要回小窩裡睡喔';
  if (a === 'wash') { if (st.clean >= CONFIG.full) return '已經很乾淨了！'; const w = st.care.bathLastAt + CONFIG.wash.cooldownMin * MIN - now; if (w > 0) return `剛洗過澡，${Math.ceil(w / MIN)} 分鐘後再洗吧`; if (st.coins < washCost(st)) return `沒有錢付水費了（洗一次 ${washCost(st)} 金幣）`; }
  if (a === 'play' && st.ballBroken && st.coins < CONFIG.ballCost) return `球爆掉了，要 ${CONFIG.ballCost} 金幣買新球`;
  return null;
}
const rotMin = c => c.k === 'poop' ? CONFIG.poop.rotMin : CONFIG.core.rotMin;
/* V1.86.6 吃完留下的東西：果核、肉骨頭、魚骨、各種果皮果殼 */
const CORE_KINDS = ['core', 'poop', 'bone', 'fbone', 'banana', 'melonw', 'melon', 'dragon', 'coconut', 'nut', 'potato'];
const LEFT_NAME = { core: '果核', poop: '大便', bone: '肉骨頭', fbone: '魚骨', banana: '香蕉皮', melonw: '西瓜皮', melon: '哈密瓜皮', dragon: '火龍果皮', coconut: '椰子殼', nut: '堅果殼', potato: '地瓜皮' };
function addCore(st, x, now = Date.now(), v = 'yard', k = 'core') { st.cores.push({ x: clamp(x, 4, 124), at: now, v: ['room', 'lounge'].includes(v) ? v : 'yard', k: CORE_KINDS.includes(k) ? k : 'core' }); while (st.cores.length > CONFIG.core.max) st.cores.shift(); }
const isRotten = (c, now = Date.now()) => now - c.at >= rotMin(c) * MIN;
function clearCore(st, i, now = Date.now()) { const c = st.cores[i]; if (!c) return null; applyTime(st, now); const k = st.cores.indexOf(c); if (k >= 0) st.cores.splice(k, 1); st.cleanups++; if (st.hatched) st.path.metal += 1; return { rotten: isRotten(c, now), kind: c.k }; }

/* ---------------- 頂球小遊戲 ---------------- */
function finishBallGame(st, score, now = Date.now()) {
  const G = CONFIG.ballGame; score = int(score, 0, 0, G.max);
  const r = act(st, 'play', now); if (!r.ok) return r;
  const counted = Math.min(score, G.goalCap), coins = Math.min(G.coinMax, Math.floor(score / G.coinEvery));
  st.ball.goals += counted; st.path.bird += 2 * counted; st.coins += coins;
  const gx = score > 0 ? addXP(st, Math.min(G.xpMax, score * G.xpPer)) : 0; r.xp = (r.xp || 0) + gx; r.goalXp = gx;
  const best = score > st.ball.best; if (best) { st.ball.best = score; if (score > 0) journal(st, now, `頂球創新紀錄：連續進 ${score} 球！`); }
  return Object.assign(r, { score, best, coins });
}

/* ---------------- 小窩：升級、讓多隻寵物住進來 ---------------- */
const PET_FIELDS = ['nestUntil', 'trainLv', 'relics', 'fosterPaid', 'trainLog', 'seed', 'genes', 'sex', 'ascBase', 'awake', 'name', 'hatched', 'stage', 'route', 'xp', 'hunger', 'mood', 'clean', 'energy', 'bond', 'path', 'care', 'events', 'hatchedAt'];
function snapshotPet(st) { const p = {}; for (const k of PET_FIELDS) if (st[k] !== undefined) p[k] = JSON.parse(JSON.stringify(st[k])); p.sleeping = false; return p; }
function sanitizePet(p, now = Date.now()) { const r = sanitize(Object.assign({ v: 6 }, p, { roster: [], dex: [], pair: null }), now); return snapshotPet(r); }
/* V1.45 神秘老爺爺的家：寄養不想養的幻獸（不佔小窩、數值不會變），每隻付一次錢 */
function fosterOut(st, i, now = Date.now()) {
  const p = st.roster[i]; if (!p) return { ok: false, msg: '小窩裡沒有這隻' };
  const P = CONFIG.foster.price; if (!p.fosterPaid) { if (st.coins < P) return { ok: false, msg: `寄養要 ${P} 金幣（每隻只付一次）` }; st.coins -= P; p.fosterPaid = true; }
  st.roster.splice(i, 1); (st.foster || (st.foster = [])).push(p); journal(st, now, `把 ${p.name} 寄養在神秘老爺爺家`); return { ok: true, msg: `${p.name} 去神秘老爺爺家住了，隨時可以接回來` };
}
function fosterBack(st, j, now = Date.now()) {
  const p = (st.foster || [])[j]; if (!p) return { ok: false, msg: '老爺爺家沒有這隻' };
  if (petCount(st) >= denCap(st)) return { ok: false, msg: '小窩住滿了，先升級小窩或把別隻寄養' };
  st.foster.splice(j, 1); st.roster.push(p); journal(st, now, `從神秘老爺爺家接回 ${p.name}`); return { ok: true, msg: `${p.name} 回到小窩了！` };
}
function buyFusionHouse(st) { const P = CONFIG.fusionHouse.price; if (st.fusionHouse) return { ok: false, msg: '已經佈置好血繼小屋了' }; if (st.coins < P) return { ok: false, msg: `金幣不足（需要 ${P}）` }; st.coins -= P; st.fusionHouse = true; return { ok: true, msg: '血繼小屋佈置好了！特殊幻獸可以住進來了' }; }
const denCap = st => CONFIG.den[st.den.level - 1].cap;
const petCount = st => (st.hatched ? 1 : 0) + (st.pair ? 1 : 0) + st.roster.length;
function upgradeDen(st) {
  const next = CONFIG.den[st.den.level]; if (!next) return { ok: false, msg: '已經是最大的小窩了' };
  if (st.coins < next.cost) return { ok: false, msg: `金幣不足（需要 ${next.cost}）` };
  st.coins -= next.cost; st.den.level++; return { ok: true, msg: `小窩升級成「${next.name}」！可以住 ${next.cap} 隻` };
}
/* 迎接新蛋時：小窩還有空位 → 目前的夥伴搬進小窩休息；沒空位 → 告別（留在圖鑑） */
function moveToDen(st) { if (!st.hatched || petCount(st) >= denCap(st)) return false; st.roster.push(snapshotPet(st)); return true; }
/* V1.86.2 孵新蛋時：小窩有位子就搬進小窩；滿了就免費去神秘老爺爺家住，不會再告別 */
function moveOut(st, now = Date.now()) { if (!st.hatched) return null; if (moveToDen(st)) return 'den'; const p = snapshotPet(st); p.fosterPaid = true; (st.foster || (st.foster = [])).push(p); journal(st, now, `${st.name} 去神秘老爺爺家住了（小窩滿了）`); return 'foster'; }
const eggReady = (e, now = Date.now()) => !(e.ready > now);
/* V1.86.4 新手手冊：做到目前這一步，就給獎勵、換下一步 */
function guideStep(st) { const G = st.guide || (st.guide = { i: 0, off: false }); if (G.off) return null; return CONFIG.guide[G.i] || null; }
function guideDo(st, k, now = Date.now()) {
  const S = guideStep(st); if (!S || S.k !== k) return null; st.coins += S.coins; for (const x in S.inv || {}) st.inv[x] = (st.inv[x] || 0) + S.inv[x];
  st.guide.i++; journal(st, now, `新手手冊：完成「${S.t}」`); return { step: S, n: st.guide.i, total: CONFIG.guide.length, done: st.guide.i >= CONFIG.guide.length };
}
/* V1.86.3 從老爺爺家直接換出來陪你：現在照顧的那隻搬進小窩（滿了就換去老爺爺家，免費） */
function fosterSwap(st, j, now = Date.now()) {
  const L = st.foster || [], p = L[j]; if (!p) return { ok: false, msg: '老爺爺家沒有這隻' }; if (inNest(st, now)) return { ok: false, msg: `${st.name} 在愛的小窩裡，等牠出來再換` };
  applyTime(st, now); L.splice(j, 1); const old = st.name; let where = null;
  if (st.hatched) { const o = snapshotPet(st); o.fosterPaid = true; if (petCount(st) - 1 < denCap(st) - 0 && st.roster.length + 1 + (st.pair ? 1 : 0) < denCap(st)) { st.roster.push(o); where = 'den'; } else { L.push(o); where = 'foster'; } }
  Object.assign(st, JSON.parse(JSON.stringify(p))); st.sleeping = false; st.lastTick = now; st.eggTaps = 0;
  journal(st, now, `把 ${st.name} 從神秘老爺爺家接回來陪你`);
  return { ok: true, msg: `${st.name} 回來陪你了！${where === 'den' ? `${old} 搬進小窩休息` : where === 'foster' ? `${old} 去老爺爺家住（免費，隨時能接回）` : ''}` };
}
/* 圖鑑：這隻現在在哪裡 */
/* V1.86.7 放生：小窩或老爺爺家的幻獸可以放生（回到大自然，不能找回）；身上的寶物放回背包 */
function releasePet(st, where, i, now = Date.now()) {
  const L = where === 'foster' ? (st.foster || []) : st.roster, p = L[i]; if (!p) return { ok: false, msg: '找不到這隻' }; if (inNest(p, now)) return { ok: false, msg: `${p.name} 正在愛的小窩裡，等牠出來再說` };
  for (const k of [...(p.relics || [])]) unequipRelic(st, p, k);
  const id = gidOf(p); L.splice(i, 1); if (st.emberOn === p.seed) st.emberOn = null;
  const e = (st.dex || []).find(x => x.id === id); if (e) e.rel = 1;
  journal(st, now, `${p.name} 被放生，回到大自然了 🍃`); return { ok: true, msg: `🍃 ${p.name} 回到大自然了，祝牠一路平安`, p };
}
function whereIs(st, id, now = Date.now()) {
  if (st.hatched && gidOf(st) === id) return inNest(st, now) ? 'nest' : 'cur';
  if (st.pair && gidOf(st.pair) === id) return inNest(st.pair, now) ? 'nest' : 'pair';
  if (st.roster.some(p => gidOf(p) === id)) return st.roster.some(p => gidOf(p) === id && inNest(p, now)) ? 'nest' : 'den';
  if ((st.foster || []).some(p => gidOf(p) === id)) return 'foster';
  return (st.dex || []).some(e => e.id === id && e.rel) ? 'released' : 'gone';
}
/* V1.86.2 找回以前告別的幻獸：照圖鑑的紀錄請老爺爺找回來（經驗回到那個階段的起點） */
function ownedIds(st) { const L = []; if (st.hatched) L.push(gidOf(st)); if (st.pair) L.push(gidOf(st.pair)); for (const p of st.roster) L.push(gidOf(p)); for (const p of st.foster || []) L.push(gidOf(p)); return new Set(L); }
function lostPets(st) { const own = ownedIds(st); return (st.dex || []).filter(e => e.id && !e.rel && !own.has(e.id) && e.stage && !['egg', 'baby'].includes(e.stage) && e.petName); }
function recallLost(st, id, now = Date.now()) {
  const e = lostPets(st).find(x => x.id === id); if (!e) return { ok: false, msg: '找不到這隻（可能已經在你身邊了）' };
  const o = { hatched: true, name: e.petName, stage: e.stage, route: e.route || null, hatchedAt: e.at || now, xp: (CONFIG.stages[e.stage] || {}).xp || 0, bond: 0, hunger: 80, mood: 80, clean: 80, energy: 80, lastTick: now };
  if (id.startsWith('x:')) o.genes = id.slice(2); else if (id.startsWith('g:')) o.seed = +id.slice(2); else o.seed = null;
  const p = sanitizePet(o, now); p.fosterPaid = true; (st.foster || (st.foster = [])).push(p); journal(st, now, `神秘老爺爺幫忙找回了 ${p.name}`);
  return { ok: true, msg: `🏡 神秘老爺爺找到「${p.name}」了！牠在老爺爺家等你，到小窩就能接回來`, p };
}
/* V1.86.7 休息室：投餵機升級後，在休息的寵物每小時慢慢長經驗（不會升到超過上限、在愛的小窩裡的不算） */
function loungeTick(st, now = Date.now()) {
  const L = st.lounge; if (!L) return; if (!L.at || now < L.at) { L.at = now; return; }
  const xpH = CONFIG.lounge[L.lv - 1].xpH; if (!xpH) { L.at = now; return; }
  const n = Math.floor((Math.min(now - L.at, CONFIG.offlineCapHours * H) / H) * xpH); if (n < 1) return;
  L.at += n / xpH * H; if (now - L.at > CONFIG.offlineCapHours * H) L.at = now;
  for (const p of st.roster) if (p.hatched !== false && !inNest(p, now)) p.xp = Math.min((p.xp || 0) + n, XPK * (MAX_LV - 1) ** 2);
}
function upgradeLounge(st, now = Date.now()) {
  const L = st.lounge, nx = CONFIG.lounge[L.lv]; if (!nx) return { ok: false, msg: '已經是最好的投餵機了' };
  if (st.coins < nx.cost) return { ok: false, msg: `金幣不足（需要 ${nx.cost}）` };
  loungeTick(st, now); st.coins -= nx.cost; L.lv++; L.at = now; journal(st, now, `休息室換成「${nx.name}」投餵機`);
  return { ok: true, msg: `🎉 休息室換成「${nx.name}」投餵機了！休息的夥伴會慢慢變強` };
}
function swapPet(st, i, now = Date.now()) {
  const p = st.roster[i]; if (!p) return { ok: false, msg: '小窩裡沒有這隻' };
  applyTime(st, now);
  if (inNest(p, now)) return { ok: false, msg: `${p.name} 正在愛的小窩裡，等牠出來再換` };
  const out = st.hatched ? snapshotPet(st) : null;
  Object.assign(st, JSON.parse(JSON.stringify(p))); st.sleeping = false; st.lastTick = now; st.eggTaps = 0;   // 在小窩休息時數值不變
  st.roster.splice(i, 1); if (out) st.roster.push(out);
  return { ok: true, msg: `${st.name} 出來陪你了！` };
}

/* ---------------- 兩隻一起出來 ---------------- */
function bringOut(st, i, now = Date.now()) {
  const p = st.roster[i]; if (!p) return { ok: false, msg: '小窩裡沒有這隻' };
  if (!st.hatched) return { ok: false, msg: '先孵化現在的蛋' };
  if (st.pair) return { ok: false, msg: `已經有 ${st.pair.name} 陪著了（最多兩隻一起出來）` };
  applyTime(st, now); st.pair = JSON.parse(JSON.stringify(p)); st.roster.splice(i, 1);
  return { ok: true, msg: `${st.pair.name} 也出來一起玩了！` };
}
function sendIn(st, now = Date.now()) {
  if (!st.pair) return { ok: false, msg: '沒有第二隻在外面' };
  applyTime(st, now); const p = st.pair; st.pair = null; st.roster.push(p);
  return { ok: true, msg: `${p.name} 回小窩休息了` };
}
/* 換照顧另一隻：兩隻的資料互換（睡覺狀態、時間不變） */
function switchPair(st, now = Date.now()) {
  if (!st.pair || !st.hatched) return { ok: false, msg: '只有一隻在外面' };
  if (st.runaway) return { ok: false, msg: '牠離家出走了，先把牠找回來吧' };
  applyTime(st, now); const sl = st.sleeping, a = snapshotPet(st), b = st.pair;
  Object.assign(st, JSON.parse(JSON.stringify(b))); st.pair = a; st.sleeping = sl;
  return { ok: true, msg: `現在照顧 ${st.name}` };
}
/* 一起冒險：第二隻也要有體力；出發時一樣消耗 */
function pairCanJoin(st) { const p = st.pair; return !!(p && p.hatched && !inNest(p) && p.energy >= CONFIG.pair.advMinEnergy); }
function pairAdventureCost(st) { if (!pairCanJoin(st)) return false; const A = CONFIG.adventure, p = st.pair; p.energy = clamp(p.energy + A.energy); p.hunger = clamp(p.hunger + A.hunger); p.clean = clamp(p.clean + A.clean); return true; }
function pairGain(st, xp, result) { const p = st.pair; if (!p) return 0; const n = Math.max(0, Math.round(xp * CONFIG.pair.xpShare * (traitOf(p.route).xp || 1))); p.xp += n;
  if (result === 'win' || result === 'loss') p.mood = clamp(p.mood + (result === 'win' ? CONFIG.adventure.winMood : CONFIG.adventure.lossMood)); return n; }
function pairStages(st, now = Date.now()) {   // 第二隻也會長大：暫時換成主角檢查一次
  if (!st.pair) return []; const sl = st.sleeping, a = snapshotPet(st), b = st.pair; Object.assign(st, JSON.parse(JSON.stringify(b)));
  const out = checkStages(st, now).map(e => Object.assign(e, { name: st.name })); const nb = snapshotPet(st); Object.assign(st, a); st.pair = nb; st.sleeping = sl; return out;
}

/* ---------------- 愛的小窩：自己的一公一母成年幻獸生蛋 ---------------- */
function buyLoveNest(st) { const C = CONFIG.loveNest; if (st.loveNest) return { ok: false, msg: '已經有愛的小窩了' }; if (st.coins < C.cost) return { ok: false, msg: `金幣不足（需要 ${C.cost}）` }; st.coins -= C.cost; st.loveNest = true; return { ok: true, msg: '蓋好愛的小窩了！💕' }; }
const isAdult = p => p && (p.stage === 'adult' || p.stage === 'ascended');
function lovePartners(st) { const out = []; if (st.pair) out.push({ ref: 'pair', p: st.pair }); st.roster.forEach((p, i) => out.push({ ref: i, p })); return out.filter(x => isAdult(x.p) && x.p.sex !== st.sex); }
function canLove(st, ref, now = Date.now()) {
  const C = CONFIG.loveNest, B = CONFIG.breed;
  if (!st.loveNest) return `要先花 ${C.cost} 金幣蓋「愛的小窩」`;
  if (!isAdult(st)) return `${st.name} 要先長到成年期`;
  const p = ref === 'pair' ? st.pair : st.roster[ref]; if (!p) return '找不到這隻';
  if (!isAdult(p)) return `${p.name} 還沒長到成年期`;
  if (p.sex === st.sex) return '要一公一母才能生蛋喔';
  if (now < st.loveAt + C.cooldownH * H) return `⏳ 還要 ${Math.ceil((st.loveAt + C.cooldownH * H - now) / MIN)} 分鐘，牠們才想再進愛的小窩`;
  if (st.mood < B.minMood) return `${st.name} 的心情要 ${B.minMood}% 以上`;
  if (st.loveEgg) return `${st.loveEgg.names} 還在${st.loveEgg.away ? '朋友家' : '愛的小窩裡'}，等牠們回來再說`;
  if (st.eggs.length >= B.basket) return `蛋籃滿了（最多 ${B.basket} 顆）`;
  return null;
}
function love(st, ref, now = Date.now(), r = Math.random) {
  applyTime(st, now); const why = canLove(st, ref, now); if (why) return { ok: false, msg: why };
  const p = ref === 'pair' ? st.pair : st.roster[ref], G = breedGenome(genomeFromId(gidOf(st)), genomeFromId(gidOf(p)), r);
  st.loveAt = now; st.mood = clamp(st.mood + CONFIG.loveNest.mood); p.mood = clamp(p.mood + CONFIG.loveNest.mood);
  const end = now + CONFIG.breed.nestHours * H, egg = { id: 'x:' + encodeGenome(G), from: `${st.name} ♥ ${p.name}` };
  st.loveEgg = { id: egg.id, from: egg.from, end, names: `${st.name} 和 ${p.name}`, away: 0 }; st.nestUntil = end; p.nestUntil = end;
  journal(st, now, `${st.name} 和 ${p.name} 一起住進愛的小窩 💕`);
  return { ok: true, egg, G, partner: p.name };
}

/* ---------------- 每日小目標（GDD 第 5 節：3 個任選，不強迫全清） ---------------- */
/* need：★／★★／★★★ 三種難度的基本數量；{n} 會換成實際數量 */
const GOALS = {
  feed:    { t: '餵食 {n} 次',            ev: 'feed',    need: [1, 3, 5] },
  play:    { t: '陪牠玩耍 {n} 次',        ev: 'play',    need: [1, 3, 5] },
  wash:    { t: '幫牠洗澡 {n} 次',        ev: 'wash',    need: [1, 2, 3] },
  pet:     { t: '摸摸牠（有親密度）{n} 次', ev: 'pet',   need: [1, 2, 3] },
  adv:     { t: '出發冒險 {n} 次',        ev: 'adv',     need: [1, 2, 4] },
  win:     { t: '打贏 {n} 場戰鬥',        ev: 'win',     need: [1, 2, 3] },
  plant:   { t: '種下 {n} 顆種子',        ev: 'plant',   need: [1, 2, 4] },
  harvest: { t: '收成 {n} 次',            ev: 'harvest', need: [1, 2, 3] },
  steps:   { t: '走 {n} 步',              ev: 'steps',   need: [2000, 4000, 6000] }   // 一天 8,000 步就很了不起：最多只要求 8,000
};
const GOAL_IDS = Object.keys(GOALS);
function goalsFor(key) {   // 用日期當亂數種子：同一天每次打開都一樣
  let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const r = rng(h), pool = GOAL_IDS.slice(), out = [];
  while (out.length < CONFIG.goals.perDay) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}
/* 任務等級越高：需要的數量越多（每級 +20%）、獎勵越好（每級 +20%） */
function goalNeed(id, tier, lv) { const b = GOALS[id].need[tier]; return id === 'steps' ? Math.min(8000, Math.round(b * (1 + CONFIG.goals.needPerLv * lv) / 500) * 500) : b + Math.floor(b * CONFIG.goals.needPerLv * lv + .0001 + (lv >= 3 ? 1 : 0) * (tier > 0 ? 1 : 0)); }
function goalReward(tier, lv) { const G = CONFIG.goals, m = 1 + G.rewardPerLv * lv; return { coins: Math.round(G.coins[tier] * m), seeds: tier >= 1 ? 1 + (lv >= 5 ? 1 : 0) : 0, bonus: tier === 2 }; }
function goalText(g) { return GOALS[g.id].t.replace('{n}', g.need >= 1000 ? g.need.toLocaleString('en-US') : g.need); }
function ensureGoals(st, now = Date.now()) {
  const k = dayKey(now);
  if (st.goals.date === k) return false;
  if (st.goals.date && k < st.goals.date) return false;            // 時間倒退：不換新目標
  const lv = st.goalLv || 0;
  st.goals = { date: k, list: goalsFor(k).map((id, tier) => ({ id, tier, need: goalNeed(id, tier, lv), n: 0, claimed: false })) };
  return true;
}
function track(st, ev, now = Date.now(), amount = 1) {
  ensureGoals(st, now);
  for (const g of st.goals.list) if (GOALS[g.id].ev === ev && !g.claimed) g.n = Math.min(g.need, g.n + amount);
}
function claimGoal(st, idx, now = Date.now(), r = Math.random) {
  ensureGoals(st, now); const g = st.goals.list[idx];
  if (!g) return { ok: false, msg: '沒有這個目標' };
  if (g.claimed) return { ok: false, msg: '已經領過了' };
  if (g.n < g.need) return { ok: false, msg: '還沒完成' };
  g.claimed = true; const lv = st.goalLv || 0, rw = goalReward(g.tier, lv), got = [];
  st.coins += rw.coins; got.push(`金幣 +${rw.coins}`);
  if (rw.seeds) { st.inv.seeds += rw.seeds; got.push(`種子 +${rw.seeds}`); }
  if (rw.bonus) {   // ★★★ 額外寶物：自己屬性的能力水果、回復藥水或星星糖
    const own = Object.keys(CONFIG.foods).find(k => CONFIG.foods[k].power && CONFIG.foods[k].el === st.route), x = r();
    const k = x < .45 && own ? own : x < .75 ? 'potion' : 'candy'; st.inv[k] = (st.inv[k] || 0) + 1;
    got.push(`${k === 'potion' ? '回復藥水' : k === 'candy' ? '星星糖' : CONFIG.foods[k].name} +1`);
  }
  let up = false;
  if (st.goals.list.every(x => x.claimed) && lv < CONFIG.goals.maxLv) { st.goalLv = lv + 1; up = true; journal(st, now, `每日任務全部完成！任務等級提升到 Lv.${st.goalLv}`); }
  return { ok: true, up, msg: got.join('、') + (up ? `\n🌟 今天的任務全部完成！任務等級 Lv.${st.goalLv}：明天更難、獎勵更好` : '') };
}

/* ---------------- 雷系：戰鬥中蓄力、羈絆之力 ---------------- */
function battleCharge(st) { if (st.hatched) st.path.elec += 1; }
function canBond(st) { return st.coins < CONFIG.bond.cost ? `要 ${CONFIG.bond.cost} 金幣買加油棒才能發動` : null; }
function battleBond(st, now = Date.now()) { if (canBond(st)) return false; st.coins -= CONFIG.bond.cost; st.bondRestUntil = now + CONFIG.bond.restHours * H; st.bondUses++; if (st.hatched) st.path.elec += 3; if (st.bondUses === 1) journal(st, now, '第一次發動羈絆之力！'); return true; }

/* ---------------- 配對 ---------------- */
function canBreed(st, friend, now = Date.now()) {
  const B = CONFIG.breed;
  if (!st.hatched || !(st.stage === 'adult' || st.stage === 'ascended')) return '你的幻獸要先長到成年期才能配對';
  if (!friend.adult) return '朋友的幻獸還沒長到成年期';
  if (!friend.sex) return '這是舊版的配對碼，沒有性別資料，請朋友更新遊戲後重新複製';
  if (friend.sex === st.sex) return `要一公一母才能配對喔（你的是${st.sex === 'm' ? '公' : '母'}的，朋友的也是）`;
  if (now < st.breedAt + B.cooldownH * H) return `⏳ 還要 ${Math.ceil((st.breedAt + B.cooldownH * H - now) / MIN)} 分鐘才能再配對`;
  if (st.mood < B.minMood) return `心情要 ${B.minMood}% 以上（先陪牠玩或摸摸）`;
  if (st.coins < B.cost) return `金幣不足（需要 ${B.cost}）`;
  if (st.loveEgg) return `${st.loveEgg.names} 還在${st.loveEgg.away ? '朋友家' : '愛的小窩裡'}，等牠們回來再說`;
  if (st.eggs.length >= B.basket) return `蛋籃滿了（最多 ${B.basket} 顆）`;
  return null;
}
/* V1.86.2 愛的小窩住滿一天：蛋放進蛋籃（再暖 6 小時才能孵），兩隻出來 */
function loveTick(st, now = Date.now()) {
  const L = st.loveEgg; if (!L || now < L.end) return false; const B = CONFIG.breed;
  st.eggs.push({ id: L.id, from: L.from, at: L.end, ready: L.end + B.eggHours * H, told: 0 });
  const clr = p => { if (p && p.nestUntil) p.nestUntil = 0; }; clr(st); clr(st.pair); (st.roster || []).forEach(clr); (st.foster || []).forEach(clr);
  st.loveNote = `${L.names} 從${L.away ? '朋友家' : '愛的小窩'}回來了！帶回一顆蛋，再 ${B.eggHours} 小時就能孵`; st.loveEgg = null; journal(st, now, `${L.names} 生了一顆蛋 💕`); return true;
}
const inNest = (p, now = Date.now()) => !!(p && p.nestUntil > now);
function breed(st, friend, now = Date.now(), r = Math.random) {
  const why = canBreed(st, friend, now); if (why) return { ok: false, msg: why };
  const G = breedGenome(genomeFromId(gidOf(st)), friend.G, r);
  st.coins -= CONFIG.breed.cost; st.breedAt = now; st.mood = clamp(st.mood + 10);
  const end = now + CONFIG.breed.nestHours * H, host = st.sex === 'f', egg = { id: 'x:' + encodeGenome(G), from: `${st.name} × ${friend.name}` };
  st.loveEgg = { id: egg.id, from: egg.from, end, names: `${st.name} 和 ${friend.name}`, away: host ? 0 : 1 }; st.nestUntil = end;
  journal(st, now, host ? `公的「${friend.name}」來家裡的愛的小窩，陪 ${st.name} 住一天` : `${st.name} 去母的「${friend.name}」家住一天，生完蛋才回來`);
  return { ok: true, egg, G, host };
}

/* ---------------- V1.52 寶物：每隻寵物 2 格，背包裡的可以戴給任何一隻、也可以賣 ---------------- */
function relicCount(st, k) { return (st.inv.relics && st.inv.relics[k]) || 0; }
function equipRelic(st, p, k) { const R = CONFIG.relics.items[k]; if (!R) return { ok: false, msg: '沒有這個寶物' }; if (relicCount(st, k) < 1) return { ok: false, msg: '背包裡沒有這個寶物' };
  const L = p.relics || (p.relics = []); if (L.includes(k)) return { ok: false, msg: '同一種寶物只能戴一個' }; if (L.length >= CONFIG.relics.slots) return { ok: false, msg: `寶物欄位只有 ${CONFIG.relics.slots} 格，先卸下一個` };
  st.inv.relics[k]--; if (!st.inv.relics[k]) delete st.inv.relics[k]; L.push(k); return { ok: true, msg: `${p.name} 戴上了「${R.name}」` }; }
function unequipRelic(st, p, k) { const L = p.relics || []; const i = L.indexOf(k); if (i < 0) return { ok: false, msg: '沒有戴這個寶物' }; L.splice(i, 1); const iv = st.inv.relics || (st.inv.relics = {}); iv[k] = (iv[k] || 0) + 1; return { ok: true, msg: `卸下「${CONFIG.relics.items[k].name}」，放回背包` }; }
function sellRelic(st, k) { const R = CONFIG.relics.items[k]; if (!R || relicCount(st, k) < 1) return { ok: false, msg: '背包裡沒有這個寶物' }; st.inv.relics[k]--; if (!st.inv.relics[k]) delete st.inv.relics[k]; st.coins += CONFIG.relics.sell; return { ok: true, msg: `賣掉「${R.name}」，得到 ${CONFIG.relics.sell} 金幣` }; }

/* ---------------- V1.84 遊戲紀錄、成就徽章、每週回顧 ---------------- */
const EARN_NAME = { adv: '冒險', boss: '打王獎金', sellFruit: '賣水果', sellFish: '賣魚、雜物、寶石', sellRelic: '賣寶物', piggy: '存錢筒', skill: '生活技能', fishChest: '釣魚寶箱', goal: '任務', daily: '每日登入', steps: '步數突破', ball: '頂球', badge: '成就獎勵', other: '其他' };
const SPEND_NAME = { food: '食物', wash: '洗澡水費', toy: '玩具', item: '道具、種子', decor: '家具', fish: '魚餌、魚竿、柴火', farm: '擴建田地', train: '訓練', den: '小窩', egg: '買蛋', breed: '配對', bond: '羈絆', foster: '寄養', piggy: '存錢筒', other: '其他' };
const STAT_KEYS = ['feed', 'wash', 'play', 'sleep', 'clean', 'battle', 'win', 'loss', 'boss', 'crit', 'plant', 'harvest', 'rot', 'cast', 'catch', 'miss', 'chest', 'junk', 'hatch', 'evolve', 'breed', 'berry', 'apple'];
const BADGES = [
  ['feed1', '很會餵的人', '🍽️', 'feed', 100, 50], ['feed2', '靈魂餵手', '🍽️', 'feed', 200, 100], ['feed3', '雷霆·餵你吃到飽', '⚡', 'feed', 300, 200],
  ['wash1', '黃色小鴨陪洗員', '🐤', 'wash', 50, 50], ['wash2', '洗香香達人', '🛁', 'wash', 150, 100],
  ['play1', '陪玩小葛格', '⚽', 'play', 50, 50], ['play2', '很會投啊你', '🏀', 'play', 150, 100],
  ['time1', '初來乍到', '⏱️', 'playH', 1, 30], ['time2', '老友記', '⏳', 'playH', 10, 100], ['time3', '黏踢踢喔', '💞', 'playH', 50, 300],
  ['day1', '一週相伴', '📅', 'days', 7, 50], ['day2', '一個月的約定', '🗓️', 'days', 30, 150], ['day3', '百日之交', '🎖️', 'days', 100, 500],
  ['earn1', '小富翁', '🪙', 'earned', 1000, 50], ['earn2', '很有錢是吧？', '💰', 'earned', 10000, 200],
  ['win1', '很勇', '⚔️', 'win', 20, 30], ['win2', '非常勇', '🗡️', 'win', 50, 60], ['win3', '百戰勇者', '🛡️', 'win', 100, 120], ['win4', '狂戰士', '🔥', 'win', 300, 300],
  ['farm1', '小農夫', '🌱', 'harvest', 50, 50], ['farm2', '綠手指', '🌿', 'harvest', 200, 150],
  ['fish1', '不太會釣魚的手', '🎣', 'catch', 30, 50], ['fish2', '釣魚低手', '🐟', 'catch', 100, 150], ['fish3', '釣魚大師', '🐉', 'star5', 1, 200], ['fishdex', '魚類博士', '📖', 'fishDex', 14, 300],
  ['walk1', '很會走', '👟', 'steps', 100000, 100], ['walk2', '踏破鐵鞋的你', '🥾', 'steps', 500000, 300], ['fossil', '考古學家', '🦴', 'fossils', 6, 200],
];
const BADGE = Object.fromEntries(BADGES.map(([id, name, icon, key, need, coins]) => [id, { id, name, icon, key, need, coins }]));
function statsOf(st, now = Date.now()) {
  let S = st.stats; if (!S || typeof S !== 'object') S = st.stats = {};
  if (!(S.first > 0)) S.first = now; S.play = S.play || 0; S.days = S.days || 0; S.streak = S.streak || 0; S.best = S.best || 0;
  for (const k of ['earn', 'spend', 'cnt', 'today', 'wk']) if (!S[k] || typeof S[k] !== 'object') S[k] = {};
  if (!S.seeded) { S.seeded = 1; const A = st.adv || {}; S.cnt.wash = S.cnt.wash || st.washes || 0; S.cnt.harvest = S.cnt.harvest || st.harvests || 0; S.cnt.win = S.cnt.win || A.wins || 0; S.cnt.loss = S.cnt.loss || A.losses || 0; S.cnt.battle = S.cnt.battle || (A.wins || 0) + (A.losses || 0); }   // 舊存檔：已經有記的次數先接上
  for (const k of STAT_KEYS) S.cnt[k] = S.cnt[k] || 0; S.star5 = S.star5 || 0;
  if (!st.badges || typeof st.badges !== 'object') st.badges = {};
  return S;
}
const sumOf = o => Object.values(o || {}).reduce((a, b) => a + (+b || 0), 0);
function statAdd(st, key, n = 1) { const S = statsOf(st); S.cnt[key] = (S.cnt[key] || 0) + n; }
function statVal(st, key) {
  const S = statsOf(st);
  if (key === 'playH') return S.play / H; if (key === 'days') return S.days; if (key === 'earned') return sumOf(S.earn); if (key === 'star5') return S.star5;
  if (key === 'steps') return (st.steps && st.steps.total) || 0; if (key === 'fossils') return Object.keys((st.loot && st.loot.fossils) || {}).length;
  if (key === 'fishDex') return Object.keys((st.fish && st.fish.dex) || {}).filter(k => FISH[k]).length;
  return S.cnt[key] || 0;
}
function checkBadges(st, now = Date.now()) {
  statsOf(st, now); const got = [];
  for (const b of BADGES.map(x => BADGE[x[0]])) if (!st.badges[b.id] && statVal(st, b.key) >= b.need) { st.badges[b.id] = now; st.coins += b.coins; st.stats.earn.badge = (st.stats.earn.badge || 0) + b.coins; got.push(b); }
  return got;
}
const WEEK_KEYS = () => ['play', 'earned', 'spent', 'feed', 'wash', 'play_', 'win', 'catch', 'harvest', 'steps'];
function weekSnap(st) { const S = statsOf(st); return { play: S.play, earned: sumOf(S.earn), spent: sumOf(S.spend), feed: S.cnt.feed, wash: S.cnt.wash, ball: S.cnt.play, win: S.cnt.win, catch: S.cnt.catch, harvest: S.cnt.harvest, steps: (st.steps && st.steps.total) || 0 }; }
function weekKey(now) { const d = new Date(dayKey(now) + 'T00:00:00Z'), w = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - w); return d.toISOString().slice(0, 10); }   // 每週一開始
/* 每秒呼叫：累計遊玩時間、登入天數、連續天數；換週時算出上週回顧 */
function playTick(st, ms, now = Date.now()) {
  const S = statsOf(st, now), day = dayKey(now); ms = Math.max(0, Math.min(ms, 5 * MIN));
  S.play += ms; S.today = S.today.d === day ? S.today : { d: day, ms: 0 }; S.today.ms += ms;
  let out = null;
  if (S.lastDay !== day) { const y = dayKey(now - 24 * H); S.streak = S.lastDay === y ? S.streak + 1 : 1; S.best = Math.max(S.best, S.streak); S.days++; S.lastDay = day; }
  const wk = weekKey(now);
  if (!S.wk.key) S.wk = { key: wk, base: weekSnap(st) };
  else if (S.wk.key !== wk) { const a = S.wk.base, b = weekSnap(st), d = {}; for (const k in b) d[k] = Math.max(0, b[k] - (a[k] || 0)); out = { week: S.wk.key, d }; S.recap = out; S.wk = { key: wk, base: b }; }
  return out;
}
/* 自動記帳：包住會動到金幣的函式，依函式分類記「賺到」「花掉」；成功的動作順便計次 */
const MONEY = { finishAdventure: 'adv', collectPiggy: 'piggy', claimDaily: 'daily', creditSteps: 'steps', sellFruit: 'sellFruit', sellFish: 'sellFish', sellRelic: 'sellRelic', landFish: 'fishChest', runSkills: 'skill', claimGoal: 'goal', finishBallGame: 'ball',
  buyBait: 'fish', buyRod: 'fish', cookFish: 'fish', buySeed: 'item', buyItem: 'item', buyDecor: 'decor', expandFarm: 'farm', startTrain: 'train', buyEgg: 'egg', fosterOut: 'foster', buyFusionHouse: 'den', upgradeDen: 'den', buyLoveNest: 'den', battleBond: 'bond', breed: 'breed', buyPigCore: 'piggy' };
const ACT_SPEND = { feed: 'food', wash: 'wash', play: 'toy' };
function wrapStats(api) {
  for (const name of new Set([...Object.keys(MONEY), 'act', 'plant', 'harvest', 'castLine', 'hatch', 'clearCore', 'pickBerries', 'pickApple', 'eatFish'])) {
    const fn = api[name]; if (typeof fn !== 'function') continue;
    api[name] = function (st, ...a) {
      if (!st || typeof st !== 'object' || !('coins' in st)) return fn.call(this, st, ...a);
      const c0 = st.coins, stg = st.stage, r = fn.call(this, st, ...a), d = st.coins - c0, S = statsOf(st);
      if (d) { let cat = MONEY[name] || (name === 'act' ? ACT_SPEND[a[0]] : null) || 'other';
        if (name === 'finishAdventure' && r && r.bossCoins) { S.earn.boss = (S.earn.boss || 0) + r.bossCoins; if (d > r.bossCoins) S.earn.adv = (S.earn.adv || 0) + d - r.bossCoins; }
        else if (d > 0) S.earn[cat] = (S.earn[cat] || 0) + d; else S.spend[cat] = (S.spend[cat] || 0) - d; }
      if (st.stage !== stg && stg && st.stage && STAGES.indexOf(st.stage) > STAGES.indexOf(stg)) S.cnt.evolve++;
      const ok = r && (r.ok || (name === 'runSkills' && r));
      if (ok) {
        if (name === 'act' && ['feed', 'wash', 'play', 'sleep'].includes(a[0])) S.cnt[a[0]]++;
        else if (name === 'plant') S.cnt.plant++; else if (name === 'harvest') S.cnt[r.rotten ? 'rot' : 'harvest']++;
        else if (name === 'finishBallGame') S.cnt.play++; else if (name === 'castLine') S.cnt.cast++; else if (name === 'hatch') S.cnt.hatch++; else if (name === 'breed') S.cnt.breed++;
        else if (name === 'pickBerries') S.cnt.berry += r.n || 0; else if (name === 'pickApple') S.cnt.apple++; else if (name === 'eatFish') S.cnt.feed++;
        else if (name === 'landFish') { if (FISH[r.key]) { S.cnt.catch++; if (FISH[r.key].star >= 5) S.star5++; } else if (r.key === 'chest') S.cnt.chest++; else S.cnt.junk++; }
      }
      if (name === 'clearCore' && r) S.cnt.clean++;
      if (name === 'landFish' && r && !r.ok) S.cnt.miss++;
      if (name === 'finishAdventure' && r) { S.cnt.battle++; if (a[1] === 'win') { S.cnt.win++; if (foeFor(a[0]).boss) S.cnt.boss++; } else if (a[1] === 'loss') S.cnt.loss++; }
      return r;
    };
  }
  return api;
}

const API = { relicCount, equipRelic, unequipRelic, sellRelic, CONFIG, ROUTES, STAGES, ROUTE_EVENT, EVENT_TEXT, clamp, num, chars, dayKey, hourIn, level, rng, makeGenome, CLASSIC_G, encodeGenome, decodeGenome, breedGenome,
  G_SIDE, G_TOP, G_TAIL, G_PAT, G_EYE, EL_LIST, genomeOfSeed, gidOf, genomeFromId, okId, formCode, fresh, sanitize, applyTime, ageHours, journal, claimDaily, canGather, gather,
  act, pet, bondTier, discover, pickRoute, specialDone, stageReq, checkStages, tendencyHint, hatch, creditSteps, stepTier,
  plotState, plant, harvest, buySeed, buyDecor, placeDecor, loungeTick, upgradeLounge, buyItem, useCandy,
  toNextLv, lvBase, piggyRateOf, fosterOut, fosterBack, buyFusionHouse, MAX_LV, foeFighter, releasePet, PET_NAMES, CORE_KINDS, LEFT_NAME, guideStep, guideDo, fosterSwap, whereIs, inNest, loveTick, moveOut, eggReady, lostPets, recallLost, ownedIds, talLv, talentOn, bossTalOn, bossSeen, eliteBonus, hasHeritage, eggPrice, buyEgg, pigLevel, buyPigCore, piggyRate, piggyCap, collectPiggy, placeBed2, canAwaken, awaken, playedRoutes, unplayedRoutes, seedForEl, ascendInfo, taskOf, counterSnap, canAct, addCore, clearCore, isRotten, finishBallGame, snapshotPet, sexOfId, bringOut, sendIn, switchPair, pairCanJoin, pairAdventureCost, pairGain, pairStages, buyLoveNest, lovePartners, canLove, love, isAdult, sanitizePet, denCap, petCount, upgradeDen, moveToDen, swapPet, GOALS, goalsFor, ensureGoals, track, claimGoal,
  trainBonus, buffFighter, FISH, JUNK, GOODS, FOSSILS, RODS, SKILL, SLOT_NAME, WEATHER_NAME, fishSlot, bushBerries, pickBerries, fishOf, lootOf, rodOf, skillPets, hasSkill, fossilLuck, fishPool, buyBait, buyRod, selectRod, allPets, giveEmber, emberShare, setTeam, TRAIN_TIER, trainLvOf, trainTier, trainLvUp, castLine, landFish, fishFood, eatFish, cookFish, sellFish, runSkills, growHoursOf,  useSoup, canTrain, startTrain, finishTrain, trainXp, pickFruit, FRESH_KEYS, ITEM_NAME, ELEM, BEATS, elemMult, AREA_ROUTE, ROUTE_CH, battleCharge, battleBond, canBond, expectDamage, bondBoost, rps, RPS, goalText, goalReward, goalNeed, comeHome, trait, traitOf, washCost, sellFruit, expandFarm, expandPrice, useEmber, fixFresh, digest, canAdventure, startAdventure, weatherAt, weatherFx, pickCrave, ensureCrave, markSeen, growTree, dropApple, pickApple, mkFighter, foeFor, damage, finishAdventure, canBreed, breed, addXP };
Object.assign(API, { EARN_NAME, SPEND_NAME, BADGES, BADGE, statsOf, statAdd, statVal, checkBadges, playTick, weekKey, sumOf }); wrapStats(API);
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.PFCore = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
