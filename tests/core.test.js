// 幻獸日記 規則核心單元測試：node tests/core.test.js
'use strict';
const C = require('../game-core.js');
const assert = require('assert');
const H = 3600000, MIN = 60000;
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('PASS ' + name); } catch (e) { fail++; console.log('FAIL ' + name + ' — ' + e.message); } }
const T0 = Date.parse('2026-11-16T02:00:00Z');           // 台北 10:00
function hatched(now = T0) { const s = C.fresh(now); C.hatch(s, now); s.name = '測試'; return s; }
const nonNeg = s => ['hunger', 'mood', 'clean', 'energy', 'bond'].every(k => s[k] >= 0 && s[k] <= 100) && s.coins >= 0 && s.xp >= 0 && s.inv.food >= 0 && s.inv.seeds >= 0;

// 1. 全新存檔與檢查
t('全新存檔：蛋、50 金幣、3 食物、2 種子', () => { const s = C.fresh(T0); assert.equal(s.stage, 'egg'); assert.equal(s.coins, 50); assert.equal(s.inv.food, 3); assert.equal(s.inv.seeds, 2); });
t('孵化後為幼年期並記錄日記與圖鑑', () => { const s = hatched(); assert.equal(s.stage, 'juvenile'); assert.equal(s.dex.length, 1); assert.ok(s.journal.length >= 1); });
t('存檔 JSON 往返不變（檢查是冪等的）', () => { const s = C.sanitize(hatched(), T0); const r = C.sanitize(JSON.parse(JSON.stringify(s)), T0); assert.deepStrictEqual(r, s); });

// 2. 行為扣費與加值，不會出現負數
t('餵食：先用庫存食物', () => { const s = hatched(); s.hunger = 50; const r = C.act(s, 'feed', T0); assert.ok(r.ok); assert.equal(s.inv.food, 2); assert.equal(s.coins, 50); assert.equal(s.hunger, 75); assert.equal(s.xp, 5); assert.equal(s.path.tide, 1); });
t('餵食：沒食物就花 5 金幣', () => { const s = hatched(); s.hunger = 50; s.inv.food = 0; C.act(s, 'feed', T0); assert.equal(s.coins, 45); });
t('餵食：已滿不消耗也不給 XP', () => { const s = hatched(); s.hunger = 96; const r = C.act(s, 'feed', T0); assert.ok(!r.ok); assert.equal(s.inv.food, 3); assert.equal(s.xp, 0); });
t('玩耍：體力 < 10 不能玩', () => { const s = hatched(); s.energy = 9; assert.ok(!C.act(s, 'play', T0).ok); });
t('玩耍：心情 +15、體力 -10、會變餓變髒、XP +10', () => { const s = hatched(); s.mood = 50; s.energy = 50; s.hunger = 50; s.clean = 50; C.act(s, 'play', T0); assert.equal(s.mood, 65); assert.equal(s.hunger, 45); assert.equal(s.clean, 44); assert.equal(s.energy, 40); assert.equal(s.xp, 10); });
t('玩耍：每 30 分鐘最多 3 次給 XP', () => { const s = hatched(); s.energy = 100; for (let i = 0; i < 5; i++) { s.energy = 100; C.act(s, 'play', T0 + i * 1000); } assert.equal(s.xp, 30); s.energy = 100; C.act(s, 'play', T0 + 31 * MIN); assert.equal(s.xp, 40); });
t('睡覺時不能玩耍或冒險；叫醒無成本', () => { const s = hatched(); s.view = 'room'; C.act(s, 'sleep', T0); assert.ok(s.sleeping); assert.ok(!C.act(s, 'play', T0).ok); assert.ok(C.canAdventure(s, 1)); C.act(s, 'sleep', T0); assert.ok(!s.sleeping); });
t('隨機操作 2000 次後所有數值都不為負', () => {
  const s = hatched(); let now = T0; const acts = ['feed', 'play', 'wash', 'sleep'];
  for (let i = 0; i < 2000; i++) { now += Math.floor(Math.random() * 20 * MIN); const a = acts[i % 4]; if (i % 7 === 0) C.pet(s, now); else C.act(s, a, now); if (i % 11 === 0) C.gather(s, now); }
  assert.ok(nonNeg(s));
});

// 3. 30 分鐘冷卻不能用重新整理繞過（冷卻時間存在存檔裡）
t('洗澡 30 分鐘冷卻：存檔重新載入後仍有效', () => {
  const s = hatched(); s.clean = 20; C.act(s, 'wash', T0); const r = C.sanitize(JSON.parse(JSON.stringify(s)), T0 + 5 * MIN);
  r.clean = 20; assert.ok(!C.act(r, 'wash', T0 + 5 * MIN).ok); assert.ok(C.act(r, 'wash', T0 + 31 * MIN).ok);
});
t('撫摸 30 分鐘內只有第一次有收益（重新載入也一樣）', () => {
  const s = hatched(); const a = C.pet(s, T0); assert.ok(a.reward); assert.equal(s.bond, 2); assert.equal(s.path.tide, 2);
  const r = C.sanitize(JSON.parse(JSON.stringify(s)), T0 + 10 * MIN); assert.ok(!C.pet(r, T0 + 10 * MIN).reward); assert.equal(r.bond, 2);
  assert.ok(C.pet(r, T0 + 30 * MIN).reward); assert.equal(r.bond, 4);
});

// 4. 離線變化上限 12 小時，年齡依真實時間
for (const [label, hrs] of [['2 小時', 2], ['24 小時', 24], ['7 天', 168]]) {
  t(`離線 ${label}：狀態最多變化 12 小時，年齡 ${hrs} 小時`, () => {
    const s = hatched(); s.hunger = 80; s.mood = 80; s.energy = 20; const now = T0 + hrs * H; C.applyTime(s, now);
    const eff = Math.min(hrs, 12); assert.equal(Math.round(s.hunger * 100) / 100, 80 - 4 * eff); assert.equal(s.mood, 80 - 3 * eff); assert.equal(s.energy, Math.min(100, 20 + 8 * eff));
    assert.equal(C.ageHours(s, now), hrs);
  });
}
t('睡眠時體力每小時 +25', () => { const s = hatched(); s.view = 'room'; s.energy = 10; C.act(s, 'sleep', T0); C.applyTime(s, T0 + 2 * H); assert.equal(s.energy, 60); });
t('時間倒退：不回溯、記錄警告', () => { const s = hatched(); s.hunger = 50; const r = C.applyTime(s, T0 - H); assert.equal(r.warn, 'back'); assert.equal(s.hunger, 50); assert.ok(s.clockWarn); assert.equal(s.lastTick, T0); });
t('大幅快轉：照上限處理並提示', () => { const s = hatched(); const r = C.applyTime(s, T0 + 40 * 24 * H); assert.equal(r.warn, 'jump'); assert.equal(r.eff, 12); });

// 5. 進化門檻邊界
t('少年期：12h 與 100 XP 都要達到', () => {
  const s = hatched(); s.xp = 100; assert.equal(C.checkStages(s, T0 + 12 * H - 1).length, 0);
  s.xp = 99; assert.equal(C.checkStages(s, T0 + 12 * H).length, 0); s.xp = 100; assert.equal(C.checkStages(s, T0 + 12 * H)[0].to, 'adolescent');
});
t('成年期：48h 與 350 XP 邊界', () => { const s = hatched(); s.xp = 349; assert.equal(C.checkStages(s, T0 + 48 * H).map(x => x.to).join(), 'adolescent'); s.xp = 350; assert.equal(C.checkStages(s, T0 + 48 * H)[0].to, 'adult'); });
t('高階：168h、1000 XP 且完成特殊事件', () => {
  const s = hatched(); s.xp = 1000; s.route = 'flame'; const tr = C.checkStages(s, T0 + 168 * H);
  assert.deepEqual(tr.map(x => x.to), ['adolescent', 'adult']); assert.equal(s.route, 'flame');
  s.events.volcano = true; assert.equal(C.checkStages(s, T0 + 168 * H - 1).length, 0); assert.equal(C.checkStages(s, T0 + 168 * H)[0].to, 'ascended');
});
t('一次跨越多個門檻時依序記錄', () => { const s = hatched(); s.xp = 5000; const tr = C.checkStages(s, T0 + 500 * H); assert.deepEqual(tr.map(x => x.to), ['adolescent', 'adult']); assert.ok(s.journal.length >= 3); });

// 6. 三種路線與平手處理可重現
t('路線：點數最高者勝', () => { const s = hatched(); s.path = { flame: 1, tide: 2, forest: 9 }; assert.equal(C.pickRoute(s), 'forest'); s.path = { flame: 9, tide: 2, forest: 1 }; assert.equal(C.pickRoute(s), 'flame'); });
t('路線平手：先比特殊事件，再依 tide > forest > flame', () => {
  const s = hatched(); s.path = { flame: 5, tide: 5, forest: 5 }; assert.equal(C.pickRoute(s), 'tide');
  s.events.volcano = true; assert.equal(C.pickRoute(s), 'flame'); s.events.volcano = false; s.path.tide = 4; assert.equal(C.pickRoute(s), 'forest');
});
t('缺少特殊事件不能高階進化（三條路線）', () => {
  for (const rt of ['flame', 'tide', 'forest']) { const s = hatched(); s.xp = 2000; s.route = rt; C.checkStages(s, T0 + 200 * H); assert.equal(s.stage, 'adult'); assert.equal(s.route, rt); }
  const s = hatched(); s.xp = 2000; s.route = 'tide'; s.events.moonspring = true; s.bond = 59; C.checkStages(s, T0 + 200 * H); assert.equal(s.stage, 'adult'); s.bond = 60; C.checkStages(s, T0 + 200 * H); assert.equal(s.stage, 'ascended');
});

// 7. 零金幣、零食物不會卡死
t('零金幣零食物：可以採集，2 分鐘冷卻', () => {
  const s = hatched(); s.coins = 0; s.inv.food = 0; s.hunger = 10;
  assert.equal(C.act(s, 'feed', T0).code, 'nofood'); assert.ok(C.gather(s, T0).ok); assert.ok(!C.gather(s, T0 + 60000).ok || s.inv.food > 0);
  assert.ok(C.act(s, 'feed', T0 + 1000).ok); assert.ok(!C.gather(s, T0 + 60000).ok); assert.ok(C.gather(s, T0 + 2 * MIN + 1).ok);
});
t('每日保底：同一天只能領一次，時間倒退不能重領', () => {
  const s = hatched(); assert.ok(C.claimDaily(s, T0)); assert.equal(C.claimDaily(s, T0 + H), null);
  assert.equal(C.claimDaily(s, T0 - 2 * 86400000), null); assert.ok(C.claimDaily(s, T0 + 86400000));
});

// 冒險與戰鬥
t('冒險：每日前 5 次全額，之後只給 20% XP', () => {
  const s = hatched(); C.claimDaily(s, T0); const res = [];
  for (let i = 0; i < 7; i++) { s.energy = 100; const st = C.startAdventure(s, 1, T0); res.push(C.finishAdventure(s, 1, 'win', st.full, T0, () => .99)); }
  assert.equal(res[4].coins, 12); assert.equal(res[5].coins, 0); assert.equal(res[5].xp, 5);
});
t('冒險：體力不足不能出發；失敗只給 XP +3', () => { const s = hatched(); s.energy = 19; assert.ok(!C.startAdventure(s, 1, T0).ok); s.energy = 50; C.startAdventure(s, 1, T0); const xp0 = s.xp; const r = C.finishAdventure(s, 1, 'loss', true, T0); assert.equal(s.xp - xp0, 3); assert.equal(r.coins, 0); assert.equal(s.energy, 30); });
t('首次打通新關卡＝探索發現（森林 +2、XP +10）；第 15 關觸發火山遺跡', () => {
  const s = hatched(); s.adv.stage = 15; C.claimDaily(s, T0); s.energy = 100; const st = C.startAdventure(s, 15, T0);
  const r = C.finishAdventure(s, 15, 'win', st.full, T0, () => .99); assert.ok(r.events.includes('volcano')); assert.ok(s.events.volcano); assert.equal(s.path.forest, 4); assert.equal(s.adv.stage, 16);
});
t('親密度 80：戰鬥中撐住一次', () => { const a = C.mkFighter('a', 'k', 10, 'flame', 0, 80, 0), d = C.mkFighter('b', 'k', 1, 'tide', 0, 80, 80); d.hp = 5; const r = C.damage(a, d, true, () => .5); assert.ok(r.endured); assert.equal(d.hp, 1); });
t('屬性相剋：火剋森 1.5 倍', () => { const a = C.mkFighter('a', 'k', 5, 'flame', 0, 80, 0), d = C.mkFighter('b', 'k', 5, 'forest', 0, 80, 0); assert.equal(C.damage(a, d, true, () => .5).mult, 1.5); });

// 步數
t('步數：每 1000 步 XP +10、每 2000 步土系 +1，同日只算增加量', () => {
  const s = hatched(); let r = C.creditSteps(s, '12,345', null, T0); assert.equal(r.delta, 12345); assert.equal(r.xp, 120); assert.equal(s.path.earth, 6);
  r = C.creditSteps(s, 12000, null, T0); assert.equal(r.delta, 0); r = C.creditSteps(s, 15000, null, T0); assert.equal(r.delta, 2655);
});
t('步數：每天上限 5 萬、只能補登 7 天、10 萬步突破 +100 金幣', () => {
  const s = hatched(); C.creditSteps(s, 999999, null, T0); assert.equal(s.steps.total, 50000); assert.ok(C.creditSteps(s, 1, '2020-01-01', T0).err);
  const c0 = s.coins; C.creditSteps(s, 50000, C.dayKey(T0 - 86400000), T0); assert.equal(C.stepTier(s), 1); assert.equal(s.coins, c0 + 100);
});

// 配對
t('配對：需要成年期、冷卻 6 小時、花 20 金幣', () => {
  const s = hatched(); const f = { G: C.makeGenome(5), name: '阿花', adult: true };
  assert.ok(!C.breed(s, f, T0).ok); s.stage = 'adult'; s.route = 'tide'; s.mood = 90;
  const r = C.breed(s, f, T0); assert.ok(r.ok); assert.equal(s.coins, 30); assert.equal(s.eggs.length, 1);
  assert.ok(!C.breed(s, f, T0 + 5 * H).ok); assert.ok(C.breed(s, f, T0 + 6 * H).ok);
});

// 9. 版本升級與損毀資料
t('V1.5 舊存檔遷移：等級轉總 XP、路線改名、成年期', () => {
  const old = { v: 5, hatched: true, name: '老露', level: 5, xp: 20, coins: 77, route: 'mist', seed: 123, care: { feed: 3, pet: 2 }, steps: { total: 10000, days: {} }, adv: { stage: 3, wins: 2 }, dex: [{ id: 'g:123', route: 'mist', petName: '老露', at: T0 }], hatchedAt: T0 - 3 * 86400000, sound: false };
  const r = C.sanitize(old, T0); assert.equal(r.xp, 50 + 100 + 150 + 200 + 20); assert.equal(r.route, 'tide'); assert.equal(r.stage, 'adult'); assert.equal(r.coins, 77);
  assert.equal(r.path.tide, 7); assert.equal(r.path.flame, 10); assert.equal(r.path.earth, 5); assert.equal(r.settings.sound, false); assert.equal(r.dex[0].route, 'tide'); assert.equal(r.inv.food, 3);
});
t('V1.2 舊存檔遷移', () => { const r = C.sanitize({ hatched: true, name: '舊', level: 3, xp: 40, coins: 77, hunger: 60, updated: T0 - H }, T0); assert.equal(r.xp, 190); assert.equal(r.stage, 'juvenile'); assert.equal(r.lastTick, T0 - H); });
t('損毀資料安全恢復：亂碼數值被修正', () => {
  const r = C.sanitize({ v: 6, hatched: true, hunger: 'abc', mood: -50, clean: 999, coins: -3, xp: NaN, stage: 'hacker', route: 'lava', inv: { food: -1 }, path: { flame: 'x' }, genes: '1.2.3', dex: 'no', eggs: [{ id: 'evil' }] }, T0);
  assert.ok(nonNeg(r)); assert.equal(r.hunger, C.CONFIG.start.hunger); assert.equal(r.mood, 0); assert.equal(r.clean, 100); assert.equal(r.stage, 'juvenile'); assert.ok(C.EL_LIST.includes(r.route)); assert.equal(r.genes, null); assert.equal(r.eggs.length, 0);
});
t('null / 非物件 → 全新存檔', () => { assert.equal(C.sanitize(null, T0).stage, 'egg'); assert.equal(C.sanitize('x', T0).stage, 'egg'); });
t('基因碼編碼／解碼可逆，非法碼被拒絕', () => { const G = C.makeGenome(42); const D = C.decodeGenome(C.encodeGenome(G)); delete G.seed; assert.deepEqual(D, G); assert.equal(C.decodeGenome('9.9.9'), null); });
t('日期以台北時區計算', () => { assert.equal(C.dayKey(Date.parse('2026-11-16T16:30:00Z')), '2026-11-17'); assert.equal(C.dayKey(Date.parse('2026-11-16T15:59:00Z')), '2026-11-16'); });

// 家園種植
t('種植：用掉種子，2 小時前不能收成，2 小時整可以', () => {
  const s = hatched(); assert.ok(C.plant(s, 0, T0).ok); assert.equal(s.inv.seeds, 1); assert.ok(!C.plant(s, 0, T0).ok);
  assert.ok(!C.harvest(s, 0, T0 + 2 * H - 1).ok); const r = C.harvest(s, 0, T0 + 2 * H); assert.ok(r.ok);
  assert.equal(s.inv.food, 4); assert.equal(s.inv.berry, 2); assert.equal(s.xp, 5); assert.equal(s.path.forest, 3); assert.equal(s.harvests, 1); assert.ok(C.plotState(s, 0, T0).empty);
});
t('種植：沒種子不能種；每格只能一株；金幣買種子', () => { const s = hatched(); s.inv.seeds = 0; assert.equal(C.plant(s, 1, T0).code, 'noseed'); assert.ok(C.buySeed(s).ok); assert.equal(s.coins, 47); assert.ok(C.plant(s, 1, T0).ok); assert.ok(!C.plant(s, 9, T0).ok); });
t('種植：時間倒退不會變成負進度', () => { const s = hatched(); C.plant(s, 0, T0); const q = C.plotState(s, 0, T0 - H); assert.equal(q.progress, 0); assert.ok(!q.ripe); });
t('種植：存檔往返保留田地', () => { const s = hatched(); C.plant(s, 2, T0); const r = C.sanitize(JSON.parse(JSON.stringify(s)), T0); assert.equal(r.plots[2].at, T0); assert.equal(r.plots.length, 3); });
t('森系高階：收成 10 次＋古樹事件', () => {
  const s = hatched(); s.xp = 2000; s.route = 'forest'; s.events.oldtree = true; C.checkStages(s, T0 + 200 * H); assert.equal(s.stage, 'adult');
  s.inv.seeds = 20; let now = T0; for (let i = 0; i < 10; i++) { C.plant(s, 0, now); now += 2 * H; C.harvest(s, 0, now); }
  assert.equal(s.harvests, 10); C.checkStages(s, T0 + 200 * H); assert.equal(s.stage, 'ascended');
});
// 每日小目標
t('每日目標：每天 3 個、同一天固定、隔天換新', () => {
  const s = hatched(); C.ensureGoals(s, T0); const a = s.goals.list.map(g => g.id).join(); assert.equal(s.goals.list.length, 3);
  assert.equal(new Set(s.goals.list.map(g => g.id)).size, 3); C.ensureGoals(s, T0 + H); assert.equal(s.goals.list.map(g => g.id).join(), a);
  assert.deepEqual(C.goalsFor(C.dayKey(T0)), C.goalsFor(C.dayKey(T0)));
  C.ensureGoals(s, T0 + 86400000); assert.notEqual(s.goals.date, C.dayKey(T0));
});
t('每日目標：完成才能領、只能領一次、時間倒退不重置', () => {
  const s = hatched(); C.ensureGoals(s, T0); s.goals.list = [{ id: 'feed', n: 0, claimed: false }, { id: 'steps', n: 0, claimed: false }, { id: 'plant', n: 0, claimed: false }];
  assert.ok(!C.claimGoal(s, 0, T0).ok); s.hunger = 10; C.act(s, 'feed', T0); assert.equal(s.goals.list[0].n, 1);
  const f = s.inv.food; assert.ok(C.claimGoal(s, 0, T0).ok); assert.equal(s.inv.food, f + 1); assert.ok(!C.claimGoal(s, 0, T0).ok);
  C.creditSteps(s, 3500, null, T0); assert.equal(s.goals.list[1].n, 3000); const c = s.coins; C.claimGoal(s, 1, T0); assert.equal(s.coins, c + 8);
  C.plant(s, 0, T0); assert.equal(s.goals.list[2].n, 1);
  C.ensureGoals(s, T0 - 3 * 86400000); assert.equal(s.goals.date, C.dayKey(T0));
});
t('每日目標：存檔亂碼目標被過濾', () => { const r = C.sanitize({ v: 6, goals: { date: '2026-11-16', list: [{ id: 'hack', n: 9 }, { id: 'feed', n: -3 }] } }, T0); assert.equal(r.goals.list.length, 1); assert.equal(r.goals.list[0].n, 0); });

// 商店與裝飾
t('家具：買了扣錢並自動擺上、不能重複買、錢不夠不能買', () => {
  const s = hatched(); assert.ok(C.buyDecor(s, 'rug_red').ok); assert.equal(s.coins, 20); assert.equal(s.decor.placed.rug, 'rug_red');
  assert.ok(!C.buyDecor(s, 'rug_red').ok); assert.ok(!C.buyDecor(s, 'bed_cloud').ok); assert.equal(s.coins, 20); assert.ok(!C.buyDecor(s, 'hack').ok);
});
t('家具：擺放／收起、沒有的不能擺、壁紙不能拿掉', () => {
  const s = hatched(); s.coins = 999; C.buyDecor(s, 'toy_ball'); assert.ok(C.placeDecor(s, 'toy_ball').ok); assert.equal(s.decor.placed.toy, undefined);
  assert.ok(C.placeDecor(s, 'toy_ball').ok); assert.equal(s.decor.placed.toy, 'toy_ball'); assert.ok(!C.placeDecor(s, 'lamp_moon').ok); assert.ok(!C.placeDecor(s, 'paper_cream').ok);
  C.buyDecor(s, 'rug_star'); C.buyDecor(s, 'rug_red'); assert.equal(s.decor.placed.rug, 'rug_red'); C.placeDecor(s, 'rug_star'); assert.equal(s.decor.placed.rug, 'rug_star');
});
t('家具：存檔亂碼被過濾（沒買的、放錯格的、不存在的）', () => {
  const r = C.sanitize({ v: 6, decor: { owned: ['rug_red', 'hack'], placed: { rug: 'rug_red', bed: 'bed_cloud', toy: 'rug_red', paper: 'xx' } } }, T0);
  assert.deepEqual(r.decor.owned, ['paper_cream', 'bed_round', 'rug_red']); assert.deepEqual(r.decor.placed, { paper: 'paper_cream', rug: 'rug_red', bed: 'bed_round' });
});
t('道具：買食物／種子／星星糖、吃星星糖', () => {
  const s = hatched(); C.buyItem(s, 'candy'); assert.equal(s.coins, 38); assert.equal(s.inv.candy, 1); s.mood = 50; s.hunger = 50;
  const r = C.useCandy(s, T0); assert.ok(r.ok); assert.equal(s.mood, 70); assert.equal(s.hunger, 60); assert.equal(s.xp, 3); assert.ok(!C.useCandy(s, T0).ok);
  s.coins = 2; assert.ok(!C.buyItem(s, 'food').ok); assert.ok(nonNeg(s));
});

// 果核
t('果核：10 分鐘內清掉沒事；發臭後每小時心情 −4（每顆），最多算 12 小時', () => {
  const s = hatched(); s.mood = 80; C.addCore(s, 60, T0); C.applyTime(s, T0 + 10 * MIN); assert.equal(Math.round(s.mood * 100) / 100, Math.round((80 - 3 * 10 / 60) * 100) / 100);
  const m = s.mood; C.applyTime(s, T0 + 10 * MIN + H); assert.equal(Math.round((m - s.mood) * 100) / 100, 7);   // 自然 −3 + 果核 −4
  assert.ok(C.isRotten(s.cores[0], T0 + 11 * MIN)); assert.ok(C.clearCore(s, 0, T0 + 2 * H).rotten); assert.equal(s.cores.length, 0);
});
t('果核：最多 8 顆、存檔往返保留', () => { const s = hatched(); for (let i = 0; i < 11; i++) C.addCore(s, i * 10, T0); assert.equal(s.cores.length, 8); const r = C.sanitize(JSON.parse(JSON.stringify(s)), T0); assert.equal(r.cores.length, 8); });
t('canAct 只檢查不改變狀態', () => { const s = hatched(); s.hunger = 50; const before = JSON.stringify(s); assert.equal(C.canAct(s, 'feed', T0), null); assert.equal(JSON.stringify(s), before); s.hunger = 99; assert.ok(C.canAct(s, 'feed', T0)); });
// V1.19：難度與食物
t('多種食物：魚是潮系最愛（心情 +10、經驗 +3），吃完留下魚骨', () => { const s = hatched(); s.route = 'tide'; s.hunger = 30; s.mood = 50; s.inv.fish = 1; const r = C.act(s, 'feed', T0, 'fish'); assert.ok(r.ok && r.fav); assert.equal(r.left, 'bone'); assert.equal(s.inv.fish, 0); assert.equal(s.hunger, 65); assert.equal(s.mood, 64); assert.equal(s.xp, 9); });
t('食物沒有就用金幣買；商店可以買各種食物', () => { const s = hatched(); s.coins = 20; s.hunger = 10; s.inv.meat = 0; assert.ok(C.act(s, 'feed', T0, 'meat').ok); assert.equal(s.coins, 8); assert.ok(C.buyItem(s, 'berry').ok); assert.equal(s.inv.berry, 1); });
t('冒險會變餓變髒；輸了心情下降', () => { const s = hatched(); s.energy = 100; s.hunger = 80; s.clean = 80; s.mood = 60; C.startAdventure(s, 1, T0); assert.equal(s.hunger, 65); assert.equal(s.clean, 60); C.finishAdventure(s, 1, 'loss', true, T0); assert.equal(s.mood, 48); });
t('沒照顧好親密度會掉；心情低時摸摸不加親密度', () => { const s = hatched(); s.bond = 30; s.hunger = 10; C.applyTime(s, T0 + 2 * H); assert.ok(s.bond < 30); s.hunger = 90; s.clean = 90; s.mood = 30; C.applyTime(s, T0 + 3 * H); const b = s.bond; C.pet(s, T0 + 3 * H); assert.equal(s.bond, b); });
t('野生怪會跟著玩家等級變強', () => { assert.equal(C.foeFor(1, 20).level, 18); assert.equal(C.foeFor(1, 1).level, 1); assert.equal(C.foeFor(12, 20).level, 19); });
// 頂球
t('頂球：結算套用玩耍規則、記錄最佳分數', () => { const s = hatched(); s.energy = 50; s.mood = 40; const r = C.finishBallGame(s, 2, T0); assert.ok(r.ok); assert.equal(s.mood, 55); assert.equal(s.ball.best, 2); assert.equal(s.ball.goals, 2); C.finishBallGame(s, 1, T0); assert.equal(s.ball.best, 2); s.energy = 5; assert.ok(!C.finishBallGame(s, 3, T0).ok); assert.equal(s.ball.best, 2); });
// 小窩
t('小窩：升級扣錢、容量變大、最高 4 級', () => { const s = hatched(); s.coins = 2000; assert.equal(C.denCap(s), 1); assert.ok(C.upgradeDen(s).ok); assert.equal(C.denCap(s), 2); assert.equal(s.coins, 1880); C.upgradeDen(s); C.upgradeDen(s); assert.equal(C.denCap(s), 4); assert.ok(!C.upgradeDen(s).ok); });
t('小窩：沒空位不能搬進去；有空位時搬進去並保留數值', () => {
  const s = hatched(); assert.ok(!C.moveToDen(s)); s.coins = 999; C.upgradeDen(s); s.name = 'A'; s.xp = 123; s.bond = 40; assert.ok(C.moveToDen(s)); assert.equal(s.roster.length, 1); assert.equal(s.roster[0].name, 'A'); assert.equal(s.roster[0].xp, 123);
});
t('小窩：交換夥伴，休息期間數值不變，存檔往返保留', () => {
  const s = hatched(); s.coins = 999; C.upgradeDen(s); s.name = 'A'; s.hunger = 30; C.moveToDen(s);
  const fresh = C.fresh(T0); Object.assign(s, { seed: fresh.seed, name: 'B', hatched: true, stage: 'juvenile', hatchedAt: T0, hunger: 90, xp: 0, bond: 0 });
  const r = C.swapPet(s, 0, T0 + 24 * H); assert.ok(r.ok); assert.equal(s.name, 'A'); assert.equal(s.hunger, 30); assert.equal(s.roster[0].name, 'B');
  const back = C.sanitize(JSON.parse(JSON.stringify(s)), T0 + 24 * H); assert.equal(back.roster.length, 1); assert.equal(back.roster[0].name, 'B'); assert.ok(nonNeg(back));
});
t('小窩：亂碼住客被過濾', () => { const r = C.sanitize({ v: 6, den: { level: 99 }, roster: [{ hatched: true, name: 'X', hunger: 'bad' }, { hatched: false }, 'junk'] }, T0); assert.equal(r.den.level, 4); assert.equal(r.roster.length, 1); assert.equal(r.roster[0].hunger, C.CONFIG.start.hunger); });

// 大便與馬桶
t('大便：吃完 40 分鐘後大便、3 分鐘沒清就發臭扣心情', () => {
  const s = hatched(); s.hunger = 50; C.act(s, 'feed', T0); assert.equal(s.digest.length, 1);
  C.applyTime(s, T0 + 39 * MIN); assert.equal(s.cores.length, 0); const r = C.applyTime(s, T0 + 40 * MIN); assert.deepEqual(r.events, ['poop']);
  assert.equal(s.cores[0].k, 'poop'); assert.ok(!C.isRotten(s.cores[0], T0 + 42 * MIN)); assert.ok(C.isRotten(s.cores[0], T0 + 43 * MIN));
  const m = s.mood; C.applyTime(s, T0 + 43 * MIN + H); assert.equal(Math.round((m - s.mood) * 100) / 100, 7.15);   // 自然 −3.15（1.05 小時）＋大便 −4（發臭 1 小時）
  assert.equal(C.clearCore(s, 0, T0 + 2 * H).kind, 'poop');
});
t('寵物馬桶：有馬桶就自己上廁所，不會留下大便', () => { const s = hatched(); s.coins = 999; assert.ok(C.buyDecor(s, 'toilet_pot').ok); s.hunger = 50; C.act(s, 'feed', T0); const r = C.applyTime(s, T0 + H); assert.deepEqual(r.events, ['toilet']); assert.equal(s.cores.length, 0); assert.equal(s.toiletUses, 1); });
t('離線時大便：一回來就算發臭的時間（最多 12 小時）', () => { const s = hatched(); s.hunger = 50; s.mood = 80; C.act(s, 'feed', T0); C.applyTime(s, T0 + 5 * H); assert.equal(s.cores.length, 1); assert.ok(s.mood < 80 - 5); });
// 回窩睡覺
t('外面不能睡覺，小窩裡可以', () => { const s = hatched(); assert.equal(C.act(s, 'sleep', T0).code, 'outside'); assert.ok(C.canAct(s, 'sleep', T0)); s.view = 'room'; assert.ok(C.act(s, 'sleep', T0).ok); assert.equal(C.canAct(s, 'sleep', T0), null); });
t('新存檔與舊存檔都有小圓床', () => { assert.equal(C.fresh(T0).decor.placed.bed, 'bed_round'); assert.equal(C.sanitize({ v: 6, decor: { owned: ['paper_cream'], placed: { paper: 'paper_cream' } } }, T0).decor.placed.bed, 'bed_round');
  const s = hatched(); C.placeDecor(s, 'bed_round'); assert.equal(C.sanitize(JSON.parse(JSON.stringify(s)), T0).decor.placed.bed, undefined); });
// 戰鬥擴充
t('藥水：開局 1 瓶、商店 20 金幣', () => { const s = hatched(); assert.equal(s.inv.potion, 1); C.buyItem(s, 'potion'); assert.equal(s.inv.potion, 2); assert.equal(s.coins, 30); });
t('蓄力：下一擊 2 倍，用完就消失', () => { const a = C.mkFighter('a', 'k', 5, 'flame', 0, 80, 0), d = C.mkFighter('b', 'k', 5, 'flame', 0, 80, 0); const n = C.expectDamage(a, d, false); a.charged = true; assert.ok(Math.abs(C.expectDamage(a, d, false) - n * 2) <= 1); C.damage(a, d, false, () => .5); assert.ok(!a.charged); });
t('羈絆之力：點越多下越強，最多 5 倍', () => { assert.equal(C.bondBoost(0, 0), 1); assert.ok(C.bondBoost(6, 0) > C.bondBoost(3, 0)); assert.equal(C.bondBoost(50, 100), 5); const a = C.mkFighter('a', 'k', 5, 'flame', 0, 80, 0), d = C.mkFighter('b', 'k', 30, 'tide', 0, 80, 0); const r = C.damage(a, d, false, () => .5, 3); assert.ok(r.dmg >= C.expectDamage(a, d, false) * 2.5); });
t('預估傷害與實際平均一致（隨機 0.5、無會心）', () => { const a = C.mkFighter('a', 'k', 8, 'tide', 0, 80, 0), d = C.mkFighter('b', 'k', 8, 'flame', 0, 80, 0); const e = C.expectDamage(a, d, true); const r = C.damage(a, d, true, () => .5); assert.equal(r.dmg, e); });

// 七種屬性
t('相剋表：每個屬性都有剋與被剋，而且沒有互剋', () => {
  const els = ['fire', 'water', 'leaf', 'earth', 'bird', 'elec', 'metal'];
  for (const a of els) { assert.ok(C.BEATS[a].length >= 2); assert.ok(els.some(b => C.BEATS[b].includes(a)), a + ' 沒有被剋'); for (const b of C.BEATS[a]) assert.ok(!C.BEATS[b].includes(a), a + '/' + b + ' 互剋'); }
  const f = (r) => C.mkFighter('x', 'k', 5, r, 0, 80, 0);
  assert.equal(C.elemMult(f('elec'), f('tide'), true), 1.5); assert.equal(C.elemMult(f('elec'), f('earth'), true), .67); assert.equal(C.elemMult(f('bird'), f('forest'), true), 1.5); assert.equal(C.elemMult(f('metal'), f('bird'), true), 1.5); assert.equal(C.elemMult(f('flame'), f('metal'), true), 1.5);
});
t('新路線點數來源：步數→土、進球→鳥、蓄力與羈絆→電、洗澡與清理→金', () => {
  const s = hatched(); C.creditSteps(s, 4000, null, T0); assert.equal(s.path.earth, 2);
  s.energy = 50; C.finishBallGame(s, 2, T0); assert.equal(s.path.bird, 4);
  C.battleCharge(s); C.battleBond(s, T0); assert.equal(s.path.elec, 4); assert.equal(s.bondUses, 1);
  s.clean = 10; C.act(s, 'wash', T0); C.addCore(s, 50, T0); C.clearCore(s, 0, T0); assert.equal(s.path.metal, 2); assert.equal(s.cleanups, 1);
});
t('屬性在蛋裡就決定：孵化就有屬性，長到成年、高階都不會變', () => {
  for (let i = 0; i < 30; i++) { const s = C.fresh(T0); const el = C.genomeFromId(C.gidOf(s)).el; assert.ok(C.EL_LIST.includes(el)); C.hatch(s, T0); assert.equal(s.route, el);
    s.xp = 400; s.path.flame = 999; C.checkStages(s, T0 + 50 * H); assert.equal(s.stage, 'adult'); assert.equal(s.route, el); }
});
t('7 種屬性的蛋都會出現（分布大致平均）', () => { const c = {}; for (let i = 0; i < 7000; i++) { const el = C.makeGenome(i * 2654435761 >>> 0).el; c[el] = (c[el] || 0) + 1; } for (const el of C.EL_LIST) assert.ok(c[el] > 800 && c[el] < 1200, el + ':' + c[el]); });
t('加上屬性不會改變舊蛋的外觀', () => { const G = C.makeGenome(12345); assert.equal(G.hue, C.makeGenome(12345).hue); const { el, ...rest } = G; assert.ok(el); assert.ok(!('el' in rest)); });
t('配對：寶寶繼承爸媽其中一方的屬性（偶爾突變）', () => { const A = Object.assign(C.makeGenome(1), { el: 'elec' }), B = Object.assign(C.makeGenome(2), { el: 'metal' }); let same = 0; for (let i = 0; i < 400; i++) { const g = C.breedGenome(A, B); if (g.el === 'elec' || g.el === 'metal') same++; } assert.ok(same > 370); });
t('基因碼帶屬性；舊的 13 碼基因也能讀', () => { const G = Object.assign(C.makeGenome(9), { el: 'bird' }); assert.equal(C.decodeGenome(C.encodeGenome(G)).el, 'bird'); const old = C.encodeGenome(G).split('.').slice(0, 13).join('.'); assert.ok(C.EL_LIST.includes(C.decodeGenome(old).el)); });
t('舊存檔：已孵化沒屬性 → 有照顧點數用點數、沒有就用基因', () => { const a = C.sanitize({ v: 7, hatched: true, seed: 5, path: { metal: 9 } }, T0); assert.equal(a.route, 'metal'); const b = C.sanitize({ v: 7, hatched: true, seed: 5 }, T0); assert.equal(b.route, C.makeGenome(5).el); });
t('新路線高階條件：Boss 事件＋累積條件', () => {
  const mk = r => { const s = hatched(); s.xp = 2000; s.route = r; C.checkStages(s, T0 + 200 * H); return s; };
  let s = mk('earth'); s.events.canyon = true; C.checkStages(s, T0 + 200 * H); assert.equal(s.stage, 'adult'); s.steps.total = 100000; C.checkStages(s, T0 + 200 * H); assert.equal(s.stage, 'ascended');
  s = mk('bird'); s.events.skypeak = true; s.ball.goals = 29; C.checkStages(s, T0 + 200 * H); assert.equal(s.stage, 'adult'); s.ball.goals = 30; C.checkStages(s, T0 + 200 * H); assert.equal(s.stage, 'ascended');
  s = mk('elec'); s.events.thunder = true; s.bondUses = 5; C.checkStages(s, T0 + 200 * H); assert.equal(s.stage, 'ascended');
  s = mk('metal'); s.events.mine = true; s.cleanups = 49; C.checkStages(s, T0 + 200 * H); assert.equal(s.stage, 'adult'); s.cleanups = 50; C.checkStages(s, T0 + 200 * H); assert.equal(s.stage, 'ascended');
});
t('冒險區域：21~40 關分別以土、鳥、電、金為主；Boss 關觸發對應事件', () => {
  const count = (from, r) => { let c = 0; for (let n = from; n < from + 5; n++) if (C.foeFor(n).route === r) c++; return c; };
  assert.ok(count(21, 'earth') >= 2); assert.ok(count(26, 'bird') >= 2); assert.ok(count(31, 'elec') >= 2); assert.ok(count(36, 'metal') >= 2);
  const s = hatched(); s.adv.stage = 30; s.energy = 100; C.claimDaily(s, T0); const st = C.startAdventure(s, 30, T0); const r = C.finishAdventure(s, 30, 'win', st.full, T0, () => .99); assert.ok(r.events.includes('skypeak'));
});
t('舊存檔沒有新路線欄位也能正常讀取', () => { const r = C.sanitize({ v: 7, hatched: true, path: { flame: 3, tide: 2, forest: 1 } }, T0); assert.equal(r.path.earth, 0); assert.equal(r.path.metal, 0); assert.equal(r.events.mine, false); });

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
