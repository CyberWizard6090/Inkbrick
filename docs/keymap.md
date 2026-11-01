# Клавиатурные сочетания (keymap)

Все сочетания редактора описаны данными — списком привязок `KeyBinding`. Стандартный список —
`defaultKeymap` из `@inkbrick/react`; свои привязки передаются в `<EditorProvider keymap={…}>`.

```tsx
import { EditorProvider, unbind, type KeyBinding } from '@inkbrick/react';

const keymap: KeyBinding[] = [
  // новая привязка: проверяется раньше стандартных
  { id: 'save', keys: 'Mod-s', run: ({ editor }) => save(editor) },
  // тот же id, что у стандартной: заменяет её
  { id: 'format.strike', keys: 'Mod-Alt-s', run: ({ toggleFormat }) => toggleFormat('strike') },
  // отключить стандартную
  unbind('format.code'),
];

<EditorProvider editor={editor} keymap={keymap}>
  …
</EditorProvider>;
```

Держите массив стабильным (вынесите из компонента или оберните в `useMemo`).

## Формат сочетаний

`'Mod-b'`, `'Mod-Shift-z'`, `'Tab'`, `'Shift-Tab'`, `'ArrowDown'`, `'Escape'`.

- `Mod` — Ctrl **или** Cmd. Есть и точные `Ctrl`, `Meta`/`Cmd`, `Alt`/`Option`.
- Shift и Alt сравниваются **точно**: `'Tab'` не срабатывает на Shift+Tab, поэтому для обоих пишут `['Tab', 'Shift-Tab']`.
- Регистр клавиши не важен. Псевдонимы: `Esc`, `Space`, `Up`/`Down`/`Left`/`Right`, `Del`, `Return`.
- Буквы работают и на не-латинской раскладке: `Mod-b` срабатывает на русской «и» (сверяется физическая клавиша).
- `keys: []` отключает привязку.

## Привязка

| Поле   | Назначение                                                                                                       |
| ------ | ---------------------------------------------------------------------------------------------------------------- |
| `id`   | Уникальное имя; совпадение с `id` стандартной привязки заменяет её на её месте                                   |
| `keys` | Одна комбинация или список                                                                                       |
| `when` | Условие применимости (необязательно)                                                                             |
| `run`  | Обработчик. `false` — «не моё»: событие идёт к следующей привязке и в браузер. Иначе вызывается `preventDefault` |

Обработчик получает `KeymapContext`: `editor`, `view`, `root`, `event`, `selection()`, `exec(intent)`,
`run(action)` (синхронное изменение с возвратом курсора), `replaceSelection`, `undo()`, `redo()`, `toggleFormat(format)`.

События из полей ввода, кнопок и элементов с `data-inkbrick-ignore-input` в keymap не попадают.

## Стандартные привязки

| id                                              | Сочетания                  | Действие                                               |
| ----------------------------------------------- | -------------------------- | ------------------------------------------------------ |
| `slash.next` / `slash.previous`                 | ↓ / ↑                      | Навигация по открытому slash-меню                      |
| `slash.accept`                                  | Enter, Tab (и с Shift)     | Выбрать пункт; если пунктов нет — закрыть и продолжить |
| `slash.close`                                   | Esc                        | Закрыть slash-меню                                     |
| `selectAll`                                     | Mod-a                      | Выделить весь текст документа                          |
| `undo` / `redo`                                 | Mod-z / Mod-Shift-z, Mod-y | История                                                |
| `link`                                          | Mod-k                      | Ссылка на выделении                                    |
| `format.bold` / `italic` / `underline` / `code` | Mod-b / i / u / e          | Форматирование                                         |
| `format.strike`                                 | Mod-Shift-x                | Зачёркивание                                           |
| `align.left` / `center` / `right` / `justify`   | Mod-Shift-l / e / r / j    | Выравнивание текста блоков выделения                   |
| `formula.inline`                                | Mod-Shift-m                | Вставить встроенную формулу (окошко кода)              |
| `indent`                                        | Tab / Shift-Tab            | Отступ в коде, вложение и подъём пунктов списка        |
| `delete.blockStart` / `delete.blockEnd`         | Backspace / Delete         | Склейка с соседним блоком на границе блока             |

`delete.blockStart` и `delete.blockEnd` срабатывают только на границе блока (каретка в начале или в конце, без
выделения, не во время IME-композиции): Safari на границе не присылает `beforeinput`, поэтому склейка блоков
выполняется уже на `keydown`. Внутри текста Backspace и Delete идут обычным путём через `beforeinput`.

Привязки `slash.*` стоят первыми и действуют, только пока меню открыто (`when`). Перемещение курсора стрелками
не привязка, а граница шага истории: оно всегда запечатывает undo-шаг, если его не перехватила привязка.

Копирование/вставка (`useClipboard`) и клавиши меню блока пока обрабатываются отдельно и в keymap не входят.
