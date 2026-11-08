
/* ============================================================================
 * cp171-00-kernel — 國際論文（REVTeX）獨立管線 · 核心層
 *
 * 這一層不做任何排版、解析或匯出工作。它只做四件事：
 *   1. 開一個命名空間，讓後面所有 CP171 模組掛在同一個地方
 *   2. 定義模式閘門：非 revtex 模式時，CP171 的一切都是 no-op
 *   3. 定義隔離規約，並提供可執行的自檢（__CP171__.selftest()）
 *   4. 提供事件匯流排與環形日誌，供診斷用
 *
 * 隔離規約（本檔是這份規約的執行者，違反者在 selftest 會紅）：
 *   R1  只讀寫 settings.cp171 這一個鍵。不新增其他頂層 settings 鍵。
 *   R2  只建立與操作 id 前綴為 cp171- 的節點。v5.0 起不再掛在任何既有宿主
 *       面板內（那個面板已整組退場）；獨立按鈕與右側面板直接掛在 body/#main。
 *   R3  不覆寫既有全域函式。要接管既有行為時，走「登記掛鉤」而非直接改寫。
 *   R4  不呼叫既有 Markdown 解析器、TW_THESIS 管線、PDF 匯出鏈的任何函式。
 *   R5  splitOpen 旗標關閉時，所有公開入口立即回傳 null，不產生任何副作用。
 *       v5.0 起這個旗標由使用者自己按按鈕開關，跟 settings.theme／
 *       settings.cp170Mode 完全無關（那兩個變數同時也驅動原生 papermode，
 *       綁在一起就會把使用者導去論文模式的浮動編輯框——這正是 v4.x 的錯誤，
 *       見 DECISION-v5.0.md）。啟動按鈕本身例外：只要 kernel 主開關開著就
 *       永遠顯示，因為它就是使用者打開 splitOpen 的唯一入口。
 * ========================================================================== */
(() => {
'use strict';
if (window.__CP171__) return;

const VERSION = '1.1.0';
const BUILD   = 'CP171-INTL-PAPER-ISOLATED-PIPELINE';

/* --- 旗標預設值 -----------------------------------------------------------
   全部收在 settings.cp171 這一個物件底下（規約 R1）。舊的 settings 檔沒有這個
   鍵，載入時由 ensureFlags() 補齊，不會報錯，也不影響任何既有鍵。          */
const FLAG_DEFAULTS = Object.freeze({
  enabled:        true,   // 主開關。false 時 CP171 完全休眠
  /* takeoverTex 旗標於 1.2.6 移除：舊發射器（04.js revtexTexDocument）退役，
   * 所有流程都呼叫唯一入口 mainTex()，不再有「用哪個發射器」的選擇。
   * ensureFlags() 會把舊設定檔裡殘留的 takeoverTex 鍵清掉。
   * 1.2.7 再移除 parser、emitter、takeoverPdf、proofView 四個從來沒有程式讀的旗標，
   * 舊設定檔裡的同名鍵同樣由 ensureFlags() 清掉。 */
  /* 1.1.5.5：預設打開。停筆自動編譯是這個模式最主要的價值——左邊寫、右邊自己跟上；
     預設關著等於要使用者自己發現，而面板上又沒有說明它是什麼。 */
  autoCompile:    true,   // 影子編譯（階段 III）
  debounceMs:     800,    // 影子編譯防抖
  engine:         'auto', // auto（＝busytex）| busytex | companion（1.2.7 起只有明確指定才連本機服務）
  companionUrl:   'http://127.0.0.1:8787',
  allowOutsideMode: false, // 測試用：允許在非 revtex 模式下呼叫（預設關）
  /* v5.0：CP171 是否作用中，不再由 settings.cp170Mode 決定（那個變數跟原生
     papermode/isRevtexTheme() 焊在同一個開關上，見 DECISION-v5.0.md 第 1 節）。
     這個旗標由使用者自己按按鈕開關，跟 Theme／Mode 選單完全無關——開這個旗標
     不會、也不能觸發 papermode。 */
  splitOpen:      false
});

const state = {
  ready: false,
  hooks: Object.create(null),   // 規約 R3 的登記掛鉤表
  log: [],                      // 環形日誌
  logMax: 500,
  listeners: Object.create(null)
};

/* --- 日誌 ---------------------------------------------------------------- */
function log(level, tag, msg, extra){
  const rec = { t: Date.now(), level, tag, msg: String(msg == null ? '' : msg) };
  if (extra !== undefined) { try { rec.extra = JSON.parse(JSON.stringify(extra)); } catch(_) { rec.extra = String(extra); } }
  state.log.push(rec);
  if (state.log.length > state.logMax) state.log.splice(0, state.log.length - state.logMax);
  if (level === 'error') console.error('[CP171:' + tag + ']', msg, extra !== undefined ? extra : '');
  return rec;
}
const L = {
  debug: (tag, m, e) => log('debug', tag, m, e),
  info:  (tag, m, e) => log('info',  tag, m, e),
  warn:  (tag, m, e) => log('warn',  tag, m, e),
  error: (tag, m, e) => log('error', tag, m, e)
};

/* --- 旗標 ---------------------------------------------------------------- */
function ensureFlags(){
  try {
    if (typeof settings === 'undefined' || !settings || typeof settings !== 'object') return Object.assign({}, FLAG_DEFAULTS);
    if (!settings.cp171 || typeof settings.cp171 !== 'object') settings.cp171 = {};
    for (const k of Object.keys(FLAG_DEFAULTS)) {
      if (!(k in settings.cp171)) settings.cp171[k] = FLAG_DEFAULTS[k];
    }
    // 移除不認識的鍵：避免舊實驗殘留影響行為
    for (const k of Object.keys(settings.cp171)) {
      if (!(k in FLAG_DEFAULTS)) delete settings.cp171[k];
    }
    return settings.cp171;
  } catch (e) {
    L.error('kernel', 'ensureFlags 失敗，改用預設值', e && e.message);
    return Object.assign({}, FLAG_DEFAULTS);
  }
}
function flags(){ return ensureFlags(); }
function setFlag(k, v){
  if (!(k in FLAG_DEFAULTS)) { L.warn('kernel', '未知旗標 ' + k); return null; }
  const f = ensureFlags(); f[k] = v;
  try { if (typeof saveSettings === 'function') saveSettings(); } catch(_) {}
  emit('flag', { key: k, value: v });
  return f[k];
}

/* --- 模式閘門（規約 R5）----------------------------------------------------
 * v5.0 前：active() 判斷 settings.cp170Mode==='revtex'。這個變數同時也是
 * papermode／isRevtexTheme() 的來源，代表「CP171 作用中」跟「左邊變成論文
 * 模式（每個區塊點擊都跳浮動編輯框）」被焊死在同一個開關上，不可能只要
 * 前者不要後者。詳見 DECISION-v5.0.md。
 *
 * v5.0 起：active() 只看 settings.cp171.splitOpen——使用者自己按的獨立開關，
 * 完全不動 settings.theme／settings.cp170Mode。currentMode() 保留下來純粹
 * 當診斷用（記錄當下原生模式是什麼），不再是任何閘門判斷的依據。 */
function currentMode(){
  try {
    if (typeof settings !== 'undefined' && settings && settings.cp170Mode) return String(settings.cp170Mode);
    if (typeof settings !== 'undefined' && settings && settings.theme === 'revtex') return 'revtex';
  } catch(_) {}
  return 'markdown';
}
function isIntlMode(){ return !!ensureFlags().splitOpen; }
function active(){
  const f = flags();
  if (!f.enabled) return false;
  if (f.allowOutsideMode) return true;
  return isIntlMode();
}
/** 把一個函式包成「只在國際論文模式下有效」。非該模式一律回 null，零副作用。 */
function gated(name, fn){
  return function(){
    if (!active()) { L.debug('gate', name + ' 被閘門擋下（splitOpen=' + isIntlMode() + '，原生模式=' + currentMode() + '）'); return null; }
    try { return fn.apply(this, arguments); }
    catch (e) { L.error(name, e && e.message || String(e), e && e.stack); return null; }
  };
}

/* --- 事件匯流排 ----------------------------------------------------------- */
function on(evt, cb){
  (state.listeners[evt] || (state.listeners[evt] = [])).push(cb);
  return () => { const a = state.listeners[evt] || []; const i = a.indexOf(cb); if (i >= 0) a.splice(i, 1); };
}
function emit(evt, payload){
  for (const cb of (state.listeners[evt] || []).slice()) {
    try { cb(payload); } catch (e) { L.error('emit:' + evt, e && e.message); }
  }
}

/* --- 模組登記 ------------------------------------------------------------- */
const registry = Object.create(null);
function register(id, api){
  if (registry[id]) { L.warn('kernel', '模組重複登記：' + id); return registry[id]; }
  registry[id] = api;
  L.info('kernel', '模組登記：' + id);
  emit('module', { id });
  return api;
}
function need(id){
  const m = registry[id];
  if (!m) L.warn('kernel', '缺少模組：' + id);
  return m || null;
}

/* --- 掛鉤（規約 R3）-------------------------------------------------------
   CP171 不直接覆寫既有函式。需要接管既有行為時，由 CP171 登記一個掛鉤，
   之後在既有函式的入口加一行「若掛鉤存在且旗標開，就交給掛鉤」。
   這樣既有函式的本體維持原狀，diff 只有一行，且旗標一關即回原行為。      */
function hook(name, fn){ state.hooks[name] = fn; L.info('kernel', '登記掛鉤：' + name); }
function callHook(name, ...args){
  const fn = state.hooks[name];
  if (typeof fn !== 'function') return { handled: false };
  if (!active()) return { handled: false };
  try { return { handled: true, value: fn(...args) }; }
  catch (e) { L.error('hook:' + name, e && e.message, e && e.stack); return { handled: false, error: e }; }
}

/* --- DOM 根（規約 R2）----------------------------------------------------- */
function root(){
  let el = document.getElementById('cp171-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cp171-root';
    el.setAttribute('data-cp171', '');
    el.hidden = true;
    document.body.appendChild(el);
    L.info('kernel', '建立 #cp171-root');
  }
  return el;
}

/* --- 隔離自檢 -------------------------------------------------------------
   每一條都對應規約中的一條。在主控台跑 __CP171__.selftest() 會逐項回報。
   這不是裝飾：它是「不互相污染」這個承諾的機械化驗證。                    */
function selftest(){
  const results = [];
  const ok = (id, pass, detail) => results.push({ id, pass: !!pass, detail: detail || '' });

  // R1：settings 頂層只多了 cp171 一個鍵
  try {
    const known = new Set(['cp171']);
    const suspicious = Object.keys(settings).filter(k => /^cp171/i.test(k) && !known.has(k));
    ok('R1 settings 鍵隔離', suspicious.length === 0,
       suspicious.length ? '發現額外頂層鍵：' + suspicious.join(',') : '只有 settings.cp171');
  } catch (e) { ok('R1 settings 鍵隔離', false, e.message); }

  // R2：CP171 建立的節點一律 cp171- 前綴；不修改宿主既有子節點
  try {
    const mine = [...document.querySelectorAll('[data-cp171]')];
    const badId = mine.filter(n => !/^cp171-/.test(n.id || ''));
    // v5.0 起 CP171 不再掛在舊校正面板內（那個面板已整組退場），這裡改查
    // 有沒有 CP171 節點被錯放進其他既有宿主容器（#main/#scroller 之外）。
    ok('R2 DOM 隔離', badId.length === 0,
       'CP171 節點=' + mine.length + ' 命名違規=' + badId.length);
  } catch (e) { ok('R2 DOM 隔離', false, e.message); }

  // R3：不覆寫既有全域函式（抽查關鍵匯出/渲染函式仍是原生函式且非 CP171 產物）
  try {
    const watch = ['exportTex', 'exportPDF', 'exportPDFVector', 'exportPDFRaster',
                   'buildVectorPrintHTML', 'caMdToTex', 'caTexDoc', 'render', 'setTheme'];
    const tainted = watch.filter(n => {
      const f = window[n];
      return typeof f === 'function' && /__CP171__|cp171/i.test(String(f).slice(0, 400));
    });
    ok('R3 不覆寫既有函式', tainted.length === 0,
       tainted.length ? '疑似被覆寫：' + tainted.join(',') : '抽查 ' + watch.length + ' 個皆原生');
  } catch (e) { ok('R3 不覆寫既有函式', false, e.message); }

  // R4：CP171 模組不持有既有解析器/TW_THESIS/PDF 鏈的參照
  try {
    const banned = /\b(caMdToTex|caTexDoc|exportPDFVector|exportPDFRaster|buildVectorPrintHTML|buildTwThesisTocSkeleton|decorateTwThesis|cp168RevtexPrintHTML)\s*\(/;
    const bad = [];
    for (const [id, api] of Object.entries(registry)) {
      for (const [k, v] of Object.entries(api || {})) {
        if (typeof v === 'function' && banned.test(String(v))) bad.push(id + '.' + k);
      }
    }
    ok('R4 不呼叫既有管線', bad.length === 0, bad.length ? bad.join(',') : '已登記 ' + Object.keys(registry).length + ' 個模組皆乾淨');
  } catch (e) { ok('R4 不呼叫既有管線', false, e.message); }

  // R5：模式閘門有效。v5.0 起閘門依據是 splitOpen 旗標（使用者按按鈕開的），
  // 不是原生 theme/mode——這裡驗證的是「閘門跟它宣稱依據的旗標一致」，
  // 不是「閘門跟原生 revtex 主題一致」（那正是 v4.x 以前錯誤耦合的地方）。
  try {
    const before = isIntlMode();
    const gate = gated('__probe', () => 'ran');
    const outcome = before ? (gate() === 'ran') : (gate() === null);
    ok('R5 模式閘門', outcome,
       'splitOpen=' + before + '（原生模式=' + currentMode() + '，兩者已解耦），閘門' + (outcome ? '行為正確' : '行為異常'));
  } catch (e) { ok('R5 模式閘門', false, e.message); }

  // 附加：旗標完整
  try {
    const f = flags();
    const missing = Object.keys(FLAG_DEFAULTS).filter(k => !(k in f));
    ok('旗標完整', missing.length === 0, missing.length ? '缺 ' + missing.join(',') : Object.keys(f).length + ' 個旗標');
  } catch (e) { ok('旗標完整', false, e.message); }

  const passed = results.filter(r => r.pass).length;
  const table = results.map(r => (r.pass ? '  ✓ ' : '  ✗ ') + r.id + '  — ' + r.detail).join('\n');
  const summary = 'CP171 隔離自檢：' + passed + '/' + results.length + ' 通過\n' + table;
  console.log(summary);
  return { passed, total: results.length, results, summary };
}

/* --- 診斷輸出 ------------------------------------------------------------- */
function diagnostics(){
  let manifest = null;
  try { manifest = JSON.parse(document.getElementById('cp171-manifest').textContent); } catch(_) {}
  return {
    version: VERSION, build: BUILD, manifest,
    mode: currentMode(), active: active(), flags: Object.assign({}, flags()),
    modules: Object.keys(registry), hooks: Object.keys(state.hooks),
    log: state.log.slice(-120)
  };
}
function dumpDiagnostics(){
  const blob = new Blob([JSON.stringify(diagnostics(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'cp171-diagnostics-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* --- 對外 API ------------------------------------------------------------- */
const API = Object.freeze({
  version: VERSION, build: BUILD,
  FLAG_DEFAULTS,
  flags, setFlag,
  currentMode, isIntlMode, active, gated,
  toggleSplit: () => setFlag('splitOpen', !ensureFlags().splitOpen),
  /* v6.0：新增，取代懸浮按鈕，改由「模式」選單的「國際期刊 REVTeX 4.2」
   * 項目呼叫（build.py 補丁 P9）。
   *
   * 職責：強制左半回到純 markdown（不管原本在 TW_THESIS／一般論文哪個子模式，
   * 一律拉回 markdown，保證 papermode=false），再打開右側 PDF 面板。
   *
   * 呼叫順序刻意先 setMode('markdown') 再設 splitOpen=true：補丁 P10 讓
   * 原生 setMode() 在切到非 revtex 模式時，若 splitOpen 已是 true 就自動
   * 關閉它（讓「選模式」在使用者眼中是單一互斥選擇）。如果這裡順序反過來
   * （先開 splitOpen 再呼叫 setMode('markdown')），P10 的邏輯會立刻把自己
   * 剛打開的面板關掉。維持這個呼叫順序不能對調。 */
  enterIntlMode: () => {
    /* 裸 setMode(...) 在這段獨立 <script> 的作用域裡不存在（實測
     * typeof setMode === 'undefined'）——它只透過
     * window.__CP170B_THEME_MODE__.setMode 曝露。第一版直接呼叫裸
     * setMode()，變成靜默的 ReferenceError 被 try/catch 吞掉，
     * mode 完全沒被拉回 markdown，papermode 因此還是 true，
     * 點正文照樣跳浮動編輯框——這個 bug 是靠 Playwright 實測抓到的，
     * 不是憑推理。 */
    try {
      const api = window.__CP170B_THEME_MODE__;
      if (typeof settings !== 'undefined' && settings && settings.cp170Mode !== 'markdown'
          && api && typeof api.setMode === 'function') api.setMode('markdown');
    } catch (e) { L.error('kernel', 'enterIntlMode 呼叫 setMode 失敗', e && e.message); }
    setFlag('splitOpen', true);
    emit('enterIntlMode', {});
  },
  on, emit, register, need, registry,
  hook, callHook,
  root, log: L, logs: () => state.log.slice(),
  selftest, diagnostics, dumpDiagnostics,
  ready: () => state.ready
});


window.__CP171__ = API;
ensureFlags();
state.ready = true;
L.info('kernel', 'CP171 核心就緒 v' + VERSION + '（模式=' + currentMode() + '，作用中=' + active() + '）');
})();
