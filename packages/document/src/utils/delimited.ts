/** Ограничение на число ячеек при разборе: защита от огромного текста из буфера обмена. */
export const MAX_DELIMITED_CELLS = 50_000;

const NEEDS_QUOTES = /["\r\n]/;

/**
 * Строки таблицы → текст с разделителем (по умолчанию табуляция — так таблицу понимают Excel и Google Sheets).
 * Ячейка берётся в кавычки, если в ней есть разделитель, кавычка или перевод строки; кавычка внутри удваивается (RFC 4180).
 */
export function serializeDelimited(rows: readonly (readonly string[])[], delimiter = '\t'): string {
  const quote = (cell: string) =>
    cell.includes(delimiter) || NEEDS_QUOTES.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;

  return rows.map((row) => row.map(quote).join(delimiter)).join('\n');
}

/**
 * Текст с разделителем → строки ячеек. Понимает ячейки в кавычках (с разделителями, переводами строк и удвоенными
 * кавычками внутри) и любые переводы строк (`\n`, `\r\n`, `\r`). Завершающий перевод строки пустой строки не даёт.
 * Строки не выравниваются: у разных строк может быть разное число ячеек. Пустой текст — пустой список; больше
 * `MAX_DELIMITED_CELLS` ячеек — `null`.
 */
export function parseDelimited(text: string, delimiter = '\t'): string[][] | null {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let started = false;
  let cells = 0;

  const endCell = () => {
    row.push(cell);
    cell = '';
    started = false;
    cells++;
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (cells > MAX_DELIMITED_CELLS) return null;

    if (quoted) {
      if (char !== '"') cell += char;
      else if (text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;

      continue;
    }

    if (char === '"' && !started && cell === '') {
      quoted = true;
      started = true;
    } else if (char === delimiter) {
      endCell();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;

      endRow();
    } else {
      cell += char;
      started = true;
    }
  }

  // Последняя строка без перевода строки в конце; пустой хвост после последнего перевода строки — не строка.
  if (started || cell !== '' || row.length > 0) endRow();

  return cells > MAX_DELIMITED_CELLS ? null : rows;
}
