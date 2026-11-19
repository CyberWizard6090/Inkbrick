# @inkbrick/react

React bindings and the default UI of [Inkbrick](https://github.com/CyberWizard6090/Inkbrick), a block-based document
editor: `EditorProvider`, `DocumentView`, the toolbar, the slash menu, block handles, input, selection and clipboard
handling. Every block view and every piece of the UI can be replaced.

```bash
npm install @inkbrick/react @inkbrick/engine @inkbrick/document @inkbrick/styles react react-dom
```

React 18 or 19. The package is ESM with type definitions.

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

Save the document with `editor.serialize()` (plain JSON) and load it with `deserializeDocument` from
`@inkbrick/document`.

## Optional blocks and tools

The default set covers paragraphs, headings, lists, quotes, callouts, code, images, formulas and dividers. The rest is
opt-in, so an application only ships what it uses. Pass the same block sets to the `Editor` and to the provider:

```tsx
import { Editor } from '@inkbrick/engine';
import {
  CommandPalette,
  DocumentView,
  EditorProvider,
  FindReplacePanel,
  WordCount,
  commandPalette,
  findReplace,
  footnoteBlocks,
  tableBlocks,
  tocBlocks,
} from '@inkbrick/react';

const blocks = [...tableBlocks, ...tocBlocks, ...footnoteBlocks];
const editor = new Editor({ blocks });

<EditorProvider
  editor={editor}
  blocks={blocks}
  keymap={[...findReplace.keymap, ...commandPalette.keymap]}
>
  <FindReplacePanel />
  <CommandPalette />
  <DocumentView />
  <WordCount />
</EditorProvider>;
```

| Export                                                  | What it adds                                              |
| ------------------------------------------------------- | --------------------------------------------------------- |
| `tableBlocks`                                           | Tables: column types, sorting, merged cells               |
| `tocBlocks`, `TocPanel`                                 | Table of contents block and side panel                    |
| `columnsBlocks`                                         | Blocks side by side                                       |
| `toggleBlocks`                                          | Collapsible toggle blocks                                 |
| `footnoteBlocks`                                        | Numbered footnotes                                        |
| `FindReplacePanel`, `findReplace`, `useFind`            | Find and replace (Ctrl/Cmd+F, Ctrl/Cmd+H)                 |
| `CommandPalette`, `commandPalette`, `useCommandPalette` | Command palette (Ctrl/Cmd+Shift+P) with your own commands |
| `TagHighlights`                                         | `#tags`: highlighting, suggestions, Ctrl/Cmd+click        |
| `WordCount`, `useWordCount`                             | Word and character counter                                |

Formula rendering, code highlighting, the HTML paste parser and the less common menus load as separate chunks on first
use.

## Customization

- **Views and shell:** `definePresentation({ components, slots })` replaces block views and UI parts (toolbar, menus,
  block handle) with your design system.
- **Own blocks:** `defineBlock` bundles a schema, a view, a controller, keys and slash-menu entries.
- **Styling:** stable `data-inkbrick-*` attributes, CSS layers and design tokens from `@inkbrick/styles`.
- **Languages:** English is built in, Russian loads on demand, others come from `registerLocale` or the `locales` prop.

## Documentation

Guides (in Russian) live in the [repository](https://github.com/CyberWizard6090/Inkbrick/tree/master/docs):
UI customization and custom blocks, tables, footnotes, find and replace, command palette, i18n, styling, clipboard,
keymap and more. The [main README](https://github.com/CyberWizard6090/Inkbrick#readme) has the overview in English.

## License

MIT
