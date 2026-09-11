# Ekdeta Desktop / Electron

Ekdeta 的核心產品仍然是單一 `Ekdeta.html`。`desktop/` 是把同一份 Core 包成原生桌面應用的 Electron 外殼，提供原生選單、檔案整合、HTML 版本切換與 Engine Pack 安裝位置。

## macOS

雙擊 `desktop/release-tools/製作 macOS 安裝包.command`，可以在 Apple Silicon 或 Intel Mac 上依目前架構產生 `.dmg`、`.pkg` 與 `.zip`。建置者需要 Node.js；使用者不需要。

## Windows x64

在 Windows 上雙擊 `desktop/release-tools/製作 Windows x64 安裝包.cmd`，產生 NSIS `.exe` 與 ZIP。正式對外發佈前應在 Windows 實機測試。

## 為什麼 Engine Pack 不直接塞進 App

Engine Pack 約 200 MB，而且只有 REVTeX 真實編譯需要。把它拆開能讓一般 Markdown / 臺灣論文使用者得到更小、更快的桌面應用；需要國際期刊 TeX 編譯的人再依 [`REVTeX-ENGINE.md`](REVTeX-ENGINE.md) 安裝即可。
