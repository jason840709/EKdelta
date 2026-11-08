/* ============================================================================
 * profile.js — 決定使用者資料夾與網頁協定（EKdelta 1.2.7 起）
 *
 * 產品改名為 EKdelta，但不搬任何檔案：
 *   - 已經裝過舊版的人，沿用原本的使用者資料夾（文件版本庫、引擎、設定都在裡面）；
 *   - 也沿用那個資料夾原本的網頁協定。瀏覽器儲存區（使用者寫的文件、偏好設定）
 *     綁在「協定＋主機」這個來源上，換了協定，舊文件就讀不到。
 *
 * 依序找：
 *   1. 環境變數 EKDELTA_USER_DATA（測試用，可再用 EKDELTA_SCHEME 指定協定）
 *   2. EKdelta        → ekdeta://（新安裝；協定沿用程式內部名稱 ekdeta）
 *   3. Ekdeta         → ekdeta://（1.1.x–1.2.6 的桌面版）
 *   4. Typora HTML    → typora://（更早的 Typora HTML 外殼，0.2.x）
 *   5. 都沒有：新建 EKdelta，用 ekdeta://
 * 「存在」的判斷是資料夾裡有 html/、engine/ 或 Local Storage/ 其中之一，空資料夾不算。
 * 這個模組只讀檔案系統，不建立、不搬移、不改寫任何東西。
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const CANDIDATES = [
  { name: 'EKdelta', scheme: 'ekdeta' },
  { name: 'Ekdeta', scheme: 'ekdeta' },
  { name: 'Typora HTML', scheme: 'typora' },
];

function used(dir) {
  try {
    return ['html', 'engine', 'Local Storage'].some(n => fs.existsSync(path.join(dir, n)));
  } catch (_) { return false; }
}

/* appData：macOS 是 ~/Library/Application Support。必須在 app ready 之前呼叫。 */
function resolve(appData) {
  const env = process.env.EKDELTA_USER_DATA;
  if (env) return { dir: env, scheme: process.env.EKDELTA_SCHEME || 'ekdeta', source: 'env' };
  for (const c of CANDIDATES) {
    const dir = path.join(appData, c.name);
    if (used(dir)) return { dir, scheme: c.scheme, source: c.name };
  }
  return { dir: path.join(appData, 'EKdelta'), scheme: 'ekdeta', source: 'new' };
}

module.exports = { resolve, CANDIDATES };
