import { fitWidths } from '../fitWidths';
import { clamp } from './geometry';

/*
 * Расчёт ширин столбцов при перетаскивании границы, стрелках и ползунке (телефон). Функции чистые: место на странице
 * (`available`) и сохранённые ширины передаются явно, DOM читают только `widthsOnScreen` и `availableWidth`.
 */

export const MIN_WIDTH = 40;
export const MAX_WIDTH = 1200;
/** Внешняя граница таблицы с border-collapse: один пиксель сверх ширин столбцов. */
const BORDER_PIXEL = 1;

/**
 * Ширины всех столбцов в пикселях, как они сейчас на экране (по первой строке; объединённая ячейка делится поровну
 * между своими столбцами, скрытая берёт долю той, что её накрывает). Столбцы с сохранённой шириной берут её:
 * отрисованные уже подогнаны под страницу, и записать их — потерять пользовательские значения.
 */
export function widthsOnScreen(
  table: HTMLTableElement | null,
  saved: readonly (number | null | undefined)[] | undefined,
): number[] {
  const cells = [...(table?.rows[0]?.cells ?? [])];
  const result: number[] = [];
  let share = MIN_WIDTH;
  let left = 0;

  for (const cell of cells) {
    if (!cell.hidden) {
      left = Math.max(1, cell.colSpan);
      share = cell.getBoundingClientRect().width / left || MIN_WIDTH;
    }

    result.push(left > 0 ? share : MIN_WIDTH);
    left -= 1;
  }

  return result.map((width, index) => {
    const own = saved?.[index];

    return typeof own === 'number' && own > 0 ? own : width;
  });
}

/** Сколько места под таблицу на странице: видимая ширина самого блока таблицы (у него `max-width: 100%`). */
export function availableWidth(table: HTMLTableElement | null): number {
  const width = table?.closest<HTMLElement>('[data-inkbrick-block="table"]')?.clientWidth ?? 0;

  // Без раскладки (скрытый блок, тестовое окружение) предела нет. Внешняя граница таблицы (border-collapse) добавляет
  // ещё пиксель сверх суммы ширин столбцов, поэтому места под столбцы на пиксель меньше.
  return width > 0 ? width - BORDER_PIXEL : Number.POSITIVE_INFINITY;
}

/** Индексы столбцов, ширина которых изменилась (с округлением до пикселя). */
export const changedColumns = (before: readonly number[], after: readonly number[]): number[] =>
  after.flatMap((width, index) => (Math.abs(width - (before[index] ?? width)) >= 1 ? [index] : []));

/**
 * Что записывать после перетаскивания. Пока таблица помещается на страницу, отрисованные ширины — настоящие, и все
 * столбцы фиксируются как есть (таблица становится ровно своей ширины). Когда страница уже таблицы, отрисованные ширины
 * подогнаны, и записываются только изменённые столбцы: подогнанные значения в модель не попадают.
 */
export function columnsToWrite(
  start: readonly number[],
  after: readonly number[],
  available: number,
): number[] {
  const changed = changedColumns(start, after);

  if (changed.length === 0) return [];

  return fitWidths(start, available) === start ? after.map((_, index) => index) : changed;
}

/** Сумма ширин всех столбцов, кроме `column`. */
const othersOf = (widths: readonly number[], column: number) =>
  widths.reduce((sum, width, index) => (index === column ? sum : sum + width), 0);

/**
 * Новые ширины при смещении правой границы столбца `column` на `delta`: у границы между столбцами меняются только два
 * соседних (сумма та же, остальные стоят), у правого края последнего столбца меняется он один, а с ним и таблица.
 */
export function resized(
  start: readonly number[],
  column: number,
  delta: number,
  available: number,
): number[] {
  const next = [...start];
  const neighbour = column + 1 < start.length ? column + 1 : -1;

  if (neighbour < 0) {
    // Таблица не шире страницы: последний столбец тянется, пока сумма ширин помещается в видимую область.
    const room = Math.floor(available) - Math.ceil(othersOf(start, column));
    // Растянуть дальше места нельзя, а сжать можно всегда: верхняя граница не ниже текущей ширины.
    const upper = Math.max(start[column], Math.min(MAX_WIDTH, room));

    next[column] = clamp(start[column] + delta, MIN_WIDTH, upper);

    return next;
  }

  const total = start[column] + start[neighbour];

  next[column] = clamp(start[column] + delta, MIN_WIDTH, Math.max(MIN_WIDTH, total - MIN_WIDTH));
  next[neighbour] = total - next[column];

  return next;
}

/**
 * Округляет ширины до целых пикселей так, чтобы их сумма осталась прежней (до целого): каждая ширина округляется вниз, а
 * недостающие пиксели отдаются столбцам с наибольшей дробной частью. Иначе таблица теряла бы по пикселю на каждый столбец.
 */
export function roundWidths(widths: readonly number[]): number[] {
  const floors = widths.map((width) => Math.floor(width));
  const total = Math.round(widths.reduce((sum, width) => sum + width, 0));
  let rest = total - floors.reduce((sum, width) => sum + width, 0);

  const order = widths.map((_, index) => index).sort((a, b) => (widths[b] % 1) - (widths[a] % 1));

  for (const index of order) {
    if (rest <= 0) break;

    floors[index] += 1;
    rest -= 1;
  }

  return floors;
}

/** Пределы ползунка: как далеко можно сдвинуть правую границу столбца, пока соседи не уже минимума. */
export function widthRange(
  start: readonly number[],
  column: number,
  available: number,
): { min: number; max: number } {
  const neighbour = column + 1 < start.length ? column + 1 : -1;

  if (neighbour >= 0) return { min: MIN_WIDTH, max: start[column] + start[neighbour] - MIN_WIDTH };

  return {
    min: MIN_WIDTH,
    max: Math.max(
      start[column],
      Math.min(MAX_WIDTH, Math.floor(available) - Math.ceil(othersOf(start, column))),
    ),
  };
}
