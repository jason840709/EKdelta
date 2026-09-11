#!/usr/bin/env node
// Executes actual About and toolbar mounting code with a small DOM collaborator.
// This checks content/wiring; it does not measure native browser layout.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const file = process.argv[2];
if (!file) throw new Error('usage: node tests/ui_content_checks.cjs PRODUCT.html');
const html = fs.readFileSync(file, 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map(m => m[1]);
const main = scripts.find(s => s.includes('function showAbout(){'));
const tools = scripts.find(s => s.includes("const MOUNT_CLASS = 'cp171-ptools-group';"));
function fn(source, name) {
  const match = source.match(new RegExp('function ' + name + '\\([^]*?\\n\\}'));
  assert(match, `missing ${name}`); return match[0];
}
for (const en of [false, true]) {
  let body = '';
  vm.runInNewContext(fn(main,'showAbout')+'\nshowAbout();', {
    isEN: () => en, APP_VERSION: '1.2.3', showModal: s => { body = s; }
  }, {timeout:1000});
  for (const text of ['Jason Chen', 'Ekdeta', 'Markdown', 'REVTeX', 'ekd-', 'eta', 'η', '1.2.3']) assert(body.includes(text), `About missing ${text}`);
  assert(!body.includes('Ekdeta Contributors'));
  assert(body.includes(en ? 'publication' : '書寫走向發表'));
}
const groupLiteral = tools.match(/const GROUPS = (\[[^]*?\n\]);/)[1];
const groups = vm.runInNewContext(groupLiteral, {REVTEX_TOOLS:[], TW_THESIS_TOOLS:[]});
assert.deepEqual(Array.from(groups,g=>g.label), ['REV','TW']);
assert.equal(groups[1].id,'twthesis');
function node(tag) {
  return {tag,children:[],dataset:{},attrs:{},events:{},setAttribute(k,v){this.attrs[k]=v},
    addEventListener(k,v){this.events[k]=v},appendChild(c){this.children.push(c)},
    querySelector(sel){return this.children.find(c=>'.'+c.className===sel)||null}};
}
for (const en of [false, true]) {
  let row=node('row'); const doc={getElementById:()=>({querySelector:()=>row}),createElement:node};
  const context=vm.createContext({GROUPS:groups, MOUNT_CLASS:'cp171-ptools-group', document:doc,
    T:(zh,eng)=>en?eng:zh, ensureStyle:()=>{}, openGroup:()=>{}});
  vm.runInContext(fn(tools,'mount')+'\nmount();mount();', context, {timeout:1000});
  assert.equal(row.children.length,1,'mount must not duplicate controls');
  const button=row.children[0].children[1];
  assert.equal(button.textContent,'TW'); assert.equal(button.dataset.action,'pt-twthesis');
  assert.equal(button.title,en?'Taiwan Thesis syntax tools':'臺灣論文語法工具');
  assert.equal(button.attrs['aria-label'],button.title);
  row=node('row'); vm.runInContext('mount()',context,{timeout:1000});
  assert.equal(row.children[0].children[1].textContent,'TW','rebuilt toolbar must retain caption');
}
for (const name of ['SEED_TW_THESIS','SEED_TW_THESIS_EN']) {
  const m=main.match(new RegExp('const '+name+' = ("(?:[^"\\\\]|\\\\.)*");'));
  assert(m,`missing ${name}`); const md=JSON.parse(m[1]);
  const images=md.split('\n').filter(l=>l.startsWith('![')&&l.includes('(data:image/svg+xml'));
  assert.equal(images.length,1);
  assert(images[0].endsWith(')'), 'template image requires closing Markdown parenthesis');
  const uri=images[0].slice(images[0].indexOf('](data:')+2,-1);
  const svg=decodeURIComponent(uri.slice(uri.indexOf(',')+1));
  assert(svg.startsWith('<svg ')&&svg.endsWith('</svg>'),'valid complete inline SVG');
  if(name==='SEED_TW_THESIS') {
    const approval=md.match(/```twthesis-approval\n([^]*?)\n```/)[1];
    assert(/^圖片:\s*$/m.test(approval),'approval image starts empty');
    const core=scripts.find(s=>s.includes('function renderTwThesisApprovalPage('));
    const output=vm.runInNewContext(fn(core,'twthesis2Fields')+'\n'+fn(core,'renderTwThesisApprovalPage')+'\nrenderTwThesisApprovalPage(body)',
      {body:approval,escapeHtml:x=>String(x),twthesisDocumentEnglish:()=>false},{timeout:1000});
    assert(output.includes('twthesis2-approval-placeholder')); assert(!output.includes('<img '));
  }
}
console.log('PASS: bilingual About, TW caption + tooltip + rebuild, inline template images, empty approval placeholder');
