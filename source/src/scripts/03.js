
/* ============================================================
   Checkpoint 3 — 應用層
   §7 格式/段落指令  §8 快捷鍵  §9 選單列  §10 側邊欄
   §11 狀態列  §12 檔案/儲存/匯入匯出  §13 初始化
   ============================================================ */

/* ---------- §7 指令:行內格式 ---------- */
/* ---------- CP36:格式快捷鍵的選取範圍定位 ----------
   舊病根:wrapSelection 先 activate()(textContent 重建 DOM + 游標移行尾)
   「再」讀選取 — 選取錨定的節點已亡:塌縮行尾 → 行尾多 ****;被夾成整塊
   → 整句前後包星號。編輯宿主(純文字段 span / 表格格 / 論文浮動框)開啟時
   更會被 activate 蓋掉:殘留 stale mathEditEl 觸發舊提交 + activeIndex 指
   著「渲染態」區塊,後續 deactivate(true) 以 getRawText(渲染 DOM) 回寫 →
   Markdown 定界符被靜默剝除(資料毀損)。論文模式則因 activate 改道
   openPaperEdit、activeIndex 仍 -1 → editor.children[-1] 拋例外。
   新法:一律「先定位、後動作」。
   (A) 選取在編輯宿主內 → 宿主顯示即 raw,原地包夾,不碰區塊層。
   (B) 渲染態區塊 → renderedPointToRaw() 以 startPlainEdit 同款 token 探索
       + CP34 plainSegVisMap 把端點換算 raw(端點落在 token 上吸附整個
       token → 選取粗體字再 ⌘B = 自然反轉),再自行進入啟用態。
   (C) 論文模式 → 直接改 raw 重渲染,版面鐵律(永遠渲染態)不破。 */
function renderedPointToRaw(el, raw, node, off){
  /* 頂層 token 聯集與 DOM 解析:與 startPlainEdit 同款(刻意同構,見開發筆記) */
  const rs = [];
  styleRangesOf(raw).forEach((r, idx) => rs.push({ start: r.start, end: r.end, attr: 'si', idx }));
  mathRangesOf(raw).forEach((r, idx) => rs.push({ start: r.start, end: r.end, attr: 'mi', idx }));
  rs.sort((a, b) => a.start - b.start || b.end - a.end);
  const top = [];
  for (const r of rs){
    const last = top[top.length - 1];
    if (last && r.start < last.end){ if (r.end > last.end) last.end = r.end; continue; }
    top.push({ start: r.start, end: r.end, attr: r.attr, idx: r.idx });
  }
  for (const t of top){
    let tn = el.querySelector('[data-' + t.attr + '="' + t.idx + '"]');
    if (!tn) return null;
    let p = tn.parentElement;
    while (p && p !== el){
      /* T8 v1.1(CP102):與 startPlainEdit 同構 — [data-il] 殼視為頂層 token 邊界 */
      if (p.dataset && (p.dataset.si !== undefined || p.dataset.mi !== undefined || p.dataset.il !== undefined)) tn = p;
      p = p.parentElement;
    }
    if (!el.contains(tn)) return null;
    t.el = tn;
  }
  let prev = null, next = null;
  try {
    for (const t of top){
      const pn = t.el.parentNode;
      const ci = Array.prototype.indexOf.call(pn.childNodes, t.el);
      if (node === pn && off === ci){ next = t; break; }          // 端點恰在 token 前緣
      if (node === pn && off === ci + 1){ prev = t; continue; }   // 端點恰在 token 後緣
      /* CP36v:同一個視覺邊界,瀏覽器可能表示成「token 文字節點的 0/尾端」,
         不一定表示成父節點 child index。舊版把這兩種邊界判成 token 內部,
         選取 token 後方普通文字時會誤把前一個 token 一起包住。 */
      if (t.el.contains(node)){
        const inside = document.createRange();
        inside.selectNodeContents(t.el);
        inside.setEnd(node, off);
        const v = inside.toString().length;
        const total = t.el.textContent.length;
        if (v <= 0) return { off: t.start };                      // token 可見文字前緣
        if (v >= total) return { off: t.end };                    // token 可見文字後緣
        return { tok: { start: t.start, end: t.end } };           // 真正在 token 內 → 吸附整個 token
      }
      const tr = document.createRange();
      tr.selectNode(t.el);
      const cmp = tr.comparePoint(node, off);
      if (cmp > 0) prev = t;
      else if (cmp < 0){ next = t; break; }
      else return { tok: { start: t.start, end: t.end } };        // 防禦性備援
    }
  } catch(_){ return null; }
  let runStart;
  if (prev) runStart = prev.end;
  else {
    const pm = raw.match(/^(#{1,6}\s+|>\s?|\s*[-*+]\s+(?:\[[ xX]\]\s+)?|\s*\d+\.\s+)/);
    runStart = pm ? pm[0].length : 0;
  }
  const runEnd = next ? next.start : raw.length;
  if (runStart > runEnd) return null;
  const rg = document.createRange(), mr = document.createRange();
  try {
    if (prev){ rg.setStartAfter(prev.el); mr.setStartAfter(prev.el); }
    else { /* CP137：next token 可能巢狀於 HTML style；量測必須從 block root 起算。 */ rg.setStart(el, 0); mr.setStart(el, 0); }
    if (next) rg.setEndBefore(next.el);
    else rg.setEnd(el, el.childNodes.length);
    mr.setEnd(node, off);
  } catch(_){ return null; }
  const seg = raw.slice(runStart, runEnd);
  const visOff = mr.toString().length;
  const map = plainSegVisMap(seg);
  const rawOff = (map.total === rg.toString().length)
    ? map.toRaw(visOff)
    : Math.min(seg.length, Math.max(0, visOff));                  // 未建模構造 → CP31 式退回
  return { off: runStart + rawOff };
}
/* CP136 — 結構感知行內格式核心（純函式，可由 Node 抽取測試） */
function clamp(n, a, b){ n = Number.isFinite(+n) ? +n : a; return Math.max(a, Math.min(b, n)); }

function wordRangeAt(text, off, mark, endMark){
  const W = /[A-Za-z0-9_]/;
  if (off < 0 || off > text.length) return null;
  const L = off > 0 ? text[off - 1] : '', R = off < text.length ? text[off] : '';
  if (!W.test(L) && !W.test(R)) return null;
  let s = off, e = off;
  while (s > 0 && W.test(text[s - 1])) s--;
  while (e < text.length && W.test(text[e])) e++;
  if (mark && text.slice(Math.max(0, s - mark.length), s) === mark) return null;
  if (endMark && text.slice(e, e + endMark.length) === endMark) return null;
  return { s, e };
}

const HTML_INLINE_TAGS = new Set([
  'u','ins','kbd','mark','sub','sup','b','i','em','strong','del','s','small','big','span','font','center','abbr','code','samp','var','ruby','rt','rp','a'
]);
const HTML_VOID_TAGS = new Set(['br','wbr','img']);
const HTML_STYLE_MAP = Object.freeze({
  strong:['bold'], b:['bold'], em:['italic'], i:['italic'], u:['underline'], ins:['underline'],
  del:['strike'], s:['strike'], mark:['mark'], code:['code'], a:['link']
});

function rangeIntersects(a, b, c, d){ return a < d && c < b; }

function inlineFormatRanges(raw){
  raw = String(raw == null ? '' : raw);
  const n = raw.length, masked = new Uint8Array(n), syntax = new Uint8Array(n), protectedMask = new Uint8Array(n);
  const out = [];
  const mark = (a,b,arr=masked) => { a=clamp(a,0,n); b=clamp(b,a,n); for(let i=a;i<b;i++) arr[i]=1; };
  const available = (a,b) => { for(let i=a;i<b;i++) if(masked[i]) return false; return true; };
  const push = r => { out.push(r); mark(r.openStart, r.openEnd, syntax); mark(r.closeStart, r.closeEnd, syntax); };

  // Escapes are visible as one character but the backslash is syntax. Mask both so markdown delimiters do not start there.
  /* 1.2.6：跳脫字元與左邊畫面（01.js inlineMD）同一組：所有 ASCII 標點，\( \) 留給數學。 */
  const escRe = /\\[!"#$%&'*+,\-./:;<=>?@\[\\\]^_`{|}~]/g; let m;
  while ((m = escRe.exec(raw))){ mark(m.index, m.index + m[0].length); syntax[m.index] = 1; }

  // Inline code: support arbitrary backtick runs and allow shorter runs inside.
  for (let i=0;i<n;){
    if (masked[i] || raw[i] !== '`'){ i++; continue; }
    let run=1; while(i+run<n && raw[i+run]==='`') run++;
    let j=i+run, close=-1;
    while(j<n){
      const k=raw.indexOf('`'.repeat(run), j);
      if(k<0) break;
      const before = k>0 ? raw[k-1] : '', after = k+run<n ? raw[k+run] : '';
      // Exact delimiter run: longer adjacent run is not a match.
      if(before!=='`' && after!=='`' && available(k,k+run)){ close=k; break; }
      j=k+run;
    }
    if(close>=0){
      push({kind:'code', styles:['code'], start:i, end:close+run, innerStart:i+run, innerEnd:close,
            openStart:i, openEnd:i+run, closeStart:close, closeEnd:close+run,
            openText:raw.slice(i,i+run), closeText:raw.slice(close,close+run), clearable:true});
      mark(i, close+run); // content is atomic; no nested markdown formatting.
      i=close+run;
    } else i+=run;
  }

  // Inline math is protected from inline formatting/clear. It has its own command/editor.
  const mathRes = [/\$\$(?=\S)([\s\S]+?)(?<=\S)\$\$/g,/\$(?=\S)([^$\n]+?)(?<=\S)\$(?!\d)/g,/\\\((.+?)\\\)/g];
  for(const re of mathRes){
    while((m=re.exec(raw))){ if(!available(m.index,m.index+m[0].length)) continue; mark(m.index,m.index+m[0].length); mark(m.index,m.index+m[0].length,protectedMask); }
  }

  // HTML comments are invisible/protected.
  const cmt=/<!--[\s\S]*?-->/g;
  while((m=cmt.exec(raw))){ if(!available(m.index,m.index+m[0].length)) continue; mark(m.index,m.index+m[0].length); mark(m.index,m.index+m[0].length,syntax); mark(m.index,m.index+m[0].length,protectedMask); }

  // HTML tags: mask syntax only, preserve/parse their body. Pair supported formatting/legacy tags with a stack.
  const stacks = new Map();
  const tagRe=/<\/?([A-Za-z][A-Za-z0-9]*)(?:(?:"[^"]*"|'[^']*'|[^"'<>])*)>/g;
  while((m=tagRe.exec(raw))){
    const a=m.index,b=a+m[0].length, name=m[1].toLowerCase();
    if(!available(a,b)) continue;
    if(!HTML_INLINE_TAGS.has(name) && !HTML_VOID_TAGS.has(name)) continue; // unsafe/unknown tags stay literal.
    const closing=/^<\//.test(m[0]), self=/\/\s*>$/.test(m[0]) || HTML_VOID_TAGS.has(name);
    mark(a,b); mark(a,b,syntax);
    if(name==='img'){
      out.push({kind:'image',styles:[],start:a,end:b,innerStart:a,innerEnd:b,openStart:a,openEnd:b,closeStart:b,closeEnd:b,openText:m[0],closeText:'',clearable:false,protected:true});
      mark(a,b,protectedMask);
      continue;
    }
    if(self) continue;
    if(!closing){
      const arr=stacks.get(name)||[]; arr.push({start:a,end:b,text:m[0]}); stacks.set(name,arr);
    } else {
      const arr=stacks.get(name)||[]; const op=arr.pop(); if(!op) continue;
      const styles=HTML_STYLE_MAP[name] ? [...HTML_STYLE_MAP[name]] : [];
      push({kind:name==='a'?'link':'html', tag:name, styles, start:op.start,end:b,innerStart:op.end,innerEnd:a,
            openStart:op.start,openEnd:op.end,closeStart:a,closeEnd:b,openText:op.text,closeText:m[0],clearable:true,html:true});
    }
  }

  // Entities are one visible character; mask their raw syntax from delimiter matching.
  const ent=/&(#\d{1,7}|#x[\da-fA-F]{1,6}|[A-Za-z][\dA-Za-z]{1,31});/g;
  while((m=ent.exec(raw))){ if(available(m.index,m.index+m[0].length)){ mark(m.index,m.index+m[0].length); mark(m.index,m.index+m[0].length,syntax); } }

  // TW_THESIS double-bracket citations are protected atoms. Formatting may wrap the
  // whole citation, but delimiters must never be inserted between its brackets,
  // numbers, commas, or range dash; otherwise [[2, 3]] silently stops linking.
  const cite=/\[\[\s*[0-9][0-9\s,，、．.·–—-]*?\s*\]\]/g;
  while((m=cite.exec(raw))){
    const a=m.index,b=a+m[0].length;if(!available(a,b))continue;
    out.push({kind:'citation',styles:[],start:a,end:b,innerStart:a,innerEnd:b,
      openStart:a,openEnd:a,closeStart:b,closeEnd:b,openText:'',closeText:'',clearable:false,protected:true});
    mark(a,b);mark(a,b,protectedMask);
  }

  // Markdown images are protected atoms.
  const img=/!\[([^\]]*)\]\(([^)]+?)(?:\s+"(.*?)")?\)/g;
  while((m=img.exec(raw))){
    const a=m.index,b=a+m[0].length; if(!available(a,b)) continue;
    out.push({kind:'image',styles:[],start:a,end:b,innerStart:a+2,innerEnd:a+2+m[1].length,
      openStart:a,openEnd:a+2,closeStart:a+2+m[1].length,closeEnd:b,openText:'![',closeText:raw.slice(a+2+m[1].length,b),clearable:false,protected:true});
    mark(a,b); mark(a,b,protectedMask); mark(a,a+2,syntax); mark(a+2+m[1].length,b,syntax);
  }

  // Markdown links: structure is syntax, label remains available for nested emphasis.
  const link=/\[([^\]]+)\]\(([^)]+?)(?:\s+"(.*?)")?\)/g;
  while((m=link.exec(raw))){
    const a=m.index,b=a+m[0].length; if(!available(a,a+1) || !available(a+1+m[1].length,b)) continue;
    push({kind:'link',styles:['link'],start:a,end:b,innerStart:a+1,innerEnd:a+1+m[1].length,
      openStart:a,openEnd:a+1,closeStart:a+1+m[1].length,closeEnd:b,openText:'[',closeText:raw.slice(a+1+m[1].length,b),clearable:true});
    mark(a,a+1); mark(a+1+m[1].length,b);
  }

  // Emphasis family; delimiter-only masking allows nested styles in the body.
  const scans = [
    /* 1.2.6：與左邊畫面同一組強調規則（01.js 的 EMPH_RE_*：單字中間的 _ 不是強調）。 */
    {re:new RegExp(EMPH_RE_TRIPLE.source,'gu'), styles:['bold','italic'], len:()=>3, kind:'emphasis'},
    {re:new RegExp(EMPH_RE_DOUBLE.source,'gu'), styles:['bold'], len:()=>2, kind:'bold'},
    {re:new RegExp(EMPH_RE_SINGLE.source,'gu'), styles:['italic'], len:()=>1, kind:'italic'},
    {re:/~~(?=\S)([\s\S]*?\S)~~/g, styles:['strike'], len:()=>2, kind:'strike'},
    {re:/==(?=\S)([\s\S]*?\S)==/g, styles:['mark'], len:()=>2, kind:'mark'}
  ];
  const emphChars=raw.split(''), EMPH_MASK='\u0002';
  for(let i=0;i<n;i++) if(masked[i]) emphChars[i]=EMPH_MASK;
  for(const scan of scans){
    scan.re.lastIndex=0;
    const scanText=emphChars.join('');
    while((m=scan.re.exec(scanText))){
      const a=m.index,b=a+m[0].length,L=scan.len(m);
      if(!available(a,a+L) || !available(b-L,b)) continue;
      const open=raw.slice(a,a+L), close=raw.slice(b-L,b);
      push({kind:scan.kind,styles:[...scan.styles],start:a,end:b,innerStart:a+L,innerEnd:b-L,
        openStart:a,openEnd:a+L,closeStart:b-L,closeEnd:b,openText:open,closeText:close,clearable:true});
      mark(a,a+L); mark(b-L,b);
      for(let k=0;k<L;k++){ emphChars[a+k]=EMPH_MASK; emphChars[b-L+k]=EMPH_MASK; }
    }
  }

  out.sort((a,b)=>a.start-b.start || b.end-a.end || a.openEnd-b.openEnd);
  return {ranges:out, syntax, protectedMask};
}

function expandSelectionToRanges(raw,s,e,ranges,predicate){
  s=clamp(s,0,raw.length); e=clamp(e,s,raw.length);
  let changed=true;
  while(changed){
    changed=false;
    for(const r of ranges){
      if(!predicate(r)) continue;
      if(rangeIntersects(s,e,r.start,r.end) || (s===e && s>r.start && s<r.end)){
        const ns=Math.min(s,r.start), ne=Math.max(e,r.end);
        if(ns!==s||ne!==e){s=ns;e=ne;changed=true;}
      }
    }
  }
  return {s,e};
}

function inlineSelectionFullyStyled(raw,s,e,style,parsed){
  const {ranges,syntax,protectedMask}=parsed || inlineFormatRanges(raw);
  const covered=new Uint8Array(raw.length);
  for(const r of ranges){
    if(r.styles && r.styles.includes(style)){
      for(let i=r.innerStart;i<r.innerEnd;i++) covered[i]=1;
    }
  }
  let seen=false;
  for(let i=s;i<e;i++){
    if(protectedMask[i] || syntax[i] || /\s/.test(raw[i])) continue;
    seen=true;
    if(!covered[i]) return false;
  }
  return seen;
}

function normalizeEdits(edits){
  const byKey=new Map();
  for(const x of edits){
    if(!x || x.start>x.end) continue;
    const key=x.start+':'+x.end;
    const old=byKey.get(key);
    if(!old || (old.text==='' && x.text!=='')) byKey.set(key,{start:x.start,end:x.end,text:String(x.text||'')});
  }
  const arr=[...byKey.values()].sort((a,b)=>a.start-b.start || a.end-b.end);
  const out=[];
  for(const x of arr){
    const last=out[out.length-1];
    if(last && x.start<last.end){
      // Nested/overlapping syntax edits should not occur except duplicate markers; keep the wider edit.
      if(x.end<=last.end) continue;
      throw new Error('overlapping inline edits: '+JSON.stringify([last,x]));
    }
    out.push(x);
  }
  return out;
}

function applyInlineEdits(raw,edits,s,e){
  edits=normalizeEdits(edits);
  let text='',pos=0,delta=0;
  for(const x of edits){ text+=raw.slice(pos,x.start)+x.text; pos=x.end; }
  text+=raw.slice(pos);
  const map=(p,affinity)=>{
    let d=0;
    for(const x of edits){
      if(p<x.start) break;
      if(p>x.end){ d+=x.text.length-(x.end-x.start); continue; }
      if(p===x.end){
        if(affinity==='before') return x.start+d;
        return x.start+d+x.text.length;
      }
      if(p>=x.start && p<x.end) return x.start+d+(affinity==='after'?x.text.length:0);
      if(p===x.start) return x.start+d+(affinity==='after'?x.text.length:0);
    }
    return p+d;
  };
  return {text,start:map(s,'after'),end:map(e,'before'),edits};
}

function targetRemovalEdits(r,style){
  if(!r.styles || !r.styles.includes(style)) return [];
  let open='',close='';
  if(r.kind==='emphasis' && r.openText.length===3){
    if(style==='bold'){ open=r.openText.slice(0,1); close=r.closeText.slice(-1); }
    else if(style==='italic'){ open=r.openText.slice(0,2); close=r.closeText.slice(-2); }
  }
  return [
    {start:r.openStart,end:r.openEnd,text:open},
    {start:r.closeStart,end:r.closeEnd,text:close}
  ];
}

/* CP137：delimiter 鄰接安全與重疊 style 語意區間。 */
function inlineDelimiterSafe(text, s, e, mark){
  if(!mark || /^</.test(mark)) return true;
  const ch=mark[0];
  return text[s-1]!==ch && text[s]!==ch && text[e-1]!==ch && text[e]!==ch;
}

function markerForStyle(style,inner,text,s,e){
  inner=String(inner); text=String(text==null?'':text); s=clamp(s,0,text.length); e=clamp(e,s,text.length);
  const pick=(mark,close=mark)=>inlineDelimiterSafe(text,s,e,mark)?[mark,close]:null;
  if(style==='bold'){
    if(!inner.includes('**')){ const x=pick('**'); if(x) return x; }
    if(!inner.includes('__')){ const x=pick('__'); if(x) return x; }
    return null;
  }
  if(style==='italic'){
    if(!inner.includes('*')){ const x=pick('*'); if(x) return x; }
    if(!inner.includes('_')){ const x=pick('_'); if(x) return x; }
    return null;
  }
  if(style==='underline') return ['<u>','</u>'];
  if(style==='strike'){
    if(!inner.includes('~~')){ const x=pick('~~'); if(x) return x; }
    return null;
  }
  if(style==='mark'){
    if(!inner.includes('==')){ const x=pick('=='); if(x) return x; }
    return null;
  }
  if(style==='code'){
    let max=0; inner.replace(/`+/g,x=>{max=Math.max(max,x.length);return x;});
    const left=(text.slice(0,s).match(/`+$/)||[''])[0].length;
    const right=(text.slice(e).match(/^`+/)||[''])[0].length;
    const tick='`'.repeat(Math.max(max,left,right)+1);
    return [tick,tick];
  }
  throw new Error('unknown style '+style);
}

const INLINE_SEMANTIC_STYLES = Object.freeze(['bold','italic','underline','strike','mark']);
const INLINE_SEMANTIC_BITS = Object.freeze({bold:1,italic:2,underline:4,strike:8,mark:16});
function inlineSemanticRange(r){
  return !!(r && r.clearable && !r.protected && r.kind!=='code' && r.kind!=='link' &&
    r.styles && r.styles.some(x=>INLINE_SEMANTIC_BITS[x]));
}
function inlineSemanticMaskAt(parsed,off){
  let mask=0;
  for(const r of parsed.ranges){
    if(off>=r.innerStart&&off<r.innerEnd)for(const st of r.styles||[])mask|=INLINE_SEMANTIC_BITS[st]||0;
  }
  return mask;
}
function inlineSemanticNormalizeWhitespace(clean,masks){
  const out=new Uint8Array(masks);
  for(let i=0;i<clean.length;){
    if(!/\s/.test(clean[i])){i++;continue;}
    let j=i+1;while(j<clean.length&&/\s/.test(clean[j]))j++;
    const left=i>0?out[i-1]:0,right=j<clean.length?out[j]:0;
    const v=left&&left===right?left:0;
    for(let k=i;k<j;k++)out[k]=v;
    i=j;
  }
  return out;
}
function inlineSemanticMaskCandidates(mask,body){
  body=String(body);mask=mask|0;
  if(!mask)return [{text:body,open:'',close:'',rank:0}];
  if(!body||/^\s|\s$/.test(body))return [];
  const bi=mask&(INLINE_SEMANTIC_BITS.bold|INLINE_SEMANTIC_BITS.italic);
  let base;
  if(bi===(INLINE_SEMANTIC_BITS.bold|INLINE_SEMANTIC_BITS.italic))base=[
    // Never emit ambiguous triple runs. Explicitly nested mixed delimiters are
    // deterministic for both our parser and external Markdown engines.
    ['**_','_**'],['__*','*__'],['_**','**_'],['*__','__*']
  ];
  else if(bi===INLINE_SEMANTIC_BITS.bold)base=[['**','**'],['__','__']];
  else if(bi===INLINE_SEMANTIC_BITS.italic)base=[['_','_'],['*','*']];
  else base=[['','']];
  const out=[];
  for(let rank=0;rank<base.length;rank++){
    let [open,close]=base[rank];
    if(mask&INLINE_SEMANTIC_BITS.strike){open='~~'+open;close=close+'~~';}
    if(mask&INLINE_SEMANTIC_BITS.mark){open='=='+open;close=close+'==';}
    if(mask&INLINE_SEMANTIC_BITS.underline){open='<u>'+open;close=close+'</u>';}
    out.push({text:open+body+close,open,close,rank});
  }
  return out;
}
function inlineSemanticBuild(clean,runs,choices){
  let out='';const pos=new Int32Array(clean.length),before=new Int32Array(clean.length+1),after=new Int32Array(clean.length+1),hasBefore=new Uint8Array(clean.length+1);
  for(let ri=0;ri<runs.length;ri++){
    const r=runs[ri],c=choices[ri];
    if(!hasBefore[r.s]){before[r.s]=out.length;hasBefore[r.s]=1;}
    out+=c.open;after[r.s]=out.length;
    for(let i=r.s;i<r.e;i++){
      pos[i]=out.length;out+=clean[i];
      if(i+1<r.e){before[i+1]=out.length;after[i+1]=out.length;hasBefore[i+1]=1;}
    }
    before[r.e]=out.length;hasBefore[r.e]=1;out+=c.close;after[r.e]=out.length;
  }
  if(!runs.length){before[0]=after[0]=0;}
  return {text:out,pos,before,after};
}
function inlineSemanticValidate(built,clean,masks,prefix='',suffix=''){
  if(!built||built.text.length<clean.length)return false;
  prefix=String(prefix||'');suffix=String(suffix||'');
  const sourceParsed=inlineFormatRanges(clean),parsed=inlineFormatRanges(prefix+built.text+suffix),base=prefix.length;
  for(let i=0;i<clean.length;i++){
    const local=built.pos[i],at=base+local;
    if(built.text[local]!==clean[i])return false;
    if(sourceParsed.syntax[i]||sourceParsed.protectedMask[i]||/\s/.test(clean[i]))continue;
    if(parsed.syntax[at]||parsed.protectedMask[at])return false;
    if(inlineSemanticMaskAt(parsed,at)!==(masks[i]&31))return false;
  }
  return true;
}
function inlineSemanticSerialize(clean,masks,selS,selE,prefix='',suffix=''){
  masks=inlineSemanticNormalizeWhitespace(clean,masks);prefix=String(prefix||'');suffix=String(suffix||'');
  const runs=[];
  for(let i=0;i<clean.length;){let j=i+1;while(j<clean.length&&masks[j]===masks[i])j++;runs.push({s:i,e:j,mask:masks[i]});i=j;}
  let beam=[{out:'',choices:[],score:0}];
  const special=/[*_~=]/,leftBoundary=prefix.slice(-1),rightBoundary=suffix.slice(0,1);
  for(const r of runs){
    const body=clean.slice(r.s,r.e),cands=inlineSemanticMaskCandidates(r.mask,body),next=[];
    if(!cands.length)return null;
    for(const state of beam)for(const c of cands){
      const a=state.out.slice(-1)||(state.choices.length?'' : leftBoundary),b=c.text[0]||'';
      if(a&&b&&a===b&&special.test(a))continue;
      next.push({out:state.out+c.text,choices:state.choices.concat(c),score:state.score+c.open.length+c.close.length+c.rank});
    }
    next.sort((a,b)=>a.score-b.score||a.out.length-b.out.length||a.out.localeCompare(b.out));
    const seen=new Set();beam=[];
    for(const q of next){const key=q.out.slice(-24)+'\u0000'+q.choices.length;if(seen.has(key))continue;seen.add(key);beam.push(q);if(beam.length>=48)break;}
    if(!beam.length)return null;
  }
  for(const state of beam){
    if(state.out&&rightBoundary&&state.out.slice(-1)===rightBoundary&&special.test(rightBoundary))continue;
    const built=inlineSemanticBuild(clean,runs,state.choices);
    if(inlineSemanticValidate(built,clean,masks,prefix,suffix))return {text:built.text,start:built.after[selS],end:built.before[selE]};
  }
  return null;
}
function inlineSemanticFormatTransform(raw,s,e,style,parsed,wasCollapsed){
  const ranges=parsed.ranges.filter(inlineSemanticRange);
  // Semantic wrappers and protected atoms are both transaction boundaries.
  // Expanding across a touched atom prevents a selection ending inside [[2,3]],
  // $math$, code, or an image from inserting a delimiter into its syntax.
  const boundaries=parsed.ranges.filter(r=>inlineSemanticRange(r)||r.protected);
  let scopeS=s,scopeE=e,changed=true;
  while(changed){
    changed=false;
    for(const r of boundaries){
      const touch=rangeIntersects(scopeS,scopeE,r.start,r.end)||
        (scopeS===scopeE&&scopeS>r.start&&scopeS<r.end)||
        (inlineSemanticRange(r)&&(r.start===scopeE||r.end===scopeS));
      if(touch){
        const a=Math.min(scopeS,r.start),b=Math.max(scopeE,r.end);
        if(a!==scopeS||b!==scopeE){scopeS=a;scopeE=b;changed=true;}
      }
    }
  }
  const local=ranges.filter(r=>r.start>=scopeS&&r.end<=scopeE);
  const seg=raw.slice(scopeS,scopeE),edits=[];
  for(const r of local)edits.push({start:r.openStart-scopeS,end:r.openEnd-scopeS,text:''},{start:r.closeStart-scopeS,end:r.closeEnd-scopeS,text:''});
  const cleanSel=applyInlineEdits(seg,edits,s-scopeS,e-scopeS),clean=cleanSel.text,masks=new Uint8Array(clean.length);
  for(const r of local){
    const q=applyInlineEdits(seg,edits,r.innerStart-scopeS,r.innerEnd-scopeS);
    for(const st of r.styles||[]){const bit=INLINE_SEMANTIC_BITS[st];if(!bit)continue;for(let i=q.start;i<q.end;i++)masks[i]|=bit;}
  }
  const bit=INLINE_SEMANTIC_BITS[style];let fmtS=cleanSel.start,fmtE=cleanSel.end;
  while(fmtS<fmtE&&/\s/.test(clean[fmtS]))fmtS++;
  while(fmtE>fmtS&&/\s/.test(clean[fmtE-1]))fmtE--;
  if(fmtS===fmtE)return {text:raw,start:s,end:e,changed:false,mode:'noop',collapsed:!!wasCollapsed};
  let seen=false,full=true;
  for(let i=fmtS;i<fmtE;i++){if(/\s/.test(clean[i]))continue;seen=true;if(!(masks[i]&bit)){full=false;break;}}
  full=seen&&full;
  for(let i=fmtS;i<fmtE;i++){if(full)masks[i]&=~bit;else masks[i]|=bit;}
  // Atomic inline constructs (math, citations, images, inline code) are one
  // semantic unit. A visible selection can start/end inside their rendered
  // text, but serialization must never split Markdown delimiters inside their
  // source syntax. Normalize every atom to one mask and apply the target style
  // to the whole atom whenever the selection touches it.
  const cleanParsed=inlineFormatRanges(clean);
  for(const atom of cleanParsed.ranges){
    if(!atom.protected)continue;
    let atomMask=0;for(let i=atom.start;i<atom.end;i++)atomMask|=masks[i]||0;
    if(rangeIntersects(fmtS,fmtE,atom.start,atom.end)){
      if(full)atomMask&=~bit;else atomMask|=bit;
    }
    for(let i=atom.start;i<atom.end;i++)masks[i]=atomMask;
  }
  const z=inlineSemanticSerialize(clean,masks,cleanSel.start,cleanSel.end,raw.slice(0,scopeS),raw.slice(scopeE));
  if(!z)return {text:raw,start:s,end:e,changed:false,mode:'unsafe',unsafe:true,collapsed:!!wasCollapsed};
  const text=raw.slice(0,scopeS)+z.text+raw.slice(scopeE);
  return {text,start:scopeS+z.start,end:scopeS+z.end,changed:text!==raw,mode:full?'remove':'apply',collapsed:!!wasCollapsed,scopeStart:scopeS,scopeEnd:scopeE};
}

function inlineFormatTransform(raw,s,e,style){
  raw=String(raw==null?'':raw); s=clamp(s,0,raw.length); e=clamp(e,s,raw.length);
  const wasCollapsed=s===e;
  if(wasCollapsed){ const w=wordRangeAt(raw,s); if(w){s=w.s;e=w.e;} }
  let parsed=inlineFormatRanges(raw);
  if(INLINE_SEMANTIC_BITS[style] && s<e)
    return inlineSemanticFormatTransform(raw,s,e,style,parsed,wasCollapsed);
  const ex=expandSelectionToRanges(raw,s,e,parsed.ranges,r=>r.styles&&r.styles.includes(style)); s=ex.s;e=ex.e;
  const full=inlineSelectionFullyStyled(raw,s,e,style,parsed);
  const edits=[];
  for(const r of parsed.ranges){ if(r.start>=s && r.end<=e && r.styles&&r.styles.includes(style)) edits.push(...targetRemovalEdits(r,style)); }
  const clean=applyInlineEdits(raw,edits,s,e);
  let cs=clean.start,ce=clean.end;
  if(ce<cs) ce=cs;
  if(full){
    return {text:clean.text,start:cs,end:ce,changed:clean.text!==raw,mode:'remove',collapsed:wasCollapsed&&s===e};
  }
  if(cs===ce && wasCollapsed){
    const pair=markerForStyle(style,'',clean.text,cs,ce);
    if(!pair)return {text:raw,start:s,end:e,changed:false,mode:'unsafe',unsafe:true,collapsed:true};
    const [open,close]=pair;
    const text=clean.text.slice(0,cs)+open+close+clean.text.slice(ce);
    return {text,start:cs+open.length,end:cs+open.length,changed:true,mode:'apply',collapsed:true};
  }
  let fmtS=cs,fmtE=ce;
  while(fmtS<fmtE && /\s/.test(clean.text[fmtS])) fmtS++;
  while(fmtE>fmtS && /\s/.test(clean.text[fmtE-1])) fmtE--;
  if(fmtS===fmtE){
    return {text:clean.text,start:cs,end:ce,changed:clean.text!==raw,mode:'noop',collapsed:false};
  }
  const inner=clean.text.slice(fmtS,fmtE),pair=markerForStyle(style,inner,clean.text,fmtS,fmtE);
  if(!pair)return {text:raw,start:s,end:e,changed:false,mode:'unsafe',unsafe:true,collapsed:false};
  const [open,close]=pair;
  const wrapped=applyInlineEdits(clean.text,[
    {start:fmtS,end:fmtS,text:open},
    {start:fmtE,end:fmtE,text:close}
  ],cs,ce);
  return {text:wrapped.text,start:wrapped.start,end:wrapped.end,changed:wrapped.text!==raw,mode:'apply',collapsed:false};
}

function genericWrapTransform(raw,s,e,kind){
  raw=String(raw==null?'':raw); s=clamp(s,0,raw.length); e=clamp(e,s,raw.length); const wasCollapsed=s===e;
  if(wasCollapsed){ const w=wordRangeAt(raw,s); if(w){s=w.s;e=w.e;} }
  if(kind==='link'){
    let parsed=inlineFormatRanges(raw);
    const ex=expandSelectionToRanges(raw,s,e,parsed.ranges,r=>r.kind==='link'); s=ex.s; e=ex.e;
    const full=inlineSelectionFullyStyled(raw,s,e,'link',parsed);
    const edits=[];
    for(const r of parsed.ranges){
      if(r.kind==='link' && r.start>=s && r.end<=e){
        edits.push({start:r.openStart,end:r.openEnd,text:''},{start:r.closeStart,end:r.closeEnd,text:''});
      }
    }
    const clean=applyInlineEdits(raw,edits,s,e), cs=clean.start, ce=Math.max(clean.start,clean.end);
    if(full) return {text:clean.text,start:cs,end:ce,changed:clean.text!==raw,mode:'remove',collapsed:false};
    const inner=clean.text.slice(cs,ce), open='[',close='](url)';
    const text=clean.text.slice(0,cs)+open+inner+close+clean.text.slice(ce);
    if(cs===ce&&wasCollapsed) return {text,start:cs+1,end:cs+1,changed:true,mode:'apply',collapsed:true};
    return {text,start:cs+1,end:cs+1+inner.length,changed:text!==raw,mode:'apply',collapsed:false};
  }
  if(kind==='math'){
    // Toggle an exact $...$ selection only; otherwise wrap. Block math is handled separately.
    if(s>0 && e<raw.length && raw[s-1]==='$' && raw[e]==='$' && raw[s-2]!=='$' && raw[e+1]!=='$'){
      const text=raw.slice(0,s-1)+raw.slice(s,e)+raw.slice(e+1);
      return {text,start:s-1,end:e-1,changed:true,mode:'remove',collapsed:false};
    }
    const inner=raw.slice(s,e), text=raw.slice(0,s)+'$'+inner+'$'+raw.slice(e);
    if(s===e&&wasCollapsed) return {text,start:s+1,end:s+1,changed:true,mode:'apply',collapsed:true};
    return {text,start:s+1,end:s+1+inner.length,changed:true,mode:'apply',collapsed:false};
  }
  throw new Error('unknown generic wrap '+kind);
}

function inlineBodyBounds(raw){
  raw=String(raw==null?'':raw);
  const m=raw.match(/^(?:\s*<!--\s*noindent\s*-->\s*)?(?:#{1,6}\s+|>\s?|\s*[-*+]\s+(?:\[[ xX]\]\s+)?|\s*\d+\.\s+)?/i);
  return {s:m?m[0].length:0,e:raw.length};
}

function clearInlineFormatting(raw,s,e){
  raw=String(raw==null?'':raw); s=clamp(s,0,raw.length); e=clamp(e,s,raw.length);
  if(s===e){ const b=inlineBodyBounds(raw); s=b.s;e=b.e; }
  let parsed=inlineFormatRanges(raw);
  const ex=expandSelectionToRanges(raw,s,e,parsed.ranges,r=>r.clearable&&!r.protected); s=ex.s;e=ex.e;
  parsed=inlineFormatRanges(raw);
  const edits=[];
  for(const r of parsed.ranges){
    if(!r.clearable || r.protected || r.start<s || r.end>e) continue;
    edits.push({start:r.openStart,end:r.openEnd,text:''},{start:r.closeStart,end:r.closeEnd,text:''});
  }
  const z=applyInlineEdits(raw,edits,s,e);
  return {text:z.text,start:z.start,end:z.end,changed:z.text!==raw,mode:'clear',collapsed:false};
}


/* CP136:結構感知的行內格式命令層。
   純函式核心先辨識既有 Markdown/HTML 行內標記，再以同一組 transform
   服務渲染頁、原始碼、Paper 浮動框、逐格表格與局部 token 編輯宿主。
   工具列 mousedown 保留 Selection；命令完成後把 Selection 投影回修改後內容。 */
function inlineDiffWindow(before, after){
  before = String(before == null ? '' : before);
  after = String(after == null ? '' : after);
  let a = 0, z0 = before.length, z1 = after.length;
  while (a < z0 && a < z1 && before[a] === after[a]) a++;
  while (z0 > a && z1 > a && before[z0 - 1] === after[z1 - 1]){ z0--; z1--; }
  return { start:a, end:z0, text:after.slice(a,z1) };
}
function inlineForbiddenTagCount(raw){
  return (String(raw==null?'':raw).match(/<\/?(?:strong|b|em|i|del|s|mark|code)>/gi)||[]).length;
}
function inlinePunctuationEntityCount(raw){
  return rawIntegrityStats(String(raw==null?'':raw)).entities;
}
function inlineTransactionEnvelope(raw,s,e,options,result){
  raw=String(raw==null?'':raw);s=clamp(s,0,raw.length);e=clamp(e,s,raw.length);options=options||{};
  if(options.kind==='clear'&&s===e){const b=inlineBodyBounds(raw);s=b.s;e=b.e;}
  else if(s===e){const w=wordRangeAt(raw,s);if(w){s=w.s;e=w.e;}}
  const parsed=inlineFormatRanges(raw),ex=expandSelectionToRanges(raw,s,e,parsed.ranges,r=>r.clearable&&!r.protected);
  s=ex.s;e=ex.e;
  if(result&&Number.isFinite(result.scopeStart)&&Number.isFinite(result.scopeEnd)){
    s=Math.min(s,result.scopeStart);e=Math.max(e,result.scopeEnd);
  }
  return {s,e};
}
function inlineTransactionAudit(raw,result,s,e,options){
  if(!result)return {ok:false,reason:'empty'};
  if(result.unsafe)return {ok:false,reason:'unsafe'};
  if(!result.changed)return {ok:true,reason:'noop'};
  const after=String(result.text==null?'':result.text),before=String(raw==null?'':raw),d=inlineDiffWindow(before,after),env=inlineTransactionEnvelope(before,s,e,options,result);
  if(d.start<env.s||d.end>env.e)return {ok:false,reason:'scope',diff:d,env};
  if(inlinePunctuationEntityCount(after)>inlinePunctuationEntityCount(before))return {ok:false,reason:'entity'};
  if(inlineForbiddenTagCount(after)>inlineForbiddenTagCount(before))return {ok:false,reason:'html'};
  return {ok:true,reason:'ok',diff:d,env};
}
function inlineUnsafeMessage(reason){
  toast(TT(reason==='scope'
    ? '為避免改動選取範圍以外的原始碼，這次格式操作已取消。'
    : '這個重疊格式無法安全地寫成 Markdown；原文保持不變。',
    reason==='scope'
      ? 'The format command was cancelled because it would change source outside the selection.'
      : 'This overlap cannot be represented safely as Markdown; the source was left unchanged.'));
}
function inlineAcceptTransaction(raw,result,s,e,options){
  const q=inlineTransactionAudit(raw,result,s,e,options);
  if(!q.ok)inlineUnsafeMessage(q.reason);
  return q.ok;
}
function inlineProtectedRaw(raw){
  const t = blockType(String(raw == null ? '' : raw));
  return t === 'code' || t === 'math' || t === 'table';
}
function inlineProtectedMessage(){
  toast(TT('這是程式碼區塊、區塊公式或表格結構；行內格式不會修改它。','This is a code block, display-math block, or table structure; inline formatting will not modify it.'));
}
function inlineSourceBlockContext(value, s, e){
  value = String(value == null ? '' : value);
  s = clamp(s,0,value.length); e = clamp(e,s,value.length);
  const arr = splitToBlocks(value);
  let base = 0;
  for (let i=0;i<arr.length;i++){
    const raw = arr[i], end = base + raw.length;
    if (s >= base && s <= end && e >= base && e <= end)
      return { i, raw, base, s:s-base, e:e-base };
    base = end + 1;
  }
  return null;
}
function inlineWholeTokenSelection(el, raw, s, e){
  /* KaTeX 的 raw→DOM 投影回傳幾何 caret（沒有 node），但完整行內公式仍可
     直接選取其渲染 token。這讓「套用行內公式」後仍保留可見選取，也能接續
     其他命令；圖片沒有文字內容，不宣稱能形成文字 selection。 */
  const math = mathRangesOf(raw);
  for (let i=0;i<math.length;i++){
    const b = paperMathInnerBounds(raw, math[i]);
    if (b && s === b.start && e === b.end){
      const tok = el.querySelector('[data-mi="' + i + '"]');
      if (tok) return tok;
    }
  }
  return null;
}
function inlineRestoreRenderedSelection(el, raw, s, e){
  if (!el || !el.isConnected) return false;
  /* CP137：格式快捷鍵可能在同一個 animation frame 內連續觸發。舊版把
     selection 投影延後到 rAF，下一個 ⌘B／⌘I 會讀到空 selection，於是
     同一組操作依速度不同而落到不同 raw 範圍。DOM 的 innerHTML 寫入是同步的，
     因此在命令返回前立刻恢復 Range；rAF 只負責解除 selectionchange 抑制。 */
  suppressSel++;
  let ok = false;
  try {
    const a = paperRawToDomPoint(el, raw, s), b = paperRawToDomPoint(el, raw, e);
    const rg = document.createRange();
    if (a && a.node && b && b.node){
      rg.setStart(a.node, a.off); rg.setEnd(b.node, b.off);
    } else {
      const tok = inlineWholeTokenSelection(el, raw, s, e);
      if (!tok) throw new Error('selection projection unavailable');
      rg.selectNodeContents(tok);
    }
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(rg);
    ok = true;
  } catch(_){ /* 無法投影時保持渲染內容，不退回 raw 顯示 */ }
  requestAnimationFrame(() => suppressSel = Math.max(0, suppressSel - 1));
  return ok;
}
/* CP138 — 局部編輯宿主不得成為第二份真相。
   CP137 以前，token/plain-edit 宿主的格式命令只改 host.textContent；blocks 仍是舊值。
   使用者離開宿主時 commitMathEdit() 再用開框時的快照回寫，便會讓剛才看見的粗體
   突然消失。更糟的是，拖曳選取若一端在宿主內、另一端在宿主外，舊分流只看
   anchorNode，會把整個跨區選取誤當成宿主內選取。

   新流程先把「混合 DOM（宿主顯示 raw、其餘顯示 renderer）」的兩個端點投影回
   同一份 currentRaw，格式核心只運算一次，通過 audit 後先提交 blocks，再重渲染與
   恢復 selection。視圖從此不會先於模型，也沒有 blur 時可覆寫的新舊兩份內容。 */
function inlineVisibleDomOffset(root,node,off){
  if(!root||!node||!(root===node||root.contains(node)))return null;
  const nodes=paperVisibleTextNodes(root);let total=0;
  for(const n of nodes){
    if(n===node)return total+clamp(off,0,n.data.length);
    const rel=n.compareDocumentPosition(node);
    if(rel&Node.DOCUMENT_POSITION_FOLLOWING){total+=n.data.length;continue;} // n 在端點之前
    if(node.nodeType===Node.ELEMENT_NODE&&node.contains(n)){
      let c=n;while(c.parentNode&&c.parentNode!==node)c=c.parentNode;
      const ix=Array.prototype.indexOf.call(node.childNodes,c);
      if(ix>=0&&ix<off){total+=n.data.length;continue;}
    }
    break;
  }
  return total;
}
function inlinePointAfterNode(ref,node,off){
  try{
    const rr=document.createRange(),pr=document.createRange();
    rr.selectNode(ref);pr.setStart(node,off);pr.collapse(true);
    return rr.compareBoundaryPoints(Range.END_TO_START,pr)<=0;
  }catch(_){return !!(ref.compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING);}
}
function inlineLocalRenderProbe(raw,blockEl){
  const probe=document.createElement('div');
  probe.className='block cp138-inline-probe';
  probe.setAttribute('aria-hidden','true');
  probe.style.cssText='position:fixed!important;left:-100000px!important;top:0!important;opacity:0!important;pointer-events:none!important;contain:layout style!important;';
  const w=blockEl&&blockEl.getBoundingClientRect?blockEl.getBoundingClientRect().width:0;
  if(w>0)probe.style.width=w+'px';
  probe.innerHTML=renderBlockHTML(raw);
  document.body.appendChild(probe);
  return probe;
}
function inlineLocalSessionContext(sel){
  const host=mathEditEl,info=mathEditInfo;
  if(!host||!host.isConnected||!info||!editContextValid(info,info.i))return null;
  const blockEl=info.blockEl;
  if(!blockEl||!blockEl.isConnected||editor.children[info.i]!==blockEl)return null;
  /* 局部宿主開啟後，blocks 必須仍等於開框快照。若其他流程已先改動該區塊，
     寧可 fail closed，也不能拿舊快照覆蓋較新的 canonical model。 */
  const base=String(info.raw==null?'':info.raw);
  if(String(blocks[info.i]==null?'':blocks[info.i])!==base)return {stale:true,info,host,blockEl};
  if(!sel||!sel.rangeCount)return null;
  const aNode=sel.anchorNode,fNode=sel.isCollapsed?sel.anchorNode:sel.focusNode;
  if(!aNode||!fNode)return null;
  const aBlock=blockElOf(aNode),fBlock=blockElOf(fNode);
  if(aBlock!==blockEl||fBlock!==blockEl)return {crossBlock:true,info,host,blockEl};
  const hostRaw=getRawText(host),currentRaw=base.slice(0,info.start)+hostRaw+base.slice(info.end);
  let probe=null;
  try{
    probe=inlineLocalRenderProbe(currentRaw,blockEl);
    const hostA=info.start,hostB=info.start+hostRaw.length;
    const probeA=paperRawToDomPoint(probe,currentRaw,hostA),probeB=paperRawToDomPoint(probe,currentRaw,hostB);
    let renderedHostLen=hostRaw.length;
    if(probeA&&probeB&&probeA.node&&probeB.node){
      const va=inlineVisibleDomOffset(probe,probeA.node,probeA.off),vb=inlineVisibleDomOffset(probe,probeB.node,probeB.off);
      if(va!=null&&vb!=null)renderedHostLen=Math.max(0,vb-va);
    }
    const mapPoint=(node,off)=>{
      if(host===node||host.contains(node)){
        try{return clamp(info.start+offsetInBlock(host,node,off),0,currentRaw.length);}catch(_){return null;}
      }
      const live=inlineVisibleDomOffset(blockEl,node,off);
      if(live==null)return null;
      const vis=inlinePointAfterNode(host,node,off)?live-hostRaw.length+renderedHostLen:live;
      const q=paperTextPoint(paperVisibleTextNodes(probe),Math.max(0,vis));
      if(!q)return vis<=0?0:currentRaw.length;
      const rawOff=paperPointToRaw(probe,currentRaw,q.node,q.off);
      return rawOff==null?null:clamp(rawOff,0,currentRaw.length);
    };
    const a=mapPoint(sel.anchorNode,sel.anchorOffset),f=sel.isCollapsed?a:mapPoint(sel.focusNode,sel.focusOffset);
    if(a==null||f==null)return null;
    return {info,host,blockEl,currentRaw,a,f,s:Math.min(a,f),e:Math.max(a,f),backward:a>f};
  }finally{if(probe)probe.remove();}
}
function inlineCommitLocalSession(ctx,result){
  if(!ctx||!result||!result.changed)return false;
  const {info,blockEl}=ctx,i=info.i;
  if(info.isIl)ilArmUndo();else pushUndo();
  /* 清掉宿主指標後再替換 DOM，避免 selectionchange／blur 看到已斷線 host 又提交一次。 */
  mathEditEl=null;mathEditInfo=null;hideMathPreview();
  blocks[i]=result.text;
  suppressSel++;
  blockEl.className='block';
  blockEl.innerHTML=renderBlockHTML(result.text);
  requestAnimationFrame(()=>suppressSel=Math.max(0,suppressSel-1));
  inlineRestoreRenderedSelection(blockEl,result.text,result.start,result.end);
  onEdited();updateBlockInfo();schedulePaginate();
  return true;
}
function inlineApplyHostResult(host, result, options){
  if (!result || !result.changed) return false;
  options = options || {};
  if (mathEditInfo && mathEditInfo.isIl) ilArmUndo();
  else pushUndo();
  host.textContent = result.text;
  setCaretRange(host, result.start, result.end);
  if (options.previewMath && mathEditInfo && mathEditInfo.isMath)
    showMathPreview(host, host.textContent);
  if (options.inputEvent){
    try { host.dispatchEvent(new InputEvent('input', { bubbles:true, inputType:'formatBackColor' })); }
    catch(_){ host.dispatchEvent(new Event('input', { bubbles:true })); }
  }
  return true;
}
/* CP137：rendered selection 端點保留精確 raw offset；只有公式維持原子 token。 */
function inlineRenderedPoint(el, raw, node, off){
  if (!node || !el || !el.contains(node)) return null;
  const host = node.nodeType === 1 ? node : node.parentElement;
  const mt = host && host.closest ? host.closest('[data-mi]') : null;
  if (mt && el.contains(mt)){
    const rr = mathRangesOf(raw)[+mt.dataset.mi];
    if (rr) return { tok:{start:rr.start,end:rr.end}, protected:true };
  }
  const q = paperPointToRaw(el, raw, node, off);
  return q == null ? null : { off:q };
}
function inlineRenderedOffsets(el, raw, sel){
  const p1 = inlineRenderedPoint(el, raw, sel.anchorNode, sel.anchorOffset);
  const p2 = sel.isCollapsed ? p1 : inlineRenderedPoint(el, raw, sel.focusNode, sel.focusOffset);
  if (!p1 || !p2) return null;
  const key = p => p.tok ? p.tok.start : p.off;
  const [P,Q] = key(p1) <= key(p2) ? [p1,p2] : [p2,p1];
  return {
    s:P.tok ? P.tok.start : P.off,
    e:Q.tok ? Q.tok.end : Q.off
  };
}
function runInlineTransform(transformer, options){
  options = options || {};
  const clearMode = options.kind === 'clear';

  /* Source Mode:只允許同一個 block；以最小差異寫回 textarea，保留原生 Undo。 */
  if (settings.srcmode){
    const v = srcview.value, ctx = inlineSourceBlockContext(v, srcview.selectionStart, srcview.selectionEnd);
    if (!ctx){ toast(TT('請只選取同一個段落內的文字','Select text within a single paragraph')); return false; }
    if (inlineProtectedRaw(ctx.raw)){ inlineProtectedMessage(); return false; }
    const result = transformer(ctx.raw, ctx.s, ctx.e);
    if (!result || !inlineAcceptTransaction(ctx.raw,result,ctx.s,ctx.e,options)){ srcview.focus(); srcview.setSelectionRange(ctx.base + (result ? result.start : ctx.s), ctx.base + (result ? result.end : ctx.e)); return false; }
    if (!result.changed){ srcview.focus(); srcview.setSelectionRange(ctx.base + result.start, ctx.base + result.end); return false; }
    const d = inlineDiffWindow(ctx.raw, result.text);
    const native = srcReplaceRange(ctx.base + d.start, ctx.base + d.end, d.text);
    srcview.focus(); srcview.setSelectionRange(ctx.base + result.start, ctx.base + result.end);
    if (!native) srcview.dispatchEvent(new Event('input', { bubbles:true }));
    return true;
  }

  const sel = getSelection();
  const anc = sel && sel.rangeCount ? sel.anchorNode : null;
  const ancEl = anc ? (anc.nodeType === 1 ? anc : anc.parentElement) : null;

  /* Paper/TW_THESIS 浮動 textarea:維持頁面渲染態，命令進入 textarea 原生歷史。 */
  const pe = $('#pe-text');
  if (pe && peIndex >= 0 && document.activeElement === pe){
    if(!paperEditContextValid()){paperEditCloseStale();return false;}
    const raw = pe.value;
    if (inlineProtectedRaw(raw)){ inlineProtectedMessage(); return false; }
    const ps=pe.selectionStart,peEnd=pe.selectionEnd,result = transformer(raw, ps, peEnd);
    if (!result || !inlineAcceptTransaction(raw,result,ps,peEnd,options)){ pe.focus(); pe.setSelectionRange(result ? result.start : ps, result ? result.end : peEnd); return false; }
    if (!result.changed){ pe.focus(); pe.setSelectionRange(result.start,result.end); return false; }
    const d = inlineDiffWindow(raw, result.text);
    peReplaceRange(d.start, d.end, d.text);
    pe.focus(); pe.setSelectionRange(result.start, result.end);
    /* execCommand 的 input 事件在不同 Chromium/Safari 時序不一致；命令返回前強制
       將 textarea 值提交到 blocks，不能把持久化寄託在稍後才可能到達的事件。 */
    paperEditSyncFromTextarea();
    schedulePaperPageCaret();
    return true;
  }

  /* CP138：只要局部宿主仍開著，同區塊的任何 selection 都先投影到 canonical raw。
     不再以 anchorNode 是否在宿主內決定分流；正向／反向拖曳與跨宿主選取完全同路。 */
  if (mathEditEl && mathEditEl.isConnected){
    if(!mathEditInfo||!editContextValid(mathEditInfo,mathEditInfo.i)){clearStaleMathEdit();return false;}
    if (mathEditInfo.isMath){ inlineProtectedMessage(); return false; }
    const ctx=inlineLocalSessionContext(sel);
    if(ctx&&ctx.stale){clearStaleMathEdit();toast(TT('編輯內容已更新，請重新選取後再套用格式','The content changed; select the text again'));return false;}
    if(ctx&&ctx.crossBlock){toast(TT('請只選取同一段落內的文字','Select text within a single paragraph'));return false;}
    if(ctx){
      const result=transformer(ctx.currentRaw,ctx.s,ctx.e);
      if(!result||!inlineAcceptTransaction(ctx.currentRaw,result,ctx.s,ctx.e,options))return false;
      if(!result.changed)return false;
      return inlineCommitLocalSession(ctx,result);
    }
  }

  /* 表格逐格編輯:只處理目前儲存格文字，不改 Markdown 表格骨架。 */
  const cell = ancEl && ancEl.closest ? ancEl.closest('td[contenteditable="true"], th[contenteditable="true"]') : null;
  if (cell && editor.contains(cell)){
    const raw = getRawText(cell);
    const a = offsetInBlock(cell, sel.anchorNode, sel.anchorOffset);
    const f = sel.isCollapsed ? a : offsetInBlock(cell, sel.focusNode, sel.focusOffset);
    const cs=Math.min(a,f),ce=Math.max(a,f),result = transformer(raw, cs, ce);
    if(!result||!inlineAcceptTransaction(raw,result,cs,ce,options))return false;
    return inlineApplyHostResult(cell, result, { inputEvent:true });
  }

  if (!anc){ toast(TT('請先點入文字','Click in text first')); return false; }
  const el = blockElOf(anc);
  if (!el){ toast(TT('請先點入文字','Click in text first')); return false; }
  if (!sel.isCollapsed && blockElOf(sel.focusNode) !== el){ toast(TT('請只選取同一段落內的文字','Select text within a single paragraph')); return false; }
  const i = blockIndexOf(el);
  const isActive = activeIndex === i && el.classList.contains('active');
  const raw = isActive ? getRawText(el) : String(blocks[i] == null ? '' : blocks[i]);
  if (inlineProtectedRaw(raw)){ inlineProtectedMessage(); return false; }

  let s,e;
  if (isActive){
    const a = offsetInBlock(el, sel.anchorNode, sel.anchorOffset);
    const f = sel.isCollapsed ? a : offsetInBlock(el, sel.focusNode, sel.focusOffset);
    s = Math.min(a,f); e = Math.max(a,f);
  } else {
    const p = inlineRenderedOffsets(el, raw, sel);
    if (!p){ toast(TT('無法定位選取範圍','Could not locate the selection')); return false; }
    s = p.s; e = p.e;
  }
  const result = transformer(raw,s,e);
  if (!result || !inlineAcceptTransaction(raw,result,s,e,options)){
    if (isActive) setCaretRange(el, result ? result.start : s, result ? result.end : e);
    else inlineRestoreRenderedSelection(el, raw, result ? result.start : s, result ? result.end : e);
    return false;
  }
  if (!result.changed){
    if (isActive) setCaretRange(el,result.start,result.end);
    else inlineRestoreRenderedSelection(el,raw,result.start,result.end);
    return false;
  }

  pushUndo();
  blocks[i] = result.text;
  if (isActive){
    el.className = activeClassFor(result.text);
    el.textContent = result.text;
    setCaretRange(el, result.start, result.end);
  } else {
    /* 一般 Markdown 與 Paper/TW_THESIS 一律留在渲染態；不得短暫顯示整段 raw。 */
    suppressSel++;
    el.innerHTML = renderBlockHTML(result.text);
    requestAnimationFrame(() => suppressSel = Math.max(0, suppressSel - 1));
    inlineRestoreRenderedSelection(el, result.text, result.start, result.end);
  }
  if (peIndex === i && pe && paperEditContextValid()){
    pe.value = result.text;
    pe.setSelectionRange(result.start,result.end);
    autosizePe(); schedulePaperPageCaret();
  }
  onEdited(); updateBlockInfo();
  return true;
}
window.__CP137_INLINE_TRANSACTION__={audit:inlineTransactionAudit,forbidden:inlineForbiddenTagCount,entities:inlinePunctuationEntityCount};
window.__CP138_CANONICAL_INLINE__={session:inlineLocalSessionContext,syncPaper:()=>paperEditSyncFromTextarea(),get host(){return mathEditEl;}};
function wrapSelection(mark, endMark = mark){
  if (mark === '**' && endMark === '**') return cmdBold();
  if (mark === '*' && endMark === '*') return cmdItalic();
  if (mark === '`' && endMark === '`') return cmdCode();
  if (mark === '~~' && endMark === '~~') return cmdStrike();
  if (mark === '==' && endMark === '==') return cmdMark();
  if (mark === '<u>' && endMark === '</u>') return cmdUnderline();
  if (mark === '$' && endMark === '$') return cmdInlineMath();
  if (mark === '[' && endMark === '](url)') return cmdLink();
  return runInlineTransform((v,s,e) => {
    const inner=v.slice(s,e), text=v.slice(0,s)+mark+inner+endMark+v.slice(e);
    return {text,start:s+mark.length,end:s+mark.length+inner.length,changed:true};
  }, {kind:'generic'});
}
/* srcWrap 保留給圖片、區塊公式等既有插入入口；行內格式命令改走 runInlineTransform。 */
function srcReplaceRange(a, z, text){
  const v = srcview.value;
  const want = v.slice(0, a) + text + v.slice(z);
  try {
    srcview.focus();
    srcview.setSelectionRange(a, z);
    if (document.execCommand && document.execCommand('insertText', false, text) &&
        srcview.value === want) return true;
  } catch (_e) { }
  srcview.value = want;
  return false;
}
function peReplaceRange(a, z, text){
  const pe = $('#pe-text');
  if (!pe) return false;
  const v = pe.value;
  const A = Math.max(0, Math.min(v.length, Number.isFinite(a) ? a : 0));
  const Z = Math.max(A, Math.min(v.length, Number.isFinite(z) ? z : A));
  const want = v.slice(0, A) + text + v.slice(Z);
  try {
    pe.focus();
    pe.setSelectionRange(A, Z);
    if (document.execCommand && document.execCommand('insertText', false, text) && pe.value === want) return true;
  } catch (_e) { }
  pe.value = want;
  return false;
}
function srcWrap(m1, m2){
  let s = srcview.selectionStart, e = srcview.selectionEnd; const v = srcview.value;
  if (s === e){ const w = wordRangeAt(v, s, m1, m2); if (w){ s=w.s; e=w.e; } }
  const native = srcReplaceRange(s, e, m1 + v.slice(s,e) + m2);
  const innerLen=e-s;
  srcview.setSelectionRange(s+m1.length, s+m1.length+innerLen);
  if (!native) srcview.dispatchEvent(new Event('input', {bubbles:true}));
}
const cmdBold      = () => runInlineTransform((v,s,e)=>inlineFormatTransform(v,s,e,'bold'), {kind:'bold'});
const cmdItalic    = () => runInlineTransform((v,s,e)=>inlineFormatTransform(v,s,e,'italic'), {kind:'italic'});
const cmdCode      = () => runInlineTransform((v,s,e)=>inlineFormatTransform(v,s,e,'code'), {kind:'code'});
const cmdStrike    = () => runInlineTransform((v,s,e)=>inlineFormatTransform(v,s,e,'strike'), {kind:'strike'});
const cmdMark      = () => runInlineTransform((v,s,e)=>inlineFormatTransform(v,s,e,'mark'), {kind:'mark'});
const cmdUnderline = () => runInlineTransform((v,s,e)=>inlineFormatTransform(v,s,e,'underline'), {kind:'underline'});
const cmdInlineMath= () => runInlineTransform((v,s,e)=>genericWrapTransform(v,s,e,'math'), {kind:'math'});
const cmdLink      = () => runInlineTransform((v,s,e)=>genericWrapTransform(v,s,e,'link'), {kind:'link'});
function cmdImage(){ insertParagraphSyntax('![描述](圖片網址)'); }
function cmdClearFormat(){
  return runInlineTransform((v,s,e)=>clearInlineFormatting(v,s,e), {kind:'clear'});
}


/* 複製為 Markdown(⇧⌘C):輸出選取範圍的原始 Markdown */
function cmdCopyMD(){
  let text = '';
  const sel = getSelection();
  const multi = multiBlockSelection();
  if (multi){
    const sRaw = multi.si === activeIndex ? multi.so : visibleToRaw(blocks[multi.si], multi.so);
    const eRaw = multi.ei === activeIndex ? multi.eo : visibleToRaw(blocks[multi.ei], multi.eo);
    const mid = blocks.slice(multi.si + 1, multi.ei);
    text = [blocks[multi.si].slice(sRaw), ...mid, blocks[multi.ei].slice(0, eRaw)].join('\n');
  } else if (!sel.isCollapsed){
    const el = blockElOf(sel.anchorNode);
    if (el){
      const i = blockIndexOf(el);
      const a = offsetInBlock(el, sel.anchorNode, sel.anchorOffset);
      const b = offsetInBlock(el, sel.focusNode, sel.focusOffset);
      let s = Math.min(a, b), e = Math.max(a, b);
      if (i !== activeIndex){ s = visibleToRaw(blocks[i], s); e = visibleToRaw(blocks[i], e); }
      text = (i === activeIndex ? getRawText(el) : blocks[i]).slice(s, e);
    }
  } else {
    text = serialize();                       // 沒有選取:複製整份文件
  }
  if (!text){ toast('沒有可複製的內容'); return; }
  const done = () => toast(TT('已複製 Markdown（','Copied Markdown (') + text.length + TT(' 字元）',' chars)'));
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else fallbackCopy(text, done);
}
function fallbackCopy(text, done){
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch(_){ toast('複製失敗'); }
  ta.remove();
}

/* ============================================================
   CP55(T16)— 複製為 LaTeX / HTML(Word 可貼)
   使用既有 右鍵 copy-as 家族(main.formatted.js:copyAsTex /
   copyAsSemanticHTML / setClipboard 多 flavor)概念:
   - 數學式「直接取 $ 內源碼」(copyAsTex 剝定界思路,零轉譯零損);
   - Word 走 text/html flavor + text/plain(Markdown 源碼)雙軌;
   - 複製瞬間攔截 copy 事件自寫 clipboardData + preventDefault
     (setClipboard 同技),於 document 捕獲層攔截並 stopPropagation,
     故 CP47 的 editor copy 保真管線不會覆寫我們的 flavor;全程零
     焦點移動 → 不觸發 editor blur→deactivate(選取/編輯態保全)。
   轉換核心為純函式家族(ca* 前綴),行內掃描順序與 inlineMD 嚴格
   同序(跳脫→行內碼→$$→$→\(\)→反斜跳脫→註解→HTML 標籤→實體→
   註腳→圖→連結→粗斜→粗→斜→刪→標),方言零分歧;t16_test.js
   離線迴歸。
   已知取捨(v1):行內圖 → \includegraphics(alt 捨棄,figure 環境
   屬 v2);\sout / \hl 需 ulem / soul 套件;同 id 註腳多次引用會展開
   多個 \footnote;Word flavor 數學保留 $…$ 源碼字面(無 MathML
   引擎,寧可無損);程式圍欄 → verbatim(零套件依賴)。
   ============================================================ */
function caTexEsc(s){
  return String(s).replace(/[\\{}$&#%_^~]/g, ch => (
    ch === '\\' ? '\\textbackslash{}' :
    ch === '^'  ? '\\textasciicircum{}' :
    ch === '~'  ? '\\textasciitilde{}' : '\\' + ch));
}
function caTexUrl(s){
  return String(s).replace(/[%#]/g, ch => '\\' + ch);
}

function caHtmlImgSpec(tag){
  const q = String(tag == null ? '' : tag).trim();
  if (!/^<img\b[\s\S]*\/?>$/i.test(q)) return null;
  const attrs = Object.create(null), body = q.replace(/^<img\b/i, '').replace(/\/?>\s*$/, '');
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(body))) attrs[String(m[1] || '').toLowerCase()] = (m[2] ?? m[3] ?? m[4] ?? '')
    .replace(/&quot;/gi,'"').replace(/&apos;|&#39;/gi,"'").replace(/&amp;/gi,'&');
  if (!attrs.src) return null;
  const style = String(attrs.style || '');
  let z = style.match(/(?:^|;)\s*zoom\s*:\s*([0-9]*\.?[0-9]+)\s*(%)?/i);
  let scale = 1, explicit = false;
  if (z) { scale = z[2] ? parseFloat(z[1]) / 100 : parseFloat(z[1]); explicit = Number.isFinite(scale) && scale > 0; }
  if (!explicit) {
    z = style.match(/(?:^|;)\s*width\s*:\s*([0-9]*\.?[0-9]+)\s*%/i)
      || String(attrs.width || '').match(/^\s*([0-9]*\.?[0-9]+)\s*%\s*$/);
    if (z) { scale = parseFloat(z[1]) / 100; explicit = Number.isFinite(scale) && scale > 0; }
  }
  if (explicit) scale = Math.max(.05, Math.min(4, scale));
  return { alt:attrs.alt || '', url:attrs.src, title:attrs.title || '', wide:/\*\s*$/.test(attrs.title || ''), scale, scaleExplicit:explicit };
}
function caImgWidth(scale, base, explicit){
  if (!explicit || !Number.isFinite(scale) || Math.abs(scale - 1) < 1e-9) return base;
  return String(Math.round(Math.max(.05, Math.min(4, scale))*1000)/1000) + base;
}

function caEscHtml(s){
  return String(s).replace(/[&<>"']/g, ch => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}
function caSplitCells(line){
  let s = String(line).trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !/(^|[^\\])(\\\\)*\\\|$/.test(s)) s = s.slice(0, -1);
  const cells = []; let cur = '';
  for (let i = 0; i < s.length; i++){
    const c = s[i];
    if (c === '\\' && i + 1 < s.length){ cur += c + s[i + 1]; i++; }
    else if (c === '|'){ cells.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  cells.push(cur.trim());
  return cells;
}
function caCellAlign(cell){
  const c = String(cell).trim();
  if (/^:-+:$/.test(c)) return 'c';
  if (/^-+:$/.test(c))  return 'r';
  return 'l';
}
function caCollectFootnotes(md){
  const defs = {}, used = new Set();
  const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
  const rest = [];
  const RD = /^\[\^([A-Za-z0-9_.\-\u4e00-\u9fff]+)\]:\s?(.*)$/;
  lines.forEach(l => {
    const m = l.match(RD);
    if (m) defs[m[1]] = m[2];
    else rest.push(l);
  });
  /* 引用偵測前先剝除圍欄與行內碼:碼內字面 [^id] 不算引用(不消耗定義) */
  const body = rest.join('\n')
    .replace(/```[\s\S]*?(```|$)/g, '')
    .replace(/`[^`\n]*`/g, '');
  Object.keys(defs).forEach(id => {
    if (body.indexOf('[^' + id + ']') >= 0) used.add(id);
    defs[id] = caInlineToTex(defs[id], { defs: {}, used: new Set() });
  });
  return { defs, used };
}
function caInlineToTex(src, fx){
  const F = fx || { defs: {}, used: new Set() };
  const stash = [];
  const keep = t => '\uE000' + (stash.push(t) - 1) + '\uE001';
  let s = String(src).replace(/[\uE000\uE001]/g, '');
  s = s.replace(/\\`/g, () => keep('`'));
  s = s.replace(/\\\$/g, () => keep('\\$'));
  s = s.replace(/`([^`\n]+)`/g, (_, c) => keep('\\texttt{' + caTexEsc(c) + '}'));
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => keep('\\[ ' + tex.trim() + ' \\]'));
  s = s.replace(/\$(?=\S)([^$\n]+?)(?<=\S)\$/g, (_, tex) => keep('$' + tex + '$'));
  s = s.replace(/\\\((.+?)\\\)/g, (_, tex) => keep('\\(' + tex + '\\)'));
  s = s.replace(/\\([\\`*_{}\[\]#+\-.!~=<>|$])/g, (_, ch) => keep(caTexEsc(ch)));
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<br\s*\/?>/gi, () => keep('\\\\'));
  s = s.replace(/<img\b[^>]*\/?>/gi, tag => {
    const im = caHtmlImgSpec(tag);
    if (!im) return '';
    const w = im.scaleExplicit ? '[width=' + caImgWidth(im.scale, '\\linewidth', true) + ']' : '';
    return keep('\\includegraphics' + w + '{' + caTexUrl(im.url) + '}');
  });
  s = s.replace(/<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi,
    (_, q, d, sg, inner) => keep('\\href{' + caTexUrl(d != null ? d : sg) + '}{') + inner + keep('}'));
  s = s.replace(/<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, t, c) => keep('\\textbf{') + c + keep('}'));
  s = s.replace(/<(i|em)\b[^>]*>([\s\S]*?)<\/\1>/gi,     (_, t, c) => keep('\\textit{') + c + keep('}'));
  s = s.replace(/<(u)\b[^>]*>([\s\S]*?)<\/\1>/gi,        (_, t, c) => keep('\\underline{') + c + keep('}'));
  s = s.replace(/<(sub)\b[^>]*>([\s\S]*?)<\/\1>/gi,      (_, t, c) => keep('\\textsubscript{') + c + keep('}'));
  s = s.replace(/<(sup)\b[^>]*>([\s\S]*?)<\/\1>/gi,      (_, t, c) => keep('\\textsuperscript{') + c + keep('}'));
  s = s.replace(/<(del|s)\b[^>]*>([\s\S]*?)<\/\1>/gi,    (_, t, c) => keep('\\sout{') + c + keep('}'));
  s = s.replace(/<(mark)\b[^>]*>([\s\S]*?)<\/\1>/gi,     (_, t, c) => keep('\\hl{') + c + keep('}'));
  s = s.replace(/<\/?[a-zA-Z][^<>]*>/g, '');
  s = s.replace(/&nbsp;/gi, () => keep('~'));
  s = s.replace(/&(amp|lt|gt|quot|#39|apos);/gi, (_, e) => (
    { amp:'&', lt:'<', gt:'>', quot:'"', '#39':"'", apos:"'" }[e.toLowerCase()]));
  s = s.replace(/&#(\d{1,7});/g, (m, n) => (+n <= 0x10FFFF ? String.fromCodePoint(+n) : m));
  s = s.replace(/&#x([\da-fA-F]{1,6});/g, (m, h) => {
    const n = parseInt(h, 16); return n <= 0x10FFFF ? String.fromCodePoint(n) : m;
  });
  s = s.replace(/\[\^([A-Za-z0-9_.\-\u4e00-\u9fff]+)\]/g, (m, id) =>
    F.defs[id] != null ? (F.used.add(id), keep('\\footnote{' + F.defs[id] + '}'))
                       : keep(caTexEsc(m)));
  s = s.replace(/!\[([^\]]*)\]\(([^)]+?)(?:\s+"(.*?)")?\)/g,
    (_, alt, url) => keep('\\includegraphics{' + caTexUrl(url.trim()) + '}'));
  s = s.replace(/\[([^\]]+)\]\(([^)]+?)(?:\s+"(.*?)")?\)/g,
    (_, t, url) => keep('\\href{' + caTexUrl(url.trim()) + '}{') + t + keep('}'));
  s = s.replace(/(\*\*\*|___)(?=\S)([\s\S]*?\S)\1/g, (_, d, c) => keep('\\textbf{\\textit{') + c + keep('}}'));
  s = s.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g,   (_, d, c) => keep('\\textbf{') + c + keep('}'));
  s = s.replace(/(\*|_)(?=\S)([^*_\n]*?\S)\1/g,     (_, d, c) => keep('\\textit{') + c + keep('}'));
  s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g,          (_, c) => keep('\\sout{') + c + keep('}'));
  s = s.replace(/==(?=\S)([\s\S]*?\S)==/g,          (_, c) => keep('\\hl{') + c + keep('}'));
  s = caTexEsc(s);
  let out = s, guard = 0;
  while (/\uE000\d+\uE001/.test(out) && guard++ < 8)
    out = out.replace(/\uE000(\d+)\uE001/g, (_, i) => stash[+i] ?? '');
  return out;
}
/* ===== CP60:copy-as v2 — 整行單圖 → figure 環境 =====
   CP55 已知取捨補完:alt 非空的「整行只有一張圖」升級為
   \begin{figure}[htbp] + \centering + width=\linewidth + \caption{alt};
   alt 空 → 維持 v1 行內 \includegraphics(零行為變化);行內夾雜文字的圖、
   清單/引言內的圖亦維持 v1(float 不進行內與清單,LaTeX 語意使然)。
   caption 走 caInlineToTex(alt 可帶粗斜/跳脫,方言與行內層嚴格同源);
   caUsedPkgs 以 \includegraphics 子字串偵測 graphicx,帶 [width=…] 選項
   仍命中(CP58 契約不動)。Word HTML 側刻意不動(figure/figcaption 在
   Word 貼上支援度差,<img alt> 已保留資訊)。純函式 caImgOnly/caFigureTex
   行式抽取,t21 離線測。 */
function caImgOnly(line){
  const raw = String(line).trim();
  const hi = caHtmlImgSpec(raw);
  if (hi) return hi;
  const m = raw.match(/^!\[([^\]]*)\]\(([^)]+?)(?:\s+"(.*?)")?\)\s*$/);
  if (!m) return null;
  return { alt:m[1], url:m[2].trim(), title:m[3] || '', wide:/\*\s*$/.test(m[3] || ''), scale:1, scaleExplicit:false };
}
function caFigureTex(alt, url, fx, spec){
  const cap = caInlineToTex(alt, fx), o = spec || {};
  const star = o.wide ? '*' : '';
  const base = o.wide ? '\\textwidth' : '\\linewidth';
  const width = caImgWidth(o.scale, base, !!o.scaleExplicit);
  return ['\\begin{figure' + star + '}[htbp]',
          '\\centering',
          '\\includegraphics[width=' + width + ']{' + caTexUrl(url) + '}',
          '\\caption{' + cap + '}',
          '\\end{figure' + star + '}'].join('\n');
}
function caMdToTex(md, opt){
  const fx = caCollectFootnotes(md);
  const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const RF  = /^(```|~~~)\s*([\w-]*)\s*$/;
  const RT  = /^\s*\|.*\|\s*$/, RTS = /^\s*\|[\s:|-]+\|\s*$/;
  const RH  = /^(#{1,6})\s+(.*)$/, RHR = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
  const RQ  = /^>\s?(.*)$/;
  const RTK = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/;
  const RUL = /^(\s*)[-*+]\s+(.*)$/, ROL = /^(\s*)(\d+)\.\s+(.*)$/;
  const RD  = /^\[\^([A-Za-z0-9_.\-\u4e00-\u9fff]+)\]:\s?(.*)$/;
  const SEC = ['\\section','\\subsection','\\subsubsection','\\paragraph','\\subparagraph','\\subparagraph'];
  let i = 0;
  while (i < lines.length){
    let L = lines[i];
    if (/^\s*<!--\s*ekdeta-html-table\s*:/i.test(L)){ i++; continue; } // CP119:app 專屬版面 metadata 不輸出
    const niQuote = L.match(/^(>\s?)<!--\s*noindent\s*-->[ \t]*/i);
    const niMark = niQuote ? null : L.match(/^<!--\s*noindent\s*-->[ \t]*/i);
    const noIndent = !!(niQuote || niMark);
    if (niQuote) L = niQuote[1] + L.slice(niQuote[0].length);
    else if (niMark) L = L.slice(niMark[0].length);
    let m;
    if ((m = L.match(RF))){
      const lang = m[2] || '';
      const buf = []; i++;
      while (i < lines.length && !RF.test(lines[i])){ buf.push(lines[i]); i++; }
      if (i < lines.length) i++;
      if (opt && opt.listings){                                    // CP64:listings(語言標註,程式碼慣用)
        out.push(lang ? '\\begin{lstlisting}[language=' + lang + ']' : '\\begin{lstlisting}');
        buf.forEach(b => out.push(b));
        out.push('\\end{lstlisting}');
      } else {
        out.push('\\begin{verbatim}');
        buf.forEach(b => out.push(b));
        out.push('\\end{verbatim}');
      }
      continue;
    }
    if ((m = L.match(/^\s*\$\$(.*)$/))){
      const rest = m[1].trim();
      if (rest && /\$\$\s*$/.test(rest)){
        out.push('\\[ ' + rest.replace(/\$\$\s*$/, '').trim() + ' \\]'); i++; continue;
      }
      const buf = []; if (rest) buf.push(rest);
      i++;
      while (i < lines.length && !/\$\$\s*$/.test(lines[i])){ buf.push(lines[i]); i++; }
      if (i < lines.length){
        const tail = lines[i].replace(/\$\$\s*$/, '');
        if (tail.trim()) buf.push(tail);
        i++;
      }
      out.push('\\[');
      buf.forEach(b => out.push(b));
      out.push('\\]');
      continue;
    }
    if (/^\s*\\\[\s*$/.test(L)){
      const buf = []; i++;
      while (i < lines.length && !/^\s*\\\]\s*$/.test(lines[i])){ buf.push(lines[i]); i++; }
      if (i < lines.length) i++;
      out.push('\\[');
      buf.forEach(b => out.push(b));
      out.push('\\]');
      continue;
    }
    if (RT.test(L) && i + 1 < lines.length && RTS.test(lines[i + 1])){
      const head = caSplitCells(L);
      const spec = caSplitCells(lines[i + 1]).map(caCellAlign);
      i += 2;
      const rows = [];
      while (i < lines.length && RT.test(lines[i])){ rows.push(caSplitCells(lines[i])); i++; }
      const n = Math.max(head.length, spec.length);
      while (spec.length < n) spec.push('l');
      const row = cs => {
        const c = cs.slice(); while (c.length < n) c.push('');
        return c.slice(0, n).map(x => caInlineToTex(x, fx)).join(' & ') + ' \\\\';
      };
      if (opt && opt.booktabs){                                    // CP62:三線表(期刊慣例,無縱線)
        out.push('\\begin{tabular}{' + spec.join('') + '}');
        out.push('\\toprule');
        out.push(row(head));
        out.push('\\midrule');
        rows.forEach(r => out.push(row(r)));
        out.push('\\bottomrule');
      } else {
        out.push('\\begin{tabular}{|' + spec.join('|') + '|}');
        out.push('\\hline');
        out.push(row(head));
        out.push('\\hline');
        rows.forEach(r => out.push(row(r)));
        out.push('\\hline');
      }
      out.push('\\end{tabular}');
      continue;
    }
    if ((m = L.match(RD))){
      if (!fx.used.has(m[1]))
        out.push(caTexEsc('[^' + m[1] + ']: ') + caInlineToTex(m[2], fx));
      i++; continue;
    }
    if ((m = L.match(RH))){
      out.push(SEC[m[1].length - 1] + '{' + caInlineToTex(m[2], fx) + '}');
      i++; continue;
    }
    if (RHR.test(L)){ out.push('\\noindent\\rule{\\linewidth}{0.4pt}'); i++; continue; }
    if (noIndent && (m = L.match(RQ))){
      out.push('\\begin{quote}');
      out.push('\\noindent ' + caInlineToTex(m[1], fx));
      out.push('\\end{quote}');
      i++; continue;
    }
    if (RQ.test(L)){
      const buf = [];
      while (i < lines.length && (m = lines[i].match(RQ))){ buf.push(caInlineToTex(m[1], fx)); i++; }
      out.push('\\begin{quote}');
      buf.forEach(b => out.push(b));
      out.push('\\end{quote}');
      continue;
    }
    if (RTK.test(L) || RUL.test(L) || ROL.test(L)){
      const st = [];
      while (i < lines.length){
        let it = null, mm;
        if ((mm = lines[i].match(RTK)))      it = { ind: mm[1].length, env: 'itemize',   pre: mm[2] === ' ' ? '$\\square$ ' : '$\\blacksquare$ ', txt: mm[3] };
        else if ((mm = lines[i].match(RUL))) it = { ind: mm[1].length, env: 'itemize',   pre: '', txt: mm[2] };
        else if ((mm = lines[i].match(ROL))) it = { ind: mm[1].length, env: 'enumerate', pre: '', txt: mm[3] };
        if (!it) break;
        if (!st.length || it.ind > st[st.length - 1].ind){
          st.push({ ind: it.ind, env: it.env });
          out.push('\\begin{' + it.env + '}');
        } else {
          while (st.length > 1 && it.ind < st[st.length - 1].ind)
            out.push('\\end{' + st.pop().env + '}');
          if (st[st.length - 1].env !== it.env){
            out.push('\\end{' + st.pop().env + '}');
            st.push({ ind: it.ind, env: it.env });
            out.push('\\begin{' + it.env + '}');
          }
        }
        out.push('\\item ' + it.pre + caInlineToTex(it.txt, fx));
        i++;
      }
      while (st.length) out.push('\\end{' + st.pop().env + '}');
      continue;
    }
    if (L.trim() === ''){ out.push(''); i++; continue; }
    if ((m = caImgOnly(L)) && m.alt){ out.push(caFigureTex(m.alt, m.url, fx, m)); i++; continue; }   // CP60
    out.push((noIndent ? '\\noindent ' : '') + caInlineToTex(L, fx));
    i++;
  }
  return out.join('\n');
}
function caInlineToHtml(src){
  const stash = [];
  const keep = h => '\uE000' + (stash.push(h) - 1) + '\uE001';
  let s = String(src).replace(/[\uE000\uE001]/g, '');
  s = s.replace(/\\`/g, () => keep('`'));
  s = s.replace(/\\\$/g, () => keep('$'));
  s = s.replace(/`([^`\n]+)`/g, (_, c) =>
    keep('<code style="font-family:Consolas,\'Courier New\',monospace;background:#f2f2f2;padding:0 3px;">' + caEscHtml(c) + '</code>'));
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => keep(caEscHtml('$$' + tex + '$$')));
  s = s.replace(/\$(?=\S)([^$\n]+?)(?<=\S)\$/g, (_, tex) => keep(caEscHtml('$' + tex + '$')));
  s = s.replace(/\\\((.+?)\\\)/g, (_, tex) => keep(caEscHtml('\\(' + tex + '\\)')));
  s = s.replace(/\\([\\`*_{}\[\]#+\-.!~=<>|$])/g, (_, ch) => keep(caEscHtml(ch)));
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<\/?[a-zA-Z][^<>]*>/g, tag =>
    /^<\/?(b|strong|i|em|u|s|del|sub|sup|br|code|mark|span|a|img)\b/i.test(tag) ? keep(tag) : '');
  s = s.replace(/&(#\d{1,7}|#x[\da-fA-F]{1,6}|[a-zA-Z][\da-zA-Z]{1,31});/g, m => keep(m));
  s = caEscHtml(s);
  s = s.replace(/\[\^([A-Za-z0-9_.\-\u4e00-\u9fff]+)\]/g, (_, id) => '<sup>[' + id + ']</sup>');
  s = s.replace(/!\[([^\]]*)\]\(([^)]+?)(?:\s+&quot;(.*?)&quot;)?\)/g,
    (_, alt, url) => keep('<img src="' + url.trim() + '" alt="' + alt + '">'));
  s = s.replace(/\[([^\]]+)\]\(([^)]+?)(?:\s+&quot;(.*?)&quot;)?\)/g,
    (_, t, url) => keep('<a href="' + url.trim() + '">') + t + keep('</a>'));
  s = s.replace(/(\*\*\*|___)(?=\S)([\s\S]*?\S)\1/g, (_, d, c) => '<b><i>' + c + '</i></b>');
  s = s.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<b>$2</b>');
  s = s.replace(/(\*|_)(?=\S)([^*_\n]*?\S)\1/g, '<i>$2</i>');
  s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<s>$1</s>');
  s = s.replace(/==(?=\S)([\s\S]*?\S)==/g, '<span style="background:#ffff00;">$1</span>');
  let out = s, guard = 0;
  while (/\uE000\d+\uE001/.test(out) && guard++ < 8)
    out = out.replace(/\uE000(\d+)\uE001/g, (_, i) => stash[+i] ?? '');
  return out;
}
function caMdToHtml(md){
  const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const RF  = /^(```|~~~)\s*([\w-]*)\s*$/;
  const RT  = /^\s*\|.*\|\s*$/, RTS = /^\s*\|[\s:|-]+\|\s*$/;
  const RH  = /^(#{1,6})\s+(.*)$/, RHR = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
  const RQ  = /^>\s?(.*)$/;
  const RTK = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/;
  const RUL = /^(\s*)[-*+]\s+(.*)$/, ROL = /^(\s*)(\d+)\.\s+(.*)$/;
  const RD  = /^\[\^([A-Za-z0-9_.\-\u4e00-\u9fff]+)\]:\s?(.*)$/;
  const TD  = 'border:1px solid #444;padding:3px 8px;';
  const AL  = { l:'left', c:'center', r:'right' };
  let i = 0;
  while (i < lines.length){
    let L = lines[i];
    if (/^\s*<!--\s*ekdeta-html-table\s*:/i.test(L)){ i++; continue; } // CP119:app 專屬版面 metadata 不輸出
    const niQuote = L.match(/^(>\s?)<!--\s*noindent\s*-->[ \t]*/i);
    const niMark = niQuote ? null : L.match(/^<!--\s*noindent\s*-->[ \t]*/i);
    const noIndent = !!(niQuote || niMark);
    if (niQuote) L = niQuote[1] + L.slice(niQuote[0].length);
    else if (niMark) L = L.slice(niMark[0].length);
    let m;
    if (RF.test(L)){
      const buf = []; i++;
      while (i < lines.length && !RF.test(lines[i])){ buf.push(lines[i]); i++; }
      if (i < lines.length) i++;
      out.push('<pre style="font-family:Consolas,\'Courier New\',monospace;background:#f5f5f5;border:1px solid #ddd;padding:8px;">' +
               caEscHtml(buf.join('\n')) + '</pre>');
      continue;
    }
    if ((m = L.match(/^\s*\$\$(.*)$/))){
      const rest = m[1].trim();
      if (rest && /\$\$\s*$/.test(rest)){
        out.push('<p style="text-align:center;">' + caEscHtml(L.trim()) + '</p>'); i++; continue;
      }
      const buf = [L]; i++;
      while (i < lines.length && !/\$\$\s*$/.test(lines[i])){ buf.push(lines[i]); i++; }
      if (i < lines.length){ buf.push(lines[i]); i++; }
      out.push('<p style="text-align:center;">' + caEscHtml(buf.join('\n')).replace(/\n/g, '<br>') + '</p>');
      continue;
    }
    if (/^\s*\\\[\s*$/.test(L)){
      const buf = [L]; i++;
      while (i < lines.length && !/^\s*\\\]\s*$/.test(lines[i])){ buf.push(lines[i]); i++; }
      if (i < lines.length){ buf.push(lines[i]); i++; }
      out.push('<p style="text-align:center;">' + caEscHtml(buf.join('\n')).replace(/\n/g, '<br>') + '</p>');
      continue;
    }
    if (RT.test(L) && i + 1 < lines.length && RTS.test(lines[i + 1])){
      const head = caSplitCells(L);
      const spec = caSplitCells(lines[i + 1]).map(caCellAlign);
      i += 2;
      const rows = [];
      while (i < lines.length && RT.test(lines[i])){ rows.push(caSplitCells(lines[i])); i++; }
      const n = Math.max(head.length, spec.length);
      while (spec.length < n) spec.push('l');
      const cellRow = (cs, tag, extra) => {
        const c = cs.slice(); while (c.length < n) c.push('');
        return '<tr>' + c.slice(0, n).map((x, k) =>
          '<' + tag + ' style="' + TD + extra + 'text-align:' + AL[spec[k]] + ';">' +
          caInlineToHtml(x) + '</' + tag + '>').join('') + '</tr>';
      };
      out.push('<table style="border-collapse:collapse;border:1px solid #444;">');
      out.push(cellRow(head, 'th', 'background:#f0f0f0;'));
      rows.forEach(r => out.push(cellRow(r, 'td', '')));
      out.push('</table>');
      continue;
    }
    if ((m = L.match(RD))){
      out.push('<p><sup>[' + caEscHtml(m[1]) + ']</sup> ' + caInlineToHtml(m[2]) + '</p>');
      i++; continue;
    }
    if ((m = L.match(RH))){
      const lvl = m[1].length;
      out.push('<h' + lvl + '>' + caInlineToHtml(m[2]) + '</h' + lvl + '>');
      i++; continue;
    }
    if (RHR.test(L)){ out.push('<hr>'); i++; continue; }
    if (noIndent && (m = L.match(RQ))){
      out.push('<blockquote style="margin:4px 0 4px 8px;padding:2px 12px;border-left:3px solid #ccc;color:#555;text-indent:0;">' +
               caInlineToHtml(m[1]) + '</blockquote>');
      i++; continue;
    }
    if (RQ.test(L)){
      const buf = [];
      while (i < lines.length && (m = lines[i].match(RQ))){ buf.push(caInlineToHtml(m[1])); i++; }
      out.push('<blockquote style="margin:4px 0 4px 8px;padding:2px 12px;border-left:3px solid #ccc;color:#555;">' +
               buf.join('<br>') + '</blockquote>');
      continue;
    }
    if (RTK.test(L) || RUL.test(L) || ROL.test(L)){
      const st = [];
      const openEnv = (env, ind) => {
        out.push('<' + env + ' style="margin:4px 0 4px 24px;">');
        st.push({ ind, env, li: false });
      };
      const closeEnv = () => {
        const t = st.pop();
        if (t.li) out.push('</li>');
        out.push('</' + t.env + '>');
      };
      while (i < lines.length){
        let it = null, mm;
        if ((mm = lines[i].match(RTK)))      it = { ind: mm[1].length, env: 'ul', pre: mm[2] === ' ' ? '☐ ' : '☑ ', txt: mm[3] };
        else if ((mm = lines[i].match(RUL))) it = { ind: mm[1].length, env: 'ul', pre: '', txt: mm[2] };
        else if ((mm = lines[i].match(ROL))) it = { ind: mm[1].length, env: 'ol', pre: '', txt: mm[3] };
        if (!it) break;
        if (!st.length) openEnv(it.env, it.ind);
        else if (it.ind > st[st.length - 1].ind) openEnv(it.env, it.ind);
        else {
          while (st.length > 1 && it.ind < st[st.length - 1].ind) closeEnv();
          if (st[st.length - 1].env !== it.env){ closeEnv(); openEnv(it.env, it.ind); }
        }
        const top = st[st.length - 1];
        if (top.li) out.push('</li>');
        out.push('<li>' + it.pre + caInlineToHtml(it.txt));
        top.li = true;
        i++;
      }
      while (st.length) closeEnv();
      continue;
    }
    if (L.trim() === ''){ i++; continue; }
    out.push('<p' + (noIndent ? ' style="text-indent:0;"' : '') + '>' + caInlineToHtml(L) + '</p>');
    i++;
  }
  return out.join('\n');
}
/* --- DOM 膠合(非純函式區) --- */
/* 取「要轉換的 Markdown 源碼」:選取(跨塊/單塊)> 編輯中區塊 > 游標所在塊 > 整份文件。
   選取抽取邏輯與 cmdCopyMD 同族(multiBlockSelection / visibleToRaw / offsetInBlock);
   srcmode 直取 textarea 選取或全文。 */
function caSourceForCopy(){
  if (settings.srcmode){
    const s = srcview.selectionStart, e = srcview.selectionEnd;
    return s !== e ? srcview.value.slice(s, e) : srcview.value;
  }
  const sel = getSelection();
  const multi = multiBlockSelection();
  if (multi){
    const sRaw = multi.si === activeIndex ? multi.so : visibleToRaw(blocks[multi.si], multi.so);
    const eRaw = multi.ei === activeIndex ? multi.eo : visibleToRaw(blocks[multi.ei], multi.eo);
    const mid = blocks.slice(multi.si + 1, multi.ei);
    return [blocks[multi.si].slice(sRaw), ...mid, blocks[multi.ei].slice(0, eRaw)].join('\n');
  }
  if (sel.rangeCount && !sel.isCollapsed){
    const el = blockElOf(sel.anchorNode);
    if (el){
      const i = blockIndexOf(el);
      const a = offsetInBlock(el, sel.anchorNode, sel.anchorOffset);
      const b = offsetInBlock(el, sel.focusNode, sel.focusOffset);
      let s = Math.min(a, b), e = Math.max(a, b);
      if (i !== activeIndex){ s = visibleToRaw(blocks[i], s); e = visibleToRaw(blocks[i], e); }
      return (i === activeIndex ? getRawText(editor.children[i]) : blocks[i]).slice(s, e);
    }
  }
  if (activeIndex >= 0 && editor.children[activeIndex])
    return getRawText(editor.children[activeIndex]);
  if (sel.rangeCount){
    const el = blockElOf(sel.anchorNode);
    if (el){
      const i = blockIndexOf(el);
      if (i >= 0) return blocks[i];
    }
  }
  return serialize();
}
/* 多 flavor 剪貼簿寫入(Markdown setClipboard 思路):document 捕獲層攔 copy、
   setData 後 preventDefault+stopPropagation(避免 CP47 editor copy 管線覆寫),
   execCommand 觸發 — 零焦點移動。失敗退 navigator.clipboard(write 雙 flavor →
   writeText 純文字),回傳 Promise<true|'plain'|false>。 */
function caWriteClipboard(html, text){
  let ok = false;
  const onCopy = e => {
    try {
      e.clipboardData.setData('text/plain', text != null ? text : '');
      if (html != null) e.clipboardData.setData('text/html', html);
      e.preventDefault();
      e.stopPropagation();
      ok = true;
    } catch(_){}
  };
  document.addEventListener('copy', onCopy, true);
  try { document.execCommand('copy'); } catch(_){}
  document.removeEventListener('copy', onCopy, true);
  if (ok) return Promise.resolve(true);
  if (navigator.clipboard){
    if (html != null && window.ClipboardItem){
      try {
        return navigator.clipboard.write([new ClipboardItem({
          'text/html':  new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text != null ? text : ''], { type: 'text/plain' }),
        })]).then(() => true).catch(() =>
          navigator.clipboard.writeText(text != null ? text : '').then(() => 'plain').catch(() => false));
      } catch(_){}
    }
    return navigator.clipboard.writeText(text != null ? text : '').then(() => 'plain').catch(() => false);
  }
  return Promise.resolve(false);
}
function cmdCopyTex(){
  const md = caSourceForCopy();
  if (!md || !md.trim()){ toast(TT('沒有可複製的內容','Nothing to copy')); return; }
  const tex = caMdToTex(md, { booktabs: !!settings.texBooktabs, listings: !!settings.texListings });
  caWriteClipboard(null, tex).then(r => {
    if (r) toast(TT('已複製 LaTeX（','Copied LaTeX (') + tex.length + TT(' 字元）',' chars)'));
    else toast(TT('複製失敗','Copy failed'));
  });
}
function cmdCopyWordHtml(){
  const md = caSourceForCopy();
  if (!md || !md.trim()){ toast(TT('沒有可複製的內容','Nothing to copy')); return; }
  const html = caMdToHtml(md);
  caWriteClipboard(html, md).then(r => {
    if (r === 'plain') toast(TT('環境限制：僅複製了純文字','Environment limited: plain text only'));
    else if (r) toast(TT('已複製 HTML（Word 可貼）','Copied as HTML (Word-ready)'));
    else toast(TT('複製失敗','Copy failed'));
  });
}

/* ---------- 指令:段落層級 ---------- */
function transformBlock(fn){
  if (settings.srcmode) return toast('請先離開原始碼模式');
  /* CP115:論文模式保持 editor 渲染態，段落命令直接改浮動 textarea。 */
  const pe = $('#pe-text');
  if (pe && peIndex >= 0 && document.activeElement === pe){
    const cur = pe.value;
    const next = fn(cur);
    if (next === cur) return;
    const native = peReplaceRange(0, cur.length, next);
    pe.setSelectionRange(next.length, next.length);
    if (!native) livePaperEdit();
    return;
  }
  let i = activeIndex;
  /* CP152:model first。局部內容宿主可能含尚未提交的字；段落命令必須先提交，
     不能 activate() 破壞宿主後再從畫面猜回 Markdown。 */
  if (mathEditEl && mathEditInfo){ i = mathEditInfo.i; commitMathEdit(); }
  if (i < 0){
    const el0 = blockElOf(getSelection().anchorNode);
    if (!el0) return toast('請先點入段落');
    i = blockIndexOf(el0);
  }
  const el = editor.children[i];
  if (!el) return;
  if (activeIndex === i && el.classList.contains('active')) blocks[i] = getRawText(el);
  const cur = blocks[i] ?? '';
  const next = fn(cur);
  if (next === cur) return;
  pushUndo();
  blocks[i] = next;
  let part = structuredBlockParts(next);
  if (part){
    if(part.isList){const b=structuredNormalizeOrderedRegion(i);structuredRerenderBounds(b);part=structuredBlockParts(blocks[i]??'')||part;}
    activeIndex = -1;
    el.className = 'block';
    el.innerHTML = renderBlockHTML(blocks[i]);
    onEdited(); updateBlockInfo(); schedulePaginate();
    if (!openStructuredEdit(i, blocks[i].length, true)) activate(i, blocks[i].length);
    return;
  }
  activeIndex = i;
  el.textContent = next;
  el.className = activeClassFor(next);
  setCaret(el, next.length);
  onEdited();
}
const stripPrefix = s => noIndentParts(s).body.replace(/^(#{1,6}\s+|>\s?|\s*[-*+]\s+(\[[ xX]\]\s+)?|\s*\d+\.\s+)/, '');
const cmdHeading = n => () => transformBlock(s => {
  const body = stripPrefix(s);
  return n === 0 ? body : '#'.repeat(n) + ' ' + body;
});
const cmdQuote = () => transformBlock(s => /^>\s?/.test(s) ? s.replace(/^>\s?/,'') : '> ' + stripPrefix(s));
const cmdUL    = () => transformBlock(s => /^\s*[-*+]\s/.test(s) ? stripPrefix(s) : '- ' + stripPrefix(s));
const cmdOL    = () => transformBlock(s => /^\s*\d+\.\s/.test(s) ? stripPrefix(s) : '1. ' + stripPrefix(s));
const cmdTask  = () => transformBlock(s => RE.task.test(s) ? stripPrefix(s) : '- [ ] ' + stripPrefix(s));
function insertParagraphSyntax(text){
  if (settings.srcmode){ srcWrap(text, ''); return; }
  let i = activeIndex;
  if (i < 0){
    const el = blockElOf(getSelection().anchorNode);
    i = el ? blockIndexOf(el) : blocks.length - 1;
  }
  pushUndo();
  deactivate(true);
  insertBlockAfter(i, text);
  activate(i + 1, text.length);
  onEdited();
}
const cmdHR    = () => insertParagraphSyntax('---');
/* 表格:Markdown 式「幾列 × 幾欄」格線選擇器(⌥⌘T / 段落選單) */
const cmdTable = () => showGridPicker();
function captureTableInsertBookmark(){
  if (settings.srcmode) return { kind:'source', s:srcview.selectionStart, e:srcview.selectionEnd };
  const pe = $('#pe-text');
  if (pe && peIndex >= 0 && document.activeElement === pe) return { kind:'paper', i:peIndex };
  if (tableEdit) return { kind:'block', i:tableEdit.i };
  let i = activeIndex;
  if (i < 0){
    const sel = getSelection(), el = sel && sel.rangeCount ? blockElOf(sel.anchorNode) : null;
    if (el) i = blockIndexOf(el);
  }
  if (i < 0) i = Math.max(0, blocks.length - 1);
  return { kind:'block', i };
}
function showGridPicker(){
  const gp = $('#grid-picker');
  const cells = gp.querySelector('.gp-cells'), label = gp.querySelector('.gp-label');
  const ROWS = 6, COLS = 8;
  gp._bookmark = captureTableInsertBookmark();
  if (!cells.children.length){
    for (let r = 1; r <= ROWS; r++) for (let c = 1; c <= COLS; c++){
      const d = document.createElement('div');
      d.className = 'gp-c'; d.dataset.r = r; d.dataset.c = c;
      cells.appendChild(d);
    }
    let cur = { r:3, c:3 };
    const paint = () => {
      [...cells.children].forEach(d => d.classList.toggle('on', +d.dataset.r <= cur.r && +d.dataset.c <= cur.c));
      label.textContent = cur.r + ' 列 × ' + cur.c + ' 欄';
    };
    cells.addEventListener('mousedown', e => { if (e.target.closest('.gp-c')){ e.preventDefault(); e.stopPropagation(); } });
    cells.addEventListener('mousemove', e => {
      const d = e.target.closest('.gp-c');
      if (d){ cur = {r:+d.dataset.r,c:+d.dataset.c}; paint(); }
    });
    cells.addEventListener('click', e => {
      const d = e.target.closest('.gp-c'); if (!d) return;
      const bookmark = gp._bookmark;
      hideGridPicker(); insertTableOfSize(+d.dataset.r,+d.dataset.c,bookmark);
    });
    gp._paint = paint;
  }
  gp._paint(); gp.classList.remove('gp-hidden');
  let x = innerWidth/2-95, y = innerHeight/2-110;
  const sel = getSelection();
  if (sel.rangeCount){ const r=sel.getRangeAt(0).getBoundingClientRect(); if (r && (r.left||r.top)){x=r.left;y=r.bottom+8;} }
  gp.style.left=Math.max(8,Math.min(x,innerWidth-200))+'px';
  gp.style.top=Math.max(8,Math.min(y,innerHeight-220))+'px';
  setTimeout(()=>document.addEventListener('mousedown',gpAway,{once:true,capture:true}),0);
}
function gpAway(e){
  if (!e.target.closest || !e.target.closest('#grid-picker')) hideGridPicker();
  else setTimeout(()=>document.addEventListener('mousedown',gpAway,{once:true,capture:true}),0);
}
function hideGridPicker(){ $('#grid-picker').classList.add('gp-hidden'); }
function insertTableOfSize(rows, cols, bookmark){
  rows=Math.max(1,Math.min(30,Number(rows)||1)); cols=Math.max(1,Math.min(30,Number(cols)||1));
  const header='| '+Array.from({length:cols},(_,i)=>'欄位'+(i+1)).join(' | ')+' |';
  const aline='| '+Array(cols).fill('---').join(' | ')+' |';
  const body=Array(Math.max(0,rows-1)).fill('| '+Array(cols).fill('').join(' | ')+' |');
  const raw=[header,aline,...body].join('\n');
  bookmark=bookmark||captureTableInsertBookmark();
  if (bookmark.kind==='source' && settings.srcmode){
    const v=srcview.value, s=clamp(bookmark.s,0,v.length), e=clamp(bookmark.e,s,v.length);
    const pre=s>0 && v[s-1]!=='\n'?'\n':'', post=e<v.length && v[e]!=='\n'?'\n':'';
    const native=srcReplaceRange(s,e,pre+raw+post);
    const a=s+pre.length+2; srcview.setSelectionRange(a,a+'欄位1'.length); srcview.focus();
    if (!native) srcview.dispatchEvent(new Event('input',{bubbles:true}));
    return;
  }
  let i=Number.isFinite(bookmark.i)?bookmark.i:Math.max(0,blocks.length-1);
  if (bookmark.kind==='paper' && peIndex>=0) finishPaperEdit(true);
  commitMathEdit(); exitTableEdit(); deactivate(true);
  i=Math.max(0,Math.min(i,blocks.length-1));
  pushUndo(); insertBlockAfter(i,raw); onEdited();
  enterTableEdit(i+1,{r:0,c:0},true);
}
const cmdCodeBlock = () => insertParagraphSyntax('```\n\n```');
function cmdMathBlock(){
  if (settings.srcmode){ srcWrap('$$\n', '\n$$'); return; }
  let i = activeIndex;
  if (i < 0){
    const el = blockElOf(getSelection().anchorNode);
    i = el ? blockIndexOf(el) : blocks.length - 1;
  }
  pushUndo();
  deactivate(true);
  insertBlockAfter(i, '$$\n\n$$');
  activate(i + 1, 3);
  onEdited();
}

/* CP92:取消／恢復單一一般段落或引言內文的首行縮排。
   同一命令涵蓋 source textarea、Paper 浮動框、一般 active/raw 與渲染態；
   Markdown 只增刪隱藏標記，不把 CSS style 寫進使用者內容。 */
function noIndentShiftOffset(off, before, after){
  const a = noIndentParts(before), b = noIndentParts(after);
  return noIndentBodyToRaw(b, noIndentRawToBody(a, off));
}
function noIndentNotify(raw){ toast(noIndentParts(raw).on ? '已取消首行縮排' : '已恢復首行縮排'); }
function cmdNoIndent(){
  if (settings.srcmode){
    const v = srcview.value;
    const pos = srcview.selectionStart;
    const a = v.lastIndexOf('\n', Math.max(0, pos - 1)) + 1;
    const z0 = v.indexOf('\n', pos);
    const z = z0 < 0 ? v.length : z0;
    const raw = v.slice(a, z);
    if (!noIndentable(raw)){ toast('此指令只適用一般段落或引言文字'); return; }
    const next = noIndentToggleRaw(raw);
    const ss = noIndentShiftOffset(srcview.selectionStart - a, raw, next);
    const ee = noIndentShiftOffset(srcview.selectionEnd - a, raw, next);
    const native = srcReplaceRange(a, z, next);              // CP105:原生可復原置換
    srcview.setSelectionRange(a + ss, a + ee);
    if (!native) srcview.dispatchEvent(new Event('input', { bubbles:true }));
    noIndentNotify(next);
    return;
  }
  const pe = $('#pe-text');
  if (peIndex >= 0 && document.activeElement === pe){
    const raw = pe.value;
    if (!noIndentable(raw)){ toast('此指令只適用一般段落或引言文字'); return; }
    const next = noIndentToggleRaw(raw);
    const ss = noIndentShiftOffset(pe.selectionStart, raw, next);
    const ee = noIndentShiftOffset(pe.selectionEnd, raw, next);
    const native = peReplaceRange(0, raw.length, next);
    pe.setSelectionRange(ss, ee);
    if (!native) livePaperEdit();
    noIndentNotify(next);
    return;
  }
  if (tableEdit){ toast('此指令只適用一般段落或引言文字'); return; }
  let i = activeIndex;
  if (mathEditEl && mathEditInfo){ i = mathEditInfo.i; commitMathEdit(); }
  if (i < 0){
    const sel = getSelection();
    const el0 = sel && sel.anchorNode ? blockElOf(sel.anchorNode) : null;
    if (el0) i = blockIndexOf(el0);
  }
  if (i < 0 || i >= blocks.length){ toast('請先點入段落'); return; }
  const el = editor.children[i];
  const active = i === activeIndex && el && el.classList.contains('active');
  const raw = active ? getRawText(el) : (blocks[i] ?? '');
  if (!noIndentable(raw)){ toast('此指令只適用一般段落或引言文字'); return; }
  const next = noIndentToggleRaw(raw);
  const off = active ? caretOffsetIn(el) : null;
  let vis = null;
  if (!active){
    const sel = getSelection();
    if (sel && sel.rangeCount && el && el.contains(sel.anchorNode))
      vis = offsetInBlock(el, sel.anchorNode, sel.anchorOffset);
  }
  pushUndo();
  blocks[i] = next;
  suppressSel++;
  if (active){
    el.textContent = next;
    el.className = activeClassFor(next);
    setCaret(el, noIndentShiftOffset(off, raw, next));
  } else if (el){
    el.innerHTML = renderBlockHTML(next);
    if (vis != null) setCaret(el, vis);
  }
  requestAnimationFrame(()=> suppressSel = Math.max(0, suppressSel - 1));
  onEdited(); updateBlockInfo(); schedulePaginate();
  noIndentNotify(next);
}

/* 標題升降級(⌘= / ⌘-):段落 ↔ H6 ↔ … ↔ H1 形成可逆階梯 */
const cmdHeadingUp = () => transformBlock(s => {
  const body = noIndentParts(s).body;
  const m = body.match(/^(#{1,6})\s+(.*)$/);
  if (m) return m[1].length > 1 ? '#'.repeat(m[1].length - 1) + ' ' + m[2] : body;
  if (blockType(body) === 'p' || blockType(body) === 'empty') return '###### ' + body;
  return body;
});
const cmdHeadingDown = () => transformBlock(s => {
  const body = noIndentParts(s).body;
  const m = body.match(/^(#{1,6})\s+(.*)$/);
  if (m) return m[1].length < 6 ? '#'.repeat(m[1].length + 1) + ' ' + m[2] : m[2];
  return body;
});
const cmdIndent   = () => { if (!applyListIndent(false)) toast('此指令只適用清單'); };
const cmdOutdent  = () => { if (!applyListIndent(true))  toast('此清單已在最外層，或目前不是清單'); };

/* ---------- §8 Command Registry 與快捷鍵(規格 §4.3、§30) ---------- */
/* 每個指令有穩定 ID;選單、快捷鍵、快捷鍵一覽視窗共用同一張表。
   sig 格式:[M meta][C ctrl(限 mac)][A alt][S shift] + '-' + e.code。
   Windows/Linux 的 Ctrl 視為 meta(effMeta),因此 Ctrl+B 等同 ⌘B。 */
const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform || '');

const COMMANDS = [
  /* 格式 */
  { id:'format.bold',       group:'格式', label:'粗體',        mac:'⌘B',   sigs:['M-KeyB'],                 run:()=>cmdBold() },
  { id:'format.italic',     group:'格式', label:'斜體',        mac:'⌘I',   sigs:['M-KeyI'],                 run:()=>cmdItalic() },
  { id:'format.underline',  group:'格式', label:'底線',        mac:'⌘U',   sigs:['M-KeyU'],                 run:()=>cmdUnderline() },
  { id:'format.code',       group:'格式', label:'行內程式碼',  mac:'⌘E / ⇧⌘`', sigs:['M-KeyE','MS-Backquote'], run:()=>cmdCode() },
  { id:'format.strike',     group:'格式', label:'刪除線',      mac:'⇧⌘X / ⌃⇧` / Alt+Shift+5（Win/Linux）', sigs:['MS-KeyX','CS-Backquote','AS-Digit5'], run:()=>cmdStrike() },
  { id:'format.mark',       group:'格式', label:'螢光標記',    mac:'⇧⌘H', sigs:['MS-KeyH'],                run:()=>cmdMark() },
  { id:'format.math',       group:'格式', label:'行內公式 $…$', mac:'⌃⌘M', sigs:['MC-KeyM'],               run:()=>cmdInlineMath() },
  { id:'format.link',       group:'格式', label:'超連結',      mac:'⌘K',   sigs:['M-KeyK'],                 run:()=>cmdLink() },
  { id:'format.image',      group:'格式', label:'圖片',        mac:'⌃⌘I', sigs:['MC-KeyI'],                run:()=>cmdImage() },
  { id:'format.clear',      group:'格式', label:'清除格式',    mac:'⌘\\',  sigs:['M-Backslash'],            run:()=>cmdClearFormat() },
  /* 段落 */
  { id:'para.h1', group:'段落', label:'標題 1–6', mac:'⌘1–⌘6', sigs:['M-Digit1'], run:()=>cmdHeading(1)() },
  { id:'para.h2', hide:true, sigs:['M-Digit2'], run:()=>cmdHeading(2)() },
  { id:'para.h3', hide:true, sigs:['M-Digit3'], run:()=>cmdHeading(3)() },
  { id:'para.h4', hide:true, sigs:['M-Digit4'], run:()=>cmdHeading(4)() },
  { id:'para.h5', hide:true, sigs:['M-Digit5'], run:()=>cmdHeading(5)() },
  { id:'para.h6', hide:true, sigs:['M-Digit6'], run:()=>cmdHeading(6)() },
  { id:'para.p',  group:'段落', label:'一般段落', mac:'⌘0', sigs:['M-Digit0'], run:()=>cmdHeading(0)() },
  { id:'para.noindent', group:'段落', label:'切換首行縮排', mac:'⌥⌘0 / Ctrl+Alt+0', sigs:['MA-Digit0'], run:()=>cmdNoIndent() },
  { id:'para.hUp',   group:'段落', label:'提升標題級別', mac:'⌘=', sigs:['M-Equal','MS-Equal'],  run:()=>cmdHeadingUp() },
  { id:'para.hDown', group:'段落', label:'降低標題級別', mac:'⌘-', sigs:['M-Minus','MS-Minus'],  run:()=>cmdHeadingDown() },
  { id:'para.quote', group:'段落', label:'引言',     mac:'⌥⌘Q / ⇧⌘Q', sigs:['MA-KeyQ','MS-KeyQ'],      run:()=>cmdQuote() },
  { id:'para.ul',    group:'段落', label:'無序清單', mac:'⌥⌘U / ⇧⌘]', sigs:['MA-KeyU','MS-BracketRight'], run:()=>cmdUL() },
  { id:'para.ol',    group:'段落', label:'有序清單', mac:'⌥⌘O / ⇧⌘[', sigs:['MA-KeyO','MS-BracketLeft'],  run:()=>cmdOL() },
  { id:'para.task',  group:'段落', label:'任務清單', mac:'⌥⌘X', sigs:['MA-KeyX'],                run:()=>cmdTask() },
  { id:'para.codeblock', group:'段落', label:'程式碼區塊', mac:'⌥⌘C / ⇧⌘K', sigs:['MA-KeyC','MS-KeyK'], run:()=>cmdCodeBlock() },
  { id:'para.mathblock', group:'段落', label:'數學區塊',   mac:'⌥⌘B / ⇧⌘M', sigs:['MA-KeyB','MS-KeyM'], run:()=>cmdMathBlock() },
  { id:'para.table',     group:'段落', label:'表格',       mac:'⌥⌘T', sigs:['MA-KeyT'],           run:()=>cmdTable() },
  { id:'para.indent',    group:'段落', label:'增加縮排（清單）', mac:'⌘] / Tab',  sigs:['M-BracketRight'], run:()=>cmdIndent() },
  { id:'para.outdent',   group:'段落', label:'減少縮排（清單）', mac:'⌘[ / ⇧Tab', sigs:['M-BracketLeft'],  run:()=>cmdOutdent() },
  /* 編輯 */
  { id:'edit.undo', group:'編輯', label:'復原', mac:'⌘Z',  sigs:['M-KeyZ'],  run:()=>cmdUndo() },
  { id:'edit.redo', group:'編輯', label:'重做', mac:'⇧⌘Z', sigs:['MS-KeyZ'], run:()=>cmdRedo() },
  { id:'edit.copyMD', group:'編輯', label:'複製為 Markdown', mac:'⇧⌘C', sigs:['MS-KeyC'], run:()=>cmdCopyMD() },
  { id:'edit.selectWord', group:'編輯', label:'選取單字', mac:'⌘D',  sigs:['M-KeyD'],  run:()=>cmdSelectWord() },
  { id:'edit.deleteWord', group:'編輯', label:'刪除單字', mac:'⇧⌘D', sigs:['MS-KeyD'], run:()=>cmdDeleteWord() },
  { id:'edit.selectRow',  group:'編輯', label:'選取表格列', mac:'⌘L', sigs:['M-KeyL'], run:()=>cmdSelectRow() },
  { id:'edit.jumpToSel',  group:'編輯', label:'跳至選取', mac:'⌘J', sigs:['M-KeyJ'], run:()=>cmdJumpToSelection() },   /* CP104:官方 §30.2 */
  { id:'edit.find',    group:'編輯', label:'尋找',       mac:'⌘F',  sigs:['M-KeyF'],  run:()=>openFind(false) },
  { id:'edit.replace', group:'編輯', label:'尋找並取代', mac:'⌥⌘F / Ctrl+H（Win/Linux）', sigs:['MA-KeyF','M-KeyH'], run:()=>openFind(true) },   /* CP104:官方 Ctrl+H;mac ⌘H 被 OS 隱藏視窗吃掉,故僅實質惠及 Win/Linux */
  { id:'edit.pastePlain', group:'編輯', label:'貼上為純文字', mac:'⇧⌘V', sigs:['MS-KeyV'], run:()=>ctxPaste() },   /* CP74:readText 只給純文字=繞過智慧轉換 */
  { id:'app.prefs',      group:'檔案', label:'偏好設定',     mac:'⌘,',   sigs:['M-Comma'],  run:()=>showPrefs() },
  { id:'view.outline',   group:'檢視', label:'側欄:大綱',    mac:'⌘⌃1 / Ctrl+Shift+1（Win/Linux）',  sigs:['MC-Digit1','MS-Digit1'], run:()=>{ if (!settings.sidebar) cmdSidebar(); switchTab('outline'); } },
  { id:'view.filetree',  group:'檢視', label:'側欄:檔案',    mac:'⌘⌃3 / Ctrl+Shift+3（Win/Linux）',  sigs:['MC-Digit3','MS-Digit3'], run:()=>{ if (!settings.sidebar) cmdSidebar(); switchTab('files'); } },
  { id:'edit.findNext', group:'編輯', label:'下一個結果', mac:'⌘G / F3 / Enter',  sigs:['M-KeyG','-F3'],  run:()=>{ if (findOpen()) gotoHit(1); else openFind(false); } },
  { id:'edit.findPrev', group:'編輯', label:'上一個結果', mac:'⇧⌘G / ⇧F3 / ⇧Enter', sigs:['MS-KeyG','S-F3'], run:()=>{ if (findOpen()) gotoHit(-1); } },
  { id:'edit.findFiles', group:'編輯', label:'在所有檔案中尋找', mac:'⇧⌘F', sigs:['MS-KeyF'], run:()=>openGlobalSearch() },
  { id:'file.quickOpen', group:'檔案', label:'快速開檔', mac:'⌘P / ⇧⌘O', sigs:['M-KeyP','MS-KeyO'], run:()=>qoOpen() },   /* CP104:補官方 macOS ⇧⌘O */
  /* 檔案 / 檢視 */
  { id:'file.save',    group:'檔案與檢視', label:'儲存',       mac:'⌘S',  sigs:['M-KeyS'],  run:()=>saveNow(true) },
  { id:'file.saveAsMD', group:'檔案與檢視', label:'另存 Markdown 副本', mac:'⇧⌘S', sigs:['MS-KeyS'], run:()=>exportMD() },   /* CP104:官方另存/Duplicate 的瀏覽器語境等價=下載 .md 副本 */
  { id:'view.source',  group:'檔案與檢視', label:'原始碼模式', mac:'⌘/',  sigs:['M-Slash'], run:()=>cmdSrcMode() },
  { id:'view.sidebar', group:'檔案與檢視', label:'側邊欄',     mac:'⇧⌘L', sigs:['MS-KeyL'], run:()=>cmdSidebar() },
  { id:'view.focus',      group:'檔案與檢視', label:'焦點模式',   mac:'F8', sigs:['-F8'], run:()=>cmdFocusMode() },
  { id:'view.typewriter', group:'檔案與檢視', label:'打字機模式', mac:'F9', sigs:['-F9'], run:()=>cmdTypewriter() },
];
const CMD = Object.fromEntries(COMMANDS.map(c => [c.id, c]));
const KEYMAP = {};
COMMANDS.forEach(c => (c.sigs || []).forEach(sig => {
  if (isMac && sig === 'AS-Digit5') return;    // Windows 專用綁定:mac 上讓給 Option 組字
  KEYMAP[sig] = c;
}));

function eventSig(e){
  const effMeta = e.metaKey || (!isMac && e.ctrlKey);
  const ctrl = isMac && e.ctrlKey && !e.metaKey;
  return (effMeta ? 'M' : '') + (ctrl ? 'C' : '') + (e.altKey ? 'A' : '') +
         (e.shiftKey ? 'S' : '') + '-' + e.code;
}
function handleShortcut(e){
  if (!e.metaKey && !e.ctrlKey && !e.altKey && !/^F\d+$/.test(e.key)) return false;
  const cmd = KEYMAP[eventSig(e)];
  if (!cmd) return false;
  e.preventDefault();
  cmd.run();
  return true;
}

/* document 層統一攔截(編輯器、側邊欄、渲染區皆可用) */
document.addEventListener('keydown', e => {
  if (composing || e.keyCode === 229) return;
  const t = e.target;
  if (t && t.closest && t.closest('#findbar')) return;         // 尋找列有自己的處理
  if (settings.srcmode) return;                                // 原始碼模式:交給 srcview 自身
  if ($('#modal-overlay').classList.contains('show')) return;
  handleShortcut(e);
});

/* ---------- §8b 尋找 / 取代(⌘F,規格 §14.1–14.2) ---------- */
const findState = { q:'', cs:false, ww:false, rx:false, hits:[], last:{ i:-1, start:-1 }, timer:null };
const findOpen = () => document.body.classList.contains('findopen');
const escReg = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ---------- CP73:尋找選項記憶 ----------
   cs/ww/rx 三鈕狀態收進 settings.findOpts 持久化(開關本身不入 undo)。
   fbOptsNorm:任意存檔值 → {cs,ww,rx} 三布林。嚴格 ===true(字串 'false'、數字 1 等髒值一律 false),
   只回三鍵 — 外部備份/資料夾 JSON 的髒 findOpts 在此淨化。純函式,供測試抽取。 */
function fbOptsNorm(raw){
  const o = (raw && typeof raw === 'object') ? raw : {};
  return { cs: o.cs === true, ww: o.ww === true, rx: o.rx === true };
}
/* 依 settings.findOpts 回填 findState 與三鈕 on 態(init / loadFromFolder / importBackup 三掛點共用)。
   兩個載入路徑都在 switchFile 之前呼叫 → switchFile 尾端既有 findOpen()→doSearch()(CP67)自然以新選項重算。 */
function fbOptsApply(){
  const fo = fbOptsNorm(settings.findOpts);
  settings.findOpts = fo;
  findState.cs = fo.cs; findState.ww = fo.ww; findState.rx = fo.rx;
  $('#fb-case').classList.toggle('on', fo.cs);
  $('#fb-word').classList.toggle('on', fo.ww);
  $('#fb-rx').classList.toggle('on', fo.rx);
}

function openFind(withReplace){
  if (settings.srcmode){ toast('原始碼模式請使用瀏覽器內建搜尋'); return; }
  const sel = getSelection();
  if (sel && !sel.isCollapsed){
    const t = sel.toString();
    if (t && !t.includes('\n') && t.length < 120) $('#fb-input').value = t;
  }
  document.body.classList.add('findopen');
  document.body.classList.toggle('findrep', !!withReplace);
  if (activeIndex >= 0)
    findState.last = { i: activeIndex, start: caretOffsetIn(editor.children[activeIndex]) - 1 };
  $('#fb-input').focus();
  $('#fb-input').select();
  doSearch();
}
function closeFind(){
  document.body.classList.remove('findopen', 'findrep');
  $$('.block.find-focus').forEach(b => b.classList.remove('find-focus'));
  fhApply();
  editor.focus();
}
function doSearch(){
  const q = $('#fb-input').value;
  findState.q = q;
  findState.hits = [];
  const re = q ? fhBuildRe(q, findState.cs, findState.ww, findState.rx) : null;
  $('#fb-input').classList.toggle('rx-err', !!(q && findState.rx && !re));
  if (re){
    const list = blocks.slice();
    if (activeIndex >= 0 && editor.children[activeIndex])
      list[activeIndex] = getRawText(editor.children[activeIndex]);
    list.forEach((b, i) => {
      const np = noIndentParts(b);
      let m;
      while ((m = re.exec(np.body))){
        findState.hits.push({ i,
          start:noIndentBodyToRaw(np, m.index),
          end:noIndentBodyToRaw(np, m.index + m[0].length) });
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    });
  }
  updateFindCount(-1);
  fhApply();
}
function updateFindCount(cur){
  $('#fb-count').textContent = (cur >= 0 ? (cur + 1) : '–') + '/' + findState.hits.length;
}
function gotoHit(dir){
  doSearch();                                   // 內容可能已變:先重算
  const hits = findState.hits;
  if (!hits.length){ updateFindCount(-1); if (findState.q) toast('找不到「' + findState.q + '」'); return; }
  const { i:li, start:ls } = findState.last;
  let idx;
  if (dir >= 0){
    idx = hits.findIndex(h => h.i > li || (h.i === li && h.start > ls));
    if (idx < 0) idx = 0;
  } else {
    idx = -1;
    for (let k = hits.length - 1; k >= 0; k--){
      const h = hits[k];
      if (h.i < li || (h.i === li && h.start < ls)){ idx = k; break; }
    }
    if (idx < 0) idx = hits.length - 1;
  }
  const h = hits[idx];
  findState.last = { i: h.i, start: h.start };
  $$('.block.find-focus').forEach(b => b.classList.remove('find-focus'));
  deactivate(true);
  activate(h.i, h.start);
  const el = editor.children[h.i];
  if (el){
    setCaretRange(el, h.start, h.end);
    el.scrollIntoView({ block:'center', behavior:'smooth' });
    el.classList.add('find-focus');
    setTimeout(() => el.classList.remove('find-focus'), 900);
  }
  updateFindCount(idx);
  fhApply();
  if (window.CSS && CSS.highlights && typeof Highlight === 'function'){
    const selNow = getSelection();
    if (selNow.rangeCount) CSS.highlights.set('ty-find-cur', new Highlight(selNow.getRangeAt(0).cloneRange()));
  }
}
function replaceOne(){
  const rep = $('#fb-rep').value;
  const h = findState.hits.find(x => x.i === findState.last.i && x.start === findState.last.start);
  if (!h || activeIndex !== h.i){ gotoHit(1); return; }
  const el = editor.children[h.i];
  const src = getRawText(el);
  const target = src.slice(h.start, h.end);
  let same;
  if (findState.rx){
    const r = fhBuildRe(findState.q, findState.cs, findState.ww, true);
    same = !!(r && new RegExp('^(?:' + r.source + ')$', r.flags.replace('g','')).test(target));
  } else same = findState.cs ? target === findState.q : target.toLowerCase() === findState.q.toLowerCase();
  if (!same){ gotoHit(1); return; }
  pushUndo();
  const next = src.slice(0, h.start) + rep + src.slice(h.end);
  blocks[h.i] = next;
  el.textContent = next;
  el.className = activeClassFor(next);
  setCaret(el, h.start + rep.length);
  findState.last = { i: h.i, start: h.start + rep.length - 1 };
  onEdited();
  gotoHit(1);
}
function replaceAll(){
  const q = $('#fb-input').value;
  if (!q) return;
  commitMathEdit();
  exitTableEdit();
  const rep = $('#fb-rep').value;
  deactivate(true);
  const md = serialize();
  const re = fhBuildRe(q, findState.cs, findState.ww, findState.rx);
  if (!re){ toast('無效的正規表達式'); return; }
  const count = (md.match(re) || []).length;
  if (!count){ toast('找不到「' + q + '」'); return; }
  pushUndo();
  mountDoc(md.replace(re, () => rep));
  onEdited();
  doSearch();
  toast('已取代 ' + count + ' 處');
}
/* 尋找列事件 */
$('#fb-input').addEventListener('input', () => {
  clearTimeout(findState.timer);
  findState.timer = setTimeout(() => { doSearch(); }, 140);
});
$('#fb-next').addEventListener('click', () => gotoHit(1));
$('#fb-prev').addEventListener('click', () => gotoHit(-1));
$('#fb-close').addEventListener('click', closeFind);
$('#fb-case').addEventListener('click', function(){
  findState.cs = !findState.cs;
  this.classList.toggle('on', findState.cs);
  settings.findOpts.cs = findState.cs; persist();   /* CP73:選項記憶(不入 undo) */
  doSearch();
});
$('#fb-word').addEventListener('click', function(){
  findState.ww = !findState.ww;
  this.classList.toggle('on', findState.ww);
  settings.findOpts.ww = findState.ww; persist();   /* CP73:選項記憶(不入 undo) */
  doSearch();
});
$('#fb-rx').addEventListener('click', function(){
  findState.rx = !findState.rx;
  this.classList.toggle('on', findState.rx);
  settings.findOpts.rx = findState.rx; persist();   /* CP73:選項記憶(不入 undo) */
  doSearch();
});
$('#fb-rep-toggle').addEventListener('click', () =>
  document.body.classList.toggle('findrep'));
$('#fb-rep-one').addEventListener('click', replaceOne);
$('#fb-rep-all').addEventListener('click', replaceAll);
$('#findbar').addEventListener('keydown', e => {
  if (imeKey(e)) return;   // CP42:組字中 Enter=確認候選字、Esc=取消候選字,不得跳搜尋結果或關閉尋找列
  if (e.key === 'Escape'){ e.preventDefault(); closeFind(); return; }
  if (e.key === 'Enter'){
    e.preventDefault();
    if (e.target.id === 'fb-rep') replaceOne();
    else gotoHit(e.shiftKey ? -1 : 1);
    return;
  }
  const sig = eventSig(e);
  if (sig === 'M-KeyG'){ e.preventDefault(); gotoHit(1); }
  if (sig === 'MS-KeyG'){ e.preventDefault(); gotoHit(-1); }
  if (sig === 'MA-KeyF'){ e.preventDefault(); document.body.classList.toggle('findrep'); }
});

/* ---------- §8c 尋找全文高亮（CP67）----------
   CSS Custom Highlight API：純檢視層裝飾，零 DOM 變更 — 不碰 blocks/serialize/
   游標契約，亦無把 <mark> 注入渲染樹毒害 getRawText 的風險；不支援的瀏覽器
   優雅退化（逐筆導航照舊）。純函式 fhMatches/fhSliceMap 供測試抽取（t28）。 */
/* CP70:統一 re 建構 — 跳脫字面複製自 escReg(抽取自足);ww=整字比對智慧邊界:
   query 首/尾字元屬 [A-Za-z0-9_] 才於該側加 \b(CJK 無詞界概念,CJK 邊字該側
   不加界=文件化行為 — 純 \b 對 CJK query 恆零命中,不可採)。 */
function fhBuildRe(q, cs, ww, rx){
  const s = String(q == null ? '' : q);
  if (!s) return null;
  let pat = rx ? s : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (ww){
    if (rx) pat = '\\b(?:' + pat + ')\\b';
    else {
      if (/^[A-Za-z0-9_]/.test(s)) pat = '\\b' + pat;
      if (/[A-Za-z0-9_]$/.test(s)) pat = pat + '\\b';
    }
  }
  try { return new RegExp(pat, cs ? 'g' : 'gi'); } catch(_){ return null; }
}
function fhMatches(text, q, cs, ww, rx){
  const out = [];
  const s = String(text == null ? '' : text);
  const re = fhBuildRe(q, cs, ww, rx);
  if (!re) return out;
  let m;
  while ((m = re.exec(s))){
    out.push({ start: m.index, end: m.index + m[0].length });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}
function fhSliceMap(lens, start, end){
  const out = [];
  if (!Array.isArray(lens) || !(end > start)) return out;
  let base = 0;
  for (let i = 0; i < lens.length; i++){
    const L = lens[i] || 0;
    const a = Math.max(start, base), b = Math.min(end, base + L);
    if (b > a) out.push([i, a - base, b - base]);
    base += L;
    if (base >= end) break;
  }
  return out;
}
function fhApply(){
  if (!(window.CSS && CSS.highlights && typeof Highlight === 'function')) return;
  CSS.highlights.delete('ty-find-all');
  CSS.highlights.delete('ty-find-cur');
  if (!findOpen() || !findState.q) return;
  const ranges = [];
  const CAP = 1500;
  for (let bi = 0; bi < editor.children.length && ranges.length < CAP; bi++){
    const walker = document.createTreeWalker(editor.children[bi], NodeFilter.SHOW_TEXT, {
      acceptNode: n => (n.parentElement && n.parentElement.closest('.katex'))
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    const segs = []; let node;
    while ((node = walker.nextNode())) if (node.data) segs.push(node);
    if (!segs.length) continue;
    const spans = fhMatches(segs.map(n => n.data).join(''), findState.q, findState.cs, findState.ww, findState.rx);
    if (!spans.length) continue;
    const lens = segs.map(n => n.data.length);
    for (const sp of spans){
      const parts = fhSliceMap(lens, sp.start, sp.end);
      if (!parts.length) continue;
      const r = document.createRange();
      const last = parts[parts.length - 1];
      r.setStart(segs[parts[0][0]], parts[0][1]);
      r.setEnd(segs[last[0]], last[2]);
      ranges.push(r);
      if (ranges.length >= CAP) break;
    }
  }
  if (ranges.length) CSS.highlights.set('ty-find-all', new Highlight(...ranges));
}

/* ---------- §9 選單列(CP14:全面雙語,label/t 皆走 TT) ---------- */
/* CP112/CP130:模板一鍵建副本 — 中文與英文 TW_THESIS 論文模板都可建立一般文件副本。 */
function tplActiveTemplate(){
  const f = activeFile();
  return (isBuiltinFile(f) && (f.builtinKind === 'twthesis' || f.builtinKind === 'twthesisEn' || f.builtinKind === 'revtex')) ? f : null;
}
function tplCopyName(base){
  const stem = String(base || '').replace(/\.md$/i, '');
  const suffix = TT('-副本','-copy');
  let name = stem + suffix + '.md';
  for (let n = 2; files.some(x => x.name === name); n++) name = stem + suffix + '-' + n + '.md';
  return name;
}
function createFromTemplate(){
  const src = tplActiveTemplate();
  if (!src){ toast(TT('請先開啟一份論文模板','Open a thesis template first')); return; }
  commitCurrent();                       // 模板頁上的暫時修改一併帶入副本
  const f = { id: uid(), name: tplCopyName(src.name), content: src.content };
  files.push(f);
  switchFile(f.id);                      // 離開模板即依 CP93 還原模板原文;新檔由 switchFile 內 persist() 落地
  activate(0, 0);
  toast(TT('已從模板建立新文件，之後的修改會自動儲存','Created from the template; changes now save automatically'));
}
function updateTplCopyBar(){
  const bar = $('#tpl-copy-bar');
  if (!bar) return;
  /* 1.2.6：提示放進視窗標題列（取代檔名的位置），不再浮在格式列上擋住操作
     （使用者回報：想在模板上試功能時一直被擋）。檔名在左邊檔案欄看得到。 */
  const title = $('#titlebar');
  if (title && bar.parentElement !== title) title.appendChild(bar);
  const on = !!tplActiveTemplate();
  bar.classList.toggle('show', on);
  document.body.classList.toggle('tpl-in-title', on);
}
function menuDefs(){
  return [
    { label:'EKdelta', app:true, items:[
      { t:TT('關於 EKdelta','About EKdelta'), cmd: showAbout },
      { t:TT('版本資訊…','Version Info…'), cmd: showVersionInfo },
      { t:TT('偏好設定…','Preferences…'), cmd: showPrefs },
      { sep:true },
      { t:TT('語言：繁體中文','Language: 繁體中文'), cmd: ()=>setLang('zh'), check: settings.lang==='zh' },
      { t:TT('語言：English','Language: English'), cmd: ()=>setLang('en'), check: settings.lang==='en' },
      { sep:true },
      { t:TT('Markdown 與快捷鍵速查','Markdown & Shortcut Reference'), cmd: showShortcuts },
      { sep:true },
      { t:TT('恢復原廠設定…','Reset to Factory…'), cmd: factoryReset },
    ]},
    { label:TT('檔案','File'), items:[
      { t:TT('新增檔案','New File'), cmd: newFile, key:'⌘N*' },
      { t:TT('開啟 Markdown…','Open Markdown…'), cmd: openFile, key:'⌘O*' },
      { t:TT('快速開檔…','Quick Open…'), cmd: ()=>qoOpen(), key:'⌘P' },
      ...(tplActiveTemplate() ? [{ t:TT('從此模板建立新文件','New Document from This Template'), cmd: createFromTemplate }] : []),   /* CP112 */
      { sep:true },
      { t:TT('儲存','Save'), cmd: ()=>saveNow(true), key:'⌘S' },
      { t:TT('重新命名…','Rename…'), cmd: renameFile },
      { sep:true },
      /* 1.2.8（M36(c)）：匯出依格式分組，拿掉「└」樹狀前綴；booktabs／listings 兩個沒有勾選狀態的切換移到偏好設定「一般」。 */
      { t:TT('匯出 Markdown（.md）','Export Markdown (.md)'), cmd: exportMD, key:'⇧⌘S' },
      { t:TT('匯出 HTML','Export HTML'), cmd: exportHTML },
      { t:TT('匯出單一 HTML（圖片內嵌）…','Export Single-File HTML (images embedded)…'), cmd: exportHTMLEmbedded },
      { t:TT('匯出 LaTeX（.tex）','Export LaTeX (.tex)'), cmd: exportTex },
      { t:TT('匯出 REVTeX 專案（.zip）…','Export REVTeX Project (.zip)…'), cmd: ()=>window.__CP166_REVTEX_PROJECT__ && window.__CP166_REVTEX_PROJECT__.openDialog() },
      { sep:true },
      { t:TT('匯出 PDF（向量、可搜尋）…','Export PDF (vector, searchable)…'), cmd: exportPDF },
      { t:TT('分批匯出 PDF（大檔案用）…','Export PDF in Batches (large files)…'), cmd: () => window.exportPDFBatch() },
      { t:TT('匯出點陣 PDF（相容用）…','Export Raster PDF (compatibility)…'), cmd: exportPDFRaster },
      { t:TT('列印（系統對話框）…','Print (system dialog)…'), cmd: exportPDFVector },
      { t:TT('選擇 PDF 圖片資料夾…','Choose Image Folder for PDF…'), cmd: pickPdfImgFallback },
      { t:TT('PDF 診斷報告…','PDF Diagnostic Report…'), cmd: showLastPdfDiagnostic },
      { sep:true },
      { t:TT('匯出完整備份（.json）','Export Full Backup (.json)'), cmd: exportBackup },
      { t:TT('還原備份…','Restore Backup…'), cmd: importBackup },
      ...(FS_OK ? [
        { sep:true },
        { t: dirHandle ? TT('已連結：','Linked: ') + dirHandle.name : TT('連結儲存資料夾…','Link Storage Folder…'), cmd: linkFolder, check: !!dirHandle },
        { t:TT('從資料夾載入…','Load from Folder…'), cmd: loadFromFolder },
        ...(dirHandle ? [{ t:TT('中斷資料夾連結','Unlink Folder'), cmd: unlinkFolder }] : []),
      ] : []),
      { sep:true },
      { t:TT('關閉此檔案','Close This File'), cmd: closeFile },
    ]},
    { label:TT('編輯','Edit'), items:[
      { t:TT('復原','Undo'), cmd: cmdUndo, key:'⌘Z' },
      { t:TT('重做','Redo'), cmd: cmdRedo, key:'⇧⌘Z' },
      { sep:true },
      { t:TT('尋找…','Find…'), cmd: ()=>openFind(false), key:'⌘F' },
      { t:TT('尋找並取代…','Find & Replace…'), cmd: ()=>openFind(true), key:'⌥⌘F' },
      { t:TT('在所有檔案中尋找…','Find in All Files…'), cmd: ()=>openGlobalSearch(), key:'⇧⌘F' },
      { sep:true },
      { t:TT('貼上為純文字','Paste as Plain Text'), cmd: ctxPaste, key:'⇧⌘V' },
      { sep:true },
      { t:TT('複製為 Markdown','Copy as Markdown'), cmd: cmdCopyMD, key:'⇧⌘C' },
      { t:TT('複製為 LaTeX','Copy as LaTeX'), cmd: cmdCopyTex },
      { t:TT('複製為 HTML（Word 可貼）','Copy as HTML (for Word)'), cmd: cmdCopyWordHtml },
      { t:TT('選取單字','Select Word'), cmd: cmdSelectWord, key:'⌘D' },
      { t:TT('刪除單字','Delete Word'), cmd: cmdDeleteWord, key:'⇧⌘D' },
      { t:TT('選取表格列','Select Row'), cmd: cmdSelectRow, key:'⌘L' },
      { t:TT('全選（瀏覽器原生）','Select All (native)'), cmd: ()=>document.execCommand('selectAll'), key:'⌘A' },
    ]},
    { label:TT('段落','Paragraph'), items:[
      { t:TT('一級標題','Heading 1'), cmd: cmdHeading(1), key:'⌘1' },
      { t:TT('二級標題','Heading 2'), cmd: cmdHeading(2), key:'⌘2' },
      { t:TT('三級標題','Heading 3'), cmd: cmdHeading(3), key:'⌘3' },
      { t:TT('四級標題','Heading 4'), cmd: cmdHeading(4), key:'⌘4' },
      { t:TT('一般段落','Paragraph'), cmd: cmdHeading(0), key:'⌘0' },
      { t:TT('切換首行縮排','Toggle First-line Indent'), cmd: cmdNoIndent, key:'⌥⌘0' },
      { t:TT('提升標題級別','Promote Heading'), cmd: cmdHeadingUp, key:'⌘=' },
      { t:TT('降低標題級別','Demote Heading'), cmd: cmdHeadingDown, key:'⌘-' },
      { sep:true },
      { t:TT('引言','Blockquote'), cmd: cmdQuote, key:'⌥⌘Q' },
      { t:TT('無序清單','Bulleted List'), cmd: cmdUL, key:'⌥⌘U' },
      { t:TT('有序清單','Numbered List'), cmd: cmdOL, key:'⌥⌘O' },
      { t:TT('任務清單','Task List'), cmd: cmdTask, key:'⌥⌘X' },
      { t:TT('增加縮排','Indent'), cmd: cmdIndent, key:'⌘]' },
      { t:TT('減少縮排','Outdent'), cmd: cmdOutdent, key:'⌘[' },
      { sep:true },
      { t:TT('程式碼區塊','Code Block'), cmd: cmdCodeBlock, key:'⌥⌘C' },
      { t:TT('數學區塊','Math Block'), cmd: cmdMathBlock, key:'⌥⌘B' },
      { t:TT('表格','Table'), cmd: cmdTable, key:'⌥⌘T' },
      { t:TT('水平分隔線','Horizontal Rule'), cmd: cmdHR },
    ]},
    { label:TT('格式','Format'), items:[
      { t:TT('粗體','Bold'), cmd: cmdBold, key:'⌘B' },
      { t:TT('斜體','Italic'), cmd: cmdItalic, key:'⌘I' },
      { t:TT('底線','Underline'), cmd: cmdUnderline, key:'⌘U' },
      { t:TT('行內程式碼','Inline Code'), cmd: cmdCode, key:'⌘E' },
      { t:TT('刪除線','Strikethrough'), cmd: cmdStrike, key:'⇧⌘X' },
      { t:TT('螢光標記','Highlight'), cmd: cmdMark, key:'⇧⌘H' },
      { t:TT('行內公式','Inline Math'), cmd: cmdInlineMath, key:'⌃⌘M' },
      { sep:true },
      { t:TT('超連結','Hyperlink'), cmd: cmdLink, key:'⌘K' },
      { t:TT('圖片','Image'), cmd: cmdImage, key:'⌃⌘I' },
      { sep:true },
      { t:TT('清除格式','Clear Format'), cmd: cmdClearFormat, key:'⌘\\' },
    ]},
    { label:TT('顯示','View'), items:[
      { t:TT('原始碼模式','Source Code Mode'), cmd: cmdSrcMode, key:'⌘/', check: settings.srcmode },
      { sep:true },
      { t:TT('側邊欄','Sidebar'), cmd: cmdSidebar, key:'⇧⌘L', check: settings.sidebar },
      { t:TT('大綱面板','Outline Panel'), cmd: ()=>{ if(!settings.sidebar) cmdSidebar(); switchTab('outline'); } },
      { sep:true },
      { t:TT('焦點模式','Focus Mode'), cmd: cmdFocusMode, key:'F8', check: settings.focus },
      { t:TT('打字機模式','Typewriter Mode'), cmd: cmdTypewriter, key:'F9', check: settings.typewriter },
      { t:TT('寬版頁面','Wide Page'), cmd: cmdWidePage, check: !!settings.maximized },
      { sep:true },
      { t:TT('放大頁面','Zoom Page In'), cmd: ()=>viewZoom(+1), key:TT('⌘＋滾輪↑','⌘ + Wheel ↑') },
      { t:TT('縮小頁面','Zoom Page Out'), cmd: ()=>viewZoom(-1), key:TT('⌘＋滾輪↓','⌘ + Wheel ↓') },
      { t:TT('還原頁面大小（100%）','Reset Page Zoom (100%)'), cmd: ()=>viewZoom(0), check: vzNorm(settings.viewZoom) === 100 },
      { sep:true },
      { t:TT('格式工具列','Format Toolbar'), cmd: cmdToolbar, check: settings.showToolbar },
      { sep:true },
      { t:TT('md-meta 語法顯隱（實驗）','md-meta Syntax Reveal (Experimental)'), cmd: cmdMdMetaPilot, check: settings.mdMetaPilot === true },
    ]},
    { label:TT('主題','Theme'), items:[
      { t:TT('GitHub（預設）','GitHub (default)'), cmd: ()=>setTheme('github'), check: settings.theme==='github' && !settings.dark },
      { t:TT('Night 夜間','Night'),   cmd: ()=>setTheme('night'),  check: settings.theme==='github' && settings.dark },
      { t:TT('苔灰','Moss'), cmd: ()=>setTheme('moss'),  check: settings.theme==='moss' && !settings.dark },
      { t:TT('Blackout','Blackout'), cmd: ()=>setTheme('blackout'), check: settings.theme==='blackout' },
      { t:TT('Blackout Game','Blackout Game'), cmd: ()=>setTheme('blackoutgame'), check: settings.theme==='blackoutgame' },
      { sep:true },
      { t:TT('論文輸出模式（A4）','Paper Mode (A4)'), cmd: ()=>setTheme('paper'), check: settings.theme==='paper' },
      { t:TT('REVTeX 4.2 國際期刊','REVTeX 4.2 International Paper'), cmd: ()=>setTheme('revtex'), check: settings.theme==='revtex' },
      { t:TT('臺灣論文（中文）','Taiwan Thesis (Chinese)'), cmd: ()=>setTheme('twthesis'), check: settings.theme==='twthesis' },
      { t:TT('　├ 電子版 1（精簡版面）','　├ Digital 1 (compact layout)'), cmd: ()=>setTwThesisChineseVariant('compact'), check: settings.theme==='twthesis' && !settings.twthesisPrint && settings.twthesisDigitalStyle==='compact' },
      { t:TT('　├ 電子版 2（書冊版面）','　├ Digital 2 (book-style layout)'), cmd: ()=>setTwThesisChineseVariant('book'), check: settings.theme==='twthesis' && !settings.twthesisPrint && settings.twthesisDigitalStyle!=='compact' },
      { t:TT('　└ 紙本版（雙面裝訂）','　└ Print (two-sided binding)'), cmd: ()=>setTwThesisChineseVariant('print'), check: settings.theme==='twthesis' && !!settings.twthesisPrint },
      { t:TT('臺灣論文（英文）','Taiwan Thesis (English)'), cmd: ()=>setTheme('twthesis-en'), check: settings.theme==='twthesis-en' },
      { t:TT('　├ 電子版（對稱版面）','　├ Digital (symmetric)'), cmd: ()=>setTwThesisEnglishVariant(false), check: settings.theme==='twthesis-en' && !settings.twthesisEnPrint },
      { t:TT('　└ 紙本版（雙面書冊）','　└ Print (two-sided book)'), cmd: ()=>setTwThesisEnglishVariant(true),  check: settings.theme==='twthesis-en' && !!settings.twthesisEnPrint },
    ]},
    { label:TT('說明','Help'), items:[
      { t:TT('Markdown 與快捷鍵速查','Markdown & Shortcut Reference'), cmd: showShortcuts },
      { t:TT('關於 EKdelta','About EKdelta'), cmd: showAbout },
    ]},
  ];
}
/* CP14:更新所有靜態 HTML 介面文字(標題列、側邊欄、尋找列、段落浮框、圖片列、狀態列…) */
function applyStaticI18n(){
  const setTxt = (sel, zh, en) => { const el = $(sel); if (el) el.textContent = TT(zh, en); };
  const setAttr = (sel, attr, zh, en) => { const el = $(sel); if (el) el.setAttribute(attr, TT(zh, en)); };
  // 標題列紅黃綠燈與右側按鈕
  setAttr('#menubar', 'aria-label', '選單列', 'Menu bar');
  setAttr('#ty-toolbar', 'aria-label', '格式工具列', 'Formatting toolbar');
  setAttr('#traffic .tl.green', 'title', '切換寬版模式', 'Toggle wide mode');
  setAttr('#btn-sidebar', 'title', '側邊欄 ⇧⌘L', 'Sidebar ⇧⌘L');
  setAttr('#btn-src', 'title', '原始碼模式 ⌘/', 'Source Mode ⌘/');
  setAttr('#btn-theme', 'title', '切換深/淺色', 'Toggle dark/light');
  setAttr('#btn-fz-minus', 'title', '縮小字體（會重新排版）', 'Decrease font size (reflows layout)');
  setAttr('#btn-fz-plus', 'title', '放大字體（會重新排版）', 'Increase font size (reflows layout)');
  setAttr('#btn-fz-reset', 'title', '還原預設字體大小', 'Reset to default font size');
  setAttr('#view-zoom', 'title', '按住 Command 並滾動滑鼠滾輪；點擊還原 100%', 'Hold Command and scroll the mouse wheel; click to reset to 100%');
  // 側邊欄頁籤與新增鈕
  setTxt('.sb-tab[data-tab="files"]', '檔案', 'Files');
  setTxt('.sb-tab[data-tab="outline"]', '大綱', 'Outline');
  setTxt('.sb-tab[data-tab="search"]', '搜尋', 'Search');
  setTxt('#btn-newfile', '＋ 新增檔案', '＋ New File');
  // 尋找 / 取代列
  setAttr('#fb-input', 'placeholder', '尋找', 'Find');
  setAttr('#fb-case', 'title', '區分大小寫', 'Match case');
  setAttr('#fb-word', 'title', '整字比對', 'Whole word');
  setAttr('#fb-rx', 'title', '正規表達式', 'Regular expression');
  setAttr('#fb-prev', 'title', '上一個 ⇧Enter', 'Previous ⇧Enter');
  setAttr('#fb-next', 'title', '下一個 Enter', 'Next Enter');
  setAttr('#fb-rep-toggle', 'title', '顯示取代', 'Toggle replace');
  setAttr('#fb-close', 'title', '關閉 Esc', 'Close Esc');
  setAttr('#fb-rep', 'placeholder', '取代為', 'Replace with');
  setTxt('#fb-rep-one', '取代', 'Replace');
  setTxt('#fb-rep-all', '全部取代', 'Replace All');
  setAttr('#editor', 'aria-label', '編輯區', 'Editor');
  // 段落浮動編輯框
  setTxt('#pe-title', '編輯段落', 'Edit Paragraph');
  setTxt('#pe-hint', '⌘↩ 完成 · Esc 取消 · 可拖曳', '⌘↩ Done · Esc Cancel · draggable');
  setTxt('#pe-cancel', '取消', 'Cancel');
  setTxt('#pe-delete', '刪除此段落', 'Delete this paragraph');
  setTxt('#pe-next', '完成並新增下一段', 'Done & Add Next');
  setTxt('#pe-done', '完成', 'Done');
  // 圖片工具列
  setTxt('#img-bar .ib-label', '縮放', 'Zoom');
  setAttr('#ib-custom', 'title', '自訂縮放 %', 'Custom zoom %');
  setTxt('#ib-src', '原始碼', 'Source');
  setTxt('#ib-swap', '切換語法', 'Swap syntax');
  setAttr('#ib-swap', 'title', '在 Markdown 與 HTML 圖片語法之間切換', 'Toggle between Markdown and HTML image syntax');
  setAttr('#ib-src', 'title', '編輯這張圖片的原始碼(路徑/alt)', "Edit this image's source (path / alt)");
  // 狀態列版本徽章 + 圖片修復橫幅按鈕
  setAttr('#app-ver', 'title', '點擊查看版本資訊', 'Click for version info');
  setTxt('#img-fix-btn', '選擇圖片資料夾修復…', 'Choose image folder to fix…');
  setTxt('#img-fix-list', '查看缺圖清單', 'Show missing images');
  updateImgFixBar();
  // CP112:模板一鍵建副本浮動列
  setTxt('#tpl-copy-msg', '模板上的修改不會保存', 'Edits on this template are not saved');
  setTxt('#tpl-copy-btn', '從此模板建立新文件', 'New Document from This Template');
  updateTplCopyBar();
}
/* CP93/CP130:六份內建文件是執行期唯讀來源；中文／英文 TW_THESIS 模板各自獨立。
   內建文件不寫入 localStorage / window.storage / backup / linked folder；切離文件時重建目前版本原文。
   特殊身分同時由保留 id + builtinKind 判定，名稱完全不參與 runtime 判定，因此同名使用者文件仍是普通文件。 */
const BUILTIN_DOC_IDS = Object.freeze({
  welcome:'builtin:welcome', manual:'builtin:manual', notes:'builtin:notes',
  twthesis:'builtin:twthesis', twthesisEn:'builtin:twthesis-en', revtex:'builtin:revtex',
});
const BUILTIN_DOC_ORDER = Object.freeze(['welcome', 'manual', 'notes', 'twthesis', 'twthesisEn', 'revtex']);
const BUILTIN_DOC_ID_SET = new Set(Object.values(BUILTIN_DOC_IDS));
function isBuiltinFile(f){
  return !!f && BUILTIN_DOC_IDS[f.builtinKind] === f.id;
}
/* 保留舊錨點名稱。中英配對只作目前版本內建規格，不再以內容相等判定一般文件。 */
function seedLangPairs(){
  return [
    { zh: SEED_WELCOME, en: SEED_WELCOME_EN, zhName: '歡迎使用.md',  enName: 'Welcome.md' },
    { zh: SEED_MANUAL,  en: SEED_MANUAL_EN,  zhName: '使用說明.md',  enName: 'User Manual.md' },
  ];
}
function builtinDocSpec(kind){
  const en = isEN();
  if (kind === 'welcome') return { id:BUILTIN_DOC_IDS.welcome, builtinKind:kind,
    name:en ? 'Welcome.md' : '歡迎使用.md', content:en ? SEED_WELCOME_EN : SEED_WELCOME };
  if (kind === 'manual') return { id:BUILTIN_DOC_IDS.manual, builtinKind:kind,
    name:en ? 'User Manual.md' : '使用說明.md', content:en ? SEED_MANUAL_EN : SEED_MANUAL };
  if (kind === 'notes') return { id:BUILTIN_DOC_IDS.notes, builtinKind:kind,
    name:en ? 'Dev Notes.md' : '開發筆記.md', content:SEED_NOTES };
  if (kind === 'twthesis') return { id:BUILTIN_DOC_IDS.twthesis, builtinKind:kind,
    name:en ? 'Taiwan Thesis Template (Chinese).md' : '臺灣論文模板（中文）.md', content:SEED_TW_THESIS };
  if (kind === 'twthesisEn') return { id:BUILTIN_DOC_IDS.twthesisEn, builtinKind:kind,
    name:en ? 'Taiwan Thesis Template (English).md' : '臺灣論文模板（英文）.md', content:SEED_TW_THESIS_EN };
  if (kind === 'revtex') return { id:BUILTIN_DOC_IDS.revtex, builtinKind:kind,
    name:en ? 'International Journal Paper Template.markdown' : '國際期刊論文模板.markdown', content:SEED_REVTEX };
  return null;
}
function makeBuiltinDocs(){
  return BUILTIN_DOC_ORDER.map(builtinDocSpec).filter(Boolean);
}
function resetBuiltinFile(f){
  if (!isBuiltinFile(f)) return false;
  const spec = builtinDocSpec(f.builtinKind);
  if (!spec) return false;
  f.id = spec.id; f.builtinKind = spec.builtinKind; f.name = spec.name; f.content = spec.content;
  return true;
}
function resetAllBuiltinDocs(){
  let changed = false;
  for (const f of files) if (isBuiltinFile(f)) changed = resetBuiltinFile(f) || changed;
  return changed;
}
function seedFingerprint(s){
  let h = 0x811c9dc5;
  const text = String(s == null ? '' : s);
  for (let i = 0; i < text.length; i++){
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
/* v1 快照沒有 builtinKind，只能在「舊版啟動時固定存在的前五槽」內，以名稱 + 完整內容指紋辨識。
   為避免限制外溢，至少要同時命中三種不同舊種子才視為舊版內建文件群；單一同名／同內容使用者文件絕不移除。
   命中的未修改舊種子由新版內建文件取代；改過一字的舊文件保留為一般使用者文件，避免升級遺失資料。
   v2 快照完全不走內容判定，因此使用者日後建立同名、同內容文件也不會被套用內建限制。 */
const LEGACY_BUNDLED_SEED_FINGERPRINTS = Object.freeze({
  '2585:534ff888':'welcome', '4168:6c415090':'welcome',
  '7730:b6e41ac9':'manual', '16875:186eae3f':'manual', '49609:ea9a40a5':'notes',
  '1549:08ecdd69':'welcome', '3159:482e3d8d':'welcome',
  '6295:ad6b7c80':'manual', '14426:2c7ef2ec':'manual', '57460:0eb3b762':'notes',
  '1612:da24761e':'welcome', '3318:25a6b72f':'welcome',
  '6655:51e20eb6':'manual', '15280:f9ceee2f':'manual', '59508:a02c1837':'notes',
  '6720:0b036d67':'manual', '15532:815b2087':'manual', '60640:f19259ad':'notes',
  '1674:c6de11d5':'welcome', '3488:93c939ad':'welcome',
  '7042:dc602e17':'manual', '16361:23490e82':'manual', '62040:416aefb5':'notes',
  /* 0.9.79／CP92：同時接受舊版來源與「版本迭代歷程」正序修正版。 */
  '1683:9f96fe68':'welcome', '3514:1424cec8':'welcome',
  '7170:b48943b9':'manual', '16610:d88740ae':'manual',
  '63182:5aeea231':'notes', '63174:86b0c60b':'notes',
});
const LEGACY_BUNDLED_SLOT_ORDER = Object.freeze(['welcome', 'manual', 'twthesis', 'twthesis2', 'notes']);
const LEGACY_BUNDLED_NAMES = Object.freeze({
  welcome:['歡迎使用.md', 'Welcome.md'], manual:['使用說明.md', 'User Manual.md'],
  notes:['開發筆記.md', 'Dev Notes.md'], twthesis:['臺灣論文模板.md', 'Taiwan Thesis Template.md', '臺灣論文模板（中文）.md', 'Taiwan Thesis Template (Chinese).md'],
  twthesis2:['臺灣論文 2 論文模板.md', '臺灣論文 2 Thesis Template.md'],
});
function legacyBundledLayoutMatches(source){
  return Array.isArray(source) && source.length >= 5 && LEGACY_BUNDLED_SLOT_ORDER.every((kind, index) =>
    LEGACY_BUNDLED_NAMES[kind].includes(String((source[index] && source[index].name) || '')));
}
function legacyBundledKind(f, index){
  if (!f || index < 0 || index >= LEGACY_BUNDLED_SLOT_ORDER.length) return null;
  const expectedKind = LEGACY_BUNDLED_SLOT_ORDER[index];
  const content = String(f.content == null ? '' : f.content);
  let kind = LEGACY_BUNDLED_SEED_FINGERPRINTS[content.length + ':' + seedFingerprint(content)] || null;
  if (!kind && content === SEED_TW_THESIS) kind = 'twthesis';
  if (!kind && content === LEGACY_SEED_TW_THESIS2) kind = 'twthesis2';
  if (kind !== expectedKind) return null;
  return LEGACY_BUNDLED_NAMES[kind].includes(String(f.name || '')) ? kind : null;
}
function legacyBundledIndexes(source){
  /* 先要求前五槽完整符合舊版固定排列，再以內容指紋挑出仍未修改的槽位。
     這個版面證據把一次性 v1 遷移限制在真正舊工作區；一般文件即使同名、同內容也不會因單筆巧合被移除。 */
  if (!legacyBundledLayoutMatches(source)) return new Set();
  const firstByKind = new Map();
  source.slice(0, LEGACY_BUNDLED_SLOT_ORDER.length).forEach((f, index) => {
    const kind = legacyBundledKind(f, index);
    if (kind && !firstByKind.has(kind)) firstByKind.set(kind, index);
  });
  /* 至少三份仍為原始種子才確認是舊版內建群組；其餘修改過的槽位一律保留成一般文件。 */
  return firstByKind.size >= 3 ? new Set(firstByKind.values()) : new Set();
}
function sanitizeUserFile(raw, usedIds){
  const src = raw && typeof raw === 'object' ? raw : {};
  let id = typeof src.id === 'string' ? src.id : '';
  while (!id || BUILTIN_DOC_ID_SET.has(id) || usedIds.has(id)) id = uid();
  usedIds.add(id);
  let name = typeof src.name === 'string' && src.name.trim() ? src.name : TT('未命名.md','Untitled.md');
  return { id, name, content:String(src.content == null ? '' : src.content) };
}
function normalizeFilesWithBuiltins(rawFiles, migrateLegacy){
  const source = Array.isArray(rawFiles) ? rawFiles : [];
  const usedIds = new Set(BUILTIN_DOC_ID_SET);
  const legacyIndexes = migrateLegacy ? legacyBundledIndexes(source) : new Set();
  const userFiles = [];
  source.forEach((raw, index) => {
    if (legacyIndexes.has(index)) return;
    userFiles.push(sanitizeUserFile(raw, usedIds));
  });
  return makeBuiltinDocs().concat(userFiles);
}
function migrateBundledSeedDocs(){
  const before = files.map(f => [f && f.id, f && f.name, f && f.content]).join('\u001f');
  files = normalizeFilesWithBuiltins(files, true);
  const after = files.map(f => [f && f.id, f && f.name, f && f.content]).join('\u001f');
  return before !== after;
}
function persistentUserFiles(){
  return files.filter(f => !isBuiltinFile(f)).map(f => ({
    id:f.id, name:f.name,
    content:String(f.id === activeId ? losslessContentForActive('persistent') : (f.content == null ? '' : f.content)),
  }));
}
function userFileCount(){ return files.reduce((n, f) => n + (isBuiltinFile(f) ? 0 : 1), 0); }
function setLang(lang){
  const activeWasBuiltin = isBuiltinFile(activeFile());
  settings.lang = (lang === 'en') ? 'en' : 'zh';
  document.documentElement.lang = isEN() ? 'en' : 'zh-Hant';
  document.body.classList.toggle('lang-en', isEN());
  resetAllBuiltinDocs();
  applyStaticI18n();
  buildMenubar();
  if (typeof tbBuild === 'function'){ tbBuild(); tbSync(); }
  renderSidebar();
  updateCounts();
  activeWasBuiltin ? markSaved() : markSavedState();
  updateBlockInfo();
  /* 目前開著內建文件時，語言切換視同重新載入該文件的目前版本標準內容。一般文件完全不動。 */
  if (activeWasBuiltin){
    const f = activeFile();
    if (f){ mountDoc(f.content); updateTitle(); if (settings.srcmode) srcview.value = losslessActiveNormalized(); }
  }
  if (inPaperMode()) schedulePaginate();
  persist();
  closeMenus();
  toast(isEN() ? 'Language: English' : '介面語言：繁體中文');
}
let openMenuEl = null;
/* ============================================================
   CP135(0.9.115)— 編輯區頂部格式工具列
   ・工具列是 #editor-wrap 內的 flex 子項，位於模板提示列與文字視口之間；
     因此只縮短右側內容欄，不改側邊欄的 top／height。
   ・寬畫面顯示使用者勾選的全部工具；實際寬度不足時才由右向左收進 ⋯。
   ・工具目錄涵蓋論文與一般 Markdown 常用的行內、段落、列表、圖片、公式、
     程式碼區塊、表格與分隔線；顯示項目可儲存到 settings.toolbarItems。
   ・mousedown 保留目前 selection；所有動作仍走既有 cmd* 家族，不另建編輯核心。
   ============================================================ */
function tbActiveSet(tags, insidePre){
  const t = tags || [];
  return {
    bold: t.indexOf('strong') >= 0 || t.indexOf('b') >= 0,
    italic: t.indexOf('em') >= 0 || t.indexOf('i') >= 0,
    underline: t.indexOf('u') >= 0 || t.indexOf('ins') >= 0,
    strike: t.indexOf('s') >= 0 || t.indexOf('del') >= 0,
    mark: t.indexOf('mark') >= 0,
    code: !insidePre && t.indexOf('code') >= 0,
    link: t.indexOf('a') >= 0
  };
}
/* 保留 CP54 幾何 helper 供歷史測試／外掛相容；CP135 工具列本身不再使用 fixed placement。 */
function tbPlacement(rect, barW, barH, vw, vh){
  let left = rect.left + Math.round((rect.width - barW) / 2);
  let top  = rect.bottom - barH - 16;
  if (vw && left + barW > vw - 8) left = vw - 8 - barW;
  if (left < 8) left = 8;
  if (vh && top + barH > vh - 8) top = vh - 8 - barH;
  if (top < 8) top = 8;
  return { left: Math.round(left), top: Math.round(top) };
}
const tbBar = $('#ty-toolbar'), tbTip = $('#ty-tbtip'), tbMore = $('#ty-tbmore');
/*@ekd-icons-begin@*/
/* 1.2.7 介面圖示（M33，Jason 11-08：圖示大小、上下位置不一，刪除線與行內程式碼看不清）。
   全部同一個 20×20 格線、線寬 1.5、圓角端點；工具列、標題列、公式輸入、字色按鈕都從這裡取。
   來源是文件資料夾「[1.2.8] 介面與論文工具重構/圖示/icons.mjs」（1.2.7 建立），由 build_icons.mjs 寫入，不要手改這一段。 */
const EKD_ICONS = Object.freeze({
 "undo": "<path d=\"M7 4 3.5 7.5 7 11\"/><path d=\"M3.5 7.5H12a4.25 4.25 0 0 1 0 8.5H9.5\"/>",
 "redo": "<path d=\"m13 4 3.5 3.5L13 11\"/><path d=\"M16.5 7.5H8a4.25 4.25 0 0 0 0 8.5h2.5\"/>",
 "bold": "<path class=\"b\" d=\"M6.2 4.2h4.6a2.9 2.9 0 0 1 0 5.8H6.2zM6.2 10h5.4a3 3 0 0 1 0 6H6.2z\"/>",
 "italic": "<path d=\"M9 4.2h5.5M5.5 15.8H11M11.8 4.2 8.2 15.8\"/>",
 "underline": "<path d=\"M6 4.2v5.4a4 4 0 0 0 8 0V4.2M5 16.3h10\"/>",
 "strike": "<path d=\"M13.6 6.4C13.1 5 11.8 4.2 10 4.2c-2.2 0-3.6 1.1-3.6 2.6 0 1.2.8 1.9 2.2 2.4\"/><path d=\"M3.5 10h13\"/><path d=\"M11.8 11c1.2.5 1.9 1.2 1.9 2.3 0 1.6-1.5 2.5-3.7 2.5-1.9 0-3.4-.8-3.9-2.2\"/>",
 "mark": "<rect class=\"mk\" x=\"2.75\" y=\"2.75\" width=\"14.5\" height=\"14.5\" rx=\"3\"/><path class=\"mi\" d=\"M6.3 14.6 10 5.2l3.7 9.4M7.6 11.4h4.8\"/>",
 "code": "<path d=\"M6.5 6 3 10l3.5 4M13.5 6l3.5 4-3.5 4M11.3 4.6 8.7 15.4\"/>",
 "link": "<path d=\"M8.6 11.4a3.1 3.1 0 0 0 4.4 0l2.5-2.5a3.1 3.1 0 1 0-4.4-4.4l-.9.9\"/><path d=\"M11.4 8.6a3.1 3.1 0 0 0-4.4 0l-2.5 2.5a3.1 3.1 0 1 0 4.4 4.4l.9-.9\"/>",
 "image": "<rect x=\"3\" y=\"4\" width=\"14\" height=\"12\" rx=\"2\"/><circle cx=\"7.4\" cy=\"8\" r=\"1.3\"/><path d=\"m3.6 14.2 3.9-3.6 3 2.6 2.3-2 3.6 3\"/>",
 "inlineMath": "<path d=\"m4 8.5 5.5 7.5M9.5 8.5 4 16\"/><path class=\"t\" d=\"M11.8 5.6a1.5 1.5 0 1 1 2.6 1L11.9 9.4h3\"/>",
 "quote": "<path class=\"f\" d=\"M4.6 10.5h3.3v3.8H4.6zM11.6 10.5h3.3v3.8h-3.3z\"/><path d=\"M4.6 10.5c0-2.5 1-4.1 3.1-4.9M11.6 10.5c0-2.5 1-4.1 3.1-4.9\"/>",
 "ul": "<circle class=\"f\" cx=\"4.5\" cy=\"5\" r=\"1.1\"/><circle class=\"f\" cx=\"4.5\" cy=\"10\" r=\"1.1\"/><circle class=\"f\" cx=\"4.5\" cy=\"15\" r=\"1.1\"/><path d=\"M8 5h9M8 10h9M8 15h9\"/>",
 "ol": "<path class=\"t\" d=\"m4.2 3.9.9-.6v3.3M3.9 8.9a.95.95 0 0 1 1.8.3c0 .4-.2.7-.6 1l-1.2 1.2h1.9M3.9 13.6h1.8l-1 1.1c.6 0 1 .4 1 .9s-.4.9-1 .9c-.4 0-.7-.1-.9-.4\"/><path d=\"M9 5h8M9 10h8M9 15h8\"/>",
 "task": "<rect x=\"3.5\" y=\"3.5\" width=\"13\" height=\"13\" rx=\"2.5\"/><path d=\"m7 10.2 2.1 2.1 4-4.3\"/>",
 "codeBlock": "<path d=\"M7.5 4C6 4 5.5 4.8 5.5 6v1.7c0 1-.5 1.8-1.7 2.3 1.2.5 1.7 1.3 1.7 2.3V14c0 1.2.5 2 2 2M12.5 4c1.5 0 2 .8 2 2v1.7c0 1 .5 1.8 1.7 2.3-1.2.5-1.7 1.3-1.7 2.3V14c0 1.2-.5 2-2 2\"/>",
 "mathBlock": "<path class=\"d\" d=\"M3 3.8h14M3 16.2h14\"/><path d=\"M12.8 7.4v-.9H7.2l3 3.5-3 3.5h5.6v-.9\"/>",
 "sigma": "<path d=\"M14.8 6V4.2H5.2l5.2 5.8-5.2 5.8h9.6V14\"/>",
 "table": "<rect x=\"3\" y=\"4\" width=\"14\" height=\"12\" rx=\"1.5\"/><path d=\"M3 8.3h14M8 8.3V16M12.5 8.3V16\"/>",
 "hr": "<path class=\"d\" d=\"M5.5 5.5h9M5.5 14.5h9\"/><path d=\"M3 10h14\"/>",
 "clear": "<path d=\"M4.5 4.5h9M9 4.5v11M12.8 12.2l3.8 3.8M16.6 12.2 12.8 16\"/>",
 "more": "<circle class=\"f\" cx=\"5\" cy=\"10\" r=\"1.25\"/><circle class=\"f\" cx=\"10\" cy=\"10\" r=\"1.25\"/><circle class=\"f\" cx=\"15\" cy=\"10\" r=\"1.25\"/>",
 "textColor": "<path d=\"M4.9 13.5 10 2l5.1 11.5M6.6 9.8h6.8\"/><rect class=\"cb\" x=\"3.5\" y=\"15.25\" width=\"13\" height=\"3\" rx=\"1.1\"/>",
 "sidebar": "<rect x=\"3\" y=\"4\" width=\"14\" height=\"12\" rx=\"2\"/><path d=\"M8 4v12\"/>",
 "source": "<path d=\"M7 6 3 10l4 4M13 6l4 4-4 4\"/>",
 "fontSmaller": "<path d=\"M2.6 16.4 6.7 6.6l4.1 9.8M4.1 13h5.2\"/><path d=\"M12.5 6h5\"/>",
 "fontLarger": "<path d=\"M2.6 16.4 6.7 6.6l4.1 9.8M4.1 13h5.2\"/><path d=\"M12.5 6h5M15 3.5v5\"/>",
 "fontReset": "<path d=\"M2.6 16.4 6.7 6.6l4.1 9.8M4.1 13h5.2\"/><path d=\"M16.5 3.4A3 3 0 1 1 12.28 4.73\"/><path class=\"f\" d=\"M13.08 3.01L11.06 4.39L13.33 5.44z\"/>",
 "sun": "<circle cx=\"10\" cy=\"10\" r=\"3.2\"/><path d=\"M10 2.8v1.8M10 15.4v1.8M2.8 10h1.8M15.4 10h1.8M4.91 4.91l1.27 1.27M13.82 13.82l1.27 1.27M4.91 15.09l1.27-1.27M13.82 6.18l1.27-1.27\"/>",
 "moon": "<path d=\"M16.48 10.57A6.48 6.48 0 1 1 9.43 3.52a5.04 5.04 0 0 0 7.05 7.05z\"/>"
});
function ekdIcon(name){ const body = EKD_ICONS[name]; return body ? '<svg class="ekd-ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false">' + body + '</svg>' : ''; }
window.ekdIcon = ekdIcon;
/*@ekd-icons-end@*/
const TB_CATALOG = Object.freeze([
  { id:'paragraph', group:'paragraph', zh:'段落樣式', en:'Paragraph style', html:'<span class="tb-paragraph-label">段落</span><span class="tb-chevron">▾</span>', cls:'tb-paragraph' },
  { id:'bold', group:'inline', zh:'粗體', en:'Bold', k:'⌘B', html:ekdIcon('bold'), run:cmdBold },
  { id:'italic', group:'inline', zh:'斜體', en:'Italic', k:'⌘I', html:ekdIcon('italic'), run:cmdItalic },
  { id:'underline', group:'inline', zh:'底線', en:'Underline', k:'⌘U', html:ekdIcon('underline'), run:cmdUnderline },
  { id:'strike', group:'inline', zh:'刪除線', en:'Strikethrough', html:ekdIcon('strike'), run:cmdStrike },
  { id:'mark', group:'inline', zh:'標記', en:'Highlight', html:ekdIcon('mark'), run:cmdMark },
  { id:'code', group:'inline', zh:'行內程式碼', en:'Inline code', k:'⌘E', html:ekdIcon('code'), run:cmdCode },
  { id:'link', group:'insert', zh:'連結', en:'Link', k:'⌘K', html:ekdIcon('link'), run:cmdLink },
  { id:'image', group:'insert', zh:'圖片', en:'Image', html:ekdIcon('image'), run:cmdImage },
  { id:'inlineMath', group:'insert', zh:'行內數學', en:'Inline math', html:ekdIcon('inlineMath'), run:cmdInlineMath },
  { id:'quote', group:'block', zh:'引言', en:'Block quote', html:ekdIcon('quote'), run:cmdQuote },
  { id:'ul', group:'block', zh:'項目清單', en:'Bullet list', html:ekdIcon('ul'), run:cmdUL },
  { id:'ol', group:'block', zh:'編號清單', en:'Numbered list', html:ekdIcon('ol'), run:cmdOL },
  { id:'task', group:'block', zh:'工作清單', en:'Task list', html:ekdIcon('task'), run:cmdTask },
  { id:'codeBlock', group:'structure', zh:'程式碼區塊', en:'Code block', html:ekdIcon('codeBlock'), run:cmdCodeBlock },
  { id:'mathBlock', group:'structure', zh:'區塊公式', en:'Display math', html:ekdIcon('mathBlock'), run:cmdMathBlock },
  { id:'table', group:'structure', zh:'表格', en:'Table', k:'⌥⌘T', html:ekdIcon('table'), run:cmdTable },
  { id:'hr', group:'structure', zh:'水平分隔線', en:'Horizontal rule', html:ekdIcon('hr'), run:cmdHR },
  { id:'clear', group:'cleanup', zh:'清除格式', en:'Clear formatting', k:'⌘\\', html:ekdIcon('clear'), run:cmdClearFormat }
]);
const TB_DEFAULT_ITEMS = Object.freeze(TB_CATALOG.map(x => x.id));
const TB_TOOL_IDS = new Set(TB_DEFAULT_ITEMS);
let tbOverflowIds = [];
let tbLayoutW = -1;
let tbLayoutRAF = 0;
function normalizeToolbarItems(){
  const before = JSON.stringify(settings.toolbarItems);
  const raw = Array.isArray(settings.toolbarItems) ? settings.toolbarItems : [];
  const seen = new Set(), next = [];
  raw.forEach(id => { if (TB_TOOL_IDS.has(id) && !seen.has(id)){ seen.add(id); next.push(id); } });
  settings.toolbarItems = next.length ? next : [...TB_DEFAULT_ITEMS];
  return before !== JSON.stringify(settings.toolbarItems);
}
function tbTool(id){ return TB_CATALOG.find(x => x.id === id) || null; }
function tbVisible(){ return !!settings.showToolbar; }
/* 1.2.6：「⋯」改放在 .tb-items 最後（第二排末尾），被收起的工具在它下方的小框裡以
   原本的圖示排列（.tb-overflow-pop，放在 #ty-toolbar 裡，沿用格式鈕的樣式、
   滑過提示與點擊委派）。滑鼠移到「⋯」就彈出，離開「⋯」與小框一小段時間後收起；
   觸控用點的開關。原本右上角的大「⋯」與純文字清單不再使用。 */
let tbOverflowTimer = 0;
function tbOverflowParts(){
  return { more: tbBar.querySelector('.tb-overflow-btn'), pop: tbBar.querySelector('.tb-overflow-pop') };
}
function tbOverflowOpen(){ const p = tbOverflowParts().pop; return !!(p && !p.hidden); }
function tbOverflowHide(){
  clearTimeout(tbOverflowTimer); tbOverflowTimer = 0;
  const { more, pop } = tbOverflowParts();
  if (pop && !pop.hidden){ pop.hidden = true; pop.textContent = ''; }
  if (more) more.setAttribute('aria-expanded','false');
}
function tbOverflowPlace(){
  const { more, pop } = tbOverflowParts();
  if (!more || !pop || pop.hidden || more.hidden) return;
  const bar = tbBar.getBoundingClientRect(), mr = more.getBoundingClientRect();
  /* 右緣對齊「⋯」，往左展開；最寬不超過格式列，像格式列多出來的第三、四排。 */
  const right = Math.max(6, Math.round(bar.right - mr.right));
  pop.style.right = right + 'px';
  pop.style.maxWidth = Math.max(120, Math.round(bar.width - right - 6)) + 'px';
  let lastTop = null;
  pop.querySelectorAll('.tb-btn').forEach(b => {
    b.classList.remove('row-start');
    const t = b.offsetTop;
    if (lastTop === null || Math.abs(t - lastTop) >= 4){ b.classList.add('row-start'); lastTop = t; }
  });
}
function tbOverflowShow(){
  const { more, pop } = tbOverflowParts();
  if (!more || !pop || more.hidden || !tbOverflowIds.length) return;
  clearTimeout(tbOverflowTimer); tbOverflowTimer = 0;
  tbMore.classList.add('tb-hidden'); tbMore.dataset.kind = '';
  pop.textContent = '';
  let prevGroup = '';
  const add = (id, zh, en, html, cls, group) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tb-btn' + (cls ? ' ' + cls : '') + (prevGroup && prevGroup !== group ? ' group-start' : '');
    b.dataset.action = id; b.dataset.group = group;
    b.setAttribute('data-zh', zh); b.setAttribute('data-en', en); b.setAttribute('aria-label', TT(zh, en));
    b.innerHTML = html; pop.appendChild(b); prevGroup = group;
  };
  tbOverflowIds.forEach(id => { const t = tbTool(id); if (t) add(t.id, t.zh, t.en, t.html, t.cls, t.group); });
  add('customize', '自訂工具列…', 'Customize toolbar…',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    '', 'customize');
  pop.hidden = false; more.setAttribute('aria-expanded','true');
  tbOverflowPlace(); tbUpdateActive();
}
function tbOverflowLater(){
  clearTimeout(tbOverflowTimer);
  tbOverflowTimer = setTimeout(tbOverflowHide, 220);
}
function tbMoreHide(){
  tbMore.classList.add('tb-hidden'); tbMore.dataset.kind = '';
  tbOverflowHide();
}
function tbCurrentRaw(){
  if (settings.srcmode && srcview){
    const v = srcview.value || '', p = srcview.selectionStart || 0;
    const a = v.lastIndexOf('\n', Math.max(0,p-1)) + 1, z0 = v.indexOf('\n',p), z = z0 < 0 ? v.length : z0;
    return v.slice(a,z);
  }
  const pe = $('#pe-text');
  if (peIndex >= 0 && pe && document.activeElement === pe) return pe.value || '';
  let i = activeIndex;
  if (i < 0){ const sel = getSelection(); const el = sel && sel.anchorNode ? blockElOf(sel.anchorNode) : null; if (el) i = blockIndexOf(el); }
  return i >= 0 && i < blocks.length ? String(blocks[i] || '') : '';
}
function tbParagraphName(){
  const raw = noIndentParts(tbCurrentRaw()).body;
  const m = raw.match(/^(#{1,6})\s+/);
  if (m) return 'H' + m[1].length;
  if (/^>\s?/.test(raw)) return TT('引言','Quote');
  if (RE.task.test(raw)) return TT('工作','Task');
  if (/^\s*[-*+]\s+/.test(raw)) return TT('清單','List');
  if (/^\s*\d+\.\s+/.test(raw)) return TT('編號','Numbered');
  return TT('段落','Paragraph');
}
function tbBuild(){
  normalizeToolbarItems();
  const row=document.createElement('div'); row.className='tb-row';
  const history=document.createElement('div'); history.className='tb-history'; history.setAttribute('aria-label',TT('編輯歷史','Edit history'));
  const historyButton=(id,zh,en,svg)=>{
    const b=document.createElement('button'); b.className='tb-btn'; b.type='button'; b.dataset.action=id;
    b.setAttribute('data-zh',zh); b.setAttribute('data-en',en); b.setAttribute('aria-label',TT(zh,en)); b.title=TT(zh,en); b.innerHTML=svg; return b;
  };
  history.appendChild(historyButton('undo','復原','Undo',ekdIcon('undo')));
  history.appendChild(historyButton('redo','重做','Redo',ekdIcon('redo')));
  const host=document.createElement('div'); host.className='tb-items';
  let prevGroup='';
  settings.toolbarItems.forEach(id=>{
    const tool=tbTool(id); if(!tool)return;
    const btn=document.createElement('button');
    btn.className='tb-btn'+(tool.cls?' '+tool.cls:'')+(prevGroup&&prevGroup!==tool.group?' group-start':'');
    btn.type='button';btn.dataset.action=tool.id;btn.dataset.group=tool.group;
    btn.setAttribute('data-zh',tool.zh);btn.setAttribute('data-en',tool.en);
    btn.setAttribute('aria-label',TT(tool.zh,tool.en));btn.title=TT(tool.zh,tool.en);btn.innerHTML=tool.html;
    host.appendChild(btn);prevGroup=tool.group;
  });
  /* 1.2.6：「⋯」是 .tb-items 的最後一顆（第二排末尾），沒有 title——滑過直接彈出小框，
     不再疊一個瀏覽器原生提示。 */
  const more=document.createElement('button');more.className='tb-btn tb-overflow-btn';more.type='button';more.dataset.action='more';
  more.setAttribute('aria-label',TT('收起的格式工具','Hidden formatting tools'));more.setAttribute('aria-haspopup','true');more.setAttribute('aria-expanded','false');
  more.innerHTML=ekdIcon('more');more.hidden=true;host.appendChild(more);
  const pop=document.createElement('div');pop.className='tb-overflow-pop';pop.hidden=true;pop.setAttribute('role','toolbar');
  pop.setAttribute('aria-label',TT('收起的格式工具','Hidden formatting tools'));
  row.appendChild(history);row.appendChild(host);
  tbBar.textContent='';tbBar.appendChild(row);tbBar.appendChild(pop);tbLayoutW=-1;tbUpdateParagraphLabel();tbUpdateHistory();requestAnimationFrame(tbLayout);
}
function tbLayout(){
  cancelAnimationFrame(tbLayoutRAF); tbLayoutRAF = 0;
  if (!tbVisible() || !tbBar.isConnected) return;
  const host = tbBar.querySelector('.tb-items'), more = host && host.querySelector('.tb-overflow-btn');
  if (!host || !more) return;
  const before = tbOverflowIds.join(',');
  const btns = [...host.querySelectorAll('.tb-btn[data-action]:not(.tb-overflow-btn)')];
  btns.forEach(b => b.classList.remove('tb-hidden-by-width','first-visible','row-start'));
  tbBar.classList.remove('tb-two');
  more.hidden = true; tbOverflowIds = [];
  /* 1.1.5.6.2：三段式。一排放得下 → 就一排；放不下 → 攤成兩排；
     兩排還放不下 → 才由右往左收進「⋯」。
     兩排時 flex-wrap 讓 scrollWidth 永遠等於 clientWidth，量不出溢出，
     所以第三段改用「不同 offsetTop 的數量」判斷排數。 */
  const rowCount = () => {
    const tops = [];
    for (const b of (more.hidden ? btns : btns.concat(more))){
      if (b.classList.contains('tb-hidden-by-width')) continue;
      const t = b.offsetTop;
      if (!tops.some(x => Math.abs(x - t) < 4)) tops.push(t);
    }
    return tops.length || 1;
  };
  /* scrollWidth includes flex gaps and group-start margins, so overflow decisions match the painted row. */
  if (host.scrollWidth > host.clientWidth + .5){
    tbBar.classList.add('tb-two');
    if (rowCount() > 2){
      more.hidden = false;
      for (let i = btns.length - 1; i >= 0 && rowCount() > 2; i--){
        const b = btns[i];
        b.classList.add('tb-hidden-by-width');
        tbOverflowIds.unshift(b.dataset.action);
      }
    }
  }
  const vis = btns.filter(b => !b.classList.contains('tb-hidden-by-width'));
  if (vis.length) vis[0].classList.add('first-visible');
  /* 每一排的第一顆不畫群組分隔線，否則第二排開頭會冒出一條懸空的短豎線。 */
  let lastTop = null;
  for (const b of vis){
    const t = b.offsetTop;
    if (lastTop === null || Math.abs(t - lastTop) >= 4){ b.classList.add('row-start'); lastTop = t; }
  }
  tbLayoutW = Math.round(tbBar.getBoundingClientRect().width);
  if (more.hidden) tbMoreHide();
  else if (tbOverflowOpen()){
    if (before !== tbOverflowIds.join(',')) tbOverflowShow(); else tbOverflowPlace();
  }
}
/* 1.2.6：格式列上次排版時的寬度。#editor-wrap 變寬變窄時（拖視窗、拖分隔線、
   左右寬度重新分配），在 ResizeObserver 回呼裡「當場」重排，這一格畫面繪製前就
   排好。原本延到下一格才排，中間那一格用舊排法套新寬度，兩排會被擠成三排再
   彈回來；拖動視窗時每一格都重演一次，就是使用者看到的不停閃爍。
   （記錄寬度的 tbLayoutW 宣告在 tbOverflowIds 旁邊。） */
function tbPositionNow(){
  /* CP54 API 相容名；CP135 不設定 left/top，只重新計算寬度收納。 */
  if (!tbVisible()) return;
  tbBar.style.left = ''; tbBar.style.top = '';
  if (!tbLayoutRAF) tbLayoutRAF = requestAnimationFrame(tbLayout);
}
function tbSync(){
  tbBar.classList.toggle('tb-hidden', !tbVisible());
  tbTip.classList.add('tb-hidden'); tbMoreHide();
  if (tbVisible()){ tbPositionNow(); tbUpdateActive(); }
}
function tbUpdateParagraphLabel(){
  const el = tbBar.querySelector('.tb-paragraph-label'); if (el) el.textContent = tbParagraphName();
}
function tbNativeHistoryContext(){
  const pe=$('#pe-text'), ae=document.activeElement;
  /* 工具列按鈕本身會奪走 focus；source mode 仍然由 srcview 擁有歷史。 */
  return !!settings.srcmode || ae===srcview || (pe && ae===pe);
}
function tbUpdateHistory(){
  if (!tbBar) return;
  const native=tbNativeHistoryContext();
  const u=tbBar.querySelector('.tb-btn[data-action="undo"]'), r=tbBar.querySelector('.tb-btn[data-action="redo"]');
  if (u) u.disabled=!native && !undoStack.length;
  if (r) r.disabled=!native && !redoStack.length;
}
function tbRunHistory(kind){
  const pe=$('#pe-text'), ae=document.activeElement;
  if (settings.srcmode){
    if (kind==='undo') cmdUndo(); else cmdRedo();
    tbUpdateHistory(); return;
  }
  if (pe && ae===pe){
    try { ae.focus(); if (document.execCommand && document.execCommand(kind)){ tbUpdateHistory(); return; } } catch(_){ }
  }
  if (kind==='undo') cmdUndo(); else cmdRedo();
  tbUpdateHistory();
}
function tbUpdateActive(){
  if (!tbVisible()) return;
  let st = { bold:false, italic:false, underline:false, strike:false, mark:false, code:false, link:false };
  const sel = getSelection(), n = sel && sel.rangeCount ? sel.anchorNode : null;
  const host = n ? (n.nodeType === 1 ? n : n.parentElement) : null;
  if (host && editor.contains(host)){
    const tags = []; let insidePre = false, cur = host;
    while (cur && cur !== editor){
      const tg = (cur.tagName || '').toLowerCase(); if (tg) tags.push(tg);
      if (tg === 'pre') insidePre = true; cur = cur.parentElement;
    }
    st = tbActiveSet(tags, insidePre);
  }
  Object.keys(st).forEach(k => {
    tbBar.querySelectorAll('.tb-btn[data-action="' + k + '"]').forEach(b => b.classList.toggle('active', !!st[k]));
  });
  tbUpdateParagraphLabel();
  tbUpdateHistory();
}
function tbTipShow(btn){
  const txt = TT(btn.getAttribute('data-zh') || '', btn.getAttribute('data-en') || '');
  if (!txt) return;
  tbTip.textContent = txt; tbTip.classList.remove('tb-hidden');
  const br = btn.getBoundingClientRect(), tr = tbTip.getBoundingClientRect();
  let left = Math.round(br.left + (br.width - tr.width) / 2);
  left = Math.max(6, Math.min(left, innerWidth - tr.width - 6));
  tbTip.style.left = left + 'px'; tbTip.style.top = Math.round(br.bottom + 6) + 'px';
}
function tbAppendMenuItem(item){
  const d = document.createElement('div'); d.className = 'tbm-item';
  if (item.checked != null){ d.setAttribute('role','menuitemradio'); d.setAttribute('aria-checked', item.checked ? 'true' : 'false'); }
  else d.setAttribute('role','menuitem');
  const l = document.createElement('span'); l.textContent = TT(item.zh, item.en);
  const k = document.createElement('span'); k.className = 'tbm-k'; k.textContent = item.k || '';
  d.appendChild(l); d.appendChild(k);
  d.addEventListener('mousedown', e => {
    e.preventDefault(); e.stopPropagation(); tbMoreHide();
    item.run(); tbUpdateActive();
  });
  tbMore.appendChild(d); return d;
}
function tbPopupPlace(anchorBtn){
  tbMore.classList.remove('tb-hidden');
  const br = anchorBtn.getBoundingClientRect(), mr = tbMore.getBoundingClientRect();
  let left = Math.round(br.left + (br.width - mr.width) / 2);
  if (left + mr.width > innerWidth - 8) left = innerWidth - 8 - mr.width;
  if (left < 8) left = 8;
  let top = Math.round(br.bottom + 7);
  if (top + mr.height > innerHeight - 8) top = Math.max(8, Math.round(br.top - mr.height - 7));
  tbMore.style.left = left + 'px'; tbMore.style.top = top + 'px';
}
function tbParagraphShow(anchorBtn){
  const raw = noIndentParts(tbCurrentRaw()).body, m = raw.match(/^(#{1,6})\s+/), current = m ? Number(m[1].length) : 0;
  tbMore.textContent = ''; tbMore.setAttribute('role','menu');
  const head = document.createElement('div'); head.className = 'tbm-section'; head.textContent = TT('段落樣式','Paragraph style'); tbMore.appendChild(head);
  [{n:0,zh:'正文段落',en:'Body paragraph'},...Array.from({length:6},(_,i)=>({n:i+1,zh:'標題 '+(i+1),en:'Heading '+(i+1)}))]
    .forEach(x => tbAppendMenuItem({ zh:x.zh, en:x.en, checked:current===x.n, run:cmdHeading(x.n) }));
  tbPopupPlace(anchorBtn);
}
function toolbarCustomizerHTML(){
  /* 1.2.7（M32）：改成三欄的緊湊清單：勾選框、圖示、名稱、快捷鍵。以前每項一張大卡片，
     每張都重複寫「可從頂部工具列直接使用」。 */
  normalizeToolbarItems();
  return `<div class="ekt"><h2>${TT('自訂工具列','Customize toolbar')}</h2>
    <p class="ekt-lead">${TT('勾選要放在格式工具列上的按鈕。視窗太窄時，放不下的會收進第二排最後的「⋯」。','Check the buttons to show on the format toolbar. When the window is narrow, the ones that do not fit go into “⋯” at the end of the second row.')}</p>
    <div class="ekt-grid" id="tb-custom-list">${TB_CATALOG.map(t => `<label class="ekt-item"><input type="checkbox" data-tb-custom="${t.id}" ${settings.toolbarItems.includes(t.id)?'checked':''}><span class="ekt-icon" aria-hidden="true">${t.id === 'paragraph' ? '<span class="ekt-text">¶</span>' : t.html}</span><span class="ekt-name">${TT(t.zh,t.en)}</span>${t.k ? `<kbd class="ekt-key">${t.k}</kbd>` : ''}</label>`).join('')}</div>
    <div class="ekt-foot"><button class="ekt-link" id="tb-custom-reset" type="button">${TT('全部勾回預設','Restore default')}</button></div></div>`;
}
function showToolbarCustomizer(){
  showModal(toolbarCustomizerHTML());
  const box = $('#modal');
  const commit = () => {
    settings.toolbarItems = [...box.querySelectorAll('[data-tb-custom]:checked')].map(x => x.dataset.tbCustom);
    normalizeToolbarItems(); tbBuild(); tbSync(); persist();
  };
  box.querySelectorAll('[data-tb-custom]').forEach(x => x.addEventListener('change', commit));
  const rst = $('#tb-custom-reset'); if (rst) rst.addEventListener('click', () => {
    settings.toolbarItems = [...TB_DEFAULT_ITEMS];
    box.querySelectorAll('[data-tb-custom]').forEach(x => { x.checked = true; });
    tbBuild(); tbSync(); persist();
  });
}
function cmdToolbar(){ settings.showToolbar = !settings.showToolbar; tbSync(); persist(); buildMenubar(); }
tbBar.addEventListener('mousedown', e => {
  const btn = e.target && e.target.closest ? e.target.closest('.tb-btn[data-action]') : null;
  if (!btn) return;
  e.preventDefault(); e.stopPropagation();
  if (btn.disabled) return;
  const id = btn.dataset.action;
  if (id === 'undo' || id === 'redo'){ tbMoreHide(); tbRunHistory(id); return; }
  if (id === 'paragraph'){
    if (!tbMore.classList.contains('tb-hidden') && tbMore.dataset.kind === 'paragraph') tbMoreHide();
    else { tbOverflowHide(); tbMore.dataset.kind = 'paragraph'; tbParagraphShow(btn); }
    return;
  }
  if (id === 'more'){
    /* 滑鼠：移過去就已經打開，按下去不要反而關掉；觸控／筆：點一下開、再點一下關。 */
    if (tbOverflowOpen() && tbLastPointer !== 'mouse') tbOverflowHide(); else tbOverflowShow();
    return;
  }
  if (id === 'customize'){ tbMoreHide(); showToolbarCustomizer(); return; }
  const tool = tbTool(id); tbMoreHide();
  if (tool && tool.run) tool.run();
  tbUpdateActive();
});
tbBar.addEventListener('mouseover', e => { const b = e.target && e.target.closest ? e.target.closest('.tb-btn[data-action]') : null; if (b && !b.classList.contains('tb-overflow-btn')) tbTipShow(b); else tbTip.classList.add('tb-hidden'); });
let tbLastPointer = 'mouse';
tbBar.addEventListener('pointerdown', e => { tbLastPointer = e.pointerType || 'mouse'; }, true);
tbBar.addEventListener('pointerover', e => {
  if (e.pointerType !== 'mouse' || !e.target || !e.target.closest) return;
  if (e.target.closest('.tb-overflow-btn')){ if (tbOverflowOpen()) { clearTimeout(tbOverflowTimer); tbOverflowTimer = 0; } else tbOverflowShow(); }
  else if (e.target.closest('.tb-overflow-pop')){ clearTimeout(tbOverflowTimer); tbOverflowTimer = 0; }
  else if (tbOverflowOpen()) tbOverflowLater();
});
tbBar.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && tbOverflowOpen()) tbOverflowLater(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && tbOverflowOpen()) tbOverflowHide(); });
tbBar.addEventListener('mouseleave', () => tbTip.classList.add('tb-hidden'));
document.addEventListener('selectionchange', () => { if (tbVisible()) tbUpdateActive(); });
window.addEventListener('resize', tbPositionNow);
if (typeof ResizeObserver === 'function'){
  const tbWrapEl = $('#editor-wrap');
  if (tbWrapEl) new ResizeObserver(() => {
    if (!tbVisible() || !tbBar.isConnected) return;
    if (Math.round(tbBar.getBoundingClientRect().width) === tbLayoutW) return;   // 只有高度變了：不必重排
    tbLayout();
  }).observe(tbWrapEl);
}
document.addEventListener('mousedown', e => {
  if ((!tbMore.classList.contains('tb-hidden') || tbOverflowOpen()) && !tbMore.contains(e.target) && !tbBar.contains(e.target)) tbMoreHide();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !tbMore.classList.contains('tb-hidden')) tbMoreHide(); });
tbSync();

function buildMenubar(){
  const bar = $('#menubar');
  bar.querySelectorAll('.mb-item').forEach(el => el.remove());
  const right = $('#mb-right');
  menuDefs().forEach((def, i) => {
    const item = document.createElement('div');
    item.className = 'mb-item' + (def.app ? ' appname' : '');
    item.textContent = def.label;
    item.addEventListener('mousedown', e => e.preventDefault());   // 保留編輯器 selection
    item.addEventListener('click', e => { e.stopPropagation(); toggleMenu(item, i); });
    item.addEventListener('mouseenter', () => { if (openMenuEl && openMenuEl !== item) toggleMenu(item, i); });
    bar.insertBefore(item, right);
  });
}
/* CP17:toggleMenu 接受選單索引(而非建立時擷取的 def)。病因 — 舊版把 def 在
   buildMenubar 當下擷取進閉包,check 布林值也在那一刻定死;之後 setTheme /
   toggleDark / 恢復原廠都沒有重建選單 → 下拉的勾選永遠停在啟動時的狀態。
   改為每次開啟即時 menuDefs()[idx],勾選一律反映當前 settings。 */
function toggleMenu(item, idx){
  const wasOpen = item.classList.contains('open');
  closeMenus();
  if (wasOpen) return;
  const def = menuDefs()[idx];
  item.classList.add('open');
  openMenuEl = item;
  const dd = document.createElement('div');
  dd.className = 'dropdown';
  dd.addEventListener('mousedown', e => e.preventDefault());
  def.items.forEach(it => {
    if (it.sep){ dd.appendChild(Object.assign(document.createElement('div'), { className:'dd-sep' })); return; }
    const row = document.createElement('div');
    row.className = 'dd-item';
    row.innerHTML = (it.check ? '<span class="dd-check">✓</span>' : '') +
                    `<span>${it.t}</span>` + (it.key ? `<span class="dd-key">${it.key}</span>` : '');
    row.addEventListener('click', () => { closeMenus(); it.cmd(); });
    dd.appendChild(row);
  });
  document.body.appendChild(dd);
  const r = item.getBoundingClientRect();
  dd.style.left = Math.min(r.left, innerWidth - dd.offsetWidth - 8) + 'px';
  dd.style.top = r.bottom + 4 + 'px';
}
function closeMenus(){
  $$('.dropdown').forEach(d => d.remove());
  $$('.mb-item.open').forEach(m => m.classList.remove('open'));
  openMenuEl = null;
}
document.addEventListener('click', e => { if (!e.target.closest('#menubar')) closeMenus(); });

/* ---------- §10 側邊欄 ---------- */
/* CP118:側邊欄頁籤的單一同步入口。
   sidebarTab 會進持久化設定；啟動／還原備份時 DOM 仍保留 HTML 初始的 files.on，
   舊版 renderSidebar() 只畫內容、不校正頁籤樣式，因而可能出現「檔案」亮著但內容是大綱。
   每次渲染先消毒狀態並同步三個頁籤，再依同一個 tab 畫面板，避免標籤與內容分離。 */
const SIDEBAR_TABS = ['files', 'outline', 'search'];
function syncSidebarTabState(){
  const tab = SIDEBAR_TABS.includes(settings.sidebarTab) ? settings.sidebarTab : 'files';
  settings.sidebarTab = tab;
  $$('.sb-tab').forEach(t => t.classList.toggle('on', t.dataset.tab === tab));
  return tab;
}
function switchTab(tab){
  settings.sidebarTab = tab;
  renderSidebar();
}
$$('.sb-tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

/* ===== CP63:快速開檔(⌘P)— 檔名模糊切換 ===== */
/* 設計:沿 CP56 acFuzzyScore 評分(前綴 0 → 內含 100+位 → 子序列 200+間隙;blk2 頂層函式,runtime 跨塊呼叫安全),
   qoRank 為快開專用薄變體 — 不套 acRank「唯一候選=完整輸入→回空」的補全禮讓(快開打完整檔名正是要 Enter 切換)。
   面板走 CP59 單例四件套:body 層 fixed、點外(document 捕獲 mousedown)/Esc/resetEditModes 全關;
   input keydown 沿 pe-text 式 stopPropagation+imeKey(CP42)。選檔走 switchFile(同 id 內建 no-op)。 */
const qoState = { hits: [], sel: 0 };
function qoRank(names, q){
  const tok = String(q == null ? '' : q);
  const arr = names || [];
  if (!tok.length){
    const all = [];
    for (let i = 0; i < arr.length; i++) all.push({ i: i, name: arr[i] });
    return all;
  }
  const scored = [];
  for (let i = 0; i < arr.length; i++){
    const sc = acFuzzyScore(arr[i], tok);
    if (sc === null) continue;
    scored.push({ i: i, name: arr[i], sc: sc });
  }
  scored.sort(function(a, b){
    if (a.sc !== b.sc) return a.sc - b.sc;
    const an = String(a.name).toLowerCase(), bn = String(b.name).toLowerCase();
    return an < bn ? -1 : an > bn ? 1 : 0;
  });
  return scored.map(function(x){ return { i: x.i, name: x.name }; });
}
function qoEl(){ return document.getElementById('qo-panel'); }
function qoClose(){
  const p = qoEl();
  if (p) p.style.display = 'none';
}
function qoOpen(){
  let p = qoEl();
  if (!p){
    p = document.createElement('div');
    p.id = 'qo-panel';
    p.innerHTML = '<input id="qo-input" type="text" spellcheck="false" placeholder="' +
      TT('輸入檔名，Enter 切換','Type a file name, Enter to switch') + '" /><div id="qo-list"></div>';
    document.body.appendChild(p);
    const inp = document.getElementById('qo-input');
    inp.addEventListener('input', () => { qoState.sel = 0; qoRefresh(); });
    inp.addEventListener('keydown', e => {
      e.stopPropagation();                              // 沿 pe-text 式:不觸發全域快捷鍵
      if (imeKey(e)) return;                            // CP42:組字中按鍵屬輸入法
      if (e.key === 'Escape'){ e.preventDefault(); qoClose(); editor.focus(); return; }
      if (e.key === 'Enter'){ e.preventDefault(); qoPick(); return; }
      if (e.key === 'ArrowDown'){ e.preventDefault(); qoNav(1); return; }
      if (e.key === 'ArrowUp'){ e.preventDefault(); qoNav(-1); return; }
    });
    document.addEventListener('mousedown', e => {       // 點外即關(捕獲,同 CP59)
      const el = qoEl();
      if (el && el.style.display !== 'none' && !el.contains(e.target)) qoClose();
    }, true);
  }
  p.style.display = 'block';
  const inp = document.getElementById('qo-input');
  inp.value = '';
  qoState.sel = 0;
  qoRefresh();
  inp.focus();
}
function qoRefresh(){
  const inp = document.getElementById('qo-input');
  const ranked = qoRank(files.map(f => f.name), inp ? inp.value : '');
  qoState.hits = ranked.map(r => ({ fid: files[r.i].id, name: r.name }));
  if (qoState.sel >= qoState.hits.length) qoState.sel = Math.max(0, qoState.hits.length - 1);
  const list = document.getElementById('qo-list');
  if (!list) return;
  list.innerHTML = '';
  if (!qoState.hits.length){
    list.innerHTML = '<div class="qo-empty">' + TT('沒有符合的檔案','No matching files') + '</div>';
    return;
  }
  qoState.hits.forEach((h, k) => {
    const row = document.createElement('div');
    row.className = 'qo-row' + (k === qoState.sel ? ' on' : '') + (h.fid === activeId ? ' cur' : '');
    row.textContent = h.name;
    row.addEventListener('mousedown', e => e.preventDefault());   // 保 input 焦點
    row.addEventListener('click', () => { qoState.sel = k; qoPick(); });
    list.appendChild(row);
  });
}
function qoNav(d){
  if (!qoState.hits.length) return;
  qoState.sel = (qoState.sel + d + qoState.hits.length) % qoState.hits.length;
  qoRefresh();
  const on = document.querySelector('#qo-list .qo-row.on');
  if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
}
function qoPick(){
  const h = qoState.hits[qoState.sel];
  if (!h) return;
  qoClose();
  if (!files.some(f => f.id === h.fid)){ toast(TT('檔案已不存在','File no longer exists')); return; }
  switchFile(h.fid);
  editor.focus();
}

/* ===== CP61:全文件搜尋(跨檔案)— 側邊欄第三分頁 ===== */
/* 設計:搜尋核心純函式化(fsSearch/fsExcerpt,跳脫自含不外依 escReg → 測試抽取自足)供 t22;
   面板骨架單建(renderSidebar 對 search 分頁早退,不清 innerHTML → 輸入焦點/值不流失),
   結果容器 #fs-results 獨立重繪;編輯節流(uiTimer)與輸入消抖(250ms)收斂到 fsRun。
   跳轉沿 gotoHit 四步式:deactivate → activate → setCaretRange → find-focus 閃示;跨檔先 switchFile。 */
const fsState = { q:'', cs:false, hits:[], timer:null };
function fsSearch(fileArr, q, cs, cap){
  const out = [];
  if (!q) return out;
  const lim = cap == null ? 500 : cap;
  const re = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), cs ? 'g' : 'gi');
  for (let fi = 0; fi < (fileArr || []).length; fi++){
    const f = fileArr[fi];
    const lines = String(f && f.content != null ? f.content : '').replace(/\r\n?/g, '\n').split('\n');
    for (let i = 0; i < lines.length; i++){
      const L = lines[i];
      const qm = L.match(/^(>\s?)<!--\s*noindent\s*-->[ \t]*/i);
      const lm = qm ? null : L.match(/^<!--\s*noindent\s*-->[ \t]*/i);
      const markerStart = qm ? qm[1].length : (lm ? 0 : -1);
      const markerLength = qm ? qm[0].length - qm[1].length : (lm ? lm[0].length : 0);
      const shown = markerLength
        ? L.slice(0, markerStart) + L.slice(markerStart + markerLength)
        : L;
      const toRaw = n => markerLength && n >= markerStart ? n + markerLength : n;
      let m; re.lastIndex = 0;
      while ((m = re.exec(shown))){
        out.push({ fid: f.id, name: f.name, i: i,
          start: toRaw(m.index), end: toRaw(m.index + m[0].length), line: L,
          displayLine: shown, displayStart: m.index, displayEnd: m.index + m[0].length });
        if (out.length >= lim) return out;
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    }
  }
  return out;
}
function fsExcerpt(line, start, end, preN, postN){
  const pn = preN == null ? 28 : preN, po = postN == null ? 44 : postN;
  const s = String(line == null ? '' : line);
  const a = Math.max(0, start - pn), b = Math.min(s.length, end + po);
  return { pre: (a > 0 ? '…' : '') + s.slice(a, start),
           hit: s.slice(start, end),
           post: s.slice(end, b) + (b < s.length ? '…' : '') };
}
function fsSnapshot(){
  return files.map(f => f.id === activeId ? { id: f.id, name: f.name, content: serialize() } : f);
}
function fsRun(){
  fsState.hits = fsSearch(fsSnapshot(), fsState.q, fsState.cs, 500);
  fsRenderResults();
}
function fsRenderResults(){
  const box = $('#fs-results');
  if (!box) return;
  box.innerHTML = '';
  if (!fsState.q){
    box.innerHTML = '<div class="sb-empty">' + TT('輸入關鍵字，搜尋所有檔案','Type to search across all files') + '</div>';
    return;
  }
  if (!fsState.hits.length){
    box.innerHTML = '<div class="sb-empty">' + TT('找不到「','No results for “') + escapeHtml(fsState.q) + TT('」','”') + '</div>';
    return;
  }
  let lastFid = null;
  fsState.hits.forEach(h => {
    if (h.fid !== lastFid){
      lastFid = h.fid;
      const head = document.createElement('div');
      head.className = 'fs-file';
      const n = fsState.hits.filter(x => x.fid === h.fid).length;
      head.innerHTML = '<span class="fs-fname">' + escapeHtml(h.name) + '</span><span class="fs-fcount">' + n + '</span>';
      box.appendChild(head);
    }
    const row = document.createElement('div');
    row.className = 'fs-hit';
    const ex = fsExcerpt(h.displayLine == null ? h.line : h.displayLine,
      h.displayStart == null ? h.start : h.displayStart,
      h.displayEnd == null ? h.end : h.displayEnd, 28, 44);
    row.innerHTML = escapeHtml(ex.pre) + '<mark>' + escapeHtml(ex.hit) + '</mark>' + escapeHtml(ex.post);
    row.title = TT('第 ','Line ') + (h.i + 1) + TT(' 行','');
    row.addEventListener('click', () => fsJump(h));
    box.appendChild(row);
  });
  if (fsState.hits.length >= 500){
    const cap = document.createElement('div');
    cap.className = 'sb-empty';
    cap.textContent = TT('僅顯示前 500 筆','Showing first 500 hits');
    box.appendChild(cap);
  }
}
function fsJump(h){
  if (settings.srcmode){ toast(TT('原始碼模式請先切回渲染模式','Switch back from source mode first')); return; }
  if (h.fid !== activeId){
    if (!files.some(f => f.id === h.fid)){ toast(TT('檔案已不存在','File no longer exists')); fsRun(); return; }
    switchFile(h.fid);
  }
  if (h.i >= blocks.length){ toast(TT('內容已變更，結果已重新整理','Content changed — results refreshed')); fsRun(); return; }
  const want = h.line.slice(h.start, h.end);
  const got = (blocks[h.i] || '').slice(h.start, h.end);
  const same = fsState.cs ? got === want : got.toLowerCase() === want.toLowerCase();
  if (!same){ toast(TT('內容已變更，結果已重新整理','Content changed — results refreshed')); fsRun(); return; }
  $$('.block.find-focus').forEach(b => b.classList.remove('find-focus'));
  deactivate(true);
  activate(h.i, h.start);
  const el = editor.children[h.i];
  if (el){
    setCaretRange(el, h.start, h.end);
    el.scrollIntoView({ block:'center', behavior:'smooth' });
    el.classList.add('find-focus');
    setTimeout(() => el.classList.remove('find-focus'), 900);
  }
}
function renderSearchPane(body){
  let pane = body.querySelector('#fs-pane');
  if (!pane){
    body.innerHTML = '<div id="fs-pane">' +
      '<div id="fs-head">' +
        '<input id="fs-input" type="text" spellcheck="false" placeholder="' + TT('搜尋所有檔案','Search all files') + '" />' +
        '<button id="fs-cs" title="' + TT('大小寫須相符','Match case') + '">Aa</button>' +
      '</div>' +
      '<div id="fs-results"></div></div>';
    const inp = $('#fs-input');
    inp.value = fsState.q;
    $('#fs-cs').classList.toggle('on', fsState.cs);
    inp.addEventListener('input', () => {
      fsState.q = inp.value;
      clearTimeout(fsState.timer);
      fsState.timer = setTimeout(fsRun, 250);
    });
    inp.addEventListener('keydown', e => {
      e.stopPropagation();                              // 沿 pe-text 式:面板內按鍵不觸發全域快捷鍵
      if (imeKey(e)) return;                            // CP42:組字中 Enter/Esc 屬輸入法
      if (e.key === 'Enter'){ e.preventDefault(); clearTimeout(fsState.timer); fsState.q = inp.value; fsRun(); }
      if (e.key === 'Escape'){ e.preventDefault(); inp.blur(); }
    });
    $('#fs-cs').addEventListener('click', () => {
      fsState.cs = !fsState.cs;
      $('#fs-cs').classList.toggle('on', fsState.cs);
      fsRun();
    });
  }
  if (fsState.q) fsRun(); else fsRenderResults();
}
function openGlobalSearch(){
  if (!settings.sidebar) cmdSidebar();
  switchTab('search');
  const inp = $('#fs-input');
  if (inp){ inp.focus(); inp.select(); }
}

function renderSidebar(){
  const tab = syncSidebarTabState();   /* CP118:頁籤樣式、設定值、面板內容共用同一狀態 */
  const body = $('#sb-body');
  if (tab === 'search'){ renderSearchPane(body); return; }   // CP61:搜尋面板自管骨架(保輸入焦點),不走 innerHTML 清空
  if (tab === 'outline'){ renderOutlinePane(body); return; }   /* CP65:大綱面板自管骨架(過濾框保輸入焦點),同 CP61 模式 */
  body.innerHTML = '';
  if (tab === 'files'){
    const appendRow = f => {
      const builtin = isBuiltinFile(f);
      const row = document.createElement('div');
      row.className = 'file-item' + (builtin ? ' builtin' : '') + (f.id === activeId ? ' on' : '');
      row.title = builtin ? TT('內建文件：可暫時編輯，切換文件後恢復目前版本原文','Built-in document: editable temporarily; restored after switching files') : '';
      row.innerHTML = `<svg class="fi-icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>` +
        `<span class="fi-name">${escapeHtml(f.name)}</span>` +
        (builtin ? '' : `<span class="fi-x" title="${TT('關閉檔案','Close file')}">×</span>`);
      row.addEventListener('click', e => {
        if (!builtin && e.target.classList.contains('fi-x')){ deleteFile(f.id); return; }
        switchFile(f.id);
      });
      if (!builtin) row.addEventListener('dblclick', () => renameFile(f.id));
      body.appendChild(row);
    };
    BUILTIN_DOC_ORDER.map(kind => files.find(f => isBuiltinFile(f) && f.builtinKind === kind)).filter(Boolean).forEach(appendRow);
    const sep = document.createElement('div');
    sep.className = 'file-separator';
    sep.setAttribute('aria-hidden', 'true');
    body.appendChild(sep);
    files.filter(f => !isBuiltinFile(f)).forEach(appendRow);
  }
}
/* CP65:大綱面板過濾框 — 骨架單建(沿 CP61 renderSearchPane 模式):
   過濾框常駐,不隨編輯節流(uiTimer 250ms)重繪銷毀 → 輸入焦點/值不流失;
   清單容器 #ol-list 獨立重繪。過濾語意=olFilter 純函式:
   文件序保持(大綱是文件結構非排名,刻意不沿 qoRank 分數排序),
   acFuzzyScore 判囊括(前綴/內含/跳字子序列,大小寫不敏感;blk2 頂層,runtime 跨區塊呼叫同 CP63)。
   Enter=跳第一筆命中、Esc=清空(空值再按=離開框);長論文快速跳章節用。 */
const olState = { q:'', fold:new Map() };   /* CP76:fold=Map(檔案id→摺疊鍵Set),工作階段態(重開歸零=全展開),不入 settings/serialize */
function olFoldSet(){
  const id = activeId == null ? '__none' : activeId;
  let s = olState.fold.get(id);
  if (!s){ s = new Set(); olState.fold.set(id, s); }
  return s;
}
function olFilter(titles, q){
  const tok = String(q == null ? '' : q).trim();
  const arr = titles || [];
  const out = [];
  if (!tok.length){
    for (let i = 0; i < arr.length; i++) out.push(i);
    return out;
  }
  for (let i = 0; i < arr.length; i++){
    if (acFuzzyScore(arr[i], tok) !== null) out.push(i);
  }
  return out;
}
/* CP66:大綱精準化 — 兩個正確性缺陷的修復:
   (a) 舊掃描 serialize().split 逐行套 RE.h,不懂圍欄 → 碼塊內「# 註解」誤入大綱(點擊死連結);
   (b) 舊跳轉 blocks.findIndex 首中即停 → 各章同名小節(如「實驗設置」)永遠跳第一個。
   olScanHeads:行掃描 + 圍欄狀態機。圍欄開/關判準與 splitToBlocks 逐字同式
   (RE.fence 同款 regex;任何 fence 樣式行都切換狀態,``` 開 ~~~ 也關 — 刻意鏡射,
   確保大綱視角與 blocks 分割視角永遠一致)。同名標題記 ord(第幾次出現)。
   olFindHead:blocks 內找「第 ord 個」內文等於 title 的標題塊(標題塊必為單行,
   RE.h 同式無 /s 對多行塊天然不中)。regex 字面複製自 RE 表 — 抽取自足,方言凍結無漂移面。 */
function olScanHeads(md){
  const lines = String(md == null ? '' : md).replace(/\r\n?/g,'\n').split('\n');
  const FEN = /^(```|~~~)\s*([\w-]*)\s*$/;
  const out = [];
  const seen = {};
  let fence = false;
  for (let i = 0; i < lines.length; i++){
    if (FEN.test(lines[i])){ fence = !fence; continue; }
    if (fence) continue;
    const m = lines[i].match(/^(#{1,6})\s+(.*)$/);
    if (!m) continue;
    const ord = seen[m[2]] = (seen[m[2]] || 0) + 1;
    out.push({ n: m[1].length, t: m[2], ord: ord });
  }
  return out;
}
function olFindHead(blockArr, title, ord){
  const arr = blockArr || [];
  const want = ord || 1;
  let seen = 0;
  for (let i = 0; i < arr.length; i++){
    const m = String(arr[i]).match(/^(#{1,6})\s+(.*)$/);
    if (m && m[2] === title){
      seen++;
      if (seen === want) return i;
    }
  }
  return -1;
}
/* CP117:TW_THESIS／TW_THESIS2 大綱章節編號同步。
   olTwThesisNumbers 是純函式：只依渲染後標題的層級／前置章／附錄旗標，重播正文 CSS counter
   的 1、1.1、1.1.1 與 A、A.1、A.1.1；H4–H6 與 twthesis-fm 維持無號。
   olOutlineLabels 是 DOM 膠合層：一般 Markdown 完整沿用原始標題；只有 twthesis-thesis 讀取
   已被 renderBlockHTML 清掉手寫章號的 heading.textContent，避免「1.1 1.1 標題」重複。
   摺疊鍵與點擊定位仍使用 raw title+ord，不把顯示字串混入文件定位契約。 */
function olTwThesisNumbers(meta, enabled){
  const arr = meta || [], out = [];
  let ch = 0, app = 0, sec = 0, sub = 0, base = '';
  const alpha = n => { let x = n, r = ''; while (x > 0){ x--; r = String.fromCharCode(65 + (x % 26)) + r; x = Math.floor(x / 26); } return r || 'A'; };
  for (const h of arr){
    const n = Number(h && h.n) || 0;
    let num = '';
    if (n === 1){
      sec = 0; sub = 0;
      if (h && h.fm){ num = ''; }
      else if (h && h.app){ base = alpha(++app); num = base; }
      else { base = String(++ch); num = base; }
    } else if (n === 2){
      sec++; sub = 0;
      num = (base || String(ch)) + '.' + sec;
    } else if (n === 3){
      sub++;
      num = (base || String(ch)) + '.' + sec + '.' + sub;
    }
    out.push(enabled ? num : '');
  }
  return out;
}
function olOutlineLabels(heads, rawPlain){
  const arr = heads || [];
  const fallback = rawPlain || arr.map(h => String(h && h.t || ''));
  if (!document.body.classList.contains('twthesis-thesis')) return fallback.slice();
  const titles = [], meta = [];
  for (let i = 0; i < arr.length; i++){
    const h = arr[i];
    const bi = olFindHead(blocks, h.t, h.ord);
    const block = bi >= 0 ? editor.children[bi] : null;
    const heading = block ? block.querySelector(':scope > h' + h.n) : null;
    titles.push(heading ? heading.textContent.trim() : fallback[i]);
    meta.push({ n:h.n, fm:!!(heading && heading.classList.contains('twthesis-fm')),
                app:!!(block && block.classList.contains('twthesis-app')) });
  }
  const nums = olTwThesisNumbers(meta, document.body.classList.contains('papernum'));
  return titles.map((t, i) => nums[i] ? nums[i] + '\u2002' + t : t);
}
/* CP76:大綱摺疊 — 純函式(t37 抽取)。
   olSubtree(heads,k):回傳子樹排他終點 e(索引 k+1..e-1 = 連續更深層級,直到下一個同級/更高級);
   無子樹 → e===k+1;k 非法時迴圈條件不成立,自然回 k+1。
   olVisible(heads,folded):摺疊鍵=標題文+'\n'+ord(單行標題不可能含換行=天然分隔;
   鍵僅存於 Set 不入 DOM,無 CP16 控制字元風險)。被「可見且已摺疊」祖先覆蓋者剔除 —
   隱藏中的摺疊鍵不延伸 skipTo(深層子樹恆含於祖先子樹,跳過即涵蓋);
   鍵失效(改標題文/同名 ord 漂移)=不在集合=視為展開,無害。 */
function olSubtree(heads, k){
  const arr = heads || [];
  let e = k + 1;
  while (e < arr.length && arr[e] && arr[k] && arr[e].n > arr[k].n) e++;
  return e;
}
function olVisible(heads, folded){
  const arr = heads || [];
  const can = folded && typeof folded.has === 'function';
  const out = [];
  let skipTo = 0;
  for (let i = 0; i < arr.length; i++){
    if (i < skipTo) continue;
    out.push(i);
    if (can && folded.has(arr[i].t + '\n' + arr[i].ord)){
      const e = olSubtree(arr, i);
      if (e > skipTo) skipTo = e;
    }
  }
  return out;
}
function renderOutlinePane(body){
  let pane = body.querySelector('#ol-pane');
  if (!pane){
    body.innerHTML = '<div id="ol-pane">' +
      '<div id="ol-head">' +
        '<input id="ol-filter" type="text" spellcheck="false" placeholder="' + TT('過濾標題','Filter headings') + '" />' +
      '</div>' +
      '<div id="ol-list"></div></div>';
    const inp = $('#ol-filter');
    inp.value = olState.q;
    inp.addEventListener('input', () => { olState.q = inp.value; olRenderList(); });
    inp.addEventListener('keydown', e => {
      e.stopPropagation();                              /* 沿 pe-text 式:面板內按鍵不觸發全域快捷鍵 */
      if (imeKey(e)) return;                            /* CP42:組字中 Enter/Esc 屬輸入法 */
      if (e.key === 'Enter'){ e.preventDefault(); const first = $('#ol-list .outline-item'); if (first) first.click(); }
      if (e.key === 'Escape'){ e.preventDefault(); if (inp.value){ inp.value = ''; olState.q = ''; olRenderList(); } else inp.blur(); }
    });
  } else {
    $('#ol-filter').placeholder = TT('過濾標題','Filter headings');   /* setLang → renderSidebar 時刷新(骨架不重建,略優於 CP61 取捨) */
  }
  olRenderList();
}
/* CP124:側邊欄大綱是「導覽」，不是「開始編輯」。
   舊列點擊固定執行 scrollIntoView() 後 activate(i,0)；Paper／TW_THESIS 中 activate()
   會改道 openPaperEdit()。目標在視口下方時，面板依捲動前的離屏座標被放到畫面外，
   看似沒開；由後往前跳時，負座標會被 positionPePanel() 夾回畫面中央，因此浮動框
   突然可見，形成方向不對稱。現在論文模式只提交既有編輯並捲動，不再啟動目標段落；
   普通 Markdown 仍保留原本「跳轉後進入標題原始碼」的行為。 */
function olNavigateHeading(title, ord){
  /* CP128：大綱在原始碼模式直接定位目前 textarea，不再操作被隱藏的 #editor。 */
  if (settings.srcmode){
    const off = srcFindHeadingOffset(srcview.value, title, ord);
    if (off < 0) return false;
    srcJumpToOffset(off, true, true);
    return true;
  }
  if (mathEditEl) commitMathEdit();
  if (tableEdit) exitTableEdit();
  if (typeof peIndex !== 'undefined' && peIndex >= 0) commitPaperEdit();
  deactivate(true);
  const i = olFindHead(blocks, title, ord);          /* 提交可能重掛 blocks，之後才重算索引 */
  if (i < 0 || i >= blocks.length) return false;
  const el = editor.children[i];
  if (!el) return false;
  el.scrollIntoView({ block:'center', behavior:'smooth' });
  if (typeof inPaperMode === 'function' && inPaperMode() && !settings.srcmode){
    try { const sel = getSelection(); if (sel) sel.removeAllRanges(); } catch(_){}
    return true;
  }
  activate(i, 0);
  return true;
}
function olRenderList(){
  const list = $('#ol-list');
  if (!list) return;
  list.innerHTML = '';
  const heads = olScanHeads(settings.srcmode ? srcview.value : serialize());   /* CP128:原始碼未提交編輯也即時反映 */
  if (!heads.length){ list.innerHTML = '<div class="sb-empty">' + TT('本文件沒有標題<br>輸入 <b># 標題</b> 建立大綱','No headings yet<br>Type <b># Heading</b> to build an outline') + '</div>'; return; }
  const plain = heads.map(h => h.t.replace(/<\/?[a-zA-Z][^<>]*>/g,'').replace(/[*_`~=$]/g,''));
  const labels = olOutlineLabels(heads, plain);   /* CP117:TW_THESIS/TW_THESIS2 顯示正文同款編號；一般主題=plain 原樣 */
  const filtering = String(olState.q == null ? '' : olState.q).trim().length > 0;   /* 空白判準鏡 olFilter tok */
  const folded = olFoldSet();
  const keep = filtering ? olFilter(labels, olState.q)  /* CP117:可直接輸入 3.2 / A.1 搜尋顯示編號 */
                         : olVisible(heads, folded);    /* 無過濾:摺疊視圖(首標題恆可見=keep 恆非空) */
  if (!keep.length){ list.innerHTML = '<div class="sb-empty">' + TT('沒有符合的標題','No matching headings') + '</div>'; return; }
  keep.forEach(k => {
    const h = heads[k];
    const row = document.createElement('div');
    row.className = 'outline-item ol-' + h.n;
    row.dataset.hi = String(k); /* CP68：標題序，供目前章節高亮對位 */
    if (!filtering && olSubtree(heads, k) > k + 1){        /* CP76:有子樹才給箭頭;過濾清單=平面命中,無箭頭 */
      const key = h.t + '\n' + h.ord;
      const tg = document.createElement('span');
      tg.className = 'ol-tg';
      tg.textContent = folded.has(key) ? '\u25B8' : '\u25BE';
      tg.title = TT('摺疊/展開','Fold/unfold');
      tg.addEventListener('mousedown', e => e.preventDefault());   /* 不搶編輯焦點 */
      tg.addEventListener('click', e => {
        e.stopPropagation();                                       /* 不觸發列跳轉 */
        if (folded.has(key)) folded.delete(key); else folded.add(key);
        olRenderList();
      });
      row.classList.add('ol-has-tg');
      row.appendChild(tg);
    }
    row.appendChild(document.createTextNode(labels[k]));
    row.addEventListener('click', () => {
      olNavigateHeading(h.t, h.ord);               /* CP66/CP124:提交後重算同名標題序；論文模式只導覽 */
    });
    list.appendChild(row);
  });
  olSyncCur();
}
/* ---------- §10b 大綱目前章節高亮（CP68）----------
   純函式 olActive 供測試抽取（t29）；tops 預設遞增（文件序），首個超過 y 即斷。 */
function olActive(tops, y){
  if (!Array.isArray(tops)) return -1;
  let cur = -1;
  for (let i = 0; i < tops.length; i++){
    if (tops[i] <= y) cur = i; else break;
  }
  return cur;
}
function olSyncCur(){
  const list = $('#ol-list');
  if (!list || settings.sidebarTab !== 'outline') return;
  const rows = list.querySelectorAll('.outline-item');
  if (!rows.length) return;
  const base = scroller.getBoundingClientRect().top;
  const tops = [];
  for (let i = 0; i < blocks.length; i++){
    if (!/^(#{1,6})\s+(.*)$/.test(blocks[i])) continue;
    const el = editor.children[i];
    tops.push(el ? el.getBoundingClientRect().top - base : Infinity);
  }
  const cur = olActive(tops, Math.max(56, scroller.clientHeight * 0.3));
  let mark = -1;   /* CP76:目前標題被摺疊隱藏時,高亮最近可見祖先(可見列中 ≤ cur 的最後一列);過濾視圖維持僅精確命中 */
  rows.forEach(r => { if (+r.dataset.hi === cur) mark = cur; });
  if (mark < 0 && cur >= 0 && !String(olState.q == null ? '' : olState.q).trim().length){
    rows.forEach(r => { const hi = +r.dataset.hi; if (hi <= cur && hi > mark) mark = hi; });
  }
  rows.forEach(r => r.classList.toggle('ol-cur', mark >= 0 && +r.dataset.hi === mark));
}
let olScrollTick = false;
scroller.addEventListener('scroll', () => {
  if (olScrollTick) return;
  olScrollTick = true;
  requestAnimationFrame(() => { olScrollTick = false; olSyncCur(); });
}, { passive: true });
/* CP12 修:newFile 宣告於 Script 4,跨 <script> 無提升 — 直接引用會在載入期拋
   ReferenceError 使本行綁定失效(按鈕無反應);改箭頭函式延遲到點擊時解析。 */
$('#btn-newfile').addEventListener('click', () => newFile());

/* ---------- §11 狀態列 / 標題 ---------- */
function stripMD(md){
  return md
    .replace(/```[\s\S]*?```/g, m => m.replace(/```.*$/gm,''))
    .replace(/\$\$[\s\S]*?\$\$/g,' ')
    .replace(/\$[^$\n]{1,300}?\$/g,' ')
    .replace(/<!--[\s\S]*?-->/g,'')
    .replace(/<\/?[a-zA-Z][^<>\n]*>/g,'')
    .replace(/!\[[^\]]*\]\([^)]*\)/g,'')
    .replace(/\[([^\]]*)\]\([^)]*\)/g,'$1')
    .replace(/^#{1,6}\s+/gm,'').replace(/^>\s?/gm,'')
    .replace(/^\s*[-*+]\s+(\[[ xX]\]\s+)?/gm,'').replace(/^\s*\d+\.\s+/gm,'')
    .replace(/[*_~=`|]/g,'');
}
function cntText(text){
  const s = String(text == null ? '' : text);
  const cjk = (s.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
  const words = (s.replace(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g,' ')
                     .match(/[A-Za-z0-9_'-]+/g) || []).length;
  return { n: cjk + words, chars: s.replace(/\s/g,'').length };
}
function updateCounts(){
  if (selCountOn) return; /* CP69：選取統計顯示中勿覆寫（清除選取時 selCountSync 回呼本函式復原） */
  const c = cntText(stripMD(serialize()));
  $('#word-count').textContent = isEN()
    ? `${c.n} words · ${c.chars} chars`
    : `${c.n} 字 · ${c.chars} 字元`;
}
/* ---------- §11b 選取範圍字數統計（CP69）----------
   純函式 cntText 供測試抽取（t30）；計數方言與整份統計同源同式。
   selectionchange 節流 150ms；只讀選取、只寫 #word-count，不碰編輯態。 */
let selCountOn = false, selCountTimer = null;
function selCountSync(){
  const sel = getSelection();
  let t = '';
  if (sel && !sel.isCollapsed && sel.rangeCount){
    const r = sel.getRangeAt(0);
    if (editor.contains(r.commonAncestorContainer)) t = sel.toString();
  }
  if (t){
    const c = cntText(t);
    selCountOn = true;
    $('#word-count').textContent = isEN()
      ? `${c.n} words · ${c.chars} chars selected`
      : `已選 ${c.n} 字 · ${c.chars} 字元`;
  } else if (selCountOn){
    selCountOn = false;
    updateCounts();
  }
}
document.addEventListener('selectionchange', () => {
  clearTimeout(selCountTimer);
  selCountTimer = setTimeout(selCountSync, 150);
});
function updateBlockInfo(){
  const names = isEN()
    ? { p:'Paragraph', h:'Heading', quote:'Quote', ul:'List', ol:'List', task:'Task',
        code:'Code', table:'Table', math:'Math', hr:'Divider', empty:'Blank' }
    : { p:'段落', h:'標題', quote:'引言', ul:'清單', ol:'清單', task:'任務',
        code:'程式碼', table:'表格', math:'公式', hr:'分隔線', empty:'空白' };
  const cur = TT('目前：','Current: ');
  $('#block-info').textContent =
    tableEdit ? cur + TT('表格（編輯中）','Table (editing)') :
    activeIndex >= 0 ? cur + (names[blockType(blocks[activeIndex] ?? '')] || '') : '';
}
function updateTitle(){
  const f = activeFile();
  $('#doc-name').textContent = f ? f.name : '未命名.md';
  document.title = (f ? f.name : 'EKdelta') + ' — EKdelta';
}
function markDirty(){
  document.body.classList.add('dirty');
  const s = $('#save-state');
  if (isBuiltinFile(activeFile())){
    s.textContent = TT('暫時修改','Temporary edit'); s.className = 'unsaved';
  } else {
    s.textContent = TT('未儲存','Unsaved'); s.className = 'unsaved';
  }
}
function markSaved(){
  document.body.classList.remove('dirty');
  const s = $('#save-state'); s.textContent = TT('已儲存','Saved'); s.className = 'saved';
}
/* CP14:語言切換時依目前狀態重刷儲存標籤 */
function markSavedState(){
  document.body.classList.contains('dirty') ? markDirty() : markSaved();
}

/* 編輯後的統一排程:計數/大綱節流、自動儲存 */
function onEdited(skipDirty){
  schedulePaginate();                     // 論文模式:內容變動 → 重新分頁(CP6)
  losslessScheduleSync('edit');            // CP98:以最小差異同步 exact raw 影子核心
  if (!skipDirty) markDirty();
  clearTimeout(uiTimer);
  uiTimer = setTimeout(() => { updateCounts(); if (settings.sidebarTab==='outline' || settings.sidebarTab==='search') renderSidebar(); /* CP61:搜尋結果隨編輯刷新 */ if (findOpen()) fhApply(); /* CP67:尋找高亮隨編輯刷新 */ updateBlockInfo(); }, 250);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 1200);
}
function scheduleUI(){ clearTimeout(uiTimer); uiTimer = setTimeout(updateBlockInfo, 60); }
