
/* ============================================================
   CP162C2 — Markdown-compatible container editing layer
   Grammar: container-aware Markdown block parsing.
   Canonical Markdown remains blocks[] / LosslessMarkdownDocument.
   CP162C2 keeps CP162C1 selective projection, then follows original
   Markdown node split/upstream behavior for Enter, Backspace and Delete
   inside loose list/blockquote containers. Exact raw remains authoritative.
   ============================================================ */
(() => {
'use strict';
if (window.__CP162_CONTAINER_AST__) return;

const CP162 = Object.freeze({
  checkpoint:'CP162C2', version:'1.0.7', build:'CP162C2-EKDETA-CONTAINER-EDIT-TRANSACTIONS',
  policy:'ekdeta-original-container-edit-transactions-with-paper-twthesis-revtex-isolation'
});
const CP162_NODE_TYPES = new Set(['document','list','list_item','blockquote','alert','paragraph','blank','heading','setext_heading','fence','indented_code','table','html_block','meta_block','toc','definition','atomic','hr']);
let cp162Ast = null;
let cp162Projection = [];
let cp162DetachedProjection = new Map();
let cp162Applying = false;
let cp162Suspending = false;
let cp162Frame = 0;
let cp162NodeSeq = 0;
let cp162LastBlocks = [];
let cp162LastStats = null;
let cp162LastDirtyWindow = null;
let cp162LastUpdate = null;
let cp162FallbackCount = 0;
let cp162OrigListCompatApply = typeof listCompatApply === 'function' ? listCompatApply : null;

function cp162Clamp(n,a,b){ n=Number.isFinite(+n)?+n:a; return Math.max(a,Math.min(b,n)); }
function cp162IndentColumns(s){
  let n=0; for(const ch of String(s==null?'':s)) n += ch==='\t' ? 2 : 1; return n;
}
function cp162CharsForColumns(s, columns){
  const raw=String(s==null?'':s); let cols=0,i=0;
  while(i<raw.length && cols<columns && (raw[i]===' '||raw[i]==='\t')){ cols += raw[i]==='\t'?2:1; i++; }
  return i;
}
function cp162Leading(text){
  const m=String(text==null?'':text).match(/^([ \t]*)/); const raw=m?m[1]:'';
  return {raw,chars:raw.length,columns:cp162IndentColumns(raw)};
}
function cp162Doc(){ try{return typeof losslessActiveDoc==='function'?losslessActiveDoc():null;}catch(_){return null;} }
function cp162RawOffset(norm){
  const d=cp162Doc(); return d&&typeof d.rawOffsetFromNormalized==='function'?d.rawOffsetFromNormalized(norm):norm;
}
function cp162ExactSlice(a,b){
  const d=cp162Doc(); if(!d||typeof d.serialize!=='function')return null;
  return d.serialize().slice(cp162RawOffset(a),cp162RawOffset(b));
}
function cp162BuildRecords(sourceBlocks){
  const out=[]; let norm=0;
  for(let i=0;i<sourceBlocks.length;i++){
    const raw=String(sourceBlocks[i]==null?'':sourceBlocks[i]);
    out.push({index:i,raw,normStart:norm,normEnd:norm+raw.length});
    norm += raw.length + (i+1<sourceBlocks.length?1:0);
  }
  return {records:out,normalizedLength:norm};
}
function cp162Virtual(record, sliceStart=0, sliceEnd=null){
  const end=sliceEnd==null?record.raw.length:cp162Clamp(sliceEnd,sliceStart,record.raw.length);
  const start=cp162Clamp(sliceStart,0,end);
  return {record,sliceStart:start,sliceEnd:end,text:record.raw.slice(start,end)};
}
function cp162VirtualLines(record){
  const raw=String(record&&record.raw!=null?record.raw:'');const out=[];let start=0;
  for(let i=0;i<=raw.length;i++)if(i===raw.length||raw[i]==='\n'){out.push(cp162Virtual(record,start,i));start=i+1;}
  return out;
}
function cp162StripChars(line, count){
  return cp162Virtual(line.record,Math.min(line.sliceEnd,line.sliceStart+Math.max(0,count)),line.sliceEnd);
}
function cp162StripIndentColumns(line, columns){
  const n=cp162CharsForColumns(line.text,columns); return cp162StripChars(line,n);
}
function cp162LineSegment(line){
  const ns=line.record.normStart+line.sliceStart, ne=line.record.normStart+line.sliceEnd;
  return {blockIndex:line.record.index,localStart:line.sliceStart,localEnd:line.sliceEnd,
          normalizedStart:ns,normalizedEnd:ne,rawStart:cp162RawOffset(ns),rawEnd:cp162RawOffset(ne)};
}
function cp162Range(lines){
  const segs=(lines||[]).map(cp162LineSegment);
  if(!segs.length)return {normalizedStart:0,normalizedEnd:0,rawStart:cp162RawOffset(0),rawEnd:cp162RawOffset(0),segments:[]};
  return {normalizedStart:segs[0].normalizedStart,normalizedEnd:segs[segs.length-1].normalizedEnd,
          rawStart:segs[0].rawStart,rawEnd:segs[segs.length-1].rawEnd,segments:segs};
}
function cp162Node(type, lines, extra){
  const src=cp162Range(lines), idx=src.segments.map(x=>x.blockIndex);
  return Object.assign({id:'cp162n'+(++cp162NodeSeq),type,source:src,content:src,
    blockRange:{start:idx.length?Math.min(...idx):-1,end:idx.length?Math.max(...idx):-1},children:[],lines:lines||[]},extra||{});
}
function cp162SetContent(node, lines){ node.content=cp162Range(lines||[]); return node; }
function cp162MatchList(text){
  const raw=String(text==null?'':text); let m;
  m=raw.match(/^([ \t]*)([-+*])([ \t]+)\[([ xX])\]([ \t]+)(.*)$/);
  if(m){
    const prefix=m[1]+m[2]+m[3]+'['+m[4]+']'+m[5];
    return {kind:'ul',task:true,checked:m[4].toLowerCase()==='x',indent:m[1],indentColumns:cp162IndentColumns(m[1]),
      marker:m[2],number:null,prefix,prefixChars:prefix.length,content:m[6],contentColumns:cp162IndentColumns(prefix)};
  }
  m=raw.match(/^([ \t]*)([-+*])([ \t]+)(.*)$/);
  if(m){ const prefix=m[1]+m[2]+m[3]; return {kind:'ul',task:false,checked:false,indent:m[1],indentColumns:cp162IndentColumns(m[1]),
      marker:m[2],number:null,prefix,prefixChars:prefix.length,content:m[4],contentColumns:cp162IndentColumns(prefix)}; }
  /* Ordered-list grammar: ordered markers accept both `.` and `)`. */
  m=raw.match(/^([ \t]*)(\d+)([.)])([ \t]+)(.*)$/);
  if(m){ const prefix=m[1]+m[2]+m[3]+m[4]; return {kind:'ol',task:false,checked:false,indent:m[1],indentColumns:cp162IndentColumns(m[1]),
      marker:m[3],number:Math.max(1,Number(m[2])||1),prefix,prefixChars:prefix.length,content:m[5],contentColumns:cp162IndentColumns(prefix)}; }
  return null;
}
function cp162MatchQuote(text){
  const m=String(text==null?'':text).match(/^([ \t]{0,3}>[ \t]?)(.*)$/); return m?{prefix:m[1],prefixChars:m[1].length,content:m[2]}:null;
}
function cp162MatchHeading(text, allowLoose){
  const raw=String(text==null?'':text); let m=raw.match(/^([ \t]*)(#{1,6})([ \t]+)([\s\S]*?)(?:[ \t]+#+[ \t]*)?$/);
  if(m)return {level:m[2].length,markerChars:m[1].length+m[2].length+m[3].length,content:m[4],loose:false};
  if(allowLoose&&(m=raw.match(/^([ \t]*)(#{1,6})(?=[^#\s])([\s\S]*?)(?:[ \t]+#+[ \t]*)?$/)))
    return {level:m[2].length,markerChars:m[1].length+m[2].length,content:m[3],loose:true};
  return null;
}
function cp162MatchFence(text){
  const m=String(text==null?'':text).match(/^([ \t]{0,3})(`{3,}|~{3,})[ \t]*([^\s`]*)[^\n]*$/);
  return m?{indent:m[1],run:m[2],char:m[2][0],length:m[2].length,lang:m[3]||'',prefixChars:m[1].length}:null;
}
function cp162FenceClose(text, open){
  const rx=new RegExp('^[ \\t]{0,3}'+(open.char==='`'?'`':'~')+'{'+open.length+',}[ \\t]*$'); return rx.test(String(text));
}
function cp162IsBlank(line){return !line||/^\s*$/.test(line.text);}
function cp162IsHr(text){return /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(String(text));}
function cp162MatchSetext(text){
  const m=String(text==null?'':text).match(/^ *(=|-){2,}[\s\u00A0]*$/);return m?{level:m[1]==='='?1:2}:null;
}
function cp162IndentedPrefix(text){
  const m=String(text==null?'':text).match(/^( {4}|(?: {0,3}\t))/);return m?{prefix:m[1],prefixChars:m[1].length}:null;
}
function cp162MatchIndentedCode(text){
  const raw=String(text==null?'':text),p=cp162IndentedPrefix(raw);return p&&raw.slice(p.prefixChars).trim()?{...p,content:raw.slice(p.prefixChars)}:null;
}
function cp162IsAtomic(line){return !!(line&&line.record.raw.includes('\n'));
}
function cp162Explicit(line,ctx){
  if(!line||cp162IsBlank(line))return true;
  if(cp162IsAtomic(line))return true;
  const t=line.text;
  return !!(cp162MatchList(t)||cp162MatchQuote(t)||cp162MatchHeading(t,!ctx.strict)||cp162MatchFence(t)||cp162MatchIndentedCode(t)||cp162IsHr(t));
}
function cp162LazyEligible(line,ctx){
  if(!line||cp162IsBlank(line)||cp162IsAtomic(line))return false;
  const t=line.text;
  if(cp162MatchList(t)||cp162MatchQuote(t)||cp162MatchHeading(t,!ctx.strict)||cp162MatchFence(t)||cp162MatchIndentedCode(t)||cp162IsHr(t))return false;
  return true;
}
function cp162BelongsAfterBlank(lines,k,baseIndent,contentColumns,strict){
  if(k>=lines.length||cp162IsBlank(lines[k]))return false;
  const lead=cp162Leading(lines[k].text), lm=cp162MatchList(lines[k].text);
  if(lm&&lm.indentColumns>baseIndent)return strict?lm.indentColumns>=contentColumns:lm.indentColumns>=baseIndent+2;
  return strict?lead.columns>=contentColumns:lead.columns>=baseIndent+2;
}
function cp162ParseFence(lines,i,ctx){
  const open=cp162MatchFence(lines[i].text); if(!open)return null;
  const used=[lines[i]],body=[]; let j=i+1,closed=false;
  while(j<lines.length){ const l=lines[j]; used.push(l); if(cp162FenceClose(l.text,open)){closed=true;j++;break;} body.push(l); j++; }
  const n=cp162Node('fence',used,{children:[],meta:{lang:open.lang,char:open.char,length:open.length,closed},bodyLines:body});
  cp162SetContent(n,body); return {node:n,next:j};
}
function cp162ParseList(lines,i,ctx){
  const first=cp162MatchList(lines[i].text); if(!first)return null;
  const strict=!!ctx.strict, baseIndent=first.indentColumns, kind=first.kind, items=[]; let j=i;
  while(j<lines.length){
    const marker=cp162MatchList(lines[j].text);
    if(!marker||marker.indentColumns!==baseIndent||marker.kind!==kind)break;
    const itemSource=[lines[j]], inner=[cp162StripChars(lines[j],marker.prefixChars)];
    const itemStart=j; let k=j+1, blankRun=0;
    while(k<lines.length){
      const line=lines[k];
      if(cp162IsBlank(line)){
        blankRun++;
        if(blankRun>1||!cp162BelongsAfterBlank(lines,k+1,baseIndent,marker.contentColumns,strict))break;
        itemSource.push(line); inner.push(line); k++; continue;
      }
      const lm=cp162MatchList(line.text);
      if(lm&&lm.indentColumns===baseIndent)break;
      if(lm&&lm.indentColumns<baseIndent)break;
      const lead=cp162Leading(line.text);
      const minIndent=strict?marker.contentColumns:baseIndent+2;
      if(lead.columns>=minIndent){
        const stripCols=lead.columns>=marker.contentColumns?marker.contentColumns:minIndent;
        itemSource.push(line); inner.push(cp162StripIndentColumns(line,stripCols)); blankRun=0; k++; continue;
      }
      if(blankRun===0&&cp162LazyEligible(line,{...ctx,inContainer:true})){
        itemSource.push(line); inner.push(line); k++; continue;
      }
      break;
    }
    const children=cp162ParseSequence(inner,{...ctx,inContainer:true,inListItem:true});
    const item=cp162Node('list_item',itemSource,{children,meta:{...marker},innerLines:inner});
    cp162SetContent(item,inner); items.push(item); j=k;
    if(j===itemStart)j++;
  }
  const all=[]; items.forEach(x=>all.push(...x.lines));
  const node=cp162Node('list',all,{children:items,meta:{kind,start:first.number||1,indentColumns:baseIndent,strict}});
  return {node,next:j};
}
function cp162ParseBlockquote(lines,i,ctx){
  const qm0=cp162MatchQuote(lines[i].text); if(!qm0)return null;
  const source=[],inner=[]; let j=i,have=false;
  while(j<lines.length){
    const line=lines[j],qm=cp162MatchQuote(line.text);
    if(qm){source.push(line);inner.push(cp162StripChars(line,qm.prefixChars));have=true;j++;continue;}
    if(have&&!cp162IsBlank(line)&&cp162LazyEligible(line,{...ctx,inContainer:true})){
      const lead=cp162Leading(line.text);
      source.push(line);inner.push(lead.columns>=2?cp162StripIndentColumns(line,2):line);j++;continue;
    }
    break;
  }
  let parseInner=inner,alert='';
  if(inner.length && window.__CP163C_PROFILE__?.options?.().enableAlert!==false){
    const am=inner[0].text.match(/^\s*\[!(note|warning|important|tip|caution)\]\s*(.*)$/i);
    if(am){
      alert=am[1].toLowerCase();
      const markerEnd=inner[0].text.length-am[2].length;
      const first=cp162StripChars(inner[0],markerEnd);
      parseInner=am[2].length?[first,...inner.slice(1)]:inner.slice(1);
    }
  }
  const children=cp162ParseSequence(parseInner,{...ctx,inContainer:true,inBlockquote:true});
  const type=alert?'alert':'blockquote';
  const node=cp162Node(type,source,{children,innerLines:inner,meta:alert?{alert}:undefined});cp162SetContent(node,inner);
  return {node,next:j};
}
function cp162ParseAtomic(line){
  const raw=line.record.raw,t=typeof blockType==='function'?blockType(raw):'atomic',vlines=cp162VirtualLines(line.record);
  if(t==='h'&&vlines.length===2){
    const m=cp162MatchSetext(vlines[1].text);
    if(m){const n=cp162Node('setext_heading',vlines,{children:[],meta:m,contentLines:[vlines[0]],raw});cp162SetContent(n,[vlines[0]]);return n;}
  }
  if(t==='code'&&vlines.length){
    const open=cp162MatchFence(vlines[0].text);
    if(open){const closed=vlines.length>1&&cp162FenceClose(vlines[vlines.length-1].text,open),body=vlines.slice(1,closed?-1:undefined);const n=cp162Node('fence',vlines,{children:[],meta:{lang:open.lang,char:open.char,length:open.length,closed},bodyLines:body,raw});cp162SetContent(n,body);return n;}
    if(cp162MatchIndentedCode(vlines[0].text)){
      const body=[];for(const l of vlines){const p=cp162IndentedPrefix(l.text);body.push(p?cp162StripChars(l,p.prefixChars):l);}
      const n=cp162Node('indented_code',vlines,{children:[],bodyLines:body,meta:{indented:true},raw});cp162SetContent(n,body);return n;
    }
  }
  const map={table:'table',html:'html_block',meta:'meta_block',toc:'toc',def_link:'definition'};
  return cp162Node(map[t]||'atomic',[line],{children:[],meta:{blockType:t},raw});
}
function cp162ParseSetext(lines,i){
  if(i+1>=lines.length||cp162IsBlank(lines[i]))return null;
  const m=cp162MatchSetext(lines[i+1].text);if(!m)return null;
  const used=[lines[i],lines[i+1]],n=cp162Node('setext_heading',used,{children:[],meta:m,contentLines:[lines[i]]});
  cp162SetContent(n,[lines[i]]);return {node:n,next:i+2};
}
function cp162ParseIndentedCode(lines,i){
  const first=cp162MatchIndentedCode(lines[i].text);if(!first)return null;
  const used=[],body=[];let j=i;
  while(j<lines.length){
    const line=lines[j],p=cp162IndentedPrefix(line.text);
    if(p){used.push(line);body.push(cp162StripChars(line,p.prefixChars));j++;continue;}
    if(cp162IsBlank(line)){used.push(line);body.push(line);j++;continue;}
    break;
  }
  while(body.length&&cp162IsBlank(body[body.length-1]))body.pop();
  const n=cp162Node('indented_code',used,{children:[],bodyLines:body,meta:{indented:true}});cp162SetContent(n,body);
  return {node:n,next:j};
}
function cp162ParseParagraph(lines,i,ctx){
  const used=[lines[i]]; let j=i+1;
  while(j<lines.length&&!cp162IsBlank(lines[j])&&!cp162Explicit(lines[j],ctx)){used.push(lines[j]);j++;}
  return {node:cp162Node('paragraph',used,{children:[]}),next:j};
}
function cp162ParseSequence(lines,ctx){
  const out=[]; let i=0; ctx=ctx||{};
  while(i<lines.length){
    const line=lines[i];
    if(cp162IsBlank(line)){out.push(cp162Node('blank',[line],{children:[]}));i++;continue;}
    const bt=typeof blockType==='function'?blockType(line.record.raw):'';
    if(cp162IsAtomic(line)||bt==='toc'||bt==='def_link'||bt==='html'||bt==='meta'||bt==='table'){out.push(cp162ParseAtomic(line));i++;continue;}
    const l=cp162ParseList(lines,i,ctx); if(l){out.push(l.node);i=l.next;continue;}
    const q=cp162ParseBlockquote(lines,i,ctx); if(q){out.push(q.node);i=q.next;continue;}
    /* The block parser gives M/L indented code precedence over ATX headings.
       Therefore four spaces or a Tab before `#Heading` remains code, even in Loose mode. */
    const ic=cp162ParseIndentedCode(lines,i); if(ic){out.push(ic.node);i=ic.next;continue;}
    const sx=cp162ParseSetext(lines,i); if(sx){out.push(sx.node);i=sx.next;continue;}
    const h=cp162MatchHeading(line.text,!ctx.strict);
    if(h){const contentLine=cp162StripChars(line,h.markerChars);const n=cp162Node('heading',[line],{children:[],meta:h,contentLines:[contentLine]});cp162SetContent(n,[contentLine]);out.push(n);i++;continue;}
    const f=cp162ParseFence(lines,i,ctx); if(f){out.push(f.node);i=f.next;continue;}
    if(cp162IsHr(line.text)){out.push(cp162Node('hr',[line],{children:[]}));i++;continue;}
    const p=cp162ParseParagraph(lines,i,ctx);out.push(p.node);i=p.next;
  }
  return out;
}
function cp162StableBoundary(sourceBlocks,index){
  const a=Array.isArray(sourceBlocks)?sourceBlocks:[];
  if(index<=0||index>=a.length)return true;
  return String(a[index]??'').trim()===''||String(a[index-1]??'').trim()==='';
}
function cp162DirtyWindow(prev,next){
  const a=Array.isArray(prev)?prev:[],b=Array.isArray(next)?next:[];let prefix=0;
  while(prefix<a.length&&prefix<b.length&&a[prefix]===b[prefix])prefix++;
  let suffix=0;
  while(suffix<a.length-prefix&&suffix<b.length-prefix&&a[a.length-1-suffix]===b[b.length-1-suffix])suffix++;
  if(prefix===a.length&&prefix===b.length)return {changed:false,start:prefix,oldStart:prefix,newStart:prefix,oldEnd:prefix-1,newEnd:prefix-1,oldSuffixStart:prefix,newSuffixStart:prefix,prefix,suffix,local:false};

  /* Markdown reparses an edited node/container, not unrelated siblings.  The
     browser adapter has block records rather than cids, so the equivalent
     stable boundary is a shared blank/top-level close point.  If no such
     boundary exists, the window conservatively reaches the document edge. */
  let start=prefix;
  while(start>0&&!(cp162StableBoundary(a,start)&&cp162StableBoundary(b,start)))start--;
  let oldSuffixStart=a.length-suffix,newSuffixStart=b.length-suffix;
  while(oldSuffixStart<a.length&&newSuffixStart<b.length&&
        !(cp162StableBoundary(a,oldSuffixStart)&&cp162StableBoundary(b,newSuffixStart))){
    oldSuffixStart++;newSuffixStart++;
  }
  const oldEnd=oldSuffixStart-1,newEnd=newSuffixStart-1;
  return {changed:true,start,oldStart:start,newStart:start,oldEnd,newEnd,oldSuffixStart,newSuffixStart,
    prefix,suffix,local:start>0||oldEnd<a.length-1||newEnd<b.length-1,
    oldBlocks:Math.max(0,oldEnd-start+1),newBlocks:Math.max(0,newEnd-start+1)};
}
function cp162CountStats(doc,parseMs,extra){
  const stats={parseMs,blocks:doc.meta.normalizedBlocks??doc.lines.length,nodes:0,containers:0,maxDepth:0,...(extra||{})};
  (function walk(n,d){stats.nodes++;if(n.type==='list'||n.type==='blockquote'||n.type==='alert')stats.containers++;stats.maxDepth=Math.max(stats.maxDepth,d);(n.children||[]).forEach(x=>walk(x,d+1));})(doc,0);
  doc.stats=stats;return doc;
}
function cp162Parse(sourceBlocks,options){
  const t0=performance.now(),built=cp162BuildRecords(sourceBlocks),lines=built.records.map(r=>cp162Virtual(r));
  const children=cp162ParseSequence(lines,{strict:!!(options&&options.strict),inContainer:false});
  const doc=cp162Node('document',lines,{children,meta:{strict:!!(options&&options.strict),normalizedLength:built.normalizedLength,normalizedBlocks:sourceBlocks.length}});
  return cp162CountStats(doc,performance.now()-t0,{parseMode:'full',localBlocks:sourceBlocks.length,stableNodes:0});
}
function cp162RangeRebased(range,built,delta){
  const segs=(range&&range.segments||[]).map(g=>{
    const index=g.blockIndex+delta,record=built.records[index];
    if(!record)throw new Error('rebase-record:'+g.blockIndex+':'+delta);
    const ns=record.normStart+g.localStart,ne=record.normStart+g.localEnd;
    return {blockIndex:index,localStart:g.localStart,localEnd:g.localEnd,normalizedStart:ns,normalizedEnd:ne,rawStart:cp162RawOffset(ns),rawEnd:cp162RawOffset(ne)};
  });
  if(!segs.length)return {normalizedStart:0,normalizedEnd:0,rawStart:cp162RawOffset(0),rawEnd:cp162RawOffset(0),segments:[]};
  return {normalizedStart:segs[0].normalizedStart,normalizedEnd:segs[segs.length-1].normalizedEnd,rawStart:segs[0].rawStart,rawEnd:segs[segs.length-1].rawEnd,segments:segs};
}
function cp162RebaseNode(node,built,delta,seen){
  /* Virtual lines are intentionally shared by container and child nodes.  A
     subtree-wide seen set prevents the same record from being shifted once by
     the parent and again by its paragraph/list child. */
  seen=seen||new Set();
  for(const key of ['lines','innerLines','bodyLines','contentLines'])for(const line of node[key]||[]){
    if(!line||seen.has(line))continue;seen.add(line);
    const index=line.record.index+delta,record=built.records[index];if(!record)throw new Error('rebase-line:'+line.record.index+':'+delta);line.record=record;
  }
  node.source=cp162RangeRebased(node.source,built,delta);node.content=cp162RangeRebased(node.content,built,delta);
  if(node.blockRange&&node.blockRange.start>=0)node.blockRange={start:node.blockRange.start+delta,end:node.blockRange.end+delta};
  (node.children||[]).forEach(x=>cp162RebaseNode(x,built,delta,seen));return node;
}
function cp162NodeCount(nodes){let n=0;for(const root of nodes||[])cp162Walk(root,()=>n++);return n;}
function cp162NodeFingerprint(node,sourceBlocks){
  if(!node)return '';
  const meta={};for(const k of ['kind','marker','number','task','checked','level','alert','char','length','closed','lang','blockType'])if(node.meta&&node.meta[k]!=null)meta[k]=node.meta[k];
  const parts=(node.source&&node.source.segments||[]).map(g=>String(sourceBlocks[g.blockIndex]??'').slice(g.localStart,g.localEnd));
  return node.type+'|'+JSON.stringify(meta)+'|'+JSON.stringify(parts);
}
function cp162CopyFreshNode(oldNode,newNode,children){
  const id=oldNode.id;for(const k of Object.keys(oldNode))if(k!=='id')delete oldNode[k];
  for(const [k,v] of Object.entries(newNode))if(k!=='id'&&k!=='children')oldNode[k]=v;
  oldNode.id=id;oldNode.children=children;return oldNode;
}
function cp162ReconcileNodeLists(oldNodes,newNodes,prevBlocks,nextBlocks,counters){
  oldNodes=oldNodes||[];newNodes=newNodes||[];counters=counters||{reusedNodes:0,reusedUnchanged:0,reusedChangedShells:0};
  if(!oldNodes.length)return newNodes.slice();if(!newNodes.length)return [];
  const ok=oldNodes.map(n=>cp162NodeFingerprint(n,prevBlocks)),nk=newNodes.map(n=>cp162NodeFingerprint(n,nextBlocks));
  const n=oldNodes.length,m=newNodes.length,dp=Array.from({length:n+1},()=>new Uint16Array(m+1));
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i][j]=ok[i]===nk[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  const pairs=new Map(),usedOld=new Set();let i=0,j=0;
  while(i<n&&j<m){if(ok[i]===nk[j]){pairs.set(j,i);usedOld.add(i);i++;j++;}else if(dp[i+1][j]>=dp[i][j+1])i++;else j++;}
  /* Markdown parseFrom writes a single compatible reparse result back into the
     old node.  For unmatched spans we mirror that behavior positionally when
     the node type is unchanged, then recursively preserve exact descendants. */
  const anchors=[[-1,-1],...[...pairs.entries()].map(([nj,oi])=>[oi,nj]).sort((a,b)=>a[0]-b[0]),[n,m]];
  for(let a=0;a+1<anchors.length;a++){
    const [oi0,nj0]=anchors[a],[oi1,nj1]=anchors[a+1];let oi=oi0+1;
    for(let nj=nj0+1;nj<nj1;nj++){
      while(oi<oi1&&(usedOld.has(oi)||oldNodes[oi].type!==newNodes[nj].type))oi++;
      if(oi<oi1){pairs.set(nj,oi);usedOld.add(oi);oi++;}
    }
  }
  const out=[];
  for(let nj=0;nj<m;nj++){
    const oi=pairs.get(nj);if(oi==null||oldNodes[oi].type!==newNodes[nj].type){out.push(newNodes[nj]);continue;}
    const exact=ok[oi]===nk[nj],old=oldNodes[oi],fresh=newNodes[nj];
    const children=cp162ReconcileNodeLists(old.children||[],fresh.children||[],prevBlocks,nextBlocks,counters);
    cp162CopyFreshNode(old,fresh,children);counters.reusedNodes++;if(exact)counters.reusedUnchanged++;else counters.reusedChangedShells++;out.push(old);
  }
  return out;
}
function cp162AstShape(node){
  if(!node)return null;
  const meta={};for(const [k,v] of Object.entries(node.meta||{}))if(!['normalizedLength','normalizedBlocks'].includes(k))meta[k]=v;
  return {type:node.type,blockRange:node.blockRange?{...node.blockRange}:null,source:node.source?{normalizedStart:node.source.normalizedStart,normalizedEnd:node.source.normalizedEnd,segments:(node.source.segments||[]).map(x=>[x.blockIndex,x.localStart,x.localEnd])}:null,meta,children:(node.children||[]).map(cp162AstShape)};
}
function cp162AlignDirtyToAst(prevAst,prevBlocks,nextBlocks,dirty){
  const d={...dirty};
  if(!d.changed||!prevAst)return d;
  const children=prevAst.children||[];
  let again=true;
  while(again){
    again=false;
    for(const n of children){
      const a=n.blockRange?.start??-1,b=n.blockRange?.end??-1;
      if(a<0||b<a)continue;
      /* Any old top-level node touched by the candidate window must be
         reparsed as a whole.  Markdown loose lists/quotes can legally span a
         blank block, so blank-only expansion is not a safe container edge. */
      const touches=b>=d.oldStart&&a<d.oldSuffixStart;
      if(!touches)continue;
      if(a<d.oldStart){const k=d.oldStart-a;d.oldStart=a;d.newStart=Math.max(0,d.newStart-k);again=true;}
      if(b+1>d.oldSuffixStart){const k=b+1-d.oldSuffixStart;d.oldSuffixStart=b+1;d.newSuffixStart=Math.min(nextBlocks.length,d.newSuffixStart+k);again=true;}
    }
  }
  d.start=d.oldStart;d.oldEnd=d.oldSuffixStart-1;d.newEnd=d.newSuffixStart-1;
  d.oldBlocks=Math.max(0,d.oldEnd-d.oldStart+1);d.newBlocks=Math.max(0,d.newEnd-d.newStart+1);
  d.local=d.oldStart>0||d.oldEnd<prevBlocks.length-1||d.newEnd<nextBlocks.length-1;
  d.astAligned=d.oldStart!==dirty.oldStart||d.oldSuffixStart!==dirty.oldSuffixStart;
  return d;
}
function cp162LocalUpdate(prevAst,prevBlocks,nextBlocks,dirty,options){
  dirty=cp162AlignDirtyToAst(prevAst,prevBlocks,nextBlocks,dirty);
  const t0=performance.now(),built=cp162BuildRecords(nextBlocks),oldChildren=prevAst.children||[];
  const prefix=oldChildren.filter(n=>n.blockRange.end<dirty.oldStart);
  const replaced=oldChildren.filter(n=>n.blockRange.end>=dirty.oldStart&&n.blockRange.start<=dirty.oldEnd);
  const suffix=oldChildren.filter(n=>n.blockRange.start>=dirty.oldSuffixStart);
  const covered=prefix.length+replaced.length+suffix.length;
  if(covered!==oldChildren.length)throw new Error('local-boundary-splits-node');
  for(let i=0;i<dirty.newStart;i++)if(prevBlocks[i]!==nextBlocks[i])throw new Error('local-prefix-not-stable');
  const delta=dirty.newSuffixStart-dirty.oldSuffixStart;
  for(let oi=dirty.oldSuffixStart,ni=dirty.newSuffixStart;oi<prevBlocks.length||ni<nextBlocks.length;oi++,ni++)if(prevBlocks[oi]!==nextBlocks[ni])throw new Error('local-suffix-not-stable');

  const localLines=dirty.newEnd>=dirty.newStart?built.records.slice(dirty.newStart,dirty.newEnd+1).map(r=>cp162Virtual(r)):[];
  const parsedChildren=cp162ParseSequence(localLines,{strict:!!(options&&options.strict),inContainer:false});
  const reconcile={reusedNodes:0,reusedUnchanged:0,reusedChangedShells:0};
  const localChildren=cp162ReconcileNodeLists(replaced,parsedChildren,prevBlocks,nextBlocks,reconcile);
  suffix.forEach(n=>cp162RebaseNode(n,built,delta));
  prevAst.children=[...prefix,...localChildren,...suffix];
  prevAst.lines=built.records.map(r=>cp162Virtual(r));
  prevAst.source=cp162Range(prevAst.lines);prevAst.content=prevAst.source;
  prevAst.blockRange={start:nextBlocks.length?0:-1,end:nextBlocks.length?nextBlocks.length-1:-1};
  prevAst.meta={...(prevAst.meta||{}),strict:!!(options&&options.strict),normalizedLength:built.normalizedLength,normalizedBlocks:nextBlocks.length};
  const stableNodes=cp162NodeCount(prefix)+cp162NodeCount(suffix);
  cp162CountStats(prevAst,performance.now()-t0,{parseMode:'local',localBlocks:localLines.length,stableNodes,replacedNodes:cp162NodeCount(replaced),newNodes:cp162NodeCount(localChildren),blockDelta:delta,stableDirtyNodes:reconcile.reusedNodes,stableDirtyUnchanged:reconcile.reusedUnchanged,stableDirtyChangedShells:reconcile.reusedChangedShells});
  return {ast:prevAst,mode:'local',dirty,stableNodes,localBlocks:localLines.length,replacedNodes:cp162NodeCount(replaced),newNodes:cp162NodeCount(localChildren),blockDelta:delta,stableDirtyNodes:reconcile.reusedNodes,stableDirtyUnchanged:reconcile.reusedUnchanged,stableDirtyChangedShells:reconcile.reusedChangedShells,fallback:null};
}
function cp162UpdateAst(prevAst,prevBlocks,nextBlocks,dirty,options){
  if(!prevAst){const ast=cp162Parse(nextBlocks,options);return {ast,mode:'full-initial',dirty,stableNodes:0,localBlocks:nextBlocks.length,fallback:null};}
  try{return cp162LocalUpdate(prevAst,prevBlocks,nextBlocks,dirty,options);}catch(err){
    cp162FallbackCount++;const ast=cp162Parse(nextBlocks,options);ast.stats.parseMode='full-fallback';
    return {ast,mode:'full-fallback',dirty,stableNodes:0,localBlocks:nextBlocks.length,fallback:String(err&&err.message||err)};
  }
}
function cp162Walk(node,fn,depth=0,parent=null){fn(node,depth,parent);(node.children||[]).forEach(x=>cp162Walk(x,fn,depth+1,node));}
function cp162Audit(ast){
  const errors=[],source=blocks.join('\n'),d=cp162Doc();
  if(d&&typeof d.getNormalizedText==='function'&&d.getNormalizedText()!==source)errors.push('lossless-normalized-mismatch');
  cp162Walk(ast,n=>{
    if(!CP162_NODE_TYPES.has(n.type))errors.push('unknown-type:'+n.type);
    const s=n.source||{};if(s.normalizedStart>s.normalizedEnd||s.normalizedStart<0||s.normalizedEnd>source.length)errors.push('range:'+n.id);
    for(const g of s.segments||[]){
      const b=blocks[g.blockIndex]??'';
      if(source.slice(g.normalizedStart,g.normalizedEnd)!==b.slice(g.localStart,g.localEnd))errors.push('segment-normalized:'+n.id);
      if(d&&cp162ExactSlice(g.normalizedStart,g.normalizedEnd)!==d.serialize().slice(g.rawStart,g.rawEnd))errors.push('segment-raw:'+n.id);
    }
  });
  return {ok:errors.length===0,errors,nodes:ast.stats.nodes,containers:ast.stats.containers,blocks:blocks.length,normalizedLength:source.length};
}

function cp162NodeAttrs(n){return ` data-cp162-node-id="${n.id}" data-cp162-node-type="${n.type}"`; }
function cp162Inline(text){
  const raw=String(text==null?'':text); try{mathSeq=0;styleSeq=0;}catch(_){}
  const h=typeof inlineMD==='function'?inlineMD(raw):escapeHtml(raw); return h||'<span class="struct-empty-anchor" data-struct-empty-line="1">​</span>';
}
function cp162Frag(line,cls=''){
  const seg=cp162LineSegment(line),text=line.text;
  return `<span class="cp162-source-fragment${cls?' '+cls:''}" data-cp162-source-index="${seg.blockIndex}" data-cp162-source-start="${seg.localStart}" data-cp162-source-end="${seg.localEnd}" data-cp162-node-offset="${line.sliceStart}">${cp162Inline(text)}</span>`;
}
function cp162Softbreak(a,b){
  const sa=cp162LineSegment(a),sb=cp162LineSegment(b);
  const attrs=`data-cp162-break-left-index="${sa.blockIndex}" data-cp162-break-left-off="${sa.localEnd}" data-cp162-break-right-index="${sb.blockIndex}" data-cp162-break-right-off="${sb.localStart}"`;
  if(/[ \u00A0]{2,}$/.test(String(a&&a.text||'')))return `<br class="md-hardbreak cp162-softbreak" ${attrs}>`;
  return `<span class="md-softbreak cp162-softbreak" ${attrs}>\n</span>`;
}
function cp162RenderParagraph(n){
  let h=`<p class="md-p cp162-paragraph"${cp162NodeAttrs(n)}>`;
  n.lines.forEach((l,i)=>{if(i)h+=cp162Softbreak(n.lines[i-1],l);h+=cp162Frag(l);});return h+'</p>';
}
function cp162RenderHeading(n){
  const l=n.contentLines&&n.contentLines[0]?n.contentLines[0]:n.lines[0],lv=n.meta.level;
  return `<h${lv} class="md-h cp162-heading${n.meta.loose?' cp162-heading-loose':''}" data-cp162-heading="${lv}"${cp162NodeAttrs(n)}>${cp162Frag(l)}</h${lv}>`;
}
function cp162RenderSetext(n){
  const l=n.contentLines&&n.contentLines[0]?n.contentLines[0]:n.lines[0],lv=n.meta.level;
  return `<h${lv} class="md-h cp162-heading cp162-setext-heading" data-cp162-heading="${lv}"${cp162NodeAttrs(n)}>${cp162Frag(l)}</h${lv}>`;
}
function cp162RenderIndentedCode(n){
  const body=(n.bodyLines||[]).map(x=>x.text).join('\n');
  return `<pre class="md-pre cp162-indented-code"${cp162NodeAttrs(n)}><code>${typeof highlight==='function'?(highlight(body,'')||'<br>'):escapeHtml(body)}</code></pre>`;
}
function cp162RenderAlert(n,depth){
  const label=(n.meta&&n.meta.alert)||'note';
  return `<div class="md-alert cp162-alert md-alert-${label}" data-alert="${label}"${cp162NodeAttrs(n)}><div class="md-alert-title">${escapeHtml(label.toUpperCase())}</div><div class="md-alert-body">${cp162RenderChildren(n.children,depth+1)}</div></div>`;
}
function cp162RenderFence(n){
  const body=(n.bodyLines||[]).map(x=>x.text).join('\n'),lang=n.meta.lang||'';
  return `<pre class="md-pre cp162-fence${/^(revtex|twthesis)-/i.test(lang)?' ekd-wrap-fence':''}" data-cp162-fence-closed="${n.meta.closed?'1':'0'}"${cp162NodeAttrs(n)}>${lang?`<span class="lang-tag">${escapeHtml(lang)}</span>`:''}<code>${typeof highlight==='function'?(highlight(body,lang)||'<br>'):escapeHtml(body)}</code></pre>`;
}
function cp162RenderChildren(children,depth){return (children||[]).map(x=>cp162RenderNode(x,depth)).join('');}
function cp162RenderListItem(item,depth){
  const task=item.meta.task,cls=`cp162-list-item${task?' task'+(item.meta.checked?' done':''):''}`;
  let body=cp162RenderChildren(item.children,depth+1);
  if(task)body=`<input type="checkbox" class="task-check cp162-task-check" data-cp162-source-index="${item.blockRange.start}"${item.meta.checked?' checked':''}><div class="cp162-task-body">${body}</div>`;
  return `<li class="${cls}" data-cp162-source-index="${item.blockRange.start}"${cp162NodeAttrs(item)}>${body}</li>`;
}
function cp162RenderList(n,depth){
  const tag=n.meta.kind==='ol'?'ol':'ul',start=tag==='ol'?` start="${n.meta.start}"`:'';
  return `<${tag} class="md-list cp162-list md-lv${depth%3}"${start} data-cp162-container="list"${cp162NodeAttrs(n)}>${n.children.map(x=>cp162RenderListItem(x,depth)).join('')}</${tag}>`;
}
function cp162RenderNode(n,depth=0){
  switch(n.type){
    case 'paragraph':return cp162RenderParagraph(n);
    case 'heading':return cp162RenderHeading(n);
    case 'setext_heading':return cp162RenderSetext(n);
    case 'blank':return `<p class="md-p cp162-blank"${cp162NodeAttrs(n)}><br></p>`;
    case 'list':return cp162RenderList(n,depth);
    case 'blockquote':return `<blockquote class="md-quote cp162-blockquote" data-cp162-container="blockquote"${cp162NodeAttrs(n)}>${cp162RenderChildren(n.children,depth+1)}</blockquote>`;
    case 'alert':return cp162RenderAlert(n,depth);
    case 'fence':return cp162RenderFence(n);
    case 'indented_code':return cp162RenderIndentedCode(n);
    case 'hr':return `<hr class="md-hr"${cp162NodeAttrs(n)}>`;
    case 'table':case 'html_block':case 'meta_block':case 'toc':case 'definition':case 'atomic':return `<div class="cp162-atomic-host"${cp162NodeAttrs(n)}>${typeof renderBlockHTML==='function'?renderBlockHTML(n.raw):escapeHtml(n.raw)}</div>`;
    default:return cp162RenderChildren(n.children,depth);
  }
}
function cp162HasDeepSemantics(n){
  if(n.type==='paragraph')return n.lines.length>1;
  if(n.type==='blockquote'||n.type==='alert'){
    if(n.blockRange.end>n.blockRange.start)return true;
    return n.type==='alert'||n.children.some(x=>x.type!=='paragraph'||x.lines.length>1);
  }
  if(n.type==='list'){
    if(n.blockRange.end>n.blockRange.start)return true;
    return n.children.some(it=>it.children.some(x=>x.type!=='paragraph'||x.lines.length>1));
  }
  return false;
}
function cp162CanApply(){
  if(cp162Applying||cp162Suspending||settings.srcmode||activeIndex>=0)return false;
  if(typeof mathEditEl!=='undefined'&&mathEditEl)return false;
  if(typeof tableEdit!=='undefined'&&tableEdit)return false;
  if(typeof peIndex!=='undefined'&&peIndex>=0)return false;
  return !!(editor&&editor.children&&editor.children.length===blocks.length);
}
function cp162RestoreBlock(i){
  const el=editor.children[i];if(!el)return;
  el.classList.remove('cp162-container-root','cp162-source-shadow');
  delete el.dataset.cp162Root;delete el.dataset.cp162ShadowOf;delete el.dataset.cp162RangeEnd;
  el.removeAttribute('aria-hidden');el.innerHTML=renderBlockHTML(blocks[i]??'');
}
function cp162DetachProjection(p,cache){
  if(!p)return null;cp162Suspending=true;
  try{
    const root=editor.children[p.start],host=root&&root.firstElementChild?root.firstElementChild:null;
    if(cache&&host)host.remove();
    for(let i=p.start;i<=p.end;i++)cp162RestoreBlock(i);
    const saved=cache&&host?{...p,host}:null;if(saved)cp162DetachedProjection.set(p.nodeId,saved);return saved;
  }finally{cp162Suspending=false;}
}
function cp162ClearProjection(options){
  const preserve=!!(options&&options.preserveDetached);if(!cp162Projection.length){if(!preserve)cp162DetachedProjection.clear();return;}
  for(const p of cp162Projection)cp162DetachProjection(p,preserve);cp162Projection=[];delete editor.dataset.cp162ContainerAst;
  if(!preserve)cp162DetachedProjection.clear();
}
function cp162SuspendForBlock(i){
  if(cp162Frame){cancelAnimationFrame(cp162Frame);cp162Frame=0;}
  const p=cp162Projection.find(x=>i>=x.start&&i<=x.end);if(!p)return false;
  cp162DetachProjection(p,true);cp162Projection=cp162Projection.filter(x=>x!==p);
  if(!cp162Projection.length)delete editor.dataset.cp162ContainerAst;return true;
}
function cp162DomKey(node){return node&&node.nodeType===1?node.getAttribute('data-cp162-node-id'):null;}
function cp162DomCompatible(a,b){
  if(!a||!b||a.nodeType!==b.nodeType)return false;if(a.nodeType===3||a.nodeType===8)return true;
  if(a.nodeType!==1)return true;return a.tagName===b.tagName&&!cp162DomKey(a)&&!cp162DomKey(b);
}
function cp162SyncAttrs(dst,src){
  for(const a of [...dst.attributes])if(!src.hasAttribute(a.name))dst.removeAttribute(a.name);
  for(const a of [...src.attributes])if(dst.getAttribute(a.name)!==a.value)dst.setAttribute(a.name,a.value);
  if(dst instanceof HTMLInputElement){dst.checked=src.checked;dst.value=src.value;}
}
function cp162CollectKeyed(root){const m=new Map();if(root&&cp162DomKey(root))m.set(cp162DomKey(root),root);for(const el of root&&root.querySelectorAll?root.querySelectorAll('[data-cp162-node-id]'):[])m.set(cp162DomKey(el),el);return m;}
function cp162MorphDom(dst,src,keyed,stats){
  if(dst.nodeType!==src.nodeType){const n=src.cloneNode(true);dst.replaceWith(n);stats.created++;return n;}
  if(dst.nodeType===3||dst.nodeType===8){if(dst.nodeValue!==src.nodeValue)dst.nodeValue=src.nodeValue;return dst;}
  if(dst.nodeType!==1)return dst;
  if(dst.tagName!==src.tagName){const n=src.cloneNode(true);dst.replaceWith(n);stats.created++;return n;}
  cp162SyncAttrs(dst,src);const fresh=[...src.childNodes];let cursor=dst.firstChild;
  for(const f of fresh){
    let target=null,key=cp162DomKey(f);
    if(key){const old=keyed.get(key);if(old&&old!==dst&&old.tagName===f.tagName&&!old.contains(dst)){target=old;stats.preservedHosts++;}}
    if(!target&&cursor&&cp162DomCompatible(cursor,f))target=cursor;
    if(!target){target=f.cloneNode(true);stats.created++;dst.insertBefore(target,cursor);}else{
      if(target!==cursor)dst.insertBefore(target,cursor);target=cp162MorphDom(target,f,keyed,stats);
    }
    cursor=target.nextSibling;
  }
  while(cursor){const next=cursor.nextSibling;cursor.remove();stats.removed++;cursor=next;}return dst;
}
function cp162FreshHost(n){
  const t=document.createElement('template');t.innerHTML=cp162RenderNode(n,0).trim();
  if(t.content.childElementCount===1)return t.content.firstElementChild;
  const w=document.createElement('div');w.className='cp162-render-host';w.setAttribute('data-cp162-node-id',n.id);w.setAttribute('data-cp162-node-type',n.type);w.append(t.content);return w;
}
function cp162MorphHost(oldHost,freshHost,stats){
  if(!oldHost||oldHost.tagName!==freshHost.tagName||cp162DomKey(oldHost)!==cp162DomKey(freshHost)){stats.created++;return freshHost;}
  const keyed=cp162CollectKeyed(oldHost);stats.preservedHosts++;return cp162MorphDom(oldHost,freshHost,keyed,stats);
}
function cp162ProjectionAffected(n,dirty){
  if(!dirty||!dirty.changed)return false;return n.blockRange.end>=dirty.newStart&&n.blockRange.start<=dirty.newEnd;
}
function cp162ClearOldShadowRange(p,newStart,newEnd){
  if(!p)return;for(let i=p.start;i<=p.end;i++)if(i!==p.start&&(i<newStart||i>newEnd))cp162RestoreBlock(i);
}
function cp162InstallProjection(n,active,cached,morphStats){
  const a=n.blockRange.start,b=n.blockRange.end;if(a<0||b<a||b>=editor.children.length)return null;
  let oldHost=null;
  if(active&&active.start===a){oldHost=editor.children[a]&&editor.children[a].firstElementChild;cp162ClearOldShadowRange(active,a,b);}
  else if(active){cp162DetachProjection(active,true);cached=cp162DetachedProjection.get(n.id)||cached;}
  if(!oldHost&&cached&&cached.host)oldHost=cached.host;
  const fresh=cp162FreshHost(n),host=oldHost?cp162MorphHost(oldHost,fresh,morphStats):fresh;
  const root=editor.children[a];root.replaceChildren(host);root.classList.remove('cp162-source-shadow');root.classList.add('cp162-container-root');
  root.dataset.cp162Root=n.id;root.dataset.cp162RangeEnd=String(b);delete root.dataset.cp162ShadowOf;root.removeAttribute('aria-hidden');
  for(let i=a+1;i<=b;i++){const el=editor.children[i];el.classList.remove('cp162-container-root');el.classList.add('cp162-source-shadow');el.dataset.cp162ShadowOf=String(a);delete el.dataset.cp162Root;delete el.dataset.cp162RangeEnd;el.setAttribute('aria-hidden','true');}
  cp162DetachedProjection.delete(n.id);return {start:a,end:b,nodeId:n.id,type:n.type};
}
function cp162PaperProjectionForbidden(){
  return typeof inPaperMode==='function' && inPaperMode() && !settings.srcmode;
}
function cp162Apply(){
  cp162Frame=0;
  /* CP162R1 — Paper／TW_THESIS pagination owns a flat direct-child measurement DOM.
     CP162A incorrectly replaced that DOM with one recursive host plus display:none
     source shadows. The paginator then measured a different flow tree, shifting page
     breaks, TOC/LOF/LOT folios and every later physical page. Keep the compatibility
     AST available, but never install its visual projection in any Paper/TW_THESIS mode. */
  if(cp162PaperProjectionForbidden()){
    const hadProjection=cp162Projection.length>0;
    if(hadProjection)cp162ClearProjection();
    const dirty=cp162DirtyWindow(cp162LastBlocks,blocks);
    if(!cp162Ast||dirty.changed)cp162Ast=cp162Parse(blocks,{strict:false});
    cp162LastBlocks=blocks.slice();cp162LastDirtyWindow=dirty;
    cp162LastStats={...(cp162Ast&&cp162Ast.stats?cp162Ast.stats:{}),projectionMs:0,projections:0,
      parseMode:'paper-isolated',paperProjectionIsolated:true,astReused:!dirty.changed,
      dirtyWindow:dirty,updatedProjectionRoots:0,untouchedProjectionRoots:0,
      preservedDomHosts:0,createdDomNodes:0,removedDomNodes:0,fallback:null};
    delete editor.dataset.cp162ContainerAst;
    if(hadProjection){
      if(typeof decorateTwThesis==='function')decorateTwThesis();
      if(typeof schedulePaginate==='function')schedulePaginate();
    }
    return false;
  }
  if(!cp162CanApply())return false;
  cp162Applying=true;const t0=performance.now();
  try{
    const dirty=cp162DirtyWindow(cp162LastBlocks,blocks);
    if(dirty.changed&&typeof losslessSyncActiveText==='function')losslessSyncActiveText(serialize(),'cp162-local-reparse');
    let update;
    if(!dirty.changed&&cp162Ast)update={ast:cp162Ast,mode:'reuse',dirty,stableNodes:cp162Ast.stats?cp162Ast.stats.nodes:0,localBlocks:0,stableDirtyNodes:0,stableDirtyUnchanged:0,stableDirtyChangedShells:0,fallback:null};
    else update=cp162UpdateAst(cp162Ast,cp162LastBlocks,blocks,dirty,{strict:window.__CP163C_PROFILE__?.options?.().strictMarkdown===true});
    cp162Ast=update.ast;cp162LastDirtyWindow=update.dirty||dirty;if(update.mode!=='reuse')cp162LastUpdate=update;cp162LastBlocks=blocks.slice();
    const desired=[];for(const n of cp162Ast.children)if(cp162HasDeepSemantics(n))desired.push(n);
    const desiredIds=new Set(desired.map(n=>n.id)),activeById=new Map(cp162Projection.map(p=>[p.nodeId,p]));
    for(const p of cp162Projection)if(!desiredIds.has(p.nodeId))cp162DetachProjection(p,false);
    const projections=[],morphStats={preservedHosts:0,created:0,removed:0,updatedRoots:0,untouchedRoots:0};
    for(const n of desired){
      const active=activeById.get(n.id)||null,cached=cp162DetachedProjection.get(n.id)||null,affected=cp162ProjectionAffected(n,cp162LastDirtyWindow);
      if(active&&!affected&&active.start===n.blockRange.start&&active.end===n.blockRange.end){projections.push(active);morphStats.untouchedRoots++;continue;}
      const p=cp162InstallProjection(n,active,cached,morphStats);if(p){projections.push(p);morphStats.updatedRoots++;}
    }
    cp162Projection=projections;for(const [id] of cp162DetachedProjection)if(!desiredIds.has(id))cp162DetachedProjection.delete(id);
    if(projections.length)editor.dataset.cp162ContainerAst='1';else delete editor.dataset.cp162ContainerAst;
    const audit=cp162Audit(cp162Ast);cp162LastStats={...cp162Ast.stats,projectionMs:performance.now()-t0,projections:projections.length,audit,dirtyWindow:cp162LastDirtyWindow,parseMode:update.mode,lastChangeMode:cp162LastUpdate?cp162LastUpdate.mode:null,astReused:update.mode==='reuse',stableNodes:update.stableNodes,stableDirtyNodes:update.stableDirtyNodes||0,stableDirtyUnchanged:update.stableDirtyUnchanged||0,stableDirtyChangedShells:update.stableDirtyChangedShells||0,localBlocks:update.localBlocks,blockDelta:update.blockDelta||0,selectiveProjection:true,preservedDomHosts:morphStats.preservedHosts,updatedProjectionRoots:morphStats.updatedRoots,untouchedProjectionRoots:morphStats.untouchedRoots,createdDomNodes:morphStats.created,removedDomNodes:morphStats.removed,fallback:update.fallback||null,fallbackCount:cp162FallbackCount};
    if(typeof decorateTwThesis==='function')decorateTwThesis();
    if(typeof schedulePaginate==='function')schedulePaginate();
    return true;
  }catch(err){console.error('[CP162C1] projection failed',err);cp162ClearProjection();return false;}
  finally{cp162Applying=false;}
}
function cp162Schedule(){if(cp162Frame)return;cp162Frame=requestAnimationFrame(()=>{cp162Frame=0;cp162Apply();});}
function cp162Suspend(){if(cp162Frame){cancelAnimationFrame(cp162Frame);cp162Frame=0;}cp162ClearProjection();}function cp162Invalidate(){cp162Suspend();cp162Ast=null;cp162LastBlocks=[];}
function cp162Projected(){return !!(editor&&editor.dataset.cp162ContainerAst==='1'&&cp162Projection.length);}
function cp162FragmentFor(index,local){
  const q=`.cp162-source-fragment[data-cp162-source-index="${index}"]`,all=[...editor.querySelectorAll(q)];
  if(!all.length)return null;const off=Number(local)||0;
  return all.find(x=>off>=+x.dataset.cp162SourceStart&&off<=+x.dataset.cp162SourceEnd)||all[0];
}
function cp162PointToRaw(node,off){
  if(!node||!editor.contains(node))return null;
  const el=node.nodeType===1?node:node.parentElement;
  let br=el&&el.closest?el.closest('.cp162-softbreak'):null;
  if(br&&editor.contains(br)){
    let before=true;try{const r=document.createRange();r.selectNodeContents(br);r.setEnd(node,off);before=r.toString().length*2<=br.textContent.length;}catch(_){}
    return before?{i:+br.dataset.cp162BreakLeftIndex,off:+br.dataset.cp162BreakLeftOff}:{i:+br.dataset.cp162BreakRightIndex,off:+br.dataset.cp162BreakRightOff};
  }
  let frag=el&&el.closest?el.closest('.cp162-source-fragment'):null;
  if(frag&&editor.contains(frag)){
    const i=+frag.dataset.cp162SourceIndex,s=+frag.dataset.cp162SourceStart,e=+frag.dataset.cp162SourceEnd,raw=(blocks[i]??'').slice(s,e);
    const p=typeof renderedPointToRaw==='function'?renderedPointToRaw(frag,raw,node,off):null;
    if(p){if(p.tok)return {i,off:s+p.tok.start,tok:{start:s+p.tok.start,end:s+p.tok.end}};if(p.off!=null)return {i,off:s+p.off};}
    try{const r=document.createRange();r.selectNodeContents(frag);r.setEnd(node,off);return {i,off:s+Math.min(raw.length,r.toString().length)};}catch(_){return {i,off:s};}
  }
  const root=el&&el.closest?el.closest('.cp162-container-root'):null;if(!root)return null;
  const frags=[...root.querySelectorAll('.cp162-source-fragment')];if(!frags.length)return null;
  try{
    for(const f of frags){const r=document.createRange();r.selectNode(f);const c=r.comparePoint(node,off);if(c<0)return {i:+f.dataset.cp162SourceIndex,off:+f.dataset.cp162SourceStart};if(c===0){const i=+f.dataset.cp162SourceIndex;return {i,off:+f.dataset.cp162SourceStart};}}
  }catch(_){}
  const f=frags[frags.length-1];return {i:+f.dataset.cp162SourceIndex,off:+f.dataset.cp162SourceEnd};
}
function cp162NormalPointToRaw(node,off){
  const el=typeof blockElOf==='function'?blockElOf(node):null;if(!el)return null;const i=[...editor.children].indexOf(el);if(i<0)return null;
  if(el.classList.contains('active'))return {i,off:offsetInBlock(el,node,off)};
  const raw=blocks[i]??'';if(raw.includes('\n'))return null;
  const p=renderedPointToRaw(el,raw,node,off);if(!p)return null;
  return p.tok?{i,off:p.tok.start,tok:p.tok}:{i,off:p.off};
}
function cp162SelectionRawRange(){
  const sel=getSelection();if(!sel||!sel.rangeCount||sel.isCollapsed)return null;const r=sel.getRangeAt(0);
  let a=cp162PointToRaw(r.startContainer,r.startOffset)||cp162NormalPointToRaw(r.startContainer,r.startOffset);
  let b=cp162PointToRaw(r.endContainer,r.endOffset)||cp162NormalPointToRaw(r.endContainer,r.endOffset);
  if(!a||!b)return null;
  const key=x=>x.i*100000000+x.off;if(key(a)>key(b)){const t=a;a=b;b=t;}
  const s=a.tok?a.tok.start:a.off,e=b.tok?b.tok.end:b.off;
  return {iS:a.i,offS:s,iE:b.i,offE:e,text:typeof assembleRawCopy==='function'?assembleRawCopy(a.i,s,b.i,e):null};
}
function cp162RawGlobal(i,off){let n=0;for(let k=0;k<i;k++)n+=(blocks[k]??'').length+1;return n+off;}
function cp162SetRawSelection(i,s,e){const el=editor.children[i];if(!el)return false;setCaretRange(el,s,e);return true;}
function cp162EditProjectedPoint(p){
  if(!p||p.i<0||p.i>=blocks.length)return false;
  const ctx=typeof cp162C2ContextForPoint==='function'?cp162C2ContextForPoint(p):null;cp162SuspendForBlock(p.i);
  const raw=blocks[p.i]??'',part=typeof structuredBlockParts==='function'?structuredBlockParts(raw):null;
  let ok=false;if(part&&typeof openStructuredEdit==='function')ok=!!openStructuredEdit(p.i,p.off,false);else{activate(p.i,p.off);ok=true;}
  cp162C2EditContext=ok?ctx:null;return ok;
}
function cp162DeleteRange(rr,insert){
  if(!rr)return false;insert=String(insert==null?'':insert);pushUndo();cp162Suspend();deactivate(true);
  if(rr.iS===rr.iE){blocks[rr.iS]=(blocks[rr.iS]??'').slice(0,rr.offS)+insert+(blocks[rr.iS]??'').slice(rr.offE);rerender(rr.iS);activate(rr.iS,rr.offS+insert.length);}
  else{
    const next=(blocks[rr.iS]??'').slice(0,rr.offS)+insert+(blocks[rr.iE]??'').slice(rr.offE);blocks[rr.iS]=next;
    for(let k=rr.iE;k>rr.iS;k--)removeBlockAt(k);rerender(rr.iS);activate(rr.iS,rr.offS+insert.length);
  }
  onEdited();return true;
}
function cp162RawToDomPoint(i,local){
  const frag=cp162FragmentFor(i,local);if(!frag)return null;const s=+frag.dataset.cp162SourceStart,e=+frag.dataset.cp162SourceEnd;
  const q=cp162Clamp(local,s,e)-s,raw=(blocks[i]??'').slice(s,e);
  if(typeof paperRawToDomPoint==='function'){try{return paperRawToDomPoint(frag,raw,q);}catch(_){}}
  let left=q;const w=document.createTreeWalker(frag,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode())){if(left<=n.data.length)return {node:n,off:left};left-=n.data.length;}return {node:frag,off:frag.childNodes.length};
}
function cp162RectForSource(i,local){
  const p=cp162RawToDomPoint(i,local);if(!p)return null;try{const r=document.createRange();r.setStart(p.node,p.off);r.collapse(true);let q=r.getBoundingClientRect();if(q&&(q.width||q.height))return q;const f=cp162FragmentFor(i,local);return f?f.getBoundingClientRect():null;}catch(_){return null;}
}

/* CP162C2 — Container-aware container-aware Enter/Backspace transactions.
   Direct compatibility purpose: loose list continuations and omitted-marker quote
   continuations remain editable without losing their Markdown container meaning. */
let cp162C2EditContext=null;
function cp162C2Seg(line){return line?cp162LineSegment(line):null;}
function cp162C2ContextForPoint(p){
  if(!p||!cp162Ast)return null;
  let best=null;
  const walk=(n,path)=>{
    const next=path.concat(n);let hit=null;
    for(const line of n.lines||[]){const s=cp162C2Seg(line);if(s&&s.blockIndex===p.i){if(p.off>=s.localStart&&p.off<=s.localEnd){hit={line,seg:s};break;}if(!hit)hit={line,seg:s};}}
    if(hit)best={node:n,path:next,line:hit.line,seg:hit.seg};
    for(const c of n.children||[])walk(c,next);
  };
  walk(cp162Ast,[]);if(!best)return null;
  const path=best.path,rev=path.slice().reverse();
  const paragraph=rev.find(n=>n.type==='paragraph')||null;
  const blank=rev.find(n=>n.type==='blank')||null;
  const leaf=paragraph||blank||best.node;
  const ownerIndex=(()=>{const at=path.lastIndexOf(leaf);for(let k=at-1;k>=0;k--)if(path[k].type==='blockquote'||path[k].type==='list_item')return k;return -1;})();
  const owner=ownerIndex>=0?path[ownerIndex]:null;
  const listItem=rev.find(n=>n.type==='list_item')||null;
  const listIndex=listItem?path.lastIndexOf(listItem)-1:-1;
  const list=listIndex>=0&&path[listIndex]&&path[listIndex].type==='list'?path[listIndex]:null;
  const outerListItem=listIndex>0?path.slice(0,listIndex).reverse().find(n=>n.type==='list_item')||null:null;
  const quote=rev.find(n=>n.type==='blockquote')||null;
  const sourceLines=(paragraph&&paragraph.lines&&paragraph.lines.length?paragraph.lines:(blank&&blank.lines)||[best.line]).map(line=>{const s=cp162C2Seg(line);return {i:s.blockIndex,start:s.localStart,end:s.localEnd};});
  const linePos=Math.max(0,sourceLines.findIndex(x=>x.i===p.i));
  let quotePrefix='';
  if(quote&&sourceLines.length){const x=sourceLines[0],r=blocks[x.i]??'';quotePrefix=r.slice(0,x.start);}
  if(quote&&!quotePrefix){for(const line of quote.lines||[]){const s=cp162C2Seg(line),r=s?(blocks[s.blockIndex]??''):'';const m=r.match(/^([ \t]*(?:>\s*)+)/);if(m){quotePrefix=m[1].endsWith(' ')?m[1]:m[1]+' ';break;}}}
  const itemPos=list&&listItem?list.children.indexOf(listItem):-1;
  return {
    i:p.i,off:p.off,nodeId:best.node.id,leafType:leaf.type,ownerType:owner&&owner.type,
    lineStart:sourceLines[linePos]?.start??best.seg.localStart,lineEnd:sourceLines[linePos]?.end??best.seg.localEnd,
    paragraphId:paragraph&&paragraph.id,paragraphLines:sourceLines,paragraphLinePos:linePos,
    listItemId:listItem&&listItem.id,listItemStart:listItem?.blockRange?.start??-1,listItemEnd:listItem?.blockRange?.end??-1,
    listItemMeta:listItem?{...(listItem.meta||{})}:null,listId:list&&list.id,listKind:list?.meta?.kind||null,listItemPos:itemPos,
    outerListItemId:outerListItem&&outerListItem.id,outerListItemStart:outerListItem?.blockRange?.start??-1,
    quoteId:quote&&quote.id,quotePrefix:quotePrefix||'> ',quoteStart:quote?.blockRange?.start??-1,quoteEnd:quote?.blockRange?.end??-1,
    synthetic:null
  };
}
function cp162C2State(info){
  if(info&&mathEditEl){const sr=structuredSelectionOffsets(mathEditEl,info);if(!sr||sr.start!==sr.end)return null;return {i:info.i,raw:structuredCurrentRaw(info),pos:info.start+sr.start,structured:true,info};}
  if(activeIndex<0)return null;const s=getSelection();if(!s||!s.rangeCount||!s.isCollapsed)return null;const el=editor.children[activeIndex];return {i:activeIndex,raw:getRawText(el),pos:caretOffsetIn(el),structured:false,info:null};
}
function cp162C2Prepare(st){
  cp162C2EditContext=null;
  if(st.structured){blocks[st.i]=st.raw;commitMathEdit();}
  else{blocks[st.i]=st.raw;deactivate(false);}
  pushUndo();cp162Suspend();
}
function cp162C2Set(i,raw){blocks[i]=raw;const el=editor.children[i];if(el){el.className='block';el.innerHTML=renderBlockHTML(raw);}}
function cp162C2Insert(i,raw){insertBlockAfter(i,raw);}
function cp162C2Finish(i,off,ctx){
  onEdited();updateBlockInfo();schedulePaginate();
  const part=structuredBlockParts(blocks[i]??'');
  if(part)openStructuredEdit(i,off,true);else activate(i,off);
  cp162C2EditContext=ctx?{...ctx,i}:null;
  return true;
}
function cp162C2ListPrefix(ctx,sameNumber=false){
  const raw=blocks[ctx.listItemStart]??'',m=raw.match(/^([ \t]*)([-+*]|(\d+)([.)]))([ \t]+)(\[([ xX])\]([ \t]+))?/);
  if(!m)return null;
  const indent=m[1],ws=m[5]||' ',task=!!m[6];
  if(m[3]){const n=Math.max(1,+m[3]||1)+(sameNumber?0:1);return indent+n+(m[4]||'.')+ws;}
  return indent+m[2]+ws+(task?'[ ]'+(m[8]||' '):'');
}
function cp162C2HasLaterOrderedSibling(ctx){
  if(ctx.listKind!=='ol'||ctx.listItemEnd<0)return false;
  for(let i=ctx.listItemEnd+1;i<blocks.length;i++){const p=structuredBlockParts(blocks[i]??'');if(!p||!p.isList)break;if(p.depth===(ctx.listItemMeta?.indentColumns||0)/2)return true;}
  return false;
}
function cp162C2NormalizeOrdered(anchor){const b=structuredNormalizeOrderedRegion(anchor);if(b)structuredRerenderBounds(b);}
function cp162C2EnterList(st,ctx){
  if(!ctx||ctx.ownerType!=='list_item'||!ctx.paragraphLines?.length)return false;
  const line=ctx.paragraphLines[ctx.paragraphLinePos];if(!line||st.i!==line.i||st.pos<line.start)return false;
  const pos=Math.max(0,Math.min(st.raw.length-line.start,st.pos-line.start)),content=st.raw.slice(line.start),head=content.slice(0,pos),tail=content.slice(pos),prefix=st.raw.slice(0,line.start);
  const firstLine=ctx.paragraphLinePos===0&&st.i===ctx.listItemStart;
  const emptyFirstSplit=firstLine&&pos===0;
  const sameNumber=firstLine&&!cp162C2HasLaterOrderedSibling(ctx);
  const nextPrefix=cp162C2ListPrefix(ctx,sameNumber);if(nextPrefix==null)return false;
  cp162C2Prepare(st);
  let target;
  if(pos===0&&!firstLine){cp162C2Set(st.i,nextPrefix+tail);target=st.i;}
  else{cp162C2Set(st.i,prefix+head);cp162C2Insert(st.i,nextPrefix+tail);target=st.i+1;}
  if(ctx.listKind==='ol'&&!sameNumber)cp162C2NormalizeOrdered(target);
  return cp162C2Finish(target,nextPrefix.length,{synthetic:'list-item',listPrefix:nextPrefix});
}
function cp162C2QuotePrefix(ctx){const p=ctx.quotePrefix||'> ';return p.endsWith(' ')?p:p+' ';}
function cp162C2EnterQuote(st,ctx){
  if(!ctx||ctx.ownerType!=='blockquote'||!ctx.paragraphLines?.length)return false;
  const line=ctx.paragraphLines[ctx.paragraphLinePos];if(!line||st.i!==line.i||st.pos<line.start)return false;
  const q=cp162C2QuotePrefix(ctx),sep=q.trimEnd();
  const pos=Math.max(0,Math.min(st.raw.length-line.start,st.pos-line.start));
  const currentContent=st.raw.slice(line.start),head=currentContent.slice(0,pos),tail=currentContent.slice(pos);
  cp162C2Prepare(st);
  for(const x of ctx.paragraphLines){const raw=x.i===st.i?st.raw:(blocks[x.i]??'');cp162C2Set(x.i,q+raw.slice(x.start));}
  let target;
  if(pos===0&&ctx.paragraphLinePos>0){cp162C2Set(st.i,sep);cp162C2Insert(st.i,q+tail);target=st.i+1;}
  else{cp162C2Set(st.i,q+head);cp162C2Insert(st.i,sep);cp162C2Insert(st.i+1,q+tail);target=st.i+2;}
  return cp162C2Finish(target,q.length,{synthetic:'quote-new-paragraph',quotePrefix:q,separatorIndex:target-1});
}
function cp162C2ExitSyntheticQuote(st,ctx){
  if(!ctx||ctx.synthetic!=='quote-new-paragraph')return false;const q=cp162C2QuotePrefix(ctx);
  if(st.raw.slice(q.length).length||st.pos<q.length)return false;
  cp162C2Prepare(st);const sep=ctx.separatorIndex;
  if(sep>=0&&sep<blocks.length)cp162C2Set(sep,'');cp162C2Set(st.i,'');
  return cp162C2Finish(st.i,0,null);
}
function cp162C2ExitSyntheticList(st,ctx){
  if(!ctx||ctx.synthetic!=='list-item')return false;const p=structuredBlockParts(st.raw);if(!p||!p.isList||p.content.length)return false;
  cp162C2Prepare(st);cp162C2Set(st.i,'');cp162C2Insert(st.i,'');return cp162C2Finish(st.i+1,0,null);
}
function cp162C2HandleEnter(info,shift){
  if(shift||!cp162C2EditContext||settings.srcmode||(typeof inPaperMode==='function'&&inPaperMode()))return false;
  const st=cp162C2State(info),ctx=cp162C2EditContext;if(!st||st.i!==ctx.i)return false;
  if(cp162C2ExitSyntheticQuote(st,ctx)||cp162C2ExitSyntheticList(st,ctx))return true;
  if(ctx.ownerType==='blockquote')return cp162C2EnterQuote(st,ctx);
  if(ctx.ownerType==='list_item')return cp162C2EnterList(st,ctx);
  return false;
}
function cp162C2MergeSoftLine(st,ctx,forward=false){
  const lines=ctx.paragraphLines||[],pos=ctx.paragraphLinePos;if(!lines.length)return false;
  const a=forward?lines[pos]:lines[pos-1],b=forward?lines[pos+1]:lines[pos];if(!a||!b)return false;
  if((forward&&st.i!==a.i)||(!forward&&st.i!==b.i))return false;
  const aRaw=a.i===st.i?st.raw:(blocks[a.i]??''),bRaw=b.i===st.i?st.raw:(blocks[b.i]??'');
  const caret=aRaw.length,content=bRaw.slice(b.start);
  cp162C2Prepare(st);cp162C2Set(a.i,aRaw+content);removeBlockAt(b.i);
  return cp162C2Finish(a.i,caret,null);
}
function cp162C2CurrentMarker(raw){return String(raw??'').match(/^([ \t]*)([-+*]|(\d+)([.)]))([ \t]+)(\[([ xX])\]([ \t]+))?/);}
function cp162C2BackspaceListItem(st,ctx){
  if(!ctx||ctx.ownerType!=='list_item'||ctx.paragraphLinePos!==0||st.i!==ctx.listItemStart)return false;
  const m=cp162C2CurrentMarker(st.raw);if(!m||st.pos!==m[0].length)return false;const content=st.raw.slice(m[0].length);
  if(ctx.outerListItemId){cp162C2Prepare(st);cp162C2Set(st.i,m[1]+content);return cp162C2Finish(st.i,m[1].length,null);}
  if(ctx.listItemPos>0){const indent=' '.repeat((m[1]||'').length+(m[2]||'').length+(m[5]||'').length);cp162C2Prepare(st);cp162C2Set(st.i,'');cp162C2Insert(st.i,indent+content);if(ctx.listKind==='ol')cp162C2NormalizeOrdered(st.i+1);return cp162C2Finish(st.i+1,indent.length,null);}
  return false;
}
function cp162C2BackspaceQuoteParagraph(st,ctx){
  if(!ctx||ctx.ownerType!=='blockquote'||ctx.paragraphLinePos!==0)return false;const q=cp162C2QuotePrefix(ctx);if(st.pos!==ctx.lineStart)return false;
  const sep=st.i-1;if(sep<1||!/^\s*>\s*$/.test(blocks[sep]??''))return false;
  let prev=sep-1;while(prev>=0&&/^\s*>\s*$/.test(blocks[prev]??''))prev--;if(prev<0)return false;
  const content=st.raw.slice(ctx.lineStart),caret=(blocks[prev]??'').length;
  cp162C2Prepare(st);cp162C2Set(prev,(blocks[prev]??'')+content);removeBlockAt(st.i);return cp162C2Finish(prev,caret,null);
}
function cp162C2HandleBoundary(e,info){
  if(!cp162C2EditContext||settings.srcmode||(typeof inPaperMode==='function'&&inPaperMode())||(e.key!=='Backspace'&&e.key!=='Delete'))return false;
  const st=cp162C2State(info),ctx=cp162C2EditContext;if(!st||st.i!==ctx.i)return false;
  const atStart=st.pos===ctx.lineStart,atEnd=st.pos===ctx.lineEnd||st.pos===st.raw.length;
  if(e.key==='Backspace'&&atStart){
    if(ctx.paragraphLinePos>0){e.preventDefault();return cp162C2MergeSoftLine(st,ctx,false);}
    if(cp162C2BackspaceQuoteParagraph(st,ctx)){e.preventDefault();return true;}
    if(cp162C2BackspaceListItem(st,ctx)){e.preventDefault();return true;}
  }
  if(e.key==='Delete'&&atEnd&&ctx.paragraphLinePos+1<(ctx.paragraphLines||[]).length){e.preventDefault();return cp162C2MergeSoftLine(st,ctx,true);}
  return false;
}
const cp162C2OrigStructuredEnter=handleStructuredEditEnter;
handleStructuredEditEnter=function(info,shift){if(cp162C2HandleEnter(info,shift))return true;return cp162C2OrigStructuredEnter(info,shift);};
const cp162C2OrigStructuredBoundary=structuredBoundaryDelete;
structuredBoundaryDelete=function(e,info){if(cp162C2HandleBoundary(e,info))return true;return cp162C2OrigStructuredBoundary(e,info);};
const cp162C2OrigEnter=handleEnter;
handleEnter=function(shift){if(cp162C2HandleEnter(null,shift))return true;return cp162C2OrigEnter(shift);};
const cp162C2OrigBackspace=handleBackspace;
handleBackspace=function(){const e={key:'Backspace',preventDefault(){}};if(cp162C2HandleBoundary(e,null))return true;return cp162C2OrigBackspace();};
window.__CP162_CONTAINER_EDIT__=Object.freeze({
 checkpoint:'CP162C2',version:'1.0.7',policy:'ekdeta-original-node-split-upstream-exact-raw',
 contextFor:(i,off)=>cp162C2ContextForPoint({i,off}),begin:(i,off)=>cp162EditProjectedPoint({i,off}),
 get context(){return cp162C2EditContext?JSON.parse(JSON.stringify(cp162C2EditContext)):null;}
});


/* Preserve CP161 as fallback only; CP162 owns projected containers. */
if(cp162OrigListCompatApply){
  listCompatApply=function(){if(editor&&editor.dataset.cp162ContainerAst==='1')return;return cp162OrigListCompatApply();};
}

/* Lifecycle adapters. */
const cp162Orig={mountDoc,activate,deactivate,rerender,insertBlockAfter,removeBlockAt,onSelectionChange,onEdited,runInlineTransform,cmdCopyMD,caSourceForCopy};
mountDoc=function(md){cp162C2EditContext=null;cp162Suspend();const r=cp162Orig.mountDoc(md);cp162Schedule();return r;};
activate=function(i,off){cp162C2EditContext=null;cp162SuspendForBlock(i);return cp162Orig.activate(i,off);};
deactivate=function(commit){cp162C2EditContext=null;const r=cp162Orig.deactivate(commit);cp162Schedule();return r;};
rerender=function(i){if(cp162Projected())cp162SuspendForBlock(i);const r=cp162Orig.rerender(i);cp162Schedule();return r;};
insertBlockAfter=function(i,src){if(cp162Projected())cp162Suspend();const r=cp162Orig.insertBlockAfter(i,src);cp162Schedule();return r;};
removeBlockAt=function(i){if(cp162Projected())cp162Suspend();const r=cp162Orig.removeBlockAt(i);cp162Schedule();return r;};
onEdited=function(skipDirty){const r=cp162Orig.onEdited(skipDirty);cp162Schedule();return r;};
onSelectionChange=function(){
  if(!composing&&suppressSel<=0&&!settings.srcmode&&!(typeof inPaperMode==='function'&&inPaperMode())){
    const sel=getSelection();if(sel&&sel.rangeCount&&sel.isCollapsed){const p=cp162PointToRaw(sel.anchorNode,sel.anchorOffset);if(p)return cp162EditProjectedPoint(p);}
  }
  return cp162Orig.onSelectionChange();
};
/* The legacy document listener was registered with the pre-wrap function object.
   Mouseup normally calls the live binding above, but Chromium may dispatch a fast-click
   selectionchange only after mouseup. A second listener closes that late-event gap. */
function cp162SelectionChangeBridge(){
  if(composing||suppressSel>0||settings.srcmode||(typeof inPaperMode==='function'&&inPaperMode()))return;
  if(typeof mouseGesture!=='undefined'&&mouseGesture)return;
  const sel=getSelection();if(!sel||!sel.rangeCount||!sel.isCollapsed)return;
  const p=cp162PointToRaw(sel.anchorNode,sel.anchorOffset);if(p)cp162EditProjectedPoint(p);
}
document.addEventListener('selectionchange',cp162SelectionChangeBridge);
/* A projected child is visually nested inside the root block, so the legacy click router
   resolves it as the root source line. Hold selectionchange during a projected text gesture,
   then resolve the native caret point against CP162 source fragments on mouseup. */
let cp162MouseCapture=null;
editor.addEventListener('mousedown',e=>{
  if(e.button!==0||settings.srcmode||(typeof inPaperMode==='function'&&inPaperMode()))return;
  const t=e.target&&e.target.closest?e.target.closest('.cp162-container-root'):null;if(!t)return;
  if(e.target.closest('a,input,button,img,video,audio,.md-math,.md-link'))return;
  cp162MouseCapture={x:e.clientX,y:e.clientY};suppressSel++;
},true);
document.addEventListener('mouseup',e=>{
  if(!cp162MouseCapture)return;const cap=cp162MouseCapture;cp162MouseCapture=null;
  const release=()=>requestAnimationFrame(()=>{suppressSel=Math.max(0,suppressSel-1);});
  const sel=getSelection();if(sel&&sel.rangeCount&&!sel.isCollapsed){release();return;}
  const cp=typeof paperClientPoint==='function'?paperClientPoint(e.clientX,e.clientY):(typeof caretFromPoint==='function'?caretFromPoint(e.clientX,e.clientY):null);
  const node=cp&&(cp.node||cp.offsetNode),off=cp&&(cp.off!=null?cp.off:cp.offset);
  const p=node?cp162PointToRaw(node,off):null;
  if(p){e.preventDefault();cp162EditProjectedPoint(p);}release();
},true);
/* CP174.7: CP162's legacy range adapter expands points inside every
   style token to the whole wrapper. That is useful for copy/toggle commands,
   but a colour overlay must keep the user's exact character interval. Plain
   blocks already have the canonical CP137/CP138 precise mapper, so colours
   bypass this pre-adapter there. Recursive container fragments only need the
   source-line base added to that same mapper; never fall back to a whole-token
   snap after the precise mapper fails. */
function cp162ColorSelectionRawRange(){
  const sel=getSelection();if(!sel||!sel.rangeCount||sel.isCollapsed)return null;
  const rg=sel.getRangeAt(0);
  const projected=node=>{const h=node&&(node.nodeType===1?node:node.parentElement);return h&&h.closest?h.closest('.cp162-container-root'):null;};
  if(!projected(rg.startContainer)&&!projected(rg.endContainer))return null;
  const point=(node,off)=>{
    const h=node&&(node.nodeType===1?node:node.parentElement),frag=h&&h.closest?h.closest('.cp162-source-fragment'):null;
    if(frag&&editor.contains(frag)){
      const i=+frag.dataset.cp162SourceIndex,s=+frag.dataset.cp162SourceStart,e=+frag.dataset.cp162SourceEnd;
      const raw=String(blocks[i]??'').slice(s,e),p=inlineRenderedPoint(frag,raw,node,off);
      if(!p)return null;
      return p.tok?{i,off:s+p.tok.start,tok:{start:s+p.tok.start,end:s+p.tok.end}}:{i,off:s+p.off};
    }
    if(projected(node))return cp162PointToRaw(node,off); // structural fragment boundary, no style token
    const el=blockElOf(node);if(!el)return null;const i=[...editor.children].indexOf(el);if(i<0)return null;
    if(el.classList.contains('active'))return {i,off:offsetInBlock(el,node,off)};
    const p=inlineRenderedPoint(el,String(blocks[i]??''),node,off);if(!p)return null;
    return p.tok?{i,off:p.tok.start,tok:p.tok}:{i,off:p.off};
  };
  let a=point(rg.startContainer,rg.startOffset),b=point(rg.endContainer,rg.endOffset);
  if(!a||!b)return {unsafe:true};
  const key=x=>x.i*100000000+x.off;if(key(a)>key(b)){const t=a;a=b;b=t;}
  return {iS:a.i,offS:a.tok?a.tok.start:a.off,iE:b.i,offE:b.tok?b.tok.end:b.off};
}
runInlineTransform=function(transformer,options){
  if(options&&options.kind==='color'){
    const rr=cp162ColorSelectionRawRange();
    if(!rr)return cp162Orig.runInlineTransform(transformer,options);
    if(rr.unsafe){toast(TT('無法精準定位選取範圍，請重新選取後再套用顏色','Could not locate the exact selection; select the text again'));return false;}
    if(rr.iS!==rr.iE){toast(TT('請只選取同一個段落內的文字','Select text within a single paragraph'));return false;}
    cp162SuspendForBlock(rr.iS);activate(rr.iS,rr.offE);cp162SetRawSelection(rr.iS,rr.offS,rr.offE);
    return cp162Orig.runInlineTransform(transformer,options);
  }
  const rr=cp162SelectionRawRange();
  if(rr&&rr.iS===rr.iE){cp162SuspendForBlock(rr.iS);activate(rr.iS,rr.offE);cp162SetRawSelection(rr.iS,rr.offS,rr.offE);return cp162Orig.runInlineTransform(transformer,options);}
  return cp162Orig.runInlineTransform(transformer,options);
};
cmdCopyMD=function(){const rr=cp162SelectionRawRange();if(!rr)return cp162Orig.cmdCopyMD();const text=rr.text||'';if(!text){toast('沒有可複製的內容');return;}const done=()=>toast(TT('已複製 Markdown（','Copied Markdown (')+text.length+TT(' 字元）',' chars)'));if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(done).catch(()=>fallbackCopy(text,done));else fallbackCopy(text,done);};
caSourceForCopy=function(){const rr=cp162SelectionRawRange();return rr?(rr.text||''):cp162Orig.caSourceForCopy();};

/* Source viewport must resolve a hidden shadow block through its projected fragment. */
if(typeof srcRenderedPointRect==='function'){
  const orig=srcRenderedPointRect;srcRenderedPointRect=function(i,local){return cp162RectForSource(i,local)||orig(i,local);};
}

/* Plain copy / cut / paste on a rendered recursive projection. */
editor.addEventListener('copy',e=>{try{const rr=cp162SelectionRawRange();if(!rr||!rr.text)return;e.clipboardData.setData('text/plain',rr.text);e.preventDefault();e.stopImmediatePropagation();}catch(_){ }},true);
editor.addEventListener('cut',e=>{try{const rr=cp162SelectionRawRange();if(!rr||!rr.text)return;e.clipboardData.setData('text/plain',rr.text);e.preventDefault();e.stopImmediatePropagation();cp162DeleteRange(rr,'');}catch(_){ }},true);
editor.addEventListener('paste',e=>{try{const rr=cp162SelectionRawRange();if(!rr)return;let text=e.clipboardData.getData('text/plain')||'';const html=e.clipboardData.getData('text/html');if(html&&typeof htmlToMd==='function'){try{text=htmlToMd(html)||text;}catch(_){}}e.preventDefault();e.stopImmediatePropagation();cp162DeleteRange(rr,text.replace(/\r\n?/g,'\n'));}catch(_){ }},true);

/* Projected task checkbox maps to the canonical source block, not the root block. */
editor.addEventListener('click',e=>{const c=e.target.closest&&e.target.closest('.cp162-task-check');if(!c)return;e.preventDefault();e.stopImmediatePropagation();const i=+c.dataset.cp162SourceIndex;if(!(i>=0&&i<blocks.length))return;pushUndo();cp162SuspendForBlock(i);blocks[i]=/\[[xX]\]/.test(blocks[i])?blocks[i].replace(/\[[xX]\]/,'[ ]'):blocks[i].replace(/\[ \]/,'[x]');rerender(i);onEdited();},true);

/* Paper/TW_THESIS click route: resolve nested source child before the legacy root-block handler. */
editor.addEventListener('click',e=>{
  if(!(typeof inPaperMode==='function'&&inPaperMode())||settings.srcmode)return;
  const sel=getSelection();if(sel&&!sel.isCollapsed)return;
  const cp=typeof paperClientPoint==='function'?paperClientPoint(e.clientX,e.clientY):null;
  const p=cp?cp162PointToRaw(cp.node,cp.off):cp162PointToRaw(e.target,0);if(!p)return;
  e.preventDefault();e.stopImmediatePropagation();cp162SuspendForBlock(p.i);if(typeof openPaperEdit==='function')openPaperEdit(p.i,p.off);
},true);

/* Reapply after local Paper/table/token hosts close. */
if(typeof finishPaperEdit==='function'){const o=finishPaperEdit;finishPaperEdit=function(commit){const r=o(commit);cp162Schedule();return r;};}
if(typeof deletePaperEditBlock==='function'){const o=deletePaperEditBlock;deletePaperEditBlock=function(){const r=o();cp162Schedule();return r;};}
if(typeof exitTableEdit==='function'){const o=exitTableEdit;exitTableEdit=function(){const r=o();cp162Schedule();return r;};}
if(typeof commitMathEdit==='function'){const o=commitMathEdit;commitMathEdit=function(){const r=o();cp162Schedule();return r;};}

/* CSS kept renderer-only: no generated marker is serialized. */
const style=document.createElement('style');style.id='cp162-container-style';style.textContent=`
.block.cp162-source-shadow{display:none!important}
.block.cp162-container-root{min-width:0}
.cp162-container-root .cp162-paragraph{margin-top:.35em;margin-bottom:.35em}
.cp162-container-root .cp162-list{margin:.2em 0;padding-left:1.9em}
.cp162-container-root .cp162-list .cp162-list{margin:.15em 0;padding-left:1.55em}
.cp162-container-root .cp162-list-item>.cp162-paragraph:first-child,
.cp162-container-root .cp162-list-item>.cp162-heading:first-child,
.cp162-container-root .cp162-list-item>.cp162-blockquote:first-child{margin-top:0}
.cp162-container-root .cp162-list-item>.cp162-paragraph:last-child,
.cp162-container-root .cp162-list-item>.cp162-heading:last-child,
.cp162-container-root .cp162-list-item>.cp162-blockquote:last-child{margin-bottom:0}
.cp162-container-root .cp162-heading{margin:.35em 0}
.cp162-container-root .cp162-list-item>.cp162-heading{display:block}
.cp162-container-root .cp162-blockquote{margin:.45em 0}
.cp162-container-root .cp162-blockquote>.cp162-paragraph:first-child{margin-top:0}
.cp162-container-root .cp162-blockquote>.cp162-paragraph:last-child{margin-bottom:0}
.cp162-container-root .cp162-blank{min-height:.8em;margin:0}
.cp162-container-root .cp162-task-body{display:inline;min-width:0}
.cp162-container-root .cp162-task-body>.cp162-paragraph:first-child{display:inline;margin:0}
.cp162-container-root .cp162-task-body>.cp162-paragraph:not(:first-child){margin-left:0}
.cp162-container-root .cp162-task-check{vertical-align:middle;margin-right:.45em}
.cp162-container-root .cp162-softbreak{white-space:pre}
.cp162-container-root .cp162-source-fragment{min-width:0}
.cp162-container-root .cp162-atomic-host{display:contents}
.cp162-container-root .cp162-setext-heading{margin:.35em 0}
.cp162-container-root .cp162-indented-code{margin:.45em 0}
.cp162-container-root .cp162-alert{margin:.55em 0;padding:.65em .8em;border-left:4px solid currentColor;border-radius:4px}
.cp162-container-root .cp162-alert .md-alert-title{font-weight:700;margin-bottom:.3em;text-transform:uppercase}
.cp162-container-root .cp162-alert .md-alert-body>:first-child{margin-top:0}
.cp162-container-root .cp162-alert .md-alert-body>:last-child{margin-bottom:0}
`;
document.head.appendChild(style);


/* CP162D ordinary-Markdown atomic block compatibility: begin */

'use strict';
if (window.__CP162D_ATOMIC_COMPAT__) return;

/* Direct relation to Markdown loose-Markdown compatibility:
   Markdown parses tables / HTML / definitions recursively inside list and quote containers,
   then edits the smallest original source field. This layer follows that behavior only in
   ordinary Markdown. TW_THESIS/Paper keeps its custom table metadata, controls and flat paginator. */
function cp162DOrdinary(){
  return !settings.srcmode && !(typeof inPaperMode==='function' && inPaperMode());
}
function cp162DHasTwThesisTableMeta(raw){ return !!tableLayoutParts(String(raw==null?'':raw)).hasMeta; }
function cp162DTableEligible(raw){ return cp162DOrdinary() && blockType(raw)==='table' && !cp162DHasTwThesisTableMeta(raw); }
/* CP137 migration repair must not reinterpret deliberate raw-HTML block content as Markdown.
   Protect the exact HTML block bytes, repair legacy pollution only outside those blocks, then restore. */
const cp162DBaseRawIntegrityRepairForFile=rawIntegrityRepairForFile;
function cp162DProtectHtmlBlocks(source){
  source=String(source==null?'':source);const chunks=source.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)||[source],kept=[];let out='';
  for(let i=0;i<chunks.length;){
    if(chunks[i]===''&&i===chunks.length-1)break;
    const body=chunks[i].replace(/(?:\r\n|\r|\n)$/,''),ho=typeof markdownHtmlBlockOpen==='function'?markdownHtmlBlockOpen(body):null;
    if(!ho){out+=chunks[i++];continue;}
    let exact=chunks[i],depth=markdownHtmlTagDelta(body,ho.tag),j=i+1;
    while(j<chunks.length&&depth>0){
      const line=chunks[j].replace(/(?:\r\n|\r|\n)$/,'');if(!line.trim())break;
      exact+=chunks[j];depth+=markdownHtmlTagDelta(line,ho.tag);j++;
    }
    const token='\uE520CP162DHTML'+kept.length+'\uE521';kept.push(exact);out+=token;i=j;
  }
  return {text:out,kept,restore(text){let z=String(text);for(let i=0;i<kept.length;i++)z=z.split('\uE520CP162DHTML'+i+'\uE521').join(kept[i]);return z;}};
}
rawIntegrityRepairForFile=function(file,text){
  const source=String(text==null?'':text),p=cp162DProtectHtmlBlocks(source);if(!p.kept.length)return cp162DBaseRawIntegrityRepairForFile(file,source);
  const r=cp162DBaseRawIntegrityRepairForFile(file,p.text),restored=p.restore(r.text);
  return {...r,text:restored,changed:restored!==source,protectedHtmlBlocks:p.kept.length};
};
function cp162DNormRef(s){ return String(s==null?'':s).trim().replace(/\s+/g,' ').toLowerCase(); }
function cp162DLinkDefParts(raw){
  raw=String(raw==null?'':raw);
  const m=raw.match(/^(\s*)\[([^\]]+)\]:(\s*)(<?)([^\s>]+)(>?)(?:(\s+)(["'(])([^\n]*)(["')]))?(\s*)$/);
  if(!m)return null;
  return {kind:'link',lead:m[1],name:m[2],colonSpace:m[3],angleOpen:m[4],url:m[5],angleClose:m[6],titleGap:m[7]||'',titleOpen:m[8]||'',title:m[9]||'',titleClose:m[10]||'',trail:m[11]||'',hasTitle:!!m[8]};
}
function cp162DFootDefParts(raw){
  raw=String(raw==null?'':raw);
  const m=raw.match(/^(\s*)\[\^([^\]]+)\]:(\s?)([\s\S]*)$/);
  return m?{kind:'footnote',lead:m[1],name:m[2],colonSpace:m[3],content:m[4]}:null;
}
function cp162DBuildDefinition(p,vals){
  if(p.kind==='link'){
    const title=String(vals.title==null?p.title:vals.title),want=p.hasTitle||title.length>0;
    return p.lead+'['+String(vals.name==null?p.name:vals.name)+']:'+p.colonSpace+p.angleOpen+
      String(vals.url==null?p.url:vals.url)+p.angleClose+
      (want?(p.titleGap||' ')+(p.titleOpen||'"')+title+(p.titleClose||'"'):'')+p.trail;
  }
  return p.lead+'[^'+String(vals.name==null?p.name:vals.name)+']:'+p.colonSpace+
    String(vals.content==null?p.content:vals.content);
}
function cp162DReferenceDefs(){
  const map=new Map();
  for(const raw of blocks||[]){const p=cp162DLinkDefParts(raw);if(!p)continue;const k=cp162DNormRef(p.name);if(k&&!map.has(k))map.set(k,p);}
  return map;
}

/* Footnote definitions are atomic blocks in the editor, including inside containers. */
const cp162DBaseBlockType=blockType;
blockType=function(src){
  const raw=String(src==null?'':src);
  if(/^\s*\[\^[^\]]+\]:/.test(raw))return 'def_footnote';
  return cp162DBaseBlockType(raw);
};
const cp162DBaseIsAtomic=cp162IsAtomic;
cp162IsAtomic=function(line){
  if(cp162DBaseIsAtomic(line))return true;
  return !!(line&&line.record&&blockType(line.record.raw)==='def_footnote');
};
const cp162DBaseParseAtomic=cp162ParseAtomic;
cp162ParseAtomic=function(line){
  const t=line&&line.record?blockType(line.record.raw):'';
  if(t==='def_footnote')return cp162Node('definition',[line],{children:[],meta:{blockType:t,defKind:'footnote'},raw:line.record.raw});
  const n=cp162DBaseParseAtomic(line);
  if(n&&n.type==='definition')n.meta={...(n.meta||{}),defKind:'link'};
  return n;
};

/* Reference links: the editor recognizes full and collapsed forms, but not shortcut form.
   Definitions are matched case-insensitively with whitespace normalization; first definition wins. */
const cp162DBaseInlineMD=inlineMD;
inlineMD=function(src){
  if(!cp162DOrdinary())return cp162DBaseInlineMD(src);
  const defs=cp162DReferenceDefs();
  if(!defs.size)return cp162DBaseInlineMD(src);
  const stash=[];
  let raw=String(src==null?'':src);
  raw=raw.replace(/(^|[^!\\])\[([^\]\n]+)\]\[([^\]\n]*)\]/g,(m,pre,label,id)=>{
    const key=cp162DNormRef(id||label),d=defs.get(key);if(!d)return m;
    const token='\uE210'+stash.length+'\uE211';
    stash.push({label,d,key});return pre+token;
  });
  let html=cp162DBaseInlineMD(raw);
  html=html.replace(/\uE210(\d+)\uE211/g,(_,n)=>{
    const x=stash[+n];if(!x)return '';
    const href=sanitizeURL(x.d.url.trim(),false),title=x.d.title?` title="${escapeHtml(x.d.title)}"`:'';
    return `<a class="md-a md-ref-a" data-ref="${escapeHtml(x.key)}" href="${href}"${title}>${cp162DBaseInlineMD(x.label)}</a>`;
  });
  return html;
};

/* Preserve the ordinary/TW_THESIS rendering split. Only ordinary Markdown gets structured definition
   wrappers; TW_THESIS/Paper keeps the pre-existing renderer byte-for-byte. */
const cp162DBaseRenderBlockHTML=renderBlockHTML;
renderBlockHTML=function(src){
  const t=blockType(src);
  if(cp162DOrdinary()&&t==='def_link'){
    const p=cp162DLinkDefParts(src);if(p)return `<div class="md-def-link cp162d-def-view" data-cp162d-def="link"><span class="md-def-label">[${escapeHtml(p.name)}]:</span> <span class="md-def-url">${escapeHtml(p.url)}</span>${p.hasTitle?` <span class="md-def-title">${escapeHtml(p.title)}</span>`:''}</div>`;
  }
  if(cp162DOrdinary()&&t==='def_footnote'){
    const p=cp162DFootDefParts(src);if(p)return `<div class="md-def-footnote cp162d-def-view" data-cp162d-def="footnote"><a class="fn-tag" id="fn-def-${escapeHtml(p.name)}" href="#fn-ref-${escapeHtml(p.name)}">[^${escapeHtml(p.name)}]</a>: <span class="md-def-content">${cp162DBaseInlineMD(p.content)||''}</span></div>`;
  }
  return cp162DBaseRenderBlockHTML(src);
};

/* ----- exact table source map ----- */
function cp162DScanTableLine(line){
  line=String(line);const pipes=[];let code=0;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch==='\\'){if(i+1<line.length)i++;continue;}
    if(ch==='`'){let j=i;while(line[j]==='`')j++;const n=j-i;if(!code)code=n;else if(code===n)code=0;i=j-1;continue;}
    /* 1.2.6：與 splitTableRow 同一個數學判斷（tableMathSpanEnd，02.js）。 */
    if(ch==='$'&&!code){const e=tableMathSpanEnd(line,i);if(e>0){i=e-1;continue;}continue;}
    if(ch==='|'&&!code)pipes.push(i);
  }
  const nonStart=line.search(/\S/),nonEnd=(()=>{for(let i=line.length-1;i>=0;i--)if(!/\s/.test(line[i]))return i;return -1;})();
  let outerLeft=nonStart>=0&&line[nonStart]==='|',outerRight=nonEnd>=0&&line[nonEnd]==='|';
  if(outerLeft&&outerRight&&pipes.length===1){outerLeft=false;outerRight=false;}
  let bounds=[];const div=pipes.slice();if(outerLeft&&div.length)div.shift();if(outerRight&&div.length)div.pop();
  const starts=[outerLeft?pipes[0]+1:0,...div.map(x=>x+1)],ends=[...div,outerRight?pipes[pipes.length-1]:line.length];
  for(let k=0;k<Math.min(starts.length,ends.length);k++){
    let a=starts[k],b=ends[k];while(a<b&&/[ \t]/.test(line[a]))a++;while(b>a&&/[ \t]/.test(line[b-1]))b--;
    bounds.push({start:a,end:b,raw:line.slice(a,b)});
  }
  return {line,pipes,outerLeft,outerRight,cells:bounds,values:splitTableRow(line)};
}
function cp162DTableSyntax(raw){
  raw=String(raw==null?'':raw);const lines=raw.split('\n'),scans=lines.map(cp162DScanTableLine),head=scans[0]||cp162DScanTableLine(''),delim=scans[1]||cp162DScanTableLine('');
  const modelRows=[0,...Array(Math.max(0,lines.length-2)).keys()].map((_,idx)=>idx===0?0:idx+1);
  return {raw,lines,scans,head,delim,modelLine:[0,...lines.slice(2).map((_,i)=>i+2)],outerLeft:head.outerLeft,outerRight:head.outerRight};
}
function cp162DEscapeCell(text){
  const raw=String(text==null?'':text);let out='',code=0,math=0;
  for(let i=0;i<raw.length;i++){
    const ch=raw[i];
    if(ch==='\\'){out+=ch;if(i+1<raw.length)out+=raw[++i];continue;}
    if(ch==='`'&&!math){let j=i;while(raw[j]==='`')j++;const n=j-i;if(!code)code=n;else if(code===n)code=0;out+=raw.slice(i,j);i=j-1;continue;}
    if(ch==='$'&&!code){let j=i;while(raw[j]==='$')j++;const n=j-i;if(!math)math=n;else if(math===n)math=0;out+=raw.slice(i,j);i=j-1;continue;}
    out+=(ch==='|'&&!code&&!math)?'\\|':ch;
  }
  return out;
}
function cp162DAlignToken(old,a){
  const dash=Math.max(3,(String(old).match(/-/g)||[]).length),d='-'.repeat(dash);
  return a==='center'?':'+d+':':a==='right'?d+':':a==='left'?':'+d:d;
}
function cp162DCellRawFromDOM(cell){return cell.textContent.replace(/\n+/g,' ').trim();}
function cp162DExactTableRaw(raw,model){
  const syn=cp162DTableSyntax(raw),repls=[];
  if(model.rows.length!==syn.modelLine.length||model.rows.some((r,ri)=>r.length!==(syn.scans[syn.modelLine[ri]]?.cells.length||0)))return cp162DSerializeTable(model,syn);
  for(let r=0;r<model.rows.length;r++){
    const li=syn.modelLine[r],scan=syn.scans[li];
    for(let c=0;c<model.rows[r].length;c++){
      const cell=scan.cells[c],old=scan.values[c]??'',neu=String(model.rows[r][c]??'');
      if(cell&&neu!==old)repls.push({line:li,start:cell.start,end:cell.end,text:cp162DEscapeCell(neu)});
    }
  }
  for(let c=0;c<model.align.length;c++){
    const cell=syn.delim.cells[c],old=(()=>{const t=syn.delim.values[c]||'';const L=t.startsWith(':'),R=t.endsWith(':');return L&&R?'center':R?'right':L?'left':'';})();
    if(cell&&(model.align[c]||'')!==old)repls.push({line:1,start:cell.start,end:cell.end,text:cp162DAlignToken(cell.raw,model.align[c]||'')});
  }
  const grouped=new Map();for(const x of repls){if(!grouped.has(x.line))grouped.set(x.line,[]);grouped.get(x.line).push(x);}
  const lines=syn.lines.slice();for(const [li,rs] of grouped){let line=lines[li];for(const x of rs.sort((a,b)=>b.start-a.start))line=line.slice(0,x.start)+x.text+line.slice(x.end);lines[li]=line;}
  return lines.join('\n');
}
function cp162DStyleFromScan(scan){
  const c=scan.cells;if(!c.length)return {prefix:'',suffix:'',between:' | '};
  return {prefix:scan.line.slice(0,c[0].start),suffix:scan.line.slice(c[c.length-1].end),between:c.length>1?scan.line.slice(c[0].end,c[1].start):' | '};
}
function cp162DSerializeTable(model,syn){
  const nc=model.rows[0].length,headStyle=cp162DStyleFromScan(syn.head),bodyRef=syn.scans[2]||syn.head,bodyStyle=cp162DStyleFromScan(bodyRef),delStyle=cp162DStyleFromScan(syn.delim);
  const line=(row,st)=>st.prefix+row.map(cp162DEscapeCell).join(st.between||' | ')+st.suffix;
  const align=model.align.slice(0,nc);while(align.length<nc)align.push('');
  const dl=align.map((a,c)=>cp162DAlignToken(syn.delim.cells[c]?.raw||'---',a));
  const out=[line(model.rows[0],headStyle),line(dl,delStyle)];
  for(let r=1;r<model.rows.length;r++)out.push(line(model.rows[r],syn.scans[r+1]?cp162DStyleFromScan(syn.scans[r+1]):bodyStyle));
  return out.join('\n');
}

function cp162DCommitExact(reason){
  clearTimeout(losslessSyncTimer);losslessSyncTimer=null;
  const text=serialize(),file=activeFile(),doc=typeof losslessActiveDoc==='function'?losslessActiveDoc():null;
  if(file&&doc&&typeof losslessEnabled==='function'&&losslessEnabled()){
    const before=doc.serialize();doc.syncNormalized(losslessNormalized(text));
    if(typeof txnEnabled==='function'&&txnEnabled()&&typeof txnRecordFromRawChange==='function')txnRecordFromRawChange(file.id,before,doc,reason||'cp162d-exact');
    losslessDocs.set(file.id,doc);file.content=doc.serialize();losslessLastError='';losslessLastMode=doc.stats.mode+':'+(reason||'cp162d-exact');losslessDecorateEditor();
  }else if(file)file.content=text;
}
function cp162DOnEditedExact(reason){
  cp162DCommitExact(reason);onEdited();clearTimeout(losslessSyncTimer);losslessSyncTimer=null;
}
const cp162DBaseEnterTableEdit=enterTableEdit,cp162DBaseSyncTable=syncTableFromDOM,cp162DBaseRebuildTable=rebuildTableEdit,cp162DBaseExitTable=exitTableEdit;
enterTableEdit=function(i,focusCell,skipUndo){
  const raw=blocks[i]??'';
  if(!cp162DTableEligible(raw))return cp162DBaseEnterTableEdit(i,focusCell,skipUndo);
  if(tableEdit&&tableEdit.i===i)return;
  commitMathEdit();cp162DBaseExitTable();deactivate(true);if(!skipUndo)pushUndo();
  if(typeof cp162SuspendForBlock==='function')cp162SuspendForBlock(i);
  const el=editor.children[i];if(!el)return;
  tableEdit={i,el,model:parseTableModel(raw),cell:focusCell||{r:0,c:0},cp162dExact:true,cp162dSyntax:cp162DTableSyntax(raw)};
  suppressSel++;el.className='block table-editing cp162d-table-editing';el.innerHTML=tableEditHTML(tableEdit.model);
  const table=el.querySelector('table.md-table');if(table){table.classList.add('cp162d-md-table-exact');table.dataset.cp162dOrdinary='1';}
  el.querySelectorAll('[data-tact="singlePage"],[data-tact="layoutPanel"]').forEach(x=>x.remove());
  requestAnimationFrame(()=>suppressSel=Math.max(0,suppressSel-1));focusTableCell(tableEdit.cell.r,tableEdit.cell.c,true);updateBlockInfo();schedulePaginate();
};
syncTableFromDOM=function(){
  if(!tableEdit||!tableEdit.cp162dExact)return cp162DBaseSyncTable();
  tableEdit.el.querySelectorAll('[data-r]').forEach(cell=>{const r=+cell.dataset.r,c=+cell.dataset.c;if(tableEdit.model.rows[r])tableEdit.model.rows[r][c]=cp162DCellRawFromDOM(cell);});
  const raw=blocks[tableEdit.i]??'';blocks[tableEdit.i]=cp162DExactTableRaw(raw,tableEdit.model);tableEdit.cp162dSyntax=cp162DTableSyntax(blocks[tableEdit.i]);
};
rebuildTableEdit=function(){
  if(!tableEdit||!tableEdit.cp162dExact)return cp162DBaseRebuildTable();
  const domRows=[...tableEdit.el.querySelectorAll('tr')],domCols=domRows[0]?[...domRows[0].querySelectorAll('[data-r]')].length:0;
  if(domRows.length===tableEdit.model.rows.length&&domCols===tableEdit.model.rows[0].length)syncTableFromDOM();
  const m=tableEdit.model,r=Math.min(tableEdit.cell.r,m.rows.length-1),c=Math.min(tableEdit.cell.c,m.rows[0].length-1);
  blocks[tableEdit.i]=cp162DSerializeTable(m,tableEdit.cp162dSyntax);tableEdit.cp162dSyntax=cp162DTableSyntax(blocks[tableEdit.i]);
  suppressSel++;tableEdit.el.innerHTML=tableEditHTML(m);const table=tableEdit.el.querySelector('table.md-table');if(table){table.classList.add('cp162d-md-table-exact');table.dataset.cp162dOrdinary='1';}
  tableEdit.el.querySelectorAll('[data-tact="singlePage"],[data-tact="layoutPanel"]').forEach(x=>x.remove());requestAnimationFrame(()=>suppressSel=Math.max(0,suppressSel-1));focusTableCell(r,c,true);cp162DOnEditedExact('cp162d-table-structure');
};
exitTableEdit=function(){
  if(!tableEdit||!tableEdit.cp162dExact)return cp162DBaseExitTable();
  hideTblMenu();hideTblLayout();syncTableFromDOM();const {i,el}=tableEdit;tableEdit=null;suppressSel++;el.className='block';el.innerHTML=renderBlockHTML(blocks[i]);requestAnimationFrame(()=>suppressSel=Math.max(0,suppressSel-1));cp162DOnEditedExact('cp162d-table-commit');if(typeof cp162Schedule==='function')cp162Schedule();
};
const cp162DBaseTwTableAt=twTableAt;
twTableAt=function(target){const t=cp162DBaseTwTableAt(target);return t&&t.dataset.cp162dOrdinary==='1'?null:t;};

/* ----- definition and raw HTML editors ----- */
let cp162DEdit=null;
function cp162DFinishEdit(commit=true){
  if(!cp162DEdit)return;const st=cp162DEdit;cp162DEdit=null;activeIndex=-1;suppressSel++;
  st.el.className='block';st.el.innerHTML=renderBlockHTML(blocks[st.i]);requestAnimationFrame(()=>suppressSel=Math.max(0,suppressSel-1));
  if(commit)cp162DOnEditedExact('cp162d-atomic-commit');if(typeof cp162Schedule==='function')cp162Schedule();
}
function cp162DField(tag,cls,value){return `<${tag} class="${cls}" contenteditable="true" spellcheck="false">${escapeHtml(value)}</${tag}>`;}
function cp162DStartDefinition(i,focusClass){
  if(!cp162DOrdinary())return false;const raw=blocks[i]??'',p=blockType(raw)==='def_footnote'?cp162DFootDefParts(raw):cp162DLinkDefParts(raw);if(!p)return false;
  cp162DFinishEdit(true);if(tableEdit)exitTableEdit();commitMathEdit();deactivate(true);if(typeof cp162SuspendForBlock==='function')cp162SuspendForBlock(i);pushUndo();
  const el=editor.children[i];if(!el)return false;activeIndex=i;cp162DEdit={kind:'definition',i,el,parts:p};el.className='block active cp162d-definition-editing';
  if(p.kind==='link')el.innerHTML=`<div class="cp162d-def-editor" data-kind="link"><span class="cp162d-fixed">[</span>${cp162DField('span','cp162d-def-name',p.name)}<span class="cp162d-fixed">]:${escapeHtml(p.colonSpace)}</span>${cp162DField('span','cp162d-def-url',p.url)}${cp162DField('span','cp162d-def-title',p.title)}</div>`;
  else el.innerHTML=`<div class="cp162d-def-editor" data-kind="footnote"><span class="cp162d-fixed">[^</span>${cp162DField('span','cp162d-def-name',p.name)}<span class="cp162d-fixed">]:${escapeHtml(p.colonSpace)}</span>${cp162DField('span','cp162d-def-content',p.content)}</div>`;
  const root=el.querySelector('.cp162d-def-editor'),sync=()=>{const vals={name:root.querySelector('.cp162d-def-name')?.textContent||''};if(p.kind==='link'){vals.url=root.querySelector('.cp162d-def-url')?.textContent||'';vals.title=root.querySelector('.cp162d-def-title')?.textContent||'';}else vals.content=root.querySelector('.cp162d-def-content')?.textContent||'';blocks[i]=cp162DBuildDefinition(p,vals);};
  root.addEventListener('input',e=>{e.stopPropagation();sync();});root.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();sync();cp162DFinishEdit(true);}else if(e.key==='Enter'){e.preventDefault();const fs=[...root.querySelectorAll('[contenteditable="true"]')],k=fs.indexOf(e.target.closest('[contenteditable="true"]'));if(k>=0&&k+1<fs.length)fs[k+1].focus();else{sync();cp162DFinishEdit(true);}}});
  const target=(focusClass&&root.querySelector(focusClass))||root.querySelector('[contenteditable="true"]');target?.focus();if(target){const r=document.createRange();r.selectNodeContents(target);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);}return true;
}
function cp162DHtmlParts(raw){
  raw=String(raw==null?'':raw);const lines=raw.split('\n'),k=(lines[0]||'').indexOf('<'),prefix=k>0?lines[0].slice(0,k):'';
  const content=lines.map(line=>prefix&&line.startsWith(prefix)?line.slice(prefix.length):line).join('\n');
  return {raw,prefix,content};
}
function cp162DBuildHtml(parts,content){
  const prefix=parts&&parts.prefix||'';return String(content==null?'':content).split('\n').map(line=>prefix+line).join('\n');
}
function cp162DStartHtml(i){
  if(!cp162DOrdinary()||blockType(blocks[i]??'')!=='html')return false;cp162DFinishEdit(true);if(tableEdit)exitTableEdit();commitMathEdit();deactivate(true);if(typeof cp162SuspendForBlock==='function')cp162SuspendForBlock(i);pushUndo();
  const el=editor.children[i];if(!el)return false;const parts=cp162DHtmlParts(blocks[i]??'');activeIndex=i;cp162DEdit={kind:'html',i,el,parts};el.className='block active cp162d-html-editing';
  el.innerHTML='<div class="cp162d-html-bar" contenteditable="false"><span>HTML</span><button type="button" data-cp162d-html-done>完成</button></div><textarea class="cp162d-html-source" spellcheck="false"></textarea><div class="cp162d-html-preview" contenteditable="false"></div>';
  const ta=el.querySelector('textarea'),pv=el.querySelector('.cp162d-html-preview'),sync=()=>{blocks[i]=cp162DBuildHtml(parts,ta.value);pv.innerHTML=renderSafeHtmlBlock(ta.value);};ta.value=parts.content;sync();ta.addEventListener('input',e=>{e.stopPropagation();sync();});ta.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'||((e.metaKey||e.ctrlKey)&&e.key==='Enter')){e.preventDefault();sync();cp162DFinishEdit(true);}});el.querySelector('[data-cp162d-html-done]').onclick=()=>{sync();cp162DFinishEdit(true);};ta.focus();return true;
}

/* Atomic projection hosts carry their canonical source index. */
const cp162DBaseRenderNode=cp162RenderNode;
cp162RenderNode=function(n,depth=0){
  if(['table','html_block','definition'].includes(n.type)){
    const i=n.blockRange&&Number.isFinite(n.blockRange.start)?n.blockRange.start:-1;
    return `<div class="cp162-atomic-host cp162d-atomic-host" data-cp162-source-index="${i}" data-cp162-atomic-type="${n.type}"${cp162NodeAttrs(n)}>${renderBlockHTML(n.raw)}</div>`;
  }
  return cp162DBaseRenderNode(n,depth);
};
const cp162DBasePointToRaw=cp162PointToRaw;
cp162PointToRaw=function(node,off){
  const el=node&&(node.nodeType===1?node:node.parentElement),host=el&&el.closest?el.closest('.cp162d-atomic-host'):null;
  if(host&&editor.contains(host)){const i=+host.dataset.cp162SourceIndex;if(i>=0)return {i,off:0,atomic:host.dataset.cp162AtomicType};}
  return cp162DBasePointToRaw(node,off);
};

function cp162DIndexForTarget(t){const b=t&&t.closest?t.closest('.block'):null;return b?[...editor.children].indexOf(b):-1;}
function cp162DOpenTarget(t,ev){
  if(!cp162DOrdinary())return false;const host=t.closest&&t.closest('.cp162d-atomic-host'),i=host?+host.dataset.cp162SourceIndex:cp162DIndexForTarget(t);if(!(i>=0&&i<blocks.length))return false;const bt=blockType(blocks[i]??'');
  if(bt==='table'){ev.preventDefault();ev.stopImmediatePropagation();if(typeof cp162SuspendForBlock==='function')cp162SuspendForBlock(i);enterTableEdit(i,{r:0,c:0});return true;}
  if(bt==='def_link'||bt==='def_footnote'){ev.preventDefault();ev.stopImmediatePropagation();return cp162DStartDefinition(i,bt==='def_link'?'.cp162d-def-url':'.cp162d-def-content');}
  if(bt==='html'){ev.preventDefault();ev.stopImmediatePropagation();return cp162DStartHtml(i);}
  return false;
}
/* Window capture runs before the CP162 projected-text router. */
window.addEventListener('mousedown',e=>{
  if(e.button!==0||!cp162DOrdinary())return;
  const t=e.target;if(!(t instanceof Element))return;
  if(t.closest('.cp162d-definition-editing,.cp162d-html-editing,.table-editing'))return;
  if(t.closest('.cp162d-atomic-host,.cp162d-def-view,.cp162b-html-block,table.md-table')){
    if(cp162DOpenTarget(t,e)){e.stopPropagation();if(typeof cp162MouseCapture!=='undefined')cp162MouseCapture=null;}
  }
},true);
document.addEventListener('mousedown',e=>{if(cp162DEdit&&!cp162DEdit.el.contains(e.target))cp162DFinishEdit(true);},true);

/* Expose a compact oracle surface for differential tests. */
window.__CP162D_ATOMIC_COMPAT__=Object.freeze({
  checkpoint:'CP162D',version:'1.0.8',build:'CP162D-EKDETA-ATOMIC-BLOCK-TRANSACTIONS',
  policy:'ordinary-markdown-only-twthesis-paper-custom-table-isolation-exact-raw',
  ordinary:cp162DOrdinary,tableSyntax:cp162DTableSyntax,tableExactRaw:cp162DExactTableRaw,
  linkDefParts:cp162DLinkDefParts,footDefParts:cp162DFootDefParts,buildDefinition:cp162DBuildDefinition,
  startDefinition:cp162DStartDefinition,startHtml:cp162DStartHtml,htmlParts:cp162DHtmlParts,buildHtml:cp162DBuildHtml,finish:cp162DFinishEdit,
  get active(){return cp162DEdit?{kind:cp162DEdit.kind,i:cp162DEdit.i}:null;}
});

const st=document.createElement('style');st.id='cp162d-atomic-style';st.textContent=`
.cp162d-def-view{padding:.35em .5em;border-left:3px solid var(--border);font-family:var(--mono);font-size:.9em}
.cp162d-def-editor{display:flex;align-items:baseline;gap:.2em;padding:.45em .55em;border:1px solid var(--accent);border-radius:5px;font-family:var(--mono);font-size:.9em}
.cp162d-def-editor [contenteditable=true]{min-width:2ch;padding:.08em .18em;border-radius:3px;outline:none;background:var(--bg-code)}
.cp162d-def-editor .cp162d-def-url{min-width:12ch;flex:1}.cp162d-def-editor .cp162d-def-content{min-width:12ch;flex:1}
.cp162d-def-editor .cp162d-def-title:empty:before{content:'title';opacity:.35}
.cp162d-html-editing{border:1px solid var(--accent);border-radius:6px;overflow:hidden}.cp162d-html-bar{display:flex;justify-content:space-between;align-items:center;padding:.3em .55em;background:var(--bg-code);font:12px var(--ui)}
.cp162d-html-source{display:block;width:100%;min-height:9em;resize:vertical;border:0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:.65em;font-family:var(--mono);background:var(--bg);color:var(--fg);box-sizing:border-box;outline:none}
.cp162d-html-preview{padding:.55em}.cp162d-md-table-exact{outline:1px solid transparent}.cp162d-table-editing [data-tact=singlePage],.cp162d-table-editing [data-tact=layoutPanel]{display:none!important}
`;
document.head.appendChild(st);

/* CP162D ordinary-Markdown atomic block compatibility: end */

window.__CP162R3_THEME_STARTUP__=Object.freeze({
  checkpoint:'CP162R3',version:'1.0.9.1',build:'CP162R3-THEME-STARTUP-SELF-HEAL',
  policy:'validated-persisted-theme-runtime-token-self-heal-ui-only',
  allowed:THEME_SETTING_VALUES.slice(),normalize:normalizeThemeSettings,resolved:resolvedThemeDataset,
  healthy:themeTokensHealthy,ensure:ensureThemeRuntime,schedule:scheduleThemeRuntimeValidation
});

/* ============================================================
   CP162E1 — Markdown-compatible input pathways.
   Compatibility purpose:
   Markdown-loose list/blockquote/table/definition/HTML containers must keep
   their canonical raw ownership when text arrives through IME, paste,
   clipboard cut/copy, drag/drop or find composition. This layer is strictly
   ordinary-Markdown-only; Paper/TW_THESIS/TW_THESIS-English pagination and custom table
   layout remain on their existing flat canonical paths.
   Input event anchors: beforeinput(insertFromPaste/Drop/Composition),
   compositionstart/compositionend node sync, clipboard read flavors, and
   find-input composition gating.
   ============================================================ */
let cp162EFindComposing=false;
let cp162ECompositionUndoArmed=false;
function cp162EOrdinary(){
  return !settings.srcmode && typeof inPaperMode==='function' && !inPaperMode() &&
         !(typeof isTwThesisTheme==='function'&&isTwThesisTheme()) &&
         !(typeof isTwThesis2Theme==='function'&&isTwThesis2Theme()) &&
         !(typeof isTwThesisEnglishTheme==='function'&&isTwThesisEnglishTheme());
}
function cp162EAtomicField(t){
  if(!(t instanceof Element))return null;
  const h=t.closest('.cp162d-definition-editing [contenteditable="true"],.cp162d-html-editing textarea');
  return h&&editor.contains(h)?h:null;
}
function cp162EClipboardText(dt){
  if(!dt)return '';
  const plain=dt.getData('text/plain')||'';
  const html=dt.getData('text/html')||'';
  if(html&&typeof htmlToMd==='function'){
    try{
      if(!/<table[\s>]/i.test(html)){const md=htmlToMd(html);if(md&&md!==plain)return md;}
      else if(typeof htmlTableToModel==='function'&&typeof buildTableRaw==='function'){
        const model=htmlTableToModel(html);if(model&&!plain.includes('\t'))return buildTableRaw(model);
      }
    }catch(_){ }
  }
  return plain;
}
function cp162EInsertAtomic(field,text){
  text=String(text==null?'':text).replace(/\r\n?/g,'\n');
  if(field instanceof HTMLTextAreaElement){
    const a=field.selectionStart??field.value.length,b=field.selectionEnd??a;
    field.setRangeText(text,a,b,'end');
  }else{
    text=text.replace(/\s*\n+\s*/g,' ');
    const sel=getSelection();let r=null;
    if(sel&&sel.rangeCount&&field.contains(sel.anchorNode))r=sel.getRangeAt(0);
    if(!r){r=document.createRange();r.selectNodeContents(field);r.collapse(false);if(sel){sel.removeAllRanges();sel.addRange(r);}}
    r.deleteContents();const n=document.createTextNode(text);r.insertNode(n);r.setStartAfter(n);r.collapse(true);if(sel){sel.removeAllRanges();sel.addRange(r);}
  }
  field.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
}
function cp162EAtomicSelection(field){
  if(field instanceof HTMLTextAreaElement){const a=field.selectionStart??0,b=field.selectionEnd??a;return {text:field.value.slice(a,b),a,b};}
  const sel=getSelection();if(!sel||!sel.rangeCount||sel.isCollapsed||!field.contains(sel.anchorNode)||!field.contains(sel.focusNode))return {text:'',range:null};
  return {text:sel.toString(),range:sel.getRangeAt(0)};
}
/* Atomic editors already create one session snapshot when opened. Stop the
   legacy editor-level composition/paste handlers from reading their wrapper DOM. */
window.addEventListener('compositionstart',e=>{
  const f=cp162EAtomicField(e.target);if(f){e.stopImmediatePropagation();return;}
  if(!cp162EOrdinary()||!editor.contains(e.target)||tableEdit||mathEditEl)return;
  if(!cp162ECompositionUndoArmed){pushUndo();cp162ECompositionUndoArmed=true;}
},true);
window.addEventListener('compositionupdate',e=>{if(cp162EAtomicField(e.target))e.stopImmediatePropagation();},true);
window.addEventListener('compositionend',e=>{
  if(cp162EAtomicField(e.target)){e.stopImmediatePropagation();return;}
  cp162ECompositionUndoArmed=false;
},true);
window.addEventListener('copy',e=>{
  const f=cp162EAtomicField(e.target);if(!f)return;
  const q=cp162EAtomicSelection(f);if(!q.text)return;
  e.preventDefault();e.stopImmediatePropagation();e.clipboardData?.setData('text/plain',q.text);
},true);
window.addEventListener('cut',e=>{
  const f=cp162EAtomicField(e.target);if(!f)return;
  const q=cp162EAtomicSelection(f);if(!q.text)return;
  e.preventDefault();e.stopImmediatePropagation();e.clipboardData?.setData('text/plain',q.text);
  if(f instanceof HTMLTextAreaElement){f.setRangeText('',q.a,q.b,'end');f.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'deleteByCut'}));}
  else{q.range.deleteContents();f.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'deleteByCut'}));}
},true);
window.addEventListener('paste',e=>{
  const f=cp162EAtomicField(e.target);if(f){e.preventDefault();e.stopImmediatePropagation();cp162EInsertAtomic(f,(e.clipboardData||window.clipboardData)?.getData('text/plain')||'');return;}
},true);
window.addEventListener('drop',e=>{
  const f=cp162EAtomicField(e.target);if(!f)return;
  const text=cp162EClipboardText(e.dataTransfer);if(!text)return;
  e.preventDefault();e.stopImmediatePropagation();cp162EInsertAtomic(f,text);
},true);

function cp162ECollapsedRawPoint(){
  const sel=getSelection();if(!sel||!sel.rangeCount)return null;const r=sel.getRangeAt(0);
  return cp162PointToRaw(r.startContainer,r.startOffset)||cp162NormalPointToRaw(r.startContainer,r.startOffset);
}
function cp162ESelectionRange(){
  const rr=cp162SelectionRawRange();if(rr)return rr;const p=cp162ECollapsedRawPoint();
  return p?{iS:p.i,offS:p.tok?p.tok.start:p.off,iE:p.i,offE:p.tok?p.tok.end:p.off,text:''}:null;
}
function cp162EGlobalToBlock(pos){
  let n=Math.max(0,Number(pos)||0);
  for(let i=0;i<blocks.length;i++){const len=(blocks[i]??'').length;if(n<=len)return {i,off:n};n-=len+1;}
  const i=Math.max(0,blocks.length-1);return {i,off:(blocks[i]??'').length};
}
function cp162EReplaceRawRange(rr,insert,reason){
  if(!rr)return false;insert=String(insert==null?'':insert).replace(/\r\n?/g,'\n');
  const start=cp162RawGlobal(rr.iS,rr.offS),end=cp162RawGlobal(rr.iE,rr.offE),after=start+insert.length;
  pushUndo();cp162Suspend();deactivate(true);
  try{
    const f=activeFile(),doc=losslessActiveDoc();
    if(doc&&f){doc.replaceNormalizedRange(start,end,insert);f.content=doc.serialize();mountDoc(f.content);}
    else{const now=blocks.join('\n'),next=now.slice(0,start)+insert+now.slice(end);if(f)f.content=next;mountDoc(next);}
    const p=cp162EGlobalToBlock(after);if(p&&blocks[p.i]!=null)activate(p.i,p.off);
    onEdited();if(typeof cp162Schedule==='function')cp162Schedule();
    if(typeof schedulePaginate==='function')schedulePaginate();
    return true;
  }catch(err){console.error('[CP162E1] replace failed',reason||'',err);return false;}
}
function cp162EPointAtClient(x,y,target){
  let r=null;try{r=document.caretRangeFromPoint&&document.caretRangeFromPoint(x,y);}catch(_){ }
  if(!r&&document.caretPositionFromPoint){try{const p=document.caretPositionFromPoint(x,y);if(p){r=document.createRange();r.setStart(p.offsetNode,p.offset);r.collapse(true);}}catch(_){ }}
  if(r&&editor.contains(r.startContainer))return cp162PointToRaw(r.startContainer,r.startOffset)||cp162NormalPointToRaw(r.startContainer,r.startOffset);
  const el=target instanceof Element?target.closest('.cp162-source-fragment,.cp162d-atomic-host'):null;
  if(el){const i=+el.dataset.cp162SourceIndex;if(i>=0)return {i,off:+(el.dataset.cp162SourceEnd||0)};}
  return null;
}
/* Projected container paste: collapsed selections must map to the actual lazy
   continuation/quote child, not to the projection root's first block. */
window.addEventListener('paste',e=>{
  if(!cp162EOrdinary()||cp162EAtomicField(e.target)||!editor.contains(e.target))return;
  const el=e.target instanceof Element?e.target:e.target.parentElement;
  if(!el||!el.closest('.cp162-container-root'))return;
  const e2=window.__CP162E2_NATIVE_FLAVOR_COMPAT__?.payload(e.clipboardData||window.clipboardData);
  if(e2&&['exact','markhtml','self-rich'].includes(e2.flavor))return;
  const items=[...((e.clipboardData||{}).items||[])];
  if(items.some(x=>x.kind==='file'&&/^image\//.test(x.type))){const p=cp162ECollapsedRawPoint();if(p)cp162EditProjectedPoint(p);return;}
  const rr=cp162ESelectionRange(),text=cp162EClipboardText(e.clipboardData||window.clipboardData);if(!rr||!text)return;
  e.preventDefault();e.stopImmediatePropagation();cp162EReplaceRawRange(rr,text,'paste');
},true);
/* Generic dropped text/HTML follows the same raw transaction. File/image drops
   are merely routed to the correct canonical child, then left to the legacy
   image/file handler. */
window.addEventListener('drop',e=>{
  if(!cp162EOrdinary()||cp162EAtomicField(e.target)||!editor.contains(e.target))return;
  const p=cp162EPointAtClient(e.clientX,e.clientY,e.target);if(!p)return;
  const files=[...((e.dataTransfer||{}).files||[])],uri=e.dataTransfer?.getData('text/uri-list')||'';
  const legacyFile=files.some(f=>/^image\//.test(f.type)||/\.(?:md|markdown|txt)$/i.test(f.name||''));
  if(legacyFile||/^https?:\/\/\S+\.(?:png|jpe?g|gif|webp|svg|bmp)(?:\?\S*)?$/im.test(uri)){cp162EditProjectedPoint(p);return;}
  const text=cp162EClipboardText(e.dataTransfer);if(!text)return;
  e.preventDefault();e.stopImmediatePropagation();cp162EReplaceRawRange({iS:p.i,offS:p.off,iE:p.i,offE:p.off},text,'drop');
},true);
/* Markdown search does not evaluate half-composed IME candidates. */
window.addEventListener('compositionstart',e=>{if(e.target&&e.target.id==='fb-input')cp162EFindComposing=true;},true);
window.addEventListener('input',e=>{if(cp162EFindComposing&&e.target&&e.target.id==='fb-input')e.stopImmediatePropagation();},true);
window.addEventListener('compositionend',e=>{if(e.target&&e.target.id==='fb-input'){cp162EFindComposing=false;setTimeout(()=>{try{doSearch();}catch(_){ }},100);}},true);

window.__CP162E_INPUT_COMPAT__=Object.freeze({
  checkpoint:'CP162E1',version:'1.0.9',build:'CP162E1-EKDETA-INPUT-PATH-COMPAT',
  policy:'ordinary-markdown-only-paper-twthesis-custom-table-isolation-exact-raw',
  ordinary:cp162EOrdinary,atomicField:cp162EAtomicField,clipboardText:cp162EClipboardText,
  selectionRange:cp162ESelectionRange,replaceRawRange:cp162EReplaceRawRange,pointAtClient:cp162EPointAtClient,
  get findComposing(){return cp162EFindComposing;}
});
/* CP162E1 original-aligned input pathways: end */


/* ============================================================
   CP162E2 — Markdown-compatible multi-flavor clipboard,
   WebKit beforeinput fallback, and ordinary attachment drop.
   Compatibility purpose:
   Markdown writes rich HTML plus a source-preserving flavor and plain text;
   it also routes beforeinput paste/drop/replacement back to the same node
   transaction and turns Finder file drops into document links. This browser
   mapping keeps exact Markdown in a private vendor flavor, semantic HTML for
   external applications, and plain Markdown as the universal fallback.
   Strict isolation: ordinary rendered Markdown only. Source, Paper, TW_THESIS,
   TW_THESIS English, custom ekdeta-html-table editing, math/table/atomic hosts and
   theme startup remain on their existing paths.
   ============================================================ */
const CP162E2_EXACT_FLAVOR='application/x-ekdeta-html-markdown';
const CP162E2_MARK_FLAVOR='text/markhtml';
const CP162E2_HTML_MARK='<!--ekdeta-html-clipboard:v1-->';
function cp162E2NormalizeText(s){return String(s==null?'':s).replace(/\r\n?/g,'\n');}
function cp162E2OrdinaryTarget(t){
  if(!cp162EOrdinary()||tableEdit||mathEditEl||cp162EAtomicField(t))return false;
  const n=t instanceof Node?t:null;return !!(n&&editor.contains(n));
}
function cp162E2ClipboardPayload(dt){
  if(!dt)return {text:'',flavor:'none'};
  let exact='',markhtml='',plain='',html='';
  try{exact=dt.getData(CP162E2_EXACT_FLAVOR)||'';}catch(_){ }
  try{markhtml=dt.getData(CP162E2_MARK_FLAVOR)||'';}catch(_){ }
  try{plain=dt.getData('text/plain')||'';}catch(_){ }
  try{html=dt.getData('text/html')||'';}catch(_){ }
  if(exact)return {text:cp162E2NormalizeText(exact),flavor:'exact'};
  if(plain&&markhtml.includes(CP162E2_HTML_MARK))return {text:cp162E2NormalizeText(plain),flavor:'markhtml'};
  if(plain&&html.includes(CP162E2_HTML_MARK))return {text:cp162E2NormalizeText(plain),flavor:'self-rich'};
  const text=cp162EClipboardText(dt);
  if(text)return {text:cp162E2NormalizeText(text),flavor:html?'html':'plain'};
  let uri='';try{uri=(dt.getData('text/uri-list')||'').split(/\r?\n/).find(x=>x&&!/^#/.test(x))||'';}catch(_){ }
  return {text:uri?(' '+uri.trim()+' '):'',flavor:uri?'uri':'none'};
}
function cp162E2SemanticHTML(raw){
  let html='';try{if(typeof caMdToHtml==='function')html=caMdToHtml(raw)||'';}catch(_){ }
  if(!html)html='<pre>'+escapeHtml(raw)+'</pre>';
  return CP162E2_HTML_MARK+html;
}
function cp162E2WriteClipboard(e,raw){
  const dt=e&&e.clipboardData;if(!dt)return false;
  raw=cp162E2NormalizeText(raw);
  try{dt.setData('text/plain',raw);}catch(_){return false;}
  const rich=cp162E2SemanticHTML(raw);
  try{dt.setData('text/html',rich);}catch(_){ }
  try{dt.setData(CP162E2_MARK_FLAVOR,rich);}catch(_){ }
  try{dt.setData(CP162E2_EXACT_FLAVOR,raw);}catch(_){ }
  return true;
}
function cp162E2RawRangeFromBeforeInput(ev){
  let q=null;try{const a=ev.getTargetRanges&&ev.getTargetRanges();if(a&&a.length)q=a[0];}catch(_){ }
  if(q){
    let a=cp162PointToRaw(q.startContainer,q.startOffset)||cp162NormalPointToRaw(q.startContainer,q.startOffset);
    let b=cp162PointToRaw(q.endContainer,q.endOffset)||cp162NormalPointToRaw(q.endContainer,q.endOffset);
    if(a&&b){const ka=a.i*100000000+a.off,kb=b.i*100000000+b.off;if(ka>kb){const t=a;a=b;b=t;}
      return {iS:a.i,offS:a.tok?a.tok.start:a.off,iE:b.i,offE:b.tok?b.tok.end:b.off,text:''};}
  }
  return cp162ESelectionRange();
}
function cp162E2BeforeInput(ev){
  if(!cp162E2OrdinaryTarget(ev.target))return false;
  const el=ev.target instanceof Element?ev.target:ev.target&&ev.target.parentElement;
  if(!el||!el.closest('.cp162-container-root'))return false;
  const type=ev.inputType||'';
  if(!['insertFromPaste','insertFromDrop','insertReplacementText'].includes(type))return false;
  let payload={text:'',flavor:'none'};
  if(ev.dataTransfer)payload=cp162E2ClipboardPayload(ev.dataTransfer);
  if(!payload.text&&ev.data!=null)payload={text:String(ev.data),flavor:'data'};
  if(!payload.text)return false;
  const rr=cp162E2RawRangeFromBeforeInput(ev);if(!rr)return false;
  ev.preventDefault();ev.stopImmediatePropagation();
  return cp162EReplaceRawRange(rr,payload.text,'beforeinput:'+type);
}
window.addEventListener('beforeinput',cp162E2BeforeInput,true);
/* Rich copy/cut: exact Markdown remains authoritative, semantic HTML is added
   for Word/mail/browser targets. This capture listener supersedes the older
   projected-container plain-only handler without touching atomic editors. */
window.addEventListener('copy',e=>{
  if(!cp162E2OrdinaryTarget(e.target))return;const rr=cp162SelectionRawRange();if(!rr||!rr.text)return;
  if(!cp162E2WriteClipboard(e,rr.text))return;e.preventDefault();e.stopImmediatePropagation();
},true);
window.addEventListener('cut',e=>{
  if(!cp162E2OrdinaryTarget(e.target))return;const rr=cp162SelectionRawRange();if(!rr||!rr.text)return;
  if(!cp162E2WriteClipboard(e,rr.text))return;e.preventDefault();e.stopImmediatePropagation();cp162DeleteRange(rr,'');
},true);
/* A self-generated rich clipboard must paste the exact plain Markdown rather
   than round-tripping through HTML. External HTML still uses CP162E1 conversion. */
window.addEventListener('paste',e=>{
  if(!cp162E2OrdinaryTarget(e.target))return;const p=cp162E2ClipboardPayload(e.clipboardData||window.clipboardData);
  if(!['exact','markhtml','self-rich'].includes(p.flavor)||!p.text)return;const rr=cp162ESelectionRange();if(!rr)return;
  e.preventDefault();e.stopImmediatePropagation();cp162EReplaceRawRange(rr,p.text,'self-rich-paste');
},true);
async function cp162E2UniqueAttachmentName(dir,name){
  name=safeName(String(name||'attachment'))||'attachment';const dot=name.lastIndexOf('.'),base=dot>0?name.slice(0,dot):name,ext=dot>0?name.slice(dot):'';
  for(let n=0;n<1000;n++){const cand=n?`${base}-${n+1}${ext}`:name;try{await dir.getFileHandle(cand);}catch(_){return cand;}}
  return `${base}-${Date.now().toString(36)}${ext}`;
}
async function cp162E2SaveAttachment(file){
  if(!dirHandle||!(await folderPermOK(dirHandle,true)))return null;
  const name=await cp162E2UniqueAttachmentName(dirHandle,file&&file.name);const fh=await dirHandle.getFileHandle(name,{create:true});const w=await fh.createWritable();await w.write(file);await w.close();
  return {name,path:'./'+encodeURIComponent(name)};
}
function cp162E2AttachmentMarkdown(items){return items.map(x=>`[${String(x.name||'attachment').replace(/[\[\]\n]/g,'')}](${x.path})`).join('\n');}
/* Finder/general file drop. Images and Markdown documents keep their legacy
   handlers. Other files are copied to the linked project root, then linked at
   the exact tolerant-container drop point. Without project permission the
   browser cannot expose a stable native path, so the operation is rejected
   rather than creating a broken blob URL. */
window.addEventListener('drop',async e=>{
  if(!cp162E2OrdinaryTarget(e.target))return;const dt=e.dataTransfer;if(!dt)return;
  const files=[...(dt.files||[])];
  if(files.length){
    const other=files.filter(f=>!/^image\//.test(f.type)&&!(/\.(?:md|markdown|txt)$/i.test(f.name||'')));
    if(!other.length)return;const p=cp162EPointAtClient(e.clientX,e.clientY,e.target);if(!p)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(!dirHandle){toast('拖入附件前請先使用「連結儲存資料夾」');return;}
    const saved=[];for(const f of other){try{const x=await cp162E2SaveAttachment(f);if(x)saved.push(x);}catch(err){console.error('[CP162E2] attachment drop failed',err);}}
    if(!saved.length){toast('附件寫入失敗，請重新授權儲存資料夾');return;}
    cp162EReplaceRawRange({iS:p.i,offS:p.off,iE:p.i,offE:p.off},cp162E2AttachmentMarkdown(saved),'attachment-drop');toast(`已插入 ${saved.length} 個附件連結`);return;
  }
  const payload=cp162E2ClipboardPayload(dt);if(payload.flavor!=='uri'||!payload.text)return;
  const p=cp162EPointAtClient(e.clientX,e.clientY,e.target);if(!p)return;e.preventDefault();e.stopImmediatePropagation();cp162EReplaceRawRange({iS:p.i,offS:p.off,iE:p.i,offE:p.off},payload.text,'uri-drop');
},true);
window.__CP162E2_NATIVE_FLAVOR_COMPAT__=Object.freeze({
  checkpoint:'CP162E2',version:'1.0.10',build:'CP162E2-EKDETA-CLIPBOARD-DROP-BEFOREINPUT',
  policy:'ordinary-markdown-only-rich-exact-clipboard-webkit-beforeinput-project-attachment-isolation',
  exactFlavor:CP162E2_EXACT_FLAVOR,markFlavor:CP162E2_MARK_FLAVOR,htmlMark:CP162E2_HTML_MARK,payload:cp162E2ClipboardPayload,
  semanticHTML:cp162E2SemanticHTML,beforeInput:cp162E2BeforeInput,saveAttachment:cp162E2SaveAttachment,
  get nativeMacAcceptance(){return false;}
});
/* CP162E2 multi-flavor clipboard and drop alignment: end */

/* CP163B — Common inline Markdown tolerance.
   Scope is ordinary rendered Markdown only. Paper/TW_THESIS, source mode and thesis
   table/pagination paths keep the V123 renderer byte-for-byte. */
(function(){
'use strict';
if(window.__CP163B_INLINE_COMPAT__)return;
const cp163BBaseInlineMD=inlineMD;
const CP163B_TOKEN_L='\uE340',CP163B_TOKEN_R='\uE341';
function cp163BOrdinary(){return !settings.srcmode&&!(typeof inPaperMode==='function'&&inPaperMode());}
function cp163BWordChar(ch){return !!ch&&/[\p{L}\p{N}]/u.test(ch);}
function cp163BToken(stash,kind,value){const i=stash.push({kind,value})-1;return CP163B_TOKEN_L+i+CP163B_TOKEN_R;}
function cp163BReferenceImage(raw,stash){
  if(typeof cp162DReferenceDefs!=='function'||typeof cp162DNormRef!=='function')return raw;
  const defs=cp162DReferenceDefs();if(!defs||!defs.size)return raw;
  return raw.replace(/!\[([^\]\n]+)\]\[([^\]\n]*)\]/g,(m,label,id)=>{
    const key=cp162DNormRef(id||label),d=defs.get(key);if(!d)return m;
    return cp163BToken(stash,'refimg',{label,key,d});
  });
}
function cp163BProtectMalformedStar(raw,stash){
  return raw.replace(/(^|[^*])\*(?=\S)([^*\n]*?\S)\*\*(?!\*)/g,(m,pre,body)=>
    pre+cp163BToken(stash,'literal','*')+body+'**');
}
function cp163BProtectIntrawordUnderscore(raw,stash){
  /* 1.1.7.1 / CP171: Inline TeX must remain byte-for-byte intact.  The
     Markdown-compatible intraword-underscore guard applies only to ordinary
     prose; otherwise valid subscripts such as $C_1$ are replaced by
     private-use placeholders before KaTeX sees them and render as red parse
     errors.  mathRangesOf() is the shared source of truth for this boundary. */
  const mathRanges=typeof mathRangesOf==='function'?mathRangesOf(raw):[];
  return raw.replace(/_+/g,(run,off,whole)=>{
    if(mathRanges.some(r=>off>=r.start&&off+run.length<=r.end))return run;
    const prev=whole[off-1]||'',next=whole[off+run.length]||'';
    return cp163BWordChar(prev)&&cp163BWordChar(next)?cp163BToken(stash,'literal',run):run;
  });
}
function cp163BProtectHardBreak(raw,stash){
  return raw.replace(/[ \u00A0]{2,}\n/g,()=>cp163BToken(stash,'hardbreak','  \n'));
}
function cp163BReferenceImageHTML(x){
  const d=x.d||{},url=String(d.url||'').trim();
  const src=sanitizeURL(typeof normalizeImgPath==='function'?normalizeImgPath(url):url,true);
  const title=d.title?` title="${escapeHtml(d.title)}"`:'';
  return `<img class="md-img md-ref-img" data-ref="${escapeHtml(x.key||'')}" draggable="false" src="${src}" alt="${escapeHtml(x.label||'')}"${title}>`;
}
function cp163BRestore(html,stash){
  return String(html).replace(new RegExp(CP163B_TOKEN_L+'(\\d+)'+CP163B_TOKEN_R,'g'),(_,n)=>{
    const x=stash[+n];if(!x)return '';
    if(x.kind==='hardbreak')return '<br class="md-hardbreak">';
    if(x.kind==='refimg')return cp163BReferenceImageHTML(x.value||{});
    return escapeHtml(String(x.value==null?'':x.value));
  });
}
function cp163BTrimCandidate(text){
  let core=String(text||''),tail='';
  while(core&&/[.,;:!?'"，。；：！？、]$/.test(core)){tail=core.slice(-1)+tail;core=core.slice(0,-1);}
  const pairs=[['(',')'],['[',']'],['{','}']];
  for(const [op,cl] of pairs){
    const count=s=>[...s].reduce((n,c)=>n+(c===op?1:c===cl?-1:0),0);
    while(core.endsWith(cl)&&count(core)<0){tail=cl+tail;core=core.slice(0,-1);}
  }
  return {core,tail};
}
function cp163BAnchor(doc,display,href,kind){
  const a=doc.createElement('a');a.className='md-a md-autolink';a.dataset.autolink=kind;
  a.setAttribute('href',sanitizeURL(href,false));a.textContent=display;return a;
}
function cp163BLinkifyTextNode(node){
  const text=node.nodeValue||'';
  const re=/<(?:(?:https?|ftp):\/\/[^\s<>]+|www\.[^\s<>]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>|(?:https?|ftp):\/\/[^\s<]+|www\.[^\s<]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  let m,last=0,changed=false;const frag=node.ownerDocument.createDocumentFragment();
  while((m=re.exec(text))){
    if(m.index>last)frag.append(text.slice(last,m.index));
    const angle=m[0][0]==='<'&&m[0].endsWith('>');
    const raw=angle?m[0].slice(1,-1):m[0];const t=angle?{core:raw,tail:''}:cp163BTrimCandidate(raw);
    if(!t.core){frag.append(m[0]);last=re.lastIndex;continue;}
    const email=!/^(?:https?|ftp):\/\//i.test(t.core)&&!/^www\./i.test(t.core)&&/@/.test(t.core);
    const href=email?'mailto:'+t.core:t.core;
    frag.append(cp163BAnchor(node.ownerDocument,t.core,href,email?'email':(/^www\./i.test(t.core)?'www':'url')));
    if(t.tail)frag.append(t.tail);
    changed=true;last=re.lastIndex;
  }
  if(!changed)return false;if(last<text.length)frag.append(text.slice(last));node.replaceWith(frag);return true;
}
function cp163BLinkifyHTML(html){
  const t=document.createElement('template');t.innerHTML=String(html||'');
  const walker=document.createTreeWalker(t.content,NodeFilter.SHOW_TEXT),nodes=[];
  while(walker.nextNode()){
    const n=walker.currentNode,p=n.parentElement;
    if(p&&p.closest('a,code,pre,script,style,textarea,.katex,.mjx,.md-meta,.md-content'))continue;
    if(/(?:https?|ftp):\/\/|\bwww\.|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(n.nodeValue||''))nodes.push(n);
  }
  nodes.forEach(cp163BLinkifyTextNode);return t.innerHTML;
}
inlineMD=function(src){
  if(!cp163BOrdinary())return cp163BBaseInlineMD(src);
  const stash=[];let raw=String(src==null?'':src).replace(/[\uE340\uE341]/g,'');
  raw=cp163BReferenceImage(raw,stash);
  raw=cp163BProtectHardBreak(raw,stash);
  raw=cp163BProtectMalformedStar(raw,stash);
  raw=cp163BProtectIntrawordUnderscore(raw,stash);
  let html=cp163BBaseInlineMD(raw);html=cp163BRestore(html,stash);const noAuto=window.__CP163C_PROFILE__?.options?.().noAutoLink===true;html=noAuto?html:cp163BLinkifyHTML(html);return html;
};
window.__CP163B_INLINE_COMPAT__=Object.freeze({
  checkpoint:'CP163B',version:'1.0.11.1',build:'CP163B-EKDETA-COMMON-INLINE-TOLERANCE-MATH-SAFE',
  policy:'ordinary-markdown-only-autolink-intraword-hardbreak-reference-image-math-ranges-protected-paper-twthesis-isolated',
  linkify:cp163BLinkifyHTML,trimCandidate:cp163BTrimCandidate,
  get nativeMacAcceptance(){return false;}
});
})();
/* CP163B common inline tolerance alignment: end */

/* CP163C — Markdown-compatible Markdown profiles and parser options.
   The persisted default is legacy-current to avoid silently changing existing
   documents. Markdown Loose and Strict profiles are explicit, ordinary-Markdown
   only projections; Paper/TW_THESIS retain their V123 parser/pagination contract. */
(function(){
'use strict';
if(window.__CP163C_PROFILE__)return;
const PROFILES=Object.freeze({
  'legacy-current':Object.freeze({strictMarkdown:false,strictNumberStartOnNewLine:false,noAutoLink:false,enableHighlight:true,enableSubscript:false,enableSuperscript:false,enableAlert:true,blockHTML:true,enableInlineMath:true,gitlabMath:true,noLegacyMath:false,convertSmartOnRender:false,remapUnicodePunctuation:false,smartDash:false,smartQuote:false,twoHyphensToEm:false}),
  'ekdeta-loose':Object.freeze({strictMarkdown:false,strictNumberStartOnNewLine:false,noAutoLink:false,enableHighlight:false,enableSubscript:false,enableSuperscript:false,enableAlert:true,blockHTML:true,enableInlineMath:true,gitlabMath:true,noLegacyMath:false,convertSmartOnRender:false,remapUnicodePunctuation:false,smartDash:false,smartQuote:false,twoHyphensToEm:false}),
  'strict':Object.freeze({strictMarkdown:true,strictNumberStartOnNewLine:true,noAutoLink:false,enableHighlight:false,enableSubscript:false,enableSuperscript:false,enableAlert:true,blockHTML:true,enableInlineMath:true,gitlabMath:true,noLegacyMath:false,convertSmartOnRender:false,remapUnicodePunctuation:false,smartDash:false,smartQuote:false,twoHyphensToEm:false})
});
const BOOL_KEYS=['strictMarkdown','strictNumberStartOnNewLine','noAutoLink','enableHighlight','enableSubscript','enableSuperscript','enableAlert','blockHTML','enableInlineMath','gitlabMath','noLegacyMath','convertSmartOnRender','remapUnicodePunctuation','smartDash','smartQuote','twoHyphensToEm'];
function ordinary(){return !settings.srcmode&&!(typeof inPaperMode==='function'&&inPaperMode());}
function normalize(){
  if(!PROFILES[settings.markdownProfile])settings.markdownProfile='legacy-current';
  if(!settings.markdownOptions||typeof settings.markdownOptions!=='object'||Array.isArray(settings.markdownOptions))settings.markdownOptions={};
  const clean={};for(const k of BOOL_KEYS)if(typeof settings.markdownOptions[k]==='boolean')clean[k]=settings.markdownOptions[k];settings.markdownOptions=clean;return options();
}
function options(){const p=PROFILES[settings.markdownProfile]||PROFILES['legacy-current'];return Object.assign({},p,settings.markdownOptions||{});}
function setProfile(name,save=true){settings.markdownProfile=PROFILES[name]?name:'legacy-current';settings.markdownOptions={};if(save&&typeof persist==='function')persist();remount();return options();}
function setOption(key,value,save=true){if(!BOOL_KEYS.includes(key))throw new Error('unknown-markdown-option:'+key);normalize();settings.markdownOptions[key]=!!value;if(save&&typeof persist==='function')persist();remount();return options();}
function remount(){try{cp162Invalidate();}catch(_){}const f=typeof activeFile==='function'?activeFile():null;if(f&&typeof mountDoc==='function')mountDoc(f.content);if(typeof renderSidebar==='function')renderSidebar();}
function headingInfo(raw){
 const s=String(raw==null?'':raw),o=options();if(/^( {4}| {0,3}\t)/.test(s))return null;
 let m;if(o.strictMarkdown){m=s.match(/^[ \t]*(#{1,6})(?:[ \t]+)([\s\S]*?)(?:[ \t]+#+[ \t]*)?$/);return m?{level:m[1].length,text:m[2],strict:true}:null;}
 m=s.match(/^[ \t]*(#{1,})(?:[ \t]+|(?=[^#\s]))([\s\S]*?)(?:[ \t]+#+[ \t]*)?$/);
 if(!m)return null;const n=m[1].length;return {level:Math.min(6,n),text:(n>6?'#'.repeat(n-6)+(m[2]?' ':''):'')+m[2],strict:false};
}
const baseBlockType=blockType,baseRenderBlockHTML=renderBlockHTML,baseInline=inlineMD;
blockType=function(src){
 if(!ordinary())return baseBlockType(src);const raw=String(src==null?'':src),o=options();
 if(raw.includes('\n'))return baseBlockType(raw);
 /* Markdown block precedence: four spaces or a tab create indented code before
    loose ATX heading recognition.  Do not let the broad heading fallback turn
    `    #Heading` into a paragraph. */
 if(typeof cp162MatchIndentedCode==='function'&&cp162MatchIndentedCode(raw))return 'code';
 if(!o.blockHTML&&typeof markdownHtmlBlockOpen==='function'&&markdownHtmlBlockOpen(raw))return 'p';
 const hi=headingInfo(raw);if(hi)return 'h';
 if(/^[ \t]*#+/.test(raw))return 'p';
 const om=raw.match(/^(\s*)(\d+)([.)])\s+/);if(o.strictNumberStartOnNewLine&&om&&Number(om[2])!==1)return 'p';
 return baseBlockType(raw);
};
renderBlockHTML=function(src){
 if(ordinary()&&blockType(src)==='h'){
   const hi=headingInfo(noIndentParts(src).body);if(hi){mathSeq=0;styleSeq=0;return `<h${hi.level} class="md-h">${inlineMD(hi.text)}</h${hi.level}>`;}
 }
 return baseRenderBlockHTML(src);
};
const L='\uE350',R='\uE351';
function token(stash,html){const i=stash.push(html)-1;return L+i+R;}
function restore(html,stash){return String(html).replace(new RegExp(L+'(\\d+)'+R,'g'),(_,i)=>stash[+i]||'');}
inlineMD=function(src){
 if(!ordinary())return baseInline(src);normalize();const o=options(),stash=[];let raw=String(src==null?'':src).replace(/[\uE350\uE351]/g,'');
 if(!o.enableHighlight)raw=raw.replace(/==(?=\S)([\s\S]*?\S)==/g,m=>token(stash,escapeHtml(m)));
 if(!o.enableInlineMath){raw=raw.replace(/\$\$(?:[\s\S]*?)\$\$|\$(?=\S)[^$\n]+?(?<=\S)\$(?!\d)|\\\([^\n]+?\\\)/g,m=>token(stash,escapeHtml(m)));}
 else if(o.noLegacyMath)raw=raw.replace(/\\\([^\n]+?\\\)/g,m=>token(stash,escapeHtml(m)));
 if(o.enableSubscript)raw=raw.replace(/(^|[^~])~(?=\S)([^~\n]*?\S)~(?!~)/g,(m,pre,c)=>pre+token(stash,`<sub class="md-subscript">${baseInline(c)}</sub>`));
 if(o.enableSuperscript)raw=raw.replace(/\^(?=\S)([^\^\n]*?\S)\^/g,(m,c)=>token(stash,`<sup class="md-superscript">${baseInline(c)}</sup>`));
 let html=baseInline(raw);return restore(html,stash);
};
function installPrefs(){
 /* 1.2.7（M32）：放在偏好設定「一般」最下面預設收合的「進階：Markdown 語法」裡。
    這些是語法層的選項，只有熟悉 Markdown 的人才需要；說明改成看得懂效果的白話。 */
 const host=document.querySelector('#ekp-md-compat .ekp-adv-body');if(!host||document.getElementById('pf-md-profile'))return;
 const o=options();
 const sw=(id,label,on)=>`<label class="ekp-row ekp-switch" for="${id}"><span class="ekp-label"><span>${label}</span></span><span class="ekp-ctl"><input type="checkbox" role="switch" id="${id}" ${on?'checked':''}></span></label>`;
 host.innerHTML=`<p class="ekp-lead">${TT('一般寫作維持預設就好；熟悉 Markdown 語法、需要和其他編輯器一致時才調整。只影響一般 Markdown，論文模式與臺灣論文不受影響。','The defaults suit ordinary writing. Change these only to match another Markdown editor. Paper mode and Taiwan thesis are not affected.')}</p>
 <div class="ekp-row"><div class="ekp-label"><label for="pf-md-profile">${TT('解析方式','Parser')}</label></div><div class="ekp-ctl"><select class="ekp-select" id="pf-md-profile"><option value="legacy-current">${TT('預設','Default')}</option><option value="ekdeta-loose">${TT('寬鬆','Loose')}</option><option value="strict">${TT('嚴格','Strict')}</option></select></div></div>
 ${sw('pf-md-highlight',TT('==文字== 顯示成螢光標記','==text== shows as a highlight'),o.enableHighlight)}
 ${sw('pf-md-sub',TT('~x~ 顯示成下標','~x~ shows as subscript'),o.enableSubscript)}
 ${sw('pf-md-sup',TT('^x^ 顯示成上標','^x^ shows as superscript'),o.enableSuperscript)}
 ${sw('pf-md-autolink',TT('網址自動變成連結','Web addresses become links'),!o.noAutoLink)}
 ${sw('pf-md-unicode',TT('輸入法換成的全形或彎引號，也照語法解讀','Read IME-replaced punctuation as syntax'),o.remapUnicodePunctuation)}
 ${sw('pf-md-smart-dash',TT('-- 與 ... 顯示成破折號、刪節號','Show -- and ... as dashes and ellipses'),o.smartDash)}
 ${sw('pf-md-smart-quote',TT('直引號顯示成彎引號','Show straight quotes as curly quotes'),o.smartQuote)}
 ${sw('pf-md-legacy-math',TT('\\(…\\) 與 \\[…\\] 也當成數學','Treat \\(…\\) and \\[…\\] as math'),!o.noLegacyMath)}`;
 const sel=host.querySelector('#pf-md-profile');sel.value=settings.markdownProfile;
 sel.addEventListener('change',()=>{setProfile(sel.value);showPrefs();const d=document.getElementById('ekp-md-compat');if(d)d.open=true;});
 host.querySelector('#pf-md-highlight').addEventListener('change',e=>setOption('enableHighlight',e.target.checked));
 host.querySelector('#pf-md-sub').addEventListener('change',e=>setOption('enableSubscript',e.target.checked));
 host.querySelector('#pf-md-sup').addEventListener('change',e=>setOption('enableSuperscript',e.target.checked));
 host.querySelector('#pf-md-autolink').addEventListener('change',e=>setOption('noAutoLink',!e.target.checked));
 host.querySelector('#pf-md-unicode').addEventListener('change',e=>setOption('remapUnicodePunctuation',e.target.checked));
 host.querySelector('#pf-md-smart-dash').addEventListener('change',e=>{setOption('convertSmartOnRender',e.target.checked||options().smartQuote,false);setOption('smartDash',e.target.checked);});
 host.querySelector('#pf-md-smart-quote').addEventListener('change',e=>{setOption('convertSmartOnRender',e.target.checked||options().smartDash,false);setOption('smartQuote',e.target.checked);});
 host.querySelector('#pf-md-legacy-math').addEventListener('change',e=>setOption('noLegacyMath',!e.target.checked));
}
const baseShowPrefs=showPrefs;showPrefs=function(){baseShowPrefs();installPrefs();};
normalize();
window.__CP163C_PROFILE__=Object.freeze({checkpoint:'CP163C',version:'1.0.12',profiles:PROFILES,options,normalize,setProfile,setOption,headingInfo,get ordinary(){return ordinary();}});
})();
/* CP163C Markdown profiles and options: end */

/* CP164 — Markdown-compatible Unicode punctuation, smart typography and math edges.
   Ordinary rendered Markdown only. Paper/TW_THESIS pagination, TW_THESIS custom tables,
   source mode and thesis export continue to use their established paths. */
(function(){
'use strict';
if(window.__CP164_UNICODE_MATH_SMART__)return;
const baseInline=inlineMD,baseBlockType=blockType,baseRenderBlockHTML=renderBlockHTML;
function ordinary(){return !settings.srcmode&&!(typeof inPaperMode==='function'&&inPaperMode());}
function options(){return window.__CP163C_PROFILE__?.options?.()||{};}
function unicodeSyntax(raw){
  let s=String(raw==null?'':raw);
  const o=options();if(!o.remapUnicodePunctuation)return s;
  /* Extended inline grammar remaps only syntax-shaped punctuation on
     parse. Standalone 〉, 【toc】, Unicode task brackets and Unicode rules stay
     literal, matching the original reset/load pathway. */
  s=s.replace(/<![—–]([\s\S]*?)[—–]>/g,'<!--$1-->');
  s=s.replace(/<([A-Za-z][^<>]*?)>/g,m=>m.replace(/[“”„‟«»]/g,'"').replace(/[‘’‚‛‹›]/g,"'"));
  s=s.replace(/!【([^】\n]*)】[（(]([\s\S]*?)[）)]/g,'![$1]($2)');
  s=s.replace(/【([^】\n]+)】[（(]([\s\S]*?)[）)]/g,'[$1]($2)');
  return s;
}
function smartDashText(text,o){
  if(!o.convertSmartOnRender||!o.smartDash)return [{text}];
  const out=[];let i=0,buf='';
  const flush=()=>{if(buf){out.push({text:buf});buf='';}};
  while(i<text.length){
    if(text.startsWith('---',i)){flush();out.push({text:'—',source:'---',kind:'em-dash'});i+=3;continue;}
    if(text.startsWith('--',i)){flush();out.push({text:o.twoHyphensToEm?'—':'–',source:'--',kind:o.twoHyphensToEm?'em-dash':'en-dash'});i+=2;continue;}
    if(text.startsWith('...',i)&&text[i+3]!=='.'){flush();out.push({text:'…',source:'...',kind:'ellipsis'});i+=3;continue;}
    buf+=text[i++];
  }
  flush();return out;
}
function quoteParts(text,o){
  if(!o.convertSmartOnRender||!o.smartQuote)return [{text}];
  const out=[];let buf='',openDouble=true,openSingle=true;
  const flush=()=>{if(buf){out.push({text:buf});buf='';}};
  const before=i=>i?text[i-1]:'';const after=i=>i+1<text.length?text[i+1]:'';
  for(let i=0;i<text.length;i++){
    const ch=text[i];if(ch!=="'"&&ch!=='"'){buf+=ch;continue;}
    flush();const p=before(i),n=after(i),word=/[\p{L}\p{N}]/u;
    if(ch==="'"){
      let rep;
      if(word.test(p)&&word.test(n))rep='’';
      else if(!p||/[\s([{\-\/“]/.test(p)){rep='‘';openSingle=false;}
      else if(!n||/[\s)\]}.，。；：！？!?;:,]/.test(n)){rep='’';openSingle=true;}
      else {rep=openSingle?'‘':'’';openSingle=!openSingle;}
      out.push({text:rep,source:"'",kind:rep==='‘'?'open-single':'close-single'});
    }else{
      let rep;
      if(!p||/[\s([{\-\/‘]/.test(p)){rep='“';openDouble=false;}
      else if(!n||/[\s)\]}.，。；：！？!?;:,]/.test(n)){rep='”';openDouble=true;}
      else {rep=openDouble?'“':'”';openDouble=!openDouble;}
      out.push({text:rep,source:'"',kind:rep==='“'?'open-double':'close-double'});
    }
  }
  flush();return out;
}
function smartHTML(html){
  const o=options();if(!o.convertSmartOnRender||(!o.smartDash&&!o.smartQuote))return String(html||'');
  const t=document.createElement('template');t.innerHTML=String(html||'');const w=document.createTreeWalker(t.content,NodeFilter.SHOW_TEXT),nodes=[];
  while(w.nextNode()){
    const n=w.currentNode,p=n.parentElement;
    if(p&&p.closest('code,pre,script,style,textarea,.katex,.mjx,.mjx-container,.md-math-block,.md-code,.md-meta,a.md-autolink,[data-autolink]'))continue;
    if((o.smartDash&&/(---|--|\.\.\.)/.test(n.nodeValue||''))||(o.smartQuote&&/["']/.test(n.nodeValue||'')))nodes.push(n);
  }
  for(const n of nodes){
    let parts=smartDashText(n.nodeValue||'',o),all=[];
    for(const p of parts){
      if(p.source){all.push(p);continue;}
      all.push(...quoteParts(p.text,o));
    }
    if(parts.length===1&&all.length===1&&!all[0].source)continue;
    const f=document.createDocumentFragment();for(const p of all){if(!p.source){f.append(p.text);continue;}const s=document.createElement('span');s.className='cp164-pants';s.dataset.source=p.source;s.dataset.kind=p.kind||'';s.textContent=p.text;f.append(s);}n.replaceWith(f);
  }
  return t.innerHTML;
}
blockType=function(src){
  if(ordinary()){
    const raw=String(src==null?'':src),o=options();
    if(o.noLegacyMath&&/^\s*\\\[\s*\n[\s\S]*\n\s*\\\]\s*$/.test(raw))return 'p';
  }
  return baseBlockType(src);
};
renderBlockHTML=function(src){
  if(ordinary()){
    const raw=String(src==null?'':src),o=options();
    if(o.noLegacyMath&&/^\s*\\\[\s*\n[\s\S]*\n\s*\\\]\s*$/.test(raw))return `<p class="md-p">${inlineMD(raw)}</p>`;
    const ls=raw.split('\n'),m=ls[0]?.match(/^\s*\$\$\s*\{([^{}\n]+)\}\s*$/);
    if(m&&ls.length>=2){
      const close=ls[ls.length-1].match(/^\s*\$\$\s*(?:\{([^{}\n]+)\})?\s*$/);if(close){const body=ls.slice(1,-1).join('\n');return `<div class="md-math-block cp164-tagged-math" data-equation-tag="${escapeHtml(m[1])}">${mathHTML(body.trim(),true)}</div>`;}
    }
  }
  return baseRenderBlockHTML(src);
};
inlineMD=function(src){
  if(!ordinary())return baseInline(src);
  const html=baseInline(unicodeSyntax(src));return smartHTML(html);
};
window.__CP164_UNICODE_MATH_SMART__=Object.freeze({
  checkpoint:'CP164',version:'1.0.13',build:'CP164-EKDETA-UNICODE-SMART-MATH-EDGES',
  policy:'ordinary-markdown-only-render-remap-smart-typography-math-options-paper-twthesis-isolated',
  unicodeSyntax,smartHTML,options,
  knownExactRawDifference:'Ekdeta normalizes tagged display-math spacing; this product intentionally preserves exact raw bytes.',
  get nativeMacAcceptance(){return false;}
});
})();
/* CP164 Unicode/smart punctuation/math edges: end */

/* CP165 — Markdown-compatible composite container compatibility.
   Direct purpose: Markdown recursively reparses the stripped contents of list and
   blockquote containers.  Earlier CP162 projections could parse a table/math/
   HTML block when it was already one canonical block (common in lists), but a
   blockquote stores each prefixed line as a separate canonical block.  The
   result was that valid or loose atomic blocks inside quotes/alerts degraded to
   paragraphs.  This layer groups those stripped virtual lines at the same
   recursive parser stage used by Markdown.  It is ordinary-Markdown projection
   only; Paper/TW_THESIS retain the flat canonical paginator and custom table model. */
(function(){
'use strict';
if(window.__CP165_COMPOSITE_ACCEPTANCE__)return;

const cp165BaseParseSequence=cp162ParseSequence;
const cp165BaseParseParagraph=cp162ParseParagraph;
const cp165BaseInlineMD=inlineMD;
const cp165BaseParseAtomic=cp162ParseAtomic;
const CP165_TOKEN_L='\uE570',CP165_TOKEN_R='\uE571';

function cp165Ordinary(){
  return !settings.srcmode && !(typeof inPaperMode==='function'&&inPaperMode());
}
function cp165Join(lines,a,b){return lines.slice(a,b).map(x=>String(x&&x.text||'')).join('\n');}

function cp165StripAtomicContainerIndent(line){
  const record=line&&line.record,src=String(record&&record.raw||'');
  if(!src.includes('\n')||!(line.sliceStart>0))return String(line&&line.text||'');
  const removed=cp162IndentColumns(src.slice(0,line.sliceStart));
  return src.split('\n').map(x=>x.slice(cp162CharsForColumns(x,removed))).join('\n');
}
/* A canonical multiline block keeps all physical lines in one record.  When
   nested lists strip their container indentation, the old parser stripped only
   the first physical line and then classified the original 4-space record as
   code.  Markdown classifies after removing the container prefix from every
   physical line. */
cp162ParseAtomic=function(line){
  if(!(line&&line.record&&line.record.raw.includes('\n')&&line.sliceStart>0))return cp165BaseParseAtomic(line);
  const raw=cp165StripAtomicContainerIndent(line),t=blockType(raw),texts=raw.split('\n').map(text=>({text}));
  if(t==='code'){
    const open=cp162MatchFence(texts[0]?.text||'');
    if(open){const closed=texts.length>1&&cp162FenceClose(texts[texts.length-1].text,open),body=texts.slice(1,closed?-1:undefined);const n=cp162Node('fence',[line],{children:[],meta:{lang:open.lang,char:open.char,length:open.length,closed},bodyLines:body,raw});cp162SetContent(n,[line]);return n;}
    const first=cp162MatchIndentedCode(texts[0]?.text||'');
    if(first){const body=texts.map(x=>{const q=cp162IndentedPrefix(x.text);return {text:q?x.text.slice(q.prefixChars):x.text};});const n=cp162Node('indented_code',[line],{children:[],bodyLines:body,meta:{indented:true},raw});cp162SetContent(n,[line]);return n;}
  }
  const map={table:'table',html:'html_block',meta:'meta_block',toc:'toc',def_link:'definition',def_footnote:'definition'};
  const n=cp162Node(map[t]||'atomic',[line],{children:[],meta:{blockType:t},raw});
  if(n.type==='definition')n.meta.defKind=t==='def_footnote'?'footnote':'link';
  return n;
};

function cp165NodeForAtomic(lines,a,b,raw,type){
  const used=lines.slice(a,b),map={table:'table',html:'html_block',def_link:'definition',def_footnote:'definition'};
  const node=cp162Node(map[type]||'atomic',used,{children:[],raw,meta:{blockType:type}});
  if(node.type==='definition')node.meta.defKind=type==='def_footnote'?'footnote':'link';
  return node;
}
function cp165Options(){return window.__CP163C_PROFILE__?.options?.()||{};}
function cp165MathAt(lines,i){
  const first=String(lines[i]?.text||''),opt=cp165Options();
  let close=null;
  if(/^\s*\\\[\s*$/.test(first)){
    if(opt.noLegacyMath===true)return null;close=/^\s*\\\]\s*$/;
  }else{
    const m=first.match(/^\s*\$\$(?:\s*\{([^}\n]+)\})?\s*$/);
    if(!m)return null;
    const tag=m[1]||'';
    close=tag?new RegExp('^\\s*\\$\\$\\s*\\{'+tag.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\}\\s*$'):/^\s*\$\$\s*$/;
  }
  for(let j=i+1;j<lines.length;j++)if(close.test(String(lines[j]?.text||''))){
    const raw=cp165Join(lines,i,j+1);if(blockType(raw)==='math')return {node:cp165NodeForAtomic(lines,i,j+1,raw,'math'),next:j+1};
    break;
  }
  return null;
}
function cp165HtmlAt(lines,i){
  const first=String(lines[i]?.text||''),open=typeof markdownHtmlBlockOpen==='function'?markdownHtmlBlockOpen(first):null;
  if(!open)return null;
  let depth=typeof markdownHtmlTagDelta==='function'?markdownHtmlTagDelta(first,open.tag):0,j=i+1;
  if(depth<=0){const raw=first;return blockType(raw)==='html'?{node:cp165NodeForAtomic(lines,i,i+1,raw,'html'),next:i+1}:null;}
  while(j<lines.length){
    const t=String(lines[j]?.text||'');
    if(!t.trim())break;
    depth+=markdownHtmlTagDelta(t,open.tag);j++;if(depth<=0)break;
  }
  const raw=cp165Join(lines,i,j);return blockType(raw)==='html'?{node:cp165NodeForAtomic(lines,i,j,raw,'html'),next:j}:null;
}
function cp165TableAt(lines,i){
  if(i+1>=lines.length)return null;
  /* A table candidate must become a table with at least header+delimiter. */
  let end=-1;
  for(let j=i+2;j<=Math.min(lines.length,i+64);j++){
    const raw=cp165Join(lines,i,j),t=blockType(raw);
    if(t==='table')end=j;
    if(j<lines.length){
      const n=String(lines[j]?.text||'');
      if(!n.trim()||cp162MatchList(n)||cp162MatchQuote(n)||cp162MatchHeading(n,true)||cp162MatchFence(n)||cp162IsHr(n))break;
    }
  }
  if(end<0)return null;
  const raw=cp165Join(lines,i,end);return {node:cp165NodeForAtomic(lines,i,end,raw,'table'),next:end};
}
function cp165DefinitionAt(lines,i){
  const raw=String(lines[i]?.text||''),t=blockType(raw);
  if(t==='def_link'||t==='def_footnote')return {node:cp165NodeForAtomic(lines,i,i+1,raw,t),next:i+1};
  return null;
}
function cp165AtomicAt(lines,i,ctx){
  if(!lines[i]||cp162IsBlank(lines[i])||cp162IsAtomic(lines[i]))return null;
  /* At a blockquote's outer level, indented lines belong to a list item and
     must be claimed by the list parser first.  After list indentation is
     stripped, ctx.inListItem is true and the same detector runs recursively. */
  if(cp162Leading(lines[i].text).columns>=2)return null;
  return cp165DefinitionAt(lines,i)||cp165MathAt(lines,i)||cp165HtmlAt(lines,i)||cp165TableAt(lines,i);
}

/* Paragraphs must stop immediately before a recursively-recognized atomic
   child.  This is the same precedence principle as Markdown's block parser. */
cp162ParseParagraph=function(lines,i,ctx){
  if(!ctx?.inContainer)return cp165BaseParseParagraph(lines,i,ctx);
  const used=[lines[i]];let j=i+1;
  while(j<lines.length&&!cp162IsBlank(lines[j])&&!cp162Explicit(lines[j],ctx)&&!cp165AtomicAt(lines,j,ctx)){used.push(lines[j]);j++;}
  return {node:cp162Node('paragraph',used,{children:[]}),next:j};
};

/* Only quote/alert-derived virtual lines need regrouping.  Top-level and
   Paper/TW_THESIS block records retain their existing byte-stable parser path. */
cp162ParseSequence=function(lines,ctx){
  if(!ctx?.inContainer)return cp165BaseParseSequence(lines,ctx);
  const out=[];let i=0;
  while(i<lines.length){
    const atom=cp165AtomicAt(lines,i,ctx);
    if(atom){out.push(atom.node);i=atom.next;continue;}
    let next=i+1;
    while(next<lines.length&&!cp165AtomicAt(lines,next,ctx))next++;
    const part=lines.slice(i,next),nodes=cp165BaseParseSequence(part,ctx);out.push(...nodes);i=next;
  }
  return out;
};

/* Reference definitions prefixed by one or more quote markers are visible to
   reference links/images in the same document in the editor.  CP162D's
   original definition map intentionally scans canonical blocks; extend the
   final inline projection with a stripped-container map without rewriting raw. */
function cp165NormRef(s){return String(s==null?'':s).trim().replace(/\s+/g,' ').toLowerCase();}
function cp165StripQuote(s){
  let x=String(s==null?'':s);
  for(let k=0;k<8;k++){const m=x.match(/^[ \t]{0,3}>[ \t]?/);if(!m)break;x=x.slice(m[0].length);}
  return x;
}
function cp165ReferenceDefs(){
  const map=new Map();
  for(const block of blocks||[]){
    for(const rawLine of String(block==null?'':block).split('\n')){
      const line=cp165StripQuote(rawLine);
      const m=line.match(/^\s*\[([^\]^][^\]]*)\]:(\s*)(<?)([^\s>]+)(>?)(?:(\s+)(["'(])([^\n]*)(["')]))?\s*$/);
      if(!m)continue;const key=cp165NormRef(m[1]);if(!key||map.has(key))continue;
      map.set(key,{name:m[1],url:m[4],title:m[8]||''});
    }
  }
  return map;
}
function cp165Token(stash,kind,value){const i=stash.push({kind,value})-1;return CP165_TOKEN_L+i+CP165_TOKEN_R;}
function cp165RestoreRefs(html,stash){
  return String(html).replace(new RegExp(CP165_TOKEN_L+'(\\d+)'+CP165_TOKEN_R,'g'),(_,n)=>{
    const x=stash[+n];if(!x)return '';
    const d=x.value.d,title=d.title?` title="${escapeHtml(d.title)}"`:'';
    if(x.kind==='image'){
      const src=sanitizeURL(typeof normalizeImgPath==='function'?normalizeImgPath(d.url):d.url,true);
      return `<img class="md-img md-ref-img cp165-container-ref" data-ref="${escapeHtml(x.value.key)}" draggable="false" src="${src}" alt="${escapeHtml(x.value.label)}"${title}>`;
    }
    return `<a class="md-a md-ref-a cp165-container-ref" data-ref="${escapeHtml(x.value.key)}" href="${sanitizeURL(d.url,false)}"${title}>${cp165BaseInlineMD(x.value.label)}</a>`;
  });
}
inlineMD=function(src){
  if(!cp165Ordinary())return cp165BaseInlineMD(src);
  const defs=cp165ReferenceDefs();if(!defs.size)return cp165BaseInlineMD(src);
  const stash=[];let raw=String(src==null?'':src);
  raw=raw.replace(/!\[([^\]\n]+)\]\[([^\]\n]*)\]/g,(m,label,id)=>{
    const key=cp165NormRef(id||label),d=defs.get(key);return d?cp165Token(stash,'image',{label,key,d}):m;
  });
  raw=raw.replace(/(^|[^!\\])\[([^\]\n]+)\]\[([^\]\n]*)\]/g,(m,pre,label,id)=>{
    const key=cp165NormRef(id||label),d=defs.get(key);return d?pre+cp165Token(stash,'link',{label,key,d}):m;
  });
  return cp165RestoreRefs(cp165BaseInlineMD(raw),stash);
};

window.__CP165_COMPOSITE_ACCEPTANCE__=Object.freeze({
  checkpoint:'CP165',version:'1.0.14',build:'CP165-EKDETA-COMPOSITE-COMPATIBILITY-ACCEPTANCE',
  policy:'original-runtime-recursive-quote-atomic-composite-corpus-exact-raw-paper-twthesis-thesis-isolation',
  expectedCompositeCases:256,recursiveAtomicAt:cp165AtomicAt,referenceDefs:cp165ReferenceDefs,
  originalMacFinalAcceptance:false
});
})();


window.__CP162_CONTAINER_AST__=Object.freeze({
  checkpoint:CP162.checkpoint,version:CP162.version,build:CP162.build,policy:CP162.policy,
  parse:(md,opt)=>{const a=Array.isArray(md)?md:splitToBlocks(String(md==null?'':md).replace(/\r\n?/g,'\n'));return cp162Parse(a,opt||{});},
  shape:cp162AstShape,dirtyWindowFor:(a,b)=>cp162DirtyWindow(a,b),
  apply:cp162Apply,clear:cp162Invalidate,audit:()=>cp162Ast?cp162Audit(cp162Ast):null,
  pointToRaw:cp162PointToRaw,selectionRawRange:cp162SelectionRawRange,render:cp162RenderNode,
  get ast(){return cp162Ast;},get projections(){return cp162Projection.map(x=>({...x}));},get stats(){return cp162LastStats?JSON.parse(JSON.stringify(cp162LastStats)):null;},
  get sourceBlocks(){return cp162LastBlocks.slice();},get dirtyWindow(){return cp162LastDirtyWindow?{...cp162LastDirtyWindow}:null;},
  domForNode:id=>editor.querySelector(`[data-cp162-node-id="${id}"]`),
  get lastUpdate(){return cp162LastUpdate?{mode:cp162LastUpdate.mode,stableNodes:cp162LastUpdate.stableNodes,stableDirtyNodes:cp162LastUpdate.stableDirtyNodes||0,stableDirtyUnchanged:cp162LastUpdate.stableDirtyUnchanged||0,stableDirtyChangedShells:cp162LastUpdate.stableDirtyChangedShells||0,localBlocks:cp162LastUpdate.localBlocks,blockDelta:cp162LastUpdate.blockDelta||0,fallback:cp162LastUpdate.fallback||null}:null;}
});

cp162Schedule();
})();

