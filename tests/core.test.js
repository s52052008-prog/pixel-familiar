// 幻獸日記 規則核心單元測試：node tests/core.test.js
'use strict';
const C = require('../game-core.js');
const assert = require('assert');
const H = 3600000, MIN = 60000;
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('PASS ' + name); } catch (e) { fail++; console.log('FAIL ' + name + ' — ' + e.message); } }
const T0 = Date.parse('2026-11-16T02:00:00Z');           // 台北 10:00
function hatched(now = T0) { const s = C.fresh(now); C.hatch(s, now); s.name = '測試'; s.route = null; return s; }   // 屬性特性另外測：預設不帶屬性，數值才固定
const nonNeg = s => ['hunger', 'mood', 'clean', 'energy', 'bond'].every(k => s[k] >= 0 && s[k] <= 100) && s.coins >= 0 && s.xp >= 0 && s.inv.food >= 0 && s.inv.seeds >= 0;

// 1. 全新存檔與檢查
t('全新存檔：蛋、50 金幣、3 食物、2 種子', () => { const s = C.fresh(T0); assert.equal(s.stage, 'egg'); assert.equal(s.coins, 50); assert.equal(s.inv.food, 3); assert.equal(s.inv.seeds, 2); });
t('孵化後為嬰兒期並記錄日記與圖鑑', () => { const s = hatched(); assert.equal(s.stage, 'baby'); assert.equal(s.dex.length, 1); assert.ok(s.journal.length >= 1); });
t('存檔 JSON 往返不變（檢查是冪等的）', () => { const s = C.sanitize(hatched(), T0); const r = C.sanitize(JSON.parse(JSON.stringify(s)), T0); assert.deepStrictEqual(r, s); });

// 2. 行為扣費與加值，不會出現負數
t('餵食：先用庫存食物', () => { const s = hatched(); s.hunger = 50; const r = C.act(s, 'feed', T0); assert.ok(r.ok); assert.equal(s.inv.food, 2); assert.equal(s.coins, 50); assert.equal(s.hunger, 60); assert.equal(s.xp, 3); assert.equal(s.path.tide, 1); });
t('餵食：沒食物就花 10 金幣買蘋果', () => { const s = hatched(); s.hunger = 50; s.inv.food = 0; C.act(s, 'feed', T0); assert.equal(s.coins, 40); });
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
    const eff = Math.min(hrs, 12); assert.equal(Math.round(s.hunger * 100) / 100, hrs >= 20 ? 0 : 80 - 4 * eff); assert.equal(s.mood, 80 - 3 * eff); assert.equal(!!s.runaway, hrs >= 32);   // 飽食用真實時間：20 小時餓到 0、再 12 小時離家出走 assert.equal(s.energy, Math.min(100, 20 + 8 * eff));
    assert.equal(C.ageHours(s, now), hrs);
  });
}
t('睡眠時體力每小時 +25', () => { const s = hatched(); s.view = 'room'; s.energy = 10; C.act(s, 'sleep', T0); C.applyTime(s, T0 + 2 * H); assert.equal(s.energy, 60); });
t('時間倒退：不回溯、記錄警告', () => { const s = hatched(); s.hunger = 50; const r = C.applyTime(s, T0 - H); assert.equal(r.warn, 'back'); assert.equal(s.hunger, 50); assert.ok(s.clockWarn); assert.equal(s.lastTick, T0); });
t('大幅快轉：照上限處理並提示', () => { const s = hatched(); const r = C.applyTime(s, T0 + 40 * 24 * H); assert.equal(r.warn, 'jump'); assert.equal(r.eff, 12); });

// 5. 進化門檻邊界
t('幼年期：4h 與 100 XP 都要達到', () => {
  const s = hatched(); s.xp = 100; assert.equal(C.checkStages(s, T0 + 4 * H - 1).length, 0);
  s.xp = 99; assert.equal(C.checkStages(s, T0 + 4 * H).length, 0); s.xp = 100; assert.equal(C.checkStages(s, T0 + 4 * H)[0].to, 'juvenile');
});
t('少年期：12h 與 300 XP 都要達到', () => {
  const s = hatched(); s.xp = 300; assert.equal(C.checkStages(s, T0 + 12 * H - 1).map(x => x.to).join(), 'juvenile');
  s.xp = 299; assert.equal(C.checkStages(s, T0 + 12 * H).length, 0); s.xp = 300; assert.equal(C.checkStages(s, T0 + 12 * H)[0].to, 'adolescent');
});
t('成年期：48h 與 800 XP 邊界', () => { const s = hatched(); s.xp = 799; assert.equal(C.checkStages(s, T0 + 48 * H).map(x => x.to).join(), 'juvenile,adolescent'); s.xp = 800; assert.equal(C.checkStages(s, T0 + 48 * H)[0].to, 'adult'); });
t('一次跨越多個門檻時依序記錄', () => { const s = hatched(); s.xp = 5000; const tr = C.checkStages(s, T0 + 500 * H); assert.deepEqual(tr.map(x => x.to), ['juvenile', 'adolescent', 'adult']); assert.ok(s.journal.length >= 3); });

// 6. 三種路線與平手處理可重現
t('路線：點數最高者勝', () => { const s = hatched(); s.path = { flame: 1, tide: 2, forest: 9 }; assert.equal(C.pickRoute(s), 'forest'); s.path = { flame: 9, tide: 2, forest: 1 }; assert.equal(C.pickRoute(s), 'flame'); });
t('路線平手：先比特殊事件，再依 tide > forest > flame', () => {
  const s = hatched(); s.path = { flame: 5, tide: 5, forest: 5 }; assert.equal(C.pickRoute(s), 'tide');
  s.events.volcano = true; assert.equal(C.pickRoute(s), 'flame'); s.events.volcano = false; s.path.tide = 4; assert.equal(C.pickRoute(s), 'forest');
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
t('冒險：不限次數，每次都是全額獎勵', () => {
  const s = hatched(); C.claimDaily(s, T0); const res = [];
  for (let i = 0; i < 7; i++) { s.energy = 100; const st = C.startAdventure(s, 1, T0); res.push(C.finishAdventure(s, 1, 'win', st.full, T0, () => .99)); }
  assert.equal(res[4].coins, 30); assert.equal(res[4].seeds, 1); assert.equal(res[6].coins, 30); assert.ok(res[6].xp > 5);
});
t('冒險：體力不足不能出發；失敗只給 XP +3', () => { const s = hatched(); s.energy = 19; assert.ok(!C.startAdventure(s, 1, T0).ok); s.energy = 50; C.startAdventure(s, 1, T0); const xp0 = s.xp; const r = C.finishAdventure(s, 1, 'loss', true, T0); assert.equal(s.xp - xp0, 3); assert.equal(r.coins, 0); assert.equal(s.energy, 30); });
t('首次打通新關卡＝探索發現（森林 +2、XP +10）；第 15 關觸發火山遺跡', () => {
  const s = hatched(); s.adv.stage = 15; C.claimDaily(s, T0); s.energy = 100; const st = C.startAdventure(s, 15, T0);
  const r = C.finishAdventure(s, 15, 'win', st.full, T0, () => .99); assert.ok(r.events.includes('volcano')); assert.ok(s.events.volcano); assert.equal(s.path.forest, 4); assert.equal(s.adv.stage, 16);
});
t('親密度 80：戰鬥中撐住一次', () => { const a = C.mkFighter('a', 'k', 10, 'flame', 0, 80, 0), d = C.mkFighter('b', 'k', 1, 'tide', 0, 80, 80); d.hp = 5; const r = C.damage(a, d, true, () => .5); assert.ok(r.endured); assert.equal(d.hp, 1); });
t('屬性相剋：火剋森 1.4 倍（V1.42）', () => { const a = C.mkFighter('a', 'k', 5, 'flame', 0, 80, 0), d = C.mkFighter('b', 'k', 5, 'forest', 0, 80, 0); assert.equal(C.damage(a, d, true, () => .5).mult, 1.4); });

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
  const s = hatched(); assert.ok(C.plant(s, 0, T0, () => 0).ok); assert.equal(s.inv.seeds, 1); assert.ok(!C.plant(s, 0, T0).ok);
  assert.ok(!C.harvest(s, 0, T0 + 2 * H - 1).ok); const r = C.harvest(s, 0, T0 + 2 * H, () => .99); assert.ok(r.ok);
  assert.equal(s.inv.cranberry, 3); assert.equal(s.inv.fresh.cranberry, 3); assert.equal(s.xp, 5); assert.equal(s.path.forest, 3); assert.equal(s.harvests, 1); assert.ok(C.plotState(s, 0, T0).empty);
});
t('種植：沒種子不能種；每格只能一株；金幣買種子', () => { const s = hatched(); s.inv.seeds = 0; assert.equal(C.plant(s, 1, T0).code, 'noseed'); assert.ok(C.buySeed(s).ok); assert.equal(s.coins, 45); assert.ok(C.plant(s, 1, T0).ok); assert.ok(!C.plant(s, 9, T0).ok); });
t('種植：時間倒退不會變成負進度', () => { const s = hatched(); C.plant(s, 0, T0); const q = C.plotState(s, 0, T0 - H); assert.equal(q.progress, 0); assert.ok(!q.ripe); });
t('種植：存檔往返保留田地', () => { const s = hatched(); C.plant(s, 2, T0); const r = C.sanitize(JSON.parse(JSON.stringify(s)), T0); assert.equal(r.plots[2].at, T0); assert.equal(r.plots.length, 3); });
// 每日小目標
t('每日目標：每天 3 個、同一天固定、隔天換新', () => {
  const s = hatched(); C.ensureGoals(s, T0); const a = s.goals.list.map(g => g.id).join(); assert.equal(s.goals.list.length, 3);
  assert.equal(new Set(s.goals.list.map(g => g.id)).size, 3); C.ensureGoals(s, T0 + H); assert.equal(s.goals.list.map(g => g.id).join(), a);
  assert.deepEqual(C.goalsFor(C.dayKey(T0)), C.goalsFor(C.dayKey(T0)));
  C.ensureGoals(s, T0 + 86400000); assert.notEqual(s.goals.date, C.dayKey(T0));
});
t('每日目標：★／★★／★★★ 由易到難；完成才能領、只能領一次、時間倒退不重置', () => {
  const s = hatched(); C.ensureGoals(s, T0); assert.deepEqual(s.goals.list.map(g => g.tier), [0, 1, 2]);
  s.goals.list = [{ id: 'feed', tier: 0, need: 1, n: 0, claimed: false }, { id: 'steps', tier: 1, need: 4000, n: 0, claimed: false }, { id: 'plant', tier: 2, need: 4, n: 0, claimed: false }];
  assert.ok(!C.claimGoal(s, 0, T0).ok); s.hunger = 10; C.act(s, 'feed', T0); assert.equal(s.goals.list[0].n, 1);
  let c = s.coins; assert.ok(C.claimGoal(s, 0, T0).ok); assert.equal(s.coins, c + 15); assert.ok(!C.claimGoal(s, 0, T0).ok);
  C.creditSteps(s, 6500, null, T0); assert.equal(s.goals.list[1].n, 4000); c = s.coins; const sd = s.inv.seeds; C.claimGoal(s, 1, T0); assert.equal(s.coins, c + 30); assert.equal(s.inv.seeds, sd + 1);
  s.inv.seeds = 9; for (let i = 0; i < 4; i++) C.plant(s, i % 3, T0 + i * 3 * H, () => 0) || C.harvest(s, i % 3, T0 + i * 3 * H); s.goals.list[2].n = 4; c = s.coins; const r = C.claimGoal(s, 2, T0, () => .9); assert.ok(r.ok && r.up); assert.equal(s.coins, c + 50); assert.equal(s.goalLv, 1);
  C.ensureGoals(s, T0 - 3 * 86400000); assert.equal(s.goals.date, C.dayKey(T0));
});
t('任務等級越高：數量越多、獎勵越好', () => { assert.equal(C.goalNeed('steps', 0, 0), 2000); assert.equal(C.goalNeed('steps', 2, 0), 6000); assert.equal(C.goalNeed('steps', 2, 5), 8000); assert.equal(C.goalNeed('steps', 1, 5), 8000); assert.ok(C.goalNeed('feed', 2, 5) > C.goalNeed('feed', 2, 0)); assert.equal(C.goalReward(2, 0).coins, 50); assert.equal(C.goalReward(2, 5).coins, 100); assert.equal(C.goalReward(1, 5).seeds, 2);
  const s = hatched(); s.goalLv = 4; s.goals.date = ''; C.ensureGoals(s, T0); assert.ok(s.goals.list[2].need >= C.goalNeed(s.goals.list[2].id, 2, 0)); });

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
  const s = hatched(); s.coins = 250; C.buyItem(s, 'candy'); assert.equal(s.coins, 50); assert.equal(s.inv.candy, 1); s.mood = 50; s.hunger = 50;
  const r = C.useCandy(s, T0); assert.ok(r.ok); assert.equal(s.mood, 70); assert.equal(s.hunger, 60); assert.equal(s.xp, 8); assert.ok(!C.useCandy(s, T0).ok);
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
t('多種食物：魚是水系愛吃的（心情 +10、經驗 +5），體力 +20，吃完留下魚骨', () => { const s = hatched(); s.route = 'tide'; s.hunger = 30; s.mood = 50; s.energy = 50; s.inv.fish = 1; const r = C.act(s, 'feed', T0, 'fish'); assert.ok(r.ok && r.fav); assert.equal(r.left, 'bone'); assert.equal(s.inv.fish, 0); assert.equal(s.hunger, 50); assert.equal(s.mood, 60); assert.equal(s.energy, 70); assert.equal(s.xp, 10); });
t('火系不愛吃魚、愛吃肉排；蛋糕大家都愛', () => { const s = hatched(); s.route = 'flame'; s.hunger = 10; s.coins = 999; assert.ok(!C.act(s, 'feed', T0, 'fish').fav); assert.ok(C.act(s, 'feed', T0, 'meat').fav); assert.ok(C.act(s, 'feed', T0, 'cake').fav); });
t('只有自己種的水果能賣 15 元；田可以花 30／60／90 擴建到 6 格', () => { const s = hatched(); s.coins = 0; assert.ok(!C.sellFruit(s, 'food').ok); C.plant(s, 0, T0, () => 0); C.harvest(s, 0, T0 + 2 * H, () => 0); assert.ok(C.sellFruit(s, 'cranberry').ok); assert.ok(C.sellFruit(s, 'cranberry').ok); assert.equal(s.coins, 30); assert.ok(!C.sellFruit(s, 'cranberry').ok); s.coins = 180; for (const p of [30, 60, 90]) { assert.equal(C.expandPrice(s), p); assert.ok(C.expandFarm(s).ok); } assert.equal(s.plots.length, 6); assert.equal(s.coins, 0); assert.ok(!C.expandFarm(s).ok); const r = C.sanitize(JSON.parse(JSON.stringify(s)), T0); assert.equal(r.plots.length, 6); });
t('打贏 Boss 有機會得到經驗火種：心情 +10、體力 +20、經驗 +20', () => { const s = hatched(); s.energy = 100; s.adv.stage = 99; const n = [...Array(40).keys()].find(i => i > 0 && C.foeFor(i).boss); const st = C.startAdventure(s, n, T0); const o = C.finishAdventure(s, n, 'win', st.full, T0, () => 0); assert.equal(o.ember, 1); s.mood = 50; s.energy = 50; const x = s.xp; assert.ok(C.useEmber(s, T0).ok); assert.equal(s.mood, 60); assert.equal(s.energy, 70); assert.equal(s.xp, x + 20); });
t('食物沒有就用金幣買；商店可以買各種食物', () => { const s = hatched(); s.coins = 30; s.hunger = 10; s.inv.meat = 0; assert.ok(C.act(s, 'feed', T0, 'meat').ok); assert.equal(s.coins, 10); assert.ok(C.buyItem(s, 'berry').ok); assert.equal(s.inv.berry, 1); });
t('冒險會變餓變髒；輸了心情下降', () => { const s = hatched(); s.energy = 100; s.hunger = 80; s.clean = 80; s.mood = 60; C.startAdventure(s, 1, T0); assert.equal(s.hunger, 65); assert.equal(s.clean, 60); C.finishAdventure(s, 1, 'loss', true, T0); assert.equal(s.mood, 48); });
t('沒照顧好親密度會掉；心情低時摸摸不加親密度', () => { const s = hatched(); s.bond = 30; s.hunger = 10; C.applyTime(s, T0 + 2 * H); assert.ok(s.bond < 30); s.hunger = 90; s.clean = 90; s.mood = 30; C.applyTime(s, T0 + 3 * H); const b = s.bond; C.pet(s, T0 + 3 * H); assert.equal(s.bond, b); });
t('野生怪會跟著玩家等級變強', () => { assert.equal(C.foeFor(1, 20).level, 18); assert.equal(C.foeFor(1, 1).level, 1); assert.equal(C.foeFor(12, 20).level, 19); assert.equal(C.foeFor(21, 5).level, 17); assert.equal(C.foeFor(41, 5).level, 29); });
t('猜拳：贏＝0 倍（躲開）、平手 0.8、輸 1.2、沒選算輸', () => { assert.deepEqual(C.rps('rock', 'scissors'), { result: 'win', mult: 0 }); assert.deepEqual(C.rps('paper', 'paper'), { result: 'tie', mult: .8 }); assert.deepEqual(C.rps('scissors', 'rock'), { result: 'lose', mult: 1.2 }); assert.equal(C.rps(null, 'rock').mult, 1.2); });
// V1.22：屬性特性與弱點、水費、球會爆
t('洗澡要付水費 3 金幣；土系 5 金幣而且洗不太乾淨', () => { const s = hatched(); s.clean = 40; s.coins = 10; C.act(s, 'wash', T0); assert.equal(s.coins, 7); assert.equal(s.clean, 75);
  const e = hatched(); e.route = 'earth'; e.clean = 40; e.coins = 10; C.act(e, 'wash', T0); assert.equal(e.coins, 5); assert.equal(e.clean, 68); e.coins = 2; e.care.bathLastAt = 0; e.clean = 10; assert.equal(C.act(e, 'wash', T0 + 2 * H).code, 'nocoin'); });
t('球每玩 3 次就爆掉，下次玩要付 3 金幣買新球；沒錢就不能玩', () => { const s = hatched(); s.coins = 3; for (let i = 0; i < 3; i++) { s.energy = 100; const r = C.act(s, 'play', T0); assert.equal(!!r.popped, i === 2); } assert.ok(s.ballBroken);
  s.energy = 100; const r = C.act(s, 'play', T0); assert.ok(r.ok); assert.equal(r.bought, 3); assert.equal(s.coins, 0); assert.ok(!s.ballBroken);
  s.ballBroken = true; assert.ok(C.canAct(s, 'play', T0)); assert.equal(C.act(s, 'play', T0).code, 'noball'); });
t('火系攻擊高、心情掉得快；水系防禦高、容易餓', () => { const f = C.mkFighter('a', 'k', 5, 'flame', 0, 80, 0), n = C.mkFighter('a', 'k', 5, 'earth', 0, 80, 0), w = C.mkFighter('a', 'k', 5, 'tide', 0, 80, 0); assert.ok(f.atk > n.atk * 1.1); assert.ok(w.def > n.def * 1.1);
  const s = hatched(); s.route = 'flame'; s.mood = 80; C.applyTime(s, T0 + H); assert.equal(s.mood, 75.5); const t2 = hatched(); t2.route = 'tide'; t2.hunger = 80; C.applyTime(t2, T0 + H); assert.equal(t2.hunger, 74); });
t('森系體力恢復快但容易髒；鳥系、電系體力恢復慢', () => { const e = r => { const s = hatched(); s.route = r; s.energy = 20; s.clean = 80; C.applyTime(s, T0 + H); return s; }; assert.equal(e('forest').energy, 30.4); assert.equal(e('forest').clean, 77); assert.equal(e('bird').energy, 25.6); assert.equal(e('elec').energy, 26.4); });
t('鳥系食量小：同樣食物飽比較多', () => { const s = hatched(); s.route = 'bird'; s.hunger = 50; s.inv.food = 1; C.act(s, 'feed', T0); assert.equal(s.hunger, 63); });
t('金系經驗只吸收 7 成，戰鬥常拿 1.5 倍金幣；土系撿莓果、鳥系撿種子', () => { const s = hatched(); s.route = 'metal'; s.energy = 100; let st = C.startAdventure(s, 1, T0); let o = C.finishAdventure(s, 1, 'win', st.full, T0, () => 0); assert.equal(o.coins, 30); assert.ok(o.coinBonus); assert.equal(o.xp, Math.round(25 * .7));
  const e = hatched(); e.route = 'earth'; e.energy = 100; st = C.startAdventure(e, 1, T0); o = C.finishAdventure(e, 1, 'win', st.full, T0, () => 0); assert.equal(o.berry, 1);
  const b = hatched(); b.route = 'bird'; b.energy = 100; st = C.startAdventure(b, 1, T0); o = C.finishAdventure(b, 1, 'win', st.full, T0, () => 0); assert.equal(o.bonusSeed, 1); assert.equal(b.inv.seeds, 4); });
t('電系攻擊有機會麻痺對手', () => { assert.equal(C.mkFighter('a', 'k', 5, 'elec', 0, 80, 0).stunChance, .25); assert.equal(C.mkFighter('a', 'k', 5, 'flame', 0, 80, 0).stunChance, 0); });
t('羈絆之力要花 10 金幣，之後 2 小時不能冒險', () => { const s = hatched(); s.coins = 9; assert.ok(C.canBond(s)); assert.equal(C.battleBond(s, T0), false); s.coins = 10; assert.equal(C.battleBond(s, T0), true); assert.equal(s.coins, 0); s.energy = 100; assert.ok(C.canAdventure(s, 1, T0 + H)); assert.equal(C.canAdventure(s, 1, T0 + 2 * H), null); });
t('自己種的水果吃了體力再 +5（先吃買來的）', () => { const s = hatched(); s.hunger = 10; s.energy = 50; s.inv.food = 2; s.inv.fresh = { food: 1, berry: 0 }; let r = C.act(s, 'feed', T0); assert.ok(!r.fresh); assert.equal(s.energy, 55); r = C.act(s, 'feed', T0); assert.ok(r.fresh); assert.equal(s.energy, 65); });
t('種植：長出蔓越莓／藍莓／草莓；成熟 6 小時內是好品質，過熟沒加成，放 24 小時會爛掉', () => {
  const s = hatched(); s.inv.seeds = 9; C.plant(s, 0, T0, () => .7); assert.equal(C.plotState(s, 0, T0).kind, 'blueberry');
  let r = C.harvest(s, 0, T0 + 2 * H + 5 * H, () => 0); assert.equal(r.kind, 'blueberry'); assert.equal(r.n, 2); assert.equal(s.inv.fresh.blueberry, 2);
  C.plant(s, 1, T0, () => 0); r = C.harvest(s, 1, T0 + 2 * H + 7 * H, () => 0); assert.ok(r.over); assert.equal(s.inv.cranberry, 2); assert.equal(s.inv.fresh.cranberry, 0);
  C.plant(s, 2, T0, () => 0); assert.ok(C.plotState(s, 2, T0 + 27 * H).rotten); r = C.harvest(s, 2, T0 + 27 * H); assert.ok(r.rotten); assert.equal(s.inv.cranberry, 2); assert.ok(C.plotState(s, 2, T0 + 27 * H).empty); });
t('能力水果：給對的屬性吃，體力 +10、經驗 +15 額外加成', () => { const s = hatched(); s.route = 'elec'; s.hunger = 10; s.energy = 20; s.coins = 99; const r = C.act(s, 'feed', T0, 'banana'); assert.ok(r.ok && r.fav && r.power); assert.equal(s.energy, 40); assert.equal(s.xp, 25); const w = hatched(); w.route = 'tide'; w.hunger = 10; w.coins = 99; assert.ok(!C.act(w, 'feed', T0, 'banana').power); });
t('太久沒餵：餓到 0 再過 12 小時就離家出走；走 1 萬步找回來', () => { const s = hatched(); s.hunger = 40; C.applyTime(s, T0 + 9 * H); assert.equal(s.hunger, 4); assert.equal(s.runaway, null);
  C.applyTime(s, T0 + 10 * H + 11 * H); assert.equal(s.hunger, 0); assert.equal(s.runaway, null); const r = C.applyTime(s, T0 + 10 * H + 12 * H); assert.ok(s.runaway); assert.ok(r.events.includes('runaway'));
  assert.equal(C.act(s, 'feed', T0 + 23 * H).code, 'runaway'); assert.ok(C.canAdventure(s, 1, T0 + 23 * H)); s.bond = 50;
  C.creditSteps(s, 6000, C.dayKey(T0 + 23 * H), T0 + 23 * H); assert.ok(s.runaway); const o = C.creditSteps(s, 10000, C.dayKey(T0 + 23 * H), T0 + 23 * H); assert.ok(o.found); assert.equal(s.runaway, null); assert.equal(s.hunger, 40); assert.equal(s.bond, 35); });
t('離開很久（超過 12 小時上限）也會真的餓到離家出走', () => { const s = hatched(); s.hunger = 60; C.applyTime(s, T0 + 30 * H); assert.ok(s.runaway); const k = hatched(); k.hunger = 60; C.applyTime(k, T0 + 20 * H); assert.equal(k.runaway, null); assert.equal(k.hunger, 0); });
t('餓到 0 之後餵食，飽食會正常回升，倒數取消', () => { const s = hatched(); s.hunger = 8; C.applyTime(s, T0 + 3 * H); assert.equal(s.hunger, 0); assert.ok(s.starveSince); s.inv.food = 3; C.act(s, 'feed', T0 + 3 * H); assert.equal(s.hunger, 10); C.applyTime(s, T0 + 3 * H + 60000); assert.ok(s.hunger > 9); assert.equal(s.starveSince, 0); });
// 頂球
t('頂球：結算套用玩耍規則、記錄最佳分數', () => { const s = hatched(); s.energy = 50; s.mood = 40; const r = C.finishBallGame(s, 2, T0); assert.ok(r.ok); assert.equal(s.mood, 55); assert.equal(s.ball.best, 2); assert.equal(s.ball.goals, 2); C.finishBallGame(s, 1, T0); assert.equal(s.ball.best, 2); s.energy = 5; assert.ok(!C.finishBallGame(s, 3, T0).ok); assert.equal(s.ball.best, 2); });
t('頂球：連續模式，每 3 球 1 金幣、路線最多算 5 球', () => { const s = hatched(); s.energy = 80; const c0 = s.coins; const r = C.finishBallGame(s, 12, T0); assert.ok(r.ok); assert.equal(r.coins, 4); assert.equal(s.coins, c0 + 4); assert.equal(s.ball.best, 12); assert.equal(s.ball.goals, 5); assert.equal(s.path.bird, 10); });
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
t('藥水：開局 1 瓶、商店 40 金幣；超級藥水 100', () => { const s = hatched(); assert.equal(s.inv.potion, 1); C.buyItem(s, 'potion'); assert.equal(s.inv.potion, 2); assert.equal(s.coins, 10); s.coins = 100; assert.ok(C.buyItem(s, 'potion2').ok); assert.equal(s.inv.potion2, 1); assert.equal(s.coins, 0); });
t('V1.41 雞湯 99 金幣：飽食 +10、心情 +20、體力 +20，消除羈絆之力的休息', () => { const s = hatched(); s.coins = 200; assert.ok(C.buyItem(s, 'soup').ok); assert.equal(s.coins, 101); s.hunger = 50; s.mood = 50; s.energy = 50; s.bondRestUntil = T0 + 3600000; assert.ok(C.canAdventure(s, 1, T0)); const r = C.useSoup(s, T0); assert.ok(r.ok && r.rest); assert.equal(s.inv.soup, 0); assert.equal(C.canAdventure(s, 1, T0), null); assert.equal(Math.round(s.hunger), 60); assert.equal(Math.round(s.mood), 70); assert.equal(Math.round(s.energy), 70); C.buyItem(s, 'soup'); assert.ok(C.useSoup(s, T0).ok); });
t('V1.41 綜合種子：蔓越莓／藍莓／草莓，賣 15／20／30；優良種子收成 3～4 顆、比較容易長草莓', () => { const s = hatched(); s.coins = 13; assert.ok(C.buyItem(s, 'seeds2').ok); assert.ok(C.buyItem(s, 'seeds').ok); assert.equal(s.coins, 0);
  assert.equal(C.pickFruit(false, () => 0.1), 'cranberry'); assert.equal(C.pickFruit(false, () => 0.7), 'blueberry'); assert.equal(C.pickFruit(false, () => 0.95), 'strawberry'); assert.equal(C.pickFruit(true, () => 0.75), 'strawberry');
  assert.ok(C.plant(s, 0, T0, () => 0.95, true).ok); assert.equal(s.inv.seeds2, 0); const r = C.harvest(s, 0, T0 + 2.5 * 3600000, () => 0.99); assert.ok(r.ok && r.n === 4 && r.good && r.kind === 'strawberry'); assert.equal(s.inv.fresh.strawberry, 4);
  assert.ok(C.sellFruit(s, 'strawberry').ok); assert.equal(s.coins, 30); assert.ok(!C.plant(s, 1, T0, Math.random, true).ok);
  const t2 = C.sanitize(JSON.parse(JSON.stringify(s)), T0); assert.equal(t2.inv.fresh.strawberry, 3); });
t('V1.40 第一天不送金幣（開局 50）', () => { const s = C.fresh(T0); C.claimDaily(s, T0); assert.equal(s.coins, 50); C.claimDaily(s, T0 + 86400000); assert.equal(s.coins, 60); });
t('V1.42 能力加成：進化階段、訓練成果（每次 +1%，最多 +20%）、大王固定等級、打贏王給金幣', () => { const s = hatched(); s.stage = 'adult'; s.trainLog = { dodge: 5, attack: 30, defense: 10 };
  const base = C.mkFighter('a', 'k', 10, s.route, 0, 80, 0), f = C.buffFighter(C.mkFighter('a', 'k', 10, s.route, 0, 80, 0), s);
  assert.ok(Math.abs(f.atk / base.atk - 1.1 * 1.2) < 1e-9); assert.ok(Math.abs(f.def / base.def - 1.1 * 1.1) < 1e-9); assert.equal(f.max, Math.round(base.max * 1.1 * 1.1)); assert.equal(f.dodge, .05);
  s.stage = 'ascended'; s.awake = true; const g = C.buffFighter(C.mkFighter('a', 'k', 10, s.route, 0, 80, 0), s); assert.ok(Math.abs(g.atk / base.atk - 1.2 * 1.2 * 1.2) < 1e-9);
  assert.equal(C.foeFor(30, 1).level, C.foeFor(30, 60).level); assert.equal(C.foeFor(30, 1).level, 26); assert.equal(C.foeFor(15, 40).level, 15); assert.ok(C.foeFor(12, 30).level === 29);
  const t = hatched(); t.energy = 100; t.adv.stage = 99; const st = C.startAdventure(t, 10, T0); const c0 = t.coins; const o = C.finishAdventure(t, 10, 'win', st.full, T0, () => .99); assert.equal(o.bossCoins, 30); assert.ok(t.coins - c0 >= 30 + 20);
  const p = C.snapshotPet(s); assert.equal(p.trainLog.attack, 30); });
t('V1.41 訓練場：每次 20 金幣，達成目標才有經驗', () => { const s = hatched(); s.energy = 100; s.coins = 30; s.xp = 512; const L = C.level(512);
  assert.ok(C.startTrain(s, 'dodge', T0).ok); assert.equal(s.coins, 10); assert.equal(s.energy, 85); const f = C.finishTrain(s, 'dodge', false); assert.equal(f.xp, 0); assert.equal(s.xp, 512);
  assert.ok(!C.startTrain(s, 'zen', T0).ok); s.coins = 20; assert.ok(C.startTrain(s, 'zen', T0).ok); const w = C.finishTrain(s, 'zen', true, T0); assert.equal(w.xp, Math.round(10 + 4 * L)); assert.equal(s.trainLog.defense, 1);
  s.coins = 99; s.energy = 10; assert.ok(!C.startTrain(s, 'rush', T0).ok); s.energy = 100; s.bondRestUntil = T0 + 9e6; assert.ok(C.startTrain(s, 'flash', T0).ok); assert.ok(!C.startTrain(s, 'nope', T0).ok); });
t('蓄力：下一擊 2 倍，用完就消失', () => { const a = C.mkFighter('a', 'k', 5, 'flame', 0, 80, 0), d = C.mkFighter('b', 'k', 5, 'flame', 0, 80, 0); const n = C.expectDamage(a, d, false); a.charged = true; assert.ok(Math.abs(C.expectDamage(a, d, false) - n * 2) <= 1); C.damage(a, d, false, () => .5); assert.ok(!a.charged); });
t('羈絆之力：2 秒連打，20／22／25／28 下＝2.2／2.5／2.7／3 倍', () => { assert.equal(C.bondBoost(0), 1); assert.equal(C.bondBoost(10), 1.6); assert.equal(C.bondBoost(20), 2.2); assert.equal(C.bondBoost(22), 2.5); assert.equal(C.bondBoost(25), 2.7); assert.equal(C.bondBoost(28), 3); assert.equal(C.bondBoost(50), 3); const a = C.mkFighter('a', 'k', 5, 'flame', 0, 80, 0), d = C.mkFighter('b', 'k', 30, 'tide', 0, 80, 0); const r = C.damage(a, d, false, () => .5, 3); assert.ok(r.dmg >= C.expectDamage(a, d, false) * 2.5); });
t('預估傷害與實際平均一致（隨機 0.5、無會心）', () => { const a = C.mkFighter('a', 'k', 8, 'tide', 0, 80, 0), d = C.mkFighter('b', 'k', 8, 'flame', 0, 80, 0); const e = C.expectDamage(a, d, true); const r = C.damage(a, d, true, () => .5); assert.equal(r.dmg, e); });

// 七種屬性
t('相剋表：每個屬性都有剋與被剋，而且沒有互剋', () => {
  const els = ['fire', 'water', 'leaf', 'earth', 'bird', 'elec', 'metal'];
  for (const a of els) { assert.ok(C.BEATS[a].length >= 2); assert.ok(els.some(b => C.BEATS[b].includes(a)), a + ' 沒有被剋'); for (const b of C.BEATS[a]) assert.ok(!C.BEATS[b].includes(a), a + '/' + b + ' 互剋'); }
  const f = (r) => C.mkFighter('x', 'k', 5, r, 0, 80, 0);
  assert.equal(C.elemMult(f('elec'), f('tide'), true), 1.4); assert.equal(C.elemMult(f('elec'), f('earth'), true), .75); assert.equal(C.elemMult(f('bird'), f('forest'), true), 1.4); assert.equal(C.elemMult(f('metal'), f('bird'), true), 1.4); assert.equal(C.elemMult(f('flame'), f('metal'), true), 1.4);
});
t('新路線點數來源：步數→土、進球→鳥、蓄力與羈絆→電、洗澡與清理→金', () => {
  const s = hatched(); C.creditSteps(s, 4000, null, T0); assert.equal(s.path.earth, 2);
  s.energy = 50; C.finishBallGame(s, 2, T0); assert.equal(s.path.bird, 4);
  C.battleCharge(s); C.battleBond(s, T0); assert.equal(s.path.elec, 4); assert.equal(s.bondUses, 1);
  s.clean = 10; C.act(s, 'wash', T0); C.addCore(s, 50, T0); C.clearCore(s, 0, T0); assert.equal(s.path.metal, 2); assert.equal(s.cleanups, 1);
});
t('屬性在蛋裡就決定：孵化就有屬性，長到成年、高階都不會變', () => {
  for (let i = 0; i < 30; i++) { const s = C.fresh(T0); const el = C.genomeFromId(C.gidOf(s)).el; assert.ok(C.EL_LIST.includes(el)); C.hatch(s, T0); assert.equal(s.route, el);
    s.xp = 900; s.path.flame = 999; C.checkStages(s, T0 + 50 * H); assert.equal(s.stage, 'adult'); assert.equal(s.route, el); }
});
t('7 種屬性的蛋都會出現（分布大致平均）', () => { const c = {}; for (let i = 0; i < 7000; i++) { const el = C.makeGenome(i * 2654435761 >>> 0).el; c[el] = (c[el] || 0) + 1; } for (const el of C.EL_LIST) assert.ok(c[el] > 800 && c[el] < 1200, el + ':' + c[el]); });
t('加上屬性不會改變舊蛋的外觀', () => { const G = C.makeGenome(12345); assert.equal(G.hue, C.makeGenome(12345).hue); const { el, ...rest } = G; assert.ok(el); assert.ok(!('el' in rest)); });
t('配對：寶寶繼承爸媽其中一方的屬性（偶爾突變）', () => { const A = Object.assign(C.makeGenome(1), { el: 'elec' }), B = Object.assign(C.makeGenome(2), { el: 'metal' }); let same = 0; for (let i = 0; i < 400; i++) { const g = C.breedGenome(A, B); if (g.el === 'elec' || g.el === 'metal') same++; } assert.ok(same > 370); });
t('基因碼帶屬性；舊的 13 碼基因也能讀', () => { const G = Object.assign(C.makeGenome(9), { el: 'bird' }); assert.equal(C.decodeGenome(C.encodeGenome(G)).el, 'bird'); const old = C.encodeGenome(G).split('.').slice(0, 13).join('.'); assert.ok(C.EL_LIST.includes(C.decodeGenome(old).el)); });
t('舊存檔：已孵化沒屬性 → 有照顧點數用點數、沒有就用基因', () => { const a = C.sanitize({ v: 7, hatched: true, seed: 5, path: { metal: 9 } }, T0); assert.equal(a.route, 'metal'); const b = C.sanitize({ v: 7, hatched: true, seed: 5 }, T0); assert.equal(b.route, C.makeGenome(5).el); });
t('冒險區域：21~40 關分別以土、鳥、電、金為主；Boss 關觸發對應事件', () => {
  const count = (from, r) => { let c = 0; for (let n = from; n < from + 5; n++) if (C.foeFor(n).route === r) c++; return c; };
  assert.ok(count(21, 'earth') >= 2); assert.ok(count(26, 'bird') >= 2); assert.ok(count(31, 'elec') >= 2); assert.ok(count(36, 'metal') >= 2);
  const s = hatched(); s.adv.stage = 30; s.energy = 100; C.claimDaily(s, T0); const st = C.startAdventure(s, 30, T0); const r = C.finishAdventure(s, 30, 'win', st.full, T0, () => .99); assert.ok(r.events.includes('skypeak'));
});
t('兩隻一起：帶出來、換照顧、第二隻狀態減半、回小窩', () => { const s = hatched(); s.den.level = 2; s.roster.push(C.snapshotPet(Object.assign(hatched(), { name: '小火' }))); const r = C.bringOut(s, 0, T0); assert.ok(r.ok); assert.equal(s.pair.name, '小火'); assert.equal(s.roster.length, 0); assert.equal(C.petCount(s), 2);
  s.hunger = 80; s.pair.hunger = 80; s.lastTick = T0; C.applyTime(s, T0 + 4 * 3600e3); const dMain = 80 - s.hunger, dPair = 80 - s.pair.hunger; assert.ok(Math.abs(dPair - dMain / 2) < 0.6, dMain + ' ' + dPair);
  const nm = s.name; assert.ok(C.switchPair(s, T0 + 4 * 3600e3).ok); assert.equal(s.name, '小火'); assert.equal(s.pair.name, nm); assert.ok(C.sendIn(s, T0 + 4 * 3600e3).ok); assert.equal(s.pair, null); assert.equal(s.roster.length, 1); });
t('舊存檔：以前打過的屬性事件（水系除外）算通過試煉', () => { const r = C.sanitize({ v: 7, hatched: true, events: { volcano: true, moonspring: true, mine: true } }, T0); assert.ok(r.trials.flame); assert.ok(r.trials.metal); assert.ok(!r.trials.tide); });
t('存檔：pair、主人名字、性別、愛的小窩都會保留', () => { const s = hatched(); s.owner = '冠宏<b>'; s.pair = C.snapshotPet(Object.assign(hatched(), { name: '小火' })); s.loveNest = true; const r = C.sanitize(JSON.parse(JSON.stringify(s)), T0); assert.equal(r.owner, '冠宏b'); assert.equal(r.pair.name, '小火'); assert.ok(['m', 'f'].includes(r.sex)); assert.ok(['m', 'f'].includes(r.pair.sex)); assert.equal(r.loveNest, true); });
t('愛的小窩：要買、要成年、要一公一母，生出一顆蛋', () => { const s = hatched(); s.stage = 'adult'; s.sex = 'm'; s.mood = 80; s.coins = 500; const p = C.snapshotPet(Object.assign(hatched(), { name: '小花', stage: 'adult', sex: 'f' })); s.pair = p;
  assert.match(C.canLove(s, 'pair', T0), /愛的小窩/); assert.ok(C.buyLoveNest(s).ok); assert.equal(s.coins, 200); s.pair.sex = 'm'; assert.match(C.canLove(s, 'pair', T0), /一公一母/); s.pair.sex = 'f';
  s.pair.stage = 'teen'; assert.match(C.canLove(s, 'pair', T0), /成年/); s.pair.stage = 'adult'; s.lastTick = T0; const r = C.love(s, 'pair', T0); assert.ok(r.ok, r.msg); assert.equal(s.eggs.length, 1); assert.match(C.canLove(s, 'pair', T0 + 1000), /分鐘/); assert.equal(C.lovePartners(s).length, 1); });
t('存錢筒：等級越高存越快、最多 12 小時、心情低不存、可以領', () => { const s = hatched(); s.xp = 800; s.mood = 90; s.route = 'tide'; s.lastTick = T0; const r = C.piggyRate(s); assert.ok(Math.abs(r - (0.5 + 0.25 * C.level(800))) < 1e-9);
  C.applyTime(s, T0 + 2 * 3600e3); assert.ok(Math.abs(s.piggy - r * 2) < .01, s.piggy); C.applyTime(s, T0 + 40 * 3600e3); assert.ok(s.piggy <= C.piggyCap(s) + 1e-9);
  const c0 = s.coins, got = C.collectPiggy(s, T0 + 40 * 3600e3); assert.ok(got.ok); assert.equal(s.coins, c0 + got.n); assert.ok(s.piggy < 1);
  s.route = 'metal'; assert.ok(Math.abs(C.piggyRate(s) - r * 1.5) < 1e-9); s.xp = 1e6; assert.ok(Math.abs(C.piggyRate(s) - (0.5 + 0.25 * 30) * 1.5) < 1e-9);
  const q = C.sanitize(JSON.parse(JSON.stringify(s)), T0); assert.equal(typeof q.piggy, 'number'); s.mood = 10; s.piggy = 0; s.lastTick = T0; C.applyTime(s, T0 + 3600e3); assert.equal(s.piggy, 0); });
t('高階（V1.37）：168h、2000 XP、專屬任務（成年期才開始算）、3 個終極素材', () => {
  const s = hatched(); s.xp = 2000; s.route = 'flame'; s.adv.wins = 99; const tr = C.checkStages(s, T0 + 168 * H);
  assert.deepEqual(tr.map(x => x.to), ['juvenile', 'adolescent', 'adult']); assert.equal(s.ascBase.wins, 99);   // 成年前的勝場不算
  s.inv.mats.flame = 3; assert.equal(C.checkStages(s, T0 + 168 * H).length, 0); assert.equal(C.ascendInfo(s).task.have, 0);
  s.adv.wins = 128; assert.equal(C.checkStages(s, T0 + 168 * H).length, 0); s.adv.wins = 129; s.inv.mats.flame = 2; assert.equal(C.checkStages(s, T0 + 168 * H).length, 0);
  s.inv.mats.flame = 3; assert.equal(C.checkStages(s, T0 + 168 * H)[0].to, 'ascended'); assert.equal(s.inv.mats.flame, 0);
});
t('專屬任務七屬性：水洗澡 30、草收成 30、土 6 萬步或打贏 20 隻土屬性怪…', () => {
  const need = { flame: s => { s.adv.wins += 30; }, tide: s => { s.washes += 30; }, forest: s => { s.harvests += 30; }, earth: s => { s.earthWins += 20; }, bird: s => { s.ball.goals += 30; }, elec: s => { s.bondUses += 5; }, metal: s => { s.cleanups += 40; } };
  for (const r in need) { const s = hatched(); s.xp = 2000; s.route = r; s.inv.mats[r] = 3; C.checkStages(s, T0 + 200 * H); assert.equal(s.stage, 'adult', r); need[r](s); C.checkStages(s, T0 + 200 * H); assert.equal(s.stage, 'ascended', r); }
  const e = hatched(); e.xp = 2000; e.route = 'earth'; e.inv.mats.earth = 3; C.checkStages(e, T0 + 200 * H); e.steps.total += 60000; C.checkStages(e, T0 + 200 * H); assert.equal(e.stage, 'ascended');
  const w = hatched(); w.route = 'tide'; w.stage = 'adult'; C.checkStages(w, T0); w.clean = 10; w.coins = 99; assert.ok(C.act(w, 'wash', T0).ok); assert.equal(C.ascendInfo(w).task.have, 1);
});
t('5 關小王、10 關大王；第 10／20／30 關大王各掉一次自己屬性的終極素材', () => {
  assert.ok(C.foeFor(5).boss && !C.foeFor(5).big); assert.ok(C.foeFor(10).big); assert.ok(C.foeFor(10, 1).level > C.foeFor(5, 1).level + 2);
  const b = hatched(); b.route = 'tide'; b.adv.stage = 40; const win = n => { b.energy = 100; const st = C.startAdventure(b, n, T0); return C.finishAdventure(b, n, 'win', st.full, T0, () => .99); };
  assert.equal(win(15).mat, undefined); assert.equal(win(10).mat, 'tide'); assert.equal(win(10).mat, undefined); assert.equal(win(20).mat, 'tide'); assert.equal(win(30).matN, 3); assert.equal(b.inv.mats.tide, 3);
  b.route = 'flame'; assert.equal(win(10).mat, 'flame');   // 換一隻別的屬性，可以再拿
  const r = C.sanitize(JSON.parse(JSON.stringify(b)), T0); assert.deepEqual(r.matGot.tide, [10, 20, 30]);
});
t('第 40 關大王：星辰之心＋碎片；碎片可以抵終極素材；星辰之心讓高階星耀覺醒', () => {
  const b = hatched(); b.route = 'bird'; b.adv.stage = 41; const win = (n, rr = () => .99) => { b.energy = 100; const st = C.startAdventure(b, n, T0); return C.finishAdventure(b, n, 'win', st.full, T0, rr); };
  const o = win(40); assert.equal(o.heart, 1); assert.equal(o.shard, 1); assert.equal(b.inv.hearts, 1); assert.equal(b.inv.shards, 1);
  assert.equal(win(40).shard, undefined); assert.equal(win(40, () => .1).shard, 1); assert.equal(b.inv.shards, 2); assert.equal(b.inv.hearts, 1);
  const s = hatched(); s.xp = 2000; s.route = 'bird'; C.checkStages(s, T0 + 200 * H); s.ball.goals += 30; s.inv.mats.bird = 2; s.inv.shards = 1; C.checkStages(s, T0 + 200 * H);
  assert.equal(s.stage, 'ascended'); assert.equal(s.inv.mats.bird, 0); assert.equal(s.inv.shards, 0);
  assert.match(C.canAwaken(s), /星辰之心/); s.inv.hearts = 1; const r0 = C.piggyRate(s); assert.ok(C.awaken(s, T0).ok); assert.ok(s.awake); assert.equal(s.inv.hearts, 0); assert.ok(Math.abs(C.piggyRate(s) - r0 * 1.5) < 1e-9);
  assert.ok(C.sanitize(JSON.parse(JSON.stringify(s)), T0).awake);
});
t('新蛋不重複：優先給還沒玩過的屬性', () => { const s = hatched(); s.route = 'flame'; s.dex = [{ id: 'g:1', route: 'tide' }, { id: 'g:2', route: 'bird' }];
  const u = C.unplayedRoutes(s); assert.ok(!u.includes('flame') && !u.includes('tide') && !u.includes('bird')); assert.equal(u.length, 4);
  s.dex = C.EL_LIST.map((e, i) => ({ id: 'g:' + i, route: e })); assert.equal(C.unplayedRoutes(s).length, 7); assert.equal(C.genomeOfSeed(C.seedForEl('metal')).el, 'metal'); });
t('星星糖 200 金幣，吃了直接升 1 級', () => { const s = hatched(); s.coins = 500; s.xp = 50; const L = C.level(50); assert.ok(C.buyItem(s, 'candy').ok); assert.equal(s.coins, 300);
  const r = C.useCandy(s, T0); assert.ok(r.ok); assert.equal(C.level(s.xp), L + 1); assert.equal(s.xp, 8 * L * L); });
t('第二張床：已擁有的床可以擺在右邊，存檔保留；買彈力球會換掉爆掉的球', () => { const s = hatched(); assert.ok(C.placeBed2(s, 'bed_round').ok); assert.equal(s.decor.placed.bed2, 'bed_round');
  assert.ok(!C.placeBed2(s, 'bed_cloud').ok); assert.equal(C.sanitize(JSON.parse(JSON.stringify(s)), T0).decor.placed.bed2, 'bed_round'); assert.ok(C.placeBed2(s, 'bed_round').ok); assert.equal(s.decor.placed.bed2, undefined);
  s.ballBroken = true; s.coins = 99; assert.ok(C.buyDecor(s, 'toy_ball').ok); assert.equal(s.ballBroken, false); });
t('舊存檔沒有新路線欄位也能正常讀取', () => { const r = C.sanitize({ v: 7, hatched: true, path: { flame: 3, tide: 2, forest: 1 } }, T0); assert.equal(r.path.earth, 0); assert.equal(r.path.metal, 0); assert.equal(r.events.mine, false); });

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
