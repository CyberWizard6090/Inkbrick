# Свой блок: руководство разработчика

Путь от идеи до готового блока на одном примере — блок «Оценка» (`app:rating`): звёзды от 0 до 5 и подпись. Код движка из этого
руководства проверяется тестом `packages/engine/__tests__/custom-block-guide.test.ts`: если API изменится, тест упадёт.

| Слой             | Что даёт блоку                                   | Пакет                |
| ---------------- | ------------------------------------------------ | -------------------- |
| 1. Схема         | тип, props и их проверка, место в дереве, версия | `@inkbrick/document` |
| 2. Контроллер    | команды, пункты меню, клавиши, жизненный цикл    | `@inkbrick/engine`   |
| 3. Типы команд   | проверка данных команды компилятором             | `@inkbrick/engine`   |
| 4. Нормализация  | инварианты, которые держатся после любой правки  | `@inkbrick/engine`   |
| 5. Возможность   | всё вместе одним подключаемым объектом           | `@inkbrick/engine`   |
| 6. Представление | как блок выглядит и как с ним работают мышью     | `@inkbrick/react`    |
| 7. Проверки      | тесты без браузера                               | —                    |

## 1. Схема

Схема — чистые данные: что за блок, какие у него props, где он может лежать.

```ts
import { z, type BlockSchema } from '@inkbrick/document';

type RatingProps = { stars: number; max: number };

export const RatingSchema: BlockSchema = {
  flavour: 'app:rating', // своё пространство имён: `block:*` — встроенные блоки
  name: 'Rating',
  icon: 'star',
  version: 1, // при несовместимой смене props — увеличить и добавить `migrate`
  propsSchema: z.object({
    stars: z.number().int().min(0).default(0),
    max: z.number().int().min(1).max(10).default(5),
  }),
  allowedParents: ['role:hub'], // в заметке, колонке, переключателе
  allowedChildren: [],
  enter: { nextFlavour: 'block:paragraph' }, // Enter в подписи — новый абзац ниже
  commands: ['rating.set'],
  shortcuts: [],
  rendererHint: 'rating',
};
```

- **Props проверяются** при создании и любой смене: недопустимые отклоняются, команда не выполняется. Значения по умолчанию — в
  `default`. `z` берите из `@inkbrick/document`, отдельная зависимость от zod не нужна.
- **Текст.** У блока есть текст (`content`) — здесь подпись. Блоку без текста (картинка, разделитель) — `inline: false`. Текст без
  оформления (как у кода) — `plainText: true`.
- **Контейнер** с потомками задаёт `allowedChildren`, роль `hub` и, если нужно, `fillWhenEmpty` — какой блок появляется в пустом.
- **Версии и миграции**, роли, глубина вложенности — `docs/schema-rules.md`.

## 2. Контроллер: команды, меню, клавиши

Поведение блока без React: его можно вызвать и на сервере.

```ts
import { defineBlockCommand, defineBlockController } from '@inkbrick/engine';

const setRating = defineBlockCommand<RatingProps, { stars: number }>({
  type: 'rating.set',
  canExecute: ({ block }, { stars }) =>
    Number.isInteger(stars) &&
    stars >= 0 &&
    stars <= block.props.max &&
    stars !== block.props.stars,
  execute: ({ setProps }, { stars }) => setProps({ stars }),
});

export const ratingController = defineBlockController<RatingProps>({
  commands: [setRating],
  menuItems: [
    {
      id: 'rating.clear',
      title: 'Clear rating',
      icon: 'x',
      isDisabled: ({ can }) => !can('rating.set', { stars: 0 }),
      run: ({ execute }) => execute('rating.set', { stars: 0 }),
    },
  ],
  // slashItems, keymap, onCreate / onInsert / onRemove / onPropsChange / onFocus / onBlur — docs/ui-customization.md, раздел 10
});
```

- **Команда — одна правка и один шаг отмены.** Она выполняется в транзакции: исключение откатывает её целиком.
- **`canExecute`** — условие (кнопки и пункты меню становятся недоступны); без изменений команда ничего не делает и не оставляет
  шага в истории.
- **Вызов**: `editor.execute('rating.set', { blockId, stars: 4 })`, `editor.can(...)`; в обработчиках контроллера — `execute`
  и `can` контекста (`blockId` подставляется сам).

## 3. Типы команд

Объявите команду в `CommandMap` — и данные, и результат будут проверяться при каждом вызове:

```ts
declare module '@inkbrick/engine' {
  interface CommandMap {
    'rating.set': { payload: { blockId: string; stars: number }; result: void };
  }
}

editor.execute('rating.set', { blockId, stars: 4 }); // проверено
editor.execute('rating.set', { blockId, star: 4 }); // ошибка компиляции
```

## 4. Нормализация

Инвариант, который зависит не от одного значения, а от сочетания (звёзд не больше максимума) или от соседей, держит правило
нормализации. Оно выполняется после каждой команды для изменённых блоков, в той же правке — и после чужого патча
(`docs/schema-rules.md`, «Нормализация документа»).

```ts
import type { NormalizeRule } from '@inkbrick/engine';

const clampStars: NormalizeRule = {
  name: 'clampStars',
  flavours: ['app:rating'],
  normalize({ engine, transaction, block }) {
    const { stars, max } = block.props as RatingProps;

    if (stars <= max) return; // блок в порядке — не трогать, иначе нормализация не закончится
    engine.block.update(transaction, block.id, (rating) => ({
      ...rating,
      props: { ...rating.props, stars: max },
    }));
  },
};
```

## 5. Возможность: всё вместе

```ts
import { defineFeature, Editor } from '@inkbrick/engine';

export const ratingFeature = defineFeature({
  name: 'rating',
  blocks: [{ schema: RatingSchema, controller: ratingController }],
  normalizers: [clampStars],
  // commands: команды не одного блока; guards: общие правила перед командами; afterCommand; setup(editor)
});

const editor = new Editor({ features: [tableFeature, ratingFeature] });
```

Возможность подключается один раз (по имени), сколько бы раз она ни встретилась. Блок может сам сослаться на неё
(`BlockDefinition.feature`): тогда достаточно передать блок в `blocks`.

## 6. Представление (React)

```tsx
import {
  defineBlock,
  Editable,
  useBlockController,
  type CustomBlockViewProps,
} from '@inkbrick/react';

function RatingView({ block, readOnly }: CustomBlockViewProps<RatingProps>) {
  const rating = useBlockController<RatingProps>(block);

  return (
    <div data-inkbrick-block="rating" data-block-id={block.id}>
      <div contentEditable={false} role="radiogroup" aria-label="Rating">
        {Array.from({ length: block.props.max }, (_, index) => (
          <button
            key={index}
            type="button"
            role="radio"
            aria-checked={index < block.props.stars}
            aria-label={`${index + 1} stars`}
            disabled={readOnly || !rating.can('rating.set', { stars: index + 1 })}
            onClick={() => rating.execute('rating.set', { stars: index + 1 })}
          >
            ★
          </button>
        ))}
      </div>
      <Editable block={block} /> {/* подпись: обычный текст с кареткой */}
    </div>
  );
}

export const ratingBlock = defineBlock<RatingProps>({
  schema: RatingSchema,
  component: RatingView,
  controller: ratingController,
  feature: ratingFeature, // нормализация и прочее поведение движка подключатся вместе с блоком
});

const editor = new Editor({ blocks: [ratingBlock] });

<EditorProvider editor={editor} blocks={[ratingBlock]}>
  <DocumentView />
</EditorProvider>;
```

- **Разметка.** Корень блока — `data-inkbrick-block` и `data-block-id`; нередактируемые части — `contentEditable={false}`; текст — через
  `<Editable>`. Контракт компонента и доступность — `docs/ui-customization.md` (разделы 2 и 8).
- **Стили** — через data-атрибуты и токены темы (`docs/styling.md`), чтобы блок менялся вместе с темой.
- **Выделение** блока целиком, рамкой или стрелками, перенос, копирование и удаление работают без кода блока. Выделение из кода —
  `editor.selection` (`docs/selection.md`).

## 7. Проверки

Движок работает без браузера, поэтому поведение блока проверяется обычными тестами:

```ts
const editor = new Editor({ features: [ratingFeature] });
const id = editor.dispatch({
  type: 'insertBlock',
  payload: { flavour: 'app:rating', afterId },
})!.blockId;

editor.execute('rating.set', { blockId: id, stars: 4 });
expect(editor.document.getBlock(id)!.props.stars).toBe(4);

editor.undo();
expect(editor.document.getBlock(id)!.props.stars).toBe(0);
```

Проверьте: значения по умолчанию, отказ недопустимых props, шаг отмены у каждой команды, правила нормализации и сохранение
(`editor.serialize()` → `deserializeDocument` → тот же документ).

## Что ещё

- **Экспорт.** Markdown, HTML и текст выводят свой блок как абзац с его текстом: свойства блока в эти форматы не переносятся. Свой
  формат — по снимку документа (`editor.serialize()`).
- **Неизвестный тип.** Документ с блоком, схема которого не подключена, открывается: блок показывается заглушкой и сохраняется как
  есть (`docs/ui-customization.md`, раздел 6).
- **Совместная правка.** Блок передаётся патчем целиком, правила нормализации у всех участников одинаковые (`docs/collaboration.md`).
