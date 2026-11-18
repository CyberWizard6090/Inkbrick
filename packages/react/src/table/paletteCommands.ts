import { flushSync } from 'react-dom';

import { BLOCK_BACKGROUNDS, type Alignment, type BlockBackground } from '@inkbrick/document';
import { locateTableCell, type TableTextFormat } from '@inkbrick/engine';

import type { PaletteCommand, PaletteContext } from '../palette/types';
import { alignCells, backgroundCells, clearCellsFormat, formatCells } from './cellFormatting';
import { backgroundTarget } from './tableFormatActions';

const editable = (context: PaletteContext) => !context.readOnly;

/** Таблица, к которой относится команда: с выделенными ячейками или с кареткой в ячейке. */
function tableOf(context: PaletteContext) {
  const { editor, view, selection } = context;
  const picked = view.cells.get();
  const id =
    picked?.tableId ??
    (selection
      ? locateTableCell((id) => editor.store.getBlock(id), selection.from.blockId)?.tableId
      : undefined);
  const block = id ? editor.store.getBlock(id) : undefined;

  return block?.flavour === 'block:table' ? block : undefined;
}

const hasTable = (context: PaletteContext) => editable(context) && !!tableOf(context);

const ALIGNS = ['left', 'center', 'right'] as const satisfies readonly Alignment[];

/**
 * Команды палитры для выделенных ячеек и таблицы: форматирование диапазона (выравнивание, начертание, очистка), фон ячеек,
 * заголовочные строка и столбец, чередование строк, границы, сброс ширин. Форматирование ячеек работает, пока ячейки
 * выделены; остальные — когда курсор в таблице.
 */
export function tablePaletteCommands(): PaletteCommand[] {
  type Key = 'header' | 'headerColumn' | 'striped' | 'borders';
  type Title = 'table.row.headerOn' | 'table.row.headerOff';

  const isOn = (block: { props: Record<string, unknown> }, key: Key) =>
    key === 'header' || key === 'borders' ? block.props[key] !== false : block.props[key] === true;

  /** Два пункта на свойство: «включить» виден, пока оно выключено, «выключить» — пока включено. */
  const toggle = (key: Key, on: string, off: string): PaletteCommand[] =>
    [true, false].map((enable): PaletteCommand => ({
      id: `table.${key}.${enable ? 'on' : 'off'}`,
      title: (t) => t((enable ? on : off) as Title),
      group: (t) => t('palette.group.table'),
      when: (context) => {
        const block = tableOf(context);

        return editable(context) && !!block && isOn(block, key) !== enable;
      },
      run: (context) => {
        const block = tableOf(context);

        if (!block) return;

        context.editor.sealHistory();
        flushSync(() =>
          context.editor.dispatch({
            type: 'setBlockProps',
            payload: { blockId: block.id, props: { [key]: enable } },
          }),
        );
      },
    }));

  return [
    ...toggle('header', 'table.row.headerOn', 'table.row.headerOff'),
    ...toggle('headerColumn', 'table.format.headerColumnOn', 'table.format.headerColumnOff'),
    ...toggle('striped', 'table.format.stripedOn', 'table.format.stripedOff'),
    ...toggle('borders', 'table.format.bordersOn', 'table.format.bordersOff'),
    {
      id: 'table.resetWidths',
      title: (t) => t('table.format.resetWidths'),
      group: (t) => t('palette.group.table'),
      when: (context) => {
        const block = tableOf(context);

        return (
          editable(context) &&
          !!block &&
          context.editor.can('resetTableColumnWidths', { blockId: block.id })
        );
      },
      run: (context) => {
        const block = tableOf(context);

        if (block) {
          context.editor.sealHistory();
          flushSync(() =>
            context.editor.dispatch({
              type: 'resetTableColumnWidths',
              payload: { blockId: block.id },
            } as never),
          );
        }
      },
    },
    ...BLOCK_BACKGROUNDS.map((color): PaletteCommand => ({
      id: `table.background.${color}`,
      title: (t) => t('palette.table.background', { color: t(`color.${color}`) }),
      group: (t) => t('palette.group.table'),
      keywords: [color],
      when: hasTable,
      run: (context) => setBackground(context, color),
    })),
    {
      id: 'table.background.none',
      title: (t) => t('palette.table.backgroundNone'),
      group: (t) => t('palette.group.table'),
      when: hasTable,
      run: (context) => setBackground(context, null),
    },
  ];
}

/** Фон выделенных ячеек, а без выделения — всех ячеек таблицы. */
function setBackground(context: PaletteContext, color: BlockBackground | null): void {
  const block = tableOf(context);
  const target = block ? backgroundTarget(context.editor, block, context.view.cells.get()) : null;

  if (target) backgroundCells(context.editor, target, color);
}

/** Выделенные ячейки (или `null`): форматирование и выравнивание в палитре применяются к ним, а не к тексту. */
export const pickedCells = (context: PaletteContext) =>
  editable(context) ? context.view.cells.get() : null;

/** Форматирование диапазона ячеек для встроенных команд палитры: выравнивание и очистка. */
export function cellFormatCommands(): PaletteCommand[] {
  return [
    ...ALIGNS.map((align): PaletteCommand => ({
      id: `align.${align}`,
      title: (t) => t(`toolbar.align.${align}.label`),
      group: (t) => t('palette.group.format'),
      shortcut: { left: 'Mod-Shift-L', center: 'Mod-Shift-E', right: 'Mod-Shift-R' }[align],
      when: (context) => !!pickedCells(context),
      run: (context) => {
        const picked = pickedCells(context);

        if (picked) alignCells(context.editor, picked, align);
      },
    })),
    {
      id: 'format.clear',
      title: (t) => t('toolbar.clear.label'),
      group: (t) => t('palette.group.format'),
      when: (context) => !!pickedCells(context),
      run: (context) => {
        const picked = pickedCells(context);

        if (picked) clearCellsFormat(context.editor, picked);
      },
    },
  ];
}

/** Переключает формат у выделенных ячеек; `false` — ячейки не выделены. */
export function formatPickedCells(context: PaletteContext, format: TableTextFormat): boolean {
  const picked = pickedCells(context);

  if (!picked) return false;

  formatCells(context.editor, picked, format);

  return true;
}
