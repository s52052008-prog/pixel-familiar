# 🐲 幻獸日記 Pixel Familiar（V1.8.0）

原創 16-bit 像素風奇幻生物養成遊戲（電子雞 Tamagotchi 類型）。每顆蛋都會隨機孵出獨一無二的新物種。iPhone Safari 優先。

## ▶️ 怎麼玩
- 遊戲網址（GitHub Pages 開啟後）：**https://s52052008-prog.github.io/pixel-familiar/**
- iPhone：用 Safari 開啟 → 下方「分享」⬆️ →「加入主畫面」→「加入」，即可像 App 一樣全螢幕遊玩。

## 📁 檔案結構
```
index.html            遊戲畫面（HTML + CSS + 繪圖、動畫、介面）
game-core.js          遊戲規則核心（數值集中在 CONFIG，可單元測試）
sw.js                 Service Worker（服務工作執行緒）：離線快取
manifest.webmanifest  PWA（Progressive Web App，漸進式網頁應用程式）設定
icon-180/192/512.png  主畫面圖示（iPhone 需要 PNG，不支援 SVG）
art/sheet-*.png       經典種的 sprite sheet（由程式產生後匯出，供美術參考）
art/random-species-gallery.png  24 種隨機物種範例（上：幼年期，下：進化後）
docs/                 更新紀錄、路線圖、測試清單
tests/core.test.js    規則單元測試（node tests/core.test.js）
tests/e2e_iphone.py   端對端測試（Playwright，模擬 iPhone）
art/room-examples.png  小屋裝飾範例
art/stages-gallery.png 各成長階段外觀（幼年／少年／成年三路線／高階三路線）
.nojekyll             讓 GitHub Pages 直接提供檔案
```
所有遊戲檔案都在**倉庫根目錄**，不再有 V1.2 的 `www/` 路徑問題。

## 🧪 測試狀態
見 [docs/TESTING.md](docs/TESTING.md)。規則單元測試 54/54、端對端測試 48/48 通過（Chromium 模擬 iPhone），**尚未在真實 iPhone Safari 上驗收**。

## 🗺️ 後續規劃
見 [docs/ROADMAP.md](docs/ROADMAP.md)、[docs/CHANGELOG.md](docs/CHANGELOG.md)。
