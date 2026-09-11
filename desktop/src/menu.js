/* ============================================================================
 * menu.js — 把 HTML 的選單模型轉成原生選單
 *
 * 核心約定：這裡**不寫死任何一個選單項**。整份原生選單都是從 bridge.snapshot()
 * 拿到的資料模型長出來的，所以換一份 HTML（多了選單、少了選單、改了文字、
 * 換成英文介面）原生選單自動跟著變，殼一行都不用改。
 *
 * 只有兩類項目是殼自己加的：
 *   1. 原生編輯角色（cut/copy/paste）——Electron 在 macOS 上非有不可，否則
 *      系統剪貼簿快捷鍵完全失效，而 HTML 的「編輯」選單裡沒有這三項。
 *   2. 「桌面殼」選單——匯入 HTML、切換版本、安裝引擎這些殼專屬功能。
 * ========================================================================== */
'use strict';

const { Menu, MenuItem, app, shell } = require('electron');
const path = require('path');
const store = require('./store');

const IS_MAC = process.platform === 'darwin';

/* ---------- 快捷鍵字串轉換 ----------
 * HTML 用 macOS 符號寫快捷鍵（'⇧⌘S'、'⌥⌘F'、'⌘N*'）。
 * ★ 一律搭配 registerAccelerator:false 使用——只借 Electron 把符號畫在選單右邊，
 *   **不真的綁定**。因為 HTML 自己已經在 keydown 綁過同一組鍵，
 *   原生再綁一次會讓每個指令觸發兩次。
 */
const MOD = { '⌘': 'Command', '⇧': 'Shift', '⌥': 'Alt', '⌃': 'Control' };
const NAMED = {
  '↩': 'Return', '⏎': 'Return', '⌫': 'Backspace', '⌦': 'Delete', '⎋': 'Escape',
  '⇥': 'Tab', '␣': 'Space', '←': 'Left', '→': 'Right', '↑': 'Up', '↓': 'Down'
};

function toAccelerator(key) {
  if (!key) return null;
  let s = String(key).trim().replace(/\*+$/, '');   // 尾端星號是 HTML 自己的註記
  if (!s) return null;
  const mods = [];
  let i = 0;
  while (i < s.length && MOD[s[i]]) { mods.push(MOD[s[i]]); i++; }
  let rest = s.slice(i).trim();
  if (!rest) return null;
  if (NAMED[rest]) rest = NAMED[rest];
  else if (rest.length === 1) rest = rest.toUpperCase();
  else if (!/^[A-Za-z0-9]+$/.test(rest)) return null;   // 認不得就不顯示，別讓建構失敗
  if (!mods.length) return null;                        // 沒有修飾鍵的不放進選單
  return mods.concat(rest).join('+');
}

/* ---------- 從模型長出一個 submenu ---------- */
function itemsToTemplate(menuIndex, items, invoke) {
  const out = [];
  for (const it of items) {
    if (it.sep) { out.push({ type: 'separator' }); continue; }
    const label = (it.label || '').trim();
    if (!label) continue;
    const acc = toAccelerator(it.key);
    const entry = {
      label: it.checked ? '✓ ' + label : label,
      enabled: it.enabled !== false,
      click: () => invoke(menuIndex, it.index, label)
    };
    if (acc) { entry.accelerator = acc; entry.registerAccelerator = false; }
    out.push(entry);
  }
  return out;
}

/* 為什麼勾選狀態用 '✓ ' 前綴而不是 type:'checkbox'：
   checkbox 型別的項目在 macOS 上點下去會由 Electron 自己切換視覺狀態，
   但真正的狀態在 HTML 的 settings 裡，兩邊會不同步。用前綴 + 每次執行後
   重建選單，顯示的永遠是 HTML 當下的真實狀態。 */

/* ---------- 殼自己的選單 ---------- */
function shellMenu(ctx) {
  const versions = store.listVersions();
  const eng = store.engineStatus();
  const zh = ctx.lang !== 'en';
  const T = (a, b) => (zh ? a : b);

  const versionItems = versions.length ? versions.map(v => ({
    label: v.label + (v.current ? '　（使用中）' : ''),
    type: 'radio',
    checked: !!v.current,
    click: () => ctx.switchVersion(v.file)
  })) : [{ label: T('（版本庫是空的）', '(no versions yet)'), enabled: false }];

  const engLabel = eng.installed
    ? T('引擎已安裝（' + (eng.totalBytes / 1048576).toFixed(0) + ' MB）',
        'Engine installed (' + (eng.totalBytes / 1048576).toFixed(0) + ' MB)')
    : T('引擎尚未安裝（缺 ' + eng.missing.length + ' 個檔）',
        'Engine not installed (' + eng.missing.length + ' missing)');

  return {
    label: T('桌面殼', 'Shell'),
    submenu: [
      { label: T('初始設定…', 'Initial Setup…'), click: () => ctx.onboarding() },
      { type: 'separator' },
      {
        label: T('HTML 版本', 'HTML Versions'),
        submenu: [
          { label: T('匯入新版 HTML…', 'Import New HTML…'), click: () => ctx.importHtml() },
          { type: 'separator' },
          ...versionItems,
          { type: 'separator' },
          { label: T('刪除版本…', 'Delete Version…'), click: () => ctx.deleteVersion() },
          { label: T('開啟 HTML 資料夾', 'Open HTML Folder'), click: () => shell.openPath(store.htmlDir()) }
        ]
      },
      {
        label: T('LaTeX 引擎', 'LaTeX Engine'),
        submenu: [
          { label: engLabel, enabled: false },
          { type: 'separator' },
          { label: T('安裝 Engine Pack…', 'Install Engine Pack…'), click: () => ctx.installEngine() },
          { label: T('立即載入引擎', 'Load Engine Now'), enabled: eng.installed, click: () => ctx.loadEngine() },
          { label: T('引擎狀態…', 'Engine Status…'), click: () => ctx.engineStatus() },
          { type: 'separator' },
          { label: T('開啟引擎資料夾', 'Open Engine Folder'), click: () => shell.openPath(store.engineDir()) },
          { label: T('移除引擎…', 'Remove Engine…'), enabled: eng.installed, click: () => ctx.removeEngine() }
        ]
      },
      { type: 'separator' },
      { label: T('重新載入頁面', 'Reload Page'), accelerator: 'Alt+Command+R', click: () => ctx.reload() },
      { label: T('開發者工具', 'Developer Tools'), accelerator: 'Alt+Command+I', click: () => ctx.devtools() },
      { type: 'separator' },
      { label: T('重新整併選單', 'Rebuild Native Menu'), click: () => ctx.rebuild() },
      { label: T('開啟設定檔', 'Open Config File'), click: () => shell.openPath(store.configPath()) },
      { label: T('開啟資料夾', 'Open Data Folder'), click: () => shell.openPath(store.userDir()) },
      { type: 'separator' },
      { label: T('關於桌面殼…', 'About Shell…'), click: () => ctx.about() }
    ]
  };
}

/* ---------- 主要入口 ---------- */
/**
 * @param {object} model  bridge.snapshot() 的結果
 * @param {object} ctx    殼提供的動作集合
 */
function build(model, ctx) {
  const zh = ctx.lang !== 'en';
  const T = (a, b) => (zh ? a : b);
  const menus = (model && model.ok && Array.isArray(model.menus)) ? model.menus : [];
  const template = [];

  /* --- 1. App 選單（macOS 第一個選單一定是 app 名稱） --- */
  const appDef = menus.find(m => m.app) || null;
  const appItems = appDef ? itemsToTemplate(appDef.index, appDef.items, ctx.invoke) : [];
  if (IS_MAC) {
    template.push({
      label: app.name,
      submenu: [
        ...appItems,
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: T('隱藏 ' + app.name, 'Hide ' + app.name) },
        { role: 'hideOthers', label: T('隱藏其他', 'Hide Others') },
        { role: 'unhide', label: T('全部顯示', 'Show All') },
        { type: 'separator' },
        { role: 'quit', label: T('結束 ' + app.name, 'Quit ' + app.name) }
      ]
    });
  } else if (appItems.length) {
    template.push({ label: appDef ? appDef.label : app.name, submenu: [...appItems, { type: 'separator' }, { role: 'quit' }] });
  }

  /* --- 2. HTML 的其餘選單，原樣照搬 --- */
  for (const m of menus) {
    if (m.app) continue;
    const sub = itemsToTemplate(m.index, m.items, ctx.invoke);

    /* 「編輯」選單補原生剪貼簿角色。
       ★ 這是 Electron 在 macOS 上的硬性要求：沒有帶 role 的選單項，
         ⌘X／⌘C／⌘V 完全不會作用。HTML 的編輯選單裡剛好沒有這三項
         （它只有「貼上為純文字」「複製為 Markdown」等衍生指令），
         所以補進去不會與任何既有快捷鍵衝突。
       ★ 刻意不補 undo/redo/selectAll——HTML 自己綁了 ⌘Z／⇧⌘Z／⌘A，
         再補會觸發兩次。 */
    const isEdit = /^(編輯|Edit)$/.test((m.label || '').trim());
    if (isEdit && Array.isArray(ctx.nativeEditRoles) && ctx.nativeEditRoles.length) {
      const roles = ctx.nativeEditRoles.map(r => ({ role: r }));
      sub.unshift(...roles, { type: 'separator' });
    }

    if (!sub.length) continue;
    template.push({ label: m.label || '(?)', submenu: sub });
  }

  /* --- 3. 殼自己的選單 --- */
  template.push(shellMenu(ctx));

  /* --- 4. 視窗選單（macOS 慣例；HTML 沒有對應概念） --- */
  if (IS_MAC) {
    template.push({
      role: 'windowMenu',
      label: T('視窗', 'Window')
    });
  }

  /* --- 5. 完全反射失敗時的保底 --- */
  if (!menus.length) {
    template.unshift({
      label: T('⚠️ 選單未整併', '⚠️ Menu not reflected'),
      submenu: [{
        label: T('讀不到 HTML 的選單，已保留頁面原本的選單列', 'Could not read the HTML menu; the in-page menubar is kept'),
        enabled: false
      }]
    });
  }

  return Menu.buildFromTemplate(template);
}

module.exports = { build, toAccelerator, IS_MAC };
