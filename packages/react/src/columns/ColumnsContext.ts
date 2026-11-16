import { createContext } from 'react';

import type { BlockId } from '@inkbrick/document';

export interface ColumnsLayout {
  /** Колонки по порядку; у последней нет разделителя. */
  readonly ids: readonly BlockId[];
  /** Доли ширины колонок (в сумме 1) — для `aria-valuenow` разделителей. */
  readonly shares: readonly number[];
  /** Колонка, ширину которой сейчас тянут: рисуется поверх сохранённых долей. */
  readonly onDrag: (index: number, event: PointerEvent | { clientX: number }) => void;
  readonly onKey: (index: number, delta: number) => void;
  readonly readOnly: boolean;
}

export const ColumnsContext = createContext<ColumnsLayout | null>(null);
