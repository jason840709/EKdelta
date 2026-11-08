
/* ============================================================================
 * cp171-20-emit — 國際論文管線 · REVTeX 4.2 發射器
 *
 * 輸入：cp171-10-parser 的 AST + settings 的 revtex* 既有 profile
 * 輸出：{ tex, map, assets, bibFiles, warnings, engine, classOptions, … }
 *        tex      完整可編譯的 REVTeX 4.2 原始檔（人可讀、期刊可再編輯）
 *        map      .tex 行號 → Markdown 行號 對應表（SyncTeX 反向定位的補強）
 *        assets   圖檔清單 [{src, path}]：src 是 Markdown 裡寫的路徑，path 是 main.tex
 *                 實際引用的名稱（呼叫端把 src 的檔案放到 path）
 *
 * 1.2.6 起這是「唯一」產生 main.tex 的地方（單一入口 mainTex(md, opts)）：
 *   右側預覽編譯、下載 .tex、主選單「匯出 LaTeX」、匯出 REVTeX 專案 .zip、
 *   匯出 PDF／TeX 校樣面板編譯、投稿包，全部呼叫 mainTex()。舊的 04.js
 *   revtexTexDocument 與 takeover 的「自檢沒過就換回舊發射器」機制已退役。
 *
 * 兩種用途（opts.purpose）：
 *   preview     右側即時預覽與瀏覽器內編譯。保留「編譯當下量寬度」的自動跨欄／折行
 *               ／縮表巨集（\sbox、\ifdim、\resizebox…），缺圖畫佔位框。
 *   submission  交出去的檔案（下載 .tex、匯出 LaTeX、.zip、投稿包）。APS 作者指南
 *               不允許 \sbox、\newif、\IfFileExists、\resizebox 等寫法（APS 會把稿件轉成
 *               XML，這些會讓轉檔失敗），所以改用「上一次預覽編譯量到的結果」直接
 *               寫出 equation／multline／widetext 與 \squeezetable 的靜態決定。
 *
 * 兩條鐵律：
 *   鐵律一  數學內容原樣保留，不改寫使用者的 LaTeX。唯一的例外是 pdfLaTeX 根本
 *           不能吃的字元：直接打的 Unicode（α ≤ ²）換成對應指令、落單的 # 與 %
 *           加反斜線。這是「讓它能編譯」，不是改寫數學。
 *   鐵律二  class option 一律取自 settings 既有的 revtex* 鍵，不自建選項模型。
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

/* =====================================================================
 * 第一部分：文字進 TeX——全發射器唯一的文字轉換入口 texText(s, where, ctx)
 *
 * 為什麼只能有一個：舊版的 esc() 只處理 10 個字元，其他問題（< > | 印成 ¡ ¿ —、
 * 直引號方向、希臘字母讓 pdfLaTeX 整份失敗、\verb 放進命令參數、網址的 # %
 * 在標題裡出錯、行首 [ 被當成可選參數）散在各分支或根本沒處理（B 報告 G2）。
 * 現在每一段文字依「它在 .tex 裡的位置」選一種寫法：
 *   'text'  一般文字（正文、標題、圖說、腳註、表格儲存格都一樣——
 *           因為不再用 \verb，文字本身在移動參數裡也安全）
 *   'code'  \texttt{} 的內容：等寬字型直接印 < > | " 等字元，\ { } ~ ^ _ 用 \char
 *   'url'   \href／\url 的網址：% # & 加反斜線（實測在正文、標題、圖說、腳註、
 *           表格量測盒裡都正確），{ } \ ^ $ 空白改用百分比編碼
 *   'math'  數學：原樣，只把 Unicode 換成指令、落單的 # % 加反斜線
 *   'key'   \label／\cite／\bibitem 的鍵：只留安全字元，兩端用同一個函式所以一定對得上
 *
 * 字型編碼：維持 REVTeX 預設的 OT1，不載 T1 fontenc。BusyTeX 的 TeX Live
 * recommended 雖然有 cm-super，但投稿端環境未知，T1 若缺 Type1 字型會退成點陣字；
 * 這裡用的 \textless、\textbar、\ensuremath{\alpha} 等在 OT1 下都正確，不需要 T1。
 * ===================================================================== */

/* pdfLaTeX（預設 UTF-8 輸入、OT1）可以直接吃的非 ASCII 字元：拉丁字母（重音由 OT1
   的重音指令組合）與 TS1 常用符號。清單由實測 revtex4-2 + pdflatex 逐字編譯得出
   （1.2.6 徹查 D_工作檔/探查/unicode），並排除實測會報「unavailable in encoding OT1」
   的 « » Ð Þ ð þ 與帶 ogonek 的字母。 */
const TEXT_PASS = new Set([...
  ' ¡¢£¤¥¦§¨©ª¬®¯°±²³´µ¶·¸¹º¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖ×ØÙÚÛÜÝßàáâãäåæçèéêëìíîïñòóôõö÷øùúûüýÿ'
  + 'ĀāĂăĆćĈĉĊċČčĎďĒēĔĕĖėĚěĜĝĞğĠġĢģĤĥĨĩĪīĬĭİıĲĳĴĵĶķĹĺĻļĽľŁłŃńŅņŇňŌōŎŏŐőŒœŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŨũŪūŬŭŮůŰűŴŵŶŷŸŹźŻżŽž'
  + '‐‑‒―†‡•‰←↑→↓℃№™Ω']);

/* 文字模式對照表：數學符號一律包 \ensuremath{}，在正文、標題、圖說都能用。
   標 (ams) 的指令需要 amssymb，發射器偵測到會自動載入。 */
const TEXT_MAP = {
  '\u00a0':'~', '\u2009':'\\,', '\u200a':'\\,', '\u202f':'\\,', '\u2002':'\\enspace{}', '\u2003':'\\quad{}',
  '\u2007':'\\enspace{}', '\u2008':'\\,', '\u2004':'\\,', '\u2005':'\\,', '\u2006':'\\,', '\u205f':'\\,',
  '\u200b':'', '\u200c':'', '\u200d':'', '\u2060':'', '\ufeff':'', '\u00ad':'\\-', '\u3000':' ',
  '“':'``', '”':"''", '‘':'`', '’':"'", '‚':',', '„':',,', '‛':'`', '‟':'``',
  '«':'\\ensuremath{\\ll}', '»':'\\ensuremath{\\gg}', '‹':'\\ensuremath{\\langle}', '›':'\\ensuremath{\\rangle}',
  '–':'--', '—':'---', '…':'\\ldots{}', '‖':'\\ensuremath{\\|}', '′':"\\ensuremath{'}", '″':"\\ensuremath{''}",
  '‴':"\\ensuremath{'''}", '‵':'`', '⁄':'/', '‱':'\\textperthousand{}0', '※':'*', '⁎':'*', '⁓':'\\ensuremath{\\sim}',
  'Ð':'D', 'ð':'d', 'Þ':'Th', 'þ':'th', 'Đ':'D', 'đ':'d', 'Ŋ':'N', 'ŋ':'n', 'Ħ':'H', 'ħ':'\\ensuremath{\\hbar}',
  'ẞ':'SS', 'ſ':'s', 'ĸ':'k', 'Ŀ':'L', 'ŀ':'l', 'ŉ':"'n", 'Ŧ':'T', 'ŧ':'t',
  'Ą':'A', 'ą':'a', 'Ę':'E', 'ę':'e', 'Į':'I', 'į':'i', 'Ų':'U', 'ų':'u', 'Ǫ':'O', 'ǫ':'o',
  '⁰':'\\textsuperscript{0}', '¹':'\\textsuperscript{1}', '⁴':'\\textsuperscript{4}', '⁵':'\\textsuperscript{5}',
  '⁶':'\\textsuperscript{6}', '⁷':'\\textsuperscript{7}', '⁸':'\\textsuperscript{8}', '⁹':'\\textsuperscript{9}',
  '⁺':'\\textsuperscript{+}', '⁻':'\\textsuperscript{\\ensuremath{-}}', '⁼':'\\textsuperscript{=}', '⁽':'\\textsuperscript{(}',
  '⁾':'\\textsuperscript{)}', 'ⁿ':'\\textsuperscript{n}', 'ⁱ':'\\textsuperscript{i}',
  '₀':'\\textsubscript{0}', '₁':'\\textsubscript{1}', '₂':'\\textsubscript{2}', '₃':'\\textsubscript{3}',
  '₄':'\\textsubscript{4}', '₅':'\\textsubscript{5}', '₆':'\\textsubscript{6}', '₇':'\\textsubscript{7}',
  '₈':'\\textsubscript{8}', '₉':'\\textsubscript{9}', '₊':'\\textsubscript{+}', '₋':'\\textsubscript{\\ensuremath{-}}',
  '₌':'\\textsubscript{=}', '₍':'\\textsubscript{(}', '₎':'\\textsubscript{)}',
  '⅓':'\\ensuremath{\\frac{1}{3}}', '⅔':'\\ensuremath{\\frac{2}{3}}', '⅛':'\\ensuremath{\\frac{1}{8}}',
  'ﬁ':'fi', 'ﬂ':'fl', 'ﬀ':'ff', 'ﬃ':'ffi', 'ﬄ':'ffl',
  '✓':'\\ensuremath{\\checkmark}', '✔':'\\ensuremath{\\checkmark}', '✗':'\\ensuremath{\\times}', '✘':'\\ensuremath{\\times}',
  '★':'\\ensuremath{\\bigstar}', '☆':'\\ensuremath{\\star}', '❤':'\\ensuremath{\\heartsuit}', '♥':'\\ensuremath{\\heartsuit}',
  '♠':'\\ensuremath{\\spadesuit}', '♣':'\\ensuremath{\\clubsuit}', '♦':'\\ensuremath{\\diamondsuit}', '♪':'\\ensuremath{\\flat}',
  '■':'\\ensuremath{\\blacksquare}', '□':'\\ensuremath{\\square}', '▲':'\\ensuremath{\\blacktriangle}', '△':'\\ensuremath{\\triangle}',
  '▼':'\\ensuremath{\\blacktriangledown}', '▽':'\\ensuremath{\\triangledown}', '◆':'\\ensuremath{\\blacklozenge}',
  '◇':'\\ensuremath{\\diamond}', '○':'\\ensuremath{\\bigcirc}', '◯':'\\ensuremath{\\bigcirc}', '●':'\\ensuremath{\\bullet}',
  '◦':'\\ensuremath{\\circ}', '⟨':'\\ensuremath{\\langle}', '⟩':'\\ensuremath{\\rangle}'
};
/* 數學對照（文字模式自動包 \ensuremath；數學模式直接用）。 */
const MATH_SYMS = {
  'α':'\\alpha', 'β':'\\beta', 'γ':'\\gamma', 'δ':'\\delta', 'ε':'\\varepsilon', 'ϵ':'\\epsilon', 'ζ':'\\zeta',
  'η':'\\eta', 'θ':'\\theta', 'ϑ':'\\vartheta', 'ι':'\\iota', 'κ':'\\kappa', 'ϰ':'\\varkappa', 'λ':'\\lambda',
  'μ':'\\mu', 'ν':'\\nu', 'ξ':'\\xi', 'ο':'o', 'π':'\\pi', 'ϖ':'\\varpi', 'ρ':'\\rho', 'ϱ':'\\varrho',
  'σ':'\\sigma', 'ς':'\\varsigma', 'τ':'\\tau', 'υ':'\\upsilon', 'φ':'\\varphi', 'ϕ':'\\phi', 'χ':'\\chi',
  'ψ':'\\psi', 'ω':'\\omega',
  'Α':'A', 'Β':'B', 'Γ':'\\Gamma', 'Δ':'\\Delta', 'Ε':'E', 'Ζ':'Z', 'Η':'H', 'Θ':'\\Theta', 'Ι':'I', 'Κ':'K',
  'Λ':'\\Lambda', 'Μ':'M', 'Ν':'N', 'Ξ':'\\Xi', 'Ο':'O', 'Π':'\\Pi', 'Ρ':'P', 'Σ':'\\Sigma', 'Τ':'T',
  'Υ':'\\Upsilon', 'Φ':'\\Phi', 'Χ':'X', 'Ψ':'\\Psi', 'Ω':'\\Omega',
  '≤':'\\leq', '≥':'\\geq', '≠':'\\neq', '≈':'\\approx', '≡':'\\equiv', '∞':'\\infty', '∑':'\\sum', '∏':'\\prod',
  '∐':'\\coprod', '√':'\\surd', '∫':'\\int', '∬':'\\iint', '∭':'\\iiint', '∮':'\\oint', '∂':'\\partial', '∇':'\\nabla',
  '∈':'\\in', '∉':'\\notin', '∋':'\\ni', '⊂':'\\subset', '⊃':'\\supset', '⊆':'\\subseteq', '⊇':'\\supseteq',
  '⊊':'\\subsetneq', '⊋':'\\supsetneq', '∪':'\\cup', '∩':'\\cap', '∧':'\\wedge', '∨':'\\vee', '¬':'\\neg',
  '∀':'\\forall', '∃':'\\exists', '∄':'\\nexists', '∅':'\\emptyset', '≪':'\\ll', '≫':'\\gg', '∝':'\\propto',
  '∥':'\\parallel', '∦':'\\nparallel', '⊥':'\\perp', '∠':'\\angle', '∼':'\\sim', '≃':'\\simeq', '≅':'\\cong',
  '≲':'\\lesssim', '≳':'\\gtrsim', '≦':'\\leqq', '≧':'\\geqq', '≮':'\\nless', '≯':'\\ngtr', '≰':'\\nleq', '≱':'\\ngeq',
  '≺':'\\prec', '≻':'\\succ', '≼':'\\preceq', '≽':'\\succeq', '≐':'\\doteq', '≜':'\\triangleq', '≔':':=',
  '⊗':'\\otimes', '⊕':'\\oplus', '⊖':'\\ominus', '⊙':'\\odot', '⊘':'\\oslash', '⊠':'\\boxtimes', '⊞':'\\boxplus',
  '∓':'\\mp', '±':'\\pm', '×':'\\times', '÷':'\\div', '·':'\\cdot', '⋅':'\\cdot', '∙':'\\bullet', '∘':'\\circ',
  '∗':'\\ast', '⋆':'\\star', '†':'\\dagger', '‡':'\\ddagger', '⋯':'\\cdots', '⋮':'\\vdots', '⋱':'\\ddots',
  '−':'-', '∖':'\\setminus', '∣':'\\mid', '∤':'\\nmid', '⊢':'\\vdash', '⊣':'\\dashv', '⊨':'\\models', '⊤':'\\top',
  '⊓':'\\sqcap', '⊔':'\\sqcup', '⊑':'\\sqsubseteq', '⊒':'\\sqsupseteq', '∴':'\\therefore', '∵':'\\because',
  '∎':'\\blacksquare', '≀':'\\wr', '⋂':'\\bigcap', '⋃':'\\bigcup', '⋀':'\\bigwedge', '⋁':'\\bigvee',
  '⇒':'\\Rightarrow', '⇐':'\\Leftarrow', '⇔':'\\Leftrightarrow', '↔':'\\leftrightarrow', '↕':'\\updownarrow',
  '⇑':'\\Uparrow', '⇓':'\\Downarrow', '↦':'\\mapsto', '⟶':'\\longrightarrow', '⟵':'\\longleftarrow',
  '⟹':'\\Longrightarrow', '⟸':'\\Longleftarrow', '⟺':'\\Longleftrightarrow', '↗':'\\nearrow', '↘':'\\searrow',
  '↙':'\\swarrow', '↖':'\\nwarrow', '↩':'\\hookleftarrow', '↪':'\\hookrightarrow', '⇌':'\\rightleftharpoons',
  '↼':'\\leftharpoonup', '⇀':'\\rightharpoonup', '←':'\\leftarrow', '→':'\\rightarrow', '↑':'\\uparrow', '↓':'\\downarrow',
  'ℏ':'\\hbar', 'ℓ':'\\ell', 'ℜ':'\\Re', 'ℑ':'\\Im', 'ℵ':'\\aleph', '℘':'\\wp', 'ℕ':'\\mathbb{N}', 'ℤ':'\\mathbb{Z}',
  'ℚ':'\\mathbb{Q}', 'ℝ':'\\mathbb{R}', 'ℂ':'\\mathbb{C}', '∡':'\\measuredangle', '♭':'\\flat', '♮':'\\natural', '♯':'\\sharp'
};
/* 數學模式專用：TS1 文字符號在數學裡不能用，要換成數學寫法；上下標數字變成 ^{} _{}。 */
const MATH_ONLY = {
  '°':'^{\\circ}', '℃':'^{\\circ}\\mathrm{C}', 'µ':'\\mu', 'Å':'\\text{\\AA}', '′':"'", '″':"''", '‴':"'''",
  '⁰':'^{0}', '¹':'^{1}', '²':'^{2}', '³':'^{3}', '⁴':'^{4}', '⁵':'^{5}', '⁶':'^{6}', '⁷':'^{7}', '⁸':'^{8}', '⁹':'^{9}',
  '⁺':'^{+}', '⁻':'^{-}', 'ⁿ':'^{n}', '₀':'_{0}', '₁':'_{1}', '₂':'_{2}', '₃':'_{3}', '₄':'_{4}', '₅':'_{5}',
  '₆':'_{6}', '₇':'_{7}', '₈':'_{8}', '₉':'_{9}', '₊':'_{+}', '₋':'_{-}', '…':'\\ldots', '–':'-', '—':'-',
  '\u00a0':'~', '\u2009':'\\,', '\u202f':'\\,', '⟨':'\\langle', '⟩':'\\rangle', '‖':'\\|', '½':'\\frac{1}{2}',
  '¼':'\\frac{1}{4}', '¾':'\\frac{3}{4}', '⅓':'\\frac{1}{3}', '⅔':'\\frac{2}{3}', '✓':'\\checkmark', '★':'\\bigstar',
  '□':'\\square', '■':'\\blacksquare'
};
/* 需要 amssymb 的指令（文字或數學裡用到任一個，前言就載入 amssymb）。 */
const AMSSYMB_RE = /\\(?:mathbb|mathfrak|checkmark|bigstar|blacksquare|square|blacktriangle(?:down)?|triangledown|blacklozenge|lesssim|gtrsim|leqq|geqq|nless|ngtr|nleq|ngeq|nexists|nparallel|nmid|subsetneq|supsetneq|boxtimes|boxplus|therefore|because|varkappa|measuredangle|triangleq|lozenge|varnothing|leqslant|geqslant|lll|ggg|circledast|backslash\b)/;

/* NFD 拆解成「拉丁字母 + 組合重音」：越南文、羅馬尼亞文等 pdfLaTeX 沒內建的字母，
   用 OT1 的重音指令組合出來（ệ → \d{\^{e}}）。 */
const ACCENT_OF = { '\u0300':'`', '\u0301':"'", '\u0302':'^', '\u0303':'~', '\u0304':'=', '\u0306':'u', '\u0307':'.',
  '\u0308':'"', '\u030a':'r', '\u030b':'H', '\u030c':'v', '\u0327':'c', '\u0323':'d', '\u0331':'b', '\u0326':'c' };
function composeLatin(ch){
  const d = ch.normalize('NFD');
  if (d.length < 2 || !/[A-Za-z]/.test(d[0])) return null;
  let out = d[0];
  for (const mk of d.slice(1)) {
    const a = ACCENT_OF[mk];
    if (!a) return null;
    out = '\\' + a + '{' + out + '}';
  }
  return out;
}
const CJK_CHAR = /[ᄀ-ᇿ぀-ヿ㄰-㆏㐀-䶿一-鿿ꥠ-꥿가-힯ힰ-퟿豈-﫿]|[\u{20000}-\u{2FA1F}]/u;
const isEmoji = c => /\p{Extended_Pictographic}/u.test(c) || /[\u{1F000}-\u{1FAFF}\u{FE00}-\u{FE0F}\u{1F3FB}-\u{1F3FF}]/u.test(c);

/* 非 ASCII 字元在文字模式的寫法；回傳 null 代表「沒辦法」（呼叫端丟掉並警告）。 */
function uniText(ch, ctx){
  if (Object.prototype.hasOwnProperty.call(TEXT_MAP, ch)) return TEXT_MAP[ch];
  if (Object.prototype.hasOwnProperty.call(MATH_SYMS, ch)) {
    const m = MATH_SYMS[ch];
    return /^\\/.test(m) ? '\\ensuremath{' + m + '}' : m;
  }
  if (TEXT_PASS.has(ch)) return ch;
  if (ctx && ctx.engine === 'xelatex' && !isEmoji(ch)) return ch;   // xelatex：交給字型
  const cp = ch.codePointAt(0);
  if (cp >= 0xFF01 && cp <= 0xFF5E) return null;                     // 全形英數：呼叫端先轉半形
  const c = composeLatin(ch);
  if (c) return c;
  return null;
}
function uniMath(ch, ctx){
  if (Object.prototype.hasOwnProperty.call(MATH_ONLY, ch)) return MATH_ONLY[ch];
  if (Object.prototype.hasOwnProperty.call(MATH_SYMS, ch)) {
    const m = MATH_SYMS[ch];
    return /^\\[A-Za-z]+$/.test(m) ? m + ' ' : m;
  }
  if (ctx && ctx.engine === 'xelatex' && !isEmoji(ch)) return ch;
  const t = uniText(ch, ctx);
  if (t !== null) return /[^\x00-\x7F]/.test(t) || /^[A-Za-z]$/.test(t) ? '\\text{' + t + '}' : t;
  return null;
}
function dropChar(ch, ctx){
  if (!ctx) return '';
  const cp = ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
  ctx.dropped = ctx.dropped || new Map();
  if (!ctx.dropped.has(ch)) ctx.dropped.set(ch, 'U+' + cp);
  return '';
}

/* 一般文字。ASCII 特殊字元全部有對應；~ 在「縮寫句點後、緊接非空白」時是 TeX 的
   不換行空白（Fig.~1、Ref.~[@k]，A-09），其他地方的 ~ 是「約」的意思，印成 ∼。 */
function texPlain(s, ctx){
  s = String(s == null ? '' : s);
  let out = '', prevQuote = false;
  const chars = [...s];
  for (let k = 0; k < chars.length; k++) {
    let ch = chars[k];
    const cp = ch.codePointAt(0);
    if (cp >= 0xFF01 && cp <= 0xFF5E && !(ctx && ctx.engine === 'xelatex')) ch = String.fromCodePoint(cp - 0xFEE0);
    let rep;
    switch (ch) {
      case '\\': rep = '\\textbackslash{}'; break;
      case '{': rep = '\\{'; break;
      case '}': rep = '\\}'; break;
      case '$': rep = '\\$'; break;
      case '&': rep = '\\&'; break;
      case '#': rep = '\\#'; break;
      case '_': rep = '\\_'; break;
      case '%': rep = '\\%'; break;
      case '^': rep = '\\textasciicircum{}'; break;
      case '<': rep = '\\textless{}'; break;
      case '>': rep = '\\textgreater{}'; break;
      case '|': rep = '\\textbar{}'; break;
      case '"': rep = "''"; break;
      case '~': {
        const pv = chars[k - 1] || '', nx = chars[k + 1] || '';
        /* 文字片段的最後一個字元是 ~ 時，後面接的是引用、公式等節點（Ref.~[@k]），也算不換行空白。 */
        rep = (pv === '.' && !/\s/.test(nx || '')) ? '~' : '\\ensuremath{\\sim}';
        break;
      }
      default:
        if (cp < 0x80) rep = ch;
        else {
          rep = uniText(ch, ctx);
          if (rep === null) rep = isEmoji(ch) || !CJK_CHAR.test(ch) ? dropChar(ch, ctx) : ch;
        }
    }
    /* 相鄰的兩個引號（“‘x’”）中間插細空白，否則 TeX 會把 ``` 排成錯的順序（L10）。
       用的是「這個字元本身是不是引號」，所以 it’s 這類撇號不受影響。 */
    const isQ = ch === '“' || ch === '”' || ch === '‘' || ch === '’' || ch === '"';
    if (isQ && prevQuote) out += '\\,';
    prevQuote = isQ;
    out += rep;
  }
  return out;
}

/* \texttt{} 的內容：不用 \verb（\verb 放進 \textbf、\section、\caption、\footnote、
   表格量測盒都會編譯失敗，B-01／L01）。等寬字型直接有 < > | " ' ` 的字形；
   \ { } ~ ^ _ 用 {\char N} 印出等寬字形；連續空白逐一保留（L31）。 */
function texCode(s, ctx){
  s = String(s == null ? '' : s);
  let out = '';
  const chars = [...s];
  for (let k = 0; k < chars.length; k++) {
    const ch = chars[k];
    const cp = ch.codePointAt(0);
    switch (ch) {
      case '\\': out += '{\\char92}'; break;
      case '{': out += '{\\char123}'; break;
      case '}': out += '{\\char125}'; break;
      case '~': out += '{\\char126}'; break;
      case '^': out += '{\\char94}'; break;
      case '_': out += '{\\char95}'; break;
      case '$': out += '\\$'; break;
      case '&': out += '\\&'; break;
      case '#': out += '\\#'; break;
      case '%': out += '\\%'; break;
      case '\t': out += '\\ \\ \\ \\ '; break;
      case ' ': out += (k === 0 || chars[k - 1] === ' ' || chars[k - 1] === '\t') ? '\\ ' : ' '; break;
      case '-': out += (chars[k + 1] === '-') ? '-{}' : '-'; break;
      default:
        if (cp < 0x80) out += ch;
        else {
          const r = uniText(ch, ctx);
          out += r === null ? (CJK_CHAR.test(ch) && !isEmoji(ch) ? ch : dropChar(ch, ctx)) : r;
        }
    }
  }
  return out;
}

/* 網址：% # & 加反斜線；{ } \ ^ $ " < > | 與空白用百分比編碼；_ ~ 原樣（實測正確）。 */
function texUrl(u){
  return String(u == null ? '' : u).replace(/[%#&{}\\^$"<>| ]|[^\x00-\x7F]/gu, ch => {
    if (ch === '%') return '\\%';
    if (ch === '#') return '\\#';
    if (ch === '&') return '\\&';
    return [...new TextEncoder().encode(ch)].map(b => '\\%' + b.toString(16).toUpperCase().padStart(2, '0')).join('');
  });
}
/* \label／\ref／\cite／\bibitem 的鍵：只留安全字元。兩端都經過這裡，所以一定對得上。 */
function texKey(k){
  return String(k == null ? '' : k).trim().replace(/[^A-Za-z0-9_:.\-+\/@*]/g, '-');
}
/* 數學：原樣，只處理 pdfLaTeX 吃不下的部分（見檔頭鐵律一）。 */
function texMath(s, ctx){
  s = String(s == null ? '' : s);
  let out = '';
  const chars = [...s];
  for (let k = 0; k < chars.length; k++) {
    const ch = chars[k];
    if (ch === '\\') { out += ch + (chars[k + 1] || ''); k++; continue; }
    if (ch === '#') { out += '\\#'; continue; }
    if (ch === '%') { out += '\\%'; continue; }
    if (ch.codePointAt(0) < 0x80) { out += ch; continue; }
    const r = uniMath(ch, ctx);
    if (r === null) { out += CJK_CHAR.test(ch) && !isEmoji(ch) ? '\\text{' + ch + '}' : dropChar(ch, ctx); continue; }
    /* 指令名後面若緊接字母，補一個空白（\alpha x 而不是 \alphax）。 */
    out += r;
  }
  return out;
}
/* 對外的單一入口。 */
function texText(s, where, ctx){
  switch (where) {
    case 'code': return texCode(s, ctx);
    case 'url':  return texUrl(s);
    case 'key':  return texKey(s);
    case 'math': return texMath(s, ctx);
    default:     return texPlain(s, ctx);
  }
}
/* 舊 API 相容（C 報告的測試台與外部腳本會呼叫）。 */
function esc(s){ return texPlain(s, null); }
function textOut(s){ return texPlain(s, null); }

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

function classOptions(S, info){
  const g = (k, d) => (S && S[k] !== undefined && S[k] !== '' ? S[k] : d);
  const opts = [];
  // 學會與期刊都要明寫。省略學會時 REVTeX 會警告 "No Society specified"
  // 並套用預設 aps——對 APS 剛好沒事，換成 AIP 就會靜默地排錯樣式。
  const society = String(g('revtexSociety', 'aps'));
  const journal = String(g('revtexJournal', 'prl'));
  if (society) opts.push(society);
  if (journal) opts.push(journal);
  const mode = String(g('revtexMode', 'reprint'));
  opts.push(mode);                                               // preprint|reprint|twocolumn
  /* 官方建議只用 preprint／reprint 決定欄數，不要再疊 onecolumn／twocolumn（auguide
     733-737，A-18）。與模式本身相同的欄數是多餘的，不寫；明確不同的組合才寫出來。 */
  const cols = String(g('revtexColumns', 'auto'));
  const natural = mode === 'reprint' ? 'twocolumn' : (/^(preprint|manuscript|checkin)$/.test(mode) ? 'onecolumn' : '');
  if ((cols === 'onecolumn' || cols === 'twocolumn') && cols !== natural) opts.push(cols);
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
  /* footinbib 一定明寫。APS／AIP／SOR 的 .rtx 預設就是 footinbib（aps4-2.rtx 第 649 行），
     舊版設定「關」時什麼都不寫，結果反而是「開」（L19）。footinbib 要靠 BibTeX 才印得出
     腳註，手寫書目時發射器會強制改成 nofootinbib（info.forceNoFootInBib）並提醒。 */
  const footInBib = !!g('revtexFootInBib', false) && !(info && info.forceNoFootInBib);
  opts.push(footInBib ? 'footinbib' : 'nofootinbib');
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

/* =====================================================================
 * 第二部分：前言（在正文發射完之後才組，所以「用到什麼就載什麼」一定準）
 * ===================================================================== */
function preamblePackages(S, used, ctx){
  const g = (k, d) => (S && S[k] !== undefined ? S[k] : d);
  const preview = ctx.purpose !== 'submission';
  const lines = [];
  /* amsmath／amssymb：設定面板的開關只決定「沒用到時要不要也載入」。正文用到
     multline、\eqref、aligned、\text、\mathbb… 時一律載入，否則整份編譯失敗（A-02）。 */
  const wantAms = g('revtexAmsmath', true) !== false;
  if (wantAms || used.amsmath) lines.push('\\usepackage{amsmath}');
  if (!wantAms && used.amsmath) ctx.warn('設定裡關掉了 amsmath，但文件用到 amsmath 的公式環境或指令（例如 \\eqref、多行公式、\\text），已自動載入，否則無法編譯。', 'ams-forced');
  const wantSym = g('revtexAmssymb', true) !== false;
  if (wantSym || used.amssymb) lines.push('\\usepackage{amssymb}');
  if (!wantSym && used.amssymb) ctx.warn('設定裡關掉了 amssymb，但文件用到它的符號（例如 \\mathbb、\\checkmark），已自動載入。', 'amssymb-forced');
  if (used.bm) lines.push('\\usepackage{bm}');                       // A-15：\bm 沒有 bm 套件時粗體會默默消失
  lines.push('\\usepackage{graphicx}');
  if (preview && used.cptimg) {
    /* 只在預覽用：缺圖不能讓整份稿子出不了 PDF。路徑已含副檔名（不再猜副檔名，L16），
       找不到就畫標明檔名的佔位框。投稿用的 .tex 直接 \includegraphics。 */
    lines.push('\\providecommand{\\cptimg}[2]{\\IfFileExists{#2}{\\includegraphics[width=#1]{#2}}{\\cptmissing{#1}{#2}}}');
  }
  if (preview && (used.cptimg || used.cptmissing)) {
    lines.push('\\providecommand{\\cptmissing}[2]{\\fbox{\\parbox[c][0.28\\columnwidth][c]{#1}{\\centering\\footnotesize');
    lines.push('  [missing image file: \\texttt{\\detokenize{#2}}]}}}');
  }
  if (preview && (used.mathProbe || used.tableProbe)) {
    /* 編譯當下量寬度用的盒子與開關（只在預覽）。投稿版改寫成靜態決定，見 measureCache。 */
    lines.push('\\newsavebox{\\cptbbox}');
    lines.push('\\newlength{\\cptbnat}');
    lines.push('\\newlength{\\cptbraw}');
    lines.push('\\newif\\ifcptwide');
    lines.push('\\newif\\ifcptfold');
    lines.push('\\newif\\ifcpttblfit');
  }
  if (preview && used.tableCount) {
    /* 每個表格一組專屬的 savebox + length（共用會讓所有表格顯示成最後一個，見 1.1.4.x）。 */
    const boxSuffix = n => String(n).split('').map(d => 'abcdefghij'[Number(d)]).join('');
    for (let i = 1; i <= used.tableCount; i++) {
      lines.push('\\newsavebox{\\cptb' + boxSuffix(i) + '}');
      lines.push('\\newlength{\\cptn' + boxSuffix(i) + '}');
    }
  }
  /* longtable 是標準套件；REVTeX 會動態修補它以支援雙欄（auguide4-2 第 304-305 行）。 */
  if (used.longtable) lines.push('\\usepackage{longtable}');
  if (used.listings) lines.push(preview ? optionalPkg('listings') : '\\usepackage{listings}');
  /* BusyTeX 的 recommended 資料沒有 ulem／soul（實測清單），預覽要有退路；投稿版直接載入。 */
  if (used.strike || used.underline) lines.push(preview
    ? optionalPkg('ulem', 'normalem', '\\providecommand{\\sout}[1]{#1}\\providecommand{\\uline}[1]{\\underline{#1}}')
    : '\\usepackage[normalem]{ulem}');
  if (used.highlight) lines.push(preview
    ? '\\IfFileExists{soul.sty}{\\usepackage{soul}\\sethlcolor{yellow}}{\\providecommand{\\hl}[1]{#1}}'
    : '\\usepackage{soul}');
  /* hyperref：預設彩色文字連結、不畫框（期刊稿與 arXiv 慣例）；要黑白就把 revtexLinkColor 設 black。
     沒開 hyperref 時不使用 \href／\url（REVTeX 自己的版本在標題、圖說裡會出錯），連結改印文字。 */
  if (ctx.hyperref) {
    const lc = String(g('revtexLinkColor', 'blue') || 'blue').replace(/[^A-Za-z0-9!.]/g, '') || 'blue';
    const opt = 'colorlinks=true,linkcolor=' + lc + ',citecolor=' + lc + ',urlcolor=' + lc + ',filecolor=' + lc;
    lines.push(preview
      ? optionalPkg('hyperref', opt, '\\renewcommand{\\href}[2]{#2}\\renewcommand{\\url}[1]{\\texttt{#1}}\\providecommand{\\phantomsection}{}\\providecommand{\\hyperref}[2][]{#2}')
      : '\\usepackage[' + opt + ']{hyperref}');
  }
  if (used.cjk) {
    lines.push((cpEN() ? '% This document contains CJK text: compile with XeLaTeX or LuaLaTeX (pdfLaTeX cannot handle it).' : '% 文件含中日韓文字：必須用 XeLaTeX 或 LuaLaTeX 編譯（pdfLaTeX 無法處理）。'));
    /* ★ 字型偵測必須包在「xeCJK 真的成功載入」的分支內：\IfFontExistsTF 是 fontspec 的巨集，
       xeCJK 沒載入時呼叫它會 Undefined control sequence（矩陣重跑時炸過 87 組）。 */
    const cjkFontProbe =
      '\\IfFontExistsTF{Noto Serif CJK SC}{\\setCJKmainfont{Noto Serif CJK SC}}{%\n' +
      '\\IfFontExistsTF{Noto Sans CJK SC}{\\setCJKmainfont{Noto Sans CJK SC}}{%\n' +
      '\\IfFontExistsTF{Noto Serif CJK TC}{\\setCJKmainfont{Noto Serif CJK TC}}{%\n' +
      '\\IfFontExistsTF{PingFang SC}{\\setCJKmainfont{PingFang SC}}{%\n' +
      '\\IfFontExistsTF{Microsoft YaHei}{\\setCJKmainfont{Microsoft YaHei}}{%\n' +
      '\\IfFontExistsTF{SimSun}{\\setCJKmainfont{SimSun}}{%\n' +
      '\\PackageWarningNoLine{cp171}{No built-in CJK font found; set \\setCJKmainfont yourself}%\n' +
      '}}}}}}';
    lines.push('\\IfFileExists{xeCJK.sty}{\\usepackage{xeCJK}' + cjkFontProbe + '}'
      + '{\\PackageWarningNoLine{cp171}{xeCJK is not available; CJK text cannot be typeset}}');
  }
  return lines;
}

/* =====================================================================
 * 第三部分：量測結果快取（APS 投稿版的靜態決定）
 *
 * 預覽版在每個「要量寬度」的公式與表格後面寫一行 \typeout{CPTMEASURE:鍵:結果}；
 * 編譯完 19.js 把 log 交給 learn()，這裡記下「這段內容在這個版面下的決定」。
 * 投稿版用同一個鍵查表，直接寫出 equation／multline／widetext 或 \squeezetable，
 * 不用任何 APS 不允許的量測巨集。鍵是內容的雜湊，所以內容改了就重新量。
 * 還沒量過的（例如從沒在右邊編譯過），公式用一般 equation，並在警告裡講清楚。
 * ===================================================================== */
const MEASURE = new Map();
function hashKey(s){
  let h = 0x811c9dc5;
  const str = String(s);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
function layoutSig(S){
  const g = k => String((S && S[k]) || '');
  return [g('revtexSociety'), g('revtexJournal'), g('revtexMode'), g('revtexColumns'), g('revtexFontSize'), g('revtexPaper')].join('/');
}
function learn(log){
  let n = 0;
  for (const m of String(log || '').matchAll(/CPTMEASURE:([A-Za-z0-9_-]+):([A-Z])/g)) { MEASURE.set(m[1], m[2]); n++; }
  if (MEASURE.size > 4000) { const keys = [...MEASURE.keys()].slice(0, MEASURE.size - 3000); for (const k of keys) MEASURE.delete(k); }
  return n;
}

/* =====================================================================
 * 第四部分：發射
 * ===================================================================== */
/* 官方 .rtx 在 class 層級無條件強制 author-year 的期刊代碼。 */
const FORCED_AUTHORYEAR_JOURNALS = new Set(['rmp']);
/* 章節不編號的期刊：aps4-2.rtx 的 PRL（第 587 行 \c@secnumdepth=-\maxdimen）與
   aip4-2.rtx 的 CP（第 1181 行 secnumdepth 0）。這些期刊裡 \ref{sec:x} 會印成空白，
   所以章節引用改印章節標題（並連到該章節），附錄也不會有 A、B 字母。 */
const UNNUMBERED_SECTION_JOURNALS = new Set(['aps/prl', 'aip/cp']);

function emit(ast, opts){
  opts = opts || {};
  ast = ast || { meta: {}, blocks: [] };
  const S0 = opts.settings || (typeof settings !== 'undefined' ? settings : {});
  const S = Object.create(S0 || {});
  const P = K.need('parser');
  const warnings = [];
  const onceKeys = new Set();
  const warn = (msg, key) => {
    if (key) { if (onceKeys.has(key)) return; onceKeys.add(key); }
    if (warnings.includes(msg)) return;            // 同一句不重複（表格內容會轉兩次：估寬與輸出）
    warnings.push(msg);
  };
  const meta = ast.meta || {};
  const purpose = opts.purpose === 'submission' ? 'submission' : 'preview';
  const society = String(S.revtexSociety || 'aps').toLowerCase();
  const journal = String(S.revtexJournal || 'prl').toLowerCase();

  /* CJK：掃整份 AST（含 frontmatter、致謝、書目、數學、程式碼、網址），韓文也算（B-04、L05）。
     只有全形標點或全形空白不算——那些會轉成半形（B-47）。 */
  let cjk = false;
  try { cjk = CJK_CHAR.test(JSON.stringify(ast)); } catch (_) {}
  const engine = cjk ? 'xelatex' : 'pdflatex';

  const used = { cjk, tableCount: 0 };
  const ctx = {
    S, P, purpose, engine, warn, used, meta, society, journal,
    hyperref: S.revtexHyperref !== false,
    unnumberedSections: UNNUMBERED_SECTION_JOURNALS.has(society + '/' + journal),
    assets: [], assetIndex: new Map(), assetMap: opts.assetMap || null,
    measure: opts.measurements || MEASURE, layout: layoutSig(S), unmeasured: 0,
    citeOrder: [], citeSeen: new Set(), labelsDefined: new Set(), refsUsed: [],
    footnoteDefs: Object.create(null), footnoteUsed: Object.create(null), footnoteNo: Object.create(null),
    footnoteCount: 0, headings: Object.create(null), tableSeq: 0, listDepth: 0,
    pendingBib: null, hasInlineBib: false, inWideBlock: false, inAppendix: false,
    appendixSections: 0, dropped: null, mdLine: 0,
    forceAuthorYearBib: FORCED_AUTHORYEAR_JOURNALS.has(journal) || String(S.revtexCitation || '') === 'author-year',
    /* 腳註真的會進書目（footinbib + BibTeX）時，同一則腳註重複引用不能用 \footnotemark[n]。 */
    footInBibActive: !!S.revtexFootInBib && !!meta.bibliography
  };

  /* 預掃描：腳註定義（存 AST，在使用處依該處的情境轉換）、章節標籤（給章節引用印標題）、
     會顯示作者名的引用巨集（\textcite／\citet 需要 [Author(Year)]）。 */
  if (P) P.walk(ast.blocks, n => {
    if (n.type === 'footnote_def' && !(n.fid in ctx.footnoteDefs)) ctx.footnoteDefs[n.fid] = n.children || [];
    if (n.type === 'heading' && n.label) ctx.headings[texKey(n.label)] = { node: n, numbered: !n.unnumbered };
    if (n.type === 'cite' && /^(textcite|citet)$/.test(String(n.macro || ''))) ctx.forceAuthorYearBib = true;
  });

  /* 依文件順序發射：前置區 → 正文 → 書目。前言最後才組。 */
  const body = [];                                   // {t: tex 行, md: Markdown 行號}
  const push = (line, md) => body.push({ t: line, md: md === undefined ? ctx.mdLine : md });
  ctx.push = push;
  emitFrontmatter(meta, ctx);
  emitBlocks(ast.blocks, push, ctx);
  push('');
  emitBibliography(meta, ctx);
  push('');
  push('\\end{document}');

  /* 文字掃描：哪些套件真的用到（以實際輸出的 TeX 為準，不再靠預掃描猜）。 */
  const bodyTex = body.map(x => x.t).join('\n');
  if (/\\(?:eqref|text\{|tag\{|tag\*|operatorname|dfrac|tfrac|binom|boldsymbol|intertext|substack|xrightarrow|xleftarrow|overset|underset|iint|iiint|DeclareMathOperator|cfrac|smash|genfrac|notag|nonumber)\b|\\begin\{(?:multline|align|alignat|gather|flalign|split|aligned|gathered|alignedat|cases|subequations|equation\*|pmatrix|bmatrix|vmatrix|Vmatrix|Bmatrix|matrix|smallmatrix)\*?\}/.test(bodyTex)) used.amsmath = true;
  if (AMSSYMB_RE.test(bodyTex)) used.amssymb = true;
  if (/\\bm\b/.test(bodyTex)) used.bm = true;
  if (/\\sout\{/.test(bodyTex)) used.strike = true;
  if (/\\uline\{/.test(bodyTex)) used.underline = true;
  if (/\\hl\{/.test(bodyTex)) used.highlight = true;
  if (/\\cptimg\{/.test(bodyTex)) used.cptimg = true;
  if (/\\cptmissing\{/.test(bodyTex)) used.cptmissing = true;
  if (/\\begin\{longtable\}/.test(bodyTex)) used.longtable = true;
  if (/\\begin\{lstlisting\}/.test(bodyTex)) used.listings = true;

  /* footinbib 只有在 BibTeX 會跑的時候才印得出腳註；手寫書目或沒有書目時一律頁底腳註。 */
  const bibtexRoute = !!meta.bibliography || !!ctx.bibtexFallback;
  const wantFootInBib = !!S.revtexFootInBib;
  const forceNoFootInBib = wantFootInBib && !bibtexRoute;
  if (forceNoFootInBib && ctx.footnoteCount) {
    warn('設定要求「腳註併入書目（footinbib）」，但這份文件的書目是手寫的（revtex-bibliography），'
      + 'REVTeX 只有在跑 BibTeX 時才能把腳註放進書目，否則腳註會印成 [?]。已改為頁底腳註；'
      + '要併入書目請改用 .bib 檔（frontmatter 寫 bibliography: refs）。', 'footinbib-forced');
  }
  const co = classOptions(S, { forceNoFootInBib });
  const fontProfile = revtexFontProfile(S);
  if (fontProfile.guarded) {
    warn('AIP reprint + Letter + 雙欄若明確指定 11pt/12pt，會載入不相容的大字級 grid，使第一頁正文逼近紙張下緣；已改由 REVTeX 模式自動選用 10pt。');
  }

  const out = [];                                   // 最終行（與 map 同步）
  const map = [];
  const emitLine = (t, md) => { out.push(t); map.push({ tex: out.length, md: md || 0 }); };
  emitLine('% !TEX program = ' + engine);
  emitLine(cpEN() ? '% Produced by the EKdelta international-paper pipeline (' + purpose + ' version); a human-readable, journal-editable REVTeX 4.2 source.'
                  : '% 由 EKdelta 國際論文管線產生（' + (purpose === 'submission' ? '投稿版' : '預覽版') + '）；此檔為人可讀、期刊可再編輯的 REVTeX 4.2 原始檔。');
  emitLine('\\documentclass[' + co.join(',') + ']{revtex4-2}');
  for (const l of preamblePackages(S, used, ctx)) emitLine(l);
  if (meta.preamble) for (const l of String(meta.preamble).split('\n')) emitLine(l);
  /* 文件級 off 必須在使用者 preamble 之後成為最終權威；auto/on 完全不注入此區塊。 */
  for (const l of continuousFrontmatterPreamble(S)) emitLine(l);
  if (purpose === 'submission' && continuousFrontmatterPreamble(S).length) {
    warn('「強制連續首頁」用 \\def 改寫了 REVTeX 的摘要巨集；APS 作者指南不允許自訂 \\def，投稿 APS 前請把首頁設定改回「依官方行為」。', 'contfront-aps');
  }
  emitLine('');
  emitLine('\\begin{document}');
  emitLine('');
  for (const x of body) emitLine(x.t, x.md);
  const tex = out.join('\n') + '\n';

  /* 收尾提醒 */
  if (cjk) warn('文件含中日韓文字，引擎已切換為 xelatex（pdflatex 無法處理）。', 'cjk');
  if (ctx.dropped && ctx.dropped.size) {
    const list = [...ctx.dropped.entries()].slice(0, 12).map(([c, u]) => c + '（' + u + '）').join('、');
    warn('這些字元 pdfLaTeX 無法排版（例如 emoji 或少見符號），已從 PDF 拿掉：' + list
      + (ctx.dropped.size > 12 ? ' 等 ' + ctx.dropped.size + ' 個' : '') + '。數學符號請改寫成 LaTeX 指令（例如 $\\alpha$）。', 'dropped');
  }
  for (const fid of Object.keys(ctx.footnoteDefs)) {
    if (!ctx.footnoteUsed[fid]) warn('腳註定義 [^' + fid + '] 沒有被任何地方引用，內容不會出現在 PDF 上。');
  }
  const missingRefs = [...new Set(ctx.refsUsed.filter(k => !ctx.labelsDefined.has(k)))];
  if (missingRefs.length) {
    warn('這些交叉引用找不到對應的標籤（PDF 上會印成 ??）：' + missingRefs.slice(0, 8).join('、')
      + '。標籤寫在標題、公式、圖、表後面的 {#…} 裡。');
  }
  if (purpose === 'submission' && ctx.unmeasured) {
    warn('有 ' + ctx.unmeasured + ' 個公式或表格還沒在右側編譯過，投稿版無法得知它們是否超出欄寬，'
      + '先用一般寫法輸出。請先在右側編譯一次再匯出，就會照實際量到的結果寫出跨欄或折行。', 'unmeasured');
  }
  const check = selfcheck(tex, ast);
  if (!check.ok) for (const p of check.problems) warn(p);

  /* imageSources：所有本機圖檔（含 pdfLaTeX 不支援、需要轉檔的 .svg 等），給 .zip 打包用。 */
  const imageSources = [...ctx.assetIndex.entries()].filter(([, v]) => v.kind === 'file' || v.kind === 'unsupported').map(([k]) => k);
  return { tex, map, assets: ctx.assets, imageSources, bibFiles: ctx.bibFiles || [], bib: '', warnings,
           classOptions: co, fontProfile, engine, purpose, selfcheck: check,
           citeOrder: ctx.citeOrder.slice() };
}

/* --- frontmatter：title / authors / affiliations / abstract / pacs / keywords --- */
const MOVING = { moving: true };
function proseInline(str, ctx, flags){
  const nodes = ctx.P ? ctx.P.parseInline(String(str == null ? '' : str)) : [{ type: 'text', value: String(str || '') }];
  return inline(nodes, ctx, Object.assign({ moving: true, frontmatter: true }, flags || {}));
}
function emitFrontmatter(meta, ctx){
  const push = ctx.push;
  /* \preprint 必須在 \title 之前（官方 apssamp.tex 第 60 行的順序）。 */
  for (const p of normList(meta.preprint)) if (String(p).trim()) push('\\preprint{' + proseInline(p, ctx) + '}');
  /* 標題、作者、單位、摘要、關鍵字都走同一套行內解析：數學、粗斜體、引用都會生效（A-04、B-19、L12）。 */
  if (meta.title) {
    const short = meta.shortTitle || meta['short-title'];
    /* \title[短標題]{完整標題}：官方 summary4-2 第 36 行的寫法（A-11）。 */
    push('\\title' + (short ? '[' + proseInline(short, ctx, { title: true }) + ']' : '')
         + '{' + proseInline(meta.title, ctx, { title: true }) + '}');
  } else { push('\\title{Untitled}'); ctx.warn('frontmatter 缺 title，已填 Untitled'); }

  const affs = normList(meta.affiliations || meta.affiliation);
  if (meta.affiliationsExplicit) {
    const seen = [];
    for (const a of normList(meta.authors || meta.author)) {
      const idx = (a && Array.isArray(a.affil)) ? a.affil : [];
      for (const i of idx) if (seen.indexOf(i) < 0) seen.push(i);
    }
    if (seen.some((v, k) => v !== k) && String(ctx.S.revtexAddress || '') === 'superscriptaddress') {
      ctx.warn('單位編號會依「第一次出現的作者順序」排，與 affiliations: 宣告的順序不同'
        + '（REVTeX 沒有指定固定編號的語法）。想讓某個單位排在後面，就讓第一個屬於它的作者排在後面。');
    }
  }
  const authors = normList(meta.authors || meta.author);
  if (!authors.length) {
    push('\\author{Anonymous}');
    ctx.warn('frontmatter 缺 authors');
  } else {
    /* 依 affil 分組：同一組 affiliation 的作者連續列出，之後接 \affiliation。
       沒有單位的作者後面要接 \noaffiliation，否則 REVTeX 會把下一位作者的單位
       也套到他身上（auguide 487-488，A-10）。 */
    const keyOf = a => ((typeof a === 'object' && a && a.affil !== undefined) ? [].concat(a.affil) : []).join(',');
    authors.forEach((a, idx) => {
      const name = typeof a === 'string' ? a : (a.name || a.Name || '');
      push('\\author{' + proseInline(name, ctx) + '}');
      if (typeof a === 'object' && a) {
        if (a.email) push('\\email{' + String(a.email).replace(/[{}\\]/g, '') + '}');
        if (a.homepage) push('\\homepage{' + String(a.homepage).replace(/[{}\\]/g, '') + '}');
        if (a.altaffiliation) push('\\altaffiliation{' + proseInline(a.altaffiliation, ctx) + '}');
        if (a.thanks) push('\\thanks{' + proseInline(a.thanks, ctx) + '}');
        /* REVTeX 4.2 沒有 ORCID 指令（auguide、apsguide 都沒有）；APS 在投稿系統收 ORCID。
           保留在 main.tex 的註解裡，並提醒，不再默默丟掉（A-25）。 */
        if (a.orcid) {
          push('% ORCID: ' + String(a.orcid).replace(/[\r\n]/g, ' '));
          ctx.warn('REVTeX 4.2 沒有 ORCID 指令，ORCID 已寫在 main.tex 的註解裡；投稿時請在期刊系統的作者資料欄填寫。', 'orcid');
        }
      }
      const key = keyOf(a);
      const next = authors[idx + 1];
      if (next === undefined || keyOf(next) !== key) {
        if (key === '') push('\\noaffiliation');
        else for (const k of key.split(',')) {
          const aff = affs[parseInt(k, 10)];
          if (aff !== undefined) push('\\affiliation{' + proseInline(typeof aff === 'string' ? aff : (aff.name || ''), ctx) + '}');
          else ctx.warn('作者引用了不存在的 affiliation 索引 ' + k);
        }
      }
    });
  }
  if (meta.collaboration) {
    push('\\collaboration{' + proseInline(meta.collaboration, ctx) + '}');
    /* 官方 auguide4-2 第 501 行：collaboration 之後要接 \noaffiliation。 */
    push('\\noaffiliation');
  }
  if (meta.date) {
    const d = String(meta.date).trim();
    push('\\date{' + (/^\\?today$/i.test(d) ? '\\today' : proseInline(d, ctx)) + '}');
  }

  push('');
  /* 摘要：revtex-abstract 圍欄、YAML abstract:、或文件開頭的「# Abstract」標題（17.js）。
     內容是一般 Markdown，可以多段、有數學與引用。 */
  const absBlocks = meta.abstractBlocks || (meta.abstract ? (ctx.P ? ctx.P.parseFragment(String(meta.abstract)) : []) : null);
  if (absBlocks && absBlocks.length) {
    push('\\begin{abstract}');
    const prev = ctx.frontmatter; ctx.frontmatter = true;
    emitBlocks(absBlocks, push, ctx);
    ctx.frontmatter = prev;
    push('\\end{abstract}');
  }
  const pacs = normList(meta.pacs);
  if (pacs.length) push('\\pacs{' + pacs.map(x => texPlain(String(x), ctx)).join(', ') + '}');
  const kwRaw = normList(meta.keywords);
  const kw = kwRaw.length === 1 && typeof kwRaw[0] === 'string' ? kwRaw[0].split(/\s*[,;]\s*/).filter(Boolean) : kwRaw;
  if (kw.length) push('\\keywords{' + kw.map(x => proseInline(String(x), ctx)).join(', ') + '}');
  push('');
  push('\\maketitle');
  push('');
}

function normList(v){
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'object') {
    const vals = Object.values(v);
    if (vals.length === 1 && Array.isArray(vals[0])) return vals[0];
    return [v];
  }
  return [v];
}

/* --- 書目 --- */
function emitBibliography(meta, ctx){
  const push = ctx.push, S = ctx.S;
  const soc = ctx.society, jr = ctx.journal;
  const ay = (jr === 'rmp') || String(S.revtexCitation || '') === 'author-year';
  let bibStyle = jr === 'rmp' ? 'apsrmp4-2'
               : soc === 'aip' ? (ay ? 'aipauth4-2' : 'aipnum4-2')
               : soc === 'aapm' ? 'aapmrev4-2'
               : 'apsrev4-2';
  if (meta.bibliographyStyle) bibStyle = String(meta.bibliographyStyle).replace(/[^A-Za-z0-9_.-]/g, '') || bibStyle;
  if (ctx.pendingBib) {
    emitInlineBibliography(ctx.pendingBib, ctx);
    return;
  }
  const names = String(meta.bibliography || '').split(',').map(x => x.trim().replace(/\.bib$/i, '').replace(/[^A-Za-z0-9_.\/-]/g, '')).filter(Boolean);
  if (names.length) {
    ctx.bibFiles = names;
    push('\\bibliographystyle{' + bibStyle + '}');
    push('\\bibliography{' + names.join(',') + '}');
    return;
  }
  if (ctx.citeOrder.length) {
    /* 文中有引用、卻沒有書目來源：沿用舊行為指向 refs.bib（使用者資料夾裡若有就會被打包）。 */
    ctx.bibFiles = ['refs'];
    ctx.bibtexFallback = true;
    push('\\bibliographystyle{' + bibStyle + '}');
    push('\\bibliography{refs}');
    ctx.warn('文中有引用但沒有書目（revtex-bibliography 區塊或 frontmatter 的 bibliography:），已預設為 refs.bib——請確認該檔存在。');
    return;
  }
  push(cpEN() ? '% No citations. To add references, use a revtex-bibliography block or write bibliography: refs in the frontmatter.'
              : '% 本文沒有引用文獻。要加文獻，用 revtex-bibliography 區塊，或在 frontmatter 寫 bibliography: refs');
}

/* 手寫書目 → thebibliography。官方說明：手寫書目的編號就是 \bibitem 的排列順序
   （auguide 1146-1165），而 APS 的慣例是依「第一次被引用」編號（A-03）。所以：
     · 具名鍵的書目（key: 文字）依正文第一次引用的順序重排，沒被引用的放最後；
     · 使用者自己編號的書目（[1] …）號碼就是他要的標籤，順序不動；若引用順序跟號碼
       不一致，提醒一句。 */
function emitInlineBibliography(b, ctx){
  const push = ctx.push;
  const raw = (b.items || []).map(it => Object.assign({}, it, { tkey: texKey(it.key) }));
  const numeric = raw.length && raw.every(it => it.numeric);
  let items = raw;
  if (!numeric) {
    const pos = new Map(ctx.citeOrder.map((k, i) => [k, i]));
    items = raw.map((it, i) => ({ it, i })).sort((a, c) => {
      const pa = pos.has(a.it.tkey) ? pos.get(a.it.tkey) : 1e9 + a.i;
      const pc = pos.has(c.it.tkey) ? pos.get(c.it.tkey) : 1e9 + c.i;
      return pa - pc;
    }).map(x => x.it);
  } else {
    const cited = ctx.citeOrder.filter(k => raw.some(it => it.tkey === k));
    const sorted = cited.slice().sort((x, y) => (parseInt(x, 10) || 0) - (parseInt(y, 10) || 0));
    if (cited.join(',') !== sorted.join(',')) {
      ctx.warn('APS 期刊習慣依「第一次被引用」的順序編號；這份書目是自己編號的（[1]、[2]…），正文的引用順序跟號碼不一致。'
        + '若要照引用順序，請調整書目編號；或改用不編號的寫法（key: 書目文字），程式會自動依引用順序排列。', 'bib-order');
    }
  }
  /* 正文引用到、但書目裡沒有的鍵。 */
  const have = new Set(raw.map(it => it.tkey));
  const missing = ctx.citeOrder.filter(k => !have.has(k));
  if (missing.length) {
    const shown = missing.slice(0, 8);
    ctx.warn(cpEN()
      ? ('These citations have no matching bibliography entry: ' + shown.join(', ') + (missing.length > 8 ? ' (and ' + (missing.length - 8) + ' more)' : '') + '. They will print as [?] in the PDF.')
      : ('這些引用在書目裡找不到對應條目：' + shown.join('、') + (missing.length > 8 ? '（另有 ' + (missing.length - 8) + ' 筆）' : '') + '，PDF 上會印成 [?]。'));
  }
  /* author-year 期刊（RMP）或選了 author-year：\bibitem 要帶 [Author(Year)]。 */
  const needAY = !!ctx.forceAuthorYearBib;
  let useAY = false, withAY = items;
  if (needAY) {
    withAY = items.map(it => Object.assign({}, it, { ay: extractAuthorYear(it.text) }));
    const ok = withAY.filter(x => x.ay).length;
    useAY = ok >= items.length * 0.75;
    if (!useAY) ctx.warn('本刊物在 class 層級強制 author-year 引用，但行內書目有 ' + (items.length - ok) + '/' + items.length
      + ' 筆抓不出作者與年份，已略過自動標註——這些引用在 PDF 上可能顯示為 "(???)"。建議改用 .bib 檔（frontmatter 寫 bibliography: refs）。');
  }
  push('\\begin{thebibliography}{' + '9'.repeat(Math.max(1, String(items.length).length)) + '}');
  for (const it of withAY) {
    push('\\bibitem' + (useAY && it.ay ? '[' + texPlain(it.ay, ctx) + ']' : '') + '{' + it.tkey + '}');
    /* 書目內容走行內解析：期刊名斜體、卷號粗體、化學式的數學、DOI 網址都會生效（L12）。 */
    const nodes = ctx.P ? ctx.P.parseInline(String(it.text || '')) : [{ type: 'text', value: String(it.text || '') }];
    push(inline(nodes, ctx, { bib: true }));
  }
  push('\\end{thebibliography}');
}

/* --- 區塊 --- */
const SECT = ['\\section', '\\subsection', '\\subsubsection', '\\paragraph'];
const SELF_MATH_ENV = new Set(['equation', 'align', 'alignat', 'gather', 'multline', 'flalign', 'eqnarray', 'displaymath']);

function emitBlocks(blocks, push, ctx){
  for (const b of blocks || []) {
    if (b.line) ctx.mdLine = b.line;
    switch (b.type) {

      case 'heading': {
        /* 第 5、6 層標題用 \paragraph：官方不允許 \subparagraph（apsguide 172-174，A-17）。 */
        const cmd = SECT[Math.min(Math.max(b.depth, 1), SECT.length) - 1];
        const star = b.unnumbered ? '*' : '';
        /* 標題是移動參數：REVTeX 在這裡停用 \footnote（會編譯失敗），所以腳註在發射時就
           不輸出（inline 的 heading 旗標），並如實提醒（L06：舊版用正則事後刪，刪不乾淨）。 */
        const title = inline(b.children, ctx, { moving: true, heading: true });
        push(cmd + star + '{' + title + '}');
        if (b.label) {
          const k = texKey(b.label);
          ctx.labelsDefined.add(k);
          const numbered = !b.unnumbered && !ctx.unnumberedSections;
          /* 不編號的章節（{-}，或 PRL 這類整本不編章節號的期刊）沒有 hyperref 錨點，
             先放 \phantomsection 讓連結跳得到；章節引用會改印標題文字。 */
          if (!numbered && ctx.hyperref) push('\\phantomsection');
          push('\\label{' + k + '}');
          const h = ctx.headings[k]; if (h) h.title = title;
        }
        if (ctx.inAppendix && b.depth === 1) ctx.appendixSections++;
        push('');
        break;
      }

      case 'paragraph': {
        const t = inline(b.children, ctx, { para: true });
        if (t.trim()) { push((b.noindent ? '\\noindent ' : '') + t); push(''); }
        break;
      }

      case 'math_block':
        emitMathBlock(b, push, ctx);
        break;

      /* ```revtex-wide → \begin{widetext}。內容已由解析器遞迴解析成一般語意節點。
         官方說「寬的圖表要用 figure*／table*，不是 widetext」（auguide 765-768，A-12）：
         所以區塊裡的表格與圖改成 table*／figure* 浮動體（有編號、有標籤），在 widetext
         之外輸出；其餘內容（公式、段落）留在 widetext 裡。 */
      case 'wide_block': {
        let open = false;
        const openW = () => { if (!open) { push('\\begin{widetext}'); open = true; } };
        const closeW = () => { if (open) { push('\\end{widetext}'); push(''); open = false; } };
        for (const c of b.children || []) {
          if (c.type === 'table' || c.type === 'figure') {
            closeW();
            emitBlocks([Object.assign({}, c, { wide: true, forceWide: true })], push, ctx);
          } else {
            openW();
            const prevWide = ctx.inWideBlock; ctx.inWideBlock = true;
            emitBlocks([c], push, ctx);
            ctx.inWideBlock = prevWide;
          }
        }
        closeW();
        break;
      }

      /* ```revtex-turnpage → \begin{turnpage}...\end{turnpage} 包住單一 table 或 figure。 */
      case 'turnpage_block': {
        const children = b.children || [];
        const floatIdx = children.findIndex(c => c.type === 'table' || c.type === 'figure');
        if (floatIdx < 0) {
          ctx.warn('revtex-turnpage 區塊內沒有找到表格或圖片，官方 turnpage 環境只用來包住單一 table 或 figure，已略過旋轉、內容改用一般排版輸出。');
          emitBlocks(children, push, ctx);
          break;
        }
        const before = children.slice(0, floatIdx);
        const after = children.slice(floatIdx + 1);
        if (after.some(c => c.type === 'table' || c.type === 'figure')) {
          ctx.warn('revtex-turnpage 區塊內有多個表格/圖片，但官方 turnpage 一次只能放一個（無跨頁機制），只取第一個旋轉，其餘照一般排版輸出。');
        }
        emitBlocks(before, push, ctx);
        /* turnpage 前必須 \clearpage（否則佇列裡的浮動體卡住 → Output loop 失敗，實測踩過）。 */
        push('\\clearpage');
        push('\\begin{turnpage}');
        const prevTurn = ctx.inTurnpage; ctx.inTurnpage = true;
        emitBlocks([children[floatIdx]], push, ctx);
        ctx.inTurnpage = prevTurn;
        push('\\end{turnpage}');
        emitBlocks(after, push, ctx);
        break;
      }

      case 'longtable_wrap':
        emitBlocks(b.children || [], push, ctx);
        break;

      case 'long_table':
        emitLongTable(b, push, ctx);
        break;

      /* ```revtex-subequations → subequations 包 eqnarray（官方 auguide4-2 第 1000 行範例），
         每條子式可帶 {#eq:x}，整組的標籤寫在 fence 第一行 {#eq:group}。 */
      case 'subequations': {
        const parts = b.parts || [];
        if (!parts.length) break;
        const labels = parts.labels || [];
        push('\\begin{subequations}');
        if (parts.group) { const k = texKey(parts.group); ctx.labelsDefined.add(k); push('\\label{' + k + '}'); }
        push('\\begin{eqnarray}');
        parts.forEach((p, i) => {
          let row = texMath(p, ctx);
          if (labels[i]) { const k = texKey(labels[i]); ctx.labelsDefined.add(k); row += ' \\label{' + k + '}'; }
          push('  ' + row + (i < parts.length - 1 ? ' \\\\' : ''));
        });
        push('\\end{eqnarray}');
        push('\\end{subequations}');
        push('');
        break;
      }

      /* ```revtex-appendix → \appendix。PRL 這類不編章節號的期刊，附錄不會有 A、B 字母。 */
      case 'appendix_marker':
        push('\\appendix');
        push('');
        ctx.inAppendix = true;
        if (ctx.unnumberedSections) {
          ctx.warn('目前的期刊（' + ctx.journal.toUpperCase() + '）章節與附錄都不編號：附錄標題不會有 A、B 字母，附錄公式也不會編成 (A1)。'
            + '需要附錄字母時請改選 PRB／PRA 等會編章節號的期刊。', 'appendix-unnumbered');
        }
        break;

      /* 行內書目延後到文件最末輸出（官方順序：致謝 → \appendix + 附錄 → 書目）。 */
      case 'bibliography': {
        if (!(b.items || []).length) break;
        ctx.pendingBib = b;
        ctx.hasInlineBib = true;
        break;
      }

      case 'acknowledgments': {
        /* 官方 acknowledgments 環境；REVTeX 依期刊樣式自己決定標題（PRL 不印標題）。
           內容是一般 Markdown（L12：舊版逐行當純文字）。 */
        const kids = b.blocks || (ctx.P ? ctx.P.parseFragment(String(b.text || '')) : []);
        push('\\begin{acknowledgments}');
        emitBlocks(kids, push, ctx);
        push('\\end{acknowledgments}');
        push('');
        break;
      }

      case 'raw_tex':
        for (const l of String(b.value || '').split('\n')) push(l);
        push('');
        break;

      case 'code_block':
        emitCodeBlock(b, push, ctx);
        break;

      case 'blockquote':
        push('\\begin{quotation}');
        emitBlocks(b.children, push, ctx);
        push('\\end{quotation}');
        push('');
        break;

      case 'list':
        emitList(b, push, ctx);
        break;

      case 'figure':
        emitFigure(b, push, ctx);
        break;

      case 'table':
        emitTable(b, push, ctx);
        break;

      /* 分隔線：APS 不允許 \rule／\hrule（apsguide 270-276），改用置中的三個星號。 */
      case 'thematic_break':
        push('\\begin{center}*\\quad*\\quad*\\end{center}');
        push('');
        break;

      /* 內容在對應的 footnote_ref 處展開，這裡不輸出。 */
      case 'footnote_def':
        break;

      default:
        ctx.warn('未處理的區塊型別：' + b.type);
    }
  }
}

/* --- 展示公式 --- */
function emitMathBlock(b, push, ctx){
  let tex = String(b.tex || '');
  const unnumbered = !!b.unnumbered;
  const label = b.label ? texKey(b.label) : '';
  if (label) ctx.labelsDefined.add(label);
  if (label && unnumbered) ctx.warn('公式 {#' + b.label + '} 同時標了不編號 {-}，不編號的公式無法被引用。');
  const envM = tex.match(/^\s*\\begin\{([A-Za-z]+)(\*?)\}/);
  const envName = envM ? envM[1] : '';
  const isSelf = !!envName && SELF_MATH_ENV.has(envName) && new RegExp('\\\\end\\{' + envName + '\\*?\\}\\s*$').test(tex);
  /* 標籤一律輸出（L13：舊版自帶環境的分支完全不看 {#eq:x}）。 */
  const stripLabel = s => s.replace(/\\label\{[^}]*\}/g, '');
  const labelLine = label ? '\\label{' + label + '}' : '';
  if (isSelf) {
    /* 自帶數學模式的環境（equation／align／gather…）：原樣輸出，標籤插在 \begin 之後。
       {-} 會把它換成星號版本。 */
    let t = texMath(tex, ctx);
    if (label) t = t.replace(/\\label\{[^}]*\}/g, '').replace(/^(\s*\\begin\{[A-Za-z]+\*?\})/, '$1' + labelLine);
    if (unnumbered && !envM[2] && envName !== 'displaymath') t = t.replace(new RegExp('\\\\(begin|end)\\{' + envName + '\\}', 'g'), '\\$1{' + envName + '*}');
    for (const l of t.split('\n')) push(l);
    push('');
    return;
  }
  /* 其他一律補外層 equation：split／aligned／cases／matrix 只能寄生在數學環境內
     （A-01、L03：舊版把 split 當成自帶數學模式，編譯失敗）。
     沒有任何環境卻有 \\ 或 & 時，補 gathered／aligned，否則換行消失或編譯失敗（B-22、N17）。 */
  let core = stripLabel(tex).trim();
  const hasEnv = /\\begin\{/.test(core);
  const topBreak = !hasEnv && /\\\\/.test(core);
  const topAmp = !hasEnv && /(^|[^\\])&/.test(core);
  if (topAmp) core = '\\begin{aligned}\n' + core + '\n\\end{aligned}';
  else if (topBreak) core = '\\begin{gathered}\n' + core + '\n\\end{gathered}';
  core = texMath(core, ctx);
  const eqEnv = unnumbered ? 'equation*' : 'equation';
  const mlEnv = unnumbered ? 'multline*' : 'multline';
  const probeable = !ctx.inWideBlock && !ctx.inTurnpage && !hasEnv && !topBreak && !topAmp && !ctx.frontmatter;
  if (!probeable) {
    push('\\begin{' + eqEnv + '}' + labelLine);
    for (const l of core.split('\n')) push(l);
    push('\\end{' + eqEnv + '}');
    push('');
    return;
  }
  /* 寬公式三段式（全部依實際排版寬度決定）：塞得進單欄 → equation；稍寬且有頂層折點
     → multline 欄內折兩行（官方標準做法）；真的很寬 → widetext 跨欄。 */
  const probeSrc = core.replace(/\\tag\*?\{[^}]*\}/g, '').replace(/\n/g, ' ').trim();
  const ml = splitForMultline(probeSrc);
  const key = 'eq' + hashKey(ctx.layout + '|' + probeSrc);
  const writeEq = () => {
    push('\\begin{' + eqEnv + '}' + labelLine);
    for (const l of core.split('\n')) push(l);
    push('\\end{' + eqEnv + '}');
  };
  const writeMl = () => {
    push('\\begin{' + mlEnv + '}' + labelLine);
    push(ml.head + ' \\\\');
    push(ml.tail);
    push('\\end{' + mlEnv + '}');
  };
  if (ctx.purpose === 'submission') {
    const d = ctx.measure.get(key);
    if (!d) ctx.unmeasured++;
    if (d === 'W') { ctx.used.widetext = true; push('\\begin{widetext}'); writeEq(); push('\\end{widetext}'); }
    else if (d === 'F' && ml) writeMl();
    else writeEq();
    push('');
    return;
  }
  ctx.used.mathProbe = true;
  push('\\sbox{\\cptbbox}{$\\displaystyle ' + probeSrc + '$}%');
  push('\\setlength{\\cptbraw}{\\wd\\cptbbox}%');
  push('\\setlength{\\cptbnat}{\\wd\\cptbbox}%');
  if (ml) {
    push('\\sbox{\\cptbbox}{$\\displaystyle ' + ml.head + '$}%');
    push('\\ifdim\\wd\\cptbbox>\\cptbnat\\else\\setlength{\\cptbnat}{\\wd\\cptbbox}\\fi%');
    push('\\sbox{\\cptbbox}{$\\displaystyle ' + ml.tail + '$}%');
    push('\\ifdim\\wd\\cptbbox>\\cptbnat\\setlength{\\cptbnat}{\\wd\\cptbbox}\\fi%');
  }
  /* 三個開關必須先存進 \newif 再用：\begin{widetext} 一開，\linewidth 就變全頁寬。 */
  push('\\cptwidefalse\\cptfoldfalse');
  push('\\ifdim\\cptbraw>\\linewidth');
  push('  \\ifdim\\cptbnat>\\linewidth\\cptwidetrue\\else' + (ml ? '\\cptfoldtrue' : '\\cptwidetrue') + '\\fi');
  push('\\fi');
  push('\\typeout{CPTMEASURE:' + key + ':\\ifcptwide W\\else\\ifcptfold F\\else N\\fi\\fi}%');
  push('\\ifcptwide\\begin{widetext}\\fi');
  if (ml) {
    push('\\ifcptfold'); writeMl(); push('\\else'); writeEq(); push('\\fi');
  } else writeEq();
  push('\\ifcptwide\\end{widetext}\\fi');
  push('');
}

/* --- 程式碼區塊 ---
   純 ASCII、且內容沒有 \end{verbatim} 時用 verbatim（逐字保留）；含希臘字母等非 ASCII
   （verbatim 會讓 pdfLaTeX 失敗，B-03）或含 \end{verbatim}（會提早結束，B-08）時，
   改用逐行跳脫的等寬區塊。listings 只在使用者開啟時用，語言名對應到 listings 認得的名稱
   （L33：listings 不認得 js、yaml 等名稱會編譯失敗）。 */
const LST_LANG = { python:'Python', py:'Python', c:'C', h:'C', cpp:'C++', 'c++':'C++', cc:'C++', java:'Java',
  tex:'[LaTeX]TeX', latex:'[LaTeX]TeX', html:'HTML', xml:'XML', sh:'bash', bash:'bash', shell:'bash', zsh:'bash',
  matlab:'Matlab', r:'R', ruby:'Ruby', perl:'Perl', sql:'SQL', fortran:'Fortran', haskell:'Haskell', lisp:'Lisp',
  pascal:'Pascal', php:'PHP', csh:'csh' };
function emitCodeBlock(b, push, ctx){
  const value = String(b.value || '');
  const ascii = /^[\x00-\x7F]*$/.test(value);
  const safeVerb = ascii && !/\\end\s*\{(verbatim|lstlisting)\}/.test(value);
  if (safeVerb && ctx.S && ctx.S.texListings) {
    const lang = LST_LANG[String(b.lang || '').toLowerCase()];
    push('\\begin{lstlisting}' + (lang ? '[language=' + lang + ']' : ''));
    for (const l of value.split('\n')) push(l);
    push('\\end{lstlisting}');
  } else if (safeVerb) {
    push('\\begin{verbatim}');
    for (const l of value.split('\n')) push(l);
    push('\\end{verbatim}');
  } else {
    push('\\begin{flushleft}\\ttfamily');
    const ls = value.split('\n');
    ls.forEach((l, i) => push((l ? guardBracket(texCode(l, ctx)) : '~') + (i < ls.length - 1 ? '\\\\' : '')));
    push('\\end{flushleft}');
  }
  push('');
}

/* --- 清單 ---
   LaTeX 只允許四層（B-07）：第五層以後改成縮排段落，並提醒。 */
function emitList(b, push, ctx){
  const depth = (ctx.listDepth || 0) + 1;
  if (depth > 4) {
    ctx.warn('清單巢狀超過四層，LaTeX 只允許四層；第五層以後改成縮排段落。', 'list-depth');
    for (const it of b.items) {
      const sub = [];
      emitBlocks(it.children, l => sub.push(l), ctx);
      const text = sub.filter(l => l.trim()).join(' ');
      push('\\par\\hspace*{' + (depth - 3) + 'em}' + (b.ordered ? '' : '\\ensuremath{\\circ}~') + text);
    }
    push('');
    return;
  }
  const env = b.ordered ? 'enumerate' : 'itemize';
  ctx.listDepth = depth;
  push('\\begin{' + env + '}');
  if (b.ordered && Number(b.start) !== 1 && Number.isFinite(Number(b.start))) {
    const cn = ['enumi', 'enumii', 'enumiii', 'enumiv'][depth - 1];
    push('\\setcounter{' + cn + '}{' + (Math.floor(Number(b.start)) - 1) + '}');
  }
  for (const it of b.items) {
    const sub = [];
    emitBlocks(it.children, l => sub.push(l), ctx);
    while (sub.length && !sub[sub.length - 1].trim()) sub.pop();
    /* 任務清單的方框需要 amssymb（L28），偵測 \square／\boxtimes 時會自動載入。 */
    const marker = (it.task === null || it.task === undefined) ? '\\item'
                 : '\\item[' + (it.task ? '$\\boxtimes$' : '$\\square$') + ']';
    if (!sub.length) { push(marker); continue; }
    /* 項目文字以 [ 開頭時，\item 會把 [1] 當成自訂標籤、項目符號消失（B-20）。 */
    push(marker + ' ' + guardBracket(sub[0]));
    for (let i = 1; i < sub.length; i++) push('  ' + sub[i]);
  }
  push('\\end{' + env + '}');
  ctx.listDepth = depth - 1;
  push('');
}

/* 行首的 [ 前面墊一個空群組：\item、\\、表格列首後面的 [ 才不會被當成可選參數（L02）。 */
function guardBracket(t){ return /^\s*\[/.test(t) ? '{}' + t.replace(/^\s+/, '') : t; }

/* --- 圖 --- */
const GFX_EXT = /\.(pdf|png|jpe?g|eps)$/i;
/* 圖檔路徑：main.tex 裡一律用「安全的名稱」。有 assetMap（.zip 專案或 TeX 校樣面板）
   就用它；否則路徑只含安全字元且副檔名小寫就原樣，其他（空白、%、#、大寫副檔名…）
   給一個別名，呼叫端把原檔放到別名位置（B-06、L16）。 */
/* 1.2.7：內嵌圖片（data: 網址，例如直接貼上的截圖）。PNG、JPG、PDF 給固定的安全名稱
   ekd-assets/inline-<雜湊>.<副檔名>，預覽編譯時 19.js 解碼送進引擎；GIF、WebP、SVG 等
   pdfLaTeX 不收的格式名稱用 .png，並標 convert，由呼叫端先畫成 PNG。
   .zip 專案匯出（04.js cp166PackageAssets）本來就會解 data: 網址，這裡只要把它列進圖檔清單。 */
function inlineAsset(raw){
  const m = /^data:([a-z0-9.+\/-]*)/i.exec(raw);
  const mime = m ? m[1].toLowerCase() : '';
  const ext = mime === 'image/png' ? 'png' : (mime === 'image/jpeg' || mime === 'image/jpg') ? 'jpg' : mime === 'application/pdf' ? 'pdf' : '';
  const stem = 'ekd-assets/inline-' + hashKey(raw) + raw.length.toString(36);
  if (ext) return { kind: 'file', path: stem + '.' + ext, inline: true };
  if (/^image\//.test(mime)) return { kind: 'file', path: stem + '.png', inline: true, convert: mime };
  return { kind: 'data' };
}
function assetFor(src, ctx){
  const raw = String(src || '').trim();
  if (ctx.assetIndex.has(raw)) return ctx.assetIndex.get(raw);
  let info;
  if (/^data:/i.test(raw)) {
    const mapped = ctx.assetMap && Object.prototype.hasOwnProperty.call(ctx.assetMap, raw) ? ctx.assetMap[raw] : null;
    info = mapped ? { kind: 'file', path: mapped, mapped: true } : inlineAsset(raw);
    if (info.kind === 'file') ctx.assets.push({ src: raw, path: info.path, convert: info.convert || null });
  }
  else if (/^https?:\/\//i.test(raw)) info = { kind: 'remote' };
  else if (!raw) info = { kind: 'empty' };
  else {
    const mapped = ctx.assetMap && Object.prototype.hasOwnProperty.call(ctx.assetMap, raw) ? ctx.assetMap[raw] : null;
    const rel = raw.replace(/^\.\//, '');
    if (mapped) info = { kind: 'file', path: mapped, mapped: true };
    else if (!GFX_EXT.test(rel)) info = { kind: 'unsupported', path: rel };
    else {
      const ext = rel.match(GFX_EXT)[1].toLowerCase().replace('jpeg', 'jpg');
      const safe = /^[A-Za-z0-9_.\/-]+$/.test(rel) && !/(^|\/)\.\.(\/|$)/.test(rel) && /\.(pdf|png|jpg|jpeg|eps)$/.test(rel);
      const path = safe ? rel : ('ekd-assets/' + (rel.split('/').pop().replace(GFX_EXT, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'image')
                                + '-' + hashKey(rel).slice(0, 6) + '.' + ext);
      info = { kind: 'file', path };
    }
    if (info.kind === 'file') ctx.assets.push({ src: raw, path: info.path });
  }
  ctx.assetIndex.set(raw, info);
  return info;
}
function graphicTex(src, width, ctx){
  const a = assetFor(src, ctx);
  const preview = ctx.purpose !== 'submission';
  if (a.kind === 'file') {
    if (a.inline && !preview && !a.mapped)
      ctx.warn('內嵌圖片在 .tex 裡寫成 ' + a.path + '；圖檔請從「檔案 → 匯出 REVTeX 專案 (.zip)」取得。', 'inline-' + a.path);
    if (a.mapped || !preview) return '\\includegraphics[width=' + width + ']{' + a.path + '}';
    return '\\cptimg{' + width + '}{' + a.path + '}';
  }
  if (a.kind === 'unsupported') {
    const stem = a.path.replace(/\.[A-Za-z0-9]+$/, '');
    ctx.warn('圖檔 ' + a.path + ' 的格式 pdfLaTeX 不支援（只能用 PDF、PNG、JPG、EPS）。'
      + (preview ? '預覽先畫佔位框；' : '投稿版寫成不帶副檔名的 ' + stem + '，') + '請把它轉成 PDF 或 PNG（同一個檔名）。', 'unsup-' + a.path);
    if (preview) { ctx.used.cptmissing = true; return '\\cptmissing{' + width + '}{' + a.path.split('/').pop().replace(/[^A-Za-z0-9._-]/g, '-') + '}'; }
    return '\\includegraphics[width=' + width + ']{' + stem.replace(/[^A-Za-z0-9_.\/-]/g, '-') + '}';
  }
  /* 不是圖片的 data: 網址與遠端圖片：pdfLaTeX 無法取用。 */
  ctx.warn(a.kind === 'data'
    ? '有一張內嵌圖片不是圖檔格式，pdfLaTeX 無法使用。請改用 PNG、JPG 或 PDF。'
    : '有遠端圖片 ' + String(src).slice(0, 60) + '，pdfLaTeX 不會下載網路圖片。請先下載到本機再引用。', 'img-' + a.kind);
  if (preview) { ctx.used.cptmissing = true; return '\\cptmissing{' + width + '}{' + (a.kind === 'data' ? 'inline data URI' : 'remote image') + '}'; }
  return '% ' + (a.kind === 'data' ? 'inline data: image omitted' : 'remote image omitted: ' + String(src).replace(/[\r\n]/g, ' '));
}
function emitFigure(b, push, ctx){
  const wide = !!(b.wide || b.forceWide);
  const star = wide && !ctx.inTurnpage ? '*' : '';
  const baseWidth = wide ? '\\textwidth' : '\\columnwidth';
  const figWidth = imageWidthExpr(b.scale, baseWidth, !!b.scaleExplicit);
  push('\\begin{figure' + star + '}');
  push('\\centering');
  push(graphicTex(b.src, figWidth, ctx));
  const label = b.label ? texKey(b.label) : '';
  if (label) ctx.labelsDefined.add(label);
  /* 標籤放進 caption 括號裡（官方 best practice，apsguide 311-313）。沒有說明文字卻有
     標籤時放空的 caption，圖才會編號、[@fig:x] 才引用得到（L30）。 */
  if (b.caption || label) {
    const cap = b.caption ? inline(b.caption, ctx, { moving: true, caption: true }) : '';
    push('\\caption{' + (label ? '\\label{' + label + '}' : '') + cap + '}');
  }
  push('\\end{figure' + star + '}');
  push('');
}

/* --- 表格 --- */
function cellTex(cell, align, ctx, measure){
  let t = inline(cell, ctx, { cell: true, measure: !!measure });
  /* 儲存格內的 <br>：l／c／r 欄的 \newline 沒有作用（實測），改成小表格（L02、T13）。 */
  if (t.includes('\\cptcellbreak')) {
    t = '\\begin{tabular}[t]{@{}' + (align || 'l') + '@{}}' + t.split('\\cptcellbreak').map(x => guardBracket(x.trim())).join(' \\\\ ') + '\\end{tabular}';
  }
  return guardBracket(t);
}
function tableRows(b, ctx, measure){
  const colCount = b.header.length;
  const renderRow = (cells, colspans) => cells.map((c, k) => {
    const span = colspans ? colspans[k] : 1;
    const txt = cellTex(c, b.aligns[k], ctx, measure);
    return span > 1 ? '\\multicolumn{' + span + '}{c}{' + txt + '}' : txt;
  }).join(' & ') + ' \\\\';
  const head = renderRow(b.header, b.headerColspans);
  const rows = b.rows.map((r, ri) => {
    const rowSpans = b.rowsColspans ? b.rowsColspans[ri] : null;
    const cells = rowSpans ? r : (() => { const c2 = r.slice(0, colCount); while (c2.length < colCount) c2.push([]); return c2; })();
    return renderRow(cells, rowSpans);
  });
  return { head, rows };
}
function emitTable(b, push, ctx){
  if (!b.header || !b.header.length) return;
  /* 很長的表格（超過 40 列）單一浮動體放不下、也不能分頁（L21）：自動改用 longtable。 */
  if (b.rows.length > 40 && !ctx.inTurnpage && !b.forceWide) {
    ctx.warn('表格有 ' + b.rows.length + ' 列，單一浮動表格放不下一頁，已自動改用可跨頁的 longtable。', 'auto-longtable');
    emitLongTable(b, push, ctx);
    return;
  }
  const colCount = b.header.length;
  const plain = c => inline(c, ctx, { cell: true, measure: true }).replace(/\\[A-Za-z]+\s*/g, '').replace(/[{}$\\]/g, '');
  const colW = [];
  for (let k = 0; k < colCount; k++) {
    let w = plain(b.header[k] || []).length;
    for (const r of b.rows) w = Math.max(w, plain(r[k] || []).length);
    colW.push(w);
  }
  const est = colW.reduce((a, x) => a + x, 0) + colCount * 3;
  /* table 或 table*（環境名稱只能在 JS 端決定）：以內容字元數估算，寧可偏向跨欄
     （跨欄表格在單欄版面等同一般表格）。revtex-wide 區塊內的表格一律 table*。 */
  const inTurn = !!ctx.inTurnpage;
  const star = !inTurn && (b.forceWide || est > 46) ? '*' : '';
  const shrink = est > 100 ? (est > 145 ? '\\scriptsize' : '\\footnotesize') : '';
  const alignSpec = b.aligns.join('');
  const label = b.label ? texKey(b.label) : '';
  if (label) ctx.labelsDefined.add(label);
  const capLine = (b.caption || label)
    ? '\\caption{' + (label ? '\\label{' + label + '}' : '') + (b.caption ? inline(b.caption, ctx, { moving: true, caption: true }) : '') + '}'
    : '';
  const { head, rows } = tableRows(b, ctx, false);
  const key = 'tb' + hashKey(ctx.layout + '|' + star + '|' + alignSpec + '|' + head + '|' + rows.join('\n'));

  /* turnpage 內、或投稿版：直接輸出官方結構，不量測。 */
  if (inTurn || ctx.purpose === 'submission') {
    const overflow = !inTurn && ctx.measure.get(key) === 'O';
    if (!inTurn && !ctx.measure.has(key)) ctx.unmeasured++;
    /* 投稿版遇到「預覽時量到比版面寬」的表格：APS 不允許 \resizebox，改用官方的
       \squeezetable（auguide 1567-1580），並提醒。 */
    if (overflow) {
      push('\\begingroup\\squeezetable');
      ctx.warn('有表格比版面寬，預覽版是縮放顯示；投稿版改用 REVTeX 官方的 \\squeezetable 縮小字級。'
        + '若仍放不下，請考慮刪減欄位，或改用 revtex-turnpage 整頁橫放。', 'squeeze');
    }
    push('\\begin{table' + star + '}');
    if (capLine) push(capLine);
    if (shrink && !overflow) push(shrink);
    push('\\begin{ruledtabular}');
    push('\\begin{tabular}{' + alignSpec + '}');
    push(head);
    push('\\hline');
    for (const r of rows) push(r);
    push('\\end{tabular}');
    push('\\end{ruledtabular}');
    push('\\end{table' + star + '}');
    if (overflow) push('\\endgroup');
    push('');
    return;
  }

  /* 預覽版：兩階段量測（量自然寬度 → 塞得下就撐滿 \linewidth（官方外觀），塞不下才
     \resizebox 縮回去）。量測放在 table 環境內、環境開好之後（\linewidth 才是可用寬度）。
     第一階段的量測盒不輸出腳註（腳註有副作用，展開兩次會變兩筆）——改由發射旗標
     measure 處理，不再用正則事後刪（L06 同類問題）。 */
  ctx.used.tableProbe = true;
  ctx.used.tableCount = (ctx.used.tableCount || 0) + 1;
  ctx.tableSeq++;
  const sfx = String(ctx.tableSeq).split('').map(d => 'abcdefghij'[Number(d)]).join('');
  const boxName = '\\cptb' + sfx, natName = '\\cptn' + sfx;
  const m = tableRows(b, ctx, true);
  push('\\begin{table' + star + '}');
  if (capLine) push(capLine);
  if (shrink) push(shrink);
  push('\\sbox{' + boxName + '}{\\begin{tabular}{' + alignSpec + '}');
  push(m.head);
  for (const r of m.rows) push(r);
  push('\\end{tabular}}%');
  push('\\setlength{' + natName + '}{\\wd' + boxName + '}%');
  push('\\ifdim' + natName + '>\\linewidth\\cpttblfittrue\\else\\cpttblfitfalse\\setlength{' + natName + '}{\\linewidth}\\fi%');
  push('\\typeout{CPTMEASURE:' + key + ':\\ifcpttblfit O\\else F\\fi}%');
  push('\\sbox{' + boxName + '}{\\begin{minipage}{' + natName + '}\\begin{ruledtabular}\\begin{tabular}{' + alignSpec + '}');
  push(head);
  push('\\hline');
  for (const r of rows) push(r);
  push('\\end{tabular}\\end{ruledtabular}\\end{minipage}}%');
  push('\\ifcpttblfit');
  push('  \\resizebox{\\linewidth}{!}{\\usebox{' + boxName + '}}%');
  push('\\else');
  push('  \\usebox{' + boxName + '}%');
  push('\\fi');
  push('\\end{table' + star + '}');
  push('');
}
/* long_table → 官方 longtable 環境（跨頁/跨欄由 longtable.sty + REVTeX 的動態修補處理）。 */
function emitLongTable(b, push, ctx){
  const colCount = b.header.length;
  const alignSpec = b.aligns.join('');
  const label = b.label ? texKey(b.label) : '';
  if (label) ctx.labelsDefined.add(label);
  const { head, rows } = tableRows(b, ctx, false);
  push('\\begin{longtable}{' + alignSpec + '}');
  if (b.caption || label) push('\\caption{' + (label ? '\\label{' + label + '}' : '') + (b.caption ? inline(b.caption, ctx, { moving: true, caption: true }) : '') + '}\\\\');
  push('\\hline');
  push(head);
  push('\\hline');
  push('\\endhead');
  push('\\hline');
  push('\\endfoot');
  for (const r of rows) push(r);
  push('\\end{longtable}');
  /* longtable 不論有沒有標題都會把表格計數器加一；沒有標題時扣回來，後面的表格編號才不會跳號。 */
  if (!b.caption && !label) push('\\addtocounter{table}{-1}');
  push('');
  void colCount;
}

/* =====================================================================
 * 第五部分：行內
 * flags：moving（命令參數：標題、圖說）、heading、caption、title、frontmatter、
 *        cell（表格儲存格）、measure（量測盒，不輸出腳註）、bib（書目條目）、para
 * ===================================================================== */
const TIE_BEFORE_REF = /\b(?:Fig|Figs|Eq|Eqs|Ref|Refs|Sec|Secs|Table|Tables|Tab|Tabs|Appendix|App|Chap|Chapter|Section|Figure|Equation)\.?$/;
function inline(children, ctx, flags){
  flags = flags || {};
  let s = '';
  const list = children || [];
  /* 段落頭尾的硬換行沒有意義，而且段落開頭的 \\ 會讓 LaTeX 報「There's no line here to end」（B-05）。 */
  let first = 0, last = list.length - 1;
  while (first <= last && list[first].type === 'hard_break') first++;
  while (last >= first && list[last].type === 'hard_break') last--;
  for (let i = first; i <= last; i++) {
    const c = list[i];
    switch (c.type) {
      case 'text':        s += texPlain(c.value, ctx); break;
      case 'strong':      s += '\\textbf{' + inline(c.children, ctx, flags) + '}'; break;
      /* \textit 而不是 \emph：\emph 巢狀時內層會變正體（B-45），左邊畫面內層仍是斜體。 */
      case 'emph':        s += '\\textit{' + inline(c.children, ctx, flags) + '}'; break;
      /* 刪除線、底線、螢光（ulem／soul）在標題、圖說這類移動參數裡是脆弱指令，會編譯失敗；
         在那些位置只留文字。 */
      case 'strike':      s += flags.moving ? inline(c.children, ctx, flags) : '\\sout{' + inline(c.children, ctx, flags) + '}'; break;
      case 'underline':   s += flags.moving ? inline(c.children, ctx, flags) : '\\uline{' + inline(c.children, ctx, flags) + '}'; break;
      case 'highlight':   s += flags.moving ? inline(c.children, ctx, flags) : '\\hl{' + inline(c.children, ctx, flags) + '}'; break;
      case 'subscript':   s += '\\textsubscript{' + inline(c.children, ctx, flags) + '}'; break;
      case 'superscript': s += '\\textsuperscript{' + inline(c.children, ctx, flags) + '}'; break;
      case 'small':       s += '{\\small ' + inline(c.children, ctx, flags) + '}'; break;
      case 'big':         s += '{\\large ' + inline(c.children, ctx, flags) + '}'; break;
      case 'span':        s += inline(c.children, ctx, flags); break;
      case 'html_color':
        /* 期刊多為黑白：色彩不輸出，只留文字，並提醒（B-43）。 */
        ctx.warn('文字顏色（色彩工具列）不會進入期刊 PDF，只保留文字。', 'color');
        s += inline(c.children, ctx, flags); break;
      case 'dropped':
        ctx.warn('<' + c.what + '> 影音標籤沒有 PDF 對應，已從輸出拿掉。', 'media');
        break;
      case 'hard_break':
        if (flags.cell) s += '\\cptcellbreak ';
        else if (flags.title) s += '\\\\ ';
        else if (flags.moving || flags.bib) s += ' ';
        else s += '\\newline ';
        break;
      case 'code_inline': s += '\\texttt{' + texCode(c.value, ctx) + '}'; break;
      case 'math_inline': s += '$' + texMath(c.tex, ctx) + '$'; break;
      /* 句中的 $$…$$：左邊畫面當獨立置中公式，這裡是不編號的展示公式；放在標題、儲存格
         這類不能換段的位置時改用 \displaystyle（B-16）。 */
      case 'math_display':
        if (flags.moving || flags.cell || flags.bib) s += '$\\displaystyle ' + texMath(c.tex, ctx) + '$';
        else s += '\\[' + texMath(c.tex, ctx) + '\\]';
        break;
      case 'raw_inline':  s += c.tex; break;
      case 'link':        s += linkTex(c, ctx, flags); break;
      case 'image': {
        const iw = c.scaleExplicit ? imageWidthExpr(c.scale, '\\columnwidth', true) : '0.4\\columnwidth';
        s += graphicTex(c.src, iw, ctx);
        break;
      }
      case 'cite':        s = tieBefore(s); s += citeTex(c, ctx); break;
      case 'ref':         s = tieBefore(s); s += refTex(c, ctx); break;
      case 'label': {
        const k = texKey(c.id); ctx.labelsDefined.add(k); s += '\\label{' + k + '}'; break;
      }
      case 'footnote_inline':
        s += footnoteTex(c.children, ctx, flags, null);
        break;
      case 'footnote_ref': {
        const def = ctx.footnoteDefs[c.id];
        ctx.footnoteUsed[c.id] = true;
        if (def === undefined) {
          ctx.warn('腳註 [^' + c.id + '] 找不到對應定義，已只留標記位置，PDF 上不會有腳註文字。');
          break;
        }
        s += footnoteTex(def, ctx, flags, c.id);
        break;
      }
      default:
        if (c.children) s += inline(c.children, ctx, flags);
        else if (c.value !== undefined) s += texPlain(c.value, ctx);
    }
  }
  return s;
}
/* 「Fig. [@fig:a]」這類縮寫後面接引用時，中間改成不換行空白（官方範例的 Fig.~\ref）。 */
function tieBefore(s){
  return /\s$/.test(s) && TIE_BEFORE_REF.test(s.replace(/\s+$/, '')) ? s.replace(/\s+$/, '~') : s;
}
/* 腳註：標題、圖說、作者欄位、量測盒裡不能放（REVTeX 停用或會重複）。同一個 [^id]
   第二次引用時印同一個號碼（\footnotemark[n]），不再展開成第二則內容相同的腳註（L19）。 */
function footnoteTex(content, ctx, flags, fid){
  if (flags.measure) return '';
  const front = flags.frontmatter || ctx.frontmatter;
  if (flags.moving || front || flags.bib || flags.inFootnote) {
    ctx.warn((flags.heading ? '章節標題' : flags.caption ? '圖表說明' : front ? '標題、作者或摘要' : flags.bib ? '書目' : '腳註')
      + '裡不能放腳註（REVTeX 在這些位置停用 \\footnote，會編譯失敗），已拿掉該腳註；'
      + '標題或作者的附註請改用 frontmatter 的 thanks: 欄位。', 'fn-moving-' + (flags.heading ? 'h' : flags.caption ? 'c' : front ? 'f' : 'o'));
    return '';
  }
  if (fid && ctx.footnoteNo[fid] && !flags.cell && !ctx.footInBibActive) return '\\footnotemark[' + ctx.footnoteNo[fid] + ']';
  let text;
  if (Array.isArray(content) && content.length && content[0] && content[0].type && /^(paragraph|list|blockquote|math_block|code_block|table|figure)$/.test(content[0].type)) {
    /* [^id]: 定義（區塊）：段落用 \par 串起來。 */
    const parts = [];
    for (const blk of content) {
      if (blk.type === 'paragraph') parts.push(inline(blk.children, ctx, Object.assign({}, flags, { inFootnote: true })));
      else if (blk.type === 'math_block') parts.push('$\\displaystyle ' + texMath(blk.tex, ctx) + '$');
      else if (blk.type === 'code_block') parts.push('\\texttt{' + texCode(blk.value, ctx) + '}');
    }
    text = parts.filter(Boolean).join(' \\par ');
  } else text = inline(content, ctx, Object.assign({}, flags, { inFootnote: true }));
  if (!flags.cell) {
    ctx.footnoteCount++;
    if (fid) ctx.footnoteNo[fid] = ctx.footnoteCount;
  }
  return '\\footnote{' + text + '}';
}
/* 連結：有 hyperref 用 \href／\url（網址經 texUrl 跳脫）；[文字](#標籤) 是文件內的
   交叉連結，改成 \hyperref（B-26）。沒有 hyperref 時印「文字（網址）」，網址不會消失（L26）。 */
function linkTex(c, ctx, flags){
  const dest = String(c.dest || '');
  const label = inline(c.children, ctx, flags);
  if (/^#/.test(dest)) {
    const k = texKey(dest.slice(1));
    ctx.refsUsed.push(k);
    return ctx.hyperref ? '\\hyperref[' + k + ']{' + label + '}' : label;
  }
  const plainDest = dest.replace(/^mailto:/i, '');
  const isUrlText = !label || c.autolink || label === texPlain(dest, ctx) || label === texPlain(plainDest, ctx);
  if (!ctx.hyperref) {
    const shown = '\\texttt{' + texCode(plainDest, ctx) + '}';
    return isUrlText ? shown : label + ' (' + shown + ')';
  }
  if (isUrlText && !/^mailto:/i.test(dest)) return '\\url{' + texUrl(dest) + '}';
  return '\\href{' + texUrl(dest) + '}{' + (label || texPlain(plainDest, ctx)) + '}';
}
/* 引用：記錄第一次出現的順序（書目依此排序）；[@key, p. 3] 的頁碼放進 \cite 的可選參數（B-28、L18）。 */
function citeTex(c, ctx){
  const macro = c.macro && c.macro !== 'cite' ? c.macro : 'cite';
  const items = (c.items || (c.keys || []).map(key => ({ key, pre: '', post: '' }))).map(x => Object.assign({}, x, { k: texKey(x.key) })).filter(x => x.k);
  for (const x of items) if (!ctx.citeSeen.has(x.k)) { ctx.citeSeen.add(x.k); ctx.citeOrder.push(x.k); }
  if (!items.length) return '';
  const note = t => texPlain(String(t || '').replace(/\b(pp?|ch|sec|eq|fig|vol)\.\s+(?=\S)/gi, '$1.\u00a0'), ctx);
  const anyPre = items.some(x => x.pre), anyPost = items.some(x => x.post);
  const one = (keys, pre, post) => '\\' + macro + (pre ? '[' + note(pre) + '][' + note(post) + ']' : post ? '[' + note(post) + ']' : '') + '{' + keys + '}';
  if (!anyPre && !anyPost) return one(items.map(x => x.k).join(','), '', '');
  const onlyEnds = items.slice(1).every(x => !x.pre) && items.slice(0, -1).every(x => !x.post);
  if (onlyEnds) return one(items.map(x => x.k).join(','), items[0].pre, items[items.length - 1].post);
  return items.map(x => one(x.k, x.pre, x.post)).join('; ');
}
/* 交叉引用：章節在不編號的期刊（PRL）或不編號的章節（{-}）裡，\ref 會印成空白
   （A-14、B-27），改印章節標題並連過去。公式用 \eqref（自動加括號）。 */
function refTex(c, ctx){
  const ids = c.ids || (c.id ? [c.id] : []);
  const parts = ids.map(id => {
    const k = texKey(id);
    ctx.refsUsed.push(k);
    const h = ctx.headings[k];
    if (h && (!h.numbered || ctx.unnumberedSections)) {
      const title = h.title || inline(h.node.children, ctx, { moving: true, heading: true });
      ctx.warn('目前的期刊或章節不編號，章節引用 [@' + id + '] 改印章節標題。', 'secref-title');
      return ctx.hyperref ? '\\hyperref[' + k + ']{' + title + '}' : title;
    }
    /* 使用者自己寫的 \ref{}／\eqref{} 照原樣；[@eq:x] 這種 Markdown 寫法用 \eqref（自動加括號）。 */
    const style = c.explicit ? (c.style === 'eqref' ? 'eqref' : 'ref') : (c.style === 'eqref' || /^(eq|eqn|equation):/i.test(id) ? 'eqref' : 'ref');
    return '\\' + style + '{' + k + '}';
  });
  return parts.join(', ');
}

/* =====================================================================
 * 第六部分：出口自檢（只發警告，不再決定用哪個發射器）
 * 舊版自檢同時是「能不能接管」的閘門，誤判時匯出會悄悄換回舊發射器（L09）。
 * 現在只檢查結構，有問題就寫進警告，輸出不變。
 * ===================================================================== */
function selfcheck(tex, ast){
  const problems = [];
  /* verbatim／lstlisting 的內容不算（程式碼裡的大括號不必成對，L09 誤判 B）。 */
  const body = String(tex).replace(/\\begin\{(verbatim|lstlisting)\}[\s\S]*?\\end\{\1\}/g, '');
  if (/\\verb\W/.test(body)) problems.push('輸出含 \\verb（不應出現，請回報）');
  const opens = [...body.matchAll(/\\begin\{([A-Za-z*]+)\}/g)].map(x => x[1]);
  const closes = [...body.matchAll(/\\end\{([A-Za-z*]+)\}/g)].map(x => x[1]);
  const tally = {};
  for (const o of opens) tally[o] = (tally[o] || 0) + 1;
  for (const c of closes) tally[c] = (tally[c] || 0) - 1;
  for (const [k, v] of Object.entries(tally)) if (v !== 0 && !/^(widetext)$/.test(k)) problems.push('環境不配對：' + k + '（差 ' + v + '）');
  if (!/\\documentclass\[[^\]]*\]\{revtex4-2\}/.test(tex)) problems.push('缺 revtex4-2 documentclass');
  if (!/\\maketitle/.test(tex)) problems.push('缺 \\maketitle');
  if (/\\title\{Untitled\}/.test(tex) && ast && ast.meta && ast.meta.title) problems.push('標題遺失：原稿有 title 但輸出為 \\title{Untitled}');
  const stripped = body.replace(/\\[{}]/g, '').replace(/\\char\d+/g, '');
  let depth = 0;
  for (const ch of stripped) { if (ch === '{') depth++; else if (ch === '}') depth--; if (depth < 0) break; }
  if (depth !== 0) problems.push('大括號不平衡（淨值 ' + depth + '）');
  return { ok: problems.length === 0, problems };
}

/* =====================================================================
 * 第七部分：唯一入口
 * mainTex(md, { settings, purpose, assetMap })：Markdown → main.tex。
 * 預覽編譯（19.js）、下載 .tex（22.js）、匯出 LaTeX 與 .zip 專案與 TeX 校樣（04.js／08.js）、
 * 投稿包（31.js）都呼叫這一個函式。
 * ===================================================================== */
function mainTex(md, opts){
  const P = K.need('parser');
  if (!P) throw new Error('CP171 parser 未載入');
  const ast = P.parse(String(md == null ? '' : md));
  const out = emit(ast, opts || {});
  out.md = String(md == null ? '' : md);
  return out;
}

K.register('emit', {
  emit, mainTex, learn, texText, esc, textOut, classOptions, revtexFontProfile, selfcheck,
  measurements: () => new Map(MEASURE), clearMeasurements: () => MEASURE.clear(),
  version: '1.2.6'
});
K.log.info('emit', 'CP171 REVTeX 4.2 發射器就緒（單一入口 mainTex）');
})();
