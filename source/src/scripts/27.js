
/* ============================================================================
 * cp171-58b-mathlive-setup — MathLive 設定層
 *
 * 58a 是原封不動的第三方 bundle（mathlive 0.110.0，sha256 e99e6d2fa19137e9…）。
 * 這一支放我們自己的決定，理由都寫在旁邊，日後換版只要動 58a。
 *
 * 決定一：字型不另外收，共用 base.html 既有的 KaTeX 字型
 *   MathLive 排版用的就是 KaTeX 的 20 個字型面，而這份程式的 base.html
 *   早就把那 20 面全部以 base64 @font-face 內嵌了（AMS 1、Caligraphic 2、
 *   Fraktur 2、Main 4、Math 2、SansSerif 3、Script 1、Size1–4 各 1、
 *   Typewriter 1）。MathLive 只要在 :root 讀到 --ML__static-fonts 就會
 *   直接把字型狀態標成 ready、完全不去 fetch。
 *   → 省下 338 KB，而且離線一定拿得到字。
 *
 * 決定一之一（1.1.5.8.5 補）：mathlive-static.css 裡的 20 條 @font-face 要整批拿掉
 *   --ML__static-fonts 只擋得住 MathLive「自己主動」去抓字型；但
 *   mathlive-static.css 本身還是照樣帶著 20 條 @font-face，src 全部指向
 *   相對路徑 fonts/KaTeX_XXX.woff2（npm 套件預期字型檔跟 CSS 放在同一個
 *   fonts/ 目錄底下，這份單檔 HTML 沒有那個目錄）。CSS 的 @font-face
 *   規則不看 JS 旗標，瀏覽器只要排版用到某個字族，就會去比對「目前有效」
 *   的那條 @font-face——而同一個 family／weight／style 有兩條宣告時，
 *   後宣告的那條會整條蓋過先宣告的那條（不是先試 A 失敗再退回 B）。
 *   這一支的 <style> 是動態插進 <head> 尾端的，排在 base.html 原生那份
 *   後面，於是這 20 條會蓋掉 base.html 原本能用的 base64 版本，實測會
 *   打出 4 條連到 fonts/*.woff2 的失敗請求（其餘 16 條沒蓋到是因為那次
 *   測試沒剛好用到那些字族，不代表沒風險）。字型不用收＝這 20 條本來就
 *   是純重複，直接整批砍掉，不是留著當備援。
 *
 * 決定二：音效關掉
 *   MathLive 預設按鍵會抓 sounds/*.wav。單檔 HTML 沒有那個目錄，
 *   抓不到只會在 console 噴一串錯。soundsDirectory = null 就完全不抓。
 *
 * 決定三：不搶任何全域名稱
 *   58a 自己會註冊 <math-field> 並設 globalThis.MathfieldElement，
 *   這是它的既定行為。這一支只補設定，不改寫、不 monkey-patch。
 *
 * 邊界：只寫 <style id="cp171-mathlive-css"> 這一個節點與 MathfieldElement
 * 的靜態設定，不碰宿主任何 DOM。
 * ========================================================================== */
(() => {
'use strict';

var STYLE_ID = 'cp171-mathlive-css';

/* MathLive 自己的靜態樣式（原始上游 mathlive-static.css，sha256 0d0d6d95ae4f252f…，
   即 npm 套件裡未經修改那份的雜湊，供對帳查來源用）。
   實測過其餘選擇器全部落在 .ML__* 與 math-field 之下，不會汙染宿主。
   ↓ 下面這份是拿掉 20 條 @font-face 之後的版本，理由見上面「決定一之一」；
   其餘每一條規則都是原始檔案逐字保留，只刪不改。 */
var ML_CSS = "/* 0.110.0 */:root{--ML__static-fonts:true}.ML__container{min-height:auto!important;--_hue:var(--hue,212);--_placeholder-color:var(--placeholder-color,hsl(var(--_hue),40%,49%));--_placeholder-opacity:var(--placeholder-opacity,0.4);--_text-font-family:var(--text-font-family,system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",\"Roboto\",\"Oxygen\",\"Ubuntu\",\"Cantarell\",\"Fira Sans\",\"Droid Sans\",\"Helvetica Neue\",sans-serif)}.ML__sr-only{height:1px;margin:-1px;overflow:hidden;padding:0;position:absolute;width:1px;clip:rect(0,0,0,0);border:0;clip-path:inset(50%);white-space:nowrap}.ML__base,.ML__is-inline{display:inline-block}.ML__base{border:0;box-sizing:content-box;cursor:text;font-family:inherit;font-style:inherit;font-weight:inherit;margin:0;outline:0;padding:0;position:relative;text-decoration:none;vertical-align:baseline;visibility:inherit;width:min-content}.ML__strut,.ML__strut--bottom{display:inline-block;min-height:0.5em}.ML__small-delim{font-family:KaTeX_Main}.ML__text{font-family:var(--_text-font-family);white-space:pre}.ML__cmr{font-family:KaTeX_Main;font-style:normal}.ML__mathit{font-family:KaTeX_Math;font-style:italic}.ML__mathbf{font-family:KaTeX_Main;font-weight:700}.ML__mathbfit,.lcGreek.ML__mathbf{font-family:KaTeX_Math}.ML__mathbfit{font-style:italic;font-weight:700}.ML__ams,.ML__bb{font-family:KaTeX_AMS}.ML__cal{font-family:KaTeX_Caligraphic}.ML__frak{font-family:KaTeX_Fraktur}.ML__tt{font-family:KaTeX_Typewriter}.ML__script{font-family:KaTeX_Script}.ML__sans{font-family:KaTeX_SansSerif}.ML__series_el,.ML__series_ul{font-weight:100}.ML__series_l{font-weight:200}.ML__series_sl{font-weight:300}.ML__series_sb{font-weight:500}.ML__bold{font-weight:700}.ML__series_eb{font-weight:800}.ML__series_ub{font-weight:900}.ML__series_uc{font-stretch:ultra-condensed}.ML__series_ec{font-stretch:extra-condensed}.ML__series_c{font-stretch:condensed}.ML__series_sc{font-stretch:semi-condensed}.ML__series_sx{font-stretch:semi-expanded}.ML__series_x{font-stretch:expanded}.ML__series_ex{font-stretch:extra-expanded}.ML__series_ux{font-stretch:ultra-expanded}.ML__it{font-style:italic}.ML__shape_ol{-webkit-text-stroke:1px #000;text-stroke:1px #000;color:transparent}.ML__shape_sc{font-variant:small-caps}.ML__shape_sl{font-style:oblique}.ML__emph{color:#bc2612}.ML__emph .ML__emph{color:#0c7f99}.ML__highlight{background:#edd1b0;color:#007cb2}.ML__center{text-align:center}.ML__left{text-align:left}.ML__right{text-align:right}.ML__label_padding{padding:0 0.5em}.ML__frac-line{min-height:1px;width:100%}.ML__frac-line:after{background:currentColor;box-sizing:content-box;content:\"\";display:block;forced-color-adjust:preserve-parent-color;margin-top:max(-1px,-0.04em);min-height:max(1px,0.04em);print-color-adjust:exact;transform:translate(0)}@media (forced-colors:active){.ML__frac-line{min-height:0px}}.ML__sqrt,.ML__sqrt-sign{display:inline-block}.ML__sqrt-sign{position:relative}.ML__sqrt-line{display:inline-block;height:max(1px,0.04em);width:100%}.ML__sqrt-line:before{background:currentColor;content:\"\";display:block;forced-color-adjust:preserve-parent-color;margin-top:min(-1px,-0.04em);min-height:max(1px,0.04em);print-color-adjust:exact;transform:translate(0)}@media (forced-colors:active){.ML__sqrt-line:after{background:#fff!important}}.ML__sqrt-line:after{border-bottom-width:1px;content:\" \";display:block;margin-top:-0.1em}.ML__sqrt-index{margin-left:0.27777778em;margin-right:-0.55555556em}.ML__delim-size1{font-family:KaTeX_Size1}.ML__delim-size2{font-family:KaTeX_Size2}.ML__delim-size3{font-family:KaTeX_Size3}.ML__delim-size4{font-family:KaTeX_Size4}.ML__delim-mult .delim-size1>span{font-family:KaTeX_Size1}.ML__delim-mult .delim-size4>span{font-family:KaTeX_Size4}.ML__accent-body{font-family:KaTeX_Main}.ML__accent-combining-char{left:0.24em;position:relative}.ML__latex{direction:ltr;display:inline-block;font-family:inherit;font-size-adjust:none;font-stretch:normal;font-style:normal;font-variant-caps:normal;letter-spacing:normal;line-height:1.2;text-align:left;text-indent:0;text-rendering:auto;word-wrap:normal;forced-color-adjust:preserve-parent-color;text-shadow:none;-webkit-user-select:none;user-select:none;white-space:nowrap;width:min-content;word-spacing:normal}.ML__latex .style-wrap{position:relative}.ML__latex .ML__left-right,.ML__latex .ML__mfrac{display:inline-block}.ML__latex .ML__vlist-t{border-collapse:collapse;display:inline-table;table-layout:fixed}.ML__latex .ML__vlist-r{display:table-row}.ML__latex .ML__vlist{display:table-cell;position:relative;vertical-align:bottom}.ML__latex .ML__vlist>span{display:block;height:0;position:relative}.ML__latex .ML__vlist>span>span{display:inline-block}.ML__latex .ML__vlist>span>.ML__pstrut{overflow:hidden;width:0}.ML__latex .ML__vlist-t2{margin-right:-2px}.ML__latex .ML__vlist-s{display:table-cell;font-size:1px;min-width:2px;vertical-align:bottom;width:2px}.ML__latex .ML__msubsup{text-align:left}.ML__latex .ML__negativethinspace{display:inline-block;height:0.71em;margin-left:-0.16667em}.ML__latex .ML__thinspace{display:inline-block;height:0.71em;width:0.16667em}.ML__latex .ML__mediumspace{display:inline-block;height:0.71em;width:0.22222em}.ML__latex .ML__thickspace{display:inline-block;height:0.71em;width:0.27778em}.ML__latex .ML__enspace{display:inline-block;height:0.71em;width:0.5em}.ML__latex .ML__quad{display:inline-block;height:0.71em;width:1em}.ML__latex .ML__qquad{display:inline-block;height:0.71em;width:2em}.ML__latex .ML__llap,.ML__latex .ML__rlap{display:inline-block;position:relative;width:0}.ML__latex .ML__llap>.ML__inner,.ML__latex .ML__rlap>.ML__inner{position:absolute}.ML__latex .ML__llap>.ML__fix,.ML__latex .ML__rlap>.ML__fix{display:inline-block}.ML__latex .ML__llap>.ML__inner{right:0}.ML__latex .ML__rlap>.ML__inner{left:0}.ML__latex .ML__rule{border:0 solid;box-sizing:border-box;display:inline-block;position:relative}.ML__latex .overline .overline-line,.ML__latex .underline .underline-line{width:100%}.ML__latex .overline .overline-line:before,.ML__latex .underline .underline-line:before{border-bottom-style:solid;border-bottom-width:max(1px,0.04em);content:\"\";display:block;print-color-adjust:exact}.ML__latex .overline .overline-line:after,.ML__latex .underline .underline-line:after{border-bottom-style:solid;border-bottom-width:max(1px,0.04em);content:\"\";display:block;margin-top:-1px;print-color-adjust:exact}.ML__latex .ML__stretchy{display:block;left:0;overflow:hidden;position:absolute;width:100%}.ML__latex .ML__stretchy:after,.ML__latex .ML__stretchy:before{content:\"\"}.ML__latex .ML__stretchy svg{display:block;fill:currentColor;fill-opacity:1;fill-rule:nonzero;height:inherit;position:absolute;stroke:currentColor;stroke-dasharray:none;stroke-dashoffset:0;stroke-linecap:butt;stroke-linejoin:miter;stroke-miterlimit:4;stroke-opacity:1;stroke-width:1;width:100%}.ML__latex .slice-1-of-2{left:0}.ML__latex .slice-1-of-2,.ML__latex .slice-2-of-2{display:inline-flex;overflow:hidden;position:absolute;width:50.2%}.ML__latex .slice-2-of-2{right:0}.ML__latex .slice-1-of-3{left:0;width:25.1%}.ML__latex .slice-1-of-3,.ML__latex .slice-2-of-3{display:inline-flex;overflow:hidden;position:absolute}.ML__latex .slice-2-of-3{left:25%;width:50%}.ML__latex .slice-3-of-3{right:0;width:25.1%}.ML__latex .slice-1-of-1,.ML__latex .slice-3-of-3{display:inline-flex;overflow:hidden;position:absolute}.ML__latex .slice-1-of-1{left:0;width:100%}.ML__latex .ML__nulldelimiter,.ML__latex .ML__op-group{display:inline-block}.ML__latex .ML__op-symbol{position:relative}.ML__latex .ML__op-symbol.ML__small-op{font-family:KaTeX_Size1}.ML__latex .ML__op-symbol.ML__large-op{font-family:KaTeX_Size2}.ML__latex:has(.ML__align_environment),.ML__latex:has(.ML__center_environment),.ML__latex:has(.ML__eqnarray_environment),.ML__latex:has(.ML__gather_environment),.ML__latex:has(.ML__multiline_environment){width:100%}.ML__latex .ML__multiline_environment{display:inline-flex;width:100%}.ML__latex .ML__center_environment{display:inline-flex;justify-content:center;width:100%}.ML__latex .ML__align_environment,.ML__latex .ML__eqnarray_environment,.ML__latex .ML__gather_environment{display:inline-block}.ML__latex .ML__mtable .ML__vertical-separator{box-sizing:border-box;display:inline-block;min-width:1px}.ML__latex .ML__mtable .ML__arraycolsep{display:inline-block}.ML__latex .ML__mtable .col-align-m>.ML__vlist-t{text-align:center}.ML__latex .ML__mtable .col-align-c>.ML__vlist-t{text-align:center}.ML__latex .ML__mtable .col-align-l>.ML__vlist-t{text-align:left}.ML__latex .ML__mtable .col-align-r>.ML__vlist-t{text-align:right}[data-href]{cursor:pointer}.ML__error{background-color:rgba(204,0,65,.1);background-image:radial-gradient(ellipse at center,#cc0041,transparent 70%);background-position:0 100%;background-repeat:repeat-x;background-size:3px 3px;display:inline-block;padding-bottom:3px}.ML__error>.ML__error{background:transparent;padding:0}.ML__placeholder{color:var(--_placeholder-color);font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Oxygen,Ubuntu,Cantarell,Fira Sans,Droid Sans,Helvetica Neue,sans-serif;opacity:var(--_placeholder-opacity);padding-left:0.4ex;padding-right:0.4ex}.ML__notation{box-sizing:border-box;line-height:0;position:absolute}.ML__tooltip-container{position:relative;transform:scale(0)}.ML__tooltip-container .ML__tooltip-content{background:var(--_tooltip-background-color);border:var(--_tooltip-border);border-radius:var(--_tooltip-border-radius);display:inline-table;max-width:400px;padding:12px;position:fixed;visibility:hidden;width:max-content;z-index:2;--_selection-color:var(--_tooltip-color);box-shadow:var(--_tooltip-box-shadow);color:var(--_tooltip-color);opacity:0;transition:opacity 0.15s cubic-bezier(0.4,0,1,1)}.ML__tooltip-container .ML__tooltip-content .ML__text{white-space:normal}.ML__tooltip-container .ML__tooltip-content .ML__base{display:contents}.ML__tooltip-container:hover .ML__tooltip-content{font-size:0.75em;opacity:1;transform:scale(1) translateY(3em);visibility:visible}.ML__bg{background-color:transparent!important}.ML__bg:before{background-color:var(--bg-color);bottom:0;box-sizing:border-box;content:\"\";left:0;position:absolute;right:0;top:0;z-index:-1}";

function injectCSS() {
  try {
    if (document.getElementById(STYLE_ID)) return true;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    /* --ML__static-fonts 一定要在 MathLive 第一次量字型之前就存在，
       所以放在同一個 style 節點的最前面，跟 CSS 一起進 DOM。 */
    st.textContent = ':root{--ML__static-fonts:true}\n' + ML_CSS;
    (document.head || document.documentElement).appendChild(st);
    return true;
  } catch (e) { return false; }
}

function configure() {
  var MFE = null;
  try { MFE = window.MathfieldElement || (window.MathLive && window.MathLive.MathfieldElement) || null; }
  catch (e) { MFE = null; }
  if (!MFE) return false;
  try { MFE.soundsDirectory = null; } catch (e) {}      /* 不抓 wav */
  try { MFE.fontsDirectory = null; } catch (e) {}       /* 字型走 @font-face，不抓目錄 */
  /* 虛擬鍵盤預設「有實體鍵盤就不跳出來」，桌面上不要擋住視線 */
  try { MFE.mathVirtualKeyboardPolicy = 'auto'; } catch (e) {}
  return true;
}

var cssOK = injectCSS();
if (!cssOK) {
  try {
    document.addEventListener('DOMContentLoaded', function () { cssOK = injectCSS(); }, { once: true });
  } catch (e) {}
}
var cfgOK = configure();

try {
  window.__CP171_MATHLIVE__ = {
    version: '0.110.0',
    /* 元素有沒有註冊成功——這是「MathLive 可用」的唯一權威判準 */
    available: function () {
      try {
        return !!(window.customElements && window.customElements.get
                  && window.customElements.get('math-field'));
      } catch (e) { return false; }
    },
    /* 字型是不是走共用（true 代表沒有新增任何字型位元組） */
    staticFonts: function () {
      try {
        var v = getComputedStyle(document.documentElement)
                  .getPropertyValue('--ML__static-fonts');
        return !!(v && String(v).trim());
      } catch (e) { return false; }
    },
    cssInjected: function () { return !!document.getElementById(STYLE_ID); },
    configured: cfgOK
  };
} catch (e) {}

})();
