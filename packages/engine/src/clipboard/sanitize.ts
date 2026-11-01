import {
  FORMULA_CHAR,
  MAX_FORMULA_LENGTH,
  isSafeUrl,
  type InlineNode,
  type TextAttributes,
} from '@inkbrick/document';

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
  const isFormula = typeof attributes?.formula === 'string';

  if (isFormula) return /^\uFFFC+$/.test(insert) ? insert : insert.split(FORMULA_CHAR).join('');

  return insert.includes(FORMULA_CHAR) ? insert.split(FORMULA_CHAR).join('') : insert;
}

function sanitizeBlock(
  input: unknown,
  depth: number,
  budget: { blocks: number; text: number },
): FragmentBlock | null {
  if (
    !isRecord(input) ||
    depth > MAX_DEPTH ||
    typeof input.flavour !== 'string' ||
    input.flavour === ''
  ) {
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

    if (attributes?.formula !== undefined && !/^\uFFFC+$/.test(insert)) {
      const { formula: _formula, ...rest } = attributes;

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
 * отбрасывает неизвестные атрибуты и небезопасные ссылки. null — данные непригодны.
 */
export function sanitizeFragment(input: unknown): Fragment | null {
  if (!isRecord(input) || !Array.isArray(input.blocks)) return null;

  const budget = { blocks: 0, text: 0 };
  const blocks: FragmentBlock[] = [];

  for (const block of input.blocks) {
    const sanitized = sanitizeBlock(block, 0, budget);

    if (sanitized) blocks.push(sanitized);
    else if (budget.blocks > MAX_BLOCKS || budget.text > MAX_TEXT) return null;
  }

  return blocks.length > 0 ? { blocks } : null;
}
