
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
 *   parityDigest() 產出結構摘要（標題序列、清單深度、表格維度、數學區塊數）。
 *   1.2.6 起另有 tests/revtex_emit_checks.cjs：把左邊編輯器的 inlineMD 與
 *   splitTableRow 原樣執行，逐案比對兩邊認定的數學、程式碼、強調與表格切欄。
 *   行內規則（CommonMark 定界符、Pandoc 的 $ 規則、表格切欄）與左邊同一組。
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



/* ---------- 行內解析（1.2.6 重寫）--------------------------------------------
   為什麼重寫：舊版由左到右逐字掃描，遇到 * 或 _ 就往後找「下一個相同符號」，
   沒有 CommonMark 的「左右側定界符」判斷，結果
     · snake_case、file_name、x_1 的底線被當斜體（左邊畫面不會）；
     · 強調的結尾跑進後面的行內程式碼或數學裡，把 $a_b$ 腰斬；
     · \( … \) 被跳脫規則先吃掉，永遠不是數學；句中的 $$ … $$ 印成怪字串。
   新做法分兩階段（與 CommonMark 參考實作同一套方法）：
     第一階段：由左到右切出「原子片段」——跳脫字、行內程式碼、數學、自動連結、
               HTML、實體、圖片、連結、引用、腳註——以及 * _ ~~ == 的定界符串。
               原子片段內部的字元絕不參與強調判定。
     第二階段：用 CommonMark 的定界符演算法（含「三的倍數」規則）配對強調。
   單字中間的 _ 永遠不是強調；* 依 CommonMark 規則，單字中間也可以強調
   （CommonMark 的 2*3*4 就是「2、斜體 3、4」——要印乘號請寫 $2\times3\times4$
   或 2\*3\*4）。左邊畫面（01.js inlineMD）用同一組規則。
   數學一律原樣保留（不做任何改寫）；轉成 TeX 時的 Unicode 對照在發射器做。 */

/* 原子片段辨識需要的小工具。 */
const ASCII_PUNCT_CHARS = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';
const isAsciiPunct = c => !!c && c.length === 1 && ASCII_PUNCT_CHARS.includes(c);
/* 取 i 位置（UTF-16 索引）之前／之後的一個完整字元（處理 emoji 等代理對）。 */
function charBefore(s, i){
  if (i <= 0) return '';
  const lo = s.charCodeAt(i - 1);
  if (lo >= 0xDC00 && lo <= 0xDFFF && i >= 2) return s.slice(i - 2, i);
  return s[i - 1];
}
function charAt(s, i){
  if (i >= s.length) return '';
  const cp = s.codePointAt(i);
  return String.fromCodePoint(cp);
}
/* CommonMark：行首行尾視同空白；標點包含 Unicode 的 P 與 S 類。 */
const isWSChar = c => !c || /\s/u.test(c);
const isPunctChar = c => !!c && /[\p{P}\p{S}]/u.test(c);
const isWordChar = c => !!c && /[\p{L}\p{N}]/u.test(c);

/* 具名 HTML 實體（左邊瀏覽器會顯示成字元的常見那一批）。數字實體另外處理。 */
const NAMED_ENTITIES = {
  nbsp:' ', amp:'&', lt:'<', gt:'>', quot:'"', apos:"'",
  copy:'©', reg:'®', trade:'™', deg:'°', plusmn:'±', times:'×',
  divide:'÷', micro:'µ', middot:'·', para:'¶', sect:'§', laquo:'«',
  raquo:'»', ldquo:'“', rdquo:'”', lsquo:'‘', rsquo:'’', sbquo:'‚',
  bdquo:'„', ndash:'–', mdash:'—', hellip:'…', bull:'•', dagger:'†',
  Dagger:'‡', permil:'‰', prime:'′', Prime:'″', euro:'€', pound:'£',
  yen:'¥', cent:'¢', sup1:'¹', sup2:'²', sup3:'³', frac12:'½',
  frac14:'¼', frac34:'¾', ordf:'ª', ordm:'º', not:'¬', shy:'',
  thinsp:' ', ensp:' ', emsp:' ', larr:'←', rarr:'→', uarr:'↑',
  darr:'↓', harr:'↔', lArr:'⇐', rArr:'⇒', hArr:'⇔', le:'≤',
  ge:'≥', ne:'≠', asymp:'≈', equiv:'≡', infin:'∞', sum:'∑',
  prod:'∏', radic:'√', int:'∫', part:'∂', nabla:'∇', isin:'∈',
  notin:'∉', cap:'∩', cup:'∪', sub:'⊂', sup:'⊃', forall:'∀',
  exist:'∃', empty:'∅', minus:'−', lowast:'∗', prop:'∝', ang:'∠',
  and:'∧', or:'∨', there4:'∴', sim:'∼', cong:'≅', perp:'⊥',
  sdot:'⋅', lang:'⟨', rang:'⟩', loz:'◊', hbar:'ℏ', ell:'ℓ',
  Agrave:'À', Aacute:'Á', Acirc:'Â', Atilde:'Ã', Auml:'Ä', Aring:'Å',
  AElig:'Æ', Ccedil:'Ç', Egrave:'È', Eacute:'É', Ecirc:'Ê', Euml:'Ë',
  Igrave:'Ì', Iacute:'Í', Icirc:'Î', Iuml:'Ï', Ntilde:'Ñ', Ograve:'Ò',
  Oacute:'Ó', Ocirc:'Ô', Otilde:'Õ', Ouml:'Ö', Oslash:'Ø', Ugrave:'Ù',
  Uacute:'Ú', Ucirc:'Û', Uuml:'Ü', Yacute:'Ý', szlig:'ß', agrave:'à',
  aacute:'á', acirc:'â', atilde:'ã', auml:'ä', aring:'å', aelig:'æ',
  ccedil:'ç', egrave:'è', eacute:'é', ecirc:'ê', euml:'ë', igrave:'ì',
  iacute:'í', icirc:'î', iuml:'ï', ntilde:'ñ', ograve:'ò', oacute:'ó',
  ocirc:'ô', otilde:'õ', ouml:'ö', oslash:'ø', ugrave:'ù', uacute:'ú',
  ucirc:'û', uuml:'ü', yacute:'ý', yuml:'ÿ',
  Alpha:'Α', Beta:'Β', Gamma:'Γ', Delta:'Δ', Epsilon:'Ε', Zeta:'Ζ',
  Eta:'Η', Theta:'Θ', Iota:'Ι', Kappa:'Κ', Lambda:'Λ', Mu:'Μ',
  Nu:'Ν', Xi:'Ξ', Omicron:'Ο', Pi:'Π', Rho:'Ρ', Sigma:'Σ', Tau:'Τ',
  Upsilon:'Υ', Phi:'Φ', Chi:'Χ', Psi:'Ψ', Omega:'Ω',
  alpha:'α', beta:'β', gamma:'γ', delta:'δ', epsilon:'ε', zeta:'ζ',
  eta:'η', theta:'θ', iota:'ι', kappa:'κ', lambda:'λ', mu:'μ',
  nu:'ν', xi:'ξ', omicron:'ο', pi:'π', rho:'ρ', sigmaf:'ς',
  sigma:'σ', tau:'τ', upsilon:'υ', phi:'φ', chi:'χ', psi:'ψ',
  omega:'ω', thetasym:'ϑ', piv:'ϖ'
};
/* &nbsp; 直接映成 TeX 的不換行空白；其餘實體還原成字元，交給發射器統一轉成 TeX。 */
function readHtmlEntityAt(s, at){
  const m = String(s).slice(at).match(/^&(#\d{1,7}|#[xX][\da-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/);
  if (!m) return null;
  const raw = m[0], key = m[1];
  if (key === 'nbsp') return { value:'~', rawTex:true, end:at + raw.length };
  let value = null;
  if (key[0] === '#') {
    const n = (key[1] === 'x' || key[1] === 'X') ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
    if (n > 0 && n <= 0x10FFFF) value = String.fromCodePoint(n);
  } else if (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key)) value = NAMED_ENTITIES[key];
  if (value === null) return null;               // 不認得的實體：保留字面（與瀏覽器一致）
  return { value, rawTex:false, end:at + raw.length };
}

/* 左邊編輯器 HTML 白名單（01.js 的 HTML_TAGS）裡的行內標籤，右邊一律接住：
   能對應 LaTeX 語意的就對應，其餘只留內文，不讓「<small>」這類字面印進 PDF。 */
const INLINE_HTML_TAGS = 'strong|b|em|i|u|ins|del|s|mark|sub|sup|code|kbd|samp|var|a|span|font|small|big|abbr|center|cite|dfn|q|time|details|summary|ruby|rt|rp';
function matchInlineHtml(s, at){
  const rest = String(s).slice(at);
  const cm = rest.match(/^<!--[\s\S]*?-->/);
  if (cm) return { node:null, end:at + cm[0].length };
  const br = rest.match(/^<br\b[^>]*\/?>/i);
  if (br) return { node:{type:'hard_break'}, end:at + br[0].length };
  const wbr = rest.match(/^<wbr\b[^>]*\/?>/i);
  if (wbr) return { node:null, end:at + wbr[0].length };
  const im = rest.match(/^<img\b[^>]*\/?>/i);
  if (im) {
    const spec = parseHtmlImageTag(im[0]);
    if (spec) return { node:{ type:'image', alt:spec.alt, src:spec.src, title:spec.title,
      scale:spec.scale, scaleExplicit:spec.scaleExplicit, wide:spec.wide }, end:at + im[0].length };
  }
  /* <video>/<audio> 沒有 PDF 對應物：整段移除並由發射器警告（node 帶 dropped 標記）。 */
  const media = rest.match(/^<(video|audio)\b[^>]*?(?:\/>|>[\s\S]*?<\/\1\s*>)/i);
  if (media) return { node:{ type:'dropped', what:media[1].toLowerCase() }, end:at + media[0].length };
  const op = rest.match(new RegExp('^<(' + INLINE_HTML_TAGS + ')\\b([^>]*)>', 'i'));
  if (!op) return null;
  const tag = op[1].toLowerCase();
  /* 找對應的結束標籤（含同名巢狀，例如色彩命令套用兩次的 span）。 */
  const tail = rest.slice(op[0].length);
  const tagRe = new RegExp('<\\/?' + tag + '\\b[^>]*>', 'ig');
  let depth = 1, cm2 = null, hit;
  while ((hit = tagRe.exec(tail))) {
    if (/^<\//.test(hit[0])) { depth--; if (depth === 0) { cm2 = { index: hit.index, length: hit[0].length }; break; } }
    else if (!/\/\s*>$/.test(hit[0])) depth++;
  }
  if (!cm2) return null;
  const inner = tail.slice(0, cm2.index), attrs = op[2] || '';
  const kids = () => parseInline(inner);
  let node;
  if (tag === 'span' || tag === 'font') {
    /* CP173 色彩工具列：只有帶 color 的 span/font 標成 html_color（期刊多為黑白，
       發射器只留文字並提醒）；其他 span 只留內文。 */
    const colored = /\b(?:style\s*=\s*["'][^"']*color\s*:|color\s*=\s*["'])/i.test(attrs);
    node = { type: colored ? 'html_color' : 'span', children: kids() };
  }
  else if (tag === 'strong' || tag === 'b') node = { type:'strong', children:kids() };
  else if (tag === 'em' || tag === 'i' || tag === 'cite' || tag === 'dfn' || tag === 'var') node = { type:'emph', children:kids() };
  else if (tag === 'u' || tag === 'ins') node = { type:'underline', children:kids() };
  else if (tag === 'del' || tag === 's') node = { type:'strike', children:kids() };
  else if (tag === 'mark') node = { type:'highlight', children:kids() };
  else if (tag === 'sub') node = { type:'subscript', children:kids() };
  else if (tag === 'sup') node = { type:'superscript', children:kids() };
  else if (tag === 'small') node = { type:'small', children:kids() };
  else if (tag === 'big') node = { type:'big', children:kids() };
  else if (tag === 'q') node = { type:'span', children:[{ type:'text', value:'“' }, ...kids(), { type:'text', value:'”' }] };
  else if (tag === 'code' || tag === 'kbd' || tag === 'samp') node = { type:'code_inline', value:decodeHtmlAttrValue(inner.replace(/<[^>]*>/g,'')) };
  else if (tag === 'rt' || tag === 'rp') node = null;      // 注音／拼音標註：PDF 不排，只留本字
  else if (tag === 'a') {
    const am = htmlTagAttrs('<img ' + attrs + '>');
    node = { type:'link', dest:am.href || '', title:am.title || '', children:kids() };
  }
  else node = { type:'span', children:kids() };          // abbr/center/time/details/summary/ruby
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

/* pandoc-crossref 的交叉引用前綴：這些是「圖表式章節編號」而不是文獻。 */
const XREF_PREFIX = /^(fig|figure|tbl|tab|table|eq|eqn|equation|sec|section|lst|listing|thm|theorem|alg|algorithm|app|appendix):/i;
/* 文獻鍵（Pandoc 規則）：字母數字或底線開頭，中間可含 : . # $ % & - + ? < > ~ /。 */
const CITE_KEY_RE = /^(-?)@([\p{L}\p{N}_](?:[\p{L}\p{N}_:.#$%&+?<>~\/-]*[\p{L}\p{N}_])?)/u;

/* [prefix @key, locator; @key2] → [{key, pre, post, suppress}]。
   Pandoc 用分號分隔多筆；但實務上很多人寫 [@a, @b]，所以「逗號後面緊接另一個
   @key」也當成另一筆，其餘逗號後的文字才是頁碼等備註（[@key, p. 3]）。 */
function parseCitationBracket(inner){
  const items = [];
  for (const chunk of String(inner).split(';')) {
    let rest = chunk.trim();
    if (!rest) continue;
    const at = rest.search(/-?@[\p{L}\p{N}_]/u);
    if (at < 0) return null;                    // 有一段沒有 @key：這不是引用
    const pre = rest.slice(0, at).trim();
    rest = rest.slice(at);
    for (;;) {
      const km = rest.match(CITE_KEY_RE);
      if (!km) return null;
      rest = rest.slice(km[0].length);
      const item = { key: km[2], pre: '', post: '', suppress: km[1] === '-' };
      if (!items.length || items[items.length - 1].__closed) item.pre = pre; else item.pre = '';
      items.push(item);
      const more = rest.match(/^\s*,\s*(?=-?@[\p{L}\p{N}_])/u);
      if (more) { rest = rest.slice(more[0].length); item.__closed = false; continue; }
      item.post = rest.replace(/^\s*,?\s*/, '').trim();
      item.__closed = true;
      break;
    }
  }
  if (!items.length) return null;
  return items.map(({ key, pre, post, suppress }) => ({ key, pre, post, suppress }));
}

/* 由開頭 $ 找 Pandoc 規則的收尾 $：開頭 $ 後面不能是空白；收尾 $ 前面不能是空白、
   後面不能緊接數字；中間不能換行（左邊畫面逐行渲染，跨行的 $ 在左邊不是數學）；
   遇到的第一個 $ 若不合格，整段就不是數學（Pandoc 不會繼續往後找）。回傳收尾 $ 的
   索引或 -1。表格切欄也用同一條規則，所以「| $5 | $6 |」不會被併成一格。 */
function inlineMathClose(s, i){
  if (s[i] !== '$' || s[i + 1] === '$') return -1;
  const first = s[i + 1];
  if (!first || /\s/.test(first)) return -1;
  for (let e = i + 1; e < s.length; e++) {
    const c = s[e];
    if (c === '\\') { e++; continue; }
    if (c === '\n') return -1;
    if (c === '$') {
      if (/\s/.test(s[e - 1])) return -1;
      if (/[0-9]/.test(s[e + 1] || '')) return -1;
      return e;
    }
  }
  return -1;
}
/* $$ … $$ 夾在句中：找同一行內收尾的 $$。 */
function displayMathClose(s, i){
  if (s[i] !== '$' || s[i + 1] !== '$') return -1;
  for (let e = i + 2; e < s.length - 1; e++) {
    if (s[e] === '\\') { e++; continue; }
    if (s[e] === '\n') return -1;             // 左邊逐行渲染：句中 $$ 不跨行
    if (s[e] === '$' && s[e + 1] === '$') return e > i + 2 ? e : -1;
  }
  return -1;
}
/* 行內程式碼：CommonMark 的反引號串規則——收尾串的長度必須與開頭完全相同。 */
function codeSpanClose(s, i, n){
  let j = i + n;
  while (j < s.length) {
    if (s[j] !== '`') { j++; continue; }
    let k = j; while (s[k] === '`') k++;
    if (k - j === n) return j;
    j = k;
  }
  return -1;
}
/* GFM 擴充自動連結：http(s):// 或 www. 開頭，尾端的句讀與不成對的右括號不算網址。 */
function bareUrlAt(s, i){
  const m = s.slice(i).match(/^(?:https?:\/\/|www\.)[^\s<>]*/i);
  if (!m) return null;
  let u = m[0];
  for (;;) {
    const last = u[u.length - 1];
    if (/[?!.,:*_~'";]/.test(last)) { u = u.slice(0, -1); continue; }
    if (last === ')') {
      const open = (u.match(/\(/g) || []).length, close = (u.match(/\)/g) || []).length;
      if (close > open) { u = u.slice(0, -1); continue; }
    }
    break;
  }
  if (!/^(?:https?:\/\/|www\.)[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)*/iu.test(u)) return null;
  return u;
}

function parseInline(text){
  text = String(text == null ? '' : text);
  const items = [];             // {k:'t',v} 文字 | {k:'n',node} 原子節點 | {k:'d',…} 定界符串
  let buf = '';
  const flush = () => { if (buf) { items.push({ k:'t', v:buf }); buf = ''; } };
  const put = node => { flush(); if (node) items.push({ k:'n', node }); };
  const n = text.length;
  let i = 0;

  while (i < n) {
    const c = text[i];

    if (c === '\\') {
      const nx = text[i + 1];
      if (nx === '\n') { put({ type:'hard_break' }); i += 2; continue; }
      /* 反斜線＋空白：TeX 的控制空格（"Ref.\ 12" 防止句點後加寬間距），原樣傳過去。 */
      if (nx === ' ' || nx === '\t') { put({ type:'raw_inline', tex:'\\ ' }); i += 2; continue; }
      /* \( … \) 行內數學：同一行內有收尾 \) 才算，否則就是跳脫的左括號。
         句中的 \[ 維持 CommonMark 跳脫（印出 [）：左邊畫面也是這樣顯示；
         獨立成行的 \[ … \] 由區塊解析當作展示公式。 */
      if (nx === '(') {
        const e = text.indexOf('\\)', i + 2);
        const body = e > 0 ? text.slice(i + 2, e) : '';
        if (e > 0 && body.trim() && !body.includes('\n')) {
          put({ type:'math_inline', tex:body });
          i = e + 2; continue;
        }
      }
      /* 直通的 LaTeX 引用類指令（使用者手寫），與 \today。 */
      const cm = text.slice(i).match(/^\\(cite|citep|citet|onlinecite|textcite|ref|eqref|label)\{([^{}]*)\}/);
      if (cm) {
        const kind = cm[1], arg = cm[2];
        if (kind === 'label') put({ type:'label', id:arg.trim() });
        else if (kind === 'ref' || kind === 'eqref') put({ type:'ref', ids:[arg.trim()], style:kind, explicit:true });
        else put({ type:'cite', items:arg.split(',').map(s => s.trim()).filter(Boolean).map(key => ({ key, pre:'', post:'' })), macro:kind });
        i += cm[0].length; continue;
      }
      if (/^\\today(?![A-Za-z])/.test(text.slice(i))) { put({ type:'raw_inline', tex:'\\today{}' }); i += 6; continue; }
      /* CommonMark：反斜線後接任何 ASCII 標點都是跳脫，印出該標點本身。
         跳脫後的引號不做方向轉換，用 nosmart 標記讓發射器照原樣處理。 */
      if (isAsciiPunct(nx)) {
        if (nx === '"' || nx === "'") put({ type:'text', value:nx, nosmart:true });
        else buf += nx;
        i += 2; continue;
      }
      buf += c; i++; continue;
    }

    if (c === '`') {
      let run = 0; while (text[i + run] === '`') run++;
      const e = codeSpanClose(text, i, run);
      if (e < 0) { buf += '`'.repeat(run); i += run; continue; }
      let v = text.slice(i + run, e).replace(/\n/g, ' ');
      if (v.length > 1 && v[0] === ' ' && v[v.length - 1] === ' ' && v.trim()) v = v.slice(1, -1);
      put({ type:'code_inline', value:v });
      i = e + run; continue;
    }

    if (c === '$') {
      if (text[i + 1] === '$') {
        const e = displayMathClose(text, i);
        if (e > 0) { put({ type:'math_display', tex:text.slice(i + 2, e).trim() }); i = e + 2; continue; }
        buf += '$$'; i += 2; continue;
      }
      const e = inlineMathClose(text, i);
      if (e > 0) { put({ type:'math_inline', tex:text.slice(i + 1, e) }); i = e + 1; continue; }
      buf += '$'; i++; continue;
    }

    if (c === '<') {
      const al = text.slice(i).match(/^<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*)>/);
      if (al) { put({ type:'link', dest:al[1], title:'', children:[{ type:'text', value:al[1].replace(/^mailto:/i, '') }], autolink:true }); i += al[0].length; continue; }
      const em = text.slice(i).match(/^<([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*)>/);
      if (em) { put({ type:'link', dest:'mailto:' + em[1], title:'', children:[{ type:'text', value:em[1] }], autolink:true }); i += em[0].length; continue; }
      const hm = matchInlineHtml(text, i);
      if (hm) { put(hm.node); i = hm.end; continue; }
      buf += c; i++; continue;
    }

    if (c === '&') {
      const en = readHtmlEntityAt(text, i);
      if (en) { put(en.rawTex ? { type:'raw_inline', tex:en.value } : { type:'text', value:en.value, nosmart:true }); i = en.end; continue; }
      buf += c; i++; continue;
    }

    /* 硬換行：行尾兩個以上空白；單純換行是軟換行（TeX 的空白）。 */
    if (c === ' ') {
      let j = i; while (text[j] === ' ') j++;
      if (text[j] === '\n') {
        if (j - i >= 2) put({ type:'hard_break' }); else buf += '\n';
        i = j + 1; continue;
      }
      buf += text.slice(i, j); i = j; continue;
    }

    if (c === '!' && text[i + 1] === '[') {
      const m = matchLink(text, i + 1);
      if (m) {
        put({ type:'image', alt:m.label, src:m.dest, title:m.title, scale:1, scaleExplicit:false, wide:/\*\s*$/.test(m.title || '') });
        i = m.end; continue;
      }
    }

    if (c === '^' && text[i + 1] === '[') {
      let depth = 1, e = i + 2;
      while (e < n && depth > 0) {
        if (text[e] === '\\') { e += 2; continue; }
        if (text[e] === '[') depth++;
        else if (text[e] === ']') depth--;
        if (depth === 0) break;
        e++;
      }
      if (depth === 0) { put({ type:'footnote_inline', children:parseInline(text.slice(i + 2, e)) }); i = e + 1; continue; }
    }

    if (c === '[') {
      if (text[i + 1] === '^') {
        const fm = text.slice(i).match(/^\[\^([^\]\s]+)\]/);
        if (fm && text[i + fm[0].length] !== ':') { put({ type:'footnote_ref', id:fm[1] }); i += fm[0].length; continue; }
      }
      /* 1.1.5.6.1：數字引用 [[1]] / [[1, 2]] / [[1-3]]（沿用臺灣論文既有慣例）。 */
      const nrm = text.slice(i).match(/^\[\[\s*(\d+(?:\s*[-–—,;]\s*\d+)*)\s*\]\]/);
      if (nrm) {
        put({ type:'cite', items:expandNumericCiteRefs(nrm[1]).map(key => ({ key, pre:'', post:'' })), numeric:true });
        i += nrm[0].length; continue;
      }
      const m = matchLink(text, i);
      if (m) { put({ type:'link', dest:m.dest, title:m.title, children:parseInline(m.label) }); i = m.end; continue; }
      /* Pandoc 引用 [@key]、[@a; @b]、[@key, p. 3]、[see @key]、[-@key]。 */
      const cb = matchBracket(text, i);
      if (cb > 0 && /-?@[\p{L}\p{N}_]/u.test(text.slice(i + 1, cb))) {
        const cit = parseCitationBracket(text.slice(i + 1, cb));
        if (cit) {
          const xr = cit.filter(x => XREF_PREFIX.test(x.key));
          if (xr.length === cit.length) {
            put({ type:'ref', ids:cit.map(x => x.key), style:cit.every(x => /^(eq|eqn|equation):/i.test(x.key)) ? 'eqref' : 'ref' });
          } else if (!xr.length) {
            put({ type:'cite', items:cit });
          } else {
            /* 文獻與交叉引用混寫：依原順序拆成幾段，各自輸出。 */
            cit.forEach((x, k) => {
              const isX = XREF_PREFIX.test(x.key);
              if (k) put({ type:'text', value:'; ' });
              if (isX) put({ type:'ref', ids:[x.key], style:/^(eq|eqn|equation):/i.test(x.key) ? 'eqref' : 'ref' });
              else put({ type:'cite', items:[x] });
            });
          }
          i = cb + 1; continue;
        }
      }
    }

    /* 裸網址（GFM 擴充自動連結）：前面必須是行首、空白或左括號類字元。 */
    if ((c === 'h' || c === 'H' || c === 'w' || c === 'W') && /^(?:https?:\/\/|www\.)/i.test(text.substr(i, 8))
        && /^[\s(\[*_~"'“‘]?$/.test(charBefore(text, i) || '')) {
      const u = bareUrlAt(text, i);
      if (u) {
        put({ type:'link', dest:/^www\./i.test(u) ? 'http://' + u : u, title:'', children:[{ type:'text', value:u }], autolink:true });
        i += u.length; continue;
      }
    }

    /* 直引號 → 方向引號（Pandoc smart 規則）：前面是行首、空白或開括號類就是開引號；
       單引號前面是字母數字時是撇號（it's）。發射器再把彎引號換成 TeX 的 `` '' ` '。 */
    if (c === '"' || c === "'") {
      const pv = charBefore(text, i), nx = charAt(text, i + 1);
      const openCtx = !pv || /[\s(\[{<—–\-\/“‘]/u.test(pv);
      if (c === "'" && isWordChar(pv)) buf += '’';
      else if (openCtx && nx && !isWSChar(nx)) buf += c === '"' ? '“' : '‘';
      else buf += c === '"' ? '”' : '’';
      i++; continue;
    }

    /* 強調定界符串：* 與 _ 任何長度；~~ 與 == 只認剛好兩個。 */
    if (c === '*' || c === '_' || c === '~' || c === '=') {
      let j = i; while (text[j] === c) j++;
      const len = j - i;
      if ((c === '~' || c === '=') && len !== 2) { buf += text.slice(i, j); i = j; continue; }
      const pv = charBefore(text, i), nx = charAt(text, j);
      const left = !isWSChar(nx) && (!isPunctChar(nx) || isWSChar(pv) || isPunctChar(pv));
      const right = !isWSChar(pv) && (!isPunctChar(pv) || isWSChar(nx) || isPunctChar(nx));
      let open, close;
      if (c === '_') { open = left && (!right || isPunctChar(pv)); close = right && (!left || isPunctChar(nx)); }
      else { open = left; close = right; }
      flush();
      items.push({ k:'d', ch:c, n:len, orig:len, open, close });
      i = j; continue;
    }

    buf += c; i++;
  }
  flush();
  return resolveEmphasis(items);
}

/* CommonMark 的強調配對（process emphasis）。items 會被就地改寫。 */
function resolveEmphasis(items){
  const asText = d => ({ k:'t', v:d.ch.repeat(d.n) });
  let ci = 0;
  while (ci < items.length) {
    const cl = items[ci];
    if (cl.k !== 'd' || !cl.close || cl.n <= 0) { ci++; continue; }
    let found = -1;
    for (let oi = ci - 1; oi >= 0; oi--) {
      const op = items[oi];
      if (op.k !== 'd' || op.ch !== cl.ch || !op.open || op.n <= 0) continue;
      if ((cl.ch === '*' || cl.ch === '_') && (op.close || cl.open)
          && (op.orig + cl.orig) % 3 === 0 && !(op.orig % 3 === 0 && cl.orig % 3 === 0)) continue;
      found = oi; break;
    }
    if (found < 0) {
      if (!cl.open) items[ci] = asText(cl);
      ci++; continue;
    }
    const op = items[found];
    const use = (cl.ch === '*' || cl.ch === '_') ? (op.n >= 2 && cl.n >= 2 ? 2 : 1) : 2;
    const type = cl.ch === '~' ? 'strike' : cl.ch === '=' ? 'highlight' : (use === 2 ? 'strong' : 'emph');
    const inner = items.slice(found + 1, ci).map(x => (x.k === 'd' ? asText(x) : x));
    const nodeItem = { k:'n', node:{ type, children:itemsToNodes(inner) } };
    op.n -= use; cl.n -= use;
    const head = items.slice(0, found);
    const mid = [];
    if (op.n > 0) mid.push(op);
    mid.push(nodeItem);
    const next = head.length + mid.length;
    if (cl.n > 0) mid.push(cl);
    items = head.concat(mid, items.slice(ci + 1));
    ci = next;
  }
  return itemsToNodes(items.map(x => (x.k === 'd' ? asText(x) : x)));
}
function itemsToNodes(items){
  const out = [];
  for (const it of items) {
    if (it.k === 't') {
      const last = out[out.length - 1];
      if (last && last.type === 'text' && !last.nosmart) last.value += it.v;
      else out.push({ type:'text', value:it.v });
    } else if (it.node) out.push(it.node);
  }
  return out;
}

/** 從 `[` 找對應的 `]`（略過跳脫、行內程式碼與數學），回傳索引或 -1。 */
function matchBracket(s, at){
  let depth = 0;
  for (let i = at; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { i++; continue; }
    if (c === '`') { let r = 0; while (s[i + r] === '`') r++; const e = codeSpanClose(s, i, r); if (e > 0) { i = e + r - 1; continue; } i += r - 1; continue; }
    if (c === '$') { const e = inlineMathClose(s, i); if (e > 0) { i = e; continue; } }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) return i; }
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
  const parts = [], labels = [];
  /* 1.2.6：每條子式後面（或收尾 $$ 前）的 {#eq:x} 也要接住，否則標籤原樣留在
     fence 裡被丟掉，[@eq:x] 變成 ??。整組的標籤寫在 fence 第一行 {#eq:group}。 */
  const re = /\$\$([\s\S]*?)\$\$[ \t]*(?:\{#([^}\s]+)\})?/g;
  let m, group = '';
  const gm = t.match(/^\s*\{#([^}\s]+)\}\s*$/m);
  if (gm && t.indexOf(gm[0]) < t.indexOf('$$')) group = gm[1];
  while ((m = re.exec(t))) {
    let body = m[1].trim(), label = m[2] || '';
    const inner = body.match(/\s*\{#([^}\s]+)\}\s*$/);
    if (inner) { label = label || inner[1]; body = body.slice(0, inner.index).trim(); }
    if (body) { parts.push(body); labels.push(label); }
  }
  parts.labels = labels;
  parts.group = group;
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
  return { blocks: absorbSectionHeadings(meta, keep), absorbed };
}

/* 1.2.6：用一般 Markdown 標題寫的摘要、致謝、參考文獻。
   使用者只會寫 Markdown，很自然會打「# Abstract」「# Acknowledgments」「# References」。
   REVTeX 這三樣都有官方專用結構（abstract 環境、acknowledgments 環境、書目自帶標題），
   照字面輸出成 \section 會變成重複或孤立的標題（C 報告 L17、L20）：
     · 文件的第一個標題是 Abstract／摘要（且還沒有 revtex-abstract 或 YAML abstract:）
       → 它底下到下一個同級標題之前的內容就是摘要；
     · Acknowledgments 標題 → 底下內容放進 acknowledgments 環境；若緊接 revtex-acknowledgments
       圍欄，只把標題拿掉；
     · References／Bibliography／參考文獻 標題緊接書目圍欄、附錄標記或文件結尾 → 拿掉標題
       （書目由 REVTeX 印在文末，標題由期刊樣式自己決定）。 */
const ABSTRACT_HEAD_RE = /^(abstract|摘要)$/i;
const ACK_HEAD_RE = /^(acknowledge?ments?|致謝|誌謝)$/i;
const REF_HEAD_RE = /^(references?|bibliography|參考文獻|參考書目)$/i;
function absorbSectionHeadings(meta, blocks){
  const headText = b => (b && b.type === 'heading') ? inlineText(b.children).trim().replace(/[:：]$/, '') : null;
  const sectionEnd = (from, depth) => {
    let j = from;
    while (j < blocks.length && !(blocks[j].type === 'heading' && blocks[j].depth <= depth)
           && blocks[j].type !== 'appendix_marker' && blocks[j].type !== 'bibliography') j++;
    return j;
  };
  const out = [];
  const firstHead = blocks.findIndex(b => b.type === 'heading');
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i], t = headText(b);
    if (t === null) { out.push(b); continue; }
    if (i === firstHead && ABSTRACT_HEAD_RE.test(t) && !meta.abstract && !meta.abstractBlocks) {
      const e = sectionEnd(i + 1, b.depth);
      meta.abstractBlocks = blocks.slice(i + 1, e);
      i = e - 1; continue;
    }
    if (ACK_HEAD_RE.test(t)) {
      const next = blocks[i + 1];
      if (next && next.type === 'acknowledgments') continue;          // 圍欄自帶，只拿掉標題
      const e = sectionEnd(i + 1, b.depth);
      out.push({ id: b.id, type: 'acknowledgments', line: b.line, blocks: blocks.slice(i + 1, e) });
      i = e - 1; continue;
    }
    if (REF_HEAD_RE.test(t)) {
      const next = blocks[i + 1];
      if (!next || next.type === 'bibliography' || next.type === 'appendix_marker') continue;
    }
    out.push(b);
  }
  return out;
}

/* ---------- 區塊層的小工具（1.2.6）---------- */

/* Pandoc 式屬性區塊 {#id .unnumbered -}：回傳 {label, unnumbered, wide, width} 或 null。 */
function parseAttrBlock(s){
  const m = String(s || '').match(/^\{([^{}]*)\}$/);
  if (!m) return null;
  const out = { label:'', unnumbered:false, wide:false, width:'' };
  for (const tok of m[1].trim().split(/\s+/).filter(Boolean)) {
    if (tok[0] === '#') out.label = tok.slice(1);
    else if (tok === '-' || tok === '.unnumbered' || tok === '.nonumber') out.unnumbered = true;
    else if (tok === 'wide' || tok === '.wide') out.wide = true;
    else if (/^width=/.test(tok)) out.width = tok.slice(6).replace(/^["']|["']$/g, '');
    else if (/^[.\w-]+=/.test(tok) || tok[0] === '.') { /* 其他屬性：忽略 */ }
    else return null;
  }
  return out;
}
/* 公式本體尾端的 {#eq:x}／{-}（寫在收尾 $$ 之前也算，B-09）。 */
function splitMathAttrs(tex){
  let body = String(tex || '').trim(), label = '', unnumbered = false;
  for (;;) {
    const m = body.match(/\s*(\{[^{}]*\})\s*$/);
    const a = m ? parseAttrBlock(m[1]) : null;
    if (!a || (!a.label && !a.unnumbered)) break;
    if (a.label) label = label || a.label;
    if (a.unnumbered) unnumbered = true;
    body = body.slice(0, m.index).trim();
  }
  if (!label) { const lab = body.match(/\\label\{([^}]*)\}/); if (lab) label = lab[1]; }
  return { tex: body, label, unnumbered };
}
/* 從第 i 行讀一個展示公式區塊（$$…$$ 或 \[…\]）。
   同一行就收尾、但收尾後面還有一般文字（不是 {…} 屬性）→ 回 null，交給段落。 */
function readDisplayMath(lines, i){
  const t = expandTabs(lines[i]).trim();
  const open = t.startsWith('\\[') ? '\\[' : '$$';
  const close = open === '\\[' ? '\\]' : '$$';
  const first = t.slice(open.length);
  const p = first.indexOf(close);
  let tex = '', after = '', j = i;
  if (p >= 0) {
    tex = first.slice(0, p);
    after = first.slice(p + close.length).trim();
    if (after && !/^(\{[^{}]*\}\s*)+$/.test(after)) return null;
  } else {
    const inner = first.trim() ? [first] : [];
    j = i + 1;
    while (j < lines.length) {
      const cur = expandTabs(lines[j]).trim();
      const q = cur.indexOf(close);
      if (q >= 0 && (q + close.length === cur.length || /^(\s*\{[^{}]*\})+\s*$/.test(cur.slice(q + close.length)))) {
        inner.push(cur.slice(0, q)); after = cur.slice(q + close.length).trim(); break;
      }
      inner.push(lines[j]); j++;
    }
    tex = inner.join('\n');
  }
  const dm = splitMathAttrs(tex + (after ? ' ' + after : ''));
  return { tex: dm.tex, label: dm.label, unnumbered: dm.unnumbered, next: j + 1 };
}
/* ATX 標題：與左邊 RE.h 同一條規則——# 後面可以不接空白（#Heading，左邊的 Loose
   模式），結尾的 # 串前面必須有空白才算收尾（C# 的 # 要留著，B-23）；
   {#label} 與 {-} 可以寫在收尾 # 串的前面或後面（A-28）。 */
function matchAtxHeading(t){
  const m = String(t).match(/^(#{1,6})(?:[ \t]+|(?=[^#\s]))(.*)$/) || String(t).match(/^(#{1,6})[ \t]*$/);
  if (!m) return null;
  let text = (m[2] || '').trim(), label = '', unnumbered = false;
  const strip = () => {
    let changed = true;
    while (changed) {
      changed = false;
      const am = text.match(/\s*(\{[^{}]*\})\s*$/);
      const a = am ? parseAttrBlock(am[1]) : null;
      if (a) { if (a.label) label = label || a.label; if (a.unnumbered) unnumbered = true; text = text.slice(0, am.index).trimEnd(); changed = true; }
    }
  };
  strip();
  if (/^#+$/.test(text)) text = '';
  else text = text.replace(/[ \t]+#+[ \t]*$/, '');
  strip();
  return { depth: m[1].length, text, label, unnumbered };
}
/* 這一行能不能打斷段落（與左邊「每行獨立判斷區塊」的結果對齊，B-34）。 */
function startsBlock(lines, j){
  const cur = expandTabs(lines[j]), ct = cur.trim();
  if (!ct) return true;
  if (matchAtxHeading(ct) || /^(```+|~~~+)/.test(ct) || /^>/.test(ct)) return true;
  if (/^(\s*)([-+*]|\d+[.)])\s+/.test(cur)) return true;
  if (ct.startsWith('$$') || ct.startsWith('\\[')) return true;
  if (/^([*\-_])\s*(\1\s*){2,}$/.test(ct)) return true;
  if (/^\[\^[^\]]+\]:/.test(ct)) return true;                          // 腳註定義
  if (isTableStart(lines, j)) return true;                             // 表格
  if (isStandaloneImageLine(ct)) return true;                          // 獨立一行的圖片
  return false;
}
function isTableStart(lines, j){
  const t = expandTabs(lines[j] || '').trim();
  const nx = lines[j + 1];
  return !!(t.includes('|') && nx !== undefined && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(expandTabs(nx)) && /-/.test(nx));
}
function isStandaloneImageLine(t){
  if (parseHtmlImageTag(t)) return true;
  if (!t.startsWith('![')) return false;
  const m = matchLink(t, 1);
  if (!m) return false;
  const tail = t.slice(m.end).trim();
  return !tail || !!parseAttrBlock(tail);
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
    /* 1.2.6：收尾圍欄改用左邊編輯器同一條規則（markdownFenceClose）：同種字元、
       長度不少於開頭、後面不能再接文字。舊版只看「以開頭字串起頭」，
       ```python 這種行會被誤認成收尾。 */
    const fence = t.match(/^(```+|~~~+)\s*([^\s`]*)\s*(.*)$/);
    if (fence) {
      const fch = fence[1][0], flen = fence[1].length;
      const closeRe = new RegExp('^\\s{0,3}' + (fch === '`' ? '`' : '~') + '{' + flen + ',}[ \\t]*$');
      const lang = (fence[2] || '').toLowerCase();
      const body = [];
      let j = i + 1;
      while (j < L && !closeRe.test(expandTabs(lines[j]))) { body.push(lines[j]); j++; }
      let node;
      if (lang === 'tex' || lang === 'latex') node = { type: 'raw_tex', value: body.join('\n'), line: srcLine(i) };
      /* ```math／```katex：左邊畫面當展示公式（01.js），右邊也一樣（B-18）。 */
      else if (lang === 'math' || lang === 'katex') {
        const dm = splitMathAttrs(body.join('\n').trim());
        node = { type: 'math_block', tex: dm.tex, label: dm.label, unnumbered: dm.unnumbered, line: srcLine(i) };
      }
      else node = { type: 'code_block', lang, value: body.join('\n'), meta: fence[3] || '', line: srcLine(i) };
      node.id = nid('b');
      blocks.push(node);
      i = j + 1; continue;
    }

    // 展示數學 $$ … $$ 或 \[ … \]
    if (t.startsWith('$$') || t.startsWith('\\[')) {
      const dm = readDisplayMath(lines, i);
      if (dm) {
        blocks.push({ id: nid('b'), type: 'math_block', tex: dm.tex, label: dm.label,
                      unnumbered: dm.unnumbered, line: srcLine(i) });
        i = dm.next; continue;
      }
      /* $$x=1$$ 後面同一行還有文字：不是獨立公式區塊，交給下面的段落解析
         （段落內的 $$ … $$ 會變成句中展示公式）。舊版會一路吞到下一個 $$（B-24）。 */
    }

    // ATX 標題
    const atx = matchAtxHeading(t);
    if (atx) {
      blocks.push({ id: nid('b'), type: 'heading', depth: atx.depth,
                    children: parseInline(atx.text),
                    label: atx.label, unnumbered: atx.unnumbered, line: srcLine(i) });
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
      /* 1.2.6：懶惰續行（B-36）。「> quote」下一行沒有 > 但仍是一般文字時，
         CommonMark 與左邊畫面都把它併進同一個引用段落。 */
      while (j < L) {
        const cl = expandTabs(lines[j]);
        if (/^\s*>/.test(cl)) { body.push(cl.replace(/^\s*>\s?/, '')); j++; continue; }
        const prev = body[body.length - 1];
        if (cl.trim() && prev !== undefined && prev.trim() && !startsBlock(lines, j)) { body.push(cl.trim()); j++; continue; }
        break;
      }
      blocks.push({ id: nid('b'), type: 'blockquote', children: parseBlocks(body, lineOffset + i), line: srcLine(i) });
      i = j; continue;
    }

    // 表格（GFM）
    if (isTableStart(lines, i)) {
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
      /* caption：表格後的「: 說明」或 Pandoc 的「Table: 說明」，緊接或隔一個空行都接受
         （L15、T09）。{#tbl:x} 寫在說明尾端。 */
      let caption = '', label = '';
      {
        let k = j;
        if (k < L && !expandTabs(lines[k]).trim() && k + 1 < L) k++;
        const cm = k < L ? expandTabs(lines[k]).trim().match(/^(?:Table)?:\s*(.+)$/) : null;
        if (cm) {
          caption = cm[1];
          const am = caption.match(/\s*(\{[^{}]*\})\s*$/);
          const a = am ? parseAttrBlock(am[1]) : null;
          if (a) { label = a.label; caption = caption.slice(0, am.index).trim(); }
          j = k + 1;
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

    /* 縮排程式碼先於清單判斷（B-35）：左邊畫面與 CommonMark 都是這個順序——
       空行之後縮排四格以上的「* x」是程式碼，不是清單。段落的續行在下面的段落
       迴圈就被吃掉了，走不到這裡，所以不會把段落內縮排的行誤判成程式碼。 */
    if (/^ {4,}\S/.test(line)) {
      const body = []; let j = i;
      while (j < L && (/^ {4,}/.test(expandTabs(lines[j])) || !expandTabs(lines[j]).trim())) { body.push(expandTabs(lines[j]).slice(4)); j++; }
      while (body.length && !body[body.length - 1].trim()) body.pop();
      blocks.push({ id: nid('b'), type: 'code_block', lang: '', value: body.join('\n'), meta: '', line: srcLine(i) });
      i = j; continue;
    }

    // 清單
    const li = line.match(/^(\s*)([-+*]|\d+[.)])\s+(.*)$/);
    if (li) {
      const res = parseList(lines, i, lineOffset);
      blocks.push(res.node); i = res.next; continue;
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
      const a = tail ? parseAttrBlock(tail) : { label:'', wide:false, width:'' };
      if (a) {
        /* {width=50%}：Pandoc 寫法，等同圖片工具列的縮放比例（B-30）。 */
        const wm = String(a.width || '').match(/^([0-9]*\.?[0-9]+)\s*%$/);
        const scale = wm ? Math.max(0.05, Math.min(4, parseFloat(wm[1]) / 100)) : 1;
        blocks.push({ id:nid('b'), type:'figure', src:mdImg.dest,
                      caption:mdImg.label ? parseInline(mdImg.label) : null,
                      label:a.label || '',
                      wide:a.wide || /\*\s*$/.test(mdImg.title || ''),
                      scale, scaleExplicit:!!wm, sourceSyntax:'markdown', line:srcLine(i) });
        i++; continue;
      }
    }

    // 段落：保留行尾兩空白，讓 parseInline 能輸出真正的 LaTeX hard break。
    /* 1.2.6：段落的中斷條件與左邊畫面對齊（B-34）——表格、腳註定義、獨立一行的
       圖片也會打斷段落（左邊每一行獨立判斷區塊，使用者看到的就是這樣）。 */
    const para = [];
    let j = i;
    while (j < L) {
      const cur = (j === i ? line : expandTabs(lines[j]));
      const ct = cur.trim();
      if (!ct) break;
      if (j > i && startsBlock(lines, j)) break;
      para.push(cur.replace(/^\s+/, '')); j++;
    }
    blocks.push({ id:nid('b'), type:'paragraph', children:parseInline(para.join('\n')),
                  noindent, line:srcLine(i) });
    i = j;
  }
  return blocks;
}

/* 表格切欄：與左邊編輯器 splitTableRow（02.js）同一個狀態機——行內程式碼與數學
   裡的 | 不切；\| 是字面的 |；\\ 是一個反斜線。1.2.6 起兩邊都改用「有效的數學
   才保護」：$ 必須照 Pandoc 規則有合格的收尾（inlineMathClose），所以
   「| cost $5 | price $6 |」切成兩格（B-25），$$x|y$$ 不會被切開（B-10），
   `a|b` 不會被切開（B-33）。 */
function splitRow(line){
  const raw = String(line), out = [];
  let cur = '', codeRun = 0;
  for (let k = 0; k < raw.length; k++) {
    const ch = raw[k];
    if (ch === '\\') {
      if (raw[k + 1] === '\\') { cur += '\\\\'; k++; continue; }
      if (raw[k + 1] === '|') { cur += '|'; k++; continue; }
      cur += ch; continue;
    }
    if (ch === '`') {
      let j = k; while (raw[j] === '`') j++;
      const n = j - k;
      if (!codeRun) codeRun = n; else if (codeRun === n) codeRun = 0;
      cur += raw.slice(k, j); k = j - 1; continue;
    }
    if (ch === '$' && !codeRun) {
      const e = raw[k + 1] === '$' ? displayMathClose(raw, k) : inlineMathClose(raw, k);
      if (e > 0) {
        const endAt = raw[k + 1] === '$' ? e + 2 : e + 1;
        cur += raw.slice(k, endAt); k = endAt - 1; continue;
      }
      cur += ch; continue;
    }
    if (ch === '|' && !codeRun) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  if (/^\s*\|\s*$/.test(raw) && out.length === 2) return out;
  if (/^\s*\|/.test(raw) && out.length && out[0] === '') out.shift();
  if (/\|\s*$/.test(raw) && out.length && out[out.length - 1] === '') out.pop();
  return out;
}

function parseList(lines, start, lineOffset){
  const first = expandTabs(lines[start]).match(/^(\s*)([-+*]|\d+[.)])\s+(.*)$/);
  const baseIndent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const sameKind = mk => /\d/.test(mk) === ordered;
  const items = [];
  let i = start;
  const L = lines.length;
  let curBody = null, lastBlank = false;

  while (i < L) {
    const raw = expandTabs(lines[i]);
    const t = raw.trim();
    const m = raw.match(/^(\s*)([-+*]|\d+[.)])\s+(.*)$/);
    if (m && m[1].length === baseIndent) {
      /* 有序與無序清單接在一起時是兩個清單（A-27），不能併成同一個 itemize。 */
      if (!sameKind(m[2])) break;
      if (curBody) items.push(curBody);
      let content = m[3];
      let task = null;
      const tm = content.match(/^\[([ xX])\]\s+(.*)$/);
      if (tm) { task = tm[1].toLowerCase() === 'x'; content = tm[2]; }
      curBody = { lines: [content], task };
      lastBlank = false; i++; continue;
    }
    if (!t) {
      // 空行：看下一非空行是否仍屬本清單
      let k = i + 1;
      while (k < L && !expandTabs(lines[k]).trim()) k++;
      if (k >= L) break;
      const nk = expandTabs(lines[k]);
      const nm = nk.match(/^(\s*)([-+*]|\d+[.)])\s+/);
      const cont = (nm && (nm[1].length > baseIndent || (nm[1].length === baseIndent && sameKind(nm[2]))))
                || (/^\s{2,}\S/.test(nk) && nk.match(/^ */)[0].length > baseIndent);
      if (!cont) break;
      if (curBody) curBody.lines.push('');
      lastBlank = true; i++; continue;
    }
    if (m && m[1].length > baseIndent) { if (curBody) curBody.lines.push(raw.slice(baseIndent + 2)); lastBlank = false; i++; continue; }
    if (raw.match(/^ */)[0].length > baseIndent) { if (curBody) curBody.lines.push(raw.slice(Math.min(baseIndent + 2, raw.match(/^ */)[0].length))); lastBlank = false; i++; continue; }
    /* 懶惰續行（B-36）：項目文字下一行沒有縮排、也不是新的區塊開頭，
       CommonMark 與左邊畫面都把它併進同一個項目，清單不會被拆成兩個。 */
    if (curBody && !lastBlank && !startsBlock(lines, i)) { curBody.lines.push(t); i++; continue; }
    break;
  }
  if (curBody) items.push(curBody);

  const node = {
    id: nid('b'), type: 'list', ordered,
    start: ordered ? (Number.isFinite(parseInt(first[2], 10)) ? parseInt(first[2], 10) : 1) : null,
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
    if (n.blocks) walk(n.blocks, fn);                         // 用標題寫的致謝（1.2.6）
    if (n.type === 'list' && n.items) for (const it of n.items) walk(it.children, fn);
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

/* 1.2.6：摘要、致謝等「散文欄位」的 Markdown 片段也走同一套區塊＋行內解析
   （發射器用它處理 revtex-abstract、revtex-acknowledgments、YAML abstract:）。 */
function parseFragment(md){
  const lines = String(md == null ? '' : md).replace(/\r\n?/g, '\n').split('\n');
  return parseBlocks(lines, 0);
}

K.register('parser', {
  parse, parseInline, parseFragment, parityDigest, walk, inlineText, plainText,
  splitRow, inlineMathClose,
  version: '1.2.6'
});
K.log.info('parser', 'CP171 獨立解析器就緒（隔離：不讀 DOM、不呼叫既有解析器）');
})();
