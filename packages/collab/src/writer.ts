import * as Y from 'yjs';

import type { BaseBlock, BlockId } from '@inkbrick/document';

import { deepEqual } from './equal';
import { readPlace, type Place, type YBlock } from './format';
import { compareOrder, keysBetween } from './order';
import { applyContent, inlineEquals, readInline } from './textDiff';

/**
 * Записывает в `Y.Doc` всё, кроме порядка среди соседей: `flavour`, `props`, `text` и родителя в `place`.
 * Вызывается внутри транзакции Yjs. Блок создаётся сразу с `text` (даже пустым): иначе два клиента, создавшие
 * текст одного блока независимо, получили бы два текста.
 */
export interface WriteOptions {
  /** Не записывать `place`: блок без него остальные не видят (правило 1 проекции), он появится при `ensurePlace`. */
  deferPlace?: boolean;
  /** Не записывать текст: его запишут отдельно по частям. */
  skipText?: boolean;
}

export function writeBlockData(
  blocks: Y.Map<YBlock>,
  block: BaseBlock,
  options: WriteOptions = {},
): void {
  let yblock = blocks.get(block.id);

  if (!(yblock instanceof Y.Map)) {
    yblock = new Y.Map<unknown>();
    blocks.set(block.id, yblock);
  }

  if (yblock.get('flavour') !== block.flavour) yblock.set('flavour', block.flavour);

  let props = yblock.get('props');

  if (!(props instanceof Y.Map)) {
    props = new Y.Map<unknown>();
    yblock.set('props', props);
  }

  const yprops = props as Y.Map<unknown>;

  for (const [key, value] of Object.entries(block.props)) {
    if (value !== undefined && !deepEqual(yprops.get(key), value)) yprops.set(key, value);
  }

  for (const key of [...yprops.keys()]) {
    if ((block.props as Record<string, unknown>)[key] === undefined) yprops.delete(key);
  }

  let text = yblock.get('text');

  if (!(text instanceof Y.Text)) {
    text = new Y.Text();
    yblock.set('text', text);
  }

  const ytext = text as Y.Text;

  if (!options.skipText && !inlineEquals(readInline(ytext), block.content)) {
    applyContent(ytext, block.content);
  }

  if (!options.deferPlace) ensurePlace(blocks, block);
}

/** Родитель блока в `place`; порядок среди соседей назначает `reconcileChildren`. */
export function ensurePlace(blocks: Y.Map<YBlock>, block: BaseBlock): void {
  const yblock = blocks.get(block.id);

  if (!(yblock instanceof Y.Map)) return;

  const place = readPlace(yblock.get('place'));

  if (!place || place.p !== block.parentId) {
    yblock.set('place', { p: block.parentId, k: place?.k ?? '' } satisfies Place);
  }
}

/** Потомки `parentId` в `Y.Doc` в порядке `(k, blockId)`. */
export function yChildren(
  blocks: Y.Map<YBlock>,
  parentId: BlockId,
): Array<{ id: BlockId; k: string }> {
  const list: Array<{ id: BlockId; k: string }> = [];

  blocks.forEach((yblock, id) => {
    if (!(yblock instanceof Y.Map)) return;

    const place = readPlace(yblock.get('place'));

    if (place && place.p === parentId) list.push({ id, k: place.k });
  });

  return list.sort(compareOrder);
}

/** Индексы наибольшей строго возрастающей подпоследовательности. */
function longestIncreasing(values: ReadonlyArray<number | undefined>): Set<number> {
  const tails: number[] = [];
  const previous: number[] = new Array(values.length).fill(-1);

  values.forEach((value, index) => {
    if (value === undefined) return;

    let low = 0;
    let high = tails.length;

    while (low < high) {
      const mid = (low + high) >> 1;

      if ((values[tails[mid]] as number) < value) low = mid + 1;
      else high = mid;
    }

    previous[index] = low > 0 ? tails[low - 1] : -1;
    tails[low] = index;
  });

  const result = new Set<number>();

  for (
    let index = tails.length > 0 ? tails[tails.length - 1] : -1;
    index !== -1;
    index = previous[index]
  ) {
    result.add(index);
  }

  return result;
}

/**
 * Приводит порядок потомков `parentId` в `Y.Doc` к `desired`. Новые ключи получают только блоки, которые не входят
 * в самую длинную общую упорядоченную цепочку: при переносе одного блока меняется один ключ.
 */
export function reconcileChildren(
  blocks: Y.Map<YBlock>,
  parentId: BlockId,
  desired: readonly BlockId[],
  options: ReconcileOptions = {},
): void {
  const ids = desired.filter((id) => blocks.get(id) instanceof Y.Map);
  // Блок без ключа (только что создан) ещё не стоит на месте: порядок ему назначается ниже.
  const current = yChildren(blocks, parentId).filter((item) => item.k !== '');
  const rank = new Map(current.map((item, index) => [item.id, index]));
  const keyOf = new Map(current.map((item) => [item.id, item.k]));
  const kept = longestIncreasing(ids.map((id) => rank.get(id)));

  // Равные ключи у соседей по цепочке: между ними ключ не вставить, поэтому второй получит новый.
  let lastKept: string | undefined;

  ids.forEach((id, index) => {
    if (!kept.has(index)) return;

    const key = keyOf.get(id)!;

    if (key === lastKept) kept.delete(index);
    else lastKept = key;
  });

  const nextKept: Array<string | null> = new Array(ids.length).fill(null);
  let following: string | null = null;

  for (let i = ids.length - 1; i >= 0; i--) {
    nextKept[i] = following;

    if (kept.has(i)) following = keyOf.get(ids[i])!;
  }

  const assignments: Array<[BlockId, string]> = [];
  let index = 0;
  let previousKey: string | null = null;

  while (index < ids.length) {
    if (kept.has(index)) {
      previousKey = keyOf.get(ids[index])!;
      index++;
      continue;
    }

    // Серия блоков без ключа между двумя сохранёнными: ключи делятся поровну, а не наращиваются по одному.
    let end = index;

    while (end < ids.length && !kept.has(end)) end++;

    const keys = keysBetween(previousKey, nextKept[index], end - index);

    keys.forEach((key, offset) => assignments.push([ids[index + offset], key]));
    previousKey = keys[keys.length - 1];
    index = end;
  }

  // Ключи посчитаны целиком, поэтому запись по группам даёт тот же порядок, что и одной транзакцией.
  const perform = options.wrap ?? ((write: () => void) => write());
  const group = options.group ?? Math.max(1, assignments.length);

  for (let start = 0; start < assignments.length; start += group) {
    perform(() => {
      for (const [id, key] of assignments.slice(start, start + group)) {
        (blocks.get(id) as YBlock).set('place', { p: parentId, k: key } satisfies Place);
      }
    });
  }
}

export interface ReconcileOptions {
  /** Запись выполняется через неё, группами по `group` блоков (для большой вставки: каждая группа в своей транзакции). */
  wrap?: (write: () => void) => void;
  group?: number;
}
