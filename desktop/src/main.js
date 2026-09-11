/* ============================================================================
 * main.js — Ekdeta 桌面殼主行程
 *
 * 這支要做的事只有四件，任何一件失敗都不能讓 app 開不起來：
 *   1. 用 ekdeta:// 供應目前選定的 HTML 與引擎目錄
 *   2. 注入 bridge，反射 HTML 的選單成原生選單
 *   3. 隱藏 HTML 的假選單列與假紅黃綠燈，讓真的視窗鈕疊在原位
 *   4. 提供「匯入新版 HTML」「安裝引擎」等維護指令
 * ========================================================================== */
'use strict';

const { app, BrowserWindow, Menu, dialog, shell, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');

const store = require('./store');
const proto = require('./protocol');
const menuBuilder = require('./menu');

const SHELL_VERSION = require('../package.json').version;
const DEV = process.argv.includes('--dev');

/* ★ 明確釘死 app 名稱。
   userData 路徑是由 app.getName() 決定的，而 getName() 會隨啟動方式改變：
   `electron .` 讀 package.json 的 productName；直接指定一個 .js 檔啟動時
   會退回內建的 "Electron"；打包後又是另一種。實測（xvfb + npx electron probe.js）
   拿到的是 "Electron"，與 `npm start` 不同 —— 那代表同一台機器上
   使用者的 HTML 版本庫與 232MB 引擎會散在兩個目錄裡，看起來像「檔案不見了」。
   在這裡設一次，所有啟動方式共用同一個資料夾。 */
app.setName('Ekdeta');

let win = null;
let cfg = null;
let lastModel = null;
let lang = 'zh';
let rebuildTimer = null;
let onboardingShownThisSession = false;

function log(...a) { if (DEV) console.log('[shell]', ...a); }

/* ---------- 協定必須在 ready 之前註冊 ---------- */
proto.registerScheme();

/* 單一實例：第二次開啟時把既有視窗叫到前面 */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
}

/* ============================ 視窗 ============================ */
function createWindow() {
  const w = cfg.window || {};
  const opts = {
    width: w.width || 1280,
    height: w.height || 860,
    minWidth: w.minWidth || 940,
    minHeight: w.minHeight || 620,
    backgroundColor: w.backgroundColor || '#f5f5f7',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      /* 產品自己會用 Worker + WASM + IndexedDB，這些在 ekdeta:// (secure) 下都正常 */
      spellcheck: false,
      backgroundThrottling: false
    }
  };

  /* macOS：無邊框內縮標題列，真的紅黃綠燈疊到 HTML 假燈的位置上。
     座標從 HTML 的 CSS 算出（#titlebar 高 46px、.tl 12px → y=17；padding-inline 9px → x=9），
     對不齊就改 shell.config.json，不用改程式。 */
  if (process.platform === 'darwin') {
    opts.titleBarStyle = 'hiddenInset';
    opts.trafficLightPosition = {
      x: (cfg.trafficLightPosition && cfg.trafficLightPosition.x) || 9,
      y: (cfg.trafficLightPosition && cfg.trafficLightPosition.y) || 17
    };
  } else {
    /* Windows / Linux：保留系統標題列。HTML 的假燈仍然隱藏（那是 macOS 的擬態），
       但不做 hiddenInset，因為那兩個平台沒有等價的疊放位置。 */
    opts.autoHideMenuBar = false;
  }

  win = new BrowserWindow(opts);
  win.once('ready-to-show', () => win.show());

  /* 外部連結一律丟給系統瀏覽器，不在 app 內開新視窗 */
  if (cfg.openLinksExternally !== false) {
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) { shell.openExternal(url); }
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (e, url) => {
      if (!url.startsWith(proto.SCHEME + '://')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
    });
  }

  win.webContents.on('did-finish-load', onPageReady);
  win.webContents.on('render-process-gone', (_e, d) => {
    dialog.showErrorBox('頁面當掉了', '原因：' + (d && d.reason) + '\n\n可以用「桌面殼 → HTML 版本」切回上一個版本。');
  });

  win.loadURL(proto.indexUrl());
}

/* ============================ 頁面就緒後的整併 ============================ */
async function onPageReady() {
  if (!win || win.isDestroyed()) return;
  const wc = win.webContents;

  /* 1. 注入 bridge（主世界，才看得到 menuDefs / __CP169A_TEX_PROOF__） */
  try {
    const src = fs.readFileSync(path.join(__dirname, 'bridge.js'), 'utf8');
    await wc.executeJavaScript(src, true);
  } catch (e) {
    log('bridge 注入失敗', e);
  }

  /* 2. 語言（原生選單的殼專屬項目要跟著 HTML 的介面語言走） */
  try {
    const info = await wc.executeJavaScript('__EKDETA_SHELL__.info()', true);
    lang = (info && info.lang) || 'zh';
    if (info && info.appVersion) win.setTitle('Ekdeta ' + info.appVersion);
    log('page info', info);
  } catch (e) {}

  /* 3. 反射選單 —— ★ 必須排在 applyChrome 之前。
     只有確定整併成功，才可以把頁面自己的選單列藏起來；
     反射失敗卻照藏，使用者的選單會整組消失（v0.1.0 實測抓到的缺陷）。 */
  await rebuildMenu();
  const reflected = !!(lastModel && lastModel.ok);

  /* 4. 視窗外框整併 */
  try {
    const c = cfg.chrome || {};
    await wc.executeJavaScript(
      `__EKDETA_SHELL__.applyChrome(${JSON.stringify({
        hideMenubar: reflected && c.hideHtmlMenubar !== false,
        hideTrafficLights: c.hideHtmlTrafficLights !== false,
        dragTitlebar: c.dragTitlebar !== false
      })})`, true);
    if (!reflected) log('選單反射失敗，保留頁面原本的選單列：' + (lastModel && lastModel.reason));
  } catch (e) { log('applyChrome 失敗', e); }

  /* 5. 登記 Electron Engine URL（1.1.7 lazy lifecycle）。
     普通 Markdown 不讀取 199MB data、不建立 Worker；真正進 REVTeX 時才初始化。
     沒裝就安靜略過，不擋一般 Markdown 使用。 */
  if (cfg.engine && cfg.engine.autoLoad !== false) {
    const st = store.engineStatus();
    if (st.installed) autoLoadEngine(true);
    else log('引擎未安裝，略過自動載入');
  }

  if (cfg.devtools || DEV) win.webContents.openDevTools({ mode: 'detach' });

  /* 6. 第一次使用：用原生對話框做最小導引。
     安裝程式只負責把 App 放進 /Applications；Engine Pack 是可選的大檔，
     留到第一次開啟時才問，沒有引擎也能先寫 Markdown / 使用 MathLive。 */
  setTimeout(() => { showOnboarding(false); }, 450);
}

/* ============================ 選單 ============================ */
async function rebuildMenu() {
  if (!win || win.isDestroyed()) return;
  let model = { ok: false, menus: [] };
  try {
    model = await win.webContents.executeJavaScript('__EKDETA_SHELL__.snapshot()', true);
  } catch (e) { log('snapshot 失敗', e); }
  lastModel = model;
  try {
    Menu.setApplicationMenu(menuBuilder.build(model, ctx()));
  } catch (e) {
    log('建選單失敗', e);
    /* 建構失敗也要有可用選單，至少能切版本與離開 */
    Menu.setApplicationMenu(menuBuilder.build({ ok: false, menus: [] }, ctx()));
  }
  log('選單已整併：來源=' + model.source + '，' + (model.menus || []).length + ' 個選單');
}

/* HTML 的指令可能改變勾選狀態（深色模式、語言、各種開關），
   所以每次執行完都排一次重建。合併短時間內的多次呼叫。 */
function scheduleRebuild(delay) {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => { rebuildMenu(); }, delay || 300);
}

/* ============================ 殼的動作 ============================ */
function ctx() {
  return {
    lang,
    nativeEditRoles: cfg.nativeEditRoles || ['cut', 'copy', 'paste'],
    invoke: async (mi, ii, label) => {
      if (!win || win.isDestroyed()) return;
      try {
        const r = await win.webContents.executeJavaScript(
          `__EKDETA_SHELL__.run(${mi},${ii},${JSON.stringify(label || '')})`, true);
        log('invoke', mi, ii, label, '→', r);
      } catch (e) { log('invoke 失敗', e); }
      /* 語言可能剛被切換 → 重讀一次再重建 */
      try {
        const info = await win.webContents.executeJavaScript('__EKDETA_SHELL__.info()', true);
        if (info && info.lang) lang = info.lang;
      } catch (e) {}
      scheduleRebuild(250);
    },
    rebuild: () => rebuildMenu(),
    reload: () => { if (win) win.webContents.reload(); },
    devtools: () => { if (win) win.webContents.toggleDevTools(); },
    importHtml: () => cmdImportHtml(),
    switchVersion: (file) => cmdSwitchVersion(file),
    deleteVersion: () => cmdDeleteVersion(),
    installEngine: () => cmdInstallEngine(),
    removeEngine: () => cmdRemoveEngine(),
    engineStatus: () => cmdEngineStatus(),
    loadEngine: () => autoLoadEngine(false),
    onboarding: () => showOnboarding(true),
    about: () => cmdAbout()
  };
}

async function cmdImportHtml() {
  const r = await dialog.showOpenDialog(win, {
    title: '選擇新版的 Ekdeta 產物',
    filters: [{ name: 'HTML', extensions: ['html', 'htm'] }],
    properties: ['openFile']
  });
  if (r.canceled || !r.filePaths.length) return;

  let res;
  try { res = store.importHtml(r.filePaths[0]); }
  catch (e) { dialog.showErrorBox('匯入失敗', String(e && e.message || e)); return; }

  if (res.problems.length) {
    const ok = await dialog.showMessageBox(win, {
      type: 'warning',
      message: '這份 HTML 有可疑之處，仍要使用嗎？',
      detail: res.problems.map(p => '· ' + p).join('\n') +
        '\n\n（舊版本不會被刪除，隨時可以從「HTML 版本」切回去。）',
      buttons: ['仍然使用', '只匯入不切換', '取消'],
      defaultId: 1, cancelId: 2
    });
    if (ok.response === 2) { store.removeVersion(res.file); return; }
    if (ok.response === 1) { scheduleRebuild(0); return; }
  }
  store.setCurrentName(res.file);
  win.webContents.reload();
}

function cmdSwitchVersion(file) {
  if (file === store.getCurrentName()) return;
  store.setCurrentName(file);
  win.webContents.reload();
}

async function cmdDeleteVersion() {
  const list = store.listVersions();
  if (list.length <= 1) { dialog.showMessageBox(win, { message: '只剩一個版本，不能刪除。' }); return; }
  const labels = list.map(v => v.label + (v.current ? '（使用中）' : ''));
  const r = await dialog.showMessageBox(win, {
    type: 'question', message: '要刪除哪一個版本？',
    detail: '刪除後無法復原（但你本機的原始 HTML 檔還在）。',
    buttons: [...labels, '取消'], cancelId: labels.length
  });
  if (r.response >= labels.length) return;
  const target = list[r.response];
  store.removeVersion(target.file);
  if (target.current) win.webContents.reload();
  else scheduleRebuild(0);
}

async function cmdInstallEngine() {
  const r = await dialog.showOpenDialog(win, {
    title: '選擇 Engine Pack 資料夾（含 busytex.wasm 等 5 個檔）',
    properties: ['openDirectory']
  });
  if (r.canceled || !r.filePaths.length) return;

  /* 引擎動輒 200MB 以上，複製會讓同一台機器留兩份。問一下要不要用移動的。
     預設是「複製」——保守，不動使用者的原始檔。 */
  const how = await dialog.showMessageBox(win, {
    type: 'question',
    message: '要複製還是移動？',
    detail: '複製：你原本的資料夾保持不動，但磁碟上會有兩份（各 200 MB 以上）。\n' +
            '移動：只留一份，原資料夾裡的這 5 個檔會被搬走（其他檔案不動）。',
    buttons: ['複製（保留原檔）', '移動（省空間）', '取消'],
    defaultId: 0, cancelId: 2
  });
  if (how.response === 2) return;

  try {
    const st = store.installEngine(r.filePaths[0], { move: how.response === 1 });
    await dialog.showMessageBox(win, {
      type: 'info', message: '引擎已安裝',
      detail: '共 ' + (st.totalBytes / 1048576).toFixed(0) + ' MB，位置：\n' + st.dir +
        '\n\n下次開啟 app 會自動載入；也可以現在就用「LaTeX 引擎 → 立即載入引擎」。'
    });
    scheduleRebuild(0);
  } catch (e) {
    dialog.showErrorBox('安裝失敗', String(e && e.message || e));
  }
}

async function cmdRemoveEngine() {
  const r = await dialog.showMessageBox(win, {
    type: 'warning', message: '確定要移除已安裝的引擎？',
    detail: '會刪掉 ' + store.engineDir() + ' 底下的 5 個引擎檔。你原本的 Engine Pack 不受影響。',
    buttons: ['移除', '取消'], defaultId: 1, cancelId: 1
  });
  if (r.response !== 0) return;
  store.removeEngine();
  scheduleRebuild(0);
}

async function cmdEngineStatus() {
  const st = store.engineStatus();
  let page = { ok: false };
  try { page = await win.webContents.executeJavaScript('__EKDETA_SHELL__.engineState()', true); } catch (e) {}
  const lines = [
    '安裝目錄：' + st.dir,
    '狀態：' + (st.installed ? '5 個檔齊全（' + (st.totalBytes / 1048576).toFixed(1) + ' MB）' : '缺 ' + st.missing.join('、')),
    st.wrong.length ? '大小不符：' + st.wrong.join('、') : '',
    '',
    '頁面內引擎：' + (page && page.ok
      ? (page.state.initialized ? '已初始化' : '未初始化') + '（busy=' + page.state.busy + '，transport=' + (page.state.engineTransport || 'unknown') + '）'
      : '尚未取得（' + (page && page.reason) + '）')
  ].filter(Boolean);
  dialog.showMessageBox(win, { type: 'info', message: 'LaTeX 引擎狀態', detail: lines.join('\n') });
}

async function autoLoadEngine(quiet) {
  if (!win || win.isDestroyed()) return;
  const base = (cfg.engine && cfg.engine.base) || './engine/';
  try {
    const r = await win.webContents.executeJavaScript(
      `__EKDETA_SHELL__.engineAutoLoad(${JSON.stringify(base)})`, true);
    log('engine autoload', r);
    if (!quiet) {
      const deferred = !!(r && r.ok && r.deferred);
      dialog.showMessageBox(win, {
        type: r && r.ok ? 'info' : 'warning',
        message: deferred ? '引擎已登記' : (r && r.ok ? '引擎載入完成' : '引擎載入失敗'),
        detail: deferred ? '一般 Markdown 不載入 TeX Worker；進入「國際期刊 REVTeX 4.2」並需要編譯時會自動驗證與初始化。'
                         : (r && r.ok ? '可以直接編譯了。' : String(r && r.reason || '未知原因'))
      });
    }
  } catch (e) {
    if (!quiet) dialog.showErrorBox('引擎載入失敗', String(e && e.message || e));
  }
}

async function showOnboarding(force) {
  if (!win || win.isDestroyed()) return;
  if (!force && onboardingShownThisSession) return;
  const state = store.onboardingState();
  if (!force && state.completed) return;
  onboardingShownThisSession = true;

  const zh = lang !== 'en';
  const T = (a, b) => (zh ? a : b);
  const eng = store.engineStatus();
  const htmlName = store.getCurrentName() || T('目前 HTML', 'current HTML');

  if (eng.installed) {
    const done = await dialog.showMessageBox(win, {
      type: 'info',
      message: T('歡迎使用 Ekdeta', 'Welcome to Ekdeta'),
      detail: T(
        '程式已可使用，LaTeX 引擎也已安裝。\n\n目前版本：' + htmlName +
        '\n\n之後要更新程式內容，不必重新安裝 App：從「桌面殼 → HTML 版本 → 匯入新版 HTML…」即可。',
        'The app is ready and the LaTeX engine is installed.\n\nCurrent version: ' + htmlName +
        '\n\nFuture HTML updates do not require reinstalling the app; use Shell → HTML Versions → Import New HTML….'
      ),
      buttons: [T('開始使用', 'Start Using')],
      checkboxLabel: T('之後不再自動顯示這個導引', 'Do not show this guide automatically again'),
      checkboxChecked: true
    });
    if (done.checkboxChecked || force) store.markOnboardingDone({ engineInstalled: true });
    return;
  }

  const r = await dialog.showMessageBox(win, {
    type: 'info',
    message: T('歡迎使用 Ekdeta', 'Welcome to Ekdeta'),
    detail: T(
      '一般 Markdown、表格、MathLive 公式可以直接使用，不需要先裝任何東西。\n\n' +
      '只有在要編譯 REVTeX / LaTeX PDF 時才需要 Engine Pack。你現在可以安裝，也可以先開始寫作。\n\n' +
      '目前版本：' + htmlName,
      'Markdown, tables and MathLive formulas work immediately.\n\n' +
      'The Engine Pack is only required for compiling REVTeX / LaTeX PDFs. You can install it now or start writing first.\n\n' +
      'Current version: ' + htmlName
    ),
    buttons: [
      T('安裝 LaTeX 引擎…', 'Install LaTeX Engine…'),
      T('先開始使用', 'Start Using'),
      T('稍後提醒', 'Remind Me Later')
    ],
    defaultId: 1,
    cancelId: 2,
    checkboxLabel: T('之後不再自動顯示這個導引', 'Do not show this guide automatically again'),
    checkboxChecked: false
  });

  if (r.response === 0) {
    await cmdInstallEngine();
    const after = store.engineStatus();
    if (after.installed) {
      store.markOnboardingDone({ engineInstalled: true });
      await dialog.showMessageBox(win, {
        type: 'info',
        message: T('設定完成', 'Setup Complete'),
        detail: T('LaTeX 引擎已安裝。下次開啟會自動載入。', 'The LaTeX engine is installed and will auto-load next time.'),
        buttons: [T('開始使用', 'Start Using')]
      });
    }
    return;
  }

  if (r.response === 1 || r.checkboxChecked) {
    store.markOnboardingDone({ engineInstalled: false, skippedEngine: true });
  }
  /* 「稍後提醒」且未勾選時不寫 completed；下次啟動再問。 */
}

function cmdAbout() {
  const st = store.engineStatus();
  dialog.showMessageBox(win, {
    type: 'info',
    message: 'Ekdeta 桌面殼 v' + SHELL_VERSION,
    detail: [
      'Electron ' + process.versions.electron + '　Chromium ' + process.versions.chrome,
      '',
      '目前 HTML：' + (store.getCurrentName() || '（無）'),
      'HTML 版本庫：' + store.htmlDir(),
      '引擎：' + (st.installed ? '已安裝' : '未安裝') + '　' + store.engineDir(),
      '選單整併來源：' + (lastModel && lastModel.source || '—'),
      '',
      '這個殼不修改 HTML，只做外圍整併。換一份新的 HTML 用「桌面殼 → HTML 版本 → 匯入新版 HTML…」。'
    ].join('\n')
  });
}

/* ============================ 生命週期 ============================ */
app.whenReady().then(() => {
  cfg = store.loadConfig();
  store.ensureDirs();
  const seeded = store.seedDefaultHtml();
  if (seeded) log('已植入出廠 HTML：' + seeded);

  proto.install(log);
  nativeTheme.themeSource = 'system';
  createWindow();

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
