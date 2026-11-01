import { describe, expect, it } from 'vitest';

import { createDocument, type BaseBlock } from '@inkbrick/document';

import { createStore, InsertChildChange, SetBlockChange, UpdateBlockChange } from '../src';

const paragraph = (id: string, parentId: string): BaseBlock => ({
  id,
  flavour: 'block:paragraph',
  parentId,
  children: [],
  content: [],
  props: {},
});

function setup(options: { mergeWindowMs?: number; limit?: number } = {}) {
  let time = 0;
  const document = createDocument();
  const store = createStore({ document, history: { ...options, now: () => time } });
  const noteId = document.getBlock(document.rootId)!.children[0];
  const firstId = document.getBlock(noteId)!.children[0];

  const setText = (text: string, opts: { mergeKey?: string; history?: boolean } = {}) =>
    store.transact(
      (tx) => tx.apply(new UpdateBlockChange(firstId, { content: [{ insert: text }] })),
      opts,
    );

  const text = () =>
    document
      .getBlock(firstId)!
      .content.map((n) => n.insert)
      .join('');
  const advance = (ms: number) => (time += ms);

  return { document, store, noteId, firstId, setText, text, advance };
}

describe('undo / redo', () => {
  it('reverts and restores a step', () => {
    const { store, setText, text } = setup();

    setText('a');
    setText('ab');

    expect(store.canUndo).toBe(true);
    store.undo();
    expect(text()).toBe('a');
    store.undo();
    expect(text()).toBe('');
    expect(store.canUndo).toBe(false);
    expect(store.canRedo).toBe(true);

    store.redo();
    store.redo();
    expect(text()).toBe('ab');
    expect(store.canRedo).toBe(false);
  });

  it('returns undefined when there is nothing to do', () => {
    const { store } = setup();

    expect(store.undo()).toBeUndefined();
    expect(store.redo()).toBeUndefined();
  });

  it('a new change clears the redo stack', () => {
    const { store, setText } = setup();

    setText('a');
    store.undo();
    setText('b');

    expect(store.canRedo).toBe(false);
  });

  it('undoes structural changes (insert block + child)', () => {
    const { document, store, noteId } = setup();
    const before = structuredClone(document.dump());

    store.transact((tx) => {
      tx.apply(new SetBlockChange(paragraph('p2', noteId)));
      tx.apply(new InsertChildChange(noteId, 1, 'p2'));
    });
    const after = structuredClone(document.dump());

    store.undo();
    expect(document.dump()).toEqual(before);
    store.redo();
    expect(document.dump()).toEqual(after);
  });

  it('notifies block and global subscribers and bumps versions', () => {
    const { store, firstId, setText } = setup();
    setText('a');

    let block = 0;
    let global = 0;
    store.subscribeBlock(firstId, () => block++);
    store.subscribe(() => global++);
    const version = store.getVersion();
    const historyVersion = store.getHistoryVersion();

    store.undo();

    expect(block).toBe(1);
    expect(global).toBeGreaterThan(0);
    expect(store.getVersion()).toBe(version + 1);
    expect(store.getHistoryVersion()).toBeGreaterThan(historyVersion);
  });

  it('does not record failed transactions or history:false changes', () => {
    const { store, setText, text } = setup();

    expect(() =>
      store.transact(() => {
        throw new Error('boom');
      }),
    ).toThrow();
    setText('seed', { history: false });

    expect(store.canUndo).toBe(false);
    expect(text()).toBe('seed');
  });

  it('does not record empty transactions', () => {
    const { store } = setup();

    store.transact(() => undefined);

    expect(store.canUndo).toBe(false);
  });

  it('respects the step limit', () => {
    const { store, setText, text } = setup({ limit: 2 });

    setText('1');
    setText('2');
    setText('3');
    store.undo();
    store.undo();

    expect(store.canUndo).toBe(false);
    expect(text()).toBe('1');
  });

  it('clearHistory forgets everything', () => {
    const { store, setText } = setup();

    setText('a');
    store.undo();
    store.clearHistory();

    expect(store.canUndo).toBe(false);
    expect(store.canRedo).toBe(false);
  });

  it('carries meta of the step', () => {
    const { store, firstId } = setup();

    store.transact(
      (tx) => tx.apply(new UpdateBlockChange(firstId, { content: [{ insert: 'x' }] })),
      {
        describe: () => ({ before: 'B', after: 'A' }),
      },
    );

    expect(store.undo()!.meta).toEqual({ before: 'B', after: 'A' });
    expect(store.redo()!.meta).toEqual({ before: 'B', after: 'A' });
  });
});

describe('merging', () => {
  it('merges same-key steps inside the window into one undo step', () => {
    const { store, setText, text, advance } = setup();

    setText('a', { mergeKey: 'k' });
    advance(100);
    setText('ab', { mergeKey: 'k' });
    advance(100);
    setText('abc', { mergeKey: 'k' });

    store.undo();
    expect(text()).toBe('');
    expect(store.canUndo).toBe(false);

    store.redo();
    expect(text()).toBe('abc');
  });

  it('keeps first "before" and last "after" in merged meta', () => {
    const { store, firstId, advance } = setup();
    const type = (t: string, before: number, after: number) =>
      store.transact(
        (tx) => tx.apply(new UpdateBlockChange(firstId, { content: [{ insert: t }] })),
        {
          mergeKey: 'k',
          describe: () => ({ before, after }),
        },
      );

    type('a', 0, 1);
    advance(10);
    type('ab', 1, 2);

    expect(store.undo()!.meta).toEqual({ before: 0, after: 2 });
  });

  it('does not merge after the window, for another key, without key, or after seal()', () => {
    const { store, setText, text, advance } = setup({ mergeWindowMs: 500 });

    setText('a', { mergeKey: 'k' });
    advance(600);
    setText('ab', { mergeKey: 'k' }); // окно истекло
    setText('abc', { mergeKey: 'other' }); // другой ключ
    setText('abcd'); // без ключа
    setText('abcde', { mergeKey: 'k' });
    store.sealHistory();
    setText('abcdef', { mergeKey: 'k' }); // после seal

    for (let i = 0; i < 6; i++) store.undo();

    expect(text()).toBe('');
    expect(store.canUndo).toBe(false);
  });

  it('does not merge into a step that was just undone/redone', () => {
    const { store, setText, text } = setup();

    setText('a', { mergeKey: 'k' });
    setText('ab', { mergeKey: 'k' });
    store.undo();
    store.redo();
    setText('abc', { mergeKey: 'k' });

    store.undo();
    expect(text()).toBe('ab');
  });
});

describe('subscribeChanges', () => {
  it('reports changed blocks after commit, undo and redo; empty transactions are silent', () => {
    const { store, firstId, setText } = setup();
    const seen: string[][] = [];
    const off = store.subscribeChanges((ids) => seen.push([...ids]));

    setText('a');
    store.transact(() => {});
    store.undo();
    store.redo();

    expect(seen).toEqual([[firstId], [firstId], [firstId]]);

    off();
    setText('b');
    expect(seen).toHaveLength(3);
  });

  it('lets a listener make its own edit as a separate history step', () => {
    const { store, setText, text } = setup();
    let nested = false;

    store.subscribeChanges(() => {
      if (nested) return;
      nested = true;
      setText('nested');
    });

    setText('a');
    expect(text()).toBe('nested');

    store.undo();
    expect(text()).toBe('a');
  });
});
