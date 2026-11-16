# 🐲 幻獸日記 Pixel Familiar（V1.3.0）

原創 16-bit 像素風奇幻生物養成遊戲（電子雞 Tamagotchi 類型）。iPhone Safari 優先。

## ▶️ 怎麼玩
- 遊戲網址（GitHub Pages 開啟後）：**https://s52052008-prog.github.io/pixel-familiar/**
- iPhone：用 Safari 開啟 → 下方「分享」⬆️ →「加入主畫面」→「加入」，即可像 App 一樣全螢幕遊玩。

## 📁 檔案結構
```
index.html            完整遊戲（HTML + CSS + JavaScript，單一檔案）
sw.js                 Service Worker（服務工作執行緒）：離線快取
manifest.webmanifest  PWA（Progressive Web App，漸進式網頁應用程式）設定
icon-180/192/512.png  主畫面圖示（iPhone 需要 PNG，不支援 SVG）
art/sheet-*.png       遊戲實際使用的 sprite sheet（由程式產生後匯出，供美術參考）
docs/                 更新紀錄、路線圖、測試清單
tests/                自動化測試腳本（Playwright）
.nojekyll             讓 GitHub Pages 直接提供檔案
```
所有遊戲檔案都在**倉庫根目錄**，不再有 V1.2 的 `www/` 路徑問題。

## 🧪 測試狀態
見 [docs/TESTING.md](docs/TESTING.md)。自動化測試 32/32 通過（Chromium 模擬 iPhone 13 / SE 尺寸），**尚未在真實 iPhone Safari 上驗收**。

## 🗺️ 後續規劃
見 [docs/ROADMAP.md](docs/ROADMAP.md)、[docs/CHANGELOG.md](docs/CHANGELOG.md)。
