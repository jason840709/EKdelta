# Contributing

Ekdeta 的公開 repository 刻意只保留現行 source truth，不包含歷代 AI handoff。

## 修改方式

1. 修改 `source/src/`、`source/docs/` 或 `source/templates/`。
2. 以 `python3 source/build.py --output Ekdeta.html` 重建單檔產品。
3. 執行 `source/VALIDATION.md` 列出的 portable checks。
4. 確認沒有把本機路徑、瀏覽器 profile、產生 PDF、測試截圖或私密研究資料加入 repository。

不要直接只修改生成的 `Ekdeta.html` 而不同步 source。第三方 vendor 檔的 fingerprint 不應為了讓測試通過而任意重算。
