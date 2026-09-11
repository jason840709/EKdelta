
/* CP174.92 / 1.1.9.8
 * KaTeX's equation tag is positioned against .katex-html.  The inherited
 * renderer wrapped .katex-display in an intrinsic-width inline-block (.mjx),
 * so right:0 meant "right edge of the formula" and tags collided with short
 * formulas.  Give display math a full-width block containing an independently
 * centred KaTeX row; the tag can then stay at the far right of that row.
 * This is presentation-only: canonical Markdown, TeX and inline math are
 * untouched.
 * CP179 / 1.1.9.12: buildPdfCSS must also carry this named stylesheet into
 * both print and raster documents. Keeping it only in the editor's head
 * fixed the editor in CP174.92 but left the exported equations intrinsic
 * width. The padded outer block must fit its parent, including its padding.
 */
(() => {
  const id = 'cp174-92-equation-number-layout-style';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = `
/* Display equations own the line; the formula remains centred while KaTeX's
   .tag is positioned against the full available measure. */
.md-math-block { width: 100%; box-sizing: border-box; }
.md-math-block > .mjx {
  display: block;
  width: 100%;
  max-width: none;
}
.md-math-block > .mjx > .katex-display {
  width: 100%;
  box-sizing: border-box;
  margin: 0;
}
.md-math-block > .mjx > .katex-display > .katex {
  position: relative;
  width: 100%;
  box-sizing: border-box;
  text-align: center;
}
.md-math-block > .mjx > .katex-display > .katex > .katex-html {
  position: relative;
  width: 100%;
}
.md-math-block > .mjx > .katex-display > .katex > .katex-html > .tag {
  position: absolute;
  right: 0 !important;
  top: 0;
}
/* REVTeX live projection used a legacy counter pseudo-element. When the
   source already contains a KaTeX tag, that second label is incorrect and
   can collide with the real tag. */
.rvx-live-block .md-math-block:has(.katex-html > .tag)::after {
  content: none !important;
}
`;
  (document.head || document.documentElement).appendChild(style);
})();
