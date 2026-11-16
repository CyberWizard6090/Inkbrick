# Колонки

Блок `block:columns` ставит блоки рядом: внутри него колонки `block:column`, а в каждой колонке — обычные блоки (абзацы, списки,
заголовки, таблицы, картинки, код). Колонок от двух до шести. Для читающих и экспорта это обычная последовательность блоков.

## Подключение

Во встроенный набор колонки не входят. Один и тот же список передаётся и редактору, и провайдеру:

```tsx
import { Editor } from '@inkbrick/engine';
import { EditorProvider, DocumentView, columnsBlocks } from '@inkbrick/react';

const editor = new Editor({ blocks: columnsBlocks });

<EditorProvider editor={editor} blocks={columnsBlocks}>
  <DocumentView />
</EditorProvider>;
```

Вместе с другими: `blocks: [...tableBlocks, ...tocBlocks, ...columnsBlocks]`. Без React — `columnsBlocks` из `@inkbrick/engine`; только
схемы (проверить снимок на сервере) — `createSchemaRegistry(columnsBlockSchemas)` из `@inkbrick/document`.

## В редакторе

- В slash-меню два пункта: «2 колонки» и «3 колонки» (`/2 col`, `/колонки`).
- Разделитель между колонками тянется мышью (виден при наведении, в историю попадает один шаг) или стрелками влево и вправо; колонка
  не сжимается уже восьми процентов ширины.
- Справа сверху при наведении кнопки: «добавить колонку» (до шести), «убрать последнюю» и «развернуть в обычные блоки».
  У убранной колонки блоки переходят в соседнюю, ничего не теряется; когда колонок остаётся одна, колонки разворачиваются.
- Блоки между колонками переносятся ручкой блока, как между любыми блоками. Курсор ходит по колонкам обычным образом.
- Колонка — неделимая часть: её нельзя удалить, склеить или перенести отдельно; Backspace в начале первого блока ничего не делает, удаление
  последнего блока колонки оставляет пустой абзац. Выделение, которое начинается в одной колонке, а кончается вне её, не удаляется;
  выделение вокруг всего блока колонок удаляется как обычный блок.
- На узком экране (до 640 px) колонки встают друг под другом.

## Данные и команды

```ts
editor.dispatch({ type: 'insertBlock', payload: { flavour: 'block:columns', afterId } }); // две колонки
editor.dispatch({
  type: 'insertBlock',
  payload: { flavour: 'block:columns', afterId, props: { ratios: [1, 2, 1] } },
}); // три
editor.dispatch({ type: 'addColumn', payload: { blockId: columnsId, index: 1 } });
editor.dispatch({ type: 'removeColumn', payload: { blockId: columnsId, index: 0 } });
editor.dispatch({ type: 'setColumnRatios', payload: { blockId: columnsId, ratios: [1, 3] } });
editor.dispatch({ type: 'unwrapColumns', payload: { blockId: columnsId } });
```

`props.ratios` — доли ширины по порядку (важно только отношение; при сохранении приводятся к сумме 1, равные не хранятся); при
создании их число задаёт число колонок. Каждая команда — один шаг undo. Схема колонок пользуется общей возможностью
`BlockSchema.fillWhenEmpty` (блок, который появляется на месте последнего удалённого потомка: так же устроена заметка).

## Экспорт и вставка

`toHtml`, `toMarkdown` и `toPlainText` выводят содержимое колонок подряд, по колонкам слева направо, без самих колонок. Проверка снимка
находит блок колонок без колонок и пустую колонку, восстановление добавляет недостающее.

## Разметка

`<div data-inkbrick-block="columns">` с частями `grid` (сетка, ширины в `--inkbrick-columns`), `toolbar`; колонка —
`data-inkbrick-block="column"` с `divider` справа. Расстояние между колонками — `--inkbrick-columns-gap` (32px).
