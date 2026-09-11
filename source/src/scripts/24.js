
/* ============================================================================
 * cp171-57a-revtex-document-settings — 文件級 REVTeX 版面設定區塊
 *
 * 設計契約：
 *   1. Markdown 是每篇論文版面設定的唯一持久化權威；settings.revtex* 只是在
 *      當前文件／當前 REVTEX 工作階段中的執行期投影。
 *   2. 只有 CP171 國際期刊模式（settings.cp171.splitOpen）會讀寫本區塊；
 *      普通 Markdown、TW_THESIS 與 TW_THESIS-English 不解析、不補寫、不重設文件內容。
 *   3. 自動產生的區塊固定在文件最前端，語法為 ```revtex-settings。既有區塊
 *      優先讀取；不存在時，非空文件在進入／切入 REVTEX 時補上預設區塊；
 *      真正新建的空白文件延後到使用者第一次調整版面設定才寫入。
 *   4. 面板變更、偏好設定變更與手動編輯區塊都走同一份白名單、型別與 enum
 *      正規化；未知 extension 欄位保留，危險／未知 settings 鍵不執行。
 * ========================================================================== */
(() => {
'use strict';
const K = window.__CP171__;
if (!K) { console.error('[CP171] revtexDocumentSettings: 核心未就緒'); return; }

const MODULE_ID = 'revtexDocumentSettings';
const VERSION = '1.1.0';
const SCHEMA = 'ekdeta-html-revtex-settings/1';
const CANONICAL_LANG = 'revtex-settings';
const LANGS = Object.freeze(new Set([
  CANONICAL_LANG, 'revtex-layout', 'revtex-document-settings'
]));

const JOURNALS = Object.freeze({
  aps: Object.freeze(['prl','pra','prb','prc','prd','pre','prx','prapplied',
    'prmaterials','prfluids','prab','prper','rmp','physrev']),
  aip: Object.freeze(['jcp','apl','jap','pof','pop','rsi','cha','bmf','jmp','apm',
    'adv','sd','rse','cp','jor']),
  aapm: Object.freeze(['mph']),
  sor: Object.freeze(['jor'])
});

/* 這份順序同時是區塊的 canonical 輸出順序。預設值以首次安裝的產品基線為準；
   新面板才有的三態／官方選項則採面板既有預設。 */
const SPECS = Object.freeze([
  { key:'revtexSociety', type:'enum', values:['aps','aip','aapm','sor'], def:'aps' },
  { key:'revtexJournal', type:'journal', def:'prl' },
  { key:'revtexMode', type:'enum', values:['checkin','preprint','reprint','manuscript','galley','twocolumn'], def:'reprint' },
  { key:'revtexColumns', type:'enum', values:['auto','onecolumn','twocolumn'], def:'twocolumn' },
  { key:'revtexPaper', type:'enum', values:['letterpaper','a4paper','a5paper','b5paper','legalpaper','executivepaper'], def:'letterpaper' },
  { key:'revtexFontSize', type:'enum', values:['auto','10pt','11pt','12pt'], def:'auto' },
  { key:'revtexFont', type:'enum', values:['times','palatino','modern'], def:'times' },
  { key:'revtexEndfloats', type:'enum', values:['inline','endfloats','endfloats*'], def:'inline' },
  { key:'revtexFloats', type:'enum', values:['auto','floats','endfloats'], def:'auto' },
  { key:'revtexBottomAlign', type:'enum', values:['flushbottom','raggedbottom'], def:'flushbottom' },
  { key:'revtexBottom', type:'enum', values:['auto','raggedbottom','flushbottom'], def:'auto' },
  { key:'revtexSides', type:'enum', values:['auto','oneside','twoside'], def:'twoside' },
  { key:'revtexAddress', type:'enum', values:['groupedaddress','unsortedaddress','runinaddress','superscriptaddress'], def:'superscriptaddress' },
  { key:'revtexAltaffilStyle', type:'enum', values:['symbol','letter'], def:'symbol' },
  { key:'revtexTitlePage', type:'titlepage', def:'auto' },
  { key:'revtexPreprintNumbers', type:'bool', def:true },
  { key:'revtexShowPacs', type:'bool', def:false },
  { key:'revtexShowKeys', type:'bool', def:true },
  { key:'revtexCitation', type:'enum', values:['numerical','author-year'], def:'numerical' },
  { key:'revtexLongBibliography', type:'bool', def:true },
  { key:'revtexEprint', type:'bool', def:true },
  { key:'revtexBibnotes', type:'bool', def:false },
  { key:'revtexFootInBib', type:'bool', def:false },
  { key:'revtexBalanceLastPage', type:'bool', def:true },
  { key:'revtexTightenLines', type:'bool', def:false },
  { key:'revtexFloatFix', type:'bool', def:true },
  { key:'revtexFleqn', type:'bool', def:false },
  { key:'revtexEqSecNum', type:'bool', def:false },
  { key:'revtexSecNumArabic', type:'bool', def:false },
  { key:'revtexLineNumbers', type:'bool', def:false },
  { key:'revtexLengthCheck', type:'bool', def:false },
  { key:'revtexDraft', type:'bool', def:false },
  { key:'revtexLandscape', type:'bool', def:false },
  { key:'revtexAmsmath', type:'bool', def:true },
  { key:'revtexAmssymb', type:'bool', def:true },
  { key:'revtexHyperref', type:'bool', def:true },
  { key:'revtexLinkColor', type:'token', def:'blue' },
  { key:'revtexExtraOptions', type:'options', def:'' },
  { key:'texBooktabs', type:'bool', def:false },
  { key:'texListings', type:'bool', def:false }
]);
const SPEC_BY_KEY = Object.freeze(Object.fromEntries(SPECS.map(s => [s.key, s])));
const KEYS = Object.freeze(SPECS.map(s => s.key));
const KEY_SET = new Set(KEYS);
const DEFAULTS = Object.freeze(Object.fromEntries(SPECS.map(s => [s.key, s.def])));
const GLOBAL_BRIDGE_KEYS = Object.freeze(['texBooktabs','texListings']);
window.__CP171_REVTEX_DOCUMENT_SETTING_KEYS__ = KEYS;

let outsideGlobalValues = null;
let applying = false;
let writing = false;
let sourceTimer = null;
let runtimeTimer = null;
let pollTimer = null;
let lastFileId = '';
let lastRuntimeSignature = '';
let lastBlockSignature = '';
let lastUnknownLines = [];
let lastAdjustments = [];
let lastStatus = { state:'idle', reason:'startup', fileId:'', message:'' };

function intlActive(){
  try { return !!K.isIntlMode(); } catch (_) { return false; }
}
function ensureIntlSession(){
  if (!intlActive() || outsideGlobalValues) return outsideGlobalValues;
  outsideGlobalValues = {};
  for (const k of GLOBAL_BRIDGE_KEYS) {
    try { outsideGlobalValues[k] = settings[k]; } catch (_) { outsideGlobalValues[k] = DEFAULTS[k]; }
  }
  return outsideGlobalValues;
}
function persistentGlobalValues(){
  const out = {};
  for (const k of GLOBAL_BRIDGE_KEYS) {
    try { out[k] = outsideGlobalValues ? outsideGlobalValues[k] : settings[k]; }
    catch (_) { out[k] = DEFAULTS[k]; }
  }
  return out;
}
/* 在 REVTEX 工作階段中匯入完整備份／資料夾快照時，核心會載入真正的
   全域偏好。兩個與 LaTeX 套件共用的鍵目前正被文件投影暫借，因此必須把
   匯入值寫進 outsideGlobalValues，不能等離開模式時又還原成匯入前的舊值。 */
function acceptPersistentGlobalValues(raw){
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  if (!intlActive() || !outsideGlobalValues) return false;
  let changed = false;
  for (const k of GLOBAL_BRIDGE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
    const next = parseBoolean(raw[k], DEFAULTS[k]);
    if (outsideGlobalValues[k] !== next) { outsideGlobalValues[k] = next; changed = true; }
  }
  return changed;
}
function restoreOutsideGlobals(reason){
  if (!outsideGlobalValues) return false;
  const globals = Object.assign({}, outsideGlobalValues);
  applying = true;
  try {
    /* 文件級 REVTeX 值不得在離開模式後殘留成下一份文件或其他模式的
       隱性全域狀態；全部回到首次安裝預設，再還原真正屬於全域偏好的橋接鍵。 */
    for (const k of KEYS) settings[k] = DEFAULTS[k];
    for (const k of GLOBAL_BRIDGE_KEYS) settings[k] = globals[k];
    if (typeof revtexApplyThemeProfile === 'function') revtexApplyThemeProfile();
  } catch (_) {} finally { applying = false; }
  outsideGlobalValues = null;
  lastRuntimeSignature = ''; lastBlockSignature = ''; lastFileId = ''; lastUnknownLines = []; lastAdjustments = [];
  setStatus('outside-restored', reason || 'leave-intl', 'document settings reset; global LaTeX package preferences restored');
  setTimeout(() => { try { if (typeof persist === 'function') persist(); } catch (_) {} }, 0);
  return true;
}
function getActiveFile(){
  try { return typeof activeFile === 'function' ? activeFile() : null; } catch (_) { return null; }
}
function sourceModeOn(){
  try { return !!(typeof settings !== 'undefined' && settings && settings.srcmode); } catch (_) { return false; }
}
function currentText(){
  try {
    if (sourceModeOn() && typeof srcview !== 'undefined' && srcview) return String(srcview.value || '');
    if (typeof losslessActiveNormalized === 'function') return String(losslessActiveNormalized() || '');
    const f = getActiveFile(); return String(f && f.content || '');
  } catch (_) { return ''; }
}
function hash(text){
  const s = String(text == null ? '' : text);
  let h = 0x811c9dc5;
  for (let i=0;i<s.length;i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return ('00000000' + h.toString(16)).slice(-8);
}
function runtimeSnapshot(){
  const out = {};
  for (const k of KEYS) {
    try { out[k] = settings[k]; } catch (_) { out[k] = DEFAULTS[k]; }
  }
  return out;
}
function runtimeSignature(){ return hash(JSON.stringify(runtimeSnapshot())); }
function cloneDefaults(){ return Object.assign({}, DEFAULTS); }

/* REVTeX 的字級不是與排版模式無關的縮放倍率。官方 class 在 preprint
   執行 12pt，在 reprint 執行 10pt；若文件把 preprint 的明確 12pt 帶到
   AIP reprint 的 Letter 雙欄版面，aip4-2 會載入 12pt grid，實測可讓第一頁
   正文只剩約 9.6pt 的紙張下緣。auto 表示不輸出字級 option，由 class 依
   模式選擇相容 grid。 */
function effectiveTwoColumn(values){
  const v = values || {};
  const cols = String(v.revtexColumns || DEFAULTS.revtexColumns).toLowerCase();
  if (cols === 'onecolumn') return false;
  if (cols === 'twocolumn') return true;
  return String(v.revtexMode || DEFAULTS.revtexMode).toLowerCase() === 'reprint';
}
function compatibilityAdjustments(values){
  const v = values || {}, out = [];
  const society = String(v.revtexSociety || DEFAULTS.revtexSociety).toLowerCase();
  const mode = String(v.revtexMode || DEFAULTS.revtexMode).toLowerCase();
  const paper = String(v.revtexPaper || DEFAULTS.revtexPaper).toLowerCase();
  const size = String(v.revtexFontSize || DEFAULTS.revtexFontSize).toLowerCase();
  if (society === 'aip' && mode === 'reprint' && paper === 'letterpaper'
      && effectiveTwoColumn(v) && (size === '11pt' || size === '12pt')) {
    out.push({
      code:'aip-reprint-letter-two-column-large-type-grid',
      key:'revtexFontSize', from:size, to:'auto',
      message:'AIP reprint on Letter in two columns uses the official mode-selected 10pt grid.'
    });
    v.revtexFontSize = 'auto';
  }
  return out;
}

function parseBoolean(value, fallback){
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const s = String(value == null ? '' : value).trim().toLowerCase();
  if (['true','yes','on','1'].includes(s)) return true;
  if (['false','no','off','0'].includes(s)) return false;
  return !!fallback;
}
function unquote(value){
  const s = String(value == null ? '' : value).trim();
  if (s.length >= 2 && s[0] === '"' && s[s.length-1] === '"') {
    try { return JSON.parse(s); } catch (_) { return s.slice(1,-1); }
  }
  if (s.length >= 2 && s[0] === "'" && s[s.length-1] === "'") return s.slice(1,-1).replace(/''/g,"'");
  return s;
}
function normalizeOne(spec, value, context){
  const fallback = spec.def;
  if (spec.type === 'bool') return parseBoolean(value, fallback);
  if (spec.type === 'titlepage') {
    if (value === true) return 'on';
    if (value === false || value == null || value === '') return 'auto';
    const s = String(value).trim().toLowerCase();
    if (['on','true','titlepage','yes','1'].includes(s)) return 'on';
    if (['off','notitlepage','no','0'].includes(s)) return 'off';
    return 'auto';
  }
  if (spec.type === 'enum') {
    const s = String(value == null ? '' : value).trim().toLowerCase();
    return spec.values.includes(s) ? s : fallback;
  }
  if (spec.type === 'journal') {
    const soc = String(context.revtexSociety || DEFAULTS.revtexSociety);
    const list = JOURNALS[soc] || JOURNALS.aps;
    const s = String(value == null ? '' : value).trim().toLowerCase();
    return list.includes(s) ? s : list[0];
  }
  if (spec.type === 'options') {
    const list = String(value == null ? '' : value).split(',').map(x => x.trim().toLowerCase())
      .filter(x => /^[a-z][a-z0-9-]*$/.test(x));
    return [...new Set(list)].join(',');
  }
  if (spec.type === 'token') {
    const s = String(value == null ? '' : value).trim().toLowerCase();
    return /^[a-z][a-z0-9-]{0,31}$/.test(s) ? s : fallback;
  }
  return String(value == null ? fallback : value);
}

/**
 * 正規化目前執行期 settings。replace=true 時先回到安裝預設，再套 values；
 * replace=false 時只修正現值。這個函式不呼叫既有 normalizeRevtexSettings，
 * 因為舊函式把 revtexTitlePage 當 bool，會把 'auto'/'off' 都轉成 true。
 */
function normalizeRuntime(values, options){
  const opt = options || {};
  const replace = !!opt.replace;
  const base = replace ? cloneDefaults() : runtimeSnapshot();
  const incoming = values && typeof values === 'object' ? values : {};
  for (const k of KEYS) if (Object.prototype.hasOwnProperty.call(incoming, k)) base[k] = incoming[k];

  const normalized = {};
  for (const spec of SPECS) {
    const context = Object.assign({}, base, normalized);
    normalized[spec.key] = normalizeOne(spec, base[spec.key], context);
  }
  /* 學會必須先正規化，期刊再依該學會重算。 */
  normalized.revtexJournal = normalizeOne(SPEC_BY_KEY.revtexJournal, base.revtexJournal, normalized);

  /* 所有入口共用同一相容性收斂：面板、舊文件、手動設定區塊與 legacy
     normalizer 不得各自做不同判斷。這不是任意改稿，而是把已知互斥的
     mode/type-size 組合還原成 class 的官方模式預設。 */
  const adjustments = compatibilityAdjustments(normalized);

  /* 舊版曾分別使用 revtexFloats／revtexBottom；目前面板以可表達更多官方
     選項的 revtexEndfloats／revtexBottomAlign 為權威。讀到舊文件或舊偏好時
     做單向遷移，並把舊鍵收斂回 auto，避免同一份 documentclass 同時出現
     endfloats 與 endfloats*、或 flushbottom 與 raggedbottom 的互斥組合。 */
  if (normalized.revtexEndfloats === 'inline') {
    if (normalized.revtexFloats === 'endfloats') normalized.revtexEndfloats = 'endfloats';
    normalized.revtexFloats = 'auto';
  } else normalized.revtexFloats = 'auto';
  if (normalized.revtexBottomAlign === 'flushbottom' && normalized.revtexBottom === 'raggedbottom')
    normalized.revtexBottomAlign = 'raggedbottom';
  normalized.revtexBottom = 'auto';

  let changed = false;
  applying = true;
  try {
    for (const k of KEYS) {
      if (settings[k] !== normalized[k]) { settings[k] = normalized[k]; changed = true; }
    }
    if (typeof revtexApplyThemeProfile === 'function') revtexApplyThemeProfile();
  } catch (e) {
    K.log.error(MODULE_ID, '正規化執行期設定失敗：' + (e && e.message || e));
  } finally { applying = false; }
  lastRuntimeSignature = runtimeSignature();
  lastAdjustments = adjustments.map(x => Object.assign({}, x));
  return { changed, values:normalized, adjustments:lastAdjustments.slice() };
}
function resetRuntime(){ return normalizeRuntime(DEFAULTS, { replace:true, reason:'reset' }); }

function lineTable(text){
  const s = String(text == null ? '' : text);
  const out = [];
  let start = 0;
  while (start <= s.length) {
    const nl = s.indexOf('\n', start);
    if (nl < 0) { out.push({ start, end:s.length, fullEnd:s.length, text:s.slice(start) }); break; }
    const end = nl > start && s[nl-1] === '\r' ? nl-1 : nl;
    out.push({ start, end, fullEnd:nl+1, text:s.slice(start,end) });
    start = nl + 1;
    if (start === s.length) { out.push({ start, end:start, fullEnd:start, text:'' }); break; }
  }
  return out;
}
function findBlocks(text){
  const s = String(text == null ? '' : text), lines = lineTable(s), out = [];
  for (let i=0;i<lines.length;i++) {
    let line = lines[i].text;
    if (i === 0) line = line.replace(/^\uFEFF/, '');
    const m = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*(revtex-settings|revtex-layout|revtex-document-settings)[ \t]*$/i);
    if (!m) continue;
    const marker = m[1], ch = marker[0], need = marker.length;
    let close = -1;
    for (let j=i+1;j<lines.length;j++) {
      const q = lines[j].text.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
      if (q && q[1][0] === ch && q[1].length >= need) { close = j; break; }
    }
    const start = lines[i].start;
    if (close < 0) {
      out.push({ start, end:s.length, bodyStart:lines[i].fullEnd, bodyEnd:s.length,
        body:s.slice(lines[i].fullEnd), lang:m[2].toLowerCase(), complete:false, top:/^[\uFEFF\s]*$/.test(s.slice(0,start)) });
      break;
    }
    const end = lines[close].fullEnd;
    out.push({ start, end, bodyStart:lines[i].fullEnd, bodyEnd:lines[close].start,
      body:s.slice(lines[i].fullEnd, lines[close].start).replace(/\r?\n$/, ''),
      lang:m[2].toLowerCase(), complete:true, top:/^[\uFEFF\s]*$/.test(s.slice(0,start)) });
    i = close;
  }
  return out;
}
function parseBody(body){
  const values = {}, unknown = [], errors = [];
  let schema = '';
  for (const raw of String(body == null ? '' : body).split(/\r?\n/)) {
    const trim = raw.trim();
    if (!trim || trim.startsWith('#')) { if (trim.startsWith('#')) unknown.push(raw); continue; }
    const m = raw.match(/^\s*([A-Za-z][A-Za-z0-9_.-]*)\s*:\s*(.*?)\s*$/);
    if (!m) { unknown.push(raw); continue; }
    const key = m[1], value = unquote(m[2]);
    if (key === 'schema') { schema = String(value); continue; }
    if (!KEY_SET.has(key)) { unknown.push(raw); continue; }
    if (['__proto__','prototype','constructor'].includes(key)) { errors.push('forbidden key ' + key); continue; }
    values[key] = value;
  }
  const major = schema.match(/^ekdeta-html-revtex-settings\/(\d+)$/) || schema.match(/^(\d+)$/);
  const supported = !schema || (major && major[1] === '1');
  if (!supported) errors.push('unsupported schema: ' + schema);
  return { values, unknown, schema:schema || SCHEMA, supported:!!supported, valid:!!supported && !errors.length, errors };
}
function parseDocument(text){
  const blocks = findBlocks(text), complete = blocks.filter(b => b.complete), incomplete = blocks.find(b => !b.complete) || null;
  let selected = null, parsed = null;
  for (const b of complete) {
    const p = parseBody(b.body);
    if (!selected || p.valid) { selected = b; parsed = p; }
    if (p.valid) break;
  }
  return { blocks, complete, incomplete, selected, parsed };
}
function mergedUnknownLines(doc){
  const out = [], seen = new Set();
  for (const b of (doc && doc.complete) || []) {
    const p = parseBody(b.body);
    for (const line of p.unknown) {
      const sig = String(line == null ? '' : line);
      if (!seen.has(sig)) { seen.add(sig); out.push(line); }
    }
  }
  return out;
}
function scalarOut(value){
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  const s = String(value == null ? '' : value);
  if (s && /^[A-Za-z0-9._*,-]+$/.test(s)) return s;
  return JSON.stringify(s);
}
function serializeBlock(values, unknown){
  const v = Object.assign(cloneDefaults(), values || {}), lines = [];
  lines.push('```' + CANONICAL_LANG);
  lines.push('schema: ' + SCHEMA);
  lines.push('# Managed by the REVTEX layout settings panel; editable in Markdown.');
  lines.push('# 僅在「國際期刊 REVTEX」模式讀取；其他模式不會解析或改寫。');
  for (const k of KEYS) lines.push(k + ': ' + scalarOut(v[k]));
  const ext = (unknown || []).filter(x => {
    const t = String(x || '').trim();
    return t && !/^#\s*(?:Managed by|僅在|Preserved extension fields)/.test(t);
  });
  if (ext.length) {
    lines.push('# Preserved extension fields');
    lines.push(...ext);
  }
  lines.push('```');
  return lines.join('\n');
}
function removeSpans(text, spans){
  let out = String(text == null ? '' : text);
  for (const b of spans.slice().sort((a,b) => b.start-a.start)) {
    let a = b.start, z = b.end;
    /* 區塊本身與正文之間的空行由 prependCanonical() 統一建立。 */
    while (z < out.length && out[z] === '\n' && out[z+1] === '\n') z++;
    out = out.slice(0,a) + out.slice(z);
  }
  return out;
}
function prependCanonical(text, block){
  let s = String(text == null ? '' : text), bom = '';
  if (s.startsWith('\uFEFF')) { bom='\uFEFF'; s=s.slice(1); }
  s = s.replace(/^(?:[ \t]*\r?\n)+/, '');
  return bom + block + (s ? '\n\n' + s : '\n');
}
function canonicalText(text, values, unknown){
  const parsed = parseDocument(text);
  const without = removeSpans(text, parsed.complete);
  return prependCanonical(without, serializeBlock(values, unknown));
}
function mapOffset(oldText, newText, offset){
  const a = String(oldText), b = String(newText), off = Math.max(0, Math.min(a.length, Number(offset)||0));
  let pre = 0;
  while (pre < a.length && pre < b.length && a.charCodeAt(pre) === b.charCodeAt(pre)) pre++;
  let suf = 0;
  while (suf < a.length-pre && suf < b.length-pre && a.charCodeAt(a.length-1-suf) === b.charCodeAt(b.length-1-suf)) suf++;
  if (off <= pre) return off;
  if (off >= a.length-suf) return Math.max(0, b.length-(a.length-off));
  return Math.min(b.length-suf, pre + Math.max(0, off-pre));
}
function writeActiveText(next, reason){
  const f = getActiveFile();
  if (!f || writing) return false;
  const old = currentText();
  if (old === next) return false;
  writing = true;
  try {
    if (sourceModeOn() && typeof srcview !== 'undefined' && srcview) {
      const start = srcview.selectionStart, end = srcview.selectionEnd, dir = srcview.selectionDirection || 'none';
      srcview.value = next;
      if (typeof losslessSyncActiveText === 'function') losslessSyncActiveText(next, reason || 'revtex-document-settings');
      else f.content = next;
      try { srcview.setSelectionRange(mapOffset(old,next,start), mapOffset(old,next,end), dir); } catch (_) {}
      try { if (typeof srcRenderDecorations === 'function') srcRenderDecorations(); } catch (_) {}
      try { if (typeof srcTrackLayout === 'function') srcTrackLayout(120); } catch (_) {}
    } else {
      if (typeof losslessSyncActiveText === 'function') losslessSyncActiveText(next, reason || 'revtex-document-settings');
      else f.content = next;
      if (typeof mountDoc === 'function') mountDoc(next);
    }
    try { if (typeof onEdited === 'function') onEdited(); else if (typeof markDirty === 'function') markDirty(); } catch (_) {}
    try { if (typeof updateCounts === 'function') updateCounts(); } catch (_) {}
    try { if (typeof renderSidebar === 'function') renderSidebar(); } catch (_) {}
    try { if (typeof persist === 'function') persist(); } catch (_) {}
    try { const O=K.need('orch'); if (O && O.touch) O.touch(); } catch (_) {}
    return true;
  } catch (e) {
    K.log.error(MODULE_ID, '寫入文件設定區塊失敗：' + (e && e.message || e));
    return false;
  } finally { writing = false; }
}
function setStatus(state, reason, message){
  const f = getActiveFile();
  lastStatus = { state, reason:String(reason||''), fileId:String(f&&f.id||''), message:String(message||'') };
  K.emit('document-settings:status', Object.assign({}, lastStatus));
}
function syncPanel(){
  try { const S=K.need('revtexSettings'); if (S && S.sync) S.sync(); } catch (_) {}
}

function activateActive(options){
  const opt = options || {}, reason = opt.reason || 'activate';
  if (!intlActive()) { setStatus('skipped', reason, 'not in REVTEX mode'); return { state:'skipped' }; }
  ensureIntlSession();
  const f = getActiveFile();
  if (!f) { setStatus('no-file', reason, 'no active file'); return { state:'no-file' }; }
  const text = currentText(), doc = parseDocument(text);
  resetRuntime();

  if (doc.selected && doc.parsed) {
    if (!doc.parsed.valid) {
      lastUnknownLines = mergedUnknownLines(doc);
      lastBlockSignature = hash(doc.selected.body);
      lastFileId = String(f.id);
      lastRuntimeSignature = runtimeSignature();
      syncPanel();
      setStatus('invalid', reason, doc.parsed.errors.join('; '));
      K.log.warn(MODULE_ID, '文件設定區塊無效，已安全退回安裝預設：' + doc.parsed.errors.join('; '));
      return { state:'invalid', errors:doc.parsed.errors.slice() };
    }
    const applied = normalizeRuntime(doc.parsed.values, { replace:true, reason:'document-block' });
    lastUnknownLines = mergedUnknownLines(doc);
    lastBlockSignature = hash(doc.selected.body);
    const canonical = serializeBlock(applied.values, lastUnknownLines);
    const currentBlock = text.slice(doc.selected.start, doc.selected.end).replace(/\r\n?/g, '\n').trimEnd();
    const needsCanonical = !doc.incomplete && (doc.complete.length !== 1 || !doc.selected.top
      || doc.selected.lang !== CANONICAL_LANG || currentBlock !== canonical.trimEnd());
    if (needsCanonical) {
      const next = canonicalText(text, applied.values, lastUnknownLines);
      writeActiveText(next, 'revtex-settings-consolidate');
      const reread = parseDocument(next);
      lastBlockSignature = reread.selected ? hash(reread.selected.body) : '';
    }
    lastFileId = String(f.id);
    lastRuntimeSignature = runtimeSignature();
    syncPanel();
    const adjusted = !!(applied.adjustments && applied.adjustments.length);
    setStatus(adjusted ? 'loaded-normalized' : 'loaded', reason,
      adjusted ? 'loaded and normalized to a mode-compatible type-size grid'
               : (needsCanonical ? 'loaded and canonicalized' : 'loaded'));
    return { state:adjusted ? 'loaded-normalized' : 'loaded', values:applied.values,
      canonicalized:needsCanonical, adjustments:(applied.adjustments || []).slice() };
  }

  if (doc.incomplete) {
    lastFileId = String(f.id); lastRuntimeSignature = runtimeSignature();
    lastBlockSignature = hash(doc.incomplete.body); lastUnknownLines = [];
    syncPanel(); setStatus('incomplete', reason, 'incomplete fence; preserved while editing');
    return { state:'incomplete' };
  }

  const nonEmpty = text.replace(/^\uFEFF/, '').trim().length > 0;
  if (nonEmpty && opt.ensureMissing !== false) {
    const values = runtimeSnapshot(), next = canonicalText(text, values, []);
    writeActiveText(next, 'revtex-settings-auto-insert');
    const reread = parseDocument(next);
    lastBlockSignature = reread.selected ? hash(reread.selected.body) : '';
    lastUnknownLines = [];
    lastFileId = String(f.id); lastRuntimeSignature = runtimeSignature();
    syncPanel(); setStatus('inserted', reason, 'default block inserted for non-empty document');
    return { state:'inserted', values };
  }

  /* 真正的新空白檔：只套安裝預設，不寫入；第一次調整設定才建立區塊。 */
  lastUnknownLines = []; lastBlockSignature = ''; lastFileId = String(f.id);
  lastRuntimeSignature = runtimeSignature(); syncPanel();
  setStatus('blank-defaults', reason, 'blank file; block deferred until first setting change');
  return { state:'blank-defaults', values:runtimeSnapshot() };
}

function syncRuntimeToDocument(reason){
  if (!intlActive() || applying || writing) return { state:'skipped' };
  ensureIntlSession();
  const f = getActiveFile(); if (!f) return { state:'no-file' };
  const normalized = normalizeRuntime(null, { replace:false, reason:'runtime-change' });
  const text = currentText(), doc = parseDocument(text);
  if (doc.incomplete) {
    setStatus('incomplete', reason || 'runtime', 'incomplete fence; runtime change held until block is complete');
    return { state:'incomplete', changed:false, values:normalized.values };
  }
  let unknown = lastUnknownLines;
  if (doc.selected && doc.parsed && doc.parsed.valid) unknown = mergedUnknownLines(doc);
  const next = canonicalText(text, normalized.values, unknown);
  const changed = writeActiveText(next, 'revtex-settings-' + String(reason || 'runtime'));
  const reread = parseDocument(changed ? next : text);
  lastBlockSignature = reread.selected ? hash(reread.selected.body) : '';
  lastUnknownLines = unknown.slice(); lastFileId = String(f.id);
  lastRuntimeSignature = runtimeSignature(); syncPanel();
  const adjusted = !!(normalized.adjustments && normalized.adjustments.length);
  setStatus(adjusted ? 'updated-normalized' : (changed ? 'updated' : 'current'), reason || 'runtime',
    adjusted ? 'document block synchronized with a mode-compatible type-size grid'
             : (changed ? 'document block synchronized' : 'already synchronized'));
  return { state:adjusted ? 'updated-normalized' : (changed ? 'updated' : 'current'),
    changed, values:normalized.values, adjustments:(normalized.adjustments || []).slice() };
}
function runtimeChanged(reason){
  if (!intlActive() || applying || writing) return false;
  clearTimeout(runtimeTimer);
  runtimeTimer = setTimeout(() => { runtimeTimer=null; syncRuntimeToDocument(reason || 'runtime-change'); }, 0);
  return true;
}
/* 切檔是同步交易：若面板的 0ms 合併計時器尚未落盤，必須先把目前文件
   的執行期投影寫回自己的 Markdown，否則舊論文的選項可能在切換後落到
   新論文。核心 switchFile() 只呼叫這個公開 flush，不複製序列化邏輯。 */
function flushRuntime(reason){
  const why = reason || 'before-file-switch';
  let manual = null;
  /* 原始碼輸入的 220ms debounce 也屬於切檔交易。先讀完尚未處理的區塊編輯，
     尤其是「刪除整個區塊」；否則切檔速度快於 debounce 時會把刪除狀態落盤。 */
  if (sourceTimer) {
    clearTimeout(sourceTimer); sourceTimer = null;
    manual = applyManualBlock(currentText(), why + '-manual');
  }
  const pendingRuntime = !!runtimeTimer;
  if (runtimeTimer) { clearTimeout(runtimeTimer); runtimeTimer = null; }
  /* 沒有待寫的版面變更就不要重寫文件。這也保護未支援 schema／編輯中的
     半成品區塊，避免單純切檔把它們誤轉成預設 canonical 區塊。 */
  if (!pendingRuntime) return manual || { state:'current', changed:false };
  return syncRuntimeToDocument(why);
}
function applyManualBlock(text, reason){
  if (!intlActive() || writing) return;
  const doc = parseDocument(text);
  if (doc.incomplete && !doc.selected) { setStatus('incomplete', reason, 'incomplete fence; waiting'); return; }
  if (!doc.selected) {
    const nonEmpty = String(text || '').replace(/^\uFEFF/, '').trim().length > 0;
    const hadManagedBlock = !!lastBlockSignature;
    /* 使用者手動刪除完整區塊時，版面面板仍代表當前文件的執行期狀態。
       即使這篇文件除了控制區塊外尚無正文，也已經不是「從未設定過的空白
       新檔」；立即以目前設定重建，避免刪除動作悄悄把版面退回預設。 */
    if (nonEmpty || hadManagedBlock) return syncRuntimeToDocument('block-removed');
    resetRuntime(); lastUnknownLines=[]; lastBlockSignature=''; lastRuntimeSignature=runtimeSignature();
    syncPanel(); setStatus('removed-blank', reason, 'blank file; defaults active and block remains deferred');
    try { const O=K.need('orch'); if (O&&O.touch) O.touch(); } catch (_) {}
    return;
  }
  const sig = hash(doc.selected.body);
  if (sig === lastBlockSignature) return;
  if (!doc.parsed || !doc.parsed.valid) {
    setStatus('invalid', reason, doc.parsed ? doc.parsed.errors.join('; ') : 'parse failed');
    return; // 編輯到一半時不以半成品重設執行期設定
  }
  const applied = normalizeRuntime(doc.parsed.values, { replace:true, reason:'manual-block' });
  lastUnknownLines=mergedUnknownLines(doc); lastBlockSignature=sig;
  lastRuntimeSignature=runtimeSignature(); syncPanel();
  if (applied.adjustments && applied.adjustments.length) {
    /* 完整 fence 輸入完成後才 canonicalize，避免使用者打字到一半被中斷。 */
    setStatus('manual-normalized', reason, 'manual block normalized to a mode-compatible type-size grid');
    setTimeout(() => { try { syncRuntimeToDocument('compatibility-normalization'); } catch (_) {} }, 0);
  } else setStatus('manual-loaded', reason, 'manual block edit applied');
  try { const O=K.need('orch'); if (O&&O.touch) O.touch(); } catch (_) {}
  return applied;
}
function scheduleManualRead(reason){
  if (!intlActive() || writing) return;
  clearTimeout(sourceTimer);
  sourceTimer = setTimeout(() => {
    sourceTimer=null;
    try { applyManualBlock(currentText(), reason || 'editor-input'); } catch (_) {}
  }, 220);
}
function onSourceInput(){
  if (!sourceModeOn()) return;
  scheduleManualRead('source-input');
}
function onEditorInput(){
  if (sourceModeOn()) return;
  scheduleManualRead('editor-input');
}
function poll(){
  if (!intlActive() || applying || writing) return;
  const f = getActiveFile(); if (!f) return;
  if (String(f.id) !== lastFileId) { activateActive({ reason:'poll-file-change', ensureMissing:true }); return; }
  const sig = runtimeSignature();
  if (lastRuntimeSignature && sig !== lastRuntimeSignature) runtimeChanged('runtime-poll');
}
function installListeners(){
  try {
    if (typeof srcview !== 'undefined' && srcview && !srcview.dataset.cp171RevtexDocumentSettings) {
      srcview.dataset.cp171RevtexDocumentSettings='1';
      srcview.addEventListener('input', onSourceInput);
    }
    if (typeof editor !== 'undefined' && editor && !editor.dataset.cp171RevtexDocumentSettings) {
      editor.dataset.cp171RevtexDocumentSettings='1';
      editor.addEventListener('input', onEditorInput);
    }
  } catch (_) {}
  K.on('flag', ev => {
    if (!ev || ev.key !== 'splitOpen') return;
    if (ev.value) ensureIntlSession();
    else restoreOutsideGlobals('leave-intl');
  });
  K.on('enterIntlMode', () => setTimeout(() => activateActive({ reason:'enter-intl', ensureMissing:true }), 0));
  K.on('split:mount', () => setTimeout(() => activateActive({ reason:'split-mount', ensureMissing:true }), 0));
  K.on('settings:open', () => activateActive({ reason:'settings-open', ensureMissing:true }));
  pollTimer = setInterval(poll, 300);
}

const API = Object.freeze({
  version:VERSION, schema:SCHEMA, language:CANONICAL_LANG,
  keys:() => KEYS.slice(), defaults:() => cloneDefaults(),
  findBlocks, parseBody, parseDocument, serializeBlock,
  effectiveTwoColumn, compatibilityAdjustments, normalizeRuntime, resetRuntime, activateActive,
  runtimeChanged, flushRuntime, syncRuntimeToDocument,
  persistentGlobalValues, acceptPersistentGlobalValues, restoreOutsideGlobals,
  isApplying:() => applying,
  status:() => Object.assign({}, lastStatus),
  diagnostics:() => ({ version:VERSION, schema:SCHEMA, active:intlActive(), fileId:lastFileId,
    runtimeSignature:lastRuntimeSignature, blockSignature:lastBlockSignature,
    outsideGlobalValues:outsideGlobalValues ? Object.assign({},outsideGlobalValues) : null,
    unknownLines:lastUnknownLines.slice(), adjustments:lastAdjustments.map(x => Object.assign({},x)),
    status:Object.assign({},lastStatus) })
});
K.register(MODULE_ID, API);
installListeners();
K.log.info(MODULE_ID, '文件級 REVTeX 版面設定就緒（' + KEYS.length + ' 個白名單欄位）');
})();
