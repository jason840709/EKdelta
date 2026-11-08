
(() => {
'use strict';
const CP169_META=Object.freeze({checkpoint:'CP169A-P2',status:'candidate',productBase:'V128/CP168R1/1.1.2',engine:'texlyre-busytex 1.2.3',texlive:'recommended',policy:'external-engine-pack-true-tex-pdf-same-bytes'});
const EXPECTED=Object.freeze({
  'busytex.js':Object.freeze({bytes:271047,sha256:'316a48050159ce60d57aa58d66b5cf3ca7a8f13525179f1d2dd56ed095a49819'}),
  'busytex.wasm':Object.freeze({bytes:32501975,sha256:'58d60c73c2aa4fc09ae86d671d13e083c5cd7c34ab8878f42abba29a1cf0348f'}),
  'busytex_pipeline.js':Object.freeze({bytes:33701,sha256:'5fea68b97caa45cfd17899903811442fc0310b50888ef3787d3ac3457ed5fced'}),
  'texlive-recommended.js':Object.freeze({bytes:3885771,sha256:'7e4b1e21ad226311448aa30f8dcb95da7a1ace9742fcbf4121c17e8cc6cb7f8d'}),
  'texlive-recommended.data':Object.freeze({bytes:199273688,sha256:'beb1aa426fa8547df9ee2405de476ebc9ba56b4c61cdb9e5499e4addb1a7a5b1'})
});
const state={files:null,worker:null,initialized:false,busy:false,revision:0,lastPdf:null,lastTex:'',lastLog:'',lastAux:null,lastSynctex:null,lastPdfUrl:'',stale:false,lastCompiledSignature:'',engineSummary:null,directRoot:'',engineTransport:'file-blob'};
const $id=id=>document.getElementById(id);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hex=bytes=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
class CP169Sha256{
  constructor(){this.h=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);this.buf=new Uint8Array(64);this.bufLen=0;this.bytes=0n;this.w=new Uint32Array(64);}
  static get K(){return new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);}
  rotr(x,n){return (x>>>n)|(x<<(32-n));}
  transform(chunk){const w=this.w,K=CP169Sha256.K;for(let i=0;i<16;i++){const j=i*4;w[i]=((chunk[j]<<24)|(chunk[j+1]<<16)|(chunk[j+2]<<8)|chunk[j+3])>>>0;}for(let i=16;i<64;i++){const a=w[i-15],b=w[i-2],s0=(this.rotr(a,7)^this.rotr(a,18)^(a>>>3))>>>0,s1=(this.rotr(b,17)^this.rotr(b,19)^(b>>>10))>>>0;w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;}let [a,b,c,d,e,f,g,h]=this.h;for(let i=0;i<64;i++){const S1=(this.rotr(e,6)^this.rotr(e,11)^this.rotr(e,25))>>>0,ch=((e&f)^((~e)&g))>>>0,t1=(h+S1+ch+K[i]+w[i])>>>0,S0=(this.rotr(a,2)^this.rotr(a,13)^this.rotr(a,22))>>>0,maj=((a&b)^(a&c)^(b&c))>>>0,t2=(S0+maj)>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}this.h[0]=(this.h[0]+a)>>>0;this.h[1]=(this.h[1]+b)>>>0;this.h[2]=(this.h[2]+c)>>>0;this.h[3]=(this.h[3]+d)>>>0;this.h[4]=(this.h[4]+e)>>>0;this.h[5]=(this.h[5]+f)>>>0;this.h[6]=(this.h[6]+g)>>>0;this.h[7]=(this.h[7]+h)>>>0;}
  update(data){if(!(data instanceof Uint8Array))data=new Uint8Array(data);this.bytes+=BigInt(data.length);let at=0;if(this.bufLen){const take=Math.min(64-this.bufLen,data.length);this.buf.set(data.subarray(0,take),this.bufLen);this.bufLen+=take;at+=take;if(this.bufLen===64){this.transform(this.buf);this.bufLen=0;}}while(at+64<=data.length){this.transform(data.subarray(at,at+64));at+=64;}if(at<data.length){this.buf.set(data.subarray(at),0);this.bufLen=data.length-at;}return this;}
  digestHex(){const bits=this.bytes*8n;this.buf[this.bufLen++]=0x80;if(this.bufLen>56){this.buf.fill(0,this.bufLen,64);this.transform(this.buf);this.bufLen=0;}this.buf.fill(0,this.bufLen,56);for(let i=0;i<8;i++)this.buf[63-i]=Number((bits>>BigInt(i*8))&255n);this.transform(this.buf);return [...this.h].map(x=>x.toString(16).padStart(8,'0')).join('');}
}
window.__CP169_SHA256__=CP169Sha256;
const sha256=async file=>{if(globalThis.crypto&&crypto.subtle){return hex(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()));}const h=new CP169Sha256(),reader=file.stream().getReader();for(;;){const {done,value}=await reader.read();if(done)break;h.update(value);}return h.digestHex();};
const fmtBytes=n=>n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(1)} MB`;
const safeName=s=>String(s||'manuscript').replace(/\.(md|markdown|txt|tex)$/i,'').replace(/[^A-Za-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'')||'manuscript';
/* 1.2.6：狀態與進度同時廣播（cp169a:status），國際論文右半邊的狀態列直接顯示，
   不再需要打開這個面板才看得到引擎載入到哪裡、哪裡出錯。 */
const cp169Broadcast=()=>{try{window.dispatchEvent(new CustomEvent('cp169a:status',{detail:{status:state.statusText||'',kind:state.statusKind||'',progress:state.progressText||'',initialized:!!state.initialized,busy:!!state.busy}}));}catch(_){}};
const setStatus=(message,kind='')=>{state.statusText=message;state.statusKind=kind;const el=$id('cp169a-status');if(el){el.textContent=message;el.dataset.kind=kind;}cp169Broadcast();};
const setProgress=(message)=>{state.progressText=message||'';const el=$id('cp169a-progress');if(el)el.textContent=message||'';cp169Broadcast();};
const setBusy=busy=>{state.busy=!!busy;['cp169a-init','cp169a-compile','cp169a-engine-folder'].forEach(id=>{const el=$id(id);if(el)el.disabled=!!busy;});const c=$id('cp169a-cancel');if(c)c.disabled=!busy;cp169Broadcast();};
function downloadBytes(bytes,name,type){if(!bytes)return;const blob=bytes instanceof Blob?bytes:new Blob([bytes],{type:type||'application/octet-stream'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function markStale(){if(!state.lastPdf||state.stale)return;state.stale=true;const b=$id('cp169a-stale');if(b){b.hidden=false;b.textContent='目前 PDF 已過期，請重新編譯';}}function reconcileStale(signature){const sig=String(signature||'');if(!state.lastPdf||!sig||state.lastCompiledSignature!==sig)return false;state.stale=false;const b=$id('cp169a-stale');if(b)b.hidden=true;const pdf=$id('cp169a-download-pdf');if(pdf)pdf.disabled=false;return true;}
function clearResult(){if(state.lastPdfUrl)URL.revokeObjectURL(state.lastPdfUrl);state.lastPdfUrl='';state.lastPdf=null;state.lastTex='';state.lastLog='';state.lastAux=null;state.lastSynctex=null;state.stale=false;const frame=$id('cp169a-pdf');if(frame)frame.removeAttribute('src');const stale=$id('cp169a-stale');if(stale)stale.hidden=true;['cp169a-download-pdf','cp169a-download-tex','cp169a-download-log','cp169a-download-aux','cp169a-download-synctex'].forEach(id=>{const el=$id(id);if(el)el.disabled=true;});}
function bestFile(files,name){const hits=files.filter(f=>f.name===name);if(!hits.length)return null;hits.sort((a,b)=>{const ap=(a.webkitRelativePath||'').includes('/assets/busytex/')?0:1,bp=(b.webkitRelativePath||'').includes('/assets/busytex/')?0:1;return ap-bp||(a.webkitRelativePath||'').length-(b.webkitRelativePath||'').length;});return hits[0];}
async function selectEngineFiles(list){const all=[...list],selected={};for(const name of Object.keys(EXPECTED)){const f=bestFile(all,name);if(!f)throw new Error(`缺少必要引擎檔案：${name}`);selected[name]=f;}
  state.files=selected;state.initialized=false;terminateWorker(false);clearResult();
  const box=$id('cp169a-engine-summary');box.innerHTML=Object.entries(selected).map(([name,f])=>`<div><code>${name}</code><span>${fmtBytes(f.size)}</span></div>`).join('');
  setStatus('已選取引擎包；尚未驗證','pending');$id('cp169a-init').disabled=false;
}
async function verifyFiles(){if(!state.files)throw new Error('請先選取 REVTeX Engine Pack 資料夾。');const report={};for(const [name,expected] of Object.entries(EXPECTED)){const f=state.files[name];if(f.size!==expected.bytes)throw new Error(`${name} 大小不符：${f.size}，預期 ${expected.bytes}`);setProgress(`驗證 ${name}…`);const actual=await sha256(f);if(actual!==expected.sha256)throw new Error(`${name} SHA-256 不符。\n實際：${actual}\n預期：${expected.sha256}`);report[name]={bytes:f.size,sha256:actual};await sleep(0);}state.engineSummary=report;return report;}
function cp169EngineUrl(root,name){return new URL(encodeURIComponent(name),String(root)).href;}
function cp169ShowEngineSummary(report){const box=$id('cp169a-engine-summary');if(!box)return;box.innerHTML=Object.entries(report||{}).map(([name,row])=>`<div><code>${name}</code><span>${fmtBytes(Number(row&&row.bytes)||0)}</span></div>`).join('');}
async function cp169HashResponse(response,name,expected){if(!response||!response.ok)throw new Error(`無法載入 ${name}：HTTP ${response&&response.status}`);const declared=Number(response.headers&&response.headers.get('content-length')||0);if(declared&&declared!==expected.bytes)throw new Error(`${name} 大小不符：${declared}，預期 ${expected.bytes}`);if(!response.body||typeof response.body.getReader!=='function')throw new Error(`${name} 無法以串流驗證。`);const h=new CP169Sha256(),reader=response.body.getReader();let bytes=0;for(;;){const {done,value}=await reader.read();if(done)break;const u=value instanceof Uint8Array?value:new Uint8Array(value);bytes+=u.byteLength;h.update(u);}if(bytes!==expected.bytes)throw new Error(`${name} 大小不符：${bytes}，預期 ${expected.bytes}`);const actual=h.digestHex();if(actual!==expected.sha256)throw new Error(`${name} SHA-256 不符。\n實際：${actual}\n預期：${expected.sha256}`);return {bytes,sha256:actual};}
async function cp169VerifyDirectRoot(root){const report={};for(const [name,expected] of Object.entries(EXPECTED)){setProgress(`串流驗證 ${name}…`);const response=await fetch(cp169EngineUrl(root,name),{cache:'no-store'});report[name]=await cp169HashResponse(response,name,expected);await sleep(0);}state.engineSummary=report;cp169ShowEngineSummary(report);return report;}
function cp169AdaptPackageJs(packageJs){const cacheStart="        try {\n          var db = await openDatabase();",cacheEnd="\n        Module['setStatus'] && Module['setStatus']('Downloading...');",cacheAt=packageJs.indexOf(cacheStart),cacheEndAt=packageJs.indexOf(cacheEnd,cacheAt);if(cacheAt<0||cacheEndAt<0)throw new Error('TeX Live loader adapter anchor missing.');return packageJs.slice(0,cacheAt)+"        var packageData = await fetchRemotePackage(REMOTE_PACKAGE_NAME, REMOTE_PACKAGE_SIZE);\n        processPackageData(packageData);\n"+packageJs.slice(cacheEndAt);}
const WORKER_LOGIC=`
let pipeline=null,packageUrl=null,revision=0,allowedEngineRoot='';
const send=(type,data={})=>postMessage({type,...data});
const makeUrl=(value,type)=>URL.createObjectURL(new Blob([value],{type}));
const nativeFetch=self.fetch.bind(self);
self.fetch=(input,init)=>{const u=typeof input==='string'?input:String(input&&input.url||input);if(u.startsWith('blob:')||u.startsWith('data:')||(allowedEngineRoot&&u.startsWith(allowedEngineRoot)))return nativeFetch(input,init);throw new Error('CP169A network blocked: '+u);};
onmessage=async({data})=>{try{
 if(data.type==='init'){
  revision=data.revision||0;allowedEngineRoot=String(data.engineRoot||'');send('status',{message:'建立離線 pdfLaTeX Worker…'});
  const engineUrl=makeUrl(data.engineJs,'text/javascript'),wasmUrl=makeUrl(data.wasm,'application/wasm');
  packageUrl=makeUrl(data.packageJs,'text/javascript');const packageDataUrl=data.packageDataUrl||makeUrl(data.packageData,'application/octet-stream');
  const originalLocate=BusytexPipeline.locateFile;BusytexPipeline.locateFile=name=>name==='texlive-recommended.data'?packageDataUrl:originalLocate.call(BusytexPipeline,name);
  const started=performance.now();
  pipeline=new BusytexPipeline(engineUrl,wasmUrl,[packageUrl],[packageUrl],[],m=>send('progress',{message:String(m)}),versions=>send('versions',{versions}),true,BusytexPipeline.ScriptLoaderWorker);
  await pipeline.on_initialized_promise;send('initialized',{revision,milliseconds:Math.round(performance.now()-started)});return;
 }
 if(data.type==='compile'){
  if(!pipeline)throw new Error('TeX 引擎尚未初始化。');revision=data.revision;const started=performance.now();
  const result=await pipeline.compile(data.files,'main.tex',!!data.bibtex,false,true,'debug','pdftex_bibtex8',[packageUrl],'',false);
  const outputs=await pipeline.read_project_files();const auxEntry=outputs.find(x=>x.path==='main.aux');const aux=auxEntry?auxEntry.contents:null;
  const payload={type:'compiled',revision,success:result.exit_code===0,exitCode:result.exit_code,log:result.log||'',milliseconds:Math.round(performance.now()-started),pdf:result.pdf||null,synctex:result.synctex||null,aux:aux||null};
  const transfer=[];for(const key of ['pdf','synctex','aux'])if(payload[key]&&payload[key].buffer)transfer.push(payload[key].buffer);postMessage(payload,transfer);return;
 }
}catch(error){send('error',{revision:data&&data.revision||revision,message:String(error&&error.message||error),stack:error&&error.stack||''});}};
`;
function terminateWorker(update=true){if(state.worker){try{state.worker.terminate();}catch(_){}state.worker=null;}state.initialized=false;state.busy=false;if(update){setBusy(false);setStatus('編譯已取消；請重新初始化引擎','warn');setProgress('');}}
async function initEngine(){try{state.directRoot='';state.engineTransport='file-blob';setBusy(true);clearResult();setStatus('驗證引擎資產…','pending');await verifyFiles();setStatus('載入約 200 MB TeX Live Recommended…','pending');setProgress('讀取引擎檔案…');
 const pipelineSource=await state.files['busytex_pipeline.js'].text(),engineJs=await state.files['busytex.js'].text();let packageJs=cp169AdaptPackageJs(await state.files['texlive-recommended.js'].text());const wasm=await state.files['busytex.wasm'].arrayBuffer(),packageData=await state.files['texlive-recommended.data'].arrayBuffer();
 const workerUrl=URL.createObjectURL(new Blob([pipelineSource+'\n'+WORKER_LOGIC],{type:'text/javascript'}));const worker=new Worker(workerUrl);URL.revokeObjectURL(workerUrl);state.worker=worker;const rev=++state.revision;
 worker.onmessage=event=>onWorkerMessage(event.data);worker.onerror=event=>{setBusy(false);setStatus('Worker 錯誤','error');setProgress(event.message||String(event));};
 worker.postMessage({type:'init',revision:rev,engineJs,wasm,packageJs,packageData},[wasm,packageData]);
 }catch(error){setBusy(false);setStatus('引擎初始化失敗','error');setProgress(error.message||String(error));console.error('[CP169A init]',error);}}
async function cp169InitDirect(root,report){try{state.files=null;state.directRoot=String(root);state.engineTransport='direct-package-url';state.engineSummary=report||state.engineSummary;setBusy(true);clearResult();cp169ShowEngineSummary(state.engineSummary);setStatus('載入 TeX 引擎（大資料直接串流）…','pending');setProgress('不建立 199 MB package Blob；Worker 直接讀取 ekdeta://engine/texlive-recommended.data');
 const get=async name=>{const r=await fetch(cp169EngineUrl(root,name),{cache:'no-store'});if(!r.ok)throw new Error(`無法載入 ${name}：HTTP ${r.status}`);return r;};
 const pipelineSource=await (await get('busytex_pipeline.js')).text(),engineJs=await (await get('busytex.js')).text();let packageJs=cp169AdaptPackageJs(await (await get('texlive-recommended.js')).text());const wasm=await (await get('busytex.wasm')).arrayBuffer();
 const workerUrl=URL.createObjectURL(new Blob([pipelineSource+'\n'+WORKER_LOGIC],{type:'text/javascript'}));const worker=new Worker(workerUrl);URL.revokeObjectURL(workerUrl);state.worker=worker;const rev=++state.revision;
 worker.onmessage=event=>onWorkerMessage(event.data);worker.onerror=event=>{setBusy(false);setStatus('Worker 錯誤','error');setProgress(event.message||String(event));};
 worker.postMessage({type:'init',revision:rev,engineJs,wasm,packageJs,engineRoot:String(root),packageDataUrl:cp169EngineUrl(root,'texlive-recommended.data')},[wasm]);
 }catch(error){setBusy(false);setStatus('引擎初始化失敗','error');setProgress(error.message||String(error));console.error('[CP169A direct init]',error);}}
function cp169CloneCompileContents(file){
  if (!file) return null;
  const v = file.contents !== undefined ? file.contents
          : file.bytes !== undefined ? file.bytes
          : file.text !== undefined ? file.text : null;
  if (typeof v === 'string') return v;
  if (v instanceof Uint8Array) return new Uint8Array(v); // copy, do not transfer the job buffer
  if (v instanceof ArrayBuffer) return new Uint8Array(v.slice(0));
  if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength));
  return v == null ? null : String(v);
}
function cp169ProjectPath(path){
  return String(path || '').replace(/\\/g,'/').replace(/^\.\//,'').replace(/^\/+/, '');
}
async function currentProjectFiles(optionalJob){if(!isRevtexTheme()&&!(window.__CP171__&&window.__CP171__.isIntlMode()))throw new Error('請先切換到 REVTeX 4.2 國際期刊主題，或開啟 CP171 國際論文面板。');commitCurrent();const active=typeof activeFile==='function'?activeFile():null,md=active?losslessActiveNormalized():serialize();const built=await window.__CP166_REVTEX_PROJECT__.buildProject(md,{mode:'portable',purpose:'preview',sourceName:active&&active.name||'manuscript.md'});const main=built.entries.find(x=>x.name==='main.tex');if(!main)throw new Error('無法建立 main.tex。');const files=built.entries.filter(x=>!['README.md','build.sh','build.bat','REVTeX_SOURCE_NOTICE.md','MANIFEST.txt','project-settings.json','manuscript.md'].includes(x.name)).map(x=>({path:x.name,contents:/\.(?:tex|bib)$/i.test(x.name)?new TextDecoder().decode(x.data):x.data}));  const staged = optionalJob && typeof optionalJob === 'object' ? optionalJob : null;
  if (staged && staged.mainTex) {
    /* CP171 主線：直接使用 compileMarkdown 當下產生的同一份 main.tex。 */
    const e=files.find(x=>x.path==='main.tex');
    if(e)e.contents=String(staged.mainTex);
    /* 把 CP171 已解析好的圖檔以 Markdown 原始相對路徑送進 Worker。
       CP166 專案裡另有 figures/figure-XX-* 也沒關係；CP171 main.tex 會命中這裡的
       figs/fig1.png 等檔案。若同路徑已存在就以 job 快照覆寫。 */
    const byPath=new Map(files.map((f,i)=>[cp169ProjectPath(f.path).toLowerCase(),i]));
    for(const f of (Array.isArray(staged.files)?staged.files:[])){
      const path=cp169ProjectPath(f&&f.path);
      if(!path||path==='main.tex')continue;
      const contents=cp169CloneCompileContents(f);
      if(contents==null)continue;
      const key=path.toLowerCase(), i=byPath.get(key), row={path,contents};
      if(i===undefined){byPath.set(key,files.length);files.push(row);}else files[i]=row;
    }
    try{
      const assetCount=(Array.isArray(staged.files)?staged.files:[]).filter(f=>f&&f.path&&f.path!=='main.tex').length;
      console.info('[CP171 1.1.5.4] BusyTeX project bridge:',assetCount,'staged file(s)',files.filter(f=>/\.(?:png|jpe?g|pdf|eps)$/i.test(f.path)).map(f=>f.path));
    }catch(_){}
  } else {
    /* 1.2.6：TeX 校樣面板自己的「編譯」與主選單「匯出 PDF」（沒有 job）：buildProject 的
       main.tex 已經由唯一入口 mainTex() 產生，圖檔路徑也是它依專案裡的 figures/ 寫的，
       兩者一致，不再另外呼叫掛鉤換 main.tex（舊版換掉後圖檔路徑對不上，C 報告 X-B）。 */
  }
  const mainTex=files.find(x=>x.path==='main.tex').contents,bibtex=/\\bibliography\{/.test(mainTex)&&files.some(x=>/\.bib$/i.test(x.path));return {files,mainTex,bibtex,warnings:built.warnings||[],name:safeName(active&&active.name)};}
function cp169CjkPreflightMessage(project){const tex=String(project&&project.mainTex||''),wantsXe=/^%\s*!TEX program\s*=\s*xelatex\b/im.test(tex),hasCjk=/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/u.test(tex);if(!(wantsXe&&hasCjk))return '';return '安全預檢已阻擋這次內建 BusyTeX PDF：目前隨附的 Full Engine 雖含 XeTeX，但 TeX Live Recommended 資產沒有 xeCJK 與可用 CJK 字型。實測直接 XeLaTeX 可能 exit 0、卻把中文字靜默丟掉，因此本程式會阻擋這次預覽。\n\nmain.tex／REVTeX 專案仍保留「% !TEX program = xelatex」，可交給完整 TeX Live／MacTeX（含 CJK 套件與字型）編譯。';}
function cp169BlockCjkProject(project,message){clearResult();state.pendingProject=project;state.lastTex=project.mainTex||'';state.lastLog='[CP171 1.1.7.9 CJK preflight]\n'+message;state.stale=true;++state.revision;setBusy(false);setStatus('CJK BusyTeX 預覽已安全阻擋','warn');setProgress(message);const log=$id('cp169a-log');if(log)log.textContent=state.lastLog;$id('cp169a-download-tex').disabled=false;$id('cp169a-download-log').disabled=false;return false;}
async function compileCurrent(optionalJob){if(!state.initialized||!state.worker){setStatus('請先初始化引擎','warn');return false;}try{setBusy(true);setStatus('建立同一份 canonical Markdown 的 main.tex…','pending');setProgress('收集圖檔、文獻與官方 REVTeX runtime…');const project=await currentProjectFiles(optionalJob);project.cp169Signature=window.__CP169B3_INTERACTIVE__?.currentSignature?.()||'';const blocked=cp169CjkPreflightMessage(project);if(blocked)return cp169BlockCjkProject(project,blocked);const rev=++state.revision;state.pendingProject=project;const transfer=[];for(const f of project.files){if(f.contents instanceof Uint8Array)transfer.push(f.contents.buffer);}state.worker.postMessage({type:'compile',revision:rev,files:project.files,bibtex:project.bibtex},transfer);setStatus('真實 pdfLaTeX 編譯中…','pending');setProgress(project.warnings.length?project.warnings.join('\n'):'');return true;}catch(error){setBusy(false);setStatus('編譯準備失敗','error');setProgress(error.message||String(error));console.error('[CP169A compile]',error);if(optionalJob)throw error;return false;}}
async function onWorkerMessage(data){if(data.revision&&data.revision!==state.revision&&data.type!=='versions')return;if(data.type==='status'){setStatus(data.message||'處理中…','pending');return;}if(data.type==='progress'){const p=$id('cp169a-progress');if(p&&p.textContent.length<12000)p.textContent+=(p.textContent?'\n':'')+String(data.message||'');return;}if(data.type==='versions'){const el=$id('cp169a-versions');if(el)el.textContent=JSON.stringify(data.versions||{},null,2);return;}if(data.type==='initialized'){state.initialized=true;try{window.__CP171__&&window.__CP171__.emit('engine:ready',{source:'CP169A'});}catch(__e){}setBusy(false);setStatus(`引擎就緒 · ${data.milliseconds} ms`,'ok');setProgress('離線資產與 SHA-256 驗證通過；網路請求已封鎖。');$id('cp169a-compile').disabled=false;return;}if(data.type==='error'){setBusy(false);setStatus('TeX Worker 錯誤','error');setProgress((data.message||'')+'\n'+(data.stack||''));return;}if(data.type==='compiled'){setBusy(false);const project=state.pendingProject||{};state.lastTex=project.mainTex||'';state.lastLog=data.log||'';state.lastPdf=data.pdf||null;state.lastSynctex=data.synctex||null;state.lastAux=data.aux||null;const currentSignature=window.__CP169B3_INTERACTIVE__?.currentSignature?.()||'';const signatureMismatch=!!(project.cp169Signature&&currentSignature&&project.cp169Signature!==currentSignature);state.stale=!data.success||signatureMismatch;const stale=$id('cp169a-stale');if(stale){stale.hidden=!state.stale;stale.textContent=signatureMismatch?'編譯期間內容已更新，舊 PDF 不會掛載':'目前 PDF 已過期，請重新編譯';}const log=$id('cp169a-log');if(log)log.textContent=state.lastLog||'(沒有 log)';
 if(data.success&&state.lastPdf){state.lastCompiledSignature=project.cp169Signature||'';if(state.lastPdfUrl)URL.revokeObjectURL(state.lastPdfUrl);state.lastPdfUrl=URL.createObjectURL(new Blob([state.lastPdf],{type:'application/pdf'}));$id('cp169a-pdf').src=state.lastPdfUrl;setStatus(state.stale?`編譯完成但內容已更新 · ${data.milliseconds} ms`:`編譯成功 · ${data.milliseconds} ms · ${fmtBytes(state.lastPdf.byteLength)}`,state.stale?'warn':'ok');$id('cp169a-download-pdf').disabled=state.stale;['cp169a-download-tex','cp169a-download-log'].forEach(id=>$id(id).disabled=false);$id('cp169a-download-aux').disabled=!state.lastAux;$id('cp169a-download-synctex').disabled=!state.lastSynctex;}
 else{setStatus(`編譯失敗 · exit ${data.exitCode}`,'error');$id('cp169a-download-tex').disabled=false;$id('cp169a-download-log').disabled=false;}
 return;}}

function cp169RevtexContextActive(){return isRevtexTheme()||!!(window.__CP171__&&window.__CP171__.isIntlMode());}
async function cp169StartDirect(root){if(!root||state.initialized||state.busy||state.worker)return true;try{setBusy(true);clearResult();setStatus('驗證 Electron Engine Pack…','pending');setProgress('進入 REVTeX 模式，開始串流驗證本機 Engine；不建立 199 MB package Blob。');const report=await cp169VerifyDirectRoot(root);setBusy(false);await cp169InitDirect(root,report);return true;}catch(error){setBusy(false);setStatus('引擎初始化失敗','error');setProgress(error.message||String(error));console.error('[CP169A direct lifecycle]',error);return false;}}
/* 1.2.6：Mac 桌面殼開啟時呼叫 autoLoad，只「登記」本機引擎位置；進入國際論文需要編譯時，
   由 startRegistered() 串流驗證並初始化，完成後自動編譯，不請使用者選資料夾。
   兩代桌面殼的協定都認：舊版 Typora HTML 殼是 typora://app，新版是 ekdeta://app。 */
async function autoLoadRelative(base='../03_Engine_Pack/engine/'){
 if(state.initialized||state.busy)return true;
 const root=String(base||'../03_Engine_Pack/engine/').replace(/\/?$/,'/'),absolute=new URL(root,location.href);
 setStatus('自動載入 REVTeX Engine Pack…','pending');setProgress(absolute.href);
 if((absolute.protocol==='ekdeta:'||absolute.protocol==='typora:')&&absolute.hostname==='app'){
   state.directRoot=absolute.href;state.engineTransport='direct-package-url';state.files=null;terminateWorker(false);clearResult();
   if(!cp169RevtexContextActive()){
     state.engineSummary=null;setBusy(false);setStatus('Engine 已登記；進入 REVTeX 時載入','pending');setProgress('一般 Markdown 不讀取 TeX Live、不建立 Worker。進入「國際期刊 REVTeX 4.2」後才串流驗證並初始化。');const init=$id('cp169a-init');if(init)init.disabled=false;return true;
   }
   return cp169StartDirect(absolute.href);
 }
 const files=[];
 for(const name of Object.keys(EXPECTED)){
   const response=await fetch(root+encodeURIComponent(name),{cache:'no-store'});
   if(!response.ok)throw new Error(`無法載入 ${name}：HTTP ${response.status}`);
   const blob=await response.blob();
   files.push(new File([blob],name,{type:blob.type||'application/octet-stream'}));
 }
 await selectEngineFiles(files);await initEngine();return true;
}
function ensurePanel(){if($id('cp169a-overlay'))return;const overlay=document.createElement('div');overlay.id='cp169a-overlay';overlay.hidden=true;overlay.innerHTML=`<section class="cp169a-card" role="dialog" aria-modal="true" aria-labelledby="cp169a-title"><header><div><h2 id="cp169a-title">REVTeX · TeX 精確校樣</h2><p>以外接 Engine Pack 在瀏覽器 Worker 中執行真正 pdfLaTeX。預覽與下載共用同一份 PDF bytes。</p></div><button id="cp169a-close" class="cp169a-icon" aria-label="關閉">×</button></header><div class="cp169a-engine"><label class="cp169a-folder">選取 REVTeX Engine Pack 資料夾<input id="cp169a-engine-folder" type="file" webkitdirectory multiple></label><button id="cp169a-init" disabled>驗證並初始化</button><button id="cp169a-compile" disabled>編譯目前文件</button><button id="cp169a-cancel" disabled>取消</button></div><div id="cp169a-engine-summary" class="cp169a-engine-summary"></div><div class="cp169a-statusbar"><strong id="cp169a-status" data-kind="pending">尚未選取引擎包</strong><span id="cp169a-stale" hidden></span></div><div class="cp169a-actions"><button id="cp169a-download-pdf" disabled>下載同一份 PDF</button><button id="cp169a-download-tex" disabled>下載 main.tex</button><button id="cp169a-download-log" disabled>下載 log</button><button id="cp169a-download-aux" disabled>下載 AUX</button><button id="cp169a-download-synctex" disabled>下載 SyncTeX</button></div><div class="cp169a-main"><iframe id="cp169a-pdf" title="TeX PDF 精確校樣"></iframe><details><summary>編譯訊息與版本</summary><pre id="cp169a-progress"></pre><pre id="cp169a-versions"></pre><pre id="cp169a-log"></pre></details></div><footer>候選整合：${CP169_META.checkpoint}。一般 Markdown 與臺灣論文／A4 模式不載入 TeX Worker。</footer></section>`;document.body.appendChild(overlay);
 $id('cp169a-close').onclick=()=>overlay.hidden=true;overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.hidden=true;});$id('cp169a-engine-folder').onchange=e=>selectEngineFiles(e.target.files).then(()=>initEngine()).catch(err=>{setStatus('引擎包不完整','error');setProgress(err.message||String(err));});/* 1.2.6：選好資料夾就自動驗證並初始化 */$id('cp169a-init').onclick=()=>state.directRoot?cp169StartDirect(state.directRoot):initEngine();$id('cp169a-compile').onclick=compileCurrent;$id('cp169a-cancel').onclick=()=>terminateWorker(true);
 $id('cp169a-download-pdf').onclick=()=>downloadBytes(state.lastPdf,(state.pendingProject?.name||'manuscript')+'-revtex.pdf','application/pdf');$id('cp169a-download-tex').onclick=()=>downloadBytes(new TextEncoder().encode(state.lastTex),'main.tex','application/x-tex');$id('cp169a-download-log').onclick=()=>downloadBytes(new TextEncoder().encode(state.lastLog),'main.log.txt','text/plain');$id('cp169a-download-aux').onclick=()=>downloadBytes(state.lastAux,'main.aux','application/octet-stream');$id('cp169a-download-synctex').onclick=()=>downloadBytes(state.lastSynctex,'main.synctex.gz','application/gzip');
}
/* 1.2.7（M29，Jason 11-08：沒有入口卻叫得出來的舊視窗要清掉）：「REVTeX · TeX 精確校樣」大彈窗不再顯示。
   open() 這個名稱保留（網站舊導覽 v17 與舊主題仍會呼叫）：只建立隱藏的骨架（右上角「載入 LaTeX 引擎」靠裡面的
   資料夾選取欄位）、外殼已登記引擎時照常開始載入。網站導覽找不到框選目標時會把說明卡置中，不會壞。 */
function openPanel(){ensurePanel();if(cp169RevtexContextActive()&&state.directRoot&&!state.initialized&&!state.busy&&!state.worker)void cp169StartDirect(state.directRoot);}
/* 1.2.7：舊 REVTeX 主題工具列上的「TeX 精確校樣」按鈕不再加（它只會打開上面那個已停用的大彈窗）。 */
function installButton(){}
function injectStyle(){if($id('cp169a-style'))return;const s=document.createElement('style');s.id='cp169a-style';s.textContent=`#cp169a-overlay[hidden]{display:none!important}#cp169a-overlay{position:fixed;inset:0;z-index:100000;background:rgba(10,12,16,.64);backdrop-filter:none;display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box}.cp169a-card{width:min(1280px,calc(100vw - 28px));height:min(900px,calc(100vh - 28px));display:flex;flex-direction:column;background:var(--bg,#fff);color:var(--text,#222);border:1px solid var(--border-strong,#bbb);border-radius:var(--r-lg);box-shadow:0 30px 90px rgba(0,0,0,.35);overflow:hidden}.cp169a-card>header{display:flex;justify-content:space-between;gap:16px;padding:18px 20px 12px;border-bottom:1px solid var(--border,#ddd)}.cp169a-card h2{margin:0 0 4px;font-size:19px}.cp169a-card header p{margin:0;color:var(--text-muted,#666);font-size:12px}.cp169a-icon{width:34px;height:34px;border-radius:var(--r-md);border:1px solid var(--border,#ddd);background:var(--bg-secondary,#f4f4f4);font-size:var(--fs-20);cursor:pointer}.cp169a-engine{display:flex;align-items:center;gap:8px;padding:12px 20px 8px;flex-wrap:wrap}.cp169a-folder{position:relative;display:flex;align-items:center;min-height:34px;padding:0 12px;border:1px dashed var(--accent,#5b6ee1);border-radius:var(--r-md);color:var(--accent,#5b6ee1);font-size:var(--fs-12);font-weight:600;cursor:pointer}.cp169a-folder input{position:absolute;inset:0;opacity:0;cursor:pointer}.cp169a-engine button,.cp169a-actions button{min-height:34px;padding:0 13px;border:1px solid var(--border,#ccc);border-radius:var(--r-md);background:var(--bg-secondary,#f4f4f4);color:inherit;font-weight:600;cursor:pointer}.cp169a-engine button:disabled,.cp169a-actions button:disabled{opacity:.42;cursor:not-allowed}.cp169a-engine-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;padding:0 20px 8px}.cp169a-engine-summary div{display:flex;justify-content:space-between;gap:8px;padding:6px 8px;border-radius:var(--r-sm);background:var(--bg-secondary,#f5f5f5);font-size:var(--fs-11);min-width:0}.cp169a-engine-summary code{overflow:hidden;text-overflow:ellipsis}.cp169a-statusbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 20px;border-block:1px solid var(--border,#ddd);font-size:var(--fs-12)}.cp169a-statusbar [data-kind=ok]{color:var(--status-ok,#168345)}.cp169a-statusbar [data-kind=error]{color:var(--status-error,#b3261e)}.cp169a-statusbar [data-kind=warn]{color:var(--status-warn,#9b5d00)}#cp169a-stale{color:var(--status-error,#b3261e);font-weight:600}.cp169a-actions{display:flex;gap:7px;padding:8px 20px;flex-wrap:wrap}.cp169a-main{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:10px;min-height:0;flex:1;padding:0 20px 12px}.cp169a-main iframe{width:100%;height:100%;border:1px solid var(--border,#ddd);border-radius:var(--r-md);background:var(--bg-active-item,#777)}.cp169a-main details{height:100%;overflow:auto;border:1px solid var(--border,#ddd);border-radius:var(--r-md);padding:10px;box-sizing:border-box}.cp169a-main summary{cursor:pointer;font-weight:600;font-size:var(--fs-12)}.cp169a-main pre{white-space:pre-wrap;overflow-wrap:anywhere;font:10px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;border-top:1px solid var(--border,#ddd);padding-top:8px}.cp169a-card>footer{padding:7px 20px 10px;color:var(--text-muted,#666);font-size:var(--fs-11);border-top:1px solid var(--border,#ddd)}@media(max-width:850px){.cp169a-main{grid-template-columns:1fr}.cp169a-main details{max-height:220px}.cp169a-engine-summary{grid-template-columns:1fr 1fr}.cp169a-card{height:calc(100vh - 16px)}}@media print{#cp169a-overlay,[data-cp169a-tex-proof]{display:none!important}}`;document.head.appendChild(s);}
function syncContext(){if(isRevtexTheme()||(window.__CP171__&&window.__CP171__.isIntlMode())){installButton();return;}document.querySelectorAll('[data-cp169a-tex-proof]').forEach(el=>el.remove());const overlay=$id('cp169a-overlay');if(overlay)overlay.hidden=true;if(state.worker){terminateWorker(false);setBusy(false);setStatus('已離開 REVTeX；TeX Worker 已卸載','pending');setProgress('');}}
injectStyle();ensurePanel();syncContext();new MutationObserver(syncContext).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});document.addEventListener('input',e=>{if(!e.target.closest('#cp169a-overlay'))markStale();},true);document.addEventListener('change',e=>{if(!e.target.closest('#cp169a-overlay'))markStale();},true);
/* 1.2.6：不開面板也能載入引擎——右半邊的「載入 LaTeX 引擎」按鈕直接開選資料夾視窗
   （必須在使用者點擊的當下呼叫）；loadFiles 給測試與外部程式直接傳入檔案。 */
function pickFolder(){if(state.busy)return false;ensurePanel();const input=$id('cp169a-engine-folder');if(!input)return false;input.value='';input.click();return true;}
async function loadFiles(list){try{await selectEngineFiles(list);}catch(err){setStatus('引擎包不完整','error');setProgress(err.message||String(err));return false;}await initEngine();return true;}
window.__CP169A_TEX_PROOF__=Object.freeze({meta:CP169_META,open:openPanel,pickFolder,loadFiles,status:()=>({text:state.statusText||'',kind:state.statusKind||'',progress:state.progressText||'',initialized:!!state.initialized,busy:!!state.busy}),terminate:()=>terminateWorker(true),startRegistered:()=>(state.directRoot&&!state.initialized&&!state.busy&&!state.worker)?cp169StartDirect(state.directRoot):Promise.resolve(!!state.initialized),autoLoad:autoLoadRelative,compile:compileCurrent,markStale,reconcileStale,getState:()=>({initialized:state.initialized,busy:state.busy,revision:state.revision,pdfBytes:state.lastPdf?.byteLength||0,hasSynctex:!!state.lastSynctex,hasAux:!!state.lastAux,stale:state.stale,compiledSignature:state.lastCompiledSignature,engineSummary:state.engineSummary,engineTransport:state.engineTransport,directRoot:state.directRoot}),getPdf:()=>state.lastPdf,getTex:()=>state.lastTex,getLog:()=>state.lastLog,getAux:()=>state.lastAux,getSynctex:()=>state.lastSynctex,getProjectFiles:()=>state.pendingProject?.files||[]});
})();

