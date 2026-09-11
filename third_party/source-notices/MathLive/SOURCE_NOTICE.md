# MathLive 0.110.0 來源／封裝邊界

產品內 upstream source：

`08_測試工具/CP171_建置系統_v1.1.5.9.1/modules/cp171-58a-mathlive-vendor.js`

該 module 前 6 行是本專案 provenance 註解；其後 MathLive payload 的 SHA-256 必須為：

`e99e6d2fa19137e9abf13b58f34cc5d2455cea5067b8cd4018c270825caf1c27`

來源註明為 MathLive 0.110.0 / MIT。正式 Core 不收入 npm `node_modules/`、音效、重複字型或可重新下載的整包；只保存實際產品需要的 vendor source，以及能驗它來源完整性的 hash。

單檔 HTML 的 inline asset-base 需求**不直接修改 upstream source**。建置時由 `build.py::module_build_source()` 做一個 exact adapter；built manifest 會同時記 upstream / built hash。
