
/* cp173-91-color-toolbar.js — 字體顏色工具列（CP173）
 * 以 HTML <span style="color:#RRGGBB"> 持久化，沿用既有 runInlineTransform
 * 的 selection／Undo／Source Mode adapter。模組只追加 DOM/CSS，不修改核心 toolbar。
 */
(function(){
  'use strict';
  if (window.__CP173_COLOR_TOOLBAR__) return;

  var KEY = 'ekdeta.colorHistory.v1', CUSTOM_KEY = 'ekdeta.customColors.v1', MAX_ROW = 10;
  /* Ten columns ordered black, white, neutral grey, red, orange, yellow,
     green, blue, indigo, violet. Each row moves from dark to light. */
  var THEME = [
    '#000000','#FFFFFF','#404040','#800000','#A04000','#806000','#006400','#003C80','#202060','#4B0082',
    '#1A1A1A','#F2F2F2','#606060','#A00000','#C05000','#A08000','#008000','#005AA0','#303090','#663399',
    '#333333','#E5E5E5','#808080','#C00000','#E07000','#C0A000','#00A040','#0070C0','#4040A0','#8040A0',
    '#555555','#D9D9D9','#A0A0A0','#E00000','#F08020','#E0C000','#20B050','#008ED0','#6060C0','#9950B0',
    '#777777','#BFBFBF','#C0C0C0','#F04040','#F0A060','#F0D040','#50C070','#40A8E0','#8888D0','#B070C0',
    '#999999','#FAFAFA','#E0E0E0','#FF8080','#FFC080','#FFF080','#90D0A0','#90D0E0','#B0B0E0','#D0A0D0'
  ];
  var STANDARD = ['#B80001','#EC0001','#FFB802','#FFFF03','#87CA47','#01A747','#00A7EE','#0065B8','#001E55','#652B96'];
  var DEFAULT = THEME.concat(STANDARD);
  /* A red initial swatch avoids confusing the colour indicator with
     the neighbouring underline command. */
  var current = '#EC0001', history = [], custom = [];
  try { var x = JSON.parse(localStorage.getItem(KEY) || '[]'); if (Array.isArray(x)) history = x.filter(valid).map(norm).slice(0,MAX_ROW); } catch(_e) {}
  try { var y = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); if (Array.isArray(y)) custom = y.filter(valid).map(norm).filter(function(c,i,a){return a.indexOf(c)===i;}).slice(0,MAX_ROW); } catch(_e) {}
  function valid(v){ return /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(v||'')); }
  function norm(v){
    v = String(v || '').trim(); if (v[0] !== '#') v = '#' + v;
    if (v.length === 4) v = '#' + v.slice(1).split('').map(function(c){return c+c;}).join('');
    return v.toUpperCase();
  }
  function save(){ try { localStorage.setItem(KEY, JSON.stringify(history)); localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom)); } catch(_e) {} }
  function remember(c){ c = norm(c); history = [c].concat(history.filter(function(x){return x !== c;})).slice(0,MAX_ROW); save(); }
  function rememberCustom(c){ c=norm(c); if(custom.indexOf(c)<0 && custom.length<MAX_ROW) custom.push(c); save(); }
  function zhEN(){ try { return !!(document.body && document.body.classList.contains('lang-en')) || !!(document.documentElement && /^en(?:-|$)/i.test(document.documentElement.lang||'')); } catch(_e) { return false; } }
  function T(zh,en){ return zhEN() ? en : zh; }
  function label(){ return T('設定字體顏色','Text color'); }
  function editor(){ return document.getElementById('editor'); }
  var saved = null, pop = null, colorInput = null, picker = null, observer = null, pendingCustom = false, renderSelected = false;

  function capture(){
    var src = document.getElementById('srcview');
    if (src && document.activeElement === src) return saved = {kind:'source',el:src,s:src.selectionStart||0,e:src.selectionEnd||0};
    var pe = document.getElementById('pe-text');
    if (pe && document.activeElement === pe) return saved = {kind:'textarea',el:pe,s:pe.selectionStart||0,e:pe.selectionEnd||0};
    var sel = window.getSelection && window.getSelection();
    if (sel && sel.rangeCount){ var r=sel.getRangeAt(0); if (editor() && editor().contains(r.commonAncestorContainer)) return saved={kind:'range',range:r.cloneRange()}; }
    return saved = null;
  }
  function restore(){
    if (!saved) return;
    try {
      if ((saved.kind==='source'||saved.kind==='textarea') && saved.el && saved.el.isConnected){ saved.el.focus(); saved.el.setSelectionRange(saved.s,saved.e); return; }
      if (saved.kind==='range' && saved.range){ var s=window.getSelection(); s.removeAllRanges(); s.addRange(saved.range); }
    } catch(_e) {}
  }
  function colorSelectionSafe(raw,s,e){
    /* The canonical adapter protects block-level code/math/table. Inline
       atoms need their own guard: adding HTML inside TeX, code, citations,
       image syntax, an entity, or a wrapper delimiter corrupts source. */
    if(typeof window.inlineFormatRanges!=='function') return false;
    var parsed=window.inlineFormatRanges(raw), ranges=parsed.ranges||[], mask=parsed.protectedMask, syntax=parsed.syntax;
    /* A complete math token may be wrapped: the HTML span then encloses the
       rendered KaTeX node, so the equation inherits the selected colour.
       Editing a slice of TeX would corrupt its delimiters, therefore only
       allow protected positions that belong to a fully covered $…$, $$…$$,
       or \\(…\\) token. Other protected atoms (code, images, comments,
       citations) remain fail-closed. */
    var math=[];
    var mathRes=[/\$\$(?=\S)([\s\S]+?)(?<=\S)\$\$/g,/\$(?=\S)([^$\n]+?)(?<=\S)\$/g,/\\\((.+?)\\\)/g], mm;
    for(var mi=0;mi<mathRes.length;mi++){
      var mr=mathRes[mi]; mr.lastIndex=0;
      while((mm=mr.exec(raw))){
        var ma=mm.index, mb=ma+mm[0].length, ok=true;
        for(var mk=ma;mk<mb;mk++) if(!mask||!mask[mk]){ok=false;break;}
        if(ok) math.push({s:ma,e:mb});
      }
    }
    function inWholeMath(p){
      for(var q=0;q<math.length;q++) if(math[q].s<=p&&p<math[q].e) return s<=math[q].s&&e>=math[q].e;
      return false;
    }
    for(var i=s;i<e;i++) if(mask&&mask[i]&&!inWholeMath(i)) return false;
    function splitsSyntax(p){return p>0&&p<raw.length&&syntax&&syntax[p-1]&&syntax[p];}
    if(splitsSyntax(s)||splitsSyntax(e)) return false;
    for(var j=0;j<ranges.length;j++){
      var r=ranges[j], hit=s<r.end&&r.start<e;
      if(!hit) continue;
      if(r.protected||r.kind==='code') return false;
      if(r.html&&r.tag==='span'&&/\bstyle\s*=\s*[\"'][^\"']*\bcolor\s*:/i.test(String(r.openText||''))) continue;
      /* Unprotected Markdown/HTML wrapper delimiters are serializer
         boundaries. A visible range may cross them; only a boundary that
         lands inside the syntax bytes themselves was rejected above. */
    }
    return true;
  }
  /* CP174.5: colour is an interval overlay, not a blind HTML wrapper.  Flatten
     every existing colour span, preserve each unselected prefix/suffix colour,
     then paint the selected visible interval as one canonical span. */
  function colorValue(open){ var m=String(open||'').match(/\bcolor\s*:\s*(#[0-9a-f]{3,8})/i); return m?norm(m[1]):null; }
  function colorOverlayTransform(raw,s,e,c,parsed,scoped){
    /* Rebuild only the selection and the complete wrappers it touches. This
       is the same bounded transaction model used by bold/italic: untouched
       markup elsewhere in the paragraph remains byte-for-byte unchanged. */
    if(!scoped){
      var scopeS=s, scopeE=e, more=true;
      while(more){
        more=false;
        (parsed&&parsed.ranges||[]).forEach(function(r){
          if(r.protected || !(scopeS<r.end&&r.start<scopeE)) return;
          var a=Math.min(scopeS,r.start), b=Math.max(scopeE,r.end);
          if(a!==scopeS||b!==scopeE){scopeS=a;scopeE=b;more=true;}
        });
      }
      var local=raw.slice(scopeS,scopeE), lp=window.inlineFormatRanges(local);
      var result=colorOverlayTransform(local,s-scopeS,e-scopeS,c,lp,true);
      if(!result) return null;
      var full=raw.slice(0,scopeS)+result.text+raw.slice(scopeE);
      return {text:full,start:scopeS+result.start,end:scopeS+result.end,changed:full!==raw,mode:'overlay',scopeStart:scopeS,scopeEnd:scopeE};
    }
    var ranges=(parsed&&parsed.ranges||[]).filter(function(r){ return r.html&&r.tag==='span'&&colorValue(r.openText); });
    var n=raw.length, removed=new Uint8Array(n), starts=[];
    ranges.forEach(function(r){ [[r.openStart,r.openEnd],[r.closeStart,r.closeEnd]].forEach(function(q){ for(var i=Math.max(0,q[0]);i<Math.min(n,q[1]);i++)removed[i]=1; }); });
    var clean='', orig=[] , map=new Int32Array(n+1), j=0;
    for(var i=0;i<n;i++){ map[i]=j; if(!removed[i]){ orig.push(i); clean+=raw[i]; j++; } }
    map[n]=j;
    var colors=new Array(clean.length), sorted=ranges.slice().sort(function(a,b){return (a.end-a.start)-(b.end-b.start);});
    sorted.forEach(function(r){ var col=colorValue(r.openText); if(!col)return; for(var q=Math.max(0,r.start);q<Math.min(n,r.end);q++){ if(removed[q])continue; var k=map[q]; if(colors[k]==null)colors[k]=col; } });
    var cs=map[Math.max(0,Math.min(n,s))], ce=map[Math.max(0,Math.min(n,e))];
    if(ce<=cs)return null;
    var desired=[]; for(var dk=0;dk<colors.length;dk++) desired[dk]=(orig[dk]>=s&&orig[dk]<e)?c:colors[dk];
    /* Markdown emphasis markers are syntax boundaries too.  A colour span
       must never cross `**`, `*`, `__`, etc.; doing so would make the marker
       part of the HTML and the renderer would expose raw Markdown or expand
       the colour to the whole bold run.  Treat every parsed non-HTML wrapper
       delimiter exactly like an HTML tag while serializing. */
    var structural=[];
    (parsed&&parsed.ranges||[]).forEach(function(r){
      if(r.html || r.protected || r.openStart==null || r.openEnd==null || r.closeStart==null || r.closeEnd==null) return;
      structural.push([r.openStart,r.openEnd],[r.closeStart,r.closeEnd]);
    });
    structural.sort(function(a,b){return a[0]-b[0]||a[1]-b[1];});
    var intervals=[], tokenRe=/<(?:[A-Za-z][^<>]*|\/[A-Za-z][^<>]*|!--[\s\S]*?--)>/g, m;
    while((m=tokenRe.exec(clean))) intervals.push([m.index,m.index+m[0].length]);
    structural.forEach(function(q){
      var a=map[Math.max(0,Math.min(n,q[0]))], b=map[Math.max(0,Math.min(n,q[1]))];
      if(b>a) intervals.push([a,b]);
    });
    intervals.sort(function(a,b){return a[0]-b[0]||a[1]-b[1];});
    var tokens=[], at=0;
    intervals.forEach(function(q){
      var a=Math.max(at,q[0]), b=Math.max(a,q[1]);
      if(a>at) for(var x=at;x<a;x++) tokens.push({a:x,b:x+1,tag:false});
      if(b>a) tokens.push({a:a,b:b,tag:true});
      at=Math.max(at,b);
    });
    for(;at<clean.length;at++) tokens.push({a:at,b:at+1,tag:false});
    var out='',active=null,boundary=new Array(clean.length+1), charOut=new Array(clean.length);
    function setBoundary(p){ if(boundary[p]==null)boundary[p]=out.length; }
    function setColor(next){ next=next||null; if(next===active)return; if(active)out+='</span>'; if(next)out+='<span style="color:'+next+'">'; active=next; }
    tokens.forEach(function(t){
      var next=null; for(var q=t.a;q<t.b;q++){ if(desired[q]!=null){next=desired[q];break;} }
      if(t.tag){
        /* A source delimiter never belongs to a colour run.  Close before it
           and let the next visible character reopen its own colour. Looking
           ahead to any later coloured character would incorrectly colour the
           unselected prefix (and used to emit empty spans there). */
        setColor(null);
        for(var q=t.a;q<t.b;q++){setBoundary(q);out+=clean[q];boundary[q+1]=out.length;}
        return;
      }
      for(var q=t.a;q<t.b;q++){
        /* CP174.6: a visible selection boundary must sit inside the span.
           The old unconditional assignment after setColor() overwrote the
           end boundary when the following character closed `</span>`, so a
           selection of coloured text included the closing tag.  The next
           colour operation then saw a partial HTML delimiter, rejected or
           rewrote the block prefix (lists/quotes were the visible symptom).
           Keep the boundary before a closing transition; move it after an
           opening transition so both ends address visible text exactly. */
        /* `undefined` means the same uncoloured state as null.  Normalize it
           here so the closing-transition guard below also applies to the
           first uncoloured character after a coloured run. */
        var before=active, next=desired[q] || null;
        setColor(next);
        if(!(next===null && before!==null && boundary[q]!=null)) boundary[q]=out.length;
        charOut[q]=out.length; out+=clean[q]; boundary[q+1]=out.length;
      }
    });
    setColor(null); setBoundary(clean.length);
    var start=boundary[cs], end=boundary[ce];
    if(start==null)start=out.length; if(end==null)end=start;
    return {text:out,start:start,end:end,changed:out!==raw,mode:'overlay'};
  }
  function colorTransform(raw,s,e){
    raw=String(raw==null?'':raw); s=Math.max(0,Math.min(raw.length,s|0)); e=Math.max(s,Math.min(raw.length,e|0));
    if (s===e && typeof window.wordRangeAt==='function'){ var w=window.wordRangeAt(raw,s); if(w){s=w.s;e=w.e;} }
    if (e<=s) return {text:raw,start:s,end:e,changed:false};
    var c=norm(current);
    /* CP174.3: list markers are renderer-only glyphs. A Chromium selection
       beginning on the bullet/number boundary can occasionally project to
       raw offset 0; never let a colour span wrap `- `, `* `, `+ `, or `1. `.
       Clamp the operation to the structured content start so the canonical
       Markdown marker survives subsequent host commits. */
    try {
      if (typeof window.inlineBodyBounds === 'function') {
        var body = window.inlineBodyBounds(raw);
        if (body && Number.isFinite(body.s) && body.s > 0) {
          /* Protect every renderer-only block prefix, including `>` quote
             markers, headings, task/list markers and no-indent comments. */
          var markerEnd = body.s;
          /* Quote no-indent stores its hidden comment after the `> ` prefix
             (`> <!-- noindent -->text`), while inlineBodyBounds historically
             stopped at the quote marker. Treat that comment as structure too,
             otherwise a renderer boundary at raw offset 0 would be clamped
             into the protected comment and the visible text would not color. */
          var hidden = raw.slice(markerEnd).match(/^<!--\s*noindent\s*-->[ \t]*/i);
          if (hidden) markerEnd += hidden[0].length;
          if (e <= markerEnd) return {text:raw,start:s,end:e,changed:false};
          if (s < markerEnd) s = markerEnd;
        }
      }
    } catch(_e) {}
    /* CP174.5: flatten and overlay existing colour intervals. This handles
       nested spans and selections that cross a colour boundary while keeping
       unselected coloured text intact. */
    try {
      var parsed = typeof window.inlineFormatRanges==='function' ? window.inlineFormatRanges(raw) : null;
      if (!colorSelectionSafe(raw,s,e)) return {text:raw,start:s,end:e,changed:false,unsafe:true};
      var over = colorOverlayTransform(raw,s,e,c,parsed);
      if (over) return over;
    } catch(_e) {}
    if (!colorSelectionSafe(raw,s,e)) return {text:raw,start:s,end:e,changed:false,unsafe:true};
    var inner=raw.slice(s,e), open='<span style="color:'+c+'">', close='</span>';
    return {text:raw.slice(0,s)+open+inner+close+raw.slice(e),start:s+open.length,end:s+open.length+inner.length,changed:true,mode:'apply'};
  }
  function colorModeAllowed(){
    /* HTML colour belongs to the ordinary Markdown editor.  TW_THESIS and other
       paper sub-modes keep their own syntax and must never receive a span. */
    try { var K=window.__CP171__; if(K && typeof K.currentMode==='function') return K.currentMode()==='markdown'; } catch(_e) {}
    return true;
  }
  function apply(c,opts){
    if(!valid(c) || !colorModeAllowed()) return;
    current=norm(c); remember(current); if(opts&&opts.custom) rememberCustom(current); close(); restore();
    try {
      if (typeof window.runInlineTransform==='function') window.runInlineTransform(colorTransform,{kind:'color'});
    } catch(_e) {}
    updateMain();
  }
  function esc(s){ return String(s).replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function hexToRgb(hex){ hex=norm(hex); return {r:parseInt(hex.slice(1,3),16),g:parseInt(hex.slice(3,5),16),b:parseInt(hex.slice(5,7),16)}; }
  function rgbToHex(r,g,b){ return '#'+[r,g,b].map(function(v){v=Math.max(0,Math.min(255,Math.round(v)));return v.toString(16).padStart(2,'0');}).join('').toUpperCase(); }
  function hsvToHex(h,s,v){ var i=Math.floor(h*6),f=h*6-i,p=v*(1-s),q=v*(1-f*s),t=v*(1-(1-f)*s),r,g,b; switch(i%6){case 0:r=v;g=t;b=p;break;case 1:r=q;g=v;b=p;break;case 2:r=p;g=v;b=t;break;case 3:r=p;g=q;b=v;break;case 4:r=t;g=p;b=v;break;default:r=v;g=p;b=q;} return rgbToHex(r*255,g*255,b*255); }
  function rgbToHsv(hex){ var c=hexToRgb(hex),r=c.r/255,g=c.g/255,b=c.b/255,max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,h=0,s=max?d/max:0,v=max; if(d){if(max===r)h=((g-b)/d+(g<b?6:0))/6;else if(max===g)h=((b-r)/d+2)/6;else h=((r-g)/d+4)/6;} return {h:h,s:s,v:v}; }
  function openNative(anchor, customMode){
    if(!pop) return; pendingCustom=!!customMode;
    if(picker&&picker.parentNode) picker.parentNode.removeChild(picker);
    picker=document.createElement('div'); picker.id='cp173-inline-picker'; picker.setAttribute('role','dialog');
    var title=document.createElement('div'); title.className='cp173-picker-title'; title.textContent=T('選擇顏色','Choose color'); picker.appendChild(title);
    var area=document.createElement('div'); area.className='cp173-picker-area'; var cursor=document.createElement('i'); cursor.className='cp173-picker-cursor'; area.appendChild(cursor); picker.appendChild(area);
    var hue=document.createElement('input'); hue.type='range'; hue.min='0'; hue.max='360'; hue.value=String(Math.round(rgbToHsv(current).h*360)); hue.className='cp173-picker-hue'; picker.appendChild(hue);
    var row=document.createElement('div'); row.className='cp173-picker-row'; var preview=document.createElement('span'); preview.className='cp173-picker-preview'; row.appendChild(preview);
    var hex=document.createElement('input'); hex.type='text'; hex.className='cp173-picker-hex'; hex.value=norm(current); hex.setAttribute('aria-label','HEX'); row.appendChild(hex); picker.appendChild(row);
    var rgbRow=document.createElement('div'); rgbRow.className='cp173-picker-rgb'; var rgbInputs={}; ['R','G','B'].forEach(function(k){var cell=document.createElement('label'); cell.textContent=k; var inp=document.createElement('input'); inp.type='number'; inp.min='0'; inp.max='255'; inp.className='cp173-picker-rgb-input'; inp.setAttribute('aria-label',k); rgbInputs[k]=inp; cell.appendChild(inp); rgbRow.appendChild(cell);}); picker.appendChild(rgbRow);
    var actions=document.createElement('div'); actions.className='cp173-picker-actions'; var cancel=document.createElement('button'); cancel.type='button'; cancel.textContent=T('取消','Cancel'); var ok=document.createElement('button'); ok.type='button'; ok.textContent=T('好','OK'); actions.appendChild(cancel); actions.appendChild(ok); picker.appendChild(actions);
    var hsv=rgbToHsv(current), selected=norm(current);
    function paint(){ area.style.background='linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl('+Math.round(hsv.h*360)+' 100% 50%))'; hue.style.setProperty('--cp173-hue',hsvToHex(hsv.h,1,1)); cursor.style.left=(hsv.s*100)+'%'; cursor.style.top=((1-hsv.v)*100)+'%'; preview.style.background=selected; hex.value=selected; var rgb=hexToRgb(selected); rgbInputs.R.value=rgb.r; rgbInputs.G.value=rgb.g; rgbInputs.B.value=rgb.b; }
    function setPoint(e){ var r=area.getBoundingClientRect(); hsv.s=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)); hsv.v=Math.max(0,Math.min(1,1-(e.clientY-r.top)/r.height)); selected=hsvToHex(hsv.h,hsv.s,hsv.v); paint(); }
    area.addEventListener('mousedown',function(e){setPoint(e);}); area.addEventListener('mousemove',function(e){if(e.buttons)setPoint(e);});
    hue.addEventListener('input',function(){hsv.h=Math.max(0,Math.min(1,Number(hue.value)/360));selected=hsvToHex(hsv.h,hsv.s,hsv.v);paint();});
    hex.addEventListener('change',function(){if(valid(hex.value)){selected=norm(hex.value);hsv=rgbToHsv(selected);hue.value=String(Math.round(hsv.h*360));paint();}else hex.value=selected;});
    Object.keys(rgbInputs).forEach(function(k){rgbInputs[k].addEventListener('change',function(){var r=Number(rgbInputs.R.value)||0,g=Number(rgbInputs.G.value)||0,b=Number(rgbInputs.B.value)||0;selected=rgbToHex(r,g,b);hsv=rgbToHsv(selected);hue.value=String(Math.round(hsv.h*360));paint();});});
    cancel.addEventListener('click',function(){if(picker&&picker.parentNode)picker.parentNode.removeChild(picker);picker=null;pendingCustom=false;});
    ok.addEventListener('click',function(){var c=norm(selected);if(picker&&picker.parentNode)picker.parentNode.removeChild(picker);picker=null;current=c;apply(c,{custom:pendingCustom});pendingCustom=false;});
    document.body.appendChild(picker); paint();
    var ar=anchor.getBoundingClientRect(), iw=innerWidth||800, ih=innerHeight||600, pw=picker.offsetWidth||260, ph=picker.offsetHeight||270;
    var left=Math.round(ar.left-pw-8); if(left<8) left=Math.min(iw-pw-8,Math.round(ar.right+8)); var top=Math.round(ar.top); if(top+ph>ih-8) top=Math.max(8,ih-ph-8); picker.style.left=Math.max(8,left)+'px'; picker.style.top=Math.max(8,top)+'px';
  }
  function swatch(c, removable, isCustom){
    c=norm(c); var d=document.createElement('div'); d.className='cp173-color-swatch'+(removable?' is-recent':'')+(isCustom?' is-custom':''); d.dataset.color=c; d.dataset.current=(!renderSelected && c===current)?'1':'0'; if(c===current) renderSelected=true; d.title=c;
    var b=document.createElement('button'); b.type='button'; b.className='cp173-color-pick'; b.dataset.color=c; b.setAttribute('aria-label',c); b.style.setProperty('--cp173-swatch',c); b.innerHTML='<span class="cp173-color-check">✓</span>';
    b.addEventListener('mousedown',function(e){e.preventDefault();e.stopPropagation();apply(c);}); d.appendChild(b);
    var t=document.createElement('span'); t.className='cp173-color-hex'; t.textContent=c; d.appendChild(t);
    if(removable){ var rm=document.createElement('button'); rm.type='button'; rm.className='cp173-color-remove'; rm.title='Remove '+c; rm.setAttribute('aria-label','Remove '+c); rm.textContent='×'; rm.addEventListener('mousedown',function(e){e.preventDefault();e.stopPropagation();if(isCustom) custom=custom.filter(function(x){return x!==c;}); else history=history.filter(function(x){return x!==c;});save();renderPop();}); d.appendChild(rm); }
    return d;
  }
  function renderPop(){
    if(!pop) return; renderSelected=false; pop.textContent='';
    var title=document.createElement('div'); title.className='cp173-color-title'; title.textContent=label(); pop.appendChild(title);
    var themeLabel=document.createElement('div'); themeLabel.className='cp173-color-section'; themeLabel.textContent=T('佈景主題色彩','Theme colors'); pop.appendChild(themeLabel);
    var grid=document.createElement('div'); grid.className='cp173-color-grid'; THEME.forEach(function(c){grid.appendChild(swatch(c,false));}); pop.appendChild(grid);
    var standardLabel=document.createElement('div'); standardLabel.className='cp173-color-section'; standardLabel.textContent=T('標準色彩','Standard colors'); pop.appendChild(standardLabel);
    var standardGrid=document.createElement('div'); standardGrid.className='cp173-color-grid'; STANDARD.forEach(function(c){standardGrid.appendChild(swatch(c,false));}); pop.appendChild(standardGrid);
    if(history.length){ var h=document.createElement('div'); h.className='cp173-color-section'; h.textContent=T('最近使用','Recent'); pop.appendChild(h); var rec=document.createElement('div'); rec.className='cp173-color-grid cp173-color-recent'; history.slice(0,MAX_ROW).forEach(function(c){rec.appendChild(swatch(c,true,false));}); pop.appendChild(rec); }
    var customLabel=document.createElement('div'); customLabel.className='cp173-color-section'; customLabel.textContent=T('自訂顏色','Custom colors'); pop.appendChild(customLabel);
    var customGrid=document.createElement('div'); customGrid.className='cp173-color-grid cp173-color-custom'; custom.forEach(function(c){customGrid.appendChild(swatch(c,true,true));});
    if(custom.length<MAX_ROW){
      var plus=document.createElement('div'); plus.className='cp173-color-swatch cp173-color-plus';
      var pb=document.createElement('button'); pb.type='button'; pb.className='cp173-color-pick'; pb.setAttribute('aria-label',T('新增自訂顏色','Add custom color')); pb.innerHTML='<span aria-hidden="true">+</span>';
      pb.addEventListener('mousedown',function(e){e.preventDefault();e.stopPropagation();capture();openNative(plus,true);}); plus.appendChild(pb); customGrid.appendChild(plus);
    }
    pop.appendChild(customGrid);
    var more=document.createElement('button'); more.type='button'; more.className='cp173-color-more'; more.innerHTML='<span aria-hidden="true">◉</span> '+T('更多顏色…','More colors…');
    more.addEventListener('mousedown',function(e){ e.preventDefault(); e.stopPropagation(); capture(); openNative(more,true); }); pop.appendChild(more);
  }
  function place(anchor){
    if(!pop) return; pop.classList.add('cp173-color-open'); var r=anchor.getBoundingClientRect(), p=pop.getBoundingClientRect();
    var left=Math.round(r.left), top=Math.round(r.bottom+6); if(left+p.width>innerWidth-8)left=innerWidth-8-p.width; if(left<8)left=8; if(top+p.height>innerHeight-8)top=Math.max(8,Math.round(r.top-p.height-6)); pop.style.left=left+'px';pop.style.top=top+'px';
  }
  function close(){ if(pop){pop.classList.remove('cp173-color-open');pop.dataset.anchor='';} if(picker&&picker.parentNode){picker.parentNode.removeChild(picker);picker=null;pendingCustom=false;} }
  function open(anchor){ capture(); renderPop(); pop.dataset.anchor='1'; place(anchor); }
  function updateMain(){ var b=document.querySelector('#ty-toolbar .cp173-color-main'); if(!b)return; b.style.setProperty('--cp173-current',current); b.title=label()+' '+current; b.setAttribute('aria-label',label()+' '+current); }
  function makeControl(host){
    var row=host&&host.parentNode;
    if(!row || row.querySelector('.cp173-color-control')) return;
    var wrap=document.createElement('span'); wrap.className='cp173-color-control';
    var main=document.createElement('button'); main.type='button';main.className='tb-btn cp173-color-main';
    /* Omit data-action: tbLayout() only knows catalogue buttons. This keeps
       the split control together while trailing catalogue items overflow. */
    main.setAttribute('data-zh','字體顏色');main.setAttribute('data-en','Text color');main.innerHTML='<span class="cp173-color-glyph" aria-hidden="true">A</span><span class="cp173-color-line" aria-hidden="true"></span>'; main.addEventListener('mousedown',function(e){e.preventDefault();e.stopPropagation();capture();apply(current);});
    var arrow=document.createElement('button'); arrow.type='button';arrow.className='tb-btn cp173-color-arrow';arrow.setAttribute('aria-label',label());arrow.innerHTML='<span aria-hidden="true">▾</span>'; arrow.addEventListener('mousedown',function(e){e.preventDefault();e.stopPropagation(); if(pop&&pop.classList.contains('cp173-color-open')) close(); else open(arrow);});
    wrap.appendChild(main);wrap.appendChild(arrow);
    /* Place it immediately before Bold, matching the native common word processors
       order. The buttons above are excluded from tbLayout's catalogue query. */
    var bold=host.querySelector('.tb-btn[data-action="bold"]');
    if(bold) host.insertBefore(wrap,bold); else host.insertBefore(wrap,host.firstChild||null);
    updateMain();
  }
  function install(){
    var bar=document.getElementById('ty-toolbar'), host=bar&&bar.querySelector('.tb-items'); if(!host) return;
    makeControl(host);
    if(!pop){ pop=document.createElement('div');pop.id='cp173-color-pop';pop.setAttribute('role','menu');document.body.appendChild(pop); }
  }
  var css=document.createElement('style'); css.textContent=`
#ty-toolbar .cp173-color-control{display:inline-flex;align-items:stretch;flex:0 0 auto;margin-right:1px}
#ty-toolbar .cp173-color-control .tb-btn{height:28px;min-width:25px;padding:0 4px;border-radius:var(--mac-radius-control,7px)}
#ty-toolbar .cp173-color-main{position:relative;flex-direction:column;line-height:1!important;gap:0!important;border-radius:var(--mac-radius-control,7px) 0 0 var(--mac-radius-control,7px)!important}
.cp173-color-glyph{font-size:15px;font-weight:650;line-height:15px}
.cp173-color-line{display:block;width:18px;height:3px;border-radius:3px;background:var(--cp173-current,#EC0001);margin-top:2px}
.cp173-color-arrow{min-width:12px!important;width:12px!important;padding:0 1px!important;margin-left:-1px!important;border:0!important;border-radius:0 var(--mac-radius-control,7px) var(--mac-radius-control,7px) 0!important;font-size:8px}
#cp173-inline-picker{position:fixed;z-index:1001;width:252px;padding:12px;border:1px solid var(--border-strong);border-radius:var(--mac-radius-popover,10px);background:var(--bg-panel);box-shadow:var(--mac-shadow-popover);font:12px/1.2 var(--font-ui)}
.cp173-picker-title{font-weight:700;margin-bottom:8px}.cp173-picker-area{position:relative;height:145px;border-radius:6px;cursor:crosshair;background:#f00;box-shadow:inset 0 0 0 1px rgba(0,0,0,.18)}.cp173-picker-cursor{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px #000;pointer-events:none}.cp173-picker-hue{width:100%;height:18px;margin:10px 0;padding:0;border:0;background:transparent;appearance:none;-webkit-appearance:none;cursor:pointer}.cp173-picker-hue::-webkit-slider-runnable-track{height:10px;border-radius:999px;background:linear-gradient(to right,#ff0000 0%,#ffff00 16.666%,#00ff00 33.333%,#00ffff 50%,#0000ff 66.666%,#ff00ff 83.333%,#ff0000 100%);box-shadow:inset 0 0 0 1px rgba(0,0,0,.28)}.cp173-picker-hue::-webkit-slider-thumb{width:16px;height:16px;margin-top:-3px;border:2px solid #fff;border-radius:50%;background:var(--cp173-hue,#ff0000);box-shadow:0 0 0 1px rgba(0,0,0,.72),0 1px 3px rgba(0,0,0,.35);appearance:none;-webkit-appearance:none}.cp173-picker-hue::-moz-range-track{height:10px;border:0;border-radius:999px;background:linear-gradient(to right,#ff0000 0%,#ffff00 16.666%,#00ff00 33.333%,#00ffff 50%,#0000ff 66.666%,#ff00ff 83.333%,#ff0000 100%);box-shadow:inset 0 0 0 1px rgba(0,0,0,.28)}.cp173-picker-hue::-moz-range-progress{height:10px;border:0;border-radius:999px;background:transparent}.cp173-picker-hue::-moz-range-thumb{width:12px;height:12px;border:2px solid #fff;border-radius:50%;background:var(--cp173-hue,#ff0000);box-shadow:0 0 0 1px rgba(0,0,0,.72),0 1px 3px rgba(0,0,0,.35)}.cp173-picker-hue:focus-visible{outline:2px solid color-mix(in srgb,var(--accent) 70%,transparent);outline-offset:2px}.cp173-picker-row{display:flex;align-items:center;gap:8px}.cp173-picker-rgb{display:flex;gap:6px;margin-top:8px}.cp173-picker-rgb label{display:flex;flex:1;flex-direction:column;gap:3px;color:var(--text-muted);font-size:10px}.cp173-picker-rgb-input{width:100%;box-sizing:border-box;padding:4px;border:1px solid var(--border-strong);border-radius:4px;background:var(--bg-input,var(--bg-panel));color:var(--text-strong);font:11px var(--font-mono)}.cp173-picker-preview{width:34px;height:26px;border-radius:5px;border:1px solid var(--border-strong)}.cp173-picker-hex{flex:1;min-width:0;padding:5px 7px;border:1px solid var(--border-strong);border-radius:5px;background:var(--bg-input,var(--bg-panel));color:var(--text-strong);font-family:var(--font-mono)}.cp173-picker-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:11px}.cp173-picker-actions button{padding:5px 12px;border:1px solid var(--border-strong);border-radius:6px;background:var(--bg-hover);color:var(--text-strong);cursor:pointer}.cp173-picker-actions button:last-child{background:var(--accent);color:#fff;border-color:var(--accent)}
#cp173-color-input{position:fixed;left:8px;top:8px;width:18px;height:18px;opacity:.01;pointer-events:none;border:0;padding:0;z-index:2147483647}
#cp173-color-pop{position:fixed;z-index:999;display:none;min-width:254px;max-width:min(310px,calc(100vw - 16px));max-height:calc(100vh - 16px);overflow:auto;padding:10px;background:var(--bg-panel);color:var(--text-strong);border:1px solid var(--border-strong);border-radius:var(--mac-radius-popover,10px);box-shadow:var(--mac-shadow-popover);font:12px/1.2 var(--font-ui);}
#cp173-color-pop.cp173-color-open{display:block;animation:cp173-color-pop-in .14s ease-out both}
@keyframes cp173-color-pop-in{from{opacity:0;transform:translateY(-3px) scale(.98)}to{opacity:1;transform:none}}
.cp173-color-title{padding:1px 2px 8px;font-weight:700;color:var(--text-strong)}
.cp173-color-section{margin:10px 2px 6px;font-size:10px;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:.06em}
.cp173-color-grid{display:grid;grid-template-columns:repeat(10,22px);gap:7px 3px}
.cp173-color-swatch{position:relative;width:22px;min-height:30px;display:flex;flex-direction:column;align-items:center}
.cp173-color-recent,.cp173-color-custom{grid-template-rows:34px;grid-auto-rows:34px;overflow:hidden}
.cp173-color-pick{width:20px;height:20px;padding:0;border:1px solid color-mix(in srgb,var(--text-strong) 30%,transparent);border-radius:3px;background:var(--cp173-swatch);cursor:pointer;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);}
.cp173-color-hex{font:8px/1 var(--font-mono);margin-top:3px;color:var(--text-muted);white-space:nowrap;transform:scale(.82);transform-origin:top center}
.cp173-color-check{display:none;color:var(--accent);font-size:11px;text-shadow:0 0 2px #fff}
.cp173-color-swatch[data-current="1"] .cp173-color-check{display:inline}
.cp173-color-plus .cp173-color-pick{background:transparent;border:1px dashed var(--border-strong);color:var(--text-muted);font-size:16px;line-height:18px}
.cp173-color-plus .cp173-color-pick:hover{color:var(--accent)}
.cp173-color-remove{position:absolute;display:none;right:-4px;top:-6px;width:13px;height:13px;padding:0;border:0;border-radius:50%;background:var(--bg-panel);color:var(--text-muted);font:12px/12px var(--font-ui);cursor:pointer;box-shadow:0 0 0 1px var(--border-strong)}
.cp173-color-more{display:flex;align-items:center;gap:6px;width:100%;margin-top:11px;padding:7px 6px;border:0;border-top:1px solid var(--border);background:transparent;color:var(--text-strong);cursor:pointer;text-align:left;font:600 12px/1.2 var(--font-ui)}
@media(hover:hover) and (pointer:fine){
  .cp173-color-pick:hover{box-shadow:inset 0 0 0 2px var(--accent),0 0 0 1px var(--accent)}
  .cp173-color-swatch:hover .cp173-color-remove{display:block}
  .cp173-color-remove:hover{color:var(--status-error);background:var(--bg-hover)}
  .cp173-color-more:hover{background:var(--bg-hover)}
}
@media(hover:none){
  .cp173-color-remove{display:none!important}
}
@media(prefers-reduced-motion:reduce){
  #cp173-color-pop.cp173-color-open{animation:none}
}
@media print{#cp173-color-pop,#cp173-color-input,#cp173-inline-picker,.cp173-color-control{display:none!important}}
`; document.head.appendChild(css);
  function tick(){install();}
  observer=new MutationObserver(tick); var bar=document.getElementById('ty-toolbar'); if(bar) observer.observe(bar,{childList:true,subtree:true}); tick();
  document.addEventListener('mousedown',function(e){if(picker&&picker.contains(e.target))return;if(pop&&pop.classList.contains('cp173-color-open')&&!pop.contains(e.target)&&!e.target.closest('.cp173-color-control'))close();});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'){if(picker&&picker.parentNode)picker.parentNode.removeChild(picker);picker=null;pendingCustom=false;close();}});
  window.addEventListener('resize',function(){close();if(picker&&picker.parentNode){picker.parentNode.removeChild(picker);picker=null;}}); window.addEventListener('scroll',function(){close();if(picker&&picker.parentNode){picker.parentNode.removeChild(picker);picker=null;}},true);
  /* Expose a read-only snapshot getter so diagnostics see newly remembered colours. */
  window.__CP173_COLOR_TOOLBAR__=Object.freeze({version:'1',defaults:DEFAULT.slice(),get history(){return history.slice();},get custom(){return custom.slice();},apply:apply,open:open,transform:colorTransform});
})();
