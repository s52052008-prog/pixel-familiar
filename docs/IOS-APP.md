# 幻獸日記 iOS App（直接讀取「健康」App 步數）

只用 iPhone 就能完成，不需要 Mac：程式在 GitHub 的雲端 Mac 上打包，再自動上傳到 TestFlight，你用 TestFlight App 安裝。

## 已經做好的部分（在這個專案裡）

| 項目 | 位置 |
|---|---|
| iOS App 專案（Capacitor 8，Swift Package Manager） | `ios/`、`capacitor.config.json`、`package.json` |
| 讀取健康步數的外掛（只讀；健康 App 裡手動新增的步數不算） | `native/health-steps/` |
| 健康權限說明文字、HealthKit 權限（entitlements）、App 圖示、只能直立 | `ios/App/App/Info.plist`、`ios/App/App/App.entitlements` |
| 遊戲在 App 裡自動同步最近 7 天步數（打開時、回到前景時） | `index.html` 的 `syncHealth()` |
| 雲端打包＋上傳 TestFlight 的流程 | `.github/workflows/ios-testflight.yml` |

App 的 Bundle ID 是 **`com.s52052008.pixelfamiliar`**，下面會用到。

## 你要做的事（只需要做一次）

### 1. 加入 Apple Developer Program（付費，約 99 美元／年）
1. App Store 下載「**Apple Developer**」App，用你的 Apple ID 登入。
2. 點「**Account**」→「**Enroll Now**」，選「個人（Individual）」，照畫面付款。
3. 等 Apple 審核通過（通常 1～2 天，會寄信通知）。

### 2. 建立 App ID（打開 HealthKit）
用 Safari 打開 https://developer.apple.com/account/resources/identifiers/list
（畫面太小可以點網址列的「大小」→「切換為桌面版網站」）
1. 點「**＋**」→ 選「**App IDs**」→「**App**」→ Continue。
2. Description 填 `Pixel Familiar`，Bundle ID 選 **Explicit**，填 `com.s52052008.pixelfamiliar`。
3. 下面的 Capabilities 勾選「**HealthKit**」→ Continue → Register。

### 3. 在 App Store Connect 建立 App
打開 https://appstoreconnect.apple.com/apps
1. 點「**＋**」→「**新增 App**」。
2. 平台勾 iOS，名稱填「幻獸日記」（如果被用走了，可以改「幻獸日記 Pixel Familiar」），主要語言選繁體中文。
3. 套裝組合 ID 選剛剛建立的 `com.s52052008.pixelfamiliar`，SKU 填 `pixelfamiliar`，建立。

### 4. 建立 API 金鑰（讓雲端可以幫你簽名、上傳）
打開 https://appstoreconnect.apple.com/access/integrations/api
1. 第一次要先按「申請存取權」並同意。
2. 點「**＋**」產生金鑰：名稱填 `github`，存取權選「**管理（Admin）**」。
3. 記下畫面上的 **Issuer ID** 和這把金鑰的 **金鑰 ID（Key ID）**。
4. 點「**下載 API 金鑰**」，會下載 `AuthKey_XXXXXXXX.p8`（**只能下載一次**，請保存好）。
5. 在「檔案」App 裡用「文字編輯」類的 App 打開這個檔，複製**全部內容**（包含 `-----BEGIN PRIVATE KEY-----` 和 `-----END PRIVATE KEY-----`）。

另外到 https://developer.apple.com/account 的「Membership details」找到 **Team ID**（10 碼英數）。

### 5. 把 4 個值存到 GitHub
打開 https://github.com/s52052008-prog/pixel-familiar/settings/secrets/actions
點「**New repository secret**」，依序新增：

| Name | 內容 |
|---|---|
| `APPLE_TEAM_ID` | Team ID |
| `ASC_KEY_ID` | 金鑰 ID（Key ID） |
| `ASC_ISSUER_ID` | Issuer ID |
| `ASC_KEY_P8` | .p8 檔案的全部內容 |

這些是密碼等級的資料，只存在 GitHub Secrets 裡，不要貼到聊天或公開的地方。

### 6. 打包並上傳
1. 打開 https://github.com/s52052008-prog/pixel-familiar/actions
2. 左邊選「**iOS App → TestFlight**」→ 右邊「**Run workflow**」→ 綠色「Run workflow」。
3. 大約 10～20 分鐘跑完（綠色勾勾）。失敗的話點進去，把紅色那一步的錯誤訊息截圖給 Claude。

### 7. 用 TestFlight 安裝
1. 等 10～30 分鐘，App Store Connect →「我的 App」→ 幻獸日記 →「**TestFlight**」會出現這個版本（第一次可能要回答「出口合規」問題，選「否」）。
2. 在「內部測試」建立群組，把自己加進去。
3. iPhone 下載「**TestFlight**」App，就會看到幻獸日記，按「安裝」。
4. 第一次打開會問能不能讀取「步數」，選**允許**。

## 之後更新
遊戲有新版本時，只要再到 Actions 按一次「Run workflow」，TestFlight 就會收到新版本。

## 注意
- App 版和 Safari 版的存檔是分開的。要搬進度：在 Safari 版按「💾 存檔」→「複製存檔碼」，再到 App 版的「💾 存檔」匯入。
- TestFlight 的版本 90 天後會過期，到時候再跑一次 Actions 就好。
- 想給朋友玩：可以加到「內部測試」（要先邀請成為 App Store Connect 使用者），或用「外部測試」（需要 Apple 做一次簡單審核）。
