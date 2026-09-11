<p align="center">
  <img src="assets/Ekdeta-icon.png" width="132" alt="Ekdeta icon">
</p>

<h1 align="center">Ekdeta</h1>

<p align="center"><strong>只寫 Markdown，從筆記一路走到碩博士論文與國際期刊投稿。</strong></p>

<p align="center">
  Ekdeta 是為研究寫作做的 Markdown 編輯器。你可以先像平常一樣寫文字、公式、圖片與表格，等真正要交件時，再把同一份內容切換成臺灣碩博士論文或 REVTeX 4.2 國際期刊流程。
</p>

<p align="center">
  <strong>v1.2.3 · Single-file HTML · Electron desktop shell · Jason Chen</strong>
</p>

## 為什麼做 Ekdeta

這個工具最初是為實驗室的研究寫作需求做的：**研究生真正該花時間的是研究內容，不是反覆學習 Markdown、論文模板、LaTeX、REVTeX 和不同投稿格式的語法。**

Ekdeta 把「內容」和「最後輸出格式」分開。平常只維護一份 Markdown；要交臺灣碩博士論文時切到臺灣論文模式，要投國際期刊時切到 REVTeX。

你不用為了換一種投稿格式，把整篇論文重寫一遍。

## 一個 Markdown，三種工作方式

| 你現在要做什麼 | 在 Ekdeta 裡怎麼做 | 最後拿到什麼 |
| --- | --- | --- |
| 一般研究筆記、草稿、文件 | Markdown 模式 | `.md` / HTML 工作內容 |
| 臺灣中英文碩博士論文 | **臺灣論文（TW）** 模式 | 可提交與檢查的 **PDF** |
| 國際期刊稿件 | **REVTeX 4.2** 模式 + Engine Pack | 真實 LaTeX **PDF**、`main.tex`、REVTeX project ZIP |

## 畫面

### 日常 Markdown / 論文編輯

![Ekdeta 1.2.3 主畫面](docs/screenshots/ekdeta-main.png)

左側是文件、搜尋與大綱；中間維持接近一般 Markdown 編輯器的操作方式；上方則把公式、表格、REVTeX 與臺灣論文工具放在同一個工作區。

### REVTeX：左邊寫 Markdown，右邊看真正的 TeX PDF

![Ekdeta REVTeX 4.2：Markdown 與真實編譯 PDF 左右分屏](docs/screenshots/ekdeta-revtex.png)

REVTeX 模式不是畫一張「看起來像論文」的 HTML 預覽。載入 Engine Pack 後，右側是實際 LaTeX / REVTeX 編譯出的 PDF。你可以直接檢查雙欄、公式、引用、表格與版面，並下載 `.tex`、PDF 或完整投稿專案。

## 最快開始

### 方法 1：不用安裝，直接開 HTML

下載 Release 裡的：

```text
Ekdeta-1.2.3.html
```

用 Chrome / Edge 等 Chromium 瀏覽器開啟即可。這是完整 Core，不是功能縮水的 demo。一般 Markdown、MathLive 公式與臺灣論文流程都可以直接使用。

> 長期寫作時，建議使用「連結儲存資料夾」把 `.md` 與圖片同步到真正的專案資料夾，並定期匯出 Full Backup JSON。瀏覽器儲存方便，但不應被當成唯一備份。

### 方法 2：Electron 桌面版

`desktop/` 是 Ekdeta 的原生桌面外殼，仍然載入同一份 `Ekdeta.html`。

- macOS 建置：雙擊 `desktop/release-tools/製作 macOS 安裝包.command`，可產生 `.dmg` / `.pkg` / `.zip`。
- Windows x64 建置：雙擊 `desktop/release-tools/製作 Windows x64 安裝包.cmd`，可產生 NSIS `.exe` / ZIP。

建置者需要 Node.js；一般使用已建好的桌面包不需要 Node.js。詳見 [`docs/DESKTOP.md`](docs/DESKTOP.md)。

## 臺灣碩博士論文：只維護 Markdown，最後輸出 PDF

Ekdeta 內建臺灣論文中文／英文模板與 Digital / Print 版面。你可以用表單處理封面、摘要、目錄、圖表、引用、參考文獻與附錄，不必手打一整套格式語法。

基本流程很短：

1. 從中文或英文臺灣論文模板建立自己的文件。
2. 選擇 Digital / Print 版面。
3. 繼續用 Markdown 寫正文。
4. 用 TW 工具處理封面、目錄、引用與論文結構。
5. 匯出向量 / 可搜尋 PDF，逐頁檢查後提交。

Ekdeta 的目的不是替學校規章做決定，而是讓「內容 → 符合格式的論文 PDF」這條路變得簡單。正式送件前仍要對照你學校當期規定。

## 國際期刊：Markdown → REVTeX 4.2 → `.tex` + PDF

切換到 **International Journal / REVTeX 4.2** 後，你仍然在左側寫 Markdown。作者、affiliation、abstract、citation、equation、figure、wide content、bibliography 等 REVTeX 結構可以用表單插入，不必把整份稿件改成手寫 TeX。

真正要編譯時，載入外部 Engine Pack：

```text
Markdown
  → REVTeX project
  → BusyTeX / TeX Live Engine
  → real PDF
  → .tex / project ZIP
```

這樣你既有 Markdown 的寫作效率，也保留真正 LaTeX / REVTeX 投稿需要的可攜性。

## REVTeX Engine Pack：什麼時候需要？

**一般 Markdown、MathLive、臺灣論文不需要。**

只有下面這件事需要 Engine Pack：

> 在 Ekdeta 裡真正執行 REVTeX / LaTeX 編譯，產生右側 PDF。

Ekdeta 1.2.3 鎖定 **TeXlyre BusyTeX Assets v1.2.3 / TeX Live 2026 recommended**。官方下載頁：

https://github.com/TeXlyre/texlyre-busytex/releases/tag/assets-v1.2.3

解壓後，選擇含有下列五個檔案的 Engine Pack 資料夾：

```text
busytex.js
busytex.wasm
busytex_pipeline.js
texlive-recommended.js
texlive-recommended.data
```

瀏覽器版在 REVTeX 面板選資料夾；桌面版使用「桌面殼 → LaTeX 引擎 → 安裝 Engine Pack…」。Ekdeta 會檢查大小與 SHA-256，避免拿錯版本。完整步驟與鎖定 hash 見 [`docs/REVTeX-ENGINE.md`](docs/REVTeX-ENGINE.md)。

> 如果稿件需要 XeLaTeX + CJK 套件 / 完整中文字型，建議匯出 `.tex` 或 REVTeX project ZIP，再交給完整 TeX Live / MacTeX 編譯。Ekdeta 不會為了顯示「成功」而默默產生遺失中文字的 PDF。

## 研究寫作功能

- Typora-style Markdown：平常看排版結果，點進區塊才編輯 Markdown。
- Full Source Mode：需要時可直接編輯完整 Markdown 原始碼。
- MathLive 視覺公式：分數、積分、矩陣等可視覺輸入，最後仍保存標準 LaTeX。
- 文件大綱、跨文件搜尋、Quick Open。
- 圖片拖放 / 貼上、相對路徑與資料夾同步。
- GitHub / Night / Sepia / Blackout 等主題。
- Full Backup JSON、資料夾同步與跨機器搬移。
- 內建中英文使用說明、臺灣論文模板與國際期刊模板。

## 專案怎麼放在 GitHub

真正的產品仍然只有一個檔案：

```text
Ekdeta.html
```

但只放產物會讓專案無法維護，所以 repository 同時保留：

```text
Ekdeta/
├── Ekdeta.html              # 可直接使用的單檔產品
├── source/                  # deterministic Core source + tests
├── desktop/                 # Electron macOS / Windows 外殼
├── assets/                  # App icon
├── docs/                    # 截圖、Engine / Desktop 說明
├── third_party/             # 授權與來源紀錄
└── README.md
```

原始 98 MB 開發交接包裡的 AI 對話、歷史 checkpoint、舊 patch、研究素材與大量驗證證據不會原封不動公開；它們對續接開發有用，但不是一般 GitHub 使用者需要的產品內容。

## 從 source 重建 Core

```bash
python3 source/build.py --output Ekdeta.html
```

1.2.3 公開 source 已驗證可以重建出與正式交接產品 **逐位元組相同**的 `Ekdeta.html`。

常用驗證：

```bash
node source/tests/check_scripts.cjs source/src/scripts
node source/tests/behavior.mjs Ekdeta.html
node source/tests/semantic_checks.cjs source/src/scripts
node source/tests/ui_content_checks.cjs Ekdeta.html
python3 source/tests/audit_product.py Ekdeta.html --name Ekdeta --version 1.2.3
```

## 1.2.3

- 品牌統一為 **Ekdeta**。
- 臺灣論文工具列短標籤統一為 **TW**。
- 修正現行論文模板與內建資源。
- Core source 收斂為可 deterministic rebuild 的單一 source truth。
- Electron 外殼同步使用 Ekdeta 名稱、App ID、圖示與固定 Core。

## 作者

**Jason Chen**

## License

第一方原始碼與文件採 [MIT License](LICENSE)。KaTeX、MathLive、REVTeX、Electron、字型與外部 BusyTeX Engine Pack 維持各自授權，詳見 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。
