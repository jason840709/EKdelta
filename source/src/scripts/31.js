
/* ============================================================================
 * cp171-80-submit — 國際論文管線 · 投稿包
 *
 * 產出一個 zip：main.tex + refs.bib + 圖檔 + main.pdf + README
 *
 * 驗收標準（devkit M5 的 DoD）：這個 zip 在一台**完全乾淨的 TeX 環境**下，
 * 只掛 revtex-tds，不掛本專案任何東西，要能重現編譯。這是「可以真的寄出去」
 * 與「在我機器上能跑」的差別。
 *
 * 為此有三條硬規則：
 *   1. main.tex 不得引用任何本專案私有的巨集、樣式或路徑
 *   2. 圖檔路徑一律相對，且真的收在 zip 裡
 *   3. 附一份 README 說明用什麼引擎、跑幾輪、需要哪些套件——不要讓期刊編輯猜
 *
 * zip 是自己寫的（store-only，不壓縮）。理由：投稿包通常只有數 MB，壓縮省下的
 * 空間不值得為它引入一個外部函式庫，而「零外部相依」是這個專案從頭到尾的約束。
 * ========================================================================== */
(() => {
'use strict';
const K = window.__CP171__;
if (!K) { console.error('[CP171] submit: 核心未就緒'); return; }

/* ---------- 極簡 ZIP（store-only，含 CRC32）------------------------------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(u8){
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function dosTime(d){
  return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
}
function dosDate(d){
  return (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
}
function makeZip(entries){
  const enc = new TextEncoder();
  const now = new Date();
  const chunks = [], central = [];
  let offset = 0;

  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const data = e.data instanceof Uint8Array ? e.data : enc.encode(String(e.data));
    const crc = crc32(data);
    const t = dosTime(now), d = dosDate(now);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);          // version needed
    lv.setUint16(6, 0x0800, true);      // UTF-8 flag
    lv.setUint16(8, 0, true);           // store
    lv.setUint16(10, t, true); lv.setUint16(12, d, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    chunks.push(local, data);

    const cen = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, t, true); cv.setUint16(14, d, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cen.set(nameBytes, 46);
    central.push(cen);

    offset += local.length + data.length;
  }

  const centralSize = central.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const all = [...chunks, ...central, end];
  const total = all.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of all) { out.set(c, p); p += c.length; }
  return out;
}

/* ---------- README ---------- */
function readme(info){
  return `# ${info.title || 'Manuscript'} — REVTeX 4.2 投稿包

## 怎麼編譯

    ${info.engine} -interaction=nonstopmode -synctex=1 main.tex
    ${info.bibtex ? 'bibtex main\n    ' + info.engine + ' main.tex\n    ' + info.engine + ' main.tex' : info.engine + ' main.tex'}

或直接用 latexmk：

    latexmk -${info.engine === 'xelatex' ? 'xelatex' : 'pdf'} -synctex=1 main.tex

## 需要什麼

- REVTeX 4.2（\`revtex4-2.cls\`）${info.bibtex ? '與 \`apsrev4-2.bst\`' : ''}
- 標準套件：${(info.packages || []).join('、') || 'amsmath、amssymb、graphicx'}
${info.engine === 'xelatex' ? '- XeLaTeX（本稿含中日韓文字，pdfLaTeX 無法處理）與 xeCJK\n' : ''}
所有選擇性套件都以 \`\\IfFileExists\` 包裹並附退化定義，缺套件時會降級而不是編譯中止。

## 檔案

${(info.files || []).map(f => '- `' + f.name + '`　' + (f.note || '')).join('\n')}

## 版面設定

    \\documentclass[${(info.classOptions || []).join(',')}]{revtex4-2}

這組選項來自撰稿時的偏好設定，可依期刊要求調整。

## 產生方式

本稿由 EKdelta CP171 國際論文管線從 Markdown 產生。
\`main.tex\` 是人可讀、可再編輯的標準 REVTeX 原始檔，不含任何私有巨集或
絕對定位——期刊生產流程可以直接重排。

產生時間：${new Date().toISOString()}
${info.warnings && info.warnings.length ? '\n## 產生時的提醒\n\n' + info.warnings.map(w => '- ' + w).join('\n') + '\n' : ''}`;
}

/* ---------- 主流程 ---------- */
async function build(opts){
  opts = opts || {};
  const O = K.need('orch'), V = K.need('view'), E = K.need('engine');
  let last = (O && O.getLast && O.getLast()) || (V && V.getLast && V.getLast());

  // 沒有現成結果就現編一次——投稿包一定要附 PDF，不能只給 .tex
  if (!last || !last.compile || !last.compile.ok) {
    if (!opts.allowNoPdf) {
      K.log.info('submit', '沒有可用的編譯結果，先編譯一次');
      if (!E) throw new Error('引擎層缺失');
      const md = opts.markdown || currentMarkdown();
      last = await E.compileMarkdown(md, []);
      if (!last || !last.compile || !last.compile.ok) {
        throw new Error('編譯未成功，投稿包不產生。先修好錯誤（用 __CP171__.need("diag").report() 看白話診斷）。');
      }
    }
  }

  const emit = last.emit;
  const comp = last.compile;
  const enc = new TextEncoder();
  const entries = [];
  const fileNotes = [];

  entries.push({ name: 'main.tex', data: enc.encode(emit.tex) });
  fileNotes.push({ name: 'main.tex', note: 'REVTeX 4.2 原始檔（投稿主體）' });

  if (comp && comp.pdf) {
    entries.push({ name: 'main.pdf', data: comp.pdf });
    fileNotes.push({ name: 'main.pdf', note: '由 main.tex 編譯而得，與原始檔同一份真相' });
  }

  // 書目
  const bibName = (emit.tex.match(/\\bibliography\{([^}]+)\}/) || [])[1];
  const hasBib = !!bibName;
  if (hasBib) {
    const bibData = opts.bib || (last.bibText) || '';
    if (bibData) {
      entries.push({ name: bibName + '.bib', data: enc.encode(bibData) });
      fileNotes.push({ name: bibName + '.bib', note: '文獻資料' });
    } else {
      fileNotes.push({ name: bibName + '.bib', note: '⚠ 未附上——請自行補入，否則文獻無法產生' });
    }
  }

  // 圖檔
  const assets = emit.assets || [];
  let missing = 0;
  for (const a of assets) {
    const bytes = opts.assetResolver ? await opts.assetResolver(a) : null;
    if (bytes) {
      entries.push({ name: a, data: bytes });
      fileNotes.push({ name: a, note: '圖檔' });
    } else { missing++; fileNotes.push({ name: a, note: '⚠ 未附上（找不到檔案）' }); }
  }

  const warnings = (emit.warnings || []).slice();
  if (missing) warnings.push(missing + ' 個圖檔沒有收進包裡，期刊端會編譯失敗——請確認圖檔路徑。');
  if (hasBib && !opts.bib) warnings.push('沒有附上 .bib，文獻清單在期刊端會是空的。');

  const info = {
    title: (emit.tex.match(/\\title\{([^}]*)\}/) || [])[1] || 'Manuscript',
    engine: emit.engine || 'pdflatex',
    bibtex: hasBib,
    classOptions: emit.classOptions || [],
    packages: [...new Set((emit.tex.match(/\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g) || [])
                 .map(s => (s.match(/\{([^}]+)\}/) || [])[1]).filter(Boolean))],
    files: fileNotes,
    warnings
  };
  entries.unshift({ name: 'README.md', data: enc.encode(readme(info)) });

  const zip = makeZip(entries);
  return { zip, entries: entries.map(e => ({ name: e.name, bytes: e.data.length })), info, warnings };
}

function currentMarkdown(){
  try {
    if (typeof commitCurrent === 'function') commitCurrent();
    if (typeof losslessActiveNormalized === 'function') {
      const v = losslessActiveNormalized(); if (typeof v === 'string' && v) return v;
    }
    if (typeof serialize === 'function') return serialize();
  } catch (_) {}
  return '';
}

/* ---------- 對外 ---------- */
const api = {
  version: '1.1.0',
  build: K.gated('submit.build', build),

  download: K.gated('submit.download', async (opts) => {
    const r = await build(opts);
    const blob = new Blob([r.zip], { type: 'application/zip' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'revtex-submission-' + new Date().toISOString().slice(0, 10) + '.zip';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 6000);
    K.log.info('submit', '投稿包已產生：' + r.entries.length + ' 個檔案／' +
                          (r.zip.length / 1024).toFixed(0) + ' KB');
    if (r.warnings.length) K.log.warn('submit', '投稿包有 ' + r.warnings.length + ' 項提醒', r.warnings);
    return { files: r.entries, kb: Math.round(r.zip.length / 1024), warnings: r.warnings };
  }),

  /** 只看內容不下載，用來確認包裡有什麼 */
  inspect: K.gated('submit.inspect', async (opts) => {
    const r = await build(Object.assign({ allowNoPdf: true }, opts));
    return { entries: r.entries, info: r.info, warnings: r.warnings };
  }),

  _makeZip: makeZip, _crc32: crc32, _readme: readme
};

K.register('submit', api);
K.log.info('submit', 'CP171 投稿包產生器就緒（自寫 store-only zip，零外部相依）');
})();
