import * as Y from 'yjs';

import type { BlockId } from '@inkbrick/document';

import { getBlocks, readPlace } from './format';
import { compareOrder } from './order';

/** Чужой текст блока, который undo/redo может удалить вместе с блоком. */
export interface Foreign {
  id: BlockId;
  /** Чужие символы блока подряд, без форматирования. */
  text: string;
  /** Блок перед ним среди потомков того же родителя на момент снимка. */
  previous: BlockId | null;
  parent: BlockId | null;
}

interface InternalItem {
  deleted: boolean;
  id: { client: number };
  content: unknown;
  right: InternalItem | null;
}

/**
 * Символы `text`, вставленные другими клиентами (не `client`). Читает внутренний список элементов Yjs: публичного
 * способа узнать автора символа нет. Любая неудача — пустая строка, то есть спасать нечего.
 */
function foreignText(text: Y.Text, client: number): string {
  try {
    let result = '';

    for (
      let item = (text as unknown as { _start: InternalItem | null })._start;
      item;
      item = item.right
    ) {
      if (!item.deleted && item.id.client !== client && item.content instanceof Y.ContentString) {
        result += item.content.str;
      }
    }

    return result;
  } catch {
    return '';
  }
}

/** Блоки, в которых есть чужой текст. Дешёвый обход: тексты читаются только у блоков, где что-то нашлось. */
export function captureForeign(ydoc: Y.Doc): Foreign[] {
  const blocks = getBlocks(ydoc);
  const found: Foreign[] = [];

  blocks.forEach((yblock, id) => {
    if (!(yblock instanceof Y.Map)) return;

    const text = yblock.get('text');
    const place = readPlace(yblock.get('place'));

    if (!(text instanceof Y.Text) || !place) return;

    const foreign = foreignText(text, ydoc.clientID);

    if (foreign === '') return;

    let previous: { k: string; id: string } | null = null;

    blocks.forEach((other, otherId) => {
      if (!(other instanceof Y.Map) || otherId === id) return;

      const otherPlace = readPlace(other.get('place'));

      if (!otherPlace || otherPlace.p !== place.p) return;

      const candidate = { k: otherPlace.k, id: otherId };

      if (
        compareOrder(candidate, { k: place.k, id }) < 0 &&
        (previous === null || compareOrder(candidate, previous) > 0)
      ) {
        previous = candidate;
      }
    });

    found.push({
      id,
      text: foreign,
      previous: (previous as { id: string } | null)?.id ?? null,
      parent: place.p,
    });
  });

  return found;
}

/** Спасённый текст: где он теперь лежит и откуда взят. */
export interface Rescued {
  sourceId: BlockId;
  text: string;
  target: Y.Text;
  from: Y.RelativePosition;
  to: Y.RelativePosition;
}

/**
 * Дописывает в конец ближайшего уцелевшего блока чужой текст тех блоков, которых после undo/redo больше нет.
 * Куда именно он стоял внутри текста, неизвестно (блок удалён целиком), поэтому он оказывается в конце блока.
 * Возвращает записи о спасённом, чтобы убрать копию, если блок вернётся (redo).
 */
export function rescueForeign(
  ydoc: Y.Doc,
  before: readonly Foreign[],
  canHoldText: (id: BlockId) => boolean,
  origin: unknown,
): Rescued[] {
  const blocks = getBlocks(ydoc);
  const alive = (id: BlockId | null): Y.Text | undefined => {
    if (id === null) return undefined;

    const yblock = blocks.get(id);
    const text = yblock instanceof Y.Map ? yblock.get('text') : undefined;

    return text instanceof Y.Text && canHoldText(id) ? text : undefined;
  };
  const lost = before.filter((entry) => !(blocks.get(entry.id) instanceof Y.Map));

  if (lost.length === 0) return [];

  const fallback = (): Y.Text | undefined => {
    for (const id of [...blocks.keys()].sort()) {
      const text = alive(id);

      if (text) return text;
    }

    return undefined;
  };
  const rescued: Rescued[] = [];

  ydoc.transact(() => {
    for (const entry of lost) {
      // Ближайший уцелевший блок: предыдущий брат, иначе родитель, иначе любой блок с текстом.
      let target = alive(entry.previous);

      target ??= alive(entry.parent) ?? fallback();

      if (!target) continue;

      const start = target.length;

      target.insert(start, entry.text);
      rescued.push({
        sourceId: entry.id,
        text: entry.text,
        target,
        from: Y.createRelativePositionFromTypeIndex(target, start),
        to: Y.createRelativePositionFromTypeIndex(target, start + entry.text.length, -1),
      });
    }
  }, origin);

  return rescued;
}

/**
 * Убирает спасённую копию, если её блок вернулся (redo восстанавливает удалённый блок вместе с текстом, и без этого
 * текст оказался бы дважды). Копия, которую успели изменить, остаётся как есть. Возвращает то, что осталось в силе.
 */
export function dropReturned(ydoc: Y.Doc, records: readonly Rescued[], origin: unknown): Rescued[] {
  const blocks = getBlocks(ydoc);
  const kept: Rescued[] = [];

  ydoc.transact(() => {
    for (const record of records) {
      const source = blocks.get(record.sourceId);
      const sourceText = source instanceof Y.Map ? source.get('text') : undefined;
      const from = Y.createAbsolutePositionFromRelativePosition(record.from, ydoc);
      const to = Y.createAbsolutePositionFromRelativePosition(record.to, ydoc);

      if (!from || !to || from.type !== record.target || to.type !== record.target) continue;

      const intact = record.target.toString().slice(from.index, to.index) === record.text;

      if (!intact) continue;

      if (sourceText instanceof Y.Text && sourceText.toString().includes(record.text)) {
        record.target.delete(from.index, to.index - from.index);
      } else {
        kept.push(record);
      }
    }
  }, origin);

  return kept;
}
