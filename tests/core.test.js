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
t('玩耍：心情 +20、體力 -10、XP +10', () => { const s = hatched(); s.mood = 50; s.energy = 50; C.act(s, 'play', T0); assert.equal(s.mood, 70); assert.equal(s.energy, 40); assert.equal(s.xp, 10); });
t('玩耍：每 30 分鐘最多 3 次給 XP', () => { const s = hatched(); s.energy = 100; for (let i = 0; i < 5; i++) { s.energy = 100; C.act(s, 'play', T0 + i * 1000); } assert.equal(s.xp, 30); s.energy = 100; C.act(s, 'play', T0 + 31 * MIN); assert.equal(s.xp, 40); });
t('睡覺時不能玩耍或冒險；叫醒無成本', () => { const s = hatched(); C.act(s, 'sleep', T0); assert.ok(s.sleeping); assert.ok(!C.act(s, 'play', T0).ok); assert.ok(C.canAdventure(s, 1)); C.act(s, 'sleep', T0); assert.ok(!s.sleeping); });
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
    const eff = Math.min(hrs, 12); assert.equal(Math.round(s.hunger * 100) / 100, 80 - 2 * eff); assert.equal(s.mood, 80 - eff); assert.equal(s.energy, Math.min(100, 20 + 3 * eff));
    assert.equal(C.ageHours(s, now), hrs);
  });
}
t('睡眠時體力每小時 +12', () => { const s = hatched(); s.energy = 10; C.act(s, 'sleep', T0); C.applyTime(s, T0 + 5 * H); assert.equal(s.energy, 70); });
t('時間倒退：不回溯、記錄警告', () => { const s = hatched(); s.hunger = 50; const r = C.applyTime(s, T0 - H); assert.equal(r.warn, 'back'); assert.equal(s.hunger, 50); assert.ok(s.clockWarn); assert.equal(s.lastTick, T0); });
t('大幅快轉：照上限處理並提示', () => { const s = hatched(); const r = C.applyTime(s, T0 + 40 * 24 * H); assert.equal(r.warn, 'jump'); assert.equal(r.eff, 12); });

// 5. 進化門檻邊界
t('少年期：12h 與 100 XP 都要達到', () => {
  const s = hatched(); s.xp = 100; assert.equal(C.checkStages(s, T0 + 12 * H - 1).length, 0);
  s.xp = 99; assert.equal(C.checkStages(s, T0 + 12 * H).length, 0); s.xp = 100; assert.equal(C.checkStages(s, T0 + 12 * H)[0].to, 'adolescent');
});
t('成年期：48h 與 350 XP 邊界', () => { const s = hatched(); s.xp = 349; assert.equal(C.checkStages(s, T0 + 48 * H).map(x => x.to).join(), 'adolescent'); s.xp = 350; assert.equal(C.checkStages(s, T0 + 48 * H)[0].to, 'adult'); });
t('高階：168h、1000 XP 且完成特殊事件', () => {
  const s = hatched(); s.xp = 1000; s.path.flame = 10; const tr = C.checkStages(s, T0 + 168 * H);
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
  for (const rt of ['flame', 'tide', 'forest']) { const s = hatched(); s.xp = 2000; s.path[rt] = 99; C.checkStages(s, T0 + 200 * H); assert.equal(s.stage, 'adult'); assert.equal(s.route, rt); }
  const s = hatched(); s.xp = 2000; s.path.tide = 99; s.events.moonspring = true; s.bond = 59; C.checkStages(s, T0 + 200 * H); assert.equal(s.stage, 'adult'); s.bond = 60; C.checkStages(s, T0 + 200 * H); assert.equal(s.stage, 'ascended');
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
t('步數：每 1000 步 XP +10、每 2000 步森林 +1，同日只算增加量', () => {
  const s = hatched(); let r = C.creditSteps(s, '12,345', null, T0); assert.equal(r.delta, 12345); assert.equal(r.xp, 120); assert.equal(s.path.forest, 6);
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
  assert.equal(r.path.tide, 7); assert.equal(r.path.flame, 10); assert.equal(r.path.forest, 5); assert.equal(r.settings.sound, false); assert.equal(r.dex[0].route, 'tide'); assert.equal(r.inv.food, 3);
});
t('V1.2 舊存檔遷移', () => { const r = C.sanitize({ hatched: true, name: '舊', level: 3, xp: 40, coins: 77, hunger: 60, updated: T0 - H }, T0); assert.equal(r.xp, 190); assert.equal(r.stage, 'juvenile'); assert.equal(r.lastTick, T0 - H); });
t('損毀資料安全恢復：亂碼數值被修正', () => {
  const r = C.sanitize({ v: 6, hatched: true, hunger: 'abc', mood: -50, clean: 999, coins: -3, xp: NaN, stage: 'hacker', route: 'lava', inv: { food: -1 }, path: { flame: 'x' }, genes: '1.2.3', dex: 'no', eggs: [{ id: 'evil' }] }, T0);
  assert.ok(nonNeg(r)); assert.equal(r.hunger, 80); assert.equal(r.mood, 0); assert.equal(r.clean, 100); assert.equal(r.stage, 'juvenile'); assert.equal(r.route, null); assert.equal(r.genes, null); assert.equal(r.eggs.length, 0);
});
t('null / 非物件 → 全新存檔', () => { assert.equal(C.sanitize(null, T0).stage, 'egg'); assert.equal(C.sanitize('x', T0).stage, 'egg'); });
t('基因碼編碼／解碼可逆，非法碼被拒絕', () => { const G = C.makeGenome(42); const D = C.decodeGenome(C.encodeGenome(G)); delete G.seed; assert.deepEqual(D, G); assert.equal(C.decodeGenome('9.9.9'), null); });
t('日期以台北時區計算', () => { assert.equal(C.dayKey(Date.parse('2026-11-16T16:30:00Z')), '2026-11-17'); assert.equal(C.dayKey(Date.parse('2026-11-16T15:59:00Z')), '2026-11-16'); });

// 家園種植
t('種植：用掉種子，2 小時前不能收成，2 小時整可以', () => {
  const s = hatched(); assert.ok(C.plant(s, 0, T0).ok); assert.equal(s.inv.seeds, 1); assert.ok(!C.plant(s, 0, T0).ok);
  assert.ok(!C.harvest(s, 0, T0 + 2 * H - 1).ok); const r = C.harvest(s, 0, T0 + 2 * H); assert.ok(r.ok);
  assert.equal(s.inv.food, 5); assert.equal(s.xp, 5); assert.equal(s.path.forest, 3); assert.equal(s.harvests, 1); assert.ok(C.plotState(s, 0, T0).empty);
});
t('種植：沒種子不能種；每格只能一株；金幣買種子', () => { const s = hatched(); s.inv.seeds = 0; assert.equal(C.plant(s, 1, T0).code, 'noseed'); assert.ok(C.buySeed(s).ok); assert.equal(s.coins, 47); assert.ok(C.plant(s, 1, T0).ok); assert.ok(!C.plant(s, 9, T0).ok); });
t('種植：時間倒退不會變成負進度', () => { const s = hatched(); C.plant(s, 0, T0); const q = C.plotState(s, 0, T0 - H); assert.equal(q.progress, 0); assert.ok(!q.ripe); });
t('種植：存檔往返保留田地', () => { const s = hatched(); C.plant(s, 2, T0); const r = C.sanitize(JSON.parse(JSON.stringify(s)), T0); assert.equal(r.plots[2].at, T0); assert.equal(r.plots.length, 3); });
t('森系高階：收成 10 次＋古樹事件', () => {
  const s = hatched(); s.xp = 2000; s.path.forest = 99; s.events.oldtree = true; C.checkStages(s, T0 + 200 * H); assert.equal(s.stage, 'adult');
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
  assert.deepEqual(r.decor.owned, ['paper_cream', 'rug_red']); assert.deepEqual(r.decor.placed, { paper: 'paper_cream', rug: 'rug_red' });
});
t('道具：買食物／種子／星星糖、吃星星糖', () => {
  const s = hatched(); C.buyItem(s, 'candy'); assert.equal(s.coins, 38); assert.equal(s.inv.candy, 1); s.mood = 50; s.hunger = 50;
  const r = C.useCandy(s, T0); assert.ok(r.ok); assert.equal(s.mood, 70); assert.equal(s.hunger, 60); assert.equal(s.xp, 3); assert.ok(!C.useCandy(s, T0).ok);
  s.coins = 2; assert.ok(!C.buyItem(s, 'food').ok); assert.ok(nonNeg(s));
});

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
