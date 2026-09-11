# Welcome to Ekdeta

> **Current version: 1.2.3.** Write Markdown notes, Taiwan Thesis documents in Chinese or English, and REVTeX 4.2 journal manuscripts.

Ekdeta puts the editor in one HTML file. Open it in a browser, or use it with the desktop shell. Ordinary editing and built-in math work offline; web images need a connection, and REVTeX compilation requires an Engine Pack.

**Ekdeta** combines **ekd-**, a Greek root associated with publishing and bringing written work to the public, with **eta (η)**, the Greek letter that lends the name a subtle scientific character. The name reflects Ekdeta’s purpose: turning a Markdown manuscript into a polished thesis or journal paper, and guiding research from writing to publication.

**Taiwan Thesis** is the interface name for the Chinese and English master’s thesis and doctoral dissertation modes. The built-in templates include National Sun Yat-sen University example fields that you can adapt to your institution’s requirements.

> **Arrange a backup first.** Ordinary documents autosave in your browser, but browser storage is not a backup. For regular work, use Link Storage Folder in Chrome or Edge, or regularly Export Full Backup (.json).

## Step 1: know the layout

- **The sidebar** has Files, Outline, and Search tabs for switching documents, navigating headings, and finding text.
- **The top menus** provide file, editing, and formatting commands. Theme changes the appearance; Mode selects Markdown, Taiwan Thesis Chinese or English, or International Journal REVTeX.
- **The formatting toolbar** above the document has Undo/Redo, paragraphs, text formatting, color, links, images, math, lists, and tables. The **REV/TW** buttons on the right open forms for manuscript syntax.
- **The top-right controls** toggle the sidebar and Source Mode, adjust font size, and switch light/dark appearance.
- **The status bar** shows word count, reading zoom, version, and save state.

Six built-in documents stay at the top of Files: **Welcome, User Manual, Dev Notes, Taiwan Thesis Template (Chinese), Taiwan Thesis Template (English), and International Journal Paper Template**. Your own documents appear below the separator.

You may edit built-ins temporarily, but **those edits are not saved**; switching away or reopening restores their original content. For lasting work, create an ordinary document or choose New Document from This Template at the top of a template.

## Step 2: try this page

Click this paragraph to see its Markdown source; click another paragraph and the first one renders again. Select a few words, then press **Bold** and *Italic* on the toolbar without reselecting.

- [ ] Click the box to complete the first exercise
- [ ] Press Enter at the end of a list item to continue; press Enter on an empty item to leave the list

Click a table cell below to edit it; Tab moves to the next cell, and Esc finishes.

| Item | Try changing it |
| --- | --- |
| My first note | Start here |

Click the inline formula $E = mc^2$ to edit it with a preview. Press **⌘/** (Windows/Linux: Ctrl+/) for the complete Markdown source; press it again to return.

## Step 3: create and save your own document

1. Choose + New File in the sidebar, or File → Open Markdown… to import a document. You can also drop in `.md`, `.markdown`, or `.txt` files.
2. Double-click an ordinary document's name to rename it. It autosaves about 1.2 seconds after typing stops; **⌘S** saves immediately.
3. Use File → Link Storage Folder… for folder sync, or Export Full Backup (.json) for all ordinary documents and settings. **⇧⌘S** exports one Markdown document.

An imported Markdown document does not automatically write changes back to the original disk file. If images are missing, use Choose image folder to repair… in the image notice and select the folder containing the originals; a Markdown file does not necessarily contain its image files.

## Step 4: choose a writing mode and output

### Ordinary notes and articles

Write directly in Mode → Markdown Mode. Choose GitHub, Night, Sepia, Blackout, or Blackout Game from Theme. Appearance and document mode are separate choices.

### Taiwan Thesis

1. Open the Chinese or English thesis template in the sidebar and choose **New Document from This Template**.
2. Choose a digital or print variant under Mode → Taiwan Thesis Chinese / Taiwan Thesis English.
3. Edit the cover, abstract, and body. The **Thesis** toolbar forms insert covers, contents, citations, and other material.
4. Use File → Export PDF (vector / searchable) for ordinary documents; for long documents, consider batches below.

**Large-file batch export:** choose File → Export PDF in batches (recommended for large files). Prepare **100, 50, 25, or 10 pages per batch; the default is 50**. Prepare the batch, open the print dialog, and choose Save as PDF and All pages. The default filename includes a range such as Pages 51 to 100. After both print and save dialogs close, check that the file was saved, then choose Batch saved; select next. The app clears the batch before enabling the next one. Each PDF is separate and must be merged yourself. See section 12 of the User Manual for the complete procedure.

### REVTeX 4.2 journal manuscript

1. Open International Journal Paper Template and choose **New Document from This Template**.
2. Enter Mode → International Journal REVTeX 4.2. Write Markdown on the left and view the TeX-compiled PDF on the right.
3. Follow the panel's instructions to load the **Engine Pack**. Use Layout settings on the left to choose the society, journal, and manuscript layout. Each manuscript keeps its own settings.
4. When compilation finishes, choose **Download PDF** on the right. Use File → Export REVTeX Project (.zip)… to deliver LaTeX source. This mode uses its TeX PDF, not batch printing.

## Common entry points

| Task | Menu or shortcut |
| --- | --- |
| Switch documents quickly | ⌘P |
| Find in this document / search all documents | ⌘F / ⇧⌘F |
| Toggle full Markdown source | ⌘/ |
| Save / export one Markdown document | ⌘S / ⇧⌘S |
| Preferences | ⌘, |
| Full instructions and shortcuts | User Manual in the sidebar; Ekdeta → Markdown & Shortcut Reference |
| Check the current version and release changes | Status bar at the bottom; Ekdeta → Version Info |
| Read architecture and maintenance notes | Dev Notes in the sidebar |

The table uses macOS keys. Switch platforms in the shortcut reference for Windows/Linux combinations.
