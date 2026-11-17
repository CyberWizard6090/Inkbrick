import { normalizeLinkUrl, type TableColumnType, type TableOption } from '@inkbrick/document';

/**
 * Значения столбцов хранятся текстом в ячейке: так их видят копирование, экспорт, поиск и сортировка. Здесь — как этот
 * текст читается и записывается.
 */

export const isChecked = (text: string): boolean => text.trim().toLowerCase() === 'true';

/** Выбранные значения `multiselect`: названия через запятую (в названии варианта запятой нет). */
export const parseSelected = (text: string): string[] =>
  text
    .split(',')
    .map((part) => part.trim())
    .filter((part, index, all) => part !== '' && all.indexOf(part) === index);

export const serializeSelected = (values: readonly string[]): string => values.join(', ');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s().-]{5,}$/;

/** Адрес для ссылки: `https://…`, `mailto:…` или `tel:…`; `undefined`, если значение пусто или не подходит типу. */
export function columnHref(type: TableColumnType, text: string): string | undefined {
  const value = text.trim();

  if (value === '') return undefined;
  if (type === 'url') return normalizeLinkUrl(value) ?? undefined;
  if (type === 'email') return EMAIL.test(value) ? `mailto:${value}` : undefined;

  if (type === 'phone') {
    const digits = value.replace(/\D/g, '');

    return PHONE.test(value) && digits.length >= 5 && digits.length <= 15
      ? `tel:${value.startsWith('+') ? '+' : ''}${digits}`
      : undefined;
  }

  return undefined;
}

export const isLinkType = (type: TableColumnType): type is 'url' | 'email' | 'phone' =>
  type === 'url' || type === 'email' || type === 'phone';

export const isSelectType = (type: TableColumnType): type is 'select' | 'multiselect' =>
  type === 'select' || type === 'multiselect';

/** Вариант по названию; значение, которого нет в списке (вставили текстом), остаётся серым без цвета. */
export const optionOf = (
  options: readonly TableOption[] | null | undefined,
  label: string,
): TableOption => options?.find((option) => option.label === label) ?? { label };
