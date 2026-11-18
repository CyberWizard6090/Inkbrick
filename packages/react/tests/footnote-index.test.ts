import { afterEach, describe, expect, it, vi } from 'vitest';

import { FORMULA_CHAR, type BlockId, type InlineNode } from '@inkbrick/document';
import { Editor, type CaretResult } from '@inkbrick/engine';

import { FootnoteIndex, footnoteBlocks } from '../src';

/*
 * Индекс сносок обновляется по изменённым блокам и обходит документ, только когда правка задела сноски или их порядок.
 * Проверка: после каждой правки ответы индекса совпадают с индексом, построенным заново.
 */

const ref = (id: string): InlineNode => ({ insert: FORMULA_CHAR, attributes: { footnote: id } });

function setup(contents: InlineNode[][], flavour = 'block:paragraph') {
  const editor = new Editor({ blocks: footnoteBlocks });
  const note = editor.document.getBlock(editor.document.rootId)!.children[0];
  const first = editor.document.getBlock(note)!.children[0];
  const ids: BlockId[] = [];
  let after = first;

  for (const content of contents) {
    after = (
      editor.dispatch({
        type: 'insertBlock',
        payload: {
          flavour,
          afterId: after,
          content,
          props: flavour === 'block:list' ? { type: 'bullet' } : {},
        },
      }) as CaretResult
    ).blockId;
    ids.push(after);
  }

  editor.execute('delete-block', { id: first });

  const index = new FootnoteIndex(editor);
  const unsubscribe = index.subscribe(() => {});
  const rebuild = vi.spyOn(index as unknown as { rebuild(): void }, 'rebuild');
  const all = ['a', 'b', 'c', 'd'];
  const answers = (target: FootnoteIndex) =>
    all.map((id) => [target.numberOf(id), target.referenceOf(id), target.definitionOf(id)]);
  const matchesFresh = () => expect(answers(index)).toEqual(answers(new FootnoteIndex(editor)));

  index.numberOf('a');
  rebuild.mockClear();
  afterEach(unsubscribe);

  return { editor, ids, index, rebuild, matchesFresh, note };
}

const text = (editor: Editor, blockId: string, offset: number, value: string) =>
  editor.dispatch({
    type: 'replaceText',
    payload: { blockId, from: offset, to: offset, text: value },
  });

describe('FootnoteIndex: updates on edits', () => {
  it('typing in a line without footnotes, or inserting and deleting such lines, does not walk the document', () => {
    const t = setup([[{ insert: 'one ' }, ref('a')], [{ insert: 'plain' }], [ref('b')]]);

    text(t.editor, t.ids[1], 2, 'xyz');
    const added = (
      t.editor.dispatch({
        type: 'insertBlock',
        payload: { flavour: 'block:paragraph', afterId: t.ids[1] },
      }) as CaretResult
    ).blockId;
    text(t.editor, added, 0, 'new');
    t.editor.execute('delete-block', { id: added });

    expect(t.index.numberOf('b')).toBe(2);
    expect(t.rebuild).not.toHaveBeenCalled();
    t.matchesFresh();
  });

  it('typing in a line with a footnote moves its reference but keeps the numbers without a walk', () => {
    const t = setup([[{ insert: 'one ' }, ref('a'), { insert: ' tail' }], [ref('b')]]);

    text(t.editor, t.ids[0], 0, '>>');

    expect(t.index.referenceOf('a')).toEqual({ blockId: t.ids[0], offset: 6 });
    expect(t.rebuild).not.toHaveBeenCalled();
    t.matchesFresh();
  });

  it('a new reference before the others renumbers them', () => {
    const t = setup([[{ insert: 'x' }], [ref('a')], [ref('b')]]);

    t.editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:paragraph', afterId: t.ids[0], content: [ref('c')] },
    });

    expect([t.index.numberOf('c'), t.index.numberOf('a'), t.index.numberOf('b')]).toEqual([
      1, 2, 3,
    ]);
    expect(t.rebuild).toHaveBeenCalledTimes(1);
    t.matchesFresh();
  });

  it('moving, deleting, undoing and redoing blocks with footnotes keeps the numbers right', () => {
    const t = setup([[ref('a')], [{ insert: 'plain' }], [ref('b')], [ref('c')]]);

    t.editor.dispatch({
      type: 'moveBlock',
      payload: { blockId: t.ids[3], targetId: t.ids[0], position: 'before' },
    });
    expect(t.index.numberOf('c')).toBe(1);
    t.matchesFresh();

    // Перенос строки без сносок между ссылками порядка не меняет.
    t.editor.dispatch({
      type: 'moveBlock',
      payload: { blockId: t.ids[1], targetId: t.ids[3], position: 'before' },
    });
    t.matchesFresh();

    t.editor.execute('delete-block', { id: t.ids[0] });
    expect(t.index.numberOf('a')).toBeUndefined();
    t.matchesFresh();

    t.editor.undo();
    t.matchesFresh();
    t.editor.undo();
    t.editor.undo();
    t.matchesFresh();
    t.editor.redo();
    t.matchesFresh();
  });

  it('deleting a list item deletes the footnotes of its nested items', () => {
    const t = setup([[{ insert: 'top' }], [ref('a')], [ref('b')]], 'block:list');

    t.editor.dispatch({ type: 'indentBlock', payload: { blockId: t.ids[1] } });
    t.matchesFresh();

    t.editor.execute('delete-block', { id: t.ids[0] });
    expect(t.index.numberOf('a')).toBeUndefined();
    expect(t.index.numberOf('b')).toBe(1);
    t.matchesFresh();
  });

  it('a footnote text block and a change of its code are tracked', () => {
    const t = setup([[ref('a')], [ref('b')]]);
    const definition = (
      t.editor.dispatch({
        type: 'insertBlock',
        payload: { flavour: 'block:footnote', afterId: t.ids[1], props: { id: 'b' } },
      }) as CaretResult
    ).blockId;

    expect(t.index.definitionOf('b')).toBe(definition);

    // Текст сноски на номера не влияет.
    t.rebuild.mockClear();
    text(t.editor, definition, 0, 'note');
    expect(t.rebuild).not.toHaveBeenCalled();

    t.editor.dispatch({
      type: 'setBlockProps',
      payload: { blockId: definition, props: { id: 'a' } },
    });
    expect(t.index.definitionOf('a')).toBe(definition);
    expect(t.index.definitionOf('b')).toBeUndefined();
    t.matchesFresh();
  });

  it('removing the last reference from a line renumbers the rest', () => {
    const t = setup([[{ insert: 'x' }, ref('a')], [ref('b')]]);

    t.editor.dispatch({
      type: 'deleteText',
      payload: { blockId: t.ids[0], from: 1, to: 2 },
    } as never);

    expect(t.index.numberOf('b')).toBe(1);
    t.matchesFresh();
  });
});
