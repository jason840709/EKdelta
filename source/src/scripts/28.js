
/* ============================================================================
 * cp171-59-mathinput — 公式輸入面板（視覺化）
 *
 * 為什麼要有這個東西：
 *   跟 58-papertools 同一個初衷——不要逼使用者背 LaTeX。工具列已經把
 *   REVTeX 的圍欄語法變成填表，但「公式」還是要自己敲 \frac{}{}、\sum_{}^{}。
 *   這個模組把符號與結構做成可以點的面板：點一下就進來，右邊即時看到長相，
 *   確認了再插進稿子。
 *
 * 為什麼用 KaTeX 而不是 MathLive（V146.1 計畫書 §5 的修訂）：
 *   計畫書原訂內嵌 MathLive 0.110.0（≈1.15 MB）。本輪的容器沒有對外網路
 *   （npm registry 回 403），拿不到那 823 KB 的 bundle。
 *   但實測發現 base.html 裡**本來就內嵌了完整的 KaTeX**（UMD，掛在
 *   window.katex；並且 18 個 KaTeX 字族全部以 base64 @font-face 內嵌）。
 *   於是這一版改用既有的 KaTeX 做預覽引擎：
 *     · 體積增量 = 0（不新增任何字型或函式庫）
 *     · 完全離線，不依賴 CDN
 *     · 預覽用的就是產品渲染公式的同一支引擎 → 面板看到的 = 稿子裡的
 *   代價是編輯面是「LaTeX 原始碼 + 即時預覽」而不是 MathLive 那種
 *   直接在公式上打字。這一點用 upgradeSurface() 留了掛勾：
 *   只要哪天 window.MathLive 存在（自行載入或未來內嵌），面板會自動改用
 *   <math-field> 當編輯面，其餘邏輯（面板、符號盤、插入）一行都不用改。
 *
 * 放在哪裡：
 *   格式工具列（#ty-toolbar）最右側，排在 REV／TW_THESIS 之前，自成一組。
 *
 * 邊界（隔離規約，與 58 相同）：
 *   · 只讀寫 #cp171-mathin 這棵子樹與工具列裡自己插入的那一段
 *   · 插入一律走宿主既有的 insertTextAtCaret()／insertParagraphSyntax()
 *   · tbBuild() 會整條重建工具列，所以靠 MutationObserver 補回自己那一段
 * ========================================================================== */
(() => {
'use strict';
const K = window.__CP171__;
if (!K) { console.error('[CP171] mathinput: kernel not ready'); return; }
try {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function'
      || typeof document.createElement('div').querySelector !== 'function') return;
} catch (_) { return; }

const PANEL_ID = 'cp171-mathin';
const MOUNT_CLASS = 'cp171-mathin-group';

/* 語言判斷與 58 用同一套：讀 DOM，不讀 window.settings（那是 IIFE 內的區域變數）。 */
const isEN = () => {
  try {
    if (document.body && document.body.classList.contains('lang-en')) return true;
    const l = document.documentElement && document.documentElement.lang;
    return typeof l === 'string' && l.toLowerCase().indexOf('en') === 0;
  } catch (_) { return false; }
};
const T = (zh, en) => (isEN() ? en : zh);

/* ---------- 符號盤資料 ----------------------------------------------------
 * 每一項：{ t: 插入樣板, s: 預覽用字串（省略則用 t 把 #n 換成 \square）, k: 提示 }
 * 樣板裡的 #1 #2 #3 是游標位置標記：
 *   · 有選取文字 → 填進 #1
 *   · 插入後游標停在第一個還空著的 #n；都填滿就停在插入內容之後
 * ------------------------------------------------------------------------ */

const GREEK_LOWER = ['alpha','beta','gamma','delta','epsilon','varepsilon','zeta','eta','theta',
  'vartheta','iota','kappa','lambda','mu','nu','xi','pi','varpi','rho','varrho','sigma','varsigma',
  'tau','upsilon','phi','varphi','chi','psi','omega'];
const GREEK_UPPER = ['Gamma','Delta','Theta','Lambda','Xi','Pi','Sigma','Upsilon','Phi','Psi','Omega'];

const g = n => ({ t: '\\' + n + ' ', s: '\\' + n, k: '\\' + n });

const CATS = [
  {
    id: 'common',
    label: ['常用', 'Common'],
    items: [
      { t: '^{#1}', s: 'x^{n}', k: ['上標', 'Superscript'] },
      { t: '_{#1}', s: 'x_{i}', k: ['下標', 'Subscript'] },
      { t: '_{#1}^{#2}', s: 'x_{i}^{n}', k: ['上下標', 'Sub + superscript'] },
      { t: '\\frac{#1}{#2}', s: '\\frac{a}{b}', k: ['分數', 'Fraction'] },
      { t: '\\sqrt{#1}', s: '\\sqrt{x}', k: ['根號', 'Square root'] },
      { t: '\\sqrt[#1]{#2}', s: '\\sqrt[n]{x}', k: ['n 次方根', 'nth root'] },
      { t: '\\sum_{#1}^{#2}', s: '\\sum_{i=1}^{N}', k: ['求和', 'Summation'] },
      { t: '\\int_{#1}^{#2}', s: '\\int_{a}^{b}', k: ['積分', 'Integral'] },
      { t: '\\lim_{#1 \\to #2}', s: '\\lim_{x \\to 0}', k: ['極限', 'Limit'] },
      { t: '\\infty ', s: '\\infty', k: ['無限大', 'Infinity'] },
      { t: '\\partial ', s: '\\partial', k: ['偏微分符號', 'Partial'] },
      { t: '\\nabla ', s: '\\nabla', k: ['梯度算符', 'Nabla'] },
      { t: '\\times ', s: '\\times', k: ['乘號', 'Times'] },
      { t: '\\cdot ', s: '\\cdot', k: ['點乘', 'Dot'] },
      { t: '\\pm ', s: '\\pm', k: ['正負', 'Plus-minus'] },
      { t: '\\leq ', s: '\\leq', k: ['小於等於', 'Less or equal'] },
      { t: '\\geq ', s: '\\geq', k: ['大於等於', 'Greater or equal'] },
      { t: '\\neq ', s: '\\neq', k: ['不等於', 'Not equal'] },
      { t: '\\approx ', s: '\\approx', k: ['約等於', 'Approximately'] },
      { t: '\\to ', s: '\\to', k: ['趨近／映到', 'To'] },
      { t: '\\alpha ', s: '\\alpha', k: ['alpha'] },
      { t: '\\beta ', s: '\\beta', k: ['beta'] },
      { t: '\\theta ', s: '\\theta', k: ['theta'] },
      { t: '\\lambda ', s: '\\lambda', k: ['lambda'] },
      { t: '\\mu ', s: '\\mu', k: ['mu'] },
      { t: '\\omega ', s: '\\omega', k: ['omega'] },
      { t: '\\hbar ', s: '\\hbar', k: ['約化普朗克常數', 'Reduced Planck'] },
      { t: '\\text{#1}', s: '\\text{文字}', k: ['正體文字（單位、說明）', 'Upright text'] }
    ]
  },
  {
    id: 'greek',
    label: ['希臘字母', 'Greek'],
    items: GREEK_LOWER.map(g).concat(GREEK_UPPER.map(g))
  },
  {
    id: 'op',
    label: ['運算', 'Operators'],
    items: [
      { t: '\\frac{#1}{#2}', s: '\\frac{a}{b}', k: ['分數', 'Fraction'] },
      { t: '\\dfrac{#1}{#2}', s: '\\dfrac{a}{b}', k: ['大分數（行內也用區塊大小）', 'Display fraction'] },
      { t: '\\binom{#1}{#2}', s: '\\binom{n}{k}', k: ['二項式係數', 'Binomial'] },
      { t: '\\sqrt{#1}', s: '\\sqrt{x}', k: ['根號', 'Root'] },
      { t: '\\sum_{#1}^{#2}', s: '\\sum_{i=1}^{N}', k: ['求和', 'Sum'] },
      { t: '\\prod_{#1}^{#2}', s: '\\prod_{i=1}^{N}', k: ['連乘', 'Product'] },
      { t: '\\int_{#1}^{#2}', s: '\\int_a^b', k: ['積分', 'Integral'] },
      { t: '\\iint_{#1}', s: '\\iint_{S}', k: ['二重積分', 'Double integral'] },
      { t: '\\iiint_{#1}', s: '\\iiint_{V}', k: ['三重積分', 'Triple integral'] },
      { t: '\\oint_{#1}', s: '\\oint_{C}', k: ['環路積分', 'Contour integral'] },
      { t: '\\lim_{#1 \\to #2}', s: '\\lim_{x\\to 0}', k: ['極限', 'Limit'] },
      { t: '\\max_{#1}', s: '\\max_{x}', k: ['最大', 'Max'] },
      { t: '\\min_{#1}', s: '\\min_{x}', k: ['最小', 'Min'] },
      { t: '\\sup_{#1}', s: '\\sup_{x}', k: ['上確界', 'Supremum'] },
      { t: '\\inf_{#1}', s: '\\inf_{x}', k: ['下確界', 'Infimum'] },
      { t: '\\bigcup_{#1}', s: '\\bigcup_{i}', k: ['聯集', 'Union'] },
      { t: '\\bigcap_{#1}', s: '\\bigcap_{i}', k: ['交集', 'Intersection'] },
      { t: '\\bigoplus_{#1}', s: '\\bigoplus_{i}', k: ['直和', 'Direct sum'] },
      { t: '\\bigotimes_{#1}', s: '\\bigotimes_{i}', k: ['張量積', 'Tensor product'] },
      { t: '\\div ', s: '\\div', k: ['除號', 'Divide'] },
      { t: '\\ast ', s: '\\ast', k: ['星號（摺積）', 'Asterisk'] },
      { t: '\\circ ', s: '\\circ', k: ['複合', 'Composition'] },
      { t: '\\mp ', s: '\\mp', k: ['負正', 'Minus-plus'] },
      { t: '\\oplus ', s: '\\oplus', k: ['圈加', 'Oplus'] },
      { t: '\\otimes ', s: '\\otimes', k: ['圈乘', 'Otimes'] },
      { t: '\\%', s: '\\%', k: ['百分號', 'Percent'] },
      { t: '\\degree ', s: '^{\\circ}', k: ['度', 'Degree'] },
      { t: '\\,', s: 'a\\,b', k: ['細空白', 'Thin space'] },
      { t: '\\quad ', s: 'a\\quad b', k: ['一個 em 空白', 'Quad'] },
      { t: '\\qquad ', s: 'a\\qquad b', k: ['兩個 em 空白', 'Qquad'] }
    ]
  },
  {
    id: 'rel',
    label: ['關係', 'Relations'],
    items: [
      { t: '= ', s: '=', k: ['等於', 'Equal'] },
      { t: '\\neq ', s: '\\neq', k: ['不等', 'Not equal'] },
      { t: '\\equiv ', s: '\\equiv', k: ['恆等', 'Identical'] },
      { t: '\\leq ', s: '\\leq', k: ['≤'] },
      { t: '\\geq ', s: '\\geq', k: ['≥'] },
      { t: '\\ll ', s: '\\ll', k: ['遠小於', 'Much less'] },
      { t: '\\gg ', s: '\\gg', k: ['遠大於', 'Much greater'] },
      { t: '\\sim ', s: '\\sim', k: ['同量級', 'Similar'] },
      { t: '\\simeq ', s: '\\simeq', k: ['漸近等於', 'Asymptotically equal'] },
      { t: '\\approx ', s: '\\approx', k: ['約等於', 'Approx'] },
      { t: '\\cong ', s: '\\cong', k: ['全等', 'Congruent'] },
      { t: '\\propto ', s: '\\propto', k: ['正比於', 'Proportional'] },
      { t: '\\in ', s: '\\in', k: ['屬於', 'Element of'] },
      { t: '\\notin ', s: '\\notin', k: ['不屬於', 'Not element of'] },
      { t: '\\subset ', s: '\\subset', k: ['真子集', 'Subset'] },
      { t: '\\subseteq ', s: '\\subseteq', k: ['子集', 'Subset or equal'] },
      { t: '\\supset ', s: '\\supset', k: ['真超集', 'Superset'] },
      { t: '\\perp ', s: '\\perp', k: ['垂直', 'Perpendicular'] },
      { t: '\\parallel ', s: '\\parallel', k: ['平行', 'Parallel'] },
      { t: '\\forall ', s: '\\forall', k: ['對所有', 'For all'] },
      { t: '\\exists ', s: '\\exists', k: ['存在', 'Exists'] },
      { t: '\\therefore ', s: '\\therefore', k: ['所以', 'Therefore'] },
      { t: '\\because ', s: '\\because', k: ['因為', 'Because'] },
      { t: '\\emptyset ', s: '\\emptyset', k: ['空集', 'Empty set'] },
      { t: '\\mathbb{R}', s: '\\mathbb{R}', k: ['實數集', 'Reals'] },
      { t: '\\mathbb{C}', s: '\\mathbb{C}', k: ['複數集', 'Complex'] },
      { t: '\\mathbb{Z}', s: '\\mathbb{Z}', k: ['整數集', 'Integers'] },
      { t: '\\mathbb{N}', s: '\\mathbb{N}', k: ['自然數集', 'Naturals'] }
    ]
  },
  {
    id: 'arrow',
    label: ['箭頭', 'Arrows'],
    items: [
      { t: '\\to ', s: '\\to', k: ['→'] },
      { t: '\\gets ', s: '\\gets', k: ['←'] },
      { t: '\\leftrightarrow ', s: '\\leftrightarrow', k: ['↔'] },
      { t: '\\Rightarrow ', s: '\\Rightarrow', k: ['⇒（推得）', 'Implies'] },
      { t: '\\Leftarrow ', s: '\\Leftarrow', k: ['⇐'] },
      { t: '\\Leftrightarrow ', s: '\\Leftrightarrow', k: ['⇔（若且唯若）', 'Iff'] },
      { t: '\\mapsto ', s: '\\mapsto', k: ['映到', 'Maps to'] },
      { t: '\\longrightarrow ', s: '\\longrightarrow', k: ['長右箭頭', 'Long arrow'] },
      { t: '\\xrightarrow{#1}', s: '\\xrightarrow{f}', k: ['帶標籤右箭頭', 'Labelled arrow'] },
      { t: '\\uparrow ', s: '\\uparrow', k: ['↑'] },
      { t: '\\downarrow ', s: '\\downarrow', k: ['↓'] },
      { t: '\\rightleftharpoons ', s: '\\rightleftharpoons', k: ['可逆反應', 'Equilibrium'] },
      { t: '\\nearrow ', s: '\\nearrow', k: ['↗'] },
      { t: '\\searrow ', s: '\\searrow', k: ['↘'] },
      { t: '\\hookrightarrow ', s: '\\hookrightarrow', k: ['嵌入', 'Hook arrow'] },
      { t: '\\rightsquigarrow ', s: '\\rightsquigarrow', k: ['波浪箭頭', 'Squiggly arrow'] }
    ]
  },
  {
    id: 'delim',
    label: ['括號', 'Delimiters'],
    items: [
      { t: '\\left( #1 \\right)', s: '\\left(a\\right)', k: ['自動高度小括號', 'Auto parentheses'] },
      { t: '\\left[ #1 \\right]', s: '\\left[a\\right]', k: ['自動高度中括號', 'Auto brackets'] },
      { t: '\\left\\{ #1 \\right\\}', s: '\\left\\{a\\right\\}', k: ['自動高度大括號', 'Auto braces'] },
      { t: '\\left| #1 \\right|', s: '\\left|a\\right|', k: ['絕對值', 'Absolute value'] },
      { t: '\\left\\| #1 \\right\\|', s: '\\left\\|a\\right\\|', k: ['範數', 'Norm'] },
      { t: '\\langle #1 \\rangle', s: '\\langle a \\rangle', k: ['角括號（平均值）', 'Angle brackets'] },
      { t: '\\lfloor #1 \\rfloor', s: '\\lfloor x \\rfloor', k: ['下取整', 'Floor'] },
      { t: '\\lceil #1 \\rceil', s: '\\lceil x \\rceil', k: ['上取整', 'Ceiling'] },
      { t: '\\overbrace{#1}^{#2}', s: '\\overbrace{a+b}^{n}', k: ['上大括號標註', 'Overbrace'] },
      { t: '\\underbrace{#1}_{#2}', s: '\\underbrace{a+b}_{n}', k: ['下大括號標註', 'Underbrace'] },
      { t: '\\left. #1 \\right|_{#2}', s: '\\left. f \\right|_{x=0}', k: ['取值直線', 'Evaluated at'] },
      { t: '\\big( #1 \\big)', s: '\\big(a\\big)', k: ['固定加大括號', 'Big parentheses'] }
    ]
  },
  {
    id: 'accent',
    label: ['標註', 'Accents'],
    items: [
      { t: '\\hat{#1}', s: '\\hat{a}', k: ['帽（算符）', 'Hat'] },
      { t: '\\bar{#1}', s: '\\bar{a}', k: ['橫線（平均）', 'Bar'] },
      { t: '\\vec{#1}', s: '\\vec{a}', k: ['向量箭頭', 'Vector'] },
      { t: '\\dot{#1}', s: '\\dot{a}', k: ['一階時間導數', 'Dot'] },
      { t: '\\ddot{#1}', s: '\\ddot{a}', k: ['二階時間導數', 'Double dot'] },
      { t: '\\tilde{#1}', s: '\\tilde{a}', k: ['波浪號', 'Tilde'] },
      { t: '\\widehat{#1}', s: '\\widehat{abc}', k: ['寬帽', 'Wide hat'] },
      { t: '\\widetilde{#1}', s: '\\widetilde{abc}', k: ['寬波浪', 'Wide tilde'] },
      { t: '\\overline{#1}', s: '\\overline{abc}', k: ['上劃線', 'Overline'] },
      { t: '\\underline{#1}', s: '\\underline{abc}', k: ['下劃線', 'Underline'] },
      { t: '\\overrightarrow{#1}', s: '\\overrightarrow{AB}', k: ['長向量箭頭', 'Long vector'] },
      { t: "#1'", s: "f'", k: ['一撇', 'Prime'] },
      { t: '\\dagger ', s: '\\dagger', k: ['厄米共軛', 'Dagger'] },
      { t: '^{*}', s: 'z^{*}', k: ['複共軛', 'Conjugate'] },
      { t: '\\cdots ', s: '\\cdots', k: ['中線省略號', 'Centered dots'] },
      { t: '\\ldots ', s: '\\ldots', k: ['底線省略號', 'Low dots'] },
      { t: '\\vdots ', s: '\\vdots', k: ['直省略號', 'Vertical dots'] },
      { t: '\\ddots ', s: '\\ddots', k: ['斜省略號', 'Diagonal dots'] }
    ]
  },
  {
    id: 'font',
    label: ['字體', 'Fonts'],
    items: [
      { t: '\\mathrm{#1}', s: '\\mathrm{abc}', k: ['正體（單位、函數名）', 'Roman'] },
      { t: '\\mathbf{#1}', s: '\\mathbf{abc}', k: ['粗體（向量、矩陣）', 'Bold'] },
      { t: '\\boldsymbol{#1}', s: '\\boldsymbol{\\alpha}', k: ['粗斜體（粗希臘字母）', 'Bold italic'] },
      { t: '\\mathbb{#1}', s: '\\mathbb{RC}', k: ['黑板粗體（數系）', 'Blackboard'] },
      { t: '\\mathcal{#1}', s: '\\mathcal{H}', k: ['花體（Hilbert 空間等）', 'Calligraphic'] },
      { t: '\\mathfrak{#1}', s: '\\mathfrak{g}', k: ['哥德體（李代數）', 'Fraktur'] },
      { t: '\\mathsf{#1}', s: '\\mathsf{abc}', k: ['無襯線', 'Sans-serif'] },
      { t: '\\mathtt{#1}', s: '\\mathtt{abc}', k: ['等寬', 'Typewriter'] },
      { t: '\\text{#1}', s: '\\text{中文}', k: ['正體文字（可放中文）', 'Text mode'] },
      { t: '\\operatorname{#1}', s: '\\operatorname{Tr}', k: ['自訂運算子名（Tr、Re…）', 'Operator name'] },
      { t: '\\color{red}{#1}', s: '\\color{red}{a}', k: ['著色（草稿標記用）', 'Colour'] }
    ]
  },
  {
    id: 'struct',
    label: ['矩陣與多行', 'Matrices'],
    items: [
      { t: '\\begin{pmatrix} #1 & #2 \\\\ #3 & #4 \\end{pmatrix}',
        s: '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}', k: ['小括號矩陣', 'pmatrix'] },
      { t: '\\begin{bmatrix} #1 & #2 \\\\ #3 & #4 \\end{bmatrix}',
        s: '\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}', k: ['中括號矩陣', 'bmatrix'] },
      { t: '\\begin{vmatrix} #1 & #2 \\\\ #3 & #4 \\end{vmatrix}',
        s: '\\begin{vmatrix}a&b\\\\c&d\\end{vmatrix}', k: ['行列式', 'Determinant'] },
      { t: '\\begin{Vmatrix} #1 & #2 \\\\ #3 & #4 \\end{Vmatrix}',
        s: '\\begin{Vmatrix}a&b\\\\c&d\\end{Vmatrix}', k: ['雙線矩陣', 'Vmatrix'] },
      { t: '\\begin{pmatrix} #1 \\\\ #2 \\\\ #3 \\end{pmatrix}',
        s: '\\begin{pmatrix}a\\\\b\\\\c\\end{pmatrix}', k: ['行向量', 'Column vector'] },
      { t: '\\begin{cases} #1, & #2 \\\\ #3, & #4 \\end{cases}',
        s: '\\begin{cases}a,&x>0\\\\b,&x<0\\end{cases}', k: ['分段函數', 'Cases'] },
      { t: '\\begin{aligned} #1 &= #2 \\\\ &= #3 \\end{aligned}',
        s: '\\begin{aligned}a&=b\\\\&=c\\end{aligned}', k: ['多行對齊推導', 'Aligned'] },
      { t: '\\begin{matrix} #1 & #2 \\\\ #3 & #4 \\end{matrix}',
        s: '\\begin{matrix}a&b\\\\c&d\\end{matrix}', k: ['無括號矩陣', 'matrix'] },
      { t: '\\begin{pmatrix} #1 & \\cdots & #2 \\\\ \\vdots & \\ddots & \\vdots \\\\ #3 & \\cdots & #4 \\end{pmatrix}',
        s: '\\begin{pmatrix}a_{11}&\\cdots&a_{1n}\\\\\\vdots&\\ddots&\\vdots\\\\a_{m1}&\\cdots&a_{mn}\\end{pmatrix}',
        k: ['一般 m×n 矩陣', 'General matrix'] }
    ]
  },
  {
    id: 'phys',
    label: ['物理範本', 'Physics'],
    items: [
      { t: '\\hat{H}\\,\\psi = E\\,\\psi', s: '\\hat{H}\\psi=E\\psi', k: ['定態薛丁格方程', 'Time-independent Schrodinger'] },
      { t: 'i\\hbar \\frac{\\partial}{\\partial t}\\left| \\psi \\right\\rangle = \\hat{H} \\left| \\psi \\right\\rangle',
        s: 'i\\hbar\\frac{\\partial}{\\partial t}|\\psi\\rangle=\\hat{H}|\\psi\\rangle',
        k: ['含時薛丁格方程', 'Time-dependent Schrodinger'] },
      { t: '\\left\\langle #1 \\right|', s: '\\langle\\phi|', k: ['bra', 'Bra'] },
      { t: '\\left| #1 \\right\\rangle', s: '|\\psi\\rangle', k: ['ket', 'Ket'] },
      { t: '\\left\\langle #1 \\middle| #2 \\right\\rangle', s: '\\langle\\phi|\\psi\\rangle', k: ['內積', 'Inner product'] },
      { t: '\\left\\langle #1 \\middle| \\hat{#2} \\middle| #3 \\right\\rangle',
        s: '\\langle\\phi|\\hat{O}|\\psi\\rangle', k: ['矩陣元／期望值', 'Matrix element'] },
      { t: '\\left[ \\hat{#1}, \\hat{#2} \\right]', s: '[\\hat{A},\\hat{B}]', k: ['對易子', 'Commutator'] },
      { t: '\\left\\{ \\hat{#1}, \\hat{#2} \\right\\}', s: '\\{\\hat{A},\\hat{B}\\}', k: ['反對易子', 'Anticommutator'] },
      { t: '\\frac{\\partial #1}{\\partial #2}', s: '\\frac{\\partial f}{\\partial x}', k: ['偏導數', 'Partial derivative'] },
      { t: '\\frac{\\mathrm{d} #1}{\\mathrm{d} #2}', s: '\\frac{\\mathrm{d}f}{\\mathrm{d}x}', k: ['全導數（正體 d）', 'Total derivative'] },
      { t: '\\frac{\\partial^{2} #1}{\\partial #2^{2}}', s: '\\frac{\\partial^2 f}{\\partial x^2}', k: ['二階偏導', 'Second partial'] },
      { t: '\\nabla \\cdot \\mathbf{#1}', s: '\\nabla\\cdot\\mathbf{E}', k: ['散度', 'Divergence'] },
      { t: '\\nabla \\times \\mathbf{#1}', s: '\\nabla\\times\\mathbf{B}', k: ['旋度', 'Curl'] },
      { t: '\\nabla^{2} #1', s: '\\nabla^2\\phi', k: ['拉普拉斯算符', 'Laplacian'] },
      { t: '\\int_{-\\infty}^{\\infty} #1 \\, \\mathrm{d}#2', s: '\\int_{-\\infty}^{\\infty}f\\,\\mathrm{d}x', k: ['全域積分', 'Full-range integral'] },
      { t: '\\sum_{\\mathbf{k}} #1', s: '\\sum_{\\mathbf{k}}', k: ['對 k 空間求和', 'Sum over k'] },
      { t: 'E = \\hbar \\omega', s: 'E=\\hbar\\omega', k: ['光子能量', 'Photon energy'] },
      { t: '#1 \\pm #2 \\ \\mathrm{#3}', s: '1.23\\pm0.04\\ \\mathrm{eV}', k: ['數值 ± 誤差 單位', 'Value with uncertainty'] },
      { t: '\\mathrm{#1}', s: '\\mathrm{eV}', k: ['單位（一律用正體）', 'Unit (upright)'] },
      { t: '\\times 10^{#1}', s: '\\times 10^{-6}', k: ['科學記號', 'Scientific notation'] }
    ]
  }
];

/* ---------- 樣式 --------------------------------------------------------- */
const CSS = `
#ty-toolbar .${MOUNT_CLASS}{display:flex;align-items:center;gap:3px;flex:0 0 auto;
  padding-left:8px;margin-left:6px;border-left:1px solid var(--border,#ddd)}
#ty-toolbar .${MOUNT_CLASS} .tb-btn{min-width:38px;font-weight:600;font-size:var(--fs-13);line-height:1}
#ty-toolbar .${MOUNT_CLASS} .tb-btn.mi-open{background:var(--accent-soft,#eef);color:var(--accent,var(--ui-accent))}
#${PANEL_ID}{position:fixed;z-index:212;width:min(700px,calc(100vw - 24px));max-height:min(80vh,700px);
  display:flex;flex-direction:column;background:var(--bg-panel,#fff);color:var(--text-strong,#111);
  border:1px solid var(--border-strong,#ccc);border-radius:var(--r-lg);
  box-shadow:var(--mac-shadow-popover,0 12px 40px rgba(0,0,0,.22));overflow:hidden;
  font:13px/1.5 var(--font-ui,system-ui)}
#${PANEL_ID}[hidden]{display:none}
#${PANEL_ID} .mi-chips{display:flex;flex-wrap:wrap;gap:5px;padding:9px 11px;
  border-bottom:1px solid var(--border,#e2e2e2);background:var(--bg-secondary,var(--bg-hover,#f6f6f6));flex:0 0 auto}
#${PANEL_ID} .mi-chip{padding:4px 11px;border-radius:999px;border:1px solid var(--border,#ddd);background:transparent;
  color:var(--text-strong,#111);font:600 12px/1.5 var(--font-ui,system-ui);cursor:pointer;white-space:nowrap}
#${PANEL_ID} .mi-chip:hover{background:var(--bg-hover,#eee)}
#${PANEL_ID} .mi-chip.on{background:var(--accent,var(--ui-accent));border-color:var(--accent,var(--ui-accent));color:#fff}
#${PANEL_ID} .mi-pal{flex:0 1 auto;overflow:auto;padding:10px 11px 6px;
  display:grid;grid-template-columns:repeat(auto-fill,minmax(58px,1fr));gap:5px;
  max-height:min(38vh,290px);border-bottom:1px solid var(--border,#e2e2e2)}
#${PANEL_ID} .mi-key{min-height:38px;display:flex;align-items:center;justify-content:center;
  border:1px solid var(--border,#e0e0e0);border-radius:var(--r-md);background:var(--bg-editor,#fff);
  color:var(--text-strong,#111);cursor:pointer;padding:3px 4px;overflow:hidden}
#${PANEL_ID} .mi-key:hover{border-color:var(--accent,var(--ui-accent));background:var(--accent-soft,#eef)}
#${PANEL_ID} .mi-key .katex{font-size:1.02em}
#${PANEL_ID} .mi-key .mi-raw{font:12px/1.3 var(--font-mono,ui-monospace,Menlo,monospace);color:var(--text-muted,#777)}
#${PANEL_ID} .mi-edit{flex:0 0 auto;padding:10px 11px 4px}
#${PANEL_ID} .mi-labrow{display:flex;align-items:baseline;gap:8px;margin-bottom:4px}
#${PANEL_ID} .mi-label{display:block;font-size:var(--fs-12);font-weight:600;color:var(--text-muted,#666)}
#${PANEL_ID} .mi-labrow .mi-spacer{flex:1 1 auto}
#${PANEL_ID} .mi-raw-toggle{padding:2px 9px;border-radius:var(--r-sm);border:1px solid var(--border,#ddd);
  background:transparent;color:var(--text-muted,#666);
  font:600 11px/1.4 var(--font-ui,system-ui);cursor:pointer}
#${PANEL_ID} .mi-raw-toggle:hover{background:var(--bg-hover,#eee);color:var(--text-strong,#111)}
#${PANEL_ID} .mi-raw-toggle.on{background:var(--accent,var(--ui-accent));border-color:var(--accent,var(--ui-accent));color:#fff}
#${PANEL_ID} .mi-raw-toggle[hidden]{display:none}
/* MathLive 視覺編輯面。外框刻意做得跟原始碼那個 textarea 一樣，
   兩種模式切換時版面不會跳動。 */
#${PANEL_ID} math-field.mi-mf{display:block;width:100%;box-sizing:border-box;
  background:var(--bg-editor,#fff);color:var(--text-strong,#111);
  border:1px solid var(--border,#ddd);border-radius:var(--r-sm);padding:8px 9px;
  font-size:var(--fs-20);min-height:62px;outline:none;
  /* MathLive 的 Shadow DOM 會直接讀 prefers-color-scheme。若 macOS 是暗色、
     本程式卻正在 GitHub/亮色主題，它的結構高亮會變成深灰塊。把互動色明確
     綁回本程式主題，避免系統外觀與文件主題互相打架。 */
  --caret-color:var(--accent,var(--ui-accent));
  --selection-color:var(--text-strong,#111);
  --selection-background-color:var(--sel,var(--accent-soft,#dbeafe));
  --contains-highlight-color:var(--accent,var(--ui-accent));
  --contains-highlight-background-color:var(--accent-soft,#eef);
  --text-highlight-background-color:var(--accent-soft,#eef);
  --composition-background-color:var(--accent-soft,#eef);
  --composition-text-color:var(--text-strong,#111)}
#${PANEL_ID} math-field.mi-mf:focus-within{border-color:var(--accent,var(--ui-accent))}
#${PANEL_ID} math-field.mi-mf[hidden]{display:none}
#${PANEL_ID} textarea.mi-src[hidden]{display:none}
#${PANEL_ID} .mi-prev[hidden]{display:none}
#${PANEL_ID} textarea.mi-src{width:100%;box-sizing:border-box;background:var(--bg-editor,#fff);
  color:var(--text-strong,#111);border:1px solid var(--border,#ddd);border-radius:var(--r-sm);padding:7px 9px;
  font:13px/1.6 var(--font-mono,ui-monospace,Menlo,monospace);outline:none;resize:vertical;min-height:62px}
#${PANEL_ID} textarea.mi-src:focus{border-color:var(--accent,var(--ui-accent))}
#${PANEL_ID} .mi-prev-wrap{flex:1 1 auto;overflow:auto;padding:4px 11px 10px;min-height:70px}
#${PANEL_ID} .mi-prev{border:1px dashed var(--border,#ddd);border-radius:var(--r-md);padding:12px 10px;
  min-height:52px;display:flex;align-items:center;justify-content:center;text-align:center;
  background:var(--bg-secondary,#fafafa);overflow-x:auto}
#${PANEL_ID} .mi-prev.err{border-color:var(--status-error,#b3261e)}
#${PANEL_ID} .mi-empty{color:var(--text-muted,#999);font-size:var(--fs-12)}
#${PANEL_ID} .mi-msg{margin-top:5px;font-size:var(--fs-12);line-height:1.5;color:var(--text-muted,#888);min-height:16px}
#${PANEL_ID} .mi-msg.err{color:var(--status-error,#b3261e)}
#${PANEL_ID} .mi-foot{display:flex;align-items:center;gap:8px;padding:9px 11px;flex:0 0 auto;
  border-top:1px solid var(--border,#e2e2e2);background:var(--bg-secondary,var(--bg-hover,#f6f6f6))}
#${PANEL_ID} .mi-mode{display:flex;gap:4px}
#${PANEL_ID} .mi-mode button{padding:4px 10px;border-radius:var(--r-sm);border:1px solid var(--border,#ddd);
  background:transparent;color:var(--text-strong,#111);font:600 11.5px/1.4 var(--font-ui,system-ui);cursor:pointer}
#${PANEL_ID} .mi-mode button.on{background:var(--accent,var(--ui-accent));border-color:var(--accent,var(--ui-accent));color:#fff}
#${PANEL_ID} .mi-spacer{flex:1 1 auto}
#${PANEL_ID} .mi-btn{padding:5px 14px;border-radius:var(--r-md);border:1px solid var(--border-strong,#ccc);
  background:var(--bg-panel,#fff);color:var(--text-strong,#111);
  font:620 12.5px/1.5 var(--font-ui,system-ui);cursor:pointer}
#${PANEL_ID} .mi-btn:hover{background:var(--bg-hover,#f0f0f0)}
#${PANEL_ID} .mi-btn.primary{background:var(--accent,var(--ui-accent));border-color:var(--accent,var(--ui-accent));color:#fff}
#${PANEL_ID} .mi-btn.primary:hover{filter:brightness(1.06)}
`;

function ensureStyle() {
  if (document.getElementById('cp171-mathin-css')) return;
  const st = document.createElement('style');
  st.id = 'cp171-mathin-css';
  st.textContent = CSS;
  (document.head || document.documentElement).appendChild(st);
}

/* ---------- KaTeX 橋接 ---------------------------------------------------
 * 只用 window.katex，不去碰宿主 IIFE 內的 mathHTML()——那支不保證在 window 上。
 * 拿不到 katex 時整個面板仍可用（純原始碼編輯），只是預覽顯示提示。
 * ------------------------------------------------------------------------ */
function kx() { try { return window.katex || null; } catch (_) { return null; } }

function render(tex, display) {
  const k = kx();
  if (!k || typeof k.renderToString !== 'function') return { html: null, err: null, noEngine: true };
  let err = null;
  try { k.renderToString(String(tex), { displayMode: !!display, throwOnError: true, strict: false }); }
  catch (e) { err = (e && e.message) || String(e); }
  let html = '';
  try {
    html = k.renderToString(String(tex), {
      displayMode: !!display, throwOnError: false, strict: false, output: 'html'
    });
  } catch (_) { html = ''; }
  return { html, err, noEngine: false };
}

const glyphCache = Object.create(null);
function glyph(item) {
  const src = item.s || String(item.t).replace(/#\d/g, '\\square');
  if (glyphCache[src] !== undefined) return glyphCache[src];
  const r = render(src, false);
  glyphCache[src] = r.html || ('<span class="mi-raw">' + escapeHtml(src) + '</span>');
  return glyphCache[src];
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- 樣板展開 -----------------------------------------------------
 * #1 #2 #3 是位置標記：有選取就填進第一個，游標停在第一個還空著的標記。
 * ------------------------------------------------------------------------ */
function expand(tpl, sel) {
  let out = '', firstEmpty = -1, afterSel = -1, used = false;
  for (let i = 0; i < tpl.length; i++) {
    const c = tpl[i];
    if (c === '#' && /[0-9]/.test(tpl[i + 1] || '')) {
      if (sel && !used) { out += sel; used = true; afterSel = out.length; }
      else if (firstEmpty < 0) { firstEmpty = out.length; }
      i++; continue;
    }
    out += c;
  }
  const caret = firstEmpty >= 0 ? firstEmpty : (afterSel >= 0 ? afterSel : out.length);
  return { text: out, caret };
}

/* ---------- 面板 --------------------------------------------------------- */
let panel = null, curCat = 'common', mode = 'inline', prevTimer = 0;

function el(sel) { return panel ? panel.querySelector(sel) : null; }
function srcEl() { return el('.mi-src'); }

function panelEl() {
  if (panel && panel.isConnected) return panel;
  panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.hidden = true;
  panel.innerHTML =
      '<div class="mi-chips"></div>'
    + '<div class="mi-pal"></div>'
    + '<div class="mi-edit">'
    +   '<div class="mi-labrow">'
    +     '<label class="mi-label"></label>'
    +     '<span class="mi-spacer"></span>'
    +     '<button type="button" class="mi-raw-toggle" hidden></button>'
    +   '</div>'
    +   '<textarea class="mi-src" spellcheck="false" autocapitalize="off" autocomplete="off"></textarea>'
    + '</div>'
    + '<div class="mi-prev-wrap"><div class="mi-prev"></div><div class="mi-msg"></div></div>'
    + '<div class="mi-foot">'
    +   '<div class="mi-mode">'
    +     '<button type="button" data-mode="inline"></button>'
    +     '<button type="button" data-mode="block"></button>'
    +   '</div>'
    +   '<span class="mi-spacer"></span>'
    +   '<button type="button" class="mi-btn" data-act="clear"></button>'
    +   '<button type="button" class="mi-btn" data-act="cancel"></button>'
    +   '<button type="button" class="mi-btn primary" data-act="insert"></button>'
    + '</div>';
  document.body.appendChild(panel);
  panel.addEventListener('click', onPanelClick);
  /* 點符號鍵不要讓 textarea 失焦，否則插入位置會跑掉 */
  panel.addEventListener('mousedown', e => {
    if (e.target.closest('.mi-key, .mi-chip, .mi-btn, .mi-raw-toggle, .mi-mode button')) e.preventDefault();
  });
  const ta = srcEl();
  ta.addEventListener('input', schedulePreview);
  ta.addEventListener('keydown', e => {
    /* ⌘/Ctrl + Enter：直接插入。單純 Enter 保留給多行公式換行。 */
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); doInsert(); }
  });
  return panel;
}

function onPanelClick(e) {
  const chip = e.target.closest('.mi-chip');
  if (chip) { curCat = chip.dataset.cat; renderChips(); renderPalette(); return; }
  const key = e.target.closest('.mi-key');
  if (key) { pressKey(Number(key.dataset.i)); return; }
  const md = e.target.closest('.mi-mode button');
  if (md) { mode = md.dataset.mode; renderFoot(); schedulePreview(); return; }
  const rt = e.target.closest('.mi-raw-toggle');
  if (rt) { toggleRaw(); return; }
  const btn = e.target.closest('.mi-btn');
  if (!btn) return;
  if (btn.dataset.act === 'cancel') hidePanel();
  if (btn.dataset.act === 'clear') { setTex(''); focusSurface(); schedulePreview(); }
  if (btn.dataset.act === 'insert') doInsert();
}

function renderChips() {
  const box = el('.mi-chips');
  if (!box) return;
  box.textContent = '';
  for (const c of CATS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mi-chip' + (c.id === curCat ? ' on' : '');
    b.dataset.cat = c.id;
    b.textContent = T(c.label[0], c.label[1]);
    box.appendChild(b);
  }
}

function renderPalette() {
  const box = el('.mi-pal');
  if (!box) return;
  const cat = CATS.find(c => c.id === curCat) || CATS[0];
  box.textContent = '';
  cat.items.forEach((it, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mi-key';
    b.dataset.i = String(i);
    const tip = Array.isArray(it.k) ? T(it.k[0], it.k[1] || it.k[0]) : String(it.k || '');
    b.title = tip + '  ·  ' + String(it.t).replace(/#\d/g, '{ }').trim();
    b.setAttribute('aria-label', tip);
    b.innerHTML = glyph(it);
    box.appendChild(b);
  });
}

/* 我的樣板記號 #1 #2 #3 → MathLive 的記號：
   第一格用 #@（有選取就吃選取，沒有就變成空格），其餘用 #? （佔位符）。
   這是 MathLive 自己的鍵盤設定用的同一套慣例（例如 \frac{#@}{#?}），
   所以插入後的游標行為跟使用者按 MathLive 內建快捷鍵完全一致。 */
function toMLTemplate(tpl) {
  let first = true;
  return String(tpl).replace(/#\d/g, () => {
    if (first) { first = false; return '#@'; }
    return '#?';
  });
}

function pressKey(i) {
  const cat = CATS.find(c => c.id === curCat) || CATS[0];
  const it = cat.items[i];
  if (!it) return;

  if (surfaceKind() === 'mathlive' && mfEl) {
    try {
      mfEl.focus();
      mfEl.insert(toMLTemplate(it.t), {
        format: 'latex',
        insertionMode: 'replaceSelection',
        selectionMode: 'placeholder'
      });
    } catch (e) {
      K.log && K.log.warn && K.log.warn('mathinput',
        T('視覺面插入符號失敗','Symbol insert failed on visual surface'), e);
    }
    schedulePreview();
    return;
  }

  const ta = srcEl();
  const s = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
  const e2 = ta.selectionEnd == null ? s : ta.selectionEnd;
  const sel = ta.value.slice(s, e2);
  const r = expand(it.t, sel);
  ta.value = ta.value.slice(0, s) + r.text + ta.value.slice(e2);
  const pos = s + r.caret;
  ta.focus();
  try { ta.setSelectionRange(pos, pos); } catch (_) {}
  schedulePreview();
}

function schedulePreview() {
  if (prevTimer) clearTimeout(prevTimer);
  prevTimer = setTimeout(renderPreview, 70);
}

function renderPreview() {
  prevTimer = 0;
  const box = el('.mi-prev'), msg = el('.mi-msg');
  if (!box) return;
  const tex = getTex();

  /* 視覺面：math-field 自己就是預覽，不用再畫一次。但仍然拿 KaTeX 驗一次
     語法——因為稿子裡最後是 KaTeX 在渲染，MathLive 收得下、KaTeX 收不下的
     寫法（少數巨集）要在這裡就講出來，不要等插進去才發現。 */
  if (surfaceKind() === 'mathlive') {
    const r0 = tex.trim() ? render(tex, mode === 'block') : { err: null, noEngine: false };
    if (r0.err) {
      msg.className = 'mi-msg err';
      msg.textContent = T('這串在稿子裡可能排不出來：','This may not typeset in the document: ') + r0.err;
    } else {
      msg.className = 'mi-msg';
      msg.textContent = mode === 'block'
        ? T('會插成獨立一行、置中的公式（$$ … $$）','Inserts as a centred display equation ($$ … $$)')
        : T('會插在游標所在那句話裡（$ … $）','Inserts inside the current sentence ($ … $)');
    }
    return;
  }

  if (!tex.trim()) {
    box.classList.remove('err');
    box.innerHTML = '<span class="mi-empty">'
      + escapeHtml(T('（先點上面的符號，或直接打 LaTeX）','(Pick a symbol above, or type LaTeX)'))
      + '</span>';
    msg.className = 'mi-msg';
    msg.textContent = '';
    return;
  }
  const r = render(tex, mode === 'block');
  if (r.noEngine) {
    box.classList.remove('err');
    box.innerHTML = '<span class="mi-empty">'
      + escapeHtml(T('這個環境沒有數學排版引擎，預覽不可用（插入仍然正常）','No math engine in this environment — preview unavailable (insert still works)'))
      + '</span>';
    msg.className = 'mi-msg';
    msg.textContent = '';
    return;
  }
  box.classList.toggle('err', !!r.err);
  box.innerHTML = r.html || '';
  if (r.err) {
    msg.className = 'mi-msg err';
    msg.textContent = T('語法有問題：','Syntax problem: ') + r.err;
  } else {
    msg.className = 'mi-msg';
    msg.textContent = mode === 'block'
      ? T('會插成獨立一行、置中的公式（$$ … $$）','Inserts as a centred display equation ($$ … $$)')
      : T('會插在游標所在那句話裡（$ … $）','Inserts inside the current sentence ($ … $)');
  }
}

function renderFoot() {
  el('.mi-label').textContent = surfaceKind() === 'mathlive'
    ? T('公式（直接在上面打字，或點上面的符號）','Formula (type directly, or pick a symbol above)')
    : T('LaTeX 內容（不用自己打錢字號）','LaTeX body (no dollar signs needed)');
  const [a, b] = panel.querySelectorAll('.mi-mode button');
  a.textContent = T('行內','Inline');
  b.textContent = T('獨立一行','Display');
  a.classList.toggle('on', mode === 'inline');
  b.classList.toggle('on', mode === 'block');
  const btns = panel.querySelectorAll('.mi-foot .mi-btn');
  btns[0].textContent = T('清空','Clear');
  btns[1].textContent = T('取消','Cancel');
  btns[2].textContent = T('插入','Insert');
}

function openPanel(anchorBtn) {
  ensureStyle();
  /* ★ 1.1.5.9.1：一定要在 panelEl()／MathLive.focus() 之前保存「實際插入書籤」。
     只記 caretWasInEditor=true/false 不夠：math-field 一拿到焦點，宿主 editor 的
     blur handler 會 deactivate()，Selection 也移到 Shadow DOM；之後再問游標位置
     已經只能得到錯誤位置或文件尾。bookmark 保存的是 raw Markdown 座標。 */
  insertBookmark = captureInsertBookmark();
  caretWasInEditor = !!(insertBookmark && insertBookmark.kind !== 'fallback');
  const p = panelEl();
  if (!p.hidden) { hidePanel(); return; }
  upgradeSurface();
  renderChips(); renderPalette(); renderFoot();
  p.hidden = false;
  position(anchorBtn);
  renderPreview();
  try { focusSurface(); } catch (_) {}
  document.querySelectorAll('#ty-toolbar .' + MOUNT_CLASS + ' .tb-btn')
    .forEach(b => b.classList.add('mi-open'));
}

function hidePanel() {
  if (panel) panel.hidden = true;
  document.querySelectorAll('#ty-toolbar .' + MOUNT_CLASS + ' .tb-btn')
    .forEach(b => b.classList.remove('mi-open'));
}

function position(anchorBtn) {
  const p = panelEl();
  const r = anchorBtn && anchorBtn.getBoundingClientRect ? anchorBtn.getBoundingClientRect() : null;
  const vw = window.innerWidth || 1200, vh = window.innerHeight || 800;
  const pw = p.offsetWidth || 640, ph = p.offsetHeight || 460;
  let left = r ? r.left : 40, top = r ? r.bottom + 7 : 60;
  if (left + pw > vw - 10) left = Math.max(8, vw - pw - 10);
  if (top + ph > vh - 10) top = Math.max(8, vh - ph - 10);
  p.style.left = Math.round(left) + 'px';
  p.style.top = Math.round(top) + 'px';
}

/* ---------- 編輯面：視覺（MathLive）／原始碼（textarea）-------------------
 * 1.1.5.8.3 起 MathLive 0.110.0 已內嵌（cp171-58a／58b），所以預設走視覺面：
 * 直接在公式上打字，分數就是上下兩格，根號就是根號，不用先在腦子裡編譯。
 *
 * 為什麼還留著原始碼面：
 *   1. 從別的地方複製一整串 LaTeX 進來，貼進 textarea 比在 math-field 裡
 *      一格一格修容易得多。
 *   2. MathLive 沒載成功時（例如有人把 vendor 抽掉）面板還要能用。
 *   3. 有些人就是想看到源碼。切換鈕記在 rawMode，開關面板不會忘記。
 *
 * 兩面之間**永遠只有一個事實來源**：切換的當下把 LaTeX 從一邊搬到另一邊，
 * 之後就以顯示中的那一面為準。不同步兩份、不猜哪份比較新。
 * ------------------------------------------------------------------------ */
function hasMathLive() {
  try {
    return !!(window.customElements && window.customElements.get
      && window.customElements.get('math-field'));
  } catch (_) { return false; }
}

let rawMode = false;          /* true = 使用者手動切到原始碼面 */
let mfEl = null;              /* <math-field>，需要時才建立 */

/* 目前實際在用哪一面。MathLive 不在就永遠是 'raw'。 */
function surfaceKind() { return (hasMathLive() && !rawMode) ? 'mathlive' : 'raw'; }

function mfCreate() {
  if (mfEl && mfEl.isConnected) return mfEl;
  if (!hasMathLive()) return null;
  try {
    const mf = document.createElement('math-field');
    mf.className = 'mi-mf';
    /* 選單／虛擬鍵盤在單檔 HTML 裡是多餘的介面，關掉少一層干擾 */
    try { mf.mathVirtualKeyboardPolicy = 'manual'; } catch (_) {}
    mf.setAttribute('math-virtual-keyboard-policy', 'manual');
    mf.setAttribute('menu-editor', 'none');
    mf.addEventListener('input', schedulePreview);
    mf.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); doInsert(); }
      if (e.key === 'Escape') { e.preventDefault(); hidePanel(); }
    });
    const box = el('.mi-edit');
    if (!box) return null;
    box.appendChild(mf);
    mfEl = mf;
    return mf;
  } catch (e) {
    K.log && K.log.warn && K.log.warn('mathinput',
      T('建立 math-field 失敗，退回原始碼編輯面','math-field creation failed; falling back to raw editing'), e);
    return null;
  }
}

/* 讀出目前面上的 LaTeX。 */
function getTex() {
  if (surfaceKind() === 'mathlive' && mfEl) {
    try {
      const v = typeof mfEl.getValue === 'function' ? mfEl.getValue('latex') : mfEl.value;
      return typeof v === 'string' ? v : '';
    } catch (_) { return ''; }
  }
  const ta = srcEl();
  return ta ? ta.value : '';
}

/* 寫進目前面上。 */
function setTex(tex) {
  if (surfaceKind() === 'mathlive' && mfEl) {
    try {
      if (typeof mfEl.setValue === 'function') mfEl.setValue(String(tex || ''), { silenceNotifications: true });
      else mfEl.value = String(tex || '');
      return;
    } catch (_) {}
  }
  const ta = srcEl();
  if (ta) ta.value = String(tex || '');
}

function focusSurface() {
  try {
    if (surfaceKind() === 'mathlive' && mfEl) mfEl.focus();
    else { const ta = srcEl(); if (ta) ta.focus(); }
  } catch (_) {}
}

/* 依 surfaceKind() 決定誰顯示誰隱藏。預覽區只在原始碼面需要——
   視覺面本身就是預覽，再擺一個一模一樣的框只是浪費高度。 */
function applySurface() {
  const ta = srcEl(), pv = el('.mi-prev'), tg = el('.mi-raw-toggle');
  const useML = surfaceKind() === 'mathlive';
  if (useML) mfCreate();
  if (mfEl) mfEl.hidden = !useML;
  if (ta) ta.hidden = useML;
  if (pv) pv.hidden = useML;
  if (tg) {
    tg.hidden = !hasMathLive();       /* 沒有 MathLive 就沒有東西可切 */
    tg.classList.toggle('on', rawMode);
    tg.textContent = rawMode ? T('回到視覺編輯','Back to visual') : T('看／改原始碼','Edit LaTeX source');
    tg.title = rawMode
      ? T('切回可以直接在公式上打字的視覺編輯面','Switch back to the visual editing surface')
      : T('切成純 LaTeX 原始碼，貼一整串公式進來時比較好用','Switch to raw LaTeX — easier when pasting a whole formula in');
  }
}

/* 切換時把內容搬過去，避免使用者打到一半的東西不見。 */
function toggleRaw() {
  const before = getTex();
  rawMode = !rawMode;
  applySurface();
  setTex(before);
  renderFoot();
  focusSurface();
  schedulePreview();
}

/* 開面板時呼叫：MathLive 在就用視覺面，不在就安靜地用原始碼面。 */
function upgradeSurface() { applySurface(); }

/* ---------- 插入 ---------------------------------------------------------
 * ★ 1.1.5.8.2 修的真 bug（瀏覽器驗證抓到的）：
 *   宿主的 insertTextAtCaret() 在「編輯區沒有游標」時是 `if (!el) return;`
 *   ——**靜靜地什麼都不做**。使用者一開程式就點 ∑、填好公式、按插入，
 *   公式會憑空消失而且沒有任何提示。這是靜默資料遺失，比報錯嚴重。
 *
 *   兩道防線：
 *     1. 開面板時（在把焦點搶去 textarea 之前）先記下編輯區有沒有游標；
 *        沒有就不要走 caret 路徑，改用 insertParagraphSyntax()——
 *        它在 activeIndex < 0 時會回退到最後一個區塊，永遠會落地。
 *     2. 插完再比對一次文件內容真的變了；沒變就補一次段落插入。
 *        這一道不靠任何對宿主內部狀態的猜測，是最後的保險。
 * ------------------------------------------------------------------------ */
let caretWasInEditor = false;
let insertBookmark = null;

/* 把「畫面上的一個 DOM 端點」換成該 block 的 raw Markdown 位移。
   啟用態 block 的 textContent 本身就是 raw；渲染態則優先沿用宿主既有的
   renderedPointToRaw()，失敗才退到 visibleToRaw()。 */
function rawPointForBlock(el, i, node, off) {
  try {
    if (typeof activeIndex !== 'undefined' && activeIndex === i && el.classList.contains('active'))
      return typeof offsetInBlock === 'function' ? offsetInBlock(el, node, off) : caretOffsetIn(el);
  } catch (_) {}
  try {
    if (typeof renderedPointToRaw === 'function') {
      const p = renderedPointToRaw(el, blocks[i] ?? '', node, off);
      if (p && typeof p.off === 'number') return p.off;
      if (p && p.tok) {
        /* 游標真的落在 token 內部時宿主通常早已打開就地編輯；這裡只是防禦性
           備援，取靠近端點的一側，至少不會跳到文件尾。 */
        return Number.isFinite(p.tok.start) ? p.tok.start : 0;
      }
    }
  } catch (_) {}
  try {
    const v = typeof offsetInBlock === 'function' ? offsetInBlock(el, node, off) : 0;
    return typeof visibleToRaw === 'function' ? visibleToRaw(blocks[i] ?? '', v) : v;
  } catch (_) { return 0; }
}

/* 開面板前保存插入位置。支援普通 Markdown、Paper 浮動 textarea、Source mode。
   回傳的 s/e 一律是原始文字位移；文件本身在面板開著期間不會因 MathLive 編輯而
   改變，所以 index + raw offset 是比 DOM Range 更耐久的書籤。 */
function captureInsertBookmark() {
  try {
    if (typeof settings !== 'undefined' && settings.srcmode) {
      const sv = document.getElementById('srcview');
      if (sv) return { kind:'source', s:sv.selectionStart || 0, e:sv.selectionEnd || sv.selectionStart || 0 };
    }
  } catch (_) {}
  try {
    const pe = document.getElementById('pe-text');
    if (pe && typeof peIndex !== 'undefined' && peIndex >= 0 && document.activeElement === pe)
      return { kind:'block', i:peIndex, s:pe.selectionStart || 0, e:pe.selectionEnd || pe.selectionStart || 0, paper:true };
  } catch (_) {}
  try {
    const sel = window.getSelection && window.getSelection();
    let el = null, i = -1;
    if (sel && sel.rangeCount) {
      const r = sel.getRangeAt(0);
      el = typeof blockElOf === 'function' ? blockElOf(r.startContainer) : null;
      if (el && document.getElementById('editor')?.contains(el)) {
        i = typeof blockIndexOf === 'function' ? blockIndexOf(el) : [...editor.children].indexOf(el);
        let s = rawPointForBlock(el, i, r.startContainer, r.startOffset);
        let e = s;
        const eel = typeof blockElOf === 'function' ? blockElOf(r.endContainer) : null;
        if (eel === el) e = rawPointForBlock(el, i, r.endContainer, r.endOffset);
        if (e < s) [s, e] = [e, s];
        return { kind:'block', i, s, e };
      }
    }
    if (typeof activeIndex !== 'undefined' && activeIndex >= 0 && editor.children[activeIndex]) {
      el = editor.children[activeIndex]; i = activeIndex;
      let c = 0;
      try { c = caretOffsetIn(el); } catch (_) { c = String(blocks[i] ?? '').length; }
      return { kind:'block', i, s:c, e:c };
    }
  } catch (_) {}
  return { kind:'fallback' };
}

function clampBookmark(bm) {
  if (!bm || bm.kind !== 'block' || typeof blocks === 'undefined' || !blocks.length) return null;
  const i = Math.max(0, Math.min(blocks.length - 1, Number(bm.i) || 0));
  const n = String(blocks[i] ?? '').length;
  const s = Math.max(0, Math.min(n, Number(bm.s) || 0));
  const e = Math.max(s, Math.min(n, Number(bm.e) || s));
  return { kind:'block', i, s, e };
}

function makeBlockEl(src) {
  const el = document.createElement('div');
  el.className = 'block';
  el.innerHTML = renderBlockHTML(src);
  return el;
}

/* 直接以 raw bookmark 修改 canonical blocks，不再依賴目前 Selection。
   這能避開 MathLive focus → editor blur → activeIndex=-1 的競態。 */
function insertInlineAtBookmark(text) {
  const bm = clampBookmark(insertBookmark);
  if (!bm) return false;
  try {
    pushUndo();
    deactivate(true);
    const src = String(blocks[bm.i] ?? '');
    const next = src.slice(0, bm.s) + text + src.slice(bm.e);
    blocks[bm.i] = next;
    rerender(bm.i);
    activate(bm.i, bm.s + text.length);
    onEdited(); updateBlockInfo(); schedulePaginate();
    return true;
  } catch (e) {
    K.log && K.log.error && K.log.error('mathinput', T('書籤行內插入失敗','Bookmarked inline insert failed'), e);
    return false;
  }
}

/* display 公式必須是獨立 block。若書籤在段落中間，將原 block 精確切成
   前半段 / 公式 / 後半段；游標在段首或段尾則只在相鄰位置插入，不把公式丟到
   文件尾端。 */
function insertDisplayAtBookmark(text) {
  const bm = clampBookmark(insertBookmark);
  if (!bm) return false;
  try {
    pushUndo();
    deactivate(true);
    const src = String(blocks[bm.i] ?? '');
    const left = src.slice(0, bm.s), right = src.slice(bm.e);
    let parts, focusRel, focusOff;
    if (left && right) { parts = [left, text, right]; focusRel = 2; focusOff = 0; }
    else if (left) { parts = [left, text]; focusRel = 1; focusOff = text.length; }
    else if (right) { parts = [text, right]; focusRel = 1; focusOff = 0; }
    else { parts = [text, '']; focusRel = 1; focusOff = 0; }

    blocks.splice(bm.i, 1, ...parts);
    const old = editor.children[bm.i];
    const frag = document.createDocumentFragment();
    parts.forEach(x => frag.appendChild(makeBlockEl(x)));
    if (old) old.replaceWith(frag); else editor.appendChild(frag);
    activate(bm.i + focusRel, focusOff);
    onEdited(); updateBlockInfo(); schedulePaginate();
    return true;
  } catch (e) {
    K.log && K.log.error && K.log.error('mathinput', T('書籤區塊插入失敗','Bookmarked display insert failed'), e);
    return false;
  }
}

function insertSourceAtBookmark(text, display) {
  if (!insertBookmark || insertBookmark.kind !== 'source') return false;
  const sv = document.getElementById('srcview');
  if (!sv) return false;
  try {
    let payload = text;
    if (display) payload = '\n\n' + text + '\n\n';
    const s = Math.max(0, Math.min(sv.value.length, insertBookmark.s || 0));
    const e = Math.max(s, Math.min(sv.value.length, insertBookmark.e || s));
    sv.setRangeText(payload, s, e, 'end');
    sv.dispatchEvent(new Event('input', { bubbles:true }));
    sv.focus();
    return true;
  } catch (_) { return false; }
}


function docSnapshot() {
  try {
    if (typeof window.getMarkdown === 'function') return window.getMarkdown();
  } catch (_) {}
  return null;
}

function doInsert() {
  const tex = getTex().trim();
  if (!tex) { hidePanel(); return; }
  /* 使用者可能自己把錢字號打進來了，去掉避免變成 $$x$$ 疊兩層 */
  const body = tex.replace(/^\$\$?/, '').replace(/\$\$?$/, '').trim();
  if (!body) { hidePanel(); return; }

  const para = typeof window.insertParagraphSyntax === 'function' ? window.insertParagraphSyntax : null;
  const caret = typeof window.insertTextAtCaret === 'function' ? window.insertTextAtCaret : null;
  if (!para && !caret) {
    K.log && K.log.error && K.log.error('mathinput', T('找不到宿主插入函式','Host insert function not found'));
    return;
  }

  const before = docSnapshot();
  let inserted = false;
  try {
    if (mode === 'block') {
      const text = '$$\n' + body + '\n$$';
      inserted = insertSourceAtBookmark(text, true) || insertDisplayAtBookmark(text);
      if (!inserted) { if (para) { para(text); inserted = true; } else { caret('\n' + text + '\n'); inserted = true; } }
    } else {
      const text = '$' + body + '$';
      inserted = insertSourceAtBookmark(text, false) || insertInlineAtBookmark(text);
      if (!inserted) {
        if (caret && caretWasInEditor) { caret(text); inserted = true; }
        else if (para) { para(text); inserted = true; }
        else { caret(text); inserted = true; }
      }
    }
  } catch (e) {
    K.log && K.log.error && K.log.error('mathinput', T('插入失敗','Insert failed'), e);
    return;
  }

  /* 最後一道防線：若 canonical 文件完全沒變，才走舊的獨立段落 fallback。
     Source mode 的 input 同步可能是非同步，故只在非 source bookmark 時檢查。 */
  const after = docSnapshot();
  if (insertBookmark?.kind !== 'source' && before !== null && after !== null && before === after) {
    try {
      const text = mode === 'block' ? '$$\n' + body + '\n$$' : '$' + body + '$';
      if (para) para(text);
      K.log && K.log.warn && K.log.warn('mathinput',
        T('書籤插入沒有改變文件，已改為插成獨立段落','Bookmarked insert did not change the document; inserted as its own paragraph'));
    } catch (e2) {
      K.log && K.log.error && K.log.error('mathinput', T('補插失敗','Fallback insert failed'), e2);
      return;
    }
  }
  insertBookmark = null;
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
  const grp = document.createElement('div');
  grp.className = MOUNT_CLASS;
  grp.setAttribute('aria-label', T('公式輸入','Formula input'));
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tb-btn';
  /* ★ CP171-59.1：跟 REV/TW_THESIS 同一顆坑——沒有 data-action，#ty-toolbar 的
     delegated mouseover（tbTipShow）永遠認不到這顆鈕，使用者就只看得到
     瀏覽器原生 title 提示（慢、樣式不對）。data-zh/data-en 跟下面 title
     用的是同一份文字，兩邊不會不同步。action id 用 mi- 前綴避免撞名。 */
  b.dataset.action = 'mi-open';
  b.setAttribute('data-zh', '公式輸入（點符號、看預覽、再插入）');
  b.setAttribute('data-en', 'Formula input (pick symbols, preview, insert)');
  /* 1.2.7：與工具列同一套圖示（M33）；取不到時退回文字 ∑ */
  if (typeof window.ekdIcon === 'function') b.innerHTML = window.ekdIcon('sigma'); else b.textContent = '∑';
  b.title = T('公式輸入（點符號、看預覽、再插入）','Formula input (pick symbols, preview, insert)');
  b.setAttribute('aria-label', T('公式輸入','Formula input'));
  b.addEventListener('mousedown', e => e.preventDefault());   /* 保住編輯區選取 */
  b.addEventListener('click', () => openPanel(b));
  grp.appendChild(b);
  /* 排在論文語法工具列（REV／TW_THESIS）之前；沒有它就排在收納鈕之前。 */
  const pt = row.querySelector('.cp171-ptools-group');
  const more = row.querySelector('.tb-more-btn');
  if (pt) row.insertBefore(grp, pt);
  else if (more) row.insertBefore(grp, more);
  else row.appendChild(grp);
}

function watch() {
  const bar = document.getElementById('ty-toolbar');
  if (!bar) return;
  try { new MutationObserver(() => { mount(); }).observe(bar, { childList: true }); }
  catch (_) { /* 測試環境沒有 MutationObserver：靠下面的輪詢 */ }
}

function boot() {
  mount(); watch();
  let n = 0;
  const iv = setInterval(() => { mount(); if (++n > 40) clearInterval(iv); }, 500);
}

try {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
} catch (e) { K.log && K.log.error && K.log.error('mathinput', T('boot 失敗','Boot failed'), e); }

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && panel && !panel.hidden) { hidePanel(); e.stopPropagation(); }
}, true);
document.addEventListener('mousedown', e => {
  if (!panel || panel.hidden) return;
  if (panel.contains(e.target)) return;
  if (e.target.closest && e.target.closest('#ty-toolbar .' + MOUNT_CLASS)) return;
  hidePanel();
}, true);

/* 對外只暴露最小介面，供診斷模組與驗證腳本使用 */
try {
  window.__CP171_MATHIN__ = {
    open: () => openPanel(document.querySelector('#ty-toolbar .' + MOUNT_CLASS + ' .tb-btn')),
    close: hidePanel,
    cats: () => CATS.map(c => ({ id: c.id, n: c.items.length })),
    engine: () => (kx() ? 'katex' : (hasMathLive() ? 'mathlive' : 'none')),
    /* 目前實際在用的編輯面：'mathlive'（可視化）或 'raw'（LaTeX 原始碼） */
    surface: surfaceKind,
    /* 有沒有 MathLive 可用（與是否正在用它是兩回事） */
    mathlive: () => hasMathLive(),
    /* 讓驗證腳本可以不透過鍵盤就切換與讀寫，避免斷言綁在中文標籤上 */
    setRaw: v => { if (!!v !== rawMode) toggleRaw(); return rawMode; },
    tex: getTex,
    setTex,
    expand
  };
} catch (_) {}

})();
