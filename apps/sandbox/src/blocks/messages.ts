import type { AppMessages } from '@inkbrick/react';

/**
 * Строки приложения для редактора: названия своих блоков в slash-меню (`titleKey`, `descriptionKey`, `keywordsKey` пункта).
 * Словарь провайдера дополняет подключённый язык, поэтому встроенные строки (`en`, `ru`) копировать не нужно.
 */
export const editorMessages: Readonly<Record<string, AppMessages>> = {
  en: {
    'counter.slash.title': 'Counter',
    'counter.slash.description': 'Number with + and − buttons',
    'counter.slash.keywords': 'counter, count',
  },
  ru: {
    'counter.slash.title': 'Счётчик',
    'counter.slash.description': 'Число с кнопками + и −',
    'counter.slash.keywords': 'счётчик, счетчик, число',
  },
};
