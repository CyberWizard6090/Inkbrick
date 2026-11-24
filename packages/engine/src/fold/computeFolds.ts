import type { BlockId } from '@inkbrick/document';
import type { Editor } from '../editor/Editor';

function levelOf(level: unknown): number {
  return typeof level === 'number' && level >= 1 && level <= 6 ? Math.trunc(level) : 1;
}

/**
 * Какие блоки скрыты свёрнутыми заголовками: блок → заголовок, который его скрывает. Свёрнутый заголовок скрывает всё
 * после себя среди соседей до следующего заголовка того же или более высокого уровня (`h2` останавливает `h2` и `h1`, но не
 * `h3`). Потомки скрытых блоков отдельно не перечисляются: скрыт сам блок вместе со всем, что в нём.
 */
export function computeFolds(editor: Editor): Map<BlockId, BlockId> {
  const hidden = new Map<BlockId, BlockId>();
  const stack: BlockId[] = [editor.document.rootId];

  while (stack.length > 0) {
    const parent = editor.store.getBlock(stack.pop()!);

    if (!parent) continue;

    let active: { id: BlockId; level: number } | null = null;

    for (const id of parent.children) {
      const block = editor.store.getBlock(id);

      if (!block) continue;

      const heading = block.flavour === 'block:heading';
      const level = heading ? levelOf(block.props.level) : 0;

      if (active && heading && level <= active.level) active = null;

      if (active) {
        hidden.set(id, active.id);
        continue;
      }

      if (heading && block.props.collapsed === true) active = { id, level };

      if (block.children.length > 0) stack.push(id);
    }
  }

  return hidden;
}
