import type { ReactNode } from 'react';

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
