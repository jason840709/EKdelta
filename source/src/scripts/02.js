
/* ============================================================
   Checkpoint 2(續)— 游標系統與即時渲染切換
   §4 游標工具  §5 區塊啟用/停用  §6 鍵盤與輸入事件
   ============================================================ */

/* ---------- §4 游標工具 ---------- */
function caretOffsetIn(el){                    // 游標在 el 內的文字位移
  const sel = getSelection();
  if (!sel.rangeCount) return 0;
  const r = sel.getRangeAt(0).cloneRange();
  const pre = document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(r.startContainer, r.startOffset);
  return pre.toString().length;
}
function setCaret(el, off){                    // 把游標放到 el 內第 off 個字元
  suppressSel++;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node, remain = Math.max(0, off);
  while ((node = walker.nextNode())){
    if (remain <= node.data.length){
      const r = document.createRange();
      r.setStart(node, remain); r.collapse(true);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      requestAnimationFrame(()=> suppressSel = Math.max(0, suppressSel-1));
      return;
    }
    remain -= node.data.length;
  }
  const r = document.createRange();            // 空區塊或超出:放到最後
  r.selectNodeContents(el); r.collapse(false);
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  requestAnimationFrame(()=> suppressSel = Math.max(0, suppressSel-1));
}
/* 在 el 內選取第 s 到第 e 個字元(尋找/取代用) */
function setCaretRange(el, s, e){
  suppressSel++;
  const find = off => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node, remain = Math.max(0, off);
    while ((node = walker.nextNode())){
      if (remain <= node.data.length) return [node, remain];
      remain -= node.data.length;
    }
    return null;
  };
  const a = find(s), b = find(e);
  const r = document.createRange();
  if (a && b){ r.setStart(a[0], a[1]); r.setEnd(b[0], b[1]); }
  else { r.selectNodeContents(el); r.collapse(false); }
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  requestAnimationFrame(()=> suppressSel = Math.max(0, suppressSel-1));
}
/* ============ CP79:⌘D 選取單字 / ⇧⌘D 刪除單字 ============ */
/* 純函式:游標位移 → 單字範圍 [s,e)。有 Intl.Segmenter 走 ICU 詞界(CJK 斷詞友善),
   無則退類別運行(拉丁詞/假名/諺文/漢字各自成類,標點單字元)。
   錨定:游標右側非空白優先,否則左側;兩側皆空白 → 選整段空白運行。 */
function wordSpanAt(text, off){
  if (typeof text !== 'string' || !text.length) return [0, 0];
  const n = text.length;
  if (!(off >= 0)) off = 0;
  if (off > n) off = n;
  const isSp = ch => /\s/.test(ch);
  let a = -1;
  if (off < n && !isSp(text[off])) a = off;
  else if (off > 0 && !isSp(text[off - 1])) a = off - 1;
  if (a < 0){
    let s = off, e = off;
    while (s > 0 && isSp(text[s - 1])) s--;
    while (e < n && isSp(text[e])) e++;
    return [s, e];
  }
  if (typeof Intl !== 'undefined' && Intl.Segmenter){
    try {
      for (const seg of new Intl.Segmenter(undefined, { granularity:'word' }).segment(text)){
        if (seg.index <= a && a < seg.index + seg.segment.length)
          return [seg.index, seg.index + seg.segment.length];
      }
    } catch(_){ /* 環境異常 → 走後備 */ }
  }
  const cls = ch =>
    /[A-Za-z0-9_\u00C0-\u024F]/.test(ch) ? 'w' :
    /[\u3040-\u30FF]/.test(ch)           ? 'j' :
    /[\uAC00-\uD7AF]/.test(ch)           ? 'k' :
    /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/.test(ch) ? 'c' :
    isSp(ch) ? 's' : 'p';
  const c0 = cls(text[a]);
  if (c0 === 'p') return [a, a + 1];
  let s = a, e = a + 1;
  while (s > 0 && cls(text[s - 1]) === c0) s--;
  while (e < n && cls(text[e]) === c0) e++;
  return [s, e];
}
/* 目前編輯焦點所在的可編輯容器(區塊原始碼態/行內浮層/表格儲存格) */
function wordEditCtx(){
  if (mathEditEl) return { kind:'math', el: mathEditEl, text: structuredLocalText(mathEditEl, mathEditInfo) };
  if (tableEdit){
    const sel = getSelection();
    let cell = null;
    if (sel.rangeCount){
      let nd = sel.getRangeAt(0).startContainer;
      if (nd.nodeType !== 1) nd = nd.parentNode;
      cell = nd && nd.closest ? nd.closest('[data-r]') : null;
      if (cell && !tableEdit.el.contains(cell)) cell = null;
    }
    if (!cell) cell = tableEdit.el.querySelector(`[data-r="${tableEdit.cell.r}"][data-c="${tableEdit.cell.c}"]`);
    return cell ? { kind:'cell', el: cell, text: cell.textContent } : null;
  }
  const i = activeIndex, el = i >= 0 ? editor.children[i] : null;
  if (!el || !el.classList.contains('active')) return null;
  return { kind:'block', el, i, text: blocks[i] ?? '' };
}
function cmdSelectWord(){
  const ctx = wordEditCtx();
  if (!ctx) return;
  const r = wordSpanAt(ctx.text, caretOffsetIn(ctx.el));
  if (r[1] > r[0]) setCaretRange(ctx.el, r[0], r[1]);
}
function cmdDeleteWord(){
  const ctx = wordEditCtx();
  if (!ctx) return;
  const r = wordSpanAt(ctx.text, caretOffsetIn(ctx.el));
  const s = r[0], e = r[1];
  if (e <= s) return;
  const next = ctx.text.slice(0, s) + ctx.text.slice(e);
  if (ctx.kind === 'math'){
    /* 沿 acApply mathEl 分支:浮層提交時整包入 undo,此處不 pushUndo */
    ctx.el.textContent = next;
    setCaret(ctx.el, s);
    if (mathEditInfo && mathEditInfo.isMath) showMathPreview(ctx.el, ctx.el.textContent);
    return;
  }
  pushUndo();
  if (ctx.kind === 'cell'){
    suppressSel++;
    ctx.el.textContent = next;
    setCaret(ctx.el, s);
    requestAnimationFrame(function(){ suppressSel = Math.max(0, suppressSel - 1); });
    syncTableFromDOM();
    onEdited(); updateBlockInfo(); schedulePaginate();
    return;
  }
  blocks[ctx.i] = next;
  suppressSel++;
  ctx.el.textContent = next;
  setCaret(ctx.el, s);
  requestAnimationFrame(function(){ suppressSel = Math.max(0, suppressSel - 1); });
  onEdited(); updateBlockInfo(); refreshBlockMathPreview(); schedulePaginate();
}
/* ============ CP80:⌘L 選取表格列 / 目前行 ============ */
/* 純函式:游標位移 → 換行界定的行範圍 [s,e)(不含換行字元本身)。
   off=0 特判:lastIndexOf('\n', -1) 會被夾成 fromIndex 0 而誤命中首字元換行。
   游標恰在 \n 上=選它左側那一行;單行文本=全選。 */
function lineSpanAt(text, off){
  if (typeof text !== 'string' || !text.length) return [0, 0];
  const n = text.length;
  if (!(off >= 0)) off = 0;
  if (off > n) off = n;
  const s = off === 0 ? 0 : text.lastIndexOf('\n', off - 1) + 1;
  let e = text.indexOf('\n', off);
  if (e < 0) e = n;
  return [s, e];
}
function cmdSelectRow(){
  const ctx = wordEditCtx();
  if (!ctx) return;
  if (ctx.kind === 'cell'){
    /* Markdown _selectLine 語意:儲存格內=選取整列 <tr>(跨儲存格 Range,供複製/檢視) */
    const tr = ctx.el.closest('tr');
    if (!tr) return;
    suppressSel++;
    const rg = document.createRange(); rg.selectNodeContents(tr);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(rg);
    requestAnimationFrame(function(){ suppressSel = Math.max(0, suppressSel - 1); });
    return;
  }
  const r = lineSpanAt(ctx.text, caretOffsetIn(ctx.el));
  if (r[1] > r[0]) setCaretRange(ctx.el, r[0], r[1]);
}
function blockElOf(node){
  while (node && node !== editor){
    if (node.nodeType === 1 && node.classList.contains('block')) return node;
    node = node.parentNode;
  }
  return null;
}
const blockIndexOf = el => [...editor.children].indexOf(el);

/* 渲染文字位移 → 原始碼位移(跳過 Markdown 符號) */
function visibleToRaw(src, v){
  if (src.includes('\n')){                     // 程式碼/數學區塊:略過第一行定界
    const bt = blockType(src);
    if (bt === 'code' || bt === 'math'){
      const first = src.indexOf('\n') + 1;
      return Math.min(first + v, src.length);
    }
    return src.length;                         // 表格:退回區塊尾端
  }
  const np = noIndentParts(src);
  const body = np.body;
  let i = 0;
  const pre = body.match(/^(#{1,6}\s+|>\s?|\s*[-*+]\s+(\[[ xX]\]\s+)?|\s*\d+\.\s+)/);
  if (pre) i += pre[0].length;
  let vis = 0;
  while (i < body.length && vis < v){
    const rest = body.slice(i);
    if (/^(\*\*\*|___)/.test(rest)) { i += 3; continue; }
    if (/^(\*\*|__|~~|==|\$\$)/.test(rest)) { i += 2; continue; }
    if (/^[*_`$]/.test(rest)) { i += 1; continue; }
    if (rest.startsWith('![')) { i += 2; continue; }
    if (rest[0] === '[') { i += 1; continue; }
    const lm = rest.match(/^\]\([^)]*\)/);
    if (lm) { i += lm[0].length; continue; }
    if (rest[0] === ']') { i += 1; continue; }
    i++; vis++;
  }
  return noIndentBodyToRaw(np, i);
}

/* ---------- §5 區塊啟用(顯示原始碼)/ 停用(渲染) ---------- */
function rawClassFor(src){
  const t = blockType(src);
  if (t === 'h'){
    const m=String(src).match(RE.h),lv=m?m[1].length:markdownSetextLevel(src);
    return lv?' raw-h'+lv:'';
  }
  if (t === 'code' || t === 'table' || t === 'math' || t === 'meta' || t === 'html') return ' raw-mono';
  return '';
}
function activeClassFor(src){
  return 'block active' + rawClassFor(src) + (noIndentParts(src).on ? ' no-indent' : '');
}
function activate(i, rawOff){
  if (i < 0 || i >= blocks.length) return;
  /* CP102 體質加固:程式化 activate(測試/內部指令)可能在異步 selectionchange 開出的
     宿主尚未落地時被呼叫 → 先提交跨塊殘留宿主,防 stale mathEditInfo 重導後續指令
     (cmdNoIndent 等)。同塊宿主不動:既有 Enter/快捷路徑自行管理其生命週期。 */
  if (mathEditEl && mathEditInfo && mathEditInfo.i !== i) commitMathEdit();
  if (typeof inPaperMode === 'function' && inPaperMode() && !settings.srcmode){
    if (typeof openPaperEdit === 'function') openPaperEdit(i, rawOff);   // CP10:改道浮動編輯框
    return;
  }
  const el = editor.children[i];
  if (!el) return;
  suppressSel++;
  el.className = activeClassFor(blocks[i]);
  el.textContent = blocks[i];
  activeIndex = i;
  setCaret(el, rawOff ?? blocks[i].length);
  requestAnimationFrame(()=> suppressSel = Math.max(0, suppressSel-1));
  if (settings.typewriter) el.scrollIntoView({ block:'center' });
  updateBlockInfo();
  refreshBlockMathPreview();                   // 數學區塊 → 浮動即時預覽
  schedulePaginate();
}
function deactivate(commit = true){
  if (typeof acHide === 'function') acHide();        // CP53:離開編輯態即收補全面板
  if (activeIndex < 0) return;
  const el = editor.children[activeIndex];
  if (el){
    /* CP36 防呆:僅「原始碼態」(class 含 active)才回讀 DOM;若 activeIndex
       因異常指著渲染態區塊,getRawText 只會取回可見文字 → 定界符被剝除。 */
    if (commit && el.classList.contains('active')) blocks[activeIndex] = getRawText(el);
    el.className = 'block';
    el.innerHTML = renderBlockHTML(blocks[activeIndex]);
  }
  activeIndex = -1;
  refreshBlockMathPreview();                   // 離開數學區塊 → 收起預覽
  schedulePaginate();
}
function rerender(i){
  const el = editor.children[i];
  if (el && i !== activeIndex) el.innerHTML = renderBlockHTML(blocks[i]);
}
function insertBlockAfter(i, src){
  blocks.splice(i+1, 0, src);
  const el = document.createElement('div');
  el.className = 'block';
  el.innerHTML = renderBlockHTML(src);
  editor.children[i] ? editor.children[i].after(el) : editor.appendChild(el);
}
function removeBlockAt(i){
  blocks.splice(i, 1);
  editor.children[i]?.remove();
  if (activeIndex === i) activeIndex = -1;
  else if (activeIndex > i) activeIndex--;
}

/* ---------- 游標移動 → 切換啟用區塊 ----------
   CP31:滑鼠手勢(mousedown~mouseup)期間不切換模式。舊制在 mousedown 當下
   就置換 DOM(activate / startMathEdit / startPlainEdit),瀏覽器 mouseup 收尾時
   點擊錨點已被毀 → 游標被甩回段首或落空(點第一下跳開頭、要點第二下的病根)。
   改為:手勢中選取變化只記 dirty,mouseup 後(原生選取已定案)再統一處理;
   拖曳選取(結束時非 collapsed)自然放行,不再被中途置換打斷。 */
let mouseGesture = false, gestureSelDirty = false, gestureXY = null;

function caretFromPoint(x, y){               // 座標 → {node, offset}(跨瀏覽器)
  if (document.caretRangeFromPoint){
    const r = document.caretRangeFromPoint(x, y);
    return r ? { node: r.startContainer, offset: r.startOffset } : null;
  }
  if (document.caretPositionFromPoint){
    const p = document.caretPositionFromPoint(x, y);
    return p ? { node: p.offsetNode, offset: p.offset } : null;
  }
  return null;
}

editor.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  mouseGesture = true; gestureSelDirty = false;
}, true);
document.addEventListener('mouseup', e => {
  if (!mouseGesture) return;
  mouseGesture = false;
  gestureXY = { x: e.clientX, y: e.clientY };   // CP32:一律記錄落點座標
  if (!gestureSelDirty){
    /* 快速點擊:selectionchange 常遲於 mouseup 才到(事件排程使然),
       座標先留著給緊接而來的那次事件當備援,下一輪清掉 */
    setTimeout(() => { gestureXY = null; }, 0);
    return;
  }
  gestureSelDirty = false;
  setTimeout(() => { onSelectionChange(); gestureXY = null; }, 0);
}, true);
window.addEventListener('blur', () => { mouseGesture = false; gestureSelDirty = false; });

function onSelectionChange(){
  if (composing || suppressSel > 0 || settings.srcmode) return;
  if (typeof inPaperMode === 'function' && inPaperMode()) return;   // 論文模式:版面不因游標而動(CP10)
  if (mouseGesture){ gestureSelDirty = true; return; }              // CP31:待 mouseup 後處理
  const sel = getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return;
  let n = sel.anchorNode, nOff = sel.anchorOffset;
  if (mathEditEl){                                  // 公式/格式/純文字編輯中:游標仍在框內就不動
    if (mathEditEl === n || mathEditEl.contains(n)) return;
    /* CP32:點擊落在「編輯框同一區塊」時,commit 重渲染會毀掉點擊錨點且重排版面
       (座標找回會偏移、快速點擊時座標甚至來不及記)。改為 commit 前先以
       「可見字元位移」記錄落點 — 點在框前:自區塊頭起算(前段 raw 不變,重排後不動);
       點在框後:自區塊尾倒算(後段 raw 不變)— commit 後以同一位移精確還原,
       與版面寬窄、提交內容增減皆無關。 */
    let sameBlockKey = null;
    const editBlockEl = mathEditInfo && mathEditInfo.blockEl;
    if (n && editBlockEl && blockElOf(n) === editBlockEl){
      try {
        const total = offsetInBlock(editBlockEl, editBlockEl, editBlockEl.childNodes.length);
        const front = offsetInBlock(editBlockEl, n, nOff);
        const rel = mathEditEl.compareDocumentPosition(n);
        if (rel & Node.DOCUMENT_POSITION_PRECEDING)      sameBlockKey = { front };
        else if (rel & Node.DOCUMENT_POSITION_FOLLOWING) sameBlockKey = { back: total - front };
      } catch(_){ sameBlockKey = null; }
    }
    commitMathEdit();
    if (n && !n.isConnected){
      if (sameBlockKey && editBlockEl && editBlockEl.isConnected){
        const totalPost = offsetInBlock(editBlockEl, editBlockEl, editBlockEl.childNodes.length);
        const vis = sameBlockKey.front !== undefined
          ? Math.min(sameBlockKey.front, totalPost)
          : Math.max(0, totalPost - sameBlockKey.back);
        setCaret(editBlockEl, vis);
        const s2 = getSelection();
        if (!s2.rangeCount) return;
        n = s2.anchorNode; nOff = s2.anchorOffset;
      } else {
        /* 備援:跨情境或量測失敗 → 以 mouseup 座標找回落點(CP31 原機制) */
        if (!gestureXY) return;
        const p = caretFromPoint(gestureXY.x, gestureXY.y);
        if (!p || !editor.contains(p.node)) return;
        n = p.node; nOff = Math.min(p.offset, n.nodeType === 3 ? n.data.length : n.childNodes.length);
        suppressSel++;
        const r = document.createRange();
        try { r.setStart(n, nOff); } catch(_){ r.selectNodeContents(n); }
        r.collapse(true);
        sel.removeAllRanges(); sel.addRange(r);
        requestAnimationFrame(()=> suppressSel = Math.max(0, suppressSel - 1));
      }
    }
  }
  const el = blockElOf(n);
  if (!el){ return; }
  const i = blockIndexOf(el);
  if (tableEdit){                                    // 表格編輯中:同一表格內移動放行
    if (i === tableEdit.i) return;
    exitTableEdit();
  }
  if (i === activeIndex) return;
  if (blockType(blocks[i] ?? '') === 'table'){       // 表格 → 逐格編輯模式,不再整塊原始碼
    deactivate(true);
    enterTableEdit(i);
    scheduleUI();
    return;
  }
  let vOff = caretOffsetIn(el);                // 先記下渲染狀態下的位移
  /* T8 v1.1(CP102):flag on 時 .md-meta 常駐 DOM 但視覺隱藏;Range.toString 會計入
     其字元,而 visibleToRaw 期望「螢幕可見」位移 → 扣除游標前的隱藏定界符長度。
     T8 v2(CP114):連結網址段 .md-content 同屬隱藏字元,一併扣除(兩類皆單一文字節點,
     退化構造由 startIlEdit 不變量守衛回退舊路)。flag off 或論文類主題時 DOM 無此兩類,迴圈零次,行為不變。 */
  if (mdMetaEnabledHere()){
    try {
      const r0 = sel.getRangeAt(0);
      let hid = 0;
      el.querySelectorAll('.md-meta, .md-content').forEach(ms => {   /* T8 v2(CP114) */
        const t = ms.firstChild;
        if (!t || t.nodeType !== 3) return;
        if (r0.comparePoint(t, t.data.length) <= 0) hid += t.data.length;   // 整個 meta 位於游標前
        else if (r0.startContainer === t) hid += r0.startOffset;            // 游標位於 meta 內(展開態)
      });
      vOff = Math.max(0, vOff - hid);
    } catch(_){}
  }
  const curType = blockType(blocks[i] ?? '');
  const atListContentStart = (curType === 'ul' || curType === 'ol' || curType === 'task') && vOff === 0;
  /* T8 v1.1(CP102):il 就地編輯 — flag on 且游標落於 [data-il] 內 → 不切換編輯宿主,
     由 startIlEdit 以「渲染 DOM 即編輯面」接管(md-il textContent === token 原始碼,
     顯形/輸入/提交見該函式);CP37 清單內容前緣仍讓位給零寬 plain-edit。 */
  if (!atListContentStart && mdMetaEnabledHere()){
    const h0 = n.nodeType === 1 ? n : n.parentElement;
    let ilTarget = null;
    for (let p = h0; p && p !== el && p !== editor; p = p.parentElement)
      if (p.dataset && p.dataset.il !== undefined) ilTarget = p;            // 持續覆寫 → 最外層
    if (ilTarget && el.contains(ilTarget) && startIlEdit(ilTarget, el, i)) return;
  }
  /* 行內樣式(粗/斜/刪/標記/行內碼):游標落在該渲染元素上 → 只展開該一段,
     其餘維持渲染(連結與圖片另由 mousedown 攔截)。
     CP37:清單內容第一個字若本身是 token,游標在它的前緣時要保留一個零寬
     plain-edit 落點,讓第一次 Backspace 能取消清單,不可先被 token 編輯攔走。
     CP40(T2 邊界歸屬):token 可見文字的 0/尾端是「邊界」,歸屬外側 —— 與
     renderedPointToRaw / startPlainEdit 既有慣例、以及 Markdown 行為(游標貼著
     粗體邊緣不展開語法)一致。點在前後緣 → 放行給 startPlainEdit,由其
     零寬/相鄰間隙機制落點;只有真正點進 token 內部才開 token 編輯。 */
  if (!atListContentStart){
    /* CP174.4: colour spans are complete HTML wrappers. They must not enter
       startMathEdit (which exposes literal markup); route them to the same
       canonical raw editor used by a Markdown bookmark, preserving the local
       caret. Non-colour inline tokens keep the existing token editor. */
    if (colorWrapperAtPoint(el, n, nOff)){
      let colorRawOff = null;
      try {
        const mapped = typeof paperPointToRaw === 'function'
          ? paperPointToRaw(el, blocks[i] ?? '', n, nOff,
              gestureXY && gestureXY.x, gestureXY && gestureXY.y) : null;
        if (Number.isFinite(mapped)) colorRawOff = mapped;
        else if (mapped && Number.isFinite(mapped.off)) colorRawOff = mapped.off;
      } catch(_){ colorRawOff = null; }
      if (!Number.isFinite(colorRawOff)) {
        try {
          const mapped = typeof renderedPointToRaw === 'function'
            ? renderedPointToRaw(el, blocks[i] ?? '', n, nOff) : null;
          if (mapped && Number.isFinite(mapped.off)) colorRawOff = mapped.off;
          else if (mapped && mapped.tok && Number.isFinite(mapped.tok.start)) colorRawOff = mapped.tok.start;
        } catch(_){ colorRawOff = null; }
      }
      /* HTML tags are absent from rendered text, so visibleToRaw() is not a
         safe fallback here: it would count `<span ...>` bytes as glyphs and
         can place the caret at the paragraph tail. Snap to this token's raw
         start instead, matching Markdown's bookmark boundary semantics. */
      if (!Number.isFinite(colorRawOff)) {
        try {
          const h = n.nodeType === 1 ? n : n.parentElement;
          const c = h && h.closest ? h.closest('[data-si]') : null;
          const idx = c && c.dataset && c.dataset.si != null ? Number(c.dataset.si) : -1;
          const rr = idx >= 0 ? styleRangesOf(blocks[i] ?? '')[idx] : null;
          if (rr && Number.isFinite(rr.start)) colorRawOff = rr.start;
        } catch(_){ colorRawOff = null; }
      }
      if (!Number.isFinite(colorRawOff)) colorRawOff = 0;
      if (activeIndex >= 0 && activeIndex !== i) deactivate(true);
      activate(i, colorRawOff); return;
    }
    const host = n.nodeType === 1 ? n : n.parentElement;
    const tok = host && host.closest && host.closest('[data-si]');
    if (tok && tok.tagName !== 'A' && tok.tagName !== 'IMG' && el.contains(tok)){
      const rr = document.createRange();
      rr.selectNodeContents(tok);
      let innerOff = null;
      try { rr.setEnd(n, nOff); innerOff = rr.toString().length; } catch(_){}
      const tokTotal = tok.textContent.length;
      const atEdge = innerOff !== null && tokTotal > 0 && (innerOff <= 0 || innerOff >= tokTotal);
      if (!atEdge && startMathEdit(tok, innerOff)) return;
    }
  }
  const rawOff = visibleToRaw(blocks[i] ?? '', vOff);
  /* CP174.4: a colour wrapper is a renderable HTML token, but clicking it
     must still enter the canonical raw editor at the local caret. Resolve
     the rendered point with the same raw↔DOM mapper used by source-based
     bookmark restoration; never create a temporary host inside the span. */
  if (colorWrapperAtPoint(el, n, nOff)){
    let colorRawOff = null;
    try {
      const mapped = typeof paperPointToRaw === 'function'
        ? paperPointToRaw(el, blocks[i] ?? '', n, nOff,
            gestureXY && Number.isFinite(gestureXY.x) ? gestureXY.x : undefined,
            gestureXY && Number.isFinite(gestureXY.y) ? gestureXY.y : undefined) : null;
      if (Number.isFinite(mapped)) colorRawOff = mapped;
      else if (mapped && Number.isFinite(mapped.off)) colorRawOff = mapped.off;
    } catch(_){ colorRawOff = null; }
    if (!Number.isFinite(colorRawOff)) {
      try {
        const mapped = typeof renderedPointToRaw === 'function'
          ? renderedPointToRaw(el, blocks[i] ?? '', n, nOff) : null;
        if (mapped && Number.isFinite(mapped.off)) colorRawOff = mapped.off;
        else if (mapped && mapped.tok && Number.isFinite(mapped.tok.start)) colorRawOff = mapped.tok.start;
      } catch(_){ colorRawOff = null; }
    }
    if (!Number.isFinite(colorRawOff)) colorRawOff = rawOff;
    if (activeIndex >= 0 && activeIndex !== i) deactivate(true);
    activate(i, colorRawOff); return;
  }
  if (startPlainEdit(el, i, n, nOff, rawOff)) return;   // CP30:純文字逐段編輯
  /* CP174.1：HTML 色彩 wrapper 是真正的父層標籤。它裡面若同時含公式，
     純文字局部宿主不能把 raw 的結尾標籤當成可見文字塞回 wrapper，否則
     點擊中文後會露出 literal </span>。保留渲染態與原生游標，不拆 wrapper；
     重新選取後仍可用工具列套用／清除色彩。 */
  let colorNode = n && (n.nodeType === 1 ? n : n.parentElement), colorHost = null;
  while (colorNode && colorNode !== el && colorNode !== editor){
    if (colorNode.tagName === 'SPAN' && /\bcolor\s*:/i.test(colorNode.getAttribute('style') || '')){ colorHost = colorNode; break; }
    colorNode = colorNode.parentElement;
  }
  if (colorHost && el.contains(colorHost)) { scheduleUI(); return; }
  deactivate(true);
  activate(i, rawOff);
  scheduleUI();
}
document.addEventListener('selectionchange', onSelectionChange);
/* T8(CP101/114):md-meta 顯形調度 — 摺疊游標所在「最外層」[data-il] 加 .md-expand,其餘全收合;
   後代組合選取器令展開時其內全部定界字與網址(含巢狀內層)一併顯形。獨立 listener,不侵入
   onSelectionChange;flag off 或任一論文分頁主題(Paper/TW_THESIS/TW_THESIS2)清除殘留展開後零行為。 */
function mdMetaExpandUpdate(){
  if (!mdMetaEnabledHere()){
    editor.querySelectorAll('.md-il.md-expand').forEach(x => x.classList.remove('md-expand'));
    return;
  }
  let target = null;
  const sel = getSelection();
  if (sel && sel.rangeCount && sel.isCollapsed){
    let n = sel.anchorNode;
    if (n && n.nodeType === 3) n = n.parentElement;
    if (n && editor.contains(n))
      for (let p = n; p && p !== editor; p = p.parentElement)
        if (p.dataset && p.dataset.il !== undefined) target = p;     /* 持續覆寫 → 最外層 */
  }
  editor.querySelectorAll('.md-il.md-expand').forEach(x => { if (x !== target) x.classList.remove('md-expand'); });
  if (target) target.classList.add('md-expand');
}
document.addEventListener('selectionchange', mdMetaExpandUpdate);
window.__T8_MDMETA__ = Object.freeze({
  enabled: () => settings.mdMetaPilot === true,
  activeHere: () => mdMetaEnabledHere(),
  setEnabled(v){
    settings.mdMetaPilot = v === true;
    persist();
    const f = typeof activeFile === 'function' ? activeFile() : null;
    if (f && typeof mountDoc === 'function') mountDoc(f.content);    /* 重掛以套用/退場 */
    mdMetaExpandUpdate();
    return settings.mdMetaPilot;
  }
});

editor.addEventListener('blur', () => {
  if (composing) return;
  setTimeout(() => {
    if (document.activeElement !== editor && !editor.contains(document.activeElement)){
      if (tblLayoutOpen() && tblLayoutEl && tblLayoutEl.contains(document.activeElement)) return; // CP119:select 可操作
      commitMathEdit();
      exitTableEdit();
      deactivate(true); scheduleUI();
    }
  }, 0);
});

/* ---------- §6 鍵盤事件 ---------- */
editor.addEventListener('compositionstart', () => { composing = true; ilArmUndo(); });  /* T8 v1.1:IME 組字前武裝 il 快照 */
editor.addEventListener('compositionend',   () => {
  composing = false;
  if(window.__CP162D_ATOMIC_COMPAT__?.active)return;
  if (mathEditEl){ normalizeStructuredSentinel(); if (mathEditInfo && mathEditInfo.isMath) showMathPreview(mathEditEl, mathEditEl.textContent); return; }
  if (tableEdit){ syncTableFromDOM(); onEdited(); return; }
  if (activeIndex >= 0 && editor.children[activeIndex])
    blocks[activeIndex] = getRawText(editor.children[activeIndex]);
  refreshBlockMathPreview();
  onEdited();
});

/* 自動配對(規格 §5.4,Checkpoint 4.1 智慧升級):
   ‧ 括號/引號:插入配對、跳過既有閉合、選取包覆
   ‧ Markdown 記號 * _ ~ = $:打一個 → x|x;在 x|x 中再打一個 → xx|xx(粗體/螢光/顯示公式一氣呵成)
   ‧ 防呆:英數字後不配對(2*3、snake_case、100$)、don't 撇號、行首連打 ` 走圍欄流程、
     code/math/table 區塊內不配對 Markdown 記號、IME 組字期間不介入 */
const PAIR_OPEN  = { '(':')', '[':']', '{':'}' };
const PAIR_SAME  = new Set(['"', "'", '`', '*', '_', '~', '=', '$']);
const PAIR_WRAP  = { '*':'*','_':'_','~':'~','=':'=','$':'$','"':'"',"'":"'",'`':'`', ...PAIR_OPEN };
const PAIR_CLOSE = new Set([')', ']', '}']);
const PAIR_DEL   = { ...PAIR_OPEN, '"':'"', "'":"'", '`':'`', '*':'*','_':'_','~':'~','=':'=','$':'$' };
const PAIR_GROW  = '*_~=$';                    // 支援 x|x → xx|xx 擴展的記號
function pairApply(el, next, caret, selEnd){
  blocks[activeIndex] = next;
  el.textContent = next;
  el.className = activeClassFor(next);
  if (selEnd !== undefined) setCaretRange(el, caret, selEnd);
  else setCaret(el, caret);
  onEdited();
}
function tryAutoPair(e){
  if (activeIndex < 0 || e.metaKey || e.ctrlKey || e.altKey) return false;
  const ch = e.key;
  if (ch.length !== 1 || !(ch in PAIR_WRAP)) return false;
  const el = editor.children[activeIndex];
  const src = getRawText(el);
  const sel = getSelection();
  const bt = blockType(src);

  /* 選取包覆:任何配對字元都可一鍵包住選取文字 */
  if (!sel.isCollapsed && blockElOf(sel.focusNode) === el && blockElOf(sel.anchorNode) === el){
    const a = offsetInBlock(el, sel.anchorNode, sel.anchorOffset);
    const b = offsetInBlock(el, sel.focusNode, sel.focusOffset);
    const s0 = Math.min(a, b), e0 = Math.max(a, b);
    pushUndoSoft();
    pairApply(el, src.slice(0, s0) + ch + src.slice(s0, e0) + PAIR_WRAP[ch] + src.slice(e0), s0 + 1, e0 + 1);
    return true;
  }
  if (!sel.isCollapsed) return false;
  const off = caretOffsetIn(el);
  const prev = src[off - 1] || '', next = src[off] || '';

  if (PAIR_CLOSE.has(ch) && next === ch){ setCaret(el, off + 1); return true; }   // 跳過閉合括號

  if (PAIR_SAME.has(ch)){
    if (next === ch){
      /* 智慧擴展:恰為 x|x 時再打 x → xx|xx(例:$|$ → $$|$$、*|* → **|**) */
      if (PAIR_GROW.includes(ch) && prev === ch && src[off - 2] !== ch && src[off + 1] !== ch){
        pushUndoSoft();
        pairApply(el, src.slice(0, off) + ch + src[off] + ch + src.slice(off + 1), off + 1);
        return true;
      }
      setCaret(el, off + 1); return true;                    // 其餘:跳過既有閉合
    }
    if (ch === "'" && /[A-Za-z0-9]/.test(prev)) return false;             // don't
    if (PAIR_GROW.includes(ch)){
      if (/[A-Za-z0-9]/.test(prev)) return false;                          // 2*3、a_b、100$
      if (bt === 'code' || bt === 'math' || bt === 'table') return false;  // 原始區塊內不配對記號
      if (ch === '$' && /[0-9]/.test(next)) return false;                  // 游標插在數字前
    }
    if (ch === '`'){
      if (bt === 'code' || bt === 'table') return false;
      if (/^`+$/.test(src.slice(0, off))) return false;                    // 行首連打 ` → 圍欄流程
    }
    pushUndoSoft();
    pairApply(el, src.slice(0, off) + ch + ch + src.slice(off), off + 1);
    return true;
  }
  if (ch in PAIR_OPEN){
    pushUndoSoft();
    pairApply(el, src.slice(0, off) + ch + PAIR_OPEN[ch] + src.slice(off), off + 1);
    return true;
  }
  return false;
}

/* ============================================================
   Checkpoint 5 — §5a 行內公式逐一編輯 + 浮動即時預覽(規格 §9.4)
   點擊單一公式 → 只有它變原始碼(其餘維持渲染),下方浮動框
   即時顯示渲染結果;Enter/點他處提交、Esc 取消。
   ============================================================ */
let mathEditEl = null, mathEditInfo = null;   // {i, mi, start, end, raw, blockEl, ctx}
let editContextEpoch = 1;
function editContextBump(reason){editContextEpoch++;return {epoch:editContextEpoch,reason:String(reason||'')};}
function editContextStamp(i){return {epoch:editContextEpoch,fileId:String(typeof activeId==='undefined'?'':activeId),block:Number(i)};}
function editContextValid(info,i){
  const c=info&&info.ctx;
  return !!(c&&c.epoch===editContextEpoch&&c.fileId===String(typeof activeId==='undefined'?'':activeId)&&c.block===Number(i));
}
function clearStaleMathEdit(){mathEditEl=null;mathEditInfo=null;if(typeof hideMathPreview==='function')hideMathPreview();}
let mpAnchor = null, mpText = '', mpTex = '', mpDisplay = false;
const mathPreview = $('#math-preview');

function showMathPreviewTex(anchorEl, tex, display, sourceText){
  mpAnchor = anchorEl;
  mpText = sourceText == null ? String(tex == null ? '' : tex) : String(sourceText);
  mpTex = String(tex == null ? '' : tex);
  mpDisplay = !!display;
  mathPreview.firstElementChild.innerHTML =
    mpTex.trim() ? mathHTML(mpTex, mpDisplay) : '<span class="mp-empty">(空白公式 — 開始輸入即預覽)</span>';
  mathPreview.classList.remove('mp-hidden');
  const r = anchorEl.getBoundingClientRect();
  const w = mathPreview.offsetWidth, h = mathPreview.offsetHeight;
  let left = Math.max(8, Math.min(r.left, innerWidth - w - 12));
  let top = r.bottom + 8;
  if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 8);
  mathPreview.style.left = left + 'px';
  mathPreview.style.top = top + 'px';
}
function showMathPreview(anchorEl, text){
  const math = mathSourceParts(text, 'auto');
  showMathPreviewTex(anchorEl, math.tex, math.display, text);
}
function hideMathPreview(){ mathPreview.classList.add('mp-hidden'); mpAnchor = null; }
scroller.addEventListener('scroll', () => {
  if (!mathPreview.classList.contains('mp-hidden') && mpAnchor && mpAnchor.isConnected)
    showMathPreviewTex(mpAnchor, mpTex, mpDisplay, mpText);
}, { passive: true });

function startMathEdit(span, innerOff){
  const blockEl = blockElOf(span);
  if (!blockEl) return false;
  const i = blockIndexOf(blockEl);
  if (blockType(blocks[i] ?? '') === 'table') return false;   // 表格另有編輯模式
  const isMath = span.dataset.mi !== undefined;
  const idx = +(isMath ? span.dataset.mi : span.dataset.si);
  const r = (isMath ? mathRangesOf(blocks[i] ?? '') : styleRangesOf(blocks[i] ?? ''))[idx];
  if (!r) return false;
  exitTableEdit();
  deactivate(true);
  pushUndo();
  const raw = blocks[i];
  mathEditInfo = { i, mi: idx, attr: isMath ? 'mi' : 'si', isMath, start: r.start, end: r.end, raw, blockEl, ctx:editContextStamp(i) };
  const seg = raw.slice(r.start, r.end);
  const edit = document.createElement('span');
  edit.className = 'math-edit' + (isMath ? '' : ' tok-edit');
  edit.contentEditable = 'true';
  edit.spellcheck = false;
  edit.textContent = seg;
  suppressSel++;
  span.replaceWith(edit);
  mathEditEl = edit;
  if (isMath){
    const closeLen = /\\\)$/.test(seg) ? 2 : /\$\$$/.test(seg) ? 2 : 1;
    setCaret(edit, Math.max(0, seg.length - closeLen));
  } else {
    /* 游標落在點擊的字元上:渲染內文位移 + 開頭定界符長度 */
    const off = Math.min(seg.length, Math.max(0, (r.open || 0) + (innerOff ?? seg.length)));
    setCaret(edit, off);
  }
  requestAnimationFrame(()=> suppressSel = Math.max(0, suppressSel - 1));
  if (isMath) showMathPreview(edit, seg);
  return true;
}
/* CP152：空結構編輯宿主用零寬字元提供穩定文字節點。讀取模型與計算 raw caret 時必須剔除它。 */
function structuredLocalText(el, info){
  const t = el ? (el.textContent || '') : '';
  return info && info.structType ? t.replace(/​/g, '') : t;
}
function structuredLocalCaret(el, info){
  let off = caretOffsetIn(el);
  if (!(info && info.structType) || !el) return off;
  const t = el.textContent || '';
  if (t.charCodeAt(0) === 0x200B && off > 0) off--;
  return Math.max(0, off);
}
/* CP153：inline contenteditable 在只剩一個字時，Chromium 可能把第一次 Backspace
   解讀成「游標跨越宿主邊界」而非刪字。結構內容宿主改由模型位移自行刪除，
   同時以 grapheme 邊界避免把代理對或組合字拆半。 */
function structuredSelectionOffsets(el, info){
  const sel = getSelection();
  if (!el || !sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.startContainer) || !el.contains(r.endContainer)) return null;
  const measure = (node, off) => {
    const q = document.createRange();
    q.selectNodeContents(el); q.setEnd(node, off);
    let n = q.toString().length;
    const t = el.textContent || '';
    if (info && info.structType && t.charCodeAt(0) === 0x200B && n > 0) n--;
    return Math.max(0, n);
  };
  const a = measure(r.startContainer, r.startOffset), b = measure(r.endContainer, r.endOffset);
  return { start:Math.min(a,b), end:Math.max(a,b), collapsed:r.collapsed };
}
function structuredSetLocalText(el, info, text, start, end = start){
  if (!el) return;
  text = String(text == null ? '' : text);
  const empty = !text.length;
  if (empty){ el.dataset.structEdit = '1'; el.textContent = '​'; }
  else { delete el.dataset.structEdit; el.textContent = text; }
  const add = empty ? 1 : 0;
  setCaretRange(el, Math.max(0,start)+add, Math.max(0,end)+add);
}
function structuredGraphemeBoundary(text, off, dir){
  text = String(text == null ? '' : text);
  off = Math.max(0, Math.min(text.length, Number(off) || 0));
  if (typeof Intl !== 'undefined' && Intl.Segmenter){
    try {
      const starts = [];
      for (const x of new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)) starts.push(x.index);
      starts.push(text.length);
      if (dir < 0){ for (let i=starts.length-1;i>=0;i--) if (starts[i] < off) return starts[i]; return 0; }
      for (const x of starts) if (x > off) return x;
      return text.length;
    } catch(_){}
  }
  if (dir < 0){
    if (off <= 0) return 0;
    let i = off - 1;
    if (i > 0 && /[\uDC00-\uDFFF]/.test(text[i]) && /[\uD800-\uDBFF]/.test(text[i-1])) i--;
    return i;
  }
  if (off >= text.length) return text.length;
  let i = off + 1;
  if (i < text.length && /[\uD800-\uDBFF]/.test(text[off]) && /[\uDC00-\uDFFF]/.test(text[i])) i++;
  return i;
}
function structuredDeleteLocal(e, info){
  if (!mathEditEl || !info || !info.structType || (e.key !== 'Backspace' && e.key !== 'Delete')) return false;
  const sr = structuredSelectionOffsets(mathEditEl, info);
  if (!sr) return false;
  const text = structuredLocalText(mathEditEl, info);
  let a = sr.start, b = sr.end;
  if (a === b){
    if (e.key === 'Backspace'){
      if (a <= 0) return false;                         // 交給下方「取消 marker」邏輯
      a = structuredGraphemeBoundary(text, a, -1);
    } else {
      if (b >= text.length) return false;               // 交給既有跨宿主邊界守衛
      b = structuredGraphemeBoundary(text, b, 1);
    }
  }
  e.preventDefault();
  const next = text.slice(0,a) + text.slice(b);
  structuredSetLocalText(mathEditEl, info, next, a);
  if (typeof acOnInput === 'function') acOnInput();
  return true;
}
function normalizeStructuredSentinel(){
  if (!mathEditEl || !mathEditInfo || !mathEditInfo.structType) return;
  const t = mathEditEl.textContent || '';
  if (t.charCodeAt(0) !== 0x200B || t.length <= 1) return;
  const off = caretOffsetIn(mathEditEl);
  mathEditEl.textContent = t.slice(1);
  setCaret(mathEditEl, Math.max(0, off - 1));
}
function commitMathEdit(cancel){
  if (typeof acHide === 'function') acHide();        // CP53:提交行內編輯即收補全面板
  if (!mathEditEl) return;
  const info=mathEditInfo;
  if(!info||!editContextValid(info,info.i)||!info.blockEl||!info.blockEl.isConnected||editor.children[info.i]!==info.blockEl){clearStaleMathEdit();return;}
  const { i, raw, start, end, blockEl } = info;
  if (mathEditInfo.isIl){                            /* T8 v1.1(CP102):il 就地編輯提交 */
    const ilEl = mathEditEl;
    mathEditEl = null; mathEditInfo = null;
    const orig = raw.slice(start, end);
    const cur = (ilEl && ilEl.isConnected) ? ilEl.textContent : orig;
    if (cancel){
      if (cur !== orig){                             // Esc 放棄:還原視圖(blocks 未動)
        suppressSel++;
        blockEl.innerHTML = renderBlockHTML(blocks[i]);
        requestAnimationFrame(()=> suppressSel = Math.max(0, suppressSel - 1));
      }
    } else if (cur !== orig){
      blocks[i] = raw.slice(0, start) + cur + raw.slice(end);
      suppressSel++;
      blockEl.innerHTML = renderBlockHTML(blocks[i]);
      requestAnimationFrame(()=> suppressSel = Math.max(0, suppressSel - 1));
      onEdited();
    }                                                // 未變更 → 零重排零副作用(高頻瀏覽路徑)
    hideMathPreview();
    return;
  }
  const txt = cancel ? raw.slice(start, end) : structuredLocalText(mathEditEl, info);
  /* CP174.5: every structured/plain host must preserve the canonical
     block prefix.  A rendered caret can be reported at offset 0 for `>`,
     heading, list, or no-indent markers; never commit that projection as if
     it were the source text. */
  let commitStart = start;
  if (info.isPlain && typeof inlineBodyBounds === 'function'){
    const body = inlineBodyBounds(raw);
    if (body && Number.isFinite(body.s)) commitStart = Math.max(commitStart, body.s);
  }
  blocks[i] = raw.slice(0, commitStart) + txt + raw.slice(end);
  suppressSel++;
  blockEl.innerHTML = renderBlockHTML(blocks[i]);
  requestAnimationFrame(()=> suppressSel = Math.max(0, suppressSel - 1));
  mathEditEl = null; mathEditInfo = null;
  hideMathPreview();
  if (!cancel) onEdited();
}
function caretAfterMath(blockEl, mi, attr){
  const sp = blockEl.querySelector(`[data-${attr || 'mi'}="${mi}"]`);
  if (!sp) return;
  /* T8 v1.1(CP102):flag on 時 token 外包 [data-il] 殼(含定界),游標應落於整個 il 之後;
     flag off 時 DOM 無 data-il → closest 回 null,行為不變。 */
  const ilw = sp.closest ? sp.closest('[data-il]') : null;
  const tgt = (ilw && blockEl.contains(ilw)) ? ilw : sp;
  suppressSel++;
  const r = document.createRange();
  r.setStartAfter(tgt); r.collapse(true);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  requestAnimationFrame(()=> suppressSel = Math.max(0, suppressSel - 1));
}
/* ---------- T8 v1.1(CP102):md-il 就地編輯宿主 ----------
   flag on 時游標進入 [data-il]:不再以 startMathEdit 換入 raw 編輯 span,而是讓
   「渲染 DOM 本身」成為編輯面 — md-il.textContent === token 原始碼全文(t62 不變量),
   contenteditable 原生輸入直接發生在 raw 等價文字上;顯形(.md-expand)由既有
   selectionchange 調度負責。共用 mathEditEl/mathEditInfo/commitMathEdit 生命週期
   (isIl 旗標),點他處/⌘Z/Enter/Esc 等既有提交點零改接。
   Undo 快照延遲到第一次實際變更前才拍(ilArmUndo):游標純瀏覽進出 token 不汙染
   undo 堆疊(il 進出頻率比 startMathEdit 進場高一個量級,進場即拍不可行)。 */
function startIlEdit(il, blockEl, i){
  if (!mdMetaEnabledHere()) return false;
  if (mathEditEl === il) return true;                       // 已在同一 il 內
  const raw = blocks[i] ?? '';
  if (blockType(raw) === 'table') return false;
  const own = il.querySelector(':scope > [data-si]');
  if (!own) return false;
  const idx = +own.dataset.si;
  const r = styleRangesOf(raw)[idx];
  if (!r) return false;
  if (il.textContent !== raw.slice(r.start, r.end)) return false;  // 不變量守衛:失守 → 回舊路(換宿主)
  exitTableEdit();
  deactivate(true);
  mathEditInfo = { i, mi: idx, attr: 'si', isMath: false, isIl: true, ilPushed: false,
                   start: r.start, end: r.end, raw, blockEl, ctx:editContextStamp(i) };
  mathEditEl = il;                                          // 宿主=il 容器本身,DOM/游標零搬動
  return true;
}
function ilArmUndo(){
  if (mathEditEl && mathEditInfo && mathEditInfo.isIl && !mathEditInfo.ilPushed){
    mathEditInfo.ilPushed = true;
    pushUndo();                                             // CP100b 語意:於變更落地前拍照
  }
}
/* ---------- CP34:純文字段「可見位移 → raw 位移」映射 ----------
   段內(token 之間)會讓可見長度 ≠ raw 長度的構造,與 inlineMD 同一組規則:
   ‧ 反斜線跳脫 \X(raw 2 → 可見 1)      ‧ HTML 註解(→ 0)
   ‧ HTML 標籤:白名單 → 0;非白名單保留字面(1:1)
   ‧ 字元實體 &…;(→ 1)                  ‧ TW_THESIS 引用 [[N…]](theme=twthesis 時壓縮)
   掃描一次建片段表;toRaw() 把 DOM 量到的可見位移換成 raw 位移。
   正則直接沿用渲染器的寫法,行為以建構保證一致。 */
function plainSegVisMap(seg){
  const pieces = [];
  const RE_ESC = /^\\([\\`*_{}\[\]#+\-.!~=<>|$])/;
  const RE_CMT = /^<!--[\s\S]*?-->/;
  const RE_TAG = /^<\/?[a-zA-Z][^<>]*>/;
  const RE_ENT = /^&(#\d{1,7}|#x[\da-fA-F]{1,6}|[a-zA-Z][\da-zA-Z]{1,31});/;
  const RE_TW_THESIS = /^\[\[\s*([0-9][0-9\s,，、．.·–—-]*?)\s*\]\]/;
  let i = 0;
  while (i < seg.length){
    const rest = seg.slice(i);
    let m;
    if ((m = rest.match(RE_ESC))){ pieces.push({ raw: 2, vis: 1 }); i += 2; continue; }
    if ((m = rest.match(RE_CMT))){ pieces.push({ raw: m[0].length, vis: 0 }); i += m[0].length; continue; }
    if ((m = rest.match(RE_TAG))){
      const safe = (typeof sanitizeTag === 'function') ? sanitizeTag(m[0]) : null;
      pieces.push({ raw: m[0].length, vis: safe === null ? m[0].length : 0 });
      i += m[0].length; continue;
    }
    if ((m = rest.match(RE_ENT))){ pieces.push({ raw: m[0].length, vis: 1 }); i += m[0].length; continue; }
    if ((m = rest.match(/^\[\^[A-Za-z0-9_.\-\u4e00-\u9fff]+\]/))){   // CP48:註腳 [^id]→[id](藏 ^)
      pieces.push({ raw: m[0].length, vis: m[0].length - 1 }); i += m[0].length; continue; }
    if (isTwThesisTheme() && (m = rest.match(RE_TW_THESIS))){
      const parts = m[1].split(/\s*[,，、]\s*/).filter(Boolean);
      let v = 2;                                            // 前後的 [ 與 ]
      parts.forEach((tok, k) => {
        if (k) v += 2;                                      // ', '
        const rng = tok.match(/^\s*(\d+)\s*[–—-]\s*(\d+)\s*$/);
        if (rng) v += rng[1].length + 1 + rng[2].length;    // a–b
        else { const t = tok.trim(); v += /^\d+$/.test(t) ? t.length : tok.length; }
      });
      pieces.push({ raw: m[0].length, vis: v }); i += m[0].length; continue;
    }
    pieces.push({ raw: 1, vis: 1 }); i += 1;
  }
  return {
    pieces,
    total: pieces.reduce((a, p) => a + p.vis, 0),
    toVisible(raw){
      const maxRaw = pieces.reduce((a, p) => a + p.raw, 0);
      const want = Math.max(0, Math.min(maxRaw, Number(raw) || 0));
      let r = 0, v = 0;
      for (const p of pieces){
        const re = r + p.raw, ve = v + p.vis;
        if (want <= re){
          if (p.raw === p.vis) return v + Math.max(0, want - r);
          if (!p.vis) return v;
          const k = Math.max(0, Math.min(p.raw, want - r));
          return v + Math.max(0, Math.min(p.vis, Math.round(k * p.vis / p.raw)));
        }
        r = re; v = ve;
      }
      return v;
    },
    toRaw(vis){
      let r = 0, v = 0;
      for (const p of pieces){
        if (v + p.vis <= vis){ r += p.raw; v += p.vis; continue; }   // 含零寬片段:貪婪吞入 → 游標落在標記之內
        const k = vis - v;                                           // 邊界落在片段內部
        if (p.raw === p.vis) return r + k;                           // 1:1 片段
        return (k * 2 >= p.vis) ? r + p.raw : r;                     // 壓縮片段:就近吸附
      }
      return r;
    }
  };
}
/* ---------- CP30:純文字逐段編輯 ----------
   點擊含行內 token(粗/斜/刪/標記/行內碼/連結/圖片/公式)區塊裡「無格式的
   純文字」時,只把游標所在、相鄰 token 之間的那段純文字換成可編輯 span,
   兩側 token 維持渲染,整句排版不跳動(補完 CP5/CP7 只處理 token 的缺口)。
   共用 mathEditEl / mathEditInfo / commitMathEdit 既有機制(isPlain 旗標)。
   回傳 false = 條件不符,呼叫端沿用舊的整塊展開行為。 */
/* CP174.2: resolve a caret that Chromium places on the parent boundary of
   a rendered colour span. A click on the first/last glyph frequently yields
   (P, childIndex) instead of a text node inside the span; checking ancestors
   alone therefore misses the wrapper and startPlainEdit leaks </span>. */
function colorWrapperAtPoint(root, node, off){
  if (!root || !node) return null;
  const isColor = p => p && p.nodeType === 1 && p.tagName === 'SPAN' &&
    (/\bcolor\s*:/i.test(p.getAttribute('style') || '') || p.dataset && p.dataset.colorWrapper === '1');
  let p = node.nodeType === 1 ? node : node.parentElement;
  while (p && p !== root && p !== editor){ if (isColor(p)) return p; p = p.parentElement; }
  if (node.nodeType !== 1) return null;
  const kids = node.childNodes || [], k = Number.isFinite(off) ? Math.max(0, Math.min(kids.length, off)) : 0;
  const edge = (candidate, fromStart) => {
    let q = candidate;
    while (q && q.nodeType === 1){
      if (isColor(q)) return q;
      const cs = q.childNodes || [];
      if (!cs.length) return null;
      q = cs[fromStart ? 0 : cs.length - 1];
    }
    return null;
  };
  return edge(kids[k], true) || edge(kids[k - 1], false) || null;
}
function startPlainEdit(el, i, caretNode, caretOffset, rawOff, skipUndo = false){
  const raw = blocks[i] ?? '';
  /* CP174.2: colour spans are canonical HTML wrappers, not plain-text segment
     boundaries. A temporary raw-text host inside one leaks its closing tag.
     Fail closed; the caller keeps the rendered DOM and canonical source. */
  if (colorWrapperAtPoint(el, caretNode, caretOffset)) return false;
  /* CP174.1：彩色 HTML span 可能包住公式；局部純文字宿主若跨到
     wrapper 結尾，會把 </span> 寫成可見字串。由 onSelectionChange
     保持此 wrapper 的渲染態，避免破壞 HTML 邊界。 */
  let colorNode = caretNode && (caretNode.nodeType === 1 ? caretNode : caretNode.parentElement);
  let colorWrapper = null;
  while (colorNode && colorNode !== el && colorNode !== editor){
    if (colorNode.tagName === 'SPAN' && /\bcolor\s*:/i.test(colorNode.getAttribute('style') || '')){ colorWrapper = colorNode; break; }
    colorNode = colorNode.parentElement;
  }
  if (colorWrapper) return false;
  if (raw.includes('\n')) return false;                     // 多行(code/math/table)不適用
  const bt = blockType(raw);
  if (bt === 'math' || bt === 'empty' || bt === 'hr') return false;
  /* 1) 頂層 token 區間:style + math 聯集,吞併巢狀/重疊,保留最外層身分 */
  const rs = [];
  styleRangesOf(raw).forEach((r, idx) => rs.push({ start: r.start, end: r.end, attr: 'si', idx }));
  mathRangesOf(raw).forEach((r, idx) => rs.push({ start: r.start, end: r.end, attr: 'mi', idx }));
  /* CP152：把 quote 納入與清單相同的結構化編輯；即使內容沒有 token，
     也只置換 marker／引用框內的文字根節點，不再把整塊切回原始碼。 */
  const struct = structuredBlockParts(raw);
  const listHeading = struct ? structuredListHeadingInfo(raw, struct) : null;
  const plainStruct = !rs.length && !!struct;
  if (!rs.length && !plainStruct) return false;               // 一般純段落仍沿用整塊編輯
  const structRoot = struct ? structuredEditRoot(el, struct.type) : null;
  if (struct && !structRoot) return false;
  const plainList = plainStruct && (struct.type === 'ul' || struct.type === 'ol' || struct.type === 'task');
  /* 點擊 marker、引用框邊線或區塊留白時，把落點夾到內容根節點；不能以 null
     交給 comparePoint，否則含 token 的結構化區塊仍可能退回整塊原始碼。 */
  if (structRoot && caretNode && !structRoot.contains(caretNode)){
    const towardEnd = rawOff != null && rawOff > struct.contentStart + Math.floor(struct.content.length / 2);
    caretNode = structRoot;
    caretOffset = towardEnd ? structRoot.childNodes.length : 0;
  }
  rs.sort((a, b) => a.start - b.start || b.end - a.end);
  const top = [];
  for (const r of rs){
    const last = top[top.length - 1];
    if (last && r.start < last.end){ if (r.end > last.end) last.end = r.end; continue; }
    top.push({ start: r.start, end: r.end, attr: r.attr, idx: r.idx });
  }
  /* 2) 解析各頂層 token 的 DOM(向上取最外層 data-si/data-mi 元素) */
  for (const t of top){
    let tn = el.querySelector('[data-' + t.attr + '="' + t.idx + '"]');
    if (!tn) return false;
    let p = tn.parentElement;
    while (p && p !== el){
      /* T8 v1.1(CP102):flag on 時 token 外包 [data-il] 殼(含定界字元),邊界錨定
         必須以整個 il 為單位;flag off 時 DOM 無 data-il,條件恆假,行為不變。 */
      if (p.dataset && (p.dataset.si !== undefined || p.dataset.mi !== undefined || p.dataset.il !== undefined)) tn = p;
      p = p.parentElement;
    }
    if (!el.contains(tn)) return false;
    t.el = tn;
  }
  /* 3) 游標與各 token 的相對位置(DOM 精確判定,不靠 rawOff 對映) */
  let prev = null, next = null;
  try {
    for (const t of top){
      /* CP37:token 可見文字的 0/尾端是「邊界」而非 token 內部。
         尤其清單以粗體開頭時,0 邊界必須留下零寬 plain-edit,才能 Backspace 取消清單。 */
      if (t.el.contains(caretNode)){
        const inside = document.createRange();
        inside.selectNodeContents(t.el);
        inside.setEnd(caretNode, caretOffset);
        const v = inside.toString().length, total = t.el.textContent.length;
        if (v <= 0){ next = t; break; }
        if (v >= total){ prev = t; continue; }
        return false;                                       // 真正在 token 內 → 交給 token 編輯
      }
      const tr = document.createRange();
      tr.selectNode(t.el);
      const cmp = tr.comparePoint(caretNode, caretOffset);
      if (cmp > 0) prev = t;
      else if (cmp < 0){ next = t; break; }
      else return false;
    }
  } catch(_){ return false; }
  /* 4) raw 邊界:無前導 token 時剝除區塊前綴(#/>/清單記號),不納入編輯段 */
  let runStart;
  if (prev) runStart = prev.end;
  else if (listHeading) runStart = listHeading.rawContentStart; // CP161：heading marker 留在 canonical raw，不進文字宿主
  else {
    const pm = raw.match(/^(#{1,6}\s+|>\s?|\s*[-*+]\s+(?:\[[ xX]\]\s+)?|\s*\d+\.\s+)/);
    runStart = pm ? pm[0].length : 0;
  }
  const runEnd = next ? next.start : raw.length;
  if (runStart > runEnd) return false;
  /* 5) 進入編輯(流程仿 startMathEdit) */
  exitTableEdit();
  deactivate(true);
  if (!skipUndo) pushUndo();
  /* 6) DOM Range:prev 之後 ~ next 之前;缺端錨定另一端的父容器邊界 */
  const rg = document.createRange();
  try {
    if (prev) rg.setStartAfter(prev.el);
    else if (next) rg.setStart(next.el.parentNode, 0);
    else rg.setStart(structRoot, 0);                          // CP152:無 token 結構內容根節點
    if (next) rg.setEndBefore(next.el);
    else if (prev) rg.setEnd(prev.el.parentNode, prev.el.parentNode.childNodes.length);
    else rg.setEnd(structRoot, structRoot.childNodes.length);
  } catch(_){ return false; }
  const seg = raw.slice(runStart, runEnd);
  /* CP31:游標位移改用 DOM 相對量測(段起點 → 點擊處的可見字元數),
     段前含未建模 token(如 twthesis-citelink 引註)時不再漂移;失敗才退回 rawOff 映射 */
  let segCaret = null;
  if (caretNode){
    try {
      const cr = document.createRange();
      if (prev) cr.setStartAfter(prev.el);
      else if (next) cr.setStart(next.el.parentNode, 0);
      else cr.setStart(structRoot, 0);                        // CP152:結構內容內的可見位移
      cr.setEnd(caretNode, caretOffset);
      const visOff = cr.toString().length;
      /* CP34:段內含隱形構造(HTML 標籤/實體/跳脫/TW_THESIS 引用)時可見 ≠ raw,
         以與渲染器同規則的映射換算;映射總可見長與 DOM 實測(rg 全段)不符
         代表遇到未建模構造 → 保守沿用可見位移(CP31 行為) */
      const map = plainSegVisMap(seg);
      segCaret = (map.total === rg.toString().length) ? map.toRaw(visOff) : visOff;
    } catch(_){ segCaret = null; }
  }
  mathEditInfo = {
    i,
    mi:   prev ? prev.idx  : (next ? next.idx  : 0),
    attr: prev ? prev.attr : (next ? next.attr : 'si'),
    isMath: false, isPlain: true, wholeList: plainList,
    wholeStruct: plainStruct, structType: struct ? struct.type : null,
    start: runStart, end: runEnd, raw, blockEl: el, ctx:editContextStamp(i)
  };
  const edit = document.createElement('span');
  edit.className = 'math-edit tok-edit plain-edit';
  edit.contentEditable = 'true';
  edit.spellcheck = false;
  if (!seg && struct){
    edit.dataset.structEdit = '1';
    edit.textContent = '​';
  } else edit.textContent = seg;
  suppressSel++;
  try { rg.deleteContents(); rg.insertNode(edit); }
  catch(_){
    el.innerHTML = renderBlockHTML(raw);                    // 置換失敗:還原渲染,放棄本次
    mathEditInfo = null;
    requestAnimationFrame(()=> suppressSel = Math.max(0, suppressSel - 1));
    return false;
  }
  mathEditEl = edit;
  if (!seg && struct) setCaret(edit, 1);                      // 零寬字元之後：task checkbox 也能穩定接收輸入
  else setCaret(edit, Math.min(seg.length, Math.max(0, segCaret ?? ((rawOff ?? seg.length) - runStart))));
  requestAnimationFrame(()=> suppressSel = Math.max(0, suppressSel - 1));
  return true;
}
/* CP152：將指定結構區塊保持在渲染態並打開內容編輯宿主。 */
function openStructuredEdit(i, rawOff, skipUndo = true){
  const raw = blocks[i] ?? '';
  const part = structuredBlockParts(raw);
  const el = editor.children[i];
  if (!part || !el) return false;
  suppressSel++;
  el.className = 'block';
  el.innerHTML = renderBlockHTML(raw);
  activeIndex = -1;
  requestAnimationFrame(()=> suppressSel = Math.max(0, suppressSel - 1));
  const root = structuredEditRoot(el, part.type);
  if (!root) return false;
  const listHeading = structuredListHeadingInfo(raw, part);
  const minContentStart = listHeading ? listHeading.rawContentStart : part.contentStart;
  const off = Math.max(minContentStart, Math.min(raw.length, rawOff == null ? raw.length : rawOff));
  /* CP154：用既有 raw→DOM 投影取得真正點擊位置，不再一律從 root 尾端猜測。
     這讓含粗體／連結等 token 的清單在縮排、合併後仍能回到原文字位置。 */
  let pt=null;
  try{pt=paperRawToDomPoint(el,raw,off);}catch(_){}
  const node=pt&&pt.node&&el.contains(pt.node)?pt.node:root;
  const nodeOff=pt&&Number.isFinite(pt.off)?pt.off:root.childNodes.length;
  return startPlainEdit(el, i, node, nodeOff, off, skipUndo);
}
function structuredFocusRawRange(i, rawStart, rawEnd=rawStart){
  if(!openStructuredEdit(i,rawEnd,true)||!mathEditEl||!mathEditInfo)return false;
  const text=structuredLocalText(mathEditEl,mathEditInfo);
  const a=Math.max(0,Math.min(text.length,(Number(rawStart)||0)-mathEditInfo.start));
  const b=Math.max(0,Math.min(text.length,(Number(rawEnd)||0)-mathEditInfo.start));
  structuredSetLocalText(mathEditEl,mathEditInfo,text,Math.min(a,b),Math.max(a,b));
  return true;
}
function structuredCurrentRaw(info){
  if(!info)return '';
  return info.raw.slice(0,info.start)+structuredLocalText(mathEditEl,info)+info.raw.slice(info.end);
}
function structuredCompatiblePrevious(i,part){
  if(i<=0||!part)return -1;
  const p=structuredBlockParts(blocks[i-1] ?? '');
  if(!p)return -1;
  if(part.type==='quote')return p.type==='quote'?i-1:-1;
  return part.isList&&p.isList&&p.type===part.type&&p.depth===part.depth?i-1:-1;
}
/* CP154：結構邊界刪除只有一個 model-first 入口。空項目回到前一項時直接刪除
   current block 並重開前一個渲染宿主；不再經過 empty plain block → handleBackspace()
   → activate(raw) 的三段式路徑，因此上一項不會露出 `1. `／`> ` 原始碼。 */
function structuredBoundaryDelete(e,info){
  if(!mathEditEl||!info||!info.structType||(e.key!=='Backspace'&&e.key!=='Delete'))return false;
  const sr=structuredSelectionOffsets(mathEditEl,info); if(!sr)return false;
  if(sr.start!==sr.end)return structuredDeleteLocal(e,info);
  const local=structuredLocalText(mathEditEl,info);
  if((e.key==='Backspace'&&sr.start>0)||(e.key==='Delete'&&sr.end<local.length))return structuredDeleteLocal(e,info);
  const current=structuredCurrentRaw(info),part=structuredBlockParts(current); if(!part)return false;
  const fullRawPos=info.start+sr.start;
  if(e.key==='Backspace'){
    if(fullRawPos>part.contentStart){
      e.preventDefault(); commitMathEdit(); structuredFocusRawRange(info.i,fullRawPos,fullRawPos); return true;
    }
    e.preventDefault();
    blocks[info.i]=current; commitMathEdit();
    const i=info.i,now=structuredBlockParts(blocks[i] ?? '')||part;
    if(!now.content.length){
      const prev=structuredCompatiblePrevious(i,now);
      if(prev>=0){
        pushUndo(); removeBlockAt(i);
        const b=now.isList?structuredNormalizeOrderedRegion(prev):null;
        if(b)structuredRerenderBounds(b); else rerender(prev);
        const pp=structuredBlockParts(blocks[prev] ?? '');
        structuredFocusRawRange(prev,(blocks[prev]??'').length,(blocks[prev]??'').length);
        onEdited();updateBlockInfo();schedulePaginate();
        return true;
      }
      if(now.isList&&now.depth>0){
        pushUndo();const tx=structuredShiftListSubtree(i,true);
        if(!tx){structuredFocusRawRange(i,now.contentStart);return true;}
        structuredRerenderBounds(tx.bounds);structuredFocusRawRange(i,tx.newContentStart,tx.newContentStart);
        onEdited();updateBlockInfo();schedulePaginate();return true;
      }
      pushUndo();
      blocks[i]=''; mathEditEl=null;mathEditInfo=null;hideMathPreview();
      const el=editor.children[i];activeIndex=i;el.className=activeClassFor('');el.textContent='';setCaret(el,0);
      onEdited();updateBlockInfo();schedulePaginate();
      return true;
    }
    if(now.isList&&now.depth>0){
      pushUndo();const tx=structuredShiftListSubtree(i,true);
      if(!tx){structuredFocusRawRange(i,now.contentStart);return true;}
      structuredRerenderBounds(tx.bounds);structuredFocusRawRange(i,tx.newContentStart,tx.newContentStart);
      onEdited();updateBlockInfo();schedulePaginate();return true;
    }
    pushUndo();
    const next=now.content;
    mathEditEl=null;mathEditInfo=null;hideMathPreview();blocks[i]=next;
    const el=editor.children[i];activeIndex=i;el.className=activeClassFor(next);el.textContent=next;setCaret(el,0);
    onEdited();updateBlockInfo();schedulePaginate();
    return true;
  }
  const fullEnd=info.start+sr.end;
  if(fullEnd<part.contentStart+part.content.length){
    e.preventDefault();commitMathEdit();structuredFocusRawRange(info.i,fullEnd,fullEnd);return true;
  }
  e.preventDefault(); blocks[info.i]=current; commitMathEdit();
  const i=info.i;if(i+1>=blocks.length){structuredFocusRawRange(i,blocks[i].length);return true;}
  const cur=structuredBlockParts(blocks[i]??'')||part,nxt=structuredBlockParts(blocks[i+1]??'');
  const nextRaw=blocks[i+1]??'';
  if(nxt&&((cur.type==='quote'&&nxt.type==='quote')||(cur.isList&&nxt.isList&&cur.type===nxt.type&&cur.depth===nxt.depth))){
    pushUndo();const caret=cur.contentStart+cur.content.length;
    blocks[i]=cur.prefix+cur.content+nxt.content;removeBlockAt(i+1);
    const b=cur.isList?structuredNormalizeOrderedRegion(i):null;if(b)structuredRerenderBounds(b);else rerender(i);
    structuredFocusRawRange(i,caret,caret);onEdited();updateBlockInfo();schedulePaginate();return true;
  }
  if(!nxt&&blockType(nextRaw)==='p'){
    pushUndo();const caret=cur.contentStart+cur.content.length;
    blocks[i]=cur.prefix+cur.content+nextRaw;removeBlockAt(i+1);rerender(i);
    structuredFocusRawRange(i,caret,caret);onEdited();updateBlockInfo();schedulePaginate();return true;
  }
  structuredFocusRawRange(i,blocks[i].length);return true;
}
/* CP152：Enter 在 canonical Markdown 上分割，再重繪兩個結構區塊。
   非空項目延續同一結構；空項目第二次 Enter 才退出，符合 Markdown 的容器模型語意。 */
function handleStructuredEditEnter(info, shift){
  if (!mathEditEl || !info || !info.structType || !editContextValid(info, info.i)) return false;
  const i = info.i;
  const localOff = structuredLocalCaret(mathEditEl, info);
  const current = info.raw.slice(0, info.start) + structuredLocalText(mathEditEl, info) + info.raw.slice(info.end);
  const rawPos = Math.max(0, Math.min(current.length, info.start + localOff));
  let part = structuredBlockParts(current);
  if (!part) return false;
  commitMathEdit();                                             // 先提交尚未落地的輸入
  if (String(blocks[i] ?? '') !== current) part = structuredBlockParts(blocks[i] ?? '') || part;
  pushUndo();
  const blockEl = editor.children[i];
  if (!part.content.length){                                    // 空項目：退出清單／引言
    blocks[i] = '';
    mathEditEl = null; mathEditInfo = null;
    activeIndex = i;
    blockEl.className = activeClassFor('');
    blockEl.textContent = '';
    setCaret(blockEl, 0);
    onEdited(); updateBlockInfo(); schedulePaginate();
    return true;
  }
  const contentPos = Math.max(0, Math.min(part.content.length, rawPos - part.contentStart));
  const head = part.content.slice(0, contentPos), tail = part.content.slice(contentPos);
  blocks[i] = part.prefix + head;
  blockEl.className = 'block';
  blockEl.innerHTML = renderBlockHTML(blocks[i]);
  activeIndex = -1;
  const nextRaw = part.nextPrefix + tail;
  insertBlockAfter(i, nextRaw);
  let nextPart=structuredBlockParts(blocks[i+1] ?? '');
  if(nextPart&&nextPart.isList){
    const b=structuredNormalizeOrderedRegion(i+1);structuredRerenderBounds(b);nextPart=structuredBlockParts(blocks[i+1] ?? '')||nextPart;
  }
  onEdited(); updateBlockInfo(); schedulePaginate();
  if (!openStructuredEdit(i + 1, nextPart ? nextPart.contentStart : part.nextPrefix.length, true)) activate(i + 1, nextPart ? nextPart.contentStart : part.nextPrefix.length);
  if (settings.typewriter && editor.children[i+1]) editor.children[i+1].scrollIntoView({ block:'center' });
  return true;
}
/* ---------- §5c 圖片工具列:點圖縮放 / 編輯原始碼(CP8,沿用一般編輯器操作) ---------- */
const imgBar = $('#img-bar');
let imgBarTarget = null;
let ibZoomApplied = null;   // CP33:目前圖片已套用的縮放值(防 blur 後 change 重打同值)

function showImgBar(img){
  imgBarTarget = img;
  imgBar.classList.remove('ib-hidden');
  /* 表格區塊內只提供縮放(原始碼走表格編輯) */
  $('#ib-src').style.display =
    blockType(blocks[blockIndexOf(blockElOf(img))] ?? '') === 'table' ? 'none' : '';
  const cur = (img.style.zoom || (img.getAttribute('style') || '').match(/zoom\s*:\s*(\d+)/i)?.[1] || '');
  $('#ib-custom').value = parseInt(cur) || 100;   // CP33:未設定=100,不再顯示空白
  ibZoomApplied = parseInt(cur) || 100;
  positionImgBar();
}
function positionImgBar(){
  if (!imgBarTarget || !imgBarTarget.isConnected) return hideImgBar();
  const r = imgBarTarget.getBoundingClientRect();
  const w = imgBar.offsetWidth, h = imgBar.offsetHeight;
  let left = Math.max(8, Math.min(r.left + (r.width - w) / 2, innerWidth - w - 8));
  let top = r.top - h - 8;
  if (top < 8) top = Math.min(innerHeight - h - 8, r.bottom + 8);
  imgBar.style.left = left + 'px';
  imgBar.style.top = top + 'px';
}
function hideImgBar(){ imgBar.classList.add('ib-hidden'); imgBarTarget = null; }
scroller.addEventListener('scroll', () => {
  if (!imgBar.classList.contains('ib-hidden')) positionImgBar();
}, { passive: true });

function applyImgZoom(pct){
  const img = imgBarTarget;
  if (!img || !img.isConnected) return hideImgBar();
  const blockEl = blockElOf(img);
  const i = blockIndexOf(blockEl);
  const r = styleRangesOf(blocks[i] ?? '')[+img.dataset.si];
  if (!r){ toast('找不到這張圖片的原始碼'); return hideImgBar(); }
  pushUndo();
  const raw = blocks[i];
  blocks[i] = raw.slice(0, r.start) + upsertImgZoom(raw.slice(r.start, r.end), pct) + raw.slice(r.end);
  suppressSel++;
  blockEl.innerHTML = renderBlockHTML(blocks[i]);
  requestAnimationFrame(() => suppressSel = Math.max(0, suppressSel - 1));
  onEdited();
  /* 重新鎖定同一張圖(token 起點不變,但 Markdown→HTML 轉換後序號可能重排) */
  const idx2 = styleRangesOf(blocks[i]).findIndex(x => x.start === r.start);
  const fresh = idx2 >= 0 ? blockEl.querySelector(`img[data-si="${idx2}"]`) : null;
  if (fresh){ imgBarTarget = fresh; requestAnimationFrame(positionImgBar); }
  else hideImgBar();
  $('#ib-custom').value = pct;   // CP33:預設鈕/自訂值皆同步顯示
  ibZoomApplied = pct;
  toast('縮放:' + pct + '%');
}
imgBar.addEventListener('mousedown', e => {
  /* CP33:自訂縮放輸入框需要「取得焦點」與「原生上下步進」— 兩者皆是 mousedown 的
     預設行為,一律 preventDefault 會把輸入框整個擋死(點不進、箭頭無反應)。
     故僅輸入框放行;其餘按鈕維持攔截,點工具列不奪走編輯區的選取。 */
  if (e.target.id !== 'ib-custom') e.preventDefault();
});
imgBar.addEventListener('click', e => {
  const z = e.target.closest && e.target.closest('[data-z]');
  if (z){ applyImgZoom(+z.dataset.z); return; }
  if (e.target.id === 'ib-src'){
    const img = imgBarTarget;
    hideImgBar();
    if (img && img.isConnected) startMathEdit(img, null);
    return;
  }
  if (e.target.id === 'ib-swap'){                            // CP45:圖片語法切換
    const img = imgBarTarget;
    if (!img || !img.isConnected) return hideImgBar();
    const blockEl = blockElOf(img);
    const i = blockIndexOf(blockEl);
    const r = styleRangesOf(blocks[i] ?? '')[+img.dataset.si];
    if (!r){ toast('找不到這張圖片的原始碼'); return hideImgBar(); }
    const raw = blocks[i];
    const out = toggleImgSyntax(raw.slice(r.start, r.end));
    if (out.err === 'zoom'){ toast(T('此圖帶縮放,Markdown 語法無法保留 — 先還原 100% 再切換')); return; }
    if (out.err){ toast(T('無法辨識這張圖片的語法')); return; }
    pushUndo();
    blocks[i] = raw.slice(0, r.start) + out.seg + raw.slice(r.end);
    suppressSel++;
    blockEl.innerHTML = renderBlockHTML(blocks[i]);
    requestAnimationFrame(() => suppressSel = Math.max(0, suppressSel - 1));
    onEdited();
    const idx2 = styleRangesOf(blocks[i]).findIndex(x => x.start === r.start);
    const fresh = idx2 >= 0 ? blockEl.querySelector(`img[data-si="${idx2}"]`) : null;
    if (fresh){ imgBarTarget = fresh; requestAnimationFrame(positionImgBar); showImgBar(fresh); }
    else hideImgBar();
    toast(T(out.seg[0] === '<' ? '已切換為 HTML 圖片語法' : '已切換為 Markdown 圖片語法'));
  }
});
function applyCustomZoom(){
  const v = Math.max(5, Math.min(400, parseInt($('#ib-custom').value) || 100));
  if (v === ibZoomApplied) return;              // CP33:同值不重複套用(免多餘 undo/提示)
  applyImgZoom(v);
}
$('#ib-custom').addEventListener('change', applyCustomZoom);
$('#ib-custom').addEventListener('keydown', e => {
  if (e.key === 'Enter'){ e.preventDefault(); $('#ib-custom').blur(); }
  else if (e.key === 'ArrowUp' || e.key === 'ArrowDown')
    setTimeout(applyCustomZoom, 0);             // CP33:鍵盤步進後即時套用(原生先改值)
  e.stopPropagation();
});
document.addEventListener('mousedown', e => {
  if (imgBarTarget && !e.target.closest('#img-bar') && e.target !== imgBarTarget) hideImgBar();
}, true);

/* CP48(T11):註腳跳轉 — mousedown capture 先於論文點擊路由與 selectionchange,
   preventDefault 避免奪取游標;引用 ⇄ 定義互跳(anchor id 對)。 */
editor.addEventListener('mousedown', e => {
  const a = e.target.closest && e.target.closest('a.fn-a, a.fn-tag');
  if (!a) return;
  e.preventDefault(); e.stopPropagation();
  const id = (a.getAttribute('href') || '').slice(1);
  const t = id && document.getElementById(id);
  if (t) t.scrollIntoView({ block: 'center', behavior: 'smooth' });
}, true);
/* 點擊公式 → 進入該公式的原始碼編輯(capture:先於區塊啟用) */
editor.addEventListener('mousedown', e => {
  if (e.target.closest && e.target.closest('.tbl-bar')){ e.preventDefault(); return; }
  /* 圖片:點擊 → 浮動工具列(縮放 / 原始碼),沿用一般編輯器操作(CP8) */
  const im = e.target.closest && e.target.closest('img[data-si]');
  if (im && !(mathEditEl && mathEditEl.contains(e.target))){
    e.preventDefault();
    if (mathEditEl) commitMathEdit();
    showImgBar(im);
    return;
  }
  /* 連結:一般點擊 → 編輯原始碼;⌘/Ctrl+點擊 → 交給 click 開啟網址。
     CP114(0.9.103.1 整合,取 GPT5.6 線):md-meta v2 啟用且連結已有 [data-il] 外殼時,不在 mousedown
     換入舊 tok-edit 宿主;保留瀏覽器 caret 落點,交由 selectionchange→startIlEdit 以整個連結 token
     就地編輯(展開後可直接改 .md-content 網址段)。flag off/論文模式仍完全走舊路。 */
  const lk = !(inPaperMode() && !settings.srcmode) &&
             e.target.closest && e.target.closest('a[data-si]');
  const ilLink = lk && mdMetaEnabledHere() && lk.closest && lk.closest('[data-il]');
  if (lk && !ilLink && !e.metaKey && !e.ctrlKey && !(mathEditEl && mathEditEl.contains(e.target))){
    e.preventDefault();
    let innerOff = null;
    const cr = document.caretRangeFromPoint && document.caretRangeFromPoint(e.clientX, e.clientY);
    if (cr && lk.contains(cr.startContainer)){
      const rr = document.createRange();
      rr.selectNodeContents(lk); rr.setEnd(cr.startContainer, cr.startOffset);
      innerOff = rr.toString().length;
    }
    if (mathEditEl) commitMathEdit();
    startMathEdit(lk, innerOff);
    return;
  }
  if (inPaperMode() && !settings.srcmode) return;   // 論文模式:公式/連結一律走浮動編輯框(CP10)
  const sp = e.target.closest && e.target.closest('[data-mi]');
  if (!sp) return;
  if (mathEditEl && mathEditEl.contains(e.target)) return;    // 點在編輯框內
  const blockEl = blockElOf(sp);
  if (!blockEl) return;
  const i = blockIndexOf(blockEl), mi = +sp.dataset.mi;
  e.preventDefault();
  if (mathEditEl){
    commitMathEdit();
    const fresh = editor.children[i]?.querySelector(`[data-mi="${mi}"]`);
    if (fresh) startMathEdit(fresh);
    return;
  }
  startMathEdit(sp);
}, true);

/* 啟用中的「數學區塊」也顯示浮動預覽(所見即所得地改原始碼) */
function refreshBlockMathPreview(){
  if (mathEditEl) return;
  if (activeIndex < 0){ hideMathPreview(); return; }
  const src = blocks[activeIndex] ?? '';
  const first = src.split('\n')[0];
  let math = null;
  if (blockType(src) === 'math'){
    math = mathSourceParts(src, 'block');
  } else if (/^(```|~~~)\s*math\s*$/i.test(first) && src.includes('\n')){
    const lines = src.split('\n');
    const tex = lines.slice(1, /^(```|~~~)/.test(lines[lines.length - 1]) ? -1 : undefined).join('\n');
    math = mathSourceParts(tex, 'display');
  }
  if (math === null){ hideMathPreview(); return; }
  showMathPreviewTex(editor.children[activeIndex], math.tex, true, src);
}

/* ============================================================
   Checkpoint 5 — §5b 表格所見即所得(規格 §7)
   點擊表格 → 逐格編輯模式:儲存格 contenteditable、
   浮動工具列插入/刪除行列與對齊;Tab/Enter/↑↓ 導航;Esc 完成。
   ============================================================ */
let tableEdit = null;   // {i, el, model:{align[], rows[][]}, cell:{r,c}}

/* CP49:跳脫感知斷欄(指南 §7.3「轉義儲存格中的 |」)。\|=字面 pipe 不斷欄且反跳脫;
   首尾框線剝除亦避開 \|。純函式,t10 測試行式抽取。 */
function splitTableRow(line){
  /* Markdown se() 的順序：code span → inline math → escaped slash/pipe → split。
     這裡用等價 state machine，避免 placeholder 與私用字元碰撞。 */
  const raw=String(line),out=[];let cur='',codeRun=0,mathRun=0;
  for(let k=0;k<raw.length;k++){
    const ch=raw[k];
    if(ch==='\\'){
      if(raw[k+1]==='\\'){cur+='\\';k++;continue;}
      if(raw[k+1]==='|'){cur+='|';k++;continue;}
      cur+=ch;continue;
    }
    if(ch==='`'&&!mathRun){
      let j=k;while(raw[j]==='`')j++;const n=j-k;
      if(!codeRun)codeRun=n;else if(codeRun===n)codeRun=0;
      cur+=raw.slice(k,j);k=j-1;continue;
    }
    if(ch==='$'&&!codeRun){
      let j=k;while(raw[j]==='$')j++;const n=j-k;
      if(!mathRun)mathRun=n;else if(mathRun===n)mathRun=0;
      cur+=raw.slice(k,j);k=j-1;continue;
    }
    if(ch==='|'&&!codeRun&&!mathRun){out.push(cur.trim());cur='';continue;}
    cur+=ch;
  }
  out.push(cur.trim());
  if(/^\s*\|\s*$/.test(raw)&&out.length===2)return out;
  if(/^\s*\|/.test(raw)&&out.length&&out[0]==='')out.shift();
  if(/\|\s*$/.test(raw)&&out.length&&out[out.length-1]==='')out.pop();
  return out;
}
const TABLE_LAYOUT_MARK = 'ekdeta-html-table';
function tableLayoutClean(input, nc){
  const src = input && typeof input === 'object' ? input : {};
  const colsN = Math.max(1, Number(nc) || (Array.isArray(src.cols) ? src.cols.length : 1));
  const page = ['auto','keep','single'].includes(src.page) ? src.page : 'auto';
  const width0 = Number(src.width), font0 = Number(src.font), line0 = Number(src.line);
  const padX0 = Number(src.padX), padY0 = Number(src.padY);
  const width = width0 >= 25 && width0 <= 100 ? Math.round(width0) : 0;
  const font = font0 >= 70 && font0 <= 120 ? Math.round(font0) : 0;
  const line = line0 >= .85 && line0 <= 2.2 ? Math.round(line0 * 100) / 100 : 0;
  const padX = padX0 >= 0 && padX0 <= 30 ? Math.round(padX0 * 10) / 10 : -1;
  const padY = padY0 >= 0 && padY0 <= 20 ? Math.round(padY0 * 10) / 10 : -1;
  let cols = Array.isArray(src.cols) ? src.cols.slice(0, colsN).map(Number) : [];
  if (cols.length !== colsN || cols.some(v => !Number.isFinite(v) || v <= 0)) cols = [];
  if (cols.length){
    const sum = cols.reduce((a,b)=>a+b,0) || 1;
    cols = cols.map(v => Math.round(v / sum * 1000) / 10);
    cols[cols.length - 1] = Math.round((100 - cols.slice(0,-1).reduce((a,b)=>a+b,0)) * 10) / 10;
  }
  return { v:1, page, width, font, line, padX, padY, cols };
}
function tableLayoutParts(raw){
  const source = String(raw == null ? '' : raw);
  const m = source.match(/^\s*<!--\s*ekdeta-html-table\s*:\s*(\{[^\n]*\})\s*-->\s*(?:\n|$)/i);
  let obj = {}, body = source;
  if (m){
    try { obj = JSON.parse(m[1]); } catch(_){ obj = {}; }
    body = source.slice(m[0].length);
  }
  const first = body.split('\n').find(l => l.trim()) || '';
  const nc = Math.max(1, splitTableRow(first).length || 1);
  return { body, layout:tableLayoutClean(obj, nc), hasMeta:!!m };
}
function tableLayoutIsDefault(layout, nc){
  const x = tableLayoutClean(layout, nc);
  return x.page === 'auto' && !x.width && !x.font && !x.line && x.padX < 0 && x.padY < 0 && !x.cols.length;
}
function tableLayoutMeta(layout, nc){
  const x = tableLayoutClean(layout, nc), o = { v:1 };
  if (x.page !== 'auto') o.page = x.page;
  if (x.width) o.width = x.width;
  if (x.font) o.font = x.font;
  if (x.line) o.line = x.line;
  if (x.padX >= 0) o.padX = x.padX;
  if (x.padY >= 0) o.padY = x.padY;
  if (x.cols.length) o.cols = x.cols;
  return Object.keys(o).length > 1 ? '<!-- ' + TABLE_LAYOUT_MARK + ':' + JSON.stringify(o) + ' -->' : '';
}
function tableLayoutAttrs(layout, nc){
  const x = tableLayoutClean(layout, nc);
  if (tableLayoutIsDefault(x, nc)) return '';
  const attrs = ['data-tlayout="1"','data-tpage="' + x.page + '"'];
  const styles = [];
  if (x.width){ attrs.push('data-twidth="' + x.width + '"'); styles.push('--tbl-width:' + x.width + '%'); }
  if (x.font){ attrs.push('data-tfont="' + x.font + '"'); styles.push('--tbl-font-scale:' + (x.font / 100)); }
  if (x.line){ attrs.push('data-tline="' + x.line + '"'); styles.push('--tbl-line:' + x.line); }
  if (x.padX >= 0){ attrs.push('data-tpadx="' + x.padX + '"'); styles.push('--tbl-pad-x:' + x.padX + 'px'); }
  if (x.padY >= 0){ attrs.push('data-tpady="' + x.padY + '"'); styles.push('--tbl-pad-y:' + x.padY + 'px'); }
  if (x.cols.length) attrs.push('data-tcols="1"');
  if (styles.length) attrs.push('style="' + styles.join(';') + '"');
  return ' ' + attrs.join(' ');
}
function tableLayoutColgroup(layout, nc){
  const x = tableLayoutClean(layout, nc);
  if (!x.cols.length) return '';
  return '<colgroup>' + x.cols.map(v => '<col style="width:' + v + '%">').join('') + '</colgroup>';
}
function applyTableLayoutDOM(table, layout){
  if (!table) return;
  const nc = Math.max(1, twFirstRowCells(table).length || 1), x = tableLayoutClean(layout, nc);
  ['tlayout','tpage','twidth','tfont','tline','tpadx','tpady','tcols'].forEach(k => delete table.dataset[k]);
  ['--tbl-width','--tbl-font-scale','--tbl-line','--tbl-pad-x','--tbl-pad-y',
   '--tbl-auto-width','--tbl-auto-font','--tbl-auto-line','--tbl-auto-pad-x','--tbl-auto-pad-y','--tbl-auto-margin'].forEach(k => table.style.removeProperty(k));
  delete table.dataset.tsingleOk; delete table.dataset.tsingleFailed; delete table.dataset.tsingleProfile;
  table.style.removeProperty('width');
  let cg = table.querySelector(':scope > colgroup');
  if (tableLayoutIsDefault(x, nc)){
    if (cg) cg.remove();
    table.style.removeProperty('table-layout'); table.style.removeProperty('width');
    return;
  }
  table.dataset.tlayout = '1'; table.dataset.tpage = x.page;
  if (x.width){ table.dataset.twidth = String(x.width); table.style.setProperty('--tbl-width', x.width + '%'); }
  if (x.font){ table.dataset.tfont = String(x.font); table.style.setProperty('--tbl-font-scale', String(x.font / 100)); }
  if (x.line){ table.dataset.tline = String(x.line); table.style.setProperty('--tbl-line', String(x.line)); }
  if (x.padX >= 0){ table.dataset.tpadx = String(x.padX); table.style.setProperty('--tbl-pad-x', x.padX + 'px'); }
  if (x.padY >= 0){ table.dataset.tpady = String(x.padY); table.style.setProperty('--tbl-pad-y', x.padY + 'px'); }
  if (x.cols.length){
    table.dataset.tcols = '1';
    if (!cg){ cg = document.createElement('colgroup'); table.insertBefore(cg, table.firstChild); }
    while (cg.children.length < nc) cg.appendChild(document.createElement('col'));
    while (cg.children.length > nc) cg.lastElementChild.remove();
    x.cols.forEach((v,i) => cg.children[i].style.width = v + '%');
    table.style.tableLayout = 'fixed';
  } else if (cg){ cg.remove(); table.style.removeProperty('table-layout'); }
}
function parseTableModel(raw){
  const parts = tableLayoutParts(raw);
  const lines = String(parts.body).split('\n').filter(l => l.trim());
  const cells = splitTableRow;                     // CP49:model 內恆存未跳脫字面值
  const header = cells(lines[0] || '|  |');
  const alignRow = lines[1] ? cells(lines[1]) : [];
  const align = header.map((_, c) => {
    const a = alignRow[c] || '';
    const L = a.startsWith(':'), R = a.endsWith(':');
    return L && R ? 'center' : R ? 'right' : L ? 'left' : '';
  });
  const nc = header.length;
  const fix = r => { const x = r.slice(0, nc); while (x.length < nc) x.push(''); return x; };
  const body = lines.slice(2).map(cells).map(fix);
  return { align, rows: [fix(header), ...(body.length ? body : [Array(nc).fill('')])],
           layout:tableLayoutClean(parts.layout, nc) };
}
/* CP50:表格儲存格跳脫(與 splitTableRow 互為反函式)— | 一律前置 \;
   \ 只在後接 \ 或 | 時加倍(LaTeX 如 \alpha 原樣保留)。 */
function escTableCell(c){
  return (c || '').replace(/\\(?=[\\|])/g, '\\\\').replace(/\|/g, '\\|');
}
function buildTableRaw(m){
  const nc = m.rows[0].length;
  const line = r => '| ' + r.map(escTableCell).join(' | ') + ' |';
  const al = m.align.slice(0, nc); while (al.length < nc) al.push('');
  const aline = '| ' + al.map(a =>
    a === 'center' ? ':---:' : a === 'right' ? '---:' : a === 'left' ? ':---' : '---').join(' | ') + ' |';
  const body = [line(m.rows[0]), aline, ...m.rows.slice(1).map(line)].join('\n');
  const meta = tableLayoutMeta(m.layout, nc);
  return meta ? meta + '\n' + body : body;
}
/* CP50:顯示寬度(CJK=2)— Markdown serializer 以 wcswidth 算 setext 底線的同款思路,
   用於「重新格式化」的欄寬對齊。涵蓋 East Asian Wide/Fullwidth 主要區段。 */
function dispWidth(s){
  let w = 0;
  for (const ch of String(s)){
    const cp = ch.codePointAt(0);
    w += (cp >= 0x1100 && (cp <= 0x115F || cp === 0x2329 || cp === 0x232A ||
      (cp >= 0x2E80 && cp <= 0xA4CF && cp !== 0x303F) ||
      (cp >= 0xAC00 && cp <= 0xD7A3) || (cp >= 0xF900 && cp <= 0xFAFF) ||
      (cp >= 0xFE30 && cp <= 0xFE6F) || (cp >= 0xFF00 && cp <= 0xFF60) ||
      (cp >= 0xFFE0 && cp <= 0xFFE6) || (cp >= 0x20000 && cp <= 0x3FFFD))) ? 2 : 1;
  }
  return w;
}
/* CP50:重新格式化用 — 欄寬對齊的漂亮序列化(讀回模型與 buildTableRaw 完全等價,
   splitTableRow 會 trim;僅供一次性 reformat,常規操作仍寫緊湊形)。 */
function buildTableRawPadded(m){
  const nc = m.rows[0].length;
  const fix = r => { const x = r.slice(0, nc).map(escTableCell); while (x.length < nc) x.push(''); return x; };
  const cells = m.rows.map(fix);
  const al = m.align.slice(0, nc); while (al.length < nc) al.push('');
  const w = Array(nc).fill(3);
  cells.forEach(r => r.forEach((c, i) => { w[i] = Math.max(w[i], dispWidth(c)); }));
  const pad = (c, i) => c + ' '.repeat(w[i] - dispWidth(c));
  const line = r => '| ' + r.map(pad).join(' | ') + ' |';
  const aline = '| ' + al.map((a, i) => {
    if (a === 'center') return ':' + '-'.repeat(w[i] - 2) + ':';
    if (a === 'right')  return '-'.repeat(w[i] - 1) + ':';
    if (a === 'left')   return ':' + '-'.repeat(w[i] - 1);
    return '-'.repeat(w[i]);
  }).join(' | ') + ' |';
  const body = [line(cells[0]), aline, ...cells.slice(1).map(line)].join('\n');
  const meta = tableLayoutMeta(m.layout, nc);
  return meta ? meta + '\n' + body : body;
}
/* CP50:CSV 單行切割 — 引號感知最小解析("…" 內逗號不斷欄,"" 為字面引號) */
function csvSplitLine(l){
  const out = []; let cur = '', q = false;
  for (let k = 0; k < l.length; k++){
    const ch = l[k];
    if (q){
      if (ch === '"' && l[k + 1] === '"'){ cur += '"'; k++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else {
      if (ch === '"') q = true;
      else if (ch === ','){ out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}
/* CP50:試算表文字 → 表格模型(指南 §7.1)。TSV=每行含 tab(試算表複製標準形);
   CSV 較嚴:每行含逗號且欄數一致才轉,防一般多行文句誤判。首行視為表頭;
   已是 Markdown 表格(行首 |)不接手,交回一般貼上路徑。回 null=不轉換。 */
function sheetTextToModel(text){
  const ls = String(text).replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim().length);
  if (ls.length < 2) return null;
  if (ls[0].trim().startsWith('|')) return null;
  let rows = null;
  if (ls.every(l => l.includes('\t'))) rows = ls.map(l => l.split('\t'));
  else if (ls.every(l => l.includes(','))){
    const rs = ls.map(csvSplitLine);
    if (rs[0].length >= 2 && rs.every(r => r.length === rs[0].length)) rows = rs;
  }
  if (!rows) return null;
  const nc = Math.max(...rows.map(r => r.length));
  if (nc < 2) return null;
  const fix = r => { const x = r.slice(0, nc).map(c => String(c ?? '').replace(/\s+/g, ' ').trim()); while (x.length < nc) x.push(''); return x; };
  return { align: Array(nc).fill(''), rows: rows.map(fix) };
}
function tblToolbarHTML(){
  const b = (act, label, title, cls) =>
    `<button type="button" data-tact="${act}"${cls ? ` class="${cls}"` : ''} title="${title}" tabindex="-1">${label}</button>`;
  return `<div class="tbl-bar" contenteditable="false">` +
    b('rowAbove', '↑＋列', '在目前列上方插入一列') +
    b('rowBelow', '↓＋列', '在目前列下方插入一列(⌘Enter)') +
    b('rowDel',   '－列',  '刪除目前列(⌘⇧⌫)') +
    `<span class="tb-sep"></span>` +
    b('colLeft',  '←＋欄', '在目前欄左方插入一欄') +
    b('colRight', '→＋欄', '在目前欄右方插入一欄') +
    b('colDel',   '－欄',  '刪除目前欄') +
    `<span class="tb-sep"></span>` +
    b('alignLeft',   '左', '本欄靠左(再按取消)', 'tb-al') +
    b('alignCenter', '中', '本欄置中(再按取消)', 'tb-al') +
    b('alignRight',  '右', '本欄靠右(再按取消)', 'tb-al') +
    `<span class="tb-sep"></span>` +
    b('singlePage', '單頁', '填滿單頁：Markdown 顯示緊湊預覽，A4 模式實際整頁適配', 'tb-page') +
    b('layoutPanel', '版面…', '設定寬度、字級、行距、儲存格間距與分頁方式') +
    `<span class="tb-sep"></span>` +
    b('tblDel', '刪表', '刪除整個表格') +
    b('exit',  '完成', '完成表格編輯(Esc)') +
    `</div>`;
}
function tableEditCellHTML(c){
  const h = escapeHtml(c);
  return h || '<br data-table-empty-line="1">';
}
function tableEditHTML(m){
  const at = c => m.align[c] ? ` style="text-align:${m.align[c]}"` : '';
  const nc = m.rows[0].length;
  let h = tblToolbarHTML() + '<table class="md-table"' + tableLayoutAttrs(m.layout, nc) + '>' +
          tableLayoutColgroup(m.layout, nc) + '<thead><tr>';
  m.rows[0].forEach((c, ci) =>
    h += `<th contenteditable="true" tabindex="-1" data-r="0" data-c="${ci}"${at(ci)}>${tableEditCellHTML(c)}</th>`);
  h += '</tr></thead><tbody>';
  for (let r = 1; r < m.rows.length; r++){
    h += '<tr>';
    m.rows[r].forEach((c, ci) =>
      h += `<td contenteditable="true" tabindex="-1" data-r="${r}" data-c="${ci}"${at(ci)}>${tableEditCellHTML(c)}</td>`);
    h += '</tr>';
  }
  return h + '</tbody></table>';
}
function enterTableEdit(i, focusCell, skipUndo){
  if (tableEdit && tableEdit.i === i) return;
  if (blockType(blocks[i] ?? '') === 'table' && !markdownTableHasOuterPipes(blocks[i] ?? '')){
    /* Markdown 相容無外框表格：現有 table serializer 會補上外框 pipe。為遵守 exact-raw
       契約，CP162B1／CP162B2A 不讓 WYSIWYG table editor 靜默正規化，改開原始碼區塊。 */
    commitMathEdit();exitTableEdit();deactivate(true);if(!skipUndo)pushUndo();activate(i,0);
    toast('無外框表格以原始碼編輯，避免改寫原始格式');return;
  }
  commitMathEdit();
  exitTableEdit();
  deactivate(true);
  if (!skipUndo) pushUndo();
  const el = editor.children[i];
  if (!el) return;
  tableEdit = { i, el, model: parseTableModel(blocks[i] ?? ''), cell: focusCell || { r: 0, c: 0 } };
  suppressSel++;
  el.className = 'block table-editing';
  el.innerHTML = tableEditHTML(tableEdit.model);
  twRestore(el);                                    /* CP57:欄寬套回 */
  requestAnimationFrame(()=> suppressSel = Math.max(0, suppressSel - 1));
  focusTableCell(tableEdit.cell.r, tableEdit.cell.c, true);
  updateBlockInfo();
  schedulePaginate();
}
function focusTableCell(r, c, toEnd){
  if (!tableEdit) return;
  const cell = tableEdit.el.querySelector(`[data-r="${r}"][data-c="${c}"]`);
  if (!cell) return;
  tableEdit.cell = { r, c };
  suppressSel++;
  const rg = document.createRange();
  rg.selectNodeContents(cell); rg.collapse(!toEnd);
  const s = getSelection(); s.removeAllRanges(); s.addRange(rg);
  cell.focus();
  requestAnimationFrame(()=> suppressSel = Math.max(0, suppressSel - 1));
  updateTblBarState();
}
/* CP49:對齊三鈕 active 態 ← 目前欄的 align(Markdown showAlignCol 對應) */
function updateTblBarState(){
  if (!tableEdit) return;
  const bar = tableEdit.el.querySelector('.tbl-bar');
  if (!bar) return;
  const a = tableEdit.model.align[tableEdit.cell.c] || '';
  const want = a ? 'align' + a[0].toUpperCase() + a.slice(1) : '';
  bar.querySelectorAll('.tb-al').forEach(x => x.classList.toggle('active', x.dataset.tact === want));
  const one = bar.querySelector('[data-tact="singlePage"]');
  if (one) one.classList.toggle('active', (tableEdit.model.layout || {}).page === 'single');
}
function syncTableFromDOM(){
  if (!tableEdit) return;
  tableEdit.el.querySelectorAll('[data-r]').forEach(cell => {
    const r = +cell.dataset.r, c = +cell.dataset.c;
    if (tableEdit.model.rows[r]) tableEdit.model.rows[r][c] = cell.textContent.replace(/\n+/g, ' ').trim();
  });
  blocks[tableEdit.i] = buildTableRaw(tableEdit.model);
}
function rebuildTableEdit(){
  const m = tableEdit.model;
  const r = Math.min(tableEdit.cell.r, m.rows.length - 1);
  const c = Math.min(tableEdit.cell.c, m.rows[0].length - 1);
  suppressSel++;
  tableEdit.el.innerHTML = tableEditHTML(m);
  twRestore(tableEdit.el);                          /* CP57:欄寬套回(欄數變 → 自動放棄) */
  requestAnimationFrame(()=> suppressSel = Math.max(0, suppressSel - 1));
  blocks[tableEdit.i] = buildTableRaw(m);
  focusTableCell(r, c, true);
  onEdited();
}
function exitTableEdit(){
  if (!tableEdit) return;
  hideTblMenu();                                    // CP49
  hideTblLayout();                                  // CP119
  syncTableFromDOM();
  const { i, el } = tableEdit;
  tableEdit = null;
  suppressSel++;
  el.className = 'block';
  el.innerHTML = renderBlockHTML(blocks[i]);
  twRestore(el);                                    /* CP57:欄寬套回 */
  requestAnimationFrame(()=> suppressSel = Math.max(0, suppressSel - 1));
  onEdited();
}
/* ===== CP119/CP57:表格欄寬拖曳（即時 px、放手後持久百分比） =====
   拖曳途中仍沿用 CP57 的 px colgroup，維持 Excel 式即時手感；mouseup 後把各欄
   換算為百分比與表格寬度，寫入 ekdeta-html-table 隱藏註解。換主題、重開文件、
   Markdown/A4 版心切換時都能重建；結構增刪欄會安全清掉舊比例，欄左右搬移則跟著搬。
   twStore 保留作舊 session 相容備援，持久 colgroup 存在時 twRestore 不再覆蓋。 */
function twZone(x, edges, tol){
  const t = tol == null ? 5 : tol;
  for (let k = 0; k < edges.length; k++)
    if (Math.abs(x - edges[k]) <= t) return k;
  return -1;
}
function twApplyDrag(widths, k, dx, min){
  const m = min == null ? 40 : min;
  const w = widths.slice();
  if (k < 0 || k >= w.length) return w;
  w[k] = Math.max(m, Math.round(widths[k] + dx));
  return w;
}
function twEdges(widths){
  const out = [];
  let s = 0;
  widths.forEach(function(v){ s += v; out.push(s); });
  return out;
}
const twStore = new WeakMap();      /* 區塊元素 → { n:欄數, w:[px…] } */
let twHover = null, twDrag = null;
function twFirstRowCells(table){
  const tr = table.querySelector('tr');
  return tr ? Array.prototype.slice.call(tr.children) : [];
}
function twMeasure(table){
  const z = Math.max(.01, viewZoomFactor());
  return twFirstRowCells(table).map(function(c){ return Math.round(c.getBoundingClientRect().width / z); });
}
function twApply(table, widths){
  let cg = table.querySelector('colgroup');
  const n = twFirstRowCells(table).length;
  if (!cg){
    cg = document.createElement('colgroup');
    for (let i = 0; i < n; i++) cg.appendChild(document.createElement('col'));
    table.insertBefore(cg, table.firstChild);
  }
  const cols = cg.children;
  let sum = 0;
  for (let i = 0; i < cols.length && i < widths.length; i++){
    cols[i].style.width = widths[i] + 'px';
    sum += widths[i];
  }
  table.style.tableLayout = 'fixed';
  table.style.width = sum + 'px';
}
function twRestore(blockEl){
  if (!blockEl) return;
  const table = blockEl.querySelector('table.md-table');
  if (!table) return;
  if (table.dataset.tcols === '1') return;           // CP119:持久比例已由 renderer 套好
  const rec = twStore.get(blockEl);
  if (!rec) return;
  if (twFirstRowCells(table).length !== rec.n){ twStore.delete(blockEl); return; }
  twApply(table, rec.w);
}
function twTableAt(target){
  const cell = target && target.closest ? target.closest('th,td') : null;
  if (!cell) return null;
  const table = cell.closest('table.md-table');
  if (!table || !editor.contains(table)) return null;
  return table;
}
editor.addEventListener('mousemove', function(e){
  if (twDrag) return;
  const table = twTableAt(e.target);
  if (twHover && twHover.table !== table) twHover.table.classList.remove('tw-hot');
  if (!table){ twHover = null; return; }
  const left = table.getBoundingClientRect().left, z = Math.max(.01, viewZoomFactor());
  const k = twZone((e.clientX - left) / z, twEdges(twMeasure(table)), 5 / z);
  table.classList.toggle('tw-hot', k >= 0);
  twHover = k >= 0 ? { table: table, k: k } : null;
});
editor.addEventListener('mousedown', function(e){
  if (e.button !== 0 || !twHover) return;
  const table = twTableAt(e.target);
  if (!table || table !== twHover.table) return;
  const left = table.getBoundingClientRect().left, z = Math.max(.01, viewZoomFactor());
  const w0 = twMeasure(table);
  const k = twZone((e.clientX - left) / z, twEdges(w0), 5 / z);
  if (k < 0) return;
  e.preventDefault(); e.stopPropagation();
  twDrag = { table: table, k: k, x0: e.clientX, w0: w0, armed:false };
  table.classList.add('tw-drag');
}, true);
document.addEventListener('mousemove', function(e){
  if (!twDrag) return;
  const dx = (e.clientX - twDrag.x0) / Math.max(.01, viewZoomFactor());
  if (!twDrag.armed && Math.abs(dx) >= 1){ pushUndo(); twDrag.armed = true; }
  twApply(twDrag.table, twApplyDrag(twDrag.w0, twDrag.k, dx, 40));
}, true);
document.addEventListener('mouseup', function(){
  if (!twDrag) return;
  const table = twDrag.table;
  table.classList.remove('tw-drag');
  const blockEl = table.closest('.block');
  const widths = twMeasure(table);
  if (blockEl) twStore.set(blockEl, { n: twFirstRowCells(table).length, w: widths });
  if (twDrag.armed && blockEl){
    const bi = blockIndexOf(blockEl);
    if (bi >= 0 && blockType(blocks[bi] || '') === 'table'){
      if (tableEdit && tableEdit.el === blockEl) syncTableFromDOM();
      const m = tableEdit && tableEdit.el === blockEl ? tableEdit.model : parseTableModel(blocks[bi]);
      const total = Math.max(1, widths.reduce((a,b)=>a+b,0));
      const cols = widths.map(v => Math.round(v / total * 1000) / 10);
      cols[cols.length - 1] = Math.round((100 - cols.slice(0,-1).reduce((a,b)=>a+b,0)) * 10) / 10;
      const edW = Math.max(1, editor.getBoundingClientRect().width / Math.max(.01, viewZoomFactor()));
      m.layout = tableLayoutClean(m.layout, widths.length);
      m.layout.cols = cols;
      m.layout.width = Math.max(75, Math.min(100, Math.round(total / edW * 100)));
      blocks[bi] = buildTableRaw(m);
      applyTableLayoutDOM(table, m.layout);
      if (tableEdit && tableEdit.el === blockEl) tableEdit.model = m;
      onEdited();
    }
  }
  schedulePaginate();   /* CP77:欄寬變更 → 重分頁使跨頁表頭浮層同步 */
  twDrag = null;
}, true);
/* CP49:表格結構操作核心 — 純函式(模型+游標進、新游標或 err 出),t10 測試行式抽取。
   對齊=Markdown md-align-gp 語意(同值再按=取消回預設);欄搬移連 align 一起搬
   (Markdown moveTableCol 有做 align splice,漏了就是換欄後對齊跟錯欄的 bug)。 */
function applyTableOp(m, act, r, c){
  const nc = m.rows[0].length;
  const blank = () => Array(nc).fill('');
  if (act === 'rowAbove'){ const at = Math.max(1, r); m.rows.splice(at, 0, blank()); return { r: at, c }; }
  if (act === 'rowBelow'){ const at = r === 0 ? 1 : r + 1; m.rows.splice(at, 0, blank()); return { r: at, c }; }
  if (act === 'rowDel'){
    if (r === 0) return { err: '表頭列不可刪除' };
    if (m.rows.length <= 2) return { err: '至少保留一列內容' };
    m.rows.splice(r, 1); return { r: Math.min(r, m.rows.length - 1), c };
  }
  if (act === 'rowUp'){
    if (r === 0) return { err: '表頭列不可搬移' };
    if (r === 1) return { err: '已在內容第一列' };
    const t = m.rows[r - 1]; m.rows[r - 1] = m.rows[r]; m.rows[r] = t;
    return { r: r - 1, c };
  }
  if (act === 'rowDown'){
    if (r === 0) return { err: '表頭列不可搬移' };
    if (r >= m.rows.length - 1) return { err: '已在最後一列' };
    const t = m.rows[r + 1]; m.rows[r + 1] = m.rows[r]; m.rows[r] = t;
    return { r: r + 1, c };
  }
  if (act === 'colLeft'){ m.rows.forEach(row => row.splice(c, 0, '')); m.align.splice(c, 0, ''); if (m.layout) m.layout.cols = []; return { r, c }; }
  if (act === 'colRight'){ m.rows.forEach(row => row.splice(c + 1, 0, '')); m.align.splice(c + 1, 0, ''); if (m.layout) m.layout.cols = []; return { r, c: c + 1 }; }
  if (act === 'colDel'){
    if (nc <= 1) return { err: '至少保留一欄' };
    m.rows.forEach(row => row.splice(c, 1)); m.align.splice(c, 1); if (m.layout) m.layout.cols = [];
    return { r, c: Math.min(c, nc - 2) };
  }
  if (act === 'colPrev'){
    if (c === 0) return { err: '已在第一欄' };
    m.rows.forEach(row => { const t = row[c - 1]; row[c - 1] = row[c]; row[c] = t; });
    const a = m.align[c - 1]; m.align[c - 1] = m.align[c]; m.align[c] = a;
    if (m.layout && m.layout.cols && m.layout.cols.length === nc){ const w=m.layout.cols[c-1]; m.layout.cols[c-1]=m.layout.cols[c]; m.layout.cols[c]=w; }
    return { r, c: c - 1 };
  }
  if (act === 'colNext'){
    if (c >= nc - 1) return { err: '已在最後一欄' };
    m.rows.forEach(row => { const t = row[c + 1]; row[c + 1] = row[c]; row[c] = t; });
    const a = m.align[c + 1]; m.align[c + 1] = m.align[c]; m.align[c] = a;
    if (m.layout && m.layout.cols && m.layout.cols.length === nc){ const w=m.layout.cols[c+1]; m.layout.cols[c+1]=m.layout.cols[c]; m.layout.cols[c]=w; }
    return { r, c: c + 1 };
  }
  if (act === 'alignLeft' || act === 'alignCenter' || act === 'alignRight'){
    const x = act === 'alignLeft' ? 'left' : act === 'alignCenter' ? 'center' : 'right';
    m.align[c] = m.align[c] === x ? '' : x;
    return { r, c };
  }
  return null;
}
function tableOp(act){
  if (!tableEdit) return;
  if (act === 'exit'){ exitTableEdit(); return; }
  if (act === 'tblDel'){ deleteTableBlock(); return; }
  if (act === 'singlePage'){ toggleTableSinglePage(); return; }  // CP119
  if (act === 'layoutPanel'){ showTblLayout(); return; }          // CP119
  if (act === 'reformat'){ reformatTable(); return; }            // CP50
  syncTableFromDOM();
  const { r, c } = tableEdit.cell;
  const res = applyTableOp(tableEdit.model, act, r, c);
  if (!res) return;
  if (res.err){ toast(res.err); return; }
  tableEdit.cell = { r: res.r, c: res.c };
  pushUndo();
  rebuildTableEdit();
}
/* CP49:刪除整個表格(Markdown md-delete-table)。先收齊儲存格未同步輸入再快照,
   ⌘Z 才能整表帶內容復原;唯一區塊時降為空段落(Markdown deleteTable 同款防呆)。 */
function deleteTableBlock(){
  if (!tableEdit) return;
  syncTableFromDOM();
  const { i, el } = tableEdit;
  tableEdit = null;
  hideTblMenu();
  hideTblLayout();
  pushUndo();
  if (blocks.length <= 1){
    blocks[i] = '';
    el.className = 'block';
    el.innerHTML = renderBlockHTML('');
  } else {
    el.className = 'block';
    removeBlockAt(i);
  }
  onEdited();
  toast('已刪除表格(⌘Z 可復原)');
}
/* CP50:重新格式化(指南 §7.2)— 欄寬對齊的一次性漂亮序列化,寫回後退出編輯
   (不走 exitTableEdit:其 sync 會以緊湊形覆蓋)。模型不變,可 ⌘Z。 */
function reformatTable(){
  if (!tableEdit) return;
  hideTblMenu();
  hideTblLayout();
  syncTableFromDOM();
  const { i, el } = tableEdit;
  pushUndo();
  blocks[i] = buildTableRawPadded(tableEdit.model);
  tableEdit = null;
  suppressSel++;
  el.className = 'block';
  el.innerHTML = renderBlockHTML(blocks[i]);
  twRestore(el);                                    /* CP57:欄寬套回 */
  requestAnimationFrame(()=> suppressSel = Math.max(0, suppressSel - 1));
  onEdited();
  toast('已重新格式化(欄寬對齊)');
}
/* CP119:表格版面面板。面板在 editor 外，但 blur 守門會保留表格編輯狀態；
   所有控制直接更新目前 table DOM 與同一份 Markdown metadata，不重掛、不奪 select 焦點。 */
let tblLayoutEl = null;
function tblLayoutOpen(){ return !!(tblLayoutEl && !tblLayoutEl.classList.contains('tlp-hidden')); }
function hideTblLayout(){ if (tblLayoutEl) tblLayoutEl.classList.add('tlp-hidden'); }
function tblLayoutOptions(vals, cur){
  return vals.map(v => '<option value="' + v[0] + '"' + (String(v[0]) === String(cur) ? ' selected' : '') + '>' + v[1] + '</option>').join('');
}
function tblLayoutApply(patch){
  if (!tableEdit) return;
  syncTableFromDOM();
  if (!tableEdit.layoutUndo){ pushUndo(); tableEdit.layoutUndo = true; }
  const nc = tableEdit.model.rows[0].length;
  const x = tableLayoutClean(tableEdit.model.layout, nc);
  Object.keys(patch || {}).forEach(k => x[k] = patch[k]);
  tableEdit.model.layout = tableLayoutClean(x, nc);
  blocks[tableEdit.i] = buildTableRaw(tableEdit.model);
  applyTableLayoutDOM(tableEdit.el.querySelector('table.md-table'), tableEdit.model.layout);
  updateTblBarState();
  onEdited();
}
function tblLayoutPreset(kind){
  if (kind === 'standard') tblLayoutApply({page:'auto',width:0,font:0,line:0,padX:-1,padY:-1});
  if (kind === 'compact')  tblLayoutApply({page:'auto',width:100,font:95,line:1.35,padX:8,padY:3});
  if (kind === 'tight')    tblLayoutApply({page:'auto',width:100,font:90,line:1.15,padX:6,padY:1});
  if (kind === 'single')   tblLayoutApply({page:'single',width:100,font:0,line:0,padX:-1,padY:-1});
  showTblLayout();
}
function toggleTableSinglePage(){
  if (!tableEdit) return;
  const on = (tableEdit.model.layout || {}).page === 'single';
  tblLayoutApply({page:on ? 'auto' : 'single'});
  toast(on ? '已關閉填滿單頁' : (inPaperMode() ? '已開啟填滿單頁；完成表格編輯後會依 A4 版心適配' : '已開啟填滿單頁；Markdown 顯示緊湊預覽'));
}
function showTblLayout(){
  if (!tableEdit) return;
  syncTableFromDOM();
  if (tblLayoutEl) tblLayoutEl.remove();
  const x = tableLayoutClean(tableEdit.model.layout, tableEdit.model.rows[0].length);
  const en = isEN();
  tblLayoutEl = document.createElement('div');
  tblLayoutEl.id = 'tbl-layout-panel';
  const note = inPaperMode()
    ? (en ? 'A4 mode: Single-page fit measures the real page body, moves the whole table to a clean page, then reduces spacing before font size. If the minimum still does not fit, normal row pagination is restored.' : 'A4 模式：填滿單頁會量測真實版心，先把整表移到完整頁，再先縮間距、最後才縮字；最低規格仍放不下時，安全回退為逐列跨頁。')
    : (en ? 'Markdown mode: the same settings are shown as a compact, width-aware preview. No A4 blank space or page jump is inserted; real single-page fitting starts only in Paper/TW_THESIS mode.' : 'Markdown 模式：同一組設定只顯示為緊湊、適寬預覽，不插入 A4 空白，也不強制跳頁；切到 Paper／TW_THESIS 後才執行真正的單頁量測。');
  tblLayoutEl.innerHTML =
    '<div class="tlp-head"><span>' + (en ? 'Table layout' : '表格版面') + '</span><button type="button" data-tlclose title="' + (en?'Close':'關閉') + '">×</button></div>' +
    '<div class="tlp-body"><div class="tlp-note">' + note + '</div>' +
    '<div class="tlp-presets">' +
      '<button type="button" data-tlpreset="standard">' + (en?'Standard':'標準') + '</button>' +
      '<button type="button" data-tlpreset="compact">' + (en?'Compact':'緊湊') + '</button>' +
      '<button type="button" data-tlpreset="tight">' + (en?'Tight':'極緊湊') + '</button>' +
      '<button type="button" data-tlpreset="single">' + (en?'Fit one page':'填滿單頁') + '</button></div>' +
    '<div class="tlp-grid">' +
      '<label>' + (en?'Pagination':'分頁方式') + '</label><select data-tlkey="page">' + tblLayoutOptions([['auto',en?'Automatic':'自動'],['keep',en?'Keep table together':'整表同頁'],['single',en?'Fit to one page':'填滿單頁']],x.page) + '</select>' +
      '<label>' + (en?'Table width':'表格寬度') + '</label><select data-tlkey="width">' + tblLayoutOptions([[0,en?'Automatic':'自動'],[75,'75%'],[90,'90%'],[100,'100%']],x.width) + '</select>' +
      '<label>' + (en?'Font size':'字體大小') + '</label><select data-tlkey="font">' + tblLayoutOptions([[0,en?'Automatic':'自動'],[100,'100%'],[95,'95%'],[90,'90%'],[85,'85%'],[80,'80%'],[75,'75%']],x.font) + '</select>' +
      '<label>' + (en?'Line height':'表格行距') + '</label><select data-tlkey="line">' + tblLayoutOptions([[0,en?'Automatic':'自動'],[1.7,'1.70'],[1.5,'1.50'],[1.35,'1.35'],[1.25,'1.25'],[1.15,'1.15'],[1.05,'1.05'],[1,'1.00']],x.line) + '</select>' +
      '<label>' + (en?'Column padding':'欄左右間距') + '</label><select data-tlkey="padX">' + tblLayoutOptions([[-1,en?'Automatic':'自動'],[15,'15 px'],[12,'12 px'],[10,'10 px'],[8,'8 px'],[6,'6 px'],[4,'4 px'],[2,'2 px']],x.padX) + '</select>' +
      '<label>' + (en?'Row padding':'列上下間距') + '</label><select data-tlkey="padY">' + tblLayoutOptions([[-1,en?'Automatic':'自動'],[6,'6 px'],[5,'5 px'],[4,'4 px'],[3,'3 px'],[2,'2 px'],[1,'1 px'],[0,'0 px']],x.padY) + '</select>' +
    '</div><p class="tlp-status">' + (en?'Column-edge dragging is now saved as percentages and survives theme changes and reopening.':'拖曳欄界後會保存為百分比；換主題、重開文件與切換版心都會保留。') + '</p>' +
    '<div class="tlp-foot"><button type="button" data-tlresetcols>' + (en?'Reset column widths':'重設欄寬') + '</button><button type="button" data-tlclose>' + (en?'Done':'完成') + '</button></div></div>';
  document.body.appendChild(tblLayoutEl);
  tblLayoutEl.addEventListener('mousedown', e => e.stopPropagation());
  tblLayoutEl.addEventListener('click', e => {
    const p = e.target.closest && e.target.closest('[data-tlpreset]');
    if (p){ e.preventDefault(); tblLayoutPreset(p.dataset.tlpreset); return; }
    if (e.target.closest && e.target.closest('[data-tlresetcols]')){ e.preventDefault(); tblLayoutApply({cols:[]}); showTblLayout(); return; }
    if (e.target.closest && e.target.closest('[data-tlclose]')){ e.preventDefault(); hideTblLayout(); return; }
  });
  tblLayoutEl.addEventListener('change', e => {
    const k = e.target && e.target.dataset ? e.target.dataset.tlkey : '';
    if (!k) return;
    let v = e.target.value;
    if (k !== 'page') v = Number(v);
    tblLayoutApply({[k]:v});
  });
  const tr = tableEdit.el.querySelector('table.md-table').getBoundingClientRect();
  tblLayoutEl.style.left = Math.max(8, Math.min(innerWidth - 368, tr.right - 360)) + 'px';
  tblLayoutEl.style.top = Math.max(8, Math.min(innerHeight - 628, tr.top + 38)) + 'px';
}
/* CP49:表格右鍵選單 — body 層單例固定定位;mousedown preventDefault 防奪儲存格焦點 */
let tblMenuEl = null;
function tblMenuOpen(){
  return !!(tblMenuEl && tblMenuEl.style.display === 'block');
}
function hideTblMenu(){
  if (tblMenuEl) tblMenuEl.style.display = 'none';
}
function showTblMenu(x, y){
  if (!tblMenuEl){
    tblMenuEl = document.createElement('div');
    tblMenuEl.className = 'tbl-menu';
    const b = (act, label) => `<button type="button" data-tact="${act}" tabindex="-1">${label}</button>`;
    tblMenuEl.innerHTML =
      b('rowAbove', '上方插入列') + b('rowBelow', '下方插入列 ⌘Enter') + b('rowDel', '刪除目前列 ⌘⇧⌫') +
      b('rowUp', '列上移 ⌥↑') + b('rowDown', '列下移 ⌥↓') +
      '<div class="tm-sep"></div>' +
      b('colLeft', '左方插入欄') + b('colRight', '右方插入欄') + b('colDel', '刪除目前欄') +
      b('colPrev', '欄左移 ⌥←') + b('colNext', '欄右移 ⌥→') +
      '<div class="tm-sep"></div>' +
      b('singlePage', '切換填滿單頁') + b('layoutPanel', '表格版面…') +
      b('reformat', '重新格式化(欄寬對齊)') +
      b('tblDel', '刪除整個表格');
    document.body.appendChild(tblMenuEl);
    tblMenuEl.addEventListener('mousedown', e => e.preventDefault());
    tblMenuEl.addEventListener('click', e => {
      const t = e.target.closest && e.target.closest('[data-tact]');
      if (!t) return;
      e.preventDefault(); e.stopPropagation();
      hideTblMenu();
      tableOp(t.dataset.tact);
    });
  }
  tblMenuEl.style.display = 'block';
  tblMenuEl.style.left = Math.min(x, innerWidth - tblMenuEl.offsetWidth - 8) + 'px';
  tblMenuEl.style.top = Math.min(y, innerHeight - tblMenuEl.offsetHeight - 8) + 'px';
}
function moveCellRow(d, createIfEnd){
  if (!tableEdit) return;
  syncTableFromDOM();
  const { r, c } = tableEdit.cell;
  const nr = r + d;
  if (nr < 0) return;
  if (nr >= tableEdit.model.rows.length){
    if (!createIfEnd) return;
    pushUndo();
    tableEdit.model.rows.push(Array(tableEdit.model.rows[0].length).fill(''));
    tableEdit.cell = { r: nr, c };
    rebuildTableEdit();
    return;
  }
  focusTableCell(nr, c, true);
}
function tabMoveCell(back){
  if (!tableEdit) return;
  syncTableFromDOM();
  const m = tableEdit.model, nc = m.rows[0].length;
  let idx = tableEdit.cell.r * nc + tableEdit.cell.c + (back ? -1 : 1);
  if (idx < 0) idx = 0;
  if (idx >= m.rows.length * nc){
    pushUndo();
    m.rows.push(Array(nc).fill(''));
    tableEdit.cell = { r: m.rows.length - 1, c: 0 };
    rebuildTableEdit();
    return;
  }
  focusTableCell(Math.floor(idx / nc), idx % nc, true);
}
/* 換文件 / 套用快照 / 進原始碼模式前:直接清空編輯狀態(DOM 即將整批重建,不需個別復原) */
function resetEditModes(){
  editContextBump('resetEditModes');
  mathEditEl = null; mathEditInfo = null;
  tableEdit = null;
  if (typeof hideTblMenu === 'function') hideTblMenu();   // CP49:重掛前收表格選單
  if (typeof hideTblLayout === 'function') hideTblLayout(); // CP119:重掛前收表格版面面板
  if (typeof hideCtxMenu === 'function') hideCtxMenu();   // CP59:重掛前收右鍵選單
  if (typeof qoClose === 'function') qoClose();           // CP63:重掛前收快速開檔
  hideMathPreview();
  hideImgBar();
  if (typeof peIndex !== 'undefined' && peIndex >= 0){
    peIndex = -1; peOriginal = null; peContext=null;
    const p = document.querySelector('#pe-panel');
    if (p) p.classList.add('pe-hidden');
  }
}
/* 工具列點擊(capture,先於連結/核取處理)與儲存格焦點追蹤 */
/* CP121:目錄頁碼跳轉 — capture 階段攔截，避免論文覆蓋式編輯把目錄 block 打開。
   標準 href/id 保留在 DOM；CP123 會在向量與點陣 PDF 輸出時保存同一組目的地。 */
editor.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a.twthesis-nav-link');
  if (!a) return;
  e.preventDefault(); e.stopImmediatePropagation();
  twthesisNavigate(a.dataset.twthesisNavKind, Number(a.dataset.twthesisNavIndex));
}, true);
editor.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const a = e.target.closest && e.target.closest('a.twthesis-nav-link');
  if (!a) return;
  e.preventDefault(); e.stopImmediatePropagation();
  twthesisNavigate(a.dataset.twthesisNavKind, Number(a.dataset.twthesisNavIndex));
}, true);
/* CP17:點引用 [[N]] → 捲動到對應參考文獻並淡綠高亮(捕獲相位優先於論文覆蓋式編輯) */
editor.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('.twthesis-citelink');
  if (!a) return;
  e.preventDefault(); e.stopPropagation();
  const ref = document.getElementById('twthesis-ref-' + a.dataset.ref);
  if (!ref) return;
  ref.scrollIntoView({ behavior: 'smooth', block: 'center' });
  editor.querySelectorAll('.twthesis-cite-hit').forEach(x => x.classList.remove('twthesis-cite-hit'));
  ref.classList.add('twthesis-cite-hit');
  setTimeout(() => ref.classList.remove('twthesis-cite-hit'), 1800);
}, true);
editor.addEventListener('click', e => {
  const tb = e.target.closest && e.target.closest('[data-tact]');
  if (tb && tableEdit){ e.preventDefault(); e.stopPropagation(); tableOp(tb.dataset.tact); }
}, true);
editor.addEventListener('focusin', e => {
  if (tableEdit && e.target.dataset && e.target.dataset.r !== undefined){
    tableEdit.cell = { r: +e.target.dataset.r, c: +e.target.dataset.c };
    updateTblBarState();                            // CP49:游標換欄 → 對齊鈕 active 同步
  }
});
/* CP49:表格編輯中右鍵 → 結構操作選單(使用既有 右鍵 table 選單)。
   先以右鍵落點更新 cell(未 focus 的儲存格 focusin 不會先觸發)。 */
editor.addEventListener('contextmenu', e => {
  if (!tableEdit || !tableEdit.el.contains(e.target)) return;
  e.preventDefault();
  const cell = e.target.closest && e.target.closest('[data-r]');
  if (cell) tableEdit.cell = { r: +cell.dataset.r, c: +cell.dataset.c };
  updateTblBarState();
  showTblMenu(e.clientX, e.clientY);
});
document.addEventListener('mousedown', e => {       // CP49/CP119:點浮層外 → 關
  if (tblMenuOpen() && !(e.target.closest && e.target.closest('.tbl-menu'))) hideTblMenu();
  if (tblLayoutOpen() && !(e.target.closest && e.target.closest('#tbl-layout-panel'))) hideTblLayout();
}, true);
addEventListener('scroll', () => { hideTblMenu(); hideTblLayout(); }, true);

/* ===== CP59:全域右鍵選單 =====
   使用既有 右鍵選單(copy-as 家族+編輯操作)與 CP49 .tbl-menu 單例模式:
   body 層固定定位單例、mousedown preventDefault 防奪焦點(選取零流失 —
   copy-as 依賴當下選取)、點外 / Esc / 捲動 / resetEditModes 全關。
   範圍互斥:表格編輯內讓位給 .tbl-menu(CP49 那份是結構操作專用);
   INPUT/TEXTAREA/SELECT 交還瀏覽器原生選單(發現 2 isInputComponent 思路)。
   貼上:navigator.clipboard.readText → 合成 ClipboardEvent 餵既有 paste 管線
   (CP6 圖片、CP50 試算表、多行切塊全沿用,零重工);讀取被拒 → toast 提示
   改用 ⌘V(瀏覽器安全策略,無從繞過)。ctxClamp / ctxAllow 純函式,t20 離線測。 */
function ctxClamp(x, y, w, h, vw, vh, pad){
  const p = pad == null ? 8 : pad;
  return { left: Math.max(p, Math.min(x, vw - w - p)),
           top:  Math.max(p, Math.min(y, vh - h - p)) };
}
function ctxAllow(f){
  const o = f || {};
  if (o.isFormControl) return false;
  if (o.inTblEdit) return false;
  return true;
}
let ctxMenuEl = null;
function ctxMenuOpen(){
  return !!(ctxMenuEl && ctxMenuEl.style.display === 'block');
}
function hideCtxMenu(){
  if (ctxMenuEl) ctxMenuEl.style.display = 'none';
}
function ctxPaste(){
  if (!(navigator.clipboard && navigator.clipboard.readText)){
    toast(TT('瀏覽器不允許讀剪貼簿,請用 ⌘V 貼上','Clipboard blocked — use Ctrl/⌘+V'));
    return;
  }
  navigator.clipboard.readText().then(text => {
    if (!text){ toast(TT('剪貼簿沒有文字','Clipboard has no text')); return; }
    let ev = null;
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    } catch(_){}
    if (ev && ev.clipboardData) editor.dispatchEvent(ev);
    else toast(TT('此瀏覽器不支援程式化貼上,請用 ⌘V','Paste unsupported here — use Ctrl/⌘+V'));
  }).catch(() => toast(TT('讀取剪貼簿被拒,請用 ⌘V 貼上','Clipboard read denied — use Ctrl/⌘+V')));
}
function showCtxMenu(x, y){
  if (!ctxMenuEl){
    ctxMenuEl = document.createElement('div');
    ctxMenuEl.className = 'ctx-menu';
    const b = (act, label, key) =>
      `<button type="button" data-cact="${act}" tabindex="-1"><span>${label}</span>` +
      (key ? `<span class="cm-key">${key}</span>` : '') + '</button>';
    ctxMenuEl.innerHTML =
      b('copyMD',   TT('複製為 Markdown','Copy as Markdown'), '⇧⌘C') +
      b('copyTex',  TT('複製為 LaTeX','Copy as LaTeX'), '') +
      b('copyWord', TT('複製為 HTML(Word 可貼)','Copy as HTML (for Word)'), '') +
      '<div class="cm-sep"></div>' +
      b('paste',    TT('貼上','Paste'), '⌘V') +
      b('selAll',   TT('全選','Select All'), '⌘A');
    document.body.appendChild(ctxMenuEl);
    ctxMenuEl.addEventListener('mousedown', e => e.preventDefault());
    ctxMenuEl.addEventListener('contextmenu', e => e.preventDefault());
    ctxMenuEl.addEventListener('click', e => {
      const t = e.target.closest && e.target.closest('[data-cact]');
      if (!t) return;
      e.preventDefault(); e.stopPropagation();
      hideCtxMenu();
      const act = t.dataset.cact;
      if (act === 'copyMD') cmdCopyMD();
      else if (act === 'copyTex') cmdCopyTex();
      else if (act === 'copyWord') cmdCopyWordHtml();
      else if (act === 'paste') ctxPaste();
      else if (act === 'selAll') document.execCommand('selectAll');
    });
  }
  ctxMenuEl.style.display = 'block';
  const p = ctxClamp(x, y, ctxMenuEl.offsetWidth, ctxMenuEl.offsetHeight, innerWidth, innerHeight, 8);
  ctxMenuEl.style.left = p.left + 'px';
  ctxMenuEl.style.top = p.top + 'px';
}
editor.addEventListener('contextmenu', e => {
  const flags = {
    inTblEdit: !!(tableEdit && tableEdit.el.contains(e.target)),
    isFormControl: !!(e.target.closest && e.target.closest('input,textarea,select')),
  };
  if (!ctxAllow(flags)) return;                     // 表格編輯讓位 tbl-menu;表單交原生
  e.preventDefault();
  hideTblMenu();
  showCtxMenu(e.clientX, e.clientY);
});
document.addEventListener('mousedown', e => {       // 點選單外 → 關
  if (ctxMenuOpen() && !(e.target.closest && e.target.closest('.ctx-menu'))) hideCtxMenu();
}, true);
document.addEventListener('keydown', e => {         // Esc → 關(捕獲層,焦點在哪都收得到)
  if (e.key === 'Escape' && ctxMenuOpen()){ e.preventDefault(); hideCtxMenu(); }
}, true);
addEventListener('scroll', () => hideCtxMenu(), true);

editor.addEventListener('keydown', e => {
  if (composing || e.keyCode === 229) return;
  const meta = e.metaKey || e.ctrlKey;

  /* CP53:補全面板開啟時優先接管導航鍵(Markdown:handleKeyEvents 先於一切) */
  if (acVisible() && acHandleKeydown(e)) return;

  /* --- 行內公式/樣式/純文字編輯中:Enter/Tab 提交、Esc 取消,其餘交給原生輸入 --- */
  if (mathEditEl){
    if (e.key === 'Enter' || e.key === 'Tab'){
      e.preventDefault();
      const info = mathEditInfo;
      /* CP153：Tab／Shift+Tab 與 ⌘]／⌘[ 共用同一筆 model-first 清單縮排交易。
         內容含 inline token 時也只移動清單層級，不把 marker 或 token 展開成 raw。 */
      if (info && info.isPlain && info.structType && e.key === 'Tab' && applyListIndent(e.shiftKey)) return;
      if (info && info.isPlain && info.structType && e.key === 'Enter'){
        if (handleStructuredEditEnter(info, e.shiftKey)) return;
      }
      if (info && (info.isPlain || info.isIl) && e.key === 'Enter'){   // 一般段中 Enter → 既有原始碼分割
        const pos = info.start + caretOffsetIn(mathEditEl);
        commitMathEdit();
        activate(info.i, pos);
        handleEnter(e.shiftKey);
        return;
      }
      commitMathEdit();
      if (info) caretAfterMath(info.blockEl, info.mi, info.attr);
      return;
    }
    if (e.key === 'Escape'){ e.preventDefault(); commitMathEdit(true); return; }
    /* T8 v1.1(CP102):il 就地編輯的邊界刪除守衛 — il 前緣 Backspace / 後緣 Delete
       的原生行為會吃到 il 外的渲染 DOM(外側 DOM≠raw → CP36 資料毀損同族)。
       改為:提交本 il(含未提交輸入;未變更則零重排)→ 游標移至 il 外側緊鄰處 →
       自然 selectionchange 交由既有路由開啟相鄰編輯面;下一按鍵即為預期的刪除
       (與「mathEdit 開啟中點他處需點第二下」同一類既有取捨,記入工作清單)。 */
    if (mathEditInfo && mathEditInfo.isIl && (e.key === 'Backspace' || e.key === 'Delete')){
      const s = getSelection();
      if (s.rangeCount && s.isCollapsed){
        const off = caretOffsetIn(mathEditEl);
        const len = mathEditEl.textContent.length;
        if ((e.key === 'Backspace' && off <= 0) || (e.key === 'Delete' && off >= len)){
          e.preventDefault();
          const info = mathEditInfo;
          commitMathEdit();
          const bEl = editor.children[info.i];
          const sp = bEl ? bEl.querySelector(`[data-si="${info.mi}"]`) : null;
          const w = sp ? (sp.closest('[data-il]') || sp) : null;
          if (w){
            /* 落點必須放在相鄰「文字節點」內:元素索引位置會被 startPlainEdit 的
               comparePoint 判為 0(邊界)而整塊 activate(探針實測);文字節點位置
               則走正常 plain-edit 路由。相鄰若非文字(token 緊貼)→ 退元素邊界。 */
            const r = document.createRange();
            if (e.key === 'Backspace'){
              let tp = w.previousSibling;
              while (tp && tp.nodeType !== 3) tp = tp.previousSibling;
              if (tp) r.setStart(tp, tp.data.length); else r.setStartBefore(w);
            } else {
              let tn2 = w.nextSibling;
              while (tn2 && tn2.nodeType !== 3) tn2 = tn2.nextSibling;
              if (tn2) r.setStart(tn2, 0); else r.setStartAfter(w);
            }
            r.collapse(true);
            const s2 = getSelection(); s2.removeAllRanges(); s2.addRange(r);
          }
          return;
        }
      }
    }
    if (mathEditInfo && mathEditInfo.isPlain && (e.key === 'Backspace' || e.key === 'Delete')){
      const info=mathEditInfo;
      if(info.structType&&structuredBoundaryDelete(e,info))return;
      const s=getSelection();                                // 非結構 plain host 沿用既有 token 邊界守衛
      if(s.rangeCount){
        if(!s.isCollapsed)return;
        const off=caretOffsetIn(mathEditEl),len=mathEditEl.textContent.length;
        if((e.key==='Backspace'&&off<=0)||(e.key==='Delete'&&off>=len)){
          e.preventDefault();commitMathEdit();activate(info.i,info.start+off);return;
        }
      }
    }
    return;
  }
  /* --- 表格編輯中:儲存格導航與跳出 --- */
  if (tableEdit){
    if (e.key === 'Escape'){
      e.preventDefault();
      if (tblLayoutOpen()) hideTblLayout();
      else if (tblMenuOpen()) hideTblMenu();
      else exitTableEdit();                                    // CP49/CP119:面板→選單→表格
      return;
    }
    if (meta && e.key === 'Enter'){ e.preventDefault(); tableOp('rowBelow'); return; }                  // CP49:Ekdeta keydownHandler
    if (meta && e.shiftKey && e.key === 'Backspace'){ e.preventDefault(); tableOp('rowDel'); return; }  // CP49:指南 §30 刪除表格列
    if (e.altKey && /^Arrow(Up|Down|Left|Right)$/.test(e.key)){                                          // CP49:⌥方向鍵搬移列/欄
      e.preventDefault();
      tableOp({ ArrowUp: 'rowUp', ArrowDown: 'rowDown', ArrowLeft: 'colPrev', ArrowRight: 'colNext' }[e.key]);
      return;
    }
    if (e.key === 'Tab'){ e.preventDefault(); tabMoveCell(e.shiftKey); return; }
    if (e.key === 'Enter'){ e.preventDefault(); moveCellRow(1, true); return; }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.shiftKey){
      e.preventDefault(); moveCellRow(e.key === 'ArrowDown' ? 1 : -1, false); return;
    }
    if (meta || e.altKey) return;                 // 快捷鍵交給 document 層
    return;                                       // 其餘按鍵於儲存格內原生編輯
  }

  /* 全域快捷鍵(⌘組合、F8/F9…)改由 document 層的 handleShortcut 統一處理 */
  if (meta || (e.altKey && e.key !== 'Enter')) return;

  /* --- 跨區塊選取的刪除/取代 --- */
  const multi = multiBlockSelection();
  if (multi){
    if (e.key === 'Backspace' || e.key === 'Delete'){
      e.preventDefault(); pushUndo(); deleteMulti(multi); return;
    }
    if (e.key.length === 1){
      e.preventDefault(); pushUndo(); deleteMulti(multi);
      insertTextAtCaret(e.key); return;
    }
    if (e.key === 'Enter'){ e.preventDefault(); pushUndo(); deleteMulti(multi); }
  }

  if (activeIndex < 0 && ['Enter','Backspace','Tab'].includes(e.key)){
    const el = blockElOf(getSelection().anchorNode);
    if (el) activate(blockIndexOf(el), null);
  }

  if (e.key === 'Enter'){ e.preventDefault(); handleEnter(e.shiftKey); return; }
  if (e.key === 'Backspace'){ if (handleBackspace()) e.preventDefault(); return; }
  if (e.key === 'Tab'){ e.preventDefault(); handleTab(e.shiftKey); return; }
  if (e.key === 'Escape'){
    if (document.body.classList.contains('findopen')) return;   // 交給尋找列關閉
    if (activeIndex >= 0){
      const t = blockType(blocks[activeIndex] = getRawText(editor.children[activeIndex]));
      if (t === 'code' || t === 'table' || t === 'math'){       // Esc 跳出多行區塊
        e.preventDefault();
        const i = activeIndex;
        deactivate(true);
        if (i === blocks.length - 1) insertBlockAfter(i, '');
        activate(i + 1, 0);
      }
    }
    return;
  }
  if (tryAutoPair(e)){ e.preventDefault(); return; }
});

function handleEnter(shift){
  if (activeIndex < 0) return;
  const el = editor.children[activeIndex];
  const src = getRawText(el);
  const off = caretOffsetIn(el);
  const type = blockType(src.includes('\n') ? src : blocks[activeIndex] = src);

  /* 程式碼/表格區塊內:Enter = 區塊內換行 */
  if (src.includes('\n') || type === 'code' || type === 'table' || shift){
    pushUndoSoft();
    const next = src.slice(0, off) + '\n' + src.slice(off);
    blocks[activeIndex] = next;
    el.textContent = next;
    setCaret(el, off + 1);
    onEdited(); return;
  }

  pushUndo();
  let a = src.slice(0, off), b = src.slice(off);

  /* 清單自動接續;空清單項 → 跳出清單 */
  const lm = a.match(/^(\s*)([-*+]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+)(.*)$/);
  let prefix = '';
  if (lm){
    if (lm[3] === '' && b === ''){             // 空項目:降級為段落
      blocks[activeIndex] = '';
      el.className = 'block active';
      el.textContent = '';
      setCaret(el, 0); onEdited(); return;
    }
    const om = lm[2].match(/^(\d+)\.\s+$/);
    prefix = om ? lm[1] + (+om[1] + 1) + '. '
                : lm[1] + lm[2].replace(/\[[xX]\]/, '[ ]');
  } else if (/^>\s?/.test(a) && b !== ''){
    prefix = '> ';
  } else if (RE.fence.test(a)){                // 輸入 ``` 後按 Enter → 展開程式碼區塊
    blocks[activeIndex] = a + '\n' + (b || '') + '\n' + a.match(RE.fence)[1];
    el.className = 'block active raw-mono';
    el.textContent = blocks[activeIndex];
    setCaret(el, a.length + 1); onEdited(); return;
  } else if (a.trim() === '$$' && b === ''){   // 輸入 $$ 後按 Enter → 展開數學區塊
    blocks[activeIndex] = '$$\n\n$$';
    el.className = 'block active raw-mono';
    el.textContent = blocks[activeIndex];
    setCaret(el, 3); onEdited(); return;
  }

  blocks[activeIndex] = a;
  deactivate(false);   // CP32:head 已寫入 a,不可再從 DOM(仍為整行)回讀覆蓋(修行中 Enter 尾文重複)
  const i = blockIndexOf(el);
  insertBlockAfter(i, prefix + b);
  activate(i + 1, prefix.length);
  if (settings.typewriter) editor.children[i+1].scrollIntoView({ block:'center' });
  onEdited();
}

function handleBackspace(){
  if (activeIndex < 0) return false;
  const el = editor.children[activeIndex];
  const off = caretOffsetIn(el);
  /* CP38 合併:Claude 版補足的 active/raw 路徑。若清單因其他操作已進入
     原始碼態,游標仍在 marker 後方時 Backspace 也應一次取消整個清單。 */
  if (getSelection().isCollapsed && off > 0){
    const srcL = getRawText(el);
    const tL = blockType(srcL);
    const pmL = srcL.match(/^(\s*[-*+]\s+(?:\[[ xX]\]\s+)?|\s*\d+\.\s+)/);
    if ((tL === 'ul' || tL === 'ol' || tL === 'task') && pmL && off === pmL[0].length){
      pushUndo();
      const next = srcL.slice(pmL[0].length);
      blocks[activeIndex] = next;
      el.textContent = next;
      el.className = activeClassFor(next);
      setCaret(el, 0);
      onEdited(); updateBlockInfo(); schedulePaginate();
      return true;
    }
  }
  if (getSelection().isCollapsed && off > 0){                 // 空配對:一次刪除兩字元
    const src = getRawText(el);
    if (PAIR_DEL[src[off - 1]] && PAIR_DEL[src[off - 1]] === src[off]){
      pushUndoSoft();
      const next = src.slice(0, off - 1) + src.slice(off + 1);
      blocks[activeIndex] = next; el.textContent = next;
      el.className = activeClassFor(next);
      setCaret(el, off - 1);
      onEdited(); return true;
    }
  }
  if (off > 0 || !getSelection().isCollapsed) return false;   // 交給瀏覽器
  const i = activeIndex;
  if (i === 0) return true;                    // 文件開頭:不動作
  pushUndo();
  const cur = getRawText(el);
  deactivate(false);
  const prevLen = blocks[i-1].length;
  blocks[i-1] += cur;
  removeBlockAt(i);
  rerender(i-1);
  activate(i-1, prevLen);
  onEdited(); return true;
}

function listIndentRaw(raw, shift){
  raw=String(raw==null?'':raw);const p=structuredBlockParts(raw);
  if(!p||!p.isList)return null;
  if(!shift)return '  '+raw;
  if(p.depth<=0)return raw;
  return raw.replace(/^ {1,2}/,'');
}
/* 純 model 交易：所有呼叫端（一般畫面、Paper 浮動框、Backspace 邊界）共用。
   shift=false 為增加階層；shift=true 為減少階層。 */
function structuredShiftListSubtree(i,shift){
  const p=structuredBlockParts(blocks[i]??'');if(!p||!p.isList)return null;
  if(!shift&&structuredPreviousListSibling(i,p.depth)<0)return null;
  if(shift&&p.depth<=0)return null;
  const end=structuredListSubtreeEnd(i),oldContentStart=p.contentStart;
  for(let j=i;j<=end;j++){
    const q=structuredBlockParts(blocks[j]??'');if(!q||!q.isList)break;
    const next=listIndentRaw(blocks[j],shift);if(next==null)return null;blocks[j]=next;
  }
  /* 移入新 parent 的 ordered root 從 1 開始；同層後續項由 normalize 接續。 */
  if(!shift){const q=structuredBlockParts(blocks[i]??'');if(q&&q.type==='ol')blocks[i]=structuredSetOrderedNumber(blocks[i],1);}
  const bounds=structuredNormalizeOrderedRegion(i),now=structuredBlockParts(blocks[i]??'')||p;
  return {i,end,bounds,oldContentStart,newContentStart:now.contentStart,delta:now.contentStart-oldContentStart};
}
/* CP154：縮排是一筆「清單子樹交易」，不是只在目前行前面加兩個空白。
   移動父項時其後所有更深層子項一起移動；完成後同一清單區域一次重新編號、一次重繪。 */
function applyListIndent(shift){
  if(settings.srcmode)return false;
  const pe=$('#pe-text');
  /* Paper/TW_THESIS：textarea 只是目前 block 的編輯投影；先同步 blocks，再執行與一般
     畫面完全相同的子樹交易與 ordered normalize，避免第二套縮排規則。 */
  if(pe&&peIndex>=0&&document.activeElement===pe){
    const i=peIndex,cur=pe.value,p=structuredBlockParts(cur);if(!p||!p.isList)return false;
    blocks[i]=cur;
    const ss=pe.selectionStart,ee=pe.selectionEnd;
    pushUndo();const tx=structuredShiftListSubtree(i,shift);if(!tx)return false;
    structuredRerenderBounds(tx.bounds);
    const value=blocks[i]??'',a=Math.max(0,Math.min(value.length,ss+tx.delta)),z=Math.max(0,Math.min(value.length,ee+tx.delta));
    pe.value=value;pe.setSelectionRange(a,z);pe.focus();
    const el=editor.children[i];if(el)el.classList.add('pe-target');
    peContext=editContextStamp(i);autosizePe();updatePaperDeleteButton();schedulePaperPageCaret();
    onEdited();updateBlockInfo();schedulePaginate();return true;
  }
  if(tableEdit)return false;
  let i=-1,rawSelStart=0,rawSelEnd=0;
  if(mathEditEl&&mathEditInfo&&mathEditInfo.structType){
    const info=mathEditInfo,p=structuredBlockParts(structuredCurrentRaw(info));
    if(!p||!p.isList)return false;
    const sr=structuredSelectionOffsets(mathEditEl,info)||{start:structuredLocalCaret(mathEditEl,info),end:structuredLocalCaret(mathEditEl,info)};
    i=info.i;rawSelStart=info.start+sr.start;rawSelEnd=info.start+sr.end;
    blocks[i]=structuredCurrentRaw(info);commitMathEdit();
  }else if(activeIndex>=0){
    i=activeIndex;const el=editor.children[i];blocks[i]=getRawText(el);rawSelStart=rawSelEnd=caretOffsetIn(el);
  }else{
    const sel=getSelection(),el=sel&&sel.anchorNode?blockElOf(sel.anchorNode):null;if(!el)return false;
    i=blockIndexOf(el);const p=structuredBlockParts(blocks[i]??'');if(!p||!p.isList)return false;
    let vis=0;try{vis=offsetInBlock(el,sel.anchorNode,sel.anchorOffset);}catch(_){}
    rawSelStart=rawSelEnd=p.contentStart+vis;
  }
  const p=structuredBlockParts(blocks[i]??'');if(!p||!p.isList)return false;
  pushUndo();const tx=structuredShiftListSubtree(i,shift);if(!tx)return false;
  structuredRerenderBounds(tx.bounds);
  const now=structuredBlockParts(blocks[i]??'')||p;
  const rs=Math.max(now.contentStart,rawSelStart+tx.delta),re=Math.max(now.contentStart,rawSelEnd+tx.delta);
  structuredFocusRawRange(i,rs,re);
  onEdited();updateBlockInfo();schedulePaginate();return true;
}
function handleTab(shift){
  if (applyListIndent(shift)) return;
  if (activeIndex < 0) return;
  if (!shift){ pushUndoSoft(); insertTextAtCaret('  '); }
}

function insertTextAtCaret(text){
  if (activeIndex < 0){
    const el = blockElOf(getSelection().anchorNode);
    if (!el) return;
    activate(blockIndexOf(el), null);
  }
  const el = editor.children[activeIndex];
  const off = caretOffsetIn(el);
  const src = getRawText(el);
  const next = src.slice(0, off) + text + src.slice(off);
  blocks[activeIndex] = next;
  el.textContent = next;
  setCaret(el, off + text.length);
  onEdited();
}

/* ---------- 跨區塊選取 ---------- */
function multiBlockSelection(){
  const sel = getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return null;
  const a = blockElOf(sel.anchorNode), f = blockElOf(sel.focusNode);
  if (!a || !f || a === f) return null;
  let ai = blockIndexOf(a), fi = blockIndexOf(f);
  let aOff = offsetInBlock(a, sel.anchorNode, sel.anchorOffset);
  let fOff = offsetInBlock(f, sel.focusNode, sel.focusOffset);
  if (ai > fi){ [ai, fi] = [fi, ai]; [aOff, fOff] = [fOff, aOff]; }
  return { si: ai, so: aOff, ei: fi, eo: fOff };
}
function offsetInBlock(el, node, off){
  const r = document.createRange();
  r.selectNodeContents(el); r.setEnd(node, off);
  return r.toString().length;
}
function deleteMulti(m){
  deactivate(true);
  const sRaw = m.si === activeIndex ? m.so : visibleToRaw(blocks[m.si], m.so);
  const eRaw = m.ei === activeIndex ? m.eo : visibleToRaw(blocks[m.ei], m.eo);
  blocks[m.si] = blocks[m.si].slice(0, sRaw) + blocks[m.ei].slice(eRaw);
  for (let k = m.ei; k > m.si; k--) removeBlockAt(k);
  rerender(m.si);
  activate(m.si, sRaw);
  onEdited();
}

/* ---------- 輸入 / 貼上 ---------- */
/* CP100b:快照拍攝時點前移 — input 事件觸發時 DOM 已含新字,舊快照因此含首鍵
   (單鍵單位的快照 undo 形同 no-op,連打靠 400ms 合併掩蓋)。beforeinput 於字元
   落地前拍,undo 邊界自此不含首鍵;composing 與公式/樣式編輯不介入。 */
editor.addEventListener('beforeinput', (e) => {
  if (composing || e.isComposing) return;
  if (mathEditEl){ ilArmUndo(); return; }            /* T8 v1.1(CP102):il 首次變更前拍快照 */
  pushUndoSoft();
});
editor.addEventListener('input', () => {
  if (composing) return;
  if (mathEditEl){                                   // 公式/樣式／結構內容編輯:提交前不動 blocks
    normalizeStructuredSentinel();
    if (mathEditInfo && mathEditInfo.isMath) showMathPreview(mathEditEl, mathEditEl.textContent);
    acOnInput();                                     // CP53:行內編輯中的補全重評估
    return;
  }
  if (tableEdit){                                    // 表格編輯:儲存格 → 模型 → blocks 即時同步
    syncTableFromDOM();                              /* CP100b:快照已由 beforeinput 拍 */
    onEdited();
    return;
  }
  /* 快照已由 beforeinput 於字元落地前拍(CP100b)。
     即時同步權威資料:每次輸入立刻回寫 blocks[],
     徹底消除「切換檔案/失焦時機」造成的內容遺失(Checkpoint 4.1) */
  if (activeIndex >= 0 && editor.children[activeIndex])
    blocks[activeIndex] = getRawText(editor.children[activeIndex]);
  refreshBlockMathPreview();
  acOnInput();                                       // CP53:原始碼塊輸入 → 補全重評估
  onEdited();
});
/* CP47(T12):渲染態複製的 Markdown 保真。原況:GitHub/論文模式選取渲染文字複製,
   剪貼簿只有「可見文字」— 粗體星號/引註/連結/中段的程式碼圍欄全數遺失。
   新法:copy 攔截,端點經 renderedPointToRaw 換算 raw 位移(端點落在 token 上
   → 擴至整個 token,與 ⌘B 選取語意一致),中段區塊取整段 raw,以換行拼裝寫入
   剪貼簿 text/plain。守門(交回原生行為):原始碼模式/編輯宿主(顯示即 raw)/
   pe-text/端點落在多行區塊(code/math 的可見↔raw 非線性)/任何換算失敗。 */
function assembleRawCopy(iS, offS, iE, offE){
  if (iS === iE) return offS <= offE ? (blocks[iS] ?? '').slice(offS, offE) : null;
  const parts = [(blocks[iS] ?? '').slice(offS)];
  for (let k = iS + 1; k < iE; k++) parts.push(blocks[k] ?? '');
  parts.push((blocks[iE] ?? '').slice(0, offE));
  return parts.join('\n');
}
editor.addEventListener('copy', e => {
  try {
    if (settings.srcmode) return;
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    if (mathEditEl || tableEdit) return;                       // 宿主顯示即 raw → 原生
    const pe = $('#pe-text');
    if (pe && document.activeElement === pe) return;
    const r0 = sel.getRangeAt(0);                              // range 已依文件序排好
    const elS = blockElOf(r0.startContainer), elE = blockElOf(r0.endContainer);
    if (!elS || !elE) return;
    const iS = blockIndexOf(elS), iE = blockIndexOf(elE);
    if (iS < 0 || iE < 0 || iS > iE) return;
    const endpoint = (el, i, node, off) => {
      if (el.classList.contains('active'))
        return { off: offsetInBlock(el, node, off) };          // 原始碼態:顯示即 raw
      const raw = blocks[i] ?? '';
      if (raw.includes('\n')) return null;                     // 多行端點 → 原生
      return renderedPointToRaw(el, raw, node, off);
    };
    const pS = endpoint(elS, iS, r0.startContainer, r0.startOffset);
    const pE = endpoint(elE, iE, r0.endContainer, r0.endOffset);
    if (!pS || !pE) return;
    const offS = pS.tok ? pS.tok.start : pS.off;
    const offE = pE.tok ? pE.tok.end   : pE.off;
    if (offS == null || offE == null) return;
    const text = assembleRawCopy(iS, offS, iE, offE);
    if (text == null || text === '') return;
    e.clipboardData.setData('text/plain', text);
    e.preventDefault();
  } catch(_){}
});

/* CP52:渲染態剪下(⌘X)= CP47 複製保真同路徑 + 刪除選取。守門同 copy 五退原生
   (原生在渲染態本為 no-op,退原生=不剪,安全預設)。端點已是 raw:
   跨塊沿 deleteMulti 內體直供 raw(不可呼叫 deleteMulti — 其會把端點再當可見位移
   重換算);單塊原地 slice;原始碼態(active)改字+setCaret,維持編輯不退出。 */
editor.addEventListener('cut', e => {
  try {
    if (settings.srcmode) return;
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    if (mathEditEl || tableEdit) return;
    const pe = $('#pe-text');
    if (pe && document.activeElement === pe) return;
    const r0 = sel.getRangeAt(0);
    const elS = blockElOf(r0.startContainer), elE = blockElOf(r0.endContainer);
    if (!elS || !elE) return;
    const iS = blockIndexOf(elS), iE = blockIndexOf(elE);
    if (iS < 0 || iE < 0 || iS > iE) return;
    const endpoint = (el, i, node, off) => {
      if (el.classList.contains('active'))
        return { off: offsetInBlock(el, node, off) };
      const raw = blocks[i] ?? '';
      if (raw.includes('\n')) return null;
      return renderedPointToRaw(el, raw, node, off);
    };
    const pS = endpoint(elS, iS, r0.startContainer, r0.startOffset);
    const pE = endpoint(elE, iE, r0.endContainer, r0.endOffset);
    if (!pS || !pE) return;
    const offS = pS.tok ? pS.tok.start : pS.off;
    const offE = pE.tok ? pE.tok.end   : pE.off;
    if (offS == null || offE == null) return;
    const text = assembleRawCopy(iS, offS, iE, offE);
    if (text == null || text === '') return;
    e.clipboardData.setData('text/plain', text);
    e.preventDefault();
    pushUndo();
    const paperCut = typeof inPaperMode === 'function' && inPaperMode() && !settings.srcmode;
    if (iS === iE){
      const i = iS;
      if (activeIndex === i){                          // 原始碼態:原地切,游標落切點
        blocks[i] = blocks[i].slice(0, offS) + blocks[i].slice(offE);
        const el = editor.children[i];
        el.textContent = blocks[i];
        el.className = activeClassFor(blocks[i]);
        setCaret(el, offS);
      } else {
        deactivate(true);                              // 他塊若在編輯,先正常收攤(序:先收再改)
        blocks[i] = blocks[i].slice(0, offS) + blocks[i].slice(offE);
        rerender(i);
        /* CP126:Paper/TW_THESIS 的版面鐵律是保持渲染態。舊路徑在剪下後呼叫 activate()，
           會改道 openPaperEdit()；移動圖表標題時因此又彈出框，並容易被誤認為內容復活。
           論文模式現在清除失效選取後停在渲染態；普通 Markdown 保留原本直接編輯。 */
        if (paperCut){
          suppressSel++;
          try { getSelection().removeAllRanges(); } catch(_){}
          requestAnimationFrame(() => suppressSel = Math.max(0, suppressSel - 1));
        } else activate(i, offS);
      }
    } else {
      deactivate(true);
      blocks[iS] = blocks[iS].slice(0, offS) + blocks[iE].slice(offE);
      for (let k = iE; k > iS; k--) removeBlockAt(k);
      rerender(iS);
      if (paperCut){
        suppressSel++;
        try { getSelection().removeAllRanges(); } catch(_){}
        requestAnimationFrame(() => suppressSel = Math.max(0, suppressSel - 1));
      } else activate(iS, offS);
    }
    onEdited();
  } catch(_){}
});

/* ---------- CP74:智慧貼上(HTML→Markdown) ----------
   Markdown 的 ⌘V 語意:剪貼簿含 text/html 時把結構(粗/斜/碼/連結/標題/清單/引言/程式碼塊/圖)
   還原成 Markdown;⇧⌘V 走純文字。零依賴字串掃描(不用 DOMParser)— 供 t35 離線抽測。
   v1 文件化限制:不轉 HTML 表格(含 <table> 一律讓位給既有純文字/TSV 路徑,CP50 試算表貼上已優);
   文字不做 Markdown 特殊字元跳脫。 */
function htmlUnescape(s){
  return String(s || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/gi, '&');
}
/* ============ CP82:行內 HTML → Markdown 記號(單一真相源) ============ */
/* 自 htmlToMd 行內段原樣搬出共用:code 先鎖、再粗/斜/刪、連結、圖(迭代替換涵蓋跨標籤巢狀)。
   輸入=HTML 片段;輸出=行內標籤已轉 MD 記號、其餘標籤原樣留給呼叫端處置(htmlToMd 走
   區塊掃描、htmlTableToModel 儲存格路徑走剝除)。CP78「成對功能共用單一真相源」慣例;
   t35 行為釘 htmlToMd 零變化、t43 釘本函式單元與兩呼叫端 wiring。 */
function htmlInlineToMd(s){
  s = String(s == null ? '' : s);
  const rinl = (tag, mark) => {
    const rx = new RegExp('<' + tag + '(?:\\s[^>]*)?>([^]*?)</' + tag + '>', 'gi');
    let prev; do { prev = s; s = s.replace(rx, (m, t) => mark + t.replace(/^\s+|\s+$/g, '') + mark); } while (s !== prev);
  };
  rinl('code', '`');
  rinl('strong', '**'); rinl('b', '**');
  rinl('em', '*'); rinl('i', '*');
  rinl('del', '~~'); rinl('s', '~~'); rinl('strike', '~~');
  s = s.replace(/<a\s[^>]*href=(["'])([^"']*)\1[^>]*>([^]*?)<\/a>/gi,
    (m, q, u, t) => '[' + t.replace(/<[^>]+>/g, '').replace(/^\s+|\s+$/g, '') + '](' + htmlUnescape(u) + ')');
  s = s.replace(/<img\s[^>]*>/gi, m => {
    const sm = m.match(/src=(["'])([^"']*)\1/i), am = m.match(/alt=(["'])([^"']*)\1/i);
    return sm ? '![' + (am ? htmlUnescape(am[2]) : '') + '](' + htmlUnescape(sm[2]) + ')' : '';
  });
  return s;
}
function htmlToMd(html){
  let s = String(html || '');
  if (s.length > 2000000) return '';                       /* 巨量剪貼簿(Word 可達 MB 級)直接讓位純文字 */
  const fs = s.indexOf('<!--StartFragment-->'), fe = s.indexOf('<!--EndFragment-->');
  if (fs >= 0 && fe > fs) s = s.slice(fs + 20, fe);        /* Chrome/Edge 片段標記優先 */
  else { const bm = s.match(/<body[^>]*>([^]*?)<\/body>/i); if (bm) s = bm[1]; }
  s = s.replace(/<!--[^]*?-->/g, '');
  s = s.replace(/<(script|style|title)[^>]*>[^]*?<\/\1>/gi, '');
  /* pre 先擷取保護(內容不得再被行內規則/空白摺疊改寫) */
  const pres = [];
  s = s.replace(/<pre[^>]*>([^]*?)<\/pre>/gi, (m, body) => {
    let code = body.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
    pres.push(htmlUnescape(code).replace(/^\n+|\n+$/g, ''));
    return '\x00P' + (pres.length - 1) + '\x00';
  });
  s = s.replace(/[\r\n\t]+/g, ' ');                        /* HTML 原始換行無語意 */
  /* 行內語法 → 共用 htmlInlineToMd(CP82 原樣搬出;行為零變化,t35 四十四例釘住) */
  s = htmlInlineToMd(s);
  /* 區塊層:標籤流線性掃描 */
  let md = '';
  const lstack = [];
  const brk = () => { md = md.replace(/[ \t]+$/, ''); if (md && !/\n\n$/.test(md)) md += /\n$/.test(md) ? '\n' : '\n\n'; };
  const nl  = () => { md = md.replace(/[ \t]+$/, ''); if (md && !/\n$/.test(md)) md += '\n'; };
  for (const tk of s.split(/(<[^>]+>)/)){
    if (!tk) continue;
    if (tk[0] === '<'){
      const m = tk.match(/^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/);
      if (!m) continue;
      const close = m[1] === '/', tag = m[2].toLowerCase();
      if (tag === 'br'){ if (!close) nl(); continue; }
      if (tag === 'hr'){ if (!close){ brk(); md += '---'; brk(); } continue; }
      if (/^h[1-6]$/.test(tag)){ if (close) brk(); else { brk(); md += '#'.repeat(+tag[1]) + ' '; } continue; }
      if (tag === 'p'){ brk(); continue; }
      if (tag === 'div' || tag === 'section' || tag === 'article'){ nl(); continue; }
      if (tag === 'ul' || tag === 'ol'){
        if (close){ lstack.pop(); if (!lstack.length) brk(); }
        else { if (!lstack.length) brk(); lstack.push({ ord: tag === 'ol', n: 0 }); }
        continue;
      }
      if (tag === 'li'){
        if (!close && lstack.length){ nl(); const top = lstack[lstack.length - 1];
          md += '  '.repeat(lstack.length - 1) + (top.ord ? (++top.n) + '. ' : '- '); }
        continue;
      }
      if (tag === 'blockquote'){ brk(); md += close ? '\x01Q-' : '\x01Q+'; brk(); continue; }
      continue;                                            /* 其餘標籤(span/font/…)丟棄,內容自然流過 */
    }
    let t = htmlUnescape(tk).replace(/ {2,}/g, ' ');
    if ((md === '' || /\n$/.test(md)) && !t.trim()) continue;
    if (/\n$/.test(md)) t = t.replace(/^ +/, '');
    md += t;
  }
  /* blockquote 標記後處理:逐行加 > 前綴(支援巢狀深度) */
  let qd = 0;
  md = md.split('\n').map(line => {
    const l = line.trim();
    if (l === '\x01Q+'){ qd++; return null; }
    if (l === '\x01Q-'){ qd = Math.max(0, qd - 1); return null; }
    return (qd && line.trim()) ? ('> '.repeat(qd) + line).replace(/\s+$/, '') : line;   /* 空行不前綴(標記兩側 brk 產物交尾端整併) */
  }).filter(l => l !== null).join('\n');
  md = md.replace(/\x00P(\d+)\x00/g, (m, i) => '\n\n```\n' + pres[+i] + '\n```\n\n');
  return md.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '').replace(/[ \t]+$/, '');
}

/* ============ CP81:智慧貼上 v2 — HTML 表格 → 表格模型 ============ */
/* 網頁/郵件/Word 複製的表格(text/html 含 <table>、text/plain 非 TSV/CSV)→ 解析首個
   <table> 為 CP49 表格模型 { align, rows },交 buildTableRaw 序列化。零依賴字串掃描
   (不用 DOMParser,同 htmlToMd 先例)— 供 t42 離線抽測。
   讓位規則(回 null=退回既有純文字路徑):非恰一張表(>1 含巢狀)、表外剝標籤後有
   實質文字(剪貼簿不是「一張表」就不整表轉換,避免丟內容)、列<2 或欄<2、>2MB(同 htmlToMd)。
   儲存格=行內格式保留為 MD 記號(CP82 v3:htmlInlineToMd 共用轉換 — 粗/斜/碼/刪/連結/圖),
   其餘標籤剝除、<br>→空白、空白壓單、實體反跳脫;| 字面存模型,
   buildTableRaw 寫出時自跳脫(CP49 保真契約)。colspan 以空儲存格補位(夾 50);
   rowspan 不展開(MD 表格無此語意,短列由欄數補齊吸收)。對齊:首列 align 屬性 / style text-align。
   文件化限制:未閉合 <td>(規格允許、但瀏覽器剪貼簿為 DOM 序列化必閉合)會併吃下一格。 */
function htmlTableToModel(html){
  let s = String(html || '');
  if (s.length > 2000000) return null;
  const fs = s.indexOf('<!--StartFragment-->'), fe = s.indexOf('<!--EndFragment-->');
  if (fs >= 0 && fe > fs) s = s.slice(fs + 20, fe);
  else { const bm = s.match(/<body[^>]*>([^]*?)<\/body>/i); if (bm) s = bm[1]; }
  s = s.replace(/<!--[^]*?-->/g, '').replace(/<(script|style|title)[^>]*>[^]*?<\/\1>/gi, '');
  if ((s.match(/<table[\s>]/gi) || []).length !== 1) return null;
  const tm = s.match(/<table[^>]*>([^]*?)<\/table>/i);
  if (!tm) return null;
  const outside = (s.slice(0, tm.index) + s.slice(tm.index + tm[0].length)).replace(/<[^>]+>/g, '');
  if (htmlUnescape(outside).trim()) return null;
  const rows = [], align = [];
  const trRe = /<tr[^>]*>([^]*?)<\/tr>/gi;
  let trm;
  while ((trm = trRe.exec(tm[1]))){
    const cells = [];
    const cRe = /<(th|td)([^>]*)>([^]*?)<\/\1>/gi;
    let cm;
    while ((cm = cRe.exec(trm[1]))){
      /* CP82 v3:行內格式保留為 MD 記號 — 先 htmlInlineToMd 轉(粗/斜/碼/刪/連結/圖),
         再剝殘標籤(span/p 等包裝)、再實體反跳脫、壓空白;| 字面存模型由 buildTableRaw
         跳脫(契約同 v2)。連結 URL 實體於轉換內已解,外層 unescape 對 & 冪等=文件化邊角。 */
      const t = htmlUnescape(htmlInlineToMd(cm[3].replace(/<br\s*\/?>/gi, ' ')).replace(/<[^>]+>/g, ''))
        .replace(/\s+/g, ' ').trim();
      if (!rows.length){
        const am = cm[2].match(/(?:^|\s)align\s*=\s*["']?(left|center|right)/i)
                || cm[2].match(/text-align\s*:\s*(left|center|right)/i);
        align.push(am ? am[1].toLowerCase() : '');
      }
      cells.push(t);
      const sp = cm[2].match(/(?:^|\s)colspan\s*=\s*["']?(\d+)/i);
      const n = sp ? Math.min(parseInt(sp[1], 10) || 1, 50) : 1;
      for (let k = 1; k < n; k++){ cells.push(''); if (!rows.length) align.push(''); }
    }
    if (cells.length) rows.push(cells);
  }
  if (rows.length < 2) return null;
  const nc = Math.max(...rows.map(r => r.length));
  if (nc < 2) return null;
  const fix = r => { const x = r.slice(0, nc); while (x.length < nc) x.push(''); return x; };
  const al = align.slice(0, nc); while (al.length < nc) al.push('');
  return { align: al, rows: rows.map(fix) };
}
editor.addEventListener('paste', e => {
  e.preventDefault();
  /* 剪貼簿圖片(截圖 / 複製的圖片)→ 存檔並插入連結(CP6) */
  const imgItems = [...((e.clipboardData || {}).items || [])]
    .filter(it => it.kind === 'file' && /^image\//.test(it.type));
  if (imgItems.length && !mathEditEl){
    handleImageFiles(imgItems.map(it => it.getAsFile()).filter(Boolean), '貼上的圖片');
    return;
  }
  const text = (e.clipboardData || window.clipboardData).getData('text/plain');
  if (!text) return;
  if (mathEditEl){                                   // 公式/樣式編輯:貼上壓成單行純文字
    ilArmUndo();                                     /* T8 v1.1:execCommand 未必觸發 beforeinput */
    document.execCommand('insertText', false, text.replace(/\s*\n+\s*/g, ' '));
    if (mathEditInfo && mathEditInfo.isMath) showMathPreview(mathEditEl, mathEditEl.textContent);
    return;
  }
  if (tableEdit){                                    // 表格儲存格:貼上純文字(換行轉空白)
    document.execCommand('insertText', false, text.replace(/\s*\n+\s*/g, ' '));
    syncTableFromDOM();
    onEdited();
    return;
  }
  /* CP74:智慧貼上 — 剪貼簿含 HTML 且轉換有結構增益才採用;
     含 <table> 一律讓位(既有純文字/TSV 表格路徑更優,CP50);公式/表格儲存格分支已在上方早退。 */
  let mdText = null, htmlSheet = null;
  {
    const html = (e.clipboardData || window.clipboardData).getData('text/html');
    if (html && !/<table[\s>]/i.test(html)){
      const conv = htmlToMd(html);
      if (conv && conv !== text) mdText = conv;
    }
    /* CP81:含 <table> → 試 HTML 表解析(採用與否於下方 TSV/CSV 判定後決定 —
       試算表 text/plain 為 TSV,既有 CP50 路徑優先;此為網頁/郵件/Word 表格後備)。 */
    else if (html) htmlSheet = htmlTableToModel(html);
  }
  pushUndo();
  const multi = multiBlockSelection();
  if (multi) deleteMulti(multi);
  else if (!getSelection().isCollapsed) document.execCommand('delete');
  if (activeIndex < 0){
    const el = blockElOf(getSelection().anchorNode);
    if (el) activate(blockIndexOf(el), null); else return;
  }
  const el = editor.children[activeIndex];
  const off = caretOffsetIn(el);
  const src = getRawText(el);
  const bt = blockType(src);
  const isCode = bt === 'code' || bt === 'table' || bt === 'math';
  const ptext = (mdText && !isCode) ? mdText : text;   /* CP74:碼/表/數學塊內永遠純文字 */
  /* CP50:試算表/CSV 貼上 → 轉 Markdown 表格並進入表格編輯(指南 §7.1)。
     僅一般區塊;程式碼/表格/數學內維持原樣。順序:先 deactivate(false) 離開
     原始碼態(不回讀),再改 blocks 補渲染 — 避開 deactivate(true) 的 DOM 回讀時序。 */
  let sheet = (!isCode && text.includes('\n')) ? sheetTextToModel(text) : null;
  if (!sheet && htmlSheet && !isCode) sheet = htmlSheet;   /* CP81:讓位序 TSV → HTML 表 → 純文字 */
  if (sheet){
    const tblRaw = buildTableRaw(sheet);
    const head = src.slice(0, off), tail = src.slice(off);
    const headT = head.trim(), tailT = tail.trim();
    const i = activeIndex;
    deactivate(false);
    let ti;
    if (!headT){ blocks[i] = tblRaw; ti = i; if (tailT) insertBlockAfter(i, tail); }
    else { blocks[i] = head; ti = i + 1; insertBlockAfter(i, tblRaw); if (tailT) insertBlockAfter(ti, tail); }
    rerender(i);
    onEdited();
    enterTableEdit(ti, { r: 0, c: 0 });
    return;
  }
  if (!ptext.includes('\n') || isCode){
    const next = src.slice(0, off) + ptext + src.slice(off);
    blocks[activeIndex] = next; el.textContent = next;
    el.className = activeClassFor(next);
    setCaret(el, off + ptext.length);
  } else {                                     // 多行貼上 → 切成多個區塊
    const head = src.slice(0, off), tail = src.slice(off);
    const parts = splitToBlocks(ptext);
    const i = activeIndex;
    /* CP51:先 deactivate(false) 再寫 blocks。舊序「blocks[i]=… 後 deactivate(true)」
       會被 commit 的 getRawText 以殘留 DOM(仍是整段原文)覆寫 → 首段貼文遺失、
       tail 重複(空段落貼多段則首段消失)。CP32 已在 handleEnter 修過同族,
       此為漏網同型;handleBackspace 合併路徑為正確範例。 */
    deactivate(false);
    blocks[i] = head + parts[0];
    let at = i;
    for (let k = 1; k < parts.length; k++) insertBlockAfter(at++, parts[k]);
    blocks[at] += tail;
    rerender(i); rerender(at);
    activate(at, blocks[at].length - tail.length);
  }
  onEdited();
});

/* ---------- CP75:文件內錨點連結 ----------
   [參見](#研究方法) 點擊跳到對應標題。GitHub slug 近似規則:小寫、標點剝除
   (保留字母/數字/底線/連字號/CJK 等擴展字元)、空白→連字號;重複標題第二個起加 -1、-2…。
   解析走 CP66 大綱機制(olScanHeads 圍欄感知掃描 + olFindHead ord 對位)— 零渲染改動、
   零 DOM id 注入(不汙染 getRawText/複製語意)。純函式供 t36 離線抽測;
   行內 HTML/markdown 符號剝除 regex 字面複製自 olRenderList plain 規則(抽取自足)。 */
function gfmSlug(text){
  return String(text || '')
    .replace(/<\/?[a-zA-Z][^<>]*>/g, '')
    .replace(/[*_`~=$]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\u00c0-\uffff\- ]+/g, '')
    .replace(/ +/g, '-');
}
function anchorFind(heads, slug){
  if (!Array.isArray(heads) || !slug) return -1;
  const seen = {};
  for (let i = 0; i < heads.length; i++){
    const base = gfmSlug(heads[i].t);
    const n = seen[base] || 0;
    seen[base] = n + 1;
    if ((n ? base + '-' + n : base) === slug) return i;
  }
  return -1;
}

/* ---------- CP78:錨點補全 — 純函式(t39 抽取) ----------
   acDetectAnchor(text):游標前綴匹配 ](#token$(token 不含括號/空白,允許空=列全部);
   anchorSlugs(heads):標題 → 去重 slug 正向表,計數規則逐字鏡 anchorFind
   (空 base 同樣累計計數、僅不入候選)→ 往返保證:補全產生的 slug,
   anchorFind 必解回同一標題(CP75 成對)。 */
function acDetectAnchor(text){
  const m = /\]\(#([^()\s]{0,64})$/.exec(text || '');
  if (!m) return null;
  return { start: (text || '').length - m[1].length, token: m[1] };
}
function anchorSlugs(heads){
  const arr = Array.isArray(heads) ? heads : [];
  const seen = {};
  const out = [];
  for (let i = 0; i < arr.length; i++){
    const base = gfmSlug(arr[i].t);
    const n = seen[base] || 0;
    seen[base] = n + 1;
    if (!base) continue;                       /* 純符號標題 slug 為空:不可達,不入候選 */
    out.push({ t: String(arr[i].t || ''), slug: n ? base + '-' + n : base });
  }
  return out;
}

/* ---------- 點擊:連結 / 核取方塊 ---------- */
editor.addEventListener('click', e => {
  const a = e.target.closest('a.md-a');
  if (a && !a.isConnected) return;            // 已進入原始碼編輯(節點被替換)→ 不開啟
  if (a){
    const rawHref = a.getAttribute('href') || '';   /* CP75:a.href 是絕對化網址,錨點須取原始屬性 */
    if (rawHref.charAt(0) === '#'){
      e.preventDefault();
      let slug = rawHref.slice(1);
      if (!slug) return;                            /* href="#" 佔位連結:靜默吞掉 */
      try { slug = decodeURIComponent(slug); } catch(_){}
      const heads = olScanHeads(serialize());
      const k = anchorFind(heads, slug);
      if (k >= 0){
        const i = olFindHead(blocks, heads[k].t, heads[k].ord);   /* CP66 同機制:第 ord 個同名標題精準對位 */
        if (i >= 0){ deactivate(true); editor.children[i].scrollIntoView({ block:'center', behavior:'smooth' }); activate(i, 0); }
      } else toast(TT('找不到目標標題','Heading not found'));
      return;
    }
    if (e.metaKey || e.ctrlKey){ window.open(a.href, '_blank'); }
    e.preventDefault(); return;
  }
  if (e.target.classList.contains('task-check')){
    e.preventDefault();
    const el = blockElOf(e.target); if (!el) return;
    const i = blockIndexOf(el);
    pushUndo();
    blocks[i] = /\[[xX]\]/.test(blocks[i])
      ? blocks[i].replace(/\[[xX]\]/, '[ ]')
      : blocks[i].replace(/\[ \]/, '[x]');
    suppressSel++;
    rerender(i);
    requestAnimationFrame(()=> suppressSel = Math.max(0, suppressSel-1));
    onEdited();
  }
});

/* ---------- 復原 / 重做 ---------- */
function snapshot(){
  return { md: serialize(), i: activeIndex,
           off: activeIndex >= 0 ? caretOffsetIn(editor.children[activeIndex]) : 0 };
}
function pushUndo(){
  undoStack.push(snapshot());
  if (typeof txnMark === 'function') txnMark();     /* CP100b:交易檢查點與快照堆疊平行 */
  if (undoStack.length > 120) undoStack.shift();
  redoStack.length = 0; undoArmed = false;
  if (typeof tbUpdateHistory === 'function') tbUpdateHistory();
  setTimeout(()=> undoArmed = true, 400);
}
function pushUndoSoft(){ if (undoArmed) pushUndo(); }
/* CP41(T4 Undo 效能):區塊級最小差異視窗。共同前綴+共同後綴夾出 [start,
   start+delCount) → ins 的替換窗;完全相同回 null。純函式,可 node 單測。 */
function diffBlocks(a, b){
  let p = 0;
  const na = a.length, nb = b.length, min = Math.min(na, nb);
  while (p < min && a[p] === b[p]) p++;
  let sa = na, sb = nb;
  while (sa > p && sb > p && a[sa-1] === b[sb-1]){ sa--; sb--; }
  if (p === na && p === nb) return null;
  return { start: p, delCount: sa - p, ins: b.slice(p, sb) };
}
function applySnapshot(s){
  /* CP46(T4b):殘留宿主防護 — 快路徑不重掛全文,若 undo 當下開著 plain/token
     編輯 span 或表格逐格編輯,其 contenteditable 宿主 DOM 不會像 mountDoc 那樣
     被自然抹除;先記下區塊索引,拼接後補一次 rerender 歸位(冪等,窗內重複無害)。 */
  const zPlain = (mathEditEl && mathEditInfo) ? mathEditInfo.i : -1;
  const zTable = tableEdit ? tableEdit.i : -1;
  resetEditModes();
  /* CP46(T4b):編輯中(activeIndex≥0)一併納入快路徑 — deactivate(true) 本就做
     「commit(帶 CP36 active-class 防呆)+單塊重渲染+activeIndex=-1+重新分頁」,
     正是進入 CP41 快路徑所需的全部前置;GitHub 模式打字後 ⌘Z 由全文重掛降為
     視窗拼接。論文模式 activeIndex 恆 -1,deactivate 立即返回,零影響。 */
  if (activeIndex >= 0) deactivate(true);
  /* CP41:undo/redo 原本一律 mountDoc 全文重掛 — 2058 區塊論文一次 undo ~2 秒。
     快路徑:diffBlocks 找最小視窗,≤8 塊就窗內拼接(改+重渲染/增/刪),毫秒級完成;
     視窗過大、頭部純插入(insertBlockAfter 無法定位 -1)或任何異常
     → 原路 mountDoc,行為與舊版完全一致。游標/啟用還原與 onEdited 流程不變。 */
  let fast = false;
  if (activeIndex < 0){
    try {
      const nxt = splitToBlocks(s.md);
      const d = diffBlocks(blocks, nxt);
      if (!d) fast = true;
      else if (d.delCount + d.ins.length <= 8 &&
               editor.children.length === blocks.length &&
               !(d.delCount === 0 && d.start === 0)){
        const ov = Math.min(d.delCount, d.ins.length);
        for (let k = 0; k < ov; k++){ blocks[d.start + k] = d.ins[k]; rerender(d.start + k); }
        for (let k = d.delCount - 1; k >= d.ins.length; k--) removeBlockAt(d.start + k);
        for (let k = ov; k < d.ins.length; k++) insertBlockAfter(d.start + k - 1, d.ins[k]);
        fast = true;
      }
    } catch(_){ fast = false; }
  }
  if (fast){
    for (const z of [zPlain, zTable])
      if (z >= 0 && z < blocks.length && editor.children[z]) rerender(z);
  }
  if (!fast) mountDoc(s.md);
  if (s.i >= 0 && s.i < blocks.length) activate(s.i, s.off);
  onEdited(true);
  if (typeof tbUpdateHistory === 'function') tbUpdateHistory();
}
function cmdUndo(){
  /* 1.1.7.4：歷史擁有者由「模式」決定，不由瞬間 focus 決定。原始碼模式
     的輸入歷史屬於原生 textarea；即使使用者剛點過 PDF、側欄或選單，
     復原仍須回到 srcview，而不是誤查一般 Markdown 的 undoStack。 */
  if (settings.srcmode && typeof srcRunNativeHistory === 'function'){
    srcRunNativeHistory('undo'); return;
  }
  if (!undoStack.length){ toast('沒有可復原的步驟'); return; }
  redoStack.push(snapshot());
  const snapU = undoStack.pop();
  if (!(typeof txnPerformUndo === 'function' && txnPerformUndo(snapU))){
    applySnapshot(snapU);                        /* CP100b:交易路徑不可用 → 快照 fallback */
    if (typeof txnOnSnapshotFallback === 'function') txnOnSnapshotFallback();
  }
  if (typeof tbUpdateHistory === 'function') tbUpdateHistory();
}
function cmdRedo(){
  if (settings.srcmode && typeof srcRunNativeHistory === 'function'){
    srcRunNativeHistory('redo'); return;
  }
  if (!redoStack.length){ toast('沒有可重做的步驟'); return; }
  undoStack.push(snapshot());
  const snapR = redoStack.pop();
  if (!(typeof txnPerformRedo === 'function' && txnPerformRedo(snapR))){
    applySnapshot(snapR);
    if (typeof txnOnSnapshotFallback === 'function') txnOnSnapshotFallback();
  }
  if (typeof tbUpdateHistory === 'function') tbUpdateHistory();
}

/* ============================================================
   CP53(T14)— AutoComplete v1:數學指令/圍欄語言/emoji 補全
   潔淨室使用既有 AutoComplete 模組的行為決策:
   ・狀態機 {type, token, all, match, index} + 前綴過濾(大小寫不敏感、排序、
     唯一命中且=token 時視為無建議 — 防止面板黏著已完成的字)
   ・鍵盤導航:↓ 自 -1 起步、↑ 於 -1 不接手、PageUp/Down ±5、Home/End、
     Enter 僅在有高亮時套用(index<0 → 收面板並放行原生 Enter)、Esc 收面板
   ・顯隱時機:mousedown 面板外即收、捲動即收、每次輸入重評估
   實作為我們自己的三態(mathEdit 行內編輯/active 原始碼塊/plain 段落)。
   ============================================================ */
const MATH_COMMANDS = ['\\alpha','\\beta','\\gamma','\\delta','\\epsilon','\\varepsilon','\\zeta','\\eta','\\theta','\\vartheta','\\iota','\\kappa','\\lambda','\\mu','\\nu','\\xi','\\pi','\\varpi','\\rho','\\varrho','\\sigma','\\varsigma','\\tau','\\upsilon','\\phi','\\varphi','\\chi','\\psi','\\omega','\\Gamma','\\Delta','\\Theta','\\Lambda','\\Xi','\\Pi','\\Sigma','\\Upsilon','\\Phi','\\Psi','\\Omega','\\frac','\\dfrac','\\tfrac','\\cfrac','\\binom','\\dbinom','\\tbinom','\\sqrt','\\sum','\\prod','\\coprod','\\int','\\iint','\\iiint','\\oint','\\lim','\\limsup','\\liminf','\\max','\\min','\\sup','\\inf','\\log','\\ln','\\lg','\\exp','\\sin','\\cos','\\tan','\\cot','\\sec','\\csc','\\arcsin','\\arccos','\\arctan','\\sinh','\\cosh','\\tanh','\\coth','\\det','\\dim','\\ker','\\deg','\\gcd','\\Pr','\\arg','\\hom','\\mathbb','\\mathbf','\\mathcal','\\mathfrak','\\mathit','\\mathrm','\\mathsf','\\mathtt','\\mathscr','\\boldsymbol','\\bm','\\text','\\textbf','\\textit','\\operatorname','\\hat','\\widehat','\\bar','\\overline','\\underline','\\vec','\\dot','\\ddot','\\tilde','\\widetilde','\\breve','\\check','\\acute','\\grave','\\mathring','\\overbrace','\\underbrace','\\overrightarrow','\\overleftarrow','\\overset','\\underset','\\stackrel','\\substack','\\to','\\gets','\\rightarrow','\\leftarrow','\\Rightarrow','\\Leftarrow','\\leftrightarrow','\\Leftrightarrow','\\longrightarrow','\\longleftarrow','\\Longrightarrow','\\Longleftarrow','\\mapsto','\\longmapsto','\\implies','\\impliedby','\\iff','\\uparrow','\\downarrow','\\Uparrow','\\Downarrow','\\updownarrow','\\nearrow','\\searrow','\\swarrow','\\nwarrow','\\hookrightarrow','\\hookleftarrow','\\rightharpoonup','\\rightleftharpoons','\\xrightarrow','\\xleftarrow','\\le','\\leq','\\leqslant','\\ge','\\geq','\\geqslant','\\ne','\\neq','\\approx','\\equiv','\\sim','\\simeq','\\cong','\\propto','\\prec','\\succ','\\preceq','\\succeq','\\ll','\\gg','\\subset','\\supset','\\subseteq','\\supseteq','\\subsetneq','\\supsetneq','\\in','\\ni','\\notin','\\mid','\\nmid','\\parallel','\\perp','\\asymp','\\doteq','\\pm','\\mp','\\times','\\div','\\cdot','\\ast','\\star','\\circ','\\bullet','\\cap','\\cup','\\sqcap','\\sqcup','\\vee','\\wedge','\\land','\\lor','\\lnot','\\neg','\\setminus','\\oplus','\\ominus','\\otimes','\\oslash','\\odot','\\dagger','\\ddagger','\\bigcap','\\bigcup','\\bigoplus','\\bigotimes','\\bigodot','\\biguplus','\\bigsqcup','\\bigvee','\\bigwedge','\\left','\\right','\\middle','\\big','\\Big','\\bigg','\\Bigg','\\langle','\\rangle','\\lceil','\\rceil','\\lfloor','\\rfloor','\\lbrace','\\rbrace','\\lvert','\\rvert','\\lVert','\\rVert','\\vert','\\Vert','\\backslash','\\infty','\\partial','\\nabla','\\forall','\\exists','\\nexists','\\emptyset','\\varnothing','\\aleph','\\hbar','\\imath','\\jmath','\\ell','\\wp','\\Re','\\Im','\\angle','\\triangle','\\square','\\top','\\bot','\\therefore','\\because','\\dots','\\cdots','\\ldots','\\vdots','\\ddots','\\prime','\\degree','\\quad','\\qquad','\\hspace','\\phantom','\\vphantom','\\hphantom','\\pmod','\\bmod','\\mod','\\not','\\cancel','\\bcancel','\\boxed','\\textcolor','\\color','\\tag','\\label','\\displaystyle','\\textstyle','\\scriptstyle','\\scriptscriptstyle','\\limits','\\nolimits','\\mathop','\\atop','\\choose','\\begin','\\end','\\\\'];
const FENCE_LANGS = ['python','javascript','typescript','java','c','cpp','csharp','go','rust','swift','kotlin','scala','php','sql','mysql','bash','shell','sh','zsh','console','makefile','json','yaml','toml','html','css','scss','xml','latex','tex','markdown','text','r','matlab','julia','ruby','perl','diff','dockerfile'];
const EMOJI_SET = [['smile','😄'],['smiley','😃'],['grin','😁'],['joy','😂'],['laughing','😆'],['wink','😉'],['blush','😊'],['heart_eyes','😍'],['thinking','🤔'],['neutral_face','😐'],['sweat_smile','😅'],['cry','😢'],['sob','😭'],['angry','😠'],['scream','😱'],['sleeping','😴'],['sunglasses','😎'],['smirk','😏'],['confused','😕'],['grimacing','😬'],['heart','❤️'],['broken_heart','💔'],['star','⭐'],['sparkles','✨'],['fire','🔥'],['zap','⚡'],['boom','💥'],['tada','🎉'],['confetti_ball','🎊'],['rocket','🚀'],['airplane','✈️'],['thumbsup','👍'],['thumbsdown','👎'],['ok_hand','👌'],['clap','👏'],['wave','👋'],['pray','🙏'],['muscle','💪'],['point_right','👉'],['point_left','👈'],['eyes','👀'],['brain','🧠'],['bulb','💡'],['book','📖'],['books','📚'],['memo','📝'],['pencil','✏️'],['clipboard','📋'],['calendar','📅'],['clock','🕐'],['hourglass','⏳'],['chart_with_upwards_trend','📈'],['chart_with_downwards_trend','📉'],['bar_chart','📊'],['bug','🐛'],['wrench','🔧'],['hammer','🔨'],['gear','⚙️'],['lock','🔒'],['unlock','🔓'],['key','🔑'],['mag','🔍'],['link','🔗'],['paperclip','📎'],['pushpin','📌'],['bell','🔔'],['mega','📣'],['envelope','✉️'],['email','📧'],['package','📦'],['file_folder','📁'],['open_file_folder','📂'],['floppy_disk','💾'],['computer','💻'],['keyboard','⌨️'],['printer','🖨️'],['phone','📱'],['camera','📷'],['check','✔️'],['white_check_mark','✅'],['x','❌'],['heavy_exclamation_mark','❗'],['question','❓'],['warning','⚠️'],['no_entry','⛔'],['recycle','♻️'],['arrow_right','➡️'],['arrow_left','⬅️'],['arrow_up','⬆️'],['arrow_down','⬇️'],['arrows_counterclockwise','🔄'],['100','💯'],['coffee','☕'],['pizza','🍕'],['beer','🍺'],['cake','🍰'],['apple','🍎'],['sun','☀️'],['moon','🌙'],['cloud','☁️'],['rain_cloud','🌧️'],['snowflake','❄️'],['rainbow','🌈'],['earth_asia','🌏'],['dog','🐶'],['cat','🐱'],['panda_face','🐼'],['penguin','🐧'],['turtle','🐢'],['flag_tw','🇹🇼'],['crown','👑'],['gift','🎁'],['trophy','🏆'],['medal','🏅'],['dart','🎯'],['game_die','🎲'],['musical_note','🎵'],['art','🎨'],['scissors','✂️'],['bookmark','🔖'],['money_bag','💰'],['dollar','💵'],['gem','💎'],['hourglass_flowing_sand','⏳'],['stopwatch','⏱️'],['alarm_clock','⏰'],['house','🏠'],['school','🏫'],['hospital','🏥'],['car','🚗'],['bike','🚲'],['train','🚆'],['ship','🚢'],['anchor','⚓'],['seedling','🌱'],['herb','🌿'],['four_leaf_clover','🍀'],['rose','🌹'],['sunflower','🌻']];
/* --- 純函式核心(離線可測;行式抽取慣例) --- */
function acFilter(all, token){
  const t = String(token || '').toLowerCase();
  const out = [];
  all.forEach(function(item){
    const key = (Array.isArray(item) ? item[0] : item).toLowerCase();
    if (key.indexOf(t) === 0) out.push(item);
  });
  out.sort(function(a, b){
    const ka = (Array.isArray(a) ? a[0] : a).toLowerCase();
    const kb = (Array.isArray(b) ? b[0] : b).toLowerCase();
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  if (out.length === 1){
    const only = Array.isArray(out[0]) ? out[0][0] : out[0];
    if (only.toLowerCase() === t) return [];
  }
  return out;
}
/* ===== CP56:AutoComplete v2 —— fuzzy 過濾 + 最近使用排序(T14 增補) =====
   acFilter(前綴制)原樣保留;面板呼叫改走 acRank。
   acFuzzyScore 評分:前綴 0(最佳)→ 內含 100+起始位 → 子序列 200+間隙總和;null=不匹配。
   acRank 排序:最近使用(MRU index 小=更近=更前)→ 分數 → 字典序;
   沿用 acFilter 規則:唯一命中且與 token 全等 → 回空(不彈只剩自己的面板)。
   MRU:settings.acRecent = { math/fence/emoji: [key…] } 各上限 8 筆,
   acApply 成功套用時 acRemember 記錄並 persist(),重開檔案仍記得。
   acFuzzyScore / acRank / acRecall 為純函式(行首宣告、} 獨行收尾,t17 離線抽測)。 */
function acFuzzyScore(key, token){
  const k = String(key == null ? '' : key).toLowerCase();
  const t = String(token == null ? '' : token).toLowerCase();
  if (!t) return 0;
  if (k.indexOf(t) === 0) return 0;
  const at = k.indexOf(t);
  if (at > 0) return 100 + at;
  let i = 0, gaps = 0, last = -1;
  for (let j = 0; j < k.length && i < t.length; j++){
    if (k[j] !== t[i]) continue;
    gaps += (last < 0 ? j : j - last - 1);
    last = j; i++;
  }
  if (i < t.length) return null;
  return 200 + gaps;
}
function acRank(all, token, recent){
  const rec = recent || [];
  const scored = [];
  all.forEach(function(item){
    const key = Array.isArray(item) ? item[0] : item;
    const sc = acFuzzyScore(key, token);
    if (sc === null) return;
    const ri = rec.indexOf(key);
    scored.push({ item: item, key: String(key).toLowerCase(), sc: sc, ri: ri < 0 ? 1e9 : ri });
  });
  scored.sort(function(a, b){
    if (a.ri !== b.ri) return a.ri - b.ri;
    if (a.sc !== b.sc) return a.sc - b.sc;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  const out = scored.map(function(x){ return x.item; });
  if (out.length === 1){
    const only = Array.isArray(out[0]) ? out[0][0] : out[0];
    if (only.toLowerCase() === String(token == null ? '' : token).toLowerCase()) return [];
  }
  return out;
}
function acRecall(list, key, cap){
  const c = cap == null ? 8 : cap;
  const out = [key];
  (list || []).forEach(function(k){ if (k !== key && out.length < c) out.push(k); });
  return out;
}
function acRecentList(type){
  return (settings.acRecent && settings.acRecent[type]) || [];
}
function acRemember(type, key){
  if (!settings.acRecent) settings.acRecent = { math: [], fence: [], emoji: [] };
  settings.acRecent[type] = acRecall(settings.acRecent[type] || [], key, 8);
  persist();
}
function acDetectMathCmd(text){
  const m = /\\([a-zA-Z]*)$/.exec(text || '');
  if (!m) return null;
  if (m.index > 0 && text[m.index - 1] === String.fromCharCode(92) && m[1] === '') return null;
  return { start: m.index, token: String.fromCharCode(92) + m[1] };
}
function acInlineMathOpen(text){
  let open = false, i = 0;
  const s = String(text || '');
  while (i < s.length){
    const c = s[i];
    if (c === String.fromCharCode(92)){ i += 2; continue; }
    if (c === '$'){
      if (s[i + 1] === '$'){ i += 2; continue; }
      open = !open; i++; continue;
    }
    if (c === String.fromCharCode(10)){ open = false; i++; continue; }
    i++;
  }
  return open;
}
function acDetectFenceLang(raw, caret){
  const s = String(raw || '');
  const nl = s.indexOf(String.fromCharCode(10));
  const line0end = nl < 0 ? s.length : nl;
  if (caret > line0end) return null;
  const m = /^(\s*)(```+|~~~+)/.exec(s.slice(0, line0end));
  if (!m) return null;
  const start = m[1].length + m[2].length;
  if (caret < start) return null;
  let end = caret;
  while (end < line0end && /[\w#+.-]/.test(s[end])) end++;
  const token = s.slice(start, caret);
  if (/[^\w#+.-]/.test(token)) return null;
  return { start: start, end: end, token: token };
}
function acDetectEmoji(text){
  const m = /(?:^|[^\w:]):([a-zA-Z0-9_+-]{1,24})$/.exec(text || '');
  if (!m) return null;
  const start = (text || '').length - m[1].length - 1;
  return { start: start, token: m[1] };
}
function acKeyNav(index, len, key){
  if (!len) return null;
  if (key === 'ArrowDown') return { index: index < 0 ? 0 : Math.min(index + 1, len - 1) };
  if (key === 'ArrowUp'){
    if (index < 0) return null;
    return { index: Math.max(index - 1, 0) };
  }
  if (key === 'PageDown') return { index: index < 0 ? 0 : Math.min(index + 5, len - 1) };
  if (key === 'PageUp'){
    if (index < 0) return null;
    return { index: Math.max(index - 5, 0) };
  }
  if (key === 'End') return { index: len - 1 };
  if (key === 'Home'){
    if (index < 0) return null;
    return { index: 0 };
  }
  if (key === 'Enter') return index >= 0 ? 'apply' : 'hide-pass';
  if (key === 'Escape') return 'hide';
  if (key === 'ArrowLeft' || key === 'ArrowRight') return 'hide-pass';
  return null;
}
/* --- 面板與狀態(DOM 層) --- */
const tsPanel = $('#ty-suggest');
let acState = null;   // {type, match, index, ctx:{kind, i?, start, end}}
function acVisible(){ return acState !== null; }
function acHide(){
  if (!acState) return;
  acState = null;
  tsPanel.classList.add('ts-hidden');
}
function acItemLabel(item, type){
  if (type === 'anchor' && Array.isArray(item))   /* CP78:標題文 + slug 註記(插入值=item[1] 由 acApply 原路吃) */
    return escapeHtml(item[0]) + '<span class="ts-slug">#' + escapeHtml(item[2]) + '</span>';
  if (!Array.isArray(item)) return escapeHtml(item);
  return '<span class="ts-emo">' + item[1] + '</span>:' + escapeHtml(item[0]) + ':';
}
function acRender(){
  if (!acState || !acState.match.length){ acHide(); return; }
  const st = acState;
  tsPanel.firstElementChild.innerHTML = st.match.map(function(item, k){
    return '<li class="' + (k === st.index ? 'active' : '') + '" data-k="' + k + '">' + acItemLabel(item, st.type) + '</li>';
  }).join('');
  tsPanel.classList.remove('ts-hidden');
  const li0 = tsPanel.querySelector('li');
  if (li0) tsPanel.style.maxHeight = (li0.offsetHeight * 6 + 10) + 'px';
  const act = tsPanel.querySelector('li.active');
  if (act){
    const top = act.offsetTop, h = act.offsetHeight, view = tsPanel.clientHeight, sc = tsPanel.scrollTop;
    if (top < sc) tsPanel.scrollTop = top;
    else if (top + h > sc + view) tsPanel.scrollTop = top + h - view;
  }
}
function acPosition(){
  const sel = getSelection();
  if (!sel.rangeCount) return;
  const r = sel.getRangeAt(0).cloneRange();
  let rect = r.getClientRects()[0] || r.getBoundingClientRect();
  if (!rect || (!rect.width && !rect.height && !rect.top)){
    const host = mathEditEl || (activeIndex >= 0 ? editor.children[activeIndex] : null);
    if (!host) return;
    rect = host.getBoundingClientRect();
  }
  let left = rect.left - 12;
  if (left + 240 > innerWidth) left = innerWidth - 240;
  tsPanel.style.left = Math.max(6, left) + 'px';
  tsPanel.style.top = Math.min(rect.bottom + 4, innerHeight - 40) + 'px';
}
function acShow(type, match, ctx){
  const keepIndex = acState && acState.type === type ? Math.min(acState.index, 0) : -1;
  acState = { type: type, match: match, index: Math.min(keepIndex, match.length - 1), ctx: ctx };
  acRender();
  if (acState) acPosition();
}
function acContextText(){
  /* 回傳 {host, text, caret, kind, i}:host=正在打字的元素;text=其 raw 全文;caret=raw 位移 */
  if (mathEditEl && mathEditInfo)
    return { host: mathEditEl, text: structuredLocalText(mathEditEl, mathEditInfo), caret: structuredLocalCaret(mathEditEl, mathEditInfo),
             kind: mathEditInfo.isMath ? 'mathEl' : 'plainEl', i: mathEditInfo.i };
  if (activeIndex >= 0 && editor.children[activeIndex] && editor.children[activeIndex].classList.contains('active'))
    return { host: editor.children[activeIndex], text: blocks[activeIndex] ?? '',
             caret: caretOffsetIn(editor.children[activeIndex]), kind: 'block', i: activeIndex };
  return null;
}
function acOnInput(){
  const c = acContextText();
  if (!c){ acHide(); return; }
  const before = c.text.slice(0, c.caret);
  /* a) 數學指令:mathEdit(isMath)、math 區塊、或段落內未閉合 $…$ */
  let inMath = false;
  if (c.kind === 'mathEl') inMath = true;
  else if (c.kind === 'block'){
    const t = blockType(c.text);
    if (t === 'math') inMath = true;
    else if (t !== 'code' && acInlineMathOpen(before)) inMath = true;
  }
  if (inMath){
    const d = acDetectMathCmd(before);
    if (d){
      const match = acRank(MATH_COMMANDS, d.token, acRecentList('math'));
      if (match.length){ acShow('math', match, { kind: c.kind, i: c.i, start: d.start, end: c.caret }); return; }
    }
  }
  /* b) 圍欄語言:code 區塊第一行,或尚未成塊的單行 ```/~~~ 起頭段落 */
  const fenceish = c.kind === 'block' && (blockType(c.text) === 'code' || /^\s*(```|~~~)/.test(c.text));
  if (fenceish){
    const d = acDetectFenceLang(c.text, c.caret);
    if (d){
      const match = acRank(FENCE_LANGS, d.token, acRecentList('fence'));
      if (match.length){ acShow('fence', match, { kind: c.kind, i: c.i, start: d.start, end: d.end }); return; }
    }
  }
  /* c) emoji ::name(數學/程式碼情境不觸發) */
  if (!inMath && !fenceish){
    const d = acDetectEmoji(before);
    if (d){
      const match = acRank(EMOJI_SET, d.token, acRecentList('emoji'));
      if (match.length){ acShow('emoji', match, { kind: c.kind, i: c.i, start: d.start, end: c.caret }); return; }
    }
  }
  /* d) CP78:文件內錨點 ](#…(kind=塊/純文字段;數學、圍欄/程式碼不觸發)。
     候選=[標題純文字, slug+右括號, slug]:acRank 以 [0] 計分(打眼睛看到的字)、
     acApply 插 [1](游標後已有 ) 則不補)、標籤以 [2] 註記;MRU 記 [0](既有路徑零觸碰)。 */
  if (!inMath && !fenceish){
    const d = acDetectAnchor(before);
    if (d){
      const close = c.text.slice(c.caret).charAt(0) === ')' ? '' : ')';
      const cand = anchorSlugs(olScanHeads(serialize())).map(function(a){
        const plain = a.t.replace(/<\/?[a-zA-Z][^<>]*>/g, '').replace(/[*_`~=$]/g, '').trim();
        return [plain || a.slug, a.slug + close, a.slug];
      });
      const match = acRank(cand, d.token, acRecentList('anchor'));
      if (match.length){ acShow('anchor', match, { kind: c.kind, i: c.i, start: d.start, end: c.caret }); return; }
    }
  }
  acHide();
}
function acApply(k){
  if (!acState) return;
  const st = acState, item = st.match[k != null ? k : st.index];
  if (item == null){ acHide(); return; }
  const insert = Array.isArray(item) ? item[1] : item;
  const ctx = st.ctx;
  acRemember(st.type, Array.isArray(item) ? item[0] : item);   /* CP56:記錄最近使用 */
  acHide();
  if (ctx.kind === 'mathEl' || ctx.kind === 'plainEl'){
    if (!mathEditEl) return;
    const t = mathEditEl.textContent;
    mathEditEl.textContent = t.slice(0, ctx.start) + insert + t.slice(ctx.end);
    setCaret(mathEditEl, ctx.start + insert.length);
    if (mathEditInfo && mathEditInfo.isMath) showMathPreview(mathEditEl, mathEditEl.textContent);
    return;
  }
  const i = ctx.i, el = editor.children[i];
  if (!el || !el.classList.contains('active')) return;
  pushUndo();
  const raw = blocks[i] ?? '';
  const next = raw.slice(0, ctx.start) + insert + raw.slice(ctx.end);
  blocks[i] = next;
  suppressSel++;
  el.textContent = next;
  setCaret(el, ctx.start + insert.length);
  requestAnimationFrame(function(){ suppressSel = Math.max(0, suppressSel - 1); });
  onEdited(); updateBlockInfo(); refreshBlockMathPreview(); schedulePaginate();
}
function acHandleKeydown(e){
  if (!acState) return false;
  const r = acKeyNav(acState.index, acState.match.length, e.key);
  if (r === null) return false;
  if (r === 'hide'){ e.preventDefault(); acHide(); return true; }
  if (r === 'hide-pass'){ acHide(); return false; }
  if (r === 'apply'){ e.preventDefault(); acApply(); return true; }
  acState.index = r.index;
  acRender();
  return (e.preventDefault(), true);
}
tsPanel.addEventListener('mousedown', function(e){ e.preventDefault(); e.stopPropagation(); });
tsPanel.addEventListener('click', function(e){
  const li = e.target.closest('li[data-k]');
  if (li){ acApply(+li.dataset.k); e.preventDefault(); e.stopPropagation(); }
});
document.addEventListener('mousedown', function(e){
  if (acVisible() && !tsPanel.contains(e.target)) acHide();
});
document.addEventListener('scroll', function(e){
  if (e.target === tsPanel || (tsPanel.contains && tsPanel.contains(e.target))) return;
  acHide();
}, true);
editor.addEventListener('blur', function(){ acHide(); });
