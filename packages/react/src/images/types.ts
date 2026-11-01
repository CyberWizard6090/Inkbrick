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
  /** Предел размера для встраивания data:-картинки, байт (по умолчанию 1,5 МБ). */
  readonly maxInlineBytes?: number;
  /** Допустимые MIME-типы (по умолчанию PNG, JPEG, GIF, WebP, AVIF). SVG не поддерживается. */
  readonly acceptedTypes?: readonly string[];
  readonly onError?: (error: unknown, file: File) => void;
}
