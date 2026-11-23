import { flushSync } from 'react-dom';

import {
  getBlockAlign,
  type Alignment,
  type BlockBackground,
  type BlockId,
} from '@inkbrick/document';
import {
  type Editor,
  type RangeFormats,
  type TableTextFormat,
  tableRangeCells,
  type TableRange,
} from '@inkbrick/engine';
import { clampTableRange } from '@inkbrick/engine/internal';

import type { CellSelection } from '../editing/CellSelectionController';
import type { ToolbarPanel, ToolbarProps } from '../toolbar/types';

/**
 * Выполняет команду таблицы над выделенными ячейками одним шагом undo. Выделение ячеек остаётся: можно сразу применить
 * следующее действие. `false` — применять не к чему (например, ячейки пусты) или редактор только для чтения.
 */
export function runOnCells(
  editor: Editor,
  selection: CellSelection,
  type: string,
  payload: Record<string, unknown> = {},
): boolean {
  const full = { blockId: selection.tableId, range: selection.range, ...payload };

  if (!editor.can(type, full)) return false;

  editor.sealHistory();
  flushSync(() => {
    editor.dispatch({ type, payload: full } as never);
  });

  return true;
}

export const formatCells = (editor: Editor, selection: CellSelection, format: TableTextFormat) =>
  runOnCells(editor, selection, 'formatTableCells', { format });

export const alignCells = (editor: Editor, selection: CellSelection, align: Alignment) =>
  runOnCells(editor, selection, 'alignTableCells', { align });

export const colorCells = (
  editor: Editor,
  selection: CellSelection,
  kind: 'color' | 'backgroundColor',
  value: string | null,
) =>
  runOnCells(editor, selection, 'setTableCellsColor', {
    attributes: { [kind]: value ?? undefined },
  });

export const clearCellsFormat = (editor: Editor, selection: CellSelection) =>
  runOnCells(editor, selection, 'clearTableCellsFormat');

export const backgroundCells = (
  editor: Editor,
  selection: CellSelection,
  background: BlockBackground | string | null,
) => runOnCells(editor, selection, 'setTableCellsBackground', { background });

const FORMAT_KEYS: Readonly<Record<string, TableTextFormat>> = {
  b: 'bold',
  i: 'italic',
  u: 'underline',
  e: 'code',
};

const ALIGN_KEYS: Readonly<Record<string, Alignment>> = {
  l: 'left',
  e: 'center',
  r: 'right',
  j: 'justify',
};

/**
 * Сочетание клавиш форматирования выделенных ячеек — те же, что у текста: Ctrl/Cmd+B, I, U, E (код), Shift+X (зачёркнутый),
 * Shift+L, E, R, J (выравнивание). `false` — клавиша не из этого списка.
 */
export function cellShortcut(
  editor: Editor,
  selection: CellSelection,
  event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey'>,
): boolean {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return false;

  const key = event.key.toLowerCase();

  if (event.shiftKey) {
    if (key === 'x') return formatCells(editor, selection, 'strike') || true;

    const align = ALIGN_KEYS[key];

    return align ? alignCells(editor, selection, align) || true : false;
  }

  const format = FORMAT_KEYS[key];

  return format ? formatCells(editor, selection, format) || true : false;
}

/**
 * Форматы, которые видны у ячеек прямоугольника — для кнопок toolbar: формат включён, если он есть у всего текста всех
 * непустых ячеек; цвет, подсветка и выравнивание заданы, только если одинаковы у всех ячеек.
 */
export function tableRangeFormats(
  editor: Editor,
  tableId: BlockId,
  range: TableRange,
): RangeFormats {
  const getBlock = (id: BlockId) => editor.store.getBlock(id);
  const clamped = clampTableRange(getBlock, tableId, range);
  const ids = clamped ? [...new Set(tableRangeCells(getBlock, tableId, clamped).flat())] : [];
  const blocks = ids.map((id) => getBlock(id)!).filter(Boolean);
  const filled = blocks.filter((cell) => editor.engine.inline.length(cell.content) > 0);
  const has = (format: string) =>
    filled.length > 0 &&
    filled.every((cell) =>
      editor.engine.inline.hasFormat(
        cell.content,
        0,
        editor.engine.inline.length(cell.content),
        format,
      ),
    );
  const only = <T>(values: Set<T | undefined>): T | undefined =>
    values.size === 1 ? [...values][0] : undefined;
  const colors = new Set<string | undefined>();
  const backgrounds = new Set<string | undefined>();
  const aligns = new Set<Alignment | undefined>(blocks.map((cell) => getBlockAlign(cell)));

  for (const cell of filled) {
    for (const node of cell.content) {
      const { color, backgroundColor } = node.attributes ?? {};

      colors.add(typeof color === 'string' ? color : undefined);
      backgrounds.add(typeof backgroundColor === 'string' ? backgroundColor : undefined);
    }
  }

  const color = only(colors);
  const backgroundColor = only(backgrounds);
  const align = only(aligns);

  return {
    bold: has('bold'),
    italic: has('italic'),
    underline: has('underline'),
    strike: has('strike'),
    code: has('code'),
    ...(color ? { color } : {}),
    ...(backgroundColor ? { backgroundColor } : {}),
    ...(align ? { align } : {}),
  };
}

/** Кнопки и обработчики toolbar для выделенных ячеек: те же, что у выделенного текста, но над всем диапазоном. */
export function cellToolbar(
  editor: Editor,
  selection: CellSelection,
  panel: {
    readonly current: ToolbarPanel | null;
    set(panel: ToolbarPanel | null): void;
    /** Документ изменился: кнопки нужно перерисовать с новыми форматами. */
    changed(): void;
  },
): Pick<
  ToolbarProps,
  | 'formats'
  | 'scope'
  | 'linkOpen'
  | 'panel'
  | 'onToggle'
  | 'onOpenLink'
  | 'onApplyLink'
  | 'onCancelLink'
  | 'onTogglePanel'
  | 'onApplyColor'
  | 'onAlign'
  | 'onInsertFormula'
  | 'onClearFormat'
> {
  const nothing = () => undefined;

  return {
    formats: tableRangeFormats(editor, selection.tableId, selection.range),
    scope: 'cells',
    linkOpen: false,
    panel: panel.current,
    onToggle: (format) => {
      formatCells(editor, selection, format);
      panel.changed();
    },
    onTogglePanel: (next) => panel.set(panel.current === next ? null : next),
    onApplyColor: (kind, value) => {
      colorCells(editor, selection, kind, value);
      panel.set(null);
      panel.changed();
    },
    onAlign: (align) => {
      alignCells(editor, selection, align);
      panel.changed();
    },
    onClearFormat: () => {
      clearCellsFormat(editor, selection);
      panel.changed();
    },
    onOpenLink: nothing,
    onApplyLink: () => false,
    onCancelLink: nothing,
    onInsertFormula: nothing,
  };
}
