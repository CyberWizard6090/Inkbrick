import type { BaseBlock } from '../../model';
import { MAX_FORMULA_LENGTH } from '../../utils/formula';
import { MAX_NESTING_DEPTH } from '../../utils/nesting';
import { isSafeImageUrl } from '../../utils/url';

import {
  CAPTION,
  create,
  dedent,
  DELIMITER_CELL,
  DETAILS,
  FENCE,
  FOOTNOTE_DEF,
  HEADING,
  HR,
  IMAGE,
  indentOf,
  isBlank,
  LIST_ITEM,
  TONES,
  unescapeMarkdown,
  type Ctx,
  type Lines,
} from './context';
import { inline } from './inline';
/** Разбор блоков Markdown: абзацы, заголовки, списки, цитаты, код, формулы, картинки, таблицы, `<details>`. */

/** Строки обычным абзацем: так остаётся всё, что не удалось разобрать как блок. */
export function paragraph(ctx: Ctx, parentId: string, lines: Lines): void {
  const text = lines
    .map((line) => line.trim())
    .join('\n')
    // `toMarkdown` экранирует начало абзаца, похожее на нумерованный список: `\1. текст`.
    .replace(/^\\(?=\d+[.)])/, '');

  create(ctx, parentId, 'block:paragraph', {}, inline(ctx, text));
}

/** Строка начинает блок, который прерывает абзац. */
export function interrupts(t: string): boolean {
  return (
    FENCE.test(t) ||
    HEADING.test(t) ||
    HR.test(t) ||
    t.startsWith('>') ||
    t === '$$' ||
    /^[-*+][ \t]+\S/.test(t) ||
    /^1[.)][ \t]+\S/.test(t) ||
    DETAILS.test(t) ||
    FOOTNOTE_DEF.test(t)
  );
}

export const hasPipe = (line: string) => /(?:^|[^\\])(?:\\\\)*\|/.test(line);

/** Ячейки строки таблицы по незаэкранированным `|`; экранирование внутри ячеек сохраняется. */
export function splitRow(line: string): string[] {
  const text = line.trim().replace(/^\|/, '');
  const cells: string[] = [];
  let cell = '';
  let closed = false;

  for (let i = 0; i < text.length; i++) {
    closed = false;

    if (text[i] === '\\' && i + 1 < text.length) {
      cell += text[i] + text[++i];
    } else if (text[i] === '|') {
      cells.push(cell);
      cell = '';
      closed = true;
    } else {
      cell += text[i];
    }
  }

  if (!closed) cells.push(cell);

  return cells;
}

export function isTableStart(lines: Lines, i: number): boolean {
  if (i + 1 >= lines.length || !hasPipe(lines[i]) || !hasPipe(lines[i + 1])) return false;

  const delimiter = splitRow(lines[i + 1]);

  return (
    delimiter.every((cell) => DELIMITER_CELL.test(cell.trim())) &&
    delimiter.length === splitRow(lines[i]).length
  );
}

export function parseTable(
  ctx: Ctx,
  lines: Lines,
  i: number,
  parentId: string,
  depth: number,
): number {
  let end = i + 2;

  while (end < lines.length && !isBlank(lines[end]) && hasPipe(lines[end])) end++;

  const marks = splitRow(lines[i + 1]).map((cell) => cell.trim());
  const rows = [lines[i], ...lines.slice(i + 2, end)].map((line) =>
    splitRow(line).map((cell) => cell.replace(/\\\|/g, '|').trim()),
  );
  // Лишние ячейки строки не теряются: таблица расширяется до самой широкой строки.
  const columns = Math.max(marks.length, ...rows.map((row) => row.length));

  if (ctx.count + rows.length * (columns + 1) + 1 > ctx.maxBlocks)
    throw new RangeError(`Markdown has more than ${ctx.maxBlocks} blocks`);

  if (
    depth + 2 > MAX_NESTING_DEPTH ||
    !['block:table', 'block:table-row', 'block:table-cell'].every((flavour) =>
      ctx.schema.hasBlock(flavour),
    )
  ) {
    paragraph(ctx, parentId, lines.slice(i, end));

    return end;
  }

  // У GFM нет таблицы без заголовка: `toMarkdown` пишет такую с пустой первой строкой, здесь она снова «без заголовка».
  const header = rows.length === 1 || rows[0].some((cell) => cell !== '');
  const table = create(ctx, parentId, 'block:table', { header })!;

  for (const row of header ? rows : rows.slice(1)) {
    const rowBlock = create(ctx, table.id, 'block:table-row', {})!;

    for (let column = 0; column < columns; column++) {
      const mark = marks[column] ?? '';
      const align = mark.startsWith(':')
        ? mark.endsWith(':')
          ? 'center'
          : 'left'
        : mark.endsWith(':')
          ? 'right'
          : undefined;

      create(
        ctx,
        rowBlock.id,
        'block:table-cell',
        align ? { align } : {},
        inline(ctx, row[column] ?? ''),
      );
    }
  }

  return end;
}

/** Подпись под картинкой или кодом: следующий после пустой строки абзац из одной строки `*подпись*`. */
export function takeCaption(lines: Lines, i: number): { caption: string; next: number } | null {
  let j = i;

  while (j < lines.length && isBlank(lines[j])) j++;

  if (j === i || j >= lines.length || (j + 1 < lines.length && !isBlank(lines[j + 1]))) return null;

  const match = CAPTION.exec(lines[j].trim());
  const caption = match ? unescapeMarkdown(match[1]) : '';

  return caption !== '' && caption.length <= 2000 ? { caption, next: j + 1 } : null;
}

export function parseQuote(ctx: Ctx, lines: Lines, i: number, parentId: string): number {
  let end = i;

  while (end < lines.length && /^ {0,3}>/.test(lines[end])) end++;

  const body = lines.slice(i, end).map((line) => line.replace(/^ {0,3}> ?/, '').trimEnd());
  const label = /^\[!(NOTE|TIP|WARNING|CAUTION)\]$/i.exec(body[0]);
  const content = inline(ctx, (label ? body.slice(1) : body).join('\n').replace(/^\n+|\n+$/g, ''));
  const block = label
    ? create(ctx, parentId, 'block:callout', { tone: TONES[label[1].toUpperCase()] }, content)
    : create(ctx, parentId, 'block:quote', {}, content);

  if (!block) paragraph(ctx, parentId, lines.slice(i, end));

  return end;
}

export function parseFence(
  ctx: Ctx,
  lines: Lines,
  i: number,
  parentId: string,
  match: RegExpExecArray,
): number {
  const fence = match[1];
  const indent = indentOf(lines[i]);
  let end = i + 1;

  // Без закрывающего ограждения код идёт до конца текста, как в CommonMark.
  while (end < lines.length) {
    const t = lines[end].trim();

    if (t.length >= fence.length && t === fence[0].repeat(t.length)) break;
    end++;
  }

  const code = lines
    .slice(i + 1, end)
    .map((line) => line.slice(Math.min(indent, indentOf(line))))
    .join('\n');
  const language = match[2].trim().split(/\s+/)[0] || 'plain';
  const next = Math.min(end + 1, lines.length);
  const caption = takeCaption(lines, next);
  const block = create(
    ctx,
    parentId,
    'block:code',
    caption ? { language, caption: caption.caption } : { language },
    code === '' ? [] : [{ insert: code }],
  );

  if (!block) {
    paragraph(ctx, parentId, lines.slice(i, next));

    return next;
  }

  return caption ? caption.next : next;
}

/** Блок `$$ … $$` (в одну строку или в несколько, без пустых строк внутри); `null` — это не формула. */
export function parseMath(ctx: Ctx, lines: Lines, i: number, parentId: string): number | null {
  if (!ctx.formulas) return null;

  const first = lines[i].trim().slice(2);
  let latex: string;
  let end = i + 1;

  if (first.trimEnd().endsWith('$$') && first.trim().length > 2) {
    latex = first.trim().slice(0, -2);
  } else {
    const parts = [first];
    let closed = false;

    for (; end < lines.length && !isBlank(lines[end]) && !closed; end++) {
      const t = lines[end].trim();

      closed = t.endsWith('$$');
      parts.push(closed ? t.slice(0, -2) : t);
    }

    if (!closed) return null;

    latex = parts.join('\n');
  }

  latex = latex.trim();

  return latex !== '' &&
    latex.length <= MAX_FORMULA_LENGTH &&
    create(ctx, parentId, 'block:formula', { latex })
    ? end
    : null;
}

export function parseImage(ctx: Ctx, lines: Lines, i: number, parentId: string): number | null {
  const match = IMAGE.exec(lines[i].trim());
  const src = match ? match[2].replace(/^<|>$/g, '') : '';

  if (!match || !isSafeImageUrl(src)) return null;

  const caption = takeCaption(lines, i + 1);
  const block = create(ctx, parentId, 'block:image', {
    src,
    alt: unescapeMarkdown(match[1]),
    ...(caption ? { caption: caption.caption } : {}),
  });

  return block ? (caption ? caption.next : i + 1) : null;
}

/** Пары «открывающий `<details>` → закрывающий `</details>`» на одном уровне вложенности. */
export function matchDetails(lines: Lines): Map<number, number> {
  const pairs = new Map<number, number>();
  const stack: number[] = [];

  lines.forEach((line, index) => {
    const t = line.trim();

    if (DETAILS.test(t)) stack.push(index);
    else if (/^<\/details>$/i.test(t) && stack.length > 0) pairs.set(stack.pop()!, index);
  });

  return pairs;
}

/** Вложенные строки блока; глубже `MAX_NESTING_DEPTH` они остаются обычным текстом рядом с блоком. */
export function parseChildren(ctx: Ctx, lines: Lines, owner: BaseBlock, depth: number): void {
  const filled = lines.filter((line) => !isBlank(line));

  if (filled.length === 0) return;

  if (depth + 1 > MAX_NESTING_DEPTH) {
    paragraph(ctx, owner.parentId ?? owner.id, filled);
  } else {
    parseBlocks(ctx, dedent(lines, Math.min(...filled.map(indentOf))), owner.id, depth + 1);
  }
}

export function parseList(
  ctx: Ctx,
  lines: Lines,
  start: number,
  parentId: string,
  depth: number,
): number {
  const base = LIST_ITEM.exec(lines[start])![1].length;
  let i = start;

  while (i < lines.length) {
    const match = LIST_ITEM.exec(lines[i]);

    if (!match || match[1].length < base || match[1].length >= base + 2) break;

    const bullet = /^[-*+]$/.test(match[2]);
    const todo = bullet ? /^\[([ xX])\](?:[ \t]+(.*))?$/.exec(match[3] ?? '') : null;
    const parts = [todo ? (todo[2] ?? '') : (match[3] ?? '')];
    let end = i + 1;

    // Вложенное принадлежит пункту: строки с отступом, в том числе после пустых строк.
    for (; end < lines.length; end++) {
      if (isBlank(lines[end])) {
        let next = end;

        while (next < lines.length && isBlank(lines[next])) next++;

        if (next >= lines.length || indentOf(lines[next]) < base + 2) break;

        end = next;
      } else if (indentOf(lines[end]) < base + 2) {
        break;
      }
    }

    // Текст пункта продолжают строки после жёсткого переноса (два пробела) и «ленивые» строки с малым отступом;
    // строка с отступом от трёх пробелов и всё после неё — вложенные блоки (так их пишет `toMarkdown`).
    let k = i + 1;

    while (k < end && !isBlank(lines[k])) {
      const t = lines[k].trim();

      if (
        !/ {2}$/.test(lines[k - 1]) &&
        (indentOf(lines[k]) - base >= 3 || interrupts(t) || LIST_ITEM.test(lines[k]))
      )
        break;

      parts.push(t);
      k++;
    }

    const item = create(
      ctx,
      parentId,
      'block:list',
      todo
        ? { type: 'todo', ...(todo[1] === ' ' ? {} : { checked: true }) }
        : { type: bullet ? 'bullet' : 'ordered' },
      inline(ctx, parts.map((part) => part.trim()).join('\n')),
    );

    if (item) parseChildren(ctx, lines.slice(k, end), item, depth);
    else paragraph(ctx, parentId, lines.slice(i, end));

    i = end;

    while (i < lines.length && isBlank(lines[i])) i++;
  }

  return i;
}

/** `<details>`: открывающая строка `i`, закрывающая `close`; в начале — `<summary>…</summary>`. */
export function parseDetails(
  ctx: Ctx,
  lines: Lines,
  i: number,
  close: number,
  parentId: string,
  depth: number,
): void {
  const open = DETAILS.exec(lines[i].trim())![1] !== undefined;
  let j = i + 1;

  while (j < close && isBlank(lines[j])) j++;

  const summary = /^<summary>(.*)<\/summary>$/i.exec(lines[j].trim());

  if (summary) j++;

  const toggle = create(
    ctx,
    parentId,
    'block:toggle',
    open ? {} : { open: false },
    inline(ctx, summary ? summary[1] : ''),
  );

  if (toggle) parseChildren(ctx, lines.slice(j, close), toggle, depth);
  else paragraph(ctx, parentId, lines.slice(i, close + 1));
}

export function parseBlocks(ctx: Ctx, lines: Lines, parentId: string, depth: number): void {
  let pairs: Map<number, number> | undefined;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      i++;
      continue;
    }

    const t = line.trim();
    const fence = FENCE.exec(t);
    const heading = HEADING.exec(t);
    const note = FOOTNOTE_DEF.exec(t);
    let next: number | null = null;

    if (fence && !(fence[1][0] === '`' && fence[2].includes('`'))) {
      next = parseFence(ctx, lines, i, parentId, fence);
    } else if (heading) {
      const level = heading[1].length;

      if (create(ctx, parentId, 'block:heading', { level }, inline(ctx, (heading[2] ?? '').trim())))
        next = i + 1;
    } else if (HR.test(t)) {
      if (create(ctx, parentId, 'block:divider', {})) next = i + 1;
    } else if (t.startsWith('>')) {
      next = parseQuote(ctx, lines, i, parentId);
    } else if (LIST_ITEM.test(line)) {
      next = parseList(ctx, lines, i, parentId, depth);
    } else if (note && ctx.footnotes) {
      if (create(ctx, parentId, 'block:footnote', { id: note[1] }, inline(ctx, note[2].trim())))
        next = i + 1;
    } else if (DETAILS.test(t) && ctx.schema.hasBlock('block:toggle')) {
      pairs ??= matchDetails(lines);

      const close = pairs.get(i);

      if (close !== undefined) {
        parseDetails(ctx, lines, i, close, parentId, depth);
        next = close + 1;
      }
    } else if (t.startsWith('$$')) {
      next = parseMath(ctx, lines, i, parentId);
    } else if (isTableStart(lines, i)) {
      next = parseTable(ctx, lines, i, parentId, depth);
    }

    if (next !== null) {
      i = next;
      continue;
    }

    // Абзац: до пустой строки или блока, который его прерывает (после жёсткого переноса строка всегда продолжение).
    let end = i + 1;

    while (
      end < lines.length &&
      !isBlank(lines[end]) &&
      (/ {2}$/.test(lines[end - 1]) || !(interrupts(lines[end].trim()) || isTableStart(lines, end)))
    )
      end++;

    next = end === i + 1 ? parseImage(ctx, lines, i, parentId) : null;

    if (next === null) {
      paragraph(ctx, parentId, lines.slice(i, end));
      next = end;
    }

    i = next;
  }
}
