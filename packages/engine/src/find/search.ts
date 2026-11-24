import type { Editor } from '../editor/Editor';

export interface FindOptions {
  /** Учитывать регистр. По умолчанию нет. */
  readonly caseSensitive?: boolean;
  /** Только целые слова: совпадение не граничит с буквой, цифрой или подчёркиванием. */
  readonly wholeWord?: boolean;
}

/** Совпадение: блок и диапазон смещений в его тексте (как в команде `replaceText`). */
export interface FindMatch {
  readonly blockId: string;
  readonly from: number;
  readonly to: number;
}

/** Больше совпадений не ищем: список и подсветка остаются быстрыми на огромном документе. */
export const MAX_MATCHES = 5000;

const OBJECT = '￼';
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Выражение для поиска `query`; смещения не сдвигаются при смене регистра, поэтому регистр — флаг, а не `toLowerCase`. */
export function searchPattern(query: string, options: FindOptions = {}): RegExp | null {
  if (query === '') return null;

  const word = options.wholeWord ? ['(?<![\\p{L}\\p{N}_])', '(?![\\p{L}\\p{N}_])'] : ['', ''];

  return new RegExp(`${word[0]}${escape(query)}${word[1]}`, options.caseSensitive ? 'gu' : 'giu');
}

/** Блоки документа с текстом по порядку чтения. */
export function textBlocks(editor: Editor): Array<{ id: string; text: string }> {
  const result: Array<{ id: string; text: string }> = [];
  const visit = (id: string) => {
    const block = editor.store.getBlock(id);

    if (!block) return;

    if (editor.schema.getBlockSchema(block.flavour)?.inline !== false && block.content.length > 0) {
      result.push({ id, text: block.content.map((node) => node.insert).join('') });
    }

    block.children.forEach(visit);
  };

  visit(editor.document.rootId);

  return result;
}

/** Все совпадения `query` в документе по порядку (формулы и другие объекты в тексте не совпадают). */
export function findMatches(editor: Editor, query: string, options: FindOptions = {}): FindMatch[] {
  const pattern = searchPattern(query, options);
  const matches: FindMatch[] = [];

  if (!pattern) return matches;

  for (const { id, text } of textBlocks(editor)) {
    pattern.lastIndex = 0;

    for (let found = pattern.exec(text); found; found = pattern.exec(text)) {
      if (found[0] === '') {
        pattern.lastIndex += 1;
        continue;
      }

      if (!found[0].includes(OBJECT)) {
        matches.push({ blockId: id, from: found.index, to: found.index + found[0].length });
      }

      if (matches.length >= MAX_MATCHES) return matches;
    }
  }

  return matches;
}

/**
 * Заменяет совпадения на `replacement` одним шагом undo. Идёт с конца, поэтому смещения остальных совпадений
 * в том же блоке остаются верными. Возвращает число замен.
 */
export function replaceMatches(
  editor: Editor,
  matches: readonly FindMatch[],
  replacement: string,
): number {
  if (matches.length === 0) return 0;

  editor.batch(() => {
    for (const { blockId, from, to } of [...matches].reverse()) {
      editor.dispatch({
        type: 'replaceText',
        payload: { blockId, from, to, text: replacement },
      });
    }
  });

  return matches.length;
}
