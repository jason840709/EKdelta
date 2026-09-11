
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
           [['manuscript','manuscript'],['雙倍行距投稿版，部分期刊的投稿要求。',
                                          'Double-spaced submission format, required by some journals.']],
           [['galley','galley'],['長條校樣，單欄不分頁。','A galley proof: one column, unpaginated.']]],
    when: ['自己校稿看版面用 reprint；期刊要求雙倍行距時用 manuscript。',
           'Use reprint to check the layout yourself; use manuscript when the journal asks for double spacing.'],
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
    opts: [[['依排版模式自動','Automatic by mode'],['不輸出額外字級；preprint／manuscript 由官方選 12pt，reprint 由官方選 10pt。切換排版模式時會回到這個安全值。',
                                                     'Emits no extra size option: official preprint/manuscript selects 12pt and reprint selects 10pt. Changing mode returns to this safe value.']],
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

const GROUPS = [
  {
    title: '期刊與版式',
    hint: '決定整份稿件的基本樣式。改這一組通常會讓頁數整個變動。',
    items: [
      { k: 'revtexSociety', label: '學會', type: 'select',
        opts: [['aps', 'APS（美國物理學會）'], ['aip', 'AIP（美國物理聯合會）'],
               ['aapm', 'AAPM（美國醫學物理學家學會）'], ['sor', 'SOR（流變學會）']],
        note: '決定套用哪一份官方 .rtx 樣式覆寫；換學會時期刊清單會跟著換' },
      { k: 'revtexJournal', label: '期刊', type: 'select',
        /* 期刊清單依學會連動（見下方 JOURNALS_BY_SOCIETY）。這裡只放預設的
           APS 清單當初始值，實際內容由 syncJournalOptions() 依學會重建。
           清單全部取自官方套件的 \DeclareOption{<代碼>}{\change@journal}
           宣告，不是憑印象列的——先前把 AIP 的 apl/jap/jcp 混進 APS 清單、
           又列了官方根本不存在的 prresearch，選到就會被 REVTeX 靜默忽略
           並 fallback 成預設期刊，使用者完全不會收到任何提示。 */
        opts: [['prl', 'PRL']],
        note: '各期刊的標題、摘要與書目細節不同；清單已對齊官方 .rtx 宣告' },
      { k: 'revtexMode', label: '排版模式', type: 'select',
        opts: [['reprint', 'reprint（雙欄緊排，接近見刊樣貌）'],
               ['preprint', 'preprint（單欄寬行距，投稿審閱用）'],
               ['twocolumn', 'twocolumn'],
               ['galley', 'galley（長條校樣，單欄不分頁）'],
               ['checkin', 'checkin（內部審稿：頁首顯示日期）']],
        /* ★ 官方 cls 裡「manuscript」是已廢棄選項，內部直接
           \ExecuteOptions{preprint} 並發出 obsolete 警告——它不是獨立
           模式，只是 preprint 的舊名。先前這裡的說明文字誤植了這個字眼，
           讓人誤以為選單漏了什麼，其實選單從來沒有、也不該有這個選項。 */
        note: 'preprint 會在摘要正前方加入可選軟分頁；短稿可能留在首頁，正文變長後 TeX 可能改從第二頁開始。這不是固定獨立標題頁。' },
      { k: 'revtexColumns', label: '欄數', type: 'select',
        opts: [['auto', '依模式自動'], ['onecolumn', '單欄'], ['twocolumn', '雙欄']] },
      { k: 'revtexPaper', label: '紙張', type: 'select',
        /* 官方 cls 第 5938-5962 行證實：a5paper/b5paper/legalpaper/
           executivepaper 這四個選項只設定 \paperwidth/\paperheight
           （送印的實體紙張尺寸），完全不連動調整 \linewidth/\textwidth
           （版心寬度）——版心永遠固定在跟 letterpaper 相同的 510pt，
           而 a5 紙張本身只有 421pt 寬，版心比紙張還寬 89pt。矩陣測試
           實測：這四種紙張下，任何跨欄內容都會被印到紙張邊界外，
           肉眼截圖清楚可見（見 CP171_矩陣測試計畫 v2 的 L2 記錄）。
           官方作者指南全文沒有提到這四個選項的任何使用說明，判斷這是
           REVTeX 本身的已知邊緣情況，不是能在轉譯層修正的問題——
           因此面板只暴露版心行為正常的 letterpaper／a4paper。 */
        opts: [['letterpaper', 'Letter'], ['a4paper', 'A4']] },
      { k: 'revtexFontSize', label: '字級', type: 'select',
        opts: [['auto', '依排版模式自動（preprint 12pt／reprint 10pt）'],
               ['10pt', '10pt'], ['11pt', '11pt'], ['12pt', '12pt']],
        note: '切換排版模式時會回到自動。AIP reprint + Letter + 雙欄的 11pt／12pt 會自動校正為官方模式字級，避免第一頁下緣溢位。' },
      { k: 'revtexEndfloats', label: '浮動體位置', type: 'select',
        /* 官方 cls：\DeclareOption{endfloats} 關掉 floats@sw；
           endfloats* 額外開 floatp@sw（每個浮動體各自獨立成頁，
           而非集中排在一起）。多數期刊投稿要求圖表集中在文末，
           這是常被忽略但實際投稿常用的選項。 */
        opts: [['inline', '穿插在正文中（預設）'],
               ['endfloats', '集中在文件最後'],
               ['endfloats*', '集中在文件最後，各自獨立成頁']] },
      { k: 'revtexBottomAlign', label: '版面底部對齊', type: 'select',
        opts: [['flushbottom', '齊底（預設，拉伸行距對齊）'],
               ['raggedbottom', '不齊底（允許留白）']] },
      { k: 'revtexSides', label: '單雙面', type: 'select',
        opts: [['twoside', '雙面'], ['oneside', '單面']] }
    ]
  },
  {
    title: '作者與前置',
    items: [
      { k: 'revtexAddress', label: '單位排列', type: 'select',
        opts: [['groupedaddress', '分組（同單位作者併列）'],
               ['superscriptaddress', '上標編號（多單位常用）'],
               ['unsortedaddress', '不排序'], ['runinaddress', '接排']] },
      { k: 'revtexAltaffilStyle', label: '現職單位標記樣式', type: 'select',
        /* \altaffiliation（作者現在所屬的其他單位）的標記符號用字母
           還是符號區分。官方 cls 預設值是 symbol（\@booleanfalse
           altaffilletter@sw 出現在 DeclareOption 區塊外、屬於預設
           初始化），這裡的 UI 預設值要跟官方一致。 */
        opts: [['symbol', '符號（*, †, ‡ …，預設）'], ['letter', '字母（a, b, c …）']] },
      { k: 'revtexTitlePage', label: '首頁前置區分頁', type: 'select',
        /* 三態不是單純 titlepage bool。官方 preprint 的摘要前軟分頁由
           preprintsty@sw 控制，notitlepage 只切 titlepage@sw，兩者互相獨立。
           因此 off 除了輸出 notitlepage，發射器也會局部抑制摘要前軟分頁；
           auto 則零注入，保留可和官方手寫 LaTeX 做像素 parity 的行為。 */
        opts: [['auto', '依官方行為（摘要可能換頁）'], ['on', '強制獨立標題頁'], ['off', '強制連續首頁（抑制摘要前軟分頁）']] },
      { k: 'revtexPreprintNumbers', label: '顯示 preprint 編號', type: 'bool' },
      { k: 'revtexShowPacs', label: '顯示 PACS', type: 'bool' },
      { k: 'revtexShowKeys', label: '顯示關鍵字', type: 'bool' }
    ]
  },
  {
    title: '文獻與註腳',
    items: [
      { k: 'revtexCitation', label: '引用樣式', type: 'select',
        opts: [['numerical', '數字 [1]'], ['author-year', '作者年份 (Smith 2026)']] },
      { k: 'revtexLongBibliography', label: '完整書目（含標題）', type: 'bool' },
      { k: 'revtexEprint', label: '顯示 arXiv eprint', type: 'bool' },
      { k: 'revtexBibnotes', label: '註腳併入書目', type: 'bool',
        note: 'REVTeX 用書目機制實作腳註，這個開關決定它們排在頁尾還是書目區' },
      { k: 'revtexFootInBib', label: 'footinbib', type: 'bool' }
    ]
  },
  {
    title: '版面微調',
    hint: '這一組是真正的「微調」——改了通常只動局部，不會整份重排。',
    items: [
      { k: 'revtexBalanceLastPage', label: '末頁平衡雙欄', type: 'bool' },
      { k: 'revtexTightenLines', label: '緊排行距', type: 'bool' },
      { k: 'revtexFloatFix', label: '浮動體修正（floatfix）', type: 'bool',
        note: '避免圖表卡在頁尾排不下時無限往後推' },
      { k: 'revtexFleqn', label: '公式靠左（fleqn）', type: 'bool' },
      { k: 'revtexEqSecNum', label: '式號依章節編號', type: 'bool' },
      { k: 'revtexSecNumArabic', label: '章節用阿拉伯數字', type: 'bool' },
      { k: 'revtexLineNumbers', label: '顯示行號', type: 'bool',
        note: '有些期刊審稿要求' },
      { k: 'revtexLengthCheck', label: '長度檢查', type: 'bool',
        note: 'PRL 有頁數上限時很有用' },
      { k: 'revtexDraft', label: 'draft 模式', type: 'bool',
        note: '編譯較快，圖片以外框替代' },
      { k: 'revtexLandscape', label: '橫向', type: 'bool' }
    ]
  },
  {
    title: '套件與進階',
    items: [
      { k: 'revtexAmsmath', label: 'amsmath', type: 'bool' },
      { k: 'revtexAmssymb', label: 'amssymb', type: 'bool' },
      { k: 'revtexHyperref', label: 'hyperref（超連結）', type: 'bool' },
      { k: 'texBooktabs', label: '表格用 booktabs 三線', type: 'bool' },
      { k: 'texListings', label: '程式碼用 listings', type: 'bool' },
      { k: 'revtexExtraOptions', label: '額外 class option', type: 'text',
        note: '逗號分隔。這裡填的東西會原樣加進 \\documentclass[...]' }
    ]
  }
];

const CSS = `
/* ---------- 動畫規約（依 Emil Kowalski / Apple Design 標準）-------------
 * 面板開啟屬於「occasional」頻率（使用者調版面設定時才開），適用 standard
 * animation。先前是 display:none/block 硬切換，完全沒有過渡——內容瞬間
 * 憑空出現，使用者無從判斷「這是新開的一層」還是「原本的內容被換掉了」。
 *
 * 選用：
 *   目的  = state indication（進入設定模式）+ spatial consistency（從上方落下）
 *   曲線  = ease-out 系（進場動畫不可用 ease-in——它把使用者最在意的那一刻
 *           延後，是硬性違規）
 *   時長  = 180ms（UI 動畫需 < 300ms）
 *   屬性  = 只用 transform / opacity（GPU 合成，不觸發 layout）
 *   起點  = translateY(-6px) + opacity 0，不用 scale(0)（那會像從無到有
 *           長出來，不像一層蓋上來）
 * display 不能參與 transition，所以用 @starting-style 讓瀏覽器知道
 * 「從哪個狀態開始」；不支援的瀏覽器就直接顯示，不會壞掉。
 */
#${ID}{display:none;position:absolute;inset:0;z-index:30;overflow-y:auto;
  background:var(--bg-editor,var(--bg,#fff));padding:52px 26px 60px;
  font:12.5px/1.6 var(--font-ui,ui-sans-serif,system-ui,sans-serif);color:var(--text,inherit)}
body.cp171-settings-open #${ID}{display:block}
body.cp171-settings-open #editor{visibility:hidden}
/* ---------- 動畫規約（依 Emil Kowalski / Apple Design 標準）-------------
 * 面板開啟屬「occasional」頻率，適用 standard animation。先前是
 * display:none/block 硬切換，內容瞬間憑空出現，使用者無從判斷這是新開
 * 的一層還是原本內容被換掉。
 *   目的 = state indication（進入設定模式）+ spatial consistency（從上落下）
 *   曲線 = ease-out 系（進場不可用 ease-in，它把使用者最在意的那一刻延後）
 *   時長 = 180ms（UI 動畫需 < 300ms）
 *   屬性 = 只用 transform / opacity（GPU 合成，不觸發 layout）
 *   起點 = translateY(-6px)+opacity 0，不用 scale(0)（那像從無到有長出來）
 * ★ 這段必須放在上面的基礎規則「之後」：同一個選擇器權重相同時後者勝出，
 *   寫在前面會被 body.cp171-settings-open #ID{display:block} 那行洗掉，
 *   減量版就永遠不會生效（實測用 reduced_motion 情境抓到過）。 */
/* @keyframes 定義在 media query 之外：巢狀在 @media 內雖然合法，但各家
   瀏覽器對「規則可見性」的處理不一致，實測有拿不到的情況。定義放外面、
   只用 media query 決定「套哪一支」最穩。 */
@keyframes cp171SettingsIn{
  from{opacity:0;transform:translateY(-6px)}
  to{opacity:1;transform:none}
}
@media (prefers-reduced-motion: no-preference){
  body.cp171-settings-open #${ID}{
    animation:cp171SettingsIn var(--mac-dur-base,180ms) var(--mac-ease-out,cubic-bezier(.22,1,.36,1)) both;
  }
}
/* ---------- 減量動畫：由 JS（WAAPI）驅動，CSS 不再嘗試 ----------
   標準要求「gentler, not zero」——完全不動反而讓人以為畫面卡住，
   所以減量版仍保留 120ms 淡入，只拿掉位移。
   ★ 為什麼 CSS 做不到（1.1.3.10.5 更正歸因）：主程式 CP139 起就有
   全域政策「@media reduce{ *{animation:none!important;
   transition:none!important} }」，任何非 !important 的 CSS 減量變體
   （keyframes 內嵌 media／外置／獨立宣告／transition+@starting-style
   四種寫法）都被它蓋掉，animationstart／transitionstart 事件因此皆為
   空陣列。10.2–10.3 期間誤判為 Chromium 對 display:none→block 的觸發
   時機問題——結論（CSS 不可行）碰巧正確，歸因錯誤。
   WAAPI（element.animate）不走 CSS 層級，不受該政策影響，因此由
   show() 排程 120ms 淡入。實作見本檔 show()。
   （另一教訓不變：getComputedStyle 回報 animationName:none 是 both
   填充模式播完後的正常行為，驗證觸發必須掛事件，不能看 computed。） */
#${ID} h2{margin:0 0 4px;font-size:15px;font-weight:750}
#${ID} .cp171-s-lead{margin:0 0 20px;font-size:11.5px;color:var(--text-muted,#888);line-height:1.7}
#${ID} .cp171-s-grp{margin:0 0 22px;padding:0 0 4px}
#${ID} .cp171-s-grp>h3{margin:0 0 3px;font-size:12px;font-weight:750;letter-spacing:.02em}
#${ID} .cp171-s-grp>p.hint{margin:0 0 10px;font-size:11px;color:var(--text-muted,#888)}
#${ID} .cp171-s-info{margin-left:6px;width:15px;height:15px;padding:0;flex:0 0 auto;
  display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;
  border:1px solid var(--border,rgba(128,128,128,.45));border-radius:50%;
  background:transparent;color:var(--text-muted,#888);
  font:600 10px/1 ui-sans-serif,system-ui,sans-serif;cursor:help;opacity:.7;
  transition:opacity var(--mac-dur-fast,150ms) var(--mac-ease-out,ease)}
#${ID} .cp171-s-info:hover{opacity:1;color:var(--accent,inherit);border-color:var(--accent,currentColor)}
#cp171-s-pop{position:fixed;z-index:2147483000;max-height:min(60vh,420px);overflow:auto;
  padding:12px 14px;border:1px solid var(--border,rgba(128,128,128,.35));
  border-radius:var(--mac-radius-popover,12px);
  background:var(--bg-panel,var(--bg-editor,#fff));color:var(--text,#222);
  box-shadow:var(--mac-shadow-popover,0 8px 28px rgba(0,0,0,.18));
  font-size:12px;line-height:1.7;-webkit-overflow-scrolling:touch}
#cp171-s-pop[hidden]{display:none}
#cp171-s-pop h4{margin:0 0 6px;font-size:12.5px;font-weight:700}
#cp171-s-pop p{margin:0 0 8px}
#cp171-s-pop dl{margin:0 0 8px;padding:0}
#cp171-s-pop dt{margin:6px 0 2px;font-weight:600;color:var(--text-strong,inherit)}
#cp171-s-pop dd{margin:0 0 4px;padding-left:10px;border-left:2px solid var(--border,rgba(128,128,128,.3));
  color:var(--text-muted,#888)}
#cp171-s-pop .when{margin:8px 0 0;padding-top:8px;border-top:1px solid var(--border,rgba(128,128,128,.25))}
#${ID} .cp171-s-row{display:grid;grid-template-columns:minmax(120px,32%) 1fr;gap:10px;
  align-items:start;padding:7px 0;border-bottom:1px solid var(--border,rgba(128,128,128,.16))}
#${ID} .cp171-s-row>label{display:flex;align-items:center;font-size:12px;font-weight:600;padding-top:3px}
#${ID} .cp171-s-row .val{display:flex;flex-direction:column;gap:3px}
#${ID} .cp171-s-row small{font-size:10.5px;color:var(--text-muted,#888);line-height:1.55}
#${ID} select,#${ID} input[type=text]{height:28px;padding:0 8px;border:1px solid var(--border,rgba(128,128,128,.4));
  border-radius:var(--mac-radius-control,8px);background:var(--bg,transparent);color:inherit;font:12px/1 var(--font-ui,inherit);max-width:340px}
#${ID} input[type=checkbox]{width:16px;height:16px;margin:4px 0}
#${ID} .cp171-s-foot{position:sticky;bottom:-60px;margin:24px -26px -60px;padding:12px 26px;
  background:var(--bg-panel,rgba(250,250,252,.96));border-top:1px solid var(--border,rgba(128,128,128,.3));
  display:flex;align-items:center;gap:8px;flex-wrap:wrap}
#${ID} .cp171-s-foot button{height:28px;padding:0 12px;border:1px solid var(--border,rgba(128,128,128,.4));
  border-radius:var(--mac-radius-control,8px);background:var(--bg,transparent);color:inherit;font:650 11.5px/1 var(--font-ui,inherit);cursor:pointer}
#${ID} .cp171-s-foot button[data-primary]{border-color:var(--accent,#3d6fd4);background:var(--accent,#3d6fd4);color:#fff}
/* 設定面板的按鈕沿用與右側面板完全相同的互動語彙——同一個產品裡
   「按鈕被按下」不該有兩種感覺。數值刻意與 cp171-56-split.js 一致：
   hover 閘門、100ms ease-out 系過渡、按壓 scale(0.97)。 */
@media (hover: hover) and (pointer: fine){
  #${ID} .cp171-s-foot button:hover:not(:disabled){border-color:var(--accent,#3d6fd4)}
  #${ID} .cp171-s-foot button:not([data-primary]):hover:not(:disabled){background:var(--accent-soft,rgba(61,111,212,.12))}
}
@media (prefers-reduced-motion: no-preference){
  #${ID} .cp171-s-foot button:not(:disabled){transition:transform var(--mac-dur-instant,100ms) var(--mac-ease-out,cubic-bezier(.22,1,.36,1)),
    background-color var(--mac-dur-instant,100ms) var(--mac-ease-out,ease-out),border-color var(--mac-dur-instant,100ms) var(--mac-ease-out,ease-out)}
}
#${ID} .cp171-s-foot button:active:not(:disabled){transform:scale(0.97)}
#${ID} .cp171-s-foot .sp{flex:1}
#${ID} code.cp171-s-cls{display:block;margin-top:8px;padding:8px 10px;border-radius:7px;
  background:rgba(128,128,128,.12);font:10.5px/1.6 var(--font-mono,ui-monospace,monospace);word-break:break-all}
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

function build(){
  if (root && document.getElementById(ID)) return root;
  const scroller = document.getElementById('scroller');
  if (!scroller) return null;
  style();

  root = document.createElement('div');
  root.id = ID;
  root.setAttribute('data-cp171', '');

  const parts = [];
  parts.push('<h2>國際論文版面設定</h2>');
  parts.push('<p class="cp171-s-lead">改任何一項，右邊的 PDF 會在 0.7 秒後重新編譯——'
    + '你調的是 REVTeX 的 class option，看到的是真正的排版結果，不是模擬。<br>'
    + '不需要記任何 LaTeX 指令；最下面會即時顯示這組設定實際產生的 <code>\\documentclass</code> 行。</p>');

  /* main.tex 產生方式：使用者原話「我不太懂你在說哪裡，我要怎麼設定這個東西」——
     指的是右半編譯狀態列偶爾出現的「main.tex 來自既有 CP166 發射器」提示。
     那則提示是 CP171 自己的完整性檢查（engine.js 的 texMatches），不是校正模式；
     校正模式已在 v4.0 整組退場。這裡補上一個看得到、按得到的開關，取代原本
     只能打 console 呼叫 K.setFlag('takeoverTex', true) 才能切換的狀態。 */
  parts.push('<section class="cp171-s-grp cp171-s-engine"><h3>main.tex 產生方式</h3>');
  parts.push('<p class="hint">決定右邊的 PDF 實際編譯自哪一份 .tex。'
    + '「CP171 發射器」跟這個版面設定面板保證一致（同一段程式碼算出來的）；'
    + '「既有發射器」相容既有用原生語法寫的文件（相容語法範例、臺灣論文模板等），'
    + '但不受這個面板任何一項設定影響。</p>');
  parts.push('<div class="cp171-s-row"><label for="cps-engine-toggle">使用 CP171 發射器</label><div class="val">'
    + '<input type="checkbox" id="cps-engine-toggle"><small id="cps-engine-note"></small></div></div>');
  parts.push('</section>');

  for (const g of GROUPS) {
    parts.push('<section class="cp171-s-grp"><h3>' + g.title + '</h3>');
    if (g.hint) parts.push('<p class="hint">' + g.hint + '</p>');
    for (const it of g.items) {
      /* label 後面的「i」：hover 或點擊都會開說明泡泡（見 OPTION_DOCS 與 infoHTML）。
         泡泡內容可捲動，因為選項之間的差異一兩句話講不完。 */
      const hasDoc = !!OPTION_DOCS[it.k];
      parts.push('<div class="cp171-s-row"><label for="cps-' + it.k + '">' + it.label
        + (hasDoc ? '<button type="button" class="cp171-s-info" data-info="' + it.k
                  + '" aria-label="說明：' + it.label + '" title="說明">i</button>' : '')
        + '</label><div class="val">');
      if (it.type === 'select') {
        parts.push('<select id="cps-' + it.k + '" data-key="' + it.k + '">'
          + it.opts.map(o => '<option value="' + o[0] + '">' + o[1] + '</option>').join('') + '</select>');
      } else if (it.type === 'bool') {
        parts.push('<input type="checkbox" id="cps-' + it.k + '" data-key="' + it.k + '">');
      } else {
        parts.push('<input type="text" id="cps-' + it.k + '" data-key="' + it.k + '" placeholder="例如 nofootinbib,superscriptaddress">');
      }
      if (it.note) parts.push('<small>' + it.note + '</small>');
      parts.push('</div></div>');
    }
    parts.push('</section>');
  }

  parts.push('<div class="cp171-s-foot">');
  parts.push('  <button id="cps-recompile" data-primary>立即重新編譯</button>');
  parts.push('  <button id="cps-back">回到編輯</button>');
  parts.push('  <span class="sp"></span>');
  parts.push('  <button id="cps-reset">回到期刊預設</button>');
  parts.push('</div>');
  parts.push('<code class="cp171-s-cls"></code>');

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
    pop.hidden = true;
    document.body.appendChild(pop);
  }
  let popTimer = null, pinned = false;
  const closePop = () => { pinned = false; pop.hidden = true; };
  const scheduleClose = () => { clearTimeout(popTimer); popTimer = setTimeout(() => { if (!pinned) pop.hidden = true; }, 250); };
  const keepOpen = () => clearTimeout(popTimer);

  /* 說明文是雙語結構 [中文, English]，依目前語言挑一個；
     不走 i18n 字典（見 OPTION_DOCS 上方的說明）。 */
  function infoHTML(key, label){
    const d = OPTION_DOCS[key]; if (!d) return '';
    let en = false;
    try { const I = K.need('i18n'); en = !!(I && I.isEN && I.isEN()); } catch (_) {}
    const pick = v => Array.isArray(v) ? (en && v[1] ? v[1] : v[0]) : v;
    const esc = x => String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;');
    const out = ['<h4>' + esc(label) + '</h4>'];
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
    const label = (btn.parentNode && btn.parentNode.textContent || '').replace(/i$/, '').trim();
    const html = infoHTML(key, label);
    if (!html) return;
    pop.innerHTML = html;
    pop.hidden = false;
    /* 定位：優先放在按鈕右側，右邊空間不夠就翻到左側；垂直方向夾在視窗內。 */
    const r = btn.getBoundingClientRect();
    const w = 340, gap = 10;
    let x = r.right + gap;
    if (x + w > window.innerWidth - 12) x = Math.max(12, r.left - gap - w);
    pop.style.left = x + 'px';
    pop.style.width = w + 'px';
    const h = pop.offsetHeight || 240;
    let y = r.top - 8;
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
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (!pop.hidden && pinned && pop.getAttribute('data-for') === b.getAttribute('data-info')) { closePop(); return; }
    openPop(b); pinned = true; pop.setAttribute('data-for', b.getAttribute('data-info'));
  });
  pop.addEventListener('mouseenter', keepOpen);
  pop.addEventListener('mouseleave', scheduleClose);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });
  scroller.addEventListener('scroll', () => { if (!pinned) pop.hidden = true; }, { passive: true });


  /* 同上：設定面板的標籤與說明也交給 i18n 層。 */
  try { const i18n = K.need('i18n'); if (i18n) i18n.watch(root); } catch (_) {}

  root.addEventListener('change', e => {
    const t = e.target;
    if (t && t.id === 'cps-engine-toggle') { toggleEngine(t.checked); return; }
    const k = t && t.getAttribute && t.getAttribute('data-key');
    if (!k) return;
    if (t.type === 'checkbox') set(k, t.checked);
    else set(k, t.value);
    // 改學會要立刻重建期刊清單（並在必要時把非法期刊改成合法值）
    if (k === 'revtexSociety') syncJournalOptions();
    if (['revtexMode','revtexSociety','revtexPaper','revtexColumns','revtexFontSize'].includes(k)) sync();
  });
  root.addEventListener('input', e => {
    const t = e.target;
    if (t && t.type === 'text' && t.getAttribute('data-key')) set(t.getAttribute('data-key'), t.value);
  });

  root.querySelector('#cps-recompile').onclick = () => { const O = K.need('orch'); if (O) O.compile(); };
  root.querySelector('#cps-back').onclick = () => close();
  root.querySelector('#cps-reset').onclick = () => {
    try {
      const D = K.registry && K.registry.revtexDocumentSettings;
      if (D && D.resetRuntime) {
        D.resetRuntime();
        if (D.runtimeChanged) D.runtimeChanged('layout-panel-reset');
      } else {
        const d = { revtexMode:'reprint', revtexColumns:'twocolumn', revtexPaper:'letterpaper',
          revtexFontSize:'auto', revtexCitation:'numerical', revtexSides:'twoside',
          revtexAddress:'superscriptaddress', revtexLongBibliography:true, revtexEprint:true,
          revtexBalanceLastPage:true, revtexFloatFix:true, revtexTightenLines:false,
          revtexDraft:false, revtexLineNumbers:false, revtexExtraOptions:'',
          revtexTitlePage:'auto', revtexEndfloats:'inline',
          revtexBottomAlign:'flushbottom', revtexAltaffilStyle:'symbol' };
        for (const [k, v] of Object.entries(d)) settings[k] = v;
        if (typeof normalizeRevtexSettings === 'function') normalizeRevtexSettings();
      }
      if (typeof revtexApplyThemeProfile === 'function') revtexApplyThemeProfile();
      if (typeof persist === 'function') persist();
    } catch (_) {}
    sync(); scheduleRecompile();
  };

  sync();
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
    else if (v !== undefined && v !== null) el.value = String(v);
  }
  syncEngineRow();
  syncJournalOptions();
  refreshClassLine();
}

/** main.tex 產生方式那一列的開關與說明文字。 */
function syncEngineRow(){
  if (!root) return;
  const cb = root.querySelector('#cps-engine-toggle');
  const note = root.querySelector('#cps-engine-note');
  if (!cb) return;
  const on = !!K.flags().takeoverTex;
  cb.checked = on;
  if (!note) return;
  const T = K.need('takeover');
  const last = T ? T.getLast() : null;
  if (!on) {
    note.textContent = '目前：既有發射器（相容既有文件；不受本面板設定影響）';
    note.style.color = '';
  } else if (last && last.ok) {
    note.textContent = '目前：CP171 發射器（已生效，' + last.tex.split('\n').length + ' 行）';
    note.style.color = '';
  } else if (last && !last.ok) {
    note.textContent = '已開啟，但這份文件的 frontmatter／摘要用的是舊語法，'
      + 'CP171 發射器讀不出標題等必要欄位，已自動退回既有發射器（不會產出壞檔）。'
      + '換成新語法（```yaml + ## Abstract）就能真正切換。';
    note.style.color = 'var(--status-warn,#c9862a)';
  } else {
    note.textContent = '已開啟，尚未編譯過，無法判斷是否生效——按一次「編譯」看結果。';
    note.style.color = '';
  }
}

function toggleEngine(on){
  const T = K.need('takeover');
  if (T) T.enable(on); else K.setFlag('takeoverTex', on);
  syncEngineRow();
  scheduleRecompile();
}

function show(){
  if (!build()) return false;
  sync();
  document.body.classList.add('cp171-settings-open');
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
  if (b) { b.setAttribute('data-on', '0'); b.textContent = '版面設定'; }
  K.emit('settings:close', {});
  return false;
}
function toggle(){ return open ? close() : show(); }

K.register('revtexSettings', {
  version: '3.2.0',
  show, close, toggle, sync,
  isOpen: () => open,
  groups: () => GROUPS,
  keyCount: GROUPS.reduce((a, g) => a + g.items.length, 0)
});
K.log.info('revtexSettings', 'CP171 REVTeX 版面設定面板就緒');
})();
