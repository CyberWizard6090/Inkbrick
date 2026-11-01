import type { ComponentType } from 'react';

import type { BlockProps as DocumentBlockProps } from '@inkbrick/document';
import type { BlockController, BlockDefinition, TypedBlock } from '@inkbrick/engine';

import type { BlockComponent, BlockComponentRegistry, BlockViewProps } from '../ui/types';

export type CustomBlockViewProps<TProps extends DocumentBlockProps = DocumentBlockProps> =
  BlockViewProps<TypedBlock<TProps> & { props: TProps }>;

/**
 * Пользовательский блок целиком: схема документа, React-компонент и (необязательно) контроллер поведения.
 * Схема и контроллер нужны движку (`new Editor({ blocks: [...] })`), компонент — UI (`<EditorProvider blocks>`).
 */
export interface ReactBlockDefinition<
  TProps extends DocumentBlockProps = DocumentBlockProps,
> extends BlockDefinition<TProps> {
  readonly component: ComponentType<CustomBlockViewProps<TProps>>;
  readonly controller?: BlockController<TProps>;
}

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
  blocks: readonly ReactBlockDefinition<any>[] | undefined,
): BlockComponentRegistry {
  const registry: Record<string, BlockComponent> = {};

  for (const block of blocks ?? []) {
    registry[block.schema.flavour] = block.component as unknown as BlockComponent;
  }

  return registry;
}
