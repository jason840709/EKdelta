#!/usr/bin/env node
'use strict';
// Small source-level probes for rename-sensitive pure functions.  This avoids
// constructing a fake DOM: each probe extracts the original function body from
// the source module and invokes it with only its documented state dependencies.
const fs = require('node:fs');
const vm = require('node:vm');

const root = process.argv[2];
if (!root) throw new Error('usage: semantic_checks.cjs SOURCE_DIR');
const failures = [];
function source(file) { return fs.readFileSync(`${root}/${file}`, 'utf8'); }
function skipQuoted(text, i) {
  const quote = text[i++];
  while (i < text.length) {
    if (text[i] === '\\') { i += 2; continue; }
    if (text[i] === quote) return i + 1;
    i++;
  }
  throw new Error('unterminated string');
}
function functionText(text, name) {
  const marker = new RegExp(`(?:function\\s+${name}\\s*\\([^)]*\\)|const\\s+${name}\\s*=\\s*[^;=]+=>)`).exec(text);
  if (!marker) throw new Error(`function not found: ${name}`);
  let start = marker.index;
  let open = text.indexOf('{', start);
  if (open < 0) { // expression-bodied arrow
    const end = text.indexOf(';', start);
    return text.slice(start, end < 0 ? text.length : end);
  }
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (`'"\``.includes(text[i])) { i = skipQuoted(text, i) - 1; continue; }
    if (text[i] === '/' && text[i + 1] === '/') { i = text.indexOf('\n', i + 2); continue; }
    if (text[i] === '/' && text[i + 1] === '*') { i = text.indexOf('*/', i + 2) + 1; continue; }
    if (text[i] === '{') depth++;
    if (text[i] === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`unterminated function: ${name}`);
}
function extractConst(text, name) {
  const re = new RegExp(`(?:const|let)\\s+${name}\\s*=\\s*`);
  const match = re.exec(text);
  if (!match) throw new Error(`constant not found: ${name}`);
  let start = match.index + match[0].length, end = text.indexOf(';', start);
  while (end >= 0) {
    try { return new vm.Script(`(${text.slice(start, end)})`).runInNewContext({}, { timeout: 500 }); }
    catch (_) { end = text.indexOf(';', end + 1); }
  }
  throw new Error(`constant initializer not found: ${name}`);
}
function callable(text, name, context = {}) {
  const fn = functionText(text, name);
  return new vm.Script(`(${fn})`).runInNewContext(context, { timeout: 500 });
}
function check(condition, message) { if (!condition) failures.push(message); }

try {
  const core = source('01.js');
  const settings = { theme: 'night', dark: false, twthesisPrint: false, twthesis2Print: true };
  const normalize = callable(core, 'normalizeThemeSettings', {
    settings,
    THEME_SETTING_ALIASES: { 'twthesis_en': 'twthesis-en', 'blackout-game': 'blackoutgame' },
    THEME_SETTING_VALUES: ['github', 'sepia', 'blackout', 'blackoutgame', 'paper', 'twthesis', 'twthesis-en', 'revtex']
  });
  check(normalize() === true && settings.theme === 'github' && settings.dark === true, 'night alias should resolve to github + dark');
  settings.theme = 'twthesis2'; settings.dark = false; settings.twthesisPrint = false;
  check(normalize() === true && settings.theme === 'twthesis' && settings.twthesisPrint === true, 'twthesis2 should migrate to twthesis print variant');
  settings.theme = 'twthesis_en'; settings.dark = false;
  check(normalize() === true && settings.theme === 'twthesis-en', 'English thesis alias should normalize');
  settings.theme = 'untrusted-theme'; settings.dark = 'yes';
  check(normalize() === true && settings.theme === 'github' && settings.dark === false, 'invalid theme/dark values should fail safe');
  const dataset = callable(core, 'resolvedThemeDataset', { settings });
  settings.theme = 'twthesis'; settings.dark = true;
  check(dataset() === 'night', 'dark thesis mode should project night dataset');
  settings.theme = 'revtex'; settings.dark = false;
  check(dataset() === 'github', 'light journal mode should project github dataset');
} catch (error) { failures.push(`theme probes: ${error.message}`); }

try {
  const core = source('03.js');
  const ids = extractConst(core, 'BUILTIN_DOC_IDS');
  const order = extractConst(core, 'BUILTIN_DOC_ORDER');
  const seeds = {};
  for (const name of ['SEED_WELCOME', 'SEED_WELCOME_EN', 'SEED_MANUAL', 'SEED_MANUAL_EN', 'SEED_NOTES', 'SEED_TW_THESIS', 'SEED_TW_THESIS_EN', 'SEED_REVTEX']) {
    // Seed declarations are in the same file in the assembled source.
    try { seeds[name] = extractConst(core, name); } catch (_) { seeds[name] = name; }
  }
  const spec = callable(core, 'builtinDocSpec', {
    BUILTIN_DOC_IDS: ids, isEN: () => false, ...seeds
  });
  const expected = [
    ['welcome', 'SEED_WELCOME'], ['manual', 'SEED_MANUAL'], ['notes', 'SEED_NOTES'],
    ['twthesis', 'SEED_TW_THESIS'], ['twthesisEn', 'SEED_TW_THESIS_EN'], ['revtex', 'SEED_REVTEX']
  ];
  check(JSON.stringify(order) === JSON.stringify(expected.map(([name]) => name)), 'built-in document order changed');
  for (const [kind, seed] of expected) {
    const got = spec(kind);
    check(got && got.id === ids[kind] && got.builtinKind === kind && got.content === seeds[seed], `built-in spec mismatch: ${kind}`);
  }
  const english = callable(core, 'builtinDocSpec', { BUILTIN_DOC_IDS: ids, isEN: () => true, ...seeds });
  check(english('welcome').name === 'Welcome.md', 'English welcome filename mismatch');
  check(english('twthesis').name.includes('English') === false, 'Chinese template should remain Chinese in English UI');
  check(english('twthesisEn').name.includes('English'), 'English thesis template filename mismatch');
} catch (error) { failures.push(`built-in document probes: ${error.message}`); }

const result = { passed: failures.length === 0, failures, scope: 'rename-sensitive theme normalization and built-in document identity/content' };
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.passed ? 0 : 1;
