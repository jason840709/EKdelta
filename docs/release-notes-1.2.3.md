# Ekdeta 1.2.3

Ekdeta 1.2.3 是目前公開版基線：單一 HTML Core、可 deterministic rebuild 的 source，以及同源 Electron desktop shell。

## 這個 Release 提供

- `Ekdeta-1.2.3.html`：直接用 Chromium 瀏覽器開啟的完整單檔 App。
- `Ekdeta-1.2.3-source.zip`：Core source、Desktop source、文件與測試。
- `Ekdeta-Electron-Desktop-1.2.3.zip`：獨立 Electron 建置包，Mac / Windows 可各自在原生平台產生安裝版。
- `SHA256SUMS.txt`：Release assets 的 SHA-256。

## 寫作工作流

- 一般 Markdown / 公式：不需要 TeX Engine。
- 臺灣碩博士論文：Markdown + TW 模式 → PDF。
- 國際期刊：Markdown + REVTeX 4.2 + 外部 Engine Pack → 真實 PDF + `.tex` + project ZIP。

REVTeX Engine Pack 使用與固定版本下載位置見 `docs/REVTeX-ENGINE.md`。
