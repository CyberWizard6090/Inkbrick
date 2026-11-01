import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  PointerEvent as ReactPointerEvent,
} from 'react';

import type { BaseBlock } from '@inkbrick/document';

import type { DropIndicatorRect, DropPosition } from './BlockHandleController';

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
  /** Где рисовать линию, в координатах окна (для position: fixed). */
  readonly indicator: DropIndicatorRect;
}

export interface BlockMenuAction {
  readonly id: string;
  readonly title: string;
  readonly icon?: ReactNode;
  readonly disabled?: boolean;
  readonly danger?: boolean;
  readonly run: () => void;
}

export interface BlockMenuProps {
  readonly block: BaseBlock;
  readonly position: { readonly x: number; readonly y: number };
  readonly actions: readonly BlockMenuAction[];
  readonly turnInto: readonly BlockMenuAction[];
  readonly onClose: () => void;
}
