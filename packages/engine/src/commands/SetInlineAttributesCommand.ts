import {
  FORMULA_CHAR,
  MAX_FORMULA_LENGTH,
  isColorName,
  isSafeUrl,
  safeCssColor,
} from '@inkbrick/document';

import type { Command } from './Command';
import type { SetInlineAttributesPayload } from '../dispatcher/Intents';
import { textSegments } from '../utils';

/**
 * Задаёт inline-атрибуты (ссылка, цвет…) на диапазон, в том числе из нескольких блоков.
 * Значение `undefined` снимает атрибут. Ссылки проверяются: допустимы только http(s), mailto, tel,
 * относительные пути и якоря.
 */
export const SetInlineAttributesCommand: Command<SetInlineAttributesPayload, void> = {
  type: 'setInlineAttributes',

  canExecute({ engine, transaction }, { from, to, attributes }) {
    if (typeof attributes.link === 'string' && !isSafeUrl(attributes.link)) return false;

    // Цвета — только имена палитры или безопасные CSS-цвета (значение попадает в стиль элемента).
    for (const key of ['color', 'backgroundColor'] as const) {
      const value = attributes[key];

      if (value !== undefined && !isColorName(value) && safeCssColor(value) === null) return false;
    }

    const segments = textSegments(
      transaction.getBlock.bind(transaction),
      engine.store.document.rootId,
      engine.schema,
      from,
      to,
    );

    // Код формулы можно менять только у самих формул (символов-объектов); снять атрибут нельзя — удалите символ.
    if ('formula' in attributes) {
      const latex = attributes.formula;

      if (typeof latex !== 'string' || latex.trim() === '' || latex.length > MAX_FORMULA_LENGTH)
        return false;

      const onlyFormulas = segments.every(({ block, start, end }) =>
        engine.inline
          .toPlainText(block.content)
          .slice(start, end)
          .split('')
          .every((char) => char === FORMULA_CHAR),
      );

      if (!onlyFormulas) return false;
    }

    return segments.length > 0;
  },

  execute({ engine, transaction }, { from, to, attributes }) {
    const segments = textSegments(
      transaction.getBlock.bind(transaction),
      engine.store.document.rootId,
      engine.schema,
      from,
      to,
    );

    const normalized =
      typeof attributes.link === 'string'
        ? { ...attributes, link: attributes.link.trim() }
        : attributes;

    for (const { block, start, end } of segments) {
      engine.block.updateContent(
        transaction,
        block.id,
        engine.inline.format(block.content, start, end, normalized),
      );
    }
  },
};
