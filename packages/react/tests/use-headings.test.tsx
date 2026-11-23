import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { BaseBlock } from '@inkbrick/document';
import { Editor, columnsFeature, toggleFeature } from '@inkbrick/engine';

import { EditorProvider, useHeadings } from '../src';

/**
 * Оглавление пересчитывается не на каждую правку, а только когда правка может его изменить (`useHeadings`). Проверка:
 * после каждой из случайных правок (заголовки, абзацы, вложенность, переносы, смена типа, удаление) хук отдаёт то же,
 * что полный обход документа.
 */

function random(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;

    let t = state;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Заголовки полным обходом: id, уровень и текст по порядку. */
function expected(editor: Editor, maxLevel: number) {
  const result: string[] = [];
  const visit = (id: string) => {
    const block = editor.document.getBlock(id);

    if (!block) return;

    const level = block.props.level as number;

    if (block.flavour === 'block:heading' && level <= maxLevel)
      result.push(`${block.id}:${level}:${block.content.map((node) => node.insert).join('')}`);
    block.children.forEach(visit);
  };

  visit(editor.document.rootId);

  return result;
}

describe('useHeadings', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    it(`seed ${seed}: follows every edit that changes the outline and skips the rest`, () => {
      const rand = random(seed);
      const pick = <T,>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
      const editor = new Editor({ features: [toggleFeature, columnsFeature] });
      const wrapper = ({ children }: { children: ReactNode }) => (
        <EditorProvider editor={editor} formulaRenderer={false} highlighter={false}>
          {children}
        </EditorProvider>
      );
      const { result } = renderHook(() => useHeadings(3), { wrapper });
      const blocks = () =>
        Object.values(editor.document.dump()).filter(
          (block: BaseBlock) => block.flavour !== 'block:page' && block.flavour !== 'block:note',
        );
      const length = (block: BaseBlock) =>
        block.content.reduce((n, node) => n + node.insert.length, 0);
      const actions = [
        () => ({
          type: 'insertBlock',
          payload: {
            flavour: pick(['block:heading', 'block:paragraph', 'block:list', 'block:toggle']),
            afterId: pick(blocks()).id,
          },
        }),
        () => {
          const block = pick(blocks());

          return {
            type: 'replaceText',
            payload: { blockId: block.id, from: 0, to: 0, text: pick(['a', 'b']) },
          };
        },
        () => {
          const block = pick(blocks());

          return {
            type: 'deleteText',
            payload: { blockId: block.id, from: 0, to: Math.min(1, length(block)) },
          };
        },
        () => ({
          type: 'convertBlock',
          payload: {
            blockId: pick(blocks()).id,
            flavour: pick(['block:heading', 'block:paragraph', 'block:list']),
          },
        }),
        () => ({
          type: 'moveBlock',
          payload: {
            blockId: pick(blocks()).id,
            targetId: pick(blocks()).id,
            position: pick(['before', 'after']),
          },
        }),
        () => ({
          type: pick(['indentBlock', 'outdentBlock']),
          payload: { blockId: pick(blocks()).id },
        }),
        () => ({ type: 'delete-blocks', payload: { ids: [pick(blocks()).id] } }),
        () => {
          const headings = blocks().filter((block) => block.flavour === 'block:heading');

          return headings.length > 0
            ? {
                type: 'setBlockProps',
                payload: {
                  blockId: pick(headings).id,
                  props: { level: 1 + Math.floor(rand() * 4) },
                },
              }
            : null;
        },
        () => ({ type: pick(['undo', 'redo']), payload: {} }),
        // Колонки и заголовок в колонке: потом колонки переносятся, а заголовок сам не меняется.
        () => ({
          type: 'insertBlock',
          payload: { flavour: 'block:columns', afterId: pick(blocks()).id },
        }),
        () => {
          const columns = blocks().filter((block) => block.flavour === 'block:column');

          return columns.length > 0
            ? {
                type: 'insertBlock',
                payload: { flavour: 'block:heading', parentId: pick(columns).id },
              }
            : null;
        },
      ];

      // Перенос блоков — чаще: он меняет порядок заголовков, не трогая их самих.
      actions.push(actions[4], actions[4], actions[4]);

      for (let step = 0; step < 250; step++) {
        const intent = pick(actions)();

        if (!intent) continue;

        act(() => {
          try {
            if (intent.type === 'undo') editor.undo();
            else if (intent.type === 'redo') editor.redo();
            else editor.execute(intent.type as never, intent.payload as never);
          } catch {
            // Недопустимая правка ничего не меняет.
          }
        });

        expect(
          result.current.map((entry) => `${entry.id}:${entry.level}:${entry.text}`),
          `seed ${seed}, step ${step}: ${intent.type}`,
        ).toEqual(expected(editor, 3));
      }
    });
  }
});
