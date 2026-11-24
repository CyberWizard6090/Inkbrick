import { parseDelimited } from '@inkbrick/document';

import { MAX_TABLE_CELLS, MAX_TABLE_COLUMNS } from '../table/tableFragment';

/**
 * Обычный текст с табуляциями (Excel, Google Sheets, терминал, CSV с табуляцией) → строки ячеек, если это
 * похоже на таблицу: в каждой строке поровну ячеек и не меньше двух столбцов. Строк нужно две, а при вставке
 * в ячейку таблицы и одна: тогда табуляции раскладывают текст по соседним ячейкам. Иначе `null` — текст остаётся
 * текстом: отступы кода и списки с табуляцией таблицей не становятся. Один завершающий перевод строки (Excel так
 * его добавляет) не считается строкой.
 */
export function tabularText(
  text: string,
  options: { singleRow?: boolean } = {},
): string[][] | null {
  if (!text.includes('\t')) return null;

  const rows = parseDelimited(text.replace(/\r?\n$/, ''), '\t');

  if (!rows || rows.length < (options.singleRow ? 1 : 2)) return null;

  const columns = rows[0].length;

  if (columns < 2 || !rows.every((row) => row.length === columns)) return null;

  // Больше предела таблицы — такой текст вставляется как текст, а не как таблица, которую потом нельзя расширить.
  if (columns > MAX_TABLE_COLUMNS || rows.length * columns > MAX_TABLE_CELLS) return null;

  return rows;
}
