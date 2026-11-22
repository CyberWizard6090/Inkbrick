# Inkbrick

**English** · [Русский](README.ru.md)

A block-based document editor for React, written in TypeScript. Documents are trees of typed blocks
(paragraphs, headings, lists, code, formulas, images…) edited in a single `contenteditable`, with transactions,
undo/redo, a schema with validation and migrations, and a fully replaceable UI.

## Features

- **Blocks:** paragraphs, headings 1–6, bullet / ordered / task lists with nesting, quotes, code with syntax
  highlighting, callouts, dividers, images (upload, link, caption, alt, width, alignment), block and inline
  formulas (LaTeX via Temml, or plug in KaTeX/MathJax). Unknown block types are preserved, never lost.
- **Optional blocks:** tables (column types, sorting, merged cells, frozen header), table of contents,
  columns, toggles, footnotes. Each set is opt-in and adds nothing to the bundle until it is used.
- **Tools:** find and replace, a command palette, `#tags`, a word counter, folding of headings and list items, picking
  and moving several blocks at once, block backgrounds, the browser's spellcheck.
- **Editing:** selection across blocks, Markdown shortcuts, slash menu, floating toolbar (formats, links, colors,
  highlight, alignment), block handles with a menu, drag and drop with mouse and touch, configurable keyboard
  shortcuts, mobile keyboards (IME composition).
- **Data:** immutable model, transactions with rollback, grouped undo/redo, read-only mode, clipboard with exact
  Inkbrick fragments plus Word / Google Docs HTML, export to Markdown, HTML and plain text, schema versions and
  migrations, damaged-document repair, optional `meta` (created/updated by/at).
- **Customization:** replace any block view or shell element (`presentation`, `components`, `slots`), add your own
  blocks with controllers (`defineBlock`), style through stable `data-inkbrick-*` attributes, CSS layers and design
  tokens (light/dark), translate the UI (en, ru, or your own dictionaries).
- **Scale and quality:** linear algorithms (100 000 blocks load in ~1 s), an optional virtual renderer for huge
  documents, ~61 KB gzip for the React editor (formulas, code highlighting and rare menus load on demand), no `eval`, strict input validation, accessibility checked with axe,
  end-to-end tests in Chromium, Firefox and WebKit.

## Install

```bash
npm install @inkbrick/react @inkbrick/engine @inkbrick/document @inkbrick/styles react react-dom
```

## Quick start

```tsx
import { useState } from 'react';
import { Editor } from '@inkbrick/engine';
import { DocumentView, EditorProvider } from '@inkbrick/react';
import '@inkbrick/styles';

export function MyEditor() {
  const [editor] = useState(() => new Editor());

  return (
    <EditorProvider editor={editor} locale="en">
      <DocumentView />
    </EditorProvider>
  );
}
```

Save and load documents as plain JSON:

```ts
import { deserializeDocument } from '@inkbrick/document';

// The snapshot carries the format and schema versions, so later migrations run exactly once.
const json = JSON.stringify(editor.serialize());

const restored = new Editor({
  schema: editor.schema,
  document: deserializeDocument(JSON.parse(json), { schema: editor.schema }),
});
```

Plug in your own design system and blocks:

```tsx
import { definePresentation } from '@inkbrick/react';

const myDesignSystem = definePresentation({
  components: { 'block:paragraph': MyParagraph },
  slots: { Toolbar: MyToolbar },
});

<EditorProvider editor={editor} presentation={myDesignSystem}>
  <DocumentView />
</EditorProvider>;
```

## Packages

| Package              | Purpose                                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@inkbrick/document` | Model, block schemas (zod), validation, serialization, migrations, export. No React, no DOM.                                                                                          |
| `@inkbrick/store`    | Transactions with rollback, history (undo/redo), subscriptions.                                                                                                                       |
| `@inkbrick/engine`   | `Editor`, commands, block controllers. Headless — usable on a server.                                                                                                                 |
| `@inkbrick/locales`  | UI dictionaries: English, and languages that load on demand (Russian).                                                                                                                |
| `@inkbrick/react`    | `EditorProvider`, `DocumentView`, default UI, input and clipboard handling.                                                                                                           |
| `@inkbrick/dom`      | Interface parts in plain DOM, usable without the editor and with any framework: colour picker with an alpha channel (`/color-picker`), image crop window and viewer (`/image-tools`). |
| `@inkbrick/styles`   | Default styles: design tokens, themes, `@layer` + `:where()` over `data-inkbrick-*` attributes.                                                                                       |

## Documentation

Guides (in Russian): [UI customization and custom blocks](docs/ui-customization.md) ·
[undo/redo](docs/history.md) · [selection](docs/selection.md) · [slash menu](docs/slash-menu.md) ·
[toolbar, block menu, drag and drop](docs/toolbar-and-blocks.md) · [read-only](docs/read-only.md) ·
[clipboard](docs/clipboard.md) · [images and callouts](docs/images-and-callout.md) · [styling](docs/styling.md) ·
[i18n](docs/i18n.md) · [formulas](docs/formulas.md) · [text style](docs/text-style.md) ·
[code highlighting](docs/code-highlighting.md) · [schemas, nesting, versions](docs/schema-rules.md) ·
[export](docs/export.md) · [keymap](docs/keymap.md) · [tables](docs/tables.md) · [table of contents](docs/toc.md) ·
[columns](docs/columns.md) · [toggles](docs/toggle.md) · [footnotes](docs/footnotes.md) ·
[find and replace](docs/find-replace.md) · [command palette](docs/command-palette.md) · [tags](docs/tags.md) ·
[word count](docs/word-count.md) · [folding headings](docs/heading-folding.md) ·
[folding list items](docs/list-folding.md) · [picking several blocks](docs/block-picking.md) ·
[block background](docs/block-background.md) · [spellcheck](docs/spellcheck.md).

Each package on npm has its own README with a short example.

API reference: `pnpm docs:api` generates it into `docs/api` from the TSDoc comments.

## Development

```bash
pnpm install
pnpm dev              # sandbox: every block type, themes, languages, a debug panel, JSON import/export, autosave;
                      # `?demo=table` (or the switch in the corner) is the table editor with the same tools
pnpm test:coverage    # unit tests with coverage thresholds
pnpm test:e2e         # Playwright: Chromium, Firefox, WebKit
pnpm typecheck && pnpm lint && pnpm size && pnpm audit
pnpm build:packages   # ESM + .d.ts for npm
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the architecture and conventions, [SECURITY.md](SECURITY.md) for the
threat model and CSP, and [CHANGELOG.md](CHANGELOG.md) for changes.

## License

[MIT](LICENSE)
