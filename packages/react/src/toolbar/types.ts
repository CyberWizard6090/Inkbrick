import type { ReactNode } from 'react';

import type { Alignment } from '@inkbrick/document';
import type { RangeFormats } from '@inkbrick/engine';

export type InlineFormat = 'bold' | 'italic' | 'underline' | 'strike' | 'code';

export type ToolbarPanel = 'color' | 'highlight';

/** Пункт списка «Превратить в» в toolbar. */
export interface ToolbarTurnOption {
  readonly id: string;
  readonly title: string;
  readonly icon?: ReactNode;
  /** Блок уже этого типа. */
  readonly active: boolean;
  readonly run: () => void;
}

/** Превращение блока под выделением в другой тип: название текущего типа и куда можно превратить. */
export interface ToolbarTurnInto {
  readonly title: string;
  readonly options: readonly ToolbarTurnOption[];
}

export interface ToolbarProps {
  readonly formats: RangeFormats;
  readonly position: { readonly x: number; readonly y: number };
  /**
   * `'floating'` (по умолчанию) — toolbar сам встаёт над выделением (`position` — середина его верхнего края);
   * `'inline'` — часть контекстного меню: обычный блок без своего позиционирования.
   */
  readonly placement?: 'floating' | 'inline';
  readonly linkOpen: boolean;
  readonly onToggle: (format: InlineFormat) => void;
  readonly onOpenLink: () => void;
  readonly onApplyLink: (url: string | null) => boolean;
  readonly onCancelLink: () => void;
  readonly panel: ToolbarPanel | null;
  readonly onTogglePanel: (panel: ToolbarPanel) => void;
  readonly onApplyColor: (kind: 'color' | 'backgroundColor', value: string | null) => void;
  readonly onAlign: (align: Alignment) => void;
  readonly onInsertFormula: () => void;
  /** Есть, когда выделение в одном блоке и его можно превратить в другой тип; без поля кнопки «Превратить в» нет. */
  readonly turnInto?: ToolbarTurnInto;
}
