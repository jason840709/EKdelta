
(() => {
'use strict';
if (window.__CP169B3_MAPPING__) return;
const META = Object.freeze({
  checkpoint: 'CP169B3',
  stage: 'markdown-project-tex-synctex-source-map',
  status: 'prototype',
  policy: 'canonical-markdown-to-actual-project-tex-files-to-synctex-without-pdf-iframe'
});
const state = { revision: -1, busy: false, map: null, sync: null, error: '', builtAt: 0 };
function fnv1a(text) { let h=0x811c9dc5; for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,0x01000193);} return (h>>>0).toString(16).padStart(8,'0'); }
function lineStarts(text){const a=[0];for(let i=0;i<text.length;i++)if(text.charCodeAt(i)===10)a.push(i+1);return a;}
function lineAt(starts,pos){let lo=0,hi=starts.length;while(lo<hi){const m=(lo+hi)>>>1;if(starts[m]<=pos)lo=m+1;else hi=m;}return Math.max(1,lo);}
function basename(path){return String(path||'').replace(/\\/g,'/').split('/').pop();}
function sourceRecords(md){
 const raws=splitToBlocks(String(md||''));let cursor=0;
 return raws.map((raw,sourceIndex)=>{
  let rawStart=raw?md.indexOf(raw,cursor):cursor;if(rawStart<0&&raw)rawStart=md.indexOf(raw);if(rawStart<0)rawStart=cursor;
  const rawEnd=rawStart+raw.length;if(raw)cursor=rawEnd;const fence=revtexFence(raw),kind=fence?fence.lang:blockType(raw);
  let texFragment='',transformError='';try{texFragment=revtexCitationTex(raw).trim();}catch(error){transformError=String(error&&error.message||error);}
  return {blockId:`cp169b3-${sourceIndex}-${fnv1a(`${rawStart}:${rawEnd}:${raw}`)}`,sourceIndex,rawStart,rawEnd,raw,kind,fenceBody:fence?fence.body:'',texFragment,transformError,mapped:false,method:raw?'unmatched':'empty'};
 });
}
function normalizeProject(projectInput){
 const files={};
 if(typeof projectInput==='string')files['main.tex']=projectInput;
 else if(Array.isArray(projectInput))for(const f of projectInput){if(!f)continue;const path=basename(f.path||f.name);if(!path)continue;if(typeof f.contents==='string')files[path]=f.contents;else if(typeof f.text==='string')files[path]=f.text;}
 else if(projectInput&&typeof projectInput==='object')for(const [path,text] of Object.entries(projectInput))if(typeof text==='string')files[basename(path)]=text;
 return files;
}
function build(md,projectInput){
 md=String(md||'');const files=normalizeProject(projectInput),main=files['main.tex']||'',records=sourceRecords(md),contexts={};
 for(const [path,text] of Object.entries(files))contexts[path]={text,starts:lineStarts(text),used:[],preferred:0};
 function ctx(path){return contexts[path]||null;}
 function makeRange(path,a,b,method){const c=ctx(path);return {mapped:!!c&&a>=0&&b>a,method,texPath:path,texStart:a,texEnd:b,texLineStart:lineAt(c.starts,a),texLineEnd:lineAt(c.starts,Math.max(a,b-1))};}
 function freeRange(path,needle,preferredStart=0){const c=ctx(path);if(!c||!needle)return null;const pos=[];let p=c.text.indexOf(needle,preferredStart);while(p>=0){pos.push(p);p=c.text.indexOf(needle,p+1);}if(preferredStart){p=c.text.indexOf(needle,0);while(p>=0&&p<preferredStart){pos.push(p);p=c.text.indexOf(needle,p+1);}}
  for(const a of pos){const b=a+needle.length;if(!c.used.some(([x,y])=>a<y&&b>x)){c.used.push([a,b]);return[a,b];}}return null;}
 function environment(path,name,from=0){const c=ctx(path);if(!c)return null;const o=`\\begin{${name}}`,z=`\\end{${name}}`,a=c.text.indexOf(o,from),b=a>=0?c.text.indexOf(z,a):-1;return a>=0&&b>=0?[a,b+z.length]:null;}
 for(const rec of records){if(!rec.raw)continue;let found=null,method='unmatched',path='main.tex';const c=ctx(path);
  if(rec.kind==='revtex-frontmatter'){
   let a=main.indexOf('\\preprint{');if(a<0)a=main.indexOf('\\title');const mt=a>=0?main.indexOf('\\maketitle',a):-1;if(a>=0&&mt>=0){found=[a,mt+'\\maketitle'.length];method='frontmatter-through-maketitle';}
  }else if(rec.kind==='revtex-abstract'){found=environment(path,'abstract');method='abstract-environment';
  }else if(rec.kind==='revtex-acknowledgments'){found=environment(path,'acknowledgments');method='acknowledgments-environment';
  }else if(rec.kind==='revtex-bibliography'){
   path=files['bibliography.tex']?'bibliography.tex':'main.tex';found=environment(path,'thebibliography');
   if(!found&&path==='main.tex'){const a=main.indexOf('\\bibliographystyle');let b=a>=0?main.indexOf('\\appendix',a):-1;if(b<0&&a>=0)b=main.indexOf('\\end{document}',a);if(a>=0&&b>a)found=[a,b];}
   method=path==='bibliography.tex'?'bibliography-sidecar':'bibliography-region';
  }else if(rec.kind==='revtex-appendix'){found=freeRange(path,'\\appendix',0);method='appendix-marker';
  }else if(rec.kind==='revtex-wide'){found=environment(path,'widetext');method='widetext-environment';
  }else if(rec.kind==='ol'){const m=rec.texFragment.match(/\\item\s+([\s\S]*?)\n\\end\{enumerate\}/);found=freeRange(path,m?m[1].trim():'',0);method='list-item-content';
  }else if(rec.kind==='h'&&/^\s*#{1,6}\s*(?:References?|Bibliography|參考文獻|參考書目)\s*$/i.test(rec.raw)){
   path=files['bibliography.tex']?'bibliography.tex':'main.tex';const cc=ctx(path),a=cc?cc.text.indexOf('\\begin{thebibliography}'):-1;if(a>=0)found=[a,a+1];method='suppressed-bibliography-heading';
  }else{found=freeRange(path,rec.texFragment,c?c.preferred:0);method='exact-transformed-fragment';}
  if(found){Object.assign(rec,makeRange(path,found[0],found[1],method));const cc=ctx(path);if(cc)cc.preferred=Math.max(cc.preferred,found[1]);}
 }
 const nonEmpty=records.filter(r=>r.raw),mapped=nonEmpty.filter(r=>r.mapped),fileSummary={};for(const [path,text] of Object.entries(files))fileSummary[path]={bytes:new TextEncoder().encode(text).byteLength,hash:fnv1a(text),lines:lineStarts(text).length};
 return {schema:'cp169b3-markdown-project-tex-map-v2',markdownHash:fnv1a(md),markdownBytes:new TextEncoder().encode(md).byteLength,files:fileSummary,coverage:{mapped:mapped.length,total:nonEmpty.length,ratio:nonEmpty.length?mapped.length/nonEmpty.length:1},records};
}
async function gunzip(bytes){if(!bytes)throw new Error('缺少 SyncTeX。');if(typeof DecompressionStream!=='function')throw new Error('瀏覽器不支援 DecompressionStream(gzip)。');return await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();}
function parseSyncText(text){
 const inputs={},nodes=[];let page=0,unit=1,magnification=1000,xOffset=0,yOffset=0;const re=/^([\[\(vhxkg$]?)(-?\d+),(-?\d+):(-?\d+),(-?\d+)(?::(-?\d+),(-?\d+),(-?\d+))?/;
 for(const line of String(text||'').split(/\r?\n/)){let m;if((m=line.match(/^Input:(\d+):(.*)$/))){inputs[+m[1]]=m[2];continue;}if((m=line.match(/^Unit:(-?\d+)/))){unit=+m[1]||1;continue;}if((m=line.match(/^Magnification:(-?\d+)/))){magnification=+m[1]||1000;continue;}if((m=line.match(/^X Offset:(-?\d+)/))){xOffset=+m[1]||0;continue;}if((m=line.match(/^Y Offset:(-?\d+)/))){yOffset=+m[1]||0;continue;}if(/^\{\d+$/.test(line)){page=+line.slice(1);continue;}if(line==='}'){page=0;continue;}m=line.match(re);if(!m||page<=0)continue;nodes.push({type:m[1]||'',input:+m[2],line:+m[3],page,x:+m[4],y:+m[5],w:+(m[6]||0),h:+(m[7]||0),d:+(m[8]||0)});}
 const inputByBase={};for(const [id,path] of Object.entries(inputs))inputByBase[basename(path)]=+id;
 return {schema:'cp169b3-synctex-v2',inputs,inputByBase,unit,magnification,xOffset,yOffset,nodes};
}
function boxesFor(nodes){const groups=new Map();for(const n of nodes){const key=`${n.page}:${n.y}`;let g=groups.get(key);if(!g)groups.set(key,g={page:n.page,y:n.y,minX:n.x,maxX:n.x+n.w,count:0,types:{}});g.minX=Math.min(g.minX,n.x);g.maxX=Math.max(g.maxX,n.x+n.w);g.count++;g.types[n.type||'_']=(g.types[n.type||'_']||0)+1;}
 return [...groups.values()].sort((a,b)=>a.page-b.page||a.y-b.y).map(g=>({page:g.page,baselinePt:g.y/65536,minXPt:g.minX/65536,maxXPt:g.maxX/65536,topPt:g.y/65536-10.5,heightPt:14,nodeCount:g.count,types:g.types}));}
function bind(map,sync){const byInputLine=new Map();for(const n of sync.nodes){const key=`${n.input}:${n.line}`;let a=byInputLine.get(key);if(!a)byInputLine.set(key,a=[]);a.push(n);}
 for(const rec of map.records){if(!rec.mapped){rec.syncNodeCount=0;rec.syncPages=[];rec.syncBoxes=[];continue;}const input=sync.inputByBase[basename(rec.texPath)],hits=[];if(input)for(let line=rec.texLineStart;line<=rec.texLineEnd;line++){const a=byInputLine.get(`${input}:${line}`);if(a)hits.push(...a);}rec.syncInput=input||0;rec.syncNodeCount=hits.length;rec.syncPages=[...new Set(hits.map(n=>n.page))].sort((a,b)=>a-b);rec.syncBoxes=boxesFor(hits);}
 const visual=map.records.filter(r=>r.raw&&!['revtex-appendix'].includes(r.kind)),linked=visual.filter(r=>r.syncNodeCount>0);map.syncCoverage={linked:linked.length,total:visual.length,ratio:visual.length?linked.length/visual.length:1};return map;}
async function rebuild(){const proof=window.__CP169A_TEX_PROOF__;if(!proof)return null;const ps=proof.getState?.()||{};if(!ps.pdfBytes||ps.busy||ps.stale||!proof.getSynctex?.())return null;state.busy=true;state.error='';try{const lossless=typeof losslessActiveNormalized==='function'?losslessActiveNormalized():'';const md=lossless||serialize(),project=proof.getProjectFiles?.()||[{path:'main.tex',contents:proof.getTex?.()||''}],map=build(md,project),sync=parseSyncText(await gunzip(proof.getSynctex()));bind(map,sync);state.map=map;state.sync=sync;state.revision=ps.revision;state.builtAt=Date.now();document.dispatchEvent(new CustomEvent('cp169b3:mapping-ready',{detail:{revision:state.revision,coverage:map.coverage,syncCoverage:map.syncCoverage}}));return map;}catch(error){state.error=String(error&&error.stack||error);console.error('[CP169B3 mapping]',error);return null;}finally{state.busy=false;}}

function adopt(map,sync,revision=0){state.map=map||null;state.sync=sync||null;state.revision=revision;state.builtAt=Date.now();state.error='';return state.map;}
function expandedBox(box){
 let x0=box.minXPt,x1=box.maxXPt;
 if(x1<=330){x0=Math.min(x0,52);x1=Math.max(x1,301);}
 else if(x0>=285){x0=Math.min(x0,311);x1=Math.max(x1,560);}
 else{x0=Math.min(x0,52);x1=Math.max(x1,560);}
 return {...box,x0,x1,y0:box.topPt,y1:box.topPt+box.heightPt};
}
function resolvePoint(page,xPt,yPt){
 const map=state.map;if(!map)return null;let best=null;
 for(const rec of map.records){
  if(!rec.mapped||!rec.syncBoxes?.length)continue;
  for(const rawBox of rec.syncBoxes){
   if(rawBox.page!==page)continue;const b=expandedBox(rawBox);
   const dx=xPt<b.x0?b.x0-xPt:xPt>b.x1?xPt-b.x1:0,dy=yPt<b.y0?b.y0-yPt:yPt>b.y1?yPt-b.y1:0;
   const score=dy*5+dx+(rec.kind==='revtex-frontmatter'?0.8:0);
   if(!best||score<best.score)best={score,record:rec,box:b};
  }
 }
 return best;
}
function openRecord(recordOrIndex,rawOffset){
 const rec=typeof recordOrIndex==='number'?state.map?.records.find(r=>r.sourceIndex===recordOrIndex):recordOrIndex;
 if(!rec||rec.sourceIndex<0||rec.sourceIndex>=blocks.length)return false;
 const host=document.querySelector(`#revtex-wysiwyg [data-rvx-source-index="${rec.sourceIndex}"]`);
 try{host?.scrollIntoView({block:'center',inline:'nearest'});}catch(_){host?.scrollIntoView();}
 const local=Number.isFinite(rawOffset)?rawOffset:Math.max(0,Math.min(rec.raw.length,Math.floor(rec.raw.length/2)));
 openPaperEdit(rec.sourceIndex,local);return peIndex===rec.sourceIndex;
}
function resolveAndOpen(page,xPt,yPt){const hit=resolvePoint(page,xPt,yPt);if(!hit)return null;openRecord(hit.record);return hit;}

const timer=setInterval(()=>{const proof=window.__CP169A_TEX_PROOF__,ps=proof?.getState?.();if(!ps||ps.busy||ps.stale||!ps.pdfBytes||ps.revision===state.revision||state.busy)return;rebuild();},500);
window.__CP169B3_MAPPING__=Object.freeze({meta:META,build,gunzip,parseSyncText,bind,adopt,rebuild,resolvePoint,resolveAndOpen,openRecord,getMap:()=>state.map,getSync:()=>state.sync,getState:()=>({revision:state.revision,busy:state.busy,error:state.error,builtAt:state.builtAt,coverage:state.map?.coverage||null,syncCoverage:state.map?.syncCoverage||null}),dispose:()=>clearInterval(timer)});
})();
