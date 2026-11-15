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
// Undo only reverts your own edits. If it removes a block (undoing a split) in which someone else typed meanwhile, that
// text is not lost: it is added to the end of the nearest block that stays, and taken back out if redo brings the block back.
// IME: call collab.setComposing(true) on compositionstart and false on compositionend.
// Presence: connection.peers, connection.setAwareness({ name, color, selection }).
// Cursors inside the text: selection = collab.shareSelection({ anchor, head }) (relative Yjs positions, so a cursor stays
// between the same characters when others edit); the others' cursors = cursorsOf(collab.ydoc, connection.peers),
// drawn by <RemoteCursors cursors={...} /> from @inkbrick/react (re-decode them after every edit of the document).
```

The server closes the connection at once when the document is deleted (`status` becomes `closed` and `onError` gets
`DOCUMENT_NOT_FOUND`, no reconnect) and when the person's access changes (removed, new role, signed out everywhere): the
client then reconnects with a new ticket, which is refused (it stops) or gives the new rights (`canWrite`).

Offline: edits made while the connection is down (or after `close()`) are kept and sent after the next connect; Yjs
updates are idempotent, so a repeated send is harmless.

Reloads: pass `pendingStore` to `openDocument` and the unsent edits also survive a reload or a crash of the page. They are
applied to the document before the editor is created (the person sees their work again) and sent after the first connect;
an edit the server already has is dropped instead of being sent twice.

```ts
import { indexedDbPendingStore } from '@inkbrick/collab';

const { collab, connection } = await openDocument({
  // ...as above
  // One scope per user and document: another person signing in on the same browser must not send these edits.
  pendingStore: indexedDbPendingStore({ scope: `${userId}:${documentId}` }),
});

connection.unsent; // how many edits wait for the server (the connection notifies subscribers when it changes)
await connection.saved(); // everything is written to the store
await connection.discardPending(); // sign-out: forget the unsent edits
```

`discardPending` is meant for sign-out. If it forgot edits, the document in memory still contains them, and later edits would
build on updates the server never got, so after it local edits are not sent any more and `onError` gets `EDITS_DISCARDED`
(409): reload the document (`openDocument`) to continue editing.

Each edit is a record of its own (two tabs do not overwrite each other); a long offline stretch is merged into one record
every 50 edits. A write that fails (quota) is reported to `onError` as `PENDING_STORE_FAILED` and editing continues. Opening
a document still needs the server (the state is loaded first); only the unsent edits survive offline reloads. A refused update (`UPDATE_TOO_LARGE`, `INVALID_UPDATE`) is
dropped and reported to `onError`.

## Tests

```bash
pnpm vitest run --project @inkbrick/collab                 # bridge, convergence fuzz, provider on an in-memory server
COLLAB_E2E_URL=http://127.0.0.1:8081 pnpm vitest run --project @inkbrick/collab server.e2e   # against a real server
COLLAB_FUZZ_RUNS=600 COLLAB_FUZZ_STEPS=150 pnpm vitest run --project @inkbrick/collab convergence
```

The sandbox page `collab.html` shows both modes: an in-memory network and a real server (`#server`).
