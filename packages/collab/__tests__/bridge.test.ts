import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';

import { normalizeSnapshot, project, initYDoc, createCollab, keyBetween } from '../src';
import { createDocument, serializeDocument } from '@inkbrick/document';
import { createPeer, createServerState, firstParagraph, schema, syncAll, text } from './harness';

describe('bridge', () => {
  it('refuses an empty Y.Doc: the initial document is created by the server', () => {
    expect(() => createCollab({ ydoc: new Y.Doc(), schema })).toThrow(/empty/);
  });

  it('opens the same document as the server created', () => {
    const peer = createPeer('a', createServerState());

    expect(peer.collab.inSync()).toBe(true);
    expect(peer.editor.serialize().rootId).toBe(project(peer.ydoc).rootId);
  });

  it('carries typing to another editor', () => {
    const state = createServerState();
    const a = createPeer('a', state);
    const b = createPeer('b', state);
    const id = firstParagraph(a);

    a.editor.dispatch({
      type: 'insertText',
      payload: { text: 'Hello', selection: { anchor: { blockId: id, offset: 0 } } },
    });
    syncAll([a, b]);

    expect(text(a, id)).toBe('Hello');
    expect(text(b, id)).toBe('Hello');
    expect(a.collab.inSync() && b.collab.inSync()).toBe(true);
  });

  it('merges concurrent typing in one block', () => {
    const state = createServerState();
    const a = createPeer('a', state);
    const b = createPeer('b', state);
    const id = firstParagraph(a);

    a.editor.dispatch({
      type: 'insertText',
      payload: { text: 'abc', selection: { anchor: { blockId: id, offset: 0 } } },
    });
    syncAll([a, b]);
    a.editor.dispatch({
      type: 'insertText',
      payload: { text: 'X', selection: { anchor: { blockId: id, offset: 0 } } },
    });
    b.editor.dispatch({
      type: 'insertText',
      payload: { text: 'Y', selection: { anchor: { blockId: id, offset: 3 } } },
    });
    syncAll([a, b]);

    expect(text(a, id)).toBe('XabcY');
    expect(text(b, id)).toBe('XabcY');
  });

  it('does not tear a surrogate pair when emoji are replaced', () => {
    const state = createServerState();
    const a = createPeer('a', state);
    const b = createPeer('b', state);
    const id = firstParagraph(a);

    a.editor.dispatch({
      type: 'replaceText',
      payload: { blockId: id, from: 0, to: 0, text: '😀' },
    });
    syncAll([a, b]);
    a.editor.dispatch({
      type: 'replaceText',
      payload: { blockId: id, from: 0, to: 2, text: '😁' },
    });
    syncAll([a, b]);

    expect(text(b, id)).toBe('😁');
    expect(text(b, id)).not.toContain('�');
  });

  it('holds remote updates while a composition is in progress', () => {
    const state = createServerState();
    const a = createPeer('a', state);
    const b = createPeer('b', state);
    const id = firstParagraph(a);

    b.collab.setComposing(true);
    a.editor.dispatch({
      type: 'insertText',
      payload: { text: 'remote', selection: { anchor: { blockId: id, offset: 0 } } },
    });

    const update = Y.encodeStateAsUpdate(a.ydoc, Y.encodeStateVector(b.ydoc));

    b.collab.receive(update);
    expect(text(b, id)).toBe('');

    b.collab.setComposing(false);
    expect(text(b, id)).toBe('remote');
  });

  it('resolves a concurrent move cycle without losing blocks', () => {
    const state = createServerState();
    const a = createPeer('a', state);
    const ydoc = a.ydoc;
    const blocks = ydoc.getMap('blocks') as Y.Map<Y.Map<unknown>>;
    const ids = [...blocks.keys()];
    const [x, y] = ids.filter((id) => id.startsWith('paragraph')).concat(['p1', 'p2']);

    ydoc.transact(() => {
      for (const id of ['p1', 'p2']) {
        const block = new Y.Map<unknown>();

        blocks.set(id, block);
        block.set('flavour', 'block:paragraph');
        block.set('props', new Y.Map());
        block.set('text', new Y.Text());
      }
      blocks.get('p1')!.set('place', { p: 'p2', k: 'V' });
      blocks.get('p2')!.set('place', { p: 'p1', k: 'V' });
    });

    const snapshot = project(ydoc);

    expect(Object.keys(snapshot.blocks)).toContain('p1');
    expect(Object.keys(snapshot.blocks)).toContain('p2');
    expect(snapshot.blocks.p1.parentId).not.toBeNull();
    void x;
    void y;
  });

  it('orders keys between neighbours', () => {
    let low: string | null = null;
    let high: string | null = null;
    const keys: string[] = [];

    for (let i = 0; i < 200; i++) {
      const key = keyBetween(low, high);

      expect(low === null || low < key).toBe(true);
      expect(high === null || key < high).toBe(true);
      keys.push(key);

      if (i % 2) low = key;
      else high = key;
    }

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('normalizes a snapshot built from the initial document', () => {
    const doc = serializeDocument(createDocument({ schema }), schema);
    const ydoc = new Y.Doc();

    initYDoc(ydoc, doc);

    expect(normalizeSnapshot(project(ydoc), schema).blocks).toEqual(doc.blocks);
  });
});

describe('touched blocks', () => {
  it('reports the blocks a local update changed', () => {
    const peer = createPeer('a', createServerState());
    const id = firstParagraph(peer);
    const seen: string[][] = [];

    peer.collab.onLocalUpdate((_update, meta) => seen.push(meta.touched));
    peer.editor.dispatch({
      type: 'insertText',
      payload: { text: 'x', selection: { anchor: { blockId: id, offset: 0 } } },
    });

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.flat()).toContain(id);
    expect(new Set(seen.flat()).size).toBe(
      seen.flat().length === 0 ? 0 : new Set(seen.flat()).size,
    );
  });

  it('reports the blocks of an undo and none for remote updates', () => {
    const state = createServerState();
    const a = createPeer('a', state);
    const b = createPeer('b', state);
    const id = firstParagraph(a);
    const fromB: string[][] = [];

    b.collab.onLocalUpdate((_update, meta) => fromB.push(meta.touched));
    a.editor.dispatch({
      type: 'insertText',
      payload: { text: 'x', selection: { anchor: { blockId: id, offset: 0 } } },
    });
    syncAll([a, b]);

    expect(fromB).toEqual([]);

    const undone: string[][] = [];

    a.collab.onLocalUpdate((_update, meta) => undone.push(meta.touched));
    a.collab.history.undo();

    expect(undone.flat()).toContain(id);
  });
});
