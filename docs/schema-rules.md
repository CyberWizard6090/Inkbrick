# Правила вложенности, версии схем и метаданные блоков

## Роли и правила вложенности

Каждая схема блока задаёт, где блок может лежать (`allowedParents`) и что может содержать (`allowedChildren`).
Проверка идёт в обе стороны: `schema.validateRelation(parent, child)` истинно, только если родитель разрешает
потомка **и** потомок разрешает родителя.

Чтобы не перечислять flavour'ы, блоку можно задать **роль** (`role`):

| Роль      | Что это                                       | Встроенные блоки                     |
| --------- | --------------------------------------------- | ------------------------------------ |
| `root`    | Корень документа; не лежит ни в каком блоке   | `block:page`                         |
| `hub`     | Контейнер содержимого без собственного текста | `block:note`                         |
| `content` | Обычный блок содержимого (по умолчанию)       | параграф, заголовок, список, и т. д. |

В списках разрешённых flavour'ов элемент `'role:hub'` означает «любой блок с этой ролью»:

```ts
const Section: BlockSchema = {
  flavour: 'block:section',
  role: 'hub',
  allowedParents: ['block:note'],
  allowedChildren: '*', // заголовки, цитаты и прочие блоки с allowedParents: ['role:hub'] поместятся внутрь
  // …
};
```

Правила применяются везде, где меняется дерево:

- команды движка (`insertBlock`, `convertBlock`, `moveBlock`, …) и сам `BlockEngine` (в том числе `move`);
- загрузка снимка: `deserializeDocument` / `validateSnapshot` сообщают `block "x" (block:heading) cannot be placed inside …`;
- вкладка «Проверка» Debug-панели песочницы.

Блоки с незарегистрированным flavour не проверяются: данные не теряются только из-за отсутствия схемы.

## Версии схем и миграции

`BlockSchema.version` (по умолчанию `1`) — версия формата props. При несовместимой смене props увеличьте её
и опишите `migrate`:

```ts
const Widget: BlockSchema = {
  flavour: 'block:widget',
  version: 2,
  // v1 хранил название в `label`, v2 — в `title`
  migrate: (props, fromVersion) => (fromVersion < 2 ? { title: props.label } : props),
  // …
};
```

- `serializeDocument(document, schema)` кладёт в снимок `schemaVersions` (flavour → версия). Без реестра
  версии не записываются.
- `deserializeDocument` сначала мигрирует props устаревших блоков (снимок без `schemaVersions` считается версией 1),
  затем проверяет результат `propsSchema`. Исключение в `migrate` превращается в `DocumentValidationError`.
- Снимок, сохранённый **более новой** версией схемы, отклоняется: `saved with schema version 3, newer than supported 2`.
- Входной снимок не изменяется; `migrateSnapshot(snapshot, schema)` доступна отдельно.

## Метаданные блоков (`meta`)

Редактор может записывать, когда и кем создан и изменён каждый блок. По умолчанию выключено.

```ts
new Editor({ meta: true }); // только время
new Editor({ meta: { user: () => currentUser.id } }); // и автор
```

Блок получает `meta: { createdAt, createdBy?, updatedAt, updatedBy? }` (время — мс, Unix epoch):

- создание блока и любая запись его содержимого или props обновляют `updatedAt/By`;
  `createdAt/By` сохраняются от первой версии блока;
- undo возвращает прежнюю `meta` вместе с блоком, redo записывает новую;
- перенос блока и изменение списка потомков родителя `meta` родителя не трогают.

`meta` входит в снимок и проверяется `validateSnapshot`.

## Регистрация схем

`registerBlock` добавляет новый тип и отказывает, если такой flavour уже есть; намеренная замена —
`replaceBlock` (только для существующего), удаление — `unregisterBlock`. `createSchemaRegistry(extraBlocks)`
заменяет встроенный блок с тем же flavour, но два определения одного нового типа — ошибка.

## Глубина вложенности

`MAX_NESTING_DEPTH` (40 уровней от корня) ограничивает Tab и перенос блоков: глубже редактор не вкладывает.
Перенос, который не углубляет блок (Shift+Tab), разрешён всегда — даже в документе, загруженном извне
и уже более глубоком.

## Повреждённые документы

`deserializeDocument` отклоняет снимок с нарушенной структурой (сироты, циклы, второй корень, блок не
в `children` своего родителя). Чтобы открыть такой документ, его можно восстановить:

```ts
import { repairSnapshot, deserializeDocument } from '@inkbrick/document';

const { snapshot, fixes } = repairSnapshot(raw, schema);
if (fixes.length) console.warn('Документ восстановлен:', fixes);
const document = deserializeDocument(snapshot, { schema });
```

`repairSnapshot` не меняет исходный снимок: убирает ссылки на пропавшие блоки и повторы, оставляет блок
в первом родителе, переносит недостижимые блоки в конец первой заметки, заменяет недопустимые props
значениями по умолчанию. Блоки неизвестных типов сохраняются.
