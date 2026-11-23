import nspell from 'nspell';

/** Словарь Hunspell: файл правил (`.aff`) и список слов (`.dic`) — текстом или байтами. */
export interface Dictionary {
  readonly aff: string | Uint8Array | ArrayBuffer;
  readonly dic: string | Uint8Array | ArrayBuffer;
}

type Speller = ReturnType<typeof nspell>;

const text = (data: string | Uint8Array | ArrayBuffer) =>
  typeof data === 'string' ? data : new TextDecoder().decode(data);

/**
 * Проверка по словарям в том потоке, где создана (основной или Web Worker): словари по языкам и личный словарь, общий
 * для всех языков.
 */
export class SpellEngine {
  private readonly spellers = new Map<string, Speller>();

  private readonly personal = new Set<string>();

  load(lang: string, dictionary: Dictionary): void {
    const speller = nspell(text(dictionary.aff), text(dictionary.dic));

    for (const word of this.personal) speller.add(word);
    this.spellers.set(lang, speller);
  }

  has(lang: string): boolean {
    return this.spellers.has(lang);
  }

  add(word: string): void {
    this.personal.add(word);

    for (const speller of this.spellers.values()) speller.add(word);
  }

  /** Варианты для слова: `null` — слово верное (или словаря этого языка нет). */
  suggest(lang: string, word: string, limit: number): string[] | null {
    const speller = this.spellers.get(lang);

    if (!speller || this.personal.has(word) || speller.correct(word)) return null;

    return rank(word, speller.suggest(word)).slice(0, limit);
  }
}

/** Расстояние Дамерау — Левенштейна (с перестановкой соседних букв): сколько правок отделяет одно слово от другого. */
export function distance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...new Array<number>(b.length).fill(0),
  ]);

  for (let j = 1; j <= b.length; j++) rows[0][j] = j;

  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
    }

  return rows[a.length][b.length];
}

/**
 * Порядок вариантов: nspell отдаёт их без оценки («превет» → «ревет» раньше «привет»). Сначала меньше правок, затем та
 * же длина и та же первая буква (опечатки обычно внутри слова), затем — порядок nspell.
 */
function rank(word: string, suggestions: readonly string[]): string[] {
  const lower = word.toLowerCase();
  const score = (suggestion: string) => {
    const candidate = suggestion.toLowerCase();

    return [
      distance(lower, candidate),
      Math.abs(candidate.length - lower.length),
      candidate[0] === lower[0] ? 0 : 1,
    ];
  };

  return suggestions
    .map((suggestion, index) => ({ suggestion, index, score: score(suggestion) }))
    .sort(
      (a, b) =>
        a.score[0] - b.score[0] ||
        a.score[1] - b.score[1] ||
        a.score[2] - b.score[2] ||
        a.index - b.index,
    )
    .map(({ suggestion }) => suggestion);
}
