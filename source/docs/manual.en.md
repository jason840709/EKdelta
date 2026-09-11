# User Manual

> This manual matches **Ekdeta 1.2.3 (2026.09)**.

## How to read this manual

The manual has three parts; read only what you need:

- **Part One — Basics (sections 1–10):** storage, interface, editing, tables, images, export. Everyone uses these.
- **Part Two — Three writing modes (sections 11–14):** ordinary Markdown, shared A4 and PDF procedures, Taiwan Thesis documents, and REVTeX journal manuscripts. Read the sections that apply to your current mode.
- **Part Three — Settings and reference (sections 15–20):** preferences, themes and fonts, troubleshooting, shortcuts, known limits.
- **Appendix A** is the complete menu reference, for lookup.

New users should start with **Welcome** in the sidebar, which is a four-step introduction.

---

# Part One · Basics

## 1. Where your data lives: storage and backup

Ekdeta opens directly in a browser or through the desktop shell. It does not automatically upload documents. Ordinary documents below the separator, plus settings, are stored in the browser about 1.2 seconds after typing stops. The six built-in documents come from the current version; their edits are not permanently saved.

Saving, backup, folder sync, and `.md` export preserve unedited source text, including line endings, YAML, HTML comments, math fences, and other extensions.

**Browser storage is not a backup.** Choose at least one of:

- **Chrome or Edge:** File → Link Storage Folder…. Every ordinary document syncs as a `.md` file, and the same folder holds `ekdeta-data.json` with documents, the current selection, and settings. Built-in documents are not duplicated there. A browser restart may ask for folder permission again; grant permission again to resume syncing.
- **Any browser:** export a Full Backup (`.json`) regularly and use Restore Backup on another machine.
- **Important deliverables:** also export `.md`, single-file HTML, or PDF.

The four backup commands:

1. **Link Storage Folder…** — once the menu shows "Linked: folder name", syncing is active. Unlink Folder only stops syncing; it deletes nothing.
2. **Export Full Backup (.json)** — one JSON with all ordinary documents, the current selection, and settings.
3. **Restore Backup…** — **replaces** ordinary documents and settings with the backup, then reports how many were restored.
4. **Load from Folder…** — reads `ekdeta-data.json` from the linked folder; use it to continue the same work on another computer.

Reset to Factory clears ordinary documents and settings in the browser and reloads the current version's six built-in documents. `.md` files already written to an external folder are untouched.

## 2. Interface and sidebar

- The menu bar holds Ekdeta, File, Edit, Paragraph, Format, View, Theme, Mode, and Help. The desktop shell adds Desktop Shell and Window menus.
- The title bar shows the current document; display controls sit at the top right. Theme controls appearance, and Mode selects document layout. These are separate settings.
- The **formatting toolbar** sits at the top of the document area, right of the sidebar. It is on by default, keeps Undo/Redo fixed at the left, follows your customized order, and moves tools into "⋯" only when they genuinely overflow.
- Three sidebar tabs:
  - **Files** — the six built-in documents (Welcome, User Manual, Dev Notes, Taiwan Thesis Template (Chinese), Taiwan Thesis Template (English), International Journal Paper Template) above a separator; your own documents below it. Create, switch, rename, close, or drop in a `.md`. **⌘P Quick Open** ranks names by fuzzy match.
  - **Outline** — filter headings, fold or expand sections, and see the current position. Duplicate headings are located by actual order; Taiwan Thesis variants mirror chapter, section, subsection, and appendix numbers.
  - **Search** — search across all documents; results show file, line, and context, and click to jump.
- The four top-right controls are sidebar (⇧⌘L), source mode (⌘/), dark/light, and font size smaller/larger/reset.
- The status bar shows word count, reading zoom, version, and save state; a selection additionally reports its range.

**Built-in versus ordinary documents:** built-ins allow temporary edits, but switching away, reloading, or reopening restores their original content. To keep changes, create an ordinary document from a template or copy the content into a new document. An ordinary document with the same name still saves, renames, and closes normally.

**Source Mode:** press ⌘/ (Windows/Linux: Ctrl+/), and press again to return to the rendered document. If the caret is on screen, its position is retained; after scrolling away from it, the current view is used instead. Source Mode provides syntax colors, line numbers, an active-line cue, and outline navigation. Edit complete Markdown directly; Undo/Redo applies to edits made in Source Mode. Set its monospace font in Preferences.

## 3. Creating, saving, and managing documents

- **Create and switch:** "+ New File" or File → New File; most browsers intercept ⌘N as a new window, so use the menu when they do. Click a document in Files, or use ⌘P.
- **Saving:** ordinary documents write about 1.2 seconds after typing stops; ⌘S saves immediately and reports "Saved to browser" or "Saved (browser + folder)". Built-in documents never take part in saving.
- **Rename:** double-click an ordinary document, or File → Rename….
- **Open and import:** File → Open Markdown… accepts `.md`, `.markdown`, `.txt`; you can also drop a file onto the window. An imported document is **not linked** to the file on disk — later edits stay inside the program. Dropping an image inserts the image instead of opening a document.
- **Close:** File → Close This File. With a linked folder the `.md` in the folder is kept; without one, a three-button dialog offers "Save (.md) & close", "Close without saving", and "Cancel", because closing removes the file from browser storage.

## 4. Editing model and Markdown

When the caret enters a paragraph, that paragraph shows its Markdown source; leaving it renders again. Bold, italic, links, inline code, and math can be edited as individual runs without expanding the whole paragraph. The Taiwan Thesis A4 view uses a floating editor so pagination stays stable, and you can click rendered page text to move the insertion point.

Supported blocks:

- H1–H6 headings, paragraphs, quotes, horizontal rules.
- Bulleted, numbered, and task lists; Tab/Shift+Tab or ⌘]/⌘[ for nesting. A list item may begin with a heading, e.g. `1. #### Section`.
- Code fences, display math, Markdown tables.
- Inline bold, italic, underline, strike, highlight, code, math, links, images.
- Start a line with `# `, `- `, `1. `, `> `, or `- [ ] ` for quick conversion; type a code fence or `$$` then Enter to expand a block.

Lists and quotes **stay rendered** once applied: the bullet, number, checkbox, or quote bar never falls back to a raw marker. Enter after non-empty content creates the next item of the same type; Enter again on the empty item exits; Backspace at the content start removes the structure.

**The toolbar and shortcuts perform the same formatting operations.** Use them in ordinary text, inline editors, table cells, Source Mode, or a floating editor. Clicking the toolbar keeps your selection, so you can apply several formats in succession.

- When only part of a range is bold or italic, existing markers inside the selection are consolidated so one consistent style is applied; pressing again removes it only when the whole range already has it.
- `[[1]]` references, inline math, images, and inline code are treated as whole items; formatting markers are never inserted inside them.
- Clear Format removes inline wrappers and link wrappers while keeping link text, and refuses to damage fenced code, display math, or a complete table.

**First-line indent:** place the caret in a paragraph and press **⌥⌘0**. Normal paragraphs store the marker at line start, quotes after `> ` so the Markdown stays valid; the marker is hidden in rendered view and PDF.

Smart pairing covers brackets, quotes, backticks, and `* _ ~ = $`; typing a pair character around a selection wraps it. Pairing is suppressed during IME composition and inside code, tables, and math.

## 5. Smart paste and completion

Normal paste inspects the clipboard:

- HTML from the web or Word becomes Markdown, preserving bold, italic, inline code, strike, links, and images.
- TSV/CSV data or a single HTML table becomes a Markdown table; inline formatting in cells is preserved.
- Clipboard images follow the image-storage preference; with no writable location they are embedded as base64.
- Use **⇧⌘V Paste as Plain Text** when no conversion is wanted.

Completion appears in four places: `\` plus a prefix in math (KaTeX commands), the first line after a code fence (language), `:name` in normal text (emoji), and `](#` in a link target (internal headings). Candidates support fuzzy ranking, arrows, Page Up/Down, Home/End, and recent items; Enter applies a highlighted item and Esc closes.

## 6. Find, replace, and navigation

- **⌘F** finds in the current document; **⌥⌘F** opens replace.
- **Aa / W / .*** control case sensitivity, whole-word matching, and regular expressions; the options are remembered.
- All matches are highlighted; Enter/Shift+Enter or ⌘G/⇧⌘G moves through them. Replace All is one undo step.
- **⇧⌘F** searches all documents; **⌘P** opens Quick Open.
- Outline headings and internal anchors use a GitHub-like slug with numeric suffixes for duplicates; ⌘-click an internal link to jump.
- In Source Mode, use the browser's own find command.

## 7. Tables

- ⌥⌘T or Paragraph → Table, then pick rows and columns from the grid.
- Click a table to edit cell by cell: Tab/Shift+Tab, Enter, and arrows move; Tab in the last cell adds a row; Esc finishes. Empty cells keep a full line height.
- The toolbar inserts or removes rows and columns and sets alignment. Drag a column boundary to resize; widths are stored as percentages with the document and survive theme switches and reopening.
- **Single page** is a quick toggle; **Layout…** sets pagination (Auto / Keep whole / Fit single page), width, font scale, line height, and cell padding, with Standard, Compact, Very compact, and Fit presets. Values live in a hidden comment next to the table that other editors ignore.
- Ordinary Markdown has no paper height, so Fit single page only renders a stable compact preview there. In A4 modes the program measures the real text block: width, margins, padding, and line height first, type size last.
- Keep whole never compresses; it moves the table only when it fits one full page. Fit single page adapts the table within safe limits. If even the minimum settings still exceed a page, the program falls back to row continuation with repeated headers rather than clipping data.
- Literal `|` characters in cells are escaped automatically when the Markdown is saved.

## 8. Math, code, footnotes, HTML, and anchors

- **Math:** embedded KaTeX supports inline `$…$`, display `$$…$$`, `\[…\]`, and math fences. Click a formula to edit it with a live preview; invalid formulas show their source and an error instead of stopping the renderer.
- **Equation numbers:** add `\tag{2.19}` inside display math to set a number. The editor and PDF output preserve the separation between the equation and its number. Batch export does not restart equation numbering. Break very wide equations into lines and check the output.
- **Code:** fences highlight JavaScript, TypeScript, Python, C/C++/C#, Java, Kotlin, Go, Rust, Swift, PHP, SQL, shell, HTML, CSS, JSON, YAML, LaTeX, and aliases. Unknown languages stay plain text.
- **Footnotes:** write `A sentence with a note[^method].` and `[^method]: The note text.`; references and definitions link to each other. IDs may use letters, digits, `.`, `_`, `-`, and CJK characters, and are shown literally without renumbering.
- **Inline HTML:** allow-listed tags such as `<u>`, `<kbd>`, `<mark>`, `<sup>`, `<sub>`, `<details>` render; scripts, event attributes, `javascript:` URLs, and iframes are removed or rejected. Use Markdown instead for complex multi-line layouts.
- **Anchors:** `[text](#heading)` jumps to a heading in the document.

## 9. Images

- Paste a screenshot, drop a file, insert a URL, or write `![alt](path)` / `<img src="…">`.
- Preferences can store images in a subfolder of the linked folder (default `image/`), in a separate image folder, or as base64.
- Click an image for 25/33/50/66/100 percent, a custom percentage, path and alt editing, or a Markdown/HTML syntax switch.
- When local images cannot be found, a repair bar appears; "View missing images" lists full paths, locations, and repeat counts. Choose the image folder once and files are re-matched by relative path and suffix.

## 10. Copy, import, and export

The Edit menu copies as **Markdown** (source syntax), **LaTeX** (headings, lists, tables, math, footnotes, images), or **HTML for Word**. A selection limits the operation; otherwise the active block, caret block, or whole document is used.

The File menu exports Markdown `.md`, general-purpose LaTeX `.tex` (optional booktabs tables and listings code), plain HTML, single-file HTML with embedded images, PDF (vector/searchable), batch PDF, compatibility raster PDF, and a full backup `.json`. A REVTeX document instead provides its compiled `.tex` in the right panel and a REVTeX project `.zip` from File (section 14).

HTML and Markdown exports are not full backups; use Full Backup to move all documents and settings.

---

# Part Two · Three writing modes

## 11. Ordinary Markdown

The default mode for notes, articles, and drafts. Themes: GitHub, Night, Sepia, Blackout, Blackout Game. There is no paper or pagination; font size changes 1 px per step and content width follows the window, re-centering after zoom or sidebar changes.

## 12. A4 pagination and PDF export

Taiwan Thesis Chinese and English modes display A4 sheets, page breaks, and folios in the editor. Paragraphs, images, code, and tables move or split according to the available page height; oversized images scale down. Font size changes in 0.5 pt steps. Paper size and margins stay fixed, while content repaginates.

Preferences → Thesis Output → Fill each page is on by default. Text, quotes, and code may continue on the next page; an inline formula moves with its whole line of text. With it off, paragraphs that fit on a complete page move as a whole.

### 12.1 Choose an output

| Output | Suitable use | How to save |
| --- | --- | --- |
| Export PDF (vector / searchable) | Ordinary documents with searchable, selectable text | System print → Save as PDF |
| Export PDF in batches (recommended for large files) | Long documents; fewer pages per print operation | Save a separate PDF per batch, then merge yourself |
| Compatibility raster PDF (direct download) | Compatibility fallback using page images | Direct download; text is not searchable and enlargement shows pixels |

Regular and batch PDFs preserve the document's equation numbers. Resolve missing-image notices before export and check that images have loaded in the document. Initial loading and pagination still take time for large files; batching limits the pages sent to each print operation.

### 12.2 Regular vector PDF

1. Choose File → Export PDF (vector / searchable).
2. After preparation, choose Save as PDF or an equivalent destination in the system print dialog.
3. Use A4 and 100% scale. If offered, disable headers and footers added by the browser.
4. Open the saved PDF to check page breaks, images, and equations.

Text is searchable and selectable, and contents links work in supported PDF readers. If preparation reports a problem, resolve it before exporting again.

### 12.3 Export PDF in batches (recommended for large files)

Choose this item from File. Prepare 100, 50, 25 or 10 pages at a time; the default is 50. Ranges count from the first physical page, including the cover. Printed page and equation numbers are preserved.

1. Select the batch size and page range, then choose “Prepare this batch”.
2. When ready, open the print dialog and choose “Save as PDF” and “All” pages. The print document contains only this batch. The default filename automatically includes the range, for example `Document_Pages 51 to 100.pdf`.
3. Wait until both the print and save dialogs are closed, return to the app, and confirm that the file was saved before choosing “Batch saved; select next”. The app clears this batch’s print content and waits for cleanup to finish before allowing the next batch to be selected or prepared. If printing was cancelled, choose “Not saved / retry batch”; the previous print content is also cleared before preparing it again.
4. Prepare the next batch manually until finished. If returning is not detected, close both the print and save dialogs first, then select “Print dialog is closed; return to batches”. Wait for cleanup to finish before confirming whether the batch was saved.

Detecting a return from printing does not tell the app whether you saved or cancelled. The app keeps print content available until you confirm the dialogs are closed, since the save dialog may still need it. Wait for controls to become available again while cleanup runs.

Editing pauses until this dialog closes so the source page layout stays consistent. Progress is kept only for the current session and is not restored after the app restarts. Each batch is a separate PDF; there is no automatic merge. Contents links across batches retain text without navigation; links within a batch remain active. The existing regular vector PDF, compatibility raster PDF, and system printing options remain available; REVTeX uses its TeX PDF export. This option limits additional print content; initial full-document loading and pagination still require time and memory.

### 12.4 Compatibility raster PDF and system printing

Compatibility raster PDF (direct download) makes each page an image; contents page numbers can still carry internal navigation links. It processes the entire document in one export, so prefer batches for long documents.

Print (system dialog) remains available for ordinary printing. For REVTeX, use Download PDF in the right panel; see section 14.

## 13. Taiwan Thesis (Chinese / English)

These modes support Chinese and English layouts for Taiwanese master’s theses and doctoral dissertations. The Chinese version combines a classicthesis-style body with a National Sun Yat-sen University example cover; the English version provides an English cover, copyright page, italic subsection headings, and English system labels. Edit the institution, department, people, and dates for your own document, and check the layout against your institution’s current requirements before submission. Create an ordinary document from the template first (Welcome, step 4).

- **Chinese Digital 1:** compact symmetric text block, centered folios, no running head, no blank pages.
- **Chinese Digital 2:** symmetric book-style block, centered folios, chapter/section running heads.
- **English Digital:** symmetric layout, centered folios, no running head.
- **Chinese and English Print:** mirrored two-sided book layout; binding edge 33.58 mm, outer edge 25.29 mm, folios on the outer edge, openright blank pages inserted when required. English Print chapter-opening pages stay plain; other even left pages show the chapter, odd right pages the current section with a full-width rule.

Template syntax: `twthesis-titlepage` builds the cover (department, thesis type, title, author, advisor, and date in both Chinese and English; output uses proper labels instead of form field names); `twthesis-approval` places a full-page A4 approval image (image path, oral defense date); English mode also has `twthesis-titleback` for the copyright page; `twthesis-toc`, `twthesis-lof`, `twthesis-lot` build the contents and figure/table lists; chapters after `twthesis-appendix` switch to appendix numbering; `[[N]]` is a citation marker. Abstract keywords stay on one Markdown line beginning with bold `關鍵字：` or `Keywords:`, then display as two left-aligned lines at the bottom of the text block.

All of this fence syntax can be produced from a form via the **Thesis** button on the formatting toolbar instead of typing it by hand. The cover form selects the matching fields for the current Taiwan Thesis Chinese or English mode.

Indentation lives in Preferences → Thesis Output → Indentation: Chinese uses a two-em first line (default) or no indentation; English offers no indentation (default), 0.5 in for every paragraph, or first-paragraph-after-heading flush with 0.5 in elsewhere. Captions, references, keywords, and explicit `<!-- noindent -->` always stay flush.

## 14. REVTeX 4.2 international journal manuscripts

This mode works **quite differently** from the other two. Instead of approximating LaTeX in HTML, you **write Markdown on the left and see a PDF produced by a real pdfLaTeX (REVTeX 4.2) run on the right**. What you see on the right is the file you submit.

### 14.1 Entering and first-time setup

1. Choose Mode → International Journal REVTeX 4.2. The left half stays an ordinary Markdown editor; the right half opens the PDF panel.
2. The right panel asks you to **load the compile engine (Engine Pack)** once. After that you write and it compiles as you go.
3. Use Layout settings on the left to select the society and journal (APS: PRL, PRA, PRB, RMP and others; AIP: JCP, APL, JAP and others; AAPM: MPH; SOR: JOR), manuscript mode (reprint / preprint / manuscript), columns, paper size, type size, address style, citation style, and class options. The choices follow official `revtex4-2` definitions and are saved with the current document.
4. Leave Type size on Automatic by mode for normal use. This is not screen zoom: official REVTeX uses 12 pt for `preprint` / `manuscript` and 10 pt for `reprint`. Changing manuscript mode returns the document's type size to Automatic so a preprint 12 pt choice does not carry into reprint. Older AIP, reprint, Letter, two-column documents saved at 11 pt or 12 pt are likewise returned to Automatic; manuscript text is unchanged.

### 14.2 Manuscript syntax

Fences mark REVTeX semantic regions inside your Markdown:

- `revtex-frontmatter` — title, authors, affiliations, email, corresponding author, preprint number, PACS, keywords. List affiliations once as an ordered list (`affiliations:`) and point each author at them by index (`affil: 1,3`) instead of repeating long affiliation strings.
- `revtex-abstract` — the abstract, multiple paragraphs allowed.
- `revtex-acknowledgments` — acknowledgments.
- `revtex-wide` — content that must span both columns.
- `revtex-subequations` — a group of `$$...$$` expressions numbered (1a)(1b)(1c).
- `revtex-turnpage` — rotates a single table or figure 90° across a full page (official limit: exactly one item per block).
- `revtex-longtable` — a table that spans pages, with the header repeated on each page.
- `revtex-appendix` — chapters after it become appendices A, B, C.
- `revtex-bibliography` — reference list; three formats are supported — numbered `[1] Author…` lines, `1. Author…`, or a plain list with numbering added automatically. A `.bib` file with the full BibTeX flow also works, and the legacy named-key style (`key: Author…`) remains fully compatible and may be mixed with the new styles.

**In-text citations**: write `[[1]]`, `[[1, 3]]`, or `[[2-14]]` (ranges expand automatically and print as `[2–14]`) — the same convention used in the thesis template, instead of the older `[@key]` syntax (which still works). Citing a number with no matching bibliography entry is reported by name in the compile messages.

Ordinary Markdown continues to work: sections, lists, tables, images, inline and display math, cross-references (`\ref` / `\eqref` with `{#id}`), footnotes `[^id]`, wide figures `![caption](path){#id wide}`, merged table cells (a cell containing only `>` merges into the cell to its left). Equation and table widths are measured at compile time, so wide content switches to a spanning or scaled layout automatically.

**Image scaling is carried into REVTeX.** Click an image on the left and choose 25/33/50/66/100 percent or a custom value. The Markdown source stores it as `<img style="zoom:N%;">`; REVTeX output treats 100 percent as `\columnwidth` for ordinary figures and as `\textwidth` for `title="*"` spanning figures, then sets the corresponding `\includegraphics` width. `style="width:N%;"` and `width="N%"` are also accepted. This percentage affects output; reading zoom and A4/Taiwan Thesis table single-page fitting do not affect REVTeX.

### 14.3 Manuscript syntax toolbar

You do not have to memorize the fence syntax. The formatting toolbar above the Markdown editor has **REV** and **Thesis** buttons at the right; each opens tools for front matter, abstracts, bibliographies, citations, equations, wide content, and more. Fill in a form and press Insert to add a complete syntax block at the caret. See section 13 for the Taiwan Thesis tools.

### 14.4 Preview and delivery

- **Download PDF on the right** — downloads the current TeX-compiled PDF; inspect this version page by page before submission.
- **Download .tex on the right** — downloads `main.tex` with the current society, journal, and class options.
- **File → Export REVTeX Project (.zip)…** — recommended for submission. It contains `main.tex`, the bibliography, the source Markdown, images, a build script, a settings snapshot, and a manifest; the portable variant also bundles the unmodified official REVTeX runtime.

For a REVTeX document, use the TeX PDF on the right instead of regular vector PDF, batch PDF, or compatibility raster PDF.

**The compiled TeX PDF is authoritative for line breaking and float placement.** Review the right-hand PDF page by page before submitting.

### 14.5 Known official limits (not program faults)

- `preprint` inserts the official optional soft break immediately before the abstract. A short paper may keep the abstract on page one; once the later body makes the document longer, TeX may instead start it on page two. This is not a fixed title page. Keep Front-matter pagination on Official behavior for exact parity with hand-written REVTeX, or choose Force a continuous first page (suppress abstract soft break) to prevent the large blank area after the affiliations.
- Official `reprint` defaults to 10 pt. Explicit 11 pt / 12 pt is not mere magnification; it selects another typography grid. In a long AIP / RSI Letter two-column paper, the official class itself can then place first-page body text within roughly 10 pt of the physical sheet edge. That combination is legal but unsuitable as the ordinary reprint preview; `auto` restores the official reprint 10 pt geometry.
- Footnotes are not allowed inside section titles (REVTeX disables them in moving arguments); the program removes them and suggests the author-note fields instead.
- Overfull warnings from rotated tables are false positives (rotated content is measured in unrotated coordinates).
- Paper sizes such as `a5paper` only set the sheet width officially, without adjusting the text block, so the settings panel exposes letter and a4 only.
- Letters journals (PRL, CP, and similar) do not number sections at all.
- **The two short rules above and below a spanning block are official.** In two-column layouts, `widetext` (the `revtex-wide` fence) draws a column-wide rule at the upper left and another at the lower right, each with a small right-angle tick at one end. They are **continuation marks**: the top rule shows where the left column stops, the bottom rule where the right column resumes, telling the reader that the two-column flow is interrupted by spanning material. `revtex4-2.cls` defines this explicitly and a pure official document produces the same marks, so they are not drawn by this program and should not be removed.

---

# Part Three · Settings and reference

## 15. Preferences, option by option

Ekdeta → Preferences… (⌘,) has three main tabs: **Global**, **Thesis Output**, and **International Paper**. Every change applies immediately, persists automatically, and is included in full backups and folder sync.

### 15.1 Global

- **Interface and display:** interface language (Traditional Chinese / English), document zoom 50–200 percent (screen only — never A4 geometry, page count, or PDF), the formatting toolbar (customizable items and order; Undo/Redo fixed at the left), Focus mode, and Typewriter mode.
- **Paste and drop images:** the panel first shows the Project storage folder (the relative-path root you explicitly granted). Three options: (1) a subfolder inside the project root, default `image`, with nested paths such as `assets/images`; (2) a separate image folder with its physical target and Markdown prefix configured independently; (3) always embed as base64. When a location is unavailable the program falls back in order. Browser security prevents a web app from revealing full absolute OS paths.
- **Fonts and script assignment:** nine slots. Ordinary Markdown, the Chinese Taiwan Thesis body, the English Taiwan Thesis body, and legacy Paper documents each have separate Chinese and Latin slots; code and Source Mode have a monospace slot. Source input, syntax coloring, and line numbers use the same monospace font so character positions stay aligned. Latin slots handle letters, numerals, and Western punctuation; Chinese slots handle Han characters and full-width punctuation. A CJK font containing Latin glyphs does not override a separately selected Latin font. A blank slot uses the system CJK fallback. Custom fonts carry into PDF output.

### 15.2 Thesis Output

- **Taiwan Thesis cover mark:** two built-in seals or a custom image at 60–140 percent, shared by the Chinese and English templates. JPG, PNG, WebP, GIF, and SVG are accepted; large bitmaps are downscaled with transparency preserved.
- **Pagination and numbering:** Auto-number sections and figures (on by default) generates chapter, figure, and table numbers in the view, outline, and PDF without rewriting Markdown — turn it off when your source already has numbers. Fill each page (on by default) is described in section 12.
- **Indentation:** independent Chinese and English settings, described in section 13.
- Taiwan Thesis digital/print variants are selected **only from the Mode menu**; they are not duplicated in Preferences.

### 15.3 International Paper

This page provides common REVTeX choices, including society, journal, manuscript mode, paper, type size, columns, address style, and citation style. Use Layout settings on the left of the REVTeX editor for the complete document-level choices; see section 14. Settings are saved with the current REVTeX document and do not affect Taiwan Thesis or ordinary Markdown.

## 16. Themes, modes, fonts, sizes, and language

- General themes: GitHub, Night, Sepia, Blackout, Blackout Game. The last two are pure-dark themes with no light counterpart; the light/dark button keeps them as they are.
- Writing modes: Markdown Mode, the Taiwan Thesis Chinese and English variants, and International Journal REVTeX 4.2. Select them from Mode. Changing Theme affects appearance only, not pagination or output.
- In Blackout, adjacent quote lines — including an empty line that still has `>` — share one orange rounded frame. In Blackout Game, red applies only to explicit bold text in the document; headings and interface stay white.
- The light/dark button affects the screen only; thesis PDFs remain black on white.
- Ordinary mode changes font size by 1 px per step; Taiwan Thesis modes by 0.5 pt.
- Ekdeta → Language switches Traditional Chinese and English and reloads built-in documents by identity (Welcome and Manual switch language, Dev Notes stays Chinese technical content, templates keep their own content). Ordinary documents are never touched.
- **Page zoom:** hold Command (Ctrl on Windows/Linux) and scroll over the document. This changes reading scale only, never line width, page count, or PDF; click the percentage in the status bar to reset to 100%.

## 17. Backup, recovery, and troubleshooting

Work through these steps in order:

1. **Export the current `.md` or a Full Backup first** — never reset before that.
2. Reload once to rule out an unfinished edit state.
3. Use the image repair bar or Choose Image Folder for missing images.
4. Re-authorize or relink the storage folder if syncing stops.
5. If a vector PDF is missing an image, confirm it is loaded on screen first; for raster PDF, choose the image folder and export again.
6. For thesis layout problems, reset font size and custom fonts, then confirm the mode and digital/print variant.
7. If a REVTeX compile fails, the right panel shows the message and line number; read the first error — later ones are usually consequences.
8. If the problem persists, keep the HTML, backup JSON, source Markdown, and a screenshot.

## 18. Shortcut reference and platform switch

Open Ekdeta → Markdown & Shortcut Reference. The upper-right **macOS / Windows / Linux** switch defaults to the current browser platform and changes the reference display only; it never remaps the application.

- The upper half groups the current Format, Paragraph, Edit, File, and View commands. Every available reliable shortcut is listed; "Menu only" means no browser-safe shortcut exists on that platform.
- Context Controls apply only inside Find, Quick Open, Outline filters, completion, table cells, floating editors, or Source Mode — operation names on the left, keys on the right.
- Windows and Linux users do not need to translate ⌘ manually; the panel renders actual Ctrl/Alt/Shift signatures.
- Browsers and operating systems may still intercept reserved keys such as Ctrl/⌘+N and Ctrl/⌘+O; use the menus when that happens.

## 19. Common shortcuts

| Group | Shortcuts |
| --- | --- |
| Files | ⌘S Save · ⌘P Quick Open · ⇧⌘S Export Markdown · ⇧⌘F Search all files |
| Format | ⌘B Bold · ⌘I Italic · ⌘U Underline · ⌘E Inline code · ⇧⌘X Strike · ⇧⌘H Highlight · ⌘K Link · ⌘\ Clear format |
| Paragraph | ⌘1–6/⌘0 Headings · ⌥⌘0 Toggle first-line indent · ⌘=/⌘- Promote/demote · ⌥⌘Q Quote · ⌥⌘U/O Lists · ⌥⌘X Task · ⌥⌘C Code · ⌥⌘B Math · ⌥⌘T Table |
| Edit | ⌘Z/⇧⌘Z Undo/redo · ⌘F Find · ⌥⌘F Replace · ⌘G/⇧⌘G Next/previous · ⇧⌘V Plain-text paste · ⇧⌘C Copy Markdown · ⌘D Select word · ⇧⌘D Delete word · ⌘L Select line/table row |
| View | ⌘/ Source · ⇧⌘L Sidebar · F8 Focus · F9 Typewriter |

Open Markdown & Shortcut Reference and switch platform for the complete table.

## 20. Known limits

- Vector PDF depends on the browser's Print / Save as PDF facility, so the official export opens a print dialog and cannot download silently the way the raster fallback does.
- The editor presents paper on a continuous editing surface; some odd/even screen offsets in print modes are visual approximations, while both PDF paths build real per-page geometry.
- Caret mapping through deeply nested inline syntax can be off by a character or two.
- A single table row, unbreakable object, or extremely long line taller than a page needs manual inspection.
- Complex multi-line HTML, iframes, scripts, and event attributes are not supported.
- There is no plugin system or Vim mode.
- REVTeX mode requires the compile engine; without it the right panel can only show the previous result.
- **Inspect the final PDF page by page before delivery**, especially covers, fonts, image ratios, continued table headers, folios, and contents page numbers.

---

# Appendix A · Menu reference

Items ending in "…" open a dialog.

**Ekdeta:** About Ekdeta / Version Info… / Preferences… (⌘,) / Language: 繁體中文 · English / Markdown & Shortcut Reference / Reset to Factory…

**File:** New File (⌘N) / Open Markdown… (⌘O) / Quick Open… (⌘P) / New Document from This Template (only while a template is open) / Save (⌘S) / Rename… / Export Markdown (.md) (⇧⌘S) / Export LaTeX (.tex) / Export REVTeX Project (.zip)… (requires a REVTeX document) / Tables as booktabs / Code as listings / Export HTML / Export Single-File HTML (images embedded)… / Export PDF (vector / searchable)… / Export PDF in batches (recommended for large files)… / Compatibility raster PDF (direct download)… / PDF Diagnostic Report… / Choose Image Folder (for PDF images)… / Print (system dialog)… / Export Full Backup (.json) / Restore Backup… / Link Storage Folder… / Load from Folder… / Unlink Folder / Close This File

**Edit:** Undo (⌘Z) / Redo (⇧⌘Z) / Find… (⌘F) / Find & Replace… (⌥⌘F) / Find in All Files… (⇧⌘F) / Paste as Plain Text (⇧⌘V) / Copy as Markdown (⇧⌘C) / Copy as LaTeX / Copy as HTML (for Word) / Select Word (⌘D) / Delete Word (⇧⌘D) / Select Row (⌘L) / Select All (native, ⌘A)

**Paragraph:** Heading 1–4 (⌘1–⌘4; levels 5 and 6 via ⌘5/⌘6) / Paragraph (⌘0) / Toggle First-line Indent (⌥⌘0) / Promote · Demote Heading (⌘=/⌘-) / Blockquote (⌥⌘Q) / Bulleted List (⌥⌘U) / Numbered List (⌥⌘O) / Task List (⌥⌘X) / Indent · Outdent (⌘]/⌘[) / Code Block (⌥⌘C) / Math Block (⌥⌘B) / Table (⌥⌘T) / Horizontal Rule

**Format:** Bold (⌘B) / Italic (⌘I) / Underline (⌘U) / Inline Code (⌘E) / Strikethrough (⇧⌘X) / Highlight (⇧⌘H) / Inline Math (⌃⌘M) / Hyperlink (⌘K) / Image (⌃⌘I) / Clear Format (⌘\)

**View:** Source Code Mode (⌘/) / Sidebar (⇧⌘L) / Outline Panel / Focus Mode (F8) / Typewriter Mode (F9) / Zoom Page In / Zoom Page Out / Reset Page Zoom (100%) / Format Toolbar / md-meta Syntax Reveal (Experimental)

**Theme:** GitHub / Night / Sepia / Blackout / Blackout Game

**Mode:** Markdown Mode / Taiwan Thesis Chinese (Digital 1 [compact] · Digital 2 [book] · Print [two-sided]) / Taiwan Thesis English (Digital [symmetric] · Print [two-sided book]) / International Journal REVTeX 4.2

**Help:** Markdown & Shortcut Reference / About Ekdeta

---

*Ekdeta is maintained by Ekdeta Contributors. See Ekdeta → Version Info for the changelog.*
