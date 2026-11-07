/* v1.2.5 Engine bridge probe: sparse fake engine.
   This deliberately has correct filenames/sizes but zero content. The product must:
   1) serve all assets through ekdeta:// as streams,
   2) choose direct-package-url transport under Electron,
   3) reject the fake pack on SHA-256 (not 404/CORS/memory),
   4) avoid creating a 199MB response Blob during the probe itself. */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
const testUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'ekdeta-html-engine-e2e-'));
app.setPath('userData', testUserData);
fs.mkdirSync(path.join(testUserData, 'engine'), { recursive: true });
fs.writeFileSync(path.join(testUserData, 'onboarding.json'), JSON.stringify({ completed: true, test: true }));
const fakeFiles = [
  ['busytex.js', 271047],
  ['busytex.wasm', 32501975],
  ['busytex_pipeline.js', 33701],
  ['texlive-recommended.js', 3885771],
  ['texlive-recommended.data', 199273688]
];
for (const [name, bytes] of fakeFiles) {
  const fp = path.join(testUserData, 'engine', name);
  const fd = fs.openSync(fp, 'w'); fs.ftruncateSync(fd, bytes); fs.closeSync(fd);
}
const out = { steps: [], testUserData };
const step = (n, ok, d='') => out.steps.push({ n, ok: !!ok, d: String(d).slice(0, 500) });
function diskKB(p){try{const r=cp.spawnSync('/usr/bin/du',['-sk',p],{encoding:'utf8'});if(r.status===0)return Number(String(r.stdout).trim().split(/\s+/)[0])||0;}catch(_){}return 0;}
const t0 = Date.now();
const done = () => { out.ms = Date.now() - t0; fs.writeFileSync('/tmp/e2e_engine.json', JSON.stringify(out, null, 2)); app.exit(0); };
setTimeout(() => { out.timeout = true; step('engine probe timeout',false,'300s'); done(); }, 300000);
require('../src/main.js');
app.whenReady().then(async () => {
  await new Promise(r => setTimeout(r, 1500));
  const win = BrowserWindow.getAllWindows()[0]; const wc = win.webContents;
  if (wc.isLoading()) await new Promise(r => wc.once('did-finish-load', r));
  await new Promise(r => setTimeout(r, 1200));
  const store = require('../src/store.js'); const st = store.engineStatus();
  step('store 認得假引擎包（5 檔齊全、大小吻合）', st.installed && !st.wrong.length,
       `installed=${st.installed} missing=${st.missing} wrong=${st.wrong} total=${(st.totalBytes/1048576).toFixed(1)}MB`);

  // Stream each file; DO NOT call Blob materialization, because that would recreate the bug in the test.
  const probe = await wc.executeJavaScript(`(async () => {
    const names = ['busytex.js','busytex.wasm','busytex_pipeline.js','texlive-recommended.js','texlive-recommended.data'];
    const out=[];
    for(const n of names){const t=performance.now();try{const r=await fetch('./engine/'+n,{cache:'no-store'});const rd=r.body.getReader();let len=0;for(;;){const x=await rd.read();if(x.done)break;len+=x.value.byteLength;}out.push({n,status:r.status,type:r.headers.get('content-type'),len,ms:Math.round(performance.now()-t)});}catch(e){out.push({n,err:String(e)})}}
    return out;
  })()`, true);
  out.fetchProbe=probe;
  step('五個引擎檔都以 stream fetch 得到（200）', probe.every(p=>p.status===200), JSON.stringify(probe.map(p=>p.n+':'+p.status)));
  const wasm=probe.find(p=>p.n==='busytex.wasm'); step('.wasm MIME = application/wasm', wasm&&wasm.type==='application/wasm', wasm&&wasm.type);
  const data=probe.find(p=>p.n==='texlive-recommended.data'); step('199MB .data stream 完整取回', data&&data.len===199273688, data&&`${data.len} bytes / ${data.ms}ms`);
  const mem=process.memoryUsage(); step('主行程 RSS < 400MB', mem.rss < 400*1048576, (mem.rss/1048576).toFixed(0)+' MB');

  const r = await wc.executeJavaScript(`(async()=>{window.__CP171__&&window.__CP171__.enterIntlMode();await new Promise(x=>setTimeout(x,250));return __EKDETA_SHELL__.engineAutoLoad('./engine/');})()`, true); out.autoLoad=r;
  step('假引擎正確回報失敗', r&&r.ok===false, JSON.stringify(r));
  step('失敗原因是 SHA-256，而非 404/CORS/記憶體', /SHA-256/i.test(String(r&&r.reason||'')) && !/404|CORS|memory/i.test(String(r&&r.reason||'')), String(r&&r.reason||''));
  const state=await wc.executeJavaScript(`__EKDETA_SHELL__.engineState()`,true); out.engineState=state;
  step('Electron autoLoad 選到 direct-package-url transport', state&&state.ok&&state.state&&state.state.engineTransport==='direct-package-url', JSON.stringify(state));
  step('direct root = ekdeta://app/engine/', state&&state.state&&/^ekdeta:\/\/app\/engine\//.test(state.state.directRoot||''), state&&state.state&&state.state.directRoot);
  const status=await wc.executeJavaScript(`(document.getElementById('cp169a-status')||{}).textContent || '(無面板)'`,true);
  step('引擎面板有回報狀態', !!status&&status!=='(無面板)', status);
  const blobDir=path.join(testUserData,'blob_storage'); const kb=fs.existsSync(blobDir)?diskKB(blobDir):0; out.blobStorageKB=kb;
  step('probe 未製造大型 blob_storage (< 32MB)', kb<32*1024, `${(kb/1024).toFixed(1)} MB`);
  done();
});
