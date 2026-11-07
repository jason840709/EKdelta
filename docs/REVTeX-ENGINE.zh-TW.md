<p align="right">
  <a href="REVTeX-ENGINE.md">English</a> · <strong>繁體中文</strong>
</p>

# REVTeX / LaTeX Engine Pack

EKdelta 不會因為你只是寫 Markdown，就先載入一大包 TeX runtime。一般 Markdown、MathLive 與臺灣論文工作流都不需要 Engine Pack。

只有真的要讓 EKdelta 編譯 REVTeX / LaTeX、產生右側那份真實 TeX PDF 時，才需要 Engine Pack。

## EKdelta 1.2.3 鎖定的版本

1.2.3 Core 鎖定：

```text
texlyre-busytex 1.2.3
TeX Live 2026 recommended
```

EKdelta 會檢查檔名、大小與 SHA-256。不要因為 BusyTeX 有更新版本，就直接用 1.3 / 1.4 的檔案替換，也不要把不同 release 的檔案混在同一個資料夾。

## 官方下載

BusyTeX Assets v1.2.3：

<https://github.com/TeXlyre/texlyre-busytex/releases/tag/assets-v1.2.3>

下載 v1.2.3 assets archive、解壓後，使用能直接看到下面五個檔案的資料夾：

```text
busytex.js
busytex.wasm
busytex_pipeline.js
texlive-recommended.js
texlive-recommended.data
```

上游建置專案在 <https://github.com/TeXlyre/texlyre-busytex-build>。

## EKdelta 1.2.3 的精確驗證值

| File | Size (bytes) | SHA-256 |
| --- | ---: | --- |
| `busytex.js` | 271047 | `316a48050159ce60d57aa58d66b5cf3ca7a8f13525179f1d2dd56ed095a49819` |
| `busytex.wasm` | 32501975 | `58d60c73c2aa4fc09ae86d671d13e083c5cd7c34ab8878f42abba29a1cf0348f` |
| `busytex_pipeline.js` | 33701 | `5fea68b97caa45cfd17899903811442fc0310b50888ef3787d3ac3457ed5fced` |
| `texlive-recommended.js` | 3885771 | `7e4b1e21ad226311448aa30f8dcb95da7a1ace9742fcbf4121c17e8cc6cb7f8d` |
| `texlive-recommended.data` | 199273688 | `beb1aa426fa8547df9ee2405de476ebc9ba56b4c61cdb9e5499e4addb1a7a5b1` |

檔名正確但大小或 hash 不對，EKdelta 仍會拒絕載入。

## 瀏覽器版怎麼載入

1. 開啟 `EKdelta.html`。
2. 切到 **International Journal / REVTeX 4.2**。
3. 打開精確校樣 / TeX 編譯區。
4. 選擇 Engine Pack 資料夾。
5. 指向能直接看到上述五個檔案的目錄。
6. 驗證並初始化。
7. 編譯稿件。

成功後可以下載 PDF、`main.tex`、log、AUX / SyncTeX，或完整 REVTeX project ZIP。

## Electron 桌面版

第一次開 EKdelta 可以完全跳過 Engine。真正要用 REVTeX 時再安裝：

```text
桌面殼 / Shell
  → LaTeX 引擎 / LaTeX Engine
  → 安裝 Engine Pack… / Install Engine Pack…
```

桌面殼會把選到的 Engine assets 複製到 EKdelta 的使用者資料目錄。Engine 是 lazy-load，平常只寫 Markdown 時不會初始化大型 TeX runtime。

## CJK / XeLaTeX 的邊界

目前 recommended BusyTeX profile 足以支援 EKdelta 鎖定的 REVTeX / pdfLaTeX 工作流，但它不是完整 MacTeX / TeX Live。

如果稿件需要 XeLaTeX + CJK 套件、特殊中文字型或額外期刊套件，請從 EKdelta 匯出 `.tex` 或 REVTeX project ZIP，再交給完整 TeX Live、MacTeX、MiKTeX 或投稿系統編譯。
