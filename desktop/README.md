# Ekdeta Desktop 1.2.5

這個資料夾是 **Ekdeta** 的 Electron 桌面殼。網頁版自 1.2.4 起改名為 **EKdelta**；桌面 App 的名稱暫時仍是 Ekdeta，因為 App 名稱決定設定與引擎存放的資料夾，改名要搭配實機打包與安裝測試。它載入 repository 根目錄同一份 `EKdelta.html`；Browser 版與 Desktop 版共用一個 Core。

## macOS

雙擊：

```text
release-tools/製作 macOS 安裝包.command
```

維護者需要 Node.js；建置後會得到 `.dmg`、`.pkg`、`.zip`。一般使用已建好的 App 不需要 Node.js。

## Windows x64：推薦先用免 Node.js portable

雙擊：

```text
release-tools/製作 Windows x64 免安裝版_免Node.cmd
```

它會下載固定 Electron 33.4.11 Windows x64 runtime，使用 Electron 官方 `SHASUMS256.txt` 驗證，再產生 portable ZIP。解壓後直接執行 `Ekdeta.exe`；需要固定安裝時，雙擊 portable 內的 `安裝 Portable 到本機.cmd`。

如果你是維護者，要產生正式 NSIS `.exe`，改用：

```text
release-tools/製作 Windows x64 安裝包.cmd
```

這條路需要 Node.js。

## REVTeX Engine

一般 Markdown / MathLive / 臺灣論文不需要。真正 REVTeX 編譯才需要外部 Engine Pack，請看 [`../docs/REVTeX-ENGINE.md`](../docs/REVTeX-ENGINE.md)。
