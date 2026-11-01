import { createContext, useContext } from 'react';

import { en, type SandboxKey } from './en';
import { ru } from './ru';

export type { SandboxKey };

export type SandboxParams = Readonly<Record<string, string | number>>;
export type SandboxT = (key: SandboxKey, params?: SandboxParams) => string;

export interface SandboxMessage {
  readonly key: SandboxKey;
  readonly params?: SandboxParams;
}

export class SandboxError extends Error {
  constructor(
    readonly key: SandboxKey,
    readonly params?: SandboxParams,
    options?: ErrorOptions,
  ) {
    super(key, options);
    this.name = 'SandboxError';
  }
}

const DICTIONARIES: Readonly<Record<string, Readonly<Record<SandboxKey, string>>>> = { en, ru };

/** Словарь по коду языка: `pt-BR` → `pt`; язык без словаря (например, `de`) получает английский. */
const dictionaryOf = (locale: string) =>
  DICTIONARIES[locale.toLowerCase()] ?? DICTIONARIES[locale.toLowerCase().split('-')[0]] ?? en;

const interpolate = (template: string, params?: SandboxParams) =>
  params
    ? template.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in params ? String(params[name]) : match,
      )
    : template;

export function sandboxT(locale: string): SandboxT {
  const dictionary = dictionaryOf(locale);

  return (key, params) => interpolate(dictionary[key], params);
}

export const formatNumber = (locale: string, value: number) => value.toLocaleString(locale);

export interface SandboxI18n {
  readonly locale: string;
  readonly t: SandboxT;
  readonly number: (value: number) => string;
}

export const createSandboxI18n = (locale: string): SandboxI18n => ({
  locale,
  t: sandboxT(locale),
  number: (value) => formatNumber(locale, value),
});

export const SandboxI18nContext = createContext<SandboxI18n>(createSandboxI18n('en'));

export const useSandboxI18n = (): SandboxI18n => useContext(SandboxI18nContext);

export function describe(t: SandboxT, value: SandboxMessage | unknown): string {
  if (value instanceof SandboxError) return t(value.key, value.params);
  if (value instanceof Error) return value.message;
  if (typeof value === 'object' && value !== null && 'key' in value) {
    const message = value as SandboxMessage;

    return t(message.key, message.params);
  }

  return String(value);
}
