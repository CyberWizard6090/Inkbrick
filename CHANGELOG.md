# Changelog

All notable changes to the `@inkbrick/*` packages up to the introduction of [Changesets](https://github.com/changesets/changesets).
From then on every package has its own `CHANGELOG.md`, written by `pnpm version-packages` (see `CONTRIBUTING.md`,
_Versions and releases_).

The older history follows. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## Unreleased

What `develop` adds to `master`, as it stands now: a feature that was added and changed several times in `develop` is
described once, in its final form; work that was added and removed again in `develop` (table column properties, filters
and views) is not listed. The entries `master` already has follow under _Already in `master`_.

### Breaking changes

- **`@inkbrick/engine` exports an explicit, smaller API** instead of everything (`export *`): the editor, intents and their
  results, custom blocks and commands, clipboard fragments, the optional block sets and the table API. Single command
  objects (`InsertTextCommand`, `tableCommands`, …), `builtinCommands`, merged-cell and sorting helpers, `clampTableRange`,
  `readTable`, `columnsCommands`, `collapseEmptyColumns` and the like moved to `@inkbrick/engine/internal`, which is not a
  public contract. `Engine`, `Dispatcher`, `BlockEngine` and `InlineEngine` are exported as types only. The exported names of
  every package entry are checked against a snapshot (`scripts/__tests__/public-api.test.ts`).
- **Pluggable features; columns left the core.** `new Editor({ features: [tableFeature, columnsFeature, …] })`;
  `moveBlockToSide` and the removal of emptied columns come with `columnsFeature`. An editor built from its own registry
  (`new Editor({ schema, controllers })` without `blocks`) has to pass the features (`features: [columnsFeature]`), otherwise
  moving a block to the side is not available. With `blocks` (and the block sets of `@inkbrick/react`) nothing changes.
- **`BlockSchema.version` is required** — an integer from 1; `registerBlock` and `replaceBlock` throw without it. Every
  built-in block declares `version: 1`; add it to your own schemas.
- **New default colours** in `@inkbrick/styles` (light and dark): text, backgrounds, strokes, status colours, the text and
  highlight palette, inline code (`--inkbrick-inline-code-fg|bg`, no border) and the text selection
  (`--inkbrick-selection-bg`). Only colours change; an application without its own tokens looks different. Text keeps at
  least 4.5:1 contrast.

### Added

#### Engine

- **Selection API** (`docs/selection.md`): `editor.selection` is the selection as data, with or without a UI — text with
  direction, whole blocks or a rectangle of table cells; `get`, `range`, `isCollapsed`, `set`, `caret`, `select`,
  `selectBlocks`, `selectCells`, `clear`, `subscribe(listener(selection, origin))`. Points in missing blocks are refused,
  offsets clamped, and the selection is checked after every edit; commands, undo and redo move the caret to the point they
  return. `@inkbrick/react` keeps it in sync with the screen.
- **Document normalizer** (`docs/schema-rules.md`): invariants that depend on neighbours are `NormalizeRule`s run after
  every command on the changed blocks, in the same undo step, until the document settles. Built in: an emptied container
  with `fillWhenEmpty` gets a block, a subtree that fails its schema check is repaired (`BlockSchema.validate` / `repair`:
  a table without rows, short rows). Features add rules (`normalizers`); `editor.normalize()` checks a document from outside.
- **Collaboration** (`docs/collaboration.md`): `onPatch(editor, listener)` reports local edits, undo and redo as patches
  (the changed blocks whole, `null` for deleted); `applyPatch(editor, patch)` applies a remote one outside the local undo
  history, checks shape, tree and props (`PatchError`), merges what the author did not see (concurrent inserts into one
  parent, moves, deletions, children that no longer fit) and returns the result for a server to broadcast. A seeded test
  runs three editors and a server with random edits and delivery order and checks that all documents converge. The store
  reports `ChangeInfo` (`source`, `origin`) to `subscribeChanges`.
- **Typed commands**: `CommandMap` describes every built-in command (payload and result); `dispatch`, `execute` and `can`
  are typed by it, and your own commands join it with `declare module`. No `any` in the public types.
- **Commands over a group of blocks**, each one edit and one undo step: `delete-blocks` (returns where the caret goes),
  `duplicateBlocks`, `moveBlocks`, `convertBlocks`, `setBlockBackgrounds`. Table commands for cell ranges:
  `formatTableCells`, `setTableCellsColor`, `clearTableCellsFormat`, `alignTableCells`, `setTableCellsBackground`,
  `setTableCellsBorders`, `resetTableColumnWidths`.
- **Extension points**: `EditorFeature` (`defineFeature`) with blocks, commands, guards, `afterCommand` hooks, normalizers
  and `setup`; `dispatcher.addGuard` and `addAfterCommand`.
- Word count and tags without a UI: `countWords`, `countCharacters`, `documentStats`, `selectionStats`, `statsOf`,
  `collectTags`, `findTags`, `blockTags` in `@inkbrick/engine` (also re-exported by `@inkbrick/react`).
- **Markdown import**: `fromMarkdown(text, { schema })` in `@inkbrick/document/markdown` — the inverse of `toMarkdown`,
  with size limits, safe links and images and no raw HTML.

#### Editing

- **Block picking** (`docs/block-picking.md`): Esc picks the block under the caret, Shift+↑/↓ extends, a frame in the
  margin picks the blocks it crosses (with autoscroll), Shift+click picks a range, Ctrl/Cmd+click adds or removes a block,
  Ctrl/Cmd+A picks the text of the block, then all blocks. On the picked blocks: Delete, Ctrl/Cmd+D duplicate,
  Ctrl/Cmd+Shift+↑/↓ move, copy and cut, drag by any handle, «Turn into» and «Background» from the block menu and the
  palette — each one undo step. `view.picked`, `pickKeymap`, `data-picked`, token `--inkbrick-picked-bg`.
- **Block background** (`docs/block-background.md`): a palette name or a custom colour on paragraphs, headings, quotes,
  list items, callouts and toggles; kept when the block changes type, exported to HTML.
- **Footnotes** (`docs/footnotes.md`): `footnoteBlocks`, a reference in the text and a footnote block at the end;
  numbers follow the order of the references; exported to HTML, Markdown and text.
- **Tags** (`docs/tags.md`): `<TagHighlights />` highlights `#tag`, suggests tags while typing and reports Ctrl/Cmd+click.
- **Word and character counter** (`docs/word-count.md`): `<WordCount />`, `useWordCount`.
- **Command palette** (`docs/command-palette.md`): `<CommandPalette />`, Ctrl/Cmd+Shift+P, built-in and your own commands.
- **List item folding** (`docs/list-folding.md`): an arrow or Ctrl/Cmd+Enter hides nested blocks; `collapsed` is stored.
- **Spell check** (`docs/spellcheck.md`): the `spellcheck` option turns the browser's checker on; with
  `spellcheck.checker` the context menu offers up to five corrections and «Add to dictionary». New package
  `@inkbrick/spellcheck`: Hunspell dictionaries (`nspell`) in a Web Worker, loaded per language, a personal dictionary.
- **Slash menu**: items that run an action (`SlashMenuItem.run` / `canRun`, `ReactBlockDefinition.slashActions`) and items
  translated from the app dictionary (`titleKey`, `descriptionKey`, `keywordsKey`, typed `AppMessages`).

#### Tables

- **Formatting of selected cells** in one undo step: bold, italic, underline, strike, code (and their shortcuts), text
  colour and highlight, alignment, clear formatting.
- **Table design**: a gallery of eight styles with a live preview (`tableStyle`); header column, striped rows, borders on
  or off; cell backgrounds in a saturated palette with readable text; borders per side — placement, width, style (solid,
  dashed, dotted) and colour, also with transparency. All of it travels with copied tables and is exported to HTML.
- **Menus**: the cell menu has groups («Rows», «Columns», «Table», «Design») and nested panels («Cell background», «Cell
  borders», «Table style»); table properties are switches; with several cells selected, row and column items act on all
  of them; «Column wider» / «Column narrower» change the width from the keyboard.
- **Handles**: pills on the row and column under the pointer and round markers on the boundaries that insert a row or a
  column there; they follow a table that scrolls inside its block.

#### Images

- **Image block toolbar**: alignment, caption on or off, crop, view full size, download, alt text, replace, reset crop;
  the width is changed with handles on the picture's sides (mouse, touch or arrows).
- **Cropping** in a full-screen window with shapes (free, circle, square, common ratios): the crop is saved as a file and
  the original is kept (`originalSrc`, `crop*`, `aspect`); it opens right after an image is added (`images.cropOnAdd`).
- **Viewer**: previous and next image, zoom, panning, download.
- The picker has «Upload» and «Link» tabs; an image dragged in from outside shows the insertion line.
- New package **`@inkbrick/dom`** — UI parts in plain DOM, without a framework: `@inkbrick/dom/image-tools` (crop window,
  viewer, geometry) and `@inkbrick/dom/color-picker`.

#### Colours

- **One palette** for text colour, highlight, block background, cell background and border colour (`ColorSwatches`):
  «×» first, then the palette, then a «+ Custom color…» button.
- **Custom colours with transparency**: a picker with a saturation area, hue and opacity sliders and HEX / RGB / HSB
  fields opens beside the menu (inside it on a phone); colours are stored as `#rrggbb` or `#rrggbbaa`.
- Five new palette names: `lime`, `teal`, `cyan`, `indigo`, `magenta`.

#### Phones

- **Every floating window is a bottom sheet** on a touch screen up to 720 px wide: context and block menus (with nested
  sheets), the slash menu, tag suggestions, the formula editor, find and replace, the command palette, selects. Sheets stand
  above the on-screen keyboard; the formatting toolbar is docked at the bottom.
- **Tables by touch**: a long press selects a cell, dragging or the corner knob extends the selection, a long hold opens
  the cell menu; «Column width…» opens a slider at the bottom of the screen. Touch targets are at least 44 px.

#### Interface

- **Animations**: menus, the handle and popups appear and disappear smoothly (`Presence`), toggles, list items and folded
  sections collapse with an animation; tokens `--inkbrick-appear-duration`, `--inkbrick-disappear-duration`,
  `--inkbrick-collapse-duration`, `--inkbrick-sheet-duration`; off with `prefers-reduced-motion`.
- **Tooltips**: one styled bubble in the theme's colours for every button of the editor instead of the browser's `title`.
- **Layers**: tokens `--inkbrick-z-panel`, `--inkbrick-z-dialog`, `--inkbrick-z-tooltip`.

#### Packages and tooling

- **`@inkbrick/locales`**: the dictionaries in their own package; English is bundled, Russian loads on demand
  (`preloadLocale`, `isLocaleLoaded`); a language is one file.
- **Versioning with Changesets** (`CONTRIBUTING.md`, _Versions and releases_): `pnpm changeset`, `pnpm version-packages`,
  one shared version for all `@inkbrick/*` packages in `alpha` pre-release mode.
- A guide for custom blocks (`docs/custom-blocks.md`), checked by a test; a README for every package.
- Repository checks: `pnpm check:i18n`, the library/sandbox boundary, `pnpm size:dist` (budgets measured on the built
  packages), fuzz tests of undo/redo and of concurrent editing, load tests.

### Changed

- **Published packages are built one module per file** (`scripts/build-modules.mjs`), so an application drops unused code
  as it does from the sources; an app built from npm loads 95 KB gzip up front instead of 155 KB.
- **Lazy chunks**: the block handle and menu, the pasted-HTML parser, the code block toolbar and highlighter, the Russian
  dictionary, the image tools and the colour picker load separately. Size budgets: engine 22, app 96, react 70 KB gzip.
- **Large documents** (50 000 blocks, CPU slowed 4×): typing 25 → 11 ms per key, Enter 71 → 36 ms, loading 2.3 → 1.4 s;
  footnotes, the outline and the picking frame no longer walk the whole document on every key or move.
- **Inline code takes no formatting except a link**, and **code blocks take no formatting** (`plainText` on a schema):
  formatting is dropped from them, also in documents opened from before.
- **Escape picks the block** under the caret when nothing else uses the key.
- **Blocks share one look**: the same text edges, margins and radius for tables, code, callouts, images and coloured
  blocks; a table is no longer indented. Columns are 72 px apart so the next column's handle fits between them.
- **Tables fit the page**: column widths wider than the page are shown scaled; resizing never leaves a scrollbar.
- `setBlockProps` with `undefined` removes the property.
- A dictionary passed to the provider adds to the connected language instead of replacing it.
- **Store**: every change is atomic — a change that throws halfway leaves the document as it was; `Document` refuses a
  dangling child id and deleting the root.
- **Process**: work goes into `develop` by pull requests and reaches `master` in one release pull request.

### Fixed

- **Published packages**: the type declarations of `@inkbrick/document` did not parse (`infer<…>`), so TypeScript projects
  using the package from npm failed.
- **Performance**: deleting thousands of blocks (a range or a selection) and undoing it is no longer quadratic (2–3 s →
  ~40 ms for 20 000 blocks); typing in a large table no longer restyles every cell (~180 ms → a few ms per key); hundreds
  of images no longer stop rendering with «Maximum update depth exceeded».
- **Tables**: Tab, Shift+Tab and the arrows from a selected range; arrows in multi-line and merged cells; a click in the
  empty part of a merged cell; text of a merge lost when its row or column was deleted; pasting into a hidden cell of a
  merge or a table into a merged range; TSV paste larger than the limits; a `rowspan` across `thead` and `tbody` in HTML;
  sorting dates and numbers with their own separators; the header role for screen readers; handles near the top edge of
  the window and next to merged cells; the caret after undoing a row added with Tab; menus that stayed open on scroll.
- **Folding**: Backspace or Delete next to a folded section unfolds it instead of merging into hidden text; the nested
  blocks of a closed toggle no longer take room in the virtual renderer.
- **Columns**: the handle of the second and later columns can be grabbed; a block moved out of a column by any move closes
  the gap.
- **Editing**: dragging a block keeps the caret where it was; a command that changes nothing leaves no empty undo step;
  the caret in a code block no longer jumps when the highlighter arrives; two editors on one page keep their own find and
  tag highlights.
- **Menus**: a menu scrolled to its end keeps the wheel; the block menu stays inside the window; the context menu keeps
  its width when a panel opens; the block handle stays with its block while the pointer travels to it.
- **Styles**: rules with a pseudo-element inside `:where()` were dropped by browsers (the column resize line, the divider
  between columns).
- **Security**: addresses starting with `/\` are rejected for links and images; a block id `__proto__` in a snapshot no
  longer replaces the prototype of the block map.

### Removed

- The «+» buttons on the right and at the bottom of a table: rows and columns are inserted with the markers on the
  boundaries (and from the menus).
- The image width list (25/50/75/100 %): the width is changed with the side handles.

### Already in `master`

The changes since `0.1.0-alpha.0` that `master` already has.

#### Added

- Block groups in the slash menu (`docs/slash-menu.md`): items stand under the headings «Basic blocks», «Media» and «Advanced» while
  the query is empty (the table is a basic block). `SlashMenuItem.group` / `BlockSlashItem.group` take `basic`, `media`,
  `advanced` or your own name (title from `slash.group.<name>`); items without a group come last under «Other». The turn-into list of
  the block menu follows the same order.
- Turn into in the formatting toolbar and in the context menu (`docs/toolbar-and-blocks.md`): a button with the type of the block
  opens the list of types it can become (only valid ones; hidden when there are none or the selection spans several blocks). One
  undo step, the selection stays. `ToolbarProps.turnInto` for a custom toolbar.
- Table of contents panel (`docs/toc.md`): `<TocPanel side maxLevel />` shows the headings beside the document, marks the current
  section while scrolling and goes to a heading on click. Not shown unless you place it; `side` is `'left'` or `'right'`; hidden
  in windows narrower than 1100 px. The `block:toc` block stays.
- Find and replace (`docs/find-replace.md`): Ctrl/Cmd+F and Ctrl/Cmd+H open a panel that finds text in all blocks, highlights the
  matches (CSS Custom Highlight API), walks through them with Enter / Shift+Enter, matches case or whole words, replaces the current
  match or all of them in one undo step. Opt-in: `findReplace.keymap` in the provider and `<FindReplacePanel />` next to the document.
  New exports `findMatches`, `replaceMatches`, `searchPattern`, `useFind`, `FindController`. Works with the virtual renderer.
- Columns by dragging (`docs/columns.md`): drag a block by its handle to the left or right edge of another block (the last 24 px of
  its row) and they stand side by side. A vertical line shows the drop; the target already in a column gets a new column next to
  it (up to six), a column that lost its last block disappears. New command `moveBlockToSide`, `BlockDragApi.moveToSide`,
  `BlockDropTarget.side`, `DragState.side`, `DropIndicatorProps.side`, `DropIndicatorRect.height`, type `DropSide`. Needs
  `columnsBlocks`; without them nothing changes.
- Size budget of `@inkbrick/engine` raised from 18 KB to 19 KB for the new command.
- Toggle block (`docs/toggle.md`): a line with an arrow and nested blocks that are shown only while it is open; `open` is stored
  in the document and is undoable. Opt-in: `toggleBlocks` from `@inkbrick/react` / `@inkbrick/engine`, `toggleBlockSchemas`
  from `@inkbrick/document`; slash item "Toggle". Enter at the end of an open toggle makes the first nested paragraph, Enter in an
  empty last nested paragraph leaves it. Exports as `<details>` in HTML and Markdown; a pasted `<details>` becomes a toggle.
- Columns (`docs/columns.md`): `block:columns` → `block:column` with ordinary blocks inside, two to six columns, slash items «2
  columns» and «3 columns», a draggable divider (or arrow keys), a toolbar to add and remove columns or turn them into plain
  blocks. Opt-in: `columnsBlocks` from `@inkbrick/react` / `@inkbrick/engine`, `columnsBlockSchemas` from `@inkbrick/document`.
  Commands `addColumn`, `removeColumn`, `setColumnRatios`, `unwrapColumns`. New `BlockSchema.fillWhenEmpty`: the block
  that appears when the last child is deleted (the note and the column use it).
- Heading folding (`docs/heading-folding.md`): an arrow on a heading hides everything up to the next heading of the same or a
  higher level; `collapsed` is stored in the document and is undoable. Opt-in: `<EditorProvider {...headingFolding}>`;
  `computeFolds`, `useFoldTracking`, `FoldableHeadingBlock`. Enter in a collapsed heading expands it first. Core: blocks hidden
  through `view.folds` are not rendered.
- Tables: merged cells (`docs/tables.md`). "Merge cells" and "Split cell" in the right-click menu, commands `mergeTableCells`
  and `splitTableCell`, `merges` in the table props. Rows and columns inserted or deleted inside a merge stretch or shrink it;
  moving and sorting are off while a table has merges. `colspan` and `rowspan` of pasted HTML tables stay merged, `toHtml`
  writes them. New exports `normalizeMerges`, `mergeAt`, `mergesAfterInsert`, `mergesAfterDelete`, `expandRangeToMerges`,
  `mergesWithin`, `mergesAfterKeeping`.
- Tables: column types (`text`, `number`, `date`) and sorting from the column menu (`docs/tables.md`). Commands
  `setTableColumnType` and `sortTableRows`; types follow their columns. New exports `parseNumber`, `parseDate`, `sortKey`,
  `sortedOrder`, `TABLE_COLUMN_TYPES`.
- Tables: cell selection (`docs/tables.md`). Drag across cells, Shift+click and Shift+arrows select a rectangle; "Select
  row" and "Select column" are in the row and column menus. Delete clears the cells, copy and cut put the selected cells on
  the clipboard as a table, paste starts at the top left cell. New in `@inkbrick/engine`: `tableRangeBetween`,
  `clampTableRange`, `tableRangeCells`, `tableRangeFragment`.
- Tables: keep the first row and the first column in view while scrolling (`freezeRow`, `freezeColumn`, items in the first row's
  and the first column's menus; `--inkbrick-table-frozen-height` limits the height). `createTableEditor` and `tableFragment`
  accept the same options. New `pin` icon.
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

#### Changed

- Sandbox: the large document (50,000 blocks) has six heading levels (part, section and four deeper levels), quotes and callouts besides paragraphs,
  lists and code, so folding hides from tens to a thousand blocks and the outline is nested.
- Sandbox: the table editor page has the tools of the document page — edit and read modes, data (sample, random, a large 100 × 12 table, ten more
  rows in one undo step, empty table), the debug panel, JSON export and import, theme and language. The page switch, the table page and the
  counter block are translated (en, ru); the switch keeps the chosen language.
- Page layout (temporary, `docs/styling.md`): the editor root fills its container and the text column is centred with the width
  `--inkbrick-page-width` (100% by default, so nothing changes until it is set). It is a stop-gap until the document has a page
  with its own size.
- Table columns: a border between columns moves width only between its two neighbours (the others keep their width), and only
  the right edge of the last column changes the width of the table. Once any column is resized, all columns get a width, so a table
  that has been resized has an explicit width per column; a double click on a border still sets that column back to automatic.
- Heading folding: the arrow stands after the heading text instead of before it, so folding headings start where paragraphs start.
- Sandbox: a switch between the editor and the table editor.
- Size budgets lowered to keep the win: `@inkbrick/react` 75 → 65 KB gzip, the whole editor app with zod 100 → 92 KB.
- Icons: only the 26 that blocks and the slash menu need at once stay in the main bundle; the rest (formatting, tables,
  columns, alignment…) are a separate chunk that `<Icon>` loads by itself and the editor preloads on mount (−0.8 KB gzip).
  `IconName` still lists every icon; `preloadIcons()` loads the rest at once.
- The floating toolbar, the slash menu, the block handle and its menu, the inline formula popover and the image block are
  separate chunks, loaded right after the editor mounts (the image block when the first image appears): the core of
  `@inkbrick/react` is 62.1 KB gzip instead of 70.6. New `preloadEditorUI()` loads them all at once, for apps that need
  them from the very first action and for tests.
- The built-in code highlighter is loaded as a separate chunk when the first code block appears (code shows uncoloured until
  then): `@inkbrick/react` loses 5.6 KB gzip at start. A custom `highlighter` and a direct `highlightCode` import stay
  synchronous.
- Packages are built with `charset: utf8`: Cyrillic and other non-ASCII strings ship as they are instead of `\uXXXX`
  escapes. `pnpm size` has a new case, «app: editor with zod» (budget 100 KB gzip), so the weight of dependencies is
  visible too.
- Built-in schemas import zod functions by name instead of the `z` namespace. An editor app that does not use `z` itself is
  65 KB gzip lighter (161.7 → 96.4 KB with zod bundled); the public `z` export of `@inkbrick/document` is unchanged.
  A lint rule keeps `import { z } from 'zod'` out of the packages.
- Tables: dragging the mouse from one cell to another now selects a rectangle of cells instead of a run of text in
  document order (see cell selection below). A selection that starts or ends in a cell from outside the table, or made with
  the keyboard, still works as before.
- Bundle size budget of `@inkbrick/react` raised from 70 KB to 75 KB gzip (tables, the table of contents, columns and heading
  folding grew the shared core).
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

#### Fixed

- Virtual renderer: the limit of the rendered window (`maxRendered`) counted the indexes of blocks hidden by folded headings, so after a few
  folded sections the next heading, which stood on the screen right behind them, was not drawn (an empty gap, later it vanished). The limit now
  counts only the blocks that are drawn.
- Heading folding with the virtual renderer (`renderer="virtual"`): blocks hidden by a folded heading still counted in the height estimate, so the
  spacer below kept their room and the document had an empty gap. They are now zero height and do not take a slot of the rendered window.
- Styles: the highlight rules of find and replace are wrapped in `:where()` like every other rule, which the styles contract test (and CI) requires.
- Virtual renderer: scrolling right after a click could unmount the block with the caret and lose the selection,
  because the pinned blocks were updated only on `selectionchange`; the scroll handler now reads the selection edges
  itself.
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
