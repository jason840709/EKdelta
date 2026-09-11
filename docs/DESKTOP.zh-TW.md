<p align="right">
  <a href="DESKTOP.md">English</a> · <strong>繁體中文</strong>
</p>

# Ekdeta Desktop / Electron

`desktop/` 是同一份 `Ekdeta.html` Core 的 Electron 外殼，不是另一套編輯器。打包前會先同步 Core，並比對 SHA-256，避免 Desktop 包不小心帶到不同版本的 HTML。

## macOS：`.dmg` / `.pkg` / `.zip`

在 Mac 上雙擊：

```text
desktop/release-tools/製作 macOS 安裝包.command
```

建置者需要 Node.js。專案會依 `package-lock.json` 使用固定版本的 Electron 33.4.11 與 electron-builder 25.0.0。

如果要公開散布，請在真正的 Mac 上完成建置與 QA，並做 Developer ID signing、notarization、stapling 和 Gatekeeper 實機驗收。Repository 不會保存私人簽章憑證。

## Windows x64

Windows 有兩條建置路徑。

### 免 Node.js portable

在 Windows 雙擊：

```text
desktop/release-tools/製作 Windows x64 免安裝版_免Node.cmd
```

腳本會下載固定的 Electron 33.4.11 Windows x64 runtime 與官方 `SHASUMS256.txt`，先驗證下載內容，再放入 Ekdeta Core 和桌面殼，最後產生：

```text
Ekdeta-1.2.3-win-x64-portable.zip
```

解壓後直接執行 `Ekdeta.exe` 即可。Portable 包裡也有一個安裝輔助程式，可以安裝到 `%LOCALAPPDATA%\Programs\Ekdeta`。

### 正式 NSIS 安裝版

維護者如果要做一般 Windows 安裝精靈，可以雙擊：

```text
desktop/release-tools/製作 Windows x64 安裝包.cmd
```

這條路需要 Node.js，透過 electron-builder 產生 NSIS `.exe` 和 ZIP。

## 一般使用者需要 Node.js 嗎？

不需要。Node.js 只給「要自己建桌面安裝包的維護者」使用。已經建好的 Ekdeta App 或 portable package 不需要 npm，也不需要程式開發環境。

## REVTeX Engine Pack

Engine Pack 刻意和 Desktop App 分開。一般 Markdown 和臺灣論文工作流都不需要。真正要跑 REVTeX / LaTeX 編譯時，再依 [`REVTeX-ENGINE.zh-TW.md`](REVTeX-ENGINE.zh-TW.md) 安裝即可。
