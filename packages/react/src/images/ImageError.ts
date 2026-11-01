import type { MessageKey } from '../i18n/en';
import type { MessageParams, TFunction } from '../i18n/translate';

export type ImageErrorCode = 'type' | 'size' | 'uploadAddress' | 'read';

/**
 * Ошибка добавления картинки. `message` — английский текст для разработчика (попадает в `onError` и консоль);
 * в интерфейсе ошибка показывается переведённой по `code`.
 */
export class ImageError extends Error {
  constructor(
    readonly code: ImageErrorCode,
    message: string,
    readonly params?: MessageParams,
  ) {
    super(message);
    this.name = 'ImageError';
  }
}

export interface ImageErrorInfo {
  readonly message: string;
  readonly code?: ImageErrorCode;
  readonly params?: MessageParams;
}

export function toImageErrorInfo(error: unknown): ImageErrorInfo {
  if (error instanceof ImageError) {
    return { message: error.message, code: error.code, params: error.params };
  }

  return { message: error instanceof Error ? error.message : '' };
}

export function formatImageError(info: ImageErrorInfo, t: TFunction): string {
  if (info.code) return t(`image.error.${info.code}` as MessageKey, info.params);

  return info.message || t('image.error.generic');
}
