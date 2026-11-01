import { createContext, type ComponentType } from 'react';

import type { BlockId } from '@inkbrick/document';

import { BlockRenderer } from './BlockRenderer';

export interface ChildListProps {
  readonly parentId: BlockId;
  readonly ids: readonly BlockId[];
}

/**
 * Способ отрисовки документа: как выводить детей каждого контейнера (страницы, заметки, вложенного списка).
 * Модель и команды от него не зависят. Встроенные варианты — `fullRenderer` (всё дерево, по умолчанию)
 * и `virtualRenderer()` (только блоки около видимой области).
 */
export interface DocumentRenderer {
  readonly ChildList: ComponentType<ChildListProps>;
}

function FullChildList({ ids }: ChildListProps) {
  return (
    <>
      {ids.map((id) => (
        <BlockRenderer key={id} id={id} />
      ))}
    </>
  );
}

export const fullRenderer: DocumentRenderer = { ChildList: FullChildList };

export const DocumentRendererContext = createContext<DocumentRenderer>(fullRenderer);
