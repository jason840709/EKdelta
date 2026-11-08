#!/usr/bin/env node
// 1.2.8 論文工具（25.js）：讀回文件裡既有的區塊、再產生回去，內容不能少也不能變；
// 臺灣論文圖說必須是排版程式認得的寫法。只跑工具本身的程式（假的最小 DOM），不量版面。
// 用法：node tests/papertools_checks.cjs PRODUCT.html
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), path = require('node:path');
const file = process.argv[2];
if (!file) throw new Error('usage: node tests/papertools_checks.cjs PRODUCT.html');
const html = fs.readFileSync(file, 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map(m => m[1]);
const tools = scripts.find(s => s.includes("const MOUNT_CLASS = 'cp171-ptools-group';"));
assert(tools, 'paper tools module missing');

function load(env = {}) {
  const el = () => ({ querySelector: () => null, querySelectorAll: () => [], appendChild() {}, addEventListener() {}, setAttribute() {}, classList: { contains: () => false, add() {}, remove() {}, toggle() {} }, style: {} });
  const document = {
    readyState: 'complete', body: el(), documentElement: { lang: env.en ? 'en' : 'zh-Hant', classList: { contains: () => false } },
    createElement: el, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, head: el()
  };
  const ctx = {
    window: {}, document, console, setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, requestAnimationFrame: () => 0,
    MutationObserver: class { observe() {} }, getSelection: () => null,
    settings: { srcmode: false, theme: env.theme || 'github' }, blocks: env.blocks || [], activeIndex: -1,
    splitToBlocks: md => String(md).split('\n'),
    isTwThesisTheme: () => /twthesis/.test(env.theme || ''), isTwThesisEnglishTheme: () => env.theme === 'twthesis-en'
  };
  ctx.window.__CP171__ = { log: { info() {}, warn() {}, error() {} }, isIntlMode: () => !!env.intl, on() {} };
  ctx.window.addEventListener = () => {};
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext('var window = this.window; var __CP171__ = window.__CP171__;\n' + tools.replace("const K = window.__CP171__;", "const K = window.__CP171__;"), ctx, { timeout: 2000 });
  return ctx.window.__CP171_PTOOLS__;
}
const fence = (lang, body) => '```' + lang + '\n' + body + '\n```';
const read = (api, g, t, text) => api.readOnly(g, t, text);
const build = (api, g, t, v) => api.buildOnly(g, t, v);
const root = path.join(__dirname, '..');
const tpl = n => fs.readFileSync(path.join(root, 'templates', n), 'utf8');
const firstFence = (md, re) => { const m = md.match(new RegExp('```(' + re + ')\\n[\\s\\S]*?\\n```')); return m && m[0]; };

const api = load();
let n = 0;

// 1. 國際論文範本的前置區：讀回再產生。作者後面的單位全名整理成「單位清單＋編號」，其他鍵（short-title）照留。
{
  const src = firstFence(tpl('international-paper.md'), 'revtex-frontmatter');
  const v = read(api, 'rev', 'frontmatter', src);
  assert.equal(v.title, 'Paper Title: A Concise Statement of the Main Result');
  assert.deepEqual(Array.from(v.affils, a => a.name).length, 2);
  assert.deepEqual(Array.from(v.authors, a => [a.name, a.affil, a.email]), [['First Author', '1', 'first.author@university.edu'], ['Second Author', '2', 'second.author@institute.org']]);
  const out = build(api, 'rev', 'frontmatter', v);
  for (const s of ['title: Paper Title', 'short-title: Short running title', 'preprint: DRAFT/2026-001', 'affiliations:', '  - Department of Physics, Example University', 'author: First Author', 'affil: 1', 'author: Second Author', 'affil: 2', 'email: second.author@institute.org', 'date: \\today', 'keywords: keyword one'])
    assert(out.includes(s), 'front matter lost: ' + s);
  // 再讀一次結果相同（穩定）
  assert.equal(build(api, 'rev', 'frontmatter', read(api, 'rev', 'frontmatter', out)), out);
  n++;
}
// 2. 參考文獻：編號重排；不是「[N] 內容」格式的行原樣保留
{
  const v = read(api, 'rev', 'bib', fence('revtex-bibliography', '[1] A. Author, J. Phys. 1 (2020).\n[3] B. Author, Phys. Rev. B 2 (2021).\nsmith2020: C. Smith, Nature 3 (2022).'));
  const out = build(api, 'rev', 'bib', v);
  assert.equal(out, fence('revtex-bibliography', '[1] A. Author, J. Phys. 1 (2020).\n[2] B. Author, Phys. Rev. B 2 (2021).\nsmith2020: C. Smith, Nature 3 (2022).'));
  n++;
}
// 3. 摘要、致謝：讀回原文
{
  const body = 'First paragraph.\n\nSecond paragraph with $x^2$.';
  assert.equal(build(api, 'rev', 'abstract', read(api, 'rev', 'abstract', fence('revtex-abstract', body))), fence('revtex-abstract', body));
  assert.equal(build(api, 'rev', 'ack', read(api, 'rev', 'ack', fence('revtex-acknowledgments', body))), fence('revtex-acknowledgments', body));
  n++;
}
// 4. 插圖：圖說一律單行（換行會讓插圖失效）
{
  const out = build(api, 'rev', 'figure', { cap: 'Line one\nline two', src: 'figs/a.pdf', id: 'fig:a', wide: true });
  assert.equal(out, '![Line one line two](figs/a.pdf){#fig:a wide}');
  n++;
}
// 5. 臺灣論文圖說：排版程式（01.js）只認「**圖 2.1：**說明」與「**Figure 2.1:** text」
{
  const capRe = /^\s*\*\*\s*(圖|表|Figure|Table)\s*([0-9A-Za-z]+(?:[.\-][0-9A-Za-z]+)*)\s*[：:]\s*\*\*\s*([\s\S]*)$/;
  const zh = build(api, 'twthesis', 'twthesis-cap', { kind: 'fig', no: '2.1', body: '量測結果' });
  assert.equal(zh, '**圖 2.1：**量測結果'); assert(capRe.test(zh));
  const withImg = build(api, 'twthesis', 'twthesis-cap', { kind: 'fig', no: '2.1', body: '量測結果', src: 'image/a.png' });
  assert.equal(withImg, '![量測結果](image/a.png)\n\n**圖 2.1：**量測結果');
  const tab = build(api, 'twthesis', 'twthesis-cap', { kind: 'tab', no: '3-2', body: '參數', src: 'ignored.png' });
  assert.equal(tab, '**表 3-2：**參數'); assert(capRe.test(tab));
  const apiEn = load({ theme: 'twthesis-en' });
  const en = build(apiEn, 'twthesis', 'twthesis-cap', { kind: 'tab', no: '2.1', body: 'Parameters' });
  assert.equal(en, '**Table 2.1:** Parameters'); assert(capRe.test(en));
  n++;
}
// 6. 臺灣論文封面（中文範本）：讀回再產生，鍵與值不變
{
  const src = firstFence(tpl('taiwan-thesis.zh.md'), 'twthesis-titlepage');
  const v = read(api, 'twthesis', 'twthesis-cover', src);
  assert.equal(v.mode, 'zh');
  const kv = s => s.split('\n').slice(1, -1).filter(l => l.trim()).map(l => l.trim()).sort();
  assert.deepEqual(kv(build(api, 'twthesis', 'twthesis-cover', v)), kv(src));
  n++;
}
// 7. 英文範本：封面與版權頁
{
  const md = tpl('taiwan-thesis.en.md'), apiEn = load({ theme: 'twthesis-en' });
  const kv = s => s.split('\n').slice(1, -1).filter(l => l.trim()).map(l => l.trim().replace(/\s*:\s*/, ': ')).sort();
  const cover = firstFence(md, 'twthesis-titlepage');
  const v = read(apiEn, 'twthesis', 'twthesis-cover', cover);
  assert.equal(v.mode, 'en');
  assert.deepEqual(kv(build(apiEn, 'twthesis', 'twthesis-cover', v)), kv(cover));
  const back = firstFence(md, 'twthesis-titleback');
  assert.deepEqual(kv(build(apiEn, 'twthesis', 'twthesis-titleback', read(apiEn, 'twthesis', 'twthesis-titleback', back))), kv(back));
  n++;
}
// 8. 審定書：中文鍵、去白底
{
  const src = fence('twthesis-approval', '圖片: image/approval.png\n口試日期: 2026-06-30\n移除白底: 是');
  const v = read(api, 'twthesis', 'twthesis-approval', src);
  assert.equal(v.knockout, true);
  const out = build(api, 'twthesis', 'twthesis-approval', v);
  for (const s of ['圖片: image/approval.png', '口試日期: 2026-06-30', '移除白底: 是']) assert(out.includes(s));
  n++;
}
// 9. 關鍵字：讀回個數；中文用「、」，英文用逗號
{
  const v = read(api, 'twthesis', 'twthesis-keywords', '**關鍵字：** 一、二、三、四、五');
  assert.equal(v.terms.length, 5);
  assert.equal(build(api, 'twthesis', 'twthesis-keywords', Object.assign(v, { lang: 'zh' })), '**關鍵字：** 一、二、三、四、五');
  assert.equal(build(api, 'twthesis', 'twthesis-keywords', { lang: 'en', terms: [{ w: 'a' }, { w: 'b' }] }), '**Keywords:** a, b');
  n++;
}
// 10. 臺灣論文參考文獻：一段一筆
{
  const md = tpl('taiwan-thesis.zh.md').split('\n');
  const refs = md.filter(l => /^\[\d+\]\s/.test(l));
  const v = read(api, 'twthesis', 'twthesis-refs', refs.join('\n\n'));
  assert.equal(v.items.length, refs.length);
  assert.equal(build(api, 'twthesis', 'twthesis-refs', v), refs.join('\n\n'));
  n++;
}
// 11. 引用：[[n]]
{
  assert.equal(build(api, 'rev', 'cite', { n: '1, 3' }), '[[1,3]]');
  assert.equal(build(api, 'twthesis', 'twthesis-cite', { n: '2-5' }), '[[2-5]]');
  // 有 fig:／tbl:／eq: 前綴的標籤用 [@標籤]（轉換程式自己決定加不加括號）；沒有前綴的用 \ref／\eqref
  assert.equal(build(api, 'rev', 'xref', { id: 'eq:1', kind: 'eqref' }), '[@eq:1]');
  assert.equal(build(api, 'rev', 'xref', { id: 'eq1', kind: 'eqref' }), '\\eqref{eq1}');
  assert.equal(build(api, 'rev', 'xref', { id: 'fig1' }), '\\ref{fig1}');
  n++;
}
// 12. 國際論文範本的參考文獻是「鍵: 內容」寫法：讀回後照原寫法產生，不改成編號；引用用 [@鍵; @鍵]
{
  const src = firstFence(tpl('international-paper.md'), 'revtex-bibliography');
  const v = read(api, 'rev', 'bib', src);
  assert.equal(v.__keyed, true);
  assert.equal(v.items[0].key, 'bardeen1961');
  assert.equal(build(api, 'rev', 'bib', v), src);
  assert.equal(build(api, 'rev', 'cite', { keys: 'bardeen1961; datta1995' }), '[@bardeen1961; @datta1995]');
  n++;
}
console.log('PASS: paper tools read back and rebuild (' + n + ' groups)');
