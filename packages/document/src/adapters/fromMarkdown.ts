import { Document } from '../document';
import type { BaseBlock } from '../model';
import type { SchemaRegistry } from '../schema';
import { createId } from '../utils/id';
import { parseBlocks } from './fromMarkdown/blocks';
import { create, NOTE, type Ctx } from './fromMarkdown/context';

export interface FromMarkdownOptions {
  /** Реестр схем: блоки, которых в нём нет (таблица, переключатель, сноска…), разбираются как обычный текст. */
  schema: SchemaRegistry;
  /** Заголовок страницы (`props.title`); по умолчанию пустой. */
  title?: string;
  /** Взять заголовок страницы из первой строки `# …` (так его выводит `toMarkdown`); в блоки эта строка не попадает. */
  titleFromHeading?: boolean;
  /** Идентификатор корневого блока; по умолчанию `page-001`, как у `createDocument`. */
  rootId?: string;
  /** Наибольшая длина текста в символах; длиннее — `RangeError`. По умолчанию 1 000 000. */
  maxLength?: number;
  /** Наибольшее число блоков (строки и ячейки таблицы тоже блоки); больше — `RangeError`. По умолчанию 20 000. */
  maxBlocks?: number;
}

/**
 * Разбирает Markdown в документ: обратное действие к `toMarkdown`.
 *
 * Понимает абзацы, заголовки `#`…`######`, списки (`-`, `1.`, `- [ ]`/`- [x]`, вложенность отступом), цитаты,
 * `> [!NOTE]`, ограждённый код (с языком и подписью), `---`, картинки `![alt](src)`, таблицы GFM, формулы `$$…$$`
 * и `$…$`, сноски `[^1]`, `<details>` и инлайн `**`, `*`, `~~`, `` ` ``, `[текст](адрес)`, `<u>`. Всё остальное остаётся
 * обычным текстом: HTML не разбирается и не попадает в документ, небезопасные ссылки и картинки (`isSafeUrl`,
 * `isSafeImageUrl`) остаются текстом, блоки, которых нет в реестре, разбираются как абзацы.
 *
 * Слишком большой ввод (`maxLength`, `maxBlocks`) отклоняется `RangeError`; вложенность не превышает
 * `MAX_NESTING_DEPTH`: что глубже, остаётся текстом абзаца рядом.
 */
export function fromMarkdown(markdown: string, options: FromMarkdownOptions): Document {
  const { schema, maxLength = 1_000_000, maxBlocks = 20_000 } = options;

  if (markdown.length > maxLength)
    throw new RangeError(`Markdown is longer than ${maxLength} characters`);

  const rootId = options.rootId ?? 'page-001';
  const document = new Document(rootId);
  const page: BaseBlock = {
    id: rootId,
    flavour: 'block:page',
    parentId: null,
    children: [],
    content: [],
    props: schema.createProps('block:page', { title: options.title ?? '' }),
  };
  const note: BaseBlock = {
    id: `note-${createId()}`,
    flavour: NOTE,
    parentId: rootId,
    children: [],
    content: [],
    props: schema.createProps(NOTE),
  };
  const ctx: Ctx = {
    schema,
    nodes: new Map([
      [page.id, page],
      [note.id, note],
    ]),
    maxBlocks,
    footnotes: schema.hasBlock('block:footnote'),
    formulas: schema.hasBlock('block:formula'),
    count: 0,
  };

  page.children.push(note.id);

  const lines = markdown
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    // Символ-объект U+FFFC — внутренняя метка формул и сносок: из текста он заменяется, чтобы не подделать их.
    .replace(/[\0\uFFFC]/g, '\uFFFD')
    .split('\n')
    .map((line) => line.replace(/^[ \t]+/, (space) => space.replace(/\t/g, '    ')));

  parseBlocks(ctx, lines, note.id, 2);

  const first = note.children.length > 0 ? ctx.nodes.get(note.children[0]) : undefined;

  if (options.titleFromHeading && first?.flavour === 'block:heading' && first.props.level === 1) {
    page.props = { ...page.props, title: first.content.map((node) => node.insert).join('') };
    note.children.shift();
    ctx.nodes.delete(first.id);
  }

  if (note.children.length === 0) create(ctx, note.id, 'block:paragraph', {});

  for (const block of ctx.nodes.values()) document._setBlock(block);

  return document;
}
