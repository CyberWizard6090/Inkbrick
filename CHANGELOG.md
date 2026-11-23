# Changelog

All notable changes to the `@inkbrick/*` packages. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## Unreleased

### Changed

- Pluggable features: `new Editor({ features: [tableFeature, columnsFeature, tocFeature, toggleFeature, footnoteFeature] })`. An `EditorFeature` (`defineFeature`) brings its blocks, commands, `guards`, `afterCommand` hooks and a `setup(editor)` hook; a feature with the same name is installed once. A block definition can name the feature it needs (`BlockDefinition.feature`), so `new Editor({ blocks: columnsBlocks })` — and the block sets of `@inkbrick/react` — keep working unchanged. Columns left the core: `moveBlockToSide` and the removal of emptied columns now come with `columnsFeature` (before, every editor registered them). **Breaking** for an editor built from its own registry (`new Editor({ schema, controllers })` without `blocks`): pass the features too (`features: [columnsFeature]`, or `blocks.flatMap((b) => (b.feature ? [b.feature] : []))`), otherwise moving a block to the side is not available. Tables still share code with the core clipboard (pasting a fragment with a table, sanitizing it), since a fragment is a format of its own.

- The `Dispatcher` coordinates and no longer holds the editor's rules: commands live in a `CommandRegistry`; the general checks before every command (read-only, blocks of unknown type, text commands on blocks without text) are `CommandGuard` functions (`dispatcher/guards.ts`); the work after every command (removing emptied columns, the pinned-block check) is a list of `AfterCommand` hooks (`dispatcher/afterCommand.ts`); caret and merge data for the history are read in `dispatcher/history.ts`. `dispatcher.addGuard(guard)` and `dispatcher.addAfterCommand(hook)` add your own (each returns a function that removes it). Behaviour is unchanged.

- Typed commands: `CommandMap` (exported from `@inkbrick/engine`) describes every built-in command by name — its payload and its result — and `EditorIntent` is derived from it. `editor.dispatch(intent)` returns the result type of that command instead of `unknown` (plus `undefined` when the command did not run); `editor.execute(type, payload)` and `editor.can(type, payload)` check the payload of a known command and type the result. A command of your own is added to the map with `declare module '@inkbrick/engine' { interface CommandMap { … } }`; an undeclared name keeps the untyped call. Helpers `CommandName`, `CommandPayload<K>`, `CommandResult<K>`.
- No `any` in the public types of the packages (ESLint `no-explicit-any` is on for package sources). Lists of blocks with different props use named aliases: `AnyBlockDefinition`, `AnyBlockController`, `AnyBlockCommand`, `AnyCommand` (`@inkbrick/engine`) and `AnyReactBlockDefinition` (`@inkbrick/react`).

- **Breaking:** `@inkbrick/engine` exports an explicit, smaller public API instead of everything (`export *`): the editor, intents and their results, custom blocks and commands, clipboard fragments, the optional block sets, and table reading, editing and ranges. Single command objects (`InsertTextCommand`, `tableCommands`, …), `builtinCommands`, merged-cell helpers (`mergeAt`, `mergesWithin`, `normalizeMerges`, …), sorting helpers, `clampTableRange`, `expandRangeToMerges`, `readTable`, `columnsCommands`, `collapseEmptyColumns` and the like moved to the new entry `@inkbrick/engine/internal`, which is not a public contract. `Engine`, `Dispatcher`, `BlockEngine` and `InlineEngine` are exported from the main entry as types only. The exported names of every package entry are now checked against a snapshot (`scripts/__tests__/public-api.test.ts`).

- Store: every `Change.apply` is atomic. While a change is applied, the `DocumentWriter` remembers the previous version of each block it writes; if the change throws halfway (an invalid insertion, a `meta.user` / `meta.now` callback that fails after a structural write), those writes are undone and the document is exactly as before — before, such a half-applied change was not in the transaction yet, so its rollback could not undo it. `DocumentWriter.atomically(fn)` is the mechanism; the `Change` contract is documented.
- Document tree invariants are enforced on write: `_insertChild` refuses an id that is not in the document (before, the dangling id was kept in `children` and hidden by `getChildren`), and `_deleteBlock` refuses the root block.

- Inline code takes no formatting except a link: text colour, highlight, bold, italic, underline and strike are no longer applied to inline code, neither to all of it nor to a part (a part of code cannot be written to Markdown and its colour was hidden by the code's own colour anyway). Turning text into code removes that formatting; a selection of code and text formats only the text; over code alone the toolbar disables those buttons. The rule lives in the model (`CODE_EXCLUDED_ATTRIBUTES`, `withoutCodeExcluded`, `normalizeInlineNodes` in `@inkbrick/document`; `BlockEngine` applies it to every content change), so it covers commands, shortcuts, HTML paste, Markdown import (`**`x`**` is plain code) and documents saved earlier (cleaned when opened).

### Removed

- Column properties and table views are cut: the dialog «Column properties», the column types `checkbox`, `select`, `multiselect`, `url`, `email` and `phone` (the types `text`, `number` and `date` stay), keyboard control of checkbox and select cells, column filters, hidden columns and several views per table. The `columnTypes` of a table keep the three original types; documents that were saved with the removed types are not migrated.

### Added

- One colour palette everywhere: text colour, highlight, block background, table cell background and table border colour share the same component (`ColorSwatches`) and look — a grid of rounded square swatches, «×» first (removes the colour), the palette, «Custom color…» last. The table menus lose their round dots and the separate «Remove color» button. Swatches take their colour from `--inkbrick-swatch` instead of a CSS rule per colour; size and columns are `--inkbrick-swatch-size` and `--inkbrick-swatch-columns`.
- Table borders can have a custom colour with transparency: `borderColor` and `border<Side>Color` accept `#rrggbb` / `#rrggbbaa` besides palette names (schema, `setTableCellsBorders`, rendering; HTML export writes it as is).

- Colour picker with an alpha channel: «Custom color…» (text colour, highlight, block background, table cell background) no longer opens the browser's system dialog but a picker under the palette — a saturation and brightness area, hue and opacity sliders, a preview, HEX / RGB / HSB fields and an opacity field in percent, **Cancel** and **Apply** (one undo step); mouse, touch and keyboard (arrows, Shift for bigger steps, Enter applies, Escape cancels). Menus and the formatting toolbar stay open while it is used and are moved back inside the window when it grows. Lives in `@inkbrick/dom/color-picker` (plain DOM, React, Vue or no framework), loaded as a separate chunk; styles in `@inkbrick/styles/color-picker.css`.
- Colours with transparency: a custom colour is stored as `#rrggbbaa` when its opacity is below 100 % (`isHexColor` and `blockBackgroundSchema` accept `#rrggbb` and `#rrggbbaa`). A highlight and a block background from the picker are always `#rrggbbaa`, start at 35 % like the palette shades and are drawn exactly as chosen (`data-inkbrick-bg="custom-alpha"`, `data-background="custom-alpha"`); older `#rrggbb` values are still drawn diluted. HTML export writes `#rrggbbaa` as is; a cell with a background more than half transparent keeps the theme's text colour.

- Tooltips of the editor's buttons (table markers, block handle, code, headings, menus, panels) are one styled bubble in the theme's colours instead of the browser's native `title` box: it appears after a short delay on hover and at once on keyboard focus, hides on leave, press, Escape and scroll, and keeps the button's accessible name. Colours: `--inkbrick-tooltip-bg`, `--inkbrick-tooltip-fg`. The bubble is a lazy chunk loaded right after the editor renders.

- Image block (`docs/images-and-callout.md`): a new toolbar — alignment (menu), caption (shown or removed with its text, `showCaption`), crop, view full size, download and «⋯» (alt text, replace, reset crop, download the original); the width is changed by side handles on the picture (mouse, touch, or the arrow keys on them) instead of the 25/50/75/100 % list, one undo step per drag.
- Image cropping in a full-screen window: a frame moved and resized by its edges and corners, shapes (freeform, circle, square, 5:4, 4:3, 7:5, 3:2, 5:3, 16:9, each in portrait or landscape), Cancel and Save. Saving makes a file of the crop on a canvas (a circle is a WebP with clear corners — PNG where the browser cannot write WebP — so a photo stays small), uploads it like any image (`images.upload` or a `data:` address) and keeps the original: `src` is the crop, `originalSrc` the original, `cropX`, `cropY`, `cropWidth`, `cropHeight` the frame in percent and `aspect` the shape — one undo step; cropping again starts from the original. When no file can be made (a server without CORS) the block crops the original with CSS. It opens right after an image is added from the picker (file or link; `images.cropOnAdd: false` turns that off) and from the «Crop image» button.
- Full-screen image viewer: previous and next image of the document, zoom (buttons, wheel, pinch, double click), panning, download and close; keys arrows, `+`, `-`, `0`, Escape.
- New package `@inkbrick/dom`: parts of the interface in plain DOM with no framework inside (React, Vue, Svelte or none), each with its own entry. `@inkbrick/dom/image-tools`: the crop window (`openCropper`, or `cropDialog` as a promise), the viewer (`openViewer`), the frame geometry, `cropImage` and download helpers, usable without the editor; its styles are `@inkbrick/styles/image-tools.css` (part of the default `@inkbrick/styles`). The editor loads it as a separate chunk when an image is cropped, viewed or downloaded.
- The image picker has «Upload» and «Link» tabs (arrows switch them); an image from a website dropped on the picker is embedded by its address.
- Dragging an image into the editor from outside (a file or a picture from a website) shows the same insertion line as moving a block: the image lands before the block under the pointer (upper half of its line) or after it. A picture from a website is inserted by its address, through `images.rehost` when it is set.
- Table styles and cell borders (`docs/tables.md`): the table menu has a gallery of eight ready styles (none, grid, horizontal lines, blue, green, orange, purple, dark) with a live preview — hovering a style shows it on the table without writing to the document, a click applies it (`tableStyle`, one undo step) — and a borders section: all, outside, inside, inside horizontal, inside vertical, top, bottom, left, right and none, with a line weight (thin, medium, thick) and a color from the palette. Borders apply to the selected cells, or to the whole table without a selection (command `setTableCellsBorders`, cell props `borderTop|Right|Bottom|Left` and `borderColor`); a line between two cells is written to both, so a neighbour outside the selection does not override it. Borders travel with a copied range and are exported to HTML. The same sections are in the context menu of a cell. The block menu gets a generic `panels` prop (`BlockMenuPanel`), and a context menu item can carry its own `content` (a section with a title); `BlockContextMenuContext` has `close()`.
- Table formatting (`docs/tables.md`, «Форматирование»): with a rectangle of cells selected, the right-click menu and the command palette format **all** the cells in one undo step — bold, italic, underline, strike, code (toggle: off when every cell already has it; Ctrl/Cmd+B, I, U, E, Shift+X work on the selection), text colour and highlight, left/centre/right/justify alignment per cell, clear formatting. Commands `formatTableCells`, `setTableCellsColor`, `clearTableCellsFormat`, `alignTableCells`, `setTableCellsBackground`, `resetTableColumnWidths`. Table properties `headerColumn`, `striped` (alternating rows) and `borders`, cell `background` (`BLOCK_BACKGROUNDS`, `data-background`), a «Table» grip menu in the table corner (header row and column, stripes, borders, freeze, reset widths, cell background for the selected cells or the whole table) with the same items in the cell context menu and the palette. Properties and cell backgrounds are validated by the schema, travel with copied tables, and `toHtml` writes cell background, alignment, `<th scope="row">`, stripes and borderless tables; Markdown is unchanged. `ToolbarProps.scope: 'cells'` and `onClearFormat` for custom toolbars. The resize handles got `aria-valuenow`.
- More colours (`docs/text-style.md`, `docs/block-background.md`, `docs/styling.md`): five new palette names — `lime`, `teal`, `cyan`, `indigo`, `magenta` — for text colour, highlight and block background (`COLOR_NAMES`, `BLOCK_BACKGROUNDS`, `COLOR_HEX`), with light and dark shades in the `--inkbrick-color-<name>` and `--inkbrick-highlight-<name>` tokens (text and the default text over highlight keep WCAG AA contrast, 4.5:1) and English and Russian labels; and «Custom color…» in the colour, highlight and block-background panels, a native colour picker that stores `#rrggbb`. The block `background` prop now accepts a palette name or `#rrggbb` (`blockBackgroundSchema`, `getBlockBackgroundColor`, `isHexColor`); anything else is still rejected by the schema and repaired by `repairSnapshot`. Existing documents are read as before; HTML export knows the new names and custom colours. The colour grid is three rows of six, the background grid two rows of eight.
- New default colors: the tokens of `@inkbrick/styles` have new values in the light and dark themes: text, backgrounds, strokes, status colors, the palette of text and highlight colors, inline code (a new color and background without a border, tokens `--inkbrick-inline-code-fg` and `--inkbrick-inline-code-bg`) and text selection (token `--inkbrick-selection-bg`). Only colors change; sizes, spacing and shapes stay. The default look of an application that does not set its own tokens changes. Text colors are at least 4.5:1 on the page and the highlights keep the axe contrast.
- Выбор блоков по аналогии с привычными редакторами (`docs/block-picking.md`): выбранный блок — сплошная полупрозрачная голубая заливка на всю ширину со скруглением, без рамки и теней (`rgba(35, 131, 227, 0.14)`, переопределяется токеном `--inkbrick-picked-bg`, поверх собственного фона блока); рамка мышью из поля слева или справа автопрокручивает документ у края окна и выбирает блоки по мере протяжки; Shift+клик по блоку или ручке расширяет выбор диапазоном от якоря (или от блока под кареткой), Ctrl/Cmd+клик по ручке добавляет блок в выбор или убирает его — выбор может быть несвязным (удаление, дублирование, сдвиг, копирование, перенос работают блок за блоком); Ctrl/Cmd+A выделяет сначала весь текст блока, затем все блоки документа (верхнего уровня; выбор внутри toggle или колонки растёт уровень за уровнем); клик вне редактора снимает выбор. `togglePick`, `pickRangeTo`, `pickAll` в `pick/actions`, привязка `pick.selectAll`.

- «Turn into» and «Background» for picked blocks (`docs/block-picking.md`): the block menu opened on a block of a picked run turns the whole run into the chosen type or paints it in one undo step, skipping the blocks the action does not apply to (no item or colour row when it fits none); the command palette's «Turn into …» commands act on the picked run too. Types without text (divider, table) stay single-block. `convertBlocks`, `convertibleIn`, `setBackgrounds`, `backgroundTargets` in `pick/actions`.
- Markdown import (`docs/export.md`): `fromMarkdown(text, { schema })` from `@inkbrick/document/markdown` parses Markdown back into a `Document` — the inverse of `toMarkdown` (paragraphs, headings, bullet, ordered and todo lists with nesting, quotes, `> [!NOTE]` callouts, fenced code with a language, `---`, images, GFM tables, `$$…$$` and `$…$` formulas, footnotes, `<details>` toggles; bold, italic, strikethrough, code, links, `<u>`). A separate entry point, so the main bundle does not grow. Unknown syntax stays plain text, raw HTML is never inserted, links and images go through `isSafeUrl`/`isSafeImageUrl`, nesting stops at `MAX_NESTING_DEPTH`, and `maxLength`/`maxBlocks` reject oversized input. Options `title`, `titleFromHeading`, `rootId`.

- Block background (`docs/block-background.md`): `background` on paragraphs, headings, quotes, list items, callouts and toggles (`BLOCK_BACKGROUNDS`, `getBlockBackground`), a row of colours in the block menu (`props.background` of `slots.BlockMenu`), kept when the block is turned into another text type, exported to HTML as an inline style. Pale shades of the theme highlight colours keep the text readable in light and dark themes; the text stays where it was. `setBlockProps` with `undefined` now removes the property.

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

- Slash items of your own blocks follow the language: `titleKey`, `descriptionKey` and `keywordsKey` on an item (`BlockSlashItem`, `SlashMenuItem`) take the text from the app dictionary, `title`, `description` and `keywords` stay as the fallback. Dictionaries are typed `AppMessages` (editor keys plus your own), a key found nowhere comes back as itself, and the dictionary passed to the provider (`locales`) now adds to the connected language instead of replacing it (missing keys come from `en`/`ru` rather than only from English). `docs/i18n.md`.
- Every package has a `README.md` for its npm page: what it does, how to install it, a short example. The root
  README lists the optional blocks and tools, `@inkbrick/locales` and all the guides; the size of the React editor
  there is up to date (~61 KB gzip).
- Smooth appearance: the block handle fades in and slides in a few pixels from the left, the slash menu, the
  block menu and the context menu fade in and slide in from the caret, the handle or the click point (from below when a menu opens
  above it; `data-side="top|bottom"` on the menu), the floating toolbar rises over the selection or drops under it through the
  `translate` property, so its own `transform` positioning is not touched (`inkbrick-toolbar-in`, `inkbrick-toolbar-in-down`), the command palette dims the page and drops its window in (`inkbrick-slide-down`), the find panel drops in from the top edge, the formula popover, the option list of a table cell and the tag suggestions fade in like menus and the column properties dialog like the palette, the drop line fades in while a block is dragged, and the dragged block dims instead of blinking. Pure CSS (`@keyframes inkbrick-handle-in`,
  `inkbrick-fade-in`, `inkbrick-menu-in`, `inkbrick-menu-in-up`), on by default, off under `prefers-reduced-motion: reduce`. Tokens `--inkbrick-appear-duration` (100ms,
  `0ms` turns it off) and `--inkbrick-appear-shift` (4px). Moving the pointer from block to block does not replay it: the
  handle is the same node.
- Smooth disappearance: every popup above fades out (`@keyframes inkbrick-fade-out`, token `--inkbrick-disappear-duration`, 100ms,
  `0ms` turns it off) instead of vanishing. The new `Presence` component (`data-inkbrick-presence`, `display: contents`, `data-state="open|closed"`,
  `aria-hidden` and `pointer-events: none` while it leaves) keeps a closing popup in the DOM until its exit animation ends. Without an
  animation (`prefers-reduced-motion`, `0ms`, no package styles, a custom slot component whose root has none) it removes the popup at once, as
  before. A popup that is opened again while it is leaving is created anew (so its mount effects run again); the block handle and the drop
  line keep the same node. A custom slot component gets the exit with one rule on `[data-inkbrick-presence][data-state='closed'] > .your-root`.
- Smooth collapsing: toggles, foldable list items and headings with a folded section shrink and grow with an animation
  (`--inkbrick-collapse-duration`, 220ms, `0ms` or `prefers-reduced-motion` turn it off) instead of jumping: height, opacity and vertical
  margins go from where the element is now to zero or back, the arrow turns smoothly, and a second click in the middle of the animation
  turns around from where it is. The nested blocks of a toggle or a list item stay in the tree until the animation ends; the blocks of a folded
  section shrink each in place, and with the full renderer a section of more than 40 blocks collapses at once (the virtual renderer animates the blocks on screen, at most 40 at a time, and removes the rest at once). A collapsed block holds its final state until it is removed and its `min-height` and the `gap` between blocks collapse with it, so nothing jumps or flickers at the end. Built on the Web Animations API (`animateCollapse`,
  `useCollapse`), so no wrapper elements are added; the code block collapse uses the same token. Only the fold and unfold are animated: the first
  nested block of a toggle, and blocks drawn for the first time, appear at once.

- Tables on a phone (`docs/tables.md`, «На телефоне»): a long press (0.45 s) on a cell selects it with a short vibration and holds the page still, dragging the finger extends the selection to a rectangle, and releasing keeps the selection so it can be adjusted; a second long hold on a selected cell opens the cell menu (formatting, cut/copy/paste, rows, columns, width, borders, background), while a quick tap on it drops the selection. The table items are in the cell menu opened by the long press. The column menu has «Column width…», a bar at the bottom of the window with a slider that resizes the column live (one undo step when the finger is lifted), −/+ buttons for one pixel and «Fit content». The browser's own long-press menu and the synthetic mouse events that follow are suppressed while a cell is held.
- Menus as bottom sheets on a phone (a coarse pointer and a window up to 720 px wide): the context menu (cell menu) and the block menu (row, column, block) open as a sheet at the bottom of the window — full width, rounded top, a grab bar, a dim backdrop whose tap closes the menu without reaching the document — instead of a small window over the table. A nested panel («Cell borders») is a second sheet with a header and a back arrow. The sheet stands above the on-screen keyboard (`visualViewport`). The attribute `data-sheet` and the hook `useSheet` are the switch; on a larger window or with a mouse the menus are the same as before.
- Tables on a phone, selection frame: a tap in a cell shows a blue frame around it (or around the selected cells) with a knob on its bottom right corner, as in Notion. Dragging the knob extends the selection to the cell under the finger (the page does not scroll); releasing it keeps the selection, the menu comes from a long hold on a selected cell. It adds to the long press, which stays.

### Fixed

- A block picked as a whole (for example a columns block picked by a frame across its columns) moves whole when it is dragged by the handle of a block inside it; before, only that inner block moved (the first picture of the left column). The block menu opened there also acts on the picked block.
- Deleting thousands of blocks is no longer quadratic: deleting a range across 20 000 blocks, deleting the picked blocks and undoing either took 2–3 s, now about 40 ms (50 000 blocks: ~0.1 s). New command `delete-blocks` (`{ ids }`, one undo step, skips what cannot be deleted) and store change `RemoveChildrenChange`.
- Hundreds of images in one document no longer blank the page: before they load, image blocks are far shorter than estimated, and the virtual renderer remeasured block by block until React aborted with «Maximum update depth exceeded». After a few synchronous passes the next remeasure waits for a frame.
- Typing in a large table is fast again: a `:has()` rule for the cell selection made the browser restyle every cell on each key (~180 ms per character in a 100 × 20 table, now a few ms). The table carries `data-cells-selected` itself.
- The image viewer and crop window keep the keyboard focus when the focused button becomes disabled (Next on the last picture, Zoom in at 400 %, Save while saving): Escape and the arrow keys kept working only until then.
- The crop window no longer calls `onCancel`/`onError` for a picture that fails after the window was closed, and Escape does not cancel while the crop is being saved (Cancel is locked then too). The viewer's wheel no longer zooms the page behind it (a trackpad pinch is Ctrl+wheel).
- Picked blocks are not moved into a column that lies inside one of them: the move was done halfway (the first block went, the rest stayed).
- The selection frame picks a block only when it crosses it (a frame on the page margin picks nothing until it reaches the text); a frame inside one column picks that column's blocks instead of the whole columns block, so dragging any of them moves all of them. A picked run dropped at the edge of a block goes into the new column together.
- A menu scrolled to its end keeps the wheel (`overscroll-behavior: contain` on the slash, block and context menus, select lists, the command palette, the outline panel, tag suggestions and the formula palette): the page no longer scrolls and the context menu no longer closes.
- One order of layers: new tokens `--inkbrick-z-panel`, `--inkbrick-z-dialog`, `--inkbrick-z-tooltip`; the outline panel no longer covers application panels, tooltips show above the crop and viewer windows, an open image tools menu lies over the blocks below.
- Addresses starting with `/\` are rejected for links and images (browsers read them as `//host`); a block id `__proto__` in a loaded snapshot no longer replaces the prototype of the block map; a failed load of the formula chunk is retried by the next formula.

- A command that changes nothing (a background removed from cells that have none, an alignment the cells already have, props set to their own values) no longer leaves an empty undo step, after which Ctrl+Z seemed to do nothing.
- Blocks look the same: a table, a code block, a callout, an image and a coloured block share the left and right edges of the text column, the vertical margin (4 px) and the card radius. A table is no longer indented by 28 px: its row and column handles (now 10 px thick, 16 px under a finger) lie on its left and top border, and its block handle stands where every block's does. A coloured block no longer sticks out of the column; its text is inset by 8 px instead.
- The top left corner of a table has two separate insert markers instead of one that looked shared: «row above» on the left border just below the corner, «column left» on the top border just right of it.
- Columns are 72 px apart (was 32): the divider sits next to the left column, and the full block handle («+» and the grip) of the next column fits between the divider and the column, covering neither.
- The block handle stays with its block while the pointer travels to it, also across a neighbouring table, the gap of columns or the margin: a table inside columns could not be grabbed because its handle jumped away on the way.
- Folding a heading with a long section animates again: only the blocks near the screen move, the rest go at once; whole sections fold without an animation only above 200 blocks (was 40).
- Table cells coloured lime, teal, cyan, indigo or magenta showed the pale block background instead of the saturated cell colour: five block rules came after the cell rules and won.
- Every cell colour now keeps AA contrast with its text: the dark text of coloured cells is `#111111` (was `#1a1a1a`, 4.4:1 on purple), and indigo is a little darker (`#5e61ef`) with white text.
- A table copied to Google Docs, Word or mail keeps its merged cells (`colspan`/`rowspan`, hidden cells left out), cell backgrounds and borders; a table pasted from HTML keeps its cell backgrounds (palette colours by name, white skipped) and column widths (Excel writes them in points).
- While cells of a table are selected, the browser's text highlight is hidden in that table: it followed the reading order and also painted cells outside the selected rectangle.
- Deleting the row or column that holds the main cell of a merge lost the merged text while the merge itself stayed: the text and look of the cell now move to the next cell of the merge.
- Pasting into a table cell hidden by a merge wrote the text into that hidden cell, where it could not be seen; it now goes to the visible cell of the merge.
- Dragging a block by its handle no longer moves the caret into another block: the caret (or selection) stays where it was in the document, also when its own block is the one moved. Escape during a drag only cancels the drag; it no longer also picks a block.
- Columns: the handle of the second and later columns could not be grabbed (it vanished on the way to it, and the divider of the columns lay under it): the gap between columns now belongs to the next column, and the divider sits right against it. A block moved out of a column by any move (not only by dragging to a side) no longer leaves an empty column: the columns close up, and with one left they turn into plain blocks.
- Table selection: Tab and Shift+Tab from a selected range keep the caret on its anchor cell, and the arrows up and down move one row from the selection, not two (the table keymap no longer handles a key the selection already took).
- Arrow up and down inside a multi-line cell leave the cell only from its first or last line, not from the second one.
- Pasting tab-separated text into a paragraph is no longer turned into a table larger than the limits (`MAX_TABLE_CELLS`, `MAX_TABLE_COLUMNS`); it stays text.
- Pasting a table into a cell of another table never writes into the hidden cells of a merge (such a paste goes in as text), and the merges of the pasted table move to the place of the paste.
- The cell context menu has «Column wider» and «Column narrower» (10 px steps), so a column width can be changed from the keyboard.
- HTML export: a merge that starts in the header row is cut at the header, so `rowspan` no longer crosses `thead` and `tbody`.
- Sorting a date column: a bare number («10») is not a date; the `Date.parse` fallback needs a four-digit year.
- Table styles: «Horizontal lines» and «Hide cell borders» are no longer overridden by the general line colour; a striped table keeps the header column colour.
- Pasting a single unformatted cell keeps the background and alignment of the cell it lands in.
- Typing over a cell selection is one undo step: one Ctrl+Z restores the text of the anchor cell.
- The submenu of the context menu opens on click and stays open (it no longer toggles shut right after hover).
- The style gallery clears its live preview when it closes with Escape or a click outside.
- Table handles stay inside the top of the window when the table is close to the top edge.
- A press on the empty part of a table cell (the lower part of a tall merged cell, the padding) puts the caret into that cell: the browser used to put it at the nearest position on the same line, which is the neighbouring cell because the cells covered by a merge are hidden, so typing went to the wrong cell or nowhere.
- A nested bottom sheet («Cell background», «Cell borders») has its own backdrop over the parent sheet: a tap beside it closes only the nested panel, and the items of the parent sheet that stayed visible above it are no longer tapped by mistake (the tap used to activate one of them and close the whole menu).
- A tap on the backdrop of a bottom sheet only closes the menu: it no longer focuses the editor, which put the caret at the start of the document and raised the on-screen keyboard (`onDismiss` of the menu props; `onClose` after a choice still returns the focus).
- The table corner button (`data-inkbrick-part="table-grip"`, top right of a table) is removed on every device, with its hint and its own «Table» menu: all its items — header row and column, stripes, borders, freeze, reset widths, style gallery, cell borders and background — are in the context menu of a cell (and the command palette). The translation keys `table.handle`, `table.tip.click` and `table.tip.select` are gone. A cell background from the cell menu goes to the selected cells, or to the cell under the menu (the table menu used to paint the whole table).
- Table properties in the menus are switches, as in Notion: «Header row», «Header column», «Striped rows», «Cell borders», «Freeze first row», «Freeze first column» keep their name, and a switch on the right shows the state (`menuitemcheckbox`, `aria-checked`) instead of a «Make …» / «Remove …» title that changed. `toggle` on `ContextMenuItem` and `BlockMenuAction`; translation keys `table.toggle.*` (the unused `table.row.freezeOn/Off` and `table.column.freezeOn/Off` are gone; the palette keeps its action titles).
- The cell menu and the column menu are grouped with headings, like the block picker: «Rows», «Columns», «Table», «Design» in the cell menu, «Columns», «Alignment», «Type», «Sort» in the column menu (`group` on `ContextMenuItem` and `BlockMenuAction`, keys `table.group.*`).
- The size budgets of `@inkbrick/react` (66 → 67 KB gzip) and of the whole editor app (92 → 93 KB) are raised: a copied table now carries its merges, backgrounds and borders to other apps, no-op commands are skipped, and the caret is kept on a drag.
- The size budget of `@inkbrick/react` (EditorProvider + DocumentView) is raised from 65 to 66 KB gzip: the table menus of this release (switches, group headings, bottom sheets) add English strings and code to the initial load.
- The block handle of a table is the same as of every other block again («+» and the grip) and stands in the same column; on a narrow screen its compact form goes above the table, over the column pills, instead of onto the first row pill. The handle of every block keeps an 8 px gap from the block (it touched it, and lay on the frames and controls of blocks), and may use up to 32 px of the page margin left of the editor root.
- The row and column pills of a table have the same thickness (14 px; 20 px for a finger) and both follow the size of their row or column, and they no longer grow on hover.
- Table cell backgrounds use a saturated palette, like spreadsheet editors, the same in the light and dark themes (tokens `--inkbrick-cell-gray` … `--inkbrick-cell-magenta`); the text on a cell background is black or white, whichever contrasts more (`--inkbrick-cell-text-dark|light`), for a custom colour too. The colour dots of the cell background menu show these colours, and the dots of the border colour menu show the real line colours (they showed the pale highlight shades). The HTML export writes the same background and text colour. Block backgrounds outside tables are unchanged.
- Custom cell colour: the context menu no longer closes when the system colour picker takes the focus from the page, so the chosen colour is applied (it used to be lost). Table cell backgrounds are opaque: a palette colour is exactly the colour of its dot in the menu, a custom colour exactly the one chosen (both used to be diluted to 35 %); the HTML export writes a custom cell colour without transparency too.
- Styles: five rules had a pseudo-element inside `:where()` (`:where(x::after)`), which browsers drop entirely: the hover line of the column resize handle, the divider lines between the columns of a «Columns» block and the grab bar of a bottom sheet never showed. The pseudo-element now follows `:where()`, and the styles contract test forbids the old form.
- The backdrop of a bottom sheet covers the whole width of the screen (it inherited the 16 px narrower maximum width of the context menu).
- Touch: the row pill is centred between the larger insert markers of its row and no longer touches them; at the top left cell the «insert row above» marker is hidden, as it covered «insert column left» (both stay in the menus).
- The docked formatting toolbar fits in two rows on a 360 px phone.
- Cell border colour and style are per side (`borderTopColor`…`borderLeftColor`, `borderTopStyle`…`borderLeftStyle`): a line shared with a neighbour outside the selection is painted in both cells, but the neighbour's other sides stay as they were (the neighbour used to get the colour on all four sides). The cell-wide `borderColor` and `borderStyle` of older documents still render and are spread over the sides on the first change. The editor draws the side colours and styles as an inline style; the attributes `data-border-color` and `data-border-style` are gone (the black and white lines use `--inkbrick-cell-line-black|white`). HTML export and copied ranges carry the sides.
- Pasting plain text from a spreadsheet (TSV) over several cells keeps their background, borders and alignment; only a fragment that carries cell formatting replaces it.
- The cell formatting of a pasted table fragment is checked against the cell schema: unknown properties are dropped, and a cell with an invalid value (a forged clipboard) brings no formatting.
- Changing only the colour or the style of the lines no longer resets the width of a neighbour's shared line to thin.
- Sorting reads numbers by their own separators («1.234,56», «$1,234.50») in any interface language; the language (via `Intl`) decides only the ambiguous «1.234» / «0,125».
- The column header role of the cells follows the header switch and the row order right away (screen readers).
- Arrow up and down reach a cell merged across columns from a column it covers, instead of skipping its row.
- «Wider» and «Narrower» in the cell menu step from the width of one column, not of a whole merged cell.
- The remembered border width, style and colour are kept per editor, not shared by all editors on the page.
- The width slider commits the shown width when the browser takes over the gesture (`pointercancel`).
- On a phone (a coarse pointer and a window up to 720 px wide) the floating formatting toolbar is docked at the bottom of the screen, full width, above the on-screen keyboard, instead of jumping after the selection (`data-placement="docked"`, `data-sheet`). It still shows only while text or cells are selected; it slides in and out like a bottom sheet, and the colour panels and «Turn into» open above it. The «Turn into» button keeps its chevron on one line.
- A bottom sheet hides the on-screen keyboard when it opens (the focus leaves the text; a context menu with the text formatting buttons keeps it and stands above it): the keyboard no longer covers half of the menu. Closing, the sheet slides down and its backdrop fades out (token `--inkbrick-sheet-duration`, 220 ms; the opening uses it too) instead of vanishing at once; the table row and column menus and the nested panels now leave with an animation as well. A tap on the backdrop of the row or column menu no longer lets the browser's follow-up mouse press through to the document under it.
- In a narrow column on a phone the round «insert column» markers are hidden: being larger for a finger, they covered the column pill. Inserting to the left or right stays in the column menu.
- Column border handles next to merged cells: a border that exists in several stretches of rows (above and below a merge) had a handle only on the longest stretch, so the column could not be resized from the other rows; each stretch has its own handle now.
- The row and column handles of a table are no longer animated in size: a 0.1 s transition on `width`/`height` made the column handle stretch and catch up with the cell on every width change. Only the insert markers (they grow into a «+» on hover) keep a size transition.
- The handles of a table follow a column whose width changes while the table keeps its size (the neighbour column changes by the same amount): they watch the cells of the first row, not only the whole table, so the column handle and the markers no longer lag behind a resized column.
- A tap on an item of a nested panel of the context menu that lies over the menu (phone width) no longer closes the panel before the click arrives: entering the panel was treated as entering its parent item, the panel closed, and the click fell through to the item under it (it could delete a column). The same went for the mouse in a narrow window.
- On touch screens the items of the context menu and of the block menu are at least 44 px tall.
- Table handles follow the visible frame of a table that scrolls inside its block (a wide table scrolled sideways, a frozen header row scrolled down): the row handle no longer leaves the table to the left, the column handle no longer jumps to the top of the window.
- A submenu of the context menu that has no room beside the menu (phone width) lies over the menu instead of going off the screen, opens on click there, and scrolls when it is taller than the window.
- The block menu (row, column and table menus) keeps its width and position while it scrolls: its width depended on its own `left`, and `left` on its width, so on a phone it grew and shifted on every redraw and its labels wrapped.
- On a touch screen the larger insert markers sit on the same axis as the row and column handles (they were 4 px and 3 px off centre), the column handle keeps clear of the column markers at the cell edges, and the row handle is at least 24 px tall instead of 32 so it overlaps the markers by 3 px at most (it is drawn above them).
- Undo after a row was added with Tab puts the caret back in the cell it started from instead of dropping it out of the table (`caretBefore` in a command payload reports where the caret was); after other table commands (insert markers, menu items) it lands in the first cell of the table when the recorded caret points at the table itself.

### Changed

- **Breaking:** `BlockSchema.version` is required — an integer from 1; `registerBlock` and `replaceBlock` throw without it. Every built-in block declares `version: 1`. Add `version: 1` to your own block schemas (`defineBlock`).
- Every block in a snapshot carries its schema version (`BaseBlock.version`): `serializeDocument` writes it on each block, and loading migrates each block from its own version (then `schemaVersions` of its type, then 1), so blocks of one type saved by different versions migrate correctly. A block of an unknown type keeps the version it came with; a block of a known type has no `version` in the open document. `schemaVersions` is still written for older readers; `validateSnapshot` rejects a block version that is not an integer from 1 or newer than supported.

- The cell context menu has nested menus, as in office editors: «Cell background» (colour dots and a custom colour), «Cell borders» (with line width, style and colour) and «Table style». Context menu items can carry `submenu`, `flyout` and `checked`.
- Line width, style and colour change the existing lines of the selected cells at once (mode `keep` of `setTableCellsBorders`); they used to be only remembered until a border placement was chosen.
- New: the line style of cell borders (`borderStyle`: solid, dashed, dotted) and a custom cell background `#rrggbb`.
- Table handles: a column pill above the columns and a row pill left of the table next to its row (the table is moved 28 px right, so the block handle at the edge of the column does not meet them); the handles appear smoothly, keep up with the table while it scrolls, only the nearest of two tables shows them, the active row does not switch while the pointer is over a pill or a boundary marker, and a table has 20 px above and below.
- The old «+» buttons on the right and at the bottom of a table are removed: rows and columns are inserted with the round markers on the boundaries (also after the last row and column).
- A table cannot be stretched wider than the page: the last column grows only while the sum of the widths fits the visible area.

- Table handles: row and column pills with six dots; the round markers at their ends insert a row or a column at that boundary.

- The parser of pasted HTML (Google Docs, Word, browsers; `htmlToFragment`) is a separate chunk loaded right after the editor mounts, so the core of `@inkbrick/react` is about 3.0 KB gzip lighter (63.4 → 60.4 KB) and the chunk is 4.3 KB. A paste of foreign HTML stays synchronous once the chunk is in (it normally is by the first paste); in the first moments after mount it waits for the chunk and lands at the same place. Pasting the editor's own format and plain text never waits. `htmlToFragment` and `embeddedFragment` are still exported for your own code.

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
  `@inkbrick/react` is about 3.3 KB gzip lighter (64.5 → 61.2 KB). Total transfer is the same: the chunks leave the initial bundle, they do not wait for the first use. A code block created within the first moments after mount, before its toolbar chunk has arrived, already takes input (the shell and the text are in the main bundle, only the toolbar, language select and caption come from the chunk); a formula block created that early still shows a placeholder until its chunk arrives.
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
- Footnotes: the index no longer walks the whole document after every keystroke. It looks at the changed blocks and
  walks the document only when an edit touched footnotes or their order (a new or removed reference, a block with a
  footnote moved, a footnote code changed). A keystroke in a 50 000-block document with footnotes went from 10.5 ms to
  1.1 ms (the same as without footnotes), in a line with a footnote from 11.8 to 1.3 ms, Enter from 15 to 2.4 ms
  (`pnpm bench`, scenario «footnotes in a large document»; `BENCH_OUT=file.json` also writes the results to a file).
- The block handle, the block menu, block moving and the drop line (`BlockHandleLayer`: pointer tracking, handle, menu, drag
  and drop, drop indicator) load as one separate chunk right after an editable editor mounts: the core of `@inkbrick/react`
  went from 63.2 to 60.7 KB gzip (the chunk is ~4 KB, read-only documents never load it). The default handle and menu used
  to be two more chunks nested inside; now they ship in the same one. Typing never waits for it. The exports
  (`useBlockDrag`, `DefaultBlockHandle`, `DefaultBlockMenu`, `DefaultDropIndicator`) and the `slots` keep working.

### Fixed

- Cell context menu with several cells selected: «Insert rows above / below», «Insert columns left / right», «Delete rows» and «Delete columns» apply to all the rows and columns of the selection (the item shows the number), in one undo step; only one used to be inserted or deleted.
- A table always fits the page: set column widths that together are wider than the page are shown scaled down (the model keeps them), and added columns no longer go past the right edge.

- Cell context menu: without a selected range, background and borders apply to the one cell under the caret, not to the whole table.

- Resizing columns could leave a horizontal scrollbar on a table: widths were rounded to the nearest integer, and with several columns the sum came out a couple of pixels wider than the block. They are rounded down now.

- The block menu does not go past the bottom of the window: when it fits neither below nor above the handle, it moves up and scrolls inside the window.

- Рамка выбора блоков, отпущенная сразу после движения мыши, теряла последние задетые блоки: выбор пересчитывается по последнему положению указателя.

- Цвет выделения, выбранный вручную, больше не режет глаз и скруглён: тон смешивается с фоном, как у заготовленных цветов, углы такие же, как у них.
- Повторный клик по применённому цвету текста или выделения снимает его.
- В контекстном меню панель цвета и меню «Преобразовать в» не обрезаются краем меню: раньше верхний ряд палитры, а в нём кнопка сброса цвета, пропадал.
- Контекстное меню ячейки: секции стилей и границ получили разные идентификаторы, предупреждение React о совпадающем ключе `table-borders` ушло.

- On touch screens the buttons of the table styles and borders are 44 px, and the sandbox leaves room under the document for the example switcher.
- The table column/row menu and the column option list no longer stay open when the page scrolls: they are `position: fixed`, so after a scroll or a resize they hung where the grip used to be. They close on scroll and resize; scrolling inside the menu itself keeps it open.
- Small UI fixes: the command palette's query line keeps its 44 px height (it was squeezed by a long list); the «Turn into» button of the formatting toolbar is wider and never wraps its chevron; the block handle of a painted block stands at the column edge like any other handle instead of switching to the compact plate.
- Выбор блоков больше не тормозит на больших документах (50 000 блоков): рамка мышью искала блоки обходом всей заметки (`querySelector` по каждому из 50 000 id на каждое движение мыши, ~110 мс на кадр) — теперь границы читаются только у нарисованных блоков, бинарным поиском, раз в кадр (`requestAnimationFrame`); отметка `data-picked` ставится одним проходом по нарисованным блокам, а не подпиской и поиском элемента в каждом `BlockRenderer`. Замеры — в описании PR.
- Повторный Ctrl/Cmd+A больше не выделяет весь документ текстом с первого раза: первое нажатие выделяет текст блока, второе — выбирает все блоки, поэтому Delete после второго нажатия удаляет блоки целиком.

- A formula block no longer swallows what you type before its chunk arrives: the block (`FormulaBlock`) is in the core bundle now and `LazyFormulaBlock` with its empty placeholder is gone, so a new block opens its input field at once and keeps the same element, focus and typed code when the symbol palette (still a separate chunk) and Temml arrive; a filled formula shows its LaTeX source until Temml is in. The core of `@inkbrick/react` grows by about 1.4 KB gzip (61.6 → 63.0 KB).

- Backspace at the start of the block under a folded section and Delete at the end of a folded heading no longer merge text into a block you cannot see: the section unfolds first (one undo step, the caret stays), the next press merges as usual (`docs/heading-folding.md`).

- The caret in a code block no longer jumps to the start of the block when the syntax highlighter chunk arrives (or the language changes) while you type: a redraw that changes no text now keeps the selection. The code block also takes input before its toolbar chunk has loaded: the text field is the same element before and after the toolbar appears.

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
- Several editors on one page: the tag and find highlights of one editor no longer wipe out the other's, and closing
  one editor (or its search) keeps the other's highlights. Escape picks a block even while the search or the command
  palette is open in another editor.
- `pnpm lint` skips the generated API reference (`docs/api`), so it passes after `pnpm docs:api`.
- `docs/export.md` lists how toggles, tables of contents, columns, footnotes and block backgrounds are exported.

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
