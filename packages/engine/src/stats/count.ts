import type { BlockId } from '@inkbrick/document';

import type { Editor } from '../editor/Editor';

/** Выделение текста для подсчёта: от `from` до `to` в порядке документа; `collapsed` — это каретка. */
export interface StatsRange {
  readonly from: { readonly blockId: BlockId; readonly offset: number };
  readonly to: { readonly blockId: BlockId; readonly offset: number };
  readonly collapsed: boolean;
}

/** Что считает счётчик. */
export interface StatsOptions {
  /** Считать ли текст блоков кода. По умолчанию да. */
  readonly code?: boolean;
}

export interface TextStats {
  /** Слова: буквы и цифры (внутри могут быть апостроф и дефис, у чисел — точка и запятая), у китайского, японского и тайского — по словарю `Intl.Segmenter`. */
  readonly words: number;
  /** Символы (кодовые точки) без формул. Пробелы и переводы строк входят. */
  readonly characters: number;
  /** Символы без пробелов и переводов строк. */
  readonly charactersNoSpaces: number;
}

export const EMPTY_STATS: TextStats = { words: 0, characters: 0, charactersNoSpaces: 0 };

/** Объект-заменитель формулы в тексте: формулы ни в слова, ни в символы не входят. */
const OBJECT = '￼';

type Segment = { readonly isWordLike?: boolean };
type Segmenter = { segment(text: string): Iterable<Segment> };

let wordSegmenter: Segmenter | null | undefined;

/** `Intl.Segmenter` есть в современных браузерах и Node; без него письмо без пробелов считается по знаку. */
function segmenter(): Segmenter | null {
  if (wordSegmenter === undefined) {
    const Constructor = (
      Intl as unknown as {
        Segmenter?: new (locale?: string, options?: { granularity: 'word' }) => Segmenter;
      }
    ).Segmenter;

    wordSegmenter = Constructor ? new Constructor(undefined, { granularity: 'word' }) : null;
  }

  return wordSegmenter;
}

/** Письмо без пробелов между словами: китайский, японский, тайский — слова находит словарь, а не пробелы. */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]+/gu;

/** Число (`3.14`, `1,000`) или слово из букв и цифр, внутри которого бывают апостроф и дефис (`don't`, `stop-gap`). */
const WORD = /\p{N}+(?:[.,]\p{N}+)+|[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

function unspacedWords(run: string): number {
  const words = segmenter();

  if (!words) return Array.from(run).length;

  let count = 0;

  for (const part of words.segment(run)) if (part.isWordLike) count += 1;

  return count;
}

/** Число слов в строке. */
export function countWords(text: string): number {
  const clean = text.split(OBJECT).join(' ');
  let count = 0;

  for (const run of clean.match(UNSPACED) ?? []) count += unspacedWords(run);

  return count + (clean.replace(UNSPACED, ' ').match(WORD)?.length ?? 0);
}

const SURROGATE_PAIRS = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
const SPACES = /\s/gu;
const OBJECTS = /\uFFFC/g;

/**
 * Число символов (кодовых точек), без формул. Считается выражениями по всей строке, а не по символу: большой документ
 * пересчитывается целиком при загрузке.
 */
export function countCharacters(text: string, spaces = true): number {
  const pairs = text.match(SURROGATE_PAIRS)?.length ?? 0;
  const objects = text.match(OBJECTS)?.length ?? 0;
  const blank = spaces ? 0 : (text.match(SPACES)?.length ?? 0);

  return text.length - pairs - objects - blank;
}

export function statsOf(text: string): TextStats {
  return {
    words: countWords(text),
    characters: countCharacters(text),
    charactersNoSpaces: countCharacters(text, false),
  };
}

const sum = (a: TextStats, b: TextStats): TextStats => ({
  words: a.words + b.words,
  characters: a.characters + b.characters,
  charactersNoSpaces: a.charactersNoSpaces + b.charactersNoSpaces,
});

/** Блоки с текстом по порядку чтения: id, текст и признак блока кода. */
function textOf(
  editor: Editor,
  options: StatsOptions,
): Array<{ readonly id: string; readonly text: string }> {
  const result: Array<{ id: string; text: string }> = [];
  const visit = (id: string) => {
    const block = editor.store.getBlock(id);

    if (!block) return;

    const text = block.content.map((node) => node.insert).join('');
    const inline = editor.schema.getBlockSchema(block.flavour)?.inline !== false;

    if (inline && text !== '' && !(options.code === false && block.flavour === 'block:code')) {
      result.push({ id, text });
    }

    block.children.forEach(visit);
  };

  visit(editor.document.rootId);

  return result;
}

/**
 * Слова и символы всего документа. Скрытое сворачиванием и закрытые переключатели считаются: они остаются в документе.
 * Абзацы друг с другом не склеиваются: границу блока слова не пересекают.
 */
export function documentStats(editor: Editor, options: StatsOptions = {}): TextStats {
  return textOf(editor, options).reduce(
    (total, { text }) => sum(total, statsOf(text)),
    EMPTY_STATS,
  );
}

/** Слова и символы в выделении (в одном блоке или между блоками); `null`, если выделение свёрнуто. */
export function selectionStats(
  editor: Editor,
  selection: StatsRange | null,
  options: StatsOptions = {},
): TextStats | null {
  if (!selection || selection.collapsed) return null;

  const blocks = textOf(editor, options);
  const first = blocks.findIndex(({ id }) => id === selection.from.blockId);
  const last = blocks.findIndex(({ id }) => id === selection.to.blockId);

  // Края могли прийти на блок без текста (картинка): тогда берём ближайшие текстовые блоки внутри диапазона.
  const ids = [selection.from.blockId, selection.to.blockId];
  const from = first >= 0 ? first : nearest(editor, blocks, ids[0], 1);
  const to = last >= 0 ? last : nearest(editor, blocks, ids[1], -1);

  if (from < 0 || to < 0 || from > to) return EMPTY_STATS;

  let total = EMPTY_STATS;

  for (let i = from; i <= to; i++) {
    const start = i === from && first >= 0 ? selection.from.offset : 0;
    const end = i === to && last >= 0 ? selection.to.offset : blocks[i].text.length;

    total = sum(total, statsOf(blocks[i].text.slice(start, end)));
  }

  return total;
}

/** Ближайший текстовый блок после (`1`) или до (`-1`) блока без текста по порядку документа. */
function nearest(
  editor: Editor,
  blocks: ReadonlyArray<{ readonly id: string }>,
  id: string,
  direction: 1 | -1,
): number {
  const order: string[] = [];
  const visit = (blockId: string) => {
    order.push(blockId);
    editor.store.getBlock(blockId)?.children.forEach(visit);
  };

  visit(editor.document.rootId);

  const at = order.indexOf(id);

  if (at < 0) return -1;

  const position = new Map(order.map((blockId, index) => [blockId, index]));

  if (direction === 1) return blocks.findIndex(({ id: other }) => (position.get(other) ?? -1) > at);

  for (let i = blocks.length - 1; i >= 0; i--) {
    if ((position.get(blocks[i].id) ?? Infinity) < at) return i;
  }

  return -1;
}
