# Настройка UI и пользовательские блоки

Модель документа (`@inkbrick/document`) не знает о React. Внешний вид задаётся в `@inkbrick/react`
и **никогда не попадает в сериализованный документ**.

## 1. Заменить представление встроенного блока

```tsx
import { DocumentView, EditorProvider, Editable, type BlockViewProps } from '@inkbrick/react';
import { Editor } from '@inkbrick/engine';

function UIParagraph({ block }: BlockViewProps) {
  return (
    <p className="my-paragraph">
      <Editable block={block} />
    </p>
  );
}

// Объект держите стабильным (на уровне модуля или в useMemo).
const components = { 'block:paragraph': UIParagraph };
const editor = new Editor();

<EditorProvider editor={editor} components={components}>
  <DocumentView />
</EditorProvider>;
```

Порядок выбора компонента для блока:

1. `components[flavour]` — компонент приложения;
2. стандартный компонент Inkbrick (`defaultBlockComponents`);
3. fallback `UnknownBlock` (см. ниже).

Без `components` редактор работает как раньше. Можно задать только часть блоков.
Два редактора на одной странице используют собственные наборы компонентов независимо.

## 2. Контракт компонента блока

```ts
interface BlockViewProps {
  readonly block: BaseBlock; // данные блока, только для чтения
  readonly editor: Editor; // изменения — только через editor.dispatch(...)
  readonly selected: boolean; // блок затронут непустым выделением
  readonly readOnly: boolean; // режим только чтения: не предлагайте редактирование
  readonly controller?: BlockController; // контроллер типа блока (раздел 10)
}
```

- **Не мутируйте `block`.** Меняйте документ командами:
  `editor.dispatch({ type: 'setBlockProps', payload: { blockId, props } })`.
- Для редактируемого текста используйте `<Editable block />` (общая подсказка про «/» показывается сама; свою можно задать пропом `placeholder`): это текстовая область блока —
  ввод, выделение, Enter/Backspace, вставку и форматирование обрабатывает корень `<DocumentView>` (см. [выделение](selection.md)).
- Свои `<input>`, `<textarea>`, `<button>` внутри компонента работают как обычно: редактор не перехватывает их события.
  Для произвольного нередактируемого виджета добавьте `contentEditable={false}` (и `data-inkbrick-ignore-input`, если в нём нужен свой ввод). Обычный `<p>{text}</p>` текст не редактирует.
- Дочерние блоки выводит `<BlockChildren id={block.id} />`.
- Поведение блока (свои команды, хуки, пункты меню, клавиши) задаёт контроллер — см. раздел 10.

## 3. Slots (оболочка редактора)

```tsx
<EditorProvider editor={editor} slots={{ UnknownBlock: MyUnknownBlock }} />
```

Доступные слоты: `UnknownBlock` (заглушка неизвестного блока), `SlashMenu` (см. [slash-меню](slash-menu.md)), `Toolbar`,
`BlockHandle` (ручка слева от блока), `BlockMenu` и `DropIndicator`. `null` для `Toolbar`, `BlockHandle` и `DropIndicator` отключает
соответствующий элемент.

## 4. Новый тип блока

Схема данных живёт в модели, представление — в React:

```tsx
import { z, type BlockSchema } from '@inkbrick/document';

const calloutProps = z.object({ tone: z.enum(['info', 'warn']).default('info') });

export const CalloutSchema: BlockSchema<typeof calloutProps> = {
  flavour: 'app:callout',
  name: 'Callout',
  icon: 'info',
  propsSchema: calloutProps,
  allowedParents: ['block:note'], // правила вложенности
  allowedChildren: [],
  commands: [],
  shortcuts: [],
  rendererHint: 'callout',
};

const editor = new Editor({ blocks: [CalloutSchema] });
editor.dispatch({
  type: 'insertBlock',
  payload: { flavour: 'app:callout', afterId: someBlockId },
});

<EditorProvider editor={editor} components={{ 'app:callout': CalloutView }} />;
```

Имя `block:callout` занято встроенным блоком (тона `info | warning | success | danger`): для своих типов берите другой префикс, например `app:`. Встроенный блок меняется только своим представлением (раздел 1), а не новой схемой.

`z` экспортируется из `@inkbrick/document` — отдельная зависимость от zod в приложении не нужна.
Props проверяются схемой при создании и изменении блока; при ошибке транзакция откатывается.

Если редактор создаётся из готового документа, используйте общий реестр схем:

```ts
const schema = createSchemaRegistry([CalloutSchema]);
const document = deserializeDocument(snapshot, { schema });
const editor = new Editor({ schema, document });
```

## 5. Сохранение и загрузка

`serializeDocument(document)` возвращает обычный JSON (`{ rootId, blocks }`), `deserializeDocument`
проверяет целостность дерева и props известных блоков и бросает `DocumentValidationError`.

## 6. Неизвестные блоки

Если в документе есть блок с незарегистрированным `flavour`:

- рендерер показывает диагностический fallback с названием типа (и предупреждение в консоли);
- блок **не подменяется** другим типом, его данные при сохранении не теряются;
- команды редактора не меняют такой блок и не склеивают с ним текст; удалить его можно командой `delete-block`.

## 7. Presentation: визуальный слой одним объектом

Дизайн-систему удобно описать одним объектом и подключать к любому редактору. Модель документа и команды
от неё не зависят: компонент блока полностью заменяет его вид, не трогая схему и движок.

```tsx
import { definePresentation, EditorProvider, DocumentView } from '@inkbrick/react';

export const myDesignSystem = definePresentation({
  components: { 'block:paragraph': MyParagraph, 'block:callout': MyCallout },
  slots: { Toolbar: MyToolbar, BlockMenu: MyBlockMenu },
  slashItems: [myCalloutItem],
  highlighter: shikiHighlighter,
});

<EditorProvider editor={editor} presentation={myDesignSystem} components={myBlocks}>
  <DocumentView />
</EditorProvider>;
```

Отдельные props уточняют presentation: `components` и `slots` сливаются с ним (одинаковый ключ берётся
из prop), `slashItems`, `highlighter` и `formulaRenderer` заменяют значение целиком. Объект создавайте один раз
(вне компонента), иначе документ будет перерисовываться.

## 8. Доступность пользовательских блоков

- Компонент получает `readOnly`: в режиме чтения не показывайте элементы правки (чекбоксы, поля, кнопки).
- Кнопки и поля внутри блока — настоящие `<button>`/`<input>` с подписью (`aria-label`): редактор не
  перехватывает их ввод, а клавиатура и экранные чтецы работают как обычно.
- Поле документа озвучивается по `<DocumentView label="…" />` (по умолчанию — «Document» на языке интерфейса).
- Проверка: `tests/E2E/a11y.spec.ts` прогоняет axe по документу со всеми типами блоков, режиму чтения и меню.

## 9. Большие документы: виртуальный рендерер

По умолчанию `<DocumentView>` рисует всё дерево блоков. Это просто и предсказуемо, но на тысячах блоков
узким местом становятся DOM и React (модель линейна до 100 000 блоков, см. `pnpm bench`). Для таких документов
подключите виртуальный рендерер — модель, команды и ваши компоненты блоков при этом не меняются:

```tsx
import { DocumentView, virtualRenderer } from '@inkbrick/react';

// Создайте один раз, вне компонента.
const renderer = virtualRenderer({ threshold: 100, overscan: 1200 });

<DocumentView renderer={renderer} />;
// или с настройками по умолчанию:
<DocumentView renderer="virtual" />;
```

Как это работает:

- Каждый контейнер (страница, заметка, пункт списка с детьми), у которого не меньше `threshold` детей, выводит
  только блоки около видимой области (плюс `overscan` px сверху и снизу). Остальные заменены распорками
  `<div class="inkbrick-spacer" data-inkbrick-spacer contenteditable="false" aria-hidden="true">`. Короткие списки рисуются
  как обычно, и переход через порог не пересоздаёт блоки.
- Высота отрисованного блока измеряется (вместе с отступом до следующего, `ResizeObserver` ловит изменения);
  высота ещё не отрисованного — оценивается `estimateHeight` (по умолчанию `estimateBlockHeight`: строки текста,
  тип блока). Для своих стилей или типов блоков передайте свою оценку — от неё зависит только точность полосы
  прокрутки.
- Видимая область — пересечение окна и прокручиваемых предков редактора, так что работает и прокрутка страницы,
  и редактор внутри контейнера с `overflow: auto`.

Что редактор держит в DOM всегда, чтобы поведение не отличалось от обычного рендерера:

| Что                                | Зачем                                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| Первый и последний блок контейнера | `Ctrl/Cmd+A` выделяет весь документ, копирование и удаление берут все блоки модели |
| Блоки с кареткой и края выделения  | выделение не теряется при прокрутке; ввод возвращает к каретке                     |
| Перетаскиваемый блок и цель        | drag-and-drop ручками блоков                                                       |
| Блок, куда команда ставит каретку  | `view.placeCaret` / `placeSelection` (undo, вставка) сначала отрисовывают блок     |

Копирование, вырезание, удаление выделения и undo работают по модели, поэтому охватывают и неотрисованные блоки.
Свои контейнеры получают виртуализацию автоматически, если выводят детей через `<BlockChildren id>`.

Ограничения: поиск браузера (`Ctrl+F`) и экранные чтецы видят только отрисованные блоки; в Safari нет
CSS scroll anchoring, поэтому при прокрутке вверх по ещё не измеренным блокам возможен небольшой сдвиг.

Свой способ отрисовки — объект `DocumentRenderer` с компонентом `ChildList({ parentId, ids })`; стандартный —
`fullRenderer`. В песочнице: меню «Инструменты» → «Большой документ» (50 000 блоков).

## 10. Блок с поведением: `defineBlock` и контроллер

Пользовательский блок описывается одним объектом из трёх независимых частей:

| Часть        | Слой                           | Что задаёт                                                 |
| ------------ | ------------------------------ | ---------------------------------------------------------- |
| `schema`     | `@inkbrick/document`           | данные: flavour, props (zod), вложенность, поведение Enter |
| `controller` | `@inkbrick/engine` (без React) | поведение: хуки жизненного цикла, команды, меню, клавиши   |
| `component`  | `@inkbrick/react`              | вид: React-компонент с `BlockViewProps`                    |

Подключение не требует правки исходников Inkbrick: схема и контроллер передаются движку, компонент — провайдеру.

```tsx
import { z, type BlockSchema } from '@inkbrick/document';
import { Editor, defineBlockCommand, defineBlockController } from '@inkbrick/engine';
import {
  DocumentView,
  Editable,
  EditorProvider,
  defineBlock,
  useBlockController,
  type CustomBlockViewProps,
} from '@inkbrick/react';

type CounterProps = { count: number; step: number };

const schema: BlockSchema = {
  flavour: 'app:counter',
  name: 'Counter',
  icon: 'plus',
  propsSchema: z.object({
    count: z.number().int().min(0).default(0),
    step: z.number().int().min(1).default(1),
  }),
  allowedParents: ['role:hub'],
  allowedChildren: [],
  enter: { nextFlavour: 'block:paragraph' },
  commands: [],
  shortcuts: [],
  rendererHint: 'counter',
};

const controller = defineBlockController<CounterProps>({
  onInsert: ({ block }) => analytics.track('counter-added', block.id),
  onPropsChange: ({ block }, previous) => console.log(previous.count, '→', block.props.count),

  commands: [
    defineBlockCommand<CounterProps>({
      type: 'counter.increment',
      execute: ({ block, setProps }) => setProps({ count: block.props.count + block.props.step }),
    }),
    defineBlockCommand<CounterProps>({
      type: 'counter.reset',
      canExecute: ({ block }) => block.props.count !== 0,
      execute: ({ setProps }) => setProps({ count: 0 }),
    }),
  ],
  slashItems: [{ id: 'counter', title: 'Counter', keywords: ['count'], icon: 'plus' }],
  menuItems: [
    { id: 'counter.reset', title: 'Reset', run: ({ execute }) => execute('counter.reset') },
  ],
  keymap: [
    {
      id: 'counter.increment',
      keys: 'Alt-ArrowUp',
      run: ({ execute }) => void execute('counter.increment'),
    },
  ],
});

function CounterView({ block, readOnly }: CustomBlockViewProps<CounterProps>) {
  const counter = useBlockController<CounterProps>(block);

  return (
    <div className="block" data-block-id={block.id}>
      <span contentEditable={false}>
        <button disabled={readOnly} onClick={() => counter.execute('counter.increment')}>
          {block.props.count}
        </button>
      </span>
      <Editable block={block} placeholder="Подпись" />
    </div>
  );
}

export const counterBlock = defineBlock<CounterProps>({
  schema,
  component: CounterView,
  controller,
});

// Схема и контроллер — движку, компонент — провайдеру.
const editor = new Editor({ blocks: [counterBlock] });

<EditorProvider editor={editor} blocks={[counterBlock]}>
  <DocumentView />
</EditorProvider>;
```

Готовый пример — блок «счётчик» в песочнице: [`apps/sandbox/src/blocks/counter.tsx`](../apps/sandbox/src/blocks/counter.tsx)
(вставка через «/count», кнопки «−»/«+», пункт «Reset counter» в меню блока, Alt+↑/↓ в подписи; есть и в
примере документа из меню «Инструменты»).

### Хуки жизненного цикла

Все необязательны; каждый получает `BlockContext` — `{ editor, block, readOnly, execute, can }`.

| Хук             | Когда вызывается                                                                      |
| --------------- | ------------------------------------------------------------------------------------- |
| `onCreate`      | блок появился в редакторе: был в документе при создании `Editor` или вставлен правкой |
| `onInsert`      | блок вставлен правкой (команда, вставка, смена типа, undo удаления); после `onCreate` |
| `onRemove`      | блок удалён или сменил тип; `block` — состояние до удаления                           |
| `onPropsChange` | props изменились (команда, undo/redo); второй аргумент — прежние props                |
| `onFocus`       | каретка вошла в блок (в том числе когда блок под кареткой превратили в этот тип)      |
| `onBlur`        | каретка покинула блок (в том числе перед `onRemove`, если она была в нём)             |

- Хуки вызываются **после** того, как изменение применено и записано в историю, в том числе при undo/redo.
  Хук может выполнять команды (`execute`) — они станут отдельным шагом undo.
- Ошибка в хуке не ломает редактор: она сообщается через `reportError`, остальные хуки выполняются.
- Каретку отслеживает UI-слой: `<DocumentView>` сообщает о ней через `editor.controllers.setFocusedBlock(id)`.
  Каретка ставится только в текст, поэтому `onFocus`/`onBlur` получают блоки с `<Editable>`;
  у блока-«острова» без текста (`inline: false`) их не будет.

### Команды

`defineBlockCommand` описывает команду, которая регистрируется в `Dispatcher` редактора под своим `type`:

- payload всегда содержит `blockId`; команда выполняется только для блока своего flavour (для параграфа
  `editor.can('counter.increment', { blockId })` вернёт `false`);
- контекст команды — `{ engine, transaction, block, setProps }`; `setProps(patch)` проверяет props по схеме,
  при ошибке вся правка откатывается;
- `canExecute` — дополнительное условие (для `disabled` у кнопок и пунктов меню);
- имя, уже занятое другой командой, — ошибка при создании редактора.

Вызов: `editor.execute('counter.increment', { blockId })`; из хука или обработчика — `context.execute('counter.increment')`;
из компонента — `useBlockController(block).execute(...)` (`blockId` подставляется сам).

### Slash-меню, меню блока, клавиши

Контроллер описывает их без React: иконка — имя из набора Inkbrick (`IconName`), обработчики получают `BlockContext`.
`<EditorProvider>` читает их из `editor.controllers`:

- `slashItems` добавляются в конец стандартных пунктов; пункт приложения (prop `slashItems`) с тем же `id`
  заменяет пункт контроллера, `slashItems={false}` выключает меню целиком;
- `menuItems` показываются первыми в меню блока и только для блоков этого типа; по умолчанию недоступны
  в режиме только чтения (своё условие — `isDisabled`);
- `keymap` действует, только когда выделение начинается в блоке этого типа; привязки приложения проверяются раньше,
  привязка приложения с тем же `id` заменяет привязку контроллера.

### Режим только чтения

- Команды контроллера отклоняются диспетчером, как и встроенные: `execute` возвращает `undefined`, документ не меняется.
- Компонент получает `readOnly` в props — отключайте кнопки и поля сами.
- `BlockContext.readOnly` всегда показывает текущий режим редактора.

### Без `defineBlock`

Слои можно подключать по отдельности: схему — через `new Editor({ blocks: [schema] })` или готовый реестр
(`schema`), контроллер — через `new Editor({ controllers: { 'app:counter': controller } })` (так можно добавить
поведение и встроенному блоку), компонент — через `components`. `@inkbrick/engine` и `@inkbrick/document` от React не зависят.
