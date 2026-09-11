
/* ============================================================================
 * cp171-56-split — 國際論文管線 · 左 Markdown ／ 右真實 PDF 分割版面
 *
 * v5.0 重寫（見 DECISION-v5.0.md）。v4.x 的錯誤：只改 #editor 的 CSS 讓它
 * 「看起來」不那麼像論文，但底層 document mode 仍是 revtex，而 revtex 屬於
 * 這個 app 原生的「論文模式」家族——只要還在那個家族，body.papermode 就會
 * 加上去，每一個區塊的點擊都會被 activate() 導去浮動的「編輯段落」彈窗
 * （原始碼第 6353 行），不是一般 Markdown 的 inline 編輯。這是使用者截圖
 * 抓到的東西：CSS 改了，但互動行為沒變，因為根本沒進到底層的模式判斷。
 *
 * v5.0 的做法：**完全不碰 settings.theme／settings.cp170Mode。**
 * 左半永遠是使用者當下所在的原生模式（正常情況下就是 markdown），CP171
 * 不做任何 CSS 覆蓋、不做任何模式切換。四組實測（見 DECISION-v5.0.md 第 2
 * 節）證明：純 markdown 模式下，用 CP171 自己的 fenced-yaml 慣例（不是原生
 * revtex-* fence 語法）寫 frontmatter，失焦後有語法高亮、標題與段落完全正常，
 * 而且點擊不會跳彈窗——因為 papermode 從頭到尾就是 false。
 *
 * 觸發方式也因此改變：不再靠切換 Theme／Mode 進入 CP171，而是一個獨立於
 * 主題選單的按鈕（K.toggleSplit()，只寫 settings.cp171.splitOpen，規約 R1）。
 * 按下去只做兩件事：開／關右側 PDF 面板、讀取當前文件的 canonical Markdown
 * 文字——跟原生 theme/mode 完全無關。
 *
 * 三條紅線（DECISION-v3.0.md）在 v5.0 下的滿足方式：
 *   A  能打字 → 左半是未經修改的原生 markdown 編輯器，本來就能打字
 *   B  所見即所得 → 右半是 pdfLaTeX 真編譯出的 PDF
 *   C  左側必須是 Markdown → 現在是真的「是」，不是 CSS 化妝成的「像」
 *
 * 對宿主的影響（可逆，關閉即完全回原狀）：
 *   1. body 加 class `cp171-split`（只用來控制右側面板的版面配置）
 *   2. 在 #main（flex 容器）加一個 flex 子節點當右半
 *   3. 一個獨立的浮動觸發按鈕（不放在任何選單裡，永遠可見）
 * 不修改 #editor／#scroller 的任何樣式、不隱藏 #revtex-wysiwyg（因為根本
 * 不會進入 revtex 主題，那個節點维持原生的預設隱藏狀態，CP171 不用管它）。
 *
 * 單一排程者原則不變（v4.0 修正過的競態問題）：orch 是唯一發編譯請求的
 * 地方，本模組只訂閱 orch:state／orch:result 事件來畫面。
 * ========================================================================== */
(() => {
'use strict';
const K = window.__CP171__;
if (!K) { console.error('[CP171] split: 核心未就緒'); return; }
try {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function'
      || typeof document.createElement('div').querySelector !== 'function') return;
} catch (_) { return; }

const PANE_ID = 'cp171-right-pane';
const BTN_ID  = 'cp171-left-toggle';

const CSS = `
/* 分割模式下左半只需要讓出空間給右半，不動 #editor 本身任何樣式——
   它現在就是普通的原生編輯器，不需要化妝也不需要拉回畫面。 */
body.cp171-split #scroller{flex:1 1 auto;min-width:320px}


#${PANE_ID}{display:flex;flex-direction:column;flex:0 0 var(--cp171-split,48%);
  min-width:300px;max-width:75%;border-left:1px solid var(--border,rgba(128,128,128,.34));
  background:var(--bg-panel,#f4f5f7);min-height:0}
#${PANE_ID} .cp171-rp-bar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;
  padding:7px 9px;border-bottom:1px solid var(--border,rgba(128,128,128,.28));
  font:11px/1.3 var(--font-ui,ui-sans-serif,system-ui,sans-serif);color:var(--text-strong,inherit)}
#${PANE_ID} button{height:26px;padding:0 9px;border:1px solid var(--border,rgba(128,128,128,.4));
  border-radius:var(--mac-radius-control,8px);background:var(--bg,transparent);color:inherit;
  font:650 11px/1 var(--font-ui,inherit);cursor:pointer;white-space:nowrap}
/* ---------- 按鈕互動回饋（Apple Design 標準 1 / Emil 標準 8）----------
 * ★ hover 必須用 @media (hover: hover) and (pointer: fine) 閘門：
 *   觸控裝置沒有真正的 hover，未閘門的 :hover 在點過之後會「黏住」，
 *   看起來像那顆按鈕還被選著。
 * ★ 按壓回饋要在 pointer-down 當下就出現（:active），不能等 click。
 *   先前只有 :hover 沒有 :active——滑鼠按下去到放開之間完全沒有反應，
 *   在「這顆按鈕會觸發數秒編譯」的情境下，使用者會不確定到底按到沒有。
 * 100ms + ease-out：夠快到感覺是「即時」而非「播了一段動畫」。 */
@media (hover: hover) and (pointer: fine){
  #${PANE_ID} button:hover:not(:disabled){border-color:var(--accent,#3d6fd4);background:var(--accent-soft,rgba(61,111,212,.12))}
}
@media (prefers-reduced-motion: no-preference){
  #${PANE_ID} button:not(:disabled){transition:transform var(--mac-dur-instant,100ms) var(--mac-ease-out,cubic-bezier(.22,1,.36,1)),
    background-color var(--mac-dur-instant,100ms) var(--mac-ease-out,ease-out),border-color var(--mac-dur-instant,100ms) var(--mac-ease-out,ease-out)}
}
#${PANE_ID} button:active:not(:disabled){transform:scale(0.97)}
#${PANE_ID} button:disabled{opacity:.45;cursor:default}
#${PANE_ID} button[data-primary]{border-color:var(--accent,#3d6fd4);background:var(--accent,#3d6fd4);color:#fff}
#${PANE_ID} .sp{flex:1}
#${PANE_ID} .cp171-rp-st{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;
  border-radius:999px;font-size:10.5px;font-weight:750;white-space:nowrap}
#${PANE_ID} .cp171-rp-st::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
#${PANE_ID} .cp171-rp-st[data-s="ok"]{background:rgba(47,163,96,.15);color:#2fa360}
#${PANE_ID} .cp171-rp-st[data-s="busy"]{background:rgba(61,111,212,.15);color:#3d6fd4}
/* 編譯中的脈動：目的是 state indication（正在跑 pdfLaTeX，可能要數秒），
   屬 occasional 頻率，適用 standard animation。
   ★ 必須提供 prefers-reduced-motion 版本——持續閃爍的元素對前庭系統
   敏感的使用者是實際的不適來源，這是硬性標準而非加分項。
   減量版保留一個穩定的半透明狀態：仍能看出「這個徽章跟其他狀態不同」，
   但不再有持續動作。 */
@media (prefers-reduced-motion: no-preference){
  #${PANE_ID} .cp171-rp-st[data-s="busy"]::before{animation:cp171sp 1s ease-in-out infinite}
}
@media (prefers-reduced-motion: reduce){
  #${PANE_ID} .cp171-rp-st[data-s="busy"]::before{opacity:.55}
}
#${PANE_ID} .cp171-rp-st[data-s="warn"]{background:rgba(212,150,45,.16);color:#c9862a}
#${PANE_ID} .cp171-rp-st[data-s="err"]{background:rgba(214,80,80,.16);color:#d05050}
#${PANE_ID} .cp171-rp-st[data-s="idle"]{background:rgba(128,128,128,.15);opacity:.8}
@keyframes cp171sp{0%,100%{opacity:1}50%{opacity:.2}}
#${PANE_ID} .cp171-rp-note{font:10.5px/1.4 var(--font-mono,ui-monospace,monospace);
  color:var(--text-muted,#888);flex:1 0 100%;word-break:break-word}
#${PANE_ID} .cp171-rp-stage{flex:1;min-height:0;background:#525659;position:relative}
#${PANE_ID} iframe{width:100%;height:100%;border:0;display:block}
#${PANE_ID} .cp171-rp-empty{position:absolute;inset:0;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:12px;padding:30px;text-align:center;
  color:#c9ced6;font:12px/1.75 var(--font-ui,ui-sans-serif,system-ui,sans-serif)}
#${PANE_ID} .cp171-rp-empty strong{font-size:13.5px;color:#eef1f5}
#${PANE_ID} .cp171-rp-empty p{margin:0;max-width:34em}
#${PANE_ID} .cp171-rp-empty code{background:rgba(255,255,255,.13);padding:1px 5px;border-radius:4px;font-size:11px}
#${PANE_ID} .cp171-rp-log{flex:0 0 auto;max-height:26%;overflow:auto;margin:0;padding:8px 10px;
  background:#15171c;color:#e6a5a5;font:10.5px/1.5 var(--font-mono,ui-monospace,monospace);
  white-space:pre-wrap;border-top:1px solid rgba(255,255,255,.08)}
#${PANE_ID} .cp171-rp-log[hidden]{display:none}
#${PANE_ID} .cp171-rp-logwrap{position:relative;flex:0 0 auto;display:flex;min-height:0}
#${PANE_ID} .cp171-rp-logwrap[hidden]{display:none}
#${PANE_ID} .cp171-rp-logwrap>pre{flex:1;min-width:0}
#${PANE_ID} #cp171-rp-logclose{position:absolute;top:5px;right:7px;z-index:2;
  width:20px;height:20px;line-height:1;padding:0;display:flex;align-items:center;justify-content:center;
  border:1px solid var(--border,rgba(128,128,128,.4));border-radius:var(--mac-radius-small,6px);
  background:var(--bg-panel,var(--bg-editor,transparent));color:var(--text-muted,#888);
  font-size:14px;cursor:pointer;opacity:.75}
#${PANE_ID} #cp171-rp-logclose:hover{opacity:1;color:var(--text-strong,inherit)}

/* 拖曳分隔 */
#cp171-split-grip{flex:0 0 5px;cursor:col-resize;background:transparent}
/* 分隔條的 hover 提示同樣要閘門（觸控裝置上沒有 hover 概念），
   並加上短過渡讓「可以拖這裡」的提示浮現而不是硬跳。 */
@media (hover: hover) and (pointer: fine){
  #cp171-split-grip{transition:background-color var(--mac-dur-instant,100ms) var(--mac-ease-out,ease-out)}
  #cp171-split-grip:hover{background:rgba(61,111,212,.35)}
}
@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: reduce){
  #cp171-split-grip{transition:none}
}

/* 左半右上角的切換鈕 */
#${BTN_ID}{position:absolute;top:10px;right:14px;z-index:40;
  height:28px;padding:0 11px;border:1px solid var(--border,rgba(128,128,128,.4));
  border-radius:var(--mac-radius-control,8px);background:var(--bg-panel,rgba(255,255,255,.94));color:var(--text,inherit);
  font:650 11px/1 var(--font-ui,ui-sans-serif,system-ui,sans-serif);cursor:pointer;
  box-shadow:0 2px 10px rgba(0,0,0,.1)}
@media (hover: hover) and (pointer: fine){
  #${BTN_ID}:hover{border-color:var(--accent,#3d6fd4);background:var(--accent-soft,rgba(61,111,212,.14))}
}
@media (prefers-reduced-motion: no-preference){
  #${BTN_ID}{transition:transform var(--mac-dur-instant,100ms) var(--mac-ease-out,cubic-bezier(.22,1,.36,1)),
    background-color var(--mac-dur-instant,100ms) var(--mac-ease-out,ease-out),border-color var(--mac-dur-instant,100ms) var(--mac-ease-out,ease-out)}
}
#${BTN_ID}:active{transform:scale(0.97)}
#${BTN_ID}[data-on="1"]{border-color:var(--accent,#3d6fd4);background:var(--accent,#3d6fd4);color:#fff}
body.cp171-split #scroller{position:relative}
`;

let pane = null, els = null, pdfUrl = '';
let disposeSplitDrag = null;

/* ---------- 建立 ---------- */
function style(){
  if (document.getElementById('cp171-split-style')) return;
  const st = document.createElement('style');
  st.id = 'cp171-split-style';
  st.textContent = CSS;
  document.head.appendChild(st);
}

function ensure(){
  if (pane && document.getElementById(PANE_ID)) return els;
  if (disposeSplitDrag) { disposeSplitDrag(); disposeSplitDrag = null; }
  try { const i18n = K.need('i18n'); if (i18n && i18n.unwatch) i18n.unwatch(pane); } catch (_) {}
  const main = document.getElementById('main');
  const scroller = document.getElementById('scroller');
  if (!main || !scroller) return null;
  style();

  const grip = document.createElement('div');
  grip.id = 'cp171-split-grip';
  grip.setAttribute('data-cp171', '');

  pane = document.createElement('aside');
  pane.id = PANE_ID;
  pane.setAttribute('data-cp171', '');
  pane.innerHTML = [
    '<div class="cp171-rp-bar">',
    '  <span class="cp171-rp-st" id="cp171-rp-state" data-s="idle">尚未編譯</span>',
    '  <button id="cp171-rp-compile" data-primary>編譯</button>',
    '  <label style="display:inline-flex;align-items:center;gap:4px;font-size:10.5px;cursor:pointer">',
    '    <input type="checkbox" id="cp171-rp-auto" checked> 停筆自動編譯</label>',
    '  <span class="sp"></span>',
    '  <button id="cp171-rp-pdf">下載 PDF</button>',
    '  <button id="cp171-rp-tex">下載 .tex</button>',
    '  <span class="cp171-rp-note" id="cp171-rp-note"></span>',
    '</div>',
    '<div class="cp171-rp-stage" id="cp171-rp-stage">',
    '  <div class="cp171-rp-empty" id="cp171-rp-empty">',
    '    <strong>右邊顯示 pdfLaTeX 真正編譯出的 PDF</strong>',
    '    <p>左邊照常打 Markdown，停筆後這裡自動跟上。你在這裡看到的版面，',
    '       就是匯出時拿到的那一份檔案。</p>',
    '    <p>第一次要先載入 Engine Pack 資料夾（<code>busytex.wasm</code> 等五個檔案）。</p>',
    '    <p><button id="cp171-rp-init">載入 Engine Pack</button></p>',
    '  </div>',
    '</div>',
    '<div class="cp171-rp-logwrap" id="cp171-rp-logwrap" hidden>',
    '  <button id="cp171-rp-logclose" title="關閉這則編譯訊息" aria-label="關閉這則編譯訊息">×</button>',
    '  <pre class="cp171-rp-log" id="cp171-rp-log"></pre>',
    '</div>'
  ].join('\n');

  main.appendChild(grip);
  main.appendChild(pane);

  /* 交給 i18n 層：面板文案以中文為來源，宿主切到 English 時由它依字典翻譯
     這棵子樹（狀態列會被 JS 反覆改寫，所以是持續觀察而非一次性）。 */
  try { const i18n = K.need('i18n'); if (i18n) i18n.watch(pane); } catch (_) {}

  // 左半右上角的切換鈕
  let btn = document.getElementById(BTN_ID);
  if (!btn) {
    btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.setAttribute('data-cp171', '');
    btn.type = 'button';
    btn.title = '在 Markdown 編輯與 REVTeX 版面設定之間切換（右半的 PDF 保持顯示）';
    btn.textContent = '版面設定';
    scroller.appendChild(btn);
    btn.onclick = () => {
      const S = K.need('revtexSettings');
      if (!S) return;
      const on = S.toggle();
      btn.setAttribute('data-on', on ? '1' : '0');
      btn.textContent = on ? '回到編輯' : '版面設定';
    };
  }

  const $ = id => pane.querySelector('#' + id);
  els = {
    pane, grip, btn,
    state: $('cp171-rp-state'), btnCompile: $('cp171-rp-compile'),
    swAuto: $('cp171-rp-auto'), note: $('cp171-rp-note'),
    stage: $('cp171-rp-stage'), empty: $('cp171-rp-empty'),
    btnPdf: $('cp171-rp-pdf'), btnTex: $('cp171-rp-tex'), btnInit: $('cp171-rp-init'),
    log: $('cp171-rp-logwrap'),
    logText: $('cp171-rp-log'),
    logClose: $('cp171-rp-logclose')
  };

  els.btnCompile.onclick = () => { const O = K.need('orch'); if (O) O.compile(); };
  els.swAuto.checked = K.flags().autoCompile !== false;
  els.swAuto.onchange = () => K.setFlag('autoCompile', els.swAuto.checked);
  els.btnInit.onclick = () => { const E = K.need('engine'); if (E && E.requestInit) E.requestInit(); };
  els.btnPdf.onclick = () => dl('pdf');
  els.btnTex.onclick = () => dl('tex');

  // 拖曳：每個 pane 擁有自己的處理器，移除或重建時一起釋放。
  let drag = false;
  function onGripMouseDown(e) {
    drag = true; e.preventDefault(); document.body.style.userSelect = 'none';
    /* 1.1.7.4：source textarea 與著色鏡像必須從拖曳第一幀起進入同一
       geometry transaction；一般 Markdown 的昂貴置中仍保留到 mouseup。 */
    try { if (typeof srcTrackLayout === 'function') srcTrackLayout(120); } catch (_) {}
  }
  function onWindowMouseMove(e) {
    if (!drag) return;
    const rect = main.getBoundingClientRect();
    const w = Math.min(Math.max(rect.right - e.clientX, 300), rect.width * 0.75);
    document.documentElement.style.setProperty('--cp171-split', w + 'px');
    /* 讀取 clientWidth 會在 CSS 變數更新後強制取得當前 layout；只同步
       mirror width／scroll，不在高頻拖曳中重跑 tokenization 或 gutter。 */
    try { if (typeof srcSyncMirrorGeometry === 'function') srcSyncMirrorGeometry(false); } catch (_) {}
  }
  function onWindowMouseUp() {
    if (drag) {
      drag = false;
      document.body.style.userSelect = '';
      // mouseup 後補一般視圖置中，並由 resyncViewport() 收尾 source gutter。
      resyncViewport();
    }
  }
  grip.addEventListener('mousedown', onGripMouseDown);
  window.addEventListener('mousemove', onWindowMouseMove);
  window.addEventListener('mouseup', onWindowMouseUp);
  disposeSplitDrag = () => {
    grip.removeEventListener('mousedown', onGripMouseDown);
    window.removeEventListener('mousemove', onWindowMouseMove);
    window.removeEventListener('mouseup', onWindowMouseUp);
    if (drag) { drag = false; document.body.style.userSelect = ''; }
  };

  /* ★ 這個函式裡的元素表叫 els。1.1.5.1 在這裡誤寫成 e.logClose（e 只是
     其他函式的區域變數名），每次 mount() 都拋 ReferenceError，buildPane
     在 return 之前中斷 → 編譯按鈕沒作用、左側 Markdown 不重新置中。
     現在由 realtest/ui_smoke.js 實際執行這條路徑把關。 */
  if (els.logClose) els.logClose.onclick = () => {
    if (els.log) els.log.hidden = true;
    if (els.logText) els.logText.textContent = '';
  };
  K.log.info('split', '左 Markdown ／ 右 PDF 分割版面已建立');
  return els;
}

function st(s, text){ if (els) { els.state.setAttribute('data-s', s); els.state.textContent = text; } }

/* ---------- 取得目前 Markdown（唯讀，僅供下載/顯示 map 用途，不參與排程） ---------- */
function currentMarkdown(){
  try {
    if (typeof commitCurrent === 'function') commitCurrent();
    if (typeof losslessActiveNormalized === 'function') {
      const v = losslessActiveNormalized(); if (typeof v === 'string' && v) return v;
    }
    if (typeof serialize === 'function') return serialize();
  } catch (_) {}
  return '';
}

/* ---------- 渲染 orch 送來的結果（本模組不再自己編譯，只負責畫）--------------
   單一事實來源：cp171-40-orch.js 是唯一呼叫 E.compileMarkdown() 的地方。
   v3.x 版本這裡自己維護一份 signature/schedule/watch，同時 orch 也維護一份，
   兩個排程器各自發編譯請求給同一個 busytex Worker，互相踩踏造成
   emscripten 端的 async 競態（使用者實測看到的「編譯失敗」）。
   現在改為訂閱事件；「編譯」按鈕也只是叫 orch 立刻跑一次，不自己發請求。 */
function renderResult(r){
  const e = ensure(); if (!e) return;
  const c = r && r.compile;

  if (c && c.ok && c.pdf) {
    let keepPage = 1;
    try {
      const f = e.stage.querySelector('iframe');
      if (f && f.src) { const m = f.src.match(/#.*page=(\d+)/); if (m) keepPage = Number(m[1]); }
    } catch (_) {}

    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    pdfUrl = URL.createObjectURL(new Blob([c.pdf], { type: 'application/pdf' }));
    let frame = e.stage.querySelector('iframe');
    if (!frame) {
      frame = document.createElement('iframe');
      frame.id = 'cp171-rp-frame';
      frame.setAttribute('data-cp171', '');
      frame.title = 'pdfLaTeX 編譯輸出';
      e.stage.appendChild(frame);
    }
    frame.src = pdfUrl + '#page=' + keepPage + '&view=FitH';
    if (e.empty) e.empty.style.display = 'none';

    /* 瀏覽器沒有內建 PDF 檢視器時（navigator.pdfViewerEnabled === false，
       例如某些精簡版瀏覽器、企業政策關閉、或 headless 環境），iframe 會
       完全空白而且不報任何錯——使用者只會看到「編譯成功」卻什麼都沒有。
       明確偵測並給出可執行的替代方案（下載 PDF 自行開啟）。 */
    try {
      if (navigator.pdfViewerEnabled === false) {
        let warn = e.stage.querySelector('#cp171-rp-nopdf');
        if (!warn) {
          warn = document.createElement('div');
          warn.id = 'cp171-rp-nopdf';
          warn.setAttribute('data-cp171', '');
          warn.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;'
            + 'align-items:center;justify-content:center;gap:12px;padding:30px;text-align:center;'
            + 'color:#c9ced6;font:12.5px/1.75 var(--font-ui,ui-sans-serif,system-ui,sans-serif);'
            + 'background:#525659';
          warn.innerHTML = '<strong style="font-size:13.5px;color:#eef1f5">'
            + '編譯成功，但這個瀏覽器沒有內建 PDF 檢視器</strong>'
            + '<p style="margin:0;max-width:34em">PDF 已經產生（右上角「下載 PDF」可以拿到檔案），'
            + '只是無法在這裡直接顯示。用 Chrome 或 Edge 開啟這個 HTML 就能看到內嵌預覽。</p>';
          e.stage.appendChild(warn);
        }
        warn.style.display = 'flex';
      } else {
        const w = e.stage.querySelector('#cp171-rp-nopdf');
        if (w) w.style.display = 'none';
      }
    } catch (_) {}

    let pages = '';
    const L = K.need('locate');
    if (L && c.synctex) {
      // load() 是 async（要用 DecompressionStream 解壓）；不 await 的話
      // 呼叫端無法得知是否解析成功，之後 locate.stats() 會拿到 null。
      Promise.resolve(L.load(c.synctex))
        .then(ix => { if (ix && e.note) e.note.textContent = ix.pages + ' 頁 · ' + e.note.textContent; })
        .catch(() => {});
    }
    e.note.textContent = (r.emit ? r.emit.engine : '') + ' · ' + (r.passes || 1) + ' 輪 · ' +
      (c.ms ? c.ms + ' ms' : '');
    if (c.texMatches === false) {
      e.note.textContent += ' · ';
      const link = document.createElement('a');
      link.href = 'javascript:void(0)';
      link.textContent = '⚠ main.tex 來自既有發射器（點此查看／切換）';
      link.style.cssText = 'color:inherit;text-decoration:underline;cursor:pointer';
      link.onclick = () => { const S = K.need('revtexSettings'); if (S) S.show(); };
      e.note.appendChild(link);
    }
    e.btnPdf.disabled = false; e.btnTex.disabled = false;
    /* 編譯成功就把上一次的錯誤 log 收掉。先前只在失敗時打開、成功時不處理，
       於是換一份文件編譯成功後，前一份的錯誤訊息還留在畫面上（使用者回報）。 */
    if (e.log) { e.log.hidden = true; if (e.logText) e.logText.textContent = ''; }
  } else if (c) {
    e.note.textContent = '編譯失敗，按下面白話診斷看原因';
    if (e.log) { e.log.hidden = false; if (e.logText) e.logText.textContent = String(c.log || '').slice(-4000); }
  }
}

const OrchState = { IDLE: '尚未編譯', DIRTY: '內容已變更', COMPILING: '編譯中…',
                    FRESH: '所見即所得', STALE: '內容已變更 · PDF 為舊版', ERROR: '編譯失敗' };
function onOrchState(payload){
  const next = payload && payload.next;
  /* 開始新的編譯就先清空舊 log：跨檔案切換時尤其重要。 */
  if (next === 'COMPILING') {
    const w = document.getElementById('cp171-rp-logwrap');
    const t = document.getElementById('cp171-rp-log');
    if (w) w.hidden = true;
    if (t) t.textContent = '';
  }
  const map = { IDLE: 'idle', DIRTY: 'warn', COMPILING: 'busy', FRESH: 'ok', STALE: 'warn', ERROR: 'err' };
  st(map[next] || 'idle', OrchState[next] || next);
}

/* ---------- 下載（用 orch 最近一次結果） ---------- */
function dl(kind){
  const O = K.need('orch');
  const last = O && O.getLast && O.getLast();
  if (kind === 'pdf') {
    let bytes = last && last.compile && last.compile.pdf;
    if (!bytes) { try { const p = window.__CP169A_TEX_PROOF__; bytes = p && p.getPdf && p.getPdf(); } catch (_) {} }
    if (!bytes) return;
    return blobDown(new Blob([bytes], { type: 'application/pdf' }), 'manuscript.pdf');
  }
  if (!last) return;
  blobDown(new Blob([last.emit.tex], { type: 'application/x-tex' }), 'main.tex');
}
function blobDown(blob, name){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ---------- 生命週期 ---------- */
let unsubState = null, unsubResult = null;
function mount(){
  if (!K.active()) return;
  if (!ensure()) return;
  document.body.classList.add('cp171-split');
  if (!unsubState) unsubState = K.on('orch:state', onOrchState);
  if (!unsubResult) unsubResult = K.on('orch:result', renderResult);
  const O = K.need('orch');
  if (O) { onOrchState({ next: O.state() }); const last = O.getLast(); if (last) renderResult(last); }
  K.emit('split:mount', {});
  resyncViewport();
}
function unmount(){
  document.body.classList.remove('cp171-split');
  if (disposeSplitDrag) { disposeSplitDrag(); disposeSplitDrag = null; }
  try { const i18n = K.need('i18n'); if (i18n && i18n.unwatch) i18n.unwatch(pane); } catch (_) {}
  for (const id of [PANE_ID, 'cp171-split-grip', BTN_ID]) {
    const n = document.getElementById(id);
    if (n && n.parentNode) n.parentNode.removeChild(n);
  }
  if (pdfUrl) { URL.revokeObjectURL(pdfUrl); pdfUrl = ''; }
  pane = null; els = null;
  if (unsubState) { unsubState(); unsubState = null; }
  if (unsubResult) { unsubResult(); unsubResult = null; }
  const S = K.need('revtexSettings'); if (S && S.close) S.close();
  resyncViewport();
}

/* ---------- 開關面板後強制重算視圖幾何 --------------------------------------
 * 使用者回報：切到國際期刊後左半沒有立刻置中，要 Command+滾輪縮放一下才會
 * 真的置中；切回 Markdown 也是同樣偏一邊。
 *
 * 根因：原生的 syncViewZoomGeometry()（19326 行）用 scroller.clientWidth
 * 算 #view-scale 的寬度與置中位移，但只在「縮放、主題切換、Source Mode
 * 退出、字型／視窗 resize、sidebar 動畫結束」這幾個原生認得的時機點被呼叫
 * （見 20575 行的 SEED_NOTES 說明）。開關 CP171 右側面板會壓縮／恢復
 * #scroller 的實際可視寬度，但這件事完全不在原生的觸發清單裡——因為
 * CP171 是後來才加的，原生程式碼寫的時候根本不知道會有這個東西存在。
 * 使用者 Cmd+滾輪縮放時之所以「突然跳回置中」，正是因為那個操作剛好觸發
 * 了 viewZoom()，而 viewZoom() 內部會呼叫 syncViewZoomGeometry()，
 * 用的是「當下」（面板已經開好、scroller 已經變窄）的正確寬度重算。
 *
 * 修法：面板開關造成的佈局變化，跟縮放、主題切換一樣，也需要主動觸發同一
 * 套重算。這兩個函式都是全域函式（實測 typeof 皆為 'function'，不像
 * setMode 那樣被關在 IIFE 裡），可以直接呼叫，不需要透過 window.__XXX__
 * 橋接。DOM 變更後立即呼叫一次，並比照原生 15301-15302 行的雙重
 * requestAnimationFrame 保險（避免瀏覽器 reflow 尚未完成時讀到舊寬度）。 */
function resyncViewport(){
  const run = () => {
    try { if (typeof syncViewZoomGeometry === 'function') syncViewZoomGeometry(); } catch (_) {}
    try { if (typeof scheduleRenderedViewCenterX === 'function') scheduleRenderedViewCenterX(true); } catch (_) {}
  };
  run();
  requestAnimationFrame(() => requestAnimationFrame(run));
  /* mount／unmount 與分隔線收尾同樣會改變 source wrapping width。這是共用
     Source Mode hook；不要求 REVTeX 模組知道 mirror 的內部 DOM。 */
  try { if (typeof srcTrackLayout === 'function') srcTrackLayout(280); } catch (_) {}
}

/* v6.0：懸浮的獨立啟動按鈕整個移除（見 DECISION-v6.0.md）。使用者原話：
   「你的軟體底層可能可以做解耦、做分割，但是在這個操作介面上，不能變得
   那麼亂」——入口改回既有的「模式」選單「國際期刊 REVTeX 4.2」項目，
   由 kernel.js 的 K.enterIntlMode() 與 build.py 的補丁 P9／P10 接管那個
   選單項目的行為，不再另外浮一個按鈕。mount/unmount 仍然只看
   K.flags().splitOpen，觸發來源從「懸浮按鈕」換成「選單項目」。 */

let lastOpen = null;
setInterval(() => {
  const on = !!K.flags().splitOpen;
  if (on !== lastOpen) { lastOpen = on; if (on) mount(); else unmount(); }
  else if (on && !document.getElementById(PANE_ID)) mount();
}, 700);

K.register('split', {
  version: '5.1.0',
  compile: K.gated('split.compile', () => { const O = K.need('orch'); return O ? O.compile() : null; }),
  requestCompile: () => { const O = K.need('orch'); if (O) O.touch(); },
  mount, unmount,
  getLast: () => { const O = K.need('orch'); return O ? O.getLast() : null; },
  isFresh: () => { const O = K.need('orch'); return !!(O && O.state() === 'FRESH'); },
  paneId: PANE_ID
});
K.log.info('split', 'CP171 v5.1.0 就緒（1.1.7.4：Source Mode 分隔線幾何同步；左半仍為原生 Markdown 編輯器）');
})();
