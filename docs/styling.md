# Стилизация

Разметка редактора — публичный API стилизации. Каждый блок и каждая его часть получают предсказуемые
`data-`атрибуты, и любой вид настраивается обычным CSS, без заранее заведённых токенов и без `!important`.
Так устроены Radix и BlockNote.

```ts
import '@inkbrick/styles'; // стандартный вид; без этого редактор остаётся «голым» и стилизуется целиком вами
```

## Атрибуты

| Атрибут               | Где                     | Значения                                                                                                  |
| --------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------- |
| `data-inkbrick-root`  | корень документа        | —                                                                                                         |
| `data-inkbrick-block` | корень блока            | `page`, `note`, `paragraph`, `heading`, `list`, `quote`, `code`, `divider`, `callout`, `image`, `unknown` |
| `data-inkbrick-part`  | часть блока или оверлея | см. таблицу ниже                                                                                          |
| `data-inkbrick-ui`    | оболочка редактора      | `slash-menu`, `toolbar`, `block-handle`, `block-menu`, `drop-indicator`, `select`                         |
| `data-inkbrick-icon`  | иконка (svg)            | имя иконки: `bold`, `plus`, `trash`, …                                                                    |
| `data-block-id`       | корень блока            | id блока                                                                                                  |

Параметры блока и состояния — отдельные атрибуты:

| Атрибут                                        | Где                                                    | Значения                                                  |
| ---------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------- |
| `data-level`                                   | `heading`                                              | `1`…`6`                                                   |
| `data-list-type`                               | `list`                                                 | `bullet`, `ordered`, `todo`                               |
| `data-checked`                                 | `list` (todo)                                          | `true` / `false`                                          |
| `data-tone`                                    | `callout`                                              | `info`, `warning`, `success`, `danger`                    |
| `data-language`                                | `code`                                                 | язык                                                      |
| `data-collapsed`                               | `code`                                                 | `true`, если код свёрнут                                  |
| `data-dragging`                                | `picker` (картинка)                                    | `true`, пока над полем держат файл                        |
| `data-side`                                    | `select`                                               | `bottom` / `top` — куда раскрылся список                  |
| `data-align`                                   | `figure` (картинка)                                    | `left`, `center`, `right`                                 |
| `data-selected`                                | блок                                                   | `true`, если блок затронут выделением                     |
| `data-align`                                   | блок                                                   | `left`, `center`, `right`, `justify`                      |
| `data-inkbrick-color`, `data-inkbrick-bg`      | `<span>` в тексте                                      | имя цвета палитры (цвет текста / подсветка)               |
| `data-inkbrick-formula`, `data-latex`          | встроенная формула                                     | код LaTeX; состояние `data-state`                         |
| `data-empty`                                   | `content`                                              | `true` у пустого блока                                    |
| `data-focused`                                 | `content`                                              | в этом блоке стоит каретка                                |
| `data-composing`                               | `content`                                              | идёт набор с клавиатуры телефона (IME), подсказка скрыта  |
| `data-hint`                                    | `content`                                              | текст общей подсказки (есть там, где работает slash-меню) |
| `data-placeholder`                             | `content`                                              | своя подсказка блока, если задана пропом `placeholder`    |
| `data-readonly`                                | корень                                                 | режим чтения                                              |
| `data-state`                                   | `status` (картинка)                                    | `loading`, `empty`, `error`                               |
| `data-active`                                  | пункт меню, ручка                                      | пункт выбран / меню ручки открыто                         |
| `data-pressed`                                 | кнопка toolbar и инструментов картинки                 | формат включён                                            |
| `data-disabled`, `data-danger`, `data-invalid` | пункты меню, поля                                      | отключено / опасное действие / ошибка                     |
| `data-position`                                | `drop-indicator`                                       | `before`, `after`                                         |
| `data-inkbrick-dragging`                       | перетаскиваемый блок; `<body>` во время перетаскивания | —                                                         |

### Части (`data-inkbrick-part`)

| Блок / оверлей  | Части                                                                                                                                                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| любой с текстом | `content` (редактируемый текст)                                                                                                                                                                                                               |
| `list`          | `row`, `marker`, `checkbox`, `children`                                                                                                                                                                                                       |
| `code`          | `toolbar`, `collapse`, `language`, `summary`, `spacer`, `caption-toggle`, `copy`, `body`, `body-inner`, `caption-row`, `caption`                                                                                                              |
| `callout`       | `icon` (кнопка смены тона)                                                                                                                                                                                                                    |
| `divider`       | `rule`                                                                                                                                                                                                                                        |
| `image`         | `figure`, `image`, `caption`, `tools`, `tool`, `width`, `alt`, `picker`, `picker-head`, `picker-icon`, `picker-text`, `picker-title`, `picker-hint`, `picker-upload`, `picker-row`, `picker-input`, `picker-button`, `picker-error`, `status` |
| `unknown`       | `message`                                                                                                                                                                                                                                     |
| `slash-menu`    | `item`, `icon`, `body`, `title`, `description`, `empty`                                                                                                                                                                                       |
| `toolbar`       | `button` (`data-format`), `separator`, `link-form`, `input`                                                                                                                                                                                   |
| `block-handle`  | `button` (`data-action="add"`), `grip` (`data-action="grip"`)                                                                                                                                                                                 |
| `block-menu`    | `item` (`data-action`), `icon`, `label`                                                                                                                                                                                                       |
| `select`        | `option` (`data-value`, `aria-selected`, `data-active`), `option-label`, `option-check`; у кнопки — `select-value`, `select-chevron`                                                                                                          |

Инлайн-форматирование внутри `content` — обычные теги `strong`, `em`, `u`, `s`, `code`, `a`. В блоке кода текст
разбит на `<span data-inkbrick-token="keyword|string|comment|…">` (см. [подсветку кода](code-highlighting.md)).

Атрибуты `data-testid`, `data-action`, `data-format`, `data-slash-item` по-прежнему стабильны и годятся для тестов.
Классы (`.block-callout`, `.inkbrick-toolbar__button`, …) оставлены в разметке для совместимости, но стандартные стили
на них не опираются и в будущем они могут исчезнуть: используйте атрибуты.

## Свои стили

```css
/* заголовки второго уровня крупнее и акцентные */
[data-inkbrick-block='heading'][data-level='2'] [data-inkbrick-part='content'] {
  font-size: 2rem;
  color: tomato;
}

/* выбранный пункт slash-меню */
[data-inkbrick-ui='slash-menu'] [data-inkbrick-part='item'][data-active] {
  background: lavender;
}

/* предупреждающий callout */
[data-inkbrick-block='callout'][data-tone='warning'] {
  border-style: dashed;
}

/* выполненная задача не зачёркивается */
[data-inkbrick-block='list'][data-checked='true'] [data-inkbrick-part='content'] {
  text-decoration: none;
}
```

### Почему ваши правила всегда побеждают

- Все стандартные стили лежат в слоях `@layer inkbrick.tokens, inkbrick.base, inkbrick.blocks, inkbrick.ui`. Правила вне слоёв
  сильнее любых слоёвых правил независимо от специфичности и порядка подключения.
- Каждый селектор стандартных стилей обёрнут в `:where(…)` — специфичность 0. Правило в вашем собственном
  слое, объявленном позже (`@layer inkbrick.tokens, inkbrick.base, inkbrick.blocks, inkbrick.ui, app;`), тоже побеждает.
- `!important` в стандартных стилях не используется (это проверяет тест `packages/styles/__tests__/contract.test.ts`).

## Тема и токены

Цвета, радиусы, тени, шрифты — переменные `--inkbrick-*` (значения из Fluent 2 / Windows 11).

- Тема по умолчанию следует `prefers-color-scheme`. Принудительно: `data-inkbrick-theme="light"` или `"dark"` на любом
  элементе, например на `<html>`.
- Переопределение — обычной переменной: `:root { --inkbrick-brand-bg: #107c10; --inkbrick-radius-surface: 12px; }`.

| Группа                   | Токены                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Текст                    | `--inkbrick-fg-1`…`-4`, `--inkbrick-fg-disabled`, `--inkbrick-fg-on-brand`                                                                        |
| Фоны                     | `--inkbrick-bg-1` (поверхности)…`-4`, `--inkbrick-bg-hover`, `-pressed`, `-selected`                                                              |
| Рамки                    | `--inkbrick-stroke-1`…`-3`, `--inkbrick-stroke-accessible`, `--inkbrick-stroke-focus-1/2`                                                         |
| Акцент                   | `--inkbrick-brand-bg`, `-hover`, `-pressed`, `--inkbrick-brand-fg`, `--inkbrick-brand-link`                                                       |
| Статусы                  | `--inkbrick-status-{info,warning,success,danger}-{fg,bg,border}`                                                                                  |
| Форма                    | `--inkbrick-radius-control` (4px), `--inkbrick-radius-surface` (8px), `--inkbrick-shadow-4/8/16`                                                  |
| Типографика              | `--inkbrick-font-family`, `--inkbrick-font-mono`, `--inkbrick-font-size`, `--inkbrick-font-size-ui`, `--inkbrick-line-height`                     |
| Подсветка кода           | `--inkbrick-syntax-{keyword,string,comment,number,function,type,constant,builtin,variable,property,tag,attribute,meta,regex}`                     |
| Цвета текста и подсветки | `--inkbrick-color-<имя>`, `--inkbrick-highlight-<имя>` (имена палитры: black, white, gray, brown, orange, yellow, green, blue, purple, pink, red) |
| Прочее                   | `--inkbrick-icon-size`, `--inkbrick-space-block`, `--inkbrick-duration-*`, `--inkbrick-curve`, `--inkbrick-z-*`                                   |

Прежние имена (`--inkbrick-bg-surface`, `--inkbrick-text-primary`, `--inkbrick-accent-color`, …) продолжают работать как псевдонимы.

Подключать можно по частям: `@inkbrick/styles/tokens.css`, `base.css`, `blocks.css`, `ui.css`.

## Иконки

Иконки — набор [Lucide](https://lucide.dev) (лицензия ISC, текст в `packages/react/src/icons/ICONS_LICENSE.md`).
Компонент `Icon` доступен и для ваших пунктов меню:

```tsx
import { Icon } from '@inkbrick/react';

const items = [
  { id: 'bookmark', title: 'Bookmark', flavour: 'block:paragraph', icon: <Icon name="info" /> },
];
```

Размер задаёт `--inkbrick-icon-size` (по умолчанию 16px), цвет — текущий цвет текста. Заменить иконку конкретного места
можно, передав в `icon` свой элемент; свой значок callout (`props.icon`) по-прежнему может быть эмодзи.
