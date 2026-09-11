
(() => {
'use strict';
const META=Object.freeze({checkpoint:'CP169B1',status:'candidate',productBase:'V128/CP168R1/1.1.2',dependsOn:'CP169A-P2',policy:'revtex-product-export-downloads-the-same-fresh-tex-pdf-bytes'});
const baseExportPDF=exportPDF;
let pendingAutoDownload=null;
function proof(){return window.__CP169A_TEX_PROOF__||null;}
function notify(message,ms=5000){try{toast(message,ms);}catch(_){console.info('[CP169B1]',message);}}
function clickSamePdf(){const button=document.getElementById('cp169a-download-pdf');if(!button||button.disabled)return false;button.click();return true;}
function stopPending(reason=''){if(pendingAutoDownload){clearInterval(pendingAutoDownload.timer);clearTimeout(pendingAutoDownload.timeout);pendingAutoDownload=null;}if(reason)console.info('[CP169B1]',reason);}
function waitAndDownload(startRevision){stopPending();
 const token={startRevision};
 token.timer=setInterval(()=>{const api=proof();if(!api)return;const s=api.getState();if(s.revision<=startRevision||s.busy||s.stale||!s.pdfBytes)return;if(clickSamePdf()){stopPending('fresh TeX PDF downloaded after product export compile');notify('REVTeX PDF 已由真正 pdfLaTeX 重新編譯並下載。');}},200);
 token.timeout=setTimeout(()=>{stopPending('automatic product PDF download timed out');notify('TeX 編譯尚未完成；請在「TeX 精確校樣」視窗查看錯誤或重新下載。',7000);},300000);
 pendingAutoDownload=token;
}
async function revtexProductExportPDF(){
 if(!isRevtexTheme())return baseExportPDF();
 const api=proof();
 if(!api){notify('TeX 精確校樣元件尚未載入。',7000);return false;}
 const s=api.getState();
 if(s.pdfBytes>0&&!s.stale){
   if(clickSamePdf()){notify('已下載目前精確校樣使用的同一份 TeX PDF。');return true;}
 }
 api.open();
 if(!s.initialized){
   notify('請先選取 REVTeX Engine Pack 並完成「驗證並初始化」，再匯出正式 PDF。',8000);
   const status=document.getElementById('cp169a-status');if(status){status.textContent='產品 PDF 需要先初始化真正 TeX 引擎';status.dataset.kind='warn';}
   return false;
 }
 if(s.busy){notify('TeX 引擎正在處理中；完成後請再次匯出。');return false;}
 const compile=document.getElementById('cp169a-compile');
 if(!compile||compile.disabled){notify('TeX 編譯目前不可用，請檢查 Engine Pack。',7000);return false;}
 const started=await api.compile();
 if(started===false){stopPending('CJK/engine preflight blocked product PDF');notify('這份稿件未送入 BusyTeX：請查看「TeX 精確校樣」中的安全預檢說明。',9000);return false;}
 waitAndDownload(s.revision);
 notify('正在以真正 pdfLaTeX 產生產品 PDF；成功後會自動下載同一份 bytes。');
 return true;
}
exportPDF=revtexProductExportPDF;
try{buildMenubar();}catch(error){console.warn('[CP169B1 buildMenubar]',error);}
document.addEventListener('input',()=>{if(pendingAutoDownload){const s=proof()?.getState();if(s&&!s.busy)stopPending('document changed before automatic export finished');}},true);
window.__CP169B1_REVTEX_PRODUCT_PDF__=Object.freeze({meta:META,exportPDF:revtexProductExportPDF,getState:()=>({pendingAutoDownload:!!pendingAutoDownload,proof:proof()?.getState()||null}),cancelPending:()=>stopPending('cancelled by API')});
})();


/* CP169B2 rejected candidate removed in CP169B3. */


