# Changelog

All notable changes to the `@inkbrick/*` packages. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## Unreleased

### Added

- Block background (`docs/block-background.md`): `background` on paragraphs, headings, quotes, list items, callouts and toggles (`BLOCK_BACKGROUNDS`, `getBlockBackground`), a row of colours in the block menu (`props.background` of `slots.BlockMenu`), kept when the block is turned into another text type, exported to HTML as an inline style. Pale shades of the theme highlight colours keep the text readable in light and dark themes; the text stays where it was. `setBlockProps` with `undefined` now removes the property.

- Table views (`docs/tables.md`): several views per table (`views` in the table props, command `setTableViews`), each with its own hidden columns, filters and a display sort that does not reorder the data. A bar over the table switches, adds, renames and deletes views and shows what is hidden; «Show all» clears the open view in one undo step. Which view is open is per reader and not part of the document. Filter conditions depend on the column type (contains, equals, greater/less for numbers and dates, empty, checked…); the header is never filtered; Tab skips hidden cells; data, copy and export are untouched. Not available with merged cells.
- Table column properties (`docs/tables.md`): new column types `checkbox`, `select`, `multiselect`, `url`, `email`, `phone` next to `text`, `number`, `date`; the value is plain text in the cell (copy, export, search, undo keep working). A «Column properties…» dialog in the column menu sets the type and, for select types, the options with colours (`columnOptions` in the table props, command `setTableColumnOptions`); options move with their columns and copy with the table. Select cells show coloured chips with a picker, checkbox cells a checkbox, link types an open link and a warning for invalid values; the header row stays text. Sorting checkbox columns: unchecked before checked.

- Command palette (`docs/command-palette.md`): `<CommandPalette commands={…} />` and `commandPalette.keymap` (Ctrl/Cmd+Shift+P; Ctrl+P is the browser's print). Built-in commands: undo and redo, formatting of the selection, «Turn into» and «Insert» for every slash-menu item that fits the current block. The app adds its own (`PaletteCommand`: `id`, `title`, `group`, `keywords`, `shortcut`, `when`, `run`), `findReplace.commands` adds Find and Replace; `useCommandPalette()` opens it from code. The selection at opening is restored before a command runs. Combobox ARIA, English and Russian.

- Tags (`docs/tags.md`): `<TagHighlights onTagClick suggestions suggest />` highlights `#tag` (letters of any alphabet, digits, `_`, `-`, nested
  `#a/b`; not `#123`, not inside code, links or formulas) with the CSS Custom Highlight API, offers the tags of the document and of the
  application while `#` is typed (arrows, Enter or Tab, Esc) and reports Ctrl/Cmd+click to the application. A tag stays plain text, so the
  document model, export and paste do not change; opt-in and outside the core bundle. `collectTags`, `findTags`, `blockTags`.
- List item folding (`docs/list-folding.md`): an arrow on a list item with nested blocks hides and shows them, Ctrl/Cmd+Enter does the same;
  `collapsed` is stored in the document and is undoable. Opt-in: `<EditorProvider {...listFolding}>` (or `{...folding}` for headings and list
  items); `FoldableListBlock`, `ListBlock` gets the `ListItem` view with an optional `fold`. A caret inside the hidden blocks moves to the item,
  Tab into a collapsed item expands it first, readers can fold in read-only mode without changing the document.
- Word and character counter (`docs/word-count.md`): `<WordCount />` shows words and characters of the document and, with a selection,
  of the selection against the whole («Words: 12 of 120»); the tooltip has the characters without spaces. Opt-in, `code` leaves code
  blocks out, `delay` debounces the recount. `documentStats`, `selectionStats`, `countWords`, `countCharacters`, `useWordCount`. Words are
  letters and digits (`don't`, `stop-gap`, `3.14` are one word), `Intl.Segmenter` finds them in Chinese, Japanese and Thai; formulas are
  not counted. The sandbox shows the counter on both pages.
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

- Spell check (`docs/spellcheck.md`): `EditorProvider` option `spellcheck` (`true` or `{ lang }`, off by default) turns on the browser's spell checker for the document; the root gets `lang` (the interface language unless another is given). Code blocks, formulas, code spans, links and the cells of url, email and phone columns are excluded; off in read-only mode. The sandbox turns it on (`?spellcheck=off`, a switch in Settings). The root had `spellcheck="false"` before; that is still what you get without the option.

- Picking and moving several blocks (`docs/block-picking.md`): `Esc` picks the block under the caret (a text range picks all its blocks), `Shift+↑/↓` extends, a frame dragged in the gutter beside the document picks the blocks it touches. On the picked run: `Delete` removes, `Ctrl/Cmd+D` duplicates, `Ctrl/Cmd+Shift+↑/↓` moves (also for the block under the caret), `Ctrl/Cmd+C/X` copy and cut whole blocks, dragging a handle moves the whole run in one gesture, and the block menu's Duplicate, Up, Down and Delete act on the run. Every action is one undo step. New: `view.picked`, `pickKeymap`, the `data-picked` and `data-picking` attributes. The `Esc` key now picks the block when nothing else uses it (menus, panels and table cell selection keep theirs).
- The engine size budget is 22 KB (was 19).

- Footnotes (`docs/footnotes.md`): `footnoteBlocks` (opt-in, like the table of contents) with a reference object in the text (`footnote` inline attribute) and a `block:footnote` text block at the end of the note. `/footnote`, the command palette or `insertFootnote()` add both in one undo step; numbers are computed from the order of the references, so they never go stale; click the number to jump to the text, «↩» to jump back; a footnote without a reference shows «?». Exported to HTML (`<sup>`, `<aside id="fn-…">`), Markdown (`[^1]`, `[^1]: …`) and plain text. New: `SlashMenuItem.run`/`canRun` (an item that runs an action instead of turning the block) and `ReactBlockDefinition.slashActions`. A block that ends with an object (formula or footnote) now gets a trailing `<br>` so the caret can be placed after it.


### Changed

- Adding a language to `@inkbrick/locales` is mechanical: a new `src/<code>.ts` plus one line in `localeLoaders`. The package `exports` (`./*`) and the `tsup` entries use a mask, and `pnpm check:i18n` and the package tests walk every language file (same keys and placeholders as English, a loader for every file).
- Dictionaries moved to the new package `@inkbrick/locales` (`en`, the types `MessageKey`, `Messages`, `PartialMessages`, and the Russian
  dictionary as `@inkbrick/locales/ru`); `@inkbrick/react` depends on it and still exports `en`, `ru` and the types. English is always bundled
  (the other languages fall back to it), Russian is a separate chunk loaded when `locale="ru"` asks for it, so the core of
  `@inkbrick/react` is about 3.8 KB gzip lighter (64.5 → 60.7 KB). `preloadLocale(code)` and `isLocaleLoaded(code)` are new; `getLocales()`
  lists the languages that load on demand too. Until a language arrives the interface is in English, call `preloadLocale` before the first
  render to avoid that frame (the sandbox does). A dictionary registered with `registerLocale` is never overwritten by a loaded one.
- Code and formula blocks load as separate chunks (`LazyCodeBlock`, `LazyFormulaBlock`, like the image block); `CodeBlock` and `FormulaBlock` are still exported
  for your own component registries. The chunks are requested right after an editable editor mounts (`preloadSoon`), so a block that
  appears on Enter or `/` normally takes input at once; until then a placeholder stands in (the code as plain text for a code block). The core of
  `@inkbrick/react` is about 3.3 KB gzip lighter (64.5 → 61.2 KB). Total transfer is the same: the chunks leave the initial bundle, they do not wait for the first use. A block created within the first moments after mount, before its chunk has arrived, shows the placeholder and cannot take input until it does.
- Process: work accumulates in `develop` (pull requests are squashed into it) and goes to `master` in one release pull request
  merged with a merge commit; CI also runs on pushes to `develop` (`CONTRIBUTING.md`, «Branching»).
- Repository checks (`scripts/`): `pnpm check:i18n` verifies the dictionaries (same keys in en and ru, `{placeholders}`, no
  empty or untranslated strings, the German example is a subset, editor and sandbox keys do not overlap); a boundary test and
  ESLint keep the library from importing the sandbox and the sandbox from reaching into package internals. «Where things live»
  in `CONTRIBUTING.md` says what belongs to the library and what to the sandbox.
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

### Fixed

- Enter in a list item no longer copies `collapsed` to the new item: the new one starts expanded and the nested blocks stay with the first part.
- Virtual renderer: the nested blocks of a closed toggle (and of a collapsed list item) are no longer counted in the height estimate, so they leave
  no empty room in the scroll area.
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
