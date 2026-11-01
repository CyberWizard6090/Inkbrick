import { describe, expect, it } from 'vitest';

import type { BlockId } from '@inkbrick/document';

import { Editor, type CaretResult } from '../src';

function setup() {
  const editor = new Editor();
  const page = editor.document.getBlock(editor.document.rootId)!;
  const noteId = page.children[0];
  const firstId = editor.document.getBlock(noteId)!.children[0];

  const text = (id: BlockId) =>
    editor.engine.inline.toPlainText(editor.document.getBlock(id)?.content ?? []);

  const type = (blockId: BlockId, offset: number, value: string) =>
    editor.dispatch({
      type: 'insertText',
      payload: { text: value, selection: { anchor: { blockId, offset } } },
    }) as CaretResult;

  const noteChildren = () => editor.document.getBlock(noteId)!.children;

  return { editor, noteId, firstId, text, type, noteChildren };
}

describe('Editor typing', () => {
  it('inserts text and returns the caret', () => {
    const { firstId, text, type } = setup();

    expect(type(firstId, 0, 'hello')).toEqual({ blockId: firstId, offset: 5 });
    type(firstId, 5, ' world');

    expect(text(firstId)).toBe('hello world');
  });

  it('inherits formatting from the character on the left', () => {
    const { editor, firstId, type } = setup();

    type(firstId, 0, 'bold');
    editor.dispatch({
      type: 'toggleFormat',
      payload: { blockId: firstId, from: 0, to: 4, format: 'bold' },
    });
    type(firstId, 4, '!');

    expect(editor.document.getBlock(firstId)!.content).toEqual([
      { insert: 'bold!', attributes: { bold: true } },
    ]);
  });

  it('replaces a range in one step', () => {
    const { editor, firstId, text, type } = setup();

    type(firstId, 0, 'hello world');
    const caret = editor.dispatch({
      type: 'replaceText',
      payload: { blockId: firstId, from: 6, to: 11, text: 'there' },
    }) as CaretResult;

    expect(text(firstId)).toBe('hello there');
    expect(caret.offset).toBe(11);
  });

  it('deletes ranges in either direction', () => {
    const { editor, firstId, text, type } = setup();

    type(firstId, 0, 'abcdef');
    editor.dispatch({ type: 'deleteText', payload: { blockId: firstId, from: 4, to: 1 } });

    expect(text(firstId)).toBe('aef');
  });
});

describe('splitBlock / deleteBackward', () => {
  it('splits a block and keeps formatting on both sides', () => {
    const { editor, firstId, noteChildren, text, type } = setup();

    type(firstId, 0, 'abcd');
    editor.dispatch({
      type: 'toggleFormat',
      payload: { blockId: firstId, from: 0, to: 4, format: 'bold' },
    });

    const caret = editor.dispatch({
      type: 'splitBlock',
      payload: { blockId: firstId, offset: 2 },
    }) as CaretResult;

    expect(noteChildren()).toEqual([firstId, caret.blockId]);
    expect(text(firstId)).toBe('ab');
    expect(text(caret.blockId)).toBe('cd');
    expect(editor.document.getBlock(caret.blockId)!.content[0].attributes).toEqual({ bold: true });
    expect(caret.offset).toBe(0);
  });

  it('merges with the previous block on Backspace at offset 0', () => {
    const { editor, firstId, noteChildren, text, type } = setup();

    type(firstId, 0, 'ab');
    const { blockId: second } = editor.dispatch({
      type: 'splitBlock',
      payload: { blockId: firstId, offset: 2 },
    }) as CaretResult;
    type(second, 0, 'cd');

    const caret = editor.dispatch({
      type: 'deleteBackward',
      payload: { blockId: second, offset: 0 },
    }) as CaretResult;

    expect(noteChildren()).toEqual([firstId]);
    expect(text(firstId)).toBe('abcd');
    expect(caret).toEqual({ blockId: firstId, offset: 2 });
    expect(editor.document.getBlock(second)).toBeUndefined();
  });

  it('deletes a whole surrogate pair with one Backspace', () => {
    const { editor, firstId, text, type } = setup();

    type(firstId, 0, 'a😀');
    editor.dispatch({ type: 'deleteBackward', payload: { blockId: firstId, offset: 3 } });

    expect(text(firstId)).toBe('a');
  });

  it('does nothing at the very start of the first paragraph', () => {
    const { editor, firstId, noteChildren } = setup();

    expect(
      editor.dispatch({ type: 'deleteBackward', payload: { blockId: firstId, offset: 0 } }),
    ).toBeUndefined();
    expect(noteChildren()).toEqual([firstId]);
  });

  it('turns a heading with no previous sibling back into a paragraph', () => {
    const { editor, firstId } = setup();

    editor.dispatch({
      type: 'morphBlock',
      payload: { blockId: firstId, flavour: 'block:heading', props: { level: 2 } },
    });
    editor.dispatch({ type: 'deleteBackward', payload: { blockId: firstId, offset: 0 } });

    expect(editor.document.getBlock(firstId)!.flavour).toBe('block:paragraph');
  });

  it('after a heading the new line is a paragraph', () => {
    const { editor, firstId } = setup();

    editor.dispatch({
      type: 'morphBlock',
      payload: { blockId: firstId, flavour: 'block:heading', props: { level: 1 } },
    });
    const { blockId } = editor.dispatch({
      type: 'splitBlock',
      payload: { blockId: firstId, offset: 0 },
    }) as CaretResult;

    expect(editor.document.getBlock(blockId)!.flavour).toBe('block:paragraph');
  });
});

describe('morph, lists and nesting', () => {
  it('applies a markdown shortcut: morph + clear prefix', () => {
    const { editor, firstId, text, type } = setup();

    type(firstId, 0, '## hi');
    editor.dispatch({
      type: 'morphBlock',
      payload: {
        blockId: firstId,
        flavour: 'block:heading',
        props: { level: 2 },
        clearFromOffset: 3,
      },
    });

    expect(editor.document.getBlock(firstId)!.props).toEqual({ level: 2, align: 'left' });
    expect(text(firstId)).toBe('hi');
  });

  it('refuses invalid morphs without changing the document', () => {
    const { editor, noteId, firstId } = setup();
    const before = JSON.stringify(editor.document.dump());

    expect(
      editor.dispatch({ type: 'morphBlock', payload: { blockId: firstId, flavour: 'block:note' } }),
    ).toBeUndefined();
    expect(
      editor.dispatch({ type: 'morphBlock', payload: { blockId: noteId, flavour: 'block:nope' } }),
    ).toBeUndefined();
    expect(JSON.stringify(editor.document.dump())).toBe(before);
  });

  it('exits a list on Enter in an empty item', () => {
    const { editor, firstId } = setup();

    editor.dispatch({
      type: 'morphBlock',
      payload: { blockId: firstId, flavour: 'block:list', props: { type: 'bullet' } },
    });
    editor.dispatch({ type: 'splitBlock', payload: { blockId: firstId, offset: 0 } });

    expect(editor.document.getBlock(firstId)!.flavour).toBe('block:paragraph');
  });

  it('indents and outdents list items', () => {
    const { editor, firstId, noteChildren, type } = setup();

    editor.dispatch({
      type: 'morphBlock',
      payload: { blockId: firstId, flavour: 'block:list', props: { type: 'bullet' } },
    });
    type(firstId, 0, 'a');
    const { blockId: second } = editor.dispatch({
      type: 'splitBlock',
      payload: { blockId: firstId, offset: 1 },
    }) as CaretResult;

    editor.dispatch({ type: 'indentBlock', payload: { blockId: second } });
    expect(editor.document.getBlock(firstId)!.children).toEqual([second]);
    expect(editor.document.getBlock(second)!.parentId).toBe(firstId);
    expect(noteChildren()).toEqual([firstId]);

    editor.dispatch({ type: 'outdentBlock', payload: { blockId: second } });
    expect(noteChildren()).toEqual([firstId, second]);
    expect(editor.document.getBlock(firstId)!.children).toEqual([]);
  });

  it('cannot indent the first item', () => {
    const { editor, firstId } = setup();

    editor.dispatch({
      type: 'morphBlock',
      payload: { blockId: firstId, flavour: 'block:list', props: { type: 'bullet' } },
    });

    expect(editor.dispatch({ type: 'indentBlock', payload: { blockId: firstId } })).toBeUndefined();
  });

  it('merging a list item moves its nested children along', () => {
    const { editor, firstId, text, type } = setup();

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
    type(third, 0, 'c');
    editor.dispatch({ type: 'indentBlock', payload: { blockId: third } });

    editor.dispatch({ type: 'deleteBackward', payload: { blockId: second, offset: 0 } });
    expect(editor.document.getBlock(second)!.flavour).toBe('block:paragraph');
    editor.dispatch({ type: 'deleteBackward', payload: { blockId: second, offset: 0 } });

    expect(text(firstId)).toBe('ab');
    expect(editor.document.getBlock(firstId)!.children).toEqual([third]);
    expect(editor.document.getBlock(third)!.parentId).toBe(firstId);
  });
});

describe('delete-block and atomicity', () => {
  it('removes a block together with all descendants', () => {
    const { editor, firstId, noteChildren, type } = setup();

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
    editor.dispatch({ type: 'indentBlock', payload: { blockId: second } });

    editor.execute('delete-block', { id: firstId });

    expect(noteChildren().length).toBe(1);
    expect(noteChildren()).not.toContain(firstId);
    expect(editor.document.getBlock(noteChildren()[0])!.content).toEqual([]);
    expect(editor.document.getBlock(firstId)).toBeUndefined();
    expect(editor.document.getBlock(second)).toBeUndefined();
  });

  it('does not delete the root page or the note', () => {
    const { editor, noteId } = setup();

    expect(editor.execute('delete-block', { id: editor.document.rootId })).toBeUndefined();
    expect(editor.execute('delete-block', { id: noteId })).toBeUndefined();
    expect(editor.document.getBlock(noteId)).toBeDefined();
  });

  it('throws on unknown commands', () => {
    expect(() => setup().editor.execute('nope')).toThrow();
  });

  it('inserts a paragraph after a block via the named command', () => {
    const { editor, firstId, noteChildren } = setup();

    const id = editor.execute('insert-paragraph', { targetId: firstId }) as string;

    expect(noteChildren()).toEqual([firstId, id]);
  });

  it('notifies subscribers of only the touched blocks', () => {
    const { editor, firstId, noteId, type } = setup();
    let first = 0;
    let note = 0;

    editor.store.subscribeBlock(firstId, () => first++);
    editor.store.subscribeBlock(noteId, () => note++);

    type(firstId, 0, 'x');

    expect(first).toBe(1);
    expect(note).toBe(0);
  });
});
