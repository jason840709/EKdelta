#!/usr/bin/env node
'use strict';
const fs=require('fs'), path=require('path'), crypto=require('crypto');
const root=path.resolve(__dirname,'..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const app=path.join(root,'resources','default','app.html');
function ok(c,m){if(!c){console.error('FAIL',m);process.exit(1)}console.log('PASS',m)}
ok(pkg.productName==='EKdelta Desktop','productName EKdelta Desktop');
ok(pkg.version==='1.2.8','version 1.2.8');
ok(pkg.build && pkg.build.appId==='org.ekdeta.app','appId org.ekdeta.app');
ok(pkg.devDependencies && pkg.devDependencies.electron==='33.4.11','Electron pinned');
ok(fs.existsSync(app),'factory app.html exists');
const text=fs.readFileSync(app,'utf8');
ok(/const APP_VERSION\s*=\s*['\"]1\.2\.8['\"]/.test(text),'Core version 1.2.8');
ok(text.includes('EKdelta'),'Core branded EKdelta');
ok(!text.includes('static.cloudflareinsights.com'),'no Cloudflare telemetry');
console.log('Windows source gate: all green');
