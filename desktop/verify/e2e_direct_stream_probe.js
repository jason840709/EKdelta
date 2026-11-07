/* v1.2.5 direct-stream probe
   Proves a Blob Worker can stream the 199MB TeX Live .data directly from
   ekdeta://app/engine/ without response.blob() or a second 199MB backing file. */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
const testUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'ekdeta-html-direct-stream-'));
app.setPath('userData', testUserData);
fs.mkdirSync(path.join(testUserData, 'engine'), { recursive: true });
fs.writeFileSync(path.join(testUserData, 'onboarding.json'), JSON.stringify({ completed: true, test: true }));
const dataPath = path.join(testUserData, 'engine', 'texlive-recommended.data');
const fd = fs.openSync(dataPath, 'w');
fs.ftruncateSync(fd, 199273688); // sparse: logical 199MB, negligible real disk
fs.closeSync(fd);
const out = { steps: [], testUserData };
const step = (n, ok, d='') => out.steps.push({ n, ok: !!ok, d: String(d).slice(0, 500) });
function diskKB(p) {
  try {
    const r = cp.spawnSync('/usr/bin/du', ['-sk', p], { encoding: 'utf8' });
    if (r.status === 0) return Number(String(r.stdout).trim().split(/\s+/)[0]) || 0;
  } catch (_) {}
  return 0;
}
const t0=Date.now();
function done(){out.ms=Date.now()-t0;fs.writeFileSync('/tmp/e2e_direct_stream.json',JSON.stringify(out,null,2));app.exit(0);}
setTimeout(()=>{out.timeout=true;step('direct stream probe timeout',false,'300s');done();},300000);
require('../src/main.js');
app.whenReady().then(async()=>{
  await new Promise(r=>setTimeout(r,1200));
  const win=BrowserWindow.getAllWindows()[0];
  if(!win){step('window exists',false);return done();}
  const wc=win.webContents;
  if(wc.isLoading()) await new Promise(r=>wc.once('did-finish-load',r));
  await new Promise(r=>setTimeout(r,800));
  const res=await wc.executeJavaScript(`new Promise((resolve)=>{
    const src = \`onmessage=async({data})=>{try{const r=await fetch(data.url,{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const reader=r.body.getReader();let bytes=0,chunks=0;for(;;){const x=await reader.read();if(x.done)break;bytes+=x.value.byteLength;chunks++;}postMessage({ok:true,bytes,chunks,type:r.headers.get('content-type')});}catch(e){postMessage({ok:false,error:String(e),stack:e&&e.stack||''});}}\`;
    const u=URL.createObjectURL(new Blob([src],{type:'text/javascript'}));
    const w=new Worker(u);URL.revokeObjectURL(u);
    w.onmessage=e=>{w.terminate();resolve(e.data)};
    w.onerror=e=>{w.terminate();resolve({ok:false,error:e.message||String(e)})};
    w.postMessage({url:'ekdeta://app/engine/texlive-recommended.data'});
  })`, true);
  out.streamResult=res;
  step('Blob Worker 可直接 fetch ekdeta:// engine data', res&&res.ok===true, JSON.stringify(res));
  step('direct stream 完整讀到 199273688 bytes', res&&res.bytes===199273688, res&&`${res.bytes} bytes / ${res.chunks} chunks`);
  step('.data MIME 正確', res&&res.type==='application/octet-stream', res&&res.type);
  await new Promise(r=>setTimeout(r,700));
  const blobDir=path.join(testUserData,'blob_storage');
  const kb=fs.existsSync(blobDir)?diskKB(blobDir):0;
  out.blobStorageKB=kb;
  step('純 direct stream 不建立大型 blob_storage (< 32MB)', kb < 32*1024, `${(kb/1024).toFixed(1)} MB`);
  done();
});
