# Стилизация

Разметка редактора — публичный API стилизации. Каждый блок и каждая его часть получают предсказуемые
`data-`атрибуты, и любой вид настраивается обычным CSS, без заранее заведённых токенов и без `!important`.
Так устроены Radix и BlockNote.

```ts
import '@inkbrick/styles'; // стандартный вид; без этого редактор остаётся «голым» и стилизуется целиком вами
```

## Атрибуты

| Атрибут               | Где                     | Значения                                                                                                            |
| --------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `data-inkbrick-root`  | корень документа        | —                                                                                                                   |
| `data-inkbrick-block` | корень блока            | `page`, `note`, `paragraph`, `heading`, `list`, `quote`, `code`, `divider`, `callout`, `image`, `unknown`           |
| `data-inkbrick-part`  | часть блока или оверлея | см. таблицу ниже                                                                                                    |
| `data-inkbrick-ui`    | оболочка редактора      | `slash-menu`, `toolbar`, `context-menu`, `table-controls`, `block-handle`, `block-menu`, `drop-indicator`, `select` |
| `data-inkbrick-icon`  | иконка (svg)            | имя иконки: `bold`, `plus`, `trash`, …                                                                              |
| `data-block-id`       | корень блока            | id блока                                                                                                            |

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

| Блок / оверлей   | Части                                                                                                                                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| любой с текстом  | `content` (редактируемый текст)                                                                                                                                                                                                               |
| `list`           | `row`, `marker`, `checkbox`, `children`                                                                                                                                                                                                       |
| `code`           | `toolbar`, `collapse`, `language`, `summary`, `spacer`, `caption-toggle`, `copy`, `body`, `body-inner`, `caption-row`, `caption`                                                                                                              |
| `callout`        | `icon` (кнопка смены тона)                                                                                                                                                                                                                    |
| `divider`        | `rule`                                                                                                                                                                                                                                        |
| `image`          | `figure`, `image`, `caption`, `tools`, `tool`, `width`, `alt`, `picker`, `picker-head`, `picker-icon`, `picker-text`, `picker-title`, `picker-hint`, `picker-upload`, `picker-row`, `picker-input`, `picker-button`, `picker-error`, `status` |
| `table`          | `grid` (`<table>`); строки — `table-row`, ячейки — `table-cell` (`data-align`)                                                                                                                                                                |
| `unknown`        | `message`                                                                                                                                                                                                                                     |
| `slash-menu`     | `item`, `icon`, `body`, `title`, `description`, `empty`                                                                                                                                                                                       |
| `toolbar`        | `button` (`data-format`), `separator`, `link-form`, `input`                                                                                                                                                                                   |
| `block-handle`   | `button` (`data-action="add"`), `grip` (`data-action="grip"`)                                                                                                                                                                                 |
| `block-menu`     | `item` (`data-action`), `icon`, `label`                                                                                                                                                                                                       |
| `context-menu`   | `item` (`data-action`: `cut`, `copy`, `paste`, `selectAll`), `icon`, `shortcut`, `separator`; кнопки форматирования — `toolbar` с `data-placement="inline"`                                                                                   |
| `table-controls` | `row-grip`, `column-grip`, `add-row`, `add-column`, `resize` (по одной на границу столбца)                                                                                                                                                    |
| `select`         | `option` (`data-value`, `aria-selected`, `data-active`), `option-label`, `option-check`; у кнопки — `select-value`, `select-chevron`                                                                                                          |

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

## Ширина страницы (временное решение)

Корень редактора занимает весь контейнер, а текст стоит колонкой по центру шириной `--inkbrick-page-width`; по умолчанию она
`100%`, то есть вся ширина, как раньше:

```css
.my-editor {
  --inkbrick-page-width: 720px;
}
```

Поля по бокам принадлежат редактору: клик в них ставит курсор. Если поля уже полосы ручки блока (`--inkbrick-gutter`), остаётся
полоса. **Это временное решение:** пока в документе нет страницы с собственным размером, ширина задаётся переменной; когда она
появится, переменную заменит настройка страницы.

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
| Прочее                   | `--inkbrick-icon-size`, `--inkbrick-space-block`, `--inkbrick-gutter`, `--inkbrick-duration-*`, `--inkbrick-curve`, `--inkbrick-z-*`              |
| Плавное появление        | `--inkbrick-appear-duration` (100ms; `0ms` выключает), `--inkbrick-appear-shift` (4px), `--inkbrick-disappear-duration` (100ms; `0ms` выключает)  |

Прежние имена (`--inkbrick-bg-surface`, `--inkbrick-text-primary`, `--inkbrick-accent-color`, …) продолжают работать как псевдонимы.

Подключать можно по частям: `@inkbrick/styles/tokens.css`, `base.css`, `blocks.css`, `ui.css`.

### Плавное появление

Как в Notion, ручка блока при появлении проявляется и чуть выезжает слева (`@keyframes inkbrick-handle-in`), линия вставки при
переносе проявляется (`inkbrick-fade-in`), а переносимый блок притухает до 0.4, а не мигает. Slash-меню, меню блока и
контекстное меню проявляются и чуть выезжают от каретки, ручки или точки клика (`inkbrick-menu-in`, а если меню открылось над ней,
то снизу, `inkbrick-menu-in-up`; сторона видна по атрибуту `data-side="top|bottom"` меню). Плавающий toolbar поднимается снизу
над выделением и опускается сверху под ним (`inkbrick-toolbar-in`, `inkbrick-toolbar-in-down`; `data-placement="above|below"`): его
положение задаёт встроенный `transform`, поэтому движение идёт через отдельное свойство `translate`, и рывка нет. Toolbar внутри
контекстного меню (`data-placement="inline"`) сам не анимируется. Палитра команд: затемнение проявляется (`inkbrick-fade-in`), а окно
опускается на сдвиг сверху (`inkbrick-slide-down`; только сдвиг, без прозрачности: иначе она перемножилась бы с прозрачностью затемнения).
Панель поиска выезжает сверху так же, как меню (`inkbrick-menu-in`); набор запроса её не перезапускает. Так же появляются попап формулы, список
вариантов в ячейке таблицы и подсказки тегов, а диалог свойств столбца — как палитра (затемнение проявляется, окно опускается). Переход ручки от блока к блоку анимацию не запускает: это тот же узел;
меню анимируется при открытии, а не при каждой набранной букве запроса. Длительность и сдвиг задают токены `--inkbrick-appear-duration` и
`--inkbrick-appear-shift`; `--inkbrick-appear-duration: 0ms` выключает движение. При `prefers-reduced-motion: reduce` анимации
и переходы отключены. Всё это обычный CSS в слое `inkbrick.ui` и `inkbrick.blocks`: любое ваше правило победит без `!important`,
например `[data-inkbrick-ui='block-handle'] { animation: none }`.

#### Плавное исчезновение

Окна не просто пропадают: когда они закрываются, они гаснут за `--inkbrick-disappear-duration` (`@keyframes inkbrick-fade-out`).
Это относится к ручке блока и меню блока, линии вставки, slash-меню, контекстному меню, toolbar, палитре, панели поиска, попапу
формулы, диалогу свойств столбца, списку вариантов в ячейке, подсказкам тегов и выпадающему списку `select`. Исчезающее окно
остаётся в DOM, пока анимация не закончится, и тогда удаляется: этим занимается небольшой компонент `Presence`. Он оборачивает окно
в элемент `<div data-inkbrick-presence data-state="open|closed">` с `display: contents`, так что на раскладку обёртка не влияет, а
у закрывающегося окна `data-state="closed"`, `aria-hidden="true"` и `pointer-events: none`.

- **Без анимации окно удаляется сразу, как раньше:** при `prefers-reduced-motion: reduce`, при `--inkbrick-disappear-duration: 0ms`,
  без стилей пакета (в тестах на jsdom, например) и у своего компонента из слота, у которого на корне нет анимации.
- **Если окно открыли снова, пока оно уходит,** оно создаётся заново (снова играет появление и срабатывают эффекты монтирования, например фокус
  в списке); ручка блока и линия вставки при этом остаются тем же узлом, поэтому не мигают.
- **Свой компонент из слота** получает плавный выход одним правилом на корне: например
  `[data-inkbrick-presence][data-state='closed'] > .my-menu { animation: my-fade-out 120ms forwards }`. Анимация обязана заканчиваться
  (`forwards`, без `infinite`): когда она закончится, окно удалится.
- В тестах пользователя элемент закрытого окна может ещё какое-то время быть в DOM: проверяйте исчезновение через `toHaveCount(0)` /
  `waitFor`, а не мгновенным `count()`.

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
