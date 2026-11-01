import type { CodeHighlighter } from '../code/types';
import type { FormulaRenderer } from '../math/renderer';
import type { SlashMenuItem } from '../slash/types';
import type { BlockComponentRegistry, EditorSlots } from './types';

/**
 * Визуальный слой редактора одним объектом: представления блоков, элементы оболочки (меню, toolbar, ручки),
 * пункты slash-меню, подсветка кода и отрисовка формул. Модель документа и команды от него не зависят, поэтому
 * дизайн-систему можно подключить к любому редактору: `<EditorProvider presentation={myDesignSystem}>`.
 *
 * Отдельные props провайдера (`components`, `slots`, …) уточняют presentation: `components` и `slots`
 * сливаются с ним (одинаковый ключ — из prop), остальное заменяется целиком.
 */
export interface EditorPresentation {
  readonly components?: BlockComponentRegistry;
  readonly slots?: EditorSlots;
  readonly slashItems?: readonly SlashMenuItem[] | false;
  readonly highlighter?: CodeHighlighter | false;
  readonly formulaRenderer?: FormulaRenderer | false;
}

export function definePresentation<T extends EditorPresentation>(presentation: T): T {
  return presentation;
}
