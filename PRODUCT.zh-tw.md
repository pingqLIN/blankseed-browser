# BlankSeed Browser 產品定義

> 本檔為 `PRODUCT.md` 的繁體中文 companion；英文原檔為權威來源。

## 產品名稱與分類

**BlankSeed Browser**（暫定名稱）是一個 experimental AI-native Chromium application／research platform。

## 問題

多數 AI browser system 衡量的是模型使用開發者預製工具的能力；action vocabulary、workflow model 與 permission structure 已預先定義結果。BlankSeed Browser 問的是另一個問題：AI 能否從低階 execution/observation primitives 開始，在與使用者反覆互動中建立有用工具，並逐步演化應用程式本身？

## 主要使用者與流程

主要使用者是於受控環境本機操作的技術研究者或開發者。

典型流程：使用者開啟 web target、與 AI 討論未明確定義的需求、AI 檢查 capability/environment、撰寫並執行 experimental code、觀察真實 output/error、使用者評估、AI 修正並選擇性提交 reusable module，後續任務再重用或重構累積能力。

## v0.1 範圍外

- 一般消費者發布、Chrome Web Store、完整 Chrome replacement。
- Password manager、自動付款或帳號管理。
- Cloud multi-user service。
- 直接 Chromium source fork。
- 宣稱 arbitrary Node.js code 有 secure sandbox。

## 成功定義

MVP 必須至少完成一次 capability-evolution loop：原先不存在的功能經討論後由 model 生成 code，對真實 page 執行並取得 failure data，修正後由 user 驗證，保存為 versioned reusable module，並在後續 session 再次使用。

## 設計性格

- 可檢視而非 opaque。
- 實驗導向而非 polished。
- 開放演化而非 feature-driven。
- 可復原而非假裝零風險。
- Local-first 而非 cloud-dependent。
