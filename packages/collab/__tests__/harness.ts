import * as Y from 'yjs';

import {
  createSchemaRegistry,
  createDocument,
  serializeDocument,
  type SchemaRegistry,
} from '@inkbrick/document';
import { Editor } from '@inkbrick/engine';

import { REMOTE_ORIGIN, createCollab, initYDoc, type Collab } from '../src';

export interface Peer {
  name: string;
  ydoc: Y.Doc;
  collab: Collab;
  editor: Editor;
  inbox: Array<{ update: Uint8Array; at: number }>;
  online: boolean;
}

export const schema: SchemaRegistry = createSchemaRegistry();

/** Начальный документ создаёт «сервер»: пустой Y.Doc с одной заметкой и абзацем. */
export function createServerState(): Uint8Array {
  const ydoc = new Y.Doc();

  initYDoc(ydoc, serializeDocument(createDocument({ schema }), schema));

  return Y.encodeStateAsUpdate(ydoc);
}

export function createPeer(name: string, state: Uint8Array): Peer {
  const ydoc = new Y.Doc();

  Y.applyUpdate(ydoc, state, REMOTE_ORIGIN);

  const collab = createCollab({
    ydoc,
    schema,
    undoCaptureMs: Number(process.env.COLLAB_UNDO_MS ?? 1000),
  });
  const editor = new Editor({ schema, document: collab.createDocument() });

  collab.attach(editor.store);

  return { name, ydoc, collab, editor, inbox: [], online: true };
}

export const text = (peer: Peer, id: string): string =>
  peer.editor.store
    .getBlock(id)!
    .content.map((node) => node.insert)
    .join('');

export const firstParagraph = (peer: Peer): string => {
  const doc = peer.editor.document;
  const noteId = doc.getBlock(doc.rootId)!.children[0];

  return doc.getBlock(noteId)!.children[0];
};

export function syncAll(peers: readonly Peer[]): void {
  for (let round = 0; round < 3; round++) {
    for (const a of peers) {
      for (const b of peers) {
        if (a !== b)
          Y.applyUpdate(
            b.ydoc,
            Y.encodeStateAsUpdate(a.ydoc, Y.encodeStateVector(b.ydoc)),
            REMOTE_ORIGIN,
          );
      }
    }
  }
}
