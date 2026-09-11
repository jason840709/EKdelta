
(() => {
  'use strict';
  if (window.__CP97_TW_THESIS_PATCH__) return;
  const currentTheme = () => document.body.classList.contains('twthesis2-thesis') ? 'twthesis2'
    : document.body.classList.contains('twthesis-en-thesis') ? 'twthesis-en'
    : document.body.classList.contains('twthesis-thesis') ? 'twthesis' : null;
  function pageModel(){
    if (!currentTheme() || typeof paperGeom !== 'function' || typeof mmPx !== 'function') return [];
    const G = paperGeom(), mm = mmPx(), GAP = printLayout ? 0 : G.gap;
    const usable = (G.page - G.top - G.bottom) * mm;
    const stride = usable + (G.bottom + GAP + G.top) * mm;
    const edTop = editor.getBoundingClientRect().top, padTop = G.top * mm;
    return [...document.querySelectorAll('#paper-bg .sheet')].map((sheet,index)=>({
      sheet,index,label:sheet.dataset.n||'',mark:sheet.dataset.mark||'',
      top:index*stride,bottom:index*stride+usable,stride,usable,edTop,padTop
    }));
  }
  function audit(){
    const theme = currentTheme(), pages = pageModel(), splitRows = [], earlyMarks = [];
    if (theme && pages.length){
      for (const row of editor.querySelectorAll('.twthesis-toc-row')){
        const q = twthesisInkBounds(row), p0 = twthesisActualPageOf(row,pages[0].stride,pages[0].edTop,pages[0].padTop);
        const last = q.bottom-pages[0].edTop-pages[0].padTop;
        let p1 = Math.floor((last+0.5)/pages[0].stride);
        if (last-p1*pages[0].stride > pages[0].usable+0.5) p1++;
        if (p0 !== p1) splitRows.push((row.textContent||'').trim().slice(0,120));
      }
      const headings=[...editor.querySelectorAll('h1,h2')].map(h=>({
        text:(h.textContent||'').replace(/\s+/g,' ').trim(),
        page:twthesisActualPageOf(h,pages[0].stride,pages[0].edTop,pages[0].padTop)
      })).filter(x=>x.text);
      const norm=s=>String(s||'').replace(/^\s*(?:\d+(?:\.\d+)*|[A-Z](?:\.\d+)*)[.：:\s]+/,'').replace(/\s+/g,' ').trim();
      for (const p of pages){
        if (!p.mark) continue;
        const m=norm(p.mark), hit=headings.find(h=>norm(h.text)===m);
        if (hit && hit.page>p.index) earlyMarks.push({page:p.index,mark:p.mark,targetPage:hit.page});
      }
    }
    const captionBad=[...editor.querySelectorAll('p.twthesis-cap')].filter(el=>/^(?:圖|表|Figure|Table)\s*[0-9A-Za-z]+(?:[.\-][0-9A-Za-z]+)*\.\s*:/.test((el.textContent||'').trim())).length;
    return {
      patch:'CP97',theme,pages:pages.length,tocRows:editor.querySelectorAll('.twthesis-toc-row').length,
      rowPushes:editor.querySelectorAll('[data-twthesis-toc-push="1"]').length,
      zeroInk:editor.querySelectorAll('[data-twthesis-zero-ink="1"]').length,
      zeroInkVisible:[...editor.querySelectorAll('[data-twthesis-zero-ink="1"]')].filter(el=>getComputedStyle(el).display!=='none').length,
      splitRows,earlyMarks,captionBad
    };
  }
  window.__CP97_TW_THESIS_PATCH__ = Object.freeze({version:'CP97',currentTheme,audit});
})();
