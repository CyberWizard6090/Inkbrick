import type { Dictionary } from './engine';

/** Сообщения основного потока к Web Worker проверки. */
export type SpellRequest =
  | {
      readonly id: number;
      readonly type: 'load';
      readonly lang: string;
      readonly dictionary: Dictionary;
    }
  | {
      readonly id: number;
      readonly type: 'suggest';
      readonly lang: string;
      readonly word: string;
      readonly limit: number;
    }
  | { readonly id: number; readonly type: 'add'; readonly word: string };

/** Ответ Web Worker: результат запроса с тем же `id` или текст ошибки. */
export type SpellResponse =
  | { readonly id: number; readonly result: string[] | null }
  | { readonly id: number; readonly error: string };
