
/* ============================================================================
 * cp171-20-emit — 國際論文管線 · REVTeX 4.2 發射器
 *
 * 輸入：cp171-10-parser 的 AST + settings 的 revtex* 既有 profile
 * 輸出：{ tex, map, assets, bib, warnings }
 *        tex    完整可編譯的 REVTeX 4.2 原始檔（人可讀、期刊可再編輯）
 *        map    .tex 行號 → Markdown 行號 對應表（SyncTeX 反向定位的補強）
 *        assets 需要一併打包的圖檔路徑清單
 *
 * 兩條鐵律（違反者在 selfcheck 會紅）：
 *   鐵律一  數學區塊原樣透傳。不做任何 Unicode 化、不做任何重寫。
 *           對應 90/01 症狀三、風險 R-07。
 *   鐵律二  class option 一律取自 settings 既有的 revtex* 鍵，不自建選項模型。
 *           對應 ADR-0006 決策二（profileKey 複用）。
 * ========================================================================== */
/* 產生的 .tex 是要交給期刊的檔案，裡面的說明註解也應該跟著介面語言走。
   只影響註解行，不影響任何 LaTeX 指令。 */
function cpEN(){
  try { return typeof settings !== 'undefined' && settings && settings.lang === 'en'; }
  catch (_) { return false; }
}

(() => {
'use strict';
const K = window.__CP171__;
if (!K) { console.error('[CP171] emit: 核心未就緒'); return; }

/* ---------- 逃逸 ---------- */
const TEX_ESC = { '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '$': '\\$',
                  '&': '\\&', '#': '\\#', '_': '\\_', '%': '\\%',
                  '~': '\\textasciitilde{}', '^': '\\textasciicircum{}' };
function esc(s){
  return String(s == null ? '' : s).replace(/[\\{}$&#_%~^]/g, ch => TEX_ESC[ch]);
}

/* 智慧標點 → TeX 慣用寫法（c2 語料明確要求） */
const SMART = [
  [/\u201c/g, '``'], [/\u201d/g, "''"],
  [/\u2018/g, '`'],  [/\u2019/g, "'"],
  [/\u2014/g, '---'], [/\u2013/g, '--'],
  [/\u2026/g, '\\ldots{}'],
  [/\u00a0/g, '~']
];
function smart(s){ let x = s; for (const [re, to] of SMART) x = x.replace(re, to); return x; }

/** 一般文字：先逃逸，再智慧標點。順序不能顛倒。
 *
 *  反過來做會壞掉：smart() 產出的 \ldots{} 會被 esc() 逃成 \textbackslash{}ldots\{\}，
 *  PDF 上就印出字面的「\ldots{}」。這個 bug 只有真編譯 + pdftotext 抽回才看得見，
 *  出口自檢與肉眼看 .tex 都抓不到——所以驗證一定要走到 PDF。
 *  反向是安全的：… ‘ ’ “ ” — – 都不在逃逸字元集合裡，esc() 不會動它們。 */
function textOut(s){ return smart(esc(String(s))); }

/* 行內程式碼：優先 \texttt{}，含特殊字時退 \verb */
function inlineCode(v){
  const s = String(v);
  if (!/[\\{}$&#_%~^]/.test(s)) return '\\texttt{' + s + '}';
  for (const d of ['|', '!', '+', '/', '@', '"', '?']) {
    if (!s.includes(d)) return '\\verb' + d + s + d;
  }
  return '\\texttt{' + esc(s) + '}';
}

/* ---------- class option（鐵律二）---------- */
/* ---------- 稍寬公式的欄內折行（multline）--------------------------------
 * 使用者實測回報：語料庫的公式 (12)（不確定度傳遞式）在雙欄版面被整頁置中，
 * 視覺上很突兀。實際量測：該式 285.8pt，單欄 246.0pt——只超出 39.8pt（16%），
 * 量測與判斷都沒錯，但「只超出一點點就霸佔整個頁寬」確實不是好排版。
 *
 * 縮字級救不了（實測 \small 267.2pt、\footnotesize 248.5pt，仍超過 246pt，
 * 而且公式縮到那麼小反而更難讀）。REVTeX/amsmath 對這種情況的標準做法是
 * multline——讓公式在欄內折成兩行，完全不必跨欄。實測折行後零溢出。
 *
 * 折點只能選在「頂層」的二元運算子：巢狀在 \frac{}{}、\left(...\right)、
 * 上下標 {} 內的 + - = 都不是合法折點，在那裡斷開會產生語法錯誤或錯誤的
 * 數學結構。因此逐字元掃描並追蹤三種深度：大括號、\left…\right、以及
 * 是否處於某個控制序列的參數位置。
 *
 * 回傳所有頂層折點的位置（字元索引），呼叫端挑最接近中央的那個切一刀。
 */
function topLevelBreakPoints(tex) {
  const s = String(tex || '');
  const pts = [];
  let brace = 0, lr = 0, i = 0;
  while (i < s.length) {
    // 跳過控制序列本體（\left \right \frac 等），避免把 \le 之類看成運算子
    if (s[i] === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i));
      const name = m ? m[1] : '';
      if (name === 'left') lr++;
      else if (name === 'right') lr--;
      i += m ? m[0].length : 1;
      // \right 後面必定跟一個定界符，一併跳過
      if (name === 'left' || name === 'right') { while (i < s.length && /\s/.test(s[i])) i++; i++; }
      continue;
    }
    if (s[i] === '{') { brace++; i++; continue; }
    if (s[i] === '}') { brace--; i++; continue; }
    // 只有在完全沒有巢狀時才算頂層折點
    if (brace === 0 && lr === 0 && (s[i] === '+' || s[i] === '-')) {
      // 開頭的正負號是「符號」不是「運算子」，不能當折點
      const before = s.slice(0, i).replace(/\s+$/, '');
      if (before && !/[=+\-<>(,[]$/.test(before)) pts.push(i);
    }
    i++;
  }
  return pts;
}

/** 把公式從最接近中央的頂層折點切成兩段，組成 multline 內容。 */
function splitForMultline(tex) {
  const s = String(tex || '').replace(/\s+$/, '');
  const pts = topLevelBreakPoints(s);
  if (!pts.length) return null;
  const mid = s.length / 2;
  let best = pts[0];
  for (const p of pts) if (Math.abs(p - mid) < Math.abs(best - mid)) best = p;
  const head = s.slice(0, best).replace(/\s+$/, '');
  const tail = s.slice(best).replace(/^\s+/, '');
  if (!head || !tail) return null;
  return { head, tail };
}



/* 1.1.7.2：將 Markdown/HTML 圖片縮放比例投影成 LaTeX 尺寸。
   單欄 figure 以 \columnwidth 為 100%；figure* 以 \textwidth 為 100%。 */
function imageWidthExpr(scale, base, explicit){
  const n = Number(scale);
  if (!explicit || !Number.isFinite(n) || n <= 0 || Math.abs(n - 1) < 1e-9) return base;
  const v = Math.max(0.05, Math.min(4, n));
  let s = (Math.round(v * 1000) / 1000).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return s + base;
}

/* ---------- author-year 引用的 [Author(Year)] 抽取 ----------------------
 * RMP 等期刊在 class 層級無條件強制 author-year（apsrmp4-2.rtx 第 218 行
 * \@booleantrue\authoryear@sw，不管我們傳什麼 class option 都一樣）。
 * natbib 在這個模式下要求每筆 \bibitem 帶 [Author(Year)] 可選參數才能正確
 * 對應 \cite；沒有的話，全矩陣壓力測試證實 PDF 上會印出 "(???)"——
 * 不是嚇人但無害的 log 警告，是真的讀者看得到的壞輸出。
 *
 * revtex-bibliography 的行內書目只有「key: 完整書目文字」，沒有結構化的
 * 作者/年份欄位，只能從文字反推。演算法：
 *   1. 年份：找最後一個「看起來像年份」的四位數（19xx/20xx），不要求
 *      緊貼右括號——很多書目寫成 "(出版社, 城市, 1985), pp. 1-153."，
 *      年份前面還有其他內容。
 *   2. 作者：把年份之前的文字用逗號切段，逐段判斷「像不像姓名」：
 *      每個詞要嘛整段大寫開頭、要嘛是縮寫（如 S. / Yu. / G.-L.），且整段
 *      至少要有一個真正的縮寫詞才算數——這是必要的，因為書名本身常常
 *      也是每個字大寫（例如 "Quantum Phase Transitions"），光看「大寫
 *      開頭」會把書名誤判成第二作者；縮寫這個特徵書名不會有。
 *      符合的段落持續累積，第一個不符合的段落視為標題起點。
 *   3. 第一段若本身是「X and Y」（兩作者、中間沒有逗號），取 and 前面
 *      那個當第一作者，姓氏取該段最後一個詞。
 *   4. 累積了不只一段、或第一段內有 " and "，視為多作者，标 "et al."。
 * 抽不出來（找不到年份，或第一段就不像姓名）時回傳 null，呼叫端要能
 * 優雅退回「不帶方括號」並警告使用者，而不是產生錯誤的作者名。
 */
function looksLikeAuthorSegment(seg) {
  const s = seg.trim().replace(/\band\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return false;
  const words = s.split(' ');
  if (!words.every(w => /^[A-Z][A-Za-z'\-.]*$/.test(w))) return false;
  return words.some(w => /\.$/.test(w) && w.replace(/[.\-]/g, '').length <= 3);
}
function extractAuthorYear(txt) {
  const t = String(txt || '').trim();
  const yearMatches = [...t.matchAll(/\b(19\d{2}|20\d{2})\b/g)];
  if (!yearMatches.length) return null;
  const year = yearMatches[yearMatches.length - 1][1];
  const beforeYear = t.slice(0, t.lastIndexOf(year));
  const segs = beforeYear.split(',');
  const authorSegs = [];
  for (const seg of segs) {
    if (looksLikeAuthorSegment(seg)) authorSegs.push(seg.trim());
    else break;
  }
  if (!authorSegs.length) return null;
  let first = authorSegs[0].replace(/^and\s+/, '');
  const andIdx = first.indexOf(' and ');
  const isTwoAuthorNoComma = andIdx >= 0;
  if (isTwoAuthorNoComma) first = first.slice(0, andIdx);
  const words = first.trim().split(/\s+/);
  const surname = words[words.length - 1].replace(/[.,]+$/, '');
  if (!surname || !/^[A-Z]/.test(surname)) return null;
  const multi = isTwoAuthorNoComma || authorSegs.length > 1;
  // natbib 慣例是 "Surname(Year)" 姓氏與括號間不留空格——它會自己在
  // compressed 引用時插入逗號+空格；多留一個空格會變成 "Bardeen , 1961"
  // 這種雙重間距的視覺瑕疵（實際編譯過 PDF 才發現這個小細節）。
  return surname + (multi ? ' et al.' : '') + '(' + year + ')';
}

function revtexFontProfile(S){
  const g = (k, d) => (S && S[k] !== undefined && S[k] !== '' ? S[k] : d);
  const society = String(g('revtexSociety', 'aps')).toLowerCase();
  const mode = String(g('revtexMode', 'reprint')).toLowerCase();
  const paper = String(g('revtexPaper', 'letterpaper')).toLowerCase();
  const columns = String(g('revtexColumns', 'auto')).toLowerCase();
  const requested = String(g('revtexFontSize', 'auto')).toLowerCase();
  const effectiveTwoColumn = columns === 'twocolumn' || (columns !== 'onecolumn' && mode === 'reprint');

  /* 最後一道 fail-safe。文件設定模組會把此已知不相容組合 canonicalize
     成 auto；即使某個外部呼叫者繞過該模組，emitter 也不能產生第一頁
     幾乎貼到 Letter 紙張下緣的 AIP 12pt 雙欄稿。 */
  const guarded = society === 'aip' && mode === 'reprint' && paper === 'letterpaper'
    && effectiveTwoColumn && (requested === '11pt' || requested === '12pt');
  const option = (!guarded && requested && requested !== 'auto') ? requested : '';
  const classDefault = ['preprint','manuscript','checkin'].includes(mode) ? '12pt'
    : (mode === 'reprint' ? '10pt' : 'class-defined');
  return {
    society, mode, paper, columns, requested, option, classDefault,
    effective: option || classDefault, guarded,
    reason: guarded ? 'aip-reprint-letter-two-column-large-type-grid' : ''
  };
}

function classOptions(S){
  const g = (k, d) => (S && S[k] !== undefined && S[k] !== '' ? S[k] : d);
  const opts = [];
  // 學會與期刊都要明寫。省略學會時 REVTeX 會警告 "No Society specified"
  // 並套用預設 aps——對 APS 剛好沒事，換成 AIP 就會靜默地排錯樣式。
  const society = String(g('revtexSociety', 'aps'));
  const journal = String(g('revtexJournal', 'prl'));
  if (society) opts.push(society);
  if (journal) opts.push(journal);
  opts.push(String(g('revtexMode', 'reprint')));                 // preprint|reprint|twocolumn
  const cols = String(g('revtexColumns', 'auto'));
  if (cols === 'onecolumn' || cols === 'twocolumn') opts.push(cols);
  opts.push(String(g('revtexAddress', 'groupedaddress')));
  opts.push(String(g('revtexPaper', 'letterpaper')));
  const font = revtexFontProfile(S);
  if (font.option) opts.push(font.option);
  const cite = String(g('revtexCitation', 'numerical'));
  /* 部分期刊的 .rtx 內部強制引用格式，class option 給相反值會直接編譯失敗。
     RMP：apsrmp4-2.rtx 第 218 行 \@booleantrue\authoryear@sw。

     apsrmp4-2.rtx 是在 \ProcessOptions 之後才被 \input 進來的，而且內部無條件
     執行 \@booleantrue\authoryear@sw（沒有任何 \ifx 判斷）——這代表不管這裡
     傳 numerical 還是 author-year 給 class option，RMP 最終都會被覆蓋成
     author-year，傳哪個字串其實不影響結果。真正需要修的是書目輸出端：
     thebibliography 每筆要帶 [Author(Year)] 可選參數，見 emitBlocks 裡
     'bibliography' 分支與 extractAuthorYear()。這裡維持傳使用者設定的值
     單純作為文件語意記錄，不影響實際排版結果。 */
  if (cite) opts.push(cite);
  const sides = String(g('revtexSides', ''));
  if (sides === 'twoside' || sides === 'oneside') opts.push(sides);
  if (g('revtexShowPacs', false)) opts.push('showpacs');
  if (g('revtexShowKeys', false)) opts.push('showkeys');
  if (g('revtexLongBibliography', true)) opts.push('longbibliography');
  if (g('revtexEprint', true)) opts.push('eprint');
  if (g('revtexBibnotes', false)) opts.push('bibnotes'); else opts.push('nobibnotes');
  if (g('revtexFootInBib', false)) opts.push('footinbib');
  if (g('revtexPreprintNumbers', true)) opts.push('preprintnumbers');
  if (g('revtexBalanceLastPage', true)) opts.push('balancelastpage');
  if (g('revtexTightenLines', false)) opts.push('tightenlines');
  if (g('revtexLengthCheck', false)) opts.push('lengthcheck');
  if (g('revtexEqSecNum', false)) opts.push('eqsecnum');
  if (g('revtexSecNumArabic', false)) opts.push('secnumarabic');
  if (g('revtexFleqn', false)) opts.push('fleqn');
  if (g('revtexFloatFix', true)) opts.push('floatfix');
  if (g('revtexLineNumbers', false)) opts.push('linenumbers');
  if (g('revtexDraft', false)) opts.push('draft');
  /* revtexTitlePage 是三態（見設定面板端註解）：
       auto → 不傳選項，完整保留官方 REVTeX 行為；preprint 會在摘要前
              放置可選軟分頁，因此短稿可能留在首頁、長稿可能從第二頁開始
       on   → titlepage（官方獨立標題頁）
       off  → notitlepage，並由 preamble 的局部 wrapper 抑制 preprint
              摘要前軟分頁，形成真正的連續首頁。 */
  const titlePage = String(g('revtexTitlePage', 'auto'));
  if (titlePage === 'on') opts.push('titlepage');
  else if (titlePage === 'off') opts.push('notitlepage');
  /* endfloats：官方 \DeclareOption{endfloats}/{endfloats*} 差別在
     floatp@sw——後者讓每個浮動體各自獨立成頁。 */
  const endfloats = String(g('revtexEndfloats', 'inline'));
  if (endfloats === 'endfloats' || endfloats === 'endfloats*') opts.push(endfloats);
  const bottomAlign = String(g('revtexBottomAlign', 'flushbottom'));
  if (bottomAlign === 'raggedbottom') opts.push('raggedbottom');
  // flushbottom 是官方預設值，不用特地寫出來（省一個 option，減少衝突機會）
  const altaffil = String(g('revtexAltaffilStyle', 'symbol'));
  if (altaffil === 'letter') opts.push('altaffilletter');
  if (g('revtexLandscape', false)) opts.push('landscape');
  const extra = String(g('revtexExtraOptions', '')).trim();
  if (extra) for (const e of extra.split(/[,\s]+/).filter(Boolean)) opts.push(e);
  // 去重並保序
  const seen = new Set(); const out = [];
  for (const o of opts) { const t = String(o).trim(); if (t && !seen.has(t)) { seen.add(t); out.push(t); } }
  return out;
}

/* 選擇性套件一律用 \\IfFileExists 包起來，缺套件時退化而不是編譯中止。
   投稿到期刊的環境未必與作者本機一致，這一層讓 .tex 在陌生環境仍能出 PDF。 */
function optionalPkg(name, opts, fallback){
  const load = '\\usepackage' + (opts ? '[' + opts + ']' : '') + '{' + name + '}';
  return '\\IfFileExists{' + name + '.sty}{' + load + '}{' + (fallback || '') + '}';
}


/* REVTeX 4.2f 的 preprint 不是固定 title page；它在
   \frontmatter@abstract@produce 前放一個 penalty -200 的可選換頁點。
   `notitlepage` 只控制 titlepage@sw，無法關掉該軟分頁。當使用者明確選
   revtexTitlePage=off 時，我們保留官方摘要巨集本體，只在該次呼叫的局部
   範圍讓 preprintsty@sw 選擇無軟分頁分支。這樣 APS/AIP/AAPM/SOR 對摘要
   字型、寬度、PACS、Keywords 與間距的 .rtx 覆寫仍全部生效。 */
function continuousFrontmatterPreamble(S){
  const mode = String(S && S.revtexTitlePage !== undefined ? S.revtexTitlePage : 'auto');
  if (mode !== 'off') return [];
  return [
    '% CP171-REVTEX-CONTINUOUS-FRONTMATTER-BEGIN',
    '\\makeatletter',
    '\\@booleanfalse\\titlepage@sw',
    '\\let\\cpseventeenone@frontmatter@abstract@produce\\frontmatter@abstract@produce',
    '\\def\\frontmatter@abstract@produce{%',
    '  \\begingroup',
    '    \\let\\preprintsty@sw\\@secondoftwo',
    '    \\cpseventeenone@frontmatter@abstract@produce',
    '  \\endgroup',
    '}%',
    '\\makeatother',
    '% CP171-REVTEX-CONTINUOUS-FRONTMATTER-END'
  ];
}

function preamblePackages(S, used){
  const g = (k, d) => (S && S[k] !== undefined ? S[k] : d);
  const lines = [];
  if (g('revtexAmsmath', true)) lines.push('\\usepackage{amsmath}');
  if (g('revtexAmssymb', true)) lines.push('\\usepackage{amssymb}');
  lines.push('\\usepackage{graphicx}');
  /* 缺圖不能是致命錯誤：\includegraphics 找不到檔案時 LaTeX 直接
     "Fatal error occurred, no output PDF file produced!"，整份稿子連一頁都出不來
     （使用者把外部寫好的 Markdown 貼進來編譯時必踩）。\cptimg 依序試
     原名 / .pdf / .png / .jpg / .eps，都沒有就畫一個標明檔名的佔位框。
     ★ \providecommand 的參數在單層定義裡是 #1/#2；寫成 #1/#2 會得到
     "Illegal parameter number"（實測 140 個）。## 只有在巨集定義內再定義巨集才需要。 */
  lines.push('\\providecommand{\\cptimg}[2]{%');
  lines.push('  \\IfFileExists{#2}{\\includegraphics[width=#1]{#2}}{%');
  lines.push('  \\IfFileExists{#2.pdf}{\\includegraphics[width=#1]{#2.pdf}}{%');
  lines.push('  \\IfFileExists{#2.png}{\\includegraphics[width=#1]{#2.png}}{%');
  lines.push('  \\IfFileExists{#2.jpg}{\\includegraphics[width=#1]{#2.jpg}}{%');
  lines.push('  \\IfFileExists{#2.eps}{\\includegraphics[width=#1]{#2.eps}}{%');
  lines.push('  \\fbox{\\parbox[c][0.28\\columnwidth][c]{#1}{\\centering\\footnotesize');
  lines.push('    [missing image file: \\texttt{\\detokenize{#2}}]}}}}}}}%');
  lines.push('}');
  if (used.table || used.mathProbe) {
    /* 表格寬度用「LaTeX 編譯時量測、超出才縮放」而不是「JS 端估算字元數」
       決定要不要 \resizebox——全矩陣壓力測試證實字元數估算在不同期刊的
       .rtx（版心寬度、字距各異）下會失準：同一份表格套用最小字級
       \scriptsize 後，APS 版心剛好塞得下，AIP 的 jmp/jor/pof 版心卻仍
       溢出 87pt，但兩者的估算字元數是同一個數字，門檻怎麼調都會在
       某個期刊上失準。\ifdim 用的是 LaTeX 真正排版後量到的實際寬度，
       跟哪個期刊、哪個字級無關，只在真的超出才縮放，不會誤傷本來就
       塞得下的表格。 */
    lines.push('\\newsavebox{\\cptbbox}');
    lines.push('\\newlength{\\cptbnat}');
    lines.push('\\newlength{\\cptbraw}');
    lines.push('\\newif\\ifcptwide');
    lines.push('\\newif\\ifcptfold');
    lines.push('\\newif\\ifcpttblfit');
  }
  /* 每個表格一組專屬的 savebox + length。
     為什麼不能共用同一個 \cptbbox：量測必須放在 \begin{table} 之外
     （\sbox 會立即排版，放在 float 內會讓 endfloats 失效），但這樣一來
     所有表格會在正文層依序覆寫同一個盒子，而 float 內容是延後展開的
     ——展開時全部拿到最後一次覆寫的內容。實測結果是每個表格都顯示成
     同一份資料且重複多次，而且編譯零錯誤、零溢出，任何自動判準都抓不到，
     只有截圖看得出來。
     命名用計數器轉字母序列（LaTeX 巨集名不能含數字）。 */
  const tblCount = used.tableCount || 0;
  const boxSuffix = n => String(n).split('').map(d => 'abcdefghij'[Number(d)]).join('');
  for (let i = 1; i <= tblCount; i++) {
    lines.push('\\newsavebox{\\cptb' + boxSuffix(i) + '}');
    lines.push('\\newlength{\\cptn' + boxSuffix(i) + '}');
  }
  if (used.table) lines.push(optionalPkg('dcolumn'));
  /* longtable 是標準 LaTeX 套件（非 REVTeX 自帶），官方明言需要
     \usepackage{longtable}，REVTeX 才會動態修補它以支援雙欄
     （auguide4-2 第 304-305 行）。 */
  if (used.longtable) lines.push('\\usepackage{longtable}');
  if (used.booktabs && g('texBooktabs', false)) lines.push(optionalPkg('booktabs'));
  if (used.listings && g('texListings', false)) lines.push(optionalPkg('listings'));
  else if (used.verbatim) lines.push('\\usepackage{verbatim}');
  if (used.strike || used.underline) lines.push(optionalPkg('ulem', 'normalem', '\\providecommand{\\sout}[1]{#1}\\providecommand{\\uline}[1]{\\underline{#1}}'));
  if (used.highlight) lines.push('\\IfFileExists{soul.sty}{\\usepackage{soul}\\sethlcolor{yellow}}{\\providecommand{\\hl}[1]{#1}}');
  if (used.subscript) lines.push('\\providecommand{\\textsubscript}[1]{\\raisebox{-.35ex}{\\scriptsize #1}}');
  if (used.url) lines.push(optionalPkg('url', '', '\\providecommand{\\url}[1]{\\texttt{#1}}'));
  /* hyperref 的預設外觀是「在連結四周畫彩色方框」，交叉引用、書目引用與作者
     腳註符號因此在 PDF 上都被框起來，投稿版面看起來像草稿（使用者用真實論文
     對照時發現的）。實際期刊稿與 arXiv 稿慣例是彩色文字、不畫框，所以改用
     colorlinks；要完全黑白（部分期刊要求）可把 revtexLinkColor 設成 'black'。 */
  if (g('revtexHyperref', true)) {
    const lc = String(g('revtexLinkColor', 'blue') || 'blue');
    lines.push(optionalPkg('hyperref', 'colorlinks=true,linkcolor=' + lc + ',citecolor=' + lc
                           + ',urlcolor=' + lc + ',filecolor=' + lc,
                           '\\providecommand{\\href}[2]{#2\\footnote{\\texttt{#1}}}'));
  }
  if (used.cjk) {
    lines.push((cpEN() ? '% This document contains CJK text: compile with XeLaTeX or LuaLaTeX (pdfLaTeX cannot handle it).' : '% 文件含中日韓文字：必須用 XeLaTeX 或 LuaLaTeX 編譯（pdfLaTeX 無法處理）。'));
    /* ★ 字型偵測邏輯必須包在「xeCJK 真的成功載入」的判斷分支內，不能
       接在 optionalPkg() 後面單獨執行。\IfFontExistsTF 是 fontspec 提供
       的巨集，只有 xeCJK 真的被 \usepackage 才會隱式載入 fontspec；
       容器缺 xeCJK.sty 時 optionalPkg 走的是警告分支，\usepackage{xeCJK}
       根本沒執行，fontspec 也沒被載入——這時候呼叫 \IfFontExistsTF 會得到
       "Undefined control sequence"，矩陣重跑時炸了 87 組（僅次於部署前
       改一次矩陣全綠的心理陷阱：改完只用一份文件手動驗證，沒跑全矩陣就
       以為沒事）。 */
    const cjkFontProbe =
      '\\IfFontExistsTF{Noto Serif CJK SC}{\\setCJKmainfont{Noto Serif CJK SC}}{%\n' +
      '\\IfFontExistsTF{Noto Sans CJK SC}{\\setCJKmainfont{Noto Sans CJK SC}}{%\n' +
      '\\IfFontExistsTF{Noto Serif CJK TC}{\\setCJKmainfont{Noto Serif CJK TC}}{%\n' +
      '\\IfFontExistsTF{PingFang SC}{\\setCJKmainfont{PingFang SC}}{%\n' +
      '\\IfFontExistsTF{Microsoft YaHei}{\\setCJKmainfont{Microsoft YaHei}}{%\n' +
      '\\IfFontExistsTF{SimSun}{\\setCJKmainfont{SimSun}}{%\n' +
      '\\PackageWarningNoLine{cp171}{找不到任何內建 CJK 字型，中文將顯示為 Missing character；' +
      '請在額外 class option 或 preamble 逃生區塊自行指定 \\setCJKmainfont}%\n' +
      '}}}}}}';
    lines.push('\\IfFileExists{xeCJK.sty}{\\usepackage{xeCJK}' + cjkFontProbe + '}'
      + '{\\PackageWarningNoLine{cp171}{xeCJK 不可用，CJK 文字將無法正確排版}}');
  }
  return lines;
}

/* ---------- 發射 ---------- */
/* 官方 .rtx 在 class 層級無條件強制 author-year 的期刊代碼（見上面
   classOptions() 內的說明）。目前只確認 rmp 一項；若之後補上 apsrmp4-2
   以外更多 always-author-year 的 .rtx，加在這裡即可，兩處（classOptions
   的註解與 emit() 的 ctx.forceAuthorYearBib）都會跟著生效。 */
const FORCED_AUTHORYEAR_JOURNALS = new Set(['rmp']);

function emit(ast, opts){
  opts = opts || {};
  const S0 = opts.settings || (typeof settings !== 'undefined' ? settings : {});
  const S = Object.create(S0);
  const P = K.need('parser');
  const warnings = [];
  const assets = [];
  const map = [];              // {tex: 行號, md: 行號}
  const out = [];
  let curMdLine = 0;

  const used = { table:false, booktabs:false, listings:false, verbatim:false,
                 strike:false, underline:false, highlight:false, subscript:false,
                 url:false, figure:false, widetext:false, cjk:false,
                 mathProbe:false, longtable:false };
  const CJK_RE = /[\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/;

  // 先掃一遍決定需要哪些套件（preamble 必須在正文之前寫出）
  /* 具名腳註（[^id] 語法）的內容查表：REVTeX 用 bibnote 機制實作腳註，
     `\footnotemark`（只印標記）+ `\footnotetext`（另外提供內容）這組
     標準 LaTeX 寫法在這裡完全沒被接上——先前的實作只輸出了
     `\footnotemark[id]`，`footnote_def` 的內容被丟進純註解，PDF 上
     腳註永遠找不到內容，顯示成 "[?]"（視覺抽查看到過，當時誤判成
     REVTeX 的正常占位符號，沒有深究）。
     正確做法：預掃描先把每個 [^id] 的定義內容抽成純文字，`footnote_ref`
     展開時直接查表輸出完整的 \footnote{...}，不再用標記/內容分離的
     寫法——REVTeX 的官方書目腳註機制本來就是靠 \footnote{} 就地展開，
     不是 \footnotemark/\footnotetext 這種標準 LaTeX 的分離寫法。 */
  const footnoteDefs = {};
  const footnoteUsed = {};
  if (P) P.walk(ast.blocks, n => {
    if (n.type === 'footnote_def' && !(n.fid in footnoteDefs)) {
      const paras = (n.children || []).filter(c => c.type === 'paragraph');
      footnoteDefs[n.fid] = paras.length
        ? paras.map(p => inline(p.children, { S, warnings, assets, used, bibBlocks: [] })).join(' ')
        : '';
    }
  });
  if (P) P.walk(ast.blocks, n => {
    if (n.type === 'table') { used.table = true; used.booktabs = true; used.tableCount = (used.tableCount || 0) + 1; }
    if (n.type === 'long_table') used.longtable = true;
    /* 數學寬度量測要用到 \cptbbox，宣告在 preamble——所以這裡（預掃描階段）
       就得知道會不會用到，不能等 emitBlocks 執行時才設旗標（太晚了）。
       條件與 emitBlocks 內 probeable 的定義一致：非自帶數學環境、無 \\。
       inWideBlock 這一項預掃描看不到，寧可多宣告（多一行無害）。 */
    if (n.type === 'math_block') {
      const t = n.tex || '';
      const env = (t.match(/^\s*\\begin\{([^}*]+)\*?\}/) || [])[1] || '';
      const selfMath = /^(equation|align|alignat|gather|multline|flalign|eqnarray|displaymath|math|split|widetext)$/i.test(env);
      if (!selfMath && !/\\\\/.test(t)) used.mathProbe = true;
    }
    if (n.type === 'code_block') { used.listings = true; used.verbatim = true; }
    if (n.type === 'raw_tex') { /* 不推斷套件，作者自負 */ }
    if (n.type === 'strike') used.strike = true;
    if (n.type === 'underline') used.underline = true;
    if (n.type === 'highlight') used.highlight = true;
    if (n.type === 'subscript') used.subscript = true;
    if (n.type === 'link') used.url = true;
    if (n.type === 'figure') { used.figure = true; if (n.wide) used.widetext = true; }
    if (!used.cjk) {
      if (n.type === 'text' && CJK_RE.test(n.value)) used.cjk = true;
      else if ((n.type === 'code_block' || n.type === 'raw_tex') && CJK_RE.test(n.value || '')) used.cjk = true;
    }
  });
  // frontmatter 也要看：標題／摘要／作者常是 CJK 的第一處
  if (!used.cjk) { try { if (CJK_RE.test(JSON.stringify(ast.meta || {}))) used.cjk = true; } catch(_) {} }

  const push = (line, mdLine) => {
    out.push(line);
    map.push({ tex: out.length, md: (mdLine === undefined ? curMdLine : mdLine) });
  };
  const blank = () => push('');

  /* --- 前言 --- */
  const co = classOptions(S);
  const fontProfile = revtexFontProfile(S);
  if (fontProfile.guarded) {
    warnings.push('AIP reprint + Letter + 雙欄若明確指定 11pt/12pt，會載入不相容的大字級 grid，使第一頁正文逼近紙張下緣；已改由 REVTeX 模式自動選用 10pt。');
  }
  push('% !TEX program = ' + (used.cjk ? 'xelatex' : 'pdflatex'));
  push((cpEN() ? '% Produced by the Ekdeta CP171 international-paper pipeline; a human-readable, journal-editable REVTeX 4.2 source.' : '% 由 Ekdeta CP171 國際論文管線產生；此檔為人可讀、期刊可再編輯的 REVTeX 4.2 原始檔。'));
  push('\\documentclass[' + co.join(',') + ']{revtex4-2}');
  for (const l of preamblePackages(S, used)) push(l);
  const meta = ast.meta || {};
  if (meta.preamble) for (const l of String(meta.preamble).split('\n')) push(l);
  /* 文件級 off 必須在使用者 preamble 之後成為最終權威；auto/on 完全不
     注入此區塊，確保官方輸出與手寫官方 LaTeX 可做逐像素 parity。 */
  for (const l of continuousFrontmatterPreamble(S)) push(l);
  blank();
  push('\\begin{document}');
  blank();

  /* --- frontmatter --- */
  emitFrontmatter(meta, push, warnings, String(S.revtexAddress || 'groupedaddress'));

  /* --- 正文 --- */
  const bibBlocks = [];
  /* ctx 拉成具名物件：emitBlocks 內設的旗標（hasInlineBib、used.widetext）
     必須能被後面的書目段與 preamble 檢查讀到。原本是行內字面量，
     子函式寫進去的欄位在外層拿不到。
     forceAuthorYearBib：這個期刊的 .rtx 在 class 層級無條件強制
     author-year（FORCED_AUTHORYEAR_JOURNALS），thebibliography 裡的
     \bibitem 必須帶 [Author(Year)] 才不會在 PDF 印出 "(???)"。 */
  const ctx = { S, warnings, assets, used, bibBlocks, hasInlineBib: false,
                footnoteDefs, footnoteUsed,
                /* 何時需要 [Author(Year)]：
                     (a) 期刊在 .rtx 層級無條件強制（RMP）
                     (b) 使用者自己選了 author-year 引用格式
                   先前只判 (a)，漏了 (b)——使用者在設定面板選 author-year 時，
                   行內書目沒有可選參數，natbib 直接編譯失敗
                   （L2 維度全值覆蓋抓到：aip + author-year）。 */
                /* 何時需要 [Author(Year)]：
                     (a) 期刊在 .rtx 層級無條件強制（RMP）
                     (b) 使用者自己選了 author-year 引用格式
                     (c) 文件用了會顯示作者名的引用巨集（\textcite / \citet）
                   (c) 是視覺抽查抓到的：numerical 模式下用 \textcite，
                   natbib 找不到作者資訊會在正文印出「(author?)」，
                   編譯零錯誤、判準全綠，只有肉眼看得出來。 */
                forceAuthorYearBib: FORCED_AUTHORYEAR_JOURNALS.has(String(S.revtexJournal || ''))
                                    || String(S.revtexCitation || '') === 'author-year'
                                    || (P && (() => {
                                         let need = false;
                                         P.walk(ast.blocks, n => {
                                           if (n.type === 'cite' &&
                                               /^(textcite|citet)$/.test(String(n.macro || ''))) need = true;
                                         });
                                         return need;
                                       })()),
                setLine: v => { curMdLine = v; } };
  emitBlocks(ast.blocks, push, ctx);

  /* --- 書目 --- */
  blank();
  /* 書目樣式必須配合期刊：apsrmp4-2.rtx 第 217 行把 \@bibstyle 固定為
     apsrmp4-2；AIP 家族用 aipnum4-2（numerical）／aipauth4-2（author-year）。
     用錯樣式會讓 BibTeX 產出與 class 不相容的 .bbl。 */
  const soc = String((S && S.revtexSociety) || 'aps');
  const jr  = String((S && S.revtexJournal) || '');
  const ay  = (jr === 'rmp') || String((S && S.revtexCitation) || '') === 'author-year';
  const bibStyle = jr === 'rmp' ? 'apsrmp4-2'
                 : soc === 'aip' ? (ay ? 'aipauth4-2' : 'aipnum4-2')
                 : soc === 'aapm' ? 'aapmrev4-2'
                 : 'apsrev4-2';
  if (ctx.hasInlineBib && ctx.pendingBib) {
    /* 行內書目在這裡（文件最末、appendix 之後）輸出，符合官方順序
       （apssamp.tex：\bibliography 在第 749 行、\appendix 在 687 行）。
       透過假 block 重入 emitBlocks 的 __bibliography_emit__ case，
       author-year 抽取等邏輯只維護一份。 */
    emitBlocks([{ type: '__bibliography_emit__', payload: ctx.pendingBib }], push, ctx);
  } else if (ctx.hasInlineBib) {
    push((cpEN() ? '% The bibliography is supplied inline by the revtex-bibliography block (thebibliography).' : '% 書目由文件內的 revtex-bibliography 區塊直接提供（thebibliography）。'));
  } else if (meta.bibliography) {
    push('\\bibliographystyle{' + bibStyle + '}');
    push('\\bibliography{' + String(meta.bibliography).replace(/\.bib$/, '') + '}');
  } else if (bibBlocks.length) {
    push('\\bibliographystyle{' + bibStyle + '}');
    push('\\bibliography{refs}');
  } else {
    const body = out.join('\n');
    const hasCite = (ast.stats && ast.stats.cites) || /\\cite\{/.test(body);
    // REVTeX 用書目機制實作 \footnote（bibnote）。沒有 \bibliography 時，
    // 腳註會在 PDF 上排成 [?]——編譯不報 error，只在 log 深處留一條 natbib warning。
    // ★ 用 ctx.hasFootnote 旗標而不是對整個輸出字串做 /\footnote\{/ 正則掃描：
    //   preamble 的 \href fallback 定義本身字面上含 "\footnote{"（給沒裝
    //   hyperref 時用），正則會把這個 preamble 樣板文字誤判成正文真的用了
    //   腳註，連沒有任何腳註的文件都會被硬塞一份空 \bibliography。
    const hasFootnote = !!ctx.hasFootnote;
    if (hasCite || hasFootnote) {
      push('\\bibliographystyle{' + bibStyle + '}');
      push('\\bibliography{refs}');
      warnings.push(hasCite
        ? '文中有引用但 frontmatter 未指定書目來源，已預設為 refs.bib——請確認該檔存在。'
        : '文中有腳註：REVTeX 以書目機制實作腳註，因此仍需 \\bibliography 與一次 BibTeX。已預設 refs.bib。');
    } else {
      push('% 本文沒有引用文獻也沒有腳註。要加文獻，在 frontmatter 寫 bibliography: refs');
    }
  }
  blank();
  push('\\end{document}');

  const tex = out.join('\n') + '\n';
  const check = selfcheck(tex, ast);
  if (!check.ok) warnings.push(...check.problems);

  if (used.cjk) warnings.push('文件含 CJK 文字，引擎已切換為 xelatex（pdflatex 無法處理 CJK）');
  /* 定義了卻沒被任何 [^id] 參照用到的腳註：內容不會出現在 PDF 上，
     使用者八成是打錯 id 或忘記刪掉草稿階段的舊定義，提醒比靜默好。 */
  for (const fid of Object.keys(footnoteDefs)) {
    if (!footnoteUsed[fid]) warnings.push('腳註定義 [^' + fid + '] 沒有被任何地方引用，內容不會出現在 PDF 上。');
  }
  return { tex, map, assets, bib: bibBlocks.join('\n'), warnings,
           classOptions: co, fontProfile,
           engine: used.cjk ? 'xelatex' : 'pdflatex', selfcheck: check };
}

/* --- frontmatter：title / authors / affiliations / abstract / pacs / keywords --- */
function emitFrontmatter(meta, push, warnings, addrStyle){
  /* \preprint 必須在 \title 之前（官方 apssamp.tex 第 60 行的順序）。
     解析器有讀進 meta.preprint 但發射器從未輸出——L5 內容探針抓到的。 */
  if (meta.preprint) push('\\preprint{' + textOut(meta.preprint) + '}');
  if (meta.title) push('\\title{' + textOut(meta.title) + '}');
  else { push('\\title{Untitled}'); warnings.push('frontmatter 缺 title，已填 Untitled'); }

  const affs = normList(meta.affiliations || meta.affiliation);
  /* 1.1.5.5：宣告順序 vs 實際印出順序。
     REVTeX 的 superscriptaddress 是「按 \affiliation 第一次出現的先後」編號，
     沒有任何官方語法可以指定「這個單位固定是第 5 號」。所以當使用者用
     affiliations: 明寫了順序、而作者順序決定出來的編號跟它不同時，
     必須講清楚，否則會以為是程式沒照做（DeepH 復刻時就是卡在這個認知）。 */
  if (meta.affiliationsExplicit) {
    const seen = [];
    for (const a of normList(meta.authors || meta.author)) {
      const idx = (a && Array.isArray(a.affil)) ? a.affil : [];
      for (const i of idx) if (seen.indexOf(i) < 0) seen.push(i);
    }
    const differs = seen.some((v, k) => v !== k);
    if (differs && addrStyle === 'superscriptaddress' && Array.isArray(warnings)) {
      warnings.push('單位編號會依「第一次出現的作者順序」排，與 affiliations: 宣告的順序不同'
        + '（REVTeX 沒有指定固定編號的語法）。想讓某個單位排在後面，就讓第一個屬於它的作者排在後面。');
    }
  }
  const authors = normList(meta.authors || meta.author);

  if (!authors.length) {
    push('\\author{Anonymous}');
    warnings.push('frontmatter 缺 authors');
  } else {
    // 依 affil 分組：同一組 affiliation 的作者連續列出，之後接 \affiliation
    let lastKey = null;
    authors.forEach((a, idx) => {
      const name = typeof a === 'string' ? a : (a.name || a.Name || '');
      const affIdx = (typeof a === 'object' && a.affil !== undefined) ? [].concat(a.affil) : [];
      const key = affIdx.join(',');
      if (lastKey !== null && key !== lastKey) flushAff(lastKey);
      push('\\author{' + textOut(name) + '}');
      if (typeof a === 'object' && a.email) push('\\email{' + String(a.email) + '}');
      /* \homepage 與 \altaffiliation 是官方 frontmatter 命令（auguide4-2 列為
         與 \email 同級的作者附屬項）。先前只輸出 email，homepage 與
         altaffiliation 即使解析出來也會被丟棄——L5 內容探針抓到的。
         \altaffiliation 必須緊跟在該作者的 \author 之後（官方 apssamp.tex
         第 66 行的寫法），不能移到 \affiliation 之後。 */
      if (typeof a === 'object' && a.homepage) push('\\homepage{' + String(a.homepage) + '}');
      if (typeof a === 'object' && a.altaffiliation) {
        push('\\altaffiliation{' + textOut(a.altaffiliation) + '}');
      }
      if (typeof a === 'object' && a.thanks) push('\\thanks{' + textOut(a.thanks) + '}');
      lastKey = key;
      if (idx === authors.length - 1) flushAff(key);
    });
    function flushAff(key){
      if (key === null || key === '') { return; }
      for (const k of String(key).split(',')) {
        const n = parseInt(k, 10);
        const aff = affs[n];
        if (aff !== undefined) push('\\affiliation{' + textOut(typeof aff === 'string' ? aff : (aff.name || '')) + '}');
        else warnings.push('作者引用了不存在的 affiliation 索引 ' + k);
      }
    }
  }
  if (meta.collaboration) {
    push('\\collaboration{' + textOut(meta.collaboration) + '}');
    /* 官方 auguide4-2 第 501 行明確要求：「Because collaborations don't
       normally have affiliations, one needs to follow the \collaboration
       with \noaffiliation.」缺了它，collaboration 會繼承前一位作者的
       單位歸屬，PDF 上的上標編號會錯。L5 內容探針抓到的。 */
    push('\\noaffiliation');
  }
  /* date 常見寫法是 \today（原生語料庫就是這樣寫的）。textOut() 會把
     反斜線轉義成純文字，PDF 上就會印出字面的 "\today" 而不是日期。
     只有「整個值就是一個 LaTeX 巨集」時原樣通過，其餘照常轉義，
     避免把使用者輸入的日期文字當成指令執行。 */
  if (meta.date) {
    const d = String(meta.date).trim();
    push('\\date{' + (/^\\[A-Za-z@]+$/.test(d) ? d : textOut(meta.date)) + '}');
  }

  push('');
  if (meta.abstract) {
    push('\\begin{abstract}');
    push(textOut(String(meta.abstract).trim()));
    push('\\end{abstract}');
  }
  const pacs = normList(meta.pacs);
  if (pacs.length) push('\\pacs{' + pacs.map(String).join(', ') + '}');
  const kw = normList(meta.keywords);
  if (kw.length) push('\\keywords{' + kw.map(x => textOut(String(x))).join(', ') + '}');
  push('');
  push('\\maketitle');
  push('');
}

function normList(v){
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'object') {
    // parseFrontmatter 對「key: 後接清單」可能建成物件，取其值
    const vals = Object.values(v);
    if (vals.length === 1 && Array.isArray(vals[0])) return vals[0];
    return [v];
  }
  return [v];
}

/* --- 區塊 --- */
const SECT = ['\\section', '\\subsection', '\\subsubsection', '\\paragraph', '\\subparagraph', '\\subparagraph'];

function emitBlocks(blocks, push, ctx){
  for (const b of blocks || []) {
    if (b.line) ctx.setLine(b.line);
    switch (b.type) {

      case 'heading': {
        const cmd = SECT[Math.min(b.depth, SECT.length) - 1] || '\\paragraph';
        /* 不編號章節：部分期刊（Science Bulletin、Nature 系）與多數
           前言／致謝／附註段落不編號。REVTeX 沒有對應的 class option，
           作者是直接寫 \section*。Markdown 端沿用 pandoc 慣例：
           標題結尾加 {-} 或 {.unnumbered}。 */
        const star = b.unnumbered ? '*' : '';
        /* ★ 章節標題內不能放 \footnote：REVTeX 在標題這類「移動參數」
           情境會刻意把 \footnote 停用（revtex4-2.cls 第 2588 行的
           \ltx@no@footnote 把 \ltx@xfootnote 換成報錯版本），硬放會得到
           "Use of \ltx@xfootnote doesn't match its definition" 而編譯
           失敗——實測一次炸掉 87 組。
           標題內的腳註改成靜默丟棄標記本身、但保留文字內容不見得更好
           （標題會突然多出一段不明文字），所以策略是：移除腳註、
           發警告告訴使用者這在 REVTeX 不被支援、並建議改用
           frontmatter 的 thanks: 欄位（那才是官方給標題/作者附註用的
           正式管道）。 */
        const headInline = inline(b.children, ctx);
        if (/\\footnote\{/.test(headInline)) {
          ctx.warnings.push('章節標題內含腳註，但 REVTeX 在標題這類移動參數中停用了 \\footnote'
            + '（會編譯失敗）。已從標題移除該腳註；若要標註作者或稿件層級的附註，'
            + '請改用 frontmatter 的 thanks: 欄位。');
        }
        push(cmd + star + '{' + headInline.replace(/\\footnote\{(?:[^{}]|\{[^{}]*\})*\}/g, '') + '}');
        if (b.label) push('\\label{' + b.label + '}');
        push('');
        break;
      }

      case 'paragraph':
        push((b.noindent ? '\\noindent ' : '') + inline(b.children, ctx));
        push('');
        break;

      /* 鐵律一：原樣透傳 */
      case 'math_block': {
        const tex = b.tex || '';
        /* 「開頭是 \begin{...} 就原樣輸出」這個判斷不夠細：LaTeX 的環境分兩類。
         *   自帶數學模式（equation/align/gather/multline/eqnarray/displaymath…）
         *     → 可以直接放在正文層，原樣輸出正確。
         *   只能寄生在數學模式內（array/matrix/pmatrix/bmatrix/cases/aligned/
         *     smallmatrix/subarray…）
         *     → 裸輸出會得到 "Bad math environment delimiter" 與
         *       "Missing $ inserted"，正是使用者截圖裡 exit 1 的其中兩個錯誤。
         *       原始 Markdown 明明寫了 $$…$$，是這裡把外層數學模式弄丟了。
         * 因此只有「自帶數學模式」那一類才裸輸出，其餘一律補回 equation 外殼。*/
        const envName = (tex.match(/^\s*\\begin\{([^}*]+)\*?\}/) || [])[1] || '';
        const SELF_MATH_ENV = new Set([
          'equation', 'align', 'alignat', 'gather', 'multline', 'flalign',
          'eqnarray', 'displaymath', 'math', 'split', 'widetext'
        ]);
        const isSelfMathEnv = !!envName && SELF_MATH_ENV.has(envName.toLowerCase());

        /* 過長公式在雙欄版面要包 widetext 跨欄——但「多長算過長」不能在
           JS 端用原始碼字元數估算。使用者實測回報：公式 (8)
           \chi^2=\frac{1}{N}\sum\frac{[...]^2}{\sigma^2+\sigma^2} 源碼很長，
           但 \frac 排版後是「上下堆疊」，實際寬度只有 max(分子,分母)，
           下標也是縮小疊在右下——渲染出來窄窄一條，卻被字元數估算誤判成
           超寬而整頁置中，夾在雙欄正文中間非常突兀。

           改用跟表格一致的做法：先把數學內容放進 \sbox 讓 LaTeX 真實排版
           一次、量出實際寬度，再用 \ifdim 比較 \linewidth，真的超出才開
           widetext。兩個 \ifdim 用同一個條件（盒寬在中間不會變），
           分別控制 \begin{widetext} 與 \end{widetext}，數學本體只輸出一次。

           量測盒用 $\displaystyle …$：displaystyle 才是 equation 環境的
           實際字級（分數、上下限都全尺寸），不加的話量到的是行內縮小版。
           含 \\ 的多行內容（如 array 環境）不量測——\\ 在 \sbox 的水平盒
           內不合法；這類內容維持原樣包 equation，寬度交給使用者用
           revtex-wide fence 自行控制。 */
        /* 寬公式的處理策略（由窄到寬三段式，全部在編譯期由 LaTeX 實測寬度決定）：
             1. 塞得進單欄            → 一般 equation
             2. 稍寬，且有頂層折點    → multline 在欄內折兩行（官方標準做法）
             3. 真的很寬，或無法折行  → widetext 跨欄

           為什麼要有第 2 段：使用者實測回報公式 (12) 被整頁置中很突兀。
           量測顯示該式 285.8pt vs 單欄 246.0pt，只超出 16%——判斷沒錯，
           但為了 16% 就霸佔整頁寬確實不合理。縮字級救不了
           （\small 267.2pt、\footnotesize 248.5pt 都仍超過 246pt），
           multline 折行後零溢出，這才是 REVTeX 論文的慣用寫法。

           兩個 \sbox 量測：wd1 = 整式單行寬度，wd2 = 折行後較長那半的寬度。
           只有「折行後仍塞不下」才升級到 widetext。 */
        const probeable = !ctx.inWideBlock && !isSelfMathEnv && !/\\\\/.test(tex);
        let ml = null;
        if (probeable) {
          ctx.used.mathProbe = true;
          /* 量測用的 \sbox 內容要剝掉 \label 與 \tag：
             \label 在盒子裡會重複定義同一個標籤；\tag 只允許出現在
             equation 這類真正的數學環境內，放進純 $...$ 量測盒會得到
             "Package amsmath Error: \tag not allowed here" 而編譯失敗
             （實測踩到）。兩者都只是標記、不影響公式的實際排版寬度，
             量測時剝掉不會讓判斷失準。 */
          const probeSrc = tex.replace(/\\label\{[^}]*\}/g, '')
                              .replace(/\\tag\*?\{[^}]*\}/g, '')
                              .replace(/\n/g, ' ').trim();
          ml = splitForMultline(probeSrc);
          push('\\sbox{\\cptbbox}{$\\displaystyle ' + probeSrc + '$}%');
          push('\\setlength{\\cptbraw}{\\wd\\cptbbox}%');   // 整式單行寬度
          push('\\setlength{\\cptbnat}{\\wd\\cptbbox}%');
          if (ml) {
            /* 量折行後兩半各自的寬度，取較大者存回 \cptbnat：
               這代表「折行方案實際需要的欄寬」。 */
            push('\\sbox{\\cptbbox}{$\\displaystyle ' + ml.head + '$}%');
            push('\\ifdim\\wd\\cptbbox>\\cptbnat\\else\\setlength{\\cptbnat}{\\wd\\cptbbox}\\fi%');
            push('\\sbox{\\cptbbox}{$\\displaystyle ' + ml.tail + '$}%');
            push('\\ifdim\\wd\\cptbbox>\\cptbnat\\setlength{\\cptbnat}{\\wd\\cptbbox}\\fi%');
          }
          /* 三個開關對應三段式策略（必須先存進 \newif 再用：\begin{widetext}
             一開，\linewidth 就從單欄寬變全頁寬，若在 \end 那側用同一個
             \ifdim 重新判斷會得到相反結果、\end{widetext} 被跳過，編譯直接
             掛在 "\begin{widetext} ended by \end{document}"，實測踩過）：
               \ifcptwide  真的很寬（連折行都不夠）→ widetext 跨欄
               \ifcptfold  單行放不下但折行放得下   → multline 欄內折兩行
               兩者皆假                             → 一般 equation
             \cptbnat 此時存的是「折行方案需要的欄寬」（兩半較長者），
             \cptbraw 存整式單行寬度。先判單行塞不塞得下，塞得下就什麼都不做
             ——否則像公式 (11)（125.5pt，遠小於單欄 246pt）也會被折成兩行，
             變成 "+R_s+I dR_s/dI" 孤零零掉到第二行，非常難看（實測踩到）。 */
          push('\\cptwidefalse\\cptfoldfalse');
          push('\\ifdim\\cptbraw>\\linewidth');
          push('  \\ifdim\\cptbnat>\\linewidth\\cptwidetrue\\else\\cptfoldtrue\\fi');
          push('\\fi');
          push('\\ifcptwide\\begin{widetext}\\fi');
        }

        if (isSelfMathEnv) { for (const l of tex.split('\n')) push(l); }
        else if (ml) {
          /* 折行版與單行版都輸出，由 \ifcptfold 二選一：
             只有「單行放不下、折行放得下」時才用 multline。 */
          push('\\ifcptfold');
          push('\\begin{multline}');
          if (b.label) push('\\label{' + b.label + '}');
          push(ml.head + ' \\\\');
          push(ml.tail);
          push('\\end{multline}');
          push('\\else');
          push('\\begin{equation}');
          if (b.label) push('\\label{' + b.label + '}');
          for (const l of tex.replace(/\\label\{[^}]*\}/, '').split('\n')) push(l);
          push('\\end{equation}');
          push('\\fi');
        }
        else if (b.label) {
          push('\\begin{equation}');
          push('\\label{' + b.label + '}');
          for (const l of tex.replace(/\\label\{[^}]*\}/, '').split('\n')) push(l);
          push('\\end{equation}');
        } else {
          push('\\begin{equation}');
          for (const l of tex.split('\n')) push(l);
          push('\\end{equation}');
        }
        if (probeable) push('\\ifcptwide\\end{widetext}\\fi');
        push('');
        break;
      }

      /* ```revtex-wide → \begin{widetext}。內容已由解析器遞迴解析成一般
         語意節點，這裡直接重入 emitBlocks 產出正常的 table/equation/段落。
         這是使用者回報「表格用 Markdown 顯示」「表格字跑出去」「公式跨過
         雙欄中線」「公式沒渲染」四項的共同修法——先前整段走 verbatim，
         verbatim 不換行也不排版，在雙欄下必然溢出版心。
         單欄模式下 widetext 是 no-op，官方允許無條件使用。 */
      case 'wide_block': {
        ctx.used.widetext = true;
        push('\\begin{widetext}');
        /* widetext 內不得放浮動體（table/figure 會被 LaTeX 延後或報錯），
           所以用 inWideBlock 通知 table 分支改用非浮動的置中表格。 */
        const prevWide = ctx.inWideBlock;
        ctx.inWideBlock = true;
        emitBlocks(b.children || [], push, ctx);
        ctx.inWideBlock = prevWide;
        push('\\end{widetext}');
        push('');
        break;
      }

      /* ```revtex-subequations → subequations 環境包 eqnarray，產生
         (1a)(1b)(1c) 這樣的子編號（官方 auguide4-2 第 1000 行範例）。
         每條子式各自 \label，順序沿用 block id 保證穩定。 */
      /* ```revtex-turnpage → \begin{turnpage}...\end{turnpage} 包住單一
         table 或 figure（官方限定，見解析器端註解）。取內容裡第一個
         table/figure，其餘子區塊（如說明文字）原樣輸出在外層，
         不塞進 turnpage 內——turnpage 只該包浮動體本身。 */
      case 'turnpage_block': {
        const children = b.children || [];
        const floatIdx = children.findIndex(c => c.type === 'table' || c.type === 'figure');
        if (floatIdx < 0) {
          ctx.warnings.push('revtex-turnpage 區塊內沒有找到表格或圖片，'
            + '官方 turnpage 環境只用來包住單一 table 或 figure，已略過旋轉、'
            + '內容改用一般排版輸出。');
          emitBlocks(children, push, ctx);
          break;
        }
        const before = children.slice(0, floatIdx);
        const after = children.slice(floatIdx + 1);
        const extraFloats = after.filter(c => c.type === 'table' || c.type === 'figure');
        if (extraFloats.length) {
          ctx.warnings.push('revtex-turnpage 區塊內有 ' + (extraFloats.length + 1)
            + ' 個表格/圖片，但官方 turnpage 一次只能放一個（無跨頁機制），'
            + '只取第一個旋轉，其餘照一般排版輸出。');
        }
        emitBlocks(before, push, ctx);
        /* 量測用的 \sbox 必須在 \begin{turnpage} 之前執行：turnpage 內部
           是旋轉後的座標系，\linewidth 已被改寫成頁高，minipage 寬度會
           算錯（實測 274pt 溢出）。用 deferredMeasure 讓 table 分支把
           量測行收集起來，在這裡先於 turnpage 輸出。 */
        const measureLines = [];
        const prevDefer = ctx.deferredMeasure;
        ctx.deferredMeasure = measureLines;
        const floatLines = [];
        const prevTurn2 = ctx.inTurnpage;
        ctx.inTurnpage = true;
        emitBlocks([children[floatIdx]], l => floatLines.push(l), ctx);
        ctx.inTurnpage = prevTurn2;
        ctx.deferredMeasure = prevDefer;
        for (const l of measureLines) push(l);
        /* turnpage 前必須 \clearpage：turnpage 的浮動體要獨占整頁，
           若前面還有未放置的浮動體積在佇列裡，LaTeX 會找不到位置放它，
           報 "A float is stuck (cannot be placed)"，接著在 \clearpage
           處理時進入 "Output loop---100 consecutive dead cycles" 而
           編譯失敗（11pt 等組合實測踩到；放寬 totalnumber/topfraction
           等浮動體參數無效，因為根因不是佇列上限而是「整頁被占用」）。
           先清空佇列再開 turnpage，語意上也正確——turnpage 本來就是
           獨占一頁的排版。 */
        push('\\clearpage');
        push('\\begin{turnpage}');
        for (const l of floatLines) push(l);
        push('\\end{turnpage}');
        emitBlocks(after, push, ctx);
        break;
      }

      /* ```revtex-longtable 的外層包裝：直接把子節點展開輸出（升級後的
         long_table 節點在下面單獨處理，說明文字等其他子節點照常排版）。 */
      case 'longtable_wrap':
        emitBlocks(b.children || [], push, ctx);
        break;

      /* long_table → 官方 longtable 環境。跨頁/跨欄由 longtable.sty +
         REVTeX 的動態修補處理（auguide4-2 第 304-305 行：「REVTeX 4.2
         動態修補 longtable.sty」），我們只需要輸出正確語法，不必自己
         實作分頁演算法。這跟一般 table 完全不同的地方：
           · 用 \endhead 讓表頭每頁/每欄重複，不能省略，否則跨頁後
             使用者看不出每欄代表什麼
           · 不套兩階段量測（\sbox 量寬度→resizebox）——longtable 設計
             上就是靠自然延續處理「太長」，兩階段量測解決的是「太寬」，
             兩者是不同維度的問題，硬套反而會跟 longtable 的分頁機制衝突
           · 官方明言 longtable* 與 ruledtabular 不相容，所以不用雙線，
             改用一般 \hline（auguide4-2 第 1610-1612 行的建議做法） */
      case 'long_table': {
        const colCount = b.header.length;
        const alignSpec = b.aligns.join('');
        push('\\begin{longtable}{' + alignSpec + '}');
        if (b.caption) push('\\caption{' + inline(b.caption, ctx) + '}\\\\');
        if (b.label) push('\\label{' + b.label + '}');
        push('\\hline');
        push(b.header.map(c => inline(c, ctx)).join(' & ') + ' \\\\');
        push('\\hline');
        push('\\endhead');
        push('\\hline');
        push('\\endfoot');
        for (const r of b.rows) {
          const cells = r.slice(0, colCount);
          while (cells.length < colCount) cells.push([]);
          push(cells.map(c => inline(c, ctx)).join(' & ') + ' \\\\');
        }
        push('\\end{longtable}');
        push('');
        ctx.used.longtable = true;
        break;
      }

      case 'subequations': {
        const parts = b.parts || [];
        if (!parts.length) break;
        push('\\begin{subequations}');
        push('\\begin{eqnarray}');
        parts.forEach((p, i) => {
          push('  ' + p + (i < parts.length - 1 ? ' \\\\' : ''));
        });
        push('\\end{eqnarray}');
        push('\\end{subequations}');
        push('');
        break;
      }

      /* ```revtex-appendix → \appendix。之後的 \section 自動改成附錄編號。 */
      case 'appendix_marker':
        push('\\appendix');
        push('');
        break;

      /* ```revtex-bibliography → thebibliography/\bibitem。
         先前這段走 verbatim，導致長書目在頁寬處被硬裁（使用者回報
         「Reference 跑到 PDF 外面」）。改成真正的書目環境後由 TeX 自行斷行。*/
      /* 行內書目不在原位輸出：官方順序（apssamp.tex 第 681-749 行實證）是
         acknowledgments → \appendix + 附錄章節 → 書目在文件最末。
         corpus 與模板的 markdown 把 bibliography fence 寫在 appendix 之前，
         若照原位輸出 thebibliography，APS 樣式下其後的 \appendix 會整個
         失效（附錄標題沒有 Appendix A 前綴、公式編號不變 (A1)——
         aps_prl 實測 "Appendix A" 出現次數為 0）。暫存到 ctx.pendingBib，
         由 emit() 主流程在文件最末的書目段輸出。 */
      case 'bibliography': {
        const items = b.items || [];
        if (!items.length) break;
        ctx.pendingBib = b;
        ctx.hasInlineBib = true;
        break;
      }

      case 'acknowledgments': {
        // 官方環境；REVTeX 會依期刊樣式排版（標題、字級、位置）
        push('\\begin{acknowledgments}');
        for (const l of String(b.text || '').split('\n')) push(textOut(l));
        push('\\end{acknowledgments}');
        push('');
        break;
      }

      case '__bibliography_emit__': {
        const bb = b.payload; const bitems = bb.items || [];
        /* 1.1.5.6.1：正文引用到、但書目裡沒有的鍵，在這裡就講清楚。
           最多列 8 個，超過只報總數——警告列表太長使用者一樣不會看。 */
        if (ctx.citeKeys) {
          const have = Object.create(null);
          for (const it of bitems) have[String(it.key)] = true;
          const missing = Object.keys(ctx.citeKeys).filter(k => !have[k]);
          if (missing.length) {
            const shown = missing.slice(0, 8).join('、');
            ctx.warnings.push(cpEN()
              ? ('These citations have no matching bibliography entry: ' + missing.slice(0, 8).join(', ')
                 + (missing.length > 8 ? (' (and ' + (missing.length - 8) + ' more)') : '')
                 + '. They will print as [?] in the PDF.')
              : ('這些引用在書目裡找不到對應條目：' + shown
                 + (missing.length > 8 ? ('（另有 ' + (missing.length - 8) + ' 筆）') : '')
                 + '，PDF 上會印成 [?]。'));
          }
        }
        /* RMP 等期刊在 class 層級無條件強制 author-year，thebibliography
           若沒有 [Author(Year)] 可選參數，natbib 會在正文把 \cite 印成
           "(???)"——這是全矩陣壓力測試在真實編譯中抓到的，不是理論假設。
           抽取失敗的筆數如果太多（>25%），代表這批書目的格式跟我們的
           抽取規則落差太大，硬套會有相當比例印出錯誤或缺失的作者名，
           這時退回不帶方括號比較誠實，並用警告把情況講清楚，讓使用者
           知道需要什麼（通常是換一份 .bib 檔）。 */
        const needAY = !!ctx.forceAuthorYearBib;
        let extracted = 0;
        const withAY = bitems.map(it => ({ ...it, ay: needAY ? extractAuthorYear(it.text) : null }));
        if (needAY) extracted = withAY.filter(x => x.ay).length;
        const useAY = needAY && extracted >= bitems.length * 0.75;
        if (needAY && !useAY) {
          ctx.warnings.push('本刊物在 class 層級強制 author-year 引用，但行內書目有 '
            + (bitems.length - extracted) + '/' + bitems.length + ' 筆抓不出作者與年份'
            + '（書目文字格式跟預期落差較大），已略過自動標註——這些引用在 PDF 上'
            + '可能顯示為 "(???)"。建議改用 .bib 檔（frontmatter 寫 bibliography: refs），'
            + '交給真正的 BibTeX 樣式處理會更可靠。');
        }
        push('\\begin{thebibliography}{' + '9'.repeat(String(bitems.length).length) + '}');
        for (const it of (useAY ? withAY : bitems)) {
          push('\\bibitem' + (useAY && it.ay ? '[' + textOut(it.ay) + ']' : '') + '{' + it.key + '}');
          push(textOut(it.text));
        }
        push('\\end{thebibliography}');
        push('');
        break;
      }

      case 'raw_tex':
        for (const l of String(b.value || '').split('\n')) push(l);
        push('');
        break;

      case 'code_block': {
        const useListings = ctx.S && ctx.S.texListings;
        if (useListings) {
          push('\\begin{lstlisting}' + (b.lang ? '[language=' + b.lang + ']' : ''));
          for (const l of String(b.value || '').split('\n')) push(l);
          push('\\end{lstlisting}');
        } else {
          push('\\begin{verbatim}');
          for (const l of String(b.value || '').split('\n')) push(l);
          push('\\end{verbatim}');
        }
        push('');
        break;
      }

      case 'blockquote':
        push('\\begin{quotation}');
        emitBlocks(b.children, push, ctx);
        push('\\end{quotation}');
        push('');
        break;

      case 'list': {
        const env = b.ordered ? 'enumerate' : 'itemize';
        const prevDepth = ctx.listDepth || 0, depth = prevDepth + 1;
        ctx.listDepth = depth;
        push('\\begin{' + env + '}');
        if (b.ordered && Number(b.start) > 1) {
          const counters = ['enumi','enumii','enumiii','enumiv'];
          const cn = counters[Math.min(counters.length - 1, depth - 1)];
          push('\\setcounter{' + cn + '}{' + (Math.floor(Number(b.start)) - 1) + '}');
        }
        for (const it of b.items) {
          const sub = [];
          const p2 = (l) => sub.push(l);
          emitBlocks(it.children, p2, ctx);
          while (sub.length && !sub[sub.length - 1].trim()) sub.pop();
          const marker = (it.task === null || it.task === undefined) ? '\\item '
                       : '\\item[' + (it.task ? '$\\boxtimes$' : '$\\square$') + '] ';
          if (!sub.length) { push(marker.trim()); continue; }
          push(marker + sub[0]);
          for (let i = 1; i < sub.length; i++) push('  ' + sub[i]);
        }
        push('\\end{' + env + '}');
        ctx.listDepth = prevDepth;
        push('');
        break;
      }

      case 'figure': {
        const star = b.wide ? '*' : '';
        const rawSrc = String(b.src || '');
        const baseWidth = b.wide ? '\\textwidth' : '\\columnwidth';
        const figWidth = imageWidthExpr(b.scale, baseWidth, !!b.scaleExplicit);
        /* data: URI 與 http(s) 遠端圖片不是本機檔案，pdfLaTeX 無法直接取用；
           仍保留同一縮放寬度的佔位框，避免版面與實圖尺寸語意分叉。 */
        const isInlineData = /^data:/i.test(rawSrc);
        const isRemote = /^https?:\/\//i.test(rawSrc);
        push('\\begin{figure' + star + '}');
        push('\\centering');
        if (isInlineData || isRemote) {
          push('\\fbox{\\parbox[c][0.28\\columnwidth][c]{' + figWidth + '}{\\centering\\footnotesize '
             + (isInlineData ? '[inline data: URI image -- not usable by pdfLaTeX]'
                             : '[remote image -- pdfLaTeX does not fetch URLs]') + '}}');
          ctx.warnings.push(isInlineData
            ? '有內嵌 data: URI 圖片，pdfLaTeX 無法直接使用，已改為佔位框。'
              + '請把圖片存成本機檔（.pdf/.png/.eps）再用 ![](檔名) 引用。'
            : '有遠端圖片 ' + rawSrc.slice(0, 60) + '…，pdfLaTeX 不會下載網路圖片，'
              + '已改為佔位框。請先下載到本機再引用。');
        } else {
          push('\\cptimg{' + figWidth + '}{'
             + rawSrc.replace(/\.(png|jpg|jpeg|pdf|eps)$/i, '') + '}');
          if (rawSrc) ctx.assets.push(rawSrc);
        }
        if (b.caption) push('\\caption{' + inline(b.caption, ctx) + '}');
        if (b.label) push('\\label{' + b.label + '}');
        push('\\end{figure' + star + '}');
        push('');
        break;
      }

      case 'table': {
        /* 表格寬度處理分兩件事：
           (A) 要不要用 table*（跨欄浮動體）——這件事必須在 JS 端決定，
               因為 table 與 table* 是不同的環境名稱，LaTeX 沒辦法在
               排版當下才改。用估算的內容字元寬度判斷，寧可偏向跨欄：
               跨欄表格在單欄版面等同一般表格，不會有副作用。
           (B) 內容排完仍超出版寬時要不要縮放——這件事絕對不能在 JS 端
               估算。全矩陣壓力測試證實：同一份表格加了最小字級
               \scriptsize 之後，APS 版心剛好塞得下，AIP 的 jmp/jor/pof
               卻仍溢出 87pt，但兩者在 JS 端算出來的字元數完全相同，
               門檻怎麼調都會在某個期刊上失準。

           (B) 改成讓 LaTeX 在編譯當下自己量測，分兩階段：
             階段一：先用普通 tabular 把內容排一次、量出「自然寬度」。
                     這裡不能用 ruledtabular——它的定義（revtex4-2.cls
                     第 6906 行）是 \def\@halignto{to\hsize}，強制表格
                     撐滿 \hsize，量到的永遠是版寬而不是內容需要的寬度，
                     \resizebox 因此完全無效（實測驗證過這個失敗）。
             階段二：把 \hsize 設成剛量到的自然寬度來排 ruledtabular，
                     讓規則線跟著內容走；最後用 \ifdim 比較自然寬度與
                     \linewidth，只有真的超出時才 \resizebox 縮回去。
           只在必要時縮放很重要：無條件縮放會讓本來塞得下的表格也被縮小，
           實測過固定 3 倍寬的版本，表格小到完全無法閱讀。 */
        const colCount = b.header.length;
        const plain = c => inline(c, ctx).replace(/\\[A-Za-z]+\s*/g, '').replace(/[{}$\\]/g, '');
        const colW = [];
        for (let k = 0; k < colCount; k++) {
          let w = plain(b.header[k] || []).length;
          for (const r of b.rows) w = Math.max(w, plain(r[k] || []).length);
          colW.push(w);
        }
        const est = colW.reduce((a, x) => a + x, 0) + colCount * 3;
        const NARROW_COL_CHARS = 46;    // 雙欄版面單欄可容字元數（10pt 估值）
        const FULL_WIDTH_CHARS = 100;   // 跨欄／單欄版面可容字元數
        const inWide = !!ctx.inWideBlock;
        /* turnpage 內的表格獨占整頁、且可用寬度是頁高而非欄寬：
           不加 *（已經獨占）、也不做寬度縮放判斷（基準錯誤，實測會
           誤判成需要縮放而產生 274pt 溢出）。 */
        const inTurn = !!ctx.inTurnpage;
        const star = (!inWide && !inTurn && est > NARROW_COL_CHARS) ? '*' : '';
        const shrink = est > FULL_WIDTH_CHARS
          ? (est > FULL_WIDTH_CHARS * 1.45 ? '\\scriptsize' : '\\footnotesize')
          : '';

        const alignSpec = b.aligns.join('');
        /* 合併儲存格：alignSpec 維持用原本的 aligns（LaTeX 的 tabular
           允許某一列用 \multicolumn 吃掉多欄，實際 & 數量因此可以少於
           宣告的欄位模板數，不需要另外調整 alignSpec）。
           合併儲存格統一用置中對齊（\multicolumn 最常見的慣例，視覺上
           比沿用左/右欄位對齊更合理——寬標題置中比較好看）。 */
        const renderRow = (cells, colspans) => cells.map((c, k) => {
          const span = colspans ? colspans[k] : 1;
          const txt = inline(c, ctx);
          return span > 1 ? '\\multicolumn{' + span + '}{c}{' + txt + '}' : txt;
        }).join(' & ') + ' \\\\';
        const headRow = renderRow(b.header, b.headerColspans);
        const bodyRows = b.rows.map((r, ri) => {
          const rowSpans = b.rowsColspans ? b.rowsColspans[ri] : null;
          /* colCount 是用 header 算的（有合併時會變小）。若某一列自己
             沒有合併，它在解析階段仍是原本欄數（比如 3 欄），用 colCount
             （比如 2）去裁切會砍掉最後一欄的真實資料——只有在整張表格
             完全沒有合併（rowSpans 為 null）時才能安全地用 colCount
             補齊/裁切；有合併時保留該列自己的實際長度，不做裁切。 */
          const cells = rowSpans ? r : (() => {
            const c2 = r.slice(0, colCount);
            while (c2.length < colCount) c2.push([]);
            return c2;
          })();
          return renderRow(cells, rowSpans);
        });

        /* ★ 每個表格必須用「自己專屬」的 savebox，不能共用同一個 \cptbbox。
           量測搬到 float 外之後（見下方說明），所有表格會在正文層依序
           覆寫同一個盒子，而 float 內容是延後展開的——展開時全部拿到
           最後一次覆寫的內容，實測結果是每個表格都顯示成同一份資料、
           而且重複多次。改成用計數器產生唯一名稱（LaTeX 巨集名不能含
           數字，所以把數字轉成字母序列）。 */
        ctx.tableSeq = (ctx.tableSeq || 0) + 1;
        const boxName = '\\cptb' + String(ctx.tableSeq).split('')
          .map(d => 'abcdefghij'[Number(d)]).join('');
        const natName = '\\cptn' + String(ctx.tableSeq).split('')
          .map(d => 'abcdefghij'[Number(d)]).join('');
        (ctx.tableBoxes = ctx.tableBoxes || []).push({ box: boxName, len: natName });

        /* 兩階段量測必須放在 \begin{table} 之外。
           \sbox 會「立即」排版內容，而 endfloats 的機制是把浮動體內容
           「延後」到文件末尾才展開——兩者直接衝突：float 內出現 \sbox
           時，LaTeX 被迫立即處理該浮動體，endfloats 對它就失效了，
           表格會留在原地（實測：同一份官方文件只把 table 內容換成
           \sbox 寫法，表格就從 TABLES 標題下方跑到上方）。
           量測先在正文層做完、結果存在專屬盒子裡，float 內只保留
           \ifdim 判斷與 \usebox，就沒有立即排版的動作。 */
        /* 量測行的輸出目標：一般情況直接 push；在 turnpage 內時導向
           ctx.deferredMeasure，由 turnpage_block 在 \begin{turnpage}
           之前輸出（turnpage 內 \linewidth 已被改寫成頁高，量測會失準）。*/
        if (inTurn) {
          /* turnpage 內不做兩階段量測：它獨占整頁、旋轉後可用空間充足，
             不需要判斷是否縮放。而且 minipage 包裝在旋轉座標系下高度
             計算會失準，造成「A float is stuck (cannot be placed)」→
             「Output loop---100 consecutive dead cycles」而編譯失敗
             （11pt 與部分 pairwise 組合實測踩到）。直接輸出原生
             ruledtabular，交給 turnpage 自己處理。 */
          push('\\begin{table}');
          if (b.caption) push('\\caption{' + inline(b.caption, ctx) + '}');
          if (b.label) push('\\label{' + b.label + '}');
          if (shrink) push(shrink);
          push('\\begin{ruledtabular}');
          push('\\begin{tabular}{' + alignSpec + '}');
          push(headRow);
          push('\\hline');
          for (const r of bodyRows) push(r);
          push('\\end{tabular}');
          push('\\end{ruledtabular}');
          push('\\end{table}');
          push('');
          break;
        }

        /* 量測與裝箱的輸出位置很重要：\linewidth 在 widetext 的外層仍是「欄寬」，
           只有進到 center／table* 這類會重設 \linewidth 的環境內才等於可用全寬。
           1.1.4.1 第一版把寬度判斷寫在環境之前，結果在 widetext 內用欄寬去比，
           判成「放不下」而 \resizebox 到全寬，表格被放大約兩倍（L6 對照層抓到）。
           因此非 turnpage 的情況先收進 localMeasure，等環境開好再一次輸出。 */
        const localMeasure = [];
        const mpush = ctx.deferredMeasure ? (l => ctx.deferredMeasure.push(l))
                                          : (l => localMeasure.push(l));
        /* 階段一是「純量測」：它的 \sbox 內容只是為了量寬度，最後會被
           階段二覆寫掉、不會出現在版面上。但 \footnote 是有副作用的巨集
           ——只要被展開就會產生一筆腳註，即使那個盒子後來沒被用到。
           因此階段一必須剝掉 \footnote，否則每個含腳註的儲存格都會產生
           兩筆重複腳註（實測：PDF 上出現 [1][2] 與 [3][4] 兩組相同內容，
           表格裡的標記還指向後面那組）。
           寬度誤差可接受：\footnote 在正文只留一個上標數字，寬度影響
           極小，不會改變「要不要跨欄／縮放」的判斷。 */
        const stripFn = s => s.replace(/\\footnote\{(?:[^{}]|\{[^{}]*\})*\}/g, '');
        // 階段一：普通 tabular 量自然寬度（不含規則線，故不受 to\hsize 影響）
        mpush('\\sbox{' + boxName + '}{\\begin{tabular}{' + alignSpec + '}');
        mpush(stripFn(headRow));
        for (const r of bodyRows) mpush(stripFn(r));
        mpush('\\end{tabular}}%');
        mpush('\\setlength{' + natName + '}{\\wd' + boxName + '}%');
        /* 階段一半：決定階段二要用多寬的 \hsize 排 ruledtabular。
           官方 ruledtabular 的定義是 \def\@halignto{to\hsize}，規則線一律撐滿
           可用寬度；REVTeX 期刊排出來的表格因此是「線與版心同寬、內容在其中分布」。
           CP171 早期為了讓 \resizebox 的判斷有意義，一律把 ruledtabular 關進
           「自然寬度」的 minipage，副作用是塞得下的表格也變成置中窄框，與官方版面
           不一致（1.1.4.1 由 L6 官方對照層抓到）。
           修法：塞得下就把 minipage 撐成 \linewidth（＝官方外觀），塞不下才維持
           自然寬度並交給 \resizebox 縮回去。兩種情況共用同一個 \sbox，所以表格
           內容只展開一次——\footnote 有副作用，分兩個分支各寫一份會產生重複腳註。 */
        if (!inTurn) {
          mpush('\\ifdim' + natName + '>\\linewidth\\cpttblfittrue\\else\\cpttblfitfalse\\setlength{'
               + natName + '}{\\linewidth}\\fi%');
        }
        // 階段二：以決定好的寬度為 \hsize 排 ruledtabular
        mpush('\\sbox{' + boxName + '}{\\begin{minipage}{' + natName + '}\\begin{ruledtabular}\\begin{tabular}{'
             + alignSpec + '}');
        mpush(headRow);
        mpush('\\hline');
        for (const r of bodyRows) mpush(r);
        mpush('\\end{tabular}\\end{ruledtabular}\\end{minipage}}%');

        if (inWide) {
          push('\\begin{center}');
          if (shrink) push(shrink);
        } else {
          push('\\begin{table' + star + '}');
          if (b.caption) push('\\caption{' + inline(b.caption, ctx) + '}');
          if (b.label) push('\\label{' + b.label + '}');
          if (shrink) push(shrink);
        }
        for (const l of localMeasure) push(l);

        if (inTurn) {
          // turnpage：直接輸出，不做以 \linewidth 為基準的縮放判斷
          push('\\usebox{' + boxName + '}%');
        } else {
          push('\\ifcpttblfit');
          push('  \\resizebox{\\linewidth}{!}{\\usebox{' + boxName + '}}%');
          push('\\else');
          push('  \\usebox{' + boxName + '}%');
          push('\\fi');
        }

        if (inWide) {
          if (b.caption) push('\\par\\smallskip{\\footnotesize ' + inline(b.caption, ctx) + '}');
          push('\\end{center}');
        } else {
          push('\\end{table' + star + '}');
        }
        push('');
        break;
      }

      case 'thematic_break':
        push('\\bigskip\\hrule\\bigskip');
        push('');
        break;

      /* 內容已在對應的 footnote_ref 處展開成 \footnote{...}，這裡不再
         輸出任何東西——先前的實作把整段丟成純 LaTeX 註解，PDF 上腳註
         內容完全消失，只顯示 "[?]"（視覺抽查看到過，誤判成正常占位
         符號沒有深究，見上方 footnoteDefs 的完整說明）。 */
      case 'footnote_def':
        break;

      default:
        ctx.warnings.push('未處理的區塊型別：' + b.type);
    }
  }
}

/* --- 行內 --- */
function inline(children, ctx){
  let s = '';
  for (const c of children || []) {
    switch (c.type) {
      case 'text':          s += textOut(c.value); break;
      case 'strong':        s += '\\textbf{' + inline(c.children, ctx) + '}'; break;
      case 'emph':          s += '\\emph{' + inline(c.children, ctx) + '}'; break;
      case 'strike':        s += '\\sout{' + inline(c.children, ctx) + '}'; break;
      case 'underline':     s += '\\uline{' + inline(c.children, ctx) + '}'; break;
      case 'highlight':     s += '\\hl{' + inline(c.children, ctx) + '}'; break;
      case 'subscript':     s += '\\textsubscript{' + inline(c.children, ctx) + '}'; break;
      case 'superscript':   s += '\\textsuperscript{' + inline(c.children, ctx) + '}'; break;
      case 'hard_break':    s += '\\\\ '; break;
      case 'code_inline':   s += inlineCode(c.value); break;
      case 'math_inline':   s += '$' + c.tex + '$'; break;
      case 'raw_inline':    s += c.tex; break;   /* TeX 控制空格等原樣片段 */      /* 鐵律一 */
      case 'link': {
        const label = inline(c.children, ctx);
        const dest = String(c.dest || '');
        if (!label || label === textOut(dest)) s += '\\url{' + dest + '}';
        else s += '\\href{' + dest + '}{' + label + '}';
        break;
      }
      case 'image': {
        // 行內／表格圖片：有明確 zoom 時以欄寬百分比輸出；舊 Markdown 無縮放仍維持 0.4 欄寬。
        const isrc = String(c.src || '');
        const iw = c.scaleExplicit
          ? imageWidthExpr(c.scale, '\\columnwidth', true)
          : '0.4\\columnwidth';
        if (/^(data:|https?:\/\/)/i.test(isrc)) s += '\\fbox{\\footnotesize [image]}';
        else {
          s += '\\cptimg{' + iw + '}{' + isrc.replace(/\.(png|jpg|jpeg|pdf|eps)$/i, '') + '}';
          if (isrc) ctx.assets.push(isrc);
        }
        break;
      }
      case 'cite': {
        const macro = c.macro && c.macro !== 'cite' ? c.macro : 'cite';
        /* 1.1.5.6.1：記下用到的鍵，文件末尾比對書目。
           以前寫錯鍵只會在 LaTeX log 深處出現一行 Citation undefined，
           PDF 上印一個 [?]，使用者根本不知道是哪一個字打錯。 */
        if (!ctx.citeKeys) ctx.citeKeys = Object.create(null);
        for (const k of (c.keys || [])) ctx.citeKeys[k] = true;
        s += '\\' + macro + '{' + (c.keys || []).join(',') + '}';
        break;
      }
      case 'ref':           s += '\\' + (c.style || 'ref') + '{' + c.id + '}'; break;
      case 'label':         s += '\\label{' + c.id + '}'; break;
      case 'footnote_inline': ctx.hasFootnote = true; s += '\\footnote{' + inline(c.children, ctx) + '}'; break;
      case 'footnote_ref': {
        const txt = ctx.footnoteDefs ? ctx.footnoteDefs[c.id] : undefined;
        if (ctx.footnoteUsed) ctx.footnoteUsed[c.id] = true;
        if (txt !== undefined && txt !== '') {
          /* REVTeX 的 \footnote 是靠 bibnote 機制實作，跟 \cite 一樣
             需要 \bibliographystyle+\bibliography 才能正確編譯出內容
             （純 pdflatex 兩輪不夠，實測光有 \footnote{...} 卻沒有這兩行
             宣告，PDF 上仍然印出 "[?]"）。footnote_inline case 已經會
             設 ctx.hasFootnote，這裡用具名腳註（[^id] 語法）同樣要設，
             先前漏了這條路徑，才會出現「.tex 裡內容明明都在、PDF 卻
             找不到」的斷鏈。 */
          ctx.hasFootnote = true;
          s += '\\footnote{' + txt + '}';
        } else {
          /* 找不到對應定義：使用者可能打錯 id，或定義段落解析不出純文字
             （例如定義本身是列表而非段落）。退化成 \footnotemark，
             至少不會產生指向不存在內容的斷鏈，並警告使用者。 */
          ctx.warnings.push('腳註 [^' + c.id + '] 找不到對應定義（或定義內容無法轉成純文字），'
            + '已退化為只顯示標記，PDF 上不會有腳註文字。');
          s += '\\footnotemark';
        }
        break;
      }
      default:
        if (c.children) s += inline(c.children, ctx);
        else if (c.value !== undefined) s += textOut(c.value);
    }
  }
  return s;
}

/* ---------- 出口自檢（鐵律的機械化驗證）---------- */
const MATH_UNICODE = /[\u0370-\u03FF\u2190-\u21FF\u2200-\u22FF\u27F0-\u27FF\u2A00-\u2AFF]/;

function selfcheck(tex, ast){
  const problems = [];

  // 鐵律一：數學區不得含非 ASCII 數學符號
  const mathSpans = [];
  const reEq = /\\begin\{(equation\*?|align\*?|gather\*?|eqnarray\*?|multline\*?)\}([\s\S]*?)\\end\{\1\}/g;
  let m;
  while ((m = reEq.exec(tex))) mathSpans.push(m[2]);
  const reInline = /(^|[^\\])\$([^$\n]+)\$/g;
  while ((m = reInline.exec(tex))) mathSpans.push(m[2]);
  for (const span of mathSpans) {
    if (MATH_UNICODE.test(span)) {
      problems.push('鐵律一違反：數學區出現 Unicode 數學符號 → ' + span.slice(0, 60));
      break;
    }
  }

  // 環境配對
  const opens = [...tex.matchAll(/\\begin\{([A-Za-z*]+)\}/g)].map(x => x[1]);
  const closes = [...tex.matchAll(/\\end\{([A-Za-z*]+)\}/g)].map(x => x[1]);
  const tally = {};
  for (const o of opens) tally[o] = (tally[o] || 0) + 1;
  for (const c of closes) tally[c] = (tally[c] || 0) - 1;
  for (const [k, v] of Object.entries(tally)) if (v !== 0) problems.push('環境不配對：' + k + '（差 ' + v + '）');

  // 必要骨架
  if (!/\\documentclass\[[^\]]*\]\{revtex4-2\}/.test(tex)) problems.push('缺 revtex4-2 documentclass');
  if (!/\\begin\{document\}/.test(tex) || !/\\end\{document\}/.test(tex)) problems.push('缺 document 環境');
  if (!/\\maketitle/.test(tex)) problems.push('缺 \\maketitle');

  /* metadata 遺失偵測。這一條是 v1.1.3.4 補上的：先前
     ```revtex-frontmatter 沒被解析時，發射器輸出 \title{Untitled}
     \author{Anonymous} 並把整段 metadata 印成 verbatim，而 selfcheck
     仍然回報 ok:true——災難性失敗靜默通過，takeover 因此照樣接管，
     使用者才會看到「本來勉強能編譯，現在完全不能編譯」。
     原稿明明有標題卻掉成佔位值，必須當成不合格，讓 takeover 退回舊發射器。*/
  if (/\\title\{Untitled\}/.test(tex) && ast && ast.meta && ast.meta.title) {
    problems.push('標題遺失：原稿有 title 但輸出為 \\title{Untitled}');
  }
  if (/\\author\{Anonymous\}/.test(tex) &&
      ast && ast.meta && Array.isArray(ast.meta.authors) && ast.meta.authors.length) {
    problems.push('作者遺失：原稿有 authors 但輸出為 \\author{Anonymous}');
  }
  /* 未被辨識的 revtex-* fence 若殘留成 verbatim，代表 metadata 跑進正文 */
  if (/\\begin\{verbatim\}[\s\S]{0,400}?^\s*(title|author|affiliation)\s*:/m.test(tex)) {
    problems.push('metadata 誤入正文：偵測到 frontmatter 欄位出現在 verbatim 區塊');
  }

  // 大括號平衡（略過 \{ \}）
  const stripped = tex.replace(/\\[{}]/g, '').replace(/\\verb(.)[\s\S]*?\1/g, '');
  let depth = 0;
  for (const ch of stripped) { if (ch === '{') depth++; else if (ch === '}') depth--; if (depth < 0) break; }
  if (depth !== 0) problems.push('大括號不平衡（淨值 ' + depth + '）');

  return { ok: problems.length === 0, problems, mathSpans: mathSpans.length };
}

K.register('emit', { emit, esc, textOut, classOptions, revtexFontProfile, selfcheck, version: '1.2.1' });
K.log.info('emit', 'CP171 REVTeX 4.2 發射器就緒');
})();
