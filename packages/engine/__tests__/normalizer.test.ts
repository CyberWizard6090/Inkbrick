import { describe, expect, it } from 'vitest';

import {
  createSchemaRegistry,
  deserializeDocument,
  serializeDocument,
  type DocumentSnapshot,
} from '@inkbrick/document';

import {
  Editor,
  columnsFeature,
  defineFeature,
  tableFeature,
  type NormalizeRule,
} from '../src/internal';

const noteOf = (editor: Editor) => editor.document.getBlock(editor.document.rootId)!.children[0];
const childrenOf = (editor: Editor, id: string) => editor.document.getBlock(id)!.children;

describe('DocumentNormalizer', () => {
  it('runs a rule on the blocks a command changed, in the same undo step', () => {
    const seen: string[] = [];
    const rule: NormalizeRule = {
      name: 'shout',
      flavours: ['block:paragraph'],
      normalize({ engine, transaction, block }) {
        seen.push(block.id);

        const text = block.content.map((node) => node.insert).join('');

        if (text !== text.toUpperCase())
          engine.block.updateContent(transaction, block.id, [{ insert: text.toUpperCase() }]);
      },
    };
    const editor = new Editor({
      features: [defineFeature({ name: 'shout', normalizers: [rule] })],
    });
    const first = childrenOf(editor, noteOf(editor))[0];

    editor.dispatch({
      type: 'replaceText',
      payload: { blockId: first, from: 0, to: 0, text: 'hi' },
    });
    expect(editor.document.getBlock(first)!.content).toEqual([{ insert: 'HI' }]);
    expect(seen).toContain(first);

    // Правило — часть той же правки: одна отмена убирает и её.
    editor.undo();
    expect(editor.document.getBlock(first)!.content).toEqual([]);
  });

  it('rules that keep changing each other are an error, and the command is rolled back', () => {
    let flip = 0;
    const rule: NormalizeRule = {
      name: 'flip-flop',
      flavours: ['block:paragraph'],
      normalize({ engine, transaction, block }) {
        engine.block.update(transaction, block.id, (b) => ({
          ...b,
          props: { ...b.props, n: ++flip },
        }));
      },
    };
    const editor = new Editor({ features: [defineFeature({ name: 'flip', normalizers: [rule] })] });
    const first = childrenOf(editor, noteOf(editor))[0];

    expect(() =>
      editor.dispatch({
        type: 'replaceText',
        payload: { blockId: first, from: 0, to: 0, text: 'x' },
      }),
    ).toThrow(/does not settle.*flip-flop/);
    expect(editor.document.getBlock(first)!.content).toEqual([]);
  });

  it('an emptied note gets a paragraph, whatever emptied it', () => {
    const editor = new Editor();
    const note = noteOf(editor);
    const [first] = childrenOf(editor, note);

    // Перенос единственного блока из заметки в другой контейнер (сноска? нет) — удаление через общую правку.
    editor.batch(() => editor.execute('delete-blocks', { ids: [first] }));

    const children = childrenOf(editor, note);

    expect(children).toHaveLength(1);
    expect(editor.document.getBlock(children[0])!.flavour).toBe('block:paragraph');
  });

  it('a column emptied by moving its last block out disappears instead of being filled', () => {
    const editor = new Editor({ features: [columnsFeature] });
    const note = noteOf(editor);
    const [a] = childrenOf(editor, note);
    const b = editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:paragraph', afterId: a },
    })!.blockId;

    editor.dispatch({
      type: 'moveBlockToSide',
      payload: { blockId: b, targetId: a, side: 'right' },
    });
    expect(editor.document.getBlock(childrenOf(editor, note)[0])!.flavour).toBe('block:columns');

    editor.dispatch({
      type: 'moveBlock',
      payload: { blockId: b, targetId: childrenOf(editor, note)[0], position: 'after' },
    });

    // Обе колонки развернулись обратно в блоки: пустой колонки с абзацем нет.
    expect(childrenOf(editor, note).map((id) => editor.document.getBlock(id)!.flavour)).toEqual([
      'block:paragraph',
      'block:paragraph',
    ]);
  });

  it('editor.normalize() repairs a document from outside, outside the undo history', () => {
    const schema = createSchemaRegistry([
      ...tableFeature.blocks!.map((item) => ('schema' in item ? item.schema : item)),
      ...columnsFeature.blocks!.map((item) => ('schema' in item ? item.schema : item)),
    ]);
    const source = new Editor({ features: [tableFeature] });
    const note = noteOf(source);
    const table = source.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:table', afterId: childrenOf(source, note)[0] },
    })!;
    let tableId = table.blockId;

    while (source.document.getBlock(tableId)!.flavour !== 'block:table')
      tableId = source.document.getBlock(tableId)!.parentId!;

    const snapshot = serializeDocument(source.document, source.schema) as DocumentSnapshot;

    // Объединение за пределами таблицы 3×3 и пустая заметка — то, что могло прийти с сервера.
    snapshot.blocks[tableId].props.merges = [{ row: 2, column: 2, rows: 4, columns: 4 }];

    const editor = new Editor({
      schema,
      document: deserializeDocument(snapshot, { schema }),
      features: [tableFeature, columnsFeature],
    });

    expect(editor.normalize()).toBe(true);
    expect(editor.document.getBlock(tableId)!.props.merges).toBeUndefined();
    expect(editor.canUndo).toBe(false);
    expect(editor.normalize()).toBe(false);
  });
});
