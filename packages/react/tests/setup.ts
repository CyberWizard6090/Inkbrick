import { beforeAll } from 'vitest';

import { preloadEditorUI, preloadLocale } from '../src';

// Части интерфейса (toolbar, slash-меню, ручка блока, попап формулы, картинка) — отдельные чанки. Тесты проверяют их
// поведение, а не загрузку, поэтому чанки грузятся до тестов; ленивую загрузку проверяют отдельные тесты.
// Русский словарь — тоже чанк: тесты, которые включают `locale="ru"`, ждут готового перевода, а не английского первого кадра.
beforeAll(async () => {
  await Promise.all([preloadEditorUI(), preloadLocale('ru')]);
});
