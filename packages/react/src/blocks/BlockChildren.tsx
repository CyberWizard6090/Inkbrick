import { useContext } from 'react';

import { DocumentRendererContext } from '../renderer/DocumentRenderer';
import { useChildren } from '../hooks/useChildren';

import type { BlockId } from '@inkbrick/document';

/**
 * Выводит дочерние блоки `id` — для пользовательских компонентов-контейнеров. Как именно (все сразу или только
 * видимые), решает рендерер документа (`<DocumentView renderer>`).
 */
export function BlockChildren({ id }: { readonly id: BlockId }) {
  const children = useChildren(id);
  const { ChildList } = useContext(DocumentRendererContext);

  return <ChildList parentId={id} ids={children} />;
}
