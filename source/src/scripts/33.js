
/* cp173-91-color-toolbar.js — 字體顏色工具列（CP173；1.2.8 重做調色盤）
 * 以 HTML <span style="color:#RRGGBB"> 持久化，沿用既有 runInlineTransform
 * 的 selection／Undo／Source Mode adapter。模組只追加 DOM/CSS，不修改核心 toolbar。
 */
(function(){
  'use strict';
  if (window.__CP173_COLOR_TOOLBAR__) return;

  var KEY = 'ekdeta.colorHistory.v1', CUSTOM_KEY = 'ekdeta.customColors.v1', MAX_ROW = 10;
  /* 1.2.8（M35，Jason 11-08）：照 Word 的排法重做。第一列十個基本色，下面五列是同一色由淡到深，
     同一欄上下相連成一條色帶；色塊不再印色碼（色塊太窄，印了也看不到），名稱與色碼改放在滑過時的提示。
     基本色與介面同調、彩度較低；「標準色彩」維持鮮明，給校稿標記用。 */
  var BASE = [
    ['#000000','黑','Black'], ['#FFFFFF','白','White'], ['#5B6470','石墨灰','Graphite'], ['#4A6886','墨藍','Ink blue'],
    ['#3F7F86','青綠','Teal'], ['#5E8150','苔綠','Moss green'], ['#B08A2E','赭黃','Ochre'], ['#B8653A','陶橘','Terracotta'],
    ['#A8443C','磚紅','Brick red'], ['#7A5C8E','紫','Plum']
  ];
  var STANDARD_N = [
    ['#B80001','深紅','Dark red'], ['#EC0001','紅','Red'], ['#FFB802','橙','Orange'], ['#FFFF03','黃','Yellow'],
    ['#87CA47','淺綠','Light green'], ['#01A747','綠','Green'], ['#00A7EE','淺藍','Light blue'], ['#0065B8','藍','Blue'],
    ['#001E55','深藍','Dark blue'], ['#652B96','紫','Purple']
  ];
  /* 每欄五階：黑往淡、白往深，其餘「淡 80／60／40%、深 25／50%」，與 Word 的主題色同一套階距。 */
  var STEP_BLACK = [.5,.35,.25,.15,.05], STEP_WHITE = [.05,.15,.25,.35,.5];
  var STEP_HUE = [[255,.8],[255,.6],[255,.4],[0,.25],[0,.5]];
  function mixHex(hex,to,t){ var a=hexToRgb(hex); return rgbToHex(a.r+(to-a.r)*t, a.g+(to-a.g)*t, a.b+(to-a.b)*t); }
  var THEME_ROWS = [BASE.map(function(b){ return {c:b[0], n:[b[1],b[2]], v:null}; })];
  for (var si=0; si<5; si++) THEME_ROWS.push(BASE.map(function(b,ci){
    var to, t;
    if (ci===0) { to=255; t=STEP_BLACK[si]; } else if (ci===1) { to=0; t=STEP_WHITE[si]; } else { to=STEP_HUE[si][0]; t=STEP_HUE[si][1]; }
    return {c:mixHex(b[0],to,t), n:[b[1],b[2]], v:[to===255?'淡':'深', to===255?'Lighter':'Darker', Math.round(t*100)]};
  }));
  var THEME = [].concat.apply([], THEME_ROWS).map(function(x){ return x.c; });
  var STANDARD = STANDARD_N.map(function(x){ return x[0]; });
  var DEFAULT = THEME.concat(STANDARD);
  /* A red initial swatch avoids confusing the colour indicator with
     the neighbouring underline command. */
  var current = '#EC0001', history = [], clearing = false;
  try { var x = JSON.parse(localStorage.getItem(KEY) || '[]'); if (Array.isArray(x)) history = x.filter(valid).map(norm).slice(0,MAX_ROW); } catch(_e) {}
  /* 1.2.7 以前另有一列「自訂顏色」，與「最近使用」重疊；1.2.8 併進最近使用，舊資料搬過來後不再另存。 */
  try { var y = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); if (Array.isArray(y)) y.filter(valid).map(norm).forEach(function(c){ if (history.indexOf(c)<0 && history.length<MAX_ROW) history.push(c); }); } catch(_e) {}
  function valid(v){ return /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(v||'')); }
  function norm(v){
    v = String(v || '').trim(); if (v[0] !== '#') v = '#' + v;
    if (v.length === 4) v = '#' + v.slice(1).split('').map(function(c){return c+c;}).join('');
    return v.toUpperCase();
  }
  function save(){ try { localStorage.setItem(KEY, JSON.stringify(history)); localStorage.removeItem(CUSTOM_KEY); } catch(_e) {} }
  function remember(c){ c = norm(c); history = [c].concat(history.filter(function(x){return x !== c;})).slice(0,MAX_ROW); save(); }
  function zhEN(){ try { return !!(document.body && document.body.classList.contains('lang-en')) || !!(document.documentElement && /^en(?:-|$)/i.test(document.documentElement.lang||'')); } catch(_e) { return false; } }
  function T(zh,en){ return zhEN() ? en : zh; }
  function label(){ return T('字體顏色','Text color'); }
  function editor(){ return document.getElementById('editor'); }
  var saved = null, pop = null, observer = null, renderSelected = false;

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
    var mathRes=[/\$\$(?=\S)([\s\S]+?)(?<=\S)\$\$/g,/\$(?=\S)([^$\n]+?)(?<=\S)\$(?!\d)/g,/\\\((.+?)\\\)/g], mm;
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
    /* 1.2.8：「移除文字顏色」走同一條路，只是選取範圍內的目標顏色是「無」。 */
    var c=clearing ? null : norm(current);
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
    if (c===null) return {text:raw,start:s,end:e,changed:false};
    var inner=raw.slice(s,e), open='<span style="color:'+c+'">', close='</span>';
    return {text:raw.slice(0,s)+open+inner+close+raw.slice(e),start:s+open.length,end:s+open.length+inner.length,changed:true,mode:'apply'};
  }
  function colorModeAllowed(){
    /* HTML colour belongs to the ordinary Markdown editor.  TW_THESIS and other
       paper sub-modes keep their own syntax and must never receive a span. */
    try { var K=window.__CP171__; if(K && typeof K.currentMode==='function') return K.currentMode()==='markdown'; } catch(_e) {}
    return true;
  }

  function apply(c){
    if(!valid(c) || !colorModeAllowed()) return;
    current=norm(c); remember(current); close(); restore();
    try {
      if (typeof window.runInlineTransform==='function') window.runInlineTransform(colorTransform,{kind:'color'});
    } catch(_e) {}
    updateMain();
  }
  /* 1.2.8：把選取文字的顏色拿掉（恢復成內文顏色）。以前只能復原或手動刪 HTML。 */
  function clearColor(){
    if(!colorModeAllowed()) return;
    close(); restore(); clearing=true;
    try {
      if (typeof window.runInlineTransform==='function') window.runInlineTransform(colorTransform,{kind:'color'});
    } catch(_e) {} finally { clearing=false; }
  }
  function esc(s){ return String(s).replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function hexToRgb(hex){ hex=norm(hex); return {r:parseInt(hex.slice(1,3),16),g:parseInt(hex.slice(3,5),16),b:parseInt(hex.slice(5,7),16)}; }
  function rgbToHex(r,g,b){ return '#'+[r,g,b].map(function(v){v=Math.max(0,Math.min(255,Math.round(v)));return v.toString(16).padStart(2,'0');}).join('').toUpperCase(); }
  function hsvToHex(h,s,v){ var i=Math.floor(h*6),f=h*6-i,p=v*(1-s),q=v*(1-f*s),t=v*(1-(1-f)*s),r,g,b; switch(i%6){case 0:r=v;g=t;b=p;break;case 1:r=q;g=v;b=p;break;case 2:r=p;g=v;b=t;break;case 3:r=p;g=q;b=v;break;case 4:r=t;g=p;b=v;break;default:r=v;g=p;b=q;} return rgbToHex(r*255,g*255,b*255); }
  function rgbToHsv(hex){ var c=hexToRgb(hex),r=c.r/255,g=c.g/255,b=c.b/255,max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,h=0,s=max?d/max:0,v=max; if(d){if(max===r)h=((g-b)/d+(g<b?6:0))/6;else if(max===g)h=((b-r)/d+2)/6;else h=((r-g)/d+4)/6;} return {h:h,s:s,v:v}; }
  /* 滑鼠用 mousedown（不搶走編輯區的選取），鍵盤（Enter／空白鍵，detail 為 0）用 click。 */
  function onPress(el, fn){
    el.addEventListener('mousedown',function(e){ if(e.button!==0) return; e.preventDefault(); e.stopPropagation(); fn(); });
    el.addEventListener('click',function(e){ if(e.detail===0){ e.preventDefault(); fn(); } });
  }
  function swatch(c, name, variant){
    c=norm(c);
    var b=document.createElement('button'); b.type='button'; b.className='cp173-sw'; b.dataset.color=c;
    b.style.setProperty('--sw', c);
    var tip=(name ? T(name[0],name[1]) : '') + (variant ? T('，'+variant[0]+' '+variant[2]+'%', ', '+variant[1]+' '+variant[2]+'%') : '');
    tip=(tip ? tip+'　' : '')+c;
    b.title=tip; b.setAttribute('aria-label', tip);
    if(!renderSelected && c===current){ b.setAttribute('aria-current','true'); renderSelected=true; }
    onPress(b, function(){ apply(c); });
    return b;
  }
  function sec(text){ var h=document.createElement('div'); h.className='cp173-sec'; h.textContent=text; return h; }
  function row(list){ var r=document.createElement('div'); r.className='cp173-row'; list.forEach(function(x){ r.appendChild(swatch(x[0],x[1],x[2])); }); return r; }
  function menuItem(icon, text, fn){
    var b=document.createElement('button'); b.type='button'; b.className='cp173-mi';
    b.innerHTML='<span class="cp173-mi-ic '+icon+'" aria-hidden="true"></span><span>'+esc(text)+'</span>';
    onPress(b, fn); return b;
  }
  function renderPalette(){
    if(!pop) return; renderSelected=false; pop.textContent=''; pop.dataset.view='palette';
    pop.setAttribute('aria-label', label());
    pop.appendChild(sec(T('主題色彩','Theme colors')));
    pop.appendChild(row(THEME_ROWS[0].map(function(x){ return [x.c,x.n,null]; })));
    var shades=document.createElement('div'); shades.className='cp173-shades';
    for (var col=0; col<BASE.length; col++){
      var strip=document.createElement('div'); strip.className='cp173-strip';
      for (var r=1; r<THEME_ROWS.length; r++){ var x=THEME_ROWS[r][col]; strip.appendChild(swatch(x.c,x.n,x.v)); }
      shades.appendChild(strip);
    }
    pop.appendChild(shades);
    pop.appendChild(sec(T('標準色彩','Standard colors')));
    pop.appendChild(row(STANDARD_N.map(function(x){ return [x[0],[x[1],x[2]],null]; })));
    if(history.length){
      pop.appendChild(sec(T('最近使用','Recent colors')));
      pop.appendChild(row(history.slice(0,MAX_ROW).map(function(c){ return [c,null,null]; })));
    }
    var menu=document.createElement('div'); menu.className='cp173-menu';
    menu.appendChild(menuItem('cp173-ic-none', T('移除文字顏色','Remove text color'), clearColor));
    menu.appendChild(menuItem('cp173-ic-wheel', T('其他顏色…','More colors…'), renderPicker));
    pop.appendChild(menu);
  }
  /* 1.2.8：「其他顏色」改在同一個浮層裡切換，不再另開一個貼在旁邊的小視窗；取消回到色盤。 */
  function renderPicker(){
    if(!pop) return; pop.textContent=''; pop.dataset.view='picker';
    var hsv=rgbToHsv(current), selected=norm(current);
    var box=document.createElement('div'); box.className='cp173-pk'; pop.appendChild(box);
    var head=document.createElement('div'); head.className='cp173-pk-head'; head.textContent=T('其他顏色','More colors'); box.appendChild(head);
    var area=document.createElement('div'); area.className='cp173-pk-area'; area.setAttribute('aria-hidden','true');
    var cursor=document.createElement('i'); cursor.className='cp173-pk-cursor'; area.appendChild(cursor); box.appendChild(area);
    var hue=document.createElement('input'); hue.type='range'; hue.min='0'; hue.max='360'; hue.className='cp173-pk-hue'; hue.setAttribute('aria-label',T('色相','Hue')); box.appendChild(hue);
    var line=document.createElement('div'); line.className='cp173-pk-line';
    var preview=document.createElement('span'); preview.className='cp173-pk-preview'; line.appendChild(preview);
    var hex=document.createElement('input'); hex.type='text'; hex.className='cp173-pk-hex'; hex.spellcheck=false; hex.setAttribute('aria-label',T('色碼','Hex code')); line.appendChild(hex);
    box.appendChild(line);
    var rgbRow=document.createElement('div'); rgbRow.className='cp173-pk-rgb'; var rgb={};
    ['R','G','B'].forEach(function(k){ var cell=document.createElement('label'); var s=document.createElement('span'); s.textContent=k; cell.appendChild(s); var inp=document.createElement('input'); inp.type='number'; inp.min='0'; inp.max='255'; inp.setAttribute('aria-label',k); rgb[k]=inp; cell.appendChild(inp); rgbRow.appendChild(cell); });
    box.appendChild(rgbRow);
    var act=document.createElement('div'); act.className='cp173-pk-act';
    var cancel=document.createElement('button'); cancel.type='button'; cancel.className='cp173-btn'; cancel.textContent=T('取消','Cancel');
    var ok=document.createElement('button'); ok.type='button'; ok.className='cp173-btn primary'; ok.textContent=T('套用','Apply');
    act.appendChild(cancel); act.appendChild(ok); box.appendChild(act);
    function paint(){
      area.style.background='linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl('+Math.round(hsv.h*360)+' 100% 50%))';
      hue.value=String(Math.round(hsv.h*360)); hue.style.setProperty('--cp173-hue',hsvToHex(hsv.h,1,1));
      cursor.style.left=(hsv.s*100)+'%'; cursor.style.top=((1-hsv.v)*100)+'%';
      preview.style.background=selected; if(document.activeElement!==hex) hex.value=selected;
      var c=hexToRgb(selected); rgb.R.value=c.r; rgb.G.value=c.g; rgb.B.value=c.b;
    }
    function setPoint(e){ var r=area.getBoundingClientRect(); hsv.s=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)); hsv.v=Math.max(0,Math.min(1,1-(e.clientY-r.top)/r.height)); selected=hsvToHex(hsv.h,hsv.s,hsv.v); paint(); }
    area.addEventListener('pointerdown',function(e){ e.preventDefault(); try{area.setPointerCapture(e.pointerId);}catch(_e){} setPoint(e); });
    area.addEventListener('pointermove',function(e){ if(e.buttons) setPoint(e); });
    hue.addEventListener('input',function(){ hsv.h=Math.max(0,Math.min(1,Number(hue.value)/360)); selected=hsvToHex(hsv.h,hsv.s,hsv.v); paint(); });
    hex.addEventListener('input',function(){ if(valid(hex.value) && hex.value.replace('#','').length===6){ selected=norm(hex.value); hsv=rgbToHsv(selected); paint(); } });
    hex.addEventListener('change',function(){ if(valid(hex.value)){ selected=norm(hex.value); hsv=rgbToHsv(selected); } hex.value=selected; paint(); });
    Object.keys(rgb).forEach(function(k){ rgb[k].addEventListener('change',function(){ selected=rgbToHex(Number(rgb.R.value)||0,Number(rgb.G.value)||0,Number(rgb.B.value)||0); hsv=rgbToHsv(selected); paint(); }); });
    function commit(){ apply(selected); }
    [hex,rgb.R,rgb.G,rgb.B].forEach(function(inp){ inp.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); inp.dispatchEvent(new Event('change')); commit(); } }); });
    cancel.addEventListener('click',function(){ renderPalette(); });
    ok.addEventListener('click',commit);
    paint();
    hex.focus(); hex.select();
  }
  function place(anchor){
    if(!pop) return; pop.classList.add('cp173-color-open'); var r=anchor.getBoundingClientRect(), p=pop.getBoundingClientRect();
    var left=Math.round(r.left), top=Math.round(r.bottom+4); if(left+p.width>innerWidth-8)left=innerWidth-8-p.width; if(left<8)left=8; if(top+p.height>innerHeight-8)top=Math.max(8,Math.round(r.top-p.height-4)); pop.style.left=left+'px';pop.style.top=top+'px';
    pop.style.transformOrigin=(r.left+r.width/2-left)+'px '+(top>r.top?'0':'100%');
  }
  function close(){ if(pop){pop.classList.remove('cp173-color-open');pop.dataset.anchor='';pop.dataset.view='';} var a=document.querySelector('#ty-toolbar .cp173-color-arrow'); if(a) a.setAttribute('aria-expanded','false'); }
  function isOpen(){ return !!(pop&&pop.classList.contains('cp173-color-open')); }
  function open(anchor){ capture(); renderPalette(); pop.dataset.anchor='1'; place(anchor); if(anchor) anchor.setAttribute('aria-expanded','true'); }
  function updateMain(){ var b=document.querySelector('#ty-toolbar .cp173-color-main'); if(!b)return; b.style.setProperty('--cp173-current',current); b.title=label()+' '+current; b.setAttribute('aria-label',label()+' '+current); }
  function makeControl(host){
    var row=host&&host.parentNode;
    if(!row || row.querySelector('.cp173-color-control')) return;
    var wrap=document.createElement('span'); wrap.className='cp173-color-control';
    var main=document.createElement('button'); main.type='button';main.className='tb-btn cp173-color-main';
    /* Omit data-action: tbLayout() only knows catalogue buttons. This keeps
       the split control together while trailing catalogue items overflow. */
    main.setAttribute('data-zh','字體顏色');main.setAttribute('data-en','Text color');
    main.innerHTML=(typeof window.ekdIcon==='function'?window.ekdIcon('textColor'):'A');
    main.addEventListener('mousedown',function(e){e.preventDefault();e.stopPropagation();capture();apply(current);});
    var arrow=document.createElement('button'); arrow.type='button';arrow.className='tb-btn cp173-color-arrow';arrow.setAttribute('aria-label',T('選擇字體顏色','Choose text color'));arrow.setAttribute('aria-haspopup','true');arrow.setAttribute('aria-expanded','false');arrow.innerHTML='<span aria-hidden="true">▾</span>';
    arrow.addEventListener('mousedown',function(e){e.preventDefault();e.stopPropagation(); if(isOpen()) close(); else open(arrow);});
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
    if(!pop){ pop=document.createElement('div');pop.id='cp173-color-pop';pop.setAttribute('role','dialog');document.body.appendChild(pop); }
  }
  var css=document.createElement('style'); css.id='cp173-color-css'; css.textContent=`
#ty-toolbar .cp173-color-control{display:inline-flex;align-items:stretch;flex:0 0 auto;margin-right:1px}
#ty-toolbar .cp173-color-control .tb-btn{height:28px;padding:0}
#ty-toolbar .cp173-color-main{min-width:28px;width:28px;justify-content:center;border-radius:var(--r-sm) 0 0 var(--r-sm)!important}
#ty-toolbar .cp173-color-arrow{min-width:13px!important;width:13px!important;margin-left:0!important;border:0!important;border-radius:0 var(--r-sm) var(--r-sm) 0!important;color:var(--ui-text-muted);font-size:var(--fs-11)}
#cp173-color-pop{--cp173-hair:color-mix(in srgb,var(--ui-text-strong) 13%,transparent);position:fixed;z-index:999;display:none;box-sizing:border-box;width:260px;max-height:calc(100vh - 16px);overflow:auto;padding:var(--space-3);color:var(--ui-text-strong);font:var(--fs-13)/var(--lh-13) var(--font-ui)}
#cp173-color-pop.cp173-color-open{display:block}
#cp173-color-pop .cp173-sec{margin:var(--space-3) 0 var(--space-1h);font-size:var(--fs-12);line-height:var(--lh-12);color:var(--ui-text-muted)}
#cp173-color-pop .cp173-sec:first-child{margin-top:0}
#cp173-color-pop .cp173-row,#cp173-color-pop .cp173-shades{display:grid;grid-template-columns:repeat(10,20px);gap:4px}
#cp173-color-pop .cp173-shades{margin-top:var(--space-1h)}
#cp173-color-pop .cp173-strip{position:relative;display:flex;flex-direction:column}
#cp173-color-pop .cp173-strip::after{content:"";position:absolute;inset:0;z-index:1;border-radius:var(--r-xs);box-shadow:inset 0 0 0 1px var(--cp173-hair);pointer-events:none}
#cp173-color-pop .cp173-sw{position:relative;display:block;width:20px;height:20px;margin:0;padding:0;border:0;border-radius:var(--r-xs);background:var(--sw);box-shadow:inset 0 0 0 1px var(--cp173-hair);cursor:pointer}
#cp173-color-pop .cp173-strip .cp173-sw{height:16px;border-radius:0;box-shadow:none}
#cp173-color-pop .cp173-strip .cp173-sw:first-child{border-radius:var(--r-xs) var(--r-xs) 0 0}
#cp173-color-pop .cp173-strip .cp173-sw:last-child{border-radius:0 0 var(--r-xs) var(--r-xs)}
#cp173-color-pop .cp173-sw[aria-current="true"]{z-index:2;box-shadow:0 0 0 1px var(--ui-surface),0 0 0 2.5px var(--ui-accent)}
#cp173-color-pop .cp173-sw:focus-visible{z-index:3;outline:none;box-shadow:0 0 0 1px var(--ui-surface),0 0 0 2.5px var(--ui-text-strong)}
#cp173-color-pop .cp173-menu{margin:var(--space-3) calc(var(--space-2) * -1) 0;padding-top:var(--space-1h);border-top:.5px solid var(--ui-line)}
#cp173-color-pop .cp173-mi{display:flex;align-items:center;gap:var(--space-2);width:100%;min-height:var(--h-menu);padding:0 var(--space-2);border:0;border-radius:var(--r-sm);background:transparent;color:var(--ui-text-strong);font:var(--fs-13)/var(--lh-13) var(--font-ui);text-align:left;cursor:pointer}
#cp173-color-pop .cp173-mi:focus-visible{outline:none;box-shadow:var(--focus-ring)}
#cp173-color-pop .cp173-mi-ic{flex:none;width:14px;height:14px;border-radius:var(--r-xs)}
#cp173-color-pop .cp173-ic-none{box-shadow:inset 0 0 0 1px var(--ui-text-muted);background:linear-gradient(to top right,transparent calc(50% - .6px),var(--ui-text-muted) calc(50% - .6px),var(--ui-text-muted) calc(50% + .6px),transparent calc(50% + .6px))}
#cp173-color-pop .cp173-ic-wheel{border-radius:50%;background:conic-gradient(#c8695c,#c9a65a,#93b56a,#5aa9a0,#5d84c4,#9168c0,#c8695c);box-shadow:inset 0 0 0 1px var(--cp173-hair)}
#cp173-color-pop .cp173-pk-head{margin:0 0 var(--space-2);font-weight:var(--fw-medium)}
#cp173-color-pop .cp173-pk-area{position:relative;height:132px;border-radius:var(--r-sm);cursor:crosshair;touch-action:none;box-shadow:inset 0 0 0 1px var(--cp173-hair)}
#cp173-color-pop .cp173-pk-cursor{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border:2px solid #fff;border-radius:50%;box-sizing:border-box;box-shadow:0 0 0 1px rgba(0,0,0,.4),0 1px 2px rgba(0,0,0,.3);pointer-events:none}
#cp173-color-pop .cp173-pk-hue{display:block;width:100%;height:16px;margin:var(--space-2) 0;padding:0;border:0;background:transparent;-webkit-appearance:none;appearance:none;cursor:pointer}
#cp173-color-pop .cp173-pk-hue::-webkit-slider-runnable-track{height:8px;border-radius:var(--r-full);background:linear-gradient(to right,#f00 0%,#ff0 16.666%,#0f0 33.333%,#0ff 50%,#00f 66.666%,#f0f 83.333%,#f00 100%);box-shadow:inset 0 0 0 1px var(--cp173-hair)}
#cp173-color-pop .cp173-pk-hue::-webkit-slider-thumb{width:14px;height:14px;margin-top:-3px;border:2px solid #fff;border-radius:50%;box-sizing:border-box;background:var(--cp173-hue,#f00);box-shadow:0 0 0 1px rgba(0,0,0,.35),0 1px 2px rgba(0,0,0,.3);-webkit-appearance:none;appearance:none}
#cp173-color-pop .cp173-pk-hue::-moz-range-track{height:8px;border:0;border-radius:var(--r-full);background:linear-gradient(to right,#f00 0%,#ff0 16.666%,#0f0 33.333%,#0ff 50%,#00f 66.666%,#f0f 83.333%,#f00 100%)}
#cp173-color-pop .cp173-pk-hue::-moz-range-thumb{width:10px;height:10px;border:2px solid #fff;border-radius:50%;background:var(--cp173-hue,#f00);box-shadow:0 0 0 1px rgba(0,0,0,.35)}
#cp173-color-pop .cp173-pk-hue:focus-visible{outline:none}
#cp173-color-pop .cp173-pk-hue:focus-visible::-webkit-slider-thumb{box-shadow:var(--focus-ring)}
#cp173-color-pop .cp173-pk-line{display:flex;align-items:center;gap:var(--space-2)}
#cp173-color-pop .cp173-pk-preview{flex:none;width:26px;height:26px;border-radius:var(--r-xs);box-shadow:inset 0 0 0 1px var(--cp173-hair)}
#cp173-color-pop .cp173-pk input:not([type=range]){box-sizing:border-box;height:26px;min-width:0;margin:0;padding:0 var(--space-1h);border:1px solid var(--ui-line-strong);border-radius:var(--r-xs);background:var(--ui-surface);color:var(--ui-text-strong);font:var(--fs-12)/1 var(--font-mono)}
#cp173-color-pop .cp173-pk input:not([type=range]):focus{outline:none;border-color:var(--ui-accent);box-shadow:var(--focus-ring)}
#cp173-color-pop .cp173-pk-hex{flex:1}
#cp173-color-pop .cp173-pk-rgb{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--space-2);margin-top:var(--space-2)}
#cp173-color-pop .cp173-pk-rgb label{display:flex;align-items:center;gap:var(--space-1);font-size:var(--fs-12);color:var(--ui-text-muted)}
#cp173-color-pop .cp173-pk-rgb input{width:100%;-moz-appearance:textfield;appearance:textfield}
#cp173-color-pop .cp173-pk-rgb input::-webkit-inner-spin-button,#cp173-color-pop .cp173-pk-rgb input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
#cp173-color-pop .cp173-pk-act{display:flex;justify-content:flex-end;gap:var(--space-2);margin-top:var(--space-3)}
#cp173-color-pop .cp173-btn{height:26px;padding:0 var(--space-3);border:.5px solid var(--ui-line-strong);border-radius:var(--r-sm);background:var(--ui-surface);color:var(--ui-text-strong);font:var(--fs-12)/1 var(--font-ui);cursor:pointer}
#cp173-color-pop .cp173-btn.primary{border-color:transparent;background:var(--ui-accent);color:var(--ui-on-accent,#fff)}
#cp173-color-pop .cp173-btn:focus-visible{outline:none;box-shadow:var(--focus-ring)}
@media(hover:hover) and (pointer:fine){
  #cp173-color-pop .cp173-sw:hover{z-index:3;box-shadow:0 0 0 1px var(--ui-surface),0 0 0 2.5px var(--ui-text-muted)}
  #cp173-color-pop .cp173-mi:hover{background:var(--ui-hover)}
  #cp173-color-pop .cp173-btn:not(.primary):hover{background:var(--ui-hover)}
  #cp173-color-pop .cp173-btn.primary:hover{box-shadow:inset 0 0 0 99px var(--ui-on-accent-hover,rgba(255,255,255,.1))}
}
@media print{#cp173-color-pop,.cp173-color-control{display:none!important}}
`; document.head.appendChild(css);
  function tick(){install();}
  observer=new MutationObserver(tick); var bar=document.getElementById('ty-toolbar'); if(bar) observer.observe(bar,{childList:true,subtree:true}); tick();
  document.addEventListener('mousedown',function(e){if(isOpen()&&!pop.contains(e.target)&&!e.target.closest('.cp173-color-control'))close();});
  document.addEventListener('keydown',function(e){ if(e.key!=='Escape'||!isOpen()) return; e.stopPropagation(); if(pop.dataset.view==='picker') renderPalette(); else { close(); restore(); } },true);
  window.addEventListener('resize',function(){ if(isOpen()) close(); });
  window.addEventListener('scroll',function(e){ if(isOpen()&&!(pop.contains(e.target))) close(); },true);
  /* Expose a read-only snapshot getter so diagnostics see newly remembered colours. */
  window.__CP173_COLOR_TOOLBAR__=Object.freeze({version:'2',defaults:DEFAULT.slice(),get history(){return history.slice();},get custom(){return [];},apply:apply,clear:clearColor,open:open,transform:colorTransform});
})();
