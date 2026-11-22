import { describe, expect, it } from 'vitest';

import { validateSnapshot, type BlockId } from '@inkbrick/document';

import { Editor, createTableEditor, tableIdOf, type CaretResult } from '../src';

function setup(texts: string[]) {
  const editor = new Editor();
  const note = editor.document.getBlock(editor.document.rootId)!.children[0];
  const ids: BlockId[] = [editor.document.getBlock(note)!.children[0]];

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

  texts.forEach((text, i) =>
    editor.dispatch({ type: 'replaceText', payload: { blockId: ids[i], from: 0, to: 0, text } }),
  );
  editor.clearHistory();

  const texts_ = () =>
    editor.document.getBlock(note)!.children.map((id) =>
      editor.document
        .getBlock(id)!
        .content.map((n) => n.insert)
        .join(''),
    );

  return { editor, note, ids, texts: texts_ };
}

describe('delete-blocks', () => {
  it('removes the blocks in one undo step, keeps the order of the rest, and undo restores them', () => {
    const { editor, ids, texts } = setup(['a', 'b', 'c', 'd', 'e']);

    editor.execute('delete-blocks', { ids: [ids[1], ids[3]] });
    expect(texts()).toEqual(['a', 'c', 'e']);
    expect(validateSnapshot(editor.serialize(), editor.schema)).toEqual([]);

    editor.undo();
    expect(texts()).toEqual(['a', 'b', 'c', 'd', 'e']);
    editor.redo();
    expect(texts()).toEqual(['a', 'c', 'e']);
  });

  it('a nested block goes with its parent; deleting every block leaves one empty paragraph', () => {
    const { editor, ids, texts } = setup(['a', 'b', 'c']);

    // Вкладываются пункты списка: делаем из первых двух список и сдвигаем второй под первый.
    for (const id of [ids[0], ids[1]]) {
      editor.dispatch({ type: 'convertBlock', payload: { blockId: id, flavour: 'block:list' } });
    }
    editor.dispatch({ type: 'indentBlock', payload: { blockId: ids[1] } });
    editor.clearHistory();
    expect(editor.document.getBlock(ids[1])!.parentId).toBe(ids[0]);

    editor.execute('delete-blocks', { ids: [ids[1], ids[0]] });
    expect(texts()).toEqual(['c']);
    expect(editor.document.getBlock(ids[1])).toBeUndefined();

    editor.execute('delete-blocks', { ids: [ids[2]] });
    expect(texts()).toEqual(['']);
    expect(validateSnapshot(editor.serialize(), editor.schema)).toEqual([]);

    editor.undo();
    editor.undo();
    expect(texts()).toEqual(['a', 'c']);
    expect(editor.document.getBlock(ids[0])!.children).toEqual([ids[1]]);
  });

  it('skips what cannot be deleted (the note, unknown ids, a pinned block) instead of refusing the rest', () => {
    const { editor, note, ids, texts } = setup(['a', 'b']);

    expect(editor.can('delete-blocks', { ids: [note, 'missing'] })).toBe(false);
    expect(editor.can('delete-blocks', { ids: 'nope' })).toBe(false);

    editor.execute('delete-blocks', { ids: [note, 'missing', ids[0]] });
    expect(texts()).toEqual(['b']);

    const table = createTableEditor();
    const tableId = tableIdOf(table)!;
    const tableNote = table.document.getBlock(table.document.rootId)!.children[0];
    const blocks = table.document.getBlock(tableNote)!.children;

    // Закреплённая таблица остаётся; соседние блоки удаляются.
    table.execute('delete-blocks', { ids: [...blocks] });
    expect(tableIdOf(table)).toBe(tableId);
    expect(table.can('delete-blocks', { ids: [tableId] })).toBe(false);
  });

  it('is refused in read-only mode', () => {
    const { editor, ids, texts } = setup(['a', 'b']);

    editor.setReadOnly(true);
    expect(editor.can('delete-blocks', { ids })).toBe(false);
    editor.execute('delete-blocks', { ids });
    expect(texts()).toEqual(['a', 'b']);
  });
});
