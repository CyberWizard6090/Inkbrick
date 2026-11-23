import { useMemo, useSyncExternalStore } from 'react';

import type { Editor } from '@inkbrick/engine';

import { useEditor } from '../hooks/useEditor';

export interface HeadingEntry {
  readonly id: string;
  readonly level: number;
  /** Вложенность в оглавлении: уровень относительно ближайшего заголовка выше. */
  readonly depth: number;
  readonly text: string;
}

const EMPTY: readonly HeadingEntry[] = [];

function readHeadings(editor: Editor, maxLevel: number): HeadingEntry[] {
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
}

/**
 * Заголовки документа по порядку (до `maxLevel`), обновляются вместе с документом. Документ обходится заново, только
 * когда правка может изменить оглавление: задела заголовок (или блок, который им был) или блок с детьми (перенос,
 * вставка, удаление). Набор текста в абзаце большого документа оглавление не пересчитывает.
 */
export function useHeadings(maxLevel: number): readonly HeadingEntry[] {
  const editor = useEditor();

  const source = useMemo(() => {
    let value: readonly HeadingEntry[] = EMPTY;
    let key = '';
    let ids = new Set<string>();
    // Путь к заголовкам: сами заголовки и их предки — с родителем, у которого они были при последнем чтении.
    let onPath = new Map<string, string | null>();
    // Для каждого предка заголовка — его дети на пути, по порядку.
    let paths = new Map<string, readonly string[]>();
    let dirty = true;

    // Оглавление задето, если изменился заголовок (или блок, который им был), блок на пути к заголовку удалён или
    // переехал, или у блока на пути поменялся порядок детей на этом пути. Остальное его не меняет: новый заголовок сам
    // среди изменённых блоков, перенесённый контейнер с заголовками — на пути.
    const affects = (changed: readonly string[]) =>
      changed.some((id) => {
        if (ids.has(id)) return true;

        const block = editor.document.getBlock(id);

        if (!block) return onPath.has(id);
        if (block.flavour === 'block:heading') return true;
        if (onPath.has(id) && onPath.get(id) !== block.parentId) return true;

        const before = paths.get(id);

        if (!before) return false;

        const now = block.children.filter((child) => onPath.has(child));

        return now.length !== before.length || now.some((child, index) => child !== before[index]);
      });

    return {
      subscribe: (listener: () => void) =>
        editor.store.subscribeChanges((changed) => {
          if (!affects(changed)) return;

          dirty = true;
          listener();
        }),
      getSnapshot: () => {
        if (!dirty) return value;

        dirty = false;

        const next = readHeadings(editor, maxLevel);
        const nextKey = JSON.stringify(next);

        ids = new Set(next.map((entry) => entry.id));
        onPath = new Map();
        for (const entry of next) {
          for (let id: string | null = entry.id; id && !onPath.has(id);) {
            const parent: string | null = editor.document.getBlock(id)?.parentId ?? null;

            onPath.set(id, parent);
            id = parent;
          }
        }

        const parents = new Set([...onPath.values()].filter((id): id is string => id !== null));

        paths = new Map(
          [...parents].map((parent) => [
            parent,
            (editor.document.getBlock(parent)?.children ?? []).filter((id) => onPath.has(id)),
          ]),
        );
        if (nextKey !== key) {
          key = nextKey;
          value = next.length > 0 ? next : EMPTY;
        }

        return value;
      },
    };
  }, [editor, maxLevel]);

  return useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
}
