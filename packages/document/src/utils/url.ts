const SAFE_URL = /^(https?:|mailto:|tel:|\/|#)/i;

/** Безопасен ли адрес ссылки: только http(s), mailto, tel, относительные пути и якоря (никаких javascript:/data:). */
export function isSafeUrl(url: string): boolean {
  const value = url.trim();

  // eslint-disable-next-line no-control-regex
  return value.length > 0 && !/[\u0000-\u001f\u007f\s]/.test(value) && SAFE_URL.test(value);
}

/**
 * Приводит ввод пользователя к адресу ссылки: «example.com» → `https://example.com`,
 * «me@site.org» → `mailto:me@site.org`. Возвращает null для пустого или небезопасного адреса.
 */
export function normalizeLinkUrl(input: string): string | null {
  const value = input.trim();

  if (value === '') return null;

  let candidate = value;

  if (!/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^[/#]/.test(value)) {
    candidate = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? `mailto:${value}` : `https://${value}`;
  }

  return isSafeUrl(candidate) ? candidate : null;
}

const IMAGE_DATA_URL = /^data:image\/(png|jpe?g|gif|webp|avif);base64,[a-z0-9+/]+=*$/i;
export const MAX_DATA_IMAGE_LENGTH = 8_000_000;

/**
 * Безопасен ли адрес изображения: http(s), относительный путь или встроенная data:-картинка
 * растрового формата. SVG, `javascript:`, `blob:` и прочее отклоняются.
 */
export function isSafeImageUrl(url: string): boolean {
  const value = url.trim();

  if (value.length === 0) return false;

  if (/^data:/i.test(value))
    return value.length <= MAX_DATA_IMAGE_LENGTH && IMAGE_DATA_URL.test(value);

  // eslint-disable-next-line no-control-regex
  return !/[\u0000-\u001f\u007f\s]/.test(value) && /^(https?:\/\/|\/(?!\/))/i.test(value);
}
