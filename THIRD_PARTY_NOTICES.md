# Third-party notices

EKdelta 1.2.5 的第一方程式碼與文件採 MIT License；下列第三方元件維持各自授權。

## KaTeX 0.16.11

用於 Markdown / 論文畫面的 TeX 數學渲染。MIT。授權副本：`third_party/KaTeX-LICENSE.txt`。

## PDF.js 5.6.205

國際論文模式右側用來繪製 TeX 編譯出的 PDF（1.2.4 起）。Mozilla，Apache-2.0。原樣內嵌 `pdf.min.mjs` 與 `pdf.worker.min.mjs`（legacy build），檔案雜湊記錄在 `source/src/vendor-hashes.json`。授權全文：`third_party/PDFjs-LICENSE.txt`。來源：<https://github.com/mozilla/pdf.js>。

## MathLive 0.110.0

用於視覺公式輸入。MIT。來源與授權紀錄位於 `third_party/MathLive-LICENSE.txt` 與 `third_party/source-notices/MathLive/`。

## TeX Gyre / Euler / fonts

論文與數學畫面使用的字型素材保留原 GUST / OFL 等授權；紀錄位於 `third_party/source-notices/fonts/`。

## REVTeX 4.2f

EKdelta 的國際期刊流程使用官方 REVTeX 4.2 結構。相關上游 README / LPPL provenance 保留於 `third_party/source-notices/REVTeX/`。

## Electron

`desktop/` 使用 Electron 33.4.11 與 electron-builder 25.0.0 作為建置與桌面包裝工具。Electron 及 npm 相依套件維持其各自 license；固定版本與 integrity 由 `desktop/package-lock.json` 記錄。

## BusyTeX / TeXlyre BusyTeX

REVTeX 真實 PDF 編譯所需的 Engine Pack **不隨 EKdelta repository 或安裝包重新散布**。EKdelta 1.2.3 鎖定外部 TeXlyre BusyTeX Assets v1.2.3，使用者依 [`docs/REVTeX-ENGINE.md`](docs/REVTeX-ENGINE.md) 從上游 GitHub Release 取得。BusyTeX / TeXlyre BusyTeX 的授權由上游專案決定，使用者應依其 release / repository 的授權條款使用。

## 臺灣論文模板與機構欄位

內建學校、系所、封面標誌與格式是可編輯範例，不代表所有學校都保證接受。正式提交前仍應對照目標學校當期規範。
