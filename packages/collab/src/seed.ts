import * as Y from 'yjs';

import type { BaseBlock, DocumentSnapshot } from '@inkbrick/document';

import {
  COLLAB_ORIGIN,
  FORMAT_VERSION,
  getBlocks,
  getMeta,
  isInitialized,
  type Place,
  type YBlock,
} from './format';
import { keyBetween } from './order';
import { writeBlockData } from './writer';

const KEY_DIGITS = '123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Ключ для i-го из n потомков при начальной записи: равномерные ключи фиксированной длины (без роста при дозаписи). */
function seedKey(index: number, previous: string | null): string {
  const base = KEY_DIGITS.length;

  if (index < base * base) {
    return KEY_DIGITS[Math.floor(index / base)] + KEY_DIGITS[index % base];
  }

  return keyBetween(previous, null);
}

/**
 * Начальное состояние документа. Его создаёт тот, кто создаёт документ (сервер), а не первый открывший клиент:
 * иначе двое создадут структуру дважды. Пустой `Y.Doc` без `meta` для моста — ошибка.
 */
export function initYDoc(ydoc: Y.Doc, snapshot: DocumentSnapshot): void {
  if (isInitialized(ydoc)) throw new Error('Y.Doc is already initialized');

  ydoc.transact(() => {
    const meta = getMeta(ydoc);
    const blocks = getBlocks(ydoc);

    meta.set('format', FORMAT_VERSION);
    meta.set('rootId', snapshot.rootId);
    meta.set('schemaVersions', { ...(snapshot.schemaVersions ?? {}) });

    for (const block of Object.values(snapshot.blocks) as BaseBlock[]) {
      writeBlockData(blocks, block);
    }

    for (const block of Object.values(snapshot.blocks) as BaseBlock[]) {
      let previous: string | null = null;

      block.children.forEach((childId, index) => {
        const child = blocks.get(childId) as YBlock | undefined;

        if (!child) return;

        previous = seedKey(index, previous);
        child.set('place', { p: block.id, k: previous } satisfies Place);
      });
    }

    const root = blocks.get(snapshot.rootId) as YBlock;

    root.set('place', { p: null, k: '' } satisfies Place);
  }, COLLAB_ORIGIN);
}
