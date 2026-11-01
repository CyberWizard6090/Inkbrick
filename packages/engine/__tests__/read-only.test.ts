import { describe, expect, it } from 'vitest';

import { Editor, type CaretResult } from '../src';

function setup() {
  const editor = new Editor();
  const noteId = editor.document.getBlock(editor.document.rootId)!.children[0];
  const firstId = editor.document.getBlock(noteId)!.children[0];

  editor.dispatch({
    type: 'replaceText',
    payload: { blockId: firstId, from: 0, to: 0, text: 'text' },
  });

  return { editor, noteId, firstId };
}

describe('read-only mode', () => {
  it('refuses every command and leaves the document unchanged', () => {
    const { editor, noteId, firstId } = setup();
    editor.setReadOnly(true);
    const before = structuredClone(editor.document.dump());

    const attempts = [
      () =>
        editor.dispatch({
          type: 'replaceText',
          payload: { blockId: firstId, from: 0, to: 0, text: 'x' },
        }),
      () => editor.dispatch({ type: 'deleteBackward', payload: { blockId: firstId, offset: 2 } }),
      () => editor.dispatch({ type: 'splitBlock', payload: { blockId: firstId, offset: 1 } }),
      () =>
        editor.dispatch({
          type: 'convertBlock',
          payload: { blockId: firstId, flavour: 'block:heading', props: { level: 1 } },
        }),
      () =>
        editor.dispatch({
          type: 'insertBlock',
          payload: { flavour: 'block:paragraph', afterId: firstId },
        }),
      () =>
        editor.dispatch({
          type: 'toggleFormat',
          payload: { blockId: firstId, from: 0, to: 4, format: 'bold' },
        }),
      () => editor.dispatch({ type: 'duplicateBlock', payload: { blockId: firstId } }),
      () => editor.execute('delete-block', { id: firstId }),
      () => editor.execute('insert-paragraph', { targetId: firstId }),
    ];

    for (const attempt of attempts) expect(attempt()).toBeUndefined();

    expect(editor.document.dump()).toEqual(before);
    expect(editor.store.getBlock(noteId)!.children).toEqual([firstId]);
    expect(editor.canUndo).toBe(true); // история сохранилась, но применять её нельзя
  });

  it('disables undo/redo and can()', () => {
    const { editor, firstId } = setup();
    editor.sealHistory();
    editor.dispatch({
      type: 'replaceText',
      payload: { blockId: firstId, from: 4, to: 4, text: '!' },
    });

    editor.setReadOnly(true);

    expect(editor.undo()).toBeUndefined();
    expect(editor.can('replaceText', { blockId: firstId, from: 0, to: 0, text: 'x' })).toBe(false);

    editor.setReadOnly(false);

    expect(editor.can('replaceText', { blockId: firstId, from: 0, to: 0, text: 'x' })).toBe(true);
    expect(editor.undo()).toBeDefined();
  });

  it('a batch started in read-only mode changes nothing and records no history', () => {
    const { editor, firstId } = setup();
    editor.clearHistory();
    editor.setReadOnly(true);

    editor.batch(() => {
      editor.dispatch({
        type: 'replaceText',
        payload: { blockId: firstId, from: 0, to: 0, text: 'x' },
      });
    });

    expect(editor.canUndo).toBe(false);
  });

  it('notifies subscribers only when the mode really changes, and can be unsubscribed', () => {
    const { editor } = setup();
    let calls = 0;
    const off = editor.subscribeReadOnly(() => calls++);

    editor.setReadOnly(true);
    editor.setReadOnly(true);
    editor.setReadOnly(false);
    expect(calls).toBe(2);

    off();
    editor.setReadOnly(true);
    expect(calls).toBe(2);
    expect(editor.readOnly).toBe(true);
  });

  it('reading still works: formats and block lookups', () => {
    const { editor, firstId } = setup();
    editor.setReadOnly(true);

    expect(
      editor.formatsAt({ blockId: firstId, offset: 0 }, { blockId: firstId, offset: 4 }).bold,
    ).toBe(false);
    expect(
      editor.blocksBetween({ blockId: firstId, offset: 0 }, { blockId: firstId, offset: 2 }),
    ).toEqual([firstId]);
  });
});

describe('blocksBetween', () => {
  it('lists known blocks in document order regardless of argument order, including blocks without text', () => {
    const { editor, firstId } = setup();
    const second = (
      editor.dispatch({
        type: 'splitBlock',
        payload: { blockId: firstId, offset: 4 },
      }) as CaretResult
    ).blockId;
    const third = (
      editor.dispatch({
        type: 'convertBlock',
        payload: { blockId: second, flavour: 'block:divider' },
      }) as CaretResult
    ).blockId;

    const from = { blockId: firstId, offset: 1 };
    const to = { blockId: third, offset: 0 };

    expect(editor.blocksBetween(from, to)).toEqual([firstId, second, third]);
    expect(editor.blocksBetween(to, from)).toEqual([firstId, second, third]);
    expect(editor.blocksBetween({ blockId: 'nope', offset: 0 }, from)).toEqual([]);
  });
});
