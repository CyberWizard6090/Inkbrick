import type { ReactNode } from 'react';

import type { SlashMenuItem as BaseSlashMenuItem } from '@inkbrick/view';

export type { SlashRunContext } from '@inkbrick/view';

/** Пункт slash-меню; значок — элемент React. */
export interface SlashMenuItem extends BaseSlashMenuItem {
  readonly icon?: ReactNode;
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
