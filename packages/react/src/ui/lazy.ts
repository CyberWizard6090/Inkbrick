import { useEffect, useSyncExternalStore } from 'react';

export interface LazyModule<T> {
  /** Начинает загрузку (один раз) и возвращает её промис. */
  preload(): Promise<T>;
  /** Загруженное значение или `undefined`, пока чанк не пришёл. */
  get(): T | undefined;
  subscribe(listener: () => void): () => void;
}

const registry: LazyModule<unknown>[] = [];

/** Часть интерфейса в отдельном чанке: грузится по требованию, а не вместе с основным бандлом. */
export function lazyModule<T>(load: () => Promise<T>): LazyModule<T> {
  let value: T | undefined;
  let promise: Promise<T> | undefined;
  const listeners = new Set<() => void>();

  const module: LazyModule<T> = {
    preload: () =>
      (promise ??= load().then((loaded) => {
        value = loaded;

        for (const listener of [...listeners]) listener();

        return loaded;
      })),
    get: () => value,
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };

  registry.push(module as LazyModule<unknown>);

  return module;
}

/**
 * Значение ленивого модуля для компонента: пока чанк не загружен — `undefined`, загрузка начинается при монтировании
 * (если `enabled`), после неё компонент перерисовывается.
 */
export function useLazy<T>(module: LazyModule<T>, enabled = true): T | undefined {
  const value = useSyncExternalStore(module.subscribe, module.get, module.get);

  useEffect(() => {
    if (enabled && value === undefined) void module.preload();
  }, [module, enabled, value]);

  return value;
}

/**
 * Загружает все отложенные части интерфейса редактора сразу (toolbar, slash-меню, ручку блока, попап формулы, блок
 * картинки). Нужно, если важно показать их без задержки с первого же действия, и в тестах.
 */
export function preloadEditorUI(): Promise<void> {
  return Promise.all(registry.map((module) => module.preload())).then(() => undefined);
}
