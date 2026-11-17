import { flushSync } from 'react-dom';

import type { CaretResult } from '@inkbrick/engine';

import { isFormattable, toggleFormatInSelection } from '../toolbar/formatting';
import { availableSlashItems } from '../slash/items';
import type { SlashMenuItem } from '../slash/types';
import type { TFunction } from '../i18n/translate';
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
      when: (context: PaletteContext) =>
        editable(context) &&
        !!context.selection &&
        !context.selection.collapsed &&
        isFormattable(context.editor, context.selection),
      run: (context: PaletteContext) => {
        if (context.selection) {
          toggleFormatInSelection(context.editor, context.view, context.selection, format);
        }
      },
    })),
  ];

  for (const item of slashItems) {
    commands.push(
      {
        id: `turn.${item.id}`,
        title: t('palette.turnInto', { name: item.title }),
        group: t('palette.group.turn'),
        keywords: [item.title, ...(item.keywords ?? [])],
        when: (context) => {
          const block = currentBlock(context);

          return (
            editable(context) &&
            !!block &&
            availableSlashItems(context.editor, [item], block.id).length > 0 &&
            context.editor.can('convertBlock', {
              blockId: block.id,
              flavour: item.flavour,
              props: item.props as never,
            }) &&
            !(
              block.flavour === item.flavour &&
              Object.entries(item.props ?? {}).every(
                ([key, value]) => key === 'checked' || block.props[key] === value,
              )
            )
          );
        },
        run: (context) => {
          const block = currentBlock(context);

          if (!block) return;

          flushSync(() => {
            context.editor.dispatch({
              type: 'convertBlock',
              payload: { blockId: block.id, flavour: item.flavour, props: item.props as never },
            });
          });
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
