import { describe, expect, it } from 'vitest';

import { Editor, blocksFragment, pickableBlock, runBetween, tableFeature } from '../src/internal';

/** Документ «a b c d» абзацами и редактор с таблицей; возвращает id абзацев по порядку. */
function setup() {
  const editor = new Editor({ features: [tableFeature] });
  const note = editor.document.getBlock(editor.document.rootId)!.children[0];
  const ids = [editor.document.getBlock(note)!.children[0]];

  for (let i = 1; i < 4; i++)
    ids.push(
      editor.dispatch({
        type: 'insertBlock',
        payload: { flavour: 'block:paragraph', afterId: ids.at(-1)! },
      })!.blockId,
    );

  ['a', 'b', 'c', 'd'].forEach((text, i) =>
    editor.dispatch({ type: 'replaceText', payload: { blockId: ids[i], from: 0, to: 0, text } }),
  );
  editor.clearHistory();

  const texts = () =>
    editor.document.getBlock(note)!.children.map((id) =>
      editor.document
        .getBlock(id)!
        .content.map((n) => n.insert)
        .join(''),
    );

  return { editor, note, ids, texts };
}

describe('commands over a group of blocks', () => {
  it('duplicateBlocks puts the copies after the last block, in order, as one undo step', () => {
    const { editor, ids, texts } = setup();
    const copies = editor.execute('duplicateBlocks', { ids: [ids[0], ids[2]] })!.ids;

    expect(copies).toHaveLength(2);
    expect(texts()).toEqual(['a', 'b', 'c', 'a', 'c', 'd']);
    editor.undo();
    expect(texts()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('moveBlocks moves a run one place and keeps the order; refused at the edge', () => {
    const { editor, ids, texts } = setup();

    expect(editor.can('moveBlocks', { ids: [ids[0], ids[1]], direction: -1 })).toBe(false);
    editor.execute('moveBlocks', { ids: [ids[1], ids[2]], direction: -1 });
    expect(texts()).toEqual(['b', 'c', 'a', 'd']);
    editor.execute('moveBlocks', { ids: [ids[1], ids[2]], direction: 1 });
    expect(texts()).toEqual(['a', 'b', 'c', 'd']);
    editor.undo();
    expect(texts()).toEqual(['b', 'c', 'a', 'd']);
  });

  it('convertBlocks converts what it can; a type without text takes one block only', () => {
    const { editor, ids } = setup();
    const converted = editor.execute('convertBlocks', {
      ids: [ids[0], ids[1]],
      flavour: 'block:heading',
      props: { level: 2 },
    })!.ids;

    expect(converted).toEqual([ids[0], ids[1]]);
    expect(editor.document.getBlock(ids[1])!.flavour).toBe('block:heading');
    expect(editor.can('convertBlocks', { ids: [ids[2], ids[3]], flavour: 'block:divider' })).toBe(
      false,
    );
    editor.undo();
    expect(editor.document.getBlock(ids[0])!.flavour).toBe('block:paragraph');
  });

  it('setBlockBackgrounds sets and clears the background of every block in one step', () => {
    const { editor, ids } = setup();

    editor.execute('setBlockBackgrounds', { ids, background: 'blue' });
    expect(ids.map((id) => editor.document.getBlock(id)!.props.background)).toEqual(
      ids.map(() => 'blue'),
    );
    editor.execute('setBlockBackgrounds', { ids: [ids[0]], background: null });
    expect(editor.document.getBlock(ids[0])!.props.background).toBeUndefined();
    editor.undo();
    editor.undo();
    expect(editor.document.getBlock(ids[3])!.props.background).toBeUndefined();
  });

  it('delete-blocks returns where the caret goes: the next block, else the end of the previous', () => {
    const { editor, ids } = setup();

    expect(editor.execute('delete-blocks', { ids: [ids[1], ids[2]] })).toEqual({
      blockId: ids[3],
      offset: 0,
    });
    expect(editor.execute('delete-blocks', { ids: [ids[3]] })).toEqual({
      blockId: ids[0],
      offset: 1,
    });
    // Без интерфейса каретка тоже на месте: команда ставит выделение редактора.
    expect(editor.selection.get()).toMatchObject({ type: 'text', focus: { blockId: ids[0] } });
  });

  it('group commands refuse blocks of an unknown type and read-only mode', () => {
    const { editor, ids } = setup();

    editor.setReadOnly(true);
    expect(editor.can('duplicateBlocks', { ids })).toBe(false);
    editor.setReadOnly(false);
    expect(editor.can('moveBlocks', { ids: ['missing'], direction: 1 })).toBe(false);
  });

  it('tree queries: a cell picks its table, a run of siblings, a fragment of picked blocks', () => {
    const { editor, ids } = setup();
    const table = editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:table', afterId: ids[3] },
    })!.blockId;
    const tableId =
      editor.document.getBlock(table)?.flavour === 'block:table'
        ? table
        : editor.document.getBlock(editor.document.getBlock(table)!.parentId!)!.parentId!;
    const cell = editor.document.getBlock(editor.document.getBlock(tableId)!.children[0])!
      .children[0];

    expect(pickableBlock(editor, cell)).toBe(tableId);
    expect(runBetween(editor, ids[2], ids[0])).toEqual([ids[0], ids[1], ids[2]]);
    expect(blocksFragment(editor, [ids[0], ids[2]])!.blocks.length).toBe(2);
  });
});
