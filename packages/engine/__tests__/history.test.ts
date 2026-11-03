import { describe, expect, it } from 'vitest';

import type { BlockId } from '@inkbrick/document';

import { Editor, type CaretResult } from '../src';

function setup() {
  const editor = new Editor();
  const noteId = editor.document.getBlock(editor.document.rootId)!.children[0];
  const firstId = editor.document.getBlock(noteId)!.children[0];

  const text = (id: BlockId) =>
    editor.engine.inline.toPlainText(editor.document.getBlock(id)?.content ?? []);
  const type = (blockId: BlockId, offset: number, value: string) =>
    editor.dispatch({
      type: 'replaceText',
      payload: { blockId, from: offset, to: offset, text: value },
    }) as CaretResult;
  const children = () => editor.document.getBlock(noteId)!.children;

  return { editor, noteId, firstId, text, type, children };
}

describe('Editor history', () => {
  it('typing character by character is one undo step', () => {
    const { editor, firstId, text, type } = setup();

    'hello'.split('').forEach((ch, i) => type(firstId, i, ch));

    expect(text(firstId)).toBe('hello');
    const undone = editor.undo()!;
    expect(text(firstId)).toBe('');
    expect(undone.caret).toEqual({ blockId: firstId, offset: 0 });

    const redone = editor.redo()!;
    expect(text(firstId)).toBe('hello');
    expect(redone.caret).toEqual({ blockId: firstId, offset: 5 });
  });

  it('typing and deleting are separate steps', () => {
    const { editor, firstId, text, type } = setup();

    type(firstId, 0, 'a');
    type(firstId, 1, 'b');
    editor.dispatch({ type: 'deleteBackward', payload: { blockId: firstId, offset: 2 } });

    editor.undo();
    expect(text(firstId)).toBe('ab');
    editor.undo();
    expect(text(firstId)).toBe('');
  });

  it('sealHistory starts a new step', () => {
    const { editor, firstId, text, type } = setup();

    type(firstId, 0, 'a');
    editor.sealHistory();
    type(firstId, 1, 'b');

    editor.undo();
    expect(text(firstId)).toBe('a');
  });

  it('undoes splitBlock and restores the caret to the split point', () => {
    const { editor, firstId, text, type, children } = setup();

    type(firstId, 0, 'abcd');
    editor.sealHistory();
    const { blockId: second } = editor.dispatch({
      type: 'splitBlock',
      payload: { blockId: firstId, offset: 2 },
    }) as CaretResult;

    const result = editor.undo()!;

    expect(children()).toEqual([firstId]);
    expect(editor.document.getBlock(second)).toBeUndefined();
    expect(text(firstId)).toBe('abcd');
    expect(result.caret).toEqual({ blockId: firstId, offset: 2 });

    editor.redo();
    expect(children()).toEqual([firstId, second]);
    expect(text(second)).toBe('cd');
  });

  it('undoes a block merge (Backspace at offset 0)', () => {
    const { editor, firstId, text, type, children } = setup();

    type(firstId, 0, 'ab');
    const { blockId: second } = editor.dispatch({
      type: 'splitBlock',
      payload: { blockId: firstId, offset: 2 },
    }) as CaretResult;
    type(second, 0, 'cd');
    editor.sealHistory();

    editor.dispatch({ type: 'deleteBackward', payload: { blockId: second, offset: 0 } });
    expect(children()).toEqual([firstId]);

    const result = editor.undo()!;

    expect(children()).toEqual([firstId, second]);
    expect(text(firstId)).toBe('ab');
    expect(text(second)).toBe('cd');
    expect(result.caret).toEqual({ blockId: second, offset: 0 });
  });

  it('undoes a merge that moved nested children', () => {
    const { editor, firstId, noteId, type } = setup();

    editor.dispatch({
      type: 'morphBlock',
      payload: { blockId: firstId, flavour: 'block:list', props: { type: 'bullet' } },
    });
    type(firstId, 0, 'a');
    const second = (
      editor.dispatch({
        type: 'splitBlock',
        payload: { blockId: firstId, offset: 1 },
      }) as CaretResult
    ).blockId;
    type(second, 0, 'b');
    const third = (
      editor.dispatch({
        type: 'splitBlock',
        payload: { blockId: second, offset: 1 },
      }) as CaretResult
    ).blockId;
    editor.dispatch({ type: 'indentBlock', payload: { blockId: third } });
    editor.sealHistory();

    editor.dispatch({ type: 'deleteBackward', payload: { blockId: second, offset: 0 } }); // пункт → параграф
    editor.sealHistory();
    const before = structuredClone(editor.document.dump());
    editor.dispatch({ type: 'deleteBackward', payload: { blockId: second, offset: 0 } }); // склейка
    expect(editor.document.getBlock(second)).toBeUndefined();

    editor.undo();

    expect(editor.document.dump()).toEqual(before);
    expect(editor.document.getBlock(noteId)!.children).toEqual([firstId, second]);
  });

  it('batch is a single undo step with the first "before" and last "after"', () => {
    const { editor, firstId, text, type, children } = setup();

    type(firstId, 0, 'x');
    editor.sealHistory();

    editor.batch(() => {
      const a = editor.dispatch({
        type: 'splitBlock',
        payload: { blockId: firstId, offset: 1 },
      }) as CaretResult;
      type(a.blockId, 0, 'y');
      editor.dispatch({ type: 'splitBlock', payload: { blockId: a.blockId, offset: 1 } });
    });
    expect(children().length).toBe(3);

    const result = editor.undo()!;

    expect(children()).toEqual([firstId]);
    expect(text(firstId)).toBe('x');
    expect(result.caret).toEqual({ blockId: firstId, offset: 1 });
  });

  it('a failing batch is rolled back entirely and leaves no history', () => {
    const { editor, firstId, text, type } = setup();
    type(firstId, 0, 'x');
    editor.clearHistory();
    const before = structuredClone(editor.document.dump());

    expect(() =>
      editor.batch(() => {
        type(firstId, 1, 'y');
        throw new Error('boom');
      }),
    ).toThrow('boom');

    expect(editor.document.dump()).toEqual(before);
    expect(editor.canUndo).toBe(false);
    expect(text(firstId)).toBe('x');
  });

  it('a batch that changes nothing records nothing', () => {
    const { editor } = setup();

    editor.batch(() => undefined);

    expect(editor.canUndo).toBe(false);
  });

  it('undoes markdown-shortcut morph (type + clear prefix)', () => {
    const { editor, firstId, text, type } = setup();

    type(firstId, 0, '#');
    editor.sealHistory();
    editor.dispatch({
      type: 'morphBlock',
      payload: {
        blockId: firstId,
        flavour: 'block:heading',
        props: { level: 1 },
        clearFromOffset: 1,
      },
    });
    expect(editor.document.getBlock(firstId)!.flavour).toBe('block:heading');

    editor.undo();

    expect(editor.document.getBlock(firstId)!.flavour).toBe('block:paragraph');
    expect(text(firstId)).toBe('#');
  });

  it('undoes toggleFormat and custom insertBlock', () => {
    const { editor, firstId, noteId, type, children } = setup();

    type(firstId, 0, 'bold');
    editor.sealHistory();
    editor.dispatch({
      type: 'toggleFormat',
      payload: { blockId: firstId, from: 0, to: 4, format: 'bold' },
    });
    expect(editor.document.getBlock(firstId)!.content[0].attributes).toEqual({ bold: true });
    editor.undo();
    expect(editor.document.getBlock(firstId)!.content).toEqual([{ insert: 'bold' }]);

    editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:heading', afterId: firstId },
    });
    expect(children().length).toBe(2);
    editor.undo();
    expect(editor.document.getBlock(noteId)!.children).toEqual([firstId]);
  });

  it('no-op commands do not create steps', () => {
    const { editor, firstId } = setup();

    editor.dispatch({ type: 'deleteBackward', payload: { blockId: firstId, offset: 0 } }); // нечего делать

    expect(editor.canUndo).toBe(false);
  });

  it('respects history options', () => {
    const editor = new Editor({ history: { limit: 1 } });
    const note = editor.document.getBlock(editor.document.rootId)!.children[0];
    const first = editor.document.getBlock(note)!.children[0];

    editor.dispatch({
      type: 'insertText',
      payload: { text: 'a', selection: { anchor: { blockId: first, offset: 0 } } },
    });
    editor.sealHistory();
    editor.dispatch({
      type: 'insertText',
      payload: { text: 'b', selection: { anchor: { blockId: first, offset: 1 } } },
    });

    editor.undo();
    expect(editor.canUndo).toBe(false);
  });
});

describe('Editor history: explicit merge keys', () => {
  it('a block inserted in a batch and filled later is one undo step, however long the wait', () => {
    let time = 0;
    const editor = new Editor({ history: { now: () => time } });
    const noteId = editor.document.getBlock(editor.document.rootId)!.children[0];
    const firstId = editor.document.getBlock(noteId)!.children[0];
    const blocks = () => editor.document.getBlock(noteId)!.children.length;
    const before = blocks();

    let id = '';

    editor.batch(
      () => {
        id = (
          editor.dispatch({
            type: 'insertBlock',
            payload: { flavour: 'block:image', afterId: firstId, props: { alt: 'a' } },
          }) as CaretResult
        ).blockId;
      },
      { mergeKey: 'images:1' },
    );

    time += 30_000; // медленная загрузка: намного дольше окна слияния

    editor.dispatch({
      type: 'setBlockProps',
      payload: { blockId: id, props: { src: 'https://example.com/a.png' }, mergeKey: 'images:1' },
    });

    expect(blocks()).toBe(before + 1);
    editor.undo();
    expect(blocks()).toBe(before);
    expect(editor.canUndo).toBe(false);
  });
});
