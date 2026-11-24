import type { BaseBlock, TableProps } from '@inkbrick/document';
import { tableSize, type Editor, tableRangeCells } from '@inkbrick/engine';
import type { CellSelection } from '@inkbrick/view';

import type { BlockMenuAction } from '../block-handle/types';
import type { TFunction } from '@inkbrick/locales';
import { Icon } from '../icons/Icon';

/** Свойство таблицы, которое переключает пункт меню. */
type Toggle = 'header' | 'headerColumn' | 'striped' | 'borders' | 'freezeRow' | 'freezeColumn';

const isOn = (props: TableProps, key: Toggle): boolean =>
  key === 'header' || key === 'borders' ? props[key] !== false : props[key] === true;

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
 * Пункты — переключатели (как в Notion): название — свойство («Строка заголовка»), выключатель справа — его состояние.
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
      // «Границы ячеек» — та же подпись, что у вложенного меню границ.
      title: t(key === 'borders' ? 'table.border.cells' : `table.toggle.${key}`),
      icon: <Icon name={ICONS[key]} />,
      toggle: on,
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
