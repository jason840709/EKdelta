/* ============================================================================
 * ekd-glide — 選取底塊滑動（1.2.7，視覺規範第 8.3 節）
 *
 * 「多選一」的切換（分頁、分段切換、清單裡目前的項目）在選取改變時，底色從舊位置
 * 平順滑到新位置，不是突然跳過去。做法：在容器裡放一層只畫底色的圖層，用 clip-path
 * 把它裁成選中項目的位置與大小；只動畫裁切範圍，不動版面，所以項目寬度不同也能滑。
 *
 * 規則表 RULES：item 是項目選擇器，容器就是項目的父元素；on(el) 判斷是否選中；
 * fill 是底塊顏色（設計變數名稱）。容器被整個重畫（例如檔案清單重建）時，記得上一次的
 * 位置，從那裡滑到新位置。
 *
 * 只在 #sidebar、#modal、各浮動面板這幾個容器裡監看變動，不監看編輯區，打字時不會觸發。
 * 系統設定「減少動態效果」時直接跳到新位置。
 * ========================================================================== */
(() => {
  'use strict';
  if (window.__EKD_GLIDE__) return;

  const RULES = [
    { item: '.sb-tab',               on: el => el.classList.contains('on'),                   fill: '--ui-glide' },
    { item: '.file-item',            on: el => el.classList.contains('on'),                   fill: '--ui-selected' },
    { item: '.outline-item',         on: el => el.classList.contains('ol-cur'),               fill: '--ui-selected' },
    { item: '.prefs-tab',            on: el => el.getAttribute('aria-selected') === 'true',   fill: '--ui-selected' },
    { item: '.pref-segment > label', on: el => !!el.querySelector('input:checked'),           fill: '--ui-glide' },
    { item: '.ekp-seg > button',     on: el => el.getAttribute('aria-checked') === 'true',    fill: '--ui-glide' },
    { item: '.shortcut-platform-btn', on: el => el.getAttribute('aria-selected') === 'true',  fill: '--ui-glide' },
    { item: '.pt-nav-item',          on: el => el.getAttribute('aria-selected') === 'true',   fill: '--ui-selected' },
    { item: '.mi-chip',              on: el => el.classList.contains('on'),                   fill: '--ui-glide' },
    { item: '.mi-mode > button',     on: el => el.classList.contains('on'),                   fill: '--ui-glide' },
  ];
  const WATCH = ['#sidebar', '#modal', '#cp171-ptools', '#cp171-mathin', '#cp171-s-pop', '#cp171-settings-pane'];

  const css = document.createElement('style');
  css.id = 'ekd-glide-style';
  css.textContent = `
[data-ekd-glide]>.ekd-glide{position:absolute;left:0;top:0;z-index:0;pointer-events:none;
  background:var(--ekd-glide-fill,var(--ui-glide));transition:clip-path var(--dur-medium) var(--ease-glide)}
[data-ekd-glide]>:not(.ekd-glide){position:relative;z-index:1}
[data-ekd-glide]>.ekd-glide-on{background:transparent!important;box-shadow:none!important}
@media (prefers-reduced-motion:reduce){[data-ekd-glide]>.ekd-glide{transition:none}}`;
  document.head.appendChild(css);

  const last = new WeakMap();      // 容器 → 上一次的裁切範圍（容器重畫時從這裡滑過去）
  const sized = new WeakSet();

  function ruleFor(box) {
    for (const r of RULES) {
      const first = box.querySelector(':scope > ' + r.item.split('>').pop().trim());
      if (first && first.matches(r.item)) return r;
    }
    return null;
  }

  function place(box, rule, instant) {
    let ind = box.querySelector(':scope > .ekd-glide');
    const fresh = !ind;
    if (fresh) {
      ind = document.createElement('span');
      ind.className = 'ekd-glide';
      ind.setAttribute('aria-hidden', 'true');
      box.prepend(ind);
      box.setAttribute('data-ekd-glide', '');
      box.style.setProperty('--ekd-glide-fill', 'var(' + rule.fill + ')');
      if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
    }
    const items = [...box.children].filter(el => el !== ind && el.matches(rule.item));
    const on = items.find(rule.on);
    items.forEach(el => el.classList.toggle('ekd-glide-on', el === on));
    if (!on || !box.getClientRects().length) { ind.style.visibility = 'hidden'; return; }
    ind.style.visibility = '';
    const b = box.getBoundingClientRect(), r = on.getBoundingClientRect();
    if (!b.width || !r.width) return;
    /* 底塊本身也算進捲動範圍。先把它縮成 0 量真正的內容；內容沒超出可視區時，底塊比可視區
       少 1px——可視區高度常是小數（側欄實測 671.5px，clientHeight 卻回報 672），照整數畫會多出
       半像素，撐出一條沒必要的捲軸，捲軸又讓寬度變窄、再撐出水平捲軸（1.2.7 實測）。 */
    ind.style.width = '0px'; ind.style.height = '0px';
    const W = box.scrollWidth > box.clientWidth ? box.scrollWidth : box.clientWidth - 1;
    const H = box.scrollHeight > box.clientHeight ? box.scrollHeight : box.clientHeight - 1;
    ind.style.width = W + 'px'; ind.style.height = H + 'px';
    const t = r.top - b.top + box.scrollTop - box.clientTop, l = r.left - b.left + box.scrollLeft - box.clientLeft;
    const rad = parseFloat(getComputedStyle(on).borderTopLeftRadius) || 6;
    const clip = `inset(${t}px ${W - l - r.width}px ${H - t - r.height}px ${l}px round ${rad}px)`;
    const prev = last.get(box);
    if (fresh && prev && !instant) {
      // 容器重畫：先放回上一次的位置，下一格再滑到新位置
      ind.style.transition = 'none'; ind.style.clipPath = prev; ind.getBoundingClientRect(); ind.style.transition = '';
    } else if (instant || fresh) {
      ind.style.transition = 'none'; ind.style.clipPath = clip; ind.getBoundingClientRect(); ind.style.transition = '';
      last.set(box, clip); return;
    }
    if (ind.style.clipPath !== clip) ind.style.clipPath = clip;
    last.set(box, clip);
  }

  function sweep(root, instant) {
    const boxes = new Set();
    for (const r of RULES) root.querySelectorAll(r.item).forEach(el => { if (el.parentElement) boxes.add(el.parentElement); });
    for (const box of boxes) {
      const rule = ruleFor(box); if (!rule) continue;
      if (!sized.has(box) && typeof ResizeObserver === 'function') {
        sized.add(box);
        new ResizeObserver(() => place(box, rule, true)).observe(box);
      }
      place(box, rule, instant);
    }
  }

  let raf = 0;
  const pending = new Set();
  const observers = new Map();     // 容器 → 它的 MutationObserver
  function settle(root) {
    sweep(root, false);
    // 底塊自己加的 class 與元素也會被記錄下來；處理完就丟掉，避免反覆觸發。
    const mo = observers.get(root); if (mo) mo.takeRecords();
  }
  function schedule(root) {
    pending.add(root);
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; const roots = [...pending]; pending.clear(); roots.forEach(settle); });
  }

  function watch() {
    for (const sel of WATCH) {
      const el = document.querySelector(sel);
      if (!el || observers.has(el)) continue;
      const mo = new MutationObserver(() => schedule(el));
      observers.set(el, mo);
      mo.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-selected', 'hidden'] });
      sweep(el, true); mo.takeRecords();
    }
  }
  // 選中狀態也可能只靠表單元素改變（分段切換的 radio），不一定改到屬性。
  document.addEventListener('change', e => { const m = e.target.closest && e.target.closest(WATCH.join(',')); if (m) schedule(m); }, true);
  document.addEventListener('click', e => { const m = e.target.closest && e.target.closest(WATCH.join(',')); if (m) schedule(m); }, true);

  // 浮動面板是用到時才建立；在 body 的直接子元素增減時補上監看（只看第一層，不看編輯區內部）。
  new MutationObserver(watch).observe(document.body, { childList: true });
  watch();

  /* 版面設定面板建在 #scroller 裡（不在 body 第一層），由 23.js 建好後呼叫 attach() 補上監看。 */
  window.__EKD_GLIDE__ = Object.freeze({ refresh: () => WATCH.forEach(s => { const el = document.querySelector(s); if (el) sweep(el, true); }), attach: watch });
})();
