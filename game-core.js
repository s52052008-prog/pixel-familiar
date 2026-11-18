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
  breed: { cost: 20, cooldownH: 6, minMood: 50, basket: 6 },
  piggy: { base: 2, per: .5, maxLv: 30, capHours: 12, minMood: 30, sleepRate: .5, pairShare: .5,
    rateX: [1, 1.25, 1.5, 1.8, 2.2, 3], capH: [12, 14, 16, 18, 20, 24], coreStages: [15, 20, 25, 30], corePrice: 1000 },   // V1.43 小豬撲滿等級 1～6：第 15／20／25／30 關王各掉一個核心碎片（+1 級），商店核心 1000 元（唯一，+1 級）   // 存錢筒（被動收入）：每小時 0.5＋等級×0.25（最多算到 Lv.30），最多存 12 小時
  loveNest: { cost: 300, cooldownH: 12, mood: 10 },          // 愛的小窩：買一次，成年期以上的一公一母可以進去生蛋
  pair: { rate: .5, advMinEnergy: 20, foeHp: 1.5, xpShare: .6 },   // 第二隻一起出來：狀態變化速度減半；一起冒險時敵人血量 ×1.5、第二隻分到 6 成經驗
  farm: { plots: 3, maxPlots: 9, expand: [90, 150, 300, 500, 700, 999],   /* V1.64 開始 3 格，最多 9 格 */ growHours: 2, fruitMin: 2, fruitMax: 3, freshHours: 6, rotHours: 24, xp: 5, forest: 3, seedPrice: 5 },   // 收成：蘋果、莓果各隨機 1～2 顆；田可以花錢擴建到 6 格     // 種植：GDD「種子、2h、產 2 食物、XP+5、森+3」
  goals: { perDay: 3, coins: [15, 30, 50], maxLv: 10, needPerLv: .2, rewardPerLv: .2 },   // 每天 ★／★★／★★★ 三個；每天 3 個都完成，任務等級 +1（更難、獎勵更好）
  candy: { price: 200, mood: 20, hunger: 10 },   // V1.39：星星糖 200 金幣，吃了直接升 1 級（不受屬性經驗加成影響）
  core: { rotMin: 10, moodPerHour: 4, max: 8 },
  // V1.67 天氣：每 3 小時換一次（同一時段大家都一樣）；在外面淋雨、打雷會影響幻獸，在小窩裡就安全（雷雨還是會有點怕）
  weatherOn: true,
  weather: { slotHours: 3, odds: [['clear', .5], ['breeze', .25], ['rain', .17], ['storm', .08]], offlineCap: 3,
    fx: { breeze: { out: { mood: 1 } }, rain: { out: { mood: -2, clean: -3 } }, storm: { out: { mood: -5, clean: -4, energy: -2 }, in: { mood: -1 } } } },          // 果核：10 分鐘沒清會發臭長果蠅，每顆每小時心情 −4
  poop: { delayMin: 40, rotMin: 3 },                      // 每吃一次，40 分鐘後大便；大便 3 分鐘沒清就發臭
  potion: { price: 40, heal: .5, drop: .15 },             // 回復藥水：回復 50% 最大 HP（V1.40：20 → 40 金幣）
  superPotion: { price: 100, heal: 1 },                   // V1.40 超級藥水：戰鬥中回復全部 HP
  soup: { price: 99, hunger: 10, mood: 20, energy: 20 },   // V1.41 神秘婆婆熬製雞湯：飽食 +10、心情 +20、體力 +20，還會消除羈絆之力後的 2 小時休息
  goodSeed: { price: 8, fruitMin: 3, fruitMax: 4 },        // 優良種子：收成多 1 顆，比較容易長出藍莓、草莓
  seedOdds: { normal: [['cranberry', .55], ['blueberry', .3], ['strawberry', .15]], good: [['cranberry', .3], ['blueberry', .4], ['strawberry', .3]] },   // V1.41 種子都是綜合：蔓越莓／藍莓／草莓
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
    10: { key: 'charge', name: '熔岩衝鋒', mult: 2.2, tip: '下一回合會撞出 2.2 倍傷害——快按「🛡️ 防禦」！' },
    15: { key: 'wall', name: '骸骨鐵壁', turns: 2, cut: .5, reflect: .3, tip: '2 回合內打牠只有一半傷害，還會反彈 30%——先防禦或喝藥水！' },
    20: { key: 'curse', name: '混亂詛咒', turns: 2, miss: .4, tip: '被詛咒的 2 回合內攻擊有 40% 會打空——可以先蓄力或防禦拖過去' },
    25: { key: 'doom', name: '死亡宣告', turns: 3, pct: .4, tip: '倒數 3 回合後受到最大血量 40% 的傷害——快打倒牠，或先補血！' },
    30: { key: 'rebirth', name: '浴火重生', hp: .3, tip: '火鳳倒下一次會用 30% 血量復活，要打倒兩次！' },
    35: { key: 'breath', name: '龍炎吐息', hits: 2, mult: 1.5, tip: '連續兩回合 1.5 倍噴火、猜拳也閃不掉——先喝藥水把血補高！' },
    40: { key: 'zero', name: '絕對零度', mult: 1.7, tip: '會被冰凍 1 回合，接著吃 1.7 倍冰爆——先把血補高！' } },
  bossBuff: { hp: 1.05, atk: 1.05, skip: [10, 40] },
  // V1.55 屬性反擊技：成年期以後解鎖，每隻每場一次，會比敵人先出手
  counter: { stages: ['adult', 'ascended'],
    fire:  { name: '烈焰護盾', icon: '🔥', text: '燒掉兩隻身上的詛咒、死亡宣告和冰凍，下一次受到的傷害減半' },
    water: { name: '治癒之泉', icon: '💧', text: '兩隻都回復 30% HP', heal: .3 },
    leaf:  { name: '森林守護', icon: '🌿', text: '兩隻接下來 3 回合，每回合回復 10% HP', turns: 3, heal: .1 },
    earth: { name: '大地壁壘', icon: '🪨', text: '這一回合兩隻受到的傷害只剩 30%', cut: .7 },
    bird:  { name: '疾風步',   icon: '🌪️', text: '兩隻接下來 2 回合閃避 +50%（猜拳輸了也可能閃開）', turns: 2, dodge: .5 },
    elec:  { name: '雷電麻痺', icon: '⚡', text: '敵人麻痺 1 回合（王的絕招也會被打斷、延後）' },
    metal: { name: '鋼鐵反擊', icon: '⚙️', text: '下一次被攻擊時，把 60% 的傷害反彈回去', reflect: .6 },
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
  decorSlots: ['paper', 'wall', 'lamp', 'plant', 'bed', 'rug', 'toy', 'toilet'],
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
    toilet_pot:  { slot: 'toilet', name: '寵物馬桶', price: 150 }
  },
  start: { coins: 50, food: 3, seeds: 2, stat: 80, hunger: 60, mood: 55, clean: 70, energy: 80 },
  foods: {   // 食物：key＝背包欄位；left＝吃剩的東西（會發臭）；fav＝愛吃的屬性（心情 +10、經驗 +5）。V1.21 依玩家設定
    food:  { name: '蘋果', icon: 'apple', hunger: 10, mood: 0,  energy: 5,  xp: 3, price: 10, left: 'core', fav: [] },
    berry: { name: '莓果', icon: 'berry', hunger: 10, mood: 10, energy: 0,  xp: 3, price: 10, left: null,   fav: [] },
    fish:  { name: '烤魚', icon: 'fish',  hunger: 20, mood: 0,  energy: 20, xp: 5, price: 20, left: 'bone', fav: ['tide', 'metal', 'forest'] },
    meat:  { name: '肉排', icon: 'meat',  hunger: 20, mood: 0,  energy: 20, xp: 5, price: 20, left: 'bone', fav: ['flame', 'elec', 'bird'] },
    dragon:  { name: '火龍果', icon: 'dragon',  power: true, hunger: 15, mood: 5, energy: 10, xp: 5, price: 30, left: null, fav: ['flame'] },
    melonw:  { name: '西瓜',   icon: 'melonw',  power: true, hunger: 15, mood: 5, energy: 10, xp: 5, price: 30, left: null, fav: ['tide'] },
    melon:   { name: '哈密瓜', icon: 'melon',   power: true, hunger: 15, mood: 5, energy: 10, xp: 5, price: 30, left: null, fav: ['forest'] },
    potato:  { name: '地瓜',   icon: 'potato',  power: true, hunger: 15, mood: 5, energy: 10, xp: 5, price: 30, left: null, fav: ['earth'] },
    nut:     { name: '堅果',   icon: 'nut',     power: true, hunger: 15, mood: 5, energy: 10, xp: 5, price: 30, left: null, fav: ['bird'] },
    coconut: { name: '椰子',   icon: 'coconut', power: true, hunger: 15, mood: 5, energy: 10, xp: 5, price: 30, left: null, fav: ['metal'] },
    banana:  { name: '香蕉',   icon: 'banana',  power: true, hunger: 15, mood: 5, energy: 10, xp: 5, price: 30, left: null, fav: ['elec'] },
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
  ember: { mood: 10, energy: 20, xp: 20, bossDrop: .5 },   // 經驗火種：打贏 Boss 有機會得到
  favBonus: { mood: 10, xp: 5 },
  powerBonus: { energy: 10, xp: 15 },     // 能力水果給對的屬性吃：再加體力 +10、經驗 +15
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
function fresh(now = Date.now()) {
  const S = CONFIG.start;
  return { v: 7, rev: 0, seed: newSeed(), genes: null, sex: null, name: '小露', hatched: false, eggTaps: 0, stage: 'egg', route: null,
    xp: 0, coins: S.coins, hunger: S.hunger, mood: S.mood, clean: S.clean, energy: S.energy, bond: 0, sleeping: false,
    path: { flame: 0, tide: 0, forest: 0, earth: 0, bird: 0, elec: 0, metal: 0 }, bondUses: 0, cleanups: 0,
    care: { petLastRewardAt: 0, bathLastAt: 0, playXpAt: [], gatherAt: 0 },
    inv: Object.assign({ food: S.food, seeds: S.seeds, seeds2: 0, candy: 0, potion: 1, potion2: 0, soup: 0, ember: 0, shards: 0, hearts: 0, relics: {}, fresh: { food: 0, berry: 0, cranberry: 0, blueberry: 0, strawberry: 0 }, mats: {} }, ...Object.keys(CONFIG.foods).filter(k => k !== 'food').map(k => ({ [k]: 0 }))), harvests: 0, trainLog: { dodge: 0, attack: 0, defense: 0 }, trains: 0,
    plots: Array.from({ length: CONFIG.farm.plots }, () => ({ at: 0 })),
    goals: { date: '', list: [] }, goalLv: 0,
    decor: { owned: ['paper_cream', 'bed_round'], placed: { paper: 'paper_cream', bed: 'bed_round' } }, view: 'yard', digest: [], toiletUses: 0, starveSince: 0, runaway: null, bondRestUntil: 0, ballUses: 0, ballBroken: false,
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
  r.inv.food = int(iv.food, CONFIG.start.food, 0, 9999); r.inv.seeds = int(iv.seeds, CONFIG.start.seeds, 0, 9999); r.inv.candy = int(iv.candy, 0, 0, 9999); r.inv.potion = int(iv.potion, 1, 0, 9999); r.inv.seeds2 = int(iv.seeds2, 0, 0, 9999); r.inv.potion2 = int(iv.potion2, 0, 0, 9999); r.inv.soup = int(iv.soup, 0, 0, 9999);
  for (const k of [...Object.keys(CONFIG.foods).filter(k => k !== 'food'), 'ember', 'shards', 'hearts']) r.inv[k] = int(iv[k], 0, 0, 9999);
  const mt = iv.mats && typeof iv.mats === 'object' ? iv.mats : {}; r.inv.mats = {}; for (const el of ROUTES) r.inv.mats[el] = int(mt[el], 0, 0, 99);
  const fr = iv.fresh && typeof iv.fresh === 'object' ? iv.fresh : {}; r.inv.fresh = {}; for (const k of FRESH_KEYS) r.inv.fresh[k] = Math.min(int(fr[k], 0, 0, 9999), r.inv[k] || 0);   // 自己種的、還沒賣的水果數
  const dc = o.decor && typeof o.decor === 'object' ? o.decor : {};
  if (Array.isArray(dc.owned)) r.decor.owned = [...new Set(['paper_cream', 'bed_round', ...dc.owned.filter(id => CONFIG.decor[id])])];
  if (dc.placed && typeof dc.placed === 'object') { r.decor.placed = { paper: 'paper_cream' }; for (const sl of CONFIG.decorSlots) { const id = dc.placed[sl]; if (id && CONFIG.decor[id] && CONFIG.decor[id].slot === sl && r.decor.owned.includes(id)) r.decor.placed[sl] = id; } }
  if (!(Number(o.v) >= 7) && !r.decor.placed.bed) r.decor.placed.bed = 'bed_round';
  r.decor.pos = {}; if (dc.pos && typeof dc.pos === 'object') for (const k of ['wall', 'toilet', 'toy', 'dresser', 'plant', 'rug', 'bed', 'bed2', 'pig']) { const v = dc.pos[k]; if (Array.isArray(v) && v.length === 2 && v.every(n => Number.isFinite(n) && Math.abs(n) <= 200)) r.decor.pos[k] = [Math.round(v[0]), Math.round(v[1])]; }   // V1.51 自由佈置的家具位置
  { const b2 = dc.placed && dc.placed.bed2; if (b2 && CONFIG.decor[b2] && CONFIG.decor[b2].slot === 'bed' && r.decor.owned.includes(b2)) r.decor.placed.bed2 = b2; }   // 右邊第二張床   // 舊存檔：送一張小圓床
  r.view = o.view === 'room' ? 'room' : 'yard';
  r.digest = Array.isArray(o.digest) ? o.digest.map(Number).filter(Number.isFinite).slice(0, 10) : [];
  r.toiletUses = int(o.toiletUses, 0, 0, 1e7); r.starveSince = num(o.starveSince, 0, 0, 9e15); r.runaway = o.runaway && typeof o.runaway === 'object' ? { at: num(o.runaway.at, 0, 0, 9e15), got: int(o.runaway.got, 0, 0, 1e7) } : null; r.bondRestUntil = num(o.bondRestUntil, 0, 0, 9e15); r.ballUses = int(o.ballUses, 0, 0, CONFIG.ballLife - 1); r.ballBroken = o.ballBroken === true;
  r.cores = Array.isArray(o.cores) ? o.cores.filter(c => c && typeof c === 'object').slice(-CONFIG.core.max).map(c => ({ x: num(c.x, 64, 4, 124), at: num(c.at, now, 0, 9e15), v: c.v === 'room' ? 'room' : 'yard', k: c.k === 'poop' ? 'poop' : 'core' })) : [];
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
  r.matGot = {}; if (o.matGot && typeof o.matGot === 'object') for (const k of ROUTES) if (Array.isArray(o.matGot[k])) r.matGot[k] = o.matGot[k].filter(n => [10, 20, 30, 40].includes(n)).slice(0, 4);
  r.ascBase = o.ascBase && typeof o.ascBase === 'object' ? Object.fromEntries(Object.keys(COUNTER_TEXT).map(k => [k, num(o.ascBase[k], 0, 0, 1e9)])) : null;
  r.trials = {}; for (const k of ROUTES) if ((o.trials && o.trials[k] === true) || (k !== 'tide' && o.events && o.events[ROUTE_EVENT[k]] === true)) r.trials[k] = true;   // 舊存檔：以前打過的屬性事件算通過試煉
  r.loveNest = o.loveNest === true; r.loveAt = num(o.loveAt, 0, 0, 9e15);
  r.harvests = int(o.harvests, 0, 0, 1e7); r.bondUses = int(o.bondUses, 0, 0, 1e7); r.cleanups = int(o.cleanups, 0, 0, 1e7); r.trains = int(o.trains, 0, 0, 1e7); { const tl = o.trainLog && typeof o.trainLog === 'object' ? o.trainLog : {}; r.trainLog = { dodge: int(tl.dodge, 0, 0, 1e7), attack: int(tl.attack, 0, 0, 1e7), defense: int(tl.defense, 0, 0, 1e7) }; }
  if (Array.isArray(o.plots)) r.plots = Array.from({ length: Math.max(CONFIG.farm.plots, Math.min(CONFIG.farm.maxPlots, o.plots.length)) }, (_, i) => ({ at: num(o.plots[i] && o.plots[i].at, 0, 0, 9e15), k: o.plots[i] && PLOT_KINDS.includes(o.plots[i].k) ? o.plots[i].k : 'food', ...(o.plots[i] && o.plots[i].g ? { g: 1 } : {}) }));
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
    petName: typeof e.petName === 'string' ? chars(e.petName).slice(0, 10).join('') : (typeof e.name === 'string' ? chars(e.name).slice(0, 10).join('') : ''),
    at: num(e.at, now, 0, now) })) : [];
  r.eggs = Array.isArray(o.eggs) ? o.eggs.filter(e => e && okId(e.id)).slice(0, CONFIG.breed.basket).map(e => ({ id: e.id, from: typeof e.from === 'string' ? chars(e.from).slice(0, 40).join('') : '', at: num(e.at, now, 0, now) })) : [];
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
function weatherFx(st, now) { if (!CONFIG.weatherOn) return null; const F = CONFIG.weather.fx[weatherAt(now)]; return F ? F[st.view === 'room' ? 'in' : 'out'] || null : null; }
function applyTime(st, now = Date.now()) {
  if (now < st.lastTick) { st.clockWarn = now; return { warn: 'back', hours: 0, events: [] }; }   // 時間倒退：不回溯，記錄警告
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
/* 存錢筒：幻獸等級越高，每小時存越多；金系 ×1.5；一起出來的第二隻再加牠的一半 */
function piggyRateOf(p) { const P = CONFIG.piggy, T = traitOf(p.route); return (P.base + P.per * Math.min(level(p.xp), P.maxLv)) * (T.coinX || 1) * (p.awake ? CONFIG.starHeart.piggyX : 1); }
const pigLevel = st => Math.min(6, 1 + ((st.pigCores && st.pigCores.length) || 0) + (st.pigBought ? 1 : 0));
function piggyRate(st) { if (!st.hatched) return 0; return (piggyRateOf(st) + (st.pair ? piggyRateOf(st.pair) * CONFIG.piggy.pairShare : 0)) * CONFIG.piggy.rateX[pigLevel(st) - 1]; }
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
function addXP(st, n) { n = Math.max(0, Math.round(n * (trait(st).xp || 1) * (!st.awake && hasHeritage(st) ? CONFIG.heritage.xp : 1))); st.xp += n; return n; }
const washCost = st => trait(st).washCost || CONFIG.washCost;
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
    else if (st.coins >= FD.price) { st.coins -= FD.price; paid = `花 ${FD.price} 金幣買${FD.name}`; }
    else return { ok: false, code: 'nofood', msg: `沒有${FD.name}也沒有金幣了…可以去「採集」或種田`, tm };
    const fav = !!(st.route && FD.fav.includes(st.route)), B = CONFIG.favBonus;
    st.hunger = clamp(st.hunger + FD.hunger * (trait(st).feed || 1)); st.mood = clamp(st.mood + FD.mood + (fav ? B.mood : 0)); const PB = fav && FD.power ? CONFIG.powerBonus : null;
    if (FD.energy || freshEat || PB) st.energy = clamp(st.energy + (FD.energy || 0) + (freshEat ? CONFIG.freshBonus.energy : 0) + (PB ? PB.energy : 0)); fixFresh(st);
    st.path.tide += CONFIG.feed.tide; track(st, 'feed', now); st.digest.push(now + CONFIG.poop.delayMin * MIN);
    return { ok: true, anim: 'eat', sfx: 'eat', kind, left: FD.left, fav, xp: addXP(st, FD.xp + (fav ? B.xp : 0) + (PB ? PB.xp : 0)), power: !!PB, fresh: freshEat, msg: (freshEat ? '✨自己種的' : '') + (fav ? `最愛的${FD.name}！超好吃！` : `好吃的${FD.name}！`) + (freshEat ? `體力多 +${CONFIG.freshBonus.energy}` : '') + `（${paid}）`, tm };
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
  { const BB = CONFIG.bossBuff; if (CONFIG.bosses[n] && !BB.skip.includes(n)) { ft.max = ft.hp = Math.round(ft.max * BB.hp); ft.atk *= BB.atk; } } return ft;
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
  const pow = special ? (a.el === 'none' ? 1.15 : 1.3) : 1, ch = a.charged ? 2 : 1;
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
  const pow = (special ? (a.el === 'none' ? 1.15 : 1.3) * (1 + (a.spUp || 0)) : 1) * (a.charged ? 2 : 1) * boost; a.charged = false;
  const mult = elemMult(a, d, special);
  let dmg = Math.max(1, Math.round(a.atk * pow * (a.atk / (a.atk + d.def)) * 1.6 * mult * (.85 + r() * .3)));
  if (d.guard) { dmg = Math.max(1, Math.round(dmg * .5)); d.guard = false; }
  if (d.dmgCut) dmg = Math.max(1, Math.round(dmg * (1 - d.dmgCut)));
  if (d.roundCut) dmg = Math.max(1, Math.round(dmg * (1 - d.roundCut)));   // 大地壁壘（這一回合）
  if (d.halfNext) { dmg = Math.max(1, Math.round(dmg * .5)); d.halfNext = false; }   // 烈焰護盾／星光守護
  let reflect = 0; if (d.counterRefl) { reflect += Math.max(1, Math.round(dmg * d.counterRefl)); d.counterRefl = 0; } if (d.wallT > 0) { dmg = Math.max(1, Math.round(dmg * (1 - (d.wallCut || .5)))); reflect += Math.max(1, Math.round(dmg * (d.wallReflect || .3))); }   // V1.54 骸骨鐵壁
  const crit = r() < .08 + (a.critUp || 0); if (crit) dmg = Math.round(dmg * 1.5);
  let endured = false;
  if (dmg >= d.hp && d.endure) { dmg = d.hp - 1; d.endure = false; endured = true; }
  let revived = false; if (dmg >= d.hp && d.revive) { d.hp = Math.max(1, Math.round(d.max * d.revive)); d.revive = 0; revived = true; } else d.hp = Math.max(0, d.hp - dmg);   // V1.52 不死鳥羽毛
  return { dmg, mult, crit, endured, revived, reflect };
}
function finishAdventure(st, n, result, full, now = Date.now(), r = Math.random) {
  const A = CONFIG.adventure, out = { xp: 0, coins: 0, food: 0, seeds: 0, unlocked: 0, events: [] };
  if (result === 'win' || result === 'loss') st.mood = clamp(st.mood + (result === 'win' ? A.winMood : A.lossMood));
  if (result === 'win') {
    st.adv.wins++; track(st, 'win', now);
    const xp = A.xp + CONFIG.battleWin.xp;
    if (full) { const T = trait(st); out.xp = addXP(st, xp); out.coins = A.coinsMin + Math.floor(r() * (A.coinsMax - A.coinsMin + 1)); if (T.coinX && r() < T.coinChance) { out.coins = Math.round(out.coins * T.coinX); out.coinBonus = true; } st.coins += out.coins;
      if (T.seedChance && r() < T.seedChance) { st.inv.seeds++; out.bonusSeed = 1; } if (T.berryChance && r() < T.berryChance) { const b = 1 + Math.floor(r() * 2); st.inv.berry = (st.inv.berry || 0) + b; out.berry = b; } st.inv.seeds += A.seeds; out.seeds = A.seeds; st.path.flame += A.flame + CONFIG.battleWin.flame;
      { const fb = foeFor(n); if (fb.boss) { const bc = fb.big ? CONFIG.bossCoins.big : CONFIG.bossCoins.mini; st.coins += bc; out.coins += bc; out.bossCoins = bc; } }
      if (foeFor(n).boss && r() < CONFIG.ember.bossDrop) { st.inv.ember = (st.inv.ember || 0) + 1; out.ember = 1; } }
    else out.xp = addXP(st, Math.round(xp * A.overCapXpRate));
    if (r() < A.dropFood) { st.inv.food++; out.food = 1; }
    if (r() < CONFIG.potion.drop) { st.inv.potion++; out.potion = 1; }
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

/* ---------------- 家園種植（GDD 第 3 節） ---------------- */
function plotState(st, i, now = Date.now()) {
  const p = st.plots[i]; if (!p) return null;
  if (!p.at) return { empty: true, progress: 0, left: 0 };
  const grow = CONFIG.farm.growHours * H, el = Math.max(0, now - p.at);   // 時間倒退時不會變成負的
  const F = CONFIG.farm, after = (el - grow) / H;   // 成熟後過了幾小時：太久沒收會過熟、再久會爛掉
  return { empty: false, kind: PLOT_KINDS.includes(p.k) ? p.k : 'food', progress: Math.min(1, el / grow), ripe: el >= grow, left: Math.max(0, grow - el), over: after >= F.freshHours && after < F.rotHours, rotten: after >= F.rotHours, freshLeft: Math.max(0, (F.freshHours - after) * H) };
}
const PLOT_KINDS = ['food', 'berry', 'cranberry', 'blueberry', 'strawberry'];
function pickFruit(good, r = Math.random) { const T = CONFIG.seedOdds[good ? 'good' : 'normal']; let x = r(); for (const [k, p] of T) { if (x < p) return k; x -= p; } return T[T.length - 1][0]; }
function plant(st, i, now = Date.now(), r = Math.random, good = false) {
  const q = plotState(st, i, now); if (!q) return { ok: false, msg: '沒有這塊田' };
  if (!q.empty) return { ok: false, msg: '這塊田已經種了東西' };
  const key = good ? 'seeds2' : 'seeds';
  if ((st.inv[key] || 0) < 1) return { ok: false, code: 'noseed', msg: good ? '沒有優良種子了（商店道具可以買）' : '沒有種子了（冒險有機會撿到，或花金幣買）' };
  st.inv[key]--; st.plots[i].at = now; st.plots[i].k = pickFruit(good, r); if (good) st.plots[i].g = 1; else delete st.plots[i].g; track(st, 'plant', now);   // 長出來才知道：紅色＝蘋果、紫色＝莓果
  return { ok: true, msg: good ? '種下一顆優良種子 🌟（收成比較多，比較容易長出藍莓、草莓）' : '種下一顆綜合種子 🌱（2 小時後收成：蔓越莓、藍莓或草莓）' };
}
function harvest(st, i, now = Date.now(), r = Math.random) {
  const q = plotState(st, i, now); if (!q || q.empty) return { ok: false, msg: '這塊田是空的' };
  if (!q.ripe) return { ok: false, msg: `還沒成熟，再等 ${Math.ceil(q.left / MIN)} 分鐘` };
  const F = CONFIG.farm, k = q.kind, name = CONFIG.foods[k].name, good = !!st.plots[i].g, G = CONFIG.goodSeed; st.plots[i].at = 0; delete st.plots[i].g;
  if (q.rotten) { track(st, 'harvest', now); return { ok: true, rotten: true, n: 0, xp: 0, msg: `${name}放太久爛掉了…只好丟掉 🪰` }; }
  const lo = good ? G.fruitMin : F.fruitMin, hi = good ? G.fruitMax : F.fruitMax, n = lo + Math.floor(r() * (hi - lo + 1));
  const bonus = null;
  st.inv[k] = (st.inv[k] || 0) + n; if (!q.over) st.inv.fresh[k] = (st.inv.fresh[k] || 0) + n; st.harvests++;   // 過熟的不算「自己種的好品質」：不發光、不能賣、沒有加成
  let xp = 0; if (st.hatched) { xp = addXP(st, F.xp); st.path.forest += F.forest; }
  track(st, 'harvest', now);
  if (st.harvests === CONFIG.harvestsForOldTree) journal(st, now, `收成第 ${st.harvests} 次了！`);
  return { ok: true, kind: k, n, over: q.over, xp, good, bonus, forest: st.hatched ? F.forest : 0, msg: (q.over ? `${name}有點過熟了…收成 ${n} 顆（吃起來沒那麼好）` : `收成！✨${name} +${n}`) + (bonus ? `、🌟${CONFIG.foods[bonus].name} +1` : '') + (xp ? `、經驗 +${xp}、🌿 森 +${F.forest}` : '') };
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
function placeDecor(st, id) {
  const it = CONFIG.decor[id]; if (!it || !st.decor.owned.includes(id)) return { ok: false, msg: '還沒有這個家具' };
  if (st.decor.placed[it.slot] === id) { if (it.slot === 'paper') return { ok: false, msg: '壁紙不能拿掉，可以換別的' }; delete st.decor.placed[it.slot]; return { ok: true, msg: `收起「${it.name}」` }; }
  st.decor.placed[it.slot] = id; return { ok: true, msg: `擺上「${it.name}」` };
}
/* 第二張床（兩隻一起睡）：已擁有的床可以擺到左邊的床位，同一張床可以兩邊都擺 */
function placeBed2(st, id) {
  const it = CONFIG.decor[id]; if (!it || it.slot !== 'bed' || !st.decor.owned.includes(id)) return { ok: false, msg: '還沒有這張床' };
  if (st.decor.placed.bed2 === id) { delete st.decor.placed.bed2; return { ok: true, msg: `收起左邊的「${it.name}」` }; }
  st.decor.placed.bed2 = id; return { ok: true, msg: `左邊也擺上「${it.name}」，兩隻都有床睡了！` };
}
function buyItem(st, kind) {
  const price = CONFIG.foods[kind] ? CONFIG.foods[kind].price : kind === 'seeds' ? CONFIG.farm.seedPrice : kind === 'seeds2' ? CONFIG.goodSeed.price : kind === 'candy' ? CONFIG.candy.price : kind === 'potion' ? CONFIG.potion.price : kind === 'potion2' ? CONFIG.superPotion.price : kind === 'soup' ? CONFIG.soup.price : 0;
  if (!price) return { ok: false, msg: '沒有這個商品' };
  if (st.coins < price) return { ok: false, msg: `金幣不足（需要 ${price}）` };
  st.coins -= price; st.inv[kind] = (st.inv[kind] || 0) + 1; return { ok: true, msg: `買了 1 個${ITEM_NAME[kind] || CONFIG.foods[kind].name}（−${price} 金幣）` };
}
const ITEM_NAME = { food: '食物', seeds: '種子', seeds2: '優良種子', candy: '星星糖', potion: '回復藥水', potion2: '超級藥水', soup: '神秘婆婆熬製雞湯' };
/* V1.40 神秘婆婆熬製雞湯：消除羈絆之力後的休息時間 */
function useSoup(st, now = Date.now()) {
  const tm = applyTime(st, now);
  if (!st.hatched) return { ok: false, msg: '先把蛋孵出來吧！', tm };
  if (st.sleeping) return { ok: false, msg: '牠在睡覺，醒來再喝吧', tm };
  if ((st.inv.soup || 0) < 1) return { ok: false, msg: '沒有雞湯了', tm };
  const S = CONFIG.soup, rest = (st.bondRestUntil || 0) > now; st.inv.soup--; st.bondRestUntil = 0;
  st.hunger = clamp(st.hunger + S.hunger); st.mood = clamp(st.mood + S.mood); st.energy = clamp(st.energy + S.energy);
  return { ok: true, rest, tm, msg: `咕嚕咕嚕…神秘婆婆的雞湯好補！飽食 +${S.hunger}、心情 +${S.mood}、體力 +${S.energy}${rest ? '，馬上恢復精神，可以再去冒險了' : ''} 🍲` };
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
function addCore(st, x, now = Date.now(), v = 'yard', k = 'core') { st.cores.push({ x: clamp(x, 4, 124), at: now, v: v === 'room' ? 'room' : 'yard', k: ['poop', 'bone'].includes(k) ? k : 'core' }); while (st.cores.length > CONFIG.core.max) st.cores.shift(); }
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
const PET_FIELDS = ['relics', 'fosterPaid', 'trainLog', 'seed', 'genes', 'sex', 'ascBase', 'awake', 'name', 'hatched', 'stage', 'route', 'xp', 'hunger', 'mood', 'clean', 'energy', 'bond', 'path', 'care', 'events', 'hatchedAt'];
function snapshotPet(st) { const p = {}; for (const k of PET_FIELDS) p[k] = JSON.parse(JSON.stringify(st[k])); p.sleeping = false; return p; }
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
function swapPet(st, i, now = Date.now()) {
  const p = st.roster[i]; if (!p) return { ok: false, msg: '小窩裡沒有這隻' };
  applyTime(st, now);
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
function pairCanJoin(st) { const p = st.pair; return !!(p && p.hatched && p.energy >= CONFIG.pair.advMinEnergy); }
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
  if (st.eggs.length >= B.basket) return `蛋籃滿了（最多 ${B.basket} 顆）`;
  return null;
}
function love(st, ref, now = Date.now(), r = Math.random) {
  applyTime(st, now); const why = canLove(st, ref, now); if (why) return { ok: false, msg: why };
  const p = ref === 'pair' ? st.pair : st.roster[ref], G = breedGenome(genomeFromId(gidOf(st)), genomeFromId(gidOf(p)), r);
  st.loveAt = now; st.mood = clamp(st.mood + CONFIG.loveNest.mood); p.mood = clamp(p.mood + CONFIG.loveNest.mood);
  const egg = { id: 'x:' + encodeGenome(G), from: `${st.name} ♥ ${p.name}`, at: now }; st.eggs.push(egg);
  journal(st, now, `和 ${p.name} 在愛的小窩裡生了一顆蛋 💕`);
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
    const own = Object.keys(CONFIG.foods).find(k => CONFIG.foods[k].power && CONFIG.foods[k].fav[0] === st.route), x = r();
    const k = x < .45 && own ? own : x < .75 ? 'potion' : 'candy'; st.inv[k] = (st.inv[k] || 0) + 1;
    got.push(`${k === 'potion' ? '回復藥水' : k === 'candy' ? '星星糖' : CONFIG.foods[k].name} +1`);
  }
  let up = false;
  if (st.goals.list.every(x => x.claimed) && lv < CONFIG.goals.maxLv) { st.goalLv = lv + 1; up = true; journal(st, now, `每日任務全部完成！任務等級提升到 Lv.${st.goalLv}`); }
  return { ok: true, up, msg: got.join('、') + (up ? `\n🌟 今天的任務全部完成！任務等級 Lv.${st.goalLv}：明天更難、獎勵更好` : '') };
}

/* ---------------- 電系：戰鬥中蓄力、羈絆之力 ---------------- */
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
  if (st.eggs.length >= B.basket) return `蛋籃滿了（最多 ${B.basket} 顆）`;
  return null;
}
function breed(st, friend, now = Date.now(), r = Math.random) {
  const why = canBreed(st, friend, now); if (why) return { ok: false, msg: why };
  const G = breedGenome(genomeFromId(gidOf(st)), friend.G, r);
  st.coins -= CONFIG.breed.cost; st.breedAt = now; st.mood = clamp(st.mood + 10);
  const egg = { id: 'x:' + encodeGenome(G), from: `${st.name} × ${friend.name}`, at: now };
  st.eggs.push(egg); journal(st, now, `和「${friend.name}」配對，得到一顆蛋`);
  return { ok: true, egg, G };
}

/* ---------------- V1.52 寶物：每隻寵物 2 格，背包裡的可以戴給任何一隻、也可以賣 ---------------- */
function relicCount(st, k) { return (st.inv.relics && st.inv.relics[k]) || 0; }
function equipRelic(st, p, k) { const R = CONFIG.relics.items[k]; if (!R) return { ok: false, msg: '沒有這個寶物' }; if (relicCount(st, k) < 1) return { ok: false, msg: '背包裡沒有這個寶物' };
  const L = p.relics || (p.relics = []); if (L.includes(k)) return { ok: false, msg: '同一種寶物只能戴一個' }; if (L.length >= CONFIG.relics.slots) return { ok: false, msg: `寶物欄位只有 ${CONFIG.relics.slots} 格，先卸下一個` };
  st.inv.relics[k]--; if (!st.inv.relics[k]) delete st.inv.relics[k]; L.push(k); return { ok: true, msg: `${p.name} 戴上了「${R.name}」` }; }
function unequipRelic(st, p, k) { const L = p.relics || []; const i = L.indexOf(k); if (i < 0) return { ok: false, msg: '沒有戴這個寶物' }; L.splice(i, 1); const iv = st.inv.relics || (st.inv.relics = {}); iv[k] = (iv[k] || 0) + 1; return { ok: true, msg: `卸下「${CONFIG.relics.items[k].name}」，放回背包` }; }
function sellRelic(st, k) { const R = CONFIG.relics.items[k]; if (!R || relicCount(st, k) < 1) return { ok: false, msg: '背包裡沒有這個寶物' }; st.inv.relics[k]--; if (!st.inv.relics[k]) delete st.inv.relics[k]; st.coins += CONFIG.relics.sell; return { ok: true, msg: `賣掉「${R.name}」，得到 ${CONFIG.relics.sell} 金幣` }; }

const API = { relicCount, equipRelic, unequipRelic, sellRelic, CONFIG, ROUTES, STAGES, ROUTE_EVENT, EVENT_TEXT, clamp, num, chars, dayKey, hourIn, level, rng, makeGenome, CLASSIC_G, encodeGenome, decodeGenome, breedGenome,
  G_SIDE, G_TOP, G_TAIL, G_PAT, G_EYE, EL_LIST, genomeOfSeed, gidOf, genomeFromId, okId, formCode, fresh, sanitize, applyTime, ageHours, journal, claimDaily, canGather, gather,
  act, pet, bondTier, discover, pickRoute, specialDone, stageReq, checkStages, tendencyHint, hatch, creditSteps, stepTier,
  plotState, plant, harvest, buySeed, buyDecor, placeDecor, buyItem, useCandy,
  toNextLv, fosterOut, fosterBack, buyFusionHouse, MAX_LV, foeFighter, hasHeritage, eggPrice, buyEgg, pigLevel, buyPigCore, piggyRate, piggyCap, collectPiggy, placeBed2, canAwaken, awaken, playedRoutes, unplayedRoutes, seedForEl, ascendInfo, taskOf, counterSnap, canAct, addCore, clearCore, isRotten, finishBallGame, snapshotPet, sexOfId, bringOut, sendIn, switchPair, pairCanJoin, pairAdventureCost, pairGain, pairStages, buyLoveNest, lovePartners, canLove, love, isAdult, sanitizePet, denCap, petCount, upgradeDen, moveToDen, swapPet, GOALS, goalsFor, ensureGoals, track, claimGoal,
  trainBonus, buffFighter, useSoup, canTrain, startTrain, finishTrain, trainXp, pickFruit, FRESH_KEYS, ITEM_NAME, ELEM, BEATS, elemMult, AREA_ROUTE, ROUTE_CH, battleCharge, battleBond, canBond, expectDamage, bondBoost, rps, RPS, goalText, goalReward, goalNeed, comeHome, trait, traitOf, washCost, sellFruit, expandFarm, expandPrice, useEmber, fixFresh, digest, canAdventure, startAdventure, weatherAt, weatherFx, mkFighter, foeFor, damage, finishAdventure, canBreed, breed, addXP };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.PFCore = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
