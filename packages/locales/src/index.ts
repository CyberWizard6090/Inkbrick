export { en } from './en';
export type { MessageKey, Messages, PartialMessages } from './en';

export { localeLoaders } from './runtime/loaders';
export {
  createTranslator,
  defaultT,
  getLocales,
  interpolate,
  isLocaleLoaded,
  preloadLocale,
  registerLocale,
  resolveMessages,
} from './runtime/translate';
export type {
  AppMessages,
  MessageParams,
  ResolveMessagesOptions,
  TFunction,
} from './runtime/translate';
