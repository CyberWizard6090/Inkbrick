# @inkbrick/store

The document store of [Inkbrick](https://github.com/CyberWizard6090/Inkbrick): transactions with rollback, undo/redo
history with grouping, subscriptions to the whole document and to single blocks, optional block `meta` (who and when
created or changed a block).

```bash
npm install @inkbrick/store @inkbrick/document
```

Applications rarely use it directly: `Editor` from [`@inkbrick/engine`](https://www.npmjs.com/package/@inkbrick/engine)
creates the store and exposes it as `editor.store`.

```ts
import { Editor } from '@inkbrick/engine';

const editor = new Editor();

// Any change to the document.
const stop = editor.store.subscribe(() => save(editor.serialize()));

// Only the blocks a change touched (after the history step is recorded).
editor.store.subscribeChanges((blockIds) => console.log('changed', blockIds));

declare function save(snapshot: unknown): void;

stop();
```

## License

MIT
