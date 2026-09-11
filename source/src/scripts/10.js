
/* CP169B3 R3: canonical-signature compile coordinator.
   Multiple hooks may report one edit, but one canonical state must produce at most one compile.
   A newer canonical state arriving during a compile queues exactly one follow-up revision. */
(() => {
'use strict';
const META=Object.freeze({
  version:'1.1.2.2',checkpoint:'CP169B3',milestone:'R3',status:'prototype',
  policy:'canonical-signature-coalescing-revision-safe-real-tex-background-compilation'
});
const q=s=>document.querySelector(s);
function defaultProof(){return window.__CP169A_TEX_PROOF__||null;}
function fnv1a(text){
  let h=0x811c9dc5;
  for(let i=0;i<text.length;i++){
    h^=text.charCodeAt(i);
    h=Math.imul(h,0x01000193)>>>0;
  }
  return h.toString(16).padStart(8,'0');
}
function canonicalSignature(){
  let markdown='';
  try{
    if(typeof blocks!=='undefined'&&Array.isArray(blocks))markdown=JSON.stringify(blocks);
    else if(typeof serialize==='function')markdown=String(serialize());
    else if(typeof losslessActiveNormalized==='function')markdown=String(losslessActiveNormalized());
  }catch(error){markdown='signature-error:'+String(error&&error.message||error);}
  const profile={};
  try{
    if(typeof settings==='object'&&settings){
      Object.keys(settings).filter(k=>k.startsWith('revtex')).sort().forEach(k=>{profile[k]=settings[k];});
    }
    if(typeof activeId!=='undefined')profile.activeId=activeId;
  }catch(_){}
  const payload=markdown+'\u0000'+JSON.stringify(profile);
  return fnv1a(payload)+':'+payload.length;
}
function createCoordinator(options={}){
  const getProof=options.proof||defaultProof;
  const getSignature=options.signature||canonicalSignature;
  const isEnabled=options.enabled||(()=>true);
  const debounceMs=Number.isFinite(options.debounceMs)?options.debounceMs:650;
  const pollMs=Number.isFinite(options.pollMs)?options.pollMs:100;
  const setStatus=options.status||(()=>{});
  const onDiagnostic=options.diagnostic||(()=>{});
  const onNeedEngine=options.startEngine||(()=>{});
  let timer=0,pollTimer=0,lastBusy=false,lastRevision=-1;
  let desiredSignature='',compiledSignature='',inFlightSignature='',failedSignature='';
  let expectedRevision=-1,pending=false,disposed=false;
  let requestCount=0,signatureChanges=0,compileStarts=0,compileCompletions=0,compileFailures=0,coalescedRequests=0;
  let lastReason='startup',lastStartedAt=0,lastCompletedAt=0;
  function observe(reason='observe'){
    const next=String(getSignature()||'');
    const changed=next!==desiredSignature;
    if(changed){
      desiredSignature=next;signatureChanges++;lastReason=reason;failedSignature='';
    }
    return changed;
  }
  function clearTimer(){if(timer){clearTimeout(timer);timer=0;}}
  function proofState(){return getProof()?.getState?.()||{};}
  function markStale(){try{getProof()?.markStale?.();}catch(_){} }
  function schedule(delay){
    if(disposed)return false;
    clearTimer();
    timer=setTimeout(()=>{timer=0;startCompile();},Math.max(0,delay));
    return true;
  }
  function startCompile(){
    if(disposed||!isEnabled())return false;
    observe('pre-compile');
    const api=getProof();if(!api)return false;
    const st=proofState();
    if(!st.initialized){onNeedEngine();return false;}
    if(st.busy){pending=desiredSignature!==inFlightSignature;setStatus('內容已變更，等待 TeX…');return false;}
    if(failedSignature&&failedSignature===desiredSignature)return false;
    if(st.pdfBytes&&compiledSignature===desiredSignature){
      if(!st.stale||api.reconcileStale?.(desiredSignature)){pending=false;return false;}
    }
    inFlightSignature=desiredSignature;
    expectedRevision=(st.revision||0)+1;
    pending=false;compileStarts++;lastStartedAt=Date.now();
    try{
      api.compile?.();
      setStatus('背景 pdfLaTeX 編譯中…');
      return true;
    }catch(error){
      failedSignature=inFlightSignature;inFlightSignature='';compileFailures++;
      setStatus('TeX 編譯啟動失敗','error');onDiagnostic(String(error&&error.stack||error),4500);
      return false;
    }
  }
  function request(immediate=false,reason='edit',force=false){
    if(disposed||!isEnabled())return false;
    requestCount++;
    const changed=observe(reason);
    if(changed)markStale();else coalescedRequests++;
    if(force){compiledSignature='';failedSignature='';markStale();}
    const api=getProof();if(!api)return false;
    const st=proofState();
    if(!st.initialized){pending=true;onNeedEngine();return false;}
    if(st.busy){pending=desiredSignature!==inFlightSignature||force;setStatus('內容已變更，等待 TeX…');return false;}
    if(!force&&st.pdfBytes&&compiledSignature===desiredSignature){
      if(!st.stale||api.reconcileStale?.(desiredSignature)){pending=false;return false;}
    }
    return schedule(immediate?0:debounceMs);
  }
  function poll(){
    if(disposed)return;
    if(!isEnabled()){clearTimer();pending=false;return;}
    const api=getProof();if(!api)return;
    const changed=observe('unreported-change');
    if(changed){markStale();if(!timer)request(false,'unreported-change');}
    let st=proofState();
    if(!st.initialized){onNeedEngine();return;}
    if(st.stale&&desiredSignature===compiledSignature&&api.reconcileStale?.(desiredSignature))st=proofState();
    if(st.busy){
      lastBusy=true;
      if(inFlightSignature&&desiredSignature!==inFlightSignature)pending=true;
      setStatus('背景 pdfLaTeX 編譯中…');
      lastRevision=st.revision??lastRevision;
      return;
    }
    if(lastBusy||(inFlightSignature&&st.revision>=expectedRevision)){
      lastBusy=false;lastCompletedAt=Date.now();
      const completed=inFlightSignature;
      if(completed){
        if(st.pdfBytes&&!st.stale&&st.revision>=expectedRevision){
          compiledSignature=completed;failedSignature='';compileCompletions++;
        }else if(desiredSignature===completed){
          failedSignature=completed;compileFailures++;
        }
        inFlightSignature='';expectedRevision=-1;
      }
      if(desiredSignature!==compiledSignature&&desiredSignature!==failedSignature){
        markStale();pending=false;schedule(0);setStatus('內容已更新，重新編譯 TeX…');
      }else if(failedSignature===desiredSignature){
        pending=false;setStatus('TeX 編譯失敗','error');onDiagnostic('目前內容的 TeX 編譯失敗；修改內容或手動重試後才會再次編譯。',4500);
      }else{
        pending=false;setStatus('互動可用／真 TeX 已同步','ok');
      }
    }else if(!inFlightSignature&&!timer&&st.pdfBytes&&!st.stale&&lastRevision!==st.revision){
      /* Adopt a fresh PDF created outside this coordinator (for example the first manual proof). */
      compiledSignature=desiredSignature;failedSignature='';
    }
    if(pending&&!st.busy&&!timer&&desiredSignature!==compiledSignature&&desiredSignature!==failedSignature){
      pending=false;schedule(0);
    }else if((!st.pdfBytes||st.stale)&&!timer&&!inFlightSignature&&desiredSignature!==failedSignature){
      schedule(debounceMs);
    }
    lastRevision=st.revision??lastRevision;
  }
  function retry(){failedSignature='';return request(true,'manual-retry',true);}
  function start(){if(!pollTimer)pollTimer=setInterval(poll,pollMs);poll();return api;}
  function dispose(){disposed=true;clearTimer();if(pollTimer){clearInterval(pollTimer);pollTimer=0;}}
  function state(){return {timer:!!timer,pending,lastBusy,lastRevision,desiredSignature,compiledSignature,inFlightSignature,failedSignature,expectedRevision,requestCount,signatureChanges,compileStarts,compileCompletions,compileFailures,coalescedRequests,lastReason,lastStartedAt,lastCompletedAt,proof:proofState()};}
  const api=Object.freeze({request,poll,retry,start,dispose,getState:state,currentSignature:()=>String(getSignature()||'')});
  return api;
}
window.__CP169B3_SCHEDULER_FACTORY__=Object.freeze({meta:META,create:createCoordinator,signature:canonicalSignature,fnv1a});
let coordinator=null,autoLoading=false,loadFailed=false;
function status(text,kind='pending'){
  const el=q('#cp169b3-status');if(!el)return;
  el.textContent=text;el.dataset.kind=kind;
}
function diagnostic(text,ms=2600){
  let el=q('#cp169b3-diagnostic');
  if(!el){el=document.createElement('div');el.id='cp169b3-diagnostic';el.hidden=true;document.body.appendChild(el);}
  el.textContent=text;el.hidden=false;
  clearTimeout(el._hideTimer);el._hideTimer=setTimeout(()=>el.hidden=true,ms);
}
function removeRejectedSurface(){
  document.body.classList.remove('cp169b2-exact-mode');
  q('#cp169b2-stage')?.remove();q('#cp169b2-editor-drawer')?.remove();q('#cp169b2-log-drawer')?.remove();
  q('[data-cp169b2-edit]')?.remove();q('[data-cp169b2-refresh]')?.remove();q('[data-cp169b2-download]')?.remove();q('[data-cp169b2-log]')?.remove();q('#cp169b2-freshness')?.remove();
  const pages=q('#revtex-wysiwyg>.rvx-live-pages');if(pages){pages.removeAttribute('aria-hidden');pages.style.removeProperty('display');}
}
function ensureToolbar(){
  if(!isRevtexTheme())return;
  const host=typeof rvxEnsureHost==='function'?rvxEnsureHost():q('#revtex-wysiwyg');if(!host)return;
  removeRejectedSurface();document.body.classList.add('cp169b3-mode');
  const bar=document.querySelector('.cp169-revtex-calibration-panel .rvx-live-toolbar, #revtex-wysiwyg .rvx-live-toolbar');if(!bar)return;
  let st=q('#cp169b3-status');
  if(!st){st=document.createElement('span');st.id='cp169b3-status';st.dataset.kind='pending';st.textContent='互動可用／TeX 待驗證';const layout=bar.querySelector('.rvx-live-layout');bar.insertBefore(st,layout||null);}
  if(!bar.querySelector('[data-cp169b3-compile]')){
    const b=document.createElement('button');b.type='button';b.dataset.cp169b3Compile='1';b.textContent='驗證 TeX';b.title='強制以目前 canonical Markdown 重新執行真正 pdfLaTeX';
    b.onclick=()=>coordinator?.retry();const layout=bar.querySelector('.rvx-live-layout');bar.insertBefore(b,layout||null);
  }
}
async function startEngine(){
  const a=defaultProof();if(!a||autoLoading||loadFailed)return;
  const st=a.getState?.();if(st?.initialized)return;
  autoLoading=true;status('載入 TeX 引擎…');
  try{await a.autoLoad('../03_Engine_Pack/engine/');status('TeX 引擎已就緒');coordinator?.request(true,'engine-ready',true);}
  catch(err){loadFailed=true;status('Engine Pack 未連結','error');diagnostic('單獨 HTML 未連結 Engine Pack；互動編輯仍可使用。');}
  finally{autoLoading=false;}
}
function requestCompile(immediate=false,reason='edit'){if(!isRevtexTheme())return false;ensureToolbar();return coordinator?.request(!!immediate,reason,false)||false;}
coordinator=createCoordinator({proof:defaultProof,signature:canonicalSignature,enabled:()=>isRevtexTheme()&&!settings.srcmode,status,diagnostic,startEngine,debounceMs:650,pollMs:100});
function afterLayoutControl(target){
  if(!isRevtexTheme())return;
  const relevant=target.closest?.('[data-rvx-live-layout],[data-rvx-live-settings],#prefs,[data-pref],[name^="revtex"]');if(!relevant)return;
  setTimeout(()=>{window.__CP165_REVTEX__?.schedule?.(true);requestCompile(false,'layout');},0);
}
document.addEventListener('click',e=>afterLayoutControl(e.target),true);
document.addEventListener('change',e=>afterLayoutControl(e.target),true);
document.addEventListener('input',e=>{if(isRevtexTheme()&&e.target?.id==='pe-text'){status('輸入中／準備 TeX…');requestCompile(false,'paper-input');}},true);
const oldSync=window.paperEditSyncFromTextarea;
if(typeof oldSync==='function')window.paperEditSyncFromTextarea=function(){const changed=oldSync.apply(this,arguments);if(changed&&isRevtexTheme())requestCompile(false,'paper-sync');return changed;};
const oldFinish=window.finishPaperEdit;
if(typeof oldFinish==='function')window.finishPaperEdit=function(commit){const before=typeof peIndex==='number'?peIndex:-1;const r=oldFinish.apply(this,arguments);if(commit&&before>=0&&isRevtexTheme())requestCompile(false,'paper-finish');return r;};
coordinator.start();setTimeout(()=>{ensureToolbar();coordinator.poll();},0);
window.__CP169B3_INTERACTIVE__=Object.freeze({
  meta:META,requestCompile,ensureToolbar,currentSignature:canonicalSignature,
  retryCompile:()=>coordinator.retry(),getState:()=>({...coordinator.getState(),autoLoading,loadFailed})
});
})();
