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
    awake: { hunger: -2, mood: -1, clean: -1, energy: 3 },
    sleep: { hunger: -2, mood: -1, clean: -1, energy: 12 }
  },
  full: 95,                          // 視為「已滿」的門檻
  feed: { hunger: 25, xp: 5, tide: 1, price: 5 },
  play: { minEnergy: 10, mood: 20, energy: -10, xp: 10, xpWindowMin: 30, xpPerWindow: 3 },
  wash: { cooldownMin: 30, clean: 35, xp: 5, rubSeconds: 3 },
  pet:  { cooldownMin: 30, bond: 2, mood: 3, tide: 2 },
  adventure: { minEnergy: 20, energy: -20, xp: 15, coins: 8, flame: 3, dailyFull: 5, overCapXpRate: 0.2, dropFood: 0.3, dropSeed: 0.4 },
  battleWin: { xp: 10, coins: 4, flame: 2 },
  battleLoss: { xp: 3 },
  discovery: { xp: 10, forest: 2 },
  steps: { per: 1000, xpPer: 10, forestEvery: 2000, dayCap: 50000, tier: 100000, tierCoins: 100, backDays: 7 },
  daily: { coins: 10, food: 1 },
  gather: { cooldownMin: 2, food: 1 },
  stages: { adolescent: { hours: 12, xp: 100 }, adult: { hours: 48, xp: 350 }, ascended: { hours: 168, xp: 1000 } },
  routeTie: ['tide', 'forest', 'flame', 'earth', 'bird', 'elec', 'metal'],   // 平手時的固定順序（GDD 前三個 + V1.11 新增四個）
  bondTiers: [20, 50, 80],
  moonspringBond: 60,
  harvestsForOldTree: 10,
  bossStages: { volcano: 15, oldtree: 20, canyon: 25, skypeak: 30, thunder: 35, mine: 40 },
  newRoutes: { stepsForEarth: 100000, goalsForBird: 30, bondForElec: 5, cleanForMetal: 50, earthEvery: 2000 },
  breed: { cost: 20, cooldownH: 6, minMood: 50, basket: 6 },
  farm: { plots: 3, growHours: 2, food: 2, xp: 5, forest: 3, seedPrice: 3 },     // 種植：GDD「種子、2h、產 2 食物、XP+5、森+3」
  goals: { perDay: 3, reward: { coins: 8 } },
  candy: { price: 12, mood: 20, hunger: 10, xp: 3 },
  core: { rotMin: 10, moodPerHour: 4, max: 8 },          // 果核：10 分鐘沒清會發臭長果蠅，每顆每小時心情 −4
  poop: { delayMin: 40, rotMin: 3 },                      // 每吃一次，40 分鐘後大便；大便 3 分鐘沒清就發臭
  potion: { price: 20, heal: .5, drop: .15 },             // 回復藥水：回復 50% 最大 HP
  bond: { tapBoost: .35, maxBoost: 5 },                   // 羈絆之力：每點一下 +35% 威力，最多 5 倍
  ballGame: { balls: 3 },                                 // 頂球：一回合 3 顆球
  den: [ { name: '草叢小窩', cap: 1, cost: 0 }, { name: '稻草窩', cap: 2, cost: 120 }, { name: '樹根洞窟', cap: 3, cost: 300 }, { name: '大樹屋', cap: 4, cost: 600 } ],                            // 商店零食「星星糖」
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
  start: { coins: 50, food: 3, seeds: 2, stat: 80 }
};
const ROUTES = ['flame', 'tide', 'forest', 'earth', 'bird', 'elec', 'metal'];
const ROUTE_EVENT = { flame: 'volcano', tide: 'moonspring', forest: 'oldtree', earth: 'canyon', bird: 'skypeak', elec: 'thunder', metal: 'mine' };
const STAGES = ['egg', 'juvenile', 'adolescent', 'adult', 'ascended'];

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
const level = xp => 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 8));   // 顯示與戰鬥用等級，由總 XP 推算

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
  if (stage === 'juvenile' && route) return 'juv-' + route;
  if (stage === 'adult' && route) return route;
  if (stage === 'ascended' && route) return 'asc-' + route;
  return 'juv';
}

/* ---------------- 存檔：初始值、檢查、遷移 ---------------- */
function newSeed() { try { return (globalThis.crypto || require('crypto').webcrypto).getRandomValues(new Uint32Array(1))[0]; } catch (e) { return Math.floor(Math.random() * 4294967295); } }
function fresh(now = Date.now()) {
  const S = CONFIG.start;
  return { v: 7, rev: 0, seed: newSeed(), genes: null, name: '小露', hatched: false, eggTaps: 0, stage: 'egg', route: null,
    xp: 0, coins: S.coins, hunger: S.stat, mood: S.stat, clean: S.stat, energy: S.stat, bond: 0, sleeping: false,
    path: { flame: 0, tide: 0, forest: 0, earth: 0, bird: 0, elec: 0, metal: 0 }, bondUses: 0, cleanups: 0,
    care: { petLastRewardAt: 0, bathLastAt: 0, playXpAt: [], gatherAt: 0 },
    inv: { food: S.food, seeds: S.seeds, candy: 0, potion: 1 }, harvests: 0,
    plots: Array.from({ length: CONFIG.farm.plots }, () => ({ at: 0 })),
    goals: { date: '', list: [] },
    decor: { owned: ['paper_cream', 'bed_round'], placed: { paper: 'paper_cream', bed: 'bed_round' } }, view: 'yard', digest: [], toiletUses: 0,
    cores: [], ball: { best: 0, goals: 0 }, den: { level: 1 }, roster: [],
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
  r.inv.food = int(iv.food, CONFIG.start.food, 0, 9999); r.inv.seeds = int(iv.seeds, CONFIG.start.seeds, 0, 9999); r.inv.candy = int(iv.candy, 0, 0, 9999); r.inv.potion = int(iv.potion, 1, 0, 9999);
  const dc = o.decor && typeof o.decor === 'object' ? o.decor : {};
  if (Array.isArray(dc.owned)) r.decor.owned = [...new Set(['paper_cream', 'bed_round', ...dc.owned.filter(id => CONFIG.decor[id])])];
  if (dc.placed && typeof dc.placed === 'object') { r.decor.placed = { paper: 'paper_cream' }; for (const sl of CONFIG.decorSlots) { const id = dc.placed[sl]; if (id && CONFIG.decor[id] && CONFIG.decor[id].slot === sl && r.decor.owned.includes(id)) r.decor.placed[sl] = id; } }
  if (!(Number(o.v) >= 7) && !r.decor.placed.bed) r.decor.placed.bed = 'bed_round';   // 舊存檔：送一張小圓床
  r.view = o.view === 'room' ? 'room' : 'yard';
  r.digest = Array.isArray(o.digest) ? o.digest.map(Number).filter(Number.isFinite).slice(0, 10) : [];
  r.toiletUses = int(o.toiletUses, 0, 0, 1e7);
  r.cores = Array.isArray(o.cores) ? o.cores.filter(c => c && typeof c === 'object').slice(-CONFIG.core.max).map(c => ({ x: num(c.x, 64, 4, 124), at: num(c.at, now, 0, 9e15), v: c.v === 'room' ? 'room' : 'yard', k: c.k === 'poop' ? 'poop' : 'core' })) : [];
  const bl = o.ball && typeof o.ball === 'object' ? o.ball : {}; r.ball = { best: int(bl.best, 0, 0, 99), goals: int(bl.goals, 0, 0, 1e7) };
  r.den = { level: int(o.den && o.den.level, 1, 1, CONFIG.den.length) };
  r.roster = Array.isArray(o.roster) ? o.roster.filter(p => p && typeof p === 'object' && p.hatched).slice(0, CONFIG.den.length - 1).map(p => sanitizePet(p, now)) : [];
  r.harvests = int(o.harvests, 0, 0, 1e7); r.bondUses = int(o.bondUses, 0, 0, 1e7); r.cleanups = int(o.cleanups, 0, 0, 1e7);
  if (Array.isArray(o.plots)) r.plots = r.plots.map((p, i) => ({ at: num(o.plots[i] && o.plots[i].at, 0, 0, 9e15) }));
  const gl = o.goals && typeof o.goals === 'object' ? o.goals : {};
  if (/^\d{4}-\d\d-\d\d$/.test(gl.date) && Array.isArray(gl.list)) r.goals = { date: gl.date, list: gl.list.filter(g => g && GOALS[g.id]).slice(0, 5).map(g => ({ id: g.id, n: int(g.n, 0, 0, 1e6), claimed: g.claimed === true })) };
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
function applyTime(st, now = Date.now()) {
  if (now < st.lastTick) { st.clockWarn = now; return { warn: 'back', hours: 0, events: [] }; }   // 時間倒退：不回溯，記錄警告
  const hours = (now - st.lastTick) / H, eff = Math.min(hours, CONFIG.offlineCapHours);
  const last = st.lastTick; st.lastTick = now;
  const events = digest(st, now);
  if (st.hatched && eff > 0) {
    const R = CONFIG.rates[st.sleeping ? 'sleep' : 'awake'];
    for (const k in R) st[k] = clamp(st[k] + R[k] * eff);
    // 發臭的果核：只算「已經發臭」的那段時間，同樣最多 12 小時
    let rotH = 0; for (const c of st.cores) { const from = Math.max(last, c.at + rotMin(c) * MIN); if (now > from) rotH += Math.min((now - from) / H, CONFIG.offlineCapHours); }
    if (rotH > 0) st.mood = clamp(st.mood - rotH * CONFIG.core.moodPerHour);
  }
  return { hours, eff, warn: hours > CONFIG.jumpWarnDays * 24 ? 'jump' : null, events };
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
  st.daily = { date: k, adv: 0, gift: false }; ensureGoals(st, now);
  st.coins += CONFIG.daily.coins; st.inv.food += CONFIG.daily.food;
  return { coins: CONFIG.daily.coins, food: CONFIG.daily.food };
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
function addXP(st, n) { n = Math.max(0, Math.round(n)); st.xp += n; return n; }
function act(st, a, now = Date.now()) {
  const tm = applyTime(st, now);
  if (!st.hatched) return { ok: false, msg: '先把蛋孵出來吧！', tm };
  const F = CONFIG.full;
  if (a === 'sleep') {
    if (st.sleeping) { st.sleeping = false; return { ok: true, anim: 'happy', sfx: 'wake', msg: '醒來了～', tm }; }
    if (st.view !== 'room') return { ok: false, code: 'outside', msg: '外面不能睡覺，要回小窩裡睡喔', tm };
    st.sleeping = true; return { ok: true, anim: 'sleep', sfx: 'sleep', msg: '晚安～💤（睡覺時體力每小時 +12，再按一次可叫醒）', tm };
  }
  if (st.sleeping) return { ok: false, msg: '噓…牠在睡覺，先叫醒牠吧', tm };
  if (a === 'feed') {
    const C = CONFIG.feed;
    if (st.hunger >= F) return { ok: false, msg: '飽飽的，吃不下了～', tm };
    let paid = '';
    if (st.inv.food > 0) { st.inv.food--; paid = '用掉 1 個食物'; }
    else if (st.coins >= C.price) { st.coins -= C.price; paid = `花 ${C.price} 金幣買食物`; }
    else return { ok: false, code: 'nofood', msg: '沒有食物也沒有金幣了…可以去「採集」', tm };
    st.hunger = clamp(st.hunger + C.hunger); st.path.tide += C.tide;
    track(st, 'feed', now); st.digest.push(now + CONFIG.poop.delayMin * MIN);
    return { ok: true, anim: 'eat', sfx: 'eat', xp: addXP(st, C.xp), msg: `好吃！（${paid}）`, tm };
  }
  if (a === 'play') {
    const C = CONFIG.play;
    if (st.energy < C.minEnergy) return { ok: false, msg: '太累了…先讓牠休息或睡一下', tm };
    st.care.playXpAt = st.care.playXpAt.filter(t => now - t < C.xpWindowMin * MIN && t <= now);
    let xp = 0;
    if (st.care.playXpAt.length < C.xpPerWindow) { st.care.playXpAt.push(now); xp = addXP(st, C.xp); }
    st.mood = clamp(st.mood + C.mood); st.energy = clamp(st.energy + C.energy); track(st, 'play', now);
    return { ok: true, anim: 'play', sfx: 'play', xp, msg: xp ? '玩得好開心！' : '玩得好開心！（玩太多次了，暫時沒有經驗）', tm };
  }
  if (a === 'wash') {
    const C = CONFIG.wash, wait = st.care.bathLastAt + C.cooldownMin * MIN - now;
    if (st.clean >= F) return { ok: false, msg: '已經很乾淨了！', tm };
    if (wait > 0) return { ok: false, msg: `剛洗過澡，${Math.ceil(wait / MIN)} 分鐘後再洗吧`, tm };
    st.care.bathLastAt = now; st.clean = clamp(st.clean + C.clean); st.path.metal += 1; track(st, 'wash', now);
    return { ok: true, anim: 'wash', sfx: 'wash', xp: addXP(st, C.xp), msg: '洗得香噴噴～', tm };
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
    st.care.petLastRewardAt = now; st.bond = clamp(st.bond + C.bond); st.mood = clamp(st.mood + C.mood); st.path.tide += C.tide;
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
function specialDone(st, route) {
  if (route === 'flame') return st.events.volcano;
  if (route === 'tide') return st.events.moonspring && st.bond >= CONFIG.moonspringBond;
  if (route === 'forest') return st.events.oldtree && st.harvests >= CONFIG.harvestsForOldTree;
  const N = CONFIG.newRoutes;
  if (route === 'earth') return st.events.canyon && st.steps.total >= N.stepsForEarth;
  if (route === 'bird') return st.events.skypeak && st.ball.goals >= N.goalsForBird;
  if (route === 'elec') return st.events.thunder && st.bondUses >= N.bondForElec;
  if (route === 'metal') return st.events.mine && st.cleanups >= N.cleanForMetal;
  return false;
}
function stageReq(st, now) {
  const age = ageHours(st, now), S = CONFIG.stages;
  const nxt = st.stage === 'juvenile' ? 'adolescent' : st.stage === 'adolescent' ? 'adult' : st.stage === 'adult' ? 'ascended' : null;
  if (!nxt) return null;
  return { next: nxt, hours: S[nxt].hours, xp: S[nxt].xp, ageOk: age >= S[nxt].hours, xpOk: st.xp >= S[nxt].xp, eventOk: nxt !== 'ascended' || specialDone(st, st.route), age };
}
const ROUTE_CH = { flame: '焰', tide: '潮', forest: '森', earth: '土', bird: '鳥', elec: '電', metal: '金' };
function checkStages(st, now = Date.now()) {
  const out = [];
  for (let guard = 0; guard < 4 && st.hatched; guard++) {
    const q = stageReq(st, now);
    if (!q || !q.ageOk || !q.xpOk || !q.eventOk) break;
    const from = st.stage;
    if (q.next === 'adult' && !st.route) st.route = pickRoute(st);
    st.stage = q.next;
    out.push({ from, to: st.stage, route: st.route });
    journal(st, now, { adolescent: '長成少年期了！', adult: `進化成成年期（${ROUTE_CH[st.route]}系）！`, ascended: '達到高階型態！' }[st.stage]);
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
  st.hatched = true; st.eggTaps = 0; st.hatchedAt = now; st.lastTick = now; st.stage = 'juvenile';
  st.route = genomeFromId(gidOf(st)).el || 'tide';   // V1.12：屬性在蛋裡就決定，一路長到高階
  const id = gidOf(st); if (!st.dex.find(x => x.id === id)) st.dex.push({ id, route: st.route, stage: 'juvenile', petName: st.name, at: now });
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
  return { delta, v, xp, earth: st.hatched ? f : 0, up };
}
const stepTier = st => Math.floor(st.steps.total / CONFIG.steps.tier);

/* ---------------- 冒險與戰鬥 ---------------- */
const ELEM = { flame: 'fire', tide: 'water', forest: 'leaf', earth: 'earth', bird: 'bird', elec: 'elec', metal: 'metal' };
/* 屬性相剋：key 剋 陣列裡的屬性（傷害 ×1.5；反過來 ×0.67） */
const BEATS = { fire: ['leaf', 'metal'], water: ['fire', 'earth'], leaf: ['water', 'earth'], earth: ['fire', 'elec', 'metal'], bird: ['leaf', 'earth'], elec: ['water', 'bird'], metal: ['bird', 'leaf'] };
function canAdventure(st, n) {
  if (!st.hatched) return '先孵化幻獸才能冒險';
  if (st.sleeping) return '牠在睡覺，先叫醒牠吧';
  if (st.energy < CONFIG.adventure.minEnergy) return `體力要 ${CONFIG.adventure.minEnergy} 以上才能冒險`;
  if (n < 1 || n > st.adv.stage) return '這一關還沒解鎖';
  return null;
}
function startAdventure(st, n, now = Date.now()) {
  applyTime(st, now); claimDaily(st, now);
  const why = canAdventure(st, n); if (why) return { ok: false, msg: why };
  st.energy = clamp(st.energy + CONFIG.adventure.energy); st.daily.adv++; track(st, 'adv', now);
  return { ok: true, full: st.daily.adv <= CONFIG.adventure.dailyFull };
}
function mkFighter(name, key, lvl, route, tierN, mood, bond) {
  const k = 1 + .1 * tierN, cond = mood < 30 ? .85 : 1;
  return { name, key, level: lvl, el: ELEM[route] || 'none', max: Math.round((30 + lvl * 6) * k), hp: Math.round((30 + lvl * 6) * k),
    atk: (8 + lvl * 2) * k * cond, def: (6 + lvl * 1.5) * k, spd: 5 + lvl + tierN, cd: 0, guard: false, endure: bond >= 80 };
}
/* 冒險區域（每 5 關一區）主要出現的屬性 */
const AREA_ROUTE = [null, 'tide', 'flame', 'forest', 'earth', 'bird', 'elec', 'metal', null];
function foeFor(n) {
  const seed = (Math.imul(n, 2654435761) ^ 0x9e3779b9) >>> 0, G = makeGenome(seed), boss = n % 5 === 0;
  if (boss) G.rarity = 3;
  const area = AREA_ROUTE[Math.min(AREA_ROUTE.length - 1, Math.floor((n - 1) / 5))], route = area && (seed >>> 8) % 10 < 7 ? area : ROUTES[seed % ROUTES.length], stage = n >= 4 ? 'adult' : (n >= 2 ? 'adolescent' : 'juvenile');
  const lvl = Math.max(1, Math.round(n * .9) + (boss ? 2 : 0));
  return { id: 'x:' + encodeGenome(G), route, stage, level: lvl, boss };
}
function elemMult(a, d, special) { if (!special || a.el === 'none' || d.el === 'none') return 1; return (BEATS[a.el] || []).includes(d.el) ? 1.5 : (BEATS[d.el] || []).includes(a.el) ? .67 : 1; }
/* 預估傷害（不含隨機與會心一擊）：用來顯示「這一擊強不強」、判斷是不是快撐不住了 */
function expectDamage(a, d, special, boost = 1) {
  const pow = special ? (a.el === 'none' ? 1.15 : 1.3) : 1, ch = a.charged ? 2 : 1;
  let dmg = Math.max(1, Math.round(a.atk * pow * (a.atk / (a.atk + d.def)) * 1.6 * elemMult(a, d, special) * ch * boost));
  if (d.guard) dmg = Math.max(1, Math.round(dmg * .5)); return dmg;
}
const bondBoost = (taps, bond = 0) => clamp(1 + taps * CONFIG.bond.tapBoost + bond / 100, 1, CONFIG.bond.maxBoost);
function damage(a, d, special, r = Math.random, boost = 1) {
  const pow = (special ? (a.el === 'none' ? 1.15 : 1.3) : 1) * (a.charged ? 2 : 1) * boost; a.charged = false;
  const mult = elemMult(a, d, special);
  let dmg = Math.max(1, Math.round(a.atk * pow * (a.atk / (a.atk + d.def)) * 1.6 * mult * (.85 + r() * .3)));
  if (d.guard) { dmg = Math.max(1, Math.round(dmg * .5)); d.guard = false; }
  const crit = r() < .08; if (crit) dmg = Math.round(dmg * 1.5);
  let endured = false;
  if (dmg >= d.hp && d.endure) { dmg = d.hp - 1; d.endure = false; endured = true; }
  d.hp = Math.max(0, d.hp - dmg);
  return { dmg, mult, crit, endured };
}
function finishAdventure(st, n, result, full, now = Date.now(), r = Math.random) {
  const A = CONFIG.adventure, out = { xp: 0, coins: 0, food: 0, seeds: 0, unlocked: 0, events: [] };
  if (result === 'win') {
    st.adv.wins++; track(st, 'win', now);
    const xp = A.xp + CONFIG.battleWin.xp;
    if (full) { out.xp = addXP(st, xp); out.coins = A.coins + CONFIG.battleWin.coins; st.coins += out.coins; st.path.flame += A.flame + CONFIG.battleWin.flame; }
    else out.xp = addXP(st, Math.round(xp * A.overCapXpRate));
    if (r() < A.dropFood) { st.inv.food++; out.food = 1; }
    if (r() < A.dropSeed) { st.inv.seeds++; out.seeds = 1; }
    if (r() < CONFIG.potion.drop) { st.inv.potion++; out.potion = 1; }
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
  return { empty: false, progress: Math.min(1, el / grow), ripe: el >= grow, left: Math.max(0, grow - el) };
}
function plant(st, i, now = Date.now()) {
  const q = plotState(st, i, now); if (!q) return { ok: false, msg: '沒有這塊田' };
  if (!q.empty) return { ok: false, msg: '這塊田已經種了東西' };
  if (st.inv.seeds < 1) return { ok: false, code: 'noseed', msg: '沒有種子了（冒險有機會撿到，或花金幣買）' };
  st.inv.seeds--; st.plots[i].at = now; track(st, 'plant', now);
  return { ok: true, msg: '種下一顆種子 🌱（2 小時後可以收成）' };
}
function harvest(st, i, now = Date.now()) {
  const q = plotState(st, i, now); if (!q || q.empty) return { ok: false, msg: '這塊田是空的' };
  if (!q.ripe) return { ok: false, msg: `還沒成熟，再等 ${Math.ceil(q.left / MIN)} 分鐘` };
  const F = CONFIG.farm; st.plots[i].at = 0; st.inv.food += F.food; st.harvests++;
  let xp = 0; if (st.hatched) { xp = addXP(st, F.xp); st.path.forest += F.forest; }
  track(st, 'harvest', now);
  if (st.harvests === CONFIG.harvestsForOldTree) journal(st, now, `收成第 ${st.harvests} 次了！`);
  return { ok: true, food: F.food, xp, forest: st.hatched ? F.forest : 0, msg: `收成！食物 +${F.food}` + (xp ? `、經驗 +${xp}、🌿 森 +${F.forest}` : '') };
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
  return { ok: true, msg: `買了「${it.name}」，已經擺進房間！` };
}
function placeDecor(st, id) {
  const it = CONFIG.decor[id]; if (!it || !st.decor.owned.includes(id)) return { ok: false, msg: '還沒有這個家具' };
  if (st.decor.placed[it.slot] === id) { if (it.slot === 'paper') return { ok: false, msg: '壁紙不能拿掉，可以換別的' }; delete st.decor.placed[it.slot]; return { ok: true, msg: `收起「${it.name}」` }; }
  st.decor.placed[it.slot] = id; return { ok: true, msg: `擺上「${it.name}」` };
}
function buyItem(st, kind) {
  const price = kind === 'food' ? CONFIG.feed.price : kind === 'seeds' ? CONFIG.farm.seedPrice : kind === 'candy' ? CONFIG.candy.price : kind === 'potion' ? CONFIG.potion.price : 0;
  if (!price) return { ok: false, msg: '沒有這個商品' };
  if (st.coins < price) return { ok: false, msg: `金幣不足（需要 ${price}）` };
  st.coins -= price; st.inv[kind] = (st.inv[kind] || 0) + 1; return { ok: true, msg: `買了 1 個${{ food: '食物', seeds: '種子', candy: '星星糖', potion: '回復藥水' }[kind]}（−${price} 金幣）` };
}
function useCandy(st, now = Date.now()) {
  const tm = applyTime(st, now);
  if (!st.hatched) return { ok: false, msg: '先把蛋孵出來吧！', tm };
  if (st.sleeping) return { ok: false, msg: '牠在睡覺，醒來再吃吧', tm };
  if (st.inv.candy < 1) return { ok: false, msg: '沒有星星糖了', tm };
  const C = CONFIG.candy; st.inv.candy--; st.mood = clamp(st.mood + C.mood); st.hunger = clamp(st.hunger + C.hunger);
  return { ok: true, xp: addXP(st, C.xp), msg: '甜甜的星星糖！心情大好 ✨', tm };
}

/* ---------------- 果核（餵食後留下，要點一下清掉） ---------------- */
function canAct(st, a, now = Date.now()) {
  if (!st.hatched) return '先把蛋孵出來吧！';
  if (st.sleeping) return a === 'sleep' ? null : '噓…牠在睡覺，先叫醒牠吧';
  if (a === 'feed') { if (st.hunger >= CONFIG.full) return '飽飽的，吃不下了～'; if (st.inv.food < 1 && st.coins < CONFIG.feed.price) return '沒有食物也沒有金幣了…可以去「採集」'; }
  if (a === 'play' && st.energy < CONFIG.play.minEnergy) return '太累了…先讓牠休息或睡一下';
  if (a === 'sleep' && st.view !== 'room') return '外面不能睡覺，要回小窩裡睡喔';
  if (a === 'wash') { if (st.clean >= CONFIG.full) return '已經很乾淨了！'; const w = st.care.bathLastAt + CONFIG.wash.cooldownMin * MIN - now; if (w > 0) return `剛洗過澡，${Math.ceil(w / MIN)} 分鐘後再洗吧`; }
  return null;
}
const rotMin = c => c.k === 'poop' ? CONFIG.poop.rotMin : CONFIG.core.rotMin;
function addCore(st, x, now = Date.now(), v = 'yard', k = 'core') { st.cores.push({ x: clamp(x, 4, 124), at: now, v: v === 'room' ? 'room' : 'yard', k: k === 'poop' ? 'poop' : 'core' }); while (st.cores.length > CONFIG.core.max) st.cores.shift(); }
const isRotten = (c, now = Date.now()) => now - c.at >= rotMin(c) * MIN;
function clearCore(st, i, now = Date.now()) { const c = st.cores[i]; if (!c) return null; applyTime(st, now); const k = st.cores.indexOf(c); if (k >= 0) st.cores.splice(k, 1); st.cleanups++; if (st.hatched) st.path.metal += 1; return { rotten: isRotten(c, now), kind: c.k }; }

/* ---------------- 頂球小遊戲 ---------------- */
function finishBallGame(st, score, now = Date.now()) {
  score = int(score, 0, 0, CONFIG.ballGame.balls);
  const r = act(st, 'play', now); if (!r.ok) return r;
  st.ball.goals += score; st.path.bird += 2 * score; const best = score > st.ball.best; if (best) { st.ball.best = score; if (score > 0) journal(st, now, `頂球創新紀錄：${score} 分！`); }
  return Object.assign(r, { score, best });
}

/* ---------------- 小窩：升級、讓多隻寵物住進來 ---------------- */
const PET_FIELDS = ['seed', 'genes', 'name', 'hatched', 'stage', 'route', 'xp', 'hunger', 'mood', 'clean', 'energy', 'bond', 'path', 'care', 'events', 'hatchedAt'];
function snapshotPet(st) { const p = {}; for (const k of PET_FIELDS) p[k] = JSON.parse(JSON.stringify(st[k])); p.sleeping = false; return p; }
function sanitizePet(p, now = Date.now()) { const r = sanitize(Object.assign({ v: 6 }, p, { roster: [], dex: [] }), now); return snapshotPet(r); }
const denCap = st => CONFIG.den[st.den.level - 1].cap;
const petCount = st => (st.hatched ? 1 : 0) + st.roster.length;
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

/* ---------------- 每日小目標（GDD 第 5 節：3 個任選，不強迫全清） ---------------- */
const GOALS = {
  feed:    { t: '餵食 1 次', ev: 'feed', need: 1, item: 'food' },
  play:    { t: '陪牠玩耍 2 次', ev: 'play', need: 2, item: 'coins' },
  wash:    { t: '幫牠洗澡 1 次', ev: 'wash', need: 1, item: 'seeds' },
  pet:     { t: '摸摸牠（有親密度的那種）1 次', ev: 'pet', need: 1, item: 'food' },
  adv:     { t: '出發冒險 1 次', ev: 'adv', need: 1, item: 'seeds' },
  win:     { t: '打贏 1 場戰鬥', ev: 'win', need: 1, item: 'coins' },
  plant:   { t: '種下 1 顆種子', ev: 'plant', need: 1, item: 'food' },
  harvest: { t: '收成 1 次', ev: 'harvest', need: 1, item: 'seeds' },
  steps:   { t: '走 3,000 步', ev: 'steps', need: 3000, item: 'coins' }
};
const GOAL_IDS = Object.keys(GOALS);
function goalsFor(key) {   // 用日期當亂數種子：同一天每次打開都一樣
  let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const r = rng(h), pool = GOAL_IDS.slice(), out = [];
  while (out.length < CONFIG.goals.perDay) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}
function ensureGoals(st, now = Date.now()) {
  const k = dayKey(now);
  if (st.goals.date === k) return false;
  if (st.goals.date && k < st.goals.date) return false;            // 時間倒退：不換新目標
  st.goals = { date: k, list: goalsFor(k).map(id => ({ id, n: 0, claimed: false })) };
  return true;
}
function track(st, ev, now = Date.now(), amount = 1) {
  ensureGoals(st, now);
  for (const g of st.goals.list) if (GOALS[g.id].ev === ev && !g.claimed) g.n = Math.min(GOALS[g.id].need, g.n + amount);
}
function claimGoal(st, idx, now = Date.now()) {
  ensureGoals(st, now); const g = st.goals.list[idx];
  if (!g) return { ok: false, msg: '沒有這個目標' };
  if (g.claimed) return { ok: false, msg: '已經領過了' };
  if (g.n < GOALS[g.id].need) return { ok: false, msg: '還沒完成' };
  g.claimed = true; const it = GOALS[g.id].item;
  if (it === 'coins') { st.coins += CONFIG.goals.reward.coins; return { ok: true, msg: `金幣 +${CONFIG.goals.reward.coins}` }; }
  if (it === 'food') { st.inv.food++; return { ok: true, msg: '食物 +1' }; }
  st.inv.seeds++; return { ok: true, msg: '種子 +1' };
}

/* ---------------- 電系：戰鬥中蓄力、羈絆之力 ---------------- */
function battleCharge(st) { if (st.hatched) st.path.elec += 1; }
function battleBond(st, now = Date.now()) { st.bondUses++; if (st.hatched) st.path.elec += 3; if (st.bondUses === 1) journal(st, now, '第一次發動羈絆之力！'); }

/* ---------------- 配對 ---------------- */
function canBreed(st, friend, now = Date.now()) {
  const B = CONFIG.breed;
  if (!st.hatched || !(st.stage === 'adult' || st.stage === 'ascended')) return '你的幻獸要先長到成年期才能配對';
  if (!friend.adult) return '朋友的幻獸還沒長到成年期';
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

const API = { CONFIG, ROUTES, STAGES, ROUTE_EVENT, EVENT_TEXT, clamp, num, chars, dayKey, hourIn, level, rng, makeGenome, CLASSIC_G, encodeGenome, decodeGenome, breedGenome,
  G_SIDE, G_TOP, G_TAIL, G_PAT, G_EYE, EL_LIST, genomeOfSeed, gidOf, genomeFromId, okId, formCode, fresh, sanitize, applyTime, ageHours, journal, claimDaily, canGather, gather,
  act, pet, bondTier, discover, pickRoute, specialDone, stageReq, checkStages, tendencyHint, hatch, creditSteps, stepTier,
  plotState, plant, harvest, buySeed, buyDecor, placeDecor, buyItem, useCandy,
  canAct, addCore, clearCore, isRotten, finishBallGame, snapshotPet, sanitizePet, denCap, petCount, upgradeDen, moveToDen, swapPet, GOALS, goalsFor, ensureGoals, track, claimGoal,
  ELEM, BEATS, elemMult, AREA_ROUTE, ROUTE_CH, battleCharge, battleBond, expectDamage, bondBoost, digest, canAdventure, startAdventure, mkFighter, foeFor, damage, finishAdventure, canBreed, breed, addXP };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.PFCore = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
