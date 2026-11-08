
/* ============================================================
   Checkpoint 2 — 核心引擎
   §1 狀態與工具  §2 Markdown 解析器  §3 區塊分割與渲染
   ============================================================ */

/* ---------- §1 狀態與工具 ---------- */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const editor = $('#editor'), scroller = $('#scroller'), srcview = $('#srcview'), srcShell = $('#src-shell'), srcHighlight = $('#src-highlight'), srcGutterInner = $('#src-gutter-inner');

let files = [];            // [{id, name, content}]
let activeId = null;       // 目前開啟的檔案
let blocks = [];           // 目前文件的區塊原始碼陣列(權威資料)
let activeIndex = -1;      // 正在編輯(顯示原始碼)的區塊索引
let composing = false;     // IME 輸入法組字中
const imeKey = e => e.isComposing || e.keyCode === 229;   // CP42:此按鍵屬於 IME 組字(229=舊制表示)
let suppressSel = 0;       // 抑制 selectionchange 的計數器
let undoStack = [], redoStack = [], undoArmed = true;
let saveTimer = null, uiTimer = null;
const settings = { theme:'github', sidebar:true, sidebarTab:'files',
                   focus:false, typewriter:false, srcmode:false, maximized:false,
                   showToolbar:true,                    // CP136:首次使用／恢復原廠時預設顯示；已保存的明確 false 仍保留
                   toolbarItems:[],                    // CP135:使用者自訂的頂部工具列項目；空陣列由 normalizeToolbarItems() 補預設
                   texBooktabs:false,                   // CP62:LaTeX 表格 booktabs 三線表(匯出與複製為 LaTeX 皆適用)
                   texListings:false,                   // CP64:LaTeX 程式碼 listings(圍欄語言 → language 選項)
                   findOpts:{ cs:false, ww:false, rx:false },   // CP73:尋找選項記憶(大小寫/整字/regex 三鈕,跨工作階段)
                   losslessCore:true,                 // CP98:無損 Markdown 影子核心；false 可緊急回退舊路徑
                   txnCore:true,                      /* CP100:交易紀錄層(record-only 第一階段);false 可整層停用 */
                   mdMetaPilot:false,                 /* T8(CP101/102):md-meta 語法顯隱試點(v1.1 就地編輯);API __T8_MDMETA__.setEnabled/選單 */
                   markdownProfile:'legacy-current',  // CP163C: legacy-current / ekdeta-loose / strict
                   markdownOptions:{},                 // CP163C: explicit Ekdeta parser option overrides
                   acRecent:{ math:[], fence:[], emoji:[] },  // CP56:補全最近使用(MRU,各型別上限 8 筆)
                   imgMode:'folder', imgSub:'image',   // 圖片貼上/拖放的儲存偏好(CP6)
                   imgPickedLink:'',                    // CP135:獨立圖片資料夾寫入 Markdown 的相對／絕對連結前綴
                   prefsTab:'general',                 // 偏好設定最後使用的分類（1.2.7：general / images / fonts / thesis；舊值 global、revtex 開啟時自動對應）
                   paperNum:true,                       // 論文模式自動章節編號(CP6)
                   paperFillPages:true,                  // CP106:分頁模式;0.9.96.1 起預設 true(填滿每頁,段落可在頁界拆開續排)。false=段落不可跨頁(整段推到次頁,0.9.95/0.9.96 舊預設);已儲存的使用者設定不受此預設變更影響
                   twthesisLogo:'',                          // TW_THESIS 封面自訂標誌 dataURL(CP26)
                   twthesisLogoChoice:'',                    // CP135:seal / brand / custom；空值用於舊資料自動遷移
                   twthesisLogoScale:100,                   // CP136:中英文 TW_THESIS 共用封面標誌視覺比例(60–140%)
                   thesisIndentZh:'two-em',             // CP160:TW_THESIS 中文普通正文 two-em / none
                   thesisIndentEn:'none',               // CP160:TW_THESIS English none / standard / section-first-flush
                   twthesisPrint:false,                     // CP127:中文版 TW_THESIS 紙本版(否=電子版)
                   twthesisDigitalStyle:'book',             // CP133:中文版電子版 compact=精簡版面／book=書冊版面
                   twthesisEnPrint:false,                   // CP130:英文版 TW_THESIS 紙本版(與中文版各自記憶)
                   /* CP167:REVTeX 4.2 國際期刊 profile。預覽、.tex 與 ZIP 共用同一真相源。 */
                   /* R8.3:Factory reset 必須與 REVTEX_DEFAULTS 的期刊正式 profile 完全一致。 */
                   revtexSociety:'aps', revtexJournal:'prl', revtexMode:'reprint',
                   revtexAddress:'superscriptaddress', revtexPaper:'letterpaper', revtexFontSize:'auto',
                   revtexColumns:'twocolumn', revtexCitation:'numerical', revtexSides:'twoside',
                   revtexBottom:'auto', revtexFloats:'auto', revtexFont:'times',
                   revtexShowPacs:false, revtexShowKeys:true, revtexLongBibliography:true,
                   revtexEprint:true, revtexBibnotes:false, revtexFootInBib:false,
                   revtexPreprintNumbers:true, revtexBalanceLastPage:true, revtexTightenLines:false,
                   revtexLengthCheck:false, revtexEqSecNum:false, revtexSecNumArabic:false,
                   revtexFleqn:false, revtexFloatFix:true, revtexLineNumbers:false,
                   revtexDraft:false, revtexTitlePage:false, revtexLandscape:false,
                   revtexAmsmath:true, revtexAmssymb:true, revtexHyperref:true, revtexExtraOptions:'',
                   twthesis2Print:false,                    // 舊設定遷移欄位；不再提供獨立 臺灣論文 2 主題
                   userFonts:{ bodyLatin:'', bodyCjk:'', paperLatin:'', paperCjk:'',
                               twthesisZhLatin:'', twthesisZhCjk:'', twthesisEnLatin:'', twthesisEnCjk:'', mono:'' },
                   // CP134:九槽位多語系字體；normalizeUserFonts() 自動承接 CP27 的 body/paper/twthesis/mono 舊資料
                   /* CP21:字體縮放級數(整數,0=預設)。兩類獨立、互不干擾:
                      fzPaper — 論文類(paper / twthesis),每級 0.5pt(疊加在各自基準 11.5pt / 12pt 上)
                      fzMd    — 普通 Markdown(github / night / moss),每級 1px(基準 16px) */
                   fzPaper:0, fzMd:0,
                   viewZoom:100,                       // CP125:整個文件畫面的純顯示縮放百分比；不改排版／頁數／PDF
                   dark:false,                          // CP14:獨立的黑暗模式(右上按鈕),與 theme 正交
                   /* CP14:介面語言。全新開啟時依瀏覽器語系預設(非中文 → 英文),
                      使外國夥伴收到檔案直接是英文環境;使用者亦可由選單切換,設定會存下。 */
                   lang:(typeof navigator!=='undefined' &&
                         String(navigator.language||'').toLowerCase().startsWith('zh')) ? 'zh' : 'en' };

const isTwThesisTheme = () => settings.theme === 'twthesis' || settings.theme === 'twthesis-en' || settings.theme === 'twthesis2';
const isTwThesis2Theme = () => settings.theme === 'twthesis2';
const isTwThesisEnglishTheme = () => settings.theme === 'twthesis-en';
const twthesisThemeFlavor = theme => theme === 'twthesis-en' ? 'en' : ((theme === 'twthesis' || theme === 'twthesis2') ? 'zh' : '');
/* CP162R3：所有介面色彩都依賴 html[data-theme] 提供的 CSS token。舊版直接把
   外部儲存／備份中的任意 settings.theme 寫進 data-theme；只要值為空、舊別名或
   受損字串，--accent、--border、--quote-border 等變數就會整批失效，畫面因此退回
   瀏覽器的白底黑字。切換主題或恢復原廠會重新寫入合法值，所以症狀暫時消失。
   本層把設定正規化、保存前封印，並在啟動後驗證實際 CSS token；只修介面投影，
   不改 Markdown、Paper/TW_THESIS 分頁、特製表格、PDF 或主題本身的配色。 */
/* 1.2.7：苔灰（moss）取代羊皮紙（sepia）；舊設定的 sepia 由下方別名轉成 moss。 */
const THEME_SETTING_VALUES = Object.freeze(['github','moss','blackout','blackoutgame','paper','twthesis','twthesis-en','revtex']);
const THEME_SETTING_ALIASES = Object.freeze({
  'blackout-game':'blackoutgame','blackout_game':'blackoutgame','blackout game':'blackoutgame','sepia':'moss',
  'twthesis_en':'twthesis-en','twthesisenglish':'twthesis-en','twthesis-english':'twthesis-en'
});
function normalizeThemeSettings(){
  const beforeTheme = settings.theme, beforeDark = settings.dark, beforePrint = settings.twthesisPrint;
  let theme = typeof beforeTheme === 'string' ? beforeTheme.trim().toLowerCase() : '';
  theme = THEME_SETTING_ALIASES[theme] || theme;
  let dark = beforeDark === true;
  if (theme === 'night'){ theme = 'github'; dark = true; }
  if (theme === 'twthesis2'){ theme = 'twthesis'; settings.twthesisPrint = !!settings.twthesis2Print; }
  if (!THEME_SETTING_VALUES.includes(theme)) theme = 'github';
  settings.theme = theme;
  settings.dark = dark;
  return beforeTheme !== settings.theme || beforeDark !== settings.dark || beforePrint !== settings.twthesisPrint;
}
function resolvedThemeDataset(){
  const twthesis = settings.theme === 'twthesis' || settings.theme === 'twthesis-en';
  const paper = settings.theme === 'paper' || twthesis || settings.theme === 'revtex';
  const customDark = settings.theme === 'blackout' || settings.theme === 'blackoutgame';
  return paper ? (settings.dark ? 'night' : 'github')
               : customDark ? settings.theme
               : (settings.dark ? 'night' : settings.theme);
}
function themeTokensHealthy(){
  const css = getComputedStyle(document.documentElement);
  return ['--accent','--bg-desktop','--bg-editor','--text','--border','--quote-border']
    .every(name => css.getPropertyValue(name).trim() !== '');
}
let themeRuntimeRepairing = false, themeRuntimeRAF = 0;
function ensureThemeRuntime(reason='runtime'){
  const html = document.documentElement;
  const normalized = normalizeThemeSettings();
  const desired = resolvedThemeDataset();
  const before = html.dataset.theme || '';
  let repaired = normalized || before !== desired;
  if (before !== desired) html.dataset.theme = desired;
  let healthy = themeTokensHealthy();
  if (!healthy && !themeRuntimeRepairing){
    themeRuntimeRepairing = true;
    repaired = true;
    /* Chromium/Safari 偶爾會保留一個沒有 token 的舊 cascade。先真正移除 attribute，
       強制一次 style recalc，再套回同一個合法主題；若仍無 token，安全回 GitHub。 */
    html.removeAttribute('data-theme');
    void html.offsetWidth;
    html.dataset.theme = desired;
    healthy = themeTokensHealthy();
    if (!healthy){
      settings.theme = 'github'; settings.dark = false;
      html.dataset.theme = 'github';
      void html.offsetWidth;
      healthy = themeTokensHealthy();
    }
    themeRuntimeRepairing = false;
  }
  html.dataset.themeHealth = healthy ? 'ok' : 'failed';
  if (repaired) html.dataset.themeRepair = String(reason || 'runtime');
  else delete html.dataset.themeRepair;
  return {ok:healthy,repaired,normalized,theme:settings.theme,dark:!!settings.dark,dataset:html.dataset.theme};
}
function scheduleThemeRuntimeValidation(reason='startup'){
  if (themeRuntimeRAF) cancelAnimationFrame(themeRuntimeRAF);
  themeRuntimeRAF = requestAnimationFrame(() => requestAnimationFrame(() => {
    themeRuntimeRAF = 0;
    const result = ensureThemeRuntime(reason);
    if (result.repaired && typeof persist === 'function') persist();
  }));
}
/* CP160:縮排屬於輸出版型偏好，不寫入 Markdown。固定物理長度 .5in 對應
   APA／MLA／Turabian 的 1.27cm；section-first-flush 只依標題結構取消首段縮排，
   不把 A4 分頁起首誤判成新章節。三個 inline 變數會隨 #editor 進入兩條 PDF 路徑。 */
const THESIS_INDENT_EN = Object.freeze(['none','standard','section-first-flush']);
function normalizeThesisIndentSettings(){
  const beforeZh = settings.thesisIndentZh;
  const beforeEn = settings.thesisIndentEn;
  settings.thesisIndentZh = beforeZh === 'none' ? 'none' : 'two-em';
  /* 接受早期測試名稱，讓外部備份不會因字串更名而失效。 */
  if (beforeEn === 'academic') settings.thesisIndentEn = 'standard';
  else if (beforeEn === 'latex' || beforeEn === 'koma') settings.thesisIndentEn = 'section-first-flush';
  else settings.thesisIndentEn = THESIS_INDENT_EN.includes(beforeEn) ? beforeEn : 'none';
  return beforeZh !== settings.thesisIndentZh || beforeEn !== settings.thesisIndentEn;
}
function applyThesisIndentSettings(){
  normalizeThesisIndentSettings();
  const zh = settings.thesisIndentZh === 'none' ? '0' : '2em';
  const enBody = settings.thesisIndentEn === 'none' ? '0' : '.5in';
  const enHeading = settings.thesisIndentEn === 'section-first-flush' ? '0' : enBody;
  editor.style.setProperty('--twthesis-zh-body-indent', zh);
  editor.style.setProperty('--twthesis-en-body-indent', enBody);
  editor.style.setProperty('--twthesis-en-heading-first-indent', enHeading);
  editor.dataset.thesisIndentZh = settings.thesisIndentZh;
  editor.dataset.thesisIndentEn = settings.thesisIndentEn;
}
/* 文件語言與介面語言分離：英文論文主題即使在中文 UI 也固定使用英文目錄／圖表標籤；
   中文論文主題仍保留既有行為，介面切成 English 時顯示英文系統標籤。 */
const twthesisDocumentEnglish = () => isTwThesisEnglishTheme();
const uid = () => 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const escapeHtml = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;')
                         .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
/* ---------- CP14 介面雙語(繁中 / English) ----------
   TT(zh,en):就地雙語,程式碼在改的地方直接給兩語(選單、對話框、靜態 UI)。
   T(zh):以中文原字串查字典,給 toast() 自動翻譯用(未收錄者原樣顯示,永不出錯)。 */
const isEN = () => settings.lang === 'en';
const TT = (zh, en) => (isEN() && en) ? en : zh;
const I18N_TOAST = {
  '已儲存至瀏覽器':'Saved to browser', '已儲存(瀏覽器 + 資料夾)':'Saved (browser + folder)',
  '已匯出 Markdown':'Markdown exported', '已匯出 HTML':'HTML exported',
  '已匯出完整備份':'Full backup exported', '已取消匯出':'Export canceled',
  '已取消匯出 PDF':'PDF export canceled', '已取消':'Canceled',
  '正在準備頁面…':'Preparing pages…', '正在內嵌圖片…':'Embedding images…',
  '已匯出單一檔(圖片全內嵌,可攜)':'Single-file HTML exported (images embedded)',
  '未取得資料夾授權':'Folder permission not granted',
  '此瀏覽器不支援資料夾儲存(需 Chrome / Edge)':'This browser does not support folder storage (Chrome / Edge required)',
  '此瀏覽器不支援資料夾(需 Chrome / Edge)':'This browser does not support folders (Chrome / Edge required)',
  '已中斷資料夾連結(瀏覽器內資料保留)':'Folder unlinked (in-browser data kept)',
  '尚未連結資料夾,請先使用「連結儲存資料夾…」':'No folder linked. Use “Link Storage Folder…” first',
  '介面語言：繁體中文':'Language: Traditional Chinese',
  '已是預設字體大小':'Already at default font size',
  '已達最大字級':'Maximum font size reached', '已達最小字級':'Minimum font size reached',
  '已取消首行縮排':'First-line indent disabled', '已恢復首行縮排':'First-line indent restored',
  '此指令只適用一般段落或引言文字':'This command applies to normal paragraphs or quote text only',
};
const T = s => (isEN() && I18N_TOAST[s]) ? I18N_TOAST[s] : s;
/* 快捷鍵面板用:指令群組與標籤的英譯 */
const LABEL_EN = {
  '格式':'Format', '段落':'Paragraph', '編輯':'Edit', '檔案':'File', '檢視':'View', '檔案與檢視':'File & View',
  '一般段落':'Paragraph', '上一個結果':'Previous match', '下一個結果':'Next match',
  '任務清單':'Task List', '側邊欄':'Sidebar', '儲存':'Save', '刪除線':'Strikethrough',
  '原始碼模式':'Source Mode', '圖片':'Image', '增加縮排（清單）':'Indent (list)',
  '尋找':'Find', '尋找並取代':'Find & Replace', '底線':'Underline', '引言':'Blockquote',
  '復原':'Undo', '打字機模式':'Typewriter Mode', '提升標題級別':'Promote Heading',
  '數學區塊':'Math Block', '斜體':'Italic', '有序清單':'Numbered List', '標題 1–6':'Heading 1–6',
  '清除格式':'Clear Format', '減少縮排（清單）':'Outdent (list)', '無序清單':'Bulleted List',
  '焦點模式':'Focus Mode', '程式碼區塊':'Code Block', '粗體':'Bold', '螢光標記':'Highlight',
  '行內公式 $…$':'Inline Math $…$', '行內程式碼':'Inline Code', '表格':'Table',
  '複製為 Markdown':'Copy as Markdown', '超連結':'Hyperlink', '重做':'Redo', '降低標題級別':'Demote Heading',
  '切換首行縮排':'Toggle First-line Indent', '偏好設定':'Preferences', '快速開檔':'Quick Open',
  '側欄:大綱':'Sidebar: Outline', '側欄:檔案':'Sidebar: Files', '在所有檔案中尋找':'Find in All Files',
  '貼上為純文字':'Paste as Plain Text', '選取單字':'Select Word', '刪除單字':'Delete Word',
  '選取表格列':'Select Table Row', '跳至選取':'Jump to Selection', '另存 Markdown 副本':'Save Markdown Copy',
  '打字機模式':'Typewriter Mode',
};
const TL = s => (isEN() && LABEL_EN[s]) ? LABEL_EN[s] : s;
function toast(msg, ms=1600){
  const t = $('#toast'); t.textContent = T(msg); t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(()=>t.classList.remove('show'), ms);
}
const activeFile = () => files.find(f => f.id === activeId);

/* CP98_LOSSLESS_CORE_BEGIN */
const LL_CORE_VERSION = 'CP98';
let LL_DOC_SEQUENCE = 0;

function llClamp(value, min, max){
  const n = Number.isFinite(Number(value)) ? Number(value) : min;
  return Math.max(min, Math.min(max, n));
}
function llHash(text){
  const s = String(text == null ? '' : text);
  let h = 0x811c9dc5;
  for (let i=0;i<s.length;i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}
function llEolProfile(raw){
  const s=String(raw==null?'':raw);
  let crlf=0,lf=0,cr=0;
  for(let i=0;i<s.length;i++){
    const c=s.charCodeAt(i);
    if(c===13){ if(s.charCodeAt(i+1)===10){crlf++;i++;} else cr++; }
    else if(c===10) lf++;
  }
  let preferred='\n';
  if(crlf && crlf>=lf && crlf>=cr) preferred='\r\n';
  else if(cr && cr>lf) preferred='\r';
  return {crlf,lf,cr,preferred,mixed:[crlf>0,lf>0,cr>0].filter(Boolean).length>1};
}
function llNormalizeRaw(raw){
  const source=String(raw==null?'':raw);
  const bom=source.charCodeAt(0)===0xfeff?'\ufeff':'';
  const body=bom?source.slice(1):source;
  return {raw:source,bom,normalized:body.replace(/\r\n?/g,'\n'),eol:llEolProfile(body)};
}
function llScanLines(raw,bomLength){
  const source=String(raw==null?'':raw);
  let pos=llClamp(bomLength||0,0,source.length), norm=0;
  const lines=[];
  while(pos<source.length){
    const start=pos;
    while(pos<source.length && source.charCodeAt(pos)!==10 && source.charCodeAt(pos)!==13) pos++;
    const contentEnd=pos;
    let eol='';
    if(pos<source.length){
      if(source.charCodeAt(pos)===13 && source.charCodeAt(pos+1)===10){eol='\r\n';pos+=2;}
      else {eol=source[pos];pos++;}
    }
    const text=source.slice(start,contentEnd);
    const normStart=norm, normContentEnd=normStart+text.length, normEnd=normContentEnd+(eol?1:0);
    lines.push({start,contentEnd,end:pos,text,eol,normStart,normContentEnd,normEnd});
    norm=normEnd;
  }
  return lines;
}
function llShiftSpan(span,delta){return {start:span.start+delta,end:span.end+delta};}
function llShiftInline(node,delta){
  return {type:node.type,source:llShiftSpan(node.source,delta),content:llShiftSpan(node.content,delta),
    markerOpen:node.markerOpen?llShiftSpan(node.markerOpen,delta):null,
    markerClose:node.markerClose?llShiftSpan(node.markerClose,delta):null,raw:node.raw};
}
function llShiftNode(node,delta){
  return {id:node.id,type:node.type,source:llShiftSpan(node.source,delta),content:llShiftSpan(node.content,delta),
    display:llShiftSpan(node.display,delta),raw:node.raw,hash:node.hash,lines:[...node.lines],
    inline:(node.inline||[]).map(x=>llShiftInline(x,delta))};
}
function llFindUnescaped(text,needle,from){
  let at=Math.max(0,from||0);
  while((at=text.indexOf(needle,at))>=0){
    let slash=0;for(let i=at-1;i>=0&&text[i]==='\\';i--)slash++;
    if((slash&1)===0)return at;
    at+=needle.length;
  }
  return -1;
}
function llPushTextInline(out,text,base,start,end){
  if(end<=start)return;
  out.push({type:'text',source:{start:base+start,end:base+end},content:{start:base+start,end:base+end},markerOpen:null,markerClose:null,raw:text.slice(start,end)});
}
function llParseInline(text,baseOffset){
  const src=String(text==null?'':text), base=Number(baseOffset)||0, out=[];
  let i=0,textStart=0;
  const emit=(type,start,end,contentStart,contentEnd,openEnd,closeStart)=>{
    llPushTextInline(out,src,base,textStart,start);
    out.push({type,source:{start:base+start,end:base+end},content:{start:base+contentStart,end:base+contentEnd},
      markerOpen:openEnd>start?{start:base+start,end:base+openEnd}:null,
      markerClose:end>closeStart?{start:base+closeStart,end:base+end}:null,raw:src.slice(start,end)});
    i=end;textStart=end;
  };
  while(i<src.length){
    if(src[i]==='\\'){i+=Math.min(2,src.length-i);continue;}
    if(src[i]==='\n'||src[i]==='\r'){i++;continue;}
    const image=src.startsWith('![',i);
    if(image||src[i]==='['){
      const openLen=image?2:1, labelEnd=llFindUnescaped(src,']',i+openLen);
      if(labelEnd>=0&&src[labelEnd+1]==='('){
        let depth=1,j=labelEnd+2;
        while(j<src.length&&depth){if(src[j]==='\\'){j+=2;continue;}if(src[j]==='(')depth++;else if(src[j]===')')depth--;j++;}
        if(!depth){emit(image?'image':'link',i,j,i+openLen,labelEnd,i+openLen,labelEnd);continue;}
      }
    }
    if(src[i]==='`'){
      let run=1;while(src[i+run]==='`')run++;
      const mark='`'.repeat(run),endAt=llFindUnescaped(src,mark,i+run);
      if(endAt>=0){emit('code',i,endAt+run,i+run,endAt,i+run,endAt);continue;}
    }
    let paired=false;
    for(const [mark,type] of [['**','strong'],['__','strong'],['~~','strike'],['==','mark']]){
      if(!src.startsWith(mark,i))continue;
      const endAt=llFindUnescaped(src,mark,i+mark.length);
      if(endAt>i+mark.length){emit(type,i,endAt+mark.length,i+mark.length,endAt,i+mark.length,endAt);paired=true;break;}
    }
    if(paired)continue;
    if((src[i]==='*'||src[i]==='_')&&src[i+1]!==src[i]){
      const endAt=llFindUnescaped(src,src[i],i+1);
      if(endAt>i+1){emit('em',i,endAt+1,i+1,endAt,i+1,endAt);continue;}
    }
    if(src[i]==='$'&&src[i+1]!=='$'){
      const endAt=llFindUnescaped(src,'$',i+1);
      if(endAt>i+1&&src.slice(i,endAt).indexOf('\n')<0){emit('math',i,endAt+1,i+1,endAt,i+1,endAt);continue;}
    }
    if(src[i]==='<'){
      const endAt=src.indexOf('>',i+1);
      if(endAt>=0&&src.slice(i,endAt+1).indexOf('\n')<0){emit('html',i,endAt+1,i,endAt+1,i,endAt+1);continue;}
    }
    i++;
  }
  llPushTextInline(out,src,base,textStart,src.length);
  return out;
}
function llFenceOpen(text){
  const m=String(text||'').match(/^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/);
  return m?{char:m[1][0],len:m[1].length,marker:m[1],info:m[2]||''}:null;
}
function llFenceClose(text,open){
  if(!open)return false;
  const re=open.char==='`'?/^ {0,3}(`{3,})\s*$/:/^ {0,3}(~{3,})\s*$/;
  const m=String(text||'').match(re);return !!(m&&m[1].length>=open.len);
}
function llIsBlank(line){return !line||/^\s*$/.test(line.text);}
function llIsTableDelimiter(text){
  const s=String(text||'').trim();if(!s||s.indexOf('|')<0)return false;
  const cells=s.replace(/^\|/,'').replace(/\|$/,'').split('|');
  return cells.length>=2&&cells.every(x=>/^\s*:?-{3,}:?\s*$/.test(x));
}
function llIsList(text){return /^ {0,3}(?:[-+*]|\d+[.)])\s+/.test(String(text||''));}
function llIsAtx(text){return /^ {0,3}#{1,6}(?:\s+|$)/.test(String(text||''));}
function llIsSetext(text){return /^ {0,3}(?:=+|-+)\s*$/.test(String(text||''));}
function llIsHr(text){return /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(String(text||''));}
function llIsHtmlStart(text){return /^ {0,3}<\/?[A-Za-z][^>]*>/.test(String(text||''));}
function llContentEndWithoutEol(raw,end){
  let out=end;if(out>0&&raw.charCodeAt(out-1)===10){out--;if(out>0&&raw.charCodeAt(out-1)===13)out--;}else if(out>0&&raw.charCodeAt(out-1)===13)out--;return out;
}
function llNodeSpans(raw,lines,startLine,endLine,type){
  const first=lines[startLine], last=lines[endLine-1];
  const source={start:first.start,end:last.end};
  let content={start:source.start,end:llContentEndWithoutEol(raw,source.end)};
  if(type==='heading'){
    const m=first.text.match(/^ {0,3}#{1,6}\s+/);
    if(m){const close=first.text.match(/\s+#+\s*$/);content={start:first.start+m[0].length,end:first.contentEnd-(close?close[0].length:0)};}
    else content={start:first.start,end:first.contentEnd};
  }else if(type==='frontmatter'){
    content={start:first.end,end:endLine-startLine>1?lines[endLine-1].start:source.end};
  }else if(type==='fence'){
    content={start:first.end,end:endLine-startLine>1?lines[endLine-1].start:source.end};
  }else if(type==='math'){
    content={start:first.end,end:endLine-startLine>1?lines[endLine-1].start:source.end};
  }else if(type==='blockquote'){
    const m=first.text.match(/^ {0,3}>\s?/);if(m)content.start=first.start+m[0].length;
  }else if(type==='list'){
    const m=first.text.match(/^ {0,3}(?:[-+*]|\d+[.)])\s+/);if(m)content.start=first.start+m[0].length;
  }else if(type==='reference'){
    const m=first.text.match(/^ {0,3}\[[^\]]+\]:\s*/);if(m)content.start=first.start+m[0].length;
  }
  return {source,content,display:{...content}};
}
function llBuildNode(raw,lines,startLine,endLine,type,id){
  const spans=llNodeSpans(raw,lines,startLine,endLine,type);
  const nodeRaw=raw.slice(spans.source.start,spans.source.end);
  const inlineTypes=new Set(['paragraph','heading','reference','blockquote','list']);
  return {id:id||'',type,source:spans.source,content:spans.content,display:spans.display,raw:nodeRaw,
    hash:llHash(type+'\u0000'+nodeRaw),lines:[startLine,endLine],
    inline:inlineTypes.has(type)?llParseInline(raw.slice(spans.content.start,spans.content.end),spans.content.start):[]};
}
function llParseBlockNodes(raw,bomLength){
  const lines=llScanLines(raw,bomLength),nodes=[];
  let i=0;
  while(i<lines.length){
    const line=lines[i],t=line.text,start=i;
    if(i===0&&t.trim()==='---'){
      let j=i+1;while(j<lines.length&&!/^(?:---|\.\.\.)\s*$/.test(lines[j].text.trim()))j++;
      if(j<lines.length){j++;nodes.push(llBuildNode(raw,lines,start,j,'frontmatter'));i=j;continue;}
    }
    const fence=llFenceOpen(t);
    if(fence){let j=i+1;while(j<lines.length&&!llFenceClose(lines[j].text,fence))j++;if(j<lines.length)j++;nodes.push(llBuildNode(raw,lines,start,j,'fence'));i=j;continue;}
    /* CP119:表格版面註解必須和緊接的 Markdown 表格共用一個 lossless node；
       否則 editor block 與 exact-raw node 數量不同，最小差異同步會把設定拆散。 */
    if(/^\s*<!--\s*ekdeta-html-table\s*:/i.test(t) && t.indexOf('-->')>=0 &&
       i+2<lines.length && lines[i+1].text.indexOf('|')>=0 && llIsTableDelimiter(lines[i+2].text)){
      let j=i+3;while(j<lines.length&&lines[j].text.indexOf('|')>=0&&!llIsBlank(lines[j]))j++;
      nodes.push(llBuildNode(raw,lines,start,j,'table'));i=j;continue;
    }
    if(/^\s*<!--/.test(t)){
      let j=i+1;if(t.indexOf('-->')<0){while(j<lines.length&&lines[j].text.indexOf('-->')<0)j++;if(j<lines.length)j++;}
      nodes.push(llBuildNode(raw,lines,start,j,'html-comment'));i=j;continue;
    }
    if(/^\s*\$\$/.test(t)){
      let j=i+1;
      const rest=t.replace(/^\s*\$\$/,'');
      /* 1.2.6：公式結尾的 $$ 後面可以接 {#eq:名稱} 或 {-}（國際論文的編號標籤），仍算公式結束。 */
      if(!isMathClose(rest)){while(j<lines.length&&!isMathClose(lines[j].text))j++;if(j<lines.length)j++;}
      nodes.push(llBuildNode(raw,lines,start,j,'math'));i=j;continue;
    }
    if(/^\s*\\\[\s*$/.test(t)){
      let j=i+1;while(j<lines.length&&!/^\s*\\\]\s*$/.test(lines[j].text))j++;if(j<lines.length)j++;
      nodes.push(llBuildNode(raw,lines,start,j,'math'));i=j;continue;
    }
    if(t.indexOf('|')>=0&&i+1<lines.length&&llIsTableDelimiter(lines[i+1].text)){
      let j=i+2;while(j<lines.length&&lines[j].text.indexOf('|')>=0&&!llIsBlank(lines[j]))j++;
      nodes.push(llBuildNode(raw,lines,start,j,'table'));i=j;continue;
    }
    if(i+1<lines.length&&!llIsBlank(line)&&llIsSetext(lines[i+1].text)&&!llIsHr(lines[i+1].text)){
      nodes.push(llBuildNode(raw,lines,start,i+2,'heading'));i+=2;continue;
    }
    let type='paragraph';
    if(llIsBlank(line))type='blank';
    else if(llIsAtx(t))type='heading';
    else if(llIsHr(t))type='hr';
    else if(/^ {0,3}>/.test(t))type='blockquote';
    else if(llIsList(t))type='list';
    else if(/^ {0,3}\[[^\]]+\]:/.test(t))type='reference';
    else if(llIsHtmlStart(t))type='html';
    nodes.push(llBuildNode(raw,lines,start,i+1,type));i++;
  }
  return {lines,nodes};
}
function llAssignNodeIds(nextNodes,oldNodes,prefix,counterRef){
  const fresh=nextNodes.map(n=>({...n,id:''})), old=Array.isArray(oldNodes)?oldNodes:[];
  const usedOld=new Set(),usedNew=new Set();
  const same=(a,b)=>a&&b&&a.type===b.type&&a.raw===b.raw;
  const assign=(ni,oi)=>{if(ni<0||oi<0||usedNew.has(ni)||usedOld.has(oi))return false;fresh[ni].id=old[oi].id;usedNew.add(ni);usedOld.add(oi);return true;};
  let p=0;while(p<fresh.length&&p<old.length&&same(fresh[p],old[p])){assign(p,p);p++;}
  let ni=fresh.length-1,oi=old.length-1;
  while(ni>=p&&oi>=p&&same(fresh[ni],old[oi])){assign(ni,oi);ni--;oi--;}
  const buckets=new Map();
  for(let j=0;j<old.length;j++)if(!usedOld.has(j)){const k=old[j].type+'\u0000'+old[j].raw;const a=buckets.get(k)||[];a.push(j);buckets.set(k,a);}
  let last=-1;
  for(let j=0;j<fresh.length;j++)if(!usedNew.has(j)){
    const k=fresh[j].type+'\u0000'+fresh[j].raw,a=buckets.get(k)||[];
    let hit=-1;for(let q=0;q<a.length;q++)if(!usedOld.has(a[q])&&a[q]>last){hit=a[q];break;}
    if(hit<0)for(let q=0;q<a.length;q++)if(!usedOld.has(a[q])){hit=a[q];break;}
    if(hit>=0){assign(j,hit);last=hit;}
  }
  const oldRemain=[];for(let j=0;j<old.length;j++)if(!usedOld.has(j))oldRemain.push(j);
  let cursor=0;
  for(let j=0;j<fresh.length;j++)if(!usedNew.has(j)){
    let hit=-1;for(let q=cursor;q<oldRemain.length;q++)if(!usedOld.has(oldRemain[q])&&old[oldRemain[q]].type===fresh[j].type){hit=q;break;}
    if(hit>=0){assign(j,oldRemain[hit]);cursor=hit+1;}
  }
  for(const node of fresh)if(!node.id)node.id=prefix+':n'+(++counterRef.value);
  return fresh;
}
function llMinimalDiff(before,after){
  const a=String(before==null?'':before),b=String(after==null?'':after);if(a===b)return null;
  let start=0,min=Math.min(a.length,b.length);while(start<min&&a.charCodeAt(start)===b.charCodeAt(start))start++;
  let ae=a.length,be=b.length;while(ae>start&&be>start&&a.charCodeAt(ae-1)===b.charCodeAt(be-1)){ae--;be--;}
  return {start,end:ae,insert:b.slice(start,be)};
}
/* Source mode can contain two distant edits before the 90 ms compatibility sync.
   A single prefix/suffix diff would then replace the untouched middle and normalize
   every mixed line ending inside it.  This bounded recursive diff uses whole,
   unique unchanged lines as anchors.  It deliberately falls back to one safe hunk
   when no trustworthy anchor exists; unchanged anchored ranges keep their exact raw
   bytes (within the JS UTF-16 string model). */
function llDiffLineRecords(text,start,end){
  const s=String(text==null?'':text),out=[];let p=start;
  if(p>0&&s[p-1]!=='\n'){const n=s.indexOf('\n',p);if(n<0||n+1>=end)return out;p=n+1;}
  while(p<end){
    const n=s.indexOf('\n',p);if(n<0||n+1>end)break;
    const e=n+1,raw=s.slice(p,e);if(raw.length>=8&&/\S/.test(raw))out.push({start:p,end:e,raw});p=e;
  }
  return out;
}
function llFindDiffAnchor(a,a0,a1,b,b0,b1){
  const aa=llDiffLineRecords(a,a0,a1),bb=llDiffLineRecords(b,b0,b1);if(!aa.length||!bb.length)return null;
  const am=new Map(),bm=new Map();
  for(const r of aa){const x=am.get(r.raw);if(x)x.count++;else am.set(r.raw,{count:1,rec:r});}
  for(const r of bb){const x=bm.get(r.raw);if(x)x.count++;else bm.set(r.raw,{count:1,rec:r});}
  let best=null,bestScore=-Infinity;
  for(const [raw,x] of am){const y=bm.get(raw);if(x.count!==1||!y||y.count!==1)continue;
    const ar=(x.rec.start-a0)/Math.max(1,a1-a0),br=(y.rec.start-b0)/Math.max(1,b1-b0);
    const score=raw.length-Math.abs(ar-br)*8;
    if(score>bestScore){bestScore=score;best={aStart:x.rec.start,aEnd:x.rec.end,bStart:y.rec.start,bEnd:y.rec.end};}
  }
  return best;
}
function llDiffHunks(before,after){
  const a=String(before==null?'':before),b=String(after==null?'':after);if(a===b)return[];
  const out=[];
  const walk=(a0,a1,b0,b1,depth)=>{
    while(a0<a1&&b0<b1&&a.charCodeAt(a0)===b.charCodeAt(b0)){a0++;b0++;}
    while(a1>a0&&b1>b0&&a.charCodeAt(a1-1)===b.charCodeAt(b1-1)){a1--;b1--;}
    if(a0===a1&&b0===b1)return;
    if(depth<64){const anchor=llFindDiffAnchor(a,a0,a1,b,b0,b1);if(anchor){walk(a0,anchor.aStart,b0,anchor.bStart,depth+1);walk(anchor.aEnd,a1,anchor.bEnd,b1,depth+1);return;}}
    out.push({start:a0,end:a1,insert:b.slice(b0,b1)});
  };
  walk(0,a.length,0,b.length,0);out.sort((x,y)=>x.start-y.start);
  const merged=[];for(const h of out){const last=merged[merged.length-1];if(last&&h.start<=last.end){const gap=a.slice(last.end,h.start);last.end=Math.max(last.end,h.end);last.insert+=gap+h.insert;}else merged.push({...h});}
  return merged;
}
class LosslessMarkdownDocument{
  constructor(raw){this.version=LL_CORE_VERSION;this.id='lld'+(++LL_DOC_SEQUENCE);this._counter={value:0};this.revision=0;this.raw=String(raw==null?'':raw);this.lastChange=null;this._rebuild([],'full',null,null);}
  _rebuild(oldNodes,mode,reparsedNodes,changed){
    const meta=llNormalizeRaw(this.raw);this.bom=meta.bom;this.bomLength=this.bom?1:0;this.eol=meta.eol;this.normalized=meta.normalized;
    const parsed=llParseBlockNodes(this.raw,this.bomLength);this.lines=parsed.lines;this.nodes=llAssignNodeIds(parsed.nodes,oldNodes||[],this.id,this._counter);
    this.stats={mode,reparsedNodes:reparsedNodes==null?this.nodes.length:reparsedNodes,totalNodes:this.nodes.length,revision:this.revision,changed:changed||null};
    if(mode!=='noop')this.lastChange={...this.stats};
  }
  _lineForNormalized(offset){
    const n=llClamp(offset,0,this.normalized.length);if(!this.lines.length)return null;
    let lo=0,hi=this.lines.length-1;while(lo<=hi){const mid=(lo+hi)>>1,l=this.lines[mid];if(n<l.normStart)hi=mid-1;else if(n>l.normEnd)lo=mid+1;else return l;}
    return this.lines[Math.max(0,Math.min(this.lines.length-1,lo))];
  }
  rawOffsetFromNormalized(offset){
    const n=llClamp(offset,0,this.normalized.length);if(!this.lines.length)return this.bomLength;if(n===this.normalized.length)return this.raw.length;
    const l=this._lineForNormalized(n);if(!l)return this.bomLength;const within=n-l.normStart;return within<=l.text.length?l.start+within:l.end;
  }
  normalizedOffsetFromRaw(offset){
    const r=llClamp(offset,this.bomLength,this.raw.length);if(!this.lines.length)return 0;if(r===this.raw.length)return this.normalized.length;
    let lo=0,hi=this.lines.length-1;while(lo<=hi){const mid=(lo+hi)>>1,l=this.lines[mid];if(r<l.start)hi=mid-1;else if(r>l.end)lo=mid+1;else return r<=l.contentEnd?l.normStart+(r-l.start):l.normEnd;}
    return this.normalized.length;
  }
  _nodeIndexAtRaw(offset,includeEnd){
    const n=llClamp(offset,this.bomLength,this.raw.length);let lo=0,hi=this.nodes.length-1;
    while(lo<=hi){const mid=(lo+hi)>>1,node=this.nodes[mid];if(n<node.source.start)hi=mid-1;else if(n>node.source.end||(!includeEnd&&n===node.source.end))lo=mid+1;else return mid;}return -1;
  }
  _tryIncrementalReplace(from,to,insertRaw){
    if(/[\r\n]/.test(insertRaw)||/[\r\n]/.test(this.raw.slice(from,to)))return false;
    const idx=this._nodeIndexAtRaw(from,true);if(idx<0||idx!==this._nodeIndexAtRaw(to,true))return false;
    const node=this.nodes[idx];if(!['paragraph','heading','reference','list','blockquote'].includes(node.type))return false;
    if(from<node.content.start||to>node.content.end)return false;
    const delta=insertRaw.length-(to-from),nextRaw=this.raw.slice(0,from)+insertRaw+this.raw.slice(to),nodeEnd=node.source.end+delta;
    const fragment=nextRaw.slice(node.source.start,nodeEnd),parsed=llParseBlockNodes(fragment,0).nodes;
    if(parsed.length!==1||parsed[0].type!==node.type||parsed[0].source.end!==fragment.length)return false;
    const rebuilt=llShiftNode(parsed[0],node.source.start);rebuilt.id=node.id;
    const next=this.nodes.slice(0,idx);next.push(rebuilt);for(let i=idx+1;i<this.nodes.length;i++)next.push(llShiftNode(this.nodes[i],delta));
    this.raw=nextRaw;const meta=llNormalizeRaw(this.raw);this.bom=meta.bom;this.bomLength=this.bom?1:0;this.eol=meta.eol;this.normalized=meta.normalized;this.lines=llScanLines(this.raw,this.bomLength);this.nodes=next;
    this.stats={mode:'incremental',reparsedNodes:1,totalNodes:this.nodes.length,revision:this.revision,changed:{rawStart:from,rawEnd:to,insertedRaw:insertRaw.length}};this.lastChange={...this.stats};return true;
  }
  replaceRawRange(from,to,insertRaw){
    const start=llClamp(from,this.bomLength,this.raw.length),end=llClamp(to,start,this.raw.length),insert=String(insertRaw==null?'':insertRaw);
    if(start===end&&!insert)return this;const old=this.nodes;this.revision++;
    if(this._tryIncrementalReplace(start,end,insert)){this.stats.revision=this.revision;this.lastChange.revision=this.revision;return this;}
    this.raw=this.raw.slice(0,start)+insert+this.raw.slice(end);this._rebuild(old,'full',null,{rawStart:start,rawEnd:end,insertedRaw:insert.length});this.stats.revision=this.revision;this.lastChange.revision=this.revision;return this;
  }
  replaceNormalizedRange(from,to,insertText){
    const start=llClamp(from,0,this.normalized.length),end=llClamp(to,start,this.normalized.length),ins=String(insertText==null?'':insertText).replace(/\r\n?/g,'\n');
    return this.replaceRawRange(this.rawOffsetFromNormalized(start),this.rawOffsetFromNormalized(end),ins.replace(/\n/g,this.eol.preferred||'\n'));
  }
  replaceNormalizedChanges(changes){
    const list=(Array.isArray(changes)?changes:[]).map(x=>({start:llClamp(x.start,0,this.normalized.length),end:llClamp(x.end,0,this.normalized.length),insert:String(x.insert==null?'':x.insert).replace(/\r\n?/g,'\n')})).sort((a,b)=>a.start-b.start);
    if(!list.length)return this;
    for(let i=0;i<list.length;i++){if(list[i].end<list[i].start||(i&&list[i].start<list[i-1].end))throw new Error('overlapping normalized changes');}
    if(list.length===1)return this.replaceNormalizedRange(list[0].start,list[0].end,list[0].insert);
    const old=this.nodes,rawChanges=list.map(x=>({rawStart:this.rawOffsetFromNormalized(x.start),rawEnd:this.rawOffsetFromNormalized(x.end),insert:x.insert.replace(/\n/g,this.eol.preferred||'\n'),normalizedStart:x.start,normalizedEnd:x.end}));
    let nextRaw=this.raw;for(let i=rawChanges.length-1;i>=0;i--){const x=rawChanges[i];nextRaw=nextRaw.slice(0,x.rawStart)+x.insert+nextRaw.slice(x.rawEnd);}
    this.revision++;this.raw=nextRaw;this._rebuild(old,'full',null,{ranges:rawChanges.map(x=>({rawStart:x.rawStart,rawEnd:x.rawEnd,insertedRaw:x.insert.length,normalizedStart:x.normalizedStart,normalizedEnd:x.normalizedEnd}))});this.stats.revision=this.revision;this.lastChange.revision=this.revision;return this;
  }
  syncNormalized(nextText){
    const next=String(nextText==null?'':nextText).replace(/^\ufeff/,'').replace(/\r\n?/g,'\n'),changes=llDiffHunks(this.normalized,next);
    if(!changes.length){this.stats={mode:'noop',reparsedNodes:0,totalNodes:this.nodes.length,revision:this.revision,changed:null};return this;}
    return this.replaceNormalizedChanges(changes);
  }
  serialize(){return this.raw;}
  getNormalizedText(){return this.normalized;}
  normalizedSpan(node,field){const span=node&&node[field||'source'];return span?{start:this.normalizedOffsetFromRaw(span.start),end:this.normalizedOffsetFromRaw(span.end)}:null;}
  nodeMap(){return this.nodes.map(n=>({id:n.id,type:n.type,lines:[...n.lines],hash:n.hash,source:{...n.source},content:{...n.content},display:{...n.display},normalizedSource:this.normalizedSpan(n,'source'),normalizedContent:this.normalizedSpan(n,'content'),normalizedDisplay:this.normalizedSpan(n,'display'),inline:(n.inline||[]).map(x=>({type:x.type,source:{...x.source},content:{...x.content},normalizedSource:{start:this.normalizedOffsetFromRaw(x.source.start),end:this.normalizedOffsetFromRaw(x.source.end)},normalizedContent:{start:this.normalizedOffsetFromRaw(x.content.start),end:this.normalizedOffsetFromRaw(x.content.end)}}))}));}
  nodeAtNormalized(offset){const idx=this._nodeIndexAtRaw(this.rawOffsetFromNormalized(offset),true);return idx>=0?this.nodes[idx]:null;}
  summary(){const types={};for(const n of this.nodes)types[n.type]=(types[n.type]||0)+1;return {version:this.version,id:this.id,revision:this.revision,rawLength:this.raw.length,normalizedLength:this.normalized.length,bom:!!this.bom,preferredEol:this.eol.preferred,mixedEol:this.eol.mixed,eolCounts:{crlf:this.eol.crlf,lf:this.eol.lf,cr:this.eol.cr},lines:this.lines.length,nodes:this.nodes.length,types,stats:{...this.stats},lastChange:this.lastChange?{...this.lastChange}:null};}
  validate(){
    const errors=[],seen=new Set();let cursor=this.bomLength;
    for(let i=0;i<this.nodes.length;i++){
      const n=this.nodes[i];if(!n.id||seen.has(n.id))errors.push('duplicate-or-empty-id:'+i);seen.add(n.id);
      if(n.source.start!==cursor)errors.push('gap:'+i+':'+cursor+'!='+n.source.start);
      if(n.source.end<n.source.start||n.source.end>this.raw.length)errors.push('bad-source:'+i);
      if(this.raw.slice(n.source.start,n.source.end)!==n.raw)errors.push('raw-mismatch:'+i);
      if(n.content.start<n.source.start||n.content.end>n.source.end||n.content.end<n.content.start)errors.push('bad-content:'+i);
      for(const x of n.inline||[])if(x.source.start<n.content.start||x.source.end>n.content.end||x.source.end<x.source.start)errors.push('bad-inline:'+i);
      cursor=n.source.end;
    }
    if(cursor!==this.raw.length)errors.push('tail:'+cursor+'!='+this.raw.length);
    if(this.normalized!==llNormalizeRaw(this.raw).normalized)errors.push('normalized-mismatch');
    return {ok:errors.length===0,errors,summary:this.summary()};
  }
}
/* CP98_LOSSLESS_CORE_END */

/* CP137_RAW_INTEGRITY_BEGIN
   Earlier formatting builds could persist the renderer's escaped representation
   (for example &#35;, &#46;, &#91;) and generated semantic HTML tags into the
   Markdown source.  Rendering hid the damage because HTML entities decode back
   to punctuation.  This boundary repair is deliberately conservative, preserves
   fenced-code bodies byte-for-byte, and runs before any document is mounted or
   synchronized. */
const RAW_INTEGRITY_PUNCT = new Set([
  33,34,35,36,37,39,40,41,42,43,44,45,46,47,58,59,61,63,64,
  91,92,93,94,95,96,123,124,125,126
]);
const RAW_INTEGRITY_ENTITY_RE = /&#(?:([0-9]{1,7})|x([0-9a-fA-F]{1,6}));/g;
const RAW_INTEGRITY_SEMANTIC_RE = /<\/?(?:strong|b|em|i|del|s|mark|code)>/gi;
const rawIntegrityNotified = new Set();
function rawIntegrityEntityCode(m,dec,hex){
  const n = dec != null ? Number(dec) : parseInt(hex,16);
  return Number.isFinite(n) ? n : -1;
}
function rawIntegrityDecodePunctuation(text){
  return String(text == null ? '' : text).replace(RAW_INTEGRITY_ENTITY_RE,(m,dec,hex)=>{
    const n=rawIntegrityEntityCode(m,dec,hex);
    return RAW_INTEGRITY_PUNCT.has(n) ? String.fromCodePoint(n) : m;
  });
}
function rawIntegrityStats(text){
  text=String(text == null ? '' : text);
  const codes=new Set(); let entities=0, structural=0, semantic=0, m;
  RAW_INTEGRITY_ENTITY_RE.lastIndex=0;
  while((m=RAW_INTEGRITY_ENTITY_RE.exec(text))){
    const n=rawIntegrityEntityCode(m,m[1],m[2]);
    if(RAW_INTEGRITY_PUNCT.has(n)){entities++;codes.add(n);}
  }
  const lines=text.split(/\r\n|\r|\n/);
  for(const line of lines){
    const d=rawIntegrityDecodePunctuation(line);
    if(/^ {0,3}(?:#{1,6})(?:\s|$)/.test(d) || /^ {0,3}(?:`{3,}|~{3,})(?:[^`~]*$)/.test(d)) structural++;
  }
  RAW_INTEGRITY_SEMANTIC_RE.lastIndex=0;
  while(RAW_INTEGRITY_SEMANTIC_RE.exec(text))semantic++;
  const strong = structural>0 || entities>=6 || (entities>=3&&codes.size>=2) || (semantic>0&&entities>=2);
  return {entities,distinct:codes.size,structural,semantic,strong};
}
function rawIntegrityFenceInfo(line){
  const m=String(line).match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  return m ? {ch:m[1][0],len:m[1].length,tail:m[2]} : null;
}
function rawIntegrityInlineMarker(kind,inner){
  inner=String(inner == null ? '' : inner);
  if(kind==='code'){
    let max=0; inner.replace(/`+/g,x=>{max=Math.max(max,x.length);return x;});
    const tick='`'.repeat(max+1); return tick+inner+tick;
  }
  const pairs={strong:[['**','**'],['__','__']],em:[['*','*'],['_','_']],del:[['~~','~~']],mark:[['==','==']]};
  for(const [a,b] of pairs[kind]||[]){ if(!inner.includes(a))return a+inner+b; }
  return null;
}
function rawIntegrityRepairSemanticTags(line){
  let out=String(line), changed=false, guard=0;
  const specs=[
    ['code',/<code>([\s\S]*?)<\/code>/gi],
    ['strong',/<(?:strong|b)>([\s\S]*?)<\/(?:strong|b)>/gi],
    ['em',/<(?:em|i)>([\s\S]*?)<\/(?:em|i)>/gi],
    ['del',/<(?:del|s)>([\s\S]*?)<\/(?:del|s)>/gi],
    ['mark',/<mark>([\s\S]*?)<\/mark>/gi]
  ];
  do{
    const before=out;
    for(const [kind,re] of specs){
      re.lastIndex=0;
      out=out.replace(re,(whole,inner)=>{
        const z=rawIntegrityInlineMarker(kind,inner);
        if(z==null)return whole; changed=true; return z;
      });
    }
    if(out===before)break;
  }while(++guard<12);
  return {text:out,changed};
}
function rawIntegrityRepair(text){
  const source=String(text == null ? '' : text), stats=rawIntegrityStats(source);
  /* Exact, attribute-free semantic tags are formatter-generated in the affected
     builds.  Converting them is rendering-equivalent even when entity pollution
     is absent. Numeric entities are decoded only under a strong corruption
     signature, so a lone deliberate &#46; remains untouched. */
  const repairEntities=stats.strong, repairTags=stats.semantic>0;
  if(!repairEntities&&!repairTags)return {text:source,changed:false,stats,repairedEntities:0,repairedTags:0};
  const chunks=source.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)||[source];
  let inFence=null,out='',repairedEntities=0,repairedTags=0;
  for(const chunk of chunks){
    if(chunk===''&&out.length===source.length)continue;
    const em=chunk.match(/(\r\n|\r|\n)$/), eol=em?em[1]:'', body=eol?chunk.slice(0,-eol.length):chunk;
    if(inFence){
      const d=repairEntities?rawIntegrityDecodePunctuation(body):body;
      const fi=rawIntegrityFenceInfo(d);
      if(fi&&fi.ch===inFence.ch&&fi.len>=inFence.len&&/^\s*$/.test(fi.tail)){
        repairedEntities += d===body?0:1; out+=d+eol; inFence=null;
      }else out+=body+eol; /* fenced body stays byte-for-byte */
      continue;
    }
    let line=body;
    if(repairEntities){const d=rawIntegrityDecodePunctuation(line);if(d!==line)repairedEntities++;line=d;}
    if(repairTags){const q=rawIntegrityRepairSemanticTags(line);if(q.changed)repairedTags++;line=q.text;}
    const fi=rawIntegrityFenceInfo(line); if(fi)inFence={ch:fi.ch,len:fi.len};
    out+=line+eol;
  }
  return {text:out,changed:out!==source,stats,repairedEntities,repairedTags};
}
function rawIntegrityIsBuiltin(file){
  if(!file)return false;
  try{return typeof isBuiltinFile==='function'&&isBuiltinFile(file);}catch(_){return false;}
}
function rawIntegrityRepairForFile(file,text){
  const source=String(text==null?'':text);
  /* CP142: Current built-in documents are generated from this HTML and are not
     legacy persisted data. They can intentionally describe strings such as
     `&#91;` or `<strong>`; migration repair must never rewrite those examples. */
  if(rawIntegrityIsBuiltin(file))return {text:source,changed:false,stats:null,repairedEntities:0,repairedTags:0,skipped:'builtin'};
  return rawIntegrityRepair(source);
}
function rawIntegrityNotify(file,report){
  if(rawIntegrityIsBuiltin(file)||!report||!report.changed)return;
  const key=String(file&&file.id||'active'); if(rawIntegrityNotified.has(key))return;
  rawIntegrityNotified.add(key);
  setTimeout(()=>{if(typeof toast==='function')toast(typeof TT==='function'
    ? TT('已修復舊版造成的 Markdown 符號／格式原始碼污染。','Repaired legacy Markdown entity and formatting-source corruption.')
    : '已修復舊版造成的 Markdown 原始碼污染。');},0);
}
window.__CP137_RAW_INTEGRITY__={stats:rawIntegrityStats,repair:rawIntegrityRepair,repairForFile:rawIntegrityRepairForFile,decode:rawIntegrityDecodePunctuation};
/* CP137_RAW_INTEGRITY_END */

/* CP98_LOSSLESS_BRIDGE_BEGIN */
const losslessDocs = new Map();
let losslessSyncTimer = null;
let losslessLastError = '';
let losslessLastMode = 'idle';
function losslessEnabled(){ return settings.losslessCore !== false; }
function losslessNormalized(text){ return llNormalizeRaw(String(text == null ? '' : text)).normalized; }
function losslessResetAll(){ clearTimeout(losslessSyncTimer);losslessSyncTimer=null;losslessDocs.clear();losslessLastError='';losslessLastMode='reset'; }
function losslessDropFile(id){ if(id!=null)losslessDocs.delete(String(id)); if(typeof txnDropFile==='function')txnDropFile(id); }
function losslessDocForFile(file){
  if(!file||!losslessEnabled())return null;
  let doc=losslessDocs.get(file.id);
  if(!doc){
    const rr=rawIntegrityRepairForFile(file,String(file.content==null?'':file.content));
    if(rr.changed){file.content=rr.text;rawIntegrityNotify(file,rr);}
    doc=new LosslessMarkdownDocument(rr.text);losslessDocs.set(file.id,doc);losslessLastMode=rr.changed?'open:repaired':'open';
  }
  return doc;
}
function losslessActiveDoc(){return losslessDocForFile(activeFile());}
function losslessProjectForMount(value,reason){
  let source=String(value==null?'':value);const file=activeFile();
  const sourceRepair=rawIntegrityRepairForFile(file,source);if(sourceRepair.changed)source=sourceRepair.text;
  let normalized=losslessNormalized(source);
  if(!file||!losslessEnabled())return normalized;
  try{
    const oldFileRaw=String(file.content==null?'':file.content),fileRepair=rawIntegrityRepairForFile(file,oldFileRaw);
    if(fileRepair.changed){file.content=fileRepair.text;losslessDocs.delete(file.id);rawIntegrityNotify(file,fileRepair);}
    if(sourceRepair.changed)rawIntegrityNotify(file,sourceRepair);
    let fileRaw=String(file.content==null?'':file.content);
    if(String(value==null?'':value)===oldFileRaw&&fileRepair.changed){source=fileRaw;normalized=losslessNormalized(source);}
    let doc=losslessDocs.get(file.id);
    if(!doc){doc=new LosslessMarkdownDocument(fileRaw);losslessDocs.set(file.id,doc);losslessLastMode='open:'+(reason||'mount');}
    if(source===fileRaw&&doc.serialize()!==fileRaw){doc=new LosslessMarkdownDocument(fileRaw);losslessDocs.set(file.id,doc);losslessLastMode='reload:'+(reason||'mount');}
    else if(doc.getNormalizedText()!==normalized){doc.syncNormalized(normalized);file.content=doc.serialize();losslessLastMode=doc.stats.mode+':'+(reason||'mount');}
    else losslessLastMode='project:'+(reason||'mount');
    losslessLastError='';return doc.getNormalizedText();
  }catch(error){
    losslessLastError=String(error&&error.message||error||'lossless mount failed');losslessLastMode='fallback:mount';losslessDocs.delete(file.id);file.content=normalized;return normalized;
  }
}
function losslessActiveNormalized(){const doc=losslessActiveDoc();return doc?doc.getNormalizedText():losslessNormalized(activeFile()?.content??'');}
function losslessSyncActiveText(text,reason){
  const file=activeFile(),rr=rawIntegrityRepairForFile(file,String(text==null?'':text));
  const normalized=losslessNormalized(rr.text);if(!file)return normalized;
  if(rr.changed)rawIntegrityNotify(file,rr);
  if(!losslessEnabled()){file.content=normalized;losslessLastMode='legacy:'+(reason||'sync');return file.content;}
  try{
    const doc=losslessDocForFile(file)||new LosslessMarkdownDocument(String(file.content==null?'':file.content));const txnPrevRaw=(typeof txnEnabled==='function'&&txnEnabled())?doc.serialize():null;doc.syncNormalized(normalized);if(txnPrevRaw!==null&&typeof txnRecordFromRawChange==='function')txnRecordFromRawChange(file.id,txnPrevRaw,doc,reason||'sync');losslessDocs.set(file.id,doc);file.content=doc.serialize();losslessLastError='';losslessLastMode=(rr.changed?'repair+':'')+doc.stats.mode+':'+(reason||'sync');return file.content;
  }catch(error){
    losslessLastError=String(error&&error.message||error||'lossless sync failed');losslessLastMode='fallback:sync';losslessDocs.delete(file.id);file.content=normalized;return file.content;
  }
}
function losslessContentForActive(reason){
  clearTimeout(losslessSyncTimer);losslessSyncTimer=null;
  const text=settings.srcmode?srcview.value:serialize(),exact=losslessSyncActiveText(text,reason||'flush');
  if(!settings.srcmode)losslessDecorateEditor();return exact;
}
function losslessScheduleSync(reason){
  clearTimeout(losslessSyncTimer);if(!losslessEnabled())return;const fileId=activeId;
  losslessSyncTimer=setTimeout(()=>{losslessSyncTimer=null;if(fileId!==activeId)return;if(typeof composing!=='undefined'&&composing){losslessScheduleSync(reason);return;}   /* CP100:組字期間不吸入半成品;結束後由 compositionend→onEdited 補跑 */try{losslessContentForActive(reason||'debounced-edit');}catch(error){losslessLastError=String(error&&error.message||error);losslessLastMode='fallback:timer';}},90);
}
function losslessClearEditorMap(){
  if(!editor)return;for(const el of editor.children)for(const k of ['llNodeId','llNodeType','llRawStart','llRawEnd','llNormStart','llNormEnd','llBlockStart','llBlockEnd','llRevision'])delete el.dataset[k];
  for(const k of ['llCore','llRevision','llMappedBlocks'])delete editor.dataset[k];
}
function losslessDecorateEditor(){
  if(!editor)return[];const doc=losslessActiveDoc();if(!doc||!losslessEnabled()){losslessClearEditorMap();return[];}
  const spans=doc.nodes.map(node=>({node,start:doc.normalizedOffsetFromRaw(node.source.start),end:doc.normalizedOffsetFromRaw(node.source.end)}));
  const result=[];let blockStart=0,nodeIndex=0;
  for(let i=0;i<editor.children.length;i++){
    const el=editor.children[i],block=String(blocks[i]==null?'':blocks[i]),blockEnd=blockStart+block.length;
    while(nodeIndex+1<spans.length&&blockStart>=spans[nodeIndex].end)nodeIndex++;
    const hit=spans[nodeIndex]||null;
    if(hit){
      Object.assign(el.dataset,{llNodeId:hit.node.id,llNodeType:hit.node.type,llRawStart:String(hit.node.source.start),llRawEnd:String(hit.node.source.end),llNormStart:String(hit.start),llNormEnd:String(hit.end),llBlockStart:String(blockStart),llBlockEnd:String(blockEnd),llRevision:String(doc.revision)});
      result.push({block:i,nodeId:hit.node.id,nodeType:hit.node.type,blockStart,blockEnd,nodeStart:hit.start,nodeEnd:hit.end});
    }
    blockStart=blockEnd+(i+1<blocks.length?1:0);
  }
  editor.dataset.llCore=LL_CORE_VERSION;editor.dataset.llRevision=String(doc.revision);editor.dataset.llMappedBlocks=String(result.length);return result;
}
function losslessEditorMap(){
  if(!editor)return[];return[...editor.children].map((el,block)=>({block,nodeId:el.dataset.llNodeId||'',nodeType:el.dataset.llNodeType||'',rawStart:Number(el.dataset.llRawStart||0),rawEnd:Number(el.dataset.llRawEnd||0),nodeStart:Number(el.dataset.llNormStart||0),nodeEnd:Number(el.dataset.llNormEnd||0),blockStart:Number(el.dataset.llBlockStart||0),blockEnd:Number(el.dataset.llBlockEnd||0),revision:Number(el.dataset.llRevision||0)}));
}
function losslessAudit(){
  const file=activeFile(),doc=losslessActiveDoc();if(!file||!doc)return{version:LL_CORE_VERSION,enabled:losslessEnabled(),active:false,lastError:losslessLastError,lastMode:losslessLastMode};
  const current=settings.srcmode?String(srcview.value||''):serialize(),validation=doc.validate(),mapped=losslessEditorMap();
  return{version:LL_CORE_VERSION,enabled:losslessEnabled(),active:true,fileId:file.id,fileName:file.name,normalizedInSync:doc.getNormalizedText()===losslessNormalized(current),fileExactInSync:String(file.content==null?'':file.content)===doc.serialize(),mappedBlocks:mapped.filter(x=>x.nodeId).length,editorBlocks:editor?editor.children.length:0,lastError:losslessLastError,lastMode:losslessLastMode,validation,summary:doc.summary(),lastChange:doc.lastChange?{...doc.lastChange}:null};
}
function losslessSetEnabled(value){
  const next=value!==false;if(losslessEnabled()&&!next)losslessContentForActive('disable');settings.losslessCore=next;losslessResetAll();const file=activeFile();if(file&&typeof mountDoc==='function')mountDoc(file.content);return losslessAudit();
}
window.__CP98_LOSSLESS_CORE__=Object.freeze({version:LL_CORE_VERSION,mode:'single-html reusable web core; shadow compatibility layer',create:raw=>new LosslessMarkdownDocument(raw),audit:losslessAudit,sync:()=>losslessContentForActive('api'),activeSummary:()=>losslessActiveDoc()?.summary()||null,activeSource:()=>losslessActiveDoc()?.serialize()??null,activeNormalized:losslessActiveNormalized,activeNodes:()=>losslessActiveDoc()?.nodeMap()||[],editorMap:losslessEditorMap,setEnabled:losslessSetEnabled,reset:losslessResetAll});
/* CP98_LOSSLESS_BRIDGE_END */
/* CP100_TXN_CORE_BEGIN */
/* CP100a(0.9.87)— 交易／選取核心第一階段:純函式層 + record-only 紀錄。
   ‧ 交易=可序列化步驟串 {rawStart,rawEnd,removed,insert}(原始座標,套用時由後往前)。
   ‧ txnInvert 由 removed/insert 構造逆交易 — undo 回放 byte-exact by construction。
   ‧ 書籤 {nodeId,offset,affinity} 站在 CP98 stable node ID 上;nodeId 失效時由
     txnMapOffset 鏈兜底。本階段只記錄不執行;cmdUndo/Redo 仍走既有快照制。
   ‧ settings.txnCore=false 可整層停用。稽核:window.__CP100_TXN_CORE__。 */
const TXN_CORE_VERSION = 'CP100a';
let TXN_SEQ = 0;
const txnLogs = new Map();            /* fileId -> {list:[], lastSelAfter} */
const TXN_LOG_CAP = 300;
function txnEnabled(){
  return settings.txnCore !== false && (typeof losslessEnabled !== 'function' || losslessEnabled());
}
function txnDeepSel(sel){ return sel ? {anchor:{...sel.anchor}, head:{...sel.head}} : null; }
function txnBookmarkFromRaw(doc, rawOffset, affinity){
  const aff = affinity === 'before' ? 'before' : 'after';
  if (!doc || !doc.nodes || !doc.nodes.length) return {nodeId:'', offset:0, affinity:aff};
  const off = llClamp(rawOffset, doc.bomLength, doc.raw.length);
  let idx = doc._nodeIndexAtRaw(off, true);
  if (idx < 0) idx = doc.nodes.length - 1;
  const node = doc.nodes[idx];
  return {nodeId:node.id, offset:llClamp(off - node.source.start, 0, node.source.end - node.source.start), affinity:aff};
}
function txnResolveBookmark(doc, bm){
  if (!doc || !bm || !bm.nodeId) return null;
  const node = doc.nodes.find(n => n.id === bm.nodeId);
  if (!node) return null;
  return llClamp(node.source.start + bm.offset, node.source.start, node.source.end);
}
function txnMapOffset(txn, rawOffset){
  /* 把「交易前」座標映射到「交易後」;步驟為原始(before)座標遞增序。
     orig 全程停留在 before 座標系比較,delta 另行累計 — 避免座標系混用。 */
  const orig = Number(rawOffset) || 0;
  let delta = 0;
  for (const s of txn.steps){
    if (orig >= s.rawEnd){ delta += s.insert.length - (s.rawEnd - s.rawStart); continue; }
    if (orig > s.rawStart) return s.rawStart + delta + Math.min(orig - s.rawStart, s.insert.length);
    break;                       /* orig 在此步之前;其後步驟只會更遠 */
  }
  return orig + delta;
}
function txnFromRawDiff(fileId, beforeRaw, afterRaw, source){
  const a = String(beforeRaw == null ? '' : beforeRaw), b = String(afterRaw == null ? '' : afterRaw);
  const hunks = llDiffHunks(a, b);
  if (!hunks.length) return null;
  const steps = hunks.map(h => ({rawStart:h.start, rawEnd:h.end, removed:a.slice(h.start, h.end), insert:h.insert}));
  return {id:'txn' + (++TXN_SEQ), time:Date.now(), fileId:String(fileId), steps,
          selBefore:null, selAfter:null, source:String(source || 'edit'), coalesceKey:''};
}
function txnApply(doc, txn){
  for (let i = txn.steps.length - 1; i >= 0; i--){
    const s = txn.steps[i];
    doc.replaceRawRange(s.rawStart, s.rawEnd, s.insert);
  }
  return doc;
}
function txnInvert(txn){
  const steps = []; let delta = 0;
  for (const s of txn.steps){
    const start = s.rawStart + delta;
    steps.push({rawStart:start, rawEnd:start + s.insert.length, removed:s.insert, insert:s.removed});
    delta += s.insert.length - (s.rawEnd - s.rawStart);
  }
  return {id:'txn' + (++TXN_SEQ), time:Date.now(), fileId:txn.fileId, steps,
          selBefore:txnDeepSel(txn.selAfter), selAfter:txnDeepSel(txn.selBefore),
          source:'invert:' + txn.source, coalesceKey:''};
}
function txnCurrentSelection(doc){
  try{
    if (settings.srcmode && typeof srcview !== 'undefined' && srcview){
      const a = doc.rawOffsetFromNormalized(srcview.selectionStart || 0);
      const h = doc.rawOffsetFromNormalized(srcview.selectionEnd || 0);
      return {anchor:txnBookmarkFromRaw(doc, a, 'after'), head:txnBookmarkFromRaw(doc, h, 'after')};
    }
    if (typeof activeIndex !== 'undefined' && activeIndex >= 0 &&
        typeof editor !== 'undefined' && editor && editor.children[activeIndex]){
      let normBase = 0;
      for (let i = 0; i < activeIndex; i++) normBase += String(blocks[i] ?? '').length + 1;
      const off = caretOffsetIn(editor.children[activeIndex]);
      const raw = doc.rawOffsetFromNormalized(normBase + off);
      const bm = txnBookmarkFromRaw(doc, raw, 'after');
      return {anchor:{...bm}, head:{...bm}};
    }
  }catch(_){ }
  return null;
}
function txnRecordFromRawChange(fileId, beforeRaw, doc, reason){
  try{
    if (!txnEnabled()) return null;
    const txn = txnFromRawDiff(fileId, beforeRaw, doc.serialize(), reason);
    if (!txn) return null;
    const key = String(fileId);
    let slot = txnLogs.get(key);
    if (!slot){ slot = {list:[], lastSelAfter:null}; txnLogs.set(key, slot); }
    txn.selBefore = txnDeepSel(slot.pendingSelBefore != null ? slot.pendingSelBefore : slot.lastSelAfter);
    slot.pendingSelBefore = null;              /* 僅單位首筆享有精確起點(CP100c) */
    txn.selAfter = txnCurrentSelection(doc);
    slot.lastSelAfter = txnDeepSel(txn.selAfter);
    txn.beforeHash = txnHashOf(beforeRaw);
    txn.afterHash = txnHashOf(doc.serialize());
    slot.list.push(txn);
    if (typeof txnTrimLog === 'function') txnTrimLog(slot, key); else if (slot.list.length > TXN_LOG_CAP) slot.list.shift();
    return txn;
  }catch(_){ return null; }
}
function txnDropFile(id){ if (id != null) txnLogs.delete(String(id)); }
function txnAudit(){
  const f = typeof activeFile === 'function' ? activeFile() : null;
  const slot = f ? txnLogs.get(String(f.id)) : null;
  const last = slot && slot.list.length ? slot.list[slot.list.length - 1] : null;
  return {version:TXN_CORE_VERSION, enabled:txnEnabled(), fileId:f ? f.id : null,
    count:slot ? slot.list.length : 0,
    last:last ? {id:last.id, time:last.time, source:last.source,
      steps:last.steps.map(s => ({rawStart:s.rawStart, rawEnd:s.rawEnd,
        removedLen:s.removed.length, insertLen:s.insert.length})),
      hasSelBefore:!!last.selBefore, hasSelAfter:!!last.selAfter} : null};
}
window.__CP100_TXN_CORE__ = Object.freeze({
  version:TXN_CORE_VERSION, enabled:txnEnabled, audit:txnAudit,
  log:id => { const key = String(id ?? (typeof activeFile === 'function' && activeFile() ? activeFile().id : ''));
              const s = txnLogs.get(key); return s ? s.list.slice() : []; },
  fromRawDiff:txnFromRawDiff, apply:txnApply, invert:txnInvert, mapOffset:txnMapOffset,
  bookmarkFromRaw:txnBookmarkFromRaw, resolveBookmark:txnResolveBookmark,
  currentSelection:() => { const d = typeof losslessActiveDoc === 'function' ? losslessActiveDoc() : null;
                           return d ? txnCurrentSelection(d) : null; },
  drop:txnDropFile
});
/* CP100_TXN_CORE_END */
/* CP100B_UNDO_TXN_BEGIN */
/* ---- CP100b(0.9.88):Undo/Redo 交易反轉路徑 ----
   快照堆疊(undoStack/redoStack)照舊同步進出,永遠可 fallback;
   交易路徑只改「還原手段」:在 exact raw 副本上反轉(零污染),hash 雙向對齊,
   成功才提交(取代 active doc + file.content + 截斷/回填 txn log),
   UI 更新與游標恢復複用既有 applySnapshot 快路徑。 */
const txnMarks = [];               /* 與 undoStack 平行:{fileId, len} */
const txnRedo  = [];               /* 與 redoStack 平行:{fileId, chain} */
function txnHashOf(text){ return llHash(String(text == null ? '' : text)); }
function txnTrimLog(slot, fileId){
  while (slot.list.length > TXN_LOG_CAP){
    slot.list.shift();
    for (const m of txnMarks) if (m.fileId === fileId && m.len > 0) m.len--;
  }
}
function txnMark(){
  if (!txnEnabled()) return;
  const f = typeof activeFile === 'function' ? activeFile() : null;
  if (!f) return;
  const slot = txnLogs.get(String(f.id));
  const d = typeof losslessActiveDoc === 'function' ? losslessActiveDoc() : null;
  txnMarks.push({fileId:String(f.id), len:slot ? slot.list.length : 0,
                 hash:txnHashOf(d ? d.serialize() : String(f.content == null ? '' : f.content))});
  /* CP100c:單位起點選取 — pushUndo 時點已由 beforeinput／各命令前置保證在變更前,
     此刻的 selection 即「本單位真正起點」;record 首筆採用,取代 lastSelAfter 近似。 */
  if (d){
    let s0 = txnLogs.get(String(f.id));
    if (!s0){ s0 = {list:[], lastSelAfter:null}; txnLogs.set(String(f.id), s0); }
    s0.pendingSelBefore = txnCurrentSelection(d);
  }
  if (txnMarks.length > 120) txnMarks.shift();
  txnRedo.length = 0;              /* 對齊 pushUndo 清 redoStack */
}
function txnClearStacks(){ txnMarks.length = 0; txnRedo.length = 0; }
function txnPosFromNormalized(md, norm){
  /* normalized 位移 → (splitToBlocks 區塊索引, 塊內位移);切法沿用既有權威 splitToBlocks */
  const arr = splitToBlocks(String(md == null ? '' : md));
  const n = Math.max(0, Number(norm) || 0);
  let acc = 0;
  for (let i = 0; i < arr.length; i++){
    const len = String(arr[i] ?? '').length;
    if (n <= acc + len) return {i, off:Math.max(0, n - acc)};
    acc += len + 1;
  }
  return arr.length ? {i:arr.length - 1, off:String(arr[arr.length - 1] ?? '').length} : {i:-1, off:0};
}
function txnSelPos(doc, sel){
  if (!sel) return null;
  const raw = txnResolveBookmark(doc, sel.head) ?? txnResolveBookmark(doc, sel.anchor);
  if (raw == null) return null;
  return txnPosFromNormalized(doc.getNormalizedText(), doc.normalizedOffsetFromRaw(raw));
}
function txnUndoPlan(){
  const f = typeof activeFile === 'function' ? activeFile() : null;
  if (!f || !txnEnabled() || !txnMarks.length) return null;
  const mark = txnMarks[txnMarks.length - 1];
  if (mark.fileId !== String(f.id)) return null;
  const slot = txnLogs.get(mark.fileId);
  const list = slot ? slot.list : [];
  if (mark.len > list.length) return null;
  const chain = list.slice(mark.len);
  if (!chain.length) return null;                 /* 純游標型 pushUndo → fallback */
  if (!chain[chain.length - 1].afterHash) return null;
  const doc = typeof losslessActiveDoc === 'function' ? losslessActiveDoc() : null;
  if (!doc) return null;
  if (txnHashOf(doc.serialize()) !== chain[chain.length - 1].afterHash) return null;
  return {mark, chain, doc, file:f, slot};
}
function txnAlignFlush(reason){
  try{ if (typeof losslessContentForActive === 'function') losslessContentForActive(reason); }catch(_){ }
}
function txnOnSnapshotFallback(){
  /* 快照 fallback 已改變畫面/模型而交易堆疊不再對位 → 本檔交易狀態歸零自癒;
     其後 90ms flush 會把 fallback 差異記為無 mark 的孤兒交易,對 plan 無影響。 */
  try{
    txnClearStacks();
    const f = typeof activeFile === 'function' ? activeFile() : null;
    if (f){ const s = txnLogs.get(String(f.id)); if (s){ s.list.length = 0; s.lastSelAfter = null; s.pendingSelBefore = null; } }
  }catch(_){ }
}
function txnPerformUndo(snap){
  txnAlignFlush('undo-align');       /* 90ms 窗內未同步的輸入先入帳,單位與畫面一致 */
  /* 空單位(pushUndo 後內容未變):以 mark.hash 驗證後 no-op 成功,不觸發 fallback 自癒 */
  {
    const f = typeof activeFile === 'function' ? activeFile() : null;
    if (f && txnEnabled() && txnMarks.length){
      const mark = txnMarks[txnMarks.length - 1];
      if (mark.fileId === String(f.id)){
        const slot = txnLogs.get(mark.fileId);
        const list = slot ? slot.list : [];
        if (mark.len === list.length){
          const doc = typeof losslessActiveDoc === 'function' ? losslessActiveDoc() : null;
          if (doc && mark.hash && txnHashOf(doc.serialize()) === mark.hash){
            txnMarks.pop();
            txnRedo.push({fileId:mark.fileId, chain:[], hash:mark.hash});
            if (txnRedo.length > 120) txnRedo.shift();
            applySnapshot({md:doc.getNormalizedText(), i:snap ? snap.i : -1, off:snap ? snap.off : 0});
            return true;
          }
          return false;
        }
      }
    }
  }
  const plan = txnUndoPlan();
  if (!plan) return false;
  try{
    const {mark, chain, file, slot} = plan;
    const d2 = new LosslessMarkdownDocument(plan.doc.serialize());
    for (let i = chain.length - 1; i >= 0; i--) txnApply(d2, txnInvert(chain[i]));
    if (chain[0].beforeHash && txnHashOf(d2.serialize()) !== chain[0].beforeHash) return false;
    losslessDocs.set(String(file.id), d2);
    file.content = d2.serialize();
    slot.list.length = mark.len;
    slot.lastSelAfter = txnDeepSel(chain[0].selBefore);
    txnRedo.push({fileId:mark.fileId, chain});
    if (txnRedo.length > 120) txnRedo.shift();
    txnMarks.pop();
    /* undo 後文件=單位起點狀態;pushUndo 當下快照座標(snap)在此狀態下零映射即有效,
       為最精確游標來源;書籤(selBefore)作後備 — 供 CP100c 無快照交易使用。 */
    const pos = snap ? {i:snap.i, off:snap.off} : txnSelPos(d2, chain[0].selBefore);
    applySnapshot({md:d2.getNormalizedText(), i:pos ? pos.i : -1, off:pos ? pos.off : 0});
    return true;
  }catch(_){ return false; }
}
function txnPerformRedo(snap){
  txnAlignFlush('redo-align');
  const f = typeof activeFile === 'function' ? activeFile() : null;
  if (!f || !txnEnabled() || !txnRedo.length) return false;
  const top = txnRedo[txnRedo.length - 1];
  if (top.fileId !== String(f.id)) return false;
  const doc = typeof losslessActiveDoc === 'function' ? losslessActiveDoc() : null;
  if (!doc) return false;
  if (!top.chain.length){                       /* 空單位 redo:hash 驗證後 no-op 成功 */
    if (!(top.hash && txnHashOf(doc.serialize()) === top.hash)) return false;
    const slot0 = txnLogs.get(top.fileId);
    txnMarks.push({fileId:top.fileId, len:slot0 ? slot0.list.length : 0, hash:top.hash});
    if (txnMarks.length > 120) txnMarks.shift();
    txnRedo.pop();
    applySnapshot({md:doc.getNormalizedText(), i:snap ? snap.i : -1, off:snap ? snap.off : 0});
    return true;
  }
  if (top.chain[0].beforeHash && txnHashOf(doc.serialize()) !== top.chain[0].beforeHash) return false;
  try{
    const d2 = new LosslessMarkdownDocument(doc.serialize());
    for (const t of top.chain) txnApply(d2, t);
    const lastHash = top.chain[top.chain.length - 1].afterHash;
    if (lastHash && txnHashOf(d2.serialize()) !== lastHash) return false;
    losslessDocs.set(String(f.id), d2);
    f.content = d2.serialize();
    let slot = txnLogs.get(top.fileId);
    if (!slot){ slot = {list:[], lastSelAfter:null}; txnLogs.set(top.fileId, slot); }
    txnMarks.push({fileId:top.fileId, len:slot.list.length,
                   hash:top.chain[0].beforeHash || txnHashOf(doc.serialize())});
    if (txnMarks.length > 120) txnMarks.shift();
    slot.list.push(...top.chain);
    txnTrimLog(slot, top.fileId);
    slot.lastSelAfter = txnDeepSel(top.chain[top.chain.length - 1].selAfter);
    txnRedo.pop();
    const pos = snap ? {i:snap.i, off:snap.off} : txnSelPos(d2, top.chain[top.chain.length - 1].selAfter);
    applySnapshot({md:d2.getNormalizedText(), i:pos ? pos.i : -1, off:pos ? pos.off : 0});
    return true;
  }catch(_){ return false; }
}
/* CP100B_UNDO_TXN_END */


/* ---------- §2 Markdown 解析器(行內) ---------- */
/* 解析順序(Checkpoint 4 重寫):
   1) 明確跳脫的 \` 與 \$(避免被當成程式碼/公式定界)
   2) 行內程式碼(內容 verbatim,不再解析)
   3) 行內公式 $…$ 與 \(…\)(交給迷你 LaTeX 引擎)
   4) 其餘反斜線跳脫字元
   5) HTML 註解(隱藏)、白名單標籤(消毒)、字元實體
   6) escape 其餘文字 → 一般 Markdown 置換
   受保護片段以私用區字元 \uE000 idx \uE001 佔位,結尾一次還原。 */
/* CP17:單一引用編號 → 指向參考文獻的錨連結(TW_THESIS 綠色引用樣式) */
function citeLink(n){
  return '<a class="twthesis-citelink" data-ref="' + n + '" href="#twthesis-ref-' + n + '">' + n + '</a>';
}
/* CP114(0.9.103.1 整合,取 GPT5.6 線):T8 v2 的有效主題閘門。一般 Markdown 主題可顯形;Paper、TW_THESIS、TW_THESIS2
   三種分頁主題一律停用,避免定界符顯形改變行高/頁高並與浮動編輯框競態;同步修正舊版只排除 paper、
   卻讓 twthesis/twthesis2 產生休眠 md-il 的不一致。全部 gate 收斂至此二函式。 */
function mdMetaThemeEligible(theme){
  return theme !== 'paper' && theme !== 'twthesis' && theme !== 'twthesis-en' && theme !== 'twthesis2' && theme !== 'revtex';
}
function mdMetaEnabledHere(){
  return settings.mdMetaPilot === true && mdMetaThemeEligible(settings.theme);
}
/* 1.2.6：強調規則（左邊畫面、樣式定位、格式工具列共用）。* 依舊；_ 加上
   「開頭前、結尾後不能是字母數字」的條件，所以 snake_case 不會變斜體。 */
const EMPH_RE_TRIPLE = /\*\*\*(?=\S)([\s\S]*?\S)\*\*\*|(?<![\p{L}\p{N}])___(?=\S)([\s\S]*?\S)___(?![\p{L}\p{N}])/gu;
const EMPH_RE_DOUBLE = /\*\*(?=\S)([\s\S]*?\S)\*\*|(?<![\p{L}\p{N}])__(?=\S)([\s\S]*?\S)__(?![\p{L}\p{N}])/gu;
const EMPH_RE_SINGLE = /\*(?=\S)([^*_\n]*?\S)\*|(?<![\p{L}\p{N}])_(?=\S)([^*_\n]*?\S)_(?![\p{L}\p{N}])/gu;
function inlineMD(src){
  /* T8(CP101/102/114):flag on 且位於一般 Markdown 主題時,粗/斜/行內碼/刪除線/連結的語法字
     以 .md-meta 常駐 DOM、CSS 隱藏;md-il 容器 textContent === 該 token 原始碼全文。
     flag off 與論文類主題(Paper/TW_THESIS/TW_THESIS2)走原輸出。 */
  /* meta 與容器標籤必須以 keep() 佔位藏出掃描串,否則明文 **／* 會被後續
     斜體等規則二次匹配打穿結構(t62 抓到);inner 留在串中供巢狀規則續掃。 */
  const ilWrap = (meta, inner) =>
    mdMetaEnabledHere()
      ? keep(`<span class="md-il" data-il><span class="md-meta">${escapeHtml(meta)}</span>`)
        + inner
        + keep(`<span class="md-meta">${escapeHtml(meta)}</span></span>`)
      : inner;
  const stash = [];
  const keep = html => '\uE000' + (stash.push(html) - 1) + '\uE001';
  let s = String(src).replace(/[\uE000\uE001]/g, '');

  s = s.replace(/\\`/g, () => keep('`'));
  s = s.replace(/\\\$/g, () => keep('$'));

  /* 1.2.6：行內程式碼用 CommonMark 的反引號串規則（``a ` b`` 也是一段程式碼，B-40），
     與國際論文解析器（17.js）同一條規則。單反引號的結果與舊版完全相同。 */
  s = s.replace(/(?<!`)(`+)([^\n]+?)(?<!`)\1(?!`)/g, (_, run, c) => ilWrap(run, keep(`<code class="md-code" data-si="${styleSeq++}">` + escapeHtml(c) + '</code>')));

  /* CP20:行內若出現 $$…$$(使用者把區塊公式寫在句中)→ 視為「獨立一行的置中公式」
     (display,不再殘留多餘錢字號、也不再把前導文字兩端對齊拉開)。必須排在單一 $…$
     之前掃描,且與 mathRangesOf 同序。 */
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, token => {
    const math = mathSourceParts(token, 'auto');
    return keep(mathHTML(math.tex, math.display, mathSeq++, true));
  });
  /* 1.2.6：收尾的 $ 後面緊接數字就不是數學（Pandoc 規則：「$5,$10」是兩個價錢，B-31）。
     國際論文解析器（17.js）用同一條規則；mathRangesOf、styleRangesOf 也同步。 */
  s = s.replace(/\$(?=\S)([^$\n]+?)(?<=\S)\$(?!\d)/g, token => {
    const math = mathSourceParts(token, 'auto');
    return keep(mathHTML(math.tex, math.display, mathSeq++));
  });
  s = s.replace(/\\\((.+?)\\\)/g, token => {
    const math = mathSourceParts(token, 'auto');
    return keep(mathHTML(math.tex, math.display, mathSeq++));
  });

  /* 1.2.6：反斜線後接任何 ASCII 標點都是跳脫（CommonMark；50\% 顯示成 50%，B-32）。 */
  s = s.replace(/\\([!"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~])/g, (_, ch) => keep(escapeHtml(ch)));

  s = s.replace(/<!--[\s\S]*?-->/g, () => keep(''));   // 註解:預覽中隱藏(原始碼保留)
  s = s.replace(/<\/?[a-zA-Z][^<>]*>/g, tag => {
    const safe = sanitizeTag(tag);
    if (safe === null) return tag;                     // 不在白名單 → 保留原文,稍後跳脫成字面顯示
    if (/^<img\b/i.test(safe))                         // HTML 圖片也納入逐一編輯/縮放(CP8)
      return keep(safe.replace(/^<img\b/i, `<img data-si="${styleSeq++}"`));
    /* CP173/1.1.9.1:色彩 span 是可定位的行內 token。若不掛 data-si，
       點擊其中文字時 styleRangesOf 無法建立 raw↔DOM 邊界，startPlainEdit
       會把半截 <span> 標籤混入可見文字。 */
    if (/^<span\b/i.test(safe) && /\bstyle\s*=\s*["'][^"']*\bcolor\s*:/i.test(safe))
      return keep(safe.replace(/^<span\b/i, `<span data-si="${styleSeq++}"`));
    return keep(safe);
  });
  s = s.replace(/&(#\d{1,7}|#x[\da-fA-F]{1,6}|[a-zA-Z][\da-zA-Z]{1,31});/g, m => keep(m));

  s = escapeHtml(s);
  /* CP48(T11):行內註腳 [^id] → 上標可點連結(跳至定義);與 TW_THESIS [[N]] 樣式不相干。 */
  s = s.replace(/\[\^([A-Za-z0-9_.\-\u4e00-\u9fff]+)\]/g, (_, id) =>
    `<sup class="fn-ref" id="fn-ref-${id}"><a class="fn-a" href="#fn-def-${id}">[${id}]</a></sup>`);
  /* CP17/18:明確引用記號 [[N]] / [[N, M]] / [[N–M]] → 綠色可點超連結,連到 #twthesis-ref-N。
     只認「純數字/逗號/破折號/空白」內容,故一般 [文字] 與單層 [N] 皆不受影響
     (參考文獻清單的 [N] 標籤也不會被誤轉)。範圍 a–b 連結兩端點。
     僅 TW_THESIS 模式生效;其餘主題 [[1]] 保持字面,不洩漏論文引用樣式。 */
  if (isTwThesisTheme())
    s = s.replace(/\[\[\s*([0-9][0-9\s,，、．.·–—-]*?)\s*\]\]/g, (whole, inner) => {
      const parts = inner.split(/\s*[,，、]\s*/).filter(Boolean);
      const body = parts.map(tok => {
        const rng = tok.match(/^\s*(\d+)\s*[–—-]\s*(\d+)\s*$/);
        if (rng) return citeLink(rng[1]) + '–' + citeLink(rng[2]);
        const n = tok.trim();
        return /^\d+$/.test(n) ? citeLink(n) : escapeHtml(tok);
      }).join(', ');
      return keep('<span class="twthesis-cite">[' + body + ']</span>');
    });
  /* 圖片 ![alt](路徑 "title"):路徑可含空白(本機檔名常見);此時引號已被跳脫為 &quot; */
  s = s.replace(/!\[([^\]]*)\]\(([^)]+?)(?:\s+&quot;(.*?)&quot;)?\)/g,
    (_, alt, url, ti) => keep(`<img class="md-img" data-si="${styleSeq++}" draggable="false" src="${sanitizeURL(normalizeImgPath(url), true)}" alt="${alt}"${ti !== undefined ? ` title="${ti}"` : ''}>`));
  /* T8 v2(CP114,0.9.103.1 整合):flag on 時連結改五段結構 meta「[」+<a>文字</a>+meta「](」+.md-content 網址原文+meta「)」
     — il.textContent 恆等於 [文字](網址…) 原始碼全文。.md-content 整段 keep() 藏出掃描串(網址中的 * 與 _
     不得被後續斜體規則打穿)且建構為單一文字節點(游標扣除與 startIlEdit 不變量守衛依賴);錨文字 t 留在
     串中供巢狀規則續掃(與 flag off 同)。anchor 保持 md-il 直接 data-si 子節點,startIlEdit 可用
     styleRangesOf 同序索引定位整個 token(GPT5.6 線同一不變量)。中段以 m.slice 逐字重建 — 標題前可為
     多個空白,捕獲群組重組會失真。flag off 分支輸出與 0.9.102 逐位元組一致(t67 證明)。 */
  s = s.replace(/\[([^\]]+)\]\(([^)]+?)(?:\s+&quot;(.*?)&quot;)?\)/g,
    (m, t, url, ti) => {
      const a = `<a class="md-a" data-si="${styleSeq++}" href="${sanitizeURL(url.trim(), false)}"${ti !== undefined ? ` title="${ti}"` : ''}>`;
      if (!mdMetaEnabledHere())
        return keep(a) + t + keep('</a>');
      const mid = m.slice(1 + t.length + 2, -1);
      return keep(`<span class="md-il" data-il><span class="md-meta">[</span>` + a) + t
           + keep(`</a><span class="md-meta">](</span><span class="md-content">` + mid + `</span><span class="md-meta">)</span></span>`);
    });
  /* 1.2.6：單字中間的底線不是強調（snake_case、file_name、x_1；CommonMark，B-13）。
     底線版本要求開頭前、結尾後不是字母數字；星號版本不變。三條規則與 styleRangesOf、
     03.js inlineFormatRanges 同一組（EMPH_RE_*），國際論文解析器（17.js）也是同一規則。 */
  s = s.replace(EMPH_RE_TRIPLE, (m, c1, c2) => ilWrap(m.slice(0, 3), `<strong data-si="${styleSeq++}"><em>${c1 !== undefined ? c1 : c2}</em></strong>`));
  s = s.replace(EMPH_RE_DOUBLE, (m, c1, c2) => ilWrap(m.slice(0, 2), `<strong data-si="${styleSeq++}">${c1 !== undefined ? c1 : c2}</strong>`));
  s = s.replace(EMPH_RE_SINGLE, (m, c1, c2) => ilWrap(m.slice(0, 1), `<em data-si="${styleSeq++}">${c1 !== undefined ? c1 : c2}</em>`));
  s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, (_, c) => ilWrap('~~', `<del data-si="${styleSeq++}">${c}</del>`));   /* T8 v2(CP114):刪除線納入 md-il,與粗/斜/碼同構 */
  s = s.replace(/==(?=\S)([\s\S]*?\S)==/g, (_, c) => `<mark class="md-mark" data-si="${styleSeq++}">${c}</mark>`);

  /* 迴圈還原:stash 值本身可能內含更早期的佔位符(如行內碼裡的 \`),
     單趟 replace 不會重掃替換文字,故重複至完全展開(上限防護) */
  let out = s, guard = 0;
  while (/\uE000\d+\uE001/.test(out) && guard++ < 8)
    out = out.replace(/\uE000(\d+)\uE001/g, (_, i) => stash[+i] ?? '');
  return out;
}

/* PDF 疊繪用:元素(y,h)與第 n 頁(頁高 H)的交集裁切。
   回傳 { sy:來源起點(顯示px), dy:頁內落點, dh:高度 } 或 null(無交集)。 */
function pageSlice(y, h, n, H){
  const top = y - n * H;
  const bot = top + h;
  if (bot <= 0 || top >= H) return null;
  const sy = Math.max(0, -top);
  const dy = Math.max(0, top);
  const dh = Math.min(h - sy, H - dy);
  return dh > 0.5 ? { sy, dy, dh } : null;
}

/* 圖片縮放寫回:對「單一圖片 token 的原始碼片段」更新 zoom 百分比。
   HTML <img>:upsert style 的 zoom 屬性(100% 時移除);
   Markdown ![alt](src "title"):轉為帶 zoom 的 HTML 寫法(與 Markdown 相同),100% 維持原樣。 */
function upsertImgZoom(seg, pct){
  seg = String(seg);
  if (/^\s*</.test(seg)){
    if (pct === 100){
      let t = seg.replace(/\s*\bstyle\s*=\s*"([^"]*)"/i, (m, v) => {
        const nv = v.replace(/zoom\s*:\s*[^;"]+;?\s*/ig, '').trim().replace(/;\s*$/, '');
        return nv ? ` style="${nv}"` : '';
      });
      return t;
    }
    if (/zoom\s*:/i.test(seg))
      return seg.replace(/zoom\s*:\s*[^;"]+/i, 'zoom:' + pct + '%');
    if (/\bstyle\s*=\s*"/i.test(seg))
      return seg.replace(/(\bstyle\s*=\s*")/i, `$1zoom:${pct}%; `);
    return seg.replace(/^<img\b/i, `<img style="zoom:${pct}%;"`);
  }
  const m = seg.match(/^!\[([^\]]*)\]\(([^)]+?)(?:\s+"(.*?)")?\)$/);
  if (!m || pct === 100) return seg;
  const alt = m[1].replace(/"/g, '&quot;');
  const ti = m[3];
  return `<img src="${m[2].trim()}" alt="${alt}"` +
         (ti !== undefined ? ` title="${ti.replace(/"/g, '&quot;')}"` : '') +
         ` style="zoom:${pct}%;" />`;
}
/* CP45(T13):圖片語法切換 ![alt](src "title") ⇄ <img src alt title>(沿用一般編輯器操作
   右鍵 switch-img-syntax)。規則:HTML→MD 僅在無縮放(或 zoom:100)時允許 —
   Markdown 語法載不動 zoom,強轉會靜默遺失,寧可回 {err} 請使用者先還原 100%。
   回傳 { seg } 或 { err };無法辨識回 { err }。 */
function toggleImgSyntax(seg){
  seg = String(seg).trim();
  if (/^</.test(seg)){                                       // HTML → MD
    const zm = seg.match(/zoom\s*:\s*(\d+)/i);
    if (zm && +zm[1] !== 100) return { err: 'zoom' };
    const at = n => { const m = seg.match(new RegExp('\\b' + n + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i'));
                      return m ? (m[2] !== undefined ? m[2] : m[3]) : undefined; };
    const src = at('src');
    if (!/^<img\b/i.test(seg) || !src) return { err: 'parse' };
    const unq = v => String(v).replace(/&quot;/g, '"');
    const alt = unq(at('alt') ?? '');
    const ti  = at('title');
    return { seg: '![' + alt.replace(/\]/g, '\\]') + '](' + src.trim() +
                  (ti !== undefined ? ' "' + unq(ti) + '"' : '') + ')' };
  }
  const m = seg.match(/^!\[([^\]]*)\]\(([^)]+?)(?:\s+"(.*?)")?\)$/);   // MD → HTML
  if (!m) return { err: 'parse' };
  const q = v => String(v).replace(/"/g, '&quot;');
  return { seg: `<img src="${m[2].trim()}" alt="${q(m[1])}"` +
                (m[3] !== undefined ? ` title="${q(m[3])}"` : '') + ' />' };
}

/* ---------- §2a HTML 白名單消毒(規格 §6.7 / §24.3) ---------- */
const HTML_TAGS = {
  u:[], ins:[], kbd:[], mark:[], sub:[], sup:[], b:[], i:[], em:[], strong:[],
  del:[], s:[], small:[], big:[], br:[], wbr:[], span:[], center:[],
  font:['color','face','size'], abbr:['title'], code:[], samp:[], var:[],
  ruby:[], rt:[], rp:[], a:['href','title','target'],
  img:['src','alt','title','width','height'],
  details:['open'], summary:[],
  video:['src','controls','width','height','loop','muted','poster'],
  audio:['src','controls','loop'],
};
const HTML_GLOBAL_ATTRS = ['style','class','id','align','dir','lang','title'];

/* 本機圖片路徑正規化:Windows 磁碟路徑轉 file:///;其餘(含 /Users/… 的
   POSIX 絕對路徑與相對路徑)原樣保留 — file:// 開啟本檔時瀏覽器可直接載入,
   相對路徑另有「連結資料夾」解析備援(見 §6 圖片解析)。 */
function normalizeImgPath(u){
  let s = String(u).trim();
  if (/^&lt;.*&gt;$/.test(s)) s = s.slice(4, -4).trim();   // <路徑> 包裹寫法
  if (/^[A-Za-z]:[\\/]/.test(s)) return 'file:///' + s.replace(/\\/g, '/');
  return s;
}
function sanitizeURL(u, allowLocalImage){
  const m = String(u).trim().match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (!m) return u;                                        // 相對路徑或 #錨點
  const p = m[1].toLowerCase();
  if (p === 'http' || p === 'https' || p === 'mailto') return u;
  if (allowLocalImage && p === 'data' && /^data:image\//i.test(u)) return u;
  if (allowLocalImage && (p === 'file' || p === 'blob')) return u;   // 本機/物件圖片
  return '#';                                              // javascript: 等危險協議
}
function sanitizeStyle(v){
  if (/expression|javascript:|@import|behaviou?r\s*:/i.test(v)) return null;
  if (/url\s*\(/i.test(v) && !/url\s*\(\s*['"]?(https:|data:image\/)/i.test(v)) return null;
  return v;
}
/* 傳入單一 <tag …> 字串;白名單內回傳消毒後標籤,否則回傳 null(顯示字面) */
function sanitizeTag(tag){
  const m = tag.match(/^<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>$/);
  if (!m) return null;
  const name = m[2].toLowerCase();
  if (!(name in HTML_TAGS)) return null;
  if (m[1]) return '</' + name + '>';
  let out = '<' + name;
  const allowed = HTML_TAGS[name];
  const attrRe = /([a-zA-Z-]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|[^\s"'>]+))?/g;
  let a;
  while ((a = attrRe.exec(m[3]))){
    const an = a[1].toLowerCase();
    if (an.startsWith('on')) continue;                     // 事件屬性一律剔除
    if (!allowed.includes(an) && !HTML_GLOBAL_ATTRS.includes(an)) continue;
    let av;
    if (a[3] !== undefined) av = a[3];
    else if (a[4] !== undefined) av = a[4];
    else if (a[2] !== undefined) av = a[2];
    if (av === undefined){ out += ' ' + an; continue; }    // 布林屬性
    if (an === 'style'){ const sv = sanitizeStyle(av); if (sv === null) continue; av = sv; }
    if (an === 'href') av = sanitizeURL(av, false);
    if (an === 'src')  av = sanitizeURL(name === 'img' ? normalizeImgPath(av) : av, name === 'img');
    if (an === 'target' && av !== '_blank') continue;
    out += ' ' + an + '="' + escapeHtml(av) + '"';
  }
  if ((name === 'video' || name === 'audio') && !/ controls\b/.test(out)) out += ' controls';
  return out + '>';
}

/* §2b Math rendering: the embedded KaTeX engine is the sole renderer. */
/* 對外包裝:成功回 .mjx span;失敗回 .math-error(顯示原始碼與訊息) */
const CP176_MATH_CACHE = new Map();
const CP176_MATH_CACHE_LIMIT = 512;
let mathSeq = 0;   // 區塊內行內公式序號(renderBlockHTML 開頭重設,與 data-mi 對應)
let styleSeq = 0;  // 區塊內「行內樣式」序號(粗體/斜體/刪除/行內碼/連結/圖片,與 data-si 對應)
/* CP20:改用內嵌 KaTeX 渲染(取代自製 texToHTML);保留 .mjx/data-mi 外框供逐一編輯。
   throwOnError:false → 語法錯誤由 KaTeX 以紅字就地標示,不整段失敗。 */
function mathHTML(tex, display, seq, blockInline){
  const tag = seq === undefined ? '' : ` data-mi="${seq}" contenteditable="false"`;
  const cls = 'mjx' + (display ? ' mjx-d' : '') + (blockInline ? ' mjx-bd' : '');
  try {
    const cacheKey = (display ? 'D|' : 'I|') + String(tex);
    let inner = CP176_MATH_CACHE.get(cacheKey);
    if (inner === undefined) {
      inner = katex.renderToString(String(tex), {
      displayMode: !!display, throwOnError: false, strict: false, output: 'html'
      });
      if (CP176_MATH_CACHE.size >= CP176_MATH_CACHE_LIMIT) CP176_MATH_CACHE.delete(CP176_MATH_CACHE.keys().next().value);
      CP176_MATH_CACHE.set(cacheKey, inner);
    }
    return `<span class="${cls}"${tag}>${inner}</span>`;
  } catch (err){
    const raw = (display || blockInline) ? '$$' + tex + '$$' : '$' + tex + '$';
    return `<span class="math-error"${tag} title="LaTeX 錯誤:${escapeHtml((err && err.message) || '')}">${escapeHtml(raw)}</span>`;
  }
}
/* 1.1.7.9 / CP171:公式 delimiter→payload 的單一事實來源。
   既有 mathRangesOf／inline regex／blockType 只負責辨識 token 或 block 邊界；
   一旦辨識為公式，inline/block renderer 與所有浮動預覽都只能取得這個
   結構化結果，不得再自行 trim／strip／rewrap。CP5 的第二套 parser 到此退場。 */
/* 公式區塊的結尾：一行以 $$ 結束，後面可以接一個 {…} 屬性（{#eq:名稱} 或 {-}）。 */
function isMathClose(line){ return /\$\$\s*(?:\{[^{}\n]*\}\s*)?$/.test(String(line)); }
function mathSourceParts(source, context){
  const raw = String(source == null ? '' : source);
  const text = raw.trim();
  const block = context === 'block';
  const forcedDisplay = block || context === 'display';
  const pairs = block
    ? [['$$', '$$', true], ['\\[', '\\]', true]]
    : [['$$', '$$', true], ['\\[', '\\]', true], ['\\(', '\\)', false], ['$', '$', false]];
  let open = '', close = '', display = forcedDisplay;
  for (const p of pairs){
    if (text.startsWith(p[0])){ open = p[0]; close = p[1]; display = p[2]; break; }
  }
  let tex = text, closed = false;
  let attr = '';
  if (open){
    tex = text.slice(open.length);
    /* 1.2.6：$$ … $$ {#eq:名稱}／{-}：屬性只給國際論文編號用，畫面上不排進公式。 */
    if (open === '$$'){ const m = tex.match(/\$\$\s*(\{[^{}\n]*\})\s*$/); if (m){ attr = m[1]; tex = tex.slice(0, m.index + 2); } }
    if (tex.endsWith(close)){ tex = tex.slice(0, -close.length); closed = true; }
  }
  return { raw, tex:tex.trim(), display:!!display, open, close, delimited:!!open, closed, attr };
}
/* 找出原始字串中「行內公式」的位置區間;順序與渲染 data-mi 完全一致:
   先等長遮罩跳脫符(\$ \`)與行內碼(保住索引),再依管線相同的兩趟正則掃描。 */
function mathRangesOf(raw){
  const MASK = '\u0001';
  let m = String(raw).replace(/\\[`$]/g, MASK + MASK);
  m = m.replace(/(?<!`)(`+)([^\n]+?)(?<!`)\1(?!`)/g, s => MASK.repeat(s.length));
  const out = [];
  const scan = re => {
    m = m.replace(re, (s, _tex, idx) => {
      out.push({ start: idx, end: idx + s.length });
      return MASK.repeat(s.length);
    });
  };
  scan(/\$\$([\s\S]+?)\$\$/g);          // CP20:與 inlineMD 同序(行內 $$…$$ 先掃)
  scan(/\$(?=\S)([^$\n]+?)(?<=\S)\$(?!\d)/g);
  scan(/\\\((.+?)\\\)/g);
  return out;
}
/* 找出原始字串中「行內樣式」的位置區間;順序與渲染 data-si 完全一致:
   依 inlineMD 管線同序 — 跳脫遮罩 → 行內碼(記錄,整段遮罩)→ 數學(只遮罩)
   → HTML 註解/標籤/實體(遮罩)→ 圖片(記錄,整段遮罩)→ 連結(記錄,只遮結構)
   → 強調系列(記錄,只遮定界符 → 內文可續掃,巢狀順序與管線相同)。
   回傳 {start, end, open}(open = 開頭定界符長度,供游標對映)。 */
function styleRangesOf(raw){
  const M = '\u0001';
  let m = String(raw).replace(/[\uE000\uE001]/g, '');
  const out = [];
  const maskAll = re => { m = m.replace(re, s => M.repeat(s.length)); };
  maskAll(/\\[!"#$%&'*+,\-./:;<=>?@\[\\\]^_`{|}~]/g);           // 跳脫字元（\( \) 留給下面的數學）
  m = m.replace(/(?<!`)(`+)([^\n]+?)(?<!`)\1(?!`)/g, (s, run, _c, idx) => {   // 行內碼
    out.push({ start: idx, end: idx + s.length, open: run.length });
    return M.repeat(s.length);
  });
  maskAll(/\$(?=\S)([^$\n]+?)(?<=\S)\$(?!\d)/g);                // 行內數學(另有 data-mi 系統)
  maskAll(/\\\((.+?)\\\)/g);
  maskAll(/<!--[\s\S]*?-->/g);
  /* CP173/1.1.9.1: scan all inline HTML in source order. data-si is assigned
     by inlineMD during the same pass; recording image/color ranges together
     prevents image tokens from shifting color span indices. */
  {
    const stacks = [], tagRe = /<\/?([A-Za-z][A-Za-z0-9]*)(?:(?:"[^"]*"|'[^']*'|[^"'<>])*)>/g;
    m = m.replace(tagRe, (tag, name, idx) => {
      const nm = String(name).toLowerCase(), a = idx, b = a + tag.length;
      if (nm === 'img' && typeof sanitizeTag === 'function' && sanitizeTag(tag) !== null){
        out.push({ start:a, end:b, open:0 });
      } else if (nm === 'span') {
        if (/^<\//.test(tag)) {
          /* Non-color spans use null sentinels, so nested presentation spans
             cannot accidentally close their color parent. */
          const op = stacks.pop();
          if (op) op.end = b;
        } else if (!/\/\s*>$/.test(tag)) {
          const isColor = /\bstyle\s*=\s*["'][^"']*\bcolor\s*:/i.test(tag);
          if (isColor){
            const entry = { start:a, end:b, open:tag.length, html:true, color:true };
            out.push(entry); stacks.push(entry);
          } else stacks.push(null);
        }
      }
      return M.repeat(tag.length);
    });
  }
  maskAll(/&(#\d{1,7}|#x[\da-fA-F]{1,6}|[a-zA-Z][\da-zA-Z]{1,31});/g);
  m = m.replace(/!\[([^\]]*)\]\(([^)]+?)(?:\s+"(.*?)")?\)/g, (s, a, u, t, idx) => {   // 圖片
    out.push({ start: idx, end: idx + s.length, open: 2 });
    return M.repeat(s.length);
  });
  {                                                             // 連結:只遮 [ 與 ](…)
    const cs = m.split('');
    const re = /\[([^\]]+)\]\(([^)]+?)(?:\s+"(.*?)")?\)/g;
    let x;
    while ((x = re.exec(m))){
      out.push({ start: x.index, end: x.index + x[0].length, open: 1 });
      cs[x.index] = M;
      for (let k = x.index + 1 + x[1].length; k < x.index + x[0].length; k++) cs[k] = M;
    }
    m = cs.join('');
  }
  const emph = [
    [new RegExp(EMPH_RE_TRIPLE.source, 'gu'), () => 3],
    [new RegExp(EMPH_RE_DOUBLE.source, 'gu'), () => 2],
    [new RegExp(EMPH_RE_SINGLE.source, 'gu'), () => 1],
    [/~~(?=\S)([\s\S]*?\S)~~/g,              () => 2],
    [/==(?=\S)([\s\S]*?\S)==/g,              () => 2],
  ];
  for (const [re, dlen] of emph){
    const cs = m.split('');
    let x;
    while ((x = re.exec(m))){
      const L = dlen(x);
      out.push({ start: x.index, end: x.index + x[0].length, open: L });
      for (let k = 0; k < L; k++){
        cs[x.index + k] = M;
        cs[x.index + x[0].length - 1 - k] = M;
      }
    }
    m = cs.join('');
  }
  return out;
}

/* ---------- §2c 程式碼語法上色(輕量 tokenizer,規格 §8) ---------- */
/* 三類引擎:generic(關鍵字表驅動)、html、css;輸出已 escape 的 HTML。
   未知語言 → 純文字降級。高亮只在渲染態套用;啟用態為等寬原始碼(既有行為)。 */
const HL_KW = {
  javascript:'break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof interface let new of return static super switch this throw try typeof var void while with yield async await enum implements type as from null true false undefined NaN Infinity',
  python:'False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case self cls',
  clike:'auto bool break case catch char class const constexpr continue default delete do double else enum explicit extern false final float for friend goto if inline int long namespace new nullptr operator override private protected public return short signed sizeof static struct switch template this throw true try typedef typename union unsigned using virtual void volatile while NULL size_t string',
  java:'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null var record sealed when data fun val is object companion',
  go:'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var true false nil string int int64 float64 bool byte error make new len cap append',
  rust:'as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while Some None Ok Err String Vec Box',
  swift:'as break case catch class continue default defer deinit do else enum extension fallthrough false fileprivate final for func guard if import in init inout internal is lazy let nil open operator override private protocol public repeat required return self static struct subscript super switch throw throws true try typealias var weak where while some any',
  sql:'select from where insert into values update set delete create table drop alter add primary key foreign references not null unique index view join inner left right outer full on as and or in is between like limit offset order by group having distinct union all case when then else end count sum avg min max exists cascade constraint default begin commit rollback',
  bash:'if then else elif fi for while until do done case esac function in echo exit return local export readonly declare source break continue true false shift unset trap set eval sudo cd rm cp mv mkdir cat grep sed awk curl git npm node python pip',
  json:'true false null',
  yaml:'true false null yes no on off',
  latex:'',
};
const HL_ALIAS = {
  js:'javascript', jsx:'javascript', ts:'javascript', tsx:'javascript', mjs:'javascript', cjs:'javascript', node:'javascript', typescript:'javascript',
  py:'python', python3:'python',
  c:'clike', h:'clike', cpp:'clike', hpp:'clike', cc:'clike', cxx:'clike', 'c++':'clike', cs:'clike', csharp:'clike', objc:'clike', php:'clike',
  kt:'java', kotlin:'java', scala:'java',
  golang:'go', rs:'rust',
  sh:'bash', zsh:'bash', shell:'bash', console:'bash', terminal:'bash', makefile:'bash',
  mysql:'sql', postgres:'sql', postgresql:'sql', sqlite:'sql',
  htm:'html', xml:'html', svg:'html', vue:'html', jsp:'html',
  scss:'css', less:'css', sass:'css',
  yml:'yaml', jsonc:'json', json5:'json',
  tex:'latex',
};
function hlLangOf(lang){
  const l = String(lang || '').toLowerCase().trim();
  if (!l) return null;
  if (HL_KW[l] !== undefined || l === 'html' || l === 'css') return l;
  return HL_ALIAS[l] || null;
}

function highlight(code, lang){
  const L = hlLangOf(lang);
  if (!code) return '';
  if (!L) return escapeHtml(code);
  if (L === 'html') return hlHTML(code);
  if (L === 'css')  return hlCSS(code);
  return hlGeneric(code, L);
}

function hlGeneric(code, L){
  const kw = new Set(HL_KW[L].split(' ').filter(Boolean));
  const py = L === 'python', sh = L === 'bash', tex = L === 'latex',
        sql = L === 'sql', yml = L === 'yaml';
  let out = '', i = 0;
  const n = code.length;
  const push = (cls, txt) => { out += cls ? `<span class="tok-${cls}">${escapeHtml(txt)}</span>` : escapeHtml(txt); };
  const lineCmt = tex ? '%' : (py || sh || yml) ? '#' : (sql ? '--' : '//');
  while (i < n){
    const c = code[i], c2 = code.slice(i, i + 2), c3 = code.slice(i, i + 3);
    // 區塊註解
    if (!py && !sh && !tex && !yml && (c2 === '/*' || (sql && c2 === '/*'))){
      const j = code.indexOf('*/', i + 2);
      const end = j < 0 ? n : j + 2;
      push('com', code.slice(i, end)); i = end; continue;
    }
    if (py && (c3 === '"""' || c3 === "'''")){
      const j = code.indexOf(c3, i + 3);
      const end = j < 0 ? n : j + 3;
      push('str', code.slice(i, end)); i = end; continue;
    }
    // 行註解
    if (code.startsWith(lineCmt, i)){
      let j = code.indexOf('\n', i); if (j < 0) j = n;
      push('com', code.slice(i, j)); i = j; continue;
    }
    // 字串
    if (c === '"' || c === "'" || (c === '`' && !tex)){
      let j = i + 1;
      while (j < n && code[j] !== c){
        if (code[j] === '\\') j++;
        if (c !== '`' && code[j] === '\n') break;           // 單行字串跨行即中止
        j++;
      }
      const end = Math.min(n, j + (code[j] === c ? 1 : 0));
      push('str', code.slice(i, end)); i = end; continue;
    }
    // shell 變數 / LaTeX 指令
    if (sh && c === '$'){
      const m = code.slice(i).match(/^\$(\{[^}\n]*\}|[A-Za-z_]\w*|[0-9@#?*!$])/);
      if (m){ push('var', m[0]); i += m[0].length; continue; }
    }
    if (tex && c === '\\'){
      const m = code.slice(i).match(/^\\([a-zA-Z]+\*?|.)/);
      if (m){ push('kw', m[0]); i += m[0].length; continue; }
    }
    // 數字
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(code[i + 1] || ''))){
      /* CP88:小數可以從 .5 開始；檔名如 0.9.75.html 也不得讓 highlighter 因 null match 中斷整份文件。 */
      const m = code.slice(i).match(/^(0[xXbBoO][\da-fA-F_]+|\d[\d_]*(\.[\d_]+)?([eE][+-]?\d+)?|\.[\d_]+([eE][+-]?\d+)?)[a-zA-Z]*/);
      if (m){ push('num', m[0]); i += m[0].length; continue; }
    }
    // 識別字 / 關鍵字 / 函式
    if (/[A-Za-z_$]/.test(c)){
      const m = code.slice(i).match(/^[A-Za-z_$][\w$]*/);
      const w = m[0];
      const isKw = sql ? kw.has(w.toLowerCase()) : kw.has(w);
      if (isKw) push('kw', w);
      else if (/^\s*\(/.test(code.slice(i + w.length))) push('fn', w);
      else if (yml && /^\s*:/.test(code.slice(i + w.length))) push('attr', w);
      else push('', w);
      i += w.length; continue;
    }
    // 其他字元(標點、空白)原樣輸出
    let j = i + 1;
    while (j < n && !/[A-Za-z0-9_$"'`\\%#\/.-]/.test(code[j]) && code[j] !== '$') j++;
    push('', code.slice(i, j)); i = j;
  }
  return out;
}

function hlHTML(code){
  let out = '', i = 0;
  const n = code.length;
  const push = (cls, txt) => { out += cls ? `<span class="tok-${cls}">${escapeHtml(txt)}</span>` : escapeHtml(txt); };
  while (i < n){
    if (code.startsWith('<!--', i)){
      let j = code.indexOf('-->', i); j = j < 0 ? n : j + 3;
      push('com', code.slice(i, j)); i = j; continue;
    }
    if (code[i] === '<'){
      const m = code.slice(i).match(/^<\/?[a-zA-Z][\w:-]*/);
      if (m){
        push('tag', m[0]); i += m[0].length;
        // 屬性區
        while (i < n && code[i] !== '>'){
          const am = code.slice(i).match(/^\s*([a-zA-Z_:][\w:.-]*)/);
          if (am){
            push('', am[0].slice(0, am[0].length - am[1].length));
            push('attr', am[1]); i += am[0].length;
            const vm = code.slice(i).match(/^\s*=\s*("[^"]*"?|'[^']*'?|[^\s>]+)/);
            if (vm){
              const eq = vm[0].slice(0, vm[0].length - vm[1].length);
              push('', eq); push('str', vm[1]); i += vm[0].length;
            }
          } else { push('', code[i]); i++; }
        }
        if (code[i] === '>'){ push('tag', '>'); i++; }
        continue;
      }
    }
    let j = code.indexOf('<', i + 1);
    if (j < 0) j = n;
    push('', code.slice(i, j)); i = j;
  }
  return out;
}

function hlCSS(code){
  let out = '', i = 0, inBlock = false;
  const n = code.length;
  const push = (cls, txt) => { out += cls ? `<span class="tok-${cls}">${escapeHtml(txt)}</span>` : escapeHtml(txt); };
  while (i < n){
    const c = code[i];
    if (code.startsWith('/*', i)){
      let j = code.indexOf('*/', i + 2); j = j < 0 ? n : j + 2;
      push('com', code.slice(i, j)); i = j; continue;
    }
    if (c === '"' || c === "'"){
      let j = i + 1;
      while (j < n && code[j] !== c){ if (code[j] === '\\') j++; j++; }
      push('str', code.slice(i, Math.min(n, j + 1))); i = Math.min(n, j + 1); continue;
    }
    if (c === '{'){ inBlock = true; push('', c); i++; continue; }
    if (c === '}'){ inBlock = false; push('', c); i++; continue; }
    if (c === '@'){
      const m = code.slice(i).match(/^@[\w-]+/);
      push('kw', m ? m[0] : c); i += m ? m[0].length : 1; continue;
    }
    if (c === '#' && /[\da-fA-F]/.test(code[i + 1] || '')){
      const m = code.slice(i).match(/^#[\da-fA-F]{3,8}/);
      if (m){ push('num', m[0]); i += m[0].length; continue; }
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(code[i + 1] || ''))){
      const m = code.slice(i).match(/^[\d.]+[a-z%]*/);
      push('num', m[0]); i += m[0].length; continue;
    }
    if (/[A-Za-z-]/.test(c)){
      const m = code.slice(i).match(/^-?[A-Za-z][\w-]*/);
      const w = m[0];
      if (inBlock && /^\s*:/.test(code.slice(i + w.length))) push('prop', w);
      else if (!inBlock) push('tag', w);
      else if (w === 'important') push('kw', w);
      else push('', w);
      i += w.length; continue;
    }
    push('', c); i++;
  }
  return out;
}

/* 行首語法判定 — CP162B1 起使用統一的 Markdown 區塊語法；CP162B2A 保持此 grammar。
   語法涵蓋：標題、有序清單、圍欄與縮排程式碼、
   D/R/P、O/I、H/U/j、BLOCK_OPEN_REG 與 list／blockquote container lifecycle。 */
const RE = {
  /* Loose 模式允許 #Heading；尾端 closing hashes 只在前方有空白時移除。 */
  h:      /^[ \t]*(#{1,6})(?:[ \t]+|(?=[^#\s]))([\s\S]*?)(?:[ \t]+#+[ \t]*)?$/,
  quote:  /^>\s?(.*)$/,
  task:   /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/,
  ul:     /^(\s*)[-*+]\s+(.*)$/,
  /* Markdown h.ol / m.ol / g.ol：`.` 與 `)` 都是合法 ordered marker。 */
  ol:     /^(\s*)(\d+)([.)])\s+(.*)$/,
  hr:     /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/,
  fence:  /^ {0,3}(`{3,}|~{3,})[ \t]*([^\s`]*)[^\n]*$/,
  table:  /\|/
};
const SETEXT_RE = /^ *(=|-){2,}[\s\u00A0]*$/;
const TOC_RE = /^\s*(?:\[toc\]|\{:toc\}|\[\[_TOC_\]\])\s*$/i;
const DEF_LINK_RE = /^\s*\[([^\]]+)\]:(\s*<?)([^\s>]+)(>?)((\s+)(["'(])([^\n]*)(["')]))?\s*$/;
const INDENTED_CODE_OPEN_RE = /^( {4}|(?: {0,3}\t))(?:\s*\S.*)$/;
const INDENTED_CODE_PREFIX_RE = /^( {4}|(?: {0,3}\t))/;
const MD_HTML_BLOCK_TAGS = new Set(('address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main menu menuitem nav noframes ol optgroup option p param search section summary table tbody td tfoot th thead title tr track ul').split(/\s+/));
const MD_HTML_BLOCK_VOID_TAGS = new Set(('area base basefont bgsound br col embed hr img input keygen link meta param source track wbr').split(/\s+/));

function markdownFenceOpen(line){
  const m=String(line).match(RE.fence);
  return m?{run:m[1],char:m[1][0],length:m[1].length,lang:m[2]||''}:null;
}
function markdownFenceClose(line,open){
  if(!open)return false;
  const esc=open.char==='`'?'`':'~';
  return new RegExp('^ {0,3}'+esc+'{'+open.length+',}[ \\t]*$').test(String(line));
}
function markdownTableDelimiter(line){
  const cells=splitTableRow(line);
  return cells.length>1&&cells.every(c=>/^:?-+:?$/.test(String(c).trim()))?cells:null;
}
function markdownTableCandidateAllowed(line){
  const raw=String(line);
  if(INDENTED_CODE_OPEN_RE.test(raw)||markdownHtmlBlockOpen(raw))return false;
  if(/^\s*(?:[-+*]|\d+[.)])\s+/.test(raw)||/^\s*>/.test(raw)||/^\s*#{1,6}/.test(raw)||/^\s*```/.test(raw)||/^\s*---\s*$/.test(raw))return false;
  return true;
}
function markdownTableStart(lines,i){
  if(i+1>=lines.length||!markdownTableCandidateAllowed(lines[i]))return null;
  const head=splitTableRow(lines[i]),align=markdownTableDelimiter(lines[i+1]);
  if(!align||head.length!==align.length||head.length<2)return null;
  return {head,align};
}
function markdownTableRow(line){
  return String(line).trim()!==''&&splitTableRow(line).length>1;
}
function markdownHtmlBlockOpen(line){
  const m=String(line).match(/^\s{0,3}<([A-Za-z][A-Za-z0-9-]*)(?=\s|\/?>)/);
  if(!m)return null;
  const tag=m[1].toLowerCase();
  return MD_HTML_BLOCK_TAGS.has(tag)?{tag}:null;
}
function markdownHtmlTagDelta(line,tag){
  const rx=new RegExp('<\\/?'+tag+'(?=\\s|/?>)[^>]*>','ig');let m,depth=0;
  while((m=rx.exec(String(line)))){
    const token=m[0];
    if(/^<\//.test(token))depth--;
    else if(!/\/>$/.test(token)&&!MD_HTML_BLOCK_VOID_TAGS.has(tag))depth++;
  }
  return depth;
}
function markdownSetextLevel(raw){
  const lines=String(raw).split('\n');
  if(lines.length!==2||!lines[0].trim())return 0;
  const m=lines[1].match(SETEXT_RE);return m?(m[1]==='='?1:2):0;
}
function markdownIsFrontMatter(raw){
  const lines=String(raw).split('\n');
  return lines.length>=3&&/^\s*---\s*$/.test(lines[0])&&/^\s*(?:---|\.\.\.)\s*$/.test(lines[lines.length-1]);
}
function markdownIsHtmlBlock(raw){return !!markdownHtmlBlockOpen(String(raw).split('\n')[0]);}
function markdownIsIndentedCode(raw){
  const lines=String(raw).split('\n');return !!lines.length&&INDENTED_CODE_OPEN_RE.test(lines[0]);
}

function markdownTableHasOuterPipes(raw){
  const body=tableLayoutParts(String(raw)).body;
  const line=body.split('\n').find(x=>x.trim())||'';
  return /^\s*\|/.test(line)&&/\|\s*$/.test(line);
}

/* ---------- §3 區塊分割 ---------- */
/* 仍保留 blocks[] 作 canonical transaction adapter，但多行 block 的邊界改用 Markdown
   原版 state-machine 規則，而不是「任意同類 closing marker」或只認外框 pipe。 */
function splitToBlocks(md){
  const lines=String(md).replace(/\r\n?/g,'\n').split('\n');
  const out=[];
  for(let i=0;i<lines.length;i++){
    /* 原版 meta block：只在文件起點，closing 可為 --- 或 ...。 */
    if(i===0&&/^\s*---\s*$/.test(lines[i])){
      let close=-1;
      for(let j=1;j<lines.length;j++)if(/^\s*(?:---|\.\.\.)\s*$/.test(lines[j])){close=j;break;}
      if(close>1){out.push(lines.slice(i,close+1).join('\n'));i=close;continue;}
    }

    const fo=markdownFenceOpen(lines[i]);
    if(fo){
      const buf=[lines[i]];let j=i+1;
      while(j<lines.length&&!markdownFenceClose(lines[j],fo)){buf.push(lines[j]);j++;}
      if(j<lines.length)buf.push(lines[j]);
      out.push(buf.join('\n'));i=Math.min(j,lines.length-1);continue;
    }

    const mm=lines[i].match(/^\s*\$\$(.*)$/);
    if(mm){
      const rest=mm[1].trim();
      if(rest&&isMathClose(rest)){out.push(lines[i]);continue;}
      const buf=[lines[i]];let j=i+1;
      while(j<lines.length&&!isMathClose(lines[j])){buf.push(lines[j]);j++;}
      if(j<lines.length)buf.push(lines[j]);
      out.push(buf.join('\n'));i=Math.min(j,lines.length-1);continue;
    }
    if(/^\s*\\\[\s*$/.test(lines[i])){
      const buf=[lines[i]];let j=i+1;
      while(j<lines.length&&!/^\s*\\\]\s*$/.test(lines[j])){buf.push(lines[j]);j++;}
      if(j<lines.length)buf.push(lines[j]);
      out.push(buf.join('\n'));i=Math.min(j,lines.length-1);continue;
    }

    /* Markdown block parser 先判斷 M（indented code），再進入 heading/table/HTML。
       opening 必須含非空內容；continuation 使用 L，只要求四空格或 Tab prefix。 */
    if(INDENTED_CODE_OPEN_RE.test(lines[i])){
      const buf=[lines[i]];let j=i+1;
      while(j<lines.length){
        if(INDENTED_CODE_PREFIX_RE.test(lines[j])){buf.push(lines[j]);j++;continue;}
        if(/^\s*$/.test(lines[j])){
          let k=j+1;while(k<lines.length&&/^\s*$/.test(lines[k]))k++;
          if(k<lines.length&&INDENTED_CODE_PREFIX_RE.test(lines[k])){while(j<k)buf.push(lines[j++]);continue;}
        }
        break;
      }
      out.push(buf.join('\n'));i=j-1;continue;
    }

    /* CP119 layout comment + Markdown table。無首尾 pipe 亦可；cell splitter 會先保護
       code span、inline math、escaped pipe，再按真正 delimiter 切欄。 */
    const layout=/^\s*<!--\s*ekdeta-html-table\s*:\s*\{[^\n]*\}\s*-->\s*$/i.test(lines[i]);
    const tableAt=layout?i+1:i;
    const ts=markdownTableStart(lines,tableAt);
    if(ts){
      const buf=[];if(layout)buf.push(lines[i]);
      buf.push(lines[tableAt],lines[tableAt+1]);let j=tableAt+2;
      while(j<lines.length&&markdownTableRow(lines[j])){buf.push(lines[j]);j++;}
      out.push(buf.join('\n'));i=j-1;continue;
    }

    /* Setext 的判斷晚於 table，避免 ---|--- 被當成 H2 underline。 */
    if(lines[i].trim()&&i+1<lines.length&&SETEXT_RE.test(lines[i+1])){
      out.push(lines[i]+'\n'+lines[i+1]);i++;continue;
    }

    const ho=markdownHtmlBlockOpen(lines[i]);
    if(ho){
      const buf=[lines[i]];let depth=markdownHtmlTagDelta(lines[i],ho.tag),j=i+1;
      while(j<lines.length&&depth>0){
        if(!lines[j].trim())break;
        buf.push(lines[j]);depth+=markdownHtmlTagDelta(lines[j],ho.tag);j++;
      }
      out.push(buf.join('\n'));i=j-1;continue;
    }

    out.push(lines[i]);
  }
  return out.length?out:[''];
}

/* CP91/CP92:段落級首行縮排語意。一般段落把 marker 放在行首；
   引言則採標準 Markdown 相容形式「> <!-- noindent -->文字」，marker 位於 quote prefix 後。
   CP92 同時接受早期未交付測試稿的「<!-- noindent -->> 文字」，讀取後仍可無損還原。 */
const NOINDENT_MARK = '<!-- noindent -->';
const NOINDENT_RE = /^<!--\s*noindent\s*-->[ \t]*/i;
const NOINDENT_QUOTE_RE = /^(>\s?)<!--\s*noindent\s*-->[ \t]*/i;
function noIndentParts(src){
  const raw = String(src == null ? '' : src);
  const qm = raw.match(NOINDENT_QUOTE_RE);
  if (qm){
    const markerStart = qm[1].length;
    const markerLength = qm[0].length - markerStart;
    return {
      on:true, raw,
      body:raw.slice(0, markerStart) + raw.slice(markerStart + markerLength),
      prefix:qm[0].slice(markerStart), markerStart, markerLength, kind:'quote'
    };
  }
  const m = raw.match(NOINDENT_RE);
  if (m){
    return {
      on:true, raw, body:raw.slice(m[0].length), prefix:m[0],
      markerStart:0, markerLength:m[0].length, kind:'leading'
    };
  }
  return { on:false, raw, body:raw, prefix:'', markerStart:-1, markerLength:0, kind:'' };
}
function noIndentRawToBody(parts, off){
  const p = parts || noIndentParts('');
  const n = Math.max(0, Math.min(Number(off) || 0, p.raw.length));
  if (!p.on) return n;
  const z = p.markerStart + p.markerLength;
  if (n < p.markerStart) return n;
  if (n <= z) return p.markerStart;
  return n - p.markerLength;
}
function noIndentBodyToRaw(parts, off){
  const p = parts || noIndentParts('');
  const n = Math.max(0, Math.min(Number(off) || 0, p.body.length));
  if (!p.on) return n;
  return n < p.markerStart ? n : n + p.markerLength;
}
function noIndentToggleRaw(src){
  const p = noIndentParts(src);
  if (p.on) return p.body;
  const qm = p.raw.match(/^(>\s?)/);
  return qm ? qm[1] + NOINDENT_MARK + p.raw.slice(qm[1].length)
            : NOINDENT_MARK + p.raw;
}
function noIndentable(src){
  const body = noIndentParts(src).body;
  const kind = blockType(body);
  if (!body.trim() || (kind !== 'p' && kind !== 'quote')) return false;
  /* CP92:引用區塊仍包含真正的 p.md-p；適用性檢查要看 > 後的內文，
     不能因外層 blockType 是 quote 就拒絕，也不能因此放行引用中的圖片等非文字內容。 */
  const prose = kind === 'quote' ? ((body.match(RE.quote) || [])[1] || '') : body;
  if (!prose.trim() || (kind === 'quote' && blockType(prose) !== 'p')) return false;
  if (/^\s*\[\^[A-Za-z0-9_.\-\u4e00-\u9fff]+\]:/.test(prose)) return false;      // footnote definition
  if (/^\s*\[\d{1,3}\]\s+/.test(prose)) return false;                              // TW_THESIS reference entry
  if (/^\s*\*\*(?:圖|表|Figure|Table)\s+[^*]+\*\*/i.test(prose)) return false;    // TW_THESIS caption
  if (/^\s*\*\*(?:關鍵字|Keywords?)\s*[：:]/i.test(prose)) return false;             // abstract keywords
  if (/^\s*!\[[^\]]*\]\([^)]+\)\s*$/.test(prose) || /^\s*<img\s[^>]*>\s*$/i.test(prose)) return false;
  if (/^\s*<(?:div|figure|table|pre|blockquote|details|hr)\b/i.test(prose)) return false;
  return true;
}

function blockType(src){
  const raw=String(src==null?'':src),lines=raw.split('\n'),first=lines[0]||'';
  if(raw.includes('\n')){
    if(markdownIsFrontMatter(raw))return 'meta';
    if(markdownFenceOpen(first)||markdownIsIndentedCode(raw))return 'code';
    if(/^\s*\$\$/.test(first)||/^\s*\\\[\s*$/.test(first))return 'math';
    const tableBodyLines=tableLayoutParts(raw).body.split('\n');
    if(markdownTableStart(tableBodyLines,0))return 'table';
    if(markdownSetextLevel(raw))return 'h';
    if(markdownIsHtmlBlock(raw))return 'html';
    return 'p';
  }
  if(/^\s*\$\$.*\$\$\s*(?:\{[^{}\n]*\}\s*)?$/.test(raw)&&raw.trim().length>4)return 'math';
  if(raw.trim()==='')return 'empty';
  if(TOC_RE.test(raw))return 'toc';
  if(DEF_LINK_RE.test(raw))return 'def_link';
  /* Markdown checks indented-code M before heading x/C. This is observable for
     `    #Heading` and `\t#Heading`, which must remain code. */
  if(INDENTED_CODE_OPEN_RE.test(raw))return 'code';
  if(RE.h.test(raw))return 'h';
  if(RE.hr.test(raw))return 'hr';
  if(RE.quote.test(raw))return 'quote';
  if(RE.task.test(raw))return 'task';
  if(RE.ul.test(raw))return 'ul';
  if(RE.ol.test(raw))return 'ol';
  if(markdownHtmlBlockOpen(raw))return 'html';
  return 'p';
}

/* CP152：清單與引言是「結構化單行區塊」。模型仍保存標準 Markdown，
   但日常輸入只編輯內容根節點，marker／引用框始終保持渲染。 */
function structuredIndentColumns(s){
  let n = 0;
  for (const ch of String(s == null ? '' : s)) n += ch === '\t' ? 2 : 1;
  return n;
}
function structuredBlockParts(raw){
  raw = String(raw == null ? '' : raw);
  let m = raw.match(/^(>\s?)(.*)$/);
  if (m) return { type:'quote', isList:false, prefix:m[1], content:m[2], contentStart:m[1].length,
                  nextPrefix:'> ', indent:'', depth:0, number:null };
  m = raw.match(/^(\s*)([-*+])\s+\[([ xX])\]\s+(.*)$/);
  if (m){
    const prefix = m[1] + m[2] + ' [' + m[3] + '] ';
    return { type:'task', isList:true, prefix, content:m[4], contentStart:prefix.length,
             nextPrefix:m[1] + m[2] + ' [ ] ', indent:m[1], depth:Math.floor(structuredIndentColumns(m[1])/2),
             bullet:m[2], checked:m[3].toLowerCase()==='x', number:null };
  }
  m = raw.match(/^(\s*)([-*+])\s+(.*)$/);
  if (m){
    const prefix = m[1] + m[2] + ' ';
    return { type:'ul', isList:true, prefix, content:m[3], contentStart:prefix.length,
             nextPrefix:prefix, indent:m[1], depth:Math.floor(structuredIndentColumns(m[1])/2),
             bullet:m[2], number:null };
  }
  m = raw.match(/^(\s*)(\d+)([.)])\s+(.*)$/);
  if (m){
    const num = Math.max(1, Number(m[2]) || 1), marker=m[3], prefix = m[1] + m[2] + marker + ' ';
    return { type:'ol', isList:true, prefix, content:m[4], contentStart:prefix.length,
             nextPrefix:m[1] + (num + 1) + marker + ' ', indent:m[1], depth:Math.floor(structuredIndentColumns(m[1])/2),
             number:num, marker };
  }
  return null;
}
/* CP154：清單階層與編號由 canonical blocks[] 推導；DOM 僅是投影。
   同一連續清單區域內，ordered sibling 依父項目分組重新編號；新縮排的第一個子項從 1
   開始，因此 Blackout 的第二層一定從 a. 起，不會沿用原本的 2. 變成 b.。 */
function structuredSetOrderedNumber(raw, n){
  return String(raw == null ? '' : raw).replace(/^(\s*)\d+([.)]\s+)/, '$1' + Math.max(1,Number(n)||1) + '$2');
}
function structuredListBounds(i){
  if (!(structuredBlockParts(blocks[i] ?? '') || {}).isList) return null;
  let a=i,b=i;
  while (a>0 && (structuredBlockParts(blocks[a-1] ?? '') || {}).isList) a--;
  while (b+1<blocks.length && (structuredBlockParts(blocks[b+1] ?? '') || {}).isList) b++;
  return {start:a,end:b};
}
function structuredListSubtreeEnd(i){
  const p=structuredBlockParts(blocks[i] ?? '');
  if (!p || !p.isList) return i;
  let e=i;
  for (let j=i+1;j<blocks.length;j++){
    const q=structuredBlockParts(blocks[j] ?? '');
    if (!q || !q.isList || q.depth<=p.depth) break;
    e=j;
  }
  return e;
}
function structuredPreviousListSibling(i, depth){
  const b=structuredListBounds(i); if(!b)return -1;
  for(let j=i-1;j>=b.start;j--){
    const q=structuredBlockParts(blocks[j] ?? '');
    if(!q||!q.isList)break;
    if(q.depth<depth)break;
    if(q.depth===depth)return j;
  }
  return -1;
}
function structuredNormalizeOrderedRegion(anchor){
  const b=structuredListBounds(anchor); if(!b)return null;
  const states=[],ancestors=[];
  for(let i=b.start;i<=b.end;i++){
    let p=structuredBlockParts(blocks[i] ?? '');
    if(!p||!p.isList)continue;
    const d=p.depth;
    states.length=d+1; ancestors.length=d+1;
    const parent=d>0?(ancestors[d-1]??-1):-1;
    if(p.type==='ol'){
      let st=states[d];
      if(!st||st.parent!==parent||st.type!=='ol') st=states[d]={parent,type:'ol',next:Math.max(1,p.number||1)};
      const want=st.next++;
      const next=structuredSetOrderedNumber(blocks[i],want);
      if(next!==blocks[i])blocks[i]=next;
    }else states[d]={parent,type:p.type,next:1};
    ancestors[d]=i;
  }
  return b;
}
function structuredRerenderBounds(b){
  if(!b)return;
  suppressSel++;
  for(let i=b.start;i<=b.end;i++){
    const el=editor.children[i]; if(!el)continue;
    el.className='block'; el.innerHTML=renderBlockHTML(blocks[i] ?? '');
  }
  activeIndex=-1;
  requestAnimationFrame(()=>suppressSel=Math.max(0,suppressSel-1));
}
function structuredEditRoot(el, type){
  if (!el) return null;
  if (type === 'quote') return el.querySelector('.md-quote .md-p');
  if (type === 'task') return el.querySelector('.task-text');
  /* CP161：list item 內 heading 的可編輯根節點是 heading 本身，避免局部編輯
     把 span 插到 li 外層後遺失字級／粗體；普通清單仍回傳 li。 */
  if (type === 'ul' || type === 'ol') return el.querySelector('.md-list-heading') || el.querySelector('li');
  return null;
}
function structuredInlineHTML(text){
  const html = inlineMD(text);
  return html || '<span class="struct-empty-anchor" data-struct-empty-line="1">​</span>';
}

/* CP161：清單容器相容投影。Markdown 預設（非 Strict Mode）會容忍部分
   不足縮排，也會把 list item 內容開頭的 ATX marker 視為 item 內 heading。
   這裡只改 renderer projection，不重寫 Markdown、不合併 canonical blocks[]。 */
function listHeadingParts(text){
  const raw = String(text == null ? '' : text);
  let m = raw.match(/^(#{1,6})[ \t]+([\s\S]*)$/);
  if (m) return { level:m[1].length, content:m[2], lenient:false };
  /* 非嚴格相容：#Title 亦可在 list item 內視為 heading；連續 7 個以上 # 不誤判。 */
  m = raw.match(/^(#{1,6})(?=[^#\s])([\s\S]*)$/);
  return m ? { level:m[1].length, content:m[2], lenient:true } : null;
}
function structuredListInlineHTML(text){
  const h = listHeadingParts(text);
  if (!h) return structuredInlineHTML(text);
  return `<h${h.level} class="md-h md-list-heading" data-md-list-heading="${h.level}"` +
         ` data-md-list-heading-lenient="${h.lenient ? '1' : '0'}">${structuredInlineHTML(h.content)}</h${h.level}>`;
}
function structuredListHeadingInfo(raw, part){
  const p = part || structuredBlockParts(raw);
  if (!p || !p.isList || p.type === 'task') return null;
  const h = listHeadingParts(p.content);
  if (!h) return null;
  const markerLength = Math.max(0,p.content.length-h.content.length);
  return { level:h.level, lenient:h.lenient, markerLength,
           rawContentStart:p.contentStart+markerLength, content:h.content };
}
function listCompatLeadingIndent(raw){
  const m = String(raw == null ? '' : raw).match(/^([ \t]*)/);
  return { raw:m ? m[1] : '', columns:structuredIndentColumns(m ? m[1] : '') };
}
function listCompatAnalyze(sourceBlocks){
  const srcs = Array.isArray(sourceBlocks) ? sourceBlocks : [];
  const hints = new Array(srcs.length).fill(null);
  const stack = [];
  let blankRun = 0;
  for (let i=0;i<srcs.length;i++){
    const raw = String(srcs[i] == null ? '' : srcs[i]);
    const part = structuredBlockParts(raw);
    if (part && part.isList){
      const indentColumns = structuredIndentColumns(part.indent);
      while (stack.length && stack[stack.length-1].indentColumns >= indentColumns) stack.pop();
      stack.push({
        index:i, type:part.type, depth:part.depth, indentColumns,
        contentColumns:structuredIndentColumns(part.prefix)
      });
      blankRun = 0;
      continue;
    }
    if (blockType(raw) === 'empty'){
      blankRun++;
      /* Markdown 允許一個空白行後以足夠縮排續接同一個 list item，
         但兩個以上連續空白行會關閉該清單容器。 */
      if (blankRun > 1) stack.length=0;
      continue;
    }
    if (raw.includes('\n')){ stack.length=0; blankRun=0; continue; }
    const lead = listCompatLeadingIndent(raw);
    const prose = raw.slice(lead.raw.length);
    if (stack.length && blockType(raw) === 'p' && prose.trim()){
      let hit = null, mode = '';
      for (let j=stack.length-1;j>=0;j--){
        const item = stack[j];
        if (lead.columns >= item.contentColumns){ hit=item; mode='standard'; break; }
        /* Markdown 非 Strict Mode 的容錯邊界：ordered marker 較寬時，
           允許至少兩欄內容縮排，不要求補足整個 marker 寬度。 */
        if (lead.columns >= item.indentColumns + 2){ hit=item; mode='lenient'; break; }
      }
      /* CommonMark lazy continuation：緊接清單且沒有空白分隔的普通文字仍屬 item。 */
      if (!hit && blankRun === 0){ hit=stack[stack.length-1]; mode='lazy'; }
      if (hit){
        hints[i]={ kind:'continuation', anchorIndex:hit.index, anchorType:hit.type,
                   anchorDepth:hit.depth, mode, indentColumns:lead.columns };
        blankRun=0;
        continue;
      }
    }
    stack.length=0;
    blankRun=0;
  }
  return hints;
}
let listCompatHints = [];
let listCompatFrame = 0;
function listCompatAnchorElement(index, type){
  const block = editor && editor.children ? editor.children[index] : null;
  if (!block || block.classList.contains('active')) return null;
  if (type === 'task') return block.querySelector('.task-text');
  return block.querySelector('li');
}
function listCompatClearBlock(block){
  if (!block) return;
  delete block.dataset.mdListContinuation;
  delete block.dataset.mdListContinuationAnchor;
  delete block.dataset.mdListContinuationMode;
  const p = block.firstElementChild;
  if (p && p.classList && p.classList.contains('md-list-continuation')){
    p.classList.remove('md-list-continuation');
    p.style.removeProperty('--md-list-continuation-offset');
  }
}
function listCompatApply(){
  listCompatFrame = 0;
  if (!editor || !editor.children) return;
  listCompatHints = listCompatAnalyze(blocks);
  for (let i=0;i<editor.children.length;i++){
    const block = editor.children[i], hint = listCompatHints[i];
    const p = block && block.firstElementChild;
    if (!hint || hint.kind !== 'continuation' || !p || !p.matches('p.md-p') || block.classList.contains('active')){
      listCompatClearBlock(block);
      continue;
    }
    p.classList.add('md-list-continuation');
    block.dataset.mdListContinuation='1';
    block.dataset.mdListContinuationAnchor=String(hint.anchorIndex);
    block.dataset.mdListContinuationMode=hint.mode;
    const anchor = listCompatAnchorElement(hint.anchorIndex, hint.anchorType);
    let offset = '';
    if (anchor){
      const a = anchor.getBoundingClientRect(), b = block.getBoundingClientRect();
      const px = a.left - b.left;
      if (Number.isFinite(px) && px > .25) offset = (Math.round(px*100)/100) + 'px';
    }
    if (!offset) offset = (1.9 + Math.max(0,Number(hint.anchorDepth)||0)*1.5) + 'em';
    if (p.style.getPropertyValue('--md-list-continuation-offset') !== offset)
      p.style.setProperty('--md-list-continuation-offset', offset);
  }
}
function listCompatSchedule(){
  if (listCompatFrame) return;
  listCompatFrame = requestAnimationFrame(listCompatApply);
}
const listCompatObserver = new MutationObserver(listCompatSchedule);
listCompatObserver.observe(editor,{childList:true,subtree:true});
if (typeof ResizeObserver === 'function') new ResizeObserver(listCompatSchedule).observe(editor);
window.addEventListener('resize',listCompatSchedule,{passive:true});
if (document.fonts && document.fonts.ready) document.fonts.ready.then(listCompatSchedule).catch(()=>{});
window.__CP161_LIST_COMPAT__=Object.freeze({
  checkpoint:'CP161',version:'1.0.2',policy:'renderer-only-lenient-list-container',
  heading:listHeadingParts,analyze:listCompatAnalyze,apply:listCompatApply
});

/* ---------- 區塊渲染(原始碼 → HTML) ---------- */
/* ============================================================
   CP15 — 臺灣論文模式:學位論文模板主題化
   由模板定義輸入格式(見種子文件「臺灣論文模板」),套用主題後
   自動生成 classicthesis 風格書名頁與版面。書名頁由 ```twthesis-titlepage
   圍欄區塊的欄位解析而成;NSYSU 校徽以 base64 內嵌。
   ============================================================ */
const NSYSU_LOGO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBAUEBAYFBQUGBgYHCQ4JCQgICRINDQoOFRIWFhUSFBQXGiEcFxgfGRQUHScdHyIjJSUlFhwpLCgkKyEkJST/2wBDAQYGBgkICREJCREkGBQYJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCT/wAARCAC0ANwDASIAAhEBAxEB/8QAHAABAAEFAQEAAAAAAAAAAAAAAAcBAwUGCAIE/8QAQBAAAQMDAwIDBQYDBgUFAAAAAQIDBAAFEQYSIQcxE0FRFCJhcYEIMkKRobEjUsEVFhdVktEkJTNi8ENTY3LS/8QAGwEBAAIDAQEAAAAAAAAAAAAAAAUGAQMEAgf/xAAzEQACAQMCBAMFCAMBAAAAAAAAAQIDBBEFIQYSMUFRYXETMpGh0RQWIkKBweHwIzOxcv/aAAwDAQACEQMRAD8A6ppj4mlKAUpSgKYPrVQCPPNKUArxuPrXsnArF329RbDbnZ0pYShtJPzrVXrQowdSbwkYlJRTk+hkN+POq7jUCXS5ay1k89PgR7p7CFe4hhRCU4+WMn5V9Gh+pdwsM5MC9PvPwCrYovZLkc+uTzj1BqOoanzTUK0HDPTJX/vFQVVQlFqL6S7MnQEnzr0M45q2w6h5tLjagtCgFJUDkEetXKliwJ5WUecqzQbjXqlDIx8TXk7s16oTjvQCrciQzFaLr7qGmxgFa1BIGTgcn4mve8Zr4r1a4d8tki3T4ceZGkIKFsSG97a/TcD8cH6UBfjTo0vd7PIZe29/DWFY/I1fzXI32UpsbSWrNXWuaiQ5dAUMNw4bS3Svw1uBZyBtCRxypQ78ZqeIPV+3DVrOltQWm56buMxO6AbgG/Cm/BDiFEbu3unBycd+KwCQaVRPaq1kClKUApSlAKUpQClKUApSlAKUoe1AeHFADJPA5qG9Z3GRrXWMbTkY4jtup3kHzxkn6DP1rfOoOp0absbrgP8AHcGxpPqo9v8Az4Vp/RexOOvS77JSVE5aaWrupR5Uf2H1NREmru8VL8lPd+b7IgdVrOtVhYQ6y3l/5/klC3W2NbIDEOM2EMsoCEgeg/rUSdaNOCLMYvTLYSh3+E8Rj734T+4qZh2rAa3sZ1Dp2ZBQEeKpG5sqHZQ5Fe9Yt3WoOS6x3OzUrGNxaSopdtvVdDS+jmry/HVYJbuXGQVxio8lHmn6d/l8qlLdXKbT0m2zEutLWxJYXkKScKQoGpGt3W6c1E8KfbW33wMB5pewKPqUn+lctprNN0kqvvL5ld0XX6dKl9nunhx6MmRTqUDKlAfOvmF4gKeSwJ0Uur5SjxU7lfIZ5qHommdWdRmlXeVcERWSSGUKKgkjz2pHl8T3rQJsJ61znojyfDfjrKDjjBHmP3pX1WvQlH2tPCfnudl3xFOjFVI0XyPo3tk6q3c1VX3aivpf1EdnLRY7w8VvYxHkLPK8fgV6n0PnUpk5TUzRrRrQVSD2ZN2F9SvKSq03/Bx91htXWXppeL1dLffryvTU2a5NTKgvkNsF1Wdq0ZJRjOP5Twe9R50+g6x6waujWiZqDUUmMo75L4kOPFtHwyraMnjJ4GSfKupYXWvTbd7m2nWdyRpa/Wl5UeTGdWVRJrefdcRuBBSpODzhQzjkV66U620Bd9X3e0dPbEERVlUyfdG2/CZceJACEJPvEHk9kpGOBzWw7SKvshRk2u96zmTJSGYsBptl111YSgBK3CVKVnHGM5Oe9a91f1w9186j2ay6RZe9gt8gRY84IVy464kF9RAyhAKU7c88Z4zgbP006eQ9XagNru6nEWS4wHpLkKI6WxIcZlOtpU8oDcvlRWE7gM44OK6W03pCw6Siey2K1Q7c0UoQoR2ggrCRgFRHKjjzNYQZkYEdcWGyw4+uQttCUKeWAFOEDG444ye9X6AYpXoClKUApSlAKUpQClKUApSlAO1WJktEOM4+4cJQkqNXldq1HVhkX6U3pyE74fjpKpLo7ttDhWPic4HzPpXNczmoctP3nsvr+hrq1PZxcksv9yK7vNndSdWtsREq8Iq2NA52pRnlZ9P9gBU6WW0MWS2R7fGADbKAkH1PmT8Sea+LT2kbVppKjBiIbcWkJUvuSB/5z6ms5WuwtVbUeTu92/FkZpunToznXrvNSXyXghVCnNVpXa0S5DXVvQyoj69QQUAsLOZSR+BX8/y9fpWh6btCr5e4dvTnD7gSog8geZ/IGunnmkPILbiErQoYKVDII+VYu36UstqlmZCtcWPIII8RtGCAe+PSoenpFOFwqyey3x5lW1DhuNxcqvB4Te6+nqffDitQojMVhO1ppAbQPQAYFQ/1l0uqJNbvrIHgvkNOj0Xzg/UcVM+KxWp7K3f7JLt7nAebIB/lV5H863araqvRbx+JbomNRsY3VtKhjtt6rocxoWptaVoJSpJBBHcH1roLpxrAaqswEhQ9vjYQ8O2/0Xj4/vUAS4rsKU9FfTtdZWULHoQa2bpneHbRq2GEupQ1JPgOhXYg9v1xULol04VfYvpL/pQNEvZ2V2oS6N4a/vgSr1K6VWDqZY5cC4RY7E15CUtXJLCVPxyk5SQruR3GM4IJqvTDphaelenEWa2fx3FL8SRMWgByQs+asdgOwHkAPPJO5JORQ+VWw+oEDdHozrGtLZuUopNklrSnbwN1wdPf4/T61PQ7VBvSKfCvGsLe9EJWqDZX4b4Kf+k6ma7kZxgZ5I5GR61OQ7U7hilKUApSlAKUpQClKUApSlAKUqijgUB8l3uTNqt70t9YQ20kqKj2Fa70/Q/Niyr7KCg5cXdzaT+FlOQgfXk/WsZrdUnVVwRpi2PISdnjSl+SUAj3T8Sf2reokZESO1HaSEoaSEJA8gBiuO3bqTlWfTpH07v9Xt+hwqTq3GF7sPm39C/SlK7DuFKUoBSlKAUpSgNJ1xoKDeLTOdjtbJpWZKFAfj2gEfUD8+agMFSF55SpJ+oIrrBaQtJSeQagDqhpY6f1AX2Un2ScS4gnyXn3k/rn61WdXtJQqqvSXXr69im8UaauRXNJbrr9SXtCagGotNRJZWFPpT4b3/3Twfz4P1rYu9c/fZ7103drvc4EcLERMj2c7lA5WElQWMdgQkj8q6BQcirFTm5xTls+/qWPTKlWdvFVliSW5rugrNKsemo9vmt+G+yt0EbgRguKIIIJ4IIPl8q2OlK2HeKUpQClKUApSlAKUpQClKUArw8kqQUpOCQefSvdMViS5lhg1bSejnrDPm3OZcFS5k0neAkBCQD7oHnwMCtpxTFK804RpwUI9FsaqVGNJcsEKUpXs2ilKUApQmqZoCtKpmq5oDWrp1B0/ZNW23StxmiLcrm0XYgcGEO4VjYFdtxPYHvXz9SbLAu+lpTs6SxDTDSZCZT6whtnA5KlHsCODUZ/aP6Oap6gXCzag0o9FVMtTakezrX4bijv3pUhR90kEdjj51kNA9FJVyTHv3VCbN1De8HdEnPb4zB7ABsHYoD1xgnkY4rVWpKpFwfc11aUasHCfRnN3Tr+8ds1fOZ0xMSzaHpIU5cVsLdjt7VEtqBGMrydo55KiCcGpg6h9aNdaY0PCvcLUVldlvzDFVGbtW1xI2qVuO5xQxhKfLkqPPFbb1V0Q3ZExZ9qjFm3IbTHUy0MNsBIwnA8h5fP51qenOkEbqfMjm8e2otMJ0Or8FzYl9Q7IPHPnyOQM+tR1rc1ql1Km4YS/uc+ZX3qNWnqMbXk28eufBk96FmXS46Qs8y9OIXcX4jbsgoaLQ3qSCfcPas8D3q1GjtRWUMMoS222kJSlPYAeVXalUWQUpSsgUpSgFKUoBSlKAUpTNAKUzTOaAUpSgFKZqmaArmsZfNR23TsdD9ykeChaticJKio4z2HypfL9A0/BXMnPeGgcJA5Us+iR5moH1BqORf705c3UpTk4aaVhaW0jsMHg/H41Jadp0rqWXtFFf1vXIWEOWOHN9vDzZJ0rq3bXAUWuBOuD27ASlvaD9eT+lYK7dSdUkENWlNsQey3myVY+G7A/Q1oarvcFFRE2QgK4KW1lCceQwnAxXzLcW5jxFqXjgblE4/OrBR0anB5cU/XL+hS7nia5qppTa9ML6s2B/XuqfFUly7PoUk4KUpQAPyFeP7+am/zmT+Sf9qwFKklZUEsci+BDPUrtvPtZfFmf/v7qf8AzmR+Sf8AavX+IOqP84e/0I//ADWvUo7K3f5F8AtTu10qy+LNla6jalQrLs9MlBGFNvMoUlQ+IAFZ61dX5ENoNSbRGUhIASIyvDCR8jkVGca4MS21qZTIWtDy2lITHWSnacZUcYGSFY9QkmrMC4G5PPPMMyVRGgpltRSGw7ICgFA7sEBAIyDjJV6JNR1ahYSXurrjYmrWvq9OTak1hZy+nz8Sb2es1nUsB2BPbT5qwlX6A1lofU/TEtIJn+zqP4X21Jx9e1QQgOeC0p5KG3FoClNpcC9h9CRxn5etVrw9CtprMG0bo8WX9KXLUUXj+9jpqNOjzWQ9GebebPZbagoH6ir24VzTAuk61O+LBlvxleZaWRn5jsa3G3dXrzFbCJcaNNI43nLaj88cfpUZcaDWg803zL4E7Z8YW1RYrxcX8UTLuFVHNR/p7rBYbxvTIUqGtpfhLXnxGkrxnaVDsrBBwa3mJOjTWg7GfbfbPZbagofmKh6lCpTeJrBZre9o11/jln/vw6l+lU3im4VqOorSmR60oBkVi9Qagg6ct65s1zakcIQPvOK/lA9a8aj1LB0xDTLnFzatWxCW0FRUrGcfp51B2qtSyNUXVcx3choe6y0TkNp/3PnUnp2nSupZe0fEr+ua5CwpuMN6j6Lw82b1Y+sAkXFTV1iojxnVANuNknwh/wB+e4+IqSmX23mw42tK0KGQpJyCK5ir6YlynQMeyTJMfH/tuqT+xqautBpz3ovBVtP4vrUk43K5/PozpfcPUV4efaYQVuuJQkdyo4H51z//AH51KUbP7al7cY7jP54zWKl3GbcDmZMkSD/8rhV+9ccOHqrf45LBKVeNKCX+Om2/PH8k23XqZpy2KKBLMpwfhjJ38+me361rM/rPuZcTBta0unIQt5wYHxwO/wAqjClSVLQraHvZZA3HFt9UzyYivJH3Xi9T79MVLuEhTzh7DslA9EjyFfDSlTEIRguWKwit1Ks6knOby2KUpXo1ilKUApSlAUfdcEdX8RYCEnbkFQSfUJ/pXie6u2R40KHa3THio2eEhSA6FHBUteSNy1KJKjnv8quU7VplQUpKfdHXSu3CDptZT6/ofPGnsyjsTvQ6AFKadQULSPiD/Tir6lBCSpRASkZJPkK+ebb2p5jqccebVHdS82ppQSdwPY5ByPUdj517ui90KasAJyy6cJ7D3T2pzzjnK6dzLp0ZuPs31e68P1MPrR+QjRsyfBkux1GKiWw83kFSCQpJHwI/Sq2K5yJfT+Debo4qM+/GecW8QE+4lSkpd79zjPYDI471jLr4iOi0BaU7nF2RG4EBO1O8jP3Rn3QD559TXz3tpP8Ag3b0vJUW4liaeIThtPiuvrS0Pujccb1nGc4GTUBUv5c8auesc47ZLlbaRB0p26Xu1MJ90tjE9CZF0cXeGHUOm0PJ8Zx9ajtRJT9zaPxLVuKT6A5PlmVYdwl250Ow5L0ZwfiaWU/tUaROq2ndO6e09ZWFSZ3ssFtMhTAw226slawAQnJBUAcDkjue9b5bJ7F4tUS6Q1b4stJU2rz4O0gjyII5FbtGdL2Xs3LLe+Di4ohcK4+0Km4xW3Mu/wBPI36zdVr3AcQmfsuDAGDuSEuf6h/UVvdk6mWK8LbZW6uHIcO0NvjAJ+Chx+1QdSum50W3q7xXK/L6HBY8T3tvhSlzLz+p06CCMjkVcHaoq6UaokLlLs02YFNbMxUOcq3ckpB9Mc4NSpVRu7aVvUdOR9K03UIX1BV4dzUep9q/tLSshaUkuRCJCcDPA7/oTUG1Od71FKRqKDZ40cuIdDqnWVowqSlIQCEk8JbHiglfmUFI86jTXOjn9NXBbrTe63PrJZWkHDf/AGK9D6fCpzQbyMc0Jv0Kjxfpk5NXdNZ7P9mavSlKtBQRSlKAUpSgFKV9lus1xuy9kCDIknOMtoJA+Z7CvM5xgsyeDZTpTqPlgsvyPjpW727pHfZQCpTsWEn0UorV+Q4/Ws7G6NQ2yn2y7PrzwA0hKMn4ZzUdU1i1htzZ9CZocN6hVWVTx67EV0qW2dB6HYUzvnKkF4Atj2nIcBWEAjb3G9QT8zXpuz6FaRDdRZZS25isNuLZd27cJO87jwn3hz8/Q1yy4gt10TJGHBt4/elFfH6ERVTI9R+dTdDtekHEuOxrE2tCJIilfs+QV79mQSewUCD5jHbtVxqXpNuTLjuWZMYxHQ0tbtuIQSRkEK2kYI7fMeorS+I6faDOiPBNf81RfAg3cPUfnTcPUfnXSkeLCcYbcajNBtaQpOWgngjI4IyKLtcFwYXCjK+bST/SvC4iXeHzNr4Jljar8v5Oa9w9R+dfLd0KetM5ttzYtUdwJUPI7TzXTq7Tb3keG5BirT/KppJH7VDXWbqBpPRklvTVo0tEv+qpwAagNNYS1uGElzaMknyQOSOTgcnL4gjKLjKHzEODatOcZxqp4fgQ9qAiF0XgtpbKUmzMjCk4PvqyT2HmT6/M96irUT0yXZLPcHpbPhSGPZkxWFJSEJj4bSVJSfvEEnKhk5JFSjbem/UzU05WitQmTY4zFu3tvIt3ix5CW/upLjfBOOM5OdoBB719cjTvR7ppGst7uDt2nagEREhyxOBDwS6UD3nQpICQDkhKvh7pA5grivGooKPZYLfZWk6DqOe/NJs1qw6RX1RvA1NdbZHsGm2ENRkMQk7FSfDQAG2sjJJx7zhzjPcnAqVVKQGWIzDDUWJGR4UeMyMNsI/lSO/zJySeSSaiaXqrqB1EuyI+l7XcmIz5KI6W0ZUU5I954gJ7gjjAzx3qVtBdBOpdlmuvX67w5UNTLn/DCSp1ZdwNhBUAByTnnsDwcipHT7y2tp7ptvv4EJrOm319SaUlGK35erfqxVQlSvupJ+QzWQuunbtZD/zCA+wnO0OEZQT8FDits6PR3Hr3McBywiPhYyCCoqGOPoastxeQp0XWg08FDs9NqVrqNtNOLfl0Pr6Y6RuEW8ous2OpphLBUwsKSpLm7jyJ8ualgDivCUBIASkADsAMVcHaqPd3Urmp7SZ9Y03TqdjR9jT3Nc1dGuTsIptIbafkbYy30oUXkIUtIO1Q+6ACtW7yIHHORW3Tk3d242eZBBjx1llt0KK2pCO2Mn8acEKHr2J5rPKG4EZIz5jvWlahju2G2sRrfBlPs2qK7NafcSHAqRnakqJ5KxvW4SRzjv3rl3TyjvcVJcrMDf8ApA/46nrHIbLKiSI75IKPgFc5HzrSrrpa82VShNt76Ep/9RKdyP8AUOKkyw6zks39VjlD2lhzc7FluugKcaClBSu2FcJ3jH4VDyxW02i/2+/JSYalrSuKzMBU2UgtOhRQcng52njy8+9TVtrleniMvxL+9yr3vCVpWblTzBvw6fA51oSB3IqfLnatKRX2m51tgh6Yvaj/AIfcpZJAzkDgZUkZ4AyKwrdy0RHfiLiWdtxc5vdGUIgQl0AJJCSvA3bV7sdyEq8xipH7xU8e4yE+5VbP+xY9GRPEtNwnkCJBlP7uxbaUQfrjFbZYulN4uWHJ6k25k+SxucP0Hb6n6VKGprq5p2yPXBiIH0RgC4gZ9xvsVBKQSrHBxxxnmsDfbvLlKvFqefchuw4bc1ow3ChTpCSXWyr0BKO2DhQ+vFX1+tJYglElbXg62ptSrScvki03000tZIq5VzW88217y3H3NqR9E4/KssrUcO326Z/Y9rXJagNb0tMbGw6AEEhsE5V7qwQcYPbNXr3AduNmdisx1vxw00qMWZampG8KBCgtXCSkAEEk5I547/Pa9KzAt2RdJUZUmVGQxIdjRwh1ZCNpPieQ+6oAAAEenFQ9a4q1f9kmyy21jb2yxRgl6H2me9d9LPzba+gvvxnVR3o3vDdhWwp3eeQOD58VqdsTOuNztN3iF25NFaQ+l1ZUkJKknxEE8JW2XVJwO6d45xUgQbdFtrBYiNJZaK1ubE9ty1FSj9VEn61fQ0hsbUJCUjyAwK074Oo1eJp2UsWl1WY67fMkFSXcKLsdS1FI4OAchpQ9NuKxjHT6Y3HgJbcgxnIc8z8o8Vze5tIySSO4xkYA9K32lMA1xjTcqM5LdbeihcuazJcSlspQdiwSrGf+opISCe2Ug+tVvGnpVzh3SOoRXEy5Md5tCyoAJQWiQo88+4cYHp862KlYcQWzxknjzrRtR9SoUK8Is8GTHW+hKnZK87tiUj7qfIrPp6A1vElBWw4kDJKSMVyfGjwEapkNXBBdb9qWhKPc2qO8jKio4GO/zFQ2qXdSnKNOOyff9iw6DplK8VWdVv8AAspLuTL07vF2e1hfIEu5O3CN4KZDYWrd4CifuD6EfCucejWoLY/1Yv8ArbXF2jxlQ0Pylqff2KccUvaUoR95eE5ASPhXSfROFbk2e5z7eyW0vzVo5x2QAABj8POR861i+/ZP0beNVm/IlTWUPS1SpME7VMubjkpTwCkZz5+fwqQsk1bxUnk4NX5ftUoxWMYXh0XgRh1S6/681jbHn9GWq72jSRWWf7RQwoPSFAZOXE5DY+CeeOVdxWc6AdBdP6otcXXGpJEu7S3VulcOSn3EvhZBU5uBKyO/PcnJrpmDbodtgswIUZmPEYbDTbDSQlCEAYCQO2Khf7VVqu7Oio+oLJIkMG3SkLlhqW41hn3uUpSoJ5WobjjcePSuojSaYUGNbojMOIwhiOykIbaQMJSB5CvpCQRmufdK/bC0jJsbbupIU+23FCg24zGbL6FjA/iBXGBnPB5+dT7Bmx7jCjzYjqXo8htLrTiey0KGQR8CDQHt2O0+2pt1tK0KGFJUMgj4ivDEGLGUpTEdppSsbihABPzxV+lesvoeeWOc43AAFKUrB6KbRQoFVpQGBu2j4N1kGUtb6JHvhLiVk+GlbYbWEj8OUDHHY818OndNXTT09CBIiPwBDYi5O8OIDRdwADkHIcQMk/hPHPG2UoMmuansc67ybY5CWwwuI943tJUpLrJyn7uOFJUnelSFcHcD5ViR03TMhtRJ8pIQwohlcdJStCUqBaUCTwsYGeCDyOxNbzgUrGAfPMhomxH4rpV4b7am1bTg4UMHB8jzVtm1RGH/AGlLCDIxjxlDcv7qUnk9shKc474FfZSs4AAxSlKAUpSgFKUoBSlKAoRmoq1doGFY9QP6rajGTGfUDJjeEXAhRPvOYHOPPjGCPjUrV5Kcmue4t1VWH1R1Wl5UtpNwezWH5o1Lp0IxtU16IlCWXZrihsQUg8JGcHz+XHp3ra69BFV2fGttOHJBQXY01qntJufieK5m+0f066odQ9ZxYVojLm6ebYS5GQhxLbTTmML8TJ5XnGDjseOyq6c2fGqbK9msgvpN9mCwaSZamaniRrxd21lQWpRWwMjHuoPGBk4JySeeOAJxiRGIMVmLGZbYYZQG22m04ShIGAAPIAVcCcGq1hIClKVkClKUApSlAKUpQClKUApSlAKUpQClKUApSlAKUpQClKUApSlAKUpQClKUApSlAKUpQClKUApSlAKUpQClKUApSlAKUpQClKUApSlAKUpQClKUApSlAKUpQClKUApSlAf/2Q==';
/* CP26(0.9.15):自訂封面校徽 — settings.twthesisLogo 有值(dataURL)用自訂,否則 fallback 內嵌中山校徽 */
const NSYSU_LOGO_TW_THESIS2 = 'data:image/jpeg;base64,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';
const NSYSU_LOGO_ENGLISH = "data:image/jpeg;base64,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";
function hasCustomTwThesisLogo(){ return !!(settings.twthesisLogo && String(settings.twthesisLogo).indexOf('data:') === 0); }
function normalizeTwThesisLogoChoice(){
  const before = settings.twthesisLogoChoice;
  const allowed = ['seal','brand','custom'];
  if (allowed.indexOf(settings.twthesisLogoChoice) < 0)
    settings.twthesisLogoChoice = hasCustomTwThesisLogo() ? 'custom' : 'seal';
  if (settings.twthesisLogoChoice === 'custom' && !hasCustomTwThesisLogo()) settings.twthesisLogoChoice = 'seal';
  return before !== settings.twthesisLogoChoice;
}
function normalizeTwThesisLogoScale(){
  const before = settings.twthesisLogoScale;
  let n = Number(before);
  if (!Number.isFinite(n)) n = 100;
  n = Math.max(60, Math.min(140, Math.round(n / 5) * 5));
  settings.twthesisLogoScale = n;
  return before !== n;
}
function applyTwThesisLogoScale(schedule = true){
  normalizeTwThesisLogoScale();
  const value = (settings.twthesisLogoScale / 100).toFixed(2);
  document.body.style.setProperty('--twthesis-logo-scale', value);
  editor.style.setProperty('--twthesis-logo-scale', value);  /* PDF clone 會帶走 editor inline 變數 */
  if (schedule) schedulePaginate();
}
function twthesisSelectedLogoSrc(){
  normalizeTwThesisLogoChoice();
  if (settings.twthesisLogoChoice === 'brand') return NSYSU_LOGO_ENGLISH;
  if (settings.twthesisLogoChoice === 'custom' && hasCustomTwThesisLogo()) return settings.twthesisLogo;
  return NSYSU_LOGO_TW_THESIS2;
}
/* CP135:中文版與 English TW_THESIS 共用同一個偏好選擇；保留三個舊入口避免 renderer／測試斷鏈。 */
function twthesisLogoSrc(){ return twthesisSelectedLogoSrc(); }
function twthesisEnglishLogoSrc(){ return twthesisSelectedLogoSrc(); }
function twthesis2LogoSrc(){ return twthesisSelectedLogoSrc(); }
function renderTwThesisTitlePage(body){
  return isTwThesisEnglishTheme() ? renderTwThesisEnglishTitlePage(body) : renderTwThesisFormalTitlePage(body);
}
function renderTwThesisEnglishTitlePage(body){
  const get = twthesis2Fields(body), e = escapeHtml;
  const lab = get('laboratory','lab','mylab');
  const title = get('title','mytitle') || 'Your Title';
  const author = get('author','name','myname') || 'Your name';
  const statement = get('thesis statement','dissertation statement','thesis','mythesis') || 'A dissertation for the degree of';
  const degree = get('degree','mydegree') || 'Master of Science';
  const department = get('department','mydepartment') || 'Department of Physics';
  const university = (get('university','institution','myuni') || 'National Sun Yat-sen University').replace(/(?:\s+University){2,}$/i,' University');
  const date = get('date','time','mytime') || 'July 2026';
  const labHtml = e(lab).replace(/\s+NSYSU$/i,'<br><span class="twthesis-en-lab-nsysu">NSYSU</span>');
  const titleLen = Array.from(title.replace(/\s+/g,' ').trim()).length;
  const titleClass = titleLen > 135 ? ' twthesis-en-title-ultra-long'
    : (titleLen > 88 ? ' twthesis-en-title-very-long' : (titleLen > 52 ? ' twthesis-en-title-long' : ''));
  return '<div class="twthesis-titlepage twthesis-en-titlepage" contenteditable="false"><div class="twthesis-en-cover' + titleClass + '">' +
    (lab ? '<div class="twthesis-en-lab">' + labHtml + '</div>' : '') +
    '<div class="twthesis-en-title">' + e(title) + '</div>' +
    '<div class="twthesis-en-author">' + e(author) + '</div>' +
    '<img class="twthesis-en-logo" src="' + twthesisEnglishLogoSrc() + '" alt="National Sun Yat-sen University logo" draggable="false">' +
    '<div class="twthesis-en-statement">' + e(statement) + '</div>' +
    '<div class="twthesis-en-degree">' + e(degree) + '</div>' +
    '<div class="twthesis-en-department">' + e(department) + '</div>' +
    '<div class="twthesis-en-university">' + e(university) + '</div>' +
    '<div class="twthesis-en-date">' + e(date) + '</div>' +
    '</div></div>';
}
function renderTwThesisEnglishTitleBack(body){
  const get = twthesis2Fields(body), e = escapeHtml;
  const lab = get('laboratory','lab','mylab');
  const author = get('author','name','myname') || 'Your name';
  const title = get('title','mytitle') || 'Your Title';
  const statement = get('thesis statement','dissertation statement','thesis','mythesis') || 'A dissertation for the degree of';
  const degree = get('degree','mydegree') || 'Master of Science';
  const copyrightText = get('copyright','copyright date') || get('date','time','mytime') || 'July 2026';
  const supervisor = get('supervisor','advisor','my supervisor','mysupervisor') || 'Prof. Advisor Name';
  const place = get('place','location','mylocation') || 'Kaohsiung, Taiwan';
  const time = get('time','date','mytime') || copyrightText;
  return '<div class="twthesis-titlebackpage twthesis-en-titlebackpage" contenteditable="false"><div class="twthesis-en-titleback">' +
    '<div class="twthesis-en-titleback-summary">' +
      (lab ? '<div class="twthesis-en-titleback-lab">' + e(lab) + '</div>' : '') +
      '<span>' + e(author) + ': </span><span class="twthesis-en-titleback-title">' + e(title) + '</span><span>, ' + e(statement) + ' </span>' +
      '<span class="twthesis-en-titleback-degree">' + e(degree) + '</span><span>, © ' + e(copyrightText) + '</span>' +
    '</div>' +
    '<div class="twthesis-en-titleback-kv"><span>Supervisor:</span><span>' + e(supervisor) + '</span></div>' +
    '<div class="twthesis-en-titleback-kv"><span>Place:</span><span>' + e(place) + '</span></div>' +
    '<div class="twthesis-en-titleback-kv"><span>Time:</span><span>' + e(time) + '</span></div>' +
    '</div></div>';
}
/* ============================================================
   CP87／CP127 — 臺灣論文 制式封面：沿用 臺灣論文 2 的中山校院式封面座標，
   但正文、章節、目錄、引用與紙本 openright 規則全部使用原 臺灣論文 引擎。
   舊 twthesis2-titlepage 語法與 renderTwThesis2TitlePage 名稱只作相容別名。
   ============================================================ */
function twthesis2Fields(body){
  const f = {};
  String(body || '').split('\n').forEach(line => {
    const m = line.match(/^\s*([^:：]+)[:：]\s*(.*)$/);
    if (m) f[m[1].trim().toLowerCase()] = m[2].trim();
  });
  return (...keys) => {
    for (const k of keys){ const v = f[String(k).toLowerCase()]; if (v) return v; }
    return '';
  };
}
function renderTwThesisFormalTitlePage(body){
  const get = twthesis2Fields(body), e = escapeHtml;
  let uniZh = get('校名中文','大學中文','學校中文','中文校名','university_zh') || '國立中山大學';
  let deptZh = get('系所中文','中文系所','department_zh') || '物理學系';
  /* 舊模板常把校名與系所合寫在「系所中文」。新版拆成兩行，但無損讀取舊內容。 */
  if (!get('校名中文','大學中文','學校中文','中文校名','university_zh')){
    const m = String(deptZh).match(/^(國立中山大學)\s*(.*)$/);
    if (m){ uniZh = m[1]; deptZh = m[2] || '物理學系'; }
  }
  const degreeZh = get('論文類型中文','學位中文','degree_zh') || '碩士論文';
  const deptEn = get('系所英文','英文系所','系所','department','department_en') || 'Department of Physics';
  const uniEn = get('大學英文','學校英文','大學','university','university_en') || 'National Sun Yat-sen University';
  let degreeEn = get('論文類型英文','學位英文','學位','degree','degree_en') || 'Master’s Thesis';
  if (/^(?:Master\s+Thesis|Master['’]?s\s+Thesis|MASTER\s+OF\s+SCIENCE|A\s+dissertation\s+for\s+the\s+degree\s+of\s+MASTER\s+OF\s+SCIENCE)$/i.test(String(degreeEn).trim())) degreeEn = 'Master’s Thesis';
  const titleZh = get('中文標題','標題','title','title_zh');
  const titleEn = get('英文標題','title_en','english title','english');
  const legacyAuthor = get('作者','author','name');
  const legacyAuthorParts = String(legacyAuthor || '').match(/^(.+?[\u3400-\u9fff])\s+([A-Za-z].*)$/);
  const studentZh = get('研究生中文','作者中文','研究生','student_zh','author_zh') || (legacyAuthorParts ? legacyAuthorParts[1] : legacyAuthor);
  const studentEn = get('研究生英文','作者英文','student_en','author_en') || (legacyAuthorParts ? legacyAuthorParts[2] : '');
  const legacyAdvisor = get('指導教授','advisor','supervisor');
  const advisorZh = get('指導教授中文','advisor_zh','supervisor_zh') || (/[^\x00-\x7F]/.test(legacyAdvisor) ? legacyAdvisor : '');
  const advisorEn = get('指導教授英文','advisor_en','supervisor_en') || (!/[^\x00-\x7F]/.test(legacyAdvisor) ? legacyAdvisor : '');
  const dateZh = get('日期中文','時間中文','date_zh','time_zh');
  const dateEn = get('日期英文','時間英文','時間','日期','date_en','time_en');
  const logo = (typeof twthesis2LogoSrc === 'function') ? twthesis2LogoSrc() : twthesisLogoSrc();
  const titleZhLen = String(titleZh || '').replace(/\s/g, '').length;
  const titleEnLen = String(titleEn || '').trim().length;
  const titleSizeClass = (titleZhLen > 32 || titleEnLen > 98)
    ? ' twthesis2-title-long twthesis2-title-very-long'
    : (titleZhLen > 22 || titleEnLen > 78 ? ' twthesis2-title-long' : '');
  const cover = '<div class="twthesis2-cover' + titleSizeClass + '">' +
    '<div class="twthesis2-cover-head twthesis2-cover-zone">' +
      '<img class="twthesis2-logo" src="' + logo + '" alt="NSYSU crest" draggable="false">' +
      '<div class="twthesis2-uni-dept-zh"><span class="twthesis2-uni-zh">' + e(uniZh) + '</span><span class="twthesis2-dept-zh">' + e(deptZh) + '</span></div>' +
      '<div class="twthesis2-degree-zh">' + e(degreeZh) + '</div>' +
      '<div class="twthesis2-cover-en-group">' +
        '<div class="twthesis2-dept-en">' + e(deptEn) + '</div>' +
        '<div class="twthesis2-uni-en">' + e(uniEn) + '</div>' +
        '<div class="twthesis2-degree-en">' + e(degreeEn) + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="twthesis2-cover-title-zone twthesis2-cover-zone">' +
      (titleZh ? '<div class="twthesis2-title-zh">' + e(titleZh) + '</div>' : '') +
      (titleEn ? '<div class="twthesis2-title-en">' + e(titleEn) + '</div>' : '') +
    '</div>' +
    '<div class="twthesis2-cover-person-zone twthesis2-cover-zone">' +
      (studentZh ? '<div class="twthesis2-student-zh"><span class="twthesis2-person-label">研究生：</span><span class="twthesis2-person-name">' + e(studentZh) + '</span></div>' : '') +
      (studentEn ? '<div class="twthesis2-student-en"><span class="twthesis2-person-label" aria-hidden="true"></span><span class="twthesis2-person-name">' + e(studentEn) + '</span></div>' : '') +
      (advisorZh ? '<div class="twthesis2-advisor-zh"><span class="twthesis2-person-label">指導教授：</span><span class="twthesis2-person-name">' + e(advisorZh) + '</span></div>' : '') +
      (advisorEn ? '<div class="twthesis2-advisor-en"><span class="twthesis2-person-label" aria-hidden="true"></span><span class="twthesis2-person-name">' + e(advisorEn) + '</span></div>' : '') +
    '</div>' +
    '<div class="twthesis2-cover-date-zone twthesis2-cover-zone">' +
      (dateZh ? '<div class="twthesis2-date-zh">' + e(dateZh) + '</div>' : '') +
      (dateEn ? '<div class="twthesis2-date-en">' + e(dateEn) + '</div>' : '') +
    '</div>' +
    '</div>';
  return '<div class="twthesis-titlepage twthesis2-titlepage" contenteditable="false">' + cover + '</div>';
}
/* 舊 API 名稱保留，輸出與 canonical TW_THESIS 封面完全相同。 */
function renderTwThesis2TitlePage(body){ return renderTwThesisFormalTitlePage(body); }
function renderTwThesisApprovalPage(body){
  const get = twthesis2Fields(body), e = escapeHtml;
  let src = get('圖片','影像','圖檔','image','src','path');
  if (!src){
    const raw = String(body || '').split('\n').map(x => x.trim()).filter(Boolean);
    if (raw.length === 1 && !/[:：]/.test(raw[0])) src = raw[0];
  }
  const title = get('目錄名稱','標題','toc title','title') || (twthesisDocumentEnglish() ? 'Thesis Approval Form' : '論文審定書');
  const defenseDate = get('口試日期','學位考試日期','oral defense date','defense date','date');
  const knockWhite = /^(?:1|true|yes|是|移除|透明)$/i.test(get('移除白底','白底移除','remove white background','knockout white'));
  const page = src
    ? '<img class="twthesis2-approval-img" data-knockout-white="' + (knockWhite ? '1' : '0') + '" src="' + sanitizeURL(normalizeImgPath(src), true) + '" alt="' + e(title) + '" draggable="false">'
    : '<div class="twthesis2-approval-placeholder"><strong>' + e(title) + '</strong><span>' +
      (twthesisDocumentEnglish() ? 'Place the signed approval scan here: Image: image/approval.png' : '請放入已填妥口試日期的審定書圖片：圖片: image/論文審定書.png') +
      '</span></div>';
  const dateLine = defenseDate ? '<div class="twthesis2-approval-date">' +
    e(twthesisDocumentEnglish() ? 'Oral defense date: ' + defenseDate : '口試日期：' + defenseDate) + '</div>' : '';
  /* 審定書是正文前頁碼的起點：本頁顯示 i，後續前置頁連續 ii、iii…。 */
  return '<h1 class="md-h twthesis-fm twthesis2-toc-only">' + e(title) + '</h1>' +
         '<div class="twthesis2-approvalpage" contenteditable="false">' + page + dateLine + '</div>';
}

function renderMarkdownToc(){
  const entries=[];
  (blocks||[]).forEach((raw,i)=>{
    const t=blockType(raw);if(t!=='h')return;
    let level=0,text='';const m=String(raw).match(RE.h);
    if(m){level=m[1].length;text=m[2];}
    else{level=markdownSetextLevel(raw);text=String(raw).split('\n')[0];}
    text=String(text).replace(/\s+#+\s*$/,'').trim();if(text)entries.push({level,text,i});
  });
  const body=entries.length?entries.map(x=>`<li class="md-toc-lv${x.level}" data-toc-block="${x.i}"><span>${inlineMD(x.text)}</span></li>`).join(''):'<li class="md-toc-empty">（尚無標題）</li>';
  return `<nav class="md-toc cp162b-toc" contenteditable="false"><div class="md-toc-title">Table of Contents</div><ol>${body}</ol></nav>`;
}
function renderSafeHtmlBlock(raw){
  const tpl=document.createElement('template');tpl.innerHTML=String(raw);
  tpl.content.querySelectorAll('script,iframe,object,embed,base,meta,link').forEach(x=>x.remove());
  tpl.content.querySelectorAll('*').forEach(el=>{
    [...el.attributes].forEach(a=>{
      const n=a.name.toLowerCase(),v=a.value.trim();
      if(n.startsWith('on')||((n==='href'||n==='src'||n==='xlink:href')&&/^javascript:/i.test(v)))el.removeAttribute(a.name);
    });
  });
  return `<div class="cp162b-html-block">${tpl.innerHTML}</div>`;
}
function renderDefinitionBlock(raw){
  const m=String(raw).match(DEF_LINK_RE);if(!m)return `<div class="md-def-link">${escapeHtml(raw)}</div>`;
  const title=m[8]?` <span class="md-def-title">${escapeHtml(m[8])}</span>`:'';
  return `<div class="md-def-link" data-def-ref="${escapeHtml(m[1].toLowerCase())}"><span class="md-def-label">[${escapeHtml(m[1])}]:</span> <span class="md-def-url">${escapeHtml(m[3])}</span>${title}</div>`;
}
function renderBlockHTML(src){
  mathSeq = 0; styleSeq = 0;                 // 每個區塊獨立的行內公式/樣式序號
  const ni = noIndentParts(src);
  src = ni.body;
  const niClass = ni.on ? ' no-indent' : '';
  const t = blockType(src);
  if (t === 'empty') return '<p class="md-p md-empty"><br></p>';
  if (t === 'toc') return renderMarkdownToc();
  if (t === 'meta'){
    const ls=String(src).split('\n');
    return `<pre class="md-meta-block"><code>${escapeHtml(ls.slice(1,-1).join('\n'))}</code></pre>`;
  }
  if (t === 'html') return renderSafeHtmlBlock(src);
  if (t === 'def_link') return renderDefinitionBlock(src);
  if (t === 'h'){
    const m = String(src).match(RE.h);
    const lvl = m ? m[1].length : markdownSetextLevel(src);
    let txt = m ? m[2] : String(src).split('\n')[0];
    /* CP15:一級標題若為前置章節關鍵字(摘要/誌謝/目錄…)→ 標記 twthesis-fm(TW_THESIS 模式不編號、自成一頁) */
    let cls = 'md-h';
    /* CP17/18:前置/後置無號章(摘要/誌謝/目錄/參考文獻…)→ twthesis-fm(不編號、左對齊、自成一頁)。
       僅 TW_THESIS 模式標記,避免洩漏到純 Markdown 模式。 */
    const isFM = isTwThesisTheme() && lvl === 1 && /^\s*(中文摘要|英文摘要|Chinese Abstract(?:\s*\(Optional\))?|摘要|Abstract|誌\s*謝|致\s*謝|Acknowledge?ments?|目錄|Contents|Table of Contents|參考文獻|參考書目|References?|Bibliography)\s*$/i.test(txt.trim());
    if (isFM) cls += ' twthesis-fm';
    /* CP15/17:TW_THESIS 模式改由主題自動編號 → 去掉標題內既有的章/節/附錄編號
       (相容「# 第一章 X」「## 1.1 X」「# 附錄 A：X」「## A.1 X」與純標題) */
    if (isTwThesisTheme() && !isFM){
      if (lvl === 1){
        txt = txt.replace(/^\s*(第\s*[〇零一二三四五六七八九十百千\d]+\s*章|Chapter\s+[\dIVXLC]+)\s*[：:：.．、,，\s　]*/i, '');
        const loneAppendix = isTwThesis2Theme() && /^\s*(附錄|Appendix)\s*$/i.test(txt);
        if (!loneAppendix) txt = txt.replace(/^\s*(附錄|Appendix)\s*[A-Za-z]?\s*[：:：.．、,，\s　]*/i, '');   // 「附錄 A：」→ 字母交給計數；TW_THESIS2 的單獨「附錄」保留
      }
      txt = txt.replace(/^\s*(\d+(\.\d+)*|[A-Za-z]\.\d+(\.\d+)*)\s*[：:.．、\s　]*/, '');   // 節號 2.1 / 3.1.1 / 附錄 A.1
    }
    if (isTwThesis2Theme() && isFM && /^\s*參考文獻\s*$/.test(txt)) cls += ' twthesis2-ref-title';
    return `<h${lvl} class="${cls}">${inlineMD(txt)}</h${lvl}>`;
  }
  if (t === 'hr') return '<hr class="md-hr">';
  /* CP48(T11):註腳 v1 — 依 id 顯示、不重編號(重編號需全文掃描,列 v2)。
     定義行「[^id]: 內容」→ 註腳列(id 錨點+回跳);行內 [^id] 見 inlineMD。
     id 允許英數._-與中日韓;僅整行行首才算定義,句中出現維持行內引用+字面冒號。 */
  {
    const fm = src.match(/^\[\^([A-Za-z0-9_.\-\u4e00-\u9fff]+)\]:\s?([\s\S]*)$/);
    if (fm){
      const id = escapeHtml(fm[1]);
      return `<div class="md-p fn-line"><a class="fn-tag" id="fn-def-${id}" href="#fn-ref-${id}">[${id}]</a>: ${inlineMD(fm[2]) || ''}</div>`;
    }
  }
  if (t === 'quote'){
    const m = src.match(RE.quote);
    return `<blockquote class="md-quote"><p class="md-p${niClass}">${structuredInlineHTML(m[1])}</p></blockquote>`;
  }
  if (t === 'task'){
    const m = src.match(RE.task);
    const done = m[2].toLowerCase() === 'x';
    const ind = Math.floor(m[1].length / 2);
    return `<ul class="md-list" style="margin-left:${ind*1.5}em">` +
           `<li class="task${done?' done':''}"><input type="checkbox" class="task-check"${done?' checked':''}>` +
           `<span class="task-text">${structuredInlineHTML(m[3])}</span></li></ul>`;
  }
  if (t === 'ul'){
    const m = src.match(RE.ul);
    const ind = Math.floor(m[1].length / 2);
    /* CP109:md-lv{0,1,2} 深度 class(僅 Blackout/Blackout Game 主題的 CSS 選用,
       其餘主題無對應規則、零影響)供清單符號依層級輪替(見主題覆寫區塊)。 */
    return `<ul class="md-list md-lv${ind % 3}" style="margin-left:${ind*1.5}em"><li>${structuredListInlineHTML(m[2])}</li></ul>`;
  }
  if (t === 'ol'){
    const m = src.match(RE.ol);
    const ind = Math.floor(m[1].length / 2);
    return `<ol class="md-list md-lv${ind % 3}" start="${m[2]}" data-ol-marker="${m[3]}" style="margin-left:${ind*1.5}em"><li>${structuredListInlineHTML(m[4])}</li></ol>`;
  }
  if (t === 'math'){
    const math = mathSourceParts(src, 'block');
    return `<div class="md-math-block">${mathHTML(math.tex, true)}</div>`;
  }
  if (t === 'code'){
    const lines = src.split('\n'),fo=markdownFenceOpen(lines[0]);
    const lang = fo ? fo.lang : '';
    const body = fo
      ? lines.slice(1, markdownFenceClose(lines[lines.length-1],fo) ? -1 : undefined).join('\n')
      : lines.map(x=>x.replace(/^(?: {4}| {0,3}\t)/,'')).join('\n');
    /* CP18:TW_THESIS 專用圍欄(書名頁 / 目錄 / 圖表目錄 / 附錄分界)只在 臺灣論文模式
       生效;其餘主題一律當「純 Markdown 程式碼區塊」呈現(落到下方 <pre>),
       避免論文渲染洩漏到 GitHub / Night / Sepia / 論文輸出模式。 */
    if (isTwThesisTheme()){
      if (/^(twthesis|twthesis2)-(titlepage|cover|meta)$/i.test(lang))   // canonical twthesis；twthesis2 為舊語法別名
        return renderTwThesisTitlePage(body);
      if (/^(twthesis|twthesis2)-(approval|approvalpage|approval-form)$/i.test(lang))
        return renderTwThesisApprovalPage(body);
      if (/^(twthesis|twthesis-en)-(titleback|title-back)$/i.test(lang))
        return renderTwThesisEnglishTitleBack(body);
      if (/^twthesis-toc$/i.test(lang)){                     // CP133:目錄本身也列入正文前目錄
        const title = twthesisDocumentEnglish() ? 'Contents' : '目錄';
        return '<h1 class="md-h twthesis-fm twthesis2-toc-only" data-twthesis-toc-title="' + escapeHtml(title) + '"></h1>' +
               '<nav class="twthesis-toc"><div class="twthesis-toc-title">' + title +
               '</div><div class="twthesis-toc-body"></div></nav>';
      }
      if (/^twthesis-lof$/i.test(lang)){                     // CP133.1:中文正式名稱維持「圖目錄」
        const title = twthesisDocumentEnglish() ? 'List of Figures' : '圖目錄';
        return '<h1 class="md-h twthesis-fm twthesis2-toc-only" data-twthesis-toc-title="' + escapeHtml(title) + '"></h1>' +
               '<nav class="twthesis-toc twthesis-lof"><div class="twthesis-toc-title">' + title +
               '</div><div class="twthesis-toc-body"></div></nav>';
      }
      if (/^twthesis-lot$/i.test(lang)){                     // CP133.1:中文正式名稱維持「表目錄」
        const title = twthesisDocumentEnglish() ? 'List of Tables' : '表目錄';
        return '<h1 class="md-h twthesis-fm twthesis2-toc-only" data-twthesis-toc-title="' + escapeHtml(title) + '"></h1>' +
               '<nav class="twthesis-toc twthesis-lot"><div class="twthesis-toc-title">' + title +
               '</div><div class="twthesis-toc-body"></div></nav>';
      }
      if (/^twthesis-appendix$/i.test(lang))                 // CP17:附錄分界標記 → 之後各章改用字母編號(A、B、C)
        return '<div class="twthesis-appendix-marker" aria-hidden="true"></div>';
    }
    if (/^(math|katex)$/i.test(lang))         // fenced math block(規格 §9.1)
      return `<div class="md-math-block">${mathHTML(body.trim(), true)}</div>`;
    // 1.2.6：revtex-／twthesis- 論文資料區塊是文字不是程式碼，加 ekd-wrap-fence 讓它自動換行
    return `<pre class="md-pre${/^(revtex|twthesis)-/i.test(lang) ? ' ekd-wrap-fence' : ''}">${lang ? `<span class="lang-tag">${escapeHtml(lang)}</span>` : ''}` +
           `<code>${highlight(body, lang) || '<br>'}</code></pre>`;
  }
  if (t === 'table'){
    const model = parseTableModel(src), rows = model.rows, nc = rows[0].length;
    const alignOf = ci => {
      const v = model.align[ci] || '';
      return v ? ` style="text-align:${v}"` : '';
    };
    let html = '<table class="md-table"' + tableLayoutAttrs(model.layout, nc) + '>' +
               tableLayoutColgroup(model.layout, nc) + '<thead><tr>';
    rows[0].forEach((c, ci) => html += `<th${alignOf(ci)}>${inlineMD(c)}</th>`);
    html += '</tr></thead><tbody>';
    for (let r = 1; r < rows.length; r++){
      html += '<tr>';
      rows[r].forEach((c, ci) => html += `<td${alignOf(ci)}>${inlineMD(c) || '&nbsp;'}</td>`);
      html += '</tr>';
    }
    return html + '</tbody></table>';
  }
  /* 獨立成行的圖片 → <figure>(論文模式顯示「圖 N.: 說明」,一般主題僅置中) */
  const solo = src.match(/^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/) ||
               src.match(/^\s*<img\s[^>]*?alt\s*=\s*"([^"]*)"[^>]*>\s*$/i) ||
               (/^\s*<img\s[^>]*>\s*$/i.test(src) ? [src, ''] : null);
  if (solo){
    /* CP17:TW_THESIS 由使用者手寫「**圖 X.Y：**…」圖說(alt 多為檔名),故不自動用 alt 生成 figcaption */
    const twthesisMode = isTwThesisTheme();
    return `<figure class="md-fig">${inlineMD(src.trim())}` +
           (!twthesisMode && solo[1] ? `<figcaption>${escapeHtml(solo[1])}</figcaption>` : '') +
           `</figure>`;
  }
  if (isTwThesisTheme()){
    /* CP17:參考文獻條目「[N] 作者…」→ 掛錨點 id=twthesis-ref-N + 懸掛縮排,供 [[N]] 引用跳轉 */
    const rm = src.match(/^\s*\[(\d{1,3})\]\s+([\s\S]+)$/);
    if (rm)
      return `<p class="md-p twthesis-ref" id="twthesis-ref-${rm[1]}"><span class="twthesis-refnum">[${rm[1]}]</span> ${inlineMD(rm[2])}</p>`;
    /* CP17:圖/表圖說「**圖 X.Y：**…」/「**表 X.Y：**…」→ 置中圖說 + 收錄進圖目錄/表目錄 */
    const cm = src.match(/^\s*\*\*\s*(圖|表|Figure|Table)\s*([0-9A-Za-z]+(?:[.\-][0-9A-Za-z]+)*)\s*[：:]\s*\*\*\s*([\s\S]*)$/);
    if (cm){
      const kind = /圖|Figure/i.test(cm[1]) ? 'fig' : 'tab';
      const capSep = (isTwThesis2Theme() || isTwThesisEnglishTheme()) ? ': ' : '：';
      /* CP126:特殊圖／表說原本手工畫出粗體前綴，卻沒有消耗 inlineMD 的第一個
         data-si。styleRangesOf(raw) 仍把 **圖 X.X：** 視為第 0 個樣式 token，
         renderedPointToRaw 因找不到 [data-si=0] 而放棄自訂 cut；瀏覽器只暫時刪 DOM，
         下一次重繪又由未變的 blocks 還原，形成「剪下後自己跳回來」。現在前綴
         明確掛回第 0 個 data-si，並先遞增 styleSeq，後方說明內的樣式索引也同步對齊。 */
      const capSi = styleSeq++;
      return `<p class="md-p twthesis-cap twthesis-cap-${kind}" data-capkind="${kind}" data-capnum="${escapeHtml(cm[2])}">` +
             `<span class="twthesis-capnum" data-si="${capSi}">${escapeHtml(cm[1])} ${escapeHtml(cm[2])}${capSep}</span>` +
             `<span class="twthesis-captext">${inlineMD(cm[3])}</span></p>`;
    }
    /* CP95:摘要頁關鍵字「**關鍵字：**…」/「**Keywords:**…」→ 標 .twthesis-keywords；
       CSS 依範例論文分成左齊兩行，分頁器再把整塊置於版心底部。 */
    if (/^\s*\*\*\s*(關\s*鍵\s*字|關鍵詞|Key\s*words?)\s*[：:]/i.test(src)){
      const rest = src.replace(/^\s*\*\*\s*(?:關\s*鍵\s*字|關鍵詞|Key\s*words?)\s*[：:]\s*\*\*\s*/i, '');
      const count = rest.split(/[、,，;；]/).map(x => x.trim()).filter(Boolean).length;
      const invalid = count < 5 || count > 7;
      return `<p class="md-p twthesis-keywords${invalid ? ' twthesis-keywords-invalid' : ''}" data-keyword-count="${count}">${inlineMD(src)}</p>`;
    }
  }
  return `<p class="md-p${niClass}">${inlineMD(src)}</p>`;
}

/* ---------- 文件掛載 / 序列化 ---------- */
function mountDoc(md){
  if(typeof editContextInvalidateForMount==='function')editContextInvalidateForMount('mountDoc');
  const projected = typeof losslessProjectForMount === 'function'
    ? losslessProjectForMount(md, 'mountDoc')
    : String(md == null ? '' : md).replace(/^\ufeff/, '').replace(/\r\n?/g, '\n');
  blocks = splitToBlocks(projected);
  activeIndex = -1;
  editor.innerHTML = '';
  /* CP178: retain the 1.1.9.8 block boundaries without a whole-document string. */
  const frag = document.createDocumentFragment();
  blocks.forEach(src => {
    const el = document.createElement('div');
    el.className = 'block';
    el.innerHTML = renderBlockHTML(src);
    frag.appendChild(el);
  });
  editor.appendChild(frag);
  if (typeof decorateTwThesis === 'function') decorateTwThesis();   // CP17:標記附錄區塊(供字母章號)
  if (typeof losslessDecorateEditor === 'function') losslessDecorateEditor();
  listCompatApply();                                        // CP161:清單 heading／續行相容投影
}
function serialize(){
  if(window.__CP162D_ATOMIC_COMPAT__?.active)return blocks.join('\n');
  const arr = blocks.slice();
  if (activeIndex >= 0 && editor.children[activeIndex])
    arr[activeIndex] = getRawText(editor.children[activeIndex]);
  return arr.join('\n');
}
/* 從 DOM 讀回原始文字(<br>/巢狀 div 轉換為換行) */
function getRawText(el){
  let s = '';
  (function walk(n){
    for (const c of n.childNodes){
      if (c.nodeType === 3) s += c.data;
      else if (c.nodeName === 'BR') s += '\n';
      else {
        if (/^(DIV|P)$/.test(c.nodeName) && s && !s.endsWith('\n')) s += '\n';
        walk(c);
      }
    }
  })(el);
  return s.replace(/\u200b/g,'');
}
