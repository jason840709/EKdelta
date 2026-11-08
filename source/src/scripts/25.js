
/* ============================================================================
 * cp171-58-papertools — Markdown 編輯器 · 論文工具（格式列右側的 REV／TW）
 *
 * 為什麼要有這個東西（使用者原話）：
 *   「我們本來做這個程式碼的初衷，就是希望讓使用者不必去學習這些複雜的
 *     LaTeX 語法，結果現在我們自己又設計了一套語法出來，這樣並不是很好。」
 *
 * 1.2.8 重構（M36，Jason 11-08：「當初 ChatGPT 感覺只是應付了事」）：
 *   · 面板改成「左邊分類清單、右邊表單」，外觀與偏好設定同一套。分類依寫論文的順序。
 *   · 文件裡只會有一份的區塊（前置區、摘要、致謝、參考文獻、封面、審定書、版權頁、關鍵字）：
 *     打開時讀回文件裡現有的內容，按「更新」直接改原本那一份。以前每次都插入新的一份，
 *     轉換時書目只取最後一份、作者清單被覆蓋、摘要只取第一份。
 *   · 目錄、附錄這類標記已經在文件裡時，主要按鈕變成「跳到該處」，不再插第二份。
 *   · 引用：列出文件裡的參考文獻勾選；交叉引用：列出文件裡設過標籤的圖、表、公式、章節。
 *   · 修正：臺灣論文圖說改成排版程式認得的「**圖 2.1：**說明」（以前產生的「圖 1. 說明」不會被當成圖說）；
 *     國際論文插圖的圖說改成單行（換行會讓插圖失效）；封面不再讓人選語言（由目前模式決定）；
 *     關鍵字顯示個數（排版要求 5–7 個）。
 *   · 打開面板時記下游標位置，插入時回到那裡（以前在表單裡打字後，選取跑到表單，內容被插到文件最後）。
 *   · 國際論文模式只顯示 REV，臺灣論文模式只顯示 TW；一般 Markdown 模式兩個都留（網站導覽在 Markdown 模式示範兩者）。
 *
 * 邊界（隔離規約）：
 *   · 只寫 #cp171-ptools 這棵子樹與工具列裡自己插入的那一段
 *   · 改文件一律走宿主的區塊操作（pushUndo、insertBlockAfter、removeBlockAt、rerender、onEdited）
 *     或原始碼模式的 srcReplaceRange，保留復原；不自己維護第二份文件模型
 *   · tbBuild() 會把整條工具列 textContent='' 重建，所以靠 MutationObserver 補回自己那一段
 * ========================================================================== */
(() => {
'use strict';
const K = window.__CP171__;
if (!K) { console.error('[CP171] papertools: kernel not ready'); return; }
try {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function'
      || typeof document.createElement('div').querySelector !== 'function') return;
} catch (_) { return; }

const PANEL_ID = 'cp171-ptools';
const MOUNT_CLASS = 'cp171-ptools-group';

/* ★ 判斷語言一律讀 DOM：宿主的 settings／TT 是 IIFE 或 const，模組看不到 window 上的版本。
   setLang() 會寫 document.documentElement.lang 與 body.lang-en。 */
const zhEN = () => {
  try {
    if (document.body && document.body.classList.contains('lang-en')) return true;
    const l = document.documentElement && document.documentElement.lang;
    return typeof l === 'string' && l.toLowerCase().indexOf('en') === 0;
  } catch (_) { return false; }
};
const T = (zh, en) => (zhEN() ? en : zh);
const P = pair => (pair ? T(pair[0], pair[1]) : '');
/* OUT() 是明示的排除標記：被它包住的中文是「要寫進使用者文件的內容」，不是介面文字，
   不能進 i18n 字典（否則英文介面下文件裡會冒出英文記號）。i18n 稽核認得這個標記並跳過。 */
const OUT = s => s;

const esc = s => String(s == null ? '' : s).replace(/\r/g, '').trim();
const oneLine = s => esc(s).replace(/\s*\n+\s*/g, ' ');
const lines = arr => arr.filter(x => x !== null && x !== undefined && x !== '').join('\n');
const nonEmptyRows = rows => (rows || []).filter(r => Object.keys(r).some(k => k !== '__extra' && esc(r[k])));

/* ---------- 讀文件 ----------------------------------------------------------
 * 宿主的文件模型是 blocks（每一行或每個多行結構一塊，空行也是一塊，join('\n') 就是全文）。
 * 原始碼模式以 textarea 為準，用宿主的 splitToBlocks 切成同樣的塊。 */
function srcMode(){ try { return !!(settings && settings.srcmode); } catch (_) { return false; } }
function docBlocks(){
  try {
    if (srcMode()) return splitToBlocks(String(srcview.value || ''));
    const arr = blocks.slice();
    if (activeIndex >= 0 && editor.children[activeIndex]) arr[activeIndex] = getRawText(editor.children[activeIndex]);
    return arr;
  } catch (_) { return []; }
}
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})[ \t]*([A-Za-z0-9_-]+)[ \t]*$/;
const fenceLang = b => { const m = String(b || '').split('\n', 1)[0].match(FENCE_OPEN); return m ? m[2].toLowerCase() : ''; };
function fenceBody(b){
  const ls = String(b || '').split('\n'); ls.shift();
  if (ls.length && /^ {0,3}(`{3,}|~{3,})\s*$/.test(ls[ls.length - 1])) ls.pop();
  return ls.join('\n');
}
const findFence = (arr, re) => { for (let i = 0; i < arr.length; i++) if (re.test(fenceLang(arr[i]))) return i; return -1; };
const fenceLoc = re => arr => { const i = findFence(arr, re); return i < 0 ? null : { i, j: i, text: arr[i] }; };

const FENCES = {
  revFront: /^revtex-front-?matter$/, revAbstract: /^revtex-abstract$/, revAck: /^revtex-acknowledge?ments$/,
  revBib: /^revtex-(bibliography|bib)$/, revAppendix: /^revtex-appendi(x|ces)$/,
  twCover: /^(twthesis|twthesis2)-(titlepage|cover|meta)$/, twApproval: /^(twthesis|twthesis2)-(approval|approvalpage|approval-form)$/,
  twTitleback: /^(twthesis|twthesis-en)-(titleback|title-back)$/,
  twToc: /^twthesis-toc$/, twLof: /^twthesis-lof$/, twLot: /^twthesis-lot$/, twAppendix: /^twthesis-appendix$/
};

/* 「key: value」行。第一個冒號（半形或全形）分開鍵與值；認不得的行原樣保留在 __extra。 */
function kvParse(body, map){
  const v = { __extra: [], __keys: {} };
  for (const raw of String(body || '').split('\n')) {
    if (!raw.trim()) continue;
    const m = raw.match(/^\s*([^:：]+?)\s*[:：]\s*(.*)$/);
    const f = m ? map[m[1].trim().toLowerCase()] : null;
    if (f && (v[f] === undefined || v[f] === '')) { v[f] = m[2].trim(); v.__keys[f] = m[1].trim(); }
    else v.__extra.push(raw);
  }
  return v;
}
const extraLines = v => (Array.isArray(v && v.__extra) ? v.__extra : []);
/* 更新時沿用文件原本的鍵名寫法（例如英文範本的「Author:」），只改內容。 */
const keyName = (v, f, def) => (v && v.__keys && v.__keys[f]) || def;

/* 國際論文前置區：作者後面的 affil／email／thanks 屬於那位作者；affiliations: 下面的「- 」是機構清單。
   認不得的鍵（orcid、homepage、altaffiliation…）跟著所屬作者原樣保留；第一位作者之前的放在作者前面
   （出現在任何作者之前的 affiliation 是全體共用，位置不能動）。 */
function parseFront(body){
  const v = { title: '', collaboration: '', affils: [], authors: [], keywords: '', pacs: '', preprint: '', date: '', __extra: [] };
  let cur = null, inAff = false;
  for (const raw of String(body || '').split('\n')) {
    if (!raw.trim()) continue;
    const li = raw.match(/^\s*-\s+(.*)$/);
    if (inAff && li) { v.affils.push({ name: li[1].trim() }); continue; }
    inAff = false;
    const m = raw.match(/^\s*([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    const bag = cur ? cur.__extra : v.__extra;
    if (!m) { bag.push(raw); continue; }
    const k = m[1].toLowerCase(), val = m[2].trim();
    if (k === 'affiliations') { inAff = true; if (val) val.split(/\s*;\s*/).forEach(x => { if (x.trim()) v.affils.push({ name: x.trim() }); }); continue; }
    if (k === 'author') { cur = { name: val, affil: '', email: '', thanks: '', __extra: [] }; v.authors.push(cur); continue; }
    if (cur && ['affil', 'affiliation-index', 'affilnum'].includes(k) && !cur.affil) { cur.affil = val; continue; }
    if (cur && k === 'affiliation' && !cur.affil && !v.affils.length) { cur.affil = val; continue; }
    if (cur && (k === 'email' || k === 'thanks') && !cur[k]) { cur[k] = val; continue; }
    if (['title', 'collaboration', 'keywords', 'pacs', 'preprint', 'date'].includes(k) && !v[k]) { v[k] = val; continue; }
    bag.push(raw);
  }
  /* 舊寫法把單位全名寫在每位作者後面（affiliation:）。讀回時整理成「單位清單＋編號」：轉換程式兩種寫法都認，
     編號照第一次出現的順序，輸出相同；表單上就能一個單位只填一次。 */
  if (!v.affils.length) {
    const list = [];
    for (const a of v.authors) {
      const texts = a.affil ? [a.affil] : [];
      a.__extra = a.__extra.filter(raw => { const m = raw.match(/^\s*affiliation\s*:\s*(.+)$/i); if (m) { texts.push(m[1].trim()); return false; } return true; });
      if (texts.length) a.affil = texts.map(t => { let i = list.indexOf(t); if (i < 0) { list.push(t); i = list.length - 1; } return i + 1; }).join(',');
    }
    v.affils = list.map(name => ({ name }));
  }
  if (!v.affils.length) v.affils = [Object.create(null)];
  if (!v.authors.length) v.authors = [Object.create(null)];
  return v;
}

/* 參考文獻：國際論文在 ```revtex-bibliography 裡一行一筆；臺灣論文是一段一筆「[N] 內容」。 */
const REF_LINE = /^\s*\[(\d{1,4})\]\s+(.+)$/;
/* 國際論文的參考文獻有兩種寫法，轉換程式（17.js）依多數決：「[1] 內容」用 [[1]] 引用；「鍵: 內容」用 [@鍵] 引用。 */
const BIB_NUM = /^\s*(?:\[(\d+)\]|(\d+)[.)])\s+(.+)$/, BIB_KEY = /^\s*([A-Za-z][A-Za-z0-9_:.\-]*)\s*:\s*(.+)$/;
function bibStyleOf(body){
  const ls = String(body || '').split('\n').filter(l => l.trim());
  let num = 0, key = 0; for (const l of ls) { if (BIB_NUM.test(l)) num++; else if (BIB_KEY.test(l)) key++; }
  return key > num && key >= Math.ceil(ls.length / 2) ? 'key' : 'num';
}
function revBib(){
  const arr = docBlocks(), i = findFence(arr, FENCES.revBib);
  if (i < 0) return { style: 'num', refs: [] };
  const body = fenceBody(arr[i]), style = bibStyleOf(body), refs = [];
  for (const l of body.split('\n')) {
    const m = style === 'key' ? l.match(BIB_KEY) : l.match(BIB_NUM);
    if (m) refs.push(style === 'key' ? { key: m[1], text: m[2].trim() } : { n: Number(m[1] || m[2]), text: m[3].trim() });
  }
  return { style, refs };
}
const revRefs = () => revBib().refs.filter(r => r.n);
const XREF_PREFIX = /^(fig|figure|tbl|tab|table|eq|eqn|equation|sec|section|lst|listing|thm|theorem|alg|algorithm|app|appendix):/i;
function twRefRegion(arr){
  let a = -1, b = -1;
  for (let i = 0; i < arr.length; i++) if (REF_LINE.test(arr[i])) { if (a < 0) a = i; b = i; }
  if (a < 0) return null;
  for (let i = a; i <= b; i++) if (arr[i].trim() && !REF_LINE.test(arr[i])) return { i: a, j: b, mixed: true };
  return { i: a, j: b, text: arr.slice(a, b + 1).join('\n') };
}
function twRefs(){
  return docBlocks().map(b => b.match(REF_LINE)).filter(Boolean).map(m => ({ n: Number(m[1]), text: m[2].trim() }));
}
/* 把 [1,2,3,5] 寫成 1-3,5（排版與轉換都認得連號）。 */
function compressNums(nums){
  const s = [...new Set(nums.map(Number).filter(n => n > 0))].sort((a, b) => a - b), out = [];
  for (let i = 0; i < s.length; i++) {
    let j = i; while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(j - i >= 2 ? s[i] + '-' + s[j] : (j > i ? s[i] + ',' + s[j] : String(s[i])));
    i = j;
  }
  return out.join(',');
}

/* 交叉引用：文件裡設過標籤的圖、表、公式、章節。 */
function revLabels(){
  const out = [];
  for (const b of docBlocks()) {
    let m;
    if ((m = b.match(/^!\[([^\]]*)\]\([^)]*\)\s*\{([^}]*)\}\s*$/))) { const id = (m[2].match(/#([^\s}]+)/) || [])[1]; if (id) out.push({ id, kind: 'fig', text: m[1] }); continue; }
    if ((m = b.match(/^(?:Table)?:\s*(.*?)\s*\{[^}]*#([^\s}]+)[^}]*\}\s*$/))) { out.push({ id: m[2], kind: 'tab', text: m[1] }); continue; }
    if ((m = b.match(/^#{1,6}\s+(.*?)\s*\{[^}]*#([^\s}]+)[^}]*\}\s*$/))) { out.push({ id: m[2], kind: 'sec', text: m[1] }); continue; }
    if (/^\s*\$\$/.test(b) && (m = b.match(/\$\$\s*\{[^}]*#([^\s}]+)[^}]*\}\s*$/))) { out.push({ id: m[1], kind: 'eq', text: b.replace(/\$\$\s*\{[^}]*\}\s*$/, '').replace(/\$\$/g, '').trim() }); }
  }
  return out;
}

/* 臺灣論文文件語言：模式已經決定就照模式；一般 Markdown 模式看文件內容猜。 */
function twEnglish(){
  try { if (typeof isTwThesisEnglishTheme === 'function' && isTwThesisEnglishTheme()) return true; } catch (_) {}
  try { if (typeof isTwThesisTheme === 'function' && isTwThesisTheme()) return false; } catch (_) {}
  return docBlocks().some(b => FENCES.twTitleback.test(fenceLang(b)) || /^#\s+(Chinese Abstract|Acknowledg)/i.test(b));
}
function docMode(){
  try { if (K.isIntlMode && K.isIntlMode()) return 'intl'; } catch (_) {}
  try { if (typeof isTwThesisTheme === 'function' && isTwThesisTheme()) return 'tw'; } catch (_) {}
  return 'markdown';
}

/* ---------- 工具定義 --------------------------------------------------------
 * { id, cat, short, title, hint?, fields[], build(v),
 *   inline?   插在游標處（引用、交叉引用），否則插在游標所在段落後面
 *   single?   { find(arr)→{i,j,text}|null, read(text)→values }：文件裡只會有一份，讀回並更新
 *   marker?   (arr)→index：純標記，已存在就改成「跳到該處」
 *   prepare?  (v) 依文件設定預設值；extra?(box,v) 表單後面的自訂內容；visible?() }
 * 欄位：text／textarea／check／select／list（幾個短欄位並排的重複列）／entrylist（一筆一段的清單）／table
 * ------------------------------------------------------------------------ */
const REV_CATS = [['info', ['論文資訊', 'Paper']], ['write', ['寫作時插入', 'While writing']],
                  ['layout', ['特殊版面', 'Special layout']], ['refs', ['文獻與附錄', 'References and appendix']]];
const TW_CATS = [['front', ['封面與前置', 'Cover and front matter']], ['toc', ['目錄', 'Contents']],
                 ['write', ['寫作時插入', 'While writing']], ['refs', ['文獻與附錄', 'References and appendix']]];

const REVTEX_TOOLS = [
  {
    id: 'frontmatter', cat: 'info',
    short: ['標題與作者', 'Title and authors'],
    title: ['標題、作者與單位', 'Title, authors and affiliations'],
    hint: ['單位列一次，作者用編號指過去（例如 1 或 1,3）。', 'List affiliations once and point authors to them by number (e.g. 1 or 1,3).'],
    single: { find: fenceLoc(FENCES.revFront), read: t => parseFront(fenceBody(t)) },
    fields: [
      { k: 'title', type: 'text', label: ['標題', 'Title'] },
      { k: 'affils', type: 'list', label: ['單位', 'Affiliations'], addLabel: ['新增單位', 'Add affiliation'], numbered: true,
        rows: [{ k: 'name', type: 'text', label: ['單位名稱', 'Affiliation'], grow: true,
                 ph: ['Department of Physics, National Sun Yat-sen University, Kaohsiung 80424, Taiwan', 'Department of Physics, National Sun Yat-sen University, Kaohsiung 80424, Taiwan'] }] },
      { k: 'authors', type: 'list', label: ['作者', 'Authors'], addLabel: ['新增作者', 'Add author'],
        rows: [
          { k: 'name', type: 'text', label: ['姓名', 'Name'], grow: true },
          { k: 'affil', type: 'text', label: ['單位編號', 'Affil. no.'], w: 76, ph: ['1,3', '1,3'] },
          { k: 'email', type: 'text', label: ['信箱（選填）', 'Email (optional)'], w: 136 },
          { k: 'thanks', type: 'text', label: ['註記（選填）', 'Note (optional)'], w: 120 }
        ] },
      { k: 'keywords', type: 'text', label: ['關鍵字（分號隔開）', 'Keywords (semicolon separated)'] },
      { k: 'collaboration', type: 'text', label: ['合作團隊（選填）', 'Collaboration (optional)'] },
      { k: 'preprint', type: 'text', label: ['預印本編號（選填）', 'Preprint number (optional)'] },
      { k: 'pacs', type: 'text', label: ['PACS（選填）', 'PACS (optional)'] },
      { k: 'date', type: 'text', label: ['日期（留空用編譯當天）', 'Date (blank: today)'] }
    ],
    build(v) {
      const out = [];
      if (esc(v.title)) out.push('title: ' + oneLine(v.title));
      if (esc(v.collaboration)) out.push('collaboration: ' + oneLine(v.collaboration));
      const affils = nonEmptyRows(v.affils);
      if (affils.length) { out.push('affiliations:'); for (const a of affils) out.push('  - ' + oneLine(a.name)); }
      out.push(...extraLines(v));
      for (const a of nonEmptyRows(v.authors)) {
        if (!esc(a.name)) continue;
        out.push('author: ' + oneLine(a.name));
        if (esc(a.thanks)) out.push('thanks: ' + oneLine(a.thanks));
        if (esc(a.email)) out.push('email: ' + oneLine(a.email));
        /* 有單位清單就寫編號（affil:），沒有就把整串當單位名稱，免得只填作者時什麼都產不出來。 */
        if (esc(a.affil)) out.push(affils.length ? 'affil: ' + esc(a.affil).replace(/\s+/g, '') : 'affiliation: ' + oneLine(a.affil));
        out.push(...extraLines(a));
      }
      if (esc(v.keywords)) out.push('keywords: ' + oneLine(v.keywords));
      if (esc(v.pacs)) out.push('pacs: ' + oneLine(v.pacs));
      if (esc(v.preprint)) out.push('preprint: ' + oneLine(v.preprint));
      if (esc(v.date)) out.push('date: ' + oneLine(v.date));
      return out.length ? '```revtex-frontmatter\n' + lines(out) + '\n```' : '';
    }
  },
  {
    id: 'abstract', cat: 'info',
    short: ['摘要', 'Abstract'], title: ['摘要', 'Abstract'],
    hint: ['空一行是新的一段。', 'A blank line starts a new paragraph.'],
    single: { find: fenceLoc(FENCES.revAbstract), read: t => ({ body: fenceBody(t) }) },
    fields: [{ k: 'body', type: 'textarea', rows: 9, label: ['摘要內文', 'Abstract'] }],
    build(v) { return esc(v.body) ? '```revtex-abstract\n' + esc(v.body) + '\n```' : ''; }
  },
  {
    id: 'ack', cat: 'info',
    short: ['致謝', 'Acknowledgments'], title: ['致謝', 'Acknowledgments'],
    hint: ['排在正文之後、附錄與參考文獻之前。', 'Placed after the body, before the appendix and references.'],
    single: { find: fenceLoc(FENCES.revAck), read: t => ({ body: fenceBody(t) }) },
    fields: [{ k: 'body', type: 'textarea', rows: 6, label: ['致謝內文', 'Acknowledgments'] }],
    build(v) { return esc(v.body) ? '```revtex-acknowledgments\n' + esc(v.body) + '\n```' : ''; }
  },
  {
    id: 'cite', cat: 'write', inline: true,
    short: ['引用', 'Citation'], title: ['引用參考文獻', 'Cite references'],
    fields: [{ k: 'n', type: 'text', label: ['編號', 'Numbers'], ph: ['1  或  1,3  或  2-5', '1  or  1,3  or  2-5'], showIf: () => revBib().style !== 'key' },
             { k: 'keys', type: 'text', label: ['鍵（分號隔開）', 'Keys (semicolon separated)'], ph: ['smith2020; lee2021', 'smith2020; lee2021'], showIf: () => revBib().style === 'key' }],
    extra: (box, v) => { const b = revBib(); refPicker(box, v, b.refs, b.style); },
    build(v) {
      const keys = String(v.keys || '').split(/[;,\s]+/).map(x => x.replace(/^@/, '').trim()).filter(Boolean);
      if (keys.length) return '[' + keys.map(k => '@' + k).join('; ') + ']';
      const n = esc(v.n).replace(/\s+/g, ''); return n ? '[[' + n + ']]' : '';
    }
  },
  {
    id: 'xref', cat: 'write', inline: true,
    short: ['交叉引用', 'Cross-reference'], title: ['指向圖、表、公式或章節', 'Refer to a figure, table, equation or section'],
    hint: ['插入的是編號本身，例如 (1) 或 2；前面的「Eq.」「Fig.」「Table」自己打。', 'Inserts the number only, such as (1) or 2; type “Eq.”, “Fig.” or “Table” yourself.'],
    fields: [
      { k: 'id', type: 'text', reflow: true, label: ['標籤', 'Label'], ph: ['fig:setup', 'fig:setup'] },
      { k: 'kind', type: 'select', label: ['寫法', 'Form'], showIf: v => !XREF_PREFIX.test(esc(v.id)),
        opts: [['ref', ['一般（圖 1、表 2、第 III 節）', 'Plain (Fig. 1, Table 2, Sec. III)']], ['eqref', ['公式，加括號 (1)', 'Equation, in parentheses (1)']]] }
    ],
    extra: (box, v) => labelPicker(box, v),
    /* 有 fig:／tbl:／eq:／sec: 這類前綴的標籤用 [@標籤]（轉換程式自己判斷要不要加括號），其他用 \\ref／\\eqref。 */
    build(v) { const id = esc(v.id); if (!id) return ''; return XREF_PREFIX.test(id) ? '[@' + id + ']' : '\\' + (v.kind === 'eqref' ? 'eqref' : 'ref') + '{' + id + '}'; }
  },
  {
    id: 'equation', cat: 'write',
    short: ['公式', 'Equation'], title: ['獨立公式', 'Display equation'],
    hint: ['要在別處用「交叉引用」指到它，就填標籤。', 'Give it a label if you will refer to it with Cross-reference.'],
    fields: [
      { k: 'body', type: 'textarea', rows: 3, mono: true, label: ['算式（不含 $$）', 'Expression (without $$)'], ph: ['E = mc^2', 'E = mc^2'] },
      { k: 'id', type: 'text', label: ['標籤（選填）', 'Label (optional)'], ph: ['eq:main', 'eq:main'] }
    ],
    build(v) { const b = esc(v.body); if (!b) return ''; const id = esc(v.id); return '$$\n' + b + '\n$$' + (id ? ' {#' + id + '}' : ''); }
  },
  {
    id: 'figure', cat: 'write',
    short: ['插圖', 'Figure'], title: ['插圖', 'Figure'],
    hint: ['圖檔要放在匯出專案的同一個資料夾裡；圖說只能一行。', 'Keep the image next to the exported project; the caption is one line.'],
    fields: [
      { k: 'src', type: 'text', label: ['圖檔路徑', 'Image path'], ph: ['figs/fig1.png', 'figs/fig1.png'] },
      { k: 'cap', type: 'text', label: ['圖說', 'Caption'] },
      { k: 'id', type: 'text', label: ['標籤（交叉引用用，選填）', 'Label (for cross-references, optional)'], ph: ['fig:setup', 'fig:setup'] },
      { k: 'wide', type: 'check', label: ['橫跨兩欄的大圖', 'Span both columns'] }
    ],
    build(v) {
      const attr = [esc(v.id) ? '#' + esc(v.id) : '', v.wide ? 'wide' : ''].filter(Boolean).join(' ');
      return '![' + oneLine(v.cap) + '](' + (esc(v.src) || 'figs/fig1.png') + ')' + (attr ? '{' + attr + '}' : '');
    }
  },
  {
    id: 'table', cat: 'write',
    short: [OUT('表格'), 'Table'], title: ['表格', 'Table'],
    hint: ['勾「併左」把這一格併進左邊那一格；表頭不能合併。', 'Tick “merge” to join a cell with the one on its left; the header row cannot merge.'],
    fields: [
      { k: 'grid', type: 'table' },
      { k: 'caption', type: 'text', label: ['表說（選填）', 'Caption (optional)'] },
      { k: 'id', type: 'text', label: ['標籤（交叉引用用，選填）', 'Label (for cross-references, optional)'], ph: ['tbl:results', 'tbl:results'] }
    ],
    build(v) {
      const st = (v.__tbl && v.__tbl.grid) || null;
      if (!st || !st.cells.length) return '';
      const alignMark = { l: '---', c: ':---:', r: '---:' }[st.align] || '---';
      const out = [];
      const rowOut = row => '| ' + row.map(c => (c.merge ? '>' : oneLine(c.text) || ' ')).join(' | ') + ' |';
      out.push(rowOut(st.cells[0]));
      out.push('|' + Array(st.cols).fill(alignMark).join('|') + '|');
      for (let r = 1; r < st.cells.length; r++) out.push(rowOut(st.cells[r]));
      const cap = oneLine(v.caption), id = esc(v.id);
      if (cap || id) out.push(': ' + cap + (id ? ' {#' + id + '}' : ''));
      return out.join('\n');
    }
  },
  {
    id: 'wide', cat: 'layout',
    short: ['跨欄', 'Full width'], title: ['橫跨兩欄的區塊', 'Block across both columns'],
    hint: ['放太寬的表格或公式；上下兩條短線是期刊樣式的接續記號。', 'For tables or equations too wide for one column; the short rules are the journal’s continuation marks.'],
    fields: [{ k: 'body', type: 'textarea', rows: 7, mono: true, label: ['內容（表格、公式或段落）', 'Content (table, equation or text)'] }],
    build(v) { return esc(v.body) ? '```revtex-wide\n' + esc(v.body) + '\n```' : ''; }
  },
  {
    id: 'longtable', cat: 'layout',
    short: ['長表格', 'Long table'], title: ['跨頁的長表格', 'Long table across pages'],
    hint: ['寫一般的 Markdown 表格；每頁會重複表頭。', 'Write a normal Markdown table; the header repeats on every page.'],
    fields: [{ k: 'body', type: 'textarea', rows: 7, mono: true, label: ['表格', 'Table'],
               ph: ['| 欄一 | 欄二 |\n|---|---|\n| a | b |', '| A | B |\n|---|---|\n| a | b |'] }],
    build(v) { return esc(v.body) ? '```revtex-longtable\n' + esc(v.body) + '\n```' : ''; }
  },
  {
    id: 'turnpage', cat: 'layout',
    short: ['橫置', 'Landscape page'], title: ['整頁轉 90 度的表或圖', 'Table or figure rotated 90°'],
    hint: ['一次只能放一個表或一張圖，而且不能跨頁。', 'One table or figure only, and it cannot span pages.'],
    fields: [{ k: 'body', type: 'textarea', rows: 7, mono: true, label: ['表格或圖', 'Table or figure'] }],
    build(v) { return esc(v.body) ? '```revtex-turnpage\n' + esc(v.body) + '\n```' : ''; }
  },
  {
    id: 'subeq', cat: 'layout',
    short: ['子公式', 'Subequations'], title: ['子公式組（1a、1b、1c）', 'Subequations (1a, 1b, 1c)'],
    fields: [{ k: 'items', type: 'entrylist', label: ['算式（依序是 a、b、c）', 'Expressions (a, b, c in order)'], addLabel: ['新增算式', 'Add expression'],
               primary: { type: 'text', mono: true, ph: ['E = mc^2', 'E = mc^2'] } }],
    build(v) {
      const rows = (v.items || []).map(r => esc(r.text).replace(/^\$\$|\$\$$/g, '').trim()).filter(Boolean);
      return rows.length ? '```revtex-subequations\n' + rows.map(r => '$$\n' + r + '\n$$').join('\n\n') + '\n```' : '';
    }
  },
  {
    id: 'nonum', cat: 'layout',
    short: ['不編號章節', 'Unnumbered heading'], title: ['不編號的章節標題', 'Unnumbered heading'],
    hint: ['印成 INTRODUCTION，不是 I. INTRODUCTION。', 'Prints INTRODUCTION instead of I. INTRODUCTION.'],
    fields: [
      { k: 'text', type: 'text', label: ['標題', 'Heading'], ph: ['Introduction', 'Introduction'] },
      { k: 'lv', type: 'select', label: ['層級', 'Level'],
        opts: [['1', ['章', 'Section']], ['2', ['節', 'Subsection']], ['3', ['小節', 'Subsubsection']]] }
    ],
    build(v) { const n = Math.max(1, Math.min(3, parseInt(v.lv || '1', 10) || 1)); return esc(v.text) ? '#'.repeat(n) + ' ' + oneLine(v.text) + ' {-}' : ''; }
  },
  {
    id: 'bib', cat: 'refs',
    short: ['參考文獻', 'References'], title: ['參考文獻', 'References'],
    hint: ['內文用「引用」指過來；編號依順序自動排。', 'Cite them with Citation; numbers follow the order.'],
    single: {
      find: fenceLoc(FENCES.revBib),
      read: t => {
        const body = fenceBody(t), style = bibStyleOf(body);
        return { __keyed: style === 'key', items: body.split('\n').filter(l => l.trim()).map(l => {
          const m = style === 'key' ? l.match(BIB_KEY) : l.match(BIB_NUM);
          return m ? (style === 'key' ? { key: m[1], text: m[2].trim() } : { text: m[3].trim() }) : { text: l.trim(), raw: true };
        }) };
      }
    },
    fields: [{ k: 'items', type: 'entrylist', showIndex: true, label: ['文獻', 'Entries'], addLabel: ['新增文獻', 'Add reference'],
               primary: { type: 'textarea', rows: 2, ph: ['Martin RM. Electronic Structure. Cambridge University Press, 2004.', 'Martin RM. Electronic Structure. Cambridge University Press, 2004.'] } }],
    build(v) {
      const items = (v.items || []).filter(r => esc(r.text));
      if (!items.length) return '';
      /* raw：讀回時不是「[N] 內容」格式的行（例如具名的「key: 內容」），原樣保留，不改成編號。 */
      if (v.__keyed) return '```revtex-bibliography\n' + items.map((r, i) => r.raw ? oneLine(r.text) : (esc(r.key) || 'ref' + (i + 1)).replace(/\s+/g, '') + ': ' + oneLine(r.text)).join('\n') + '\n```';
      return '```revtex-bibliography\n' + items.map((r, i) => r.raw ? oneLine(r.text) : '[' + (i + 1) + '] ' + oneLine(r.text)).join('\n') + '\n```';
    }
  },
  {
    id: 'appendix', cat: 'refs',
    short: ['附錄', 'Appendix'], title: ['附錄起點', 'Start of appendix'],
    hint: ['之後的章節變成附錄 A、B…，公式編號跟著變成 (A1)。', 'Sections after it become Appendix A, B…; equations become (A1).'],
    marker: arr => findFence(arr, FENCES.revAppendix),
    fields: [{ k: 'first', type: 'text', label: ['第一個附錄的標題（選填）', 'First appendix heading (optional)'] }],
    build(v) { const t = oneLine(v.first); return '```revtex-appendix\n```' + (t ? '\n\n# ' + t : ''); }
  },
  {
    id: 'rawtex', cat: 'refs',
    short: ['LaTeX 原始碼', 'Raw LaTeX'], title: ['直接寫 LaTeX', 'Raw LaTeX'],
    hint: ['原樣放進 .tex，不做任何轉換。', 'Passed to the .tex file unchanged.'],
    fields: [{ k: 'body', type: 'textarea', rows: 7, mono: true, label: ['LaTeX', 'LaTeX'] }],
    build(v) { return esc(v.body) ? '```tex\n' + esc(v.body) + '\n```' : ''; }
  }
];

/* ---------- 臺灣論文 ---------- */
const TW_COVER_ZH = { '校名中文': 'university_zh', '系所中文': 'dept_zh', '論文類型中文': 'degree_zh', '大學英文': 'university_en2', '系所英文': 'dept_en2',
  '論文類型英文': 'degree_en2', '中文標題': 'title_zh', '英文標題': 'title_en2', '研究生中文': 'student_zh', '研究生英文': 'student_en2',
  '指導教授中文': 'advisor_zh', '指導教授英文': 'advisor_en2', '日期中文': 'date_zh', '日期英文': 'date_en2' };
const TW_COVER_EN = { 'laboratory': 'lab', 'title': 'title', 'author': 'author', 'thesis statement': 'statement', 'degree': 'degree',
  'department': 'department', 'university': 'university', 'date': 'date' };
const TW_COVER_ZH_ORDER = ['university_zh', 'dept_zh', 'degree_zh', 'dept_en2', 'university_en2', 'degree_en2', 'title_zh', 'title_en2',
  'student_zh', 'student_en2', 'advisor_zh', 'advisor_en2', 'date_zh', 'date_en2'];
const keyOf = (map, f) => Object.keys(map).find(k => map[k] === f);
const zhOnly = v => v.mode !== 'en', enOnly = v => v.mode === 'en';

const TW_THESIS_TOOLS = [
  {
    id: 'twthesis-cover', cat: 'front',
    short: [OUT('封面'), 'Cover'], title: ['論文封面', 'Title page'],
    hint: ['留空的欄位印預留字；校徽在「偏好設定 → 臺灣論文」。', 'Blank fields print placeholder text; the logo is in Preferences → Taiwan thesis.'],
    single: {
      find: fenceLoc(FENCES.twCover),
      read: t => {
        const body = fenceBody(t), zh = kvParse(body, Object.fromEntries(Object.entries(TW_COVER_ZH).map(([k, f]) => [k.toLowerCase(), f])));
        const en = kvParse(body, TW_COVER_EN);
        const zhHits = Object.keys(zh).filter(k => k !== '__extra').length, enHits = Object.keys(en).filter(k => k !== '__extra').length;
        return (enHits > zhHits || (zhHits === 0 && twEnglish())) ? Object.assign(en, { mode: 'en' }) : Object.assign(zh, { mode: 'zh' });
      }
    },
    prepare: v => { if (!v.mode) v.mode = twEnglish() ? 'en' : 'zh'; },
    fields: [
      /* 封面用哪一套由模式決定（中文版／英文版）；只有在一般 Markdown 模式下才讓人選。 */
      { k: 'mode', type: 'select', reflow: true, label: ['封面版型', 'Cover layout'], showIf: () => docMode() !== 'tw',
        opts: [['zh', ['中文論文', 'Chinese thesis']], ['en', ['英文論文', 'English thesis']]] },
      { k: 'title_zh', type: 'text', showIf: zhOnly, label: ['論文標題（中文）', 'Title (Chinese)'] },
      { k: 'title_en2', type: 'text', showIf: zhOnly, label: ['論文標題（英文）', 'Title (English)'] },
      { k: 'student_zh', type: 'text', showIf: zhOnly, half: true, label: ['研究生（中文）', 'Student (Chinese)'] },
      { k: 'student_en2', type: 'text', showIf: zhOnly, half: true, label: ['研究生（英文）', 'Student (English)'] },
      { k: 'advisor_zh', type: 'text', showIf: zhOnly, half: true, label: ['指導教授（中文）', 'Advisor (Chinese)'] },
      { k: 'advisor_en2', type: 'text', showIf: zhOnly, half: true, label: ['指導教授（英文）', 'Advisor (English)'] },
      { k: 'date_zh', type: 'text', showIf: zhOnly, half: true, label: ['日期（中文）', 'Date (Chinese)'], ph: [OUT('中華民國一一五年七月'), '中華民國一一五年七月'] },
      { k: 'date_en2', type: 'text', showIf: zhOnly, half: true, label: ['日期（英文）', 'Date (English)'], ph: ['July 2026', 'July 2026'] },
      { k: 'university_zh', type: 'text', showIf: zhOnly, half: true, label: ['學校（中文）', 'University (Chinese)'], ph: [OUT('國立中山大學'), '國立中山大學'] },
      { k: 'university_en2', type: 'text', showIf: zhOnly, half: true, label: ['學校（英文）', 'University (English)'], ph: ['National Sun Yat-sen University', 'National Sun Yat-sen University'] },
      { k: 'dept_zh', type: 'text', showIf: zhOnly, half: true, label: ['系所（中文）', 'Department (Chinese)'], ph: [OUT('物理學系'), '物理學系'] },
      { k: 'dept_en2', type: 'text', showIf: zhOnly, half: true, label: ['系所（英文）', 'Department (English)'], ph: ['Department of Physics', 'Department of Physics'] },
      { k: 'degree_zh', type: 'text', showIf: zhOnly, half: true, label: ['論文類型（中文）', 'Thesis type (Chinese)'], ph: [OUT('碩士論文'), '碩士論文'] },
      { k: 'degree_en2', type: 'text', showIf: zhOnly, half: true, label: ['論文類型（英文）', 'Thesis type (English)'], ph: ['Master’s Thesis', 'Master’s Thesis'] },
      { k: 'title', type: 'text', showIf: enOnly, label: ['Title', 'Title'] },
      { k: 'author', type: 'text', showIf: enOnly, half: true, label: ['Author', 'Author'] },
      { k: 'date', type: 'text', showIf: enOnly, half: true, label: ['Date', 'Date'], ph: ['July 2026', 'July 2026'] },
      { k: 'statement', type: 'text', showIf: enOnly, label: ['Thesis statement', 'Thesis statement'], ph: ['A thesis submitted in partial fulfillment of the requirements for the degree of', 'A thesis submitted in partial fulfillment of the requirements for the degree of'] },
      { k: 'degree', type: 'text', showIf: enOnly, half: true, label: ['Degree', 'Degree'], ph: ['Master of Science', 'Master of Science'] },
      { k: 'lab', type: 'text', showIf: enOnly, half: true, label: ['Laboratory', 'Laboratory'] },
      { k: 'department', type: 'text', showIf: enOnly, half: true, label: ['Department', 'Department'] },
      { k: 'university', type: 'text', showIf: enOnly, half: true, label: ['University', 'University'] }
    ],
    build(v) {
      const out = [];
      if (v.mode === 'en') {
        for (const f of ['lab', 'title', 'author', 'statement', 'degree', 'department', 'university', 'date'])
          if (esc(v[f])) out.push(keyName(v, f, keyOf(TW_COVER_EN, f)) + ': ' + oneLine(v[f]));
      } else {
        for (const f of TW_COVER_ZH_ORDER) if (esc(v[f])) out.push(keyName(v, f, OUT(keyOf(TW_COVER_ZH, f))) + ': ' + oneLine(v[f]));
      }
      out.push(...extraLines(v));
      return out.length ? '```twthesis-titlepage\n' + out.join('\n') + '\n```' : '';
    }
  },
  {
    id: 'twthesis-approval', cat: 'front',
    short: [OUT('審定書'), 'Approval page'], title: ['論文審定書', 'Thesis approval page'],
    hint: ['接在封面後面，前置頁碼（i、ii…）從這一頁開始；圖片留空會先印一個框。', 'Follows the cover; front-matter page numbers start here. A blank image prints a frame.'],
    single: { find: fenceLoc(FENCES.twApproval),
      read: t => { const v = kvParse(fenceBody(t), { '圖片': 'image', '標題': 'title', '口試日期': 'date', '移除白底': 'knockout' }); v.knockout = /^(1|true|yes|是|移除|透明)$/i.test(String(v.knockout || '')); return v; } },
    fields: [
      { k: 'image', type: 'text', label: ['審定書掃描圖', 'Scanned approval form'], ph: [OUT('image/論文審定書.png'), 'image/approval.png'] },
      { k: 'date', type: 'text', label: ['口試日期', 'Oral defense date'] },
      { k: 'title', type: 'text', label: ['頁面標題（選填）', 'Page title (optional)'], ph: [OUT('論文審定書'), 'Thesis Approval Form'] },
      { k: 'knockout', type: 'check', label: ['掃描圖是白底，去掉白底', 'Remove the scan’s white background'] }
    ],
    build(v) {
      const out = [];
      if (esc(v.image)) out.push(keyName(v, 'image', OUT('圖片')) + ': ' + esc(v.image));
      if (esc(v.title)) out.push(keyName(v, 'title', OUT('標題')) + ': ' + oneLine(v.title));
      if (esc(v.date)) out.push(keyName(v, 'date', OUT('口試日期')) + ': ' + oneLine(v.date));
      if (v.knockout) out.push(keyName(v, 'knockout', OUT('移除白底')) + ': ' + OUT('是'));
      out.push(...extraLines(v));
      return '```twthesis-approval\n' + out.join('\n') + '\n```';
    }
  },
  {
    id: 'twthesis-titleback', cat: 'front',
    short: ['版權頁', 'Title back'], title: ['版權頁（英文論文）', 'Title back (English thesis)'],
    hint: ['英文論文封面背面那一頁。', 'The page on the back of the English title page.'],
    visible: () => !(docMode() === 'tw' && !twEnglish()),
    single: { find: fenceLoc(FENCES.twTitleback),
      read: t => kvParse(fenceBody(t), { 'laboratory': 'lab', 'author': 'author', 'title': 'title', 'thesis statement': 'statement', 'degree': 'degree',
        'copyright': 'copyright', 'supervisor': 'supervisor', 'place': 'place', 'time': 'time' }) },
    fields: [
      { k: 'title', type: 'text', label: ['Title', 'Title'] },
      { k: 'author', type: 'text', half: true, label: ['Author', 'Author'] },
      { k: 'supervisor', type: 'text', half: true, label: ['Supervisor', 'Supervisor'] },
      { k: 'statement', type: 'text', label: ['Thesis statement', 'Thesis statement'] },
      { k: 'degree', type: 'text', half: true, label: ['Degree', 'Degree'] },
      { k: 'lab', type: 'text', half: true, label: ['Laboratory', 'Laboratory'] },
      { k: 'copyright', type: 'text', half: true, label: ['Copyright date', 'Copyright date'], ph: ['July 2026', 'July 2026'] },
      { k: 'place', type: 'text', half: true, label: ['Place', 'Place'], ph: ['Kaohsiung, Taiwan', 'Kaohsiung, Taiwan'] },
      { k: 'time', type: 'text', half: true, label: ['Time（留空用版權日期）', 'Time (blank: copyright date)'] }
    ],
    build(v) {
      const out = [], keys = [['lab', 'laboratory'], ['author', 'author'], ['title', 'title'], ['statement', 'thesis statement'], ['degree', 'degree'],
        ['copyright', 'copyright'], ['supervisor', 'supervisor'], ['place', 'place'], ['time', 'time']];
      for (const [f, k] of keys) if (esc(v[f])) out.push(keyName(v, f, k) + ': ' + oneLine(v[f]));
      out.push(...extraLines(v));
      return out.length ? '```twthesis-titleback\n' + out.join('\n') + '\n```' : '';
    }
  },
  {
    id: 'twthesis-fm', cat: 'front',
    short: ['摘要與致謝', 'Abstracts and thanks'], title: ['摘要與致謝的章', 'Abstract and acknowledgment chapters'],
    hint: ['這幾章不編號、各自從新的一頁開始。', 'These chapters are unnumbered and each starts a new page.'],
    prepare: v => { if (!v.name) v.name = 'zhabs'; },
    marker: (arr, v) => { const re = FM_KINDS[(v && v.name) || 'zhabs'].re; return arr.findIndex(b => { const m = b.match(/^#\s+(.+?)\s*$/); return !!(m && re.test(m[1])); }); },
    fields: [
      { k: 'name', type: 'select', reflow: true, label: ['章', 'Chapter'],
        opts: [['zhabs', ['中文摘要', 'Chinese abstract']], ['enabs', ['英文摘要', 'English abstract']], ['ack', ['致謝', 'Acknowledgments']]] },
      { k: 'body', type: 'textarea', rows: 7, label: ['內文（選填）', 'Text (optional)'] }
    ],
    build(v) {
      const k = FM_KINDS[v.name || 'zhabs'], head = twEnglish() ? k.en : k.zh;
      return '# ' + head + (esc(v.body) ? '\n\n' + esc(v.body) : '');
    }
  },
  {
    id: 'twthesis-keywords', cat: 'front',
    short: ['關鍵字', 'Keywords'], title: ['摘要頁的關鍵字', 'Keywords on the abstract page'],
    hint: ['排在摘要頁版心底部；中文用「、」、英文用逗號，程式會自動接。', 'Placed at the foot of the abstract page; separators are added for you.'],
    prepare: v => { if (v.lang === undefined) v.lang = twEnglish() ? 'en' : 'zh'; },
    single: {
      find: (arr, v) => { const want = (v && v.lang) || 'zh'; for (let i = 0; i < arr.length; i++) { const m = arr[i].match(KW_LINE); if (m && (/^key/i.test(m[1]) ? 'en' : 'zh') === want) return { i, j: i, text: arr[i] }; } return null; },
      read: t => { const m = t.match(KW_LINE); return { terms: String(m ? m[2] : '').split(/[、,，;；]/).map(x => x.trim()).filter(Boolean).map(w => ({ w })) }; }
    },
    fields: [
      { k: 'lang', type: 'select', reflow: true, reread: true, label: ['哪一份摘要', 'Which abstract'],
        opts: [['zh', [OUT('中文摘要（關鍵字：）'), 'Chinese abstract (關鍵字：)']], ['en', ['英文摘要（Keywords:）', 'English abstract (Keywords:)']]] },
      { k: 'terms', type: 'list', label: ['關鍵字', 'Keywords'], addLabel: ['新增關鍵字', 'Add keyword'],
        rows: [{ k: 'w', type: 'text', label: ['詞', 'Term'], grow: true }] }
    ],
    extra: (box, v) => {
      const n = (v.terms || []).filter(r => esc(r.w)).length, ok = n >= 5 && n <= 7;
      const p = document.createElement('p'); p.className = 'pt-meter' + (ok ? '' : ' warn');
      p.textContent = T('排版要求 5 到 7 個，現在 N 個。', 'The layout expects 5 to 7; you have N.').replace('N', String(n));
      box.appendChild(p);
    },
    build(v) {
      const terms = (v.terms || []).map(r => oneLine(r.w)).filter(Boolean);
      if (!terms.length) return '';
      return v.lang === 'en' ? '**Keywords:** ' + terms.join(', ') : OUT('**關鍵字：** ') + terms.join(OUT('、'));
    }
  },
  {
    id: 'twthesis-toc', cat: 'toc',
    short: [OUT('目錄'), 'Contents'], title: ['目錄', 'Table of contents'],
    hint: ['目錄會依標題自動產生；放在哪裡，目錄就出現在哪裡。', 'Built from your headings; it appears where you place it.'],
    marker: arr => findFence(arr, FENCES.twToc), fields: [], build() { return '```twthesis-toc\n```'; }
  },
  {
    id: 'twthesis-lof', cat: 'toc',
    short: [OUT('圖目錄'), 'List of figures'], title: ['圖目錄', 'List of figures'],
    hint: ['依圖說自動產生。', 'Built from your figure captions.'],
    marker: arr => findFence(arr, FENCES.twLof), fields: [], build() { return '```twthesis-lof\n```'; }
  },
  {
    id: 'twthesis-lot', cat: 'toc',
    short: [OUT('表目錄'), 'List of tables'], title: ['表目錄', 'List of tables'],
    hint: ['依表說自動產生。', 'Built from your table captions.'],
    marker: arr => findFence(arr, FENCES.twLot), fields: [], build() { return '```twthesis-lot\n```'; }
  },
  {
    id: 'twthesis-cite', cat: 'write', inline: true,
    short: ['引用', 'Citation'], title: ['引用參考文獻', 'Cite references'],
    hint: ['點引用會跳到那一筆參考文獻。', 'Clicking a citation jumps to the reference.'],
    fields: [{ k: 'n', type: 'text', label: ['編號', 'Numbers'], ph: ['1  或  1,3  或  2-5', '1  or  1,3  or  2-5'] }],
    extra: (box, v) => refPicker(box, v, twRefs()),
    build(v) { const n = esc(v.n).replace(/\s+/g, ''); return n ? '[[' + n + ']]' : ''; }
  },
  {
    id: 'twthesis-cap', cat: 'write',
    short: ['插圖與圖說', 'Figure and caption'], title: ['插圖、圖說與表說', 'Figures and captions'],
    hint: ['圖說放在圖的下一段，表說放在表格的下一段；會收進圖目錄、表目錄。', 'Put a figure caption after the image and a table caption after the table; they go into the lists.'],
    /* 1.2.8（審查）：編號預設接在文件裡同類的上一個後面（圖 2.1 → 2.2）；使用者自己改過就不動。 */
    prepare: v => { if (!v.kind) v.kind = 'fig'; if (!v.no) v.no = nextCaptionNo(v.kind); },
    fields: [
      { k: 'kind', type: 'select', reflow: true, label: ['種類', 'Kind'], opts: [['fig', ['圖', 'Figure']], ['tab', ['表', 'Table']]],
        onChange: (v, old) => { if (!v.no || v.no === nextCaptionNo(old)) v.no = nextCaptionNo(v.kind); } },
      { k: 'src', type: 'text', showIf: v => v.kind !== 'tab', label: ['圖檔（選填；填了會連圖一起插入）', 'Image (optional; inserts the image too)'], ph: ['image/fig2-1.png', 'image/fig2-1.png'] },
      { k: 'no', type: 'text', half: true, label: ['編號', 'Number'], ph: ['2.1', '2.1'] },
      { k: 'body', type: 'text', label: ['說明', 'Caption'] }
    ],
    extra: (box, v) => {
      const last = lastCaption(v.kind === 'tab' ? 'tab' : 'fig');
      if (!last) return;
      const p = document.createElement('p'); p.className = 'pt-meter';
      p.textContent = T('文件裡上一個是 N，編號已接著填好。', 'The last one is N; the number continues from it.').replace('N', last);
      box.appendChild(p);
    },
    build(v) {
      const en = twEnglish(), tab = v.kind === 'tab';
      const label = en ? (tab ? 'Table' : 'Figure') : (tab ? OUT('表') : OUT('圖'));
      const no = esc(v.no).replace(/\s+/g, '') || '1', body = oneLine(v.body);
      /* 排版程式只認「**圖 2.1：**說明」與「**Figure 2.1:** text」（01.js 圖說規則）。 */
      const cap = '**' + label + ' ' + no + (en ? ':** ' : OUT('：**')) + body;
      return !tab && esc(v.src) ? '![' + body + '](' + esc(v.src) + ')\n\n' + cap : cap;
    }
  },
  {
    id: 'twthesis-refs', cat: 'refs',
    short: ['參考文獻', 'References'], title: ['參考文獻', 'References'],
    hint: ['編號依順序自動排；內文用「引用」指過來，點了會跳到那一筆。', 'Numbers follow the order; cite them with Citation.'],
    single: {
      find: arr => { const r = twRefRegion(arr); return r && !r.mixed ? r : null; },
      read: t => ({ items: t.split('\n').map(l => l.match(REF_LINE)).filter(Boolean).map(m => ({ text: m[2].trim() })) })
    },
    fields: [
      { k: 'items', type: 'entrylist', showIndex: true, label: ['文獻', 'Entries'], addLabel: ['新增文獻', 'Add reference'],
        primary: { type: 'textarea', rows: 2, ph: [OUT('王小明。量子力學。臺北：某出版社，2020。'), 'Author. Title. Publisher, Year.'] } },
      { k: 'head', type: 'check', label: ['同時加上「參考文獻」標題', 'Also add the References heading'], showIf: () => !hasRefsHeading() }
    ],
    build(v) {
      const items = (v.items || []).map(r => oneLine(r.text)).filter(Boolean);
      if (!items.length) return '';
      const rows = items.map((t, i) => '[' + (i + 1) + '] ' + t);
      return (v.head && !hasRefsHeading() ? '# ' + (twEnglish() ? 'References' : OUT('參考文獻')) + '\n\n' : '') + rows.join('\n\n');
    }
  },
  {
    id: 'twthesis-appendix', cat: 'refs',
    short: [OUT('附錄'), 'Appendix'], title: ['附錄起點', 'Start of appendix'],
    hint: ['之後的章改用字母編號（附錄 A、附錄 B…）。', 'Chapters after it are lettered (Appendix A, B…).'],
    marker: arr => findFence(arr, FENCES.twAppendix),
    fields: [{ k: 'first', type: 'text', label: ['第一個附錄的標題（選填）', 'First appendix heading (optional)'] }],
    build(v) { const t = oneLine(v.first); return '```twthesis-appendix\n```' + (t ? '\n\n# ' + t : ''); }
  }
];
const FM_KINDS = {
  zhabs: { zh: OUT('中文摘要'), en: 'Chinese Abstract', re: /^(中文摘要|摘要|Chinese Abstract.*)$/i },
  enabs: { zh: OUT('英文摘要'), en: 'Abstract', re: /^(英文摘要|Abstract)$/i },
  ack: { zh: OUT('致謝'), en: 'Acknowledgments', re: /^(誌\s*謝|致\s*謝|Acknowledge?ments?)$/i }
};
const KW_LINE = /^\s*\*\*\s*(關\s*鍵\s*字|關鍵詞|Key\s*words?)\s*[：:]\s*\*\*\s*(.*)$/i;
const CAP_LINE = /^\s*\*\*\s*(圖|表|Figure|Table)\s*([0-9A-Za-z]+(?:[.\-][0-9A-Za-z]+)*)\s*[：:]\s*\*\*/i;
function lastCaption(kind, numberOnly){
  let last = '', no = '';
  for (const b of docBlocks()) { const m = b.match(CAP_LINE); if (m && ((/圖|Figure/i.test(m[1]) ? 'fig' : 'tab') === kind)) { last = m[1] + ' ' + m[2]; no = m[2]; } }
  return numberOnly ? no : last;
}
/* 下一個編號：最後一段數字加一（2.1 → 2.2、3-2 → 3-3、4 → 5）；文件裡還沒有就從 1 開始。 */
function nextCaptionNo(kind){
  const no = lastCaption(kind === 'tab' ? 'tab' : 'fig', true);
  if (!no) return '1';
  const m = no.match(/^(.*?)(\d+)$/);
  return m ? m[1] + (Number(m[2]) + 1) : no;
}
const hasRefsHeading = () => docBlocks().some(b => /^#\s+(參考文獻|參考書目|References?|Bibliography)\s*$/i.test(b));

/* ★ 這個陣列的字面值會被 tests/ui_content_checks.cjs 單獨取出來執行，只能引用兩個工具陣列。 */
const GROUPS = [
  { id: 'rev', label: 'REV', title: ['REVTeX 4.2 國際期刊語法', 'REVTeX 4.2 (international journals)'], tools: REVTEX_TOOLS },
  { id: 'twthesis', label: 'TW', title: ['臺灣論文語法工具', 'Taiwan Thesis syntax tools'], tools: TW_THESIS_TOOLS }
];
const GROUP_CATS = { rev: REV_CATS, twthesis: TW_CATS };
const GROUP_NAME = { rev: ['國際論文工具', 'Paper tools'], twthesis: ['臺灣論文工具', 'Thesis tools'] };

/* ---------- 從文件挑選：參考文獻與標籤 ------------------------------------ */
function refPicker(box, v, refs, style){
  const keyed = style === 'key';
  const wrap = document.createElement('div'); wrap.className = 'pt-field';
  const lab = document.createElement('div'); lab.className = 'pt-label';
  lab.textContent = refs.length ? T('從文件的參考文獻挑選', 'Pick from the references') : T('文件裡還沒有參考文獻；先用「參考文獻」加入，或直接在上面填。', 'No references yet; add them with References, or type above.');
  wrap.appendChild(lab);
  if (refs.length) {
    const list = document.createElement('div'); list.className = 'pt-pick'; list.setAttribute('role', 'group');
    const chosen = keyed
      ? new Set(String(v.keys || '').split(/[;,\s]+/).map(x => x.replace(/^@/, '')).filter(Boolean))
      : new Set(String(v.n || '').split(',').flatMap(x => { const m = x.match(/^(\d+)-(\d+)$/); if (!m) return [Number(x)]; const a = []; for (let k = +m[1]; k <= +m[2]; k++) a.push(k); return a; }));
    for (const r of refs) {
      const id = keyed ? r.key : r.n;
      const row = document.createElement('label'); row.className = 'pt-pick-row';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = chosen.has(id); cb.value = String(id);
      const no = document.createElement('span'); no.className = 'pt-pick-no'; no.textContent = keyed ? r.key : '[' + r.n + ']';
      const tx = document.createElement('span'); tx.className = 'pt-pick-text'; tx.textContent = r.text;
      row.append(cb, no, tx); list.appendChild(row);
      cb.addEventListener('change', () => {
        const picked = [...list.querySelectorAll('input:checked')].map(x => x.value);
        const k = keyed ? 'keys' : 'n';
        v[k] = keyed ? picked.join('; ') : compressNums(picked.map(Number));
        const inp = panelEl().querySelector('input[data-k="' + k + '"]'); if (inp) inp.value = v[k];
      });
    }
    wrap.appendChild(list);
  }
  box.appendChild(wrap);
}
function labelPicker(box, v){
  const labels = revLabels();
  const wrap = document.createElement('div'); wrap.className = 'pt-field';
  const lab = document.createElement('div'); lab.className = 'pt-label';
  lab.textContent = labels.length ? T('從文件裡設過標籤的項目挑選', 'Pick from labelled items in the document') : T('文件裡還沒有設標籤的圖、表、公式或章節；插入時填「標籤」就能在這裡挑。', 'Nothing is labelled yet; give a figure, table or equation a label and it shows up here.');
  wrap.appendChild(lab);
  if (labels.length) {
    const KIND = { fig: ['圖', 'Figure'], tab: ['表', 'Table'], eq: ['公式', 'Equation'], sec: ['章節', 'Section'] };
    const list = document.createElement('div'); list.className = 'pt-pick'; list.setAttribute('role', 'listbox');
    for (const l of labels) {
      const row = document.createElement('button'); row.type = 'button'; row.className = 'pt-pick-row'; row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(v.id === l.id));
      const no = document.createElement('span'); no.className = 'pt-pick-no'; no.textContent = P(KIND[l.kind]);
      const tx = document.createElement('span'); tx.className = 'pt-pick-text'; tx.textContent = (l.text || '') + '　' + l.id;
      row.append(no, tx); list.appendChild(row);
      row.addEventListener('click', () => {
        v.id = l.id; v.kind = l.kind === 'eq' ? 'eqref' : 'ref';
        list.querySelectorAll('.pt-pick-row').forEach(x => x.setAttribute('aria-selected', String(x === row)));
        renderForm();
      });
    }
    wrap.appendChild(list);
  }
  box.appendChild(wrap);
}

/* ---------- 樣式 --------------------------------------------------------- */
const CSS = `
#ty-toolbar .${MOUNT_CLASS}{display:flex;align-items:center;gap:var(--space-half);flex:0 0 auto;padding-left:var(--space-2);margin-left:var(--space-1h);border-left:1px solid var(--ui-line)}
#ty-toolbar .${MOUNT_CLASS} .tb-btn{min-width:36px;font-size:var(--fs-11);font-weight:var(--fw-semibold);letter-spacing:.02em}
#ty-toolbar .${MOUNT_CLASS} .tb-btn[hidden]{display:none}
#ty-toolbar .${MOUNT_CLASS} .tb-btn.pt-open{background:var(--ui-selected);color:var(--ui-text-strong)}
#${PANEL_ID}{position:fixed;z-index:210;display:grid;grid-template-columns:184px minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto;
  width:min(760px,calc(100vw - 24px));height:min(560px,calc(100vh - 24px));overflow:hidden;color:var(--ui-text-strong);font:var(--fs-13)/var(--lh-13) var(--font-ui)}
#${PANEL_ID}[hidden]{display:none}
#${PANEL_ID} .pt-nav{grid-row:1/3;grid-column:1;display:flex;flex-direction:column;gap:var(--space-half);min-height:0;overflow-y:auto;
  padding:var(--space-3) var(--space-2);background:var(--ui-chrome);border-right:1px solid var(--ui-divider)}
#${PANEL_ID} .pt-nav-title{padding:var(--space-half) var(--space-2) 0;font-size:var(--fs-13);font-weight:var(--fw-semibold)}
#${PANEL_ID} .pt-nav-h{margin:var(--space-3) var(--space-2) var(--space-half);font-size:var(--fs-12);line-height:var(--lh-12);color:var(--ui-text-muted)}
#${PANEL_ID} .pt-nav-item{display:flex;align-items:center;justify-content:space-between;gap:var(--space-2);flex:none;min-height:var(--h-menu);margin:0;padding:0 var(--space-2);
  border:0;border-radius:var(--r-sm);background:transparent;color:var(--ui-text);font:var(--fs-13)/var(--lh-13) var(--font-ui);text-align:left;cursor:pointer}
#${PANEL_ID} .pt-nav-item[aria-selected="true"]{background:var(--ui-selected);color:var(--ui-text-strong);font-weight:var(--fw-medium)}
#${PANEL_ID} .pt-has{flex:none;font-size:var(--fs-11);font-weight:var(--fw-regular);color:var(--ui-text-muted)}
#${PANEL_ID} .pt-body{grid-row:1;grid-column:2;min-height:0;overflow-y:auto;padding:var(--space-4) var(--space-5);background:var(--ui-surface)}
#${PANEL_ID} .pt-title{margin:0 0 var(--space-1);font-size:var(--fs-14);line-height:var(--lh-14);font-weight:var(--fw-semibold)}
#${PANEL_ID} .pt-hint{margin:0 0 var(--space-4);font-size:var(--fs-12);line-height:var(--lh-12);color:var(--ui-text-muted)}
#${PANEL_ID} .pt-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:var(--space-3)}
#${PANEL_ID} .pt-field{grid-column:1/-1;margin:0 0 var(--space-3);min-width:0}
#${PANEL_ID} .pt-field.half{grid-column:auto}
#${PANEL_ID} .pt-label{display:block;margin:0 0 var(--space-1);font-size:var(--fs-12);line-height:var(--lh-12);color:var(--ui-text-muted)}
#${PANEL_ID} input[type=text],#${PANEL_ID} textarea,#${PANEL_ID} select{width:100%;box-sizing:border-box;margin:0;border:1px solid var(--ui-line-strong);border-radius:var(--r-sm);
  background:var(--ui-canvas);color:var(--ui-text-strong);font:var(--fs-13)/var(--lh-13) var(--font-ui);outline:none}
#${PANEL_ID} input[type=text],#${PANEL_ID} select{height:var(--h-control);padding:0 var(--space-2)}
#${PANEL_ID} select{-webkit-appearance:none;appearance:none;padding-right:28px;background:var(--ui-canvas) var(--cp-chevron) no-repeat right 9px center/12px 12px}
#${PANEL_ID} textarea{display:block;padding:var(--space-1h) var(--space-2);resize:vertical;min-height:60px}
#${PANEL_ID} .mono{font-family:var(--font-mono);font-size:var(--fs-12)}
#${PANEL_ID} input[type=text]:focus,#${PANEL_ID} textarea:focus,#${PANEL_ID} select:focus{border-color:var(--ui-accent);box-shadow:var(--focus-ring)}
#${PANEL_ID} input::placeholder,#${PANEL_ID} textarea::placeholder{color:var(--ui-text-muted);opacity:.7}
#${PANEL_ID} .pt-check{display:flex;align-items:center;gap:var(--space-2);font-size:var(--fs-13);cursor:pointer}
#${PANEL_ID} input[type=checkbox]{margin:0;accent-color:var(--ui-accent)}
#${PANEL_ID} .pt-row{display:grid;grid-template-columns:var(--pt-cols,1fr);gap:var(--space-1h);align-items:end;margin-bottom:var(--space-1h)}
#${PANEL_ID} .pt-cell{display:flex;flex-direction:column;gap:var(--space-half);min-width:0}
#${PANEL_ID} .pt-sub{font-size:var(--fs-11);line-height:var(--lh-11);color:var(--ui-text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#${PANEL_ID} .pt-row:not(:first-of-type) .pt-sub{display:none}
#${PANEL_ID} .pt-no{align-self:end;text-align:right;color:var(--ui-text-muted);font:var(--fs-12)/var(--h-control) var(--font-ui);font-variant-numeric:tabular-nums}
#${PANEL_ID} .pt-del,#${PANEL_ID} .pt-elist-del{width:28px;height:var(--h-control);padding:0;border:0;border-radius:var(--r-sm);background:transparent;color:var(--ui-text-muted);font:16px/1 var(--font-ui);cursor:pointer}
#${PANEL_ID} .pt-add{margin:var(--space-half) 0 0;padding:0;border:0;background:none;color:var(--ui-accent);font:var(--fs-12)/var(--lh-12) var(--font-ui);cursor:pointer}
#${PANEL_ID} .pt-elist-item{display:grid;grid-template-columns:auto minmax(0,1fr) 28px;gap:var(--space-1h);align-items:start;padding:var(--space-1h) 0;border-top:.5px solid var(--ui-line)}
#${PANEL_ID} .pt-elist-item:last-of-type{border-bottom:.5px solid var(--ui-line)}
#${PANEL_ID} .pt-elist-no{min-width:24px;padding-top:var(--space-1h);color:var(--ui-text-muted);font:var(--fs-12)/var(--lh-12) var(--font-ui);font-variant-numeric:tabular-nums;text-align:right}
#${PANEL_ID} .pt-elist-item.no-index{grid-template-columns:minmax(0,1fr) 28px}
#${PANEL_ID} .pt-elist-item.keyed{grid-template-columns:120px minmax(0,1fr) 28px}
#${PANEL_ID} .pt-title+.pt-form{margin-top:var(--space-3)}
#${PANEL_ID} .pt-meter{margin:calc(var(--space-1) * -1) 0 var(--space-3);font-size:var(--fs-12);line-height:var(--lh-12);color:var(--ui-text-muted)}
#${PANEL_ID} .pt-meter.warn{color:var(--ui-warn)}
#${PANEL_ID} .pt-pick{max-height:200px;overflow-y:auto;border:1px solid var(--ui-line);border-radius:var(--r-sm);background:var(--ui-canvas)}
#${PANEL_ID} .pt-pick-row{display:flex;align-items:center;gap:var(--space-2);width:100%;min-height:var(--h-menu);margin:0;padding:var(--space-1) var(--space-2);box-sizing:border-box;
  border:0;border-bottom:.5px solid var(--ui-line);background:transparent;color:var(--ui-text);font:var(--fs-12)/var(--lh-12) var(--font-ui);text-align:left;cursor:pointer}
#${PANEL_ID} .pt-pick-row:last-child{border-bottom:0}
#${PANEL_ID} .pt-pick-row[aria-selected="true"]{background:var(--ui-selected);color:var(--ui-text-strong)}
#${PANEL_ID} .pt-pick-no{flex:none;min-width:34px;color:var(--ui-text-muted);font-variant-numeric:tabular-nums}
#${PANEL_ID} .pt-pick-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#${PANEL_ID} .pt-tbl-dims{display:flex;gap:var(--space-3);margin-bottom:var(--space-2);flex-wrap:wrap}
#${PANEL_ID} .pt-tbl-dims .pt-cell{width:120px}
#${PANEL_ID} .pt-tbl-wrap{overflow-x:auto;margin-bottom:var(--space-1)}
#${PANEL_ID} .pt-tbl-grid{border-collapse:separate;border-spacing:var(--space-1)}
#${PANEL_ID} .pt-tbl-grid td{vertical-align:top;padding:0}
#${PANEL_ID} .pt-tbl-grid input[type=text]{width:118px}
#${PANEL_ID} .pt-tbl-head input[type=text]{font-weight:var(--fw-medium)}
#${PANEL_ID} .pt-tbl-merge{display:flex;align-items:center;gap:var(--space-1);margin-top:var(--space-half);font-size:var(--fs-11);color:var(--ui-text-muted);white-space:nowrap}
#${PANEL_ID} .pt-empty{padding:var(--space-2) 0;color:var(--ui-text-muted);font-size:var(--fs-12)}
#${PANEL_ID} .pt-foot{grid-row:2;grid-column:2;display:flex;align-items:center;gap:var(--space-2);padding:var(--space-2) var(--space-5);background:var(--ui-surface);border-top:.5px solid var(--ui-line)}
#${PANEL_ID} .pt-status{flex:1;min-width:0;font-size:var(--fs-12);line-height:var(--lh-12);color:var(--ui-text-muted)}
#${PANEL_ID} .pt-status.warn{color:var(--ui-warn)}
#${PANEL_ID} .pt-btn{flex:none;height:28px;padding:0 var(--space-3);border:.5px solid var(--ui-line-strong);border-radius:var(--r-sm);background:var(--ui-surface);
  color:var(--ui-text-strong);font:var(--fs-12)/1 var(--font-ui);cursor:pointer}
#${PANEL_ID} .pt-btn.primary{border-color:transparent;background:var(--ui-accent);color:var(--ui-on-accent,#fff);font-weight:var(--fw-medium)}
#${PANEL_ID} button:focus-visible{outline:none;box-shadow:var(--focus-ring)}
@media (hover:hover) and (pointer:fine){
  #${PANEL_ID} .pt-nav-item:not([aria-selected="true"]):hover,#${PANEL_ID} .pt-pick-row:hover,#${PANEL_ID} .pt-del:hover,#${PANEL_ID} .pt-elist-del:hover,
  #${PANEL_ID} .pt-btn:not(.primary):hover{background:var(--ui-hover)}
  #${PANEL_ID} .pt-btn.primary:hover{box-shadow:inset 0 0 0 99px var(--ui-on-accent-hover,rgba(255,255,255,.1))}
  #${PANEL_ID} .pt-add:hover{text-decoration:underline;text-underline-offset:2px}
}
/* 跳到文件裡既有的區塊時，短暫標一下那一塊 */
@keyframes cp171-pt-flash{from{background:var(--ui-accent-soft)}to{background:transparent}}
.cp171-pt-flash{animation:cp171-pt-flash 1.2s var(--ease-out)}
@media (prefers-reduced-motion:reduce){.cp171-pt-flash{animation:none}}
@media (max-width:700px){
  #${PANEL_ID}{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr) auto}
  #${PANEL_ID} .pt-nav{grid-row:1;grid-column:1;flex-direction:row;overflow-x:auto;overflow-y:hidden;padding:var(--space-2);border-right:0;border-bottom:1px solid var(--ui-divider)}
  #${PANEL_ID} .pt-nav-title,#${PANEL_ID} .pt-nav-h,#${PANEL_ID} .pt-has{display:none}
  #${PANEL_ID} .pt-nav-item{white-space:nowrap}
  #${PANEL_ID} .pt-body{grid-row:2;grid-column:1;padding:var(--space-3) var(--space-4)}
  #${PANEL_ID} .pt-foot{grid-row:3;grid-column:1;padding:var(--space-2) var(--space-4)}
  #${PANEL_ID} .pt-form{grid-template-columns:minmax(0,1fr)}
  #${PANEL_ID} .pt-field.half{grid-column:1/-1}
  #${PANEL_ID} .pt-status{display:none}
  /* 窄螢幕：重複列的欄位改成換行排列（作者列四個欄位放不下一行），每一列都顯示欄名 */
  #${PANEL_ID} .pt-row{display:flex;flex-wrap:wrap;align-items:flex-end}
  #${PANEL_ID} .pt-row .pt-cell{flex:1 1 140px}
  #${PANEL_ID} .pt-row .pt-no{flex:0 0 18px}
  #${PANEL_ID} .pt-row:has(.pt-sub){position:relative;padding-right:32px}
  #${PANEL_ID} .pt-row:has(.pt-sub) .pt-del{position:absolute;top:calc(var(--lh-11) + var(--space-half));right:0}
  #${PANEL_ID} .pt-row+.pt-row:has(.pt-sub) .pt-del{top:calc(var(--lh-11) + var(--space-half) + var(--space-2))}
  #${PANEL_ID} .pt-row .pt-del{flex:0 0 28px}
  #${PANEL_ID} .pt-row:not(:first-of-type) .pt-sub{display:block}
  #${PANEL_ID} .pt-row+.pt-row{margin-top:var(--space-2);padding-top:var(--space-2);border-top:.5px solid var(--ui-line)}
}
`;

function ensureStyle() {
  if (document.getElementById('cp171-ptools-css')) return;
  const st = document.createElement('style');
  st.id = 'cp171-ptools-css';
  st.textContent = CSS;
  (document.head || document.documentElement).appendChild(st);
}

/* ---------- 面板 --------------------------------------------------------- */
let panel = null, curGroup = null, curTool = null, values = Object.create(null), bookmark = null, ctx = null, early = null;
const lastTool = Object.create(null);

function panelEl() {
  if (panel && panel.isConnected) return panel;
  panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.innerHTML = '<nav class="pt-nav" role="tablist" aria-orientation="vertical"></nav><div class="pt-body"></div>'
    + '<div class="pt-foot"><span class="pt-status" aria-live="polite"></span>'
    + '<button type="button" class="pt-btn" data-act="cancel"></button>'
    + '<button type="button" class="pt-btn primary" data-act="go"></button></div>';
  document.body.appendChild(panel);
  panel.addEventListener('click', onPanelClick);
  panel.addEventListener('keydown', onPanelKey);
  return panel;
}

function onPanelClick(e) {
  const item = e.target.closest('.pt-nav-item');
  if (item) { selectTool(item.dataset.tool); return; }
  const add = e.target.closest('.pt-add');
  if (add) { addRow(add.dataset.field); return; }
  const del = e.target.closest('.pt-del, .pt-elist-del');
  if (del) { delRow(del.dataset.field, Number(del.dataset.idx)); return; }
  const btn = e.target.closest('.pt-btn');
  if (!btn) return;
  if (btn.dataset.act === 'cancel') hidePanel();
  if (btn.dataset.act === 'go') doGo();
}
function onPanelKey(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); doGo(); return; }
  const item = e.target.closest && e.target.closest('.pt-nav-item');
  if (!item || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
  e.preventDefault();
  const all = [...panelEl().querySelectorAll('.pt-nav-item')], i = all.indexOf(item);
  const next = all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length];
  if (next) selectTool(next.dataset.tool);
}

function hidePanel() {
  if (panel) panel.hidden = true;
  document.querySelectorAll('#ty-toolbar .' + MOUNT_CLASS + ' .tb-btn.pt-open').forEach(b => b.classList.remove('pt-open'));
  curGroup = null;
}

const groupTools = g => g.tools.filter(t => typeof t.visible !== 'function' || t.visible());

function openGroup(gid, anchorBtn) {
  const g = GROUPS.find(x => x.id === gid);
  if (!g) return;
  if (curGroup === gid && panel && !panel.hidden) { hidePanel(); return; }
  ensureStyle();
  const p = panelEl();
  /* 書籤優先用按下滑鼠那一刻記的（見檔尾 window 的 mousedown）：臺灣論文頁面模式下，點工具列會先讓段落編輯框收起來。 */
  bookmark = (early && Date.now() - early.at < 1500) ? early.bm : captureBookmark();
  early = null;
  curGroup = gid;
  const tools = groupTools(g);
  curTool = tools.find(t => t.id === lastTool[gid]) || tools[0] || null;
  p.hidden = false;
  selectTool(curTool && curTool.id, true);
  position(anchorBtn);
  document.querySelectorAll('#ty-toolbar .' + MOUNT_CLASS + ' .tb-btn').forEach(b => b.classList.toggle('pt-open', b.dataset.ptGroup === gid));
}

function position(anchorBtn) {
  const p = panelEl();
  const r = anchorBtn && anchorBtn.getBoundingClientRect ? anchorBtn.getBoundingClientRect() : null;
  const vw = window.innerWidth || 1200, vh = window.innerHeight || 800;
  const pw = p.offsetWidth || 760;
  /* 貼著按鈕往下開；右邊放不下就往左挪，高度夾在視窗內，不讓面板跑出畫面。 */
  let left = r && r.width ? r.left : 40, top = r && r.height ? r.bottom + 6 : 60;
  if (left + pw > vw - 10) left = Math.max(8, vw - pw - 10);
  if (vh - top - 12 < 360) top = Math.max(8, vh - 12 - Math.min(560, vh - 24));
  p.style.left = Math.round(left) + 'px';
  p.style.top = Math.round(top) + 'px';
  p.style.height = Math.round(Math.min(560, vh - top - 12)) + 'px';
  p.style.transformOrigin = (r ? Math.round(r.left + r.width / 2 - left) + 'px' : 'center') + ' top';
}

function renderNav(g) {
  const nav = panelEl().querySelector('.pt-nav');
  nav.textContent = '';
  nav.setAttribute('aria-label', P(GROUP_NAME[g.id]));
  const title = document.createElement('div'); title.className = 'pt-nav-title'; title.textContent = P(GROUP_NAME[g.id]);
  nav.appendChild(title);
  const arr = docBlocks(), tools = groupTools(g);
  for (const [cat, label] of GROUP_CATS[g.id]) {
    const list = tools.filter(t => t.cat === cat);
    if (!list.length) continue;
    const h = document.createElement('div'); h.className = 'pt-nav-h'; h.textContent = P(label); nav.appendChild(h);
    for (const t of list) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pt-nav-item'; b.dataset.tool = t.id; b.setAttribute('role', 'tab');
      const on = !!(curTool && curTool.id === t.id);
      b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
      const name = document.createElement('span'); name.textContent = P(t.short); b.appendChild(name);
      if (presentIn(t, arr)) { const has = document.createElement('span'); has.className = 'pt-has'; has.textContent = T('已有', 'In doc'); b.appendChild(has); }
      nav.appendChild(b);
    }
  }
  const foot = panelEl().querySelector('.pt-foot');
  foot.querySelector('[data-act=cancel]').textContent = T('取消', 'Cancel');
}
/* 清單上的「已有」：單份區塊與標記看文件裡有沒有；摘要與致謝、關鍵字依目前選項，不在清單上標。 */
function presentIn(t, arr) {
  try {
    if (t.id === 'twthesis-fm' || t.id === 'twthesis-keywords') return false;
    if (t.single) return !!t.single.find(arr, {});
    if (t.marker) return t.marker(arr, {}) >= 0;
  } catch (_) {}
  return false;
}

function selectTool(id, fromOpen) {
  const g = GROUPS.find(x => x.id === curGroup);
  if (!g) return;
  const t = g.tools.find(x => x.id === id) || null;
  curTool = t;
  if (t) lastTool[g.id] = t.id;
  resetValues();
  renderNav(g);
  renderForm();
  /* 清單重畫後原本的按鈕已經不在，把焦點交給新選中的那一項（鍵盤上下移動才接得下去）。 */
  if (!fromOpen) { const b = panelEl().querySelector('.pt-nav-item[aria-selected="true"]'); if (b) b.focus({ preventScroll: true }); }
}

/* 依目前文件決定預設值，並讀回已存在的區塊。selectTool 與會改變讀取對象的欄位（reread）都會呼叫。 */
function resetValues(keep) {
  values = keep || Object.create(null);
  ctx = { existing: null, marker: -1 };
  if (!curTool) return;
  if (typeof curTool.prepare === 'function') curTool.prepare(values);
  analyze();
}
function analyze() {
  ctx = { existing: null, marker: -1 };
  const arr = docBlocks();
  try {
    if (curTool.single) {
      const loc = curTool.single.find(arr, values);
      if (loc) {
        ctx.existing = loc;
        const read = curTool.single.read(loc.text);
        for (const k of Object.keys(read)) values[k] = read[k];
      }
    }
    if (curTool.marker) ctx.marker = curTool.marker(arr, values);
  } catch (e) { K.log && K.log.warn && K.log.warn('papertools', 'read back failed: ' + (e && e.message)); }
}

function renderForm() {
  const body = panelEl().querySelector('.pt-body');
  body.textContent = '';
  if (!curTool) {
    const d = document.createElement('div'); d.className = 'pt-empty';
    d.textContent = T('這一組沒有可用的工具。', 'No tools here.');
    body.appendChild(d); updateFoot(); return;
  }
  const h = document.createElement('h3'); h.className = 'pt-title';
  h.textContent = P(curTool.title); body.appendChild(h);
  if (curTool.hint) { const p = document.createElement('p'); p.className = 'pt-hint'; p.textContent = P(curTool.hint); body.appendChild(p); }
  const form = document.createElement('div'); form.className = 'pt-form'; body.appendChild(form);
  for (const f of curTool.fields) {
    if (typeof f.showIf === 'function' && !f.showIf(values)) continue;
    form.appendChild(renderField(f));
  }
  if (typeof curTool.extra === 'function') {
    const box = document.createElement('div'); box.className = 'pt-field'; form.appendChild(box);
    curTool.extra(box, values);
  }
  updateFoot();
}

function updateFoot() {
  const foot = panelEl().querySelector('.pt-foot'), st = foot.querySelector('.pt-status'), go = foot.querySelector('[data-act=go]');
  st.classList.remove('warn');
  if (!curTool) { go.hidden = true; st.textContent = ''; return; }
  go.hidden = false;
  if (ctx && ctx.marker >= 0) {
    go.textContent = T('跳到該處', 'Go to it');
    st.textContent = curTool.id === 'twthesis-fm' ? T('文件裡已經有這一章，內文直接在文件裡改。', 'This chapter is already in the document; edit its text there.') : T('文件裡已經有了。', 'Already in the document.');
  } else if (ctx && ctx.existing) {
    go.textContent = T('更新', 'Update');
    st.textContent = T('已讀入文件裡的內容；更新會改寫原本那一份。', 'Loaded from the document; Update rewrites it in place.');
  } else {
    go.textContent = T('插入', 'Insert');
    if (!bookmark || bookmark.kind === 'none') { st.textContent = NO_PLACE(); st.classList.add('warn'); }
    else st.textContent = curTool.inline ? T('插在游標處。', 'Inserted at the cursor.') : T('插在游標所在段落的後面。', 'Inserted after the paragraph with the cursor.');
  }
}
const NO_PLACE = () => T('先在文件裡點一下要插入的位置，再打開這裡。', 'Click in the document where it should go, then open this again.');
function warn(msg) { const st = panelEl().querySelector('.pt-status'); st.textContent = msg; st.classList.add('warn'); }

function fieldBox(f) {
  const wrap = document.createElement('div');
  wrap.className = 'pt-field' + (f.half ? ' half' : '');
  if (f.label && f.type !== 'check') {
    const lab = document.createElement('label'); lab.className = 'pt-label';
    lab.textContent = P(f.label); lab.htmlFor = 'pt-f-' + f.k;
    wrap.appendChild(lab);
  }
  return wrap;
}
function renderField(f) {
  const wrap = fieldBox(f);
  if (f.type === 'list') {
    if (!Array.isArray(values[f.k]) || !values[f.k].length) values[f.k] = [Object.create(null)];
    values[f.k].forEach((row, idx) => wrap.appendChild(renderListRow(f, row, idx)));
    wrap.appendChild(addButton(f));
    return wrap;
  }
  if (f.type === 'table') { wrap.appendChild(renderTableEditor(f)); return wrap; }
  if (f.type === 'entrylist') {
    if (!Array.isArray(values[f.k]) || !values[f.k].length) values[f.k] = [Object.create(null)];
    values[f.k].forEach((row, idx) => wrap.appendChild(renderEntryListItem(f, row, idx)));
    wrap.appendChild(addButton(f));
    return wrap;
  }
  if (f.type === 'check') {
    const lb = document.createElement('label'); lb.className = 'pt-check';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!values[f.k]; cb.dataset.k = f.k;
    cb.addEventListener('change', () => { values[f.k] = cb.checked; });
    lb.appendChild(cb); lb.appendChild(document.createTextNode(P(f.label)));
    wrap.appendChild(lb);
    return wrap;
  }
  if (f.type === 'select') {
    const sel = document.createElement('select'); sel.id = 'pt-f-' + f.k; sel.dataset.k = f.k;
    for (const [val, lbl] of f.opts) { const o = document.createElement('option'); o.value = val; o.textContent = P(lbl); sel.appendChild(o); }
    if (values[f.k] === undefined) values[f.k] = f.opts[0][0];
    sel.value = values[f.k];
    sel.addEventListener('change', () => {
      const old = values[f.k];
      values[f.k] = sel.value;
      if (typeof f.onChange === 'function') f.onChange(values, old);
      if (f.reread || curTool.marker) { const keep = Object.create(null); keep[f.k] = sel.value; resetValues(keep); }
      if (f.reflow || f.reread || curTool.marker) renderForm();
    });
    wrap.appendChild(sel);
    return wrap;
  }
  if (f.type === 'textarea') {
    const ta = document.createElement('textarea'); ta.id = 'pt-f-' + f.k; ta.dataset.k = f.k;
    ta.rows = f.rows || 5; ta.value = values[f.k] || ''; if (f.mono) ta.className = 'mono';
    if (f.ph) ta.placeholder = P(f.ph);
    ta.addEventListener('input', () => { values[f.k] = ta.value; });
    wrap.appendChild(ta);
    return wrap;
  }
  const inp = document.createElement('input');
  inp.type = 'text'; inp.id = 'pt-f-' + f.k; inp.dataset.k = f.k; inp.spellcheck = false;
  inp.value = values[f.k] || '';
  if (f.ph) inp.placeholder = P(f.ph);
  inp.addEventListener('input', () => { values[f.k] = inp.value; });
  if (f.reflow) inp.addEventListener('change', () => { renderForm(); const again = panelEl().querySelector('input[data-k="' + f.k + '"]'); if (again) again.focus(); });
  wrap.appendChild(inp);
  return wrap;
}
function addButton(f) {
  const add = document.createElement('button');
  add.type = 'button'; add.className = 'pt-add'; add.dataset.field = f.k;
  add.textContent = '＋ ' + P(f.addLabel);
  return add;
}

/* 重複列：同一個欄位的每一列用同一份 grid-template-columns，天生對齊；欄名只在第一列顯示。 */
function gridCols(f) {
  const parts = [];
  if (f.numbered) parts.push('20px');
  for (const c of f.rows) parts.push(c.grow ? 'minmax(140px,1fr)' : (c.w || 120) + 'px');
  parts.push('28px');
  return parts.join(' ');
}
function renderListRow(f, row, idx) {
  const r = document.createElement('div');
  r.className = 'pt-row';
  r.style.setProperty('--pt-cols', gridCols(f));
  if (f.numbered) { const no = document.createElement('span'); no.className = 'pt-no'; no.textContent = String(idx + 1); r.appendChild(no); }
  for (const c of f.rows) {
    const cell = document.createElement('div'); cell.className = 'pt-cell';
    if (f.rows.length > 1) { const sub = document.createElement('span'); sub.className = 'pt-sub'; sub.textContent = P(c.label); cell.appendChild(sub); }
    const inp = document.createElement('input'); inp.type = 'text'; inp.spellcheck = false;
    inp.value = row[c.k] || ''; inp.setAttribute('aria-label', P(c.label) + ' ' + (idx + 1));
    if (c.ph) inp.placeholder = P(c.ph);
    inp.addEventListener('input', () => { row[c.k] = inp.value; if (curTool && curTool.id === 'twthesis-keywords') refreshExtra(); });
    cell.appendChild(inp); r.appendChild(cell);
  }
  const del = document.createElement('button');
  del.type = 'button'; del.className = 'pt-del';
  del.dataset.field = f.k; del.dataset.idx = String(idx);
  del.textContent = '×'; del.title = T('刪除這一列', 'Remove this row'); del.setAttribute('aria-label', del.title);
  r.appendChild(del);
  return r;
}
function refreshExtra() {
  const meter = panelEl().querySelector('.pt-meter');
  if (!meter || !curTool || typeof curTool.extra !== 'function') return;
  const box = meter.parentNode; box.textContent = ''; curTool.extra(box, values);
}

function ensureTableState(f) {
  if (!values.__tbl) values.__tbl = {};
  const st = values.__tbl[f.k] || (values.__tbl[f.k] = { cols: 3, rows: 2, align: 'l', cells: [] });
  const need = st.rows + 1;   // +1 是表頭列
  while (st.cells.length < need) st.cells.push([]);
  st.cells.length = need;
  for (let r = 0; r < need; r++) {
    const row = st.cells[r] || (st.cells[r] = []);
    while (row.length < st.cols) row.push({ text: '', merge: false });
    row.length = st.cols;
    if (row[0]) row[0].merge = false;   // 每列第一欄沒有「左邊」，不能合併
  }
  return st;
}
function renderTableEditor(f) {
  const box = document.createElement('div');
  const st = ensureTableState(f);
  const dims = document.createElement('div'); dims.className = 'pt-tbl-dims';
  const mkSel = (label, val, opts, onchange) => {
    const cell = document.createElement('div'); cell.className = 'pt-cell';
    const sub = document.createElement('span'); sub.className = 'pt-sub'; sub.textContent = label; cell.appendChild(sub);
    const sel = document.createElement('select'); sel.setAttribute('aria-label', label);
    for (const [v, t] of opts) { const op = document.createElement('option'); op.value = String(v); op.textContent = String(t); sel.appendChild(op); }
    sel.value = String(val);
    sel.addEventListener('change', () => { onchange(sel.value); renderForm(); });
    cell.appendChild(sel); return cell;
  };
  dims.appendChild(mkSel(T('欄數', 'Columns'), st.cols, [2, 3, 4, 5, 6, 7, 8].map(n => [n, n]), v => { st.cols = Number(v); }));
  dims.appendChild(mkSel(T('列數（不含表頭）', 'Rows (excl. header)'), st.rows, Array.from({ length: 15 }, (_, i) => [i + 1, i + 1]), v => { st.rows = Number(v); }));
  dims.appendChild(mkSel(T('對齊', 'Align'), st.align, [['l', T('靠左', 'Left')], ['c', T('置中', 'Center')], ['r', T('靠右', 'Right')]], v => { st.align = v; }));
  box.appendChild(dims);
  const wrapDiv = document.createElement('div'); wrapDiv.className = 'pt-tbl-wrap';
  const table = document.createElement('table'); table.className = 'pt-tbl-grid';
  for (let r = 0; r < st.cells.length; r++) {
    const tr = document.createElement('tr'); if (r === 0) tr.className = 'pt-tbl-head';
    for (let c = 0; c < st.cols; c++) {
      const td = document.createElement('td'), cellData = st.cells[r][c];
      const inp = document.createElement('input'); inp.type = 'text'; inp.value = cellData.text || '';
      inp.placeholder = r === 0 ? (T('表頭 ', 'Header ') + (c + 1)) : '';
      inp.setAttribute('aria-label', (r === 0 ? T('表頭 ', 'Header ') : T('第 R 列 ', 'Row R ').replace('R', String(r))) + (c + 1));
      inp.addEventListener('input', () => { cellData.text = inp.value; });
      td.appendChild(inp);
      if (r > 0 && c > 0) {
        const mrg = document.createElement('label'); mrg.className = 'pt-tbl-merge';
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!cellData.merge;
        cb.addEventListener('change', () => { cellData.merge = cb.checked; inp.disabled = cb.checked; if (cb.checked) { inp.value = ''; cellData.text = ''; } });
        inp.disabled = !!cellData.merge;
        mrg.appendChild(cb); mrg.appendChild(document.createTextNode(T('併左', 'Merge left')));
        td.appendChild(mrg);
      }
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  wrapDiv.appendChild(table); box.appendChild(wrapDiv);
  return box;
}
/* 一筆一段的清單（參考文獻、子公式）：編號、內容、刪除鈕一列，細線分隔。 */
function renderEntryListItem(f, row, idx) {
  const item = document.createElement('div');
  item.className = 'pt-elist-item' + (f.showIndex ? '' : ' no-index') + (values.__keyed ? ' keyed' : '');
  if (f.showIndex && !values.__keyed) { const no = document.createElement('span'); no.className = 'pt-elist-no'; no.textContent = row.raw ? '·' : '[' + (idx + 1) + ']'; item.appendChild(no); }
  if (values.__keyed && !row.raw) {
    const key = document.createElement('input'); key.type = 'text'; key.className = 'pt-elist-key mono'; key.spellcheck = false;
    key.value = row.key || ''; key.placeholder = T('鍵', 'key'); key.setAttribute('aria-label', T('鍵', 'Key') + ' ' + (idx + 1));
    key.addEventListener('input', () => { row.key = key.value; });
    item.appendChild(key);
  }
  const p = f.primary;
  const field = p.type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
  if (p.type === 'textarea') field.rows = p.rows || 2; else field.type = 'text';
  if (p.mono) field.className = 'mono';
  field.value = row.text || ''; field.spellcheck = false;
  field.setAttribute('aria-label', P(f.label) + ' ' + (idx + 1));
  if (p.ph) field.placeholder = P(p.ph);
  field.addEventListener('input', () => { row.text = field.value; });
  item.appendChild(field);
  const del = document.createElement('button');
  del.type = 'button'; del.className = 'pt-elist-del';
  del.dataset.field = f.k; del.dataset.idx = String(idx);
  del.textContent = '×'; del.title = T('刪除這一筆', 'Remove this entry'); del.setAttribute('aria-label', del.title);
  item.appendChild(del);
  return item;
}
function addRow(k) {
  if (!Array.isArray(values[k])) values[k] = [];
  values[k].push(Object.create(null));
  renderForm();
  const rows = panelEl().querySelectorAll('[data-field="' + k + '"].pt-del, [data-field="' + k + '"].pt-elist-del');
  const last = rows[rows.length - 1]; const inp = last && last.parentNode.querySelector('input,textarea');
  if (inp) inp.focus();
}
function delRow(k, idx) {
  if (!Array.isArray(values[k])) return;
  values[k].splice(idx, 1);
  if (!values[k].length) values[k].push(Object.create(null));
  renderForm();
}

/* ---------- 寫回文件 -------------------------------------------------------
 * 打開面板時記下游標（以前在表單裡打字後，瀏覽器的選取跑到表單上，宿主找不到游標，
 * 內容就被插到文件最後）。 */
function captureBookmark() {
  try {
    if (srcMode() && srcview) return { kind: 'source', s: srcview.selectionStart | 0, e: srcview.selectionEnd | 0 };
    const pe = document.getElementById('pe-text');
    if (pe && typeof peIndex !== 'undefined' && peIndex >= 0) return { kind: 'paper', i: peIndex, s: pe.selectionStart | 0, e: pe.selectionEnd | 0 };
    if (activeIndex >= 0 && editor.children[activeIndex]) return { kind: 'block', i: activeIndex, off: caretOffsetIn(editor.children[activeIndex]) };
    const sel = getSelection(), el = sel && sel.rangeCount ? blockElOf(sel.anchorNode) : null;
    if (el && editor.contains(el)) return { kind: 'block', i: blockIndexOf(el), off: null };
  } catch (_) {}
  return { kind: 'none' };
}
function commitOpenEdits() {
  try { if (typeof commitPaperEdit === 'function') commitPaperEdit(); } catch (_) {}
  try { if (activeIndex >= 0) deactivate(true); } catch (_) {}
}
function flash(i) {
  try {
    const el = editor.children[i]; if (!el) return;
    el.scrollIntoView({ block: 'center' });
    el.classList.remove('cp171-pt-flash'); void el.offsetWidth; el.classList.add('cp171-pt-flash');
    setTimeout(() => el.classList.remove('cp171-pt-flash'), 1300);
  } catch (_) {}
}
function sourceOffset(arr, i) { let a = 0; for (let k = 0; k < i; k++) a += arr[k].length + 1; return a; }
function sourceReplace(a, z, text) {
  const native = srcReplaceRange(a, z, text);
  if (!native) srcview.dispatchEvent(new Event('input', { bubbles: true }));
  try { srcview.focus(); srcview.setSelectionRange(a + text.length, a + text.length); if (typeof srcJumpToOffset === 'function') srcJumpToOffset(a, true, false); } catch (_) {}
}
/* 用新內容取代文件第 i～j 塊（locate 在最新的文件上重新找一次，避免提交編輯後索引位移）。 */
function replaceBlocks(locate, text) {
  if (srcMode()) {
    const arr = splitToBlocks(String(srcview.value || '')), loc = locate(arr);
    if (!loc) return false;
    const a = sourceOffset(arr, loc.i), z = sourceOffset(arr, loc.j) + arr[loc.j].length;
    sourceReplace(a, z, text);
    return true;
  }
  commitOpenEdits();
  const loc = locate(blocks.slice());
  if (!loc) return false;
  const parts = splitToBlocks(text);
  pushUndo();
  blocks[loc.i] = parts[0]; rerender(loc.i);
  for (let k = loc.j; k > loc.i; k--) removeBlockAt(k);
  for (let m = 1; m < parts.length; m++) insertBlockAfter(loc.i + m - 1, parts[m]);
  onEdited();
  flash(loc.i);
  return true;
}
/* 區塊語法：插在書籤那一段的後面，前後各留一個空行，原文看起來才清楚。 */
function insertBlockText(text) {
  const bm = bookmark || { kind: 'none' };
  if (srcMode()) {
    /* 插在游標所在「整個區塊」的後面：游標在圍欄或公式裡時，插在行尾會把新內容塞進那個區塊。 */
    if (bm.kind !== 'source') return false;
    const v = String(srcview.value || ''), at = Math.max(bm.s, bm.e);
    const arr = splitToBlocks(v);
    let lineEnd = v.length;
    for (let k = 0, base = 0; k < arr.length; k++) { const end = base + arr[k].length; if (at <= end) { lineEnd = end; break; } base = end + 1; }
    const before = v.slice(0, lineEnd), after = v.slice(lineEnd);
    const lead = !before.trim() ? '' : (/\n\s*$/.test(before) ? '\n' : '\n\n');
    const tail = /^\n[ \t]*\n/.test(after) || !after.trim() ? '' : '\n';
    sourceReplace(lineEnd, lineEnd, lead + text + tail);
    return true;
  }
  commitOpenEdits();
  if (bm.kind !== 'block' && bm.kind !== 'paper') return false;
  let i = bm.i;
  i = Math.max(0, Math.min(blocks.length - 1, i));
  const parts = splitToBlocks(text);
  const seq = [...(blocks[i] && blocks[i].trim() ? [''] : []), ...parts, ...(blocks[i + 1] !== undefined && blocks[i + 1].trim() ? [''] : [])];
  pushUndo();
  for (let k = 0; k < seq.length; k++) insertBlockAfter(i + k, seq[k]);
  onEdited();
  flash(i + (blocks[i] && blocks[i].trim() ? 2 : 1));
  return true;
}
/* 行內記號（引用、交叉引用）：插在記下的游標處；沒有游標就請使用者先點一下。 */
function insertInlineText(text) {
  const bm = bookmark || { kind: 'none' };
  if (bm.kind === 'source' && srcMode()) { sourceReplace(bm.s, bm.e, text); return true; }
  if (bm.kind === 'paper') {
    const pe = document.getElementById('pe-text');
    if (pe && typeof peIndex !== 'undefined' && peIndex === bm.i) {
      pe.focus(); pe.setSelectionRange(bm.s, bm.e); peReplaceRange(bm.s, bm.e, text);
      try { if (typeof paperEditSyncFromTextarea === 'function') paperEditSyncFromTextarea(); } catch (_) {}
      return true;
    }
    return replaceBlocks(arr => (arr[bm.i] === undefined ? null : { i: bm.i, j: bm.i, text: arr[bm.i] }),
      String(blocks[bm.i] || '').slice(0, bm.s) + text + String(blocks[bm.i] || '').slice(bm.e));
  }
  if (bm.kind === 'block' && bm.off !== null) {
    try { activate(bm.i, bm.off); insertTextAtCaret(text); return true; } catch (_) { return false; }
  }
  return false;
}

function doGo() {
  if (!curTool) return;
  if (ctx && ctx.marker >= 0) {
    const i = ctx.marker;
    hidePanel();
    if (srcMode()) { try { const arr = splitToBlocks(String(srcview.value || '')); srcview.focus(); srcJumpToOffset(sourceOffset(arr, i), true, true); } catch (_) {} }
    else flash(i);
    return;
  }
  let text = '';
  try { text = curTool.build(values); } catch (e) {
    K.log && K.log.error && K.log.error('papertools', T('產生語法失敗', 'Failed to build syntax'), e);
    warn(T('產生內容時出錯了。', 'Something went wrong building the text.')); return;
  }
  if (!text) { warn(T('還沒有填內容。', 'Nothing filled in yet.')); return; }
  if (!(ctx && ctx.existing) && (!bookmark || bookmark.kind === 'none')) { warn(NO_PLACE()); return; }
  let ok = false;
  try {
    if (ctx && ctx.existing) ok = replaceBlocks(arr => curTool.single.find(arr, values), text);
    else if (curTool.inline) ok = insertInlineText(text);
    else ok = insertBlockText(text);
  } catch (e) {
    K.log && K.log.error && K.log.error('papertools', T('寫入失敗', 'Write failed'), e);
  }
  if (!ok) { warn(curTool.inline ? NO_PLACE() : T('找不到要改的地方，文件可能已經變了；重新打開再試一次。', 'Could not find the place to change; reopen and try again.')); return; }
  hidePanel();
}

/* ---------- 掛到工具列 ---------------------------------------------------- */
function mount() {
  const bar = document.getElementById('ty-toolbar');
  if (!bar) return;
  const row = bar.querySelector('.tb-row');
  if (!row) return;
  if (row.querySelector('.' + MOUNT_CLASS)) return;
  ensureStyle();
  const g = document.createElement('div');
  g.className = MOUNT_CLASS;
  g.setAttribute('aria-label', T('論文語法工具','Paper syntax tools'));
  for (const grp of GROUPS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tb-btn';
    b.dataset.ptGroup = grp.id;
    /* data-action + data-zh/data-en 是格式列即時提示（tbTipShow）認得的掛鉤；pt- 前綴避開 TB_CATALOG 的工具 id。 */
    b.dataset.action = 'pt-' + grp.id;
    b.setAttribute('data-zh', grp.title[0]);
    b.setAttribute('data-en', grp.title[1]);
    b.textContent = grp.label;
    b.title = T(grp.title[0], grp.title[1]);
    b.setAttribute('aria-label', T(grp.title[0], grp.title[1]));
    b.addEventListener('mousedown', e => e.preventDefault());   /* 保住編輯區選取 */
    b.addEventListener('click', () => openGroup(grp.id, b));
    g.appendChild(b);
  }
  const more = row.querySelector('.tb-more-btn');
  if (more) row.insertBefore(g, more); else row.appendChild(g);
  if (typeof syncVisibility === 'function') syncVisibility();
}

/* 國際論文模式只顯示 REV、臺灣論文模式只顯示 TW；一般 Markdown 模式兩個都顯示。 */
function syncVisibility() {
  const mode = docMode();
  document.querySelectorAll('#ty-toolbar .' + MOUNT_CLASS + ' .tb-btn').forEach(b => {
    b.hidden = (mode === 'intl' && b.dataset.ptGroup === 'twthesis') || (mode === 'tw' && b.dataset.ptGroup === 'rev');
  });
  if (panel && !panel.hidden && curGroup) {
    const b = document.querySelector('#ty-toolbar .' + MOUNT_CLASS + ' .tb-btn[data-pt-group="' + curGroup + '"]');
    if (b && b.hidden) hidePanel();
  }
}

/* tbBuild() 會 textContent='' 整條重建，所以用 observer 補回自己這一段。
   模式切換會改 html／body 的 class 或 data-theme，同樣在這裡更新顯示哪一組。 */
function watch() {
  const bar = document.getElementById('ty-toolbar');
  if (!bar) return;
  try {
    new MutationObserver(() => { mount(); }).observe(bar, { childList: true });
    let raf = 0;
    const later = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; syncVisibility(); }); };
    const mo = new MutationObserver(later);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    if (document.body) mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    if (K.on) { K.on('flag', later); K.on('enterIntlMode', later); }
  } catch (_) { /* 無 MutationObserver 的測試環境：靠下面的輪詢 */ }
}

function boot() {
  mount(); watch();
  /* 工具列可能在 CP171 之後才建好（還原流程、顯示工具列開關），前 20 秒每 500ms 補一次，之後交給 observer。 */
  let n = 0;
  const iv = setInterval(() => { mount(); if (++n > 40) clearInterval(iv); }, 500);
}

try {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
} catch (e) { K.log && K.log.error && K.log.error('papertools', T('boot 失敗', 'Boot failed'), e); }

/* window 的捕獲階段比宿主掛在 document 上的處理器都早：在段落編輯框被收起之前先記下游標。 */
window.addEventListener('mousedown', e => {
  if (e.target && e.target.closest && e.target.closest('#ty-toolbar .' + MOUNT_CLASS + ' .tb-btn')) early = { at: Date.now(), bm: captureBookmark() };
}, true);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && panel && !panel.hidden) { hidePanel(); e.stopPropagation(); }
}, true);
document.addEventListener('mousedown', e => {
  if (!panel || panel.hidden) return;
  if (panel.contains(e.target)) return;
  if (e.target.closest && e.target.closest('#ty-toolbar .' + MOUNT_CLASS)) return;
  hidePanel();
}, true);
window.addEventListener('resize', () => {
  if (!panel || panel.hidden) return;
  const b = document.querySelector('#ty-toolbar .' + MOUNT_CLASS + ' .tb-btn.pt-open');
  if (b) position(b); else hidePanel();
});

/* 核心 K 是凍結物件，對外介面掛在自己的全域名稱下（網站導覽用 open(群組, 按鈕)）。 */
const API = {
  open: openGroup,
  close: hidePanel,
  select: id => selectTool(id),
  groups: () => GROUPS.map(g => ({ id: g.id, tools: g.tools.map(t => t.id) })),
  buildOnly: (gid, tid, v) => {
    const g = GROUPS.find(x => x.id === gid); if (!g) return '';
    const t = g.tools.find(x => x.id === tid); if (!t) return '';
    return t.build(v || {});
  },
  readOnly: (gid, tid, text) => {
    const g = GROUPS.find(x => x.id === gid); const t = g && g.tools.find(x => x.id === tid);
    return t && t.single ? t.single.read(String(text || '')) : null;
  }
};
try { window.__CP171_PTOOLS__ = API; } catch (_) {}
try { if (Object.isExtensible(K)) K.papertools = API; } catch (_) {}
K.log && K.log.info && K.log.info('papertools', T('論文語法工具列已就緒', 'Paper syntax toolbar ready'));
})();
