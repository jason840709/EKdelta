#!/usr/bin/env node
'use strict';
// Receives HTMLParser output on stdin; executes only extracted literal constants.
const fs = require('node:fs');
const vm = require('node:vm');

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const result = { scripts: [], handlers: [], constants: {}, failures: [] };
const selected = /^(?:SEED_[A-Za-z0-9_]+|APP_VERSION|APP_CHECKPOINT|APP_BUILD|VERSION_HISTORY|BUILTIN_DOC_IDS|BUILTIN_DOC_ORDER|CP166_RUNTIME_B64)$/;

function literalExpression(source, start) {
  // Semicolons inside strings/comments are rejected until a complete expression
  // has been collected. Compiling is side-effect free; evaluation is sandboxed.
  let end = source.indexOf(';', start);
  while (end >= 0) {
    const expression = source.slice(start, end);
    try {
      const compiled = new vm.Script(`(${expression})`);
      return compiled.runInNewContext(Object.create(null), { timeout: 500 });
    } catch (error) {
      if (!(error instanceof SyntaxError) && error.name !== 'SyntaxError') throw error;
      end = source.indexOf(';', end + 1);
    }
  }
  throw new Error('No complete literal initializer found');
}

for (const [index, script] of input.scripts.entries()) {
  const label = script.attrs.id || `inline-script-${index + 1}`;
  const kind = (script.attrs.type || '').trim().toLowerCase();
  if (script.attrs.src) {
    result.failures.push({ kind: 'external-script', label, source: script.attrs.src });
    continue;
  }
  if (kind && !['text/javascript', 'application/javascript', 'module'].includes(kind)) {
    if (kind === 'application/json') {
      try { JSON.parse(script.text); }
      catch (error) { result.failures.push({ kind: 'json', label, message: error.message }); }
    }
    continue;
  }
  try {
    if (kind === 'module') {
      if (!vm.SourceTextModule) throw new Error('Module parsing needs --experimental-vm-modules');
      new vm.SourceTextModule(script.text, { identifier: label });
    } else new vm.Script(script.text, { filename: label });
    result.scripts.push({ label, line: script.line, passed: true });
  } catch (error) {
    const stack = String(error.stack).split('\n');
    const suffix = stack[0].match(/:(\d+)$/);
    result.failures.push({ kind: 'syntax', label, line: suffix ? script.line + Number(suffix[1]) - 1 : script.line, message: error.message });
    result.scripts.push({ label, passed: false });
    continue;
  }
  const declarations = /^const\s+([A-Za-z_$][\w$]*)\s*=\s*/gm;
  let match;
  while ((match = declarations.exec(script.text))) {
    if (!selected.test(match[1]) && !(input.constants || []).includes(match[1])) continue;
    try {
      const value = literalExpression(script.text, declarations.lastIndex);
      result.constants[match[1]] = value;
    } catch (error) {
      result.failures.push({ kind: 'constant', name: match[1], message: error.message });
    }
  }
}

for (const handler of input.handlers) {
  try {
    new vm.Script(`(function(event){\n${handler.text}\n})`);
    result.handlers.push({ line: handler.line, attribute: handler.attribute, passed: true });
  } catch (error) {
    result.failures.push({ kind: 'handler-syntax', line: handler.line, attribute: handler.attribute, message: error.message });
  }
}
process.stdout.write(JSON.stringify(result));
