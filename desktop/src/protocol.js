/* ============================================================================
 * protocol.js — ekdeta:// 自訂協定
 *
 * 這支存在的唯一理由：讓產品裡既有的 __CP169A_TEX_PROOF__.autoLoad() 能動。
 *   autoLoad 用的是 fetch(base + 檔名)，而 file:// 下 fetch 一律被 Chromium 擋
 *   （opaque origin）。註冊一個 standard + secure + supportFetchAPI + stream 的
 *   自訂協定，fetch 就完全正常，引擎因此可以「開 app 就自己載好」。
 *
 * 附帶好處（不是次要的）：
 *   origin 固定是 ekdeta://app，所以 localStorage / IndexedDB 的資料**不會**
 *   因為換一份 HTML 就跟著換 origin 而消失。用 file:// 載入的話，
 *   換檔＝換路徑＝換 origin＝使用者的文件全部不見。
 *
 * 路由：
 *   ekdeta://app/            → 目前選定的 HTML
 *   ekdeta://app/app.html    → 同上
 *   ekdeta://app/engine/<檔> → <userData>/engine/<檔>（串流，記憶體佔用是常數）
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { Readable } = require('node:stream');
const { protocol } = require('electron');
const store = require('./store');

/* 1.2.7：協定由 profile.js 依使用者資料夾決定（新安裝 ekdeta，舊 Typora HTML 資料夾沿用 typora），
   main.js 在 ready 之前呼叫 setScheme。 */
let SCHEME = 'ekdeta';
function setScheme(s) { if (/^[a-z][a-z0-9+.-]*$/.test(String(s || ''))) SCHEME = String(s); }
const HOST = 'app';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  /* ★ .wasm 必須是 application/wasm，否則 WebAssembly.instantiateStreaming 會拒收，
     BusyTeX 的 32MB wasm 就載不起來。這是最容易踩到的一個雷。 */
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

function mimeOf(p) {
  return MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
}

function textResponse(status, msg) {
  return new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

/* 路徑穿越防護：解析後必須仍在允許的根目錄底下 */
function safeJoin(root, rel) {
  const target = path.resolve(root, '.' + path.posix.normalize('/' + rel));
  const rootResolved = path.resolve(root);
  if (target !== rootResolved && !target.startsWith(rootResolved + path.sep)) return null;
  return target;
}

function fileResponse(filePath, method) {
  let st;
  try { st = fs.statSync(filePath); } catch (e) {
    return textResponse(404, '找不到檔案：' + path.basename(filePath));
  }
  if (!st.isFile()) return textResponse(404, '不是檔案');

  const headers = {
    'content-type': mimeOf(filePath),
    'content-length': String(st.size),
    'cache-control': 'no-store'
  };
  if (method === 'HEAD') return new Response(null, { status: 200, headers });

  /* 用 Node 串流轉 Web 串流：199MB 的 texlive-recommended.data 全程串流，
     不會一次讀進記憶體。 */
  const body = Readable.toWeb(fs.createReadStream(filePath));
  return new Response(body, { status: 200, headers });
}

/* 必須在 app ready **之前**呼叫 */
function registerScheme() {
  protocol.registerSchemesAsPrivileged([{
    scheme: SCHEME,
    privileges: {
      standard: true,        // 有正常的 origin（localStorage / IndexedDB 才穩定）
      secure: true,          // 視為安全來源（Worker、WASM、crypto.subtle 需要）
      supportFetchAPI: true, // ★ autoLoad 的 fetch 靠這個
      stream: true,          // 大檔串流
      corsEnabled: true,
      bypassCSP: false
    }
  }]);
}

/* 必須在 app ready **之後**呼叫 */
function install(logger) {
  const log = logger || (() => {});
  protocol.handle(SCHEME, (request) => {
    let url;
    try { url = new URL(request.url); } catch (e) { return textResponse(400, '網址格式錯誤'); }

    if (url.hostname !== HOST) return textResponse(404, '未知的 host：' + url.hostname);

    let rel = decodeURIComponent(url.pathname || '/');
    if (rel === '/' || rel === '') rel = '/app.html';

    /* 1) 主程式 */
    if (rel === '/app.html' || rel === '/index.html') {
      const p = store.currentHtmlPath();
      if (!p) {
        return new Response(
          '<!doctype html><meta charset="utf-8"><body style="font:14px -apple-system;padding:40px">' +
          '<h2>還沒有可用的 HTML</h2><p>請用選單「桌面殼 → HTML 版本 → 匯入新版 HTML…」選一份產物。</p></body>',
          { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
      log('serve html: ' + p);
      return fileResponse(p, request.method);
    }

    /* 2) 引擎 */
    if (rel.startsWith('/engine/')) {
      const target = safeJoin(store.engineDir(), rel.slice('/engine/'.length));
      if (!target) return textResponse(403, '路徑不合法');
      return fileResponse(target, request.method);
    }

    /* 3) 與 HTML 同目錄的相對資源（圖片等） */
    const cur = store.currentHtmlPath();
    if (cur) {
      const target = safeJoin(path.dirname(cur), rel);
      if (target && fs.existsSync(target)) return fileResponse(target, request.method);
    }

    return textResponse(404, '找不到：' + rel);
  });
}

module.exports = { get SCHEME() { return SCHEME; }, setScheme, HOST, registerScheme, install, indexUrl: () => `${SCHEME}://${HOST}/app.html` };
