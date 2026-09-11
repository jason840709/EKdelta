
(() => {
'use strict';
if (window.__CP169B3_PDFIUM_BRIDGE__) return;
const state={registered:false,activating:false,legacyOverlaySuppressed:false,lastDocumentSha:'',lastDocumentBytes:0,lastError:'',loads:0,pageRenders:0,textLoads:0,autoActivations:0,lastLoadMs:0};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function ensureLegacyIsolationStyle(){
  if(document.getElementById('cp169b3-r4-legacy-isolation'))return;
  const style=document.createElement('style');
  style.id='cp169b3-r4-legacy-isolation';
  style.textContent='body.cp169b3-r4-main-view #cp169a-overlay{display:none!important}body.cp169b3-r4-main-view #cp169a-pdf{pointer-events:none!important}';
  document.head.appendChild(style);
}
function suppressLegacyProofOverlay(){
  ensureLegacyIsolationStyle();
  document.body.classList.add('cp169b3-r4-main-view');
  const overlay=document.getElementById('cp169a-overlay');
  if(overlay){overlay.hidden=true;overlay.setAttribute('aria-hidden','true');overlay.inert=true;}
  const iframe=document.getElementById('cp169a-pdf');
  if(iframe){iframe.style.pointerEvents='none';iframe.tabIndex=-1;}
  state.legacyOverlaySuppressed=true;
}
function showLegacyProofControls(){
  document.body.classList.remove('cp169b3-r4-main-view');
  const overlay=document.getElementById('cp169a-overlay');
  if(overlay){overlay.inert=false;overlay.removeAttribute('aria-hidden');overlay.hidden=false;}
  const iframe=document.getElementById('cp169a-pdf');
  if(iframe){iframe.style.pointerEvents='';iframe.removeAttribute('tabindex');}
  state.legacyOverlaySuppressed=false;
}
async function sha256Hex(bytes){const raw=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);if(globalThis.crypto&&crypto.subtle){const hash=await crypto.subtle.digest('SHA-256',raw);return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');}if(typeof globalThis.__CP169_SHA256__==='function'){const h=new globalThis.__CP169_SHA256__();h.update(raw);return h.digestHex();}throw new Error('No SHA-256 implementation available');}
async function postPdf(bytes){const raw=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);const started=performance.now();let info;if(typeof window.cp169PdfiumLoad==='function'){info=await window.cp169PdfiumLoad(Array.from(raw));}else{const response=await fetch('/cp169-api/pdf',{method:'POST',headers:{'Content-Type':'application/pdf'},body:raw});if(!response.ok)throw new Error(`PDF bridge POST failed: ${response.status} ${await response.text()}`);info=await response.json();}const local=await sha256Hex(raw);if(info.sha256!==local)throw new Error(`PDF SHA mismatch: browser ${local}, bridge ${info.sha256}`);state.lastDocumentSha=local;state.lastDocumentBytes=raw.byteLength;state.lastLoadMs=Math.round(performance.now()-started);state.loads++;return info;}
function viewport(pageInfo,scale){scale=Number(scale)||1;return{width:pageInfo.width*scale,height:pageInfo.height*scale,scale,rotation:0,viewBox:[0,0,pageInfo.width,pageInfo.height]};}
async function getPageText(info,pageInfo){if(typeof window.cp169PdfiumText==='function')return await window.cp169PdfiumText(info.id,pageInfo.page);const response=await fetch(`/cp169-api/pdf/${info.id}/page/${pageInfo.page}.text.json`);if(!response.ok)throw new Error(`PDF bridge text failed: ${response.status}`);const value=await response.json();state.textLoads++;return value;}
function makePage(info,pageInfo){return{pageNumber:pageInfo.page,getViewport:({scale=1}={})=>viewport(pageInfo,scale),getTextContent:()=>getPageText(info,pageInfo),render({canvasContext,viewport:vp,transform}){const dpr=Array.isArray(transform)&&Number(transform[0])>0?Number(transform[0]):1;const pixelScale=Math.max(.25,Math.min(8,vp.scale*dpr));const promise=(async()=>{const url=`/cp169-api/pdf/${info.id}/page/${pageInfo.page}.png?scale=${encodeURIComponent(pixelScale)}`;let blob;if(typeof window.cp169PdfiumRender==='function'){const result=await window.cp169PdfiumRender(info.id,pageInfo.page,pixelScale);const binary=atob(result.base64);const data=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)data[i]=binary.charCodeAt(i);blob=new Blob([data],{type:'image/png'});}else{const response=await fetch(url);if(!response.ok)throw new Error(`PDF bridge page failed: ${response.status}`);blob=await response.blob();}const bitmap=await createImageBitmap(blob);const canvas=canvasContext.canvas;canvasContext.save();canvasContext.setTransform(1,0,0,1,0,0);canvasContext.fillStyle='#fff';canvasContext.fillRect(0,0,canvas.width,canvas.height);canvasContext.drawImage(bitmap,0,0,canvas.width,canvas.height);canvasContext.restore();bitmap.close();state.pageRenders++;})();return{promise};}};}
const renderer={name:'CP169 PDFium same-byte bridge',async load(bytes){const info=await postPdf(bytes);return{numPages:info.numPages,_cpPdfSha256:info.sha256,_cpPdfBytes:info.bytes,async getPage(pageNo){const pageInfo=info.pages[pageNo-1];if(!pageInfo)throw new Error(`PDF page ${pageNo} out of range`);return makePage(info,pageInfo);}};}};
function register(){const viewer=window.__CP169B3_VIEWER__;if(!viewer?.registerRenderer)return false;viewer.registerRenderer(renderer);state.registered=true;document.dispatchEvent(new CustomEvent('cp169b3:renderer-ready',{detail:{name:renderer.name}}));return true;}
async function activateFresh(){const viewer=window.__CP169B3_VIEWER__,proof=window.__CP169A_TEX_PROOF__;if(!viewer||!proof||!state.registered||state.activating)return false;const ps=proof.getState?.()||{},vs=viewer.getState?.()||{};if(!ps.pdfBytes||ps.busy||ps.stale)return false;state.activating=true;try{let changed=false;if(!vs.active){await viewer.activate();state.autoActivations++;changed=true;}else if(vs.revision!==ps.revision){await viewer.refresh(true);changed=true;}suppressLegacyProofOverlay();return changed;}catch(error){state.lastError=String(error&&error.stack||error);console.error('[CP169 PDFium bridge]',error);return false;}finally{state.activating=false;}}
async function boot(){for(let i=0;i<240&&!register();i++)await sleep(50);if(!state.registered){state.lastError='CP169 viewer API not found';return;}setInterval(activateFresh,250);document.addEventListener('cp169b3:mapping-ready',()=>{const viewer=window.__CP169B3_VIEWER__;if(viewer?.getState?.().active)viewer.refresh(true);else activateFresh();});document.addEventListener('cp169b3:proof-fresh',activateFresh);activateFresh();}
window.__CP169B3_PDFIUM_BRIDGE__=Object.freeze({meta:{checkpoint:'CP169B3',milestone:'R4',status:'development-proof',samePdfBytes:true,portable:false,renderer:'pypdfium2-local-bridge',legacyProofIframeMainSurface:false},renderer,register,activateFresh,suppressLegacyProofOverlay,showLegacyProofControls,getState:()=>({...state,legacyOverlayHidden:document.getElementById('cp169a-overlay')?.hidden!==false,legacyOverlayBodyClass:document.body.classList.contains('cp169b3-r4-main-view')})});
if(!document.documentElement.hasAttribute('data-cp169-r6-html-calibration'))boot();
})();
