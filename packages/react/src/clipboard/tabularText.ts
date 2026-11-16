import { parseDelimited } from '@inkbrick/document';

/**
 * Обычный текст с табуляциями (Excel, Google Sheets, терминал, CSV с табуляцией) → строки ячеек, если это
 * похоже на таблицу: не меньше двух строк и двух столбцов, в каждой строке поровну ячеек. Иначе `null` —
 * текст остаётся текстом: отступы кода и списки с табуляцией таблицей не становятся.
 */
export function tabularText(text: string): string[][] | null {
  if (!text.includes('\t')) return null;

  const rows = parseDelimited(text, '\t');

  if (!rows || rows.length < 2) return null;

  const columns = rows[0].length;

  return columns >= 2 && rows.every((row) => row.length === columns) ? rows : null;
}
