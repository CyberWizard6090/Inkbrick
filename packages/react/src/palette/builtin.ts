import { flushSync } from 'react-dom';

import type { CaretResult } from '@inkbrick/engine';

import { isFormattable, toggleFormatInSelection } from '../toolbar/formatting';
import { availableSlashItems } from '../slash/items';
import { convertBlocks, convertibleIn } from '../pick/actions';
import type { SlashMenuItem } from '../slash/types';
import type { TFunction } from '../i18n/translate';
import {
  cellFormatCommands,
  formatPickedCells,
  pickedCells,
  tablePaletteCommands,
} from '../table/paletteCommands';
import type { PaletteCommand, PaletteContext } from './types';

const FORMATS = [
  { format: 'bold', shortcut: 'Mod-B' },
  { format: 'italic', shortcut: 'Mod-I' },
  { format: 'underline', shortcut: 'Mod-U' },
  { format: 'strike', shortcut: 'Mod-Shift-X' },
  { format: 'code', shortcut: 'Mod-E' },
] as const;

const isMac = () =>
  typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform ?? '');

/** `Mod-Shift-X` → `Ctrl+Shift+X` или `⌘⇧X`: подсказка в списке повторяет клавиши платформы. */
export function formatShortcut(shortcut: string): string {
  const mac = isMac();

  return shortcut
    .split('-')
    .map((part) => {
      if (part === 'Mod') return mac ? '⌘' : 'Ctrl';
      if (part === 'Shift') return mac ? '⇧' : 'Shift';
      if (part === 'Alt') return mac ? '⌥' : 'Alt';

      return part;
    })
    .join(mac ? '' : '+');
}

/** Блок, в котором стоит каретка (или начало выделения), и можно ли в нём что-то менять. */
const currentBlock = ({ editor, selection }: PaletteContext) =>
  selection ? editor.store.getBlock(selection.from.blockId) : undefined;

/** Блоки, к которым относится команда: выбранный ряд, а без выбора — блок под кареткой. */
const targetBlocks = (context: PaletteContext): readonly string[] => {
  const ids = context.view.picked.getState().ids;

  return ids.length > 0 ? ids : [currentBlock(context)?.id].filter((id) => id !== undefined);
};

const editable = (context: PaletteContext) => !context.readOnly;

function restore({ view, selection }: PaletteContext): void {
  if (selection) view.placeSelection(selection.from, selection.to);
}

/**
 * Встроенные команды: история, форматирование выделения и «Превратить в» / «Вставить» по пунктам slash-меню редактора.
 * Список строится при каждом открытии палитры, поэтому учитывает текущий блок и выделение.
 */
export function builtinCommands(
  slashItems: readonly SlashMenuItem[],
  t: TFunction,
): PaletteCommand[] {
  const commands: PaletteCommand[] = [
    {
      id: 'history.undo',
      title: t('history.undo'),
      group: t('palette.group.document'),
      shortcut: 'Mod-Z',
      when: (context) => editable(context) && context.editor.canUndo,
      run: ({ editor, view }) => {
        let result: ReturnType<typeof editor.undo>;

        flushSync(() => {
          result = editor.undo();
        });
        if (result?.caret) view.placeCaret(result.caret.blockId, result.caret.offset);
      },
    },
    {
      id: 'history.redo',
      title: t('history.redo'),
      group: t('palette.group.document'),
      shortcut: 'Mod-Shift-Z',
      when: (context) => editable(context) && context.editor.canRedo,
      run: ({ editor, view }) => {
        let result: ReturnType<typeof editor.redo>;

        flushSync(() => {
          result = editor.redo();
        });
        if (result?.caret) view.placeCaret(result.caret.blockId, result.caret.offset);
      },
    },
    ...FORMATS.map(({ format, shortcut }) => ({
      id: `format.${format}`,
      title: t(`toolbar.${format}.label`),
      group: t('palette.group.format'),
      shortcut,
      // Выделены ячейки таблицы — формат применяется ко всем сразу (см. `table/cellFormatting`).
      when: (context: PaletteContext) =>
        !!pickedCells(context) ||
        (editable(context) &&
          !!context.selection &&
          !context.selection.collapsed &&
          isFormattable(context.editor, context.selection)),
      run: (context: PaletteContext) => {
        if (formatPickedCells(context, format)) return;

        if (context.selection) {
          toggleFormatInSelection(context.editor, context.view, context.selection, format);
        }
      },
    })),
    ...cellFormatCommands(),
    ...tablePaletteCommands(),
  ];

  for (const item of slashItems) {
    // Пункт-действие (вставить сноску) — команда сама по себе: выполняется на месте каретки.
    if (item.run) {
      commands.push({
        id: `action.${item.id}`,
        title: t('palette.insert', { name: item.title }),
        group: t('palette.group.insert'),
        keywords: [item.title, ...(item.keywords ?? [])],
        when: (context) => {
          const selection = context.selection;

          return (
            editable(context) &&
            !!selection &&
            availableSlashItems(context.editor, [item], selection.from.blockId).length > 0
          );
        },
        run: (context) => {
          const selection = context.selection;

          if (!selection) return;

          let target: CaretResult | undefined;

          flushSync(() => {
            target =
              item.run!({
                editor: context.editor,
                view: context.view,
                blockId: selection.to.blockId,
                offset: selection.to.offset,
              }) || undefined;
          });

          if (target) context.view.placeCaret(target.blockId, target.offset);
        },
      });
      continue;
    }

    commands.push(
      {
        id: `turn.${item.id}`,
        title: t('palette.turnInto', { name: item.title }),
        group: t('palette.group.turn'),
        keywords: [item.title, ...(item.keywords ?? [])],
        when: (context) => {
          const { editor } = context;
          const ids = targetBlocks(context);

          return (
            editable(context) &&
            ids.length > 0 &&
            availableSlashItems(editor, [item], ids[0]).length > 0 &&
            convertibleIn(editor, ids, item).some((id) => {
              const block = editor.store.getBlock(id)!;

              return !(
                block.flavour === item.flavour &&
                Object.entries(item.props ?? {}).every(
                  ([key, value]) => key === 'checked' || block.props[key] === value,
                )
              );
            })
          );
        },
        run: (context) => {
          const ids = targetBlocks(context);

          if (ids.length === 0) return;

          convertBlocks(context.editor, ids, item);
          restore(context);
        },
      },
      {
        id: `insert.${item.id}`,
        title: t('palette.insert', { name: item.title }),
        group: t('palette.group.insert'),
        keywords: [item.title, ...(item.keywords ?? [])],
        when: (context) => {
          const block = currentBlock(context);

          return (
            editable(context) &&
            !!block &&
            availableSlashItems(context.editor, [item], block.id).length > 0
          );
        },
        run: (context) => {
          const block = currentBlock(context);

          if (!block) return;

          let caret: CaretResult | undefined;

          flushSync(() => {
            caret = context.editor.dispatch({
              type: 'insertBlock',
              payload: {
                flavour: item.flavour,
                afterId: block.id,
                parentId: block.parentId ?? undefined,
                props: item.props as never,
              },
            }) as CaretResult | undefined;
          });
          if (caret) context.view.placeCaret(caret.blockId, caret.offset);
        },
      },
    );
  }

  return commands;
}
