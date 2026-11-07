#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const here = __dirname;
const src = process.env.EKDETA_APP_HTML || path.resolve(here, '..', 'EKdelta.html');
const dst = path.resolve(here, 'resources', 'default', 'app.html');
if (!fs.existsSync(src)) {
  console.error('找不到上層 EKdelta.html；請先確認完整 repository 或指定 EKDETA_APP_HTML。');
  process.exit(1);
}
fs.mkdirSync(path.dirname(dst), {recursive:true});
fs.copyFileSync(src, dst);
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const a=sha(src), b=sha(dst);
if (a!==b) { console.error(`SHA 不一致：${a} vs ${b}`); process.exit(2); }
console.log(`app.html 已同步自 ${path.basename(src)}；SHA-256 ${a}`);
