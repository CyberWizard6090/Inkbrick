import type { InlineNode } from '@inkbrick/document';

export const FRAGMENT_MIME = 'application/x-inkbrick-fragment';

/** Блок во фрагменте: данные без идентификаторов (при вставке создаются новые). */
export interface FragmentBlock {
  flavour: string;
  props: Record<string, unknown>;
  content: InlineNode[];
  children: FragmentBlock[];
  /**
   * Блок скопирован целиком (выделение покрывало весь его текст). Только у блоков верхнего уровня
   * фрагмента: пустой блок при вставке перенимает тип целиком скопированного блока.
   */
  complete?: boolean;
}

export interface Fragment {
  blocks: FragmentBlock[];
}
