
/* CP179: centred manual batches with awaited teardown between ranges.
 * Only the user can confirm that a PDF was saved. */
(() => {
  'use strict';
  let current = null;
  const engine = () => window.__CP178_BATCH_ENGINE__;
  const t = (zh,en) => TT(zh,en);
  const esc = value => escapeHtml(String(value));
  const style = document.createElement('style');
  style.id = 'cp178-batch-style';
  style.textContent = `
    #cp178-batch-dialog{position:fixed;inset:0;margin:auto;box-sizing:border-box;width:min(610px,calc(100vw - 32px));height:fit-content;max-height:calc(100vh - 32px);overflow:auto;padding:26px 28px;border:.5px solid var(--mac-hairline,var(--border,#d4d7dd));border-radius:var(--mac-radius-window,14px);background:var(--mac-glass-strong,var(--bg,#fff));color:var(--text-strong,var(--text,#23262c));box-shadow:var(--mac-shadow-window,0 24px 80px #0003);backdrop-filter:var(--mac-blur-strong);-webkit-backdrop-filter:var(--mac-blur-strong);font:14px/1.65 var(--font-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif)}
    #cp178-batch-dialog::backdrop{background:rgba(10,10,14,.26);backdrop-filter:blur(6px) saturate(120%);-webkit-backdrop-filter:blur(6px) saturate(120%)}
    #cp178-batch-dialog h2{font-size:17px;font-weight:600;letter-spacing:-.015em;line-height:1.35;margin:0 0 12px}
    #cp178-batch-dialog p{margin:8px 0}
    #cp178-batch-dialog .cp178-note{font-size:12px;color:var(--text-muted,#656c76)}
    #cp178-batch-dialog .cp178-fields{display:flex;flex-wrap:wrap;gap:12px;margin:18px 0}
    #cp178-batch-dialog label{display:flex;flex-direction:column;gap:5px;min-width:145px;flex:1}
    #cp178-batch-dialog select{font:inherit;max-width:100%;padding:7px 10px;color:inherit;background:var(--bg-secondary,#f5f6f8);border:1px solid var(--border,#d4d7dd);border-radius:7px}
    #cp178-batch-dialog .cp178-status{background:var(--bg-secondary,#f4f6fa);padding:12px;border-radius:9px;overflow-wrap:anywhere;margin:14px 0}
    #cp178-batch-dialog .cp178-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:9px;margin-top:20px}
    #cp178-batch-dialog button{min-height:36px;padding:7px 14px;border-radius:8px;border:1px solid var(--border,#d4d7dd);font:inherit;color:inherit;background:var(--bg-secondary,#f4f6fa);cursor:pointer}
    #cp178-batch-dialog button.cp178-primary{background:var(--mac-accent,#3564d8);color:white;border-color:transparent}
    #cp178-batch-dialog button:disabled{opacity:.5;cursor:default}
    #cp178-batch-dialog :focus-visible{outline:2px solid var(--mac-accent,#3564d8);outline-offset:3px}
    #cp178-batch-dialog progress{display:block;width:100%;height:8px;margin:12px 0}
    @media(hover:hover){#cp178-batch-dialog button:not(:disabled):hover{filter:brightness(.94)}}
    @media print{#cp178-batch-dialog{display:none!important}}
  `;
  document.head.appendChild(style);

  function range(s){ return {from:s.index*s.size+1,to:Math.min(s.total,(s.index+1)*s.size)}; }
  function completed(s,r){for(let p=r.from;p<=r.to;p++)if(!s.saved.has(p))return false;return true;}
  function focus(s,id){s.dialog.querySelector('#'+id)?.focus();}
  async function dismiss(s){
    if(current!==s)return;
    if(s.pending){s.cancelled=true;s.message=t('正在取消，待目前處理步驟結束後返回…','Cancelling after the current step finishes…');render(s);return;}
    s.pending=true;s.phase='releasing';s.message=t('正在清理列印內容…','Clearing print content…');render(s);
    await engine().close(); current=null;s.prepared=null;
    s.dialog.close();s.dialog.remove();
    window.removeEventListener('keydown',s.keyGuard,true);
    window.removeEventListener('dragover',s.dropGuard,true);
    window.removeEventListener('drop',s.dropGuard,true);
    if(s.previousFocus?.isConnected)s.previousFocus.focus();
  }
  async function releaseAnd(s,next){
    if(current!==s||s.pending)return;
    s.pending=true;s.phase='releasing';s.message=t('正在清理本批列印內容…','Clearing this batch’s print content…');render(s);
    try{await engine().releaseBatch();}
    catch(err){s.pending=false;s.phase='error';s.message=err.message||String(err);render(s);return;}
    s.pending=false;
    if(s.cancelled){await dismiss(s);return;}
    if(current===s)next();
  }
  function render(s){
    if(current!==s)return;
    const r=s.total?range(s):null;
    const selecting=s.phase==='select'||s.phase==='returned'||s.phase==='error';
    const options=[];
    for(let i=0;i<Math.ceil(s.total/s.size);i++){
      const x={from:i*s.size+1,to:Math.min(s.total,(i+1)*s.size)};
      options.push(`<option value="${i}" ${s.index===i?'selected':''}>${esc(t(`第 ${x.from}–${x.to} 頁`,`Pages ${x.from}–${x.to}`))}${completed(s,x)?' ✓':''}</option>`);
    }
    let actions='';
    if(s.pending)actions=`<button id="cp178-exit" ${s.cancelled?'disabled':''}>${t('取消分批匯出','Cancel batch export')}</button>`;
    else if(s.phase==='printing')actions=`<button id="cp178-return">${t('列印視窗已關閉，返回批次','Print dialog is closed; return to batches')}</button>`;
    else {
      actions=`<button id="cp178-exit">${t('返回編輯器','Back to editor')}</button>`;
      if(s.phase==='prepared')actions+=`<button id="cp178-reselect">${t('重新選擇','Change batch')}</button><button id="cp178-print" class="cp178-primary">${t('開啟列印畫面','Open print dialog')}</button>`;
      else if(s.phase==='returned')actions+=`<button id="cp178-prepare">${t('未儲存／重印本批','Not saved / retry batch')}</button><button id="cp178-saved" class="cp178-primary">${t('本批已儲存，選下一批','Batch saved; select next')}</button>`;
      else if(s.total&&s.phase!=='finished')actions+=`<button id="cp178-prepare" class="cp178-primary">${t('準備本批頁面','Prepare this batch')}</button>`;
      else if(s.phase==='finished')actions+=`<button id="cp178-reselect">${t('選擇批次重印','Select a batch to reprint')}</button>`;
    }
    s.dialog.innerHTML=`<h2 id="cp178-title">${t('分批匯出 PDF','Export PDF in batches')}</h2>
      <p>${t('每次只將選定頁面送到列印畫面，儲存後再手動處理下一批。','Send only the selected pages to the print dialog, save the PDF, then choose the next batch.')}</p>
      <p class="cp178-note">${t('頁次依整份文件順序計算，包含封面；內文原有頁碼與公式編號保留。跨批目錄連結保留文字，不提供跨檔跳轉。','Page ranges count from the start, including the cover. Printed page and equation numbers are preserved. Contents links across batches keep their text without cross-file navigation.')}</p>
      ${s.total?`<p><strong>${esc(s.fileName)}</strong> · ${t(`共 ${s.total} 頁；已確認儲存 ${s.saved.size} 頁`,`Total ${s.total} pages; ${s.saved.size} pages confirmed saved`)}</p>`:''}
      ${s.total?`<div class="cp178-fields"><label for="cp178-size">${t('每批頁數','Pages per batch')}<select id="cp178-size" ${!selecting||s.phase==='returned'?'disabled':''}><option value="100" ${s.size===100?'selected':''}>100</option><option value="50" ${s.size===50?'selected':''}>50</option><option value="25" ${s.size===25?'selected':''}>25</option><option value="10" ${s.size===10?'selected':''}>10</option></select></label><label for="cp178-range">${t('本次匯出範圍','Batch range')}<select id="cp178-range" ${!selecting||s.phase==='returned'?'disabled':''}>${options.join('')}</select></label></div>`:''}
      <div class="cp178-status" role="status" aria-live="polite"><span id="cp178-message">${esc(s.message)}</span>${s.pending?'<progress id="cp178-progress"></progress>':''}</div>
      ${s.phase==='prepared'?`<p class="cp178-note">${t('列印設定請選「全部」；此列印文件只有本批頁面。預設檔名：','Choose “All” pages in the print dialog; only this batch is present. Default filename:')}<br>${esc(s.prepared.title)}.pdf</p>`:''}
      ${s.phase==='returned'?`<p class="cp178-note">${t('軟體無法判斷你按了儲存或取消。確認檔案已存好後，再按「本批已儲存」。','The app cannot tell whether you saved or cancelled. Confirm that the file is saved before marking the batch saved.')}</p>`:''}
      <div class="cp178-actions">${actions}</div>`;
    const bind=(id,fn)=>{const el=s.dialog.querySelector('#'+id);if(el)el.onclick=fn;};
    bind('cp178-exit',()=>dismiss(s));
    bind('cp178-prepare',()=>prepare(s));
    bind('cp178-print',()=>print(s));
    bind('cp178-return',()=>releaseAnd(s,()=>returned(s)));
    bind('cp178-reselect',()=>releaseAnd(s,()=>{s.prepared=null;s.phase='select';s.message=t('請選擇要匯出的批次。','Choose a batch to export.');render(s);focus(s,'cp178-range');}));
    bind('cp178-saved',()=>releaseAnd(s,()=>{
      const batch=s.prepared;
      for(let p=batch.from;p<=batch.to;p++)s.saved.add(p);
      s.prepared=null;
      s.phase=s.saved.size===s.total?'finished':'select';
      const next=Array.from({length:Math.ceil(s.total/s.size)},(_,i)=>i).find(i=>!completed(s,{from:i*s.size+1,to:Math.min(s.total,(i+1)*s.size)}));
      if(next!==undefined)s.index=next;
      s.message=s.phase==='finished'?t('所有批次都已由你確認儲存完成。','You have confirmed that every batch is saved.'):t('已記錄本批。請按「準備本批頁面」繼續下一批。','Batch recorded. Select “Prepare this batch” to continue.');
      render(s);focus(s,s.phase==='finished'?'cp178-exit':'cp178-prepare');
    }));
    const size=s.dialog.querySelector('#cp178-size');
    if(size)size.onchange=()=>{const first=range(s).from;s.size=+size.value;s.index=Math.floor((first-1)/s.size);s.phase='select';render(s);focus(s,'cp178-size');};
    const select=s.dialog.querySelector('#cp178-range');
    if(select)select.onchange=()=>{s.index=+select.value;s.phase='select';render(s);focus(s,'cp178-range');};
  }
  function onProgress(s,p){
    if(current!==s||s.cancelled)return;
    s.message=p.message||s.message;
    const msg=s.dialog.querySelector('#cp178-message');if(msg)msg.textContent=s.message;
    const bar=s.dialog.querySelector('#cp178-progress');
    if(bar&&p.total){bar.max=p.total;bar.value=p.completed||0;}
  }
  async function prepare(s){
    if(s.pending||current!==s)return;
    s.pending=true;s.phase='preparing';s.cancelled=false;s.message=t('正在準備本批頁面…','Preparing this batch…');render(s);
    try{
      const r=range(s);
      const prepared=await engine().prepare(r.from,r.to,{onProgress:p=>onProgress(s,p),isCancelled:()=>s.cancelled});
      s.prepared={from:prepared.from,to:prepared.to,pages:prepared.pages,title:prepared.title};
      s.phase='prepared';s.message=t(`第 ${r.from}–${r.to} 頁已就緒；本批 ${s.prepared.pages} 頁。`,`Pages ${r.from}–${r.to} are ready; ${s.prepared.pages} pages in this batch.`);
      const missing=Math.max(prepared.ready?.placeholders||0,prepared.checked?.placeholders||0);
      if(missing)s.message+=' '+t(`注意：${missing} 張圖片以缺圖佔位呈現。`,`Note: ${missing} image(s) use missing-image placeholders.`);
    }catch(err){s.phase='error';s.message=err.message||String(err);}
    finally{s.pending=false;if(s.cancelled)await dismiss(s);else{render(s);focus(s,s.phase==='prepared'?'cp178-print':'cp178-prepare');}}
  }
  function returned(s){
    if(current!==s)return;
    s.phase='returned';s.message=t('列印流程已返回。確認儲存後會清理本批列印內容，再選下一批。','The print flow has returned. Confirm saving to clear this batch’s print content before selecting the next batch.');render(s);focus(s,'cp178-saved');
  }
  function print(s){
    if(s.phase!=='prepared')return;
    s.phase='printing';s.message=t('請在列印畫面另存為 PDF。關閉後回到這裡確認是否儲存。','Save as PDF in the print dialog, then return here to confirm whether it was saved.');render(s);
    try{engine().print(()=>returned(s));}catch(err){s.phase='error';s.message=err.message||String(err);render(s);focus(s,'cp178-prepare');}
  }
  window.exportPDFBatch=async function(){
    if(current){current.dialog.focus();return;}
    if(typeof isRevtexTheme==='function'&&isRevtexTheme()){
      toast(t('REVTeX 請使用原有的「匯出 PDF」，以保留 TeX 精確排版。','For REVTeX, use the existing PDF export to preserve the exact TeX layout.'),6500);return;
    }
    const dialog=document.createElement('dialog');dialog.id='cp178-batch-dialog';dialog.setAttribute('aria-labelledby','cp178-title');
    const s={dialog,previousFocus:document.activeElement,total:0,fileName:'',size:50,index:0,saved:new Set(),phase:'opening',pending:true,cancelled:false,message:t('正在準備文件…','Preparing the document…')};
    current=s;document.body.appendChild(dialog);
    // The application's capture handlers must not route shortcuts into the inert editor.
    s.keyGuard=e=>{
      if(current!==s)return;
      if(e.key==='Escape'){e.stopImmediatePropagation();return;}
      if(e.ctrlKey||e.metaKey||e.altKey||/^F\d+$/.test(e.key)){
        const nativeCopy=(e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey&&['a','c'].includes(e.key.toLowerCase());
        if(!nativeCopy)e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    s.dropGuard=e=>{if(current===s){e.preventDefault();e.stopImmediatePropagation();}};
    window.addEventListener('keydown',s.keyGuard,true);
    window.addEventListener('dragover',s.dropGuard,true);
    window.addEventListener('drop',s.dropGuard,true);
    dialog.addEventListener('cancel',e=>{e.preventDefault();if(s.phase!=='printing')dismiss(s);});
    render(s);dialog.showModal();
    try{
      const info=await engine().open({onProgress:p=>onProgress(s,p),isCancelled:()=>s.cancelled});
      s.total=info.totalPages;s.fileName=info.fileName;s.phase='select';s.message=t('每批可選 10、25、50 或 100 頁，預設為 50 頁。','Choose 10, 25, 50 or 100 pages per batch; the default is 50.');
    }catch(err){s.phase='error';s.message=err.message||String(err);}
    finally{s.pending=false;if(s.cancelled)await dismiss(s);else{render(s);focus(s,s.total?'cp178-prepare':'cp178-exit');}}
  };
})();
