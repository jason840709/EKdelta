<p align="right">
  <strong>English</strong> · <a href="DESKTOP.zh-TW.md">繁體中文</a>
</p>

# EKdelta Desktop / Electron

From 1.2.8 the desktop app is named EKdelta Desktop (EKdelta in 1.2.7, Ekdeta until 1.2.6). On first start it looks for an existing data folder named EKdelta, then Ekdeta, then Typora HTML, and keeps using the first one it finds, so documents, the HTML library and the engine setting carry over.

`desktop/` wraps the same `EKdelta.html` Core in Electron. It is not a separate editor. The build scripts synchronize the Core before packaging and verify its SHA-256 so a desktop package cannot silently ship a different HTML.

## macOS: `.dmg`, `.pkg`, and `.zip`

On a Mac, double-click:

```text
desktop/release-tools/製作 macOS 安裝包.command
```

The maintainer needs Node.js. The project uses the pinned dependencies in `package-lock.json`, including Electron 33.4.11 and electron-builder 25.0.0.

Before public distribution, build and QA the package on a real Mac and complete Developer ID signing, notarization, stapling, and Gatekeeper testing. No private signing credential is stored in this repository.

## Windows x64

There are two packaging paths.

### No-Node portable build

Double-click on Windows:

```text
desktop/release-tools/製作 Windows x64 免安裝版_免Node.cmd
```

The script downloads the pinned Electron 33.4.11 Windows x64 runtime and Electron's official `SHASUMS256.txt`, verifies the archive, adds the EKdelta Core and shell, and produces:

```text
EKdelta-Desktop-1.2.8-win-x64-portable.zip
```

Extract it and run `EKdelta Desktop.exe`. The portable package also includes a helper that can install it under `%LOCALAPPDATA%\Programs\EKdelta Desktop`.

### NSIS installer

Maintainers who want the standard Windows installer can double-click:

```text
desktop/release-tools/製作 Windows x64 安裝包.cmd
```

This path needs Node.js and uses electron-builder to produce an NSIS `.exe` and a ZIP package.

## Do end users need Node.js?

No. Node.js is only needed by maintainers who build the Electron packages. A finished EKdelta app or portable package runs without npm or a JavaScript development environment.

## REVTeX Engine Pack

The Engine Pack is intentionally separate from the desktop app. Markdown and Taiwan thesis workflows do not need it. Install it only when you want the real REVTeX / LaTeX compile path described in [REVTeX-ENGINE.md](REVTeX-ENGINE.md).
