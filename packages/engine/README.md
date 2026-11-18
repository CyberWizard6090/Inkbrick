# @inkbrick/engine

The headless editor of [Inkbrick](https://github.com/CyberWizard6090/Inkbrick): `Editor`, commands, block controllers,
undo/redo and clipboard fragments. No React and no DOM, so it also runs on a server, in a worker or in tests.

```bash
npm install @inkbrick/engine @inkbrick/document
```

## Usage

```ts
import { toMarkdown } from '@inkbrick/document';
import { Editor, type CaretResult } from '@inkbrick/engine';

const editor = new Editor();
const note = editor.document.getBlock(editor.document.rootId)!.children[0];
const first = editor.document.getBlock(note)!.children[0];

editor.dispatch({
  type: 'replaceText',
  payload: { blockId: first, from: 0, to: 0, text: 'Hello' },
});

const { blockId } = editor.dispatch({
  type: 'insertBlock',
  payload: { flavour: 'block:heading', afterId: first, props: { level: 2 } },
}) as CaretResult;

editor.dispatch({ type: 'replaceText', payload: { blockId, from: 0, to: 0, text: 'Section' } });
editor.undo();

toMarkdown(editor.document, { schema: editor.schema });
const snapshot = editor.serialize(); // plain JSON, load it back with deserializeDocument
```

- **Commands:** `editor.dispatch(intent)` for the typed built-in intents, `editor.execute(type, payload)` and
  `editor.can(type, payload)` for any command, including those of your own blocks. Every command runs in a
  transaction: it applies completely or not at all.
- **History:** `undo`, `redo`, `canUndo`, `canRedo`; typing is grouped into one step.
- **Read-only:** `editor.setReadOnly(true)` rejects every change.
- **Block sets:** `new Editor({ blocks })` adds schemas and controllers of optional or custom blocks.

The React UI lives in [`@inkbrick/react`](https://www.npmjs.com/package/@inkbrick/react).

## License

MIT
