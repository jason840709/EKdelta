# REVTeX / LaTeX Engine Pack

Ekdeta 的 Markdown、MathLive 與臺灣論文模式本身不依賴大型 TeX runtime。**只有要在 REVTeX 4.2 模式中真正編譯 LaTeX PDF 時，才需要 Engine Pack。**

這是刻意的：一般寫作不用為了偶爾一次期刊編譯，先下載約 200 MB 的 TeX 資料。

## Ekdeta 1.2.3 鎖定什麼？

Ekdeta 1.2.3 Core 內建的引擎 metadata 是：

```text
texlyre-busytex 1.2.3
TeX Live 2026 recommended
```

Core 不只看檔名，還會驗證每個檔案的大小與 SHA-256。因此**不要拿目前最新 BusyTeX 1.3 / 1.4 資產直接替換，也不要把不同 release 的檔案混在一起。**

## 官方下載位置

Ekdeta 1.2.3 最直接對應的官方資產頁：

<https://github.com/TeXlyre/texlyre-busytex/releases/tag/assets-v1.2.3>

這個 Release 名稱是 **BusyTeX Assets v1.2.3**，內容標示為 TeX Live 2026 的完整 BusyTeX WASM assets archive。下載並解壓後，讓 Ekdeta 指向能直接看到下列五個檔案的資料夾：

```text
busytex.js
busytex.wasm
busytex_pipeline.js
texlive-recommended.js
texlive-recommended.data
```

如果你已經有一個資料夾同時包含這五個檔案，可以直接讓 Ekdeta 驗證，不需要重新下載。

上游 BusyTeX 的建置專案在 <https://github.com/TeXlyre/texlyre-busytex-build>。較新的 1.3 / 1.4 assets 並不等於 Ekdeta 1.2.3 所鎖定的版本；除非未來 Ekdeta Core 明確更新 metadata，否則不要自行替換。

## Ekdeta 1.2.3 的精確驗證值

| File | Size (bytes) | SHA-256 |
| --- | ---: | --- |
| `busytex.js` | 271047 | `316a48050159ce60d57aa58d66b5cf3ca7a8f13525179f1d2dd56ed095a49819` |
| `busytex.wasm` | 32501975 | `58d60c73c2aa4fc09ae86d671d13e083c5cd7c34ab8878f42abba29a1cf0348f` |
| `busytex_pipeline.js` | 33701 | `5fea68b97caa45cfd17899903811442fc0310b50888ef3787d3ac3457ed5fced` |
| `texlive-recommended.js` | 3885771 | `7e4b1e21ad226311448aa30f8dcb95da7a1ace9742fcbf4121c17e8cc6cb7f8d` |
| `texlive-recommended.data` | 199273688 | `beb1aa426fa8547df9ee2405de476ebc9ba56b4c61cdb9e5499e4addb1a7a5b1` |

如果檔名對，但大小或 SHA-256 不一致，Ekdeta 會拒絕把它當成 1.2.3 的 Engine Pack。這比「看起來版本差不多就用」安全。

## 瀏覽器版怎麼載入

1. 開啟 `Ekdeta.html`。
2. 切到 **International Journal / REVTeX 4.2**。
3. 開啟 REVTeX 精確校樣 / TeX 編譯區。
4. 選擇 Engine Pack 資料夾。
5. 指向直接看得到上述五個檔案的資料夾。
6. 按「驗證並初始化」。
7. 驗證通過後再 Compile。

右側 PDF 是真正 TeX 流程的輸出；編譯完成後可下載 PDF、`main.tex`、log、AUX、SyncTeX，或匯出完整 REVTeX project ZIP。

## Electron 桌面版怎麼安裝

第一次開啟 Ekdeta 時可以完全跳過 Engine。等真的要用 REVTeX 再選：

```text
桌面殼 / Shell
  → LaTeX 引擎 / LaTeX Engine
  → 安裝 Engine Pack… / Install Engine Pack…
```

選擇五個檔案所在資料夾。桌面殼會複製到 Ekdeta 的使用者資料目錄；之後每次開 App 不需要重選。Engine 採 lazy-load：普通 Markdown 啟動不會先載入 199 MB data，第一次真正編譯 REVTeX 時才初始化。

## CJK / 中文 LaTeX 的邊界

`texlive-recommended` 足以支援 Ekdeta 目前鎖定的 REVTeX / pdfLaTeX 工作流，但它不是完整 MacTeX / TeX Live 安裝。

如果專案需要 XeLaTeX + xeCJK、完整 CJK 字型或期刊額外套件，Ekdeta 會避免把「程序 exit 0、但中文字其實消失」判成成功。這時請：

1. 從 Ekdeta 匯出 `.tex` 或 REVTeX project ZIP；
2. 在完整 TeX Live / MacTeX / MiKTeX 或投稿系統裡編譯；
3. 以期刊當期 author guide 作最後標準。
