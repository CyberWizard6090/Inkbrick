import * as Y from 'yjs';

import type { BaseBlock } from '@inkbrick/document';

import type { YBlock } from './format';

/**
 * Большая вставка (десятки тысяч знаков, тысячи блоков) не должна уходить одним обновлением: сервер принимает до
 * 512 КиБ. Мост записывает её несколькими транзакциями, и каждая даёт своё обновление.
 */

/** Сколько байт обновления набирается в одной транзакции. */
export const BATCH_BYTES = 200 * 1024;

/** Размер одной вставки в тексте, в единицах UTF-16 (до трёх байт на единицу). */
export const CHUNK_UNITS = 50_000;

/** Сколько позиций (`place`) пишется в одной транзакции: запись с двумя идентификаторами и коротким ключом занимает около 70 байт, с запасом на длинные ключи старых документов — до 300. */
export const PLACES_PER_BATCH = 1000;

const BLOCK_OVERHEAD = 1000;
const BYTES_PER_UNIT = 3;

const plainLength = (block: BaseBlock): number =>
  block.content.reduce((sum, node) => sum + node.insert.length, 0);

/** Блоков и знаков столько, что можно не считать точнее: одна транзакция заведомо поместится. */
const SMALL_BLOCKS = 40;
const SMALL_UNITS = 20_000;

/** Сколько байт добавит запись блока: новый блок, вставленный текст и `props`. Правка в большом блоке стоит мало. */
export function writeWeight(blocks: Y.Map<YBlock>, block: BaseBlock): number {
  const yblock = blocks.get(block.id);
  const ytext = yblock instanceof Y.Map ? yblock.get('text') : undefined;
  const before = ytext instanceof Y.Text ? ytext.toString() : '';
  const after = block.content.map((node) => node.insert).join('');
  const limit = Math.min(before.length, after.length);
  let prefix = 0;

  while (prefix < limit && before.charCodeAt(prefix) === after.charCodeAt(prefix)) prefix++;

  let suffix = 0;

  while (
    suffix < limit - prefix &&
    before.charCodeAt(before.length - 1 - suffix) === after.charCodeAt(after.length - 1 - suffix)
  ) {
    suffix++;
  }

  const inserted = Math.max(0, after.length - prefix - suffix);

  return (
    (yblock instanceof Y.Map ? 200 : BLOCK_OVERHEAD) +
    inserted * BYTES_PER_UNIT +
    JSON.stringify(block.props).length
  );
}

/** Нужно ли писать правку пакетами. Обычная печать и правка нескольких блоков сюда не попадают и ничего не считают. */
export function needsBatches(blocks: Y.Map<YBlock>, present: readonly BaseBlock[]): boolean {
  if (
    present.length <= SMALL_BLOCKS &&
    present.every((block) => plainLength(block) <= SMALL_UNITS)
  ) {
    return false;
  }

  let total = 0;

  for (const block of present) {
    total += writeWeight(blocks, block);

    if (total > BATCH_BYTES) return true;
  }

  return false;
}
