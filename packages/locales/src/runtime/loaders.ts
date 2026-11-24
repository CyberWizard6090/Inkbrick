import type { PartialMessages } from '../en';

/**
 * Языки, которые грузятся по требованию: код языка → загрузчик словаря. Английский здесь не нужен: он всегда в составе
 * `@inkbrick/locales`, потому что недостающие ключи любого языка берутся из него. Каждый загрузчик — отдельный чанк.
 * Свой язык приложение подключает через `registerLocale`.
 */
export const localeLoaders: Readonly<Record<string, () => Promise<PartialMessages>>> = {
  ru: () => import('../ru').then((module) => module.ru),
};
