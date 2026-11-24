import type { ReactNode } from 'react';

import type { Editor } from '@inkbrick/engine';

import type { EditorView, DocSelection } from '@inkbrick/view';
import type { TFunction } from '@inkbrick/locales';

/** Что видит команда: редактор, текущее выделение (запомнено в момент открытия палитры) и перевод. */
export interface PaletteContext {
  readonly editor: Editor;
  readonly view: EditorView;
  readonly t: TFunction;
  readonly readOnly: boolean;
  /** Выделение документа в момент открытия палитры; `null`, если курсора в документе не было. */
  readonly selection: DocSelection | null;
}

/** Строка или функция от перевода: так команды, которые поставляет библиотека, следуют языку редактора. */
export type PaletteText = string | ((t: TFunction) => string);

export interface PaletteCommand {
  /** Уникальное имя. Команда приложения с тем же `id`, что у встроенной, заменяет её. */
  readonly id: string;
  readonly title: PaletteText;
  readonly description?: PaletteText;
  /** Раздел в списке (заголовок группы); без раздела команда стоит после всех. */
  readonly group?: PaletteText;
  readonly keywords?: readonly string[];
  /** Подсказка с комбинацией клавиш (только показывается), например `'Ctrl+B'`. */
  readonly shortcut?: string;
  readonly icon?: ReactNode;
  /** Нет `when` — команда доступна всегда; `false` скрывает её из списка. */
  readonly when?: (context: PaletteContext) => boolean;
  /** Выполняется после закрытия палитры; фокус и выделение к этому моменту возвращены в документ. */
  readonly run: (context: PaletteContext) => void;
}

/** Команда с уже переведёнными названием, описанием и разделом. */
export interface ResolvedPaletteCommand extends Omit<
  PaletteCommand,
  'title' | 'description' | 'group'
> {
  readonly title: string;
  readonly description?: string;
  readonly group?: string;
}

const text = (value: PaletteText, t: TFunction) => (typeof value === 'function' ? value(t) : value);

export function resolveCommand(command: PaletteCommand, t: TFunction): ResolvedPaletteCommand {
  return {
    ...command,
    title: text(command.title, t),
    description: command.description === undefined ? undefined : text(command.description, t),
    group: command.group === undefined ? undefined : text(command.group, t),
  };
}
