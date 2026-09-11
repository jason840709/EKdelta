
/* ============================================================================
 * cp171-31-takeover — 國際論文管線 · 接管層（插點 P0）
 *
 * 這是 CP171 唯一會改變既有行為的地方，而且只改一件事：
 *   CP169A 組專案時，main.tex 的內容改由 CP171 發射器產生。
 *
 * 為什麼必須做這件事：
 *   ADR-0001 的單一版面真值鏈要求「校樣 PDF、下載的 .tex、投稿包的 .tex」
 *   全部出自同一份原始檔。既有鏈的 main.tex 來自 __CP166_REVTEX_PROJECT__，
 *   若不接管，CP171 發射器產的 .tex 只是一份旁邊的副本，看起來能用，
 *   但校樣顯示的 PDF 其實編譯自另一份檔案——這正是「三方不同步」的舊病，
 *   只是換了個位置復發。
 *
 * 為什麼安全：
 *   · 插點是一行 try/catch 包住的 callHook，比對不到 anchor 時整個建置直接失敗，
 *     不會出現「補丁只套一半」的狀態
 *   · 旗標 takeoverTex 預設為 false。關閉時 callHook 回 {handled:false}，
 *     既有程式碼取到的仍是 CP166 原產物，行為逐字元相同
 *   · CP171 發射器丟出任何例外時，回傳 handled:false 而非壞掉的 .tex——
 *     失敗方式是「退回舊行為」，不是「產出錯的檔案」
 *   · 保留最近一次接管的完整記錄（getLast()），可直接比對兩個發射器的差異
 * ========================================================================== */
(() => {
'use strict';
const K = window.__CP171__;
if (!K) { console.error('[CP171] takeover: 核心未就緒'); return; }

let last = null;   // { md, tex, engine, warnings, selfcheck, at, legacyLen }

/**
 * 插點 P0 的掛鉤。輸入是 CP169A 手上的 canonical Markdown，
 * 回傳 CP171 發射器產生的 main.tex 全文；回傳 falsy 表示不接管。
 */
function revtexMainTex(md){
  const f = K.flags();
  if (!f.takeoverTex) return null;                       // 旗標關 → 不接管
  if (!f.parser || !f.emitter) return null;

  const P = K.need('parser'), E = K.need('emit');
  if (!P || !E) { K.log.warn('takeover', '缺解析器或發射器，退回既有 main.tex'); return null; }

  try {
    const ast = P.parse(String(md == null ? '' : md));
    const out = E.emit(ast, { settings: (typeof settings !== 'undefined' ? settings : {}) });

    // 出口自檢沒過就不接管。寧可用舊的能編譯的，也不要用新的壞的。
    if (!out.selfcheck || !out.selfcheck.ok) {
      K.log.error('takeover', '發射器出口自檢未通過，退回既有 main.tex', out.selfcheck && out.selfcheck.problems);
      last = { at: Date.now(), ok: false, problems: out.selfcheck ? out.selfcheck.problems : ['自檢缺失'] };
      K.emit('takeover:reject', last);
      return null;
    }

    last = {
      at: Date.now(), ok: true, md, tex: out.tex, engine: out.engine,
      warnings: out.warnings, classOptions: out.classOptions,
      assets: out.assets, map: out.map, selfcheck: out.selfcheck
    };
    K.log.info('takeover', 'main.tex 由 CP171 發射器接管（' + out.tex.split('\n').length +
                            ' 行，引擎 ' + out.engine + '）');
    K.emit('takeover:apply', { lines: out.tex.split('\n').length, engine: out.engine,
                               warnings: out.warnings.length });
    return out.tex;
  } catch (e) {
    K.log.error('takeover', '發射器丟出例外，退回既有 main.tex：' + (e && e.message), e && e.stack);
    last = { at: Date.now(), ok: false, problems: [String(e && e.message || e)] };
    return null;
  }
}

K.hook('revtexMainTex', revtexMainTex);

/* --- 診斷與比對 ---------------------------------------------------------- */
const api = {
  version: '1.1.0',

  getLast: () => last,

  /** 把最近一次接管產生的 .tex 下載出來，方便用文字編輯器逐行看。 */
  downloadLastTex: K.gated('takeover.downloadLastTex', () => {
    if (!last || !last.tex) { K.log.warn('takeover', '尚無接管記錄'); return null; }
    const blob = new Blob([last.tex], { type: 'application/x-tex' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cp171-main.tex';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return last.tex.length;
  }),

  /**
   * 兩個發射器的並排比對：同一份 Markdown，CP166 舊產物 vs CP171 新產物。
   * 這是「換掉舊發射器」這個決定的證據，不是感覺。
   */
  compareWithLegacy: K.gated('takeover.compareWithLegacy', async (md) => {
    const P = K.need('parser'), E = K.need('emit');
    const src = md != null ? String(md) : (last && last.md) || '';
    if (!src) return { error: '沒有可比對的 Markdown（先跑一次編譯，或傳入字串）' };

    const mine = E.emit(P.parse(src), { settings: (typeof settings !== 'undefined' ? settings : {}) });

    let legacy = null;
    try {
      const proj = window.__CP166_REVTEX_PROJECT__;
      if (proj && typeof proj.buildProject === 'function') {
        const built = await proj.buildProject(src, { mode: 'portable', sourceName: 'compare.md' });
        const main = (built.entries || []).find(x => x.name === 'main.tex');
        if (main) legacy = new TextDecoder().decode(main.data);
      }
    } catch (e) { K.log.warn('takeover', '取得 CP166 產物失敗：' + (e && e.message)); }

    const norm = s => String(s || '').replace(/^%.*$/gm, '').replace(/\s+/g, ' ').trim();
    const stat = s => ({
      lines: String(s || '').split('\n').length,
      chars: String(s || '').length,
      sections: (String(s || '').match(/\\(sub)*section\{/g) || []).length,
      equations: (String(s || '').match(/\\begin\{equation/g) || []).length,
      figures: (String(s || '').match(/\\begin\{figure/g) || []).length,
      tables: (String(s || '').match(/\\begin\{table/g) || []).length,
      cites: (String(s || '').match(/\\cite\{/g) || []).length
    });

    return {
      cp171: stat(mine.tex),
      cp166: legacy ? stat(legacy) : null,
      identicalIgnoringComments: legacy ? (norm(mine.tex) === norm(legacy)) : null,
      cp171Engine: mine.engine,
      cp171Selfcheck: mine.selfcheck,
      note: legacy ? '兩份結構統計如上；差異大不代表誰錯，要看實際編譯結果。'
                   : 'CP166 不可用（可能不在 revtex 模式），只回報 CP171 側。'
    };
  }),

  /** 一鍵開關接管，並回報目前狀態。 */
  enable: (on) => {
    const v = K.setFlag('takeoverTex', on !== false);
    K.log.info('takeover', '接管 main.tex：' + (v ? '開' : '關'));
    return v;
  }
};

K.register('takeover', api);
K.log.info('takeover', '插點 P0 掛鉤已登記（旗標 takeoverTex 預設關）');
})();
