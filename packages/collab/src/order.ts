/**
 * Дробные ключи порядка: строки над алфавитом из 62 символов, сравниваются как обычные строки.
 * `keyBetween(a, b)` возвращает ключ строго между `a` и `b` (`null` — граница отсутствует), перенумерация соседей
 * не нужна. Ключ никогда не оканчивается на «0», поэтому между любыми двумя ключами есть место.
 *
 * Одинаковые ключи у двух блоков возможны (два клиента вставили в одно место); порядок тогда задаёт `blockId`
 * (см. `compareOrder`), поэтому дубликатов и потерянных блоков не бывает.
 */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length;

function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let n = 0;

    while ((a[n] ?? '0') === b[n]) n++;

    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }

  const digitA = a ? DIGITS.indexOf(a[0]) : 0;
  const digitB = b !== null ? DIGITS.indexOf(b[0]) : BASE;

  if (digitB - digitA > 1) return DIGITS[Math.round(0.5 * (digitA + digitB))];

  if (b !== null && b.length > 1) return b.slice(0, 1);

  return DIGITS[digitA] + midpoint(a.slice(1), null);
}

export function keyBetween(a: string | null, b: string | null): string {
  const lower = a ?? '';

  if (b !== null && lower >= b) {
    throw new Error(`keyBetween: "${lower}" must be less than "${b}"`);
  }

  return midpoint(lower, b);
}

/** Порядок потомков: сначала ключ, при равенстве идентификатор блока. */
export function compareOrder(a: { k: string; id: string }, b: { k: string; id: string }): number {
  if (a.k !== b.k) return a.k < b.k ? -1 : 1;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
