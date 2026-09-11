<p align="center">
  <img src="assets/Ekdeta-icon.png" width="132" alt="Ekdeta icon">
</p>

<h1 align="center">Ekdeta</h1>

<p align="center"><strong>只寫 Markdown，就能一路走到碩博士論文與國際期刊投稿。</strong></p>

<p align="center">
  Write in Markdown. Export a Taiwan thesis PDF, or compile a real REVTeX journal manuscript.<br>
  <strong>v1.2.3 · Single-file HTML · Electron desktop · Jason Chen</strong>
</p>

## 為什麼有 Ekdeta

Ekdeta 起源於一個很實際的實驗室需求：**研究生應該把時間花在研究與寫作，而不是為了不同交件格式反覆學不同的排版語法。**

所以它把事情拆成兩層：你平常只管 Markdown；真正要交件時，再選你需要的輸出流程。內容不用重寫，工具會替你處理版面、論文結構與投稿格式。

| 你要完成的工作 | 寫作方式 | 最後輸出 |
| --- | --- | --- |
| 研究筆記、草稿、一般文件 | Markdown | Markdown / HTML 工作內容 |
| 臺灣中英文碩博士論文 | Markdown + **TW 臺灣論文模式** | **可搜尋 PDF** |
| 國際期刊論文 | Markdown + **REVTeX 4.2** | **真實 LaTeX PDF + `.tex` + REVTeX project ZIP** |

> Ekdeta 的重點不是「把 Markdown 顯示得像論文」，而是讓 Markdown 成為真正的寫作來源，再由對應的論文流程產生正式交付物。

## 先看畫面

### 日常寫作：Markdown 還是 Markdown

![Ekdeta 主畫面](docs/screenshots/ekdeta-main.png)

左側是文件、搜尋與大綱，中間是接近一般 Markdown 編輯器的寫作區。公式、表格、REVTeX 與臺灣論文工具都放在同一個工作環境裡，不需要換一套編輯器重來。

### REVTeX：左邊寫 Markdown，右邊看真正編譯的 PDF

![Ekdeta REVTeX 4.2：Markdown 與真實 TeX PDF 左右分屏](docs/screenshots/ekdeta-revtex.png)

這張圖是 Ekdeta 很重要的一部分：右側不是 HTML 仿造的「論文樣子」，而是載入 LaTeX Engine 後，由真正的 REVTeX / pdfLaTeX 流程產生的 PDF。雙欄、公式、引用、浮動物件與最終換行都可以在投稿前直接檢查。

## 三分鐘開始

### 1. 最輕量：直接開一個 HTML

從 GitHub Release 下載：

```text
Ekdeta-1.2.3.html
```

用 Chrome / Edge 等 Chromium 瀏覽器開啟即可。這就是完整 Core，不是 demo。一般 Markdown、MathLive、圖片、表格與臺灣論文流程都能直接使用。

長期寫作建議使用「連結儲存資料夾」，把 `.md` 與圖片同步到真正的專案目錄；重要階段再匯出 Full Backup JSON。瀏覽器儲存很方便，但不要把它當成唯一備份。

### 2. 想要一般 App 體驗：Electron 桌面版

Repository 的 `desktop/` 是同一份 Ekdeta Core 的 Electron 外殼，不是另一套編輯器。

- **macOS**：可建立 `.dmg` / `.pkg` / `.zip`。
- **Windows x64（正式安裝版）**：可建立 NSIS `.exe` / ZIP。
- **Windows x64（最省事）**：另外提供「免 Node.js portable 建置器」，只需雙擊，它會下載固定 Electron runtime 並驗證官方 SHA-256。

完整步驟見 [`docs/DESKTOP.md`](docs/DESKTOP.md)。Release 也會附上獨立的 `Ekdeta-Electron-Desktop-1.2.3.zip` 建置包。

## 臺灣碩博士論文：Markdown → PDF

Ekdeta 內建中英文臺灣論文模板，以及 Digital / Print 版面。正文仍然是 Markdown；封面、摘要、目錄、圖表、引用、參考文獻與附錄等結構可以透過 TW 工具處理，不需要自己維護一大套版面語法。

最短流程：

1. 從中文或英文臺灣論文模板建立自己的文件。
2. 選擇 Digital / Print 版面。
3. 照平常方式用 Markdown 寫正文。
4. 用 TW 工具補上封面、目錄、引用與論文結構。
5. 匯出向量／可搜尋 PDF，逐頁檢查後提交。

Ekdeta 讓「研究內容 → 正式論文 PDF」變得簡單，但不會替學校規章做決定。正式送件前仍應對照學校當期格式要求。

## 國際期刊：Markdown → REVTeX 4.2 → `.tex` + PDF

切換到 **International Journal / REVTeX 4.2** 後，左側仍然是 Markdown。作者、affiliation、abstract、citation、equation、figure、wide content、bibliography 等 REVTeX 結構可以用表單產生，不必把整篇稿件改寫成手打 TeX。

真正編譯時：

```text
Markdown manuscript
        ↓
REVTeX project
        ↓
BusyTeX / TeX Live Engine
        ↓
real TeX PDF
        ↓
PDF + main.tex + REVTeX project ZIP
```

這個設計的目的很單純：**保留 Markdown 的寫作效率，同時保留真正 LaTeX / REVTeX 投稿需要的檔案。**

## REVTeX 為什麼還要 Engine Pack？

**一般 Markdown、MathLive、臺灣論文 PDF 都不需要 Engine Pack。**

只有當你要求 Ekdeta 在 REVTeX 模式內真正執行 LaTeX 編譯時，才需要外部 Engine。Ekdeta 1.2.3 的 Core 鎖定 `texlyre-busytex 1.2.3` / TeX Live 2026 recommended，並會驗證五個檔案的大小與 SHA-256：

```text
busytex.js
busytex.wasm
busytex_pipeline.js
texlive-recommended.js
texlive-recommended.data
```

官方下載：

- **BusyTeX Assets v1.2.3**：<https://github.com/TeXlyre/texlyre-busytex/releases/tag/assets-v1.2.3>
- BusyTeX / TeX Live 2026 build project：<https://github.com/TeXlyre/texlyre-busytex-build>

請使用 **v1.2.3** 的完整 WASM assets archive，解壓後選擇能直接看到上述五個檔案的資料夾。**不要混用不同 release，也不要直接用目前較新的 1.3 / 1.4 assets 取代。** 最後仍以 Ekdeta 內建的檔案大小與 SHA-256 驗證結果為準。

完整下載、驗證與安裝方式見 [`docs/REVTeX-ENGINE.md`](docs/REVTeX-ENGINE.md)。

> 如果稿件需要完整 XeLaTeX + CJK 套件或特定中文字型，建議匯出 `.tex` / REVTeX project ZIP，再交給完整 TeX Live、MacTeX 或投稿系統編譯。Ekdeta 會避免把「exit 0 但中文字遺失」誤當成功。

## 寫作功能

- **Typora-style Markdown**：平常看排版結果，進入區塊時才編輯 Markdown。
- **Full Source Mode**：需要時可直接編輯完整 Markdown 原始碼。
- **MathLive 視覺公式**：不用背完 LaTeX 才能輸入分數、積分、矩陣；資料仍保存成標準 LaTeX。
- 文件大綱、跨文件搜尋、Quick Open。
- 圖片拖放／貼上、相對路徑、資料夾同步。
- GitHub / Night / Sepia / Blackout 等主題。
- Full Backup JSON、資料夾同步與跨機器搬移。
- 內建中英文說明、臺灣論文模板與國際期刊模板。

## 這個 GitHub repository 放什麼？

真正可直接使用的產品只有一個檔案：

```text
Ekdeta.html
```

但只放一個 5 MB HTML，未來就很難維護。因此公開 repo 同時保留「能確定重建同一產品」所需的精簡 source，以及真正有用的 Desktop / 文件：

```text
Ekdeta/
├── Ekdeta.html              # 直接使用的單檔產品
├── source/                  # deterministic Core source + tests
├── desktop/                 # Electron macOS / Windows 外殼
├── assets/                  # App icon
├── docs/                    # 截圖、Desktop、REVTeX Engine 說明
├── third_party/             # 第三方授權 / 來源紀錄
└── README.md
```

原始交接包裡的大量 AI 對話、checkpoint 證據、舊 patch、研究素材與歷史驗證產物不會原封不動放進公開 repo；它們對續接開發有用，但不是一般使用者需要下載的產品內容。

## 從公開 source 重建 Ekdeta.html

```bash
python3 source/build.py --output Ekdeta.html
```

目前 1.2.3 公開 source 已驗證可以重建出和正式交接產品 **逐位元組相同**的 `Ekdeta.html`。

核心驗證：

```bash
node source/tests/check_scripts.cjs source/src/scripts
node source/tests/behavior.mjs Ekdeta.html
node source/tests/semantic_checks.cjs source/src/scripts
node source/tests/ui_content_checks.cjs Ekdeta.html
python3 source/tests/audit_product.py Ekdeta.html --name Ekdeta --version 1.2.3
```

更多重現資訊見 [`VALIDATION.md`](VALIDATION.md)。

## 版本與作者

**Ekdeta 1.2.3**

- 作者：**Jason Chen**
- 第一方原始碼與文件：MIT License
- KaTeX、MathLive、REVTeX、Electron、字型與外部 BusyTeX Engine Pack：依各自授權

第三方資訊見 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。
