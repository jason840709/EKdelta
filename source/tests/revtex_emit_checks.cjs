#!/usr/bin/env node
/* 國際論文模式（Markdown → REVTeX 4.2）的純 node 檢查，不需要 pdflatex。
 *
 * 用法：node tests/revtex_emit_checks.cjs [--src src/scripts] [--only ID,ID] [--verbose]
 *
 * 做什麼：把真正的 15.js（核心）、17.js（解析器）、18.js（發射器）載入 node vm，
 * 對 tests/revtex_cases.cjs 的每個案例各發射「預覽版」與「投稿版」，檢查：
 *   1. 案例指定的 main.tex 內容（tex／notex）
 *   2. 共通規則：不得出現 \verb；大括號與環境成對（verbatim 內容不算）；pdflatex 版
 *      不得殘留 pdfLaTeX 吃不下的 Unicode；出口自檢沒有問題
 *   3. 投稿版不得含 APS 作者指南不允許的寫法（\sbox \newif \ifdim \IfFileExists
 *      \resizebox \minipage \parbox \fbox \newlength \rule …）
 *   4. 左右一致：標了 left:'same' 的案例，左邊編輯器（01.js inlineMD，原樣執行）
 *      與解析器（17.js parseInline）認定的數學、行內程式碼、強調必須相同
 *   5. 內建 REVTeX 模板與單一入口（mainTex）的基本性質
 * 全部通過回傳 0，否則 1。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { cases } = require('./revtex_cases.cjs');

const args = process.argv.slice(2);
const argVal = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const SRC = path.resolve(argVal('--src') || path.join(__dirname, '..', 'src', 'scripts'));
const ONLY = (argVal('--only') || '').split(',').filter(Boolean);
const VERBOSE = args.includes('--verbose');
const FM_INLINE = '```revtex-frontmatter\ntitle: T\nauthor: A\naffiliation: X\n```\n\n```revtex-abstract\nAbs.\n```\n\n';
const BASE = { revtexSociety: 'aps', revtexJournal: 'prl', revtexMode: 'reprint', revtexColumns: 'twocolumn',
  revtexPaper: 'letterpaper', revtexFontSize: 'auto', revtexAddress: 'superscriptaddress',
  revtexCitation: 'numerical', revtexHyperref: true, revtexFootInBib: false, lang: 'zh-TW' };

function loadPipeline(src){
  const win = {};
  const noop = () => {};
  const ctx = { console: { log: noop, info: noop, warn: noop, error: noop }, setTimeout, clearTimeout, URL, TextEncoder,
    document: { getElementById: () => null, querySelectorAll: () => [], createElement: () => ({}), body: { appendChild: noop } } };
  ctx.window = win; win.document = ctx.document;
  vm.createContext(ctx);
  for (const f of ['15.js', '17.js', '18.js']) vm.runInContext(fs.readFileSync(path.join(src, f), 'utf8'), ctx, { filename: f });
  const K = win.__CP171__;
  const P = K.need('parser'), E = K.need('emit');
  const emit = (md, s, purpose) => (E.mainTex
    ? E.mainTex(md, { settings: Object.assign({}, BASE, s || {}), purpose })
    : E.emit(P.parse(md), { settings: Object.assign({}, BASE, s || {}) }));
  return { K, P, E, emit };
}
/* 左邊編輯器的行內渲染器：從 01.js／02.js 切出原樣執行，KaTeX 換成標記
   （⟦M:…⟧ 行內、⟦D:…⟧ 展示），看得出左邊把哪一段當成數學。 */
function loadLeft(src){
  const between = (s, a, b) => { const i = s.indexOf(a); if (i < 0) throw new Error('找不到：' + a); const j = s.indexOf(b, i + a.length); if (j < 0) throw new Error('找不到：' + b); return s.slice(i, j); };
  const s01 = fs.readFileSync(path.join(src, '01.js'), 'utf8');
  const s02 = fs.readFileSync(path.join(src, '02.js'), 'utf8');
  const code = [
    between(s01, 'const escapeHtml = s =>', '/* ---------- CP14'),
    between(s01, 'function mdMetaThemeEligible(theme){', '/* PDF 疊繪用'),
    between(s01, 'const HTML_TAGS = {', '/* §2b Math rendering'),
    between(s01, 'const CP176_MATH_CACHE = new Map();', '/* 找出原始字串中「行內公式」'),
    between(s01, 'function mathRangesOf(raw){', '/* 找出原始字串中「行內樣式」'),
    s02.includes('function tableMathSpanEnd(') ? between(s02, 'function tableMathSpanEnd(', 'const TABLE_LAYOUT_MARK')
                                                : between(s02, 'function splitTableRow(line){', 'const TABLE_LAYOUT_MARK'),
  ].join('\n');
  const ctx = { console, settings: { theme: 'revtex', mdMetaPilot: false },
    katex: { renderToString: (t, o) => '⟦' + (o && o.displayMode ? 'D' : 'M') + ':' + t + '⟧' },
    isTwThesisTheme: () => false, citeLink: n => n };
  vm.createContext(ctx);
  vm.runInContext(code + '\nthis.inlineMD=inlineMD;this.mathRangesOf=mathRangesOf;this.splitTableRow=splitTableRow;', ctx, { filename: 'editor-left' });
  return { inline: md => ctx.inlineMD(md), mathRanges: md => ctx.mathRangesOf(md), splitRow: l => ctx.splitTableRow(l) };
}
const unesc = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
function leftDigest(html){
  /* 左邊在找數學前先把 \$ 換成字面 $（01.js），這裡把兩邊都正規化成 $ 再比。 */
  const math = [...html.matchAll(/⟦[MD]:([\s\S]*?)⟧/g)].map(m => unesc(m[1]).trim().replace(/\\\$/g, '$'));
  /* CommonMark 會去掉程式碼頭尾各一個空白（`` ` `` → `），左邊畫面保留空白；兩邊都 trim 再比。 */
  const code = [...html.matchAll(/<code[^>]*>([\s\S]*?)<\/code>/g)].map(m => unesc(m[1]).trim());
  const count = re => (html.match(re) || []).length;
  return { math, code, em: count(/<em[\s>]/g), strong: count(/<strong[\s>]/g), del: count(/<del[\s>]/g), mark: count(/<mark[\s>]/g) };
}
function rightDigest(P, md){
  const d = { math: [], code: [], em: 0, strong: 0, del: 0, mark: 0 };
  const walk = ns => { for (const n of ns || []) {
    if (n.type === 'math_inline' || n.type === 'math_display') d.math.push(String(n.tex).trim().replace(/\\\$/g, '$'));
    if (n.type === 'code_inline') d.code.push(String(n.value).trim());
    if (n.type === 'emph') d.em++;
    if (n.type === 'strong') d.strong++;
    if (n.type === 'strike') d.del++;
    if (n.type === 'highlight') d.mark++;
    if (n.children) walk(n.children);
  } };
  walk(P.parseInline(md));
  return d;
}

const FORBIDDEN_APS = /\\(?:sbox|newsavebox|usebox|savebox|newif|ifdim|IfFileExists|resizebox|parbox|fbox|framebox|raisebox|newlength|setlength|rule|hrule|cptimg|cptmissing)\b|\\begin\{minipage\}/;
const PDFLATEX_OK = /^[ -ſ‐‑‒―†‡•‰←↑→↓℃№™Ω]$/;

function texHas(tex, pat){ return pat instanceof RegExp ? pat.test(tex) : tex.includes(pat); }
function stripVerbatim(tex){
  /* verbatim 內容與 TeX 註解（% 之後到行尾，\% 不算）不參與檢查：註解裡的中文不影響編譯。 */
  return tex.replace(/\\begin\{(verbatim|lstlisting)\}[\s\S]*?\\end\{\1\}/g, '')
            .replace(/^\\(?:email|homepage)\{.*$/gm, '')      // REVTeX 的 \email 自己處理 % _ ~
            .replace(/(^|[^\\])%.*$/gm, '$1');
}
function structural(tex, engine){
  const probs = [];
  const body = stripVerbatim(tex);
  if (/\\verb[^a-zA-Z]/.test(body)) probs.push('含 \\verb');
  const opens = {}; for (const m of body.matchAll(/\\(begin|end)\{([A-Za-z*]+)\}/g)) opens[m[2]] = (opens[m[2]] || 0) + (m[1] === 'begin' ? 1 : -1);
  for (const [k, v] of Object.entries(opens)) if (v) probs.push('環境不成對 ' + k + ' ' + v);
  let depth = 0; for (const ch of body.replace(/\\[{}]/g, '')) { if (ch === '{') depth++; else if (ch === '}') depth--; if (depth < 0) break; }
  if (depth) probs.push('大括號不成對 ' + depth);
  if (engine === 'pdflatex') {
    const bad = [...new Set([...body].filter(c => c.codePointAt(0) > 0x7F && !PDFLATEX_OK.test(c)))];
    if (bad.length) probs.push('殘留 pdfLaTeX 吃不下的字元：' + bad.join(''));
  }
  return probs;
}

function run(){
  const R = loadPipeline(SRC);
  let L = null;
  try { L = loadLeft(SRC); } catch (e) { console.log('（略過左右一致檢查：' + e.message + '）'); }
  const fails = [];
  let n = 0;
  for (const c of cases) {
    if (ONLY.length && !ONLY.includes(c.id)) continue;
    n++;
    const f = [];
    let pv, sb;
    try { pv = R.emit(c.md, c.settings, 'preview'); } catch (e) { f.push('預覽版例外：' + e.message); }
    try { sb = R.emit(c.md, c.settings, 'submission'); } catch (e) { f.push('投稿版例外：' + e.message); }
    if (pv) {
      for (const p of [].concat(c.tex || [])) if (!texHas(pv.tex, p)) f.push('缺少：' + String(p).slice(0, 80));
      for (const p of [].concat(c.notex || [])) if (texHas(pv.tex, p)) f.push('不該有：' + String(p).slice(0, 80));
      for (const p of structural(pv.tex, pv.engine)) f.push('預覽版 ' + p);
    }
    if (sb && sb.engine === 'pdflatex') {
      for (const p of structural(sb.tex, sb.engine)) f.push('投稿版 ' + p);
      const body = stripVerbatim(sb.tex).replace(/% CP171-REVTEX-CONTINUOUS-FRONTMATTER-BEGIN[\s\S]*?% CP171-REVTEX-CONTINUOUS-FRONTMATTER-END/, '');
      const m = body.match(FORBIDDEN_APS);
      if (m) f.push('投稿版含 APS 不允許的寫法：' + m[0]);
    }
    if (c.left === 'same' && L) {
      try {
        const ld = leftDigest(L.inline(c.md)), rd = rightDigest(R.P, c.md);
        for (const k of ['math', 'code']) if (JSON.stringify(ld[k]) !== JSON.stringify(rd[k])) f.push('左右不一致（' + k + '）左=' + JSON.stringify(ld[k]) + ' 右=' + JSON.stringify(rd[k]));
        for (const k of ['em', 'strong', 'del', 'mark']) if (ld[k] !== rd[k]) f.push('左右不一致（' + k + '）左=' + ld[k] + ' 右=' + rd[k]);
      } catch (e) { f.push('左右比對例外：' + e.message); }
    }
    /* 表格切欄：左邊 splitTableRow（02.js）與解析器 splitRow（17.js）必須切成一樣的格子。 */
    if (L && R.P.splitRow && /^(T\d|N04|N38|CT01)/.test(c.id)) {
      for (const line of c.md.split('\n')) {
        if (!line.includes('|') || /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line)) continue;
        const lc = Array.from(L.splitRow(line)), rc = R.P.splitRow(line).map(x => x.replace(/\\\\/g, '\\'));
        if (JSON.stringify(lc) !== JSON.stringify(rc)) f.push('表格切欄左右不一致：' + JSON.stringify(line) + ' 左=' + JSON.stringify(lc) + ' 右=' + JSON.stringify(rc));
      }
    }
    if (f.length) fails.push({ id: c.id, f });
    if (VERBOSE && pv) console.log('== ' + c.id + '\n' + pv.tex.slice(pv.tex.indexOf('\\maketitle')));
  }

  /* 1.2.7：內嵌圖片進圖檔清單（預覽編譯解碼、.zip 打包都靠它）；GIF 標 convert；.zip 給的對照表優先。 */
  if (!ONLY.length) {
    n++;
    const f = [];
    try {
      const png = 'data:image/png;base64,iVBORw0KGgo=', gif = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
      const md = FM_INLINE + '![a](' + png + ')\n\n![b](' + gif + ')\n\n![c](' + png + ')\n';
      const pv = R.emit(md, {}, 'preview');
      const list = pv.assets || [];
      if (list.length !== 2) f.push('圖檔清單應有 2 筆（同一張圖只算一次），實得 ' + list.length);
      const a = list.find(x => x.src === png), b = list.find(x => x.src === gif);
      if (!a || !/^ekd-assets\/inline-[0-9a-z]+\.png$/.test(a.path) || a.convert) f.push('PNG 內嵌圖的路徑或 convert 不對：' + JSON.stringify(a));
      if (!b || !/\.png$/.test(b.path) || b.convert !== 'image/gif') f.push('GIF 內嵌圖應轉成 .png 並標 convert：' + JSON.stringify(b));
      if (!(pv.imageSources || []).includes(png)) f.push('imageSources 沒有內嵌圖（.zip 會漏圖）');
      const sb = R.E.mainTex(md, { settings: Object.assign({}, BASE), purpose: 'submission', assetMap: { [png]: 'figures/figure-01-embedded-image.png' } });
      if (!sb.tex.includes('{figures/figure-01-embedded-image.png}')) f.push('.zip 對照表沒有套到內嵌圖');
      const so = R.emit(md, {}, 'submission');
      if (!(so.warnings || []).some(w => /內嵌圖片/.test(String(w.message || w)))) f.push('只下載 .tex 時沒有提示內嵌圖要從 .zip 取得');
    } catch (e) { f.push('內嵌圖片例外：' + e.message); }
    if (f.length) fails.push({ id: 'INLINE-IMG', f });
  }

  /* 內建模板：預覽版能產生、投稿版沒有 APS 不允許的寫法、引用依首次出現排序。 */
  const tplPath = path.join(SRC, '..', '..', 'templates', 'international-paper.md');
  if (!ONLY.length && fs.existsSync(tplPath)) {
    n++;
    const md = fs.readFileSync(tplPath, 'utf8');
    const f = [];
    try {
      const pv = R.emit(md, {}, 'preview'), sb = R.emit(md, {}, 'submission');
      for (const p of structural(pv.tex, pv.engine)) f.push('模板預覽版 ' + p);
      const m = stripVerbatim(sb.tex).match(FORBIDDEN_APS);
      if (m) f.push('模板投稿版含 APS 不允許的寫法：' + m[0]);
      if (R.E.mainTex && !/\\bibitem\{sondhi1997\}[\s\S]*\\bibitem\{bardeen1961\}/.test(pv.tex)) f.push('模板書目沒有依首次引用排序');
    } catch (e) { f.push('模板例外：' + e.message); }
    if (f.length) fails.push({ id: 'TEMPLATE', f });
  }

  for (const x of fails) console.log('✗ ' + x.id + '\n    ' + x.f.join('\n    '));
  console.log('revtex emit checks: ' + (n - fails.length) + '/' + n + ' 通過' + (fails.length ? '，' + fails.length + ' 個失敗' : ''));
  return fails.length ? 1 : 0;
}
if (require.main === module) process.exit(run());
module.exports = { loadPipeline, loadLeft, structural, FORBIDDEN_APS, BASE };
