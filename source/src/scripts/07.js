
/* CP168 — official REVTeX PDF two-round calibration. */
(() => {
'use strict';
if(window.__CP168_REVTEX_PDF_CALIBRATION__) return;
let cp168Frontmatter=null;
const cp168RenderBlockBase=renderBlockHTML;
const cp168ApplyThemeBase=revtexApplyThemeProfile;
const cp168EffectiveColumnsBase=revtexEffectiveColumns;
const cp168ExportPdfBase=exportPDFVector;

function cp168PagePt(){return {w:paperPageWidthMM()/25.4*72,h:paperPageHeightMM()/25.4*72};}
function cp168OfficialProfile(){
  const page=cp168PagePt(),soc=String(settings.revtexSociety||'aps'),mode=String(settings.revtexMode||'reprint'),size=revtexModeFontSize();
  const pre=!['reprint','galley'].includes(mode);
  let textWidth,textHeight,columnSep,left,top,fontPt,leadingPt;
  if(soc==='sor' && String(settings.revtexJournal||'')==='jor'){
    textWidth=396;textHeight=642;columnSep=10;left=100;top=92;fontPt=10;leadingPt=11.5;
  }else if(pre){
    textWidth=468;textHeight=665.5;columnSep=10;left=72;top=72;
    if(size==='12pt'){fontPt=12;leadingPt=14;}else if(size==='11pt'){fontPt=10.95;leadingPt=13.6;}else{fontPt=10;leadingPt=12;}
  }else{
    textWidth=510;textHeight=672;columnSep=18;left=52;top=52;fontPt=10;leadingPt=(soc==='aip'||soc==='aapm'||soc==='sor')?11.5:12;
  }
  const right=Math.max(18,page.w-left-textWidth),bottom=Math.max(18,page.h-top-textHeight);
  return {pageW:page.w,pageH:page.h,textWidth,textHeight,columnSep,left,right,top,bottom,fontPt,leadingPt,preprint:pre,society:soc,journal:String(settings.revtexJournal||'')};
}
function cp168DateText(s){const v=String(s||'').trim();return v?(/^\(?Dated\s*:/i.test(v)?v:'(Dated: '+v+')'):'';}
function cp168AuthorMark(i){return settings.revtexSociety==='aps'?'*':String.fromCharCode(97+i)+')';}
function cp168InlineAuthorMark(i){return settings.revtexSociety==='aps'?'*':String.fromCharCode(97+i)+')';}

revtexEffectiveColumns=function(){
  if(String(settings.revtexSociety||'')==='sor' && String(settings.revtexJournal||'')==='jor') return 1;
  return cp168EffectiveColumnsBase();
};

revtexRenderFrontmatter=function(body){
  try{baseFrontmatter(body);}catch(_){}const m=revtexParseFrontmatter(body),e=escapeHtml;window.__cp168Frontmatter=m;
  const globalAff=m.affiliations.filter(Boolean);
  let groups='';
  if(settings.revtexAddress==='superscriptaddress'){
    const all=[];m.authors.forEach(a=>a.affiliations.forEach(x=>{if(x&&!all.includes(x))all.push(x);}));globalAff.forEach(x=>{if(x&&!all.includes(x))all.push(x);});
    groups='<div class="revtex-author-groups"><div class="revtex-author-line">'+m.authors.map((a,i)=>{const ids=(a.affiliations.length?a.affiliations:globalAff).map(x=>all.indexOf(x)+1).filter(x=>x>0).join(',');return '<span class="revtex-author-name">'+inlineMD(a.name||'')+(ids?'<sup>'+ids+'</sup>':'')+(a.email?'<sup>'+cp168InlineAuthorMark(i)+'</sup>':'')+'</span>';}).join(', ')+'</div><div class="revtex-affiliations">'+all.map((x,i)=>'<div class="revtex-affiliation"><sup>'+(i+1)+'</sup>'+inlineMD(x)+'</div>').join('')+'</div></div>';
  }else{
    groups='<div class="revtex-author-groups">'+m.authors.map((a,i)=>{const aff=(a.affiliations.length?a.affiliations:globalAff);return '<div class="revtex-author-group"><div class="revtex-author-name">'+inlineMD(a.name||'')+(a.email?'<sup>'+cp168InlineAuthorMark(i)+'</sup>':'')+'</div>'+aff.map(x=>'<div class="revtex-affiliation">'+inlineMD(x)+'</div>').join('')+'</div>';}).join('')+'</div>';
  }
  const notes=m.authors.map((a,i)=>a.email?'<div class="revtex-author-note"><sup>'+cp168AuthorMark(i)+'</sup> '+(settings.revtexSociety==='aps'?'':'Electronic mail: ')+e(a.email)+'</div>':'').join('');
  return '<section class="revtex-frontmatter" contenteditable="false">'+
    (m.preprints.length?'<div class="revtex-preprint">'+m.preprints.map(e).join('<br>')+'</div>':'<div class="revtex-preprint"></div>')+
    '<div class="revtex-title">'+inlineMD(m.title||'Untitled manuscript')+'</div>'+groups+
    (m.collaborations.length?'<div class="revtex-affiliations">'+m.collaborations.map(x=>'<div class="revtex-affiliation">'+inlineMD(x)+'</div>').join('')+'</div>':'')+
    (m.date?'<div class="revtex-date">'+inlineMD(cp168DateText(m.date))+'</div>':'')+
    (notes?'<div class="revtex-author-notes">'+notes+'</div>':'')+
    '<div class="revtex-classline">\\documentclass['+e(revtexClassOptions().join(','))+']{revtex4-2}</div></section>';
};

renderBlockHTML=function(src){
  if(isRevtexTheme()){
    const f=revtexFence(src);
    if(f&&f.lang==='revtex-abstract'){
      const m=cp168Frontmatter||{};
      const apsPreprint=settings.revtexSociety==='aps'&&!['reprint','galley'].includes(settings.revtexMode);
      const label=settings.revtexSociety==='sor'?'Synopsis':(apsPreprint?'Abstract':'');
      let meta='';
      if(settings.revtexSociety==='aps'&&settings.revtexShowPacs&&m.pacs)meta+='<div class="revtex-abstract-meta"><b>PACS numbers:</b> '+inlineMD(m.pacs)+'</div>';
      if(settings.revtexShowKeys&&m.keywords)meta+='<div class="revtex-abstract-meta"><b>Keywords:</b> '+inlineMD(m.keywords)+'</div>';
      return '<section class="revtex-abstract">'+(label?'<span class="revtex-abstract-title">'+label+'</span>':'<span class="revtex-abstract-title"></span>')+revtexRenderInner(f.body)+meta+'</section>';
    }
    if(f&&f.lang==='revtex-acknowledgments')return '<section class="revtex-acknowledgments"><span class="revtex-acknowledgments-title">Acknowledgments.</span> '+revtexRenderInner(f.body)+'</section>';
  }
  return cp168RenderBlockBase(src);
};

revtexApplyThemeProfile=function(){
  const r=cp168ApplyThemeBase(),b=document.body,on=isRevtexTheme();
  ['rvx-society-aps','rvx-society-aip','rvx-society-aapm','rvx-society-sor','rvx-journal-prl','rvx-mode-preprint','rvx-mode-reprint','rvx-titlepage'].forEach(c=>b.classList.remove(c));
  if(on){b.classList.add('rvx-society-'+String(settings.revtexSociety||'aps'));if(settings.revtexJournal==='prl')b.classList.add('rvx-journal-prl');b.classList.add(['reprint','galley'].includes(String(settings.revtexMode||''))?'rvx-mode-reprint':'rvx-mode-preprint');if(settings.revtexTitlePage)b.classList.add('rvx-titlepage');const p=cp168OfficialProfile();b.style.setProperty('--revtex-font','"STIX","STIXGeneral","Times New Roman",Times,serif');b.style.setProperty('--revtex-body-pt',p.fontPt+'pt');b.style.setProperty('--revtex-leading',p.leadingPt+'pt');}
  return r;
};


function cp168RevtexPrintHTML(){
  const pages=document.querySelector('#revtex-wysiwyg .rvx-live-pages');
  const styles=[...document.querySelectorAll('style')].map(x=>x.outerHTML).join('');
  return '<!doctype html><html><head><meta charset="utf-8">'+styles+'<style>html,body{margin:0!important;padding:0!important;background:#fff!important}.rvx-live-pages{display:block!important;gap:0!important}.rvx-live-page{display:block!important;margin:0!important;box-shadow:none!important;break-after:page!important;page-break-after:always!important}.rvx-live-page:last-child{break-after:auto!important;page-break-after:auto!important}.rvx-live-page{overflow:hidden!important;box-sizing:border-box!important}.rvx-live-toolbar{display:none!important}</style></head><body>'+(pages?pages.outerHTML:'')+'</body></html>';
}
exportPDFVector=async function(){
  if(!isRevtexTheme())return cp168ExportPdfBase();
  if(vectorPrintFrame){toast('A REVTeX PDF print window is already open.');return false;}
  try{
    commitPaperEdit();commitMathEdit();exitTableEdit();deactivate(true);window.__CP165_REVTEX__?.render();await raf2();
    const fr=document.createElement('iframe');fr.setAttribute('aria-hidden','true');fr.tabIndex=-1;fr.style.cssText='position:fixed;left:-220vw;top:0;width:'+paperPageWidthMM()+'mm;height:'+paperPageHeightMM()+'mm;border:0;opacity:.01;pointer-events:none;background:#fff;z-index:-1';document.body.appendChild(fr);vectorPrintFrame=fr;
    const doc=fr.contentDocument;doc.open();doc.write(cp168RevtexPrintHTML());doc.close();await new Promise(r=>setTimeout(r,200));
    const done=()=>cleanupVectorPrintFrame();try{fr.contentWindow.addEventListener('afterprint',done,{once:true});}catch(_){}vectorPrintCleanupTimer=setTimeout(done,120000);fr.contentWindow.focus();fr.contentWindow.print();return true;
  }catch(err){console.error('[CP168 exportPDFVector]',err);cleanupVectorPrintFrame();toast('REVTeX PDF preparation failed: '+(err?.message||err),7000);return false;}
};

window.__CP168R1_REVTEX_COLUMN_FIX__=Object.freeze({
  checkpoint:'CP168R1',version:'1.1.2',
  policy:'column-shortcuts-change-only-revtexColumns',
  visualGate:Object.freeze({firstPageMinUsedRatio:0.35,forbidUnexpectedAbstractPage:true,measureLargestBlankBand:true})
});
window.__CP168_REVTEX_PDF_CALIBRATION__=Object.freeze({checkpoint:'CP168',version:'1.1.1',round:2,profile:cp168OfficialProfile,policy:'official-revtex-pdf-versus-html-pdf-two-round-calibration'});
})();
