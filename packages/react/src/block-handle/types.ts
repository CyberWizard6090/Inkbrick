import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  PointerEvent as ReactPointerEvent,
} from 'react';

import type { BaseBlock } from '@inkbrick/document';

import type { DropIndicatorRect, DropPosition, DropSide } from './BlockHandleController';

/**
 * Props встроенного жеста для элемента-«хваталки»: клик открывает меню, протягивание мышью
 * или долгое нажатие пальцем переносит блок. Свой DnD может их не вешать (см. `useBlockDrag`).
 */
export interface GripProps {
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  /** Долгое нажатие пальцем не должно открывать системное контекстное меню. */
  readonly onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
  /** `touch-action: none`: палец на хваталке не прокручивает страницу. */
  readonly style: CSSProperties;
  readonly 'data-inkbrick-grip': '';
}

export interface BlockHandleProps {
  readonly blockId: string;
  /** Левый верхний угол блока в координатах окна (для position: fixed). */
  readonly position: { readonly x: number; readonly y: number };
  readonly canAdd: boolean;
  readonly dragging: boolean;
  readonly menuOpen: boolean;
  readonly onAdd: () => void;
  /** Открывает меню действий (например, по клавиатуре). Обычный клик по «хваталке» открывает его сам. */
  readonly onOpenMenu: () => void;
  /**
   * Повесьте на элемент-«хваталку»: клик открывает меню, протягивание мышью или долгое нажатие пальцем
   * переносит блок. Для своего DnD не вешайте их, а вызовите `onOpenMenu` по клику и `useBlockDrag()` для переноса.
   */
  readonly gripProps: GripProps;
}

export interface DropIndicatorProps {
  readonly blockId: string;
  readonly targetId: string;
  readonly position: DropPosition;
  /** Задана, когда блок встаёт рядом с целью (в колонки): линия вертикальная, `position` — `before` слева и `after` справа. */
  readonly side?: DropSide;
  /** Где рисовать линию, в координатах окна (для position: fixed). */
  readonly indicator: DropIndicatorRect;
}

export interface BlockMenuAction {
  readonly id: string;
  readonly title: string;
  readonly icon?: ReactNode;
  readonly disabled?: boolean;
  readonly danger?: boolean;
  /** Пункт-переключатель (заголовок, закрепление): справа рисуется выключатель в положении `toggle`, `aria-checked`. */
  readonly toggle?: boolean;
  /** Группа пункта (готовая подпись): над первым пунктом группы рисуется её название, как в меню выбора блоков. */
  readonly group?: string;
  readonly run: () => void;
}

/**
 * Фон блока в меню: доступные цвета, текущий (имя из палитры или свой `#rrggbb`) и выбор (`null` снимает фон). Нет у
 * блоков, которым фон не положен.
 */
export interface BlockMenuBackground {
  readonly current: string | undefined;
  readonly options: readonly string[];
  readonly onPick: (color: string | null) => void;
}

/** Своя секция меню блока (например, галерея стилей и границы таблицы): заголовок и содержимое. */
export interface BlockMenuPanel {
  readonly id: string;
  readonly title: string;
  readonly content: ReactNode;
}

export interface BlockMenuProps {
  readonly block: BaseBlock;
  readonly position: { readonly x: number; readonly y: number };
  readonly actions: readonly BlockMenuAction[];
  readonly turnInto: readonly BlockMenuAction[];
  /** Ряд цветов фона блока; свои меню (`slots.BlockMenu`) могут его не показывать. */
  readonly background?: BlockMenuBackground;
  /** Дополнительные секции под пунктами; свои меню (`slots.BlockMenu`) могут их не показывать. */
  readonly panels?: readonly BlockMenuPanel[];
  readonly onClose: () => void;
  /** Отмена без выбора (касание затемнения за листом): закрыть меню, не возвращая фокус в документ. */
  readonly onDismiss?: () => void;
}
