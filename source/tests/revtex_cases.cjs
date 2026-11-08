/* 國際論文模式（Markdown → REVTeX 4.2）回歸案例。
 *
 * 來源：1.2.6 徹查三份報告的全部案例——B（解析器，263 案）、A（官方規範，A-xx）、
 * C（發射器，C-xx）——加上這次修正新增的案例（D-xx）。
 *
 * 每個案例：{ id, md, settings?, purpose?, tex?, notex?, pdf?, nopdf?, pdfraw?, cite?, qq?, bibtex?, left? }
 *   tex / notex     發射出的 main.tex 必須含／不含（字串或 RegExp）——node 就能檢查
 *   pdf / nopdf     pdflatex 編譯後的 PDF 文字（空白合併、引號破折號正規化）必須含／不含
 *   pdfraw          PDF 原始文字（不正規化引號）必須含，用來檢查引號方向
 *   cite            允許 PDF 出現 [?]（有引用卻沒書目、或需要 BibTeX 的案例）
 *   qq              允許 PDF 出現 ??（故意引用不存在的標籤）
 *   left            左邊編輯器與解析器的一致性檢查：'same' 表示兩邊的數學、程式碼、
 *                   強調區段必須一致（只對單行行內案例有意義）
 *
 * 只讀不寫；被 revtex_emit_checks.cjs（純 node）與 revtex_pdflatex_matrix.cjs（需要 pdflatex）使用。
 */
'use strict';
const C = [];
const add = (id, md, x) => C.push(Object.assign({ id, md }, x || {}));
const FM = '```revtex-frontmatter\ntitle: T\nauthor: A\naffiliation: X\n```\n\n```revtex-abstract\nAbs.\n```\n\n';

/* ===================== B：數學 ===================== */
add('M01', 'Value $333$ end.', { tex: ['$333$'], left: 'same' });
add('M02', 'Price is $5 and $10 total.', { tex: ['\\$5 and \\$10'], pdf: ['Price is $5 and $10 total.'], left: 'same' });
add('M03', 'Cost $5,$10 maybe.', { tex: ['\\$5,\\$10'], pdf: ['Cost $5,$10 maybe.'], left: 'same' });
add('M04', 'It costs $20.', { pdf: ['It costs $20.'], left: 'same' });
add('M05', 'Between $a$1 and x.', { tex: ['\\$a\\$1'], left: 'same' });
add('M06', 'Escaped \\$5 and \\$6 prices.', { pdf: ['Escaped $5 and $6 prices.'], left: 'same' });
add('M07', 'Inline $$x^2$$ here.', { tex: ['\\[x^2\\]'], nopdf: ['$'], left: 'same' });
add('M08', 'Inline \\(x^2\\) here.', { tex: ['$x^2$'], nopdf: ['(x'], left: 'same' });
add('M09', '$$\nE=mc^2\n$$', { tex: ['\\begin{equation}', 'E=mc^2'] });
add('M10', '$$E=mc^2$$', { tex: ['E=mc^2'], pdf: ['(1)'] });
add('M11', '\\[\nx=1\n\\]', { tex: ['x=1', '\\begin{equation}'] });
add('M12', '```math\nx=1\n```', { tex: ['\\begin{equation}'], notex: ['verbatim'] });
add('M13', '$$\nE=mc^2 {#eq:energy}\n$$\n\nSee [@eq:energy] and \\ref{eq:energy}.', { tex: ['\\label{eq:energy}', '\\eqref{eq:energy}'], notex: [/\{#eq/], pdf: ['See (1) and 1.'] });
add('M14', 'Text $ x $ text.', { pdf: ['Text $ x $ text.'], left: 'same' });
add('M15', 'Use $a$ and $b$ and $c$.', { tex: ['$a$ and $b$ and $c$'], left: 'same' });
add('M16', 'Value $x_1 + y_2$ and snake_case_name.', { tex: ['$x_1 + y_2$', 'snake\\_case\\_name'], left: 'same' });
add('M17', 'the snake_case value $a_b$ ok', { tex: ['snake\\_case value $a_b$ ok'], notex: ['\\textit'], left: 'same' });
add('M18', 'Fig *a $x*y$ b* end', { tex: ['\\textit{a $x*y$ b}'], left: 'same' });
add('M19', 'Math $a*b*c$ and *emph*.', { tex: ['$a*b*c$', '\\textit{emph}'], left: 'same' });
add('M20', 'Math in code `$x$` and `\\alpha`.', { tex: ['\\texttt{\\$x\\$}', '\\texttt{{\\char92}alpha}'], pdf: ['$x$', '\\alpha'], left: 'same' });
add('M21', 'Price: $5. Then $x$ later.', { left: 'same' });
add('M22', 'Math with brace $\\{a\\}$ and \\% sign.', { pdf: ['% sign'], left: 'same' });
add('M23', 'Dollar at end $x$.', { tex: ['$x$.'], left: 'same' });
add('M24', 'Unicode $α+β$ and α β directly.', { tex: ['\\alpha', '\\beta'], notex: ['α'] });
add('M25', '$$\n\\begin{aligned}a&=b\\\\c&=d\\end{aligned}\n$$ {#eq:al}', { tex: ['\\begin{equation}\\label{eq:al}', '\\begin{aligned}'] });
add('M26', 'Text before $$x=1$$ after text.', { tex: ['\\[x=1\\]'], pdf: ['Text before', 'after text.'], nopdf: ['$'], left: 'same' });
add('M27', 'Line $a\n+b$ end.', {});
add('M28', '$$\nx = 1 \\label{eq:one}\n$$\n\nRef \\eqref{eq:one}.', { tex: ['\\label{eq:one}'], pdf: ['Ref (1).'] });
add('M29', 'Check $|x|$ and $a\\$b$ ok.', { left: 'same' });
add('M30', 'Total is 5$ and 6$ ok.', { pdf: ['Total is 5$ and 6$ ok.'], left: 'same' });

/* ===================== B：強調 ===================== */
add('E01', 'snake_case_name here', { tex: ['snake\\_case\\_name here'], notex: ['\\textit'], left: 'same' });
add('E02', '__init__ and _x_ and *y*.', { tex: ['\\textbf{init}', '\\textit{x}', '\\textit{y}'], left: 'same' });
add('E03', '**bold** and *it* and ~~del~~.', { tex: ['\\textbf{bold}', '\\textit{it}', '\\sout{del}'], left: 'same' });
/* CommonMark：* 在單字中間可以是強調，2*3*4 = 2、斜體 3、4（左邊畫面同樣）。 */
add('E04', '2*3*4 equals 24.', { tex: ['2\\textit{3}4'], left: 'same' });
add('E05', 'a * b * c spaced stars.', { pdf: ['a * b * c spaced stars.'], notex: ['\\textit'], left: 'same' });
add('E06', '***both*** and **_mix_**.', { tex: [/\\textit\{\\textbf\{both\}\}|\\textbf\{\\textit\{both\}\}/, '\\textbf{\\textit{mix}}'], nopdf: ['*'], left: 'same' });
add('E07', 'file_name.txt and file_name_2.txt', { tex: ['file\\_name.txt and file\\_name\\_2.txt'], notex: ['\\textit'], left: 'same' });
add('E08', '5 ~ 10 and ~~x~~ and H~2~O.', { tex: ['\\sout{x}'] });
add('E09', 'This is *not closed and 3 * 4', { pdf: ['This is *not closed and 3 * 4'], notex: ['\\textit'], left: 'same' });
add('E10', 'Use `**not bold**` code.', { pdf: ['**not bold**'], left: 'same' });
add('E11', '**bold with `code` inside** done', { tex: ['\\textbf{bold with \\texttt{code} inside}'], left: 'same' });
add('E12', '**a**b and a**b**c intraword', { tex: ['\\textbf{a}b', 'a\\textbf{b}c'], left: 'same' });
add('E13', 'x_1 and y_2 are variables.', { tex: ['x\\_1 and y\\_2'], notex: ['\\textit'], left: 'same' });
add('E14', '*a\nb* spans lines', { tex: ['\\textit{a\nb}'] });
add('E15', '**Fig. 1** _Note_: x * y', { tex: ['\\textbf{Fig. 1}', '\\textit{Note}'], left: 'same' });
add('E16', '==highlight== text and a==b', { tex: ['\\hl{highlight}'], left: 'same' });
add('E17', '\\*literal\\* and \\_under\\_', { pdf: ['*literal*'], notex: ['\\textit'], left: 'same' });

/* ===================== B：行內程式碼 ===================== */
add('C01', 'Run `a_b % c & d` now.', { tex: ['\\texttt{a{\\char95}b \\% c \\& d}'], notex: ['\\verb'], pdf: ['% c & d'], left: 'same' });
add('C02', 'Run `x \\ y` and `{}` now.', { notex: ['\\verb'], pdf: ['x \\ y', '{}'], left: 'same' });
add('C03', 'Use ``a ` b`` double ticks.', { tex: ['\\texttt{a ` b}'], left: 'same' });
add('C04', 'Pipe `a|b` and `!` and `+` and `/`.', { pdf: ['a|b'], notex: ['\\verb'], left: 'same' });
add('C05', 'All delims `|!+/@"?|!+/@"?`.', { notex: ['\\verb'], left: 'same' });
add('C06', 'Tilde `~` caret `^` hash `#`.', { pdf: ['~', '^', '#'], notex: ['\\verb'], left: 'same' });
add('C07', 'Unclosed `code here', { pdf: ['code here'], left: 'same' });
add('C08', 'Code `` ` `` single.', { tex: ['\\texttt{`}'], left: 'same' });
add('C09', 'In footnote ^[see `a_b` and \\verb] x.', { notex: [/\\verb[|!+]/], pdf: ['see a'] });

/* ===================== B：連結 ===================== */
add('L01', 'See [site](http://a.com/x_y%20z#frag?q=1&r=2~t) now.', { tex: ['\\href{http://a.com/x_y\\%20z\\#frag?q=1\\&r=2~t}{site}'], pdf: ['See site now.'] });
add('L02', 'Bare http://a.com/x_y_z%20w#h?q=1&r=2~t end.', { tex: ['\\url{http://a.com/x_y_z\\%20w\\#h?q=1\\&r=2~t}'], notex: ['\\textit'] });
add('L03', 'Auto <http://a.com/x_y_z%41#h&b~c> end.', { tex: ['\\url{'], nopdf: ['¡', '<http'] });
add('L04', 'Mail <me@a.com> and [m](mailto:me@a.com).', { tex: ['\\href{mailto:me@a.com}'], pdf: ['me@a.com'] });
add('L05', 'See [text with *emph*](http://a.com).', { tex: ['\\href{http://a.com}{text with \\textit{emph}}'], left: 'same' });
add('L06', 'See [a](http://a.com "Title here").', { tex: ['\\href{http://a.com}{a}'], nopdf: ['Title here'] });
add('L07', 'See [a](<http://a.com/a b>).', { tex: ['\\href{http://a.com/a\\%20b}{a}'] });
add('L08', 'See [a](http://a.com/(x)).', { tex: ['\\href{http://a.com/(x)}{a}'] });
add('L09', 'See [a][ref] and\n\n[ref]: http://a.com', {});
add('L10', 'See [#sec](#sec-intro) anchor.', { tex: ['\\hyperref[sec-intro]'], qq: true });
add('L11', 'Link [a_b](http://a.com/a_b) text.', { tex: ['\\href{http://a.com/a_b}{a\\_b}'], left: 'same' });
add('L12', 'See <a href="http://a.com/x_y">html link</a>.', { tex: ['\\href{http://a.com/x_y}{html link}'] });
add('L13', '[http://a.com/x_y](http://a.com/x_y)', { tex: ['\\url{http://a.com/x_y}'] });
add('L14', 'Percent [x](http://a.com/100%) end.', { tex: ['\\href{http://a.com/100\\%}{x}'] });
add('L15', 'Hash [x](http://a.com/#top) end.', { tex: ['\\href{http://a.com/\\#top}{x}'] });

/* ===================== B：圖片 ===================== */
add('I01', '![A caption](fig1.png)', { tex: ['\\caption{A caption}'], pdf: ['FIG. 1. A caption'] });
add('I02', '![A caption](fig1.png "Title")', { pdf: ['FIG. 1. A caption'] });
add('I03', '![Cap *x* $a_b$](fig1.png){#fig:one}\n\nSee [@fig:one].', { tex: ['\\caption{\\label{fig:one}Cap \\textit{x} $a_b$}'], pdf: ['See 1.'] });
add('I04', '<img src="fig1.png" alt="Z" style="zoom:50%;" />', { tex: ['0.5\\columnwidth'] });
add('I05', '![wide](fig1.png "Wide*")', { tex: ['\\begin{figure*}'] });
add('I06', '![x](my fig 1.png)', { tex: [/ekd-assets\/my-fig-1-[a-z0-9]+\.png/] });
add('I07', '![x](fig_1.png)', { tex: ['{fig_1.png}'] });
add('I08', 'Inline ![x](fig1.png) in text.', { tex: ['0.4\\columnwidth'] });
add('I09', '![x](fig1.png){width=50%}', { tex: ['0.5\\columnwidth'], notex: ['{width'] });
add('I10', '![x](dir/fig%201.png)', { tex: [/ekd-assets\/fig-201-[a-z0-9]+\.png/] });
add('I11', '![](fig1.png)', {});
add('I12', '![x](fig1.PNG)', { tex: [/ekd-assets\/fig1-[a-z0-9]+\.png/] });
add('I13', '![x](fig.v2.png)', { tex: ['{fig.v2.png}'] });
add('I14', '![a % b & c](fig1.png)', { pdf: ['a % b & c'] });

/* ===================== B：腳註 ===================== */
add('F01', 'Text[^1] more.\n\n[^1]: The note.', { tex: ['\\footnote{The note.}', 'nofootinbib'], pdf: ['The note.'] });
add('F02', 'Text^[inline note with $x_1$] more.', { pdf: ['inline note with'] });
add('F03', 'Text[^a] more.\n\n[^a]: Para one.\n\n    Para two.', { pdf: ['Para one.', 'Para two.'] });
add('F04', 'Text[^a] more.\n\n[^a]: Note with `code` and **bold** and $x$.', { tex: ['\\texttt{code}', '\\textbf{bold}'], pdf: ['Note with code and bold'] });
add('F05', 'Text[^2] more.', { pdf: ['Text more.'] });
add('F06', '# Title[^1]\n\n[^1]: n', { tex: ['\\section{Title}'], notex: [/\\footnote\{/] });
add('F07', 'x^[a [b] c] y', { pdf: ['a [b] c'] });
add('F08', 'x^2 and x^[1] and ^caret', {});
add('F09', 'Text[^1] and again[^1].\n\n[^1]: Once.', { tex: ['\\footnotemark[1]'] });
add('F10', '| a |\n|---|\n| c[^1] |\n\n[^1]: in table', { pdf: ['in table'] });

/* ===================== B：引用與交叉引用 ===================== */
add('R01', 'As shown [[1]], [[2, 3]] and [[4-6]].', { tex: ['\\cite{1}', '\\cite{2,3}', '\\cite{4,5,6}'], cite: true });
add('R02', 'As shown [@key1] and [@a; @b] done.', { tex: ['\\cite{key1}', '\\cite{a,b}'], cite: true });
add('R03', 'As \\cite{a,b} and \\ref{x} and \\eqref{y}.', { cite: true, qq: true });
add('R04', 'See [@fig:one] and [@tbl:t] and [@eq:e] and [@sec:s].', { qq: true });
add('R05', 'See @key and [-@key] and [@key, p. 3].', { tex: ['\\cite[p.~3]{key}'], notex: ['p. 3}'], cite: true });
add('R06', 'Ref [1] numeric single.', { pdf: ['Ref [1] numeric single.'] });
add('R07', 'Ref [[a]] non-numeric.', {});
add('R08', '# Intro {#sec:intro}\n\nSee [@sec:intro].', { tex: ['\\hyperref[sec:intro]{Intro}'], pdf: ['See Intro.'] });
add('R09', '# Intro {#sec:intro}\n\nSee [Section](#sec:intro).', { tex: ['\\hyperref[sec:intro]{Section}'], pdf: ['See Section.'] });
add('R10', '# Unnumbered {-}\n\n## Also {.unnumbered}', { tex: ['\\section*{Unnumbered}', '\\subsection*{Also}'] });
add('R11', '## Title with `code` and $x$ {#sec:a}', { tex: ['\\subsection{Title with \\texttt{code} and $x$}', '\\label{sec:a}'] });
add('R12', 'Ref [@key_with_underscore] and [@a.b:c].', { tex: ['\\cite{key_with_underscore}', '\\cite{a.b:c}'], cite: true, left: 'same' });
add('R13', 'Ref [[1]] [[ 2 ]] [[1,2]] [[1–3]].', { cite: true });
add('R14', 'Ref (see [@a]) and [@a, @b].', { tex: ['\\cite{a,b}'], cite: true });

/* ===================== B：標題 ===================== */
add('H01', '# H1\n\n## H2\n\n### H3\n\n#### H4\n\n##### H5\n\n###### H6', { notex: ['\\subparagraph'] });
add('H02', 'Setext\n======\n\nSub\n---', { tex: ['\\section{Setext}', '\\subsection{Sub}'] });
add('H03', '#NoSpace heading', { tex: ['\\section{NoSpace heading}'] });
add('H04', '# Heading with trailing hashes ##', { tex: ['\\section{Heading with trailing hashes}'] });
add('H05', '# C# language and F#', { tex: ['\\section{C\\# language and F\\#}'] });
add('H06', '# Heading with # inside # more', { tex: ['\\section{Heading with \\# inside \\# more}'] });
add('H07', '# Title with _under_score and 50% & more', { tex: ['50\\% \\& more'] });
add('H08', '# 標題 中文 $x$', {});

/* ===================== B：清單 ===================== */
add('S01', '- a\n- b\n  - c\n  - d\n- e', {});
add('S02', '3. three\n4. four\n5. five', { tex: ['\\setcounter{enumi}{2}'], pdf: ['3. three'] });
add('S03', '1) a\n2) b', { tex: ['\\begin{enumerate}'] });
add('S04', '- [ ] todo\n- [x] done', { tex: ['\\item[$\\square$]', '\\usepackage{amssymb}'] });
add('S05', '1. a\n   1. b\n   2. c\n2. d', {});
add('S06', '- a\n\n- b\n\n- c', {});
add('S07', '- item with $x_1$ and `code`\n  continued line', { pdf: ['continued line'] });
add('S08', '- a\n    - b\n        - c\n            - d\n                - e', { pdf: ['e'] });
add('S09', 'Paragraph text\n- immediately list', { tex: ['\\begin{itemize}'] });
add('S10', '* star\n+ plus\n- dash', {});
add('S11', '1. a\n\n   para in item\n\n2. b', { pdf: ['para in item'] });
add('S12', '- a\n  ```\n  code\n  ```\n- b', {});
add('S13', '- a\n  > quote in item', {});
add('S14', '10. ten\n11. eleven', { pdf: ['10. ten'] });
add('S15', '1. one\n1. one again\n1. and again', { pdf: ['3. and again'] });
add('S16', '0. zero\n1. one', { pdf: ['0. zero'] });

/* ===================== B：引用塊 ===================== */
add('Q01', '> quote line one\n> line two', { tex: ['\\begin{quotation}'] });
add('Q02', '> outer\n>> nested inner', {});
add('Q03', '> # Heading in quote\n> text', {});
add('Q04', '> - a\n> - b', {});
add('Q05', '> **bold** $x$', {});
add('Q06', '> a\n\n> b', {});
add('Q07', '> quote\nlazy continuation', { tex: ['quote\nlazy continuation'] });

/* ===================== B：表格 ===================== */
add('T01', '| A | B |\n|:--|--:|\n| 1 | 2 |', { tex: ['{lr}'] });
add('T02', '| A | B |\n|---|---|\n| `a|b` | c |', { tex: ['\\texttt{a|b} & c'] });
add('T03', '| A | B |\n|---|---|\n| $|x|$ | c |', { tex: ['$|x|$ & c'] });
add('T04', '| A | B |\n|---|---|\n| a \\| b | c |', { tex: ['a \\textbar{} b & c'], pdf: ['a | b'] });
add('T05', '| A | B |\n|---|---|\n| $x_1$ and 50% & a_b | c |', { tex: ['50\\% \\& a\\_b & c'] });
add('T06', '| A | B |\n|---|---|\n| cost $5 | price $6 |', { tex: ['cost \\$5 & price \\$6'] });
add('T07', 'A | B\n---|---\n1 | 2', { tex: ['\\begin{tabular}'] });
add('T08', '| A | B | C |\n|---|---|---|\n| 1 | 2 |\n| 1 | 2 | 3 | 4 |', {});
add('T09', '| A | B |\n|---|---|\n| 1 | 2 |\n\nTable: caption {#tbl:t}', { tex: ['\\caption{\\label{tbl:t}caption}'], pdf: ['TABLE I. caption'] });
add('T10', '| A | B |\n|---|---|\n| 1 | 2 |\n: caption {#tbl:t}', { tex: ['\\caption{\\label{tbl:t}caption}'] });
add('T11', '| A | B |\n|---|---|\n| **b** | *i* |\n| `c` | [l](http://a.com) |', {});
add('T12', '| A | B |\n|:-:|:-:|\n| 中文 | 日本語 |', {});
add('T13', '| A | B |\n|---|---|\n| a<br>b | c |', { tex: ['\\begin{tabular}[t]{@{}l@{}}a \\\\ b\\end{tabular}'] });
add('T14', '| A | B |\n|---|---|\n| \\$5 | 6 |', { pdf: ['$5'] });
add('T15', '| A | B |\n|---|---|\n| > | merged |', {});
add('T16', '| A | B |\n|---|---|\n| a > b | c |', { pdf: ['a > b'] });
add('T17', '| $$x|y$$ | B |\n|---|---|\n| 1 | 2 |', { tex: ['$\\displaystyle x|y$ & B'] });
add('T18', 'Text before\n| A | B |\n|---|---|\n| 1 | 2 |\nText after', { tex: ['\\begin{tabular}'], nopdf: ['—'] });
add('T19', '| A |\n|---|\n| 1 |', {});
add('T20', '| A | B |\n|---|---|\n| ![i](f.png) | c |', {});

/* ===================== B：HTML 與換行 ===================== */
add('X01', 'Line one<br>line two<br/>line three', { tex: ['\\newline'] });
add('X02', 'Line one  \nline two', { tex: ['Line one\\newline line two'] });
add('X03', 'Line one\\\nline two', { tex: ['\\newline'] });
add('X04', 'a <b>bold</b> <i>it</i> <u>u</u> <sub>2</sub> <sup>2</sup> <mark>m</mark> <kbd>K</kbd>', { tex: ['\\textbf{bold}', '\\textsubscript{2}'] });
add('X05', 'a <span style="color:red">red</span> b', { pdf: ['a red b'] });
add('X06', 'a <div>block</div> b', { nopdf: ['¡', '¿'] });
add('X07', '<!-- comment -->\n\nText', { nopdf: ['comment'] });
add('X08', 'x <unknown>y</unknown> z', { pdf: ['x <unknown>y</unknown> z'] });
add('X09', '1 < 2 and 3 > 2 and a<b>c', { pdf: ['1 < 2 and 3 > 2'] });
add('X10', 'Soft\nbreak\nhere', { pdf: ['Soft break here'] });
add('X11', '&amp; &lt; &gt; &nbsp; &copy; &#169; &eacute;', { pdf: ['& < >', '©', 'é'] });
add('X12', '<p>para html</p>', {});
add('X13', '<br>\n\ntext', { pdf: ['text'] });
add('X14', 'Text&nbsp;with nbsp and a&amp;b', { pdf: ['a&b'] });
add('X15', '<details><summary>S</summary>body</details>', { nopdf: ['<details', '¡'] });
add('X16', '<center>c</center>', { nopdf: ['<center', '¡'] });
add('X17', 'a <font color="red">f</font> b', { pdf: ['a f b'] });

/* ===================== B：特殊字元 ===================== */
add('Z01', 'Hash # percent % amp & under _ braces { } tilde ~ caret ^ back \\ lt < gt > pipe |', { pdf: ['Hash # percent % amp & under', 'lt < gt > pipe |'] });
add('Z02', 'He said "straight" and “curly” and \'single\' and ‘curly’.', { pdfraw: ['“straight”', '‘single’'] });
add('Z03', 'en – dash em — dash ellipsis … and -- --- ...', {});
add('Z04', 'Plus-minus ± degree ° micro µ and μ Greek αβγ ΔΩ.', { tex: ['\\ensuremath{\\alpha}'] });
add('Z05', 'Arrows → ← ≤ ≥ ≠ ≈ × ÷ ∞ ∑ √', { tex: ['\\ensuremath{\\leq}'] });
add('Z06', '50\\% and 5\\& and a\\_b and \\# and \\{x\\} and \\~ and \\^.', { pdf: ['50% and 5& and a', '# and {x}'], left: 'same' });
add('Z07', 'C:\\path\\to\\file and \\alpha in text', { pdf: ['C:\\path\\to\\file and \\alpha in text'] });
add('Z08', 'a \\textbf{x} raw latex in text', {});
add('Z09', 'Ref.\\ 12 and e.g.\\ x', { pdf: ['Ref. 12'] });
add('Z10', 'Unicode spaces: a\u00a0b and a\u2009b and a\u3000b', { tex: ['% !TEX program = pdflatex'] });
add('Z11', 'Quotes "a" and `b` and ``c``', { pdfraw: ['“a”'] });
add('Z12', '"quoted" and \'it\'s\' and 5\' 3"', { pdfraw: ['“quoted”', 'it’s'] });
add('Z13', '* not list\n\n+ plus\n\n- minus', {});
add('Z14', 'emoji 😀 and ✓ and ✗ and ★ and ❤', { tex: ['\\checkmark'], notex: ['😀'] });
add('Z15', 'Ligature ﬁ and ñ é ü ß ø å Å', { pdf: ['ñ é ü ß ø å Å'] });
add('Z16', 'Tilde~nbsp and ~~ and 5~10', {});
add('Z17', 'a---b a--b ``x\'\'', {});
add('Z18', 'Text with <angle> and [bracket] and (paren)', { pdf: ['<angle> and [bracket] and (paren)'] });
add('Z19', '\\\\ double backslash and \\\\\\ triple', { pdf: ['\\ double backslash'] });
add('Z20', 'Text ending with backslash \\', { pdf: ['Text ending with backslash \\'] });

/* ===================== B：CJK ===================== */
add('J01', '中文段落，包含英文 English 與數字 123。', { tex: ['% !TEX program = xelatex'] });
add('J02', '中文 **粗體** 與 *斜體* 與 `code` 與 $x$。', {});
add('J03', '日本語の文章です。ひらがなカタカナ。', { tex: ['xelatex'] });
add('J04', '全形標點：「引號」（括號）、逗號，句號。', {});
add('J05', '# 中文標題\n\n中文_底線_強調 與 中文*星號*強調', { tex: ['中文\\_底線\\_強調'] });
add('J06', '中文$x$公式與中文 $y$ 公式。', {});
add('J07', '한국어 문장입니다.', { tex: ['% !TEX program = xelatex'] });

/* ===================== B：其他區塊 ===================== */
add('B01', '---\n\nText', {});
add('B02', '```python\nprint("a_b % $x$ \\ {}")\n```', { tex: ['\\begin{verbatim}'] });
add('B03', '```tex\n\\begin{center}raw\\end{center}\n```', { tex: ['\\begin{center}raw\\end{center}'] });
add('B04', '    indented code\n    line 2', { tex: ['\\begin{verbatim}'] });
add('B05', 'Paragraph one.\n\nParagraph two.', {});
add('B06', '```\nunclosed fence\ntext', {});
add('B07', '~~~\ntilde fence\n~~~', { tex: ['\\begin{verbatim}'] });
add('B08', '* * *\n\n___\n\n- - -', {});
add('B09', 'Term\n: Definition', {});
add('B10', '[TOC]\n\n# A', {});
add('B11', '```python title="x"\ncode\n```', {});
add('B12', '````\n```\ninner\n```\n````', { pdf: ['inner'] });
add('B13', '```\ncode with \\end{verbatim} inside\n```', { pdf: ['code with \\end{verbatim} inside'] });
add('B14', 'Text\n***\nmore', {});
add('B15', 'Text\n---\nmore', {});

/* ===================== B：前置區 ===================== */
add('Y01', '---\ntitle: "Title with $x_1$ and a_b"\nauthors:\n  - name: A B\n    affil: [0]\naffiliations:\n  - Lab, City\nabstract: "Abstract with $E=mc^2$ and 50% done & more."\n---\n\nBody.',
  { tex: ['\\title{Title with $x_1$ and a\\_b}', 'Abstract with $E=mc^2$ and 50\\% done \\& more.'] });
add('Y02', '```revtex-frontmatter\ntitle: Title $x$ & 5%\nauthor: Ann\naffiliation: Lab\n```\n\n```revtex-abstract\nAbstract $E=mc^2$ with _under_ and **bold** and 50% & more.\n```\n\nBody.',
  { tex: ['\\title{Title $x$ \\& 5\\%}', '\\textit{under}', '\\textbf{bold}'], nopdf: ['**', '$'] });
add('Y03', '```revtex-acknowledgments\nThanks to $x$ and 50% & _y_.\n```', { tex: ['Thanks to $x$ and 50\\% \\& \\textit{y}.'] });
add('Y04', '```revtex-bibliography\n[1] A. Author, J. Phys. 5, 1 (2000).\n[2] B. Author & C. D., "Title_x", 50% (2001).\n```\n\nSee [[1]] and [[2]].',
  { tex: ['\\bibitem{2}', 'B. Author \\& C. D., ``Title\\_x'], pdf: ['See [1] and [2].'] });

/* ===================== B：追加 ===================== */
add('N01', 'Bold with code: **see `a_b` here** end', { tex: ['\\textbf{see \\texttt{a{\\char95}b} here}'] });
add('N02', '# Heading with `a_b` code', { tex: ['\\section{Heading with \\texttt{a{\\char95}b} code}'] });
add('N03', '![Cap with `a_b`](fig1.png)', { tex: ['\\caption{Cap with \\texttt{a{\\char95}b}}'] });
add('N04', '| A | B |\n|---|---|\n| `a_b` | c |', { notex: ['\\verb'] });
add('N05', 'Link [`a_b`](http://a.com) text', { notex: ['\\verb'] });
add('N06', 'Foot^[url [x](http://a.com/100%25#frag?a=1&b=2) end] text.', { pdf: ['url x end'] });
add('N07', 'Foot^[url [x](http://a.com/100%) end] text.', { pdf: ['url x end'] });
add('N08', '# Title [x](http://a.com/#top)', {});
add('N09', '![cap [x](http://a.com/#top)](fig1.png)', { pdf: ['cap x'] });
add('N10', 'a<br>[1] b', { pdf: ['[1] b'] });
add('N11', 'Para end<br>\n\nNext para', {});
add('N12', 'Para end  \n\nNext para', {});
add('N13', '- [1] Smith et al.\n- [a] item', { tex: ['\\item {}[1] Smith et al.'], pdf: ['[1] Smith et al.'] });
add('N14', 'Measured at\n2020. Then more\n\nText', {});
add('N15', '$$x=1$$ where x is a value.\n\nNext paragraph here.\n\n$$y=2$$', { tex: ['\\[x=1\\] where x is a value.'], pdf: ['Next paragraph here.'] });
add('N16', '$$\na=1 \\\\ b=2\n$$', { tex: ['\\begin{gathered}'] });
add('N17', '$$\na &= b\n$$', { tex: ['\\begin{aligned}'] });
add('N18', '==a $x$ b== and ~~del $x^2$ z~~', {});
add('N19', '*a _b_ c* and **a *b* c**', { tex: ['\\textit{a \\textit{b} c}'] });
add('N20', '```\nα β ≤\n```', { notex: ['α'] });
add('N21', 'Inline `α` code.', { notex: ['α'] });
add('N22', 'x -> y and a <= b and p < 0.05 and q > 1 and a | b', { pdf: ['p < 0.05 and q > 1 and a | b'], nopdf: ['¡', '¿'] });
add('N23', 'See [x](http://a.com/100%) and [http://a.com/100%](http://a.com/100%) end.', {});
add('N24', 'Text $a$$b$ and $a$ $b$.', {});
add('N25', '$ x$ and $x $ and $x$', {});
add('N26', '# 1. Intro\n\n## 2.1 Sub', {});
add('N27', 'Text with a URL https://example.com/a?b=c&d=e#f and (https://x.org/y_z).', { tex: ['\\url{https://example.com/a?b=c\\&d=e\\#f}', '(\\url{https://x.org/y_z})'] });
add('N28', 'Quote "He said ‘hi’" and "x" and 5" and \'z\'', { pdfraw: ['“x”', '‘z’'] });
add('N29', '- a\n- b\n\n1. c\n2. d\n\n- e', { tex: ['\\begin{enumerate}'] });
add('N30', 'Term with ``double `tick` inside`` end', { tex: ['\\texttt{double `tick` inside}'] });
add('N31', '# Intro [[1]]\n\nBody [@a].', { cite: true });
add('N32', 'Name: <b>bold *md* inside</b> and <i>x_y_z</i>', { tex: ['\\textbf{bold \\textit{md} inside}'] });
add('N33', 'Escaped \\[ not math \\] and \\( not \\) end.', { pdf: ['Escaped [ not math ] and'] });
add('N34', '[^note]: Define first.\n\nText[^note] after.', { pdf: ['Define first.'] });
add('N35', 'a\n\\[\nx=1\n\\]\nb', { tex: ['\\begin{equation}'] });
add('N36', '<small>small</small> <big>big</big> <abbr title="t">abbr</abbr> <var>v</var> <samp>s</samp> <wbr>', { nopdf: ['<small', '¡'], pdf: ['small big abbr'] });
add('N37', '&mdash; &hellip; &alpha; &le; &times; &deg; &plusmn; &micro; &rarr; &laquo;x&raquo;', { nopdf: ['&mdash', '&alpha'] });
add('N38', 'Table\n\n| A | B |\n|---|---|\n| $5 | $6 |\n\nafter', { tex: ['\\$5 & \\$6'] });
add('N39', 'Item:\n\n    * code-looking\n\nafter', { tex: ['\\begin{verbatim}'] });
add('N40', '1. a\n2. b\n\ntext\n\n3. c', {});

/* ===================== A：官方規範對照 ===================== */
add('A01', '$$\n\\begin{split}\na &= b \\\\\n  &= c\n\\end{split}\n$$', { tex: ['\\begin{equation}\n\\begin{split}'] });
add('A02', FM + '$$\na = b + c + d + e + f + g + h + i + j + k + l + m + n + o + p + q + r + s + t + u + v + w + x + y + z\n$$\n\nSee [@eq:x].\n\n$$x=1$$ {#eq:x}', { settings: { revtexAmsmath: false }, tex: ['\\usepackage{amsmath}'] });
add('A03', FM + 'First [@sondhi], then [@sachdev; @datta], last [@bardeen].\n\n```revtex-bibliography\nbardeen: J. Bardeen, Phys. Rev. Lett. 6, 57 (1961).\nsondhi: S. L. Sondhi, Rev. Mod. Phys. 69, 315 (1997).\nsachdev: S. Sachdev, QPT (2011).\ndatta: S. Datta, ETMS (1995).\n```',
  { pdf: ['First [1], then [2, 3], last [4].'], tex: [/\\bibitem\{sondhi\}[\s\S]*\\bibitem\{sachdev\}[\s\S]*\\bibitem\{datta\}[\s\S]*\\bibitem\{bardeen\}/] });
add('A04', '```revtex-frontmatter\ntitle: Spin-$\\frac{1}{2}$ chains and $T_c$ in 50% doped samples\nauthor: A\naffiliation: X\nkeywords: spin chain, $T_c$\n```\n\n```revtex-abstract\nWe study the $T_c$ of a model with \\cite{k1}. The result is 50% larger [@k2].\n```\n\nBody.\n\n```revtex-bibliography\nk1: One.\nk2: Two.\n```',
  { tex: ['\\title{Spin-$\\frac{1}{2}$ chains and $T_c$ in 50\\% doped samples}', 'We study the $T_c$ of a model with \\cite{k1}', 'larger \\cite{k2}'], pdf: ['larger [2]'] });
add('A05', FM + 'Text with a footnote[^1] and an inline^[inline note].\n\n[^1]: Footnote body.\n\nCite [@k1].\n\n```revtex-bibliography\nk1: One.\n```',
  { tex: ['nofootinbib'], pdf: ['Footnote body.', 'inline note'], nopdf: ['[?]'] });
add('A05b', FM + 'Footnote[^1] with footinbib requested.\n\n[^1]: Body note.\n\n```revtex-bibliography\nk1: One.\n```', { settings: { revtexFootInBib: true }, tex: ['nofootinbib'], pdf: ['Body note.'] });
add('A06', 'Snake_case_word and file_name_here', { tex: ['Snake\\_case\\_word and file\\_name\\_here'], left: 'same' });
add('A07', 'Inline \\(x\\) math', { tex: ['Inline $x$ math'], left: 'same' });
add('A08', 'Say "quotes" and \'single\'.', { tex: ["``quotes'' and `single'"] });
add('A09', 'Ref.~[@k1] and about ~10 nm.', { tex: ['Ref.~\\cite{k1}', '\\ensuremath{\\sim}10 nm'], cite: true });
add('A10', '```revtex-frontmatter\ntitle: T\nauthor: A\nauthor: B\naffiliation: X\n```\n\nBody.', { tex: ['\\author{A}\n\\noaffiliation\n\\author{B}\n\\affiliation{X}'] });
add('A11', '```revtex-frontmatter\ntitle: Paper Title\nshort-title: Short running title\nauthor: A\naffiliation: X\n```\n\nBody.', { tex: ['\\title[Short running title]{Paper Title}'] });
add('A12', FM + '```revtex-wide\n| Model | Response | Parameters | Diagnostic |\n| :-- | :-- | --: | :-- |\n| P | aaa | 2 | Flexible local curvature |\n\n: Wide cap {#tbl:w}\n\nThis paragraph spans both columns.\n```\n\nSee [@tbl:w].',
  { tex: ['\\begin{table*}', '\\caption{\\label{tbl:w}Wide cap}', '\\begin{widetext}'], pdf: ['TABLE I. Wide cap', 'See I.'] });
add('A13', FM + '# Intro {#sec:a}\n\n# Unnum {-} {#sec:d}\n\nSee [@sec:a] and [@sec:d].', { settings: { revtexJournal: 'prb' }, tex: ['\\ref{sec:a}', '\\hyperref[sec:d]{Unnum}'], pdf: ['See I and Unnum.'] });
add('A14', FM + '# Intro {#sec:intro}\n\nSee [@sec:intro].\n\n```revtex-appendix\n```\n\n# Derivation\n\nText.', { tex: ['\\hyperref[sec:intro]{Intro}'], pdf: ['See Intro.'] });
add('A15', 'Bold $\\bm{k}$ vector.', { tex: ['\\usepackage{bm}'] });
add('A17', '##### Fifth\n\n###### Sixth', { notex: ['\\subparagraph'], tex: ['\\paragraph{Fifth}'] });
add('A18', 'Body.', { tex: [/\\documentclass\[aps,prl,reprint,superscriptaddress/], notex: ['reprint,twocolumn'] });
add('A20', '$$x = 1$$ {-}\n\n$$\ny = 2\n$$ {-}', { tex: ['\\begin{equation*}'], notex: ['\\begin{equation}\n'] });
add('A25', '```revtex-frontmatter\ntitle: T\nauthor: A\norcid: 0000-0002-1825-0097\naffiliation: X\n```\n\nBody.', { tex: ['% ORCID: 0000-0002-1825-0097'] });
add('A26', 'Para\n\n---\n\nMore', { notex: ['\\hrule'] });
add('A27', '- a\n- b\n\n1. c\n2. d', { tex: ['\\begin{itemize}', '\\begin{enumerate}'] });
add('A28', '### Third ### {#sec:third}', { tex: ['\\subsubsection{Third}', '\\label{sec:third}'] });

/* ===================== C：發射器 ===================== */
add('CE01', FM + 'cost 5# 100% a&b x_1 {a} ~ ^ < > | and \\\\ end\n', { pdf: ['cost 5# 100% a&b', '< > |'] });
add('CE02', FM + 'He said "hello" and \'world\' it\'s `x\n', { pdfraw: ['“hello”', '‘world’', 'it’s'] });
add('CE03', FM + 'He said \u201chello\u201d \u2018a\u2019 \u2013 \u2014 \u2026 \u201c\u2018x\u2019\u201d\n', { tex: ["``\\,`x'\\,''"] });
add('CE04', FM + 'alpha \u03b1 pm \u00b1 deg 30\u00b0 mu \u00b5 \u03bc times \u00d7 le \u2264 minus \u22125 K caf\u00e9 M\u00fcller emoji \ud83d\ude00 \u03a9 \u2103\n', { pdf: ['café Müller'] });
add('CE05', FM + 'file snake_case_name and 2*3*4 and a*b\n', { tex: ['snake\\_case\\_name'] });
add('CE06', FM + '- [1] first item\n- plain\n\nline one  \n[2] after break\n', { pdf: ['[1] first item', '[2] after break'] });
add('CE07', FM + 'see https://example.com/a_b?x=1&y=2#frag and <https://example.org/p> and [t](https://x.org/a%20b_c)\n', { tex: ['\\url{https://example.com/a_b?x=1\\&y=2\\#frag}', '\\url{https://example.org/p}', '\\href{https://x.org/a\\%20b_c}{t}'] });
add('CF01', '```revtex-frontmatter\ntitle: Quantum $\\alpha$-decay in 100% pure_Si & Ge\nauthor: Zhang, S. & Co_x\nemail: john_doe%x@univ.edu\naffiliation: Dept. of A_B, 50% Univ #1\npacs: 03.65.Ud, 05.30_d & x\nkeywords: a_b, c%d\ndate: Draft of \\today\n```\n\n```revtex-abstract\nWe study $T_c$ of 5% of samples [@key] with **bold** and \\cite{a} and snake_case & more.\n\nSecond para.\n```\n\ntext\n',
  { tex: ['\\title{Quantum $\\alpha$-decay in 100\\% pure\\_Si \\& Ge}', '\\pacs{03.65.Ud, 05.30\\_d \\& x}', '\\date{Draft of \\today{}}', '\\textbf{bold}'], nopdf: ['**'], cite: true });
add('CF02', '```revtex-frontmatter\ntitle: \u91cf\u5b50\u8ad6\u6587\nauthor: \u738b\u5c0f\u660e\naffiliation: \u53f0\u5927\n```\n\n```revtex-abstract\nAbs\n```\n\ntext\n', { tex: ['xelatex'] });
add('CF03', FM + 'plain text\n\n```revtex-acknowledgments\n\u611f\u8b1d\u6559\u6388\n```\n\n```revtex-bibliography\nk1: \u738b\u5c0f\u660e, \u91cf\u5b50, 2020.\n```\n\n$\\text{\u6eab\u5ea6}$\n', { tex: ['% !TEX program = xelatex'] });
add('CH01', FM + '# Heat_flow of $T_c$ 100% {#sec:a_b}\n\n# Title^[note **bold *it* x** here]\n\ntext\n', { tex: ['\\section{Heat\\_flow of $T_c$ 100\\%}', '\\section{Title}'], notex: [/\\footnote\{/] });
add('CM01', FM + 'Inline $\u03b1 \u2264 \u03b2$ and $\u22121$.\n\n$$\n\u03c3 = \\frac{a}{b}\n$$\n', { tex: [/\$\\alpha\s+\\leq\s+\\beta\s*\$/, '\\sigma'] });
add('CM02', FM + 'See [@eq:x].\n\n$$\\begin{align}a&=b \\\\ c&=d\\end{align}$$ {#eq:x}\n\n$$a=b \\tag{3}$$ {#eq:y}\n', { tex: ['\\begin{align}\\label{eq:x}', '\\label{eq:y}'], pdf: ['See (1).'] });
add('CM03', FM + '$$\na = b \\\\\nc = d\n$$\n', { tex: ['\\begin{gathered}'] });
add('CC01', FM + 'Use `my_var` and **`a_b`**, plain `x<y`.\n\n| a | b |\n|---|---|\n| `my_var` | 1 |\n\ntext^[see `a_b`] and `wrap\nacross`\n\n# Head `a_b`\n', { notex: ['\\verb'], pdf: ['see a'] });
add('CC02', FM + '```c\nif (x) {\n  puts("\u03b1");\n```\n', { notex: ['α'] });
add('CT01', FM + '| a | b |\n|---|---|\n| x<br>y | z |\n| [1] | p \\| q |\n\n: Cap {#tbl:a}\n', { tex: ['{}[1] & p \\textbar{} q'], pdf: ['TABLE I. Cap'] });
add('CT02', FM + '```revtex-wide\n| a | b |\n|---|---|\n| 1 | 2 |\n\n: Wide cap {#tbl:w}\n```\n\nSee [@tbl:w].\n', { tex: ['\\begin{table*}', '\\label{tbl:w}'], pdf: ['See I.'] });
add('CT03', FM + '| a | b |\n|---|---|\n' + Array.from({ length: 60 }, (_, i) => `| ${i} | v |`).join('\n') + '\n\n: Long\n', { tex: ['\\begin{longtable}'] });
add('CG01', FM + '![a](figs/x.jpeg)\n\n![b](figs/Fig1.PNG)\n\n![c](figs/a_b.svg)\n\n![d](figs/my fig.png)\n\n![e *it* $x$ [@k]](figs/f.pdf){#fig:f wide}\n', { tex: ['{figs/x.jpeg}', '\\cptmissing', '\\begin{figure*}'], cite: true });
add('CN01', FM + 'a[^1] b[^1] c^[inline note].\n\n[^1]: Note with 50% and `c_d`.\n', { tex: ['\\footnotemark[1]'], pdf: ['Note with 50%', 'inline note'] });
add('CB01', FM + 'See [@k1, p. 12] and [@fig:a; @k1] and [[1-3]].\n\n```revtex-bibliography\nk1: A. B. Smith, *J. Phys.* **5**, 1 (2020). doi:10.1/a_b %\n```\n', { tex: ['\\cite[p.~12]{k1}', '\\textit{J. Phys.} \\textbf{5}'], cite: true, qq: true });
add('CB02', FM + 'See [@k1].\n\n```revtex-bibliography\nk1: J. Bardeen, Phys. Rev. 6, 57 (1961).\n```\n', { settings: { revtexJournal: 'rmp' }, tex: ['\\bibitem[Bardeen(1961)]{k1}'] });
add('CS01', FM + '# A\n\n```revtex-acknowledgments\nThanks_x & 5%\n```\n\n1. one\n2. two\n\n> quote $x$\n\n```revtex-appendix\n```\n\n# App\n\ntext\n', { tex: ['Thanks\\_x \\& 5\\%'] });
add('CS02', FM + '3. three\n4. four\n   - nested\n', {});

/* ===================== D：這次新增 ===================== */
add('D01', FM + '# Acknowledgments\n\n```revtex-acknowledgments\nThanks.\n```\n\n# References\n\n```revtex-bibliography\nk1: One.\n```\n\nCite [@k1].', { notex: ['\\section{Acknowledgments}', '\\section{References}'] });
add('D02', '# Abstract\n\nThis is the abstract with $x$.\n\n# Introduction\n\nBody.', { tex: ['\\begin{abstract}\nThis is the abstract with $x$.'], notex: ['\\section{Abstract}'] });
add('D03', FM + '# Acknowledgments\n\nWe thank $\\alpha$ people.\n\n# Next\n\nText.', { tex: ['\\begin{acknowledgments}\nWe thank $\\alpha$ people.'], notex: ['\\section{Acknowledgments}'] });
add('D04', FM + '```revtex-subequations\n{#eq:grp}\n$$a=1$$ {#eq:a}\n$$b=2$$ {#eq:b}\n```\n\nSee [@eq:grp], [@eq:a], [@eq:b].', { tex: ['\\label{eq:grp}', 'a=1 \\label{eq:a}'], pdf: ['See (1), (1a), (1b).'] });
add('D05', FM + 'Text with `--option` and `a  b` (two spaces).', { tex: ['\\texttt{-{}-option}', '\\texttt{a \\ b}'] });
add('D06', FM + 'Footnote in caption.\n\n![Cap^[no] text](fig.png)', { tex: ['\\caption{Cap text}'], notex: [/\\footnote\{/] });
add('D07', FM + 'Vietnamese ệ and Romanian ș ţ and Polish ą.', { tex: ['\\^{\\d{e}}'], notex: ['ệ'] });
add('D08', FM + 'Superscripts x² and m⁻¹ and H₂O and 30°C.', { notex: ['⁻', '₂'] });
add('D09', FM + 'Inside list item a hard break:\n\n- one  \n  [2] two', { tex: ['\\newline [2] two'] });
add('D10', FM + 'Equation in abstract.\n\n```revtex-abstract\nAbstract with display $$E=mc^2$$ inline.\n```', {});
add('D11', FM + 'Wide [@k] then the unordered list.\n\n```revtex-bibliography\nk: K.\n```', { settings: { revtexHyperref: false }, pdf: ['Wide [1]'] });
add('D12', FM + 'Link without hyperref [site](http://a.com/x_y#z).', { settings: { revtexHyperref: false }, tex: ['site (\\texttt{http://a.com/x{\\char95}y\\#z})'] });
add('D13', FM + 'PRB keeps numbers: see [@sec:m].\n\n# Methods {#sec:m}\n\nText.', { settings: { revtexJournal: 'prb' }, tex: ['\\ref{sec:m}'], pdf: ['see I.'] });
add('D14', FM + 'Missing label [@fig:nope].', { qq: true });
add('D15', FM + '$$\n\\begin{multline}\na+b \\\\\n+c\n\\end{multline}\n$$ {#eq:m}\n\nSee [@eq:m].', { tex: ['\\begin{multline}\\label{eq:m}'], pdf: ['See (1).'] });
add('D16', FM + 'Image svg in body.\n\n![Diagram](figs/diagram.svg)', { tex: ['\\cptmissing'] });
/* 1.2.7：內嵌圖片（data: 網址）給固定的安全名稱，預覽用 \\cptimg 引用（檔案由 19.js 解碼送進引擎），
   不再畫「inline data URI」佔位框；GIF／SVG 等名稱用 .png；不是圖片的 data: 網址仍是佔位框。 */
add('CG02', FM + 'Pasted.\n\n![Shot](data:image/png;base64,iVBORw0KGgo=)\n', { tex: ['\\cptimg{', '{ekd-assets/inline-', '.png}'], notex: ['inline data URI'] });
add('CG03', FM + 'Pasted.\n\n![Anim](data:image/gif;base64,R0lGODlhAQABAAAAACw=)\n\n![Vec](data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22/>)\n', { tex: ['{ekd-assets/inline-', '.png}'], notex: ['inline data URI', '.gif}', '.svg}'] });
add('CG04', FM + 'Odd.\n\n![T](data:text/plain;base64,aGk=)\n', { tex: ['\\cptmissing'] });
add('D17', FM + 'Cite group [see @a, pp. 2-3; @b].\n\n```revtex-bibliography\na: A.\nb: B.\n```', { tex: ['\\cite[see][pp.~2-3]{a}; \\cite{b}'] });
add('D18', FM + 'Emoji only 😀 here.', { notex: ['😀'] });
add('D19', FM + 'Unknown CJK punctuation only： a　b ！', { tex: ['% !TEX program = pdflatex'] });

module.exports = { cases: C, FM };
