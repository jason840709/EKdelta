# Validation

EKdelta 1.2.5 的公開 repo 不以「單一巨大 HTML 無法回溯」為交付方式；`source/` 是目前可維護的 source truth，`EKdelta.html` 是 deterministic build 產物。

## 1.2.5 驗證摘要

- `python3 source/build.py --output <暫存路徑>` 重建結果與 `EKdelta.html` 逐位元組相同（下方 SHA-256）；38 段可執行 script 全部可解析。
- `source/tests/` 的行為、語意、內容與產品稽核，以及桌面殼靜態檢查全部通過。
- 瀏覽器（Chrome）載入 BusyTeX Engine Pack 實測：國際論文右側 PDF 由內嵌 PDF.js 繪製；編譯失敗時保留上一份成功的 PDF 並以一行文字說明原因與 Markdown 行號；`$$` 未成對或空公式時暫不編譯；內容改回後立即恢復；連續失敗不關閉自動編譯；英文介面、深色主題、窄螢幕上下排列。
- 未執行：Electron 桌面殼實機打包與安裝、Safari / Firefox、實體手機。

以下 Core identity 為 1.2.5；其後段落為 1.2.3 時的紀錄。

## Core identity

```text
EKdelta.html SHA-256
5944f7bb257f5cbd9f028146f8fbd0f1e640fd5775051552a5499e0c56c13178
```

公開 source 的驗收要求是：重新執行 `source/build.py` 後，輸出的 HTML 必須與正式 `EKdelta.html` 逐位元組相同。

## Core checks

```bash
python3 source/build.py --output /tmp/EKdelta-rebuilt.html
cmp EKdelta.html /tmp/EKdelta-rebuilt.html
node source/tests/check_scripts.cjs source/src/scripts
node source/tests/behavior.mjs EKdelta.html
node source/tests/semantic_checks.cjs source/src/scripts
node source/tests/ui_content_checks.cjs EKdelta.html
python3 source/tests/audit_product.py EKdelta.html --name EKdelta --version 1.2.3
```

## Desktop checks

Electron shell 使用固定 Electron 33.4.11 / electron-builder 25.0.0。`desktop/sync_app_html.js` 在啟動或打包前，會把 repository 根目錄的 `EKdelta.html` 複製到桌面殼並比對 SHA-256，避免 Browser Core 與 Desktop Core 漂移。

正式 `.dmg` / `.pkg` / Windows `.exe` 仍應在對應作業系統上做最後 QA。
