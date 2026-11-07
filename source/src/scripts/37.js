/* ============================================================================
 * cp184-96-pdf-view — 國際論文右半邊的 PDF 檢視（1.2.4）
 *
 * 使用者 2026-11-07：右半邊的 PDF 原本交給瀏覽器內建檢視器，上方有一條黑色
 * 工具列，和白色介面不搭又吃掉高度。要拿掉那條黑框，只保留三個功能：放大縮小、
 * 頁數顯示與跳頁、下載這份 PDF；按鈕放在右上角。
 *
 * 作法：不再把 PDF 丟進 <iframe>，改用內嵌的 PDF.js（Mozilla，Apache-2.0，
 * src/vendor/pdfjs/，位元組不改、由 vendor-hashes.json 鎖定）把每一頁畫進 canvas。
 * 好處：
 *   1. 畫面只有紙張本身，背景跟著主題（--cp-canvas），沒有瀏覽器的工具列。
 *   2. 放大縮小、目前頁數、跳頁、下載都由這裡的按鈕控制，也能保住重新編譯前看到
 *      的頁面位置（原本每次重新編譯都跳回第 1 頁）。
 *   3. 不依賴瀏覽器的 PDF 外掛：在沒有內建檢視器的瀏覽器、手機，以及
 *      嵌入其他網頁的隔離框（sandbox 會停用 PDF 外掛）裡都看得到。
 *
 * PDF.js 是 ES module；這個單一 HTML 用 <script type="text/plain"> 原樣攜帶它，
 * 第一次需要時才轉成 blob 網址動態載入，worker 也由 blob 建立。載入或繪製失敗時
 * 回報 onError，由呼叫端退回原本的 <iframe>，不會變成一片空白。
 *
 * 只負責「畫」：不排程編譯、不改文件；22.js 的 renderResult() 呼叫 show()。
 * ========================================================================== */
(() => {
'use strict';
const K = window.__CP171__;
if (!K) return;
try {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
} catch (_) { return; }

const CSS_UNITS = 96 / 72;          // PDF.js 與瀏覽器的 100%：1 pt = 4/3 CSS px
const ZOOMS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
const MAX_PIXELS = 16e6;               // 單張畫布上限（Safari 約 1670 萬像素）；放很大時降低解析度而不是畫不出來
const PAD = 16;                       // 頁面左右與頁間留白（px）
const TOP = 50;                       // 第一頁上方留給右上角按鈕的高度，捲到最上面時不遮紙面

const CSS = `
.ekd-pv{position:absolute;inset:0;overflow:auto;background:var(--cp-canvas,#eceef1);
  overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.ekd-pv[hidden]{display:none}
/* 1.2.5：編譯失敗時不淡化紙面（使用者要看得到原本的畫面），只在頂端畫一條細的提示線 */
.ekd-pv.ekd-pv-stale{box-shadow:inset 0 3px 0 var(--status-warn,#c9862a)}
.ekd-pv-pages{display:flex;flex-direction:column;align-items:center;gap:14px;
  padding:${TOP}px ${PAD}px 28px;min-width:min-content;box-sizing:border-box}
.ekd-pv-page{position:relative;flex:0 0 auto;background:#fff;
  box-shadow:0 0 0 .5px rgba(0,0,0,.10),0 2px 10px rgba(0,0,0,.10)}
.ekd-pv-page canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
#cp171-right-pane .ekd-pv-tools{position:absolute;top:10px;right:16px;z-index:3;display:flex;align-items:center;
  gap:1px;padding:3px;border-radius:var(--mac-radius-control,9px);
  background:var(--mac-glass-strong,rgba(250,250,252,.92));
  -webkit-backdrop-filter:var(--mac-blur,blur(20px));backdrop-filter:var(--mac-blur,blur(20px));
  box-shadow:var(--mac-shadow-popover,0 6px 20px rgba(0,0,0,.16)),0 0 0 .5px var(--mac-hairline,rgba(0,0,0,.12));
  font:600 11.5px/1 var(--font-ui,ui-sans-serif,system-ui,sans-serif);color:var(--text-strong,#222);
  font-variant-numeric:tabular-nums}
#cp171-right-pane .ekd-pv-tools[hidden]{display:none}
#cp171-right-pane .ekd-pv-tools button{height:26px;min-width:26px;padding:0 6px;border:0;
  border-radius:var(--mac-radius-small,6px);background:transparent;color:inherit;
  display:inline-flex;align-items:center;justify-content:center;font:inherit;cursor:pointer;box-shadow:none}
#cp171-right-pane .ekd-pv-tools button svg{width:15px;height:15px;stroke:currentColor;fill:none;
  stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
#cp171-right-pane .ekd-pv-tools .ekd-pv-zoom{min-width:48px}
#cp171-right-pane .ekd-pv-tools .ekd-pv-sep{width:1px;height:16px;margin:0 3px;background:var(--mac-separator,rgba(0,0,0,.12))}
#cp171-right-pane .ekd-pv-tools label{display:inline-flex;align-items:center;gap:4px;padding:0 4px;
  color:var(--text-muted,#666);font-weight:600}
#cp171-right-pane .ekd-pv-tools input{width:3.2ch;height:22px;padding:0 3px;box-sizing:content-box;
  border:1px solid var(--mac-hairline,rgba(0,0,0,.18));border-radius:5px;background:var(--bg-editor,#fff);
  color:var(--text-strong,#222);font:inherit;text-align:center}
#cp171-right-pane .ekd-pv-tools input:focus{outline:none;box-shadow:var(--mac-focus-ring,0 0 0 3px rgba(53,100,216,.3))}
@media (hover: hover) and (pointer: fine){
  #cp171-right-pane .ekd-pv-tools button:hover{background:var(--mac-control-hover,rgba(118,118,128,.16));border:0}
}
#cp171-right-pane .ekd-pv-tools button:active{background:var(--mac-control-pressed,rgba(118,118,128,.23));transform:none}
#cp171-right-pane .ekd-pv-tools button:focus-visible{outline:none;box-shadow:var(--mac-focus-ring,0 0 0 3px rgba(53,100,216,.3))}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
  #cp171-right-pane .ekd-pv-tools{background:var(--bg-panel,#f6f6f8)}
}
@media (prefers-reduced-transparency: reduce){
  #cp171-right-pane .ekd-pv-tools{background:var(--bg-panel,#f6f6f8);backdrop-filter:none;-webkit-backdrop-filter:none}
}
@media print{.ekd-pv,.ekd-pv-tools{display:none!important}}
`;

const ICON_MINUS = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9M8 3.5v9"/></svg>';
const ICON_DOWN = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v8M4.5 7.2 8 10.7l3.5-3.5M3 13.5h10"/></svg>';

/* ---------- PDF.js：第一次需要時才載入 ---------- */
let libPromise = null;
function loadLib(){
  if (libPromise) return libPromise;
  libPromise = (async () => {
    const libText = document.getElementById('ekd-pdfjs-lib');
    const workerText = document.getElementById('ekd-pdfjs-worker');
    if (!libText || !workerText) throw new Error('PDF.js 不在這個檔案裡');
    const libUrl = URL.createObjectURL(new Blob([libText.textContent], { type: 'text/javascript' }));
    const lib = await import(libUrl);
    lib.GlobalWorkerOptions.workerSrc =
      URL.createObjectURL(new Blob([workerText.textContent], { type: 'text/javascript' }));
    return lib;
  })();
  libPromise.catch(() => { libPromise = null; });
  return libPromise;
}

/* ---------- 一個檢視器掛在一個 stage 上 ---------- */
const viewers = new WeakMap();

function style(){
  if (document.getElementById('ekd-pdfview-style')) return;
  const st = document.createElement('style');
  st.id = 'ekd-pdfview-style';
  st.textContent = CSS;
  document.head.appendChild(st);
}

function viewerFor(stage){
  let v = viewers.get(stage);
  if (v && v.root.isConnected) return v;
  style();
  const root = document.createElement('div');
  root.className = 'ekd-pv'; root.hidden = true; root.setAttribute('data-cp171', '');
  root.tabIndex = -1;
  const tools = document.createElement('div');
  tools.className = 'ekd-pv-tools'; tools.hidden = true; tools.setAttribute('data-cp171', '');
  tools.setAttribute('role', 'toolbar'); tools.setAttribute('aria-label', 'PDF 檢視');
  tools.innerHTML =
    '<button type="button" class="ekd-pv-out" title="縮小" aria-label="縮小">' + ICON_MINUS + '</button>' +
    '<button type="button" class="ekd-pv-zoom" title="按一下回到符合寬度" aria-label="按一下回到符合寬度">100%</button>' +
    '<button type="button" class="ekd-pv-in" title="放大" aria-label="放大">' + ICON_PLUS + '</button>' +
    '<span class="ekd-pv-sep" aria-hidden="true"></span>' +
    '<label><input type="text" inputmode="numeric" class="ekd-pv-page-in" value="1" title="輸入頁碼後按 Enter 跳頁" aria-label="輸入頁碼後按 Enter 跳頁"><span class="ekd-pv-total">/ 1</span></label>' +
    '<span class="ekd-pv-sep" aria-hidden="true"></span>' +
    '<button type="button" class="ekd-pv-dl" title="下載 PDF" aria-label="下載 PDF">' + ICON_DOWN + '</button>';
  stage.appendChild(root);
  stage.appendChild(tools);
  v = {
    stage, root, tools, doc: null, pages: [], holder: null, zoom: 'fit', fitZoom: 1, current: 1,
    token: 0, observer: null, onDownload: null, lastWidth: 0, scrollRaf: 0, resizeTimer: 0
  };
  const q = s => tools.querySelector(s);
  v.zoomBtn = q('.ekd-pv-zoom'); v.pageIn = q('.ekd-pv-page-in'); v.total = q('.ekd-pv-total');
  q('.ekd-pv-out').onclick = () => setZoom(v, step(v, -1));
  q('.ekd-pv-in').onclick = () => setZoom(v, step(v, +1));
  v.zoomBtn.onclick = () => setZoom(v, 'fit');
  q('.ekd-pv-dl').onclick = () => { if (v.onDownload) v.onDownload(); };
  v.pageIn.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); goTo(v, parseInt(v.pageIn.value, 10)); v.pageIn.blur(); }
    else if (ev.key === 'Escape') { v.pageIn.value = String(v.current); v.pageIn.blur(); }
  });
  v.pageIn.addEventListener('focus', () => { try { v.pageIn.select(); } catch (_) {} });
  v.pageIn.addEventListener('blur', () => { v.pageIn.value = String(v.current); });
  root.addEventListener('scroll', () => {
    if (v.scrollRaf) return;
    v.scrollRaf = requestAnimationFrame(() => { v.scrollRaf = 0; trackPage(v); });
  }, { passive: true });
  // ⌘／Ctrl＋滾輪（觸控板捏合也是這個事件）縮放 PDF，不縮放整個介面
  root.addEventListener('wheel', ev => {
    if (!(ev.ctrlKey || ev.metaKey) || !v.doc) return;
    // 只縮放 PDF：不讓 EKdelta 整個介面的 ⌘＋滾輪縮放同時發生
    ev.preventDefault(); ev.stopPropagation();
    const now = effective(v), next = Math.min(4, Math.max(0.25, now * Math.exp(-ev.deltaY * 0.0015)));
    // 以游標所在處為中心縮放：縮放前後，游標底下是紙面上同一點
    const r = v.root.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top;
    const fx = (v.root.scrollLeft + px) / Math.max(1, v.root.scrollWidth), fy = (v.root.scrollTop + py) / Math.max(1, v.root.scrollHeight);
    v.zoom = Math.round(next * 100) / 100;
    layout(v, null);
    v.root.scrollLeft = fx * v.root.scrollWidth - px;
    v.root.scrollTop = fy * v.root.scrollHeight - py;
    trackPage(v);
  }, { passive: false });
  if (typeof ResizeObserver === 'function') {
    v.resize = new ResizeObserver(() => {
      const w = root.clientWidth;
      if (!v.doc || v.zoom !== 'fit' || Math.abs(w - v.lastWidth) < 2) return;
      clearTimeout(v.resizeTimer);
      v.resizeTimer = setTimeout(() => layout(v, anchor(v)), 120);
    });
    v.resize.observe(root);
  }
  viewers.set(stage, v);
  return v;
}

const effective = v => (v.zoom === 'fit' ? v.fitZoom : v.zoom);
function step(v, dir){
  const now = effective(v);
  // 跳到明顯不同的下一階：符合寬度是 79.5% 時按＋直接到 90%，不會只動到 80%
  if (dir > 0) return ZOOMS.find(z => z > now * 1.05) || ZOOMS[ZOOMS.length - 1];
  return [...ZOOMS].reverse().find(z => z < now / 1.05) || ZOOMS[0];
}

/* 目前畫面上方三分之一處所在的頁與在該頁的位置；換文件、換縮放後回到同一處 */
function anchor(v){
  const top = v.root.scrollTop + v.root.clientHeight * 0.33;
  for (const p of v.pages) {
    const el = p.el, start = el.offsetTop, end = start + el.offsetHeight;
    if (top < end + 7) return { page: p.n, frac: Math.max(0, Math.min(1, (top - start) / Math.max(1, el.offsetHeight))) };
  }
  return { page: v.pages.length || 1, frac: 0 };
}
function restore(v, a){
  const p = v.pages[Math.min(v.pages.length, Math.max(1, a.page)) - 1];
  if (!p) return;
  v.root.scrollTop = Math.max(0, p.el.offsetTop + p.el.offsetHeight * a.frac - v.root.clientHeight * 0.33);
  trackPage(v);
}

function trackPage(v){
  if (!v.pages.length) return;
  const a = anchor(v);
  if (a.page !== v.current) {
    v.current = a.page;
    if (document.activeElement !== v.pageIn) v.pageIn.value = String(v.current);
  }
}

function goTo(v, n){
  if (!v.pages.length || !Number.isFinite(n)) { v.pageIn.value = String(v.current); return; }
  const p = v.pages[Math.min(v.pages.length, Math.max(1, n)) - 1];
  v.root.scrollTop = Math.max(0, p.el.offsetTop - TOP);
  v.current = p.n; v.pageIn.value = String(p.n);
}

function setZoom(v, z){
  if (!v.doc) return;
  const a = anchor(v);
  v.zoom = z;
  layout(v, a);
}

/* 依縮放算出每頁的 CSS 尺寸、清掉舊的繪製，重新觀察哪些頁要畫 */
function layout(v, a){
  const width = v.root.clientWidth || v.stage.clientWidth || 600;
  v.lastWidth = width;
  const widest = Math.max(...v.pages.map(p => p.w));
  v.fitZoom = Math.max(0.25, (width - PAD * 2) / (widest * CSS_UNITS));
  const z = effective(v);
  v.zoomBtn.textContent = Math.round(z * 100) + '%';
  for (const p of v.pages) {
    p.cssW = Math.floor(p.w * CSS_UNITS * z); p.cssH = Math.floor(p.h * CSS_UNITS * z);
    p.el.style.width = p.cssW + 'px'; p.el.style.height = p.cssH + 'px';
    p.drawnAt = 0; p.pending = null;
  }
  if (a) restore(v, a);
  observe(v);
}

function observe(v){
  if (v.observer) v.observer.disconnect();
  if (typeof IntersectionObserver !== 'function') { v.pages.forEach(p => draw(v, p)); return; }
  v.observer = new IntersectionObserver(entries => {
    for (const en of entries) {
      const p = en.target.__ekdPage;
      if (en.isIntersecting) draw(v, p);
      else if (p && !v.swapping) {   // 捲離很遠的頁面放掉畫布（換文件的過程中不放），長文件不會一直佔記憶體；捲回來再畫
        if (p.task) { try { p.task.cancel(); } catch (_) {} p.task = null; }
        const old = p.el.querySelector('canvas'); if (old) old.remove();
        p.drawnAt = 0; p.pending = null;
      }
    }
  }, { root: v.root, rootMargin: '900px 0px' });
  v.pages.forEach(p => v.observer.observe(p.el));
}

function draw(v, p){
  if (!p || !v.doc) return Promise.resolve();
  const z = effective(v);
  const cssPixels = Math.max(1, p.w * p.h * (z * CSS_UNITS) ** 2);
  const dpr = Math.max(0.5, Math.min(3, window.devicePixelRatio || 1, Math.sqrt(MAX_PIXELS / cssPixels)));
  const key = z * 1000 + dpr;
  // 同一個尺寸已經在畫或畫好：回傳同一個工作，呼叫端（換文件時）才等得到真的畫完
  if (p.drawnAt === key && p.pending) return p.pending;
  p.drawnAt = key;
  const token = v.token;
  p.pending = (async () => {
    try {
      if (p.task) { try { p.task.cancel(); } catch (_) {} }
      const page = p.page || (p.page = await v.doc.getPage(p.n));
      if (token !== v.token || p.drawnAt !== key) return;
      const viewport = page.getViewport({ scale: z * CSS_UNITS * dpr });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
      const task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
      p.task = task;
      await task.promise;
      if (p.task === task) p.task = null;
      if (token !== v.token || p.drawnAt !== key) return;
      const old = p.el.querySelector('canvas');
      p.el.appendChild(canvas);
      if (old) old.remove();
    } catch (err) {
      if (err && err.name === 'RenderingCancelledException') return;
      p.drawnAt = 0;
    }
  })();
  return p.pending;
}

/* 顯示一份新的 PDF。舊頁面留在畫面上，新文件的頁框排好、目前那一頁畫好才換上，
   重新編譯時不會閃一下空白，也停在同一頁的同一處。 */
async function show(stage, bytes, opts){
  const v = viewerFor(stage);
  v.onDownload = opts && opts.onDownload || null;
  v.root.classList.remove('ekd-pv-stale');
  const token = ++v.token;
  const lib = await loadLib();
  // getDocument 會把資料轉移給 worker；交一份複本，呼叫端的 PDF bytes 仍可下載
  const task = lib.getDocument({ data: new Uint8Array(bytes).slice(), isEvalSupported: false, useWasm: false,
    disableAutoFetch: true, enableXfa: false });
  const doc = await task.promise;
  if (token !== v.token) { doc.destroy(); return false; }
  const a = v.pages.length ? anchor(v) : { page: 1, frac: 0 };
  const holder = document.createElement('div');
  holder.className = 'ekd-pv-pages';
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    if (token !== v.token) { doc.destroy(); return false; }
    const vp = page.getViewport({ scale: 1 });
    const el = document.createElement('div');
    el.className = 'ekd-pv-page';
    const p = { n, page, w: vp.width, h: vp.height, el, drawnAt: 0, task: null, pending: null };
    el.__ekdPage = p;
    holder.appendChild(el);
    pages.push(p);
  }
  const oldDoc = v.doc, oldHolder = v.holder, oldPages = v.pages;
  // 先在舊畫面下面排好新頁框，畫好錨點那一頁再換上
  holder.style.cssText = 'position:absolute;left:0;top:0;right:0;visibility:hidden';
  v.root.appendChild(holder);
  v.root.hidden = false; v.tools.hidden = false;
  v.doc = doc; v.pages = pages; v.holder = holder;
  v.total.textContent = '/ ' + doc.numPages;
  if (v.current > doc.numPages) v.current = doc.numPages;
  v.swapping = true;
  layout(v, null);
  const first = pages[Math.min(pages.length, Math.max(1, a.page)) - 1];
  await draw(v, first);
  v.swapping = false;
  if (token !== v.token) return false;
  holder.style.cssText = '';
  if (oldHolder) oldHolder.remove();
  for (const p of oldPages) { if (p.task) { try { p.task.cancel(); } catch (_) {} } }
  if (oldDoc) { try { oldDoc.destroy(); } catch (_) {} }
  restore(v, a);
  observe(v);
  return true;
}

function clear(stage){
  const v = stage ? viewers.get(stage) : null;
  if (!v) return;
  v.token++;
  if (v.observer) v.observer.disconnect();
  if (v.resize) { try { v.resize.disconnect(); } catch (_) {} }
  if (v.doc) { try { v.doc.destroy(); } catch (_) {} }
  v.root.remove(); v.tools.remove();
  viewers.delete(stage);
}

// 編譯失敗時把上一份 PDF 淡化，避免把舊稿當成最新結果；下一次成功顯示時恢復
function stale(stage, on){ const v = stage && viewers.get(stage); if (v) v.root.classList.toggle('ekd-pv-stale', !!on); }

K.register('pdfview', {
  version: '1.0.0',
  show, clear, stale,
  state: stage => { const v = stage && viewers.get(stage); return v && v.doc ? { pages: v.pages.length, page: v.current, zoom: effective(v), fit: v.zoom === 'fit' } : null; },
  goTo: (stage, n) => { const v = viewers.get(stage); if (v) goTo(v, n); },
  setZoom: (stage, z) => { const v = viewers.get(stage); if (v) setZoom(v, z); }
});
})();
