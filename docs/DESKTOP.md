# Ekdeta Desktop / Electron

`desktop/` 是 Ekdeta 的 Electron 桌面殼。它和 Browser 版共用同一個 `Ekdeta.html` Core；啟動 / 打包前會先同步並比對 SHA-256。

## macOS：`.dmg` / `.pkg` / `.zip`

在 Mac 上雙擊：

```text
desktop/release-tools/製作 macOS 安裝包.command
```

建置者需要 Node.js，腳本會依 `package-lock.json` 使用固定 Electron 33.4.11 / electron-builder 25.0.0。

正式公開散布前，請在你的 Mac 上完成 Developer ID signing、notarization、stapling 與 Gatekeeper 實機驗收。Repository 不包含任何私人簽章憑證。

## Windows x64：兩種做法

### 最簡單：免 Node.js portable

在 Windows 雙擊：

```text
desktop/release-tools/製作 Windows x64 免安裝版_免Node.cmd
```

腳本會：

1. 下載固定的 Electron 33.4.11 Windows x64 runtime；
2. 下載 Electron 官方 `SHASUMS256.txt`；
3. 驗證 runtime SHA-256；
4. 內嵌 Ekdeta Core 與桌面殼；
5. 產生 `Ekdeta-1.2.3-win-x64-portable.zip`。

解壓後可以直接執行 `Ekdeta.exe`。如果希望固定安裝到 `%LOCALAPPDATA%\\Programs\\Ekdeta`，再雙擊 portable 內的 `安裝 Portable 到本機.cmd`。

### 正式 NSIS `.exe`

如果是維護者，要做一般 Windows 安裝精靈，雙擊：

```text
desktop/release-tools/製作 Windows x64 安裝包.cmd
```

這條路需要 Node.js，會使用 electron-builder 產生 NSIS `.exe` 與 ZIP。

## 一般使用者需要 Node.js 嗎？

不需要。Node.js 只給「建置桌面安裝包的人」使用。已經建好的 Ekdeta App / portable package 不需要 Node.js、npm 或程式開發環境。

## REVTeX Engine

Engine 不內嵌在 App 裡。一般 Markdown / 臺灣論文不需要；REVTeX 真實編譯時才依 [`REVTeX-ENGINE.md`](REVTeX-ENGINE.md) 安裝。
