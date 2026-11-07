<p align="right">
  <strong>English</strong> · <a href="REVTeX-ENGINE.zh-TW.md">繁體中文</a>
</p>

# REVTeX / LaTeX Engine Pack

EKdelta does not load a large TeX runtime just because you are writing Markdown. Markdown, MathLive, and the Taiwan thesis workflow work without the Engine Pack.

You need the Engine Pack only when EKdelta must actually compile REVTeX / LaTeX and show the real TeX PDF.

## Version used by EKdelta 1.2.3

The 1.2.3 Core is locked to:

```text
texlyre-busytex 1.2.3
TeX Live 2026 recommended
```

EKdelta validates file names, sizes, and SHA-256 values. Do not replace these assets with a newer BusyTeX release just because the version number is higher, and do not mix files from different releases.

## Official download

BusyTeX Assets v1.2.3:

<https://github.com/TeXlyre/texlyre-busytex/releases/tag/assets-v1.2.3>

Download the v1.2.3 assets archive, extract it, and use the directory that directly contains:

```text
busytex.js
busytex.wasm
busytex_pipeline.js
texlive-recommended.js
texlive-recommended.data
```

The upstream build project is <https://github.com/TeXlyre/texlyre-busytex-build>.

## Exact values checked by EKdelta 1.2.3

| File | Size (bytes) | SHA-256 |
| --- | ---: | --- |
| `busytex.js` | 271047 | `316a48050159ce60d57aa58d66b5cf3ca7a8f13525179f1d2dd56ed095a49819` |
| `busytex.wasm` | 32501975 | `58d60c73c2aa4fc09ae86d671d13e083c5cd7c34ab8878f42abba29a1cf0348f` |
| `busytex_pipeline.js` | 33701 | `5fea68b97caa45cfd17899903811442fc0310b50888ef3787d3ac3457ed5fced` |
| `texlive-recommended.js` | 3885771 | `7e4b1e21ad226311448aa30f8dcb95da7a1ace9742fcbf4121c17e8cc6cb7f8d` |
| `texlive-recommended.data` | 199273688 | `beb1aa426fa8547df9ee2405de476ebc9ba56b4c61cdb9e5499e4addb1a7a5b1` |

A correct file name with the wrong size or hash is rejected.

## Browser edition

1. Open `EKdelta.html`.
2. Switch to **International Journal / REVTeX 4.2**.
3. Open the exact-proof / TeX compile area.
4. Choose the Engine Pack folder.
5. Select the directory that directly contains the five files above.
6. Verify and initialize the engine.
7. Compile the manuscript.

After a successful build, you can export the PDF, `main.tex`, logs, AUX/SyncTeX data, or a complete REVTeX project ZIP.

## Electron desktop edition

You can skip the Engine Pack on first launch. Install it only when you need REVTeX:

```text
Shell / Desktop
  → LaTeX Engine
  → Install Engine Pack…
```

The desktop shell copies the selected engine assets into EKdelta's user-data area. The engine is lazy-loaded, so ordinary Markdown startup does not initialize the large TeX runtime.

## CJK / XeLaTeX boundary

The recommended BusyTeX profile covers EKdelta's locked REVTeX/pdfLaTeX workflow, but it is not a full MacTeX or TeX Live installation.

If the manuscript needs XeLaTeX + CJK packages, special fonts, or extra journal packages, export the `.tex` or REVTeX project ZIP and compile it with full TeX Live, MacTeX, MiKTeX, or the journal submission system.
