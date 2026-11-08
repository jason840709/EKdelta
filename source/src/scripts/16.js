
/* CP171 · 介面英文化層
 * ---------------------------------------------------------------------------
 * 問題：CP171 的面板（右半分屏工具列、版面設定面板、Engine Pack 對話框）
 * 全部把中文字面直接寫死在樣板字串裡，宿主切到 English 時它們仍是中文，
 * 外籍使用者看不懂（使用者實測回報）。
 *
 * 為什麼不逐一改成 TT('中文','English')：
 *   這些面板的文案是用樣板字串組出來的，中文與 ${} 插值交錯（例如
 *   `${pages} 頁 · ${engine} · ${rounds} 輪`）。逐一包 TT 要動 130 多處
 *   樣板內部，等於重寫三個模組的 render 函式，回歸面很大。
 *
 * 這裡改用「渲染後翻譯」：面板照舊用中文組好、掛進 DOM，之後對那棵子樹
 * 的文字節點與 title/aria-label/placeholder 做字典替換。插值後的整句已經
 * 是完整字串，所以 `2 頁 · pdflatex · 1 輪` 這種也能正確翻成
 * `2 pages · pdflatex · 1 round`。字典鍵依長度由長到短套用，短鍵不會先
 * 吃掉長句的一部分。
 *
 * 切回中文時不做反向翻譯（會有歧義），改成把原文存在 WeakMap 裡還原——
 * 這是精確可逆的作法。
 *
 * 邊界：只翻譯 CP171 自己的面板與 CP169A 對話框這幾棵子樹，
 * 絕不碰 #editor、使用者文件內容或 TeX log。
 */
(function () {
  const K = window.__CP171__;
  if (!K) return;

  const DICT = {
    /* 1.1.5.6.1 引用鍵比對警告：發射器那邊已經寫成 cpEN() 三元式，
       但那份警告也會經過介面翻譯層，字典缺鍵時會出現中英夾雜。 */
    '這些引用在書目裡找不到對應條目：': 'These citations have no matching bibliography entry: ',
    '，PDF 上會印成 [?]。': '. They will print as [?] in the PDF.',
    '（另有 ': ' (and ',
    ' 筆）': ' more)',
    /* ---- 右半分屏工具列與狀態列（cp171-56-split） ---- */
    'CP171 v5.0 就緒（獨立於 Theme/Mode 選單；左半永遠是原生 markdown 編輯器）':
      'CP171 v5.0 ready (independent of the Theme/Mode menus; the left half is always the native Markdown editor)',
    'CP171 v5.1.0 就緒（1.1.7.4：Source Mode 分隔線幾何同步；左半仍為原生 Markdown 編輯器）':
      'CP171 v5.1.0 ready (1.1.7.4: Source Mode divider geometry is synchronized; the left side remains the native Markdown editor)',
    '左 Markdown ／ 右 PDF 分割版面已建立':
      'Split view created: Markdown on the left, PDF on the right',
    '右邊顯示 pdfLaTeX 真正編譯出的 PDF':
      'The right half shows a PDF compiled by a real pdfLaTeX run',
    '停筆後，這裡會顯示編譯好的 PDF。': 'When you pause typing, the compiled PDF appears here. ',
    '第一次使用先按右上角「載入 LaTeX 引擎」，選取 Engine Pack 資料夾。': 'The first time, press “Load LaTeX engine” at the top right and choose the Engine Pack folder.',
    '左邊照常打 Markdown，停筆後這裡自動跟上。你在這裡看到的版面，':
      'Keep writing Markdown on the left; this side follows once you pause. The layout you see here',
    '與匯出的檔案相同。':
      'is the layout of the file you export.',
    '在 Markdown 編輯與 REVTeX 版面設定之間切換（右半的 PDF 保持顯示）':
      'Switch between Markdown editing and REVTeX layout settings (the PDF on the right stays visible)',
    '第一次要先載入 Engine Pack 資料夾（':
      'The first time, load the Engine Pack folder (',
    '等五個檔案）。': ' and four more files).',
    '載入 Engine Pack': 'Load Engine Pack',
    '載入 LaTeX 引擎': 'Load LaTeX engine',
    '選取 Engine Pack 資料夾（含 busytex.wasm 等五個檔案），載入後自動編譯':
      'Choose the Engine Pack folder (busytex.wasm and four more files); it compiles once loaded',
    '尚未載入 LaTeX 引擎：按右半邊的「載入 LaTeX 引擎」，選取 Engine Pack 資料夾':
      'The LaTeX engine is not loaded: press “Load LaTeX engine” on the right and choose the Engine Pack folder',
    '（含 busytex.js、busytex.wasm、busytex_pipeline.js、texlive-recommended.js、':
      ' (with busytex.js, busytex.wasm, busytex_pipeline.js, texlive-recommended.js and ',
    'texlive-recommended.data 五個檔案），載入完成後會自動編譯。':
      'texlive-recommended.data); it compiles automatically once loaded.',
    '在 Markdown 編輯與 REVTeX 版面設定之間切換（右半的 PDF 保持顯示）':
      'Switch between Markdown editing and the REVTeX layout settings (the PDF on the right stays visible)',
    'pdfLaTeX 編譯輸出': 'pdfLaTeX compile output',
    '編譯成功，但這個瀏覽器沒有內建 PDF 檢視器':
      'Compiled successfully, but this browser has no built-in PDF viewer',
    'PDF 已經產生（右上角「下載 PDF」可以拿到檔案），':
      'The PDF was produced (use "Download PDF" in the upper right to get the file);',
    '只是無法在這裡直接顯示。用 Chrome 或 Edge 開啟這個 HTML 就能看到內嵌預覽。':
      'it just cannot be displayed inline here. Open this HTML in Chrome or Edge to see the embedded preview.',
    '編譯失敗，按下面白話診斷看原因':
      'Compile failed — open the plain-language diagnosis below for the reason',
    '⚠ main.tex 來自既有發射器（點此查看／切換）':
      '⚠ main.tex came from the legacy emitter (click to inspect or switch)',
    '內容已變更 · PDF 為舊版': 'Content changed · PDF is out of date',
    '內容已變更': 'Content changed',
    '停筆自動編譯': 'Auto-compile on pause',
    '所見即所得': 'WYSIWYG',
    '下載 PDF': 'Download PDF',
    /* 1.2.4 右半邊 PDF 檢視（37.js）右上角按鈕的提示文字 */
    '按一下回到符合寬度': 'Click to fit the width',
    '輸入頁碼後按 Enter 跳頁': 'Type a page number and press Enter',
    'PDF 檢視': 'PDF view',
    '縮小': 'Zoom out',
    '放大': 'Zoom in',
    '下載 .tex': 'Download .tex',
    '版面設定': 'Layout settings',
    '回到編輯': 'Back to editing',
    '尚未編譯': 'Not compiled yet',
    '編譯中…': 'Compiling…',
    '編譯失敗': 'Compile failed',
    '失敗：': 'Failed: ',
    '（無法產生）': ' (cannot be produced)',
    '頁 ·': 'pages ·',
    '輪 ·': 'rounds ·',

    /* ---- 版面設定面板（cp171-57-revtex-settings） ---- */
    'CP171 REVTeX 版面設定面板就緒': 'CP171 REVTeX layout settings panel ready',
    '國際論文版面設定': 'International paper layout settings',
    '改了會自動重新編譯，右邊看到的就是交出去的版面。':
      'Changes recompile automatically; the right side shows the layout you will hand in.',
    '更多設定': 'More settings',
    '版式細節': 'Layout details',
    '改任何一項，右邊的 PDF 會在 0.7 秒後重新編譯——':
      'Change anything here and the PDF on the right recompiles after 0.7 s —',
    '你調的是 REVTeX 的 class option，看到的是真正的排版結果，不是模擬。':
      'you are setting real REVTeX class options, so what you see is the real typeset result, not a simulation.',
    '不需要記任何 LaTeX 指令；最下面會即時顯示這組設定實際產生的':
      'No LaTeX commands to memorize; the bottom of this panel always shows the',
    '行。': ' line these settings actually produce.',
    'main.tex 產生方式': 'How main.tex is produced',
    '決定右邊的 PDF 實際編譯自哪一份 .tex。':
      'Decides which .tex the PDF on the right is actually compiled from.',
    '「CP171 發射器」跟這個版面設定面板保證一致（同一段程式碼算出來的）；':
      'The CP171 emitter is guaranteed to match this settings panel (both come from the same code);',
    '「既有發射器」相容既有用原生語法寫的文件（相容語法範例、臺灣論文模板等），':
      'the legacy emitter stays compatible with documents written in the older native syntax (compatibility examples, Taiwan Thesis templates and so on),',
    '但不受這個面板任何一項設定影響。':
      'but it ignores every setting on this panel.',
    '使用 CP171 發射器': 'Use the CP171 emitter',
    '目前：CP171 發射器（已生效，': 'Now: CP171 emitter (active, ',
    '行）': ' lines)',
    '項）': ' items)',
    '目前：既有發射器（相容既有文件；不受本面板設定影響）':
      'Now: legacy emitter (compatible with existing documents; unaffected by this panel)',
    'CP171 發射器讀不出標題等必要欄位，已自動退回既有發射器（不會產出壞檔）。':
      'The CP171 emitter could not read required fields such as the title, so it fell back to the legacy emitter (no broken output is produced).',
    '已開啟，但這份文件的 frontmatter／摘要用的是舊語法，':
      'Enabled, but this document still uses the old frontmatter/abstract syntax;',
    '換成新語法（': ' switch to the new syntax (',
    'yaml + ## Abstract）就能真正切換。':
      'yaml + ## Abstract) to make it take effect.',
    '已開啟，尚未編譯過，無法判斷是否生效——按一次「編譯」看結果。':
      'Enabled, but nothing has been compiled yet, so its effect is unknown — press Compile once to see.',
    '設定面板已建立（': 'Settings panel created (',
    '寫入': 'written',

    '期刊與版式': 'Journal and layout',
    '決定整份稿件的基本樣式。改這一組通常會讓頁數整個變動。':
      'Sets the basic style of the whole manuscript. Changing these usually shifts the page count.',
    '學會': 'Society',
    '決定套用哪一份官方 .rtx 樣式覆寫；換學會時期刊清單會跟著換':
      'Chooses which official .rtx style overlay is applied; the journal list follows the society',
    '期刊': 'Journal',
    '各期刊的標題、摘要與書目細節不同；清單已對齊官方 .rtx 宣告':
      'Title, abstract and bibliography details differ per journal; this list follows the official .rtx declarations',
    '排版模式': 'Typesetting mode',
    'preprint 會在摘要正前方加入可選軟分頁；短稿可能留在首頁，正文變長後 TeX 可能改從第二頁開始。這不是固定獨立標題頁。':
      'preprint inserts an optional soft break immediately before the abstract; a short paper may keep it on page one, while a longer body can make TeX start it on page two. This is not a fixed title page.',
    '欄數': 'Columns',
    '紙張': 'Paper',
    '字級': 'Type size',
    '單雙面': 'Sides',
    '單欄': 'One column',
    '雙欄': 'Two columns',
    '雙面': 'Two-sided',
    '單面': 'One-sided',
    '依模式自動': 'Automatic (follows the mode)',
    '依排版模式自動（preprint 12pt／reprint 10pt）': 'Automatic by mode (preprint 12pt / reprint 10pt)',
    '切換排版模式時會回到自動。AIP reprint + Letter + 雙欄的 11pt／12pt 會自動校正為官方模式字級，避免第一頁下緣溢位。':
      'Changing typesetting mode returns to Automatic. AIP reprint + Letter + two columns at 11pt/12pt is normalized to the official mode size to prevent first-page bottom-edge overflow.',
    'AIP reprint + Letter + 雙欄若明確指定 11pt/12pt，會載入不相容的大字級 grid，使第一頁正文逼近紙張下緣；已改由 REVTeX 模式自動選用 10pt。':
      'Explicit 11pt/12pt with AIP reprint + Letter + two columns loads an incompatible large-type grid that drives first-page text toward the sheet edge; REVTeX mode-selected 10pt was used instead.',
    'reprint（雙欄緊排，接近見刊樣貌）': 'reprint (two-column, close to the published look)',
    'preprint（單欄寬行距，投稿審閱用）': 'preprint (one column, wide leading, for submission and review)',
    'checkin（內部審稿：頁首顯示日期）': 'checkin (internal review: date in the running head)',
    'galley（長條校樣，單欄不分頁）': 'galley (galley proof, one column, unpaginated)',
    'APS（美國物理學會）': 'APS (American Physical Society)',
    'AIP（美國物理聯合會）': 'AIP (American Institute of Physics)',
    'AAPM（美國醫學物理學家學會）': 'AAPM (American Association of Physicists in Medicine)',
    'SOR（流變學會）': 'SOR (Society of Rheology)',
    'Physical Review（通用）': 'Physical Review (general)',
    'RMP（強制 author-year 引用）': 'RMP (forces author-year citations)',

    '作者與前置': 'Authors and front matter',
    '單位排列': 'Address style',
    '分組（同單位作者併列）': 'Grouped (authors sharing an address are listed together)',
    '上標編號（多單位常用）': 'Superscript numbers (common with several addresses)',
    '不排序': 'Unsorted',
    '接排': 'Run-in',
    '現職單位標記樣式': 'Present-address marker style',
    '符號（*, †, ‡ …，預設）': 'Symbols (*, †, ‡ …, default)',
    '字母（a, b, c …）': 'Letters (a, b, c …)',
    '首頁前置區分頁': 'Front-matter pagination',
    '依官方行為（摘要可能換頁）': 'Official behavior (abstract may move)',
    '強制獨立標題頁': 'Force a separate title page',
    '強制連續首頁（抑制摘要前軟分頁）': 'Force a continuous first page (suppress abstract soft break)',
    '顯示 PACS': 'Show PACS',
    '顯示關鍵字': 'Show keywords',
    '顯示 preprint 編號': 'Show the preprint number',

    '文獻與註腳': 'References and footnotes',
    '引用樣式': 'Citation style',
    '數字 [1]': 'Numeric [1]',
    '作者年份 (Smith 2026)': 'Author-year (Smith 2026)',
    '註腳併入書目': 'Footnotes in the bibliography',
    '作者附註放進書目（bibnotes）': 'Author notes in the bibliography (bibnotes)',
    '標題區的作者附註（thanks、altaffiliation 等）改排在書目區':
      'Front-matter author notes (thanks, altaffiliation, …) are printed in the reference list',
    '正文腳註併入書目（footinbib）': 'Body footnotes in the bibliography (footinbib)',
    '關閉時腳註排在頁底。開啟要搭配 .bib 檔（BibTeX）才看得到；手寫書目時程式會改回頁底並提醒':
      'Off: footnotes at the foot of the page. On: needs a .bib file (BibTeX) to show them; with a hand-written bibliography the program keeps them at the foot of the page and tells you',
    '文件用到 amsmath 的公式（多行公式、\\eqref、\\text…）時一律載入；這裡只決定沒用到時要不要也載入':
      'Always loaded when the document uses amsmath features (multi-line equations, \\eqref, \\text…); this only decides whether to load it when unused',
    '用到 \\mathbb、\\checkmark 等符號時一律載入':
      'Always loaded when symbols such as \\mathbb or \\checkmark are used',
    'REVTeX 用書目機制實作腳註，這個開關決定它們排在頁尾還是書目區':
      'REVTeX implements footnotes through the bibliography; this switch decides whether they sit at the foot of the page or in the reference list',
    '完整書目（含標題）': 'Long bibliography (with titles)',
    '顯示 arXiv eprint': 'Show arXiv eprint',

    '浮動體位置': 'Float placement',
    '穿插在正文中（預設）': 'In the body text (default)',
    '集中在文件最後': 'Collected at the end',
    '集中在文件最後，各自獨立成頁': 'Collected at the end, one per page',
    '浮動體修正（floatfix）': 'Float fix (floatfix)',
    '避免圖表卡在頁尾排不下時無限往後推':
      'Prevents a figure or table that cannot fit at the foot of a page from being pushed forward indefinitely',

    '版面微調': 'Layout fine-tuning',
    '這一組是真正的「微調」——改了通常只動局部，不會整份重排。':
      'These really are fine adjustments — they usually change one area rather than reflowing the whole manuscript.',
    '版面底部對齊': 'Bottom alignment',
    '齊底（預設，拉伸行距對齊）': 'Flush bottom (default, leading is stretched to align)',
    '不齊底（允許留白）': 'Ragged bottom (white space is allowed)',
    '緊排行距': 'Tighten leading',
    '末頁平衡雙欄': 'Balance the last page',
    '公式靠左（fleqn）': 'Left-aligned equations (fleqn)',
    '式號依章節編號': 'Number equations by section',
    '章節用阿拉伯數字': 'Arabic section numbers',
    '顯示行號': 'Show line numbers',
    '有些期刊審稿要求': 'Required by some journals for review',
    '長度檢查': 'Length check',
    'PRL 有頁數上限時很有用': 'Useful when a journal such as PRL has a page limit',
    'draft 模式': 'draft mode',
    '編譯較快，圖片以外框替代': 'Compiles faster; images are replaced by outlines',
    '橫向': 'Landscape',

    '套件與進階': 'Packages and advanced',
    'hyperref（超連結）': 'hyperref (hyperlinks)',
    '表格用 booktabs 三線': 'booktabs rules for tables',
    '程式碼用 listings': 'listings for code',
    '額外 class option': 'Extra class options',
    '逗號分隔。這裡填的東西會原樣加進 \\\\documentclass[...]':
      'Comma separated. Whatever you type is added verbatim to \\\\documentclass[...]',
    '例如 nofootinbib,superscriptaddress': 'For example nofootinbib,superscriptaddress',
    '立即重新編譯': 'Recompile now',
    '回到期刊預設': 'Reset to journal defaults',

    /* ---- Engine Pack 對話框（CP169A，宿主端） ---- */
    'REVTeX · TeX 精確校樣': 'REVTeX · exact TeX proof',
    '以外接 Engine Pack 在瀏覽器 Worker 中執行真正 pdfLaTeX。預覽與下載共用同一份 PDF bytes。':
      'Runs a real pdfLaTeX in a browser worker using an external Engine Pack. The preview and the download are the same PDF bytes.',
    '選取 REVTeX Engine Pack 資料夾':
      'Choose a REVTeX handoff package or an Engine Pack folder',
    '驗證並初始化': 'Verify and initialize',
    '編譯目前文件': 'Compile this document',
    '取消': 'Cancel',
    '關閉': 'Close',
    '尚未選取引擎包': 'No engine pack selected yet',
    '下載同一份 PDF': 'Download the same PDF',
    '下載 main.tex': 'Download main.tex',
    '下載 log': 'Download the log',
    '下載 AUX': 'Download AUX',
    '下載 SyncTeX': 'Download SyncTeX',
    'TeX PDF 精確校樣': 'Exact TeX PDF proof',
    '編譯訊息與版本': 'Compile messages and versions',
    '候選整合：': 'Candidate integration: ',
    '一般 Markdown 與臺灣論文／A4 模式不載入 TeX Worker。':
      'Ordinary Markdown, Taiwan Thesis, and A4 modes do not load the TeX worker.',
    '請先切換到 REVTeX 4.2 國際期刊主題。':
      'Switch to the REVTeX 4.2 international journal mode first.',
    '已離開 REVTeX；TeX Worker 已卸載': 'Left REVTeX; the TeX worker has been unloaded',

    /* ---- Engine Pack 對話框：狀態、驗證與錯誤（CP169A，宿主端） ---- */
    '目前 PDF 已過期，請重新編譯': 'The current PDF is out of date — recompile',
    '編譯期間內容已更新，舊 PDF 不會掛載':
      'The content changed while compiling; the old PDF will not be mounted',
    '編譯完成但內容已更新 ·': 'Compiled, but the content has since changed ·',
    '編譯期間內容已更新': 'The content changed while compiling',
    '離線資產與 SHA-256 驗證通過；網路請求已封鎖。':
      'Offline assets verified by SHA-256; network requests are blocked.',
    '請先選取 REVTeX Engine Pack 資料夾。': 'Choose a REVTeX Engine Pack folder first.',
    '自動載入 REVTeX Engine Pack…': 'Loading the REVTeX Engine Pack…',
    '載入約 200 MB TeX Live Recommended…': 'Loading about 200 MB of TeX Live Recommended…',
    '建立離線 pdfLaTeX Worker…': 'Starting the offline pdfLaTeX worker…',
    '建立同一份 canonical Markdown 的 main.tex…':
      'Building main.tex from the same canonical Markdown…',
    '收集圖檔、文獻與官方 REVTeX runtime…':
      'Collecting images, references and the official REVTeX runtime…',
    '真實 pdfLaTeX 編譯中…': 'Running a real pdfLaTeX compile…',
    '以真正 pdfLaTeX 編譯並顯示 PDF': 'Compile with a real pdfLaTeX and show the PDF',
    'TeX 精確校樣': 'Exact TeX proof',
    '讀取引擎檔案…': 'Reading engine files…',
    '驗證引擎資產…': 'Verifying engine assets…',
    '處理中…': 'Working…',
    '已選取引擎包；尚未驗證': 'Engine pack selected; not verified yet',
    '請先初始化引擎': 'Initialize the engine first',
    '引擎就緒 ·': 'Engine ready ·',
    '引擎初始化失敗': 'Engine initialization failed',
    '引擎包不完整': 'The engine pack is incomplete',
    '缺少必要引擎檔案：': 'Missing required engine files: ',
    '無法載入': 'Cannot load',
    'TeX 引擎尚未初始化。': 'The TeX engine is not initialized yet.',
    'TeX Worker 錯誤': 'TeX worker error',
    'Worker 錯誤': 'Worker error',
    '編譯已取消；請重新初始化引擎': 'Compile cancelled; re-initialize the engine',
    '編譯準備失敗': 'Could not prepare the compile',
    '無法建立 main.tex。': 'Could not build main.tex.',
    '編譯成功 ·': 'Compiled ·',
    '編譯失敗 · exit': 'Compile failed · exit',
    '(沒有 log)': '(no log)',
    'SHA-256 不符。': 'SHA-256 mismatch.',
    '大小不符：': 'Size mismatch: ',
    '實際：': 'actual: ',
    '預期：': 'expected: ',
    '，預期': ', expected ',

    /* ---- 引擎轉接層（cp171-30-engine） ---- */
    'CP171 引擎轉接層就緒（busytex 主線 / companion 備援）':
      'CP171 engine bridge ready (busytex primary / companion fallback)',
    '沒有可用的編譯引擎。兩條路：(1) 在 REVTeX 校樣面板選取 Engine Pack 資料夾':
      'No compile engine available. Two options: (1) choose an Engine Pack folder in the REVTeX proof panel',
    '（需含 busytex.js、busytex.wasm、busytex_pipeline.js、texlive-recommended.js、':
      ' (it must contain busytex.js, busytex.wasm, busytex_pipeline.js, texlive-recommended.js and ',
    'texlive-recommended.data 五個檔案），按「驗證並初始化」，然後回來重按編譯。':
      'texlive-recommended.data), press Verify and initialize, then come back and compile again.',
    '(2) 啟動 companion 本機服務並在旗標 companionUrl 指向它。':
      '(2) start the local companion service and point the companionUrl flag at it.',
    '引擎尚未載入：按右上角「載入 LaTeX 引擎」，選取 Engine Pack 資料夾':
      'The engine is not loaded: press “Load LaTeX engine” at the top right and choose the Engine Pack folder',
    '（含 busytex.js / busytex.wasm / texlive-recommended.data）；':
      ' (with busytex.js / busytex.wasm / texlive-recommended.data);',
    '兩種實作皆不可用：busytex（': 'Neither implementation is available: busytex (',
    '無法連線（': 'cannot connect (',
    '引擎已就緒（Worker 存在）': 'Engine ready (worker present)',
    '引擎層缺失': 'engine layer missing',
    '無可用引擎': 'no engine available',
    '引擎偵測：': 'Engine detection: ',
    '無法開啟 CP169A 面板：': 'Could not open the CP169A panel: ',
    'CP169A 模組不存在': 'the CP169A module is not present',
    'CP169A 不存在': 'CP169A is not present',
    'companion /compile 回應': 'companion /compile responded ',
    'health 回應': 'health responded ',
    '秒仍未回覆。': ' s with no reply.',
    '逾時': 'timed out',
    '引擎剛就緒，正在重新編譯…': 'The engine just became ready; recompiling…',
    '引擎就緒 → 自動重新編譯一次（免去使用者手動再按）':
      'Engine ready → recompiling once automatically',

    /* ---- 影子編譯協調器（cp171-40-orch） ---- */
    'CP171 影子編譯協調器就緒（旗標 autoCompile 預設關）':
      'CP171 shadow-compile coordinator ready (the autoCompile flag is off by default)',
    '影子編譯協調器啟動（輪詢 400ms）': 'Shadow-compile coordinator started (polling every 400 ms)',
    '影子編譯協調器停止': 'Shadow-compile coordinator stopped',
    '已有編譯進行中，忽略新請求': 'A compile is already running; the new request is ignored',
    '編譯期間內容變更，本次結果將視為過期':
      'The content changed during the compile, so this result is treated as stale',
    '次，已自動關閉影子編譯。': ' times, so shadow compiling has been turned off automatically.',
    '連續失敗': 'consecutive failures',
    '大型文件第一次編譯比較慢，請稍候再按「編譯」。':
      'The first compile of a large document is slow; wait a moment and press Compile again.',
    '編譯超過': 'The compile took more than ',

    /* ---- 接管層（cp171-31-takeover） ---- */
    '插點 P0 掛鉤已登記（旗標 takeoverTex 預設關）':
      'Hook point P0 registered (the takeoverTex flag is off by default)',
    'main.tex 由 CP171 發射器接管（': 'main.tex is now produced by the CP171 emitter (',
    '接管 main.tex：': 'Took over main.tex: ',
    '發射器出口自檢未通過，退回既有 main.tex':
      'The emitter self-check failed, so the existing main.tex is used instead',
    '缺解析器或發射器，退回既有 main.tex':
      'Parser or emitter missing, so the existing main.tex is used instead',
    '缺解析器或發射器': 'parser or emitter missing',
    '發射器丟出例外，退回既有 main.tex：':
      'The emitter threw an exception, so the existing main.tex is used instead: ',
    '被閘門擋下（splitOpen=': 'Blocked by the gate (splitOpen=',
    '，兩者已解耦），閘門': ', the two are decoupled), gate ',
    '取得 CP166 產物失敗：': 'Could not obtain the CP166 output: ',
    '沒有可比對的 Markdown（先跑一次編譯，或傳入字串）':
      'No Markdown to compare against (compile once first, or pass a string)',
    '兩份結構統計如上；差異大不代表誰錯，要看實際編譯結果。':
      'Structural statistics for both are above; a large difference does not mean either is wrong — check the actual compile result.',
    'CP166 不可用（可能不在 revtex 模式），只回報 CP171 側。':
      'CP166 is unavailable (probably not in REVTeX mode), so only the CP171 side is reported.',
    '尚無接管記錄': 'No takeover recorded yet',
    '筆記錄 / 主檔 tag=': ' records / main-file tag=',
    '原生模式=': 'native mode=',
    '（原生模式=': ' (native mode=',
    '（模式=': ' (mode=',
    '，作用中=': ', active=',

    /* ---- SyncTeX 定位（cp171-60-locate） ---- */
    'CP171 SyncTeX 雙向定位就緒（原生 DecompressionStream，零外部相依）':
      'CP171 SyncTeX two-way locating ready (native DecompressionStream, no external dependencies)',
    '此瀏覽器不支援 DecompressionStream，無法解壓 synctex.gz':
      'This browser has no DecompressionStream, so synctex.gz cannot be decompressed',
    '最近一次編譯沒有 synctex': 'The last compile produced no synctex',
    'SyncTeX 已解析：': 'SyncTeX parsed: ',
    'Markdown 第': 'Markdown line ',
    '.tex 第': '.tex line ',
    '位置不明': 'position unknown',
    '未知位置': 'unknown position',

    /* ---- 編譯診斷（cp171-70-diag）：白話錯誤翻譯表與報告 ---- */
    'CP171 錯誤白話映射就緒（翻譯表': 'CP171 plain-language error mapping ready (table of ',
    '條）': ' entries)',
    '# 編譯診斷': '# Compile diagnosis',
    '## 錯誤': '## Errors',
    '## 警告': '## Warnings',
    '沒有可分析的編譯結果': 'No compile result to analyze',
    '沒有可用的編譯結果，先編譯一次': 'No compile result available — compile once first',
    '編譯乾淨，沒有任何錯誤或警告。': 'The compile is clean: no errors and no warnings.',
    '編譯中止，沒有產生 PDF。': 'The compile stopped and produced no PDF.',
    '原始訊息：': 'Original message: ',
    '原始訊息如上。若這條訊息常出現，值得把它加進翻譯表。':
      'The original message is above. If it shows up often, it is worth adding to the translation table.',
    '這條訊息還沒有收錄在白話翻譯表裡。':
      'This message is not in the plain-language table yet.',
    '用到了一個 TeX 不認得的指令。': 'A command TeX does not recognize was used.',
    '通常是三種情況：指令拼錯、該指令屬於某個沒載入的套件、或是把 Markdown 的反斜線當成純文字寫了。':
      'Usually one of three things: the command is misspelled, it belongs to a package that was not loaded, or a Markdown backslash was written as literal text.',
    '看下一行 log 顯示的指令名稱。若拼寫沒錯，多半是缺套件；若是要輸出反斜線本身，Markdown 裡要寫 \\\\\\\\。':
      'Check the command name on the next log line. If the spelling is right it is usually a missing package; to output a backslash itself, write \\\\\\\\ in Markdown.',
    '找不到檔案：': 'File not found: ',
    '若是圖檔，表示圖片沒有跟 .tex 放在一起（1.1.5.2 起缺圖只會畫佔位框，不會讓編譯失敗）；若是 .sty，表示缺少該套件。':
      'If it is an image, the file is not sitting next to the .tex (since 1.1.5.1 a missing image no longer fails the compile — a placeholder box is drawn); if it is a .sty, the package is missing.',
    '圖檔：確認相對路徑與檔名（大小寫也要一致）。套件：需要在 Engine Pack 裡補上，或改用不需要它的寫法。':
      'Images: check the relative path and the file name (case matters). Packages: add them to the Engine Pack, or rewrite so the package is not needed.',
    '有數學符號出現在非數學環境裡。': 'A math symbol appears outside a math environment.',
    '像 _ ^ 這類字元在正文裡有特殊意義。常見來源是 Markdown 的底線、或是數學式的':
      'Characters such as _ and ^ have special meaning in body text. Common sources are Markdown underscores, or a math formula whose ',
    '是否成對；若要輸出底線本身，寫成 \\\\\\\\_。':
      'delimiters are unbalanced; to output an underscore itself, write \\\\\\\\_.',
    '大括號沒關起來。TeX 一路往後找': 'A brace was never closed. TeX kept searching forward ',
    '直到檔案結束。': 'to the end of the file.',
    '某個指令的大括號沒有關起來。': 'A command has an unclosed brace.',
    '1 之後的大括號是否成對。若來自原生 TeX 區塊（': 'whether the braces after it balance. If it comes from a raw TeX block (',
    'tex），先數那一段。': 'tex), count that block first.',
    'tex 區塊，數一下': 'tex block, count ',
    '的數量。': '.',
    '沒有成對。': ' are unbalanced.',
    '檢查該行的': 'Check that line for ',
    '常見於原生 TeX 區塊（': 'Common in raw TeX blocks (',
    'tex）裡的括號不平衡。': 'tex) with unbalanced braces.',
    '1 的參數沒有結束就到檔尾了。': 'ran out of file before its argument ended.',
    '往上找第一個 ! 開頭的訊息，那才是根因。':
      'Look upward for the first line starting with !, that is the root cause.',
    '前面某個錯誤嚴重到無法繼續。真正的原因在這條訊息之前。':
      'An earlier error was fatal. The real cause is above this message.',
    '交叉引用還沒收斂，需要再編譯一輪。': 'Cross-references have not converged; one more compile round is needed.',
    'LaTeX 的章節號、式號、圖表號、文獻號要先寫進 .aux，下一輪才讀得到。第一輪必然如此，不是錯誤。':
      'LaTeX writes section, equation, figure and reference numbers into .aux first and can only read them on the next round. This always happens on the first round and is not an error.',
    'CP171 會自動再跑一輪。若編號仍顯示為 ?? 才需要處理。':
      'CP171 runs another round automatically. Only act if the numbers still show as ??.',
    '1 找不到對應的標籤。': 'has no matching label.',
    '\\\\\\\\label 沒寫、拼錯，或這是第一輪編譯（.aux 還沒生成）。':
      'The \\\\\\\\label is missing or misspelled, or this is the first round (.aux does not exist yet).',
    '確認對應位置有': 'Check that the target has a ',
    '或 \\\\\\\\label': ' or \\\\\\\\label',
    '。若剛加上，再編譯一次。': '. If you just added it, compile once more.',
    '引用的文獻鍵': 'The cited reference key ',
    '1 不存在。': 'does not exist.',
    'refs.bib 裡沒有這個鍵，或是 BibTeX 還沒跑過（交叉引用需要多輪編譯才會收斂）。':
      'The key is not in refs.bib, or BibTeX has not run yet (cross-references need several rounds to converge).',
    '確認 .bib 裡有這個 key。若剛加上去，再編譯一次即可。':
      'Check that the key exists in the .bib. If you just added it, compile once more.',
    '有一些引用沒有對應目標（': 'Some references have no target (',
    '個未定義的引用': ' undefined references',
    '這是總結行，具體是哪幾個列在它前面的個別警告裡。':
      'This is a summary line; the individual warnings above name the actual ones.',
    '看上面逐條的 Citation/Reference 警告。若剛加上文獻，再編譯一輪通常就好。':
      'See the individual Citation/Reference warnings above. If you just added a reference, one more round usually fixes it.',
    '兩個地方用了同一個': 'Two places use the same ',
    '1 被定義了不只一次。': 'is defined more than once.',
    '交叉引用會指向其中一個（不保證是哪一個）。改掉重複的標籤名。':
      'Cross-references will point at one of them, with no guarantee which. Rename the duplicate label.',
    '有一行文字超出欄寬': 'A line of text overflows the column width',
    '通常是很長的單字、網址、或數學式塞不進雙欄的欄寬。這是排版警告，不是錯誤——PDF 還是會產生。':
      'Usually a very long word, URL or formula that does not fit a two-column measure. This is a typesetting warning, not an error — the PDF is still produced.',
    '若溢出量小（': 'If the overflow is small (',
    '10pt）多半肉眼看不出來，可忽略。明顯溢出時：長網址用 \\\\\\\\url':
      'under 10 pt) it is usually invisible and can be ignored. For a visible overflow, wrap long URLs in \\\\\\\\url',
    '、長式改用 multline 或 split 環境。': ' and split long formulas with the multline or split environment.',
    '個行寬溢出': ' overfull lines',
    '有一行文字被拉得太開（鬆散度': 'A line was stretched too loose (badness ',
    'TeX 為了對齊右邊界把詞間空白拉大了。這是排版警告，不是錯誤。':
      'TeX widened the word spacing to reach the right margin. This is a typesetting warning, not an error.',
    '通常可忽略。若很明顯，改寫該段文字讓斷行更自然。':
      'Usually ignorable. If it is obvious, reword the paragraph so it breaks more naturally.',
    '個其他警告': ' other warnings',
    '有一個圖或表大到放不進一頁。': 'A figure or table is too large to fit on one page.',
    '圖片指定的寬度超過版面，或表格列數太多。': 'The image width exceeds the text block, or the table has too many rows.',
    '雙欄模式下單欄寬只有約 3.4 英吋。寬圖請用 ![...](...)  搭配跨欄（figure*），或縮小圖片。':
      'A single column is only about 3.4 inches wide in two-column mode. Use a spanning figure (figure*) for wide images, or scale the image down.',
    'pdfLaTeX 無法處理字元': 'pdfLaTeX cannot handle the character ',
    'pdfLaTeX 只認 8-bit 編碼，處理不了中日韓等文字。':
      'pdfLaTeX only understands 8-bit encodings and cannot handle CJK text.',
    'CP171 應該要自動偵測並切換到 XeLaTeX。若你看到這個錯誤，表示偵測漏掉了——請回報，並暫時在 frontmatter 加 preamble 指定引擎。':
      'CP171 should detect this and switch to XeLaTeX automatically. If you see this error the detection missed it — please report it, and meanwhile set the engine through the frontmatter preamble.',
    '正文出現在 \\\\\\\\begin': 'Body text appears before \\\\\\\\begin',
    '多半是 frontmatter 的 YAML 裡混進了會被當成正文的內容。':
      'Usually something in the frontmatter YAML is being treated as body text.',
    '檢查 frontmatter 的 preamble 欄位，那裡只能放 TeX 前言指令。':
      'Check the frontmatter preamble field; it may only contain TeX preamble commands.',
    'REVTeX 沒收到學會設定，用了預設值 aps。': 'REVTeX received no society setting and defaulted to aps.',
    'class option 裡沒指定學會。CP171 應該從 settings.revtexSociety 帶入。':
      'No society was given in the class options. CP171 should pass settings.revtexSociety through.',
    '若你要投的不是 APS 期刊，到偏好設定改學會。':
      'If you are not submitting to an APS journal, change the society in Preferences.',
    '引擎實際編譯的 main.tex 與 CP171 發射器的產物不同。':
      'The main.tex the engine compiled is not the one the CP171 emitter produced.',
    '多半是旗標 takeoverTex 關著——校樣顯示的不是 CP171 的排版結果。':
      'Usually the takeoverTex flag is off, so the proof is not showing the CP171 layout.',
    '交叉引用尚未收斂，進行第': 'Cross-references have not converged; starting round ',
    '輪編譯': '',
    '檢查最近的': 'Check the nearest ',
    '個錯誤': ' errors',
    '處理：': 'Action: ',
    '原因：': 'Cause: ',
    '位置：': 'Location: ',
    '之前。': ' before it.',
    '第一個在': 'the first at ',
    '個圖檔沒有收進包裡，期刊端會編譯失敗——請確認圖檔路徑。':
      ' image files were not included, so the journal side will fail to compile — check the image paths.',

    /* ---- 投稿包（cp171-80-submit） ---- */
    'CP171 投稿包產生器就緒（自寫 store-only zip，零外部相依）':
      'CP171 submission packager ready (own store-only zip, no external dependencies)',
    '編譯未成功，投稿包不產生。先修好錯誤（用 __CP171__.need(':
      'The compile failed, so no submission package is produced. Fix the errors first (use __CP171__.need(',
    ').report() 看白話診斷）。': ').report() for a plain-language diagnosis).',
    '修正錯誤後用 __CP171__.need(': 'After fixing the errors, use __CP171__.need(',
    ').resume() 恢復。': ').resume() to continue.',
    '投稿包已產生：': 'Submission package produced: ',
    '投稿包有': 'The submission package has ',
    '個檔案／': ' files / ',
    '— REVTeX 4.2 投稿包': '— REVTeX 4.2 submission package',
    'REVTeX 4.2 原始檔（投稿主體）': 'REVTeX 4.2 source (the manuscript itself)',
    '本稿由 EKdelta CP171 國際論文管線從 Markdown 產生。':
      'This manuscript was produced from Markdown by the EKdelta CP171 international-paper pipeline.',
    '是人可讀、可再編輯的標準 REVTeX 原始檔，不含任何私有巨集或':
      'is a human-readable, editable standard REVTeX source with no private macros and no ',
    '絕對定位——期刊生產流程可以直接重排。':
      'absolute positioning — a journal production workflow can reflow it directly.',
    '由 main.tex 編譯而得，與原始檔同一份真相':
      'compiled from main.tex; the same single source of truth',
    '## 產生方式': '## How this was produced',
    '## 需要什麼': '## What you need',
    '## 怎麼編譯': '## How to compile',
    '## 版面設定': '## Layout settings',
    '## 檔案': '## Files',
    '## 產生時的提醒': '## Notes from generation',
    '- 標準套件：': '- Standard packages: ',
    '所有選擇性套件都以 \\\\': 'Every optional package is wrapped in \\\\',
    '包裹並附退化定義，缺套件時會降級而不是編譯中止。':
      ' with a fallback definition, so a missing package degrades instead of stopping the compile.',
    '- XeLaTeX（本稿含中日韓文字，pdfLaTeX 無法處理）與 xeCJK':
      '- XeLaTeX (this manuscript contains CJK text, which pdfLaTeX cannot handle) and xeCJK',
    '或直接用 latexmk：': 'Or simply use latexmk: ',
    '這組選項來自撰稿時的偏好設定，可依期刊要求調整。':
      'These options come from the settings used while writing; adjust them to the journal requirements.',
    '沒有附上 .bib，文獻清單在期刊端會是空的。':
      'No .bib was attached, so the reference list will be empty on the journal side.',
    '⚠ 未附上——請自行補入，否則文獻無法產生':
      '⚠ not attached — add it yourself, otherwise no bibliography can be produced',
    '⚠ 未附上（找不到檔案）': '⚠ not attached (file not found)',
    '文獻資料': 'Bibliography data',
    '圖檔': 'Image',
    '項提醒': ' notes',
    '產生時間：': 'Generated at ',
    '取不到內容': 'content unavailable',

    /* ---- 核心自檢與登記（cp171-00-kernel） ---- */
    'CP171 核心就緒 v': 'CP171 core ready v',
    'CP171 隔離自檢：': 'CP171 isolation self-check: ',
    'R1 settings 鍵隔離': 'R1 settings-key isolation',
    'R2 DOM 隔離': 'R2 DOM isolation',
    'R3 不覆寫既有函式': 'R3 no overwriting of existing functions',
    'R4 不呼叫既有管線': 'R4 no calls into the existing pipeline',
    'R5 模式閘門': 'R5 mode gate',
    '只有 settings.cp171': 'only settings.cp171',
    '發現額外頂層鍵：': 'extra top-level keys found: ',
    'CP171 節點=': 'CP171 nodes=',
    '命名違規=': ' naming violations=',
    '疑似被覆寫：': 'possibly overwritten: ',
    '行為正確': 'behaves correctly',
    '行為異常': 'behaves incorrectly',
    '抽查': 'sampled ',
    '個皆原生': ' — all native',
    '建立 #cp171-root': 'created #cp171-root',
    '模組登記：': 'module registered: ',
    '模組重複登記：': 'module registered twice: ',
    '缺少模組：': 'missing module: ',
    '登記掛鉤：': 'hook registered: ',
    '沒有發射器對應表': 'no emitter mapping table',
    '個模組皆乾淨': ' modules are clean',
    '自檢缺失': 'self-check missing',
    '旗標完整': 'flags complete',
    '未知旗標': 'unknown flag',
    'ensureFlags 失敗，改用預設值': 'ensureFlags failed; defaults are used',
    'enterIntlMode 呼叫 setMode 失敗': 'enterIntlMode failed to call setMode',
    '通過': 'pass',
    '頁 /': 'pages / ',
    '行，引擎': ' lines, engine ',

    /* ---- 發射器警告（cp171-20-emit，會顯示在設定面板與診斷區） ---- */
    '文中有引用但 frontmatter 未指定書目來源，已預設為 refs.bib——請確認該檔存在。':
      'The text has citations but the frontmatter names no bibliography source, so refs.bib is assumed — check that the file exists.',
    '文中有腳註：REVTeX 以書目機制實作腳註，因此仍需 \\\\bibliography 與一次 BibTeX。已預設 refs.bib。':
      'The text has footnotes: REVTeX implements them through the bibliography, so \\\\bibliography and one BibTeX run are still required. refs.bib is assumed.',
    '文件含 CJK 文字，引擎已切換為 xelatex（pdflatex 無法處理 CJK）':
      'The document contains CJK text, so the engine switched to xelatex (pdflatex cannot handle CJK)',
    '腳註定義 [^': 'The footnote definition [^',
    '] 沒有被任何地方引用，內容不會出現在 PDF 上。':
      '] is never referenced, so its text will not appear in the PDF.',
    '] 找不到對應定義（或定義內容無法轉成純文字），':
      '] has no matching definition (or the definition cannot be reduced to plain text), ',
    '已退化為只顯示標記，PDF 上不會有腳註文字。':
      'so only the marker is shown and the PDF will carry no footnote text.',
    '腳註 [^': 'Footnote [^',
    'frontmatter 缺 title，已填 Untitled': 'The frontmatter has no title, so Untitled was used',
    'frontmatter 缺 authors': 'The frontmatter has no authors',
    '作者引用了不存在的 affiliation 索引 ': 'An author references a nonexistent affiliation index ',
    '章節標題內含腳註，但 REVTeX 在標題這類移動參數中停用了 \\\\footnote':
      'A section title contains a footnote, but REVTeX disables \\\\footnote in moving arguments such as titles',
    '（會編譯失敗）。已從標題移除該腳註；若要標註作者或稿件層級的附註，':
      ' (the compile would fail). The footnote was removed from the title; for an author or manuscript-level note, ',
    '請改用 frontmatter 的 thanks: 欄位。': 'use the frontmatter thanks: field instead.',
    'revtex-turnpage 區塊內沒有找到表格或圖片，': 'The revtex-turnpage block contains no table or figure, ',
    '官方 turnpage 環境只用來包住單一 table 或 figure，已略過旋轉、':
      'and the official turnpage environment only wraps a single table or figure, so the rotation was skipped and ',
    '內容改用一般排版輸出。': 'the content was typeset normally.',
    'revtex-turnpage 區塊內有 ': 'The revtex-turnpage block contains ',
    ' 個表格/圖片，但官方 turnpage 一次只能放一個（無跨頁機制），':
      ' tables/figures, but the official turnpage takes only one at a time (it cannot span pages), ',
    '只取第一個旋轉，其餘照一般排版輸出。':
      'so only the first is rotated and the rest are typeset normally.',
    '未處理的區塊型別：': 'Unhandled block type: ',
    'revtex-longtable 區塊內沒有找到表格': 'The revtex-longtable block contains no table',
    'metadata 誤入正文：偵測到 frontmatter 欄位出現在 verbatim 區塊':
      'Metadata leaked into the body: a frontmatter field was found inside a verbatim block',
    '。建議改用 .bib 檔（frontmatter 寫 bibliography: refs），':
      '. Consider a .bib file instead (write bibliography: refs in the frontmatter), ',
    '請在額外 class option 或 preamble 逃生區塊自行指定 \\\\setCJKmainfont':
      'set \\\\setCJKmainfont yourself through an extra class option or the preamble escape block',

    /* ---- 其餘零星（解析器／核心／投稿包／對話框） ---- */
    'CP171 獨立解析器就緒（隔離：不讀 DOM、不呼叫既有解析器）':
      'CP171 standalone parser ready (isolated: reads no DOM, calls no existing parser)',
    '已登記': 'registered',
    '個旗標': ' flags',
    '驗證': 'Verify',
    '與 \\\\': ' and \\\\',
    '交叉引用': 'Cross-reference',
    '標籤': 'Label',

    /* ---- 1.1.5 補齊：發射器警告、診斷提示與 .tex 註解（鍵值以 JSON 逃逸產生，
         避免手寫反斜線層數算錯——這正是先前 \\url 一類鍵沒命中的原因） ---- */
    "\\PackageWarningNoLine{cp171}{找不到任何內建 CJK 字型，中文將顯示為 Missing character；":
      "\\PackageWarningNoLine{cp171}{No built-in CJK font was found; Chinese text will appear as Missing character; ",
    "若溢出量小（<10pt）多半肉眼看不出來，可忽略。明顯溢出時：長網址用 \\url{}、長式改用 multline 或 split 環境。":
      "A small overflow (under 10 pt) is usually invisible and can be ignored. For a visible one, wrap long URLs in \\url{} and split long formulas with the multline or split environment.",
    "文中有腳註：REVTeX 以書目機制實作腳註，因此仍需 \\bibliography 與一次 BibTeX。已預設 refs.bib。":
      "The text has footnotes: REVTeX implements them through the bibliography, so \\bibliography and one BibTeX run are still needed. refs.bib is assumed.",
    "可能顯示為 \"(???)\"。建議改用 .bib 檔（frontmatter 寫 bibliography: refs），":
      "may appear as \"(???)\". Consider a .bib file instead (write bibliography: refs in the frontmatter), ",
    "看下一行 log 顯示的指令名稱。若拼寫沒錯，多半是缺套件；若是要輸出反斜線本身，Markdown 裡要寫 \\\\。":
      "Check the command name on the next log line. If the spelling is right it is usually a missing package; to output a backslash itself, write \\\\ in Markdown.",
    "請在額外 class option 或 preamble 逃生區塊自行指定 \\setCJKmainfont}%\n":
      "Set \\setCJKmainfont yourself through an extra class option or the preamble escape block}%\n",
    "{\\PackageWarningNoLine{cp171}{xeCJK 不可用，CJK 文字將無法正確排版}}":
      "{\\PackageWarningNoLine{cp171}{xeCJK is unavailable; CJK text cannot be typeset correctly}}",
    "檢查 \\$1 之後的大括號是否成對。若來自原生 TeX 區塊（```tex），先數那一段。":
      "Check whether the braces after \\$1 balance. If it comes from a raw TeX block (```tex), count that block first.",
    "章節標題內含腳註，但 REVTeX 在標題這類移動參數中停用了 \\footnote":
      "A section title contains a footnote, but REVTeX disables \\footnote in moving arguments such as titles",
    "作者遺失：原稿有 authors 但輸出為 \\author{Anonymous}":
      "Authors lost: the source has authors but the output says \\author{Anonymous}",
    "有內嵌 data: URI 圖片，pdfLaTeX 無法直接使用，已改為佔位框。":
      "An inline data: URI image cannot be used by pdfLaTeX directly and was replaced by a placeholder box.",
    "請把圖片存成本機檔（.pdf/.png/.eps）再用 ![](檔名) 引用。":
      "Save the image as a local file (.pdf/.png/.eps) and reference it with ![](filename).",
    "本刊物在 class 層級強制 author-year 引用，但行內書目有 ":
      "This journal forces author-year citations at the class level, but the inline bibliography has ",
    "確認對應位置有 {#$1} 或 \\label{$1}。若剛加上，再編譯一次。":
      "Check that the target carries {#$1} or \\label{$1}. If you just added it, compile once more.",
    "（書目文字格式跟預期落差較大），已略過自動標註——這些引用在 PDF 上":
      " (the bibliography text differs too much from the expected format), so automatic tagging was skipped — these citations ",
    "逗號分隔。這裡填的東西會原樣加進 \\documentclass[...]":
      "Comma separated. Whatever you type is added verbatim to \\documentclass[...]",
    "標題遺失：原稿有 title 但輸出為 \\title{Untitled}":
      "Title lost: the source has a title but the output says \\title{Untitled}",
    "\\label 沒寫、拼錯，或這是第一輪編譯（.aux 還沒生成）。":
      "The \\label is missing or misspelled, or this is the first round (no .aux yet).",
    "檢查最近的 ```tex 區塊，數一下 { 和 } 的數量。":
      "Check the nearest ```tex block and count the { and } characters.",
    "檢查該行的 $ 是否成對；若要輸出底線本身，寫成 \\_。":
      "Check whether the $ on that line balance; to output an underscore itself, write \\_.",
    "鐵律一違反：數學區出現 Unicode 數學符號 → ":
      "Rule 1 violated: a Unicode math symbol appears in a math region → ",
    "正文出現在 \\begin{document} 之前。":
      "Body text appears before \\begin{document}.",
    "缺 revtex4-2 documentclass":
      "missing the revtex4-2 documentclass",
    "交給真正的 BibTeX 樣式處理會更可靠。":
      "Letting a real BibTeX style handle it is more reliable.",
    "CP171 REVTeX 4.2 發射器就緒":
      "CP171 REVTeX 4.2 emitter ready",
    "指令 \\$1 的參數沒有結束就到檔尾了。":
      "The command \\$1 ran out of file before its argument ended.",
    "…，pdfLaTeX 不會下載網路圖片，":
      "…; pdfLaTeX does not download remote images, ",
    "已改為佔位框。請先下載到本機再引用。":
      "so a placeholder box was used. Download it locally and reference that.",
    "缺 document 環境":
      "missing the document environment",
    "缺 \\maketitle":
      "missing \\maketitle",
    " 筆抓不出作者與年份":
      " entries whose author and year could not be extracted",
    "大括號不平衡（淨值 ":
      "unbalanced braces (net ",
    "有遠端圖片 ":
      "Remote image ",
    "環境不配對：":
      "unpaired environment: ",
    "（差 ":
      " (off by ",
    " 行":
      " lines",
    "缺 ":
      "missing ",
    "無":
      "none",
    "開":
      "on",
    "關":
      "off",
    "% 由 EKdelta CP171 國際論文管線產生；此檔為人可讀、期刊可再編輯的 REVTeX 4.2 原始檔。":
      "% Produced by the EKdelta CP171 international-paper pipeline; a human-readable, journal-editable REVTeX 4.2 source.",
    "% 本文沒有引用文獻也沒有腳註。要加文獻，在 frontmatter 寫 bibliography: refs":
      "% This document has no citations and no footnotes. To add references, write bibliography: refs in the frontmatter",
    "% 書目由文件內的 revtex-bibliography 區塊直接提供（thebibliography）。":
      "% The bibliography is supplied inline by the revtex-bibliography block (thebibliography).",
    "% 文件含中日韓文字：必須用 XeLaTeX 或 LuaLaTeX 編譯（pdfLaTeX 無法處理）。":
      "% This document contains CJK text: compile with XeLaTeX or LuaLaTeX (pdfLaTeX cannot handle it).",

    /* ---- 1.1.5.1 新增 ---- */
    '關閉這則編譯訊息': 'Dismiss this compile message',
    '找不到圖檔，已改為佔位框。': 'The image file was not found, so a placeholder box was used.',
    '圖檔要跟 .tex 放在一起。在程式裡編譯時，圖片必須是程式解析得到的檔案':
      'The image must sit next to the .tex. When compiling inside the app, the image has to be a file the app can resolve',
    '（例如已連結儲存資料夾裡的圖），否則編譯 Worker 讀不到它。':
      ' (for example an image inside the linked storage folder); otherwise the compile worker cannot read it.',

    /* ---- 1.1.5.2 新增 ---- */
    '關閉這則編譯訊息': 'Dismiss this compile message',
    '附帶 ': 'Attached ',
    ' 個圖檔進編譯': ' image files to the compile',

    /* ---- 1.1.5.5 新增：說明泡泡 ---- */
    '說明：': 'Help: ',
    '什麼時候要改：': 'When to change it: ',
    '上標編號（superscriptaddress）': 'Superscript numbers (superscriptaddress)',
    '分組（groupedaddress）': 'Grouped (groupedaddress)',
    '不排序（unsortedaddress）': 'Unsorted (unsortedaddress)',
    '接排（runinaddress）': 'Run-in (runinaddress)',
    '單位編號會依「第一次出現的作者順序」排，與 affiliations: 宣告的順序不同':
      'Affiliation numbers follow the order in which authors first use them, which differs from the order declared in affiliations:',
    '（REVTeX 沒有指定固定編號的語法）。想讓某個單位排在後面，就讓第一個屬於它的作者排在後面。':
      ' (REVTeX has no syntax for fixing a number). To move an affiliation later, move the first author who belongs to it later.',

    '" title="說明">i</button>': '" title="Help">i</button>',

    /* ---- 共用短詞（最後套用） ---- */
    '編譯': 'Compile',
    '核心未就緒': 'core not ready',
  };

  const KEYS = Object.keys(DICT).sort((a, b) => b.length - a.length);
  const ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];
  const ORIG_TEXT = new WeakMap();   // 文字節點 → 原始中文
  const ORIG_ATTR = new WeakMap();   // 元素 → { attr: 原始中文 }
  const roots = new Map();   // root → observer lifetime token

  function isEN() {
    try { return typeof settings !== 'undefined' && settings && settings.lang === 'en'; }
    catch (_) { return false; }
  }

  function tr(s) {
    if (!s) return s;
    let out = s;
    for (const k of KEYS) if (out.indexOf(k) >= 0) out = out.split(k).join(DICT[k]);
    return out;
  }

  function eachText(root, fn) {
    if (!root || !root.nodeType) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const list = [];
    let n;
    while ((n = w.nextNode())) list.push(n);
    list.forEach(fn);
  }

  function toEnglish(root) {
    eachText(root, t => {
      const src = ORIG_TEXT.has(t) ? ORIG_TEXT.get(t) : t.nodeValue;
      const out = tr(src);
      if (out !== t.nodeValue) { if (!ORIG_TEXT.has(t)) ORIG_TEXT.set(t, src); t.nodeValue = out; }
    });
    const els = root.querySelectorAll ? [root].concat([].slice.call(root.querySelectorAll('*'))) : [];
    for (const el of els) {
      if (!el.getAttribute) continue;
      for (const a of ATTRS) {
        const cur = el.getAttribute(a);
        if (cur == null) continue;
        const store = ORIG_ATTR.get(el) || {};
        const src = (a in store) ? store[a] : cur;
        const out = tr(src);
        if (out !== cur) { store[a] = src; ORIG_ATTR.set(el, store); el.setAttribute(a, out); }
      }
    }
  }

  function toChinese(root) {
    eachText(root, t => {
      if (ORIG_TEXT.has(t)) { t.nodeValue = ORIG_TEXT.get(t); ORIG_TEXT.delete(t); }
    });
    const els = root.querySelectorAll ? [root].concat([].slice.call(root.querySelectorAll('*'))) : [];
    for (const el of els) {
      const store = ORIG_ATTR.get(el);
      if (!store) continue;
      for (const a of Object.keys(store)) el.setAttribute(a, store[a]);
      ORIG_ATTR.delete(el);
    }
  }

  function apply(root) {
    if (!root) return;
    try { isEN() ? toEnglish(root) : toChinese(root); } catch (_) {}
  }

  /* 面板內容會被 JS 反覆改寫（狀態列、診斷區塊），所以掛 observer 持續翻譯。
     節流到下一個 microtask，避免自己改文字又觸發自己。 */
  function watch(root) {
    if (!root || roots.has(root)) { apply(root); return; }
    const watcher = { observer: null };
    roots.set(root, watcher);
    let pending = false, self = false;
    const mo = new MutationObserver(() => {
      if (roots.get(root) !== watcher || self || pending) return;
      pending = true;
      Promise.resolve().then(() => {
        pending = false;
        if (roots.get(root) !== watcher) return;
        self = true;
        try { apply(root); } finally { self = false; }
      });
    });
    watcher.observer = mo;
    try { mo.observe(root, { childList: true, subtree: true, characterData: true }); } catch (_) {}
    apply(root);
  }

  function unwatch(root) {
    const watcher = roots.get(root);
    if (!watcher) return;
    roots.delete(root);
    watcher.observer.disconnect();
  }

  function refreshAll() { roots.forEach((_, r) => { if (r && r.isConnected !== false) apply(r); }); }

  /* 宿主切換語言時重新套用（切回中文＝從 WeakMap 還原原文，不做反向翻譯）。 */
  try {
    if (typeof window.setLang === 'function' && !window.setLang.__cp171i18n) {
      const orig = window.setLang;
      const wrapped = function () {
        const r = orig.apply(this, arguments);
        setTimeout(refreshAll, 0);
        return r;
      };
      wrapped.__cp171i18n = true;
      window.setLang = wrapped;
    }
  } catch (_) {}

  /* CP169A 的 Engine Pack 對話框是宿主端 DOM，CP171 這邊主動認領。 */
  function attachHostPanels() {
    const ov = document.getElementById('cp169a-overlay');
    if (ov && !roots.has(ov)) watch(ov);
  }
  attachHostPanels();
  try {
    new MutationObserver(attachHostPanels)
      .observe(document.body, { childList: true });
  } catch (_) {}

  K.register('i18n', { t: tr, apply, watch, unwatch, refreshAll, isEN, dictSize: KEYS.length });
  K.log.info('i18n 就緒（' + KEYS.length + ' 條字典）');
})();
