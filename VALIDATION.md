# Validation

Ekdeta 1.2.3 的公開 repo 不以「單一巨大 HTML 無法回溯」為交付方式；`source/` 是目前可維護的 source truth，`Ekdeta.html` 是 deterministic build 產物。

## Core identity

```text
Ekdeta.html SHA-256
731ae627456ed4466bd20e16753c2c1cdcdf147358c1f1dc3acd1fdce2175ced
```

公開 source 的驗收要求是：重新執行 `source/build.py` 後，輸出的 HTML 必須與正式 `Ekdeta.html` 逐位元組相同。

## Core checks

```bash
python3 source/build.py --output /tmp/Ekdeta-rebuilt.html
cmp Ekdeta.html /tmp/Ekdeta-rebuilt.html
node source/tests/check_scripts.cjs source/src/scripts
node source/tests/behavior.mjs Ekdeta.html
node source/tests/semantic_checks.cjs source/src/scripts
node source/tests/ui_content_checks.cjs Ekdeta.html
python3 source/tests/audit_product.py Ekdeta.html --name Ekdeta --version 1.2.3
```

## Desktop checks

Electron shell 使用固定 Electron 33.4.11 / electron-builder 25.0.0。`desktop/sync_app_html.js` 在啟動或打包前，會把 repository 根目錄的 `Ekdeta.html` 複製到桌面殼並比對 SHA-256，避免 Browser Core 與 Desktop Core 漂移。

正式 `.dmg` / `.pkg` / Windows `.exe` 仍應在對應作業系統上做最後 QA。
