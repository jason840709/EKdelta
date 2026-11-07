# EKdelta public architecture

EKdelta has two intentional layers.

## 1. Runnable product

`EKdelta.html` is the complete browser product: CSS, application scripts, KaTeX/MathLive vendor payloads, built-in manuals/templates, font data and optional REVTeX runtime payloads are assembled into one file.

## 2. Maintainable source

`source/build.py` assembles the product from:

- `source/src/template.html` — host HTML/CSS and script insertion order
- `source/src/scripts/*.js` — classic script modules in fixed numeric order
- `source/docs/` — built-in welcome/manual/developer documents and version history
- `source/templates/` — Taiwan Thesis and international-paper templates
- `source/src/vendor-hashes.json` — integrity constraints for embedded vendor source

The builder injects text/JSON markers, verifies vendor hashes, parses every executable script through Node VM, records a deterministic source manifest and only then writes the output.

The public repository deliberately excludes the Electron desktop shell and the large AI handoff history because the user-facing software being published here is the single-file browser application. Those materials remain development/handoff artifacts rather than runtime requirements.
