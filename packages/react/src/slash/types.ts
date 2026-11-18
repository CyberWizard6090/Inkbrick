import type { ReactNode } from 'react';

import type { CaretResult, Editor } from '@inkbrick/engine';

import type { EditorView } from '../editing/EditorView';

/** Что получает действие пункта: редактор и место, где был набран «/» (запрос уже удалён). */
export interface SlashRunContext {
  readonly editor: Editor;
  readonly view: EditorView;
  readonly blockId: string;
  readonly offset: number;
}

export interface SlashMenuItem {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly keywords?: readonly string[];
  readonly icon?: ReactNode;
  /**
   * Группа в меню: `basic` (основные), `media`, `advanced` или своя (название — ключ `slash.group.<имя>` в словаре, иначе само имя).
   * Без группы пункт стоит после всех групп.
   */
  readonly group?: string;
  readonly flavour: string;
  readonly props?: Readonly<Record<string, unknown>>;
  /**
   * Действие вместо превращения блока: вызывается после удаления «/запроса», каретка стоит на его месте. Такой пункт не
   * подходит для «Превратить в» и «Вставить» (в них попадают только пункты без `run`).
   */
  readonly run?: (context: SlashRunContext) => CaretResult | void;
  /** Можно ли выполнить действие в этом блоке; `false` скрывает пункт. Для пунктов с `run`. */
  readonly canRun?: (context: { readonly editor: Editor; readonly blockId: string }) => boolean;
}

export interface SlashMenuProps {
  readonly items: readonly SlashMenuItem[];
  readonly query: string;
  readonly activeIndex: number;
  readonly position: { readonly x: number; readonly y: number };
  readonly onSelect: (item: SlashMenuItem) => void;
  readonly onHover: (index: number) => void;
  readonly onClose: () => void;
}
