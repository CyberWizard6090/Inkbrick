export const DEFAULT_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
] as const;

export const DEFAULT_MAX_INLINE_BYTES = 1_500_000;

export interface ImageOptions {
  /**
   * Загружает файл и возвращает адрес картинки (http(s) или относительный). Без него картинки
   * встраиваются в документ как data:-адреса (до `maxInlineBytes`).
   */
  readonly upload?: (file: File) => Promise<string>;
  /**
   * Перезаливает картинку с чужого сервера при вставке HTML: получает её адрес и возвращает свой (http(s) или
   * относительный). Вставка ждёт ответа и не обращается к чужому серверу сама, поэтому нет трекинг-пикселей и утечки
   * IP. `null` или ошибка — картинка в документ не попадает. Без хука картинки вставляются по исходному адресу.
   */
  readonly rehost?: (url: string) => Promise<string | null>;
  /** Предел размера для встраивания data:-картинки, байт (по умолчанию 1,5 МБ). */
  readonly maxInlineBytes?: number;
  /** Допустимые MIME-типы (по умолчанию PNG, JPEG, GIF, WebP, AVIF). SVG не поддерживается. */
  readonly acceptedTypes?: readonly string[];
  readonly onError?: (error: unknown, file: File) => void;
}
