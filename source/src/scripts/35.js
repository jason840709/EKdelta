
/* CP179: bounded manual PDF batches. afterprint only reports a return candidate;
 * it is neither proof of a saved file nor permission to destroy native print
 * resources. Explicit release means the user confirmed the dialog is closed.
 * JS can drop its own resources,
 * but cannot force Chromium/native print caches or garbage collection. */
(() => {
  'use strict';
  if (window.__CP178_BATCH_ENGINE__) return;
  const LIMIT = 100;
  let session = null, sequence = 0;
  let pendingDisposal = Promise.resolve();
  const yieldUI = () => new Promise(resolve => setTimeout(resolve, 0));
  const abortError = () => Object.assign(new Error(TT('已取消分批匯出','Batch export cancelled')), {name:'AbortError'});
  function check(s, isCancelled){
    if (session !== s || s.closed || (isCancelled && isCancelled())) throw abortError();
  }
  function progress(callback, value){
    if (typeof callback === 'function') callback(value);
  }
  function saveProperty(name){ return {name, own:Object.prototype.hasOwnProperty.call(window,name), value:window[name]}; }
  function restoreProperty(p){ if (p.own) window[p.name]=p.value; else delete window[p.name]; }
  function batchSummary(batch){
    return batch ? {from:batch.from,to:batch.to,pages:batch.pages,title:batch.title} : null;
  }
  function restorePrintTitle(s){
    const title=s.printTitle; s.printTitle=null;
    // Do not overwrite a newer title supplied by the editor while printing.
    if(title && document.title===title.applied) document.title=title.previous;
  }
  function clearPrintRun(s){
    const run=s.printRun; s.printRun=null;
    if(!run) return;
    clearTimeout(run.finishTimer); run.finishTimer=null;
    try { run.frame?.contentWindow.removeEventListener('afterprint',run.afterPrint); } catch(_){}
    run.afterPrint=null; run.onReturn=null; run.frame=null; run.batch=null;
  }
  function emptyFrame(fr){
    try { fr.contentWindow.stop(); } catch(_){}
    try {
      const doc=fr.contentDocument;
      // These URLs are cloned from the editor, so remove references but do not
      // revoke shared blob URLs that the live document may still need.
      for(const el of doc.querySelectorAll('img,source,video,audio,iframe,object,embed,image')){
        try { if(typeof el.pause==='function') el.pause(); } catch(_){}
        el.onload=null; el.onerror=null;
        for(const name of ['srcset','src','href','xlink:href','poster','data']) el.removeAttribute(name);
      }
      for(const canvas of doc.querySelectorAll('canvas')) canvas.width=canvas.height=0;
      if(doc.body) doc.body.replaceChildren();
      if(doc.head) doc.head.replaceChildren();
      // Replacing the document also drops CSS/font resources, SVG trees and
      // document-owned listeners, not just the iframe element in the parent.
      doc.open(); doc.write('<!doctype html><html><head><title></title></head><body></body></html>'); doc.close();
    } catch(_){}
  }
  async function disposeFrame(fr){
    emptyFrame(fr);
    try { fr.removeAttribute('srcdoc'); fr.src='about:blank'; } catch(_){}
    // A task boundary lets the blank navigation/print completion unwind before
    // destroying the browsing context; a second separates it from new content.
    await yieldUI();
    try { fr.remove(); } catch(_){}
    fr=null;
    await yieldUI();
  }
  function releaseSessionBatch(s){
    if(s.releasing) return s.releasing;
    clearPrintRun(s);
    for(const cancel of [...s.waits]) cancel();
    s.waits.clear();
    restorePrintTitle(s);
    const fr=s.frame; s.frame=null; s.batch=null;
    if(!s.closed && s.status!=='opening') s.status='releasing';
    if(!fr){
      if(!s.closed && s.status!=='opening') s.status='ready';
      return pendingDisposal;
    }
    // Keep the global frame guard until destruction has finished so the legacy
    // export routes cannot start while this context is being torn down.
    const disposal=disposeFrame(fr).finally(()=>{
      if(vectorPrintFrame===fr) vectorPrintFrame=null;
      s.releasing=null;
      if(session===s && !s.closed && s.status==='releasing') s.status='ready';
    });
    s.releasing=disposal;
    pendingDisposal=disposal;
    return disposal;
  }
  function releaseBatch(){
    return session ? releaseSessionBatch(session) : pendingDisposal;
  }
  function close(){
    const s=session;
    if(!s) return pendingDisposal;
    s.closed=true; session=null;
    const disposal=releaseSessionBatch(s);
    for(const p of s.savedProperties) restoreProperty(p);
    s.savedProperties.length=0;
    pdfFrozenCounterLabels=s.oldFrozenLabels; s.oldFrozenLabels=null;
    printLayout=s.oldPrintLayout;
    window.__cp177PdfExportBusy=s.oldBusy;
    s.pageCache=null; s.counterStates=null; s.nav=null; s.metas=null; s.css=null;
    try { clearTimeout(paperTimer); if(s.layoutTouched && inPaperMode()) paginatePaper(); }
    catch(err){ console.warn('[CP179 restore layout]',err); }
    finally { if(s.zoomToken){restoreViewZoomAfterLayout(s.zoomToken);s.zoomToken=null;} }
    // State/layout restore is synchronous. Callers may await destruction; open()
    // also awaits it, so ignoring this Promise cannot overlap print contexts.
    return disposal;
  }
  function scopeWait(s,start,timeoutMs,timeoutValue){
    return new Promise((resolve,reject)=>{
      let settled=false,timer=null,cleanup=null;
      const finish=(err,value)=>{
        if(settled) return;
        settled=true;clearTimeout(timer);s.waits.delete(cancel);
        if(cleanup){cleanup();cleanup=null;}
        if(err) reject(err); else resolve(value);
      };
      const cancel=()=>finish(abortError());
      s.waits.add(cancel);
      if(timeoutMs) timer=setTimeout(()=>finish(null,timeoutValue),timeoutMs);
      try {
        const stop=start(finish);
        if(settled){if(stop) stop();} else cleanup=stop;
      } catch(err){finish(err);}
    });
  }
  async function waitBatchImage(s,im,timeoutMs){
    if(!im.complete){
      const loaded=await scopeWait(s,done=>{
        const onLoad=()=>done(null,true),onError=()=>done(null,false);
        im.addEventListener('load',onLoad);im.addEventListener('error',onError);
        return ()=>{im.removeEventListener('load',onLoad);im.removeEventListener('error',onError);};
      },timeoutMs,false);
      if(!loaded) return false;
    }
    if(!im.complete || !(im.naturalWidth>0)) return false;
    if(im.decode){
      // Limit decode waits and remove their timeout on success. The callback
      // holds no document/image reference after its promise is settled.
      await scopeWait(s,done=>{
        let notify=done;
        Promise.resolve(im.decode()).then(()=>notify?.(null,true),()=>notify?.(null,false));
        return ()=>{notify=null;};
      },timeoutMs,false);
    }
    return !!(im.complete && im.naturalWidth>0);
  }
  async function waitBatchReady(s,doc,isCancelled){
    if(doc.fonts?.ready){
      await scopeWait(s,done=>{
        let notify=done;
        Promise.resolve(doc.fonts.ready).then(()=>notify?.(null,true),()=>notify?.(null,false));
        return ()=>{notify=null;};
      },30000,false);
    }
    check(s,isCancelled);
    let placeholders=0,images=0;
    // A bounded sequence avoids decoding all of a large batch at once.
    for(const im of [...doc.images]){
      check(s,isCancelled); images++;
      let ok=await waitBatchImage(s,im,15000);check(s,isCancelled);
      if(!ok){setVectorImagePlaceholder(im);placeholders++;ok=await waitBatchImage(s,im,5000);check(s,isCancelled);}
      if(!ok) throw new Error(TT('向量頁面圖片與佔位圖皆無法解碼','A print image and its placeholder could not be decoded'));
    }
    // A cancelled/removed frame must not leave an unresolved iframe rAF holding
    // the prepare() stack. The timeout is only a layout fallback, never a print
    // timeout, and is cleared on normal completion or cancellation.
    await scopeWait(s,done=>{
      const win=doc.defaultView;let first=0,second=0;
      first=win.requestAnimationFrame(()=>{second=win.requestAnimationFrame(()=>done(null,true));});
      return ()=>{win.cancelAnimationFrame(first);win.cancelAnimationFrame(second);};
    },1500,false);
    check(s,isCancelled);
    void doc.documentElement.offsetHeight;
    return {images,placeholders};
  }
  function result(s){
    return {totalPages:s.totalPages,fileName:s.fileName,maxPages:LIMIT,status:s.status,
      batch:batchSummary(s.batch)};
  }
  async function open({onProgress,isCancelled}={}){
    if (typeof isRevtexTheme==='function' && isRevtexTheme())
      throw new Error(TT('REVTeX 請使用原有的「匯出 PDF」，以保留 TeX 精確排版。','For REVTeX, use the existing PDF export to preserve the exact TeX layout.'));
    if (session) throw new Error(TT('分批匯出已開啟','A batch export is already open'));
    await pendingDisposal;
    if (session) throw new Error(TT('分批匯出已開啟','A batch export is already open'));
    if (vectorPrintFrame || window.__cp177PdfExportBusy)
      throw new Error(TT('已有 PDF 正在準備或列印，請先完成該流程。','Another PDF is being prepared or printed. Finish that export first.'));
    const s={id:++sequence,status:'opening',closed:false,frame:null,batch:null,printRun:null,printTitle:null,releasing:null,waits:new Set(),
      oldPrintLayout:printLayout,oldFrozenLabels:pdfFrozenCounterLabels,oldBusy:window.__cp177PdfExportBusy,
      savedProperties:[saveProperty('__cp177PdfPageBlocks'),saveProperty('__cp177PdfCounterStates')],
      zoomToken:null,layoutTouched:false,totalPages:0,fileName:'',metas:null,nav:null,pageCache:null,counterStates:null};
    session=s; window.__cp177PdfExportBusy=true; window.__lastPdfError=null;
    try {
      clearTimeout(paperTimer); check(s,isCancelled);
      progress(onProgress,{phase:'source',message:TT('正在確認文件與圖片…','Checking document and images…')});
      await yieldUI(); check(s,isCancelled);
      if (dirHandle) { await ensureReadPerm(dirHandle); check(s,isCancelled); }
      if (imgDirHandle) { await ensureReadPerm(imgDirHandle); check(s,isCancelled); }
      s.layoutTouched=true;
      if (!inPaperMode()) { setTheme('paper'); await raf2(); check(s,isCancelled); }
      commitPaperEdit(); commitMathEdit(); exitTableEdit(); deactivate(true);
      s.fileName=(activeFile()?.name || 'document').replace(/\.(md|markdown|txt)$/i,'');
      const prep=await preparePdfSourceImages(); check(s,isCancelled);
      if (prep.zeroGeometry) throw new Error(TT(`有 ${prep.zeroGeometry} 張可見圖片尚未完成尺寸量測，請確認圖片來源。`,`${prep.zeroGeometry} visible image(s) have no measured size. Check the image sources.`));
      progress(onProgress,{phase:'layout',message:TT('正在建立頁面索引…','Indexing source pages…')});
      await yieldUI(); check(s,isCancelled);
      s.zoomToken=suspendViewZoomForLayout();
      clearTimeout(paperTimer); printLayout=true; paginatePaper();
      await raf2(); check(s,isCancelled);
      const sheets=$('#paper-bg').children;
      s.totalPages=Math.max(1,sheets.length);
      s.metas=[...sheets].map((sheet,i)=>({n:sheet.dataset.n ?? String(i+1),side:sheet.dataset.side||'',
        style:sheet.dataset.style||'',mark:sheet.dataset.mark||'',front:sheet.dataset.front==='1'}));
      const H=paperPageHeightMM()*mmPx(), edRect=editor.getBoundingClientRect();
      s.pageCache=Array.from({length:s.totalPages},()=>[]);
      const events=[];
      let blockCount=0;
      for (const live of editor.children){
        check(s,isCancelled);
        const r=live.getBoundingClientRect(),top=r.top-edRect.top,bottom=r.bottom-edRect.top;
        if (getComputedStyle(live).display!=='none' && bottom>0 && top<s.totalPages*H && bottom>top){
          const first=Math.max(0,Math.floor(top/H));
          const last=Math.min(s.totalPages-1,Math.floor((bottom-.01)/H));
          for(let p=first;p<=last;p++) s.pageCache[p].push(live);
          for(const el of live.querySelectorAll(':scope > h1,:scope > h2,:scope > h3,figure.md-fig figcaption')){
            if(getComputedStyle(el).display==='none') continue;
            events.push({y:el.getBoundingClientRect().top-edRect.top,el,block:live});
          }
        }
        if(++blockCount%250===0){ await yieldUI(); check(s,isCancelled); }
      }
      events.sort((a,b)=>a.y-b.y);
      const running={pch:0,psec:0,psub:0,pfig:0,pappch:0}; let ei=0;
      s.counterStates=Array.from({length:s.totalPages},(_,p)=>{
        while(ei<events.length && events[ei].y<p*H){
          const event=events[ei++],el=event.el;
          if(el.matches('h1')){
            if(!el.classList.contains('twthesis-fm')) event.block.classList.contains('twthesis-app') ? running.pappch++ : running.pch++;
            running.psec=0; running.psub=0;
          } else if(el.matches('h2')) { running.psec++; running.psub=0; }
          else if(el.matches('h3')) running.psub++;
          else if(el.matches('figcaption')) running.pfig++;
        }
        return {...running};
      });
      window.__cp177PdfPageBlocks=s.pageCache;
      window.__cp177PdfCounterStates=s.counterStates;
      pdfFrozenCounterLabels=buildPdfCounterLabelMap();
      s.nav=collectPdfNavLinks(s.metas,paperPageWidthPt(),paperPageHeightPt());
      s.css=buildPdfCSS(true);
      check(s,isCancelled); s.status='ready';
      return result(s);
    } catch(err){
      if(session===s) close();
      throw err;
    }
  }
  async function prepare(from,to,{onProgress,isCancelled}={}){
    const s=session;
    if(!s || s.status==='opening') throw new Error(TT('請先開啟分批匯出。','Open batch export first.'));
    if(s.status==='preparing' || s.status==='printing') throw new Error(TT('請先完成目前這一批。','Finish the current batch first.'));
    if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||to<from||to>s.totalPages||to-from+1>LIMIT)
      throw new Error(TT(`每批請選擇 1 至 ${s.totalPages} 頁之間的連續頁面，最多 ${LIMIT} 頁。`,`Choose consecutive pages within 1–${s.totalPages}, up to ${LIMIT} pages per batch.`));
    // Reserve preparation synchronously; a second caller cannot enter while
    // this one waits for the previous context to finish destruction.
    s.status='preparing';
    const disposal=releaseSessionBatch(s); s.status='preparing';
    const count=to-from+1, start=from-1, end=to-1;
    try {
      await disposal; check(s,isCancelled);
      const title=`${s.fileName}_${TT(`第 ${from} 到 ${to} 頁`,`Pages ${from} to ${to}`)}`;
      const expectedNav={...s.nav,pages:count,
        links:s.nav.links.filter(x=>x.sourcePage>=start&&x.sourcePage<=end&&x.targetPage>=start&&x.targetPage<=end),
        targets:s.nav.targets.filter(x=>x.page>=start&&x.page<=end)};
      const allowedLinks=new Set(expectedNav.links.map(x=>`${x.sourcePage}|${x.kind}|${x.index}|${x.id}`));
      const fr=document.createElement('iframe'); fr.setAttribute('aria-hidden','true'); fr.tabIndex=-1;
      fr.style.cssText='position:fixed;left:-220vw;top:0;width:'+paperPageWidthMM()+'mm;height:'+paperPageHeightMM()+'mm;border:0;opacity:.01;pointer-events:none;background:#fff;z-index:-1';
      document.body.appendChild(fr); s.frame=fr; vectorPrintFrame=fr;
      const doc=fr.contentDocument, printBg=twthesisChineseDigitalTransparentPdf()?'transparent':'#fff';
      doc.open();
      doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${s.css.replace(/<\/style>/gi,'')}\n@page{size:${paperCssPageSize()};margin:0}html,body{margin:0!important;padding:0!important;width:auto!important;height:auto!important;background:${printBg}!important;overflow:visible!important}body{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}.vpdf-page{position:relative;width:${paperPageWidthMM()}mm;height:${paperPageHeightMM()}mm;margin:0;overflow:hidden;break-after:page;page-break-after:always;background:${printBg}}.vpdf-page:last-child{break-after:auto;page-break-after:auto}</style></head><body></body></html>`);
      doc.close();
      let htmlLength=0,disabledCrossBatchLinks=0;
      for(let n=start;n<=end;n++){
        check(s,isCancelled);
        const chunk=vectorPrintPageHTML(n,s.metas[n]); htmlLength+=chunk.length;
        const holder=doc.createElement('div'); holder.innerHTML=chunk;
        for(const a of holder.querySelectorAll('a.twthesis-nav-link[href^="#ty-twthesis-"]')){
          let id=(a.getAttribute('href')||'').slice(1); try{id=decodeURIComponent(id);}catch(_){}
          const key=`${n}|${a.dataset.twthesisNavKind||''}|${+(a.dataset.twthesisNavIndex||0)}|${id}`;
          if(!allowedLinks.has(key)){a.removeAttribute('href'); a.dataset.pdfCrossBatch='1'; disabledCrossBatchLinks++;}
        }
        while(holder.firstChild) doc.body.appendChild(holder.firstChild);
        progress(onProgress,{phase:'pages',from,to,page:n+1,completed:n-start+1,total:count,
          message:TT(`正在準備第 ${n+1} 頁（本批 ${n-start+1} / ${count}）…`,`Preparing page ${n+1} (${n-start+1} / ${count} in this batch)…`)});
        await yieldUI(); check(s,isCancelled);
      }
      progress(onProgress,{phase:'validation',from,to,message:TT('正在確認本批頁面與圖片…','Checking this batch’s pages and images…')});
      const ready=await waitBatchReady(s,doc,isCancelled); check(s,isCancelled);
      const checked=validateVectorPrintDocument(doc,count,expectedNav);
      const sourcePages=[...doc.querySelectorAll('.vpdf-page')].map(x=>+x.dataset.pdfPage);
      if(sourcePages.some((p,i)=>p!==from+i)) throw new Error(TT('分批來源頁碼驗證失敗。','Batch source-page verification failed.'));
      s.batch={from,to,pages:count,title,checked,ready,htmlLength,disabledCrossBatchLinks,sourcePages};
      s.status='prepared';
      window.__lastPdfBatchDiagnostic={mode:'vector-batch',totalPages:s.totalPages,...s.batch};
      return {...s.batch};
    } catch(err){
      if(session===s) await releaseSessionBatch(s);
      if(err.name!=='AbortError') window.__lastPdfError={mode:'vector-batch',message:err.message||String(err),at:Date.now(),from,to};
      throw err;
    }
  }
  function print(onReturn){
    const s=session;
    if(!s || s.status!=='prepared' || !s.frame || !s.batch)
      throw new Error(TT('請先準備這一批頁面。','Prepare this batch first.'));
    const run={frame:s.frame,batch:batchSummary(s.batch),onReturn,afterPrint:null,
      insidePrint:true,returned:false,notified:false,finishTimer:null};
    s.printRun=run;s.status='printing';
    const scheduleFinish=()=>{
      if(run.insidePrint || run.finishTimer!==null || !run.returned || run.notified) return;
      run.finishTimer=setTimeout(()=>{
        run.finishTimer=null;
        if(session!==s || s.printRun!==run || s.closed) return;
        const callback=run.onReturn,report={...run.batch,returned:true,saved:false};
        run.notified=true;run.onReturn=null;run.batch=null;
        try {run.frame.contentWindow.removeEventListener('afterprint',run.afterPrint);} catch(_){}
        run.afterPrint=null;s.status='returned';
        // Some engines dispatch afterprint before the native save sheet closes.
        // Keep the print document/title until the user's next batch-menu action
        // explicitly confirms the dialog is closed; that action awaits release.
        if(typeof callback==='function') callback(report);
      },0);
    };
    run.afterPrint=()=>{
      if(session!==s || s.printRun!==run) return;
      run.returned=true;scheduleFinish();
    };
    run.frame.contentWindow.addEventListener('afterprint',run.afterPrint);
    s.printTitle={previous:document.title,applied:run.batch.title};
    try {
      // macOS native printing can use the owning WebContents title, while
      // browser Save as PDF can use the child document's title. Set both.
      document.title=run.batch.title;
      run.frame.contentDocument.title=run.batch.title;
      run.frame.contentWindow.focus();
      run.frame.contentWindow.print();
    } catch(err){
      const batch=run.batch;
      if(session===s){
        releaseSessionBatch(s);
        window.__lastPdfError={mode:'vector-batch',message:err.message||String(err),at:Date.now(),from:batch.from,to:batch.to};
      }
      throw err;
    } finally {
      run.insidePrint=false;
      // Returning from print() alone is not a completion signal: some hosts
      // return asynchronously while the native Save dialog is still open.
      if(s.printRun===run) scheduleFinish();
    }
  }
  window.__CP178_BATCH_ENGINE__=Object.freeze({open,prepare,print,releaseBatch,close,
    getState:()=>session?result(session):{status:'closed',totalPages:0,maxPages:LIMIT,batch:null}});
})();
