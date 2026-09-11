
(() => {
'use strict';
if (window.__CP170B_THEME_MODE__) return;
const VISUALS = Object.freeze(['github','night','sepia','blackout','blackoutgame']);
const MODES = Object.freeze(['markdown','paper','twthesis','twthesis-en','revtex']);
const coreMenuDefs = menuDefs;
const coreSetTheme = setTheme;
const coreApplyTheme = applyTheme;
const coreApplyThemeFromSettings = applyThemeFromSettings;
const DARK_VISUALS = new Set(['night','blackout','blackoutgame']);
const appliedPaletteProps = new Set();
let paletteCache = null;
function legacyVisual(){
  if (settings.theme==='blackout'||settings.theme==='blackoutgame'||settings.theme==='sepia') return settings.theme;
  if (settings.theme==='github') return settings.dark ? 'night' : 'github';
  return settings.dark ? 'night' : 'github';
}
function legacyMode(){
  if (settings.theme==='paper') return 'paper';
  if (settings.theme==='twthesis') return 'twthesis';
  if (settings.theme==='twthesis-en') return 'twthesis-en';
  if (settings.theme==='revtex') return 'revtex';
  return 'markdown';
}
function ensureState(){
  if (!VISUALS.includes(settings.cp170VisualTheme)) settings.cp170VisualTheme = legacyVisual();
  if (!MODES.includes(settings.cp170Mode)) settings.cp170Mode = legacyMode();
  return {visual:settings.cp170VisualTheme,mode:settings.cp170Mode};
}
function scanRules(rules, out){
  for (const rule of rules || []){
    if (rule.selectorText){
      const m = rule.selectorText.trim().match(/^html\[data-theme=["']([^"']+)["']\]$/);
      if (m && VISUALS.includes(m[1])){
        const props={};
        for (let i=0;i<rule.style.length;i++){ const n=rule.style[i]; if(n.startsWith('--')) props[n]=rule.style.getPropertyValue(n).trim(); }
        out[m[1]] = Object.assign(out[m[1]]||{},props);
      }
    }
    if (rule.cssRules) scanRules(rule.cssRules,out);
  }
}
function palettes(){
  if (paletteCache) return paletteCache;
  const out={};
  for (const sheet of [...document.styleSheets]){ try{ scanRules(sheet.cssRules,out); }catch(_){} }
  paletteCache=out; return out;
}
function clearPaletteOverlay(){
  for(const p of appliedPaletteProps) document.documentElement.style.removeProperty(p);
  appliedPaletteProps.clear();
  document.documentElement.style.removeProperty('color-scheme');
}
function applyPaletteOverlay(){
  const {visual,mode}=ensureState();
  clearPaletteOverlay();
  document.documentElement.dataset.cp170VisualTheme=visual;
  document.body.dataset.cp170Mode=mode;
  document.body.classList.toggle('cp170-thesis-mode',mode!=='markdown');
  if (mode==='markdown') return;
  const props=palettes()[visual]||palettes().github||{};
  for(const [p,v] of Object.entries(props)){ document.documentElement.style.setProperty(p,v); appliedPaletteProps.add(p); }
  document.documentElement.style.setProperty('color-scheme',DARK_VISUALS.has(visual)?'dark':'light');
}
function effectiveMarkdownTheme(v){ return v==='night'?'night':v; }
function setVisualTheme(v){
  if(!VISUALS.includes(v))v='github';
  ensureState();
  settings.cp170VisualTheme=v;
  settings.dark=DARK_VISUALS.has(v);
  if(settings.cp170Mode==='markdown') coreSetTheme(effectiveMarkdownTheme(v));
  else applyTheme();
  applyPaletteOverlay();
  try{persist();buildMenubar();}catch(_){}
  return v;
}
function setMode(mode){
  if(!MODES.includes(mode))mode='markdown';
  if(mode!=='revtex'&&window.__CP171__&&window.__CP171__.flags().splitOpen)window.__CP171__.setFlag('splitOpen',false);
  ensureState();
  settings.cp170Mode=mode;
  settings.dark=DARK_VISUALS.has(settings.cp170VisualTheme);
  if(mode==='markdown') coreSetTheme(effectiveMarkdownTheme(settings.cp170VisualTheme));
  else coreSetTheme(mode);
  applyPaletteOverlay();
  try{persist();buildMenubar();}catch(_){}
  return mode;
}
function modeChineseVariant(v){ if(settings.cp170Mode!=='twthesis') setMode('twthesis'); return setTwThesisChineseVariant(v); }
function modeEnglishVariant(v){ if(settings.cp170Mode!=='twthesis-en') setMode('twthesis-en'); return setTwThesisEnglishVariant(v); }
applyTheme = function(){ const r=coreApplyTheme(); applyPaletteOverlay(); return r; };
applyThemeFromSettings = function(){
  ensureState();
  settings.dark=DARK_VISUALS.has(settings.cp170VisualTheme);
  if(settings.cp170Mode==='markdown'){
    const v=settings.cp170VisualTheme; settings.theme=(v==='night'?'github':v);
  }else settings.theme=settings.cp170Mode;
  const r=coreApplyThemeFromSettings(); applyPaletteOverlay(); return r;
};
setTheme = function(name){
  if(VISUALS.includes(name)) return setVisualTheme(name);
  if(name==='twthesis2') return setMode('twthesis');
  if(['paper','twthesis','twthesis-en','revtex'].includes(name)) return setMode(name);
  return coreSetTheme(name);
};
toggleDark = function(){ ensureState(); return setVisualTheme(DARK_VISUALS.has(settings.cp170VisualTheme)?'github':'night'); };
function rebindSunMoon(){
  const old=document.getElementById('btn-theme');
  if(!old || old.dataset.cp170ThemeMode==='1') return old;
  const fresh=old.cloneNode(true);
  fresh.dataset.cp170ThemeMode='1';
  old.replaceWith(fresh);
  fresh.addEventListener('click',()=>toggleDark());
  return fresh;
}
function themeItems(){ const v=ensureState().visual; return [
  {t:'GitHub',cmd:()=>setVisualTheme('github'),check:v==='github'},
  {t:'Night',cmd:()=>setVisualTheme('night'),check:v==='night'},
  {t:TT('羊皮紙','Sepia'),cmd:()=>setVisualTheme('sepia'),check:v==='sepia'},
  {t:'Blackout',cmd:()=>setVisualTheme('blackout'),check:v==='blackout'},
  {t:'Blackout Game',cmd:()=>setVisualTheme('blackoutgame'),check:v==='blackoutgame'},
];}
function modeItems(){ const m=ensureState().mode; return [
  {t:TT('Markdown 模式','Markdown Mode'),cmd:()=>setMode('markdown'),check:m==='markdown'},
  {sep:true},
  {t:TT('臺灣論文（中文）','Taiwan Thesis (Chinese)'),cmd:()=>setMode('twthesis'),check:m==='twthesis'},
  {t:TT('　├ 電子版 1（精簡版面）','　├ Digital 1 (compact)'),cmd:()=>modeChineseVariant('compact'),check:m==='twthesis'&&!settings.twthesisPrint&&settings.twthesisDigitalStyle==='compact'},
  {t:TT('　├ 電子版 2（書冊版面）','　├ Digital 2 (book)'),cmd:()=>modeChineseVariant('book'),check:m==='twthesis'&&!settings.twthesisPrint&&settings.twthesisDigitalStyle!=='compact'},
  {t:TT('　└ 紙本版（雙面裝訂）','　└ Print (two-sided)'),cmd:()=>modeChineseVariant('print'),check:m==='twthesis'&&!!settings.twthesisPrint},
  {t:TT('臺灣論文（英文）','Taiwan Thesis (English)'),cmd:()=>setMode('twthesis-en'),check:m==='twthesis-en'},
  {t:TT('　├ 電子版（對稱版面）','　├ Digital (symmetric)'),cmd:()=>modeEnglishVariant(false),check:m==='twthesis-en'&&!settings.twthesisEnPrint},
  {t:TT('　└ 紙本版（雙面書冊）','　└ Print (two-sided book)'),cmd:()=>modeEnglishVariant(true),check:m==='twthesis-en'&&!!settings.twthesisEnPrint},
  {sep:true},
  {t:TT('國際期刊 REVTeX 4.2','International Journal REVTeX 4.2'),cmd:()=>{if(window.__CP171__)window.__CP171__.enterIntlMode();else setMode('revtex');},check:!!(window.__CP171__&&window.__CP171__.isIntlMode())},
];}
menuDefs=function(){
  const defs=coreMenuDefs();
  const idx=defs.findIndex(d=>d&&(d.label===TT('主題','Theme')||d.label==='主題'||d.label==='Theme'));
  if(idx<0)return defs;
  defs.splice(idx,1,{label:TT('主題','Theme'),items:themeItems()},{label:TT('模式','Mode'),items:modeItems()});
  return defs;
};
ensureState();
settings.dark=DARK_VISUALS.has(settings.cp170VisualTheme);
window.__CP170B_THEME_MODE__=Object.freeze({variant:'B',policy:'decoupled-theme-and-document-mode',setVisualTheme,setMode,state:()=>({visual:settings.cp170VisualTheme,mode:settings.cp170Mode,legacyTheme:settings.theme,dark:settings.dark,dataset:document.documentElement.dataset.theme,accent:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()})});
setTimeout(()=>{ try{rebindSunMoon();applyThemeFromSettings();buildMenubar();}catch(_){} },0);
})();
