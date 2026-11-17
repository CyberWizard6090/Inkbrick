import type { BaseBlock } from '@inkbrick/document';

/** Блоки, в которых `#` — не тег: код и формула. */
const NO_TAGS = new Set(['block:code', 'block:formula']);

/**
 * Тег: `#` не после буквы, цифры, `_`, `#`, `&` и `/` (так `a#b`, `&#39;`, `/#/` тегами не становятся), дальше буквы, цифры,
 * `_`, `-` и `/` (вложенные теги `#проект/задача`). Состоящий из одних цифр (`#123`) тегом не считается, как в Obsidian.
 */
const TAG = /(?<![\p{L}\p{N}_#&/])#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/gu;

export interface TagMatch {
  /** Тег без `#`, как написан. */
  readonly tag: string;
  /** Смещения в тексте блока: `from` — на `#`, `to` — после последнего знака тега. */
  readonly from: number;
  readonly to: number;
}

/** Теги в строке; `skip(i)` — `true` для знаков, внутри которых тегов нет (код, ссылка, формула). */
export function findTags(text: string, skip?: (offset: number) => boolean): TagMatch[] {
  const result: TagMatch[] = [];

  for (const match of text.matchAll(TAG)) {
    // Дефис и косая черта в конце — знаки препинания, а не часть тега.
    const tag = match[1].replace(/[-/]+$/, '');
    const from = match.index;
    const to = from + 1 + tag.length;

    if (tag === '' || /^\d+$/.test(tag) || skip?.(from)) continue;

    result.push({ tag, from, to });
  }

  return result;
}

/** Теги блока: текст в коде, ссылке и формуле не считается. */
export function blockTags(block: BaseBlock): TagMatch[] {
  if (NO_TAGS.has(block.flavour)) return [];

  let text = '';
  const skipped: boolean[] = [];

  for (const node of block.content) {
    const skip =
      !!node.attributes?.code ||
      typeof node.attributes?.link === 'string' ||
      !!node.attributes?.formula;

    for (let i = 0; i < node.insert.length; i++) skipped.push(skip);

    text += node.insert;
  }

  return findTags(text, (offset) => skipped[offset] === true);
}
