import * as Y from 'yjs';

import type { BaseBlock, BlockId } from '@inkbrick/document';

import { deepEqual } from './equal';
import { readPlace, type Place, type YBlock } from './format';
import { compareOrder, keyBetween } from './order';
import { applyContent, inlineEquals, readInline } from './textDiff';

/**
 * Записывает в `Y.Doc` всё, кроме порядка среди соседей: `flavour`, `props`, `text` и родителя в `place`.
 * Вызывается внутри транзакции Yjs. Блок создаётся сразу с `text` (даже пустым): иначе два клиента, создавшие
 * текст одного блока независимо, получили бы два текста.
 */
export function writeBlockData(blocks: Y.Map<YBlock>, block: BaseBlock): void {
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

  if (!inlineEquals(readInline(ytext), block.content)) applyContent(ytext, block.content);

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

  let previousKey: string | null = null;

  ids.forEach((id, index) => {
    if (kept.has(index)) {
      previousKey = keyOf.get(id)!;
      return;
    }

    const key = keyBetween(previousKey, nextKept[index]);

    (blocks.get(id) as YBlock).set('place', { p: parentId, k: key } satisfies Place);
    previousKey = key;
  });
}
