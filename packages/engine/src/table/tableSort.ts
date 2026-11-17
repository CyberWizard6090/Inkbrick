import type { TableColumnType } from '@inkbrick/document';

/** Значение ячейки для сортировки: число, момент времени или строка; `undefined` — пусто или не разобрано (идёт в конец). */
export type SortKey = number | string | undefined;

const NUMBER = /[-+−]?\d[\d\s  .,]*/;

/** Первое число в тексте: «1 234,5 ₽», «$1,234.50», «−3%» → 1234.5, 1234.5, −3. */
export function parseNumber(text: string): number | undefined {
  const found = NUMBER.exec(text)?.[0];

  if (!found) return undefined;

  const negative = /^[-−]/.test(found);
  let digits = found.replace(/^[-+−]/, '').replace(/[\s  ]/g, '');

  digits = digits.replace(/[.,]+$/, '');

  const lastDot = digits.lastIndexOf('.');
  const lastComma = digits.lastIndexOf(',');
  const decimalAt = Math.max(lastDot, lastComma);

  if (decimalAt >= 0) {
    const separator = digits[decimalAt];
    const fraction = digits.slice(decimalAt + 1);
    const mixed = lastDot >= 0 && lastComma >= 0;
    const repeated = digits.split(separator).length > 2;
    const thousands = !mixed && (repeated || (separator === ',' && fraction.length === 3));

    digits = thousands
      ? digits.replace(/[.,]/g, '')
      : `${digits.slice(0, decimalAt).replace(/[.,]/g, '')}.${fraction}`;
  }

  const value = Number(digits);

  return Number.isFinite(value) ? (negative ? -value : value) : undefined;
}

/** Дата в тексте: `2024-03-05`, `05.03.2024`, `5/3/2024` (день первым), иначе то, что разбирает `Date.parse`. */
export function parseDate(text: string): number | undefined {
  const value = text.trim();
  const day = /^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})(?:\D.*)?$/.exec(value);

  if (day) {
    const year = day[3].length === 2 ? 2000 + Number(day[3]) : Number(day[3]);
    const time = Date.UTC(year, Number(day[2]) - 1, Number(day[1]));

    return Number.isFinite(time) ? time : undefined;
  }

  const time = Date.parse(value);

  return Number.isFinite(time) ? time : undefined;
}

/** Ключ сортировки по типу столбца. */
export function sortKey(text: string, type: TableColumnType): SortKey {
  const value = text.trim();

  // Флажок: пусто — не отмечено, а не «нет значения»; отмеченные после неотмеченных.
  if (type === 'checkbox') return value.toLowerCase() === 'true' ? 1 : 0;
  if (value === '') return undefined;
  if (type === 'number') return parseNumber(value);
  if (type === 'date') return parseDate(value);

  return value;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Порядок строк для сортировки по столбцу: индексы строк `keys` по возрастанию или убыванию. Сортировка устойчивая;
 * пустые и неразобранные значения идут в конец при любом направлении.
 */
export function sortedOrder(keys: readonly SortKey[], direction: 'asc' | 'desc'): number[] {
  const sign = direction === 'asc' ? 1 : -1;

  return keys
    .map((key, index) => ({ key, index }))
    .sort((a, b) => {
      if (a.key === undefined || b.key === undefined) {
        return a.key === b.key ? a.index - b.index : a.key === undefined ? 1 : -1;
      }

      const order =
        typeof a.key === 'number' && typeof b.key === 'number'
          ? a.key - b.key
          : collator.compare(String(a.key), String(b.key));

      return order === 0 ? a.index - b.index : order * sign;
    })
    .map(({ index }) => index);
}
