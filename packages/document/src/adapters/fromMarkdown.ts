import { Document } from '../document';
import type { BaseBlock, BlockProps, InlineNode, TextAttributes } from '../model';
import type { SchemaRegistry } from '../schema';
import { FORMULA_CHAR, MAX_FORMULA_LENGTH } from '../utils/formula';
import { createId } from '../utils/id';
import { MAX_NESTING_DEPTH } from '../utils/nesting';
import { isSafeImageUrl, normalizeLinkUrl } from '../utils/url';

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

interface Ctx {
  readonly schema: SchemaRegistry;
  readonly nodes: Map<string, BaseBlock>;
  readonly maxBlocks: number;
  readonly footnotes: boolean;
  readonly formulas: boolean;
  count: number;
}

type Lines = readonly string[];

const NOTE = 'block:note';
const TONES: Record<string, string> = {
  NOTE: 'info',
  WARNING: 'warning',
  TIP: 'success',
  CAUTION: 'danger',
};
/** Во сколько раз глубже ссылка или `<u>` может вкладываться в другую: дальше — обычным текстом. */
const MAX_INLINE_LEVEL = 6;
/** Самый длинный адрес в `(...)` ссылки или картинки; длиннее — обычный текст. */
const MAX_DESTINATION = 2000;
/** Сколько выделений может быть открыто одновременно: глубже серии остаются текстом, а разбор — линейным. */
const MAX_EMPHASIS_DEPTH = 64;

const FENCE = /^(`{3,}|~{3,})(.*)$/;
const HEADING = /^(#{1,6})(?:[ \t]+(.*))?$/;
const HR = /^([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const LIST_ITEM = /^( *)([-*+]|\d{1,9}[.)])(?:[ \t]+(.*))?$/;
const FOOTNOTE_DEF = /^\[\^([\w-]{1,64})\]:[ \t]*(.*)$/;
const DETAILS = /^<details(\s+open)?\s*>/i;
const DELIMITER_CELL = /^:?-+:?$/;
const CAPTION = /^\*((?:\\.|[^*\\])+)\*$/;
const IMAGE = /^!\[((?:\\.|[^\]\\])*)\]\(\s*(<[^>]*>|[^\s)]*)(?:\s+"[^"]*")?\s*\)$/;
const ESCAPED = /\\([!-/:-@[-`{-~])/g;
const PUNCTUATION = /[!-/:-@[-`{-~]/;

const isBlank = (line: string) => line.trim() === '';
const indentOf = (line: string) => line.length - line.trimStart().length;
const unescape = (text: string) => text.replace(ESCAPED, '$1');
const dedent = (lines: Lines, n: number) =>
  lines.map((line) => line.slice(Math.min(n, indentOf(line))));

/* ------------------------------------------------------------------- блоки ------------------------------------------------------------------- */

function create(
  ctx: Ctx,
  parentId: string,
  flavour: string,
  props: BlockProps,
  content: InlineNode[] = [],
): BaseBlock | null {
  if (!ctx.schema.hasBlock(flavour)) return null;

  let checked: BlockProps;

  try {
    checked = ctx.schema.createProps(flavour, props);
  } catch {
    // Значение не прошло схему (слишком длинное, небезопасное…): вызывающий разберёт строки обычным текстом.
    return null;
  }

  if (++ctx.count > ctx.maxBlocks)
    throw new RangeError(`Markdown has more than ${ctx.maxBlocks} blocks`);

  const block: BaseBlock = {
    id: `${flavour.replace(/^block:/, '')}-${createId()}`,
    flavour,
    parentId: null,
    children: [],
    content,
    props: checked,
  };
  let parent = ctx.nodes.get(parentId)!;

  // Блок, который родитель не принимает (например, код внутри пункта списка), встаёт у ближайшего подходящего предка.
  while (
    parent.flavour !== NOTE &&
    parent.parentId !== null &&
    !ctx.schema.validateRelation(parent.flavour, flavour)
  )
    parent = ctx.nodes.get(parent.parentId)!;

  block.parentId = parent.id;
  parent.children.push(block.id);
  ctx.nodes.set(block.id, block);

  return block;
}

/** Строки обычным абзацем: так остаётся всё, что не удалось разобрать как блок. */
function paragraph(ctx: Ctx, parentId: string, lines: Lines): void {
  const text = lines
    .map((line) => line.trim())
    .join('\n')
    // `toMarkdown` экранирует начало абзаца, похожее на нумерованный список: `\1. текст`.
    .replace(/^\\(?=\d+[.)])/, '');

  create(ctx, parentId, 'block:paragraph', {}, inline(ctx, text));
}

/** Строка начинает блок, который прерывает абзац. */
function interrupts(t: string): boolean {
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

const hasPipe = (line: string) => /(?:^|[^\\])(?:\\\\)*\|/.test(line);

/** Ячейки строки таблицы по незаэкранированным `|`; экранирование внутри ячеек сохраняется. */
function splitRow(line: string): string[] {
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

function isTableStart(lines: Lines, i: number): boolean {
  if (i + 1 >= lines.length || !hasPipe(lines[i]) || !hasPipe(lines[i + 1])) return false;

  const delimiter = splitRow(lines[i + 1]);

  return (
    delimiter.every((cell) => DELIMITER_CELL.test(cell.trim())) &&
    delimiter.length === splitRow(lines[i]).length
  );
}

function parseTable(ctx: Ctx, lines: Lines, i: number, parentId: string, depth: number): number {
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
function takeCaption(lines: Lines, i: number): { caption: string; next: number } | null {
  let j = i;

  while (j < lines.length && isBlank(lines[j])) j++;

  if (j === i || j >= lines.length || (j + 1 < lines.length && !isBlank(lines[j + 1]))) return null;

  const match = CAPTION.exec(lines[j].trim());
  const caption = match ? unescape(match[1]) : '';

  return caption !== '' && caption.length <= 2000 ? { caption, next: j + 1 } : null;
}

function parseQuote(ctx: Ctx, lines: Lines, i: number, parentId: string): number {
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

function parseFence(
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
function parseMath(ctx: Ctx, lines: Lines, i: number, parentId: string): number | null {
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

function parseImage(ctx: Ctx, lines: Lines, i: number, parentId: string): number | null {
  const match = IMAGE.exec(lines[i].trim());
  const src = match ? match[2].replace(/^<|>$/g, '') : '';

  if (!match || !isSafeImageUrl(src)) return null;

  const caption = takeCaption(lines, i + 1);
  const block = create(ctx, parentId, 'block:image', {
    src,
    alt: unescape(match[1]),
    ...(caption ? { caption: caption.caption } : {}),
  });

  return block ? (caption ? caption.next : i + 1) : null;
}

/** Пары «открывающий `<details>` → закрывающий `</details>`» на одном уровне вложенности. */
function matchDetails(lines: Lines): Map<number, number> {
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
function parseChildren(ctx: Ctx, lines: Lines, owner: BaseBlock, depth: number): void {
  const filled = lines.filter((line) => !isBlank(line));

  if (filled.length === 0) return;

  if (depth + 1 > MAX_NESTING_DEPTH) {
    paragraph(ctx, owner.parentId ?? owner.id, filled);
  } else {
    parseBlocks(ctx, dedent(lines, Math.min(...filled.map(indentOf))), owner.id, depth + 1);
  }
}

function parseList(ctx: Ctx, lines: Lines, start: number, parentId: string, depth: number): number {
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
function parseDetails(
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

function parseBlocks(ctx: Ctx, lines: Lines, parentId: string, depth: number): void {
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

/* ------------------------------------------------------------------ инлайн ------------------------------------------------------------------ */

const BOLD = 1;
const ITALIC = 2;
const STRIKE = 4;

/** Текст, готовые узлы (код, ссылка, формула…) или серия `*`/`_`/`~~`, которая ещё может стать выделением. */
type Token =
  | { k: 't'; s: string; m: number }
  | { k: 'n'; nodes: InlineNode[]; m: number }
  | { k: 'd'; ch: string; n: number; open: boolean; close: boolean; m: number };

const isSpace = (char: string | undefined) => char === undefined || /\s/.test(char);
const isPunct = (char: string | undefined) => char !== undefined && /[\p{P}\p{S}]/u.test(char);

/** Положение серии `*`, `_`, `~~` между символами `prev` и `next` (правила CommonMark о «флангах»). */
function flanking(ch: string, prev: string | undefined, next: string | undefined) {
  const left = !isSpace(next) && (!isPunct(next) || isSpace(prev) || isPunct(prev));
  const right = !isSpace(prev) && (!isPunct(prev) || isSpace(next) || isPunct(next));

  return ch === '_'
    ? { open: left && (!right || isPunct(prev)), close: right && (!left || isPunct(next)) }
    : { open: left, close: right };
}

/** Адрес ссылки в `(...)` начиная с `from`: сам адрес и позиция после `)`; `null` — это не ссылка. */
function destination(s: string, from: number): { url: string; end: number } | null {
  let p = from;

  while (s[p] === ' ') p++;

  let url: string;

  if (s[p] === '<') {
    const close = s.indexOf('>', p);

    if (close < 0 || close - p > MAX_DESTINATION) return null;

    url = s.slice(p + 1, close);
    p = close + 1;
  } else {
    const start = p;

    while (p < s.length && p - start <= MAX_DESTINATION && !/[\s)]/.test(s[p])) p++;

    url = s.slice(start, p);
  }

  while (s[p] === ' ') p++;

  if (s[p] === '"' || s[p] === "'") {
    const close = s.indexOf(s[p], p + 1);

    if (close < 0 || close - p > MAX_DESTINATION) return null;

    p = close + 1;

    while (s[p] === ' ') p++;
  }

  return s[p] === ')' ? { url: unescape(url), end: p + 1 } : null;
}

function tokenize(ctx: Ctx, s: string, level: number): Token[] {
  const out: Token[] = [];
  let buffer = '';
  let brackets: Map<number, number> | undefined;

  const flush = () => {
    if (buffer !== '') out.push({ k: 't', s: buffer, m: 0 });
    buffer = '';
  };
  const push = (nodes: InlineNode[]) => {
    flush();
    out.push({ k: 'n', nodes, m: 0 });
  };
  // Позиции закрывающих разделителей считаются один раз; запрашиваются они по возрастанию, поэтому разбор линеен.
  const cursor = (pattern: RegExp) => {
    let list: number[] | undefined;
    let p = 0;

    return (from: number) => {
      list ??= Array.from(s.matchAll(pattern), (match) => match.index);

      while (p < list.length && list[p] < from) p++;

      return list[p] ?? -1;
    };
  };
  const nextUnderlineEnd = cursor(/<\/u>/gi);
  const nextParenEnd = cursor(/\\\)/g);
  const closingBracket = (open: number) => {
    if (!brackets) {
      brackets = new Map();

      const stack: number[] = [];

      for (let p = 0; p < s.length; p++) {
        if (s[p] === '\\') p++;
        else if (s[p] === '[') stack.push(p);
        else if (s[p] === ']' && stack.length > 0) brackets.set(stack.pop()!, p);
      }
    }

    return brackets.get(open) ?? -1;
  };
  const formula = (latex: string): InlineNode[] =>
    latex !== '' && latex.length <= MAX_FORMULA_LENGTH
      ? [{ insert: FORMULA_CHAR, attributes: { formula: latex } }]
      : [];

  for (let i = 0; i < s.length;) {
    const c = s[i];

    if (c === '\\') {
      const x = s[i + 1];
      const end = x === '(' && ctx.formulas ? nextParenEnd(i + 2) : -1;
      const math = end < 0 ? [] : formula(s.slice(i + 2, end).trim());

      if (math.length > 0) {
        push(math);
        i = end + 2;
      } else if (x === '\n') {
        buffer += '\n';
        i += 2;
      } else if (x !== undefined && PUNCTUATION.test(x)) {
        buffer += x;
        i += 2;
      } else {
        buffer += c;
        i++;
      }
    } else if (c === '`') {
      let n = 1;

      while (s[i + n] === '`') n++;

      // Закрывает код серия ровно такой же длины.
      let close = -1;

      for (let from = i + n; close < 0;) {
        const found = s.indexOf('`', from);

        if (found < 0) break;

        let end = found;

        while (s[end] === '`') end++;

        if (end - found === n) close = found;
        else from = end;
      }

      if (close < 0) {
        buffer += s.slice(i, i + n);
        i += n;
      } else {
        let code = s.slice(i + n, close);

        // Один пробел с каждой стороны — отступ от ограничителя (`` `a` `` → «`a`»), если код не из одних пробелов.
        if (/^ .* $/s.test(code) && code.trim() !== '') code = code.slice(1, -1);

        push([{ insert: code, attributes: { code: true } }]);
        i = close + n;
      }
    } else if (c === '[') {
      const close = closingBracket(i);
      const reference = ctx.footnotes ? /^\[\^([\w-]{1,64})\]/.exec(s.slice(i, i + 70)) : null;
      const target = close > 0 && s[close + 1] === '(' ? destination(s, close + 2) : null;
      const url = target && level < MAX_INLINE_LEVEL ? normalizeLinkUrl(target.url) : null;
      const nodes = url ? inlineNodes(ctx, s.slice(i + 1, close), level + 1) : [];

      if (reference) {
        push([{ insert: FORMULA_CHAR, attributes: { footnote: reference[1] } }]);
        i += reference[0].length;
      } else if (target && url && nodes.length > 0) {
        push(
          nodes.map((node) => ({
            insert: node.insert,
            attributes: { ...node.attributes, link: node.attributes?.link ?? url },
          })),
        );
        i = target.end;
      } else {
        buffer += c;
        i++;
      }
    } else if (c === '$' && ctx.formulas) {
      const close = s.indexOf('$', i + 1);
      const math =
        close > i + 1 &&
        !isSpace(s[i + 1]) &&
        !isSpace(s[close - 1]) &&
        !/\d/.test(s[close + 1] ?? '')
          ? formula(s.slice(i + 1, close))
          : [];

      if (math.length > 0) {
        push(math);
        i = close + 1;
      } else {
        buffer += c;
        i++;
      }
    } else if (c === '<') {
      const end =
        /^<u>/i.test(s.slice(i, i + 3)) && level < MAX_INLINE_LEVEL ? nextUnderlineEnd(i + 3) : -1;
      const br = /^<br\s{0,3}\/?>/i.exec(s.slice(i, i + 9));

      if (end >= 0) {
        push(
          inlineNodes(ctx, s.slice(i + 3, end), level + 1).map((node) => ({
            insert: node.insert,
            attributes: { ...node.attributes, underline: true },
          })),
        );
        i = end + 4;
      } else if (br) {
        buffer += '\n';
        i += br[0].length;
      } else {
        buffer += c;
        i++;
      }
    } else if (c === '*' || c === '_' || c === '~') {
      let j = i;

      while (s[j] === c) j++;

      if (c === '~' && j - i !== 2) {
        buffer += s.slice(i, j);
      } else {
        flush();
        out.push({ k: 'd', ch: c, n: j - i, ...flanking(c, s[i - 1], s[j]), m: 0 });
      }

      i = j;
    } else {
      buffer += c;
      i++;
    }
  }

  flush();

  return out;
}

/** Выделение по CommonMark: пары серий `*`/`_`/`~~` помечают токены между собой (жирный, курсив, зачёркнутый). */
function emphasize(tokens: Token[]): void {
  const openers: number[] = [];
  let budget = 64 * tokens.length + 10_000;

  tokens.forEach((token, index) => {
    if (token.k !== 'd') return;

    while (token.close && token.n > 0) {
      let found = -1;

      // Просматриваются только ближайшие серии: в обычном тексте их единицы, а входу из тысяч `*` это не даст замедлиться.
      for (let o = openers.length - 1; o >= 0 && openers.length - o <= MAX_EMPHASIS_DEPTH; o--) {
        const opener = tokens[openers[o]] as Extract<Token, { k: 'd' }>;

        if (opener.ch !== token.ch || opener.n === 0) continue;

        // Правило «кратности трёх»: серия, которая может и открывать, и закрывать, не парна неподходящей по длине.
        if (
          token.ch !== '~' &&
          (token.open || opener.close) &&
          (opener.n + token.n) % 3 === 0 &&
          !(opener.n % 3 === 0 && token.n % 3 === 0)
        )
          continue;

        found = o;
        break;
      }

      // Бюджет на разметку токенов: длинная серия `*`, закрываемая много раз, иначе давала бы квадратичное время.
      if (found < 0) break;

      budget -= index - openers[found];

      if (budget < 0) break;

      const opener = tokens[openers[found]] as Extract<Token, { k: 'd' }>;
      const use = token.ch === '~' ? 2 : token.n >= 2 && opener.n >= 2 ? 2 : 1;
      const mark = token.ch === '~' ? STRIKE : use === 2 ? BOLD : ITALIC;

      for (let t = openers[found] + 1; t < index; t++) tokens[t].m |= mark;

      opener.n -= use;
      token.n -= use;
      openers.length = opener.n > 0 ? found + 1 : found;
    }

    if (token.n > 0 && token.open && openers.length < MAX_EMPHASIS_DEPTH) openers.push(index);
  });
}

const sameAttributes = (a?: TextAttributes, b?: TextAttributes) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Склеивает токены в узлы; соседние узлы с одинаковым форматированием сливаются (формулы и сноски — нет). */
function flatten(tokens: Token[]): InlineNode[] {
  const out: InlineNode[] = [];

  for (const token of tokens) {
    const parts: InlineNode[] =
      token.k === 'n'
        ? token.nodes
        : [{ insert: token.k === 't' ? token.s : token.ch.repeat(token.n) }];

    for (const part of parts) {
      if (part.insert === '') continue;

      const { bold, italic, strike, underline, code, link, formula, footnote } =
        part.attributes ?? {};
      const attributes: TextAttributes = {};

      // Код не оформляется (`CODE_EXCLUDED_ATTRIBUTES`): `**`x`**` — просто код.
      if (code) attributes.code = true;
      else {
        if (token.m & BOLD || bold) attributes.bold = true;
        if (token.m & ITALIC || italic) attributes.italic = true;
        if (token.m & STRIKE || strike) attributes.strike = true;
        if (underline) attributes.underline = true;
      }
      if (link !== undefined) attributes.link = link;
      if (formula !== undefined) attributes.formula = formula;
      if (footnote !== undefined) attributes.footnote = footnote;

      const merged = Object.keys(attributes).length > 0 ? attributes : undefined;
      const previous = out[out.length - 1];

      if (
        previous &&
        formula === undefined &&
        footnote === undefined &&
        sameAttributes(previous.attributes, merged)
      )
        previous.insert += part.insert;
      else out.push(merged ? { insert: part.insert, attributes: merged } : { insert: part.insert });
    }
  }

  return out;
}

function inlineNodes(ctx: Ctx, text: string, level: number): InlineNode[] {
  const tokens = tokenize(ctx, text, level);

  emphasize(tokens);

  return flatten(tokens);
}

const inline = (ctx: Ctx, text: string) => inlineNodes(ctx, text, 0);

/* ------------------------------------------------------------------ вход ------------------------------------------------------------------ */

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
