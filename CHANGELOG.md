# Changelog

## 1.2.5 — CP185

- 國際論文即時編譯：編譯失敗時保留上一份成功的 PDF，只用一行文字說明原因與 Markdown 行號，「看紀錄」才展開完整訊息。
- 內容改回能編譯的樣子（例如 ⌘Z）時立即恢復，不必再按「編譯」；過期的失敗結果不顯示。
- `$$` 未成對、空公式、程式碼區塊未收尾時先不編譯，狀態列顯示「輸入中」；正在編輯的段落不必按 Enter 也會納入編譯。
- 連續失敗只拉長等待時間，不再自動關閉「停筆自動編譯」；勾選框隨時反映實際狀態；「下載 PDF」下載最近一次成功的 PDF。
- 視窗寬度不足以左右並排時，編輯區與 PDF 改為上下排列。
- GitHub repository 與單檔 HTML 改名為 EKdelta（`EKdelta.html`）；儲存鍵等程式內部名稱沿用 `ekdeta`，舊文件與設定照常讀取。桌面 App 名稱暫時仍是 Ekdeta。

## 1.2.4 — CP184

- 國際論文右側 PDF 改由內嵌 PDF.js 繪製，沒有瀏覽器自帶的黑色工具列；右上角提供縮放、頁碼跳頁與下載，重新編譯後停在原頁。
- 產品顯示名稱改為 **EKdelta**（EK 大寫、delta 小寫）：ekd- 加上科學上代表「變化」的 delta（δ）。只改顯示文字，機器名稱保留 `ekdeta`。

## 1.2.3 — CP183

- 產品現行品牌與文件統一為 **Ekdeta**。
- About 更新為精簡的中英文用途、名稱來源與 **Jason Chen** 作者資訊。
- 臺灣論文工具列短標籤更新為 **TW**，完整 tooltip、accessible name 與 `twthesis` 內部識別保持不變。
- 修正中英文論文模板 inline SVG 圖片結尾。
- 中文審定書預設圖片欄保持空白，由現有 placeholder 呈現，不再請求不存在的掃描圖片。
- 建立單一 source truth，可 deterministic rebuild 目前單檔 HTML。

公開 GitHub 版另將 98 MB AI handoff 重構為產品 HTML + 現行 source，不包含歷史對話、舊 checkpoint、研究 archive 與可再生成產物。
