
/* ============================================================================
 * cp171-60-locate — 國際論文管線 · SyncTeX 解析與雙向定位
 *
 * 這是把「校樣是唯讀的 PDF」變成「可以在上面工作」的關鍵一層。沒有它，
 * 使用者在右側看到一個排版錯誤，必須自己在左邊幾百行 Markdown 裡找對應位置。
 *
 * 三段鏈：
 *
 *     Markdown 行  ←── emit().map ──→  .tex 行  ←── SyncTeX ──→  PDF 頁 + 座標
 *
 * 中間那段（.tex ↔ PDF）由本模組解析 synctex.gz 得到；兩端那段（Markdown ↔ .tex）
 * 由發射器產出的 map 提供。兩段接起來才是使用者要的「點 PDF 跳到 Markdown」。
 *
 * 格式（實測 pdfTeX 產出的 SyncTeX Version:1）：
 *   Input:tag:path          檔案標籤表，主檔通常是 tag 1
 *   Content:                內容段開始
 *   {n / }n                 第 n 頁開始 / 結束
 *   [tag,line:x,y:w,h,d     垂直盒開始（] 結束）
 *   (tag,line:x,y:w,h,d     水平盒開始（) 結束）
 *   h/x/g/k/$/r tag,line:x,y[:w]   葉節點記錄
 *
 * 座標：單位是 sp（scaled point），y 自頁頂向下。
 *   1 bp（PDF point）= 65781.76 sp
 *   記錄的 (x,y) 是盒的左下（基線），h 向上延伸、d 向下延伸。
 * 這兩點是實測驗證過的：主文外框 x=4736286 sp = 72.00 bp = 1 英吋左邊距，
 * y 減去 h 之後同樣落在 72 bp，與 letterpaper 的標準上邊距吻合。
 *
 * 不引入任何外部函式庫：gzip 解壓用瀏覽器原生 DecompressionStream。
 * ========================================================================== */
(() => {
'use strict';
const K = window.__CP171__;
if (!K) { console.error('[CP171] locate: 核心未就緒'); return; }

const SP_PER_BP = 65781.76;
const sp2bp = v => v / SP_PER_BP;

let index = null;      // 最近一次解析結果

/* ---------- 解壓 ---------- */
async function gunzip(bytes){
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // 已是純文字（未壓縮的 .synctex）就直接用
  if (!(u8[0] === 0x1f && u8[1] === 0x8b)) return new TextDecoder().decode(u8);
  if (typeof DecompressionStream !== 'function') {
    throw new Error('此瀏覽器不支援 DecompressionStream，無法解壓 synctex.gz');
  }
  const ds = new DecompressionStream('gzip');
  const stream = new Blob([u8]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new TextDecoder().decode(buf);
}

/* ---------- 解析 ---------- */
const REC_BOX = /^([\[\(])(\d+),(\d+):(-?\d+),(-?\d+):(-?\d+),(-?\d+),(-?\d+)/;
const REC_LEAF = /^([hxgkr$])(\d+),(\d+):(-?\d+),(-?\d+)(?::(-?\d+))?/;

function parseText(text){
  const files = Object.create(null);     // tag -> path
  const pages = Object.create(null);     // pageNo -> [record]
  let page = 0;
  let inContent = false;
  const stack = [];
  let unit = 1, mag = 1000;

  const lines = String(text).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln) continue;

    if (!inContent) {
      if (ln.startsWith('Input:')) {
        const m = ln.match(/^Input:(\d+):(.*)$/);
        if (m) files[m[1]] = m[2];
        continue;
      }
      if (ln.startsWith('Unit:')) { unit = parseFloat(ln.slice(5)) || 1; continue; }
      if (ln.startsWith('Magnification:')) { mag = parseFloat(ln.slice(14)) || 1000; continue; }
      if (ln.startsWith('Content:')) { inContent = true; continue; }
      continue;
    }

    const c = ln[0];

    if (c === '{') { page = parseInt(ln.slice(1), 10) || 0; pages[page] = pages[page] || []; stack.length = 0; continue; }
    if (c === '}') { page = 0; stack.length = 0; continue; }
    if (c === ']' || c === ')') { stack.pop(); continue; }
    if (c === '!' || c === '<' || c === '>') continue;

    const b = REC_BOX.exec(ln);
    if (b) {
      const arr = (pages[page] = pages[page] || []);
      const rec = {
        kind: b[1] === '[' ? 'vbox' : 'hbox',
        tag: b[2], line: parseInt(b[3], 10),
        x: parseInt(b[4], 10), y: parseInt(b[5], 10),
        w: parseInt(b[6], 10), h: parseInt(b[7], 10), d: parseInt(b[8], 10),
        page, depth: stack.length,
        idx: arr.length,
        parent: stack.length ? stack[stack.length - 1].idx : -1
      };
      arr.push(rec);
      stack.push(rec);
      continue;
    }

    const l = REC_LEAF.exec(ln);
    if (l) {
      const arr = (pages[page] = pages[page] || []);
      const rec = {
        kind: l[1], tag: l[2], line: parseInt(l[3], 10),
        x: parseInt(l[4], 10), y: parseInt(l[5], 10),
        w: l[6] !== undefined ? parseInt(l[6], 10) : 0,
        h: 0, d: 0, page, depth: stack.length,
        idx: arr.length,
        parent: stack.length ? stack[stack.length - 1].idx : -1
      };
      arr.push(rec);
      continue;
    }
  }

  // 建立「.tex 行 → 記錄」的正向索引（只收主檔 tag）
  const mainTag = Object.keys(files).find(t => /(^|\/)main\.tex$/.test(files[t]) || /\.tex$/.test(files[t]));
  const byLine = Object.create(null);
  for (const p of Object.keys(pages)) {
    for (const r of pages[p]) {
      if (r.tag !== mainTag) continue;
      (byLine[r.line] = byLine[r.line] || []).push(r);
    }
  }

  const pageCount = Object.keys(pages).filter(p => p !== '0').length;
  return { files, pages, byLine, mainTag, unit, mag, pageCount,
           recordCount: Object.values(pages).reduce((a, b) => a + b.length, 0) };
}

/* ---------- 正向：.tex 行 → PDF 位置 ---------- */
function forward(texLine, opts){
  if (!index) return null;
  opts = opts || {};
  let line = Math.max(1, parseInt(texLine, 10) || 1);

  // 該行沒有記錄時，往後找最近有記錄的行（TeX 常把數行合併成一個盒）
  let hit = index.byLine[line];
  if (!hit) {
    const lines = Object.keys(index.byLine).map(Number).sort((a, b) => a - b);
    const after = lines.find(l => l >= line);
    const before = [...lines].reverse().find(l => l <= line);
    const pick = (after !== undefined && before !== undefined)
      ? (Math.abs(after - line) <= Math.abs(line - before) ? after : before)
      : (after !== undefined ? after : before);
    if (pick === undefined) return null;
    line = pick;
    hit = index.byLine[line];
  }

  // 同一行可能出現在多處（跨頁、雙欄），全部回傳，由呼叫端決定
  return hit.map(r => ({
    page: r.page, exactLine: line,
    xBp: sp2bp(r.x), yBp: sp2bp(r.y),
    wBp: sp2bp(r.w), hBp: sp2bp(r.h), dBp: sp2bp(r.d),
    kind: r.kind
  })).sort((a, b) => a.page - b.page || a.yBp - b.yBp);
}

/* ---------- 反向：PDF 頁 + 座標 → .tex 行 ----------------------------------
   兩段式，與真實 synctex 檢視器同一套邏輯：
     第一段  找出所有「矩形包含該點」的盒，取巢狀最深的那一個（最內層 = 最具體）
     第二段  在該盒的後代記錄裡找離點最近的一個；距離用「垂直加權」度量，
             因為文字是一行一行排的，縱向差一點就是差一整行，橫向差一點還在同一行
   找不到包含點的盒時，退回全頁最近葉節點——不中斷，只是精度降級。          */

function isDescendant(recs, node, ancestorIdx){
  let p = node.parent;
  let guard = 0;
  while (p >= 0 && guard++ < 64) {
    if (p === ancestorIdx) return true;
    p = recs[p] ? recs[p].parent : -1;
  }
  return false;
}

/** 垂直加權距離：縱向差 1 bp 相當於橫向差 4 bp。 */
function weightedDist(r, x, y){
  const dx = (r.x + (r.w > 0 ? Math.min(r.w, Math.max(0, x - r.x)) : 0)) - x;
  const dy = r.y - y;
  return Math.sqrt(dx * dx + (dy * 4) * (dy * 4)) / SP_PER_BP;
}

function reverse(page, xBp, yBp){
  if (!index) return null;
  const recs = index.pages[page];
  if (!recs || !recs.length) return null;

  const x = xBp * SP_PER_BP, y = yBp * SP_PER_BP;

  // 第一段：最內層包含該點的盒
  let box = null;
  for (const r of recs) {
    if (r.kind !== 'vbox' && r.kind !== 'hbox') continue;
    if (r.w <= 0) continue;
    if (x < r.x || x > r.x + r.w) continue;
    if (y < r.y - r.h || y > r.y + r.d) continue;
    if (!box || r.depth > box.depth ||
        (r.depth === box.depth && Math.abs(r.w) * Math.abs(r.h + r.d) < Math.abs(box.w) * Math.abs(box.h + box.d))) {
      box = r;
    }
  }

  // 第二段：在盒的後代（或全頁）裡找最近的記錄，葉節點優先
  const pool = box ? recs.filter(r => r.idx === box.idx || isDescendant(recs, r, box.idx)) : recs;
  const LEAF = /^[hxgkr$]$/;

  let best = null, bestD = Infinity;
  for (const r of pool) {
    if (index.mainTag && r.tag !== index.mainTag) continue;
    const isLeaf = LEAF.test(r.kind);
    let d = weightedDist(r, x, y);
    if (!isLeaf) d += 6;                 // 同樣距離時，葉節點比盒更能代表使用者點到的東西
    if (d < bestD) { bestD = d; best = r; }
  }

  if (!best && box) best = box;
  if (!best) return null;

  return {
    texLine: best.line, page,
    kind: best.kind, score: bestD,
    boxLine: box ? box.line : null,
    file: index.files[best.tag] || 'main.tex'
  };
}

/* ---------- 接上 Markdown ↔ .tex 那一段 ---------- */
/** map 是發射器產出的 [{tex, md}]；tex 行號單調遞增。 */
function texLineToMd(texLine, map){
  if (!map || !map.length) return null;
  let lo = 0, hi = map.length - 1, ans = map[0];
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (map[mid].tex <= texLine) { ans = map[mid]; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans ? ans.md : null;
}
function mdLineToTex(mdLine, map){
  if (!map || !map.length) return null;
  let best = null, bestD = Infinity;
  for (const e of map) {
    const d = Math.abs(e.md - mdLine);
    if (d < bestD || (d === bestD && e.tex < best.tex)) { bestD = d; best = e; }
    if (d === 0) break;
  }
  return best ? best.tex : null;
}

/* ---------- 對外 ---------- */
const api = {
  version: '1.1.0',
  SP_PER_BP, sp2bp,

  /** 載入一份 synctex（Uint8Array，gz 或純文字皆可） */
  load: K.gated('locate.load', async (bytes) => {
    const text = await gunzip(bytes);
    index = parseText(text);
    K.log.info('locate', 'SyncTeX 已解析：' + index.pageCount + ' 頁 / ' +
                          index.recordCount + ' 筆記錄 / 主檔 tag=' + index.mainTag);
    K.emit('locate:loaded', { pages: index.pageCount, records: index.recordCount });
    return { pages: index.pageCount, records: index.recordCount,
             files: Object.keys(index.files).length, mainTag: index.mainTag };
  }),

  /** 自動從協調器最近一次編譯結果取 synctex */
  loadFromLast: K.gated('locate.loadFromLast', async () => {
    const O = K.need('orch'), V = K.need('view');
    const last = (O && O.getLast && O.getLast()) || (V && V.getLast && V.getLast());
    const sx = last && last.compile && last.compile.synctex;
    if (!sx) { K.log.warn('locate', '最近一次編譯沒有 synctex'); return null; }
    return api.load(sx);
  }),

  forward: K.gated('locate.forward', forward),
  reverse: K.gated('locate.reverse', reverse),
  texLineToMd, mdLineToTex,

  /** Markdown 行 → PDF 位置（完整正向鏈） */
  fromMarkdownLine: K.gated('locate.fromMarkdownLine', (mdLine) => {
    const O = K.need('orch'), V = K.need('view');
    const last = (O && O.getLast && O.getLast()) || (V && V.getLast && V.getLast());
    const map = last && last.emit && last.emit.map;
    if (!map) { K.log.warn('locate', '沒有發射器對應表'); return null; }
    const texLine = mdLineToTex(mdLine, map);
    if (texLine == null) return null;
    const hits = forward(texLine);
    return hits ? { mdLine, texLine, hits } : null;
  }),

  /** PDF 頁 + 座標 → Markdown 行（完整反向鏈） */
  toMarkdownLine: K.gated('locate.toMarkdownLine', (page, xBp, yBp) => {
    const r = reverse(page, xBp, yBp);
    if (!r) return null;
    const O = K.need('orch'), V = K.need('view');
    const last = (O && O.getLast && O.getLast()) || (V && V.getLast && V.getLast());
    const map = last && last.emit && last.emit.map;
    const mdLine = map ? texLineToMd(r.texLine, map) : null;
    return Object.assign({}, r, { mdLine });
  }),

  index: () => index,
  stats: () => index ? {
    pages: index.pageCount, records: index.recordCount,
    linesWithRecords: Object.keys(index.byLine).length,
    mainFile: index.files[index.mainTag]
  } : null,

  /* 供 node 測試使用：直接吃純文字 */
  _parseText: parseText,
  _setIndex: (ix) => { index = ix; }
};

K.register('locate', api);
K.log.info('locate', 'CP171 SyncTeX 雙向定位就緒（原生 DecompressionStream，零外部相依）');
})();
