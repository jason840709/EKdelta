#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const product = process.argv[2] || new URL('../EKdelta_v1.2.5.html', import.meta.url).pathname;
const html = fs.readFileSync(product, 'utf8');
// Work on actual script-element payloads. Searching the raw HTML would include
// a closing </script> tag in an extracted function body and produce a false
// syntax error; script boundaries are part of the product contract.
const scriptSources = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map((m) => m[1]);
const sourceText = scriptSources.join('\n');
function declaration(name, kind = 'const') {
  const start = sourceText.indexOf(`${kind} ${name}`);
  assert(start >= 0, `missing declaration: ${name}`);
  let i = sourceText.indexOf('=', start) + 1, depth = 0, quote = '', escaped = false;
  for (; i < sourceText.length; i++) {
    const c = sourceText[i];
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ';' && depth === 0) return sourceText.slice(start, i + 1);
  }
  throw new Error(`unterminated declaration: ${name}`);
}
function functionSource(name) {
  const start = sourceText.indexOf(`function ${name}`);
  assert(start >= 0, `missing function: ${name}`);
  if (name === 'renderBlockHTML') { const end = sourceText.indexOf('\nfunction mountDoc', start); assert(end > start); return sourceText.slice(start, end); }
  let i = sourceText.indexOf('{', start), depth = 0, quote = '', escaped = false, line = false, block = false;
  for (; i < sourceText.length; i++) {
    const c = sourceText[i], next = sourceText[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && next === '/') { block = false; i++; } continue; }
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '/' && next === '/') { line = true; i++; continue; }
    if (c === '/' && next === '*') { block = true; i++; continue; }
    // Regular-expression literals can contain braces. Skip their body while
    // counting function braces (the renderer has many regexes in conditions).
    if (c === '/' && !'/*'.includes(next)) {
      let previous = i - 1;
      while (previous >= 0 && /\s/.test(sourceText[previous])) previous--;
      if (previous < 0 || '([{:;,=!?&|+-*%^~<>'.includes(sourceText[previous])) {
        let j = i + 1, inClass = false, escaped = false;
        for (; j < sourceText.length; j++) {
          const rc = sourceText[j];
          if (escaped) { escaped = false; continue; }
          if (rc === '\\') { escaped = true; continue; }
          if (rc === '[') { inClass = true; continue; }
          if (rc === ']') { inClass = false; continue; }
          if (rc === '/' && !inClass) { while (/[a-z]/i.test(sourceText[j + 1] || '')) j++; i = j; break; }
        }
        continue;
      }
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return sourceText.slice(start, i + 1);
  }
  throw new Error(`unterminated function: ${name}`);
}
function run(source, context = {}) {
  const ctx = vm.createContext({ console, ...context });
  vm.runInContext(source, ctx, { timeout: 1500 });
  return ctx;
}

// Extract and execute the real theme normalization code, with only its external state supplied.
const themeSource = [
  declaration('THEME_SETTING_VALUES'), declaration('THEME_SETTING_ALIASES'),
  declaration('isTwThesisTheme'), functionSource('normalizeThemeSettings'),
  'globalThis.normalizeThemeSettings = normalizeThemeSettings; globalThis.isTwThesisTheme = isTwThesisTheme;'
].join('\n');
const settings = { theme: 'twthesis2', twthesisPrint: false, twthesis2Print: true, dark: false };
const themeCtx = run(themeSource, { settings });
assert.equal(themeCtx.normalizeThemeSettings(), true);
assert.equal(settings.theme, 'twthesis');
assert.equal(settings.twthesisPrint, true);
assert.equal(themeCtx.isTwThesisTheme(), true);
settings.theme = 'twthesis-en';
assert.equal(themeCtx.isTwThesisTheme(), true);
settings.theme = 'unknown';
themeCtx.normalizeThemeSettings();
assert.equal(settings.theme, 'github');

// Execute the real built-in registry functions. Seeds are replaced only with sentinel text;
// registry identity/order and persistence filtering remain the product's actual functions.
const builtinSource = [
  declaration('BUILTIN_DOC_IDS'), declaration('BUILTIN_DOC_ORDER'),
  functionSource('isBuiltinFile'), functionSource('builtinDocSpec'), functionSource('makeBuiltinDocs'),
  functionSource('persistentUserFiles'),
  'globalThis.BUILTIN_DOC_IDS = BUILTIN_DOC_IDS; globalThis.BUILTIN_DOC_ORDER = BUILTIN_DOC_ORDER; globalThis.makeBuiltinDocs = makeBuiltinDocs; globalThis.persistentUserFiles = persistentUserFiles;'
].join('\n');
const builtinCtx = run(builtinSource, {
  SEED_WELCOME: '# welcome', SEED_WELCOME_EN: '# Welcome', SEED_MANUAL: '# manual', SEED_MANUAL_EN: '# Manual',
  SEED_NOTES: '# notes', SEED_TW_THESIS: '```twthesis-titlepage\n```', SEED_TW_THESIS_EN: '```twthesis-en-titleback\n```', SEED_REVTEX: '# paper',
  isEN: () => false, activeId: 'u1', files: [], losslessContentForActive: () => 'lossless',
  uid: () => 'uid', TT: (zh) => zh
});
const builtins = builtinCtx.makeBuiltinDocs();
assert.deepEqual(Array.from(builtins, (f) => f.builtinKind), ['welcome', 'manual', 'notes', 'twthesis', 'twthesisEn', 'revtex']);
assert.equal(builtins[3].id, 'builtin:twthesis');
assert.equal(builtins[4].id, 'builtin:twthesis-en');
builtinCtx.files = [...builtins, { id: 'u1', name: 'notes.md', content: 'body' }];
assert.deepEqual(Array.from(builtinCtx.persistentUserFiles(), (f) => f.id), ['u1']);

// Exercise the actual renderer's fence dispatch with lightweight, non-browser dependencies.
const rendererSource = [
  declaration('isTwThesisTheme'), functionSource('renderBlockHTML'),
  'globalThis.renderBlockHTML = renderBlockHTML;'
].join('\n');
try { const renderCtx = run(rendererSource, {
  settings: { theme: 'twthesis' },
  blockType: () => 'code', markdownFenceOpen: (line) => ({ lang: String(line).slice(3) }),
  markdownFenceClose: () => true, isTwThesisTheme: undefined,
  renderTwThesisTitlePage: (body) => `<TITLE:${body}>`, renderTwThesisApprovalPage: (body) => `<APPROVAL:${body}>`,
  renderTwThesisEnglishTitleBack: (body) => `<BACK:${body}>`, isTwThesisEnglishTheme: () => false,
  twthesisDocumentEnglish: () => false, escapeHtml: (x) => String(x), highlight: () => 'code',
  mathHTML: () => '', structuredInlineHTML: (x) => x, noIndentParts: (x) => ({ body: x, on: false }),
  mathSourceParts: () => ({ tex: '' }), mathSeq: 0, styleSeq: 0,
  document: { createElement: () => ({}) }
});
assert.equal(renderCtx.renderBlockHTML('```twthesis-titlepage\nTitle\n```'), '<TITLE:Title>');
assert.equal(renderCtx.renderBlockHTML('```twthesis-approval\nApproval\n```'), '<APPROVAL:Approval>');
renderCtx.settings.theme = 'github';
assert.match(renderCtx.renderBlockHTML('```twthesis-titlepage\nTitle\n```'), /<pre/);

// Evaluate the actual inlined KaTeX vendor and render a normal expression.
const firstScript = scriptSources[0] || '';
assert(firstScript.includes('KaTeX v0.16.11'), 'KaTeX vendor script missing');
const katexCtx = { console, self: {} };
vm.createContext(katexCtx);
vm.runInContext(firstScript, katexCtx, { timeout: 2000 });
const katex = katexCtx.self.katex || katexCtx.katex;
assert(katex && typeof katex.renderToString === 'function', 'KaTeX did not initialize');
assert.match(katex.renderToString('x^2 + y^2'), /katex/);
assert(!firstScript.includes('twthesisus'), 'branding replacement corrupted KaTeX identifiers');

console.log('behavior tests passed: theme migration, built-in registry/persistence, thesis fence dispatch, KaTeX render'); } catch (e) { if(e && e.name === 'SyntaxError') { console.error(rendererSource.slice(-500)); } throw e; }
