import { en, type MessageKey, type Messages, type PartialMessages } from '../en';

import { localeLoaders } from './loaders';

export type MessageParams = Readonly<Record<string, string | number>>;

export type TFunction = (key: MessageKey, params?: MessageParams) => string;

// Английский всегда под рукой (из него берутся недостающие ключи), остальные языки подгружаются по требованию.
/**
 * Словарь приложения: ключи редактора (можно не все) и свои ключи для строк приложения (названия своих блоков в slash-меню,
 * см. `titleKey` у пункта).
 */
export type AppMessages = PartialMessages & Readonly<Record<string, string | undefined>>;

const registry = new Map<string, AppMessages>([['en', en]]);

/**
 * Подключает словарь под кодом языка (`'de'`, `'uk'`, `'pt-BR'`). Словарь может быть неполным: недостающие
 * ключи берутся из английского. Повторная регистрация того же кода заменяет словарь (в том числе встроенный).
 */
export function registerLocale(code: string, messages: AppMessages): void {
  registry.set(normalize(code), messages);
}

/** Коды доступных языков: подключённые через `registerLocale`, загруженные и те, что грузятся по требованию (`ru`). */
export function getLocales(): string[] {
  // Порядок: английский, встроенные языки, затем подключённые приложением, в порядке подключения.
  return [...new Set(['en', ...Object.keys(localeLoaders), ...registry.keys()])];
}

/** Подключён ли язык сейчас (загружен или зарегистрирован): для него `resolveMessages` вернёт перевод сразу. */
export function isLocaleLoaded(code: string): boolean {
  const wanted = normalize(code);

  return registry.has(wanted) || registry.has(wanted.split('-')[0]);
}

/**
 * Загружает язык, который грузится по требованию (`ru`), и подключает его. Уже подключённый язык, свой словарь через
 * `registerLocale` и неизвестный код ничего не загружают. Провайдер вызывает это сам при смене `locale`; вызовите заранее,
 * если интерфейс должен сразу появиться на нужном языке (перед первой отрисовкой, в тестах и при рендере на сервере).
 */
export function preloadLocale(code: string): Promise<void> {
  const wanted = normalize(code);

  for (const candidate of [wanted, wanted.split('-')[0]]) {
    if (registry.has(candidate)) return Promise.resolve();

    const load = localeLoaders[candidate];

    if (load) {
      return load().then((messages) => {
        // За время загрузки могли зарегистрировать свой словарь под тем же кодом: он важнее.
        if (!registry.has(candidate)) registry.set(candidate, messages);
      });
    }
  }

  return Promise.resolve();
}

const normalize = (code: string) => code.trim().toLowerCase();

function lookup(
  code: string,
  locales: Readonly<Record<string, AppMessages>> | undefined,
): AppMessages | undefined {
  const wanted = normalize(code);
  const own = locales
    ? Object.fromEntries(Object.entries(locales).map(([key, value]) => [normalize(key), value]))
    : undefined;

  for (const candidate of [wanted, wanted.split('-')[0]]) {
    const found = own?.[candidate];
    const registered = registry.get(candidate);

    // Словарь провайдера важнее подключённого, но не заменяет его: недостающие строки берутся из подключённого языка
    // (так приложение добавляет свои ключи к встроенному языку, не копируя его целиком).
    if (found && registered) return { ...registered, ...found };
    if (found ?? registered) return found ?? registered;
  }

  return undefined;
}

export interface ResolveMessagesOptions {
  readonly locale?: string;
  readonly locales?: Readonly<Record<string, AppMessages>>;
  readonly messages?: AppMessages;
}

export function resolveMessages(options: ResolveMessagesOptions = {}): Messages {
  const base = options.locale ? lookup(options.locale, options.locales) : undefined;

  return { ...en, ...stripEmpty(base), ...stripEmpty(options.messages) };
}

function stripEmpty(messages: AppMessages | undefined): AppMessages {
  if (!messages) return {};

  return Object.fromEntries(
    Object.entries(messages).filter(([, value]) => typeof value === 'string'),
  ) as AppMessages;
}

export function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function createTranslator(messages: Messages): TFunction {
  // Нет строки ни в словаре, ни в английском (ключ приложения без перевода): возвращается сам ключ.
  return (key, params) => interpolate(messages[key] ?? en[key] ?? key, params);
}

export const defaultT: TFunction = createTranslator(en);
