import type { Editor } from '../editor/Editor';

import { blockTags } from './parse';

export interface TagCount {
  /** Тег без `#`; для одного тега в разном регистре берётся первое написание. */
  readonly tag: string;
  readonly count: number;
}

/** Все теги документа с числом упоминаний: по убыванию числа, затем по алфавиту. Регистр не различается (`#Idea` и `#idea` — один тег). */
export function collectTags(editor: Editor): TagCount[] {
  const found = new Map<string, { tag: string; count: number }>();
  const visit = (id: string) => {
    const block = editor.store.getBlock(id);

    if (!block) return;

    if (editor.schema.getBlockSchema(block.flavour)?.inline !== false) {
      for (const { tag } of blockTags(block)) {
        const key = tag.toLowerCase();
        const entry = found.get(key);

        if (entry) entry.count += 1;
        else found.set(key, { tag, count: 1 });
      }
    }

    block.children.forEach(visit);
  };

  visit(editor.document.rootId);

  return [...found.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
