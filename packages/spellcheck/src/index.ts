import type { Dictionary } from './engine';
import type { SpellRequest, SpellResponse } from './protocol';

export type { Dictionary } from './engine';

/** Проверка орфографии для редактора: варианты для слова и личный словарь. */
export interface Spellchecker {
  /** Варианты исправления; `null` — слово верное или его язык не проверяется. */
  suggest(word: string): Promise<readonly string[] | null>;
  /** Запомнить слово как верное (личный словарь, для всех языков). */
  add(word: string): void;
  /** Остановить Web Worker и забыть словари. */
  destroy(): void;
}

export interface SpellcheckerOptions {
  /**
   * Словари по языкам: функция загружает словарь, когда он впервые нужен (по первому слову этого языка). Словари
   * подключает приложение (например, пакеты `dictionary-en`, `dictionary-ru`): так их лицензии и вес остаются его выбором.
   */
  readonly languages: Readonly<Record<string, () => Promise<Dictionary>>>;
  /** Язык слова. По умолчанию — по алфавиту: кириллица → `ru`, латиница → `en`, иначе не проверяется. */
  languageOf?(word: string): string | undefined;
  /**
   * Web Worker со скриптом `@inkbrick/spellcheck/worker` (или функция, которая его создаёт при первом слове). Без него
   * словари разбираются в основном потоке: русский — около двух секунд, на это время страница замирает.
   */
  readonly worker?: Worker | (() => Worker);
  /** Слова личного словаря: считаются верными с самого начала. */
  readonly personal?: readonly string[];
  /** Слово добавлено в личный словарь (`add`): например, чтобы сохранить его. */
  onAdd?(word: string): void;
  /** Сколько вариантов отдавать. По умолчанию 5. */
  readonly maxSuggestions?: number;
}

/** Язык слова по алфавиту: кириллица — `ru`, латиница — `en`. */
export function scriptLanguage(word: string): string | undefined {
  if (/\p{Script=Cyrillic}/u.test(word)) return 'ru';
  if (/\p{Script=Latin}/u.test(word)) return 'en';

  return undefined;
}

/** Слово, которое имеет смысл проверять: буквы (с апострофом и дефисом внутри), без цифр, от двух символов. */
const CHECKABLE = /^\p{L}[\p{L}\p{M}'’-]*\p{L}$/u;

interface Backend {
  load(lang: string, dictionary: Dictionary): Promise<void>;
  suggest(lang: string, word: string, limit: number): Promise<string[] | null>;
  add(word: string): Promise<void>;
  destroy(): void;
}

function workerBackend(create: () => Worker): Backend {
  let worker: Worker | undefined;
  let next = 0;
  const pending = new Map<
    number,
    { resolve(value: string[] | null): void; reject(error: Error): void }
  >();

  // Запрос без `id` (его ставит `send`), по каждому виду запроса отдельно.
  const send = (
    request: SpellRequest extends infer R
      ? R extends SpellRequest
        ? Omit<R, 'id'>
        : never
      : never,
  ) => {
    worker ??= create();
    worker.onmessage = (event: MessageEvent<SpellResponse>) => {
      const waiting = pending.get(event.data.id);

      if (!waiting) return;

      pending.delete(event.data.id);
      if ('error' in event.data) waiting.reject(new Error(event.data.error));
      else waiting.resolve(event.data.result);
    };

    const id = ++next;

    return new Promise<string[] | null>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker!.postMessage({ ...request, id });
    });
  };

  return {
    load: async (lang, dictionary) => void (await send({ type: 'load', lang, dictionary })),
    suggest: (lang, word, limit) => send({ type: 'suggest', lang, word, limit }),
    add: async (word) => void (await send({ type: 'add', word })),
    destroy: () => {
      worker?.terminate();
      for (const waiting of pending.values()) waiting.reject(new Error('Spellchecker destroyed'));
      pending.clear();
    },
  };
}

function localBackend(): Backend {
  // nspell — только когда он нужен: без Web Worker он грузится в основной поток при первом слове.
  const engine = import('./engine').then(({ SpellEngine }) => new SpellEngine());

  return {
    load: async (lang, dictionary) => (await engine).load(lang, dictionary),
    suggest: async (lang, word, limit) => (await engine).suggest(lang, word, limit),
    add: async (word) => (await engine).add(word),
    destroy: () => undefined,
  };
}

/**
 * Проверка орфографии по словарям Hunspell (`nspell`). Каждый язык загружается при первом слове этого языка; в
 * Web Worker (`worker`) разбор словарей и поиск вариантов не задерживают страницу.
 *
 * ```ts
 * import { createSpellchecker } from '@inkbrick/spellcheck';
 * import SpellWorker from '@inkbrick/spellcheck/worker?worker';
 *
 * const spellchecker = createSpellchecker({
 *   worker: () => new SpellWorker(),
 *   languages: { ru: () => loadDictionary('/dict/ru'), en: () => loadDictionary('/dict/en') },
 * });
 *
 * <EditorProvider editor={editor} spellcheck={{ checker: spellchecker }}>…
 * ```
 */
export function createSpellchecker(options: SpellcheckerOptions): Spellchecker {
  const { worker } = options;
  const backend = worker
    ? workerBackend(typeof worker === 'function' ? worker : () => worker)
    : localBackend();
  const languageOf = options.languageOf ?? scriptLanguage;
  const limit = options.maxSuggestions ?? 5;
  const loading = new Map<string, Promise<boolean>>();
  const personal = new Set(options.personal ?? []);

  for (const word of personal) void backend.add(word);

  /** Словарь языка загружен (или загружается); `false` — такого языка нет или он не загрузился. */
  const ready = (lang: string): Promise<boolean> => {
    let promise = loading.get(lang);

    if (!promise) {
      const load = options.languages[lang];

      promise = load
        ? load().then(
            (dictionary) => backend.load(lang, dictionary).then(() => true),
            () => false,
          )
        : Promise.resolve(false);
      loading.set(lang, promise);
    }

    return promise;
  };

  return {
    async suggest(word) {
      const lang = languageOf(word);

      if (!lang || personal.has(word) || !CHECKABLE.test(word)) return null;
      if (!(await ready(lang))) return null;

      return backend.suggest(lang, word, limit);
    },
    add(word) {
      if (personal.has(word)) return;

      personal.add(word);
      void backend.add(word);
      options.onAdd?.(word);
    },
    destroy() {
      backend.destroy();
      loading.clear();
    },
  };
}
