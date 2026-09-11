# Ekdeta Desktop 1.2.3

這個目錄是 **Ekdeta** 的 Electron 桌面外殼。它載入 repository 根目錄同一份 `Ekdeta.html`，因此瀏覽器版與桌面版共用同一個 Core，而不是兩套編輯器。

## 一般使用者需要知道的事

- Markdown、MathLive 與臺灣論文排版不需要 LaTeX Engine Pack。
- 只有要在 REVTeX 模式中執行真正的 pdfLaTeX / LaTeX PDF 編譯時，才需要額外安裝 Engine Pack。
- Engine Pack 不會塞進安裝包；這樣一般使用者不必為了寫 Markdown 先下載約 200 MB 的 TeX 資料。

## macOS：製作可安裝版本

在 Mac 上雙擊：

```text
release-tools/製作 macOS 安裝包.command
```

需要 Node.js。腳本會依 `package-lock.json` 安裝固定版本的 Electron 33.4.11 / electron-builder 25.0.0，然後產生 `.dmg`、`.pkg` 與 `.zip`。目前設定沒有 Developer ID signing / notarization 憑證，公開發佈前仍需在真正的 Mac 上完成簽章、公證與實機驗收。

## Windows x64：製作安裝版本

在 Windows 上雙擊：

```text
release-tools/製作 Windows x64 安裝包.cmd
```

同樣需要 Node.js；產物會出現在 `dist/`，包含 NSIS `.exe` 與 ZIP。正式對外散布前請在 Windows 實機驗收。

## 開發啟動

```bash
npm ci
npm start
```

每次啟動與打包前，`sync_app_html.js` 都會從 repository 根目錄同步 `Ekdeta.html`，並比較 SHA-256，避免 Electron 裡偷偷跑了另一份 Core。

## Engine Pack

完整說明見 [`../docs/REVTeX-ENGINE.md`](../docs/REVTeX-ENGINE.md)。桌面版選單可使用「桌面殼 → LaTeX 引擎 → 安裝 Engine Pack…」選取解壓後的 Engine Pack 資料夾。
