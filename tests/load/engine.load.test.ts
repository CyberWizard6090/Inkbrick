import { afterAll, describe, expect, it } from 'vitest';

import {
  createSchemaRegistry,
  deserializeDocument,
  serializeDocument,
  toHtml,
  toMarkdown,
  validateSnapshot,
  type BlockId,
  type DocumentSnapshot,
} from '@inkbrick/document';
import { fromMarkdown } from '@inkbrick/document/markdown';
import {
  Editor,
  locateTableCell,
  tableCellAt,
  type CaretResult,
  columnsBlocks,
  tableBlocks,
} from '@inkbrick/engine';

import { findMatches } from '../../packages/react/src/find/search';

/**
 * Нагрузочные тесты движка. Пороги — с запасом в несколько раз от замеров на обычной машине разработчика: тест падает,
 * когда операция стала медленнее на порядок (квадратичный алгоритм, лишний обход документа), а не от шума CI.
 * Множитель порогов — `LOAD_BUDGET_SCALE` (например, 2 на медленной машине).
 */
const SCALE = Number(process.env.LOAD_BUDGET_SCALE ?? 1);
const results: Array<{ scenario: string; ms: number; budget: number }> = [];

function measure<T>(scenario: string, budget: number, run: () => T): T {
  const started = performance.now();
  const result = run();
  const ms = Math.round((performance.now() - started) * 10) / 10;

  results.push({ scenario, ms, budget: budget * SCALE });
  expect(ms, `${scenario}: ${ms} ms, budget ${budget * SCALE} ms`).toBeLessThan(budget * SCALE);

  return result;
}

afterAll(() => {
  // eslint-disable-next-line no-console -- сводка замеров — главный вывод нагрузочного прогона
  console.table(results);
});

const schema = createSchemaRegistry();

/** Снимок с `count` абзацами в одной заметке; каждый десятый — заголовок, каждый седьмой — пункт списка. */
function snapshotOf(count: number): DocumentSnapshot {
  const blocks: DocumentSnapshot['blocks'] = {
    root: {
      id: 'root',
      flavour: 'block:page',
      parentId: null,
      children: ['note'],
      content: [],
      props: {},
    },
    note: {
      id: 'note',
      flavour: 'block:note',
      parentId: 'root',
      children: [],
      content: [],
      props: {},
    },
  };

  for (let i = 0; i < count; i++) {
    const id = `b${i}`;
    const flavour = i % 10 === 0 ? 'block:heading' : i % 7 === 0 ? 'block:list' : 'block:paragraph';

    blocks[id] = {
      id,
      flavour,
      parentId: 'note',
      children: [],
      content: [{ insert: `Paragraph ${i} with some words to search through` }],
      props: flavour === 'block:heading' ? { level: 2 } : {},
    };
    blocks.note.children.push(id);
  }

  return { version: 1, rootId: 'root', blocks } as DocumentSnapshot;
}

function editorOf(count: number, blocks = [...tableBlocks, ...columnsBlocks]) {
  const editor = new Editor({ blocks });
  const document = deserializeDocument(snapshotOf(count), { schema: editor.schema });

  return new Editor({ schema: editor.schema, document });
}

const children = (editor: Editor) =>
  editor.document.getBlock(editor.document.getBlock(editor.document.rootId)!.children[0])!.children;

describe('a document of 50 000 blocks', () => {
  const snapshot = snapshotOf(50_000);

  it('validates, loads, serializes and exports', () => {
    const probe = new Editor();

    measure('50k: validateSnapshot', 1500, () =>
      expect(validateSnapshot(snapshot, probe.schema)).toEqual([]),
    );

    const document = measure('50k: deserialize', 2500, () =>
      deserializeDocument(snapshot, { schema: probe.schema }),
    );
    const editor = new Editor({ schema: probe.schema, document });

    measure('50k: serialize', 1500, () => serializeDocument(editor.document, editor.schema));
    measure('50k: toHtml', 1500, () => toHtml(editor.document));

    const markdown = measure('50k: toMarkdown', 1500, () => toMarkdown(editor.document));

    // Импорт Markdown ограничен 1 000 000 символов: берём столько строк, сколько в него входит.
    const part = markdown.slice(0, markdown.lastIndexOf('\n', 999_000));

    measure('~1 MB: fromMarkdown', 6000, () => fromMarkdown(part, { schema }));
  });

  it('finds every match of a word', () => {
    const editor = editorOf(50_000);
    const matches = measure('50k: find «words»', 800, () => findMatches(editor, 'words'));

    expect(matches.length).toBeGreaterThan(1000);
  });
});

describe('long series of edits', () => {
  it('typing 2 000 characters one by one in the middle of 20 000 blocks', () => {
    const editor = editorOf(20_000);
    const target = children(editor)[10_000];
    const length = () =>
      editor.document
        .getBlock(target)!
        .content.map((n) => n.insert)
        .join('').length;
    const start = length();

    measure('20k: 2000 × insertText', 3000, () => {
      for (let i = 0; i < 2000; i++) {
        editor.dispatch({
          type: 'insertText',
          payload: { text: 'x', selection: { anchor: { blockId: target, offset: start + i } } },
        });
      }
    });

    expect(length()).toBe(start + 2000);
  });

  it('inserting 5 000 blocks one after another', () => {
    const editor = editorOf(1000);
    let after = children(editor).at(-1)!;

    measure('5000 × insertBlock', 5000, () => {
      for (let i = 0; i < 5000; i++) {
        after = (
          editor.dispatch({
            type: 'insertBlock',
            payload: { flavour: 'block:paragraph', afterId: after },
          }) as CaretResult
        ).blockId;
      }
    });

    expect(children(editor)).toHaveLength(6000);
  });

  it('pasting 5 000 blocks at once, then undo and redo', () => {
    const source = editorOf(5000);
    const ids = children(source);
    const fragment = measure('copy 5000 blocks', 1500, () =>
      source.copyFragment({ blockId: ids[0], offset: 0 }, { blockId: ids.at(-1)!, offset: 5 }),
    )!;

    const editor = editorOf(10);
    const at = children(editor)[5];

    measure('paste 5000 blocks', 3000, () =>
      editor.dispatch({
        type: 'pasteFragment',
        payload: { fragment, at: { blockId: at, offset: 0 } },
      }),
    );
    expect(children(editor).length).toBeGreaterThan(5000);

    measure('undo paste of 5000', 1500, () => editor.undo());
    expect(children(editor)).toHaveLength(10);
    measure('redo paste of 5000', 1500, () => editor.redo());
    expect(children(editor).length).toBeGreaterThan(5000);
  });

  it('10 000 separate edits keep the history at its limit; 200 undo and redo', () => {
    const editor = editorOf(2000);
    const ids = children(editor);

    measure('10000 separate edits', 6000, () => {
      for (let i = 0; i < 10_000; i++) {
        editor.dispatch({
          type: 'insertText',
          payload: {
            text: 'y',
            selection: { anchor: { blockId: ids[i % ids.length], offset: 0 } },
          },
        });
        editor.sealHistory();
      }
    });

    let undone = 0;

    measure('200 × undo', 1000, () => {
      while (editor.canUndo) {
        editor.undo();
        undone++;
      }
    });
    expect(undone).toBe(200);
    measure('200 × redo', 1000, () => {
      while (editor.canRedo) editor.redo();
    });
  });

  it('moving 2 000 blocks around a document of 10 000', () => {
    const editor = editorOf(10_000);
    const ids = children(editor);

    measure('2000 × moveBlock', 4000, () => {
      for (let i = 0; i < 2000; i++) {
        editor.dispatch({
          type: 'moveBlock',
          payload: { blockId: ids[i], targetId: ids[9_999 - i], position: 'after' },
        });
      }
    });

    expect(children(editor)).toHaveLength(10_000);
  });

  it('deleting a range across 50 000 blocks and undoing it (one copy of the child list, not one per block)', () => {
    const editor = editorOf(50_000);
    const ids = children(editor);

    measure('delete range of 50000 blocks', 1500, () =>
      editor.dispatch({
        type: 'deleteRange',
        payload: { from: { blockId: ids[1], offset: 3 }, to: { blockId: ids.at(-2)!, offset: 3 } },
      }),
    );
    expect(children(editor)).toHaveLength(3);
    measure('undo delete of 50000 blocks', 1500, () => editor.undo());
    expect(children(editor)).toHaveLength(50_000);
  });

  it('deleting 50 000 picked blocks at once and undoing it', () => {
    const editor = editorOf(50_000);
    const ids = [...children(editor)];

    measure('delete-blocks: 50000 picked', 1500, () => editor.execute('delete-blocks', { ids }));
    expect(children(editor)).toHaveLength(1);
    measure('undo delete-blocks of 50000', 1500, () => editor.undo());
    expect(children(editor)).toHaveLength(50_000);
  });

  it('300 blocks put into columns and taken out again', () => {
    const editor = editorOf(600);
    const ids = children(editor);

    measure('300 × moveBlockToSide', 3000, () => {
      for (let i = 0; i < 300; i++) {
        editor.dispatch({
          type: 'moveBlockToSide',
          payload: {
            blockId: ids[2 * i + 1],
            targetId: ids[2 * i],
            side: i % 2 ? 'left' : 'right',
          },
        });
      }
    });

    const columns = () =>
      children(editor).filter((id) => editor.document.getBlock(id)!.flavour === 'block:columns')
        .length;

    expect(columns()).toBe(300);

    // Обратно: каждый блок колонок встаёт после последнего блока заметки, колонки пустеют и исчезают.
    measure('600 × moveBlock out of columns', 3000, () => {
      for (const id of ids) {
        editor.dispatch({
          type: 'moveBlock',
          payload: { blockId: id, targetId: children(editor).at(-1)!, position: 'after' },
        });
      }
    });

    expect(columns()).toBe(0);
    expect(children(editor)).toHaveLength(600);
  });
});

describe('a table of 100 rows and 20 columns (the size limit)', () => {
  function bigTable() {
    const editor = new Editor({ blocks: tableBlocks });
    const getBlock = (id: BlockId) => editor.document.getBlock(id);
    const first = children(editor)[0];
    const caret = editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:table', afterId: first },
    }) as CaretResult;
    const tableId = locateTableCell(getBlock, caret.blockId)!.tableId;
    const run = (type: string, payload: Record<string, unknown>) =>
      editor.dispatch({ type, payload: { blockId: tableId, ...payload } } as never);
    const size = () => {
      const rows = getBlock(tableId)!.children;

      return [rows.length, getBlock(rows[0])!.children.length];
    };

    return { editor, getBlock, tableId, run, size };
  }

  it('grows to 100 × 20, fills, sorts, merges, copies and shrinks', () => {
    const t = bigTable();

    measure('table: grow to 100 × 20', 4000, () => {
      while (t.size()[1] < 20) t.run('insertTableColumn', { index: t.size()[1] });
      while (t.size()[0] < 100) t.run('insertTableRow', { index: t.size()[0] });
    });
    expect(t.size()).toEqual([100, 20]);

    measure('table: fill 2000 cells', 4000, () => {
      for (let r = 0; r < 100; r++) {
        for (let c = 0; c < 20; c++) {
          t.editor.dispatch({
            type: 'replaceText',
            payload: {
              blockId: tableCellAt(t.getBlock, t.tableId, r, c)!,
              from: 0,
              to: 0,
              text: String((r * 37) % 101),
            },
          });
        }
      }
    });

    measure('table: sort 100 rows', 1500, () =>
      t.run('sortTableRows', { column: 0, direction: 'asc' }),
    );

    measure('table: 40 merges', 3000, () => {
      for (let i = 0; i < 40; i++) {
        const row = (i % 49) * 2;
        const column = (i % 10) * 2;

        t.run('mergeTableCells', {
          range: { top: row, bottom: row + 1, left: column, right: column + 1 },
        });
      }
    });

    const fragment = measure('table: copy all cells', 1500, () =>
      t.editor.copyFragment(
        { blockId: tableCellAt(t.getBlock, t.tableId, 0, 0)!, offset: 0 },
        { blockId: tableCellAt(t.getBlock, t.tableId, 99, 19)!, offset: 1 },
      ),
    );

    expect(fragment).toBeTruthy();

    measure('table: html of the document', 1500, () => toHtml(t.editor.document));

    measure('table: shrink to 1 × 1', 4000, () => {
      while (t.size()[0] > 1) t.run('deleteTableRow', { index: 0 });
      while (t.size()[1] > 1) t.run('deleteTableColumn', { index: 0 });
    });
    expect(t.size()).toEqual([1, 1]);
  });
});
