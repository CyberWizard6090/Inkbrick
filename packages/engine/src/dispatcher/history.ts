import type { CaretResult } from './Intents';

/*
 * Сведения для истории, которые диспетчер берёт из данных команды: где стояла каретка до неё (undo вернёт её туда) и
 * ключ слияния шагов (набор текста подряд — один шаг undo). Данные приходят от любой команды, в том числе своей, поэтому
 * читаются осторожно: поле нужного типа или ничего.
 */

/** Поле объекта (`undefined`, если значение — не объект). */
export function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Readonly<Record<string, unknown>>)[key]
    : undefined;
}

const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
const count = (value: unknown) => (typeof value === 'number' ? value : undefined);

/** Точка `{ blockId, offset }`, если значение — она. */
export function caretOf(value: unknown): CaretResult | undefined {
  const blockId = text(field(value, 'blockId'));
  const offset = count(field(value, 'offset'));

  return blockId !== undefined && offset !== undefined ? { blockId, offset } : undefined;
}

const at = (blockId: unknown, offset: number | undefined) => caretOf({ blockId, offset });

/** Где стояла каретка до команды: туда её вернёт undo. */
export function caretBefore(type: string, payload: unknown): CaretResult | undefined {
  // Команда, которой вызывающий сам сообщил, где стояла каретка (вставка строки таблицы клавишей Tab).
  const given = caretOf(field(payload, 'caretBefore'));

  if (given) return given;

  const blockId = field(payload, 'blockId');
  const from = count(field(payload, 'from'));
  const to = count(field(payload, 'to'));

  switch (type) {
    case 'insertText':
      return caretOf(field(field(payload, 'selection'), 'anchor'));
    case 'replaceText':
      return at(blockId, from);
    case 'deleteText':
      return at(blockId, from !== undefined && to !== undefined ? Math.max(from, to) : undefined);
    case 'pasteFragment':
      return caretOf(field(payload, 'at'));
    case 'insertFormula':
      return at(blockId, from !== undefined && to !== undefined ? Math.min(from, to) : undefined);
    case 'setAlign':
    case 'deleteRange':
    case 'toggleFormatRange':
    case 'setInlineAttributes':
      return caretOf(field(payload, 'from'));
    case 'morphBlock':
      return at(blockId, count(field(payload, 'clearFromOffset')) ?? 0);
    default:
      return at(blockId, count(field(payload, 'offset')) ?? 0);
  }
}

/** Явный `mergeKey` в данных: вызывающий код сам связывает правки, и они сливаются независимо от времени между ними. */
export function hasExplicitMergeKey(payload: unknown): boolean {
  return text(field(payload, 'mergeKey')) !== undefined;
}

/**
 * Ключ слияния шагов истории: набор текста подряд (по одному символу) и стирание подряд в одном блоке превращаются в
 * один шаг undo.
 */
export function mergeKeyOf(type: string, payload: unknown): string | undefined {
  // Явный ключ: вызывающий код сам объединяет связанные правки (например, вставка картинки и её загрузка).
  const explicit = text(field(payload, 'mergeKey'));

  if (explicit !== undefined) return explicit;

  const blockId = text(field(payload, 'blockId'));
  const from = count(field(payload, 'from'));
  const to = count(field(payload, 'to'));

  if (type === 'insertText')
    return `insert:${text(field(field(field(payload, 'selection'), 'anchor'), 'blockId'))}`;

  const typed = text(field(payload, 'text'));

  if (type === 'replaceText' && from !== undefined && from === to && typed?.length === 1)
    return `insert:${blockId}`;
  if (type === 'deleteBackward' && (count(field(payload, 'offset')) ?? 0) > 0)
    return `delete:${blockId}`;
  if (type === 'deleteText' && from !== undefined && to !== undefined && Math.abs(to - from) === 1)
    return `delete:${blockId}`;

  return undefined;
}

/** Блоки, на которые указывают данные команды (`blockId`, `id`, `targetId`, `afterId`, точки выделения). */
export function targetBlockIds(payload: unknown): string[] {
  return [
    field(payload, 'blockId'),
    field(payload, 'id'),
    field(payload, 'targetId'),
    field(payload, 'afterId'),
    field(field(field(payload, 'selection'), 'anchor'), 'blockId'),
    field(field(payload, 'from'), 'blockId'),
    field(field(payload, 'to'), 'blockId'),
    field(field(payload, 'at'), 'blockId'),
    // Группа блоков (`delete-blocks`, `duplicateBlocks` и другие): проверки перед командой видят каждый.
    ...(Array.isArray(field(payload, 'ids')) ? (field(payload, 'ids') as unknown[]) : []),
  ].filter((id): id is string => typeof id === 'string');
}

export function isCaret(value: unknown): value is CaretResult {
  return caretOf(value) !== undefined;
}
