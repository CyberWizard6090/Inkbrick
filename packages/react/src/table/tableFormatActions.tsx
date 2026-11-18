import type { BaseBlock, BlockBackground, TableProps } from '@inkbrick/document';
import { BLOCK_BACKGROUNDS, getBlockBackground } from '@inkbrick/document';
import { tableRangeCells, tableSize, type Editor } from '@inkbrick/engine';

import type { BlockMenuAction, BlockMenuBackground } from '../block-handle/types';
import type { CellSelection } from '../editing/CellSelectionController';
import type { TFunction } from '../i18n/translate';
import { Icon } from '../icons/Icon';
import { backgroundCells } from './cellFormatting';

/** Свойство таблицы, которое переключает пункт меню. */
type Toggle = 'header' | 'headerColumn' | 'striped' | 'borders' | 'freezeRow' | 'freezeColumn';

const isOn = (props: TableProps, key: Toggle): boolean =>
  key === 'header' || key === 'borders' ? props[key] !== false : props[key] === true;

const TITLES: Readonly<Record<Toggle, readonly [on: string, off: string]>> = {
  header: ['table.row.headerOn', 'table.row.headerOff'],
  headerColumn: ['table.format.headerColumnOn', 'table.format.headerColumnOff'],
  striped: ['table.format.stripedOn', 'table.format.stripedOff'],
  borders: ['table.format.bordersOn', 'table.format.bordersOff'],
  freezeRow: ['table.row.freezeOn', 'table.row.freezeOff'],
  freezeColumn: ['table.column.freezeOn', 'table.column.freezeOff'],
};

const ICONS: Readonly<Record<Toggle, 'heading-1' | 'columns' | 'table' | 'pin'>> = {
  header: 'heading-1',
  headerColumn: 'columns',
  striped: 'table',
  borders: 'table',
  freezeRow: 'pin',
  freezeColumn: 'pin',
};

const ORDER: readonly Toggle[] = [
  'header',
  'headerColumn',
  'striped',
  'borders',
  'freezeRow',
  'freezeColumn',
];

/**
 * Пункты форматирования таблицы: заголовочные строка и столбец, чередование строк, границы, закрепление, сброс ширин.
 * Общие для меню ручки таблицы и контекстного меню ячейки. `run` выполняет действие (один шаг undo, закрытие меню).
 * Название пункта говорит, что произойдёт: «включить» или «выключить».
 */
export function tableFormatActions(
  editor: Editor,
  block: BaseBlock,
  t: TFunction,
  run: (action: () => void) => void,
): BlockMenuAction[] {
  const props = block.props as TableProps;
  const toggles = ORDER.map<BlockMenuAction>((key) => {
    const on = isOn(props, key);

    return {
      id: `table-${key}`,
      title: t(TITLES[key][on ? 1 : 0] as 'table.row.headerOn'),
      icon: <Icon name={ICONS[key]} />,
      run: () =>
        run(() =>
          editor.dispatch({
            type: 'setBlockProps',
            payload: { blockId: block.id, props: { [key]: !on } },
          }),
        ),
    };
  });

  return [
    ...toggles,
    {
      id: 'table-reset-widths',
      title: t('table.format.resetWidths'),
      icon: <Icon name="refresh-cw" />,
      disabled: !editor.can('resetTableColumnWidths', { blockId: block.id }),
      run: () =>
        run(() =>
          editor.dispatch({
            type: 'resetTableColumnWidths',
            payload: { blockId: block.id },
          } as never),
        ),
    },
  ];
}

/** Ячейки, к которым относится фон из меню таблицы: выделенные, а без выделения — все. */
export function backgroundTarget(
  editor: Editor,
  block: BaseBlock,
  picked: CellSelection | null,
): CellSelection | null {
  if (picked?.tableId === block.id) return picked;

  const size = tableSize((id) => editor.store.getBlock(id), block.id);

  if (!size) return null;

  const range = { top: 0, left: 0, bottom: size.rows - 1, right: size.columns - 1 };
  const ids = new Set(tableRangeCells((id) => editor.store.getBlock(id), block.id, range).flat());

  return {
    tableId: block.id,
    anchor: { row: 0, column: 0 },
    head: { row: range.bottom, column: range.right },
    range,
    ids,
  };
}

/** Ряд цветов фона ячеек для меню таблицы; применяется к выделенным ячейкам или ко всей таблице. */
export function cellsBackgroundMenu(
  editor: Editor,
  block: BaseBlock,
  picked: CellSelection | null,
  run: (action: () => void) => void,
): BlockMenuBackground | undefined {
  const target = backgroundTarget(editor, block, picked);

  if (!target) return undefined;

  const backgrounds = new Set(
    [...target.ids].map((id) => {
      const cell = editor.store.getBlock(id);

      return cell ? getBlockBackground(cell) : undefined;
    }),
  );

  return {
    current: backgrounds.size === 1 ? [...backgrounds][0] : undefined,
    options: BLOCK_BACKGROUNDS,
    onPick: (color) =>
      run(() => void backgroundCells(editor, target, color as BlockBackground | null)),
  };
}
