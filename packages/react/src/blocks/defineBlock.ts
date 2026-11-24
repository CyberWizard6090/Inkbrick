import type { ComponentType } from 'react';

import type { BlockProps as DocumentBlockProps } from '@inkbrick/document';
import type { BlockController, BlockDefinition, Editor, TypedBlock } from '@inkbrick/engine';

import type { EditorView } from '../editing/EditorView';

import type { ContextMenuItem } from '../context-menu/types';
import type { DocPoint } from '../editing/selection';
import type { KeyBinding } from '../keymap/types';
import type { SlashMenuItem } from '../slash/types';
import type { TFunction } from '@inkbrick/locales';
import type { BlockComponent, BlockComponentRegistry, BlockViewProps } from '../ui/types';

export type CustomBlockViewProps<TProps extends DocumentBlockProps = DocumentBlockProps> =
  BlockViewProps<TypedBlock<TProps> & { props: TProps }>;

/** Что известно блоку, когда пользователь открывает контекстное меню (правый клик). */
export interface BlockContextMenuContext {
  readonly editor: Editor;
  readonly view: EditorView;
  readonly selection: { readonly from: DocPoint; readonly to: DocPoint } | null;
  readonly t: TFunction;
  /** Закрывает контекстное меню (нужно секциям со своим содержимым, у которых нет общего `run`). */
  readonly close: () => void;
}

/**
 * Пользовательский блок целиком: схема документа, React-компонент и (необязательно) контроллер поведения.
 * Схема и контроллер нужны движку (`new Editor({ blocks: [...] })`), компонент — UI (`<EditorProvider blocks>`).
 */
export interface ReactBlockDefinition<
  TProps extends DocumentBlockProps = DocumentBlockProps,
> extends BlockDefinition<TProps> {
  readonly component: ComponentType<CustomBlockViewProps<TProps>>;
  readonly controller?: BlockController<TProps>;
  /**
   * Клавиши блока, которым нужен доступ к выделению и DOM (`KeymapContext`): переход между ячейками таблицы.
   * Проверяются раньше стандартных; клавиши без такой нужды удобнее задать в `controller.keymap`.
   */
  readonly keymap?: readonly KeyBinding[];
  /**
   * Пункты контекстного меню (правый клик), которые блок добавляет к стандартным, например «Вставить строку» в таблице.
   * Функция вызывается при открытии меню; вернуть `[]`, если выделение не в этом блоке. Пункты идут после стандартных,
   * под разделителем.
   */
  readonly contextMenu?: (context: BlockContextMenuContext) => readonly ContextMenuItem[];
  /**
   * Пункты slash-меню, которые не превращают блок, а выполняют действие на месте набранного «/» (например, вставляют
   * сноску). Поле `flavour` пункта показывает, какой блок нужен документу: без его схемы пункт скрыт.
   */
  readonly slashActions?: readonly SlashMenuItem[];
}

/** Блок с любыми props — так их держат списки разных блоков (см. `AnyBlockDefinition` в `@inkbrick/engine`). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a list of blocks with different props, the type parameter is invariant
export type AnyReactBlockDefinition = ReactBlockDefinition<any>;

/**
 * Объявляет пользовательский блок одним объектом:
 *
 * ```ts
 * export const counterBlock = defineBlock<CounterProps>({ schema, component: CounterView, controller });
 * const editor = new Editor({ blocks: [counterBlock] });
 * <EditorProvider editor={editor} blocks={[counterBlock]}>…
 * ```
 *
 * Объект создавайте один раз (вне компонента).
 */
export function defineBlock<TProps extends DocumentBlockProps = DocumentBlockProps>(
  definition: ReactBlockDefinition<TProps>,
): ReactBlockDefinition<TProps> {
  return definition;
}

export function blockComponentsOf(
  blocks: readonly AnyReactBlockDefinition[] | undefined,
): BlockComponentRegistry {
  const registry: Record<string, BlockComponent> = {};

  for (const block of blocks ?? []) {
    registry[block.schema.flavour] = block.component as unknown as BlockComponent;
  }

  return registry;
}
