# Ekdeta 1.2.3 validation

The public repository keeps the current maintainable source separately from the generated single-file product.

Rebuild from the repository root:

```sh
python3 source/build.py --output Ekdeta.html
```

For a non-destructive comparison, build to a temporary path and compare SHA-256. The public release was verified to rebuild byte-for-byte to the supplied 1.2.3 product.

Portable checks used for this release:

```sh
node source/tests/behavior.mjs Ekdeta.html
node source/tests/semantic_checks.cjs source/src/scripts
node source/tests/ui_content_checks.cjs Ekdeta.html
python3 source/tests/audit_product.py Ekdeta.html --name Ekdeta --version 1.2.3 \
  --require-constant SEED_WELCOME \
  --require-constant SEED_MANUAL \
  --require-constant SEED_NOTES \
  --require-constant SEED_WELCOME_EN \
  --require-constant SEED_MANUAL_EN
```

These checks validate source assembly, all executable script parsing, core pure-function behavior, built-in content identity, toolbar/content wiring and embedded assets. They do not substitute for native browser interaction, macOS printing/PDF, external TeX engine compilation, Electron packaging, signing or notarization.
