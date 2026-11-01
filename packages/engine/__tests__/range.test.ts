import { describe, expect, it } from 'vitest';

import type { BlockId } from '@inkbrick/document';

import { Editor, type CaretResult } from '../src';

function setup(texts: string[]) {
  const editor = new Editor();
  const noteId = editor.document.getBlock(editor.document.rootId)!.children[0];
  const ids: BlockId[] = [editor.document.getBlock(noteId)!.children[0]];

  for (let i = 1; i < texts.length; i++) {
    ids.push(
      (
        editor.dispatch({
          type: 'insertBlock',
          payload: { flavour: 'block:paragraph', afterId: ids[i - 1] },
        }) as CaretResult
      ).blockId,
    );
  }

  texts.forEach((text, i) => {
    if (text)
      editor.dispatch({ type: 'replaceText', payload: { blockId: ids[i], from: 0, to: 0, text } });
  });

  editor.clearHistory();

  const text = (id: BlockId) =>
    editor.engine.inline.toPlainText(editor.document.getBlock(id)?.content ?? []);
  const children = () => editor.document.getBlock(noteId)!.children;

  return { editor, noteId, ids, text, children };
}

const point = (blockId: BlockId, offset: number) => ({ blockId, offset });

describe('deleteRange', () => {
  it('within one block behaves like deleteText', () => {
    const { editor, ids, text } = setup(['abcdef']);

    editor.dispatch({
      type: 'deleteRange',
      payload: { from: point(ids[0], 1), to: point(ids[0], 4) },
    });

    expect(text(ids[0])).toBe('aef');
  });

  it('merges the tail of the last block into the first and drops blocks between', () => {
    const { editor, ids, text, children } = setup(['hello', 'middle', 'world']);

    const caret = editor.dispatch({
      type: 'deleteRange',
      payload: { from: point(ids[0], 2), to: point(ids[2], 3) },
    }) as CaretResult;

    expect(children()).toEqual([ids[0]]);
    expect(text(ids[0])).toBe('held');
    expect(caret).toEqual({ blockId: ids[0], offset: 2 });
  });

  it('accepts boundaries in reverse order', () => {
    const { editor, ids, text, children } = setup(['one', 'two']);

    editor.dispatch({
      type: 'deleteRange',
      payload: { from: point(ids[1], 1), to: point(ids[0], 1) },
    });

    expect(children()).toEqual([ids[0]]);
    expect(text(ids[0])).toBe('owo');
  });

  it('keeps blocks outside the range untouched', () => {
    const { editor, ids, text, children } = setup(['a', 'bcd', 'efg', 'h']);

    editor.dispatch({
      type: 'deleteRange',
      payload: { from: point(ids[1], 1), to: point(ids[2], 1) },
    });

    expect(children()).toEqual([ids[0], ids[1], ids[3]]);
    expect([ids[0], ids[1], ids[3]].map(text)).toEqual(['a', 'bfg', 'h']);
  });

  it('the first block keeps its type', () => {
    const { editor, ids } = setup(['title', 'body']);

    editor.dispatch({
      type: 'morphBlock',
      payload: { blockId: ids[0], flavour: 'block:heading', props: { level: 2 } },
    });
    editor.dispatch({
      type: 'deleteRange',
      payload: { from: point(ids[0], 5), to: point(ids[1], 0) },
    });

    expect(editor.document.getBlock(ids[0])!.flavour).toBe('block:heading');
  });

  it('moves nested children of the last block to the first one', () => {
    const { editor, ids, text, children } = setup(['a', 'b', 'c']);

    for (const id of ids) {
      editor.dispatch({
        type: 'morphBlock',
        payload: { blockId: id, flavour: 'block:list', props: { type: 'bullet' } },
      });
    }
    editor.dispatch({ type: 'indentBlock', payload: { blockId: ids[2] } }); // c — потомок b

    editor.dispatch({
      type: 'deleteRange',
      payload: { from: point(ids[0], 1), to: point(ids[1], 1) },
    });

    expect(children()).toEqual([ids[0]]);
    expect(text(ids[0])).toBe('a');
    expect(editor.document.getBlock(ids[0])!.children).toEqual([ids[2]]);
    expect(editor.document.getBlock(ids[2])!.parentId).toBe(ids[0]);
  });

  it('removes nested blocks inside the range together with their parents', () => {
    const { editor, ids, children } = setup(['a', 'b', 'c', 'd']);

    for (const id of ids) {
      editor.dispatch({
        type: 'morphBlock',
        payload: { blockId: id, flavour: 'block:list', props: { type: 'bullet' } },
      });
    }
    editor.dispatch({ type: 'indentBlock', payload: { blockId: ids[2] } }); // c внутри b

    editor.dispatch({
      type: 'deleteRange',
      payload: { from: point(ids[0], 0), to: point(ids[3], 0) },
    });

    expect(children()).toEqual([ids[0]]);
    expect(editor.document.getBlock(ids[1])).toBeUndefined();
    expect(editor.document.getBlock(ids[2])).toBeUndefined();
    expect(editor.document.getBlock(ids[3])).toBeUndefined();
  });

  it('refuses ranges that would delete an unknown block', () => {
    const { editor, noteId, ids } = setup(['a', 'b']);
    const before = structuredClone(editor.document.dump());

    editor.document._setBlock({
      id: 'u1',
      flavour: 'block:mystery',
      parentId: noteId,
      children: [],
      content: [{ insert: 'x' }],
      props: {},
    });
    editor.document._insertChild(noteId, 1, 'u1');

    const result = editor.dispatch({
      type: 'deleteRange',
      payload: { from: point(ids[0], 0), to: point(ids[1], 1) },
    });

    expect(result).toBeUndefined();
    expect(editor.document.getBlock('u1')).toBeDefined();
    expect(editor.document.getBlock(ids[1])).toEqual(before[ids[1]]);
  });

  it('does nothing for container blocks or missing blocks', () => {
    const { editor, noteId, ids } = setup(['a']);

    expect(
      editor.dispatch({
        type: 'deleteRange',
        payload: { from: point(noteId, 0), to: point(ids[0], 1) },
      }),
    ).toBeUndefined();
    expect(
      editor.dispatch({
        type: 'deleteRange',
        payload: { from: point('nope', 0), to: point(ids[0], 1) },
      }),
    ).toBeUndefined();
  });

  it('is a single undo step that restores everything and the caret', () => {
    const { editor, ids, children } = setup(['hello', 'middle', 'world']);
    const before = structuredClone(editor.document.dump());

    editor.dispatch({
      type: 'deleteRange',
      payload: { from: point(ids[0], 2), to: point(ids[2], 3) },
    });
    const undone = editor.undo()!;

    expect(editor.document.dump()).toEqual(before);
    expect(children()).toEqual(ids);
    expect(undone.caret).toEqual(point(ids[0], 2));

    editor.redo();
    expect(children()).toEqual([ids[0]]);
  });

  it('typing over a multi-block selection in a batch is one step', () => {
    const { editor, ids, text, children } = setup(['hello', 'world']);

    editor.batch(() => {
      const caret = editor.dispatch({
        type: 'deleteRange',
        payload: { from: point(ids[0], 1), to: point(ids[1], 4) },
      }) as CaretResult;
      editor.dispatch({
        type: 'replaceText',
        payload: { blockId: caret.blockId, from: caret.offset, to: caret.offset, text: 'X' },
      });
    });

    expect(text(ids[0])).toBe('hXd');
    expect(children()).toEqual([ids[0]]);

    editor.undo();
    expect(children()).toEqual(ids);
    expect(text(ids[0])).toBe('hello');
  });
});

describe('toggleFormatRange', () => {
  it('formats only the selected part of each block, then removes it', () => {
    const { editor, ids } = setup(['abc', 'def', 'ghi']);
    const range = { from: point(ids[0], 1), to: point(ids[2], 2) };

    editor.dispatch({ type: 'toggleFormatRange', payload: { ...range, format: 'bold' } });

    expect(editor.document.getBlock(ids[0])!.content).toEqual([
      { insert: 'a' },
      { insert: 'bc', attributes: { bold: true } },
    ]);
    expect(editor.document.getBlock(ids[1])!.content).toEqual([
      { insert: 'def', attributes: { bold: true } },
    ]);
    expect(editor.document.getBlock(ids[2])!.content).toEqual([
      { insert: 'gh', attributes: { bold: true } },
      { insert: 'i' },
    ]);

    editor.dispatch({ type: 'toggleFormatRange', payload: { ...range, format: 'bold' } });

    expect(editor.document.getBlock(ids[1])!.content).toEqual([{ insert: 'def' }]);
  });

  it('applies bold to everything if only part of the range is already bold', () => {
    const { editor, ids } = setup(['abc', 'def']);

    editor.dispatch({
      type: 'toggleFormat',
      payload: { blockId: ids[0], from: 0, to: 3, format: 'bold' },
    });
    editor.dispatch({
      type: 'toggleFormatRange',
      payload: { from: point(ids[0], 0), to: point(ids[1], 3), format: 'bold' },
    });

    expect(editor.document.getBlock(ids[1])!.content).toEqual([
      { insert: 'def', attributes: { bold: true } },
    ]);
    expect(editor.document.getBlock(ids[0])!.content).toEqual([
      { insert: 'abc', attributes: { bold: true } },
    ]);
  });

  it('is one undo step', () => {
    const { editor, ids } = setup(['abc', 'def']);

    editor.dispatch({
      type: 'toggleFormatRange',
      payload: { from: point(ids[0], 0), to: point(ids[1], 3), format: 'italic' },
    });
    editor.undo();

    expect(editor.document.getBlock(ids[0])!.content).toEqual([{ insert: 'abc' }]);
    expect(editor.document.getBlock(ids[1])!.content).toEqual([{ insert: 'def' }]);
  });
});

describe('deleteRange with boundaries on blocks without text', () => {
  function withBlocks(layout: Array<'text' | 'divider' | 'image'>) {
    const editor = new Editor();
    const noteId = editor.document.getBlock(editor.document.rootId)!.children[0];
    const first = editor.document.getBlock(noteId)!.children[0];
    const ids: BlockId[] = [first];

    for (let i = 1; i < layout.length; i++) {
      ids.push(
        (
          editor.dispatch({
            type: 'insertBlock',
            payload: { flavour: 'block:paragraph', afterId: ids[i - 1] },
          }) as CaretResult
        ).blockId,
      );
    }
    layout.forEach((kind, i) => {
      if (kind === 'text')
        editor.dispatch({
          type: 'replaceText',
          payload: { blockId: ids[i], from: 0, to: 0, text: `t${i}` },
        });
      else {
        editor.document._setBlock({
          ...editor.document.getBlock(ids[i])!,
          flavour: kind === 'divider' ? 'block:divider' : 'block:image',
          props:
            kind === 'image' ? { src: '', alt: '', caption: '', width: 100, align: 'center' } : {},
          content: [],
        });
      }
    });
    editor.clearHistory();

    const flat = () =>
      editor.document.getBlock(noteId)!.children.map((id) => {
        const b = editor.document.getBlock(id)!;
        return `${b.flavour.replace('block:', '')}:${editor.engine.inline.toPlainText(b.content)}`;
      });

    return { editor, noteId, ids, flat };
  }

  it('a leading image/divider is removed together with the selected text', () => {
    const { editor, ids, flat } = withBlocks(['divider', 'text', 'text']);

    editor.dispatch({
      type: 'deleteRange',
      payload: { from: point(ids[0], 0), to: point(ids[2], 1) },
    });

    expect(flat()).toEqual(['paragraph:2']);
  });

  it('a trailing image is removed too, and both ends at once', () => {
    const { editor, ids, flat } = withBlocks(['image', 'text', 'divider']);

    const caret = editor.dispatch({
      type: 'deleteRange',
      payload: { from: point(ids[0], 0), to: point(ids[2], 0) },
    }) as CaretResult;

    expect(flat()).toEqual(['paragraph:']);
    expect(caret.blockId).toBe(ids[1]);
  });

  it('select-all over a text-less document leaves one empty paragraph', () => {
    const { editor, ids, flat } = withBlocks(['image', 'divider']);

    const caret = editor.dispatch({
      type: 'deleteRange',
      payload: { from: point(ids[0], 0), to: point(ids[1], 0) },
    }) as CaretResult;

    expect(flat()).toEqual(['paragraph:']);
    expect(editor.document.getBlock(caret.blockId)!.flavour).toBe('block:paragraph');
  });

  it('keeps blocks outside the selection and is one undo step', () => {
    const { editor, ids, flat } = withBlocks(['text', 'image', 'text', 'text']);
    const before = structuredClone(editor.document.dump());

    editor.dispatch({
      type: 'deleteRange',
      payload: { from: point(ids[1], 0), to: point(ids[2], 2) },
    });
    expect(flat()).toEqual(['paragraph:t0', 'paragraph:', 'paragraph:t3']);

    editor.undo();
    expect(editor.document.dump()).toEqual(before);
  });

  it('refuses ranges whose boundary is an unknown block', () => {
    const { editor, noteId, ids } = withBlocks(['text', 'text']);
    editor.document._setBlock({
      id: 'u1',
      flavour: 'block:mystery',
      parentId: noteId,
      children: [],
      content: [],
      props: {},
    });
    editor.document._insertChild(noteId, 0, 'u1');

    expect(
      editor.dispatch({
        type: 'deleteRange',
        payload: { from: point('u1', 0), to: point(ids[1], 1) },
      }),
    ).toBeUndefined();
    expect(editor.document.getBlock('u1')).toBeDefined();
  });
});
