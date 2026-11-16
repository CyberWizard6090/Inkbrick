import { beforeAll } from 'vitest';

import { preloadEditorUI } from '../src';

// Части интерфейса (toolbar, slash-меню, ручка блока, попап формулы, картинка) — отдельные чанки. Тесты проверяют их
// поведение, а не загрузку, поэтому чанки грузятся до тестов; ленивую загрузку проверяют отдельные тесты.
beforeAll(async () => {
  await preloadEditorUI();
});
