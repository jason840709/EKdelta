/* v1.2.5 REAL engine probe (non-destructive, isolated profile).
   Reads the user's already-installed real Engine Pack, but runs the shell in a fresh
   temporary userData profile so current documents/settings/HTML versions and existing
   Chromium blob_storage cannot affect the measurement. The temp profile's engine/
   is a symlink to the real Engine Pack: no 232 MB copy is created. */
const { app, BrowserWindow } = require('electron');
const fs=require('fs'), path=require('path'), os=require('os'), cp=require('child_process');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

const realUserData=process.env.EKDETA_REAL_USER_DATA || path.join(os.homedir(),'Library','Application Support','Ekdeta');
const realEngine=process.env.EKDETA_ENGINE_DIR || path.join(realUserData,'engine');
const names=['busytex.js','busytex.wasm','busytex_pipeline.js','texlive-recommended.js','texlive-recommended.data'];
const out={steps:[],realEngine};
const step=(n,ok,d='')=>out.steps.push({n,ok:!!ok,d:String(d).slice(0,700)});
function diskKB(p){try{const r=cp.spawnSync('/usr/bin/du',['-sk',p],{encoding:'utf8'});if(r.status===0)return Number(String(r.stdout).trim().split(/\s+/)[0])||0;}catch(_){}return 0;}

const installed=names.every(n=>fs.existsSync(path.join(realEngine,n)));
if(!installed){
  step('真實 Engine Pack 已安裝',false,realEngine);
  fs.writeFileSync('/tmp/e2e_real_engine.json',JSON.stringify(out,null,2));
  app.whenReady().then(()=>app.exit(0));
} else {
  step('真實 Engine Pack 已安裝',true,realEngine);
  const testUserData=fs.mkdtempSync(path.join(os.tmpdir(),'ekdeta-html-real-engine-'));
  out.testUserData=testUserData;
  fs.symlinkSync(realEngine,path.join(testUserData,'engine'),'dir');
  fs.writeFileSync(path.join(testUserData,'onboarding.json'),JSON.stringify({completed:true,test:true}));
  app.setPath('userData',testUserData);

  const blobDir=path.join(testUserData,'blob_storage');
  out.baselineBlobKB=fs.existsSync(blobDir)?diskKB(blobDir):0;
  const t0=Date.now(); let finished=false;
  function done(){if(finished)return;finished=true;out.ms=Date.now()-t0;fs.writeFileSync('/tmp/e2e_real_engine.json',JSON.stringify(out,null,2));app.exit(0);}
  setTimeout(()=>{out.timeout=true;step('真實引擎初始化 timeout',false,'90s');done();},90000);

  require('../src/main.js');
  app.whenReady().then(async()=>{
    await new Promise(r=>setTimeout(r,1200));
    const win=BrowserWindow.getAllWindows()[0]; if(!win){step('視窗建立',false);return done();}
    const wc=win.webContents; if(wc.isLoading())await new Promise(r=>wc.once('did-finish-load',r));
    /* 產品在一般 Markdown 模式會刻意卸載 TeX Worker；真引擎 QA 必須先進 CP171 國際論文模式，
       再顯式觸發 autoLoad。否則會出現 initialized=false 然後白等完整 timeout 的假失敗。 */
    const trigger=await wc.executeJavaScript(`(async()=>{try{window.__CP171__&&window.__CP171__.enterIntlMode();await new Promise(r=>setTimeout(r,250));return await __EKDETA_SHELL__.engineAutoLoad('./engine/');}catch(e){return {ok:false,reason:String(e)}}})()`,true).catch(e=>({ok:false,reason:String(e)}));
    out.trigger=trigger;
    let state=null;
    for(let i=0;i<120;i++){
      state=await wc.executeJavaScript(`__EKDETA_SHELL__.engineState()`,true).catch(e=>({ok:false,reason:String(e)}));
      if(state&&state.ok&&state.state&&state.state.initialized)break;
      const panel=String(state&&state.panel||state&&state.reason||trigger&&trigger.reason||'');
      if(/初始化失敗|Worker 錯誤|SHA-256|大小不符|無法載入/i.test(panel))break;
      await new Promise(r=>setTimeout(r,500));
    }
    out.engineState=state;
    step('真實 BusyTeX 初始化成功',!!(state&&state.ok&&state.state&&state.state.initialized),JSON.stringify(state));
    step('transport = direct-package-url',!!(state&&state.state&&state.state.engineTransport==='direct-package-url'),state&&state.state&&state.state.engineTransport);
    step('direct root = ekdeta://app/engine/',!!(state&&state.state&&/^ekdeta:\/\/app\/engine\//.test(state.state.directRoot||'')),state&&state.state&&state.state.directRoot);
    await new Promise(r=>setTimeout(r,1200));
    const after=fs.existsSync(blobDir)?diskKB(blobDir):0, delta=Math.max(0,after-out.baselineBlobKB);
    out.afterBlobKB=after;out.deltaBlobKB=delta;
    step('blob_storage 增量 < 64MB（不再複製 199MB data）',delta<64*1024,`baseline=${(out.baselineBlobKB/1024).toFixed(1)}MB after=${(after/1024).toFixed(1)}MB delta=${(delta/1024).toFixed(1)}MB`);
    done();
  });
}
