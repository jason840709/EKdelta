# EKdelta 1.2.5

EKdelta（1.2.2–1.2.3 名為 Ekdeta）是一個單一 HTML 的 Markdown 研究寫作環境，支援臺灣學位論文與 REVTeX 4.2 國際期刊稿件。

## 這一版

- 國際論文的即時編譯更穩定：打字途中編譯失敗時，右側保留上一份正確的 PDF，只用一行字提示原因與大約的行號；改好或撤銷回原本內容就自動恢復。
- `$$` 還沒打完時先不編譯；正在打的那一段停筆後就會更新，不必按 Enter。
- 連續失敗不再自動關掉「停筆自動編譯」。
- 視窗太窄時編輯區與 PDF 上下排列。
- 1.2.4 起：右側 PDF 由內嵌 PDF.js 繪製（縮放、頁碼跳頁、下載），產品改名 EKdelta。

## 下載

- `EKdelta-1.2.5.html`：用 Chrome 或 Edge 直接開啟的完整單檔 App。
- `EKdelta-1.2.5-source.zip`：這個 repository 的完整內容（Core source、Desktop source、文件與測試）。
- `EKdelta-Electron-Desktop-1.2.5.zip`：獨立 Electron 建置包，macOS / Windows 可各自產生安裝版（桌面 App 名稱暫時仍是 Ekdeta）。
- `SHA256SUMS.txt`：以上檔案的 SHA-256。

REVTeX 編譯需要另外下載 BusyTeX 1.2.3 / TeX Live 2026 recommended 引擎（見 `docs/REVTeX-ENGINE.zh-TW.md`）。舊版的文件與設定可直接沿用。
