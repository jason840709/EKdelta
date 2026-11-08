
/* ============================================================================
 * cp171-57-revtex-settings — 國際論文管線 · REVTeX 版面設定面板
 *
 * 為什麼要有這個東西：
 *   為了減少手動編寫 LaTeX 設定所需的操作，REVTeX 的
 *   class option 全部收進偏好設定。但偏好設定是彈窗，彈出來就擋住畫面——
 *   調參數的當下看不到 PDF，那一刻就不是所見即所得了。
 *
 * 解法（使用者提出）：把設定面板做成**左半的第二個畫面**。
 *   按左半右上角的按鈕 → 左半從 Markdown 編輯切換成設定面板 → 右半的 PDF 留著。
 *   改任何一個選項，右邊立刻重新編譯，看到的就是真實結果。
 *   這一步才是「微調排版」真正需要的東西。
 *
 * 設定來源（1.1.7.6 起）：目前文件最前端的 ```revtex-settings 區塊是
 *   持久化權威；settings.revtex* 只保留當前文件的執行期投影。面板不自行
 *   序列化，而是交給 revtexDocumentSettings 的白名單正規化器與原子寫回，
 *   讓切檔、匯出再匯入、偏好設定與手動編輯區塊都走同一條資料路徑。
 * ========================================================================== */
(() => {
'use strict';
const K = window.__CP171__;
if (!K) { console.error('[CP171] revtexSettings: 核心未就緒'); return; }
try {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function'
      || typeof document.createElement('div').querySelector !== 'function') return;
} catch (_) { return; }

const ID = 'cp171-settings-pane';

/* ---------- 選項定義 ------------------------------------------------------
   分組排列，常用的在前。每一項都標了「這個選項會影響什麼」，因為使用者不該
   需要去查 REVTeX 手冊才知道自己在改什麼。                                  */
/* ---------- 官方學會／期刊對照表 -------------------------------------------
 * 全部抽自使用者提供的官方 revtex-tds-2023-05-30 套件裡各 <society>4-2.rtx 的
 *   \DeclareOption{<代碼>}{\change@journal{<代碼>}}
 * 宣告（osa 的四個直接宣告在 revtex4-2.cls 內）。這是唯一權威來源。
 *
 * 為什麼必須連動：REVTeX 判斷學會的方式是掃描所有 class option、看哪個字串
 * 剛好對應到一個 <字串>4-2.rtx 檔（revtex4-2.cls 的 @parse@class@options@society）。
 * 期刊代碼則由該學會的 .rtx 內部宣告。若送出 aps 卻配 jcp（AIP 的期刊），
 * jcp 在 aps4-2.rtx 裡沒有宣告，REVTeX 會靜默忽略它——不報錯、不警告，
 * 只是套用該學會的預設期刊。使用者會以為設定生效了，其實沒有。
 */
const JOURNALS_BY_SOCIETY = Object.freeze({
  aps: [['prl','PRL'],['pra','PRA'],['prb','PRB'],['prc','PRC'],['prd','PRD'],
        ['pre','PRE'],['prx','PRX'],['prapplied','PR Applied'],
        ['prmaterials','PR Materials'],['prfluids','PR Fluids'],
        ['prab','PR Accel. Beams'],['prper','PR Phys. Educ. Res.'],
        ['rmp','RMP（強制 author-year 引用）'],['physrev','Physical Review（通用）']],
  aip: [['jcp','JCP'],['apl','APL'],['jap','JAP'],['pof','PoF'],['pop','PoP'],
        ['rsi','RSI'],['cha','Chaos'],['bmf','Biomicrofluidics'],['jmp','JMP'],
        ['apm','APL Materials'],['adv','AIP Advances'],['sd','Struct. Dyn.'],
        ['rse','J. Renew. Sustain. Energy'],['cp','Chem. Phys.'],['jor','J. Rheol.']],
  aapm: [['mph','Medical Physics']],
  sor:  [['jor','Journal of Rheology']]
  /* OSA 已移除：REVTeX 4.2 官方套件不含 osa4-2.rtx（4.1 時代才有）。
     實測送 osa 會得到 "No Society specified, using default society aps"
     加 6 個 Conflicting 警告，等於設定完全沒生效。列出使用者選不到的
     學會，比不列更糟——會讓人以為選了就有效。 */
});

/* 官方強制 author-year 引用的期刊：apsrmp4-2.rtx 第 218 行
   \@booleantrue\authoryear@sw，且第 217 行把 \@bibstyle 固定為 apsrmp4-2。
   送 numerical 會得到 "Package natbib Error: Bibliography not compatible
   with author-year citations." 而編譯失敗（矩陣壓力測試抓到）。 */
const FORCED_AUTHORYEAR = Object.freeze(new Set(['rmp']));

/* ---------------------------------------------------------------------------
 * 每一項設定的詳細說明（「i」泡泡的內容）
 *
 * 為什麼需要：使用者實測時拿了一份正確的 Markdown 進來，卻因為「單位排列」停在
 * 預設值而排出完全不像原稿的版面——面板上那一行 note 只有一句話，看不出各選項
 * 差在哪。note 適合一句話提示；選項之間的差異需要篇幅，所以另開可捲動的說明泡泡。
 *
 * 內容原則：講「看得到的差別」與「什麼時候該選它」，不要只翻譯 class option 名稱。
 *
 * ★ i18n：這一塊刻意寫成雙語結構（每個字串是 [中文, English]），由 infoHTML 依
 * 目前語言挑一個，不走 cp171-06-i18n 的字典。理由是這裡是長篇說明文，塞進字典會
 * 讓那份字典失去「介面短語對照表」的性質，也難維護。覆蓋率稽核用下面的標記排除。
 * i18n:bilingual-block
 * ------------------------------------------------------------------------- */
const OPTION_DOCS = {
  revtexSociety: {
    what: ['決定套用哪一個學會的官方樣式覆寫（.rtx）。它會連帶換掉期刊清單，也會改變標題區、摘要與書目的細節。',
           'Chooses which society style overlay (.rtx) is applied. It also swaps the journal list and changes title, abstract and bibliography details.'],
    opts: [[['APS','APS'],['美國物理學會。Physical Review 系列（PRL／PRA–PRE／PRX／RMP…）都在這裡，也是最常見的預設。',
                            'American Physical Society. The Physical Review family (PRL, PRA–PRE, PRX, RMP…). The common default.']],
           [['AIP','AIP'],['美國物理聯合會。JCP、APL、JAP、POF 等。書目可額外顯示文章標題。',
                            'American Institute of Physics. JCP, APL, JAP, POF and others; the bibliography can also show article titles.']],
           [['AAPM','AAPM'],['美國醫學物理學家學會，期刊 Medical Physics。',
                              'American Association of Physicists in Medicine; the journal is Medical Physics.']],
           [['SOR','SOR'],['流變學會，期刊 Journal of Rheology。',
                            'Society of Rheology; the journal is the Journal of Rheology.']]],
    when: ['照你要投的期刊選。選錯學會時 REVTeX 會靜默 fallback，版面看起來還是「像樣」，但細節不對——所以這一項要先確認。',
           'Pick the society of your target journal. A wrong society falls back silently: the layout still looks plausible but the details are wrong, so check this one first.'],
  },
  revtexJournal: {
    what: ['同一個學會底下不同期刊的細節不同：標題大小寫、摘要處理、書目樣式、要不要編章節號。',
           'Journals within one society differ in title case, abstract handling, bibliography style, and whether sections are numbered.'],
    opts: [[['Letters 類（PRL、CP…）','Letters journals (PRL, CP…)'],
            ['官方就不編章節號，篇幅也短。你的章節標題不會出現「I. II. III.」——那是正常的。',
             'These never number sections and are short-format. Your headings will show no "I. II. III." — that is correct.']],
           [['一般刊（PRA–PRE、JCP、JAP…）','Regular journals (PRA–PRE, JCP, JAP…)'],
            ['會編章節號，適合長文。','Sections are numbered; suited to full-length papers.']],
           [['RMP','RMP'],['綜述期刊，官方強制 author-year 引用，數字引用會被覆蓋。',
                            'A review journal; author-year citation is forced by the class and overrides numeric citation.']]],
    when: ['清單已對齊官方 .rtx 宣告，不在清單上的代碼官方不認得。不確定就先選一般刊。',
           'The list follows the official .rtx declarations; codes outside it are not recognized. When unsure, pick a regular journal.'],
  },
  revtexMode: {
    what: ['整份稿件的基本樣貌。這一項最容易讓頁數整個變動。',
           'The overall look of the manuscript. This is the setting most likely to change the page count.'],
    opts: [[['reprint','reprint'],['雙欄緊排，接近見刊樣貌。摘要接在標題正下方。想看「排出來像不像論文」就用這個。',
                                    'Two columns, close to the published look, abstract directly under the title. Use it to judge whether the paper looks right.']],
           [['preprint','preprint'],['單欄寬行距，給審稿人批註用。官方會在摘要正前方加入可選軟分頁：短稿可能留在首頁，當後續正文變長時，TeX 可能改讓摘要從第二頁開始。',
                                      'One column with wide leading, for reviewers. The class inserts an optional soft break immediately before the abstract: a short paper may keep it on page one, while a longer body can make TeX start it on page two.']],
           [['twocolumn','twocolumn'],['雙欄的投稿稿件；部分期刊接受用雙欄送審。',
                                        'A two-column manuscript; some journals accept two-column submissions.']],
           [['galley','galley'],['長條校樣，單欄不分頁。','A galley proof: one column, unpaginated.']],
           [['checkin','checkin'],['內部審閱用，頁首印上日期。','For internal review; the header shows the date.']]],
    /* 1.2.8：manuscript 是官方已廢棄的 preprint 舊名，選單從來沒有它，說明也拿掉。 */
    when: ['自己校稿、看排出來像不像期刊用 reprint；投稿送審多半用 preprint（單欄寬行距，方便審稿人批註）。',
           'Use reprint to see the published look; most submissions use preprint (one column, wide spacing for referees).'],
  },
  revtexAddress: {
    what: ['★ 作者與服務單位怎麼對應。多單位論文一定要選對，否則第一頁會完全不像原稿。',
           'How authors map to affiliations. With several affiliations this must be right, or the first page will not resemble the original at all.'],
    opts: [[['上標編號（superscriptaddress）','Superscript numbers (superscriptaddress)'],
            ['作者名字右上角標數字，下面把單位列成 1./2./3.… 一欄。跨校、跨機構的論文幾乎都長這樣，也是現在的預設。',
             'Superscript numbers after each author, with the affiliations listed 1./2./3. below. Almost every multi-institution paper looks like this; it is now the default.']],
           [['分組（groupedaddress）','Grouped (groupedaddress)'],
            ['把同單位的作者併成一組，每組下面直接印該組的單位。作者少、單位也少時比較好看；單位一多就會變成一段一段疊下去。',
             'Authors sharing an affiliation are grouped, with that affiliation printed under each group. Fine for a few authors and affiliations; with many it becomes block after block.']],
           [['不排序（unsortedaddress）','Unsorted (unsortedaddress)'],
            ['照你寫的順序輸出，不做任何分組。','Emitted in the order you wrote, with no grouping.']],
           [['接排（runinaddress）','Run-in (runinaddress)'],
            ['單位接在作者後面同一行，最省空間。','The affiliation follows the author on the same line; the most compact option.']]],
    when: ['看你要投的期刊實際長什麼樣。多於兩個單位時，上標編號幾乎一定是對的。',
           'Match your target journal. With more than two affiliations, superscript numbering is almost always the right choice.'],
  },
  revtexColumns: {
    what: ['欄數。多數期刊正式版是雙欄。','Column count. Most published versions are two-column.'],
    opts: [[['依模式自動','Automatic'],['交給排版模式決定（reprint→雙欄、preprint→單欄），不確定就用這個。',
                                        'Follows the typesetting mode (reprint → two, preprint → one). Use this when unsure.']],
           [['單欄','One column'],['寬行、好批註，但和見刊樣貌差很多。','Wide lines, easy to annotate, but far from the published look.']],
           [['雙欄','Two columns'],['接近見刊樣貌；公式與表格太寬時會自動跨欄。',
                                     'Close to the published look; oversized equations and tables span both columns automatically.']]],
    when: ['想確認公式或表格會不會爆欄寬，就切雙欄看。',
           'Switch to two columns to check whether equations or tables overflow the measure.'],
  },
  revtexPaper: {
    what: ['紙張尺寸。','Paper size.'],
    opts: [[['Letter','Letter'],['北美期刊的預設。','The default for North American journals.']],
           [['A4','A4'],['歐洲與台灣常用。','Common in Europe and Taiwan.']]],
    when: ['官方對 a5／b5 等尺寸只設定紙張寬度、不連動版心寬度，所以面板只開放這兩種。',
           'For a5/b5 and similar the class only sets the sheet width without adjusting the text block, so only these two are exposed.'],
  },
  revtexFontSize: {
    what: ['正文字級。這不是單純縮放；REVTeX 的 preprint 與 reprint 各自帶有相容的字級 grid。',
           'Body type size. This is not mere zoom: REVTeX preprint and reprint each carry a compatible type-size grid.'],
    opts: [[['依模式','By layout'],['不輸出額外字級；preprint 由官方選 12pt，reprint 由官方選 10pt。切換排版模式時會回到這個安全值。',
                                                     'Emits no extra size option: official preprint selects 12pt and reprint selects 10pt. Changing mode returns to this safe value.']],
           [['10pt','10pt'],['正式雙欄 reprint 的標準 grid。','The standard grid for formal two-column reprint output.']],
           [['11pt／12pt','11pt / 12pt'],['只用於期刊明確允許的特殊情況。AIP reprint + Letter + 雙欄會自動收斂回「依排版模式自動」，避免第一頁文字逼近紙張下緣。',
                                        'Only for explicitly permitted special cases. AIP reprint + Letter + two columns is normalized back to Automatic to keep first-page text away from the sheet edge.']]],
    when: ['在投稿審閱版與見刊預覽之間切換時使用「依排版模式自動」。',
           'Use Automatic when switching between submission-review and published-layout previews.'],
  },
  revtexSides: {
    what: ['單面或雙面。影響頁首頁尾與左右邊界是否鏡像。','One- or two-sided, which decides whether margins and running heads mirror.'],
    opts: [[['雙面','Two-sided'],['正式印刷版；奇偶頁邊界鏡像。','The printed format; odd and even margins mirror.']],
           [['單面','One-sided'],['螢幕閱讀或列印草稿。','For screen reading or draft printing.']]],
    when: ['投稿多半不必動。','Rarely needs changing for submission.'],
  },
  revtexAffilStyle: {
    what: ['現職單位（altaffiliation）的標記樣式。','The marker style for a present address (altaffiliation).'],
    opts: [[['符號','Symbols'],['*、†、‡…，官方預設。','*, †, ‡ … — the class default.']],
           [['字母','Letters'],['a、b、c…。','a, b, c …']]],
    when: ['很少需要動，除非期刊明文要求。','Rarely needs changing unless the journal requires it.'],
  },
  revtexTitlePage: {
    what: ['控制標題、作者、機構、摘要與正文之間的首頁分頁。preprint 的大面積留白通常不是固定 title page，而是摘要前的官方可選軟分頁。',
           'Controls first-page pagination among the title, authors, affiliations, abstract, and body. In preprint, a large blank area is usually the official optional break before the abstract, not a fixed title page.'],
    opts: [[['依官方行為','Official behavior'],['不改寫 REVTeX；摘要是否換頁由全文長度與 TeX page builder 決定。','Leaves REVTeX untouched; document length and the TeX page builder decide whether the abstract moves.']],
           [['強制獨立標題頁','Force title page'],['使用官方 titlepage，標題前置區獨立成頁。','Uses the official titlepage behavior for a separate front-matter page.']],
           [['強制連續首頁','Force continuous first page'],['輸出 notitlepage，並只在摘要產生時抑制 preprint 軟分頁；不改動期刊的摘要字型與間距。','Emits notitlepage and suppresses the preprint soft break only while producing the abstract, without replacing journal typography or spacing.']]],
    when: ['需要和官方手寫 LaTeX 完全一致時保留「依官方行為」；要避免機構之後留下大面積空白時選「強制連續首頁」。',
           'Keep “Official behavior” for exact parity with hand-written REVTeX; choose “Force continuous first page” to prevent a large blank area after the affiliations.'],
  },
  revtexShowPacs: {
    what: ['PACS 是 APS 早年的主題分類碼。開啟後會把 frontmatter 的 pacs: 印在摘要下方。',
           'PACS are the older APS subject codes. Turning this on prints the frontmatter pacs: below the abstract.'],
    when: ['近年多數期刊已不要求；原稿沒寫 pacs 就不用開。',
           'Most journals no longer ask for them; leave it off if your source has no pacs.'],
  },
  revtexShowKeys: {
    what: ['★ 決定摘要下方那行 Keywords 要不要印出來。','Decides whether the Keywords line under the abstract is printed.'],
    when: ['REVTeX 只有在這個開關打開時才會印關鍵字——關著的話 frontmatter 的 keywords: 有讀到、但畫面上看不到，很容易誤以為沒吃進去。所以現在預設打開。',
           'REVTeX only prints keywords when this is on. With it off the frontmatter keywords: are read but never shown, which looks like they were ignored — so it now defaults to on.'],
  },
  revtexCitation: {
    what: ['正文引用的樣式。','Citation style in the body text.'],
    opts: [[['數字 [1]','Numeric [1]'],['Physical Review 系列的標準。','The Physical Review standard.']],
           [['作者年份 (Smith 2026)','Author-year (Smith 2026)'],['RMP 等綜述期刊使用；選了 RMP 時官方會強制切成這個。',
                                                                  'Used by review journals such as RMP, which force it at the class level.']]],
    when: ['照期刊規定。改這一項會同時改變書目的排序方式。',
           'Follow the journal. Changing it also changes how the bibliography is ordered.'],
  },
  revtexFootInBib: {
    what: ['REVTeX 是用書目機制實作腳註的。這個開關決定腳註排在頁尾還是併進參考文獻區。',
           'REVTeX implements footnotes through the bibliography; this decides whether they sit at the foot of the page or in the reference list.'],
    when: ['Physical Review 的見刊版是併進書目；想在校稿時看到頁尾腳註就關掉。',
           'Published Physical Review articles merge them into the bibliography; turn it off to see footnotes at the foot while proofreading.'],
  },
  revtexLongBibliography: {
    what: ['書目要不要顯示文章標題。','Whether the bibliography shows article titles.'],
    when: ['投稿前通常保持開啟比較好查證；見刊版多半不顯示標題。',
           'Keep it on before submission so references are easy to check; published versions usually omit titles.'],
  },
  revtexEprint: {
    what: ['書目裡要不要顯示 arXiv 編號。','Whether arXiv identifiers appear in the bibliography.'],
    when: ['預印本引用多的時候開著很有用。','Useful when you cite many preprints.'],
  },
  revtexFloats: {
    what: ['圖表要穿插在正文中，還是集中到文末。','Whether figures and tables sit in the body text or are collected at the end.'],
    opts: [[['穿插在正文中','In the body text'],['接近見刊樣貌，也比較好讀。','Close to the published look and easier to read.']],
           [['集中在文末','Collected at the end'],['多數期刊的投稿格式要求。','Required by most journals for submission.']],
           [['集中在文末且各自獨立成頁','Collected at the end, one per page'],['更嚴格的投稿要求。','A stricter submission requirement.']]],
    when: ['自己看稿用穿插；要交稿前再依期刊規定切換。',
           'Use in-body while writing and switch before submission if the journal requires it.'],
  },
  revtexFloatFix: {
    what: ['避免圖表卡在頁尾排不下時被無限往後推。','Prevents a float that cannot fit at the foot of a page from being pushed forward indefinitely.'],
    when: ['幾乎都應該開著；關掉只有在你要精確控制浮動體位置時才有意義。',
           'Keep it on; turning it off only makes sense when you control float placement by hand.'],
  },
  revtexBottom: {
    what: ['版面底部要不要對齊。','Whether page bottoms are aligned.'],
    opts: [[['齊底','Flush bottom'],['官方預設，拉伸行距讓每頁底線對齊。','The class default; leading stretches so page bottoms line up.']],
           [['不齊底','Ragged bottom'],['允許頁尾留白，行距比較自然。','Allows white space at the foot; leading stays natural.']]],
    when: ['除非行距被拉得很難看，否則留預設。','Leave the default unless the stretched leading looks bad.'],
  },
  revtexTightenLines: {
    what: ['把行距壓緊。','Tightens the leading.'],
    when: ['有頁數上限（例如 PRL）時的最後手段。','A last resort when you are over a page limit such as PRL\u2019s.'],
  },
  revtexBalanceLastPage: {
    what: ['把最後一頁的雙欄長度拉齊。','Balances the two columns on the last page.'],
    when: ['見刊樣貌會做這件事，通常留著。','Published articles do this, so it is usually left on.'],
  },
  revtexFleqn: {
    what: ['公式靠左而不是置中。','Left-aligns displayed equations instead of centring them.'],
    when: ['少數期刊要求；不確定就別開。','Required by a few journals; leave it off when unsure.'],
  },
  revtexEqSecNum: {
    what: ['式號帶章節編號，例如 (2.5)。','Numbers equations by section, for example (2.5).'],
    when: ['長文比較好找式子；Letters 類通常不用。','Helps in long papers; Letters journals normally do not use it.'],
  },
  revtexSecNumArabic: {
    what: ['章節用阿拉伯數字（1. 2. 3.）而不是羅馬數字。','Arabic section numbers (1. 2. 3.) instead of Roman.'],
    when: ['期刊有明文要求時才改。','Change only when the journal explicitly requires it.'],
  },
  revtexLineNumbers: {
    what: ['在每一行左邊加行號。','Adds line numbers in the margin.'],
    when: ['很多期刊的審稿版要求行號，投稿前記得開、見刊版記得關。',
           'Many journals require them for review: turn it on before submitting and off for the final version.'],
  },
  revtexLengthCheck: {
    what: ['讓 REVTeX 估算稿件長度。','Makes REVTeX estimate the manuscript length.'],
    when: ['PRL 這種有嚴格頁數上限的期刊很有用。','Useful for journals with a hard page limit such as PRL.'],
  },
  revtexDraft: {
    what: ['draft 模式：圖片用外框替代，編譯比較快。','Draft mode: images are replaced by outlines and the compile is faster.'],
    when: ['只在反覆調整文字時開，交稿前一定要關。','Use it while reworking text; always turn it off before submitting.'],
  },
  revtexLandscape: {
    what: ['整份橫向。','Sets the whole document landscape.'],
    when: ['極少用；單一張寬表格請改用 turnpage 而不是整份橫向。',
           'Rarely useful: for one wide table use turnpage instead of rotating the whole document.'],
  },
  revtexHyperref: {
    what: ['產生可點的交叉引用與連結。','Produces clickable cross-references and links.'],
    when: ['建議開著；本程式已設定成彩色文字而不是畫方框。',
           'Keep it on; this program renders links as coloured text rather than boxes.'],
  },
  revtexExtraOptions: {
    what: ['直接附加到 \\documentclass[...] 的額外選項，逗號分隔。',
           'Extra options appended verbatim to \\documentclass[...], comma separated.'],
    when: ['面板沒有提供、但官方支援的選項可以寫在這裡（例如 nofootinbib）。寫錯的選項 REVTeX 會靜默忽略，所以請對照官方文件。',
           'Use it for official options this panel does not expose (for example nofootinbib). REVTeX silently ignores unknown options, so check the official documentation.'],
  },
};
/* i18n:end */

/* 1.2.8（M36，Jason 11-08：版面設定還像早期 ChatGPT 做的版本）：外觀改成和偏好設定同一套（一列一個設定、
   細線分段、不用卡片），字只有 13／12px。研究投稿實際會改的項目後（設計方案第 2 節），上面只放
   「投稿目標」與「常用」兩組；其餘收進「更多設定」。標籤改成雙語，不再靠 i18n 字典事後翻譯。
   info:true 的項目旁有「i」，點開是 OPTION_DOCS 的詳細說明（只給真正容易選錯的項目）。 */
const L = (zh, en) => [zh, en];
const GROUPS = [
  { id: 'target', title: L('投稿目標', 'Target journal'), open: true, items: [
    { k: 'revtexSociety', label: L('學會', 'Society'), type: 'select', info: true,
      opts: [['aps', L('APS（美國物理學會）', 'APS (American Physical Society)')], ['aip', L('AIP（美國物理聯合會）', 'AIP (American Institute of Physics)')],
             ['aapm', L('AAPM（醫學物理）', 'AAPM (Medical Physics)')], ['sor', L('SOR（流變學會）', 'SOR (Society of Rheology)')]] },
    /* 期刊清單依學會連動（JOURNALS_BY_SOCIETY），由 syncJournalOptions() 重建。 */
    { k: 'revtexJournal', label: L('期刊', 'Journal'), type: 'select', info: true, opts: [['prl', L('PRL', 'PRL')]] },
    /* 官方 cls 裡 manuscript 是 preprint 的舊名（obsolete），不列。 */
    { k: 'revtexMode', label: L('排版模式', 'Layout'), type: 'select', info: true,
      opts: [['reprint', L('reprint：接近見刊樣貌', 'reprint: as published')],
             ['preprint', L('preprint：審稿稿件，單欄寬行距', 'preprint: referee copy, one column')],
             ['twocolumn', L('twocolumn：雙欄稿件', 'twocolumn: two-column manuscript')],
             ['galley', L('galley：長條校樣', 'galley: galley proof')],
             ['checkin', L('checkin：內部審閱，頁首印日期', 'checkin: internal review, dated header')]] },
    /* a5／b5／legal／executive 四種紙張官方不調整版心（版心比紙寬），只開放 Letter 與 A4。 */
    { k: 'revtexPaper', label: L('紙張', 'Paper'), type: 'seg', opts: [['letterpaper', L('Letter', 'Letter')], ['a4paper', L('A4', 'A4')]] }
  ] },
  { id: 'common', title: L('常用', 'Common'), open: true, items: [
    { k: 'revtexAddress', label: L('作者單位排法', 'Affiliations'), type: 'select', info: true,
      opts: [['superscriptaddress', L('上標編號（多個單位時常用）', 'Superscript numbers (for many affiliations)')],
             ['groupedaddress', L('同單位的作者排在一起', 'Authors grouped by affiliation')],
             ['unsortedaddress', L('照作者順序，不合併', 'In author order, not merged')],
             ['runinaddress', L('接在作者名字後面', 'Run in after the names')]] },
    { k: 'revtexCitation', label: L('引用樣式', 'Citations'), type: 'seg', info: true,
      opts: [['numerical', L('數字 [1]', 'Numbers [1]')], ['author-year', L('作者年份', 'Author–year')]] },
    { k: 'revtexLongBibliography', label: L('書目列出文章標題', 'Article titles in references'), type: 'bool', info: true },
    { k: 'revtexLineNumbers', label: L('審稿行號', 'Line numbers'), type: 'bool', note: L('部分期刊送審時要求。', 'Some journals ask for them in review.') },
    /* endfloats 關掉 floats@sw；endfloats* 再開 floatp@sw，每個浮動體各自一頁。 */
    { k: 'revtexEndfloats', label: L('圖表位置', 'Figures and tables'), type: 'select',
      opts: [['inline', L('穿插在正文裡', 'Within the text')], ['endfloats', L('集中在文末', 'At the end')], ['endfloats*', L('集中在文末，每個一頁', 'At the end, one per page')]] }
  ] },
  { id: 'layout', title: L('版式', 'Layout details'), items: [
    { k: 'revtexColumns', label: L('欄數', 'Columns'), type: 'seg', info: true,
      opts: [['auto', L('依模式', 'By layout')], ['onecolumn', L('單欄', 'One')], ['twocolumn', L('雙欄', 'Two')]] },
    { k: 'revtexFontSize', label: L('字級', 'Type size'), type: 'select', info: true,
      opts: [['auto', L('依模式', 'By layout')], ['10pt', L('10pt', '10pt')], ['11pt', L('11pt', '11pt')], ['12pt', L('12pt', '12pt')]],
      note: L('依模式：preprint 12pt、reprint 10pt；換排版模式時回到依模式。', 'By layout: preprint 12pt, reprint 10pt; resets when the layout changes.') },
    { k: 'revtexSides', label: L('單雙面', 'Sides'), type: 'seg', info: true, opts: [['twoside', L('雙面', 'Two-sided')], ['oneside', L('單面', 'One-sided')]] },
    { k: 'revtexBottomAlign', label: L('頁底', 'Page bottoms'), type: 'seg', opts: [['flushbottom', L('齊底', 'Flush')], ['raggedbottom', L('不齊底', 'Ragged')]] },
    /* 三態不是單純 titlepage：off 除了 notitlepage，發射器也抑制 preprint 摘要前的軟分頁；auto 零注入。 */
    { k: 'revtexTitlePage', label: L('標題與摘要', 'Title and abstract'), type: 'select', info: true,
      opts: [['auto', L('照期刊樣式', 'As the journal does')], ['on', L('獨立標題頁', 'Separate title page')], ['off', L('與正文連續', 'Continuous with the text')]] },
    { k: 'revtexLandscape', label: L('橫向紙張', 'Landscape'), type: 'bool', info: true },
    { k: 'revtexDraft', label: L('草稿模式', 'Draft'), type: 'bool', info: true, note: L('編譯較快，圖片以外框代替。', 'Faster; images show as frames.') }
  ] },
  { id: 'front', title: L('作者與前置', 'Front matter'), items: [
    /* 官方預設 symbol（altaffilletter@sw 預設 false）。 */
    { k: 'revtexAltaffilStyle', label: L('現職單位標記', 'Alternate affiliation marks'), type: 'seg',
      opts: [['symbol', L('符號 * † ‡', 'Symbols * † ‡')], ['letter', L('字母 a b c', 'Letters a b c')]] },
    { k: 'revtexPreprintNumbers', label: L('顯示預印本編號', 'Show preprint numbers'), type: 'bool' },
    { k: 'revtexShowPacs', label: L('顯示 PACS', 'Show PACS'), type: 'bool', info: true },
    { k: 'revtexShowKeys', label: L('顯示關鍵字', 'Show keywords'), type: 'bool', info: true }
  ] },
  { id: 'refs', title: L('文獻與註腳', 'References and notes'), items: [
    { k: 'revtexEprint', label: L('顯示 arXiv 編號', 'Show arXiv numbers'), type: 'bool', info: true },
    { k: 'revtexBibnotes', label: L('作者附註放進書目', 'Author notes in references'), type: 'bool' },
    { k: 'revtexFootInBib', label: L('腳註併入書目', 'Footnotes in references'), type: 'bool', info: true,
      note: L('要有 .bib 檔；手寫書目時仍排在頁底。', 'Needs a .bib file; with typed references they stay at the page foot.') }
  ] },
  { id: 'tune', title: L('微調', 'Fine tuning'), items: [
    { k: 'revtexBalanceLastPage', label: L('末頁兩欄等高', 'Balance the last page'), type: 'bool' },
    { k: 'revtexTightenLines', label: L('緊排行距', 'Tighten lines'), type: 'bool' },
    { k: 'revtexFloatFix', label: L('圖表排不下時不一直往後推', 'Float fix'), type: 'bool', info: true },
    { k: 'revtexFleqn', label: L('公式靠左', 'Left-aligned equations'), type: 'bool' },
    { k: 'revtexEqSecNum', label: L('式號依章節', 'Equation numbers by section'), type: 'bool' },
    { k: 'revtexSecNumArabic', label: L('章節用阿拉伯數字', 'Arabic section numbers'), type: 'bool' },
    { k: 'revtexLengthCheck', label: L('長度檢查', 'Length check'), type: 'bool', note: L('PRL 有頁數上限時用。', 'Useful for PRL’s length limit.') }
  ] },
  { id: 'pkg', title: L('套件', 'Packages'), items: [
    { k: 'revtexAmsmath', label: L('amsmath', 'amsmath'), type: 'bool', note: L('文件用到時一定會載入；這裡決定沒用到時要不要也載入。', 'Always loaded when used; this decides whether to load it otherwise.') },
    { k: 'revtexAmssymb', label: L('amssymb', 'amssymb'), type: 'bool' },
    { k: 'revtexHyperref', label: L('hyperref（超連結）', 'hyperref (links)'), type: 'bool' },
    { k: 'texBooktabs', label: L('表格用 booktabs 三線', 'booktabs rules in tables'), type: 'bool' },
    { k: 'texListings', label: L('程式碼用 listings', 'listings for code'), type: 'bool' },
    { k: 'revtexExtraOptions', label: L('其他 REVTeX 選項', 'Other REVTeX options'), type: 'text', info: true, ph: L('例如 nofootinbib', 'e.g. nofootinbib') }
  ] }
];

const CSS = `
/* 版面設定蓋在左半邊（右半的 PDF 保持顯示）。控制項沿用偏好設定的 .ekp-* 元件，見 32.js「偏好設定（M32）」一段：
   1.2.8 起那一段的選擇器同時套用到 #cp171-settings-pane。
   進場：從上方 6px 淡入 160ms（ease-out），減量模式由 show() 以 WAAPI 只做淡入——全域減量政策會蓋掉非 !important 的 CSS 變體。 */
#${ID}{display:none;position:absolute;inset:0;z-index:30;overflow-y:auto;overscroll-behavior:contain;box-sizing:border-box;
  padding:12px var(--space-6) var(--space-8);background:var(--ui-canvas);color:var(--ui-text-strong);
  font:var(--fs-13)/var(--lh-13) var(--font-ui)}
body.cp171-settings-open #${ID}{display:block}
body.cp171-settings-open #editor{visibility:hidden}
@keyframes cp171SettingsIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: no-preference){
  body.cp171-settings-open #${ID}{animation:cp171SettingsIn var(--dur-short) var(--ease-out) both}
}
#${ID} .cp171-s-inner{max-width:620px;margin:0 auto}
/* 標題列黏在上面：捲動時內容從它底下經過，不會跑到右上角的「回到編輯」底下 */
#${ID} .cp171-s-head{position:sticky;top:-12px;z-index:2;display:flex;flex-direction:column;justify-content:center;min-height:30px;
  margin:-12px calc(var(--space-6) * -1) var(--space-4);padding:12px calc(var(--space-6) + 110px) var(--space-2) var(--space-6);background:var(--ui-canvas)}
#${ID} .cp171-s-head .ekp-h{margin:0}
#${ID} .ekp-group-h:first-of-type{margin-top:0}
#${ID} .ekp-select{width:280px}
#${ID} .ekp-input{width:280px;font-family:var(--font-mono)}
#${ID} .ekp-label>span{display:inline-flex;align-items:center;gap:var(--space-1h)}
#${ID} .cp171-s-more{margin-top:var(--space-5)}
#${ID} .cp171-s-foot{display:flex;flex-direction:column;gap:var(--space-2);margin-top:var(--space-5);padding-top:var(--space-3);border-top:.5px solid var(--ui-line)}
#${ID} code.cp171-s-cls{display:block;padding:var(--space-2) var(--space-3);border-radius:var(--r-sm);background:var(--ui-track);
  color:var(--ui-text);font:var(--fs-12)/var(--lh-12) var(--font-mono);word-break:break-all}
#${ID} .cp171-s-foot .ekp-link{align-self:flex-start}
#${ID} .cp171-s-info{flex:none;display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;padding:0;
  border:1px solid var(--ui-line-strong);border-radius:50%;background:transparent;color:var(--ui-text-muted);
  font:var(--fw-medium) 10px/1 var(--font-ui);cursor:help}
@media (hover:hover) and (pointer:fine){#${ID} .cp171-s-info:hover{color:var(--ui-accent);border-color:var(--ui-accent)}}
#${ID} .cp171-s-info:focus-visible{outline:none;box-shadow:var(--focus-ring)}
#cp171-s-pop{position:fixed;z-index:2147483000;max-height:min(60vh,420px);overflow:auto;padding:var(--space-3) var(--space-4);
  color:var(--ui-text);font:var(--fs-12)/1.65 var(--font-ui)}
#cp171-s-pop[hidden]{display:none}
#cp171-s-pop h4{margin:0 0 var(--space-1h);font-size:var(--fs-13);font-weight:var(--fw-medium);color:var(--ui-text-strong)}
#cp171-s-pop p{margin:0 0 var(--space-2)}
#cp171-s-pop dl{margin:0 0 var(--space-2);padding:0}
#cp171-s-pop dt{margin:var(--space-1h) 0 var(--space-half);font-weight:var(--fw-medium);color:var(--ui-text-strong)}
#cp171-s-pop dd{margin:0 0 var(--space-1);padding-left:var(--space-2);border-left:2px solid var(--ui-line);color:var(--ui-text-muted)}
#cp171-s-pop .when{margin:var(--space-2) 0 0;padding-top:var(--space-2);border-top:.5px solid var(--ui-line)}
@media (max-width:700px){
  #${ID}{padding:12px var(--space-4) var(--space-8)}
  #${ID} .cp171-s-head{margin-left:calc(var(--space-4) * -1);margin-right:calc(var(--space-4) * -1);padding-left:var(--space-4)}
  #${ID} .ekp-select,#${ID} .ekp-input{width:min(280px,52vw)}
}
`;

let root = null, open = false, pending = null;

function style(){
  if (document.getElementById('cp171-settings-style')) return;
  const st = document.createElement('style');
  st.id = 'cp171-settings-style';
  st.textContent = CSS;
  document.head.appendChild(st);
}

function get(k){
  try { return (typeof settings !== 'undefined' && settings) ? settings[k] : undefined; } catch (_) { return undefined; }
}

/** 寫入目前文件的執行期投影，再由文件設定模組原子同步到 Markdown。 */
function set(k, v){
  try {
    if (typeof settings === 'undefined' || !settings) return;
    settings[k] = v;
    /* 模式本身帶有官方字級預設。若從 preprint 切到 reprint 還保留明確 12pt，
       就會把前一模式的 grid 帶入新模式。一次事件內先回到 auto，再做唯一一次
       normalize／文件寫回／重新編譯，避免 UI、Markdown 與 main.tex 中間態分叉。 */
    if (k === 'revtexMode') settings.revtexFontSize = 'auto';
    const D = K.registry && K.registry.revtexDocumentSettings;
    if (D && D.normalizeRuntime) D.normalizeRuntime(null, { replace:false, reason:'layout-panel' });
    else if (typeof normalizeRevtexSettings === 'function') normalizeRevtexSettings();
    if (typeof revtexApplyThemeProfile === 'function') revtexApplyThemeProfile();
    if (D && D.runtimeChanged) D.runtimeChanged('layout-panel');
    if (typeof persist === 'function') persist();
    else if (typeof saveSettings === 'function') saveSettings();
  } catch (e) { K.log.error('revtexSettings', '寫入 ' + k + ' 失敗：' + (e && e.message)); }
  refreshClassLine();
  scheduleRecompile();
}

/* 合併變更：連續改好幾個選項時只重編一次。
   v4.0 起不自己排程——orch 是唯一的排程者（見 DECISION-v4.0.md 的競態修正）。
   touch() 標記內容已變更，orch 自己的 debounce 會合併連續變更成一次編譯。 */
function scheduleRecompile(){
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    const O = K.need('orch');
    if (O && O.touch) O.touch();
  }, 300);
}

function refreshClassLine(){
  if (!root) return;
  const el = root.querySelector('.cp171-s-cls');
  if (!el) return;
  const E = K.need('emit');
  try {
    const opts = E && E.classOptions ? E.classOptions(settings) : [];
    el.textContent = '\\documentclass[' + opts.join(',') + ']{revtex4-2}';
  } catch (_) { el.textContent = '（無法產生）'; }
}

function lang(){
  try { if (document.body && document.body.classList.contains('lang-en')) return 'en'; } catch (_) {}
  try { return (typeof settings !== 'undefined' && settings && settings.lang === 'en') ? 'en' : 'zh'; } catch (_) { return 'zh'; }
}
const pickL = v => Array.isArray(v) ? (lang() === 'en' && v[1] ? v[1] : v[0]) : String(v == null ? '' : v);
const escH = x => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
let builtLang = '';

function rowHTML(it){
  const id = 'cps-' + it.k, label = escH(pickL(it.label));
  const info = it.info && OPTION_DOCS[it.k]
    ? '<button type="button" class="cp171-s-info" data-info="' + it.k + '" aria-label="' + escH(pickL(L('說明：', 'About: '))) + label + '">i</button>' : '';
  const note = it.note ? '<span class="ekp-note">' + escH(pickL(it.note)) + '</span>' : '';
  if (it.type === 'bool') {
    return '<label class="ekp-row ekp-switch" for="' + id + '"><span class="ekp-label"><span><span>' + label + '</span>' + info + '</span>' + note + '</span>'
      + '<span class="ekp-ctl"><input type="checkbox" role="switch" id="' + id + '" data-key="' + it.k + '"></span></label>';
  }
  let ctl = '';
  if (it.type === 'select') {
    ctl = '<select class="ekp-select" id="' + id + '" data-key="' + it.k + '">'
      + it.opts.map(o => '<option value="' + escH(o[0]) + '">' + escH(pickL(o[1])) + '</option>').join('') + '</select>';
  } else if (it.type === 'seg') {
    ctl = '<div class="ekp-seg" role="radiogroup" id="' + id + '" data-key="' + it.k + '" aria-label="' + label + '">'
      + it.opts.map(o => '<button class="ekp-seg-btn" type="button" role="radio" data-value="' + escH(o[0]) + '" aria-checked="false">' + escH(pickL(o[1])) + '</button>').join('') + '</div>';
  } else {
    ctl = '<input class="ekp-input" type="text" id="' + id + '" data-key="' + it.k + '" spellcheck="false" placeholder="' + escH(pickL(it.ph || '')) + '">';
  }
  const lab = it.type === 'seg' ? '<span>' + label + '</span>' : '<label for="' + id + '">' + label + '</label>';
  return '<div class="ekp-row"><div class="ekp-label"><span>' + lab + info + '</span>' + note + '</div><div class="ekp-ctl">' + ctl + '</div></div>';
}

function build(){
  if (root && document.getElementById(ID) && builtLang === lang()) return root;
  const scroller = document.getElementById('scroller');
  if (!scroller) return null;
  style();
  if (root && root.parentNode) root.parentNode.removeChild(root);
  builtLang = lang();

  root = document.createElement('div');
  root.id = ID;
  root.setAttribute('data-cp171', '');
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', pickL(L('版面設定', 'Layout settings')));

  const parts = ['<div class="cp171-s-inner">'];
  parts.push('<div class="cp171-s-head"><h2 class="ekp-h">' + escH(pickL(L('版面設定', 'Layout settings'))) + '</h2>'
    + '<span class="ekp-note">' + escH(pickL(L('改了右邊會自動重新編譯。', 'Changes recompile the PDF on the right.'))) + '</span></div>');
  let moreOpened = false;
  for (const g of GROUPS) {
    if (!g.open && !moreOpened) {
      parts.push('<details class="ekp-adv cp171-s-more"><summary>' + escH(pickL(L('更多設定', 'More settings'))) + '</summary><div class="ekp-adv-body">');
      moreOpened = true;
    }
    parts.push('<div class="ekp-group-h">' + escH(pickL(g.title)) + '</div>');
    for (const it of g.items) parts.push(rowHTML(it));
  }
  /* \documentclass 那一行只對懂 LaTeX 的人有用，放在「更多設定」最後，旁邊是「恢復預設」。 */
  parts.push('<div class="cp171-s-foot"><code class="cp171-s-cls"></code>'
    + '<button type="button" class="ekp-link" id="cps-reset">' + escH(pickL(L('這份文件恢復預設版面', 'Reset this document to the default layout'))) + '</button></div>');
  if (moreOpened) parts.push('</div></details>');
  parts.push('</div>');
  root.innerHTML = parts.join('\n');
  scroller.appendChild(root);

  /* ---- 「i」說明泡泡 -------------------------------------------------------
     一個面板共用一個泡泡節點：開的時候才填內容、定位到那顆「i」旁邊。
     滑鼠移到 i 上就開、移開 250ms 後關；但移進泡泡本身不會關（否則捲不動），
     點擊則是釘住／取消釘住。Esc 與捲動面板都會關。 */
  let pop = document.getElementById('cp171-s-pop');
  if (!pop) {
    pop = document.createElement('div');
    pop.id = 'cp171-s-pop';
    pop.setAttribute('data-cp171', '');
    pop.setAttribute('role', 'tooltip');
    pop.hidden = true;
    document.body.appendChild(pop);
  }
  let popTimer = null, pinned = false;
  const closePop = () => { pinned = false; pop.hidden = true; };
  const scheduleClose = () => { clearTimeout(popTimer); popTimer = setTimeout(() => { if (!pinned) pop.hidden = true; }, 250); };
  const keepOpen = () => clearTimeout(popTimer);

  /* 說明文是雙語結構 [中文, English]，依目前語言挑一個（見 OPTION_DOCS 上方的說明）。 */
  function infoHTML(key, label){
    const d = OPTION_DOCS[key]; if (!d) return '';
    const en = lang() === 'en';
    const pick = v => Array.isArray(v) ? (en && v[1] ? v[1] : v[0]) : v;
    const out = ['<h4>' + escH(label) + '</h4>'];
    if (d.what) out.push('<p>' + pick(d.what) + '</p>');
    if (d.opts && d.opts.length) {
      out.push('<dl>');
      for (const o of d.opts) out.push('<dt>' + pick(o[0]) + '</dt><dd>' + pick(o[1]) + '</dd>');
      out.push('</dl>');
    }
    if (d.when) out.push('<p class="when"><b>' + (en ? 'When to change it: ' : '什麼時候要改：') + '</b>' + pick(d.when) + '</p>');
    return out.join('');
  }
  function openPop(btn){
    const key = btn.getAttribute('data-info');
    const it = GROUPS.reduce((a, g) => a || g.items.find(x => x.k === key), null);
    const html = infoHTML(key, it ? pickL(it.label) : key);
    if (!html) return;
    pop.innerHTML = html;
    pop.hidden = false;
    /* 優先放在按鈕右側，右邊空間不夠就翻到左側；垂直方向夾在視窗內。 */
    const r = btn.getBoundingClientRect();
    const w = 340, gap = 10;
    let x = r.right + gap;
    if (x + w > window.innerWidth - 12) x = Math.max(12, r.left - gap - w);
    pop.style.left = x + 'px';
    pop.style.width = Math.min(w, window.innerWidth - 24) + 'px';
    const h = pop.offsetHeight || 240;
    let y = Math.max(12, r.top - 8);
    if (y + h > window.innerHeight - 12) y = Math.max(12, window.innerHeight - 12 - h);
    pop.style.top = y + 'px';
  }
  root.addEventListener('mouseover', e => {
    const b = e.target && e.target.closest && e.target.closest('.cp171-s-info');
    if (b) { keepOpen(); openPop(b); }
  });
  root.addEventListener('mouseout', e => {
    if (e.target && e.target.closest && e.target.closest('.cp171-s-info')) scheduleClose();
  });
  root.addEventListener('click', e => {
    const b = e.target && e.target.closest && e.target.closest('.cp171-s-info');
    if (b) {
      /* 「i」在開關列的 <label> 裡：取消預設動作，免得點說明時順便切換開關。 */
      e.preventDefault(); e.stopPropagation();
      if (!pop.hidden && pinned && pop.getAttribute('data-for') === b.getAttribute('data-info')) { closePop(); return; }
      openPop(b); pinned = true; pop.setAttribute('data-for', b.getAttribute('data-info'));
      return;
    }
    const seg = e.target && e.target.closest && e.target.closest('.ekp-seg-btn');
    if (seg) {
      const group = seg.parentNode, k = group.getAttribute('data-key');
      group.querySelectorAll('.ekp-seg-btn').forEach(x => x.setAttribute('aria-checked', x === seg ? 'true' : 'false'));
      set(k, seg.getAttribute('data-value'));
      if (['revtexColumns'].includes(k)) sync();
    }
  });
  pop.addEventListener('mouseenter', keepOpen);
  pop.addEventListener('mouseleave', scheduleClose);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });
  /* 1.2.8（審查）：釘住的說明泡泡在點別處、關閉版面設定或打開對話框時都要收起，不能留在畫面上。 */
  document.addEventListener('mousedown', e => {
    if (pop.hidden) return;
    if (pop.contains(e.target) || (e.target.closest && e.target.closest('.cp171-s-info'))) return;
    closePop();
  }, true);
  K.on && K.on('settings:close', closePop);
  root.addEventListener('scroll', () => { if (!pinned) pop.hidden = true; }, { passive: true });

  root.addEventListener('change', e => {
    const t = e.target;
    const k = t && t.getAttribute && t.getAttribute('data-key');
    if (!k) return;
    if (t.type === 'checkbox') set(k, t.checked);
    else set(k, t.value);
    // 改學會要立刻重建期刊清單（並在必要時把非法期刊改成合法值）
    if (k === 'revtexSociety') syncJournalOptions();
    if (['revtexMode','revtexSociety','revtexPaper','revtexColumns','revtexFontSize','revtexJournal'].includes(k)) sync();
  });
  root.addEventListener('input', e => {
    const t = e.target;
    if (t && t.type === 'text' && t.getAttribute('data-key')) set(t.getAttribute('data-key'), t.value);
  });

  root.querySelector('#cps-reset').onclick = () => {
    try {
      const D = K.registry && K.registry.revtexDocumentSettings;
      if (D && D.resetRuntime) {
        D.resetRuntime();
        if (D.runtimeChanged) D.runtimeChanged('layout-panel-reset');
      }
      if (typeof revtexApplyThemeProfile === 'function') revtexApplyThemeProfile();
      if (typeof persist === 'function') persist();
    } catch (_) {}
    sync(); scheduleRecompile();
  };

  sync();
  try { if (window.__EKD_GLIDE__ && window.__EKD_GLIDE__.attach) window.__EKD_GLIDE__.attach(); } catch (_) {}
  K.log.info('revtexSettings', '設定面板已建立（' + GROUPS.reduce((a, g) => a + g.items.length, 0) + ' 項）');
  return root;
}

/** 依目前學會重建期刊下拉選單；若現值不屬於該學會，自動改成第一個合法值。 */
function syncJournalOptions(){
  if (!root) return;
  const sel = root.querySelector('#cps-revtexJournal');
  if (!sel) return;
  const soc = String(get('revtexSociety') || 'aps');
  const list = JOURNALS_BY_SOCIETY[soc] || JOURNALS_BY_SOCIETY.aps;
  const cur = String(get('revtexJournal') || '');
  sel.innerHTML = list.map(o => '<option value="' + o[0] + '">' + o[1] + '</option>').join('');
  const legal = list.some(o => o[0] === cur);
  if (!legal) {
    /* 換學會後舊期刊代碼多半不合法（例如 aps→aip 時的 prl）。直接靜默沿用
       會讓 REVTeX 忽略它並套預設期刊，使用者看不出差別，所以主動改成該
       學會的第一個期刊，並讓使用者看到選單真的變了。 */
    set('revtexJournal', list[0][0]);
    sel.value = list[0][0];
  } else {
    sel.value = cur;
  }
}

/** 把目前 settings 的值同步到面板控件上 */
function sync(){
  if (!root) return;
  for (const g of GROUPS) for (const it of g.items) {
    const el = root.querySelector('#cps-' + it.k);
    if (!el) continue;
    const v = get(it.k);
    if (it.type === 'bool') el.checked = !!v;
    else if (it.type === 'seg') el.querySelectorAll('.ekp-seg-btn').forEach(b => b.setAttribute('aria-checked', String(v) === b.getAttribute('data-value') ? 'true' : 'false'));
    else if (v !== undefined && v !== null) el.value = String(v);
  }
  syncJournalOptions();
  refreshClassLine();
}

/** main.tex 產生方式那一列的開關與說明文字。 */


function show(){
  if (!build()) return false;
  sync();
  document.body.classList.add('cp171-settings-open');
  /* 1.2.8：直接呼叫 show()（網站導覽、偏好設定的「開啟版面設定」）時，右上角的切換鈕也要跟著變成「回到編輯」。 */
  const tb = document.getElementById('cp171-left-toggle');
  if (tb) { tb.setAttribute('data-on', '1'); tb.textContent = pickL(L('回到編輯', 'Back to editing')); }
  /* 減量模式的淡入由 WAAPI 驅動：主程式的全域減量政策
     （@media reduce{*{animation:none!important;transition:none!important}}）
     會蓋掉任何非 !important 的 CSS 減量變體，這是 10.2–10.3 四種 CSS
     寫法全部不觸發的真正根因（詳見上方 CSS「減量動畫」註解）。
     element.animate() 不走 CSS 層級，不受該政策影響。只在 reduce 模式
     走這條——no-preference 的完整進場動畫（CSS cp171SettingsIn）
     已驗證正常，不重複播。 */
  try {
    if (root && root.animate && window.matchMedia &&
        matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: 'linear' });
    }
  } catch (_) {}
  open = true;
  K.emit('settings:open', {});
  return true;
}
function close(){
  document.body.classList.remove('cp171-settings-open');
  open = false;
  const b = document.getElementById('cp171-left-toggle');
  if (b) { b.setAttribute('data-on', '0'); b.textContent = pickL(L('版面設定', 'Layout settings')); }
  K.emit('settings:close', {});
  return false;
}
function toggle(){ return open ? close() : show(); }

K.register('revtexSettings', {
  version: '3.2.0',
  show, close, toggle, sync,
  isOpen: () => open,
  groups: () => GROUPS,
  journals: () => JOURNALS_BY_SOCIETY,
  keyCount: GROUPS.reduce((a, g) => a + g.items.length, 0)
});
K.log.info('revtexSettings', 'CP171 REVTeX 版面設定面板就緒');
})();
