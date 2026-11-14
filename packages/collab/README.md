# @inkbrick/collab

Collaborative editing for Inkbrick on top of [Yjs](https://github.com/yjs/yjs). Prototype: the format `inkbrick-yjs` is
not frozen yet.

- `createCollab({ ydoc, schema })` keeps a `DocumentStore` and a `Y.Doc` in sync. The `Y.Doc` is the source of truth; the
  store is its projection (`project`, `normalizeSnapshot`).
- `openDocument(...)` loads a document from the Rabbit Hole server and returns a `Collab` plus a `DocumentConnection`.
- `DocumentConnection` joins the WebSocket room of the document: sends local updates (with the changed block ids), applies
  updates of others, catches up after a reconnect, and keeps the list of people in the document with their awareness state.

```ts
import { Editor } from '@inkbrick/engine';
import { openDocument } from '@inkbrick/collab';

const { collab, connection } = await openDocument({
  baseUrl: 'https://api.example.com',
  getToken: () => accessToken, // called again on every reconnect
  documentId: 42,
  schema,
});

// Inkbrick's own history reverts whole blocks and would erase other people's edits: undo goes through Yjs.
const editor = new Editor({ schema, document: collab.createDocument(), history: { limit: 0 } });

collab.attach(editor.store);
connection.subscribe(() => editor.setReadOnly(!connection.canWrite)); // viewers only read
connection.connect();

// Undo and redo: collab.history.undo() / redo().
// IME: call collab.setComposing(true) on compositionstart and false on compositionend.
// Presence: connection.peers, connection.setAwareness({ name, color, selection }).
// Cursors inside the text: selection = collab.shareSelection({ anchor, head }) (relative Yjs positions, so a cursor stays
// between the same characters when others edit); the others' cursors = cursorsOf(collab.ydoc, connection.peers),
// drawn by <RemoteCursors cursors={...} /> from @inkbrick/react (re-decode them after every edit of the document).
```

Offline: edits made while the connection is down (or after `close()`) are kept and sent after the next connect; Yjs
updates are idempotent, so a repeated send is harmless. A refused update (`UPDATE_TOO_LARGE`, `INVALID_UPDATE`) is
dropped and reported to `onError`.

## Tests

```bash
pnpm vitest run --project @inkbrick/collab                 # bridge, convergence fuzz, provider on an in-memory server
COLLAB_E2E_URL=http://127.0.0.1:8081 pnpm vitest run --project @inkbrick/collab server.e2e   # against a real server
COLLAB_FUZZ_RUNS=600 COLLAB_FUZZ_STEPS=150 pnpm vitest run --project @inkbrick/collab convergence
```

The sandbox page `collab.html` shows both modes: an in-memory network and a real server (`#server`).
