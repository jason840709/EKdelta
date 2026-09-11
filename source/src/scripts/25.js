
/* ============================================================================
 * cp171-58-papertools — Markdown 編輯器 · 論文語法工具列
 *
 * 為什麼要有這個東西（使用者原話）：
 *   「我們本來做這個程式碼的初衷，就是希望讓使用者不必去學習這些複雜的
 *     LaTeX 語法，結果現在我們自己又設計了一套語法出來，這樣並不是很好。」
 *   「連我像這樣子當作者的都記不清楚。」
 *
 *   REVTeX 管線為了表達 LaTeX 的前置區、跨欄、附錄、書目…，前後累積出
 *   九類自創圍欄與一批行內記號。它們解決了真問題，但代價是使用者要背。
 *   這個模組把它們全部變成「填表 → 按插入」，語法字串由程式產生。
 *
 * 放在哪裡：
 *   格式工具列（#ty-toolbar）最右側，與前面的格式鈕之間有一道分隔線。
 *   分類鈕 REV／TW 永遠不被寬度收納——收納的是格式鈕那一區（.tb-items），
 *   這一區是它的兄弟節點，不進收納計算。
 *
 * 邊界（隔離規約）：
 *   · 只讀寫 #cp171-ptools 這棵子樹與工具列裡自己插入的那一段
 *   · 插入一律走宿主既有的 insertParagraphSyntax()／insertTextAtCaret()，
 *     不自己動 blocks 陣列——那是宿主的資料模型，繞過去必然出事
 *   · tbBuild() 會把整條工具列 textContent='' 重建，所以靠 MutationObserver
 *     補回自己那一段，而不是去改宿主的 tbBuild
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

/* ★ 判斷語言與主題一律讀 DOM，不要讀 window.settings 或 window.TT。
   實機驗證過三件事：
     · 宿主的 settings 是 IIFE 內的區域變數，window.settings === undefined
     · const 宣告的 TT／isEN／isTwThesisEnglishTheme 也不在 window 上（只有 function
       宣告的 setTheme／insertParagraphSyntax 等才在）
     · setLang() 會寫 document.documentElement.lang 與 body.lang-en，
       setTheme() 會寫 body.twthesis-en-thesis —— 這兩個才是模組看得到的可靠訊號
   這個陷阱讓英文介面的工具列文案與封面自動預選長期失效而沒被發現。 */
const zhEN = () => {
  try {
    if (document.body && document.body.classList.contains('lang-en')) return true;
    const l = document.documentElement && document.documentElement.lang;
    return typeof l === 'string' && l.toLowerCase().indexOf('en') === 0;
  } catch (_) { return false; }
};
const isTwThesisEnglish = () => {
  try { return !!(document.body && document.body.classList.contains('twthesis-en-thesis')); }
  catch (_) { return false; }
};
const T = (zh, en) => (zhEN() ? en : zh);
/* OUT() 是明示的排除標記，不是包裝：被它包住的中文是「要寫進使用者 .md 檔
   的內容」（Markdown 記號、章名、關鍵字標籤），不是介面文字。這種字串
   絕對不能進 i18n 字典——進了字典就會在英文介面下被翻掉，使用者文件裡
   就會冒出英文記號。i18n 覆蓋率稽核認得這個標記並跳過。 */
const OUT = s => s;

/* ---------- 表單語言：欄位定義 -------------------------------------------
 * 每個工具 = { id, short, title, hint, fields[], build(v) }
 *   short  是工具列浮動視窗頂部那一排小按鈕的字（使用者明示：要寫「摘要」，
 *          不是「REVTEX Abstract」）
 *   fields 支援 text / textarea / check / select / list
 *   list   是可增減的重複列，rows 裡每一格自己也是 text/select
 *   build  拿到 values 物件，回傳要塞進編輯器的完整語法字串
 * ------------------------------------------------------------------------ */

const esc = s => String(s == null ? '' : s).replace(/\r/g, '').trim();
const lines = arr => arr.filter(x => x !== null && x !== undefined && x !== '').join('\n');

/* 把重複列裡空白的整列丟掉——使用者按了「新增作者」卻沒填，不該產生空欄位 */
const nonEmptyRows = rows => (rows || []).filter(r => Object.keys(r).some(k => esc(r[k])));

const REVTEX_TOOLS = [
  {
    id: 'frontmatter',
    short: ['前置', 'Front'],
    title: ['論文前置區（標題、作者、單位、關鍵字）', 'Front matter (title, authors, affiliations, keywords)'],
    hint: ['單位先在下面列出來，作者再用編號指過去，不必把長長的單位名稱重複貼十幾次。',
           'List affiliations once below, then point each author at them by number.'],
    fields: [
      { k: 'title', type: 'text', label: ['標題', 'Title'], ph: ['論文標題', 'Paper title'] },
      { k: 'affils', type: 'list', label: ['機構（依序編號 1、2、3…）', 'Affiliations (numbered 1, 2, 3…)'],
        addLabel: ['新增機構', 'Add affiliation'], numbered: true,
        rows: [{ k: 'name', type: 'text', label: ['機構名稱', 'Affiliation'], grow: true,
                 ph: ['例：Department of Physics, Tsinghua University, Beijing 100084, China',
                      'e.g. Department of Physics, Tsinghua University, Beijing 100084, China'] }] },
      { k: 'authors', type: 'list', label: ['作者', 'Authors'], addLabel: ['新增作者', 'Add author'],
        rows: [
          { k: 'name', type: 'text', label: ['姓名', 'Name'], grow: true, ph: ['Yuxiang Wang', 'Yuxiang Wang'] },
          { k: 'affil', type: 'text', label: ['屬於第幾個機構', 'Affiliation no.'], w: 118, ph: ['1 或 1,3', '1 or 1,3'] },
          { k: 'email', type: 'text', label: ['通訊信箱', 'Email'], w: 178, ph: ['選填', 'optional'] },
          { k: 'thanks', type: 'text', label: ['作者註記', 'Note'], w: 178,
            ph: ['選填，例：These authors contributed equally.', 'optional'] }
        ] },
      { k: 'collaboration', type: 'text', label: ['合作團隊名稱', 'Collaboration'], ph: ['選填', 'optional'] },
      { k: 'keywords', type: 'text', label: ['關鍵字（用分號隔開）', 'Keywords (semicolon separated)'],
        ph: ['例：Large materials model; Deep learning', 'e.g. Large materials model; Deep learning'] },
      { k: 'pacs', type: 'text', label: ['PACS 代碼', 'PACS'], ph: ['選填', 'optional'] },
      { k: 'preprint', type: 'text', label: ['預印本編號', 'Preprint number'], ph: ['選填', 'optional'] },
      { k: 'date', type: 'text', label: ['日期', 'Date'], ph: ['選填，留空由 LaTeX 填今天', 'optional'] }
    ],
    build(v) {
      const out = [];
      if (esc(v.title)) out.push('title: ' + esc(v.title));
      if (esc(v.collaboration)) out.push('collaboration: ' + esc(v.collaboration));
      const affils = nonEmptyRows(v.affils);
      if (affils.length) {
        out.push('affiliations:');
        for (const a of affils) out.push('  - ' + esc(a.name));
      }
      for (const a of nonEmptyRows(v.authors)) {
        if (!esc(a.name)) continue;
        out.push('author: ' + esc(a.name));
        if (esc(a.thanks)) out.push('thanks: ' + esc(a.thanks));
        if (esc(a.email)) out.push('email: ' + esc(a.email));
        if (esc(a.affil)) {
          /* 有機構清單就用索引（affil:），沒有就退回把整串當單位名稱寫死，
             免得使用者只填了作者、什麼都產不出來。 */
          if (affils.length) out.push('affil: ' + esc(a.affil).replace(/\s+/g, ''));
          else out.push('affiliation: ' + esc(a.affil));
        }
      }
      if (esc(v.keywords)) out.push('keywords: ' + esc(v.keywords));
      if (esc(v.pacs)) out.push('pacs: ' + esc(v.pacs));
      if (esc(v.preprint)) out.push('preprint: ' + esc(v.preprint));
      if (esc(v.date)) out.push('date: ' + esc(v.date));
      return '```revtex-frontmatter\n' + lines(out) + '\n```';
    }
  },
  {
    id: 'abstract',
    short: ['摘要', 'Abstract'],
    title: ['摘要', 'Abstract'],
    hint: ['空一行就是新的一段，REVTeX 支援多段摘要。', 'Blank line starts a new paragraph; multi-paragraph abstracts are supported.'],
    fields: [{ k: 'body', type: 'textarea', rows: 8, label: ['摘要內文', 'Abstract text'] }],
    build(v) { return '```revtex-abstract\n' + esc(v.body) + '\n```'; }
  },
  {
    id: 'nonum',
    short: ['不編號章節', 'Unnumbered'],
    title: ['不編號的章節標題', 'Unnumbered section heading'],
    hint: ['印出來是 INTRODUCTION 而不是 I. INTRODUCTION。自然科學的綜合期刊很常用。',
           'Prints as INTRODUCTION instead of I. INTRODUCTION — common in multidisciplinary journals.'],
    fields: [
      { k: 'text', type: 'text', label: ['標題文字', 'Heading text'], ph: ['Introduction', 'Introduction'] },
      { k: 'lv', type: 'select', label: ['層級', 'Level'],
        opts: [['1', ['一級（章）', 'Level 1 (section)']], ['2', ['二級（節）', 'Level 2 (subsection)']],
               ['3', ['三級', 'Level 3 (subsubsection)']]] }
    ],
    build(v) {
      const n = Math.max(1, Math.min(3, parseInt(v.lv || '1', 10) || 1));
      return '#'.repeat(n) + ' ' + (esc(v.text) || 'Section') + ' {-}';
    }
  },
  {
    id: 'cite',
    short: ['引用', 'Cite'],
    title: ['內文引用', 'In-text citation'],
    inline: true,
    hint: ['直接寫編號就好：3 是單筆，1,3 是兩筆，2-14 是連號（PDF 會自己印成 [2–14]）。',
           'Just type numbers: 3, or 1,3, or 2-14 for a run (the PDF prints [2–14]).'],
    fields: [{ k: 'n', type: 'text', label: ['編號', 'Numbers'], ph: ['1  或  1,3  或  2-14', '1  or  1,3  or  2-14'] }],
    build(v) { const n = esc(v.n).replace(/\s+/g, ''); return n ? '[[' + n + ']]' : ''; }
  },
  {
    id: 'equation',
    short: ['公式', 'Equation'],
    title: ['帶標籤的公式（給交叉引用指過來）', 'Labelled equation (for cross-references)'],
    hint: ['標籤選填；有填才能被「交叉引用」工具的 eqref 指到。這是跟插圖同一套 {#id} 慣例，只是使用者原本要自己記。',
           'The label is optional; fill it in if the equation needs to be pointed at with the “Cross-reference” tool. '
           + 'This is the same {#id} convention used for figures — previously you had to remember the syntax yourself.'],
    fields: [
      { k: 'body', type: 'text', label: ['算式（不含 $$）', 'Expression (without $$)'], ph: ['E = mc^2', 'E = mc^2'] },
      { k: 'id', type: 'text', label: ['標籤（選填）', 'Label (optional)'], ph: ['eq1', 'eq1'] }
    ],
    build(v) {
      const b = esc(v.body); if (!b) return '';
      const id = esc(v.id);
      return '$$\n' + b + '\n$$' + (id ? ' {#' + id + '}' : '');
    }
  },
  {
    id: 'xref',
    short: ['交叉引用', 'Xref'],
    title: ['交叉引用（指向圖、表、公式、章節）', 'Cross-reference (figure, table, equation, section)'],
    inline: true,
    hint: ['指的是你在插圖或公式上設的那個標籤。公式選 eqref 會自動加括號。',
           'Points at a label you set on a figure or equation. eqref adds the parentheses.'],
    fields: [
      { k: 'id', type: 'text', label: ['標籤', 'Label'], ph: ['fig1', 'fig1'] },
      { k: 'kind', type: 'select', label: ['種類', 'Kind'],
        opts: [['ref', ['圖／表／章節（ref）', 'Figure / table / section (ref)']],
               ['eqref', ['公式（eqref，會加括號）', 'Equation (eqref, adds parentheses)']]] }
    ],
    build(v) { const id = esc(v.id); return id ? '\\' + (v.kind || 'ref') + '{' + id + '}' : ''; }
  },
  {
    id: 'table',
    short: [OUT('表格'), 'Table'],
    title: [OUT('表格（含合併儲存格）'), 'Table (with merged cells)'],
    hint: [OUT('資料儲存格打勾「併左」會把該格併入左邊那格——這是我們自創的語法：格子裡只寫一個 > 字元。這裡不用記，勾選就自動處理。表頭列不能合併。'),
           'Ticking \u201cmerge\u201d on a data cell merges it into the cell on its left \u2014 the underlying syntax is a cell whose entire content is a single > character. You don\u2019t need to know that; the checkbox handles it. The header row cannot merge.'],
    fields: [
      { k: 'grid', type: 'table', label: [OUT('表格內容'), 'Table content'] },
      { k: 'caption', type: 'text', label: [OUT('表格標題（選填）'), 'Caption (optional)'] },
      { k: 'id', type: 'text', label: [OUT('標籤（選填，供交叉引用）'), 'Label (optional, for cross-references)'], ph: ['tab1', 'tab1'] }
    ],
    build(v) {
      const st = (v.__tbl && v.__tbl.grid) || null;
      if (!st || !st.cells.length) return '';
      const alignMark = { l: '---', c: ':---:', r: '---:' }[st.align] || '---';
      const lines = [];
      const rowOut = row => '| ' + row.map(c => (c.merge ? '>' : esc(c.text) || ' ')).join(' | ') + ' |';
      lines.push(rowOut(st.cells[0]));
      lines.push('|' + Array(st.cols).fill(alignMark).join('|') + '|');
      for (let r = 1; r < st.cells.length; r++) lines.push(rowOut(st.cells[r]));
      const cap = esc(v.caption);
      const id = esc(v.id);
      if (cap || id) lines.push(': ' + cap + (id ? ' {#' + id + '}' : ''));
      return lines.join('\n');
    }
  },
  {
    id: 'figure',
    short: ['插圖', 'Figure'],
    title: ['插圖', 'Figure'],
    hint: ['勾了「跨欄」就是 figure*（橫跨雙欄的大圖）。標籤用來給交叉引用指過來。',
           'Tick “wide” for figure* (spanning both columns). The label is what cross-references point at.'],
    fields: [
      { k: 'cap', type: 'textarea', rows: 3, label: ['圖說', 'Caption'] },
      { k: 'src', type: 'text', label: ['圖檔路徑', 'Image path'], ph: ['figs/fig1.png', 'figs/fig1.png'] },
      { k: 'id', type: 'text', label: ['標籤（交叉引用用）', 'Label (for cross-references)'], ph: ['fig1', 'fig1'] },
      { k: 'wide', type: 'check', label: ['跨欄大圖（figure*）', 'Wide figure (figure*)'] }
    ],
    build(v) {
      const attr = [esc(v.id) ? '#' + esc(v.id) : '', v.wide ? 'wide' : ''].filter(Boolean).join(' ');
      return '![' + esc(v.cap) + '](' + (esc(v.src) || 'figs/fig1.png') + ')' + (attr ? '{' + attr + '}' : '');
    }
  },
  {
    id: 'wide',
    short: ['跨欄', 'Wide'],
    title: ['跨欄區塊（橫跨雙欄版面）', 'Full-width block across both columns'],
    hint: ['放大表格或寬公式用。上下那兩條短線是 REVTeX 官方的接續記號，不是瑕疵。',
           'For wide tables or equations. The two short rules above/below are official REVTeX continuation marks.'],
    fields: [{ k: 'body', type: 'textarea', rows: 7, label: ['內容（Markdown 表格、$$ 公式或段落都可以）', 'Content (table, $$ math, or paragraphs)'] }],
    build(v) { return '```revtex-wide\n' + esc(v.body) + '\n```'; }
  },
  {
    id: 'longtable',
    short: ['長表格', 'Long tbl'],
    title: ['長表格（跨頁、每頁重複表頭）', 'Long table (spans pages, header repeats)'],
    hint: ['寫成一般的 Markdown 表格就好，跨頁與表頭重複由 LaTeX 處理。',
           'Write a normal Markdown table; page breaks and repeated headers are handled for you.'],
    fields: [{ k: 'body', type: 'textarea', rows: 7, label: ['Markdown 表格', 'Markdown table'],
               ph: ['| 欄一 | 欄二 |\n|---|---|\n| a | b |', '| A | B |\n|---|---|\n| a | b |'] }],
    build(v) { return '```revtex-longtable\n' + esc(v.body) + '\n```'; }
  },
  {
    id: 'turnpage',
    short: ['橫置', 'Rotate'],
    title: ['橫置表格／圖（整頁旋轉 90 度）', 'Turnpage: rotate a table or figure 90°'],
    hint: ['官方限制：一個橫置區塊只能放一個表或一張圖，而且不能跨頁。',
           'Official limit: exactly one table or figure, and it cannot span pages.'],
    fields: [{ k: 'body', type: 'textarea', rows: 7, label: ['表格或圖（Markdown）', 'Table or figure (Markdown)'] }],
    build(v) { return '```revtex-turnpage\n' + esc(v.body) + '\n```'; }
  },
  {
    id: 'subeq',
    short: ['子公式', 'Sub-eq'],
    title: ['子公式組（編號 1a、1b、1c）', 'Subequations (numbered 1a, 1b, 1c)'],
    hint: ['一筆一條算式，跟書目一樣新增、填、刪除、整批插入。只要寫算式本體，$$ 由程式補上，順序就是 a/b/c 的順序。',
           'One card per expression — add, fill, delete, then insert together. Just the expression itself; '
           + '$$ delimiters are added for you, and card order becomes the a/b/c order.'],
    fields: [{ k: 'items', type: 'entrylist', showIndex: false,
               label: ['算式清單', 'Expressions'], addLabel: ['新增算式', 'Add expression'],
               primary: { type: 'text', ph: ['E = mc^2', 'E = mc^2'] } }],
    build(v) {
      const rows = (v.items || []).map(r => esc(r.text).replace(/^\$\$|\$\$$/g, '').trim()).filter(Boolean);
      if (!rows.length) return '';
      return '```revtex-subequations\n' + rows.map(r => '$$\n' + r + '\n$$').join('\n\n') + '\n```';
    }
  },
  {
    id: 'ack',
    short: ['致謝', 'Ack.'],
    title: ['致謝', 'Acknowledgments'],
    hint: ['會排在正文之後、附錄與書目之前，位置由期刊樣式決定。',
           'Placed after the body text; exact position follows the journal style.'],
    fields: [{ k: 'body', type: 'textarea', rows: 5, label: ['致謝內文', 'Acknowledgment text'] }],
    build(v) { return '```revtex-acknowledgments\n' + esc(v.body) + '\n```'; }
  },
  {
    id: 'appendix',
    short: ['附錄', 'Appx'],
    title: ['附錄起點', 'Start of appendices'],
    hint: ['放一個標記就好，從這裡之後的章節都會變成附錄 A、附錄 B…（公式編號跟著變 (A1)）。',
           'Just a marker: sections after it become Appendix A, B… and equations renumber to (A1).'],
    fields: [{ k: 'first', type: 'text', label: ['順便建立第一個附錄標題（選填）', 'Also create the first appendix heading (optional)'],
               ph: ['例：計算細節', 'e.g. Computational details'] }],
    build(v) {
      const t = esc(v.first);
      return '```revtex-appendix\n```' + (t ? '\n\n# ' + t : '');
    }
  },
  {
    id: 'bib',
    short: ['書目', 'Refs'],
    title: ['參考文獻清單', 'Bibliography'],
    hint: ['一筆一張卡片，跟「前置」的作者清單同一種邏輯：新增一筆、填、要刪再刪，最後按插入整批塞進去。編號依卡片順序自動補上 [1] [2] [3]…，內文用「引用」那個工具寫 [[1]] 指過來。',
           'One card per reference — add, fill, delete as needed, then insert them all at once. Numbers are added in card order; cite them in the text with the “Cite” tool ([[1]]).'],
    fields: [
      { k: 'items', type: 'entrylist', showIndex: true,
        label: ['文獻清單', 'References'], addLabel: ['新增文獻', 'Add reference'],
        primary: { type: 'textarea', rows: 2,
          ph: ['Martin RM. Electronic structure. Cambridge University Press, 2004.',
               'Martin RM. Electronic structure. Cambridge University Press, 2004.'] } }
    ],
    build(v) {
      const items = (v.items || []).map(r => esc(r.text)).filter(Boolean);
      if (!items.length) return '';
      return '```revtex-bibliography\n' + items.map((t, i) => '[' + (i + 1) + '] ' + t).join('\n') + '\n```';
    }
  },
  {
    id: 'rawtex',
    short: ['原生 TeX', 'Raw TeX'],
    title: ['原生 LaTeX 逃生區塊', 'Raw LaTeX escape hatch'],
    hint: ['真的需要手寫 LaTeX 時用這個，內容會原樣送進 .tex 不做任何轉換。',
           'For the rare case you must hand-write LaTeX; the content passes through untouched.'],
    fields: [{ k: 'body', type: 'textarea', rows: 6, label: ['LaTeX 原始碼', 'LaTeX source'] }],
    build(v) { return '```tex\n' + esc(v.body) + '\n```'; }
  }
];

/* ---------- 臺灣論文模式 ---------------------------------------------
   這一組的語法本來就比較清爽（引用就是 [[N]]、參考文獻就是 [N] …），
   1.1.5.6.1 已經把 REVTeX 那邊也收斂成同一套。這裡把前置章、關鍵字、
   圖說這些「要記格式但不難」的東西一起做成表單。                        */
/* 1.1.5.6.8：原本誌謝／目錄／參考文獻只給了中文選項，twthesis-en-thesis（英文論文模式）
   下使用者其實需要 Acknowledgements／Contents／References 這幾個英文標題字面值
   才會被原生解析器的關鍵字比對認得——之前這三項完全沒有英文版可選，等於在
   英文模式下這個工具是半殘的。現在中英各自成一個選項。 */
const TW_THESIS_FM_CHAPTERS = [
  [OUT('摘要'), ['摘要', 'Chinese abstract']],
  ['Abstract', ['英文摘要', 'English abstract']],
  [OUT('誌謝'), ['誌謝（中文）', 'Acknowledgements (Chinese heading)']],
  ['Acknowledgements', ['誌謝（英文）', 'Acknowledgements (English heading)']],
  [OUT('目錄'), ['目錄（中文）', 'Contents (Chinese heading)']],
  ['Contents', ['目錄（英文）', 'Contents (English heading)']],
  [OUT('參考文獻'), ['參考文獻（中文）', 'References (Chinese heading)']],
  ['References', ['參考文獻（英文）', 'References (English heading)']]
];

const TW_THESIS_TOOLS = [
  {
    id: 'twthesis-cover',
    short: [OUT('封面'), 'Cover'],
    title: ['論文封面', 'Title page'],
    hint: ['這是原生程式碼裡真的在解析的欄位，只是印出來的時候不會寫「指導教授中文」這種詞，而是顯示成「指導教授：」後面接你填的名字。中文欄位留空會用中山大學物理系的預留字，英文欄位留空一樣有預留字，不會噴錯。哪個語言的欄位會用到，跟你目前的主題（中文版／English）有關，下面先選一次，不確定就照目前主題選的那個。',
           'These are the fields the renderer actually parses; at render time it never prints the raw field name, it prints a proper label followed by whatever you typed. Blank fields fall back to reasonable placeholder text. Which set applies depends on your current theme (Chinese vs English TW_THESIS) — pick below; if unsure, match your current theme.'],
    fields: [
      { k: 'mode', type: 'select', reflow: true, label: [OUT('封面語言'), 'Cover language'],
        opts: [['zh', [OUT('中文版（中山制式）'), 'Chinese (NSYSU formal)']], ['en', ['English', 'English']]] },
      // ---- 中文欄位 ----
      { k: 'university_zh', type: 'text', showIf: v => v.mode !== 'en', label: [OUT('學校名稱（中文）'), 'University (Chinese)'], ph: [OUT('國立中山大學'), '國立中山大學'] },
      { k: 'dept_zh', type: 'text', showIf: v => v.mode !== 'en', label: [OUT('系所（中文）'), 'Department (Chinese)'], ph: [OUT('物理學系'), '物理學系'] },
      { k: 'degree_zh', type: 'text', showIf: v => v.mode !== 'en', label: [OUT('論文類型（中文）'), 'Thesis type (Chinese)'], ph: [OUT('碩士論文'), '碩士論文'] },
      { k: 'university_en2', type: 'text', showIf: v => v.mode !== 'en', label: [OUT('學校名稱（英文，印在中文封面上）'), 'University (English, shown on Chinese cover)'], ph: ['National Sun Yat-sen University', 'National Sun Yat-sen University'] },
      { k: 'dept_en2', type: 'text', showIf: v => v.mode !== 'en', label: [OUT('系所（英文，印在中文封面上）'), 'Department (English, shown on Chinese cover)'], ph: ['Department of Physics', 'Department of Physics'] },
      { k: 'degree_en2', type: 'text', showIf: v => v.mode !== 'en', label: [OUT('論文類型（英文，印在中文封面上）'), 'Thesis type (English, shown on Chinese cover)'], ph: ['Master\u2019s Thesis', 'Master\u2019s Thesis'] },
      { k: 'title_zh', type: 'text', showIf: v => v.mode !== 'en', label: [OUT('論文標題（中文）'), 'Title (Chinese)'] },
      { k: 'title_en2', type: 'text', showIf: v => v.mode !== 'en', label: [OUT('論文標題（英文）'), 'Title (English)'] },
      { k: 'student_zh', type: 'text', showIf: v => v.mode !== 'en', label: [OUT('研究生（中文）'), 'Student (Chinese)'] },
      { k: 'student_en2', type: 'text', showIf: v => v.mode !== 'en', label: [OUT('研究生（英文）'), 'Student (English)'] },
      { k: 'advisor_zh', type: 'text', showIf: v => v.mode !== 'en', label: [OUT('指導教授（中文）'), 'Advisor (Chinese)'] },
      { k: 'advisor_en2', type: 'text', showIf: v => v.mode !== 'en', label: [OUT('指導教授（英文）'), 'Advisor (English)'] },
      { k: 'date_zh', type: 'text', showIf: v => v.mode !== 'en', label: [OUT('日期（中文）'), 'Date (Chinese)'], ph: [OUT('中華民國一一五年七月'), '中華民國一一五年七月'] },
      { k: 'date_en2', type: 'text', showIf: v => v.mode !== 'en', label: [OUT('日期（英文）'), 'Date (English)'], ph: ['July 2026', 'July 2026'] },
      // ---- 英文欄位 ----
      { k: 'lab', type: 'text', showIf: v => v.mode === 'en', label: ['Laboratory', 'Laboratory'] },
      { k: 'title', type: 'text', showIf: v => v.mode === 'en', label: ['Title', 'Title'] },
      { k: 'author', type: 'text', showIf: v => v.mode === 'en', label: ['Author', 'Author'] },
      { k: 'statement', type: 'text', showIf: v => v.mode === 'en', label: ['Thesis statement', 'Thesis statement'], ph: ['A dissertation for the degree of', 'A dissertation for the degree of'] },
      { k: 'degree', type: 'text', showIf: v => v.mode === 'en', label: ['Degree', 'Degree'], ph: ['Master of Science', 'Master of Science'] },
      { k: 'department', type: 'text', showIf: v => v.mode === 'en', label: ['Department', 'Department'] },
      { k: 'university', type: 'text', showIf: v => v.mode === 'en', label: ['University', 'University'] },
      { k: 'date', type: 'text', showIf: v => v.mode === 'en', label: ['Date', 'Date'], ph: ['July 2026', 'July 2026'] }
    ],
    build(v) {
      const out = [];
      if (v.mode === 'en') {
        if (esc(v.lab)) out.push('laboratory: ' + esc(v.lab));
        if (esc(v.title)) out.push('title: ' + esc(v.title));
        if (esc(v.author)) out.push('author: ' + esc(v.author));
        if (esc(v.statement)) out.push('thesis statement: ' + esc(v.statement));
        if (esc(v.degree)) out.push('degree: ' + esc(v.degree));
        if (esc(v.department)) out.push('department: ' + esc(v.department));
        if (esc(v.university)) out.push('university: ' + esc(v.university));
        if (esc(v.date)) out.push('date: ' + esc(v.date));
      } else {
        if (esc(v.university_zh)) out.push(OUT('\u6821\u540d\u4e2d\u6587: ') + esc(v.university_zh));
        if (esc(v.dept_zh)) out.push(OUT('\u7cfb\u6240\u4e2d\u6587: ') + esc(v.dept_zh));
        if (esc(v.degree_zh)) out.push(OUT('\u8ad6\u6587\u985e\u578b\u4e2d\u6587: ') + esc(v.degree_zh));
        if (esc(v.dept_en2)) out.push(OUT('\u7cfb\u6240\u82f1\u6587: ') + esc(v.dept_en2));
        if (esc(v.university_en2)) out.push(OUT('\u5927\u5b78\u82f1\u6587: ') + esc(v.university_en2));
        if (esc(v.degree_en2)) out.push(OUT('\u8ad6\u6587\u985e\u578b\u82f1\u6587: ') + esc(v.degree_en2));
        if (esc(v.title_zh)) out.push(OUT('\u4e2d\u6587\u6a19\u984c: ') + esc(v.title_zh));
        if (esc(v.title_en2)) out.push(OUT('\u82f1\u6587\u6a19\u984c: ') + esc(v.title_en2));
        if (esc(v.student_zh)) out.push(OUT('\u7814\u7a76\u751f\u4e2d\u6587: ') + esc(v.student_zh));
        if (esc(v.student_en2)) out.push(OUT('\u7814\u7a76\u751f\u82f1\u6587: ') + esc(v.student_en2));
        if (esc(v.advisor_zh)) out.push(OUT('\u6307\u5c0e\u6559\u6388\u4e2d\u6587: ') + esc(v.advisor_zh));
        if (esc(v.advisor_en2)) out.push(OUT('\u6307\u5c0e\u6559\u6388\u82f1\u6587: ') + esc(v.advisor_en2));
        if (esc(v.date_zh)) out.push(OUT('\u65e5\u671f\u4e2d\u6587: ') + esc(v.date_zh));
        if (esc(v.date_en2)) out.push(OUT('\u65e5\u671f\u82f1\u6587: ') + esc(v.date_en2));
      }
      if (!out.length) return '';
      return '```twthesis-titlepage\n' + out.join('\n') + '\n```';
    }
  },
  {
    id: 'twthesis-titleback',
    short: ['Titleback', 'Titleback'],
    title: ['Titleback（英文論文專用的版權頁）', 'Titleback (English-thesis copyright page)'],
    hint: [OUT('只有英文論文模式會用到這一頁，中文版沒有這個頁面。內容是一段自動組合的摘要句＋指導教授／地點／時間三行。'),
           'Only used in English-thesis mode; the Chinese template has no equivalent page. Renders as one auto-composed summary sentence plus three key/value lines (Supervisor / Place / Time).'],
    fields: [
      { k: 'lab', type: 'text', label: ['Laboratory', 'Laboratory'] },
      { k: 'author', type: 'text', label: ['Author', 'Author'] },
      { k: 'title', type: 'text', label: ['Title', 'Title'] },
      { k: 'statement', type: 'text', label: ['Thesis statement', 'Thesis statement'], ph: ['A dissertation for the degree of', 'A dissertation for the degree of'] },
      { k: 'degree', type: 'text', label: ['Degree', 'Degree'] },
      { k: 'copyright', type: 'text', label: ['Copyright date', 'Copyright date'], ph: ['July 2026', 'July 2026'] },
      { k: 'supervisor', type: 'text', label: ['Supervisor', 'Supervisor'] },
      { k: 'place', type: 'text', label: ['Place', 'Place'], ph: ['Kaohsiung, Taiwan', 'Kaohsiung, Taiwan'] },
      { k: 'time', type: 'text', label: ['Time (defaults to copyright date)', 'Time (defaults to copyright date)'] }
    ],
    build(v) {
      const out = [];
      if (esc(v.lab)) out.push('laboratory: ' + esc(v.lab));
      if (esc(v.author)) out.push('author: ' + esc(v.author));
      if (esc(v.title)) out.push('title: ' + esc(v.title));
      if (esc(v.statement)) out.push('thesis statement: ' + esc(v.statement));
      if (esc(v.degree)) out.push('degree: ' + esc(v.degree));
      if (esc(v.copyright)) out.push('copyright: ' + esc(v.copyright));
      if (esc(v.supervisor)) out.push('supervisor: ' + esc(v.supervisor));
      if (esc(v.place)) out.push('place: ' + esc(v.place));
      if (esc(v.time)) out.push('time: ' + esc(v.time));
      return '```twthesis-titleback\n' + out.join('\n') + '\n```';
    }
  },
  {
    id: 'twthesis-approval',
    short: [OUT('審定書'), 'Approval'],
    title: [OUT('論文審定書頁'), 'Thesis approval page'],
    hint: ['封面後面一定要接這一頁，正文前頁碼（i、ii、iii…）是從這一頁開始算的。圖片留空會先印一個佔位框提醒你補圖，不會編譯失敗。',
           'This page must follow the cover; front-matter page numbers (i, ii, iii…) start counting from here. Leaving the image blank shows a placeholder box instead of failing.'],
    fields: [
      { k: 'image', type: 'text', label: [OUT('審定書圖片路徑'), 'Approval scan image path'], ph: [OUT('image/論文審定書.png'), 'image/approval.png'] },
      { k: 'title', type: 'text', label: [OUT('頁面標題（選填）'), 'Page title (optional)'], ph: [OUT('論文審定書'), 'Thesis Approval Form'] },
      { k: 'date', type: 'text', label: [OUT('口試日期'), 'Oral defense date'] },
      { k: 'knockout', type: 'check', label: [OUT('掃描圖是白底，移除白底讓它融入頁面'), 'Scan has a white background \u2014 remove it to blend into the page'] }
    ],
    build(v) {
      const out = [];
      if (esc(v.image)) out.push(OUT('\u5716\u7247: ') + esc(v.image));
      if (esc(v.title)) out.push(OUT('\u6a19\u984c: ') + esc(v.title));
      if (esc(v.date)) out.push(OUT('\u53e3\u8a66\u65e5\u671f: ') + esc(v.date));
      if (v.knockout) out.push(OUT('\u79fb\u9664\u767d\u5e95: \u662f'));
      return '```twthesis-approval\n' + out.join('\n') + '\n```';
    }
  },
  {
    id: 'twthesis-fm',
    short: ['前置章', 'Front ch.'],
    title: ['前置／後置無號章', 'Unnumbered front or back matter chapter'],
    hint: ['摘要、誌謝、目錄、參考文獻這幾章不編號、自成一頁——只要標題文字用得對就會自動套用。',
           'Abstract, acknowledgements, contents and references are unnumbered and start on a new page automatically.'],
    fields: [
      { k: 'name', type: 'select', label: ['章名', 'Chapter'],
        opts: TW_THESIS_FM_CHAPTERS.map(x => [x[0], x[1]]) },
      { k: 'body', type: 'textarea', rows: 4, label: ['內文（選填）', 'Body text (optional)'] }
    ],
    build(v) {
      const n = esc(v.name) || OUT('摘要');
      return '# ' + n + (esc(v.body) ? '\n\n' + esc(v.body) : '');
    }
  },
  {
    id: 'twthesis-keywords',
    short: ['關鍵字', 'Keywords'],
    title: ['摘要頁關鍵字', 'Keywords line on the abstract page'],
    hint: ['會被排到摘要頁的版心底部，這是臺灣論文版型的規定位置。關鍵字本來就是一個一個獨立的詞，這裡改成逐項新增，不用自己記中文用「、」、英文用逗號的分隔慣例——程式會依語言自動接。',
           'Pinned to the bottom of the abstract page, as the 臺灣論文 template requires. Add terms one at a time; the separator convention (、 for Chinese, comma for English) is applied for you.'],
    fields: [
      { k: 'en', type: 'check', label: ['英文（Keywords:）', 'English (Keywords:)'] },
      { k: 'terms', type: 'list', label: [OUT('關鍵字清單'), 'Keywords'], addLabel: ['新增關鍵字', 'Add keyword'],
        rows: [{ k: 'w', type: 'text', label: ['詞', 'Term'], grow: true, w: 260 }] }
    ],
    build(v) {
      const terms = (v.terms || []).map(r => esc(r.w)).filter(Boolean);
      if (!terms.length) return '';
      const sep = v.en ? ', ' : OUT('、');
      return (v.en ? '**Keywords:** ' : OUT('**關鍵字：** ')) + terms.join(sep);
    }
  },
  {
    id: 'twthesis-toc',
    short: [OUT('目錄'), 'Contents'],
    title: [OUT('目錄標記'), 'Table of contents marker'],
    hint: [OUT('這是純標記，沒有欄位可填——目錄內容是排版時自動從你的標題掃出來的，標題文字會依目前語言自動印成「目錄」或「Contents」。放這個標記的位置就是目錄要出現的位置。'),
           'A pure marker with nothing to fill in \u2014 contents are generated automatically from your headings at layout time, with a title that follows your document language. Where you insert this marker is where the contents page appears.'],
    fields: [],
    build() { return '```twthesis-toc\n```'; }
  },
  {
    id: 'twthesis-lof',
    short: [OUT('圖目錄'), 'List of Fig.'],
    title: [OUT('圖目錄標記'), 'List of figures marker'],
    hint: [OUT('跟目錄一樣是純標記，自動從你放的圖片圖說掃出來，不用填任何東西。'),
           'A marker like Contents \u2014 auto-generated from your figure captions, nothing to fill in.'],
    fields: [],
    build() { return '```twthesis-lof\n```'; }
  },
  {
    id: 'twthesis-lot',
    short: [OUT('表目錄'), 'List of Tab.'],
    title: [OUT('表目錄標記'), 'List of tables marker'],
    hint: [OUT('跟目錄一樣是純標記，自動從你放的表格表說掃出來，不用填任何東西。'),
           'A marker like Contents \u2014 auto-generated from your table captions, nothing to fill in.'],
    fields: [],
    build() { return '```twthesis-lot\n```'; }
  },
  {
    id: 'twthesis-cap',
    short: ['圖表說明', 'Caption'],
    title: ['圖說／表說', 'Figure or table caption'],
    hint: ['編號後面用半形句點，句點後不要再加冒號——加了會被格式檢查抓出來。',
           'Use a period after the number; do not add a colon after it (the format check flags that).'],
    fields: [
      { k: 'kind', type: 'select', label: ['類型', 'Kind'],
        opts: [[OUT('圖'), ['圖', 'Figure (Chinese)']], [OUT('表'), ['表', 'Table (Chinese)']],
               ['Figure', ['Figure', 'Figure']], ['Table', ['Table', 'Table']]] },
      { k: 'no', type: 'text', label: ['編號', 'Number'], ph: ['1  或  2-1', '1  or  2-1'] },
      { k: 'body', type: 'text', label: ['說明文字', 'Caption text'] }
    ],
    build(v) {
      const k = esc(v.kind) || OUT('圖');
      const sp = /^[A-Za-z]/.test(k) ? ' ' : ' ';
      return k + sp + (esc(v.no) || '1') + '. ' + esc(v.body);
    }
  },
  {
    id: 'twthesis-cite',
    short: ['引用', 'Cite'],
    title: ['內文引用', 'In-text citation'],
    inline: true,
    hint: ['寫編號就好。點下去會跳到對應的參考文獻。', 'Just the number; clicking it jumps to the reference.'],
    fields: [{ k: 'n', type: 'text', label: ['編號', 'Numbers'], ph: ['1  或  1,3  或  2-5', '1  or  1,3  or  2-5'] }],
    build(v) { const n = esc(v.n).replace(/\s+/g, ''); return n ? '[[' + n + ']]' : ''; }
  },
  {
    id: 'twthesis-refs',
    short: ['參考文獻', 'Refs'],
    title: ['參考文獻清單', 'Reference list'],
    hint: ['一筆一張卡片，新增、填、刪除、整批插入——跟書目的邏輯一樣。編號依卡片順序自動補，內文用「引用」指過來就是可點的連結。',
           'One card per reference — add, fill, delete, then insert together. Numbers follow card order; cite them in the text with the “Cite” tool to get a clickable link.'],
    fields: [
      { k: 'items', type: 'entrylist', showIndex: true,
        label: ['參考文獻', 'References'], addLabel: ['新增文獻', 'Add reference'],
        primary: { type: 'textarea', rows: 2, ph: [OUT('王小明。量子力學。台北：某出版社，2020。'), 'Author. Title. Publisher, Year.'] } },
      { k: 'head', type: 'check', label: ['同時加上「參考文獻」標題', 'Also add the “References” heading'] }
    ],
    build(v) {
      const items = (v.items || []).map(r => esc(r.text)).filter(Boolean);
      if (!items.length) return '';
      const rows = items.map((t, i) => '[' + (i + 1) + '] ' + t);
      return (v.head ? '# ' + OUT('參考文獻') + '\n\n' : '') + rows.join('\n\n');
    }
  },
  {
    id: 'twthesis-appendix',
    short: [OUT('附錄'), 'Appendix'],
    title: [OUT('附錄起點'), 'Start of appendices'],
    hint: [OUT('放一個標記就好，從這裡之後的章節標題會自動改用字母編號（附錄 A、附錄 B…）。'),
           'Just a marker: section headings after it automatically switch to letter numbering (Appendix A, B\u2026).'],
    fields: [{ k: 'first', type: 'text', label: [OUT('順便建立第一個附錄標題（選填）'), 'Also create the first appendix heading (optional)'] }],
    build(v) {
      const t = esc(v.first);
      return '```twthesis-appendix\n```' + (t ? '\n\n# ' + t : '');
    }
  },

];

const GROUPS = [
  { id: 'rev', label: 'REV', title: ['REVTeX 4.2 國際期刊語法', 'REVTeX 4.2 (international journals)'], tools: REVTEX_TOOLS },
  { id: 'twthesis', label: 'TW', title: ['臺灣論文語法工具', 'Taiwan Thesis syntax tools'], tools: TW_THESIS_TOOLS }
];

/* ---------- 樣式 --------------------------------------------------------- */
const CSS = `
#ty-toolbar .${MOUNT_CLASS}{display:flex;align-items:center;gap:3px;flex:0 0 auto;
  padding-left:8px;margin-left:6px;border-left:1px solid var(--border,#ddd)}
#ty-toolbar .${MOUNT_CLASS} .tb-btn{min-width:38px;font-weight:750;letter-spacing:.04em;font-size:11px}
#ty-toolbar .${MOUNT_CLASS} .tb-btn.pt-open{background:var(--accent-soft,#eef);color:var(--accent,#36c)}
#${PANEL_ID}{position:fixed;z-index:210;width:min(760px,calc(100vw - 24px));max-height:min(78vh,680px);
  display:flex;flex-direction:column;background:var(--bg-panel,#fff);color:var(--text-strong,#111);
  border:1px solid var(--border-strong,#ccc);border-radius:12px;
  box-shadow:var(--mac-shadow-popover,0 12px 40px rgba(0,0,0,.22));overflow:hidden;font:13px/1.5 var(--font-ui,system-ui)}
#${PANEL_ID}[hidden]{display:none}
#${PANEL_ID} .pt-chips{display:flex;flex-wrap:wrap;gap:5px;padding:9px 11px;border-bottom:1px solid var(--border,#e2e2e2);
  background:var(--bg-secondary,var(--bg-hover,#f6f6f6));flex:0 0 auto}
#${PANEL_ID} .pt-chip{padding:4px 11px;border-radius:999px;border:1px solid var(--border,#ddd);background:transparent;
  color:var(--text-strong,#111);font:600 12px/1.5 var(--font-ui,system-ui);cursor:pointer;white-space:nowrap}
#${PANEL_ID} .pt-chip:hover{background:var(--bg-hover,#eee)}
#${PANEL_ID} .pt-chip.on{background:var(--accent,#36c);border-color:var(--accent,#36c);color:#fff}
#${PANEL_ID} .pt-body{flex:1 1 auto;overflow:auto;padding:12px 13px 4px}
#${PANEL_ID} .pt-title{font-weight:700;font-size:13.5px;margin:0 0 3px}
#${PANEL_ID} .pt-hint{color:var(--text-muted,#777);font-size:11.5px;margin:0 0 11px;line-height:1.55}
#${PANEL_ID} .pt-field{margin-bottom:10px}
#${PANEL_ID} .pt-label{display:block;font-size:11.5px;font-weight:650;color:var(--text-muted,#666);margin-bottom:4px}
#${PANEL_ID} input[type=text],#${PANEL_ID} textarea,#${PANEL_ID} select{
  width:100%;box-sizing:border-box;background:var(--bg-editor,#fff);color:var(--text-strong,#111);
  border:1px solid var(--border,#ddd);border-radius:7px;padding:6px 8px;font:13px/1.5 var(--font-ui,system-ui);outline:none}
#${PANEL_ID} input[type=text]:focus,#${PANEL_ID} textarea:focus{border-color:var(--accent,#36c)}
#${PANEL_ID} textarea{resize:vertical;min-height:64px;font-family:var(--font-mono,ui-monospace,Menlo,monospace);font-size:12.5px}
/* 1.1.5.6.8：改用 CSS Grid 而不是 flex row。
   舊版是 flex 一排塞四個固定寬欄位＋一個 grow 欄位——固定寬欄位的總寬度
   （機構 118 + 信箱 178 + 備註 178 = 474px）逼近甚至超過面板寬度，grow 欄位
   （姓名）被擠壓到只剩個位數像素，肉眼看起來像「欄位被壓扁」「叉叉沒對齊」，
   其實是同一個根因：寬度預算沒抓對，不是排版邏輯錯了。
   Grid 用明確的 grid-template-columns（每行透過 --pt-cols 指定），
   刪除鈕固定佔最後一欄，天生對齊，不會因為前面欄位寬度而跑位。
   面板本身也加寬到 760px，給欄位留出足夠空間。 */
#${PANEL_ID} .pt-row{display:grid;grid-template-columns:var(--pt-cols,1fr);gap:6px;align-items:end;margin-bottom:8px}
#${PANEL_ID} .pt-row .pt-cell{display:flex;flex-direction:column;gap:3px;min-width:0}
#${PANEL_ID} .pt-cell .pt-sub{font-size:10.5px;color:var(--text-muted,#888);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#${PANEL_ID} .pt-no{min-width:0;text-align:right;
  color:var(--text-muted,#888);font:650 11.5px/1 var(--font-mono,ui-monospace,Menlo,monospace);padding-bottom:8px}
#${PANEL_ID} .pt-del{min-width:0;width:100%;height:30px;border-radius:7px;
  border:1px solid var(--border,#ddd);background:transparent;color:var(--text-muted,#888);cursor:pointer;line-height:1}
#${PANEL_ID} .pt-del:hover{color:var(--status-error,#b3261e);border-color:var(--status-error,#b3261e)}
#${PANEL_ID} .pt-add-wrap{display:flex;justify-content:flex-end;margin-top:2px}
#${PANEL_ID} .pt-add{padding:5px 12px;border-radius:7px;border:1px dashed var(--border-strong,#ccc);
  background:transparent;color:var(--text-muted,#666);font:620 12px/1 var(--font-ui,system-ui);cursor:pointer}
#${PANEL_ID} .pt-add:hover{color:var(--accent,#36c);border-color:var(--accent,#36c)}
/* 卡片式清單（書目、子公式）：一條資料本身就是一段長文字，跟作者那種
   「幾個短欄位並排」形狀不一樣，硬套同一個 grid 只會逼欄位越擠越窄。
   改成每條一張卡片：主要內容在上，次要欄位（若有）在下，刪除鈕在右上角。 */
#${PANEL_ID} .pt-elist-item{position:relative;border:1px solid var(--border,#ddd);border-radius:9px;
  padding:9px 34px 9px 10px;margin-bottom:8px;background:var(--bg-editor,#fff)}
#${PANEL_ID} .pt-elist-no{font:650 10.5px/1 var(--font-mono,ui-monospace,Menlo,monospace);color:var(--text-muted,#888);margin-bottom:4px}
#${PANEL_ID} .pt-elist-del{position:absolute;top:7px;right:7px;width:23px;height:23px;border-radius:6px;
  border:1px solid var(--border,#ddd);background:var(--bg-panel,#fff);color:var(--text-muted,#888);cursor:pointer;line-height:1;padding:0}
#${PANEL_ID} .pt-elist-del:hover{color:var(--status-error,#b3261e);border-color:var(--status-error,#b3261e)}
#${PANEL_ID} .pt-elist-secrow{display:flex;gap:8px;margin-top:6px}
#${PANEL_ID} .pt-elist-secrow .pt-cell{flex:0 0 auto;min-width:0}
#${PANEL_ID} .pt-foot{flex:0 0 auto;display:flex;gap:8px;align-items:center;justify-content:flex-end;
  padding:10px 13px;border-top:1px solid var(--border,#e2e2e2);background:var(--bg-secondary,var(--bg-hover,#f6f6f6))}
#${PANEL_ID} .pt-foot .pt-spacer{margin-right:auto;color:var(--text-muted,#888);font-size:11px}
#${PANEL_ID} .pt-btn{padding:6px 15px;border-radius:8px;border:1px solid var(--border,#ddd);background:transparent;
  color:var(--text-strong,#111);font:640 12.5px/1 var(--font-ui,system-ui);cursor:pointer}
#${PANEL_ID} .pt-btn:hover{background:var(--bg-hover,#eee)}
#${PANEL_ID} .pt-btn.primary{background:var(--accent,#36c);border-color:var(--accent,#36c);color:#fff}
#${PANEL_ID} .pt-btn.primary:hover{filter:brightness(1.06)}
#${PANEL_ID} .pt-empty{color:var(--text-muted,#888);font-size:12px;padding:18px 4px;line-height:1.7}
#${PANEL_ID} .pt-tbl-dims{display:flex;gap:10px;margin-bottom:10px;flex-wrap:wrap}
#${PANEL_ID} .pt-tbl-dims .pt-cell{min-width:120px}
#${PANEL_ID} .pt-tbl-wrap{overflow-x:auto;border:1px solid var(--border,#ddd);border-radius:9px;padding:10px;margin-bottom:8px}
#${PANEL_ID} .pt-tbl-grid{border-collapse:separate;border-spacing:4px}
#${PANEL_ID} .pt-tbl-grid td{vertical-align:top;padding:0}
#${PANEL_ID} .pt-tbl-grid input[type=text]{width:120px;font-size:12.5px}
#${PANEL_ID} .pt-tbl-grid th{font-size:10.5px;color:var(--text-muted,#888);font-weight:650;text-align:left;padding:0 0 3px 2px}
#${PANEL_ID} .pt-tbl-merge{display:flex;align-items:center;gap:3px;margin-top:2px;font-size:10px;color:var(--text-muted,#888);white-space:nowrap}
#${PANEL_ID} .pt-tbl-merge input{margin:0}
#${PANEL_ID} .pt-tbl-head input{font-weight:650}
`;

function ensureStyle() {
  if (document.getElementById('cp171-ptools-css')) return;
  const st = document.createElement('style');
  st.id = 'cp171-ptools-css';
  st.textContent = CSS;
  (document.head || document.documentElement).appendChild(st);
}

/* ---------- 面板 --------------------------------------------------------- */
let panel = null, curGroup = null, curTool = null, values = Object.create(null);

function panelEl() {
  if (panel && panel.isConnected) return panel;
  panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.hidden = true;
  panel.innerHTML = '<div class="pt-chips"></div><div class="pt-body"></div>'
    + '<div class="pt-foot"><span class="pt-spacer"></span>'
    + '<button type="button" class="pt-btn" data-act="cancel"></button>'
    + '<button type="button" class="pt-btn primary" data-act="insert"></button></div>';
  document.body.appendChild(panel);
  panel.addEventListener('click', onPanelClick);
  return panel;
}

function onPanelClick(e) {
  const chip = e.target.closest('.pt-chip');
  if (chip) { selectTool(chip.dataset.tool); return; }
  const add = e.target.closest('.pt-add');
  if (add) { addRow(add.dataset.field); return; }
  const del = e.target.closest('.pt-del, .pt-elist-del');
  if (del) { delRow(del.dataset.field, Number(del.dataset.idx)); return; }
  const btn = e.target.closest('.pt-btn');
  if (!btn) return;
  if (btn.dataset.act === 'cancel') hidePanel();
  if (btn.dataset.act === 'insert') doInsert();
}

function hidePanel() {
  if (panel) panel.hidden = true;
  document.querySelectorAll('#ty-toolbar .' + MOUNT_CLASS + ' .tb-btn.pt-open')
    .forEach(b => b.classList.remove('pt-open'));
  curGroup = null;
}

function openGroup(gid, anchorBtn) {
  const g = GROUPS.find(x => x.id === gid);
  if (!g) return;
  if (curGroup === gid && panel && !panel.hidden) { hidePanel(); return; }
  ensureStyle();
  const p = panelEl();
  curGroup = gid;
  curTool = g.tools.length ? g.tools[0] : null;
  resetValues();
  renderChips(g);
  renderForm();
  p.hidden = false;
  position(anchorBtn);
  document.querySelectorAll('#ty-toolbar .' + MOUNT_CLASS + ' .tb-btn')
    .forEach(b => b.classList.toggle('pt-open', b.dataset.ptGroup === gid));
}

function position(anchorBtn) {
  const p = panelEl();
  const r = anchorBtn && anchorBtn.getBoundingClientRect ? anchorBtn.getBoundingClientRect() : null;
  const vw = window.innerWidth || 1200, vh = window.innerHeight || 800;
  const pw = p.offsetWidth || 520, ph = p.offsetHeight || 380;
  /* 先貼著按鈕左緣往下開；右邊或下面放不下就往回夾，不讓面板跑出畫面。
     窄視窗時寧可蓋住一點工具列，也不要有一半在畫面外點不到。 */
  let left = r ? r.left : 40, top = r ? r.bottom + 7 : 60;
  if (left + pw > vw - 10) left = Math.max(8, vw - pw - 10);
  if (top + ph > vh - 10) top = Math.max(8, vh - ph - 10);
  p.style.left = Math.round(left) + 'px';
  p.style.top = Math.round(top) + 'px';
}

function renderChips(g) {
  const box = panelEl().querySelector('.pt-chips');
  box.textContent = '';
  for (const t of g.tools) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pt-chip' + (curTool && curTool.id === t.id ? ' on' : '');
    b.dataset.tool = t.id;
    b.textContent = T(t.short[0], t.short[1]);
    box.appendChild(b);
  }
  const foot = panelEl().querySelector('.pt-foot');
  foot.querySelector('[data-act=cancel]').textContent = T('取消','Cancel');
  foot.querySelector('[data-act=insert]').textContent = T('插入','Insert');
  foot.querySelector('.pt-spacer').textContent = T(g.title[0], g.title[1]);
}

function selectTool(id) {
  const g = GROUPS.find(x => x.id === curGroup);
  if (!g) return;
  const t = g.tools.find(x => x.id === id);
  if (!t) return;
  curTool = t;
  resetValues();
  panelEl().querySelectorAll('.pt-chip').forEach(c => c.classList.toggle('on', c.dataset.tool === id));
  renderForm();
}

/* 清空表單值並套用「依目前主題而定」的預設。
   ★ 必須在 openGroup 與 selectTool 兩處都呼叫：selectTool 也會重建 values，
   只在 openGroup 做預選的話，切到別的工具再切回封面就會退回中文欄位組
   （twthesis-en 主題下實機驗證抓到的）。 */
function resetValues() {
  values = Object.create(null);
  if (isTwThesisEnglish()) values.mode = 'en';
}


function renderForm() {
  const body = panelEl().querySelector('.pt-body');
  body.textContent = '';
  if (!curTool) {
    const d = document.createElement('div');
    d.className = 'pt-empty';
    d.textContent = T('這一組的工具還在製作中，下一個版本補上。','Tools for this group are still being built; coming in the next version.');
    body.appendChild(d);
    return;
  }
  const h = document.createElement('p'); h.className = 'pt-title';
  h.textContent = T(curTool.title[0], curTool.title[1]); body.appendChild(h);
  if (curTool.hint) {
    const p = document.createElement('p'); p.className = 'pt-hint';
    p.textContent = T(curTool.hint[0], curTool.hint[1]); body.appendChild(p);
  }
  for (const f of curTool.fields) {
    if (typeof f.showIf === 'function' && !f.showIf(values)) continue;
    body.appendChild(renderField(f));
  }
}

function renderField(f) {
  const wrap = document.createElement('div');
  wrap.className = 'pt-field';
  /* label 缺漏防呆：欄位定義忘了寫 label 時，以前這裡會直接讀 f.label[0] 拋
     TypeError，整個表單一片空白、面板等於掛掉（table 與 twthesis-keywords 兩個
     欄位各踩過一次）。標題只是輔助說明，沒有它照樣能填，不該讓它有能力
     炸掉整份表單——所以改成缺就不畫。 */
  if (f.label) {
    const lab = document.createElement('label');
    lab.className = 'pt-label';
    lab.textContent = T(f.label[0], f.label[1]);
    wrap.appendChild(lab);
  }

  if (f.type === 'list') {
    if (!Array.isArray(values[f.k])) values[f.k] = [Object.create(null)];
    values[f.k].forEach((row, idx) => wrap.appendChild(renderListRow(f, row, idx)));
    const addWrap = document.createElement('div'); addWrap.className = 'pt-add-wrap';
    const add = document.createElement('button');
    add.type = 'button'; add.className = 'pt-add'; add.dataset.field = f.k;
    add.textContent = '＋ ' + T(f.addLabel[0], f.addLabel[1]);
    addWrap.appendChild(add);
    wrap.appendChild(addWrap);
    return wrap;
  }
  if (f.type === 'table') {
    wrap.appendChild(renderTableEditor(f));
    return wrap;
  }
  if (f.type === 'entrylist') {
    if (!Array.isArray(values[f.k])) values[f.k] = [Object.create(null)];
    values[f.k].forEach((row, idx) => wrap.appendChild(renderEntryListItem(f, row, idx)));
    const addWrap = document.createElement('div'); addWrap.className = 'pt-add-wrap';
    const add = document.createElement('button');
    add.type = 'button'; add.className = 'pt-add'; add.dataset.field = f.k; add.dataset.entrylist = '1';
    add.textContent = '＋ ' + T(f.addLabel[0], f.addLabel[1]);
    addWrap.appendChild(add);
    wrap.appendChild(addWrap);
    return wrap;
  }
  if (f.type === 'check') {
    wrap.textContent = '';
    const lb = document.createElement('label');
    lb.style.display = 'flex'; lb.style.alignItems = 'center'; lb.style.gap = '7px';
    lb.style.fontSize = '12.5px'; lb.style.cursor = 'pointer';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = !!values[f.k];
    cb.addEventListener('change', () => { values[f.k] = cb.checked; });
    lb.appendChild(cb);
    lb.appendChild(document.createTextNode(T(f.label[0], f.label[1])));
    wrap.appendChild(lb);
    return wrap;
  }
  if (f.type === 'select') {
    const sel = document.createElement('select');
    for (const [val, lbl] of f.opts) {
      const o = document.createElement('option');
      o.value = val; o.textContent = T(lbl[0], lbl[1]);
      sel.appendChild(o);
    }
    if (values[f.k] === undefined) values[f.k] = f.opts[0][0];
    sel.value = values[f.k];
    sel.addEventListener('change', () => {
      values[f.k] = sel.value;
      if (f.reflow) renderForm();   // 這顆選單會決定其他欄位要不要顯示（例如封面中／英文切換）
    });
    wrap.appendChild(sel);
    return wrap;
  }
  if (f.type === 'textarea') {
    const ta = document.createElement('textarea');
    ta.rows = f.rows || 5;
    ta.value = values[f.k] || '';
    ta.addEventListener('input', () => { values[f.k] = ta.value; });
    wrap.appendChild(ta);
    return wrap;
  }
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.value = values[f.k] || '';
  if (f.ph) inp.placeholder = T(f.ph[0], f.ph[1]);
  inp.addEventListener('input', () => { values[f.k] = inp.value; });
  wrap.appendChild(inp);
  return wrap;
}

/* grid-template-columns 由這一行的實際欄位組成：每個 c.w（px）或 grow（1fr），
   編號欄與刪除鈕各自固定寬度。同一個 field 的每一列用同一份設定產生，
   所以天生對齊——不會因為某一列內容長一點就跟其他列的欄位對不齊。 */
function gridCols(f) {
  const parts = [];
  if (f.numbered) parts.push('26px');
  for (const c of f.rows) parts.push(c.grow ? 'minmax(160px,1fr)' : (c.w || 120) + 'px');
  parts.push('34px');   // 刪除鈕欄
  return parts.join(' ');
}
function renderListRow(f, row, idx) {
  const r = document.createElement('div');
  r.className = 'pt-row';
  r.style.setProperty('--pt-cols', gridCols(f));
  if (f.numbered) {
    const no = document.createElement('span');
    no.className = 'pt-no'; no.textContent = String(idx + 1);
    r.appendChild(no);
  }
  for (const c of f.rows) {
    const cell = document.createElement('div');
    cell.className = 'pt-cell';
    const sub = document.createElement('span');
    sub.className = 'pt-sub'; sub.textContent = T(c.label[0], c.label[1]);
    cell.appendChild(sub);
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = row[c.k] || '';
    if (c.ph) inp.placeholder = T(c.ph[0], c.ph[1]);
    inp.addEventListener('input', () => { row[c.k] = inp.value; });
    cell.appendChild(inp);
    r.appendChild(cell);
  }
  const del = document.createElement('button');
  del.type = 'button'; del.className = 'pt-del';
  del.dataset.field = f.k; del.dataset.idx = String(idx);
  del.textContent = '×';
  del.title = T('刪除這一列','Remove this row');
  r.appendChild(del);
  return r;
}

/* 卡片式清單：一條資料 = 一大段內容（書目、子公式），不是「幾個短欄位並排」，
   所以不套用 grid 欄位模型，改成上下堆疊的卡片，刪除鈕固定在右上角。 */
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

  const dims = document.createElement('div');
  dims.className = 'pt-tbl-dims';
  const mkSel = (label, val, opts, onchange) => {
    const cell = document.createElement('div'); cell.className = 'pt-cell';
    const sub = document.createElement('span'); sub.className = 'pt-sub'; sub.textContent = label;
    cell.appendChild(sub);
    const sel = document.createElement('select');
    for (const o of opts) { const op = document.createElement('option'); op.value = String(o); op.textContent = String(o); sel.appendChild(op); }
    sel.value = String(val);
    sel.addEventListener('change', () => { onchange(sel.value); renderForm(); });
    cell.appendChild(sel);
    return cell;
  };
  dims.appendChild(mkSel(T('欄數','Columns'), st.cols, [2,3,4,5,6,7,8], v => { st.cols = Number(v); }));
  dims.appendChild(mkSel(T('列數（不含表頭）','Rows (excl. header)'), st.rows, Array.from({length:15},(_,i)=>i+1), v => { st.rows = Number(v); }));
  dims.appendChild(mkSel(T('對齊','Align'), st.align,
    [[T('靠左','Left'),'l'],[T('置中','Center'),'c'],[T('靠右','Right'),'r']].map(x=>x[1]), v => { st.align = v; }));
  /* mkSel 的 opts 目前只吃單一值陣列；對齊改用文字對照，這裡直接覆蓋掉剛才那個空選單。 */
  dims.lastChild.remove();
  const alignCell = document.createElement('div'); alignCell.className = 'pt-cell';
  const alignSub = document.createElement('span'); alignSub.className = 'pt-sub'; alignSub.textContent = T('對齊','Align');
  alignCell.appendChild(alignSub);
  const alignSel = document.createElement('select');
  for (const [lbl, val] of [[T('靠左','Left'),'l'],[T('置中','Center'),'c'],[T('靠右','Right'),'r']]) {
    const op = document.createElement('option'); op.value = val; op.textContent = lbl; alignSel.appendChild(op);
  }
  alignSel.value = st.align;
  alignSel.addEventListener('change', () => { st.align = alignSel.value; });
  alignCell.appendChild(alignSel);
  dims.appendChild(alignCell);
  box.appendChild(dims);

  const wrapDiv = document.createElement('div'); wrapDiv.className = 'pt-tbl-wrap';
  const table = document.createElement('table'); table.className = 'pt-tbl-grid';
  for (let r = 0; r < st.cells.length; r++) {
    const tr = document.createElement('tr'); if (r === 0) tr.className = 'pt-tbl-head';
    for (let c = 0; c < st.cols; c++) {
      const td = document.createElement('td');
      const cellData = st.cells[r][c];
      const inp = document.createElement('input'); inp.type = 'text';
      inp.value = cellData.text || '';
      inp.placeholder = r === 0 ? (T('表頭 ','Header ') + (c + 1)) : '';
      inp.addEventListener('input', () => { cellData.text = inp.value; });
      td.appendChild(inp);
      if (r > 0 && c > 0) {
        const mrg = document.createElement('label'); mrg.className = 'pt-tbl-merge';
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!cellData.merge;
        cb.addEventListener('change', () => { cellData.merge = cb.checked; inp.disabled = cb.checked; if (cb.checked) inp.value = ''; });
        inp.disabled = !!cellData.merge;
        mrg.appendChild(cb);
        mrg.appendChild(document.createTextNode(T('併左','\u2190 merge')));
        td.appendChild(mrg);
      }
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  wrapDiv.appendChild(table);
  box.appendChild(wrapDiv);
  return box;
}
function renderEntryListItem(f, row, idx) {
  const card = document.createElement('div');
  card.className = 'pt-elist-item';
  if (f.showIndex) {
    const no = document.createElement('div');
    no.className = 'pt-elist-no';
    /* 先拿完整雙語模板（不在字面值中間插入串接），再用 .replace 填數字——
       避免把中／英文字面值切成好幾段，那樣 i18n 稽核追不出這幾段其實
       是同一句話的一部分，會誤判成漏翻。 */
    no.textContent = T('第 N 筆','Entry N').replace('N', String(idx + 1));
    card.appendChild(no);
  }
  const p = f.primary;
  let field;
  if (p.type === 'textarea') {
    field = document.createElement('textarea');
    field.rows = p.rows || 2;
  } else {
    field = document.createElement('input');
    field.type = 'text';
  }
  field.value = row.text || '';
  if (p.ph) field.placeholder = T(p.ph[0], p.ph[1]);
  field.addEventListener('input', () => { row.text = field.value; });
  card.appendChild(field);
  if (f.secondary && f.secondary.length) {
    const sec = document.createElement('div');
    sec.className = 'pt-elist-secrow';
    for (const c of f.secondary) {
      const cell = document.createElement('div');
      cell.className = 'pt-cell'; if (c.w) cell.style.width = c.w + 'px';
      const sub = document.createElement('span');
      sub.className = 'pt-sub'; sub.textContent = T(c.label[0], c.label[1]);
      cell.appendChild(sub);
      const inp = document.createElement('input'); inp.type = 'text';
      inp.value = row[c.k] || '';
      if (c.ph) inp.placeholder = T(c.ph[0], c.ph[1]);
      inp.addEventListener('input', () => { row[c.k] = inp.value; });
      cell.appendChild(inp);
      sec.appendChild(cell);
    }
    card.appendChild(sec);
  }
  const del = document.createElement('button');
  del.type = 'button'; del.className = 'pt-elist-del';
  del.dataset.field = f.k; del.dataset.idx = String(idx); del.dataset.entrylist = '1';
  del.textContent = '×'; del.title = T('刪除這一筆','Remove this entry');
  card.appendChild(del);
  return card;
}

function addRow(k) {
  if (!Array.isArray(values[k])) values[k] = [];
  values[k].push(Object.create(null));
  renderForm();
}
function delRow(k, idx) {
  if (!Array.isArray(values[k])) return;
  values[k].splice(idx, 1);
  if (!values[k].length) values[k].push(Object.create(null));
  renderForm();
}

/* ---------- 插入 --------------------------------------------------------- */
function doInsert() {
  if (!curTool) return;
  let text = '';
  try { text = curTool.build(values); } catch (e) {
    K.log && K.log.error && K.log.error('papertools', T('產生語法失敗','Failed to build syntax'), e);
    return;
  }
  if (!text) return;
  /* 一律走宿主既有的插入命令：它已經處理好 source mode、undo、
     游標定位與 onEdited()。自己去動 blocks 陣列必然跟宿主打架。 */
  try {
    /* 行內記號（引用、交叉引用）要塞在游標所在的那一句話裡，不能自成一段；
       區塊語法反過來一定要自成一段，否則圍欄會被前一段吃掉。 */
    if (curTool.inline && typeof window.insertTextAtCaret === 'function') window.insertTextAtCaret(text);
    else if (typeof window.insertParagraphSyntax === 'function') window.insertParagraphSyntax(text);
    else if (typeof window.insertTextAtCaret === 'function') window.insertTextAtCaret(text + '\n');
    else {
      K.log && K.log.error && K.log.error('papertools', T('找不到宿主插入函式','Host insert function not found'));
      return;
    }
  } catch (e) {
    K.log && K.log.error && K.log.error('papertools', T('插入失敗','Insert failed'), e);
    return;
  }
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
    /* ★ CP171-58.1：補上 data-action + data-zh/data-en——這兩者是格式工具列
       #ty-toolbar 既有 tbTipShow() 即時提示機制唯一認得的掛鉤（見 tbBar 的
       delegated mouseover：closest('.tb-btn[data-action]')）。沒有它，這顆鈕
       就只剩下面這行原生 title，瀏覽器原生提示延遲久、樣式也對不上。
       action id 刻意加 pt- 前綴，跟 TB_CATALOG 的工具 id 錯開，避免撞到
       tbBar 的 mousedown 委派（undo/redo/paragraph/more 之外都會 tbTool(id)
       查表，查不到就是安全的 no-op，但仍要避免撞名）。 */
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
}

/* tbBuild() 會 textContent='' 整條重建，所以用 observer 補回自己這一段。
   不去改宿主的 tbBuild：那條函式被還原流程、偏好設定、語言切換多處呼叫，
   包裝它等於在四個地方各埋一顆地雷。 */
function watch() {
  const bar = document.getElementById('ty-toolbar');
  if (!bar) return;
  try {
    new MutationObserver(() => { mount(); }).observe(bar, { childList: true });
  } catch (_) { /* 無 MutationObserver 的測試環境：靠下面的輪詢 */ }
}

function boot() {
  mount(); watch();
  /* 工具列可能在 CP171 之後才建好（還原流程、settings.showToolbar 開關），
     前 20 秒每 500ms 補一次，之後交給 observer。 */
  let n = 0;
  const iv = setInterval(() => { mount(); if (++n > 40) clearInterval(iv); }, 500);
}

try {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
} catch (e) { K.log && K.log.error && K.log.error('papertools', T('boot 失敗','Boot failed'), e); }

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

/* 核心 K 是凍結物件（kernel 尾端 Object.freeze），直接掛屬性會拋
   TypeError: object is not extensible——UI 煙霧測試抓到的。
   對外介面改掛在自己的全域名稱下，並保留一次 try 讓未凍結的舊核心也能用。 */
const API = {
  open: openGroup,
  close: hidePanel,
  groups: () => GROUPS.map(g => ({ id: g.id, tools: g.tools.map(t => t.id) })),
  buildOnly: (gid, tid, v) => {
    const g = GROUPS.find(x => x.id === gid); if (!g) return '';
    const t = g.tools.find(x => x.id === tid); if (!t) return '';
    return t.build(v || {});
  }
};
try { window.__CP171_PTOOLS__ = API; } catch (_) {}
try { if (Object.isExtensible(K)) K.papertools = API; } catch (_) {}
K.log && K.log.info && K.log.info('papertools', T('論文語法工具列已就緒','Paper syntax toolbar ready'));
})();
