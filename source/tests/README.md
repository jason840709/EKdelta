# Product checks

Run against the built HTML, after assembling the source files:

```sh
python3 tests/audit_product.py EKdelta_v1.2.8.html \
  --name EKdelta --version 1.2.7 \
  --require-constant SEED_WELCOME \
  --require-constant SEED_MANUAL \
  --require-constant SEED_NOTES \
  --require-constant SEED_WELCOME_EN \
  --require-constant SEED_MANUAL_EN
```

Use repeatable `--forbid TOKEN` arguments for release-specific branding or privacy
checks. Matching is case-insensitive and includes source identifiers, HTML text,
attributes, and evaluated built-in document/template/version constants. Encoded
binary payloads are excluded from text matching. If a token happens to occur
inside an unrelated upstream word, use an explicit `--allow-match WORD` exception
and review that exception; do not modify upstream code to remove the coincidence.

With access to the original product, add `--baseline ORIGINAL.html`,
`--vendor-index 1`, and `--vendor-id cp171-58a-mathlive-vendor` to compare embedded
fonts, images, runtime files and third-party scripts byte for byte. Baseline data
is read only and is never copied into the public project. `--report RESULT.json`
writes the check results for a release record.

Python's HTMLParser extracts the scripts in the same script-element boundaries
as the HTML document. Node's VM parses **every** executable script, including the
core scripts and third-party code, and validates inline event handlers. Selected
literal constants are evaluated in an isolated context with a timeout so that
escaped document text is checked in its actual runtime value.

These checks do not launch the application. They do not establish browser startup,
editing, storage, layout, printing or export correctness. Those behaviors require
an actual supported browser and separate interaction checks.

Run pure-function semantic probes against the source modules as an additional
rename gate:

```sh
node tests/semantic_checks.cjs src/scripts
```

The probes exercise the real source bodies for theme normalization, safe fallback
of invalid settings, light/dark dataset projection, built-in document order,
stable IDs, language variants, and template content ownership. They deliberately
avoid a fake DOM, so a passing result is evidence about those source contracts,
not evidence of full browser startup.

For CP183 content and toolbar wiring, run `node tests/ui_content_checks.cjs PRODUCT.html`. This executes the actual About and toolbar mount functions in an isolated context and checks both template image expressions and the empty approval placeholder. It does not measure browser layout.

In the AI handoff use the root `02A_重建產品與校驗.sh`; it points at the single root product and removes temporary desktop verification outputs.

## International paper (Markdown → REVTeX 4.2) regression

Added in 1.2.6. The cases come from the 1.2.6 audits (263 parser cases, the
official-REVTeX cases and the emitter cases) plus one case per fix, with the
expected `main.tex` content and expected PDF text written next to each case in
`revtex_cases.cjs`.

```sh
# Node only (no TeX needed): emits every case with the real 15/17/18.js in a vm,
# as the preview and as the APS submission version, and checks the TeX, the
# APS-forbidden constructs in the submission version, and that the left editor
# (01.js/02.js, executed as is) and the parser agree on math, code, emphasis
# and table cells.
node tests/revtex_emit_checks.cjs

# Optional: compiles every case with pdflatex (two passes) and checks the PDF
# text. Skips itself when pdflatex is missing. EKD_PYTHON must point at a Python
# with PyMuPDF for the text checks.
EKD_PYTHON=/path/to/python node tests/revtex_pdflatex_matrix.cjs --both --out OUTPUT_DIR
```

`--src DIR` runs either script against another copy of `src/scripts` (for a
before/after comparison). The matrix writes about 250 MB into `--out`; delete it
afterwards.
