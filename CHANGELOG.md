# Changelog

All notable changes to the `@inkbrick/*` packages. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## Unreleased

### Added

- `images.rehost`: re-host images from other servers when HTML is pasted, so pasted tracking pixels never reach the
  reader's browser and no IP leaks.
- Code block: collapse with an animated height (`collapsed` prop) and an optional caption (`caption` prop, exported as
  `<figure>`/`<figcaption>` in HTML and an italic line in Markdown).
- Image picker: a drop zone with an upload button; a file dropped on it fills that block.
- A click beside the text — in the left gutter, past the end of a line, between blocks or, with
  `data-inkbrick-surface` on an ancestor, anywhere around the document — puts the caret on the line at that height:
  at the start of that visual line on the left, at its end on the right; below the last block, at its end. Dragging
  from the margin selects text, Shift+click extends the selection.

### Changed

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
