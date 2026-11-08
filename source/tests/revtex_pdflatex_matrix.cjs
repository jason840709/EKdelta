#!/usr/bin/env node
/* 國際論文模式的 pdflatex 編譯矩陣（選用）：找得到 pdflatex 才跑，否則直接略過（回傳 0）。
 *
 * 用法：node tests/revtex_pdflatex_matrix.cjs [--out 輸出資料夾] [--src src/scripts]
 *         [--only ID,ID] [--both] [--texbin /Library/TeX/texbin] [--json 結果.json]
 *   --out     每個案例的 main.tex／log／pdf 放這裡（預設系統暫存資料夾）
 *   --both    預覽版之外，也編譯投稿版（APS 乾淨版）
 *   PDF 文字：環境變數 EKD_PYTHON 指向有 PyMuPDF（fitz）的 Python；沒有就只檢查能不能編譯。
 *
 * 每個案例用真正的 17.js／18.js 發射，pdflatex 編兩次（交叉引用），檢查：
 *   · 編譯成功（沒有 ! 錯誤）
 *   · tests/revtex_cases.cjs 指定的 PDF 文字（pdf／nopdf／pdfraw）
 *   · 共通：PDF 不得出現 ¡ ¿（OT1 下 < > 印錯）、[?]（除非案例本來就沒書目）、??（除非故意）
 * 最後印出「編譯失敗」與「輸出錯誤」的案例數與清單。
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const { cases } = require('./revtex_cases.cjs');
const { loadPipeline } = require('./revtex_emit_checks.cjs');

const args = process.argv.slice(2);
const argVal = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const SRC = path.resolve(argVal('--src') || path.join(__dirname, '..', 'src', 'scripts'));
const OUT = path.resolve(argVal('--out') || path.join(os.tmpdir(), 'ekdelta-revtex-matrix'));
const ONLY = (argVal('--only') || '').split(',').filter(Boolean);
const BOTH = args.includes('--both');
const JSON_OUT = argVal('--json');

function findBin(name){
  const dirs = [argVal('--texbin'), '/Library/TeX/texbin', '/usr/local/bin', '/usr/bin', ...(process.env.PATH || '').split(path.delimiter)].filter(Boolean);
  for (const d of dirs) { const p = path.join(d, name); if (fs.existsSync(p)) return p; }
  return null;
}
const PDFLATEX = findBin('pdflatex');
if (!PDFLATEX) { console.log('revtex pdflatex matrix: 找不到 pdflatex，略過。'); process.exit(0); }
const XELATEX = findBin('xelatex');
const PY = process.env.EKD_PYTHON || null;
let canText = false;
if (PY) { const r = cp.spawnSync(PY, ['-I', '-c', 'import fitz'], { encoding: 'utf8' }); canText = r.status === 0; }

/* 1×1 PNG：投稿版直接 \includegraphics，沒有圖檔會編譯失敗，所以給每個引用的圖放一張空白圖。 */
const PNG = (() => {
  const zlib = require('zlib');
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xFFFFFFFF; for (const x of b) c = crcTable[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.from([0, 255, 255, 255]))), chunk('IEND', Buffer.alloc(0))]);
})();

function pdfText(pdf){
  if (!canText) return null;
  const code = 'import fitz,sys\nd=fitz.open(sys.argv[1])\nsys.stdout.write("\\n".join(p.get_text() for p in d))';
  const r = cp.spawnSync(PY, ['-I', '-c', code, pdf], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout : null;
}
/* fitz 把 OT1 組合重音抽成「´e」，所以比對時兩邊都去掉重音記號。 */
const norm = t => String(t).normalize('NFD').replace(/[\u0300-\u036f´¨ˆ˜˚¸ˇ˘¯˙˝]/g, '').replace(/[‘’‚‛]/g, "'").replace(/[“”„‟]/g, '"').replace(/[–—−]/g, '-')
  .replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl').replace(/ﬀ/g, 'ff').replace(/ﬃ/g, 'ffi').replace(/ﬄ/g, 'ffl')
  .replace(/-\n/g, '').replace(/\s+/g, ' ');

function compile(dir, tex, assets){
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'main.tex'), tex);
  for (const a of assets || []) {
    const p = path.join(dir, a);
    if (!p.startsWith(dir)) continue;
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, PNG);
  }
  const eng = /^% !TEX program = xelatex/m.test(tex) ? (XELATEX || PDFLATEX) : PDFLATEX;
  let ok = true, runs = 0;
  for (let i = 0; i < 3; i++) {
    const r = cp.spawnSync(eng, ['-interaction=nonstopmode', '-halt-on-error', 'main.tex'], { cwd: dir, encoding: 'utf8', timeout: 180000 });
    runs++;
    if (r.status !== 0) { ok = false; break; }
    const log = fs.readFileSync(path.join(dir, 'main.log'), 'latin1');
    if (i >= 1 && !/Rerun to get|Label\(s\) may have changed/.test(log)) break;
  }
  const log = fs.existsSync(path.join(dir, 'main.log')) ? fs.readFileSync(path.join(dir, 'main.log'), 'utf8') : '';
  const errors = (log.match(/^! .*$/gm) || []).slice(0, 3);
  const pdf = path.join(dir, 'main.pdf');
  const text = ok && fs.existsSync(pdf) ? pdfText(pdf) : null;
  return { ok, errors, text, runs };
}

function check(c, res){
  const f = [];
  if (!res.ok) return ['編譯失敗：' + res.errors.join(' | ')];
  if (res.text == null) return f;
  const t = norm(res.text);
  for (const s of [].concat(c.pdf || [])) if (!t.includes(norm(s))) f.push('PDF 缺少：' + s);
  for (const s of [].concat(c.nopdf || [])) if (t.includes(norm(s))) f.push('PDF 不該有：' + s);
  for (const s of [].concat(c.pdfraw || [])) if (!res.text.replace(/\s+/g, ' ').includes(s)) f.push('PDF 缺少（原字）：' + s);
  if (/[¡¿]/.test(res.text)) f.push('PDF 出現 ¡ 或 ¿（< > 印錯）');
  if (!c.cite && /\[\?\]/.test(t)) f.push('PDF 出現 [?]');
  if (!c.qq && /\?\?/.test(t)) f.push('PDF 出現 ??');
  return f;
}

function main(){
  const R = loadPipeline(SRC);
  fs.mkdirSync(OUT, { recursive: true });
  const rows = [];
  const flavors = BOTH ? ['preview', 'submission'] : ['preview'];
  const t0 = Date.now();
  for (const c of cases) {
    if (ONLY.length && !ONLY.includes(c.id)) continue;
    for (const fl of flavors) {
      let out;
      try { out = R.emit(c.md, c.settings, fl); } catch (e) { rows.push({ id: c.id, flavor: fl, crash: String(e.message || e) }); continue; }
      const assets = fl === 'submission' ? (out.assets || []).map(a => typeof a === 'string' ? a : a.path)
        .concat([...String(out.tex).matchAll(/\\includegraphics\[[^\]]*\]\{([^}]+)\}/g)].map(m => /\.[a-z]+$/i.test(m[1]) ? m[1] : m[1] + '.png')) : [];
      const res = compile(path.join(OUT, fl, c.id), out.tex, assets);
      rows.push({ id: c.id, flavor: fl, ok: res.ok, fails: check(c, res), errors: res.errors, text: res.text == null ? null : norm(res.text).slice(0, 600) });
    }
  }
  const compileFails = rows.filter(r => r.crash || !r.ok);
  const wrong = rows.filter(r => r.ok && r.fails.length);
  for (const r of rows) if (r.crash || r.fails && r.fails.length) console.log('✗ ' + r.id + ' [' + r.flavor + '] ' + (r.crash || r.fails.join('；')));
  const n = rows.length;
  console.log('revtex pdflatex matrix: ' + n + ' 次編譯（' + flavors.join('+') + '），編譯失敗 ' + compileFails.length
    + '，輸出錯誤 ' + wrong.length + (canText ? '' : '（沒有 PDF 文字檢查：未設定 EKD_PYTHON）')
    + '，耗時 ' + Math.round((Date.now() - t0) / 1000) + ' 秒。輸出在 ' + OUT);
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(rows, null, 1));
  return compileFails.length || wrong.length ? 1 : 0;
}
process.exit(main());
