import { describe, expect, it } from 'vitest';

import { computeFolds, findMatches, replaceMatches } from '../src';
import { Editor, cellOfRange, tableFeature, visibleCell } from '../src/internal';

/** Абзацы с текстами по порядку; возвращает редактор и id. */
function paragraphs(texts: string[], features = [tableFeature]) {
  const editor = new Editor({ features });
  const note = editor.document.getBlock(editor.document.rootId)!.children[0];
  const ids = [editor.document.getBlock(note)!.children[0]];

  for (let i = 1; i < texts.length; i++)
    ids.push(
      editor.dispatch({
        type: 'insertBlock',
        payload: { flavour: 'block:paragraph', afterId: ids.at(-1)! },
      })!.blockId,
    );
  texts.forEach((text, i) =>
    editor.dispatch({ type: 'replaceText', payload: { blockId: ids[i], from: 0, to: 0, text } }),
  );
  editor.clearHistory();

  return { editor, ids };
}

const text = (editor: Editor, id: string) =>
  editor.document
    .getBlock(id)!
    .content.map((node) => node.insert)
    .join('');

describe('logic that works without a UI', () => {
  it('deleteForward merges the next block into this one; refused before a block without text', () => {
    const { editor, ids } = paragraphs(['ab', 'cd']);

    expect(editor.execute('deleteForward', { blockId: ids[0] })).toEqual({
      blockId: ids[0],
      offset: 2,
    });
    expect(text(editor, ids[0])).toBe('abcd');

    const divider = editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:divider', afterId: ids[0] },
    });

    expect(divider).toBeDefined();
    expect(editor.can('deleteForward', { blockId: ids[0] })).toBe(false);
  });

  it('find and replace over the document in one undo step', () => {
    const { editor, ids } = paragraphs(['cat dog', 'Cat']);
    const matches = findMatches(editor, 'cat');

    expect(matches).toHaveLength(2);
    expect(findMatches(editor, 'cat', { caseSensitive: true })).toHaveLength(1);
    expect(replaceMatches(editor, matches, 'fox')).toBe(2);
    expect([text(editor, ids[0]), text(editor, ids[1])]).toEqual(['fox dog', 'fox']);
    editor.undo();
    expect(text(editor, ids[1])).toBe('Cat');
  });

  it('computeFolds: a collapsed heading hides the blocks up to the next heading of its level', () => {
    const { editor, ids } = paragraphs(['h', 'a', 'b', 'h2']);

    editor.dispatch({
      type: 'convertBlock',
      payload: { blockId: ids[0], flavour: 'block:heading', props: { level: 2, collapsed: true } },
    });
    editor.dispatch({
      type: 'convertBlock',
      payload: { blockId: ids[3], flavour: 'block:heading', props: { level: 2 } },
    });

    expect([...computeFolds(editor).keys()]).toEqual([ids[1], ids[2]]);
  });

  it('clearTableCellsText empties the cells of a range; cell queries find visible cells', () => {
    const { editor, ids } = paragraphs(['x']);
    const result = editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:table', afterId: ids[0] },
    })!;
    const tableId = Object.values(editor.document.dump()).find(
      (b) => b.flavour === 'block:table',
    )!.id;
    const cell = cellOfRange(editor, tableId, { top: 0, left: 0, bottom: 1, right: 1 }, 'start')!;

    expect(result).toBeDefined();
    editor.dispatch({ type: 'replaceText', payload: { blockId: cell, from: 0, to: 0, text: 'v' } });
    editor.execute('clearTableCellsText', {
      blockId: tableId,
      range: { top: 0, left: 0, bottom: 1, right: 1 },
    });
    expect(text(editor, cell)).toBe('');
    expect(visibleCell(editor, tableId, 0, 0).id).toBe(cell);
  });
});
