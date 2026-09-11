/* 端對端探針：在真 Electron 裡跑完整個殼，把整併結果寫成 JSON 後離開。
   驗證 main.js / protocol.js / store.js / menu.js 四支合起來真的能動。 */
const { app, Menu, BrowserWindow } = require('electron');
const fs = require('fs'); const path = require('path'); const os = require('os');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
/* 測試用獨立 userData：不讀寫使用者真正的 HTML 版本庫／Engine Pack。 */
const testUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'ekdeta-html-e2e-'));
app.setPath('userData', testUserData);
fs.writeFileSync(path.join(testUserData, 'onboarding.json'), JSON.stringify({ completed: true, test: true }));
const out = { steps: [], testUserData };
function step(n, ok, d) { out.steps.push({ n, ok: !!ok, d: d === undefined ? '' : String(d) }); }
const t0 = Date.now();
setTimeout(() => { out.timeout = true; finish(); }, 60000);
function finish() {
  out.ms = Date.now() - t0;
  fs.writeFileSync('/tmp/e2e_result.json', JSON.stringify(out, null, 2));
  app.exit(0);
}
require('../src/main.js');
app.whenReady().then(async () => {
  await new Promise(r => setTimeout(r, 1500));
  const wins = BrowserWindow.getAllWindows();
  step('視窗建立', wins.length === 1, wins.length + ' 個');
  if (!wins.length) return finish();
  const win = wins[0];
  const wc = win.webContents;
  if (wc.isLoading()) await new Promise(r => wc.once('did-finish-load', r));
  await new Promise(r => setTimeout(r, 6000));   // 等 4.7MB HTML 初始化 + 殼整併

  step('載入的是 ekdeta:// 協定', wc.getURL().startsWith('ekdeta://app/'), wc.getURL());
  try {
    const info = await wc.executeJavaScript('__EKDETA_SHELL__.info()', true);
    step('bridge 已注入且讀到目前出廠 HTML', info && info.appVersion === require('../package.json').version, JSON.stringify(info));
    const m = await wc.executeJavaScript('__EKDETA_SHELL__.measure()', true);
    step('#menubar 已隱藏', !m.menubar || m.menubar.h === 0, JSON.stringify(m.menubar));
    step('#traffic 仍佔位', m.traffic && m.traffic.w > 0, JSON.stringify(m.traffic));
    step('#titlebar 貼齊視窗頂端', m.titlebar && m.titlebar.y === 0, JSON.stringify(m.titlebar));
    const snap = await wc.executeJavaScript('__EKDETA_SHELL__.snapshot()', true);
    step('選單反射成功', snap.ok, snap.source + ' / ' + (snap.menus||[]).length + ' 選單 / ' + snap.runnableCount + ' 項');
  } catch (e) { step('renderer 探測', false, e.message); }

  const menu = Menu.getApplicationMenu();
  step('原生選單已設定', !!menu, menu ? menu.items.length + ' 個頂層' : 'null');
  if (menu) {
    const labels = menu.items.map(i => i.label);
    out.nativeMenu = labels;
    const shellIdx = labels.findIndex(l => l === '桌面殼' || l === 'Shell');
    step('殼專屬選單存在', shellIdx >= 0, labels.join(' | '));
    const edit = menu.items.find(i => /^(編輯|Edit)$/.test(i.label));
    if (edit) {
      const roles = edit.submenu.items.slice(0, 3).map(i => i.role);
      step('編輯選單前三項補上原生 role', JSON.stringify(roles) === '["cut","copy","paste"]', JSON.stringify(roles));
    } else step('找得到編輯選單', false, labels.join('|'));
    const fileMenu = menu.items.find(i => /^(檔案|File)$/.test(i.label));
    if (fileMenu) {
      const first = fileMenu.submenu.items[0];
      step('反射項帶快捷鍵但不註冊', !!first.accelerator, first.label + ' → ' + first.accelerator);
      out.fileMenuSample = fileMenu.submenu.items.slice(0, 5).map(i => i.label + (i.accelerator ? ' [' + i.accelerator + ']' : ''));
    }
  }
  // 協定：直接從 renderer fetch 一個引擎路徑（未安裝 → 應為 404 而不是被擋）
  try {
    const r = await wc.executeJavaScript(
      "fetch('./engine/busytex.js').then(r=>({status:r.status,type:r.headers.get('content-type')})).catch(e=>({err:String(e)}))", true);
    /* 重點是「fetch 走得到協定處理器」：裝了引擎回 200、沒裝回我們自己的 404，
       兩者都證明路由正常。真正的失敗長相是 TypeError（被 CORS／opaque origin 擋掉），
       那正是 file:// 會出現的症狀，也是這整個自訂協定存在的理由。 */
    step('ekdeta:// 下 fetch 走得到協定處理器（非 file:// 的 CORS 阻擋）',
         (r.status === 200 || r.status === 404) && !r.err, JSON.stringify(r));
  } catch (e) { step('fetch 探測', false, e.message); }
  finish();
});
