# GDD V2.1 對照與詮釋說明

## 資料欄位對照
| GDD | 程式（game-core.js） |
|---|---|
| schemaVersion | `v`（目前 6） |
| petId | `gidOf(state)`：`g:種子`／`x:基因碼`／`classic` |
| lastUpdatedAt | `lastTick` |
| stats.happiness／hygiene | `mood`／`clean` |
| stats.bond | `bond` |
| pathPoints.flame/tide/forest | `path.flame/tide/forest` |
| inventory.basicFood／seeds | `inv.food`／`inv.seeds` |
| care.petLastRewardAt／bathLastAt | `care.petLastRewardAt`／`care.bathLastAt` |
| settings.sound／reducedMotion | `settings.sound`／`settings.reducedMotion` |

## GDD 沒寫清楚、由我決定的地方（都可在 CONFIG 調整）
1. **採集條件**：GDD 寫「金幣與食物都為 0」。實作改為「食物 0 且金幣少於 5（買不起）」，因為金幣 1～4 時其實也會卡關。
2. **短途冒險＝一場戰鬥**：「完成」指戰鬥勝利；失敗只給 XP +3；逃跑沒有獎勵。每日次數在出發時計算，避免中途逃跑重刷。
3. **玩耍 XP 限制**：每 30 分鐘最多 3 次有 XP（不論心情滿不滿）。
4. **月泉事件**：親密度 ≥ 60、台北時間 19:00–04:59 摸摸（有效收益）時發生一次。
5. **親密度解鎖**：20 撒嬌表情＋早安問候；50 每天一次小禮物（食物 +1）；80 戰鬥中撐住一次。
6. **等級**：GDD 只有累積 XP。等級 = 1 + ⌊√(XP÷8)⌋，只用於顯示與戰鬥強度。
7. **保留的追加功能**（GDD 沒有，但你要求過）：
   - 隨機物種外觀（成長時保留特色）
   - 步數：每 1,000 步 XP +10、每 2,000 步森 +1
   - 配對：要成年期以後
   - 關卡戰鬥
8. **種子購買**：GDD 沒寫種子的來源，加了「3 金幣買 1 顆」，另外冒險有 40% 掉落、每日目標也會送。
9. **每日目標**：9 種之中依台北日期固定抽 3 個；獎勵是 8 金幣、1 食物或 1 種子其中一種。
10. **家具**：GDD 只寫了「裝飾」，所以家具不影響數值，避免花錢變成變強。星星糖是商店限定的零食。
11. **果核**：GDD 沒有這個機制（是你追加的）。10 分鐘後發臭，每顆每小時心情 −4，最多同時 6 顆。
12. **頂球**：一回合 3 顆球，結算時照 GDD 的「玩耍」規則給數值，分數只用來記錄最佳成績。
13. **小窩與多隻寵物**：休息中的寵物數值凍結（不衰減），這樣同時養很多隻也不會有負擔。
