/* ============================================================================
 * bridge.js — 注入到 renderer 主世界的橋接層
 *
 * 設計原則：殼不認識 HTML 的內容。
 *   這一層的工作是「反射」——從執行中的頁面把選單資料模型讀出來交給主行程，
 *   再把主行程的點擊指令送回去執行。HTML 換一份，這裡完全不用改。
 *
 * 為什麼用 executeJavaScript 注入而不是 preload：
 *   preload 在 contextIsolation 下跑在隔離世界，看不到頁面的 menuDefs / TT /
 *   __CP169A_TEX_PROOF__ 這些主世界全域。executeJavaScript 直接在主世界執行，
 *   反射才拿得到東西。
 *
 * 三層 fallback（見計畫書 §3.3）：
 *   L1 window.menuDefs()  — 完整資料模型（含勾選狀態與快捷鍵字串）
 *   L2 DOM 模擬開啟       — menuDefs 改名時的備援
 *   L3 不整併             — 兩層都失敗就保留 HTML 原本的選單列，app 照樣能用
 * ========================================================================== */
(function () {
  'use strict';

  if (window.__EKDETA_SHELL__ && window.__EKDETA_SHELL__.__v === 1) return 'already';

  var STYLE_ID = 'ekdeta-shell-chrome';

  /* ---------- 小工具 ---------- */
  function txt(v) {
    if (v === null || v === undefined) return '';
    return String(v);
  }

  /* 選單項的顯示文字可能帶 HTML（例如 `　└ 前綴`），這裡只做安全轉純文字 */
  function plain(v) {
    var s = txt(v);
    if (s.indexOf('<') < 0) return s;
    var d = document.createElement('div');
    d.innerHTML = s;
    return d.textContent || '';
  }

  /* ---------- L1：從 menuDefs() 反射 ---------- */
  function readViaMenuDefs() {
    if (typeof window.menuDefs !== 'function') return null;
    var defs;
    try { defs = window.menuDefs(); } catch (e) { return null; }
    if (!Array.isArray(defs) || !defs.length) return null;

    var menus = defs.map(function (def, i) {
      var items = Array.isArray(def && def.items) ? def.items : [];
      return {
        index: i,
        label: plain(def && def.label),
        app: !!(def && def.app),
        items: items.map(function (it, j) {
          if (it && it.sep) return { index: j, sep: true };
          return {
            index: j,
            label: plain(it && it.t),
            key: txt(it && it.key),
            checked: !!(it && it.check),
            enabled: !(it && it.disabled),
            runnable: !!(it && typeof it.cmd === 'function')
          };
        })
      };
    });
    return { source: 'menuDefs', menus: menus };
  }

  /* ---------- L2：從 DOM 反射（模擬開啟每個選單）---------- */
  function readViaDom() {
    var bar = document.getElementById('menubar');
    if (!bar) return null;
    var tops = [].slice.call(bar.querySelectorAll('.mb-item'));
    if (!tops.length) return null;

    var menus = [];
    for (var i = 0; i < tops.length; i++) {
      var el = tops[i];
      var opened = false;
      try { el.click(); opened = true; } catch (e) { /* 開不起來就當空選單 */ }

      var dd = document.querySelector('.dropdown');
      /* ★ 第一個選單就點不出下拉 → 這個頁面的選單機制與我們預期的不同，
         整個 L2 放棄，讓 snapshot 退到 L3（保留頁面原本的選單列）。
         實測發現的必要防線：產品的 toggleMenu() 內部自己會呼叫 menuDefs()，
         所以「menuDefs 不見了」的情境下 L2 一定也開不出下拉；
         若不在這裡放棄，會回傳 9 個標題但 0 個項目的空殼選單，
         主行程照樣把頁面選單列藏掉 —— 使用者的選單就全部消失了。 */
      if (i === 0 && !dd) return null;
      var items = [];
      if (dd) {
        var rows = [].slice.call(dd.children);
        for (var j = 0; j < rows.length; j++) {
          var r = rows[j];
          if (r.classList.contains('dd-sep')) { items.push({ index: j, sep: true }); continue; }
          var keyEl = r.querySelector('.dd-key');
          var checkEl = r.querySelector('.dd-check');
          var labelEl = r.querySelector('span:not(.dd-key):not(.dd-check)');
          items.push({
            index: j,
            label: (labelEl ? labelEl.textContent : r.textContent) || '',
            key: keyEl ? keyEl.textContent : '',
            checked: !!checkEl,
            enabled: !r.classList.contains('disabled'),
            runnable: true
          });
        }
      }
      menus.push({
        index: i,
        label: (el.textContent || '').trim(),
        app: el.classList.contains('appname'),
        items: items
      });
      if (opened) { try { document.body.click(); } catch (e) {} }
    }
    /* 收尾：確保沒有殘留開啟的下拉 */
    try {
      [].slice.call(document.querySelectorAll('.dropdown')).forEach(function (d) { d.remove(); });
      [].slice.call(document.querySelectorAll('.mb-item.open')).forEach(function (m) { m.classList.remove('open'); });
    } catch (e) {}
    return { source: 'dom', menus: menus };
  }

  /* ---------- 對外：抓一份選單快照 ---------- */
  function snapshot() {
    var r = null;
    try { r = readViaMenuDefs(); } catch (e) { r = null; }
    if (!r) { try { r = readViaDom(); } catch (e) { r = null; } }
    if (!r) return { ok: false, source: 'none', menus: [], reason: 'menuDefs 與 #menubar 都讀不到' };

    /* ★ 有選單標題但一個可執行項目都沒有，等同反射失敗。
       這種半殘的模型比完全失敗更危險：主行程會誤以為整併成功而隱藏頁面選單列。 */
    var runnable = 0;
    for (var a = 0; a < r.menus.length; a++) {
      var its = r.menus[a].items || [];
      for (var b = 0; b < its.length; b++) if (!its[b].sep && its[b].runnable !== false) runnable++;
    }
    if (!runnable) {
      return { ok: false, source: 'none', menus: [], reason: '反射到 ' + r.menus.length + ' 個選單但 0 個可執行項目（' + r.source + '）' };
    }
    r.runnableCount = runnable;
    r.ok = true;
    r.appVersion = info().appVersion;
    return r;
  }

  /* ---------- 對外：執行某一項 ----------
   * expectLabel 是防漂移用的：menuDefs() 裡有條件式項目（例如「從此模板建立新文件」
   * 只在有作用中模板時才出現），快照與點擊之間索引可能位移。對不上就用文字找回來。
   */
  function run(mi, ii, expectLabel) {
    try {
      if (typeof window.menuDefs === 'function') {
        var defs = window.menuDefs();
        var def = defs && defs[mi];
        if (def && Array.isArray(def.items)) {
          var it = def.items[ii];
          if (expectLabel && (!it || plain(it.t) !== expectLabel)) {
            it = null;
            for (var k = 0; k < def.items.length; k++) {
              if (def.items[k] && !def.items[k].sep && plain(def.items[k].t) === expectLabel) { it = def.items[k]; break; }
            }
          }
          if (it && typeof it.cmd === 'function') { it.cmd(); return 'ok'; }
        }
      }
      /* L2 備援：真的去點 DOM */
      var bar = document.getElementById('menubar');
      if (!bar) return 'no-menubar';
      var tops = [].slice.call(bar.querySelectorAll('.mb-item'));
      var top = tops[mi];
      if (!top) return 'no-top';
      top.click();
      var dd = document.querySelector('.dropdown');
      if (!dd) return 'no-dropdown';
      var rows = [].slice.call(dd.children);
      var target = rows[ii];
      if (expectLabel) {
        for (var m = 0; m < rows.length; m++) {
          if ((rows[m].textContent || '').indexOf(expectLabel) === 0) { target = rows[m]; break; }
        }
      }
      if (!target || target.classList.contains('dd-sep')) { document.body.click(); return 'no-item'; }
      target.click();
      return 'ok-dom';
    } catch (e) {
      return 'error:' + (e && e.message ? e.message : String(e));
    }
  }

  /* ---------- 對外：視窗外框整併 ----------
   * hideMenubar        隱藏 HTML 自己的選單列（已整併進原生選單）
   * hideTrafficLights  假紅黃綠燈用 visibility 隱藏而**不是** display:none：
   *                    讓它繼續佔位，真的視窗鈕剛好疊在原本的位置，
   *                    右邊的檔名與工具鈕不會因此左移。
   * dragTitlebar       #titlebar 設成拖曳區，否則在無邊框視窗下拖不動；
   *                    其中所有可互動元素補 no-drag，不然按鈕會點不到。
   */
  function applyChrome(opt) {
    opt = opt || {};
    var css = [];

    if (opt.hideMenubar !== false) {
      css.push('#menubar{display:none!important}');
    }
    if (opt.hideTrafficLights !== false) {
      css.push('#traffic{visibility:hidden!important;pointer-events:none!important}');
    }
    if (opt.dragTitlebar !== false) {
      css.push('#titlebar{-webkit-app-region:drag}');
      css.push('#titlebar button,#titlebar a,#titlebar input,#titlebar select,' +
               '#titlebar #doc-title,#titlebar #tb-actions,#titlebar #traffic' +
               '{-webkit-app-region:no-drag}');
    }
    /* 桌面殼下不需要頁面自己的捲軸彈跳與文字選取游標干擾拖曳 */
    css.push('html,body{overscroll-behavior:none}');

    var st = document.getElementById(STYLE_ID);
    if (!st) {
      st = document.createElement('style');
      st.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(st);
    }
    st.textContent = css.join('\n');
    return { applied: true, rules: css.length };
  }

  function removeChrome() {
    var st = document.getElementById(STYLE_ID);
    if (st) st.remove();
    return 'ok';
  }

  /* ---------- 對外：量測（給驗證腳本用）---------- */
  function measure() {
    function box(sel) {
      var el = document.querySelector(sel);
      if (!el) return null;
      var r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }
    return {
      menubar: box('#menubar'),
      titlebar: box('#titlebar'),
      traffic: box('#traffic'),
      docTitle: box('#doc-title'),
      editorWrap: box('#editor-wrap'),
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight
    };
  }

  /* ---------- 對外：引擎自動載入 ----------
   * 產品裡本來就有 __CP169A_TEX_PROOF__.autoLoad(base)，
   * 它會 fetch(base + 五個檔名) 後驗 sha256 並 initEngine()。
   * file:// 下 fetch 會被擋，所以殼用自訂協定 ekdeta:// 供應頁面與引擎目錄。
   */
  function engineAutoLoad(base) {
    var api = window.__CP169A_TEX_PROOF__;
    if (!api || typeof api.autoLoad !== 'function') {
      return Promise.resolve({ ok: false, reason: 'no-api' });
    }
    try {
      var st = typeof api.getState === 'function' ? api.getState() : null;
      if (st && st.initialized) return Promise.resolve({ ok: true, already: true });
    } catch (e) {}
    return Promise.resolve(api.autoLoad(base || './engine/'))
      .then(function () {
        var s = typeof api.getState === 'function' ? api.getState() : null;
        /* ★ autoLoad 解決 ≠ 引擎可用。
           實測（假引擎包：檔名與大小完全正確、內容全零）發現它會正常 resolve，
           但 getState().initialized 仍是 false、面板顯示 "Engine initialization failed"。
           只看有沒有 reject 的話，殼會回報「引擎已就緒」，使用者按下編譯才發現不能用。
           所以真正的成功判準是 initialized。 */
        if (s && s.initialized) {
          return { ok: true, state: s };
        }
        /* 1.1.7：Electron direct stream 採 lazy lifecycle。
           普通 Markdown 的 autoLoad 只登記 ekdeta://app/engine/，刻意不讀取 199MB
           TeX Live、不建立 Worker。這不是失敗；真正進 REVTeX / 打開 TeX 面板時
           產品才做 SHA 驗證與初始化。 */
        if (s && s.engineTransport === 'direct-package-url' && s.directRoot) {
          return { ok: true, deferred: true, state: s };
        }
        return { ok: false, reason: panelStatus() || 'autoLoad 已完成，但引擎沒有初始化成功', state: s };
      })
      .catch(function (err) {
        return { ok: false, reason: (err && err.message) ? err.message : String(err), panel: panelStatus() };
      });
  }

  /* 引擎面板的狀態列文字——失敗時它才是說得最清楚的那個 */
  function panelStatus() {
    var el = document.getElementById('cp169a-status');
    return el ? (el.textContent || '').trim() : '';
  }

  function engineState() {
    var api = window.__CP169A_TEX_PROOF__;
    if (!api || typeof api.getState !== 'function') return { ok: false, reason: 'no-api' };
    try { return { ok: true, state: api.getState(), panel: panelStatus() }; }
    catch (e) { return { ok: false, reason: String(e) }; }
  }

  /* ---------- 對外：頁面資訊 ---------- */
  function info() {
    var ver = '';
    try {
      if (typeof window.APP_VERSION === 'string') ver = window.APP_VERSION;
    } catch (e) {}
    if (!ver) {
      var el = document.getElementById('app-ver');
      if (el) ver = (el.textContent || '').replace(/[^0-9.]/g, '');
    }
    var name = '';
    var dn = document.getElementById('doc-name');
    if (dn) name = dn.textContent || '';
    return {
      appVersion: ver,
      docName: name,
      hasMenuDefs: typeof window.menuDefs === 'function',
      hasEngineApi: !!(window.__CP169A_TEX_PROOF__),
      hasCp171: !!(window.__CP171__),
      lang: (document.body && document.body.classList.contains('lang-en')) ? 'en' : 'zh'
    };
  }

  window.__EKDETA_SHELL__ = {
    __v: 1,
    snapshot: snapshot,
    run: run,
    applyChrome: applyChrome,
    removeChrome: removeChrome,
    measure: measure,
    engineAutoLoad: engineAutoLoad,
    engineState: engineState,
    info: info
  };

  return 'installed';
})();
