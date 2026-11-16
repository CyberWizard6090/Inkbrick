import { useCallback, useRef, useSyncExternalStore } from 'react';

import { useEditor } from '../hooks/useEditor';

export interface HeadingEntry {
  readonly id: string;
  readonly level: number;
  /** Вложенность в оглавлении: уровень относительно ближайшего заголовка выше. */
  readonly depth: number;
  readonly text: string;
}

const EMPTY: readonly HeadingEntry[] = [];

/** Заголовки документа по порядку (до `maxLevel`), обновляются вместе с документом. */
export function useHeadings(maxLevel: number): readonly HeadingEntry[] {
  const editor = useEditor();
  const cache = useRef<{ key: string; value: readonly HeadingEntry[] }>({ key: '', value: EMPTY });

  const read = useCallback(() => {
    const entries: HeadingEntry[] = [];
    const levels: number[] = [];
    const stack = [editor.document.rootId];

    while (stack.length > 0) {
      const block = editor.document.getBlock(stack.pop()!);

      if (!block) continue;

      if (block.flavour === 'block:heading') {
        const raw = block.props.level;
        const level = typeof raw === 'number' ? Math.min(6, Math.max(1, Math.trunc(raw))) : 1;

        if (level <= maxLevel) {
          while (levels.length > 0 && levels[levels.length - 1] >= level) levels.pop();

          entries.push({
            id: block.id,
            level,
            depth: levels.length,
            text: editor.engine.inline.toPlainText(block.content).replace(/\s+/g, ' ').trim(),
          });
          levels.push(level);
        }
      }

      for (let i = block.children.length - 1; i >= 0; i--) stack.push(block.children[i]);
    }

    return entries;
  }, [editor, maxLevel]);

  const getSnapshot = () => {
    const next = read();
    const key = JSON.stringify(next);

    if (key !== cache.current.key) cache.current = { key, value: next.length > 0 ? next : EMPTY };

    return cache.current.value;
  };

  return useSyncExternalStore(
    (listener) => editor.store.subscribe(listener),
    getSnapshot,
    getSnapshot,
  );
}
