# Inkbrick

[English](README.md) · **Русский**

Блочный редактор документов на TypeScript + React. Монорепозиторий на pnpm.

## Структура

| Пакет               | Назначение                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| `packages/document` | Модель документа (`BaseBlock`, `Document`), схемы блоков (zod), `SchemaRegistry`. Без React.    |
| `packages/store`    | `DocumentStore`, транзакции, `Change`-объекты с откатом, подписки на блоки.                     |
| `packages/engine`   | `Editor`, `Dispatcher`, команды (ввод, Enter, Backspace, форматирование, отступы), движки.      |
| `packages/react`    | `EditorProvider`, хуки, React-представления блоков, обработка ввода в `contenteditable`.        |
| `packages/styles`   | Стандартные стили: токены Fluent, `@layer` + `:where()`, стилизация только по `data-`атрибутам. |
| `apps/sandbox`      | Демо-приложение (Vite).                                                                         |

Поток данных: `React (beforeinput) → Editor.dispatch(intent) → команда → Transaction → Change → Document → подписчики store → React`.

Блоки в `Document` **иммутабельны**: любое изменение создаёт новый объект блока. На этом держатся `useSyncExternalStore` и `memo` в React.

## Документация

- [Настройка UI и пользовательские блоки](docs/ui-customization.md)
- [История изменений: undo/redo](docs/history.md)
- [Выделение через несколько блоков](docs/selection.md)
- [Slash-меню и типы блоков](docs/slash-menu.md)
- [Toolbar, ссылки, меню блока и перетаскивание](docs/toolbar-and-blocks.md)
- [Режим только чтения и `selected`](docs/read-only.md)
- [Копирование и вставка](docs/clipboard.md)
- [Изображения и callout](docs/images-and-callout.md)
- [Стилизация: data-атрибуты, слои, темы и токены](docs/styling.md)
- [Локализация: словари en/ru и подключение своих](docs/i18n.md)
- [Формулы: блок и встроенные, свой движок](docs/formulas.md)
- [Цвет текста, подсветка и выравнивание](docs/text-style.md)
- [Подсветка кода: языки, токены, свой подсветчик](docs/code-highlighting.md)
- [Правила вложенности, версии схем и `meta` блоков](docs/schema-rules.md)
- [Экспорт: Markdown, HTML, простой текст](docs/export.md)
- [Клавиатурные сочетания (keymap)](docs/keymap.md)
- Песочница (`pnpm dev`) — одна страница: переключатели «Редактирование / Чтение», Debug, язык, кнопки «Пример» и «Неизвестный блок»

## Команды

```bash
pnpm install
pnpm dev               # http://127.0.0.1:5173 (кнопка Debug — панель с дампом документа)
pnpm dev:phone         # то же, но доступно с телефона в той же Wi-Fi сети (см. ниже)
pnpm build             # production-сборка песочницы
pnpm typecheck         # tsc --noEmit по всему монорепозиторию
pnpm lint
pnpm test:unit         # vitest (document, store, engine, react)
pnpm test:coverage     # то же с покрытием и порогами (ниже порога — ошибка)
pnpm test:e2e          # Playwright в Chromium, Firefox и WebKit (нужен `pnpm test:e2e:install` один раз)
pnpm size              # бюджет размера бандла (минификация + gzip)
pnpm audit             # уязвимости зависимостей — должно быть 0
pnpm bench             # нагрузочные замеры: 1–100 тыс. блоков, 500 тыс. символов, вложенность (BENCH_SIZES=…)
pnpm docs:api          # справочник API (TypeDoc) в docs/api
PW_HEADED=1 pnpm test:e2e   # с видимым браузером
```

## Смотреть с телефона

1. Телефон и компьютер — в одной Wi-Fi сети.
2. `pnpm dev:phone` (или Docker: `docker compose up --watch` — порт уже открыт для сети).
3. Открыть на телефоне адрес из строки `Network:` в выводе Vite, например `http://192.168.0.17:5173`.
   Для Docker адрес тот же, IP — компьютера (`ipconfig` → IPv4).

Hot reload работает и на телефоне. Если страница не открывается — Windows спросит разрешение для Node.js
в брандмауэре при первом запуске: нужно разрешить для «частных сетей» (и сеть Wi-Fi должна быть частной).

## Сборка и публикация пакетов

В монорепозитории пакеты подключаются из исходников (`src/index.ts`): Vite, тесты и проверка типов
работают без сборки. Для npm каждый пакет собирается отдельно (tsup → ESM и `.d.ts` в `dist`):

```bash
pnpm build:packages                         # packages/*/dist
pnpm -r --filter "@inkbrick/*" publish --access public
```

При публикации (`pnpm publish` / `pnpm pack`) поля `main`, `types` и `exports` берутся из `publishConfig`
(указывают на `dist`), а `workspace:*` заменяется на версию пакета. Установленный из npm Inkbrick импортируется
как обычная ESM-библиотека, без настройки Vite: `import { Editor } from '@inkbrick/engine'`. `@inkbrick/styles`
публикуется как CSS без сборки.

## Docker

```bash
docker compose up --watch                          # dev-сервер с hot reload (+ пересборка при смене зависимостей) → http://localhost:5173
docker compose --profile test run --rm test        # unit-тесты
docker compose --profile e2e run --rm e2e          # e2e в Chromium против контейнера dev
```

Образ собирается из `Dockerfile` (цели `dev`, `test`, `e2e`, `prod`). Установка зависимостей идёт с `--frozen-lockfile`:
если меняете `package.json`, сначала выполните `pnpm install` локально и закоммитьте `pnpm-lock.yaml`.

## Известные ограничения

- Документация по API генерируется TypeDoc (`pnpm docs:api`); подробные руководства в `docs/` — на русском.
- На настоящих устройствах iOS и Android ввод проверен эмуляцией (CDP), а не на физических телефонах.
- `pnpm docs:api` не работает локально, если в пути к проекту есть скобки (ошибка TypeDoc на Windows); в CI работает.

Участие в разработке — [CONTRIBUTING.md](CONTRIBUTING.md), безопасность — [SECURITY.md](SECURITY.md),
изменения — [CHANGELOG.md](CHANGELOG.md), лицензия — [MIT](LICENSE).
