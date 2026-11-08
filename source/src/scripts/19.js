
/* ============================================================================
 * cp171-30-engine — 國際論文管線 · 編譯引擎轉接層
 *
 * 對上提供一個抽象協定，對下可掛三種實作：
 *   busytex    包住既有的 window.__CP169A_TEX_PROOF__（Worker 內真 pdfLaTeX）
 *   companion  本機 HTTP 小服務（ADR-0004 的 Plan B，協定見 devkit 20/01 第 4 節）
 *   none       無可用引擎，回報明確原因供 UI 引導
 *
 * 抽象協定（三種實作都遵守，上層只認這個介面）：
 *   probe()                 -> { available, kind, detail }
 *   compile(job)            -> Promise<Result>
 *   cancel()
 *   job    = { mainTex, files:[{path,bytes|text}], bibtex:bool, engine:'pdflatex'|'xelatex' }
 *   Result = { ok, pdf:Uint8Array|null, log:string, synctex:Uint8Array|null,
 *              aux:Uint8Array|null, ms, exitCode, engine, source }
 *
 * 為什麼要這一層：
 *   ADR-0004 把主線定為既有 busytex，但把 companion 留為 Plan B。若上層直接呼叫
 *   __CP169A_TEX_PROOF__，換引擎就要改上層。有這層，換引擎只換這一個檔案。
 *   這也是 devkit 20/01 那份 companion 協定設計的價值所在——就算最後沒用它，
 *   它仍是保險。
 *
 * 隔離：本模組不改 CP169A 任何行為，只呼叫它公開的凍結 API。
 * ========================================================================== */
(() => {
'use strict';
const K = window.__CP171__;
if (!K) { console.error('[CP171] engine: 核心未就緒'); return; }

let current = null;          // 目前使用中的實作
let inflight = null;         // 進行中的 job

/* ---------------- 實作一：busytex（包住 CP169A）----------------------------
   CP169A 的引擎初始化流程是「使用者選 Engine Pack 資料夾 → 逐檔 SHA-256 驗證
   → 建立 Worker」。這個流程只能由使用者在面板裡完成，因為選資料夾需要真實的
   使用者手勢（webkitdirectory），程式無法代勞。

   先前這裡呼叫 proof.autoLoad()（相對路徑抓引擎檔）想自動初始化——那在單檔
   file:// 情境下必然失敗，這就是「按編譯說缺少某些東西」的根因。

   正確做法：不自己初始化。引擎沒就緒就把 CP169A 面板打開讓使用者完成那一步，
   已就緒就直接重用那個 Worker。

   結果怎麼拿：compileCurrent() 只負責 postMessage，真正的結果由 worker 訊息
   非同步寫回 state。所以呼叫後要輪詢 getState() 等 revision 前進且 busy 落下，
   再用 getPdf/getLog/getSynctex/getAux 取出。                                */
const busytex = {
  kind: 'busytex',

  api(){ return window.__CP169A_TEX_PROOF__ || null; },

  probe(){
    const proof = this.api();
    if (!proof) return { available: false, kind: 'busytex', detail: 'CP169A 模組不存在' };
    let st = null;
    try { st = proof.getState ? proof.getState() : null; } catch (_) {}
    const init = !!(st && st.initialized);
    return {
      available: true, kind: 'busytex', initialized: init,
      detail: init ? '引擎已就緒（Worker 存在）'
                   : '引擎尚未載入：按右上角「載入 LaTeX 引擎」，選取 Engine Pack 資料夾',
      needsUserAction: !init,
      meta: proof.meta || null,
      state: st
    };
  },

  /** 引擎沒就緒時，把 CP169A 原本那個能用的面板打開，讓使用者完成選取。 */
  /* 1.2.6：不再自動打開大面板（使用者回報：只是要載入引擎，卻跳出一整頁）。
     改成通知國際論文右半邊顯示「載入 LaTeX 引擎」按鈕，由使用者按下後直接選資料夾。 */
  requestInit(){
    const proof = this.api();
    if (!proof) return false;
    /* 1.2.6：Mac 桌面殼已登記本機引擎位置時，直接開始載入（完成後 engine:ready 會自動編譯），
       不顯示「載入 LaTeX 引擎」按鈕。 */
    try {
      const st = proof.getState && proof.getState();
      if (st && st.directRoot && !st.initialized && typeof proof.startRegistered === 'function') { proof.startRegistered(); return true; }
    } catch (_) {}
    try { K.emit('engine:needed', {}); } catch (_) {}
    return true;
  },

  async compile(job){
    const proof = this.api();
    if (!proof) throw new Error('CP169A 不存在');
    const st0 = proof.getState();
    if (!st0.initialized) {
      this.requestInit();
      const err = new Error('ENGINE_NOT_READY');
      err.needsUserAction = true;
      err.hint = '尚未載入 LaTeX 引擎：按右半邊的「載入 LaTeX 引擎」，選取 Engine Pack 資料夾'
               + '（含 busytex.js、busytex.wasm、busytex_pipeline.js、texlive-recommended.js、'
               + 'texlive-recommended.data 五個檔案），載入完成後會自動編譯。';
      throw err;
    }

    const rev0 = st0.revision || 0;
    const t0 = Date.now();

    /* ★ 1.1.5.4：把完整 job 傳下去，而不是只叫 CP169A「自己再建一次專案」。
       舊版 proof.compile() 沒收到 job：P0 雖然換掉了 main.tex，CP171 已解析好的
       figs/fig1.png 等圖片 bytes 卻完全沒進 Worker；CP166 自己打包的圖又被改名到
       figures/，所以 main.tex 與實際的 project file list 永遠對不上——這就是
       「左邊圖修好了、右邊 PDF 仍缺圖」的真正斷點。
       補丁 P21a–d 讓 compileCurrent(optionalJob) 把 job.mainTex 與 job.files
       overlay 到 CP166 portable runtime 上；不傳 job 時行為完全不變。 */
    await proof.compile(job);

    // 輪詢等 worker 回覆
    const timeout = (job && job.timeout ? job.timeout : 180) * 1000;
    let st = st0;
    for (;;) {
      await new Promise(r => setTimeout(r, 180));
      st = proof.getState();
      if (st.revision > rev0 && !st.busy) break;
      if (Date.now() - t0 > timeout) {
        const err = new Error('COMPILE_TIMEOUT');
        err.hint = '編譯超過 ' + Math.round(timeout / 1000) + ' 秒仍未回覆。'
                 + '大型文件第一次編譯比較慢，請稍候再按「編譯」。';
        throw err;
      }
    }

    const pdf = proof.getPdf ? proof.getPdf() : null;
    const log = proof.getLog ? proof.getLog() : '';
    const usedTex = proof.getTex ? proof.getTex() : '';

    // 完整性檢查：實際餵給引擎的 main.tex 是不是 CP171 產的那一份。
    // 不一致代表 P0 插點沒生效（旗標關著，或補丁沒套上）——這件事必須讓使用者看見，
    // 否則會出現「校樣看起來對，但其實編譯的是另一份檔案」這種最難查的情況。
    let texMatches = null;
    if (job && job.mainTex && usedTex) {
      const norm = x => String(x).replace(/\r\n?/g, '\n').trim();
      texMatches = norm(usedTex) === norm(job.mainTex);
      if (!texMatches) {
        K.log.warn('engine', '引擎實際編譯的 main.tex 與這次發射的內容不同（可能有另一個編譯同時進行）。');
      }
    }

    return normalize({
      success: !!(pdf && pdf.byteLength),
      pdf, log,
      synctex: proof.getSynctex ? proof.getSynctex() : null,
      aux: proof.getAux ? proof.getAux() : null,
      exitCode: pdf && pdf.byteLength ? 0 : 1
    }, Date.now() - t0, 'busytex:CP169A', { texMatches, usedTexLines: usedTex ? usedTex.split('\n').length : 0, stale: st.stale });
  },

  cancel(){ try { const p = this.api(); p && p.terminate(); } catch (_) {} }
};

/* ---------------- 實作二：companion（ADR-0004 Plan B）--------------------- */
const companion = {
  kind: 'companion',
  base(){ return String(K.flags().companionUrl || 'http://127.0.0.1:8787').replace(/\/+$/, ''); },
  async probe(){
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 1200);
      const res = await fetch(this.base() + '/health', { signal: ctl.signal });
      clearTimeout(timer);
      if (!res.ok) return { available: false, kind: 'companion', detail: 'health 回應 ' + res.status };
      const info = await res.json();
      return { available: !!info.ok, kind: 'companion', detail: 'engine=' + (info.engine || '?') +
               ' revtex=' + (info.revtex || '?'), meta: info };
    } catch (e) {
      return { available: false, kind: 'companion', detail: '無法連線（' + (e && e.name === 'AbortError' ? '逾時' : (e && e.message)) + '）' };
    }
  },
  async compile(job){
    const t0 = Date.now();
    const body = {
      job_id: 'cp171-' + Date.now().toString(36),
      engine: job.engine || 'pdflatex',
      main: job.mainTex,
      files: (job.files || []).map(f => ({ path: f.path, content_b64: f.b64 || toB64(f.bytes || f.text || '') })),
      bibtex: !!job.bibtex,
      draft: !!job.draft,
      timeout_s: job.timeout || 90
    };
    const res = await fetch(this.base() + '/compile', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('companion /compile 回應 ' + res.status);
    const j = await res.json();
    return normalize({
      success: j.status === 'ok',
      pdf: j.pdf_b64 ? fromB64(j.pdf_b64) : null,
      synctex: j.synctex_b64 ? fromB64(j.synctex_b64) : null,
      log: j.log || '', exitCode: j.status === 'ok' ? 0 : 1
    }, Date.now() - t0, 'companion');
  },
  cancel(){ /* companion 以逾時處理，無需主動取消 */ }
};

/* ---------------- 工具 ---------------- */
function toB64(x){
  if (typeof x === 'string') x = new TextEncoder().encode(x);
  let s = ''; const a = new Uint8Array(x);
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b){
  const s = atob(b); const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a;
}
function normalize(r, ms, source, extra){
  r = r || {};
  return Object.assign({
    ok: !!(r.success !== undefined ? r.success : r.ok),
    pdf: r.pdf || null,
    log: String(r.log || ''),
    synctex: r.synctex || null,
    aux: r.aux || null,
    ms: r.milliseconds || ms,
    exitCode: r.exitCode === undefined ? (r.success ? 0 : 1) : r.exitCode,
    source: source || 'unknown'
  }, extra || {});
}

/* ---------------- 選型 ---------------- */
async function detect(force){
  const want = String(K.flags().engine || 'auto');
  const report = { chosen: null, candidates: [] };

  const bp = busytex.probe();
  report.candidates.push(bp);
  /* 1.2.7：只有旗標明確指定 companion 時才連本機備援服務。
     以前 auto 每次都先連 127.0.0.1:8787/health：介面上沒有任何地方能開 companion，
     這個連線在一般使用者那裡一律被拒，在網站上還會讓新版 Chrome 詢問「存取本機裝置」的權限。 */
  const cp = want === 'companion' ? await companion.probe()
    : { available: false, kind: 'companion', detail: '未啟用（旗標 engine 不是 companion）' };
  report.candidates.push(cp);

  if (want === 'busytex') current = bp.available ? busytex : null;
  else if (want === 'companion') current = cp.available ? companion : null;
  else current = bp.available ? busytex : null;

  report.chosen = current ? current.kind : null;
  if (!current) report.reason = '兩種實作皆不可用：busytex（' + bp.detail + '）／companion（' + cp.detail + '）';
  K.log.info('engine', '引擎偵測：' + (report.chosen || '無'), report);
  K.emit('engine:detect', report);
  return report;
}

/* ---------------- 對外 ---------------- */
/* ---------------------------------------------------------------------------
 * 圖檔解析：把 Markdown 引用到的本機圖片讀成 bytes，隨 main.tex 一起送進
 * 編譯 Worker。Worker 跑在瀏覽器沙箱裡，看不到任何磁碟檔案。
 *
 * ★ 1.1.5.3 更正：不要自己另寫一套路徑搜尋。
 *   宿主本來就有 findFolderFile(path)，它依序試「已連結的儲存資料夾 →
 *   偏好設定的圖片資料夾 → 使用者按『選擇圖片資料夾修復…』挑的那個資料夾
 *   （webkitdirectory 清單，用路徑尾碼比對）」。左邊 Markdown 的圖能修好，
 *   靠的就是這一支。1.1.5.2 我另外實作了 dirHandle／imgDirHandle／fetch 三層，
 *   剛好漏掉最常用的第三條——也就是使用者實際在用的那條，所以圖照樣進不了 PDF。
 *   現在改成直接呼叫宿主的解析器，語意與左半畫面完全一致。
 *
 * 後備順序（每層都包 try/catch，全部失敗就跳過該檔）：
 *   1. 宿主 findFolderFile()（涵蓋三種資料夾來源）
 *   2. 宿主 imgURLCache 裡已修復好的 blob URL（圖已經在畫面上了就直接拿）
 *   3. 畫面上該圖 <img> 的目前 src（data:／blob: 都可讀）
 *   4. fetch 相對路徑（http(s) 可用；file:// 會被瀏覽器擋，屬預期失敗）
 * 全部失敗不丟例外：發射器用 \cptimg，缺圖只畫佔位框而不是編譯失敗。
 * ------------------------------------------------------------------------- */
async function bytesOfBlob(b){
  if (!b) return null;
  const buf = await b.arrayBuffer();
  const u8 = new Uint8Array(buf);
  return u8.length ? u8 : null;
}

async function readAsset(rel){
  const key = String(rel || '').replace(/^\.\//, '');
  const tries = [
    /* 1. 宿主的統一解析器——與左半畫面修圖走同一條路 */
    async () => (typeof findFolderFile === 'function')
      ? bytesOfBlob(await findFolderFile(key)) : null,
    /* 2. 已修復過的圖會有 blob URL 快取 */
    async () => {
      if (typeof imgURLCache === 'undefined' || !imgURLCache || !imgURLCache.get) return null;
      const url = imgURLCache.get(key) || imgURLCache.get(key.toLowerCase());
      if (!url) return null;
      const r = await fetch(url);
      return r && r.ok ? bytesOfBlob(await r.blob()) : null;
    },
    /* 3. 畫面上那張 img 現在載的是什麼就用什麼（data:／blob: 皆可） */
    async () => {
      if (typeof document === 'undefined') return null;
      const esc = key.replace(/"/g, '\\"');
      const img = document.querySelector('img[data-osrc="' + esc + '"]')
               || document.querySelector('img[src="' + esc + '"]');
      if (!img || !img.src) return null;
      const r = await fetch(img.src);
      return r && r.ok ? bytesOfBlob(await r.blob()) : null;
    },
    /* 4. 相對路徑直接抓（http(s) 下可用） */
    async () => {
      const r = await fetch(key);
      return r && r.ok ? bytesOfBlob(await r.blob()) : null;
    },
  ];
  for (const t of tries) {
    try { const b = await t(); if (b && b.length) return b; } catch (_) {}
  }
  return null;
}

/* 1.2.6：發射器回傳 [{src, path}]——src 是 Markdown 裡寫的路徑（用來找檔案），
   path 是 main.tex 實際引用的名稱（含空白、%、大寫副檔名的路徑會換成安全的別名）。
   檔案依 src 讀進來、放在 path。舊的字串陣列也接受（src = path）。 */
async function resolveAssets(list){
  const out = [], seen = new Set();
  for (const a of (list || [])) {
    const src = String(typeof a === 'string' ? a : (a && a.src) || '').trim();
    const path = String(typeof a === 'string' ? a : (a && a.path) || src).trim();
    if (!src || seen.has(path) || /^(https?:|blob:)/i.test(src)) continue;
    seen.add(path);
    const bytes = /^data:/i.test(src) ? await inlineBytes(src, a && a.convert) : await readAsset(src);
    if (bytes) out.push({ path, bytes });
  }
  return out;
}

/* 1.2.7：內嵌圖片（data: 網址）直接解碼；發射器標了 convert 的格式（GIF、WebP、SVG…）
   畫成 PNG，做法與 .zip 匯出的 cp166Rasterize 相同（那支在 04.js 的區塊裡，這裡叫不到）。
   失敗就回 null，\cptimg 會畫佔位框。 */
async function inlineBytes(src, convert){
  const m = /^data:([^;,]*)((?:;[^;,]*)*),([\s\S]*)$/.exec(src);
  if (!m) return null;
  let bytes;
  try {
    if (/;base64/i.test(m[2])) {
      const bin = atob(m[3].replace(/\s+/g, ''));
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else bytes = new TextEncoder().encode(decodeURIComponent(m[3]));
  } catch (_) { return null; }
  if (!bytes.length) return null;
  if (!convert) return bytes;
  try { return await rasterToPng(bytes, convert); } catch (_) { return null; }
}
async function rasterToPng(bytes, mime){
  if (typeof document === 'undefined') return null;
  const url = URL.createObjectURL(new Blob([bytes], { type: mime || 'application/octet-stream' }));
  try {
    const img = new Image();
    img.decoding = 'async'; img.src = url;
    await new Promise((ok, bad) => { img.onload = ok; img.onerror = () => bad(new Error('image decode failed')); });
    const scale = Math.min(1, 2400 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const w = Math.max(1, Math.round((img.naturalWidth || 1200) * scale)), h = Math.max(1, Math.round((img.naturalHeight || 700) * scale));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    const blob = await new Promise(ok => c.toBlob(ok, 'image/png'));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } finally { URL.revokeObjectURL(url); }
}

const api = {
  version: '1.1.0',

  probe: K.gated('engine.probe', async () => detect(true)),

  kind: () => (current ? current.kind : null),

  /** 直接編譯一份 .tex。上層（協調器）唯一需要呼叫的東西。 */
  compile: K.gated('engine.compile', async (job) => {
    if (!current) {
      const r = await detect();
      if (!current) {
        const err = new Error('NO_ENGINE');
        err.report = r;
        throw err;
      }
    }
    if (inflight) { K.log.warn('engine', '已有編譯進行中，忽略新請求'); return null; }
    inflight = job;
    K.emit('engine:start', { engine: current.kind, engineName: job.engine });
    try {
      const res = await current.compile(job);
      K.emit('engine:done', { ok: res.ok, ms: res.ms, source: res.source });
      return res;
    } finally { inflight = null; }
  }),

  /** 直接從 Markdown 走完整鏈：解析 → 發射 → 編譯（含自動多輪）。
   *
   *  多輪的必要性：LaTeX 的章節號、式號、圖表號、文獻號要先寫進 .aux，
   *  下一輪才讀得到。第一輪的交叉引用一定是 ??，這不是錯誤，是 TeX 的工作方式。
   *  log 出現「Rerun to get cross-references right」就再跑一輪，最多三輪
   *  （三輪還不收斂通常表示有循環相依，繼續跑只是浪費時間）。 */


  compileMarkdown: K.gated('engine.compileMarkdown', async (md, extraFiles, opts) => {
    const P = K.need('parser'), E = K.need('emit'), D = K.need('diag');
    if (!P || !E) throw new Error('缺解析器或發射器');
    opts = opts || {};
    const maxPasses = Math.max(1, Math.min(3, opts.maxPasses === undefined ? 3 : opts.maxPasses));

    /* 1.2.6：唯一入口。預覽、下載 .tex、匯出 LaTeX、.zip、TeX 校樣、投稿包都呼叫 mainTex。 */
    const out = E.mainTex(md, { settings: (typeof settings !== 'undefined' ? settings : {}), purpose: 'preview' });
    /* 把 Markdown 引用到的圖檔讀進來一起送給 Worker（見 resolveAssets 說明）。
       解析失敗不影響編譯：\cptimg 會畫佔位框。 */
    let assetFiles = [];
    try { assetFiles = await resolveAssets(out.assets); } catch (_) {}
    if (assetFiles.length) K.log.info('engine', '附帶 ' + assetFiles.length + ' 個圖檔進編譯');

    const job = {
      mainTex: out.tex,
      files: (extraFiles || []).concat(assetFiles),
      bibtex: /\\bibliography\{/.test(out.tex),
      engine: out.engine
    };

    let res = null, passes = 0;
    for (let i = 0; i < maxPasses; i++) {
      res = await api.compile(job);
      passes++;
      if (!res) break;
      if (!res.ok) break;                            // 有錯就停，重跑不會變好
      let rerun = false;
      if (D && D.analyze) {
        try { rerun = !!D.analyze(res.log, out.map).needsRerun; } catch (_) {}
      } else {
        rerun = /Rerun to get|Label\(s\) may have changed/i.test(res.log || '');
      }
      if (!rerun) break;
      K.log.info('engine', '交叉引用尚未收斂，進行第 ' + (i + 2) + ' 輪編譯');
      K.emit('engine:rerun', { pass: i + 2 });
    }

    if (res) res.passes = passes;
    /* 記下這次編譯量到的公式／表格寬度決定，投稿版 main.tex 用它寫出靜態結果（APS 不允許量測巨集）。 */
    if (res && res.ok) { try { E.learn(res.log); } catch (_) {} }
    return { emit: out, compile: res, passes, md };
  }),

  cancel: K.gated('engine.cancel', () => { if (current) current.cancel(); inflight = null; }),

  /** 引擎沒就緒時通知畫面顯示「載入 LaTeX 引擎」按鈕（1.2.6 起不再自動開面板） */
  requestInit: K.gated('engine.requestInit', () => busytex.requestInit()),

  busy: () => !!inflight,

  /** 診斷：把兩種實作的可用性攤開，供 UI 引導使用者 */
  status: K.gated('engine.status', async () => {
    const r = await detect();
    return {
      chosen: r.chosen,
      candidates: r.candidates,
      hint: r.chosen ? null :
        '沒有可用的編譯引擎。兩條路：(1) 在 REVTeX 校樣面板選取 Engine Pack 資料夾' +
        '（含 busytex.js / busytex.wasm / texlive-recommended.data）；' +
        '(2) 啟動 companion 本機服務並在旗標 companionUrl 指向它。'
    };
  })
};

K.register('engine', api);
K.log.info('engine', 'CP171 引擎轉接層就緒（busytex 主線 / companion 備援）');
})();
