
/* ============================================================================
 * cp171-40-orch — 國際論文管線 · 影子編譯協調器
 *
 * 狀態機（devkit 20/03 第 2 節）：
 *
 *      ┌──────┐  內容變更   ┌───────┐  防抖到期  ┌───────────┐
 *      │ IDLE │ ─────────▶ │ DIRTY │ ─────────▶ │ COMPILING │
 *      └──────┘             └───────┘            └─────┬─────┘
 *          ▲                    ▲                      │
 *          │                    │ 編譯期間又改         │成功
 *          │                    └──────────────────────┤
 *          │                                           ▼
 *          │              ┌───────┐   內容變更   ┌───────┐
 *          └───────────── │ STALE │ ◀────────── │ FRESH │
 *                         └───────┘              └───────┘
 *                              失敗 ▼
 *                         ┌───────┐
 *                         │ ERROR │
 *                         └───────┘
 *
 * 兩個設計要點：
 *
 * 1. 內容簽章而非時間戳。編譯要花數秒，期間使用者可能繼續打字。若只看時間，
 *    編譯回來時無法判斷這份 PDF 對應的是哪個版本的內容。改用簽章：送編譯前記下
 *    當時內容的簽章，回來時比對現在的簽章——不同就直接落 STALE，不掛載過期 PDF。
 *    這正是 CP169A 已經在做的事（cp169Signature / markStale / reconcileStale），
 *    本模組沿用同一套思路，並優先借用既有的 __CP169B3_SCHEDULER_FACTORY__。
 *
 * 2. 髒偵測用輪詢而非事件掛鉤。編輯器的變更事件散落在既有程式碼各處，掛鉤上去
 *    就違反規約 R3。輪詢取簽章雖然笨，但完全不侵入——而且簽章計算是 O(n) 字串
 *    雜湊，對論文長度的文字每 400ms 跑一次的成本可以忽略。
 * ========================================================================== */
(() => {
'use strict';
const K = window.__CP171__;
if (!K) { console.error('[CP171] orch: 核心未就緒'); return; }

const S = { IDLE: 'IDLE', DIRTY: 'DIRTY', COMPILING: 'COMPILING',
            FRESH: 'FRESH', STALE: 'STALE', ERROR: 'ERROR' };

let state = S.IDLE;
let lastSig = '';            // 最近一次觀察到的內容簽章
let compiledSig = '';        // 最近一次成功編譯所對應的簽章
let dirtyAt = 0;
let timer = null;
let poll = null;
let lastResult = null;
let consecutiveErrors = 0;

/* --- 簽章：優先用既有的 fnv1a，沒有就用內建 --------------------------------- */
function fnv1a(str){
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}
function signature(text){
  try {
    const f = window.__CP169B3_SCHEDULER_FACTORY__;
    if (f && typeof f.fnv1a === 'function') return f.fnv1a(String(text));
  } catch (_) {}
  return fnv1a(String(text));
}

/* --- 取得目前 Markdown（唯讀）--------------------------------------------- */
function currentMarkdown(){
  try {
    if (typeof losslessActiveNormalized === 'function') {
      const v = losslessActiveNormalized();
      if (typeof v === 'string') return v;
    }
    if (typeof serialize === 'function') return serialize();
  } catch (_) {}
  return '';
}
/** 簽章要把設定一起算進去：改 class option 也該重編譯。 */
/* 圖片來源指紋：使用者按「選擇圖片資料夾修復…」把缺圖補上之後，Markdown
   一個字都沒變，舊的簽名因此完全不動，右邊永遠不會自動重編（使用者實測回報：
   圖修好了、左邊顯示正常，右邊還是缺圖，連手動按編譯也沒用）。
   把「目前有幾個圖片來源可用」納入簽名，補圖這件事就會讓文件變成 DIRTY，
   由既有的停筆自動編譯排程去重編——不另外開計時器、不另建觸發路徑，
   自動觸發最容易出錯的就是「多一條路各自計時」，這裡刻意避開。
   指紋只用「數量」與「有無」這種只會因使用者動作改變的量，不會自己抖動，
   所以不會造成無窮重編。 */
function assetFingerprint(){
  try {
    const n = (typeof pdfImgFiles !== 'undefined' && pdfImgFiles && pdfImgFiles.size) || 0;
    const c = (typeof imgURLCache !== 'undefined' && imgURLCache && imgURLCache.size) || 0;
    const d = (typeof dirHandle !== 'undefined' && dirHandle) ? 1 : 0;
    const i = (typeof imgDirHandle !== 'undefined' && imgDirHandle) ? 1 : 0;
    return 'a' + n + '.' + c + '.' + d + i;
  } catch (_) { return 'a?'; }
}

function fullSignature(){
  const md = currentMarkdown();
  let profile = '';
  try {
    const s = (typeof settings !== 'undefined' && settings) ? settings : {};
    profile = Object.keys(s).filter(k => /^revtex/.test(k)).sort()
                    .map(k => k + '=' + s[k]).join('|')
              + '|booktabs=' + !!s.texBooktabs + '|listings=' + !!s.texListings;
  } catch (_) {}
  return { sig: signature(md + '\u0000' + profile + '\u0000' + assetFingerprint()), md };
}

/* --- 狀態轉移 ------------------------------------------------------------- */
function setState(next, detail){
  if (state === next) return;
  const prev = state;
  state = next;
  K.log.info('orch', prev + ' → ' + next + (detail ? '（' + detail + '）' : ''));
  K.emit('orch:state', { prev, next, detail });
  const V = K.need('view');
  if (V && V.setState) { try { V.setState(next); } catch (_) {} }
}

/* --- 主迴圈 --------------------------------------------------------------- */
function tick(){
  if (!K.active()) return;
  const f = K.flags();
  if (!f.autoCompile) return;

  const { sig } = fullSignature();
  if (sig !== lastSig) {
    lastSig = sig;
    dirtyAt = Date.now();
    if (state === S.COMPILING) {
      // 編譯期間內容又變了：這次的結果回來時一定是過期的
      K.log.debug('orch', '編譯期間內容變更，本次結果將視為過期');
    } else if (sig !== compiledSig) {
      setState(S.DIRTY);
    }
    scheduleCompile();
  }
}

function scheduleCompile(){
  const f = K.flags();
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (state === S.COMPILING) { scheduleCompile(); return; }   // 等目前這輪結束
    if (lastSig === compiledSig) { setState(S.FRESH); return; }
    run();
  }, Math.max(200, Number(f.debounceMs) || 800));
}

async function run(force){
  const E = K.need('engine');
  if (!E) { setState(S.ERROR, '引擎層缺失'); return null; }
  if (state === S.COMPILING && !force) return null;

  const snap = fullSignature();
  if (!snap.md) { setState(S.ERROR, '取不到內容'); return null; }

  setState(S.COMPILING);
  const t0 = Date.now();
  try {
    const r = await E.compileMarkdown(snap.md, []);
    const now = fullSignature().sig;

    if (!r) { consecutiveErrors++; setState(S.ERROR, '無可用引擎'); return null; }

    lastResult = r;
    /* v4.2 修正：這裡原本只 emit 摘要 {ok, ms, warnings}，但訂閱端
       （cp171-56-split.js 的 renderResult）需要完整結果物件才能取到
       r.compile.pdf 去掛 iframe。介面不匹配導致「狀態顯示 FRESH、
       下載按鈕啟用，但右半永遠是空白」。端到端注入測試才抓到。
       改為傳完整物件，並把摘要欄位一併附上供只需摘要的訂閱者使用。 */
    if (r.compile) r.compile.ms = r.compile.ms || (Date.now() - t0);
    K.emit('orch:result', Object.assign({}, r, {
      ok: !!(r.compile && r.compile.ok),
      ms: Date.now() - t0,
      warningCount: (r.emit && r.emit.warnings ? r.emit.warnings.length : 0)
    }));

    if (r.compile && r.compile.ok) {
      consecutiveErrors = 0;
      compiledSig = snap.sig;
      // 回來時內容若已變，這份 PDF 對應的是舊內容 → STALE，不宣稱同步
      setState(now === snap.sig ? S.FRESH : S.STALE,
               now === snap.sig ? (Date.now() - t0) + ' ms' : '編譯期間內容已更新');
      if (now !== snap.sig) scheduleCompile();
    } else {
      consecutiveErrors++;
      setState(S.ERROR, 'exit ' + (r.compile ? r.compile.exitCode : '?'));
    }
    return r;
  } catch (e) {
    consecutiveErrors++;
    K.log.error('orch', e && e.message, e && e.stack);
    setState(S.ERROR, e && e.message);
    return null;
  } finally {
    // 連續失敗保護：不讓壞掉的文件把 CPU 燒在無止盡重編上
    if (consecutiveErrors >= 3) {
      const f = K.flags();
      if (f.autoCompile) {
        K.setFlag('autoCompile', false);
        K.log.warn('orch', '連續失敗 ' + consecutiveErrors + ' 次，已自動關閉影子編譯。' +
                            '修正錯誤後用 __CP171__.need("orch").resume() 恢復。');
        K.emit('orch:suspend', { consecutiveErrors });
      }
    }
  }
}

/* --- 生命週期 ------------------------------------------------------------- */
function start(){
  if (poll) return;
  poll = setInterval(tick, 400);
  K.log.info('orch', '影子編譯協調器啟動（輪詢 400ms）');
}
function stop(){
  if (poll) { clearInterval(poll); poll = null; }
  if (timer) { clearTimeout(timer); timer = null; }
  K.log.info('orch', '影子編譯協調器停止');
}

let wasActive = null;
setInterval(() => {
  const a = K.active();
  if (a === wasActive) return;
  wasActive = a;
  if (a) start(); else { stop(); setState(S.IDLE); }
}, 600);

/* --- 引擎就緒即自動重編（使用者回報的問題）---------------------------------
   症狀：載入 Engine Pack 之後右半仍停在「編譯失敗」，要手動再按一次「編譯」
   才會成功。根因是引擎初始化完成時沒有任何人通知 CP171——先前那次失敗的
   狀態就一直留在畫面上，儘管此刻其實已經可以編譯了。
   補丁 P7 在 CP169A 設 state.initialized=true 的那一刻廣播 engine:ready，
   這裡收到就重置錯誤計數並立刻重編一次。 */
K.on('engine:ready', () => {
  if (!K.active()) return;
  K.log.info('orch', '引擎就緒 → 自動重新編譯一次（免去使用者手動再按）');
  consecutiveErrors = 0;
  lastSig = '';            // 強制視為有變更，繞過簽章相同的早退
  compiledSig = '';
  setState(S.DIRTY, '引擎剛就緒，正在重新編譯…');
  run(true);
});

K.register('orch', {
  version: '1.1.0',
  STATES: S,
  state: () => state,
  compile: K.gated('orch.compile', () => run(true)),
  touch: () => { lastSig = ''; tick(); },
  resume: () => { consecutiveErrors = 0; K.setFlag('autoCompile', true); start(); return 'ok'; },
  start, stop,
  getLast: () => lastResult,
  /* 公開簽名供測試驗證：補圖後簽名必須改變（會觸發重編），
     沒有動作時必須穩定（不會自己抖動造成無窮重編）。 */
  signature: () => { try { return fullSignature().sig; } catch (_) { return ''; } },
  info: () => ({ state, lastSig, compiledSig, consecutiveErrors,
                 debounceMs: K.flags().debounceMs, autoCompile: K.flags().autoCompile })
});
K.log.info('orch', 'CP171 影子編譯協調器就緒（旗標 autoCompile 預設關）');
})();
