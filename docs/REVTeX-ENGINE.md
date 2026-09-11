# REVTeX / LaTeX Engine Pack

Ekdeta 本身可以直接寫 Markdown、使用 MathLive、以及製作臺灣碩博士論文。**只有在 REVTeX 模式中要真正編譯 LaTeX PDF 時，才需要 Engine Pack。**

## Ekdeta 1.2.3 對應的引擎版本

Ekdeta 1.2.3 鎖定 **TeXlyre BusyTeX Assets v1.2.3 / TeX Live 2026 recommended**。請不要直接拿最新版 1.4.x 取代，因為 1.2.3 會對引擎檔案做大小與 SHA-256 驗證。

官方下載頁：

https://github.com/TeXlyre/texlyre-busytex/releases/tag/assets-v1.2.3

下載該 release 的完整 WASM assets，解壓後找到同時包含下列五個檔案的資料夾：

```text
busytex.js
busytex.wasm
busytex_pipeline.js
texlive-recommended.js
texlive-recommended.data
```

Ekdeta 會再驗證這五個檔案。1.2.3 目前鎖定的資料如下：

| File | Size (bytes) | SHA-256 |
| --- | ---: | --- |
| `busytex.js` | 271047 | `316a48050159ce60d57aa58d66b5cf3ca7a8f13525179f1d2dd56ed095a49819` |
| `busytex.wasm` | 32501975 | `58d60c73c2aa4fc09ae86d671d13e083c5cd7c34ab8878f42abba29a1cf0348f` |
| `busytex_pipeline.js` | 33701 | `5fea68b97caa45cfd17899903811442fc0310b50888ef3787d3ac3457ed5fced` |
| `texlive-recommended.js` | 3885771 | `7e4b1e21ad226311448aa30f8dcb95da7a1ace9742fcbf4121c17e8cc6cb7f8d` |
| `texlive-recommended.data` | 199273688 | `beb1aa426fa8547df9ee2405de476ebc9ba56b4c61cdb9e5499e4addb1a7a5b1` |

## 瀏覽器版

1. 開啟 `Ekdeta.html`。
2. 切換到 **International Journal / REVTeX 4.2**。
3. 在 REVTeX 精確校樣面板選「選取 REVTeX Engine Pack 資料夾」。
4. 選擇上面五個檔案所在的資料夾。
5. 按「驗證並初始化」。
6. 編譯後右側顯示的 PDF 是真正 TeX 流程產生的 PDF，不是 HTML 近似預覽。
7. 可下載 PDF、`main.tex`、log、AUX、SyncTeX，也可匯出完整 REVTeX project ZIP。

## Electron 桌面版

第一次開啟可以先跳過引擎。需要 REVTeX 時再使用：

```text
桌面殼 → LaTeX 引擎 → 安裝 Engine Pack…
```

選取解壓後的 Engine Pack。桌面殼會把五個檔案安裝到 Ekdeta 的使用者資料目錄，之後進入 REVTeX 時再 lazy-load，不會拖慢一般 Markdown 啟動。

## CJK / 中文 LaTeX 的限制

目前這組 `texlive-recommended` Engine 適合 Ekdeta 的 REVTeX / pdfLaTeX 工作流，但**不等於完整 TeX Live / MacTeX**。如果投稿專案需要 XeLaTeX + CJK 套件或完整中文字型，Ekdeta 會避免產生看似成功、實際中文字遺失的 PDF。這類專案應匯出 `.tex` / REVTeX project ZIP，再交給完整 TeX Live、MacTeX 或期刊投稿環境編譯。
