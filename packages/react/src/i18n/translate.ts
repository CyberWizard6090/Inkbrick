import { en, type MessageKey, type Messages, type PartialMessages } from './en';
import { ru } from './ru';

export type MessageParams = Readonly<Record<string, string | number>>;

export type TFunction = (key: MessageKey, params?: MessageParams) => string;

const registry = new Map<string, PartialMessages>([
  ['en', en],
  ['ru', ru],
]);

/**
 * Подключает словарь под кодом языка (`'de'`, `'uk'`, `'pt-BR'`). Словарь может быть неполным: недостающие
 * ключи берутся из английского. Повторная регистрация того же кода заменяет словарь (в том числе встроенный).
 */
export function registerLocale(code: string, messages: PartialMessages): void {
  registry.set(normalize(code), messages);
}

export function getLocales(): string[] {
  return [...registry.keys()];
}

const normalize = (code: string) => code.trim().toLowerCase();

function lookup(
  code: string,
  locales: Readonly<Record<string, PartialMessages>> | undefined,
): PartialMessages | undefined {
  const wanted = normalize(code);
  const own = locales
    ? Object.fromEntries(Object.entries(locales).map(([key, value]) => [normalize(key), value]))
    : undefined;

  for (const candidate of [wanted, wanted.split('-')[0]]) {
    const found = own?.[candidate] ?? registry.get(candidate);

    if (found) return found;
  }

  return undefined;
}

export interface ResolveMessagesOptions {
  readonly locale?: string;
  readonly locales?: Readonly<Record<string, PartialMessages>>;
  readonly messages?: PartialMessages;
}

export function resolveMessages(options: ResolveMessagesOptions = {}): Messages {
  const base = options.locale ? lookup(options.locale, options.locales) : undefined;

  return { ...en, ...stripEmpty(base), ...stripEmpty(options.messages) };
}

function stripEmpty(messages: PartialMessages | undefined): PartialMessages {
  if (!messages) return {};

  return Object.fromEntries(
    Object.entries(messages).filter(([, value]) => typeof value === 'string'),
  ) as PartialMessages;
}

export function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function createTranslator(messages: Messages): TFunction {
  return (key, params) => interpolate(messages[key] ?? en[key], params);
}

export const defaultT: TFunction = createTranslator(en);
