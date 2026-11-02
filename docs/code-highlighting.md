# Подсветка кода

Блок `block:code` подсвечивает синтаксис «из коробки»: встроенный подсветчик без зависимостей разбирает текст по языку
из `props.language` (его выбирают в списке над кодом). Текст документа при этом **не меняется**: токены — это
`<span data-inkbrick-token="тип">` вокруг кусков того же текста, поэтому курсор, выделение, undo, копирование и
экспорт работают как в обычном блоке.

```tsx
<EditorProvider editor={editor}>…</EditorProvider>          // встроенная подсветка
<EditorProvider editor={editor} highlighter={false}>…</…>   // без подсветки
<EditorProvider editor={editor} highlighter={myHighlighter}>…</…>
```

## Встроенные языки

TypeScript/JavaScript (`ts`, `tsx`, `js`, `jsx`), Python (`py`), Go, Rust (`rs`), Java, C, C++ (`c++`), Bash
(`sh`, `shell`, `zsh`), SQL, JSON, YAML (`yml`), HTML/XML (`xml`, `svg`; внутри — `<script>` и `<style>`),
CSS (`scss`, `less` — приблизительно), Markdown (`md`). Имя языка не зависит от регистра; `plain` и неизвестные языки
остаются без подсветки.

Встроенный подсветчик — быстрый лексический: комментарии, строки, числа, ключевые слова, типы, вызовы функций,
декораторы и т. п. Это не полноценный разбор (например, `${…}` внутри шаблонных строк не раскрашивается отдельно), а
текст длиннее 100 000 символов не подсвечивается: раскраска пересчитывается на каждое нажатие.

## Токены

| Тип         | Что это                                            |
| ----------- | -------------------------------------------------- |
| `keyword`   | ключевые слова; в Markdown — заголовки и выделение |
| `string`    | строки                                             |
| `comment`   | комментарии                                        |
| `number`    | числа, цвета в CSS                                 |
| `function`  | вызовы и имена функций; классы и id в CSS          |
| `type`      | типы и классы                                      |
| `constant`  | `true`, `null`, `None`…, HTML-сущности             |
| `builtin`   | встроенные функции и команды                       |
| `variable`  | переменные оболочки (`$HOME`)                      |
| `property`  | ключи JSON/YAML, свойства CSS                      |
| `tag`       | теги HTML, селекторы-теги CSS                      |
| `attribute` | атрибуты HTML, флаги команд (`--flag`)             |
| `meta`      | декораторы, директивы препроцессора, `#[derive]`   |
| `regex`     | литералы регулярных выражений                      |

Цвета — токены `--inkbrick-syntax-<тип>` в `@inkbrick/styles` (палитры VS Code Light+ и Dark+, меняются вместе с темой).
Переопределяются обычным CSS:

```css
:root {
  --inkbrick-syntax-keyword: #d6336c;
}

[data-inkbrick-token='comment'] {
  font-style: normal;
}
```

## Свой подсветчик

`CodeHighlighter` — функция `(code, language) => токены`, где токен — `{ from, to, type }` (смещения в символах).
Так подключаются Shiki, Prism или highlight.js: достаточно превратить их результат в диапазоны.

```ts
import type { CodeHighlighter } from '@inkbrick/react';

const highlighter: CodeHighlighter = (code, language) => {
  if (language !== 'todo') return highlightCode(code, language); // остальное — встроенным
  return [...code.matchAll(/TODO|FIXME/g)].map((m) => ({
    from: m.index!,
    to: m.index! + m[0].length,
    type: 'todo', // свой тип: раскрасьте `[data-inkbrick-token='todo']`
  }));
};
```

Редактор защищает себя от ошибок подсветчика: токены вне текста, пересекающиеся, пустые или с недопустимым типом
(допустимы строчные буквы, цифры и дефис) отбрасываются; исключение в подсветчике приводит к показу текста без
подсветки. Держите функцию стабильной: её смена перерисовывает все блоки кода.

## Оформление блока и копирование

Над кодом — панель: кнопка сворачивания, выбор языка, справа — подпись и копирование (`data-inkbrick-part="copy"`;
после нажатия `data-state="copied"`). Язык выбирается во всплывающем списке (`data-inkbrick-ui="select"`) — с
клавиатуры тоже: стрелки, Home/End, первая буква названия, Enter, Esc. Строки панели переводятся (`block.code.*`).

- **Сворачивание** (`collapse`) прячет код с анимацией высоты (`--inkbrick-duration-slow`, отключается при
  `prefers-reduced-motion`) и пишет в props `collapsed: true`; у блока появляется `data-collapsed`, на панели —
  число строк (`summary`). Свёрнутый код не редактируется, каретка из него уходит. В режиме чтения сворачивание
  локальное и документ не меняет.
- **Подпись** (`caption-toggle`, затем поле `caption`) сохраняется в props `caption` по Enter или потере фокуса
  одной записью в истории; пустое поле исчезает. В экспорте HTML код с подписью — `<figure>` с `<figcaption>`, в
  Markdown подпись идёт курсивом после блока.

Оба поля необязательные: у обычного блока props остаются `{ language }`. Вид блока — токены
`--inkbrick-bg-3`, `--inkbrick-stroke-2`, `--inkbrick-radius-surface`, моноширинный шрифт — `--inkbrick-font-mono`.
