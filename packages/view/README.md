# @inkbrick/view

The framework-agnostic core of the [Inkbrick](https://github.com/CyberWizard6090/Inkbrick) editor UI. Everything the
editor does in the browser that does not need a framework lives here:

- `EditorView` — the bridge between the model and the DOM: the root element, the element of every text block, placing
  the caret and the selection after an edit;
- selection: `readDocSelection`, `setDomSelection`, `getOffsetIn`, `findPoint`;
- input: `applyBeforeInput` (typing, Enter, Backspace, Markdown shortcuts, the slash menu trigger) and `createInputActions`;
- rendering of inline text into a block element: `renderInline`, `renderCode`, formulas (`temmlRenderer`);
- the state of the UI parts: slash menu, formatting toolbar, context menu, find and replace, command palette, folded
  headings, picked blocks, table cell selection, the block handle, the visible window of a large document.

[`@inkbrick/react`](https://www.npmjs.com/package/@inkbrick/react) is a set of React components over this package. A
binding for another framework (Vue, Svelte, Solid or none) takes the same core and draws its own components.

```bash
npm install @inkbrick/view @inkbrick/engine
```

```ts
import { Editor } from '@inkbrick/engine';
import {
  EditorView,
  readDocSelection,
  renderInline,
  toggleFormatInSelection,
} from '@inkbrick/view';

const editor = new Editor();
// `commit` makes an edit render before the caret is placed; a UI that draws synchronously can leave it out.
const view = new EditorView({ commit: (update) => update() });

view.setRoot(root); // the contenteditable element
view.register(blockId, element); // an element with class="editable" and data-id="<block id>"
renderInline(element, editor.document.getBlock(blockId)!.content);

const selection = readDocSelection(root);
if (selection) toggleFormatInSelection(editor, view, selection, 'bold');
```

The API follows the editor's alpha: it may change between releases until 1.0.

## License

MIT
