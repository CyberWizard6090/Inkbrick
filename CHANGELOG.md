# Changelog

All notable changes to the `@inkbrick/*` packages. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## Unreleased

### Added

- Table of contents (`docs/toc.md`): `block:toc` lists the headings of the document as nested links and stays current as
  the document changes; click takes the caret to the heading, a small button picks the depth (`H1`…`H1–H6`). Opt-in:
  `tocBlocks` from `@inkbrick/react` / `@inkbrick/engine`, `tocBlockSchemas` from `@inkbrick/document`; `useHeadings`
  for custom renderings. `toHtml`, `toMarkdown` and `toPlainText` write it as a nested list of headings.
- Markdown while typing (`docs/slash-menu.md`): `**bold**`, `__bold__`, `*italic*`, `_italic_`, `~~strike~~`, `` `code` `` and
  `[text](url)` turn into formatting when the closing character is typed (one undo step; text typed right after is plain).
  New block forms: `[x] `, `[ ] ` (also inside a bullet), `1) `, `*** `, `___ ` and a language after the fence (` ```js `).
  `replaceText` takes `plain: true` to insert text without inheriting the neighbour's formatting.
- Tables, engine part (`docs/tables.md`): `block:table` → `block:table-row` → `block:table-cell`, where a cell is a
  text block. Opt-in: `new Editor({ blocks: tableBlocks })`. Commands `insertTableRow`, `deleteTableRow`,
  `moveTableRow`, `insertTableColumn`, `deleteTableColumn`, `moveTableColumn`, `setTableColumnWidth`; helpers
  `locateTableCell`, `tableCellAt`, `tableSize`. `validateSnapshot` checks that a table is rectangular and
  `repairSnapshot` pads short rows.
- Tables in `@inkbrick/react`: `tableBlocks` (pass it to both `new Editor({ blocks })` and `<EditorProvider blocks>`)
  renders a real `<table>`, adds the «Table» slash item, and binds Tab / Shift+Tab to the next and previous cell; Tab
  in the last cell adds a row. Rows and cells have no block handle of their own.
- Table clipboard and export (`docs/tables.md`). Copying a selection that touches a table puts a `<table>`, tab-separated
  text (RFC 4180 quoting, readable by Excel and Google Sheets) and the exact fragment on the clipboard; pasting HTML tables
  from Excel, Google Sheets, Word and the web (colspan and rowspan laid out on the grid) or tab-separated text makes a table,
  and a table pasted into a table fills its cells from the caret, adding rows and columns. A table over 2000 cells or 50 columns,
  and any table in an editor without `tableBlocks`, is pasted as rows of text. `toHtml`, `toMarkdown` and `toPlainText` write
  tables (`<table>`, GFM, tab-separated). New: `tableFragment(rows, options)` and `readTable`, `parseDelimited` and
  `serializeDelimited`.
- Standalone table editor (`docs/tables.md`): `<TableEditor rows onChange />` in `@inkbrick/react` is a document with one
  pinned table: no block handle, block drag or slash menu, and the table cannot be deleted, converted or left. Without
  React: `createTableEditor(options)`, `tableValue(editor)` and `tableIdOf(editor)` in `@inkbrick/engine`. New
  `editor.pin(blockId)` makes any block undeletable: a command that would remove, convert or move it is rolled back whole.
- `<TableEditor changeDelay>` debounces `onChange` (flushed on unmount), so the value is built once per pause instead of on every key.
- Right-click menu in a table cell gets row and column items (insert above/below/left/right, delete). New block hook:
  `defineBlock({ contextMenu(context) })` adds items under the standard ones; `ContextMenuItem.separatorBefore`.
- Table controls in `@inkbrick/react`: strips at the row and column under the mouse (or the caret) open a menu (insert,
  move, header row, delete; align column, automatic width), «+» buttons add a column or a row, and dragging a column border
  resizes it with a live preview (arrow keys on a focused border, double click for automatic width). The menus are the
  `BlockMenu` slot, each action is one undo step, and the controls are not part of the editable root. Strings for `en`
  and `ru`.
- `defineBlock({ keymap })`: key bindings of a block that need the selection and the DOM (`KeymapContext`).
- A slash item contributed by a block is translated when the dictionary has `slash.item.<id>.*` strings.
- `BlockSchema`: `isolating` (a block general commands never delete, merge, move or duplicate; deleting a selection
  clears its text, pasting into it inserts plain lines), `scaffold` (initial children of a block the user creates),
  `validate` and `repair` (subtree rules for `validateSnapshot` and `repairSnapshot`).

- `images.rehost`: re-host images from other servers when HTML is pasted, so pasted tracking pixels never reach the
  reader's browser and no IP leaks.
- Code block: collapse with an animated height (`collapsed` prop) and an optional caption (`caption` prop, exported as
  `<figure>`/`<figcaption>` in HTML and an italic line in Markdown).
- Image picker: a drop zone with an upload button; a file dropped on it fills that block.
- A click beside the text — in the left gutter, past the end of a line, between blocks or, with
  `data-inkbrick-surface` on an ancestor, anywhere around the document — puts the caret on the line at that height:
  at the start of that visual line on the left, at its end on the right; below the last block, at its end. Dragging
  from the margin selects text, Shift+click extends the selection.
- Context menu (right click): the formatting buttons (the same `Toolbar` with `placement: 'inline'`) and Cut, Copy,
  Paste, Select all. Paste reads the clipboard through the Clipboard API and goes through the regular paste pipeline.
  Custom view — `slots.ContextMenu`; `null` keeps the browser menu.
- `EditorProvider` `formatting` option: `'context-menu'` (default), `'toolbar'` or `'both'`.

### Changed

- Bundle size budgets raised: `@inkbrick/react` from 64 KB to 70 KB, `@inkbrick/engine` from 16 KB to 18 KB.
- `sanitizeFragment` refuses the whole fragment when its block budget runs out inside a nested block instead of silently
  cutting the nested blocks off.
- Pasting HTML tables into an editor without `tableBlocks` is unchanged (a paragraph per row, cells separated by tabs);
  `htmlToFragment` itself now returns a table block, and the paste command turns it into paragraphs there.

- **Breaking:** formatting moved from the floating toolbar to the context menu by default: on desktop many browsers
  (Yandex Browser, Edge) draw their own popup over a selection and it covered the toolbar. After a touch the
  toolbar still appears, and Ctrl/Cmd+K still opens the link field next to the selection. `formatting="toolbar"`
  restores the previous behaviour.

- **Breaking:** `serializeDocument(document, schema)` requires the schema registry. Without it the snapshot had no `schemaVersions`, and
  props of a block whose schema version later increased were migrated twice on load. Pass `editor.schema` or use the
  new `editor.serialize()`.
- Snapshots carry a `version` (the format of the snapshot itself, currently `1`); `validateSnapshot` rejects a newer one.
  Snapshots without `version` still load.
- The code language and the image width use a styled dropdown (`data-inkbrick-ui="select"`) with keyboard
  navigation instead of the native `<select>`.
- The replace-image button uses a cleaner icon (`refresh-cw`).
- The block handle («+» and the grip) sits inside the document: the editor root has equal paddings on both sides
  (`--inkbrick-gutter`, 56px; none below 640px) instead of relying on the page margin, and the handle lives in the left
  one. The handle is no longer clipped
  by a container with `overflow: hidden` and never leaves the document's left edge.

### Fixed

- A click beside the text of blocks standing side by side (table cells) puts the caret into the nearest one, not the
  first one on that line.

- Changing a block's type no longer leaves children the new type does not allow: `BlockEngine.morph` lifts them out
  right after the block. Enter in an empty list item with nested items used to turn it into a paragraph that still
  held the nested list (`validateSnapshot`: `block:list cannot be placed inside block:paragraph`). Backspace at the
  start of such an item now lifts the nested items too, instead of keeping them inside the paragraph.
- Backspace in an empty first block removes it when a text block follows, and moves the caret there.

## 0.1.0-alpha.0 — 2026-11-01

First public alpha, published under the `alpha` dist-tag: `npm install @inkbrick/react@alpha`. The API may change
between alpha releases.

### Features

- Block editor on a single `contenteditable` root: paragraphs, headings, lists (bullet, ordered, tasks, nesting),
  quotes, code with syntax highlighting, callouts, dividers, images, block and inline formulas.
- Text formats, links, colors, highlight, alignment; floating toolbar, slash menu, block handles and menu,
  drag and drop (mouse and touch), keyboard shortcuts (`keymap`).
- Transactions with undo/redo, read-only mode, clipboard (plain text, HTML, exact Inkbrick fragments; Word and
  Google Docs markup), export to Markdown, HTML and text.
- Schemas with roles, nesting rules, versions and migrations; `repairSnapshot` for damaged documents.
- Customization: `presentation`, `components`, `slots`, custom blocks with controllers (`defineBlock`),
  data-attribute styling contract with themes, i18n (en, ru, custom dictionaries).
- Virtual renderer for large documents; mobile input (IME) support.

### Added

- Coverage thresholds (`pnpm test:coverage`), bundle size budget (`pnpm size`), scaling tests against quadratic
  algorithms, end-to-end tests in Firefox and WebKit.
- `LICENSE`, `SECURITY.md` (threat model, CSP), `CONTRIBUTING.md`, English README, API reference (`pnpm docs:api`).

### Changed

- The project is renamed from Qubi to Inkbrick: packages `@inkbrick/*`, `data-inkbrick-*` attributes, `--inkbrick-*` design tokens and the `application/x-inkbrick-fragment` clipboard type.
- The formula symbol palette and the MathML styles load lazily with the first formula: the eager bundle of
  `@inkbrick/react` is ~4 KB (gzip) smaller.
- Ctrl/Alt+Backspace keeps the space before the deleted word, like browsers and word processors.
- Toolchain: Vite 7, Vitest 4, ESLint 10, Playwright 1.64; `zod` ≥ 4.6.7 (security fix).

### Fixed

- Backspace at the start and Delete at the end of a block did nothing in Safari (WebKit sends no `beforeinput`
  there).
- Pasting deeply nested HTML was slow (the block-detection scan walked the whole subtree at every level).
