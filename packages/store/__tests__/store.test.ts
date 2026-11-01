import { describe, expect, it } from 'vitest';

import { createDocument, type BaseBlock } from '@inkbrick/document';

import {
  createStore,
  DeleteBlockChange,
  InsertChildChange,
  MoveChildChange,
  RemoveChildChange,
  SetBlockChange,
  UpdateBlockChange,
} from '../src';

const paragraph = (id: string, parentId: string): BaseBlock => ({
  id,
  flavour: 'block:paragraph',
  parentId,
  children: [],
  content: [{ insert: id }],
  props: {},
});

function setup() {
  const document = createDocument();
  const store = createStore({ document });
  const page = document.getBlock(document.rootId)!;
  const noteId = page.children[0];
  const firstId = document.getBlock(noteId)!.children[0];

  return { document, store, noteId, firstId };
}

describe('DocumentStore', () => {
  it('notifies block and global listeners once per commit', () => {
    const { store, noteId } = setup();
    let global = 0;
    let note = 0;
    let unrelated = 0;

    store.subscribe(() => global++);
    store.subscribeBlock(noteId, () => note++);
    store.subscribeBlock('other', () => unrelated++);

    store.transact((tx) => {
      tx.apply(new SetBlockChange(paragraph('p2', noteId)));
      tx.apply(new InsertChildChange(noteId, 1, 'p2'));
    });

    expect(global).toBe(1);
    expect(note).toBe(1);
    expect(unrelated).toBe(0);
    expect(store.getVersion()).toBe(1);
  });

  it('does not notify or bump the version for empty transactions', () => {
    const { store } = setup();
    let calls = 0;
    store.subscribe(() => calls++);

    store.transact(() => undefined);

    expect(calls).toBe(0);
    expect(store.getVersion()).toBe(0);
  });

  it('rolls back every change when the callback throws', () => {
    const { document, store, noteId, firstId } = setup();
    const before = structuredClone(document.dump());

    expect(() =>
      store.transact((tx) => {
        tx.apply(new SetBlockChange(paragraph('p2', noteId)));
        tx.apply(new InsertChildChange(noteId, 1, 'p2'));
        tx.apply(new UpdateBlockChange(firstId, { content: [{ insert: 'changed' }] }));
        throw new Error('boom');
      }),
    ).toThrow('boom');

    expect(document.dump()).toEqual(before);
    expect(store.getVersion()).toBe(0);
  });

  it('reverts remove/delete/move changes', () => {
    const { document, store, noteId, firstId } = setup();

    store.transact((tx) => {
      tx.apply(new SetBlockChange(paragraph('p2', noteId)));
      tx.apply(new InsertChildChange(noteId, 1, 'p2'));
    });

    const before = structuredClone(document.dump());

    expect(() =>
      store.transact((tx) => {
        tx.apply(new MoveChildChange(noteId, firstId, 'p2', 0));
        tx.apply(new RemoveChildChange(noteId, firstId));
        tx.apply(new DeleteBlockChange(firstId));
        throw new Error('boom');
      }),
    ).toThrow();

    expect(document.dump()).toEqual(before);
  });

  it('rejects use of a finished transaction', () => {
    const { store } = setup();
    const tx = store.createTransaction();

    tx.commit();

    expect(() => tx.commit()).toThrow();
    expect(() => tx.apply(new DeleteBlockChange('x'))).toThrow();
  });

  it('unsubscribes cleanly', () => {
    const { store, noteId } = setup();
    let calls = 0;
    const off = store.subscribeBlock(noteId, () => calls++);

    off();
    store.transact((tx) => tx.apply(new UpdateBlockChange(noteId, { props: {} })));

    expect(calls).toBe(0);
  });
});

describe('transactions and subscribers', () => {
  const failing = () => {
    throw new Error('listener failed');
  };

  it('a throwing subscriber neither breaks the commit nor the other subscribers', () => {
    const { store, firstId, document } = setup();
    const reported: unknown[] = [];
    const original = globalThis.reportError;
    const seen: string[] = [];

    globalThis.reportError = (error: unknown) => reported.push(error);

    try {
      store.subscribe(failing);
      store.subscribe(() => seen.push('global'));
      store.subscribeBlock(firstId, failing);
      store.subscribeBlock(firstId, () => seen.push('block'));

      const result = store.transact((tx) => {
        tx.apply(new UpdateBlockChange(firstId, { content: [{ insert: 'kept' }] }));
        return 'ok';
      });

      expect(result).toBe('ok');
      expect(document.getBlock(firstId)!.content).toEqual([{ insert: 'kept' }]);
      expect(seen).toEqual(['block', 'global']);
      expect(reported).toHaveLength(2);
      expect(store.canUndo).toBe(true);
    } finally {
      globalThis.reportError = original;
    }
  });

  it('an exception inside the transaction rolls everything back', () => {
    const { store, firstId, document } = setup();

    expect(() =>
      store.transact((tx) => {
        tx.apply(new UpdateBlockChange(firstId, { content: [{ insert: 'lost' }] }));
        throw new Error('boom');
      }),
    ).toThrow('boom');

    expect(document.getBlock(firstId)!.content).toEqual([]);
    expect(store.canUndo).toBe(false);
  });

  it('an async callback is rejected and its synchronous part is rolled back', () => {
    const { store, firstId, document } = setup();

    expect(() =>
      store.transact(async (tx) => {
        tx.apply(new UpdateBlockChange(firstId, { content: [{ insert: 'half' }] }));
      }),
    ).toThrow(/must be synchronous/);

    expect(document.getBlock(firstId)!.content).toEqual([]);
    expect(store.canUndo).toBe(false);
  });
});

describe('rollback of a partially executed transaction', () => {
  it('a change that fails midway (move into its own descendant) leaves the document exactly as before', () => {
    const { store, document, noteId, firstId } = setup();

    store.transact((tx) => {
      tx.apply(new SetBlockChange(paragraph('child', firstId)));
      tx.apply(new InsertChildChange(firstId, 0, 'child'));
    });

    const before = structuredClone(document.dump());

    expect(() =>
      store.transact((tx) => {
        tx.apply(new UpdateBlockChange(firstId, { content: [{ insert: 'changed' }] }));
        tx.apply(new MoveChildChange(noteId, 'child', firstId, 0));
      }),
    ).toThrow(/inside itself/);

    expect(document.dump()).toEqual(before);
  });
});
