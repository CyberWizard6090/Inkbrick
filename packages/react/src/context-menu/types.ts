import type { ReactNode } from 'react';

/**
 * Где показывать форматирование текста:
 *  - `'context-menu'` (по умолчанию) — в контекстном меню по правому клику; плавающий toolbar не показывается,
 *    поэтому его не перекрывает меню выделения браузера. На сенсорном экране правого клика нет — там toolbar;
 *  - `'toolbar'` — плавающий toolbar над выделением, контекстное меню браузерное;
 *  - `'both'` — и то и другое.
 */
export type FormattingMode = 'context-menu' | 'toolbar' | 'both';

export interface ContextMenuItem {
  readonly id: string;
  readonly title: string;
  readonly icon?: ReactNode;
  /** Подсказка с клавишами, например `Ctrl+C`. */
  readonly shortcut?: string;
  readonly disabled?: boolean;
  /** Пункт-переключатель: справа рисуется выключатель в положении `toggle`, у пункта `menuitemcheckbox` и `aria-checked`. */
  readonly toggle?: boolean;
  /** Группа пункта (готовая подпись): над первым пунктом группы рисуется её название, как в меню выбора блоков. */
  readonly group?: string;
  /** Разделитель перед пунктом: отделяет группу пунктов блока от стандартных. */
  readonly separatorBefore?: boolean;
  /**
   * Секция со своим содержимым (например, галерея стилей таблицы): `title` становится заголовком, `content` рисуется под
   * ним, а сам пункт не нажимается (`run` не вызывается).
   */
  readonly content?: ReactNode;
  /**
   * Вложенное меню: пункт с шевроном открывает справа от себя список пунктов (они могут вкладываться дальше). Сам пункт не
   * нажимается: `run` не вызывается.
   */
  readonly submenu?: readonly ContextMenuItem[];
  /** Вложенная панель со своим содержимым (например, палитра цветов); открывается так же, как `submenu`. */
  readonly flyout?: ReactNode;
  /** Пункт выбран (текущее значение): рисуется с галочкой и `aria-checked`. */
  readonly checked?: boolean;
  readonly run: () => void;
}

export interface ContextMenuProps {
  /** Точка правого клика (координаты окна, для position: fixed). */
  readonly position: { readonly x: number; readonly y: number };
  /**
   * Кнопки форматирования — тот же `slots.Toolbar` (по умолчанию `DefaultToolbar`) с `placement: 'inline'`;
   * `null`, если выделения нет или его нельзя форматировать.
   */
  readonly formatting: ReactNode | null;
  /** Вырезать, копировать, вставить, выделить всё. */
  readonly items: readonly ContextMenuItem[];
  readonly onClose: () => void;
  /**
   * Отмена без выбора (касание затемнения за листом на телефоне): закрыть меню, не трогая фокус и каретку. `onClose` после
   * выбора возвращает фокус в документ, а при отмене это поднимало бы клавиатуру и сдвигало каретку. Своё меню
   * (`slots.ContextMenu`) может его не вызывать.
   */
  readonly onDismiss?: () => void;
}
