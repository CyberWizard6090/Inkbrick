/** Наименьшая ширина столбца (пикселей). */
export const MIN_COLUMN_WIDTH = 40;

type Width = number | null | undefined;

/**
 * Ширины столбцов, как их рисовать на странице шириной `available`: если заданные ширины вместе с наименьшей шириной
 * столбцов без ширины не помещаются, заданные пропорционально уменьшаются (не меньше {@link MIN_COLUMN_WIDTH}). Модель
 * не меняется, это только показ: так таблица не уходит за край страницы, а добавленные столбцы не пропадают справа. Без
 * известной ширины страницы (нет раскладки) ширины остаются как есть.
 */
export function fitWidths(
  widths: readonly Width[],
  available: number,
  min = MIN_COLUMN_WIDTH,
): readonly Width[] {
  if (!Number.isFinite(available) || available <= 0) return widths;

  const set = widths.map((width) => (typeof width === 'number' && width > 0 ? width : null));
  const unset = set.filter((width) => width === null).length;
  const known = set.reduce<number>((sum, width) => sum + (width ?? 0), 0);
  const room = available - unset * min;

  if (known <= room) return widths;

  const scale = Math.max(0, room) / known;
  const result = set.map((width) =>
    width === null ? null : Math.max(min, Math.floor(width * scale)),
  );
  let over = result.reduce<number>((sum, width) => sum + (width ?? 0), 0) - room;

  // Нижняя граница могла вернуть лишнее: снимаем его с самых широких столбцов.
  while (over > 0) {
    let widest = -1;

    result.forEach((width, index) => {
      if (width !== null && width > min && (widest < 0 || width > (result[widest] ?? 0)))
        widest = index;
    });

    if (widest < 0) break;

    const cut = Math.min(over, (result[widest] ?? min) - min);

    result[widest] = (result[widest] ?? min) - cut;
    over -= cut;
  }

  return result;
}
