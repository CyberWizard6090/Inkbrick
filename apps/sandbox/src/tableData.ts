/**
 * Данные для песочницы табличного редактора. Всё детерминировано (без `Math.random`): E2E и скриншоты повторяемы.
 * Таблица не больше 2000 ячеек и 50 столбцов — иначе вставка отклоняется.
 */

export type Grid = string[][];

export const sampleTable = (): Grid => [
  ['Fruit', 'Qty'],
  ['Apple', '3'],
  ['Pear', '5'],
];

/** Маленькая линейная «случайность»: одно и то же начальное число даёт одну и ту же таблицу. */
function sequence(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

    return state / 2 ** 32;
  };
}

const NAMES = [
  'Apple',
  'Banana',
  'Cherry',
  'Date',
  'Elderberry',
  'Fig',
  'Grape',
  'Honeydew',
  'Kiwi',
  'Lemon',
  'Mango',
  'Nectarine',
];

/** Строки с текстом, числами и датами — чтобы пробовать типы столбцов и сортировку. */
export function randomRows(count: number, seed = 1): Grid {
  const next = sequence(seed);

  return Array.from({ length: count }, () => {
    const day = 1 + Math.floor(next() * 28);
    const month = 1 + Math.floor(next() * 12);

    return [
      NAMES[Math.floor(next() * NAMES.length)],
      String(Math.floor(next() * 1000)),
      (next() * 100).toFixed(2).replace('.', ','),
      `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.2024`,
    ];
  });
}

export const randomTable = (): Grid => [['Name', 'Qty', 'Price', 'Date'], ...randomRows(12)];

/** Большая таблица: 100 строк × 12 столбцов (1200 ячеек). */
export function largeTable(): Grid {
  const next = sequence(7);

  return Array.from({ length: 100 }, (_, row) =>
    Array.from({ length: 12 }, (_, column) =>
      row === 0 ? `Column ${column + 1}` : String(Math.floor(next() * 10000)),
    ),
  );
}

export const emptyTable = (): Grid => Array.from({ length: 3 }, () => ['', '', '']);

/** Разбирает файл JSON: `{ "rows": [["a", "b"], …] }` (как значение табличного редактора) или просто массив строк. */
export function parseTableJson(text: string): { rows: Grid; header?: boolean } {
  const data: unknown = JSON.parse(text);
  const rows = Array.isArray(data) ? data : (data as { rows?: unknown } | null)?.rows;

  if (
    !Array.isArray(rows) ||
    rows.length === 0 ||
    !rows.every(
      (row) =>
        Array.isArray(row) && row.length > 0 && row.every((cell) => typeof cell === 'string'),
    )
  ) {
    throw new Error('not a table');
  }

  const header =
    !Array.isArray(data) && typeof (data as { header?: unknown }).header === 'boolean'
      ? (data as { header: boolean }).header
      : undefined;

  return { rows: rows as Grid, header };
}

export function downloadJson(name: string, value: unknown): void {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const link = document.createElement('a');

  link.href = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  link.download = `${name}-${stamp}.json`;
  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
