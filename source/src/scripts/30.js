
/* ============================================================================
 * cp171-70-diag — 國際論文管線 · 編譯訊息解析與白話映射
 *
 * TeX 的錯誤訊息是給 1978 年的人看的。「Missing $ inserted」不會告訴任何人
 * 該去改哪裡、改什麼。這一層做三件事：
 *
 *   1. 從 log 裡把 error / warning 抽出來，附上 .tex 行號
 *   2. 用 .tex → Markdown 的對應表把行號換算回使用者真正在編輯的那一行
 *   3. 把訊息翻成一句「發生了什麼 + 通常怎麼修」的白話
 *
 * 設計上的一個取捨：翻譯表刻意保持小而準，不追求覆蓋所有 TeX 錯誤。
 * 認得的就翻，認不得的就原樣呈現並標明「未收錄」——寧可誠實說不知道，
 * 也不要用一個似是而非的翻譯把人帶去錯的方向。認不得的訊息會累積在
 * unknownMessages() 裡，那份清單就是翻譯表下一輪該補什麼的依據。
 * ========================================================================== */
(() => {
'use strict';
const K = window.__CP171__;
if (!K) { console.error('[CP171] diag: 核心未就緒'); return; }

/* ---------- 翻譯表 ----------------------------------------------------------
   pattern 命中即翻譯。順序有意義：先具體後籠統。                            */
const TABLE = [
  {
    id: 'rerun-needed',
    re: /Label\(s\) may have changed\. Rerun|Rerun to get (?:cross-references|citations)/i,
    what: '交叉引用還沒收斂，需要再編譯一輪。',
    why: 'LaTeX 的章節號、式號、圖表號、文獻號要先寫進 .aux，下一輪才讀得到。第一輪必然如此，不是錯誤。',
    fix: 'CP171 會自動再跑一輪。若編號仍顯示為 ?? 才需要處理。',
    severity: 'warning'
  },
  {
    id: 'runaway-scanning',
    re: /File ended while scanning use of \\(\S+)/i,
    what: '指令 \\$1 的參數沒有結束就到檔尾了。',
    why: '大括號沒關起來。TeX 一路往後找 } 直到檔案結束。',
    fix: '檢查 \\$1 之後的大括號是否成對。若來自原生 TeX 區塊（```tex），先數那一段。'
  },
  {
    id: 'undefined-citations-summary',
    re: /There were (?:undefined (citations|references)|multiply-defined labels)/i,
    what: '有一些引用沒有對應目標（$1）。',
    why: '這是總結行，具體是哪幾個列在它前面的個別警告裡。',
    fix: '看上面逐條的 Citation/Reference 警告。若剛加上文獻，再編譯一輪通常就好。',
    severity: 'warning'
  },
  {
    id: 'society-default',
    re: /No Society specified, using default society/i,
    what: 'REVTeX 沒收到學會設定，用了預設值 aps。',
    why: 'class option 裡沒指定學會。CP171 應該從 settings.revtexSociety 帶入。',
    fix: '若你要投的不是 APS 期刊，到偏好設定改學會。',
    severity: 'warning'
  },
  {
    id: 'multiply-defined-label',
    re: /(?:LaTeX Warning: )?Label `([^']+)' multiply defined/i,
    what: '標籤 $1 被定義了不只一次。',
    why: '兩個地方用了同一個 {#label}。',
    fix: '交叉引用會指向其中一個（不保證是哪一個）。改掉重複的標籤名。',
    severity: 'warning'
  },
  {
    id: 'undefined-control-sequence',
    re: /Undefined control sequence/i,
    what: '用到了一個 TeX 不認得的指令。',
    why: '通常是三種情況：指令拼錯、該指令屬於某個沒載入的套件、或是把 Markdown 的反斜線當成純文字寫了。',
    fix: '看下一行 log 顯示的指令名稱。若拼寫沒錯，多半是缺套件；若是要輸出反斜線本身，Markdown 裡要寫 \\\\。',
    grab: /\n(l\.\d+.*)/
  },
  {
    id: 'missing-dollar',
    re: /Missing \$ inserted/i,
    what: '有數學符號出現在非數學環境裡。',
    why: '像 _ ^ 這類字元在正文裡有特殊意義。常見來源是 Markdown 的底線、或是數學式的 $ 沒有成對。',
    fix: '檢查該行的 $ 是否成對；若要輸出底線本身，寫成 \\_。'
  },
  {
    id: 'file-not-found',
    re: /LaTeX Error: File `([^']+)' not found/i,
    what: '找不到檔案：$1',
    why: '若是圖檔，表示圖片沒有跟 .tex 放在一起（1.1.5.2 起缺圖只會畫佔位框，不會讓編譯失敗）；若是 .sty，表示缺少該套件。',
    fix: '圖檔：確認相對路徑與檔名（大小寫也要一致）。套件：需要在 Engine Pack 裡補上，或改用不需要它的寫法。'
  },
  {
    id: 'citation-undefined',
    re: /Citation `([^']+)' (?:on page \d+ )?undefined/i,
    what: '引用的文獻鍵 $1 不存在。',
    why: 'refs.bib 裡沒有這個鍵，或是 BibTeX 還沒跑過（交叉引用需要多輪編譯才會收斂）。',
    fix: '確認 .bib 裡有這個 key。若剛加上去，再編譯一次即可。'
  },
  {
    id: 'reference-undefined',
    re: /Reference `([^']+)' (?:on page \d+ )?undefined/i,
    what: '交叉引用 $1 找不到對應的標籤。',
    why: '\\label 沒寫、拼錯，或這是第一輪編譯（.aux 還沒生成）。',
    fix: '確認對應位置有 {#$1} 或 \\label{$1}。若剛加上，再編譯一次。'
  },
  {
    id: 'overfull-hbox',
    re: /Overfull \\hbox \(([\d.]+)pt too wide\)/i,
    what: '有一行文字超出欄寬 $1pt。',
    why: '通常是很長的單字、網址、或數學式塞不進雙欄的欄寬。這是排版警告，不是錯誤——PDF 還是會產生。',
    fix: '若溢出量小（<10pt）多半肉眼看不出來，可忽略。明顯溢出時：長網址用 \\url{}、長式改用 multline 或 split 環境。',
    severity: 'warning'
  },
  {
    id: 'underfull-hbox',
    re: /Underfull \\hbox \(badness (\d+)\)/i,
    what: '有一行文字被拉得太開（鬆散度 $1）。',
    why: 'TeX 為了對齊右邊界把詞間空白拉大了。這是排版警告，不是錯誤。',
    fix: '通常可忽略。若很明顯，改寫該段文字讓斷行更自然。',
    severity: 'warning'
  },
  {
    id: 'missing-begin-document',
    re: /Missing \\begin\{document\}/i,
    what: '正文出現在 \\begin{document} 之前。',
    why: '多半是 frontmatter 的 YAML 裡混進了會被當成正文的內容。',
    fix: '檢查 frontmatter 的 preamble 欄位，那裡只能放 TeX 前言指令。'
  },
  {
    id: 'runaway-argument',
    re: /Runaway argument/i,
    what: '某個指令的大括號沒有關起來。',
    why: '常見於原生 TeX 區塊（```tex）裡的括號不平衡。',
    fix: '檢查最近的 ```tex 區塊，數一下 { 和 } 的數量。'
  },
  {
    id: 'unicode-char',
    re: /Unicode character (.+?) \(U\+([0-9A-F]+)\)/i,
    what: 'pdfLaTeX 無法處理字元 $1（U+$2）。',
    why: 'pdfLaTeX 只認 8-bit 編碼，處理不了中日韓等文字。',
    fix: 'CP171 應該要自動偵測並切換到 XeLaTeX。若你看到這個錯誤，表示偵測漏掉了——請回報，並暫時在 frontmatter 加 preamble 指定引擎。'
  },
  {
    id: 'too-many-errors',
    re: /Emergency stop|Fatal error occurred/i,
    what: '編譯中止，沒有產生 PDF。',
    why: '前面某個錯誤嚴重到無法繼續。真正的原因在這條訊息之前。',
    fix: '往上找第一個 ! 開頭的訊息，那才是根因。'
  },
  {
    id: 'multiply-defined',
    re: /Label `([^']+)' multiply defined/i,
    what: '標籤 $1 被定義了不只一次。',
    why: '兩個地方用了同一個 {#label}。',
    fix: '交叉引用會指向其中一個（不保證是哪一個）。改掉重複的標籤名。',
    severity: 'warning'
  },
  {
    id: 'float-too-large',
    re: /Float too large for page/i,
    what: '有一個圖或表大到放不進一頁。',
    why: '圖片指定的寬度超過版面，或表格列數太多。',
    fix: '雙欄模式下單欄寬只有約 3.4 英吋。寬圖請用 ![...](...)  搭配跨欄（figure*），或縮小圖片。',
    severity: 'warning'
  }
];

/* ---------- log 解析 ---------- */
function parseLog(log){
  const text = String(log || '');
  const lines = text.split('\n');
  const items = [];

  // TeX 的 (file 與 ) 會標示目前處理的檔案；只在主檔內的訊息才對得上行號
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];

    // 錯誤：以 ! 開頭
    if (ln.startsWith('!')) {
      const ctx = lines.slice(i, Math.min(i + 8, lines.length)).join('\n');
      const lm = ctx.match(/^l\.(\d+)/m);
      items.push({
        severity: 'error',
        raw: ln.replace(/^!\s*/, '').trim(),
        context: ctx,
        texLine: lm ? parseInt(lm[1], 10) : null,
        logLine: i + 1
      });
      continue;
    }

    // 警告：LaTeX Warning / Package ... Warning / Overfull / Underfull
    const wm = ln.match(/^(LaTeX|Package\s+\S+|Class\s+\S+)\s+Warning:\s*(.*)$/);
    if (wm) {
      let msg = wm[2];
      let j = i + 1;
      while (j < lines.length && /^\(?[a-zA-Z@]/.test(lines[j]) && lines[j].startsWith(' ')) { msg += ' ' + lines[j].trim(); j++; }
      const pm = msg.match(/on input line (\d+)/);
      items.push({ severity: 'warning', raw: msg.trim(), context: msg,
                   texLine: pm ? parseInt(pm[1], 10) : null, logLine: i + 1 });
      continue;
    }

    if (/^(Overfull|Underfull)\s+\\[hv]box/.test(ln)) {
      const pm = ln.match(/at lines? (\d+)/);
      items.push({ severity: 'warning', raw: ln.trim(), context: ln,
                   texLine: pm ? parseInt(pm[1], 10) : null, logLine: i + 1 });
    }
  }
  return items;
}

/* ---------- 翻譯 ---------- */
function translate(item){
  for (const t of TABLE) {
    const m = t.re.exec(item.context || item.raw);
    if (!m) continue;
    const sub = s => String(s).replace(/\$(\d)/g, (_, d) => m[Number(d)] !== undefined ? m[Number(d)] : '');
    return {
      id: t.id,
      what: sub(t.what),
      why: sub(t.why),
      fix: sub(t.fix),
      severity: t.severity || item.severity,
      known: true
    };
  }
  return {
    id: 'unknown',
    what: item.raw,
    why: '這條訊息還沒有收錄在白話翻譯表裡。',
    fix: '原始訊息如上。若這條訊息常出現，值得把它加進翻譯表。',
    severity: item.severity,
    known: false
  };
}

/* ---------- 完整診斷 ---------- */
const unknown = [];

function analyze(log, map){
  const items = parseLog(log);
  const L = K.need('locate');
  const out = items.map(it => {
    const tr = translate(it);
    if (!tr.known) unknown.push(it.raw);
    let mdLine = null;
    if (it.texLine != null && map && L && L.texLineToMd) {
      try { mdLine = L.texLineToMd(it.texLine, map); } catch (_) {}
    }
    return Object.assign({}, it, tr, { mdLine });
  });

  const errors = out.filter(x => x.severity === 'error');
  const warnings = out.filter(x => x.severity !== 'error');
  const needsRerun = /Label\(s\) may have changed|Rerun to get|There were undefined (citations|references)/i.test(String(log || ''));
  return {
    ok: errors.length === 0,
    needsRerun,
    errors, warnings,
    counts: { error: errors.length, warning: warnings.length,
              unknown: out.filter(x => !x.known).length },
    summary: summarize(errors, warnings)
  };
}

function summarize(errors, warnings){
  if (!errors.length && !warnings.length) return '編譯乾淨，沒有任何錯誤或警告。';
  const parts = [];
  if (errors.length) {
    parts.push(errors.length + ' 個錯誤');
    const first = errors[0];
    parts.push('第一個在' + (first.mdLine ? ' Markdown 第 ' + first.mdLine + ' 行' :
                             (first.texLine ? ' .tex 第 ' + first.texLine + ' 行' : '未知位置')) +
               '：' + first.what);
  }
  if (warnings.length) {
    const overfull = warnings.filter(w => w.id === 'overfull-hbox').length;
    const undef = warnings.filter(w => /undefined/.test(w.id)).length;
    const rest = warnings.length - overfull - undef;
    const bits = [];
    if (overfull) bits.push(overfull + ' 個行寬溢出');
    if (undef) bits.push(undef + ' 個未定義的引用');
    if (rest) bits.push(rest + ' 個其他警告');
    parts.push(bits.join('、'));
  }
  return parts.join('；') + '。';
}

/* ---------- 對外 ---------- */
const api = {
  version: '1.1.0',
  parseLog, translate, analyze,

  /** 直接分析最近一次編譯結果 */
  analyzeLast: K.gated('diag.analyzeLast', () => {
    const O = K.need('orch'), V = K.need('view');
    const last = (O && O.getLast && O.getLast()) || (V && V.getLast && V.getLast());
    if (!last || !last.compile) { K.log.warn('diag', '沒有可分析的編譯結果'); return null; }
    return analyze(last.compile.log, last.emit && last.emit.map);
  }),

  /** 產一段人可讀的純文字報告，可直接貼進筆記或問人 */
  report: K.gated('diag.report', (a) => {
    const r = a || api.analyzeLast();
    if (!r) return '';
    const lines = ['# 編譯診斷', '', r.summary, ''];
    const fmt = (x, i) => {
      const where = x.mdLine ? 'Markdown 第 ' + x.mdLine + ' 行'
                  : (x.texLine ? '.tex 第 ' + x.texLine + ' 行' : '位置不明');
      return [
        `## ${i + 1}. ${x.what}`,
        `位置：${where}`,
        `原因：${x.why}`,
        `處理：${x.fix}`,
        x.known ? '' : '原始訊息：' + x.raw,
        ''
      ].filter(Boolean).join('\n');
    };
    if (r.errors.length) { lines.push('## 錯誤', ''); r.errors.forEach((x, i) => lines.push(fmt(x, i))); }
    if (r.warnings.length) { lines.push('## 警告', ''); r.warnings.forEach((x, i) => lines.push(fmt(x, i))); }
    return lines.join('\n');
  }),

  /** 翻譯表沒收錄的訊息——這份清單就是下一輪該補什麼 */
  unknownMessages: () => [...new Set(unknown)],
  table: () => TABLE.map(t => ({ id: t.id, pattern: String(t.re) })),
  tableSize: TABLE.length
};

K.register('diag', api);
K.log.info('diag', 'CP171 錯誤白話映射就緒（翻譯表 ' + TABLE.length + ' 條）');
})();
