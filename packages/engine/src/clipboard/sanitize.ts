import {
  FOOTNOTE_ID,
  FORMULA_CHAR,
  MAX_FORMULA_LENGTH,
  isSafeUrl,
  type InlineNode,
  type TextAttributes,
} from '@inkbrick/document';

import { MAX_TABLE_CELLS, MAX_TABLE_COLUMNS, repairTables } from '../table/tableFragment';
import type { Fragment, FragmentBlock } from './types';

const MAX_DEPTH = 12;
const MAX_BLOCKS = 5000;
const MAX_TEXT = 2_000_000;

const FLAGS = ['bold', 'italic', 'underline', 'strike', 'code'] as const;
const COLOR = /^(#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\(\s*[\d.\s,%]+\))$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Оставляет только известные атрибуты допустимого вида: из буфера обмена приходит недоверенный ввод. */
function sanitizeAttributes(input: unknown): TextAttributes | undefined {
  if (!isRecord(input)) return undefined;

  const result: TextAttributes = {};

  for (const key of FLAGS) {
    if (input[key] === true) result[key] = true;
  }

  if (typeof input.link === 'string' && isSafeUrl(input.link)) result.link = input.link.trim();

  for (const key of ['color', 'backgroundColor'] as const) {
    const value = input[key];

    if (typeof value === 'string' && COLOR.test(value.trim())) result[key] = value.trim();
  }

  // Ссылка на сноску: только допустимый код (он попадает в разметку и в Markdown).
  if (typeof input.footnote === 'string' && FOOTNOTE_ID.test(input.footnote))
    result.footnote = input.footnote;

  if (
    typeof input.formula === 'string' &&
    input.formula.trim() !== '' &&
    input.formula.length <= MAX_FORMULA_LENGTH
  ) {
    result.formula = input.formula;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/** Формула — это только символы-объекты; «осиротевшие» символы-объекты без формулы из текста убираются. */
function sanitizeInsert(insert: string, attributes: TextAttributes | undefined): string {
  const isFormula =
    typeof attributes?.formula === 'string' || typeof attributes?.footnote === 'string';

  if (isFormula) return /^\uFFFC+$/.test(insert) ? insert : insert.split(FORMULA_CHAR).join('');

  return insert.includes(FORMULA_CHAR) ? insert.split(FORMULA_CHAR).join('') : insert;
}

interface Budget {
  blocks: number;
  text: number;
  /** Таблица больше допустимого: фрагмент отклоняется целиком (иначе бюджет блоков молча обрезал бы её). */
  rejected?: boolean;
}

/** Размер таблицы по сырым данным: строки × самая длинная строка (после выравнивания строк ячеек столько и будет). */
function isOversizedTable(input: Record<string, unknown>): boolean {
  const rows = Array.isArray(input.children) ? input.children : [];
  const columns = Math.max(
    0,
    ...rows.map((row) => (isRecord(row) && Array.isArray(row.children) ? row.children.length : 0)),
  );

  return columns > MAX_TABLE_COLUMNS || rows.length * columns > MAX_TABLE_CELLS;
}

function sanitizeBlock(input: unknown, depth: number, budget: Budget): FragmentBlock | null {
  if (
    !isRecord(input) ||
    depth > MAX_DEPTH ||
    typeof input.flavour !== 'string' ||
    input.flavour === ''
  ) {
    return null;
  }

  if (input.flavour === 'block:table' && isOversizedTable(input)) {
    budget.rejected = true;

    return null;
  }

  if (++budget.blocks > MAX_BLOCKS) return null;

  const content: InlineNode[] = [];

  for (const node of Array.isArray(input.content) ? input.content : []) {
    if (!isRecord(node) || typeof node.insert !== 'string') continue;

    budget.text += node.insert.length;

    if (budget.text > MAX_TEXT) return null;

    let attributes = sanitizeAttributes(node.attributes);
    const insert = sanitizeInsert(node.insert, attributes);

    if (
      (attributes?.formula !== undefined || attributes?.footnote !== undefined) &&
      !/^\uFFFC+$/.test(insert)
    ) {
      const { formula: _formula, footnote: _footnote, ...rest } = attributes;

      attributes = Object.keys(rest).length > 0 ? rest : undefined;
    }

    if (insert.length > 0) content.push({ insert, ...(attributes ? { attributes } : {}) });
  }

  const children: FragmentBlock[] = [];

  for (const child of Array.isArray(input.children) ? input.children : []) {
    const sanitized = sanitizeBlock(child, depth + 1, budget);

    if (sanitized) children.push(sanitized);
  }

  return {
    flavour: input.flavour,
    // Props проверяются схемой блока при вставке; здесь — только JSON-объект без прототипных сюрпризов.
    props: isRecord(input.props) ? JSON.parse(JSON.stringify(input.props)) : {},
    content,
    children,
    ...(depth === 0 && input.complete === true ? { complete: true } : {}),
  };
}

/**
 * Проверяет фрагмент из буфера обмена (JSON из чужого источника): ограничивает размер и глубину,
 * отбрасывает неизвестные атрибуты и небезопасные ссылки. null — данные непригодны (в том числе таблица больше
 * `MAX_TABLE_CELLS` ячеек или `MAX_TABLE_COLUMNS` столбцов: такую вставляют текстом).
 */
export function sanitizeFragment(input: unknown): Fragment | null {
  if (!isRecord(input) || !Array.isArray(input.blocks)) return null;

  const budget: Budget = { blocks: 0, text: 0 };
  const blocks: FragmentBlock[] = [];

  for (const block of input.blocks) {
    const sanitized = sanitizeBlock(block, 0, budget);

    if (sanitized) blocks.push(sanitized);
    else if (budget.blocks > MAX_BLOCKS || budget.text > MAX_TEXT) return null;
  }

  // Бюджет блоков исчерпан внутри вложенного блока (ячейки таблицы): отбрасываем фрагмент, а не режем молча.
  if (budget.rejected || budget.blocks > MAX_BLOCKS) return null;

  const repaired = repairTables(blocks);

  return repaired.length > 0 ? { blocks: repaired } : null;
}
