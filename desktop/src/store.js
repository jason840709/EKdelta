/* ============================================================================
 * store.js — 使用者資料層
 *
 * 為什麼 HTML 與引擎都放在 userData 而不是 app 內：
 *   1. 引擎 232MB。塞進 app 會讓安裝檔破 250MB，而且**每換一次 HTML 就要重打包**
 *      才能連引擎一起帶走。放 userData 的話引擎只裝一次，之後換幾百次 HTML 都不用碰。
 *   2. app 目錄在 macOS 上是唯讀的（簽章後更是不能寫），使用者匯入的 HTML 沒地方放。
 *
 * 目錄結構：
 *   <userData>/
 *     shell.config.json     ← 從 resources 複製過來，之後使用者自己改
 *     html/
 *       1.1.5.8.html
 *       1.1.5.9.html
 *       current.json        ← { "file": "1.1.5.9.html", "importedAt": "..." }
 *     engine/
 *       busytex.js / busytex.wasm / busytex_pipeline.js /
 *       texlive-recommended.js / texlive-recommended.data
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/* 引擎包必備檔案。清單與位元組數抄自產品 HTML 內的 EXPECTED 常數（CP169A-P2）。
   Shell 先做檔名＋大小健檢；產品 HTML 仍會再做逐檔 SHA-256 權威驗證。 */
const ENGINE_FILES = [
  { name: 'busytex.js', bytes: 271047 },
  { name: 'busytex.wasm', bytes: 32501975 },
  { name: 'busytex_pipeline.js', bytes: 33701 },
  { name: 'texlive-recommended.js', bytes: 3885771 },
  { name: 'texlive-recommended.data', bytes: 199273688 }
];

function userDir() { return app.getPath('userData'); }
function htmlDir() { return path.join(userDir(), 'html'); }
function engineDir() { return path.join(userDir(), 'engine'); }
function configPath() { return path.join(userDir(), 'shell.config.json'); }
function onboardingPath() { return path.join(userDir(), 'onboarding.json'); }
function currentPath() { return path.join(htmlDir(), 'current.json'); }

function ensureDirs() {
  for (const d of [userDir(), htmlDir(), engineDir()]) {
    try { fs.mkdirSync(d, { recursive: true }); } catch (e) {}
  }
}

/* ---------- 設定檔 ---------- */
function defaultConfigPath() {
  return path.join(__dirname, '..', 'resources', 'shell.config.json');
}

function loadConfig() {
  ensureDirs();
  if (!fs.existsSync(configPath())) {
    try { fs.copyFileSync(defaultConfigPath(), configPath()); } catch (e) {}
  }
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(configPath(), 'utf8')); }
  catch (e) {
    try { cfg = JSON.parse(fs.readFileSync(defaultConfigPath(), 'utf8')); } catch (e2) { cfg = {}; }
  }
  /* 缺欄位一律補預設，使用者手改壞了也不會讓 app 開不起來 */
  cfg.window = Object.assign({ width: 1280, height: 860, minWidth: 940, minHeight: 620, backgroundColor: '#f5f5f7' }, cfg.window);
  cfg.trafficLightPosition = Object.assign({ x: 9, y: 17 }, cfg.trafficLightPosition);
  cfg.chrome = Object.assign({ hideHtmlMenubar: true, hideHtmlTrafficLights: true, dragTitlebar: true }, cfg.chrome);
  cfg.engine = Object.assign({ autoLoad: true, base: './engine/', quiet: true }, cfg.engine);
  if (!Array.isArray(cfg.nativeEditRoles)) cfg.nativeEditRoles = ['cut', 'copy', 'paste'];
  return cfg;
}

/* ---------- HTML 版本庫 ---------- */

/* 從 HTML 內容抓版本號。單一事實來源是 build.py 的 APP_VERSION，
   它在產物裡長這樣：const APP_VERSION = '1.1.5.8';  */
function versionFromHtml(text) {
  const m = /APP_VERSION\s*=\s*['"]([0-9][0-9A-Za-z.\-]*)['"]/.exec(text);
  if (m) return m[1];
  const m2 = /content\s*=\s*['"]([0-9]+\.[0-9][0-9A-Za-z.\-]*)['"]/.exec(text);
  return m2 ? m2[1] : '';
}

/* 匯入前健檢：擋掉「選錯檔案」這種最常見的意外，避免 app 載入後一片空白。 */
function inspectHtml(text) {
  const problems = [];
  if (!/<html[\s>]/i.test(text)) problems.push('看起來不是 HTML 檔（找不到 <html>）');
  if (!/id="menubar"/.test(text)) problems.push('找不到 id="menubar"，這可能不是 EKdelta 的產物');
  if (!/APP_VERSION/.test(text)) problems.push('找不到 APP_VERSION');
  if (text.length < 200 * 1024) problems.push('檔案異常地小（' + Math.round(text.length / 1024) + ' KB），可能不是完整產物');
  return { version: versionFromHtml(text), problems };
}

function listVersions() {
  ensureDirs();
  let names = [];
  try {
    names = fs.readdirSync(htmlDir()).filter(n => n.toLowerCase().endsWith('.html'));
  } catch (e) { names = []; }
  const cur = getCurrentName();
  return names.sort().map(n => {
    let size = 0, mtime = 0;
    try { const st = fs.statSync(path.join(htmlDir(), n)); size = st.size; mtime = st.mtimeMs; } catch (e) {}
    return { file: n, label: n.replace(/\.html$/i, ''), size, mtime, current: n === cur };
  });
}

function getCurrentName() {
  try {
    const j = JSON.parse(fs.readFileSync(currentPath(), 'utf8'));
    if (j && j.file && fs.existsSync(path.join(htmlDir(), j.file))) return j.file;
  } catch (e) {}
  /* current.json 壞掉或指到不存在的檔 → 退回「檔名排序最後一個」，不讓 app 開不起來 */
  try {
    const names = fs.readdirSync(htmlDir()).filter(n => n.toLowerCase().endsWith('.html')).sort();
    if (names.length) return names[names.length - 1];
  } catch (e) {}
  return '';
}

function setCurrentName(file) {
  ensureDirs();
  fs.writeFileSync(currentPath(), JSON.stringify({ file, switchedAt: new Date().toISOString() }, null, 2), 'utf8');
}

function currentHtmlPath() {
  const n = getCurrentName();
  return n ? path.join(htmlDir(), n) : '';
}

/* 首次啟動：把出廠附帶的 HTML 複製進版本庫 */
function seedDefaultHtml() {
  ensureDirs();
  if (listVersions().length) return null;
  const src = path.join(__dirname, '..', 'resources', 'default', 'app.html');
  if (!fs.existsSync(src)) return null;
  let text = '';
  try { text = fs.readFileSync(src, 'utf8'); } catch (e) { return null; }
  const v = versionFromHtml(text) || 'default';
  const dest = path.join(htmlDir(), v + '.html');
  try { fs.copyFileSync(src, dest); setCurrentName(path.basename(dest)); return path.basename(dest); }
  catch (e) { return null; }
}

/* 匯入一份新的 HTML。同版本號已存在時自動加尾碼，不覆蓋舊的（做錯要能退回）。 */
function importHtml(srcPath) {
  ensureDirs();
  const text = fs.readFileSync(srcPath, 'utf8');
  const info = inspectHtml(text);
  const base = info.version || path.basename(srcPath).replace(/\.html?$/i, '');
  let name = base + '.html';
  let n = 2;
  while (fs.existsSync(path.join(htmlDir(), name))) { name = base + '(' + n + ').html'; n++; }
  fs.copyFileSync(srcPath, path.join(htmlDir(), name));
  return { file: name, version: info.version, problems: info.problems };
}

function removeVersion(file) {
  const p = path.join(htmlDir(), file);
  if (!fs.existsSync(p)) return false;
  fs.unlinkSync(p);
  if (getCurrentName() === file) {
    const rest = listVersions();
    if (rest.length) setCurrentName(rest[rest.length - 1].file);
  }
  return true;
}

/* ---------- 引擎 ---------- */
function engineStatus() {
  ensureDirs();
  const missing = [];
  const differs = [];
  let total = 0;
  for (const f of ENGINE_FILES) {
    const p = path.join(engineDir(), f.name);
    if (!fs.existsSync(p)) { missing.push(f.name); continue; }
    const st = fs.statSync(p);
    total += st.size;
    if (st.size !== f.bytes) differs.push({ name: f.name, actual: st.size, reference: f.bytes });
  }
  return {
    installed: missing.length === 0 && differs.length === 0,
    present: missing.length === 0,
    missing,
    differs,
    wrong: differs.map(d => d.name + '（' + d.actual + ' ≠ ' + d.reference + '）'),
    totalBytes: total,
    dir: engineDir()
  };
}

/* 從使用者指定的資料夾安裝引擎。允許來源是引擎資料夾本身，
   也允許是包著 engine/ 的上層資料夾（交接包常見結構）。 */
function findEngineSource(dir) {
  /* Full-only 正式線：來源資料夾必須五檔齊全且位元組數吻合。
     SHA-256 仍由產品 HTML 在載入時做第二層權威驗證。 */
  const has = d => ENGINE_FILES.every(f => { const p=path.join(d,f.name); try{return fs.existsSync(p)&&fs.statSync(p).size===f.bytes;}catch(_){return false;} });
  if (has(dir)) return dir;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return null; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const sub = path.join(dir, e.name);
    if (has(sub)) return sub;
    /* 再往下一層找（.../03_Engine_Pack/engine/） */
    let subs = [];
    try { subs = fs.readdirSync(sub, { withFileTypes: true }); } catch (e2) { continue; }
    for (const s of subs) {
      if (s.isDirectory() && has(path.join(sub, s.name))) return path.join(sub, s.name);
    }
  }
  return null;
}

/**
 * 安裝引擎。
 * @param {string}  fromDir  來源資料夾（可以是 engine/ 本身或其上兩層）
 * @param {object}  opt      { move: boolean }  move=true 時用移動，避免同一台機器留兩份 232MB
 */
function installEngine(fromDir, opt, onProgress) {
  opt = opt || {};
  const src = findEngineSource(fromDir);
  if (!src) throw new Error('這個資料夾裡找不到完整且大小正確的 Full Engine Pack（需要 5 個檔：' +
    ENGINE_FILES.map(f => f.name).join('、') + '）');
  if (path.resolve(src) === path.resolve(engineDir())) return engineStatus();
  ensureDirs();
  let done = 0;
  for (const f of ENGINE_FILES) {
    const from = path.join(src, f.name);
    const to = path.join(engineDir(), f.name);
    if (opt.move) {
      /* 跨磁碟時 rename 會失敗（EXDEV），退回「複製後刪除來源」。
         ★ 刪除只針對「我們剛剛成功複製過去的那一個檔」，
           不會去動來源資料夾裡的其他任何東西。 */
      try { fs.renameSync(from, to); }
      catch (e) { fs.copyFileSync(from, to); fs.unlinkSync(from); }
    } else {
      fs.copyFileSync(from, to);
    }
    done++;
    if (onProgress) onProgress(done, ENGINE_FILES.length, f.name);
  }
  return engineStatus();
}

function removeEngine() {
  for (const f of ENGINE_FILES) {
    const p = path.join(engineDir(), f.name);
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) {}
  }
  return engineStatus();
}

/* ---------- 初次使用導引 ----------
 * 導引狀態放在 userData，而不是綁在某一份 HTML；換 HTML 版本不會重新跳。
 * 使用者仍可從「桌面殼 → 初始設定…」手動重新開啟。 */
function onboardingState() {
  ensureDirs();
  try {
    const x = JSON.parse(fs.readFileSync(onboardingPath(), 'utf8'));
    return Object.assign({ completed: false, completedAt: null }, x || {});
  } catch (e) {
    return { completed: false, completedAt: null };
  }
}

function markOnboardingDone(extra) {
  ensureDirs();
  const state = Object.assign({
    completed: true,
    completedAt: new Date().toISOString()
  }, extra || {});
  fs.writeFileSync(onboardingPath(), JSON.stringify(state, null, 2), 'utf8');
  return state;
}

function resetOnboarding() {
  try { if (fs.existsSync(onboardingPath())) fs.unlinkSync(onboardingPath()); } catch (e) {}
  return onboardingState();
}

module.exports = {
  ENGINE_FILES,
  userDir, htmlDir, engineDir, configPath, onboardingPath, ensureDirs,
  loadConfig, defaultConfigPath,
  versionFromHtml, inspectHtml,
  listVersions, getCurrentName, setCurrentName, currentHtmlPath,
  seedDefaultHtml, importHtml, removeVersion,
  engineStatus, installEngine, removeEngine, findEngineSource,
  onboardingState, markOnboardingDone, resetOnboarding
};
