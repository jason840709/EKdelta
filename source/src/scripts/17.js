
/* ============================================================================
 * cp171-10-parser — 國際論文管線 · 獨立 Markdown → AST 解析器
 *
 * 為什麼要有第二套解析器（ADR-0005 路 B，使用者已同意）：
 *   既有解析器（LL_CORE / TXN_CORE）服務編輯畫面，是無損來回轉換導向的；
 *   它的產物形態與「語意樹」不對盤。與其把它扭成語意樹（風險是把規整層長成
 *   一個又醜又脆的第二解析器），不如明確地放一個第二解析器——但**嚴格隔離**：
 *
 *     · 本解析器只吃 canonical Markdown 字串，不讀 DOM、不讀既有解析器狀態
 *     · 產物只餵給 CP171 發射器，永遠不回流到編輯畫面
 *     · 不匯出到 window，只透過 __CP171__.register 登記
 *
 * 隔離代價的對沖（ADR-0005 要求的強制驗收）：
 *   parityDigest() 產出結構摘要（標題序列、清單深度、表格維度、數學區塊數），
 *   可與既有解析器的同名摘要比對。兩套理解一旦分歧，這裡會抓到。
 *
 * 支援語法（以國際論文實際需要為界，不追求 CommonMark 全集）：
 *   YAML frontmatter、ATX/Setext 標題、段落、圍欄與縮排程式碼、區塊引用、
 *   有序/無序/巢狀清單、表格（GFM，含對齊）、水平線、腳註定義與引用、
 *   展示數學（$$…$$ / \[…\]）、行內數學（$…$ / \(…\)）、行內強調/程式碼/
 *   連結/圖片/引用（[@key] 與 \cite{}）、原生 TeX 逃生區塊（```tex ... ```）
 * ========================================================================== */
(() => {
'use strict';
const K = window.__CP171__;
if (!K) { console.error('[CP171] parser: 核心未就緒'); return; }

/* ---------- 工具 ---------- */
const TAB = '    ';
const expandTabs = s => s.replace(/\t/g, TAB);
const rtrim = s => s.replace(/\s+$/, '');

let uid = 0;
const nid = p => p + (++uid);



/* 1.1.7.2：左側圖片工具列在縮放後會把 canonical Markdown 寫成
   <img ... style="zoom:25%;" />。CP171 過去只辨識 ![]()，因此這個合法的
   編輯器產物會掉進普通段落、被當成文字送到 LaTeX。以下純字串解析器不讀 DOM，
   保持 ADR-0005 的隔離，同時把 zoom／width 百分比轉成 0.05–4.00 的比例。 */
function decodeHtmlAttrValue(s){
  return String(s == null ? '' : s)
    .replace(/&quot;/gi, '"').replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&')
    .replace(/&#(\d{1,7});/g, (m, n) => (+n <= 0x10FFFF ? String.fromCodePoint(+n) : m))
    .replace(/&#x([\da-f]{1,6});/gi, (m, h) => {
      const n = parseInt(h, 16); return n <= 0x10FFFF ? String.fromCodePoint(n) : m;
    });
}
function htmlTagAttrs(tag){
  const attrs = Object.create(null);
  const body = String(tag).replace(/^\s*<img\b/i, '').replace(/\/?>\s*$/, '');
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(body))) {
    const key = String(m[1] || '').toLowerCase();
    if (!key) continue;
    attrs[key] = decodeHtmlAttrValue(m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : '')));
  }
  return attrs;
}
function imageScaleFromAttrs(attrs){
  const style = String((attrs && attrs.style) || '');
  let scale = 1, explicit = false;
  let m = style.match(/(?:^|;)\s*zoom\s*:\s*([0-9]*\.?[0-9]+)\s*(%)?/i);
  if (m) {
    const n = parseFloat(m[1]);
    if (Number.isFinite(n) && n > 0) { scale = m[2] ? n / 100 : n; explicit = true; }
  }
  if (!explicit) {
    m = style.match(/(?:^|;)\s*width\s*:\s*([0-9]*\.?[0-9]+)\s*%/i)
      || String((attrs && attrs.width) || '').match(/^\s*([0-9]*\.?[0-9]+)\s*%\s*$/);
    if (m) {
      const n = parseFloat(m[1]);
      if (Number.isFinite(n) && n > 0) { scale = n / 100; explicit = true; }
    }
  }
  if (explicit) scale = Math.max(0.05, Math.min(4, scale));
  return { scale, explicit };
}
function parseHtmlImageTag(raw){
  const tag = String(raw == null ? '' : raw).trim();
  if (!/^<img\b[\s\S]*\/?>$/i.test(tag)) return null;
  const attrs = htmlTagAttrs(tag);
  if (!attrs.src) return null;
  const sc = imageScaleFromAttrs(attrs);
  return {
    src: attrs.src, alt: attrs.alt || '', title: attrs.title || '', id: attrs.id || '',
    scale: sc.scale, scaleExplicit: sc.explicit,
    wide: /\*\s*$/.test(attrs.title || '')
  };
}



/* 1.1.7.3 Markdown→REVTeX parity audit：左側格式工具列會產生 <u> 與 ==，
   智慧貼上亦可能保留 b/em/del/mark/sub/sup/a/code/kbd/br。這些都必須由
   CP171 語意解析器直接接住，不能讓 HTML 字面被 textOut() 轉義後印進 PDF。 */
function readHtmlEntityAt(s, at){
  const m = String(s).slice(at).match(/^&(nbsp|amp|lt|gt|quot|apos|#39|#\d{1,7}|#x[\da-f]{1,6});/i);
  if (!m) return null;
  const raw = m[0], key = m[1].toLowerCase();
  if (key === 'nbsp') return { value:'~', rawTex:true, end:at + raw.length };
  let value = raw;
  if (key === 'amp') value='&'; else if (key === 'lt') value='<'; else if (key === 'gt') value='>';
  else if (key === 'quot') value='"'; else if (key === 'apos' || key === '#39') value="'";
  else if (key.startsWith('#x')) { const n=parseInt(key.slice(2),16); if (n<=0x10FFFF) value=String.fromCodePoint(n); }
  else if (key[0] === '#') { const n=parseInt(key.slice(1),10); if (n<=0x10FFFF) value=String.fromCodePoint(n); }
  return { value, rawTex:false, end:at + raw.length };
}
function matchInlineHtml(s, at){
  const rest = String(s).slice(at);
  const cm = rest.match(/^<!--[\s\S]*?-->/);
  if (cm) return { node:null, end:at + cm[0].length };
  const br = rest.match(/^<br\b[^>]*\/?>/i);
  if (br) return { node:{type:'hard_break'}, end:at + br[0].length };
  const im = rest.match(/^<img\b[^>]*\/?>/i);
  if (im) {
    const spec = parseHtmlImageTag(im[0]);
    if (spec) return { node:{ type:'image', alt:spec.alt, src:spec.src, title:spec.title,
      scale:spec.scale, scaleExplicit:spec.scaleExplicit, wide:spec.wide }, end:at + im[0].length };
  }
  /* CP173 color toolbar emits a deliberately narrow HTML span.  Recognize
     only spans/fonts carrying a CSS color declaration so REVTeX export keeps
     the text content instead of printing literal HTML tags; other unknown
     spans retain the historical literal-HTML behavior. */
  const op = rest.match(/^<(strong|b|em|i|u|ins|del|s|mark|sub|sup|code|kbd|a|span|font)\b([^>]*)>/i);
  if (!op) return null;
  const tag = op[1].toLowerCase();
  /* Match the corresponding closing tag, including nested spans produced by
     applying the color command more than once. */
  const tail = rest.slice(op[0].length);
  const tagRe = new RegExp('<\\/?' + tag + '\\b[^>]*>', 'ig');
  let depth = 1, cm2 = null, hit;
  while ((hit = tagRe.exec(tail))) {
    if (/^<\//.test(hit[0])) { depth--; if (depth === 0) { cm2 = { index: hit.index, length: hit[0].length }; break; } }
    else if (!/\/\s*>$/.test(hit[0])) depth++;
  }
  if (!cm2) return null;
  const inner = tail.slice(0, cm2.index), attrs = op[2] || '';
  let node;
  if ((tag === 'span' || tag === 'font') && !/\b(?:style\s*=\s*["'][^"']*color\s*:|color\s*=\s*["'])/i.test(attrs)) return null;
  if (tag === 'span' || tag === 'font') node={type:'html_color',children:parseInline(inner)};
  else if (tag === 'strong' || tag === 'b') node={type:'strong',children:parseInline(inner)};
  else if (tag === 'em' || tag === 'i') node={type:'emph',children:parseInline(inner)};
  else if (tag === 'u' || tag === 'ins') node={type:'underline',children:parseInline(inner)};
  else if (tag === 'del' || tag === 's') node={type:'strike',children:parseInline(inner)};
  else if (tag === 'mark') node={type:'highlight',children:parseInline(inner)};
  else if (tag === 'sub') node={type:'subscript',children:parseInline(inner)};
  else if (tag === 'sup') node={type:'superscript',children:parseInline(inner)};
  else if (tag === 'code' || tag === 'kbd') node={type:'code_inline',value:decodeHtmlAttrValue(inner.replace(/<[^>]*>/g,''))};
  else if (tag === 'a') {
    const am = htmlTagAttrs('<img ' + attrs + '>');
    node={type:'link',dest:am.href || '',title:am.title || '',children:parseInline(inner)};
  }
  return { node, end:at + op[0].length + cm2.index + cm2.length };
}
function splitLinkDestination(inner){
  const x = String(inner == null ? '' : inner).trim();
  if (!x) return { dest:'', title:'' };
  if (x[0] === '<') {
    const e = x.indexOf('>');
    if (e > 0) {
      const dest = x.slice(1,e), rest = x.slice(e+1).trim();
      const tm = rest.match(/^(?:"([^"]*)"|'([^']*)'|\(([^()]*)\))$/);
      return { dest, title:tm ? (tm[1] ?? tm[2] ?? tm[3] ?? '') : '' };
    }
  }
  const tm = x.match(/\s+(?:"([^"]*)"|'([^']*)'|\(([^()]*)\))\s*$/);
  if (tm) return { dest:x.slice(0,tm.index).trim(), title:tm[1] ?? tm[2] ?? tm[3] ?? '' };
  return { dest:x, title:'' };
}

/* ---------- 行內解析 ------------------------------------------------------
   產出 inline 節點陣列。數學一律「原樣透傳」——不做任何 Unicode 化，這是
   90/01 症狀三與風險 R-07 的鐵律在解析層的落實。                          */
function parseInline(text){
  const out = [];
  let buf = '';
  const flush = () => { if (buf) { out.push({ type: 'text', value: buf }); buf = ''; } };
  let i = 0;
  const n = text.length;

  while (i < n) {
    const c = text[i];

    // 常見行內 HTML（含縮放圖片）與純 HTML 註解
    if (c === '<') {
      const hm = matchInlineHtml(text, i);
      if (hm) { flush(); if (hm.node) out.push(hm.node); i = hm.end; continue; }
    }

    // HTML entity：在送往 TeX escape 前先還原語意；&nbsp; 直接映成不換行空白。
    if (c === '&') {
      const en = readHtmlEntityAt(text, i);
      if (en) { flush(); out.push(en.rawTex ? {type:'raw_inline',tex:en.value} : {type:'text',value:en.value}); i=en.end; continue; }
    }

    // Markdown hard break：行尾兩個空白或反斜線後換行。
    if (c === ' ' && text[i + 1] === ' ' && text[i + 2] === '\n') {
      flush(); out.push({type:'hard_break'}); i += 3; continue;
    }
    if (c === '\\' && text[i + 1] === '\n') {
      flush(); out.push({type:'hard_break'}); i += 2; continue;
    }


    // 反斜線＋空白：TeX 的控制空格。學術寫作裡 "Ref.\ 12" 是常見寫法，
    // 用來避免 TeX 把句點當句末而放寬間距。原樣傳過去。
    if (c === '\\' && (text[i + 1] === ' ' || text[i + 1] === '\t')) {
      flush(); out.push({ type: 'raw_inline', tex: '\\ ' }); i += 2; continue;
    }
    // 轉義
    /* ★ 清單必須涵蓋所有 CommonMark 認定的可跳脫標點。先前漏了 %、&、
       ^、"、'、,、/、:、;、=、? 等，其中 % 和 & 影響最大：使用者寫
       "50\%" 想表達字面的百分號，解析器沒認出這是跳脫、把反斜線當成
       普通字元留下來，發射器再把它轉義成 \textbackslash{}\%，PDF 上
       印出 "50\%"（多一個反斜線）。實測確認過這個輸出錯誤。 */
    if (c === '\\' && i + 1 < n && '\\`*_{}[]()#+-.!$<>|~%&^"\'’,/:;=?@'.includes(text[i + 1])) {
      buf += text[i + 1]; i += 2; continue;
    }

    // 行內數學 \( ... \)
    if (c === '\\' && text[i + 1] === '(') {
      const e = text.indexOf('\\)', i + 2);
      if (e > 0) { flush(); out.push({ type: 'math_inline', tex: text.slice(i + 2, e) }); i = e + 2; continue; }
    }

    // 行內數學 $...$（避免 $$ 與貨幣誤判）
    if (c === '$' && text[i + 1] !== '$') {
      let e = i + 1;
      while (e < n) {
        if (text[e] === '\\') { e += 2; continue; }
        if (text[e] === '$') break;
        if (text[e] === '\n') { e = -1; break; }
        e++;
      }
      if (e > 0 && e < n && text[e] === '$') {
        const body = text.slice(i + 1, e);
        // 貨幣防誤判：內容為空、頭尾帶空白、或看起來是「數字＋單位」皆不視為數學
        const looksMath = body.length > 0
          && !/^\s/.test(body) && !/\s$/.test(body)
          && !/^\d[\d,.\s]*$/.test(body);
        if (looksMath) { flush(); out.push({ type: 'math_inline', tex: body }); i = e + 1; continue; }
      }
    }

    // 行內腳註 ^[ ... ]
    if (c === '^' && text[i + 1] === '[') {
      let depth = 1, e = i + 2;
      while (e < n && depth > 0) {
        if (text[e] === '\\') { e += 2; continue; }
        if (text[e] === '[') depth++;
        else if (text[e] === ']') depth--;
        if (depth === 0) break;
        e++;
      }
      if (depth === 0) {
        flush();
        out.push({ type: 'footnote_inline', children: parseInline(text.slice(i + 2, e)) });
        i = e + 1; continue;
      }
    }

    // 行內程式碼
    if (c === '`') {
      let ticks = 0; while (text[i + ticks] === '`') ticks++;
      const fence = '`'.repeat(ticks);
      const e = text.indexOf(fence, i + ticks);
      if (e > 0) { flush(); out.push({ type: 'code_inline', value: text.slice(i + ticks, e) }); i = e + ticks; continue; }
    }

    // 圖片
    if (c === '!' && text[i + 1] === '[') {
      const m = matchLink(text, i + 1);
      if (m) { flush(); out.push({ type: 'image', alt: m.label, src: m.dest, title: m.title, scale: 1, scaleExplicit: false, wide: /\*\s*$/.test(m.title || '') }); i = m.end; continue; }
    }

    // 連結 / 引用 [@key] / 腳註引用 [^id]
    if (c === '[') {
      if (text[i + 1] === '^') {
        const e = text.indexOf(']', i + 2);
        if (e > 0) { flush(); out.push({ type: 'footnote_ref', id: text.slice(i + 2, e) }); i = e + 1; continue; }
      }
      /* 1.1.5.6.1：數字引用 [[1]] / [[1, 2]] / [[1-3]]（沿用 臺灣論文既有慣例）。
         使用者裁示：Markdown 這一層要清爽，複雜的 \cite{長長的鍵} 是背景
         轉 LaTeX 時的事，不該讓寫稿的人去記。舊的 [@key] 完全不受影響，
         同一份稿子裡兩種可以混用。範圍在這裡展開成逐一的鍵，顯示層由
         natbib 自己壓縮回 [1-3]。 */
      const nrm = text.slice(i).match(/^\[\[\s*(\d+(?:\s*[-\u2013\u2014,;]\s*\d+)*)\s*\]\]/);
      if (nrm) {
        flush();
        out.push({ type: 'cite', keys: expandNumericCiteRefs(nrm[1]), numeric: true });
        i += nrm[0].length; continue;
      }
      const cm = text.slice(i).match(/^\[(@[^\]]+)\]/);
      if (cm) {
        const keys = cm[1].split(/[;,]/).map(s => s.trim().replace(/^@/, '')).filter(Boolean);
        flush();
        // pandoc-crossref 慣例：fig: tbl: eq: sec: 等前綴是「交叉引用」而非文獻引用。
        // 全當 \cite 送出去的話，編譯會報 Citation undefined，而且訊息指向一個
        // 根本不存在的文獻鍵，很難查。
        const XREF = /^(fig|figure|tbl|tab|table|eq|eqn|equation|sec|section|lst|listing|thm|theorem|alg|algorithm):/i;
        if (keys.length && keys.every(k => XREF.test(k))) {
          for (const k of keys) out.push({ type: 'ref', id: k, style: /^(eq|eqn|equation):/i.test(k) ? 'eqref' : 'ref' });
        } else {
          out.push({ type: 'cite', keys });
        }
        i += cm[0].length; continue;
      }
      const m = matchLink(text, i);
      if (m) {
        flush();
        out.push({ type: 'link', dest: m.dest, title: m.title, children: parseInline(m.label) });
        i = m.end; continue;
      }
    }

    // \cite{a,b} / \ref{x} / \eqref{x} 直通
    if (c === '\\') {
      const m = text.slice(i).match(/^\\(cite|citep|citet|onlinecite|textcite|ref|eqref|label)\{([^}]*)\}/);
      if (m) {
        flush();
        const kind = m[1], arg = m[2];
        if (kind === 'label') out.push({ type: 'label', id: arg });
        else if (kind === 'ref' || kind === 'eqref') out.push({ type: 'ref', id: arg, style: kind });
        else out.push({ type: 'cite', keys: arg.split(',').map(s => s.trim()).filter(Boolean), macro: kind });
        i += m[0].length; continue;
      }
    }



    // 螢光標記 ==...==（左側工具列的 canonical 寫法）
    if (c === '=' && text[i + 1] === '=') {
      const e = findClose(text, i + 2, '==');
      if (e > 0) { flush(); out.push({ type:'highlight', children:parseInline(text.slice(i + 2, e)) }); i=e + 2; continue; }
    }

    // 強調：** / __ 粗體，* / _ 斜體，~~ 刪除線
    if (c === '*' || c === '_' || c === '~') {
      const two = text.slice(i, i + 2);
      if ((two === '**' || two === '__') ) {
        const e = findClose(text, i + 2, two);
        if (e > 0) { flush(); out.push({ type: 'strong', children: parseInline(text.slice(i + 2, e)) }); i = e + 2; continue; }
      }
      if (two === '~~') {
        const e = findClose(text, i + 2, '~~');
        if (e > 0) { flush(); out.push({ type: 'strike', children: parseInline(text.slice(i + 2, e)) }); i = e + 2; continue; }
      }
      if (c === '*' || c === '_') {
        const e = findClose(text, i + 1, c);
        if (e > 0) { flush(); out.push({ type: 'emph', children: parseInline(text.slice(i + 1, e)) }); i = e + 1; continue; }
      }
    }

    buf += c; i++;
  }
  flush();
  return out;
}

function findClose(s, from, token){
  let i = from;
  while (i < s.length) {
    if (s[i] === '\\') { i += 2; continue; }
    if (s.startsWith(token, i)) return i;
    i++;
  }
  return -1;
}

/** 從 `[` 位置解析 [label](dest "title")，回傳 {label,dest,title,end} */
function matchLink(s, at){
  if (s[at] !== '[') return null;
  let depth = 1, i = at + 1;
  while (i < s.length && depth > 0) {
    if (s[i] === '\\') { i += 2; continue; }
    if (s[i] === '[') depth++;
    else if (s[i] === ']') depth--;
    if (depth === 0) break;
    i++;
  }
  if (depth !== 0) return null;
  const label = s.slice(at + 1, i);
  if (s[i + 1] !== '(') return null;
  let j = i + 2, pd = 1;
  while (j < s.length && pd > 0) {
    if (s[j] === '\\') { j += 2; continue; }
    if (s[j] === '(') pd++;
    else if (s[j] === ')') pd--;
    if (pd === 0) break;
    j++;
  }
  if (pd !== 0) return null;
  const inner = s.slice(i + 2, j).trim();
  const target = splitLinkDestination(inner);
  return { label, dest: target.dest, title: target.title, end: j + 1 };
}

/* ---------- YAML frontmatter ----------------------------------------------
   只實作論文 frontmatter 實際會用到的 YAML 子集，但要實作對：
     key: value              純量
     key:                    巢狀對映或序列（由縮排決定）
       sub: value
     key:                    序列
       - item
       - name: X             序列元素本身是對映
         affil: [0, 1]       行內流式序列
     key: [a, b]             行內流式序列
     key: "quoted"           引號、true/false、數字
   採遞迴下降＋縮排分組，而不是逐行累積——後者處理不了「序列元素是對映」
   這種在作者清單裡必然出現的結構。                                          */

function parseScalar(v){
  v = String(v).trim();
  if (!v) return '';
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  if (v.startsWith('[') && v.endsWith(']')) return splitFlow(v.slice(1, -1)).map(parseScalar);
  if (v.startsWith('{') && v.endsWith('}')) {
    const o = {};
    for (const part of splitFlow(v.slice(1, -1))) {
      const m = part.match(/^([^:]+):\s*(.*)$/);
      if (m) o[m[1].trim()] = parseScalar(m[2]);
    }
    return o;
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

/** 依逗號切開，但不切引號與巢狀括號內的逗號。 */
function splitFlow(s){
  const out = []; let cur = '', depth = 0, q = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === q && s[i - 1] !== '\\') q = ''; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '[' || c === '{') depth++;
    if (c === ']' || c === '}') depth--;
    if (c === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out.map(x => x.trim()).filter(x => x !== '');
}

const indentOf = l => l.match(/^ */)[0].length;

/** 把一段（已去掉共同縮排的）行解析成物件或陣列。 */
function parseYamlBlock(lines){
  const rows = lines.map(expandTabs).filter(l => l.trim() && !/^\s*#/.test(l));
  if (!rows.length) return {};

  const base = Math.min(...rows.map(indentOf));
  const isSeq = rows.some(l => indentOf(l) === base && /^\s*-\s/.test(l));

  // 把同層的每一項連同其下屬行切成一組
  const groups = [];
  for (const row of rows) {
    if (indentOf(row) === base && (isSeq ? /^\s*-\s/.test(row) : true)) groups.push([row]);
    else if (groups.length) groups[groups.length - 1].push(row);
    else groups.push([row]);
  }

  if (isSeq) {
    return groups.map(g => {
      const head = g[0].replace(/^\s*-\s*/, '');
      const rest = g.slice(1);
      // 序列元素是對映：`- name: X` 後面可能還跟著同層的其他鍵
      if (/^[A-Za-z0-9_.\-]+\s*:/.test(head)) {
        const inner = [' '.repeat(base + 2) + head, ...rest];
        return parseYamlBlock(dedent(inner));
      }
      if (!head && rest.length) return parseYamlBlock(dedent(rest));
      return parseScalar(head);
    });
  }

  const obj = {};
  for (const g of groups) {
    const m = g[0].trim().match(/^([A-Za-z0-9_.\-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1], inlineVal = m[2];
    if (inlineVal !== '') { obj[key] = parseScalar(inlineVal); continue; }
    const rest = g.slice(1);
    obj[key] = rest.length ? parseYamlBlock(dedent(rest)) : '';
  }
  return obj;
}

function dedent(lines){
  const rows = lines.filter(l => l.trim());
  if (!rows.length) return lines;
  const m = Math.min(...rows.map(indentOf));
  return lines.map(l => l.slice(m));
}

function parseFrontmatter(lines){
  if (!lines.length || lines[0].trim() !== '---') return { meta: null, rest: lines, endLine: 0 };
  let e = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---' || lines[i].trim() === '...') { e = i; break; }
  }
  if (e < 0) return { meta: null, rest: lines, endLine: 0 };
  let meta = {};
  try { meta = parseYamlBlock(lines.slice(1, e)) || {}; }
  catch (_) { meta = {}; }
  if (Array.isArray(meta)) meta = {};
  return { meta, rest: lines.slice(e + 1), endLine: e + 1 };
}

/* 1.1.7.6：每篇論文的版面設定是文件最前端可見的 fenced block。
   它位於 YAML frontmatter 之前，因此主入口必須先拿掉這一個控制區塊，
   再讓既有 parseFrontmatter() 看見 `---`。只接受完整、位於最前端的
   revtex-settings fence；不完整 fence 保留給一般 block parser，最後仍會由
   absorbNativeRevtexBlocks() fail-safe 吸收，絕不輸出成正文／TeX。 */
const REVTEX_SETTINGS_LANGS = new Set(['revtex-settings','revtex-layout','revtex-document-settings']);
function stripLeadingRevtexSettings(lines){
  const src = Array.isArray(lines) ? lines : [];
  if (!src.length) return { rest:src, endLine:0, stripped:false };
  const first = String(src[0] || '').replace(/^\uFEFF/, '');
  const m = first.match(/^ {0,3}(`{3,}|~{3,})[ \t]*(revtex-settings|revtex-layout|revtex-document-settings)[ \t]*$/i);
  if (!m) return { rest:src, endLine:0, stripped:false };
  const ch=m[1][0], need=m[1].length; let close=-1;
  for (let i=1;i<src.length;i++) {
    const q=String(src[i]||'').match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
    if(q&&q[1][0]===ch&&q[1].length>=need){close=i;break;}
  }
  if(close<0)return { rest:src, endLine:0, stripped:false };
  let next=close+1;
  while(next<src.length&&!String(src[next]||'').trim())next++;
  return { rest:src.slice(next), endLine:next, stripped:true };
}

/* [[1, 3-5]] → ['1','3','4','5']。
   上限防呆：一個範圍最多展開 200 筆，避免 [[1-99999]] 這種打錯的輸入
   把整份 .tex 灌爆（LaTeX 不會報錯，只會編到天荒地老）。 */
function expandNumericCiteRefs(spec){
  const out = [];
  for (const part of String(spec == null ? '' : spec).split(/[,;]/)) {
    const seg = part.trim();
    const r = seg.match(/^(\d+)\s*[-\u2013\u2014]\s*(\d+)$/);
    if (r) {
      let a = parseInt(r[1], 10), b = parseInt(r[2], 10);
      if (b < a) { const t = a; a = b; b = t; }
      if (b - a > 200) b = a + 200;
      for (let n = a; n <= b; n++) out.push(String(n));
    } else if (/^\d+$/.test(seg)) {
      out.push(seg);
    }
  }
  return out.filter((v, idx, arr) => arr.indexOf(v) === idx);
}

/* ---------- 原生 revtex-* fenced block（CP166/CP167 既有文件慣例）----------
 * 內建的「REVTeX 4.2 校正語料庫.md」與使用者既有稿件，用的是 CP167 那一輪
 * 定義的 fence 標籤（```revtex-frontmatter / ```revtex-abstract 等），不是
 * CP171 自己的 ```yaml + ## Abstract 慣例。
 *
 * 這件事的代價非常實際：v1.1.3.3 把 takeoverTex 預設改成 true 之後，這類
 * 文件走到本解析器就變成 ast.meta === {}（frontmatter 完全沒被辨識），
 * 發射器只好輸出 \title{Untitled}\author{Anonymous}，整段 metadata 還會
 * 被當成 code_block 印成 verbatim 灌進正文——使用者看到的就是「本來勉強
 * 能編譯，現在完全不能編譯」。
 *
 * 這裡把原生語法翻譯成本解析器的 meta 結構。格式差異必須逐項處理：
 *   · 原生用「重複鍵」表示多作者（連續多個 author: / affiliation: / email:），
 *     標準 YAML 解析會後蓋前，只留最後一個 → 必須自己依出現順序累積
 *   · affiliation 緊跟在某個 author 之後時屬於該作者；出現在任何 author
 *     之前則視為全體共用
 *   · email / orcid / altaffiliation 一律歸屬於最近一個 author
 */
const REVTEX_FM_LANGS = new Set(['revtex-frontmatter', 'revtex-front-matter']);
const REVTEX_ABSTRACT_LANGS = new Set(['revtex-abstract']);
const REVTEX_ACK_LANGS = new Set(['revtex-acknowledgments', 'revtex-acknowledgements']);
const REVTEX_WIDE_LANGS = new Set(['revtex-wide', 'revtex-widetext']);
const REVTEX_BIB_LANGS = new Set(['revtex-bibliography', 'revtex-bib']);
const REVTEX_SUBEQ_LANGS = new Set(['revtex-subequations', 'revtex-subeq']);
const REVTEX_TURNPAGE_LANGS = new Set(['revtex-turnpage', 'revtex-landscape']);
const REVTEX_LONGTABLE_LANGS = new Set(['revtex-longtable', 'revtex-long-table']);
const REVTEX_APPENDIX_LANGS = new Set(['revtex-appendix', 'revtex-appendices']);

/* ```revtex-bibliography 的格式是每行 "key: 完整書目文字"（沿用 CP167 慣例，
   不是 BibTeX）。轉成 thebibliography/\bibitem 才不會整段被當程式碼印出來，
   而且才能正確斷行——使用者回報「Reference 跑到 PDF 外面」就是因為
   原本走 verbatim，verbatim 不換行，超出頁寬直接被裁掉。 */
/* ```revtex-subequations 內容是連續多個 $$...$$ 展示數學區塊，各自成為
   一條子公式，整體要包進官方 subequations 環境（auguide4-2 第 1000 行
   範例）才會編號成 (1a)(1b)(1c)。這裡只切段抽出每條算式的 LaTeX 本體，
   排版留給發射器（比照數學區塊的三段式寬度判斷）。 */
function parseNativeRevtexSubequations(text){
  const t = String(text == null ? '' : text);
  const parts = [];
  const re = /\$\$([\s\S]*?)\$\$/g;
  let m;
  while ((m = re.exec(t))) {
    const body = m[1].trim();
    if (body) parts.push(body);
  }
  return parts;
}

function parseNativeRevtexBibliography(text){
  const lines = String(text == null ? '' : text).split(/\r?\n/)
    .map(x => x.trim()).filter(Boolean);
  if (!lines.length) return [];

  /* 1.1.5.6.1：書目支援三種寫法。先判斷「整段是哪一種」再逐行解析——
     不能逐行各自判斷，因為續行要跟著前一筆走，而判斷規則會決定
     「沒有編號的那一行」到底是續行還是新的一筆。

       一、編號式（臺灣論文既有慣例，本版新增，建議寫法）
             [1] Martin RM. Electronic structure…
             2. Behler J, …                       ← 「2.」「2)」也算
       二、純清單（本版新增）：一行一筆，依出現順序自動編號
       三、具名鍵（CP167 舊慣例，保留相容）
             martin2004: Martin RM. Electronic structure…

     兩個規則互斥：編號式一定以 [ 或數字開頭，具名鍵一定以英文字母開頭
     且鍵裡不含空白，所以不會互相誤判。 */
  const NUMBERED = /^(?:\[(\d+)\]|(\d+)[.)])\s+(.+)$/;
  const LEGACY   = /^([A-Za-z][A-Za-z0-9_:.\-]*)\s*:\s*(.+)$/;
  let numHits = 0, legacyHits = 0;
  for (const l of lines) { if (NUMBERED.test(l)) numHits++; else if (LEGACY.test(l)) legacyHits++; }
  const half = Math.ceil(lines.length / 2);

  const items = [];
  if (numHits >= legacyHits && numHits >= half) {
    for (const line of lines) {
      const m = line.match(NUMBERED);
      if (m) items.push({ key: m[1] || m[2], text: m[3].trim(), numeric: true });
      else if (items.length) items[items.length - 1].text += ' ' + line;
    }
    /* \cite{3} 印出來的號碼是該筆在 thebibliography 裡的「位置」，不是鍵本身。
       使用者若把 [3] 寫在 [1] 前面，不排序就會讓 [[3]] 指到別筆。 */
    items.sort((a, b) => (parseInt(a.key, 10) || 0) - (parseInt(b.key, 10) || 0));
    return items;
  }
  if (legacyHits >= half) {
    for (const line of lines) {
      const m = line.match(LEGACY);
      if (m) items.push({ key: m[1], text: m[2].trim() });
      else if (items.length) items[items.length - 1].text += ' ' + line;
    }
    return items;
  }
  lines.forEach((line, idx) => items.push({ key: String(idx + 1), text: line, numeric: true }));
  return items;
}

function parseNativeRevtexFrontmatter(text){
  const meta = {};
  const authors = [];
  const sharedAffils = [];
  let cur = null;
  /* 1.1.5.5：單位順序可自訂。
     舊寫法把 affiliation 綁在作者身上，編號順序只能由「第一次出現」決定，
     所以無法表達「Chen Si 屬於第 5 個單位」這種真實論文常見的排法
     （DeepH 復刻時就卡在這裡）。新增兩個欄位：

       affiliations:                 ← 有序清單，順序就是輸出的編號順序
         - State Key Laboratory …
         - Institute for Advanced Study …
       author: Chen Si
       affil: 5                      ← 用索引（1 起算）指到上面那份清單

     兩種寫法可以並存：沒寫 affiliations: 的文件行為完全不變。 */
  let affilOrdered = [];
  let inAffilList = false;

  for (const raw of String(text == null ? '' : text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    /* affiliations: 之下的「- 項目」續行 */
    if (inAffilList) {
      const li = line.match(/^-\s+(.*)$/);
      if (li) { affilOrdered.push(li[1].trim()); continue; }
      inAffilList = false;
    }
    const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'affiliations') {   // 值可以寫在同一行（逗號分隔）或下面的 - 清單
      inAffilList = true;
      if (val) val.split(/\s*;\s*/).forEach(x => { if (x.trim()) affilOrdered.push(x.trim()); });
      continue;
    }
    if (!val && key !== 'bibliography') continue;

    switch (key) {
      case 'author':
        cur = { name: val, affil: [], affilIdx: [], email: '', orcid: '', homepage: '', thanks: '', altaffiliation: '' };
        authors.push(cur);
        break;
      case 'affiliation':
        if (cur) cur.affil.push(val); else sharedAffils.push(val);
        break;
      /* affil: 1,3  → 指到 affiliations: 清單的第 1 與第 3 項（1 起算）。
         超出範圍的索引直接忽略，不讓一個打錯的數字毀掉整份 frontmatter。 */
      case 'affil': case 'affiliation-index': case 'affilnum':
        if (cur) String(val).split(/[\s,]+/).forEach(x => {
          const i = parseInt(x, 10);
          if (i >= 1) cur.affilIdx.push(i - 1);
        });
        break;
      case 'email':        if (cur) cur.email = val; else meta.email = val; break;
      case 'orcid':        if (cur) cur.orcid = val; else meta.orcid = val; break;
      /* homepage 是官方 frontmatter 欄位（auguide4-2 有 \homepage，與 \email
         同級，都屬於「最近一位作者」）。先前完全沒處理，會掉進 default 分支
         變成文件層級的 meta.homepage 而被丟棄——L5 內容探針抓到的第一個問題。*/
      case 'homepage':     if (cur) cur.homepage = val; else meta.homepage = val; break;
      case 'thanks':       if (cur) cur.thanks = val; else meta.thanks = val; break;
      case 'altaffiliation': if (cur) cur.altaffiliation = val; break;
      case 'title':        meta.title = val; break;
      case 'short-title':  meta.shortTitle = val; break;
      case 'preprint':     meta.preprint = val; break;
      case 'collaboration':meta.collaboration = val; break;
      case 'date':         meta.date = val; break;
      case 'keywords':     meta.keywords = val; break;
      case 'pacs':         meta.pacs = val; break;
      case 'bibliography': if (val) meta.bibliography = val; break;
      case 'bibliography-style': meta.bibliographyStyle = val; break;
      default:             if (!(key in meta)) meta[key] = val; break;
    }
  }

  /* 沒有任何 author 明確帶 affiliation 時，共用清單套給全部作者；
     否則共用清單只補給自己沒有 affiliation 的那幾位。 */
  if (sharedAffils.length) {
    for (const a of authors) if (!a.affil.length) a.affil = sharedAffils.slice();
  }

  // 轉成本解析器 meta 慣用的 affiliations + 索引形式
  /* 有 affiliations: 清單時就用它當底，編號順序＝清單順序（這正是自訂順序的作用）；
     沒有的話維持舊行為：依作者第一次提到的先後自動編號。 */
  const affilList = affilOrdered.slice();
  const indexOf = s => {
    const k = affilList.indexOf(s);
    return k >= 0 ? k : (affilList.push(s) - 1);
  };
  meta.authors = authors.map(a => {
    /* affil: 索引與 affiliation: 全名可以混用；索引優先，兩者都寫就合併去重。 */
    const byIdx = a.affilIdx.filter(i => i < affilList.length);
    const byName = a.affil.map(indexOf);
    const merged = [];
    for (const i of byIdx.concat(byName)) if (merged.indexOf(i) < 0) merged.push(i);
    const out = { name: a.name, affil: merged };
    if (a.email) out.email = a.email;
    if (a.orcid) out.orcid = a.orcid;
    if (a.homepage) out.homepage = a.homepage;
    if (a.thanks) out.thanks = a.thanks;
    if (a.altaffiliation) out.altaffiliation = a.altaffiliation;
    return out;
  });
  meta.affiliations = affilList;
  /* 有沒有明寫 affiliations: 清單——發射器要據此判斷是否該提醒
     「REVTeX 的編號是按第一次出現決定的，跟你宣告的順序可能不同」。 */
  if (affilOrdered.length) meta.affiliationsExplicit = affilOrdered.length;
  return meta;
}

/** 掃描已解析的 blocks，把原生 revtex-* fence 提升成 meta / abstract / 語意節點。 */
function absorbNativeRevtexBlocks(meta, blocks, parseInner){
  const keep = [];
  let absorbed = 0;
  for (const b of blocks) {
    if (b.type === 'code_block' && typeof b.lang === 'string') {
      const lang = b.lang.toLowerCase();
      if (REVTEX_SETTINGS_LANGS.has(lang)) {
        /* 文件控制層：無論使用者把區塊移到哪裡，都不得進入 AST 正文。 */
        absorbed++; continue;
      }
      if (REVTEX_FM_LANGS.has(lang)) {
        Object.assign(meta, parseNativeRevtexFrontmatter(b.value));
        absorbed++; continue;
      }
      if (REVTEX_ABSTRACT_LANGS.has(lang)) {
        if (!meta.abstract) meta.abstract = String(b.value || '').trim();
        absorbed++; continue;
      }
      if (REVTEX_ACK_LANGS.has(lang)) {
        /* 保留為 block 而不是吸進 meta：致謝在官方順序裡有固定位置
           （正文末、\appendix 之前、書目之前），吸進 meta 會失去位置
           資訊，發射器也就從來沒輸出過它——corpus 的致謝一直默默消失，
           直到模板改版時肉眼發現。原位輸出讓使用者放哪就在哪。 */
        keep.push({ id: b.id, type: 'acknowledgments', line: b.line,
                    text: String(b.value || '').trim() });
        absorbed++; continue;
      }
      /* ```revtex-wide 的內容本身是 Markdown（表格、$$ 數學、段落），
         必須遞迴用同一套解析器處理，否則整段會被當程式碼原樣印出——
         使用者回報的「表格用 Markdown 方式顯示」「表格字跑到外面」
         「公式跨過雙欄中線」「公式沒有正確渲染」全部源自這裡。 */
      if (REVTEX_WIDE_LANGS.has(lang)) {
        keep.push({ id: b.id, type: 'wide_block', line: b.line,
                    children: parseInner ? parseInner(String(b.value || '')) : [] });
        absorbed++; continue;
      }
      if (REVTEX_BIB_LANGS.has(lang)) {
        keep.push({ id: b.id, type: 'bibliography', line: b.line,
                    items: parseNativeRevtexBibliography(b.value) });
        absorbed++; continue;
      }
      if (REVTEX_SUBEQ_LANGS.has(lang)) {
        keep.push({ id: b.id, type: 'subequations', line: b.line,
                    parts: parseNativeRevtexSubequations(b.value) });
        absorbed++; continue;
      }
      /* ```revtex-turnpage 包住單一 table 或 figure，整頁旋轉 90 度橫置
         （auguide4-2 第 1708-1724 行）。內容遞迴解析，理由同 revtex-wide。
         官方明言「目前沒有跨頁機制」，故只取內容裡第一個 table/figure，
         其餘一律忽略並警告——放兩個浮動體進同一個 turnpage 會產生
         官方都無法處理的結構，寧可明確拒絕也不要產出使用者猜不到後果的
         .tex。 */
      if (REVTEX_TURNPAGE_LANGS.has(lang)) {
        keep.push({ id: b.id, type: 'turnpage_block', line: b.line,
                    children: parseInner ? parseInner(String(b.value || '')) : [] });
        absorbed++; continue;
      }
      /* ```revtex-longtable：內容是一般 Markdown 表格，重用既有表格解析，
         只是輸出時要用官方 longtable 環境（跨頁/跨欄自動延續，每頁重複
         表頭），不是一般 table+ruledtabular。官方明言 longtable* 與
         ruledtabular 不相容（auguide4-2 第 1610 行），所以 long_table
         節點的雙欄跨欄行為由發射器另外處理，不走兩階段量測那套。
         取遞迴解析結果裡第一個 table 節點升級型別，其餘子節點（若有
         說明文字）維持原樣輸出在外層。 */
      if (REVTEX_LONGTABLE_LANGS.has(lang)) {
        const inner = parseInner ? parseInner(String(b.value || '')) : [];
        const tIdx = inner.findIndex(c => c.type === 'table');
        if (tIdx >= 0) inner[tIdx] = Object.assign({}, inner[tIdx], { type: 'long_table' });
        else K.log && K.log.warn && K.log.warn('parser', 'revtex-longtable 區塊內沒有找到表格');
        keep.push({ id: b.id, type: 'longtable_wrap', line: b.line, children: inner });
        absorbed++; continue;
      }
      /* ```revtex-appendix 是空標記，語意是「從這裡開始都是附錄」。 */
      if (REVTEX_APPENDIX_LANGS.has(lang)) {
        keep.push({ id: b.id, type: 'appendix_marker', line: b.line });
        absorbed++; continue;
      }
    }
    keep.push(b);
  }
  return { blocks: keep, absorbed };
}

/* ---------- 區塊解析 ---------- */
function parseBlocks(lines, lineOffset){
  const blocks = [];
  let i = 0;
  const L = lines.length;
  const srcLine = k => lineOffset + k + 1;

  while (i < L) {
    const raw = lines[i];
    let line = expandTabs(raw);
    let t = line.trim();
    let noindent = false;

    if (!t) { i++; continue; }

    /* app metadata 與純 HTML 註解是控制層，不得被 textOut() 印入稿件。
       noindent 是唯一有排版語意的註解：移除標記並記在 paragraph node。 */
    /* Match noindent against the original line, not the already-trimmed `t`.
       Trimming first destroys Markdown's two-trailing-space hard-break marker
       when noindent and a hard break share the same source line. */
    const ni = line.match(/^\s*<!--\s*noindent\s*-->([ \t]*)([\s\S]*)$/i);
    if (ni) {
      noindent = true; line = ni[2] || ''; t = line.trim();
      if (!t) { i++; continue; }
    } else if (/^<!--[\s\S]*?-->\s*$/.test(t)) {
      i++; continue;
    } else if (/^<!--/.test(t)) {
      let j = i;
      while (j < L && !/-->/.test(expandTabs(lines[j]))) j++;
      i = Math.min(L, j + 1); continue;
    }

    // 圍欄程式碼 / 原生 TeX 逃生門
    const fence = t.match(/^(```+|~~~+)\s*([^\s`]*)\s*(.*)$/);
    if (fence) {
      const mark = fence[1][0].repeat(fence[1].length);
      const lang = (fence[2] || '').toLowerCase();
      const body = [];
      let j = i + 1;
      while (j < L && !expandTabs(lines[j]).trim().startsWith(mark)) { body.push(lines[j]); j++; }
      const node = (lang === 'tex' || lang === 'latex')
        ? { type: 'raw_tex', value: body.join('\n'), line: srcLine(i) }
        : { type: 'code_block', lang, value: body.join('\n'), meta: fence[3] || '', line: srcLine(i) };
      node.id = nid('b');
      blocks.push(node);
      i = j + 1; continue;
    }

    // 展示數學 $$ … $$ 或 \[ … \]
    if (t === '$$' || t.startsWith('$$') || t.startsWith('\\[')) {
      const open = t.startsWith('\\[') ? '\\[' : '$$';
      const close = open === '\\[' ? '\\]' : '$$';
      const inner = [];
      let label = '';
      let j = i;

      // 從一行文字上剝掉結尾的 close 與其後的 {#label}，回傳 close 之前的內容；
      // 若該行不是結尾行則回 null。
      const takeClose = (s) => {
        const lm = s.match(/\{#([^}]+)\}\s*$/);
        const body = lm ? s.slice(0, lm.index).trim() : s;
        if (!body.endsWith(close)) return null;
        if (lm) label = lm[1];
        return body.slice(0, body.length - close.length);
      };

      const firstRest = t.slice(open.length);          // 開頭 fence 之後的同行內容
      const oneLine = takeClose(firstRest.trim());
      if (firstRest.trim() && oneLine !== null) {
        inner.push(oneLine);                            // $$ ... $$ 寫在同一行
      } else {
        if (firstRest.trim()) inner.push(firstRest);
        j = i + 1;
        while (j < L) {
          const cur = expandTabs(lines[j]).trim();
          const cut = takeClose(cur);
          if (cut !== null) { if (cut.trim()) inner.push(cut); break; }
          inner.push(lines[j]); j++;
        }
      }

      let tex = inner.join('\n').trim();
      if (!label) {
        const lab = tex.match(/\\label\{([^}]*)\}/);
        if (lab) label = lab[1];
      }
      blocks.push({ id: nid('b'), type: 'math_block', tex, label, line: srcLine(i) });
      i = j + 1; continue;
    }

    // ATX 標題
    const atx = t.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (atx) {
      let text = atx[2];
      /* 不編號章節：沿用 pandoc 慣例，標題結尾寫 {-} 或 {.unnumbered}。
         REVTeX 沒有對應的 class option，官方作法就是 \\section*，
         而 Science Bulletin、Nature 系與多數致謝／附註段落都不編號。 */
      let unnumbered = false;
      const um = text.match(/\s*\{(?:-|\.unnumbered)\}\s*$/);
      if (um) { unnumbered = true; text = text.slice(0, um.index).trimEnd(); }
      const lm = text.match(/\{#([^}]+)\}\s*$/);
      blocks.push({ id: nid('b'), type: 'heading', depth: atx[1].length,
                    children: parseInline(lm ? text.slice(0, lm.index).trim() : text),
                    label: lm ? lm[1] : '', unnumbered: unnumbered, line: srcLine(i) });
      i++; continue;
    }

    // Setext 標題
    if (i + 1 < L) {
      const nx = expandTabs(lines[i + 1]).trim();
      if (/^=+$/.test(nx) && t) { blocks.push({ id: nid('b'), type: 'heading', depth: 1, children: parseInline(t), label: '', line: srcLine(i) }); i += 2; continue; }
      if (/^-{2,}$/.test(nx) && t && !/^[-*_ ]{3,}$/.test(t)) { blocks.push({ id: nid('b'), type: 'heading', depth: 2, children: parseInline(t), label: '', line: srcLine(i) }); i += 2; continue; }
    }

    // 水平線
    if (/^([*\-_])\s*(\1\s*){2,}$/.test(t)) { blocks.push({ id: nid('b'), type: 'thematic_break', line: srcLine(i) }); i++; continue; }

    // 腳註定義
    const fn = t.match(/^\[\^([^\]]+)\]:\s*(.*)$/);
    if (fn) {
      const body = [fn[2]];
      let j = i + 1;
      while (j < L && (/^\s{2,}\S/.test(expandTabs(lines[j])) || !expandTabs(lines[j]).trim())) {
        if (!expandTabs(lines[j]).trim() && !(j + 1 < L && /^\s{2,}\S/.test(expandTabs(lines[j + 1])))) break;
        body.push(expandTabs(lines[j]).replace(/^\s{0,4}/, '')); j++;
      }
      blocks.push({ id: nid('b'), type: 'footnote_def', fid: fn[1], children: parseBlocks(body, lineOffset + i), line: srcLine(i) });
      i = j; continue;
    }

    // 區塊引用
    if (/^>/.test(t)) {
      const body = [];
      let j = i;
      while (j < L && /^\s*>/.test(expandTabs(lines[j]))) { body.push(expandTabs(lines[j]).replace(/^\s*>\s?/, '')); j++; }
      blocks.push({ id: nid('b'), type: 'blockquote', children: parseBlocks(body, lineOffset + i), line: srcLine(i) });
      i = j; continue;
    }

    // 表格（GFM）
    if (t.includes('|') && i + 1 < L && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(expandTabs(lines[i + 1])) && /-/.test(lines[i + 1])) {
      const header = splitRow(t);
      const aligns = splitRow(expandTabs(lines[i + 1]).trim()).map(c => {
        const s = c.trim();
        if (/^:-+:$/.test(s)) return 'c';
        if (/^:-+$/.test(s)) return 'l';
        if (/^-+:$/.test(s)) return 'r';
        return 'l';
      });
      const rows = [];
      let j = i + 2;
      while (j < L && expandTabs(lines[j]).trim().includes('|')) { rows.push(splitRow(expandTabs(lines[j]).trim())); j++; }
      // caption：緊跟的 : 開頭行
      let caption = '', label = '';
      if (j < L) {
        const cm = expandTabs(lines[j]).trim().match(/^:\s*(.+)$/);
        if (cm) {
          caption = cm[1];
          const lm = caption.match(/\{#([^}]+)\}\s*$/);
          if (lm) { label = lm[1]; caption = caption.slice(0, lm.index).trim(); }
          j++;
        }
      }
      /* 合併儲存格（\multicolumn）：Markdown 表格本身沒有原生語法表示
         colspan。約定用「內容整格只有一個 > 字元」代表「併入左邊儲存格」
         ——視覺上像「延伸箭頭」，且單獨一個 > 在真實儲存格內容裡幾乎
         不會出現，衝突風險低。掃描 header 與每一列，把連續的 > 記號
         累加進左邊那格的 colspan，被併入的格子從陣列移除。
         raw cell 在這裡還是 parseInline() 前的文字（字串陣列），要在
         header.map(parseInline) 之前先做合併，否則要處理兩種資料形態。*/
      const mergeColspans = row => {
        const out = [];
        for (const cell of row) {
          const isMergeMark = cell.trim() === '>';
          if (isMergeMark && out.length) out[out.length - 1].colspan++;
          else out.push({ text: cell, colspan: 1 });
        }
        return out;
      };
      const headerMerged = mergeColspans(header);
      const rowsMerged = rows.map(mergeColspans);
      const hasMerge = headerMerged.some(c => c.colspan > 1) || rowsMerged.some(r => r.some(c => c.colspan > 1));

      blocks.push({ id: nid('b'), type: 'table', aligns,
                    /* hasMerge 為真時，header/rows 直接存「合併後」的
                       儲存格陣列（已移除 > 標記格），欄位數量因此可能
                       小於 aligns.length——這是預期的，因為欄位真的
                       變少了。headerColspans/rowsColspans 是平行陣列，
                       告訴發射器每個位置要不要用 \multicolumn 包裝。
                       沒有合併時（絕大多數表格）header/rows 維持原本
                       純 parseInline 陣列格式，完全不受影響。 */
                    header: hasMerge ? headerMerged.map(c => parseInline(c.text.trim()))
                                     : header.map(c => parseInline(c.trim())),
                    rows: hasMerge ? rowsMerged.map(r => r.map(c => parseInline(c.text.trim())))
                                   : rows.map(r => r.map(c => parseInline(c.trim()))),
                    headerColspans: hasMerge ? headerMerged.map(c => c.colspan) : null,
                    rowsColspans: hasMerge ? rowsMerged.map(r => r.map(c => c.colspan)) : null,
                    caption: caption ? parseInline(caption) : null, label, line: srcLine(i) });
      i = j; continue;
    }

    // 清單
    const li = line.match(/^(\s*)([-+*]|\d+[.)])\s+(.*)$/);
    if (li) {
      const res = parseList(lines, i, lineOffset);
      blocks.push(res.node); i = res.next; continue;
    }

    // 縮排程式碼
    if (/^ {4,}\S/.test(line) && (blocks.length === 0 || blocks[blocks.length - 1].type !== 'paragraph')) {
      const body = []; let j = i;
      while (j < L && (/^ {4,}/.test(expandTabs(lines[j])) || !expandTabs(lines[j]).trim())) { body.push(expandTabs(lines[j]).slice(4)); j++; }
      while (body.length && !body[body.length - 1].trim()) body.pop();
      blocks.push({ id: nid('b'), type: 'code_block', lang: '', value: body.join('\n'), meta: '', line: srcLine(i) });
      i = j; continue;
    }

    // 獨立 HTML 圖片 → figure（圖片工具列縮放後的 canonical 寫法）
    const htmlImgOnly = parseHtmlImageTag(t);
    if (htmlImgOnly) {
      blocks.push({ id: nid('b'), type: 'figure', src: htmlImgOnly.src,
                    caption: htmlImgOnly.alt ? parseInline(htmlImgOnly.alt) : null,
                    label: htmlImgOnly.id || '', wide: htmlImgOnly.wide,
                    scale: htmlImgOnly.scale, scaleExplicit: htmlImgOnly.scaleExplicit,
                    sourceSyntax: 'html', line: srcLine(i) });
      i++; continue;
    }

    // 獨立 Markdown 圖片 → figure；共用 matchLink，故相對路徑可含空白。
    const mdImg = t.startsWith('![') ? matchLink(t, 1) : null;
    if (mdImg) {
      const tail = t.slice(mdImg.end).trim();
      const am = tail.match(/^\{([^}]*)\}$/);
      if (!tail || am) {
        const attr = am ? am[1] : '';
        const wideByAttr = /(^|\s)wide(\s|$)/.test(attr);
        const labelMatch = attr.match(/#([^\s}]+)/);
        blocks.push({ id:nid('b'), type:'figure', src:mdImg.dest,
                      caption:mdImg.label ? parseInline(mdImg.label) : null,
                      label:labelMatch ? labelMatch[1] : '',
                      wide:wideByAttr || /\*\s*$/.test(mdImg.title || ''),
                      scale:1, scaleExplicit:false, sourceSyntax:'markdown', line:srcLine(i) });
        i++; continue;
      }
    }

    // 段落：保留行尾兩空白，讓 parseInline 能輸出真正的 LaTeX hard break。
    const para = [];
    let j = i;
    while (j < L) {
      const cur = (j === i ? line : expandTabs(lines[j]));
      const ct = cur.trim();
      if (!ct) break;
      if (j > i && (/^(#{1,6})\s/.test(ct) || /^(```+|~~~+)/.test(ct) || /^>/.test(ct)
                    || /^(\s*)([-+*]|\d+[.)])\s+/.test(cur) || ct === '$$' || ct.startsWith('\\[')
                    || /^([*\-_])\s*(\1\s*){2,}$/.test(ct))) break;
      para.push(cur.replace(/^\s+/, '')); j++;
    }
    blocks.push({ id:nid('b'), type:'paragraph', children:parseInline(para.join('\n')),
                  noindent, line:srcLine(i) });
    i = j;
  }
  return blocks;
}

function splitRow(s){
  let x = s.trim();
  if (x.startsWith('|')) x = x.slice(1);
  if (x.endsWith('|')) x = x.slice(0, -1);
  const cells = []; let cur = '';
  /* 行內數學區內的 | 是 LaTeX 的絕對值／範數符號（例如 $u=X/(1+|X|)$），
     不是表格欄位分隔符。原本沒有這層保護，那一格會被切成三格，公式被腰斬、
     $ 還會被後續轉義成 \$ 而失去數學模式——使用者回報「第四頁表格沒有正確
     顯示，被用 Markdown 的方式顯示了」正是這個。
     $ 前有反斜線（\$，字面錢字號）不切換數學狀態，交由上面的逃逸分支處理。 */
  let inMath = false;
  for (let i = 0; i < x.length; i++) {
    if (x[i] === '\\') { cur += x[i] + (x[i + 1] || ''); i++; continue; }
    if (x[i] === '$') { inMath = !inMath; cur += x[i]; continue; }
    if (x[i] === '|' && !inMath) { cells.push(cur); cur = ''; continue; }
    cur += x[i];
  }
  cells.push(cur);
  return cells;
}

function parseList(lines, start, lineOffset){
  const first = expandTabs(lines[start]).match(/^(\s*)([-+*]|\d+[.)])\s+(.*)$/);
  const baseIndent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items = [];
  let i = start;
  const L = lines.length;
  let curBody = null;

  while (i < L) {
    const raw = expandTabs(lines[i]);
    const t = raw.trim();
    const m = raw.match(/^(\s*)([-+*]|\d+[.)])\s+(.*)$/);
    if (m && m[1].length === baseIndent) {
      if (curBody) items.push(curBody);
      let content = m[3];
      let task = null;
      const tm = content.match(/^\[([ xX])\]\s+(.*)$/);
      if (tm) { task = tm[1].toLowerCase() === 'x'; content = tm[2]; }
      curBody = { lines: [content], task };
      i++; continue;
    }
    if (!t) {
      // 空行：看下一非空行是否仍屬本清單
      let k = i + 1;
      while (k < L && !expandTabs(lines[k]).trim()) k++;
      if (k >= L) break;
      const nk = expandTabs(lines[k]);
      const nm = nk.match(/^(\s*)([-+*]|\d+[.)])\s+/);
      const cont = (nm && nm[1].length >= baseIndent) || /^\s{2,}\S/.test(nk) && nk.match(/^ */)[0].length > baseIndent;
      if (!cont) break;
      if (curBody) curBody.lines.push('');
      i++; continue;
    }
    if (m && m[1].length > baseIndent) { if (curBody) curBody.lines.push(raw.slice(baseIndent + 2)); i++; continue; }
    if (raw.match(/^ */)[0].length > baseIndent) { if (curBody) curBody.lines.push(raw.slice(Math.min(baseIndent + 2, raw.match(/^ */)[0].length))); i++; continue; }
    break;
  }
  if (curBody) items.push(curBody);

  const node = {
    id: nid('b'), type: 'list', ordered,
    start: ordered ? parseInt(first[2], 10) || 1 : null,
    items: items.map(it => ({
      task: it.task,
      children: parseBlocks(it.lines, lineOffset + start)
    })),
    line: lineOffset + start + 1
  };
  return { node, next: i };
}

/* ---------- 主入口 ---------- */
function parse(md){
  uid = 0;
  const src = String(md == null ? '' : md).replace(/\r\n?/g, '\n');
  const all = src.split('\n');
  const control = stripLeadingRevtexSettings(all);
  const fm = parseFrontmatter(control.rest);
  let blocks = parseBlocks(fm.rest, control.endLine + fm.endLine);
  const meta = fm.meta || {};

  /* 沒有 --- YAML --- frontmatter 的文件（例如內建「REVTeX 4.2 校正語料庫.md」
     與所有 CP167 慣例的既有稿件），metadata 是放在 ```revtex-frontmatter
     fence 裡。這裡把它吸收進 meta，並從 blocks 移除，避免整段被當成
     code_block 印進正文。兩種慣例可以並存：YAML frontmatter 先解析，
     原生 fence 只補上 YAML 沒提供的欄位（Object.assign 由 fence 覆蓋，
     因為使用同一份文件時只會有其中一種）。 */
  const absorbed = absorbNativeRevtexBlocks(meta, blocks,
    inner => parseBlocks(String(inner).split('\n'), 0));
  blocks = absorbed.blocks;

  return {
    schema: 'cp171-ast/1',
    meta,
    blocks,
    nativeRevtexBlocks: absorbed.absorbed,
    stats: statsOf(blocks)
  };
}

function walk(nodes, fn){
  for (const n of nodes || []) {
    fn(n);
    if (n.children) walk(n.children, fn);
    if (n.items) for (const it of n.items) walk(it.children, fn);
    if (n.header) for (const c of n.header) walk(c, fn);
    if (n.rows) for (const r of n.rows) for (const c of r) walk(c, fn);
    if (n.caption) walk(n.caption, fn);
  }
}

function statsOf(blocks){
  const s = { headings: 0, paragraphs: 0, mathBlock: 0, mathInline: 0, tables: 0,
              figures: 0, lists: 0, codeBlocks: 0, rawTex: 0, cites: 0, refs: 0,
              footnoteDefs: 0, footnoteRefs: 0, footnoteInline: 0 };
  walk(blocks, n => {
    switch (n.type) {
      case 'heading': s.headings++; break;
      case 'paragraph': s.paragraphs++; break;
      case 'math_block': s.mathBlock++; break;
      case 'math_inline': s.mathInline++; break;
      case 'table': s.tables++; break;
      case 'figure': s.figures++; break;
      case 'list': s.lists++; break;
      case 'code_block': s.codeBlocks++; break;
      case 'raw_tex': s.rawTex++; break;
      case 'cite': s.cites++; break;
      case 'ref': s.refs++; break;
      case 'footnote_def': s.footnoteDefs++; break;
      case 'footnote_ref': s.footnoteRefs++; break;
      case 'footnote_inline': s.footnoteInline++; break;
    }
  });
  return s;
}

/* ---------- ADR-0005 要求的強制驗收：結構摘要 ----------------------------
   與既有解析器的同名摘要比對用。兩套 Markdown 理解一旦分歧，這裡先抓到。 */
function parityDigest(md){
  const ast = parse(md);
  const headings = [];
  const listDepths = [];
  const tableDims = [];
  const mathTex = [];
  const depthOf = (blocks, d) => {
    for (const b of blocks) {
      if (b.type === 'list') { listDepths.push(d + 1); for (const it of b.items) depthOf(it.children, d + 1); }
      else if (b.children && Array.isArray(b.children) && b.type === 'blockquote') depthOf(b.children, d);
    }
  };
  walk(ast.blocks, n => {
    if (n.type === 'heading') headings.push(n.depth + ':' + inlineText(n.children));
    if (n.type === 'table') tableDims.push((n.rows.length + 1) + 'x' + n.header.length);
    if (n.type === 'math_block' || n.type === 'math_inline') mathTex.push((n.tex || '').replace(/\s+/g, ' ').trim());
  });
  depthOf(ast.blocks, 0);
  return {
    headings, listMaxDepth: listDepths.length ? Math.max(...listDepths) : 0,
    tableDims, mathCount: mathTex.length, mathTex,
    plainTextLength: plainText(ast.blocks).length,
    stats: ast.stats
  };
}

function inlineText(children){
  let s = '';
  for (const c of children || []) {
    if (c.type === 'text') s += c.value;
    else if (c.type === 'code_inline') s += c.value;
    else if (c.type === 'math_inline') s += '$' + c.tex + '$';
    else if (c.children) s += inlineText(c.children);
  }
  return s;
}
function plainText(blocks){
  let s = '';
  for (const b of blocks || []) {
    if (b.children && b.type !== 'blockquote') s += inlineText(b.children) + '\n';
    else if (b.type === 'blockquote') s += plainText(b.children);
    else if (b.type === 'code_block' || b.type === 'raw_tex') s += b.value + '\n';
    else if (b.type === 'math_block') s += b.tex + '\n';
    else if (b.type === 'list') for (const it of b.items) s += plainText(it.children);
    else if (b.type === 'table') {
      s += b.header.map(inlineText).join(' ') + '\n';
      for (const r of b.rows) s += r.map(inlineText).join(' ') + '\n';
    }
  }
  return s;
}

K.register('parser', {
  parse, parseInline, parityDigest, walk, inlineText, plainText,
  version: '1.2.1'
});
K.log.info('parser', 'CP171 獨立解析器就緒（隔離：不讀 DOM、不呼叫既有解析器）');
})();
