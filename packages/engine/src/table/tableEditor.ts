import {
  TABLE,
  TABLE_DEFAULT_COLUMNS,
  TABLE_DEFAULT_ROWS,
  type Alignment,
  type BlockId,
} from '@inkbrick/document';

import { Editor, type EditorOptions } from '../editor';
import { tableBlocks } from './tableBlocks';
import { tableFragment, type TableCellInput, type TableFragmentOptions } from './tableFragment';

export interface TableEditorOptions
  extends TableFragmentOptions, Pick<EditorOptions, 'history' | 'meta'> {
  /** Начальное содержимое по строкам; по умолчанию — пустая таблица 3×3. */
  rows?: readonly (readonly TableCellInput[])[];
}

/** Содержимое таблицы отдельного редактора: простой текст ячеек. */
export interface TableValue {
  readonly rows: readonly (readonly string[])[];
  readonly header: boolean;
  readonly align: readonly (Alignment | undefined)[];
  readonly widths: readonly (number | null)[];
}

/**
 * Редактор, в документе которого одна таблица, закреплённая в корне (`editor.pin`): её нельзя удалить,
 * превратить в другой блок или вынести, как бы ни было сделано выделение. Строки и столбцы меняются командами
 * таблицы, ячейки — как обычно. История начинается с исходного содержимого.
 *
 * ```ts
 * const editor = createTableEditor({ rows: [['Name', 'Qty'], ['Apple', '3']] });
 *
 * tableValue(editor).rows; // [['Name', 'Qty'], ['Apple', '3']]
 * ```
 */
export function createTableEditor(options: TableEditorOptions = {}): Editor {
  const { rows, history, meta, ...table } = options;
  const editor = new Editor({ blocks: tableBlocks, history, meta });
  const note = editor.document.getBlock(editor.document.rootId)!.children[0];
  const paragraph = editor.document.getBlock(note)!.children[0];
  const grid =
    rows && rows.length > 0 && rows.some((row) => row.length > 0)
      ? rows
      : Array.from({ length: TABLE_DEFAULT_ROWS }, () =>
          Array<string>(TABLE_DEFAULT_COLUMNS).fill(''),
        );

  editor.dispatch({
    type: 'pasteFragment',
    payload: { at: { blockId: paragraph, offset: 0 }, fragment: tableFragment(grid, table) },
  });

  const tableId = tableIdOf(editor);

  if (!tableId) throw new Error('createTableEditor: the table was not created');

  for (const id of editor.document.getBlock(note)!.children) {
    if (id !== tableId) editor.dispatch({ type: 'delete-block', payload: { id } } as never);
  }

  editor.store.clearHistory();
  editor.pin(tableId);

  return editor;
}

/** Id таблицы в редакторе из `createTableEditor` (или первой таблицы документа). */
export function tableIdOf(editor: Editor): BlockId | undefined {
  if (editor.engine.pinned) return editor.engine.pinned.id;

  const stack = [editor.document.rootId];

  while (stack.length > 0) {
    const block = editor.document.getBlock(stack.pop()!);

    if (!block) continue;
    if (block.flavour === TABLE) return block.id;

    stack.push(...[...block.children].reverse());
  }

  return undefined;
}

/** Текущее содержимое таблицы редактора: тексты ячеек, заголовок, выравнивание и ширины столбцов. */
export function tableValue(editor: Editor): TableValue {
  const get = (id: BlockId) => editor.document.getBlock(id);
  const table = get(tableIdOf(editor) ?? '');
  const rows = (table?.children ?? []).map((id) => get(id)?.children ?? []);
  const first = rows[0] ?? [];
  const widths = table?.props.widths;

  return {
    rows: rows.map((row) =>
      row.map((id) => editor.engine.inline.toPlainText(get(id)?.content ?? [])),
    ),
    header: table?.props.header !== false,
    align: first.map((id) => get(id)?.props.align as Alignment | undefined),
    widths: first.map((_, column) => {
      const width = Array.isArray(widths) ? widths[column] : null;

      return typeof width === 'number' && width > 0 ? width : null;
    }),
  };
}
