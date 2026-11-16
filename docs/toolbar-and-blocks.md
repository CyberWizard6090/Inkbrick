# Toolbar, контекстное меню, ссылки, меню блока и перетаскивание

## Где показывается форматирование

Опция `formatting` у `<EditorProvider>`:

| Значение                        | Что видит пользователь                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `'context-menu'` (по умолчанию) | кнопки форматирования — в контекстном меню по правому клику; плавающего toolbar нет |
| `'toolbar'`                     | плавающий toolbar над выделением, контекстное меню — браузерное                     |
| `'both'`                        | и то и другое                                                                       |

Режим по умолчанию нужен потому, что многие браузеры на десктопе (Яндекс Браузер, Edge) показывают над выделением
своё меню, и оно закрывает плавающий toolbar; отключить его со страницы нельзя. На сенсорном экране правого клика нет,
а долгое нажатие открывает системное меню выделения, поэтому после касания пальцем toolbar показывается в любом режиме
(под выделением). `Ctrl/Cmd+K` открывает поле ссылки у выделения тоже в любом режиме.

```tsx
<EditorProvider editor={editor} formatting="toolbar">
```

## Контекстное меню

Правый клик в документе открывает меню (`data-inkbrick-ui="context-menu"`): сверху — те же кнопки, что в toolbar
(если выделен текст, который можно форматировать), ниже — «Вырезать», «Копировать», «Вставить» и «Выделить всё».
Кнопки форматирования не закрывают меню, пункты буфера — закрывают. Меню закрывают `Esc`, клик снаружи, прокрутка,
смена размера окна. `↑/↓` переходят между пунктами, клавиша меню и `Shift+F10` открывают его у выделения.

- Вырезать и копировать — то же, что `Ctrl+X`/`Ctrl+C`: в буфер попадают текст, HTML и формат Inkbrick.
- «Вставить» читает буфер через Clipboard API (браузер может спросить разрешение) и вставляет так же, как
  `Ctrl+V`. Где Clipboard API недоступен, пункт отключён.
- Меню браузера остаётся для `Shift+правого клика`, касания пальцем, полей ввода, ссылок, картинок и других блоков
  без текста.

Свой вид — слот `ContextMenu`; `slots.ContextMenu = null` оставляет меню браузера и возвращает плавающий toolbar.

## Плавающий toolbar форматирования

В режимах `'toolbar'` и `'both'` (и после касания пальцем) появляется над непустым выделением (в том числе из нескольких блоков), пока кнопка мыши не зажата. Кнопки:
**B**, _I_, <u>U</u>, ~~S~~, `</>`, ссылка, формула (Σ), цвет текста, подсветка и четыре кнопки выравнивания
(см. [цвет и выравнивание](text-style.md), [формулы](formulas.md)); нажатые кнопки подсвечены (`aria-pressed`), если формат действует на
**весь** выделенный текст. В блоке кода toolbar не показывается. Горячие клавиши работают и без него.

### Превратить в

Слева на панели (и на её копии в контекстном меню) стоит кнопка с названием типа блока, например «Text ▾». Она раскрывает список
типов, в которые блок можно превратить: те же пункты, что в меню вставки (`/`), в том же порядке групп. Текущий тип отмечен.
Превращение — один шаг undo, выделение остаётся на тексте. Показываются только допустимые типы (движок проверяет схему и
вложенность через `editor.can('convertBlock', …)`); если превращать некуда, кнопки нет. Нет её и при выделении из нескольких блоков.
Для своего `Toolbar` список приходит в `turnInto` (`{ title, options: [{ id, title, icon, active, run }] }`).

В меню блока (ручка) тот же список лежит под подписью «Превратить в».

### Ссылки

`Ctrl/Cmd+K` или кнопка 🔗 открывает поле адреса (в нём — текущая ссылка выделения). `Enter` применяет, `Esc` отменяет,
✕ снимает ссылку. Ввод нормализуется: `example.com` → `https://example.com`, `me@site.org` → `mailto:me@site.org`.
Допустимы только `http(s)`, `mailto`, `tel`, относительные пути и якоря — `javascript:`, `data:` и подобное отклоняются
**на уровне движка** (команда `setInlineAttributes` не выполняется), поэтому небезопасная ссылка не попадёт в документ
даже из кода. `Ctrl/Cmd+клик` по ссылке открывает её в новой вкладке; обычный клик просто ставит курсор.

```ts
editor.dispatch({
  type: 'setInlineAttributes',
  payload: { from, to, attributes: { link: 'https://example.com' } }, // link: undefined — снять
});
editor.formatsAt(from, to); // { bold, italic, underline, strike, code, link? } — что действует на весь диапазон
```

## Ручка блока, меню и перетаскивание

При наведении на блок слева появляется ручка: **«+»** (вставить блок ниже и сразу открыть slash-меню) и
**хваталка ⋮⋮**. Ручка стоит внутри документа — в полосе слева от текста (внутренний отступ корня,
`--inkbrick-gutter`, 56px; справа такой же, текст стоит по центру), поэтому её не обрезает контейнер с `overflow: hidden` и не нужны поля вокруг редактора.
Ручка скрывается при наборе текста и когда блок исчез из документа. На сенсорном экране наведения нет: ручка
появляется у блока, которого коснулись. На узком экране (до 640px) полосы нет, и ручка ложится поверх начала строки
плашкой с подложкой (`data-compact`); так же она ведёт себя, если `--inkbrick-gutter` меньше ширины ручки.

| Действие с хваталкой                    | Результат                                                                           |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| клик, касание (или `Enter`/`Space`)     | меню: Duplicate, Move up, Move down, Delete и «Turn into»                           |
| протянуть мышью                         | блок переносится вместе с потомками; линия показывает место вставки; `Esc` отменяет |
| долгое нажатие пальцем (350 мс) и вести | то же; сдвиг пальца до долгого нажатия отменяет жест                                |

Меню управляется с клавиатуры: `↑/↓` — выбор, `Enter` — выполнить, `Esc` — закрыть. Недоступные действия
(например, «Move up» у первого блока) отключены. Каждое действие и каждый перенос — **один шаг undo**.

Правила (команда `moveBlock` / `duplicateBlock`):

- блок нельзя перенести в собственное поддерево или туда, где схема не допускает такой тип;
- «после» цели — после всего её поддерева (вместе с вложенными блоками);
- блоки верхнего уровня страницы (заметка) не переносятся и не дублируются;
- блоки неизвестного типа можно только удалить;
- если удалить последний блок заметки, появляется пустой параграф;
- «+» рядом с вложенным пунктом списка создаёт ещё один пункт — параграф не «проваливается» внутрь списка.

`editor.can(type, payload)` проверяет, выполнится ли команда, не меняя документ.

На хваталке стоит `touch-action: none`, поэтому палец на ней не прокручивает страницу, а долгое нажатие не открывает
системное меню. У края окна страница прокручивается сама.

## Своя система перетаскивания

Встроенный перенос построен на публичном API `useBlockDrag()`; на нём же подключается любая своя система
(dnd-kit, pragmatic-drag-and-drop, свои pointer events) — без правки Inkbrick.

```ts
const drag = useBlockDrag(); // внутри <EditorProvider>, стабильный объект

drag.blockAtPoint(x, y); // блок с ручкой под точкой окна (полоса слева от текста тоже считается)
drag.blockRects(blockId); // { row, box }: строка блока и весь блок с вложенными
drag.canMove(blockId, targetId, 'before'); // = editor.can('moveBlock', …): схема, вложенность, глубина
drag.dropTargetAt(blockId, x, y); // { targetId, position, side?, indicator } или null; side — у края блока, если подключены колонки

drag.start(blockId); // начать: закрыть меню, затемнить блок, отключить выделение текста
drag.update(x, y); // найти цель под точкой, нарисовать линию, прокрутить у края окна
drag.setTarget(target); // или задать цель самому (недопустимую API отбросит)
drag.drop(); // перенести к текущей цели одним шагом undo → true/false
drag.cancel(); // отменить без изменений
drag.move(blockId, targetId, 'after'); // перенос без жеста, один шаг undo
drag.moveToSide(blockId, targetId, 'right'); // блок встаёт рядом, в колонки (нужны columnsBlocks)

useBlockDragState(); // текущий перенос { blockId, targetId, position, side?, indicator } или null
```

Линию места вставки рисует редактор по состоянию API — и для встроенного, и для своего переноса, даже при
`slots.BlockHandle = null`. Свой вид линии — `slots.DropIndicator` (props: `blockId`, `targetId`, `position`,
`indicator: { left, top, width }` в координатах окна), `null` — не рисовать.

### Минимальная своя реализация

Своя ручка не вешает `gripProps` (встроенный жест) и сама решает, что считать переносом:

```tsx
import { useRef } from 'react';
import { DocumentView, EditorProvider, useBlockDrag, type BlockHandleProps } from '@inkbrick/react';

function SimpleHandle({ blockId, position, onOpenMenu }: BlockHandleProps) {
  const drag = useBlockDrag();
  const start = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      data-inkbrick-block-ui
      style={{ position: 'fixed', left: position.x - 28, top: position.y }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <button
        type="button"
        style={{ touchAction: 'none' }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          start.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerMove={(event) => {
          const from = start.current;

          if (!from) return;
          if (!drag.getState() && Math.hypot(event.clientX - from.x, event.clientY - from.y) > 5)
            drag.start(blockId);
          if (drag.getState()) drag.update(event.clientX, event.clientY);
        }}
        onPointerUp={() => {
          start.current = null;
          if (drag.getState()) drag.drop();
          else onOpenMenu();
        }}
        onPointerCancel={() => {
          start.current = null;
          drag.cancel();
        }}
      >
        ⋮⋮
      </button>
    </div>
  );
}

export const Editor = () => (
  <EditorProvider editor={editor} slots={{ BlockHandle: SimpleHandle }}>
    <DocumentView />
  </EditorProvider>
);
```

### dnd-kit

Хваталка — `useDraggable`, мост из событий dnd-kit в API Inkbrick — `useDndMonitor`. Контекст React проходит
через портал ручки, поэтому `DndContext` достаточно обернуть вокруг `EditorProvider`:

```tsx
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useDndMonitor,
  useDraggable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { DocumentView, EditorProvider, useBlockDrag, type BlockHandleProps } from '@inkbrick/react';

function DndKitHandle({ blockId, position, onOpenMenu }: BlockHandleProps) {
  const { setNodeRef, listeners, attributes } = useDraggable({ id: blockId });

  return (
    <div
      data-inkbrick-block-ui
      style={{ position: 'fixed', left: position.x - 28, top: position.y }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <button
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        onClick={onOpenMenu}
        style={{ touchAction: 'none' }}
      >
        ⋮⋮
      </button>
    </div>
  );
}

/** Переводит события dnd-kit в API переноса Inkbrick. */
function InkbrickDndBridge() {
  const drag = useBlockDrag();
  const point = (event: Event) =>
    'touches' in event ? (event as TouchEvent).touches[0] : (event as PointerEvent);

  useDndMonitor({
    onDragStart: ({ active }) => drag.start(String(active.id)),
    onDragMove: ({ activatorEvent, delta }) => {
      const from = point(activatorEvent);
      drag.update(from.clientX + delta.x, from.clientY + delta.y);
    },
    onDragEnd: () => drag.drop(),
    onDragCancel: () => drag.cancel(),
  });

  return null;
}

export function App() {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
  );

  return (
    <DndContext sensors={sensors}>
      <EditorProvider editor={editor} slots={{ BlockHandle: DndKitHandle }}>
        <InkbrickDndBridge />
        <DocumentView />
      </EditorProvider>
    </DndContext>
  );
}
```

С pragmatic-drag-and-drop схема та же: `draggable({ element: grip })` в своей ручке, а в `monitorForElements` —
`onDragStart → drag.start(id)`, `onDrag → drag.update(location.current.input.clientX, location.current.input.clientY)`,
`onDrop → drag.drop()`. Если ручки не нужны вовсе (`slots.BlockHandle = null`), перенос можно запускать откуда угодно
внутри `EditorProvider`: `useBlockDrag()` работает и без них.

## Слоты

```tsx
<EditorProvider
  editor={editor}
  slots={{
    Toolbar: MyToolbar, // или null — без toolbar и без кнопок форматирования в контекстном меню
    ContextMenu: MyContextMenu, // или null — меню браузера
    BlockHandle: MyHandle, // или null — без ручек, меню и встроенного перетаскивания
    BlockMenu: MyMenu,
    DropIndicator: MyLine, // или null — без линии места вставки
  }}
/>
```

| Слот            | Props                                                                                                                                                                                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Toolbar`       | `formats` (в том числе `color`, `backgroundColor`, `align`), `position`, `placement` (`'floating'` или `'inline'` — внутри контекстного меню), `linkOpen`, `panel`, `onToggle(format)`, `onOpenLink()`, `onApplyLink(url \| null) → boolean`, `onCancelLink()`, `onTogglePanel(panel)`, `onApplyColor(kind, value \| null)`, `onAlign(align)`, `onInsertFormula()` |
| `ContextMenu`   | `position`, `formatting` (готовые кнопки форматирования — `Toolbar` с `placement: 'inline'` — или `null`), `items` (у каждого `id`, `title`, `icon`, `shortcut`, `disabled`, `run()`), `onClose()`                                                                                                                                                                 |
| `BlockHandle`   | `blockId`, `position`, `canAdd`, `dragging`, `menuOpen`, `onAdd()`, `onOpenMenu()`, `gripProps` (встроенный жест: повесьте на хваталку или замените своим DnD)                                                                                                                                                                                                     |
| `BlockMenu`     | `block`, `position`, `actions`, `turnInto`, `onClose()` — у каждого действия есть `title`, `icon`, `disabled`, `danger`, `run()`                                                                                                                                                                                                                                   |
| `DropIndicator` | `blockId`, `targetId`, `position`, `indicator` (`left`, `top`, `width` в координатах окна)                                                                                                                                                                                                                                                                         |

Компоненты только рисуют: выделение, клавиатуру, команды и drag-логику ведёт редактор. Корневой элемент
плавающего UI должен гасить `mousedown` (`onMouseDown={e => e.preventDefault()}`), иначе клик уведёт фокус из редактора;
элементы меню и ручки помечайте атрибутом `data-inkbrick-block-ui`, чтобы редактор не считал клик по ним кликом «снаружи».
